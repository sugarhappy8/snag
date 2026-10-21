// R2-S9 (K.5 i and F39): the Time Machine over slices, and snapshot restores through migrateSave.
//
// A snapshot is what the codec makes of a state (save-codec.ts encodeSave): a head record plus content-addressed chunk records, under
// the snapshot's own keys (`s|<life>|<rec>` for the head, `l|<life>|<chunk id>` for each chunk). Two snapshots that share a part (a
// completed decade of the log, an unchanged world root, an unchanged shard) store it once, because the id is the hash of the text.
// A restore reads the head, fetches the chunks it names and hands both to assembleSave; a missing, hostile or damaged chunk makes the
// snapshot unreadable (null, so the store forgets that stop) because a snapshot with a lost economy is not the life as it was.
//
// F39: every restore, the old layout included, goes through migrateSave, so a snapshot of the schema-2 build (v4.1.1: a record whose
// `log` is a list of chunk ids and whose economy is three kinds of frame) comes back as a schema-3 game, and one from a later
// schema is refused. The v4.1.1 layout is read by unpackLegacySnapshot, and the Time Machine fixture of R2-S2 (test/fixtures/
// tm-v4.1.1.json.gz, written by the v4.1.1 engine itself) is its guard.
//
// The module graph is rebuilt per setup (vi.resetModules), because the snapshot index is read from localStorage when save.ts is first
// imported and the fixture needs its index there before that.
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GameState } from '../src/game/types'
import { memoryLocalStorage } from './save-kit'

// A fixed life as a constant, not a `seed: <digits>` pin (test/seed-pins.test.ts).
const LIFE_SEED = 3
const BIRTH_YEAR = 1990
const INDEX_KEY = 'anotherlife.timemachine.v1'
const STORE_PREFIX = 'anotherlife.tm.'

type Rec = Record<string, unknown>

interface Backend {
  name: 'idb' | 'local' | 'memory'
  data: Map<string, string>
  get(keys: string[]): Promise<(string | null)[]>
  put(entries: [string, string][]): Promise<void>
  remove(keys: string[]): Promise<void>
  keys(): Promise<string[]>
}

/** A snapshot backend over a Map, named as the index says it is (the fixture's index says idb). */
function backendOf(name: Backend['name'], initial: Record<string, string> = {}): Backend {
  const data = new Map(Object.entries(initial))
  return {
    name,
    data,
    get: async (keys) => keys.map((k) => data.get(k) ?? null),
    put: async (entries) => {
      for (const [k, v] of entries) data.set(k, v)
    },
    remove: async (keys) => {
      for (const k of keys) data.delete(k)
    },
    keys: async () => [...data.keys()],
  }
}

/** The engine, in a module graph of its own, with a localStorage holding `local`. */
async function boot(local: Record<string, string> = {}) {
  vi.resetModules()
  const storage = memoryLocalStorage(local)
  vi.stubGlobal('localStorage', storage)
  const save = await import('../src/game/save')
  const { ageUp } = await import('../src/game/aging')
  const { createNewLife } = await import('../src/game/life')
  const schema = await import('../src/game/save-schema')
  const codec = await import('../src/game/save-codec')
  const tm = await import('../src/game/timeMachine')
  const { decodeSnapshotRecord, encodeSnapshotRecord } = await import('../src/game/snapshot-codec')
  return { save, ageUp, createNewLife, schema, codec, tm, storage, decodeSnapshotRecord, encodeSnapshotRecord }
}
type Engine = Awaited<ReturnType<typeof boot>>

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function fixture(name: string): Rec {
  return JSON.parse(gunzipSync(readFileSync(`test/fixtures/${name}`)).toString()) as Rec
}

/** A child's life, aged one year at a time the way the store plays them: popups cleared, health kept up so nobody dies young. */
function newLife(e: Engine): GameState {
  const g = e.createNewLife({ seed: LIFE_SEED, year: BIRTH_YEAR })
  g.queue = []
  return g
}
function oneYear(e: Engine, g: GameState): void {
  g.queue = []
  g.character.stats.health = 100
  g.character.conditions = []
  e.ageUp(g)
}

