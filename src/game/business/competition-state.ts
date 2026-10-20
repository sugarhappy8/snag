// Plain-JSON state of a company's market position, kept in BizState.market (Asset.details.market):
// last year's share of its market (world or home country), the rivals' shares, the installed
// base that network effects feed on, a few years of history, and what events and moves changed
// (rivals bought or boosted, newcomers drawn in, antitrust cases). Missing or damaged data reads
// as a company that just entered its market, so old saves keep working.
import type { Json } from '../types'
import { clampN, num, rec, str } from './util'

export const MARKET_VERSION = 1

/** Wave fast followers remembered (three per wave: room for 32 live waves in one market). */
export const MAX_WAVE_FOUNDED = 96

/** Rival shares kept on the state: the booking keeps the 40 biggest (competition.ts refreshMarket). */
export const MAX_RIVAL_SHARES = 40

/** Rival modifiers kept. A move or event only ever targets a rival on the table, so no more than the shares. */
export const MAX_RIVAL_MODS = 40

/** A rival drawn in by the player's own success or an event (the generated roster lives in competition-roster.ts). */
export interface ExtraRival {
  id: string
  name: string
  hq: string
  founded: number
  /** Relative pull at maturity (1 = a solid reference competitor). */
  pot: number
  /** Years to reach full strength. */
  ramp: number
  /** Why it exists: 'entrant' (lured by margins), 'spinoff' (antitrust break-up). */
  origin: 'entrant' | 'spinoff'
}

/** A temporary change to one rival's pull (a scandal, a talent raid, a price war). */
export interface RivalMod {
  mult: number
  until: number
}

export interface MarketHistory {
  year: number
  /** Share of units sold in the market (0-1). */
  share: number
  rank: number
  /** Market size that year in dollars. */
  size: number
  /** The biggest rival's share that year (absent in old saves). */
  lead?: number
  /** HHI-style concentration of the named field that year, 0-10000 (absent in old saves). */
  hhi?: number
  /**
   * The biggest rivals that year as one flat list, [id, share, id, share, ...] (at most TOP_RIVALS pairs, biggest first;
   * absent before R1). Flat keeps a row at 17 values; topPairs() decodes it.
   */
  top?: (string | number)[]
}

/** Rivals a history row remembers by name. */
export const TOP_RIVALS = 8
const TOP_ID_MAX = 60

/** A share as the history keeps it: held to 0 to 1 and rounded to 1e-6. */
function topShare(n: number): number {
  return Math.round(clampN(n, 0, 1) * 1e6) / 1e6
}

/**
 * The flat `top` of a booked year from its sorted [id, share] list: the first TOP_RIVALS whose share is above 0 and whose id
 * the reader will accept. Undefined when nothing is left (the key is then left out of the row).
 */
export function flatTop(rivals: readonly (readonly [string, number])[]): (string | number)[] | undefined {
  const out: (string | number)[] = []
  for (const [id, share] of rivals.slice(0, TOP_RIVALS)) {
    const s = topShare(share)
    if (s > 0 && id.length > 0 && id.length <= TOP_ID_MAX) out.push(id, s)
  }
  return out.length ? out : undefined
}

/** A stored `top`, or nothing. Strict about the list (even length, at most 2 x TOP_RIVALS, string ids, finite shares), then each entry is held to 0 to 1; a share of 0 or less and a repeated id are left out. */
function readTop(v: Json | undefined): (string | number)[] | undefined {
  if (!Array.isArray(v) || v.length % 2 !== 0 || v.length > TOP_RIVALS * 2) return undefined
  for (let i = 0; i < v.length; i += 2) {
    const id = v[i], share = v[i + 1]
    if (typeof id !== 'string' || id.length === 0 || id.length > TOP_ID_MAX || typeof share !== 'number' || !Number.isFinite(share)) return undefined
  }
  const seen = new Set<string>()
  const out: (string | number)[] = []
  for (let i = 0; i < v.length; i += 2) {
    const id = v[i] as string, share = topShare(v[i + 1] as number)
    if (share <= 0 || seen.has(id)) continue
    seen.add(id)
    out.push(id, share)
  }
  return out.length ? out : undefined
}

