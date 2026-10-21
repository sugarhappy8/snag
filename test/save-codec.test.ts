// ci: fast
// R2-S3 (K.5 c) and R2-S4 (K.5 d): the chunk codec (src/game/save-codec.ts). A GameState becomes a head string and a map of chunk
// strings (the first half of this file), and a head with its chunk texts becomes the same GameState again, exactly, with every
// hostile or missing chunk a bounded loss and never a crash (the second half, from "assembleSave" down).
//
// The encoder: the head is the core (everything player-side, in the key order of GameState) with a placeholder string
// "~<slice key>" where a bigger slice was moved out, then a `chunks` manifest and an `sv` map of slice versions. The text and
// checksum of every `replace` slice is cached by object identity, so a tap re-stringifies only the core. Pure: no storage, no
// random numbers, and nothing calls it yet.
//
// The synthetic slices below are declared in this file (the registry is global per test file), under keys no game uses, so the real
// table is what the 15-year life at the end exercises and the synthetic rows are what the cache and shard cases exercise.
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ageUp } from '../src/game/aging'
import { economyState } from '../src/game/economy/model'
import { unpackShapes } from '../src/game/kernel/shapes'
import { LOG_GROUP_YEARS, LOG_TAIL, defineSlice, listSlices } from '../src/game/kernel/slices'
import {
  CHUNK_ID_PATTERN,
  HEAD_CHUNKS_KEY,
  HEAD_VERSIONS_KEY,
  MAX_CHUNKS,
  MAX_CHUNK_CHARS,
  assembleSave,
  encodeSave,
  inlineSave,
  isChunkedHead,
  neededChunkIds,
  resetCodecCachesForTests,
  shardOf,
  textSum,
  type Assembled,
  type EncodedSave,
  type LostChunk,
} from '../src/game/save-codec'
import { isLoadableGame, migrateSave, SAVE_SCHEMA } from '../src/game/save-schema'
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
    // Splitting alone adds only the manifest, the sv map, the placeholders and the chunk wrappers (at most 4,000 characters more than
    // the inline record, as R2-S3 pinned it). R2-S11's shape tables take the key names out of the economy, which is most of this life:
    // the parts are now about half of the inline record (0.54 measured), so the old "a little more than inline" bound moves, on purpose.
    // Nothing is lost: the economy in the world chunk unpacks to the plain economy, and the reload tests below prove the whole record.
    expect(e.head.length + chunkTotal).toBeLessThan(inline.length * 0.6)
    const world = JSON.parse(e.chunks.get(idOf(e, 'world'))!) as Rec
    expect(Object.keys(world['flags.worldEconomy'] as Rec)).toEqual(['$s', '$v'])
    expect(unpackShapes(world['flags.worldEconomy'])).toEqual(JSON.parse(JSON.stringify(g.flags.worldEconomy)))
    expect(((JSON.parse(e.head) as { flags: Rec }).flags).worldEconomy).toBe('~flags.worldEconomy')
    // Encoding it again costs no slice, and the second head is the first.
    const again = encodeSave(g)
    expect(again.head).toBe(e.head)
    expect(again.stats.stringified).toBe(0)
    // The head is the state in the state's key order.
    expect(Object.keys(JSON.parse(e.head) as Rec)).toEqual([...Object.keys(JSON.parse(inline) as Rec), HEAD_CHUNKS_KEY, HEAD_VERSIONS_KEY])
  }, 120_000)
})

// ---------------------------------------------------------------------------
// assembleSave (R2-S4): a head and its chunk texts become the state again

type Ready = Extract<Assembled, { kind: 'ready' }>

interface Parts {
  /** The head as a loader parses it. */
  head: Rec
  /** Chunk id to text, as a store hands them over (null: the store has no such record). */
  texts: Map<string, string | null>
  e: EncodedSave
}

function split(g: GameState): Parts {
  const e = encodeSave(g)
  return { head: JSON.parse(e.head) as Rec, texts: new Map(e.chunks), e }
}

type ManifestRows = Record<string, { id: string; len: number }>
const manifestOf = (p: Parts): ManifestRows => p.head[HEAD_CHUNKS_KEY] as ManifestRows
const textOf = (p: Parts, name: string): string => p.texts.get(manifestOf(p)[name]!.id) as string

/** Put `text` in the manifest under `name` with its true length and checksum, as a writer that meant it would. */
function forge(p: Parts, name: string, text: string): void {
  const id = `${name}.${textSum(text)}`
  manifestOf(p)[name] = { id, len: text.length }
  p.texts.set(id, text)
}

function ready(r: Assembled): Ready {
  if (r.kind !== 'ready') throw new Error(`expected a ready result, got ${JSON.stringify(r).slice(0, 300)}`)
  return r
}

