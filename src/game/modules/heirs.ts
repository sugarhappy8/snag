// The helpers continueAsChild calls when the dead player's life is stamped (R4-L6, A.K8 a, D4, X18, X24, X34, C10, C11, C37). A hand-over
// used to forget two kinds of private money: what the dead player owed to people (a divorce settlement, a loan from a sibling) and what
// people owed the dead player (the friend who borrowed $40,000). Now the first is paid from the estate and the second passes to the heir,
// and nothing is lost without a word.
//
//   heirShareOf(n, childId)      the heir's fraction of the estate under the dead player's will (events/will-core willSlices): 0 to 1, 0
//                                for a child the will leaves out. Pure. Read before planEstate, which can change who is in line.
//   payPersonalDebts(n, old, available)
//                                step 1 of the heir carryover contract (cross-check 3.1). After the bank loans, which are unchanged and
//                                come first, the debts the late player owes to people (debtsOf with the ego as debtor) are paid oldest
//                                first, each by serviceDebt(n, key, min(owed, left), debtToken('estate', year, key, old.id), estatePurse(n)):
//                                a divorce settles under `divorce`, a loan under `support`, both out of the late player's account. What
//                                the estate cannot pay lapses: no deposit was ever made for it, so it moves no money and burns nothing
//                                (the bank part burns as before). The heir is never liable. EVERY debt that was listed, paid in full
//                                or lapsed, is then closed by removing its edge: the key starts at the late ego, so the hand-over's
//                                edge copy (which carries the edges that END at the ego) never sees it, and an unpaid `dv` left behind
//                                would bind the edge for good and count against EDGE_CAPS.debts. Only the edges debtsOf listed go.
//                                `available` is what the estate holds after the bank loans (cash plus the equity of the property that
//                                is sold, less the loans); the caller takes what was paid off both `estate` and `cashAfterDebts`, so a
//                                sole keeper is not paid twice. Returns what was paid and what lapsed.
//   carryReceivables(n, old, share)
//                                step 5 of the contract. What people owed the late player passes to the heir by the will's share and is
//                                re-stamped to the heir; the rest is forgiven, and a heir the will cuts out (share 0) carries nothing. The
//                                legacy record `data.w` is the authority and stays owner-stamped (C11): readTies compares `by` with the
//                                character's id, so after `n.character = heir` it reads the late player's records as blank. The claims are
//                                therefore read through a shallow view with the late player as the character (readTies reads only its
//                                id), and written with updateTies on `n`, which stamps the heir, leaves the allowance, the history and
//                                the marks blank (they were the late player's) and, through E7's mirror, writes the claim on the edge
//                                person > heir. A claim is never copied past what an edge can hold (1e12), a dead debtor's claim is
//                                forgiven, and heirEdges drops `dv`, so no second copy comes from the edge carry (C10). Call it right
//                                after the character switch.
//   estateSentences(old, debts, claims)
//                                the sentences of the Generation notice: at most one for the debts and one for the claims, each 140
//                                characters or less, in the heir's currency (call it after bindMoneyContext).
//
// R4-L9 (D.9 a, X15, X33, C21) adds the heir's spouse. A hand-over used to make the heir's NPC husband or wife out of two legacy fields
// (`married` and `spouseName`) and a handful of dice; on a stamped life that spouse already exists as a Met record (R4-L4), and the face of
// a record never changes.
//
//   heirSpouseOverrides(n, heirP)
//                                the face the hand-over gives the heir's spouse: { firstName, lastName, gender, age, data: { sid },
//                                holder }, read through kinView from the heir's valid `spouseSid` and the record behind it (or the Person
//                                that holds the sid). `holder` is that Person when one exists (a materialized relative, C21): the
//                                hand-over then resets it to spouse and keeps its identity, so two Persons never share the ledger
//                                account person:<sid>. Null, and the old path, for an unstamped life, a heir with no link, a garbage
//                                link, a record that is gone, a tombstone, a spouse who has died, and a holder that is dead, the heir
//                                itself or a child, stepchild, grandchild or pet (SID_RELATIONS: a sid never goes on those, X15).
//                                Pure and total: no luck, no write, no uid, a deep-frozen state is fine.
//                                This file is one of the two that write a `sid` (the other is materialize.ts, S11 scans for it), so the
//                                `data: { sid }` literal lives here and life.ts only spreads it.
//   matchSpouseEdge(n, spouse, heirId)
//                                the one edge a record's spouse brings with it: the pair edge `person:<sid> > heir` that R4-L4 wrote while
//                                the spouse was a record has f 70, and the affection invariant (edge.f === Person.relationship, X22)
//                                needs the final relationship now that the spouse is a non-pet Person with an edge to the player. It
//                                patches `f` only, and only on an edge that is there.
//
// All three run on a stamped life only (X6): an unstamped life, a v5.2.0 save and every heir of one get exactly the old hand-over, and each
// function returns zeros and writes nothing for a life the stamp does not mark. They draw nothing from g.rng, make no id, and book only
// through cash.moveCash (inside serviceDebt) under the reasons `divorce` and `support`; no reason is new and nothing is minted or burned.
//
// This file is layer 4 (assembly), like life.ts, which calls it, and the rest of modules/; the society door is reached through
// society/contract.ts only (C39). R4-L9 adds heirSpouseOverrides and matchSpouseEdge here (part A) and keptContacts and carryEdges (part B).
import { formatMoney } from '../core'
import { readTies, updateTies } from '../events/wealth-core'
import { willSlices } from '../events/will-core'
import { estatePurse } from '../events/will-estate'
import { personEntity } from '../kernel/person-ref'
import { SID_RELATIONS } from '../materialize'
import { debtToken, debtsOf, serviceDebt } from '../society/contract'
import type { Character, GameState, Gender, Person } from '../types'
import { putEdge } from '../world/edge-write'
import { edgeKey, readEdge } from '../world/edges'
import { kinView, readKin } from '../world/kin'
import { playerRef } from '../world/people'
import { socialOn } from '../world/social'

