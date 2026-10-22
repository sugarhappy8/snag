// R3-M5 (C.3): deep tech on the Effort engine. `programTerms` (what funding a program at a budget buys) and `finalOdds` (the roll a
// finished program makes) are wrappers over `quote`; the pace of the lab is the calibration of cost, speed and team as it always was,
// and it is also the posture of the work: each year at a pace adds the posture's strain to the program's own tiredness (`fx.fatigue`),
// and a tired program loses odds. A program that fails banks know-how in its trade (`dt.<trade>`; a capability track in
// `dt.aiLab.cap.<cap>`), at most 15 odds points in all, and the next program of that field starts with the better odds.
//
// What this file pins: the oracle (test/fixtures/effort-parity.json, recorded on v5.0.0) holds for the deeptech and aicaps grids and
// both lifecycles (the lines on sale, the stage, ipBook, the notes' marks, g.rng); every draw stays where it was (one `rand` per
// finished program, in order); `quote` is called by both functions; a read draws nothing and a deep-frozen state reads fine; a
// program at the default pace saves exactly as it did (no `fx`); a lost program's ipBook rule (a quarter of what it spent) is the
// old one, so no valuation moves; money buys odds and speed and never a lower price (100x probe); `TechProgram.fx` is optional,
// validated and bounded; the autopilot still starts programs.
//
// No pinned seed: lives are the kit's tuples; a certain win or loss sets g.rng to a state whose next draw is low or high.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { businessAssetView } from '../src/game/business'
import { programDef, PROGRAMS } from '../src/game/business/deeptech-data'
import { paceToPosture, paceStrain, programField } from '../src/game/business/deeptech-effort'
import { deepTechManagerTurnImpl } from '../src/game/business/deeptech-manager'
import { advancePrograms, finalOdds, finalQuote, programCost, programQuote, programTerms, programWhy, startProgram, type RdResult } from '../src/game/business/deeptech-rd'
import { readTech, type TechProgram, type TechState } from '../src/game/business/deeptech-state'
import { bizOf, type BizState } from '../src/game/business/state'
import { quote as realQuote } from '../src/game/effort/engine'
import { newFx } from '../src/game/effort/fx'
import { KNOW_ODDS_MAX, POSTURE_STRAIN } from '../src/game/effort/limits'
import { oddsLine } from '../src/game/effort/why'
import { nextRandom } from '../src/game/rng'
import type { Asset, GameState, Json, MenuAction, MenuGroup } from '../src/game/types'
import { applyDisclosure } from '../src/game/world/frontier'
import '../src/game/world/shards'
import { cycleComponents, readImportGraph } from './arch-kit'
import { capLab, expectLifecycle, expectParity, techLab, type Life } from './effort-parity-kit'
import { deepFreeze } from './fuzz-kit'
import { openTiles } from './helpers'
import { noDraw } from './lab-kit'

// The engine's quote, counted: the spy wraps the real one, so every number below is the real engine's.
const spy = vi.hoisted(() => ({ calls: 0 }))
vi.mock('../src/game/effort/engine', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/game/effort/engine')>()
  return {
    ...real,
    quote: (...a: Parameters<typeof real.quote>) => {
      spy.calls += 1
      return real.quote(...a)
    },
  }
})

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)
const TIMEOUT = 180_000
const LIFE: Life = [3, 2030]
const ADAPTER = 'src/game/business/deeptech-effort.ts'

interface Lab {
  g: GameState
  a: Asset
  b: BizState
  t: TechState
}

/** An rng state whose next draw is at least `x` (a certain loss at odds under it), found by scanning small states: no life seed involved. */
function rngAbove(x: number): number {
  for (let s = 1; s < 200_000; s++) if (nextRandom(s)[0] >= x) return s
  throw new Error(`no rng state draws ${x} or more`)
}
/** An rng state whose next draw is under `x` (a certain win at odds over it). */
function rngBelow(x: number): number {
  for (let s = 1; s < 200_000; s++) if (nextRandom(s)[0] < x) return s
  throw new Error(`no rng state draws under ${x}`)
}
const LOSS = rngAbove(0.99)
const WIN = rngBelow(0.02)

