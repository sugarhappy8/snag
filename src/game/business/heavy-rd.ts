// Heavy R&D (docs/superpowers/specs/2026-10-14-heavy-rnd-design.md). The first half is pure: what a
// breakthrough leaves behind once it works. One record per kind in the market it was launched in (a
// list in game flags) is the single source of truth for three pure readers: the kind's demand over
// time (heavyLevel), when and how well each rival follows (heavyArrival, heavyVersionQuality), and the
// lift the whole trade gets (heavyPulse). None of them touches the game RNG: the same records and the
// same year always give the same answer, so the planner's what-ifs stay deterministic.
// The second half is the project itself: its price, years and odds (pure quotes), starting it, the
// launch roll at year-end (the only place that draws on the RNG) and the news that follows.
import { firmCash } from '../cash'
import { formatMoney, log, notice } from '../core'
import { quote } from '../effort/engine'
import { revealPolicyOf } from '../effort/hooks'
import { causeOf } from '../effort/step'
import type { EffortInput, Outcome, Quote, Reason, StepResult, Task } from '../effort/types'
import { causeLine, oddsLine, payoffLine } from '../effort/why'
import { carriedMarketNews, pushMarketNews } from '../history/market-events'
import { chance, rand, uid } from '../rng'
import type { Asset, GameState, Json } from '../types'
import { getCountry } from '../world'
import { adultBrandName } from './competition'
import { marketKey, type MarketCtx } from './competition-core'
import { isDeepTech } from './deeptech-state'
import { bizWorth, marketCtxFor } from './economy'
import { eraFits } from './era'
import { isFinanceFirm } from './finance-firm-state'
import { breakthroughByName, breakthroughsFor, type Breakthrough } from './heavy-data'
import { HEAVY_NOMINAL_COST, HEAVY_QUALITY_K, HEAVY_QUALITY_PLUS, heavyField, heavyTaskOf, heavyTerms } from './heavy-effort'
import { industryDef } from './industries'
import { shieldsOf } from './lab-state'
import type { DemandLevel } from './product-data'
import { fieldFor, fieldOf, hashOf, mix, productPull } from './product-market'
import { classicIdeas } from './products'
import { baseYears, DISCOUNT, HORIZON, launchP, projectQuality, pullValue, rdCost, rdOf, rdProjects, rdQuality, rdReserve, researchState, retiredReason, roundBudget } from './rd'
import { bookResearch, frontierFieldOf, researchInputs, type BookCtx } from './research-effort'
import { findBusiness, MAX_STORED_PROJECTS, readBiz, retiredOf, type BizState, type Product, type RdProject } from './state'
import { heavyStartsWave, heavyWaveFor } from './tech-wave-data'
import { announceWave } from './tech-waves'
import { clampN, money } from './util'

/** A breakthrough that worked, in the market it was launched in. */
export interface HeavyRecord {
  /** Its catalogue name (heavy-data.ts), which is also the family of the pioneer's line. */
  family: string
  /** Launch year: the first year the line is on sale. */
  year: number
  /** Years of development it took (1-6): the least anyone else needs after the launch. */
  years: number
  /** Quality of the pioneer's line at launch. */
  quality: number
  /** What it cost, internal dollars: a costlier breakthrough lifts the trade more. */
  cost: number
  /** Asset id of the pioneer. */
  by: string
  /** Set once the first rival to follow has been reported (a life-log line): the name it was reported under. */
  rival?: string
}

/** Most records kept per trade and market (the catalogue has five breakthroughs per trade). */
export const MAX_HEAVY_RECORDS = 12
/** Entries of a stored list that are looked at (a damaged save can't make every read slow). */
const MAX_SCAN = 64
const MAX_BY = 64
const MAX_RIVAL = 80

const NONE: readonly HeavyRecord[] = Object.freeze([])
/** The id prefix of the player's own companies in a rival list (npc-rivals.ts). */
const OWNED = 'owned:'

// ---------------------------------------------------------------------------
// The records in game flags

/** The flag a market's records live under: 'heavy.' + trade + '|' + market ('world' or a country id). */
export function heavyKey(industry: string, market: string): string {
  return 'heavy.' + industry + '|' + market
}

/** A stored record, checked field by field and clamped; null when it is not a usable record. */
function cleanRecord(x: unknown): HeavyRecord | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null
  const o = x as Record<string, unknown>
  const { family, year, years, quality, cost, by } = o
  if (typeof family !== 'string' || breakthroughByName(family) === null) return null
  if (typeof year !== 'number' || typeof years !== 'number' || typeof quality !== 'number' || typeof cost !== 'number') return null
  if (!Number.isFinite(year) || !Number.isFinite(years) || !Number.isFinite(quality) || !Number.isFinite(cost)) return null
  if (typeof by !== 'string') return null
  const rival = typeof o.rival === 'string' && o.rival.trim() ? o.rival.trim().slice(0, MAX_RIVAL) : undefined
  return {
    family,
    year: Math.round(clampN(year, 1800, 2300)),
    years: Math.round(clampN(years, 1, 6)),
    quality: Math.round(clampN(quality, 0, 100)),
    cost: clampN(cost, 0, 1e15),
    by: by.slice(0, MAX_BY),
    ...(rival ? { rival } : {}),
  }
}

