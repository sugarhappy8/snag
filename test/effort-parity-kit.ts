// R3-M0 (C.3): the parity oracle kit. The R3 release moves every research system (product R&D, Heavy R&D, Operations R&D, deep tech,
// the AI capability tracks, the studio engines and the Workshop's builds) onto one Effort engine, and says the balance stays
// unchanged at the default actor (ambition 50, steady posture, no fatigue, no banked knowledge): the odds and the quality within
// 1 point, the years and the price exact. This kit is how that is proven. It runs today's exported research functions over an input
// grid and over one scripted lifecycle per system, and test/fixtures/effort-parity.json holds the numbers recorded on the
// unmodified v5.0.0 code (RECORD_EFFORT_PARITY=1, under Node 22). A migration task keeps the legacy names (rdQuote, heavyOdds,
// opsOdds, programTerms, finalOdds, buildOdds ...) as wrappers over the engine, so probe(system) after the change is the same
// call on new code, and expectParity(system) fails with the first rows that moved.
//
//   probe(system, measure?)       the rows of the grid. `measure` replaces the legacy call (a task that reads the engine's quote
//                                 directly passes its own); it gets the real state of the point and the input, and returns numbers
//   lifecycle(system, life?)      the scripted case run to its end: { facts, digest }; facts hold g.rng, what was made (lines on
//                                 sale, levels, records), never text, so a payoff line or a cause appended to a results notice
//                                 does not move them. `life` is the (seed, year) tuple, for searching one
//   expectParity / parityDiff     the rows against the file; expectLifecycle the lifecycle against the file
//   compareParity(old, new, tol, slack?)  the rule: see TOL. `slack` lets a row sit above the oracle by that many odds points (J.8)
//   inputGrid, idOf, parseId, gridInputs, gridHash   the grid vocabulary (cartesian product, keys sorted, stable ids)
//   neutralAmbition(g)            the default actor: ambition 50 once the engine reads willpower, discipline and the talents (55 and 55, less
//                                 willpower where a talent adds its points); probe() applies it at every point
//
// How the grids are built. Every point is a real state from the existing kits (labGame, adult, company, techLab, makeTestGame),
// built once per trade and changed in place before each read: the hired manager's skill, the quality, the research team, the
// quality staff, the projects already running. Every field a grid varies is set at every point, so no point leaks into the next.
// A "hired" point has a manager running the company, so its numbers do not depend on the owner at all; an "owner" point is the
// player at the default ambition.
//
// Floats are cut to 9 significant digits before they are compared or stored (the engine's Math.log, Math.exp and Math.pow differ in
// the last bit between macOS arm64 and Linux x64), as test/r2-parity-kit.ts does. A row is stored on one line, without its input:
// the id is the part and the sorted key=value pairs, and readOracle parses the input back out of it.
//
// The lives are tuples ([seed, year]), never `seed: <digits>` (test/seed-pins.test.ts). They were searched once, so that each
// lifecycle has the outcomes it is there to cover, and are constants now: an oracle cannot search.
//
// This kit draws no random number of its own: every probe is a read (a draw in one throws), and a lifecycle draws only what the
// system's own year draws.
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CapId } from '../src/game/business/ai-bench-data'
import { capBest, modelRating } from '../src/game/business/ai-bench'
import { marketKey } from '../src/game/business/competition-core'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { advancePrograms, finalOdds, programTerms, startProgram, trialCost, trialOdds, trialStep } from '../src/game/business/deeptech-rd'
import { PROGRAMS, capProgram, programDef, type ProgramDef } from '../src/game/business/deeptech-data'
import { readTech, timesDone, type DeepTechIndustry, type Drug, type TechProgram, type TechState } from '../src/game/business/deeptech-state'
import { techOf } from '../src/game/business/deeptech-core'
import { engineTier, type EngineTier, type StudioEngine } from '../src/game/business/gamestudio-engine-state'
import { simulateStudioEngines, startStudioEngine } from '../src/game/business/gamestudio-engines'
import { assignedDevs, normalizeStudio } from '../src/game/business/gamestudio-state'
import { heavyCost, heavyOdds, heavyQuality, heavyYears, readHeavy, startHeavy } from '../src/game/business/heavy-rd'
import { breakthroughsFor } from '../src/game/business/heavy-data'
import { opsProgram } from '../src/game/business/lab-data'
import { readLab } from '../src/game/business/lab-state'
import { opsOdds, opsPrice, opsYears } from '../src/game/business/lab-rules'
import { startOps } from '../src/game/business/lab-year'
import { classicIdeas } from '../src/game/business/products'
import { advanceRd, launchP, rdCost, rdQuote, startRd } from '../src/game/business/rd'
import { bizOf, type BizState, type KeyStaff, type RdProject } from '../src/game/business/state'
import type { Industry } from '../src/game/data/markets'
import { ambitionOf } from '../src/game/effort/persona'
import { PRESENT_YEAR } from '../src/game/history/timeline'
import { readMarketNews } from '../src/game/history/market-events'
import { fnv1a } from '../src/game/text/hash'
import type { Asset, GameState, Json } from '../src/game/types'
import { getCountry } from '../src/game/world'
import { brainstorm, brainstormOdds, buildCost, buildOdds, resolveBuild, skillGain, type Approach } from '../src/game/workshop/build'
import { IDEAS, catalogIdea, type IdeaDef } from '../src/game/workshop/catalog'
import { addIdea, mutWorkshop, readWorkshop } from '../src/game/workshop/notebook'
import type { Workshop } from '../src/game/workshop/state'
import { adultIn } from './deeptech-kit'
import { makeTestGame } from './helpers'
import { labGame, patchLab } from './lab-kit'
import { rated } from './ai-bench-kit'

// ---------------------------------------------------------------------------------------------------------------------
// The vocabulary

/** The systems the oracle covers, in file order. R6 (school, lessons) and R9 (domains) add an id and a grid the same way. */
export const SYSTEMS = ['rd', 'heavy', 'ops', 'deeptech', 'aicaps', 'studio', 'workshop'] as const
export type SystemId = (typeof SYSTEMS)[number]

/** Where the oracle is written and read, relative to the repository root. */
export const PARITY_FILE = 'test/fixtures/effort-parity.json'
export const RECORD_COMMAND = 'RECORD_EFFORT_PARITY=1 npx vitest run --maxWorkers=1 test/effort-parity-kit.test.ts'

