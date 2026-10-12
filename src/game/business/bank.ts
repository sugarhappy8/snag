// Banks (industries 'bank' and 'onlineBank'). Placeholder that delegates to the legacy model until
// the Banking 2.0 rewrite lands; finance-firm.ts dispatches here.
import type { Asset, GameState, MenuNode } from '../types'
import type { YearResult } from './economy'
import { financeEraBlock as legacyEraBlock, financeInfo as legacyInfo, financeManagerTurn as legacyManagerTurn, financeNodes as legacyNodes, queueFinanceReport as legacyReport, simulateFinanceYear as legacySimulate } from './finance-legacy'
import { financeView } from './finance-firm-state'
import type { BizState } from './state'

export function isBank(b: { industry: string }): boolean {
  return b.industry === 'bank' || b.industry === 'onlineBank'
}
export function bankEraBlock(g: GameState, industry: string, countryId = g.character.countryId, year = g.year): string | null {
  return legacyEraBlock(g, industry, countryId, year)
}
export function simulateBankYear(g: GameState, b: BizState, year: number, ownerDraw: number, bookedHomeSales: number | Record<string, number> = 0): YearResult {
  return legacySimulate(g, b, year, ownerDraw, bookedHomeSales)
}
export function bankManagerTurn(g: GameState, b: BizState): void { legacyManagerTurn(g, b) }
export function queueBankReport(g: GameState, a: Asset, b: BizState): void { legacyReport(g, a, b) }
export function bankNodes(g: GameState, a: Asset): MenuNode[] { return legacyNodes(g, a) }
export function bankInfo(g: GameState, b: BizState): string { return legacyInfo(g, b) }
/** Shareholder cash a conglomerate treasury should keep in this bank beyond its operating buffer. */
export function bankCapitalNeed(_g: GameState, _b: BizState, pool: number, effectiveness: number): number {
  return pool * .1 * effectiveness
}
/** One-line state readers other modules may show (kept small on purpose). */
export function bankBooks(b: BizState): { deposits: number; loans: number } {
  const f = financeView(b)
  return { deposits: f.deposits, loans: f.loanBook }
}
/** The last fiscal year already booked (-1 if none). */
export function bankSettledYear(b: BizState): number {
  return financeView(b).lastYear
}
