// R3-M1 (C.3): the business research seam. One file (business/research-effort.ts, a leaf) turns what a company knows about its own
// research into the inputs of the Effort engine, and `launchP` is cut into the two parts the engine needs (the skill part and the
// research team's part) with exactly the value it had.
//
// What this file pins: `launchP` is `clampN(launchSkill + launchTeam, .1, .9)` bit for bit over a 60-point grid and over the oracle's
// rows (test/fixtures/effort-parity.json, recorded on v5.0.0); `researchState` is a read (no write, no draw, a deep-frozen game is
// fine); an owner-run company is the player's own work (`who: 'you'`), a hired-CEO or NPC company is steady, ambition 50 and fatigue
// 0 whatever the board mandate says (a push with nobody to tire would be a free edge); the company's know-how map and the world's
// frontier feed the quote and nothing else does; `bookResearch` banks a failure in the company's own map (the player's ambition
// still moves on an owner-run win), does nothing for an NPC company, and leaves a win with no `knowHow` key at all so a default
// life saves byte for byte what v5.0.0 saved; `BizState.knowHow` and `RdProject.fx` are optional, validated and bounded.
//
// No pinned seed: every life is the test kits' own, with a tuple of arguments.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { quote } from '../src/game/effort/engine'
import { newFx, normalizeFx } from '../src/game/effort/fx'
import { KNOW_HOW_FIELDS, KNOW_MAX, KNOW_ODDS_MAX, WIN_SHIFT } from '../src/game/effort/limits'
import { ambitionOf, blankYou, readYou, writeYou } from '../src/game/effort/persona'
import { resolve } from '../src/game/effort/step'
import { defineTask } from '../src/game/effort/task'
import type { Outcome, Task } from '../src/game/effort/types'
import { launchP, researchState } from '../src/game/business/rd'
import {
  bookResearch,
  frontierFieldOf,
  frontierInputs,
  launchSkill,
  launchTeam,
  ownerRuns,
  researchActor,
  researchInputs,
  researchPeople,
  type ResearchSnap,
} from '../src/game/business/research-effort'
import { TEAM_ODDS } from '../src/game/business/lab-data'
import { LAB_LIMITS, teamPower } from '../src/game/business/lab-state'
import { bizOf, normalizeBiz, readProjects, type BizState } from '../src/game/business/state'
import { clampN } from '../src/game/business/util'
import type { Json } from '../src/game/types'
import { applyDisclosure } from '../src/game/world/frontier'
import '../src/game/world/shards'
import { cycleComponents, readImportGraph } from './arch-kit'
import { PARITY_DIGITS, probe, readOracle, roundSig, setCompany, tradeFixture } from './effort-parity-kit'
import { deepFreeze } from './fuzz-kit'
import { labGame, noDraw, patchLab } from './lab-kit'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)
const SEAM = 'src/game/business/research-effort.ts'

/** A plain project of the stored kind, for the state cases. */
const projectOf = (over: Record<string, Json> = {}): Record<string, Json> => ({ id: 'rd.Fizz', name: 'Fizz', budget: 1000, years: 2, progress: 0, odds: 0.5, boost: 0.05, started: 2030, ...over })

/** A task of the product shape, in a made-up field. */
const task = (field = 'rd.fizz', over: Partial<Parameters<typeof defineTask>[0]> = {}): Task => defineTask({ field, mode: 'project', cost: 50_000, ...over })

const failed = (done = 0.5): Outcome => ({ kind: 'fail', margin: -20, cause: 'deadEnd', done })
const won = (): Outcome => ({ kind: 'works', margin: 20, cause: null, done: 1 })