/** Snapshot the start of each of `years` years (ages 0 to years - 1) of a new life; the states are kept as the text at that moment. */
async function lifeWithSnapshots(e: Engine, b: Backend, years: number): Promise<{ g: GameState; starts: Map<number, string> }> {
  const g = newLife(e)
  e.save.setSnapshotBackend(b)
  e.save.startTimeline(g.lifeId, null)
  const starts = new Map<number, string>()
  for (let i = 0; i < years; i++) {
    starts.set(g.character.age, JSON.stringify(g))
    expect(await e.save.takeSnapshot(g)).toBe(true)
    oneYear(e, g)
  }
  await e.save.snapshotWritesSettled()
  return { g, starts }
}

interface IndexStop {
  age: number
  rec: string
  chunks: string[]
}
/** The snapshot index the engine keeps in localStorage. */
function indexOf(e: Engine): { lifeId: string; stops: IndexStop[] } {
  return JSON.parse(e.storage.getItem(INDEX_KEY) ?? '{}') as { lifeId: string; stops: IndexStop[] }
}

const recordKey = (lifeId: string, rec: string): string => `s|${lifeId}|${rec}`
const chunkKey = (lifeId: string, id: string): string => `l|${lifeId}|${id}`

/** The plain head of a stop (the record is gz2 when it was long enough to compress). */
async function headOf(e: Engine, b: Backend, lifeId: string, stop: IndexStop): Promise<Rec> {
  const stored = b.data.get(recordKey(lifeId, stop.rec))
  if (stored === undefined) throw new Error(`no record for age ${stop.age}`)
  return JSON.parse(await e.decodeSnapshotRecord(stored)) as Rec
}

/** Every storage key the index says is alive: each stop's record and the chunks it lists. */
function liveKeys(e: Engine): Set<string> {
  const { lifeId, stops } = indexOf(e)
  const keep = new Set<string>()
  for (const s of stops) {
    keep.add(recordKey(lifeId, s.rec))
    for (const id of s.chunks) keep.add(chunkKey(lifeId, id))
  }
  return keep
}

const sorted = (keys: Iterable<string>): string[] => [...keys].sort()

