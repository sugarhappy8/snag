// Tech waves, the part that only reads (docs/superpowers/specs/2026-10-19-tech-waves-design.md, plan
// decisions D1-D22): the wave record, the validating readers of the two stored flags, and the one pure
// reaction formula (`waveFactors`). Every market reader uses it: marketCtxFor, nationalMarket,
// valuationOf, industryCycle and advanceRivals.
//
// This is its own module, and a LEAF, on purpose. nationalMarket (dynamics.ts) and advanceRivals
// (economic-actors.ts) sit low in the import graph: the national economy and the roster code load them
// before Heavy R&D and the company economy exist. business/tech-waves.ts reads Heavy R&D records, so it
// is as heavy as economy.ts; if those two modules imported it, they would drag that whole cycle in at the
// moment they load and the first module to import the board state would find the group board registered
// before it was ready. So the readers and the formula live here, with imports of data tables, history,
// the world table and `util` only; tech-waves.ts re-exports all of it and adds the writers and
// the yearly step.
//
// Reads never write and never use g.rng. Every writer replaces the array or the object it changes,
// because the read caches are keyed on the stored array or object.
import { INDUSTRY_IDS, type Industry } from '../data/markets'
import { FACTOR_BOUNDS, type MarketFactors } from '../history/market-events'
import { HISTORY_WAVES, historyWaveStates } from '../history/tech-waves'
import type { GameState, Json } from '../types'
import { COUNTRIES } from '../world'
import { isWaveKind, WAVE_KINDS, type WaveKind, type WaveKindDef } from './tech-wave-data'
import { clampN } from './util'

export const WAVES_KEY = 'techWaves'
export const BASE_KEY = 'techBase'
export const MAX_WAVES = 64
/** Settled factors kept (trade and market pairs). */
const MAX_BASE = 64
/** Entries of a stored settled record that are looked at (a hostile save cannot make every read slow). */
const MAX_BASE_SCAN = 256
/** So that 'wave-' + id stays within the 120 characters a news id may have. */
export const MAX_ID = 100
const MAX_NAME = 60
const MAX_ORIGIN = 64

export type WaveSource = 'heavy' | 'deeptech' | 'workshop' | 'rival' | 'race'
const SOURCES: readonly string[] = ['heavy', 'deeptech', 'workshop', 'rival', 'race']

export interface TechWave {
  /** `${source}:${kind}:${year}:${hashOf(origin).toString(36)}`, stable and unique. */
  id: string
  kind: WaveKind
  /** The news name, e.g. "Frontier AI". */
  name: string
  source: WaveSource
  /** Announcement year. */
  year: number
  /** 'world' or a country id (the market key the wave lives in). */
  market: string
  /** 0-1, how disruptive. */
  size: number
  /** 0-1, what investors expect. */
  hype: number
  /** 0-1, what has actually shipped and sold. */
  delivery: number
  /** Last year the wave was advanced (the idempotence marker). */
  last: number
  /** What wrote it: heavy `${heavyKey}#${family}`, deeptech `${assetId}#${milestone}`, else the idea id or `${trade}|${market}`. */
  origin?: string
  /** The country the wave came from (the national economy feed goes there). */
  home?: string
  /** Heavy waves only: the one trade whose demand term is skipped, because Heavy R&D already lifts it. */
  skip?: string
  /** Consecutive years mature. */
  mature?: number
}

/** The permanent factors a settled wave leaves behind, per `${trade}|${market}`. */
export interface TechBase {
  demand: number
  costs: number
}


const COUNTRY_IDS: ReadonlySet<string> = new Set(COUNTRIES.map((c) => c.id))
const TRADE_IDS: ReadonlySet<string> = new Set(INDUSTRY_IDS)
/** A real trade id. Not `isIndustry`: that is an `in` test, so a saved "constructor" would pass it. */
const isTrade = (x: unknown): x is Industry => typeof x === 'string' && TRADE_IDS.has(x)
const NONE: readonly TechWave[] = Object.freeze([])
const NEUTRAL: MarketFactors = Object.freeze({ demand: 1, costs: 1, value: 1 })
export const EMPTY_BASE: Readonly<Record<string, TechBase>> = Object.freeze({})
/** The first and last year any history row has a point in (outside them the table adds nothing). */
const HIST_FIRST = Math.min(...HISTORY_WAVES.map((w) => w.points[0][0]))
const HIST_LAST = Math.max(...HISTORY_WAVES.map((w) => w.points[w.points.length - 1][0]))


