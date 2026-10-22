// R3-M6 (C.3): the AI capability tracks on the Effort engine. A capability track is a deep-tech program (M5 put programTerms and the roll on
// `quote`), and this task gives it its own task: `capTask(cap, level)` is the track's calibration (flat odds .65, two years, a yearly price of
// 3M x 1.4^level, the capability's own know-how field `dt.aiLab.cap.<cap>`), and `capProgram` reads its price and its odds from it.
// `capKnowledge(t, cap)` is the research level as a 0 to 100 view for the Knowledge screens: the level already lifts every model a lab trains
// (modelRating's `research` term), so the odds take only the know-how a failure banked and never the level, which keeps the odds exact.
//
// What this file pins: the oracle (test/fixtures/effort-parity.json, recorded on v5.0.0) holds for the aicaps grid (terms, rolls, the
// modelRating regression guard) and its lifecycle (two tracks, one meant to work and one to stall); a lost track banks in its own capability
// and in no other, so its retry is better by more than 0 and at most 15 points, and the lab report's line says what it taught; the cost curve
// is 3M x 1.4^n bit for bit and the odds are flat in the level; a read draws nothing; money buys odds and speed and never a lower price
// (100x probe); modelRating never passes the market's best plus 90, however much research and compute it is given; the adapter is a leaf.
//
// No pinned seed: lives are the kit's tuples; a certain win or loss sets g.rng to a state whose next draw is low or high.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { businessAssetView } from '../src/game/business'
import { benchYear, capBest, capWeight, modelRating, releasedRating } from '../src/game/business/ai-bench'
import { CAP_IDS, type CapId } from '../src/game/business/ai-bench-data'
import { capKnowledge, capTask, CAP_LEVEL_MAX } from '../src/game/business/aicap-effort'
import { familyId } from '../src/game/business/competition-roster'
import { modelGens, programDef, PROGRAMS } from '../src/game/business/deeptech-data'
import { rdScale } from '../src/game/business/deeptech-core'
import { programField, programTask } from '../src/game/business/deeptech-effort'
import { advancePrograms, bestCapTrack, finalOdds, programBlock, programCost, programQuote, programTerms, startProgram, type RdResult } from '../src/game/business/deeptech-rd'
import { readTech, type TechState } from '../src/game/business/deeptech-state'
import type { BizState } from '../src/game/business/state'
import { KNOW_ODDS_MAX } from '../src/game/effort/limits'
import { nextRandom } from '../src/game/rng'
import type { Asset, GameState, Json, MenuAction, MenuNode } from '../src/game/types'
import { applyDisclosure } from '../src/game/world/frontier'
import '../src/game/world/shards'
import { cycleComponents, readImportGraph } from './arch-kit'
import { capLab, expectLifecycle, expectParity, type Life } from './effort-parity-kit'
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
const ADAPTER = 'src/game/business/aicap-effort.ts'

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

const cap = (id: CapId) => programDef('aiLab', `cap.${id}`)!

/** Starts a capability track of the lab and makes it due at the next year-end. */
function due(f: Lab, id: CapId, k = 1): void {
  const p = startProgram(f.g, f.b, f.t, cap(id), k)!
  expect(p, `cap.${id} starts`).not.toBeNull()
  p.progress = Math.max(0, p.years - 1)
}

/** Runs one year of the lab with the next draw fixed. */
function year(f: Lab, rng: number): RdResult {
  f.g.rng = rng
  return advancePrograms(f.g, f.a, f.b, f.t, f.g.year)
}

const points = (a: number, b: number): number => (b - a) * 100

/** The first menu node with this id, looking through every open group (the lab menu is a few levels deep). */
function findNode(g: GameState, nodes: readonly MenuNode[], id: string, depth = 0): MenuNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.type === 'menu' && depth < 4) {
      const hit = findNode(g, n.children(g), id, depth + 1)
      if (hit) return hit
    }
  }
  return undefined
}
/** The price the lab has always paid: the old inline expression, kept here as the independent oracle. */
const legacyCost = (n: number): number => 3_000_000 * 1.4 ** n

