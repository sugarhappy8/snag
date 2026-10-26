// R4-S7 (D.1 f): touch, mark, evict, tombstone, sweep, protectors and salience (src/game/world/met-ops.ts). How a person becomes Met,
// what keeps a record, how it is let go and what a yearly sweep does. Nothing in a played life calls the writers in R4 except the
// sweep, and the sweep does nothing for a life with no Met shard.
//
// What the file proves, in the order of the plan: the survivors of a flood of 40,000 touches (100 times the cap) depend only on the
// set of names; every kind of protection (each stake bit, an obligation, a grudge, a Person, a holder, a registered protector)
// survives the flood and the idle sweep; a record held only by its own stake becomes a tombstone that keeps the obligation, and one
// held by a Person, a holder or a protector is kept as it is; the cap never drops an obligation; a tombstone wakes with its names,
// gender and birth year; an identity is stored as given; markMet sets and clears; protectors and salience follow the contract
// (same id with another function throws, a throw protects nothing and ranks 0, an edge salience is ranked once beside the role
// weight); sweepMet and lodSweep are fixed points of the year; a fold conserves the books and uses the record's country; every
// write works on a deep-frozen shard; every read leaves g.rng, g.nextId and g.world alone; a life with no Met shard is untouched.
// No pinned seed: lives come from makeTestGame, families are strings.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { acctBalance, book, checkLedger, flowsOf, peekLedger } from '../src/game/kernel/ledger'
import { counterparty } from '../src/game/kernel/reasons'
import { worldSeed } from '../src/game/kernel/streams'
import type { GameState, Person } from '../src/game/types'
import { MET_CAPS } from '../src/game/world/caps'
import { OUTSIDE } from '../src/game/world/holdings'
import { fromSeeded, latent, type LatentPerson } from '../src/game/world/latent'
import { lodShard, lodSweep } from '../src/game/world/lod'
import { isTomb, metProblems, metRecord, metTomb, normalizeMet, packGb, readMet, unpackGb, writeMet, type MetRecord, type MetShard, type Tomb } from '../src/game/world/met'
import { resolveName } from '../src/game/world/met-names'
import {
  MET_RULES,
  STAKE,
  evictMet,
  isProtected,
  markMet,
  registerProtector,
  registerSalience,
  salienceOf,
  sweepMet,
  tombstoneMet,
  touchMet,
} from '../src/game/world/met-ops'
import '../src/game/world/shards'
import { makeSid, parseSid, type SidKind } from '../src/game/world/sid'
import { ensureWorld, nodeCount, readWorld } from '../src/game/world/state'
import { trapRng } from './effort-kit'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const FILE = 'src/game/world/met-ops.ts'
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)
const YEAR = 2026

// ---------------------------------------------------------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------------------------------------------------------

function game(): GameState {
  const g = makeTestGame(7, { age: 40, money: 50_000 })
  g.lifeId = 'ops-family'
  return g
}

/** The sid of the i-th person of a small crowd: kind, place and a cohort that stays inside the grammar. */
const sidOf = (i: number, kind: SidKind = 'cls', place = 'us'): string => makeSid({ kind, place, cohort: 1950 + (i % 60), ord: i })
/** The sid of the i-th person of a flood: 40,000 distinct ones (the place carries the thousands). */
const floodSid = (i: number): string => makeSid({ kind: 'cls', place: `p${Math.floor(i / 10_000)}`, cohort: 1850 + (i % 500), ord: i % 10_000 })

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** A valid record with nothing held on it, seen this year. */
function rec(i: number, over: Partial<MetRecord> = {}): MetRecord {
  return { f: `Ida${i}`, l: `Quist${i}`, g: (i % 2) as 0 | 1, b: 1960 + (i % 40), c: 'us', k: 0, a: [50, 40, 60, 30, 70], y: YEAR - 3, s: YEAR, w: 0, fl: 0, gr: 0, ob: 0, ...over }
}

/** A valid tombstone: year, grudge, obligation, flags, first, last, gb. */
function tomb(i: number, over: Partial<Record<number, unknown>> = {}): Tomb {
  const t: unknown[] = [YEAR - 2, 0, 0, 0, `Tomi${i}`, `Gravel${i}`, packGb(1950 + (i % 60), (i % 2) as 0 | 1)]
  for (const [at, v] of Object.entries(over)) t[Number(at)] = v
  return t as unknown as Tomb
}

/** Puts these entries in the Met shard through the one writer (it sorts the keys). */
function seed(g: GameState, entries: readonly (readonly [string, MetRecord | Tomb])[]): GameState {
  writeMet(g, Object.fromEntries(entries) as MetShard)
  return g
}

const STATS = { happiness: 50, health: 50, smarts: 50, looks: 50 }
function person(id: string, over: Partial<Person> = {}): Person {
  return { id, firstName: 'Ann', lastName: 'Lee', gender: 'female', age: 40, alive: true, relation: 'friend', relationship: 50, stats: { ...STATS }, money: 0, occupation: 'Unemployed', traits: [], yearsKnown: 3, livesWithPlayer: false, notes: [], data: {}, ...over }
}

/** A LatentPerson for a name the caller already has (what Life's legacy code drew). */
function identityOf(g: GameState, key: string, i = 0): LatentPerson {
  return fromSeeded({ sid: key, first: `Ida${i}`, last: `Quist${i}`, gender: i % 2 === 1 ? 'male' : 'female', born: 1970 + (i % 30), country: 'us' }, worldSeed(g))
}

const json = (x: unknown): string => JSON.stringify(x)
const entry = (g: GameState, key: string): MetRecord | Tomb | undefined => readMet(g)[key]
const keysOf = (g: GameState): string[] => Object.keys(readMet(g))
const recordsOf = (g: GameState): string[] => keysOf(g).filter((k) => !isTomb(readMet(g)[k]))
const tombsOf = (g: GameState): string[] => keysOf(g).filter((k) => isTomb(readMet(g)[k]))

/** The sum of every account of the ledger. */
const booked = (g: GameState): number => Object.values(peekLedger(g).a).reduce((s, v) => s + v, 0)

/** Gives a holder a share of a company, in the holdings table. */
function holds(g: GameState, key: string): void {
  ensureWorld(g).holdings = { v: 1, y: YEAR, rows: [[`person:${key}`, 'firm:f1', 0.5], [OUTSIDE, 'firm:f1', 0.5]] } as never
}

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

/** What every shard a writer leaves must be: valid by its own reader, inside the caps, and no problem named. */
function expectValid(g: GameState): void {
  const raw = readWorld(g).met
  expect(metProblems(raw, g.people)).toEqual([])
  expect(normalizeMet(raw)).toBe(raw)
  const shard = readMet(g)
  expect(recordsOf(g).length).toBeLessThanOrEqual(MET_CAPS.records)
  expect(tombsOf(g).length).toBeLessThanOrEqual(MET_CAPS.tombs)
  expect(nodeCount(shard, 10_000_000)).toBeLessThanOrEqual(10_401)
}

// The protectors and saliences of this file are registered once, at load, as the Edges track will do: each reads a variable the cases
// set, so a case never leaks into the next one. The registry is module-wide, so the ids are unique to this file.
const HELD = new Set<string>()
const SAL = new Map<string, number>()
const MODE = { protector: 'ok' as 'ok' | 'throw' | 'midway', salience: 'ok' as 'ok' | 'throw' | 'nan' | 'huge' }
registerProtector('test.held', () => HELD)
registerProtector('test.fails', function* () {
  if (MODE.protector === 'throw') throw new Error('a protector that fails')
  if (MODE.protector === 'midway') {
    yield 'cls.us.1950.0'
    throw new Error('a protector that fails half way')
  }
})
registerSalience('test.edge', (_g, key) => {
  if (MODE.salience === 'throw') throw new Error('a salience that fails')
  if (MODE.salience === 'nan') return Number.NaN
  if (MODE.salience === 'huge') return 1e300
  return SAL.get(key) ?? 0
})

function reset(): void {
  HELD.clear()
  SAL.clear()
  MODE.protector = 'ok'
  MODE.salience = 'ok'
}

// ---------------------------------------------------------------------------------------------------------------------------
// The rules, stated once
// ---------------------------------------------------------------------------------------------------------------------------