describe('F39: snapshots of the schema-2 build restore through migrateSave', () => {
  it('every snapshot of the v4.1.1 fixture restores as schema 3, loadable, equal to migrateSave of its state, and plays a year', async () => {
    const tmFixture = fixture('tm-v4.1.1.json.gz') as { lifeId: string; index: string; entries: Record<string, string>; states: Record<string, string> }
    const e = await boot({ [INDEX_KEY]: tmFixture.index })
    e.save.setSnapshotBackend(backendOf('idb', tmFixture.entries))
    const ages = Object.keys(tmFixture.states).map(Number).sort((a, b) => a - b)
    expect(ages.length).toBeGreaterThanOrEqual(4)
    expect(e.save.timeStops(tmFixture.lifeId).map((s) => s.age)).toEqual(ages)

    for (const age of ages) {
      const text = tmFixture.states[String(age)]!
      const snap = await e.save.loadSnapshot(tmFixture.lifeId, age)
      expect(snap, `the snapshot of age ${age}`).not.toBeNull()
      expect(snap!.schemaVersion).toBe(e.schema.SAVE_SCHEMA)
      expect(e.schema.SAVE_SCHEMA).toBe(3)
      expect(e.schema.isLoadableGame(snap)).toBe(true)
      // What migrateSave makes of the state the v4.1.1 engine had at that moment (the diet of R2-S10 changes `previous`, and
      // both sides take it, so this holds then too).
      const migrated = e.schema.migrateSave(JSON.parse(text))
      expect(migrated.kind).toBe('ready')
      expect(JSON.stringify(snap)).toBe(JSON.stringify((migrated as { game: GameState }).game))
      // And today, with no slice migrate, that is the fixture state with schemaVersion 3 and nothing else different.
      const raw = JSON.parse(text) as Rec
      raw.schemaVersion = 3
      expect(JSON.stringify(snap)).toBe(JSON.stringify(raw))
    }

    // The oldest restored snapshot plays a year.
    const snap = (await e.save.loadSnapshot(tmFixture.lifeId, ages[0]!))!
    snap.queue = []
    e.ageUp(snap)
    expect(snap.character.age).toBe(ages[0]! + 1)
    expect(snap.character.alive).toBe(true)
  }, 60_000)

  it('a snapshot written at a later schema restores as null, in either layout', async () => {
    // The old layout: the record of a fixture snapshot with its schemaVersion raised to 4.
    const tmFixture = fixture('tm-v4.1.1.json.gz') as { lifeId: string; index: string; entries: Record<string, string> }
    const e = await boot({ [INDEX_KEY]: tmFixture.index })
    const old = backendOf('idb', tmFixture.entries)
    e.save.setSnapshotBackend(old)
    const stop = indexOf(e).stops[1]!
    const key = recordKey(tmFixture.lifeId, stop.rec)
    const legacy = JSON.parse(await e.decodeSnapshotRecord(old.data.get(key)!)) as Rec
    expect(legacy.schemaVersion).toBe(2)
    old.data.set(key, JSON.stringify({ ...legacy, schemaVersion: 4 }))
    expect(await e.save.loadSnapshot(tmFixture.lifeId, stop.age)).toBeNull()
    // The same record at its own schema restores (so the null above is the schema and nothing else).
    old.data.set(key, JSON.stringify({ ...legacy, schemaVersion: 2 }))
    expect(await e.save.loadSnapshot(tmFixture.lifeId, stop.age)).not.toBeNull()

    // The new layout: a head that says schemaVersion 4 over chunks that are all there.
    const b = backendOf('memory')
    const { g } = await lifeWithSnapshots(e, b, 3)
    const last = indexOf(e).stops.at(-1)!
    const head = await headOf(e, b, g.lifeId, last)
    expect(head.schemaVersion).toBe(3)
    b.data.set(recordKey(g.lifeId, last.rec), JSON.stringify({ ...head, schemaVersion: 4 }))
    expect(await e.save.loadSnapshot(g.lifeId, last.age)).toBeNull()
  }, 60_000)
})

describe('snapshots of both layouts in one timeline', () => {
  it('a player who updates mid-life keeps the old snapshots, adds new ones beside them, and every sweep keeps both', async () => {
    const tmFixture = fixture('tm-v4.1.1.json.gz') as { lifeId: string; index: string; entries: Record<string, string>; states: Record<string, string> }
    const e = await boot({ [INDEX_KEY]: tmFixture.index })
    const b = backendOf('idb', tmFixture.entries)
    e.save.setSnapshotBackend(b)
    const oldAges = indexOf(e).stops.map((s) => s.age)
    const newest = oldAges.at(-1)!
    // Play on from the newest old snapshot and take a snapshot of the new layout into the same timeline.
    const game = (await e.save.loadSnapshot(tmFixture.lifeId, newest))!
    oneYear(e, game)
    const want = JSON.stringify(game)
    expect(await e.save.takeSnapshot(game)).toBe(true)
    await e.save.snapshotWritesSettled()
    expect(indexOf(e).stops.map((s) => s.age)).toEqual([...oldAges, game.character.age])
    // The new one is a head with chunks, the old ones are not.
    const stops = indexOf(e).stops
    expect(e.codec.isChunkedHead(await headOf(e, b, tmFixture.lifeId, stops.at(-1)!))).toBe(true)
    expect(e.codec.isChunkedHead(await headOf(e, b, tmFixture.lifeId, stops[0]!))).toBe(false)
    expect(JSON.stringify(await e.save.loadSnapshot(tmFixture.lifeId, game.character.age))).toBe(want)
    for (const age of oldAges) {
      const text = tmFixture.states[String(age)]!
      const migrated = e.schema.migrateSave(JSON.parse(text)) as { game: GameState }
      expect(JSON.stringify(await e.save.loadSnapshot(tmFixture.lifeId, age)), `old snapshot of age ${age}`).toBe(JSON.stringify(migrated.game))
    }
    // Both layouts' parts are listed by the index, so a sweep (here: forgetting the future of the oldest) removes exactly the rest.
    expect(sorted(b.data.keys())).toEqual(sorted(liveKeys(e)))
    e.save.forgetFuture(tmFixture.lifeId, oldAges[1]!)
    await e.save.snapshotWritesSettled()
    expect(indexOf(e).stops.map((s) => s.age)).toEqual(oldAges.slice(0, 2))
    expect(sorted(b.data.keys())).toEqual(sorted(liveKeys(e)))
    for (const age of oldAges.slice(0, 2)) expect(await e.save.loadSnapshot(tmFixture.lifeId, age), `old snapshot of age ${age} after the sweep`).not.toBeNull()
  }, 120_000)
})

