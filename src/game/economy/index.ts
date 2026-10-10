import { log } from '../core'
import { marketOf } from '../data/markets'
import { historicalCycle, inHistory } from '../history/markets'
import { outcomeTag } from '../timeMachine'
import type { GameState } from '../types'
import { COUNTRIES } from '../world'
import { advanceCountry, worldConditions } from './simulation'
import { bound, economyOf, economyState, initialCountry, pointOf, sectorOf, storeEconomy, type EconomicPolicy, type EconomyFeedback, type EconomyState } from './model'

export { bound, ECONOMY_KEY, economicRoll, economyOf, economyState, initialCountry, sectorOf, SECTORS, SECTOR_RULES } from './model'
export type { CountryEconomy, EconomyState, Sector } from './model'

/** Old saves enter at their current year, with no retroactive earnings or replayed history. */
export function ensureEconomy(g: GameState): void {
  if (economyState(g)) return
  const countries = Object.fromEntries(COUNTRIES.map(c => [c.id, initialCountry(c.id, g.year)]))
  storeEconomy(g, { v: 1, year: g.year, countries, previous: {}, history: {}, pending: [], policies: [], receipts: [] })
}

export function yearlyEconomy(g: GameState): void {
  if (!g.character.alive) return
  ensureEconomy(g)
  const prev = economyState(g)!
  if (prev.year >= g.year) return
  // Normal aging is one year. Imported jumps seed the missing interval instead of executing
  // thousands of years in a UI action or retroactively charging household money.
  const opening = prev.year === g.year - 1 ? prev.countries : Object.fromEntries(COUNTRIES.map(c => [c.id, initialCountry(c.id, g.year - 1)]))
  const world = worldConditions(opening)
  const seed = `${g.lifeId.replace(/-g\d+$/, '')}${outcomeTag(g, g.year)}`
  const next: EconomyState = { v: 1, year: g.year, countries: {}, previous: opening, history: {}, pending: [], policies: prev.policies.filter(p => p.until >= g.year), receipts: [] }
  for (const c of COUNTRIES) {
    const old = opening[c.id] ?? initialCountry(c.id, g.year - 1)
    const current = advanceCountry(old, c.id, g.year, seed, world, prev.pending, next.policies)
    next.countries[c.id] = current
    next.history[c.id] = [...(prev.history[c.id] ?? [pointOf(old)]), pointOf(current)].slice(-32)
  }
  storeEconomy(g, next)
  const local = next.countries[g.character.countryId], before = opening[g.character.countryId]
  if (local && before && g.character.age >= 16 && (local.growth < -.02 && before.growth >= -.02 || local.credit < .72 && before.credit >= .72 || local.supply > .12 && before.supply <= .12)) {
    log(g, `Around me: ${local.causes[0]}`, 'neutral')
  }
}

export function economicCycle(g: GameState, country: string, year = g.year): number {
  const e = economyOf(g, country, year)
  const dynamic = bound(1 + e.outputGap * .75 + (e.spending - 1) * .35, .6, 1.4)
  return inHistory(year) ? bound(historicalCycle(country, year, 1) * (1 + (dynamic - 1) * .2), .55, 1.4) : dynamic
}
export function industryConditions(g: GameState, industry: string, country = g.character.countryId, year = g.year) {
  return economyOf(g, country, year).sectors[sectorOf(industry)]
}
export function lendingConditions(g: GameState, country = g.character.countryId) {
  const e = economyOf(g, country), base = initialCountry(country, g.year)
  return { spread: bound((e.rate - base.rate) + (e.defaults - .025) * .4 + Math.max(0, 1 - e.credit) * .015, -.025, .16),
    maxDti: bound(.45 + (e.credit - 1) * .12 - Math.max(0, e.defaults - .03), .27, .48),
    minScore: Math.round(580 + Math.max(0, 1 - e.credit) * 120),
    label: e.credit < .78 ? 'Banks are cautious: larger buffers and stronger credit are required.' : e.credit > 1.08 ? 'Banks are competing for borrowers, but future rates can rise.' : 'Banks are lending normally; income and payment history still matter.' }
}
export function economyMarketFactor(g: GameState, country: string, year: number, housing = false): number {
  const state = economyState(g)
  if (!state || inHistory(year)) return 1
  const e = state.countries[country]
  const key = housing ? 'housing' : 'market'
  if (e && e.year <= year) return e[key]
  const prior = state.previous[country]
  if (prior?.year === year) return prior[key]
  return state.history[country]?.find(p => p.year === year)?.[key] ?? 1
}