describe('launchP is the skill part and the team part, with the value it had', () => {
  it('is clampN(launchSkill + launchTeam) over a 60-point grid, owner-run and hired', () => {
    const f = tradeFixture('restaurant')
    const skills = [5, 30, 55, 80, 100]
    const qualities = [0, 50, 100]
    const teams = [0, 1, 3, 6]
    let n = 0
    for (const skill of skills) for (const quality of qualities) for (const scientists of teams) {
      setCompany(f.g, f.b, { manager: skill, quality, scientists, staff: n % 2, projects: 0 })
      const s = researchState(f.g, f.b)
      expect(launchP(f.g, f.b), `hired ${skill}/${quality}/${scientists}`).toBe(clampN(launchSkill(s) + launchTeam(s.scientists), 0.1, 0.9))
      n++
    }
    expect(n).toBe(60)
    for (const scientists of teams) for (const quality of qualities) {
      setCompany(f.g, f.b, { quality, scientists, staff: 1, projects: 0 })
      const s = researchState(f.g, f.b)
      expect(launchP(f.g, f.b), `owner ${quality}/${scientists}`).toBe(clampN(launchSkill(s) + launchTeam(s.scientists), 0.1, 0.9))
    }
  })

  it('equals the oracle rows of v5.0.0 (launchP.p of the rd grid), to the last digit it was recorded at', () => {
    const oracle = new Map(readOracle('rd').rows.flatMap((r) => (r.extra?.['launchP.p'] !== undefined ? [[r.id, r.extra['launchP.p']] as const] : [])))
    const rows = probe('rd')
    let seen = 0
    for (const row of rows) {
      const want = oracle.get(row.id)
      if (want === undefined) continue
      expect(row.extra?.['launchP.p'], row.id).toBe(want)
      seen++
    }
    expect(seen).toBe(oracle.size)
    expect(seen).toBeGreaterThan(300)
    expect(PARITY_DIGITS).toBe(9)
    expect(roundSig(launchSkill({ ...snap(), skill: 50, quality: 50, qualityStaff: 0 }) + launchTeam(0))).toBe(roundSig(0.25 + 50 / 250 + 50 / 300))
  })

  it('keeps the clamp: a hopeless company sits at .1 and a brilliant one at .9, a team of any size at its limit', () => {
    expect(clampN(launchSkill({ ...snap(), skill: 0, quality: 0, qualityStaff: 0 }) + launchTeam(0), 0.1, 0.9)).toBe(0.25)
    const f = tradeFixture('restaurant')
    setCompany(f.g, f.b, { manager: 100, quality: 100, scientists: 6, staff: 1, projects: 0 })
    expect(launchP(f.g, f.b)).toBe(0.9)
  })

  it('launchTeam is TEAM_ODDS times teamPower, bounded by the team limit and 0 for anything that is not a count', () => {
    expect(launchTeam(0)).toBe(0)
    expect(launchTeam(1)).toBe(TEAM_ODDS * teamPower(1))
    expect(launchTeam(3)).toBe(TEAM_ODDS * teamPower(3))
    expect(launchTeam(LAB_LIMITS.team + 50)).toBe(launchTeam(LAB_LIMITS.team))
    expect(launchTeam(Number.NaN)).toBe(0)
    expect(launchTeam(-4)).toBe(0)
  })

  it('launchSkill is the terms of rd.ts: .25 + skill/250 + quality/300 + .1 * the quality staff', () => {
    const s: ResearchSnap = { ...snap(), skill: 70, quality: 40, qualityStaff: 0.6 }
    expect(launchSkill(s)).toBe(0.25 + 70 / 250 + 40 / 300 + 0.1 * 0.6)
  })
})

/** A snap with neutral numbers, to change one at a time. */
function snap(over: Partial<ResearchSnap> = {}): ResearchSnap {
  return { year: 2031, skill: 50, quality: 50, qualityStaff: 0, scientists: 0, managed: false, managerSkill: 0, morale: 65, mandate: 'balanced', ...over }
}