/** Starts a program of the lab and makes it due at the next year-end at a steady pace. */
function due(f: Lab, trade: string, id: string, k = 1): TechProgram {
  const def = programDef(trade as never, id)!
  const p = startProgram(f.g, f.b, f.t, def, k)!
  expect(p, `${trade}.${id} starts`).not.toBeNull()
  p.progress = Math.max(0, p.years - 1)
  return p
}

/** Runs one year of the lab with the next draw fixed. */
function year(f: Lab, rng: number): RdResult {
  f.g.rng = rng
  return advancePrograms(f.g, f.a, f.b, f.t, f.g.year)
}

const points = (a: number, b: number): number => (b - a) * 100
const stored = (t: TechState): Json => JSON.parse(JSON.stringify(t)) as Json

describe('the oracle of v5.0.0 holds', () => {
  it('every row of the deeptech and aicaps grids is within the tolerance (programTerms and finalOdds on the engine)', { timeout: TIMEOUT }, () => {
    expectParity('deeptech')
    expectParity('aicaps')
  })

  it('the deeptech and AI lab lifecycles are byte for byte: lines, stage, ipBook, the marks of the notes, g.rng', { timeout: TIMEOUT }, () => {
    expectLifecycle('deeptech')
    expectLifecycle('aicaps')
  })

  it('programTerms and finalOdds each read the engine: at least one quote a call', () => {
    const f = techLab('quantum', LIFE)
    const def = programDef('quantum', 'qubits')!
    const p = startProgram(f.g, f.b, f.t, def, 1)!
    const before = spy.calls
    const terms = programTerms(f.b, f.t, def, 2)
    expect(spy.calls).toBeGreaterThan(before)
    const mid = spy.calls
    const odds = finalOdds(f.g, f.a, f.b, f.t, p)
    expect(spy.calls).toBeGreaterThan(mid)
    expect(terms.odds).toBeGreaterThan(0)
    expect(odds).toBeGreaterThanOrEqual(0.03)
    expect(odds).toBeLessThanOrEqual(0.95)
  })

  it('keeps the old clamps: terms .02 to .98 at a budget of .5 to 3, the roll .03 to .95, and a budget outside the range is cut', () => {
    const f = techLab('quantum', LIFE)
    const def = programDef('quantum', 'qubits')!
    const lean = programTerms(f.b, f.t, def, 0.5)
    expect(programTerms(f.b, f.t, def, 0.001)).toEqual(lean)
    expect(programTerms(f.b, f.t, def, Number.NaN)).toEqual(programTerms(f.b, f.t, def, 1))
    const rush = programTerms(f.b, f.t, def, 3)
    expect(programTerms(f.b, f.t, def, 300)).toEqual(rush)
    for (const k of [0.5, 1, 2, 3]) {
      const x = programTerms(f.b, f.t, def, k)
      expect(x.odds).toBeGreaterThanOrEqual(0.02)
      expect(x.odds).toBeLessThanOrEqual(0.98)
      expect(x.years).toBeGreaterThanOrEqual(0.5)
      expect(x.years).toBeLessThanOrEqual(10)
    }
  })
})

