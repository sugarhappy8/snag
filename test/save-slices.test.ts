// ci: fast
// R2-S1 (K.5 a): the slice registry (src/game/kernel/slices.ts) and the R2 slice table (src/game/save-slices.ts).
//
// A slice is one piece of saved state with a declared home: a path into GameState, a shape version, a chunk, caps, a normalize
// and an optional migrate. Nothing in the game reads the table yet, so this file proves two things: the registry rejects a
// malformed declaration and its helpers do what the later tasks lean on (paths, counting, freezing, migrating), and the table
// is complete (a field added to GameState without a home fails here, at typecheck and at run time).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  LOG_GROUP_YEARS,
  LOG_TAIL,
  countNodes,
  defineSlice,
  deleteAt,
  freezeRoot,
  getAt,
  hasSlice,
  listSlices,
  migrateSlices,
  setAt,
  sliceOf,
  type SliceDef,
} from '../src/game/kernel/slices'
import { CORE_SCALARS, ensureSliceTable } from '../src/game/save-slices'
import type { GameState } from '../src/game/types'
import { classifyFlag } from '../src/game/world-flags'
import { makeTestGame } from './helpers'
import { probeLife } from './probe-life'
import { ROOT } from './scan-kit'

// A fixed life as a constant, not a `seed: <digits>` pin (test/seed-pins.test.ts).
const SLICE_LIFE_SEED = 3

ensureSliceTable()

/** A valid declaration to break one field at a time. */
function ok(key: string, over: Partial<SliceDef> = {}): SliceDef {
  return { key, version: 1, chunk: 'core', caps: { nodes: 10, chars: 100 }, normalize: (raw) => raw, ...over }
}

/** Every top-level key of GameState. The type fails to compile when a key is added to GameState and not listed here. */
const GAME_KEYS: Record<Exclude<keyof GameState, 'world'>, true> = {
  version: true,
  schemaVersion: true,
  lifeId: true,
  rng: true,
  nextId: true,
  year: true,
  generation: true,
  character: true,
  people: true,
  assets: true,
  log: true,
  queue: true,
  ancestors: true,
  counters: true,
  yearActions: true,
  flags: true,
  ribbon: true,
  obituary: true,
}

/** True when a top-level key has a home: a core scalar, a declared slice, or the first segment of one. */
function hasHome(key: string): boolean {
  if ((CORE_SCALARS as readonly string[]).includes(key)) return true
  return listSlices().some((s) => s.key === key || s.key.startsWith(`${key}.`))
}