/** Aggregated feedback is keyed to a settled result, not an action click. Receipts reset only
 * after the next annual transition consumes that year's queue. No settlement-order effects. */
export function recordEconomicActivity(g: GameState, id: string, country: string, industry: string, changes: { jobs?: number; investment?: number; failure?: number; innovation?: number }): void {
  if (!COUNTRIES.some(c => c.id === country) || !id) return
  ensureEconomy(g)
  const state = economyState(g)!, token = `${g.year}:${id}`
  if (state.receipts.includes(token)) return
  const sector = sectorOf(industry), m = marketOf(country)
  const workforce = Math.max(50000, m.populationM * 1e6 * .48)
  const gdp = Math.max(1e9, m.populationM * 1e6 * m.gdpPerCapita)
  const finite = (v: number | undefined) => typeof v === 'number' && Number.isFinite(v) ? v : 0
  const update: EconomyFeedback = { country, sector, jobs: bound(finite(changes.jobs) / workforce, -.04, .04), investment: bound(finite(changes.investment) / gdp, 0, .06), failure: bound(finite(changes.failure) / gdp, 0, .1), innovation: bound(finite(changes.innovation), 0, .3) }
  const pending = state.pending.map(p => ({ ...p })), existing = pending.find(p => p.country === country && p.sector === sector)
  if (existing) {
    existing.jobs = bound(existing.jobs + update.jobs, -.08, .08); existing.investment = bound(existing.investment + update.investment, 0, .08)
    existing.failure = bound(existing.failure + update.failure, 0, .12); existing.innovation = bound(existing.innovation + update.innovation, 0, .5)
  } else pending.push(update)
  storeEconomy(g, { ...state, pending, receipts: [...state.receipts, token].slice(-3000) })
}

export function enactEconomicPolicy(g: GameState, id: string, kind: EconomicPolicy['kind'], rank: number): string {
  ensureEconomy(g)
  const state = economyState(g)!, token = `${g.character.countryId}:${g.year}:${id}`
  if (state.policies.some(p => p.id === token)) return ''
  const scale = [ .03, .12, .35, 1 ][Math.round(bound(rank, 0, 3))]
  const policy: EconomicPolicy = { id: token, country: g.character.countryId, year: g.year, until: g.year + 5, kind, scale }
  storeEconomy(g, { ...state, policies: [...state.policies, policy].slice(-500) })
  return ` ${economicPolicyDescription(kind)} Effects build over the next five years${rank < 3 ? ' in proportion to your office’s reach' : ''}.`
}

export function economicPolicyDescription(kind: EconomicPolicy['kind'] | null): string {
  return kind ? { investment: 'Infrastructure spending supports suppliers and capacity, but adds to public borrowing.', education: 'Education funding improves skills and mobility over time, but must be financed.', health: 'Health funding supports care and recovery, with a continuing budget cost.', taxCut: 'Lower taxes support disposable income, but leave less revenue for public services.', taxRise: 'Higher taxes restrain spending while helping fund public services and debt.', regulation: 'Stronger banking oversight improves liquidity buffers, while slowing easy credit.' }[kind] : ''
}

/** Names are only a fallback for existing legislation; no duplicate menu of economic laws. */
export function billEconomicKind(name: string, issue: string): EconomicPolicy['kind'] | null {
  if (/raise|salary|stipend|allowance/i.test(name) && /official|mayor|board|leader|government|councillor/i.test(name)) return null
  if (/tax|fees/i.test(name)) return /cut|abolish|lower/i.test(name) ? 'taxCut' : 'taxRise'
  if (issue === 'education') return 'education'
  if (issue === 'healthcare' || issue === 'health') return 'health'
  if (issue === 'infrastructure' || issue === 'environment' || issue === 'economy') return /bank|regulat/i.test(name) ? 'regulation' : 'investment'
  return null
}
