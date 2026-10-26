// R4-S5 (D.1 d): the save slice of the Met shard. g.world.met is the first production entity slice (X9, X10): a slice of the chunk
// `entities`, cut into eight records `e.met.<n>` by a hash of the sid, so a tap that touches one person writes one small chunk and the
// head, and never the `world` chunk (which is rewritten whole, about 520 KB after 50 years, when any of its shards changes).
//
// What the file proves, in the order of the plan: the row itself; 400 records encode to at most eight chunks with no unsorted entity and
// decode to the very JSON; one changed record changes one chunk id and leaves the world chunk alone, both in the codec and through the
// save store (the bytes of a tap are measured and printed); a Time Machine snapshot restores equal; every fixture recorded before v5.3.0
// loads with no met key and saves again byte for byte, and a fixture of v5.3.0 or later keeps the shard it holds (the rule is run on
// states built here too, so it can fail); twelve hostile mets put into the oldest fixture load, play three years and end bounded; a
// forged met chunk is a bounded loss or a cleaned shard; the entity-shape guard of save-budget.test.ts has its own cases there.
//
// The fixtures are read by a directory listing and the version comes from the file name (save-v<major>.<minor>.<patch>[-name]), so the
// release that records one (R4-P6 records a stamped v5.3.0 life) needs no edit here.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { countNodes, listSlices, sliceOf } from '../src/game/kernel/slices'
import { createNewLife } from '../src/game/life'
import { loadGame, loadSnapshot, memorySnapshotBackend, saveGame, setSnapshotBackend, snapshotWritesSettled, startTimeline, takeSnapshot } from '../src/game/save'
import { memorySaveBackend, type SyncSaveBackend } from '../src/game/save-backends'
import { cloneForAct } from '../src/game/save-clone'
import { HEAD_CHUNKS_KEY, HEAD_VERSIONS_KEY, assembleSave, encodeSave, inlineSave, neededChunkIds, shardOf, textSum, type EncodedSave } from '../src/game/save-codec'
import { isLoadableGame, migrateSave } from '../src/game/save-schema'
import { resetSaveStoreForTests, setSaveBackend } from '../src/game/save-store'
import type { GameState } from '../src/game/types'
import { MET_CAPS, WORLD_NODE_CAP } from '../src/game/world/caps'
import { worldProblems } from '../src/game/world/invariants'
import { metProblems, normalizeMet, packGb, readMet, writeMet, type MetRecord, type MetShard, type Tomb } from '../src/game/world/met'
import '../src/game/world/shards'
import { makeSid } from '../src/game/world/sid'
import { readWorld } from '../src/game/world/state'
import { installStorageShim } from './fuzz-kit'
import { memoryChunkStore } from './save-kit'

type Rec = Record<string, unknown>

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const FIXTURE_DIR = join(ROOT, 'test', 'fixtures')

// A fixed life as a constant, not a pin of the form the seed ratchet counts (test/seed-pins.test.ts).
const LIFE_SEED = 3
const BIRTH_YEAR = 1990

// ---------------------------------------------------------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------------------------------------------------------

const FIRSTS = ['Maribel', 'Okonkwo', 'Takeshi', 'Ingrid', 'Rashid', 'Bao', 'Odalys', 'Lennart']
const LASTS = ['Okonkwo-Reyes', 'Nakamura', 'Lindqvist', 'Abdelrahman', 'Castellanos', 'Whitfield']

/** The i-th person of a shard: upper, mixed and lower case places, so the order of the keys is the order of code units. */
const sidOf = (i: number): string => makeSid({ kind: 'cls', place: i % 3 === 0 ? 'US' : i % 3 === 1 ? 'us' : 'Us', cohort: 1950 + (i % 60), ord: i })

/** A valid record that uses all 22 nodes of the plan's worst case (died year, role tag and job ref are there). */
function full(i: number, over: Partial<MetRecord> = {}): MetRecord {
  return { f: FIRSTS[i % 8]!, l: LASTS[i % 6]!, g: (i % 2) as 0 | 1, b: 1950 + (i % 60), c: 'us', k: i % 9, a: [50, 40, 60, 30, 70], y: 2000 + (i % 30), s: 2030 + (i % 20), w: i % 10, fl: 0, gr: 0, ob: 0, d: 2060, r: 'banker', j: `firm:f${1000 + i}`, ...over }
}

/** A valid tombstone: year, grudge, obligation, flags, first, last, gb (born * 2 + gender). */
const tomb = (i: number): Tomb => [2040 + (i % 20), 0, 0, 0, FIRSTS[i % 8]!, LASTS[i % 6]!, packGb(1950 + (i % 60), (i % 2) as 0 | 1)]

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
const ascending = (entries: readonly (readonly [string, unknown])[]): MetShard => Object.fromEntries([...entries].sort((a, b) => cmp(a[0], b[0]))) as MetShard