/** The [id, share] pairs of a history row's `top` (none for a row without one). */
export function topPairs(h: { top?: readonly (string | number)[] }): [string, number][] {
  const t = h.top
  if (!Array.isArray(t)) return []
  const out: [string, number][] = []
  for (let i = 0; i + 1 < t.length; i += 2) {
    const id = t[i], share = t[i + 1]
    if (typeof id === 'string' && typeof share === 'number') out.push([id, share])
  }
  return out
}

export interface AntitrustState {
  /** Year of the last case (0 = never). */
  last: number
  cases: number
  /** Fines paid so far (dollars). */
  fined: number
  /** Price promises imposed by a settlement run until this year (inclusive). */
  remedyUntil: number
  /** Regulators were lobbied: risk is lower until this year. */
  lobbyUntil: number
}

/** How a company serves a foreign country: sells from home, with a local partner, or through its own subsidiary. */
export type EntryMode = 'export' | 'jv' | 'sub'

/** A foreign market the company entered through the Market & Competition screen (a term of years). */
export interface MarketEntry {
  /** The foreign country. */
  country: string
  /** The company's home country when it entered (tariffs depend on the pair). */
  home: string
  mode: EntryMode
  /** Year it set up. */
  year: number
  /** Last year of the term; the presence fades over two more years. */
  until: number
}

/** A regional brand campaign: a push to win one country's customers (a term of years). */
export interface MarketCampaign {
  country: string
  /** The company's home country when it ran the campaign. */
  home: string
  year: number
  until: number
}

/** A patent cross-licence with a rival (deep tech): both sides get better, antitrust watches. */
export interface MarketDeal {
  rivalId: string
  year: number
  until: number
}

export interface MarketState {
  v: number
  /** Bumped on every change (menus and the planner cache on it). */
  rev: number
  /** 'world' or the home country id. */
  key: string
  /** Fiscal year the shares below are for (0 = never booked). */
  year: number
  /** The player's share of units sold that year. */
  share: number
  /** Installed base (smoothed share) that network effects feed on. */
  base: number
  /** Share of customers who wanted the product but were turned away (capacity) last year. */
  unmet: number
  rank: number
  /** Market size that year in dollars. */
  size: number
  /** Rivals' shares that year: [rival id, share]. */
  rivals: [string, number][]
  history: MarketHistory[]
  /** Temporary multiplier on the player's pull from events and moves, and the last year it applies. */
  edge: number
  edgeUntil: number
  mods: Record<string, RivalMod>
  /** Rivals the player bought out (they leave the market). */
  gone: string[]
  extra: ExtraRival[]
  /**
   * Ids of the tech-wave fast followers ever founded here (business/tech-waves.ts entrantsDue). `extra` keeps
   * only 12, so a follower pushed off it by newer rivals would be offered, and founded, again: this list
   * remembers it (bounded; absent in old saves, where `extra` and `gone` still guard).
   */
  waveFounded?: string[]
  antitrust: AntitrustState
  /** Last year a competitive move was made (talent raid, price offensive...). */
  lastMove: number
  /** Foreign countries entered (export / partner / subsidiary), regional campaigns and licence deals. */
  entries: MarketEntry[]
  campaigns: MarketCampaign[]
  deals: MarketDeal[]
  /** Supply chains diversified through this year (0 = no). */
  supplyUntil: number
  /** Home-market defence in force through this year (0 = no). */
  defendUntil: number
  /** Years the company bought out a rival (antitrust watches the pattern). */
  acquired: number[]
  /** Extra tariffs and sanctions on its goods by country from governments' measures (nation/), stamped yearly. */
  barriers?: Record<string, number>
}

function readExtra(v: Json): ExtraRival | null {
  const o = rec(v)
  if (!o) return null
  const id = str(o.id)
  const name = str(o.name)
  if (!id || !name) return null
  return {
    id,
    name,
    hq: str(o.hq, 'us'),
    founded: Math.round(num(o.founded)),
    pot: clampN(num(o.pot, 1), 0.05, 40),
    ramp: Math.round(clampN(num(o.ramp, 4), 1, 15)),
    origin: o.origin === 'spinoff' ? 'spinoff' : 'entrant',
  }
}

