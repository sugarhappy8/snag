// A small, durable procurement network, not a second economy or a shipment ledger.
// Opening routes settle this year; replacement contracts take effect next year.
import { currencyOf } from '../data/currencies'
import { marketOf } from '../data/markets'
import { fxExposure, otherBarriers, sharedBloc, tariffOn } from '../business/market-trade'
import { homeFrontAt, warsAt } from '../history/events-wars'
import { PRESENT_YEAR } from '../history/timeline'
import { COUNTRIES, getCountry } from '../world'
import type { CountryEconomy, Sector } from './model'

export const TRADE_INPUTS = ['essentials', 'energy', 'industry', 'technology'] as const
export type TradeInputId = typeof TRADE_INPUTS[number]
export interface TradeRoute { partner: string; share: number }
export interface TradeInput {
  /** Supplier commitments for the following annual turn; shares total one. */
  routes: TradeRoute[]
  /** Imported fraction of requirements. Domestic substitution changes it gradually. */
  dependence: number
  /** Current delivered fraction of imports, and their cost relative to normal inputs. */
  availability: number; cost: number; tariff: number; restriction: number; fx: number
  /** Demand from existing foreign customers, relative to their normal orders. */
  exportDemand: number
}
export interface CountryTrade { v: 1; year: number; inputs: Record<TradeInputId, TradeInput> }
export interface SectorTrade { dependence: number; importedGap: number; cost: number; exportDemand: number; tariff: number; fx: number }
const clamp = (n: number, lo: number, hi: number) => Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo
const round = (n: number) => Math.round(n * 1e6) / 1e6
const rec = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
const number = (v: unknown, fallback: number, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : fallback
const valid = new Set(COUNTRIES.map(c => c.id))

// Approximate game capabilities, not reported trade statistics. Broad era bands avoid
// projecting today's chip or Gulf petroleum exporters into early-twentieth-century lives.
function capabilities(input: TradeInputId, year: number): Record<string, number> {
  if (input === 'essentials') return { us: 1.4, ca: 1.1, au: 1.1, ar: 1.1, br: year >= 1970 ? 1.3 : .6, fr: 1, ru: .9, ua: .9, in: .8, cn: .7 }
  if (input === 'energy') return year < 1950
    ? { us: 1.5, ru: 1.4, gb: 1.3, de: 1, pl: .9, ca: .8 }
    : { sa: 1.5, ae: year >= 1970 ? 1.3 : .2, kw: 1.3, qa: year >= 1980 ? 1.2 : .4, ru: 1.3, us: 1.1, ca: 1, no: year >= 1980 ? 1.2 : .4, au: 1 }
  if (input === 'industry') return year < 1980
    ? { us: 1.5, de: 1.4, gb: 1.3, fr: 1.2, jp: year >= 1960 ? 1.4 : .7, ru: 1.1, it: 1 }
    : { cn: year >= 1990 ? 1.6 : .8, de: 1.4, us: 1.2, jp: 1.2, kr: 1.1, mx: .9, in: .9, it: 1 }
  if (year < 1955) return {}
  return year < 1985 ? { us: 1.6, jp: 1.3, de: 1.1, gb: .9, fr: .9 }
    : { tw: 2.4, kr: 1.9, jp: 1.25, us: 1.1, de: .8, cn: year >= 2000 ? 1.1 : .35, sg: 1 }
}

/** Imported share of a country's needs for an input (0.08-0.85), before any substitution. */
export function importReliance(country: string, input: TradeInputId, year: number): number {
  return reliance(country, input, year)
}

/**
 * Governments' own trade measures (nation/trade-policy.ts): tariffs, deals, sanctions and export
 * bans on top of the fixed customs data. Pure lookups; absent = today's customs only.
 */
export interface TradeOverlay {
  /** Extra tariff on `input` goods shipped from `from` into `to` (share of the price). */
  tariff(from: string, to: string, input: TradeInputId): number
  /** Extra restriction on trade between the pair (sanctions), 0-0.8. */
  restriction(from: string, to: string): number
  /** True when `from` refuses to export `input`. */
  exportBan(from: string, input: TradeInputId): boolean
  /** True when the pair has a trade deal (no tariffs either way). */
  deal(a: string, b: string): boolean
  /** True when any measure touches this country (as importer or exporter). */
  touches(country: string): boolean
}

function reliance(country: string, input: TradeInputId, year: number): number {
  if (input === 'technology' && year < 1955) return 0
  const capacity = capabilities(input, year)[country] ?? 0
  const scale = clamp(Math.log10(Math.max(1, marketOf(country).populationM)) / 4, 0, .65)
  return round(clamp((input === 'technology' ? .78 : input === 'energy' ? .68 : .55) - capacity * .2 - scale * .18, .08, .85))
}

function routeWeights(rows: TradeRoute[]): TradeRoute[] {
  const total = rows.reduce((sum, row) => sum + row.share, 0)
  if (!(total > 0)) return []
  const ordered = rows.map(row => ({ partner: row.partner, share: row.share / total })).sort((a,b) => a.partner.localeCompare(b.partner))
  let used = 0
  return ordered.map((row, index) => {
    const share = index === ordered.length - 1 ? round(1 - used) : round(row.share)
    used += share
    return { partner: row.partner, share }
  })
}

type RouteTerms = { tariff: number; restriction: number; fx: number }
/** Pure memo, bucketed by year. One annual sweep asks for every country pair this year and
 * last year (~20k routes); dropping whole old years keeps it bounded without thrashing. */
const termsCache = new Map<number, Map<string, RouteTerms>>()
const TERMS_YEARS = 4
/** Existing customs code owns tariff and bloc dates. There is no parallel treaty table. */
function routeTerms(from: string, to: string, year: number): RouteTerms {
  let byYear = termsCache.get(year)
  if (!byYear) {
    if (termsCache.size >= TERMS_YEARS) termsCache.delete(termsCache.keys().next().value!)
    byYear = new Map()
    termsCache.set(year, byYear)
  }
  const key = `${from}:${to}`, hit = byYear.get(key)
  if (hit) return hit
  const bloc = sharedBloc(from, to, year), tariff = tariffOn(from, to, year)
  const permits = (bloc ? Math.min(.1, otherBarriers(to, year)) : otherBarriers(to, year)) * .12
  const homeWar = warsAt(from, year).some(w => homeFrontAt(w, from)) || warsAt(to, year).some(w => homeFrontAt(w, to))
  // Overseas participation alone does not close a nation's ports. Known historical
  // home-front damage is bounded; no invented future wars or sanctions are introduced.
  const restriction = clamp(permits + tariff * .18 + (homeWar ? .3 : 0), 0, .8)
  const denominationChanged = currencyOf(from, year).code !== currencyOf(from, year - 5).code || currencyOf(to, year).code !== currencyOf(to, year - 5).code
  const fx = denominationChanged ? 0 : clamp(fxExposure(to, from, year).swing, 0, .3)
  const result = { tariff, restriction, fx }
  byYear.set(key, result)
  return result
}

const candidateCache = new Map<string, TradeRoute[]>()
function candidates(country: string, input: TradeInputId, year: number): TradeRoute[] {
  const key = `${country}:${input}:${year}`, hit = candidateCache.get(key)
  if (hit) return hit
  const local = getCountry(country)
  const rows = Object.entries(capabilities(input, year)).filter(([partner]) => partner !== country && valid.has(partner)).map(([partner, capacity]) => {
    const terms = routeTerms(partner, country, year)
    const proximity = getCountry(partner).continent === local.continent ? 1.35 : 1
    const agreement = sharedBloc(partner, country, year) ? 1.6 : 1
    return { partner, share: capacity * proximity * agreement / (1 + terms.tariff * 2 + terms.restriction * 3) }
  }).sort((a,b) => b.share - a.share || a.partner.localeCompare(b.partner))
  if (candidateCache.size >= 4096) candidateCache.clear()
  candidateCache.set(key, rows)
  return rows
}

/** Pure baseline for new/old saves: opening metadata creates no stock, income or charges. */
export function initialTrade(country: string, year: number): CountryTrade {
  return { v: 1, year, inputs: Object.fromEntries(TRADE_INPUTS.map(input => [input, {
    routes: routeWeights(candidates(country, input, year).slice(0, 3)), dependence: reliance(country, input, year),
    availability: 1, cost: 1, tariff: 0, restriction: 0, fx: 0, exportDemand: 1,
  }])) as CountryTrade['inputs'] }
}

/** Canonical bounded JSON; a missing network is initialized without replaying prior years. */
export function normalizeTrade(value: unknown, country: string, year: number): CountryTrade {
  const raw = rec(value), out = initialTrade(country, year)
  if (raw.v !== 1) return out
  const inputs = rec(raw.inputs)
  for (const input of TRADE_INPUTS) {
    const row = rec(inputs[input]), base = out.inputs[input]
    if (input === 'technology' && year < 1955) continue
    const merged = new Map<string, number>()
    if (Array.isArray(row.routes)) for (const route of row.routes.slice(0, 30)) {
      const r = rec(route), id = String(r.partner)
      if (id !== country && valid.has(id)) merged.set(id, (merged.get(id) ?? 0) + number(r.share, 0, 0, 1))
    }
    const routes = routeWeights([...merged].filter(([,share]) => share > 0).map(([partner,share]) => ({ partner,share })).sort((a,b) => b.share - a.share || a.partner.localeCompare(b.partner)).slice(0, 3))
    out.inputs[input] = { routes: routes.length ? routes : base.routes,
      dependence: number(row.dependence, base.dependence, 0, .85), availability: number(row.availability, 1, 0, 1),
      cost: number(row.cost, 1, .5, 2.5), tariff: number(row.tariff, 0, 0, .6), restriction: number(row.restriction, 0, 0, .8),
      fx: number(row.fx, 0, 0, .3), exportDemand: number(row.exportDemand, 1, .4, 1.6) }
  }
  return compactTrade(out)
}

/** Customs terms plus governments' own measures (never cached: the overlay belongs to one game). */
function withPolicy(base: RouteTerms, overlay: TradeOverlay, from: string, to: string, input: TradeInputId): RouteTerms {
  const tariff = overlay.deal(from, to) ? 0 : clamp(base.tariff + overlay.tariff(from, to, input), 0, .6)
  const restriction = clamp(base.restriction + overlay.restriction(from, to) + Math.max(0, tariff - base.tariff) * .18, 0, .8)
  return { tariff, restriction, fx: base.fx }
}

function shipment(opening: Record<string, CountryEconomy>, from: string, to: string, input: TradeInputId, year: number, overlay?: TradeOverlay | null) {
  const exporter = opening[from], importer = opening[to], s = exporter?.sectors[input]
  const terms = overlay ? withPolicy(routeTerms(from, to, year), overlay, from, to, input) : routeTerms(from, to, year)
  // A supplier cannot deliver more than its actual opening production/requirements.
  const production = s ? clamp(s.output / Math.max(.25, s.demand), 0, 1) : 1
  const freight = exporter ? clamp(exporter.sectors.logistics.output / Math.max(.25, exporter.sectors.logistics.demand), .2, 1) : 1
  const banned = overlay?.exportBan(from, input) ? .15 : 1
  const availability = clamp(production * (1 - terms.restriction) * (.7 + freight * .3) * banned, 0, 1)
  const sharedCurrency = currencyOf(from, year).code === currencyOf(to, year).code
  // Internal money stays constant-dollar. Historical FX is descriptive; future relative
  // currency pressure changes procurement costs only, never converts money or debts.
  const currency = year > PRESENT_YEAR && !sharedCurrency ? clamp((importer?.currency ?? 1) / Math.max(.5, exporter?.currency ?? 1) - 1, -.35, .5) : 0
  const cost = clamp(1 + ((s?.costs ?? 1) - 1) * .5 + terms.tariff + terms.restriction * .15 + currency * .25, .5, 2.5)
  return { ...terms, availability, cost }
}

/** Bounded response to observed performance; no same-turn magic substitute suppliers. */
function retarget(opening: Record<string, CountryEconomy>, country: string, input: TradeInputId, year: number, routes: TradeRoute[], overlay?: TradeOverlay | null): TradeRoute[] {
  const options = candidates(country, input, year)
  const raw = options.map(candidate => {
    const delivered = shipment(opening, candidate.partner, country, input, year, overlay)
    return { partner: candidate.partner, share: candidate.share * (.15 + delivered.availability * .85) / delivered.cost }
  }).sort((a,b) => b.share - a.share || a.partner.localeCompare(b.partner))
  if (!routes.length) return routeWeights(raw.slice(0, 3))
  const chosen = routes.map(route => ({ ...route }))
  // Keep at most three commitments. A failing smallest contract can be replaced, but
  // its first-year share is capped at 12%; displaced purchases are redistributed.
  const fresh = raw.find(row => !chosen.some(route => route.partner === row.partner))
  const weakest = [...chosen].sort((a,b) => a.share - b.share || a.partner.localeCompare(b.partner))[0]
  const failing = weakest && shipment(opening, weakest.partner, country, input, year, overlay).availability < .75
  let newcomer = ''
  if (fresh && failing) {
    const oldScore = raw.find(row => row.partner === weakest.partner)?.share ?? 0
    if (fresh.share > oldScore * 1.25) {
      chosen.splice(chosen.findIndex(row => row.partner === weakest.partner), 1)
      chosen.push({ partner: fresh.partner, share: Math.min(.12, weakest.share) })
      newcomer = fresh.partner
    }
  }
  const target = routeWeights(chosen.map(route => ({ partner: route.partner, share: raw.find(row => row.partner === route.partner)?.share ?? .01 })))
  const next = routeWeights(chosen.map(route => ({ partner: route.partner, share: route.share * .82 + (target.find(row => row.partner === route.partner)?.share ?? 0) * .18 })))
  const added = next.find(route => route.partner === newcomer)
  if (added && added.share > .12) {
    const rest = 1 - added.share
    for (const row of next) row.share = row === added ? .12 : row.share / rest * .88
  }
  return routeWeights(next)
}

/** The opening world is read-only during a transition; sort its buyers once, not per exporter and input. */
const buyerOrder = new WeakMap<Record<string, CountryEconomy>, { keys: string; sorted: string[] }>()
function buyersOf(opening: Record<string, CountryEconomy>): string[] {
  const keys = Object.keys(opening), joined = keys.join('\n'), hit = buyerOrder.get(opening)
  if (hit?.keys === joined) return hit.sorted
  const sorted = keys.sort()
  buyerOrder.set(opening, { keys: joined, sorted })
  return sorted
}

/** Lagged foreign orders from countries actually sourcing this input from this exporter. */
function exportOrders(opening: Record<string, CountryEconomy>, country: string, input: TradeInputId, year: number, overlay?: TradeOverlay | null): number {
  // A country that bans exporting an input keeps only a trickle of orders for it.
  if (overlay?.exportBan(country, input)) return .4
  let total = 0, orders = 0
  for (const buyer of buyersOf(opening)) {
    if (buyer === country) continue
    const e = opening[buyer], network = e.tradeNetwork ?? initialTrade(buyer, year - 1)
    const contract = network.inputs[input]
    // A plain loop: this runs for every country, input and buyer each year.
    let share = 0
    for (const route of contract.routes) if (route.partner === country) { share = route.share ?? 0; break }
    if (share <= 0) continue
    const weight = share * contract.dependence * Math.sqrt(Math.max(1, marketOf(buyer).populationM * marketOf(buyer).gdpPerCapita))
    const now = routeTerms(country, buyer, year), prior = routeTerms(country, buyer, year - 1)
    const restrictionChange = Math.max(0, now.restriction - prior.restriction) + Math.max(0, now.tariff - prior.tariff)
    // A buyer's own tariffs or sanctions on this exporter keep biting while they last.
    const barrier = overlay ? clamp(overlay.tariff(country, buyer, input) * 1.5 + overlay.restriction(country, buyer), 0, .6) : 0
    total += weight
    orders += weight * clamp(e.sectors[input].demand * (.8 + e.spending * .2) * (1 - restrictionChange) * (1 - barrier), .4, 1.6)
  }
  return total ? clamp(orders / total, .4, 1.6) : 1
}

export function countryTrade(opening: Record<string, CountryEconomy>, country: string, year: number, oldTrade?: CountryTrade, overlay?: TradeOverlay | null): CountryTrade {
  const old = oldTrade ?? opening[country]?.tradeNetwork ?? initialTrade(country, year - 1)
  const out = initialTrade(country, year)
  for (const input of TRADE_INPUTS) {
    if (input === 'technology' && year < 1955) continue
    const prev = old.inputs[input], routes = prev.routes.length ? [...prev.routes].sort((a,b) => a.partner.localeCompare(b.partner)) : out.inputs[input].routes
    let availability = 0, cost = 0, tariff = 0, restriction = 0, fx = 0
    for (const route of routes) {
      const actual = shipment(opening, route.partner, country, input, year, overlay)
      availability += route.share * actual.availability; cost += route.share * actual.cost
      tariff += route.share * actual.tariff; restriction += route.share * actual.restriction; fx += route.share * actual.fx
    }
    const own = opening[country], local = own?.sectors[input]
    // Only spare equipment and affordable finance allow costly domestic replacement.
    // Growing domestic demand or disinvestment removes this alternative over time.
    const spare = local ? Math.max(0, local.capacity * local.workforce - local.demand) : 0
    const substitute = Math.min(.025, spare * Math.max(0, (own?.credit ?? 1) - .35) * (1 - prev.availability) * .12)
    const baseline = reliance(country, input, year)
    const dependence = clamp(prev.dependence + (baseline - prev.dependence) * .02 - substitute, 0, .85)
    out.inputs[input] = { routes: retarget(opening, country, input, year, routes, overlay), dependence,
      availability: routes.length ? availability : 1, cost: routes.length ? cost : 1, tariff, restriction, fx,
      exportDemand: exportOrders(opening, country, input, year, overlay) }
  }
  return compactTrade(out)
}

// Physical input baskets differ from sales: a software firm has no stored software but
// still needs computers/electricity. Semiconductor dependency begins in its historical era.
const BASKETS: Record<Sector, Partial<Record<TradeInputId, number>>> = {
  essentials: { essentials: .4, energy: .35, industry: .25 }, consumer: { essentials: .2, industry: .55, energy: .2, technology: .05 },
  leisure: { essentials: .5, energy: .4, technology: .1 }, housing: { industry: .7, energy: .3 },
  finance: { technology: .8, energy: .2 }, industry: { energy: .4, industry: .3, technology: .3 },
  energy: { energy: .55, industry: .4, technology: .05 }, logistics: { energy: .8, industry: .2 },
  technology: { technology: .65, industry: .2, energy: .15 }, care: { technology: .5, industry: .3, energy: .2 },
  public: { technology: .5, energy: .3, industry: .2 },
}
export function sectorTrade(trade: CountryTrade, sector: Sector, year = trade.year): SectorTrade {
  const out = { dependence: 0, importedGap: 0, cost: 1, exportDemand: 1, tariff: 0, fx: 0 }
  for (const input of TRADE_INPUTS) {
    const weight = BASKETS[sector][input] ?? 0
    if (!weight || input === 'technology' && year < 1955) continue
    const row = trade.inputs[input], exposure = weight * row.dependence
    out.dependence += exposure; out.importedGap += exposure * (1 - row.availability)
    out.cost += exposure * (row.cost - 1); out.tariff += exposure * row.tariff; out.fx += exposure * row.fx
    out.exportDemand += weight * (row.exportDemand - 1)
  }
  return out
}

/** Precision and route order are canonical across live state and JSON normalization. */
export function compactTrade(trade: CountryTrade): CountryTrade {
  for (const input of TRADE_INPUTS) {
    const row = trade.inputs[input]
    row.routes = routeWeights(row.routes)
    for (const key of ['dependence', 'availability', 'cost', 'tariff', 'restriction', 'fx', 'exportDemand'] as const) row[key] = round(row[key])
  }
  return trade
}