const reload = (p: Parts): Ready => ready(assembleSave(p.head, p.texts))

/** What a loader finally plays: the assembled record goes through migrateSave with its slice versions and must be loadable. */
function expectLoadable(r: Ready): GameState {
  const m = migrateSave(r.game, { versions: r.versions })
  if (m.kind !== 'ready') throw new Error(`migrateSave said ${JSON.stringify(m)}`)
  expect(m.from).toBe(3)
  expect(isLoadableGame(m.game)).toBe(true)
  return m.game
}

const lostNames = (r: Ready): string[] => r.lost.map((l: LostChunk) => `${l.name}:${l.why}`).sort()

/** A loadable state with every kind of chunk: the economy, a test flag, a replace shard, an in-place shard, the ledger inline, 40 entities and a 25-year log. */
function full(): GameState {
  const g = busy({ hot: true })
  rec(g).world = { ...worldOf(g), testent: entities(40) }
  return g
}

const plain = (g: GameState): Rec => JSON.parse(inlineSave(g)) as Rec

describe('assembleSave: reload gives identical JSON', () => {
  const same = (g: GameState): Ready => {
    const p = split(g)
    const r = reload(p)
    expect(r.lost).toEqual([])
    expect(JSON.stringify(r.game)).toBe(inlineSave(g))
    expect(r.game).not.toHaveProperty(HEAD_CHUNKS_KEY)
    expect(r.game).not.toHaveProperty(HEAD_VERSIONS_KEY)
    expect(r.versions).toEqual(Object.fromEntries(listSlices().map((s) => [s.key, s.version])))
    return r
  }

  it('a plain test game, which has nothing big enough to move', () => {
    same(base())
  })

  it('a state with an economy, a replace shard, an in-place shard, the inline ledger, 40 entities and a 25-year log', () => {
    const r = same(full())
    expectLoadable(r)
  })

  it('a log that dips into an earlier decade, and a log of one year or none', () => {
    const dip = base()
    dip.log = [year(3), year(15), year(5), year(16), year(17)]
    same(dip)
    const one = base()
    one.log = [year(0)]
    same(one)
    const none = base()
    none.log = []
    same(none)
  })

  it('an entity record that rides whole in the world chunk (unsorted, or past MAX_CHUNKS), and an in-place entity record', () => {
    const g = base()
    rec(g).world = { testent: { b: { v: 1 }, a: { v: 2 } }, entlive: entities(8) }
    same(g)
    const many = base()
    const world: Rec = {}
    for (const kind of MANY) world[kind] = entities(400, kind.charCodeAt(1))
    rec(many).world = world
    many.log = Array.from({ length: 40 }, (_, age) => year(age))
    const r = same(many)
    expect(r.lost).toEqual([])
  })

  it('a world with keys named like the prototype, which stay inline and set nothing on any prototype', () => {
    const g = base()
    rec(g).world = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"x":1},"testrec":{"a":1}}') as Rec
    const r = same(g)
    expect(({} as Rec).polluted).toBeUndefined()
    expect(Object.getPrototypeOf(rec(r.game as never).world)).toBe(Object.prototype)
  })

  it('gives the same record when it is assembled twice, and leaves the head and the texts it was given as they were', () => {
    const g = full()
    const p = split(g)
    const headBefore = JSON.stringify(p.head)
    const textsBefore = JSON.stringify([...p.texts])
    const first = reload(p)
    const second = reload(p)
    expect(JSON.stringify(first.game)).toBe(JSON.stringify(second.game))
    expect(JSON.stringify(p.head)).toBe(headBefore)
    expect(JSON.stringify([...p.texts])).toBe(textsBefore)
    // The result shares nothing writable with the head: editing it does not reach the head or a second assemble.
    ;((first.game.flags as Rec).before as unknown) = 99
    ;(first.game.world as Rec).ledger = null
    expect(JSON.stringify(p.head)).toBe(headBefore)
    expect(JSON.stringify(reload(p).game)).toBe(inlineSave(g))
  })

  it('the heavy v4.1.1 fixture, after migrateSave brought it to schema 3', () => {
    const raw = JSON.parse(gunzipSync(readFileSync('test/fixtures/save-v4.1.1-heavy.json.gz')).toString()) as unknown
    const m = migrateSave(raw)
    const g = (m as { game: GameState }).game
    expect(m.kind).toBe('ready')
    const r = same(g)
    expectLoadable(r)
  }, 60_000)

  it('is the same after the chunk texts are checked and the slices are normalized once more (every real normalize is idempotent)', () => {
    const samples: unknown[] = [undefined, null, 0, 'x', [], [1], {}, { a: 1 }, { a: { b: [1, 2] } }, [{ age: 1, year: 2001, entries: [] }]]
    for (const def of listSlices()) {
      for (const raw of samples) {
        const once = def.normalize(raw)
        expect(def.normalize(once), `${def.key} of ${JSON.stringify(raw)}`).toEqual(once)
      }
    }
  })
})

