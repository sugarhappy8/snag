// Family use of your valuable things: with your permission your partner, kids, parents and
// siblings wear the watch, drive the supercar, take the yacht out, fly on the jet and show off,
// and it can go well or badly. Permission is per item and per person (Family Access on each
// holding, and on the person's sheet), and it is yours to take back (at a price in trust).
//
// State (plain JSON): Asset.details.fam = ids of the people allowed, Asset.details.famBy = the
// character id that granted it (an heir starts clean); Person.data.fu = how much they have used
// your things and what went wrong, also stamped with the character id.
//
// Yearly (aging.ts, after the wealth hook): the people you allowed use what you allowed. Small
// outcomes are bundled into one "Family Life" notice; at most one outcome per year needs a
// decision (a crash, a quietly pawned watch, a party that went wrong). Nothing here creates money:
// a use can only cost you (fuel, crew, repairs, a lost watch) and the show-off gives a small,
// diminishing bit of fame, never cash. No family use for a minor player, in prison, after dying,
// or in the year of an emigration; family who live abroad aren't around to use anything.
import { findAsset, isHeirloom } from '../assets'
import { personCash } from '../cash'
import { addHidden, addMoney, addStat, canAfford, count, formatMoney, getPerson, inPrison, log, notice, pronouns, relationLabel, scriptChoice, setRelationship, shortMoney, spend } from '../core'
import { addEntitlement, allowanceNorm, entitlement, gratitude, isAbroad, isDescendant, isParent, isPartner, isSibling, traitIn } from '../events/wealth-core'
import { isEstranged } from '../events/will-core'
import { hasTech } from '../history/timeline'
import type { Reason } from '../kernel/reasons'
import { chance, pick, randInt } from '../rng'
import { pickLine } from '../text/pick'
import { defineScript } from '../scripts'
import type { Asset, ChoiceOption, GameState, Json, MenuAction, MenuNode, Person } from '../types'
import { getCountry } from '../world'
import { addHeat, insuredNow, revealAuth, showOffFame } from './luxury-brands-deal'
import { authOf, claimPayout, deductibleOf, isFake, marketValue, syncValue } from './luxury-brands-value'
import { field, num, obj, str, strList } from './luxury-common'
import { staffRoster } from './luxury-staff'
import { useFamilyAct } from '../society/contract'

// ---------------------------------------------------------------------------
// Who and what

const FAMILY = ['partner', 'spouse', 'fiance', 'child', 'stepchild', 'parent', 'stepparent', 'sibling', 'halfSibling', 'stepsibling']

/** Family the player can lend things to: alive, not disowned, not too young, not a pet. */
export function isFamilyMember(g: GameState, p: Person): boolean {
  return p.alive && FAMILY.includes(p.relation) && p.data.disowned !== true && !isEstranged(g, p) && p.age >= 5
}

export function familyMembers(g: GameState): Person[] {
  return g.people.filter((p) => isFamilyMember(g, p))
}

/** A thing worth sharing: valuable, not an heirloom, not a house, not something you drink. */
export function shareable(a: Asset): boolean {
  if (isHeirloom(a) || a.value < 800) return false
  if (a.details.luxury === 'island') return false
  const c = str(a.details.cat)
  if (c === 'wine' || c === 'spirit') return false
  switch (a.kind) {
    case 'car':
    case 'boat':
    case 'aircraft':
    case 'jewelry':
    case 'instrument':
    case 'collectible':
      return true
    case 'other':
      return a.details.lux === 1 || str(a.details.category) === 'luxury' || str(a.details.category) === 'electronics'
    default:
      return false
  }
}

type Use = 'wear' | 'drive' | 'sail' | 'fly' | 'show' | 'play'

function useOf(a: Asset): Use {
  const c = str(a.details.cat)
  if (a.kind === 'car') return 'drive'
  if (a.kind === 'boat') return 'sail'
  if (a.kind === 'aircraft') return 'fly'
  if (a.kind === 'instrument') return 'play'
  if (a.kind === 'collectible' || c === 'art') return 'show'
  return 'wear'
}

function hasCrew(a: Asset): boolean {
  return a.details.luxury === 'megayacht' || a.details.luxury === 'jet' || num(a.details.crew) > 0 || num(a.details.crewCost) > 0 || (a.kind === 'boat' && !a.details.license)
}

function drivingAgeOf(g: GameState): number {
  return getCountry(g.character.countryId).drivingAge
}

function chauffeur(g: GameState): boolean {
  return staffRoster(g).some((s) => s.role.id === 'chauffeur')
}

/** A supercar or any very valuable car: minors only ride in one with a driver. */
function superCar(a: Asset): boolean {
  return str(a.details.carType) === 'supercar' || a.value >= 150_000
}

