// R4-E12 (D.4, X29, X31, X40, X54, C12; section 3.1 "Acts, secrets, feuds, staff"): the feud ladder. A feud is a rung `q` (1 cold, 2 gossip, 3 sabotage,
// 4 legal) on the edge person > player. Once a year, inside the one `society.acts` entry, `stepFeuds` ends the feuds that are over, plays the rung
// each live feud is on, may raise it, and may start new ones; at the rung changes that matter it asks the player a question (`A Falling Out`), if the
// year has a family choice to spare and the will has not used the year's scene. What the file proves, in the order of the plan:
//
//   1. The cause byte of `q`: a code, the calm years and the year tick in one byte (the only fields a feud has are rung, since and cause).
//   2. Starting: resentment 45 or more, a betrayal, an unpaid loan or a cut from the will in the last 5 years, no stamp of a settlement, fewer than 12
//      feuds live (the strife edges of Life share the cap), a pair the will does not own, the chance 0.10 + (s - 45) / 200.
//   3. The rungs: the cold drift, one hop-capped leak, the sabotage, the legal fee (priced by the object, never by the payer's wealth) and the settlement.
//   4. Escalation (25% a year while s >= 40 + 10 x rung) and cooling (2 years under 25).
//   5. The scene `A Falling Out`: only with a family choice and the will's scene unspent, one popup a year across both ladders; its three answers.
//   6. `Make peace`: the odds, the act, the row.
//   7. The fact `social.feud`, the notice weight and the text.
//   8. Money: the fee goes through the ledger under `legal` to `pool:legal`, once, never above 25% of the cash, never a negative balance.
//   9. Probes: 100 x resentment inputs, a 60-year probe with every edge at resentment 100.
//  10. A played life: the real yearly loop with grudges on every relative, and a save and a load with feuds.
//  11. Purity, idempotence, a life that is not stamped, and the files.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ageUp } from '../src/game/aging'
import { netWorth, useYearAction } from '../src/game/core'
import { checkLedger, tokenSeen } from '../src/game/kernel/ledger'
import { personEntity, personKey } from '../src/game/kernel/person-ref'
import { registeredFacts } from '../src/game/kernel/registry'
import '../src/game/menus'
import '../src/game/modules/index'
import { loadGame, saveGame } from '../src/game/save'
import { memorySaveBackend } from '../src/game/save-backends'
import { resetSaveStoreForTests, setSaveBackend } from '../src/game/save-store'
import { NOTICE_WEIGHTS } from '../src/game/notice-weights'
import { runScript } from '../src/game/scripts'
import { memoryLines } from '../src/game/hubs/people-memory'
import { actRoll, runAct } from '../src/game/society/acts'
import { ACT_KEY } from '../src/game/society/budget'
import { reconcileOdds } from '../src/game/society/reconcile'
import {
  FEUD,
  FEUD_SCRIPT,
  feudOf,
  feudToken,
  legalFee,
  makePeace,
  packCause,
  payoffFee,
  peaceAct,
  peaceOdds,
  stepFeuds,
  tickOf,
  unpackCause,
} from '../src/game/society/feud'
import { socialNodes } from '../src/game/society/menu'
import { societyModule, yearlyActs } from '../src/game/society/module'
import { typicalIncome } from '../src/game/society/seam'
import { STATE_TABLE } from '../src/game/text/state-table'
import { EDGE_CAPS } from '../src/game/world/caps'
import { memoryOdds } from '../src/game/world/edge-odds'
import { formatMemory, type MemoryKind } from '../src/game/world/edge-memory'
import { liveFeuds, memoriesOf, readEdge, type Edge } from '../src/game/world/edges'
import { putEdge } from '../src/game/world/edge-write'
import { readFacts } from '../src/game/world/facts'
import { worldProblems } from '../src/game/world/invariants'
import { playerRef } from '../src/game/world/people'
import type { ChoiceModal, GameState, Job, MenuAction, NoticeModal, Person } from '../src/game/types'
import { deepFreeze, installStorageShim } from './fuzz-kit'
import { drain } from './nepo-kit'
import { acctOf, expectConserved } from './ledger-kit'
import { cast, socialGame, socialLife } from './social-kit'
import { trapRng } from './social-parity-kit'
import { makeTestGame } from './helpers'

const ROOT = resolve(__dirname, '..')
const src = (file: string): string => readFileSync(resolve(ROOT, file), 'utf8')

// ---------------------------------------------------------------------------------------------------------------------
// Helpers

const ref = (p: Person) => personEntity(p)
const toPlayer = (g: GameState, p: Person): string => `${ref(p)}>${playerRef(g)}`
const edgeOf = (g: GameState, p: Person): Readonly<Edge> | null => readEdge(g, ref(p), playerRef(g))
const rungOf = (g: GameState, p: Person): number => feudOf(g, p)?.rung ?? 0
const logText = (g: GameState): string[] => g.log.flatMap((y) => y.entries.map((e) => e.text))
const notices = (g: GameState): NoticeModal[] => g.queue.filter((m): m is NoticeModal => m.kind === 'notice')
const scenes = (g: GameState): ChoiceModal[] => g.queue.filter((m): m is ChoiceModal => m.kind === 'choice' && m.scriptId === FEUD_SCRIPT)

/** A memory of `kind` made `ago` years back, as the edge stores it. */
const mem = (g: GameState, kind: MemoryKind, ago = 1, w: 1 | 2 | 3 = 2): string => formatMemory({ kind, year: g.year - ago, w, by: 'ego' })

/** A person who resents the player: an edge person > player with resentment `s` and, unless `kind` is null, a memory of it from `ago` years back. */
function foe(g: GameState, over: Partial<Edge> = {}, kind: MemoryKind | null = 'betrayal', ago = 1): Person {
  const p = cast(g, 30, 'friend')
  const e: Edge = { t: 30, f: 30, r: 40, s: 80, o: 0, y: g.year - 3, l: g.year, ...(kind === null ? {} : { m: [mem(g, kind, ago)] }), ...over }
  if (!putEdge(g, toPlayer(g, p), e)) throw new Error('foe refused')
  return p
}

interface Rung {
  since?: number
  code?: number
  calm?: number
  tick?: number
}

/** Puts a feud on the edge: the rung, the year it began and a cause byte that no step has stamped (tick 0) unless asked. */
function setFeud(g: GameState, p: Person, rung: number, o: Rung = {}): void {
  const q = [rung, o.since ?? g.year - 1, packCause(o.code ?? 1, o.calm ?? 0, o.tick ?? 0)] as [number, number, number]
  expect(putEdge(g, toPlayer(g, p), { q })).toBe(true)
}

const feuding = (g: GameState, rung: number, over: Partial<Edge> = {}, o: Rung = {}): Person => {
  const p = foe(g, over)
  setFeud(g, p, rung, o)
  return p
}

const world = (over: Parameters<typeof socialGame>[1] = {}): GameState => socialGame(1, { age: 30, ...over })

/** The year stamp of the acts: one year on, and the real yearly entry. */
function nextYear(g: GameState): void {
  g.year += 1
  yearlyActs(g)
}

/** A lifeId whose stream gives the roll the test needs. Scans, so no seed is pinned. */
function lifeWhere(pred: (lifeId: string) => boolean): string {
  for (let i = 1; i < 8000; i++) if (pred(`life-${i}`)) return `life-${i}`
  throw new Error('no life found')
}

const rollFor = (g: GameState, lifeId: string, id: string, key: string): number => actRoll({ lifeId, flags: g.flags, year: g.year }, id, key)()
/** Sets the life so that the roll of `id` on `key`, this year, is under `x` (or at least `x`). */
const rollUnder = (g: GameState, id: string, key: string, x: number): void => void (g.lifeId = lifeWhere((l) => rollFor(g, l, id, key) < x))
const rollAtLeast = (g: GameState, id: string, key: string, x: number): void => void (g.lifeId = lifeWhere((l) => rollFor(g, l, id, key) >= x))

const START = 'feud.start'
const UP = 'feud.up'

/** A friend circle of `n` more people who know everyone (they can be told things). */
const circle = (n: number, g: GameState): Person[] => Array.from({ length: n }, () => cast(g, 70, 'friend'))

// ---------------------------------------------------------------------------------------------------------------------
// 1. The cause byte