describe('assembleSave on real lives', () => {
  let life: GameState | undefined
  const life15 = (): GameState => (life ??= probeLife({ seed: CODEC_LIFE_SEED, birthYear: 1990, businesses: 2, years: 15 }))

  it('reload of a 15-year life with two companies gives identical JSON, and the reloaded life is loadable', () => {
    const g = life15()
    const r = reload(split(g))
    expect(r.lost).toEqual([])
    expect(JSON.stringify(r.game)).toBe(inlineSave(g))
    expectLoadable(r)
  }, 120_000)

  it('the reloaded life plays the next year exactly as the original does', () => {
    const original = structuredClone(life15())
    const reloaded = expectLoadable(reload(split(life15())))
    for (const g of [original, reloaded]) {
      g.queue = []
      ageUp(g)
    }
    expect(JSON.stringify(reloaded)).toBe(JSON.stringify(original))
  }, 120_000)

  it('a lost world chunk leaves no economy, then the economy seeds at the current year and the life goes on', () => {
    const p = split(life15())
    p.texts.set(manifestOf(p).world!.id, null)
    const r = reload(p)
    expect(lostNames(r)).toEqual(['world:missing'])
    expect((r.game.flags as Rec).worldEconomy).toBeUndefined()
    const game = expectLoadable(r)
    const startYear = game.year
    game.queue = []
    ageUp(game)
    expect(game.character.alive).toBe(true)
    expect(game.year).toBe(startYear + 1)
    expect(economyState(game)?.year).toBe(game.year)
  }, 120_000)
})

describe('isChunkedHead and neededChunkIds', () => {
  const head = (over: Rec): Rec => ({ schemaVersion: 3, chunks: {}, ...over })

  it('accept a plain object at schema 3 or later with a plain-object manifest', () => {
    expect(isChunkedHead(head({}))).toBe(true)
    expect(isChunkedHead(head({ schemaVersion: 4 }))).toBe(true)
    expect(isChunkedHead(JSON.parse(encodeSave(full()).head))).toBe(true)
  })

  it('refuse everything else: an older schema, a schema that is not a whole number, a manifest that is not an object, junk', () => {
    for (const schemaVersion of [2, 1, 0, -3, 2.5, 3.5, '3', null, undefined, NaN, Infinity]) expect(isChunkedHead(head({ schemaVersion })), String(schemaVersion)).toBe(false)
    for (const chunks of [[], 'x', null, undefined, 7, true]) expect(isChunkedHead(head({ chunks })), JSON.stringify(chunks)).toBe(false)
    const noManifest = head({})
    delete noManifest.chunks
    expect(isChunkedHead(noManifest)).toBe(false)
    for (const junk of [null, undefined, 3, 'x', [], [{ schemaVersion: 3, chunks: {} }], true]) expect(isChunkedHead(junk)).toBe(false)
  })

  it('list the valid ids in manifest order', () => {
    const e = encodeSave(full())
    const h = JSON.parse(e.head) as Rec
    expect(neededChunkIds(h)).toEqual(Object.values(e.manifest).map((r) => r.id))
    expect(neededChunkIds(h).length).toBeGreaterThan(4)
  })

  it('drop an entry that fails the grammar or the length, and name nothing for a manifest that is not an object', () => {
    const good = { id: `world.${textSum('{}')}`, len: 2 }
    const h = head({ chunks: { world: good, core: { id: 'core.abcdef', len: 1 }, 'log.1': { id: 'log.2.abcdef', len: 1 }, 'log.2': { id: 'log.2.abcdef', len: -1 }, 'log.3': { id: 'log.3.abcdef', len: 1.5 } } })
    expect(neededChunkIds(h)).toEqual([good.id])
    for (const chunks of [[], 'x', null, 5]) expect(neededChunkIds(head({ chunks })), JSON.stringify(chunks)).toEqual([])
    for (const junk of [null, undefined, 3, 'x', []]) expect(neededChunkIds(junk as never)).toEqual([])
  })

  it('name at most MAX_CHUNKS ids however many entries the manifest holds', () => {
    const chunks: Rec = {}
    for (let i = 0; i < 100; i++) chunks[`e.k.${i}`] = { id: `e.k.${i}.abcdef`, len: 1 }
    const ids = neededChunkIds(head({ chunks }))
    expect(ids).toHaveLength(MAX_CHUNKS)
    expect(ids[0]).toBe('e.k.0.abcdef')
    expect(ids[MAX_CHUNKS - 1]).toBe(`e.k.${MAX_CHUNKS - 1}.abcdef`)
    const flood: Rec = {}
    for (let i = 0; i < 20_000; i++) flood[`k${i}`] = { id: 'x', len: 1 }
    expect(neededChunkIds(head({ chunks: flood }))).toEqual([])
  })
})

