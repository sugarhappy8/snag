// ci: fast
// R2-L14 (A.K2 b): the world's indexes over Person, Asset and the old NPC firms. An index is a row per entity ({ id, seen } and so
// on), sorted by id and cut to a cap; the record itself stays where it is, so the old readers are untouched and nothing is copied
// or rewritten. Strangers exist only as seeded data until something touches them: no code here makes a row for an id that is not
// already a record of the game. Each shard is written by replacing its root (never in place), only when it changed.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { personPurse } from '../src/game/cash'
import { isRef, parseRef } from '../src/game/kernel/ids'
import { playerAcct } from '../src/game/kernel/ledger'
import { initializeNpc, startNpcCompany } from '../src/game/npc-lives'
import { createPerson } from '../src/game/people'
import type { Asset, GameState, Json, Person } from '../src/game/types'
import { LOD_CAPS } from '../src/game/world/caps'
import { firmRef, normalizeFirms, readFirms, syncFirms } from '../src/game/world/firms'
import { homeRef, normalizeHomes, readHomes, syncHomes } from '../src/game/world/homes'
import { normalizePeople, npcFirmId, personRef, playerRef, readPeople, syncPeople } from '../src/game/world/people'
import '../src/game/world/shards'
import { normalizeWorld, shardNames, worldShard } from '../src/game/world/state'
import type { FirmsShard, HomesShard, PeopleShard } from '../src/game/world/types'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'

const YEAR = 2026

function game(): GameState {
  return makeTestGame(7, { age: 40, money: 50_000 })
}

/** An asset by hand: the index reads kind, id and value, and nothing else. */
function asset(id: string, kind: Asset['kind'], value: number, details: Record<string, Json> = {}): Asset {
  return { id, kind, name: `${kind} ${id}`, emoji: 'x', purchasePrice: value, value, condition: 80, purchasedAge: 30, upkeep: 0, details }
}

function friends(g: GameState, n: number, relationship: (i: number) => number): Person[] {
  return Array.from({ length: n }, (_, i) => createPerson(g, { relation: 'friend', age: 30, relationship: relationship(i), money: 100 }))
}

/** The raw shape an old NPC firm has inside its owner (npc-lives.ts storeCompany): { id, name, kind, value, details }. */
function giveCompany(p: Person, id: string, value = 0): void {
  p.data.npcCompany = { id, name: `Firm ${id}`, kind: 'business', value, details: { cash: 1_000 } } as unknown as Json
}

const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** A family, a rival firm and a house or two: enough of every index to have something in it. */
function richGame(): GameState {
  const g = game()
  createPerson(g, { relation: 'spouse', age: 38, relationship: 80 })
  createPerson(g, { relation: 'child', age: 8, relationship: 90 })
  createPerson(g, { relation: 'child', age: 5, relationship: 90 })
  friends(g, 5, (i) => 50 + i)
  const owner = createPerson(g, { relation: 'friend', age: 40, relationship: 40 })
  giveCompany(owner, 'npc1', 5_000)
  g.assets.push(asset('a1', 'business', 900_000), asset('a2', 'business', 50_000), asset('a3', 'house', 300_000), asset('a4', 'house', 450_000))
  return g
}

