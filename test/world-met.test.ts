// ci: fast
// R4-S4 (D.1 c): the Met shard, g.world.met (src/game/world/met.ts). Who the player has met, as a plain object keyed by sid: a record
// for a person who is still met, a tombstone (an array of seven) for one who is only owed or remembered. This task ships the shard,
// its total reader, its one writer and its problems list, and nothing in a played life calls the writer.
//
// What the file proves, in the order of the plan: the reader is total and bounded (twelve hostile shards, ranges, caps and the cut
// that keeps protected entries first), a valid shard comes back as itself, keys sort by code unit as the entity codec needs, the
// writer replaces the root only when something changed and keeps untouched entries by identity, every read leaves the state alone,
// the problems list names each fault, and a world with the shard at its caps stays under the budget P2 set.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { defineSlice } from '../src/game/kernel/slices'
import { encodeSave, resetCodecCachesForTests } from '../src/game/save-codec'
import { SAVE_SCHEMA } from '../src/game/save-schema'
import type { GameState, Person } from '../src/game/types'
import { WORLD_BUDGET, worldBudget } from '../src/game/world/budget'
import { MET_CAPS, WORLD_KEEP_LAST, WORLD_NODE_CAP } from '../src/game/world/caps'
import { worldProblems } from '../src/game/world/invariants'
import { isTomb, metKinds, metProblems, metRecord, metTomb, normalizeMet, packGb, readMet, unpackGb, writeMet, type MetRecord, type MetShard, type Tomb } from '../src/game/world/met'
import '../src/game/world/shards'
import { SID_KINDS, makeSid, type SidKind } from '../src/game/world/sid'
import { nodeCount, normalizeWorld, readWorld, registerShard, shardNames } from '../src/game/world/state'
import { trapRng } from './effort-kit'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const FILE = 'src/game/world/met.ts'
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)

type Rec = Record<string, unknown>

// ---------------------------------------------------------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------------------------------------------------------

const FIRSTS = ['Maribel', 'Okonkwo', 'Takeshi', 'Ingrid', 'Rashid', 'Bao', 'Odalys', 'Lennart']
const LASTS = ['Okonkwo-Reyes', 'Nakamura', 'Lindqvist', 'Abdelrahman', 'Castellanos', 'Whitfield']

/** A valid record with nothing held on it: no flag, no obligation, no grudge. Fields are given to `over`. */
function rec(i: number, over: Partial<MetRecord> = {}): MetRecord {
  return { f: FIRSTS[i % 8]!, l: LASTS[i % 6]!, g: (i % 2) as 0 | 1, b: 1950 + (i % 60), c: 'us', k: i % 9, a: [50, 40, 60, 30, 70], y: 2000 + (i % 30), s: 2030 + (i % 20), w: i % 10, fl: 0, gr: 0, ob: 0, ...over }
}

/** A record that uses all 22 of its nodes: the optional died year, role tag and job ref are there. */
function full(i: number, over: Partial<MetRecord> = {}): MetRecord {
  return rec(i, { d: 2060, r: 'banker', j: `firm:f${1000 + i}`, ...over })
}

/** A valid tombstone: year, grudge, obligation, flags, first, last, gb (born * 2 + gender). */
function tomb(i: number, over: Partial<Record<number, unknown>> = {}): Tomb {
  const t: unknown[] = [2040 + (i % 20), 0, 0, 0, FIRSTS[i % 8], LASTS[i % 6], packGb(1950 + (i % 60), (i % 2) as 0 | 1)]
  for (const [at, v] of Object.entries(over)) t[Number(at)] = v
  return t as unknown as Tomb
}

/** The sid of the i-th person of a flood: 40,000 distinct ones (the place carries the thousands). */
const floodSid = (i: number): string => makeSid({ kind: 'cls', place: `p${Math.floor(i / 10_000)}`, cohort: 1850 + (i % 500), ord: i % 10_000 })
const sidOf = (i: number, kind: SidKind = 'cls', place = 'us'): string => makeSid({ kind, place, cohort: 1950 + (i % 60), ord: i })

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** An object of the entries in ascending key order (plain code-unit order). */
function ascending(entries: readonly (readonly [string, unknown])[]): Rec {
  return Object.fromEntries([...entries].sort((a, b) => cmp(a[0], b[0])))
}

/** The worst case of the plan: 400 records of 22 nodes, 200 tombstones of 8 and the map root: 10,401 nodes. */
function worstShard(): MetShard {
  const entries: [string, unknown][] = []
  for (let i = 0; i < MET_CAPS.records; i++) entries.push([sidOf(i, 'cls'), full(i)])
  for (let i = 0; i < MET_CAPS.tombs; i++) entries.push([sidOf(i, 'actor'), tomb(i)])
  return ascending(entries) as MetShard
}

const nodes = (x: unknown): number => nodeCount(x, 10_000_000)
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T
const json = (x: unknown): string => JSON.stringify(x)

/** How many records and tombstones a shard holds. */
function counts(s: Rec): { records: number; tombs: number } {
  const values = Object.values(s)
  const tombs = values.filter((v) => Array.isArray(v)).length
  return { records: values.length - tombs, tombs }
}

/** A state with a world holding this raw shard under `met`, as a hostile save would hold it. */
function withMet(raw: unknown, over: Rec = {}): GameState {
  const g = makeTestGame(7, { age: 40, money: 50_000 })
  ;(g as { world?: unknown }).world = { v: 1, met: raw, ...over }
  return g
}

const STATS = { happiness: 50, health: 50, smarts: 50, looks: 50 }
function person(id: string, relation: Person['relation'], data: Person['data'] = {}, alive = true): Person {
  return { id, firstName: 'Ann', lastName: 'Lee', gender: 'female', age: 40, alive, relation, relationship: 50, stats: { ...STATS }, money: 0, occupation: 'Unemployed', traits: [], yearsKnown: 3, livesWithPlayer: false, notes: [], data }
}

/** What every shard the reader returns must be: a plain object, keys ascending by code unit, inside the caps and the node bound. */
function expectValid(out: unknown): asserts out is MetShard {
  expect(out !== null && typeof out === 'object' && !Array.isArray(out)).toBe(true)
  expect(Object.getPrototypeOf(out)).toBe(Object.prototype)
  const keys = Object.keys(out as Rec)
  expect(keys).toEqual([...keys].sort())
  const n = counts(out as Rec)
  expect(n.records).toBeLessThanOrEqual(MET_CAPS.records)
  expect(n.tombs).toBeLessThanOrEqual(MET_CAPS.tombs)
  expect(nodes(out)).toBeLessThanOrEqual(10_401)
  expect(metProblems(out)).toEqual([])
  expect(normalizeMet(out)).toBe(out)
}

// ---------------------------------------------------------------------------------------------------------------------------
// The contract
// ---------------------------------------------------------------------------------------------------------------------------