interface Hostile {
  name: string
  mutate: (p: Parts) => void
  /** The record is not a chunked head, or its manifest is not an object. */
  invalid?: true
  /** The losses, as `name:why`, when the case pins them. */
  lost?: string[] | ((p: Parts) => string[])
  /** The state the loader is left with: the encoded state after these edits (a plain copy). Absent: only "loadable" is asserted. */
  expected?: (o: Rec, p: Parts) => void
  /** The core itself was spoiled, so the record is not playable (migrateSave refuses it), but assembling it was still no crash. */
  unplayable?: true
}

const shardNo = (name: string): number => Number(name.split('.')[2])
const shardNamesOf = (p: Parts): string[] => Object.keys(manifestOf(p)).filter((n) => n.startsWith('e.testent.'))

/** What a lost world chunk takes with it: the economy, the test flag, the replace shard and the in-place shard. The inline ledger stays. */
const dropWorld = (o: Rec): void => {
  delete (o.flags as Rec).worldEconomy
  delete (o.flags as Rec).testChunk
  delete (o.world as Rec).testrec
  delete (o.world as Rec).testhot
}
const dropDecade =
  (n: number) =>
  (o: Rec): void => {
    o.log = (o.log as LogYear[]).filter((y) => Math.floor(y.age / LOG_GROUP_YEARS) !== n)
  }
const dropShard =
  (n: number) =>
  (o: Rec): void => {
    const ent = (o.world as Rec).testent as Rec
    for (const k of Object.keys(ent)) if (shardOf(k, 4) === n) delete ent[k]
  }

/** `n` completed log years that are valid and small: nodes pass the log cap before characters do. */
const manyYears = (n: number): string => `[${Array.from({ length: n }, () => '{"age":1,"year":2001,"entries":[]}').join(',')}]`