/** 400 records at the cap, in keys that sort differently by code unit and by locale. */
const shard400 = (): MetShard => ascending(Array.from({ length: MET_CAPS.records }, (_, i) => [sidOf(i), full(i)] as const))

/** The worst case of the plan: 400 records of 22 nodes, 200 tombstones of 8 and the map root. */
function worstShard(): MetShard {
  const entries: [string, unknown][] = []
  for (let i = 0; i < MET_CAPS.records; i++) entries.push([sidOf(i), full(i)])
  for (let i = 0; i < MET_CAPS.tombs; i++) entries.push([makeSid({ kind: 'actor', place: 'us', cohort: 1950 + (i % 60), ord: i }), tomb(i)])
  return ascending(entries)
}

/** A life of twelve years: it has a real world (people, firms, homes, holdings, lod, a ledger), so a world chunk exists. */
function baseLife(): GameState {
  const g = createNewLife({ seed: LIFE_SEED, year: BIRTH_YEAR })
  for (let i = 0; i < 12; i++) {
    g.queue = []
    g.character.stats.health = 100
    g.character.conditions = []
    ageUp(g)
  }
  return g
}

/** One year the way a test plays it: no popup in the way. */
function oneYear(g: GameState): void {
  g.queue = []
  ageUp(g)
}

const json = (x: unknown): string => JSON.stringify(x)
/** JSON with the keys of every object sorted: the content of a state, whatever order its parts were first written in. */
const canonical = (x: unknown): string => JSON.stringify(x, (_key, v: unknown) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => cmp(a, b))) : v))

const metChunks = (e: EncodedSave): string[] => Object.keys(e.manifest).filter((n) => n.startsWith('e.met.'))
const idsOf = (e: EncodedSave): Record<string, string> => Object.fromEntries(Object.entries(e.manifest).map(([n, ref]) => [n, ref.id]))
const textOf = (e: EncodedSave, name: string): string => e.chunks.get(e.manifest[name]!.id)!

/** The state read back the way the boot reads it: the head and its chunk texts, then migrateSave. */
function reloaded(g: GameState): { first: EncodedSave; lost: readonly unknown[]; game: GameState } {
  const first = encodeSave(g)
  const head = JSON.parse(first.head) as Record<string, unknown>
  const texts = new Map<string, string | null>(neededChunkIds(head).map((id) => [id, first.chunks.get(id) ?? null]))
  const a = assembleSave(head, texts)
  if (a.kind !== 'ready') throw new Error(`the save did not assemble: ${a.reason}`)
  const m = migrateSave(a.game, { versions: a.versions })
  if (m.kind !== 'ready') throw new Error(`the save did not load: ${m.kind}`)
  return { first, lost: a.lost, game: m.game }
}

/** The very record another save makes from a game that was read back: the head and every chunk id, byte for byte. */
function expectSavesAgain(name: string, g: GameState): GameState {
  const r = reloaded(g)
  const again = encodeSave(r.game)
  expect(r.lost, `${name}: a chunk was lost`).toEqual([])
  expect(again.head, `${name}: the head after a reload`).toBe(r.first.head)
  expect(again.manifest, `${name}: the chunks after a reload`).toEqual(r.first.manifest)
  expect(inlineSave(r.game), `${name}: the state after a reload`).toBe(inlineSave(g))
  return r.game
}

// ---------------------------------------------------------------------------------------------------------------------------
// 1. The row
// ---------------------------------------------------------------------------------------------------------------------------

