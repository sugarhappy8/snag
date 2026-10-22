// ci: fast
// R2-S11 (K.5 j): shape tables for the big world slices (src/game/kernel/shapes.ts, and the `pack: 'shapes'` hooks of the codec).
//
// Key names are more than half the bytes of a late save. packShapes writes the key list of a repeated object shape once, in a
// table, and each object of that shape as `{"$":<shape>,"v":[values]}`; unpackShapes is the other direction and the one that
// meets hostile input, so every limit is checked before the allocation it guards and every failure is a plain Error. The codec
// packs a slice declared `pack: 'shapes'` (the world economy, and every `world.<name>` shard) and unpacks it before `normalize`.
//
// Sections: (a) the round trip is exact, (b) the economy gets smaller, (c) hostile packed input, (d) the prototype stays clean,
// (e) the codec, (f) what packing costs.
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { beforeEach, describe, expect, it } from 'vitest'
import { initialCountry, type EconomyPoint } from '../src/game/economy/model'
import { DEFAULT_SHAPE_LIMITS, packShapes, unpackShapes, type ShapeLimits } from '../src/game/kernel/shapes'
import { defineSlice, sliceOf } from '../src/game/kernel/slices'
import { assembleSave, encodeSave, inlineSave, resetCodecCachesForTests, textSum, type Assembled } from '../src/game/save-codec'
import { migrateSave } from '../src/game/save-schema'
import type { GameState } from '../src/game/types'
import { COUNTRIES } from '../src/game/world'

type Rec = Record<string, unknown>

const text = (v: unknown): string => JSON.stringify(v)
const viaText = (v: unknown): unknown => JSON.parse(JSON.stringify(v))

/** The way the codec uses it: pack, write as text, read the text back, unpack. The result must print as the input did. */
function roundTrip(value: unknown): { packed: Rec; back: unknown } {
  const packed = packShapes(value) as Rec
  const back = unpackShapes(viaText(packed))
  expect(text(back)).toBe(text(value))
  // The same answer without the text in between.
  expect(text(unpackShapes(packed))).toBe(text(value))
  return { packed, back }
}

/** An own data property, `__proto__` included (an assignment to it would set the prototype). */
function own(o: Rec, key: string, value: unknown): Rec {
  Object.defineProperty(o, key, { value, enumerable: true, writable: true, configurable: true })
  return o
}

// ---------------------------------------------------------------------------
// Fixtures

const FIVE = ['id', 'name', 'cash', 'debt', 'year']
const row = (i: number, keys: readonly string[] = FIVE): Rec => Object.fromEntries(keys.map((k, j) => [k, j === 1 ? `n${i}` : i * 10 + j]))

/** 102 country frames, the shape the economy keeps for each country. */
function countries(): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const ids = COUNTRIES.map((c) => c.id)
  for (let i = 0; i < 102; i++) out[ids[i % ids.length]! + (i >= ids.length ? String(i) : '')] = initialCountry('us', 2030)
  return out
}

function rivals(n: number): Rec[] {
  const point = (year: number): Rec => ({ year, cash: 0.5, debt: 0, capacity: 1, adoption: 0.1, strength: 1, outcome: 'steady' })
  return Array.from({ length: n }, (_, i) => ({
    key: `software|us|r${i}`,
    industry: 'software',
    scope: 'us',
    id: `r${i}`,
    hq: 'us',
    real: false,
    ...point(2030),
    history: Array.from({ length: 6 }, (_, j) => point(2024 + j)),
    cause: '',
  }))
}

const histories = (): Record<string, EconomyPoint[]> =>
  Object.fromEntries(
    ['us', 'fr', 'de', 'jp'].map((id) => [id, Array.from({ length: 16 }, (_, y): EconomyPoint => ({ year: 2000 + y, growth: 0.02, unemployment: 0.05, inflation: 0.02, rate: 0.03, housing: 1, market: 1.1, priceScale: 1 }))]),
  )

/** A small deterministic generator for the fuzz case (test-local; the engine's rng is not involved). */
function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

const KEY_LISTS: readonly (readonly string[])[] = [
  ['a', 'b', 'c', 'd', 'e'],
  ['a', 'b', 'c', 'd'],
  ['$', 'a', 'b', 'c', 'd'],
  ['$', 'v', 'a', 'b'],
  ['$s', '$v', 'a', 'b', 'c'],
  ['__proto__', 'a', 'b', 'c', 'd'],
  ['constructor', 'prototype', 'a', 'b', 'c'],
  ['1', '2', '10', 'a', 'b'],
  ['é', '日本', '😀', 'x', 'y'],
  ['a', 'b'],
  ['k'],
  ['', 'a', 'b', 'c', 'd'],
]

