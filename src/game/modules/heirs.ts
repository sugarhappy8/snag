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
//
// R4-L9 part B (D.9 a, X28, X33, C10, C12) keeps the people the family felt something for, and the edges they felt it on.
//
//   keptContacts(n, childId, oldEgo, taken)
//                                the contacts a stamped hand-over ADDS to the old rule (the old rule, an NpcLife or a family co-owner,
//                                stays inline in life.ts). Persons of the old list, alive, not a pet, not the heir, none whose id is in
//                                `taken` (the ids the rebuilt list already holds), and one of: held at the person level (they owe the
//                                late player, hold a share of a company, own an old NPC firm, hold a family job, are a living spouse or
//                                fiance, or are cut out of the will or estranged: boundTest of world/edge-bound.ts over an EMPTY edge
//                                map, so an edge's own link kind, feud rung, debt or memory counts for nothing here: a rival link or a
//                                cold feud names the late player's standing, X28); in a live feud (edge `person > ego` with a rung of 2
//                                or more); or one of the 12 best friends, best friends and lovers by the salience of that edge (60 or
//                                more). At most 40, the held first, then the feuds, then the friends, each by salience and then by id.
//                                Returns them in the order of the old list, each with the relation and the relationship it starts at:
//                                'enemy' (a feud, or an enemy who is held) at min(old, 30), else 'friend' at keptStart. The caller
//                                resets them, pushes them and gives them the same two data keys the old rule gives. Pure.
//   keptStart(old, held, enemy)  the relationship a kept contact starts at: min(60, max(25 if held, round(0.5 x old))), an enemy
//                                min(old, 30). It applies to every kept contact of a stamped hand-over, the old-rule ones too (X33).
//   contactHeld(n)               the person-level test keptContacts uses, for the callers that need it one person at a time (the old
//                                rule's contacts): read the held people once, then answer for any Person. Pure.
//   carryEdges(n, oldEgo, heirRef, kept)
//                                step 4 of the contract, called right after `n.character = heir` and carryReceivables. For every Person
//                                of `kept` (the late player's own and the pets excepted) the edge `person > oldEgo` crosses through
//                                heirEdges (E8: t, r and a non-kin's f at 0.5, s at 0.6, never a raise, memories one point lighter, q
//                                and k for a kin link only, dv, n, d and c dropped) as `person > heirRef`. Then, in this order:
//                                  1. every edge that ENDS at the late ego goes (kept or not: nothing is left to point at the dead);
//                                  2. each crossed edge is written with f set to the person's final Person.relationship (so a direct
//                                     kin's f is the blend, X33). Where an edge `person > heirRef` is already there (a strife edge of an
//                                     earlier reading, the pair edge of the heir's spouse, the claim the receivables made) it is the
//                                     one that stays: s is the larger of the two, the memories are the union of both capped at 8 (C12),
//                                     a link kind and a feud rung the old one lacked are taken over, and the rest is the existing
//                                     edge's own;
//                                  3. any other edge `person > heirRef` of a kept person gets f set to the relationship, so the
//                                     affection invariant (edge.f === Person.relationship, X22) holds for the heir's spouse too;
//                                  4. syncLegacy (E7) runs for each kept person, so the legacy records (the claim the heir took over,
//                                     the will's anger) win over what was copied.
//                                Writes through putEdge only, so every cap holds; an edge it cannot write is left out. The count of
//                                edges after is never above the count before. No luck, no id, no dollar.
//
// All of them run on a stamped life only (X6): an unstamped life, a v5.2.0 save and every heir of one get exactly the old hand-over, and each
// function returns zeros and writes nothing for a life the stamp does not mark. They draw nothing from g.rng, make no id, and book only
// through cash.moveCash (inside serviceDebt) under the reasons `divorce` and `support`; no reason is new and nothing is minted or burned.
//
// This file is layer 4 (assembly), like life.ts, which calls it, and the rest of modules/; the society door is reached through
// society/contract.ts only (C39).
import { formatMoney } from '../core'
import { readTies, updateTies } from '../events/wealth-core'
import { willSlices } from '../events/will-core'
import { estatePurse } from '../events/will-estate'
import type { EntityRef } from '../kernel/ids'
import { personEntity } from '../kernel/person-ref'
import { SID_RELATIONS } from '../materialize'
import { debtToken, debtsOf, serviceDebt } from '../society/contract'
import type { Character, GameState, Gender, Person } from '../types'
import { EDGE_CAPS } from '../world/caps'
import { boundTest } from '../world/edge-bound'
import { heirEdges } from '../world/edge-heir'
import { formatMemory, isPinnedKind, parseMemory, type Memory } from '../world/edge-memory'
import { syncLegacy } from '../world/edge-step'
import { putEdge } from '../world/edge-write'
import { edgeKey, edgeMap, edgesOf, readEdge, salience, type Edge, type EdgeKey, type EdgeMap } from '../world/edges'
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

