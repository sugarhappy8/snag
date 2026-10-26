// Kin records on stamped lives (R4-L4, D.5 c, X2, X12, X14, X16, X22, X29, X42, X57, C14, C36, C38). When a relative of the player marries or
// has a baby, the spouse and the baby also exist as a Met record, so the face of the new relative is stored once and never changes. The
// legacy fields stay the authority (X22): `married`, `spouseName` and `kids` are written on four lines and read on a dozen, and the
// records MIRROR them the way the Edge mirrors `Person.relationship`. The shape of the links and the pure readers are world/kin.ts (R4-L3);
// this file is their writer, and it runs only on a life the social stamp marks (X6): an unstamped life, every v5.2.0 save and every heir
// of one gets no key, no record and no edge, and keeps its draws and its ids byte for byte.
//
//   adoptSpouse(g, anchor, identity?)   the anchor is married and has no link: the spouse becomes a record (the name of `spouseName`, split at
//                                       the first space; the gender the caller drew, else a keyed draw; born the anchor's birth plus a keyed
//                                       offset, 18 or more at the wedding), flagged as a spouse (2) with role weight 6, linked from the
//                                       anchor (`spouseSid`), joined by a pair edge both ways, with the fact life.wed. The sid, or null
//   adoptChild(g, anchor, identity)     the same for a baby of an anchor that is not a child or a stepchild (those get a real grandchild
//                                       Person): born this year, weight 4, flag 4, `kidSids` (at most 6), a kin edge both ways, life.birth
//   unlinkSpouse(g, anchor)             the link ends: `spouseSid` gone, flag 2 cleared, both pair edges removed. The record stays
//   syncKin(g)                          the yearly step (the module life.kin, life phase, order 37): see below
//   KIN_IDENTITY                        the frozen table of the face (X57)
//   keyedSpouse(seed, year, anchorKey)  the keyed draw of a spouse's gender and birth offset, pure
//   kinSid(g, country, year)            the next sid, or null
//
// The face (X57, section 3.3 of the cross-check): the spouse's name is the legacy name; the baby's name, surname and gender are the legacy
// draws the caller passes in, so the table holds no baby number. What is new is the spouse's birth offset (-4..4 around the anchor's birth, a keyed whole
// number, never below 18 at the wedding), the 92 percent of opposite gender (the keyed draw mirrors `chance(g, 0.92)` of relationships.ts; the
// legacy caller passes its own gender) and the two facet numbers of `streamKey(worldSeed(g), 'soc.kin', year, anchorKey)` read with
// `streamUnit(key, facet)`: hashes, not streams, so there is no generator and no row in the stream table. Facets 2 to 15 are reserved and
// unused. A kin record's face comes only from these values and never changes, so the table freezes at its first recording.
//
// The sid is `kin.<country>.<year>.<ord>` (X16): the country is the anchor's (`data.countryId`, else the player's), the year is this year,
// and the ord is one above the highest ord among the Met keys and tombstones of that prefix, at most 9999. The builder returns null
// for a year outside 1850..2400, a country that is no valid place and an ord past 9999, and never calls the throwing `makeSid` with saved
// data (C38). A refusal of any kind (a name that is not whole, a hostile year, 160 kin records already, a full Met, a full edge map) returns
// null and leaves no half link: every check comes before the first write, and the one write that can still fail is undone.
//
// What syncKin does, once a year per anchor (stamped by the anchor's `kinY`, the year of the last look), in this order:
//   (1) a married anchor with no spouse link adopts (the three other writers of a wedding: wealth-family.ts markMarried, wealth-kids.ts twice);
//   (2) a spouse link on an anchor that is no longer married ends (an NPC divorce, npc-lives.ts): flag cleared, pair edges removed;
//   (3) a spouse or a child that is dead by `ageTo` (since the year the anchor was last looked at, or the year the record was made) has the
//       death year written into its record. A spouse's death widows the anchor (married false, widowed true, a line in their history, one
//       line for the player when they are close, the fact life.death) and ends the link; a child's death ends the child's link and says
//       the fact. A link whose record is nowhere is dropped without a word;
//   (4) every linked record is kept fresh (its `s` stamped when it is 3 years old), so the Met sweep, which turns a record idle for 6 years
//       into a tombstone, never takes a spouse or an heir; the stake flag alone would turn it into a tombstone with no axes;
//   (5) the orphan sweep: the flags 2 and 4 of a kin record that no living anchor, and no anchor dead for under 10 years, links are cleared,
//       and so are its pair and kin edges, so a leaving anchor never leaves a bound edge behind;
//   and `kinY` is the year.
// Facts stop at 8 a year (`g.yearActions['life.facts']`, shared with L5). No `g.rng`; the only uid is the one log line.
//
// Records are not stepped (`ageTo` says in any year whether one is alive: world/life-path.ts, pure, from the family seed), so a year of 40
// anchors costs a few hundred microseconds. Everything is bounded: an anchor has one spouse and 6 kids, at most 160 kin records exist
// (KIN_CAPS.records), and the scans read at most 5,000 people, the Met shard (600 entries) and the edge map (1,200 keys).
//
// This is a root file (domain life, layer 3). relationships.ts imports it, so it imports neither relationships.ts, nor life.ts, nor
// npc-lives.ts, nor love.ts (an import cycle); it reaches layers 0 to 2 and the light npc-state.ts.
import { relationLabel, log } from './core'
import { emit } from './kernel/bus'
import type { EntityRef } from './kernel/ids'
import { personEntity, personKey } from './kernel/person-ref'
import { streamKey, streamUnit, worldSeed } from './kernel/streams'
import { npcLife, saveNpcLife } from './npc-state'
import { KIN_WIDOWED } from './text/pools'
import { pickLine } from './text/pick'
import { fillSlots } from './text/state'
import type { GameState, Gender, Person } from './types'
import { EDGE_CAPS, MET_CAPS } from './world/caps'
import { putEdge } from './world/edge-write'
import { edgeKey, edgeLocalBound, isSecretKey, type Edge, type EdgeMap, type LinkKind } from './world/edges'
import { fromSeeded } from './world/latent'
import { KIN_CAPS, readKin } from './world/kin'
import { ageTo, type KinBase } from './world/life-path'
import { isTomb, metRecord, metTomb, readMet } from './world/met'
import { evictMet, markMet, STAKE, touchMet } from './world/met-ops'
import { SID_LIMITS, makeSid, parseSid } from './world/sid'
import { socialOn } from './world/social'
import { worldShard } from './world/state'