describe('the cause byte of q', () => {
  it('packs a code of 0 to 7, calm years of 0 to 3 and a tick of 0 to 7 into one byte, and reads them back', () => {
    for (let code = 0; code <= 7; code++)
      for (let calm = 0; calm <= 3; calm++)
        for (let tick = 0; tick <= 7; tick++) {
          const c = packCause(code, calm, tick)
          expect(Number.isInteger(c) && c >= 0 && c <= 255).toBe(true)
          expect(unpackCause(c)).toEqual({ code, calm, tick })
        }
  })

  it('reads every byte as a triple that packs back to it, and anything else as the blank triple', () => {
    for (let c = 0; c <= 255; c++) {
      const u = unpackCause(c)
      expect(packCause(u.code, u.calm, u.tick)).toBe(c)
    }
    for (const bad of [-1, 256, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '7', null, undefined, {}, []]) {
      expect(unpackCause(bad as number)).toEqual({ code: 0, calm: 0, tick: 0 })
    }
  })

  it('cuts a value out of range to the range, whatever it is', () => {
    for (const bad of [-5, 99, 2.7, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const c = packCause(bad, bad, bad)
      expect(Number.isInteger(c) && c >= 0 && c <= 255).toBe(true)
    }
  })

  it('ticks a year 1 to 7 and never 0 (a feud nobody has stepped), and two years in a row never alike', () => {
    for (let y = 1900; y < 1960; y++) {
      expect(tickOf(y)).toBeGreaterThanOrEqual(1)
      expect(tickOf(y)).toBeLessThanOrEqual(7)
      expect(tickOf(y)).not.toBe(tickOf(y + 1))
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 2. Starting

describe('a feud starts', () => {
  it('on resentment 45 or more and a betrayal, an unpaid loan or a cut from the will in the last 5 years: a cold feud, this year, with its cause', () => {
    for (const [kind, code] of [['betrayal', 1], ['loan_unpaid', 2], ['cut_from_will', 3]] as const) {
      const g = world()
      const p = foe(g, { s: 80 }, kind)
      rollUnder(g, START, toPlayer(g, p), 0.1)
      stepFeuds(g)
      expect(edgeOf(g, p)!.q, kind).toEqual([1, g.year, packCause(code, 0, tickOf(g.year))])
      expect(liveFeuds(g)).toBe(1)
      expect(worldProblems(g)).toEqual([])
    }
  })

  /** The states that stop a start: each is applied to a foe who would start otherwise. */
  const BLOCKED: readonly [string, (g: GameState, p: Person) => void][] = [
    ['resentment 44', (g, p) => void putEdge(g, toPlayer(g, p), { s: 44 })],
    ['no memory at all', (g, p) => void putEdge(g, toPlayer(g, p), { m: undefined })],
    ['a memory that is not one of the three', (g, p) => void putEdge(g, toPlayer(g, p), { m: [mem(g, 'gossiped_about_me')] })],
    ['a trigger 5 years old (the last 5 years are this one and the 4 before)', (g, p) => void putEdge(g, toPlayer(g, p), { m: [mem(g, 'loan_unpaid', 5)] })],
    ['a trigger dated next year (no foresight)', (g, p) => void putEdge(g, toPlayer(g, p), { m: [mem(g, 'betrayal', -1)] })],
    ['a settlement 4 years back (the stamp c holds for 5 years)', (g, p) => void putEdge(g, toPlayer(g, p), { c: g.year - 4 })],
    ['a settlement this year', (g, p) => void putEdge(g, toPlayer(g, p), { c: g.year })],
    ['the person dead', (_g, p) => void (p.alive = false)],
    ['the person a pet', (_g, p) => void (p.relation = 'pet')],
    ['the person cut out of the will', (g, p) => void (p.data.wl = { by: g.character.id, anger: 60, cut: true, estr: false })],
    ['the person estranged under the will', (g, p) => void (p.data.wl = { by: g.character.id, anger: 60, cut: false, estr: true })],
    ['the player dead', (g) => void (g.character.alive = false)],
  ]
  for (const [name, apply] of BLOCKED) {
    it(`does not start for: ${name}`, () => {
      const g = world()
      const p = foe(g, { s: 80 })
      apply(g, p)
      rollUnder(g, START, toPlayer(g, p), 0.1)
      stepFeuds(g)
      expect(feudOf(g, p)).toBeNull()
      expect(liveFeuds(g)).toBe(0)
    })
  }

  it('starts at the boundaries: a trigger 4 years old, a stamp 5 years back, a stamp dated next year, resentment 45', () => {
    const edits: readonly ((g: GameState, p: Person) => void)[] = [
      (g, p) => void putEdge(g, toPlayer(g, p), { m: [mem(g, 'loan_unpaid', 4)] }),
      (g, p) => void putEdge(g, toPlayer(g, p), { c: g.year - 5 }),
      (g, p) => void putEdge(g, toPlayer(g, p), { c: g.year + 1 }),
      (g, p) => void putEdge(g, toPlayer(g, p), { s: 45 }),
    ]
    for (const edit of edits) {
      const g = world()
      const p = foe(g, { s: 80 })
      edit(g, p)
      rollUnder(g, START, toPlayer(g, p), 0.1)
      stepFeuds(g)
      expect(rungOf(g, p)).toBe(1)
    }
  })

  it('rolls the chance 0.10 + (s - 45) / 200 a year on the stream social', () => {
    for (const s of [45, 70, 100]) {
      const chance = FEUD.startBase + (s - FEUD.startFrom) / FEUD.startSlope
      for (const [target, starts] of [[chance - 0.02, true], [chance + 0.02, false]] as const) {
        const g = world()
        const p = foe(g, { s })
        const key = toPlayer(g, p)
        g.lifeId = lifeWhere((l) => Math.abs(rollFor(g, l, START, key) - target) < 0.01)
        stepFeuds(g)
        expect(rungOf(g, p) === 1, `s ${s}, roll about ${target.toFixed(3)}`).toBe(starts)
      }
    }
    expect(FEUD.startBase).toBe(0.1)
    expect(FEUD.startFrom).toBe(45)
  })

  it('fills the slots of the 12 live feuds and no more, strife edges of Life included, and starts the next one when a slot is free', () => {
    const g = world()
    const strife = Array.from({ length: 12 }, (_, i) => `person:s${i}>person:t${i}`)
    for (const key of strife) expect(putEdge(g, key, { t: 50, f: 50, r: 50, s: 60, o: 0, y: g.year, l: g.year, q: [1, g.year, 0] })).toBe(true)
    expect(liveFeuds(g)).toBe(12)
    const p = foe(g, { s: 100 })
    rollUnder(g, START, toPlayer(g, p), 0.1)
    stepFeuds(g)
    expect(feudOf(g, p)).toBeNull()
    expect(liveFeuds(g)).toBe(12)
    expect(putEdge(g, strife[0]!, { q: undefined })).toBe(true)
    stepFeuds(g)
    expect(rungOf(g, p)).toBe(1)
    expect(liveFeuds(g)).toBe(12)
    expect(EDGE_CAPS.feuds).toBe(12)
  })

  it('gives the free slots to the biggest grudges first, whatever the order of the people', () => {
    const g = world()
    const grudges = [50, 100, 70, 90, 60]
    const people = grudges.map((s) => foe(g, { s }))
    for (let i = 0; i < 11; i++) expect(putEdge(g, `person:s${i}>person:t${i}`, { t: 50, f: 50, r: 50, s: 60, o: 0, y: g.year, l: g.year, q: [1, g.year, 0] })).toBe(true)
    // one slot is free: the biggest grudge (s 100) takes it if its roll allows, then nobody else can
    for (const p of people) rollUnder(g, START, toPlayer(g, p), 0.1)
    const biggest = people[1]!
    g.lifeId = lifeWhere((l) => rollFor(g, l, START, toPlayer(g, biggest)) < 0.1)
    stepFeuds(g)
    expect(liveFeuds(g)).toBe(12)
    expect(feudOf(g, biggest)).not.toBeNull()
  })

  it('says the cold line once, names the person, and writes no money', () => {
    const g = world()
    const p = foe(g, { s: 80 })
    rollUnder(g, START, toPlayer(g, p), 0.1)
    const cash = g.character.money
    stepFeuds(g)
    const lines = logText(g).filter((l) => l.includes(p.firstName))
    expect(lines).toHaveLength(1)
    expect(g.character.money).toBe(cash)
    // a new feud is not played in the year it starts: a second step the same year drifts nothing and says nothing
    const rel = p.relationship
    const json = JSON.stringify(g)
    stepFeuds(g)
    expect(p.relationship).toBe(rel)
    expect(JSON.stringify(g)).toBe(json)
  })

  it('does not start a feud for a person who is not in the game', () => {
    const g = world()
    const p = foe(g, { s: 80 })
    rollUnder(g, START, toPlayer(g, p), 0.1)
    g.people = g.people.filter((x) => x.id !== p.id)
    stepFeuds(g)
    expect(liveFeuds(g)).toBe(0)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 3. The rungs

describe('the rungs', () => {
  it('cold: the person cools toward you by 2 a year as a drift (no resentment), and the status row speaks sparingly', () => {
    const g = world()
    const p = feuding(g, 1, { s: 40 })
    rollAtLeast(g, UP, toPlayer(g, p), 0.25)
    stepFeuds(g)
    expect(p.relationship).toBe(30 - FEUD.coldDrift)
    expect(edgeOf(g, p)!.f).toBe(30 - FEUD.coldDrift)
    expect(edgeOf(g, p)!.s).toBe(40)
    expect(logText(g).filter((l) => l.includes(p.firstName))).toHaveLength(1)
    // the same feud for six more years: the line is said again only after a few quiet ones
    let said = 1
    for (let i = 0; i < 6; i++) {
      g.year += 1
      rollAtLeast(g, UP, toPlayer(g, p), 0.25)
      const before = logText(g).length
      stepFeuds(g)
      if (logText(g).length > before) said++
    }
    expect(rungOf(g, p)).toBe(1)
    expect(said).toBeLessThanOrEqual(3)
    expect(said).toBeGreaterThanOrEqual(2)
    expect(p.relationship).toBeGreaterThanOrEqual(0)
  })

  it('gossip: one leak that tells the enemy\'s two best-liked contacts and one more through each, 3 points each, with a memory', () => {
    const g = world()
    const others = circle(5, g)
    const p = feuding(g, 2, { s: 55 })
    rollAtLeast(g, UP, toPlayer(g, p), 0.25)
    const before = new Map(others.map((o) => [o.id, o.relationship]))
    stepFeuds(g)
    const told = others.filter((o) => o.relationship < before.get(o.id)!)
    expect(told.length).toBeGreaterThanOrEqual(2)
    expect(told.length).toBeLessThanOrEqual(4)
    for (const o of told) {
      expect(before.get(o.id)! - o.relationship).toBe(FEUD.gossipHit)
      expect(memoriesOf(edgeOf(g, o)!).map((m) => m.kind)).toContain('heard_gossip')
    }
    for (const o of others.filter((x) => !told.includes(x))) expect(o.relationship).toBe(before.get(o.id))
    expect(p.relationship).toBe(30)
    expect(logText(g).filter((l) => l.includes(p.firstName)).length).toBeGreaterThanOrEqual(1)
  })

  it('gossip: the people told remember that they heard it (heard_gossip), and the profile of one of them never says that they gossiped (the whole-diff review)', () => {
    const g = world()
    const others = circle(5, g)
    const p = feuding(g, 2, { s: 55 })
    rollAtLeast(g, UP, toPlayer(g, p), 0.25)
    const before = new Map(others.map((o) => [o.id, o.relationship]))
    stepFeuds(g)
    const told = others.filter((o) => o.relationship < before.get(o.id)!)
    expect(told.length).toBeGreaterThanOrEqual(2)
    for (const o of told) {
      const kinds = memoriesOf(edgeOf(g, o)!).map((m) => m.kind)
      expect(kinds).toContain('heard_gossip')
      expect(kinds).not.toContain('gossiped_about_me')
      expect(memoryLines(g, o, 8).join(' | ')).toContain(`${o.firstName} heard gossip about you (${g.year})`)
    }
  })

  it('gossip: nobody to tell, nothing happens; and no person loses more than 9 points to the gossip of a year, whatever the number of feuds', () => {
    const lone = world()
    const q = feuding(lone, 2, { s: 55 })
    rollAtLeast(lone, UP, toPlayer(lone, q), 0.25)
    const json = JSON.stringify(lone.log)
    stepFeuds(lone)
    expect(JSON.stringify(lone.log)).toBe(json)

    const g = world()
    const enemies = Array.from({ length: 6 }, () => feuding(g, 2, { s: 55 }))
    const bystanders = circle(3, g)
    const all = [...enemies, ...bystanders]
    const start = new Map(all.map((o) => [o.id, o.relationship]))
    g.lifeId = lifeWhere((l) => enemies.every((e) => rollFor(g, l, UP, toPlayer(g, e)) >= 0.25))
    stepFeuds(g)
    const lost = all.map((o) => start.get(o.id)! - o.relationship)
    for (const n of lost) expect(n).toBeLessThanOrEqual(FEUD.gossipYear)
    expect(Math.max(...lost)).toBe(FEUD.gossipYear)
  })

  it('sabotage: at most 3 happiness and 2 job performance a year, no money, never below 0', () => {
    const g = world({ money: 12_345 })
    g.character.job = { defId: 'x', title: 'Clerk', company: 'Acme', category: 'fulltime', salary: 1, level: 0, performance: 60, yearsInRole: 1, yearsAtCompany: 1, data: {} } as Job
    const happy = g.character.stats.happiness
    const p = feuding(g, 3, { s: 65 })
    rollAtLeast(g, UP, toPlayer(g, p), 0.25)
    stepFeuds(g)
    expect(g.character.stats.happiness).toBe(happy - FEUD.sabotageHappiness)
    expect(g.character.job!.performance).toBe(60 - FEUD.sabotageJob)
    expect(g.character.money).toBe(12_345)
    expect(rungOf(g, p)).toBe(3)

    const low = world()
    low.character.stats.happiness = 1
    low.character.job = { ...g.character.job!, performance: 1 }
    const r = feuding(low, 3, { s: 65 })
    rollAtLeast(low, UP, toPlayer(low, r), 0.25)
    stepFeuds(low)
    expect(low.character.stats.happiness).toBe(0)
    expect(low.character.job!.performance).toBe(0)
    const none = world()
    none.character.job = null
    const s = feuding(none, 3, { s: 65 })
    rollAtLeast(none, UP, toPlayer(none, s), 0.25)
    expect(() => stepFeuds(none)).not.toThrow()
  })

  it('sabotage: takes the year\'s 3 and 2 once in all, however many feuds are on the rung, and each says its line', () => {
    const g = world({ money: 1_000 })
    g.character.job = { defId: 'x', title: 'Clerk', company: 'Acme', category: 'fulltime', salary: 1, level: 0, performance: 60, yearsInRole: 1, yearsAtCompany: 1, data: {} } as Job
    const happy = g.character.stats.happiness
    const people = Array.from({ length: 5 }, () => feuding(g, 3, { s: 65 }))
    g.lifeId = lifeWhere((l) => people.every((p) => rollFor(g, l, UP, toPlayer(g, p)) >= 0.25))
    stepFeuds(g)
    expect(g.character.stats.happiness).toBe(happy - FEUD.sabotageHappiness)
    expect(g.character.job!.performance).toBe(60 - FEUD.sabotageJob)
    for (const p of people) expect(logText(g).some((l) => l.includes(p.firstName)), p.firstName).toBe(true)
  })

  it('legal: a first suit and a legal fee, the suits of one year take a quarter of the cash between them', () => {
    const g = world({ money: 200_000 })
    const people = Array.from({ length: 6 }, () => feuding(g, 4, { s: 80 }))
    stepFeuds(g)
    expect(people.every((p) => feudOf(g, p) === null)).toBe(true)
    expect(200_000 - g.character.money).toBe(50_000)
    expect(acctOf(g, 'pool:legal' as never)).toBe(50_000)
    expectConserved(g)
    // the ones the quarter could not pay still end: the settlement is the court's, the fee is what the payer can bear
    expect(people.map((p) => edgeOf(g, p)!.c)).toEqual(people.map(() => g.year))
  })

  it('legal: a one-off fee through the ledger under legal to pool:legal, then the settlement: s down 30 on both sides, the stamp, the end', () => {
    const g = world({ money: 1_000_000 })
    const p = feuding(g, 4, { s: 80 })
    const key = toPlayer(g, p)
    expect(putEdge(g, `${playerRef(g)}>${ref(p)}`, { t: 50, f: 50, r: 50, s: 70, o: 0, y: g.year, l: g.year })).toBe(true)
    const since = feudOf(g, p)!.since
    const fee = legalFee(g, since)
    expect(fee).toBe(Math.round(1.5 * typicalIncome(g)))
    stepFeuds(g)
    expect(g.character.money).toBe(1_000_000 - fee)
    expect(acctOf(g, 'pool:legal' as never)).toBe(fee)
    expect(tokenSeen(g, feudToken(g.year, key, 'suit'))).toBe(true)
    expectConserved(g)
    expect(feudOf(g, p)).toBeNull()
    expect(edgeOf(g, p)!.s).toBe(50)
    expect(readEdge(g, playerRef(g), ref(p))!.s).toBe(40)
    expect(edgeOf(g, p)!.c).toBe(g.year)
    expect(logText(g).some((l) => l.includes(p.firstName))).toBe(true)
    // booked once: the same year again changes nothing
    const json = JSON.stringify(g)
    stepFeuds(g)
    expect(JSON.stringify(g)).toBe(json)
  })

  it('legal: a first suit costs 1.5 x a typical income, a feud that has run 4 years 2.5 x, never above 3 x', () => {
    const g = world({ money: 1e12 })
    const ti = typicalIncome(g)
    expect(legalFee(g, g.year - 1)).toBe(Math.round(1.5 * ti))
    expect(legalFee(g, g.year - 3)).toBe(Math.round(1.5 * ti))
    expect(legalFee(g, g.year - 4)).toBe(Math.round(2.5 * ti))
    expect(legalFee(g, g.year - 400)).toBe(Math.round(2.5 * ti))
    expect(legalFee(g, g.year - 400)).toBeLessThanOrEqual(3 * ti)
    expect(FEUD.feeLong).toBeLessThanOrEqual(3)
  })

  it('legal: after the settlement the pair can not feud again for 5 years, and can in the fifth', () => {
    const g = world({ money: 1_000_000 })
    const p = feuding(g, 4, { s: 80, m: [mem(g, 'betrayal', 0)] })
    const key = toPlayer(g, p)
    stepFeuds(g)
    const settled = g.year
    expect(feudOf(g, p)).toBeNull()
    for (let dy = 1; dy <= 4; dy++) {
      g.year = settled + dy
      expect(putEdge(g, key, { s: 90 })).toBe(true)
      rollUnder(g, START, key, 0.1)
      stepFeuds(g)
      expect(feudOf(g, p), `year +${dy}`).toBeNull()
    }
    g.year = settled + 5
    expect(putEdge(g, key, { s: 90, m: [mem(g, 'loan_unpaid', 0)] })).toBe(true)
    rollUnder(g, START, key, 0.1)
    stepFeuds(g)
    expect(rungOf(g, p)).toBe(1)
  })

  it('legal: a payer with no cash pays nothing, and the suit still ends', () => {
    for (const money of [0, 3, -5_000, Number.NaN]) {
      const g = world({ money })
      const p = feuding(g, 4, { s: 80 })
      const before = g.character.money
      stepFeuds(g)
      if (Number.isNaN(before)) expect(Number.isNaN(g.character.money)).toBe(true)
      else expect(g.character.money).toBe(before)
      expect(feudOf(g, p), `money ${money}`).toBeNull()
      expect(logText(g).some((l) => l.includes(p.firstName))).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 4. Escalation and cooling

describe('escalation and cooling', () => {
  it('raises the rung with the roll under 25%, keeps the year it began, ticks the year and clears the calm years', () => {
    const g = world()
    const p = feuding(g, 1, { s: 60 }, { calm: 1, code: 2 })
    const since = feudOf(g, p)!.since
    rollUnder(g, UP, toPlayer(g, p), 0.25)
    stepFeuds(g)
    expect(edgeOf(g, p)!.q).toEqual([2, since, packCause(2, 0, tickOf(g.year))])
    const h = world()
    const q = feuding(h, 1, { s: 60 })
    rollAtLeast(h, UP, toPlayer(h, q), 0.25)
    stepFeuds(h)
    expect(rungOf(h, q)).toBe(1)
  })

  it('needs s >= 40 + 10 x rung: 50, 60, 70 for rungs 1, 2, 3, and never raises the legal rung', () => {
    for (const [rung, need] of [[1, 50], [2, 60], [3, 70]] as const) {
      for (const [s, up] of [[need - 1, false], [need, true]] as const) {
        const g = world()
        const p = feuding(g, rung, { s })
        rollUnder(g, UP, toPlayer(g, p), 0.25)
        stepFeuds(g)
        expect(rungOf(g, p), `rung ${rung}, s ${s}`).toBe(up ? rung + 1 : rung)
      }
    }
    expect(FEUD.upBase + FEUD.upPerRung * 1).toBe(50)
  })

  it('raises the rung in a quarter of the years: 0.25 +- 0.08 over 300 lives', () => {
    let up = 0
    const n = 300
    for (let i = 1; i <= n; i++) {
      const g = world()
      g.lifeId = `life-${i}`
      const p = feuding(g, 1, { s: 80 })
      stepFeuds(g)
      if (rungOf(g, p) === 2) up++
    }
    expect(up / n).toBeGreaterThan(FEUD.upChance - 0.08)
    expect(up / n).toBeLessThan(FEUD.upChance + 0.08)
  })

  it('cools after 2 years under 25: the first year counts one, the second ends it with the notice Feud Cooled', () => {
    const g = world()
    const p = feuding(g, 2, { s: 20 })
    rollUnder(g, UP, toPlayer(g, p), 0.25)
    stepFeuds(g)
    expect(feudOf(g, p)).toMatchObject({ rung: 2, calm: 1 })
    expect(notices(g)).toHaveLength(0)
    g.year += 1
    stepFeuds(g)
    expect(feudOf(g, p)).toBeNull()
    expect(edgeOf(g, p)!.c).toBeUndefined()
    const cooled = notices(g).filter((m) => m.title === 'Feud Cooled')
    expect(cooled).toHaveLength(1)
    expect(cooled[0]!.text).toContain(p.firstName)
    expect(cooled[0]!.w).toBe(1)
  })

  it('starts counting again when the resentment comes back to 25 or more', () => {
    const g = world()
    const p = feuding(g, 1, { s: 20 })
    stepFeuds(g)
    expect(feudOf(g, p)!.calm).toBe(1)
    g.year += 1
    expect(putEdge(g, toPlayer(g, p), { s: 30 })).toBe(true)
    rollAtLeast(g, UP, toPlayer(g, p), 0.25)
    stepFeuds(g)
    expect(feudOf(g, p)).toMatchObject({ rung: 1, calm: 0 })
    g.year += 1
    expect(putEdge(g, toPlayer(g, p), { s: 20 })).toBe(true)
    stepFeuds(g)
    expect(feudOf(g, p)).toMatchObject({ rung: 1, calm: 1 })
  })

  it('ends the feud of a person who died with a log line and no stamp, and quietly for a person who has left the game', () => {
    const g = world()
    const p = feuding(g, 2, { s: 80 })
    p.alive = false
    stepFeuds(g)
    expect(feudOf(g, p)).toBeNull()
    expect(logText(g).some((l) => l.includes(p.firstName))).toBe(true)
    expect(edgeOf(g, p)!.c).toBeUndefined()

    const h = world()
    const q = feuding(h, 2, { s: 80 })
    h.people = h.people.filter((x) => x.id !== q.id)
    stepFeuds(h)
    expect(liveFeuds(h)).toBe(0)
    expect(logText(h)).toEqual([])
  })

  it('hands a pair the will has come to own back to the will: the feud ends quietly', () => {
    const g = world()
    const p = feuding(g, 2, { s: 80 })
    p.data.wl = { by: g.character.id, anger: 60, cut: true, estr: false }
    stepFeuds(g)
    expect(feudOf(g, p)).toBeNull()
    expect(logText(g)).toEqual([])
  })

  it('leaves the feuds that are not the player\'s alone (Life\'s strife edges between two relatives)', () => {
    const g = world()
    expect(putEdge(g, 'person:s1>person:t1', { t: 50, f: 50, r: 50, s: 60, o: 0, y: g.year, l: g.year, q: [1, g.year - 3, 0] })).toBe(true)
    const json = JSON.stringify(g.world)
    stepFeuds(g)
    expect(JSON.stringify(g.world)).toBe(json)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 5. The scene

describe('A Falling Out', () => {
  /** A feud on `rung - 1` that the step raises to `rung`. */
  function raising(rung: 3 | 4, g: GameState = world()): { g: GameState; p: Person } {
    const p = feuding(g, rung - 1, { s: 80 })
    rollUnder(g, UP, toPlayer(g, p), 0.25)
    return { g, p }
  }

  it('is queued when the rung changes into 3 and into 4, as a choice with three short answers, and spends a family choice and the will\'s scene', () => {
    for (const rung of [3, 4] as const) {
      const { g, p } = raising(rung)
      stepFeuds(g)
      expect(rungOf(g, p)).toBe(rung)
      const [scene] = scenes(g)
      expect(scene, `rung ${rung}`).toBeDefined()
      expect(scene!.title).toBe('A Falling Out')
      expect(scene!.text).toContain(p.firstName)
      expect(scene!.text.length).toBeLessThanOrEqual(140)
      expect(scene!.text).toMatch(/What will you do\?$/)
      expect(scene!.choices.map((c) => c.id)).toEqual(['peace', 'firm', 'pay'])
      for (const c of scene!.choices) expect(c.label.split(' ').length).toBeLessThanOrEqual(5)
      expect(g.yearActions[ACT_KEY]).toBe(1)
      expect(g.yearActions['will.scene']).toBe(1)
      expect(JSON.stringify(g.flags)).toContain('pop.kin.feud')
    }
  })

  it('is not queued for a change into 2, for a feud that stays, or for the legal rung that settles', () => {
    const a = world()
    const p = feuding(a, 1, { s: 80 })
    rollUnder(a, UP, toPlayer(a, p), 0.25)
    stepFeuds(a)
    expect(rungOf(a, p)).toBe(2)
    expect(scenes(a)).toHaveLength(0)
    const b = world()
    const q = feuding(b, 2, { s: 55 })
    rollAtLeast(b, UP, toPlayer(b, q), 0.25)
    stepFeuds(b)
    expect(scenes(b)).toHaveLength(0)
    const c = world({ money: 1_000_000 })
    feuding(c, 4, { s: 80 })
    stepFeuds(c)
    expect(scenes(c)).toHaveLength(0)
  })

  it('is not queued when the will has used the year\'s scene, or the year\'s three family choices are spent, and then nothing is spent', () => {
    const a = raising(3)
    a.g.yearActions['will.scene'] = 1
    stepFeuds(a.g)
    expect(rungOf(a.g, a.p)).toBe(3)
    expect(scenes(a.g)).toHaveLength(0)
    expect(a.g.yearActions[ACT_KEY] ?? 0).toBe(0)
    const b = raising(3)
    b.g.yearActions[ACT_KEY] = 3
    stepFeuds(b.g)
    expect(scenes(b.g)).toHaveLength(0)
    expect(b.g.yearActions[ACT_KEY]).toBe(3)
    expect(b.g.yearActions['will.scene'] ?? 0).toBe(0)
  })

  it('is one popup a year across both ladders: two feuds that rise together ask once, and the will can not ask after a feud scene', () => {
    const g = world()
    const a = feuding(g, 2, { s: 80 })
    const b = feuding(g, 2, { s: 80 })
    g.lifeId = lifeWhere((l) => rollFor(g, l, UP, toPlayer(g, a)) < 0.25 && rollFor(g, l, UP, toPlayer(g, b)) < 0.25)
    stepFeuds(g)
    expect(rungOf(g, a)).toBe(3)
    expect(rungOf(g, b)).toBe(3)
    expect(scenes(g)).toHaveLength(1)
    expect(g.yearActions[ACT_KEY]).toBe(1)
    // the will's own scene (events/will-feud.ts tryScene) takes the same year action first, and finds it spent
    expect(g.yearActions['will.scene']).toBe(1)
    expect(useYearAction(g, 'will.scene', 1)).toBe(false)
  })

  it('waits PACE.askGap years between two scenes', () => {
    const { g, p } = raising(3)
    stepFeuds(g)
    expect(scenes(g)).toHaveLength(1)
    g.queue = []
    for (let dy = 1; dy <= 3; dy++) {
      g.year += 1
      g.yearActions = {}
      setFeud(g, p, 2)
      rollUnder(g, UP, toPlayer(g, p), 0.25)
      stepFeuds(g)
      expect(scenes(g), `year +${dy}`).toHaveLength(0)
    }
    g.year += 1
    g.yearActions = {}
    setFeud(g, p, 2)
    rollUnder(g, UP, toPlayer(g, p), 0.25)
    stepFeuds(g)
    expect(scenes(g)).toHaveLength(1)
  })

  it('is a script that the year close keeps and counts first: it is in no list of deferrable scripts', () => {
    expect(src('src/game/hubs/year-close.ts')).not.toContain(FEUD_SCRIPT)
  })

  /** The scene of a feud on rung 3 and the person, ready to be answered. */
  function asked(over: Parameters<typeof world>[0] = {}): { g: GameState; p: Person; scene: ChoiceModal; key: string } {
    const { g, p } = raising(3, world(over))
    stepFeuds(g)
    return { g, p, scene: scenes(g)[0]!, key: toPlayer(g, p) }
  }
  const answer = (g: GameState, scene: ChoiceModal, choice: string): void => runScript(g, FEUD_SCRIPT, choice, scene.data, scene)

  it('answer peace: rolls the odds of Make peace; a yes ends the feud, stamps it, warms the bond; a no costs a point and stamps it too', () => {
    const yes = asked()
    const odds = peaceOdds(yes.g, yes.p)
    yes.g.lifeId = lifeWhere((l) => rollFor(yes.g, l, peaceAct.id, yes.key) < odds)
    const was = yes.p.relationship
    answer(yes.g, yes.scene, 'peace')
    expect(feudOf(yes.g, yes.p)).toBeNull()
    expect(edgeOf(yes.g, yes.p)!.c).toBe(yes.g.year)
    expect(yes.p.relationship).toBeGreaterThan(was)
    expect(memoriesOf(edgeOf(yes.g, yes.p)!).map((m) => m.kind)).toContain('reconciled')

    const no = asked()
    const oddsNo = peaceOdds(no.g, no.p)
    no.g.lifeId = lifeWhere((l) => rollFor(no.g, l, peaceAct.id, no.key) >= oddsNo)
    const wasNo = no.p.relationship
    answer(no.g, no.scene, 'peace')
    expect(rungOf(no.g, no.p)).toBe(3)
    expect(edgeOf(no.g, no.p)!.c).toBe(no.g.year)
    expect(no.p.relationship).toBe(wasNo - 1)
  })

  it('answer firm: the grudge grows by 5 and the bond falls by 2; the feud stays', () => {
    const { g, p, scene } = asked()
    const s = edgeOf(g, p)!.s
    const was = p.relationship
    answer(g, scene, 'firm')
    expect(rungOf(g, p)).toBe(3)
    expect(edgeOf(g, p)!.s).toBe(Math.min(100, s + FEUD.firm))
    expect(p.relationship).toBe(was - 2)
  })

  it('answer pay: pays the fee for the object through the ledger, once, and settles; with no cash it pays nothing and the feud stays', () => {
    const { g, p, scene, key } = asked({ money: 400_000 })
    const fee = payoffFee(g)
    expect(fee).toBeGreaterThan(0)
    expect(fee).toBeLessThanOrEqual(Math.floor(0.25 * 400_000))
    const cash = g.character.money
    answer(g, scene, 'pay')
    expect(g.character.money).toBe(cash - fee)
    expect(acctOf(g, 'pool:legal' as never)).toBe(fee)
    expect(tokenSeen(g, feudToken(g.year, key, 'pay'))).toBe(true)
    expect(feudOf(g, p)).toBeNull()
    expect(edgeOf(g, p)!.c).toBe(g.year)
    expectConserved(g)
    answer(g, scene, 'pay')
    expect(g.character.money).toBe(cash - fee)

    const poor = asked({ money: 0 })
    const was = poor.p.relationship
    answer(poor.g, poor.scene, 'pay')
    expect(poor.g.character.money).toBe(0)
    expect(rungOf(poor.g, poor.p)).toBe(3)
    expect(poor.p.relationship).toBe(was - 1)
  })

  it('does nothing for a forged answer: no data, a person who is gone, dead or a pet, another person\'s key, a will pair, a feud that has ended, a life not stamped', () => {
    const attempts: readonly [string, (a: ReturnType<typeof asked>) => unknown][] = [
      ['no data', () => undefined],
      ['null data', () => null],
      ['a list', () => []],
      ['a pid that is not a person', (a) => ({ pid: 'p-nobody', key: a.key })],
      ['a key of another person', (a) => ({ pid: a.p.id, key: `person:old>${playerRef(a.g)}` })],
      ['a key that is not text', (a) => ({ pid: a.p.id, key: 7 })],
      ['a person who died', (a) => ((a.p.alive = false), a.scene.data)],
      ['a pet', (a) => ((a.p.relation = 'pet'), a.scene.data)],
      ['a will pair', (a) => ((a.p.data.wl = { by: a.g.character.id, anger: 60, cut: true, estr: false }), a.scene.data)],
      ['a feud that has ended', (a) => (putEdge(a.g, a.key, { q: undefined }), a.scene.data)],
      ['a life that is not stamped', (a) => (delete (a.g.world as Record<string, unknown>).social, a.scene.data)],
    ]
    for (const [name, make] of attempts) {
      for (const choice of ['peace', 'firm', 'pay']) {
        const a = asked({ money: 400_000 })
        const data = make(a)
        const before = JSON.stringify({ w: a.g.world, m: a.g.character.money, r: a.p.relationship, q: a.g.queue.length })
        runScript(a.g, FEUD_SCRIPT, choice, data as never, a.scene)
        expect(JSON.stringify({ w: a.g.world, m: a.g.character.money, r: a.p.relationship, q: a.g.queue.length }), `${name} / ${choice}`).toBe(before)
      }
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 6. Make peace

describe('Make peace', () => {
  const rowOf = (g: GameState, p: Person): MenuAction | undefined => socialNodes(g, p).find((n): n is MenuAction => n.type === 'action' && n.id === 'social.peace')

  it('rolls clamp(0.22 + 0.3 f/100 - 0.3 s/100 + memory + obligation, 0.05, 0.85) from the pair edge', () => {
    for (const [f, s] of [[0, 100], [30, 80], [50, 50], [90, 10], [100, 0]]) {
      const g = world()
      const p = foe(g, { f, s, m: [mem(g, 'betrayal')] })
      p.relationship = f
      putEdge(g, toPlayer(g, p), { q: [2, g.year - 1, 0] })
      const raw = 0.22 + 0.3 * (f / 100) - 0.3 * (s / 100) + memoryOdds(g, p, 'peace') + reconcileOdds(g, p)
      expect(peaceOdds(g, p), `f ${f}, s ${s}`).toBeCloseTo(Math.min(0.85, Math.max(0.05, raw)), 10)
    }
  })

  it('is held between 0.05 and 0.85 at the extremes, with a brokered obligation and with a hostile edge', () => {
    const g = world()
    const p = foe(g, { f: 100, s: 0, o: 100, m: [mem(g, 'saved_me')] })
    p.relationship = 100
    // the best a pair can have: 0.52 from the bond, what the person remembers and the brokered obligation, which the model caps at 0.15 each
    expect(peaceOdds(g, p)).toBeCloseTo(0.52 + memoryOdds(g, p, 'peace') + reconcileOdds(g, p), 10)
    expect(peaceOdds(g, p)).toBeLessThanOrEqual(0.85)
    expect(peaceOdds(g, p)).toBeGreaterThan(0.6)
    const h = world()
    const q = foe(h, { f: 0, s: 100, o: -100 })
    q.relationship = 0
    expect(peaceOdds(h, q)).toBe(0.05)
    const bare = world()
    const r = cast(bare, 40, 'friend')
    expect(peaceOdds(bare, r)).toBeCloseTo(0.22 + 0.3 * 0.4, 10)
    expect(peaceOdds(makeTestGame(1), cast(makeTestGame(1), 40, 'friend'))).toBeGreaterThanOrEqual(0.05)
  })

  it('is a row on the page of a person in a feud, greyed out with the reason when a try was made lately, and not on any other page', () => {
    const g = world()
    const p = feuding(g, 2, { s: 80 })
    const row = rowOf(g, p)!
    expect(row).toBeDefined()
    expect(row.label).toContain(p.firstName)
    expect(String(row.subtitle)).toMatch(/\d+%/)
    expect(row.disabledReason?.(g)).toBeNull()
    expect(putEdge(g, toPlayer(g, p), { c: g.year - 1 })).toBe(true)
    expect(row.disabledReason?.(g)).toEqual(expect.stringContaining(p.firstName))
    expect(row.disabledReason?.(g)).toMatch(/\d{4}/)
    const calm = world()
    const q = foe(calm, { s: 80 })
    expect(rowOf(calm, q)).toBeUndefined()
    const willed = world()
    const r = feuding(willed, 2, { s: 80 })
    r.data.wl = { by: willed.character.id, anger: 60, cut: true, estr: false }
    expect(rowOf(willed, r)).toBeUndefined()
    const child = world({ age: 12 })
    expect(rowOf(child, feuding(child, 2, { s: 80 }))).toBeUndefined()
  })

  it('runs on a draft of the state: a yes ends the feud, stamps the edge, makes the memory reconciled and warms the bond by 6', () => {
    const g = world()
    const p = feuding(g, 3, { s: 80 })
    const key = toPlayer(g, p)
    const odds = peaceOdds(g, p)
    g.lifeId = lifeWhere((l) => rollFor(g, l, peaceAct.id, key) < odds)
    const row = rowOf(g, p)!
    const draft = structuredClone(g)
    row.run(draft, '')
    const d = draft.people.find((x) => x.id === p.id)!
    expect(feudOf(draft, d)).toBeNull()
    expect(edgeOf(draft, d)!.c).toBe(draft.year)
    expect(memoriesOf(edgeOf(draft, d)!).map((m) => m.kind)).toContain('reconciled')
    expect(d.relationship).toBe(30 + FEUD.peaceWarm)
    expect(notices(draft).map((m) => m.title)).toContain('Peace Made')
    expect(liveFeuds(draft)).toBe(0)
    expect(rungOf(g, p)).toBe(3)
  })

  it('a no leaves the feud, costs a point, stamps the try; asking again before 3 years is refused and changes nothing', () => {
    const g = world()
    const p = feuding(g, 3, { s: 80 })
    const key = toPlayer(g, p)
    const odds = peaceOdds(g, p)
    g.lifeId = lifeWhere((l) => rollFor(g, l, peaceAct.id, key) >= odds)
    expect(makePeace(g, p)).not.toBeNull()
    expect(rungOf(g, p)).toBe(3)
    expect(p.relationship).toBe(29)
    expect(edgeOf(g, p)!.c).toBe(g.year)
    const json = JSON.stringify(g)
    expect(makePeace(g, p)).toBeNull()
    expect(JSON.stringify(g)).toBe(json)
    g.year += 3
    expect(makePeace(g, p)).not.toBeNull()
  })

  it('ends a feud at rung 4 too, and the stamp holds the pair 5 years from a new one', () => {
    const g = world()
    const p = feuding(g, 4, { s: 80, m: [mem(g, 'betrayal', 0)] })
    const key = toPlayer(g, p)
    g.lifeId = lifeWhere((l) => rollFor(g, l, peaceAct.id, key) < peaceOdds(g, p))
    expect(makePeace(g, p)).not.toBeNull()
    expect(feudOf(g, p)).toBeNull()
    for (let dy = 1; dy <= 4; dy++) {
      g.year += dy === 1 ? 1 : 1
      expect(putEdge(g, key, { s: 90 })).toBe(true)
      rollUnder(g, START, key, 0.1)
      stepFeuds(g)
      expect(feudOf(g, p), `year +${dy}`).toBeNull()
    }
  })

  it('is blocked, with nothing written, for a pair with no feud, a dead person, a pet, a will pair, a child, a dead player and an unstamped life', () => {
    const states: readonly [string, (g: GameState, p: Person) => void][] = [
      ['no feud', (g, p) => void putEdge(g, toPlayer(g, p), { q: undefined })],
      ['a dead person', (_g, p) => void (p.alive = false)],
      ['a pet', (_g, p) => void (p.relation = 'pet')],
      ['a will pair', (g, p) => void (p.data.wl = { by: g.character.id, anger: 60, cut: true, estr: true })],
      ['a child', (g) => void (g.character.age = 10)],
      ['a dead player', (g) => void (g.character.alive = false)],
      ['a try 2 years back', (g, p) => void putEdge(g, toPlayer(g, p), { c: g.year - 2 })],
    ]
    for (const [name, apply] of states) {
      const g = world()
      const p = feuding(g, 3, { s: 80 })
      apply(g, p)
      const json = JSON.stringify(g)
      expect(makePeace(g, p), name).toBeNull()
      expect(JSON.stringify(g), name).toBe(json)
    }
    const u = makeTestGame(1, { age: 30 })
    const p = cast(u, 30, 'friend')
    expect(makePeace(u, p)).toBeNull()
    expect(runAct(world(), peaceAct, 'person:p1>person:old', null)).toBeNull()
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 7. The fact, the weight and the text

describe('the fact social.feud', () => {
  const feudFacts = (g: GameState) => readFacts(g).filter((f) => f.k === 'social.feud')

  it('is declared by the module, and the bus takes it', () => {
    expect(societyModule.facts).toEqual(expect.arrayContaining(['social.leak', 'social.feud']))
    expect(registeredFacts().has('social.feud')).toBe(true)
  })

  it('is said when a feud reaches rung 3, rung 4 and when it ends, with the player, the person, the rung and a severity of 40 to 90', () => {
    const g = world({ money: 1_000_000 })
    const p = feuding(g, 2, { s: 80 })
    const key = toPlayer(g, p)
    rollUnder(g, UP, key, 0.25)
    stepFeuds(g)
    g.year += 1
    rollUnder(g, UP, key, 0.25)
    stepFeuds(g)
    expect(rungOf(g, p)).toBe(4)
    g.year += 1
    stepFeuds(g)
    expect(feudOf(g, p)).toBeNull()
    const rows = feudFacts(g)
    expect(rows.map((f) => f.v)).toEqual([3, 4, 0])
    expect(rows.map((f) => f.y)).toEqual([g.year - 2, g.year - 1, g.year])
    for (const f of rows) {
      expect(f).toMatchObject({ k: 'social.feud', c: playerRef(g), a: personKey(p) })
      expect(f.s!).toBeGreaterThanOrEqual(40)
      expect(f.s!).toBeLessThanOrEqual(90)
    }
    expect(rows.map((f) => f.s)).toEqual([65, 90, 40])
  })

  it('is said when a feud ends by cooling, by death and by a peace made', () => {
    const cool = world()
    const a = feuding(cool, 1, { s: 10 }, { calm: 1 })
    stepFeuds(cool)
    const dead = world()
    const b = feuding(dead, 2, { s: 80 })
    b.alive = false
    stepFeuds(dead)
    const peace = world()
    const c = feuding(peace, 2, { s: 80 })
    peace.lifeId = lifeWhere((l) => rollFor(peace, l, peaceAct.id, toPlayer(peace, c)) < peaceOdds(peace, c))
    makePeace(peace, c)
    for (const [g, p] of [[cool, a], [dead, b], [peace, c]] as const) {
      expect(feudFacts(g), personKey(p)).toHaveLength(1)
      expect(feudFacts(g)[0]).toMatchObject({ v: 0, s: 40, a: personKey(p) })
    }
  })

  it('is said 8 times a year at most, and never for a life that is not stamped', () => {
    const g = world()
    const dead = Array.from({ length: 11 }, () => feuding(g, 2, { s: 80 }))
    for (const p of dead) p.alive = false
    stepFeuds(g)
    expect(liveFeuds(g)).toBe(0)
    expect(feudFacts(g).length).toBeLessThanOrEqual(FEUD.factsYear)
    expect(feudFacts(g).length).toBeGreaterThan(0)
    const u = makeTestGame(1, { age: 30 })
    const p = foe(u)
    expect(putEdge(u, toPlayer(u, p), { q: [2, u.year - 1, 0] })).toBe(true)
    p.alive = false
    stepFeuds(u)
    expect(readFacts(u)).toEqual([])
  })
})

describe('the notice and the text', () => {
  it('weighs the notice Feud Cooled 1, and the title is a string in src (the table test needs it)', () => {
    expect(NOTICE_WEIGHTS['Feud Cooled']).toBe(1)
    expect(src('src/game/society/feud.ts')).toContain("'Feud Cooled'")
  })

  it('has the status row feud.cold with 4 variants that all name the person, and says no long dash anywhere', () => {
    const row = STATE_TABLE['feud.cold']
    expect(row.variants).toHaveLength(4)
    for (const v of row.variants) expect(v).toContain('{who}')
    for (const file of ['src/game/society/feud.ts', 'src/game/society/menu.ts', 'src/game/text/pools.ts', 'src/game/text/state-table.ts']) {
      expect(src(file), file).not.toMatch(/[\u2013\u2014]/)
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 8. Money

describe('the legal fee', () => {
  it('is priced by the object: net worth x100 gives the same fee, and an asset-rich, cash-poor payer pays little, not a negative balance', () => {
    const g = world({ money: 1_000_000 })
    const rich = world({ money: 1_000_000 })
    rich.assets.push({ id: 'a1', kind: 'house', name: 'Big house', emoji: 'H', purchasePrice: 1, value: 5e9, condition: 90, purchasedAge: 20, upkeep: 0, details: {} })
    expect(netWorth(rich)).toBeGreaterThan(100 * netWorth(g))
    for (const years of [1, 5]) expect(legalFee(rich, rich.year - years)).toBe(legalFee(g, g.year - years))

    for (const [money, expected] of [[0, 0], [3, 0], [4, 1], [1_000, 250], [100_000, 25_000]] as const) {
      const h = world({ money })
      h.assets.push(rich.assets[0]!)
      const fee = legalFee(h, h.year - 1)
      expect(fee, `cash ${money}`).toBe(Math.min(expected, Math.round(1.5 * typicalIncome(h))))
      expect(fee).toBeLessThanOrEqual(Math.floor(0.25 * money))
    }
  })

  it('never passes 25% of the cash, whatever the cash, and is a whole number', () => {
    for (const money of [0, 1, 7, 99, 10_000, 123_456, 9e9, 1e15, Number.NaN, Number.POSITIVE_INFINITY, -1e9]) {
      const g = world({ money })
      for (const since of [g.year - 1, g.year - 9]) {
        const fee = legalFee(g, since)
        expect(Number.isInteger(fee), `cash ${money}`).toBe(true)
        expect(fee).toBeGreaterThanOrEqual(0)
        if (Number.isFinite(money)) expect(fee).toBeLessThanOrEqual(Math.max(0, Math.floor(0.25 * money)))
      }
    }
  })

  it('is booked once through cash.moveCash to pool:legal under legal, with the books balanced and no mint or burn', () => {
    const g = world({ money: 200_000 })
    const p = feuding(g, 4, { s: 80 })
    const ledger = checkLedger(g)
    const fee = legalFee(g, feudOf(g, p)!.since)
    stepFeuds(g)
    expect(g.character.money).toBe(200_000 - fee)
    expect(fee).toBe(50_000)
    expect(acctOf(g, 'pool:legal' as never)).toBe(fee)
    expectConserved(g)
    expect(checkLedger(g).mint).toBe(ledger.mint)
    expect(checkLedger(g).burn).toBe(ledger.burn)
    expect(src('src/game/society/feud.ts')).toMatch(/'legal'/)
    expect(src('src/game/society/feud.ts')).not.toMatch(/\bspend\(/)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 9. Probes

describe('probes', () => {
  it('100 x the resentment inputs: 60 people at 100 hold the live feuds at 12 for 30 years, and every suit takes at most a quarter of the cash', () => {
    const g = world({ money: 300_000 })
    const people = Array.from({ length: 60 }, () => foe(g, { s: 100 }))
    let top = 0
    for (let year = 0; year < 30; year++) {
      for (const p of people) {
        // the grudge is topped up every year (the edge step would fade it): 100 x what the world would hold
        putEdge(g, toPlayer(g, p), { s: 100, m: [mem(g, 'betrayal', 0)] })
      }
      const cash = g.character.money
      nextYear(g)
      top = Math.max(top, liveFeuds(g))
      expect(liveFeuds(g)).toBeLessThanOrEqual(12)
      expect(g.character.money).toBeGreaterThanOrEqual(0)
      expect(cash - g.character.money).toBeLessThanOrEqual(Math.floor(0.25 * cash))
      expect(worldProblems(g)).toEqual([])
    }
    expect(top).toBe(12)
    expectConserved(g)
  })

  it('a 60-year probe with every edge at resentment 100: happiness stays 0 to 100, nothing is not a number, the fees are booked once, the books balance', () => {
    const g = world({ money: 500_000 })
    const people = [...Array.from({ length: 8 }, () => foe(g, { s: 100 })), ...circle(4, g)]
    const start = g.character.money
    const tokens = new Set<string>()
    for (let year = 0; year < 60; year++) {
      for (const p of people) {
        if (!p.alive) continue
        putEdge(g, toPlayer(g, p), { s: 100, m: [mem(g, 'betrayal', 0)] })
      }
      nextYear(g)
      for (const p of people) {
        for (const k of ['suit', 'pay'] as const) {
          const t = feudToken(g.year, toPlayer(g, p), k)
          if (tokenSeen(g, t)) tokens.add(t)
        }
        expect(Number.isFinite(p.relationship)).toBe(true)
      }
      expect(g.character.stats.happiness).toBeGreaterThanOrEqual(0)
      expect(g.character.stats.happiness).toBeLessThanOrEqual(100)
      expect(Number.isFinite(g.character.money)).toBe(true)
      expect(g.character.money).toBeGreaterThanOrEqual(0)
      expect(worldProblems(g)).toEqual([])
      expect(liveFeuds(g)).toBeLessThanOrEqual(12)
      g.queue = []
    }
    expectConserved(g)
    expect(start - g.character.money).toBe(acctOf(g, 'pool:legal' as never))
    expect(tokens.size).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 10. A played life

describe('a played life', () => {
  /** [seed, year] of the one life played (a constant tuple, X30: no new seed pin). */
  const LIFE = [5, 1990] as const
  const KIN = ['parent', 'sibling', 'child', 'friend', 'bestFriend', 'spouse', 'coworker']

  it('runs the real year with a grudge on every adult relative: feuds start, rise and end, one scene a year at most, 12 feuds at most, the books balance', { timeout: 120_000 }, () => {
    const g = socialLife({ seed: LIFE[0], year: LIFE[1] })
    let turn = 0
    let asked = 0
    let mostLive = 0
    let mostActs = 0
    for (let i = 0; i < 70 && g.character.alive; i++) {
      ageUp(g)
      for (const p of g.people) {
        if (!p.alive || p.age < 16 || !KIN.includes(p.relation)) continue
        putEdge(g, toPlayer(g, p), { t: 40, f: p.relationship, r: 40, s: 90, o: 0, y: g.year - 1, l: g.year, m: [mem(g, 'betrayal', 1)] })
      }
      const here = scenes(g).length
      expect(here, `year ${g.year}`).toBeLessThanOrEqual(1)
      asked += here
      mostActs = Math.max(mostActs, g.yearActions[ACT_KEY] ?? 0)
      drain(g, (m) => m.choices[turn++ % m.choices.length]!.id)
      mostLive = Math.max(mostLive, liveFeuds(g))
    }
    expect(mostLive).toBeGreaterThan(0)
    expect(mostLive).toBeLessThanOrEqual(EDGE_CAPS.feuds)
    expect(asked).toBeGreaterThan(0)
    expect(mostActs).toBeLessThanOrEqual(3)
    const rungs = new Set(readFacts(g).filter((f) => f.k === 'social.feud').map((f) => f.v))
    expect([...rungs].sort()).toEqual([0, 3, 4])
    expect(checkLedger(g).ok).toBe(true)
    expect(worldProblems(g).filter((p) => /edge|feud|social/i.test(p))).toEqual([])
  })

  it('survives a save and a load with its feuds, and the loaded game steps on exactly as the original does', { timeout: 60_000 }, () => {
    const g = socialLife({ seed: LIFE[0], year: LIFE[1], countryId: 'us' })
    g.character.money = 500_000
    const people = [1, 2, 3].map((rung) => feuding(g, rung, { s: 60 }))
    circle(3, g)
    resetSaveStoreForTests()
    installStorageShim()
    setSaveBackend(memorySaveBackend())
    try {
      expect(saveGame(g)).toBe(true)
      const back = loadGame()!
      expect(back).not.toBeNull()
      for (const p of people) expect(feudOf(back, back.people.find((x) => x.id === p.id)!)).toEqual(feudOf(g, p))
      expect(liveFeuds(back)).toBe(3)
      expect(worldProblems(back)).toEqual([])
      for (const x of [g, back]) {
        x.year += 1
        stepFeuds(x)
      }
      for (const p of people) {
        const q = back.people.find((x) => x.id === p.id)!
        expect(feudOf(back, q), p.id).toEqual(feudOf(g, p))
        expect(q.relationship).toBe(p.relationship)
      }
      expect(back.character.stats.happiness).toBe(g.character.stats.happiness)
    } finally {
      resetSaveStoreForTests()
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 11. Purity, idempotence, the stamp and the files

describe('the step', () => {
  it('is idempotent in a year: a second call changes nothing, to the byte, whatever the first one did', () => {
    for (let i = 1; i <= 25; i++) {
      const g = world({ money: 300_000 })
      g.lifeId = `life-${i}`
      const people = [...circle(3, g), feuding(g, 1, { s: 80 }), feuding(g, 2, { s: 80 }), feuding(g, 3, { s: 80 }), feuding(g, 4, { s: 80 }), foe(g, { s: 90 })]
      expect(people).toHaveLength(8)
      stepFeuds(g)
      const json = JSON.stringify(g)
      stepFeuds(g)
      expect(JSON.stringify(g), `life-${i}`).toBe(json)
    }
  })

  it('runs inside the one society.acts entry, once a year by its stamp, and the entry is idempotent', () => {
    const g = world()
    const p = feuding(g, 1, { s: 60 })
    g.year += 1
    rollUnder(g, UP, toPlayer(g, p), 0.25)
    yearlyActs(g)
    expect(rungOf(g, p)).toBe(2)
    const json = JSON.stringify(g)
    yearlyActs(g)
    expect(JSON.stringify(g)).toBe(json)
    expect(src('src/game/society/module.ts')).toMatch(/stepFeuds/)
  })

  it('does nothing at all for a life that is not stamped: the bytes, g.rng and the books', () => {
    const g = makeTestGame(1, { age: 30 })
    const p = foe(g, { s: 100 })
    expect(putEdge(g, toPlayer(g, p), { q: [3, g.year - 2, 0] })).toBe(true)
    p.alive = false
    const json = JSON.stringify(g)
    const { rng, nextId } = g
    stepFeuds(g)
    expect(JSON.stringify(g)).toBe(json)
    expect(g.rng).toBe(rng)
    expect(g.nextId).toBe(nextId)
  })

  it('draws nothing from g.rng, in a year with every rung, a start and an end', () => {
    const g = world({ money: 300_000 })
    circle(3, g)
    feuding(g, 1, { s: 80 })
    feuding(g, 2, { s: 80 })
    feuding(g, 3, { s: 80 })
    feuding(g, 4, { s: 80 })
    const dead = feuding(g, 2, { s: 80 })
    dead.alive = false
    foe(g, { s: 100 })
    // a read or a write of g.rng throws (the trap), so a step that returns drew nothing
    trapRng(g)
    expect(() => stepFeuds(g)).not.toThrow()
  })

  it('reads in the menu without a write or a draw: the row and the reasons on a deep-frozen game', () => {
    const g = world()
    const p = feuding(g, 2, { s: 80 })
    const frozen = deepFreeze(trapRng(g))
    const person = frozen.people.find((x) => x.id === p.id)!
    const nodes = socialNodes(frozen, person)
    const row = nodes.find((n): n is MenuAction => n.type === 'action' && n.id === 'social.peace')!
    expect(row.disabledReason?.(frozen)).toBeNull()
    expect(peaceOdds(frozen, person)).toBeGreaterThan(0)
    expect(feudOf(frozen, person)).not.toBeNull()
    expect(legalFee(frozen, frozen.year - 1)).toBeGreaterThanOrEqual(0)
    expect(payoffFee(frozen)).toBeGreaterThanOrEqual(0)
  })

  it('keeps to its files: no events/ or business/ import, no Math.random, no clock, no raw write of a relationship', () => {
    // the code, without the comments that say what it does not do
    const text = src('src/game/society/feud.ts')
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n')
    expect(text).not.toMatch(/from '\.\.\/(events|business)\//)
    expect(text).not.toMatch(/Math\.random|Date\.now|new Date\(/)
    expect(text).not.toMatch(/\.relationship\s*(=|[-+*/]=)[^=]/)
    expect(text).not.toMatch(/\bg\.rng\b/)
  })
})
