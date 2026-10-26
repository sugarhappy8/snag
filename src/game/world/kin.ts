// The kin links on Person.data (R4-L3, D.5 b): who a relative's spouse and children are, as the saved shape and the pure readers of it.
// A relative (the anchor: a sibling, a child, a parent, a friend) marries and has babies. Life (L4) mirrors those on the anchor as
// Met records, so the face of the new relative is stored once; this file is the shape of the link and everything that reads it. It has
// no writer: nothing here changes the game, and a life that is not stamped by the social flag (X6) never gets a link at all.
//
// The links, all optional, on `Person.data` of the anchor (each is cut by its own reader, `readKin`):
//   spouseSid   the sid of the anchor's spouse (one)
//   kidSids     the sids of the anchor's children (at most 6, no repeat)
//   kinY        the year Life last looked at the links (1700..2600); the year the next look starts from
//   estateY, widowed, kin   written by L4 and L5 (the year an estate was settled, a widowing, the label of a materialized relative);
//               not read here, listed so the comment on Person.data names every key
// A kid is never a sid on a child, a stepchild or a grandchild Person: `heirUnsafe` (kernel/person-ref.ts, C36) names that shape.
//
// The readers (all pure: no luck, no write, no uid, a new object each call, a deep-frozen state is fine):
//   readKin(p)           the links, total: a value that is no sid of the strict grammar (world/sid.ts) is dropped, the kids are deduped and
//                        cut to 6 (the first 64 entries are looked at), the spouse is not a kid, kinY is cut into 1700..2600 (0 when none)
//   kinView(g, p)        the members: the spouse, then the kids by birth. A member is the Person that holds the sid (alive or dead) or else
//                        the Met record, aged by ageTo(since = kinY, died = the record's d) with the health 35 + steadiness / 2. A link
//                        to nobody (no Person, no record, only a tombstone) and a link to the anchor itself are absent. At most 7
//   kinHeirIds(g, dead)  the ids of the living Persons among them, in the same order (the spouse, then the kids by birth)
//   kinPending(g, dead)  the sids of the living records among them that are not Persons yet
//   kinLabel(...)        'sister-in-law', 'brother-in-law', 'niece', 'nephew', 'daughter-in-law', 'son-in-law', or '' (see below)
//   kinProblems(g)       every way the links of a state are wrong, one line each, at most 64 and 'and more'
//
// A Person is the live truth, a record the stored one: when both exist the Person is read. The age of a Person is its age, its birth is
// the year it died (data.diedYear, or this year when it has none) less that age, and it is unwell when its health is under 40, the
// line ageTo draws for a record. g.people is read to its first 5,000 entries (the scan of the Met shard), so a hostile list costs a
// bounded amount; the game keeps a few hundred.
//
// What kinProblems names (the invariant "one spouse, mutual" of the design, 14.1 row 10; L4 added the edge half):
//   - a link to a sid that is neither a Person of g.people nor a Met record (a tombstone is not a record);
//   - more than 6 kids, a spouseSid or a kid that is no sid, kidSids that is no list;
//   - a link to the anchor itself, a sid linked as the spouse and as a kid, a link on the player's own spouse (relation 'spouse');
//   - a sid on a child, a stepchild or a grandchild (heirUnsafe);
//   - a spouse sid linked by two living anchors;
//   - a Met record with the spouse or heir flag (fl bit 2 or 4) that no living anchor, and no anchor dead for under KIN_CAPS.deadYears,
//     links. Life's yearly sweep clears such a flag in the year it appears, so after any year one is a fault and not a lag;
//   - on a stamped life (the social stamp, X6), a spouse link whose `pair` edge, or a child link whose `kin` edge, is missing in either
//     direction (anchor > relative, relative > anchor), or is there without its kind (R4-L4 writes both edges with the link and removes
//     them with it). An anchor dead for KIN_CAPS.deadYears years is let go, so it holds no edge either.
// An anchor dead for KIN_CAPS.deadYears years or more (data.diedYear) is let go: its links need not resolve and hold no record, because
// the sweep has cleared the flags and the record may be evicted. A dead anchor with no death year is not known to be old, so it holds.
//
// Layer 2. It imports the kernel's person key, the sid grammar, the Met reader, the edge reader, the stamp, the life path and the types;
// nothing above layer 2.
// `dynasty-ownership.ts` (business) may import it for the stake heirs without a domain pair.
import type { EntityRef } from '../kernel/ids'
import { heirUnsafe, personEntity, personKey } from '../kernel/person-ref'
import type { Gender, GameState, Person } from '../types'
import { MET_CAPS } from './caps'
import { readEdge, type LinkKind } from './edges'
import { ageTo, type KinBase } from './life-path'
import { isTomb, metRecord, readMet, type MetRecord } from './met'
import { isSid, parseSid } from './sid'
import { socialOn } from './social'

