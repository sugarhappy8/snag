// R2-S7 (K.5 g): the boot reads chunks. A save is a head plus chunk records (save-codec.ts), and the boot (save-hydrate.ts) reads the
// head, fetches the chunks it names (from IndexedDB, or from localStorage for the legacy and the local candidates), and settles
// which game to play. A save with a missing or hostile chunk plays with that part fresh and keeps a copy of what was lost; a save
// whose core is unreadable is quarantined whole, as before; a later version's head is never read further and its chunks are never
// touched. The storage is the kit's: a localStorage in memory and a fake IndexedDB (a real one for the rows, wrappers for the
// failures). The lives are made once; a test that needs them in storage saves them there with the real saveGame.
import { readFileSync } from 'node:fs'
import { gunzipSync, gzipSync } from 'node:zlib'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ageUp } from '../src/game/aging'
import { economyState } from '../src/game/economy/model'
import { createNewLife } from '../src/game/life'
import * as save from '../src/game/save'
import { CHUNK_PREFIX, IDB_MARKER_KEY, chunkKey, idbSaveBackend, SAVE_KEY, type AsyncChunkStore, type AsyncSaveBackend } from '../src/game/save-backends'
import { encodeSave, isChunkedHead, neededChunkIds, textSum } from '../src/game/save-codec'
import { diagnoseRecord, hydrateSaves } from '../src/game/save-hydrate'
import { QUARANTINE_SLOTS, scanQuarantine } from '../src/game/save-quarantine'
import { migrateSave, SAVE_SCHEMA } from '../src/game/save-schema'
import { deleteSaveCopy, flushSave, getSaveStatus, readSaveCopy, resetSaveStoreForTests, setSaveBackend } from '../src/game/save-store'
import { decodeSnapshotRecord, encodeSnapshotRecord, packSnapshotBytes } from '../src/game/snapshot-codec'
import type { GameState } from '../src/game/types'
import { probeLife } from './probe-life'
import { fakeIndexedDb, memoryLocalStorage } from './save-kit'

// Fixed lives as constants, not `seed: <digits>` pins (test/seed-pins.test.ts).
const BOOT_LIFE_SEED = 3
const OTHER_LIFE_SEED = 5

const [SLOT_1, SLOT_2, SLOT_3] = QUARANTINE_SLOTS

type Rec = Record<string, unknown>

/** The v4.1.1 save as IndexedDB held it: the gz2 record, the localStorage marker and the plain JSON text of the game. */
const idbFixture = JSON.parse(gunzipSync(readFileSync('test/fixtures/idb-v4.1.1.json.gz')).toString()) as {
  saves: Record<string, string>
  marker: string
  state: string
}
/** The v4.0.2 save, a plain schema 2 record, as the text v4.0.2 left in localStorage. */
const v402 = gunzipSync(readFileSync('test/fixtures/save-v4.0.2.json.gz')).toString()

/** A 12-year life of one company: a world chunk and the decades of its log. Frozen by the encoder: never changed in a test. */
let life: GameState
/** Another life, small, for the tests that need a second one. */
let otherLife: string

beforeAll(() => {
  life = probeLife({ seed: BOOT_LIFE_SEED, birthYear: 1990, businesses: 1, years: 12, keepAlive: true })
  const names = Object.keys(encodeSave(life).manifest)
  if (!names.includes('world') || !names.some((n) => n.startsWith('log.'))) throw new Error(`the probe life has no world chunk and log decade to lose: ${names.join(', ')}`)
  const other = createNewLife({ seed: OTHER_LIFE_SEED, year: 2026 })
  for (let i = 0; i < 2; i++) {
    other.queue = []
    ageUp(other)
  }
  other.queue = []
  otherLife = JSON.stringify(other)
})

let storage: ReturnType<typeof memoryLocalStorage>

