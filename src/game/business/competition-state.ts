// Plain-JSON state of a company's market position, kept in BizState.market (Asset.details.market):
// last year's share of its market (world or home country), the rivals' shares, the installed
// base that network effects feed on, a few years of history, and what events and moves changed
// (rivals bought or boosted, newcomers drawn in, antitrust cases). Missing or damaged data reads
// as a company that just entered its market, so old saves keep working.
import type { Json } from '../types'
import { clampN, num, rec, str } from './util'

export const MARKET_VERSION = 1

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
  antitrust: AntitrustState
  /** Last year a competitive move was made (talent raid, price offensive...). */
  lastMove: number
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
    founded: num(o.founded),
    pot: clampN(num(o.pot, 1), 0.05, 40),
    ramp: clampN(num(o.ramp, 4), 1, 15),
    origin: o.origin === 'spinoff' ? 'spinoff' : 'entrant',
  }
}

function readHistory(v: Json): MarketHistory | null {
  const o = rec(v)
  if (!o || typeof o.year !== 'number') return null
  return { year: o.year, share: clampN(num(o.share), 0, 1), rank: Math.max(1, Math.round(num(o.rank, 1))), size: Math.max(0, num(o.size)) }
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
  }
}

/** A complete, sane MarketState from whatever is stored (null when there is nothing usable). */
export function readMarket(v: Json | undefined, key: string): MarketState | null {
  const o = rec(v)
  if (!o) return null
  // A company that moved its home market (it can't, today) starts that market fresh.
  if (str(o.key) && str(o.key) !== key) return null
  const rivals: [string, number][] = []
  if (Array.isArray(o.rivals)) {
    for (const x of o.rivals) {
      if (!Array.isArray(x) || typeof x[0] !== 'string') continue
      const s = num(x[1] as Json)
      if (s > 0) rivals.push([x[0], clampN(s, 0, 1)])
    }
  }
  const mods: Record<string, RivalMod> = {}
  const m = rec(o.mods)
  if (m) {
    for (const [id, x] of Object.entries(m)) {
      const r = rec(x)
      if (r) mods[id] = { mult: clampN(num(r.mult, 1), 0.1, 5), until: num(r.until) }
    }
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
    year: num(o.year),
    share: clampN(num(o.share), 0, 1),
    base: clampN(num(o.base), 0, 1),
    unmet: clampN(num(o.unmet), 0, 1),
    rank: Math.max(0, Math.round(num(o.rank))),
    size: Math.max(0, num(o.size)),
    rivals,
    history: history.slice(-15),
    edge: clampN(num(o.edge, 1), 0.3, 3),
    edgeUntil: num(o.edgeUntil),
    mods,
    gone: Array.isArray(o.gone) ? o.gone.filter((x): x is string => typeof x === 'string').slice(-60) : [],
    extra: extra.slice(-12),
    antitrust: {
      last: num(at?.last),
      cases: Math.max(0, Math.round(num(at?.cases))),
      fined: Math.max(0, num(at?.fined)),
      remedyUntil: num(at?.remedyUntil),
      lobbyUntil: num(at?.lobbyUntil),
    },
    lastMove: num(o.lastMove),
  }
}
