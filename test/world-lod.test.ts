// ci: fast
// R2-L16 (K.6 a): the level-of-detail framework. The world keeps three levels of an entity: named (a row in an index shard,
// capped), pooled (only counted, and its money lives in a pool account of the ledger) and seeded (a stranger who is a pure
// function of the life and an id, and exists nowhere until something touches it). promote takes an entity into the index,
// demote lets it go and folds its cash back through the ledger, lodSweep does the yearly clean-up. The final rows depend only on
// the set of names, never on the order they came in, and every shard is written by replacing its root.
import { describe, expect, it } from 'vitest'
import { createPerson } from '../src/game/people'
import { acctBalance, book, checkLedger, flowsOf, peekLedger } from '../src/game/kernel/ledger'
import { counterparty } from '../src/game/kernel/reasons'
import { SPREADS } from '../src/game/kernel/spreads'
import type { EntityRef } from '../src/game/kernel/ids'
import type { Asset, GameState, Json, Person } from '../src/game/types'
import * as capsModule from '../src/game/world/caps'
import { OUTSIDE } from '../src/game/world/holdings'
import {
  DEMOTE_AFTER_YEARS,
  LOD_CAPS,
  demote,
  demotionProceeds,
  lodShard,
  lodSweep,
  normalizeLod,
  promote,
  promotionPrice,
  relevance,
  seededEntity,
  type LodKind,
} from '../src/game/world/lod'
import { firmRef } from '../src/game/world/firms'
import { homeRef } from '../src/game/world/homes'
import { personRef, playerRef } from '../src/game/world/people'
import '../src/game/world/shards'
import { ensureWorld, normalizeWorld, shardNames, worldShard } from '../src/game/world/state'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'

const YEAR = 2026

function game(): GameState {
  return makeTestGame(7, { age: 40, money: 50_000 })
}