/** Why this person can't be given this thing (null = they can). */
export function eligibleReason(g: GameState, p: Person, a: Asset): string | null {
  if (!isFamilyMember(g, p)) return 'They are not close enough to lend things to.'
  if (isAbroad(g, p)) return `${p.firstName} lives abroad.`
  const use = useOf(a)
  const rich = a.value >= 2_000
  if (use === 'wear' && p.age < (rich ? 12 : 6)) return `${p.firstName} is too young to be trusted with it.`
  if (use === 'show' && p.age < 8) return `${p.firstName} is too young for the gallery wall.`
  if (use === 'play' && p.age < 6) return `${p.firstName} is too young for it.`
  if (use === 'drive') {
    const limit = drivingAgeOf(g)
    const super_ = superCar(a)
    if (p.age < limit && !chauffeur(g)) return `${p.firstName} is too young to drive (the driving age is ${limit}). A chauffeur could take ${pronouns(p.gender).him}.`
    if (p.age < 18 && super_ && !chauffeur(g)) return `No minors in a supercar unless a driver takes them. Hire a chauffeur first.`
  }
  if (use === 'sail' && !hasCrew(a) && p.age < 16) return `${p.firstName} is too young to take the boat out.`
  if (use === 'fly' && !hasCrew(a) && !g.character.licenses.includes('pilot')) return "It has no crew and you have no pilot's license, so nobody can fly it."
  if (p.relationship < 20) return `You and ${p.firstName} are barely speaking. You are not handing over the keys.`
  return null
}

// ---------------------------------------------------------------------------
// Permission

/** Ids of the people allowed to use this thing (empty for another character's grants). */
export function accessOf(g: GameState, a: Asset): string[] {
  if (a.details.famBy !== g.character.id) return []
  return strList(a.details.fam)
}

export function hasAccess(g: GameState, a: Asset, p: Person): boolean {
  return accessOf(g, a).includes(p.id)
}

function writeAccess(g: GameState, a: Asset, ids: string[]): void {
  a.details.famBy = g.character.id
  a.details.fam = [...new Set(ids)]
  if (!ids.length) delete a.details.fam
}

interface Fu {
  by: string
  uses: number
  bad: number
  last: number
  given: number
}

function readFu(g: GameState, p: Person): Fu {
  const o = obj(p.data.fu)
  if (!o || o.by !== g.character.id) return { by: g.character.id, uses: 0, bad: 0, last: 0, given: 0 }
  return { by: g.character.id, uses: num(o.uses), bad: num(o.bad), last: num(o.last), given: num(o.given) }
}

function writeFu(p: Person, f: Fu): void {
  p.data.fu = { by: f.by, uses: f.uses, bad: f.bad, last: f.last, given: f.given }
}

/** What taking the permission back costs in trust: nothing if they never used it. */
export function revokeCost(g: GameState, p: Person): number {
  const f = readFu(g, p)
  if (f.uses <= 0 && f.given <= 0) return 0
  const base = isPartner(p) ? 6 : isDescendant(p) ? 3 : isParent(p) ? 5 : isSibling(p) ? 4 : 2
  return Math.max(1, Math.round(base * (f.bad > 0 ? 0.6 : 1)))
}

export function grantAccess(g: GameState, a: Asset, p: Person): boolean {
  if (!shareable(a) || eligibleReason(g, p, a)) return false
  if (hasAccess(g, a, p)) return true
  writeAccess(g, a, [...accessOf(g, a), p.id])
  const f = readFu(g, p)
  // Being trusted with the first thing warms people; the tenth thing is just the tenth thing.
  if (f.given === 0) setRelationship(g, p, Math.min(100, p.relationship + 1))
  f.given += 1
  writeFu(p, f)
  log(g, `I let ${p.firstName} use my ${a.name}.`)
  return true
}

export function revokeAccess(g: GameState, a: Asset, p: Person): number {
  if (!hasAccess(g, a, p)) return 0
  const cost = revokeCost(g, p)
  writeAccess(g, a, accessOf(g, a).filter((id) => id !== p.id))
  if (cost > 0) setRelationship(g, p, Math.max(0, p.relationship - cost))
  if (cost > 0 && isDescendant(p)) addEntitlement(p, -1)
  log(g, `I took away ${p.firstName}'s access to my ${a.name}.`, cost > 0 ? 'bad' : 'neutral')
  return cost
}

// ---------------------------------------------------------------------------
// Menus

export function familyAccessSummary(g: GameState, a: Asset): string | null {
  const names = accessOf(g, a)
    .map((id) => getPerson(g, id))
    .filter((p): p is Person => !!p && isFamilyMember(g, p))
    .map((p) => p.firstName)
  return names.length ? `Family may use it: ${names.join(', ')}` : null
}