describe('researchState reads the company, writes nothing and draws nothing', () => {
  it('names the numbers launchP is made of, and the hired manager and the mandate', () => {
    const f = tradeFixture('restaurant')
    setCompany(f.g, f.b, { manager: 70, quality: 40, scientists: 2, staff: 1, projects: 0 })
    f.b.board = { v: 1, mandate: 'growth' } as unknown as Json
    f.b.morale = 33
    const s = researchState(f.g, f.b)
    expect(s.year).toBe(f.g.year)
    expect(s.skill).toBe(70)
    expect(s.quality).toBe(40)
    expect(s.scientists).toBe(2)
    expect(s.qualityStaff).toBeGreaterThan(0.3)
    expect(s.managed).toBe(true)
    expect(s.managerSkill).toBe(70)
    expect(s.morale).toBe(33)
    expect(s.mandate).toBe('growth')
    f.b.board = { v: 1, mandate: 'nonsense' } as unknown as Json
    expect(researchState(f.g, f.b).mandate).toBe('balanced')
  })

  it('an owner-run company is not managed, and a dead owner is', () => {
    const f = tradeFixture('restaurant')
    setCompany(f.g, f.b, { quality: 50, scientists: 0, staff: 0, projects: 0 })
    expect(researchState(f.g, f.b).managed).toBe(false)
    expect(researchState(f.g, f.b).managerSkill).toBe(0)
    expect(ownerRuns(f.g, f.b)).toBe(true)
    f.g.character.alive = false
    expect(researchState(f.g, f.b).managed).toBe(true)
    expect(ownerRuns(f.g, f.b)).toBe(false)
  })

  it('writes no board (boardOf would), draws nothing, and reads a deep-frozen game', () => {
    const f = labGame(5, 'restaurant', { year: 2030 })
    expect(f.b.board).toBeUndefined()
    expect(noDraw(f.g, () => researchState(f.g, f.b))).toBe(true)
    expect(f.b.board).toBeUndefined()
    deepFreeze(f.g)
    const s = researchState(f.g, f.b)
    expect(s.year).toBe(f.g.year)
    expect(() => researchInputs(f.g, s, f.a, 'rd.fizz', 1)).not.toThrow()
    expect(() => launchP(f.g, f.b)).not.toThrow()
  })
})

describe('the crew the engine is told about', () => {
  it('is the CEO or owner, the quality staff and one worker for each scientist', () => {
    const none = researchPeople(snap({ qualityStaff: 0, scientists: 0 }))
    expect(none).toEqual([{ fte: 1, skill: 50, morale: 65 }])
    const crew = researchPeople(snap({ skill: 80, morale: 40, qualityStaff: 0.4, scientists: 3 }))
    expect(crew).toHaveLength(1 + 1 + 3)
    expect(crew[0]).toEqual({ fte: 1, skill: 80, morale: 40 })
    expect(crew.slice(2).every((w) => w.fte === 1 && w.morale === 40)).toBe(true)
  })

  it('carries the quality staff as skilled labor equal to its power, and never more than three people', () => {
    for (const power of [0.2, 1, 1.6, 2.5]) {
      const staff = researchPeople(snap({ qualityStaff: power })).slice(1)
      expect(staff).toHaveLength(1)
      expect(staff[0]!.fte * (staff[0]!.skill / 100)).toBeCloseTo(power, 1)
      expect(staff[0]!.fte).toBeLessThanOrEqual(3)
      expect(staff[0]!.skill).toBeLessThanOrEqual(100)
    }
  })

  it('is bounded whatever it is told: the team limit, skills and morale in range, nothing that is not a number', () => {
    const wild = researchPeople(snap({ skill: Number.NaN, morale: 9999, qualityStaff: 1e9, scientists: 1e9 }))
    expect(wild.length).toBeLessThanOrEqual(2 + LAB_LIMITS.team)
    for (const w of wild) {
      expect(Number.isFinite(w.skill) && w.skill >= 0 && w.skill <= 100).toBe(true)
      expect(Number.isFinite(w.morale) && w.morale >= 0 && w.morale <= 100).toBe(true)
      expect(w.fte).toBeGreaterThan(0)
      expect(w.fte).toBeLessThanOrEqual(3)
    }
  })
})

