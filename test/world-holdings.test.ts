// ci: fast
// R2-L15 (A.K2 c): the holdings table. One table says who owns how much of each company and home the world indexes: rows
// [owner, asset, share], sorted by asset then owner, every asset summing to 1 (the part nobody is named for goes to OUTSIDE).
// It is built from the records as they are (raw details, no normalizeBiz, no clone) and only for the assets the firms and homes
// indexes name, so every held asset is in an index. It is written by replacing its root, only when it changed.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPerson } from '../src/game/people'
import type { Asset, GameState, Json, Person } from '../src/game/types'
import { HOLDING_ROWS_CAP } from '../src/game/world/caps'
import { firmRef, syncFirms } from '../src/game/world/firms'
import { buildHoldings, holdersOf, holdingsOf, normalizeHoldings, OUTSIDE, readHoldings, syncHoldings } from '../src/game/world/holdings'
import { homeRef, syncHomes } from '../src/game/world/homes'
import { personRef, playerRef } from '../src/game/world/people'
import '../src/game/world/shards'
import { shardNames, worldShard } from '../src/game/world/state'
import type { HoldingRow, HoldingsShard } from '../src/game/world/types'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'

const YEAR = 2026

function game(): GameState {
  return makeTestGame(7, { age: 40, money: 50_000 })
}

function asset(id: string, kind: Asset['kind'], value: number, details: Record<string, Json> = {}): Asset {
  return { id, kind, name: `${kind} ${id}`, emoji: 'x', purchasePrice: value, value, condition: 80, purchasedAge: 30, upkeep: 0, details }
}

/** The raw shape of an old NPC firm inside its owner: { id, name, kind, value, details }. */
function giveCompany(p: Person, id: string, value: number, details: Record<string, Json> = {}): void {
  p.data.npcCompany = { id, name: `Firm ${id}`, kind: 'business', value, details } as unknown as Json
}

function relative(g: GameState): Person {
  return createPerson(g, { relation: 'child', age: 30, relationship: 70 })
}

const sum = (rows: readonly HoldingRow[]): number => rows.reduce((s, r) => s + r[2], 0)
const forAsset = (rows: readonly HoldingRow[], id: string): HoldingRow[] => rows.filter((r) => r[1] === id)
const shares = (rows: readonly HoldingRow[], id: string): Record<string, number> => Object.fromEntries(forAsset(rows, id).map((r) => [r[0], r[2]]))