// ---------------------------------------------------------------------------------------------------------------------------------
// R4-L9 part B: the kept contacts and the edge copy
// ---------------------------------------------------------------------------------------------------------------------------------

/** Most contacts keptContacts adds to the old rule. */
const KEPT_MAX = 40
/** Most friends, best friends and lovers kept for the strength of the edge alone, and the salience they need. */
const TOP_FRIENDS = 12
const TOP_SALIENCE = 60
/** The feud rung (cold 1, gossip 2, sabotage 3, legal 4) from which a person is an enemy in a live feud. */
const FEUD_RUNG = 2
/** What a held contact starts at at least, and the most a kept friend and a kept enemy start at. */
const HELD_START = 25
const FRIEND_START_CAP = 60
const ENEMY_START_CAP = 30
/** Persons read at most: the reader's bound on a hostile list (the same as the edge predicate's). */
const PEOPLE_MAX = 5_000
const TOP_RELATIONS: ReadonlySet<string> = new Set(['friend', 'bestFriend', 'lover'])
/** The edge map with no edge: the predicate over it answers for the people alone. */
const NO_EDGES: EdgeMap = Object.freeze({})

const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k)

/** A contact the hand-over adds: the Person of the old list, and what the rebuilt list gives them. */
export interface KeptContact {
  person: Person
  relation: 'friend' | 'enemy'
  relationship: number
}

/** The relationship a kept contact starts at (see the header): min(60, max(25 if held, round(0.5 x old))), an enemy min(old, 30). Pure and total. */
export function keptStart(old: number, held: boolean, enemy: boolean): number {
  const was = Number.isFinite(old) ? old : 0
  if (enemy) return Math.max(0, Math.round(Math.min(was, ENEMY_START_CAP)))
  return Math.max(0, Math.min(FRIEND_START_CAP, Math.max(held ? HELD_START : 0, Math.round(0.5 * was))))
}

/** The person-level bound test: true for a Person the late player was bound to (see the header). One look at the people; total. */
export function contactHeld(n: GameState, oldEgo: EntityRef): (p: Person) => boolean {
  const test = boundTest(n, NO_EDGES)
  return (p: Person): boolean => {
    try {
      const key = edgeKey(personEntity(p), oldEgo)
      return key !== null && test(key)
    } catch {
      return false
    }
  }
}

/** The feud rung of an edge: 0 when it holds no feud. */
function rungOf(e: Readonly<Edge> | null): number {
  const q: unknown = e?.q
  return Array.isArray(q) && q.length === 3 && typeof q[0] === 'number' && Number.isFinite(q[0]) ? q[0] : 0
}

interface Candidate {
  at: number
  person: Person
  held: boolean
  feud: boolean
  top: boolean
  sal: number
}

const bySalience = (a: Candidate, b: Candidate): number => b.sal - a.sal || (a.person.id < b.person.id ? -1 : a.person.id > b.person.id ? 1 : 0)

/**
 * The contacts a stamped hand-over adds to the old rule (see the header): the held, those in a live feud and the best friends, at most 40,
 * none in `taken`. Call it right after the old rule's loop, while the character is still the late player (`oldEgo` is its ref). Pure and
 * total: a hostile list or map answers an empty list, and nothing is written, drawn or made.
 */
export function keptContacts(n: GameState, childId: string, oldEgo: EntityRef, taken: ReadonlySet<string>): KeptContact[] {
  try {
    if (!socialOn(n) || !Array.isArray(n.people)) return []
    const held = contactHeld(n, oldEgo)
    const map = edgeMap(n)
    const all: Candidate[] = []
    const count = Math.min(n.people.length, PEOPLE_MAX)
    for (let at = 0; at < count; at++) {
      const person = n.people[at]
      if (person === null || typeof person !== 'object' || person.id === childId || taken.has(person.id) || person.alive !== true || person.relation === 'pet') continue
      const key = edgeKey(personEntity(person), oldEgo)
      if (key === null) continue
      const e = hasOwn(map, key) ? map[key]! : null
      const sal = e === null ? 0 : salience(e, 0)
      const isHeld = held(person)
      const feud = rungOf(e) >= FEUD_RUNG
      const top = TOP_RELATIONS.has(person.relation) && sal >= TOP_SALIENCE
      if (isHeld || feud || top) all.push({ at, person, held: isHeld, feud, top, sal })
    }
    // the friends are kept for the strength of the edge: the 12 best of those who qualify, whoever else holds them
    const best = new Set(all.filter((c) => c.top).sort(bySalience).slice(0, TOP_FRIENDS))
    const chosen = all
      .filter((c) => c.held || c.feud || best.has(c))
      .sort((a, b) => Number(b.held) - Number(a.held) || Number(b.feud) - Number(a.feud) || bySalience(a, b))
      .slice(0, KEPT_MAX)
      .sort((a, b) => a.at - b.at)
    return chosen.map((c) => {
      const enemy = c.feud || c.person.relation === 'enemy'
      return { person: c.person, relation: enemy ? 'enemy' : 'friend', relationship: keptStart(c.person.relationship, c.held, enemy) }
    })
  } catch {
    return []
  }
}

