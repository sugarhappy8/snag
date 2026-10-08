// How far a company's pull reaches beyond what its outlets already sell: the countries it entered
// (export, joint venture, subsidiary), the regional brand campaigns it ran and the home-market
// defence it keeps up. The result is ONE multiplier on the company's pull, `reachOf`, that
// competition-core folds into the existing share model's `edge` - so every move on the Market &
// Competition screen flows through the same share model as everything else, with a term (it
// fades and has to be renewed), tariffs and other barriers that eat into it, and sharply
// diminishing returns: a 45% ceiling however many countries you enter. Pure: no RNG, no state.
import { industryDemand, marketOf, type Industry } from '../data/markets'
import { COUNTRIES } from '../world'
import { marketDef } from './competition-data'
import type { EntryMode, MarketCampaign, MarketEntry, MarketState } from './competition-state'
import { goodsShare, otherBarriers, tariffOn } from './market-trade'

/** The most the reach of a company can add to its pull, however many countries it enters. */
export const REACH_CAP = 0.45
/** How fast the first countries use it up (higher = saturates sooner). */
export const REACH_K = 3

/** What share of a country's customers each way of entering wins at full strength. */
export const MODE_EFF: Record<EntryMode, number> = { export: 0.45, jv: 0.75, sub: 1 }
/** Years each way of entering lasts before it has to be renewed. */
export const MODE_TERM: Record<EntryMode, number> = { export: 4, jv: 8, sub: 15 }
/** How much of a tariff each mode eats (a subsidiary builds locally; exports pay it in full). */
const TARIFF_DRAG: Record<EntryMode, number> = { export: 2.5, jv: 1.2, sub: 0.6 }
/** How much of the country's red tape and local-content rules each mode meets. */
const OTHER_DRAG: Record<EntryMode, number> = { export: 0.5, jv: 0.2, sub: 0.45 }

export const MODE_LABEL: Record<EntryMode, string> = { export: 'Export through distributors', jv: 'Partner / joint venture', sub: 'Local subsidiary' }

/** How much of a campaign's reach a local trade gets at home (the market is already yours to lose). */
export const LOCAL_CAMPAIGN = 0.35
export const CAMPAIGN_TERM = 3
export const CAMPAIGN_EFF = 0.5
/** Defending the home market: the pull it keeps and the years it lasts. */
export const DEFEND_PULL = 0.05
export const DEFEND_TERM = 3
/** Diversified supply chains: how many years, and the share of tariff drag it removes while it lasts. */
export const SUPPLY_TERM = 5
export const SUPPLY_TARIFF_RELIEF = 0.3

/** 0 before a move starts, rising over three years, 1 through its term, then fading over two more. */
export function termFactor(year: number, start: number, until: number): number {
  if (year < start) return 0
  const ramp = Math.min(1, (year - start + 1) / 3)
  if (year <= until) return ramp
  if (year === until + 1) return ramp * 0.6
  if (year === until + 2) return ramp * 0.3
  return 0
}

const weightCache = new Map<string, Map<string, number>>()

/** Each country's slice of an industry's world demand (sums to 1): spending power times local appetite. */
export function demandWeights(industry: Industry | string): Map<string, number> {
  const hit = weightCache.get(industry)
  if (hit) return hit
  const raw = new Map<string, number>()
  let total = 0
  for (const c of COUNTRIES) {
    const m = marketOf(c.id)
    const w = Math.max(0, m.gdpPerCapita) * Math.max(0, m.populationM) * Math.max(0, industryDemand(c.id, industry as Industry))
    raw.set(c.id, w)
    total += w
  }
  const out = new Map<string, number>()
  for (const [k, v] of raw) out.set(k, total > 0 ? v / total : 0)
  weightCache.set(industry, out)
  return out
}

