// R4-S8 (D.1 g): materializePerson, the Person bridge (src/game/materialize.ts). A Met identity becomes a Person of g.people with no
// dice and no account surprise: createPerson is given every field, so g.rng does not move and g.nextId moves by one.
//
// What the file proves, in the order of the plan: the bridge draws nothing (200 sids, with the options a caller may leave out and
// with every one given); a refused touch (400 held records) creates nothing; the same sid twice gives the same Person once; the
// account of the Person is the ledger's and the index row is personRef; a child, a stepchild, a grandchild, a pet and a bad sid
// return null and write nothing; a hand-over keeps a sid-bearing friend who has an NpcLife and a sid-bearing spouse who is the
// heir's other parent, with the sid and the ledger balance; a sid forced onto a child is caught by metProblems; a hostile
// opts.data.sid is overwritten; createPerson's nameTaken reads the registry's names only for a life that has a Met entry.
// No pinned seed: lives come from makeTestGame, families are strings.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { moveCash, personPurse, playerPurse } from '../src/game/cash'
import { killCharacter } from '../src/game/death'
import { acctBalance, checkLedger, flowsOf } from '../src/game/kernel/ledger'
import { heirUnsafe as kernelHeirUnsafe, personKey, validSid } from '../src/game/kernel/person-ref'
import { worldSeed } from '../src/game/kernel/streams'
import { continueAsChild } from '../src/game/life'
import { heirUnsafe, materializePerson, personOfSid, SID_RELATIONS, type MaterializeOpts } from '../src/game/materialize'
import { initializeNpc, npcLife } from '../src/game/npc-lives'
import { createPerson } from '../src/game/people'
import type { GameState, Person, RelationKind } from '../src/game/types'
import { MET_CAPS } from '../src/game/world/caps'
import { labelsFromAxes } from '../src/game/world/axes'
import { worldProblems } from '../src/game/world/invariants'
import { fromSeeded, latent } from '../src/game/world/latent'
import { isTomb, metProblems, metRecord, normalizeMet, packGb, readMet, writeMet, type MetRecord, type MetShard, type Tomb } from '../src/game/world/met'
import { isProtected, touchMet } from '../src/game/world/met-ops'
import { personRef } from '../src/game/world/people'
import '../src/game/world/shards'
import { makeSid, parseSid, type SidKind } from '../src/game/world/sid'
import { ensureWorld, readWorld } from '../src/game/world/state'
import { trapRng } from './effort-kit'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const FILE = 'src/game/materialize.ts'
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)
const YEAR = 2026

// ---------------------------------------------------------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------------------------------------------------------

function game(money = 50_000): GameState {
  const g = makeTestGame(7, { age: 40, money })
  g.lifeId = 'bridge-family'
  return g
}

/** The sid of the i-th person of a crowd: kind, place and a cohort inside the grammar. */
const sidOf = (i: number, kind: SidKind = 'frn', place = 'us'): string => makeSid({ kind, place, cohort: 1950 + (i % 60), ord: i })

/** A valid record with nothing held on it. */
function rec(i: number, over: Partial<MetRecord> = {}): MetRecord {
  return { f: `Ida${i}`, l: `Quist${i}`, g: (i % 2) as 0 | 1, b: 1960 + (i % 40), c: 'us', k: 0, a: [50, 40, 60, 30, 70], y: YEAR - 3, s: YEAR, w: 0, fl: 0, gr: 0, ob: 0, ...over }
}

/** A valid tombstone: year, grudge, obligation, flags, first, last, gb. */
function tomb(i: number): Tomb {
  return [YEAR - 2, 0, 0, 0, `Tomi${i}`, `Gravel${i}`, packGb(1950 + (i % 60), (i % 2) as 0 | 1)] as unknown as Tomb
}

/** Puts these entries in the Met shard through the one writer (it sorts the keys). */
function seed(g: GameState, entries: readonly (readonly [string, MetRecord | Tomb])[]): GameState {
  writeMet(g, Object.fromEntries(entries) as MetShard)
  return g
}

/** 400 records, every one held by a stake: no newcomer fits. */
function full(): GameState {
  return seed(
    game(),
    Array.from({ length: MET_CAPS.records }, (_, i) => [sidOf(i, 'cls'), rec(i, { fl: 1 })] as const),
  )
}