const sameList = (a: readonly unknown[] | undefined, b: readonly unknown[] | undefined): boolean => (a === undefined || b === undefined ? a === b : a.length === b.length && a.every((x, i) => x === b[i]))

/**
 * The memories of two edges as one list (C12): one memory for each kind and year (the heavier), oldest year first, at most 8 (over the cap
 * the oldest unpinned goes first, and only then the oldest pinned, as the edge normalizer cuts). Undefined when none is left.
 */
function unionMemories(a: readonly string[] | undefined, b: readonly string[] | undefined): string[] | undefined {
  const seen = new Map<string, Memory>()
  for (const list of [a, b]) {
    if (!Array.isArray(list)) continue
    for (const text of list) {
      const m = parseMemory(text)
      if (m === null) continue
      const id = `${m.kind}.${m.year}`
      const had = seen.get(id)
      if (had === undefined || m.w > had.w) seen.set(id, m)
    }
  }
  const out = [...seen.values()].sort((x, y) => x.year - y.year)
  while (out.length > EDGE_CAPS.memPerEdge) {
    const at = out.findIndex((m) => !isPinnedKind(m.kind))
    out.splice(at >= 0 ? at : 0, 1)
  }
  return out.length > 0 ? out.map(formatMemory) : undefined
}

/** Writes an edge, and when the map refuses it (a feud over the cap) writes it again without the feud. */
function put(n: GameState, key: EdgeKey, patch: Partial<Edge>): void {
  if (putEdge(n, key, patch)) return
  if (patch.q !== undefined) putEdge(n, key, { ...patch, q: undefined })
}

/** Whether the edge `key` ends at `ref`. */
const endsAt = (key: string, ref: EntityRef): boolean => key.slice(key.indexOf('>') + 1) === ref

/** The final relationship as an edge keeps it: the Person's number, cut to 0 to 100; null when it is not a number. */
function affection(p: Person): number | null {
  const r = p.relationship
  return typeof r === 'number' && Number.isFinite(r) ? Math.max(0, Math.min(100, r)) : null
}

/**
 * Carries the edges of the late ego to the heir (step 4 of the contract, see the header). Call it right after `n.character = heir` and
 * carryReceivables; `kept` is every Person of the rebuilt list (the late player's own Person and the pets are skipped here).
 */
export function carryEdges(n: GameState, oldEgo: EntityRef, heirRef: EntityRef, kept: readonly Person[]): void {
  try {
    if (!socialOn(n) || oldEgo === heirRef || !Array.isArray(kept)) return
    const map = edgeMap(n)
    const rows: { p: Person; key: EdgeKey; f: number | null }[] = []
    const sub: Record<string, Readonly<Edge>> = {}
    const done = new Set<string>()
    const count = Math.min(kept.length, PEOPLE_MAX)
    for (let i = 0; i < count; i++) {
      const p = kept[i]
      if (p === null || typeof p !== 'object' || p.relation === 'pet') continue
      const from = personEntity(p)
      if (from === 'pool:other' || from === oldEgo || from === heirRef) continue
      const key = edgeKey(from, heirRef)
      if (key === null || done.has(key)) continue
      done.add(key)
      rows.push({ p, key, f: affection(p) })
      const was = edgeKey(from, oldEgo)
      if (was !== null && hasOwn(map, was)) sub[was] = map[was]!
    }
    const crossed = heirEdges(sub, oldEgo, heirRef, n.year)
    // nothing may point at the dead: every edge that ends at the late ego goes first, which also frees the room the crossed ones need
    for (const [key] of edgesOf(n, oldEgo)) if (endsAt(key, oldEgo)) putEdge(n, key, null)
    for (const { p, key, f } of rows) {
      const inc = hasOwn(crossed, key) ? crossed[key]! : null
      const cur = readEdge(n, personEntity(p), heirRef)
      if (cur === null) {
        if (inc !== null) put(n, key, f === null ? { ...inc } : { ...inc, f })
        continue
      }
      const patch: Partial<Edge> = {}
      if (f !== null && cur.f !== f) patch.f = f
      if (inc !== null) {
        if (inc.s > cur.s) patch.s = inc.s
        const m = unionMemories(cur.m, inc.m)
        if (!sameList(m, cur.m)) patch.m = m
        if (cur.k === undefined && inc.k !== undefined) patch.k = inc.k
        if (cur.q === undefined && inc.q !== undefined) patch.q = inc.q
        if (inc.y < cur.y) patch.y = inc.y
        if (inc.l > cur.l) patch.l = inc.l
      }
      if (Object.keys(patch).length > 0) put(n, key, patch)
    }
    for (const { p } of rows) syncLegacy(n, p)
  } catch {
    // an edge that cannot be carried is left behind; the yearly step and the invariants name what is wrong
  }
}
