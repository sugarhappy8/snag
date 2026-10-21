// ci: fast
// R2-S3 (K.5 c): the chunk encoder (src/game/save-codec.ts). A GameState becomes a head string and a map of chunk strings.
//
// The head is the core (everything player-side, in the key order of GameState) with a placeholder string "~<slice key>" where a
// bigger slice was moved out, then a `chunks` manifest and an `sv` map of slice versions. The text and checksum of every `replace`
// slice is cached by object identity, so a tap re-stringifies only the core. Pure: no storage, no decode (R2-S4 extends this file),
// no random numbers, and nothing calls it yet.
//
// The synthetic slices below are declared in this file (the registry is global per test file), under keys no game uses, so the real
// table is what the 15-year life at the end exercises and the synthetic rows are what the cache and shard cases exercise.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LOG_GROUP_YEARS, LOG_TAIL, defineSlice, listSlices } from '../src/game/kernel/slices'
import {
  CHUNK_ID_PATTERN,
  HEAD_CHUNKS_KEY,
  HEAD_VERSIONS_KEY,
  MAX_CHUNKS,
  MAX_CHUNK_CHARS,
  encodeSave,
  inlineSave,
  resetCodecCachesForTests,
  shardOf,
  textSum,
  type EncodedSave,
} from '../src/game/save-codec'
import { SAVE_SCHEMA } from '../src/game/save-schema'
import type { GameState, LogYear } from '../src/game/types'
import { makeTestGame } from './helpers'
import { probeLife } from './probe-life'

// A fixed life as a constant, not a `seed: <digits>` pin (test/seed-pins.test.ts).
const CODEC_LIFE_SEED = 3

const keep = (raw: unknown): unknown => raw
const caps = { nodes: 1_000_000, chars: 4_000_000 }

// Synthetic rows. `flags.testChunk` and the derived `world.testrec` are replace slices in the world chunk, `world.testhot` is an
// in-place slice outside the core, `world.testent` is an entity record in four shards, and `world.ea` to `world.eg` are seven
// kinds of sixteen shards (more chunk records than MAX_CHUNKS allows).
defineSlice({ key: 'flags.testChunk', version: 1, chunk: 'world', caps, normalize: keep, write: 'replace' })
defineSlice({ key: 'world.testhot', version: 1, chunk: 'world', caps, normalize: keep, write: 'inplace' })
defineSlice({ key: 'world.testent', version: 1, chunk: 'entities', entities: { kind: 'testent', shards: 4 }, caps, normalize: keep, write: 'replace' })
const MANY = ['ea', 'eb', 'ec', 'ed', 'ee', 'ef', 'eg'] as const
for (const kind of MANY) defineSlice({ key: `world.${kind}`, version: 1, chunk: 'entities', entities: { kind, shards: 16 }, caps, normalize: keep, write: 'replace' })
// An in-place entity record: no identity cache, but the same shards.
defineSlice({ key: 'world.entlive', version: 1, chunk: 'entities', entities: { kind: 'entlive', shards: 2 }, caps, normalize: keep })

type Rec = Record<string, unknown>
const rec = (g: GameState): Rec => g as unknown as Rec
const worldOf = (g: GameState): Rec => rec(g).world as Rec

const year = (age: number, lines = 1): LogYear => ({
  age,
  year: 2000 + age,
  entries: Array.from({ length: lines }, (_, i) => ({ id: `l${age}-${i}`, text: `I did thing ${i} at ${age}.`, tone: 'neutral' as const })),
})

/** A fresh state with the schema field second, as the engine writes it, and a flags object with the economy in the middle. */
function base(): GameState {
  const { version, ...rest } = makeTestGame(1)
  return { version, schemaVersion: SAVE_SCHEMA, ...rest } as GameState
}

/** A state with a world economy flag, a test flag and a world container, built from scratch on every call (never mutated after). */
function busy(opts: { hot?: boolean; ageTo?: number } = {}): GameState {
  const g = base()
  g.flags = { before: 1, worldEconomy: { v: 2, year: 2026, countries: { us: { gdp: 1 }, fr: { gdp: 2 } } }, testChunk: { n: 1, list: [1, 2, 3] }, after: 'x' }
  g.log = Array.from({ length: (opts.ageTo ?? 25) + 1 }, (_, age) => year(age))
  g.character.age = opts.ageTo ?? 25
  rec(g).world = {
    ledger: { total: 5, rows: [1, 2] },
    testrec: { rows: [{ a: 1 }, { a: 2 }] },
    ...(opts.hot ? { testhot: { n: 1 } } : {}),
  }
  return g
}