/**
 * The records of a trade in a market: a validated copy, at most MAX_HEAVY_RECORDS, newest last, one
 * per family (the earliest). Anything damaged is dropped and numbers are clamped; a flag of the wrong
 * type reads as none. With no flag it returns one shared, frozen, empty list (no allocation: this is
 * read on every market context, and the planner builds hundreds).
 */
export function readHeavy(g: Pick<GameState, 'flags'>, industry: string, market: string): readonly HeavyRecord[] {
  const raw = g.flags ? g.flags[heavyKey(industry, market)] : undefined
  if (!Array.isArray(raw) || raw.length === 0) return NONE
  const out: HeavyRecord[] = []
  const at = new Map<string, number>()
  for (let i = Math.max(0, raw.length - MAX_SCAN); i < raw.length; i++) {
    const r = cleanRecord(raw[i])
    if (!r) continue
    const seen = at.get(r.family)
    if (seen === undefined) {
      at.set(r.family, out.length)
      out.push(r)
    } else if (r.year < out[seen].year) out[seen] = r
  }
  if (!out.length) return NONE
  return out.length > MAX_HEAVY_RECORDS ? out.slice(-MAX_HEAVY_RECORDS) : out
}

/** The records of a company's own market ('world' for a tradable trade, else its country). */
export function heavyOf(g: Pick<GameState, 'flags'>, b: { industry: string; countryId: string }): readonly HeavyRecord[] {
  return readHeavy(g, b.industry, marketKey(b))
}

/**
 * Write a launch into the market's list. A family that is already there keeps its earliest record (the
 * pioneer stays the pioneer); the list holds at most MAX_HEAVY_RECORDS, dropping the oldest. A record
 * that isn't valid is not stored. Rewrites the list from the validated one, so damage is repaired.
 */
export function addHeavy(g: GameState, industry: string, market: string, rec: HeavyRecord): void {
  const clean = cleanRecord(rec)
  if (!clean) return
  const list = [...readHeavy(g, industry, market)]
  const i = list.findIndex((r) => r.family === clean.family)
  if (i < 0) list.push(clean)
  else if (clean.year < list[i].year) list[i] = clean
  writeHeavy(g, industry, market, list)
}

function storedHeavy(list: readonly HeavyRecord[]): Json[] {
  return list.slice(-MAX_HEAVY_RECORDS).map((r) => ({ family: r.family, year: r.year, years: r.years, quality: r.quality, cost: r.cost, by: r.by, ...(r.rival ? { rival: r.rival } : {}) }))
}

function writeHeavy(g: GameState, industry: string, market: string, list: readonly HeavyRecord[]): void {
  g.flags[heavyKey(industry, market)] = storedHeavy(list)
}

/** Keys of heavy.* flags kept across a generation handoff (the real world has a handful). */
const MAX_CARRIED_KEYS = 256
const KEY_PREFIX = 'heavy.'
const MAX_TRADE = 40
const MAX_MARKET = 20

/**
 * The Heavy R&D state of the world that a new generation keeps: the records of every trade and market
 * ('heavy.<trade>|<market>') and the market news they came with. The heir finds the trade as the parent
 * left it: the breakthrough lines keep their demand curve, the trade keeps its lift, and nothing that
 * was launched is announced as a first again. Each flag goes through the reader that validates it on
 * load (readHeavy, readMarketNews) and is written back from the validated copy, so a damaged flag
 * is repaired or dropped here too. A key that isn't a trade and a market, or that holds nothing usable,
 * is not carried. Pure; the result is for the new game's flags.
 */
export function heavyWorldFlags(g: Pick<GameState, 'flags'>): Record<string, Json> {
  const out: Record<string, Json> = {}
  if (!g.flags) return out
  let kept = 0
  for (const key of Object.keys(g.flags)) {
    if (kept >= MAX_CARRIED_KEYS) break
    if (!key.startsWith(KEY_PREFIX)) continue
    const bar = key.indexOf('|')
    const industry = bar < 0 ? '' : key.slice(KEY_PREFIX.length, bar)
    const market = bar < 0 ? '' : key.slice(bar + 1)
    if (!industry || industry.length > MAX_TRADE || !market || market.length > MAX_MARKET || breakthroughsFor(industry).length === 0) continue
    const list = readHeavy(g, industry, market)
    if (!list.length) continue
    out[key] = storedHeavy(list)
    kept++
  }
  const news = carriedMarketNews(g)
  if (news) out['market.news'] = news
  return out
}