describe('the oracle of v5.0.0 holds', () => {
  it('every row of the aicaps grid is within the tolerance: terms, rolls, and the modelRating regression guard', { timeout: TIMEOUT }, () => {
    expectParity('aicaps')
  })

  it('the AI lab lifecycle is byte for byte: two tracks, one meant to work and one to stall (lines, levels, notes, g.rng)', { timeout: TIMEOUT }, () => {
    expectLifecycle('aicaps')
  })

  it('a capability track\'s odds are a quote of the engine: at least one quote a read of its terms, and one a roll', () => {
    const f = capLab(LIFE)
    const before = spy.calls
    const terms = programTerms(f.b, f.t, cap('coding'), 2, f.g)
    expect(spy.calls).toBeGreaterThan(before)
    const p = startProgram(f.g, f.b, f.t, cap('coding'), 1)!
    const mid = spy.calls
    const odds = finalOdds(f.g, f.a, f.b, f.t, p)
    expect(spy.calls).toBeGreaterThan(mid)
    expect(terms.odds).toBeGreaterThan(0.65)
    expect(odds).toBeGreaterThanOrEqual(0.03)
    expect(odds).toBeLessThanOrEqual(0.95)
  })
})

describe('capTask: the track as a task of the engine', () => {
  it('is the track\'s calibration: its own know-how field, flat odds .65, two years, 3M x 1.4^level, a budget of .5 to 3 and a neutral field', () => {
    for (const id of CAP_IDS) {
      for (const level of [0, 1, 5, 10, 19, 20]) {
        const task = capTask(id, level)
        expect(task.field).toBe(`dt.aiLab.cap.${id}`)
        expect(task.field).toBe(programField('aiLab', id))
        expect(task.mode).toBe('project')
        expect(task.p0).toBe(0.65)
        expect(task.baseYears).toBe(2)
        expect(task.cost).toBe(legacyCost(level))
        expect(task.oddsExp).toBe(0.35)
        expect(task.yearsExp).toBe(0.55)
        expect(task.kmax).toBe(3)
        expect(task.minYears).toBe(0.5)
        expect(task.maxYears).toBe(10)
        expect(task.oddsLo).toBe(0.02)
        expect(task.oddsHi).toBe(0.98)
        // A neutral field: the level costs money and makes models better, it does not make the odds worse (the oracle's rows are exact).
        expect(task.hardness).toBe(1)
        expect(Object.isFrozen(task)).toBe(true)
      }
    }
  })

  it('is the program task of the same facts: the lab\'s funding quote and the capability\'s own task are one calibration', () => {
    const f = capLab(LIFE)
    for (const id of CAP_IDS) {
      for (const level of [0, 4, 19]) {
        f.t.caps = { [id]: level }
        const def = cap(id)
        const scale = rdScale(f.b.countryId)
        // The program's facts at the lab's own scale: the task is the same calibration with the local price.
        const facts = { field: programField('aiLab', id), cost: programCost(f.b, f.t, def), years: def.years, odds: def.odds(f.t) }
        expect(programTask(facts)).toEqual({ ...capTask(id, level), cost: Math.round(legacyCost(level) * scale) })
      }
    }
  })

  it('is built for any level, even a damaged one, and never throws: a level that is not a number is level 0, a huge one is the last', () => {
    for (const bad of [Number.NaN, -3, -Infinity, Infinity, 1e9, 1.5, 20.5]) {
      const task = capTask('coding', bad)
      expect(task.cost).toBeGreaterThan(0)
      expect(Number.isFinite(task.cost)).toBe(true)
    }
    expect(capTask('coding', Number.NaN).cost).toBe(3_000_000)
    expect(capTask('coding', -3).cost).toBe(3_000_000)
    expect(capTask('coding', Infinity).cost).toBe(legacyCost(CAP_LEVEL_MAX))
    expect(capTask('coding', 1e9).cost).toBe(legacyCost(CAP_LEVEL_MAX))
  })

  it('capProgram reads its price and its odds from the task: every capability and level, bit for bit the old curve', () => {
    for (const id of CAP_IDS) {
      for (let level = 0; level <= CAP_LEVEL_MAX; level++) {
        const t = { ...readTech(undefined), caps: { [id]: level } }
        expect(cap(id).cost(t), `${id} ${level}`).toBe(legacyCost(level))
        expect(cap(id).cost(t)).toBe(capTask(id, level).cost)
        expect(cap(id).odds(t)).toBe(0.65)
        expect(cap(id).odds(t)).toBe(capTask(id, level).p0)
        expect(cap(id).years).toBe(capTask(id, level).baseYears)
      }
    }
    // A capability the lab never researched is level 0.
    expect(cap('vision').cost(readTech(undefined))).toBe(3_000_000)
  })

  it('the Fully researched gate is level 20 and no other', () => {
    const t = { ...readTech(undefined), models: capLab(LIFE).t.models }
    expect(CAP_LEVEL_MAX).toBe(20)
    for (const id of CAP_IDS) {
      expect(cap(id).gate({ ...t, caps: { [id]: 19 } }, 'us')).toBeNull()
      expect(cap(id).gate({ ...t, caps: { [id]: 20 } }, 'us')).toBe('Fully researched.')
    }
  })
})