/** An entity record of `n` entries with keys in ascending order, each a small object. */
function entities(n: number, tag = 0): Record<string, { v: number }> {
  const out: Record<string, { v: number }> = {}
  for (let i = 0; i < n; i++) out[`e${String(i).padStart(4, '0')}`] = { v: i + tag }
  return out
}

/** A copy of g that shares every root with it except what `change` replaces (the shape act() hands a draft, R2-S8). */
function sharing(g: GameState): GameState {
  return { ...g, character: { ...g.character }, flags: { ...g.flags }, log: [...g.log], world: { ...worldOf(g) } } as GameState
}

const chunkNames = (e: EncodedSave): string[] => Object.keys(e.manifest)
const idOf = (e: EncodedSave, name: string): string => e.manifest[name]!.id

beforeEach(() => resetCodecCachesForTests())
afterEach(() => vi.restoreAllMocks())

describe('the head', () => {
  it('is valid JSON with the key order of the state, then chunks and sv', () => {
    const g = busy()
    const e = encodeSave(g)
    const head = JSON.parse(e.head) as Rec
    const inlineKeys = Object.keys(JSON.parse(JSON.stringify(g)) as Rec)
    expect(Object.keys(head)).toEqual([...inlineKeys, HEAD_CHUNKS_KEY, HEAD_VERSIONS_KEY])
    expect(HEAD_CHUNKS_KEY).toBe('chunks')
    expect(HEAD_VERSIONS_KEY).toBe('sv')
    // schemaVersion keeps its place (second), and says 3.
    expect(Object.keys(head)[1]).toBe('schemaVersion')
    expect(head.schemaVersion).toBe(SAVE_SCHEMA)
    // The economy sits where it was, among the other flags, holding its placeholder.
    const flags = head.flags as Rec
    expect(Object.keys(flags)).toEqual(['before', 'worldEconomy', 'testChunk', 'after'])
    expect(flags.worldEconomy).toBe('~flags.worldEconomy')
    expect(flags.testChunk).toBe('~flags.testChunk')
    expect(flags.before).toBe(1)
    expect(flags.after).toBe('x')
    // The world container stays in the core: the replace shard is a placeholder, the ledger is inline.
    const world = head.world as Rec
    expect(Object.keys(world)).toEqual(['ledger', 'testrec'])
    expect(world.testrec).toBe('~world.testrec')
    expect(world.ledger).toEqual({ total: 5, rows: [1, 2] })
  })

  it('is exactly this text for a tiny hand-made game (the layout cannot drift unseen)', () => {
    const g = {
      version: '5.0.0',
      schemaVersion: 3,
      lifeId: 'l1',
      rng: 7,
      nextId: 2,
      year: 2030,
      generation: 1,
      character: { age: 12 },
      people: [],
      assets: [],
      log: [
        { age: 10, year: 2028, entries: [] },
        { age: 11, year: 2029, entries: [] },
        { age: 12, year: 2030, entries: [] },
      ],
      queue: [],
      ancestors: [],
      counters: {},
      yearActions: {},
      flags: { a: 1, worldEconomy: { v: 2, year: 2030 }, z: true },
      ribbon: null,
      obituary: null,
    } as unknown as GameState
    const e = encodeSave(g)
    // Everything up to the sv map is pinned to the character. The sv map is checked against the table on its own below, so a slice
    // a later task adds does not move this golden.
    const expected =
      '{"version":"5.0.0","schemaVersion":3,"lifeId":"l1","rng":7,"nextId":2,"year":2030,"generation":1,"character":{"age":12},' +
      '"people":[],"assets":[],"log":[{"age":12,"year":2030,"entries":[]}],"queue":[],"ancestors":[],"counters":{},"yearActions":{},' +
      '"flags":{"a":1,"worldEconomy":"~flags.worldEconomy","z":true},"ribbon":null,"obituary":null,' +
      '"chunks":{"world":{"id":"world.1bt3x4216fei3q16","len":42},"log.1":{"id":"log.1.98knrl157nv3d21","len":73}}'
    expect(e.head.slice(0, e.head.indexOf(',"sv":'))).toBe(expected)
    expect(e.head.endsWith('}')).toBe(true)
    expect(e.chunks.get('world.1bt3x4216fei3q16')).toBe('{"flags.worldEconomy":{"v":2,"year":2030}}')
    expect(e.chunks.get('log.1.98knrl157nv3d21')).toBe('[{"age":10,"year":2028,"entries":[]},{"age":11,"year":2029,"entries":[]}]')
    expect(e.chunks.size).toBe(2)
  })

  it('names the version of every declared slice in sv, sorted by key', () => {
    const head = JSON.parse(encodeSave(busy()).head) as Rec
    const sv = head[HEAD_VERSIONS_KEY] as Record<string, number>
    expect(sv).toEqual(Object.fromEntries(listSlices().map((s) => [s.key, s.version])))
    expect(Object.keys(sv)).toEqual(listSlices().map((s) => s.key))
    // The real rows are in it, and each is at version 1 (the shape v4.1.1 wrote).
    for (const key of ['character', 'flags', 'flags.worldEconomy', 'log', 'world', 'world.ledger']) expect(sv[key], key).toBe(1)
  })

  it('is a head with an empty manifest when nothing is big enough to move', () => {
    const g = base()
    const e = encodeSave(g)
    const head = JSON.parse(e.head) as Rec
    expect(head[HEAD_CHUNKS_KEY]).toEqual({})
    expect(e.chunks.size).toBe(0)
    expect(chunkNames(e)).toEqual([])
    // Without an economy, a world or a long log, the head holds the whole state under its own keys.
    const state = { ...head }
    delete state[HEAD_CHUNKS_KEY]
    delete state[HEAD_VERSIONS_KEY]
    expect(JSON.stringify(state)).toBe(JSON.stringify(g))
  })
})