// ---------------------------------------------------------------------------------------------------------------------------
// The tables

/**
 * The face of a kin record, frozen at its first recording (X57; cross-check section 3.3): the spouse's birth offset is a keyed whole number from
 * `spouseBornOffset[0]` to `spouseBornOffset[1]` around the anchor's birth year, and the spouse is `minWedAge` or more on the day of the wedding;
 * the spouse is of the opposite gender with probability `oppositeGender`; `tag` and `facet` name the keyed values (`streamKey(worldSeed(g), tag,
 * year, anchorKey)` read with `streamUnit(key, facet)`), facets 2 to 15 reserved and unused. After R4 a changed value takes a RECORD_REASON, a
 * row in moved-tests.md and the lead's OK: it moves the name and age of every NPC marriage a seed produces.
 */
export const KIN_IDENTITY = Object.freeze({
  spouseBornOffset: Object.freeze([-4, 4] as const),
  minWedAge: 18,
  oppositeGender: 0.92,
  tag: 'soc.kin',
  facet: Object.freeze({ spouseGender: 0, spouseOffset: 1 }),
})

/**
 * What a record weighs in the Met ranking (spouse 6, child 4) and which stake bit it carries while its link stands: the bits of STAKE
 * (world/met-ops.ts), spouse 2 and heir 4, written as numbers because a module-level read of an import is held to a count (rule (d) of the
 * layers test); the test of this task holds them equal to STAKE.
 */
export const KIN_ROLE = Object.freeze({
  weight: Object.freeze({ spouse: 6, child: 4 }),
  flag: Object.freeze({ spouse: 2, heir: 4 }),
})