describe('capKnowledge: the research level as 0 to 100', () => {
  it('is 0 at a fresh lab, 5 points a level, 100 at level 20, and a view only', () => {
    const t = readTech(undefined)
    for (const id of CAP_IDS) expect(capKnowledge(t, id)).toBe(0)
    for (let level = 0; level <= CAP_LEVEL_MAX; level++) {
      expect(capKnowledge({ ...t, caps: { coding: level } }, 'coding')).toBe(Math.round((100 * level) / 20))
    }
    expect(capKnowledge({ ...t, caps: { coding: 4 } }, 'language')).toBe(0)
    // The odds do not read it: the level is the same level at every point of the curve.
    const f = capLab(LIFE)
    const flat = programTerms(f.b, f.t, cap('coding'), 1).odds
    for (const level of [0, 5, 19]) {
      f.t.caps = { coding: level }
      expect(programTerms(f.b, f.t, cap('coding'), 1).odds).toBe(flat)
    }
  })

  it('is cut to its range for a damaged level, and rises with a win', () => {
    const t = readTech(undefined)
    for (const bad of [Number.NaN, -5, Infinity, 1e9, 33]) {
      const k = capKnowledge({ ...t, caps: { coding: bad } }, 'coding')
      expect(k).toBeGreaterThanOrEqual(0)
      expect(k).toBeLessThanOrEqual(100)
    }
    expect(capKnowledge({ ...t, caps: { coding: 1e9 } }, 'coding')).toBe(100)
    const f = capLab(LIFE)
    f.t.caps = { language: 4 }
    expect(capKnowledge(f.t, 'language')).toBe(20)
    due(f, 'language')
    expect(year(f, WIN).wins).toBe(1)
    expect(f.t.caps.language).toBe(5)
    expect(capKnowledge(f.t, 'language')).toBe(25)
  })
})

