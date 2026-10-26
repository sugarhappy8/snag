// ci: fast
// R4-L3 (D.5 b): the kin links on Person.data and their pure readers (src/game/world/kin.ts). A relative's spouse and children are
// named on the relative: `spouseSid` (one sid), `kidSids` (at most 6) and `kinY` (the year of the last look). This task ships the
// shape, the caps, the total reader, the views and the problems list; no writer exists yet (L4 writes the links on a stamped life), so
// nothing in a played life reads or writes a link here, and the file draws no number.
//
// What the file proves, in the order of the plan: the reader is total and bounded (hostile links read as none or are cut), a view of
// a Person that holds a sid and a view of a Met record of the same face agree, the order is the spouse and then the kids by birth,
// the labels all match the rule relationLabel applies, every reader leaves a deep-frozen state alone with g.rng trapped, a state with
// 40,000 anchors costs a bounded amount, and kinProblems names each fault (two anchors linking one spouse, a flagged record no anchor
// links, a link to nobody, a self link, a link on the player's own spouse, a sid on a child, more than 6 kids).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import type { GameState, Gender, Person, RelationKind } from '../src/game/types'
import { MET_CAPS } from '../src/game/world/caps'
import { worldProblems } from '../src/game/world/invariants'
import { KIN_CAPS, kinHeirIds, kinLabel, kinPending, kinProblems, kinView, readKin, type KinMember } from '../src/game/world/kin'
import { ageTo } from '../src/game/world/life-path'
import type { MetRecord, MetShard, Tomb } from '../src/game/world/met'
import '../src/game/world/shards'
import { makeSid } from '../src/game/world/sid'
import { trapRng } from './effort-kit'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const FILE = 'src/game/world/kin.ts'
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)
const YEAR = 2026

type Rec = Record<string, unknown>

// ---------------------------------------------------------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------------------------------------------------------

const FIRSTS = ['Ana', 'Mateo', 'Ingrid', 'Rashid', 'Bao', 'Odalys']
const LASTS = ['Ruiz', 'de Cuba', 'Lindqvist', 'Okonkwo-Reyes']

/** A kin sid of the strict grammar. The cohort carries the index too, so 40,000 of them stay distinct. */
const sidOf = (i: number, place = 'us'): string => makeSid({ kind: 'kin', place, cohort: 1850 + (i % 500), ord: Math.floor(i / 500) % 10_000 })