describe('a snapshot is the codec head plus shared chunks', () => {
  it('restores with exactly the JSON the state had, and its stored record is a schema-3 head naming its chunks', async () => {
    const e = await boot()
    const b = backendOf('memory')
    const { g, starts } = await lifeWithSnapshots(e, b, 4)
    expect(g.character.age).toBe(4)
    const stops = indexOf(e).stops
    expect(stops.map((s) => s.age)).toEqual([0, 1, 2, 3])
    for (const stop of stops) {
      const snap = await e.save.loadSnapshot(g.lifeId, stop.age)
      expect(JSON.stringify(snap), `age ${stop.age}`).toBe(starts.get(stop.age))
      // The record is the codec's head, and the index lists exactly the chunk ids that head names.
      const head = await headOf(e, b, g.lifeId, stop)
      expect(e.codec.isChunkedHead(head)).toBe(true)
      expect(head.schemaVersion).toBe(3)
      expect(stop.chunks).toEqual(e.codec.neededChunkIds(head))
      // The economy exists from the first year step on: a newborn's snapshot has none to keep.
      expect(stop.chunks.some((id) => id.startsWith('world.'))).toBe(stop.age > 0)
      // A chunk is stored under the snapshot's own key, beside the head.
      for (const id of stop.chunks) expect(b.data.has(chunkKey(g.lifeId, id)), id).toBe(true)
    }
  }, 60_000)

  it('a fork saved with saveGame and reloaded with loadGame has the JSON of the state it arrived in', async () => {
    const e = await boot()
    const b = backendOf('memory')
    const { g } = await lifeWithSnapshots(e, b, 8)
    const snap = await e.save.loadSnapshot(g.lifeId, 3)
    expect(snap).not.toBeNull()
    const arrived = e.tm.arriveInPast(g, snap!)
    expect(arrived.character.age).toBe(3)
    expect(e.save.saveGame(arrived)).toBe(true)
    await e.save.flushSave()
    const back = e.save.loadGame()
    expect(back).not.toBeNull()
    expect(JSON.stringify(back)).toBe(JSON.stringify(arrived))
  }, 60_000)

  it('a snapshot of a life with a world container restores it, the ledger inline and the shards in the world chunk', async () => {
    const e = await boot()
    const b = backendOf('memory')
    const g = newLife(e)
    for (let i = 0; i < 3; i++) oneYear(e, g)
    ;(g as unknown as Rec).world = { ledger: { total: 5, rows: [1, 2] }, facts: { rows: [{ a: 1 }, { a: 2 }], note: 'x' }, firms: { f1: { name: 'Acme' } } }
    e.save.setSnapshotBackend(b)
    e.save.startTimeline(g.lifeId, null)
    const want = JSON.stringify(g)
    expect(await e.save.takeSnapshot(g)).toBe(true)
    const stop = indexOf(e).stops[0]!
    const head = await headOf(e, b, g.lifeId, stop)
    // The ledger stays in the head, the other shards are placeholders.
    const world = head.world as Rec
    expect(world.ledger).toEqual({ total: 5, rows: [1, 2] })
    expect(world.facts).toBe('~world.facts')
    expect(world.firms).toBe('~world.firms')
    const snap = await e.save.loadSnapshot(g.lifeId, g.character.age)
    expect(JSON.stringify(snap)).toBe(want)
    expect((snap as unknown as Rec).world).toEqual((g as unknown as Rec).world)
  }, 60_000)

  it('stores each completed decade of the log once across ten snapshots, and one world chunk for an unchanged root', async () => {
    const e = await boot()
    const b = backendOf('memory')
    const { g, starts } = await lifeWithSnapshots(e, b, 24)
    const stops = indexOf(e).stops
    expect(stops).toHaveLength(e.tm.TIME_MACHINE_STOPS)
    expect(stops.at(-1)!.age).toBe(g.character.age - 1)

    // Per decade: the distinct completed-year texts the ten states hold, by their own log (the independent count).
    const want = new Map<number, Set<string>>()
    for (const stop of stops) {
      const state = JSON.parse(starts.get(stop.age)!) as GameState
      const byDecade = new Map<number, unknown[]>()
      for (const year of state.log.slice(0, -1)) {
        const n = Math.floor(year.age / 10)
        byDecade.set(n, [...(byDecade.get(n) ?? []), year])
      }
      for (const [n, years] of byDecade) want.set(n, (want.get(n) ?? new Set()).add(JSON.stringify(years)))
    }
    const stored = new Map<number, number>()
    for (const key of b.data.keys()) {
      const id = key.split('|')[2] ?? ''
      const m = /^log\.(\d+)\./.exec(id)
      if (m && key.startsWith('l|')) stored.set(Number(m[1]), (stored.get(Number(m[1])) ?? 0) + 1)
    }
    expect([...stored.keys()].sort()).toEqual([...want.keys()].sort())
    for (const [n, texts] of want) expect(stored.get(n), `log decade ${n}`).toBe(texts.size)
    // The first decade was complete in every snapshot kept: it is one record, not ten.
    expect(stored.get(0)).toBe(1)

    // Two snapshots whose worlds are the same text (a mid-year pair: only the core differs) share one world chunk.
    const e2 = await boot()
    const b2 = backendOf('memory')
    const g2 = newLife(e2)
    for (let i = 0; i < 3; i++) oneYear(e2, g2)
    e2.save.setSnapshotBackend(b2)
    e2.save.startTimeline(g2.lifeId, null)
    expect(await e2.save.takeSnapshot(g2)).toBe(true)
    const next = structuredClone(g2)
    next.character.age += 1
    next.character.money += 1
    expect(await e2.save.takeSnapshot(next)).toBe(true)
    const worlds = [...b2.data.keys()].filter((k) => /\|world\./.test(k))
    expect(indexOf(e2).stops).toHaveLength(2)
    expect(worlds).toHaveLength(1)
    const heads = [...b2.data.keys()].filter((k) => k.startsWith('s|'))
    expect(heads).toHaveLength(2)
  }, 120_000)

  it('stores every chunk and head of 1,000 characters or more as gz2 when compression is there', async () => {
    const e = await boot()
    const b = backendOf('memory')
    const { g } = await lifeWithSnapshots(e, b, 5)
    let long = 0
    let short = 0
    for (const stop of indexOf(e).stops) {
      const head = await headOf(e, b, g.lifeId, stop)
      const manifest = head.chunks as Record<string, { id: string; len: number }>
      for (const ref of Object.values(manifest)) {
        const stored = b.data.get(chunkKey(g.lifeId, ref.id))!
        if (ref.len >= 1000) {
          long++
          if (typeof CompressionStream !== 'undefined') expect(stored.startsWith('gz2:'), `${ref.id} (${ref.len} characters)`).toBe(true)
        } else {
          short++
          expect(stored.startsWith('gz2:'), `${ref.id} (${ref.len} characters)`).toBe(false)
        }
      }
      const record = b.data.get(recordKey(g.lifeId, stop.rec))!
      const plain = JSON.stringify(head)
      if (plain.length >= 1000 && typeof CompressionStream !== 'undefined') expect(record.startsWith('gz2:')).toBe(true)
    }
    expect(long).toBeGreaterThan(0)
    expect(short).toBeGreaterThanOrEqual(0)
  }, 60_000)
})