describe('who does the research', () => {
  it('an owner-run company is the player: who is you, with the persona posture, ambition and fatigue', () => {
    const f = tradeFixture('restaurant')
    setCompany(f.g, f.b, { quality: 50, scientists: 1, staff: 0, projects: 0 })
    const y = readYou(f.g)
    writeYou(f.g, { ...y, posture: 'push', effective: 'push' })
    const s = researchState(f.g, f.b)
    const actor = researchActor(f.g, s, f.a)
    expect(actor.you).toBe(true)
    expect(actor.posture).toBe('push')
    expect(actor.ambition).toBe(ambitionOf(f.g))
    expect(actor.fatigue).toBe(0)
    const input = researchInputs(f.g, s, f.a, 'rd.fizz', 1)
    expect(input.who).toBe('you')
    expect(input.k).toBe(1)
    expect(input.people).toEqual(actor.people)
  })

  it('a hired-CEO company is steady, ambition 50, fatigue 0, whatever the mandate and whatever the player does', () => {
    const f = tradeFixture('restaurant')
    writeYou(f.g, { ...readYou(f.g), posture: 'push', effective: 'push' })
    f.g.flags.household = { owner: `${f.g.generation}:${f.g.character.id}`, fatigue: 70 } as unknown as Json
    for (const mandate of ['growth', 'balanced', 'profit', 'cash'] as const) {
      setCompany(f.g, f.b, { manager: 60, quality: 50, scientists: 1, staff: 0, projects: 0 })
      f.b.board = { v: 1, mandate } as unknown as Json
      const s = researchState(f.g, f.b)
      expect(s.mandate).toBe(mandate)
      const actor = researchActor(f.g, s, f.a)
      expect(actor.you).toBe(false)
      const input = researchInputs(f.g, s, f.a, 'rd.fizz', 2)
      expect(input.who, mandate).toBeUndefined()
      expect(input.posture, mandate).toBe('steady')
      expect(input.ambition, mandate).toBe(50)
      expect(input.fatigue, mandate).toBe(0)
      expect(input.k).toBe(2)
    }
  })

  it('an NPC company (no asset) is steady and neutral, and has no know-how of its own', () => {
    const f = tradeFixture('restaurant')
    setCompany(f.g, f.b, { quality: 50, scientists: 0, staff: 0, projects: 0 })
    const s = researchState(f.g, f.b)
    const input = researchInputs(f.g, s, null, 'rd.fizz', 1)
    expect(input.who).toBeUndefined()
    expect(input.posture).toBe('steady')
    expect(input.ambition).toBe(50)
    expect(input.fatigue).toBe(0)
    expect(input.knowledge).toBe(0)
  })

  it('a hired default company quotes exactly what the neutral actor does, and an owner of high ambition does not', () => {
    const f = tradeFixture('restaurant')
    const t = task('rd.fizz', { baseYears: 3, p0: 0.5 })
    setCompany(f.g, f.b, { manager: 60, quality: 50, scientists: 0, staff: 0, projects: 0 })
    const hired = quote(f.g, t, researchInputs(f.g, researchState(f.g, f.b), f.a, t.field, 1))
    const plain = quote(f.g, t, { k: 1 })
    expect(hired.p).toBe(plain.p)
    expect(hired.years).toBe(plain.years)
    expect(hired.effort.rho).toBe(1)
    expect(hired.reasons).toEqual([])
    setCompany(f.g, f.b, { quality: 50, scientists: 0, staff: 0, projects: 0 })
    f.g.character.hidden.willpower = 100
    f.g.character.hidden.discipline = 100
    const driven = quote(f.g, t, researchInputs(f.g, researchState(f.g, f.b), f.a, t.field, 1))
    expect(driven.effort.rho).toBeGreaterThan(1)
  })
})

describe('the company know-how map feeds the quote', () => {
  it('reads the field of the map, 0 for another field and for a map that is not one', () => {
    const f = tradeFixture('restaurant')
    setCompany(f.g, f.b, { manager: 60, quality: 50, scientists: 0, staff: 0, projects: 0 })
    f.b.knowHow = { 'rd.fizz': 40, 'rd.soda': 10 }
    const s = researchState(f.g, f.b)
    expect(researchInputs(f.g, s, f.a, 'rd.fizz', 1).knowledge).toBe(40)
    expect(researchInputs(f.g, s, f.a, 'rd.other', 1).knowledge).toBe(0)
    ;(f.b as unknown as Record<string, unknown>).knowHow = 'junk'
    expect(researchInputs(f.g, s, f.a, 'rd.fizz', 1).knowledge).toBe(0)
    delete f.b.knowHow
  })

  it('shows as a labelled know-how line of at most 15 points however much the company has banked', () => {
    const f = tradeFixture('restaurant')
    setCompany(f.g, f.b, { manager: 60, quality: 50, scientists: 0, staff: 0, projects: 0 })
    const t = task('rd.fizz', { p0: 0.4 })
    const s = researchState(f.g, f.b)
    const base = quote(f.g, t, researchInputs(f.g, s, f.a, t.field, 1))
    f.b.knowHow = { 'rd.fizz': KNOW_MAX }
    const full = quote(f.g, t, researchInputs(f.g, s, f.a, t.field, 1))
    expect(full.p - base.p).toBeGreaterThan(0)
    expect((full.p - base.p) * 100).toBeLessThanOrEqual(KNOW_ODDS_MAX + 1e-9)
    const line = full.reasons.find((r) => r.key === 'know')
    expect(line?.pts).toBeGreaterThan(0)
    expect(line!.pts).toBeLessThanOrEqual(KNOW_ODDS_MAX)
    delete f.b.knowHow
  })
})