// ---------------------------------------------------------------------------
// The kind's demand

/** Years after the launch at which half of the eventual adoption is reached, and how wide the S is. */
const ADOPT_MID = 4
const ADOPT_WIDTH = 1.6
/** The S-curve ends here: full adoption ten years after the launch. */
const ADOPT_YEARS = 10
/** Demand holds at its peak until this many years after the launch, then declines... */
const PEAK_YEARS = 18
/** ...toward this share of the peak... */
const FALL_TO = 0.6
/** ...with this time constant (years). */
const FALL_YEARS = 10

const logistic = (t: number): number => 1 / (1 + Math.exp(-(t - ADOPT_MID) / ADOPT_WIDTH))
const LOGISTIC_END = logistic(ADOPT_YEARS)

/**
 * Demand for a breakthrough kind in its market and year: nothing before the launch, then an S-curve
 * over ten years up to a plateau, and from year 18 a slow decline toward 0.6 of the peak. Once the
 * kind exists it is never below 0.005 (the floor demandLevel uses). Pure.
 */
export function heavyLevel(rec: HeavyRecord, year: number): DemandLevel {
  if (!Number.isFinite(year) || !(year >= rec.year)) return { exists: false, adoption: 0, level: 0 }
  const t = year - rec.year
  const adoption = t >= ADOPT_YEARS ? 1 : Math.max(0.005, Math.min(1, logistic(t) / LOGISTIC_END))
  const fall = t > PEAK_YEARS ? FALL_TO + (1 - FALL_TO) * Math.exp(-(t - PEAK_YEARS) / FALL_YEARS) : 1
  return { exists: true, adoption, level: Math.max(0.005, adoption * fall) }
}

/** The demand curve of a family when there is a record for it (null: not a recorded breakthrough). */
export function heavyLevelFor(family: string, records: readonly HeavyRecord[], year: number): DemandLevel | null {
  for (const r of records) if (r.family === family) return heavyLevel(r, year)
  return null
}

// ---------------------------------------------------------------------------
// Everyone else pays the same time to catch up

/**
 * How many development times a rival of each size needs after the launch (a smaller rival can't fund
 * it as fast; none is faster than the pioneer, so none is under 1). A rival of a tier not listed is
 * read as a mid-size one.
 */
export const TIER_LAG: Readonly<Record<string, number>> = Object.freeze({ giant: 1, major: 1.25, mid: 1.5, small: 2 })

/** The year a rival offers its own version: the launch plus the tier's lag, and a year more for half of them. */
export function heavyArrival(rec: HeavyRecord, rival: { id: string; tier: string }): number {
  const lag = Object.hasOwn(TIER_LAG, rival.tier) ? TIER_LAG[rival.tier] : TIER_LAG.mid
  const late = mix(hashOf(rival.id), hashOf(rec.family), 2) < 0.5 ? 0 : 1
  const at = rec.year + Math.ceil(rec.years * lag) + late
  return Number.isFinite(at) ? at : Number.POSITIVE_INFINITY
}

/** The year the long tail of small competitors follows: twice the development time after the launch. */
export function heavyFringeArrival(rec: HeavyRecord): number {
  return rec.year + Math.ceil(rec.years * 2)
}

/** Quality of a rival's version: a little under the pioneer's (6 to 15 points), never better. */
export function heavyVersionQuality(rec: HeavyRecord, rival: { id: string; tier: string }): number {
  const worse = 6 + Math.floor(mix(hashOf(rival.id), hashOf(rec.family), 3) * 10)
  return Math.round(Math.max(Math.min(10, rec.quality), Math.min(rec.quality, rec.quality - worse)))
}

// ---------------------------------------------------------------------------
// Demand for the whole market

/** A breakthrough lifts the trade by this much at the least... */
const PULSE_BASE = 0.1
/** ...plus this much for every doubling of its cost over PULSE_REF, up to PULSE_DOUBLINGS doublings. */
const PULSE_PER_DOUBLING = 0.04
const PULSE_DOUBLINGS = 4
/** A typical small trade's breakthrough: 8 times the base cost of a classic line (rd.ts RD_BASE is 30,000). */
const PULSE_REF = 240_000
/** The lift builds up over the first three years (the launch year is the first of them)... */
const PULSE_RAMP = 3
/** ...holds until this many years after the launch... */
const PULSE_HOLD = 8
/** ...then halves every ten years. */
const PULSE_HALF_LIFE = 10
/** All breakthroughs together lift a market by at most this much. */
const PULSE_CAP = 0.4

