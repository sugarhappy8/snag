import { notice } from '../core'
import type { GameState, MenuNode } from '../types'
import { groupAllows, groupBlock } from './conglomerate-actions'
import { groupById, groupValue, liveGroup, saveGroup, syncMembers, type Group } from './conglomerate-state'
import { spendGroupTreasury, treasurySpare } from './group-treasury'
import { clampN, money, pct } from './util'

export function groupBuybackQuote(g: GameState, grp: Group, percent: number) {
  const available = Math.max(0, 1 - grp.core.share - (grp.core.executiveEquity ?? 0) - (grp.core.familyShares ?? []).reduce((s, x) => s + x.share, 0))
  // Retire a fraction of unaffiliated outside holdings, never the owner or vested CEO awards.
  const retired = available * clampN(Number.isFinite(percent) ? percent / 100 : 0, 0, 1)
  const cost = Math.ceil(groupValue(grp) * retired * 1.05)
  const spare = grp.members.reduce((s, x) => s + treasurySpare(g, x), 0)
  const share = retired > 0 ? grp.core.share / (1 - retired) : grp.core.share
  const block = groupBlock(g) ?? (grp.core.share <= 0 ? 'You do not own shares in this family holding.' : available <= .000001 ? 'No unaffiliated outside shares remain; inherited family shares and vested CEO shares are protected.' : !retired || !cost ? 'Choose a positive buyback amount.' : cost > spare ? `Needs ${money(cost)}; group holdings can spare ${money(spare)} after operating reserves.` : null)
  return { available, retired, cost, spare, share, block }
}
export function buyBackGroupShares(g: GameState, id: string, percent: number): boolean {
  const grp = liveGroup(g, id)
  if (!grp || grp.members.length < 2) return false
  const q = groupBuybackQuote(g, grp, percent)
  if (q.block) { notice(g, 'Group Buyback Unavailable', q.block, { emoji: '🔄' }); return false }
  if (!groupAllows(g, grp, { kind: 'capex', by: 'owner', amount: q.cost, label: `Repurchase and retire ${pct(q.retired, 2)} of group shares` })) { saveGroup(g, grp); return false }
  if (!spendGroupTreasury(g, grp, q.cost, 'trade.buy')) return false
  const scale = 1 / (1 - q.retired)
  grp.core.share = q.share
  grp.core.executiveEquity = (grp.core.executiveEquity ?? 0) * scale
  for (const holder of grp.core.familyShares ?? []) holder.share *= scale
  if (grp.core.manager?.equity) grp.core.manager.equity *= scale
  for (const x of grp.members) if (x.b.manager?.groupEquity?.id === id) x.b.manager.groupEquity.share *= scale
  if (grp.core.listing) grp.core.listing.sharesOut = Math.max(1, grp.core.listing.sharesOut * (1 - q.retired))
  syncMembers(grp); saveGroup(g, grp)
  notice(g, 'Group Shares Bought Back', `${grp.core.name} spent ${money(q.cost)} from group holdings, including a 5% tender premium, to retire ${pct(q.retired, 2)} of its shares. Your ownership rises to ${pct(grp.core.share, 2)}. Vested executive shares remain owned and grow proportionally; your personal cash is unchanged.`, { emoji: '🔄', tone: 'good' })
  return true
}
export function groupBuybackNode(id: string): MenuNode {
  return { type: 'action', id: `group.buyback.${id}`, label: 'Buy Back Group Shares', emoji: '🔄',
    subtitle: 'Use group cash to retire outside shares · 5% tender premium',
    disabledReason: g => { const grp = groupById(g, id); return grp ? groupBuybackQuote(g, grp, 1).block : 'Group unavailable.' },
    input: { kind: 'slider', label: 'Percent of unaffiliated outside shares to buy back', min: 1, max: 100, step: 1, unit: '%', defaultValue: () => '10', preview: (g, v) => { const grp = groupById(g, id); if (!grp) return 'Group unavailable.'; const q = groupBuybackQuote(g, grp, v); return q.block ?? `${money(q.cost)} from group cash; your ownership ${pct(grp.core.share, 2)} → ${pct(q.share, 2)}. CEO stakes are not sold.` } },
    confirm: () => 'Spend company cash to retire outside shares? This raises all remaining shareholders’ ownership percentages, including yours. CEO equity is protected.',
    run: (g, input) => { buyBackGroupShares(g, id, Number(input)) } }
}