describe('the pace is the posture', () => {
  it('lean is lean, steady is steady, blitz is push, and a year at a pace adds the posture\'s strain', () => {
    expect(paceToPosture('lean')).toBe('lean')
    expect(paceToPosture('steady')).toBe('steady')
    expect(paceToPosture('blitz')).toBe('push')
    expect(paceStrain('lean')).toBe(POSTURE_STRAIN.lean)
    expect(paceStrain('steady')).toBe(POSTURE_STRAIN.steady)
    expect(paceStrain('blitz')).toBe(POSTURE_STRAIN.push)
    expect([paceStrain('lean'), paceStrain('steady'), paceStrain('blitz')]).toEqual([-4, 0, 10])
  })

  it('at the default pace a program saves exactly as it always did: no fx, ten keys', () => {
    const f = techLab('quantum', LIFE)
    const p = startProgram(f.g, f.b, f.t, programDef('quantum', 'qubits')!, 1)!
    expect(Object.keys(p).sort()).toEqual(['cost', 'emoji', 'id', 'key', 'name', 'odds', 'progress', 'spent', 'started', 'target', 'years'])
    f.t.pace = 'steady'
    advancePrograms(f.g, f.a, f.b, f.t, f.g.year)
    expect('fx' in p).toBe(false)
    f.t.pace = 'lean'
    advancePrograms(f.g, f.a, f.b, f.t, f.g.year)
    expect('fx' in p, 'a lean year builds no tiredness, so there is nothing to keep').toBe(false)
    expect(JSON.stringify(readTech(stored(f.t))).includes('"fx"')).toBe(false)
  })

  it('the first blitz year is exact; tiredness builds ten a year and costs odds only past the core\'s knee', () => {
    const f = techLab('quantum', LIFE)
    f.t.pace = 'steady'
    const p = startProgram(f.g, f.b, f.t, programDef('quantum', 'qubits')!, 1)!
    p.years = 10
    const rested = finalOdds(f.g, f.a, f.b, f.t, p)
    f.t.pace = 'blitz'
    const odds: number[] = []
    for (let n = 1; n <= 7; n++) {
      advancePrograms(f.g, f.a, f.b, f.t, f.g.year)
      expect(p.fx!.fatigue, `after ${n} blitz years`).toBe(10 * n)
      odds.push(finalOdds(f.g, f.a, f.b, f.t, p))
    }
    // The blitz factor (.96) is the same every year; what changes is the tiredness.
    const tired = (n: number): number => programWhy(f.g, f.a, f.b, f.t, { ...p, fx: { ...newFx(f.g.year), fatigue: 10 * n } }).filter((r) => r.key === 'tired').reduce((s, r) => s + r.pts, 0)
    expect(tired(1)).toBe(0)
    expect(tired(3)).toBe(0)
    expect(tired(4)).toBeLessThan(0)
    expect(tired(7)).toBeLessThan(tired(4))
    expect(tired(7)).toBeLessThanOrEqual(-4)
    expect(odds[0]).toBeCloseTo(odds[2]!, 12)
    expect(odds[6]!).toBeLessThan(odds[3]!)
    expect(odds[3]!).toBeLessThanOrEqual(odds[0]!)
    // The same program rested has the odds of its first year at the steady pace times the blitz factor.
    expect(odds[0]!).toBeLessThan(rested)
    expect(points(odds[0]!, rested)).toBeLessThan(6)
  })

  it('lean eases it by four a year, steady holds it, and it stays between 0 and 100', () => {
    const f = techLab('quantum', LIFE)
    const p = startProgram(f.g, f.b, f.t, programDef('quantum', 'qubits')!, 1)!
    p.years = 10
    f.t.pace = 'blitz'
    for (let n = 0; n < 4; n++) {
      p.progress = 0
      advancePrograms(f.g, f.a, f.b, f.t, f.g.year)
    }
    expect(p.fx!.fatigue).toBe(40)
    f.t.pace = 'steady'
    p.progress = 0
    advancePrograms(f.g, f.a, f.b, f.t, f.g.year)
    expect(p.fx!.fatigue).toBe(40)
    f.t.pace = 'lean'
    for (let n = 1; n <= 2; n++) {
      p.progress = 0
      advancePrograms(f.g, f.a, f.b, f.t, f.g.year)
      expect(p.fx!.fatigue).toBe(40 - 4 * n)
    }
    f.t.pace = 'blitz'
    for (let n = 0; n < 30; n++) {
      p.progress = 0
      advancePrograms(f.g, f.a, f.b, f.t, f.g.year)
    }
    expect(p.fx!.fatigue).toBe(100)
    f.t.pace = 'lean'
    for (let n = 0; n < 40; n++) {
      p.progress = 0
      advancePrograms(f.g, f.a, f.b, f.t, f.g.year)
    }
    expect('fx' in p, 'rested to nothing, the record is let go').toBe(false)
  })

  it('the pace table is still the calibration of cost, speed and team: blitz is 1.55x the cost and 1.5 years of work a year', () => {
    const f = techLab('quantum', LIFE)
    const p = startProgram(f.g, f.b, f.t, programDef('quantum', 'qubits')!, 1)!
    f.t.pace = 'blitz'
    const spent = p.spent
    const r = advancePrograms(f.g, f.a, f.b, f.t, f.g.year)
    expect(r.spend).toBe(Math.round(p.cost * 1.55))
    expect(p.progress).toBe(1.5)
    expect(p.spent).toBe(spent + r.spend)
  })
})