/** The first values of the edges a link writes (bound by their kind alone): the numbers of a pair of spouses, and of a parent and a baby each way. */
export const KIN_EDGE = Object.freeze({
  pair: Object.freeze({ out: Object.freeze({ t: 70, f: 70, r: 70 }), back: Object.freeze({ t: 70, f: 70, r: 70 }) }),
  kin: Object.freeze({ out: Object.freeze({ t: 80, f: 80, r: 70 }), back: Object.freeze({ t: 70, f: 80, r: 70 }) }),
})

/** Facts a year (shared with L5), the years of rest before a linked record's `s` is stamped again, and the years a dead anchor keeps its links. */
const FACTS_PER_YEAR = 8
const REFRESH_AFTER = 3
const NEWS_PER_YEAR = 3
const CLOSE_RELATIONSHIP = 55
/** The most people the step reads, as the Met scan does. A function, because a module-level const must not read an import. */
const peopleScan = (): number => MET_CAPS.scan

/** A place of the sid grammar (world/sid.ts): the country id of a kin sid. */
const PLACE = /^[A-Za-z0-9_-]{1,12}$/
/** Control characters and the two line separators: none belongs in a name (the Met reader strips them, which would change the face). */
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/
/** The widest names the Met record keeps (met.ts MET_LIMITS firstMax and lastMax), repeated here so a name that would be cut is refused whole. */
const FIRST_MAX = 24
const LAST_MAX = 32

const SPOUSE_NEVER: ReadonlySet<string> = new Set(['spouse', 'partner', 'fiance', 'pet'])
const CHILD_NEVER: ReadonlySet<string> = new Set(['child', 'stepchild', 'spouse', 'partner', 'fiance', 'pet'])

type Role = 'spouse' | 'child'

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isGender = (x: unknown): x is Gender => x === 'male' || x === 'female'
const wholeYear = (y: unknown): y is number => typeof y === 'number' && Number.isInteger(y) && y >= SID_LIMITS.cohortMin && y <= SID_LIMITS.cohortMax

// ---------------------------------------------------------------------------------------------------------------------------
// The keyed draws and the sid

/**
 * The keyed draws of a spouse's face: whether the spouse is of the opposite gender (92 percent) and the birth offset from the anchor's, a whole
 * number in -4..4. A hash of the family, the year and the anchor, so the same twice, after a reload, a clone, an heir and a fork. Pure.
 */
export function keyedSpouse(familySeed: string, year: number, anchorKey: string): { opposite: boolean; offset: number } {
  const key = streamKey(familySeed, KIN_IDENTITY.tag, year, anchorKey)
  const [lo, hi] = KIN_IDENTITY.spouseBornOffset
  const opposite = streamUnit(key, KIN_IDENTITY.facet.spouseGender) < KIN_IDENTITY.oppositeGender
  const offset = lo + Math.min(hi - lo, Math.floor(streamUnit(key, KIN_IDENTITY.facet.spouseOffset) * (hi - lo + 1)))
  return { opposite, offset }
}

/** How many kin records the shard holds: tombstones are not records. */
function kinRecords(g: GameState): number {
  const shard = readMet(g)
  let n = 0
  for (const k of Object.keys(shard)) if (k.startsWith('kin.') && !isTomb(shard[k])) n++
  return n
}

/**
 * The next sid of a kin record: `kin.<country>.<year>.<ord>`, the ord one above the highest of the Met keys and tombstones with that prefix
 * (0 when there is none). Null for a year outside 1850..2400, a country that is no valid place, and an ord past 9999. Pure.
 */