/** A country entry's strength this year (0-1): the mode, the term, minus tariffs and red tape. */
export function entryStrength(e: MarketEntry, industry: Industry | string, year: number, supplyUntil = 0): number {
  const tf = termFactor(year, e.year, e.until)
  if (tf <= 0) return 0
  const relief = supplyUntil >= year ? 1 - SUPPLY_TARIFF_RELIEF : 1
  const tariffDrag = Math.min(0.7, tariffOn(e.home, e.country, year) * goodsShare(industry) * TARIFF_DRAG[e.mode] * relief)
  const otherDrag = Math.min(0.6, otherBarriers(e.country, year) * OTHER_DRAG[e.mode])
  return MODE_EFF[e.mode] * tf * (1 - tariffDrag) * (1 - otherDrag)
}

/** How hard a campaign pushes this year (0-1). */
export function campaignStrength(c: MarketCampaign, year: number): number {
  return CAMPAIGN_EFF * termFactor(year, c.year, c.until)
}

/**
 * The company's presence in a country this year (0 - 1.3): its entry (the best one) plus campaigns,
 * which work best where the company already sells. `home` is where the company is based: it
 * is always present there.
 */
export function presenceIn(st: Pick<MarketState, 'entries' | 'campaigns' | 'supplyUntil'>, industry: Industry | string, country: string, home: string, year: number): number {
  let base = country === home ? 1 : 0
  for (const e of st.entries) if (e.country === country) base = Math.max(base, entryStrength(e, industry, year, st.supplyUntil))
  const cs = st.campaigns.filter((c) => c.country === country).map((c) => campaignStrength(c, year)).sort((a, b) => b - a)
  let camp = 0
  cs.forEach((v, i) => {
    camp += v * (i === 0 ? 1 : 0.4)
  })
  const reach = camp * (0.35 + 0.65 * Math.min(1, base))
  return Math.min(1.3, base + reach)
}

/** The sum that drives the multiplier: demand-weighted presence outside the home market, plus campaigns at home. */
export function reachInput(st: Pick<MarketState, 'key' | 'entries' | 'campaigns' | 'supplyUntil'>, industry: Industry | string, year: number): number {
  const d = marketDef(industry)
  if (d.scope === 'national') {
    // Local trades have one market: a campaign there is the only reach there is.
    const cs = st.campaigns.filter((c) => c.country === st.key).map((c) => campaignStrength(c, year)).sort((a, b) => b - a)
    // A campaign at home deepens a market the company already sells in: it adds about a third of what a new country would.
    return LOCAL_CAMPAIGN * cs.reduce((t, v, i) => t + v * (i === 0 ? 1 : 0.4), 0)
  }
  const w = demandWeights(industry)
  const homes = new Set<string>([...st.entries.map((e) => e.home), ...st.campaigns.map((c) => c.home)])
  const countries = new Set<string>([...st.entries.map((e) => e.country), ...st.campaigns.map((c) => c.country)])
  let x = 0
  for (const c of countries) {
    // At home the company is present by default; only its campaigns add to what it has.
    const atHome = homes.has(c)
    const p = presenceIn(st, industry, c, atHome ? c : '', year)
    x += (w.get(c) ?? 0) * (atHome ? Math.max(0, p - 1) : p)
  }
  return x
}

/** The multiplier on the company's pull from everything this file models (1 = none). */
export function reachOf(st: MarketState, industry: Industry | string, year: number): number {
  const x = reachInput(st, industry, year)
  const defend = st.defendUntil >= year ? 1 + DEFEND_PULL : 1
  const base = 1 + REACH_CAP * (1 - Math.exp(-REACH_K * Math.max(0, x)))
  return Number.isFinite(base * defend) ? base * defend : 1
}

/** A supply-chain disruption (shipping, export controls, a tariff round) cuts the pull of an exposed company. */
export const SUPPLY_HIT = 0.9
/** The same disruption for a company that diversified its suppliers and routes. */
export const SUPPLY_SHIELDED = 0.97

/** True when physical supply chains matter to this business at all (goods that cross borders). */
export function hasSupplyChain(industry: Industry | string): boolean {
  return goodsShare(industry) >= 0.3 && marketDef(industry).scope === 'world'
}