// ---------------------------------------------------------------------------
// The records in game flags

/** A stored wave, checked field by field and clamped; null when it is not a usable wave. */
export function cleanWave(x: unknown): TechWave | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null
  const o = x as Record<string, unknown>
  const { id, kind, name, source, year, market, size, hype, delivery, last } = o
  if (typeof id !== 'string' || !id.trim() || typeof name !== 'string' || !name.trim()) return null
  if (!isWaveKind(kind)) return null
  if (typeof source !== 'string' || !SOURCES.includes(source)) return null
  if (typeof market !== 'string' || (market !== 'world' && !COUNTRY_IDS.has(market))) return null
  if (typeof year !== 'number' || typeof size !== 'number' || typeof hype !== 'number' || typeof delivery !== 'number' || typeof last !== 'number') return null
  if (!Number.isFinite(year) || !Number.isFinite(size) || !Number.isFinite(hype) || !Number.isFinite(delivery) || !Number.isFinite(last)) return null
  const y = Math.round(clampN(year, 1800, 2300))
  const origin = typeof o.origin === 'string' && o.origin.trim() ? o.origin.trim().slice(0, MAX_ORIGIN) : undefined
  const home = typeof o.home === 'string' && COUNTRY_IDS.has(o.home) ? o.home : undefined
  const skip = typeof o.skip === 'string' && isTrade(o.skip) ? o.skip : undefined
  const mature = typeof o.mature === 'number' && Number.isFinite(o.mature) ? Math.round(clampN(o.mature, 0, 10)) : 0
  return {
    id: id.trim().slice(0, MAX_ID), kind, name: name.trim().slice(0, MAX_NAME), source: source as WaveSource, year: y, market,
    size: clampN(size, 0, 1), hype: clampN(hype, 0, 1), delivery: clampN(delivery, 0, 1),
    // A damaged future `last` would freeze a wave for ever if the marker were `last >= year`.
    last: Math.round(clampN(last, y, 2300)),
    ...(origin ? { origin } : {}), ...(home ? { home } : {}), ...(skip ? { skip } : {}), ...(mature > 0 ? { mature } : {}),
  }
}

/** The stored shape: no undefined values (Json has none). */
export function storedWave(w: TechWave): Json {
  return {
    id: w.id, kind: w.kind, name: w.name, source: w.source, year: w.year, market: w.market, size: w.size, hype: w.hype, delivery: w.delivery, last: w.last,
    ...(w.origin ? { origin: w.origin } : {}), ...(w.home ? { home: w.home } : {}), ...(w.skip ? { skip: w.skip } : {}), ...(w.mature ? { mature: w.mature } : {}),
  }
}


// Validated lists by the RAW stored array (as invest/shocks.ts does): every writer replaces the array,
// so the array itself is the key, and a new list, a structuredClone or a reload is a miss.
const reads = new WeakMap<Json[], { length: number; list: readonly TechWave[] }>()

/**
 * The live waves: a validated, frozen copy, at most MAX_WAVES (the newest), one per id (the first
 * copy wins). Anything damaged is dropped and numbers are clamped; a flag of the wrong type reads as
 * none. Validated once per stored array; with no flag it is one shared, frozen, empty list. Pure.
 */
export function readTechWaves(g: Pick<GameState, 'flags'>): readonly TechWave[] {
  const raw = g.flags ? g.flags[WAVES_KEY] : undefined
  if (!Array.isArray(raw) || raw.length === 0) return NONE
  const hit = reads.get(raw)
  if (hit && hit.length === raw.length) return hit.list
  const out: TechWave[] = []
  const seen = new Set<string>()
  for (let i = Math.max(0, raw.length - MAX_WAVES); i < raw.length; i++) {
    const w = cleanWave(raw[i])
    if (!w || seen.has(w.id)) continue
    seen.add(w.id)
    out.push(Object.freeze(w))
  }
  const list = out.length ? Object.freeze(out) : NONE
  reads.set(raw, { length: raw.length, list })
  return list
}

const baseReads = new WeakMap<object, Readonly<Record<string, TechBase>>>()