describe('the slice table', () => {
  it('is sorted, well formed and unique', () => {
    const slices = listSlices()
    const keys = slices.map((s) => s.key)
    expect(keys).toEqual([...keys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)))
    expect(new Set(keys).size).toBe(keys.length)
    for (const s of slices) {
      expect(s.key).toMatch(/^[A-Za-z][A-Za-z0-9]{0,31}(\.[A-Za-z][A-Za-z0-9]{0,31})?$/)
      expect(Number.isInteger(s.version) && s.version >= 1).toBe(true)
      expect(s.caps.nodes).toBeGreaterThan(0)
      expect(s.caps.chars).toBeGreaterThan(0)
      expect(['core', 'world', 'log', 'entities']).toContain(s.chunk)
      expect(sliceOf(s.key)).toBe(s)
      expect(hasSlice(s.key)).toBe(true)
    }
  })

  it('names the R2 rows with their chunk, write rule and shape', () => {
    const row = (key: string): SliceDef => {
      const s = sliceOf(key)
      expect(s, key).toBeDefined()
      return s!
    }
    for (const key of ['character', 'people', 'assets', 'queue', 'ancestors', 'counters', 'yearActions', 'flags']) {
      expect(row(key).chunk, key).toBe('core')
      expect(row(key).write ?? 'inplace', key).toBe('inplace')
      expect(row(key).version, key).toBe(1)
    }
    expect(row('assets').caps).toEqual({ nodes: 120_000, chars: 1_200_000 })
    expect(row('character').caps).toEqual({ nodes: 60_000, chars: 600_000 })
    expect(row('flags').caps).toEqual({ nodes: 150_000, chars: 1_500_000 })

    expect(row('flags.worldEconomy').chunk).toBe('world')
    expect(row('flags.worldEconomy').write).toBe('replace')
    expect(row('flags.worldEconomy').caps).toEqual({ nodes: 150_000, chars: 2_000_000 })

    expect(row('log').chunk).toBe('log')
    expect(row('log').shape).toBe('logYears')
    expect(row('log').write).toBe('replace')
    expect(row('log').caps).toEqual({ nodes: 120_000, chars: 1_200_000 })

    expect(row('world').chunk).toBe('world')
    expect(row('world').shape).toBe('subkeys')
    expect(row('world').write).toBe('replace')
    expect(row('world').caps).toEqual({ nodes: 60_000, chars: 700_000 })

    // The ledger is edited in place by every booking: a core slice, never a frozen shared root.
    expect(row('world.ledger').chunk).toBe('core')
    expect(row('world.ledger').write ?? 'inplace').toBe('inplace')
    expect(row('world.ledger').caps).toEqual({ nodes: 12_000, chars: 150_000 })
  })

  it('gives every top-level key of a state a home', () => {
    // The completeness guard: a field added to GameState without a slice or a core scalar fails here.
    for (const key of Object.keys(GAME_KEYS)) expect(hasHome(key), `GameState.${key} has no slice and is not a core scalar`).toBe(true)
    expect(hasSlice('world')).toBe(true)
    const empty = Object.keys(makeTestGame())
    for (const key of empty) expect(hasHome(key), `makeTestGame().${key}`).toBe(true)
  })

  it('gives every top-level key of a 15-year life with companies a home', () => {
    const g = probeLife({ seed: SLICE_LIFE_SEED, birthYear: 1990, businesses: 2, years: 15 })
    const keys = Object.keys(g)
    expect(keys).toContain('assets')
    for (const key of keys) expect(hasHome(key), `the probe life has a top-level key "${key}" with no slice and no core scalar`).toBe(true)
    // The economy flag is the chunked-out one: it is there once the life has lived.
    expect(Object.keys(g.flags)).toContain('worldEconomy')
    expect(sliceOf('flags.worldEconomy')).toBeDefined()
  })

  it('lists no scalar twice and no scalar that is also a slice', () => {
    const scalars = [...CORE_SCALARS]
    expect(new Set(scalars).size).toBe(scalars.length)
    for (const s of scalars) expect(sliceOf(s), s).toBeUndefined()
  })

  it('keeps a chunked-out flag a world flag, so an heir keeps it', () => {
    expect(classifyFlag('worldEconomy')).toBe('world')
  })

  it('has a normalize for each chunked slice that keeps a plain object and drops anything else', () => {
    const plain = { a: 1, b: [2] }
    for (const key of ['flags.worldEconomy', 'world', 'world.ledger']) {
      const n = sliceOf(key)!.normalize
      expect(n(plain), key).toBe(plain)
      for (const bad of [null, 0, 'x', true, [1], undefined]) expect(n(bad), `${key} ${JSON.stringify(bad)}`).toBeUndefined()
    }
    const log = sliceOf('log')!.normalize
    const years = [{ age: 0, year: 1990, entries: [] }]
    expect(log(years)).toBe(years)
    expect(log({})).toBeUndefined()
    // A core slice's normalize is the identity: isLoadableGame (save-schema.ts) validates those.
    for (const key of ['character', 'people', 'flags']) {
      const x = { any: 'thing' }
      expect(sliceOf(key)!.normalize(x)).toBe(x)
    }
  })

  it('is a leaf: kernel/slices.ts imports types only', () => {
    const text = readFileSync(join(ROOT, 'src/game/kernel/slices.ts'), 'utf8')
    const imports = text.split('\n').filter((l) => /^\s*import\b/.test(l))
    for (const l of imports) expect(l, l).toMatch(/^\s*import type\b/)
  })

  it('can be called again: ensureSliceTable is idempotent', () => {
    const before = listSlices().map((s) => s.key)
    ensureSliceTable()
    ensureSliceTable()
    expect(listSlices().map((s) => s.key)).toEqual(before)
  })

  it('declares the log constants', () => {
    expect(LOG_TAIL).toBe(1)
    expect(LOG_GROUP_YEARS).toBe(10)
  })
})

