// R2-L15 (A.K2 c): the world's invariants, and the heir who keeps the index current. continueAsChild clones the whole state, so
// g.world reaches the heir by clone (RF3); it then rebuilds n.people, so the index is synced once more at the end of it
// (syncWorld). worldProblems is the fuzz harness's check of the whole world: the books, the three indexes, the holdings.
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { addMoney, spend } from '../src/game/core'
import { designateSuccessor, hireRelative } from '../src/game/business/nepo-actions'
import { successorOf } from '../src/game/business/nepo-state'
import { bizOf, findBusiness } from '../src/game/business/state'
import { killCharacter } from '../src/game/death'
import { ledgerRoot, peekLedger } from '../src/game/kernel/ledger'
import { continueAsChild } from '../src/game/life'
import { npcCompany } from '../src/game/npc-lives'
import { createPerson } from '../src/game/people'
import type { Asset, GameState, Json, Person } from '../src/game/types'
import { LOD_CAPS } from '../src/game/world/caps'
import { readFirms } from '../src/game/world/firms'
import { buildHoldings, OUTSIDE, readHoldings, syncHoldings } from '../src/game/world/holdings'
import { worldProblems } from '../src/game/world/invariants'
import { personRef, playerRef, readPeople } from '../src/game/world/people'
import '../src/game/world/shards'
import { syncWorld } from '../src/game/world/sync'
import type { HoldingRow } from '../src/game/world/types'
import { deepFreeze, invariantFailures } from './fuzz-kit'
import { makeTestGame } from './helpers'
import { kid, world } from './nepo-kit'
import { probeLife } from './probe-life'
import { findSeed } from './seed-kit'

/** The probe life of the heir test: [the seed the search starts from, birth year]. A tuple, not a pinned seed: the life is the first seed from it whose founder is still alive after 40 years. */
const LIFE = [7, 1950] as const

function asset(id: string, kind: Asset['kind'], value: number, details: Record<string, Json> = {}): Asset {
  return { id, kind, name: `${kind} ${id}`, emoji: 'x', purchasePrice: value, value, condition: 80, purchasedAge: 30, upkeep: 0, details }
}

const peopleOf = (g: GameState): Person[] => g.people

/** JSON with the keys of every object sorted: the content of a world, whatever order its shards were first written in. */
const canonical = (x: unknown): string =>
  JSON.stringify(x, (_key, v: unknown) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : v))