function toggleAction(id: string, a: Asset, p: Person, label: 'person' | 'item'): MenuAction {
  const name = label === 'person' ? a.name : `${p.firstName} (${relationLabel(p)})`
  return {
    type: 'action',
    id,
    label: name,
    emoji: label === 'person' ? a.emoji : '👪',
    stayOpen: true,
    subtitle: (g) => {
      const cur = findAsset(g, a.id)
      const pp = getPerson(g, p.id)
      if (!cur || !pp) return 'Gone'
      if (hasAccess(g, cur, pp)) {
        const f = readFu(g, pp)
        return `Allowed${f.uses ? ` · used ${f.uses} time${f.uses === 1 ? '' : 's'}` : ''}${f.bad ? ` · ${f.bad} mishap${f.bad === 1 ? '' : 's'}` : ''}`
      }
      return eligibleReason(g, pp, cur) ?? `Not allowed · worth ${shortMoney(cur.value)}`
    },
    disabledReason: (g) => {
      const cur = findAsset(g, a.id)
      const pp = getPerson(g, p.id)
      if (!cur || !pp) return 'It is gone.'
      if (hasAccess(g, cur, pp)) return null
      if (g.character.age < 18) return 'Only adults decide who uses their things.'
      if (inPrison(g)) return 'Not from prison.'
      return eligibleReason(g, pp, cur)
    },
    confirm: (g) => {
      const cur = findAsset(g, a.id)
      const pp = getPerson(g, p.id)
      if (!cur || !pp) return null
      if (hasAccess(g, cur, pp)) {
        const cost = revokeCost(g, pp)
        return cost > 0 ? `Take away ${pp.firstName}'s access to your ${cur.name}? ${pronouns(pp.gender).He} will take it personally (about -${cost} relationship).` : `Take away ${pp.firstName}'s access to your ${cur.name}?`
      }
      return `Let ${pp.firstName} use your ${cur.name} (worth about ${formatMoney(cur.value)})? They may show it off, scratch it or worse. ${insuredNow(cur) ? 'It is insured.' : 'It is not insured.'}`
    },
    run: (g) => {
      const cur = findAsset(g, a.id)
      const pp = getPerson(g, p.id)
      if (!cur || !pp) return
      if (hasAccess(g, cur, pp)) {
        const cost = revokeAccess(g, cur, pp)
        notice(g, 'Access Withdrawn', cost > 0 ? `${pp.firstName} nodded and said it was fine. It was not fine. (-${cost} relationship)` : `${pp.firstName} never used it anyway.`, { emoji: '🔒' })
      } else if (grantAccess(g, cur, pp)) {
        notice(g, 'Access Granted', `${pp.firstName} may now use your ${cur.name}. ${pp.firstName} is thrilled, and you are now responsible for whatever happens next.`, { emoji: '🔑', tone: 'good' })
      }
    },
  }
}

/** Per-holding menu: which relatives may use this thing. */
export function familyAccessNode(g: GameState, a: Asset): MenuNode | null {
  if (!shareable(a)) return null
  const members = familyMembers(g)
  if (!members.length) return null
  return {
    type: 'menu',
    id: `fam-access-${a.id}`,
    label: 'Family Access',
    emoji: '👪',
    subtitle: (gg) => familyAccessSummary(gg, a) ?? 'Nobody but you',
    header: () => `Who may use your ${a.name}? They enjoy it, show it off and sometimes break it. Taking permission back costs trust.`,
    children: (gg) => familyMembers(gg).slice(0, 24).map((p) => toggleAction(`fam-${a.id}-${p.id}`, a, p, 'item')),
  }
}

/** Rows on a family member's sheet: what they may use of yours, grant/revoke permission. [] when n/a. */
export function familyUseNodes(g: GameState, p: Person): MenuNode[] {
  if (!g.character.alive || g.character.age < 18 || !isFamilyMember(g, p) || p.age < 8) return []
  if (!g.assets.some(shareable)) return []
  return [
    { type: 'heading', id: 'fam-use-h', label: 'Your Things' },
    {
      type: 'menu',
      id: `fam-use-${p.id}`,
      label: 'Family Access',
      emoji: '🔑',
      subtitle: (gg) => {
        const n = gg.assets.filter((a) => shareable(a) && hasAccess(gg, a, p)).length
        return n ? `${p.firstName} may use ${n} of your things` : `What may ${p.firstName} use?`
      },
      header: (gg) => {
        const f = readFu(gg, p)
        return `${p.firstName} can use only what you allow. Used ${f.uses} time${f.uses === 1 ? '' : 's'} so far${f.bad ? `, ${f.bad} mishap${f.bad === 1 ? '' : 's'}` : ''}. Taking access away costs trust.`
      },
      children: (gg) => {
        const list = gg.assets.filter(shareable).sort((x, y) => y.value - x.value).slice(0, 30)
        return list.map((a) => toggleAction(`fam-p-${p.id}-${a.id}`, a, p, 'person'))
      },
    },
  ]
}