/** Every asset of a table sums to 1 within 1e-6 and no share is 0 or less. */
function expectWhole(rows: readonly HoldingRow[]): void {
  for (const id of new Set(rows.map((r) => r[1]))) expect(Math.abs(sum(forAsset(rows, id)) - 1), id).toBeLessThanOrEqual(1e-6)
  for (const r of rows) {
    expect(r[2], JSON.stringify(r)).toBeGreaterThan(0)
    expect(r[2], JSON.stringify(r)).toBeLessThanOrEqual(1)
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('one company', () => {
  it('a company with share 0.6 and one family holder at 0.1 gives rows 0.6, 0.1 and OUTSIDE 0.3', () => {
    const g = game()
    const kin = relative(g)
    g.assets.push(asset('c1', 'business', 1_000_000, { share: 0.6, familyShares: [{ id: kin.id, share: 0.1 }] }))
    const rows = buildHoldings(g)
    expect(rows).toHaveLength(3)
    expect(shares(rows, 'firm:c1')).toEqual({ [playerRef(g)]: 0.6, [personRef(kin)]: 0.1, [OUTSIDE]: 0.3 })
    expectWhole(rows)
  })

  it('a company with share 1 has one row, and OUTSIDE is the unnamed pool', () => {
    const g = game()
    g.assets.push(asset('c1', 'business', 1_000, { share: 1 }))
    expect(buildHoldings(g)).toEqual([[playerRef(g), 'firm:c1', 1]])
    expect(OUTSIDE).toBe('pool:outside')
  })

  it('a company with no details at all is wholly the player\'s', () => {
    const g = game()
    g.assets.push(asset('c1', 'business', 1_000))
    expect(buildHoldings(g)).toEqual([[playerRef(g), 'firm:c1', 1]])
  })

  it('family shares above the equity left are scaled down and the sum is still 1', () => {
    const g = game()
    const a = relative(g)
    const b = relative(g)
    g.assets.push(asset('c1', 'business', 1_000, { share: 0.5, familyShares: [{ id: a.id, share: 0.6 }, { id: b.id, share: 0.6 }] }))
    const rows = buildHoldings(g)
    const got = shares(rows, 'firm:c1')
    expect(got[playerRef(g)]).toBe(0.5)
    expect(got[personRef(a)]).toBe(0.25)
    expect(got[personRef(b)]).toBe(0.25)
    expect(got[OUTSIDE]).toBeUndefined()
    expectWhole(rows)
  })

  it('merges a holder named twice, and gives an unknown but well-formed id its own person ref', () => {
    const g = game()
    const a = relative(g)
    g.assets.push(asset('c1', 'business', 1_000, { share: 0.4, familyShares: [{ id: a.id, share: 0.1 }, { id: a.id, share: 0.2 }, { id: 'p-gone', share: 0.1 }] }))
    const got = shares(buildHoldings(g), 'firm:c1')
    expect(got[personRef(a)]).toBeCloseTo(0.3, 9)
    expect(got['person:p-gone']).toBe(0.1)
    expect(got[playerRef(g)]).toBe(0.4)
    expect(got[OUTSIDE]).toBeCloseTo(0.2, 9)
  })

  it('names a family holder by data.sid when the person has one', () => {
    const g = game()
    const a = relative(g)
    a.data.sid = 's-42'
    g.assets.push(asset('c1', 'business', 1_000, { share: 0.7, familyShares: [{ id: a.id, share: 0.2 }] }))
    const got = shares(buildHoldings(g), 'firm:c1')
    expect(personRef(a)).toBe('person:s-42')
    expect(got['person:s-42']).toBe(0.2)
    expect(got[`person:${a.id}`]).toBeUndefined()
  })

  it('a holder whose id is no name at all folds into OUTSIDE instead of a bad row', () => {
    const g = game()
    g.assets.push(asset('c1', 'business', 1_000, { share: 0.5, familyShares: [{ id: 'has space', share: 0.25 }] }))
    const rows = buildHoldings(g)
    expect(shares(rows, 'firm:c1')).toEqual({ [playerRef(g)]: 0.5, [OUTSIDE]: 0.5 })
    expectWhole(rows)
  })

  it('shares that do not divide evenly still sum to 1 (the last row takes the rounding)', () => {
    const g = game()
    const [a, b] = [relative(g), relative(g)]
    g.assets.push(asset('c1', 'business', 1_000, { share: 1 / 3, familyShares: [{ id: a.id, share: 1 / 3 }, { id: b.id, share: 1 / 3 }] }))
    const rows = buildHoldings(g)
    expect(rows).toHaveLength(3)
    expectWhole(rows)
    expect(Math.abs(sum(rows) - 1)).toBeLessThanOrEqual(1e-6)
    for (const r of rows) expect(Math.round(r[2] * 1e6) / 1e6).toBe(r[2])
  })

  it('garbage details fall back to the defaults, and no share is 0 or less', () => {
    const cases: Record<string, Json>[] = [
      { share: 'lots' },
      { share: Number.NaN as unknown as Json },
      { share: -0.5 },
      { share: Number.POSITIVE_INFINITY as unknown as Json },
      { share: null },
      { share: 7 },
      { share: 1, familyShares: 'x' },
      { share: 1, familyShares: [null, 5, 'x', [], { id: 7, share: 0.2 }, { id: 'p1', share: 'a' }, { id: 'p1', share: -1 }] },
      { share: 0.5, familyShares: [{ id: 'p1', share: Number.NaN as unknown as Json }, { id: '', share: 0.2 }] },
    ]
    for (const details of cases) {
      const g = game()
      g.assets.push(asset('c1', 'business', 1_000, details))
      const rows = buildHoldings(g)
      expectWhole(rows)
      expect(rows.length, JSON.stringify(details)).toBeGreaterThan(0)
    }
    const g = game()
    g.assets.push(asset('c1', 'business', 1_000, { share: 'lots' }), asset('c2', 'business', 900, { share: -0.5 }))
    expect(buildHoldings(g)).toEqual([[playerRef(g), 'firm:c1', 1], [playerRef(g), 'firm:c2', 1]])
  })

  it('details that are not an object at all read as no details', () => {
    const g = game()
    const a = asset('c1', 'business', 1_000)
    ;(a as unknown as { details: unknown }).details = 'oops'
    g.assets.push(a)
    expect(buildHoldings(g)).toEqual([[playerRef(g), 'firm:c1', 1]])
    ;(a as unknown as { details: unknown }).details = null
    expect(buildHoldings(g)).toEqual([[playerRef(g), 'firm:c1', 1]])
  })

  it('a share of 0 (a company that sits in a group) names no row for the player, and the rest is OUTSIDE', () => {
    const g = game()
    g.assets.push(asset('c1', 'business', 1_000, { share: 0 }))
    expect(buildHoldings(g)).toEqual([[OUTSIDE, 'firm:c1', 1]])
  })
})

describe('an old NPC firm', () => {
  it('owner 0.7 and the player\'s stake 0.2 give 0.7, 0.2 and OUTSIDE 0.1', () => {
    const g = game()
    const p = relative(g)
    giveCompany(p, 'n1', 500, { share: 0.7 })
    g.assets.push(asset('npc-stake:n1', 'investment', 100, { npcCompanyId: 'n1', npcPersonId: p.id, share: 0.2, type: 'npcEquity' }))
    const rows = buildHoldings(g)
    expect(shares(rows, 'firm:n1')).toEqual({ [personRef(p)]: 0.7, [playerRef(g)]: 0.2, [OUTSIDE]: 0.1 })
    expectWhole(rows)
  })

  it('a stake that would pass 1 is clamped so the total is 1', () => {
    const g = game()
    const p = relative(g)
    giveCompany(p, 'n1', 500, { share: 0.7 })
    g.assets.push(asset('npc-stake:n1', 'investment', 100, { npcCompanyId: 'n1', share: 0.6 }))
    const rows = buildHoldings(g)
    const got = shares(rows, 'firm:n1')
    expect(got[personRef(p)]).toBe(0.7)
    expect(got[playerRef(g)]).toBe(0.3)
    expect(got[OUTSIDE]).toBeUndefined()
    expectWhole(rows)
  })

  it('an owner with no share written holds all of it, and an investment that is not a stake in it is ignored', () => {
    const g = game()
    const p = relative(g)
    giveCompany(p, 'n1', 500)
    g.assets.push(asset('i1', 'investment', 100, { share: 0.4 }), asset('i2', 'investment', 100, { npcCompanyId: 'other', share: 0.4 }))
    expect(buildHoldings(g)).toEqual([[personRef(p), 'firm:n1', 1]])
  })

  it('reads the firm raw: no structuredClone, and the record is the same object afterwards', () => {
    const g = game()
    const p = relative(g)
    giveCompany(p, 'n1', 500, { share: 0.8 })
    const record = p.data.npcCompany
    const snapshot = JSON.stringify(record)
    const spy = vi.spyOn(globalThis, 'structuredClone')
    buildHoldings(g)
    syncHoldings(g)
    expect(spy).not.toHaveBeenCalled()
    expect(p.data.npcCompany).toBe(record)
    expect(JSON.stringify(record)).toBe(snapshot)
  })
})

describe('homes', () => {
  it('a house has one row of share 1, the player\'s', () => {
    const g = game()
    g.assets.push(asset('h1', 'house', 300_000), asset('h2', 'house', 200_000), asset('v1', 'car', 10_000))
    expect(buildHoldings(g)).toEqual([
      [playerRef(g), 'home:h1', 1],
      [playerRef(g), 'home:h2', 1],
    ])
    expect(homeRef('h1')).toBe('home:h1')
  })
})

describe('what the table holds', () => {
  it('is sorted by asset, then owner', () => {
    const g = game()
    const kin = relative(g)
    g.assets.push(
      asset('z9', 'house', 50),
      asset('b2', 'business', 20, { share: 0.5, familyShares: [{ id: kin.id, share: 0.25 }] }),
      asset('a1', 'business', 10, { share: 0.5 }),
    )
    const rows = buildHoldings(g)
    const sorted = [...rows].sort((x, y) => (x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0))
    expect(rows).toEqual(sorted)
    expect(rows.map((r) => r[1])).toEqual(['firm:a1', 'firm:a1', 'firm:b2', 'firm:b2', 'firm:b2', 'home:z9'])
  })

  it('does not depend on the order of g.assets or g.people', () => {
    const make = (): GameState => {
      const g = game()
      const [a, b] = [relative(g), relative(g)]
      giveCompany(a, 'n1', 700, { share: 0.6 })
      g.assets.push(
        asset('c1', 'business', 900, { share: 0.5, familyShares: [{ id: b.id, share: 0.2 }, { id: a.id, share: 0.1 }] }),
        asset('c2', 'business', 800, { share: 0.9 }),
        asset('c3', 'business', 800, { share: 0.9 }),
        asset('h1', 'house', 50),
        asset('h2', 'house', 60),
        asset('s1', 'investment', 1, { npcCompanyId: 'n1', share: 0.1 }),
        asset('s2', 'investment', 1, { npcCompanyId: 'n1', share: 0.2 }),
      )
      return g
    }
    const a = make()
    const b = make()
    b.assets.reverse()
    b.people.reverse()
    expect(buildHoldings(b)).toEqual(buildHoldings(a))
    b.assets = [b.assets[2]!, b.assets[0]!, b.assets[5]!, b.assets[1]!, b.assets[6]!, b.assets[3]!, b.assets[4]!]
    expect(buildHoldings(b)).toEqual(buildHoldings(a))
  })

  it('only names the assets the firms and homes indexes name: a tycoon with 30 companies holds 20', () => {
    const g = game()
    for (let i = 0; i < 30; i++) g.assets.push(asset(`c${String(i).padStart(2, '0')}`, 'business', 1_000 * (i + 1), { share: 0.8 }))
    const rows = buildHoldings(g)
    const assets = [...new Set(rows.map((r) => r[1]))]
    expect(assets).toHaveLength(20)
    expect(assets[0]).toBe('firm:c10')
    expect(assets[19]).toBe('firm:c29')
    expectWhole(rows)
  })

  it('40 firms with 8 holders each stay within 1,200 rows and every kept asset still sums to 1', () => {
    const g = game()
    const kin = Array.from({ length: 8 }, () => relative(g))
    for (let i = 0; i < 40; i++) {
      g.assets.push(asset(`c${String(i).padStart(2, '0')}`, 'business', 1_000 * (i + 1), { share: 0.3, familyShares: kin.map((k) => ({ id: k.id, share: 0.05 })) }))
    }
    const rows = buildHoldings(g)
    expect(rows.length).toBeLessThanOrEqual(HOLDING_ROWS_CAP)
    expect(rows.length).toBeGreaterThan(0)
    expectWhole(rows)
    expect(new Set(rows.map((r) => r[1])).size).toBe(20)
  })

  it('past the cap, whole assets are dropped from the lowest ranked end, never a part of one', () => {
    const g = game()
    const kin = Array.from({ length: 70 }, () => relative(g))
    for (let i = 0; i < 20; i++) {
      g.assets.push(asset(`c${String(i).padStart(2, '0')}`, 'business', 1_000 * (i + 1), { share: 0.3, familyShares: kin.map((k) => ({ id: k.id, share: 0.005 })) }))
    }
    const rows = buildHoldings(g)
    // 70 holders, the player and OUTSIDE: 72 rows an asset, 16 whole assets fit under 1,200.
    expect(rows).toHaveLength(16 * 72)
    expect(rows.length).toBeLessThanOrEqual(HOLDING_ROWS_CAP)
    const kept = [...new Set(rows.map((r) => r[1]))]
    expect(kept).toEqual(Array.from({ length: 16 }, (_, i) => `firm:c${String(i + 4).padStart(2, '0')}`))
    expectWhole(rows)
  })

  it('works on a deep-frozen state, and changes nothing', () => {
    const g = game()
    const kin = relative(g)
    g.assets.push(asset('c1', 'business', 1_000, { share: 0.6, familyShares: [{ id: kin.id, share: 0.1 }] }), asset('h1', 'house', 5))
    syncFirms(g)
    syncHomes(g)
    syncHoldings(g)
    const snapshot = JSON.stringify(g)
    deepFreeze(g)
    expect(() => buildHoldings(g)).not.toThrow()
    expect(readHoldings(g).rows).toHaveLength(4)
    expect(() => holdersOf(g, 'firm:c1')).not.toThrow()
    expect(() => holdingsOf(g, playerRef(g))).not.toThrow()
    expect(JSON.stringify(g)).toBe(snapshot)
  })

  it('has no holdings for a game with no company or home', () => {
    const g = game()
    g.assets.push(asset('v1', 'car', 10))
    expect(buildHoldings(g)).toEqual([])
    syncHoldings(g)
    expect(readHoldings(g)).toEqual({ v: 1, y: 0, rows: [] })
    expect('world' in g).toBe(false)
  })
})

describe('the holdings shard', () => {
  function rich(): GameState {
    const g = game()
    const kin = relative(g)
    const owner = relative(g)
    giveCompany(owner, 'n1', 400, { share: 0.7 })
    g.assets.push(
      asset('c1', 'business', 1_000_000, { share: 0.6, familyShares: [{ id: kin.id, share: 0.1 }] }),
      asset('c2', 'business', 500_000, { share: 1 }),
      asset('h1', 'house', 300_000),
      asset('npc-stake:n1', 'investment', 100, { npcCompanyId: 'n1', share: 0.2 }),
    )
    return g
  }

  it('is registered in the hub, and the world keeps it', () => {
    expect(shardNames()).toContain('holdings')
    const g = rich()
    syncHoldings(g)
    expect(g.world?.holdings).toBeDefined()
  })

  it('syncHoldings writes the table, stamped with this year, and it matches buildHoldings', () => {
    const g = rich()
    syncHoldings(g)
    const shard = readHoldings(g)
    expect(shard.v).toBe(1)
    expect(shard.y).toBe(YEAR)
    expect(shard.rows).toEqual(buildHoldings(g))
    expectWhole(shard.rows)
  })

  it('is idempotent in a year: the same root, the same bytes', () => {
    const g = rich()
    syncHoldings(g)
    const root = g.world?.holdings
    const bytes = JSON.stringify(g.world)
    syncHoldings(g)
    expect(g.world?.holdings).toBe(root)
    expect(JSON.stringify(g.world)).toBe(bytes)
  })

  it('a new year, or a change in a share, writes a new root and leaves the frozen old one alone', () => {
    const g = rich()
    syncHoldings(g)
    const frozen = g.world?.holdings
    deepFreeze(frozen)
    const snapshot = JSON.stringify(frozen)
    g.assets.find((a) => a.id === 'c2')!.details.share = 0.5
    expect(() => syncHoldings(g)).not.toThrow()
    expect(g.world?.holdings).not.toBe(frozen)
    expect(JSON.stringify(frozen)).toBe(snapshot)
    expect(shares(readHoldings(g).rows, 'firm:c2')).toEqual({ [playerRef(g)]: 0.5, [OUTSIDE]: 0.5 })
    const second = g.world?.holdings
    g.year += 1
    syncHoldings(g)
    expect(g.world?.holdings).not.toBe(second)
    expect(readHoldings(g).y).toBe(YEAR + 1)
  })

  it('keeps the rows of nothing that is gone: the table is rebuilt whole each sync', () => {
    const g = rich()
    syncHoldings(g)
    g.assets = g.assets.filter((a) => a.id !== 'c2')
    syncHoldings(g)
    expect(readHoldings(g).rows.some((r) => r[1] === 'firm:c2')).toBe(false)
  })

  it('holdersOf and holdingsOf agree with the rows', () => {
    const g = rich()
    syncHoldings(g)
    const rows = readHoldings(g).rows
    for (const id of new Set(rows.map((r) => r[1]))) {
      const holders = holdersOf(g, id as HoldingRow[1])
      expect(holders.map((h) => [h.owner, h.share]), id).toEqual(forAsset(rows, id).map((r) => [r[0], r[2]]))
      expect(holders.reduce((s, h) => s + h.share, 0)).toBeCloseTo(1, 6)
    }
    for (const owner of new Set(rows.map((r) => r[0]))) {
      const held = holdingsOf(g, owner as HoldingRow[0])
      expect(held.map((h) => [h.asset, h.share]), owner).toEqual(rows.filter((r) => r[0] === owner).map((r) => [r[1], r[2]]))
    }
    expect(holdingsOf(g, playerRef(g)).map((h) => h.asset)).toEqual(['firm:c1', 'firm:c2', 'firm:n1', 'home:h1'])
    expect(holdersOf(g, 'firm:nope')).toEqual([])
    expect(holdingsOf(g, 'person:nobody')).toEqual([])
    expect(holdingsOf(g, OUTSIDE).map((h) => h.asset)).toEqual(['firm:c1', 'firm:n1'])
  })

  it('names an asset with firmRef and homeRef', () => {
    const g = rich()
    syncHoldings(g)
    const assets = new Set(readHoldings(g).rows.map((r) => r[1]))
    expect(assets).toEqual(new Set([firmRef('c1'), firmRef('c2'), firmRef('n1'), homeRef('h1')]))
  })
})

describe('hostile holdings shards are always valid and bounded', () => {
  const me = 'person:me'
  const row = (owner: unknown, asset: unknown, share: unknown): unknown => [owner, asset, share]
  const read = (raw: unknown): HoldingsShard => {
    const g = game()
    g.world = { v: 1, holdings: raw } as GameState['world']
    return readHoldings(g) as HoldingsShard
  }
  const GARBAGE: unknown[] = [null, 5, 'x', true, [], [1, 2], { v: 2 }, { v: '1' }, { rows: [] }, { v: 1, rows: 'no' }, { v: 1, rows: { a: 1 } }]

  it('reads garbage as the empty table', () => {
    for (const bad of GARBAGE) expect(read(bad), JSON.stringify(bad)).toEqual({ v: 1, y: 0, rows: [] })
  })

  it('keeps only valid rows: a person or OUTSIDE for owner, a firm or home for asset, a share in (0, 1]', () => {
    const shard = read({
      v: 1,
      y: 2025,
      rows: [
        row(me, 'firm:b', 0.5),
        row(OUTSIDE, 'firm:b', 0.5),
        row(me, 'firm:a', 1),
        row(me, 'home:h', 1),
        row(me, 'person:x', 1),
        row('firm:x', 'firm:c', 1),
        row('nobody', 'firm:c', 1),
        row(me, 'firm:c', 0),
        row(me, 'firm:c', -1),
        row(me, 'firm:c', 1.5),
        row(me, 'firm:c', Number.NaN),
        row(me, 'firm:c', 'x'),
        [me, 'firm:c'],
        row(me, 7, 1),
        row(7, 'firm:c', 1),
        [me, 'firm:d', 1, 'extra'],
        { owner: me },
        null,
        5,
        'x',
        [],
      ],
    })
    expect(shard.rows).toEqual([
      [me, 'firm:a', 1],
      [me, 'firm:b', 0.5],
      [OUTSIDE, 'firm:b', 0.5],
      [me, 'home:h', 1],
    ])
    expect(shard.y).toBe(2025)
  })

  it('drops a pair named twice (the first stays) and rounds a share to 6 places', () => {
    const shard = read({ v: 1, y: 2025, rows: [row(me, 'firm:a', 0.25), row(me, 'firm:a', 0.5), row('person:b', 'firm:a', 0.123456789)] })
    expect(shard.rows).toEqual([
      ['person:b', 'firm:a', 0.123457],
      [me, 'firm:a', 0.25],
    ])
  })

  it('reads y as 0 or a year from 1900 to 100000, else 0, and keeps the rows', () => {
    for (const y of [undefined, 'x', 1899, 100_001, 2025.5, Number.NaN, null, -3]) expect(read({ v: 1, y, rows: [row(me, 'firm:a', 1)] }), String(y)).toEqual({ v: 1, y: 0, rows: [[me, 'firm:a', 1]] })
    expect(read({ v: 1, y: 1900, rows: [] }).y).toBe(1900)
    expect(read({ v: 1, y: 100_000, rows: [] }).y).toBe(100_000)
    expect(read({ v: 1, y: 0, rows: [] }).y).toBe(0)
  })

  it('cuts 5,000 rows to the cap, whole assets only, deterministically', () => {
    const rows = Array.from({ length: 3 * HOLDING_ROWS_CAP }, (_, i) => row(`person:o${String(i % 9)}`, `firm:f${String(Math.floor(i / 9)).padStart(3, '0')}`, 1 / 9))
    const shard = read({ v: 1, y: 2025, rows })
    expect(shard.rows.length).toBeLessThanOrEqual(HOLDING_ROWS_CAP)
    expect(shard.rows.length % 9).toBe(0)
    expect(shard.rows.length).toBe(HOLDING_ROWS_CAP - (HOLDING_ROWS_CAP % 9))
    expect(read({ v: 1, y: 2025, rows })).toEqual(shard)
    const huge = read({ v: 1, y: 2025, rows: Array.from({ length: 50_000 }, (_, i) => row(`person:o${i}`, 'firm:one', 0.00002)) })
    expect(huge.rows.length).toBeLessThanOrEqual(HOLDING_ROWS_CAP)
  })

  it('hands a valid table back as itself, and its own output as itself', () => {
    const ok = { v: 1, y: 2025, rows: [[me, 'firm:a', 0.4], [OUTSIDE, 'firm:a', 0.6]] }
    expect(normalizeHoldings(ok)).toBe(ok)
    const messy = normalizeHoldings({ v: 1, y: 2025, rows: [row(OUTSIDE, 'firm:a', 0.6), row(me, 'firm:a', 0.4)] })
    expect(normalizeHoldings(messy)).toBe(messy)
  })

  it('does not make a table whole: a table that sums to 0.9 is read as it is, for the invariants to report', () => {
    const shard = read({ v: 1, y: 2025, rows: [row(me, 'firm:a', 0.5), row(OUTSIDE, 'firm:a', 0.4)] })
    expect(shard.rows).toHaveLength(2)
  })

  it('never throws, whatever the input', () => {
    const throwing = Object.defineProperty({ v: 1, y: 2025 }, 'rows', {
      enumerable: true,
      get() {
        throw new Error('a getter that throws')
      },
    })
    const cyclic: Record<string, unknown> = { v: 1, y: 2025, rows: [] }
    cyclic.rows = [cyclic, [cyclic, cyclic, 1]]
    for (const raw of [throwing, cyclic, Object.create(null), new Map(), new Date(0), () => 1, Symbol('s')]) {
      expect(() => normalizeHoldings(raw)).not.toThrow()
    }
    expect(normalizeHoldings(throwing)).toEqual({ v: 1, y: 0, rows: [] })
  })

  it('is read through the registry the same way', () => {
    const g = game()
    g.world = { v: 1, holdings: { v: 1, y: 2025, rows: [row(me, 'firm:a', 1), row(me, 'bad', 1)] } } as GameState['world']
    expect(worldShard<HoldingsShard>(g, 'holdings')).toEqual({ v: 1, y: 2025, rows: [[me, 'firm:a', 1]] })
  })
})