describe('the frontier feeds the quote (the only caller of frontierTerms in R3)', () => {
  it('maps a trade to its field, a capability to its own, and a capability wins over the trade of the same name', () => {
    expect(frontierFieldOf('fusion')).toBe('fusion')
    expect(frontierFieldOf('aiLab')).toBe('ai')
    expect(frontierFieldOf('restaurant')).toBeNull()
    expect(frontierFieldOf('aiLab', 'reasoning')).toBe('ai.reasoning')
    expect(frontierFieldOf('robotics')).toBe('automation')
    expect(frontierFieldOf('robotics', 'robotics')).toBe('ai.robotics')
    expect(frontierFieldOf('fusion', 'not-a-capability')).toBe('fusion')
    expect(frontierFieldOf('')).toBeNull()
  })

  it('is zero without a shard, for a null field and for a field no one has pushed', () => {
    const f = tradeFixture('restaurant')
    expect(frontierInputs(f.g, 'fusion')).toEqual({ spill: 0, rival: 0 })
    expect(frontierInputs(f.g, null)).toEqual({ spill: 0, rival: 0 })
    expect(f.g.world?.frontier).toBeUndefined()
  })

  it('gives public research and rival pressure of the field, bounded at 18 and 8, and none of another field', () => {
    const f = tradeFixture('restaurant')
    const y = f.g.year
    expect(applyDisclosure(f.g, { field: 'fusion', year: y, size: 1, origin: 'wave:m1', by: 'you', shield: 'open' }).applied).toBe(true)
    for (let i = 0; i < 6; i++) applyDisclosure(f.g, { field: 'fusion', year: y - (i % 3), size: 0.1, origin: `rv:fusion:${i}`, by: 'rival', shield: 'open' })
    const t = frontierInputs(f.g, 'fusion')
    expect(t.spill).toBeGreaterThan(0)
    expect(t.spill).toBeLessThanOrEqual(18)
    expect(t.rival).toBeGreaterThan(0)
    expect(t.rival).toBeLessThanOrEqual(8)
    expect(frontierInputs(f.g, 'space')).toEqual({ spill: 0, rival: 0 })
    expect(frontierInputs(f.g, frontierFieldOf('restaurant'))).toEqual({ spill: 0, rival: 0 })
  })

  it('researchInputs adds them only for the field it is told, and quote prints them as public research and rival pressure', () => {
    const f = tradeFixture('restaurant')
    const y = f.g.year
    applyDisclosure(f.g, { field: 'fusion', year: y, size: 1, origin: 'wave:m2', by: 'you', shield: 'open' })
    applyDisclosure(f.g, { field: 'fusion', year: y, size: 0.1, origin: 'rv:fusion:a', by: 'rival', shield: 'open' })
    setCompany(f.g, f.b, { manager: 60, quality: 50, scientists: 0, staff: 0, projects: 0 })
    const s = researchState(f.g, f.b)
    const t = task('dt.fusion', { p0: 0.5 })
    const plain = researchInputs(f.g, s, f.a, t.field, 1)
    expect(plain.spill).toBe(0)
    expect(plain.rival).toBe(0)
    const fed = researchInputs(f.g, s, f.a, t.field, 1, 0, 'fusion')
    expect(fed.spill).toBeGreaterThan(0)
    expect(fed.rival).toBeGreaterThan(0)
    const q = quote(f.g, t, fed)
    expect(q.reasons.find((r) => r.key === 'spill')?.label).toBe('public research')
    expect(q.reasons.find((r) => r.key === 'rival')?.label).toBe('rival pressure')
    expect(noDraw(f.g, () => researchInputs(f.g, s, f.a, t.field, 1, 0, 'fusion'))).toBe(true)
  })
})