describe('a lost program teaches', () => {
  it('banks know-how in its trade; the next program of the trade starts with better odds, by at most 15 points; another trade is untouched; the reasons say so', () => {
    const f = techLab('quantum', LIFE)
    const other = techLab('biotech', LIFE)
    const def = programDef('quantum', 'qubits')!
    const otherDef = PROGRAMS.biotech.find((d) => !d.track)!
    const sibling = PROGRAMS.quantum.find((d) => d.id !== 'qubits' && !d.track)!
    const before = programTerms(f.b, f.t, def, 1)
    const siblingBefore = programTerms(f.b, f.t, sibling, 1)
    const otherBefore = programTerms(other.b, other.t, otherDef, 1)
    const p = due(f, 'quantum', 'qubits')
    const out = year(f, LOSS)
    expect(out.losses).toBe(1)
    expect(out.wins).toBe(0)
    const know = f.b.knowHow?.['dt.quantum']
    expect(know).toBeGreaterThan(0)
    expect(Object.keys(f.b.knowHow ?? {})).toEqual(['dt.quantum'])
    const after = programQuote(f.b, f.t, def, 1, f.g)
    const gain = points(before.odds, after.odds)
    expect(gain).toBeGreaterThan(1)
    expect(gain).toBeLessThanOrEqual(KNOW_ODDS_MAX)
    expect(after.years).toBe(before.years)
    expect(after.cost).toBe(before.cost)
    expect(after.quote.reasons.find((r) => r.key === 'know')?.pts).toBeGreaterThan(0)
    expect(oddsLine(after.quote)).toMatch(/know-how \+\d/)
    // A different program of the same trade shares the field.
    expect(programTerms(f.b, f.t, sibling, 1).odds).toBeGreaterThan(siblingBefore.odds)
    // Another trade's odds are what they were.
    expect(programTerms(other.b, other.t, otherDef, 1)).toEqual(otherBefore)
    expect(other.b.knowHow).toBeUndefined()
    // The valuation rule is the old one: a quarter of what it spent, and nothing more.
    expect(f.t.ipBook).toBeCloseTo(p.spent * 0.25, 6)
    expect(f.t.fails).toBe(1)
  })

  it('says why and what it taught on the lab report, on the same line, so the marks of the notes are unchanged', () => {
    const f = techLab('quantum', LIFE)
    due(f, 'quantum', 'qubits')
    const out = year(f, LOSS)
    expect(out.notes).toHaveLength(1)
    const note = out.notes[0]!
    expect(note.startsWith('\u{274C}')).toBe(true)
    expect(note).toContain('Crosstalk ruined the bigger chip.')
    expect(note).toMatch(/know-how \d+\./)
    expect(DASH.test(note)).toBe(false)
    const learned = note.slice(note.indexOf('them.') + 5).trim()
    expect(learned.length).toBeGreaterThan(20)
    expect(learned.length).toBeLessThanOrEqual(120)
  })

  it('the program that starts after a loss carries the better odds with it, and the roll does not count the know-how a second time', () => {
    const f = techLab('quantum', LIFE)
    const def = programDef('quantum', 'qubits')!
    const lost = due(f, 'quantum', 'qubits')
    year(f, LOSS)
    expect(lost.id).toBe('qubits')
    const quoted = programQuote(f.b, f.t, def, 1, f.g)
    const next = startProgram(f.g, f.b, f.t, def, 1)!
    expect(next.odds).toBe(quoted.odds)
    const rolled = finalQuote(f.g, f.a, f.b, f.t, next)
    expect(rolled.reasons.some((r) => r.key === 'know')).toBe(false)
    // The same stored odds in a lab that never failed roll the same.
    const twin = techLab('quantum', LIFE)
    const same = { ...next }
    expect(finalOdds(twin.g, twin.a, twin.b, twin.t, same)).toBe(finalOdds(f.g, f.a, f.b, f.t, next))
  })

  it('a win in a field the lab already knows says so, on the same line', () => {
    const f = techLab('quantum', LIFE)
    f.b.knowHow = { 'dt.quantum': 20 }
    due(f, 'quantum', 'qubits')
    const out = year(f, WIN)
    expect(out.wins).toBe(1)
    expect(out.notes[0]!.startsWith('\u{2705}')).toBe(true)
    expect(out.notes[0]).toMatch(/Know-how in the field holds at 20\.$/)
    expect(f.b.knowHow).toEqual({ 'dt.quantum': 20 })
  })

  it('a win banks none: the company keeps no know-how key, and its note stays the old line', () => {
    const f = techLab('quantum', LIFE)
    due(f, 'quantum', 'qubits')
    const out = year(f, WIN)
    expect(out.wins).toBe(1)
    expect(f.b.knowHow).toBeUndefined()
    expect(out.notes).toHaveLength(1)
    expect(out.notes[0]!.startsWith('\u{2705}')).toBe(true)
    expect(out.notes[0]).toMatch(/qubits\.$/)
  })

  it('a failed clinical trial teaches the trade too, and says so', () => {
    const f = techLab('biotech', LIFE)
    f.t.drugs = [{ id: 'd-t', name: 'Testomab', area: 'oncology', phase: 1, quality: 60, peak: 1, filed: 2030, approved: 0, royalty: 1, partner: '', failed: false }]
    f.t.programs = [{ id: 'trial', key: 'trial:d-t:1', name: 'Testomab: Phase II trial', emoji: '\u{1F9EA}', years: 1, progress: 0, cost: 1_000_000, odds: 0.5, started: f.g.year, spent: 0, target: 'd-t' }]
    const out = year(f, LOSS)
    expect(out.losses).toBe(1)
    expect(f.t.drugs[0]!.failed).toBe(true)
    expect(f.b.knowHow?.['dt.biotech']).toBeGreaterThan(0)
    expect(out.notes[0]).toMatch(/know-how \d+\./)
  })

  it('an AI capability track banks in its own capability: the retry of that track is better, another capability and the lab\'s other programs are not', () => {
    const f = capLab(LIFE)
    f.b.outlets[0]!.count = 2
    const cap = programDef('aiLab', 'cap.language')!
    const other = programDef('aiLab', 'cap.coding')!
    const plain = PROGRAMS.aiLab.find((d) => !d.track && d.id !== 'train')!
    const beforeCap = programTerms(f.b, f.t, cap, 1)
    const beforeOther = programTerms(f.b, f.t, other, 1)
    const beforePlain = programTerms(f.b, f.t, plain, 1)
    const p = startProgram(f.g, f.b, f.t, cap, 1)!
    p.progress = p.years - 1
    const out = year(f, LOSS)
    expect(out.losses).toBe(1)
    expect(Object.keys(f.b.knowHow ?? {})).toEqual(['dt.aiLab.cap.language'])
    const gain = points(beforeCap.odds, programTerms(f.b, f.t, cap, 1).odds)
    expect(gain).toBeGreaterThan(1)
    expect(gain).toBeLessThanOrEqual(KNOW_ODDS_MAX)
    expect(programTerms(f.b, f.t, other, 1)).toEqual(beforeOther)
    expect(programTerms(f.b, f.t, plain, 1)).toEqual(beforePlain)
    expect(programField('aiLab', 'language')).toBe('dt.aiLab.cap.language')
    expect(programField('quantum')).toBe('dt.quantum')
  })

  it('never buys more than 15 points, however much it has banked', () => {
    const f = techLab('quantum', LIFE)
    const def = programDef('quantum', 'qubits')!
    for (const k of [0.5, 1, 2, 3]) {
      f.b.knowHow = undefined as never
      delete (f.b as { knowHow?: unknown }).knowHow
      const plain = programTerms(f.b, f.t, def, k).odds
      f.b.knowHow = { 'dt.quantum': 100 }
      const best = programTerms(f.b, f.t, def, k).odds
      expect(points(plain, best), `k ${k}`).toBeLessThanOrEqual(KNOW_ODDS_MAX + 1e-9)
      expect(points(plain, best), `k ${k}`).toBeGreaterThanOrEqual(0)
    }
    f.b.knowHow = { 'dt.quantum': 1e9 }
    expect(programTerms(f.b, f.t, def, 3).odds).toBeLessThanOrEqual(0.98)
  })

  it('a program with no fx (an old save, a manager\'s lab) resolves and banks like any other', () => {
    const f = techLab('quantum', LIFE)
    f.b.ceo = 'manager'
    f.b.manager = { firstName: 'Ada', lastName: 'Grid', gender: 'female', skill: 70, salary: 100_000, since: f.g.year - 1 }
    const p = due(f, 'quantum', 'qubits')
    expect('fx' in p).toBe(false)
    expect(year(f, LOSS).losses).toBe(1)
    expect(f.b.knowHow?.['dt.quantum']).toBeGreaterThan(0)
  })

  it('draws one number per finished program, as chance did: four due programs move g.rng exactly four steps', () => {
    const f = techLab('quantum', LIFE)
    f.b.outlets[0]!.count = 4
    for (const id of ['cryo', 'algorithms', 'pqc', 'qubits']) due(f, 'quantum', id)
    const start = 12345
    f.g.rng = start
    const out = advancePrograms(f.g, f.a, f.b, f.t, f.g.year)
    expect(out.wins + out.losses).toBe(4)
    let state = start
    let steps = 0
    while (state !== f.g.rng && steps < 50) {
      state = nextRandom(state)[1]
      steps++
    }
    expect(state).toBe(f.g.rng)
    expect(steps).toBe(4)
  })
})