describe('the caches', () => {
  it('stringifies no slice on a second encode of the same state, and returns the same head', () => {
    const g = busy()
    const first = encodeSave(g)
    expect(first.stats.stringified).toBeGreaterThan(0)
    const second = encodeSave(g)
    expect(second.head).toBe(first.head)
    expect(second.stats.stringified).toBe(0)
    expect([...second.chunks]).toEqual([...first.chunks])
    expect(second.manifest).toEqual(first.manifest)
  })

  it('reads a structural clone that shares the replace roots as free, and gives the same chunk ids', () => {
    const g = busy()
    const first = encodeSave(g)
    const clone = sharing(g)
    const second = encodeSave(clone)
    expect(second.stats.stringified).toBe(0)
    expect(second.manifest).toEqual(first.manifest)
    expect(second.head).toBe(first.head)
    // A deep copy shares nothing, so its slices are stringified again; the ids are content addressed and still equal.
    const deep = structuredClone(g)
    const third = encodeSave(deep)
    expect(third.stats.stringified).toBeGreaterThan(0)
    expect(third.manifest).toEqual(first.manifest)
    expect(third.head).toBe(first.head)
  })

  it('gives the same ids and head after the caches are dropped (ids depend on text only)', () => {
    const g = busy()
    const first = encodeSave(g)
    resetCodecCachesForTests()
    const again = encodeSave(structuredClone(g))
    expect(again.head).toBe(first.head)
    expect([...again.chunks]).toEqual([...first.chunks])
  })

  it('changes the world chunk id and nothing else when a fresh economy root has one number changed', () => {
    const g = busy()
    const first = encodeSave(g)
    const next = sharing(g)
    next.flags.worldEconomy = { v: 2, year: 2026, countries: { us: { gdp: 1 }, fr: { gdp: 3 } } } as never
    const second = encodeSave(next)
    expect(chunkNames(second)).toEqual(chunkNames(first))
    expect(idOf(second, 'world')).not.toBe(idOf(first, 'world'))
    for (const name of chunkNames(first).filter((n) => n !== 'world')) expect(idOf(second, name), name).toBe(idOf(first, name))
    // Only the economy was stringified again.
    expect(second.stats.stringified).toBe(1)
  })

  it('changes one log chunk id and nothing else when a completed year is replaced', () => {
    const g = busy({ ageTo: 25 })
    const first = encodeSave(g)
    expect(chunkNames(first)).toEqual(expect.arrayContaining(['log.0', 'log.1', 'log.2']))
    const next = sharing(g)
    next.log[13] = { ...year(13), entries: [{ id: 'new', text: 'A line that was not there.', tone: 'good' }] }
    const second = encodeSave(next)
    expect(chunkNames(second)).toEqual(chunkNames(first))
    for (const name of chunkNames(first)) {
      if (name === 'log.1') expect(idOf(second, name)).not.toBe(idOf(first, name))
      else expect(idOf(second, name), name).toBe(idOf(first, name))
    }
    expect(second.stats.stringified).toBe(1)
  })

  it('does not cache an in-place slice: it is stringified every time, and its chunk is not rewritten when its text is unchanged', () => {
    const g = busy({ hot: true })
    const first = encodeSave(g)
    const second = encodeSave(g)
    // The one in-place shard is stringified again on the second encode, nothing else is.
    expect(second.stats.stringified).toBe(1)
    expect(idOf(second, 'world')).toBe(idOf(first, 'world'))
    expect(second.chunks.get(idOf(second, 'world'))).toBe(first.chunks.get(idOf(first, 'world')))
    // Edited in place: the text changes, so the id does.
    ;(worldOf(g).testhot as Rec).n = 2
    const third = encodeSave(g)
    expect(third.stats.stringified).toBe(1)
    expect(idOf(third, 'world')).not.toBe(idOf(first, 'world'))
    expect(third.chunks.get(idOf(third, 'world'))).toContain('"testhot":{"n":2}')
    // Never frozen: the in-place shard stays writable.
    expect(Object.isFrozen(worldOf(g).testhot)).toBe(false)
  })

  it('freezes a replace root it caches, so an in-place write is a TypeError and not a stale cache', () => {
    const g = busy()
    encodeSave(g)
    expect(Object.isFrozen(g.flags.worldEconomy)).toBe(true)
    expect(Object.isFrozen(worldOf(g).testrec)).toBe(true)
    expect(Object.isFrozen(g.log[3])).toBe(true)
    expect(() => {
      ;(g.flags.worldEconomy as Rec).year = 2027
    }).toThrow(TypeError)
    // The tail year and the core are not roots: they stay writable.
    expect(Object.isFrozen(g.log[g.log.length - 1])).toBe(false)
    expect(Object.isFrozen(g.character)).toBe(false)
    expect(Object.isFrozen(g.flags)).toBe(false)
    expect(Object.isFrozen(worldOf(g))).toBe(false)
  })
})