export function kinSid(g: GameState, country: unknown, year: unknown): string | null {
  if (!wholeYear(year)) return null
  if (typeof country !== 'string' || !PLACE.test(country)) return null
  const prefix = `kin.${country}.${year}.`
  let top = -1
  for (const k of Object.keys(readMet(g))) {
    if (!k.startsWith(prefix)) continue
    const slot = parseSid(k)
    if (slot !== null && slot.ord > top) top = slot.ord
  }
  const ord = top + 1
  if (ord > SID_LIMITS.ordMax) return null
  try {
    return makeSid({ kind: 'kin', place: country, cohort: year, ord })
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------------------------------------------------------
// The writers

/** A name that the Met record keeps exactly as it is: text, whole, not padded, no control character, 1 to `max` characters. */
function wholeName(t: unknown, max: number): t is string {
  return typeof t === 'string' && t.length >= 1 && t.length <= max && t === t.trim() && !CONTROL.test(t)
}

/** The first and last name of a `spouseName` split at the first space ('Juan Carlos de Cuba' is 'Juan' and 'Carlos de Cuba'), or null. */
function splitName(name: unknown): { first: string; last: string } | null {
  if (typeof name !== 'string') return null
  const at = name.indexOf(' ')
  if (at <= 0) return null
  const first = name.slice(0, at)
  const last = name.slice(at + 1)
  return wholeName(first, FIRST_MAX) && wholeName(last, LAST_MAX) ? { first, last } : null
}

/** The anchor's country: its own `data.countryId` when that is text, else the player's. Not checked here: kinSid checks it. */
function countryOf(g: GameState, p: Person): unknown {
  const own = p.data.countryId
  return typeof own === 'string' ? own : g.character.countryId
}

/** The anchor, if it is a Person that can hold a link on a stamped life: alive, with a data bag, and a relation `never` does not name. */
function canAnchor(g: GameState, p: unknown, never: ReadonlySet<string>): p is Person {
  if (!socialOn(g) || !isObject(p) || !isObject(p.data)) return false
  return p.alive === true && typeof p.relation === 'string' && !never.has(p.relation)
}

/** Whether the edge map has room for `need` more bound edges: free places, plus edges that are not bound and can be evicted. */
function edgeRoom(g: GameState, need: number): boolean {
  const map = worldShard<EdgeMap>(g, 'edges') ?? {}
  let n = 0
  let loose = 0
  for (const k of Object.keys(map)) {
    if (isSecretKey(k)) continue
    n++
    if (!edgeLocalBound(map[k]!)) loose++
  }
  const free = EDGE_CAPS.edges - n
  return free >= need || loose >= need - free
}

/** The two edges of a link, written both ways, bound by their kind. Both or neither. */
function writeEdges(g: GameState, anchor: Person, sid: string, kind: Extract<LinkKind, 'pair' | 'kin'>): boolean {
  const a = personEntity(anchor)
  const s = `person:${sid}` as EntityRef
  const out = edgeKey(a, s)
  const back = edgeKey(s, a)
  if (a === 'pool:other' || out === null || back === null) return false
  const year = g.year
  const row = (v: { t: number; f: number; r: number }): Edge => ({ t: v.t, f: v.f, r: v.r, s: 0, o: 0, y: year, l: year, k: kind })
  if (!putEdge(g, out, row(KIN_EDGE[kind].out))) return false
  if (!putEdge(g, back, row(KIN_EDGE[kind].back))) {
    putEdge(g, out, null)
    return false
  }
  return true
}

/** Removes both edges of a link between an anchor and a sid. */
function removeEdges(g: GameState, anchor: Person, sid: string): void {
  const a = personEntity(anchor)
  const s = `person:${sid}` as EntityRef
  const out = edgeKey(a, s)
  const back = edgeKey(s, a)
  if (out !== null) putEdge(g, out, null)
  if (back !== null) putEdge(g, back, null)
}

/** Takes a record back that was just made: its flag off and the record let go (it holds nothing else). */
function undoRecord(g: GameState, sid: string): void {
  markMet(g, sid, { fl: 0 })
  evictMet(g, sid, 'gone')
}

/** The stake flags of a record or a tombstone, 0 for none. */
function flagsOf(g: GameState, sid: string): number {
  return metRecord(g, sid)?.fl ?? metTomb(g, sid)?.[3] ?? 0
}

/** Clears one stake bit of a record or a tombstone; nothing happens for a sid with no entry. */
function clearFlag(g: GameState, sid: string, bit: number): void {
  const fl = flagsOf(g, sid)
  if ((fl & bit) !== 0) markMet(g, sid, { fl: fl & ~bit })
}

/** Says a fact, at most 8 a year across Life (the counter is shared with L5). The count rises only for a fact the bus took. */
function say(g: GameState, kind: 'life.wed' | 'life.birth' | 'life.death', anchor: Person, sid: string, severity: number): void {
  const raw = g.yearActions['life.facts']
  const used = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0
  if (used >= FACTS_PER_YEAR) return
  try {
    if (emit(g, { k: kind, y: g.year, c: personEntity(anchor), a: sid, s: severity })) g.yearActions['life.facts'] = used + 1
  } catch {
    // A fact is news and never the writer's result: a handler that fails leaves the link as it was made.
  }
}

/**
 * Makes the record, the flag and the two edges of one link and writes the link on the anchor. The caller has checked the anchor and the
 * face; this checks the room (160 kin records, the edge map), mints the sid and writes. The sid, or null with nothing written.
 */
function adopt(g: GameState, anchor: Person, role: Role, first: string, last: string, gender: Gender, born: number): string | null {
  const country = countryOf(g, anchor)
  const sid = kinSid(g, country, g.year)
  if (sid === null || typeof country !== 'string') return null
  if (!Number.isInteger(born) || born < 1700) return null
  if (kinRecords(g) >= KIN_CAPS.records) return null
  if (personEntity(anchor) === 'pool:other' || !edgeRoom(g, 2)) return null
  const identity = fromSeeded({ sid, first, last, gender, born, country }, worldSeed(g))
  const weight = role === 'spouse' ? KIN_ROLE.weight.spouse : KIN_ROLE.weight.child
  const flag = role === 'spouse' ? KIN_ROLE.flag.spouse : KIN_ROLE.flag.heir
  if (!touchMet(g, sid, { w: weight, fl: flag }, country, identity)) return null
  const r = metRecord(g, sid)
  if (r === null || r.f !== first || r.l !== last || r.g !== (gender === 'male' ? 1 : 0) || r.b !== born || r.c !== country) {
    undoRecord(g, sid)
    return null
  }
  if (!writeEdges(g, anchor, sid, role === 'spouse' ? 'pair' : 'kin')) {
    undoRecord(g, sid)
    return null
  }
  const had = readKin(anchor)
  if (role === 'spouse') anchor.data.spouseSid = sid
  else anchor.data.kidSids = [...had.kids, sid]
  // The look: records are alive on the day they are made, so a first link starts the clock now; later links keep the anchor's own.
  if (had.spouse === null && had.kids.length === 0) anchor.data.kinY = g.year
  return sid
}

/**
 * The anchor is married and has no spouse link: the spouse becomes a Met record and a link. The anchor must be alive, its relation not
 * spouse, partner, fiance or pet, and `spouseName` text of a first and a last name that the record keeps whole. `identity.gender` is the gender
 * the legacy caller drew (relationships.ts); without one a keyed draw gives it (92 percent opposite). The spouse is born the anchor's birth year
 * plus a keyed offset in -4..4, and 18 or more at the wedding. Null, with nothing written, for an unstamped life or any refusal. See the header.
 */
export function adoptSpouse(g: GameState, anchor: Person, identity?: { gender?: Gender }): string | null {
  try {
    if (!canAnchor(g, anchor, SPOUSE_NEVER) || anchor.data.married !== true) return null
    if (readKin(anchor).spouse !== null) return null
    const name = splitName(anchor.data.spouseName)
    if (name === null) return null
    const age = anchor.age
    if (typeof age !== 'number' || !Number.isFinite(age) || age < 0 || age > 130 || !wholeYear(g.year)) return null
    const draw = keyedSpouse(worldSeed(g), g.year, personKey(anchor))
    const mine: Gender = anchor.gender === 'male' ? 'male' : 'female'
    const keyed: Gender = draw.opposite ? (mine === 'male' ? 'female' : 'male') : mine
    const gender = isGender(identity?.gender) ? identity.gender : keyed
    const born = Math.min(g.year - Math.trunc(age) + draw.offset, g.year - KIN_IDENTITY.minWedAge)
    const sid = adopt(g, anchor, 'spouse', name.first, name.last, gender, born)
    if (sid !== null) say(g, 'life.wed', anchor, sid, 30)
    return sid
  } catch {
    return null
  }
}

/**
 * A baby of an anchor that is not a child or a stepchild (those get a real grandchild Person): the baby becomes a Met record born this year,
 * linked in `kidSids` (at most 6), with a kin edge both ways. `identity` is the legacy draw (name, surname, gender). Null, with nothing
 * written, for an unstamped life, a seventh child, a name the record would not keep whole, or any other refusal.
 */
export function adoptChild(g: GameState, anchor: Person, identity: { first: string; last: string; gender: Gender }): string | null {
  try {
    if (!canAnchor(g, anchor, CHILD_NEVER) || !isObject(identity)) return null
    const { first, last, gender } = identity
    if (!wholeName(first, FIRST_MAX) || !wholeName(last, LAST_MAX) || !isGender(gender)) return null
    if (readKin(anchor).kids.length >= KIN_CAPS.kids || !wholeYear(g.year)) return null
    const sid = adopt(g, anchor, 'child', first, last, gender, g.year)
    if (sid !== null) say(g, 'life.birth', anchor, sid, 25)
    return sid
  } catch {
    return null
  }
}

/**
 * Ends the spouse link of an anchor: `spouseSid` is removed, the spouse flag of the record (or tombstone) is cleared and both pair edges
 * are removed. The record stays (it is evictable now); `married` and `spouseName` are the legacy fields and are not touched. True when a
 * link was there to end; false for an unstamped life or an anchor with none.
 */
export function unlinkSpouse(g: GameState, anchor: Person): boolean {
  try {
    if (!socialOn(g) || !isObject(anchor) || !isObject(anchor.data)) return false
    const sid = readKin(anchor).spouse
    if (sid === null) return false
    removeEdges(g, anchor, sid)
    clearFlag(g, sid, STAKE.spouse)
    delete anchor.data.spouseSid
    return true
  } catch {
    return false
  }
}

/** Ends the link to one child: the sid leaves `kidSids`, the heir flag is cleared and both kin edges are removed. */
function unlinkChild(g: GameState, anchor: Person, sid: string): void {
  removeEdges(g, anchor, sid)
  clearFlag(g, sid, STAKE.heir)
  const kids = readKin(anchor).kids.filter((k) => k !== sid)
  if (kids.length > 0) anchor.data.kidSids = kids
  else delete anchor.data.kidSids
}

// ---------------------------------------------------------------------------------------------------------------------------
// The step

/** Whole years a Person has been dead: 0 when the death year is unknown. */
function deadFor(p: Person, year: number): number {
  const d = p.data.diedYear
  return typeof d === 'number' && Number.isFinite(d) ? year - d : 0
}

/** What the player reads when a close relative is widowed, and what the relative's own history keeps. */
function widowed(g: GameState, p: Person, spouseFirst: string, year: number): void {
  const life = npcLife(p)
  if (life !== null) {
    life.history = [...life.history, `${year}: widowed; ${spouseFirst} died`].slice(-24)
    saveNpcLife(p, life)
  }
  const used = g.yearActions['npc.news'] ?? 0
  if ((p.livesWithPlayer === true || p.relationship >= CLOSE_RELATIONSHIP) && used < NEWS_PER_YEAR) {
    g.yearActions['npc.news'] = used + 1
    const who = `my ${relationLabel(p).toLowerCase()} ${p.firstName}`
    log(g, fillSlots(pickLine(g, KIN_WIDOWED), { who, spouse: spouseFirst }), 'bad')
  }
}

/** Looks at one anchor: steps (1) to (3) of the header. */
function stepAnchor(g: GameState, p: Person, year: number): void {
  if (p.alive !== true) return
  const wed = p.data.married === true
  let links = readKin(p)
  if (wed && links.spouse === null) {
    adoptSpouse(g, p)
    links = readKin(p)
  }
  if (links.spouse === null && links.kids.length === 0) return
  if (links.y === year) return
  if (links.spouse !== null && !wed) {
    unlinkSpouse(g, p)
    links = readKin(p)
  }
  const dead: { sid: string; role: Role; first: string; died: number }[] = []
  const held: [string, Role][] = []
  if (links.spouse !== null) held.push([links.spouse, 'spouse'])
  for (const kid of links.kids) held.push([kid, 'child'])
  for (const [sid, role] of held) {
    const r = metRecord(g, sid)
    if (r === null) {
      // A tombstone is woken by the freshness pass; a link to nobody at all is dropped quietly.
      if (metTomb(g, sid) === null) {
        if (role === 'spouse') unlinkSpouse(g, p)
        else unlinkChild(g, p, sid)
      }
      continue
    }
    const base: KinBase = { sid, born: r.b, health: 35 + r.a[4] / 2 }
    const since = Math.min(year, Math.max(links.y, r.y))
    const life = ageTo(g, base, year, { since, died: r.d })
    if (!life.alive && life.died !== null && life.died <= year) {
      dead.push({ sid, role, first: r.f, died: life.died })
      if (r.d === undefined) touchMet(g, sid, { d: life.died })
    }
  }
  for (const d of dead) {
    if (d.role === 'spouse') {
      p.data.married = false
      p.data.widowed = true
      unlinkSpouse(g, p)
      widowed(g, p, d.first, year)
    } else unlinkChild(g, p, d.sid)
    say(g, 'life.death', p, d.sid, 45)
  }
  if (readKin(p).spouse !== null || readKin(p).kids.length > 0) p.data.kinY = year
}

/** The kin sid at the far end of an edge key, and the other end; null when the key has no kin sid or is not an edge key. */
function kinEnds(key: string): { sid: string; other: string } | null {
  if (!key.includes('person:kin.')) return null
  const at = key.indexOf('>')
  if (at < 0) return null
  const a = key.slice(0, at)
  const b = key.slice(at + 1)
  if (a.startsWith('person:kin.')) return { sid: a.slice('person:'.length), other: b }
  if (b.startsWith('person:kin.')) return { sid: b.slice('person:'.length), other: a }
  return null
}

/**
 * The yearly step of the kin records (the module life.kin, aging seam, life phase, order 37, right before relationships). See the header.
 * Idempotent by the anchors' `kinY`; a no-op for a life the social stamp does not mark.
 */
export function syncKin(g: GameState): void {
  if (!socialOn(g)) return
  const year = g.year
  if (!wholeYear(year) || !Array.isArray(g.people)) return
  const people = g.people
  const scan = Math.min(people.length, peopleScan())
  for (let i = 0; i < scan; i++) {
    const p = people[i]
    if (!isObject(p) || !isObject(p.data) || p.relation === 'pet') continue
    stepAnchor(g, p as unknown as Person, year)
  }

  // Who links whom now: every anchor that keeps its links (alive, or dead for under 10 years).
  const linked = new Map<string, { entity: string; role: Role }>()
  for (let i = 0; i < scan; i++) {
    const p = people[i]
    if (!isObject(p) || !isObject(p.data) || p.relation === 'pet') continue
    const person = p as unknown as Person
    if (person.alive !== true && deadFor(person, year) >= KIN_CAPS.deadYears) continue
    const links = readKin(person)
    const entity = personEntity(person)
    if (links.spouse !== null) linked.set(links.spouse, { entity, role: 'spouse' })
    for (const kid of links.kids) linked.set(kid, { entity, role: 'child' })
  }

  // (4) Keep every linked record fresh.
  for (const [sid, { role }] of linked) {
    const r = metRecord(g, sid)
    if (r !== null ? year - r.s >= REFRESH_AFTER : metTomb(g, sid) !== null) touchMet(g, sid, { w: role === 'spouse' ? KIN_ROLE.weight.spouse : KIN_ROLE.weight.child })
  }

  // (5) The orphan sweep: flags and edges of a record nobody keeps.
  const shard = readMet(g)
  for (const sid of Object.keys(shard)) {
    if (!sid.startsWith('kin.') || linked.has(sid)) continue
    const fl = flagsOf(g, sid)
    if ((fl & (STAKE.spouse | STAKE.heir)) !== 0) markMet(g, sid, { fl: fl & ~(STAKE.spouse | STAKE.heir) })
  }
  const edges = worldShard<EdgeMap>(g, 'edges') ?? {}
  const orphans: string[] = []
  for (const key of Object.keys(edges)) {
    if (isSecretKey(key)) continue
    const ends = kinEnds(key)
    if (ends === null) continue
    const k = edges[key]!.k
    if (k !== 'pair' && k !== 'kin') continue
    if (linked.get(ends.sid)?.entity !== ends.other) orphans.push(key)
  }
  for (const key of orphans) putEdge(g, key, null)
}