/**
 * The multiplier on a market's potential (ctx.pot) from the breakthroughs in it: 1 with none. Each
 * record adds 10% to 26% of the market (more for a costlier one), building over three years from the
 * launch, holding for eight, then fading with a ten-year half-life; the sum is capped at +40% and the
 * answer is always a finite number from 1 to 1.4. Pure in (records, year).
 */
export function heavyPulse(records: readonly HeavyRecord[], year: number): number {
  if (!records.length || !Number.isFinite(year)) return 1
  let sum = 0
  for (const r of records) {
    if (!(year >= r.year)) continue
    const t = year - r.year
    const doublings = Number.isFinite(r.cost) && r.cost > PULSE_REF ? Math.min(PULSE_DOUBLINGS, Math.log2(r.cost / PULSE_REF)) : 0
    const ramp = Math.min(1, (t + 1) / PULSE_RAMP)
    const fade = t > PULSE_HOLD ? Math.pow(0.5, (t - PULSE_HOLD) / PULSE_HALF_LIFE) : 1
    const lift = (PULSE_BASE + PULSE_PER_DOUBLING * doublings) * ramp * fade
    if (Number.isFinite(lift)) sum += lift
  }
  return 1 + Math.min(PULSE_CAP, Math.max(0, sum))
}

// ---------------------------------------------------------------------------
// The project: price, years, odds

/**
 * A breakthrough costs this many times the first classic idea's development cost, fixed (no slider)... Its years (three times a
 * normal project, 4 to 6), its odds (55% of a normal launch's, 8% to 60%) and its quality (14 points above a lavishly funded line, at
 * most 97) are the Effort engine's calibration of one task with a budget of one (heavy-effort.ts)...
 */
export const HEAVY_COST_X = 8
/** ...and a company waits this many calendar years after one launches or flops before starting the next. */
export const HEAVY_COOLDOWN = 5

/** Of the launches that work, this share is a smash hit (an ordinary project's is 15%): quality and brand on top. */
export const HEAVY_HIT_P = 0.35
const HEAVY_HIT_QUALITY = 12
const HEAVY_SPREAD = 10
const HEAVY_HIT_BRAND = 12
const HEAVY_BRAND = 5
const HEAVY_FLOP_BRAND = -6

/** Heavy R&D is for product companies: deep-tech, studio and finance companies keep their own kind of R&D. */
export function heavyEligible(b: { industry: string }): boolean {
  return !isDeepTech(b) && !isFinanceFirm(b) && b.industry !== 'gameStudio'
}

/** What a breakthrough costs this company, paid up front (null: no classic idea the year allows to base it on). Pure. */
export function heavyCost(g: GameState, b: Pick<BizState, 'industry' | 'countryId' | 'city'>): number | null {
  const first = classicIdeas(g, b)[0]
  return first === undefined ? null : roundBudget(HEAVY_COST_X * rdCost(b, first))
}

/**
 * `quote` reads the game only for the player's own record (`who: 'you'`), and a read at the default actor has none to read, so the
 * years of a trade need no game: this stands in for it where there is none.
 */
const NO_GAME = null as unknown as GameState

/** The asset a company's state belongs to (the stored one; a normalized copy for display has none), or null: an NPC company. */
function assetOf(g: GameState, b: BizState): Asset | null {
  return g.assets.find((x) => (x.details as unknown) === b) ?? null
}

/**
 * The Task and the input of one breakthrough for this company, ready for `quote`: a budget of one (the price is fixed), the crew,
 * the company's know-how in this breakthrough's field (a failed try banks it), the trade's public research and rival pressure, and
 * the quality the company's own terms aim at. `a` is the company's asset when the caller has it (a menu reads a copy of the state
 * and says which asset it is); without it the stored asset is looked up, and none means an NPC company: steady, nothing banked.
 * `terms` adds the lines that say what the base is made of (skill, team). Pure.
 */
function heavySetup(g: GameState, b: BizState, name: string | undefined, a: Asset | null | undefined, terms: boolean): { task: Task; input: EffortInput } {
  const s = researchState(g, b)
  const field = heavyField(name)
  const task = heavyTaskOf({ field, cost: heavyCost(g, b) ?? HEAVY_NOMINAL_COST, baseYears: baseYears(b.industry), launch: launchP(g, b) })
  const input = researchInputs(g, s, a === undefined ? assetOf(g, b) : a, field, 1, 0, frontierFieldOf(b.industry))
  input.quality0 = rdQuality(g, b, HEAVY_QUALITY_K) + HEAVY_QUALITY_PLUS
  if (terms) input.baseTerms = [...(input.baseTerms ?? []), ...heavyTerms(s)]
  return { task, input }
}

/** The Task a breakthrough is for the engine (cost the fixed price, odds and years calibrated to this company). Pure. */
export function heavyTask(g: GameState, b: BizState, name?: string, a?: Asset | null): Task {
  return heavySetup(g, b, name, a, false).task
}

