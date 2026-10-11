import type { GameState } from '../types'
import { willSlices } from '../events/will-core'
import { groupsOf, groupValue, liveGroup, readMembership, saveGroup, syncMembers, type Group } from './conglomerate-state'
import { bizOf, businessAssets, readBiz, type BizState } from './state'
import { refreshValue } from './economy'
import type { SuccessionEstateUnit } from './nepo-inheritance'

/** Transfer equity, never liquidate the treasury or duplicate divisions into NPC cash. Existing
 * outside shareholders and family co-owners keep their stakes; only the deceased's stake divides.
 */
export function inheritConglomerates(g: GameState, heirId: string, units: SuccessionEstateUnit[]): string[] {
  const lines: string[] = []
  const slices = willSlices(g)
  for (const unit of units) {
    const grp = unit.group ? liveGroup(g, unit.group.id) : null
    const asset = unit.assets[0]
    const solo = !unit.group && asset && Array.isArray(asset.details.familyShares) && asset.details.familyShares.length ? bizOf(g, asset) : null
    if (!grp && !solo?.familyShares?.length) continue
    const ownership = grp?.core ?? solo!
    const deceasedShare = ownership.share
    const holders = new Map((ownership.familyShares ?? []).map(x => [x.id, x.share]))
    const allocations = unit.recipient ? [{ id: unit.recipient.id, pct: 1 }] : slices
    for (const s of allocations) holders.set(s.id, (holders.get(s.id) ?? 0) + deceasedShare * s.pct)
    ownership.share = holders.get(heirId) ?? 0
    holders.delete(heirId)
    ownership.familyShares = [...holders].filter(([, share]) => share > 0).map(([id, share]) => ({ id, share }))
    const ratio = deceasedShare > 0 ? ownership.share / deceasedShare : 0
    if (grp) {
      for (const member of grp.members) member.b.invested *= ratio
      syncMembers(grp); saveGroup(g, grp)
    } else {
      solo!.invested *= ratio
      refreshValue(unit.assets[0], solo!)
    }
    lines.push(`${unit.group?.name ?? unit.assets[0].name} stays intact${grp ? ` with all ${grp.members.length} divisions` : ''}, its management and company cash. You own ${(ownership.share * 100).toFixed(2)}%; the other beneficiaries retain their own shares, not a cash liquidation.`)
  }
  return lines
}

export function familyGroupStake(g: GameState, personId: string): number {
  const grouped = groupsOf(g).reduce((sum, grp) => sum + groupValue(grp) * (grp.core.familyShares?.find(x => x.id === personId)?.share ?? 0), 0)
  return grouped + businessAssets(g).reduce((sum, a) => {
    const b = readBiz(g, a)
    return sum + (!b.group ? b.valuation * (b.familyShares?.find(x => x.id === personId)?.share ?? 0) : 0)
  }, 0)
}

/** Dividend cash has already left the divisions. Pay known family owners their part once. */
export function payFamilyGroupDividend(g: GameState, grp: Group, groupPayout: number): void {
  for (const holder of grp.core.familyShares ?? []) {
    const p = g.people.find(x => x.id === holder.id)
    if (p) p.money += groupPayout * holder.share * .8 // Tax withheld like other NPC income.
  }
}

export function payFamilyBusinessProceeds(g: GameState, b: BizState, total: number, income = false): void {
  const m = readMembership(b.group)
  const holders = m?.core.familyShares ?? b.familyShares ?? []
  for (const holder of holders) {
    const p = g.people.find(x => x.id === holder.id)
    if (p) p.money += Math.max(0, total) * holder.share * (m?.own ?? 1) * (income ? .8 : 1)
  }
}