/** A valid Met record. Nothing is held on it. */
function rec(i: number, over: Partial<MetRecord> = {}): MetRecord {
  return { f: FIRSTS[i % 6]!, l: LASTS[i % 4]!, g: (i % 2) as 0 | 1, b: 1985, c: 'us', k: 0, a: [50, 50, 50, 50, 70], y: 2015, s: 2024, w: 4, fl: 0, gr: 0, ob: 0, ...over }
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
/** A shard of these entries in ascending key order (plain code-unit order). */
const shardOf = (entries: readonly (readonly [string, MetRecord | Tomb])[]): MetShard => Object.fromEntries([...entries].sort((a, b) => cmp(a[0], b[0]))) as MetShard

const STATS = { happiness: 50, health: 70, smarts: 50, looks: 50 }
function person(id: string, relation: RelationKind, data: Rec = {}, over: Partial<Person> = {}): Person {
  return { id, firstName: 'Ann', lastName: 'Lee', gender: 'female', age: 45, alive: true, relation, relationship: 50, stats: { ...STATS }, money: 0, occupation: 'Unemployed', traits: [], yearsKnown: 3, livesWithPlayer: false, notes: [], data: data as Person['data'], ...over }
}

/** A game of the test year holding these people and this Met shard. */
function game(people: Person[], shard: MetShard | null = null): GameState {
  const g = makeTestGame(7, { age: 40, money: 50_000 })
  g.people = people
  if (shard !== null) (g as { world?: unknown }).world = { v: 1, met: shard }
  return g
}

const json = (x: unknown): string => JSON.stringify(x)

/** The members of a view, without the Person reference, for comparing a Person-kin with a record-kin. */
const flat = (m: KinMember): Omit<KinMember, 'person'> => {
  const { person: _person, ...rest } = m
  return rest
}

// ---------------------------------------------------------------------------------------------------------------------------
// The contract
// ---------------------------------------------------------------------------------------------------------------------------

describe('the caps', () => {
  it('states the caps of the plan: 6 kids, 160 records, 7 heirs, 30 persons, 10 years dead', () => {
    expect(KIN_CAPS).toEqual({ kids: 6, records: 160, heirs: 7, persons: 30, deadYears: 10 })
    expect(Object.isFrozen(KIN_CAPS)).toBe(true)
  })
})

describe('readKin: the links of an anchor', () => {
  const S = sidOf(1)
  const K = [sidOf(2), sidOf(3), sidOf(4)]

  it('reads a spouse sid, the kid sids in order and the year of the last look', () => {
    expect(readKin({ data: { spouseSid: S, kidSids: K, kinY: 2024 } })).toEqual({ spouse: S, kids: K, y: 2024 })
  })

  it('reads an anchor with no links, no data, data that is no object and a value that is no person as none', () => {
    const none = { spouse: null, kids: [], y: 0 }
    expect(readKin({ data: {} })).toEqual(none)
    for (const bad of [undefined, null, 5, 'x', [], { data: undefined }, { data: null }, { data: [] }, { data: 'spouseSid' }, { data: 7 }]) {
      expect(readKin(bad as unknown as Pick<Person, 'data'>), json(bad)).toEqual(none)
    }
  })

  it('reads a spouse that is not a sid of the strict grammar as none: numbers, __proto__, constructor, 53 characters, unicode, a lenient id', () => {
    const hostile: unknown[] = [5, 0, NaN, Infinity, true, null, {}, [], [S], '', ' ', '__proto__', 'constructor', 'toString', 'hasOwnProperty', 'x'.repeat(53), 's77', 's-42', 'p12', 'a1', 'out.Ann.Lee', `person:${S}`, `${S} `, S.toUpperCase(), `${S}x`, 'é中😀', '‮', `${S}\u0000`]
    for (const v of hostile) {
      expect(readKin({ data: { spouseSid: v as never } }).spouse, String(v)).toBeNull()
      expect(readKin({ data: { kidSids: [v] as never } }).kids, String(v)).toEqual([])
    }
  })

  it('reads kids that are no list as none: a sid on its own, a string, a number, an object', () => {
    for (const v of [S, 'x', 5, { 0: S, length: 1 }, null, true]) expect(readKin({ data: { kidSids: v as never } }).kids, String(v)).toEqual([])
  })

  it('cuts 500 kids to 6, dropping what is no sid and keeping the order', () => {
    const many: unknown[] = []
    for (let i = 0; i < 500; i++) many.push(i % 3 === 0 ? 'junk' : sidOf(10 + i))
    const got = readKin({ data: { kidSids: many as never } }).kids
    expect(got).toHaveLength(KIN_CAPS.kids)
    expect(got).toEqual(many.filter((v) => v !== 'junk').slice(0, 6))
    // A list of nothing but junk reads as none, whatever its length.
    expect(readKin({ data: { kidSids: new Array(100_000).fill('junk') as never } }).kids).toEqual([])
  })

  it('dedupes the kids, and a kid that is also the spouse is a spouse only', () => {
    expect(readKin({ data: { kidSids: [K[0], K[1], K[0], K[1], K[2], K[0]] } }).kids).toEqual(K)
    expect(readKin({ data: { spouseSid: K[0], kidSids: [K[0], K[1]] } })).toEqual({ spouse: K[0], kids: [K[1]], y: 0 })
  })

  it('cuts kinY into 1700..2600 and reads a year that is no finite number as 0', () => {
    const y = (v: unknown): number => readKin({ data: { kinY: v as never } }).y
    expect(y(2024)).toBe(2024)
    expect(y(2024.9)).toBe(2024)
    expect(y(1e300)).toBe(2600)
    expect(y(-1e300)).toBe(1700)
    expect(y(5)).toBe(1700)
    expect(y(2601)).toBe(2600)
    expect(y(-0.4)).toBe(1700)
    for (const v of [NaN, Infinity, -Infinity, '2024', null, true, {}, [2024], undefined]) expect(y(v), String(v)).toBe(0)
  })

  it('reads own properties only: a value inherited from a prototype is no link', () => {
    const inherited = Object.create({ spouseSid: S, kidSids: K, kinY: 2024 }) as Person['data']
    expect(readKin({ data: inherited })).toEqual({ spouse: null, kids: [], y: 0 })
    const polluted = JSON.parse('{"__proto__": {"spouseSid": "x"}, "constructor": {"kidSids": 1}}') as Person['data']
    expect(readKin({ data: polluted })).toEqual({ spouse: null, kids: [], y: 0 })
  })

  it('returns a new object each time that shares nothing with the stored list', () => {
    const p = person('p1', 'sibling', { spouseSid: S, kidSids: [...K], kinY: 2024 })
    const a = readKin(p)
    const b = readKin(p)
    expect(a).not.toBe(b)
    expect(a.kids).not.toBe(b.kids)
    expect(a.kids).not.toBe(p.data.kidSids)
    ;(a.kids as string[]).push('changed')
    expect(readKin(p).kids).toEqual(K)
    expect(p.data.kidSids).toEqual(K)
  })

  it('reads a deep-frozen anchor with g.rng trapped', () => {
    const p = deepFreeze(person('p1', 'sibling', { spouseSid: S, kidSids: [...K], kinY: 2024 }))
    expect(readKin(p)).toEqual({ spouse: S, kids: K, y: 2024 })
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------------------------------------------------------

/** A sibling anchor with a spouse record and two kid records. kinY is this year, so the scan of ageTo has nothing to roll. */
function family(over: Rec = {}): { g: GameState; anchor: Person; spouse: string; kids: string[] } {
  const spouse = sidOf(1)
  const kids = [sidOf(2), sidOf(3)]
  const anchor = person('p1', 'sibling', { spouseSid: spouse, kidSids: kids, kinY: YEAR, countryId: 'us', ...over })
  const g = game(
    [anchor],
    shardOf([
      [spouse, rec(1, { f: 'Ana', l: 'Ruiz', g: 0, b: 1982, c: 'es', a: [50, 50, 50, 50, 0], fl: 2 })],
      [kids[0]!, rec(2, { f: 'Mateo', l: 'Ruiz', g: 1, b: 2010, c: 'es', a: [50, 50, 50, 50, 100], fl: 4 })],
      [kids[1]!, rec(3, { f: 'Ingrid', l: 'Ruiz', g: 0, b: 2014, c: 'es', a: [50, 50, 50, 50, 40], fl: 4 })],
    ]),
  )
  return { g, anchor, spouse, kids }
}

describe('kinView', () => {
  it('lists the spouse and then the kids by birth, each with the face its record stored', () => {
    const { g, anchor, spouse, kids } = family()
    const view = kinView(g, anchor)
    expect(view.map((m) => [m.key, m.role])).toEqual([[spouse, 'spouse'], [kids[0], 'child'], [kids[1], 'child']])
    expect(view.map((m) => `${m.first} ${m.last}`)).toEqual(['Ana Ruiz', 'Mateo Ruiz', 'Ingrid Ruiz'])
    expect(view.map((m) => m.gender)).toEqual(['female', 'male', 'female'])
    expect(view.map((m) => m.born)).toEqual([1982, 2010, 2014])
    expect(view.map((m) => m.country)).toEqual(['es', 'es', 'es'])
    expect(view.map((m) => m.age)).toEqual([44, 16, 12])
    expect(view.every((m) => m.alive && m.person === null)).toBe(true)
  })

  it('orders the kids by birth whatever order the links are in, and keeps the link order for twins', () => {
    const a = sidOf(21), b = sidOf(22), c = sidOf(23), d = sidOf(24)
    const anchor = person('p1', 'sibling', { kidSids: [a, b, c, d], kinY: YEAR })
    const g = game([anchor], shardOf([[a, rec(21, { b: 2015 })], [b, rec(22, { b: 2003 })], [c, rec(23, { b: 2015 })], [d, rec(24, { b: 2009 })]]))
    expect(kinView(g, anchor).map((m) => m.key)).toEqual([b, d, a, c])
    // The spouse is first however young.
    const s = sidOf(25)
    const wed = person('p2', 'sibling', { spouseSid: s, kidSids: [a, b], kinY: YEAR })
    const g2 = game([wed], shardOf([[s, rec(25, { b: 2020 })], [a, rec(21, { b: 2015 })], [b, rec(22, { b: 2003 })]]))
    expect(kinView(g2, wed).map((m) => m.key)).toEqual([s, b, a])
  })

  it('reads the age, the death and the illness of a record from ageTo: since is the anchor\'s kinY, died is the record\'s d, health is 35 + steadiness / 2', () => {
    const { g, anchor, spouse, kids } = family()
    const want = (sid: string, r: MetRecord, since?: number, died?: number) => {
      const s = ageTo(g, { sid, born: r.b, health: 35 + r.a[4] / 2 }, YEAR, { since, died })
      return { age: s.age, alive: s.alive, unwell: s.unwell }
    }
    const shard = (g.world as { met: MetShard }).met
    for (const m of kinView(g, anchor)) {
      const r = shard[m.key] as MetRecord
      expect({ age: m.age, alive: m.alive, unwell: m.unwell }, m.key).toEqual(want(m.key, r, YEAR))
    }
    // A steadiness of 0 is health 35: unwell whatever the year rolled, at 44.
    expect(kinView(g, anchor).find((m) => m.key === spouse)!.unwell).toBe(true)
    expect(kids).toHaveLength(2)
  })

  it('uses kinY as the year the record was last seen alive: a record born in 1900 is alive at 126 when kinY is this year', () => {
    const sids = Array.from({ length: 60 }, (_, i) => sidOf(100 + i))
    const seen = person('p1', 'sibling', { kidSids: sids.slice(0, 6), kinY: YEAR })
    const g = game([seen], shardOf(sids.map((s, i) => [s, rec(100 + i, { b: 1900 })] as const)))
    expect(kinView(g, seen).map((m) => m.alive)).toEqual([true, true, true, true, true, true])
    // The same records with no kinY are rolled from their birth: none of 60 is alive at 126 (the scan runs past 100, where the chance is 0.55).
    let alive = 0
    for (let i = 0; i < 10; i++) {
      const unseen = person(`p${i + 2}`, 'sibling', { kidSids: sids.slice(i * 6, i * 6 + 6) })
      alive += kinView(g, unseen).filter((m) => m.alive).length
    }
    expect(alive).toBeLessThan(2)
  })

  it('reads a record with a stored death year as dead from that year, at the age it died, and as alive before it', () => {
    const a = sidOf(31), b = sidOf(32)
    const anchor = person('p1', 'sibling', { spouseSid: a, kidSids: [b], kinY: YEAR })
    const g = game([anchor], shardOf([[a, rec(31, { b: 1950, d: 2019 })], [b, rec(32, { b: 1990, d: 2030 })]]))
    const [spouse, kid] = kinView(g, anchor)
    expect(spouse).toMatchObject({ alive: false, age: 69, unwell: false })
    expect(kid).toMatchObject({ alive: true, age: 36 })
  })

  it('reads a Person that holds the sid, alive or dead, instead of the record', () => {
    const { g, anchor, spouse, kids } = family()
    const wife = person('p2', 'friend', { sid: spouse, kin: 'sister-in-law', countryId: 'es' }, { firstName: 'Anita', lastName: 'Ruiz', age: 44 })
    const son = person('p3', 'friend', { sid: kids[0]!, kin: 'nephew', countryId: 'es', diedYear: 2024 }, { firstName: 'Mateo', lastName: 'Ruiz', gender: 'male', age: 14, alive: false })
    g.people.push(wife, son)
    const view = kinView(g, anchor)
    expect(view[0]).toMatchObject({ key: spouse, first: 'Anita', last: 'Ruiz', born: 1982, age: 44, alive: true, country: 'es' })
    expect(view[0]!.person).toBe(wife)
    expect(view[1]).toMatchObject({ key: kids[0], first: 'Mateo', gender: 'male', born: 2010, age: 14, alive: false, unwell: false })
    expect(view[1]!.person).toBe(son)
    expect(view[2]!.person).toBeNull()
  })

  it('agrees for a Person and for a record of one face: the same members apart from the Person reference', () => {
    const { g, anchor, spouse, kids } = family()
    const viaRecords = kinView(g, anchor)
    const people = viaRecords.map((m, i) => person(`p${10 + i}`, 'friend', { sid: m.key, countryId: m.country }, { firstName: m.first, lastName: m.last, gender: m.gender, age: m.age, alive: m.alive, stats: { ...STATS, health: m.unwell ? 20 : 80 } }))
    const held = game([anchor, ...people], (g.world as { met: MetShard }).met)
    const viaPersons = kinView(held, anchor)
    expect(viaPersons.map(flat)).toEqual(viaRecords.map(flat))
    expect(viaPersons.map((m) => m.person?.id)).toEqual(['p10', 'p11', 'p12'])
    expect(viaPersons.map((m) => m.key)).toEqual([spouse, ...kids])
    // The country of a Person with none is the place of its kin sid.
    const bare = person('p30', 'friend', { sid: spouse }, { firstName: 'Ana', lastName: 'Ruiz', age: 44 })
    expect(kinView(game([anchor, bare], (g.world as { met: MetShard }).met), anchor)[0]!.country).toBe('us')
  })

  it('reads a link to nobody as absent: no Person, no record, a tombstone, a sid that is no sid', () => {
    const gone = sidOf(41), tomb = sidOf(42), real = sidOf(43)
    const anchor = person('p1', 'sibling', { spouseSid: gone, kidSids: [tomb, real, 'junk', 's77'], kinY: YEAR })
    const t: Tomb = [2020, 0, 0, 0, 'Old', 'Friend', 3_900]
    const g = game([anchor], shardOf([[tomb, t], [real, rec(43)]]))
    expect(kinView(g, anchor).map((m) => m.key)).toEqual([real])
    expect(kinView(game([anchor]), anchor)).toEqual([])
    expect(kinView(game([person('p2', 'sibling')]), person('p2', 'sibling'))).toEqual([])
  })

  it('reads a link to the anchor itself as absent', () => {
    const me = sidOf(51), other = sidOf(52)
    const anchor = person('p1', 'friend', { sid: me, spouseSid: me, kidSids: [me, other], kinY: YEAR })
    const g = game([anchor], shardOf([[me, rec(51)], [other, rec(52)]]))
    expect(kinView(g, anchor).map((m) => m.key)).toEqual([other])
  })

  it('never lists more than a spouse and 6 kids, however many are linked', () => {
    const kids = Array.from({ length: 500 }, (_, i) => sidOf(200 + i))
    const spouse = sidOf(199)
    const anchor = person('p1', 'sibling', { spouseSid: spouse, kidSids: kids, kinY: YEAR })
    const g = game([anchor], shardOf([spouse, ...kids].map((s, i) => [s, rec(i)] as const).slice(0, MET_CAPS.records)))
    expect(kinView(g, anchor)).toHaveLength(KIN_CAPS.heirs)
    expect(KIN_CAPS.heirs).toBe(1 + KIN_CAPS.kids)
  })

  it('reads a hostile record without throwing: a birth the life path cannot read is a living child of age 0', () => {
    const s = sidOf(61)
    const anchor = person('p1', 'sibling', { spouseSid: s, kinY: YEAR })
    const g = game([anchor], shardOf([[s, rec(61, { b: 100_000 })]]))
    expect(kinView(g, anchor)).toMatchObject([{ key: s, born: 100_000, age: 0, alive: true, unwell: false }])
  })

  it('reads a hostile people list as no people: a list that is no list, a hole, a null and a person with no data', () => {
    const s = sidOf(71)
    const anchor = person('p1', 'sibling', { spouseSid: s, kinY: YEAR })
    const g = game([anchor], shardOf([[s, rec(71)]]))
    ;(g as { people: unknown }).people = [null, undefined, 5, 'x', { id: 'p9' }, { id: 'p8', data: null }, anchor]
    expect(kinView(g, anchor).map((m) => m.key)).toEqual([s])
    ;(g as { people: unknown }).people = 'people'
    expect(kinView(g, anchor).map((m) => m.key)).toEqual([s])
  })
})

describe('kinHeirIds and kinPending', () => {
  /** The family with the wife and the first son as Persons, the first alive and the second dead. */
  function held(): { g: GameState; anchor: Person; spouse: string; kids: string[]; wife: Person; son: Person } {
    const f = family()
    const wife = person('p2', 'friend', { sid: f.spouse, countryId: 'es' }, { firstName: 'Ana', lastName: 'Ruiz', age: 44 })
    const son = person('p3', 'friend', { sid: f.kids[0]!, countryId: 'es', diedYear: 2025 }, { firstName: 'Mateo', lastName: 'Ruiz', gender: 'male', age: 15, alive: false })
    f.g.people.push(wife, son)
    return { ...f, wife, son }
  }

  it('names the living spouse and then the living kids by birth, as the ids of Persons of g.people', () => {
    const f = family()
    const wife = person('p2', 'friend', { sid: f.spouse }, { age: 44 })
    const daughter = person('p3', 'friend', { sid: f.kids[1]! }, { age: 12 })
    const son = person('p4', 'friend', { sid: f.kids[0]! }, { age: 16, gender: 'male' })
    f.g.people.push(daughter, son, wife)
    expect(kinHeirIds(f.g, f.anchor)).toEqual(['p2', 'p4', 'p3'])
  })

  it('leaves out the dead and the ones that are only records, and names nobody without links', () => {
    const h = held()
    expect(kinHeirIds(h.g, h.anchor)).toEqual(['p2'])
    expect(kinHeirIds(h.g, person('p9', 'sibling'))).toEqual([])
    expect(kinHeirIds(game([]), person('p9', 'sibling', { spouseSid: h.spouse }))).toEqual([])
  })

  it('works for an anchor that has died: the links stay, and the heirs are the living', () => {
    const h = held()
    h.anchor.alive = false
    expect(kinHeirIds(h.g, h.anchor)).toEqual(['p2'])
  })

  it('names at most 7, however many are linked', () => {
    const kids = Array.from({ length: 40 }, (_, i) => sidOf(300 + i))
    const spouse = sidOf(299)
    const anchor = person('p1', 'sibling', { spouseSid: spouse, kidSids: kids, kinY: YEAR })
    const everyone = [spouse, ...kids].map((s, i) => person(`q${i}`, 'friend', { sid: s }, { age: 20 + i }))
    expect(kinHeirIds(game([anchor, ...everyone]), anchor)).toHaveLength(KIN_CAPS.heirs)
  })

  it('names the sids of the living linked records that are not Persons yet, spouse first and kids by birth', () => {
    const h = held()
    // The wife is a Person (not pending), the son is a dead Person (not pending), the daughter is a living record.
    expect(kinPending(h.g, h.anchor)).toEqual([h.kids[1]])
    const f = family()
    expect(kinPending(f.g, f.anchor)).toEqual([f.spouse, f.kids[0], f.kids[1]])
  })

  it('does not name a record that has died, a link to nobody or a Person', () => {
    const a = sidOf(81), b = sidOf(82), c = sidOf(83)
    const anchor = person('p1', 'sibling', { spouseSid: a, kidSids: [b, c, sidOf(84)], kinY: YEAR })
    const g = game([anchor], shardOf([[a, rec(81, { d: 2020 })], [b, rec(82)], [c, rec(83)]]))
    g.people.push(person('p2', 'friend', { sid: c }))
    expect(kinPending(g, anchor)).toEqual([b])
    expect(kinPending(game([]), anchor)).toEqual([])
    expect(kinPending(game([]), person('p9', 'sibling'))).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// The labels
// ---------------------------------------------------------------------------------------------------------------------------

const RELATIONS: readonly RelationKind[] = ['parent', 'stepparent', 'sibling', 'halfSibling', 'stepsibling', 'grandparent', 'child', 'stepchild', 'grandchild', 'friend', 'bestFriend', 'enemy', 'classmate', 'teacher', 'coworker', 'boss', 'partner', 'fiance', 'spouse', 'ex', 'exSpouse', 'lover', 'cellmate', 'pet']
/** The rule relationLabel applies to data.kin (X38): a lower case word of 20 characters at most. */
const LABEL = /^[a-z][a-z -]{0,19}$/

describe('kinLabel', () => {
  const label = (role: 'spouse' | 'child', gender: Gender, relation: RelationKind): string => kinLabel(role, gender, { relation, gender: 'male' })

  it('names a sibling\'s spouse and children, and the spouse of a child', () => {
    for (const relation of ['sibling', 'halfSibling', 'stepsibling'] as const) {
      expect(label('spouse', 'female', relation)).toBe('sister-in-law')
      expect(label('spouse', 'male', relation)).toBe('brother-in-law')
      expect(label('child', 'female', relation)).toBe('niece')
      expect(label('child', 'male', relation)).toBe('nephew')
    }
    for (const relation of ['child', 'stepchild'] as const) {
      expect(label('spouse', 'female', relation)).toBe('daughter-in-law')
      expect(label('spouse', 'male', relation)).toBe('son-in-law')
    }
  })

  it('gives nothing for a friend\'s kin, and nothing where the kin has a relation of its own', () => {
    for (const relation of ['friend', 'bestFriend', 'coworker', 'classmate', 'boss', 'enemy', 'spouse', 'partner', 'pet']) {
      for (const role of ['spouse', 'child'] as const) for (const gender of ['male', 'female'] as const) expect(label(role, gender, relation as RelationKind), `${relation} ${role}`).toBe('')
    }
    // A child's own children are grandchildren, a parent's are siblings: real relations, not labels.
    expect(label('child', 'male', 'child')).toBe('')
    expect(label('child', 'female', 'parent')).toBe('')
    expect(label('child', 'female', 'grandchild')).toBe('')
  })

  it('answers every role, gender and relation with nothing or a word of the rule: /^[a-z][a-z -]{0,19}$/', () => {
    const seen = new Set<string>()
    for (const relation of RELATIONS) {
      for (const role of ['spouse', 'child'] as const) {
        for (const gender of ['male', 'female'] as const) {
          const out = label(role, gender, relation)
          if (out !== '') expect(out, `${relation} ${role} ${gender}`).toMatch(LABEL)
          seen.add(out)
        }
      }
    }
    expect([...seen].sort()).toEqual(['', 'brother-in-law', 'daughter-in-law', 'nephew', 'niece', 'sister-in-law', 'son-in-law'])
  })

  it('is total: a gender, a role or an anchor that is none reads as nothing', () => {
    const odd = kinLabel as unknown as (...a: unknown[]) => string
    for (const args of [['spouse', 'x', { relation: 'sibling' }], ['spouse', 'male', null], ['spouse', 'male', undefined], ['spouse', 'male', {}], ['x', 'male', { relation: 'sibling' }], [null, null, null], ['child', 5, { relation: 5 }], ['spouse', 'female', { relation: '__proto__' }]]) {
      expect(odd(...args), json(args)).toBe('')
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// The problems
// ---------------------------------------------------------------------------------------------------------------------------

const text = (lines: readonly string[]): string => lines.join('\n')

describe('kinProblems', () => {
  it('says nothing about a sound world: links that resolve, flags that are linked, a Person that holds a record', () => {
    const { g, spouse } = family()
    expect(kinProblems(g)).toEqual([])
    // The wife as a Person that still has her record, and a second anchor with its own spouse.
    g.people.push(person('p2', 'friend', { sid: spouse, kin: 'sister-in-law' }))
    const other = sidOf(91)
    g.people.push(person('p3', 'parent', { spouseSid: other, kinY: YEAR }))
    ;(g.world as { met: MetShard }).met = shardOf([...Object.entries((g.world as { met: MetShard }).met), [other, rec(91, { fl: 2 })]] as [string, MetRecord][])
    expect(kinProblems(g)).toEqual([])
  })

  it('says nothing about an ordinary world: no links, no flags, no Met shard, no people', () => {
    expect(kinProblems(game([]))).toEqual([])
    expect(kinProblems(game([person('p1', 'sibling'), person('p2', 'friend', { sid: 's77' }), person('p3', 'child', {})]))).toEqual([])
    expect(kinProblems(game([person('p1', 'sibling')], shardOf([[sidOf(1), rec(1, { fl: 1 })], [sidOf(2), rec(2, { fl: 8 })], [sidOf(3), rec(3, { fl: 49 })]])))).toEqual([])
  })

  it('names a link to a sid that is neither a Person nor a record, for the spouse and for a kid, and a tombstone is not a record', () => {
    const a = sidOf(101), b = sidOf(102), c = sidOf(103), d = sidOf(104)
    const anchor = person('p1', 'sibling', { spouseSid: a, kidSids: [b, c, d], kinY: YEAR })
    const t: Tomb = [2020, 0, 0, 0, 'Old', 'Friend', 3_900]
    const g = game([anchor, person('p2', 'friend', { sid: d })], shardOf([[b, rec(102)], [c, t]]))
    const lines = kinProblems(g)
    expect(lines).toHaveLength(2)
    expect(text(lines)).toContain(`person p1 links ${a}`)
    expect(text(lines)).toContain(`person p1 links ${c}`)
    expect(text(lines)).not.toContain(b)
    expect(text(lines)).not.toContain(d)
  })

  it('names more than 6 kids as one line however many are linked, and a link that is no sid or no list', () => {
    const kids = Array.from({ length: 500 }, (_, i) => sidOf(400 + i))
    const seven = person('p1', 'sibling', { kidSids: kids.slice(0, 7) })
    const flood = person('p2', 'sibling', { kidSids: kids })
    const six = person('p3', 'sibling', { kidSids: kids.slice(0, 6) })
    const shard = shardOf(kids.slice(0, MET_CAPS.records).map((s, i) => [s, rec(i)] as const))
    const lines = kinProblems(game([seven, flood, six], shard))
    expect(lines.filter((l) => l.includes('more than the 6'))).toHaveLength(2)
    expect(text(lines)).toMatch(/person p1 links 7 kids/)
    expect(text(lines)).toMatch(/person p2 links 500 kids/)
    expect(text(lines)).not.toMatch(/person p3/)
    const junk = kinProblems(game([person('p4', 'sibling', { spouseSid: 's77', kidSids: 'x' }), person('p5', 'sibling', { kidSids: [sidOf(1), 5] })]))
    expect(text(junk)).toMatch(/person p4 spouseSid is not a sid/)
    expect(text(junk)).toMatch(/person p4 kidSids is not a list/)
    expect(text(junk)).toMatch(/person p5 kidSids holds a value that is no sid/)
    // A null or absent link is no link.
    expect(kinProblems(game([person('p6', 'sibling', { spouseSid: null, kidSids: null })]))).toEqual([])
  })

  it('names a self link', () => {
    const me = sidOf(111), other = sidOf(112)
    const sp = person('p1', 'friend', { sid: me, spouseSid: me })
    const kd = person('p2', 'friend', { sid: other, kidSids: [other] })
    const g = game([sp, kd], shardOf([[me, rec(111)], [other, rec(112)]]))
    const lines = kinProblems(g)
    expect(lines.filter((l) => /links itself/.test(l))).toHaveLength(2)
    expect(text(lines)).toMatch(/person p1 links itself/)
    expect(text(lines)).toMatch(/person p2 links itself/)
  })

  it('names a link on the player\'s own spouse, and names a sid linked as both the spouse and a kid', () => {
    const a = sidOf(121), b = sidOf(122)
    const wife = person('p1', 'spouse', { spouseSid: a, kinY: YEAR })
    const mixed = person('p2', 'sibling', { spouseSid: b, kidSids: [b, a] })
    const g = game([wife, mixed], shardOf([[a, rec(121)], [b, rec(122)]]))
    const lines = kinProblems(g)
    expect(text(lines)).toMatch(/person p1 is the player's spouse and carries kin links/)
    expect(text(lines)).toMatch(new RegExp(`person p2 links ${b} as the spouse and as a kid`))
    // A spouse that is the player's with no links is nothing to name.
    expect(kinProblems(game([person('p3', 'spouse')]))).toEqual([])
  })

  it('names a sid on a child, a stepchild and a grandchild (heirUnsafe), and on none of the others', () => {
    const people = [
      person('c1', 'child', { sid: sidOf(131) }),
      person('c2', 'stepchild', { sid: 's77' }),
      person('c3', 'grandchild', { sid: sidOf(132) }, { alive: false }),
      person('c4', 'child', {}),
      person('c5', 'friend', { sid: sidOf(133) }),
      person('c6', 'spouse', { sid: sidOf(134) }),
    ]
    const shard = shardOf([[sidOf(133), rec(133)], [sidOf(134), rec(134)]])
    const lines = kinProblems(game(people, shard))
    expect(lines).toHaveLength(3)
    expect(text(lines)).toMatch(/person c1 is a child and carries sid kin\./)
    expect(text(lines)).toMatch(/person c2 is a stepchild/)
    expect(text(lines)).toMatch(/person c3 is a grandchild/)
  })

  it('names a spouse sid linked by two living anchors, once, and not when the second is dead', () => {
    const s = sidOf(141), t = sidOf(142)
    const living = [person('p1', 'sibling', { spouseSid: s }), person('p2', 'sibling', { spouseSid: s }), person('p3', 'halfSibling', { spouseSid: s })]
    expect(kinProblems(game(living, shardOf([[s, rec(141, { fl: 2 })]])))).toEqual([`spouse ${s} is linked by 3 living people`])
    const oneDead = [person('p1', 'sibling', { spouseSid: t }), person('p2', 'sibling', { spouseSid: t, diedYear: YEAR - 2 }, { alive: false })]
    expect(kinProblems(game(oneDead, shardOf([[t, rec(142, { fl: 2 })]])))).toEqual([])
    // Two living anchors with different spouses are fine.
    const both = shardOf([[s, rec(141, { fl: 2 })], [t, rec(142, { fl: 2 })]])
    expect(kinProblems(game([person('p1', 'sibling', { spouseSid: s }), person('p2', 'sibling', { spouseSid: t })], both))).toEqual([])
  })

  it('names a Met record with the spouse or the heir flag that no living anchor links', () => {
    const a = sidOf(151), b = sidOf(152), c = sidOf(153), d = sidOf(154)
    const shard = shardOf([[a, rec(151, { fl: 2 })], [b, rec(152, { fl: 4 })], [c, rec(153, { fl: 6 })], [d, rec(154, { fl: 0 })]])
    const lines = kinProblems(game([], shard))
    expect(lines).toHaveLength(3)
    for (const sid of [a, b, c]) expect(text(lines)).toContain(`record ${sid} carries the spouse or heir flag`)
    expect(text(lines)).not.toContain(d)
    // The other flags (debt, company, feud, will) are not this check's.
    expect(kinProblems(game([], shardOf([[a, rec(151, { fl: 1 | 8 | 16 | 32 })]])))).toEqual([])
    // A tombstone is not a record.
    expect(kinProblems(game([], shardOf([[a, [2020, 0, 0, 6, 'Old', 'Friend', 3_900] as Tomb]])))).toEqual([])
  })

  it('does not name a flagged record that a living anchor links, as spouse or as kid', () => {
    const a = sidOf(161), b = sidOf(162)
    const shard = shardOf([[a, rec(161, { fl: 2 })], [b, rec(162, { fl: 4 })]])
    expect(kinProblems(game([person('p1', 'sibling', { spouseSid: a, kidSids: [b] })], shard))).toEqual([])
    expect(text(kinProblems(game([person('p1', 'sibling', { spouseSid: a })], shard)))).toContain(`record ${b}`)
  })

  it('holds a record for an anchor dead under 10 years and lets it go from the tenth: the window is KIN_CAPS.deadYears', () => {
    const a = sidOf(171)
    const shard = shardOf([[a, rec(171, { fl: 2 })]])
    const dead = (years: number | undefined): Person => person('p1', 'sibling', { spouseSid: a, ...(years === undefined ? {} : { diedYear: YEAR - years }) }, { alive: false })
    expect(kinProblems(game([dead(0)], shard))).toEqual([])
    expect(kinProblems(game([dead(9)], shard))).toEqual([])
    expect(text(kinProblems(game([dead(10)], shard)))).toContain(`record ${a} carries the spouse or heir flag`)
    expect(kinProblems(game([dead(40)], shard))).toHaveLength(1)
    // A dead anchor with no death year is not known to be old: the record is held.
    expect(kinProblems(game([dead(undefined)], shard))).toEqual([])
  })

  it('asks that the links of a living anchor and of one dead under 10 years resolve, and not those of an older death', () => {
    const a = sidOf(181)
    const at = (years: number, alive = false): Person => person('p1', 'sibling', { spouseSid: a, diedYear: YEAR - years }, { alive })
    expect(text(kinProblems(game([at(0, true)])))).toContain(`person p1 links ${a}`)
    expect(kinProblems(game([at(3)]))).toHaveLength(1)
    expect(kinProblems(game([at(10)]))).toEqual([])
    expect(kinProblems(game([at(25)]))).toEqual([])
    // Structure is named whatever the death: more than 6 kids on an old grave.
    const grave = person('p2', 'sibling', { kidSids: Array.from({ length: 8 }, (_, i) => sidOf(190 + i)), diedYear: YEAR - 30 }, { alive: false })
    expect(text(kinProblems(game([grave])))).toMatch(/person p2 links 8 kids/)
  })

  it('is run by worldProblems, each line starting "kin: ", and a sound world adds none', () => {
    const { g } = family()
    expect(worldProblems(g, { live: false })).toEqual([])
    const bad = game([person('p1', 'sibling', { spouseSid: sidOf(1) })])
    expect(worldProblems(bad, { live: false })).toEqual([expect.stringMatching(/^kin: person p1 links /)])
    expect(worldProblems(makeTestGame(7), { live: false })).toEqual([])
  })

  it('stays bounded on a hostile world: at most 65 lines for 40,000 anchors, and names the first of them', () => {
    const many = Array.from({ length: 40_000 }, (_, i) => person(`p${i}`, 'sibling', { spouseSid: sidOf(i), kidSids: [sidOf(i + 1)] }))
    const started = Date.now()
    const lines = kinProblems(game(many))
    expect(lines.length).toBeLessThanOrEqual(65)
    expect(lines.length).toBeGreaterThan(60)
    expect(lines[0]).toMatch(/^person p0 links /)
    expect(lines[lines.length - 1]).toBe('and more')
    expect(Date.now() - started).toBeLessThan(5_000)
  })

  it('shows a hostile id or sid as a short plain text', () => {
    const evil = `p\u0007${'x'.repeat(500)}`
    const lines = kinProblems(game([person(evil, 'child', { sid: sidOf(1) })]))
    expect(lines).toHaveLength(1)
    expect(lines[0]!.length).toBeLessThan(200)
    expect(lines[0]).not.toMatch(/[\u0000-\u001f]/)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// Purity and bounds
// ---------------------------------------------------------------------------------------------------------------------------

describe('every reader leaves the state alone', () => {
  it('runs on a deep-frozen state with g.rng trapped: no write, no draw, no uid, the same answer twice', () => {
    const f = family()
    f.g.people.push(person('p2', 'friend', { sid: f.spouse }, { age: 44 }), person('p3', 'friend', { sid: f.kids[0]! }, { age: 16, alive: false }), person('p4', 'sibling', { spouseSid: sidOf(999) }))
    const g = deepFreeze(trapRng(f.g))
    const before = json(g)
    const nextId = g.nextId
    const anchor = g.people[0]!
    const run = () => ({ links: readKin(anchor), view: kinView(g, anchor), heirs: kinHeirIds(g, anchor), pending: kinPending(g, anchor), problems: kinProblems(g), label: kinLabel('child', 'female', anchor) })
    const first = run()
    for (let i = 0; i < 20; i++) expect(run()).toEqual(first)
    expect(json(g)).toBe(before)
    expect(g.nextId).toBe(nextId)
    expect(first.view.length).toBeGreaterThan(0)
  })

  it('gives the same answers for a clone, a reload and a state that was never frozen', () => {
    const f = family()
    const clone = JSON.parse(json(f.g)) as GameState
    expect(kinView(clone, clone.people[0]!).map(flat)).toEqual(kinView(f.g, f.anchor).map(flat))
    expect(kinPending(clone, clone.people[0]!)).toEqual(kinPending(f.g, f.anchor))
  })
})

describe('40,000 anchors', () => {
  it('cost a bounded amount: a view is at most 7 members, the heirs at most 7, and the problems at most 65 lines', () => {
    const spouse = sidOf(7)
    const kids = Array.from({ length: 500 }, (_, i) => sidOf(1000 + i))
    const people: Person[] = []
    for (let i = 0; i < 40_000; i++) people.push(person(`p${i}`, 'sibling', { spouseSid: spouse, kidSids: kids, kinY: YEAR }))
    const shard = shardOf([spouse, ...kids].slice(0, MET_CAPS.records).map((s, i) => [s, rec(i, { fl: 2 })] as const))
    const g = deepFreeze(trapRng(game(people, shard)))
    const started = Date.now()
    for (let i = 0; i < 40; i++) {
      const anchor = g.people[i * 997]!
      expect(kinView(g, anchor).length).toBeLessThanOrEqual(KIN_CAPS.heirs)
      expect(kinHeirIds(g, anchor).length).toBeLessThanOrEqual(KIN_CAPS.heirs)
      expect(kinPending(g, anchor).length).toBeLessThanOrEqual(KIN_CAPS.heirs)
      expect(readKin(anchor).kids.length).toBeLessThanOrEqual(KIN_CAPS.kids)
    }
    expect(kinProblems(g).length).toBeLessThanOrEqual(65)
    expect(Date.now() - started).toBeLessThan(10_000)
  })

  it('read the first 5,000 people and no more: a holder further down the list is not found', () => {
    const s = sidOf(9)
    const anchor = person('p0', 'sibling', { spouseSid: s, kinY: YEAR })
    const filler = Array.from({ length: MET_CAPS.scan + 10 }, (_, i) => person(`f${i}`, 'coworker'))
    const late = person('late', 'friend', { sid: s })
    expect(kinHeirIds(game([anchor, ...filler.slice(0, MET_CAPS.scan - 2), late]), anchor)).toEqual(['late'])
    expect(kinHeirIds(game([anchor, ...filler, late]), anchor)).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// The file
// ---------------------------------------------------------------------------------------------------------------------------

describe('the file world/kin.ts', () => {
  const src = readFileSync(join(ROOT, FILE), 'utf8')
  const code = src.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*')).join('\n')

  it('loads first in a fresh registry and exports its names, none of them undefined', async () => {
    vi.resetModules()
    const m = (await import('../src/game/world/kin')) as Record<string, unknown>
    for (const name of ['KIN_CAPS', 'readKin', 'kinView', 'kinHeirIds', 'kinPending', 'kinLabel', 'kinProblems']) expect(m[name], name).toBeDefined()
    expect(Object.values(m).every((v) => v !== undefined)).toBe(true)
  })

  it('draws no number, reads no clock and writes nothing: no g.rng, rand, uid, stream or write helper', () => {
    expect(code).not.toMatch(/\bg\.rng\b|\brand\(|\bpick\(|\bchance\(|\brandInt\(|\buid\(|Math\.random|\bDate\b|performance\.now|outcomeStream|streamKey|\bstream\(/)
    expect(code).not.toMatch(/writeMet|touchMet|markMet|ensureWorld|putEdge|moveCash|\bg\.[A-Za-z.]+\s*=[^=]/)
  })

  it('imports nothing above layer 2: the kernel, the types and its own folder only', () => {
    const imports = [...src.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]!)
    expect(imports.length).toBeGreaterThan(3)
    for (const from of imports) expect(from, from).toMatch(/^\.\/|^\.\.\/kernel\/|^\.\.\/types$/)
    // C36: heirUnsafe comes from the kernel, not from the materializer (a root file of layer 3).
    expect(imports).toContain('../kernel/person-ref')
    expect(imports.some((f) => /materialize/.test(f))).toBe(false)
  })

  it('has no long dash, writes no sid property (S11 scans the source for `sid:`) and reads data.sid only through personKey (person-key.test.ts)', () => {
    expect(DASH.test(src)).toBe(false)
    expect(code).not.toMatch(/\bsid\s*:/)
    expect(code).not.toMatch(/data\??\.sid\b|\.data\[['"]sid['"]\]/)
  })

  it('is described in docs/KIN.md with every export, the caps and the keys, and the types.ts comment names the keys', () => {
    const doc = readFileSync(join(ROOT, 'docs/KIN.md'), 'utf8')
    for (const name of ['KIN_CAPS', 'KinLinks', 'KinMember', 'readKin', 'kinView', 'kinHeirIds', 'kinPending', 'kinLabel', 'kinProblems', 'spouseSid', 'kidSids', 'kinY', 'estateY', 'widowed', 'heirUnsafe', 'ageTo']) expect(doc, name).toContain(name)
    expect(DASH.test(doc)).toBe(false)
    const types = readFileSync(join(ROOT, 'src/game/types.ts'), 'utf8')
    for (const key of ['spouseSid', 'kidSids', 'kinY', 'estateY', 'widowed']) expect(types, key).toContain(key)
  })
})