describe('a snapshot with a lost part restores as null and leaves the others alone', () => {
  /** `years` snapshots, and a way to find the stored chunk of snapshot `age` that no other snapshot uses (its world chunk, new every year). */
  async function setup(years = 5) {
    const e = await boot()
    const b = backendOf('memory')
    const { g, starts } = await lifeWithSnapshots(e, b, years)
    const stops = indexOf(e).stops
    expect(stops.map((s) => s.age)).toEqual(Array.from({ length: Math.min(years, e.tm.TIME_MACHINE_STOPS) }, (_, i) => Math.max(0, years - e.tm.TIME_MACHINE_STOPS) + i))
    const own = (age: number): string => {
      const stop = stops.find((s) => s.age === age)!
      const others = new Set(stops.filter((s) => s !== stop).flatMap((s) => s.chunks))
      const mine = stop.chunks.filter((id) => !others.has(id))
      const world = mine.find((id) => id.startsWith('world.'))
      if (world === undefined) throw new Error(`age ${age} has no world chunk of its own: ${stop.chunks.join(', ')}`)
      return chunkKey(g.lifeId, world)
    }
    const loads = async (age: number): Promise<boolean> => (await e.save.loadSnapshot(g.lifeId, age)) !== null
    return { e, b, g, starts, own, loads }
  }

  it('a missing chunk', async () => {
    const { b, own, loads } = await setup()
    b.data.delete(own(2))
    expect(await loads(2)).toBe(false)
    for (const age of [0, 1, 3, 4]) expect(await loads(age), `age ${age}`).toBe(true)
  }, 60_000)

  it('a hostile chunk (not JSON, a bad gz2 claim, and valid JSON of the wrong shape)', async () => {
    const { b, own, loads, e, g } = await setup()
    const key = own(2)
    b.data.set(key, 'this is not json')
    expect(await loads(2)).toBe(false)
    b.data.set(key, 'gz2:zzzzzz:not packed at all')
    expect(await loads(2)).toBe(false)
    b.data.set(key, '[1,2,3]')
    expect(await loads(2)).toBe(false)
    // Said in the plain: each snapshot but that one still restores, whichever lie the chunk told.
    for (const age of [0, 1, 3, 4]) expect(await loads(age), `age ${age}`).toBe(true)
    // The stop is forgotten the way the store does it, and the others keep their parts.
    e.save.forgetStop(g.lifeId, 2)
    await e.save.snapshotWritesSettled()
    expect(indexOf(e).stops.map((s) => s.age)).toEqual([0, 1, 3, 4])
    for (const age of [0, 1, 3, 4]) expect(await loads(age), `age ${age} after the sweep`).toBe(true)
  }, 60_000)

  it('a chunk whose text has the right length and a wrong sum', async () => {
    const { b, own, loads, e } = await setup()
    const key = own(3)
    const stored = b.data.get(key)!
    const plain = await e.decodeSnapshotRecord(stored)
    // Change one digit of a number somewhere in the text: same length, different checksum, still JSON.
    const at = plain.search(/[0-8],/)
    expect(at).toBeGreaterThan(0)
    const forged = `${plain.slice(0, at)}${Number(plain[at]) + 1}${plain.slice(at + 1)}`
    expect(forged).toHaveLength(plain.length)
    expect(forged).not.toBe(plain)
    expect(() => JSON.parse(forged)).not.toThrow()
    b.data.set(key, forged)
    expect(await loads(3)).toBe(false)
    for (const age of [0, 1, 2, 4]) expect(await loads(age), `age ${age}`).toBe(true)
  }, 60_000)

  it('a chunk several snapshots share, when it is lost, loses exactly those snapshots', async () => {
    // Thirteen years: the first decade of the log is complete from age 10 on, so the snapshots of ages 10, 11 and 12 hold the same chunk.
    const { b, g, e, loads } = await setup(13)
    const stops = indexOf(e).stops
    const shared = stops.at(-1)!.chunks.find((id) => id.startsWith('log.0.'))!
    expect(shared).toBeDefined()
    const users = stops.filter((s) => s.chunks.includes(shared)).map((s) => s.age)
    expect(users).toEqual([10, 11, 12])
    b.data.delete(chunkKey(g.lifeId, shared))
    for (const stop of stops) expect(await loads(stop.age), `age ${stop.age}`).toBe(!users.includes(stop.age))
  }, 60_000)

  it('a record that is not JSON, and a head with a hostile manifest, restore as null', async () => {
    const { b, g, e, loads } = await setup()
    const stop = indexOf(e).stops[2]!
    const key = recordKey(g.lifeId, stop.rec)
    const head = await headOf(e, b, g.lifeId, stop)
    b.data.set(key, '{"half":')
    expect(await loads(2)).toBe(false)
    b.data.set(key, JSON.stringify({ ...head, chunks: { world: { id: '../../x', len: 1 } } }))
    expect(await loads(2)).toBe(false)
    b.data.set(key, JSON.stringify({ ...head, chunks: [] }))
    expect(await loads(2)).toBe(false)
    for (const age of [0, 1, 3, 4]) expect(await loads(age), `age ${age}`).toBe(true)
  }, 60_000)
})