function readHistory(v: Json): MarketHistory | null {
  const o = rec(v)
  if (!o || typeof o.year !== 'number' || !Number.isFinite(o.year)) return null
  const h: MarketHistory = { year: Math.round(o.year), share: clampN(num(o.share), 0, 1), rank: Math.max(1, Math.round(num(o.rank, 1))), size: Math.max(0, num(o.size)) }
  if (typeof o.lead === 'number' && Number.isFinite(o.lead)) h.lead = clampN(o.lead, 0, 1)
  if (typeof o.hhi === 'number' && Number.isFinite(o.hhi)) h.hhi = clampN(o.hhi, 0, 10_000)
  const top = readTop(o.top)
  if (top) h.top = top
  return h
}

export function emptyMarket(key: string): MarketState {
  return {
    v: MARKET_VERSION,
    rev: 0,
    key,
    year: 0,
    share: 0,
    base: 0,
    unmet: 0,
    rank: 0,
    size: 0,
    rivals: [],
    history: [],
    edge: 1,
    edgeUntil: 0,
    mods: {},
    gone: [],
    extra: [],
    antitrust: { last: 0, cases: 0, fined: 0, remedyUntil: 0, lobbyUntil: 0 },
    lastMove: 0,
    entries: [],
    campaigns: [],
    deals: [],
    supplyUntil: 0,
    defendUntil: 0,
    acquired: [],
  }
}

const MODES: readonly EntryMode[] = ['export', 'jv', 'sub']

function readEntry(v: Json): MarketEntry | null {
  const o = rec(v)
  if (!o) return null
  const country = str(o.country)
  const mode = MODES.find((m) => m === o.mode)
  if (!/^[a-z]{2}$/.test(country) || !mode) return null
  const year = Math.round(num(o.year))
  return { country, home: /^[a-z]{2}$/.test(str(o.home)) ? str(o.home) : 'us', mode, year, until: Math.max(year, Math.round(num(o.until, year))) }
}

function readCampaign(v: Json): MarketCampaign | null {
  const o = rec(v)
  if (!o) return null
  const country = str(o.country)
  if (!/^[a-z]{2}$/.test(country)) return null
  const year = Math.round(num(o.year))
  return { country, home: /^[a-z]{2}$/.test(str(o.home)) ? str(o.home) : country, year, until: Math.max(year, Math.round(num(o.until, year))) }
}

function readDeal(v: Json): MarketDeal | null {
  const o = rec(v)
  const rivalId = o ? str(o.rivalId) : ''
  if (!o || !rivalId) return null
  const year = Math.round(num(o.year))
  return { rivalId, year, until: Math.max(year, Math.round(num(o.until, year))) }
}

/** Plain code-unit order, the same on every machine (localeCompare is not). */
function byId(x: string, y: string): number {
  return x < y ? -1 : x > y ? 1 : 0
}

function uniqueLast<T>(rows: T[], key: (row: T) => string): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (let i = rows.length - 1; i >= 0; i--) {
    const k = key(rows[i])
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(rows[i])
  }
  return out.reverse()
}