/** Significant digits kept of a number that is not an integer (test/r2-parity-kit.ts PARITY_DIGITS is the same rule). */
export const PARITY_DIGITS = 9

/**
 * What a migrated system may move, in the units of its row: odds in percentage points, quality in quality points, years not at all,
 * dollars by one. `topCeoSlack` is the one exception to parity (J.8): a hired manager rated 90 or more may sit up to that many
 * odds points above the oracle, on the rows a task names through the `slack` argument of compareParity, and nowhere else.
 */
export const TOL = { odds: 1, quality: 1, years: 0, usd: 1, topCeoSlack: 3 } as const
export type Tol = typeof TOL

export type Scalar = number | string | boolean
/** One point of a grid: a `part` name and the values of that part's axes. */
export type Input = { part: string } & Record<string, Scalar>

/** What a read returns for one point. `odds` is a fraction. An extra is judged by the unit its name ends in: .p odds, .q quality, .y years, .usd dollars, else exact. */
export interface Measures {
  odds?: number
  years?: number
  quality?: number
  cost?: number
  extra?: Record<string, number>
}
export interface ParityRow extends Measures {
  id: string
  input: Input
}

/** A number cut to PARITY_DIGITS significant digits; an integer or a non-finite number as it is. */
export function roundSig(v: number): number {
  return Number.isFinite(v) && !Number.isInteger(v) ? Number(v.toPrecision(PARITY_DIGITS)) : v
}

/** The cartesian product of the axes: keys sorted, the first key varying slowest. */
export function inputGrid(axes: Record<string, readonly Scalar[]>): Record<string, Scalar>[] {
  let out: Record<string, Scalar>[] = [{}]
  for (const key of Object.keys(axes).sort()) out = out.flatMap((base) => axes[key].map((v) => ({ ...base, [key]: v })))
  return out
}

/** The stable id of a point: its part, then the sorted key=value pairs. */
export function idOf(input: Input): string {
  const { part, ...rest } = input
  return `${part}|${Object.keys(rest).sort().map((k) => `${k}=${String(rest[k])}`).join(',')}`
}

/** The input an id was made from (numbers and booleans by their text, everything else a string). */
export function parseId(id: string): Input {
  const cut = id.indexOf('|')
  const input: Input = { part: id.slice(0, cut) }
  const rest = id.slice(cut + 1)
  if (rest === '') return input
  for (const pair of rest.split(',')) {
    const eq = pair.indexOf('=')
    const text = pair.slice(eq + 1)
    input[pair.slice(0, eq)] = text === 'true' ? true : text === 'false' ? false : /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : text
  }
  return input
}

/** A part of a grid: a name and its axes. */
export interface GridPart {
  part: string
  axes: Record<string, readonly Scalar[]>
}

// The lists a grid walks are written out, not read from the game: a trade, a capability or a program the game adds later is not in
// this oracle (a later task adds a part for it), and the oracle cannot move under a data change.
const BUDGETS = [0.5, 0.75, 1, 1.5, 2, 3, 4]
const PACES = ['lean', 'steady', 'blitz']
const TRADES_DT: DeepTechIndustry[] = ['aiLab', 'biotech', 'carbonCapture', 'cybersecurity', 'drones', 'electricVehicles', 'fusion', 'neurotech', 'quantum', 'robotics', 'semiconductor', 'spaceTech']
const CAPS: CapId[] = ['language', 'coding', 'vision', 'speech', 'reasoning', 'agents', 'robotics', 'science']
const OPS_IDS = ['ops.cost.1', 'ops.cost.2', 'ops.cost.3', 'ops.yield.1', 'ops.yield.2', 'ops.yield.3', 'ops.quality.1', 'ops.quality.2', 'ops.quality.3']
const ENGINE_IDS: EngineTier[] = ['indie', 'professional', 'flagship']
const WORKSHOP_SKILL = [0, 20, 50, 90]
const WORKSHOP_SMARTS = [40, 70, 95]
const LEVELS = [1, 2, 3, 4, 5]

/** The grids, by system. The sizes are part of the contract: the fixture holds exactly these points (gridHash). */
export const GRIDS: Record<SystemId, readonly GridPart[]> = {
  rd: [
    { part: 'hired', axes: { skill: [20, 50, 80, 100], quality: [20, 50, 80], scientists: [0, 1, 3], budget: BUDGETS } },
    { part: 'trade', axes: { trade: ['restaurant', 'software', 'brewery', 'salon'], budget: BUDGETS } },
    { part: 'staff', axes: { staff: [0, 1], budget: [0.5, 1, 2] } },
    { part: 'crowd', axes: { projects: [0, 2], budget: [0.5, 1, 2] } },
    { part: 'owner', axes: { smarts: [30, 60, 90], talent: ['none', 'Business', 'Inventor'], budget: [1, 2] } },
  ],
  heavy: [{ part: 'hired', axes: { trade: ['restaurant', 'water', 'brewery'], skill: [20, 60, 100], scientists: [0, 2, 4] } }],
  ops: [{ part: 'hired', axes: { program: OPS_IDS, tier: ['low', 'mid', 'high'], skill: [20, 60, 100], scientists: [0, 3] } }],
  deeptech: [
    { part: 'terms', axes: { trade: TRADES_DT, program: ['first', 'state', 'big'], budget: [0.5, 1, 2, 3] } },
    { part: 'final', axes: { trade: TRADES_DT, program: ['first', 'state', 'trial'], skill: [20, 50, 80, 100], pace: PACES } },
    { part: 'owner', axes: { trade: ['aiLab', 'biotech', 'fusion'], smarts: [30, 60, 90], talent: ['none', 'match'], pace: ['steady', 'blitz'] } },
    { part: 'trial', axes: { area: ['none', 'alzheimers', 'rare', 'oncology', 'obesity'], phase: [0, 1, 2, 3], quality: [30, 70] } },
  ],
  aicaps: [
    { part: 'terms', axes: { cap: CAPS, level: [0, 1, 5, 10, 19, 20], budget: [1, 2] } },
    { part: 'final', axes: { cap: CAPS, skill: [20, 50, 80, 100], pace: PACES } },
    { part: 'rating', axes: { cap: CAPS, year: [2026, 2040], level: [0, 60], compute: [0, 12], research: [0, 8], roll: [0, 0.5, 1] } },
    { part: 'ceiling', axes: { cap: CAPS, year: [2026, 2030, 2040], roll: [0, 1], over: [30, 80] } },
  ],
  studio: [{ part: 'dev', axes: { tier: ENGINE_IDS, ratio: [0.25, 0.5, 1, 1.5, 3], operations: [0.6, 1], open: [0, 0.5, 1], quality: [30, 70], leadership: [20, 90] } }],
  workshop: [
    { part: 'build', axes: { skill: WORKSHOP_SKILL, smarts: WORKSHOP_SMARTS, genius: [false, true], difficulty: LEVELS, builds: [0, 1, 3], approach: ['safe', 'bold', 'cheap'] } },
    { part: 'brainstorm', axes: { skill: WORKSHOP_SKILL, smarts: WORKSHOP_SMARTS, genius: [false, true] } },
    { part: 'gain', axes: { skill: WORKSHOP_SKILL, difficulty: LEVELS, result: ['kaboom', 'master', 'works'], genius: [false, true] } },
  ],
}