describe('bookResearch banks what a run taught', () => {
  it('does nothing for an NPC company: no asset, the flags byte for byte, nothing returned', () => {
    const f = tradeFixture('restaurant')
    const before = JSON.stringify(f.g.flags)
    const rng = f.g.rng
    expect(bookResearch(f.g, null, task(), failed())).toBeNull()
    expect(JSON.stringify(f.g.flags)).toBe(before)
    expect(f.g.rng).toBe(rng)
  })

  it('banks a failure in the company map, by reference, and the odds it buys stay under 15 points', () => {
    const f = tradeFixture('restaurant')
    setCompany(f.g, f.b, { manager: 60, quality: 50, scientists: 0, staff: 0, projects: 0 })
    const t = task('rd.fizz')
    const r = bookResearch(f.g, f.a, t, failed(0.5), { fx: newFx(f.g.year) })
    expect(r).not.toBeNull()
    expect(r!.learned).toBeGreaterThan(0)
    const b = bizOf(f.g, f.a)
    expect(b.knowHow?.['rd.fizz']).toBe(r!.knowledge)
    expect(r!.knowledge).toBeGreaterThan(0)
    // The next quote for that field is higher by more than 0 and at most 15 points; another field's is not.
    const s = researchState(f.g, b)
    const next = quote(f.g, t, researchInputs(f.g, s, f.a, t.field, 1))
    b.knowHow = undefined
    const prior = quote(f.g, t, researchInputs(f.g, s, f.a, t.field, 1))
    expect((next.p - prior.p) * 100).toBeGreaterThan(0)
    expect((next.p - prior.p) * 100).toBeLessThanOrEqual(KNOW_ODDS_MAX)
    delete b.knowHow
  })

  it('a hired-CEO company banks too, and the player ambition does not move; an owner-run win lifts it', () => {
    const f = tradeFixture('restaurant')
    setCompany(f.g, f.b, { manager: 60, quality: 50, scientists: 0, staff: 0, projects: 0 })
    const flags = JSON.stringify(f.g.flags)
    bookResearch(f.g, f.a, task('rd.fizz'), failed(0.8))
    expect(bizOf(f.g, f.a).knowHow?.['rd.fizz']).toBeGreaterThan(0)
    bookResearch(f.g, f.a, task('rd.soda'), won())
    expect(bizOf(f.g, f.a).knowHow?.['rd.soda']).toBeUndefined()
    expect(JSON.stringify(f.g.flags)).toBe(flags)
    expect(readYou(f.g).shift).toBe(0)
    setCompany(f.g, f.b, { quality: 50, scientists: 0, staff: 0, projects: 0 })
    bookResearch(f.g, f.a, task('rd.cola'), won())
    expect(readYou(f.g).shift).toBe(WIN_SHIFT)
    expect(readYou(f.g)).not.toEqual(blankYou(f.g))
  })

  it('a win leaves the company with no knowHow key at all, so the saved shape is the one it had', () => {
    const f = tradeFixture('restaurant')
    setCompany(f.g, f.b, { manager: 60, quality: 50, scientists: 0, staff: 0, projects: 0 })
    const b = bizOf(f.g, f.a)
    expect('knowHow' in b).toBe(false)
    const keys = Object.keys(b).join(',')
    bookResearch(f.g, f.a, task('rd.fizz'), won())
    expect('knowHow' in b).toBe(false)
    expect(Object.keys(b).join(',')).toBe(keys)
    bookResearch(f.g, f.a, task('rd.fizz'), failed(0))
    expect('knowHow' in b).toBe(false)
  })

  it('a second step of the same work in the same year is a replay and banks nothing more', () => {
    const f = tradeFixture('restaurant')
    setCompany(f.g, f.b, { manager: 60, quality: 50, scientists: 0, staff: 0, projects: 0 })
    const fx = newFx(f.g.year)
    const once = bookResearch(f.g, f.a, task('rd.fizz'), failed(0.6), { fx })
    const level = bizOf(f.g, f.a).knowHow?.['rd.fizz']
    const again = bookResearch(f.g, f.a, task('rd.fizz'), failed(0.6), { fx })
    expect(once!.replay).toBe(false)
    expect(again!.replay).toBe(true)
    expect(bizOf(f.g, f.a).knowHow?.['rd.fizz']).toBe(level)
    expect(fx.setbacks).toBe(1)
  })

  it('never passes 100 in a field over 200 failures, and never holds more than 40 fields', () => {
    const f = tradeFixture('restaurant')
    setCompany(f.g, f.b, { manager: 60, quality: 50, scientists: 0, staff: 0, projects: 0 })
    for (let i = 0; i < 200; i++) bookResearch(f.g, f.a, task('rd.fizz'), failed(1))
    expect(bizOf(f.g, f.a).knowHow?.['rd.fizz']).toBeLessThanOrEqual(KNOW_MAX)
    for (let i = 0; i < 80; i++) bookResearch(f.g, f.a, task(`rd.f${i}`), failed(1))
    expect(Object.keys(bizOf(f.g, f.a).knowHow ?? {}).length).toBeLessThanOrEqual(KNOW_HOW_FIELDS)
  })

  it('draws nothing and moves no money', () => {
    const f = tradeFixture('restaurant')
    setCompany(f.g, f.b, { manager: 60, quality: 50, scientists: 0, staff: 0, projects: 0 })
    const cash = f.b.cash
    const money = f.g.character.money
    expect(noDraw(f.g, () => bookResearch(f.g, f.a, task('rd.fizz'), failed()))).toBe(true)
    expect(f.b.cash).toBe(cash)
    expect(f.g.character.money).toBe(money)
  })

  it('takes the outcome of the engine`s own resolve, so a caller that draws once gets one result', () => {
    const f = tradeFixture('restaurant')
    setCompany(f.g, f.b, { manager: 60, quality: 50, scientists: 0, staff: 0, projects: 0 })
    const t = task('rd.fizz', { p0: 0.5 })
    const q = quote(f.g, t, researchInputs(f.g, researchState(f.g, f.b), f.a, t.field, 1))
    const lost = resolve(q, 0.99)
    expect(lost.kind).toBe('fail')
    const r = bookResearch(f.g, f.a, t, lost, { fx: newFx(f.g.year), k: 1 })
    expect(r!.reveals).toHaveLength(1)
    expect(r!.reveals[0]!.field).toBe('rd.fizz')
  })
})