function setWorld(g: GameState, shard: string, value: unknown): void {
  g.world = { v: 1, [shard]: value } as GameState['world']
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the ids of the index', () => {
  it('names a person by data.sid when it is a text, else by id', () => {
    const g = game()
    const p = createPerson(g, { relation: 'friend', age: 30 })
    expect(personRef(p)).toBe(`person:${p.id}`)
    p.data.sid = 's77'
    expect(personRef(p)).toBe('person:s77')
    p.data.sid = ''
    expect(personRef(p)).toBe(`person:${p.id}`)
    p.data.sid = 5
    expect(personRef(p)).toBe(`person:${p.id}`)
    p.data.sid = 'has space'
    expect(personRef(p)).toBe(`person:${p.id}`)
    expect(isRef(personRef(p))).toBe(true)
  })

  it('agrees with the ledger: a person is the same account in the books and in the index', () => {
    const g = game()
    const p = createPerson(g, { relation: 'friend', age: 30 })
    const cases: Record<string, Json>[] = [{}, { sid: 's9' }, { sid: '' }, { sid: 4 }, { sid: 'a b' }, { sid: null }]
    for (const data of cases) {
      const q: Person = { ...p, data: { ...data } }
      expect(personRef(q), JSON.stringify(data)).toBe(personPurse(q).acct)
    }
    const odd: Person = { ...p, id: 'not an id', data: {} }
    expect(personRef(odd)).toBe(personPurse(odd).acct)
    expect(parseRef(personRef(odd))?.kind).not.toBe('person')
  })

  it('names the player as the ledger does, a firm as firm:<id> and a home as home:<id>', () => {
    const g = game()
    expect(playerRef(g)).toBe(playerAcct(g))
    expect(playerRef(g)).toBe(`person:${g.character.id}`)
    expect(firmRef('a7')).toBe('firm:a7')
    expect(homeRef('a3')).toBe('home:a3')
    expect(parseRef(firmRef('bad id'))?.kind).not.toBe('firm')
    expect(parseRef(homeRef('bad id'))?.kind).not.toBe('home')
    expect(parseRef(firmRef(''))?.kind).not.toBe('firm')
  })

  it('reads the id of an old NPC firm raw, and only when there is a text id', () => {
    const g = game()
    const p = createPerson(g, { relation: 'friend', age: 30 })
    expect(npcFirmId(p)).toBeNull()
    giveCompany(p, 'npc9')
    expect(npcFirmId(p)).toBe('npc9')
    for (const bad of [null, 5, 'x', [], { id: 5 }, { id: '' }, { name: 'x' }]) {
      p.data.npcCompany = bad as Json
      expect(npcFirmId(p), JSON.stringify(bad)).toBeNull()
    }
  })

  it('registers the three shards in the hub, and the world keeps them', () => {
    for (const name of ['people', 'firms', 'homes']) expect(shardNames()).toContain(name)
    const g = richGame()
    syncPeople(g)
    syncFirms(g)
    syncHomes(g)
    const w = normalizeWorld(g.world)
    expect(w.people).toEqual(g.world?.people)
    expect(w.firms).toEqual(g.world?.firms)
    expect(w.homes).toEqual(g.world?.homes)
  })
})

