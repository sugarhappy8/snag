// An exact bridge between settled income statements, not a forecast or flavor roll.
import type { Asset, Json, MenuGroup } from '../types'
import { findBusiness, readBiz, type BizState, type Statement } from './state'
import { money, num, rec } from './util'
import { readSupply } from './supply'

export interface ProfitDriver { label: string; amount: number }
export interface EconomicReport {
  v: 1; year: number; previousYear: number; previousNet: number; net: number; delta: number
  drivers: ProfitDriver[]
}
const LINES: [keyof Statement, string, number][] = [
  ['netRevenue', 'Sales after sales tax', 1], ['cogs', 'Materials and direct costs', -1],
  ['wages', 'Operating wages', -1], ['keyStaff', 'Key staff and managers', -1], ['rent', 'Premises', -1],
  ['marketing', 'Marketing', -1], ['interest', 'Debt interest', -1], ['upkeep', 'Upkeep and investment budgets', -1],
  ['other', 'One-off expenses', -1], ['otherIncome', 'Other income', 1], ['ownerPay', 'Owner salary', -1], ['corpTax', 'Corporate tax', -1],
]
const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n) ? n : 0

/** Called only after the real statement (including invention reclassification) settles. */
export function recordEconomicReport(b: BizState, previous: Statement | null, current: Statement): void {
  if (!previous || previous.year !== current.year - 1) { delete b.economicReport; return }
  const delta = finite(current.net) - finite(previous.net)
  const drivers = LINES.map(([key, label, sign]) => ({ label, amount: Math.round((finite(current[key]) - finite(previous[key])) * sign) })).filter(d => d.amount !== 0)
  const residual = delta - drivers.reduce((sum, d) => sum + d.amount, 0)
  if (residual) drivers.push({ label: 'Rounding and statement adjustments', amount: residual })
  b.economicReport = { v: 1, year: current.year, previousYear: previous.year, previousNet: previous.net, net: current.net, delta, drivers } as unknown as Json
}

export function economicReportOf(b: BizState): EconomicReport | null {
  const r = rec(b.economicReport)
  if (!r || !b.last || r.v !== 1 || r.year !== b.last.year || r.net !== b.last.net || r.previousYear !== b.last.year - 1 || !Array.isArray(r.drivers)
    || typeof r.previousNet !== 'number' || !Number.isFinite(r.previousNet) || typeof r.net !== 'number' || !Number.isFinite(r.net)) return null
  const drivers: ProfitDriver[] = r.drivers.slice(0, 13).flatMap(value => {
    const d = rec(value)
    return d && typeof d.label === 'string' && typeof d.amount === 'number' && Number.isFinite(d.amount)
      ? [{ label: d.label.slice(0, 80), amount: d.amount }] : []
  })
  const net = num(r.net), previousNet = num(r.previousNet), delta = net - previousNet
  // Reject an incomplete/malformed bridge instead of presenting invented attribution.
  if (Math.abs(drivers.reduce((sum, d) => sum + d.amount, 0) - delta) > .01) return null
  return { v: 1, year: num(r.year), previousYear: num(r.previousYear), previousNet, net, delta, drivers }
}

export function economicReportSummary(b: BizState): string {
  const r = economicReportOf(b), parts: string[] = []
  if (r) {
    const change = r.delta === 0 ? 'was unchanged' : `${r.delta > 0 ? 'rose' : 'fell'} ${money(Math.abs(r.delta))}`
    parts.push(`Net profit ${change} from ${r.previousYear}.`)
    const drivers = [...r.drivers].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 3)
    if (drivers.length) parts.push(`Largest contributions: ${drivers.map(d => `${d.label.toLowerCase()} ${d.amount >= 0 ? '+' : '−'}${money(Math.abs(d.amount))}`).join('; ')}.`)
  }
  const s = readSupply(b).last
  if (s && s.year === b.last?.year) {
    if (s.inputShortfall > 0) parts.push(`Missing inputs prevented ${Math.round(s.inputShortfall).toLocaleString()} planned units. Stock buffers and supplier diversification can help future years.`)
    if (s.workforceShortfall > 0) parts.push(`Workforce limits prevented ${Math.round(s.workforceShortfall).toLocaleString()} planned units. Training helps qualification gaps; expansion still needs workers.`)
    if (s.contractSaving) parts.push(`The supplier contract ${s.contractSaving > 0 ? 'saved' : 'cost an extra'} ${money(Math.abs(s.contractSaving))} on delivered purchases versus this year's spot price. That changes paid input cost, not immediate profit on stock still held.`)
    if ((s.trainingRecovery ?? 0) + (s.automationRecovery ?? 0) > 0) parts.push(`Paid training restored ${((s.trainingRecovery ?? 0) * 100).toFixed(1)} percentage points of workforce coverage; automation restored ${((s.automationRecovery ?? 0) * 100).toFixed(1)}. These benefits fade without reinvestment and do not replace missing materials.`)
    if (s.storageCost + s.spoilageCost > 0) parts.push(`Input storage and spoilage cost ${money(s.storageCost + s.spoilageCost)}, already included in this year's accounts.`)
  }
  return parts.join(' ')
}

export function economicReportDetails(b: BizState): string[] {
  const r = economicReportOf(b)
  return r ? r.drivers.map(d => `${d.label}: ${d.amount >= 0 ? '+' : '−'}${money(Math.abs(d.amount))} contribution to the change in net profit.`) : []
}

export function economicReportMenu(a: Asset): MenuGroup {
  return { type: 'menu', id: `biz.economicReport.${a.id}`, label: 'Why Profit Changed', emoji: '🔎',
    subtitle: 'Settled accounts, production constraints and cash tied up in inputs',
    children: g => {
      const current = findBusiness(g, a.id)
      if (!current) return []
      const b = readBiz(g, current), s = readSupply(b)
      const texts = [economicReportSummary(b) || 'A comparison appears after two consecutive completed financial years.', ...economicReportDetails(b)]
      if (s.last?.year === b.last?.year && s.last) texts.push(`Raw inputs held: ${Math.round(s.stock).toLocaleString()} units at ${money(s.bookValue)} paid cost. This is not spendable cash. Purchases used ${money(s.last.purchaseCost)} cash; storage ${money(s.last.storageCost)} and spoilage ${money(s.last.spoilageCost)} are already included in costs. Stocks help only while they last; unfilled orders are not booked as revenue.`)
      return texts.map((text, i) => ({ type: 'info' as const, id: `biz.economicReport.${a.id}.${i}`, text }))
    } }
}