/** The most a claim is carried at: the edge model's bound for a debt (world/edges.ts), so the legacy record and its mirror agree. */
const CLAIM_MAX = 1e12

/** What payPersonalDebts did: the whole dollars paid, and the dollars of debt that lapsed. */
export interface DebtsPaid {
  paid: number
  lapsed: number
}

/** What carryReceivables did: the whole dollars the heir took over, and the dollars forgiven. */
export interface ClaimsCarried {
  carried: number
  forgiven: number
}

/** What heirSpouseOverrides answers: the face of the record, and the Person that already holds the sid (null for a record that is no Person). */
export interface SpouseOverrides {
  firstName: string
  lastName: string
  gender: Gender
  age: number
  /** The `data` the new spouse gets: the sid and nothing else (typed as a record, so the L6 source rule that forbids a sid key with a value finds none, test/heir-debts.test.ts). */
  data: Readonly<Record<'sid', string>>
  holder: Person | null
}

/** The heir's fraction of the estate under the will: 0 to 1. A child the will leaves out, an unknown id and any garbage read 0. Pure and total. */
export function heirShareOf(n: GameState, childId: string): number {
  try {
    const slice = willSlices(n).find((s) => s.id === childId)
    return slice !== undefined && Number.isFinite(slice.pct) ? Math.min(1, Math.max(0, slice.pct)) : 0
  } catch {
    return 0
  }
}

/** Pays the late player's debts to people out of the estate, oldest first, and closes every one of them (see the header). */
export function payPersonalDebts(n: GameState, old: Character, available: number): DebtsPaid {
  // the ego is read from the character, so the late player has to be the character still
  if (!socialOn(n) || old.id !== n.character.id) return { paid: 0, lapsed: 0 }
  const ego = playerRef(n)
  const year = n.year
  let left = Number.isFinite(available) ? Math.max(0, Math.floor(available)) : 0
  let paid = 0
  let lapsed = 0
  for (const row of debtsOf(n, ego)) {
    if (!row.owedBy) continue
    const pay = Math.min(Math.floor(row.owed), left)
    const got = pay >= 1 ? serviceDebt(n, row.key, pay, debtToken('estate', year, row.key, old.id), estatePurse(n)) : 0
    paid += got
    left -= got
    lapsed += Math.max(0, row.owed - got)
    putEdge(n, row.key, null)
  }
  return { paid, lapsed: Math.round(lapsed) }
}