describe('defineSlice', () => {
  it('returns the declaration and registers it', () => {
    const def = defineSlice(ok('testReg'))
    expect(def.key).toBe('testReg')
    expect(sliceOf('testReg')).toBe(def)
    expect(hasSlice('testReg')).toBe(true)
    expect(listSlices()).toContain(def)
  })

  it('rejects a duplicate key', () => {
    defineSlice(ok('testDup'))
    expect(() => defineSlice(ok('testDup'))).toThrow(/testDup/)
    // A table row too.
    expect(() => defineSlice(ok('character'))).toThrow(/character/)
  })

  it('rejects a malformed key', () => {
    for (const key of ['', ' ', 'a b', 'a.', '.a', 'a..b', 'a.b.c', '1abc', 'a-b', 'a_b', '__proto__', 'constructor', 'prototype', 'flags.constructor', 'world.__proto__', 'x'.repeat(33)]) {
      expect(() => defineSlice(ok(key)), JSON.stringify(key)).toThrow()
    }
    expect(() => defineSlice(ok(5 as unknown as string))).toThrow()
  })

  it('rejects a version below 1 or a version that is not a whole number', () => {
    for (const version of [0, -1, 1.5, Number.NaN, Infinity]) expect(() => defineSlice(ok('testVer', { version })), String(version)).toThrow(/version/)
  })

  it('rejects caps that are not positive', () => {
    for (const caps of [{ nodes: 0, chars: 10 }, { nodes: 10, chars: 0 }, { nodes: -1, chars: 10 }, { nodes: 10, chars: Number.NaN }, { nodes: Infinity, chars: 10 }]) {
      expect(() => defineSlice(ok('testCaps', { caps })), JSON.stringify(caps)).toThrow(/caps/)
    }
  })

  it('rejects entities on a slice that is not in the entities chunk, and the other way round', () => {
    expect(() => defineSlice(ok('testEnt1', { entities: { kind: 'npc', shards: 4 } }))).toThrow(/entities/)
    expect(() => defineSlice(ok('testEnt2', { chunk: 'entities' }))).toThrow(/entities/)
    for (const entities of [{ kind: 'Npc', shards: 4 }, { kind: '', shards: 4 }, { kind: 'x'.repeat(17), shards: 4 }, { kind: 'npc', shards: 0 }, { kind: 'npc', shards: 17 }, { kind: 'npc', shards: 1.5 }]) {
      expect(() => defineSlice(ok('testEnt3', { chunk: 'entities', entities })), JSON.stringify(entities)).toThrow(/entities/)
    }
    const good = defineSlice(ok('testEntOk', { chunk: 'entities', entities: { kind: 'npc1', shards: 16 } }))
    expect(good.entities).toEqual({ kind: 'npc1', shards: 16 })
  })

  it('rejects the logYears shape off the key log, and a subkeys shape on a nested key', () => {
    expect(() => defineSlice(ok('testLog', { shape: 'logYears' }))).toThrow(/logYears/)
    expect(() => defineSlice(ok('flags.testSub', { shape: 'subkeys' }))).toThrow(/subkeys/)
  })

  it('rejects a fatal loss outside the core chunk', () => {
    expect(() => defineSlice(ok('testFatal', { chunk: 'world', onLost: 'fatal' }))).toThrow(/onLost/)
    expect(defineSlice(ok('testFatalOk', { onLost: 'fatal' })).onLost).toBe('fatal')
  })

  it('rejects an unknown chunk, write, shape or onLost, and a normalize that is not a function', () => {
    expect(() => defineSlice(ok('testBad1', { chunk: 'disk' as never }))).toThrow(/chunk/)
    expect(() => defineSlice(ok('testBad2', { write: 'mutate' as never }))).toThrow(/write/)
    expect(() => defineSlice(ok('testBad3', { shape: 'tree' as never }))).toThrow(/shape/)
    expect(() => defineSlice(ok('testBad4', { onLost: 'ignore' as never }))).toThrow(/onLost/)
    expect(() => defineSlice(ok('testBad5', { normalize: 'x' as never }))).toThrow(/normalize/)
    expect(() => defineSlice(ok('testBad6', { migrate: 'x' as never }))).toThrow(/migrate/)
  })

  it('leaves nothing behind when it throws', () => {
    expect(() => defineSlice(ok('testGone', { version: 0 }))).toThrow()
    expect(sliceOf('testGone')).toBeUndefined()
    expect(hasSlice('testGone')).toBe(false)
  })
})

