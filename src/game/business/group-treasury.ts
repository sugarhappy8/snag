// A custodial cash pool, not a duplicate asset: the money lives in one division's ledger.
import { firmCash, firmPurse, moveCash } from '../cash'
import type { Why } from '../kernel/ledger'
import type { GameState } from '../types'
import { boardView } from './board-state'
import { reserveDollars, runningCosts } from './board-vote'
import { movableCash, treasuryOf } from './conglomerate-actions'
import type { Group, GroupMember } from './conglomerate-state'
import { earmarkedCash } from './gamestudio'
import { money } from './util'

export function divisionBuffer(g: GameState, x: GroupMember): number {
  return Math.ceil(earmarkedCash(x.a) + Math.max(reserveDollars(x.b, boardView(g, x.a, x.b)), runningCosts(x.b)) + (x.b.manager?.salary ?? 0))
}
export function treasurySpare(g: GameState, x: GroupMember): number {
  return Math.max(0, Math.min(movableCash(g, x), Math.floor(x.b.cash - divisionBuffer(g, x))))
}
export function transferGroupCash(g: GameState, from: GroupMember, to: GroupMember, n: number): void {
  moveCash(g, firmPurse(from.b, from.a.id), firmPurse(to.b, to.a.id), n, 'inject')
  // Cash is always face value, including in a listed subsidiary.
  from.b.valuation = Math.max(0, from.b.valuation - n); to.b.valuation += n
  for (const x of [from, to]) if (x.b.public && x.b.sharesOut > 0) x.b.sharePrice = x.b.valuation / x.b.sharesOut
}
/** Called after settlement and again before allocation; no income/tax is booked twice. */
export function sweepGroupTreasury(g: GameState, grp: Group): string[] {
  const custodian = treasuryOf(grp)
  if (custodian.m.own < .999) return []
  grp.core.treasuryId = custodian.a.id
  let swept = 0
  for (const x of grp.members) {
    if (x === custodian) continue
    const amount = treasurySpare(g, x)
    if (!amount) continue
    transferGroupCash(g, x, custodian, amount); swept += amount
  }
  return swept ? [`Swept ${money(swept)} of division surplus into group cash holdings at ${custodian.a.name}. Operating buffers, debt and committed projects stay funded; nothing was paid to your personal account.`] : []
}

/**
 * Spend only uncommitted shareholder cash; caller has already checked affordability. `why` names who is paid: by default the cash goes to
 * the firms' pool (a new division's opening cash is a constructor value, so it never reaches a firm account).
 */
export function spendGroupTreasury(g: GameState, grp: Group, amount: number, why: Why = { reason: 'inject', with: 'pool:firms' }): boolean {
  if (!Number.isFinite(amount) || amount <= 0 || grp.members.reduce((s, x) => s + treasurySpare(g, x), 0) < amount) return false
  let left = amount
  for (const x of [...grp.members].sort((a, b) => treasurySpare(g, b) - treasurySpare(g, a))) {
    const take = Math.min(left, treasurySpare(g, x))
    firmCash(g, x.b, -take, why, x.a.id); x.b.valuation = Math.max(0, x.b.valuation - take)
    if (x.b.public && x.b.sharesOut > 0) x.b.sharePrice = x.b.valuation / x.b.sharesOut
    left -= take
    if (left <= 0) break
  }
  return true
}