const HOSTILE: Hostile[] = [
  // --- the manifest
  { name: 'a manifest that is an array', mutate: (p) => void (p.head.chunks = []), invalid: true },
  { name: 'a manifest that is a string', mutate: (p) => void (p.head.chunks = 'chunks'), invalid: true },
  { name: 'a manifest that is null', mutate: (p) => void (p.head.chunks = null), invalid: true },
  {
    name: 'a manifest of 97 entries: the first 96 are read, the rest is a loss, and the real chunks still load',
    mutate: (p) => {
      const m = manifestOf(p)
      for (let i = 0; Object.keys(m).length < 97; i++) m[`e.fill.${i}`] = { id: `e.fill.${i}.abcdef`, len: 2 }
      expect(Object.keys(m)).toHaveLength(97)
    },
    expected: () => {},
  },
  {
    name: 'entries named outside the grammar (core, upper case, three digits, a prototype name)',
    mutate: (p) => {
      p.head.chunks = {
        ...manifestOf(p),
        core: { id: 'core.abcdef', len: 2 },
        World: { id: 'World.abcdef', len: 2 },
        'log.123': { id: 'log.123.abcdef', len: 2 },
        'e.UP.1': { id: 'e.UP.1.abcdef', len: 2 },
        ...(JSON.parse('{"__proto__":{"id":"world.abcdef","len":2}}') as Rec),
      }
    },
    lost: ['World:hostile', '__proto__:hostile', 'core:hostile', 'e.UP.1:hostile', 'log.123:hostile'],
    expected: () => {},
  },
  { name: 'an id that does not start with its own name', mutate: (p) => void (manifestOf(p).world!.id = `log.0.${textSum(textOf(p, 'world'))}`), lost: ['world:hostile'], expected: dropWorld },
  { name: 'an id with the right name and no dot after it', mutate: (p) => void (manifestOf(p).world!.id = `worlds${textSum(textOf(p, 'world'))}`), lost: ['world:hostile'], expected: dropWorld },
  ...[-1, 1.5, MAX_CHUNK_CHARS + 1, Number.MAX_SAFE_INTEGER, '5', null, true].map(
    (len): Hostile => ({ name: `a length of ${JSON.stringify(len)}`, mutate: (p) => void ((manifestOf(p).world as Rec).len = len), lost: ['world:hostile'], expected: dropWorld }),
  ),
  ...([5, null, [], 'x', { id: 5, len: 1 }, { id: 'world.abcdef' }, { len: 3 }] as unknown[]).map(
    (ref): Hostile => ({ name: `a manifest entry of ${JSON.stringify(ref)}`, mutate: (p) => void ((p.head.chunks as Rec).world = ref), lost: ['world:hostile'], expected: dropWorld }),
  ),
  // --- the texts
  {
    name: 'a text one character short',
    mutate: (p) => void p.texts.set(manifestOf(p).world!.id, textOf(p, 'world').slice(0, -1)),
    lost: ['world:hostile'],
    expected: dropWorld,
  },
  {
    name: 'a text altered in place, with the right length (the checksum differs)',
    mutate: (p) => {
      const text = textOf(p, 'world')
      const altered = text.replace('"n":1', '"n":9')
      expect(altered).not.toBe(text)
      expect(altered).toHaveLength(text.length)
      p.texts.set(manifestOf(p).world!.id, altered)
    },
    lost: ['world:hostile'],
    expected: dropWorld,
  },
  { name: 'a text nobody handed over', mutate: (p) => void p.texts.delete(manifestOf(p).world!.id), lost: ['world:missing'], expected: dropWorld },
  { name: 'a text that is null (the store has no such record)', mutate: (p) => void p.texts.set(manifestOf(p).world!.id, null), lost: ['world:missing'], expected: dropWorld },
  { name: 'a text that is not a string', mutate: (p) => void p.texts.set(manifestOf(p).world!.id, 42 as never), lost: ['world:missing'], expected: dropWorld },
  { name: 'a text that is not JSON (with a true length and checksum)', mutate: (p) => forge(p, 'world', 'not json {{'), lost: ['world:hostile'], expected: dropWorld },
  // --- the value of a chunk
  { name: 'a world chunk that is an array', mutate: (p) => forge(p, 'world', '[1,2,3]'), lost: ['world:hostile'], expected: dropWorld },
  { name: 'a world chunk that is a number', mutate: (p) => forge(p, 'world', '5'), lost: ['world:hostile'], expected: dropWorld },
  { name: 'a world chunk whose container is not an object', mutate: (p) => forge(p, 'world', '{"flags.worldEconomy":{"v":2,"year":2026},"world":5}'), lost: ['world:hostile'], expected: dropWorld },
  {
    name: 'a world chunk whose economy is a string: that one slice is dropped, the rest of the chunk loads',
    mutate: (p) => forge(p, 'world', '{"flags.testChunk":{"n":7},"flags.worldEconomy":"text","world":{"testrec":{"rows":[]},"testhot":3}}'),
    lost: ['world:hostile'],
    expected: (o) => {
      const flags = o.flags as Rec
      flags.testChunk = { n: 7 }
      delete flags.worldEconomy
      const world = o.world as Rec
      world.testrec = { rows: [] }
      world.testhot = 3
    },
  },
  { name: 'a log chunk that is an object', mutate: (p) => forge(p, 'log.1', '{}'), lost: ['log.1:hostile'], expected: dropDecade(1) },
  { name: 'a log chunk of numbers', mutate: (p) => forge(p, 'log.1', '[1,2]'), lost: ['log.1:hostile'], expected: dropDecade(1) },
  { name: 'a log chunk whose year has no entries', mutate: (p) => forge(p, 'log.1', '[{"age":10,"year":2010}]'), lost: ['log.1:hostile'], expected: dropDecade(1) },
  { name: 'a log chunk whose entry has no text', mutate: (p) => forge(p, 'log.1', '[{"age":10,"year":2010,"entries":[{"id":"a","tone":"good"}]}]'), lost: ['log.1:hostile'], expected: dropDecade(1) },
  {
    name: 'an entity shard that is an array',
    mutate: (p) => forge(p, shardNamesOf(p)[0]!, '[1]'),
    lost: (p) => [`${shardNamesOf(p)[0]!}:hostile`],
    expected: (o, p) => dropShard(shardNo(shardNamesOf(p)[0]!))(o),
  },
  // --- size and shape bombs
  { name: 'a node bomb: a log chunk of 128,000 nodes against a cap of 120,000', mutate: (p) => forge(p, 'log.0', manyYears(32_000)), lost: ['log.0:size'], expected: dropDecade(0) },
  {
    name: 'a character bomb: a log chunk of 1.3 million characters against a cap of 1.2 million',
    mutate: (p) => forge(p, 'log.0', `[{"age":1,"year":2001,"entries":[{"id":"a","text":"${'x'.repeat(1_300_000)}","tone":"neutral"}]}]`),
    lost: ['log.0:size'],
    expected: dropDecade(0),
  },
  {
    name: 'a depth bomb: a world chunk of objects nested 50,000 deep',
    mutate: (p) => forge(p, 'world', `{"flags.worldEconomy":${'{"a":'.repeat(50_000)}1${'}'.repeat(50_000)}}`),
    lost: ['world:hostile'],
    expected: dropWorld,
  },
  {
    name: 'a depth bomb of arrays (the economy slice refuses it as not an object, so it is dropped even before the depth is read)',
    mutate: (p) => forge(p, 'world', `{"flags.worldEconomy":${'['.repeat(50_000)}${']'.repeat(50_000)}}`),
    lost: ['world:hostile'],
    expected: dropWorld,
  },
  { name: 'a number that is not finite (1e999)', mutate: (p) => forge(p, 'world', '{"flags.worldEconomy":{"x":1e999}}'), lost: ['world:hostile'], expected: dropWorld },
  // --- prototype names
  {
    name: 'prototype names as members of a world chunk and of its container',
    mutate: (p) =>
      forge(
        p,
        'world',
        '{"__proto__":{"polluted":true},"constructor":{"polluted":true},"prototype":{"polluted":true},"flags.__proto__":{"polluted":true},' +
          '"flags.worldEconomy":{"v":2,"year":2026},"world":{"__proto__":{"polluted":true},"constructor":{"x":1},"prototype":{"x":1},"testrec":{"rows":[]}}}',
      ),
    expected: (o) => {
      const flags = o.flags as Rec
      flags.worldEconomy = { v: 2, year: 2026 }
      delete flags.testChunk
      const world = o.world as Rec
      world.testrec = { rows: [] }
      delete world.testhot
    },
  },
  // The shard is the one the name hashes to, so only the name itself can make the chunk hostile.
  ...['__proto__', 'constructor', 'prototype'].map(
    (key): Hostile => ({
      name: `an entity shard with a ${key} key, in the shard that key hashes to`,
      mutate: (p) => forge(p, `e.testent.${shardOf(key, 4)}`, `{"${key}":{"v":1}}`),
      lost: () => [`e.testent.${shardOf(key, 4)}:hostile`],
      expected: (o) => dropShard(shardOf(key, 4))(o),
    }),
  ),
  // --- placeholders and the core
  {
    name: 'a placeholder with no manifest entry behind it',
    mutate: (p) => void delete manifestOf(p).world,
    lost: ['flags.testChunk:missing', 'flags.worldEconomy:missing', 'world.testhot:missing', 'world.testrec:missing'],
    expected: dropWorld,
  },
  {
    name: 'a manifest entry for a slice whose core value is not a placeholder: the core value stays',
    mutate: (p) => void ((p.head.flags as Rec).worldEconomy = { v: 2, year: 1 }),
    lost: [],
    expected: (o) => void ((o.flags as Rec).worldEconomy = { v: 2, year: 1 }),
  },
  { name: 'a head at schema 2 that carries a chunks key', mutate: (p) => void (p.head.schemaVersion = 2), invalid: true },
  { name: 'a head whose schema is a string', mutate: (p) => void (p.head.schemaVersion = '3'), invalid: true },
  // --- loss of whole chunks
  { name: 'the world chunk is missing', mutate: (p) => void p.texts.set(manifestOf(p).world!.id, null), lost: ['world:missing'], expected: dropWorld },
  { name: 'a log decade is missing', mutate: (p) => void p.texts.set(manifestOf(p)['log.1']!.id, null), lost: ['log.1:missing'], expected: dropDecade(1) },
  {
    name: 'every log decade is missing: the tail stays and nothing else',
    mutate: (p) => {
      for (const n of ['log.0', 'log.1', 'log.2']) p.texts.set(manifestOf(p)[n]!.id, null)
    },
    lost: ['log.0:missing', 'log.1:missing', 'log.2:missing'],
    expected: (o) => void (o.log = (o.log as unknown[]).slice(-1)),
  },
  {
    name: 'an entity shard is missing: only its entries go, the rest stay in key order',
    mutate: (p) => void p.texts.set(manifestOf(p)[shardNamesOf(p)[0]!]!.id, null),
    lost: (p) => [`${shardNamesOf(p)[0]!}:missing`],
    expected: (o, p) => dropShard(shardNo(shardNamesOf(p)[0]!))(o),
  },
  {
    name: 'every entity shard is missing: the record is gone and the ledger and the rest stay',
    mutate: (p) => {
      for (const n of shardNamesOf(p)) p.texts.set(manifestOf(p)[n]!.id, null)
    },
    expected: (o) => void delete (o.world as Rec).testent,
  },
  {
    // The forged shard is the last one in the manifest, and the stray key lives in an earlier shard with another value, so a loader
    // that took the stray entry would overwrite the real one: only the hash check keeps the record as it was.
    name: 'an entity shard that holds a key hashing to another shard',
    mutate: (p) => {
      const last = shardNamesOf(p).at(-1)!
      expect(shardNo(last)).toBeGreaterThan(0)
      const stray = Object.keys(entities(40)).find((k) => shardOf(k, 4) < shardNo(last))!
      forge(p, last, `{"${stray}":{"v":999}}`)
    },
    lost: (p) => [`${shardNamesOf(p).at(-1)!}:hostile`],
    expected: (o, p) => dropShard(shardNo(shardNamesOf(p).at(-1)!))(o),
  },
  { name: 'an entity shard of a kind no slice declares', mutate: (p) => forge(p, 'e.nokind.0', '{"a":{"v":1}}'), lost: ['e.nokind.0:hostile'], expected: () => {} },
  { name: 'an entity shard numbered past the shard count', mutate: (p) => forge(p, 'e.testent.7', '{}'), lost: ['e.testent.7:hostile'], expected: () => {} },
  {
    name: 'no texts at all: the head alone, with every loss named',
    mutate: (p) => void p.texts.clear(),
    expected: (o) => {
      dropWorld(o)
      o.log = (o.log as unknown[]).slice(-1)
      delete (o.world as Rec).testent
    },
  },
  // --- a spoiled core
  { name: 'a world container in the core that is not an object', mutate: (p) => void (p.head.world = 'x'), expected: (o) => void delete o.world },
  { name: 'a core log that is not an array', mutate: (p) => void (p.head.log = 'x'), unplayable: true },
]