describe('the caps and the registration', () => {
  it('states the caps of the plan: 400 records, 200 tombstones, 5,000 scanned, 24 nodes a record, a key of 40', () => {
    expect(MET_CAPS).toEqual({ records: 400, tombs: 200, scan: 5000, nodes: 24, key: 40 })
  })

  it('registers the shard as met, in the keep-last class of the over-cap order, and a second registration with another reader throws', () => {
    expect(shardNames()).toContain('met')
    expect(WORLD_KEEP_LAST).toContain('met')
    expect(() => registerShard('met', { normalize: (raw) => raw })).toThrow(/already registered/)
  })

  it('reads a stored shard through the reader: the world root a load or a restore passes holds the cleaned shard', () => {
    const hostile = ascending([[sidOf(1), rec(1, { gr: 1e300 })], ['out.Ann.Lee', rec(2)]])
    const out = normalizeWorld({ v: 1, met: hostile }).met as MetShard
    expect(Object.keys(out)).toEqual([sidOf(1)])
    expect((out[sidOf(1)] as MetRecord).gr).toBe(100)
    expect(json(readMet(withMet(hostile)))).toBe(json(out))
  })

  it('has no met key until a writer runs: an absent shard reads as the empty one and the world is not made', () => {
    const g = makeTestGame(7)
    expect(readMet(g)).toEqual({})
    expect(g.world).toBeUndefined()
    expect(metRecord(g, sidOf(1))).toBeNull()
    expect(metTomb(g, sidOf(1))).toBeNull()
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// normalizeMet
// ---------------------------------------------------------------------------------------------------------------------------

describe('normalizeMet: a valid shard comes back as itself', () => {
  it('the empty shard, one record, a record with all three optional fields, a tombstone, a legacy tombstone and the worst case', () => {
    const empty = {}
    expect(normalizeMet(empty)).toBe(empty)
    const one = ascending([[sidOf(1), rec(1)]])
    expect(normalizeMet(one)).toBe(one)
    const opt = ascending([[sidOf(2), full(2)]])
    expect(normalizeMet(opt)).toBe(opt)
    const t = ascending([[sidOf(3), tomb(3)], ['p12', tomb(4)]])
    expect(normalizeMet(t)).toBe(t)
    const worst = worstShard()
    expect(normalizeMet(worst)).toBe(worst)
  })

  it('keeps the entries themselves, not copies, and is a fixed point of its own output', () => {
    const raw = ascending([[sidOf(1), rec(1)], [sidOf(2), rec(2, { gr: 500 })]])
    const out = normalizeMet(raw)
    expect(out).not.toBe(raw)
    expect(out[sidOf(1)]).toBe((raw as MetShard)[sidOf(1)])
    expect(normalizeMet(out)).toBe(out)
    expect(json(normalizeMet(clone(out)))).toBe(json(out))
  })

  it('comes back from a JSON round trip equal, keys and all', () => {
    const worst = worstShard()
    const back = normalizeMet(clone(worst))
    expect(json(back)).toBe(json(worst))
  })

  it('works on a deep-frozen shard, valid or not: it reads and never writes', () => {
    const valid = deepFreeze(worstShard())
    expect(normalizeMet(valid)).toBe(valid)
    const hostile = deepFreeze(ascending([[sidOf(1), rec(1, { gr: 500, zzz: 1 } as Partial<MetRecord>)], ['out.Ann.Lee', rec(2)], [sidOf(3), [1, 2, 3]]]))
    const out = normalizeMet(hostile)
    expect(Object.keys(out)).toEqual([sidOf(1)])
    expect((out[sidOf(1)] as MetRecord).gr).toBe(100)
    expect(out[sidOf(1)]).not.toHaveProperty('zzz')
  })
})

describe('normalizeMet: the ranges', () => {
  it('reads a record born in 1760 as itself (a person is born before the life starts) and one born in 1699 or 100001 cut to 1700 and 100000', () => {
    const elder = ascending([[sidOf(1), rec(1, { b: 1760 })], [sidOf(2), rec(2, { b: 1700 })], [sidOf(3), rec(3, { b: 100_000 })]])
    expect(normalizeMet(elder)).toBe(elder)
    const out = normalizeMet(ascending([[sidOf(1), rec(1, { b: 1699 })], [sidOf(2), rec(2, { b: 100_001 })]]))
    expect((out[sidOf(1)] as MetRecord).b).toBe(1700)
    expect((out[sidOf(2)] as MetRecord).b).toBe(100_000)
  })

  it('does not read a record first met, seen or dead in 1850 as itself: y, s and d start at 1900, because a life does', () => {
    for (const field of ['y', 's', 'd'] as const) {
      const raw = ascending([[sidOf(1), full(1, { [field]: 1850 })]])
      const out = normalizeMet(raw)
      expect(out, field).not.toBe(raw)
      expect((out[sidOf(1)] as MetRecord)[field], field).toBe(1900)
    }
    const edge = ascending([[sidOf(1), full(1, { y: 1900, s: 100_000, d: 100_000 })]])
    expect(normalizeMet(edge)).toBe(edge)
  })

  it('cuts the whole numbers into their ranges: k 0..8, w 0..9, fl 0..63, gr 0..100, ob -100..100, axes 0..100, g 0..1', () => {
    const hi = normalizeMet(ascending([[sidOf(1), { ...rec(1), k: 99, w: 99, fl: 99, gr: 1e300, ob: 1e300, g: 7, a: [101, 1e300, 100, 5, 500] }]])) as Record<string, MetRecord>
    expect(hi[sidOf(1)]).toMatchObject({ k: 8, w: 9, fl: 63, gr: 100, ob: 100, g: 1, a: [100, 100, 100, 5, 100] })
    const lo = normalizeMet(ascending([[sidOf(1), { ...rec(1), k: -3, w: -1, fl: -1, gr: -1e300, ob: -1e300, g: -9, a: [-1, -1e300, 0, 5, 50] }]])) as Record<string, MetRecord>
    expect(lo[sidOf(1)]).toMatchObject({ k: 0, w: 0, fl: 0, gr: 0, ob: -100, g: 0, a: [0, 0, 0, 5, 50] })
  })

  it('makes a fraction whole and never stores a minus zero', () => {
    const out = normalizeMet(ascending([[sidOf(1), { ...rec(1), gr: 20.9, ob: -0.5, a: [50.5, 40.2, 60, 30, 70] }]])) as Record<string, MetRecord>
    expect(out[sidOf(1)]).toMatchObject({ gr: 20, a: [50, 40, 60, 30, 70] })
    expect(Object.is(out[sidOf(1)]!.ob, 0)).toBe(true)
  })

  it('drops a record whose number is not a finite number, or whose axes are not exactly five numbers, or whose name or country is no text', () => {
    const bad: Rec[] = [
      { ...rec(1), gr: Number.NaN },
      { ...rec(1), s: Number.POSITIVE_INFINITY },
      { ...rec(1), b: '1950' },
      { ...rec(1), fl: null },
      { ...rec(1), ob: undefined },
      { ...rec(1), a: [50, 40, 60, 30] },
      { ...rec(1), a: [50, 40, 60, 30, 70, 1] },
      { ...rec(1), a: [50, 40, 60, 30, 'x'] },
      { ...rec(1), a: 'abcde' },
      { ...rec(1), f: 5 },
      { ...rec(1), f: '   ' },
      { ...rec(1), l: '' },
      { ...rec(1), c: 'United States' },
      { ...rec(1), c: '' },
    ]
    const entries: [string, unknown][] = bad.map((r, i) => [sidOf(i + 10), r])
    entries.push([sidOf(1), rec(1)])
    const out = normalizeMet(ascending(entries))
    expect(Object.keys(out)).toEqual([sidOf(1)])
  })

  it('trims names to 24 (first) and 32 (last) characters and takes the control characters out', () => {
    const out = normalizeMet(ascending([[sidOf(1), rec(1, { f: '  Ann  ', l: `Le\u0000e\u001f\n\u007f${'x'.repeat(100)}` })], [sidOf(2), rec(2, { f: 'A'.repeat(10_000), l: 'B'.repeat(10_000) })]])) as Record<string, MetRecord>
    expect(out[sidOf(1)]!.f).toBe('Ann')
    expect(out[sidOf(1)]!.l).toBe(`Lee${'x'.repeat(29)}`)
    expect(out[sidOf(2)]!.f).toBe('A'.repeat(24))
    expect(out[sidOf(2)]!.l).toBe('B'.repeat(32))
    // A name at the limit is itself; a name of one character over is cut.
    const edge = ascending([[sidOf(1), rec(1, { f: 'F'.repeat(24), l: 'L'.repeat(32) })]])
    expect(normalizeMet(edge)).toBe(edge)
    const over = normalizeMet(ascending([[sidOf(1), rec(1, { f: 'F'.repeat(25), l: 'L'.repeat(33) })]])) as Record<string, MetRecord>
    expect([over[sidOf(1)]!.f.length, over[sidOf(1)]!.l.length]).toEqual([24, 32])
  })

  it('does not cut a name in the middle of a character made of two code units', () => {
    const face = '\u{1F600}'
    const out = normalizeMet(ascending([[sidOf(1), rec(1, { f: `${'x'.repeat(23)}${face}` })]])) as Record<string, MetRecord>
    expect(out[sidOf(1)]!.f).toBe('x'.repeat(23))
  })

  it('cuts r (a role tag of [a-z][a-z0-9.-]{0,15}) and j (a valid ref of 52 characters at most) and keeps them when they are fine', () => {
    const fine = ascending([[sidOf(1), full(1, { r: 'a', j: 'firm:f1' })], [sidOf(2), full(2, { r: 'banker.us-1', j: `firm:${'x'.repeat(47)}` })]])
    expect(nodes(fine)).toBe(1 + 2 * 22)
    expect(normalizeMet(fine)).toBe(fine)
    const hostile: [string, unknown][] = [
      [sidOf(1), full(1, { r: 'Banker' })],
      [sidOf(2), full(2, { r: '1abc' })],
      [sidOf(3), full(3, { r: 'x'.repeat(17) })],
      [sidOf(4), full(4, { r: 'a b' })],
      [sidOf(5), full(5, { r: 'x'.repeat(10_000) })],
      [sidOf(6), { ...full(6), r: 5 }],
      [sidOf(7), full(7, { j: 'firm' })],
      [sidOf(8), full(8, { j: `firm:${'x'.repeat(48)}` })],
      [sidOf(9), full(9, { j: 'x'.repeat(10_000) })],
      [sidOf(10), full(10, { j: 'Firm:f1' })],
      [sidOf(11), { ...full(11), j: { a: 1 } }],
    ]
    const out = normalizeMet(ascending(hostile)) as Record<string, MetRecord>
    expect(Object.keys(out)).toHaveLength(11)
    // The first six carry a bad role tag and a good job ref, the last five the other way round; the record is kept either way.
    hostile.forEach(([key], i) => {
      expect(out[key], key).toHaveProperty('d', 2060)
      if (i < 6) {
        expect(out[key], key).not.toHaveProperty('r')
        expect(out[key], key).toHaveProperty('j')
      } else {
        expect(out[key], key).toHaveProperty('r', 'banker')
        expect(out[key], key).not.toHaveProperty('j')
      }
    })
  })

  it('leaves d out when it is not a number', () => {
    const out = normalizeMet(ascending([[sidOf(1), { ...rec(1), d: 'dead' }], [sidOf(2), { ...rec(2), d: undefined }]])) as Record<string, MetRecord>
    expect(out[sidOf(1)]).not.toHaveProperty('d')
    expect(out[sidOf(2)]).not.toHaveProperty('d')
  })

  it('drops unknown keys of a record, and a record over 24 nodes', () => {
    const one = normalizeMet(ascending([[sidOf(1), { ...rec(1), zzz: 1 }]])) as Record<string, MetRecord>
    expect(one[sidOf(1)]).not.toHaveProperty('zzz')
    expect(nodes(one[sidOf(1)])).toBe(19)
    // 22 nodes of a full record plus 3 unknown keys is 25; a list of 15 and a nest of 7 are more than 24 too.
    const many = normalizeMet(ascending([[sidOf(1), { ...full(1), x1: 1, x2: 2, x3: 3 }], [sidOf(2), { ...rec(2), junk: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] }], [sidOf(3), { ...rec(3), deep: { a: { b: { c: [1, 2, 3] } } } }]]))
    expect(many).toEqual({})
    // Exactly 24 is allowed: a full record (22) and two unknown keys. The unknown keys are dropped.
    const edge = normalizeMet(ascending([[sidOf(1), { ...full(1), x1: 1, x2: 2 }]])) as Record<string, MetRecord>
    expect(Object.keys(edge)).toEqual([sidOf(1)])
    expect(edge[sidOf(1)]).not.toHaveProperty('x1')
    expect(nodes(edge[sidOf(1)])).toBe(22)
  })

  it('reads a tombstone: year 1900.., grudge 0..100, obligation -100..100, flags 0..63, names 24 and 32, gb = born * 2 + gender', () => {
    expect(packGb(1760, 1)).toBe(3521)
    expect(packGb(1950, 0)).toBe(3900)
    expect(unpackGb(3521)).toEqual({ born: 1760, g: 1 })
    expect(unpackGb(packGb(1700, 0))).toEqual({ born: 1700, g: 0 })
    expect(unpackGb(packGb(100_000, 1))).toEqual({ born: 100_000, g: 1 })
    for (const [b, g] of [[1760, 1], [1950, 0], [2000, 1], [1700, 0], [100_000, 1]] as const) expect(unpackGb(packGb(b, g))).toEqual({ born: b, g })
    const fine = ascending([[sidOf(1), tomb(1, { 6: 3521, 2: -100, 1: 100, 3: 63 })]])
    expect(normalizeMet(fine)).toBe(fine)
    const hostile = normalizeMet(ascending([[sidOf(1), [1850, 1e300, -1e300, 99, 'A'.repeat(100), 'B'.repeat(100), 1e300]], [sidOf(2), [2040, -5, 5.9, -2, ' Ann ', 'Lee', 1]]])) as Record<string, Tomb>
    expect(hostile[sidOf(1)]).toEqual([1900, 100, -100, 63, 'A'.repeat(24), 'B'.repeat(32), 200_001])
    expect(hostile[sidOf(2)]).toEqual([2040, 0, 5, 0, 'Ann', 'Lee', 3400])
  })

  it('drops a tombstone of the wrong length or with a field that is no number or no name', () => {
    const bad: unknown[] = [[], [2040], tomb(1).slice(0, 6), [...tomb(1), 1], [2040, 0, 0, 0, 'Ann', 'Lee', 'x'], [2040, 0, 0, 0, 5, 'Lee', 3900], [2040, 0, 0, 0, 'Ann', '', 3900], ['2040', 0, 0, 0, 'Ann', 'Lee', 3900], [2040, Number.NaN, 0, 0, 'Ann', 'Lee', 3900]]
    const entries: [string, unknown][] = bad.map((t, i) => [sidOf(i + 10), t])
    entries.push([sidOf(1), tomb(1)])
    expect(Object.keys(normalizeMet(ascending(entries)))).toEqual([sidOf(1)])
  })

  it('isTomb says yes to an array of seven (numbers, two names, a number) and no to anything else', () => {
    expect(isTomb(tomb(1))).toBe(true)
    expect(isTomb(rec(1))).toBe(false)
    expect(isTomb([1, 2, 3])).toBe(false)
    expect(isTomb(null)).toBe(false)
    expect(isTomb('abcdefg')).toBe(false)
    expect(isTomb([2040, 0, 0, 0, 5, 'Lee', 3900])).toBe(false)
  })
})

describe('normalizeMet: the keys', () => {
  it('keeps a key that is a sid of the strict grammar, and a legacy p<digits> id only for a tombstone', () => {
    const raw = ascending([
      [sidOf(1), rec(1)],
      [sidOf(2, 'kin'), tomb(2)],
      ['p12', tomb(3)],
      ['p9', rec(4)],
      ['p', tomb(5)],
      ['p1x', tomb(6)],
    ])
    expect(Object.keys(normalizeMet(raw))).toEqual([sidOf(2, 'kin'), sidOf(1), 'p12'].sort())
  })

  it('drops a key that is no sid: out.Ann.Lee, a lenient id such as s77, a ref, an a<n> account, an empty key, and a sid of more than 40 characters', () => {
    const keys = ['out.Ann.Lee', 's77', 'person:cls.us.2004.12', 'a12', '', 'cls.us.2004', 'cls.us.2004.12.3', 'cls.us.2004.012', 'zzz.us.2004.12', 'cls.us.1849.1', 'cls.us.2401.1', 'cls.us.2004.10000', `cls.${'x'.repeat(13)}.2004.1`, 'cls.us.2004.12 ', ' cls.us.2004.12']
    const raw: Rec = {}
    for (const k of keys) raw[k] = rec(1)
    raw[sidOf(1)] = rec(1)
    expect(Object.keys(normalizeMet(ascending(Object.entries(raw))))).toEqual([sidOf(1)])
  })

  it('returns the keys ascending in plain code-unit order, so an upper case place sorts before a lower case one (a < b, never localeCompare)', () => {
    const keys = ['cls.us.2004.1', 'cls.US.2004.1', 'cls.Us.2004.1', 'cls.uS.2004.1', 'cls.a.2004.1', 'cls.B.2004.1', 'cls.b.2004.1', 'actor.us.1985.0', 'kin.jp.1950.10', 'kin.jp.1950.9']
    const raw: Rec = {}
    for (const k of keys) raw[k] = rec(1)
    const out = normalizeMet(raw)
    expect(Object.keys(out)).toEqual([...keys].sort())
    expect(Object.keys(out)).toEqual([...keys].sort((a, b) => cmp(a, b)))
    // The locale order differs, which is the whole reason for the rule.
    expect(Object.keys(out)).not.toEqual([...keys].sort((a, b) => a.localeCompare(b)))
    expect(Object.keys(out).indexOf('cls.US.2004.1')).toBeLessThan(Object.keys(out).indexOf('cls.us.2004.1'))
  })

  it('puts the same entries in the same order whatever order they came in', () => {
    const entries: [string, unknown][] = []
    for (let i = 0; i < 300; i++) entries.push([sidOf(i, SID_KINDS[i % SID_KINDS.length]!, i % 3 === 0 ? 'US' : 'us'), rec(i)])
    const a = json(normalizeMet(Object.fromEntries(entries)))
    const b = json(normalizeMet(Object.fromEntries([...entries].reverse())))
    const c = json(normalizeMet(Object.fromEntries([...entries].sort((x, y) => cmp(y[0], x[0])))))
    expect(b).toBe(a)
    expect(c).toBe(a)
  })

  it('has no __proto__ key and no pollution from a hostile one', () => {
    const raw = JSON.parse(`{"__proto__":{"f":"Evil","l":"Evil","g":1},"constructor":${json(rec(1))},"${sidOf(1)}":${json(rec(1))}}`) as unknown
    const out = normalizeMet(raw)
    expect(Object.keys(out)).toEqual([sidOf(1)])
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype)
    expect(Object.prototype.hasOwnProperty.call(out, '__proto__')).toBe(false)
    expect(({} as Rec).f).toBeUndefined()
    // An inherited field never counts as one of the record's own.
    const inherited = Object.create(rec(1)) as unknown
    expect(Object.keys(normalizeMet({ [sidOf(2)]: inherited }))).toEqual([])
  })
})

describe('normalizeMet: twelve hostile shards read as valid, bounded shards and never throw', () => {
  const flood = (n: number): Rec => {
    const o: Rec = {}
    for (let i = 0; i < n; i++) o[floodSid(i)] = rec(i, { s: 1900 + (i % 200) })
    return o
  }
  const allBadFields = (value: unknown): Rec => {
    const o: Rec = {}
    const fields = ['g', 'b', 'k', 'y', 's', 'w', 'fl', 'gr', 'ob']
    fields.forEach((f, i) => {
      o[sidOf(i)] = { ...rec(i), [f]: value }
    })
    o[sidOf(50)] = { ...rec(50), a: [value, 1, 2, 3, 4] }
    o[sidOf(51)] = [value, value, value, value, 'Ann', 'Lee', value]
    return o
  }
  const HOSTILE: readonly (readonly [string, () => unknown])[] = [
    ['a number', () => 5],
    ['a string', () => sidOf(1)],
    ['an array', () => [rec(1), rec(2), tomb(3)]],
    ['a __proto__ key', () => JSON.parse(`{"__proto__":{"f":"Evil"},"${sidOf(1)}":${json(rec(1))}}`)],
    ['5,000 records', () => flood(5_000)],
    ['40,000 records', () => flood(40_000)],
    ['NaN fields', () => allBadFields(Number.NaN)],
    ['1e300 fields', () => allBadFields(1e300)],
    ['10,000-character strings', () => ({ [sidOf(1)]: rec(1, { f: 'x'.repeat(10_000), l: 'y'.repeat(10_000) }), [sidOf(2)]: full(2, { r: 'r'.repeat(10_000), j: `firm:${'j'.repeat(10_000)}` }), [sidOf(3)]: tomb(3, { 4: 'f'.repeat(10_000), 5: 'l'.repeat(10_000) }) })],
    ['unsorted keys', () => ({ [sidOf(9)]: rec(9), [sidOf(3)]: rec(3), 'cls.US.2004.1': rec(1), [sidOf(1)]: rec(1), p7: tomb(7), [sidOf(8, 'actor')]: tomb(8) })],
    ['a key like out.Ann.Lee', () => ({ 'out.Ann.Lee': rec(1), 'out.Ann.Lee.1.2': rec(2), [sidOf(3)]: rec(3) })],
    ['a tombstone of the wrong length', () => ({ [sidOf(1)]: tomb(1).slice(0, 6), [sidOf(2)]: [...tomb(2), 9], [sidOf(3)]: tomb(3) })],
  ]
  for (const [name, make] of HOSTILE) {
    it(name, () => {
      const out = normalizeMet(make())
      expectValid(out)
    })
  }

  it('also: null, undefined, a boolean, a function, a Date, a Map, a cycle and an object whose reads throw', () => {
    const cycle: Rec = {}
    cycle[sidOf(1)] = cycle
    const trap = new Proxy({}, { get: () => { throw new Error('read') }, ownKeys: () => { throw new Error('keys') }, getOwnPropertyDescriptor: () => { throw new Error('desc') } })
    for (const raw of [null, undefined, true, () => 1, new Date(0), new Map([[sidOf(1), rec(1)]]), cycle, trap, Symbol('x'), 10n]) {
      let out: unknown
      expect(() => { out = normalizeMet(raw) }).not.toThrow()
      expectValid(out)
      expect(Object.keys(out as Rec)).toEqual([])
    }
  })

  it('number, string and array read as the empty shard; the __proto__ shard keeps its one honest record', () => {
    expect(normalizeMet(5)).toEqual({})
    expect(normalizeMet('x')).toEqual({})
    expect(normalizeMet([rec(1)])).toEqual({})
    expect(Object.keys(normalizeMet(HOSTILE[3]![1]()))).toEqual([sidOf(1)])
  })

  it('NaN fields drop every record they sit in, 1e300 fields cut into the ranges and keep them', () => {
    expect(normalizeMet(allBadFields(Number.NaN))).toEqual({})
    const out = normalizeMet(allBadFields(1e300)) as Record<string, MetRecord>
    // Nine records with one field each at 1e300, a tuple with one, and a tombstone with four.
    expect(Object.keys(out)).toHaveLength(11)
    for (const r of Object.values(out).filter((v) => !Array.isArray(v))) {
      expect(r.b).toBeLessThanOrEqual(100_000)
      expect(r.gr).toBeLessThanOrEqual(100)
      expect(r.fl).toBeLessThanOrEqual(63)
      expect(r.a.every((n) => n <= 100)).toBe(true)
    }
    expect(out[sidOf(51)]).toEqual([100_000, 100, 100, 63, 'Ann', 'Lee', 200_001])
  })

  it('10,000-character strings: names cut to 24 and 32, a role tag and a job ref that are no tag and no ref left out', () => {
    const out = normalizeMet(HOSTILE[8]![1]()) as Record<string, MetRecord & Tomb>
    expect(out[sidOf(1)]).toMatchObject({ f: 'x'.repeat(24), l: 'y'.repeat(32) })
    expect(out[sidOf(2)]).not.toHaveProperty('r')
    expect(out[sidOf(2)]).not.toHaveProperty('j')
    expect((out[sidOf(3)] as unknown as Tomb)[4]).toBe('f'.repeat(24))
    expect((out[sidOf(3)] as unknown as Tomb)[5]).toBe('l'.repeat(32))
  })

  it('unsorted keys come back sorted with every entry kept, and a tombstone of the wrong length is the only thing lost', () => {
    const out = normalizeMet(HOSTILE[9]![1]())
    expect(Object.keys(out)).toEqual([sidOf(8, 'actor'), 'cls.US.2004.1', sidOf(1), sidOf(3), sidOf(9), 'p7'].sort())
    expect(Object.keys(normalizeMet(HOSTILE[11]![1]()))).toEqual([sidOf(3)])
    expect(Object.keys(normalizeMet(HOSTILE[10]![1]()))).toEqual([sidOf(3)])
  })

  it('scans at most 5,000 entries: a record behind them is never looked at, however fresh and held', () => {
    const o = flood(6_000)
    const last = floodSid(5_999)
    o[last] = rec(5_999, { s: 100_000, fl: 1, ob: 50 })
    const out = normalizeMet(o)
    expect(Object.keys(out)).not.toContain(last)
    expect(Object.keys(flood(40_000))).toHaveLength(40_000)
    expect(counts(normalizeMet(flood(40_000))).records).toBe(400)
    // A shard of 5,000 entries is all scanned: a held record at the end of it is kept.
    const edge = flood(5_000)
    const held = floodSid(4_999)
    edge[held] = rec(4_999, { s: 1900, fl: 4 })
    expect(Object.keys(normalizeMet(edge))).toContain(held)
  })
})

describe('normalizeMet: the cut keeps protected entries first and then the freshest', () => {
  it('cuts 5,000 records to 400, and a record held by a flag, an obligation or a grudge of 20 survives the flood however old', () => {
    const o: Rec = {}
    for (let i = 0; i < 5_000; i++) o[floodSid(i)] = rec(i, { s: 2000 + (i % 100) })
    const held = [floodSid(10), floodSid(20), floodSid(30), floodSid(40), floodSid(50), floodSid(60)]
    o[held[0]!] = rec(10, { s: 1900, fl: 2 })
    o[held[1]!] = rec(20, { s: 1900, ob: 5 })
    o[held[2]!] = rec(30, { s: 1900, ob: -5 })
    o[held[3]!] = rec(40, { s: 1900, gr: 20 })
    o[held[4]!] = rec(50, { s: 1900, fl: 63 })
    o[held[5]!] = rec(60, { s: 1900, gr: 19 })
    const out = normalizeMet(o)
    expect(counts(out).records).toBe(400)
    for (const k of held.slice(0, 5)) expect(Object.keys(out), k).toContain(k)
    // A grudge of 19 holds nothing: it is the oldest and goes.
    expect(Object.keys(out)).not.toContain(held[5])
    expectValid(out)
  })

  it('keeps the freshest of the rest, ties by key, and gives the same shard for any order the entries came in', () => {
    const entries: [string, unknown][] = []
    for (let i = 0; i < 1_200; i++) entries.push([floodSid(i), rec(i, { s: 1900 + (i % 150) })])
    const a = normalizeMet(Object.fromEntries(entries))
    const orders = [[...entries].reverse(), [...entries].sort((x, y) => cmp(y[0], x[0])), [...entries.slice(600), ...entries.slice(0, 600)]]
    for (const order of orders) expect(json(normalizeMet(Object.fromEntries(order)))).toBe(json(a))
    const kept = Object.values(a) as MetRecord[]
    expect(kept).toHaveLength(400)
    const floor = Math.min(...kept.map((r) => r.s))
    const dropped = entries.filter(([k]) => !(k in a)).map(([, r]) => (r as MetRecord).s)
    expect(Math.max(...dropped)).toBeLessThanOrEqual(floor)
  })

  it('keeps the freshest of the protected when they alone pass the cap', () => {
    const o: Rec = {}
    for (let i = 0; i < 500; i++) o[floodSid(i)] = rec(i, { s: 1900 + i, fl: 1 })
    const out = normalizeMet(o) as Record<string, MetRecord>
    expect(Object.keys(out)).toHaveLength(400)
    expect(Math.min(...Object.values(out).map((r) => r.s))).toBe(2000)
  })

  it('cuts tombstones to 200 on their own, keeping an obligation, a grudge of 20 and a flag first, then the newest year', () => {
    const o: Rec = {}
    for (let i = 0; i < 700; i++) o[floodSid(i)] = tomb(i, { 0: 2000 + (i % 100) })
    const held = [floodSid(5), floodSid(6), floodSid(7)]
    o[held[0]!] = tomb(5, { 0: 1900, 2: -1 })
    o[held[1]!] = tomb(6, { 0: 1900, 1: 20 })
    o[held[2]!] = tomb(7, { 0: 1900, 3: 8 })
    for (let i = 0; i < 150; i++) o[sidOf(i, 'cls')] = rec(i)
    const out = normalizeMet(o)
    expect(counts(out)).toEqual({ records: 150, tombs: 200 })
    for (const k of held) expect(Object.keys(out), k).toContain(k)
    expectValid(out)
  })

  it('never holds more than 10,401 nodes, whatever it was given', () => {
    const o: Rec = {}
    for (let i = 0; i < 5_000; i++) o[floodSid(i)] = i % 3 === 0 ? tomb(i) : full(i)
    expect(nodes(normalizeMet(o))).toBeLessThanOrEqual(10_401)
    expect(nodes(worstShard())).toBe(10_401)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// The entity codec needs ascending keys
// ---------------------------------------------------------------------------------------------------------------------------

describe('keys the entity codec accepts', () => {
  beforeEach(() => resetCodecCachesForTests())
  defineSlice({ key: 'world.testmet', version: 1, chunk: 'entities', entities: { kind: 'testmet', shards: 8 }, caps: { nodes: 1_000_000, chars: 4_000_000 }, normalize: (raw) => normalizeMet(raw), write: 'replace' })
  registerShard('testmet', { normalize: (raw) => normalizeMet(raw) })

  const stateWith = (shard: unknown): GameState => {
    const { version, ...rest } = makeTestGame(1)
    const g = { version, schemaVersion: SAVE_SCHEMA, ...rest } as GameState
    ;(g as { world?: unknown }).world = { testmet: shard }
    return g
  }

  it('encodes a shard of 400 with upper and lower case places into entity chunks and no unsorted entity', () => {
    const entries: [string, unknown][] = []
    for (let i = 0; i < 400; i++) entries.push([makeSid({ kind: 'cls', place: i % 3 === 0 ? 'US' : i % 3 === 1 ? 'us' : 'Us', cohort: 1950 + (i % 60), ord: i }), rec(i)])
    const shard = normalizeMet(Object.fromEntries([...entries].reverse()))
    expect(Object.keys(shard)).toHaveLength(400)
    const e = encodeSave(stateWith(shard))
    expect(e.stats.unsortedEntities).toEqual([])
    const chunks = Object.keys(e.manifest).filter((n) => n.startsWith('e.testmet.'))
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.length).toBeLessThanOrEqual(8)
  })

  it('would have been refused had the keys been put in locale order: the codec compares code units', () => {
    const keys = ['cls.us.2004.1', 'cls.US.2004.1', 'cls.Us.2004.1', 'cls.uS.2004.1']
    const raw: Rec = {}
    for (const k of [...keys].sort((a, b) => a.localeCompare(b))) raw[k] = rec(1)
    expect(encodeSave(stateWith(raw)).stats.unsortedEntities).toEqual(['world.testmet'])
    expect(encodeSave(stateWith(normalizeMet(raw))).stats.unsortedEntities).toEqual([])
  })

  it('changing one record rewrites one entity chunk and leaves the others as they were (the shard keeps untouched entries by identity)', () => {
    const g = withMet(worstShard())
    const before = readWorld(g).met as MetShard
    const key = Object.keys(before).find((k) => !isTomb(before[k]))!
    writeMet(g, { ...before, [key]: { ...(before[key] as MetRecord), s: 2099 } })
    const after = readWorld(g).met as MetShard
    const a = encodeSave(stateWith(before))
    const b = encodeSave(stateWith(after))
    const ids = (e: ReturnType<typeof encodeSave>): Record<string, string> => Object.fromEntries(Object.entries(e.manifest).map(([n, m]) => [n, m.id]))
    const ia = ids(a)
    const ib = ids(b)
    expect(Object.keys(ib)).toEqual(Object.keys(ia))
    expect(Object.keys(ia).filter((n) => ia[n] !== ib[n])).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// The readers
// ---------------------------------------------------------------------------------------------------------------------------

describe('readMet, metRecord, metTomb and metKinds', () => {
  const shard = ascending([
    [sidOf(1, 'cls'), rec(1)],
    [sidOf(2, 'cls'), rec(2)],
    [sidOf(3, 'kin'), full(3)],
    [sidOf(4, 'actor'), tomb(4)],
    [sidOf(5, 'cls'), tomb(5)],
    ['p33', tomb(6)],
  ]) as MetShard

  it('read a record, a tombstone and nothing through their own door', () => {
    const g = withMet(shard)
    expect(metRecord(g, sidOf(1, 'cls'))).toEqual(rec(1))
    expect(metRecord(g, sidOf(4, 'actor'))).toBeNull()
    expect(metTomb(g, sidOf(4, 'actor'))).toEqual(tomb(4))
    expect(metTomb(g, sidOf(1, 'cls'))).toBeNull()
    expect(metTomb(g, 'p33')).toEqual(tomb(6))
    for (const key of ['nobody', '', '__proto__', 'constructor', 'toString', 'hasOwnProperty', sidOf(99)]) {
      expect(metRecord(g, key), key).toBeNull()
      expect(metTomb(g, key), key).toBeNull()
    }
  })

  it('count the records of a sid kind, not the tombstones, with every kind of the table present', () => {
    const kinds = metKinds(withMet(shard))
    expect(Object.keys(kinds)).toEqual([...SID_KINDS])
    expect(kinds.cls).toBe(2)
    expect(kinds.kin).toBe(1)
    expect(kinds.actor).toBe(0)
    expect(Object.values(kinds).reduce((a, b) => a + b, 0)).toBe(3)
    expect(Object.isFrozen(kinds)).toBe(true)
    expect(Object.values(metKinds(makeTestGame(1))).every((n) => n === 0)).toBe(true)
  })

  it('read a deep-frozen state with a trapped g.rng and leave g.rng, g.nextId and g.world as they were', () => {
    const g = deepFreeze(trapRng(withMet(clone(worstShard()))))
    const world = json(g.world)
    const nextId = g.nextId
    for (let i = 0; i < 20; i++) {
      readMet(g)
      metRecord(g, sidOf(i))
      metTomb(g, sidOf(i, 'actor'))
      metKinds(g)
      metProblems(readWorld(g).met, g.people)
    }
    expect(json(g.world)).toBe(world)
    expect(g.nextId).toBe(nextId)
    expect(Object.keys(readMet(g))).toHaveLength(600)
  })

  it('read a hostile stored shard as the cleaned one', () => {
    const g = withMet({ ...shard, 'out.Ann.Lee': rec(1), [sidOf(8)]: { ...rec(8), gr: 1e300 } })
    expect(metRecord(g, sidOf(8))!.gr).toBe(100)
    expect(readMet(g)['out.Ann.Lee']).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// writeMet
// ---------------------------------------------------------------------------------------------------------------------------

describe('writeMet', () => {
  it('writes nothing when the shard is absent and the next one is empty: the world is not made and the key is not added', () => {
    const g = makeTestGame(7)
    writeMet(g, {})
    expect(g.world).toBeUndefined()
    const h = makeTestGame(7)
    ;(h as { world?: unknown }).world = { v: 1 }
    writeMet(h, {})
    expect(h.world).toEqual({ v: 1 })
    expect(Object.keys(readWorld(h))).toEqual(['v'])
  })

  it('makes the world and the shard for a first record, with its keys ascending whatever order they were given', () => {
    const g = makeTestGame(7)
    const next = { [sidOf(9)]: rec(9), 'cls.US.2004.1': rec(1), [sidOf(3)]: rec(3), p4: tomb(4), [sidOf(1)]: rec(1) } as MetShard
    writeMet(g, next)
    const out = readWorld(g).met as MetShard
    expect(Object.keys(out)).toEqual(Object.keys(next).sort())
    expect(metRecord(g, sidOf(9))).toEqual(rec(9))
    expect(metTomb(g, 'p4')).toEqual(tomb(4))
  })

  it('runs on a state whose shard root is deep-frozen: it replaces the root and keeps every untouched entry by identity', () => {
    const g = makeTestGame(7)
    ;(g as { world?: unknown }).world = { v: 1, met: deepFreeze(ascending([[sidOf(1), rec(1)], [sidOf(2), rec(2)], [sidOf(3, 'actor'), tomb(3)]])) }
    const before = readWorld(g).met as MetShard
    writeMet(g, { ...before, [sidOf(2)]: rec(2, { gr: 30 }), [sidOf(0)]: rec(0) })
    const after = readWorld(g).met as MetShard
    expect(after).not.toBe(before)
    expect(Object.keys(after)).toEqual(Object.keys(after).sort())
    expect(Object.keys(after)).toHaveLength(4)
    expect(after[sidOf(1)]).toBe(before[sidOf(1)])
    expect(after[sidOf(3, 'actor')]).toBe(before[sidOf(3, 'actor')])
    expect((after[sidOf(2)] as MetRecord).gr).toBe(30)
    // The old root is what it was.
    expect(Object.keys(before)).toHaveLength(3)
    expect((before[sidOf(2)] as MetRecord).gr).toBe(0)
  })

  it('writes nothing when nothing changed, not even a new root, and an equal copy of an entry is kept as the stored one', () => {
    const g = makeTestGame(7)
    ;(g as { world?: unknown }).world = { v: 1, met: deepFreeze(worstShard()) }
    const before = readWorld(g).met as MetShard
    writeMet(g, { ...before })
    expect(readWorld(g).met).toBe(before)
    writeMet(g, clone(before))
    expect(readWorld(g).met).toBe(before)
    const key = Object.keys(before)[3]!
    const copy = { ...before, [key]: clone(before[key]) } as MetShard
    writeMet(g, copy)
    expect(readWorld(g).met).toBe(before)
  })

  it('removes an entry that is not in the next shard, and writes the empty shard over a full one', () => {
    const g = withMet(ascending([[sidOf(1), rec(1)], [sidOf(2), rec(2)]]))
    const before = readWorld(g).met as MetShard
    writeMet(g, { [sidOf(1)]: before[sidOf(1)]! })
    expect(Object.keys(readWorld(g).met as MetShard)).toEqual([sidOf(1)])
    expect((readWorld(g).met as MetShard)[sidOf(1)]).toBe(before[sidOf(1)])
    writeMet(g, {})
    expect(readWorld(g).met).toEqual({})
    const empty = readWorld(g).met
    writeMet(g, {})
    expect(readWorld(g).met).toBe(empty)
  })

  it('stores a clean shard whatever it is given: a field out of range is cut, a key that is no sid is dropped, the caps hold', () => {
    const g = makeTestGame(7)
    const next: Rec = { [sidOf(1)]: rec(1, { gr: 1e300 }), 'out.Ann.Lee': rec(2) }
    for (let i = 0; i < 450; i++) next[floodSid(i + 10)] = rec(i, { s: 1900 + (i % 100) })
    writeMet(g, next as MetShard)
    const out = readWorld(g).met as MetShard
    expectValid(out)
    expect(counts(out).records).toBe(400)
    expect(Object.keys(out)).not.toContain('out.Ann.Lee')
    // The stored shard is itself a valid one: the reader returns it as it is.
    expect(normalizeMet(out)).toBe(out)
    expect(readMet(g)).toBe(out)
  })

  it('seals what it stores: the root, each record and tombstone, and the axes tuple are frozen', () => {
    const g = makeTestGame(7)
    writeMet(g, ascending([[sidOf(1), full(1)], [sidOf(2), tomb(2)]]) as MetShard)
    const out = readWorld(g).met as MetShard
    expect(Object.isFrozen(out)).toBe(true)
    expect(Object.isFrozen(out[sidOf(1)])).toBe(true)
    expect(Object.isFrozen((out[sidOf(1)] as MetRecord).a)).toBe(true)
    expect(Object.isFrozen(out[sidOf(2)])).toBe(true)
    expect(() => { (out[sidOf(1)] as { gr: number }).gr = 99 }).toThrow(TypeError)
  })

  it('replaces a hostile stored root even when the next shard equals what the reader made of it', () => {
    const g = withMet({ [sidOf(1)]: rec(1), 'out.Ann.Lee': rec(2) })
    writeMet(g, { [sidOf(1)]: rec(1) })
    expect(Object.keys(readWorld(g).met as MetShard)).toEqual([sidOf(1)])
    const h = withMet(5)
    writeMet(h, {})
    expect(readWorld(h).met).toEqual({})
  })

  it('touches no other part of the state: g.rng, g.nextId and the other shards stay', () => {
    const g = trapRng(withMet(ascending([[sidOf(1), rec(1)]]), { people: { v: 1, rows: [], over: 0 } }))
    const nextId = g.nextId
    const people = readWorld(g).people
    writeMet(g, { [sidOf(2)]: rec(2) })
    expect(g.nextId).toBe(nextId)
    expect(readWorld(g).people).toBe(people)
  })

  it('holds a flood of 2,000 writes, a new person each, at 400 records', () => {
    const g = makeTestGame(7)
    let max = 0
    for (let i = 0; i < 2_000; i++) {
      const cur = readMet(g)
      writeMet(g, { ...cur, [floodSid(i)]: rec(i, { s: 1900 + (i % 100) }) })
      max = Math.max(max, Object.keys(readMet(g)).length)
    }
    expect(max).toBeLessThanOrEqual(400)
    expect(counts(readMet(g) as Rec).records).toBe(400)
  }, 60_000)
})

// ---------------------------------------------------------------------------------------------------------------------------
// metProblems
// ---------------------------------------------------------------------------------------------------------------------------

describe('metProblems names every fault of a stored shard', () => {
  const some = (): Rec => ascending([[sidOf(1), full(1)], [sidOf(2), rec(2)], [sidOf(3, 'actor'), tomb(3)], ['p9', tomb(4)]])
  const text = (lines: string[]): string => lines.join('\n')

  it('says nothing about a sound shard, an absent one and the worst case', () => {
    expect(metProblems(some())).toEqual([])
    expect(metProblems(undefined)).toEqual([])
    expect(metProblems({})).toEqual([])
    expect(metProblems(worstShard())).toEqual([])
  })

  it('says a shard that is no plain object is none', () => {
    for (const raw of [5, 'x', [rec(1)], null, new Map()]) expect(text(metProblems(raw)), String(raw)).toMatch(/not a plain object/)
  })

  it('names a bad key: a key that is no sid, and a legacy id on a record', () => {
    expect(text(metProblems({ 'out.Ann.Lee': rec(1) }))).toMatch(/bad key out\.Ann\.Lee/)
    expect(text(metProblems({ 's77': tomb(1) }))).toMatch(/bad key s77/)
    expect(text(metProblems({ p12: rec(1) }))).toMatch(/bad key p12/)
    expect(text(metProblems({ [`cls.${'x'.repeat(100)}`]: rec(1) }))).toMatch(/bad key/)
    expect(text(metProblems({ [sidOf(1)]: 5 }))).toMatch(/: not a record or a tombstone/)
  })

  it('names a field out of its range, a field that is no number, and a name that is too long or has a control character', () => {
    expect(text(metProblems({ [sidOf(1)]: rec(1, { gr: 500 }) }))).toMatch(/: gr 500 is outside 0\.\.100/)
    expect(text(metProblems({ [sidOf(1)]: rec(1, { ob: -101 }) }))).toMatch(/: ob -101 is outside -100\.\.100/)
    expect(text(metProblems({ [sidOf(1)]: rec(1, { b: 1699 }) }))).toMatch(/: b 1699 is outside 1700\.\.100000/)
    expect(text(metProblems({ [sidOf(1)]: rec(1, { s: 1850 }) }))).toMatch(/: s 1850 is outside 1900\.\.100000/)
    expect(text(metProblems({ [sidOf(1)]: rec(1, { fl: 64 }) }))).toMatch(/: fl 64 is outside 0\.\.63/)
    expect(text(metProblems({ [sidOf(1)]: { ...rec(1), gr: Number.NaN } }))).toMatch(/: gr is not a number/)
    expect(text(metProblems({ [sidOf(1)]: rec(1, { f: 'x'.repeat(25) }) }))).toMatch(/: f is not a name of 1 to 24 characters/)
    expect(text(metProblems({ [sidOf(1)]: rec(1, { l: 'a\u0000b' }) }))).toMatch(/: l is not a name of 1 to 32 characters/)
    expect(text(metProblems({ [sidOf(1)]: rec(1, { a: [50, 40, 60, 30] as unknown as MetRecord['a'] }) }))).toMatch(/: a is not five whole numbers/)
    expect(text(metProblems({ [sidOf(1)]: rec(1, { r: 'Banker' }) }))).toMatch(/: r is not a role tag/)
    expect(text(metProblems({ [sidOf(1)]: rec(1, { j: 'firm' }) }))).toMatch(/: j is not a ref/)
    expect(text(metProblems({ [sidOf(1)]: { ...rec(1), f: undefined } }))).toMatch(/: f is not a name/)
  })

  it('names an unknown key and a record over 24 nodes', () => {
    expect(text(metProblems({ [sidOf(1)]: { ...rec(1), zzz: 1 } }))).toMatch(/: unknown key zzz/)
    expect(text(metProblems({ [sidOf(1)]: { ...full(1), x1: 1, x2: 2, x3: 3 } }))).toMatch(/: 25 nodes, more than the 24 allowed/)
  })

  it('names a tombstone of the wrong length and a tombstone field out of range', () => {
    expect(text(metProblems({ [sidOf(1)]: tomb(1).slice(0, 6) }))).toMatch(/: tombstone has 6 entries, not 7/)
    expect(text(metProblems({ [sidOf(1)]: tomb(1, { 1: 101 }) }))).toMatch(/: gr 101 is outside 0\.\.100/)
    expect(text(metProblems({ [sidOf(1)]: tomb(1, { 6: 5 }) }))).toMatch(/: gb 5 is outside 3400\.\.200001/)
    expect(text(metProblems({ [sidOf(1)]: tomb(1, { 4: '' }) }))).toMatch(/: first is not a name of 1 to 24 characters/)
  })

  it('names counts over a cap: 401 records, 201 tombstones, and more entries than the 5,000 scanned', () => {
    const records: Rec = {}
    for (let i = 0; i < 401; i++) records[floodSid(i)] = rec(i)
    expect(text(metProblems(ascending(Object.entries(records))))).toMatch(/401 records, more than the 400 allowed/)
    const tombs: Rec = {}
    for (let i = 0; i < 201; i++) tombs[floodSid(i)] = tomb(i)
    expect(text(metProblems(ascending(Object.entries(tombs))))).toMatch(/201 tombstones, more than the 200 allowed/)
    const big: Rec = {}
    for (let i = 0; i < 5_001; i++) big[floodSid(i)] = rec(i)
    const lines = metProblems(ascending(Object.entries(big)))
    expect(text(lines)).toMatch(/5001 entries, more than the 5000 scanned/)
    expect(lines.length).toBeLessThanOrEqual(80)
  })

  it('names keys that are not in ascending order', () => {
    expect(text(metProblems({ [sidOf(2)]: rec(2), [sidOf(1)]: rec(1) }))).toMatch(/keys are not in ascending order/)
    expect(text(metProblems({ 'cls.us.2004.1': rec(1), 'cls.US.2004.1': rec(1) }))).toMatch(/keys are not in ascending order/)
    expect(text(metProblems(some()))).not.toMatch(/ascending/)
  })

  it('names a living Person whose sid is of the strict grammar and who has no record, or only a tombstone', () => {
    const shard = some()
    const people = [
      person('p1', 'friend', { sid: sidOf(2) }),
      person('p2', 'friend', { sid: sidOf(7) }),
      person('p3', 'friend', { sid: sidOf(3, 'actor') }),
      person('p4', 'friend', { sid: sidOf(8) }, false),
    ]
    const lines = metProblems(shard, people)
    expect(lines).toHaveLength(2)
    expect(text(lines)).toMatch(/person p2 holds sid cls\.us\.\d+\.7 and the shard has no record of it/)
    expect(text(lines)).toMatch(/person p3/)
    expect(text(lines)).not.toMatch(/person p1/)
    expect(text(lines)).not.toMatch(/person p4/)
    // Without a shard at all it is the same fault.
    expect(text(metProblems(undefined, [person('p2', 'friend', { sid: sidOf(7) })]))).toMatch(/person p2/)
  })

  it('asks no record of a person with no sid, a lenient sid such as s77 or a sid that is no text', () => {
    const people = [person('p1', 'friend'), person('p2', 'friend', { sid: 's77' }), person('p3', 'friend', { sid: 's-42' }), person('p4', 'friend', { sid: 5 }), { ...person('p5', 'friend'), data: undefined as unknown as Person['data'] }]
    expect(metProblems(some(), people)).toEqual([])
  })

  it('names a sid on a child, a stepchild or a grandchild, whatever the sid looks like', () => {
    const people = [
      person('c1', 'child', { sid: sidOf(2) }),
      person('c2', 'stepchild', { sid: 's77' }),
      person('c3', 'grandchild', { sid: sidOf(1) }, false),
      person('c4', 'child', {}),
      person('c5', 'spouse', { sid: sidOf(1) }),
    ]
    const lines = metProblems(some(), people)
    expect(text(lines)).toMatch(/person c1 is a child and carries sid/)
    expect(text(lines)).toMatch(/person c2 is a stepchild/)
    expect(text(lines)).toMatch(/person c3 is a grandchild/)
    expect(text(lines)).not.toMatch(/person c4/)
    expect(text(lines)).not.toMatch(/person c5/)
  })

  it('stays bounded on a hostile shard: at most 64 lines', () => {
    const o: Rec = {}
    for (let i = 0; i < 4_000; i++) o[`bad.${i}`] = { gr: 9 }
    expect(metProblems(o).length).toBeLessThanOrEqual(80)
  })

  it('is run by worldProblems, each line starting "met: "', () => {
    const good = withMet(worstShard())
    expect(worldProblems(good, { live: false })).toEqual([])
    const bad = withMet({ 'out.Ann.Lee': rec(1), [sidOf(1)]: rec(1, { gr: 500 }) })
    const lines = worldProblems(bad, { live: false }).filter((l) => l.startsWith('met: '))
    expect(lines.length).toBe(3)
    const orphan = withMet(some())
    orphan.people.push(person('p77', 'friend', { sid: sidOf(70) }))
    expect(worldProblems(orphan, { live: false }).filter((l) => l.startsWith('met: '))).toEqual([expect.stringContaining('person p77')])
    expect(worldProblems(makeTestGame(7), { live: false })).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// The budget
// ---------------------------------------------------------------------------------------------------------------------------

describe('a world with the shard at its caps', () => {
  // The figures this test assumes (read in P2's tests and the plan): the Met shard at its caps is 10,401 nodes, the R2 maximal world
  // is 11,414 (test/world-budget.test.ts), and the frontier at its caps is 3,600. Facts and lod add a little; the whole of R4 is
  // measured there, with edges beside this shard.
  const MET_WORST = 10_401
  const R2_MAXIMAL = 11_414
  const FRONTIER_WORST = 3_600

  it('is 10,401 nodes: 400 records of 22, 200 tombstones of 8 and the map root', () => {
    expect(MET_CAPS.records * 22 + MET_CAPS.tombs * 8 + 1).toBe(MET_WORST)
    expect(nodes(worstShard())).toBe(MET_WORST)
  })

  it('stays under the budget P2 set (WORLD_BUDGET) and the cap (WORLD_NODE_CAP) by itself and beside the R2 maximal world and the frontier', () => {
    const g = withMet(worstShard(), { y: 2030 })
    const b = worldBudget(g)
    expect(b.over).toEqual([])
    expect(b.nodes.met).toBe(MET_WORST)
    expect(b.total).toBeLessThan(WORLD_BUDGET.nodes)
    expect(b.bytes).toBeLessThan(WORLD_BUDGET.bytes)
    expect(b.bytes).toBeLessThan(120_000)
    expect(MET_WORST + R2_MAXIMAL + FRONTIER_WORST).toBeLessThan(WORLD_BUDGET.nodes)
    expect(MET_WORST + R2_MAXIMAL + FRONTIER_WORST).toBeLessThan(WORLD_NODE_CAP)
    // The reader of a load keeps all of it.
    expect(normalizeWorld(clone(g.world)).met).toEqual(worstShard())
  })

  it('names a shard written around its reader that is past a cap: 401 records, 201 tombstones', () => {
    const records: Rec = {}
    for (let i = 0; i < 401; i++) records[floodSid(i)] = rec(i)
    expect(worldBudget(withMet(ascending(Object.entries(records)))).over).toEqual(['met: 401 records pass the cap of 400'])
    const tombs: Rec = {}
    for (let i = 0; i < 201; i++) tombs[floodSid(i)] = tomb(i)
    expect(worldBudget(withMet(ascending(Object.entries(tombs)))).over).toEqual(['met: 201 tombstones pass the cap of 200'])
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// The file
// ---------------------------------------------------------------------------------------------------------------------------

describe('the file world/met.ts', () => {
  const src = readFileSync(join(ROOT, FILE), 'utf8')
  const code = src.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*')).join('\n')

  it('draws no number and reads no clock: no g.rng, rand, pick, Math.random, Date or performance', () => {
    expect(code).not.toMatch(/\bg\.rng\b|\brand\(|\bpick\(|\bchance\(|\brandInt\(|Math\.random|\bDate\b|performance\.now|\bstream\(|outcomeStream/)
  })

  it('compares keys by code unit: no localeCompare, no Intl', () => {
    expect(code).not.toMatch(/localeCompare|Intl\./)
  })

  it('has no long dash and registers its shard at load', () => {
    expect(DASH.test(src)).toBe(false)
    expect(code).toMatch(/registerShard\('met'/)
  })

  it('imports nothing above layer 2: not the root people.ts, not special, events or business', () => {
    const imports = [...src.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]!)
    for (const from of imports) expect(from, from).toMatch(/^\.\/|^\.\.\/kernel\/|^\.\.\/types$/)
  })

  it('is named in docs/WORLD.md and docs/PEOPLE.md', () => {
    const world = readFileSync(join(ROOT, 'docs/WORLD.md'), 'utf8')
    const people = readFileSync(join(ROOT, 'docs/PEOPLE.md'), 'utf8')
    expect(world).toContain('The Met store')
    expect(world).toContain('`met`')
    expect(people).toContain('MetRecord')
    expect(people).toContain('`MET_CAPS`')
    expect(DASH.test(world)).toBe(false)
    expect(DASH.test(people)).toBe(false)
  })
})
