import type { GameState, Person, RelationKind } from '../types'
import { addMoney, earnIncome, fullName, log } from '../core'
import { CHARITY, willSlices } from '../events/will-core'
import { allGroups, groupsOf, groupValue, liveGroup, readMembership, saveGroup, syncMembers, type Group } from './conglomerate-state'
import { bizOf, businessAssets, readBiz, type BizState } from './state'
import { refreshValue } from './economy'
import type { SuccessionEstateUnit } from './nepo-inheritance'
import type { FamilyShare } from './family-share-state'
import { money, num, pct } from './util'

const splitUp = (p: Person) => p.data.divorced === true || typeof p.data.exSpouseId === 'string'
const parentLinks = (p: Person) => [p.data.parentId, p.data.childOf, p.otherParentId, ...(Array.isArray(p.data.parentIds) ? p.data.parentIds : [])].filter((x): x is string => typeof x === 'string')

/**
 * Who inherits a late co-owner's stake among the people the game models, in the order an estate
 * passes (spouse, children, parents, siblings), seen from the player's family tree. The player's
 * id stands for the player. An empty list means the heirs are not modeled (an NPC's own husband,
 * wife or children only exist as a name and a count): the stake then leaves the family records.
 * Pure and deterministic.
 */
export function familyStakeHeirs(g: GameState, dead: Person): string[] {
  const me = g.character.id
  const living = (relations: RelationKind[], test: (p: Person) => boolean = () => true) =>
    g.people.filter(x => x.alive && x.id !== dead.id && relations.includes(x.relation) && test(x)).map(x => x.id)
  const ownFamily = dead.data.married === true || num(dead.data.kids) > 0
  const siblings = () => living(['sibling', 'halfSibling'], x => x.relation === 'sibling' || parentLinks(x).includes(dead.id))
  switch (dead.relation) {
    case 'spouse': return [me]
    case 'parent': {
      const partner = splitUp(dead) ? [] : living(['parent'], x => !splitUp(x))
      return partner.length ? partner : [me, ...siblings()]
    }
    case 'stepparent': return living(['parent'], x => dead.data.viaParentId === x.id || dead.data.spouseId === x.id)
    case 'grandparent': {
      const kids = living(['parent'])
      return kids.length ? kids : [me, ...living(['sibling', 'halfSibling'])]
    }
    case 'child':
    case 'stepchild': {
      const kids = living(['grandchild'], x => parentLinks(x).includes(dead.id))
      return kids.length ? kids : ownFamily ? [] : [me]
    }
    case 'grandchild': {
      if (ownFamily) return []
      const parent = living(['child', 'stepchild'], x => parentLinks(dead).includes(x.id))
      return parent.length ? parent : [me]
    }
    case 'sibling':
    case 'halfSibling': {
      if (ownFamily) return []
      const parents = living(['parent'])
      return parents.length ? parents : [me, ...living(['sibling', 'halfSibling'])]
    }
    default: return []
  }
}

/** The living holder, or null when the record names a late or vanished owner (or the charity). */
function livingHolder(g: GameState, id: string): Person | null {
  const p = g.people.find(x => x.id === id)
  return p?.alive ? p : null
}

/**
 * Pays one co-owner's gross slice of a payout. Living relatives get it (dividends net of the tax
 * withheld on NPC income); the will's charity receives it in the open, leaving the economy with a
 * log line; a late owner's slice reaches their modeled heirs (the player's part is ordinary
 * income for a dividend), or their unmodeled heirs outside the family, like any outside holder.
 */
function payHolder(g: GameState, holderId: string, gross: number, income: boolean, what: string): void {
  if (!(gross > 0)) return
  if (holderId === CHARITY) {
    log(g, `${money(gross)} of ${what} went to charity, as the family will directed.`, 'neutral')
    return
  }
  const alive = livingHolder(g, holderId)
  if (alive) { alive.money += gross * (income ? .8 : 1); return }
  const dead = g.people.find(x => x.id === holderId)
  const heirs = dead ? familyStakeHeirs(g, dead) : []
  for (const id of heirs) {
    const part = gross / heirs.length
    if (id === g.character.id) { if (income) earnIncome(g, part); else addMoney(g, part); continue }
    const heir = g.people.find(x => x.id === id)
    if (heir) heir.money += part * (income ? .8 : 1)
  }
}