describe('a lost track teaches its own capability', () => {
  it('banks in dt.aiLab.cap.<cap> at level 4: the retry is better by more than 0 and at most 15 points, another capability and the other programs are not', () => {
    const f = capLab(LIFE)
    f.t.caps = { language: 4 }
    const other = cap('coding')
    const plain = PROGRAMS.aiLab.find((d) => !d.track && d.id !== 'train')!
    const beforeCap = programTerms(f.b, f.t, cap('language'), 1)
    const beforeOther = programTerms(f.b, f.t, other, 1)
    const beforePlain = programTerms(f.b, f.t, plain, 1)
    due(f, 'language')
    const out = year(f, LOSS)
    expect(out.losses).toBe(1)
    expect(f.t.caps.language).toBe(4)
    expect(Object.keys(f.b.knowHow ?? {})).toEqual(['dt.aiLab.cap.language'])
    const retry = programTerms(f.b, f.t, cap('language'), 1)
    const gain = points(beforeCap.odds, retry.odds)
    expect(gain).toBeGreaterThan(0)
    expect(gain).toBeLessThanOrEqual(KNOW_ODDS_MAX)
    // The price of the retry is the price it was: the same level costs the same again.
    expect(retry.cost).toBe(beforeCap.cost)
    expect(programTerms(f.b, f.t, other, 1)).toEqual(beforeOther)
    expect(programTerms(f.b, f.t, plain, 1)).toEqual(beforePlain)
  })

  it('shows it: the report line keeps the old stalled line and the mark, then says why and what it taught', () => {
    const f = capLab(LIFE)
    f.t.caps = { coding: 4 }
    due(f, 'coding')
    const out = year(f, LOSS)
    expect(out.losses).toBe(1)
    expect(out.notes).toHaveLength(1)
    const line = out.notes[0]!
    expect(line.startsWith('\u{274C}')).toBe(true)
    expect(line).toContain('Coding research stalled. The same level costs the same again.')
    expect(line).toMatch(/ The coding work hit a dead end\./)
    expect(line).toMatch(/ The failure still taught you the field: know-how \d+\.$/)
    expect(DASH.test(line)).toBe(false)
  })

  it('a win banks none and its line is the old one', () => {
    const f = capLab(LIFE)
    f.t.caps = { agents: 2 }
    due(f, 'agents')
    const out = year(f, WIN)
    expect(out.wins).toBe(1)
    expect(f.b.knowHow).toBeUndefined()
    expect(out.notes).toHaveLength(1)
    expect(out.notes[0]).toBe('\u{2705} Agents research reached level 3. Your next model will use it.')
  })

  it('never buys more than 15 points, however much a capability has banked, at any budget', () => {
    const f = capLab(LIFE)
    f.t.caps = { science: 6 }
    for (const k of [0.5, 1, 2, 3]) {
      delete (f.b as { knowHow?: unknown }).knowHow
      const plain = programTerms(f.b, f.t, cap('science'), k).odds
      f.b.knowHow = { 'dt.aiLab.cap.science': 100 }
      const best = programTerms(f.b, f.t, cap('science'), k).odds
      expect(points(plain, best), `k ${k}`).toBeLessThanOrEqual(KNOW_ODDS_MAX + 1e-9)
      expect(points(plain, best), `k ${k}`).toBeGreaterThanOrEqual(0)
    }
    f.b.knowHow = { 'dt.aiLab.cap.science': 1e9 }
    expect(programTerms(f.b, f.t, cap('science'), 3).odds).toBeLessThanOrEqual(0.98)
  })

  it('a track with no fx and a company with no know-how (a v5.0.0 save) resolves and banks like any other', () => {
    const f = capLab(LIFE)
    f.t.caps = { reasoning: 3 }
    due(f, 'reasoning')
    // The saved lab, as JSON, read back the way a load reads it.
    const saved = JSON.parse(JSON.stringify(f.t)) as Record<string, Json>
    delete (saved.programs as unknown as Record<string, Json>[])[0]!.fx
    const back = readTech(saved)
    expect('fx' in back.programs[0]!).toBe(false)
    f.t.programs = back.programs
    expect(year(f, LOSS).losses).toBe(1)
    expect(f.b.knowHow?.['dt.aiLab.cap.reasoning']).toBeGreaterThan(0)
  })
})