describe('the people index', () => {
  it('writes a row for each family member and friend, sorted by id, seen this year', () => {
    const g = richGame()
    syncPeople(g)
    const shard = readPeople(g)
    const expected = g.people.map(personRef).sort()
    expect(shard.rows.map((r) => r.id)).toEqual(expected)
    expect(shard.rows).toHaveLength(g.people.length)
    expect(shard.rows.every((r) => r.seen === YEAR)).toBe(true)
    expect(shard.over).toBe(0)
    expect(shard.v).toBe(1)
    expect([...shard.rows].sort(byId)).toEqual(shard.rows)
  })

  it('keeps the row of a person who left, with the year it last saw them, and never rewrites it', () => {
    const g = richGame()
    syncPeople(g)
    const gone = g.people.find((p) => p.relation === 'friend' && p.id !== npcFirmOwner(g).id)!
    const goneRef = personRef(gone)
    g.people = g.people.filter((p) => p !== gone)
    g.year = YEAR + 3
    syncPeople(g)
    const rows = readPeople(g).rows
    expect(rows.find((r) => r.id === goneRef)).toEqual({ id: goneRef, seen: YEAR })
    const stayer = personRef(g.people[0]!)
    expect(rows.find((r) => r.id === stayer)?.seen).toBe(YEAR + 3)
    expect(rows).toHaveLength(g.people.length + 1)
  })

  it('a second sync in the same year writes nothing: the same root, the same bytes', () => {
    const g = richGame()
    syncPeople(g)
    const root = g.world?.people
    const bytes = JSON.stringify(g.world)
    syncPeople(g)
    expect(g.world?.people).toBe(root)
    expect(JSON.stringify(g.world)).toBe(bytes)
  })

  it('does not depend on the order of g.people', () => {
    const a = richGame()
    const b = richGame()
    b.people.reverse()
    syncPeople(a)
    syncPeople(b)
    expect(JSON.stringify(b.world)).toBe(JSON.stringify(a.world))
  })

  it('reads fine through a deep-frozen state, and a sync that has nothing to change does not throw on one', () => {
    const g = richGame()
    syncPeople(g)
    deepFreeze(g)
    expect(readPeople(g).rows.length).toBe(g.people.length)
    expect(() => syncPeople(g)).not.toThrow()
    const empty = deepFreeze(game())
    expect(readPeople(empty)).toEqual({ v: 1, rows: [], over: 0 })
    expect(() => syncPeople(empty)).not.toThrow()
  })

  it('indexes the 80 who matter most out of 100 and counts the rest', () => {
    const g = game()
    const list = friends(g, 100, (i) => 20 + (i % 50))
    syncPeople(g)
    const shard = readPeople(g)
    expect(LOD_CAPS.intimate).toBe(80)
    expect(shard.rows).toHaveLength(80)
    expect(shard.over).toBe(20)
    const want = [...list]
      .sort((a, b) => b.relationship - a.relationship || (personRef(a) < personRef(b) ? -1 : 1))
      .slice(0, 80)
      .map(personRef)
      .sort()
    expect(shard.rows.map((r) => r.id)).toEqual(want)
  })

  it('ranks an owner of an NPC company above any friend, however close the friend is', () => {
    const g = game()
    friends(g, 100, () => 90)
    const owner = createPerson(g, { relation: 'friend', age: 45, relationship: 0 })
    giveCompany(owner, 'npc2', 10)
    syncPeople(g)
    const shard = readPeople(g)
    expect(shard.rows).toHaveLength(80)
    expect(shard.over).toBe(21)
    expect(shard.rows.map((r) => r.id)).toContain(personRef(owner))
  })

  it('moves a person in and out of the 80 as the ranking changes, and a present person ranked out has no row', () => {
    const g = game()
    const list = friends(g, 90, (i) => 10 + i)
    syncPeople(g)
    const low = list[0]!
    const high = list[89]!
    expect(readPeople(g).rows.map((r) => r.id)).not.toContain(personRef(low))
    expect(readPeople(g).rows.map((r) => r.id)).toContain(personRef(high))
    low.relationship = 100
    high.relationship = 1
    syncPeople(g)
    const rows = readPeople(g).rows.map((r) => r.id)
    expect(rows).toContain(personRef(low))
    expect(rows).not.toContain(personRef(high))
    expect(rows).toHaveLength(80)
    expect(readPeople(g).over).toBe(10)
  })

  it('makes no row for a pet, and none for an id a record only mentions', () => {
    const g = game()
    createPerson(g, { relation: 'pet', age: 3, species: 'Dog' })
    const kid = createPerson(g, { relation: 'child', age: 6, otherParentId: 'p999', contextId: 'school-x', data: { metAt: 'p888' } })
    syncPeople(g)
    expect(readPeople(g).rows.map((r) => r.id)).toEqual([personRef(kid)])
  })

  it('has no rows for a game of only the player, writes no world for it, and createPerson alone adds none', () => {
    const g = game()
    syncPeople(g)
    expect(readPeople(g)).toEqual({ v: 1, rows: [], over: 0 })
    expect('world' in g).toBe(false)
    createPerson(g, { relation: 'friend', age: 30 })
    expect(readPeople(g).rows).toHaveLength(0)
    expect('world' in g).toBe(false)
    syncPeople(g)
    expect(readPeople(g).rows).toHaveLength(1)
  })

  it('changes nothing but g.world, and draws nothing from g.rng', () => {
    const g = richGame()
    const rng = g.rng
    const nextId = g.nextId
    const people = JSON.stringify(g.people)
    const rest = JSON.stringify({ ...g, world: undefined })
    deepFreeze(g.people)
    deepFreeze(g.assets)
    deepFreeze(g.character)
    syncPeople(g)
    syncFirms(g)
    syncHomes(g)
    expect(g.rng).toBe(rng)
    expect(g.nextId).toBe(nextId)
    expect(JSON.stringify(g.people)).toBe(people)
    expect(JSON.stringify({ ...g, world: undefined })).toBe(rest)
  })
})