/**
 * What a breakthrough comes to for this company: the odds it works, the years, the quality it aims at, the price (`spend`) and the
 * labelled reasons. `name` is the breakthrough (a failed try of it banked know-how under its own field); without one the trade-wide
 * field is read. Pure: it draws nothing and writes nothing.
 */
export function heavyQuote(g: GameState, b: BizState, name?: string, a?: Asset | null): Quote {
  const { task, input } = heavySetup(g, b, name, a, true)
  return quote(g, task, input)
}

/** The labelled lines of a breakthrough's odds ("skill +3, team +6, know-how +8"), in odds points. Pure. */
export function heavyWhy(g: GameState, b: BizState, name?: string, a?: Asset | null): readonly Reason[] {
  return heavyQuote(g, b, name, a).reasons
}

/** The odds line a player reads ("Odds 46%: skill +3, team +6"): what the reveal policy lets them see. Pure. */
export function heavyWhyLine(g: GameState, b: BizState, name?: string, a?: Asset | null): string {
  return oddsLine(heavyQuote(g, b, name, a), revealPolicyOf(g))
}

/** Booked years a breakthrough takes in this trade at the default actor: three times a normal project, from 4 to 6. */
export function heavyYears(b: { industry: string }): number {
  // The odds the task is built with (`launch`) and its price play no part in the years; a placeholder stands in for both.
  const task = heavyTaskOf({ field: heavyField(undefined), cost: HEAVY_NOMINAL_COST, baseYears: baseYears(b.industry), launch: 0.5 })
  return quote(NO_GAME, task, { k: 1 }).years
}

/** The chance a breakthrough works when it is done: 55% of a normal launch's chance, between 8% and 60% (and what know-how adds). */
export function heavyOdds(g: GameState, b: BizState, name?: string, a?: Asset | null): number {
  const { task, input } = heavySetup(g, b, name, a, false)
  return quote(g, task, input).p
}

/** The quality a breakthrough is expected to reach if it works (before the launch's luck). */
export function heavyQuality(g: GameState, b: BizState, name?: string, a?: Asset | null): number {
  const { task, input } = heavySetup(g, b, name, a, false)
  return quote(g, task, input).quality ?? 0
}

/**
 * The earliest year any rival can have its own version of a breakthrough launched in `rec.year`: the launch
 * plus the pioneer's own development time (what a giant needs; smaller rivals take longer, heavyArrival).
 */
export function heavyLead(rec: Pick<HeavyRecord, 'year' | 'years'>): number {
  return rec.year + Math.ceil(rec.years * TIER_LAG.giant)
}

/**
 * The families this company (its asset id) already launched in its market: the record keeps who made
 * it. A line that has since run its course is gone from the shelves, but the company opened that kind
 * once and doesn't open it again. Another company of the player's in the same market still can.
 */
function launchedFamilies(g: GameState, b: BizState, assetId: string | undefined): ReadonlySet<string> {
  if (assetId === undefined) return new Set()
  return new Set(readHeavy(g, b.industry, marketKey(b)).filter((r) => r.by === assetId).map((r) => r.family))
}

/**
 * The breakthroughs this company can start now, in catalogue order: the year and era allow them and the
 * company hasn't sold, retired, launched or begun them. `assetId` is the company's asset id (the record of a
 * launch remembers who made it); without it only what the company's own state shows is checked.
 */
export function heavyOffers(g: GameState, b: BizState, assetId?: string): readonly Breakthrough[] {
  if (!heavyEligible(b) || heavyCost(g, b) === null) return []
  const retired = retiredOf(b)
  const taken = new Set([...b.products.map((p) => p.name), ...rdProjects(b).map((p) => p.name), ...launchedFamilies(g, b, assetId)])
  return breakthroughsFor(b.industry).filter((x) => g.year >= x.first && eraFits(g, b.countryId, x.name) && !retired.includes(x.name) && !taken.has(x.name))
}

/**
 * Why the Heavy R&D list is empty, as one plain sentence for the Products screen (null: something is on
 * offer, or this company has no Heavy R&D). Either the year allows no breakthrough yet (nothing is
 * invented, or no classic idea exists to price one on), or the year allows some and every one of them is
 * retired or already this company's (on sale, in development or launched). Pure, from the catalogue and
 * the company; draws nothing.
 */
export function heavyNone(g: GameState, b: BizState, assetId?: string): string | null {
  if (!heavyEligible(b) || heavyOffers(g, b, assetId).length > 0) return null
  const open = heavyCost(g, b) !== null && breakthroughsFor(b.industry).some((x) => g.year >= x.first && eraFits(g, b.countryId, x.name))
  return open ? 'Every breakthrough this year allows is retired or already yours.' : `Nothing is invented yet for a breakthrough in ${Math.round(g.year)}.`
}

/** A name for a message: a damaged one can't flood a popup. */
const shown = (name: string): string => (typeof name === 'string' ? name.slice(0, 60) : '')

