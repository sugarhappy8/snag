// Investment firms (industry 'investmentFirm'). Placeholder that delegates to the legacy model until
// the Investment Firms 2.0 rewrite lands; finance-firm.ts dispatches here.
import type { Asset, GameState, MenuNode } from '../types'
import type { YearResult } from './economy'
import { financeInfo as legacyInfo, financeManagerTurn as legacyManagerTurn, financeNodes as legacyNodes, queueFinanceReport as legacyReport, simulateFinanceYear as legacySimulate } from './finance-legacy'
import { financeView } from './finance-firm-state'
import type { BizState } from './state'

export function isFund(b: { industry: string }): boolean {
  return b.industry === 'investmentFirm'
}
export function fundEraBlock(_g: GameState, _industry: string, _countryId?: string, _year?: number): string | null {
  return null
}
export function simulateFundYear(g: GameState, b: BizState, year: number, ownerDraw: number, bookedHomeSales: number | Record<string, number> = 0): YearResult {
  return legacySimulate(g, b, year, ownerDraw, bookedHomeSales)
}
export function fundManagerTurn(g: GameState, b: BizState): void { legacyManagerTurn(g, b) }
export function queueFundReport(g: GameState, a: Asset, b: BizState): void { legacyReport(g, a, b) }
export function fundNodes(g: GameState, a: Asset): MenuNode[] { return legacyNodes(g, a) }
export function fundInfo(g: GameState, b: BizState): string { return legacyInfo(g, b) }
/** Shareholder cash a conglomerate treasury should keep in this firm beyond its operating buffer. */
export function fundCapitalNeed(_g: GameState, b: BizState, pool: number, effectiveness: number): number {
  const f = financeView(b)
  return f.model === 'private' ? Math.max(f.tradingCapital + f.researchBudget + f.technologyBudget, pool * .2 * effectiveness) : pool * .1 * effectiveness
}
/** Client assets under management (never company cash). */
export function fundClientAssets(b: BizState): number {
  return financeView(b).aum
}
/** The last fiscal year already booked (-1 if none). */
export function fundSettledYear(b: BizState): number {
  return financeView(b).lastYear
}