function randomValue(r: () => number, depth: number): unknown {
  const pick = r()
  if (depth > 4 || pick < 0.35) return [0, 1, -1, 1.5, 'x', 'text with "quotes"', null, true, false, 123456789.125][Math.floor(r() * 10)]
  if (pick < 0.5) return Array.from({ length: Math.floor(r() * 4) }, () => randomValue(r, depth + 1))
  const keys = KEY_LISTS[Math.floor(r() * KEY_LISTS.length)]!
  const o: Rec = {}
  for (const k of keys) own(o, k, randomValue(r, depth + 1))
  return o
}

beforeEach(() => resetCodecCachesForTests())

// ---------------------------------------------------------------------------
// (a) the round trip is exact

describe('packShapes and unpackShapes: the round trip is exact', () => {
  it('writes the envelope { "$s": [shapes], "$v": tree } and replaces a repeated shape by a wrapper', () => {
    const value = { rows: [row(1), row(2), row(3)] }
    const packed = packShapes(value) as Rec
    expect(Object.keys(packed)).toEqual(['$s', '$v'])
    expect(packed.$s).toEqual([FIVE])
    const rows = ((packed.$v as Rec).rows as unknown[]).map((r) => r as Rec)
    expect(rows.map((r) => Object.keys(r))).toEqual([['$', 'v'], ['$', 'v'], ['$', 'v']])
    expect(rows[0]).toEqual({ $: 0, v: [10, 'n1', 12, 13, 14] })
    expect(text(unpackShapes(viaText(packed)))).toBe(text(value))
  })

  it('makes 102 country frames and gets them back exactly', () => {
    const { packed } = roundTrip(countries())
    expect((packed.$s as unknown[]).length).toBeGreaterThan(3)
  })

  it('makes a rivals list with six-point histories and gets it back exactly', () => {
    const { packed } = roundTrip({ rivals: rivals(40), previousRivals: rivals(30) })
    expect((packed.$s as unknown[]).length).toBe(2)
  })

  it('makes 16-point histories and gets them back exactly', () => {
    roundTrip(histories())
  })

  it('leaves a value with nothing worth packing in the empty-table envelope', () => {
    for (const value of [{ a: 1, b: [1, 2, 3], c: 'x' }, [], {}, [1, 2], 5, 'x', null, true, { r: [row(1), row(2)] }]) {
      const packed = packShapes(value) as Rec
      expect(packed.$s, text(value)).toEqual([])
      expect(text(packed.$v)).toBe(text(value))
      roundTrip(value)
    }
  })

  it('packs a shape only from the fourth key and the third occurrence', () => {
    expect((packShapes([row(1, ['a', 'b', 'c']), row(2, ['a', 'b', 'c']), row(3, ['a', 'b', 'c']), row(4, ['a', 'b', 'c'])]) as Rec).$s).toEqual([])
    expect((packShapes([row(1), row(2)]) as Rec).$s).toEqual([])
    expect((packShapes([row(1), row(2), row(3)]) as Rec).$s).toEqual([FIVE])
  })

  it('keeps the key order of each object, and tells two orders of the same keys apart', () => {
    const a = { w: 1, x: 2, y: 3, z: 4 }
    const b = { z: 4, y: 3, x: 2, w: 1 }
    const value = [a, a, a, b, b, b, { ...a }, { ...b }]
    const { packed } = roundTrip(value)
    expect(packed.$s).toEqual([
      ['w', 'x', 'y', 'z'],
      ['z', 'y', 'x', 'w'],
    ])
  })

  it('packs nested shapes: a row inside a row inside a list', () => {
    const inner = (i: number): Rec => row(i, ['p', 'q', 'r', 's'])
    const value = Array.from({ length: 5 }, (_, i) => ({ ...row(i), inner: inner(i), more: [inner(i + 1), inner(i + 2)] }))
    const { packed } = roundTrip(value)
    expect((packed.$s as unknown[]).length).toBe(2)
  })

  it('keeps arrays of arrays of objects, and an array that holds both rows and scalars', () => {
    roundTrip({ grid: [[row(1), row(2)], [row(3), row(4)], [row(5)]], mixed: [row(6), 1, 'x', null, row(7), [row(8)], row(9)] })
  })

  it('keeps integer-like keys in their order (the order JSON.stringify prints)', () => {
    const o = (n: number): Rec => ({ '10': n, '2': n + 1, '1': n + 2, b: n + 3, a: n + 4 })
    const value = [o(1), o(2), o(3), o(4)]
    const { packed } = roundTrip(value)
    expect(packed.$s).toEqual([['1', '2', '10', 'b', 'a']])
  })

  it('keeps unicode keys, an empty key and keys that look like object internals', () => {
    const o = (n: number): Rec => ({ é: n, 日本: n, '😀': n, '': n, constructor: n, prototype: n, toString: n })
    roundTrip([o(1), o(2), o(3), o(4)])
  })

  it('escapes an own key named $ so that it is never taken for a wrapper', () => {
    const o = (n: number): Rec => ({ $: n, v: [n], a: n, b: n })
    const wrapperLookalike = { $: 0, v: [1, 2, 3, 4] }
    const { packed } = roundTrip({ list: [o(1), o(2), o(3), o(4)], lookalike: wrapperLookalike, nested: { $: { $: 1 } }, ok: [row(1), row(2), row(3)] })
    expect(text(packed)).toContain('"$":-1')
  })

  it('escapes an object that looks like the envelope, and the envelope of an envelope', () => {
    roundTrip({ $s: [['a', 'b', 'c', 'd']], $v: { $: 0, v: [1, 2, 3, 4] } })
    roundTrip(packShapes([row(1), row(2), row(3)]))
  })

  it('writes an object with an own __proto__ key as a plain object and reads it back with the key as data', () => {
    const o = (n: number): Rec => own({ a: n, b: n, c: n, d: n }, '__proto__', { n })
    const value = [o(1), o(2), o(3), o(4)]
    const { back } = roundTrip(value)
    for (const item of back as Rec[]) {
      expect(Object.getPrototypeOf(item)).toBe(Object.prototype)
      expect(Object.keys(item)).toContain('__proto__')
    }
  })

  it('treats a key whose value JSON leaves out as a different shape, and prints the same text', () => {
    const o = (n: number, gone?: boolean): Rec => ({ a: n, b: gone ? undefined : n, c: n, d: n })
    roundTrip([o(1), o(2), o(3), o(4, true), o(5, true), o(6, true), o(7), o(8)])
  })

  it('passes a Date, a Map and other non-plain objects to JSON as they are', () => {
    const when = new Date(Date.UTC(2030, 0, 2))
    const value = [row(1), row(2), row(3), { when, map: new Map([[1, 2]]), n: 1, m: 2 }]
    expect(text(unpackShapes(viaText(packShapes(value))))).toBe(text(value))
  })

  it('does not change its input', () => {
    const value = { list: [row(1), row(2), row(3), row(4)], $: 1 }
    const before = text(value)
    packShapes(value)
    expect(text(value)).toBe(before)
    const frozen = Object.freeze({ list: Object.freeze([row(1), row(2), row(3)].map((r) => Object.freeze(r))) })
    expect(() => packShapes(frozen)).not.toThrow()
  })

  it('is deterministic: the same value gives the same text', () => {
    const value = { rivals: rivals(12), countries: countries() }
    expect(text(packShapes(value))).toBe(text(packShapes(JSON.parse(text(value)))))
  })

  it('keeps at most 256 shapes, the ones that save the most characters', () => {
    // 300 shapes of four keys each, every shape three times; the long-keyed ones are worth more.
    const value: Rec[] = []
    for (let s = 0; s < 300; s++) for (let i = 0; i < 3; i++) value.push(Object.fromEntries([`k${s}a`, `k${s}b`, `k${s}c`, `k${s}d${'x'.repeat(s % 40)}`].map((k) => [k, i])))
    const packed = packShapes(value) as Rec
    expect((packed.$s as unknown[]).length).toBe(DEFAULT_SHAPE_LIMITS.maxShapes)
    expect(text(unpackShapes(viaText(packed)))).toBe(text(value))
  })

  it('does not pack a shape with more than 128 keys or a key of more than 64 characters', () => {
    const wide = (n: number): Rec => Object.fromEntries(Array.from({ length: 129 }, (_, i) => [`k${i}`, n]))
    const long = (n: number): Rec => ({ a: n, b: n, c: n, ['k'.repeat(65)]: n })
    const value = [wide(1), wide(2), wide(3), long(1), long(2), long(3)]
    const packed = packShapes(value) as Rec
    expect(packed.$s).toEqual([])
    roundTrip(value)
  })

  it('round-trips 300 random trees built from a pool of shared and awkward shapes', () => {
    const r = lcg(20260101)
    let packedSome = 0
    for (let i = 0; i < 300; i++) {
      const value = Array.from({ length: 1 + Math.floor(r() * 6) }, () => randomValue(r, 0))
      const { packed } = roundTrip(value)
      if ((packed.$s as unknown[]).length > 0) packedSome++
    }
    expect(packedSome).toBeGreaterThan(30)
  })

  it('refuses a value nested more than 40 levels (a state the loader would not accept)', () => {
    let deep: unknown = 1
    for (let i = 0; i < 60; i++) deep = { a: deep }
    expect(() => packShapes(deep)).toThrow(Error)
  })
})

