// Tech waves (docs/superpowers/specs/2026-10-19-tech-waves-design.md, plan decisions D1-D22). When
// something breakthrough-class happens, the company markets that real life would move do move,
// together: demand, costs, valuation, deep-tech VC heat and rivals.
//
// A wave is a record in game flags (`techWaves`, at most 64, replaced and never edited in place) plus
// the static history rows in history/tech-waves.ts. One pure formula (waveFactors) turns both into
// demand, cost and value factors per trade, market and year. Writers call announceWave; the yearly
// step (advanceTechWaves) moves hype toward delivery, so a premium unwinds only when the breakthrough
// did not deliver, never because a year arrived. Nothing here draws on g.rng: draws come from seeded
// streams keyed by the family id, so heirs share them and a Time Machine fork rerolls only the
// unfinished year. Reads never write. The readers validate everything they take from flags.
//
// Import direction: this module does no top-level work that calls into the economy cycle (heavy-rd,
// economy, product-market); every use of those modules is inside a function.
import { seeded } from '../assets'
import { INDUSTRY_IDS, type Industry } from '../data/markets'
import { recordEconomicActivity } from '../economy'
import { FACTOR_BOUNDS, type MarketFactors } from '../history/market-events'
import { HISTORY_WAVES, historyKindActive, historyWaveStates } from '../history/tech-waves'
import { PRESENT_YEAR } from '../history/timeline'
import { outcomeTag } from '../timeMachine'
import type { GameState, Json } from '../types'
import { COUNTRIES } from '../world'
import { marketKey, marketStateOf } from './competition-core'
import { familyId } from './competition-roster'
import { heavyLevel, readHeavy } from './heavy-rd'
import { hashOf } from './product-market'
import { businessAssets, readBiz } from './state'
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
const MAX_ID = 100
const MAX_NAME = 60
const MAX_ORIGIN = 64
/** At most this many waves from the player's side (anything but a rival) are announced in a year. */
const MAX_PER_YEAR = 2

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

export interface WaveInput {
  kind: WaveKind
  source: WaveSource
  /** A stable string for the milestone (see TechWave.origin): it names the wave, so a repeat is the same wave. */
  origin: string
  name: string
  size: number
  market: string
  /** The announcement year when it is not g.year (a heavy launch passes the record's launch year). */
  year?: number
  home?: string
}

const COUNTRY_IDS: ReadonlySet<string> = new Set(COUNTRIES.map((c) => c.id))
const TRADE_IDS: ReadonlySet<string> = new Set(INDUSTRY_IDS)
/** A real trade id. Not `isIndustry`: that is an `in` test, so a saved "constructor" would pass it. */
const isTrade = (x: unknown): x is Industry => typeof x === 'string' && TRADE_IDS.has(x)
const NONE: readonly TechWave[] = Object.freeze([])
const NEUTRAL: MarketFactors = Object.freeze({ demand: 1, costs: 1, value: 1 })
const EMPTY_BASE: Readonly<Record<string, TechBase>> = Object.freeze({})
/** The first and last year any history row has a point in (outside them the table adds nothing). */
const HIST_FIRST = Math.min(...HISTORY_WAVES.map((w) => w.points[0][0]))
const HIST_LAST = Math.max(...HISTORY_WAVES.map((w) => w.points[w.points.length - 1][0]))

// ---------------------------------------------------------------------------
// The records in game flags