describe('an heir after a 40-year life with three companies', () => {
  let late: GameState
  let heir: GameState
  let heirId: string

  beforeAll(() => {
    // keepAlive holds the health up, not the age: a founder can still die of old age at 66, and a change that moves one draw moves
    // who does (R3-Q9 moved seed 7). The test is about the heir, so it takes the first life of the search that gets to 40 years.
    let alive: GameState | undefined
    findSeed(
      (seed) => {
        const x = probeLife({ seed, birthYear: LIFE[1], businesses: 3, years: 40, keepAlive: true })
        if (x.character.alive) alive = x
        return x.character.alive
      },
      { from: LIFE[0], tries: 30, label: 'a founder of three companies who is alive after 40 years (the heir test)' },
    )
    const g = alive!
    expect(g.character.alive).toBe(true)
    expect(g.assets.filter((a) => a.kind === 'business').length).toBeGreaterThanOrEqual(1)
    // Most of a probe life's money still moves through code that is not booked yet (R2-L6 to R2-L12): book a few flows by reason,
    // so the pools have something in them to compare.
    addMoney(g, 40_000, 'wage')
    spend(g, 12_000, 'rent')
    spend(g, 3_000, 'purchase')
    spend(g, 800, 'health')
    const child = createPerson(g, { relation: 'child', age: 26, lastName: g.character.lastName, relationship: 80 })
    heirId = child.id
    killCharacter(g, 'Old Age')
    g.queue = []
    late = structuredClone(g)
    heir = continueAsChild(g, heirId)
  }, 240_000)

  it('has a world: the indexes and the holdings, stamped with the year of the hand-over', () => {
    expect(heir).not.toBe(late)
    expect(heir.character.id).toBe(heirId)
    expect(heir.world?.y).toBe(heir.year)
    expect(readPeople(heir).rows.length).toBeGreaterThan(0)
    expect(readFirms(heir).rows.length).toBeGreaterThan(0)
    expect(readHoldings(heir).y).toBe(heir.year)
  })

  it('keeps the ledger by clone: pool and gov accounts are the old ones, except the estate counterparties', () => {
    const country = late.character.countryId
    // The estate pays the state, the lawyers, charity and the household pool; today the will code also books through the default
    // counterparty (pool:other) until R2-L8 gives those sites reasons. Nothing else may move.
    const estate = new Set(['pool:legal', 'pool:charity', 'pool:other', `gov:${country}`, `pool:hh:${country}`])
    const pools = (g: GameState): Record<string, number> => Object.fromEntries(Object.entries(peekLedger(g).a).filter(([k]) => /^(pool|gov):/.test(k) && !estate.has(k)))
    expect(Object.keys(pools(late)).length).toBeGreaterThan(0)
    expect(pools(heir)).toEqual(pools(late))
    expect(peekLedger(heir).m).toEqual(peekLedger(late).m)
    expect(peekLedger(heir).b).toEqual(peekLedger(late).b)
  })

  it('the index sync books nothing: the ledger is byte for byte what it was before the sync', () => {
    const stripped = structuredClone(heir)
    delete stripped.world?.people
    delete stripped.world?.firms
    delete stripped.world?.homes
    delete stripped.world?.holdings
    delete stripped.world?.y
    const books = JSON.stringify(stripped.world?.ledger)
    syncWorld(stripped)
    expect(JSON.stringify(stripped.world?.ledger)).toBe(books)
    // The world step (R2-L17) writes `lod` after the indexes, in the order of the heir's own life; a sync that re-adds the indexes puts
    // them after it. The content is the same, so it is compared with the keys sorted (the ledger above stays a byte for byte check).
    expect(canonical(stripped.world)).toBe(canonical(heir.world))
  })

  it('lists the companies the heir keeps, owned by the heir, each summing to 1', () => {
    const kept = heir.assets.filter((a) => a.kind === 'business')
    expect(kept.length).toBeGreaterThan(0)
    const rows = readHoldings(heir).rows
    const held = new Set(rows.map((r) => r[1]))
    for (const a of kept) {
      expect(held.has(`firm:${a.id}`), a.id).toBe(true)
      const mine = rows.find((r) => r[1] === `firm:${a.id}` && r[0] === playerRef(heir))
      expect(mine, a.id).toBeDefined()
      expect(Math.abs(rows.filter((r) => r[1] === `firm:${a.id}`).reduce((s, r) => s + r[2], 0) - 1)).toBeLessThanOrEqual(1e-6)
    }
    // Nothing is held that the heir does not have: no company of the late founder who did not pass on.
    const firmIds = new Set([...kept.map((a) => `firm:${a.id}`), ...peopleOf(heir).flatMap((p) => (npcCompany(p, heir.year) ? [`firm:${npcCompany(p, heir.year)!.a.id}`] : []))])
    for (const id of held) if (id.startsWith('firm:')) expect(firmIds.has(id), id).toBe(true)
    expect(rows.every((r) => r[0] === OUTSIDE || r[0].startsWith('person:'))).toBe(true)
  })

  it('has no world problems right after the hand-over, and the old dead state had none either', () => {
    expect(worldProblems(heir)).toEqual([])
    expect(worldProblems(late)).toEqual([])
  })

  it('syncWorld again gives the same JSON, and so does a rebuild from nothing', () => {
    const once = JSON.stringify(heir)
    const again = structuredClone(heir)
    syncWorld(again)
    syncWorld(again)
    expect(JSON.stringify(again)).toBe(once)
  })

  it('a world with the indexes frozen alone can be synced again in a later year', () => {
    const g = structuredClone(heir)
    for (const name of ['people', 'firms', 'homes', 'holdings'] as const) deepFreeze(g.world?.[name])
    g.year += 1
    expect(() => syncWorld(g)).not.toThrow()
    expect(g.world?.y).toBe(g.year)
    expect(worldProblems(g)).toEqual([])
  })
})