// ---------------------------------------------------------------------------
// (b) the economy gets smaller

describe('what packing saves', () => {
  it('writes 102 country frames in at most 60% of their plain text', () => {
    const value = { countries: countries() }
    const plain = text(value).length
    const packed = text(packShapes(value)).length
    expect(packed / plain).toBeLessThanOrEqual(0.6)
  })

  it('writes the rivals and the histories in at most 60% of their plain text', () => {
    for (const value of [{ rivals: rivals(120) }, histories()]) expect(text(packShapes(value)).length / text(value).length).toBeLessThanOrEqual(0.6)
  })
})

// ---------------------------------------------------------------------------
// (c) hostile packed input

/** The one error a hostile input may raise: a plain Error, never a TypeError or a RangeError. */
function plainError(fn: () => unknown): Error {
  try {
    fn()
  } catch (e) {
    expect(e).toBeInstanceOf(Error)
    expect(Object.getPrototypeOf(e)).toBe(Error.prototype)
    return e as Error
  }
  throw new Error('expected unpackShapes to throw')
}

const SH4 = [['a', 'b', 'c', 'd']]
const wrap = (shape: unknown, v: unknown): Rec => ({ $: shape, v })
const env = (s: unknown, v: unknown): Rec => ({ $s: s, $v: v })