/**
 * The permanent factors settled waves left, by `${trade}|${market}` (demand 0.8-1.5, costs 0.8-1.0).
 * Only real trade and market keys are kept, at most MAX_BASE; the scan is bounded. Keyed on the raw
 * stored object, because the writer always stores a new one. One shared frozen `{}` when empty. Pure.
 */
export function readTechBase(g: Pick<GameState, 'flags'>): Readonly<Record<string, TechBase>> {
  const raw = g.flags ? g.flags[BASE_KEY] : undefined
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return EMPTY_BASE
  const hit = baseReads.get(raw)
  if (hit) return hit
  const out: Record<string, TechBase> = {}
  let scanned = 0, kept = 0
  for (const key in raw) {
    if (++scanned > MAX_BASE_SCAN || kept >= MAX_BASE) break
    if (!Object.hasOwn(raw, key)) continue
    const bar = key.indexOf('|')
    const trade = bar < 0 ? '' : key.slice(0, bar)
    const market = bar < 0 ? '' : key.slice(bar + 1)
    if (!isTrade(trade) || (market !== 'world' && !COUNTRY_IDS.has(market))) continue
    const v = (raw as Record<string, Json>)[key]
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue
    const d = v.demand, c = v.costs
    if (typeof d !== 'number' || typeof c !== 'number' || !Number.isFinite(d) || !Number.isFinite(c)) continue
    out[key] = Object.freeze({ demand: clampN(d, 0.8, 1.5), costs: clampN(c, 0.8, 1.0) })
    kept++
  }
  const result = kept ? Object.freeze(out) : EMPTY_BASE
  baseReads.set(raw, result)
  return result
}

export function storedBase(base: Readonly<Record<string, TechBase>>): Json {
  return Object.fromEntries(Object.entries(base).slice(-MAX_BASE).map(([k, v]) => [k, { demand: v.demand, costs: v.costs }]))
}


// ---------------------------------------------------------------------------
// Roles and the reaction formula

/** What a trade is to a kind of wave: core (sells it), supply (suppliers and complements), disrupted (incumbents), or null. */
export function roleOf(kind: WaveKind, trade: string): 'core' | 'supply' | 'disrupted' | null {
  const d: WaveKindDef = WAVE_KINDS[kind]
  if ((d.core as readonly string[]).includes(trade)) return 'core'
  if ((d.supply as readonly string[]).includes(trade)) return 'supply'
  if ((d.disrupted as readonly string[]).includes(trade)) return 'disrupted'
  return null
}

export interface Effect {
  name: string
  demand: number
  costs: number
  value: number
  /** From the static history table (its demand is damped in a world-scope market). */
  hist: boolean
}

/** One wave's factors for a trade, scaled by how far it reaches into the market. */
function oneEffect(role: 'core' | 'supply' | 'disrupted', size: number, hype: number, delivery: number, reach: number, skipDemand: boolean): { demand: number; costs: number; value: number } {
  const r = size * (0.6 * hype + 0.4 * delivery)
  const sd = size * delivery
  let demand: number, costs = 1, value: number
  if (role === 'core') { value = 1 + 0.35 * r; demand = 1 + 0.30 * sd; costs = 1 - 0.10 * sd }
  else if (role === 'supply') { value = 1 + 0.17 * r; demand = 1 + 0.20 * sd }
  else { value = 1 - 0.05 * r - 0.20 * sd; demand = 1 - 0.25 * sd }
  const at = (f: number) => 1 + reach * (f - 1)
  return { demand: skipDemand ? 1 : at(demand), costs: at(costs), value: at(value) }
}

/**
 * The single formula path: one entry per live dynamic wave (from its own year, when the trade has a
 * role in its kind) and, with `withHistory`, per history row live in the market that year. A world
 * wave reaches every market in full; a country wave reaches its own market in full and others at
 * 0.35 + 0.4 x delivery. A heavy wave leaves its record trade's demand alone in its own market,
 * because the heavy pulse already lifts it. Pure.
 */