describe('the life log', () => {
  it('keeps the last LOG_TAIL years in the head and groups the completed years by decade of age', () => {
    expect(LOG_TAIL).toBe(1)
    expect(LOG_GROUP_YEARS).toBe(10)
    const g = busy({ ageTo: 25 })
    const e = encodeSave(g)
    const head = JSON.parse(e.head) as { log: LogYear[] }
    expect(head.log.map((y) => y.age)).toEqual([25])
    const logChunks = chunkNames(e).filter((n) => n.startsWith('log.'))
    expect(logChunks).toEqual(['log.0', 'log.1', 'log.2'])
    const ages = logChunks.map((n) => (JSON.parse(e.chunks.get(idOf(e, n))!) as LogYear[]).map((y) => y.age))
    expect(ages[0]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(ages[1]).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19])
    expect(ages[2]).toEqual([20, 21, 22, 23, 24])
    // Chunks and tail together are the whole log, in order.
    const whole = [...logChunks.flatMap((n) => JSON.parse(e.chunks.get(idOf(e, n))!) as LogYear[]), ...head.log]
    expect(JSON.stringify(whole)).toBe(JSON.stringify(g.log))
  })

  it('writes no log chunk for an empty log or a log of one year', () => {
    const none = base()
    none.log = []
    const one = base()
    one.log = [year(0)]
    for (const g of [none, one]) {
      const e = encodeSave(g)
      expect(chunkNames(e).filter((n) => n.startsWith('log.'))).toEqual([])
      expect((JSON.parse(e.head) as { log: unknown[] }).log).toEqual(g.log)
    }
    const two = base()
    two.log = [year(0), year(1)]
    const e = encodeSave(two)
    expect(chunkNames(e)).toEqual(['log.0'])
    expect((JSON.parse(e.head) as { log: LogYear[] }).log.map((y) => y.age)).toEqual([1])
  })

  it('keeps a completed year in the head when the log is out of age order (a chunk must never reorder the log)', () => {
    const g = base()
    // A life log is ascending in age; this one dips into an earlier decade. The years from the dip on stay in the head, in place.
    g.log = [year(3), year(15), year(5), year(16), year(17)]
    const e = encodeSave(g)
    expect(chunkNames(e)).toEqual(['log.0', 'log.1'])
    const head = JSON.parse(e.head) as { log: LogYear[] }
    const whole = [...chunkNames(e).flatMap((n) => JSON.parse(e.chunks.get(idOf(e, n))!) as LogYear[]), ...head.log]
    expect(JSON.stringify(whole)).toBe(JSON.stringify(g.log))
    expect(head.log.map((y) => y.age)).toEqual([5, 16, 17])
    // A year that is not a log year at all stops the chunking there too.
    const odd = base()
    odd.log = [year(1), 5 as unknown as LogYear, year(2), year(3)]
    const o = encodeSave(odd)
    expect(JSON.stringify([...chunkNames(o).flatMap((n) => JSON.parse(o.chunks.get(idOf(o, n))!) as LogYear[]), ...(JSON.parse(o.head) as { log: LogYear[] }).log])).toBe(JSON.stringify(odd.log))
  })

  it('numbers a log chunk by the decade of age, 0 to 12 for a life of 129 years', () => {
    const g = base()
    g.log = [year(0), year(129), year(130)]
    const e = encodeSave(g)
    expect(chunkNames(e)).toEqual(['log.0', 'log.12'])
    for (const name of chunkNames(e)) expect(idOf(e, name)).toMatch(CHUNK_ID_PATTERN)
  })
})

