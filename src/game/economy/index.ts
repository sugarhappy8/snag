import { marketOf } from '../data/markets'
import { historicalCycle, inHistory } from '../history/markets'
import { stateLine } from '../text/state'
import { logStateLine } from '../text/state-log'
import { outcomeTag } from '../timeMachine'
import type { GameState } from '../types'
import { COUNTRIES } from '../world'
import { advanceRivals } from '../business/economic-actors'
import { advanceCountry, worldConditions, type NationInput } from './simulation'
import { nationOverlay } from '../nation/effects'
import { tradeOverlay } from '../nation/trade-policy'
import { consumeWriteDowns } from '../nation/state'
import { economyFocus, HISTORY_YEARS, pruneToFocus } from './focus'
import { bound, ECONOMY_VERSION, economyOf, economyState, initialCountry, pointOf, sectorOf, storeEconomy, type EconomicPolicy, type EconomyFeedback, type EconomyState } from './model'

export { bound, ECONOMY_KEY, economicRoll, economyOf, economyState, initialCountry, sectorOf, SECTORS, SECTOR_RULES } from './model'
export type { CountryEconomy, EconomyState, Sector } from './model'

/** Old saves enter at their current year, with no retroactive earnings or replayed history. */
export function ensureEconomy(g: GameState): void {
  if (economyState(g)) return
  const countries = Object.fromEntries(COUNTRIES.map(c => [c.id, initialCountry(c.id, g.year)]))
  storeEconomy(g, { v: ECONOMY_VERSION, year: g.year, countries, previous: {}, history: {}, pending: [], policies: [], receipts: [], rivals: [], previousRivals: [] })
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
  // Last year's frame is kept for the countries a reader can name (A.K9): the simulation below reads the full `opening`.
  const next: EconomyState = { v: ECONOMY_VERSION, year: g.year, countries: {}, previous: pruneToFocus(opening, economyFocus(g)), history: {}, pending: [], policies: prev.policies.filter(p => p.until >= g.year), receipts: [], rivals: advanceRivals(g, opening, prev.rivals, g.year), previousRivals: prev.rivals }
  // Governments' own laws (nation/): measures passed before this year move this transition.
  const trade = tradeOverlay(g, g.year)
  for (const c of COUNTRIES) {
    const old = opening[c.id] ?? initialCountry(c.id, g.year - 1)
    const overlay = nationOverlay(g, c.id, g.year, false)
    const nation: NationInput | null = overlay || trade ? { overlay, trade } : null
    const current = advanceCountry(old, c.id, g.year, seed, world, prev.pending, next.policies, opening, nation)
    next.countries[c.id] = current
    next.history[c.id] = [...(prev.history[c.id] ?? [pointOf(old)]), pointOf(current)].slice(-HISTORY_YEARS)
  }
  storeEconomy(g, next)
  consumeWriteDowns(g)
  const local = next.countries[g.character.countryId], before = opening[g.character.countryId]
  if (local && before && g.character.age >= 16) {
    // One line, for the first condition that crossed this year. The row (text/state-table.ts) keeps the same crossing from
    // speaking again within 5 years; a year with no stated cause says nothing.
    const crossed = local.growth < -.02 && before.growth >= -.02 ? { key: 'around.growth', value: local.growth } as const
      : local.credit < .72 && before.credit >= .72 ? { key: 'around.credit', value: local.credit } as const
      : local.supply > .12 && before.supply <= .12 ? { key: 'around.supply', value: local.supply } as const
      : null
    const cause = local.causes[0]
    if (crossed) logStateLine(g, cause ? stateLine(g, crossed.key, crossed.value, { slots: { cause } }) : null)
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
export function recordEconomicActivity(g: GameState, id: string, country: string, industry: string, changes: { jobs?: number; investment?: number; failure?: number; innovation?: number; bankLoss?: number; bankRun?: number; bankLending?: number }): void {
  if (!COUNTRIES.some(c => c.id === country) || !id) return
  ensureEconomy(g)
  const state = economyState(g)!, token = `${g.year}:${id}`
  if (state.receipts.includes(token)) return
  const sector = sectorOf(industry), m = marketOf(country)
  const workforce = Math.max(50000, m.populationM * 1e6 * .48)
  const gdp = Math.max(1e9, m.populationM * 1e6 * m.gdpPerCapita)
  const finite = (v: number | undefined) => typeof v === 'number' && Number.isFinite(v) ? v : 0
  const update: EconomyFeedback = { country, sector, jobs: bound(finite(changes.jobs) / workforce, -.04, .04), investment: bound(finite(changes.investment) / gdp, 0, .06), failure: bound(finite(changes.failure) / gdp, 0, .1), innovation: bound(finite(changes.innovation), 0, .3) }
  if (industry === 'bank' || industry === 'onlineBank') Object.assign(update, {
    bankLoss: bound(finite(changes.bankLoss) / gdp, 0, .2), bankRun: bound(finite(changes.bankRun) / gdp, 0, .3), bankLending: bound(finite(changes.bankLending) / gdp, -.3, .3),
  })
  const pending = state.pending.map(p => ({ ...p })), existing = pending.find(p => p.country === country && p.sector === sector)
  if (existing) {
    // Keep signed expansions and layoffs until the shared national transition:
    // clipping between companies would make employment depend on settlement order.
    existing.jobs += update.jobs; existing.investment = bound(existing.investment + update.investment, 0, .08)
    existing.failure = bound(existing.failure + update.failure, 0, .12); existing.innovation = bound(existing.innovation + update.innovation, 0, .5)
    if (update.bankLoss !== undefined) {
      existing.bankLoss = bound((existing.bankLoss ?? 0) + update.bankLoss, 0, .2)
      existing.bankRun = bound((existing.bankRun ?? 0) + (update.bankRun ?? 0), 0, .3)
      // Clamp the combined national signal at consumption, not between banks:
      // an expanding lender must offset a contracting lender independent of order.
      existing.bankLending = (existing.bankLending ?? 0) + (update.bankLending ?? 0)
    }
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
