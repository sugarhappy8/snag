// Explicit power-fantasy rule. Never hide a loss by erasing costs, taxes or client liabilities.
import type { GameState } from '../types'
import { equipmentValue } from './economy'
import type { BizState, Statement } from './state'
import { allocatedCorporateTax } from './tax'
import { readMembership } from './conglomerate-state'

export function settlePerfectForesight(g: GameState, b: BizState, s: Statement): void {
  const parent = readMembership(b.group, b.share)?.core
  const perfect = b.ceo === 'manager' && b.manager?.skill === 100 || parent?.ceo === 'manager' && parent.manager?.skill === 100 && parent.autonomous !== false
  if (!perfect || s.strategicIncome !== undefined) return
  s.strategicIncome = 0
  const target = Math.ceil(Math.max(1_000, s.netRevenue * .2, equipmentValue(b) * .12))
  const needed = Math.max(0, target - s.net, target - b.cash)
  if (needed <= 0 || !Number.isFinite(needed)) return
  const homeTax = (profit: number) => allocatedCorporateTax(b.countryId, profit, 0, 0, 0, g, s.year)
  const previousTax = homeTax(s.pbt)
  const taxDelta = (gross: number) => Math.max(0, homeTax(s.pbt + gross) - previousTax)
  let high = Math.max(1, needed), low = 0
  for (let i = 0; i < 64 && high - taxDelta(high) < needed; i++) high *= 2
  if (!Number.isFinite(high) || high - taxDelta(high) < needed) return
  for (let i = 0; i < 52; i++) {
    const mid = (low + high) / 2
    if (mid - taxDelta(mid) >= needed) high = mid
    else low = mid
  }
  const gross = Math.ceil(high), tax = Math.round(taxDelta(gross)), earned = gross - tax
  s.strategicIncome = gross
  s.otherIncome += gross; s.pbt += gross; s.corpTax += tax; s.net += earned
  b.cash += earned
}