describe('entity shards', () => {
  const withEntities = (rows: Record<string, unknown>, name = 'testent'): GameState => {
    const g = base()
    rec(g).world = { [name]: rows }
    return g
  }
  const shardChunks = (e: EncodedSave, kind: string): string[] => chunkNames(e).filter((n) => n.startsWith(`e.${kind}.`))

  it('splits 40 entries into at most 4 chunks by a hash of the key, each a JSON object, with the placeholder in the world object', () => {
    const g = withEntities(entities(40))
    const e = encodeSave(g)
    const shards = shardChunks(e, 'testent')
    expect(shards.length).toBeGreaterThan(1)
    expect(shards.length).toBeLessThanOrEqual(4)
    expect((JSON.parse(e.head) as { world: Rec }).world.testent).toBe('~world.testent')
    const seen: string[] = []
    for (const name of shards) {
      const n = Number(name.split('.')[2])
      const part = JSON.parse(e.chunks.get(idOf(e, name))!) as Record<string, unknown>
      expect(Array.isArray(part)).toBe(false)
      for (const key of Object.keys(part)) {
        expect(shardOf(key, 4), key).toBe(n)
        seen.push(key)
      }
      // Within a shard the keys stay in ascending order.
      expect(Object.keys(part)).toEqual([...Object.keys(part)].sort())
    }
    expect(seen.sort()).toEqual(Object.keys(entities(40)))
    // Nothing of it rides in the world chunk.
    expect(chunkNames(e)).not.toContain('world')
    expect(e.stats.unsortedEntities).toEqual([])
  })

  it('writes the shard of a changed entry again and no other, and stringifies that one shard only', () => {
    const g = withEntities(entities(40))
    const first = encodeSave(g)
    const old = worldOf(g).testent as Record<string, unknown>
    // A new root that shares every entry but one with the old: the shape a writer that replaces the record leaves.
    const next = withEntities({ ...old, e0007: { v: 999 } })
    const stringify = vi.spyOn(JSON, 'stringify')
    const second = encodeSave(next)
    // The head, plus the one shard that holds e0007. The other shards' entries are the same objects as before.
    expect(stringify).toHaveBeenCalledTimes(2)
    stringify.mockRestore()
    expect(second.stats.stringified).toBe(1)
    const changedShard = `e.testent.${shardOf('e0007', 4)}`
    expect(chunkNames(second)).toEqual(chunkNames(first))
    for (const name of shardChunks(first, 'testent')) {
      if (name === changedShard) expect(idOf(second, name)).not.toBe(idOf(first, name))
      else expect(idOf(second, name), name).toBe(idOf(first, name))
    }
  })

  it('stringifies no shard for a second encode of the same record or of a clone that shares it (only the head is stringified)', () => {
    const g = withEntities(entities(40))
    encodeSave(g)
    expect(encodeSave(g).stats.stringified).toBe(0)
    const stringify = vi.spyOn(JSON, 'stringify')
    expect(encodeSave(sharing(g)).stats.stringified).toBe(0)
    expect(stringify).toHaveBeenCalledTimes(1)
  })

  it('lets a record whose keys are not in ascending order ride whole in the world chunk, and says so in stats', () => {
    const rows = { b: { v: 1 }, a: { v: 2 } }
    const g = withEntities(rows)
    const e = encodeSave(g)
    expect(shardChunks(e, 'testent')).toEqual([])
    expect(chunkNames(e)).toEqual(['world'])
    expect(e.stats.unsortedEntities).toEqual(['world.testent'])
    expect(e.chunks.get(idOf(e, 'world'))).toBe('{"world":{"testent":{"b":{"v":1},"a":{"v":2}}}}')
    expect((JSON.parse(e.head) as { world: Rec }).world.testent).toBe('~world.testent')
    // A key named __proto__ is never eligible either.
    const hostile = withEntities(JSON.parse('{"__proto__":{"v":1},"b":{"v":2}}') as Record<string, unknown>)
    const h = encodeSave(hostile)
    expect(shardChunks(h, 'testent')).toEqual([])
    expect(h.stats.unsortedEntities).toEqual(['world.testent'])
    expect(({} as Rec).v).toBeUndefined()
  })

  it('writes nothing for an empty record and leaves it where it was', () => {
    const g = withEntities({})
    const e = encodeSave(g)
    expect(chunkNames(e)).toEqual([])
    expect((JSON.parse(e.head) as { world: Rec }).world).toEqual({ testent: {} })
    expect(e.stats.unsortedEntities).toEqual([])
  })

  it('keeps an in-place entity record uncached but content addressed', () => {
    const g = withEntities(entities(8), 'entlive')
    const first = encodeSave(g)
    const second = encodeSave(g)
    expect(second.stats.stringified).toBe(shardChunks(second, 'entlive').length)
    expect(second.manifest).toEqual(first.manifest)
    expect(Object.isFrozen(worldOf(g).entlive)).toBe(false)
  })

  it('moves a kind that would pass MAX_CHUNKS into the world chunk instead, whole, and never passes MAX_CHUNKS', () => {
    const g = base()
    const world: Rec = {}
    for (const kind of MANY) world[kind] = entities(400, kind.charCodeAt(1))
    rec(g).world = world
    g.log = Array.from({ length: 40 }, (_, age) => year(age))
    const e = encodeSave(g)
    expect(chunkNames(e).length).toBeLessThanOrEqual(MAX_CHUNKS)
    // 96 records, less the world chunk and the four log chunks, leaves 91: five kinds of sixteen shards fit, the sixth and seventh ride whole.
    const sharded = MANY.filter((k) => shardChunks(e, k).length > 0)
    const rode = MANY.filter((k) => shardChunks(e, k).length === 0)
    expect(sharded).toEqual(['ea', 'eb', 'ec', 'ed', 'ee'])
    expect(rode).toEqual(['ef', 'eg'])
    expect(chunkNames(e)).toContain('world')
    const worldText = JSON.parse(e.chunks.get(idOf(e, 'world'))!) as { world: Rec }
    for (const kind of rode) expect(Object.keys(worldText.world[kind] as Rec)).toHaveLength(400)
    // The head still holds a placeholder for every one of them.
    const head = JSON.parse(e.head) as { world: Rec }
    for (const kind of MANY) expect(head.world[kind]).toBe(`~world.${kind}`)
  })
})