/** Every point of a system's grid, in file order. */
export function gridInputs(system: SystemId): Input[] {
  return GRIDS[system].flatMap((p) => inputGrid(p.axes).map((i) => ({ part: p.part, ...i }) as Input))
}

/** Eight hex digits over the ids of a grid (the points of a system by default): a grid that lost a value or a part has another hash. */
export function gridHash(system: SystemId, inputs: readonly Input[] = gridInputs(system)): string {
  return fnv1a(inputs.map(idOf).join('\n')).toString(16).padStart(8, '0')
}

/**
 * The default actor: ambition 50 (the middle) once the engine derives it from willpower, discipline, the talents and what results did.
 * Willpower and discipline are 55 (which is 50 for a life with no talent); a talent adds to ambition (effort/persona.ts talentBonus), so
 * willpower is lowered by what the talents and a shift add (half a point of ambition per point of willpower) and the actor stays at 50.
 * The legacy research code reads no hidden trait, so the oracle's numbers do not depend on this.
 */
export function neutralAmbition(g: GameState): void {
  g.character.hidden.willpower = 55
  g.character.hidden.discipline = 55
  g.character.hidden.willpower = Math.min(100, Math.max(0, 55 - (ambitionOf(g) - 50) / 0.5))
}

// ---------------------------------------------------------------------------------------------------------------------
// Canonical text (for the lifecycle digests)

/** A copy of a value with every float cut to PARITY_DIGITS and `undefined` dropped (plain data only). */
function clean(v: unknown): unknown {
  if (typeof v === 'number') return roundSig(v)
  if (Array.isArray(v)) return v.map(clean)
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(v)) {
      const x = (v as Record<string, unknown>)[k]
      if (x !== undefined) out[k] = clean(x)
    }
    return out
  }
  return v
}

function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canon(o[k])}`).join(',')}}`
  }
  return JSON.stringify(Number.isFinite(v as number) || typeof v !== 'number' ? v : String(v)) ?? 'null'
}

export interface Lifecycle {
  /** Eight hex digits over the canonical facts. */
  digest: string
  facts: Record<string, unknown>
}

function lifeOf(facts: Record<string, unknown>): Lifecycle {
  const f = clean(facts) as Record<string, unknown>
  return { digest: fnv1a(canon(f)).toString(16).padStart(8, '0'), facts: f }
}

// ---------------------------------------------------------------------------------------------------------------------
// States

/** A life: the seed and the year it is played in. */
export type Life = readonly [seed: number, year: number]
const GRID_LIFE: Life = [3, 2030]

/** What a measure sees: the real state of one point. Which fields are set depends on the system. */
export interface Point {
  g: GameState
  a?: Asset
  b?: BizState
  /** Product R&D and Heavy R&D: the idea the quote is for. */
  idea?: string
  /** Deep tech and the AI lab. */
  t?: TechState
  def?: ProgramDef
  program?: TechProgram
  /** Studio: the engine in development and the studio state it is in. */
  engine?: StudioEngine
  studio?: ReturnType<typeof normalizeStudio>
  /** Workshop: the notebook, and an idea of the point's difficulty. */
  ws?: Workshop
  ideaDef?: IdeaDef
}

/** Reads one point. The legacy measure of a system calls today's exported functions. */
export type Measure = (pt: Point, input: Input) => Measures

interface Bench {
  /** Set the shared state to the point and return it. */
  at(input: Input): Point
  /** Today's exported functions at the point. */
  legacy: Measure
}

const manager = (skill: number, year: number): NonNullable<BizState['manager']> => ({ firstName: 'Ada', lastName: 'Grid', gender: 'female', skill, salary: 100_000, since: year - 1 })

/** One quality staff member whose power is about 1. */
function qualityStaff(): KeyStaff {
  return { id: 'staff-q', firstName: 'Q', lastName: 'Staff', gender: 'male', age: 40, role: 'Head of Quality', focus: 'quality', skill: 100, salary: 80_000, trait: 'steady', morale: 100, years: 3 }
}

export interface Setup {
  /** A hired manager's skill; absent: the owner runs it. */
  manager?: number
  quality: number
  scientists: number
  staff: number
  projects: number
}

function ordinaryProject(g: GameState, name: string, n: number): RdProject {
  return { id: `rd-grid${n}`, name, budget: 50_000, years: 2, progress: 0, odds: 0.5, boost: 0, quality: 50, started: g.year }
}

/** Put a company into the state a point describes. Every field is set, so one point never leaks into the next. */
export function setCompany(g: GameState, b: BizState, o: Setup): void {
  if (o.manager === undefined) {
    b.ceo = 'owner'
    b.manager = null
  } else {
    b.ceo = 'manager'
    b.manager = manager(o.manager, g.year)
  }
  b.quality = o.quality
  b.staff = o.staff > 0 ? [qualityStaff()] : []
  const ideas = classicIdeas(g, b)
  b.rd = Array.from({ length: o.projects }, (_, i) => ordinaryProject(g, ideas[(i + 1) % ideas.length] + ` (grid ${i})`, i))
  patchLab(b, (d) => {
    d.team = Array.from({ length: o.scientists }, () => g.year - 1)
  })
}