/** A stored wave, checked field by field and clamped; null when it is not a usable wave. */
function cleanWave(x: unknown): TechWave | null {
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
function storedWave(w: TechWave): Json {
  return {
    id: w.id, kind: w.kind, name: w.name, source: w.source, year: w.year, market: w.market, size: w.size, hype: w.hype, delivery: w.delivery, last: w.last,
    ...(w.origin ? { origin: w.origin } : {}), ...(w.home ? { home: w.home } : {}), ...(w.skip ? { skip: w.skip } : {}), ...(w.mature ? { mature: w.mature } : {}),
  }
}

/** Always a NEW array of NEW objects: the read cache below is keyed on the array, so nothing is edited in place. */
function writeWaves(g: GameState, list: readonly TechWave[]): void {
  g.flags[WAVES_KEY] = list.slice(-MAX_WAVES).map(storedWave)
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

function storedBase(base: Readonly<Record<string, TechBase>>): Json {
  return Object.fromEntries(Object.entries(base).slice(-MAX_BASE).map(([k, v]) => [k, { demand: v.demand, costs: v.costs }]))
}

/** Always a new object (the read cache is keyed on the stored object). */
function writeBase(g: GameState, base: Readonly<Record<string, TechBase>>): void {
  g.flags[BASE_KEY] = storedBase(base)
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

interface Effect {
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
function effectsOf(trade: string, market: string, year: number, waves: readonly TechWave[], withHistory = true): Effect[] {
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

const noBase = (base: Readonly<Record<string, TechBase>>): boolean => {
  for (const k in base) if (Object.hasOwn(base, k)) return false
  return true
}

/**
 * What the live waves, the history rows and the settled factors do to a trade in a market and year:
 * demand and cost multipliers and a valuation multiple, each clamped to FACTOR_BOUNDS. The factors of
 * several waves multiply. `worldMarket`: the trade's market-size curve already carries its booms, so
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
  const settled = Object.hasOwn(base, `${trade}|${market}`) ? base[`${trade}|${market}`] : undefined
  if (settled) { demand *= settled.demand; costs *= settled.costs }
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

// ---------------------------------------------------------------------------
// Writing a wave

/**
 * Announce a wave. Idempotent: the id comes from the source, kind, year and a hash of the stable
 * origin string, so a second call for the same milestone returns the stored wave and writes nothing
 * (a news id is no guard: the news list keeps only 20). Refuses (null) an unknown kind, a 65th wave,
 * a third non-rival wave in one year, and a heavy, workshop or race wave of a kind a history row
 * already covers that year. Hype starts at 0.3 + 0.7 size, delivery at 0. Draws nothing.
 */
export function announceWave(g: GameState, a: WaveInput): TechWave | null {
  if (!isWaveKind(a.kind)) return null
  const year = Math.round(a.year ?? g.year)
  if (!Number.isFinite(year)) return null
  const id = `${a.source}:${a.kind}:${year}:${hashOf(a.origin).toString(36)}`.slice(0, MAX_ID)
  const list = readTechWaves(g)
  const prior = list.find((w) => w.id === id)
  if (prior) return prior
  if (list.length >= MAX_WAVES) return null
  if (a.source !== 'rival') {
    if (list.filter((w) => w.source !== 'rival' && w.year === year).length >= MAX_PER_YEAR) return null
    if (a.source !== 'deeptech' && historyKindActive(a.kind, year)) return null
  }
  const size = clampN(a.size, 0.05, 1)
  const now = Number.isFinite(g.year) ? Math.round(g.year) : year
  const w = cleanWave({
    id, kind: a.kind, name: a.name, source: a.source, year, market: a.market, size, hype: 0.3 + 0.7 * size, delivery: 0, last: Math.max(year, now),
    origin: a.origin,
    home: a.home ?? (a.market !== 'world' ? a.market : g.character.countryId),
    ...(a.source === 'heavy' ? { skip: a.origin.slice(6, a.origin.indexOf('|')) } : {}),
  })
  if (!w) return null
  writeWaves(g, [...list, w])
  return readTechWaves(g).find((x) => x.id === w.id) ?? null
}

/** Lowercases a leading capital unless the next letter is a capital too, so a wave name reads inside a sentence ('Frontier AI' gives 'frontier AI', 'AI agents' stays). */
export function lowerLead(name: string): string {
  return name.replace(/^[A-Z](?![A-Z])/, (c) => c.toLowerCase())
}

// ---------------------------------------------------------------------------
// Draws (never g.rng)

/**
 * A wave's draws for a year, from the family stream (heirs share it, other families do not) with the
 * Time Machine tag (a fork rerolls only the unfinished year). Always both draws, in this order: `u`,
 * then the stall draw (a 25% chance of a year that adds no delivery and cools hype).
 */
export function waveDraw(g: GameState, id: string, year: number): { u: number; stall: boolean } {
  const s = seeded(`${familyId(g.lifeId)}${outcomeTag(g, year)}|wave|${id}|${year}`)
  return { u: s.next(), stall: s.next() < 0.25 }
}

/** The future-facing kinds each trade is core of (the twelve deep-tech trades): a kind no history row uses. */
const RIVAL_KINDS: ReadonlyMap<string, readonly WaveKind[]> = (() => {
  const used = new Set<string>(HISTORY_WAVES.map((w) => w.kind))
  const out = new Map<string, WaveKind[]>()
  for (const kind of Object.keys(WAVE_KINDS) as WaveKind[]) {
    if (used.has(kind)) continue
    for (const trade of WAVE_KINDS[kind].core as readonly string[]) out.set(trade, [...(out.get(trade) ?? []), kind])
  }
  return out
})()

/**
 * Whether a rival of a family lands a breakthrough in a trade this year: about one year in nine, only
 * for the core trades of future-facing kinds. Draws in a fixed order: landing, kind (taken even for a
 * single kind), size. Pure, no g.rng.
 */
export function rivalWave(fam: string, trade: string, year: number): { kind: WaveKind; size: number } | null {
  const kinds = RIVAL_KINDS.get(trade)
  if (!kinds || !kinds.length) return null
  const s = seeded(`${fam}|tw-rival|${trade}|${year}`)
  if (s.next() >= 1 / 9) return null
  const kind = kinds[Math.floor(s.next() * kinds.length)]
  return { kind, size: 0.2 + 0.4 * s.next() }
}

// ---------------------------------------------------------------------------
// The yearly step

/**
 * One year of a wave: hype closes on the new delivery (at 0.30 when delivery leads, 0.45 when it
 * lags; a stall year cools it a further 15%). `mature` counts years with delivery at least 0.9 and
 * within 0.05 of hype: five settle the wave into the permanent factors; a wave still below 0.1
 * delivery after six years is dropped. Pure.
 */
export function nextState(w: TechWave, delivery: number, stall: boolean, year: number): { hype: number; delivery: number; mature: number; fate: 'live' | 'settle' | 'drop' } {
  const d = clampN(delivery, 0, 1)
  let hype = w.hype + (d - w.hype) * (d > w.hype ? 0.30 : 0.45)
  if (stall) hype *= 0.85
  hype = clampN(hype, 0, 1)
  const mature = d >= 0.9 && Math.abs(d - hype) <= 0.05 ? (w.mature ?? 0) + 1 : 0
  const fate = mature >= 5 ? 'settle' : year - w.year >= 6 && d < 0.1 ? 'drop' : 'live'
  return { hype, delivery: d, mature, fate }
}

/** The part of an origin before its first '#'. */
const originHead = (o: string): string => (o.indexOf('#') < 0 ? o : o.slice(0, o.indexOf('#')))

/**
 * Where the wave's delivery is heading this year, from what really sold, or null when there is nothing
 * to read (the company or the heavy record is gone, or the source has none): then the seeded path runs.
 * Heavy: the record's adoption curve. Deep tech: the originating lab's market share against a quarter.
 */
function deliveryTarget(g: GameState, w: TechWave, year: number): number | null {
  if (!w.origin) return null
  if (w.source === 'heavy') {
    const hash = w.origin.indexOf('#')
    const key = hash < 0 ? '' : w.origin.slice(0, hash)
    const bar = key.indexOf('|')
    if (!key.startsWith('heavy.') || bar < 7) return null
    const family = w.origin.slice(hash + 1)
    const rec = readHeavy(g, key.slice(6, bar), key.slice(bar + 1)).find((r) => r.family === family)
    return rec ? heavyLevel(rec, year).adoption : null
  }
  if (w.source === 'deeptech') {
    const id = originHead(w.origin)
    const a = businessAssets(g).find((x) => x.id === id)
    return a ? clampN((marketStateOf(readBiz(g, a))?.share ?? 0) / 0.25, 0, 1) : null
  }
  return null
}

/**
 * Step every wave once a year, behind the `last` marker (a second call in a year, or a wave that
 * starts later than this year, writes nothing; a gap steps once). Delivery: a company-written wave
 * moves toward what its record or lab has sold, at most 0.25 a year; every other case (workshop, race,
 * rival, or a missing company or record) gains 0.08 + 0.22 u from the seeded draw, or nothing on a
 * stall. A mature wave settles into techBase at its own market with its own factors (never the
 * history rows live that year) and is removed; a dead one is dropped. Writes once, only on a change.
 */
export function advanceTechWaves(g: GameState): void {
  const year = Math.round(g.year)
  const list = readTechWaves(g)
  if (!list.length || !Number.isFinite(year)) return
  const next: TechWave[] = []
  let base: Record<string, TechBase> | null = null
  let changed = false
  for (const w of list) {
    if (w.last === year || year < w.year) { next.push(w); continue }
    changed = true
    const target = deliveryTarget(g, w, year)
    let delivery: number, stall = false
    if (target !== null) delivery = w.delivery + clampN(target - w.delivery, -0.25, 0.25)
    else {
      const d = waveDraw(g, w.id, year)
      stall = d.stall
      delivery = w.delivery + (stall ? 0 : 0.08 + 0.22 * d.u)
    }
    const s = nextState(w, delivery, stall, year)
    if (s.fate === 'drop') continue
    feedEconomy(g, w, s.delivery - w.delivery, year)
    const stepped: TechWave = { ...w, hype: s.hype, delivery: s.delivery, last: year }
    if (s.mature > 0) stepped.mature = s.mature
    else delete stepped.mature
    if (s.fate === 'live') { next.push(stepped); continue }
    // Settled: the wave's own demand and cost factors become permanent at its own market.
    base ??= { ...readTechBase(g) }
    for (const kind of ['core', 'supply', 'disrupted'] as const) {
      for (const trade of WAVE_KINDS[stepped.kind][kind] as readonly string[]) {
        const e = effectsOf(trade, stepped.market, year, [stepped], false)[0]
        if (!e || (e.demand === 1 && e.costs === 1)) continue
        const k = `${trade}|${stepped.market}`
        const old = Object.hasOwn(base, k) ? base[k] : undefined
        base[k] = { demand: clampN((old?.demand ?? 1) * e.demand, 0.8, 1.5), costs: clampN((old?.costs ?? 1) * e.costs, 0.8, 1.0) }
      }
    }
  }
  if (!changed) return
  writeWaves(g, next)
  if (base) writeBase(g, base)
}

/**
 * The national economy hears about a breakthrough as it is delivered (D17): a small `innovation` amount
 * for the wave's core trade in its home country, scaled by size and the year's delivery gain. Never
 * 'world' (not a country, so the call would drop it), never for workshop or race waves (the Workshop
 * already feeds innovation), at most 0.3 a call; one receipt per wave and year makes a second call a no-op.
 */
function feedEconomy(g: GameState, w: TechWave, gain: number, year: number): void {
  if (w.source === 'workshop' || w.source === 'race' || !(gain > 0)) return
  const country = w.home ?? (w.market !== 'world' ? w.market : undefined)
  if (!country) return
  recordEconomicActivity(g, `wave:${w.id}:${year}`, country, WAVE_KINDS[w.kind].core[0], { innovation: Math.min(0.3, 0.1 * w.size * gain) })
}

/** Distinct (trade, market) pairs of the player's companies looked at for a rival landing in one year. */
const MAX_LANDING_PAIRS = 24
/** A trade a live wave already cores is left alone for this many years. */
const LANDING_GAP = 3

/**
 * The yearly hook: for each trade and market the player has a company in, a rival may land a
 * breakthrough this year (`rivalWave`, a seeded draw keyed by the family id and the Time Machine tag).
 * Only for years after the present one, so the real history is never invented over; none within three
 * years of a wave that already cores the trade; a life with no company writes nothing. The wave is
 * announced through `announceWave`, so a repeat in the same year is the stored wave.
 */
export function landRivalWaves(g: GameState): void {
  const year = Math.round(g.year)
  if (!Number.isFinite(year) || year <= PRESENT_YEAR) return
  const assets = businessAssets(g)
  if (!assets.length) return
  const fam = `${familyId(g.lifeId)}${outcomeTag(g, year)}`
  const seen = new Set<string>()
  for (const a of assets) {
    if (seen.size >= MAX_LANDING_PAIRS) break
    const b = readBiz(g, a)
    const market = marketKey(b)
    const pair = `${b.industry}|${market}`
    if (seen.has(pair)) continue
    seen.add(pair)
    if (readTechWaves(g).some((w) => w.year >= year - LANDING_GAP && (WAVE_KINDS[w.kind].core as readonly string[]).includes(b.industry))) continue
    const landed = rivalWave(fam, b.industry, year)
    if (!landed) continue
    announceWave(g, { kind: landed.kind, source: 'rival', origin: pair, name: WAVE_KINDS[landed.kind].label, size: landed.size, market, home: b.countryId, year })
  }
}

/**
 * The tech-wave state of the world that a new generation keeps: the live waves and the settled
 * factors, each through its validating reader and in its stored shape. An empty part is omitted.
 * Never 'market.news': the Heavy R&D carry already hands that over. Pure.
 */
export function waveWorldFlags(g: Pick<GameState, 'flags'>): Record<string, Json> {
  const out: Record<string, Json> = {}
  const waves = readTechWaves(g)
  if (waves.length) out[WAVES_KEY] = waves.map(storedWave)
  const base = readTechBase(g)
  if (!noBase(base)) out[BASE_KEY] = storedBase(base)
  return out
}