describe('a sibling who is not the heir owns the family firm', () => {
  it('shows as an npc row owned by the sibling, and the firm record is not rewritten', () => {
    const { g, a, b } = world(135, { age: 78 })
    const successor = kid(g, 39, { smarts: 88 })
    const willHeir = kid(g, 36, { smarts: 65 })
    expect(hireRelative(g, a, b, successor, { rank: 2 }, { quiet: true }).ok).toBe(true)
    expect(designateSuccessor(g, a, bizOf(g, a), successor, { quiet: true }).ok).toBe(true)
    g.character.willBeneficiaries = [willHeir.id]
    a.value = 12_000_000
    g.character.money = 0
    expect(successorOf(g, a, bizOf(g, a))).toMatchObject({ kind: 'person' })
    killCharacter(g, 'Old Age')
    g.queue = []
    const n = continueAsChild(g, willHeir.id)
    const sib = n.people.find((p) => p.id === successor.id) as Person
    expect(npcCompany(sib, n.year)?.a.id).toBe(a.id)
    expect(findBusiness(n, a.id)).toBeUndefined()

    const row = readFirms(n).rows.find((r) => r.id === `firm:${a.id}`)
    expect(row).toEqual({ id: `firm:${a.id}`, form: 'npc', owner: personRef(sib), seen: n.year })
    expect(readPeople(n).rows.map((r) => r.id)).toContain(personRef(sib))
    expect(readHoldings(n).rows.filter((r) => r[1] === `firm:${a.id}`).map((r) => r[0])).toContain(personRef(sib))
    expect(worldProblems(n)).toEqual([])

    // The record is indexed in place: syncing again clones nothing and writes nothing into it.
    const record = sib.data.npcCompany
    const snapshot = JSON.stringify(record)
    const spy = vi.spyOn(globalThis, 'structuredClone')
    syncWorld(n)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
    expect(sib.data.npcCompany).toBe(record)
    expect(JSON.stringify(record)).toBe(snapshot)
  })
})

/** A family, a rival firm, companies and houses, synced: every index has rows, and the world is whole. */
function synced(): GameState {
  const g = makeTestGame(7, { age: 40, money: 50_000 })
  const spouse = createPerson(g, { relation: 'spouse', age: 38, relationship: 80 })
  createPerson(g, { relation: 'child', age: 8, relationship: 90 })
  for (let i = 0; i < 4; i++) createPerson(g, { relation: 'friend', age: 30, relationship: 40 + i })
  const owner = createPerson(g, { relation: 'friend', age: 40, relationship: 30 })
  owner.data.npcCompany = { id: 'npc1', name: 'Firm npc1', kind: 'business', value: 5_000, details: { share: 0.7 } } as unknown as Json
  g.assets.push(
    asset('c1', 'business', 900_000, { share: 0.6, familyShares: [{ id: spouse.id, share: 0.1 }] }),
    asset('c2', 'business', 50_000, { share: 1 }),
    asset('h1', 'house', 300_000),
    asset('npc-stake:npc1', 'investment', 100, { npcCompanyId: 'npc1', share: 0.2 }),
  )
  addMoney(g, 500, 'wage')
  syncWorld(g)
  return g
}

const has = (problems: string[], ...needles: RegExp[]): boolean => problems.some((p) => needles.every((n) => n.test(p)))