const DEFAULT_SETUP: Setup = { manager: 50, quality: 50, scientists: 0, staff: 0, projects: 0 }

/** A company of a trade in its second year, with the default actor (labGame plays one year). */
export function tradeFixture(trade: string, life: Life = GRID_LIFE): { g: GameState; a: Asset; b: BizState } {
  const f = labGame(life[0], trade as Industry, { year: life[1] })
  neutralAmbition(f.g)
  return f
}

function firstIdea(g: GameState, b: BizState): string {
  const idea = classicIdeas(g, b)[0]
  if (idea === undefined) throw new Error(`no classic idea for ${b.industry} in ${g.year}`)
  return idea
}

// ---------------------------------------------------------------------------------------------------------------------
// rd, heavy, ops

function companyBench(trades: (input: Input) => string, setup: (input: Input) => Setup, legacy: Measure): Bench {
  const cache = new Map<string, { g: GameState; a: Asset; b: BizState }>()
  return {
    at(input) {
      const trade = trades(input)
      if (!cache.has(trade)) cache.set(trade, tradeFixture(trade))
      const f = cache.get(trade)!
      setCompany(f.g, f.b, setup(input))
      return { g: f.g, a: f.a, b: f.b, idea: firstIdea(f.g, f.b) }
    },
    legacy,
  }
}

function rdBench(): Bench {
  const owner = new Map<string, { g: GameState; a: Asset; b: BizState }>()
  const hiredSetup = (i: Input): Setup => {
    const s: Setup = { ...DEFAULT_SETUP }
    if (i.part === 'hired') Object.assign(s, { manager: i.skill as number, quality: i.quality as number, scientists: i.scientists as number })
    if (i.part === 'staff') s.staff = i.staff as number
    if (i.part === 'crowd') s.projects = i.projects as number
    return s
  }
  const bench = companyBench((i) => (i.part === 'trade' ? (i.trade as string) : 'restaurant'), hiredSetup, ({ g, b, idea }, i) => {
    const cost = rdCost(b!, idea!)
    const q = rdQuote(g, b!, idea!, Math.round(cost * (i.budget as number)))
    return { odds: q.odds, years: q.years, quality: q.quality, cost, extra: { 'launchP.p': launchP(g, b!), k: q.k } }
  })
  const hired = bench.at
  bench.at = (i) => {
    if (i.part !== 'owner') return hired(i)
    if (!owner.has('f')) owner.set('f', tradeFixture('restaurant'))
    const f = owner.get('f')!
    setCompany(f.g, f.b, { ...DEFAULT_SETUP, manager: undefined })
    f.g.character.stats.smarts = i.smarts as number
    f.g.character.talents = i.talent === 'none' ? [] : [i.talent as string]
    return { g: f.g, a: f.a, b: f.b, idea: firstIdea(f.g, f.b) }
  }
  return bench
}

function heavyBench(): Bench {
  return companyBench(
    (i) => i.trade as string,
    (i) => ({ ...DEFAULT_SETUP, manager: i.skill as number, scientists: i.scientists as number }),
    ({ g, b }) => ({ odds: heavyOdds(g, b!), years: heavyYears(b!), cost: heavyCost(g, b!) ?? 0, quality: heavyQuality(g, b!) }),
  )
}

const OPS_TRADE: Record<string, string> = { low: 'restaurant', mid: 'brewery', high: 'software' }

function opsBench(): Bench {
  return companyBench(
    (i) => OPS_TRADE[i.tier as string],
    (i) => ({ ...DEFAULT_SETUP, manager: i.skill as number, scientists: i.scientists as number }),
    ({ g, b }, i) => {
      const rung = opsProgram(i.program as string)!.rung
      return { odds: opsOdds(g, b!, rung), years: opsYears(b!, rung), cost: opsPrice(b!, rung) }
    },
  )
}

// ---------------------------------------------------------------------------------------------------------------------
// deep tech and the AI capability tracks

/** A player-run lab of a deep-tech trade (level 60, stage 2), the way test/ai-bench-kit.ts lab() builds the AI lab. */
export function techLab(industry: string, life: Life, patch: Partial<TechState> = {}): { g: GameState; a: Asset; b: BizState; t: TechState } {
  const g = adultIn('us', 50_000_000, life[0], 95, life[1])
  neutralAmbition(g)
  const b0 = newBiz(g, industry as Industry, 'us', getCountry('us').cities[0], { cash: 50_000_000 })
  b0.tech = JSON.parse(JSON.stringify(Object.assign(readTech(undefined), { level: 60, stage: 2, venture: 50_000_000 }, patch))) as Json
  const a = createBusinessAsset(g, 'Grid Lab', b0, 0)
  g.assets.push(a)
  g.character.job = { defId: 'business_owner', title: 'Founder & CEO', company: a.name, category: 'special', salary: 0, level: 0, performance: 60, yearsInRole: 0, yearsAtCompany: 0, data: { assetId: a.id, startAge: g.character.age, roleStartAge: g.character.age } }
  const b = bizOf(g, a)
  return { g, a, b, t: techOf(b) }
}

/** A program as startProgram stores it, from terms at the plan's own budget. */
function programAt(g: GameState, b: BizState, t: TechState, def: ProgramDef, k = 1): TechProgram {
  const terms = programTerms(b, t, def, k)
  return { id: def.id, key: `${def.id}:grid`, name: def.id, emoji: def.emoji, years: terms.years, progress: 0, cost: terms.cost, odds: terms.odds, started: g.year, spent: 0, target: '' }
}

/** The dearest program of the trade at its start, nextgen apart: a capex build-out where the trade has one. */
function bigDef(ind: string, t: TechState): ProgramDef {
  const defs = PROGRAMS[ind as keyof typeof PROGRAMS].filter((d) => d.id !== 'nextgen' && !d.track)
  return defs.reduce((best, d) => (d.cost(t) * d.years > best.cost(t) * best.years ? d : best), defs[0])
}

function drugAt(area: string, phase: number, quality: number): Drug {
  return { id: 'd-grid', name: 'Gridomab', area, phase, quality, peak: 1, filed: 2030, approved: 0, royalty: 1, partner: '', failed: false }
}