function nest(depth: number, make: (inner: unknown) => unknown): unknown {
  let t: unknown = 1
  for (let i = 0; i < depth; i++) t = make(t)
  return t
}

const HOSTILE: readonly { name: string; input: unknown }[] = [
  ...[5, 'x', null, undefined, true, [], [1, 2], 0].map((input) => ({ name: `an input that is not an object (${text(input) ?? 'undefined'})`, input })),
  { name: 'an envelope with no table', input: { $v: 1 } },
  { name: 'an envelope with no tree', input: { $s: [] } },
  { name: 'a table that is an object', input: env({}, 1) },
  { name: 'a table that is a string', input: env('abcd', 1) },
  { name: 'an envelope with an extra member', input: { ...env([], 1), extra: 1 } },
  { name: 'a shape that is not an array', input: env(['abcd'], 1) },
  { name: 'a shape of numbers', input: env([[1, 2, 3, 4]], 1) },
  { name: 'an empty shape', input: env([[]], 1) },
  { name: 'a shape with a duplicate key', input: env([['a', 'b', 'a', 'd']], wrap(0, [1, 2, 3, 4])) },
  { name: 'a shape with the key __proto__', input: env([['a', '__proto__', 'c', 'd']], wrap(0, [1, 2, 3, 4])) },
  { name: 'a shape with a key of 65 characters', input: env([['a', 'b', 'c', 'x'.repeat(65)]], wrap(0, [1, 2, 3, 4])) },
  { name: '257 shapes', input: env(Array.from({ length: 257 }, (_, i) => [`a${i}`, 'b', 'c', 'd']), 1) },
  { name: 'a shape of 129 keys', input: env([Array.from({ length: 129 }, (_, i) => `k${i}`)], 1) },
  { name: 'an unknown shape index', input: env(SH4, wrap(5, [1, 2, 3, 4])) },
  { name: 'a negative shape index other than the escape', input: env(SH4, wrap(-2, { a: 1 })) },
  { name: 'a fractional shape index', input: env(SH4, wrap(0.5, [1, 2, 3, 4])) },
  { name: 'a shape index that is a string', input: env(SH4, wrap('0', [1, 2, 3, 4])) },
  { name: 'a shape index that is null (what JSON makes of NaN)', input: env(SH4, wrap(null, [1, 2, 3, 4])) },
  { name: 'a wrapper with no values', input: env(SH4, { $: 0 }) },
  { name: 'a wrapper with an extra member', input: env(SH4, { $: 0, v: [1, 2, 3, 4], x: 1 }) },
  { name: 'values shorter than the shape', input: env(SH4, wrap(0, [1, 2, 3])) },
  { name: 'values longer than the shape', input: env(SH4, wrap(0, [1, 2, 3, 4, 5])) },
  { name: 'values that are an object', input: env(SH4, wrap(0, { a: 1, b: 2, c: 3, d: 4 })) },
  { name: 'an escape around an array', input: env([], wrap(-1, [1, 2])) },
  { name: 'an escape around a number', input: env([], wrap(-1, 5)) },
  { name: 'nesting 200 deep in arrays', input: env([], nest(200, (t) => [t])) },
  { name: 'nesting 200 deep in objects', input: env([], nest(200, (t) => ({ a: t }))) },
  { name: 'nesting 200 deep in wrappers', input: env(SH4, nest(200, (t) => wrap(0, [t, 1, 1, 1]))) },
  // JSON text cannot share a subtree, an object graph in memory can: 30 wrappers of one shape, each holding the one below four times.
  { name: 'a 4^30 node expansion from 30 nested wrappers sharing a shape', input: env(SH4, nest(30, (t) => wrap(0, [t, t, t, t]))) },
  { name: 'a 2^30 node expansion built from arrays', input: env([], nest(30, (t) => [t, t])) },
]