describe('the slice row of the Met shard', () => {
  it('is world.met, an entity slice of eight shards, version 1, written by replace, with 12,000 nodes and 300,000 characters', () => {
    const row = sliceOf('world.met')
    expect(row).toMatchObject({ key: 'world.met', version: 1, chunk: 'entities', write: 'replace', caps: { nodes: 12_000, chars: 300_000 }, entities: { kind: 'met', shards: 8 } })
    expect(listSlices().map((s) => s.key)).toContain('world.met')
  })

  it('leaves the world root a container of sub-slices and the other shards derived rows of the world chunk', () => {
    expect(sliceOf('world')).toMatchObject({ chunk: 'world', shape: 'subkeys' })
    for (const name of ['people', 'firms', 'homes', 'holdings', 'lod', 'facts', 'frontier']) {
      expect(sliceOf(`world.${name}`), name).toMatchObject({ chunk: 'world', write: 'replace', shape: 'whole' })
    }
    expect(sliceOf('world.ledger')).toMatchObject({ chunk: 'core', write: 'inplace' })
  })

  it('reads through normalizeMet: a valid shard comes back as itself, a hostile value as a valid shard', () => {
    const row = sliceOf('world.met')!
    const shard = shard400()
    expect(row.normalize(shard)).toBe(shard)
    expect(row.normalize(42)).toEqual({})
    expect(row.normalize(json(shard))).toEqual({})
    expect(row.normalize([full(1)])).toEqual({})
    const flood = Object.fromEntries(Array.from({ length: 5_000 }, (_, i) => [makeSid({ kind: 'cls', place: `p${Math.floor(i / 1000)}`, cohort: 1850 + (i % 500), ord: i % 1000 }), full(i)]))
    const out = row.normalize(flood) as MetShard
    expect(Object.keys(out).length).toBeLessThanOrEqual(MET_CAPS.records + MET_CAPS.tombs)
    expect(metProblems(out)).toEqual([])
  })

  it('has room for the worst case of the shard: 10,401 nodes under 12,000, and its text under 300,000 characters', () => {
    const worst = worstShard()
    const row = sliceOf('world.met')!
    expect(countNodes(worst, 1_000_000)).toBe(10_401)
    expect(countNodes(worst, 1_000_000)).toBeLessThanOrEqual(row.caps.nodes)
    expect(json(worst).length).toBeLessThanOrEqual(row.caps.chars)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// 2. 400 records in the codec
// ---------------------------------------------------------------------------------------------------------------------------

describe('400 records in the codec', () => {
  let g: GameState
  beforeAll(() => {
    g = baseLife()
    writeMet(g, shard400())
  }, 300_000)

  it('starts from a life with a world of its own, so a world chunk exists to be left alone', () => {
    expect(Object.keys(readWorld(g)).filter((k) => k !== 'v' && k !== 'y' && k !== 'met').length).toBeGreaterThanOrEqual(2)
    expect(Object.keys(readMet(g))).toHaveLength(MET_CAPS.records)
    expect(encodeSave(g).manifest.world).toBeDefined()
  })

  it('encodes to at most eight e.met.<n> chunks, more than one, every key in the chunk it hashes to, and no unsorted entity', () => {
    const e = encodeSave(g)
    const names = metChunks(e)
    expect(names.length).toBeGreaterThan(1)
    expect(names.length).toBeLessThanOrEqual(8)
    expect(e.stats.unsortedEntities).toEqual([])
    const seen: string[] = []
    for (const name of names) {
      const n = Number(name.split('.')[2])
      const part = JSON.parse(textOf(e, name)) as Rec
      for (const key of Object.keys(part)) {
        expect(shardOf(key, 8), key).toBe(n)
        seen.push(key)
      }
      expect(Object.keys(part)).toEqual([...Object.keys(part)].sort(cmp))
    }
    expect(seen.sort(cmp)).toEqual(Object.keys(readMet(g)))
  })

  it('keeps the shard out of the world chunk, a placeholder in the head, and names the row in sv', () => {
    const e = encodeSave(g)
    expect(textOf(e, 'world')).not.toContain('"met"')
    expect(textOf(e, 'world')).not.toContain(sidOf(0))
    const head = JSON.parse(e.head) as Rec
    expect((head.world as Rec).met).toBe('~world.met')
    expect((head[HEAD_VERSIONS_KEY] as Rec)['world.met']).toBe(1)
    expect(Object.keys(head[HEAD_CHUNKS_KEY] as Rec)).toEqual(expect.arrayContaining(['world', ...metChunks(e)]))
  })

  it('decodes to the very JSON, no chunk lost, and the record the game plays on is the one it saved', () => {
    const r = reloaded(g)
    expect(r.lost).toEqual([])
    expect(inlineSave(r.game)).toBe(inlineSave(g))
    expect(isLoadableGame(r.game)).toBe(true)
    expect(normalizeMet(r.game.world!.met)).toBe(r.game.world!.met)
  })

  it('makes the same chunks again after a reload, so the first save after a boot writes none', () => {
    expectSavesAgain('400 records', g)
  })

  it('keeps a shard of the worst case (400 records and 200 tombstones) inside the chunks and the caps of the row', () => {
    const w = baseLife()
    writeMet(w, worstShard())
    const e = encodeSave(w)
    expect(e.stats.unsortedEntities).toEqual([])
    expect(metChunks(e).length).toBeLessThanOrEqual(8)
    const total = metChunks(e).reduce((a, n) => a + textOf(e, n).length, 0)
    expect(total).toBeLessThanOrEqual(300_000)
    const r = reloaded(w)
    expect(r.lost).toEqual([])
    expect(inlineSave(r.game)).toBe(inlineSave(w))
    console.log(`the Met shard at its caps: ${metChunks(e).length} chunks, ${total} characters in all, the largest ${Math.max(...metChunks(e).map((n) => textOf(e, n).length))}`)
  }, 300_000)
})

// ---------------------------------------------------------------------------------------------------------------------------
// 3. A tap that touches one person
// ---------------------------------------------------------------------------------------------------------------------------

/** The same shard with the last-seen year of one record moved: the shape a writer that replaces the root leaves. */
function touch(g: GameState, key: string, s: number): void {
  const cur = readMet(g) as MetShard
  writeMet(g, { ...cur, [key]: { ...(cur[key] as MetRecord), s } })
}

describe('a tap that touches one person', () => {
  let g: GameState
  beforeAll(() => {
    g = baseLife()
    writeMet(g, shard400())
  }, 300_000)

  it('changes one e.met chunk id and leaves the world chunk id and the other seven alone', () => {
    const key = Object.keys(readMet(g))[123]!
    const next = cloneForAct(g)
    touch(next, key, 2099)
    const a = idsOf(encodeSave(g))
    const b = idsOf(encodeSave(next))
    expect(Object.keys(b)).toEqual(Object.keys(a))
    const changed = Object.keys(a).filter((n) => a[n] !== b[n])
    expect(changed).toEqual([`e.met.${shardOf(key, 8)}`])
    expect(b.world).toBe(a.world)
  })

  it('stringifies one shard only for the changed record', () => {
    const key = Object.keys(readMet(g))[7]!
    encodeSave(g)
    const next = cloneForAct(g)
    touch(next, key, 2098)
    expect(encodeSave(next).stats.stringified).toBe(1)
  })

  it('also holds when a person joins or leaves a shard with room: one chunk, never the world chunk', () => {
    const base = Object.keys(readMet(g))
    // 399 records: a join has room, so nothing else is cut.
    const room = cloneForAct(g)
    const rest = { ...(readMet(room) as MetShard) }
    delete rest[base[9]!]
    writeMet(room, rest)
    const fresh = makeSid({ kind: 'frn', place: 'us', cohort: 2001, ord: 1 })
    const joined = cloneForAct(room)
    writeMet(joined, { ...(readMet(joined) as MetShard), [fresh]: full(1) })
    const left = cloneForAct(g)
    const gone = { ...(readMet(left) as MetShard) }
    delete gone[base[5]!]
    writeMet(left, gone)
    for (const [name, before, after, key] of [['joins', room, joined, fresh], ['leaves', g, left, base[5]!]] as const) {
      const a = idsOf(encodeSave(before))
      const b = idsOf(encodeSave(after))
      const changed = Object.keys({ ...a, ...b }).filter((n) => a[n] !== b[n])
      expect(changed, `a person ${name}`).toEqual([`e.met.${shardOf(key, 8)}`])
    }
  })

  it('at the cap of 400 a join also cuts the weakest record, so at most two chunks change and the world chunk still does not', () => {
    const fresh = makeSid({ kind: 'frn', place: 'us', cohort: 2001, ord: 2 })
    const joined = cloneForAct(g)
    writeMet(joined, { ...(readMet(joined) as MetShard), [fresh]: full(2) })
    expect(Object.keys(readMet(joined))).toHaveLength(MET_CAPS.records)
    const a = idsOf(encodeSave(g))
    const b = idsOf(encodeSave(joined))
    const changed = Object.keys({ ...a, ...b }).filter((n) => a[n] !== b[n])
    expect(changed.length).toBeGreaterThanOrEqual(1)
    expect(changed.length).toBeLessThanOrEqual(2)
    expect(changed.every((n) => n.startsWith('e.met.'))).toBe(true)
    expect(b.world).toBe(a.world)
  })

  it('writes the head and one small chunk through the save store, and the world chunk is not written again', () => {
    const store = memoryChunkStore()
    const inner = memorySaveBackend()
    let headWrites = 0
    const backend: SyncSaveBackend = {
      ...inner,
      write: (record) => {
        headWrites++
        return inner.write(record)
      },
      chunks: store,
    }
    resetSaveStoreForTests()
    setSaveBackend(backend)
    try {
      const committed = cloneForAct(g)
      expect(saveGame(committed)).toBe(true)
      expect(store.ids().filter((id) => id.startsWith('e.met.')).length).toBeGreaterThan(1)
      const before = new Set(store.ids())
      const puts = store.putSizes.length
      const heads = headWrites
      const draft = cloneForAct(committed)
      touch(draft, Object.keys(readMet(draft))[200]!, 2097)
      expect(saveGame(draft)).toBe(true)
      const added = store.ids().filter((id) => !before.has(id))
      const written = store.putSizes.slice(puts)
      expect(added, 'the chunks this tap wrote').toHaveLength(1)
      expect(added[0]).toMatch(/^e\.met\.[0-7]\./)
      expect(written, 'one put').toHaveLength(1)
      expect(headWrites - heads, 'one head').toBe(1)
      const world = store.ids().find((id) => id.startsWith('world.'))
      expect(world, 'the world chunk is the one that was there').toBeDefined()
      expect(before.has(world!)).toBe(true)
      console.log(`bytes a tap writes (spike, R4-S5): one touched record of 400 wrote ${written[0]} characters in one e.met chunk; the world chunk of ${store.get(world!)!.length} characters was not written`)
      // The shard is 1/8 of the records, so far below the world chunk a derived row would rewrite.
      expect(written[0]!).toBeLessThan(store.get(world!)!.length)
      expect(written[0]!).toBeLessThan(60_000)
    } finally {
      resetSaveStoreForTests()
    }
  })

  afterEach(() => {
    resetSaveStoreForTests()
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// 4. The Time Machine
// ---------------------------------------------------------------------------------------------------------------------------

describe('a Time Machine snapshot of a life with a Met shard', () => {
  it('stores the entity chunks and restores the state that was saved', async () => {
    const g = baseLife()
    writeMet(g, shard400())
    const snap = structuredClone(g)
    const backend = memorySnapshotBackend()
    setSnapshotBackend(backend)
    try {
      startTimeline(snap.lifeId, null)
      await snapshotWritesSettled()
      expect(await takeSnapshot(snap)).toBe(true)
      await snapshotWritesSettled()
      const keys = await backend.keys()
      expect(keys.filter((k) => k.includes('|e.met.')).length, 'entity chunks in the snapshot store').toBeGreaterThan(1)
      const restored = await loadSnapshot(snap.lifeId, snap.character.age)
      expect(restored).not.toBeNull()
      expect(canonical(restored)).toBe(canonical(snap))
      expect(restored!.world!.met).toEqual(snap.world!.met)
      expect(Object.keys(restored!.world!.met!)).toEqual(Object.keys(snap.world!.met!))
      expect(metProblems(restored!.world!.met, restored!.people)).toEqual([])
    } finally {
      setSnapshotBackend(null)
    }
  }, 300_000)
})

// ---------------------------------------------------------------------------------------------------------------------------
// 5. Every fixture
// ---------------------------------------------------------------------------------------------------------------------------

type Version = readonly [number, number, number]

/** The release a fixture was recorded at, from its name: save-v1 is 1.0.0, save-v4.0.2 is 4.0.2, save-v5.2.0-social is 5.2.0. */
function versionOf(file: string): Version | null {
  const m = /^save-v(\d+)(?:\.(\d+))?(?:\.(\d+))?(?=[-.])/.exec(file)
  return m === null ? null : [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)]
}

/** True when `v` is at or after v5.3.0, the release that adds the Met shard. */
function laterThanMet(v: Version): boolean {
  return v[0] !== 5 ? v[0] > 5 : v[1] !== 3 ? v[1] > 3 : true
}

const FIXTURES = readdirSync(FIXTURE_DIR)
  .filter((name) => /^save-.*\.json\.gz$/.test(name))
  .sort()

function fixtureRaw(name: string): Record<string, unknown> {
  return JSON.parse(gunzipSync(readFileSync(join(FIXTURE_DIR, name))).toString()) as Record<string, unknown>
}

function fixtureGame(name: string): GameState {
  const r = migrateSave(fixtureRaw(name))
  if (r.kind !== 'ready') throw new Error(`${name} did not migrate: ${r.kind}`)
  return r.game
}

/** A save from before v5.3.0: no met key anywhere, no met chunk, and the same bytes when it is saved again. */
function expectNoMet(name: string, g: GameState): void {
  expect(Object.prototype.hasOwnProperty.call(g.world ?? {}, 'met'), `${name}: a met key`).toBe(false)
  const r = reloaded(g)
  expect(metChunks(r.first), `${name}: a met chunk`).toEqual([])
  expect(Object.prototype.hasOwnProperty.call(r.game.world ?? {}, 'met'), `${name}: a met key after a reload`).toBe(false)
  expectSavesAgain(name, g)
}

/** A save of v5.3.0 or later: the shard it holds (if any) is a valid shard that reads as itself, and the save is the same bytes again. */
function expectKeepsMet(name: string, g: GameState): void {
  const met: unknown = g.world?.met
  if (met !== undefined) {
    expect(normalizeMet(met), `${name}: the met shard normalizes to itself`).toBe(met)
    expect(metProblems(met), `${name}: the met shard`).toEqual([])
  }
  const back = expectSavesAgain(name, g)
  expect(canonical(back.world?.met), `${name}: the shard after a reload`).toBe(canonical(met))
}

describe('every fixture, by the release that recorded it', () => {
  it('finds the fixtures, and every one has a version in its name', () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(7)
    expect(FIXTURES).toContain('save-v1.json.gz')
    for (const name of FIXTURES) expect(versionOf(name), name).not.toBeNull()
    expect(versionOf('save-v1.json.gz')).toEqual([1, 0, 0])
    expect(versionOf('save-v4.0.2.json.gz')).toEqual([4, 0, 2])
    expect(versionOf('save-v5.2.0-social.json.gz')).toEqual([5, 2, 0])
    expect(versionOf('save-v5.3.0-heavy.json.gz')).toEqual([5, 3, 0])
    expect(laterThanMet([5, 2, 0])).toBe(false)
    expect(laterThanMet([5, 3, 0])).toBe(true)
    expect(laterThanMet([5, 10, 0])).toBe(true)
    expect(laterThanMet([6, 0, 0])).toBe(true)
    expect(laterThanMet([1, 0, 0])).toBe(false)
  })

  describe.each(FIXTURES)('%s', (name) => {
    it('loads and saves again byte for byte, with the rule of its release about the Met shard', () => {
      const g = fixtureGame(name)
      if (laterThanMet(versionOf(name)!)) expectKeepsMet(name, g)
      else expectNoMet(name, g)
    }, 120_000)
  })

  describe('the two rules can fail', () => {
    it('the rule of a save from before v5.3.0 names a met key and a met chunk', () => {
      const g = fixtureGame('save-v1.json.gz')
      expectNoMet('save-v1', g)
      writeMet(g, shard400())
      expect(() => expectNoMet('save-v1 with a shard', g)).toThrow()
    })

    it('the rule of a save from v5.3.0 on passes a state that holds a shard, and names a shard that is not its own reading', () => {
      const g = fixtureGame('save-v1.json.gz')
      writeMet(g, shard400())
      expectKeepsMet('v1 with a shard', g)
      const bad = fixtureGame('save-v1.json.gz')
      readWorld(bad)
      ;(bad as { world?: unknown }).world = { v: 1, met: { 'not a sid': full(1) } }
      expect(() => expectKeepsMet('v1 with a bad shard', bad)).toThrow()
    })

    it('a save of v5.3.0 or later with no shard passes too: the shard is optional', () => {
      expectKeepsMet('v1 without a shard', fixtureGame('save-v1.json.gz'))
    })
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// 6. Twelve hostile mets put into the oldest fixture
// ---------------------------------------------------------------------------------------------------------------------------

const NEVER_MADE = 'a shard that no game wrote'

/** Every value is one node, the way the save loader counts (save-schema.ts finiteJsonTree). */
function nodes(value: unknown): number {
  let n = 0
  const stack: unknown[] = [value]
  while (stack.length > 0) {
    const item = stack.pop()
    n++
    if (item !== null && typeof item === 'object') for (const kid of Array.isArray(item) ? item : Object.values(item)) stack.push(kid)
  }
  return n
}

interface Hostile {
  name: string
  /** The value for `world.met`. `room` is how many nodes the save may still add before the loader's cap. */
  make: (room: number) => unknown
}

const flood = (n: number): Rec => Object.fromEntries(Array.from({ length: n }, (_, i) => [makeSid({ kind: 'cls', place: `p${Math.floor(i / 1000)}`, cohort: 1850 + (i % 500), ord: i % 1000 }), full(i, { s: 1900 + (i % 200) })]))

const HOSTILE: Hostile[] = [
  { name: 'a number', make: () => 42 },
  { name: 'a string', make: () => NEVER_MADE },
  { name: 'an array of records', make: () => [full(1), full(2), tomb(3)] },
  { name: 'a __proto__ key', make: () => JSON.parse(`{"__proto__":{"f":"Evil","v":1},"${sidOf(1)}":${json(full(1))}}`) as unknown },
  { name: '5,000 records', make: () => flood(5_000) },
  { name: 'as many records as the loader leaves room for', make: (room) => flood(Math.min(40_000, Math.floor((room - 100) / 24))) },
  {
    name: 'fields of 1e300 and minus 1e300',
    make: () => Object.fromEntries(['g', 'b', 'k', 'y', 's', 'w', 'fl', 'gr', 'ob'].map((f, i) => [sidOf(i), { ...full(i), [f]: i % 2 === 0 ? 1e300 : -1e300 }])),
  },
  { name: '10,000-character names, tags and refs', make: () => ({ [sidOf(1)]: full(1, { f: 'x'.repeat(10_000), l: 'y'.repeat(10_000), r: 'r'.repeat(10_000), j: `firm:${'j'.repeat(10_000)}` }), [sidOf(2)]: [2040, 0, 0, 0, 'f'.repeat(10_000), 'l'.repeat(10_000), 3900] }) },
  { name: 'keys out of order, and keys like out.Ann.Lee', make: () => ({ [sidOf(9)]: full(9), [sidOf(3)]: full(3), 'out.Ann.Lee': full(1), 'out.Ann.Lee.1.2': full(2), [sidOf(1)]: full(1), p7: tomb(7) }) },
  { name: 'tombstones of the wrong length', make: () => ({ [sidOf(1)]: tomb(1).slice(0, 6), [sidOf(2)]: [...tomb(2), 9], [sidOf(3)]: tomb(3) }) },
  { name: 'fields of the wrong kind: null, objects, arrays and text for numbers', make: () => Object.fromEntries([null, {}, [], 'x', true].map((v, i) => [sidOf(i), { ...full(i), b: v, y: v, a: v, fl: v }])) },
  { name: 'axes lists of 5,000 numbers', make: () => Object.fromEntries(Array.from({ length: 50 }, (_, i) => [sidOf(i), { ...full(i), a: Array.from({ length: 5_000 }, () => 50) }])) },
]

describe('hostile mets put into the oldest fixture', () => {
  it('has twelve of them', () => {
    expect(HOSTILE).toHaveLength(12)
  })

  it.each(HOSTILE.map((h) => [h.name, h] as const))('%s: loads, three years play, every read of the shard is a valid bounded shard, and the first load from the store cleans what is stored', (_name, hostile) => {
    const raw = fixtureRaw('save-v1.json.gz')
    const room = 500_000 - nodes(raw)
    raw.world = { v: 1, met: hostile.make(room) }
    const r = migrateSave(raw)
    if (r.kind !== 'ready') throw new Error(`the save did not load: ${r.kind}`)
    const g = r.game
    expect(isLoadableGame(g)).toBe(true)
    for (let i = 1; i <= 3; i++) {
      expect(() => oneYear(g), `year ${i}`).not.toThrow()
      expect(g.character.alive, `alive after year ${i}`).toBe(true)
      expect(nodes(g.world), `world nodes after year ${i}`).toBeLessThan(WORLD_NODE_CAP)
      // Nothing writes the shard in R4, so what was stored may still be raw (every reader cuts it); what a reader returns is valid.
      const read = readMet(g)
      expect(metProblems(read), `the shard as read after year ${i}`).toEqual([])
      expect(nodes(read), `the shard as read after year ${i}`).toBeLessThanOrEqual(10_401)
      expect(normalizeMet(read)).toBe(read)
    }
    // The save store is the door: what it wrote comes back as a valid, bounded shard (normalizeMet is the slice's reader).
    resetSaveStoreForTests()
    installStorageShim()
    setSaveBackend(memorySaveBackend())
    try {
      expect(saveGame(g)).toBe(true)
      const back = loadGame()
      expect(back, 'the save store reads back what it wrote').not.toBeNull()
      const met: unknown = back!.world?.met
      if (met !== undefined) {
        expect(metProblems(met, back!.people), 'the stored shard after a load').toEqual([])
        expect(nodes(met)).toBeLessThanOrEqual(10_401)
        expect(normalizeMet(met)).toBe(met)
      }
      expect(worldProblems(back!, { live: false }).filter((p) => !p.startsWith('ledger: '))).toEqual([])
      const e = encodeSave(back!)
      expect(e.stats.unsortedEntities).toEqual([])
      expect(metChunks(e).length).toBeLessThanOrEqual(8)
      expectSavesAgain(hostile.name, back!)
    } finally {
      resetSaveStoreForTests()
    }
  }, 120_000)
})

// ---------------------------------------------------------------------------------------------------------------------------
// 7. Forged met chunks
// ---------------------------------------------------------------------------------------------------------------------------

/** The save of `g` with the text of chunk `name` replaced by `text`, its length and checksum made true (a forger who knows the format). */
function forged(e: EncodedSave, name: string, text: string): ReturnType<typeof assembleSave> {
  const head = JSON.parse(e.head) as Record<string, unknown>
  const manifest = head[HEAD_CHUNKS_KEY] as Record<string, { id: string; len: number }>
  const id = `${name}.${textSum(text)}`
  manifest[name] = { id, len: text.length }
  const texts = new Map<string, string | null>(Object.values(manifest).map((ref) => [ref.id, e.chunks.get(ref.id) ?? null]))
  texts.set(id, text)
  return assembleSave(head, texts)
}

/** A sid whose key hashes to shard `n` of eight, the `i`-th such one. */
function sidIn(n: number, i: number): string {
  for (let ord = 0, hit = 0; ord < 10_000; ord++) {
    const sid = makeSid({ kind: 'frn', place: 'zz', cohort: 2000, ord })
    if (shardOf(sid, 8) === n && hit++ === i) return sid
  }
  throw new Error(`no sid for shard ${n}`)
}

describe('a forged met chunk is a bounded loss or a cleaned shard', () => {
  let g: GameState
  let e: EncodedSave
  let target: string
  let others: string[]
  beforeAll(() => {
    g = baseLife()
    writeMet(g, shard400())
    e = encodeSave(g)
    target = metChunks(e)[0]!
    others = Object.keys(readMet(g)).filter((k) => `e.met.${shardOf(k, 8)}` !== target)
  }, 300_000)

  const metOf = (a: ReturnType<typeof assembleSave>): MetShard => {
    if (a.kind !== 'ready') throw new Error(`not ready: ${a.reason}`)
    return (a.game.world as { met?: MetShard }).met ?? {}
  }

  it('a chunk holding a key of another shard is hostile: that shard is lost, the other seven stay, the life plays on', () => {
    const stray = others[0]!
    const a = forged(e, target, json({ [stray]: full(1) }))
    expect(a.kind).toBe('ready')
    if (a.kind !== 'ready') return
    expect(a.lost.map((l) => `${l.name}:${l.why}`)).toEqual([`${target}:hostile`])
    expect(Object.keys(metOf(a))).toEqual(others)
    expect(a.game.world).toBeDefined()
  })

  it('a chunk of the right shard with garbage in its records is cleaned by the reader: the garbage goes, the rest stays', () => {
    const [ok, bad, worse, tombBad] = [sidIn(Number(target.split('.')[2]), 0), sidIn(Number(target.split('.')[2]), 1), sidIn(Number(target.split('.')[2]), 2), sidIn(Number(target.split('.')[2]), 3)]
    const text = json(Object.fromEntries([[ok, full(1)], [bad, { f: 7, l: null }], [worse, { ...full(2), a: [1, 2] }], [tombBad, [1, 2, 3]]].sort((x, y) => cmp(x[0] as string, y[0] as string))))
    const a = forged(e, target, text)
    expect(a.kind).toBe('ready')
    if (a.kind !== 'ready') return
    const met = metOf(a)
    expect(a.lost).toEqual([])
    expect(Object.keys(met)).toEqual([...others, ok].sort(cmp))
    expect(metProblems(met)).toEqual([])
  })

  it('a chunk over the node cap of the row is a size loss, and the other seven stay', () => {
    const key = sidIn(Number(target.split('.')[2]), 0)
    const a = forged(e, target, json({ [key]: Array.from({ length: 13_000 }, () => 0) }))
    expect(a.kind).toBe('ready')
    if (a.kind !== 'ready') return
    expect(a.lost.map((l) => `${l.name}:${l.why}`)).toEqual([`${target}:size`])
    expect(Object.keys(metOf(a))).toEqual(others)
  })

  it('a chunk that is not an object, or not JSON, is hostile too', () => {
    for (const text of ['[1,2,3]', '5', 'not json {{', 'null']) {
      const a = forged(e, target, text)
      expect(a.kind, text).toBe('ready')
      if (a.kind !== 'ready') continue
      expect(a.lost.map((l) => `${l.name}:${l.why}`), text).toEqual([`${target}:hostile`])
      expect(Object.keys(metOf(a)), text).toEqual(others)
    }
  })

  it('a met chunk that is missing is a missing loss, and the life plays on without those people', () => {
    const head = JSON.parse(e.head) as Record<string, unknown>
    const texts = new Map<string, string | null>(neededChunkIds(head).map((id) => [id, e.chunks.get(id) ?? null]))
    texts.delete(e.manifest[target]!.id)
    const a = assembleSave(head, texts)
    expect(a.kind).toBe('ready')
    if (a.kind !== 'ready') return
    expect(a.lost.map((l) => `${l.name}:${l.why}`)).toEqual([`${target}:missing`])
    expect(Object.keys(metOf(a))).toEqual(others)
    const m = migrateSave(a.game, { versions: a.versions })
    expect(m.kind).toBe('ready')
  })
})