describe('the manifest and the chunks', () => {
  it('records the length and a content address for every chunk', () => {
    const g = busy({ hot: true })
    rec(g).world = { ...worldOf(g), testent: entities(40) }
    const e = encodeSave(g)
    expect(chunkNames(e).length).toBeGreaterThan(3)
    expect(chunkNames(e).length).toBeLessThanOrEqual(MAX_CHUNKS)
    expect(e.chunks.size).toBe(chunkNames(e).length)
    for (const name of chunkNames(e)) {
      const ref = e.manifest[name]!
      const text = e.chunks.get(ref.id)
      expect(text, name).toBeDefined()
      expect(ref.len, name).toBe(text!.length)
      expect(ref.id, name).toMatch(CHUNK_ID_PATTERN)
      expect(ref.id.startsWith(`${name}.`), name).toBe(true)
      expect(ref.id.slice(name.length + 1), name).toBe(textSum(text!))
      expect(e.stats.chunkChars[name], name).toBe(text!.length)
      expect(text!.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS)
    }
    // The head records exactly this manifest, in the documented order: world, then the log decades, then entity shards.
    expect((JSON.parse(e.head) as { chunks: unknown }).chunks).toEqual(e.manifest)
    const names = chunkNames(e)
    expect(names[0]).toBe('world')
    expect(names.slice(1).filter((n) => n.startsWith('log.'))).toEqual(names.filter((n) => n.startsWith('log.')))
    expect(names.findIndex((n) => n.startsWith('e.'))).toBeGreaterThan(names.findIndex((n) => n.startsWith('log.')))
    expect(e.stats.coreChars).toBe(e.head.length)
  })

  it('names chunks by the grammar and checksums by textSum', () => {
    expect(CHUNK_ID_PATTERN.test('world.1bt3x4216fei3q16')).toBe(true)
    expect(CHUNK_ID_PATTERN.test('log.12.98knrl157nv3d21')).toBe(true)
    expect(CHUNK_ID_PATTERN.test('e.testent.3.98knrl157nv3d21')).toBe(true)
    for (const bad of ['core.abcdef', 'world.', 'world.abc', 'world.ABCDEF', 'log.123.abcdef', 'log.x.abcdef', 'e..1.abcdef', 'e.UP.1.abcdef', 'world.abcdef.', 'world/abcdef', 'world.abcdef\n']) {
      expect(CHUNK_ID_PATTERN.test(bad), bad).toBe(false)
    }
  })

  it('throws, rather than store, a chunk over MAX_CHUNK_CHARS (the caller treats a throw as a failed save)', () => {
    const g = base()
    g.flags = { worldEconomy: { v: 2, blob: 'x'.repeat(MAX_CHUNK_CHARS + 1) } }
    expect(() => encodeSave(g)).toThrow(/MAX_CHUNK_CHARS/)
  })
})

