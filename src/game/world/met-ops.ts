// What the Met store does (R4-S7, D.1 f): how a person becomes Met, what keeps a record, how a record is let go and what the yearly
// sweep does. world/met.ts is the shard (shape, reader, the one writer); this file is its behaviour.
//
//   touchMet(g, key, patch?, home?, identity?)   make or stamp the record of a sid. Action or yearly step only. False when no record was
//                                                made: the key is no sid, an identity is not that person's, or the shard is full and
//                                                every record is held, or the newcomer itself ranks lowest of all
//   markMet(g, key, stake)                       SET semantics on fl, gr and ob of a record or a tombstone: a bit can be cleared
//   evictMet(g, key, why)                        let a record go: 'dropped', 'tomb', 'kept' (something holds it) or 'absent'
//   tombstoneMet(g, key, stake?)                 make the tombstone of a key; a legacy person id is allowed (a debt outlives its Person)
//   sweepMet(g)                                  the yearly clean-up; lodSweep calls it, stamped by lod.y. Returns records that left
//   isProtected(g, key)                          what holds a key, see below
//   registerProtector(id, fn), registerSalience(id, fn)    the two hooks the Edges track fills at module load (X13)
//   salienceOf(g, key)                           the rank number: the registered functions plus the role weight times 10
//
// What holds a key (isProtected): a stake on the entry itself (any flag bit, an obligation of either sign, a grudge of 20 or more), a
// Person of g.people whose personKey is the key, a holder in the holdings table, or a registered protector naming it. A protector
// returns personKey values (a legacy person is protected by its id), runs in id order, and one that throws, or fails half way
// through its keys, protects nothing. A held record is never dropped: not by idleness, not by the cap.
//
// Letting go (evictMet, and what the sweep and the cap do): a record held by a Person, a holder or a protector is 'kept' as it is. A
// record held only by its own stake becomes a tombstone [last seen, gr, ob, fl, first, last, gb], which keeps the obligation. A plain
// record is dropped. Either way the account `person:<key>` is folded into the household pool of the PERSON'S country (not the
// player's: foldAccount is a relabel, the sum of the books never changes, no flow is booked). A tombstone is let go only when
// nothing holds it (no stake, no Person, no holder, no protector) and it is 20 years old; the cap on tombstones never drops one that
// is held, so a record that would need the room stays a record ('kept').
//
// The cap on records (touchMet): the newcomer is ranked with the 400 held, by [protected, salience, recency, key]. The lowest
// ranked unprotected one goes; if that is the newcomer, the touch is false. The rank is a total order and never reads the name, so
// the 400 that stay depend only on the set of names touched, in any order. A shard full of held records turns every newcomer away.
//
// Pure reads, no luck: nothing here draws, reads a clock or takes an id. The year is g.year. Every write builds the next shard and
// hands it to writeMet, which replaces the root and never edits it, so a deep-frozen root is fine. Layer 2: the kernel, the sid
// grammar, the latent person, the name registry, the holdings table and the Met shard. It never imports lod.ts (lod.ts calls
// sweepMet) or the root people.ts (layer 3). The module-level tables read nothing that is imported (rule (d) of the layers test).
import { foldAccount, type AcctRef } from '../kernel/ledger'
import { personKey } from '../kernel/person-ref'
import { counterparty } from '../kernel/reasons'
import { worldSeed } from '../kernel/streams'
import type { GameState } from '../types'
import { AXIS_IDS } from './axes'
import { DEMOTE_AFTER_YEARS, MET_CAPS } from './caps'
import { readHoldings } from './holdings'
import { latent, type LatentPerson } from './latent'
import { isTomb, MET_LIMITS, normalizeMet, packGb, readMet, unpackGb, writeMet, type MetRecord, type MetShard, type Tomb } from './met'
import { resolveName } from './met-names'
import { isSid, parseSid } from './sid'

/** The bits of `MetRecord.fl`: what a person is to the player. Life writes spouse and heir with markMet; Edges write none (X14). */
export const STAKE = Object.freeze({ debt: 1, spouse: 2, heir: 4, company: 8, feud: 16, will: 32 })

/**
 * The numbers of the rules, stated once. A grudge of `grudgeHolds` or more holds an entry; a tombstone is let go no sooner than
 * `tombYears` after the year it carries; the role weight of a record counts `roleRank` times in its salience (so a weight is never
 * counted twice: a registered salience returns the edge part only).
 */