/** A small seeded PRNG for the shuffles (not g.rng). */
function mulberry(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffled<T>(xs: readonly T[], rand: () => number): T[] {
  const out = [...xs]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

const pad = (i: number): string => String(i).padStart(3, '0')
const pid = (i: number): EntityRef => `person:z${pad(i)}` as EntityRef
const hid = (i: number): EntityRef => `home:h${pad(i)}` as EntityRef
const fid = (i: number): EntityRef => `firm:f${pad(i)}` as EntityRef

type Shard = 'people' | 'firms' | 'homes'

interface Row {
  id: string
  seen: number
  owner?: string
  form?: string
}

function rowsOf(g: GameState, name: Shard): Row[] {
  const s = g.world?.[name] as { rows?: Row[] } | undefined
  return s?.rows ?? []
}
const idsOf = (g: GameState, name: Shard): string[] => rowsOf(g, name).map((r) => r.id)

/** Puts raw rows into a shard, the way a save would hold them. */
function setShard(g: GameState, name: Shard, rows: Row[], over = 0): void {
  ensureWorld(g)[name] = { v: 1, rows, over } as never
}

function personRows(ids: readonly string[], seen: number): Row[] {
  return [...ids].sort().map((id) => ({ id, seen }))
}

function asset(id: string, kind: Asset['kind'], value: number, details: Record<string, Json> = {}): Asset {
  return { id, kind, name: `${kind} ${id}`, emoji: 'x', purchasePrice: value, value, condition: 80, purchasedAge: 30, upkeep: 0, details }
}

function giveCompany(p: Person, id: string): void {
  p.data.npcCompany = { id, name: `Firm ${id}`, kind: 'business', value: 5_000, details: { cash: 1_000 } } as unknown as Json
}

/** The sum of every account of the ledger. */
const booked = (g: GameState): number => Object.values(peekLedger(g).a).reduce((s, v) => s + v, 0)

const hh = (g: GameState): string => counterparty('hh', g.character.countryId)

describe('the caps and the idle limit', () => {
  it('are the spec: 400 people (80 intimate), 60 firms (20 full), 150 homes, 600 job slots, 5 idle years', () => {
    expect(LOD_CAPS).toEqual({ people: 400, intimate: 80, firms: 60, fullFirms: 20, homes: 150, jobs: 600 })
    expect(DEMOTE_AFTER_YEARS).toBe(5)
  })

  it('are the same objects whether they come from lod.ts or caps.ts', () => {
    expect(LOD_CAPS).toBe(capsModule.LOD_CAPS)
    expect(DEMOTE_AFTER_YEARS).toBe(capsModule.DEMOTE_AFTER_YEARS)
  })
})

describe('promote', () => {
  it('names a person: one row stamped with this year, in the people shard', () => {
    const g = game()
    expect(promote(g, 'person', pid(1))).toBe(true)
    expect(rowsOf(g, 'people')).toEqual([{ id: pid(1), seen: YEAR }])
  })

  it('is idempotent: a second promote in the same year writes nothing, a later year only touches seen', () => {
    const g = game()
    promote(g, 'person', pid(1))
    const root = g.world!.people
    const json = JSON.stringify(g.world)
    expect(promote(g, 'person', pid(1))).toBe(true)
    expect(g.world!.people).toBe(root)
    expect(JSON.stringify(g.world)).toBe(json)
    g.year = YEAR + 1
    expect(promote(g, 'person', pid(1))).toBe(true)
    expect(rowsOf(g, 'people')).toEqual([{ id: pid(1), seen: YEAR + 1 }])
  })

  it('refuses a name that is not a ref of that kind, and changes nothing', () => {
    const g = game()
    const json = JSON.stringify(g)
    for (const bad of ['x', '', 'firm:f1', 'home:h1', 'person:', 'person:has space', 5, null, undefined]) {
      expect(promote(g, 'person', bad as never), String(bad)).toBe(false)
    }
    expect(promote(g, 'firm', pid(1))).toBe(false)
    expect(promote(g, 'home', fid(1))).toBe(false)
    expect(promote(g, 'person', 'person:' + 'x'.repeat(60) as EntityRef)).toBe(false)
    expect(JSON.stringify(g)).toBe(json)
  })

  it('takes a company from the record it names: an own company is a biz owned by the player, an old NPC firm is an npc owned by its founder', () => {
    const g = game()
    g.assets.push(asset('a1', 'business', 900_000))
    const owner = createPerson(g, { relation: 'friend', age: 40, relationship: 40 })
    giveCompany(owner, 'npc1')
    expect(promote(g, 'firm', firmRef('a1'))).toBe(true)
    expect(promote(g, 'firm', firmRef('npc1'))).toBe(true)
    expect(rowsOf(g, 'firms')).toEqual([
      { id: 'firm:a1', form: 'biz', owner: playerRef(g), seen: YEAR },
      { id: 'firm:npc1', form: 'npc', owner: personRef(owner), seen: YEAR },
    ])
  })

  it('gives a company that has no record the owner and form it is told, else the player and npc', () => {
    const g = game()
    promote(g, 'firm', fid(1))
    promote(g, 'firm', fid(2), { owner: pid(9), form: 'biz' })
    const rows = rowsOf(g, 'firms')
    expect(rows.find((r) => r.id === fid(1))).toMatchObject({ form: 'npc', owner: playerRef(g) })
    expect(rows.find((r) => r.id === fid(2))).toMatchObject({ form: 'biz', owner: pid(9) })
  })

  it('refuses an owner that is not a person, and changes nothing', () => {
    const g = game()
    const json = JSON.stringify(g)
    expect(promote(g, 'firm', fid(1), { owner: 'pool:other' })).toBe(false)
    expect(promote(g, 'home', hid(1), { owner: 'firm:f1' })).toBe(false)
    expect(JSON.stringify(g)).toBe(json)
  })

  it('names a home by its asset, owned by the player', () => {
    const g = game()
    g.assets.push(asset('h1', 'house', 300_000))
    expect(promote(g, 'home', homeRef('h1'))).toBe(true)
    expect(rowsOf(g, 'homes')).toEqual([{ id: 'home:h1', owner: playerRef(g), seen: YEAR }])
  })

  it('moves no cash: a promoted entity has no account, and the books are not touched', () => {
    const g = game()
    promote(g, 'person', pid(1))
    promote(g, 'firm', fid(1))
    promote(g, 'home', hid(1))
    expect(g.world!.ledger).toBeUndefined()
    expect(g.character.money).toBe(50_000)
  })

  it('evicts the lowest ranked unprotected row when the shard is full: the stale one goes, the fresh one comes in', () => {
    const g = game()
    const cap = LOD_CAPS.intimate
    setShard(g, 'people', personRows(Array.from({ length: cap }, (_, i) => pid(i).toString()), YEAR - 2))
    // pid(0) is the stalest by id order only; give it the oldest seen so it is the one that goes.
    rowsOf(g, 'people')[0]!.seen = YEAR - 4
    expect(promote(g, 'person', pid(500))).toBe(true)
    const ids = idsOf(g, 'people')
    expect(ids).toHaveLength(cap)
    expect(ids).toContain(pid(500))
    expect(ids).not.toContain(pid(0))
    expect(lodShard(g).demoted).toBe(1)
  })

  it('turns a name away when it ranks below everything in a full shard, and counts it as let go', () => {
    const g = game()
    const cap = LOD_CAPS.intimate
    const ids = Array.from({ length: cap }, (_, i) => pid(i).toString())
    setShard(g, 'people', personRows(ids, YEAR))
    // Same year, later id: the new name ranks below every row.
    expect(promote(g, 'person', pid(900))).toBe(false)
    expect(idsOf(g, 'people')).toEqual([...ids].sort())
    expect(lodShard(g).demoted).toBe(1)
  })

  it('returns false when the shard is full of protected rows, and changes nothing at all', () => {
    const g = game()
    const friends = Array.from({ length: LOD_CAPS.intimate }, () => createPerson(g, { relation: 'friend', age: 30, relationship: 50 }))
    setShard(g, 'people', personRows(friends.map((p) => personRef(p)), YEAR))
    const json = JSON.stringify(g.world)
    expect(promote(g, 'person', pid(1))).toBe(false)
    // A protected candidate (a person of the game with no row yet) finds no room either.
    const late = createPerson(g, { relation: 'friend', age: 30, relationship: 50 })
    expect(promote(g, 'person', personRef(late))).toBe(false)
    expect(JSON.stringify(g.world)).toBe(json)
  })
})

describe('demote', () => {
  it('removes the row and counts it, and a second demote does nothing', () => {
    const g = game()
    promote(g, 'person', pid(1))
    promote(g, 'person', pid(2))
    expect(demote(g, 'person', pid(1), 'idle')).toBe(0)
    expect(idsOf(g, 'people')).toEqual([pid(2)])
    expect(lodShard(g).demoted).toBe(1)
    const json = JSON.stringify(g.world)
    expect(demote(g, 'person', pid(1), 'idle')).toBe(0)
    expect(JSON.stringify(g.world)).toBe(json)
  })

  it('does nothing for a name that is not a ref of that kind', () => {
    const g = game()
    promote(g, 'person', pid(1))
    const json = JSON.stringify(g.world)
    expect(demote(g, 'person', 'x' as never, 'idle')).toBe(0)
    expect(demote(g, 'person', fid(1), 'idle')).toBe(0)
    expect(JSON.stringify(g.world)).toBe(json)
  })

  it('is allowed on a protected row when asked directly: protection is for the sweep and the cap', () => {
    const g = game()
    const p = createPerson(g, { relation: 'friend', age: 30 })
    promote(g, 'person', personRef(p))
    demote(g, 'person', personRef(p), 'idle')
    expect(idsOf(g, 'people')).toEqual([])
  })
})

describe('folding cash back through the ledger', () => {
  it('folds a positive balance into the household pool, deletes the account, and the books balance', () => {
    const g = game()
    const x = pid(1)
    promote(g, 'person', x)
    book(g, 'gift', 'pool:family', x, 1_234)
    const before = acctBalance(g, hh(g) as never)
    const sum = booked(g)
    expect(demote(g, 'person', x, 'idle')).toBe(1_234)
    expect(peekLedger(g).a[x]).toBeUndefined()
    expect(acctBalance(g, hh(g) as never) - before).toBe(1_234)
    expect(booked(g)).toBe(sum)
    expect(checkLedger(g).ok).toBe(true)
  })

  it('books no flow: a fold is a relabel, not money moving', () => {
    const g = game()
    promote(g, 'person', pid(1))
    book(g, 'gift', 'pool:family', pid(1), 500)
    const flows = JSON.stringify(flowsOf(g))
    const k = peekLedger(g).k
    demote(g, 'person', pid(1), 'idle')
    expect(JSON.stringify(flowsOf(g))).toBe(flows)
    expect(peekLedger(g).k).toBe(k)
  })

  it('folds a negative balance too, so the sum does not change', () => {
    const g = game()
    const x = pid(2)
    promote(g, 'person', x)
    book(g, 'gift', x, 'pool:family', 500)
    expect(acctBalance(g, x)).toBe(-500)
    const before = acctBalance(g, hh(g) as never)
    const sum = booked(g)
    expect(demote(g, 'person', x, 'cap')).toBe(-500)
    expect(peekLedger(g).a[x]).toBeUndefined()
    expect(acctBalance(g, hh(g) as never) - before).toBe(-500)
    expect(booked(g)).toBe(sum)
    expect(checkLedger(g).ok).toBe(true)
  })

  it('uses the player\'s country for the household pool', () => {
    const g = game()
    g.character.countryId = 'gb'
    promote(g, 'person', pid(1))
    book(g, 'gift', 'pool:family', pid(1), 700)
    demote(g, 'person', pid(1), 'idle')
    expect(acctBalance(g, 'pool:hh:gb')).toBe(700)
  })

  it('folds a firm into pool:firms and a home into pool:landlords', () => {
    const g = game()
    promote(g, 'firm', fid(1))
    promote(g, 'home', hid(1))
    book(g, 'sales', 'pool:hh:us', fid(1), 900)
    book(g, 'rent', 'pool:hh:us', hid(1), 300)
    const firms = acctBalance(g, 'pool:firms')
    const landlords = acctBalance(g, 'pool:landlords')
    expect(demote(g, 'firm', fid(1), 'idle')).toBe(900)
    expect(demote(g, 'home', hid(1), 'cap')).toBe(300)
    expect(acctBalance(g, 'pool:firms') - firms).toBe(900)
    expect(acctBalance(g, 'pool:landlords') - landlords).toBe(300)
    expect(checkLedger(g).ok).toBe(true)
  })

  it('folds the account of a name that has no row too: the cash goes home, nothing is left behind', () => {
    const g = game()
    book(g, 'gift', 'pool:family', pid(7), 80)
    expect(demote(g, 'person', pid(7), 'idle')).toBe(80)
    expect(peekLedger(g).a[pid(7)]).toBeUndefined()
    expect(lodShard(g).demoted).toBe(0)
  })

  it('does not make a ledger for an entity that has no account', () => {
    const g = game()
    promote(g, 'person', pid(1))
    demote(g, 'person', pid(1), 'idle')
    expect(g.world!.ledger).toBeUndefined()
  })
})

describe('emigration', () => {
  it('burns a positive balance: a burn:emigration row, the sum falls by exactly that, the books balance', () => {
    const g = game()
    const x = pid(1)
    promote(g, 'person', x)
    book(g, 'gift', 'pool:family', x, 1_234)
    const sum = booked(g)
    expect(demote(g, 'person', x, 'emigrated')).toBe(1_234)
    expect(peekLedger(g).a[x]).toBeUndefined()
    expect(booked(g)).toBe(sum - 1_234)
    expect(peekLedger(g).b.emigration).toBe(1_234)
    expect(peekLedger(g).l.some((r) => r[1] === 'burn' && r[2] === 'emigration' && r[3] === 1_234)).toBe(true)
    expect(flowsOf(g).some((r) => r.reason === 'emigration' && r.net.burn === 1_234 && r.net.person === -1_234)).toBe(true)
    expect(checkLedger(g).ok).toBe(true)
    expect(idsOf(g, 'people')).toEqual([])
    expect(lodShard(g).demoted).toBe(1)
  })

  it('folds a negative balance instead of burning it', () => {
    const g = game()
    const x = pid(1)
    promote(g, 'person', x)
    book(g, 'gift', x, 'pool:family', 400)
    const sum = booked(g)
    expect(demote(g, 'person', x, 'emigrated')).toBe(-400)
    expect(peekLedger(g).b.emigration).toBeUndefined()
    expect(booked(g)).toBe(sum)
    expect(acctBalance(g, hh(g) as never)).toBe(-400)
    expect(checkLedger(g).ok).toBe(true)
  })

  it('burns what the yearly cap allows and folds the rest, so no account is left behind', () => {
    const g = game()
    const x = pid(1)
    promote(g, 'person', x)
    book(g, 'gift', 'pool:family', x, 2_000_000_000_000)
    expect(demote(g, 'person', x, 'emigrated')).toBe(2_000_000_000_000)
    expect(peekLedger(g).b.emigration).toBe(1_000_000_000_000)
    expect(peekLedger(g).a[x]).toBeUndefined()
    expect(acctBalance(g, hh(g) as never)).toBe(1_000_000_000_000)
    expect(peekLedger(g).l.some((r) => r[1] === 'cap' && r[2] === 'emigration')).toBe(true)
    expect(checkLedger(g).ok).toBe(true)
  })

  it('is for people only: a firm or a home that "emigrates" is refused and keeps its row', () => {
    const g = game()
    promote(g, 'firm', fid(1))
    promote(g, 'home', hid(1))
    book(g, 'sales', 'pool:hh:us', fid(1), 100)
    const json = JSON.stringify(g.world)
    expect(demote(g, 'firm', fid(1), 'emigrated')).toBe(0)
    expect(demote(g, 'home', hid(1), 'emigrated')).toBe(0)
    expect(JSON.stringify(g.world)).toBe(json)
  })
})

describe('lodSweep', () => {
  it('demotes an unprotected row after five idle years and not after four', () => {
    const g = game()
    // seen 2020 has 2021..2025 untouched (five years) when 2026 comes; seen 2021 has four.
    setShard(g, 'people', [{ id: pid(1), seen: 2020 }, { id: pid(2), seen: 2021 }])
    g.year = 2025
    expect(lodSweep(g)).toBe(0)
    expect(idsOf(g, 'people')).toEqual([pid(1), pid(2)])
    g.year = 2026
    expect(lodSweep(g)).toBe(1)
    expect(idsOf(g, 'people')).toEqual([pid(2)])
    expect(lodShard(g).demoted).toBe(1)
  })

  it('never reads a year after g.year: a row stamped in the future is not idle', () => {
    const g = game()
    setShard(g, 'people', [{ id: pid(1), seen: 2099 }])
    expect(lodSweep(g)).toBe(0)
    expect(idsOf(g, 'people')).toEqual([pid(1)])
  })

  it('keeps a person of the game, an owner of an old NPC firm and a holder however long they have been idle', () => {
    const g = game()
    const friend = createPerson(g, { relation: 'friend', age: 30 })
    const founder = createPerson(g, { relation: 'friend', age: 50 })
    giveCompany(founder, 'npc1')
    const holder = pid(40)
    const stranger = pid(41)
    ensureWorld(g).holdings = { v: 1, y: YEAR, rows: [[holder, fid(1), 0.5], [OUTSIDE, fid(1), 0.5]] } as never
    setShard(g, 'people', [friend, founder].map((p) => ({ id: personRef(p), seen: 2000 })).concat([{ id: holder, seen: 2000 }, { id: stranger, seen: 2000 }]).sort((a, b) => (a.id < b.id ? -1 : 1)))
    expect(lodSweep(g)).toBe(1)
    expect(idsOf(g, 'people')).not.toContain(stranger)
    for (const id of [personRef(friend), personRef(founder), holder]) expect(idsOf(g, 'people')).toContain(id)
  })

  it('keeps a company or a home whose record still exists, and lets the others go', () => {
    const g = game()
    g.assets.push(asset('a1', 'business', 100_000), asset('h1', 'house', 200_000))
    setShard(g, 'firms', [
      { id: 'firm:a1', form: 'biz', owner: playerRef(g), seen: 2000 },
      { id: 'firm:gone', form: 'biz', owner: playerRef(g), seen: 2000 },
    ])
    setShard(g, 'homes', [
      { id: 'home:gone', owner: playerRef(g), seen: 2000 },
      { id: 'home:h1', owner: playerRef(g), seen: 2000 },
    ])
    expect(lodSweep(g)).toBe(2)
    expect(idsOf(g, 'firms')).toEqual(['firm:a1'])
    expect(idsOf(g, 'homes')).toEqual(['home:h1'])
  })

  it('cuts a hostile 500-row people shard to 80, the same 80 every time, never touching a person of the game', () => {
    const make = (): GameState => {
      const g = game()
      const rows: Row[] = Array.from({ length: 500 }, (_, i) => ({ id: pid(i), seen: YEAR - (i % 6) }))
      ensureWorld(g).people = { v: 1, rows, over: 3 } as never
      return g
    }
    const a = make()
    const b = make()
    expect(lodSweep(a)).toBeGreaterThan(0)
    expect(lodSweep(b)).toBeGreaterThan(0)
    expect(rowsOf(a, 'people')).toHaveLength(LOD_CAPS.intimate)
    expect(JSON.stringify(a.world)).toBe(JSON.stringify(b.world))
    // The 80 are the best ranked: the freshest, then by id.
    const all: Row[] = Array.from({ length: 500 }, (_, i) => ({ id: pid(i), seen: YEAR - (i % 6) }))
    const want = all
      .sort((x, y) => y.seen - x.seen || (x.id < y.id ? -1 : 1))
      .slice(0, LOD_CAPS.intimate)
      .map((r) => r.id)
      .sort()
    expect(idsOf(a, 'people')).toEqual(want)
  })

  it('cuts the people shard to 80 without touching the protected ones, which outrank the fresher strangers', () => {
    const g = game()
    const friends = Array.from({ length: 3 }, () => createPerson(g, { relation: 'friend', age: 30 }))
    const strangers = Array.from({ length: 100 }, (_, i) => ({ id: pid(i), seen: YEAR - (i % 4) }))
    setShard(g, 'people', [...friends.map((p) => ({ id: personRef(p), seen: YEAR - 5 })), ...strangers].sort((a, b) => (a.id < b.id ? -1 : 1)))
    lodSweep(g)
    const ids = idsOf(g, 'people')
    expect(ids).toHaveLength(LOD_CAPS.intimate)
    for (const f of friends) expect(ids).toContain(personRef(f))
    const best = [...strangers].sort((x, y) => y.seen - x.seen || (x.id < y.id ? -1 : 1)).slice(0, LOD_CAPS.intimate - 3).map((r) => r.id)
    for (const s of best) expect(ids).toContain(s)
  })

  it('keeps every protected row even past the cap: an obligation outranks the cap', () => {
    const g = game()
    const friends = Array.from({ length: LOD_CAPS.intimate + 5 }, () => createPerson(g, { relation: 'friend', age: 30 }))
    setShard(g, 'people', personRows(friends.map((p) => personRef(p)), YEAR - 1).concat([{ id: pid(1), seen: YEAR }]).sort((a, b) => (a.id < b.id ? -1 : 1)))
    lodSweep(g)
    expect(rowsOf(g, 'people')).toHaveLength(LOD_CAPS.intimate + 5)
    expect(idsOf(g, 'people')).not.toContain(pid(1))
  })

  it('cuts the firms to 60 and the homes to 150 the same way', () => {
    const g = game()
    ensureWorld(g).firms = { v: 1, rows: Array.from({ length: 100 }, (_, i) => ({ id: fid(i), form: 'npc', owner: pid(1), seen: YEAR - (i % 5) })), over: 0 } as never
    ensureWorld(g).homes = { v: 1, rows: Array.from({ length: 200 }, (_, i) => ({ id: hid(i), owner: pid(1), seen: YEAR - (i % 5) })), over: 0 } as never
    lodSweep(g)
    expect(rowsOf(g, 'firms')).toHaveLength(LOD_CAPS.firms)
    expect(rowsOf(g, 'homes')).toHaveLength(LOD_CAPS.homes)
  })

  it('folds the cash of every row it lets go, sorted by id, and the books balance', () => {
    const g = game()
    const ids = [pid(1), pid(2), pid(3)]
    setShard(g, 'people', ids.map((id) => ({ id, seen: 2000 })))
    book(g, 'gift', 'pool:family', ids[0]!, 100)
    book(g, 'gift', 'pool:family', ids[1]!, 250)
    book(g, 'gift', ids[2]!, 'pool:family', 40)
    const sum = booked(g)
    expect(lodSweep(g)).toBe(3)
    for (const id of ids) expect(peekLedger(g).a[id]).toBeUndefined()
    expect(acctBalance(g, hh(g) as never)).toBe(310)
    expect(booked(g)).toBe(sum)
    expect(checkLedger(g).ok).toBe(true)
  })

  it('is idempotent in a year: twice gives the same JSON, and so does a sweep whose stamp was cleared', () => {
    const g = game()
    setShard(g, 'people', [{ id: pid(1), seen: 2000 }, { id: pid(2), seen: YEAR }], 4)
    setShard(g, 'firms', [{ id: fid(1), form: 'npc', owner: pid(1), seen: YEAR }], 2)
    setShard(g, 'homes', [{ id: hid(1), owner: pid(1), seen: YEAR }], 1)
    lodSweep(g)
    const json = JSON.stringify(g.world)
    expect(lodSweep(g)).toBe(0)
    expect(JSON.stringify(g.world)).toBe(json)
    // The stamp is only a shortcut: the state a sweep leaves is already a fixed point.
    ;(g.world as { lod: { y: number } }).lod = { ...(g.world as { lod: object }).lod, y: 0 } as never
    expect(lodSweep(g)).toBe(0)
    expect(JSON.stringify(g.world)).toBe(json)
  })

  it('is idempotent by the year stamp: a second sweep in the same year does nothing, whatever has changed since', () => {
    const g = game()
    setShard(g, 'people', [{ id: pid(1), seen: YEAR }])
    expect(lodSweep(g)).toBe(0)
    // A row that went idle (or a hostile one that arrived) after the sweep waits for next year's step.
    setShard(g, 'people', [{ id: pid(1), seen: YEAR }, { id: pid(2), seen: 2000 }])
    const json = JSON.stringify(g.world)
    expect(lodSweep(g)).toBe(0)
    expect(JSON.stringify(g.world)).toBe(json)
    g.year = YEAR + 1
    expect(lodSweep(g)).toBe(1)
    expect(idsOf(g, 'people')).toEqual([pid(1)])
  })

  it('stamps the year and copies the over counts of the three shards into pooled', () => {
    const g = game()
    setShard(g, 'people', [{ id: pid(1), seen: YEAR }], 20)
    setShard(g, 'firms', [], 5)
    setShard(g, 'homes', [], 7)
    lodSweep(g)
    expect(lodShard(g)).toEqual({ v: 1, y: YEAR, pooled: { person: 20, firm: 5, home: 7 }, demoted: 0 })
  })

  it('on a game with no world, writes the stamp and nothing else', () => {
    const g = game()
    expect(lodSweep(g)).toBe(0)
    expect(g.world).toEqual({ v: 1, lod: { v: 1, y: YEAR, pooled: { person: 0, firm: 0, home: 0 }, demoted: 0 } })
  })

  it('adds up what it lets go over the years', () => {
    const g = game()
    setShard(g, 'people', [{ id: pid(1), seen: 2000 }, { id: pid(2), seen: 2000 }])
    lodSweep(g)
    setShard(g, 'homes', [{ id: hid(1), owner: pid(1), seen: 2000 }])
    g.year = YEAR + 1
    lodSweep(g)
    expect(lodShard(g).demoted).toBe(3)
    expect(lodShard(g).y).toBe(YEAR + 1)
  })
})

describe('order does not matter', () => {
  const ids = Array.from({ length: 120 }, (_, i) => pid(i))

  it('120 names promoted into a shard with room give the same world in 50 shuffles', () => {
    const homes = Array.from({ length: 120 }, (_, i) => hid(i))
    const run = (order: readonly EntityRef[], kind: LodKind): string => {
      const g = game()
      for (const id of order) promote(g, kind, id)
      return JSON.stringify(g.world)
    }
    for (const [kind, names] of [['home', homes], ['person', ids.slice(0, 60)]] as const) {
      const first = run(names, kind)
      const rand = mulberry(11)
      for (let s = 0; s < 50; s++) expect(run(shuffled(names, rand), kind)).toBe(first)
    }
  })

  it('120 names promoted into the 80 places, over stale rows with cash, give the same world in 50 shuffles: the same 80 stay, the same cash folds', () => {
    const stale = Array.from({ length: LOD_CAPS.intimate }, (_, i) => `person:old${pad(i)}`)
    const run = (order: readonly EntityRef[]): GameState => {
      const g = game()
      setShard(g, 'people', personRows(stale, YEAR - 2))
      stale.forEach((id, i) => book(g, 'gift', 'pool:family', id as EntityRef, 100 + i))
      for (const id of order) promote(g, 'person', id)
      return g
    }
    const first = run(ids)
    expect(rowsOf(first, 'people')).toHaveLength(LOD_CAPS.intimate)
    // Fresh names outrank the stale rows; among the fresh the smaller ids rank higher.
    expect(idsOf(first, 'people')).toEqual(ids.slice(0, LOD_CAPS.intimate))
    expect(lodShard(first).demoted).toBe(stale.length + (ids.length - LOD_CAPS.intimate))
    expect(checkLedger(first).ok).toBe(true)
    const json = JSON.stringify(first.world)
    const rand = mulberry(23)
    for (let s = 0; s < 50; s++) expect(JSON.stringify(run(shuffled(ids, rand)).world)).toBe(json)
  })

  it('120 rows demoted in 50 shuffles give the same world', () => {
    const run = (order: readonly EntityRef[]): string => {
      const g = game()
      setShard(g, 'people', ids.map((id) => ({ id, seen: YEAR })))
      ids.forEach((id, i) => book(g, 'gift', i % 2 ? 'pool:family' : id, i % 2 ? id : 'pool:family', 10 + i))
      for (const id of order) demote(g, 'person', id, 'idle')
      return JSON.stringify(g.world)
    }
    const first = run(ids)
    const rand = mulberry(5)
    for (let s = 0; s < 50; s++) expect(run(shuffled(ids, rand))).toBe(first)
  })

  it('an emigrating crowd burns the same total whatever the order', () => {
    const run = (order: readonly EntityRef[]): string => {
      const g = game()
      ids.forEach((id, i) => book(g, 'gift', 'pool:family', id, 1_000 + i))
      for (const id of order) demote(g, 'person', id, 'emigrated')
      return JSON.stringify(g.world)
    }
    const first = run(ids)
    const rand = mulberry(99)
    for (let s = 0; s < 20; s++) expect(run(shuffled(ids, rand))).toBe(first)
  })
})

describe('relevance', () => {
  it('is the recency of the row, plus 1,000 for an owner of an old NPC firm or a holder', () => {
    const g = game()
    const founder = createPerson(g, { relation: 'friend', age: 50 })
    const plain = createPerson(g, { relation: 'friend', age: 30 })
    giveCompany(founder, 'npc1')
    const holder = pid(40)
    ensureWorld(g).holdings = { v: 1, y: YEAR, rows: [[holder, fid(1), 1]] } as never
    expect(relevance(g, 'person', { id: personRef(plain), seen: 2020 })).toBe(2020)
    expect(relevance(g, 'person', { id: personRef(founder), seen: 2020 })).toBe(3020)
    expect(relevance(g, 'person', { id: holder, seen: 2020 })).toBe(3020)
    expect(relevance(g, 'firm', { id: fid(1), seen: 2020 })).toBe(2020)
    expect(relevance(g, 'home', { id: hid(1), seen: 2020 })).toBe(2020)
  })

  it('never reads a year after g.year, and works on a frozen state', () => {
    const g = deepFreeze(game())
    expect(relevance(g, 'person', { id: pid(1), seen: 2099 })).toBe(YEAR)
    expect(relevance(g, 'person', { id: pid(1), seen: YEAR })).toBe(YEAR)
  })
})

describe('seededEntity', () => {
  const make = (rand: () => number): { luck: number[] } => ({ luck: [rand(), rand(), rand()] })

  it('gives the same value for the same life, kind and key: twice, after a structuredClone, and in any year', () => {
    const g = game()
    const a = seededEntity(g, 'person', 'z1', make)
    expect(seededEntity(g, 'person', 'z1', make)).toEqual(a)
    expect(seededEntity(structuredClone(g), 'person', 'z1', make)).toEqual(a)
    g.year = 2040
    expect(seededEntity(g, 'person', 'z1', make)).toEqual(a)
    expect(a.luck.every((x) => x >= 0 && x < 1)).toBe(true)
  })

  it('differs by key, by kind, and by family; an heir of the same family sees the same stranger', () => {
    const g = game()
    const a = seededEntity(g, 'person', 'z1', make)
    expect(seededEntity(g, 'person', 'z2', make)).not.toEqual(a)
    expect(seededEntity(g, 'firm', 'z1', make)).not.toEqual(a)
    const other = game()
    other.lifeId = 'another-life'
    expect(seededEntity(other, 'person', 'z1', make)).not.toEqual(a)
    const heir = game()
    heir.lifeId = 'test-life-g2'
    expect(seededEntity(heir, 'person', 'z1', make)).toEqual(a)
  })

  it('touches nothing: g.rng, g.nextId, flags and the world are as they were, and it works on a frozen state', () => {
    const g = game()
    const json = JSON.stringify(g)
    seededEntity(g, 'person', 'z1', make)
    expect(JSON.stringify(g)).toBe(json)
    expect(g.world).toBeUndefined()
    const frozen = deepFreeze(game())
    expect(() => seededEntity(frozen, 'home', 'h1', make)).not.toThrow()
  })

  it('does not make a stranger persist: only promote does', () => {
    const g = game()
    seededEntity(g, 'person', 'z1', make)
    expect(idsOf(g, 'people')).toEqual([])
    promote(g, 'person', pid(1))
    expect(idsOf(g, 'people')).toEqual([pid(1)])
  })
})

describe('the spread', () => {
  it('makes a promotion cost more than a demotion returns, for every kind, by at least twice the pool spread', () => {
    const pool: Record<LodKind, keyof typeof SPREADS> = { person: 'hh', firm: 'firms', home: 'sellers' }
    for (const kind of ['person', 'firm', 'home'] as const) {
      for (const mid of [1, 100, 12_345, 1e9]) {
        const s = SPREADS[pool[kind]]
        const up = promotionPrice(mid, kind)
        const down = demotionProceeds(mid, kind)
        expect(up, kind).toBeGreaterThan(mid)
        expect(down, kind).toBeLessThan(mid)
        expect(up - down, kind).toBeGreaterThanOrEqual(2 * s * mid * (1 - 1e-12))
      }
    }
  })

  it('is total: a mid price that is not a positive number is worth nothing', () => {
    for (const bad of [NaN, Infinity, -5, 0]) {
      expect(promotionPrice(bad, 'person')).toBe(0)
      expect(demotionProceeds(bad, 'home')).toBe(0)
    }
  })
})

describe('the lod shard', () => {
  it('reads as empty when it is absent, garbage, or from another version', () => {
    const g = game()
    const empty = { v: 1, y: 0, pooled: { person: 0, firm: 0, home: 0 }, demoted: 0 }
    expect(lodShard(g)).toEqual(empty)
    for (const bad of [null, 5, 'x', [], { v: 2 }, { v: 1.5 }]) {
      g.world = { v: 1, lod: bad } as never
      expect(lodShard(g), JSON.stringify(bad)).toEqual(empty)
    }
  })

  it('is normalized: counts are whole numbers in range, the year is a year, and a valid shard comes back as itself', () => {
    const ok = { v: 1, y: 2026, pooled: { person: 3, firm: 2, home: 1 }, demoted: 9 }
    expect(normalizeLod(ok)).toBe(ok)
    const wild = normalizeLod({ v: 1, y: 'x', pooled: { person: 1e12, firm: NaN, home: -4 }, demoted: 1e30 })
    expect(wild.y).toBe(0)
    expect(wild.pooled.person).toBeLessThanOrEqual(100_000)
    expect(wild.pooled.firm).toBe(0)
    expect(wild.pooled.home).toBe(0)
    expect(Number.isInteger(wild.demoted) && wild.demoted >= 0 && wild.demoted <= 1_000_000_000).toBe(true)
    expect(normalizeLod({ v: 1, y: 1e9, pooled: 5, demoted: 2.5 })).toEqual({ v: 1, y: 0, pooled: { person: 0, firm: 0, home: 0 }, demoted: 2 })
  })

  it('is registered with the world: kept by normalizeWorld, and read by worldShard', () => {
    expect(shardNames()).toContain('lod')
    const ok = { v: 1, y: 2026, pooled: { person: 3, firm: 2, home: 1 }, demoted: 9 }
    expect(normalizeWorld({ v: 1, lod: ok }).lod).toEqual(ok)
    expect(normalizeWorld({ v: 1, lod: 'junk' }).lod).toEqual({ v: 1, y: 0, pooled: { person: 0, firm: 0, home: 0 }, demoted: 0 })
    const g = game()
    g.world = { v: 1, lod: ok } as never
    expect(worldShard(g, 'lod')).toEqual(ok)
  })
})

describe('replace discipline (a shard is written by replacing its root, never in place)', () => {
  /** A world with something to do in every shard: rows to promote into, idle rows to sweep, a row to demote, cash to fold. */
  function busy(): GameState {
    const g = game()
    const friend = createPerson(g, { relation: 'friend', age: 30 })
    g.assets.push(asset('h1', 'house', 300_000))
    setShard(g, 'people', [{ id: personRef(friend), seen: YEAR - 1 }, { id: pid(1), seen: 2000 }, { id: pid(2), seen: YEAR - 1 }])
    setShard(g, 'firms', [{ id: fid(1), form: 'npc', owner: pid(1), seen: 2000 }, { id: fid(2), form: 'npc', owner: pid(1), seen: YEAR - 1 }])
    setShard(g, 'homes', [{ id: homeRef('h1'), owner: playerRef(g), seen: YEAR - 1 }, { id: hid(1), owner: pid(1), seen: 2000 }])
    book(g, 'gift', 'pool:family', pid(1), 100)
    book(g, 'sales', 'pool:hh:us', fid(1), 100)
    book(g, 'rent', 'pool:hh:us', hid(1), 100)
    // The lod shard exists before the freeze, stamped last year.
    ensureWorld(g).lod = { v: 1, y: YEAR - 1, pooled: { person: 0, firm: 0, home: 0 }, demoted: 0 } as never
    return g
  }

  function act(g: GameState): void {
    promote(g, 'person', pid(30))
    promote(g, 'firm', fid(30))
    promote(g, 'home', hid(30))
    demote(g, 'person', pid(2), 'cap')
    demote(g, 'firm', fid(2), 'cap')
    demote(g, 'home', homeRef('h1'), 'cap')
    lodSweep(g)
  }

  for (const name of ['people', 'firms', 'homes', 'lod'] as const) {
    it(`does not throw with the ${name} shard deep-frozen, writes a new root, and leaves the frozen original as it was`, () => {
      const g = busy()
      const world = g.world as Record<string, unknown>
      const original = world[name] as object
      expect(original).toBeDefined()
      const before = JSON.stringify(original)
      deepFreeze(original)
      expect(() => act(g)).not.toThrow()
      expect(JSON.stringify(original)).toBe(before)
      expect(world[name]).not.toBe(original)
      expect(JSON.stringify(world[name])).not.toBe(before)
    })
  }

  it('does not throw with all four shard roots frozen at once either', () => {
    const g = busy()
    const world = g.world as Record<string, unknown>
    for (const name of ['people', 'firms', 'homes', 'lod']) deepFreeze(world[name] as object)
    expect(() => act(g)).not.toThrow()
  })

  it('the ledger is edited in place (the one exception) and balances afterwards', () => {
    const g = busy()
    act(g)
    expect(checkLedger(g).ok).toBe(true)
  })
})