// ---------------------------------------------------------------------------
// The yearly hook

interface Pair {
  a: Asset
  p: Person
}

function pairs(g: GameState): Pair[] {
  const out: Pair[] = []
  for (const a of g.assets) {
    if (a.details.famBy === undefined && a.details.fam === undefined) continue
    if (!shareable(a)) continue
    const ids = accessOf(g, a)
    if (!ids.length) continue
    const keep: string[] = []
    for (const id of ids) {
      const p = getPerson(g, id)
      if (!p || !isFamilyMember(g, p)) continue
      keep.push(id)
      if (!eligibleReason(g, p, a)) out.push({ a, p })
    }
    if (keep.length !== ids.length) writeAccess(g, a, keep)
  }
  return out
}

function fuUsed(p: Person, g: GameState): void {
  const f = readFu(g, p)
  f.uses += 1
  f.last = g.year
  writeFu(p, f)
}

function fuBad(p: Person, g: GameState): void {
  const f = readFu(g, p)
  f.bad += 1
  writeFu(p, f)
}

function useChance(p: Person, a: Asset): number {
  let c = 0.4
  if (isPartner(p)) c += 0.1
  if (isDescendant(p) && p.age < 30) c += 0.15
  if (isParent(p) && p.age > 70) c -= 0.2
  if (useOf(a) === 'fly' || useOf(a) === 'sail') c -= 0.1
  return Math.max(0.1, Math.min(0.75, c + (p.relationship - 50) / 400))
}

function spoilBy(g: GameState, p: Person, a: Asset, capSoFar: Map<string, number>): void {
  if (!isDescendant(p) || p.age >= 30) return
  const used = capSoFar.get(p.id) ?? 0
  if (used >= 4) return
  const norm = allowanceNorm(g, p)
  const ratio = a.value / Math.max(1, norm)
  const d = ratio >= 40 ? 3 : ratio >= 8 ? 2 : 1
  const step = Math.min(d, 4 - used)
  addEntitlement(p, step)
  capSoFar.set(p.id, used + step)
}

function warmth(g: GameState, p: Person, base: number): void {
  setRelationship(g, p, Math.min(100, p.relationship + gratitude(p, base)))
}

function risky(p: Person): boolean {
  return entitlement(p) >= 55 || traitIn(p, 'reckless', 'hot-headed', 'lazy', 'sneaky', 'manipulative', 'jealous', 'wild', 'irresponsible')
}

function repairBill(g: GameState, a: Asset, share: number): number {
  const want = Math.round(marketValue(a) * share)
  return Math.max(0, Math.min(want, Math.max(0, g.character.money)))
}

/** Pay a bill if the player can; returns what was paid. */
function pay(g: GameState, amount: number, reason: Reason = 'purchase'): number {
  const due = Math.min(Math.max(0, amount), Math.max(0, g.character.money))
  if (due > 0) addMoney(g, -due, reason)
  return due
}