describe('BizState.knowHow is optional, validated and bounded', () => {
  const stored = (over: Record<string, Json>): Record<string, Json> => {
    const f = labGame(9, 'restaurant', { year: 2030 })
    return { ...(JSON.parse(JSON.stringify(f.b)) as Record<string, Json>), ...over }
  }

  it('an old save has none, and the key is absent after a read', () => {
    const b = normalizeBiz(stored({}), 2030)
    expect('knowHow' in b).toBe(false)
    expect('knowHow' in normalizeBiz(stored({ knowHow: {} }), 2030)).toBe(false)
    expect('knowHow' in normalizeBiz(stored({ knowHow: 'x' }), 2030)).toBe(false)
    expect('knowHow' in normalizeBiz(stored({ knowHow: [1, 2] }), 2030)).toBe(false)
  })

  it('keeps good fields, cuts values to 0 to 100, and drops bad keys, bad values and fields under the floor', () => {
    // JSON.parse makes a real own `__proto__` key, as a hostile save would; 'constructor' is a field like any other.
    const hostile = JSON.parse('{"rd.fizz":41.234,"rd.big":9999,"rd.neg":-5,"rd.tiny":0.1,"rd.nan":"x","Bad Key":5,"__proto__":{"polluted":50},"constructor":12}') as Json
    const b = normalizeBiz(stored({ knowHow: hostile }), 2030)
    expect(b.knowHow).toEqual({ constructor: 12, 'rd.big': 100, 'rd.fizz': 41.23 })
    expect(Object.getPrototypeOf(b.knowHow)).toBe(Object.prototype)
    expect((b.knowHow as Record<string, unknown>).polluted).toBeUndefined()
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('holds at most 40 fields, the biggest', () => {
    const many: Record<string, Json> = {}
    for (let i = 0; i < 90; i++) many[`rd.f${String(i).padStart(2, '0')}`] = 10 + i
    const b = normalizeBiz(stored({ knowHow: many }), 2030)
    const keys = Object.keys(b.knowHow ?? {})
    expect(keys).toHaveLength(KNOW_HOW_FIELDS)
    expect(keys).toContain('rd.f89')
    expect(keys).not.toContain('rd.f00')
  })

  it('round-trips through JSON as itself, and reading it again changes nothing', () => {
    const a = normalizeBiz(stored({ knowHow: { 'ops.cost': 12.5, 'dt.fusion': 33 } }), 2030)
    const b = normalizeBiz(JSON.parse(JSON.stringify(a)) as Record<string, Json>, 2030)
    expect(b).toEqual(a)
    expect(b.knowHow).toEqual({ 'dt.fusion': 33, 'ops.cost': 12.5 })
  })
})

describe('RdProject.fx is optional, validated and bounded', () => {
  it('an old project has none, and a good one comes back as the record it was', () => {
    const [old] = readProjects([projectOf()])
    expect(old && 'fx' in old).toBe(false)
    const fx = { ...newFx(2030), progress: 0.5, setbacks: 1, insight: 6, spent: 1000 }
    const [kept] = readProjects([projectOf({ fx: fx as unknown as Json })])
    expect(kept!.fx).toEqual(normalizeFx(fx))
    expect(kept!.fx!.v).toBe(1)
    expect(Object.keys(kept!.fx!)).toEqual(Object.keys(newFx(2030)))
  })

  it('cuts every number to its cap', () => {
    const [p] = readProjects([projectOf({ fx: { v: 1, progress: 7, quality: 1e9, spent: 1e30, hours: 1e9, setbacks: 500, insight: 400, fatigue: 900, last: 1e9 } as unknown as Json })])
    expect(p!.fx).toEqual({ v: 1, progress: 1, quality: 10000, spent: 1e13, hours: 100000, setbacks: 99, insight: 100, fatigue: 100, last: 9999 })
  })

  it('drops a damaged one: not a record, an empty one, junk numbers', () => {
    for (const bad of ['junk', 5, null, true, [1, 2, 3], {}, { progress: 'x', last: 'y' }]) {
      const [p] = readProjects([projectOf({ fx: bad as Json })])
      expect(p && 'fx' in p, JSON.stringify(bad)).toBe(false)
    }
  })

  it('survives a hostile record: a __proto__ key speaks for nothing', () => {
    const hostile = JSON.parse('{"v":1,"progress":0.4,"last":2030,"__proto__":{"progress":1,"polluted":true}}') as Json
    const [p] = readProjects([projectOf({ fx: hostile })])
    expect(p!.fx!.progress).toBe(0.4)
    expect((p!.fx as unknown as Record<string, unknown>).polluted).toBeUndefined()
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('goes through normalizeBiz with the project, and an old company keeps its project shape', () => {
    const f = labGame(9, 'restaurant', { year: 2030 })
    const raw = JSON.parse(JSON.stringify(f.b)) as Record<string, Json>
    raw.rd = [projectOf({ fx: { ...newFx(2030), progress: 1, setbacks: 2 } as unknown as Json }), projectOf({ id: 'rd.Cola', name: 'Cola' })]
    const b = normalizeBiz(raw, 2030)
    expect(b.rd![0]!.fx!.setbacks).toBe(2)
    expect('fx' in b.rd![1]!).toBe(false)
    expect(normalizeBiz(JSON.parse(JSON.stringify(b)) as Record<string, Json>, 2030)).toEqual(b)
  })
})

describe('the seam is a leaf of the business import graph', () => {
  it('is in no import cycle and imports no module of the business cycle', async () => {
    const g = await readImportGraph(ROOT)
    const comps = cycleComponents(g)
    const inCycle = new Set(comps.flat())
    expect(g.has(SEAM)).toBe(true)
    expect(inCycle.has(SEAM)).toBe(false)
    for (const to of g.get(SEAM) ?? []) expect(inCycle.has(to), `${SEAM} imports ${to}, a member of an import cycle`).toBe(false)
    expect([...(g.get('src/game/business/rd.ts') ?? [])]).toContain(SEAM)
  })

  it('reads the engine through effort/ and the frontier through world/frontier-terms, and holds to the voice rules', () => {
    const text = readFileSync(join(ROOT, SEAM), 'utf8')
    expect(text).toMatch(/from '\.\.\/effort\//)
    expect(text).toMatch(/from '\.\.\/world\/frontier-terms'/)
    expect(DASH.test(text)).toBe(false)
    expect(text).not.toMatch(/\bg\.rng\b|\brand\(|\bchance\(/)
  })
})

// Keep the kit helper that patches a lab honest: a research team set through it is what researchState counts.
describe('the research team is the lab team', () => {
  it('counts the scientists of the stored lab', () => {
    const f = labGame(5, 'restaurant', { year: 2030 })
    patchLab(f.b as BizState, (d) => {
      d.team = [f.g.year - 1, f.g.year - 2, f.g.year - 3]
    })
    expect(researchState(f.g, f.b).scientists).toBe(3)
    expect(launchP(f.g, f.b)).toBe(clampN(launchSkill(researchState(f.g, f.b)) + launchTeam(3), 0.1, 0.9))
  })
})