/**
 * Moves every late or vanished co-owner's stake to their heirs (see familyStakeHeirs). The
 * player's part joins `owner.share`; with no modeled heirs the stake passes to outside holders.
 * Total ownership never changes. Returns true when anything moved.
 */
function settleLateHolders(g: GameState, owner: { share: number; familyShares?: FamilyShare[] }, name: string): boolean {
  const holders = owner.familyShares ?? []
  if (!holders.some(h => h.id !== CHARITY && !livingHolder(g, h.id))) return false
  const kept = new Map<string, number>()
  for (const h of holders) if (h.id === CHARITY || livingHolder(g, h.id)) kept.set(h.id, (kept.get(h.id) ?? 0) + h.share)
  for (const h of holders) {
    if (h.id === CHARITY || livingHolder(g, h.id) || !(h.share > 0)) continue
    const dead = g.people.find(x => x.id === h.id)
    const heirs = dead ? familyStakeHeirs(g, dead) : []
    const who = dead ? fullName(dead) : 'A late co-owner'
    if (!heirs.length) {
      log(g, `${who}'s ${pct(h.share, 1)} of ${name} passed to heirs outside the family; they now count as outside shareholders.`, 'neutral')
      continue
    }
    for (const id of heirs) {
      const part = h.share / heirs.length
      if (id === g.character.id) owner.share = Math.min(1, owner.share + part)
      else kept.set(id, (kept.get(id) ?? 0) + part)
    }
    const names = heirs.map(id => id === g.character.id ? 'me' : fullName(g.people.find(x => x.id === id)!))
    log(g, `${who}'s ${pct(h.share, 1)} of ${name} passed to ${names.join(' and ')} as their heir${heirs.length > 1 ? 's' : ''}.`, 'neutral')
  }
  const next = [...kept].filter(([, share]) => share > 0).map(([id, share]) => ({ id, share }))
  if (next.length) owner.familyShares = next
  else delete owner.familyShares
  return true
}

/**
 * Yearly (and before a succession): late co-owners' stakes pass to their heirs. Covers every way
 * a relative can die, and repairs older saves whose records still name a late owner.
 */
export function settleLateFamilyOwners(g: GameState): void {
  for (const id of new Set(allGroups(g).filter(x => x.core.familyShares?.length).map(x => x.core.id))) {
    const grp = liveGroup(g, id)
    if (grp && settleLateHolders(g, grp.core, grp.core.name)) { syncMembers(grp); saveGroup(g, grp) }
  }
  for (const a of businessAssets(g)) {
    if (!Array.isArray(a.details.familyShares) || !a.details.familyShares.length) continue
    const b = bizOf(g, a)
    if (readMembership(b.group)) continue
    if (settleLateHolders(g, b, a.name)) refreshValue(a, b)
  }
}

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

/** Dividend cash has already left the divisions. Pay each family owner's part once. */
export function payFamilyGroupDividend(g: GameState, grp: Group, groupPayout: number): void {
  for (const holder of grp.core.familyShares ?? []) payHolder(g, holder.id, groupPayout * holder.share, true, `${grp.core.name}'s dividend`)
}

export function payFamilyBusinessProceeds(g: GameState, b: BizState, total: number, income = false): void {
  const m = readMembership(b.group)
  const holders = m?.core.familyShares ?? b.familyShares ?? []
  const what = `the family company's ${income ? 'dividend' : 'sale proceeds'}`
  for (const holder of holders) payHolder(g, holder.id, Math.max(0, total) * holder.share * (m?.own ?? 1), income, what)
}