describe('what is shown', () => {
  it('programWhy names the lab\'s skill and the pace in whole points that add up to the odds', () => {
    const f = techLab('quantum', LIFE)
    const p = startProgram(f.g, f.b, f.t, programDef('quantum', 'qubits')!, 1)!
    f.t.pace = 'blitz'
    const q = finalQuote(f.g, f.a, f.b, f.t, p)
    const why = programWhy(f.g, f.a, f.b, f.t, p)
    expect(why).toEqual(q.reasons)
    expect(why.some((r) => r.label === 'lab skill')).toBe(true)
    expect(why.some((r) => r.label === 'blitz pace' && r.pts < 0)).toBe(true)
    expect(why.reduce((s, r) => s + r.pts, 0)).toBe(Math.round(q.p * 100) - Math.round(Math.min(0.95, Math.max(0.03, p.odds)) * 100))
    for (const r of why) expect(Number.isInteger(r.pts)).toBe(true)
    expect(oddsLine(q)).toMatch(/^Odds \d+%: /)
  })

  it('the budget slider says why at a budget other than the plan, names the frontier and the lab\'s know-how once there is any, and is the old line at the plan', () => {
    const f = techLab('quantum', LIFE)
    const def = programDef('quantum', 'qubits')!
    f.t.pace = 'steady'
    const lab = openTiles(f.g, businessAssetView(f.g, f.a)).find((n) => n.id === `dt.lab.${f.a.id}`) as MenuGroup
    const row = lab.children(f.g).find((n) => n.id.startsWith(`dt.rd.${def.id}.`)) as MenuAction
    const preview = row.input!.preview!
    const plan = preview(f.g, 100)
    expect(plan).toMatch(/% base odds/)
    expect(plan).not.toMatch(/Odds \d+%/)
    const rush = preview(f.g, 200)
    expect(rush).toMatch(/% base odds · Odds \d+%: funding \+\d/)
    expect(DASH.test(rush)).toBe(false)
    expect(noDraw(f.g, () => preview(f.g, 200))).toBe(true)
    // What a failed program banked shows at the plan's own budget as well.
    f.b.knowHow = { 'dt.quantum': 40 }
    const lab2 = openTiles(f.g, businessAssetView(f.g, f.a)).find((n) => n.id === `dt.lab.${f.a.id}`) as MenuGroup
    const row2 = lab2.children(f.g).find((n) => n.id.startsWith(`dt.rd.${def.id}.`)) as MenuAction
    expect(row2.input!.preview!(f.g, 100)).toMatch(/Odds \d+%: know-how \+\d/)
  })

  it('public research and rival pressure of the field reach the start odds, and only when the game is in hand', () => {
    const f = techLab('quantum', LIFE)
    const def = programDef('quantum', 'qubits')!
    const y = f.g.year
    const plain = programQuote(f.b, f.t, def, 1, f.g)
    expect(plain.quote.reasons).toEqual([])
    expect(applyDisclosure(f.g, { field: 'quantum', year: y, size: 1, origin: 'wave:dt1', by: 'you', shield: 'open' }).applied).toBe(true)
    const fed = programQuote(f.b, f.t, def, 1, f.g)
    const spill = fed.quote.reasons.find((r) => r.key === 'spill')
    expect(spill?.pts).toBeGreaterThan(0)
    expect(spill!.pts).toBeLessThanOrEqual(18)
    expect(fed.odds).toBeGreaterThan(plain.odds)
    // No game in hand (the oracle's call): the frontier is not read.
    expect(programTerms(f.b, f.t, def, 1).odds).toBe(plain.odds)
    // Another trade's field is not moved.
    const o = techLab('biotech', LIFE)
    applyDisclosure(o.g, { field: 'quantum', year: o.g.year, size: 1, origin: 'wave:dt2', by: 'you', shield: 'open' })
    expect(programQuote(o.b, o.t, PROGRAMS.biotech.find((d) => !d.track)!, 1, o.g).quote.reasons).toEqual([])
  })
})