describe('what is shown', () => {
  it('the budget slider of a track says why at a budget other than the plan, and names what a failure banked', () => {
    const f = capLab(LIFE)
    f.t.pace = 'steady'
    // The track's row sits under the lab's Benchmarks, in its Research list.
    const row = (): MenuAction => {
      const found = findNode(f.g, openTiles(f.g, businessAssetView(f.g, f.a)), `dt.rd.cap.language.${f.a.id}`)
      expect(found, 'the track row is in the lab menu').toBeDefined()
      return found as MenuAction
    }
    const preview = row().input!.preview!
    const plan = preview(f.g, 100)
    expect(plan).toMatch(/% base odds/)
    expect(plan).not.toMatch(/Odds \d+%/)
    const rush = preview(f.g, 200)
    expect(rush).toMatch(/% base odds · Odds \d+%: funding \+\d/)
    expect(DASH.test(rush)).toBe(false)
    expect(noDraw(f.g, () => preview(f.g, 200))).toBe(true)
    f.b.knowHow = { 'dt.aiLab.cap.language': 40 }
    expect(row().input!.preview!(f.g, 100)).toMatch(/Odds \d+%: know-how \+\d/)
    // The line under the row is the old one: the plan's own price and base odds.
    const sub = row().subtitle
    const text = typeof sub === 'function' ? sub(f.g) : sub
    expect(text).toContain(`${Math.round(0.65 * 100)}% base odds`)
  })

  it('public research in the capability\'s own field lifts that capability\'s odds and no other\'s, when the game is in hand', () => {
    const f = capLab(LIFE)
    const language = programQuote(f.b, f.t, cap('language'), 1, f.g)
    const coding = programQuote(f.b, f.t, cap('coding'), 1, f.g)
    expect(language.quote.reasons).toEqual([])
    expect(applyDisclosure(f.g, { field: 'ai.language', year: f.g.year, size: 1, origin: 'wave:ai1', by: 'you', shield: 'open' }).applied).toBe(true)
    const fed = programQuote(f.b, f.t, cap('language'), 1, f.g)
    const spill = fed.quote.reasons.find((r) => r.key === 'spill')
    expect(spill?.pts).toBeGreaterThan(0)
    expect(spill!.pts).toBeLessThanOrEqual(18)
    expect(fed.odds).toBeGreaterThan(language.odds)
    expect(programQuote(f.b, f.t, cap('coding'), 1, f.g).odds).toBe(coding.odds)
    // No game in hand (the oracle's call): the frontier is not read.
    expect(programTerms(f.b, f.t, cap('language'), 1).odds).toBe(language.odds)
  })
})

describe('reads draw nothing and write nothing', () => {
  it('bestCapTrack picks the track the old price picks, and draws nothing, on a deep-frozen state too', () => {
    const f = capLab(LIFE)
    f.b.outlets[0]!.count = 8
    f.t.caps = { language: 7, coding: 2, vision: 11 }
    // The pick, from the old inline price: the weighted rating gain of one more level over the cost of its first two years.
    const year0 = benchYear(f.g)
    const fam = familyId(f.g.lifeId)
    const compute = Math.min(12, 2 * f.t.plant + 0.8 * f.t.rented)
    let want: CapId | null = null
    let score = -Infinity
    for (const id of CAP_IDS) {
      if (programBlock(f.b, f.t, cap(id))) continue
      const next = { cap: id, year: year0, fam, gen: modelGens(f.t) + 1, level: f.t.level, compute, spec: 0, roll: 0.5, released: releasedRating(f.t.models, id) }
      const have = f.t.caps[id] ?? 0
      const gain = capWeight(id, year0) * (modelRating({ ...next, research: have + 1 }) - modelRating({ ...next, research: have }))
      const value = gain / (2 * Math.round(legacyCost(have) * rdScale(f.b.countryId)))
      if (value > score) {
        score = value
        want = id
      }
    }
    expect(want).not.toBeNull()
    expect(bestCapTrack(f.g, f.a, f.b, f.t)).toBe(want)
    expect(noDraw(f.g, () => bestCapTrack(f.g, f.a, f.b, f.t))).toBe(true)
    const read = (): void => {
      bestCapTrack(f.g, f.a, f.b, f.t)
      for (const id of CAP_IDS) {
        capTask(id, f.t.caps[id] ?? 0)
        capKnowledge(f.t, id)
        cap(id).cost(f.t)
        cap(id).odds(f.t)
        programTerms(f.b, f.t, cap(id), 2, f.g)
        programQuote(f.b, f.t, cap(id), 2, f.g)
      }
    }
    expect(noDraw(f.g, read)).toBe(true)
    const snap = JSON.stringify(f.g)
    deepFreeze(f.g)
    expect(read).not.toThrow()
    expect(JSON.stringify(f.g)).toBe(snap)
  })
})