/**
 * The ceilings of the kin links, stated once: 6 kids an anchor, 160 kin records in the Met shard (L4 refuses a 161st), 7 heirs (the
 * spouse and 6 kids), 30 materialized relatives alive at once (L5), and the years an anchor that died keeps its links: 10.
 */
export const KIN_CAPS = Object.freeze({ kids: 6, records: 160, heirs: 7, persons: 30, deadYears: 10 } as const)

/** The links of an anchor, read: the spouse sid or null, the kid sids, and the year of the last look (0 when none). */
export interface KinLinks {
  spouse: string | null
  kids: readonly string[]
  y: number
}

/** One relative of an anchor, as a screen would show it. `person` is the Person that holds the sid, or null for a record. */
export interface KinMember {
  key: string
  role: 'spouse' | 'child'
  first: string
  last: string
  gender: Gender
  born: number
  country: string
  age: number
  alive: boolean
  unwell: boolean
  person: Person | null
}

/** The years kinY may be, the ones ageTo reads a birth in. */
const YEAR_MIN = 1700
const YEAR_MAX = 2600
/** Entries of a kid list that are looked at, so a list of a million is read in a bounded time. */
const KIDS_SCAN = 64
/** People of g.people that are looked at: the scan of the Met shard. A function, because a module-level const must not read an import. */
const peopleScan = (): number => MET_CAPS.scan
/** Lines kinProblems returns at most. */
const PROBLEMS_MAX = 64
/** Health under this is unwell (the line ageTo draws for a record). */
const HEALTH_FRAIL = 40

type Bag = Record<string, unknown>

const hasOwn = (o: object, key: string): boolean => Object.prototype.hasOwnProperty.call(o, key)

/** `p.data` when it is an object that is no list; null for anything else (a very old save can hold a person with no data). */
function bagOf(p: unknown): Bag | null {
  if (typeof p !== 'object' || p === null) return null
  const d = (p as { data?: unknown }).data
  return typeof d === 'object' && d !== null && !Array.isArray(d) ? (d as Bag) : null
}

/** A field of the bag as the bag itself holds it: an inherited property is never one of its fields. */
const ownOf = (bag: Bag, key: string): unknown => (hasOwn(bag, key) ? bag[key] : undefined)

/** A year, whole and cut into 1700..2600; 0 for anything that is no finite number. */
function yearOf(x: unknown): number {
  if (typeof x !== 'number' || !Number.isFinite(x)) return 0
  const n = Math.trunc(x)
  return (n < YEAR_MIN ? YEAR_MIN : n > YEAR_MAX ? YEAR_MAX : n) + 0
}

// ---------------------------------------------------------------------------------------------------------------------------
// The reader
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * The links of an anchor. Total: any value in, links out. A spouse or a kid is kept only when it is a sid of the strict grammar; the
 * kids are deduped and cut to 6 (the first 64 entries are looked at), and a kid that is the spouse is the spouse only. A new object
 * and a new list every call.
 */
export function readKin(p: Pick<Person, 'data'>): KinLinks {
  try {
    const bag = bagOf(p)
    if (bag === null) return { spouse: null, kids: [], y: 0 }
    const rawSpouse = ownOf(bag, 'spouseSid')
    const spouse = isSid(rawSpouse) ? rawSpouse : null
    const kids: string[] = []
    const rawKids = ownOf(bag, 'kidSids')
    if (Array.isArray(rawKids)) {
      const n = Math.min(rawKids.length, KIDS_SCAN)
      for (let i = 0; i < n && kids.length < KIN_CAPS.kids; i++) {
        const v: unknown = rawKids[i]
        if (isSid(v) && v !== spouse && !kids.includes(v)) kids.push(v)
      }
    }
    return { spouse, kids, y: yearOf(ownOf(bag, 'kinY')) }
  } catch {
    return { spouse: null, kids: [], y: 0 }
  }
}

// ---------------------------------------------------------------------------------------------------------------------------
// The views
// ---------------------------------------------------------------------------------------------------------------------------

/** The people of the state: the list itself, or none when it is no list. */
function peopleOf(g: { people?: unknown }): readonly unknown[] {
  return Array.isArray(g.people) ? (g.people as unknown[]) : []
}

/** A person of g.people: an object (a hostile list may hold anything). */
const isPerson = (x: unknown): x is Person => typeof x === 'object' && x !== null