/** A complete, sane MarketState from whatever is stored (null when there is nothing usable). */
export function readMarket(v: Json | undefined, key: string): MarketState | null {
  const o = rec(v)
  if (!o) return null
  // A company that moved its home market (it can't, today) starts that market fresh.
  if (str(o.key) && str(o.key) !== key) return null
  let rivals: [string, number][] = []
  if (Array.isArray(o.rivals)) {
    for (const x of o.rivals) {
      if (!Array.isArray(x) || typeof x[0] !== 'string') continue
      const s = num(x[1] as Json)
      if (s > 0) rivals.push([x[0], clampN(s, 0, 1)])
    }
  }
  rivals = uniqueLast(rivals, x => x[0])
  // The booking keeps the biggest 40; a record with more is damaged, so keep the same 40 (ties by id).
  if (rivals.length > MAX_RIVAL_SHARES) rivals = [...rivals].sort((x, y) => y[1] - x[1] || byId(x[0], y[0])).slice(0, MAX_RIVAL_SHARES)
  let mods: Record<string, RivalMod> = {}
  const m = rec(o.mods)
  if (m) {
    for (const [id, x] of Object.entries(m)) {
      const r = rec(x)
      if (id && r) mods[id] = { mult: clampN(num(r.mult, 1), 0.1, 5), until: Math.round(num(r.until)) }
    }
  }
  // Honest play holds a couple of two-year modifiers; a record with more keeps the longest running (ties by id).
  if (Object.keys(mods).length > MAX_RIVAL_MODS) {
    const keep = Object.keys(mods).sort((x, y) => mods[y].until - mods[x].until || byId(x, y)).slice(0, MAX_RIVAL_MODS)
    mods = Object.fromEntries(keep.map(id => [id, mods[id]]))
  }
  const at = rec(o.antitrust)
  const history: MarketHistory[] = []
  if (Array.isArray(o.history)) for (const x of o.history) {
    const h = readHistory(x)
    if (h) history.push(h)
  }
  const extra: ExtraRival[] = []
  if (Array.isArray(o.extra)) for (const x of o.extra) {
    const e = readExtra(x)
    if (e) extra.push(e)
  }
  return {
    v: MARKET_VERSION,
    rev: Math.max(0, Math.round(num(o.rev))),
    key,
    year: Math.round(num(o.year)),
    share: clampN(num(o.share), 0, 1),
    base: clampN(num(o.base), 0, 1),
    unmet: clampN(num(o.unmet), 0, 1),
    rank: Math.max(0, Math.round(num(o.rank))),
    size: Math.max(0, num(o.size)),
    rivals,
    history: uniqueLast(history, x => String(x.year)).slice(-20),
    edge: clampN(num(o.edge, 1), 0.3, 3),
    edgeUntil: Math.round(num(o.edgeUntil)),
    mods,
    gone: Array.isArray(o.gone) ? [...new Set(o.gone.filter((x): x is string => typeof x === 'string' && !!x))].slice(-60) : [],
    extra: uniqueLast(extra, x => x.id).slice(-12),
    antitrust: {
      last: Math.round(num(at?.last)),
      cases: Math.max(0, Math.round(num(at?.cases))),
      fined: Math.max(0, num(at?.fined)),
      remedyUntil: Math.round(num(at?.remedyUntil)),
      lobbyUntil: Math.round(num(at?.lobbyUntil)),
    },
    lastMove: Math.round(num(o.lastMove)),
    entries: uniqueLast(readList(o.entries, readEntry), x => x.country).slice(-24),
    campaigns: uniqueLast(readList(o.campaigns, readCampaign), x => x.country).slice(-12),
    deals: uniqueLast(readList(o.deals, readDeal), x => x.rivalId).slice(-6),
    supplyUntil: Math.round(num(o.supplyUntil)),
    defendUntil: Math.round(num(o.defendUntil)),
    acquired: Array.isArray(o.acquired) ? o.acquired.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)).map(Math.round).slice(-20) : [],
    ...readBarriers(o.barriers),
    ...readWaveFounded(o.waveFounded),
  }
}

function readWaveFounded(v: Json | undefined): { waveFounded?: string[] } {
  if (!Array.isArray(v)) return {}
  const ids = [...new Set(v.filter((x): x is string => typeof x === 'string' && !!x))].slice(-MAX_WAVE_FOUNDED)
  return ids.length ? { waveFounded: ids } : {}
}

function readBarriers(v: Json | undefined): { barriers?: Record<string, number> } {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  const out: Record<string, number> = {}
  for (const [k, n] of Object.entries(v).slice(0, 60)) if (/^[a-z]{2}$/.test(k) && typeof n === 'number' && Number.isFinite(n) && n > 0) out[k] = Math.min(.9, Math.round(n * 1e4) / 1e4)
  return Object.keys(out).length ? { barriers: out } : {}
}

function readList<T>(v: Json | undefined, read: (x: Json) => T | null): T[] {
  const out: T[] = []
  if (Array.isArray(v)) for (const x of v) {
    const r = read(x)
    if (r) out.push(r)
  }
  return out
}