describe('money buys odds and speed, never a lower price', () => {
  it('100x the cash, the R&D account, the head count and the valuation leave every track\'s price as it was, and the budget stays under 3', () => {
    const f = capLab(LIFE)
    f.t.caps = { language: 3, coding: 9 }
    const tracks = PROGRAMS.aiLab.filter((d) => d.track)
    const price = (): number[] => tracks.flatMap((d) => [programCost(f.b, f.t, d), programTerms(f.b, f.t, d, 1).cost, programTerms(f.b, f.t, d, 3).cost])
    const years = (): number[] => tracks.map((d) => programTerms(f.b, f.t, d, 3).years)
    const before = price()
    const yearsBefore = years()
    f.b.cash *= 100
    f.t.venture *= 100
    f.b.employees = Math.max(1, f.b.employees) * 100
    f.a.value *= 100
    expect(price()).toEqual(before)
    expect(years()).toEqual(yearsBefore)
    for (const d of tracks) {
      const x = programQuote(f.b, f.t, d, 1000, f.g)
      expect(x.quote.k).toBeLessThanOrEqual(3)
      expect(x.odds).toBeLessThanOrEqual(0.98)
      expect(x.cost).toBe(Math.round(programCost(f.b, f.t, d) * 3))
    }
  })

  it('modelRating never passes the market\'s best plus 90 at 100x the research and the compute, in any capability or year', () => {
    for (const id of CAP_IDS) {
      for (const y of [2026, 2030, 2040]) {
        const best = capBest('grid', id, y)
        for (const research of [0, 20, 2000]) {
          for (const compute of [0, 12, 1200]) {
            const rating = modelRating({ cap: id, year: y, fam: 'grid', gen: 8, level: 6000, compute, research, spec: 0, roll: 1, released: 0 })
            expect(rating, `${id} ${y} research ${research} compute ${compute}`).toBeLessThanOrEqual(best + 90)
          }
        }
      }
    }
  })

  it('the price of a track at level 20 is finite and the cost curve never reads the lab\'s money', () => {
    const f = capLab(LIFE)
    f.t.caps = { agents: 20 }
    const d = cap('agents')
    expect(Number.isFinite(programCost(f.b, f.t, d))).toBe(true)
    expect(d.cost(f.t)).toBe(legacyCost(20))
    f.b.cash = 1e15
    expect(d.cost(f.t)).toBe(legacyCost(20))
  })
})

describe('the adapter is a leaf and speaks plainly', () => {
  it('is in no import cycle, imports no module of the business cycle, and capProgram reads it', async () => {
    const g = await readImportGraph(ROOT)
    const inCycle = new Set(cycleComponents(g).flat())
    expect(g.has(ADAPTER)).toBe(true)
    expect(inCycle.has(ADAPTER)).toBe(false)
    for (const to of g.get(ADAPTER) ?? []) expect(inCycle.has(to), `${ADAPTER} imports ${to}, a member of an import cycle`).toBe(false)
    expect([...(g.get('src/game/business/deeptech-data.ts') ?? [])]).toContain(ADAPTER)
    const text = readFileSync(join(ROOT, ADAPTER), 'utf8')
    expect(text).toMatch(/from '\.\/deeptech-effort'/)
    expect(text).not.toMatch(/\bg\.rng\b|\brand\(|\bchance\(/)
    expect(DASH.test(text)).toBe(false)
  })

  it('the old inline curve is gone from the data file, and the research ceiling of modelRating is untouched', () => {
    const data = readFileSync(join(ROOT, 'src/game/business/deeptech-data.ts'), 'utf8')
    const start = data.indexOf('export function capProgram')
    const body = data.slice(start, data.indexOf("/** The lab's model family name", start))
    expect(start).toBeGreaterThan(0)
    expect(body).toMatch(/capTask\(cap, levels\(t\)\)\.cost/)
    expect(body).toMatch(/capTask\(cap, levels\(t\)\)\.p0/)
    expect(body).not.toMatch(/3_000_000/)
    expect(body).not.toMatch(/fixed\(/)
    expect(body).not.toMatch(/levels\(t\) >= 20/)
    expect(DASH.test(body)).toBe(false)
    const bench = readFileSync(join(ROOT, 'src/game/business/ai-bench.ts'), 'utf8')
    expect(bench).toMatch(/ceiling - room \* Math\.E \*\* \(-\(raw - ref\) \/ room\)/)
  })
})