function deeptechBench(): Bench {
  const labs = new Map<string, ReturnType<typeof techLab>>()
  const hire = (f: ReturnType<typeof techLab>, skill: number): void => {
    f.b.ceo = 'manager'
    f.b.manager = manager(skill, f.g.year)
    f.g.character.talents = []
    f.g.character.stats.smarts = 95
  }
  return {
    at(input) {
      const trade = input.part === 'trial' ? 'biotech' : (input.trade as string)
      if (!labs.has(trade)) labs.set(trade, techLab(trade, GRID_LIFE))
      const f = labs.get(trade)!
      const { g, a, b, t } = f
      t.pace = (input.pace as TechState['pace'] | undefined) ?? 'steady'
      t.done = input.program === 'state' ? ['nextgen', 'nextgen'] : []
      const pt: Point = { g, a, b, t }
      if (input.part === 'owner') {
        f.b.ceo = 'owner'
        f.b.manager = null
        g.character.stats.smarts = input.smarts as number
        g.character.talents = input.talent === 'none' ? [] : [trade === 'aiLab' ? 'Programming' : 'Academics']
      } else hire(f, (input.skill as number | undefined) ?? 50)
      if (input.part === 'trial') return pt
      const program = (input.program as string | undefined) ?? 'first'
      pt.def = program === 'state' ? programDef(trade as never, 'nextgen')! : program === 'big' ? bigDef(trade, t) : PROGRAMS[trade as keyof typeof PROGRAMS][0]
      if (program === 'trial') pt.program = { ...programAt(g, b, t, pt.def), id: 'trial', odds: trialOdds(drugAt('oncology', 1, 70)) }
      else if (input.part !== 'terms') pt.program = programAt(g, b, t, pt.def)
      return pt
    },
    legacy({ g, a, b, t, def, program }, i): Measures {
      if (i.part === 'terms') {
        const x = programTerms(b!, t!, def!, i.budget as number)
        return { odds: x.odds, years: x.years, cost: x.cost }
      }
      if (i.part === 'trial') {
        const d = drugAt(i.area === 'none' ? '' : (i.area as string), i.phase as number, i.quality as number)
        return { odds: trialOdds(d), years: trialStep(d)?.years ?? 0, cost: trialCost(b!, d) }
      }
      return { odds: finalOdds(g, a!, b!, t!, program!) }
    },
  }
}

/** The AI lab with a model rated in every capability, so each capability track is open to research. */
export function capLab(life: Life): ReturnType<typeof techLab> {
  const f = techLab('aiLab', life)
  const fam = 'Nova'
  const rating: Record<string, number> = {}
  for (const c of CAPS) rating[c] = capBest(fam, c, f.g.year) - 50
  f.t.models = [rated(fam, 1, f.g.year, rating)]
  return f
}

const RATING_FAM = 'grid'