describe('unpackShapes on hostile input', () => {
  it.each(HOSTILE)('throws a plain Error for $name', ({ input }) => {
    plainError(() => unpackShapes(input))
  })

  it('stops a node bomb at the node limit and does not build it', () => {
    const bomb = env(SH4, nest(30, (t) => wrap(0, [t, t, t, t])))
    const t0 = performance.now()
    const e = plainError(() => unpackShapes(bomb))
    expect(performance.now() - t0).toBeLessThan(2_000)
    expect(e.message.length).toBeGreaterThan(0)
    expect(e.message.length).toBeLessThan(200)
  })

  it('counts every node it builds against maxNodes: a value of 100 nodes passes a limit of 100 and fails a limit of 99', () => {
    const value = { list: Array.from({ length: 98 }, (_, i) => i) }
    // The object, its list, and 98 numbers: 100 nodes.
    const packed = viaText(packShapes(value))
    expect(text(unpackShapes(packed, { ...DEFAULT_SHAPE_LIMITS, maxNodes: 100 }))).toBe(text(value))
    plainError(() => unpackShapes(packed, { ...DEFAULT_SHAPE_LIMITS, maxNodes: 99 }))
  })

  it('takes its limits from the caller: fewer shapes, fewer keys, shorter keys', () => {
    const packed = viaText(packShapes([row(1), row(2), row(3), row(1, ['p', 'q', 'r', 's']), row(2, ['p', 'q', 'r', 's']), row(3, ['p', 'q', 'r', 's'])]))
    expect(unpackShapes(packed)).toBeDefined()
    const tight = (over: Partial<ShapeLimits>): ShapeLimits => ({ ...DEFAULT_SHAPE_LIMITS, ...over })
    plainError(() => unpackShapes(packed, tight({ maxShapes: 1 })))
    plainError(() => unpackShapes(packed, tight({ maxKeys: 4 })))
    plainError(() => unpackShapes(packed, tight({ maxKeyChars: 3 })))
  })

  it('has the limits the plan names', () => {
    expect(DEFAULT_SHAPE_LIMITS).toEqual({ maxNodes: 400_000, maxShapes: 256, maxKeys: 128, maxKeyChars: 64 })
  })

  it('accepts a table of exactly 256 shapes, a shape of exactly 128 keys and a key of exactly 64 characters', () => {
    const shapes = Array.from({ length: 256 }, (_, i) => [`a${i}`, 'b', 'c', 'd'])
    expect(unpackShapes(env(shapes, 1))).toBe(1)
    const keys = Array.from({ length: 128 }, (_, i) => `k${i}`)
    const out = unpackShapes(env([keys], wrap(0, keys.map((_, i) => i)))) as Rec
    expect(Object.keys(out)).toHaveLength(128)
    const long = 'x'.repeat(64)
    expect(unpackShapes(env([[long, 'b', 'c', 'd']], wrap(0, [1, 2, 3, 4])))).toEqual({ [long]: 1, b: 2, c: 3, d: 4 })
  })
})

// ---------------------------------------------------------------------------
// (d) the prototype stays clean