describe('reads draw nothing and write nothing', () => {
  it('programTerms, programQuote, finalOdds, finalQuote and programWhy leave g.rng alone, on a deep-frozen state too', () => {
    const f = techLab('quantum', LIFE)
    const def = programDef('quantum', 'qubits')!
    const p = startProgram(f.g, f.b, f.t, def, 1)!
    f.t.pace = 'blitz'
    p.fx = { ...newFx(f.g.year), fatigue: 50 }
    const read = (): void => {
      programTerms(f.b, f.t, def, 2)
      programQuote(f.b, f.t, def, 2, f.g)
      finalOdds(f.g, f.a, f.b, f.t, p)
      finalQuote(f.g, f.a, f.b, f.t, p)
      programWhy(f.g, f.a, f.b, f.t, p)
    }
    expect(noDraw(f.g, read)).toBe(true)
    const snap = JSON.stringify(f.g)
    deepFreeze(f.g)
    expect(read).not.toThrow()
    expect(JSON.stringify(f.g)).toBe(snap)
  })

  it('the budget slider of a lab program is a read as well', () => {
    const f = techLab('quantum', LIFE)
    const def = programDef('quantum', 'qubits')!
    const q = programQuote(f.b, f.t, def, 1.5, f.g)
    expect(noDraw(f.g, () => programQuote(f.b, f.t, def, 1.5, f.g))).toBe(true)
    expect(q.quote.k).toBe(1.5)
  })
})

