// The market model behind every company's demand: who it competes with this year and how many
// customers that leaves it. Pure (no game state is written, no RNG): economy.planFor,
// deeptech-core.techPlan and the game-studio sim all call it, so the yearly simulation, the
// Annual Report, the Business talent's planner and the menus agree on the same numbers.
//
// The model in one breath: the market (the world for tradable industries, the home country for
// local trades) has a potential size that follows its era curve (competition-data sizeRatio).
// Customers choose between the player, the rivals (their combined pull F follows the market's size
// and how far the field has filled in) and buying nothing. The player's pull is its bottom-up
// demand (outlets, stage, quality, price... from the existing model) relative to a reference
// competitor, times its network effects (big installed base → bigger pull) and event edge.
// Calibrated so that a company in a crowded PRESENT_YEAR market sells what it always did (the
// factor is ~1), while an early mover in an exploding market can grow into it and dominate.
import type { Json } from '../types'
import { PRESENT_YEAR } from '../history/timeline'
import { readMarket, type ExtraRival, type MarketState } from './competition-state'
import { marketDef, OUTSIDE, sizeRatio, type MarketDef } from './competition-data'
import { activeRivals, baselineShares, familyId, maturity, networkPull, rawPull, RIVAL_NETWORK, rosterFill, rosterOf, legacyFade, type Rival } from './competition-roster'

/** How much a dominant company saves on unit costs (scale, bargaining power), at full dominance. */
export const SCALE_SAVING = 0.1
/** How much more a dominant company in a national market can charge (customers have few options). */
export const PRICE_POWER = 0.12

export interface FieldRival {
  id: string
  name: string
  hq: string
  founded: number
  quality: number
  tech: number
  legacy: boolean
  /** Absolute pull this year (reference competitors). */
  pull: number
  /** Last year's share of the whole market. */
  prev: number
  /** Drawn in by the player's success or split off by antitrust. */
  extra?: ExtraRival['origin']
}

export interface MarketCtx {
  def: MarketDef
  industry: string
  /** 'world' or the home country id. */
  key: string
  year: number
  /** Market size vs PRESENT_YEAR. */
  size: number
  /** Rivals' combined pull in reference competitors. */
  F: number
  /** Units a reference competitor sells (the scale everything is measured in). */
  dRef: number
  /** Potential market in units (what customers would buy if every product were good). */
  pot: number
  /** The player's network pull from its installed base. */
  w: number
  /** Event / move multiplier on the player's pull. */
  edge: number
  /** The player's installed base (smoothed share last year). */
  base: number
  /** 0-1: how dominant the player is (drives scale savings and pricing power). */
  dominance: number
  rivals: FieldRival[]
  /** Pull of the long tail of small competitors. */
  fringe: number
}

export interface MarketPick {
  /** Units customers want from the player (before the business cycle). */
  units: number
  /** The player's share of buyers. */
  share: number
  /** Share of potential customers who buy from anyone at all. */
  take: number
  /** units / bottom-up units: what competition did to the old demand model. */
  factor: number
}

/** Dominance 0-1 from an installed base (nothing below 15%, full at 60%). */
export function dominanceFrom(base: number): number {
  return Math.max(0, Math.min(1, (base - 0.15) / 0.45))
}

/** The home market key of a company: 'world' for tradable industries, else its home country. */
export function marketKey(b: { industry: string; countryId: string }): string {
  return marketDef(b.industry).scope === 'world' ? 'world' : b.countryId
}

/** Parsed market states by stored object (saveMarket always stores a new object, so no stale reads). */
const stateCache = new WeakMap<object, { key: string; st: MarketState | null }>()

/**
 * A company's stored market state, READ-ONLY: it is shared with every other read of the same
 * stored data (the planner reads it on every what-if). Null for a company that never booked a
 * year in its market. To change it, take a copy with freshMarketState and save it back.
 */
export function marketStateOf(b: { industry: string; countryId: string; market?: Json }): MarketState | null {
  const raw = b.market
  const key = marketKey(b)
  if (!raw || typeof raw !== 'object') return readMarket(raw, key)
  const hit = stateCache.get(raw)
  if (hit && hit.key === key) return hit.st
  const st = readMarket(raw, key)
  stateCache.set(raw, { key, st })
  return st
}

/** A private, mutable copy of the stored market state (null when there is none). */
export function freshMarketState(b: { industry: string; countryId: string; market?: Json }): MarketState | null {
  return readMarket(b.market, marketKey(b))
}

/** Dominance of a company from its stored state (0 when it has none). Pure, no game state needed. */
export function dominanceOf(b: { industry: string; countryId: string; market?: Json }): number {
  const st = marketStateOf(b)
  return st ? dominanceFrom(st.base) : 0
}

const ctxCache = new Map<string, MarketCtx>()

/**
 * The competitive situation of a company's market in `year`. `dRef` and `fieldP` come from
 * economy.ts (the reference competitor's units, and the rivals' pull at PRESENT_YEAR).
 */