describe('textSum', () => {
  /** The checksum save.ts uses for Time Machine chunks (hashText), copied here as the reference. */
  function reference(s: string): string {
    let a = 0x811c9dc5
    let b = 0x01000193 ^ s.length
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i)
      a = Math.imul(a ^ c, 16777619)
      b = Math.imul(b ^ c, 0x5bd1e995)
      b ^= b >>> 13
    }
    return `${(a >>> 0).toString(36)}${(b >>> 0).toString(36)}${s.length.toString(36)}`
  }

  it('is two 32-bit hashes and the length in base 36, the same as hashText', () => {
    for (const s of ['', 'a', '{}', '{"flags.worldEconomy":{"v":2,"year":2030}}', 'café \u{1F600}', 'x'.repeat(10_000)]) expect(textSum(s)).toBe(reference(s))
    expect(textSum('{"flags.worldEconomy":{"v":2,"year":2030}}')).toBe('1bt3x4216fei3q16')
  })

  it('is a pure function of the text and tells nearby texts apart', () => {
    expect(textSum('abc')).toBe(textSum('ab' + 'c'))
    const sums = new Set<string>()
    for (let i = 0; i < 500; i++) sums.add(textSum(`{"n":${i}}`))
    expect(sums.size).toBe(500)
    expect(textSum('abc')).toMatch(/^[0-9a-z]+$/)
  })
})

describe('what the encoder leaves alone', () => {
  it('never mutates the state, even a deep-frozen one, and never reads a random number', () => {
    const g = busy({ hot: true })
    rec(g).world = { ...worldOf(g), testent: entities(12) }
    const before = JSON.stringify(g)
    const random = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('the codec drew a random number')
    })
    const rng = g.rng
    const plain = encodeSave(g)
    expect(JSON.stringify(g)).toBe(before)
    expect(g.rng).toBe(rng)
    // Deep-frozen, as the fuzz kit leaves it (test/fuzz-kit.ts): it still encodes, to the same text.
    const frozen = structuredClone(g)
    const freeze = (v: unknown): void => {
      if (typeof v !== 'object' || v === null || Object.isFrozen(v)) return
      Object.freeze(v)
      for (const k of Object.keys(v)) freeze((v as Rec)[k])
    }
    freeze(frozen)
    const second = encodeSave(frozen)
    expect(second.head).toBe(plain.head)
    expect(JSON.stringify(frozen)).toBe(before)
    expect(random).not.toHaveBeenCalled()
  })

  it('is inlineSave when the state is stored whole: JSON.stringify(g), a valid record with no chunks key', () => {
    const g = busy()
    expect(inlineSave(g)).toBe(JSON.stringify(g))
    const parsed = JSON.parse(inlineSave(g)) as Rec
    expect(parsed).not.toHaveProperty(HEAD_CHUNKS_KEY)
    expect(parsed).not.toHaveProperty(HEAD_VERSIONS_KEY)
    expect(parsed.schemaVersion).toBe(SAVE_SCHEMA)
    // The head, with the placeholders put back and chunks and sv taken out, is the same state.
    const e = encodeSave(g)
    const head = JSON.parse(e.head) as Rec
    expect(Object.keys(head).filter((k) => !(k in parsed))).toEqual([HEAD_CHUNKS_KEY, HEAD_VERSIONS_KEY])
  })

  it('keeps the ledger shard inline in the world object of the head: an in-place edit changes the head and no chunk id', () => {
    const g = busy()
    const first = encodeSave(g)
    expect((JSON.parse(first.head) as { world: Rec }).world.ledger).toEqual({ total: 5, rows: [1, 2] })
    // Every booking edits the ledger in place (R2-L2): the head text changes, the chunks are not touched.
    ;((worldOf(g).ledger as Rec).rows as number[]).push(3)
    ;(worldOf(g).ledger as Rec).total = 6
    const second = encodeSave(g)
    expect(second.head).not.toBe(first.head)
    expect((JSON.parse(second.head) as { world: Rec }).world.ledger).toEqual({ total: 6, rows: [1, 2, 3] })
    expect(second.manifest).toEqual(first.manifest)
    expect(second.stats.stringified).toBe(0)
    expect(Object.isFrozen(worldOf(g).ledger)).toBe(false)
    // A replace shard is the opposite: a fresh root changes the world chunk id and not the inline ledger.
    const next = sharing(g)
    ;(worldOf(next) as Rec).testrec = { rows: [{ a: 9 }] }
    const third = encodeSave(next)
    expect(idOf(third, 'world')).not.toBe(idOf(second, 'world'))
    expect((JSON.parse(third.head) as { world: Rec }).world.ledger).toEqual({ total: 6, rows: [1, 2, 3] })
  })

  it('leaves a value that is not a plain object or array in the head, so a placeholder can never collide with a real value', () => {
    const g = base()
    g.flags = { worldEconomy: 'just text', testChunk: 5 }
    rec(g).world = { testrec: 7, other: 'x' }
    const e = encodeSave(g)
    expect(chunkNames(e)).toEqual([])
    const head = JSON.parse(e.head) as { flags: Rec; world: Rec }
    expect(head.flags).toEqual({ worldEconomy: 'just text', testChunk: 5 })
    expect(head.world).toEqual({ testrec: 7, other: 'x' })
    // Empty containers stay where they are too: moving `{}` out would cost more than it saves.
    const empty = base()
    empty.flags = { worldEconomy: {}, testChunk: [] }
    expect(chunkNames(encodeSave(empty))).toEqual([])
  })

  it('reads a state with no world, no flags and a world that is not an object without throwing', () => {
    const none = base()
    expect((JSON.parse(encodeSave(none).head) as Rec).world).toBeUndefined()
    const odd = base()
    rec(odd).world = 'nope'
    expect((JSON.parse(encodeSave(odd).head) as Rec).world).toBe('nope')
    const noFlags = base()
    delete (noFlags as unknown as Rec).flags
    expect(() => encodeSave(noFlags)).not.toThrow()
    const list = base()
    rec(list).world = [1, 2]
    expect((JSON.parse(encodeSave(list).head) as Rec).world).toEqual([1, 2])
  })

  it('does not let a world key named like the prototype reach the prototype chain', () => {
    const g = base()
    rec(g).world = JSON.parse('{"__proto__":{"polluted":true},"testrec":{"a":1}}') as Rec
    const e = encodeSave(g)
    expect(({} as Rec).polluted).toBeUndefined()
    const head = JSON.parse(e.head) as { world: Rec }
    expect(Object.keys(head.world)).toEqual(['__proto__', 'testrec'])
    expect(head.world.testrec).toBe('~world.testrec')
  })

  it('writes one head even when the state already has a key called chunks or sv', () => {
    const g = busy()
    rec(g).chunks = { fake: true }
    rec(g).sv = { fake: 1 }
    const head = JSON.parse(encodeSave(g).head) as Rec
    expect(Object.keys(head).filter((k) => k === 'chunks' || k === 'sv')).toEqual(['chunks', 'sv'])
    expect(head.chunks).not.toHaveProperty('fake')
    expect(head.sv).not.toHaveProperty('fake')
  })
})

