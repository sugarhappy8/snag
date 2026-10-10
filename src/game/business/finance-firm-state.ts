import type { Json } from '../types'
import { getCountry } from '../world'
import type { BizState } from './state'

export type FinanceStrategy = 'cautious' | 'balanced' | 'aggressive'
export type InvestmentModel = 'retail' | 'private' | 'brokerage'
export interface FinanceFirm {
  v: number
  model: InvestmentModel
  lending: number
  staffing: number
  marketingBudget: number
  researchBudget: number
  technologyBudget: number
  tradingCapital: number
  leverage: number
  computing: number
  researchQuality: number
  commission: number
  accounts: number
  lastTrades: number
  lastTrading: number
  lastResearch: number
  regulatoryAction: string
  strategy: FinanceStrategy
  /** Segregated client assets; neither client capital nor deposits are company cash. */
  aum: number
  highWater: number
  deposits: number
  reserves: number
  loanBook: number
  bonds: number
  confidence: number
  reserveRatio: number
  feeRate: number
  depositRate: number
  loanRate: number
  controls: number
  outreach: number
  algoEdge: number
  algoStarted: number
  algoProgress: number
  algoResearching: boolean
  algoCompleted: number
  lastYear: number
  lastReturn: number
  lastDefaults: number
  lastWithdrawals: number
  lastFees: number
  lastRun: boolean
}

export function isFinanceFirm(b: { industry: string }): boolean {
  return ['investmentFirm', 'bank', 'onlineBank'].includes(b.industry)
}

const cap = (v: Json | undefined, fallback = 0, hi = 1e15, lo = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback

export function financeView(b: Pick<BizState, 'industry' | 'countryId' | 'financeFirm'>): FinanceFirm {
  const x = b.financeFirm && typeof b.financeFirm === 'object' && !Array.isArray(b.financeFirm) ? b.financeFirm : {}
  const investment = b.industry === 'investmentFirm'
  const initialClients = 25_000_000 * Math.max(.15, Math.min(2, getCountry(b.countryId).wealth))
  const deposits = investment ? 0 : cap(x.deposits, initialClients)
  // Old and partial saves get a balanced client pool, never a free equity asset.
  let loanBook = investment ? 0 : cap(x.loanBook, deposits * .65)
  let bonds = investment ? 0 : cap(x.bonds, deposits * .1)
  let reserves = investment ? 0 : cap(x.reserves, deposits - loanBook - bonds)
  const pool = loanBook + bonds + reserves
  if (!investment && pool > 0 && pool !== deposits) {
    const scale = deposits / pool
    loanBook *= scale; bonds *= scale; reserves *= scale
  } else if (!investment && pool === 0 && deposits > 0) reserves = deposits
  const aum = investment ? cap(x.aum, initialClients) : 0
  return {
    v: 2, model: x.model === 'retail' || x.model === 'brokerage' ? x.model : 'private',
    lending: cap(x.lending, .8, 1), staffing: cap(x.staffing, 1, 2, .5),
    marketingBudget: cap(x.marketingBudget), researchBudget: cap(x.researchBudget), technologyBudget: cap(x.technologyBudget),
    tradingCapital: cap(x.tradingCapital), leverage: cap(x.leverage, 1, 3, 1), computing: cap(x.computing, 0, 100),
    researchQuality: cap(x.researchQuality, 0, 100), commission: cap(x.commission, .002, .02, .0001),
    accounts: Math.round(cap(x.accounts, 1000, 1e9)), lastTrades: cap(x.lastTrades), lastTrading: cap(x.lastTrading, 0, 1e15, -1e15),
    lastResearch: cap(x.lastResearch), regulatoryAction: typeof x.regulatoryAction === 'string' ? x.regulatoryAction : '',
    strategy: x.strategy === 'cautious' || x.strategy === 'aggressive' ? x.strategy : 'balanced',
    aum, highWater: cap(x.highWater, aum), deposits, reserves, loanBook, bonds,
    confidence: cap(x.confidence, 65, 100), reserveRatio: cap(x.reserveRatio, .25, .7, .1),
    feeRate: cap(x.feeRate, .015, .03, .005), depositRate: cap(x.depositRate, .02, .15), loanRate: cap(x.loanRate, .08, .3, .025),
    controls: cap(x.controls, 50, 100), outreach: cap(x.outreach, 0, 1),
    algoEdge: cap(x.algoEdge, 0, .08), algoStarted: Math.round(cap(x.algoStarted, 0, 100_000)),
    algoProgress: cap(x.algoProgress, 0, 2), algoResearching: x.algoResearching === true,
    algoCompleted: Math.round(cap(x.algoCompleted, 0, 100_000)), lastYear: Math.round(cap(x.lastYear, -1, 100_000, -1)),
    lastReturn: cap(x.lastReturn, 0, 2, -1), lastDefaults: cap(x.lastDefaults), lastWithdrawals: cap(x.lastWithdrawals),
    lastFees: cap(x.lastFees), lastRun: x.lastRun === true,
  }
}

export function saveFinance(b: BizState, f: FinanceFirm): void {
  b.financeFirm = financeView({ ...b, financeFirm: f as unknown as Json }) as unknown as Json
}
