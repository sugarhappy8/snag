// R3-M11 (C.3, J.8): the sweep of the Effort migration track. The seven research systems (product R&D, Heavy R&D, Operations R&D,
// deep tech, the AI capability tracks, the studio engines and the Workshop's builds) each have a test of their own (test/effort-<system>.test.ts).
// This file holds what only the systems together can show, so a later change to one of them cannot break a promise of the whole.
//
//   record      test/fixtures/effort-parity.json is complete (seven systems, the recorded grid sizes, no gap, the hashes of the grids), was
//               recorded on the unmodified research code under the CI Node, and every system's grid and lifecycle still hold: the odds and
//               the quality within a point, the years and the price exact, g.rng and what the lives made byte for byte
//   wrappers    every system's file asks `quote`, and none of the old inline formulas is left in a wrapper (a token scan)
//   money       100 times the cash, the valuation and the head count change nothing of any system's price, its odds or its years; the
//               budget stops at the task's own ceiling (at most 4); the odds stay under the legacy clamp; the studio's engine never fails
//   200 years   one founder with a product company, Heavy R&D, Operations R&D, a deep tech lab and its capability tracks, a studio and a
//               Workshop plays 200 years of direct steps at maximum inputs: k within kmax and 4, know-how within 100 and within 15
//               odds points, the odds inside the legacy clamp, the quality inside the ceiling, the books balanced, no money made
//   state       12 companies over 50 real years keep at most 3,000 JSON nodes in `fx` records and `knowHow` maps
//   reads       a quote, a hint, an odds line and a menu row draw nothing from g.rng and read a deep-frozen game, in every system
//   why         every migrated screen shows the odds line (or, for a studio, the pace in words), and every failed result says why and
//               what it taught; the labels of the frontier terms are the Effort engine's
//   record      moved-tests.md has five cells and a reason in every row of the migration lanes
//
// No pinned seed: every life is a tuple the test kits already use, and a certain loss or win sets g.rng to a state whose next draw is
// high or low (nothing is drawn to find it).
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { K_ID, K_PUNCT, loadSources, toSource, type SourceFile, type Tok } from './scan-kit'
import {
  GRIDS,
  PARITY_DIGITS,
  PARITY_FILE,
  SYSTEMS,
  TOL,
  compareParity,
  expectLifecycle,
  gridHash,
  gridInputs,
  idOf,
  inputGrid,
  parityDiff,
  probe,
  type ParityRow,
  type SystemId,
} from './effort-parity-kit'
import { ceoSlack } from './ceo-edge-kit'
import { capLab, neutralAmbition, techLab, tradeFixture, setCompany, type Life } from './effort-parity-kit'
import { deepFreeze } from './fuzz-kit'
import { labGame, noDraw, patchLab } from './lab-kit'
import { adult, allNodes, company, nextYear } from './market-kit'
import { openTiles, makeTestGame } from './helpers'
import { give, idea as ideaTarget, ideaMenu, inventor } from './workshop-fixtures'
import { businessAssetView } from '../src/game/business'
import { capTask } from '../src/game/business/aicap-effort'
import { techOf } from '../src/game/business/deeptech-core'
import { PROGRAMS, programDef } from '../src/game/business/deeptech-data'
import { programField, programTask } from '../src/game/business/deeptech-effort'
import { advancePrograms, programBlock, programCost, programQuote, startProgram, type RdResult } from '../src/game/business/deeptech-rd'
import { readTech, type TechState } from '../src/game/business/deeptech-state'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { saveStudio, studioNodes, studioOf } from '../src/game/business/gamestudio'
import { engineTier } from '../src/game/business/gamestudio-engine-state'
import { simulateStudioEngines, startStudioEngine } from '../src/game/business/gamestudio-engines'
import { breakthroughsFor } from '../src/game/business/heavy-data'
import { heavyField } from '../src/game/business/heavy-effort'
import { advanceHeavy, heavyBlock, heavyCost, heavyQuote, heavyTask, startHeavy } from '../src/game/business/heavy-rd'
import { opsField } from '../src/game/business/lab-effort'
import { labMenus } from '../src/game/business/lab-menu'
import { opsBlock, opsOffers, opsPrice, opsQuote, opsTask } from '../src/game/business/lab-rules'
import { readLab } from '../src/game/business/lab-state'
import { advanceLab, startOps } from '../src/game/business/lab-year'
import { lineInfo } from '../src/game/business/product-market'
import { classicIdeas } from '../src/game/business/products'
import { advanceRd, baseYears, RD_MAX, rdBlock, rdCost, rdOf, rdQuote, researchState, startRd } from '../src/game/business/rd'
import { rdBase, rdField, rdTask } from '../src/game/business/rd-effort'
import { bookResearch, ownerRuns, researchInputs } from '../src/game/business/research-effort'
import { bizOf, readBiz, type BizState, type RdProject } from '../src/game/business/state'
import { ENGINE_FIELD, engineActor, engineOutcome, engineQuote, engineTask } from '../src/game/business/studio-effort'
import type { Industry } from '../src/game/data/markets'
import { quote } from '../src/game/effort/engine'
import { newFx } from '../src/game/effort/fx'
import { K_MAX, KNOW_HOW_FIELDS, KNOW_MAX, KNOW_ODDS_MAX, RHO_MAX, TERM_LABEL } from '../src/game/effort/limits'
import { boldOf } from '../src/game/effort/curves'
import { deviate } from '../src/game/effort/factors'
import { knowHowOf } from '../src/game/effort/knowhow'
import { ambitionOf, readYou, writeYou } from '../src/game/effort/persona'
import { resolve, step } from '../src/game/effort/step'
import type { EffortInput, Outcome, StepResult, Task, Worker } from '../src/game/effort/types'
import { checkLedger } from '../src/game/kernel/ledger'
import { nextRandom } from '../src/game/rng'
import type { Asset, GameState, Json, MenuAction, MenuGroup, MenuInfo, MenuNode } from '../src/game/types'
import { FRONTIER_REASONS } from '../src/game/world/frontier-terms'
import { getCountry } from '../src/game/world'
import { APPROACHES, buildCost, buildOdds, resolveBuild } from '../src/game/workshop/build'
import { buildInputs, buildTask } from '../src/game/workshop/effort'
import { catalogIdea } from '../src/game/workshop/catalog'
import { readWorkshop } from '../src/game/workshop/notebook'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const TIMEOUT = 240_000
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)

// ---------------------------------------------------------------------------------------------------------------------
// The record

/** The rows each system's grid has, written out: the fixture cannot shrink or grow without this list (and the owner) agreeing. */
const RECORDED_ROWS: Record<SystemId, number> = { rd: 310, heavy: 27, ops: 162, deeptech: 652, aicaps: 672, studio: 360, workshop: 1224 }

interface RawSystem {
  gridHash: string
  grid: { part: string; axes: Record<string, unknown[]>; n: number }[]
  rows: { id: string; odds?: number; years?: number; quality?: number; cost?: number; extra?: Record<string, number> }[]
  lifecycle: { digest: string; facts: Record<string, unknown> }
}
interface RawOracle {
  v: number
  node: string
  head: string
  digits: number
  systems: Record<string, RawSystem>
}

const oracle = (): RawOracle => JSON.parse(readFileSync(join(ROOT, PARITY_FILE), 'utf8')) as RawOracle

/** Whether the rows run in a sequence that makes up the grid of the system: no point missing, none added, none out of place. */
function gaps(system: SystemId, raw: RawSystem): string[] {
  const want = gridInputs(system).map(idOf)
  const have = raw.rows.map((r) => r.id)
  const out: string[] = []
  const haveSet = new Set(have)
  for (const id of want) if (!haveSet.has(id)) out.push(`${id} is missing`)
  const wantSet = new Set(want)
  for (const id of have) if (!wantSet.has(id)) out.push(`${id} is not in the grid`)
  if (new Set(have).size !== have.length) out.push('a row appears twice')
  if (out.length === 0 && have.some((id, i) => id !== want[i])) out.push('the rows are out of the grid order')
  return out
}