/** The Persons that hold these keys: one pass over the first 5,000, stopping when every key is found; the first holder of a key wins. */
function holders(g: { people?: unknown }, keys: readonly string[]): Map<string, Person> {
  const found = new Map<string, Person>()
  if (keys.length === 0) return found
  const want = new Set(keys)
  const list = peopleOf(g)
  const n = Math.min(list.length, peopleScan())
  for (let i = 0; i < n && found.size < want.size; i++) {
    const p = list[i]
    if (!isPerson(p)) continue
    const key = personKey(p)
    if (want.has(key) && !found.has(key)) found.set(key, p)
  }
  return found
}

/** The finite number `x` made whole, or 0. */
const countOf = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.trunc(x)) : 0)

/** The year a Person was born: the year it died (or this year, for the living and for a death with no year) less its age. */
function bornOfPerson(g: Pick<GameState, 'year'>, p: Person, bag: Bag | null): number {
  const died = bag === null ? undefined : ownOf(bag, 'diedYear')
  const at = p.alive !== true && typeof died === 'number' && Number.isFinite(died) ? died : g.year
  return at - countOf(p.age)
}

/** One linked relative before it is read: the key, the role, the Person or the record that stands for it, and the birth year. */
interface Held {
  key: string
  role: 'spouse' | 'child'
  person: Person | null
  record: Readonly<MetRecord> | null
  born: number
}

/** The relatives of an anchor in view order: the spouse, then the kids by birth (ties in link order). Absent links are left out. */
function heldOf(g: Pick<GameState, 'world' | 'people' | 'year'>, anchor: Person, links: KinLinks): Held[] {
  const self = personKey(anchor)
  const roles: [string, 'spouse' | 'child'][] = []
  if (links.spouse !== null && links.spouse !== self) roles.push([links.spouse, 'spouse'])
  for (const kid of links.kids) if (kid !== self) roles.push([kid, 'child'])
  const by = holders(g, roles.map((r) => r[0]))
  const spouse: Held[] = []
  const kids: Held[] = []
  for (const [key, role] of roles) {
    const person = by.get(key) ?? null
    const record = person === null ? metRecord(g, key) : null
    if (person === null && record === null) continue
    const born = person !== null ? bornOfPerson(g, person, bagOf(person)) : record!.b
    ;(role === 'spouse' ? spouse : kids).push({ key, role, person, record, born })
  }
  kids.sort((a, b) => a.born - b.born)
  return [...spouse, ...kids]
}

/** The country of a Person that holds a sid: its own, else the place of the sid (a kin sid carries its country). */
function countryOfPerson(p: Person, key: string): string {
  const bag = bagOf(p)
  const own = bag === null ? undefined : ownOf(bag, 'countryId')
  if (typeof own === 'string') return own
  return parseSid(key)?.place ?? ''
}

const textOf = (x: unknown): string => (typeof x === 'string' ? x : '')

/** The member a held relative reads as in the year of the state. */
function memberOf(g: Pick<GameState, 'lifeId' | 'flags' | 'year'>, h: Held, since: number): KinMember {
  const p = h.person
  if (p !== null) {
    const alive = p.alive === true
    const health = (p.stats as { health?: unknown } | undefined)?.health
    return {
      key: h.key,
      role: h.role,
      first: textOf(p.firstName),
      last: textOf(p.lastName),
      gender: p.gender === 'male' ? 'male' : 'female',
      born: h.born,
      country: countryOfPerson(p, h.key),
      age: countOf(p.age),
      alive,
      unwell: alive && typeof health === 'number' && health < HEALTH_FRAIL,
      person: p,
    }
  }
  const r = h.record!
  const sid = h.key
  const base: KinBase = { sid, born: r.b, health: 35 + r.a[4] / 2 }
  const life = ageTo(g, base, g.year, { since: since > 0 ? since : undefined, died: r.d })
  return { key: h.key, role: h.role, first: r.f, last: r.l, gender: r.g === 1 ? 'male' : 'female', born: r.b, country: r.c, age: life.age, alive: life.alive, unwell: life.unwell, person: null }
}

/**
 * The relatives of an anchor: the spouse, then the kids by birth, at most 7. A relative is the Person that holds the sid (alive or
 * dead) or else the Met record, aged by ageTo from the anchor's kinY; a link to nobody is left out. Pure.
 */
export function kinView(g: Pick<GameState, 'world' | 'people' | 'lifeId' | 'flags' | 'year'>, p: Person): readonly KinMember[] {
  const links = readKin(p)
  return heldOf(g, p, links).map((h) => memberOf(g, h, links.y))
}