/** Why a breakthrough can't start now: one reason, or null when it can. `assetId` as for heavyOffers. Pure. */
export function heavyBlock(g: GameState, b: BizState, name: string, assetId?: string): string | null {
  if (!heavyEligible(b)) return 'Heavy R&D is for product companies. This one runs its own kind of R&D.'
  const def = typeof name === 'string' ? breakthroughsFor(b.industry).find((x) => x.name === name) : undefined
  if (!def) return typeof name === 'string' && name.trim() ? `${shown(name)} isn't a breakthrough this trade can develop.` : 'Pick a breakthrough first.'
  if (retiredOf(b).includes(name)) return retiredReason(name)
  if (b.products.some((p) => p.name === name)) return `${name} is already on sale.`
  if (launchedFamilies(g, b, assetId).has(name)) return `You already launched ${name}.`
  if (rdProjects(b).some((p) => p.name === name)) return `${name} is already in development.`
  if (g.year < def.first || !eraFits(g, b.countryId, name)) return `The world isn't ready for ${name} yet.`
  if (rdProjects(b).some((p) => p.heavy === true)) return 'A breakthrough is already in development, and only one can run at a time.'
  // A year from the future is damage, not a wait.
  const last = b.heavyLast
  if (typeof last === 'number' && Number.isFinite(last) && last <= g.year && last + HEAVY_COOLDOWN > g.year) return `Your last breakthrough ended in ${last}. The next can start in ${last + HEAVY_COOLDOWN}.`
  if (rdProjects(b).length >= MAX_STORED_PROJECTS) return 'Your R&D department is drowning in projects. Let some finish first.'
  const cost = heavyCost(g, b)
  if (cost === null) return 'Nothing is ready on the drawing board to base a cost on.'
  const need = cost + rdReserve(b)
  if (!(b.cash >= need)) return `${name} needs ${money(need)} of company cash with the usual cushion kept back (${money(need - Math.max(0, b.cash))} short).`
  return null
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000

/** Start a breakthrough: the whole cost leaves company cash now, like any project. Null (and a notice) when it can't start. */
export function startHeavy(g: GameState, a: Asset, b: BizState, name: string): RdProject | null {
  const why = heavyBlock(g, b, name, a.id)
  const cost = heavyCost(g, b)
  if (why || cost === null) {
    notice(g, 'R&D', why ?? 'Nothing is ready on the drawing board to base a cost on.', { emoji: '\u{1F9EA}' })
    return null
  }
  // One quote of the engine for the whole start: the years, the odds and the quality of this company's try, at the price it just paid.
  const setup = heavySetup(g, b, name, a, false)
  const q = quote(g, setup.task, setup.input)
  const years = q.years
  const odds = q.p
  firmCash(g, b, -cost, 'rnd', a.id)
  b.yearCosts += cost
  const p: RdProject = {
    id: uid(g, 'rd'),
    name,
    budget: cost,
    years,
    progress: 0,
    odds: round3(odds),
    boost: 0,
    quality: q.quality ?? 0,
    family: name,
    kind: 'breakthrough',
    heavy: true,
    cost,
    started: g.year,
  }
  rdOf(b).push(p)
  log(g, `${a.name} started developing ${name}.`)
  notice(
    g,
    'R&D Underway',
    `${a.name} is developing ${name}. It costs ${formatMoney(cost)} and has ${Math.round(odds * 100)}% odds in about ${years} years. If it flops, the money is gone.`,
    { emoji: '\u{1F9EA}' },
  )
  return p
}

/**
 * What a breakthrough is expected to add each year, for the board that must approve the spending
 * (manage.ts): the odds it works times the customers its line would win over eight years, as the
 * ordinary R&D value counts them (rd.ts rdValue), spread over five years. It leaves out the lift the
 * whole trade gets and the brand, so it is a floor. Pure.
 */
export function heavyGain(g: GameState, b: BizState, name: string, ctx?: MarketCtx): number {
  const cost = heavyCost(g, b)
  if (cost === null) return 0
  const c = ctx ?? marketCtxFor(g, b, g.year)
  const w = bizWorth(g, b)
  const { task, input } = heavySetup(g, b, name, undefined, false)
  const q = quote(g, task, input)
  const years = q.years
  const from = g.year + years
  const quality = Math.round(Math.min(99, (q.quality ?? 0) + HEAVY_HIT_P * HEAVY_HIT_QUALITY))
  const records: HeavyRecord[] = [...fieldFor(c).heavy.filter((r) => r.family !== name), { family: name, year: from, years, quality, cost, by: '' }]
  const line: Product = { name, launched: from, boost: 0, quality, family: name, kind: 'breakthrough' }
  let sales = 0
  for (let t = 0; t < HORIZON; t++) {
    const year = from + t
    const field = fieldOf(c.rivals, c.fringe, c.key, year, records, fieldFor(c).market)
    const base = productPull(b.industry, b.products, year, field).total
    const withIt = productPull(b.industry, [...b.products.filter((p) => p.name !== name), line], year, field).total
    sales += pullValue(c, b, w, base, withIt) * Math.pow(DISCOUNT, years - 1 + t)
  }
  const gain = (q.p * sales) / 5
  return Number.isFinite(gain) ? Math.max(0, gain) : 0
}

// ---------------------------------------------------------------------------
// The launch roll and the news

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-')

/**
 * The launch of the first of a kind: a life-log line is written by the caller; this queues the modal and
 * lists the item in the market news. The id is deterministic (company, generation, launch year, kind), so
 * a replay of the same year cannot announce it twice.
 */
function announceLaunch(g: GameState, a: Asset, b: BizState, rec: HeavyRecord, market: string): void {
  const def = breakthroughByName(rec.family)
  if (!def) return
  const title = `${rec.family}: a New Kind of ${industryDef(b.industry).label}`
  const where = market === 'world' ? 'worldwide' : `in ${getCountry(b.countryId).name}`
  const text = `${a.name} launched ${rec.family}. ${def.note} Demand for the whole trade is rising ${where}. Rivals can have their own from about ${heavyLead(rec)}.`
  const id = `heavy-${a.id}-${g.generation}-${rec.year}-${slug(rec.family)}`
  const fresh = pushMarketNews(g, { id, year: rec.year, industry: b.industry, market, emoji: '\u{1F4F0}', title, text })
  if (fresh && g.character.alive && !g.queue.some((m) => m.id === id)) g.queue.push({ kind: 'notice', id, title, text, emoji: '\u{1F4F0}', tone: 'good' })
}

/**
 * Books a finished breakthrough through the engine (`step`, by way of the research seam): a failure banks know-how in the company's
 * own map under this breakthrough's field, so the next try of it is likelier (at most 15 points in all); a win banks none, and for
 * the player's own run lifts their ambition a little. Only a company with an asset learns: an NPC company (`a` is null) books
 * nothing and moves no state, so the NPC economy and the golden digests keep today's bytes. Draws nothing and moves no money; the
 * caller made the roll (`u`, against `odds`) and says how it came out.
 *
 * Returns the words a failure adds to the results line: the cause, read from the quote's own reasons, and what the failure taught.
 * Empty for a win, for an NPC company and for a year already booked (a project whose `fx` was last stepped this year).
 */
function settleHeavy(g: GameState, a: Asset | null, b: BizState, p: RdProject, year: number, roll: { won: boolean; hit: boolean; odds: number; u: number }, quality?: number): string {
  if (a === null) return ''
  const { task, input } = heavySetup(g, b, p.name, a, false)
  const margin = (roll.odds - roll.u) * 100
  const outcome: Outcome = roll.won
    ? { kind: roll.hit ? 'hit' : 'works', margin, cause: null, done: 1 }
    : { kind: 'fail', margin, cause: causeOf(quote(g, task, input).reasons), done: 1 }
  const ctx: BookCtx = { year, k: 1 }
  if (p.fx !== undefined) ctx.fx = p.fx
  if (quality !== undefined) ctx.quality = quality
  const result: StepResult | null = bookResearch(g, a, task, outcome, ctx)
  if (roll.won || result === null || result.replay || outcome.cause === null) return ''
  return ` ${causeLine(outcome.cause, '')} ${payoffLine(task, outcome, result)}`
}

/**
 * A breakthrough project finished its years: it works or it flops. The roll is the only place Heavy R&D
 * draws on the game RNG, in this order and nothing else: the odds, then (if it works) whether it is a smash
 * hit, then the quality spread. A launch puts the line on sale as a kind of its own, writes the record the
 * market reads (demand, rivals, the lift for the whole trade) and makes the news; a flop loses the money,
 * six brand points and nothing more (nobody reports a private failure), but it teaches: the company banks
 * know-how in this breakthrough (settleHeavy). Either way the five-year wait starts.
 * Returns the line for the R&D Results notice.
 */
export function advanceHeavy(g: GameState, a: Asset | null, b: BizState, p: RdProject, year: number): { won: boolean; line: string } {
  const name = a?.name ?? 'The company'
  const spent = typeof p.cost === 'number' && Number.isFinite(p.cost) ? p.cost : p.budget
  b.heavyLast = year
  // The roll is the game's own `chance`, with its draw kept to hand to the engine as the margin: `rand(g) < odds`, one draw.
  const odds = clampN(p.odds, 0.02, 0.98)
  const u = rand(g)
  if (!(u < odds)) {
    b.brand = clampN(b.brand + HEAVY_FLOP_BRAND, 0, 100)
    log(g, `${name}'s ${p.name} flopped.`, 'bad')
    const learned = settleHeavy(g, a, b, p, year, { won: false, hit: false, odds, u })
    return { won: false, line: `\u{1F4A5} ${p.name} flopped in testing (${money(spent)} of R&D).${learned}` }
  }
  const hit = chance(g, HEAVY_HIT_P)
  const quality = Math.round(clampN(projectQuality(p) + (rand(g) * 2 - 1) * HEAVY_SPREAD + (hit ? HEAVY_HIT_QUALITY : 0), 5, 99))
  settleHeavy(g, a, b, p, year, { won: true, hit, odds, u }, quality)
  // A line of the same name may have come with a rival bought meanwhile: the better one stays.
  const line: Product = { name: p.name, launched: year + 1, boost: 0, quality, family: p.name, kind: 'breakthrough' }
  const same = b.products.findIndex((x) => x.name === p.name)
  if (same < 0) b.products.push(line)
  else if ((b.products[same].quality ?? 0) < quality) b.products[same] = line
  b.brand = clampN(b.brand + (hit ? HEAVY_HIT_BRAND : HEAVY_BRAND), 0, 100)
  const market = marketKey(b)
  const pioneer = !readHeavy(g, b.industry, market).some((r) => r.family === p.name)
  const rec: HeavyRecord = { family: p.name, year: year + 1, years: p.years, quality, cost: spent, by: a?.id ?? '' }
  addHeavy(g, b.industry, market, rec)
  log(g, `${name} launched ${p.name}.`, 'good')
  if (pioneer && a) {
    announceLaunch(g, a, b, rec, market)
    // A listed launch is a platform the neighbouring trades feel too (tech-waves.ts). Only the pioneer, and only soon after the
    // real date: an old technology launched late is a follower, not a wave. The launch notice above is the only news.
    const hw = heavyWaveFor(b.industry, p.name)
    const def = breakthroughByName(p.name)
    if (hw && def && heavyStartsWave(b.industry, def, rec.year)) {
      announceWave(g, { kind: hw.kind, source: 'heavy', origin: `${heavyKey(b.industry, market)}#${p.name}`, name: p.name, size: hw.size, market, year: rec.year, home: b.countryId, by: a.id })
    }
  }
  const how = hit ? 'is a smash hit' : 'launches'
  const after = pioneer ? `No rival sells one yet. The first can follow from about ${heavyLead(rec)}.` : 'The kind is already on the market.'
  return { won: true, line: `${hit ? '\u{1F525}' : '\u{1F680}'} ${p.name} ${how}: quality ${quality}. ${after}` }
}

/**
 * Year-end, for every product company: when the first rival of the market can offer a breakthrough that
 * worked (never before the pioneer's own development time has passed), say so once in the life log. The
 * record keeps the name it was reported under, so a second company in the same market, or the next year,
 * doesn't repeat it. Only a real rival counts: never one of the player's own companies, and a record is
 * marked reported only by a rival that launches its own. Reads the market only; draws nothing.
 */
export function heavyArrivals(g: GameState, b: BizState, year: number): void {
  if (!heavyEligible(b)) return
  const market = marketKey(b)
  const records = readHeavy(g, b.industry, market)
  if (!records.length) return
  // A pioneer's patent holds rivals back: while its shield lasts into the new year the first rival isn't reported (lab-state.ts shieldsOf).
  const held = (r: HeavyRecord): boolean => {
    const co = findBusiness(g, r.by)
    return co !== undefined && shieldsOf(readBiz(g, co)).some((x) => x.family === r.family && year + 1 < x.until)
  }
  // The new year is the one the rivals sell in; nothing can be due before the development time is over.
  const due = records.filter((r) => r.rival === undefined && year + 1 >= r.year + r.years && !held(r))
  if (!due.length) return
  const rivals = marketCtxFor(g, b, year + 1).rivals
  let reported = false
  const next = records.map((r) => {
    if (!due.includes(r)) return r
    let best = -1
    let at = Number.POSITIVE_INFINITY
    rivals.forEach((x, i) => {
      // An NPC company's year-end also runs this, and its rivals include the player's own companies
      // ('owned:<id>', npc-rivals.ts): a company of the player's is not a rival launching its own.
      if (x.legacy || !(x.pull > 0) || x.id.startsWith(OWNED)) return
      const when = heavyArrival(r, x)
      if (when < at) {
        at = when
        best = i
      }
    })
    if (best < 0 || year + 1 < at) return r
    const who = adultBrandName(g, b, rivals[best].name, rivals[best].real, best)
    log(g, `${who} launches its own ${r.family}.`)
    reported = true
    return { ...r, rival: who.trim().slice(0, MAX_RIVAL) || 'A rival' }
  })
  if (reported) writeHeavy(g, b.industry, market, next)
}