describe('the oracle of v5.0.0 is complete', () => {
  it('has the header of a recording on the unmodified code under the CI Node: version 1, Node 22, 9 digits, v5.0.0', () => {
    const o = oracle()
    expect(o.v).toBe(1)
    expect(o.node).toMatch(/^v22\.\d+\.\d+$/)
    expect(o.digits).toBe(PARITY_DIGITS)
    // The commit the recorder ran on: the release of v5.0.0, before any research file moved (R3-M0).
    expect(o.head).toBe('85e147b')
    expect(Object.keys(o.systems)).toEqual([...SYSTEMS])
  })

  it.each(SYSTEMS)('%s: the recorded grid is the grid in the kit, with its hash, its parts, its sizes and every point', (system) => {
    const raw = oracle().systems[system]!
    expect(raw.gridHash).toBe(gridHash(system))
    expect(raw.gridHash).toMatch(/^[0-9a-f]{8}$/)
    expect(raw.rows.length).toBe(RECORDED_ROWS[system])
    expect(gridInputs(system).length).toBe(RECORDED_ROWS[system])
    expect(raw.grid.map((p) => p.part)).toEqual(GRIDS[system].map((p) => p.part))
    expect(raw.grid.map((p) => p.n)).toEqual(GRIDS[system].map((p) => inputGrid(p.axes).length))
    expect(raw.grid.reduce((n, p) => n + p.n, 0)).toBe(RECORDED_ROWS[system])
    for (const [i, p] of GRIDS[system].entries()) expect(raw.grid[i]!.axes, `${system}/${p.part}`).toEqual(JSON.parse(JSON.stringify(p.axes)))
    expect(gaps(system, raw)).toEqual([])
  })

  it.each(SYSTEMS)('%s: every row carries a number to compare, and the lifecycle has its digest and its facts', (system) => {
    const raw = oracle().systems[system]!
    for (const r of raw.rows) {
      const numbers = [r.odds, r.years, r.quality, r.cost, ...Object.values(r.extra ?? {})].filter((x) => x !== undefined)
      expect(numbers.length, r.id).toBeGreaterThan(0)
      for (const x of numbers) expect(Number.isFinite(x), r.id).toBe(true)
      if (r.odds !== undefined) expect(r.odds >= 0 && r.odds <= 1, `${r.id} odds ${r.odds}`).toBe(true)
    }
    expect(raw.lifecycle.digest).toMatch(/^[0-9a-f]{8}$/)
    expect(Object.keys(raw.lifecycle.facts).length).toBeGreaterThan(0)
  })

  it('a grid that lost a point, a value or a part has another hash, so a shrunk grid cannot pass', () => {
    for (const s of SYSTEMS) {
      const full = gridInputs(s)
      expect(gridHash(s, full.slice(1)), s).not.toBe(gridHash(s))
      expect(gridHash(s, full.slice(0, -1)), s).not.toBe(gridHash(s))
      expect(gridHash(s, [...full].reverse()), s).not.toBe(gridHash(s))
    }
  })

  it('compares what it should: a row a point over, a year off or a dollar off is a difference, a row within the rule is not', () => {
    const row = (over: Partial<ParityRow> = {}): ParityRow => ({ id: 'rd|a=1', input: { part: 'rd', a: 1 }, odds: 0.5, years: 2, quality: 60, cost: 10_000, ...over })
    expect(compareParity([row()], [row()])).toEqual([])
    expect(compareParity([row()], [row({ odds: 0.511 })])).toHaveLength(1)
    expect(compareParity([row()], [row({ odds: 0.509 })])).toEqual([])
    expect(compareParity([row()], [row({ years: 3 })])).toHaveLength(1)
    expect(compareParity([row()], [row({ cost: 10_003 })])).toHaveLength(1)
    // J.8: only a hired manager rated 90 or more may sit above the record, by up to the declared slack, and never below it.
    const top = row({ id: 'rd|skill=100', input: { part: 'rd', skill: 100 } })
    expect(compareParity([top], [{ ...top, odds: 0.53 }], TOL, ceoSlack)).toEqual([])
    expect(compareParity([top], [{ ...top, odds: 0.535 }], TOL, ceoSlack)).toHaveLength(1)
    expect(compareParity([top], [{ ...top, odds: 0.48 }], TOL, ceoSlack)).toHaveLength(1)
    const mid = row({ id: 'rd|skill=80', input: { part: 'rd', skill: 80 } })
    expect(compareParity([mid], [{ ...mid, odds: 0.53 }], TOL, ceoSlack)).toHaveLength(1)
  })
})

/** J.8 lifts only a hired manager's research in the three company systems that read the manager (ceo-edge.ts); every other row is held to a point. */
const SLACK: Record<SystemId, ((row: ParityRow) => number) | undefined> = { rd: ceoSlack, heavy: ceoSlack, ops: ceoSlack, deeptech: undefined, aicaps: undefined, studio: undefined, workshop: undefined }