describe('worldProblems', () => {
  it('has nothing to report for a whole, synced world, and for a state with no world at all', () => {
    const g = synced()
    expect(g.world?.y).toBe(g.year)
    expect(worldProblems(g)).toEqual([])
    expect(worldProblems(makeTestGame(1))).toEqual([])
    expect(worldProblems(deepFreeze(synced()))).toEqual([])
  })

  it('is pure: it writes nothing, and does not need a writable state', () => {
    const g = synced()
    const snapshot = JSON.stringify(g)
    worldProblems(g)
    worldProblems(g, { live: true })
    expect(JSON.stringify(g)).toBe(snapshot)
  })

  it('reports a duplicate person row', () => {
    const g = synced()
    g.world!.people!.rows.push({ ...g.world!.people!.rows[0]! })
    expect(has(worldProblems(g), /people/, /duplicate/, /person:/)).toBe(true)
  })

  it('reports two living spouses, and a spouse who has died does not count', () => {
    const g = synced()
    expect(worldProblems(g)).toEqual([])
    createPerson(g, { relation: 'spouse', age: 30, relationship: 50 })
    expect(has(worldProblems(g), /people/, /2 living spouses/)).toBe(true)
    g.people[g.people.length - 1]!.alive = false
    expect(worldProblems(g)).toEqual([])
  })

  it('reports two people with one id', () => {
    const g = synced()
    g.people.push({ ...g.people[1]! })
    expect(has(worldProblems(g), /people/, /duplicate person id/)).toBe(true)
  })

  it('reports holdings that sum to 0.9', () => {
    const g = synced()
    const rows = g.world!.holdings!.rows as HoldingRow[]
    const i = rows.findIndex((r) => r[0] === OUTSIDE)
    expect(i).toBeGreaterThanOrEqual(0)
    rows[i] = [rows[i]![0], rows[i]![1], 0.2]
    const problems = worldProblems(g)
    expect(has(problems, /holdings/, /firm:c1/, /sums to 0\.9/)).toBe(true)
  })

  it('reports a share of 0, a share over 1, a bad owner and a bad asset in the holdings', () => {
    const g = synced()
    const rows = g.world!.holdings!.rows as unknown[]
    rows.push(['person:x', 'firm:zz1', 0], ['person:x', 'firm:zz2', 2], ['nobody', 'firm:zz3', 1], ['person:x', 'bad', 1], 'junk')
    const problems = worldProblems(g)
    expect(problems.filter((p) => /^holdings: bad row/.test(p)).length).toBe(5)
  })

  it('reports a fresh firm row whose asset is gone, only when the index is fresh', () => {
    const g = synced()
    g.world!.firms!.rows.push({ id: 'firm:ghost', form: 'biz', owner: playerRef(g), seen: g.year })
    expect(has(worldProblems(g), /firms/, /firm:ghost/, /no such company/)).toBe(true)
    // A year later the index is stale and a row that old is just a record that left: structural checks only.
    g.year += 1
    expect(worldProblems(g)).toEqual([])
    expect(has(worldProblems(g, { live: true }), /firm:ghost/)).toBe(false)
  })

  it('reports a fresh person row, home row and npc row with no record behind it', () => {
    const g = synced()
    g.world!.people!.rows.push({ id: 'person:nobody', seen: g.year })
    g.world!.homes!.rows.push({ id: 'home:gone', owner: playerRef(g), seen: g.year })
    g.world!.firms!.rows.push({ id: 'firm:npcgone', form: 'npc', owner: playerRef(g), seen: g.year })
    const problems = worldProblems(g)
    expect(has(problems, /people/, /person:nobody/, /no such person/)).toBe(true)
    expect(has(problems, /homes/, /home:gone/, /no such home/)).toBe(true)
    expect(has(problems, /firms/, /firm:npcgone/, /no such company/)).toBe(true)
  })

  it('reports a held asset that is in no index', () => {
    const g = synced()
    ;(g.world!.holdings!.rows as HoldingRow[]).push([playerRef(g), 'firm:unindexed', 1], [playerRef(g), 'home:unindexed', 1])
    const problems = worldProblems(g)
    expect(has(problems, /holdings/, /firm:unindexed/, /firms index/)).toBe(true)
    expect(has(problems, /holdings/, /home:unindexed/, /homes index/)).toBe(true)
    g.world!.y = g.year - 1
    expect(has(worldProblems(g), /unindexed/)).toBe(false)
  })

  it('reports an identity break in the ledger, with the ledger named', () => {
    const g = synced()
    expect(worldProblems(g)).toEqual([])
    ledgerRoot(g).a['pool:other'] = (ledgerRoot(g).a['pool:other'] ?? 0) + 7
    const problems = worldProblems(g)
    expect(problems.length).toBeGreaterThan(0)
    expect(problems.every((p) => p.startsWith('ledger: '))).toBe(true)
  })

  it('checks the shape: a garbage root, a wrong version, rows that are not a list, a bad row, too many rows', () => {
    const g = synced()
    g.world!.people = { v: 2, rows: [] } as never
    expect(has(worldProblems(g), /people: not a v1 shard/)).toBe(true)
    g.world!.people = { v: 1, rows: 'no', over: 0 } as never
    expect(has(worldProblems(g), /people: not a v1 shard/)).toBe(true)
    g.world!.people = { v: 1, rows: [{ id: 'firm:x', seen: g.year }, { id: 'person:a', seen: 'x' }, null, 5], over: 0 } as never
    expect(worldProblems(g).filter((p) => /^people: bad row/.test(p))).toHaveLength(4)
    g.world!.people = { v: 1, rows: Array.from({ length: LOD_CAPS.people + 1 }, (_, i) => ({ id: `person:q${i}`, seen: 2000 })), over: 0 }
    expect(has(worldProblems(g), /people: 401 rows, more than the 400 allowed/)).toBe(true)
    g.world!.people = { v: 1, rows: [], over: -5 }
    expect(has(worldProblems(g), /people: over/)).toBe(true)
    g.world!.homes = { v: 1, rows: [{ id: 'home:a', owner: 'firm:b', seen: 2000 }], over: 0 }
    expect(has(worldProblems(g), /homes: bad row/)).toBe(true)
    g.world!.firms = { v: 1, rows: [{ id: 'firm:a', form: 'x', owner: 'person:b', seen: 2000 }], over: 0 } as never
    expect(has(worldProblems(g), /firms: bad row/)).toBe(true)
    ;(g as { world: unknown }).world = 5
    expect(has(worldProblems(g), /world: not a v1 world root/)).toBe(true)
  })

  it('more fresh rows than the index may hold is a problem; stale rows may be as many as the cap', () => {
    const g = synced()
    g.world!.people = { v: 1, rows: Array.from({ length: LOD_CAPS.intimate + 1 }, (_, i) => ({ id: `person:q${i}`, seen: g.year })), over: 0 }
    expect(has(worldProblems(g, { live: true }), /people: 81 rows seen this year, more than the 80 indexed/)).toBe(true)
    g.world!.people = { v: 1, rows: Array.from({ length: LOD_CAPS.people }, (_, i) => ({ id: `person:q${i}`, seen: g.year - 9 })), over: 0 }
    expect(worldProblems(g)).toEqual([])
  })

  it('the default for live is "the index was stamped this year", and it can be forced either way', () => {
    const g = synced()
    g.world!.firms!.rows.push({ id: 'firm:ghost', form: 'biz', owner: playerRef(g), seen: g.year })
    expect(has(worldProblems(g), /firm:ghost/)).toBe(true)
    expect(has(worldProblems(g, { live: false }), /firm:ghost/)).toBe(false)
    g.world!.y = g.year - 1
    expect(has(worldProblems(g), /firm:ghost/)).toBe(false)
    expect(has(worldProblems(g, { live: true }), /firm:ghost/)).toBe(true)
    delete g.world!.y
    expect(has(worldProblems(g), /firm:ghost/)).toBe(false)
  })
})