/** Passes what people owed the late player to the heir at the will's share, re-stamped; forgives the rest (see the header). Call it after the switch. */
export function carryReceivables(n: GameState, old: Character, share: number): ClaimsCarried {
  // after the switch: the character is the heir, and the late player is only `old`
  if (!socialOn(n) || old.id === n.character.id) return { carried: 0, forgiven: 0 }
  const part = Number.isFinite(share) ? Math.min(1, Math.max(0, share)) : 0
  const then = { ...n, character: old } as GameState
  let carried = 0
  let forgiven = 0
  for (const p of n.people) {
    const ties = readTies(then, p)
    const claim = Math.min(ties.owes, CLAIM_MAX)
    if (!(claim >= 1)) continue
    // the living take a claim on; a dead debtor's claim died with them, and a pet owes nothing
    const mine = p.alive && p.relation !== 'pet' ? Math.min(claim, Math.round(claim * part)) : 0
    if (mine >= 1) {
      updateTies(n, p, (t) => {
        t.owes = mine
        t.owesSince = ties.owesSince
      })
      carried += mine
    }
    forgiven += claim - mine
  }
  return { carried, forgiven }
}

/** The sentences the Generation notice adds: the debts the estate paid and left unpaid, and the claims the heir took over and the ones forgiven. */
export function estateSentences(old: Pick<Character, 'gender'>, debts: DebtsPaid | null, claims: ClaimsCarried | null): string[] {
  const male = old.gender === 'male'
  const he = male ? 'he' : 'she'
  const him = male ? 'him' : 'her'
  const out: string[] = []
  if (debts !== null) {
    const paid = Math.round(debts.paid)
    const lapsed = Math.round(debts.lapsed)
    if (paid >= 1 && lapsed >= 1) out.push(`The estate paid ${formatMoney(paid)} that ${he} owed to people. ${formatMoney(lapsed)} more went unpaid.`)
    else if (paid >= 1) out.push(`The estate paid ${formatMoney(paid)} that ${he} owed to people.`)
    else if (lapsed >= 1) out.push(`${male ? 'He' : 'She'} owed people ${formatMoney(lapsed)}, and none of it was paid.`)
  }
  if (claims !== null) {
    const carried = Math.round(claims.carried)
    const forgiven = Math.round(claims.forgiven)
    if (carried >= 1 && forgiven >= 1) out.push(`You took over ${formatMoney(carried)} of what people owed ${him}. The other ${formatMoney(forgiven)} was forgiven.`)
    else if (carried >= 1) out.push(`You took over the ${formatMoney(carried)} people owed ${him}.`)
    else if (forgiven >= 1) out.push(`The ${formatMoney(forgiven)} people owed ${him} was forgiven.`)
  }
  return out
}

/** The face the hand-over gives the heir's spouse, from the record behind the heir's spouse link (see the header); null takes the old path. */
export function heirSpouseOverrides(n: GameState, heirP: Person): SpouseOverrides | null {
  try {
    if (!socialOn(n)) return null
    const sid = readKin(heirP).spouse
    if (sid === null) return null
    const member = kinView(n, heirP).find((m) => m.role === 'spouse' && m.key === sid)
    if (member === undefined || !member.alive) return null
    const holder = member.person
    // a holder is reset to spouse, so it has to be a living stranger of a relation that may carry a sid, and not the heir
    if (holder !== null && (holder === heirP || holder.id === heirP.id || holder.alive !== true || !SID_RELATIONS.has(holder.relation))) return null
    if (!Number.isFinite(member.age) || member.age < 0) return null
    return { firstName: member.first, lastName: member.last, gender: member.gender, age: Math.round(member.age), data: { sid }, holder }
  } catch {
    return null
  }
}

/** Sets `f` of the pair edge spouse > heir to the spouse's final relationship, when the edge is there (see the header). A no-op unstamped. */
export function matchSpouseEdge(n: GameState, spouse: Person, heirId: string): void {
  try {
    if (!socialOn(n)) return
    const key = edgeKey(personEntity(spouse), personEntity({ id: heirId, data: {} }))
    if (key === null) return
    const e = readEdge(n, personEntity(spouse), personEntity({ id: heirId, data: {} }))
    const f = Math.max(0, Math.min(100, spouse.relationship))
    if (e !== null && Number.isFinite(f) && e.f !== f) putEdge(n, key, { f })
  } catch {
    // an edge that cannot be written leaves the old number; the affection check names it
  }
}