/** The person of richGame who owns the rival firm. */
function npcFirmOwner(g: GameState): Person {
  return g.people.find((p) => npcFirmId(p) !== null)!
}

describe('the firms index', () => {
  it('indexes own companies and the old NPC firms with the right forms and owners', () => {
    const g = game()
    g.assets.push(asset('b1', 'business', 100), asset('b2', 'business', 300), asset('b3', 'business', 200), asset('h1', 'house', 9))
    const p = createPerson(g, { relation: 'friend', age: 35, money: 3_000_000, relationship: 70 })
    giveCompany(p, 'npcA', 777)
    syncFirms(g)
    const rows = readFirms(g).rows
    expect(rows).toEqual([
      { id: 'firm:b1', form: 'biz', owner: playerRef(g), seen: YEAR },
      { id: 'firm:b2', form: 'biz', owner: playerRef(g), seen: YEAR },
      { id: 'firm:b3', form: 'biz', owner: playerRef(g), seen: YEAR },
      { id: 'firm:npcA', form: 'npc', owner: personRef(p), seen: YEAR },
    ])
    expect(readFirms(g).over).toBe(0)
  })

  it('indexes a firm that startNpcCompany really made, in place: no clone, same record', () => {
    const g = makeTestGame(52, { age: 35, money: 20_000_000 })
    const p = createPerson(g, { relation: 'friend', firstName: 'Adam', age: 30, money: 3_000_000, occupation: 'Engineer', relationship: 90, stats: { smarts: 88 }, traits: ['ambitious', 'loyal'] })
    initializeNpc(g, p)
    expect(startNpcCompany(g, p, 'cafe')).toBe(true)
    const record = p.data.npcCompany
    const snapshot = JSON.stringify(record)
    const id = (record as { id: string }).id
    const spy = vi.spyOn(globalThis, 'structuredClone')
    syncFirms(g)
    syncPeople(g)
    expect(spy).not.toHaveBeenCalled()
    expect(p.data.npcCompany).toBe(record)
    expect(JSON.stringify(p.data.npcCompany)).toBe(snapshot)
    expect(readFirms(g).rows).toEqual([{ id: `firm:${id}`, form: 'npc', owner: personRef(p), seen: g.year }])
    expect(readPeople(g).rows.map((r) => r.id)).toEqual([personRef(p)])
  })

  it('keeps the 20 most valuable of 25 own companies and counts the other 5', () => {
    const g = game()
    for (let i = 0; i < 25; i++) g.assets.push(asset(`c${String(i).padStart(2, '0')}`, 'business', 1_000 * (i + 1)))
    syncFirms(g)
    const shard = readFirms(g)
    expect(LOD_CAPS.fullFirms).toBe(20)
    expect(shard.rows).toHaveLength(20)
    expect(shard.over).toBe(5)
    expect(shard.rows.map((r) => r.id)).toEqual(Array.from({ length: 20 }, (_, i) => `firm:c${String(i + 5).padStart(2, '0')}`))
  })

  it('ranks own companies first, then the NPC firms, ties by id, when there are more than 20', () => {
    const g = game()
    for (let i = 0; i < 18; i++) g.assets.push(asset(`m${String(i).padStart(2, '0')}`, 'business', 100))
    const a = createPerson(g, { relation: 'friend', age: 40 })
    const b = createPerson(g, { relation: 'friend', age: 40 })
    const c = createPerson(g, { relation: 'friend', age: 40 })
    giveCompany(a, 'n1', 9_999_999)
    giveCompany(b, 'n2', 5)
    giveCompany(c, 'n3', 5)
    syncFirms(g)
    const shard = readFirms(g)
    expect(shard.rows).toHaveLength(20)
    expect(shard.over).toBe(1)
    const ids = shard.rows.map((r) => r.id)
    expect(ids).toContain('firm:n1')
    expect(ids).toContain('firm:n2')
    expect(ids).not.toContain('firm:n3')
    expect(shard.rows.filter((r) => r.form === 'biz')).toHaveLength(18)
  })

  it('keeps the row of a company that is gone, and drops the row of a present one that fell out of the top 20', () => {
    const g = game()
    for (let i = 0; i < 20; i++) g.assets.push(asset(`k${String(i).padStart(2, '0')}`, 'business', 1_000 + i))
    syncFirms(g)
    expect(readFirms(g).rows).toHaveLength(20)
    g.year = YEAR + 2
    g.assets = g.assets.filter((a) => a.id !== 'k19')
    g.assets.push(asset('z98', 'business', 50_000), asset('z99', 'business', 60_000))
    syncFirms(g)
    const rows = readFirms(g).rows
    // k19 is gone: its row stays as it was.
    expect(rows.find((r) => r.id === 'firm:k19')?.seen).toBe(YEAR)
    expect(rows.find((r) => r.id === 'firm:z99')?.seen).toBe(YEAR + 2)
    // 21 present records now compete for 20 places: the least valuable present one has no row and is counted.
    expect(rows.find((r) => r.id === 'firm:k00')).toBeUndefined()
    expect(readFirms(g).over).toBe(1)
    expect(rows).toHaveLength(21)
  })

  it('is idempotent, order independent, and reads through a frozen state', () => {
    const a = richGame()
    const b = richGame()
    b.assets.reverse()
    b.people.reverse()
    syncFirms(a)
    syncFirms(b)
    expect(JSON.stringify(b.world)).toBe(JSON.stringify(a.world))
    const root = a.world?.firms
    syncFirms(a)
    expect(a.world?.firms).toBe(root)
    deepFreeze(a)
    expect(readFirms(a).rows).toHaveLength(3)
    expect(() => syncFirms(a)).not.toThrow()
  })

  it('has no rows and no world for a game with no company', () => {
    const g = game()
    g.assets.push(asset('h1', 'house', 100), asset('v1', 'car', 10))
    syncFirms(g)
    expect(readFirms(g)).toEqual({ v: 1, rows: [], over: 0 })
    expect('world' in g).toBe(false)
  })
})