describe('money buys odds and speed, never a lower price', () => {
  it('100x the cash, the R&D account and the head count leave every price as it was, and the budget stays under 3', () => {
    const f = techLab('quantum', LIFE)
    const defs = PROGRAMS.quantum.filter((d) => !d.track)
    const price = (): number[] => defs.flatMap((d) => [programCost(f.b, f.t, d), programTerms(f.b, f.t, d, 1).cost, programTerms(f.b, f.t, d, 3).cost])
    const years = (): number[] => defs.map((d) => programTerms(f.b, f.t, d, 3).years)
    const before = price()
    const yearsBefore = years()
    f.b.cash *= 100
    f.t.venture *= 100
    f.b.employees = Math.max(1, f.b.employees) * 100
    f.a.value *= 100
    expect(price()).toEqual(before)
    expect(years()).toEqual(yearsBefore)
    for (const d of defs) {
      const x = programQuote(f.b, f.t, d, 1000, f.g)
      expect(x.quote.k).toBeLessThanOrEqual(3)
      expect(x.odds).toBeLessThanOrEqual(0.98)
      expect(x.cost).toBe(Math.round(programCost(f.b, f.t, d) * 3))
    }
  })
})

describe('TechProgram.fx is optional, validated and bounded', () => {
  const lab = (): { f: Lab; json: Record<string, Json> } => {
    const f = techLab('quantum', LIFE)
    startProgram(f.g, f.b, f.t, programDef('quantum', 'qubits')!, 1)
    const json = stored(f.t) as Record<string, Json>
    return { f, json }
  }
  const withFx = (json: Record<string, Json>, fx: Json): TechProgram => {
    const programs = (json.programs as Record<string, Json>[]).map((p) => ({ ...p, fx }))
    return readTech({ ...json, programs: programs as unknown as Json }).programs[0]!
  }

  it('an old program has none, and a good one comes back as the record it was', () => {
    const { json } = lab()
    expect('fx' in readTech(json).programs[0]!).toBe(false)
    const fx = { ...newFx(2030), fatigue: 30 } as unknown as Json
    const kept = withFx(json, fx)
    expect(kept.fx?.fatigue).toBe(30)
    expect(kept.fx?.v).toBe(1)
    expect(Object.keys(kept.fx!)).toEqual(Object.keys(newFx(2030)))
  })

  it('cuts every number to its cap', () => {
    const { json } = lab()
    const p = withFx(json, { v: 1, progress: 7, quality: 1e9, spent: 1e30, hours: 1e9, setbacks: 500, insight: 400, fatigue: 900, last: 1e9 } as unknown as Json)
    expect(p.fx).toEqual({ v: 1, progress: 1, quality: 10000, spent: 1e13, hours: 100000, setbacks: 99, insight: 100, fatigue: 100, last: 9999 })
  })

  it('drops a damaged one: not a record, an empty one, junk numbers', () => {
    const { json } = lab()
    for (const bad of ['junk', 5, null, true, [1, 2, 3], {}, { progress: 'x', last: 'y' }, { ...newFx(2030) }]) {
      expect('fx' in withFx(json, bad as Json), JSON.stringify(bad)).toBe(false)
    }
  })

  it('survives a hostile record: a __proto__ key speaks for nothing', () => {
    const { json } = lab()
    const hostile = JSON.parse('{"v":1,"fatigue":40,"last":2030,"__proto__":{"fatigue":99,"polluted":true}}') as Json
    const p = withFx(json, hostile)
    expect(p.fx!.fatigue).toBe(40)
    expect((p.fx as unknown as Record<string, unknown>).polluted).toBeUndefined()
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('round-trips through the saved company: techOf and a second read are the same', () => {
    const { f } = lab()
    f.t.pace = 'blitz'
    advancePrograms(f.g, f.a, f.b, f.t, f.g.year)
    const once = readTech(stored(f.t))
    expect(once.programs[0]!.fx?.fatigue).toBe(10)
    expect(readTech(stored(once))).toEqual(once)
    const b = bizOf(f.g, f.a)
    expect(b).toBe(f.b)
  })
})

describe('the autopilot still starts programs', () => {
  it('an idle lab run by a manager picks and starts something', () => {
    const f = techLab('quantum', LIFE)
    f.b.ceo = 'manager'
    f.b.manager = { firstName: 'Ada', lastName: 'Grid', gender: 'female', skill: 80, salary: 100_000, since: f.g.year - 1 }
    f.t.programs = []
    deepTechManagerTurnImpl(f.g, f.a, f.b)
    expect(f.t.programs.length).toBeGreaterThan(0)
    for (const p of f.t.programs) expect(p.odds).toBeGreaterThanOrEqual(0.02)
  })
})

describe('the adapter is a leaf and speaks plainly', () => {
  it('is in no import cycle, imports no module of the business cycle and reads the engine through effort/', async () => {
    const g = await readImportGraph(ROOT)
    const inCycle = new Set(cycleComponents(g).flat())
    expect(g.has(ADAPTER)).toBe(true)
    expect(inCycle.has(ADAPTER)).toBe(false)
    for (const to of g.get(ADAPTER) ?? []) expect(inCycle.has(to), `${ADAPTER} imports ${to}, a member of an import cycle`).toBe(false)
    expect([...(g.get('src/game/business/deeptech-rd.ts') ?? [])]).toContain(ADAPTER)
    const text = readFileSync(join(ROOT, ADAPTER), 'utf8')
    expect(text).toMatch(/from '\.\.\/effort\/engine'/)
    expect(text).not.toMatch(/\bg\.rng\b|\brand\(|\bchance\(/)
    expect(DASH.test(text)).toBe(false)
  })

  it('the old inline formulas are gone from the wrappers, and the draws are the same two calls', () => {
    const text = readFileSync(join(ROOT, 'src/game/business/deeptech-rd.ts'), 'utf8')
    expect(text).not.toMatch(/Math\.pow\(m, -0\.35\)/)
    expect(text).not.toMatch(/0\.75 \+ skill \/ 200/)
    expect(text).not.toMatch(/\bchance\(/)
    expect(text).toMatch(/\bresolve\(/)
    expect(DASH.test(text)).toBe(false)
  })

  it('quote is the real engine behind the spy', () => {
    expect(typeof realQuote).toBe('function')
  })
})