describe('a 15-year life with two companies', () => {
  it('splits into a small head and a few chunks, and the parts add up to the inline record plus a little overhead', () => {
    const g = probeLife({ seed: CODEC_LIFE_SEED, birthYear: 1990, businesses: 2, years: 15 })
    const inline = inlineSave(g)
    const e = encodeSave(g)
    const chunkTotal = Object.values(e.stats.chunkChars).reduce((a, b) => a + b, 0)
    // The world economy is most of a save: with it moved out the head is a fraction of the record.
    expect(e.head.length).toBeLessThan(inline.length / 3)
    expect(chunkNames(e)).toContain('world')
    expect(chunkNames(e).filter((n) => n.startsWith('log.')).length).toBeGreaterThan(0)
    // Splitting adds only the manifest, the sv map, the placeholders and the chunk wrappers; nothing is duplicated.
    // (The plan asked for fewer characters; chunking alone cannot do that. The diet and shape tables, R2-S10 and R2-S11, shrink it.)
    expect(e.head.length + chunkTotal).toBeGreaterThan(inline.length)
    expect(e.head.length + chunkTotal).toBeLessThan(inline.length + 4_000)
    const world = JSON.parse(e.chunks.get(idOf(e, 'world'))!) as Rec
    expect(world['flags.worldEconomy']).toEqual(JSON.parse(JSON.stringify(g.flags.worldEconomy)))
    expect(((JSON.parse(e.head) as { flags: Rec }).flags).worldEconomy).toBe('~flags.worldEconomy')
    // Encoding it again costs no slice, and the second head is the first.
    const again = encodeSave(g)
    expect(again.head).toBe(e.head)
    expect(again.stats.stringified).toBe(0)
    // The head is the state in the state's key order.
    expect(Object.keys(JSON.parse(e.head) as Rec)).toEqual([...Object.keys(JSON.parse(inline) as Rec), HEAD_CHUNKS_KEY, HEAD_VERSIONS_KEY])
  }, 120_000)
})