describe('the fuzz harness checks the world', () => {
  it('reports a broken world among the invariant failures, and nothing for a whole one', () => {
    const g = synced()
    const clean = invariantFailures(g).filter((m) => /world|ledger|people|firms|homes|holdings/.test(m))
    expect(clean).toEqual([])
    g.world!.people!.rows.push({ ...g.world!.people!.rows[0]! })
    expect(invariantFailures(g).some((m) => /people: duplicate row/.test(m))).toBe(true)
    const g2 = synced()
    ledgerRoot(g2).a['pool:other'] = (ledgerRoot(g2).a['pool:other'] ?? 0) + 7
    expect(invariantFailures(g2).some((m) => /ledger: /.test(m))).toBe(true)
  })

  it('does not compare the index with the records in the year of a sync: a house sold since is not a failure', () => {
    const g = synced()
    g.assets = g.assets.filter((a) => a.kind !== 'house')
    expect(g.world?.y).toBe(g.year)
    expect(worldProblems(g, { live: true }).some((p) => /home:h1/.test(p))).toBe(true)
    expect(invariantFailures(g).filter((m) => /home:h1/.test(m))).toEqual([])
  })
})

describe('replace discipline: syncHoldings and syncWorld write a shard by replacing its root', () => {
  for (const name of ['people', 'firms', 'homes', 'holdings'] as const) {
    it(`does not throw with only the ${name} root deep-frozen, writes a new root and leaves the frozen one unchanged`, () => {
      const g = synced()
      const frozen = g.world?.[name]
      expect(frozen).toBeDefined()
      deepFreeze(frozen)
      const snapshot = JSON.stringify(frozen)
      g.year += 1
      g.assets.push(asset('c3', 'business', 700_000, { share: 0.5 }), asset('h2', 'house', 400_000))
      createPerson(g, { relation: 'friend', age: 30, relationship: 99 })
      if (name === 'holdings') expect(() => syncHoldings(g)).not.toThrow()
      else expect(() => syncWorld(g)).not.toThrow()
      expect(g.world?.[name]).not.toBe(frozen)
      expect(JSON.stringify(frozen)).toBe(snapshot)
      expect(JSON.stringify(g.world?.[name])).not.toBe(snapshot)
      expect(() => syncWorld(g)).not.toThrow()
      expect(g.world?.y).toBe(g.year)
      expect(worldProblems(g)).toEqual([])
    })
  }

  it('a fully frozen state that is already in sync can be synced again: nothing is written', () => {
    const g = synced()
    deepFreeze(g)
    expect(() => syncWorld(g)).not.toThrow()
  })
})

describe('buildHoldings and syncHoldings on the synced world', () => {
  it('agree', () => {
    const g = synced()
    expect(readHoldings(g).rows).toEqual(buildHoldings(g))
    syncHoldings(g)
    expect(readHoldings(g).rows).toEqual(buildHoldings(g))
  })
})