describe('hasSlice and sliceOf for a dynamic sub-slice', () => {
  it('accepts world.<name> for a name of lower case letters and digits', () => {
    expect(hasSlice('world.facts')).toBe(true)
    expect(hasSlice('world.ledger')).toBe(true)
    expect(hasSlice('world.a1')).toBe(true)
    expect(hasSlice('world.' + 'a'.repeat(16))).toBe(true)
  })

  it('refuses a bad name, a deeper path and a parent that is not a subkeys slice', () => {
    expect(hasSlice('world.Bad')).toBe(false)
    expect(hasSlice('world.1x')).toBe(false)
    expect(hasSlice('world.' + 'a'.repeat(17))).toBe(false)
    expect(hasSlice('world.a.b')).toBe(false)
    expect(hasSlice('world.')).toBe(false)
    expect(hasSlice('character.x')).toBe(false)
    expect(hasSlice('flags.nothing')).toBe(false)
    expect(hasSlice('nothing')).toBe(false)
    expect(hasSlice('')).toBe(false)
    expect(hasSlice('world.__proto__')).toBe(false)
    expect(hasSlice('world.constructor')).toBe(false)
    expect(hasSlice('world.prototype')).toBe(false)
    expect(hasSlice('constructor')).toBe(false)
  })

  it('answers false or undefined for a value that is not a string, so an untyped module declaration cannot throw', () => {
    for (const x of [undefined, null, 5, {}, ['world.facts']]) {
      expect(hasSlice(x as unknown as string)).toBe(false)
      expect(sliceOf(x as unknown as string)).toBeUndefined()
      expect(getAt({ a: 1 }, x as unknown as string)).toBeUndefined()
      expect(() => deleteAt({ a: 1 }, x as unknown as string)).not.toThrow()
    }
  })

  it('gives the explicit row for world.ledger and a derived replace row for world.facts', () => {
    const ledger = sliceOf('world.ledger')!
    expect(ledger.chunk).toBe('core')
    expect(ledger.key).toBe('world.ledger')
    const facts = sliceOf('world.facts')!
    const world = sliceOf('world')!
    expect(facts.key).toBe('world.facts')
    expect(facts.write).toBe('replace')
    expect(facts.chunk).toBe('world')
    expect(facts.version).toBe(world.version)
    expect(facts.caps).toEqual(world.caps)
    expect(facts.shape ?? 'whole').toBe('whole')
    expect(facts.entities).toBeUndefined()
    // Derived rows are not declared: they are not listed and they cost no memory per name.
    expect(listSlices().map((s) => s.key)).not.toContain('world.facts')
    // Its normalize keeps a value and drops undefined, like an identity.
    const shard = { a: 1 }
    expect(facts.normalize(shard)).toBe(shard)
    expect(sliceOf('world.Bad')).toBeUndefined()
    expect(sliceOf('character.x')).toBeUndefined()
  })
})