export function buildCtx(lifeId: string, industry: string, key: string, year: number, state: MarketState | null, dRef: number, fieldP: number): MarketCtx {
  const fam = familyId(lifeId)
  // Cloned saves and alternative plans can share a revision while holding different rivals,
  // remedies or first-mover edges. Cache all inputs, never just the revision counter.
  const cacheKey = `${fam}|${industry}|${key}|${year}|${state ? JSON.stringify(state) : '-'}|${dRef}|${fieldP}`
  const hit = ctxCache.get(cacheKey)
  if (hit) return hit
  const d = marketDef(industry)
  const size = sizeRatio(industry, year)
  const roster = rosterOf(fam, industry, key)
  const fresh = !!state && state.year >= year - 1 && state.year > 0
  const gone = new Set(state?.gone ?? [])

  // Last year's shares: the stored ones once the company has traded here, the market without the
  // player before that.
  const prev = new Map<string, number>()
  if (fresh && state) for (const [id, s] of state.rivals) prev.set(id, s)
  else for (const [id, s] of baselineShares(fam, industry, key, year - 1)) prev.set(id, s)

  // Named rivals this year and how strongly each pulls customers.
  const active: { r: Rival | ExtraRival; raw: number; extra?: ExtraRival['origin'] }[] = []
  for (const r of activeRivals(roster, year)) if (!gone.has(r.id)) active.push({ r, raw: rawPull(d, r, year) })
  for (const x of state?.extra ?? []) {
    if (gone.has(x.id) || year < x.founded) continue
    active.push({ r: x, raw: x.pot * maturity({ founded: x.founded, exit: 99_999, ramp: x.ramp }, year), extra: x.origin })
  }
  const modOf = (id: string) => {
    const m = state?.mods[id]
    return m && m.until >= year ? m.mult : 1
  }
  let named = 0
  let legacy = 0
  for (const x of active) {
    const isLegacy = 'legacy' in x.r && x.r.legacy
    if (isLegacy) legacy += x.raw * modOf(x.r.id)
    else named += x.raw * modOf(x.r.id)
  }
  // How full the field is: rivals founded and grown up vs today (mature trades churn around 1).
  const rawFill = named / Math.max(0.01, roster.presentPull)
  const namedFill = d.emerging ? rawFill : 1 + (rawFill - 1) * 0.3
  const fringeFill = d.emerging ? Math.sqrt(Math.min(1, rosterFill(roster, year))) : 1
  // State-backed incumbents pull customers on their own (they don't scale with the market); the
  // ordinary field is the rest of today's crowd, so a company in today's market sees fieldP.
  const legacyNow = d.legacy ? d.legacy.pull * legacyFade(d, PRESENT_YEAR) : 0
  // The field shrinks more slowly than the market in a bust (firms take years to fold), so a crash
  // like the dot-com bust or 1983's video-game crash bites every company in it.
  const lagged = Math.max(size, 0.9 * sizeRatio(industry, year - 1), 0.8 * sizeRatio(industry, year - 2), 0.7 * sizeRatio(industry, year - 3))
  const scale = Math.max(0.1 * fieldP, fieldP - legacyNow) * lagged
  const fringe = Math.max(0, scale * d.fringe * fringeFill)
  const namedPull = Math.max(0, scale * (1 - d.fringe) * Math.max(0, namedFill)) + legacy
  const F = Math.max(0.02, fringe + namedPull)

  // Split the named rivals' pull by their own strength and network effects.
  const weights = active.map((x) => x.raw * modOf(x.r.id) * networkPull(prev.get(x.r.id) ?? 0, d.network * RIVAL_NETWORK))
  const wsum = weights.reduce((t, v) => t + v, 0)
  const rivals: FieldRival[] = active.map((x, i) => ({
    id: x.r.id,
    name: x.r.name,
    hq: x.r.hq,
    founded: x.r.founded,
    quality: 'quality' in x.r ? x.r.quality : Math.round(45 + 10 * Math.log2(1 + x.r.pot)),
    tech: 'tech' in x.r ? x.r.tech : Math.round(40 + 12 * Math.log2(1 + x.r.pot)),
    legacy: 'legacy' in x.r ? x.r.legacy : false,
    pull: wsum > 0 ? (namedPull * weights[i]) / wsum : 0,
    prev: prev.get(x.r.id) ?? 0,
    ...(x.extra ? { extra: x.extra } : {}),
  }))

  const base = fresh && state ? state.base : 0
  const edge = state && state.edgeUntil >= year ? state.edge : 1
  const ctx: MarketCtx = {
    def: d,
    industry,
    key,
    year,
    size,
    F,
    dRef: Math.max(1e-6, dRef),
    pot: Math.max(0, dRef * (1 + fieldP + OUTSIDE) * size),
    w: networkPull(base, d.network),
    edge,
    base,
    dominance: dominanceFrom(base),
    rivals,
    fringe,
  }
  ctxCache.set(cacheKey, ctx)
  if (ctxCache.size > 256) {
    const first = ctxCache.keys().next().value
    if (first !== undefined) ctxCache.delete(first)
  }
  return ctx
}

/**
 * Customers the player gets from `bu` bottom-up units (what the old demand model would sell):
 * a reference company in a crowded market keeps about `bu`; an early mover in a small market is
 * capped by the market; a dominant one keeps customers even at higher prices.
 */
export function marketDemand(ctx: MarketCtx, bu: number): MarketPick {
  if (!(bu > 0) || !(ctx.pot > 0)) return { units: 0, share: 0, take: 0, factor: bu > 0 ? 0 : 1 }
  const qe = (bu / ctx.dRef) * ctx.edge
  const take = (qe + ctx.F) / (qe + ctx.F + OUTSIDE)
  const share = (qe * ctx.w) / (qe * ctx.w + ctx.F)
  const units = ctx.pot * take * share
  if (!Number.isFinite(units)) return { units: bu, share: 0, take: 1, factor: 1 }
  return { units, share, take, factor: units / bu }
}
