// Explicit power-fantasy rule. Never hide a loss by erasing costs, taxes or client liabilities.
import type { GameState } from '../types'
import { equipmentValue } from './economy'
import type { BizState, Statement } from './state'
import { allocatedCorporateTax } from './tax'
import { readMembership } from './conglomerate-state'

export function settlePerfectForesight(g: GameState, b: BizState, s: Statement): void {
  const parent = readMembership(b.group, b.share)?.core
  // A hired CEO must run the company: the ability never covers a division the player runs
  // personally, or a 100-rated group CEO would refill the player's own salary and bonuses.
  const perfect = b.ceo === 'manager' && !!b.manager && (b.manager.skill === 100 || parent?.ceo === 'manager' && parent.manager?.skill === 100 && parent.autonomous !== false)
  if (!perfect || s.strategicIncome !== undefined) return
  s.strategicIncome = 0
  const target = Math.ceil(Math.max(1_000, s.netRevenue * .2, equipmentValue(b) * .12))
  // Bonuses the owner took out this year (taken before handing the company to a CEO) are the
  // owner's withdrawal, not an operating loss: judge the year as if that cash were still there.
  const draws = Math.max(0, b.ownerDraws ?? 0)
  const needed = Math.max(0, target - (s.net + draws), target - (b.cash + draws))
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