describe('the homes index', () => {
  it('indexes houses only, owned by the player, seen this year', () => {
    const g = game()
    g.assets.push(asset('h2', 'house', 200), asset('h1', 'house', 300), asset('c1', 'car', 40), asset('b1', 'business', 900), asset('i1', 'investment', 70))
    syncHomes(g)
    expect(readHomes(g).rows).toEqual([
      { id: 'home:h1', owner: playerRef(g), seen: YEAR },
      { id: 'home:h2', owner: playerRef(g), seen: YEAR },
    ])
    expect(readHomes(g).over).toBe(0)
  })

  it('gives 150 rows for 160 houses, the most valuable, and counts 10', () => {
    const g = game()
    for (let i = 0; i < 160; i++) g.assets.push(asset(`h${String(i).padStart(3, '0')}`, 'house', 1_000 + i))
    syncHomes(g)
    const shard = readHomes(g)
    expect(LOD_CAPS.homes).toBe(150)
    expect(shard.rows).toHaveLength(150)
    expect(shard.over).toBe(10)
    expect(shard.rows[0]?.id).toBe('home:h010')
    expect(shard.rows[149]?.id).toBe('home:h159')
  })

  it('keeps the row of a house that was sold, is idempotent, and reads through a frozen state', () => {
    const g = richGame()
    syncHomes(g)
    const root = g.world?.homes
    syncHomes(g)
    expect(g.world?.homes).toBe(root)
    g.year = YEAR + 1
    g.assets = g.assets.filter((a) => a.id !== 'a3')
    syncHomes(g)
    expect(readHomes(g).rows.find((r) => r.id === 'home:a3')?.seen).toBe(YEAR)
    expect(readHomes(g).rows.find((r) => r.id === 'home:a4')?.seen).toBe(YEAR + 1)
    deepFreeze(g)
    expect(() => syncHomes(g)).not.toThrow()
    expect(readHomes(g).rows).toHaveLength(2)
  })
})