describe('getAt, setAt and deleteAt', () => {
  it('reads nested own properties and returns undefined for anything missing', () => {
    const root = { a: { b: { c: 3 } }, list: [1, 2], z: null }
    expect(getAt(root, 'a')).toBe(root.a)
    expect(getAt(root, 'a.b.c')).toBe(3)
    expect(getAt(root, 'z')).toBeNull()
    expect(getAt(root, 'a.x')).toBeUndefined()
    expect(getAt(root, 'a.b.c.d')).toBeUndefined()
    expect(getAt(root, 'x.y.z')).toBeUndefined()
    expect(getAt(null, 'a')).toBeUndefined()
    expect(getAt(7, 'a')).toBeUndefined()
    expect(getAt(root, '')).toBeUndefined()
    expect(getAt(root, 'a..b')).toBeUndefined()
  })

  it('reads own properties only, never the prototype chain', () => {
    const root = { a: {} }
    expect(getAt(root, 'toString')).toBeUndefined()
    expect(getAt(root, 'constructor')).toBeUndefined()
    expect(getAt(root, '__proto__')).toBeUndefined()
    expect(getAt(root, 'a.hasOwnProperty')).toBeUndefined()
    const hostile = JSON.parse('{"__proto__":{"x":1}}') as Record<string, unknown>
    expect(getAt(hostile, 'x')).toBeUndefined()
  })

  it('writes a nested value and an existing key keeps its position', () => {
    const root: Record<string, unknown> = { first: 1, flags: { one: 1, worldEconomy: 'old', three: 3 }, last: 9 }
    setAt(root, 'flags.worldEconomy', '~flags.worldEconomy')
    expect(Object.keys(root)).toEqual(['first', 'flags', 'last'])
    expect(Object.keys(root.flags as object)).toEqual(['one', 'worldEconomy', 'three'])
    expect(JSON.stringify(root)).toBe('{"first":1,"flags":{"one":1,"worldEconomy":"~flags.worldEconomy","three":3},"last":9}')
    setAt(root, 'first', 2)
    expect(Object.keys(root)).toEqual(['first', 'flags', 'last'])
    expect(root.first).toBe(2)
  })

  it('appends a key that is not there yet', () => {
    const root: Record<string, unknown> = { a: { x: 1 } }
    setAt(root, 'a.y', 2)
    setAt(root, 'b', 3)
    expect(Object.keys(root)).toEqual(['a', 'b'])
    expect(Object.keys(root.a as object)).toEqual(['x', 'y'])
  })

  it('does not invent a missing parent, and does not write through a non-object', () => {
    const root: Record<string, unknown> = { s: 'text', n: null, arr: [1] }
    setAt(root, 'missing.child', 1)
    setAt(root, 's.child', 1)
    setAt(root, 'n.child', 1)
    setAt(root, 'arr.child', 1)
    expect(root).toEqual({ s: 'text', n: null, arr: [1] })
    expect('missing' in root).toBe(false)
  })

  it('refuses __proto__, constructor and prototype and leaves Object.prototype alone', () => {
    const root: Record<string, unknown> = { a: {} }
    expect(() => setAt(root, '__proto__', { polluted: true })).toThrow(/__proto__/)
    expect(() => setAt(root, 'a.__proto__', { polluted: true })).toThrow(/__proto__/)
    expect(() => setAt(root, '__proto__.polluted', true)).toThrow(/__proto__/)
    expect(() => setAt(root, 'a.constructor', 1)).toThrow(/constructor/)
    expect(() => setAt(root, 'prototype', 1)).toThrow(/prototype/)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(Object.getPrototypeOf(root)).toBe(Object.prototype)
    expect(Object.keys(root)).toEqual(['a'])
    expect(() => setAt(root, '', 1)).toThrow()
    expect(() => setAt(root, 'a..b', 1)).toThrow()
  })

  it('deletes a nested own key and ignores anything that is not there', () => {
    const root: Record<string, unknown> = { a: { b: 1, c: 2 }, d: 3 }
    deleteAt(root, 'a.b')
    expect(root).toEqual({ a: { c: 2 }, d: 3 })
    expect('b' in (root.a as object)).toBe(false)
    deleteAt(root, 'a.b')
    deleteAt(root, 'x.y')
    deleteAt(root, 'd.e')
    deleteAt(root, 'toString')
    deleteAt(root, '')
    expect(root).toEqual({ a: { c: 2 }, d: 3 })
    deleteAt(root, 'd')
    expect(Object.keys(root)).toEqual(['a'])
  })
})