describe('the prototype', () => {
  const protoKeys = (): string[] => Object.getOwnPropertyNames(Object.prototype).sort()

  it('is never polluted, by a hostile shape or by a hostile plain object', () => {
    const before = protoKeys()
    const hostile = [
      env([['a', '__proto__', 'c', 'd']], wrap(0, [1, { polluted: true }, 3, 4])),
      env([['__proto__', 'a', 'b', 'c']], wrap(0, [{ polluted: true }, 1, 2, 3])),
      env([], JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}')),
      env([], wrap(-1, JSON.parse('{"__proto__":{"polluted":true},"a":1}'))),
    ]
    for (const input of hostile) {
      try {
        unpackShapes(input)
      } catch (e) {
        expect(Object.getPrototypeOf(e)).toBe(Error.prototype)
      }
    }
    expect(({} as Rec).polluted).toBeUndefined()
    expect(protoKeys()).toEqual(before)
  })

  it('keeps a plain object with an own __proto__ key as that key and as data, with the usual prototype', () => {
    const out = unpackShapes(env([], JSON.parse('{"__proto__":{"polluted":true},"a":1}'))) as Rec
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype)
    expect(Object.keys(out)).toEqual(['__proto__', 'a'])
    expect(Object.getOwnPropertyDescriptor(out, '__proto__')?.value).toEqual({ polluted: true })
    expect(out.polluted).toBeUndefined()
    expect(({} as Rec).polluted).toBeUndefined()
  })

  it('builds the objects of a wrapper with the usual prototype, and keys such as constructor as data', () => {
    const out = unpackShapes(env([['constructor', 'prototype', 'toString', 'valueOf']], wrap(0, [1, 2, 3, 4]))) as Rec
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype)
    expect(Object.keys(out)).toEqual(['constructor', 'prototype', 'toString', 'valueOf'])
    expect(out.constructor).toBe(1)
    expect(({} as Rec).constructor).toBe(Object)
  })
})

// ---------------------------------------------------------------------------
// (e) the codec

let fixtureText: string | undefined
/** The heavy v4.1.1 fixture (a 20-year life with four companies), migrated: a real economy with `previous`, history and rivals. A new state on every call. */
function heavy(): GameState {
  fixtureText ??= gunzipSync(readFileSync('test/fixtures/save-v4.1.1-heavy.json.gz')).toString()
  const result = migrateSave(JSON.parse(fixtureText) as unknown)
  if (result.kind !== 'ready') throw new Error(`the heavy fixture did not migrate: ${text(result).slice(0, 200)}`)
  return result.game
}

interface Parts {
  head: Rec
  texts: Map<string, string | null>
  manifest: Record<string, { id: string; len: number }>
}

function split(g: GameState): Parts {
  const e = encodeSave(g)
  const head = JSON.parse(e.head) as Rec
  return { head, texts: new Map(e.chunks), manifest: head.chunks as Parts['manifest'] }
}

/** Put `body` in the manifest as the world chunk with its true length and checksum, as a writer that meant it would. */
function forgeWorld(p: Parts, body: string): void {
  const id = `world.${textSum(body)}`
  p.manifest.world = { id, len: body.length }
  p.texts.set(id, body)
}

function ready(r: Assembled): Extract<Assembled, { kind: 'ready' }> {
  if (r.kind !== 'ready') throw new Error(`expected a ready result, got ${text(r).slice(0, 300)}`)
  return r
}

const lostOf = (r: Extract<Assembled, { kind: 'ready' }>): string[] => r.lost.map((l) => `${l.name}:${l.why}`)

// Rows the codec cases own: a packed replace slice and a packed in-place one, under keys no game uses.
const keep = (raw: unknown): unknown => raw
const caps = { nodes: 1_000_000, chars: 4_000_000 }
defineSlice({ key: 'flags.testPacked', version: 1, chunk: 'world', caps, normalize: keep, write: 'replace', pack: 'shapes' })
defineSlice({ key: 'flags.testLive', version: 1, chunk: 'world', caps, normalize: keep, write: 'inplace', pack: 'shapes' })