/**
 * The ids of the living Persons among the relatives of `dead`: the spouse, then the kids by birth (the older first, ties in link
 * order), at most 7. A record that is not a Person yet is not an heir here (kinPending names it). Pure, and it reads no year.
 */
export function kinHeirIds(g: Pick<GameState, 'people' | 'world'>, dead: Person): string[] {
  const links = readKin(dead)
  const self = personKey(dead)
  const spouse = links.spouse !== null && links.spouse !== self ? links.spouse : null
  const kids = links.kids.filter((kid) => kid !== self)
  const by = holders(g, spouse === null ? kids : [spouse, ...kids])
  const out: string[] = []
  const wife = spouse === null ? undefined : by.get(spouse)
  if (wife !== undefined && wife.alive === true) out.push(wife.id)
  const living: Person[] = []
  for (const kid of kids) {
    const p = by.get(kid)
    if (p !== undefined && p.alive === true) living.push(p)
  }
  living.sort((a, b) => countOf(b.age) - countOf(a.age))
  for (const p of living) if (out.length < KIN_CAPS.heirs) out.push(p.id)
  return out
}

/** The sids of the living records among the relatives of `dead` that are not Persons yet, in view order. Pure. */
export function kinPending(g: Pick<GameState, 'people' | 'world' | 'lifeId' | 'flags' | 'year'>, dead: Person): string[] {
  const links = readKin(dead)
  const out: string[] = []
  for (const h of heldOf(g, dead, links)) {
    if (h.person === null && memberOf(g, h, links.y).alive) out.push(h.key)
  }
  return out
}

// ---------------------------------------------------------------------------------------------------------------------------
// The labels
// ---------------------------------------------------------------------------------------------------------------------------

const SIBLINGS: ReadonlySet<string> = new Set(['sibling', 'halfSibling', 'stepsibling'])
const CHILDREN: ReadonlySet<string> = new Set(['child', 'stepchild'])

/**
 * What a relative of an anchor is called to the player, the word that goes in `data.kin` when the relative becomes a Person (X38):
 * a sibling's spouse is a sister-in-law or a brother-in-law, a sibling's child a niece or a nephew, a child's spouse a daughter-in-law
 * or a son-in-law. Anything else is '' (a friend's kin, and the children of a child or a parent, who have a relation of their own).
 * Every word matches /^[a-z][a-z -]{0,19}$/, the rule relationLabel applies. The anchor's gender is part of the contract and decides
 * nothing. Total: a gender, a role or an anchor that is none reads as ''.
 */
export function kinLabel(role: 'spouse' | 'child', gender: Gender, anchor: Pick<Person, 'relation' | 'gender'>): string {
  const relation = (anchor as { relation?: unknown } | null | undefined)?.relation
  if (typeof relation !== 'string' || (gender !== 'male' && gender !== 'female')) return ''
  const male = gender === 'male'
  if (role === 'spouse') {
    if (SIBLINGS.has(relation)) return male ? 'brother-in-law' : 'sister-in-law'
    if (CHILDREN.has(relation)) return male ? 'son-in-law' : 'daughter-in-law'
    return ''
  }
  return role === 'child' && SIBLINGS.has(relation) ? (male ? 'nephew' : 'niece') : ''
}

// ---------------------------------------------------------------------------------------------------------------------------
// The problems
// ---------------------------------------------------------------------------------------------------------------------------

/** Control characters, and the two line separators: none of them belongs in a line of a report. */
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g

/** A hostile id or sid for a message: the control characters out and 44 characters at most. */
function shown(x: unknown): string {
  const t = (typeof x === 'string' ? x : '?').slice(0, 64).replace(CONTROL, '?')
  return t.length > 44 ? `${t.slice(0, 44)}...` : t
}

/** An anchor that holds links: its id for a message, its links (not itself), and whether it keeps them (alive, or dead under 10 years). */
interface Anchor {
  id: string
  keys: string[]
  holds: boolean
}

/** Whole years since a Person died, 0 when the death year is unknown (it is then not known to be old). */
function deadFor(bag: Bag | null, year: number): number {
  const d = bag === null ? undefined : ownOf(bag, 'diedYear')
  return typeof d === 'number' && Number.isFinite(d) ? year - d : 0
}

/**
 * Every way the kin links of a state are wrong, one line each, none for a state without links: see the header for the list. At most
 * 64 lines and then 'and more', whatever the state holds; reads at most 5,000 people and the Met shard (600 entries). Pure, and it works
 * on a frozen state. worldProblems prefixes each line with "kin: ".
 */