describe('countNodes', () => {
  it('counts the root, every object and array, and every leaf', () => {
    expect(countNodes(1, 100)).toBe(1)
    expect(countNodes(null, 100)).toBe(1)
    expect(countNodes('s', 100)).toBe(1)
    expect(countNodes({}, 100)).toBe(1)
    expect(countNodes([], 100)).toBe(1)
    // root, a, 1, 2, {b}, 'x', c = 7
    expect(countNodes({ a: [1, 2, { b: 'x' }], c: null }, 100)).toBe(7)
    expect(countNodes([[], [[]], {}], 100)).toBe(5)
  })

  it('agrees with a plain recursive count on a real state', () => {
    const g = makeTestGame()
    g.flags.deep = { a: [1, 2, { b: [true, false] }] }
    g.people.push({ id: 'p1', name: 'Ann' } as never)
    const reference = (v: unknown): number => {
      if (v === null || typeof v !== 'object') return 1
      return 1 + Object.values(v as Record<string, unknown>).reduce<number>((n, c) => n + reference(c), 0)
    }
    expect(countNodes(g, 1_000_000)).toBe(reference(g))
    expect(countNodes(JSON.parse(JSON.stringify(g)), 1_000_000)).toBe(reference(g))
  })

  it('returns limit + 1 as soon as the count passes the limit', () => {
    const tree = { a: [1, 2, { b: 'x' }], c: null }
    expect(countNodes(tree, 7)).toBe(7)
    expect(countNodes(tree, 6)).toBe(7)
    expect(countNodes(tree, 3)).toBe(4)
    expect(countNodes(tree, 1)).toBe(2)
    expect(countNodes(tree, 0)).toBe(1)
    expect(countNodes(1, 0)).toBe(1)
  })

  it('stops reading at the limit instead of walking the rest', () => {
    let reads = 0
    const wide = new Proxy(new Array<number>(1_000_000).fill(1), {
      get(target, prop, receiver) {
        if (typeof prop === 'string' && /^\d+$/.test(prop)) reads++
        return Reflect.get(target, prop, receiver) as unknown
      },
    })
    expect(countNodes(wide, 50)).toBe(51)
    expect(reads).toBeLessThanOrEqual(60)
    // A wide object too: a getter counts the values read.
    let valueReads = 0
    const obj: Record<string, number> = {}
    for (let i = 0; i < 5000; i++) Object.defineProperty(obj, `k${i}`, { enumerable: true, get: () => { valueReads++; return 1 } })
    expect(countNodes(obj, 20)).toBe(21)
    expect(valueReads).toBeLessThanOrEqual(30)
  })

  it('does not recurse: a very deep value neither overflows the stack nor passes the limit by walking', () => {
    let deep: unknown = 0
    for (let i = 0; i < 200_000; i++) deep = [deep]
    expect(countNodes(deep, 1_000_000)).toBe(200_001)
    expect(countNodes(deep, 1000)).toBe(1001)
  })

  it('ends on a cycle', () => {
    const a: Record<string, unknown> = {}
    a.self = a
    expect(countNodes(a, 500)).toBe(501)
  })
})