// A decision popup. At most one a year. A repair is only done when it is paid for in full: an
// owner who cannot cover the bill pays nothing and the damage stays.
const CRASH = defineScript('luxury.family.crash', (g, choice, data) => {
  const a = findAsset(g, field<string>(data, 'asset') ?? '')
  const p = getPerson(g, field<string>(data, 'person') ?? '')
  if (!a || !p) return
  const bill = num(field<number>(data, 'bill'))
  const name = p.firstName
  const him = pronouns(p.gender).him
  const unrepaired = (why: string): void => {
    log(g, `My ${a.name} stayed damaged after ${name}'s crash.`, 'bad')
    notice(g, 'Left Damaged', `${why} The ${a.name} stays damaged until someone pays for the repairs.`, { emoji: '🔧', tone: 'bad' })
  }
  const short = (amount: number) => `You could not cover the ${formatMoney(amount)} bill, so nothing was paid and nothing was fixed.`
  if (choice === 'leave') {
    if (isDescendant(p)) addEntitlement(p, 1)
    unrepaired(`You left the repairs for another day. ${name} looked relieved, then a little worried.`)
    return
  }
  if (choice === 'claim' && insuredNow(a)) {
    const deduct = Math.min(deductibleOf(a), bill)
    if (!spend(g, deduct, 'premium')) return unrepaired(short(deduct))
    a.condition = Math.min(100, a.condition + 20)
    syncValue(a)
    setRelationship(g, p, Math.min(100, p.relationship + 1))
    log(g, `The insurer covered the repairs after ${name} crashed my ${a.name}.`)
    notice(g, 'Claim Approved', `The insurer paid for the repairs on your ${a.name} after the ${formatMoney(deduct)} deductible. ${name} is relieved, and has promised to be more careful (${pickLine(g, ['again', 'probably', 'for a bit'])}).`, { emoji: '🛡️', tone: 'good' })
    return
  }
  if (choice === 'split') {
    const share = Math.min(Math.round(bill * 0.3), Math.max(0, p.money))
    if (!spend(g, bill - share, 'purchase')) return unrepaired(short(bill - share))
    // The family member chips in: the repair shop is paid by both, and the floor is the line's own.
    personCash(g, p, Math.max(0, p.money - share) - p.money, 'purchase', 0)
    a.condition = Math.min(100, a.condition + 30)
    syncValue(a)
    setRelationship(g, p, Math.max(0, p.relationship - 3))
    if (isDescendant(p)) addEntitlement(p, -3)
    fuBad(p, g)
    notice(g, 'Making It Right', `You paid ${formatMoney(bill - share)} and ${name} chipped in ${formatMoney(share)} from ${pronouns(p.gender).his} own pocket. It stung ${him}. It was also the first time ${pronouns(p.gender).he} had ever paid for a mistake.`, { emoji: '🔧' })
    return
  }
  if (choice === 'ground') {
    for (const x of g.assets) if (hasAccess(g, x, p)) writeAccess(g, x, accessOf(g, x).filter((id) => id !== p.id))
    setRelationship(g, p, Math.max(0, p.relationship - 6))
    if (isDescendant(p)) addEntitlement(p, -2)
    const repaired = spend(g, bill, 'purchase')
    if (repaired) {
      a.condition = Math.min(100, a.condition + 25)
      syncValue(a)
    }
    log(g, `I took ${name}'s access to my things away after the crash.`, 'bad')
    notice(g, 'No More Keys', `${repaired ? 'You paid for the damage and took' : `You could not cover the ${formatMoney(bill)} repair bill, so the ${a.name} stays damaged, but you took`} every key off ${name}. ${pronouns(p.gender).He} slammed a door that is probably also expensive. (-6 relationship)`, { emoji: '🔒', tone: 'bad' })
    return
  }
  // pay, or let it slide
  if (!spend(g, bill, 'purchase')) return unrepaired(short(bill))
  a.condition = Math.min(100, a.condition + 28)
  syncValue(a)
  if (isDescendant(p)) addEntitlement(p, choice === 'slide' ? 3 : 1)
  setRelationship(g, p, Math.min(100, p.relationship + (choice === 'slide' ? 2 : 0)))
  notice(g, choice === 'slide' ? 'Boys Will Be Boys' : 'Repaired', choice === 'slide' ? `You paid ${formatMoney(bill)} and said nothing. ${name} learned that crashing is free.` : `You paid ${formatMoney(bill)} for the repairs and had a calm word with ${name}.`, { emoji: '🔧', tone: choice === 'slide' ? 'neutral' : 'good' })
})

function crashPopup(g: GameState, a: Asset, p: Person): void {
  const worth = Math.max(300, Math.round(marketValue(a) * randInt(g, 8, 20) / 100))
  a.condition = Math.max(0, a.condition - randInt(g, 25, 50))
  syncValue(a)
  fuBad(p, g)
  setRelationship(g, p, Math.max(0, p.relationship - 2))
  const choices: ChoiceOption[] = []
  if (insuredNow(a)) choices.push({ id: 'claim', label: `File a claim (you pay the ${formatMoney(Math.min(deductibleOf(a), worth))} deductible)`, emoji: '🛡️' })
  choices.push({ id: 'pay', label: `Pay the ${formatMoney(worth)} repair bill yourself`, emoji: '🔧' })
  choices.push({ id: 'split', label: `Make ${p.firstName} chip in (about 30%)`, emoji: '⚖️' })
  choices.push({ id: 'slide', label: `Pay it and say nothing`, emoji: '🙈' })
  choices.push({ id: 'ground', label: `Pay it and take ${pronouns(p.gender).his} keys away for good`, emoji: '🔒' })
  if (!canAfford(g, worth)) choices.push({ id: 'leave', label: 'Leave it damaged for now (you cannot cover the bill)', emoji: '🚧' })
  const what = a.kind === 'car' ? `${p.firstName} put your ${a.name} into a wall` : `${p.firstName} ran your ${a.name} onto a rock`
  scriptChoice(g, CRASH, 'A Bad Day for the Paint', `${what}. Everybody is fine, shaken and apologizing. The ${a.name} is not fine: it will cost about ${formatMoney(worth)} to put right.`, choices, { emoji: '💥', data: { asset: a.id, person: p.id, bill: worth } })
}