describe('every system still holds the oracle', () => {
  // The odds within a point, the quality within a point, the years and the price exact (TOL), at the default actor: ambition 50, steady,
  // no know-how, no fatigue. J.8 (a hired manager rated 90 or more) is the one declared exception, three points above the record at most.
  it.each(SYSTEMS)('%s: every row of its grid is within the tolerance and its lifecycle is the recorded one', { timeout: TIMEOUT }, (system) => {
    const diff = parityDiff(system, probe(system), TOL, SLACK[system])
    expect(diff.slice(0, 12), `${system}: ${diff.length} differences`).toEqual([])
    expectLifecycle(system)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// The wrappers

const src = (files: readonly SourceFile[], path: string): SourceFile => {
  const f = files.find((x) => x.path === path)
  if (f === undefined) throw new Error(`${path} is not a source file`)
  return f
}

/** Whether a source holds the token sequence `want` (the value of each token), comments and strings aside: a scan by tokens, not text. */
function holds(file: SourceFile, want: readonly string[]): boolean {
  const toks: Tok[] = file.toks
  for (let i = 0; i + want.length <= toks.length; i++) if (want.every((v, j) => toks[i + j]!.v === v)) return true
  return false
}

/** A call of `quote(`: the identifier, an opening bracket, and not a method or a declaration of the same name. */
function callsQuote(file: SourceFile): number {
  const toks = file.toks
  let n = 0
  for (let i = 0; i + 1 < toks.length; i++) {
    const t = toks[i]!
    if (t.k !== K_ID || t.v !== 'quote' || toks[i + 1]!.k !== K_PUNCT || toks[i + 1]!.v !== '(') continue
    const before = toks[i - 1]
    if (before !== undefined && ((before.k === K_PUNCT && before.v === '.') || (before.k === K_ID && (before.v === 'function' || before.v === 'const')))) continue
    n++
  }
  return n
}

/** Where each system asks the engine: the file that holds its quote, and the files of its adapter. */
const QUOTES: Record<SystemId, readonly string[]> = {
  rd: ['src/game/business/rd.ts'],
  heavy: ['src/game/business/heavy-rd.ts'],
  ops: ['src/game/business/lab-rules.ts'],
  deeptech: ['src/game/business/deeptech-effort.ts'],
  aicaps: ['src/game/business/deeptech-effort.ts'],
  studio: ['src/game/business/studio-effort.ts'],
  workshop: ['src/game/workshop/effort.ts'],
}

/** The old inline formula of each system, as the tokens that wrote it, and the wrapper that must no longer hold it. */
const OLD_FORMULAS: { system: SystemId; file: string; tokens: readonly string[]; what: string }[] = [
  { system: 'rd', file: 'src/game/business/rd.ts', tokens: ['Math', '.', 'pow', '(', 'k', ',', '-', '0.4', ')'], what: 'the odds exponent of the budget' },
  { system: 'heavy', file: 'src/game/business/heavy-rd.ts', tokens: ['HEAVY_ODDS_X', '*'], what: 'the odds as a share of a normal launch' },
  { system: 'ops', file: 'src/game/business/lab-rules.ts', tokens: ['0.9', '*', 'launchP'], what: 'the odds of a program from the launch odds' },
  { system: 'deeptech', file: 'src/game/business/deeptech-rd.ts', tokens: ['0.75', '+', 'skill', '/', '200'], what: 'the lab skill in the roll' },
  { system: 'studio', file: 'src/game/business/gamestudio-engines.ts', tokens: ['100', '/', 'tier', '.', 'years'], what: 'the engine pace' },
  { system: 'workshop', file: 'src/game/workshop/build.ts', tokens: ['0.0008'], what: 'the skill term of the blow-up chance' },
]

describe('every system asks the engine, and the old formulas are gone from the wrappers', () => {
  const files = loadSources(ROOT)

  it.each(SYSTEMS)('%s: the file that holds its quote calls quote(', (system) => {
    for (const path of QUOTES[system]) expect(callsQuote(src(files, path)), `${path} calls quote(`).toBeGreaterThan(0)
  })

  it.each(OLD_FORMULAS)('$system: $file no longer holds $what ($tokens)', ({ file, tokens }) => {
    expect(holds(src(files, file), tokens)).toBe(false)
  })

  it('the scan sees what it looks for: a wrapper that still holds the formula is found, a comment or a string that names it is not', () => {
    const old = toSource('x.ts', 'export const odds = (p: number, k: number) => 1 - (1 - p) * Math.pow(k, -0.4)\n')
    expect(holds(old, OLD_FORMULAS[0]!.tokens)).toBe(true)
    const said = toSource('x.ts', '// 1 - (1 - p) * Math.pow(k, -0.4)\nexport const s = "Math.pow(k, -0.4)"\n')
    expect(holds(said, OLD_FORMULAS[0]!.tokens)).toBe(false)
    expect(callsQuote(toSource('x.ts', 'const q = quote(g, t, i)\nconst r = engine.quote(g, t, i)\nfunction quote(a) { return a }\n'))).toBe(1)
    expect(callsQuote(toSource('x.ts', 'const q = realQuote(g, t, i)\n'))).toBe(0)
  })

  it('the adapters and the wrappers carry no dash character, and the numbers the formulas were made of are only in the adapters', () => {
    for (const path of ['rd-effort', 'heavy-effort', 'lab-effort', 'deeptech-effort', 'aicap-effort', 'studio-effort', 'research-effort', 'ceo-edge'].map((n) => `src/game/business/${n}.ts`)) {
      expect(DASH.test(src(files, path).text), path).toBe(false)
    }
    expect(DASH.test(src(files, 'src/game/workshop/effort.ts').text)).toBe(false)
    expect(DASH.test(src(files, 'src/game/workshop/bench.ts').text)).toBe(false)
    expect(holds(src(files, 'src/game/business/deeptech-effort.ts'), ['0.75', '+', 'f', '.', 'skill', '/', '200'])).toBe(true)
  })
})

describe('the words the frontier and the engine share', () => {
  it('the engine prints public research and rival pressure with the frontier’s own words', () => {
    expect(TERM_LABEL.spill).toBe(FRONTIER_REASONS.spill)
    expect(TERM_LABEL.rival).toBe(FRONTIER_REASONS.rival)
    expect(TERM_LABEL.spill).toBe('public research')
    expect(TERM_LABEL.rival).toBe('rival pressure')
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// One founder

/** The founder's life: the seed and the year of the test kits' own lives (a tuple, not a pinned seed). */
const LIFE: Life = [7, 2030]
/**
 * The R3 decisions the probes hold every system to, written as numbers here and not read from the engine: a change of the engine's own
 * constant (effort/limits.ts) is a change of the rule, and fails the first test below until the owner says so.
 */
const R3 = { kMax: 4, knowPoints: 15, knowMax: 100, rhoMax: 1.25 }

/** A budget no company could ever fund, in multiples of the normal one: the engine takes what the task's own ceiling lets it. */
const HUGE = 1e6
const NAME = breakthroughsFor('restaurant')[1]!.name
const IDEA = 'pocket-tool'
/** The crew of a firm of 4,000 at the top of its skill, drive and morale, rested: more than any task can use. */
const BIG_CREW: Worker = { fte: 4000, skill: 100, morale: 100, drive: 100, fatigue: 0 }
/** The most the engine is asked for: a budget of a million times the price, perfect tools, the largest crew, a quality ahead of any ceiling. */
const maxOf = (i: EffortInput): EffortInput => ({ ...i, k: HUGE, tools: 1, quality0: 1e6, people: [BIG_CREW] })

/** An rng state whose next draw is at least `x` (a certain loss at the odds under it), found by scanning small states: no life seed involved. */
function rngAbove(x: number): number {
  for (let s = 1; s < 200_000; s++) if (nextRandom(s)[0] >= x) return s
  throw new Error(`no rng state draws ${x} or more`)
}
/** An rng state whose next draw is under `x` (a certain win at the odds over it). */
function rngBelow(x: number): number {
  for (let s = 1; s < 200_000; s++) if (nextRandom(s)[0] < x) return s
  throw new Error(`no rng state draws under ${x}`)
}
const LOSS = rngAbove(0.99)

/** A deep-tech lab of the founder's, in the state a test kit builds one (level 60, stage 2), added to the founder's game. */
function addLab(g: GameState, industry: Industry, name: string): { a: Asset; b: BizState; t: TechState } {
  const b0 = newBiz(g, industry, 'us', getCountry('us').cities[0]!, { cash: 50_000_000 })
  b0.tech = JSON.parse(JSON.stringify(Object.assign(readTech(undefined), { level: 60, stage: 2, venture: 50_000_000 }))) as Json
  const a = createBusinessAsset(g, name, b0, 0)
  g.assets.push(a)
  const b = bizOf(g, a)
  return { a, b, t: techOf(b) }
}

/** The founder gives everything: ambition 100, pushing. The engine reads it for `who: 'you'`; a hired manager would not feel it. */
function pushing(g: GameState): void {
  g.character.hidden.willpower = 100
  g.character.hidden.discipline = 100
  const y = readYou(g)
  y.posture = 'push'
  y.effective = 'push'
  writeYou(g, y)
}

/**
 * One life with every research system in it: a restaurant of the player's (product R&D, Heavy R&D, Operations R&D), a quantum lab (deep tech),
 * an AI lab (the capability tracks), a game studio (the engines) and the player's own Workshop. The player runs all of them.
 */
function founder() {
  const { g, a, b } = labGame(LIFE[0], 'restaurant', { year: LIFE[1] })
  neutralAmbition(g)
  const qt = addLab(g, 'quantum', 'Quantum Works')
  const ai = addLab(g, 'aiLab', 'Nova AI')
  const sa = createBusinessAsset(g, 'Aurora Games', newBiz(g, 'gameStudio', 'us', 'Chicago', { cash: 100_000_000, employees: 60, quality: 90, brand: 80 }), 1_000_000)
  g.assets.push(sa)
  g.queue = []
  return { g, rest: { a, b }, qt, ai, studio: { a: sa, b: bizOf(g, sa) } }
}
type Founder = ReturnType<typeof founder>

/** What a system's own wrapper says of a run at the largest budget it will take, as the game's menus read it. */
interface Own {
  odds: number
  k: number
  years: number
  cost: number
  quality: number | null
}

/** One research system of the founder, seen the same way by every probe below. */
interface Rig {
  system: SystemId
  field: string
  /** The Task the system's own builder makes from the state as it is now. */
  task(): Task
  /** The engine's input of one run at the state as it is now (the actor, the crew, what the company knows), at a budget of one. */
  input(): EffortInput
  /** The system's wrapper at the largest budget. */
  own(): Own
  /** The price of one run at a normal budget, as the system's own price function says it. */
  price(): number
  /** Books a finished run through the system's seam (the company's `bookResearch`, or the player's own record). */
  book(o: Outcome, year: number): StepResult
  /** The know-how map the system banks in. */
  map(): Record<string, number>
  /** Puts `v` points of know-how in the system's own field, where a failure would have banked them. */
  know(v: number): void
}

const must = <T>(v: T | null | undefined): T => {
  if (v === null || v === undefined) throw new Error('a seam that books returned nothing')
  return v
}

/** The seven systems of a founder. */
function rigs(f: Founder): Rig[] {
  const { g, rest, qt, ai, studio } = f
  const research = (c: { b: BizState }) => researchState(g, c.b)
  const inputFor = (c: { a: Asset; b: BizState }, field: string) => () => researchInputs(g, research(c), c.a, field, 1)
  const bookFor = (c: { a: Asset }, task: () => Task) => (o: Outcome, year: number): StepResult => must(bookResearch(g, c.a, task(), o, { year, k: 1, fx: newFx(year) }))
  const mapOf = (c: { b: BizState }) => (): Record<string, number> => c.b.knowHow ?? {}
  const knowIn = (c: { b: BizState }, field: string) => (v: number): void => {
    c.b.knowHow = { ...(c.b.knowHow ?? {}), [field]: v }
  }

  const idea = classicIdeas(g, rest.b)[0]!
  const family = lineInfo(idea, rest.b.industry).family
  const rdT = (): Task => rdTask(rdCost(rest.b, idea), baseYears(rest.b.industry), family, RD_MAX, rdBase(research(rest)))
  const heavyT = (): Task => heavyTask(g, rest.b, NAME, rest.a)
  const opsT = (): Task => opsTask(g, rest.b, 2, 'cost', rest.a)

  const qtDef = programDef('quantum', 'qubits')!
  const qtT = (): Task => programTask({ field: programField('quantum'), cost: programCost(qt.b, qt.t, qtDef), years: qtDef.years, odds: qtDef.odds(qt.t) })
  const capDef = programDef('aiLab', 'cap.coding')!
  const capT = (): Task => capTask('coding', ai.t.caps.coding ?? 0)
  const engineT = (): Task => engineTask('professional')

  const def = catalogIdea(IDEA)!
  const mine = { skill: 100, smarts: 100, genius: true, builds: 99, tools: 1, helper: 1 }
  const buildT = (): Task => buildTask(def, APPROACHES.bold)

  const own = (q: { p: number; k: number; years: number; spend: number; quality: number | null }): Own => ({ odds: q.p, k: q.k, years: q.years, cost: q.spend, quality: q.quality })
  return [
    {
      system: 'rd',
      field: rdField(family),
      task: rdT,
      input: inputFor(rest, rdField(family)),
      own: () => {
        const q = rdQuote(g, rest.b, idea, rdCost(rest.b, idea) * HUGE)
        return { odds: q.odds, k: q.k, years: q.years, cost: q.cost, quality: q.quality }
      },
      price: () => rdCost(rest.b, idea),
      book: bookFor(rest, rdT),
      map: mapOf(rest),
      know: knowIn(rest, rdField(family)),
    },
    {
      system: 'heavy',
      field: heavyField(NAME),
      task: heavyT,
      input: inputFor(rest, heavyField(NAME)),
      own: () => own(heavyQuote(g, rest.b, NAME, rest.a)),
      price: () => heavyCost(g, rest.b) ?? 0,
      book: bookFor(rest, heavyT),
      map: mapOf(rest),
      know: knowIn(rest, heavyField(NAME)),
    },
    {
      system: 'ops',
      field: opsField('cost'),
      task: opsT,
      input: inputFor(rest, opsField('cost')),
      own: () => own(opsQuote(g, rest.b, 2, 'cost', rest.a)),
      price: () => opsPrice(rest.b, 2),
      book: bookFor(rest, opsT),
      map: mapOf(rest),
      know: knowIn(rest, opsField('cost')),
    },
    {
      system: 'deeptech',
      field: programField('quantum'),
      task: qtT,
      input: inputFor(qt, programField('quantum')),
      own: () => {
        const q = programQuote(qt.b, qt.t, qtDef, HUGE, g)
        return { odds: q.odds, k: q.quote.k, years: q.years, cost: q.cost, quality: null }
      },
      price: () => programCost(qt.b, qt.t, qtDef),
      book: bookFor(qt, qtT),
      map: mapOf(qt),
      know: knowIn(qt, programField('quantum')),
    },
    {
      system: 'aicaps',
      field: programField('aiLab', 'coding'),
      task: capT,
      input: inputFor(ai, programField('aiLab', 'coding')),
      own: () => {
        const q = programQuote(ai.b, ai.t, capDef, HUGE, g)
        return { odds: q.odds, k: q.quote.k, years: q.years, cost: q.cost, quality: null }
      },
      price: () => programCost(ai.b, ai.t, capDef),
      book: bookFor(ai, capT),
      map: mapOf(ai),
      know: knowIn(ai, programField('aiLab', 'coding')),
    },
    {
      system: 'studio',
      field: ENGINE_FIELD,
      task: engineT,
      input: inputFor(studio, ENGINE_FIELD),
      own: () => own(engineQuote(g, 'professional', engineActor(g, ownerRuns(g, studio.b)), studio.b.knowHow)),
      price: () => engineTier('professional').research,
      book: bookFor(studio, engineT),
      map: mapOf(studio),
      know: knowIn(studio, ENGINE_FIELD),
    },
    {
      system: 'workshop',
      field: buildT().field,
      task: buildT,
      input: () => buildInputs(mine, def, APPROACHES.bold),
      own: () => {
        const o = buildOdds(g, readWorkshop(g), def, 0, 'bold')
        return { odds: 1 - o.kaboom, k: 1, years: 1, cost: buildCost(g, def, 'bold'), quality: null }
      },
      price: () => buildCost(g, def, 'bold'),
      book: (o, year) => step(g, buildT(), o, { year, who: 'you', fx: newFx(year) }),
      map: () => readYou(g).fieldK,
      know: (v) => {
        const y = readYou(g)
        y.fieldK[buildT().field] = v
        writeYou(g, y)
      },
    },
  ]
}

/** What each system's own rules always held a run to: the most odds, the most quality, the most budget (the task's own ceiling). */
const LEGACY: Record<SystemId, { clamp: number | null; quality: number | null; kmax: number }> = {
  rd: { clamp: 0.95, quality: 97, kmax: 4 },
  heavy: { clamp: 0.6, quality: 97, kmax: 1 },
  ops: { clamp: 0.92, quality: null, kmax: 1 },
  deeptech: { clamp: 0.98, quality: null, kmax: 3 },
  aicaps: { clamp: 0.98, quality: null, kmax: 3 },
  studio: { clamp: null, quality: null, kmax: 1 },
  workshop: { clamp: 0.995, quality: 100, kmax: 1 },
}

const rigOf = (f: Founder, system: SystemId): Rig => rigs(f).find((r) => r.system === system)!

/**
 * What know-how is worth to a run, in odds points: the same input with the know-how the company holds and with none. At the plan in force
 * with the owner at ambition 50 steady (`neutral`, the figure of the R3 decision: at most 15) and with the owner at ambition 100 pushing
 * (`bold`: at most 15 as well, since R3-E9 added know-how to the odds in points and the R3 fix to the engine cut it where it enters them;
 * the first sweep measured 19.96, 17.2 and 16.3 for product, deep tech and the capability tracks while it was still a logit shift).
 */
interface Worth {
  neutral: number
  bold: number
}
/**
 * The most 15 points of know-how can be worth under the boldest plan (ambition 100, pushing), on the engine's own odds curve. It is 15: the
 * bold pull moves the logit of the odds and know-how is added after it, in points. A run's own quote may not pass it (no system adds a
 * know-how multiplier of its own), and `bounded` holds every run to 15 itself, so this figure is the looser, older check.
 */
function boldCeiling(task: Task): number {
  const bold = boldOf(100, 'push')
  const none = { crew: 0, tools: 0, know: 0, hard: 0, rival: 0, spill: 0, tired: 0 }
  const full = { ...none, know: R3.knowPoints }
  let top = 0
  for (let pk = task.oddsLo; pk <= task.oddsHi + 1e-9; pk += 0.005) {
    top = Math.max(top, (deviate(pk, task.oddsLo, task.oddsHi, full, bold).p - deviate(pk, task.oddsLo, task.oddsHi, none, bold).p) * 100)
  }
  return top
}

function worthOf(g: GameState, rig: Rig): Worth {
  const task = rig.task()
  const held = knowHowOf(rig.map(), rig.field)
  const pts = (i: EffortInput): number => (quote(g, task, { ...i, knowledge: held }).p - quote(g, task, { ...i, knowledge: 0 }).p) * 100
  const input = rig.input()
  return { neutral: pts({ ...input, ambition: 50, posture: 'steady', fatigue: 0 }), bold: pts({ ...input, ambition: 100, posture: 'push', fatigue: 0 }) }
}

/** The engine's answer at the largest input, held to every ceiling of the system and of the engine. Returns what know-how is worth to it. */
function bounded(g: GameState, rig: Rig, label: string): Worth {
  const task = rig.task()
  const lim = LEGACY[rig.system]
  expect(task.kmax, `${label}: the task's own budget ceiling`).toBe(lim.kmax)
  expect(task.kmax, label).toBeLessThanOrEqual(R3.kMax)
  const q = quote(g, task, maxOf(rig.input()))
  expect(q.k, `${label}: k`).toBe(Math.min(task.kmax, R3.kMax))
  expect(q.spend, `${label}: the most a run can cost`).toBeLessThanOrEqual(R3.kMax * task.cost + 1e-6)
  expect(q.years, `${label}: years`).toBeGreaterThanOrEqual(task.minYears)
  expect(q.years, `${label}: years`).toBeLessThanOrEqual(task.maxYears)
  expect(q.effort.rho, `${label}: the pace ambition buys`).toBeLessThanOrEqual(R3.rhoMax)
  if (lim.clamp !== null) {
    expect(task.oddsHi, `${label}: the task's own clamp is the legacy one`).toBeCloseTo(lim.clamp, 12)
    expect(q.p, `${label}: odds`).toBeLessThanOrEqual(lim.clamp + 1e-12)
    expect(q.p, `${label}: odds`).toBeGreaterThanOrEqual(task.oddsLo - 1e-12)
  }
  if (lim.quality !== null) {
    expect(q.quality, `${label}: quality`).not.toBeNull()
    expect(q.quality!, `${label}: quality`).toBeLessThanOrEqual(lim.quality + 1e-9)
  } else expect(q.quality, `${label}: no quality`).toBeNull()
  const own = rig.own()
  expect(own.k, `${label}: the wrapper's k`).toBeLessThanOrEqual(lim.kmax)
  if (lim.clamp !== null) expect(own.odds, `${label}: the wrapper's odds`).toBeLessThanOrEqual(lim.clamp + 1e-12)
  if (lim.quality !== null && own.quality !== null) expect(own.quality, `${label}: the wrapper's quality`).toBeLessThanOrEqual(lim.quality)
  const worth = worthOf(g, rig)
  expect(worth.neutral, `${label}: know-how is worth at most ${R3.knowPoints} points`).toBeLessThanOrEqual(R3.knowPoints + 1e-9)
  expect(worth.neutral, label).toBeGreaterThanOrEqual(-1e-9)
  expect(worth.bold, `${label}: know-how to an owner who gives everything`).toBeLessThanOrEqual(boldCeiling(task) + 1)
  // The owner's rule is 15 under every plan, not 15 and a few more for the boldest: in the odds (the quote with and without the know-how
  // the company holds), in the line the player reads (0 to 15, never a share of what the other terms do together) and in what the system's
  // own wrapper answers (no system adds a know-how term of its own).
  expect(worth.bold, `${label}: know-how to an owner who gives everything is worth at most ${R3.knowPoints} points`).toBeLessThanOrEqual(R3.knowPoints + 1e-9)
  expect(worth.bold, label).toBeGreaterThanOrEqual(-1e-9)
  for (const plan of [{}, { ambition: 100, posture: 'push' as const }, { ambition: 50, posture: 'steady' as const, fatigue: 0 }, { ambition: 0, posture: 'lean' as const, fatigue: 60 }]) {
    const know = quote(g, task, { ...maxOf(rig.input()), ...plan }).reasons.find((x) => x.key === 'know')?.pts ?? 0
    expect(know, `${label}: the know-how line at ${JSON.stringify(plan)}`).toBeGreaterThanOrEqual(0)
    expect(know, `${label}: the know-how line at ${JSON.stringify(plan)}`).toBeLessThanOrEqual(R3.knowPoints)
  }
  const held = knowHowOf(rig.map(), rig.field)
  if (held > 0 && lim.clamp !== null) {
    rig.know(0)
    const without = rig.own().odds
    rig.know(held)
    expect((own.odds - without) * 100, `${label}: know-how in the system's own wrapper`).toBeLessThanOrEqual(R3.knowPoints + 1e-9)
  }
  return worth
}
// ---------------------------------------------------------------------------------------------------------------------
// Money buys odds and speed, never a lower price

/** The founder's wealth, times `n`: every company's cash, valuation, head count and sites, and the founder's own money. */
function wealth(f: Founder, n: number): void {
  for (const c of [f.rest, f.qt, f.ai, f.studio]) {
    c.b.cash *= n
    c.b.valuation *= n
    c.b.employees = Math.max(1, c.b.employees) * n
    for (const o of c.b.outlets) o.count *= n
  }
  f.g.character.money *= n
}

describe('the ceilings of the R3 decisions are the ones the sweep holds every system to', () => {
  it('k at most 4, know-how at most 100 and worth at most 15 odds points, the pace at most a quarter faster, 40 fields to a map', () => {
    expect(K_MAX).toBe(R3.kMax)
    expect(KNOW_MAX).toBe(R3.knowMax)
    expect(KNOW_ODDS_MAX).toBe(R3.knowPoints)
    expect(RHO_MAX).toBe(R3.rhoMax)
    expect(KNOW_HOW_FIELDS).toBe(40)
  })
})

describe('money buys odds and speed and never a lower price: 100 times the cash, the valuation and the head count', () => {
  it.each(SYSTEMS)('%s: the task, the price, the wrapper and the engine at the largest input are exactly what they were', (system) => {
    const f = founder()
    const rig = rigOf(f, system)
    const read = () => ({ task: rig.task(), price: rig.price(), own: rig.own(), max: quote(f.g, rig.task(), maxOf(rig.input())) })
    const before = read()
    wealth(f, 100)
    expect(read()).toEqual(before)
    // The budget stops at the task's ceiling whatever it is told, and the price a run costs is a multiple of the task's own price.
    bounded(f.g, rig, `${system} at 100x`)
    expect(before.max.spend).toBeLessThanOrEqual(R3.kMax * before.price + 1e-6)
    expect(before.own.k).toBeLessThanOrEqual(Math.min(LEGACY[system].kmax, R3.kMax))
  })

  it('no price of any system reads money, at any scale: 10,000 times the wealth changes none of the seven', () => {
    const f = founder()
    const all = rigs(f)
    const before = all.map((r) => r.price())
    wealth(f, 10_000)
    expect(all.map((r) => r.price())).toEqual(before)
  })

  it('the capability tracks are flat in the research level: the same odds at level 0 to 20, and the price climbs 1.4 times a level', () => {
    const f = founder()
    let last = 0
    for (const level of [0, 1, 5, 10, 19, 20]) {
      const t = capTask('coding', level)
      const q = quote(f.g, t, { k: 1, posture: 'steady', ambition: 50, fatigue: 0 })
      expect(q.p, `level ${level}`).toBeCloseTo(0.65, 12)
      expect(t.cost).toBeGreaterThanOrEqual(last)
      last = t.cost
    }
    expect(capTask('coding', 10).cost / capTask('coding', 9).cost).toBeCloseTo(1.4, 9)
  })

  it('a studio engine never fails: its odds are 1 at any input and its result is always a win', () => {
    const f = founder()
    const t = engineTask('flagship')
    const q = quote(f.g, t, maxOf({ who: 'you' }))
    expect(q.p).toBe(1)
    expect(t.oddsLo).toBe(1)
    expect(t.oddsHi).toBe(1)
    expect(engineOutcome().kind).toBe('works')
    expect(q.effort.speed).toBeLessThanOrEqual(1.15 * R3.rhoMax * 1.0001 * Math.max(1, q.effort.crew))
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 200 years at maximum inputs

/** The books as a probe sees them: the identity and the totals that must stay where they were, and the cash every account holds. */
function books(f: Founder) {
  const r = checkLedger(f.g)
  return {
    ok: r.ok,
    problems: r.problems,
    sum: r.sum,
    mint: r.mint,
    burn: r.burn,
    bookings: r.bookings,
    money: f.g.character.money,
    cash: [f.rest, f.qt, f.ai, f.studio].map((c) => c.b.cash),
  }
}

describe('200 years of direct steps at maximum inputs, one founder with every research system', () => {
  const YEARS = 200
  const START = 2030

  it('keeps every ceiling every year: k, the odds, the quality, know-how, the books', { timeout: TIMEOUT }, () => {
    const f = founder()
    pushing(f.g)
    expect(ambitionOf(f.g)).toBeGreaterThanOrEqual(90)
    const all = rigs(f)
    const start = books(f)
    expect(start.ok, start.problems.join('; ')).toBe(true)
    const worst: Worth = { neutral: 0, bold: 0 }
    let years = 0
    for (let i = 0; i < YEARS; i++) {
      const year = START + i
      for (const rig of all) {
        const label = `${rig.system}, year ${i + 1}`
        const worth = bounded(f.g, rig, label)
        worst.neutral = Math.max(worst.neutral, worth.neutral)
        worst.bold = Math.max(worst.bold, worth.bold)
        // Three in four runs do not work (so know-how climbs as fast as it can), and every fourth is a hit; the engine of a studio never fails.
        const q = quote(f.g, rig.task(), rig.input())
        const o: Outcome = rig.system === 'studio' ? engineOutcome() : i % 4 === 3 ? resolve(q, 0, { drawHit: () => 0 }) : resolve(q, 0.9995)
        const result = rig.book(o, year)
        expect(result.replay, `${label}: a fresh record books`).toBe(false)
        const map = rig.map()
        for (const [key, value] of Object.entries(map)) {
          expect(value, `${label}: know-how in ${key}`).toBeGreaterThanOrEqual(0)
          expect(value, `${label}: know-how in ${key}`).toBeLessThanOrEqual(R3.knowMax)
        }
        expect(Object.keys(map).length, `${label}: the map's size`).toBeLessThanOrEqual(40)
      }
      years++
    }
    expect(years).toBe(YEARS)
    // The probe did bank: every system that can fail learned, the odds it earns are within the 15 points and not nothing, and the ledger is as it was.
    for (const rig of all) {
      const k = knowHowOf(rig.map(), rig.field)
      expect(k, `${rig.system}: know-how banked`).toBeGreaterThan(0)
      expect(k, `${rig.system}: know-how`).toBeLessThanOrEqual(R3.knowMax)
    }
    expect(worst.neutral).toBeGreaterThan(5)
    expect(worst.neutral).toBeLessThanOrEqual(R3.knowPoints + 1e-9)
    expect(worst.bold).toBeGreaterThan(worst.neutral - 1e-9)
    expect(worst.bold, 'the most know-how was worth to any of the seven in 200 years of an owner who gives everything').toBeLessThanOrEqual(R3.knowPoints + 1e-9)
    const end = books(f)
    expect(end.ok, end.problems.join('; ')).toBe(true)
    expect(end).toEqual(start)
  })

  it('a company that has failed for two hundred years knows each field at most once: one key per field, the map within its size', () => {
    const f = founder()
    pushing(f.g)
    const rig = rigOf(f, 'rd')
    for (let i = 0; i < YEARS; i++) rig.book(resolve(quote(f.g, rig.task(), rig.input()), 0.9995), START + i)
    expect(Object.keys(rig.map())).toEqual([rig.field])
    expect(rig.map()[rig.field]).toBeLessThanOrEqual(R3.knowMax)
    const worth = worthOf(f.g, rig)
    expect(worth.neutral).toBeGreaterThan(10)
    expect(worth.neutral).toBeLessThanOrEqual(R3.knowPoints + 1e-9)
    expect(worth.bold).toBeLessThanOrEqual(boldCeiling(rig.task()) + 1)
    expect(worth.bold).toBeLessThanOrEqual(R3.knowPoints + 1e-9)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// What the records weigh

/** JSON nodes of a value: every object, array and leaf counts one (the unit the save budgets are written in). */
function nodes(v: unknown): number {
  if (Array.isArray(v)) return 1 + v.reduce<number>((n, x) => n + nodes(x), 0)
  if (typeof v === 'object' && v !== null) return 1 + Object.values(v).reduce<number>((n, x) => n + nodes(x), 0)
  return 1
}

/** Every `fx` record and every `knowHow` map the companies of `g` carry, with the nodes they weigh. */
function weigh(g: GameState): { fx: number; know: number; records: number; keys: number } {
  const out = { fx: 0, know: 0, records: 0, keys: 0 }
  const walk = (v: unknown, key: string): void => {
    if (key === 'fx' && typeof v === 'object' && v !== null && !Array.isArray(v)) {
      out.fx += nodes(v)
      out.records += 1
      return
    }
    if (key === 'knowHow' && typeof v === 'object' && v !== null && !Array.isArray(v)) {
      out.know += nodes(v)
      out.keys += Object.keys(v).length
      return
    }
    if (Array.isArray(v)) for (const x of v) walk(x, key)
    else if (typeof v === 'object' && v !== null) for (const [k, x] of Object.entries(v)) walk(x, k)
  }
  for (const a of g.assets) walk(a.details, 'details')
  return out
}

describe('what the effort records weigh in a save', () => {
  it('one `fx` record is ten nodes and a full know-how map forty-one: the unit the budget is counted in', () => {
    expect(nodes(newFx(2030))).toBe(10)
    const full: Record<string, number> = {}
    for (let i = 0; i < KNOW_HOW_FIELDS; i++) full[`rd.f${i}`] = 50
    expect(nodes(full)).toBe(1 + KNOW_HOW_FIELDS)
  })

  it('12 companies of an owner who pushes, over 50 real years, keep at most 3,000 nodes in `fx` records and `knowHow` maps, and the books balance', { timeout: TIMEOUT * 2 }, () => {
    const g = adult(5, 2030, 'us')
    neutralAmbition(g)
    pushing(g)
    const products: Industry[] = ['restaurant', 'brewery', 'software', 'salon', 'water', 'bakery', 'manufacturing', 'cafe']
    const firms = products.map((industry, i) => {
      const a = company(g, industry, { cash: 80_000_000, name: `Firm ${i}` })
      return { a, b: bizOf(g, a) }
    })
    const labs = (['quantum', 'biotech', 'aiLab'] as const).map((industry, i) => addLab(g, industry, `Lab ${i}`))
    const sa = createBusinessAsset(g, 'Aurora Games', newBiz(g, 'gameStudio', 'us', 'Chicago', { cash: 100_000_000, employees: 60, quality: 90, brand: 80 }), 1_000_000)
    g.assets.push(sa)
    g.queue = []
    expect(g.assets.length).toBe(12)

    let peak = { fx: 0, know: 0, records: 0, keys: 0 }
    let heaviest = 0
    for (let year = 0; year < 50; year++) {
      for (const { a, b } of firms) {
        for (const idea of classicIdeas(g, b).slice(0, 12)) {
          if (rdBlock(b, idea, rdCost(b, idea)) === null) startRd(g, a, b, idea, rdCost(b, idea) * 2)
        }
        const name = breakthroughsFor(b.industry)[0]?.name
        if (name !== undefined && heavyBlock(g, b, name, a.id) === null) startHeavy(g, a, b, name)
        const offer = opsOffers(g, b)[0]
        if (offer !== undefined && opsBlock(g, b, offer.id) === null) startOps(g, a, b, offer.id, true)
      }
      for (const lab of labs) {
        const ind = lab.b.industry as keyof typeof PROGRAMS
        const def = PROGRAMS[ind].find((d) => programBlock(lab.b, lab.t, d) === null)
        if (def !== undefined) startProgram(g, lab.b, lab.t, def, 1)
      }
      if (!studioOf(sa).engines.some((x) => x.stage === 'dev')) startStudioEngine(g, sa.id, 'indie', `Engine ${year}`)
      g.queue = []
      nextYear(g)
      const w = weigh(g)
      heaviest = Math.max(heaviest, w.fx + w.know)
      if (w.fx + w.know >= peak.fx + peak.know) peak = w
    }
    // Nothing here is an empty test: the owner starts every idea of every company every year, so companies carried dozens of effort records
    // while their projects ran, and the failures banked know-how in dozens of fields.
    expect(peak.records).toBeGreaterThanOrEqual(10)
    expect(peak.keys).toBeGreaterThanOrEqual(10)
    expect(weigh(g).keys).toBeGreaterThanOrEqual(20)
    expect(heaviest).toBeLessThanOrEqual(3_000)
    expect(weigh(g).fx + weigh(g).know).toBeLessThanOrEqual(3_000)
    for (const a of g.assets) {
      const map = (a.details as { knowHow?: Record<string, number> }).knowHow
      if (map !== undefined) {
        expect(Object.keys(map).length).toBeLessThanOrEqual(40)
        for (const v of Object.values(map)) expect(v >= 0 && v <= R3.knowMax).toBe(true)
      }
    }
    const report = checkLedger(g)
    expect(report.ok, report.problems.join('; ')).toBe(true)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// Reads draw nothing

describe('a read draws nothing and writes nothing, in every system', () => {
  /** Everything a menu or a hint reads of one rig: its task, its input, its own wrapper at the largest budget, its price, the engine's quote. */
  const reads = (g: GameState, rig: Rig): unknown => ({
    task: rig.task(),
    input: rig.input(),
    own: rig.own(),
    price: rig.price(),
    max: quote(g, rig.task(), maxOf(rig.input())),
    here: quote(g, rig.task(), rig.input()),
  })

  it.each(SYSTEMS)('%s: no draw from g.rng in any read, and the same answer from a deep-frozen game', (system) => {
    // Something is banked, so the quote has a know-how line to work out; the owner gives everything, so it has a bold line too.
    const make = (): { f: Founder; rig: Rig } => {
      const f = founder()
      pushing(f.g)
      const rig = rigOf(f, system)
      rig.know(40)
      return { f, rig }
    }
    const { f, rig } = make()
    let want: unknown
    expect(noDraw(f.g, () => (want = reads(f.g, rig)))).toBe(true)
    const frozen = make()
    deepFreeze(frozen.f.g)
    expect(reads(frozen.f.g, frozen.rig)).toEqual(want)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// Every screen says why, and every failure says why it failed and what it taught

/** The sentences of a failure's words (a cause, then what it taught): the cause the engine can name, and the line that says what was learned. */
const CAUSE = /(hit a dead end|The budget was too thin|The crew changed too often|A shortcut backfired|got there first|got to .+ first|too worn out)/
const TAUGHT = /The failure (still )?taught you/
const KNOW_TEXT = /know-how \d+|taught you (little new|nothing yet)/

/** A node by id, searched through the menus. */
function find(g: GameState, nodes: readonly MenuNode[], id: string): MenuNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.type === 'menu') {
      const hit = find(g, n.children(g), id)
      if (hit) return hit
    }
  }
  return undefined
}

/** One system's screen and results, made from a fresh life. `screen` is what the player reads before the run, `result` what they read after. */
interface Case {
  g: GameState
  screen(): string
  result(): string
  /** The screen's odds line, or (for a studio, which has no odds) its words of the pace. */
  says: RegExp
}

const ODDS = /Odds \d+%: /

const rdCase = (): Case => {
  const f = tradeFixture('restaurant', [3, 2030])
  setCompany(f.g, f.b, { quality: 50, scientists: 2, staff: 0, projects: 0, manager: undefined })
  const idea = classicIdeas(f.g, f.b)[0]!
  const info = lineInfo(idea, f.b.industry)
  f.b.knowHow = { [rdField(info.family)]: 40 }
  return {
    g: f.g,
    says: ODDS,
    screen: () => {
      const node = allNodes(f.g, businessAssetView(f.g, f.a)).find((n) => n.id === `biz.launch.${idea}.${f.a.id}`)
      const input = node?.type === 'action' ? node.input : undefined
      return input?.kind === 'slider' ? input.preview!(f.g, rdCost(f.b, idea) * 2) : ''
    },
    result: () => {
      const p: RdProject = { id: 'rd-sweep', name: idea, budget: rdCost(f.b, idea), years: 1, progress: 0, odds: 0.02, boost: 0, quality: 60, family: info.family, kind: info.kind, started: f.g.year }
      rdOf(f.b).push(p)
      f.g.year += 1
      f.g.queue = []
      f.g.rng = LOSS
      advanceRd(f.g, f.b, f.g.year - 1)
      return f.g.queue.flatMap((m) => (m.kind === 'notice' && /R&D Results/.test(m.title) ? [m.text] : [])).join('\n')
    },
  }
}

const heavyCase = (): Case => {
  const f = tradeFixture('restaurant', [7, 2030])
  setCompany(f.g, f.b, { quality: 50, scientists: 3, staff: 0, projects: 0, manager: undefined })
  return {
    g: f.g,
    says: ODDS,
    screen: () => {
      const menu = allNodes(f.g, businessAssetView(f.g, f.a)).find((n) => n.type === 'menu' && n.id === `biz.products.${f.a.id}`)
      const rows = menu?.type === 'menu' ? menu.children(f.g).filter((n): n is MenuAction => n.type === 'action' && n.id.startsWith(`biz.heavy.${NAME}`)) : []
      return rows[0]?.confirm?.(f.g) ?? ''
    },
    result: () => {
      const p = startHeavy(f.g, f.a, f.b, NAME)
      if (p === null) throw new Error('the breakthrough did not start')
      p.odds = 0.02
      p.progress = p.years
      f.g.queue = []
      f.g.rng = LOSS
      return advanceHeavy(f.g, f.a, f.b, p, f.g.year).line
    },
  }
}

const OPS_ID = 'ops.cost.2'
const opsCase = (): Case => {
  const f = tradeFixture('restaurant', [5, 2030])
  setCompany(f.g, f.b, { quality: 50, scientists: 3, staff: 0, projects: 0, manager: undefined })
  return {
    g: f.g,
    says: ODDS,
    screen: () => {
      const row = (labMenus(f.a, readBiz(f.g, f.a))[0] as MenuGroup).children(f.g).find((n): n is MenuAction => n.type === 'action' && n.id === `biz.mkt.lab.ops.${OPS_ID}.${f.a.id}`)
      return row?.confirm?.(f.g) ?? ''
    },
    result: () => {
      if (startOps(f.g, f.a, f.b, OPS_ID, true) === null) throw new Error('the program did not start')
      patchLab(f.b, (d) => {
        const p = d.programs.find((x) => x.id === OPS_ID)!
        p.odds = 0.02
        p.progress = p.years - 1
      })
      expect(readLab(f.b).programs.length).toBe(1)
      f.g.queue = []
      f.g.rng = LOSS
      advanceLab(f.g, f.b, f.g.year)
      return f.g.queue.flatMap((m) => (m.kind === 'notice' && /Operations Results/.test(m.title) ? [m.text] : [])).join('\n')
    },
  }
}

/** A deep-tech lab (or the AI lab, for a capability track) with know-how banked in the program's field, and the row of one program. */
const labCase = (cap: boolean): Case => {
  const f = cap ? capLab(LIFE) : techLab('quantum', LIFE)
  const def = cap ? programDef('aiLab', 'cap.language')! : programDef('quantum', 'qubits')!
  f.b.knowHow = { [cap ? 'dt.aiLab.cap.language' : 'dt.quantum']: 40 }
  f.t.pace = 'steady'
  return {
    g: f.g,
    says: ODDS,
    screen: () => {
      const row = cap ? find(f.g, openTiles(f.g, businessAssetView(f.g, f.a)), `dt.rd.cap.language.${f.a.id}`) : (find(f.g, openTiles(f.g, businessAssetView(f.g, f.a)), `dt.lab.${f.a.id}`) as MenuGroup).children(f.g).find((n) => n.id.startsWith(`dt.rd.${def.id}.`))
      return row?.type === 'action' && row.input?.kind === 'slider' ? row.input.preview!(f.g, 200) : ''
    },
    result: () => {
      const p = startProgram(f.g, f.b, f.t, def, 1)
      if (p === null) throw new Error('the program did not start')
      p.progress = Math.max(0, p.years - 1)
      f.g.rng = LOSS
      const r: RdResult = advancePrograms(f.g, f.a, f.b, f.t, f.g.year)
      expect(r.losses).toBe(1)
      return r.notes.join('\n')
    },
  }
}

const OPERATION = { employees: 60, wage: 50_000, quality: 90, leadership: 90, brand: 80, operations: 1, open: 1, market: 1 }
const studioCase = (): Case => {
  const g = makeTestGame(1, { age: 35, money: 10_000_000, countryId: 'us', talents: [] })
  g.lifeId = 'studio-life'
  const a = createBusinessAsset(g, 'Aurora Games', newBiz(g, 'gameStudio', 'us', 'Chicago', { cash: 100_000_000, employees: 60, quality: 90, brand: 80 }), 1_000_000)
  g.assets.push(a)
  neutralAmbition(g)
  const b = bizOf(g, a)
  b.knowHow = { [ENGINE_FIELD]: 40 }
  g.queue = []
  startStudioEngine(g, a.id, 'indie', 'Kit')
  return {
    g,
    says: /faster/,
    screen: () => {
      const menu = find(g, studioNodes(g, a), `studio.engines.${a.id}`) as MenuGroup
      const node = find(g, menu.children(g), `studio.engine.engine1.${a.id}`) as MenuGroup
      return `${g.queue.map((m) => (m.kind === 'notice' ? m.text : '')).join('\n')}\n${node.header!(g)}`
    },
    result: () => {
      const st = studioOf(a)
      const out = simulateStudioEngines(g, st, g.year, { ...OPERATION, asset: a })
      saveStudio(a, st)
      return out.notes.join('\n')
    },
  }
}

const workshopCase = (): Case => {
  const g = inventor({ money: 5_000_000 })
  neutralAmbition(g)
  give(g, IDEA)
  return {
    g,
    says: ODDS,
    screen: () => String((ideaMenu(g, IDEA).children(g).find((n): n is MenuInfo => n.type === 'info' && n.id === `ws.idea.${IDEA}.why.odds`) as MenuInfo | undefined)?.text ?? ''),
    result: () => {
      g.queue = []
      g.rng = rngBelow(0.004)
      const made = resolveBuild(g, ideaTarget(IDEA), 'safe')
      expect(made?.result).toBe('kaboom')
      return g.queue.flatMap((m) => (m.kind === 'notice' ? [m.text] : [])).join('\n')
    },
  }
}

/** `fails`: the system can fail; `says`: the failure names its cause in a sentence of the engine's (the Workshop tells it as a story, and says what it taught). */
const CASES: { system: SystemId; make: () => Case; fails: boolean; cause: boolean }[] = [
  { system: 'rd', make: rdCase, fails: true, cause: true },
  { system: 'heavy', make: heavyCase, fails: true, cause: true },
  { system: 'ops', make: opsCase, fails: true, cause: true },
  { system: 'deeptech', make: () => labCase(false), fails: true, cause: true },
  { system: 'aicaps', make: () => labCase(true), fails: true, cause: true },
  { system: 'studio', make: studioCase, fails: false, cause: false },
  { system: 'workshop', make: workshopCase, fails: true, cause: false },
]

describe('every migrated screen says why, and every result says what it taught', () => {
  it.each(CASES)('$system: the screen shows the odds line (or the pace in words) with its labelled terms, and no dash', ({ make }) => {
    const c = make()
    const text = c.screen()
    expect(text).toMatch(c.says)
    expect(DASH.test(text)).toBe(false)
    if (c.says === ODDS) expect(text).toMatch(/Odds \d+%: [a-z -]+ [+-]\d+/)
  })

  it.each(CASES)('$system: a failed run says what went wrong and what it taught, in sentences of at most 90 characters', ({ make, fails, cause }) => {
    const c = make()
    const text = c.result()
    expect(DASH.test(text)).toBe(false)
    expect(text).toMatch(KNOW_TEXT)
    if (fails) {
      if (cause) expect(text).toMatch(CAUSE)
      expect(text).toMatch(TAUGHT)
    } else {
      // An engine never fails, so its ready line says what the work taught and what that buys.
      expect(text).toMatch(/game engine is ready/)
      expect(text).toMatch(/The next engine comes a little sooner/)
    }
    for (const sentence of text.split(/(?<=[.!?])\s+/)) {
      if (CAUSE.test(sentence) || TAUGHT.test(sentence)) expect(sentence.length, sentence).toBeLessThanOrEqual(90)
    }
  })

  it.each(CASES)('$system: the screen draws nothing from g.rng and reads a deep-frozen game the same', ({ make }) => {
    const c = make()
    let want = ''
    expect(noDraw(c.g, () => (want = c.screen()))).toBe(true)
    const frozen = make()
    deepFreeze(frozen.g)
    expect(frozen.screen()).toBe(want)
  })

  it('a menu that shows odds shows the engine’s line: the words of the screen are the ones the engine writes (a team, funding, know-how)', () => {
    const labels = new Set<string>(Object.values(TERM_LABEL))
    for (const { make } of CASES) {
      const c = make()
      if (c.says !== ODDS) continue
      const text = c.screen()
      const terms = [...text.matchAll(/(?:^|[:,] )([a-z][a-z -]*?) [+-]\d+/g)].map((m) => m[1]!)
      expect(terms.length, text).toBeGreaterThan(0)
      for (const t of terms) {
        const known = labels.has(t) || ['skill', 'lab skill', 'blitz pace', 'talent', 'lab access', 'bench assistant', 'your skill', 'hard build', 'other'].includes(t)
        expect(known, `${t} in ${text}`).toBe(true)
      }
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// The record of what moved

/** A row of moved-tests.md, with the heading it sits under and its line. */
interface MovedRow {
  line: number
  section: string
  cells: string[]
}

/** The rows of every table of a moved-tests document (the header and the rule under it left out), under the headings that match `only`. */
function movedRows(md: string, only: RegExp = /./): MovedRow[] {
  const out: MovedRow[] = []
  let section = ''
  md.split('\n').forEach((text, i) => {
    if (text.startsWith('## ')) section = text.slice(3).trim()
    if (!text.startsWith('|') || !only.test(section)) return
    const cells = text.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
    if (cells.every((c) => /^:?-{3,}:?$/.test(c)) || (cells[0] === 'file' && cells[4] === 'why')) return
    out.push({ line: i + 1, section, cells })
  })
  return out
}

/** What is wrong with a row: not five cells, an empty cell, a file that is not a path of the project, a reason too short to be one. */
function movedProblems(rows: readonly MovedRow[]): string[] {
  const out: string[] = []
  for (const r of rows) {
    const at = `line ${r.line} (${r.section})`
    if (r.cells.length !== 5) {
      out.push(`${at}: ${r.cells.length} cells, not 5`)
      continue
    }
    const [file, test, before, after, why] = r.cells as [string, string, string, string, string]
    r.cells.forEach((c, i) => {
      if (c === '') out.push(`${at}: cell ${i + 1} is empty`)
    })
    if (file !== '' && !/^(test|src|docs|scripts)\//.test(file)) out.push(`${at}: the file "${file.slice(0, 40)}" is not a path of the project`)
    if (test !== '' && test.length < 6) out.push(`${at}: the test is not named`)
    if (before !== '' && after !== '' && before === after) out.push(`${at}: before and after are the same`)
    if (why !== '' && (why.length < 30 || !/[a-z]{3,} [a-z]{3,} [a-z]{3,}/i.test(why))) out.push(`${at}: the reason is too short to be one`)
  }
  return out
}

/** The shared file the lanes write their rows to: named by R3_MOVED_TESTS, else the plan folder of this checkout. */
function movedFile(): string | null {
  const here = join(ROOT, 'docs/superpowers/plans/2026-10-22-r3-v5.1.0/moved-tests.md')
  const named = process.env.R3_MOVED_TESTS
  for (const path of [named, here]) if (path !== undefined && path !== '' && existsSync(path)) return path
  return null
}

describe('moved-tests.md has five cells and a reason in every row of the migration', () => {
  const good = (over: Partial<Record<'file' | 'test' | 'before' | 'after' | 'why', string>> = {}): string => {
    const r = { file: 'test/a.test.ts', test: 'group > a case', before: 'the number was 3', after: 'the number is 4', why: 'R3-M2: the rule moved the number by one on purpose', ...over }
    return `| ${r.file} | ${r.test} | ${r.before} | ${r.after} | ${r.why} |`
  }
  const doc = (...rows: string[]): string => ['# Moved', '', '## effort-mig / main', '', '| file | test | before | after | why |', '|---|---|---|---|---|', ...rows, '', '## quiet', '', good({ why: 'x' }), ''].join('\n')

  it('finds a good row and nothing wrong with it, and reads only the headings it is asked about', () => {
    expect(movedRows(doc(good()), /^effort-mig/)).toHaveLength(1)
    expect(movedRows(doc(good()))).toHaveLength(2)
    expect(movedProblems(movedRows(doc(good()), /^effort-mig/))).toEqual([])
  })

  it('finds a row with four cells, an empty cell, a file that is not a path, a same before and after, and a reason that is no reason', () => {
    expect(movedProblems(movedRows(doc('| test/a.test.ts | a case | before | after |'), /^effort-mig/))).toEqual([expect.stringContaining('4 cells, not 5')])
    expect(movedProblems(movedRows(doc(good({ before: '' })), /^effort-mig/)).join('\n')).toContain('cell 3 is empty')
    expect(movedProblems(movedRows(doc(good({ file: 'somewhere' })), /^effort-mig/)).join('\n')).toContain('not a path')
    expect(movedProblems(movedRows(doc(good({ after: 'the number was 3' })), /^effort-mig/)).join('\n')).toContain('the same')
    expect(movedProblems(movedRows(doc(good({ why: 'moved' })), /^effort-mig/)).join('\n')).toContain('too short')
    expect(movedProblems(movedRows(doc(good({ test: 'a | b' })), /^effort-mig/)).join('\n')).toContain('6 cells')
  })

  it('every row of the migration track in the shared file has its five cells and a reason', () => {
    const path = movedFile()
    // The shared file is the lanes' working record: it is in the plan folder of a checkout that has the plans, and R3_MOVED_TESTS names it
    // anywhere else. Without it there is nothing here to read, and the unit cases above hold the rule.
    const rows = path === null ? [] : movedRows(readFileSync(path, 'utf8'), /^effort-mig/)
    if (path !== null) expect(rows.length, `rows under effort-mig in ${path}`).toBeGreaterThan(0)
    expect(movedProblems(rows)).toEqual([])
  })
})