describe('the codec packs a slice declared pack: shapes', () => {
  it('declares it for the world economy and for every world shard, and for nothing in the core', () => {
    expect(sliceOf('flags.worldEconomy')?.pack).toBe('shapes')
    expect(sliceOf('world')?.pack).toBe('shapes')
    expect(sliceOf('world.facts')?.pack).toBe('shapes')
    expect(sliceOf('world.anyshard')?.pack).toBe('shapes')
    expect(sliceOf('world.ledger')?.pack).toBeUndefined()
    expect(sliceOf('character')?.pack).toBeUndefined()
    expect(sliceOf('log')?.pack).toBeUndefined()
  })

  it('refuses a pack that is not "shapes", or on a slice that is not in the world chunk', () => {
    const base = { version: 1, caps, normalize: keep }
    expect(() => defineSlice({ ...base, key: 'testBadPack1', chunk: 'world', pack: 'columns' as never })).toThrow(/pack/)
    expect(() => defineSlice({ ...base, key: 'testBadPack2', chunk: 'core', pack: 'shapes' })).toThrow(/pack/)
    expect(() => defineSlice({ ...base, key: 'testBadPack3', chunk: 'log', pack: 'shapes' })).toThrow(/pack/)
    expect(() => defineSlice({ ...base, key: 'testBadPack4', chunk: 'entities', entities: { kind: 'badpack', shards: 2 }, pack: 'shapes' })).toThrow(/pack/)
  })

  it('writes the heavy fixture economy in a smaller world chunk, and the chunk is at most 60% of the plain economy', () => {
    const g = heavy()
    const plain = text(g.flags.worldEconomy).length
    const e = encodeSave(g)
    const world = e.stats.chunkChars.world!
    expect(world).toBeLessThan(plain)
    expect(world / plain).toBeLessThanOrEqual(0.6)
    // The chunk holds the packed economy: an envelope under the slice's key.
    const body = JSON.parse(e.chunks.get(e.manifest.world!.id)!) as Rec
    expect(Object.keys(body['flags.worldEconomy'] as Rec)).toEqual(['$s', '$v'])
    // The manifest says the length and sum of the packed text.
    const chunkText = e.chunks.get(e.manifest.world!.id)!
    expect(e.manifest.world!.len).toBe(chunkText.length)
    expect(e.manifest.world!.id).toBe(`world.${textSum(chunkText)}`)
  })

  it('reloads the heavy fixture to exactly the inline JSON', () => {
    const g = heavy()
    const p = split(g)
    const r = ready(assembleSave(p.head, p.texts))
    expect(r.lost).toEqual([])
    expect(text(r.game)).toBe(inlineSave(g))
  })

  it('packs a world shard (a derived row) and reads it back', () => {
    const g = heavy()
    const shard = { facts: Array.from({ length: 12 }, (_, i) => ({ id: `f${i}`, kind: 'sale', year: 2030, amount: i * 100, who: `p${i}` })) }
    ;(g as unknown as Rec).world = { ledger: { total: 1 }, thing: shard }
    const e = encodeSave(g)
    const body = JSON.parse(e.chunks.get(e.manifest.world!.id)!) as { world: Rec }
    expect(Object.keys(body.world.thing as Rec)).toEqual(['$s', '$v'])
    const p = split(g)
    const r = ready(assembleSave(p.head, p.texts))
    expect(r.lost).toEqual([])
    expect(text(r.game)).toBe(inlineSave(g))
  })

  it('writes plain text for a value with nothing to pack, so a small state keeps the text it always had', () => {
    const g = heavy()
    g.flags.worldEconomy = { v: 2, year: 2030 } as never
    const e = encodeSave(g)
    expect(e.chunks.get(e.manifest.world!.id)).toBe('{"flags.worldEconomy":{"v":2,"year":2030}}')
  })

  it('caches the packed text with the root: a second encode of an unchanged economy packs and stringifies nothing', () => {
    const g = heavy()
    const first = encodeSave(g)
    const second = encodeSave(g)
    expect(second.stats.stringified).toBe(0)
    expect(second.manifest.world).toEqual(first.manifest.world)
    expect(second.chunks.get(second.manifest.world!.id)).toBe(first.chunks.get(first.manifest.world!.id))
  })

  it('packs an in-place slice on every encode and gets the same text for the same value', () => {
    const g = heavy()
    ;(g.flags as Rec).testLive = { rows: Array.from({ length: 8 }, (_, i) => row(i)) }
    const a = encodeSave(g)
    const b = encodeSave(g)
    expect(b.manifest.world).toEqual(a.manifest.world)
    const body = JSON.parse(a.chunks.get(a.manifest.world!.id)!) as Rec
    expect(Object.keys(body['flags.testLive'] as Rec)).toEqual(['$s', '$v'])
    const p = split(g)
    expect(text(ready(assembleSave(p.head, p.texts)).game)).toBe(inlineSave(g))
  })

  it('reads a plain (unpacked) value for a packed slice as it is: a chunk written without shapes still loads', () => {
    const g = heavy()
    const p = split(g)
    forgeWorld(p, `{"flags.worldEconomy":${text(g.flags.worldEconomy)}}`)
    const r = ready(assembleSave(p.head, p.texts))
    expect(r.lost).toEqual([])
    expect(text(r.game)).toBe(inlineSave(g))
  })

  it('round-trips an economy that looks like an envelope, and one nested too deep to pack', () => {
    const looks = heavy()
    looks.flags.worldEconomy = { $s: 'mine', $v: [1, 2], v: 2, year: 2030, countries: { us: { a: 1 } } } as never
    const p = split(looks)
    expect(text(ready(assembleSave(p.head, p.texts)).game)).toBe(inlineSave(looks))

    const deep = heavy()
    let nested: unknown = { leaf: 1 }
    for (let i = 0; i < 60; i++) nested = { a: nested }
    deep.flags.worldEconomy = { v: 2, year: 2030, nested } as never
    const q = split(deep)
    // Too deep to pack: the chunk holds it as plain text.
    const body = JSON.parse(q.texts.get(q.manifest.world!.id)!) as Rec
    expect(body['flags.worldEconomy']).toEqual(JSON.parse(text(deep.flags.worldEconomy)))
    expect(text(ready(assembleSave(q.head, q.texts)).game)).toBe(inlineSave(deep))
  })

  it('makes a hostile packed economy a lost chunk (hostile) and not a crash', () => {
    const hostile = [
      '{"flags.worldEconomy":{"$s":[["a","b","c","d"]],"$v":{"$":9,"v":[1,2,3,4]}}}',
      '{"flags.worldEconomy":{"$s":[["a","__proto__","c","d"]],"$v":{"$":0,"v":[1,2,3,4]}}}',
      '{"flags.worldEconomy":{"$s":[["a","b","c","d"]],"$v":{"$":0,"v":[1,2,3]}}}',
      '{"flags.worldEconomy":{"$s":5,"$v":1}}',
      `{"flags.worldEconomy":{"$s":${text(Array.from({ length: 257 }, (_, i) => [`a${i}`, 'b', 'c', 'd']))},"$v":1}}`,
      `{"flags.worldEconomy":{"$s":[],"$v":${'['.repeat(150)}1${']'.repeat(150)}}}`,
    ]
    for (const body of hostile) {
      const g = heavy()
      const p = split(g)
      forgeWorld(p, body)
      const r = ready(assembleSave(p.head, p.texts))
      expect(lostOf(r), body.slice(0, 80)).toEqual(['world:hostile'])
      expect(r.lost[0]!.raw).toBe(body)
      expect((r.game.flags as Rec).worldEconomy).toBeUndefined()
    }
  })

  it('drops only the shard that does not unpack: the economy and the other shards of the chunk still load', () => {
    const g = heavy()
    const p = split(g)
    const good = text(g.flags.worldEconomy)
    forgeWorld(p, `{"flags.worldEconomy":${good},"world":{"bad":{"$s":[],"$v":1,"x":1},"ok":{"n":1}}}`)
    ;(p.head as Rec).world = { bad: '~world.bad', ok: '~world.ok' }
    const r = ready(assembleSave(p.head, p.texts))
    // "bad" is a plain object with an own $s: it must be a whole envelope, so it is refused; the rest is placed.
    expect(lostOf(r)).toEqual(['world:hostile'])
    expect((r.game.world as Rec).ok).toEqual({ n: 1 })
    expect(r.game.world as Rec).not.toHaveProperty('bad')
    expect(text((r.game.flags as Rec).worldEconomy)).toBe(good)
  })
})