export const MET_RULES = Object.freeze({ grudgeHolds: 20, tombYears: 20, roleRank: 10 })

/** What touchMet may set besides the stamp: each field a whole number cut to its range, a field that is not a finite number is ignored. */
export interface MetPatch {
  w?: number
  fl?: number
  gr?: number
  ob?: number
  d?: number
}

/** The most one registered salience counts, so a hostile function cannot make a rank number that is not a number. */
const SALIENCE_MAX = 1_000_000

/** A legacy person id: `p` and digits. Only a tombstone is kept under one. */
const LEGACY = /^p[0-9]{1,15}$/
/** The country of a pool account, as lod.ts reads it. */
const COUNTRY = /^[A-Za-z0-9._-]{1,16}$/

const hasOwn = (o: object, key: string): boolean => Object.prototype.hasOwnProperty.call(o, key)
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
const ownOf = (o: Record<string, unknown>, key: string): unknown => (hasOwn(o, key) ? o[key] : undefined)

/** A whole number in lo..hi: a finite number is made whole and cut into the range; anything else is null. */
function cut(x: unknown, lo: number, hi: number): number | null {
  if (typeof x !== 'number' || !Number.isFinite(x)) return null
  const n = Math.trunc(x)
  return (n < lo ? lo : n > hi ? hi : n) + 0
}

/** The year of the game as the Met store reads a year, or null when it is none. */
function yearOf(g: Pick<GameState, 'year'>): number | null {
  return cut(g.year, MET_LIMITS.yearMin, MET_LIMITS.yearMax)
}

// ---------------------------------------------------------------------------------------------------------------------------
// The two registries
// ---------------------------------------------------------------------------------------------------------------------------

type Protector = (g: GameState) => Iterable<string>
type Salience = (g: GameState, key: string) => number

const PROTECTORS = new Map<string, Protector>()
const SALIENCES = new Map<string, Salience>()
let protectorIds: string[] | null = null
let salienceFns: Salience[] | null = null

/**
 * Registers a function that names the keys it holds (personKey values; a legacy person is its id). Call it at module load. The same id
 * with the same function is fine; with another function it throws, and so does an id or a function that is none. It runs in id order,
 * and one that throws, or fails half way through, protects nothing.
 */
export function registerProtector(id: string, fn: Protector): void {
  if (typeof id !== 'string' || id === '') throw new TypeError('registerProtector: the id is a text')
  if (typeof fn !== 'function') throw new TypeError(`registerProtector: ${id} needs a function`)
  const have = PROTECTORS.get(id)
  if (have !== undefined) {
    if (have === fn) return
    throw new Error(`registerProtector: ${id} is already registered with another function`)
  }
  PROTECTORS.set(id, fn)
  protectorIds = null
}

/**
 * Registers a function that says how much a key matters to the player: f + s + abs(o) of the edge person>player, and nothing for the
 * role weight (the record's own `w` counts 10 times, once). Call it at module load. Same id rules as registerProtector. A function
 * that throws, or does not return a finite number, ranks 0; a number is cut to 0..1,000,000.
 */
export function registerSalience(id: string, fn: Salience): void {
  if (typeof id !== 'string' || id === '') throw new TypeError('registerSalience: the id is a text')
  if (typeof fn !== 'function') throw new TypeError(`registerSalience: ${id} needs a function`)
  const have = SALIENCES.get(id)
  if (have !== undefined) {
    if (have === fn) return
    throw new Error(`registerSalience: ${id} is already registered with another function`)
  }
  SALIENCES.set(id, fn)
  salienceFns = null
}

function protectorsInOrder(): readonly string[] {
  return (protectorIds ??= [...PROTECTORS.keys()].sort(cmp))
}

/** The registered saliences in id order, read once and kept until another is registered. */
function saliencesInOrder(): readonly Salience[] {
  return (salienceFns ??= [...SALIENCES.keys()].sort(cmp).map((id) => SALIENCES.get(id)!))
}

/** The sum of the registered saliences for a key: edge part only. Each function counts 0 when it throws or answers no finite number. */
function registeredSalience(g: GameState, key: string): number {
  let sum = 0
  for (const fn of saliencesInOrder()) {
    try {
      const v: unknown = fn(g, key)
      if (typeof v === 'number' && Number.isFinite(v)) sum += v < 0 ? 0 : v > SALIENCE_MAX ? SALIENCE_MAX : v
    } catch {
      // A salience that fails ranks 0.
    }
  }
  return sum
}