beforeEach(() => {
  resetSaveStoreForTests()
  storage = memoryLocalStorage()
  vi.stubGlobal('localStorage', storage)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// --- Helpers ------------------------------------------------------------------------------------

const chunksOf = (backend: AsyncSaveBackend): AsyncChunkStore => {
  if (backend.chunks === undefined) throw new Error('the backend has no chunk store')
  return backend.chunks
}

/** A ChunkSource over a database: the chunk records by id, null for one it does not hold. */
const sourceOf = (backend: AsyncSaveBackend) => async (ids: readonly string[]): Promise<Map<string, string | null>> => {
  const rows = await chunksOf(backend).get(ids)
  return new Map(ids.map((id, i) => [id, rows[i] ?? null] as const))
}

const nameToId = (head: Rec, name: string): string => ((head.chunks as Record<string, { id: string }>)[name]).id

/** The page before: `g` saved with the real saveGame into the database of `factory`, then the page closes. The head, as the database holds it. */
async function saveInto(factory: IDBFactory, g: GameState): Promise<{ backend: AsyncSaveBackend; head: Rec; record: string }> {
  resetSaveStoreForTests()
  const backend = await idbSaveBackend(factory)
  setSaveBackend(backend)
  expect(save.saveGame(g)).toBe(true)
  expect(await flushSave()).toBe(true)
  const record = await backend.read()
  if (record === null) throw new Error('the save did not reach the database')
  const head = JSON.parse(await decodeSnapshotRecord(record)) as Rec
  expect(isChunkedHead(head)).toBe(true)
  resetSaveStoreForTests()
  return { backend, head, record }
}

/** Forges a chunk: the head of `stored` now names `name` with the id and length of `text`, and the database holds `text` under that id. */
async function forge(stored: { backend: AsyncSaveBackend; head: Rec }, name: string, text: string): Promise<string> {
  const head = structuredClone(stored.head) as { chunks: Record<string, { id: string; len: number }> }
  const id = `${name}.${textSum(text)}`
  head.chunks[name] = { id, len: text.length }
  await chunksOf(stored.backend).put([[id, text]])
  await stored.backend.write(JSON.stringify(head))
  return id
}

/** The notices of the copies of a partly loaded save. */
const partialNotices = () => getSaveStatus().notices.filter((n) => n.partial === true)

/** The `saves` store of the fake database, raw: for the rows that are no chunk of this generation. */
function rawSaves(factory: IDBFactory): Promise<{ put(key: string, value: string): Promise<void>; keys(): Promise<string[]> }> {
  return new Promise((resolve, reject) => {
    const req = factory.open('anotherlife-save', 1)
    req.onupgradeneeded = () => {
      for (const name of ['saves', 'quarantine']) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name)
    }
    req.onerror = () => reject(req.error)
    req.onsuccess = () => {
      const db = req.result
      const run = <T>(mode: IDBTransactionMode, ask: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> =>
        new Promise((done, fail) => {
          const tx = db.transaction('saves', mode)
          const request = ask(tx.objectStore('saves'))
          tx.oncomplete = () => done(request.result)
          tx.onabort = () => fail(tx.error)
        })
      resolve({
        put: async (key, value) => void (await run('readwrite', (store) => store.put(value, key))),
        keys: async () => (await run('readonly', (store) => store.getAllKeys())).map(String),
      })
    }
  })
}

/** Plays `years` years of `g` the way the store does: the popups cleared, then ageUp. */
function play(g: GameState, years: number): void {
  for (let i = 0; i < years; i++) {
    g.queue = []
    ageUp(g)
  }
}

/** The game a record migrates to, as JSON: what boot stores when it imports `raw`. */
function migratedJson(raw: string): string {
  const found = migrateSave(JSON.parse(raw))
  if (found.kind !== 'ready') throw new Error(`expected a ready save, got ${found.kind}`)
  return JSON.stringify(found.game)
}

/** A gz2 record that inflates to 20 million bytes of zeros: a few thousand characters on disk. */
function bomb(): string {
  return packSnapshotBytes(new Uint8Array(gzipSync(Buffer.alloc(20_000_000))))
}

/** The browser keeps its life in IndexedDB (the marker is set). */
const idbMarkedNow = (): boolean => storage.data.get(IDB_MARKER_KEY) === '1'

const real = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

/**
 * Runs a boot to its end under fake timers: the streams of the codec need the real rest of the clock, so it alternates with the fake
 * one. The fake clock runs ahead of the codec's real work, so the budget of the whole boot is lifted: these tests are about the
 * wait on one storage call (3000 ms), not the budget.
 */
async function bootUnderFakeTimers(opts: Parameters<typeof hydrateSaves>[0]): Promise<Awaited<ReturnType<typeof hydrateSaves>>> {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  let outcome: Awaited<ReturnType<typeof hydrateSaves>> | undefined
  void hydrateSaves({ budgetMs: 1_000_000, ...opts }).then((out) => {
    outcome = out
  })
  for (let i = 0; i < 200 && outcome === undefined; i++) {
    await real()
    await vi.advanceTimersByTimeAsync(100)
  }
  if (outcome === undefined) throw new Error('the boot did not end')
  return outcome
}

// --- The head and its chunks are read ------------------------------------------------------------

describe('a head with chunks, at boot', () => {
  it('boots the v4.1.1 IndexedDB fixture, plays five years, and the first save writes a head with chunks', async () => {
    const factory = fakeIndexedDb()
    const db = await idbSaveBackend(factory)
    await db.write(idbFixture.saves[SAVE_KEY])
    storage.data.set(IDB_MARKER_KEY, idbFixture.marker)

    const out = await hydrateSaves({ factory })
    expect(out).toEqual({ backend: 'idb', source: 'idb', fellBack: false, imported: false })
    expect(getSaveStatus().notices).toEqual([])
    const g = save.loadGame()
    if (g === null) throw new Error('the fixture did not load')
    expect(g.schemaVersion).toBe(SAVE_SCHEMA)
    const startYear = g.year
    play(g, 5)
    expect(g.character.alive).toBe(true)
    expect(g.year).toBe(startYear + 5)

    expect(save.saveGame(g)).toBe(true)
    expect(await flushSave()).toBe(true)
    const stored = await db.read()
    expect(stored).not.toBe(idbFixture.saves[SAVE_KEY])
    const head = JSON.parse(await decodeSnapshotRecord(stored ?? '')) as Rec
    expect(isChunkedHead(head)).toBe(true)
    expect(head.schemaVersion).toBe(SAVE_SCHEMA)
    expect((await db.chunks?.ids())?.length).toBeGreaterThan(0)

    // The next page reads it back to the same game.
    resetSaveStoreForTests()
    expect(await hydrateSaves({ factory })).toMatchObject({ backend: 'idb', source: 'idb' })
    expect(JSON.stringify(save.loadGame())).toBe(JSON.stringify(g))
  })

  it('boots a head the previous page saved to an equal game, and its first save writes no chunk', async () => {
    const factory = fakeIndexedDb()
    await saveInto(factory, life)
    const db = await idbSaveBackend(factory)
    const puts: number[] = []
    const counting: AsyncSaveBackend = { ...db, chunks: { ...chunksOf(db), put: async (entries) => { puts.push(entries.length); await chunksOf(db).put(entries) } } }

    const out = await hydrateSaves({ backend: counting })
    expect(out).toMatchObject({ backend: 'idb', source: 'idb', fellBack: false })
    expect(getSaveStatus().notices).toEqual([])
    expect(JSON.stringify(save.loadGame())).toBe(JSON.stringify(life))

    const g = save.loadGame()
    if (g === null) throw new Error('the save did not load')
    g.character.money += 1
    expect(save.saveGame(g)).toBe(true)
    expect(await flushSave()).toBe(true)
    // Every chunk the head names was already in the database: boot told the store so.
    expect(puts).toEqual([])
    expect(JSON.stringify(save.loadGame())).toBe(JSON.stringify(g))
  })

  it('reads a local head and its chunk keys through the localStorage chunk store', async () => {
    // Page one kept the life in localStorage as a head plus chunk keys; page two has the database too.
    expect(save.saveGame(life)).toBe(true)
    expect(isChunkedHead(JSON.parse(storage.data.get(SAVE_KEY) ?? 'null'))).toBe(true)
    const keys = [...storage.data.keys()].filter((k) => k.startsWith(CHUNK_PREFIX))
    expect(keys.length).toBeGreaterThan(1)

    resetSaveStoreForTests()
    const local = await hydrateSaves({ idb: false })
    expect(local).toEqual({ backend: 'local', source: 'local', fellBack: false, imported: false })
    expect(JSON.stringify(save.loadGame())).toBe(JSON.stringify(life))
    expect(getSaveStatus().notices).toEqual([])
  })
})

// --- A missing chunk, a hostile chunk ------------------------------------------------------------

describe('a chunk that is missing or hostile', () => {
  it('a missing world chunk: the life plays with the economy fresh, and one partial notice keeps a copy with the head in it', async () => {
    const factory = fakeIndexedDb()
    const stored = await saveInto(factory, life)
    await chunksOf(stored.backend).remove([nameToId(stored.head, 'world')])

    const out = await hydrateSaves({ factory })
    expect(out).toEqual({ backend: 'idb', source: 'idb', fellBack: false, imported: false })
    const partial = partialNotices()
    expect(partial).toHaveLength(1)
    expect(partial[0]).toMatchObject({ kind: 'damaged', partial: true })

    const g = save.loadGame()
    if (g === null) throw new Error('the partly lost save did not load')
    expect(g.lifeId).toBe(life.lifeId)
    expect(g.flags.worldEconomy).toBeUndefined()
    play(g, 1)
    expect(economyState(g)).not.toBeNull()

    const copy = await readSaveCopy(partial[0].id)
    const dump = JSON.parse(copy ?? 'null') as { al: string; head: Rec; chunks: Rec }
    expect(dump.al).toBe('partial-save')
    expect(dump.head).toEqual(stored.head)
    // Nothing hostile was lost, so the copy carries no chunk text.
    expect(dump.chunks).toEqual({})
  })

  type Saved = { backend: AsyncSaveBackend; head: Rec }
  const hostile: { label: string; make: (saved: Saved, plain: string) => Promise<{ id: string; held: string }>; kept: boolean }[] = [
    {
      label: 'a checksum that does not match',
      make: async (saved, plain) => {
        const id = nameToId(saved.head, 'world')
        const held = `${plain.slice(0, -2)}xx`
        await chunksOf(saved.backend).put([[id, held]])
        return { id, held }
      },
      kept: true,
    },
    {
      label: 'a text that is not JSON',
      make: async (saved) => {
        const held = 'this is not a world'
        return { id: await forge(saved, 'world', held), held }
      },
      kept: true,
    },
    {
      // The room of the world chunk is the caps of its slices, and a packed slice has twice its nodes (R2-S11: the shape table's
      // wrappers), 420,000 in all. This text has 500,001 nodes: over it, so it is a size loss and not worth keeping.
      label: 'a node bomb',
      make: async (saved) => {
        const held = `{"flags.worldEconomy":[${'0,'.repeat(500_000)}0]}`
        return { id: await forge(saved, 'world', held), held }
      },
      kept: false,
    },
    {
      // The bomb of R2-S7 had 250,001 nodes, which is over the economy's own cap (150,000) but inside the packed room. It passes
      // the size check, and the economy's normalize refuses an array, so the chunk is hostile and its text is kept like any other.
      label: 'an array where the economy should be, inside the packed room',
      make: async (saved) => {
        const held = `{"flags.worldEconomy":[${'0,'.repeat(250_000)}0]}`
        return { id: await forge(saved, 'world', held), held }
      },
      kept: true,
    },
  ]
  it.each(hostile)('a hostile world chunk, $label: it plays, nothing crashes, one partial notice', async ({ make, kept }) => {
    const factory = fakeIndexedDb()
    const saved = await saveInto(factory, life)
    const plain = encodeSave(life).chunks.get(nameToId(saved.head, 'world')) ?? ''
    expect(plain.length).toBeGreaterThan(100)
    const { id, held } = await make(saved, plain)

    const out = await hydrateSaves({ factory })
    expect(out).toMatchObject({ backend: 'idb', source: 'idb' })
    expect(partialNotices()).toHaveLength(1)
    const g = save.loadGame()
    expect(g?.lifeId).toBe(life.lifeId)
    expect(g?.flags.worldEconomy).toBeUndefined()
    const dump = JSON.parse((await readSaveCopy(partialNotices()[0].id)) ?? 'null') as { chunks: Record<string, string> }
    // A text that is hostile is kept as it was found; one that only passes its caps is not worth keeping.
    expect(dump.chunks).toEqual(kept ? { [id]: held } : {})
  })

  it('a gz2 record that claims 20 MB is refused before it is inflated, and the life plays', async () => {
    const factory = fakeIndexedDb()
    const saved = await saveInto(factory, life)
    const worldId = nameToId(saved.head, 'world')
    const claim = bomb()
    await chunksOf(saved.backend).put([[worldId, claim]])

    const out = await hydrateSaves({ factory })
    expect(out).toMatchObject({ backend: 'idb', source: 'idb' })
    expect(partialNotices()).toHaveLength(1)
    expect(save.loadGame()?.flags.worldEconomy).toBeUndefined()
    const dump = JSON.parse((await readSaveCopy(partialNotices()[0].id)) ?? 'null') as { chunks: Record<string, string> }
    expect(dump.chunks).toEqual({ [worldId]: claim })
  })

  it('a missing log decade: the game loads with the years it has, and one partial notice', async () => {
    const factory = fakeIndexedDb()
    const saved = await saveInto(factory, life)
    const decade = Object.keys(saved.head.chunks as Rec).find((n) => n.startsWith('log.'))
    if (decade === undefined) throw new Error('no log decade')
    await chunksOf(saved.backend).remove([nameToId(saved.head, decade)])

    expect(await hydrateSaves({ factory })).toMatchObject({ source: 'idb' })
    expect(partialNotices()).toHaveLength(1)
    const g = save.loadGame()
    if (g === null) throw new Error('did not load')
    expect(g.log.length).toBeLessThan(life.log.length)
    expect(g.log.at(-1)).toEqual(life.log.at(-1))
    expect(g.flags.worldEconomy).toEqual(life.flags.worldEconomy)
  })

  it('a head whose core is damaged is quarantined whole, and is not partial', async () => {
    const factory = fakeIndexedDb()
    const saved = await saveInto(factory, life)
    const bad = { ...saved.head }
    delete bad.character
    const text = JSON.stringify(bad)
    await saved.backend.write(text)

    const out = await hydrateSaves({ factory })
    expect(out).toMatchObject({ backend: 'idb', source: 'none' })
    expect(save.loadGame()).toBeNull()
    const notices = getSaveStatus().notices
    expect(notices).toHaveLength(1)
    expect(notices[0].kind).toBe('damaged')
    expect(notices[0].partial).toBeUndefined()
    expect(await readSaveCopy(notices[0].id)).toBe(text)
    expect(await saved.backend.read()).toBeNull()
  })

  it('with five copies kept already, a partial load still plays and adds no notice', async () => {
    const factory = fakeIndexedDb()
    const saved = await saveInto(factory, life)
    await chunksOf(saved.backend).remove([nameToId(saved.head, 'world')])
    for (const [i, slot] of [SLOT_1, SLOT_2, SLOT_3].entries()) storage.data.set(slot, `kept ${i}`)
    await saved.backend.overflow.put('bad-1', 'kept 3')
    await saved.backend.overflow.put('bad-2', 'kept 4')

    expect(await hydrateSaves({ factory })).toMatchObject({ backend: 'idb', source: 'idb' })
    expect(save.loadGame()?.lifeId).toBe(life.lifeId)
    expect(partialNotices()).toEqual([])
    expect(getSaveStatus().notices).toHaveLength(5)
    expect(await saved.backend.overflow.keys()).toEqual(['bad-1', 'bad-2'])
  })

  it('a local head with a missing chunk plays and keeps a copy too', async () => {
    expect(save.saveGame(life)).toBe(true)
    const head = JSON.parse(storage.data.get(SAVE_KEY) ?? 'null') as Rec
    storage.data.delete(chunkKey(nameToId(head, 'world')))
    resetSaveStoreForTests()

    expect(await hydrateSaves({ idb: false })).toEqual({ backend: 'local', source: 'local', fellBack: false, imported: false })
    expect(partialNotices()).toHaveLength(1)
    expect(save.loadGame()?.flags.worldEconomy).toBeUndefined()
    const dump = JSON.parse((await readSaveCopy(partialNotices()[0].id)) ?? 'null') as { al: string; head: Rec }
    expect(dump.al).toBe('partial-save')
    expect(dump.head).toEqual(head)
  })

  it('the partial notice survives the rescan of the kept copies, a second boot keeps no second copy, and the copy is deleted like any other', async () => {
    const factory = fakeIndexedDb()
    const saved = await saveInto(factory, life)
    await chunksOf(saved.backend).remove([nameToId(saved.head, 'world')])
    await hydrateSaves({ factory })
    const [first] = partialNotices()
    expect(first).toBeDefined()
    expect(storage.data.has(first.id)).toBe(true)

    // The page closes without saving: the same record is read again, and the copy of its loss is the copy already kept.
    resetSaveStoreForTests()
    await hydrateSaves({ factory })
    expect(partialNotices()).toEqual([first])
    expect(getSaveStatus().notices).toEqual([first])
    expect([SLOT_1, SLOT_2, SLOT_3].filter((slot) => storage.data.has(slot))).toEqual([first.id])

    await deleteSaveCopy(first.id)
    expect(getSaveStatus().notices).toEqual([])
    expect(storage.data.has(first.id)).toBe(false)
  })

  it('the first save after a partial load heals the record: the head names only chunks the database holds', async () => {
    const factory = fakeIndexedDb()
    const saved = await saveInto(factory, life)
    await chunksOf(saved.backend).remove([nameToId(saved.head, 'world')])
    await hydrateSaves({ factory })
    const g = save.loadGame()
    if (g === null) throw new Error('did not load')
    play(g, 1)
    expect(save.saveGame(g)).toBe(true)
    expect(await flushSave()).toBe(true)

    const head = JSON.parse(await decodeSnapshotRecord((await saved.backend.read()) ?? '')) as Rec
    const held = new Set(await chunksOf(saved.backend).ids())
    for (const id of neededChunkIds(head)) expect(held.has(id), `the head names ${id}`).toBe(true)
    expect(neededChunkIds(head).some((id) => id.startsWith('world.'))).toBe(true)
    // Nothing else is stored: the sweep took what the new head does not name.
    expect([...held].sort()).toEqual([...neededChunkIds(head)].sort())

    resetSaveStoreForTests()
    await hydrateSaves({ factory })
    expect(save.loadGame()?.year).toBe(g.year)
    expect(partialNotices()).toHaveLength(1)
    expect([SLOT_1, SLOT_2, SLOT_3].filter((slot) => storage.data.has(slot))).toHaveLength(1)
  })
})

// --- The database ----------------------------------------------------------------------------------

describe('a database that answers for the head and not for its chunks', () => {
  it('is out of reach as a whole: the page plays from localStorage and what the database holds is left alone', async () => {
    const factory = fakeIndexedDb()
    const saved = await saveInto(factory, life)
    const db = await idbSaveBackend(factory)
    const silent: AsyncSaveBackend = { ...db, chunks: { ...chunksOf(db), get: () => new Promise<never>(() => undefined) } }
    const outcome = await bootUnderFakeTimers({ backend: silent })
    expect(outcome).toEqual({ backend: 'local', source: 'none', fellBack: true, imported: false })
    // The life is in the database and this browser knows it: Home says so, and nothing was copied, shelved or removed.
    expect(getSaveStatus().notices.map((n) => n.kind)).toEqual(['unreachable'])
    expect(await db.read()).toBe(saved.record)
    expect((await chunksOf(db).ids()).length).toBeGreaterThan(1)
    expect(storage.data.has(SAVE_KEY)).toBe(false)
    expect([SLOT_1, SLOT_2, SLOT_3].filter((slot) => storage.data.has(slot))).toEqual([])
  })

  it('a listing of the stored chunks that hangs costs the wait and no more: the life is still the database\'s', async () => {
    const factory = fakeIndexedDb()
    await saveInto(factory, life)
    const db = await idbSaveBackend(factory)
    const slow: AsyncSaveBackend = { ...db, chunks: { ...chunksOf(db), ids: () => new Promise<never>(() => undefined) } }

    const outcome = await bootUnderFakeTimers({ backend: slow })
    expect(outcome).toEqual({ backend: 'idb', source: 'idb', fellBack: false, imported: false })
    expect(getSaveStatus().notices).toEqual([])
    expect(JSON.stringify(save.loadGame())).toBe(JSON.stringify(life))
  })
})

// --- A later version's head --------------------------------------------------------------------------

describe('a head from a later version', () => {
  it('is newer and protected, its chunks are never read, and the chunks of its generation survive a save', async () => {
    const factory = fakeIndexedDb()
    const saved = await saveInto(factory, life)
    const later = JSON.stringify({ ...saved.head, schemaVersion: SAVE_SCHEMA + 1 })
    await saved.backend.write(later)
    const laterKey = `${SAVE_KEY}.c${SAVE_SCHEMA + 1}.world.abc123xyz`
    const rows = await rawSaves(factory)
    await rows.put(laterKey, '{"later":1}')

    const reads: string[][] = []
    const db = await idbSaveBackend(factory)
    const watched: AsyncSaveBackend = { ...db, chunks: { ...chunksOf(db), get: async (ids) => { reads.push([...ids]); return chunksOf(db).get(ids) } } }
    const out = await hydrateSaves({ backend: watched })
    expect(out).toMatchObject({ backend: 'idb', source: 'none', fellBack: false })
    expect(reads).toEqual([])
    expect(getSaveStatus().notices).toEqual([{ id: SAVE_KEY, kind: 'newer', bytes: later.length, version: SAVE_SCHEMA + 1 }])
    expect(save.loadGame()).toBeNull()
    expect(await readSaveCopy(SAVE_KEY)).toBe(later)

    // The next save copies the later record first, writes this generation's chunks, and never sweeps the later one's.
    const g = structuredClone(life)
    expect(save.saveGame(g)).toBe(true)
    expect(await flushSave()).toBe(true)
    expect(await rows.keys()).toContain(laterKey)
    expect(await readSaveCopy(getSaveStatus().notices[0].id)).toBe(later)
    expect(isChunkedHead(JSON.parse(await decodeSnapshotRecord((await db.read()) ?? '')))).toBe(true)
  })
})

// --- The legacy record -----------------------------------------------------------------------------

describe('the legacy record', () => {
  it('v4.0.2 in localStorage and an empty database: imported as a head with chunks, read back identical, the legacy record and its chunk keys gone', async () => {
    storage.data.set(SAVE_KEY, v402)
    // A chunk key of this generation, left by an earlier page: with the record gone it names nothing.
    storage.data.set(chunkKey('world.zzzzzz'), '{}')
    const factory = fakeIndexedDb()

    const out = await hydrateSaves({ factory })
    expect(out).toEqual({ backend: 'idb', source: 'legacy', fellBack: false, imported: true })
    expect(storage.data.has(SAVE_KEY)).toBe(false)
    expect([...storage.data.keys()].filter((k) => k.startsWith(CHUNK_PREFIX))).toEqual([])
    expect(idbMarkedNow()).toBe(true)

    const db = await idbSaveBackend(factory)
    const record = (await db.read()) ?? ''
    expect(isChunkedHead(JSON.parse(await decodeSnapshotRecord(record)))).toBe(true)
    const back = await diagnoseRecord(record, { chunks: sourceOf(db) })
    expect(back.kind).toBe('ready')
    if (back.kind === 'ready') expect(JSON.stringify(back.game)).toBe(migratedJson(v402))
    expect(back.kind === 'ready' ? back.lost : null).toEqual([])
    expect(JSON.stringify(save.loadGame())).toBe(migratedJson(v402))
  })

  it('a database that refuses the head write: the legacy record stays and the page plays from localStorage', async () => {
    storage.data.set(SAVE_KEY, v402)
    const db = await idbSaveBackend(fakeIndexedDb())
    const refusing: AsyncSaveBackend = { ...db, write: () => Promise.reject(new DOMException('The quota has been exceeded.', 'QuotaExceededError')) }

    const out = await hydrateSaves({ backend: refusing })
    expect(out).toEqual({ backend: 'local', source: 'local', fellBack: true, imported: false })
    expect(storage.data.get(SAVE_KEY)).toBe(v402)
    expect(JSON.stringify(save.loadGame())).toBe(migratedJson(v402))
  })

  it('a chunk put that fails keeps the legacy record too', async () => {
    storage.data.set(SAVE_KEY, v402)
    const db = await idbSaveBackend(fakeIndexedDb())
    const full: AsyncSaveBackend = { ...db, chunks: { ...chunksOf(db), put: () => Promise.reject(new DOMException('The quota has been exceeded.', 'QuotaExceededError')) } }

    const out = await hydrateSaves({ backend: full })
    expect(out).toEqual({ backend: 'local', source: 'local', fellBack: true, imported: false })
    expect(storage.data.get(SAVE_KEY)).toBe(v402)
    expect(await db.read()).toBeNull()
  })

  it('a legacy head with chunks in localStorage is imported with its chunks, and head and chunk keys both go', async () => {
    expect(save.saveGame(life)).toBe(true)
    expect([...storage.data.keys()].filter((k) => k.startsWith(CHUNK_PREFIX)).length).toBeGreaterThan(1)
    resetSaveStoreForTests()
    const factory = fakeIndexedDb()

    expect(await hydrateSaves({ factory })).toEqual({ backend: 'idb', source: 'legacy', fellBack: false, imported: true })
    expect(storage.data.has(SAVE_KEY)).toBe(false)
    expect([...storage.data.keys()].filter((k) => k.startsWith(CHUNK_PREFIX))).toEqual([])
    const db = await idbSaveBackend(factory)
    const back = await diagnoseRecord((await db.read()) ?? '', { chunks: sourceOf(db) })
    expect(back.kind === 'ready' ? JSON.stringify(back.game) : back.kind).toBe(JSON.stringify(life))
  })

  it('a legacy head that loses to the database is kept as one self-contained copy, and its chunk keys go with it', async () => {
    expect(save.saveGame(life)).toBe(true)
    resetSaveStoreForTests()
    const factory = fakeIndexedDb()
    const db = await idbSaveBackend(factory)
    await db.write(otherLife)

    const out = await hydrateSaves({ factory })
    expect(out).toMatchObject({ backend: 'idb', source: 'idb' })
    const [copy] = getSaveStatus().notices
    expect(copy).toMatchObject({ kind: 'stale' })
    expect(copy.partial).toBeUndefined()
    // The copy is the whole game, not a head whose chunks are about to be swept.
    expect(await readSaveCopy(copy.id)).toBe(JSON.stringify(life))
    expect(storage.data.has(SAVE_KEY)).toBe(false)
    expect([...storage.data.keys()].filter((k) => k.startsWith(CHUNK_PREFIX))).toEqual([])
  })
})

// --- The copy of the main slot ----------------------------------------------------------------------

describe('readSaveCopy of the main slot', () => {
  it('is the whole game when the record is a head and every chunk is there, on IndexedDB and on localStorage', async () => {
    const factory = fakeIndexedDb()
    const saved = await saveInto(factory, life)
    setSaveBackend(saved.backend)
    expect(await readSaveCopy(SAVE_KEY)).toBe(JSON.stringify(life))

    resetSaveStoreForTests()
    expect(save.saveGame(life)).toBe(true)
    expect(await readSaveCopy(SAVE_KEY)).toBe(JSON.stringify(life))
  })

  it('is the head itself when a chunk is missing, a plain record as it is, and nothing when there is none', async () => {
    expect(await readSaveCopy(SAVE_KEY)).toBeNull()
    storage.data.set(SAVE_KEY, v402)
    expect(await readSaveCopy(SAVE_KEY)).toBe(v402)

    storage.data.clear()
    expect(save.saveGame(life)).toBe(true)
    const head = storage.data.get(SAVE_KEY) ?? ''
    storage.data.delete(chunkKey(nameToId(JSON.parse(head) as Rec, 'world')))
    expect(await readSaveCopy(SAVE_KEY)).toBe(head)
  })
})

// --- The pieces --------------------------------------------------------------------------------------

describe('diagnoseRecord with chunks', () => {
  const encoded = () => encodeSave(life)
  const sourceOfTexts = (texts: ReadonlyMap<string, string>) => async (ids: readonly string[]): Promise<Map<string, string | null>> => new Map(ids.map((id) => [id, texts.get(id) ?? null] as const))

  it('reads a head with every chunk to the game it came from, with nothing lost', async () => {
    const enc = encoded()
    const found = await diagnoseRecord(enc.head, { chunks: sourceOfTexts(enc.chunks) })
    expect(found.kind).toBe('ready')
    if (found.kind !== 'ready') return
    expect(JSON.stringify(found.game)).toBe(JSON.stringify(life))
    expect(found.lost).toEqual([])
    expect(found.from).toBe(SAVE_SCHEMA)
  })

  it('reads chunk records that are gz2, each within the length its manifest gives it', async () => {
    const enc = encoded()
    const packed = new Map<string, string>()
    for (const [id, text] of enc.chunks) packed.set(id, await encodeSnapshotRecord(text, 0))
    expect([...packed.values()].every((r) => r.startsWith('gz2:'))).toBe(true)
    const found = await diagnoseRecord(enc.head, { chunks: sourceOfTexts(packed) })
    expect(found.kind === 'ready' ? found.lost : found.kind).toEqual([])
  })

  it('with no chunk source reads a head as if every chunk were missing', async () => {
    const found = await diagnoseRecord(encoded().head)
    expect(found.kind).toBe('ready')
    if (found.kind !== 'ready') return
    expect(found.lost?.map((l) => l.name).sort()).toEqual(Object.keys(encoded().manifest).sort())
    expect(found.lost?.every((l) => l.why === 'missing')).toBe(true)
  })

  it('a later version is newer before any chunk is fetched; a source that throws is damaged', async () => {
    const enc = encoded()
    const fetch = vi.fn(sourceOfTexts(enc.chunks))
    const later = JSON.stringify({ ...(JSON.parse(enc.head) as Rec), schemaVersion: SAVE_SCHEMA + 1 })
    expect(await diagnoseRecord(later, { chunks: fetch })).toEqual({ kind: 'newer', version: SAVE_SCHEMA + 1 })
    expect(fetch).not.toHaveBeenCalled()
    expect(await diagnoseRecord(enc.head, { chunks: () => Promise.reject(new Error('storage failed')) })).toEqual({ kind: 'damaged' })
  })

  it('a record that is not a head reads as it did: a plain v2 record, and an inline v3 record', async () => {
    const plain = await diagnoseRecord(v402)
    expect(plain.kind === 'ready' ? [plain.from, plain.lost] : plain.kind).toEqual([2, undefined])
    const inline = await diagnoseRecord(JSON.stringify(life))
    expect(inline.kind === 'ready' ? [inline.from, inline.lost] : inline.kind).toEqual([SAVE_SCHEMA, undefined])
  })
})

describe('decodeSnapshotRecord with a limit', () => {
  it('refuses a gz2 record that would inflate past the limit, before it inflates, and still reads one within it', async () => {
    const claim = bomb()
    // A stream that is never to be made: the refusal comes first, so the message is the codec's and not this one.
    vi.stubGlobal('DecompressionStream', class { constructor() { throw new Error('inflated') } })
    await expect(decodeSnapshotRecord(claim, 5000)).rejects.toThrow(/safe size/)
    vi.unstubAllGlobals()
    vi.stubGlobal('localStorage', storage)

    const text = JSON.stringify({ a: 'x'.repeat(5000) })
    const packed = await encodeSnapshotRecord(text, 0)
    expect(packed.startsWith('gz2:')).toBe(true)
    expect(await decodeSnapshotRecord(packed, text.length)).toBe(text)
    await expect(decodeSnapshotRecord(packed, text.length - 1)).rejects.toThrow(/safe size/)
    // The limit counts characters: text with characters of three bytes is not refused for its bytes.
    const wide = '€'.repeat(3000)
    expect(await decodeSnapshotRecord(await encodeSnapshotRecord(wide, 0), wide.length)).toBe(wide)
    // A plain record is returned as it is, whatever the limit, and with no limit the old cap stays.
    expect(await decodeSnapshotRecord('{"a":1}', 1)).toBe('{"a":1}')
    expect(await decodeSnapshotRecord(packed)).toBe(text)
  })

  it('refuses a gz2 record whose own length field lies about what inflates (the stream is bounded too)', async () => {
    // Two gzip members, the last one tiny: the length in the trailer of the last member says nothing about the first.
    const big = gzipSync(Buffer.alloc(3_000_000))
    const small = gzipSync(Buffer.from('x'))
    const record = packSnapshotBytes(new Uint8Array(Buffer.concat([big, small])))
    await expect(decodeSnapshotRecord(record, 1000)).rejects.toThrow(/safe size/)
  })
})

describe('scanQuarantine and partial', () => {
  it('carries the partial flag of a copy onto its notice, and leaves it off the others', async () => {
    storage.data.set(SLOT_1, '{"al":"partial-save"}')
    storage.data.set(SLOT_2, 'not a save')
    const found = await scanQuarantine(await idbSaveBackend(fakeIndexedDb()), async (raw) => (raw.startsWith('{"al"') ? { kind: 'damaged', partial: true } : { kind: 'damaged' }))
    expect(found).toEqual([
      { id: SLOT_1, kind: 'damaged', bytes: 21, partial: true },
      { id: SLOT_2, kind: 'damaged', bytes: 10 },
    ])
    expect('partial' in found[1]).toBe(false)
  })
})