export function effectsOf(trade: string, market: string, year: number, waves: readonly TechWave[], withHistory = true): Effect[] {
  const out: Effect[] = []
  for (const w of waves) {
    if (year < w.year) continue
    const role = roleOf(w.kind, trade)
    if (!role) continue
    const reach = w.market === 'world' || market === w.market ? 1 : 0.35 + 0.4 * w.delivery
    const f = oneEffect(role, w.size, w.hype, w.delivery, reach, w.skip === trade && market === w.market)
    out.push({ name: w.name, ...f, hist: false })
  }
  if (withHistory) {
    for (const h of historyWaveStates(market, year)) {
      const role = roleOf(h.kind, trade)
      if (!role) continue
      out.push({ name: h.name, ...oneEffect(role, h.size, h.hype, h.delivery, h.reach, false), hist: true })
    }
  }
  return out
}

// A memo per validated list, then per settled-factors object, then per (trade, market, year, scope).
// The validated list is frozen, so its identity implies its content.
const memos = new WeakMap<readonly TechWave[], WeakMap<object, Map<string, MarketFactors>>>()
const MAX_MEMO = 1024

export const noBase = (base: Readonly<Record<string, TechBase>>): boolean => {
  for (const k in base) if (Object.hasOwn(base, k)) return false
  return true
}

/**
 * What the live waves, the history rows and the settled factors do to a trade in a market and year:
 * demand and cost multipliers and a valuation multiple, each clamped to FACTOR_BOUNDS. The factors of
 * several waves multiply, and so do the settled ones (`base`): the entry of this market and the `world` one.
 * `worldMarket`: the trade's market-size curve already carries its booms, so
 * the history rows' demand counts a third (dynamic waves are not damped). Pure; with nothing to apply
 * it returns one shared, frozen neutral.
 */
export function waveFactors(trade: string, market: string, year: number, waves: readonly TechWave[], base: Readonly<Record<string, TechBase>> = EMPTY_BASE, worldMarket = false): MarketFactors {
  const y = Math.round(year)
  if (!Number.isFinite(y)) return NEUTRAL
  if (!waves.length && (y < HIST_FIRST || y > HIST_LAST) && noBase(base)) return NEUTRAL
  let byBase = memos.get(waves)
  if (!byBase) memos.set(waves, (byBase = new WeakMap()))
  let memo = byBase.get(base)
  if (!memo) byBase.set(base, (memo = new Map()))
  const key = `${trade}|${market}|${y}|${worldMarket ? 1 : 0}`
  const hit = memo.get(key)
  if (hit) return hit
  let demand = 1, histDemand = 1, costs = 1, value = 1
  for (const e of effectsOf(trade, market, y, waves)) {
    if (e.hist) histDemand *= e.demand
    else demand *= e.demand
    costs *= e.costs
    value *= e.value
  }
  if (worldMarket) histDemand = 1 + (histDemand - 1) / 3
  demand *= histDemand
  // A settled wave keeps the reach it had: a country wave at its own market, a world wave in every market
  // (a national-scope trade reads a country id, so it must find the `world` entry too), the two stacking at home.
  for (const k of market === 'world' ? [`${trade}|world`] : [`${trade}|${market}`, `${trade}|world`]) {
    const settled = Object.hasOwn(base, k) ? base[k] : undefined
    if (settled) { demand *= settled.demand; costs *= settled.costs }
  }
  const d = clampN(demand, FACTOR_BOUNDS.demand[0], FACTOR_BOUNDS.demand[1])
  const c = clampN(costs, FACTOR_BOUNDS.costs[0], FACTOR_BOUNDS.costs[1])
  const v = clampN(value, FACTOR_BOUNDS.value[0], FACTOR_BOUNDS.value[1])
  const out = d === 1 && c === 1 && v === 1 ? NEUTRAL : Object.freeze({ demand: d, costs: c, value: v })
  if (memo.size > MAX_MEMO) memo.clear()
  memo.set(key, out)
  return out
}

/** waveFactors for a game: the stored waves and the settled factors. A world-scope market reads the history rows at a third of their demand. Pure. */
export function waveFactorsFor(g: Pick<GameState, 'flags'>, trade: string, market: string, year: number): MarketFactors {
  return waveFactors(trade, market, year, readTechWaves(g), readTechBase(g), market === 'world')
}

/**
 * The history table alone (no stored wave, no settled factor): what the real breakthroughs of the
 * years did to a trade in a market. Damped in a world-scope market, as `waveFactorsFor` damps it.
 * `valuationOf` reads it for a company whose year was booked without a stamp. Pure.
 */
export function historyFactors(trade: string, market: string, year: number): MarketFactors {
  return waveFactors(trade, market, year, NONE, undefined, market === 'world')
}