describe('the stake bits and the rules', () => {
  it('are the plan: 1 debt, 2 spouse, 4 heir, 8 company, 16 feud, 32 will; a grudge of 20 holds; tombstones keep 20 years; a role weight counts 10', () => {
    expect(STAKE).toEqual({ debt: 1, spouse: 2, heir: 4, company: 8, feud: 16, will: 32 })
    expect(MET_RULES).toEqual({ grudgeHolds: 20, tombYears: 20, roleRank: 10 })
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// touchMet
// ---------------------------------------------------------------------------------------------------------------------------

describe('touchMet makes a record', () => {
  it('for a sid with none: latent and resolveName, first met and last seen this year, no stake, role weight 0', () => {
    reset()
    const g = game()
    const key = sidOf(3, 'cls', 'us')
    expect(touchMet(g, key)).toBe(true)
    const lat = latent(worldSeed(g), parseSid(key)!)
    const want = (() => {
      const probe = game()
      return resolveName(probe, lat)
    })()
    const r = metRecord(g, key)!
    expect(r).toEqual({
      f: want.first,
      l: want.last,
      g: lat.gender === 'male' ? 1 : 0,
      b: lat.born,
      c: lat.country,
      k: want.k,
      a: [lat.axes.ambition, lat.axes.honesty, lat.axes.empathy, lat.axes.risk, lat.axes.steadiness],
      y: YEAR,
      s: YEAR,
      w: 0,
      fl: 0,
      gr: 0,
      ob: 0,
    })
    expectValid(g)
  })

  it('takes the country of an entity-placed slot from `home`', () => {
    reset()
    const g = game()
    const key = makeSid({ kind: 'dir', place: 'f1234', cohort: 1990, ord: 2 })
    expect(touchMet(g, key, undefined, 'jp')).toBe(true)
    expect(metRecord(g, key)!.c).toBe('jp')
    expect(metRecord(g, key)!.c).toBe(latent(worldSeed(g), parseSid(key)!, 'jp').country)
  })

  it('stores an identity exactly as given and never regenerates it (the fromSeeded result, name draw 0)', () => {
    reset()
    const g = game()
    const key = sidOf(11, 'kin', 'ca')
    const id = identityOf(g, key, 5)
    // A name the pool would never give: the record must still carry it.
    const odd: LatentPerson = { ...id, first: 'Quillon', last: 'Vandermeer-Oyelaran' }
    expect(touchMet(g, key, undefined, undefined, odd)).toBe(true)
    const r = metRecord(g, key)!
    expect([r.f, r.l, r.g, r.b, r.c, r.k]).toEqual(['Quillon', 'Vandermeer-Oyelaran', 1, odd.born, odd.country, 0])
    expect(r.a).toEqual([odd.axes.ambition, odd.axes.honesty, odd.axes.empathy, odd.axes.risk, odd.axes.steadiness])
    // A second touch, with another identity, keeps the stored one.
    expect(touchMet(g, key, undefined, undefined, identityOf(g, key, 8))).toBe(true)
    expect([metRecord(g, key)!.f, metRecord(g, key)!.l]).toEqual(['Quillon', 'Vandermeer-Oyelaran'])
    expectValid(g)
  })

  it('refuses an identity that belongs to another sid, and one that cannot be stored, and writes nothing', () => {
    reset()
    const g = game()
    const key = sidOf(4)
    const before = json(g.world)
    expect(touchMet(g, key, undefined, undefined, identityOf(g, sidOf(5)))).toBe(false)
    expect(touchMet(g, key, undefined, undefined, { ...identityOf(g, key), first: '   ' })).toBe(false)
    expect(touchMet(g, key, undefined, undefined, { ...identityOf(g, key), born: Number.NaN })).toBe(false)
    expect(json(g.world)).toBe(before)
    expect(readWorld(g).met).toBeUndefined()
  })

  it('refuses a key that is no sid of the strict grammar, and writes nothing', () => {
    reset()
    const g = game()
    const before = json(g)
    for (const bad of ['p12', 'out.Ann.Lee', '', 'cls.us.2004.012', 'cls.us.1849.0', 'cls.us.2004', 'x'.repeat(60), 's77', 'person:cls.us.2004.1']) {
      expect(touchMet(g, bad), bad).toBe(false)
    }
    expect(touchMet(g, 5 as unknown as string)).toBe(false)
    expect(touchMet(g, null as unknown as string)).toBe(false)
    expect(json(g)).toBe(before)
  })

  it('stamps `s` and merges a patch on a record it already has, each field cut to its range', () => {
    reset()
    const g = seed(game(), [[sidOf(1), rec(1, { s: YEAR - 2, w: 3, fl: 2 })]])
    expect(touchMet(g, sidOf(1), { w: 7, gr: 30 })).toBe(true)
    const r = metRecord(g, sidOf(1))!
    expect([r.s, r.w, r.fl, r.gr, r.ob, r.f]).toEqual([YEAR, 7, 2, 30, 0, 'Ida1'])
    expect(touchMet(g, sidOf(1), { w: 99, fl: 1e300, gr: -5, ob: -1e300, d: 5 })).toBe(true)
    const h = metRecord(g, sidOf(1))!
    expect([h.w, h.fl, h.gr, h.ob, h.d]).toEqual([9, 63, 0, -100, 1900])
    expectValid(g)
  })

  it('ignores a patch field that is not a finite number, and a patch that is no object', () => {
    reset()
    const g = seed(game(), [[sidOf(1), rec(1, { w: 3, fl: 2, gr: 10, ob: 5 })]])
    const hostile = { w: Number.NaN, fl: '63', gr: Infinity, ob: null, d: {} } as unknown as Parameters<typeof touchMet>[2]
    expect(touchMet(g, sidOf(1), hostile)).toBe(true)
    const r = metRecord(g, sidOf(1))!
    expect([r.w, r.fl, r.gr, r.ob, r.d]).toEqual([3, 2, 10, 5, undefined])
    expect(touchMet(g, sidOf(1), 7 as unknown as Parameters<typeof touchMet>[2])).toBe(true)
    expect(touchMet(g, sidOf(1), [] as unknown as Parameters<typeof touchMet>[2])).toBe(true)
    expectValid(g)
  })

  it('is idempotent in a year: a second touch changes nothing and keeps the root and the record', () => {
    reset()
    const g = game()
    touchMet(g, sidOf(2), { w: 4 })
    const root = readWorld(g).met
    const rec2 = metRecord(g, sidOf(2))
    const snapshot = json(g.world)
    expect(touchMet(g, sidOf(2), { w: 4 })).toBe(true)
    expect(readWorld(g).met).toBe(root)
    expect(metRecord(g, sidOf(2))).toBe(rec2)
    expect(json(g.world)).toBe(snapshot)
  })

  it('wakes a tombstone: its names, gender and birth year back, its stake kept, the axes and country from latent', () => {
    reset()
    const key = sidOf(6, 'frn', 'jp')
    const g = seed(game(), [[key, tomb(6, { 0: 2010, 1: 25, 2: -40, 3: 1, 4: 'Haruki', 5: 'Okonkwo', 6: packGb(1944, 1) })]])
    expect(metTomb(g, key)).not.toBeNull()
    expect(touchMet(g, key, { w: 2 })).toBe(true)
    expect(metTomb(g, key)).toBeNull()
    const lat = latent(worldSeed(g), parseSid(key)!)
    const r = metRecord(g, key)!
    expect([r.f, r.l, r.g, r.b, r.fl, r.gr, r.ob, r.w, r.s, r.c]).toEqual(['Haruki', 'Okonkwo', 1, 1944, 1, 25, -40, 2, YEAR, lat.country])
    expect(r.a).toEqual([lat.axes.ambition, lat.axes.honesty, lat.axes.empathy, lat.axes.risk, lat.axes.steadiness])
    expect(r.y).toBeLessThanOrEqual(r.s)
    expect(unpackGb(packGb(r.b, r.g))).toEqual({ born: 1944, g: 1 })
    expectValid(g)
  })

  it('refuses a woken tombstone at the cap when every record is held, and the tombstone stays as it was', () => {
    reset()
    const dead = sidOf(900, 'frn')
    const g = seed(game(), [[dead, tomb(1, { 2: 50, 3: 1 })], ...Array.from({ length: MET_CAPS.records }, (_, i) => [sidOf(i), rec(i, { ob: 10 })] as const)])
    const before = json(g.world)
    expect(touchMet(g, dead)).toBe(false)
    expect(json(g.world)).toBe(before)
  })

  it('makes the world only when it writes: a refused touch leaves a life with no world as it was', () => {
    reset()
    const g = game()
    expect(touchMet(g, 'nope')).toBe(false)
    expect(g.world).toBeUndefined()
    expect(touchMet(g, sidOf(1))).toBe(true)
    expect(g.world).toBeDefined()
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// markMet
// ---------------------------------------------------------------------------------------------------------------------------

describe('markMet', () => {
  it('sets the given stake fields to the given values and leaves the others: a bit can be set and cleared', () => {
    reset()
    const g = seed(game(), [[sidOf(1), rec(1, { fl: STAKE.spouse | STAKE.heir, gr: 12, ob: 3 })]])
    expect(markMet(g, sidOf(1), { fl: STAKE.heir })).toBe(true)
    expect(metRecord(g, sidOf(1))).toMatchObject({ fl: 4, gr: 12, ob: 3 })
    expect(markMet(g, sidOf(1), { fl: 0 })).toBe(true)
    expect(metRecord(g, sidOf(1))).toMatchObject({ fl: 0, gr: 12, ob: 3 })
    expect(markMet(g, sidOf(1), { gr: 40, ob: -60 })).toBe(true)
    expect(metRecord(g, sidOf(1))).toMatchObject({ fl: 0, gr: 40, ob: -60 })
    expect(isProtected(g, sidOf(1))).toBe(true)
    expect(markMet(g, sidOf(1), { gr: 19, ob: 0 })).toBe(true)
    expect(isProtected(g, sidOf(1))).toBe(false)
    expectValid(g)
  })

  it('does not stamp the record, and returns false for a key that holds neither a record nor a tombstone', () => {
    reset()
    const g = seed(game(), [[sidOf(1), rec(1, { s: YEAR - 4 })]])
    markMet(g, sidOf(1), { fl: 2 })
    expect(metRecord(g, sidOf(1))!.s).toBe(YEAR - 4)
    const before = json(g.world)
    expect(markMet(g, sidOf(2), { fl: 2 })).toBe(false)
    expect(markMet(g, 'p12', { fl: 2 })).toBe(false)
    expect(markMet(g, '', { fl: 2 })).toBe(false)
    expect(json(g.world)).toBe(before)
  })

  it('cuts every field to its range and ignores one that is not a finite number', () => {
    reset()
    const g = seed(game(), [[sidOf(1), rec(1, { fl: 1, gr: 5, ob: 5 })]])
    expect(markMet(g, sidOf(1), { fl: 1e300, gr: -1e300, ob: 1e300 })).toBe(true)
    expect(metRecord(g, sidOf(1))).toMatchObject({ fl: 63, gr: 0, ob: 100 })
    const hostile = { fl: Number.NaN, gr: '9', ob: undefined } as unknown as Parameters<typeof markMet>[2]
    expect(markMet(g, sidOf(1), hostile)).toBe(true)
    expect(metRecord(g, sidOf(1))).toMatchObject({ fl: 63, gr: 0, ob: 100 })
    expect(markMet(g, sidOf(1), null as unknown as Parameters<typeof markMet>[2])).toBe(false)
    expectValid(g)
  })

  it('marks a tombstone too (a legacy id as well), so the bit of a link that ended can be cleared', () => {
    reset()
    const g = seed(game(), [[sidOf(1), tomb(1, { 3: 6, 2: 10 })], ['p77', tomb(2, { 2: -30 })]])
    expect(markMet(g, sidOf(1), { fl: 2 })).toBe(true)
    expect([metTomb(g, sidOf(1))![3], metTomb(g, sidOf(1))![2]]).toEqual([2, 10])
    expect(markMet(g, 'p77', { ob: 0, gr: 50 })).toBe(true)
    expect([metTomb(g, 'p77')![2], metTomb(g, 'p77')![1], metTomb(g, 'p77')![4]]).toEqual([0, 50, 'Tomi2'])
    expectValid(g)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// Protection
// ---------------------------------------------------------------------------------------------------------------------------

describe('isProtected', () => {
  it('is true for each stake bit, an obligation either way, and a grudge of 20 or more; false for a grudge of 19 and a plain record', () => {
    reset()
    const g = game()
    const entries: [string, MetRecord][] = [[sidOf(0), rec(0)]]
    for (const [i, bit] of [1, 2, 4, 8, 16, 32].entries()) entries.push([sidOf(10 + i), rec(10 + i, { fl: bit })])
    entries.push([sidOf(20), rec(20, { ob: 1 })], [sidOf(21), rec(21, { ob: -1 })], [sidOf(22), rec(22, { gr: 20 })], [sidOf(23), rec(23, { gr: 19 })])
    seed(g, entries)
    expect(isProtected(g, sidOf(0))).toBe(false)
    for (let i = 10; i < 16; i++) expect(isProtected(g, sidOf(i)), `bit ${i}`).toBe(true)
    expect(isProtected(g, sidOf(20))).toBe(true)
    expect(isProtected(g, sidOf(21))).toBe(true)
    expect(isProtected(g, sidOf(22))).toBe(true)
    expect(isProtected(g, sidOf(23))).toBe(false)
  })

  it('is true for a tombstone with a stake, and false for one with none', () => {
    reset()
    const g = seed(game(), [[sidOf(1), tomb(1, { 2: 4 })], [sidOf(2), tomb(2)], ['p9', tomb(3, { 3: 2 })]])
    expect(isProtected(g, sidOf(1))).toBe(true)
    expect(isProtected(g, sidOf(2))).toBe(false)
    expect(isProtected(g, 'p9')).toBe(true)
  })

  it('is true for a Person of g.people with that personKey (a sid, or the id), a holder in the holdings table, and a registered protector', () => {
    reset()
    const g = seed(game(), [[sidOf(1), rec(1)], [sidOf(2), rec(2)], [sidOf(3), rec(3)], [sidOf(4), rec(4)]])
    expect(isProtected(g, sidOf(1))).toBe(false)
    g.people.push(person('p5', { data: { sid: sidOf(1) } }), person('p6'))
    expect(isProtected(g, sidOf(1))).toBe(true)
    expect(isProtected(g, 'p6')).toBe(true)
    expect(isProtected(g, 'p5')).toBe(false)
    holds(g, sidOf(2))
    expect(isProtected(g, sidOf(2))).toBe(true)
    HELD.add(sidOf(3))
    expect(isProtected(g, sidOf(3))).toBe(true)
    expect(isProtected(g, sidOf(4))).toBe(false)
  })

  it('protects by key also when there is no entry: a debt outlives its record', () => {
    reset()
    const g = game()
    HELD.add('p31')
    expect(isProtected(g, 'p31')).toBe(true)
    expect(isProtected(g, 'p32')).toBe(false)
    expect(isProtected(g, 5 as unknown as string)).toBe(false)
  })
})

describe('registerProtector and registerSalience', () => {
  it('refuse an id that is no text and a function that is no function', () => {
    reset()
    expect(() => registerProtector('', () => [])).toThrow()
    expect(() => registerProtector(5 as unknown as string, () => [])).toThrow()
    expect(() => registerProtector('test.nofn', 5 as unknown as () => string[])).toThrow()
    expect(() => registerSalience('', () => 0)).toThrow()
    expect(() => registerSalience('test.nofn2', null as unknown as () => number)).toThrow()
  })

  it('a protector that throws protects nothing, even when it fails half way through its keys; the others still protect', () => {
    reset()
    const g = seed(game(), [[sidOf(1), rec(1)], ['cls.us.1950.0', rec(0)]])
    HELD.add(sidOf(1))
    MODE.protector = 'throw'
    expect(isProtected(g, sidOf(1))).toBe(true)
    MODE.protector = 'midway'
    expect(isProtected(g, 'cls.us.1950.0')).toBe(false)
    expect(isProtected(g, sidOf(1))).toBe(true)
    // And the sweep and a touch still run.
    expect(() => sweepMet(g)).not.toThrow()
    expect(touchMet(g, sidOf(2))).toBe(true)
  })

  it('a protector gives keys that are not text: they protect nothing and do not throw', () => {
    reset()
    const g = seed(game(), [[sidOf(1), rec(1)]])
    HELD.add(7 as unknown as string)
    HELD.add(null as unknown as string)
    expect(isProtected(g, sidOf(1))).toBe(false)
    HELD.clear()
  })

  it('salience is the registered function plus the role weight times 10; a function that throws or is not a number counts 0, and a huge one is bounded', () => {
    reset()
    const g = seed(game(), [[sidOf(1), rec(1, { w: 4 })], [sidOf(2), rec(2)]])
    expect(salienceOf(g, sidOf(1))).toBe(40)
    SAL.set(sidOf(1), 17)
    expect(salienceOf(g, sidOf(1))).toBe(57)
    expect(salienceOf(g, sidOf(2))).toBe(0)
    expect(salienceOf(g, 'cls.us.1999.99')).toBe(0)
    MODE.salience = 'throw'
    expect(salienceOf(g, sidOf(1))).toBe(40)
    MODE.salience = 'nan'
    expect(salienceOf(g, sidOf(1))).toBe(40)
    MODE.salience = 'huge'
    expect(salienceOf(g, sidOf(1))).toBe(1_000_000 + 40)
  })

  it('an edge salience of f + s + abs(o) is ranked once beside the role weight: the same person, counted by one function and by two, differs by the second only', () => {
    reset()
    const key = sidOf(1)
    const g = seed(game(), [[key, rec(1, { w: 2 })]])
    const f = 30
    const s = 5
    const o = -12
    SAL.set(key, f + s + Math.abs(o))
    expect(salienceOf(g, key)).toBe(f + s + Math.abs(o) + 2 * MET_RULES.roleRank)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// evictMet
// ---------------------------------------------------------------------------------------------------------------------------

describe('evictMet', () => {
  it('drops a plain record and folds its account into the household pool of the PERSON\'s country (not the player\'s); the books balance', () => {
    reset()
    const key = sidOf(1, 'cls', 'jp')
    const g = seed(game(), [[key, rec(1, { c: 'jp' })]])
    expect(g.character.countryId).toBe('us')
    book(g, 'gift', 'pool:family', `person:${key}` as never, 1_234)
    const jp = counterparty('hh', 'jp')
    const us = counterparty('hh', 'us')
    const jpBefore = acctBalance(g, jp as never)
    const usBefore = acctBalance(g, us as never)
    const sum = booked(g)
    const flows = json(flowsOf(g))
    expect(evictMet(g, key, 'idle')).toBe('dropped')
    expect(entry(g, key)).toBeUndefined()
    expect(peekLedger(g).a[`person:${key}`]).toBeUndefined()
    expect(acctBalance(g, jp as never) - jpBefore).toBe(1_234)
    expect(acctBalance(g, us as never)).toBe(usBefore)
    expect(booked(g)).toBe(sum)
    expect(json(flowsOf(g))).toBe(flows)
    expect(checkLedger(g).ok).toBe(true)
  })

  it('folds a negative balance too, so the sum does not change', () => {
    reset()
    const key = sidOf(1)
    const g = seed(game(), [[key, rec(1)]])
    book(g, 'gift', `person:${key}` as never, 'pool:family', 300)
    const sum = booked(g)
    expect(evictMet(g, key, 'cap')).toBe('dropped')
    expect(booked(g)).toBe(sum)
    expect(checkLedger(g).ok).toBe(true)
  })

  it('turns a record held only by its own stake into a tombstone that keeps the stake, the names and the born year and gender', () => {
    reset()
    for (const stake of [{ fl: 1 }, { fl: 2 }, { fl: 4 }, { fl: 8 }, { fl: 16 }, { fl: 32 }, { ob: 15 }, { ob: -15 }, { gr: 20 }, { gr: 90, ob: 3, fl: 9 }]) {
      const key = sidOf(1)
      const g = seed(game(), [[key, rec(1, { ...stake, b: 1944, g: 1, s: YEAR - 9 })]])
      expect(evictMet(g, key, 'idle'), json(stake)).toBe('tomb')
      expect(metRecord(g, key)).toBeNull()
      const t = metTomb(g, key)!
      expect(t[1]).toBe(stake.gr ?? 0)
      expect(t[2]).toBe(stake.ob ?? 0)
      expect(t[3]).toBe(stake.fl ?? 0)
      expect([t[4], t[5]]).toEqual(['Ida1', 'Quist1'])
      expect(unpackGb(t[6])).toEqual({ born: 1944, g: 1 })
      expect(t[0]).toBe(YEAR - 9)
      expectValid(g)
    }
  })

  it('keeps a record held by a Person, a holder or a protector as it is: not a tombstone, not dropped, even with a stake of its own', () => {
    reset()
    const g = seed(game(), [
      [sidOf(1), rec(1)],
      [sidOf(2), rec(2, { fl: 2 })],
      [sidOf(3), rec(3)],
      [sidOf(4), rec(4, { ob: 7 })],
      [sidOf(5), rec(5)],
    ])
    g.people.push(person('p1', { data: { sid: sidOf(1) } }), person('p2', { data: { sid: sidOf(2) } }))
    holds(g, sidOf(3))
    HELD.add(sidOf(4))
    HELD.add(sidOf(5))
    const before = json(readMet(g))
    for (const i of [1, 2, 3, 4, 5]) expect(evictMet(g, sidOf(i), 'idle'), `record ${i}`).toBe('kept')
    expect(json(readMet(g))).toBe(before)
  })

  it('says absent for a key with no record: none at all, or a tombstone only; and changes nothing', () => {
    reset()
    const g = seed(game(), [[sidOf(1), tomb(1, { 3: 2 })]])
    const before = json(g.world)
    expect(evictMet(g, sidOf(2), 'idle')).toBe('absent')
    expect(evictMet(g, sidOf(1), 'idle')).toBe('absent')
    expect(evictMet(g, 'p5', 'idle')).toBe('absent')
    expect(evictMet(g, 'junk', 'idle')).toBe('absent')
    expect(json(g.world)).toBe(before)
  })

  it('keeps the record when the tombstone cap is full of held tombstones: an obligation is never dropped to make room', () => {
    reset()
    const key = sidOf(9000, 'frn')
    const tombs = Array.from({ length: MET_CAPS.tombs }, (_, i) => [sidOf(i, 'actor'), tomb(i, { 2: 5 })] as const)
    const g = seed(game(), [[key, rec(1, { ob: 9, s: YEAR - 9 })], ...tombs])
    const before = json(readMet(g))
    expect(evictMet(g, key, 'idle')).toBe('kept')
    expect(json(readMet(g))).toBe(before)
  })

  it('makes room in a full tombstone list by dropping one that is 20 years old with no stake, never one with an obligation', () => {
    reset()
    const key = sidOf(9000, 'frn')
    const tombs = Array.from({ length: MET_CAPS.tombs }, (_, i) => [sidOf(i, 'actor'), tomb(i, { 2: 5 })] as const)
    const old = sidOf(5000, 'actor')
    const g = seed(game(), [[key, rec(1, { ob: 9, s: YEAR - 9 })], ...tombs.slice(1), [old, tomb(7, { 0: YEAR - 20, 2: 0 })]])
    expect(tombsOf(g)).toHaveLength(MET_CAPS.tombs)
    expect(evictMet(g, key, 'idle')).toBe('tomb')
    expect(metTomb(g, old)).toBeNull()
    expect(metTomb(g, key)![2]).toBe(9)
    expect(tombsOf(g)).toHaveLength(MET_CAPS.tombs)
    expectValid(g)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// tombstoneMet
// ---------------------------------------------------------------------------------------------------------------------------

describe('tombstoneMet', () => {
  it('turns a record into a tombstone, whatever holds it, setting the stake it is given, and folds the account', () => {
    reset()
    const key = sidOf(1, 'cls', 'ca')
    const g = seed(game(), [[key, rec(1, { c: 'ca', fl: 2, gr: 4, b: 1951, g: 0 })]])
    book(g, 'gift', 'pool:family', `person:${key}` as never, 500)
    const ca = counterparty('hh', 'ca')
    const before = acctBalance(g, ca as never)
    expect(tombstoneMet(g, key, { ob: -40, fl: 1 })).toBe(true)
    expect(metRecord(g, key)).toBeNull()
    const t = metTomb(g, key)!
    expect([t[1], t[2], t[3], t[4], t[5]]).toEqual([4, -40, 1, 'Ida1', 'Quist1'])
    expect(unpackGb(t[6])).toEqual({ born: 1951, g: 0 })
    expect(acctBalance(g, ca as never) - before).toBe(500)
    expect(checkLedger(g).ok).toBe(true)
    expectValid(g)
  })

  it('updates a tombstone it already has: the stake given is set, the names stay', () => {
    reset()
    const key = sidOf(2)
    const g = seed(game(), [[key, tomb(2, { 2: 30, 3: 1 })]])
    expect(tombstoneMet(g, key, { ob: 0, fl: 0, gr: 21 })).toBe(true)
    const t = metTomb(g, key)!
    expect([t[1], t[2], t[3], t[4], t[5]]).toEqual([21, 0, 0, 'Tomi2', 'Gravel2'])
    expect(t[0]).toBe(YEAR)
  })

  it('accepts a legacy person id: a debt outlives its Person (the names come from the Person still in g.people)', () => {
    reset()
    const g = game()
    g.people.push(person('p41', { firstName: 'Odalys', lastName: 'Whitfield', gender: 'female', age: 38 }))
    expect(tombstoneMet(g, 'p41', { ob: -25 })).toBe(true)
    const t = metTomb(g, 'p41')!
    expect([t[0], t[1], t[2], t[3], t[4], t[5]]).toEqual([YEAR, 0, -25, 0, 'Odalys', 'Whitfield'])
    expect(unpackGb(t[6])).toEqual({ born: YEAR - 38, g: 0 })
    expect(isProtected(g, 'p41')).toBe(true)
    // The Person goes; the debt stays.
    g.people.pop()
    expect(metTomb(g, 'p41')![2]).toBe(-25)
    expect(keysOf(g)).toEqual(['p41'])
    expectValid(g)
  })

  it('returns false and writes nothing for a key that is neither a sid nor a legacy id, and for a key with no source of names', () => {
    reset()
    const g = game()
    const before = json(g)
    for (const bad of ['', 'out.Ann.Lee', 'p', 'p12x', 's77', 'x'.repeat(50)]) expect(tombstoneMet(g, bad, { ob: 1 }), bad).toBe(false)
    expect(tombstoneMet(g, 'p77', { ob: 1 })).toBe(false)
    expect(tombstoneMet(g, sidOf(1), { ob: 1 })).toBe(false)
    expect(json(g)).toBe(before)
  })

  it('refuses when the tombstone list is full of held tombstones, and nothing changes: the cap never drops an obligation', () => {
    reset()
    const tombs = Array.from({ length: MET_CAPS.tombs }, (_, i) => [sidOf(i, 'actor'), tomb(i, { 2: 5 })] as const)
    const g = seed(game(), [[sidOf(1), rec(1)], ...tombs])
    const before = json(readMet(g))
    expect(tombstoneMet(g, sidOf(1), { ob: 3 })).toBe(false)
    expect(json(readMet(g))).toBe(before)
    expect(metRecord(g, sidOf(1))).not.toBeNull()
  })

  it('cuts the stake to its ranges and ignores a field that is not a finite number', () => {
    reset()
    const g = seed(game(), [[sidOf(1), rec(1)]])
    expect(tombstoneMet(g, sidOf(1), { fl: 999, gr: -3, ob: Number.NaN })).toBe(true)
    const t = metTomb(g, sidOf(1))!
    expect([t[1], t[2], t[3]]).toEqual([0, 0, 63])
    expectValid(g)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// The cap, and the rank
// ---------------------------------------------------------------------------------------------------------------------------

/** A full shard: 400 records, ascending keys, all seen this year with no stake, unless `over` says otherwise. */
function full(over: (i: number) => Partial<MetRecord> = () => ({})): GameState {
  return seed(
    game(),
    Array.from({ length: MET_CAPS.records }, (_, i) => [sidOf(i), rec(i, over(i))] as const),
  )
}

describe('at the cap of 400 records', () => {
  it('a touch returns false and writes nothing when every record is held, and so does a key that is no sid', () => {
    reset()
    const g = full((i) => ({ ob: i % 2 === 0 ? 3 : 0, fl: i % 2 === 0 ? 0 : 1 }))
    const before = json(g.world)
    expect(touchMet(g, sidOf(401, 'kin'))).toBe(false)
    expect(touchMet(g, sidOf(402, 'kin'), { ob: 50 })).toBe(false)
    expect(touchMet(g, 'p12')).toBe(false)
    expect(json(g.world)).toBe(before)
    expect(recordsOf(g)).toHaveLength(MET_CAPS.records)
  })

  it('lets go the lowest ranked unprotected record: the oldest seen first', () => {
    reset()
    const g = full((i) => ({ s: i === 77 ? YEAR - 3 : YEAR - 1 }))
    expect(touchMet(g, sidOf(1000, 'kin'))).toBe(true)
    expect(recordsOf(g)).toHaveLength(MET_CAPS.records)
    expect(entry(g, sidOf(77))).toBeUndefined()
    expect(metRecord(g, sidOf(1000, 'kin'))).not.toBeNull()
    expect(metProblems(readWorld(g).met)).toEqual([])
  })

  it('ranks by salience before recency: the role weight times 10 and a registered salience both count, and only once', () => {
    reset()
    // Everyone has a role weight of 3 (30). Record 5 is old with a weight of 2 (20), record 6 is old with a weight of 0 and an edge
    // salience of 25, record 7 is old with neither. A newcomer comes in with a role weight of 9 (90).
    const g = full((i) => ({ s: i >= 5 && i <= 7 ? YEAR - 4 : YEAR, w: i === 5 ? 2 : i === 6 || i === 7 ? 0 : 3 }))
    SAL.set(sidOf(6), 25)
    expect(touchMet(g, sidOf(1000, 'kin'), { w: 9 })).toBe(true)
    expect(entry(g, sidOf(7))).toBeUndefined()
    expect(entry(g, sidOf(5))).toBeDefined()
    expect(entry(g, sidOf(6))).toBeDefined()
    // The next one lets go the weaker of the two: 20 against 25.
    expect(touchMet(g, sidOf(1001, 'kin'), { w: 9 })).toBe(true)
    expect(entry(g, sidOf(5))).toBeUndefined()
    expect(entry(g, sidOf(6))).toBeDefined()
    expectValid(g)
  })

  it('breaks a tie of salience and recency by key: the larger key goes first, so the survivors depend only on the names', () => {
    reset()
    const g = full()
    const last = recordsOf(g).sort(cmp).pop()!
    const small = sidOf(1000, 'actor', 'us')
    expect(small < last).toBe(true)
    expect(touchMet(g, small)).toBe(true)
    expect(entry(g, last)).toBeUndefined()
    expect(entry(g, small)).toBeDefined()
  })

  it('turns the new name away when it ranks lowest of all: false, and the shard is as it was', () => {
    reset()
    const g = full()
    const before = json(g.world)
    const big = makeSid({ kind: 'tch', place: 'zz', cohort: 2400, ord: 9999 })
    expect(recordsOf(g).every((k) => k < big)).toBe(true)
    expect(touchMet(g, big)).toBe(false)
    expect(json(g.world)).toBe(before)
  })

  it('takes a protected newcomer in place of an unprotected record even when the newcomer ranks lowest', () => {
    reset()
    const g = full((i) => ({ w: i === 3 ? 0 : 9, s: i === 3 ? YEAR - 2 : YEAR }))
    const big = makeSid({ kind: 'tch', place: 'zz', cohort: 2400, ord: 9999 })
    HELD.add(big)
    expect(touchMet(g, big)).toBe(true)
    expect(entry(g, sidOf(3))).toBeUndefined()
    expect(metRecord(g, big)).not.toBeNull()
    expect(isProtected(g, big)).toBe(true)
  })

  it('takes a newcomer that brings its own stake the same way', () => {
    reset()
    const g = full((i) => ({ w: i === 3 ? 0 : 9 }))
    const big = makeSid({ kind: 'tch', place: 'zz', cohort: 2400, ord: 9999 })
    expect(touchMet(g, big, { ob: 20 })).toBe(true)
    expect(entry(g, sidOf(3))).toBeUndefined()
    expect(metRecord(g, big)!.ob).toBe(20)
  })

  it('folds the account of the record it lets go, into the household pool of that record\'s country', () => {
    reset()
    const g = full((i) => ({ s: i === 9 ? YEAR - 3 : YEAR - 1, c: i === 9 ? 'de' : 'us' }))
    book(g, 'gift', 'pool:family', `person:${sidOf(9)}` as never, 800)
    const de = acctBalance(g, counterparty('hh', 'de') as never)
    const sum = booked(g)
    expect(touchMet(g, sidOf(1000, 'kin'))).toBe(true)
    expect(acctBalance(g, counterparty('hh', 'de') as never) - de).toBe(800)
    expect(booked(g)).toBe(sum)
    expect(checkLedger(g).ok).toBe(true)
  })
})

describe('a flood of touches, 100 times the cap', () => {
  const FLOOD = 40_000
  // The cost of a touch is a pass over the 400 records, and of an accepted one a write of the shard (about a quarter of a millisecond),
  // so the orders are chosen with care: a reversed order accepts every touch, an ascending one almost none. The ten permutations that
  // must agree run on 1,200 names (3 times the cap); the flood of 40,000 runs in a shuffled order and in the natural one.
  const SMALL = 1_200

  it('leaves the same survivors in ten orders: the 400 smallest keys, with the same records (names given, so they do not depend on the order)', () => {
    reset()
    const g0 = game()
    const keys = Array.from({ length: SMALL }, (_, i) => floodSid(i * 31))
    const ids = keys.map((k, i) => identityOf(g0, k, i))
    const want = [...keys].sort(cmp).slice(0, MET_CAPS.records)
    const natural = keys.map((_, i) => i)
    const rand = mulberry(20_261_026)
    const orders: number[][] = [natural, [...natural].reverse()]
    for (let n = 0; n < 8; n++) orders.push(shuffled(natural, rand))
    expect(orders).toHaveLength(10)
    let first = ''
    for (const [n, order] of orders.entries()) {
      const g = game()
      for (const i of order) touchMet(g, keys[i]!, undefined, undefined, ids[i]!)
      expect(keysOf(g), `order ${n}`).toEqual(want)
      expect(recordsOf(g)).toHaveLength(MET_CAPS.records)
      const text = json(readMet(g))
      if (n === 0) first = text
      else expect(text, `order ${n}`).toBe(first)
      expectValid(g)
    }
  })

  it('does the same at 100 times the cap: 40,000 touches, shuffled and in order, leave the 400 smallest keys, valid and inside the node bound', () => {
    reset()
    const g0 = game()
    const keys = Array.from({ length: FLOOD }, (_, i) => floodSid(i))
    const ids = keys.map((k, i) => identityOf(g0, k, i))
    const want = [...keys].sort(cmp).slice(0, MET_CAPS.records)
    const natural = keys.map((_, i) => i)
    let first = ''
    for (const [n, order] of [shuffled(natural, mulberry(7_171)), natural].entries()) {
      const g = game()
      for (const i of order) touchMet(g, keys[i]!, undefined, undefined, ids[i]!)
      expect(keysOf(g), `order ${n}`).toEqual(want)
      const text = json(readMet(g))
      if (n === 0) first = text
      else expect(text).toBe(first)
      expectValid(g)
      expect(nodeCount(readMet(g), 10_000_000)).toBeLessThanOrEqual(10_401)
    }
  }, 60_000)

  it('without an identity the survivors are still the same keys in every order, with the same fields besides the names, and 400 different names', () => {
    reset()
    const keys = Array.from({ length: SMALL }, (_, i) => floodSid(i * 31))
    const want = [...keys].sort(cmp).slice(0, MET_CAPS.records)
    const natural = keys.map((_, i) => i)
    const rand = mulberry(7_171)
    let base: MetShard | null = null
    for (const order of [natural, [...natural].reverse(), shuffled(natural, rand)]) {
      const g = game()
      for (const i of order) touchMet(g, keys[i]!)
      expect(keysOf(g)).toEqual(want)
      const shard = readMet(g)
      if (base === null) base = shard
      else {
        for (const k of want) {
          const a = shard[k] as MetRecord
          const b = base[k] as MetRecord
          expect([a.g, a.b, a.c, a.a, a.y, a.s], k).toEqual([b.g, b.b, b.c, b.a, b.y, b.s])
        }
      }
      // One name is not two people, at scale: the 400 survivors hold 400 different names.
      const names = new Set(want.map((k) => `${(shard[k] as MetRecord).f}|${(shard[k] as MetRecord).l}`.toLowerCase()))
      expect(names.size).toBe(MET_CAPS.records)
      expectValid(g)
    }
  }, 60_000)

  it('keeps every kind of protection through the flood and the idle sweep: each stake bit, an obligation, a grudge, a Person, a holder, a protector', () => {
    reset()
    const g = game()
    const big = (n: number): string => makeSid({ kind: 'tch', place: 'zz', cohort: 2390, ord: n })
    // The protected ones have the largest keys and no other claim: the first the rank would let go.
    const guarded: [string, Partial<MetRecord>][] = [
      [big(1), { fl: 1 }],
      [big(2), { fl: 2 }],
      [big(3), { fl: 4 }],
      [big(4), { fl: 8 }],
      [big(5), { fl: 16 }],
      [big(6), { fl: 32 }],
      [big(7), { ob: -5 }],
      [big(8), { gr: 25 }],
      [big(9), {}],
      [big(10), {}],
      [big(11), {}],
    ]
    for (const [i, [key]] of guarded.entries()) expect(touchMet(g, key, undefined, undefined, identityOf(g, key, i)), key).toBe(true)
    for (const [key, over] of guarded) if (Object.keys(over).length > 0) markMet(g, key, over)
    g.people.push(person('p1', { data: { sid: big(9) } }))
    holds(g, big(10))
    HELD.add(big(11))
    const flood = Array.from({ length: FLOOD }, (_, i) => floodSid(i))
    for (const [i, key] of flood.entries()) touchMet(g, key, undefined, undefined, identityOf(g, key, i))
    for (const [key] of guarded) expect(metRecord(g, key), key).not.toBeNull()
    expect(recordsOf(g)).toHaveLength(MET_CAPS.records)
    expectValid(g)
    // Ten years later, nobody seen: the idle sweep keeps them all, in the form their claim allows.
    g.year = YEAR + 10
    sweepMet(g)
    for (const [key, over] of guarded.slice(0, 8)) {
      const t = metTomb(g, key)
      expect(t, key).not.toBeNull()
      expect([t![3], t![2], t![1]]).toEqual([over.fl ?? 0, over.ob ?? 0, over.gr ?? 0])
    }
    for (const key of [big(9), big(10), big(11)]) expect(metRecord(g, key), key).not.toBeNull()
    expectValid(g)
  }, 120_000)

  it('holds the caps at 100 times: records, tombstones and nodes stay inside them after 20,000 tombstonings and touches that carry an obligation', () => {
    reset()
    const g = game()
    for (let i = 0; i < FLOOD; i++) {
      const key = floodSid(i)
      if (i % 4 === 0) {
        g.people.push(person(`p${i}`, { firstName: `Ann${i % 50}`, lastName: `Lee${i % 70}` }))
        tombstoneMet(g, `p${i}`, { ob: 1 + (i % 90) })
        g.people.pop()
      } else if (i % 4 === 1) touchMet(g, key, { ob: 1 })
    }
    expect(tombsOf(g).length).toBeLessThanOrEqual(MET_CAPS.tombs)
    expect(recordsOf(g).length).toBeLessThanOrEqual(MET_CAPS.records)
    expectValid(g)
  }, 120_000)
})

// ---------------------------------------------------------------------------------------------------------------------------
// The sweep
// ---------------------------------------------------------------------------------------------------------------------------

describe('sweepMet', () => {
  it('drops an idle plain record and folds its account, tombstones an idle record held by its own stake, and keeps the rest', () => {
    reset()
    const idle = YEAR - 6
    const g = seed(game(), [
      [sidOf(1), rec(1, { s: idle })],
      [sidOf(2), rec(2, { s: idle, ob: 12 })],
      [sidOf(3), rec(3, { s: idle })],
      [sidOf(4), rec(4, { s: idle, fl: 2 })],
      [sidOf(5), rec(5, { s: YEAR - 5 })],
      [sidOf(6), rec(6, { s: YEAR })],
      [sidOf(7), rec(7, { s: idle })],
      [sidOf(8), rec(8, { s: idle })],
    ])
    g.people.push(person('p3', { data: { sid: sidOf(3) } }))
    holds(g, sidOf(4))
    HELD.add(sidOf(7))
    book(g, 'gift', 'pool:family', `person:${sidOf(1)}` as never, 90)
    const hh = acctBalance(g, counterparty('hh', 'us') as never)
    const sum = booked(g)
    expect(sweepMet(g)).toBe(3)
    expect(entry(g, sidOf(1))).toBeUndefined()
    expect(metTomb(g, sidOf(2))).toEqual([idle, 0, 12, 0, 'Ida2', 'Quist2', packGb(1962, 0)])
    for (const i of [3, 4, 5, 6, 7]) expect(metRecord(g, sidOf(i)), `record ${i}`).not.toBeNull()
    expect(entry(g, sidOf(8))).toBeUndefined()
    expect(acctBalance(g, counterparty('hh', 'us') as never) - hh).toBe(90)
    expect(booked(g)).toBe(sum)
    expect(checkLedger(g).ok).toBe(true)
    expectValid(g)
  })

  it('counts records that left the record list: the dropped and the tombstoned, not the tombstones that aged out', () => {
    reset()
    const g = seed(game(), [
      [sidOf(1), rec(1, { s: YEAR - 9 })],
      [sidOf(2), rec(2, { s: YEAR - 9, ob: 1 })],
      [sidOf(3, 'actor'), tomb(3, { 0: YEAR - 30 })],
    ])
    expect(sweepMet(g)).toBe(2)
    expect(keysOf(g)).toEqual([sidOf(2)])
  })

  it('ages out a tombstone only at obligation 0, grudge under 20, no flag and 20 years old; one held by a Person or a protector stays', () => {
    reset()
    const old = YEAR - MET_RULES.tombYears
    const g = seed(game(), [
      [sidOf(1, 'actor'), tomb(1, { 0: old })],
      [sidOf(2, 'actor'), tomb(2, { 0: old + 1 })],
      [sidOf(3, 'actor'), tomb(3, { 0: old, 1: 19 })],
      [sidOf(4, 'actor'), tomb(4, { 0: old, 1: 20 })],
      [sidOf(5, 'actor'), tomb(5, { 0: old, 2: 1 })],
      [sidOf(6, 'actor'), tomb(6, { 0: old, 2: -1 })],
      [sidOf(7, 'actor'), tomb(7, { 0: old, 3: 8 })],
      [sidOf(8, 'actor'), tomb(8, { 0: old })],
      [sidOf(9, 'actor'), tomb(9, { 0: old })],
      ['p55', tomb(10, { 0: old - 40 })],
    ])
    HELD.add(sidOf(8, 'actor'))
    g.people.push(person('p9', { alive: false, data: { sid: sidOf(9, 'actor') } }))
    expect(sweepMet(g)).toBe(0)
    expect(keysOf(g)).toEqual([sidOf(2, 'actor'), sidOf(4, 'actor'), sidOf(5, 'actor'), sidOf(6, 'actor'), sidOf(7, 'actor'), sidOf(8, 'actor'), sidOf(9, 'actor')].sort(cmp))
    // The grudge of 19 is under 20: that one is dropped too, after the same 20 years.
    expect(entry(g, sidOf(3, 'actor'))).toBeUndefined()
    expect(entry(g, 'p55')).toBeUndefined()
    expectValid(g)
  })

  it('is a fixed point of the year: a second run returns 0 and changes nothing', () => {
    reset()
    const g = seed(game(), [
      [sidOf(1), rec(1, { s: YEAR - 9 })],
      [sidOf(2), rec(2, { s: YEAR - 9, fl: 2 })],
      [sidOf(3), rec(3, { s: YEAR - 9, fl: 2 })],
      [sidOf(4, 'actor'), tomb(4, { 0: YEAR - 40 })],
    ])
    expect(sweepMet(g)).toBe(3)
    const once = json(g)
    const root = readWorld(g).met
    expect(sweepMet(g)).toBe(0)
    expect(json(g)).toBe(once)
    expect(readWorld(g).met).toBe(root)
  })

  it('is a fixed point when the tombstone list is full and a record has to stay a record', () => {
    reset()
    const tombs = Array.from({ length: MET_CAPS.tombs }, (_, i) => [sidOf(i, 'actor'), tomb(i, { 2: 5 })] as const)
    const g = seed(game(), [[sidOf(1), rec(1, { s: YEAR - 9, ob: 4 })], [sidOf(2), rec(2, { s: YEAR - 9 })], ...tombs])
    expect(sweepMet(g)).toBe(1)
    expect(metRecord(g, sidOf(1))).not.toBeNull()
    const once = json(g)
    expect(sweepMet(g)).toBe(0)
    expect(json(g)).toBe(once)
  })

  it('does nothing for a life with no Met shard: returns 0, makes no world, writes nothing', () => {
    reset()
    const g = game()
    const before = json(g)
    expect(sweepMet(g)).toBe(0)
    expect(g.world).toBeUndefined()
    expect(json(g)).toBe(before)
    ensureWorld(g)
    const withWorld = json(g)
    expect(sweepMet(g)).toBe(0)
    expect(json(g)).toBe(withWorld)
    expect('met' in readWorld(g)).toBe(false)
  })

  it('does not write an empty or all-fresh shard: the root stays the same object', () => {
    reset()
    const g = seed(game(), [[sidOf(1), rec(1)], [sidOf(2), rec(2, { s: YEAR - 5 })]])
    const root = readWorld(g).met
    expect(sweepMet(g)).toBe(0)
    expect(readWorld(g).met).toBe(root)
  })
})

describe('lodSweep runs the Met sweep', () => {
  it('calls sweepMet once a year inside the stamp of lod.y, and counts the records that left', () => {
    reset()
    const g = seed(game(), [[sidOf(1), rec(1, { s: YEAR - 9 })], [sidOf(2), rec(2, { s: YEAR - 9, ob: 3 })], [sidOf(3), rec(3)]])
    const demoted = lodShard(g).demoted
    expect(lodSweep(g)).toBe(2)
    expect(lodShard(g).demoted - demoted).toBe(2)
    expect(lodShard(g).y).toBe(YEAR)
    expect(keysOf(g)).toEqual([sidOf(2), sidOf(3)].sort(cmp))
    const once = json(g.world)
    expect(lodSweep(g)).toBe(0)
    expect(json(g.world)).toBe(once)
    expectValid(g)
  })

  it('writes nothing to the Met shard of a life that has none, and leaves the world without a met key', () => {
    reset()
    const g = game()
    lodSweep(g)
    expect('met' in readWorld(g)).toBe(false)
    expect(lodShard(g).y).toBe(YEAR)
  })

  it('leaves a life with no Met shard byte for byte as it was after five years of ageUp: no met key, and sweepMet adds nothing', () => {
    reset()
    const run = (): GameState => {
      const g = makeTestGame(3, { age: 40, money: 50_000 })
      g.year = 2029
      for (let n = 0; n < 5; n++) {
        ageUp(g)
        expect('met' in readWorld(g), `year ${g.year}`).toBe(false)
      }
      return g
    }
    const a = run()
    const b = run()
    expect(json(a)).toBe(json(b))
    expect(a.year).toBe(2034)
    const before = json(a)
    expect(sweepMet(a)).toBe(0)
    expect(json(a)).toBe(before)
    expect(lodShard(a).y).toBe(2034)
  }, 60_000)

  it('runs inside ageUp: a hand-made shard loses its idle plain record in the year it turns idle', () => {
    reset()
    const g = makeTestGame(3, { age: 40, money: 50_000 })
    g.year = 2029
    seed(g, [[sidOf(1), rec(1, { s: 2023 })], [sidOf(2), rec(2, { s: 2025 })]])
    ageUp(g)
    expect(g.year).toBe(2030)
    expect(entry(g, sidOf(1))).toBeUndefined()
    expect(entry(g, sidOf(2))).toBeDefined()
    ageUp(g)
    expect(entry(g, sidOf(2))).toBeUndefined()
  }, 60_000)
})

// ---------------------------------------------------------------------------------------------------------------------------
// A tombstone round trip
// ---------------------------------------------------------------------------------------------------------------------------

describe('a person who is let go and met again', () => {
  it('has the same name after the sweep made a tombstone of the record and a later touch woke it', () => {
    reset()
    const g = game()
    const key = sidOf(21, 'pol', 'us')
    expect(touchMet(g, key, { ob: 8, w: 5 })).toBe(true)
    const first = metRecord(g, key)!
    expect(first.ob).toBe(8)
    g.year = YEAR + 12
    expect(sweepMet(g)).toBe(1)
    expect(metRecord(g, key)).toBeNull()
    expect(touchMet(g, key)).toBe(true)
    const again = metRecord(g, key)!
    expect([again.f, again.l, again.g, again.b, again.ob, again.c]).toEqual([first.f, first.l, first.g, first.b, first.ob, first.c])
    expect(again.a).toEqual(first.a)
    expect(again.s).toBe(YEAR + 12)
    expectValid(g)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// Frozen shards, purity and the draw
// ---------------------------------------------------------------------------------------------------------------------------

describe('a hostile state', () => {
  it('is read and swept without a throw: people that are no objects, a junk holdings shard, a year that is no number', () => {
    reset()
    const g = seed(game(), [[sidOf(1), rec(1, { s: YEAR - 9 })], [sidOf(2), rec(2)]])
    g.people.push(null as never, 7 as never, { id: 5, data: 3 } as never, person('p8', { data: { sid: 41 as never } }))
    ensureWorld(g).holdings = 'junk' as never
    expect(isProtected(g, sidOf(1))).toBe(false)
    expect(isProtected(g, 'p8')).toBe(true)
    expect(salienceOf(g, sidOf(1))).toBe(0)
    expect(sweepMet(g)).toBe(1)
    expect(entry(g, sidOf(1))).toBeUndefined()
    const before = json(g.world)
    ;(g as { year: number }).year = Number.NaN
    expect(touchMet(g, sidOf(3))).toBe(false)
    expect(tombstoneMet(g, sidOf(2), { ob: 1 })).toBe(false)
    expect(sweepMet(g)).toBe(0)
    expect(json(g.world)).toBe(before)
    // An explicit let-go does not need the year: the record leaves, and a stake keeps its last seen.
    expect(evictMet(g, sidOf(2), 'idle')).toBe('dropped')
  })

  it('reads a shard written around the writer: unsorted keys, a junk entry and a record over the cap come back cleaned, and a touch works on it', () => {
    reset()
    const g = game()
    ensureWorld(g).met = { [sidOf(9)]: rec(9), [sidOf(2)]: 'junk', [sidOf(5)]: rec(5, { gr: 1e300 }) } as never
    expect(touchMet(g, sidOf(7))).toBe(true)
    expect(keysOf(g)).toEqual([sidOf(5), sidOf(7), sidOf(9)].sort(cmp))
    expect(metRecord(g, sidOf(5))!.gr).toBe(100)
    expectValid(g)
  })
})

describe('every write runs on a deep-frozen shard', () => {
  function frozen(): GameState {
    const g = game()
    const raw = Object.fromEntries(
      [
        [sidOf(1), rec(1, { s: YEAR - 9 })],
        [sidOf(2), rec(2, { s: YEAR - 9, fl: 2 })],
        [sidOf(3), rec(3)],
        [sidOf(4, 'actor'), tomb(4, { 0: YEAR - 30 })],
        [sidOf(5, 'actor'), tomb(5, { 2: 9 })],
      ].sort((a, b) => cmp(a[0] as string, b[0] as string)),
    )
    ensureWorld(g).met = deepFreeze(raw) as never
    return g
  }

  it('touchMet, markMet, evictMet, tombstoneMet and sweepMet replace the root and never edit it', () => {
    reset()
    for (const op of [
      (g: GameState) => touchMet(g, sidOf(3), { w: 3 }),
      (g: GameState) => touchMet(g, sidOf(30, 'kin')),
      (g: GameState) => touchMet(g, sidOf(5, 'actor')),
      (g: GameState) => markMet(g, sidOf(3), { fl: 2 }),
      (g: GameState) => markMet(g, sidOf(5, 'actor'), { fl: 2 }),
      (g: GameState) => evictMet(g, sidOf(1), 'idle'),
      (g: GameState) => evictMet(g, sidOf(2), 'idle'),
      (g: GameState) => tombstoneMet(g, sidOf(3), { ob: 4 }),
      (g: GameState) => sweepMet(g),
    ]) {
      const g = frozen()
      const root = readWorld(g).met
      const before = json(root)
      expect(() => op(g)).not.toThrow()
      expect(json(root)).toBe(before)
      expect(Object.isFrozen(root)).toBe(true)
      expectValid(g)
    }
  })
})

describe('every read and every write leaves the luck alone', () => {
  it('reads (isProtected, salienceOf) on a deep-frozen state leave g.rng, g.nextId and g.world as they were', () => {
    reset()
    const g = trapRng(seed(game(), [[sidOf(1), rec(1, { w: 2 })]]))
    g.people.push(person('p1', { data: { sid: sidOf(1) } }))
    holds(g, sidOf(1))
    deepFreeze(g)
    const rng = g.nextId
    const world = json(g.world)
    expect(() => {
      isProtected(g, sidOf(1))
      isProtected(g, 'p1')
      salienceOf(g, sidOf(1))
    }).not.toThrow()
    expect(g.nextId).toBe(rng)
    expect(json(g.world)).toBe(world)
  })

  it('writes (touch, mark, tombstone, evict, sweep) draw nothing and take no id: g.rng is trapped, g.nextId is the same', () => {
    reset()
    const g = trapRng(seed(game(), [[sidOf(1), rec(1, { s: YEAR - 9, ob: 2 })], [sidOf(2), rec(2, { s: YEAR - 9 })]]))
    const id = g.nextId
    expect(() => {
      touchMet(g, sidOf(3))
      touchMet(g, sidOf(4), { w: 2 }, 'jp')
      markMet(g, sidOf(3), { fl: 2 })
      tombstoneMet(g, sidOf(3), { ob: 2 })
      evictMet(g, sidOf(4), 'cap')
      sweepMet(g)
    }).not.toThrow()
    expect(g.nextId).toBe(id)
  })
})

// Registered last: the registry is module-wide, and these two ids stay for the rest of the file, so no earlier case pays for them.
describe('the same id again', () => {
  it('throw for the same id with another function; the same function again is fine', () => {
    reset()
    const fn = (): string[] => []
    registerProtector('test.twice', fn)
    expect(() => registerProtector('test.twice', fn)).not.toThrow()
    expect(() => registerProtector('test.twice', () => [])).toThrow()
    const sal = (): number => 0
    registerSalience('test.twice', sal)
    expect(() => registerSalience('test.twice', sal)).not.toThrow()
    expect(() => registerSalience('test.twice', () => 1)).toThrow()
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// The file and the docs
// ---------------------------------------------------------------------------------------------------------------------------

describe('the file world/met-ops.ts', () => {
  const src = readFileSync(join(ROOT, FILE), 'utf8')
  const code = src.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*')).join('\n')

  it('draws no number and reads no clock: no g.rng, rand, pick, Math.random, Date, performance or stream', () => {
    expect(code).not.toMatch(/\bg\.rng\b|\brand\(|\bpick\(|\bchance\(|\brandInt\(|Math\.random|\bDate\b|performance\.now|\bstream\(|outcomeStream|nextId/)
  })

  it('compares keys by code unit: no localeCompare, no Intl', () => {
    expect(code).not.toMatch(/localeCompare|Intl\./)
  })

  it('has no long dash', () => {
    expect(DASH.test(src)).toBe(false)
  })

  it('imports the index (world/people is not imported: personKey is the kernel rule), holdings and the kernel, never lod.ts and never the root people.ts', () => {
    const imports = [...src.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]!)
    for (const from of imports) {
      expect(from, from).toMatch(/^\.\/|^\.\.\/kernel\/|^\.\.\/types$/)
      expect(from, from).not.toBe('./lod')
      expect(from, from).not.toBe('../people')
    }
    expect(imports).toContain('./holdings')
  })

  it('is named in docs/WORLD.md and docs/PEOPLE.md, which keep their dashes out', () => {
    const world = readFileSync(join(ROOT, 'docs/WORLD.md'), 'utf8')
    const people = readFileSync(join(ROOT, 'docs/PEOPLE.md'), 'utf8')
    for (const name of ['touchMet', 'markMet', 'evictMet', 'tombstoneMet', 'sweepMet', 'registerProtector', 'registerSalience']) {
      expect(people, name).toContain(name)
    }
    for (const name of ['sweepMet', 'tombstone']) expect(world, name).toContain(name)
    expect(DASH.test(world)).toBe(false)
    expect(DASH.test(people)).toBe(false)
  })
})