describe('freezeRoot', () => {
  it('freezes deeply, objects and arrays', () => {
    const root = { a: { b: [1, { c: 2 }] }, d: [] as unknown[] }
    freezeRoot(root)
    expect(Object.isFrozen(root)).toBe(true)
    expect(Object.isFrozen(root.a)).toBe(true)
    expect(Object.isFrozen(root.a.b)).toBe(true)
    expect(Object.isFrozen(root.a.b[1])).toBe(true)
    expect(Object.isFrozen(root.d)).toBe(true)
    expect(() => {
      ;(root.a.b[1] as { c: number }).c = 3
    }).toThrow(TypeError)
    expect(() => root.d.push(1)).toThrow(TypeError)
  })

  it('does not walk a second time', () => {
    const root = { a: { b: [1, { c: 2 }] }, d: [{ e: 1 }] }
    freezeRoot(root)
    const spy = vi.spyOn(Object, 'freeze')
    try {
      freezeRoot(root)
      freezeRoot(root.a)
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  it('only walks what is new when a frozen root gets a new unfrozen child object', () => {
    const shared = { x: { y: 1 } }
    freezeRoot(shared)
    const next = { shared, fresh: { z: [1] } }
    const spy = vi.spyOn(Object, 'freeze')
    try {
      freezeRoot(next)
      // next, fresh and fresh.z: three objects, and not the ones already done.
      expect(spy).toHaveBeenCalledTimes(3)
    } finally {
      spy.mockRestore()
    }
    expect(Object.isFrozen(next.fresh.z)).toBe(true)
  })

  it('accepts input that is already frozen, even with an unfrozen child', () => {
    const inner = { v: 1 }
    const outer = Object.freeze({ inner })
    expect(() => freezeRoot(outer)).not.toThrow()
    expect(Object.isFrozen(inner)).toBe(true)
    expect(() => freezeRoot(Object.freeze({}))).not.toThrow()
  })

  it('ignores a value that is not an object and ends on a cycle', () => {
    expect(() => freezeRoot(5 as unknown as object)).not.toThrow()
    expect(() => freezeRoot(null as unknown as object)).not.toThrow()
    const a: Record<string, unknown> = {}
    a.self = a
    freezeRoot(a)
    expect(Object.isFrozen(a)).toBe(true)
  })

  it('does not recurse: a very deep value is frozen without overflowing the stack', () => {
    let deep: unknown[] = []
    const first = deep
    for (let i = 0; i < 100_000; i++) {
      const next: unknown[] = []
      deep.push(next)
      deep = next
    }
    freezeRoot(first)
    expect(Object.isFrozen(deep)).toBe(true)
  })

  it('makes an in-place write to a game piece throw, the way act() will rely on', () => {
    const g = makeTestGame()
    g.flags.worldEconomy = { v: 2, countries: { us: { year: 2026, priceScale: 1 } } }
    freezeRoot(g.flags.worldEconomy as object)
    expect(() => {
      ;((g.flags.worldEconomy as { countries: { us: { priceScale: number } } }).countries.us.priceScale = 2)
    }).toThrow(TypeError)
    // The rest of the state is still writable.
    g.flags.other = 1
    expect(g.flags.other).toBe(1)
  })
})

describe('migrateSlices', () => {
  /** A slice at version 3 whose migrate records its calls and stamps the value. */
  function counted(key: string, version = 3): { def: SliceDef; calls: { from: number; json: unknown }[] } {
    const calls: { from: number; json: unknown }[] = []
    const def = defineSlice(
      ok(key, {
        version,
        migrate: (from, json) => {
          calls.push({ from, json })
          const base = json !== null && typeof json === 'object' && !Array.isArray(json) ? (json as Record<string, unknown>) : {}
          return { ...base, step: version }
        },
      }),
    )
    return { def, calls }
  }

  it('calls migrate for a stored version below the current one, with the stored value and the whole game', () => {
    const { calls } = counted('mgA')
    const game: Record<string, unknown> = { mgA: { v: 1 }, other: 1 }
    migrateSlices(game, { mgA: 1 }, 'current')
    expect(calls).toHaveLength(1)
    expect(calls[0]!.from).toBe(1)
    expect(calls[0]!.json).toEqual({ v: 1 })
    expect(game.mgA).toEqual({ v: 1, step: 3 })
  })

  it('does not call migrate for a stored version at or above the current one', () => {
    const { calls } = counted('mgB')
    for (const stored of [3, 4, 99]) migrateSlices({ mgB: { v: 1 } }, { mgB: stored }, 1)
    expect(calls).toHaveLength(0)
  })

  it('uses the missing version for a slice the map does not name, and "current" means no migration', () => {
    const { calls } = counted('mgC')
    const game: Record<string, unknown> = { mgC: { v: 1 } }
    migrateSlices(game, null, 'current')
    migrateSlices(game, {}, 'current')
    migrateSlices(game, { elsewhere: 1 }, 'current')
    expect(calls).toHaveLength(0)
    expect(game.mgC).toEqual({ v: 1 })
    migrateSlices(game, null, 1)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.from).toBe(1)
    migrateSlices(game, { elsewhere: 1 }, 2)
    expect(calls).toHaveLength(2)
    expect(calls[1]!.from).toBe(2)
  })

  it('migrates a slice that is absent from the game too, when its migrate returns a value', () => {
    const { calls } = counted('mgD')
    const game: Record<string, unknown> = {}
    migrateSlices(game, null, 1)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.json).toBeUndefined()
    expect(game.mgD).toEqual({ step: 3 })
  })

  it('writes a nested slice through its path and deletes the key when migrate returns undefined', () => {
    defineSlice(ok('mgHost'))
    defineSlice(ok('mgHost.kid', { version: 2, migrate: (from) => (from === 1 ? undefined : { kept: true }) }))
    const game: Record<string, unknown> = { mgHost: { kid: { old: true }, keep: 1 } }
    migrateSlices(game, null, 1)
    expect(game.mgHost).toEqual({ keep: 1 })
    expect('kid' in (game.mgHost as object)).toBe(false)
  })

  it('ignores a slice with no migrate, whatever its stored version', () => {
    defineSlice(ok('mgNone', { version: 2 }))
    const game: Record<string, unknown> = { mgNone: { v: 1 } }
    migrateSlices(game, null, 1)
    expect(game.mgNone).toEqual({ v: 1 })
  })

  it('survives a throwing migrate: the key is dropped and the loop goes on', () => {
    defineSlice(ok('mgBoom', { version: 2, migrate: () => { throw new Error('boom') } }))
    const { calls } = counted('mgAfter')
    const game: Record<string, unknown> = { mgBoom: { v: 1 }, mgAfter: { v: 1 }, keep: 1 }
    expect(() => migrateSlices(game, null, 1)).not.toThrow()
    expect('mgBoom' in game).toBe(false)
    expect(game.mgAfter).toEqual({ v: 1, step: 3 })
    expect(game.keep).toBe(1)
    expect(calls).toHaveLength(1)
  })

  it('is idempotent: running it again on its own result changes nothing', () => {
    counted('mgIdem')
    const once: Record<string, unknown> = { mgIdem: { v: 1 } }
    migrateSlices(once, null, 1)
    const after = JSON.stringify(once)
    // The record is now at the current version: its map says so, and a second pass has nothing to do.
    migrateSlices(once, { mgIdem: 3 }, 'current')
    expect(JSON.stringify(once)).toBe(after)
    // And the same pass twice (a migrate that is itself idempotent) lands in the same place.
    const twice: Record<string, unknown> = { mgIdem: { v: 1 } }
    migrateSlices(twice, null, 1)
    migrateSlices(twice, null, 1)
    expect(JSON.stringify(twice)).toBe(after)
  })

  it('reads versions as own numbers only, and falls back to the missing version for anything else', () => {
    const { calls } = counted('mgOwn')
    const game: Record<string, unknown> = { mgOwn: { v: 1 } }
    migrateSlices(game, { mgOwn: 'x' } as unknown as Record<string, number>, 'current')
    migrateSlices(game, { mgOwn: Number.NaN }, 'current')
    expect(calls).toHaveLength(0)
    migrateSlices(game, Object.create({ mgOwn: 1 }) as Record<string, number>, 'current')
    expect(calls).toHaveLength(0)
    migrateSlices(game, { mgOwn: 'x' } as unknown as Record<string, number>, 2)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.from).toBe(2)
  })
})