/**
 * The rank number of a key: the registered saliences plus the role weight of its record times 10. The role weight is the Met
 * record's own (a tombstone and a key with no entry have none). Pure.
 */
export function salienceOf(g: GameState, key: string): number {
  try {
    const cur = readMet(g)
    const e = typeof key === 'string' && hasOwn(cur, key) ? cur[key] : undefined
    const w = e !== undefined && !isTomb(e) ? e.w : 0
    return registeredSalience(g, key) + w * MET_RULES.roleRank
  } catch {
    return 0
  }
}

// ---------------------------------------------------------------------------------------------------------------------------
// What holds a key
// ---------------------------------------------------------------------------------------------------------------------------

type Entry = MetRecord | Tomb

/** True when the entry carries a stake of its own: a flag, an obligation of either sign, a grudge of 20 or more. */
function ownStake(e: Entry): boolean {
  if (Array.isArray(e)) {
    const t = e as Tomb
    return t[3] !== 0 || t[2] !== 0 || t[1] >= MET_RULES.grudgeHolds
  }
  const r = e as MetRecord
  return r.fl !== 0 || r.ob !== 0 || r.gr >= MET_RULES.grudgeHolds
}

/** The keys that something other than the entry itself holds: the Persons of g.people, the holders of the holdings table, the protectors. */
function externalKeys(g: GameState): Set<string> {
  const out = new Set<string>()
  if (Array.isArray(g.people)) {
    for (const p of g.people) {
      if (p === null || typeof p !== 'object') continue
      try {
        const key: unknown = personKey(p)
        if (typeof key === 'string') out.add(key)
      } catch {
        // A person that has no key holds nothing.
      }
    }
  }
  for (const row of readHoldings(g).rows) {
    const owner: unknown = row[0]
    if (typeof owner === 'string' && owner.startsWith('person:')) out.add(owner.slice('person:'.length))
  }
  for (const id of protectorsInOrder()) {
    const got: string[] = []
    try {
      for (const key of PROTECTORS.get(id)!(g)) {
        if (typeof key === 'string') got.push(key)
        if (got.length >= MET_CAPS.scan) break
      }
    } catch {
      continue
    }
    for (const key of got) out.add(key)
  }
  return out
}

