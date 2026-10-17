// Investment firms (industry 'investmentFirm'): Investment Firms 2.0. finance-firm.ts dispatches here.
// Four firm types chosen at founding (fund-state.ts): Asset Manager, Hedge Fund, Venture Capital,
// Brokerage. Client money (AUM, LP funds, startup stakes, custody accounts) never becomes company
// cash; the firm earns fees, carry, commissions and gains on its own capital only.
import type { Asset, GameState, MenuNode } from '../types'
import type { YearResult } from './economy'
import { fundAutopilot } from './fund-manager'
import { fundDashboard, fundInfoLine } from './fund-menu'
import { fundReport, fundYearlyChecks } from './fund-events'
import { brokerEra, hedgeBlock, ventureBlock } from './fund-model'
import { simulateFund } from './fund-sim'
import { clientAssets, newFundState, readFund, saveFund, type FundType } from './fund-state'
import { firstFundSize, newVcFund } from './fund-vc'
import type { BizState } from './state'
import { ceoLetter, SMART_SKILL } from './career'

export function isFund(b: { industry: string }): boolean {
  return b.industry === 'investmentFirm'
}

/** Investment firms exist in every era; the types have their own gates (fundTypeBlock). */
export function fundEraBlock(_g: GameState, _industry: string, _countryId?: string, _year?: number): string | null {
  return null
}

/** Why a firm type can't be founded in `year`, or null. */
export function fundTypeBlock(type: FundType, year: number): string | null {
  if (type === 'hedge') return hedgeBlock(year)
  if (type === 'vc') return ventureBlock(year)
  return null
}

/** Write a brand-new firm's books (founding). A VC firm closes its first fund with LPs' money. */
export function initFund(g: GameState, b: BizState, type: FundType): void {
  const f = newFundState(type, b.countryId)
  if (type === 'vc') f.funds.push(newVcFund(1, firstFundSize(g, b, g.year), g.year))
  // A new brokerage opens at the going rate of its era.
  if (type === 'broker') f.commission = brokerEra(b.countryId, g.year).normCommission
  saveFund(b, f)
}

export function simulateFundYear(g: GameState, b: BizState, year: number, ownerDraw: number, bookedHomeSales: number | Record<string, number> = 0): YearResult {
  return simulateFund(g, b, year, ownerDraw, bookedHomeSales)
}

/** A hired CEO's (or caretaker's) yearly decisions, plus regulators and schemes catching up. */
export function fundManagerTurn(g: GameState, b: BizState): void {
  const lines = fundAutopilot(g, b)
  if (lines.length && b.ceo === 'manager' && b.manager) {
    const a = g.assets.find(x => x.kind === 'business' && (x.details as unknown) === b)
    if (a) ceoLetter(g, a, b, lines, b.manager.skill > SMART_SKILL)
  }
  fundYearlyChecks(g, b)
}

export function queueFundReport(g: GameState, a: Asset, b: BizState): void { fundReport(g, a, b) }
export function fundNodes(g: GameState, a: Asset): MenuNode[] { return fundDashboard(g, a) }
export function fundInfo(g: GameState, b: BizState): string { return fundInfoLine(g, b) }

/** Shareholder cash a conglomerate treasury should keep in this firm beyond its operating buffer. */
export function fundCapitalNeed(_g: GameState, b: BizState, pool: number, effectiveness: number): number {
  const f = readFund(b)
  return f.type === 'hedge' ? Math.max(f.coinvest, pool * .05 * effectiveness) : pool * .05 * effectiveness
}

/** Client assets under management (never company cash). */
export function fundClientAssets(b: BizState): number {
  return clientAssets(readFund(b))
}

/** The last fiscal year already booked (-1 if none). */
export function fundSettledYear(b: BizState): number {
  return readFund(b).lastYear
}