describe('assembleSave: hostile and missing chunks', () => {
  for (const c of HOSTILE) {
    it(c.name, () => {
      const g = full()
      const p = split(g)
      c.mutate(p)
      let r: Assembled | undefined
      expect(() => {
        r = assembleSave(p.head, p.texts)
      }).not.toThrow()
      expect(({} as Rec).polluted).toBeUndefined()
      if (c.invalid) {
        expect(r!.kind).toBe('invalid')
        return
      }
      const got = ready(r!)
      if (c.lost !== undefined) {
        expect(lostNames(got)).toEqual((typeof c.lost === 'function' ? c.lost(p) : c.lost).slice().sort())
      }
      expect(got.lost.length).toBeLessThanOrEqual(128)
      for (const l of got.lost) {
        if (l.why === 'missing' || l.why === 'size') expect(l.raw).toBeUndefined()
        if (l.raw !== undefined) expect(l.raw.length).toBeLessThanOrEqual(2_000_000)
      }
      expect(Object.getPrototypeOf(got.game)).toBe(Object.prototype)
      for (const k of ['flags', 'world']) {
        const part = got.game[k]
        if (typeof part === 'object' && part !== null) expect(Object.getPrototypeOf(part)).toBe(Object.prototype)
      }
      if (c.expected !== undefined) {
        const want = plain(g)
        c.expected(want, p)
        expect(JSON.stringify(got.game)).toBe(JSON.stringify(want))
      }
      if (c.unplayable) {
        expect(migrateSave(got.game, { versions: got.versions }).kind).toBe('invalid')
      } else {
        expectLoadable(got)
      }
    })
  }

  it('keeps the text of a hostile chunk for the quarantine copy, and none for a missing or oversize one', () => {
    const p = split(full())
    const short = textOf(p, 'world').slice(0, -1)
    p.texts.set(manifestOf(p).world!.id, short)
    p.texts.set(manifestOf(p)['log.1']!.id, null)
    forge(p, 'log.0', manyYears(32_000))
    const r = reload(p)
    const by = Object.fromEntries(r.lost.map((l) => [l.name, l]))
    expect(by.world!.why).toBe('hostile')
    expect(by.world!.raw).toBe(short)
    expect(by['log.1']!.why).toBe('missing')
    expect(by['log.1']!.raw).toBeUndefined()
    expect(by['log.0']!.why).toBe('size')
    expect(by['log.0']!.raw).toBeUndefined()
  })

  it('cuts the text kept for quarantine at 2,000,000 characters', () => {
    const p = split(full())
    // A chunk of 3 million characters that is not JSON: hostile, and its raw text is clipped.
    forge(p, 'world', `{${'x'.repeat(3_000_000)}`)
    const r = reload(p)
    const world = r.lost.find((l) => l.name === 'world')!
    expect(world.why).toBe('hostile')
    expect(world.raw).toHaveLength(2_000_000)
  })

  it('names at most 128 losses however many placeholders a hostile head holds', () => {
    const p = split(full())
    const world: Rec = {}
    for (let i = 0; i < 5_000; i++) world[`s${i}`] = `~world.s${i}`
    p.head.world = world
    delete manifestOf(p).world
    const r = reload(p)
    expect(r.lost.length).toBeLessThanOrEqual(128)
    expect(Object.keys(r.game.world as Rec).length).toBe(0)
  })

  it('reads a slice version map once, cleaned: whole numbers from 1 to 1000, nothing else', () => {
    const p = split(base())
    p.head.sv = { character: 2, people: 0, assets: -1, queue: 1.5, counters: 'x', ancestors: 1001, yearActions: null, flags: 1000 }
    expect(reload(p).versions).toEqual({ character: 2, flags: 1000 })
    for (const sv of [undefined, null, [], 'x', 7]) {
      p.head.sv = sv
      expect(reload(p).versions, JSON.stringify(sv)).toEqual({})
    }
    delete p.head.sv
    expect(reload(p).versions).toEqual({})
  })

  it('hands the slice versions to migrateSave, so a slice written at an older version is migrated on load', () => {
    const p = split(base())
    p.head.sv = { ...(p.head.sv as Rec), character: 1 }
    const r = reload(p)
    expect(r.versions.character).toBe(1)
    expectLoadable(r)
  })

  it('never throws: a head that throws when read is invalid, and texts that are not a map read as no texts', () => {
    const trap = new Proxy(
      {},
      {
        get() {
          throw new Error('read')
        },
        ownKeys() {
          throw new Error('keys')
        },
      },
    )
    expect(assembleSave(trap as never, new Map()).kind).toBe('invalid')
    const p = split(full())
    for (const texts of [null, undefined, 5, 'texts', {}, [], { get: 3 }]) {
      const r = assembleSave(p.head, texts as never)
      expect(r.kind, JSON.stringify(texts)).toBe('ready')
    }
  })
})