export function kinProblems(g: Pick<GameState, 'people' | 'world' | 'year'>): string[] {
  const out: string[] = []
  let more = false
  const add = (line: string): void => {
    if (out.length < PROBLEMS_MAX) out.push(line)
    else more = true
  }
  const year = typeof g.year === 'number' && Number.isFinite(g.year) ? g.year : 0
  const stamped = socialOn(g)
  const list = peopleOf(g)
  const scanned = Math.min(list.length, peopleScan())
  const anchors: Anchor[] = []
  const spouses = new Map<string, number>()

  for (let i = 0; i < scanned; i++) {
    const p = list[i]
    if (!isPerson(p)) continue
    const id = shown(p.id)
    if (heirUnsafe(p)) add(`person ${id} is a ${shown(p.relation)} and carries sid ${shown(personKey(p))}`)
    const bag = bagOf(p)
    if (bag === null) continue
    const rawSpouse = ownOf(bag, 'spouseSid')
    const rawKids = ownOf(bag, 'kidSids')
    const hasSpouse = rawSpouse !== undefined && rawSpouse !== null
    const hasKids = rawKids !== undefined && rawKids !== null
    if (!hasSpouse && !hasKids) continue

    // The shape of what is stored.
    if (hasSpouse && !isSid(rawSpouse)) add(`person ${id} spouseSid is not a sid`)
    if (hasKids) {
      if (!Array.isArray(rawKids)) add(`person ${id} kidSids is not a list`)
      else {
        if (rawKids.length > KIN_CAPS.kids) add(`person ${id} links ${rawKids.length} kids, more than the ${KIN_CAPS.kids} allowed`)
        const n = Math.min(rawKids.length, KIDS_SCAN)
        let junk = false
        for (let k = 0; k < n; k++) {
          const v: unknown = rawKids[k]
          if (!isSid(v)) junk = true
          else if (v === rawSpouse) add(`person ${id} links ${v} as the spouse and as a kid`)
        }
        if (junk) add(`person ${id} kidSids holds a value that is no sid`)
      }
    }

    // What the links say.
    const links = readKin(p)
    const self = personKey(p)
    const keys: string[] = []
    if (links.spouse !== null) keys.push(links.spouse)
    for (const kid of links.kids) keys.push(kid)
    if (keys.includes(self)) add(`person ${id} links itself`)
    if (p.relation === 'spouse' && keys.length > 0) add(`person ${id} is the player's spouse and carries kin links`)
    const alive = p.alive === true
    const holds = alive || deadFor(bag, year) < KIN_CAPS.deadYears
    if (alive && links.spouse !== null && links.spouse !== self) spouses.set(links.spouse, (spouses.get(links.spouse) ?? 0) + 1)
    anchors.push({ id, keys: keys.filter((k) => k !== self), holds })

    // The edge half: each link of an anchor that keeps its links has its edge both ways, marked with its kind.
    const entity = personEntity(p)
    if (stamped && holds && entity !== 'pool:other') {
      const check = (member: string, role: string, kind: LinkKind): void => {
        if (member === self) return
        const far = `person:${member}` as EntityRef
        for (const way of ['out', 'back'] as const) {
          const e = way === 'out' ? readEdge(g, entity, far) : readEdge(g, far, entity)
          if (e === null || e.k !== kind) add(`person ${id} ${role} ${shown(member)} has no ${kind} edge ${way}`)
        }
      }
      if (links.spouse !== null) check(links.spouse, 'spouse', 'pair')
      for (const kid of links.kids) check(kid, 'child', 'kin')
    }
  }

  // Every link of an anchor that keeps its links is a Person or a record, and so is held.
  const linked = new Set<string>()
  const keepers = anchors.filter((a) => a.holds && a.keys.length > 0)
  if (keepers.length > 0) {
    const people = new Set<string>()
    for (let i = 0; i < scanned; i++) {
      const p = list[i]
      if (isPerson(p)) people.add(personKey(p))
    }
    for (const a of keepers) {
      for (const key of a.keys) {
        linked.add(key)
        if (!people.has(key) && metRecord(g, key) === null) add(`person ${a.id} links ${key}, which is neither a person nor a record`)
      }
    }
  }
  for (const [key, n] of spouses) if (n > 1) add(`spouse ${key} is linked by ${n} living people`)

  // A record that carries the spouse or heir flag is linked by someone.
  const shard = readMet(g)
  for (const key of Object.keys(shard)) {
    const v = shard[key]!
    if (isTomb(v)) continue
    if (((v as MetRecord).fl & 6) !== 0 && !linked.has(key)) add(`record ${key} carries the spouse or heir flag and no living or recently dead person links it`)
  }
  if (more) out.push('and more')
  return out
}