function aicapsBench(): Bench {
  const lab = capLab(GRID_LIFE)
  return {
    at(input) {
      const { g, a, b, t } = lab
      t.pace = (input.pace as TechState['pace'] | undefined) ?? 'steady'
      b.ceo = 'manager'
      b.manager = manager((input.skill as number | undefined) ?? 50, g.year)
      g.character.talents = []
      const pt: Point = { g, a, b, t }
      if (input.part === 'terms' || input.part === 'final') {
        const cap = input.cap as CapId
        t.caps = { ...t.caps, [cap]: input.part === 'terms' ? (input.level as number) : 5 }
        pt.def = capProgram(cap)
        if (input.part === 'final') pt.program = programAt(g, b, t, pt.def)
      }
      return pt
    },
    legacy({ g, a, b, t, def, program }, i): Measures {
      if (i.part === 'terms') {
        const x = programTerms(b!, t!, def!, i.budget as number)
        const gate = def!.gate(t!, 'us')
        return { odds: x.odds, years: x.years, cost: x.cost, extra: { gate: gate === null ? 0 : gate === 'Fully researched.' ? 1 : 2 } }
      }
      if (i.part === 'final') return { odds: finalOdds(g, a!, b!, t!, program!) }
      const cap = i.cap as CapId
      const best = capBest(RATING_FAM, cap, i.year as number)
      const released = i.part === 'ceiling' ? best + (i.over as number) : 0
      const level = i.part === 'ceiling' ? 60 : (i.level as number)
      const rating = modelRating({ cap, year: i.year as number, fam: RATING_FAM, gen: 3, level, compute: i.part === 'ceiling' ? 12 : (i.compute as number), research: i.part === 'ceiling' ? 8 : (i.research as number), spec: 0, roll: i.roll as number, released })
      return { extra: { rating } }
    },
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// studio engines

function studioBench(): Bench {
  const g = makeTestGame(937, { age: 35, money: 10_000_000, countryId: 'us' })
  g.year = 2030
  return {
    at(input) {
      const tier = engineTier(input.tier as string)
      const st = normalizeStudio(undefined)
      const engine: StudioEngine = {
        id: 'engine1', name: 'Grid Engine', tier: tier.id, stage: 'dev', progress: 0, quality: 45, team: (input.ratio as number) * tier.team,
        started: g.year - 1, released: 0, spent: 0, terms: 'private', licenses: [], licenseSeq: 0, lastYear: 0, lastRevenue: 0, earned: 0, soldFor: 0,
      }
      st.engines.push(engine)
      st.engineSeq = 1
      return { g, studio: st, engine }
    },
    legacy({ g, studio, engine }, i) {
      const out = simulateStudioEngines(g, studio!, g.year, { employees: 400, wage: 50_000, quality: i.quality as number, leadership: i.leadership as number, brand: 50, operations: i.operations as number, open: i.open as number, market: 1 })
      return { quality: engine!.quality, cost: out.costs, extra: { 'progress.q': engine!.progress, 'spent.usd': engine!.spent } }
    },
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// the Workshop

/** An idea of each difficulty (the first in the catalog): only `d` reaches the odds. */
const IDEA_OF = new Map<number, IdeaDef>(LEVELS.map((d) => [d, IDEAS.find((x) => x.d === d)!]))

/**
 * The Workshop's default actor: ambition exactly 50. Willpower and discipline of 55 give that to a life with no ambitious talent;
 * the Inventor talent (a genius) adds 4 of its own, so a genius is set to 50 and 50. Today's workshop code never reads the hidden
 * traits, so this changes no recorded number; it makes the grid and the lifecycle read the migrated code at the default actor.
 */
function defaultActor(g: GameState, genius: boolean): void {
  g.character.hidden.willpower = genius ? 50 : 55
  g.character.hidden.discipline = genius ? 50 : 55
}

function workshopBench(): Bench {
  const g = makeTestGame(11, { age: 30, money: 5_000_000, talents: [], countryId: 'us' })
  g.year = 2026
  g.lifeId = 'ws-grid'
  return {
    at(input) {
      g.character.talents = input.genius ? ['Inventor'] : []
      defaultActor(g, input.genius === true)
      g.character.stats.smarts = (input.smarts as number | undefined) ?? 70
      const ws: Workshop = { ...readWorkshop(g), skill: input.skill as number }
      return { g, ws, ideaDef: IDEA_OF.get((input.difficulty as number | undefined) ?? 1) }
    },
    legacy({ g, ws, ideaDef }, i): Measures {
      if (i.part === 'brainstorm') return { odds: brainstormOdds(g, ws!) }
      if (i.part === 'gain') return { extra: { gain: skillGain(g, i.skill as number, i.difficulty as number, i.result as 'kaboom' | 'master' | 'works') } }
      const approach = i.approach as Approach
      const o = buildOdds(g, ws!, ideaDef!, i.builds as number, approach)
      return { odds: o.kaboom, cost: buildCost(g, ideaDef!, approach), extra: { 'master.p': o.master, 'low.q': o.low, 'high.q': o.high } }
    },
  }
}

const BENCHES: Record<SystemId, () => Bench> = { rd: rdBench, heavy: heavyBench, ops: opsBench, deeptech: deeptechBench, aicaps: aicapsBench, studio: studioBench, workshop: workshopBench }

// ---------------------------------------------------------------------------------------------------------------------
// probe and compare

function rowOf(input: Input, m: Measures): ParityRow {
  const row: ParityRow = { id: idOf(input), input }
  for (const k of ['odds', 'years', 'quality', 'cost'] as const) if (m[k] !== undefined) row[k] = roundSig(m[k])
  if (m.extra) {
    row.extra = {}
    for (const k of Object.keys(m.extra)) row.extra[k] = roundSig(m.extra[k])
  }
  return row
}

/**
 * Run a system's grid: `measure` (default: today's exported functions) at every point, as rows. A read that moves g.rng throws:
 * the quotes, odds and terms this oracle covers are what menus and hints call.
 */
export function probe(system: SystemId, measure?: Measure): ParityRow[] {
  const bench = BENCHES[system]()
  const read = measure ?? bench.legacy
  return gridInputs(system).map((input) => {
    const pt = bench.at(input)
    neutralAmbition(pt.g)
    const before = pt.g.rng
    const m = read(pt, input)
    if (pt.g.rng !== before) throw new Error(`${idOf(input)}: a read drew from g.rng`)
    return rowOf(input, m)
  })
}

const EPS = 1e-6

/** Differences between an oracle and a run, one line each; empty when they agree within `tol` (see TOL). */
export function compareParity(oracle: readonly ParityRow[], run: readonly ParityRow[], tol: Tol = TOL, slack?: (row: ParityRow) => number): string[] {
  const out: string[] = []
  const have = new Map(run.map((r) => [r.id, r]))
  const known = new Set(oracle.map((r) => r.id))
  for (const o of oracle) {
    const r = have.get(o.id)
    if (!r) {
      out.push(`${o.id}: missing from the run`)
      continue
    }
    const pairs: [string, number | undefined, number | undefined, number, number][] = [
      ['odds', o.odds, r.odds, 100, Math.max(tol.odds, slack ? slack(o) : 0)],
      ['years', o.years, r.years, 1, tol.years],
      ['quality', o.quality, r.quality, 1, tol.quality],
      ['cost', o.cost, r.cost, 1, tol.usd],
    ]
    for (const [name, a, b, scale, limit] of pairs) {
      if (a === undefined && b === undefined) continue
      if (a === undefined || b === undefined) out.push(`${o.id}: ${name} ${a === undefined ? 'is new' : 'is gone'} (${a} -> ${b})`)
      else {
        const d = (b - a) * scale
        const below = name === 'odds' ? tol.odds : limit
        if (d > limit + EPS || -d > below + EPS) out.push(`${o.id}: ${name} ${a} -> ${b} (${d >= 0 ? '+' : ''}${Number(d.toFixed(3))}${name === 'odds' ? ' points' : ''})`)
      }
    }
    const keys = new Set([...Object.keys(o.extra ?? {}), ...Object.keys(r.extra ?? {})])
    for (const k of keys) {
      const a = o.extra?.[k]
      const b = r.extra?.[k]
      if (a === undefined || b === undefined) {
        out.push(`${o.id}: ${k} ${a === undefined ? 'is new' : 'is gone'} (${a} -> ${b})`)
        continue
      }
      const unit = /\.(p|q|y|usd)$/.exec(k)?.[1]
      const limit = unit === 'p' ? tol.odds / 100 : unit === 'q' ? tol.quality : unit === 'y' ? tol.years : unit === 'usd' ? tol.usd : 1e-8 * Math.max(1, Math.abs(a))
      if (Math.abs(b - a) > limit + (unit === undefined ? 0 : EPS)) out.push(`${o.id}: ${k} ${a} -> ${b}`)
    }
  }
  for (const r of run) if (!known.has(r.id)) out.push(`${r.id}: not in the oracle`)
  return out
}

// ---------------------------------------------------------------------------------------------------------------------
// the file

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')

export interface OracleSystem {
  gridHash: string
  grid: { part: string; axes: Record<string, readonly Scalar[]>; n: number }[]
  rows: ParityRow[]
  lifecycle: Lifecycle
}

let cached: Record<string, OracleSystem> | null = null

/** One system of the recorded oracle. A missing file is an error that names the command that records it. */
export function readOracle(system: SystemId): OracleSystem {
  if (!cached) {
    const path = join(ROOT, PARITY_FILE)
    if (!existsSync(path)) throw new Error(`${PARITY_FILE} is missing: ${RECORD_COMMAND}`)
    const raw = JSON.parse(readFileSync(path, 'utf8')) as { v: number; systems: Record<string, OracleSystem> }
    if (raw.v !== 1) throw new Error(`${PARITY_FILE}: unknown version ${raw.v}`)
    for (const s of Object.values(raw.systems)) for (const r of s.rows) r.input = parseId(r.id)
    cached = raw.systems
  }
  const s = cached[system]
  if (!s) throw new Error(`${PARITY_FILE} has no ${system}: ${RECORD_COMMAND}`)
  return s
}

/** The rows a system's run moved against the file (the run is probe(system) by default). */
export function parityDiff(system: SystemId, rows: readonly ParityRow[] = probe(system), tol: Tol = TOL, slack?: (row: ParityRow) => number): string[] {
  const o = readOracle(system)
  const out = o.gridHash === gridHash(system) ? [] : [`${system}: the grid is not the recorded one (${o.gridHash} against ${gridHash(system)})`]
  return [...out, ...compareParity(o.rows, rows, tol, slack)]
}

/** Throws the first differences, naming the system. `measure` replaces the legacy call, as in probe. */
export function expectParity(system: SystemId, measure?: Measure, tol: Tol = TOL, slack?: (row: ParityRow) => number): void {
  const diff = parityDiff(system, probe(system, measure), tol, slack)
  if (diff.length > 0) throw new Error(`${system}: ${diff.length} difference${diff.length === 1 ? '' : 's'} in ${readOracle(system).rows.length} rows\n${diff.slice(0, 12).join('\n')}`)
}

/** Throws where the lifecycle differs from the recorded one. `run` replaces the lifecycle (a task with its own). */
export function expectLifecycle(system: SystemId, run: Lifecycle = lifecycle(system)): void {
  const o = readOracle(system).lifecycle
  if (run.digest === o.digest) return
  const lines: string[] = []
  for (const k of new Set([...Object.keys(o.facts), ...Object.keys(run.facts)])) {
    if (canon(o.facts[k]) !== canon(run.facts[k])) lines.push(`${k}: ${canon(o.facts[k])} -> ${canon(run.facts[k])}`)
  }
  throw new Error(`${system}: the lifecycle moved (${o.digest} -> ${run.digest})\n${lines.slice(0, 12).join('\n')}`)
}

/** The recorder. Refuses without RECORD_EFFORT_PARITY=1; writes the file, and names the node and the commit it ran on. */
export function recordParity(): void {
  if (process.env.RECORD_EFFORT_PARITY !== '1') throw new Error(`recordParity writes the oracle only when asked: ${RECORD_COMMAND}`)
  const head = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim()
  const parts: string[] = []
  for (const s of SYSTEMS) {
    const rows = probe(s).map(({ input: _input, ...r }) => JSON.stringify(r))
    const grid = GRIDS[s].map((p) => ({ part: p.part, axes: p.axes, n: inputGrid(p.axes).length }))
    parts.push(`${JSON.stringify(s)}: {\n"gridHash": ${JSON.stringify(gridHash(s))},\n"grid": ${JSON.stringify(grid)},\n"rows": [\n${rows.join(',\n')}\n],\n"lifecycle": ${JSON.stringify(lifecycle(s))}\n}`)
  }
  const text = `{\n"v": 1,\n"node": ${JSON.stringify(process.version)},\n"head": ${JSON.stringify(head)},\n"digits": ${PARITY_DIGITS},\n"systems": {\n${parts.join(',\n')}\n}\n}\n`
  writeFileSync(join(ROOT, PARITY_FILE), text)
  cached = null
}

// ---------------------------------------------------------------------------------------------------------------------
// lifecycles

/**
 * The lives the lifecycles are played in, searched once over seeds 1 to 40 for the outcomes each case is there to cover: product R&D
 * two lines launched and one flopped; Heavy R&D a launch (record, news, line on sale); Operations R&D one program won and one
 * flopped; deep tech three wins and a loss on the program that finishes last; the AI lab one capability track won and one stalled;
 * the Workshop three builds that work and two brainstorms that draw an idea; the studio's engine is the test file's own life.
 */
export const LIVES: Record<SystemId, Life> = {
  rd: [7, 2030],
  heavy: [1, 2030],
  ops: [5, 2030],
  deeptech: [11, PRESENT_YEAR],
  aicaps: [3, PRESENT_YEAR],
  studio: [937, 2030],
  workshop: [2, 2026],
}

/** The fiscal year the year-end just closed (the calendar moves on first, as nextYear does). */
function closeYear(g: GameState): number {
  g.year += 1
  return g.year - 1
}

const lineFacts = (b: BizState) => b.products.map((p) => [p.name, p.launched, p.quality, p.family ?? '', p.kind ?? ''])

function rdLife(life: Life): Lifecycle {
  const { g, a, b } = tradeFixture('restaurant', life)
  const ideas = classicIdeas(g, b)
  const cost = (idea: string) => rdCost(b, idea)
  // Three projects, started together so their stored odds do not feed each other: a lean one, a normal one, a lavish one.
  const plan: [string, number][] = [[ideas[0], 0.5], [ideas[1], 1], [ideas[2], 2]]
  const started = plan.map(([idea, k]) => startRd(g, a, b, idea, Math.round(cost(idea) * k)))
  const odds = started.map((p) => p?.odds ?? -1)
  const years = started.map((p) => p?.years ?? -1)
  const before = b.brand
  let ran = 0
  for (; ran < 6 && (b.rd ?? []).length > 0; ran++) advanceRd(g, b, closeYear(g))
  const launched = b.products.length
  return lifeOf({ odds, years, ran, won: launched, lost: started.length - launched, brand: b.brand, brandBefore: before, lines: lineFacts(b), left: (b.rd ?? []).length, rng: g.rng })
}

function heavyLife(life: Life): Lifecycle {
  const { g, a, b } = tradeFixture('restaurant', life)
  const name = breakthroughsFor('restaurant')[1].name
  const p = startHeavy(g, a, b, name)
  let ran = 0
  for (; ran < 8 && (b.rd ?? []).length > 0; ran++) advanceRd(g, b, closeYear(g))
  return lifeOf({
    odds: p?.odds ?? -1, years: p?.years ?? -1, ran, brand: b.brand, heavyLast: b.heavyLast ?? 0, lines: lineFacts(b),
    records: readHeavy(g, b.industry, marketKey(b)).map((r) => [r.family, r.year, r.years, r.quality, r.cost, r.by, r.rival ?? '']),
    news: readMarketNews(g).map((n) => n.id), rng: g.rng,
  })
}

function opsLife(life: Life): Lifecycle {
  const { g, a, b } = tradeFixture('restaurant', life)
  // Two programs on different tracks, one a year and one two: both roll in their own year, in track order.
  const ids = ['ops.cost.2', 'ops.quality.1']
  const started = ids.map((id) => startOps(g, a, b, id, true))
  let ran = 0
  for (; ran < 4 && readLab(b).programs.length > 0; ran++) advanceRd(g, b, closeYear(g))
  const lab = readLab(b)
  return lifeOf({ odds: started.map((p) => p?.odds ?? -1), ran, levels: lab.levels, runs: lab.runs, done: lab.done, due: lab.due.grant, left: lab.programs.length, rng: g.rng })
}

/** What a lab run to its end leaves: the stage and the books, the outcomes as marks (the lab report's words are not compared). */
function techFacts(g: GameState, t: TechState, marks: string[], extra: Record<string, unknown>): Record<string, unknown> {
  return { ...extra, marks, stage: t.stage, level: t.level, hype: t.hype, ipBook: t.ipBook, plantBook: t.plantBook, fails: t.fails, done: [...t.done], caps: { ...t.caps }, left: t.programs.length, rng: g.rng }
}

function deeptechLife(life: Life): Lifecycle {
  const { g, a, b, t } = techLab('quantum', life)
  // Four programs started together (four sites give the lab four slots); the two-year one finishes last, so a loss cannot come
  // before another program's roll and a later quote cannot depend on it.
  b.outlets[0].count = 4
  const ids = ['cryo', 'algorithms', 'pqc', 'qubits']
  const started = ids.map((id) => startProgram(g, b, t, programDef('quantum', id)!, 1))
  const marks: string[] = []
  const odds = started.map((p) => p?.odds ?? -1)
  let year = g.year
  for (let i = 0; i < 4 && t.programs.length > 0; i++) {
    year += 1
    marks.push(...advancePrograms(g, a, b, t, year - 1).notes.map((n) => n.slice(0, 1)))
  }
  return lifeOf(techFacts(g, t, marks, { odds, won: marks.filter((m) => m === '\u{2705}').length, lost: marks.filter((m) => m === '\u{274C}').length, times: timesDone(t, 'qubits') }))
}

function aicapsLife(life: Life): Lifecycle {
  const { g, a, b, t } = capLab(life)
  // Two capability tracks (two sites give the lab two), each its own field: one is meant to work and one to stall.
  b.outlets[0].count = 2
  const caps: CapId[] = ['language', 'coding']
  const started = caps.map((c) => startProgram(g, b, t, capProgram(c), 1))
  const marks: string[] = []
  let year = g.year
  for (let i = 0; i < 3 && t.programs.length > 0; i++) {
    year += 1
    marks.push(...advancePrograms(g, a, b, t, year - 1).notes.map((n) => n.slice(0, 1)))
  }
  return lifeOf(techFacts(g, t, marks, { odds: started.map((p) => p?.odds ?? -1), won: marks.filter((m) => m === '\u{2705}').length, lost: marks.filter((m) => m === '\u{274C}').length }))
}

function studioLife(life: Life): Lifecycle {
  const g = makeTestGame(life[0], { age: 35, money: 10_000_000, countryId: 'us' })
  g.year = life[1]
  const a = createBusinessAsset(g, 'Aurora Games', newBiz(g, 'gameStudio', 'us', 'Chicago', { cash: 100_000_000, employees: 60, quality: 90, brand: 80 }), 1_000_000)
  g.assets.push(a)
  startStudioEngine(g, a.id, 'professional', 'Aurora Engine')
  const st = normalizeStudio(a.details.studio)
  const opts = { employees: 60, wage: 50_000, quality: 90, leadership: 90, brand: 80, operations: 1, open: 1, market: 1 }
  let years = 0
  while (st.engines[0].stage === 'dev' && years < 6) {
    years += 1
    simulateStudioEngines(g, st, g.year + years, opts)
  }
  const x = st.engines[0]
  const readyRng = g.rng
  // Two licensing years on the finished engine: the only place this system draws.
  x.terms = 'subscription'
  let revenue = 0
  for (let i = 1; i <= 2; i++) revenue += simulateStudioEngines(g, st, g.year + years + i, opts).revenue
  return lifeOf({ years, stage: x.stage, progress: x.progress, quality: x.quality, spent: x.spent, released: x.released, devs: assignedDevs(st), readyRng, licenses: x.licenses.length, revenue, lastRevenue: x.lastRevenue, rng: g.rng })
}

function workshopLife(life: Life): Lifecycle {
  const g = makeTestGame(life[0], { age: 30, money: 5_000_000, talents: [], countryId: 'us' })
  g.year = life[1]
  g.lifeId = `ws-life-${life[0]}`
  defaultActor(g, false)
  const ws = mutWorkshop(g)
  // Three ideas of three categories, built once each the safe way, then two brainstorms.
  const picks: IdeaDef[] = []
  for (const idea of IDEAS) if (idea.d <= 2 && idea.from <= g.year && !picks.some((p) => p.cat === idea.cat) && picks.length < 3) picks.push(idea)
  for (const idea of picks) addIdea(g, ws, catalogIdea(idea.id)!)
  const built = picks.map((idea) => resolveBuild(g, { kind: 'idea', id: idea.id }, 'safe'))
  const drawn = [brainstorm(g), brainstorm(g)]
  const w = readWorkshop(g)
  const stats = g.character.stats
  return lifeOf({
    built: built.map((r) => (r ? [r.result, r.quality] : null)), drawn: drawn.map((d) => d?.id ?? null), skill: w.skill, builds: w.builds, kabooms: w.kabooms,
    ideas: w.ideas.map((i) => [i.id, i.q, i.builds]), health: stats.health, happiness: stats.happiness, smarts: stats.smarts, money: g.character.money, rng: g.rng,
  })
}

const LIFECYCLES: Record<SystemId, (life: Life) => Lifecycle> = { rd: rdLife, heavy: heavyLife, ops: opsLife, deeptech: deeptechLife, aicaps: aicapsLife, studio: studioLife, workshop: workshopLife }

/** The system's scripted case run to its end, in `life` (the system's own by default). */
export function lifecycle(system: SystemId, life: Life = LIVES[system]): Lifecycle {
  return LIFECYCLES[system](life)
}