describe('assembleSave: junk of every kind', () => {
  /** A small deterministic generator for the random-looking cases (the codec itself draws nothing). */
  function lcg(seed: number): () => number {
    let s = seed >>> 0
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0
      return s / 2 ** 32
    }
  }
  function value(r: () => number, depth: number): unknown {
    const pick = Math.floor(r() * 8)
    if (depth > 4 || pick < 3) return [0, 1, -1, 1.5, 'x', '~world', '~flags.worldEconomy', null, true, 'a'.repeat(40)][Math.floor(r() * 10)]
    if (pick < 5) return Array.from({ length: Math.floor(r() * 4) }, () => value(r, depth + 1))
    const out: Rec = {}
    for (let i = Math.floor(r() * 5); i > 0; i--) out[['world', 'log.0', 'chunks', 'sv', 'id', 'len', 'flags', 'schemaVersion', 'e.k.1'][Math.floor(r() * 9)]!] = value(r, depth + 1)
    return out
  }
  let deep: unknown = {}
  for (let i = 0; i < 10_000; i++) deep = { a: deep }
  const flat: Rec = {}
  for (let i = 0; i < 10_000; i++) flat[`k${i}`] = i
  const r = lcg(7)
  const JUNK: unknown[] = [
    undefined, null, 0, 1, -1, NaN, Infinity, '', 'x', true, [], [1, 2, 3], [[], {}], {}, { a: 1 },
    { schemaVersion: 3 }, { schemaVersion: 3, chunks: null }, { schemaVersion: 3, chunks: [] }, { schemaVersion: 3, chunks: 'x' },
    { schemaVersion: 3, chunks: {} }, { schemaVersion: 3, chunks: { world: null } }, { schemaVersion: 3, chunks: { world: { id: 1, len: 'x' } } },
    { schemaVersion: 2.5, chunks: {} }, { schemaVersion: '3', chunks: {} }, { schemaVersion: 3, chunks: {}, sv: [] },
    { schemaVersion: 3, chunks: {}, flags: deep, world: deep, log: deep },
    { schemaVersion: 3, chunks: {}, ...flat },
    { schemaVersion: 3, chunks: flat },
    { schemaVersion: 3, chunks: { world: { id: 'world.abcdef', len: 2 } }, flags: { worldEconomy: '~flags.worldEconomy' }, world: '~world' },
    ...Array.from({ length: 12 }, () => ({ schemaVersion: 3, chunks: value(r, 0), sv: value(r, 0), flags: value(r, 0), world: value(r, 0), log: value(r, 0) })),
  ]

  it('is more than thirty cases', () => {
    expect(JUNK.length).toBeGreaterThan(30)
  })

  it('returns invalid or ready and never throws, whatever the head, and neededChunkIds and isChunkedHead stay quiet too', () => {
    for (const [i, junk] of JUNK.entries()) {
      let result: Assembled | undefined
      expect(() => {
        result = assembleSave(junk as never, new Map())
      }, `case ${i}`).not.toThrow()
      expect(['ready', 'invalid'], `case ${i}`).toContain(result!.kind)
      expect(() => isChunkedHead(junk), `case ${i}`).not.toThrow()
      expect(Array.isArray(neededChunkIds(junk as never)), `case ${i}`).toBe(true)
    }
  })
})