describe('hostile shards are always valid and bounded', () => {
  const GARBAGE: unknown[] = [null, 5, 'x', true, [], [1, 2], { v: 2 }, { v: '1' }, { rows: [] }, { v: 1, rows: 'no' }, { v: 1, rows: { a: 1 } }]

  it('reads garbage as an empty shard, for each of the three', () => {
    for (const bad of GARBAGE) {
      const g = game()
      setWorld(g, 'people', bad)
      expect(readPeople(g), JSON.stringify(bad)).toEqual({ v: 1, rows: [], over: 0 })
      setWorld(g, 'firms', bad)
      expect(readFirms(g), JSON.stringify(bad)).toEqual({ v: 1, rows: [], over: 0 })
      setWorld(g, 'homes', bad)
      expect(readHomes(g), JSON.stringify(bad)).toEqual({ v: 1, rows: [], over: 0 })
    }
  })

  it('cuts a people shard to its valid rows: right kind, valid key, a year from 1900 to 100000, one row per id, the latest seen', () => {
    const rows = [
      { id: 'person:b', seen: 2020 },
      { id: 'person:a', seen: 2020 },
      { id: 'person:a', seen: 2025 },
      { id: 'person:a', seen: 2010 },
      { id: 'firm:x', seen: 2020 },
      { id: 'home:x', seen: 2020 },
      { id: 'person:has space', seen: 2020 },
      { id: 'person:', seen: 2020 },
      { id: 'person:z', seen: 'x' },
      { id: 'person:n', seen: Number.NaN },
      { id: 'person:inf', seen: Number.POSITIVE_INFINITY },
      { id: 'person:big', seen: 1e9 },
      { id: 'person:old', seen: 1899 },
      { id: 'person:frac', seen: 2020.5 },
      { id: 'person:max', seen: 100_000 },
      { id: 'person:min', seen: 1900 },
      { id: 7, seen: 2020 },
      { seen: 2020 },
      { id: 'person:extra', seen: 2021, junk: 'x', more: { deep: true } },
      null,
      5,
      'person:str',
      [],
      undefined,
    ]
    const g = game()
    setWorld(g, 'people', { v: 1, rows, over: 3 })
    const shard = worldShard<PeopleShard>(g, 'people')!
    expect(shard).toEqual({
      v: 1,
      rows: [
        { id: 'person:a', seen: 2025 },
        { id: 'person:b', seen: 2020 },
        { id: 'person:extra', seen: 2021 },
        { id: 'person:max', seen: 100_000 },
        { id: 'person:min', seen: 1900 },
      ],
      over: 3,
    })
    expect(readPeople(g)).toEqual(shard)
  })

  it('cuts a firms shard to its valid rows: form biz or npc, an owner that is a person', () => {
    const rows = [
      { id: 'firm:b', form: 'biz', owner: 'person:me', seen: 2020 },
      { id: 'firm:a', form: 'npc', owner: 'person:p1', seen: 2021 },
      { id: 'firm:c', form: 'other', owner: 'person:p1', seen: 2021 },
      { id: 'firm:d', form: 'biz', owner: 'firm:zz', seen: 2021 },
      { id: 'firm:e', form: 'biz', owner: 'nobody', seen: 2021 },
      { id: 'firm:f', form: 'biz', owner: 7, seen: 2021 },
      { id: 'firm:g', form: 'biz', seen: 2021 },
      { id: 'person:h', form: 'biz', owner: 'person:p1', seen: 2021 },
      { id: 'firm:i', form: 'biz', owner: 'person:p1', seen: 'x' },
      { id: 'firm:a', form: 'biz', owner: 'person:p2', seen: 2019 },
      { id: 'firm:j', form: 'biz', owner: 'person:p1', seen: 2021, extra: 1 },
    ]
    const g = game()
    setWorld(g, 'firms', { v: 1, rows, over: 'x' })
    const shard = worldShard<FirmsShard>(g, 'firms')!
    expect(shard).toEqual({
      v: 1,
      rows: [
        { id: 'firm:a', form: 'npc', owner: 'person:p1', seen: 2021 },
        { id: 'firm:b', form: 'biz', owner: 'person:me', seen: 2020 },
        { id: 'firm:j', form: 'biz', owner: 'person:p1', seen: 2021 },
      ],
      over: 0,
    })
  })

  it('cuts a homes shard to its valid rows', () => {
    const rows = [
      { id: 'home:b', owner: 'person:me', seen: 2020 },
      { id: 'home:a', owner: 'person:me', seen: 2020 },
      { id: 'firm:c', owner: 'person:me', seen: 2020 },
      { id: 'home:d', owner: 'nobody', seen: 2020 },
      { id: 'home:e', owner: 'person:me', seen: 99 },
      { id: 'home:f', owner: 'person:me', seen: 2020, form: 'biz' },
    ]
    const g = game()
    setWorld(g, 'homes', { v: 1, rows, over: -4 })
    expect(worldShard<HomesShard>(g, 'homes')).toEqual({
      v: 1,
      rows: [
        { id: 'home:a', owner: 'person:me', seen: 2020 },
        { id: 'home:b', owner: 'person:me', seen: 2020 },
        { id: 'home:f', owner: 'person:me', seen: 2020 },
      ],
      over: 0,
    })
  })

  it('keeps over as an integer from 0 to 100000', () => {
    const g = game()
    const at = (over: unknown): number => {
      setWorld(g, 'people', { v: 1, rows: [], over })
      return readPeople(g).over
    }
    expect(at(0)).toBe(0)
    expect(at(25)).toBe(25)
    expect(at(100_000)).toBe(100_000)
    expect(at(1e12)).toBe(100_000)
    expect(at(-1)).toBe(0)
    expect(at(7.9)).toBe(7)
    expect(at(Number.NaN)).toBe(0)
    expect(at('9')).toBe(0)
    expect(at(undefined)).toBe(0)
  })

  it('cuts 500 rows to the cap of each shard, keeping the most recently seen, deterministically', () => {
    type Raw = Record<string, unknown> & { id: string; seen: number }
    const many = (kind: string, extra: Record<string, unknown> = {}): Raw[] =>
      Array.from({ length: 500 }, (_, i) => ({ id: `${kind}:r${String(i).padStart(3, '0')}`, ...extra, seen: 1900 + ((i * 7) % 100) }))
    const keepFreshest = (rows: Raw[], cap: number): Raw[] => [...rows].sort((a, b) => b.seen - a.seen || (a.id < b.id ? -1 : 1)).slice(0, cap).sort(byId)
    const g = game()
    setWorld(g, 'people', { v: 1, rows: many('person'), over: 0 })
    const people = readPeople(g)
    expect(LOD_CAPS.people).toBe(400)
    expect(people.rows).toHaveLength(400)
    expect(people.rows).toEqual(keepFreshest(many('person'), 400))
    setWorld(g, 'firms', { v: 1, rows: many('firm', { form: 'biz', owner: 'person:me' }), over: 0 })
    const firms = readFirms(g)
    expect(firms.rows).toHaveLength(60)
    expect(firms.rows).toEqual(keepFreshest(many('firm', { form: 'biz', owner: 'person:me' }), 60))
    setWorld(g, 'homes', { v: 1, rows: many('home', { owner: 'person:me' }), over: 0 })
    const homes = readHomes(g)
    expect(homes.rows).toHaveLength(150)
    expect(homes.rows).toEqual(keepFreshest(many('home', { owner: 'person:me' }), 150))
    // The same input read again gives the same answer, and the output read again is itself.
    expect(normalizePeople({ v: 1, rows: many('person'), over: 0 })).toEqual(people)
    expect(normalizePeople(people)).toBe(people)
    expect(normalizeFirms(firms)).toBe(firms)
    expect(normalizeHomes(homes)).toBe(homes)
  })

  it('hands a valid shard back as itself, and its own output as itself', () => {
    const ok = { v: 1, rows: [{ id: 'person:a', seen: 2020 }], over: 2 }
    expect(normalizePeople(ok)).toBe(ok)
    const fine = { v: 1, rows: [{ id: 'firm:a', form: 'npc', owner: 'person:p', seen: 2020 }], over: 0 }
    expect(normalizeFirms(fine)).toBe(fine)
    const home = { v: 1, rows: [{ id: 'home:a', owner: 'person:p', seen: 2020 }], over: 0 }
    expect(normalizeHomes(home)).toBe(home)
    const messy = normalizePeople({ v: 1, rows: [{ id: 'person:b', seen: 2020 }, { id: 'person:a', seen: 2020 }], over: 0 })
    expect(normalizePeople(messy)).toBe(messy)
  })

  it('never throws, whatever the input', () => {
    const throwing = Object.defineProperty({ v: 1 }, 'rows', {
      enumerable: true,
      get() {
        throw new Error('a getter that throws')
      },
    })
    const cyclic: Record<string, unknown> = { v: 1, rows: [] }
    cyclic.rows = [cyclic]
    const proto = JSON.parse('{"v":1,"rows":[{"id":"person:a","seen":2020,"__proto__":{"x":1}}],"__proto__":{"polluted":true}}') as unknown
    for (const raw of [throwing, cyclic, proto, Object.create(null), new Map(), new Date(0), () => 1, Symbol('s')]) {
      expect(() => normalizePeople(raw)).not.toThrow()
      expect(() => normalizeFirms(raw)).not.toThrow()
      expect(() => normalizeHomes(raw)).not.toThrow()
    }
    expect(normalizePeople(proto).rows).toEqual([{ id: 'person:a', seen: 2020 }])
    expect(({} as { polluted?: unknown }).polluted).toBeUndefined()
    expect(normalizePeople(throwing)).toEqual({ v: 1, rows: [], over: 0 })
  })

  it('syncs over a hostile stored shard and leaves a clean one', () => {
    const g = richGame()
    setWorld(g, 'people', { v: 1, rows: [{ id: 'person:ghost', seen: 'x' }, { id: 'person:old', seen: 2001 }], over: 'many' })
    syncPeople(g)
    const rows = readPeople(g).rows
    expect(rows.find((r) => r.id === 'person:old')?.seen).toBe(2001)
    expect(rows.find((r) => r.id === 'person:ghost')).toBeUndefined()
    expect(readPeople(g).over).toBe(0)
    const stored = g.world?.people
    expect(normalizePeople(stored)).toBe(stored)
  })
})