const json = (x: unknown): string => JSON.stringify(x)
const must = (p: Person | null | undefined): Person => {
  expect(p).toBeTruthy()
  return p as Person
}

/** What a caller passes when it gives every option. */
const FULL: MaterializeOpts = {
  relation: 'coworker',
  age: 33,
  occupation: 'Chef',
  relationship: 71,
  money: 1_234,
  livesWithPlayer: true,
  contextId: 'ctx1',
  home: 'ca',
  role: 3,
  data: { note: 'x' },
}

const OCCUPATIONS = ['None', 'Student', 'Unemployed', 'Retired']
const occupationAt = (age: number): string => (age < 5 ? 'None' : age < 18 ? 'Student' : age >= 67 ? 'Retired' : 'Unemployed')

// ---------------------------------------------------------------------------------------------------------------------------
// No dice
// ---------------------------------------------------------------------------------------------------------------------------

describe('materializePerson draws nothing', () => {
  it('over 200 sids with only a relation: g.rng is never read, g.nextId moves by one each, g.people grows by one', () => {
    const g = trapRng(game())
    for (let i = 0; i < 200; i++) {
      const id = g.nextId
      const n = g.people.length
      const p = must(materializePerson(g, sidOf(i), { relation: 'friend' }))
      expect(g.nextId).toBe(id + 1)
      expect(g.people).toHaveLength(n + 1)
      expect(g.people[n]).toBe(p)
      expect(p.id).toBe(`p${id + 1}`)
    }
  })

  it('over 200 sids with every option given: the same, and the options are the Person', () => {
    const g = trapRng(game())
    for (let i = 0; i < 200; i++) {
      const id = g.nextId
      const p = must(materializePerson(g, sidOf(i, 'cow', 'ca'), FULL))
      expect(g.nextId).toBe(id + 1)
      expect(p.relation).toBe('coworker')
      expect(p.age).toBe(33)
      expect(p.occupation).toBe('Chef')
      expect(p.relationship).toBe(71)
      expect(p.money).toBe(1_234)
      expect(p.livesWithPlayer).toBe(true)
      expect(p.contextId).toBe('ctx1')
      expect(p.data.note).toBe('x')
    }
  })

  it('leaves the value of g.rng as it was (a game without the trap)', () => {
    const g = game()
    const before = g.rng
    for (let i = 0; i < 60; i++) materializePerson(g, sidOf(i), i % 2 === 0 ? { relation: 'classmate' } : FULL)
    expect(g.rng).toBe(before)
    expect(g.nextId).toBe(60)
  })

  it('a refused, a repeated and a refused-relation call draw nothing and move no id', () => {
    const g = trapRng(game())
    const p = must(materializePerson(g, sidOf(1), { relation: 'friend' }))
    const id = g.nextId
    expect(materializePerson(g, sidOf(1), { relation: 'friend' })).toBe(p)
    expect(materializePerson(g, sidOf(2), { relation: 'child' })).toBeNull()
    expect(materializePerson(g, 'p12', { relation: 'friend' })).toBeNull()
    expect(g.nextId).toBe(id)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// The fields
// ---------------------------------------------------------------------------------------------------------------------------

describe('the Person is the record, with fixed defaults for what the caller leaves out', () => {
  it('takes the name, gender and country of the record; the traits from its axes; stats and skin from latent; the sid in data', () => {
    const g = game()
    for (let i = 0; i < 40; i++) {
      const sid = sidOf(i, i % 2 === 0 ? 'frn' : 'cls', i % 3 === 0 ? 'jp' : 'us')
      const p = must(materializePerson(g, sid, { relation: 'friend' }))
      const r = metRecord(g, sid)!
      const lat = latent(worldSeed(g), parseSid(sid)!, r.c)
      expect(p.firstName).toBe(r.f)
      expect(p.lastName).toBe(r.l)
      expect(p.gender).toBe(r.g === 1 ? 'male' : 'female')
      expect(p.data.countryId).toBe(r.c)
      expect(p.data.sid).toBe(sid)
      expect(p.age).toBe(YEAR - r.b)
      expect(p.traits).toEqual(labelsFromAxes({ ambition: r.a[0], honesty: r.a[1], empathy: r.a[2], risk: r.a[3], steadiness: r.a[4] }))
      expect(p.stats).toEqual(lat.stats)
      expect(p.data.skinTone).toBe(lat.skin)
      expect(p.alive).toBe(true)
      expect(p.yearsKnown).toBe(0)
      expect(p.notes).toEqual([])
    }
  })

  it('uses a fixed default for every option left out: occupation by age, relationship 50, money 0, not living with the player', () => {
    const g = game()
    for (let i = 0; i < 80; i++) {
      const p = must(materializePerson(g, sidOf(i, i % 2 === 0 ? 'frn' : 'kin'), { relation: 'friend' }))
      expect(p.occupation).toBe(occupationAt(p.age))
      expect(p.relationship).toBe(50)
      expect(p.money).toBe(0)
      expect(p.livesWithPlayer).toBe(false)
      expect(p.contextId).toBeUndefined()
    }
  })

  it('names the occupation by the age it was given: None under 5, Student under 18, Retired from 67, else Unemployed', () => {
    const g = game()
    const seen = new Set<string>()
    for (const [i, age] of [0, 4, 5, 17, 18, 40, 66, 67, 90].entries()) {
      const p = must(materializePerson(g, sidOf(i), { relation: 'friend', age }))
      expect(p.age).toBe(age)
      expect(p.occupation).toBe(occupationAt(age))
      seen.add(p.occupation)
    }
    expect([...seen].sort()).toEqual([...OCCUPATIONS].sort())
  })

  it('takes the age from the options when given and cuts a hostile one; a number that is no number reads as the default', () => {
    const g = game()
    const base = must(materializePerson(g, sidOf(1), { relation: 'friend' }))
    for (const [i, age] of [Number.NaN, Number.POSITIVE_INFINITY, -5, 1e9, '41' as unknown as number].entries()) {
      const p = must(materializePerson(g, sidOf(10 + i), { relation: 'friend', age }))
      expect(Number.isInteger(p.age)).toBe(true)
      expect(p.age).toBeGreaterThanOrEqual(0)
      expect(p.age).toBeLessThanOrEqual(150)
    }
    expect(base.age).toBe(YEAR - metRecord(g, sidOf(1))!.b)
  })

  it('reads a relationship, money, occupation and contextId that are not what they should be as the defaults, and never throws', () => {
    const g = trapRng(game())
    const hostile = [
      { relation: 'friend', relationship: Number.NaN, money: Number.NaN, occupation: 5, contextId: 7, livesWithPlayer: 'yes' },
      { relation: 'friend', relationship: Infinity, money: -Infinity, occupation: '', contextId: {}, livesWithPlayer: 1 },
      { relation: 'friend', relationship: 1e9, money: 1e300, occupation: {}, contextId: null, livesWithPlayer: null },
    ] as unknown as MaterializeOpts[]
    for (const [i, opts] of hostile.entries()) {
      const p = must(materializePerson(g, sidOf(i), opts))
      expect(Number.isFinite(p.relationship)).toBe(true)
      expect(p.relationship).toBeGreaterThanOrEqual(0)
      expect(p.relationship).toBeLessThanOrEqual(100)
      expect(Number.isFinite(p.money)).toBe(true)
      expect(typeof p.occupation).toBe('string')
      expect(p.occupation.length).toBeGreaterThan(0)
      expect(p.livesWithPlayer).toBe(false)
      expect(p.contextId).toBeUndefined()
    }
  })

  it('takes the country of an entity-placed slot from `home`, and the skin and stats are the record\'s country\'s', () => {
    const g = game()
    const sid = sidOf(3, 'boss', 'f12')
    const p = must(materializePerson(g, sid, { relation: 'boss', home: 'ca' }))
    expect(p.data.countryId).toBe('ca')
    const lat = latent(worldSeed(g), parseSid(sid)!, 'ca')
    expect(p.stats).toEqual(lat.stats)
    expect(p.data.skinTone).toBe(lat.skin)
  })

  it('passes the role weight on to the record (cut to its range) and nothing else of the registry', () => {
    const g = game()
    must(materializePerson(g, sidOf(1), { relation: 'boss', role: 3 }))
    must(materializePerson(g, sidOf(2), { relation: 'boss', role: 99 }))
    must(materializePerson(g, sidOf(3), { relation: 'boss' }))
    expect(metRecord(g, sidOf(1))!.w).toBe(3)
    expect(metRecord(g, sidOf(2))!.w).toBe(9)
    expect(metRecord(g, sidOf(3))!.w).toBe(0)
    for (const i of [1, 2, 3]) {
      const r = metRecord(g, sidOf(i))!
      expect([r.fl, r.gr, r.ob]).toEqual([0, 0, 0])
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// The registry side
// ---------------------------------------------------------------------------------------------------------------------------

describe('the record and the Person hold each other', () => {
  it('a first sight makes the record (latent and resolveName) and the Person protects it', () => {
    const g = game()
    const sid = sidOf(5)
    expect(metRecord(g, sid)).toBeNull()
    const p = must(materializePerson(g, sid, { relation: 'friend' }))
    const r = metRecord(g, sid)!
    expect(r.y).toBe(YEAR)
    expect(r.s).toBe(YEAR)
    expect(isProtected(g, sid)).toBe(true)
    expect(personKey(p)).toBe(sid)
    expect(metProblems(readWorld(g).met, g.people)).toEqual([])
  })

  it('a record that is already there is used as it is: an identity that Life drew is the Person\'s name, never regenerated', () => {
    const g = game()
    const sid = sidOf(6)
    const id = fromSeeded({ sid, first: 'Bright', last: 'Meadow', gender: 'male', born: 1971, country: 'ca' }, worldSeed(g))
    expect(touchMet(g, sid, undefined, undefined, id)).toBe(true)
    const p = must(materializePerson(g, sid, { relation: 'spouse' }))
    expect([p.firstName, p.lastName, p.gender, p.age, p.data.countryId]).toEqual(['Bright', 'Meadow', 'male', YEAR - 1971, 'ca'])
  })

  it('wakes a tombstone: the stored names, gender and birth year come back', () => {
    const g = seed(game(), [[sidOf(7, 'actor'), tomb(7)]])
    const p = must(materializePerson(g, sidOf(7, 'actor'), { relation: 'friend' }))
    expect([p.firstName, p.lastName]).toEqual(['Tomi7', 'Gravel7'])
    expect(p.gender).toBe('male')
    expect(p.age).toBe(YEAR - 1957)
    const r = metRecord(g, sidOf(7, 'actor'))
    expect(r && !isTomb(r) ? r.f : null).toBe('Tomi7')
  })

  it('a refused touch (400 held records) creates nothing: g.people, g.nextId, g.rng and the shard are as they were', () => {
    const g = trapRng(full())
    const people = json(g.people)
    const nextId = g.nextId
    const shard = readMet(g)
    const world = json(g.world)
    expect(materializePerson(g, sidOf(900, 'frn'), { relation: 'friend' })).toBeNull()
    expect(materializePerson(g, sidOf(901, 'frn'), FULL)).toBeNull()
    expect(json(g.people)).toBe(people)
    expect(g.nextId).toBe(nextId)
    expect(readMet(g)).toBe(shard)
    expect(json(g.world)).toBe(world)
  })

  it('runs on a deep-frozen shard: the writer replaces the root', () => {
    const g = game()
    ensureWorld(g).met = deepFreeze(normalizeMet({ [sidOf(1)]: rec(1) })) as never
    const root = readWorld(g).met
    must(materializePerson(g, sidOf(2), { relation: 'friend' }))
    expect(readWorld(g).met).not.toBe(root)
    expect(Object.keys(root as object)).toEqual([sidOf(1)])
  })
})

describe('the same sid twice', () => {
  it('gives the same Person once: the second call returns it and changes nothing', () => {
    const g = game()
    const sid = sidOf(8)
    const a = must(materializePerson(g, sid, { relation: 'friend' }))
    const world = json(g.world)
    const nextId = g.nextId
    const b = must(materializePerson(g, sid, FULL))
    expect(b).toBe(a)
    expect(g.people.filter((p) => personKey(p) === sid)).toHaveLength(1)
    expect(g.nextId).toBe(nextId)
    expect(json(g.world)).toBe(world)
    expect(a.relation).toBe('friend')
  })

  it('returns a Person that already holds the sid, whoever made it, without a touch or a write (L9 resets it, it does not duplicate it)', () => {
    const g = game()
    const sid = sidOf(9)
    const held = createPerson(g, { relation: 'spouse', age: 30, gender: 'female', firstName: 'Mara', lastName: 'Keel', occupation: 'Clerk', relationship: 60, money: 0, traits: [], stats: { happiness: 50, health: 50, smarts: 50, looks: 50 }, data: { sid } })
    const world = json(g.world)
    const nextId = g.nextId
    expect(materializePerson(g, sid, { relation: 'friend' })).toBe(held)
    expect(g.nextId).toBe(nextId)
    expect(json(g.world)).toBe(world)
    expect(personOfSid(g, sid)).toBe(held)
  })

  it('finds a dead holder too', () => {
    const g = game()
    const p = must(materializePerson(g, sidOf(10), { relation: 'friend' }))
    p.alive = false
    expect(materializePerson(g, sidOf(10), { relation: 'friend' })).toBe(p)
  })
})

describe('personOfSid', () => {
  it('finds the Person whose personKey is the sid, and undefined for any other text; it reads a frozen state', () => {
    const g = game()
    const p = must(materializePerson(g, sidOf(11), { relation: 'friend' }))
    const other = createPerson(g, { relation: 'friend', age: 30 })
    deepFreeze(g)
    expect(personOfSid(g, sidOf(11))).toBe(p)
    expect(personOfSid(g, sidOf(12))).toBeUndefined()
    expect(personOfSid(g, other.id)).toBe(other)
    expect(personOfSid(g, '')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// The books
// ---------------------------------------------------------------------------------------------------------------------------

describe('a sid never renames an account', () => {
  it('the account is person:<sid> (personPurse) and the index row is personRef', () => {
    const g = game()
    const sid = sidOf(13)
    const p = must(materializePerson(g, sid, { relation: 'friend' }))
    expect(personPurse(p).acct).toBe(`person:${sid}`)
    expect(personRef(p)).toBe(`person:${sid}`)
  })

  it('the opening money is not booked: no flow, no account balance, and the books balance', () => {
    const g = game()
    const rows = flowsOf(g).length
    const sid = sidOf(14)
    const p = must(materializePerson(g, sid, { relation: 'friend', money: 5_000 }))
    expect(p.money).toBe(5_000)
    expect(flowsOf(g)).toHaveLength(rows)
    expect(acctBalance(g, `person:${sid}`)).toBe(0)
    expect(checkLedger(g).ok).toBe(true)
  })

  it('a booked gift lands in the sid account, and the Person and the account move together', () => {
    const g = game()
    const sid = sidOf(15)
    const p = must(materializePerson(g, sid, { relation: 'friend' }))
    expect(moveCash(g, playerPurse(g), personPurse(p), 700, 'gift')).toBe(700)
    expect(acctBalance(g, `person:${sid}`)).toBe(700)
    expect(p.money).toBe(700)
    expect(checkLedger(g).ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// Which relations and which sids
// ---------------------------------------------------------------------------------------------------------------------------

const ALL_RELATIONS: Record<RelationKind, true> = {
  parent: true,
  stepparent: true,
  sibling: true,
  halfSibling: true,
  stepsibling: true,
  grandparent: true,
  child: true,
  stepchild: true,
  grandchild: true,
  friend: true,
  bestFriend: true,
  enemy: true,
  classmate: true,
  teacher: true,
  coworker: true,
  boss: true,
  partner: true,
  fiance: true,
  spouse: true,
  ex: true,
  exSpouse: true,
  lover: true,
  cellmate: true,
  pet: true,
}
const NEVER: readonly RelationKind[] = ['child', 'stepchild', 'grandchild', 'pet']

describe('SID_RELATIONS and the relations that refuse', () => {
  it('is every relation except child, stepchild, grandchild and pet', () => {
    const all = Object.keys(ALL_RELATIONS) as RelationKind[]
    expect([...SID_RELATIONS].sort()).toEqual(all.filter((k) => !NEVER.includes(k)).sort())
    for (const k of NEVER) expect(SID_RELATIONS.has(k)).toBe(false)
    expect(SID_RELATIONS.size).toBe(all.length - NEVER.length)
  })

  it('makes a Person of every relation in the set', () => {
    const g = trapRng(game())
    let i = 0
    for (const relation of SID_RELATIONS) {
      const p = must(materializePerson(g, sidOf(i++), { relation }))
      expect(p.relation).toBe(relation)
      expect(heirUnsafe(p)).toBe(false)
    }
    expect(metProblems(readWorld(g).met, g.people)).toEqual([])
  })

  it('returns null for a child, stepchild, grandchild and pet, and for a relation that is none, and writes nothing', () => {
    const g = trapRng(game())
    must(materializePerson(g, sidOf(1), { relation: 'friend' }))
    const before = json(g)
    for (const relation of [...NEVER, 'cousin', '', 7, null, undefined] as unknown as RelationKind[]) {
      expect(materializePerson(g, sidOf(2), { relation })).toBeNull()
    }
    expect(json(g)).toBe(before)
    expect(metRecord(g, sidOf(2))).toBeNull()
  })

  it('returns null for a sid that is not of the strict grammar, and writes nothing', () => {
    const g = trapRng(game())
    const before = json(g)
    for (const sid of ['', 'p12', 's77', 'frn.us.1990', 'frn.us.1990.x', 'frn.us.1700.1', 'a:b', 'frn.us.1990.1.extra', 'x'.repeat(41), 'frn.us.1990.10000']) {
      expect(materializePerson(g, sid, { relation: 'friend' }), sid).toBeNull()
    }
    for (const sid of [null, undefined, 12, {}, []] as unknown[]) expect(materializePerson(g, sid as string, { relation: 'friend' })).toBeNull()
    expect(materializePerson(g, sidOf(1), null as unknown as MaterializeOpts)).toBeNull()
    expect(materializePerson(g, sidOf(1), undefined as unknown as MaterializeOpts)).toBeNull()
    expect(json(g)).toBe(before)
  })

  it('a sid forced onto a child by hand is caught by metProblems, and by heirUnsafe', () => {
    const g = game()
    const sid = sidOf(1, 'kin')
    must(materializePerson(g, sid, { relation: 'friend' }))
    const kid = createPerson(g, { relation: 'child', age: 4 })
    kid.data.sid = sidOf(2, 'kin')
    expect(heirUnsafe(kid)).toBe(true)
    expect(metProblems(readWorld(g).met, g.people).join('\n')).toContain(`person ${kid.id} is a child and carries sid`)
    expect(worldProblems(g).join('\n')).toContain('carries sid')
  })

  it('re-exports heirUnsafe from the kernel (one function, defined at layer 0)', () => {
    expect(heirUnsafe).toBe(kernelHeirUnsafe)
  })
})

describe('a hostile opts.data', () => {
  it('has its sid overwritten by the sid of the call, and keeps the other keys', () => {
    const g = game()
    for (const [i, bad] of [sidOf(500), 'p1', '', 42, null, { sid: 'x' }, ['s']].entries()) {
      const sid = sidOf(i)
      const p = must(materializePerson(g, sid, { relation: 'friend', data: { sid: bad as never, keep: i } }))
      expect(p.data.sid).toBe(sid)
      expect(validSid(p.data.sid)).toBe(sid)
      expect(p.data.keep).toBe(i)
    }
  })

  it('is not spread when it is no plain object, and a data that is not an object does not throw', () => {
    const g = game()
    for (const [i, data] of [null, 5, 'sid', [1, 2], undefined].entries()) {
      const sid = sidOf(i)
      const p = must(materializePerson(g, sid, { relation: 'friend', data: data as never }))
      expect(p.data.sid).toBe(sid)
      expect(Object.keys(p.data).sort()).toEqual(['countryId', 'sid', 'skinTone'])
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// The hand-over
// ---------------------------------------------------------------------------------------------------------------------------

describe('a hand-over keeps a sid-bearing friend with an NpcLife and a sid-bearing spouse who is the heir\'s other parent', () => {
  function family(): { g: GameState; heirId: string; spouseSid: string; friendSid: string; looseSid: string } {
    const g = game(10_000)
    g.character.age = 78
    const heir = createPerson(g, { relation: 'child', age: 44, relationship: 70, money: 0, lastName: g.character.lastName })
    const spouseSid = sidOf(1, 'kin')
    const friendSid = sidOf(2, 'frn')
    const looseSid = sidOf(3, 'frn')
    const spouse = must(materializePerson(g, spouseSid, { relation: 'spouse', age: 75, livesWithPlayer: true, relationship: 80 }))
    const friend = must(materializePerson(g, friendSid, { relation: 'friend', age: 50, relationship: 70 }))
    const loose = must(materializePerson(g, looseSid, { relation: 'friend', age: 50, relationship: 70 }))
    heir.otherParentId = spouse.id
    initializeNpc(g, friend)
    expect(npcLife(friend)).toBeTruthy()
    expect(npcLife(loose)).toBeFalsy()
    // The books: 6,000 to the spouse and 4,000 to the friend, so the late player leaves no estate to share.
    expect(moveCash(g, playerPurse(g), personPurse(spouse), 6_000, 'gift')).toBe(6_000)
    expect(moveCash(g, playerPurse(g), personPurse(friend), 4_000, 'gift')).toBe(4_000)
    expect(g.character.money).toBe(0)
    return { g, heirId: heir.id, spouseSid, friendSid, looseSid }
  }

  it('both keep their sid and their ledger balance, the books balance and worldProblems is empty', () => {
    const { g, heirId, spouseSid, friendSid, looseSid } = family()
    const spouseBefore = acctBalance(g, `person:${spouseSid}`)
    const friendBefore = acctBalance(g, `person:${friendSid}`)
    expect(spouseBefore).toBe(6_000)
    expect(friendBefore).toBe(4_000)
    killCharacter(g, 'Old Age')
    g.queue = []
    const n = continueAsChild(g, heirId)
    expect(n).not.toBe(g)
    expect(n.generation).toBe(2)

    const spouse = must(personOfSid(n, spouseSid))
    const friend = must(personOfSid(n, friendSid))
    expect(spouse.relation).toBe('parent')
    expect(friend.relation).toBe('friend')
    expect(spouse.data.sid).toBe(spouseSid)
    expect(friend.data.sid).toBe(friendSid)
    expect(personPurse(spouse).acct).toBe(`person:${spouseSid}`)
    expect(personPurse(friend).acct).toBe(`person:${friendSid}`)
    expect(acctBalance(n, `person:${spouseSid}`)).toBe(spouseBefore)
    expect(acctBalance(n, `person:${friendSid}`)).toBe(friendBefore)
    expect(spouse.money).toBe(6_000)
    expect(friend.money).toBe(4_000)
    expect(checkLedger(n).ok).toBe(true)
    expect(worldProblems(n)).toEqual([])

    // The friend with no NpcLife is not kept by the old rule; the record stays, and nothing is left dangling.
    expect(personOfSid(n, looseSid)).toBeUndefined()
    expect(metRecord(n, looseSid)).not.toBeNull()
    expect(metProblems(readWorld(n).met, n.people)).toEqual([])
  })

  it('is the same twice: continueAsChild from the same state gives the same JSON', () => {
    const a = family()
    const b = family()
    for (const f of [a, b]) {
      killCharacter(f.g, 'Old Age')
      f.g.queue = []
    }
    expect(json(continueAsChild(a.g, a.heirId))).toBe(json(continueAsChild(b.g, b.heirId)))
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// people.ts: nameTaken reads the registry's names only when there is a Met entry
// ---------------------------------------------------------------------------------------------------------------------------

describe('createPerson and the names of the registry', () => {
  /** A person whose first name is given and whose last name is rolled: the only way a name is re-rolled for one half. */
  const rolled = (g: GameState): Person => createPerson(g, { relation: 'friend', age: 30, gender: 'male', firstName: 'Quill', countryId: 'us', occupation: 'Clerk', relationship: 50, money: 0 })

  it('a life with no Met entry draws exactly as before: a dead relative\'s name is not taken, and the shard being empty changes nothing', () => {
    const probe = game()
    const first = rolled(probe)
    const g = game()
    const dead = createPerson(g, { relation: 'parent', age: 80, gender: 'male', firstName: 'Quill', lastName: first.lastName, occupation: 'Retired', relationship: 50, money: 0, traits: [], stats: { happiness: 50, health: 50, smarts: 50, looks: 50 } })
    dead.alive = false
    const rngBefore = g.rng
    const copy = structuredClone(g)
    const p = rolled(g)
    expect(p.lastName).toBe(first.lastName)
    ensureWorld(copy).met = {} as never
    const q = rolled(copy)
    expect(q.lastName).toBe(first.lastName)
    expect(copy.rng).toBe(g.rng)
    expect(g.rng).not.toBe(rngBefore)
  })

  it('a life with a Met entry re-rolls a name the registry holds, a Met record\'s or a dead relative\'s', () => {
    const probe = game()
    const first = rolled(probe)
    const taken = first.lastName

    const withRecord = seed(game(), [[sidOf(1), rec(1, { f: 'Quill', l: taken })]])
    const p = rolled(withRecord)
    expect(p.lastName).not.toBe(taken)
    expect(withRecord.rng).not.toBe(probe.rng)

    const withDead = seed(game(), [[sidOf(2), rec(2)]])
    const dead = createPerson(withDead, { relation: 'parent', age: 80, gender: 'male', firstName: 'Quill', lastName: taken, occupation: 'Retired', relationship: 50, money: 0, traits: [], stats: { happiness: 50, health: 50, smarts: 50, looks: 50 } })
    dead.alive = false
    const q = rolled(withDead)
    expect(q.lastName).not.toBe(taken)

    const withTomb = seed(game(), [[sidOf(3, 'actor'), [YEAR - 2, 0, 0, 0, 'Quill', taken, packGb(1960, 1)] as unknown as Tomb]])
    expect(rolled(withTomb).lastName).not.toBe(taken)
  })

  it('a rolled name is never a name the registry holds: the 40 names a life would roll are all Met, and none of the 40 people takes one', () => {
    const probe = game()
    const names = Array.from({ length: 40 }, () => {
      const p = createPerson(probe, { relation: 'classmate', age: 20 })
      return [p.firstName, p.lastName] as const
    })
    const g = seed(
      game(),
      names.map(([f, l], i) => [sidOf(i, 'cls'), rec(i, { f, l })] as const),
    )
    const taken = new Set(names.map(([f, l]) => `${f}|${l}`))
    const made = Array.from({ length: 40 }, () => createPerson(g, { relation: 'classmate', age: 20 }))
    for (const p of made) expect(taken.has(`${p.firstName}|${p.lastName}`), `${p.firstName} ${p.lastName}`).toBe(false)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// The file
// ---------------------------------------------------------------------------------------------------------------------------

describe('the file materialize.ts', () => {
  const src = readFileSync(join(ROOT, FILE), 'utf8')
  const code = src.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*')).join('\n')

  it('draws no number and reads no clock: no g.rng, rand, pick, chance, randInt, Math.random, Date, stream', () => {
    expect(code).not.toMatch(/\bg\.rng\b|\brand\(|\bpick\(|\bchance\(|\brandInt\(|\buid\(|Math\.random|\bDate\b|performance\.now|\bstream\(|outcomeStream|\bbell\(/)
  })

  it('books no money: no .money or .cash write, no bracket key, no Object.assign, no purse add, mint, burn, income, spend or addMoney (S11\'s scan, run on the file)', () => {
    expect(code).not.toMatch(/\.(money|cash)\s*([-+*/]|\?\?|\|\|)?=(?!=)/)
    expect(code).not.toMatch(/\[\s*['"`](money|cash)['"`]\s*\]/)
    expect(code).not.toMatch(/Object\.assign\(|personPurse\(|\.add\(|bookMint|bookBurn|earnIncome|\bspend\(|addMoney|personCash|moveCash/)
  })

  it('has the one money literal that LEDGER.md rule 6 exempts, in the createPerson call, and no other', () => {
    const lits = code.match(/\bmoney\s*:/g) ?? []
    expect(lits.length).toBe(1)
  })

  it('has no long dash', () => {
    expect(DASH.test(src)).toBe(false)
  })

  it('imports downward only: the kernel, the registry in world/, the root people.ts and types, never the ui, a module or the hubs', () => {
    const imports = [...src.matchAll(/^(?:import|export) .* from '([^']+)'/gm)].map((m) => m[1]!)
    expect(imports.length).toBeGreaterThan(3)
    for (const from of imports) expect(from, from).toMatch(/^\.\/(people|types|kernel\/[a-z-]+|world\/[a-z-]+)$/)
    expect(imports).toContain('./people')
  })

  it('is the only file of src/game besides modules/heirs.ts that assigns data.sid (a light version of the scan that S11 owns)', () => {
    expect(src).toMatch(/\bsid\b/)
    expect(code).not.toMatch(/\.data\.sid\s*=(?!=)/)
  })
})