// ---------------------------------------------------------------------------
// (f) what packing costs

/** Steps of the calibration loop, and how long they took on the dev desktop (the same figures as test/perf-kit.ts of R2-S8; the
 * plan's `machineFactor()`. This file keeps its own copy so it needs nothing from a task that has not merged: swap it for the import). */
const CAL_STEPS = 2_000_000
const CAL_REFERENCE_MS = 9.4
let sink = 0
function machineFactor(): number {
  let best = Number.POSITIVE_INFINITY
  for (let r = 0; r < 7; r++) {
    const t0 = performance.now()
    let x = 1
    for (let i = 0; i < CAL_STEPS; i++) x = (Math.imul(x, 1664525) + 1013904223 + i) | 0
    sink ^= x
    best = Math.min(best, performance.now() - t0)
  }
  return Math.max(1, best / CAL_REFERENCE_MS)
}

function median(times: number[]): number {
  const sorted = [...times].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]!
}

describe('the cost of packing', () => {
  it('packs the economy of the heavy probe life in at most 25 ms and unpacks it in at most 25 ms, times the machine factor', () => {
    const economy = heavy().flags.worldEconomy
    const factor = machineFactor()
    const packTimes: number[] = []
    const unpackTimes: number[] = []
    const stored = viaText(packShapes(economy))
    for (let i = 0; i < 3; i++) {
      packShapes(economy)
      unpackShapes(stored)
    }
    for (let i = 0; i < 11; i++) {
      const t0 = performance.now()
      packShapes(economy)
      const t1 = performance.now()
      unpackShapes(stored)
      packTimes.push(t1 - t0)
      unpackTimes.push(performance.now() - t1)
    }
    const pack = median(packTimes)
    const unpack = median(unpackTimes)
    console.log(`shapes: pack ${pack.toFixed(1)} ms, unpack ${unpack.toFixed(1)} ms, machine factor ${factor.toFixed(2)}, economy ${text(economy).length} characters, packed ${text(stored).length}, sink ${sink & 1}`)
    expect(pack).toBeLessThanOrEqual(25 * factor)
    expect(unpack).toBeLessThanOrEqual(25 * factor)
  })
})