describe('replace discipline: a shard is written by replacing its root, never in place', () => {
  const NAMES = ['people', 'firms', 'homes'] as const

  function syncAll(g: GameState): void {
    syncPeople(g)
    syncFirms(g)
    syncHomes(g)
  }

  /** Something new in every index, so each sync has something to write. */
  function grow(g: GameState): void {
    createPerson(g, { relation: 'friend', age: 30, relationship: 99 })
    g.assets.push(asset('new-biz', 'business', 5_000_000), asset('new-house', 'house', 5_000_000))
    g.year += 1
  }

  for (const name of NAMES) {
    it(`does not throw with only the ${name} root deep-frozen, writes a new root and leaves the frozen one unchanged`, () => {
      const g = richGame()
      syncAll(g)
      const frozen = g.world?.[name]
      expect(frozen).toBeDefined()
      deepFreeze(frozen)
      const snapshot = JSON.stringify(frozen)
      grow(g)
      expect(() => syncAll(g)).not.toThrow()
      expect(g.world?.[name]).not.toBe(frozen)
      expect(JSON.stringify(frozen)).toBe(snapshot)
      expect(JSON.stringify(g.world?.[name])).not.toBe(snapshot)
    })
  }

  it('does not throw with all three roots frozen at once', () => {
    const g = richGame()
    syncAll(g)
    for (const name of NAMES) deepFreeze(g.world?.[name])
    const before = NAMES.map((n) => JSON.stringify(g.world?.[n]))
    grow(g)
    expect(() => syncAll(g)).not.toThrow()
    NAMES.forEach((n, i) => expect(JSON.stringify(g.world?.[n])).not.toBe(before[i]))
  })

  it('keeps the other shards of the world, and its own `y`, when it writes one', () => {
    const g = richGame()
    g.world = { v: 1, y: 2024, other: 5 } as unknown as GameState['world']
    syncPeople(g)
    expect(g.world?.y).toBe(2024)
    expect((g.world as { other?: unknown }).other).toBe(5)
    expect(g.world?.people).toBeDefined()
  })
})