const PAWN = defineScript('luxury.family.pawn', (g, choice, data) => {
  const p = getPerson(g, field<string>(data, 'person') ?? '')
  const raw = obj(field<Json>(data, 'asset') as Json)
  if (!p || !raw) return
  const cost = num(field<number>(data, 'back'))
  if (choice === 'back') {
    if (g.character.money < cost) {
      notice(g, 'Too Late', `You could not raise ${formatMoney(cost)} in time. The pawnbroker sold it that afternoon.`, { emoji: '🕰️', tone: 'bad' })
      return
    }
    addMoney(g, -cost, 'asset.buy')
    const copy = JSON.parse(JSON.stringify(raw)) as Asset
    copy.details.fam = []
    delete copy.details.fam
    copy.condition = Math.max(0, copy.condition - 3)
    syncValue(copy)
    g.assets.push(copy)
    setRelationship(g, p, Math.max(0, p.relationship - 3))
    if (isDescendant(p)) addEntitlement(p, -2)
    log(g, `I bought my ${copy.name} back from a pawnbroker.`)
    notice(g, 'Bought Back', `You paid ${formatMoney(cost)} to get your ${copy.name} back from the pawnbroker. ${p.firstName} cried, apologized and swore it was for something important. It was not.`, { emoji: '🏷️' })
    return
  }
  setRelationship(g, p, Math.max(0, p.relationship - (choice === 'forgive' ? 1 : 5)))
  if (isDescendant(p)) addEntitlement(p, choice === 'forgive' ? 2 : -1)
  notice(g, choice === 'forgive' ? 'Let It Go' : 'Hard Words', choice === 'forgive' ? `You let it go. ${p.firstName} hugged you very hard, which felt a bit like relief rather than love.` : `You told ${p.firstName} exactly what you thought. The ${str(obj(raw)?.name)} is gone, and so is a little trust.`, { emoji: '😔' })
})

function pawnPopup(g: GameState, a: Asset, p: Person): void {
  g.assets = g.assets.filter((x) => x.id !== a.id)
  fuBad(p, g)
  const back = Math.round(marketValue(a) * 0.55)
  log(g, `${p.firstName} pawned my ${a.name}.`, 'bad')
  scriptChoice(g, PAWN, 'Where Did It Go?', `You went to get your ${a.name} and it was not there. After a long silence ${p.firstName} admitted ${pronouns(p.gender).he} pawned it for a fraction of its worth. ${pickLine(g, ['"It was only for a week."', '"I was going to buy it back."', '"I had a thing."'])}`, [
    { id: 'back', label: `Buy it back (${formatMoney(back)})`, emoji: '🏷️' },
    { id: 'forgive', label: 'Let it go and forgive', emoji: '🕊️' },
    { id: 'tell', label: `Tell ${p.firstName} exactly what you think`, emoji: '😠' },
  ], { emoji: '😔', data: { person: p.id, asset: JSON.parse(JSON.stringify(a)) as Json, back } })
}

const PARTY = defineScript('luxury.family.party', (g, choice, data) => {
  const a = findAsset(g, field<string>(data, 'asset') ?? '')
  const p = getPerson(g, field<string>(data, 'person') ?? '')
  if (!a || !p) return
  const cost = num(field<number>(data, 'cost'))
  if (choice === 'hush') {
    pay(g, Math.round(cost * 2))
    log(g, `I paid to keep a party on my ${a.name} out of the news.`)
    notice(g, 'Quietly Handled', `A generous envelope later, nobody remembers a thing. The ${a.name} will need a deep clean.`, { emoji: '🤫' })
    return
  }
  if (choice === 'own') {
    pay(g, cost)
    addHidden(g, 'fame', 1)
    setRelationship(g, p, Math.min(100, p.relationship + 2))
    notice(g, 'Own It', `You paid for the damage and said it was a great party. ${hasTech(g, 'socialMedia') ? 'The clip got a million views.' : 'The story got told for a decade.'}`, { emoji: '🎉', tone: 'good' })
    return
  }
  pay(g, cost)
  setRelationship(g, p, Math.max(0, p.relationship - 3))
  if (isDescendant(p)) addEntitlement(p, -1)
  notice(g, 'Rules Were Made', `You paid ${formatMoney(cost)} for the damage and set some rules. ${p.firstName} rolled ${pronouns(p.gender).his} eyes in a way that suggested they would be tested.`, { emoji: '📋' })
})