/** True when something holds the key: its entry's own stake, a Person, a holder, a registered protector. Pure. */
export function isProtected(g: GameState, key: string): boolean {
  try {
    if (typeof key !== 'string') return false
    const cur = readMet(g)
    const e = hasOwn(cur, key) ? cur[key] : undefined
    if (e !== undefined && ownStake(e)) return true
    return externalKeys(g).has(key)
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------------------------------------------------------
// Rank
// ---------------------------------------------------------------------------------------------------------------------------

interface Rank {
  key: string
  prot: boolean
  sal: number
  seen: number
}

/** Negative when `a` ranks above `b`: protected first, then the higher salience, then the more recently seen, then the smaller key. A total order. */
function above(a: Rank, b: Rank): number {
  return Number(b.prot) - Number(a.prot) || b.sal - a.sal || b.seen - a.seen || cmp(a.key, b.key)
}

/** How many entries of a shard are records. A tombstone is an array and a record a plain object, so the test is the cheap one. */
function recordCount(shard: Readonly<MetShard>, keys: readonly string[]): number {
  let n = 0
  for (const key of keys) if (!Array.isArray(shard[key])) n++
  return n
}

/**
 * The record the cap lets go for a newcomer, or null: every record is held, or the newcomer is itself the lowest ranked of those not
 * held (an unprotected newcomer that ranks below every unprotected record is turned away; a protected one never is). One pass over
 * the shard, no allocation per record: it is the cost of a touch at the cap, and a flood pays it 40,000 times.
 */
function loserFor(g: GameState, cur: Readonly<MetShard>, keys: readonly string[], newcomer: Rank, ext: ReadonlySet<string>, year: number): string | null {
  let key: string | null = null
  let sal = 0
  let seen = 0
  for (const k of keys) {
    const v = cur[k]!
    if (Array.isArray(v)) continue
    const r = v as MetRecord
    if (ext.has(k) || ownStake(r)) continue
    const s = registeredSalience(g, k) + r.w * MET_RULES.roleRank
    const y = r.s < year ? r.s : year
    // The lowest rank so far: the lower salience, then the older, then the larger key (the inverse of `above` for two unprotected).
    if (key === null || s < sal || (s === sal && (y < seen || (y === seen && k > key)))) {
      key = k
      sal = s
      seen = y
    }
  }
  if (key === null) return null
  if (!newcomer.prot && above(newcomer, { key, prot: false, sal, seen }) > 0) return null
  return key
}

// ---------------------------------------------------------------------------------------------------------------------------
// Letting go
// ---------------------------------------------------------------------------------------------------------------------------

/** Folds the account of a person who leaves the record list into the household pool of the person's own country: a relabel, books unchanged. */
function settle(g: GameState, key: string, country: string): void {
  try {
    foldAccount(g, `person:${key}` as AcctRef, counterparty('hh', country) as AcctRef)
  } catch {
    // An account that cannot be folded stays where it is.
  }
}

/** The same for a tombstone that ages out: it has no country any more, so the player's is used (as lod.ts does for a person it lets go). */
function settleResidual(g: GameState, key: string): void {
  const c: unknown = g.character?.countryId
  settle(g, key, typeof c === 'string' && COUNTRY.test(c) ? c : 'xx')
}

/** The tombstone of a record: the year it was last seen, its stake, its names and born * 2 + gender. */
function tombOf(r: MetRecord, year: number): Tomb {
  return [year, r.gr, r.ob, r.fl, r.f, r.l, packGb(r.b, r.g)]
}

/**
 * Makes room for one more tombstone in `work` (the shard being built): true when there is room or when a tombstone that nothing holds
 * and that is 20 years old can go (the oldest, then the larger key; its account folds); false when every tombstone is held or young.
 * The cap never drops an obligation.
 */
function makeRoom(g: GameState, work: MetShard, ext: ReadonlySet<string>): boolean {
  const year = yearOf(g) ?? 0
  let tombs = 0
  let victim: string | null = null
  let victimYear = 0
  for (const key of Object.keys(work)) {
    const v = work[key]!
    if (!isTomb(v)) continue
    tombs++
    if (ext.has(key) || ownStake(v) || year - v[0] < MET_RULES.tombYears) continue
    if (victim === null || v[0] < victimYear || (v[0] === victimYear && key > victim)) {
      victim = key
      victimYear = v[0]
    }
  }
  if (tombs < MET_CAPS.tombs) return true
  if (victim === null) return false
  delete work[victim]
  settleResidual(g, victim)
  return true
}

/**
 * Lets the record of `key` go in `work`: 'kept' when a Person, a holder or a protector holds it (or a tombstone has no room), a
 * tombstone when only its own stake holds it, else dropped. The account folds into the pool of the record's country.
 */
function evictIn(g: GameState, work: MetShard, key: string, ext: ReadonlySet<string>, year: number): 'dropped' | 'tomb' | 'kept' {
  const r = work[key] as MetRecord
  if (ext.has(key)) return 'kept'
  if (ownStake(r)) {
    if (!makeRoom(g, work, ext)) return 'kept'
    work[key] = tombOf(r, Math.min(r.s, year))
    settle(g, key, r.c)
    return 'tomb'
  }
  delete work[key]
  settle(g, key, r.c)
  return 'dropped'
}

/**
 * Lets the record of `key` go, for `why` (idle, cap or gone: the reason is the caller's; the rules are the same). 'dropped' when a
 * plain record is removed, 'tomb' when a record held only by its own stake becomes a tombstone, 'kept' when something holds it (or
 * a tombstone has no room, or `why` is none of the three), 'absent' when the key has no record (a tombstone is not a record).
 */
export function evictMet(g: GameState, key: string, why: 'idle' | 'cap' | 'gone'): 'dropped' | 'tomb' | 'kept' | 'absent' {
  try {
    if (why !== 'idle' && why !== 'cap' && why !== 'gone') return 'kept'
    const cur = readMet(g)
    if (typeof key !== 'string' || !hasOwn(cur, key) || isTomb(cur[key])) return 'absent'
    const work: MetShard = { ...cur }
    const fate = evictIn(g, work, key, externalKeys(g), yearOf(g) ?? MET_LIMITS.yearMax)
    if (fate !== 'kept') writeMet(g, work)
    return fate
  } catch {
    return 'kept'
  }
}

// ---------------------------------------------------------------------------------------------------------------------------
// The stake
// ---------------------------------------------------------------------------------------------------------------------------

interface StakePatch {
  fl?: number
  gr?: number
  ob?: number
}

/** The fields of a stake that are finite numbers, each cut to its range. Anything that is no object gives none. */
function stakeOf(x: unknown): StakePatch | null {
  if (x === null || typeof x !== 'object' || Array.isArray(x)) return null
  const o = x as Record<string, unknown>
  const out: StakePatch = {}
  const fl = cut(ownOf(o, 'fl'), 0, MET_LIMITS.flMax)
  const gr = cut(ownOf(o, 'gr'), 0, MET_LIMITS.grMax)
  const ob = cut(ownOf(o, 'ob'), -MET_LIMITS.obMax, MET_LIMITS.obMax)
  if (fl !== null) out.fl = fl
  if (gr !== null) out.gr = gr
  if (ob !== null) out.ob = ob
  return out
}

/**
 * Sets the stake fields given (fl, gr, ob) on the record or tombstone of `key` to the given values and leaves the others: a bit can
 * be cleared when a link ends. Each is cut to its range; one that is not a finite number is ignored. True when the key has an entry
 * (and `stake` is an object), false otherwise. It does not stamp the record.
 */
export function markMet(g: GameState, key: string, stake: { fl?: number; gr?: number; ob?: number }): boolean {
  try {
    const s = stakeOf(stake)
    if (s === null || typeof key !== 'string') return false
    const cur = readMet(g)
    if (!hasOwn(cur, key)) return false
    const e = cur[key]!
    const next: Entry = isTomb(e)
      ? [e[0], s.gr ?? e[1], s.ob ?? e[2], s.fl ?? e[3], e[4], e[5], e[6]]
      : { ...e, fl: s.fl ?? e.fl, gr: s.gr ?? e.gr, ob: s.ob ?? e.ob }
    writeMet(g, { ...cur, [key]: next })
    return true
  } catch {
    return false
  }
}

/** The tombstone of a Person who is still in g.people, for a key that has no entry: the names, born * 2 + gender and no stake yet. */
function fromPerson(g: GameState, key: string, year: number): Tomb | null {
  if (!Array.isArray(g.people)) return null
  for (const p of g.people) {
    if (p === null || typeof p !== 'object' || personKey(p) !== key) continue
    const age = typeof p.age === 'number' && Number.isFinite(p.age) ? Math.max(0, Math.trunc(p.age)) : 0
    return [year, 0, 0, 0, p.firstName, p.lastName, packGb(year - age, p.gender === 'male' ? 1 : 0)]
  }
  return null
}

/**
 * Makes the tombstone of a key and sets the stake it is given on it (fl, gr, ob; the others come from what was there). The key is a
 * sid or a legacy person id `p<digits>`, so a debt outlives its Person. A record becomes a tombstone whatever holds it (the caller
 * knows the person is leaving) and its account folds into the pool of its country; a tombstone it already has is updated and stamped
 * with this year; for a key with no entry the names are read from the Person of g.people with that personKey, so call it before the
 * Person is removed. False for a bad key, a key with no source of names, and a full tombstone list with no tombstone that nothing
 * holds and that is 20 years old: the cap never drops an obligation.
 */
export function tombstoneMet(g: GameState, key: string, stake?: { fl?: number; gr?: number; ob?: number }): boolean {
  try {
    if (typeof key !== 'string' || !(isSid(key) || LEGACY.test(key))) return false
    const year = yearOf(g)
    if (year === null) return false
    const s = stakeOf(stake) ?? {}
    const cur = readMet(g)
    const e = hasOwn(cur, key) ? cur[key] : undefined
    const work: MetShard = { ...cur }
    const made: Tomb | null = e !== undefined && isTomb(e) ? [year, e[1], e[2], e[3], e[4], e[5], e[6]] : e !== undefined ? tombOf(e, Math.min(e.s, year)) : fromPerson(g, key, year)
    if (made === null) return false
    const next: Tomb = [made[0], s.gr ?? made[1], s.ob ?? made[2], s.fl ?? made[3], made[4], made[5], made[6]]
    const probe = normalizeMet({ [key]: next })[key]
    if (probe === undefined || !isTomb(probe)) return false
    // A tombstone that is already there takes no new place; a record becoming one, or a new one, needs room.
    if ((e === undefined || !isTomb(e)) && !makeRoom(g, work, externalKeys(g))) return false
    if (e !== undefined && !isTomb(e)) settle(g, key, e.c)
    work[key] = probe
    writeMet(g, work)
    return isTomb(readMet(g)[key])
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------------------------------------------------------
// Touch
// ---------------------------------------------------------------------------------------------------------------------------

/** The fields of a patch that are finite numbers, each cut to its range. Anything that is no object gives none. */
function patchOf(x: unknown): MetPatch {
  const out: MetPatch = {}
  if (x === null || typeof x !== 'object' || Array.isArray(x)) return out
  const o = x as Record<string, unknown>
  const w = cut(ownOf(o, 'w'), 0, MET_LIMITS.wMax)
  const d = cut(ownOf(o, 'd'), MET_LIMITS.yearMin, MET_LIMITS.yearMax)
  if (w !== null) out.w = w
  if (d !== null) out.d = d
  Object.assign(out, stakeOf(x))
  return out
}

/** The five axes of a person in AXIS_IDS order, whole; an axis that is no finite number reads 50. */
function tupleOf(axes: unknown): MetRecord['a'] {
  const a = (axes !== null && typeof axes === 'object' ? axes : {}) as Record<string, unknown>
  return AXIS_IDS.map((id) => {
    const v = a[id]
    return typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.max(0, Math.min(100, v))) : 50
  }) as unknown as MetRecord['a']
}

/** The record that the Met reader would keep of this value, or null when it would drop it: the one validation, so nothing here repeats it. */
function cleaned(key: string, rec: MetRecord): MetRecord | null {
  const v = normalizeMet({ [key]: rec })[key]
  return v !== undefined && !isTomb(v) ? v : null
}

/** A record of a person met for the first time: from the identity the caller gave, else from latent and the name registry. */
function freshRecord(g: GameState, key: string, p: MetPatch, home: string | undefined, identity: LatentPerson | undefined, year: number): MetRecord | null {
  let lat: LatentPerson
  let name: { first: string; last: string; k: number }
  if (identity !== undefined) {
    if (identity === null || typeof identity !== 'object' || identity.sid !== key) return null
    lat = identity
    name = { first: identity.first, last: identity.last, k: 0 }
  } else {
    lat = latent(worldSeed(g), parseSid(key)!, home)
    name = resolveName(g, lat)
  }
  const rec: MetRecord = { f: name.first, l: name.last, g: lat.gender === 'male' ? 1 : 0, b: lat.born, c: lat.country, k: name.k, a: tupleOf(lat.axes), y: year, s: year, w: p.w ?? 0, fl: p.fl ?? 0, gr: p.gr ?? 0, ob: p.ob ?? 0 }
  if (p.d !== undefined) rec.d = p.d
  return cleaned(key, rec)
}

/** A record woken from a tombstone: the stored names, gender and birth year and the stake come back; the axes and the country come from latent. */
function wokenRecord(g: GameState, key: string, t: Tomb, p: MetPatch, home: string | undefined, identity: LatentPerson | undefined, year: number): MetRecord | null {
  const lat = identity !== undefined && identity !== null && typeof identity === 'object' && identity.sid === key ? identity : latent(worldSeed(g), parseSid(key)!, home)
  const { born, g: gender } = unpackGb(t[6])
  const rec: MetRecord = { f: t[4], l: t[5], g: gender, b: born, c: lat.country, k: 0, a: tupleOf(lat.axes), y: Math.min(t[0], year), s: year, w: p.w ?? 0, fl: p.fl ?? t[3], gr: p.gr ?? t[1], ob: p.ob ?? t[2] }
  if (p.d !== undefined) rec.d = p.d
  return cleaned(key, rec)
}

function touch(g: GameState, key: string, patch: MetPatch | undefined, home: string | undefined, identity: LatentPerson | undefined): boolean {
  if (!isSid(key)) return false
  const year = yearOf(g)
  if (year === null) return false
  const p = patchOf(patch)
  const cur = readMet(g)
  const have = hasOwn(cur, key) ? cur[key] : undefined
  if (have !== undefined && !isTomb(have)) {
    // A person already met: stamp the year and lay the patch over the record. The stored identity stays.
    const next: MetRecord = { ...have, s: year }
    if (p.w !== undefined) next.w = p.w
    if (p.fl !== undefined) next.fl = p.fl
    if (p.gr !== undefined) next.gr = p.gr
    if (p.ob !== undefined) next.ob = p.ob
    if (p.d !== undefined) next.d = p.d
    writeMet(g, { ...cur, [key]: next })
    return true
  }
  // A person who needs a place in the record list. The cap is settled first, before any name is resolved: a newcomer that the cap
  // turns away costs one pass over the 400 and nothing else.
  let loser: string | null = null
  const keys = Object.keys(cur)
  if (recordCount(cur, keys) >= MET_CAPS.records) {
    const ext = externalKeys(g)
    const t = have !== undefined && isTomb(have) ? have : null
    const held = (p.fl ?? t?.[3] ?? 0) !== 0 || (p.ob ?? t?.[2] ?? 0) !== 0 || (p.gr ?? t?.[1] ?? 0) >= MET_RULES.grudgeHolds
    const newcomer: Rank = { key, prot: held || ext.has(key), sal: registeredSalience(g, key) + (p.w ?? 0) * MET_RULES.roleRank, seen: year }
    loser = loserFor(g, cur, keys, newcomer, ext, year)
    if (loser === null) return false
  }
  const rec = have !== undefined && isTomb(have) ? wokenRecord(g, key, have, p, home, identity, year) : freshRecord(g, key, p, home, identity, year)
  if (rec === null) return false
  const work: MetShard = { ...cur }
  if (loser !== null) {
    settle(g, loser, (work[loser] as MetRecord).c)
    delete work[loser]
  }
  work[key] = rec
  writeMet(g, work)
  return !isTomb(readMet(g)[key]) && hasOwn(readMet(g), key)
}

/**
 * Makes the person of a sid Met, or stamps the year on one already met. An action or the yearly step only. A new record comes from
 * `identity` when one is given (the face the legacy code already drew, from fromSeeded, stored exactly and never regenerated; its sid
 * must be `key`), else from latent and the name registry, with `home` as the country of an entity-placed slot; a tombstone wakes with
 * its stored names, gender, birth year and stake. `patch` is laid over the record: each field of w, fl, gr, ob and d that is a
 * finite number, cut to its range. A key that is no sid of the strict grammar returns false and writes nothing. When 400 records are
 * held, the newcomer is ranked with them by [protected, salience, recency, key] and the lowest ranked unprotected one goes (its
 * account folds); false when every record is held or the newcomer itself ranks lowest, and nothing changes.
 */
export function touchMet(g: GameState, key: string, patch?: MetPatch, home?: string, identity?: LatentPerson): boolean {
  try {
    return touch(g, key, patch, home, identity)
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------------------------------------------------------
// The sweep
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * The yearly clean-up of the Met store, called by lodSweep inside its year stamp, so it runs once a year and a second call changes
 * nothing. First the tombstones nothing holds that are 20 years old go; then every record not seen for more than DEMOTE_AFTER_YEARS
 * full years (s < year - 5, the rule of lod.ts) is let go as evictMet does: dropped, tombstoned, or kept because a Person, a holder or
 * a protector holds it. The caps are the reader's and the writers' (400 records, 200 tombstones). Returns how many records left the
 * list (dropped or turned into tombstones); a life with no Met shard writes nothing and returns 0.
 */
export function sweepMet(g: GameState): number {
  try {
    const cur = readMet(g)
    const keys = Object.keys(cur)
    const year = yearOf(g)
    if (keys.length === 0 || year === null) return 0
    const limit = year - DEMOTE_AFTER_YEARS
    const ext = externalKeys(g)
    const work: MetShard = { ...cur }
    let changed = false
    for (const key of keys) {
      const v = cur[key]!
      if (isTomb(v) && !ext.has(key) && !ownStake(v) && year - v[0] >= MET_RULES.tombYears) {
        delete work[key]
        settleResidual(g, key)
        changed = true
      }
    }
    let left = 0
    for (const key of keys) {
      const v = cur[key]!
      if (isTomb(v) || v.s >= limit) continue
      if (evictIn(g, work, key, ext, year) === 'kept') continue
      left++
      changed = true
    }
    if (changed) writeMet(g, work)
    return left
  } catch {
    return 0
  }
}
