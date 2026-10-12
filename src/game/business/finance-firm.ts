// Financial institutions: banks (bank.ts) and investment firms (fund.ts). This file only dispatches,
// so the two models can evolve independently. Clients' money never enters b.cash or valuation.
import type { Asset, GameState, MenuNode } from '../types'
import type { YearResult } from './economy'
import { bankCapitalNeed, bankEraBlock, bankInfo, bankManagerTurn, bankMarketLine, bankNodes, bankSettledYear, isBank, queueBankReport, simulateBankYear } from './bank'
import { shareText } from './competition'
import { fundCapitalNeed, fundClientAssets, fundEraBlock, fundInfo, fundManagerTurn, fundNodes, fundSettledYear, queueFundReport, simulateFundYear } from './fund'
import { poolSize } from './fund-model'
import { getCountry } from '../world'
import { money } from './util'
import { isFinanceFirm } from './finance-firm-state'
import type { BizState } from './state'

export { isFinanceFirm } from './finance-firm-state'

/** Why this financial industry can't be founded here and now, or null. */
export function financeEraBlock(g: GameState, industry: string, countryId = g.character.countryId, year = g.year): string | null {
  if (isBank({ industry })) return bankEraBlock(g, industry, countryId, year)
  if (isFinanceFirm({ industry })) return fundEraBlock(g, industry, countryId, year)
  return null
}

/** The fiscal year of a bank or investment firm (economy.simulateYear dispatches here). */
export function simulateFinanceYear(g: GameState, b: BizState, year: number, ownerDraw: number, bookedHomeSales: number | Record<string, number> = 0): YearResult {
  return isBank(b) ? simulateBankYear(g, b, year, ownerDraw, bookedHomeSales) : simulateFundYear(g, b, year, ownerDraw, bookedHomeSales)
}

/** A hired CEO's yearly decisions. */
export function financeManagerTurn(g: GameState, b: BizState): void {
  if (isBank(b)) bankManagerTurn(g, b)
  else fundManagerTurn(g, b)
}

/** The owner-CEO's yearly report popup. */
export function queueFinanceReport(g: GameState, a: Asset, b: BizState): void {
  if (isBank(b)) queueBankReport(g, a, b)
  else queueFundReport(g, a, b)
}

/** The company screen's financial section (pure). */
export function financeNodes(g: GameState, a: Asset): MenuNode[] {
  return isBank({ industry: String(a.details.industry ?? '') }) ? bankNodes(g, a) : fundNodes(g, a)
}

/** One summary line for the company header (pure). */
export function financeInfo(g: GameState, b: BizState): string {
  return isBank(b) ? bankInfo(g, b) : fundInfo(g, b)
}

/** Shareholder capital a conglomerate treasury should place in this firm (pure). */
export function financeCapitalNeed(g: GameState, b: BizState, pool: number, effectiveness: number): number {
  return isBank(b) ? bankCapitalNeed(g, b, pool, effectiveness) : fundCapitalNeed(g, b, pool, effectiveness)
}

/** The last fiscal year this firm has already booked (-1 if none), so a year is never settled twice. */
export function financeSettledYear(b: BizState): number {
  return isBank(b) ? bankSettledYear(b) : fundSettledYear(b)
}

/**
 * The company screen's market line for a financial firm (pure). Their market is money, not units
 * sold at a price, so the product market's "$0 a year" would be meaningless here.
 */
export function financeMarketLine(g: GameState, b: BizState): string {
  if (isBank(b)) return bankMarketLine(g, b)
  const pool = poolSize(b.countryId, g.year), clients = fundClientAssets(b)
  return `Clients' money ${money(clients)} · ${shareText(clients / Math.max(1, pool))} of ~${money(pool)} invested in ${getCountry(b.countryId).name}`
}