describe('the sweeps keep exactly the records the index refers to', () => {
  const stored = (b: Backend): string[] => sorted(b.data.keys())

  it('forgetFuture, forgetStop and startTimeline remove exactly what no stop references', async () => {
    const e = await boot()
    const b = backendOf('memory')
    const { g } = await lifeWithSnapshots(e, b, 6)
    expect(indexOf(e).stops.map((s) => s.age)).toEqual([0, 1, 2, 3, 4, 5])
    expect(stored(b)).toEqual(sorted(liveKeys(e)))

    // The future after age 3 never happened: its heads go, the parts only they used go, the shared parts stay.
    const before = new Set(b.data.keys())
    e.save.forgetFuture(g.lifeId, 3)
    await e.save.snapshotWritesSettled()
    expect(indexOf(e).stops.map((s) => s.age)).toEqual([0, 1, 2, 3])
    expect(stored(b)).toEqual(sorted(liveKeys(e)))
    const kept = [...before].filter((k) => b.data.has(k))
    expect(kept.length).toBeLessThan(before.size)
    expect(kept.length).toBeGreaterThan(0)

    // One unreadable stop: gone with its own parts only.
    e.save.forgetStop(g.lifeId, 1)
    await e.save.snapshotWritesSettled()
    expect(indexOf(e).stops.map((s) => s.age)).toEqual([0, 2, 3])
    expect(stored(b)).toEqual(sorted(liveKeys(e)))
    for (const age of [0, 2, 3]) expect(await e.save.loadSnapshot(g.lifeId, age), `age ${age}`).not.toBeNull()

    // A new timeline forgets everything.
    e.save.startTimeline('another-life', null)
    await e.save.snapshotWritesSettled()
    expect(stored(b)).toEqual([])
  }, 60_000)

  it('on the real localStorage backend the stored keys are exactly the live keys, and the newest stop restores', async () => {
    const e = await boot()
    const g = newLife(e)
    e.save.setSnapshotBackend(e.save.localSnapshotBackend())
    e.save.startTimeline(g.lifeId, null)
    for (let i = 0; i < 4; i++) {
      expect(await e.save.takeSnapshot(g)).toBe(true)
      oneYear(e, g)
    }
    await e.save.snapshotWritesSettled()
    const ours = [...e.storage.data.keys()].filter((k) => k.startsWith(STORE_PREFIX)).length
    expect(ours).toBeGreaterThan(0)
    expect(sorted([...e.storage.data.keys()].filter((k) => k.startsWith(STORE_PREFIX)).map((k) => k.slice(STORE_PREFIX.length)))).toEqual(sorted(liveKeys(e)))
    const last = indexOf(e).stops.at(-1)!
    expect(await e.save.loadSnapshot(g.lifeId, last.age)).not.toBeNull()
  }, 60_000)
})