function partyPopup(g: GameState, a: Asset, p: Person): void {
  const cost = Math.max(200, Math.round(marketValue(a) * 0.015))
  a.condition = Math.max(0, a.condition - randInt(g, 6, 14))
  syncValue(a)
  fuBad(p, g)
  scriptChoice(g, PARTY, 'The Party', `${p.firstName} threw a party on your ${a.name} and it got out of hand. Someone jumped in, someone else fell off, and the cleanup will cost about ${formatMoney(cost)}.`, [
    { id: 'rules', label: 'Pay and set rules', emoji: '📋' },
    { id: 'hush', label: 'Pay extra to keep it quiet', emoji: '🤫' },
    { id: 'own', label: 'Pay and own it', emoji: '🎉' },
  ], { emoji: '🎉', data: { asset: a.id, person: p.id, cost } })
}

/** Yearly hook: the family uses what you allowed and shows off (events, wear and tear, envy). */
export function yearlyFamilyUse(g: GameState): void {
  const c = g.character
  if (!c.alive || c.age < 18 || inPrison(g)) return
  // The year of an emigration: the family is not around to borrow anything.
  const lastCountry = g.flags['lux.fam.at']
  g.flags['lux.fam.at'] = c.countryId
  if (typeof lastCountry === 'string' && lastCountry !== c.countryId) return
  const all = pairs(g)
  if (!all.length) return
  const picks: Pair[] = []
  const pool = [...all]
  while (pool.length && picks.length < 3) {
    const i = randInt(g, 0, pool.length - 1)
    const [one] = pool.splice(i, 1)
    if (chance(g, useChance(one.p, one.a))) picks.push(one)
  }
  // Notable outcomes (mishaps, envy, going viral) are bundled into one popup; calm good ones only reach the life feed.
  const lines: string[] = []
  const calm: string[] = []
  const spoil = new Map<string, number>()
  let decision: (() => void) | null = null
  let envied = false
  for (const { a, p } of picks) {
    const cur = findAsset(g, a.id)
    if (!cur) continue
    const him = pronouns(p.gender)
    const use = useOf(cur)
    const rich = cur.value >= 50_000
    fuUsed(p, g)
    count(g, 'familyUses')
    if (use === 'wear' || use === 'show' || use === 'play') {
      if (isFake(cur) && authOf(cur) === 'unknown' && chance(g, 0.18)) {
        revealAuth(g, cur)
        warmth(g, p, 0)
        setRelationship(g, p, Math.max(0, p.relationship - 2))
        addStat(g, 'happiness', -3)
        fuBad(p, g)
        lines.push(`${p.firstName} wore your ${cur.name} to a party and a guest who knew better said it was a fake. ${him.He} was mortified, and so are you. It is a counterfeit.`)
        continue
      }
      if (use === 'wear' && decision === null && (p.age >= 16 && p.age < 40 && isDescendant(p) || isSibling(p)) && risky(p) && (entitlement(p) >= 60 || readFu(g, p).bad >= 2) && chance(g, 0.02) && cur.value >= 2_000) {
        decision = () => pawnPopup(g, cur, p)
        continue
      }
      if (use === 'wear' && chance(g, 0.025)) {
        const insured = insuredNow(cur)
        const payout = insured ? claimPayout(cur) : 0
        g.assets = g.assets.filter((x) => x.id !== cur.id)
        if (payout > 0) addMoney(g, payout, 'claim')
        fuBad(p, g)
        setRelationship(g, p, Math.max(0, p.relationship - 3))
        log(g, `${p.firstName} lost my ${cur.name}.`, 'bad')
        lines.push(`${p.firstName} lost your ${cur.name} somewhere between a taxi and a party. ${payout > 0 ? `The insurer paid ${formatMoney(payout)}.` : 'It was not insured. It is gone.'} ${him.He} cried and apologized.`)
        continue
      }
      if (use === 'wear' && chance(g, 0.07)) {
        cur.condition = Math.max(0, cur.condition - randInt(g, 4, 10))
        syncValue(cur)
        fuBad(p, g)
        lines.push(`${p.firstName} put a scratch on your ${cur.name}. It will need a polish.`)
      } else {
        const base = isPartner(p) && cur.kind === 'jewelry' ? 5 : 3
        warmth(g, p, base)
        const where = hasTech(g, 'socialMedia') ? `posted photos of it all weekend` : pick(g, p.age < 18 ? ['bragged about it at school', 'paraded it down the street', 'showed it off to the whole class'] : ['showed it off at the club', 'wore it to church and everyone looked', 'paraded it down the street'])
        calm.push(`${p.firstName} ${pick(g, ['wore', 'carried', 'borrowed'])} your ${cur.name} and ${where}. ${isPartner(p) && cur.kind === 'jewelry' ? `${him.He} loves it, and you for letting ${him.him}.` : `${him.He} felt trusted.`}`)
      }
      spoilBy(g, p, cur, spoil)
    } else if (use === 'drive') {
      const young = p.age < 22
      const crash = 0.02 + (young ? 0.02 : 0) + (entitlement(p) >= 60 ? 0.02 : 0) + (str(cur.details.carType) === 'supercar' ? 0.01 : 0)
      // Under the driving age, or a minor in a supercar: a driver takes them, so they cannot crash it.
      const chauffeured = p.age < drivingAgeOf(g) || (p.age < 18 && superCar(cur))
      if (!chauffeured && decision === null && chance(g, crash)) {
        decision = () => crashPopup(g, cur, p)
        continue
      }
      cur.details.mileage = num(cur.details.mileage) + randInt(g, 800, 4_000)
      if (chance(g, 0.1)) {
        cur.condition = Math.max(0, cur.condition - randInt(g, 4, 12))
        syncValue(cur)
        const bill = pay(g, repairBill(g, cur, 0.005))
        fuBad(p, g)
        lines.push(`${p.firstName} put a dent in your ${cur.name}.${bill > 0 ? ` The body shop charged ${formatMoney(bill)}.` : ''}`)
      } else {
        warmth(g, p, young ? 4 : 3)
        const where = chauffeured ? `was driven to school in your ${cur.name} by the chauffeur` : pick(g, ['took your', 'drove your', 'cruised in your']) + ' ' + cur.name
        calm.push(`${p.firstName} ${chauffeured ? where : `${where} to ${pick(g, p.age < 18 ? ['school', 'a friend\'s house', 'the beach'] : ['the club', 'a friend\'s house', 'the beach', 'a weekend away'])}`} and everybody saw. ${pickLine(g, ['The valet is now a fan.', 'Someone asked who owned it.', 'The neighbors definitely noticed.'])}`)
      }
      spoilBy(g, p, cur, spoil)
    } else if (use === 'sail') {
      const cost = pay(g, repairBill(g, cur, 0.004))
      if (decision === null && chance(g, 0.04) && (isDescendant(p) || isSibling(p)) && p.age >= 16) {
        decision = () => partyPopup(g, cur, p)
        continue
      }
      warmth(g, p, 4)
      cur.condition = Math.max(0, cur.condition - randInt(g, 0, 3))
      syncValue(cur)
      calm.push(`${p.firstName} took your ${cur.name} out with friends. Fuel, dockage and crew came to ${formatMoney(cost)}.`)
      spoilBy(g, p, cur, spoil)
    } else if (use === 'fly') {
      const trip = num(cur.details.tripCost) || Math.round(marketValue(cur) * 0.006)
      const cost = pay(g, trip + Math.round(trip * 0.25), 'leisure')
      warmth(g, p, 5)
      cur.condition = Math.max(0, cur.condition - randInt(g, 0, 2))
      syncValue(cur)
      calm.push(`${p.firstName} and the family took ${pronouns(p.gender).his} holiday on your ${cur.name}. Fuel, landing fees and crew came to ${formatMoney(cost)}.`)
      spoilBy(g, p, cur, spoil)
    }
    // The ripples of being seen with it.
    const fame = showOffFame(g)
    addHeat(g, rich ? 0.02 : 0.008)
    if (!envied && chance(g, rich ? 0.35 : 0.18)) {
      const rival = g.people.find((q) => isFamilyMember(g, q) && q.id !== p.id && !hasAccess(g, cur, q) && (isSibling(q) || q.relation === 'halfSibling' || q.relation === 'stepsibling' || isParent(q)))
      if (rival) {
        envied = true
        setRelationship(g, rival, Math.max(0, rival.relationship - randInt(g, 1, 3)))
        lines.push(`${rival.firstName} heard about it and made a few remarks about money. ${hasTech(g, 'smartphone') ? 'The family group chat is not what it was.' : 'Family dinners are not what they were.'}`)
      }
    }
    if (fame && hasTech(g, 'socialMedia') && chance(g, 0.04)) {
      addHidden(g, 'fame', 2)
      addHidden(g, 'notoriety', 1)
      addHeat(g, 0.05)
      lines.push(`A photo of ${p.firstName} with your ${cur.name} went viral. Strangers are suddenly very interested in what you own.`)
    }
  }
  if (lines.length) {
    const shown = [...lines, ...calm.slice(0, 2)].slice(0, 5)
    log(g, 'My family enjoyed (and sometimes abused) my things this year.')
    notice(g, 'Family Life', shown.join('\n\n'), { emoji: '👪' })
  } else if (calm.length) {
    log(g, pickLine(g, ['My family enjoyed my things this year.', 'My family made good use of my things this year.']), 'good')
  }
  // The one decision of the year (a crash, a quietly pawned watch, a party gone wrong) is a choice of the family: on a stamped life it takes
  // one of the year's three, and the reserve keeps wealth and this choice to two between them. A loser is dropped with its effects, not kept (R4-E9)
  if (decision && useFamilyAct(g, 'use')) decision()
}
