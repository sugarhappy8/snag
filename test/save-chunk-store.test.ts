// R2-S6 (K.5 f): the store writes chunks, and saveGame and loadGame use them. The main save becomes a head plus chunk records
// (save-codec.ts): the store's one-string queue keeps working for the head, and the chunks ride beside it, written before the head
// (the one commit point) and swept after it. The invariant the whole file guards: every id the stored head names is in storage.
//
// Synchronous backends (the memory backend and the localStorage backend, in the first half) are written inside saveRecord.
// The asynchronous one (IndexedDB, here the kit's chunkedBackend, whose chunk puts and head writes the test settles by hand,
// in the second half) goes through the queue. The existing save-store tests are the guard for a plain record, which this task
// leaves byte for byte as it was.
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHUNK_PREFIX, localSaveBackend, memorySaveBackend, SAVE_KEY, type SyncSaveBackend } from '../src/game/save-backends'
import { encodeSave, inlineSave, isChunkedHead, neededChunkIds, textSum } from '../src/game/save-codec'
import * as save from '../src/game/save'
import { QUARANTINE_SLOTS } from '../src/game/save-quarantine'
import { SAVE_SCHEMA } from '../src/game/save-schema'
import {
  chunkTableSizeForTests,
  chunksAvailable,
  flushSave,
  getSaveStatus,
  primeCache,
  protectNewerRecord,
  readChunk,
  readRecord,
  removeRecord,
  resetSaveStoreForTests,
  saveRecord,
  setSaveBackend,
  spillSave,
  STORE_OP_TIMEOUT_MS,
} from '../src/game/save-store'
import { decodeSnapshotRecord } from '../src/game/snapshot-codec'
import type { GameState, LogYear } from '../src/game/types'
import { makeTestGame } from './helpers'
import { probeLife } from './probe-life'
import { chunkedBackend, controlledBackend, memoryLocalStorage, type ChunkedBackend, type ControlledBackend } from './save-kit'

// A fixed life as a constant, not a `seed: <digits>` pin (test/seed-pins.test.ts).
const STORE_LIFE_SEED = 3

const [SLOT_1] = QUARANTINE_SLOTS

/** What a browser throws when localStorage is full. */
const full = () => new DOMException('The quota has been exceeded.', 'QuotaExceededError')

/** One macrotask: whatever is already queued gets to run, the codec's gzip streams included. */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

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

// --- Games --------------------------------------------------------------------------------------

const logYear = (age: number): LogYear => ({
  age,
  year: 2000 + age,
  entries: [{ id: `l${age}`, text: `I did a thing at ${age}.`, tone: 'neutral' as const }],
})

/** The world economy flag the real table moves out of the core: a non-empty plain object whose text changes with `n`. */
const economy = (n: number) => ({ v: 2, year: 2026, countries: { us: { gdp: n, rows: [1, 2, 3] }, fr: { gdp: 2 } } })

/**
 * A life of `age` years with a world economy flag and a life log of one year per age: the completed years go to `log.<n>`
 * chunks by decade (0 to 9, 10 to 19, ...), the economy to the `world` chunk, and the last log year stays in the head.
 */
function life(opts: { age?: number; econ?: number; money?: number } = {}): GameState {
  const { version, ...rest } = makeTestGame(1)
  const g = { version, schemaVersion: SAVE_SCHEMA, ...rest } as GameState
  const age = opts.age ?? 15
  g.character.age = age
  g.character.money = opts.money ?? 1000
  g.flags = { before: 1, worldEconomy: economy(opts.econ ?? 1), after: 'x' }
  g.log = Array.from({ length: age + 1 }, (_, a) => logYear(a))
  return g
}

/** The same life a tap later: nothing but the cash moved. A structural copy, so no root is shared with `g`. */
const tap = (g: GameState): GameState => {
  const next = structuredClone(g)
  next.character.money += 1
  return next
}

/** The same life a year later: one more log year, so the last decade's chunk changes; the world is replaced when `econ` is given. */
const nextYear = (g: GameState, econ?: number): GameState => {
  const next = structuredClone(g)
  next.character.age += 1
  next.year += 1
  next.log.push(logYear(next.character.age))
  if (econ !== undefined) next.flags.worldEconomy = economy(econ)
  return next
}

const headOf = (g: GameState): Record<string, unknown> => JSON.parse(inlineSave(g)) as Record<string, unknown>

// --- Backends -----------------------------------------------------------------------------------

type Spied = SyncSaveBackend & {
  /** 'chunk' for each chunk put and 'head' for each head write, in order. */
  order: string[]
  /** Set it and the next chunk put says false. */
  refuseChunks: boolean
  /** Set it and the head write says false. */
  refuseHead: boolean
  /** The ids of every chunk remove(), in order. */
  removed: string[][]
}

/** A memory backend that records the order of its writes and can refuse chunk puts or the head. */
function spiedMemory(): Spied {
  const base = memorySaveBackend()
  const chunks = base.chunks!
  const spied = base as Spied
  spied.order = []
  spied.refuseChunks = false
  spied.refuseHead = false
  spied.removed = []
  const put = chunks.put
  chunks.put = (id, record) => {
    if (spied.refuseChunks) return false
    spied.order.push('chunk')
    return put(id, record)
  }
  const write = base.write
  base.write = (record) => {
    if (spied.refuseHead) return false
    spied.order.push('head')
    return write(record)
  }
  const remove = chunks.remove
  chunks.remove = (ids) => {
    spied.removed.push([...ids])
    remove(ids)
  }
  return spied
}

/** Every id the stored head names is in the chunk store. */
function intact(backend: SyncSaveBackend): void {
  const head = backend.read()
  if (head === null) return
  const parsed = JSON.parse(head) as unknown
  if (!isChunkedHead(parsed)) return
  const held = new Set(backend.chunks!.ids())
  for (const id of neededChunkIds(parsed)) expect(held.has(id), `the stored head names ${id}`).toBe(true)
}

const chunkIds = (head: string): string[] => neededChunkIds(JSON.parse(head) as Record<string, unknown>)
const kindsOf = (ids: readonly string[]): string[] => ids.map((id) => id.slice(0, id.lastIndexOf('.')))

// --- Synchronous backends ----------------------------------------------------------------------

describe('a synchronous backend, chunked', () => {
  it('writes the chunks, then the head, and the head names only chunks the storage holds', () => {
    const backend = spiedMemory()
    setSaveBackend(backend)
    expect(chunksAvailable()).toBe(true)
    const g = life()
    expect(save.saveGame(g)).toBe(true)

    const head = backend.read()!
    expect(isChunkedHead(JSON.parse(head))).toBe(true)
    const ids = chunkIds(head)
    expect(kindsOf(ids).sort()).toEqual(['log.0', 'log.1', 'world'])
    // Chunks first, the head last, and one head write.
    expect(backend.order).toEqual(['chunk', 'chunk', 'chunk', 'head'])
    intact(backend)
    expect(backend.chunks!.ids()).toEqual([...ids].sort())
    expect(getSaveStatus().persistFailed).toBe(false)
  })

  it('a second save with the world unchanged writes only the head', () => {
    const backend = spiedMemory()
    setSaveBackend(backend)
    const g = life()
    save.saveGame(g)
    backend.order.length = 0
    // A structural copy: nothing is shared with `g`, so the codec stringifies it again, and the text (so the id) is the same.
    expect(save.saveGame(tap(g))).toBe(true)
    expect(backend.order).toEqual(['head'])
    expect(backend.removed).toEqual([])
    intact(backend)
  })

  it('a year step writes one new world chunk and one new decade chunk, and the sweep removes the two it replaced', () => {
    const backend = spiedMemory()
    setSaveBackend(backend)
    const g = life({ age: 15 })
    save.saveGame(g)
    const before = chunkIds(backend.read()!)
    backend.order.length = 0

    expect(save.saveGame(nextYear(g, 2))).toBe(true)
    const after = chunkIds(backend.read()!)
    // Two puts, then the head, then the sweep of exactly the two ids the new head dropped.
    expect(backend.order).toEqual(['chunk', 'chunk', 'head'])
    const dropped = before.filter((id) => !after.includes(id))
    expect(kindsOf(dropped).sort()).toEqual(['log.1', 'world'])
    expect(backend.removed).toEqual([dropped])
    expect(backend.chunks!.ids()).toEqual([...after].sort())
    // The decade that did not change was not written again.
    expect(after.filter((id) => before.includes(id))).toHaveLength(1)
    intact(backend)
  })

  it('a chunk put that fails leaves the old head and the old chunks intact, fails the save, and a later save succeeds', () => {
    const backend = spiedMemory()
    setSaveBackend(backend)
    const g = life({ age: 15 })
    expect(save.saveGame(g)).toBe(true)
    const head = backend.read()
    const held = backend.chunks!.ids()

    backend.refuseChunks = true
    expect(save.saveGame(nextYear(g, 2))).toBe(false)
    expect(getSaveStatus().persistFailed).toBe(true)
    expect(backend.read()).toBe(head)
    expect(backend.chunks!.ids()).toEqual(held)
    intact(backend)
    expect(save.loadGame()?.character.age).toBe(15)

    backend.refuseChunks = false
    expect(save.saveGame(nextYear(g, 2))).toBe(true)
    expect(getSaveStatus().persistFailed).toBe(false)
    intact(backend)
    expect(save.loadGame()?.character.age).toBe(16)
  })

  it('a head that cannot be written keeps the old head named chunks, and the next save sweeps the garbage', () => {
    const backend = spiedMemory()
    setSaveBackend(backend)
    const g = life({ age: 15 })
    save.saveGame(g)
    const head = backend.read()

    backend.refuseHead = true
    expect(save.saveGame(nextYear(g, 2))).toBe(false)
    expect(backend.read()).toBe(head)
    intact(backend)
    // The new chunks were put before the head failed: garbage nothing names.
    expect(backend.chunks!.ids().length).toBeGreaterThan(chunkIds(head!).length)

    backend.refuseHead = false
    expect(save.saveGame(nextYear(g, 2))).toBe(true)
    intact(backend)
    // Only what the new head names is left, though this save put nothing (the chunks were already there).
    expect(backend.chunks!.ids()).toEqual([...chunkIds(backend.read()!)].sort())
  })

  it('never sweeps a chunk the stored head names, over a random run of saves, refusals and removals', () => {
    // A small generator of its own: the run is the same every time, and it never touches the game's random numbers.
    let a = 0x9e3779b9
    const next = (): number => {
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const backend = spiedMemory()
    setSaveBackend(backend)
    let g = life({ age: 12 })
    let lastSaved: GameState | null = null
    let econ = 1
    for (let step = 0; step < 200; step++) {
      const roll = next()
      if (roll < 0.1) {
        removeRecord()
        lastSaved = null
      } else {
        const refuse = roll < 0.2 ? 'chunks' : roll < 0.3 ? 'head' : null
        const candidate = roll < 0.55 ? tap(g) : roll < 0.75 ? nextYear(g) : nextYear(g, ++econ)
        // A refused chunk put only fails a save that has a chunk to put: one whose chunks are all stored writes just the head.
        const held = new Set(backend.chunks!.ids())
        const needsPut = chunkIds(encodeSave(candidate).head).some((id) => !held.has(id))
        backend.refuseChunks = refuse === 'chunks'
        backend.refuseHead = refuse === 'head'
        const ok = save.saveGame(candidate)
        backend.refuseChunks = false
        backend.refuseHead = false
        expect(ok).toBe(refuse === 'head' ? false : refuse === 'chunks' ? !needsPut : true)
        // A save that failed is not the game from then on (the player's game is the one the store could write).
        if (ok) {
          g = candidate
          lastSaved = candidate
        }
      }
      intact(backend)
    }
    expect(lastSaved === null || save.loadGame() !== null).toBe(true)
  })

  it('protects the chunks of a later generation through a save, and the newer head is copied first', async () => {
    const newerHead = JSON.stringify({ version: 1, schemaVersion: SAVE_SCHEMA + 1, chunks: {}, extra: {} })
    const laterChunk = `${SAVE_KEY}.c4.world.abc123xyz`
    storage.data.set(SAVE_KEY, newerHead)
    storage.data.set(laterChunk, '{"later":1}')
    setSaveBackend(localSaveBackend())
    protectNewerRecord(newerHead, SAVE_SCHEMA + 1)
    // removeRecord leaves the newer record and its chunks where they are.
    removeRecord()
    expect(storage.data.get(SAVE_KEY)).toBe(newerHead)
    expect(storage.data.get(laterChunk)).toBe('{"later":1}')

    const g = life({ age: 15 })
    expect(save.saveGame(g)).toBe(true)
    expect(await flushSave()).toBe(true)
    expect(storage.data.get(laterChunk)).toBe('{"later":1}')
    expect(storage.data.get(SLOT_1)).toBe(newerHead)
    expect(isChunkedHead(JSON.parse(storage.data.get(SAVE_KEY)!))).toBe(true)
    expect(save.loadGame()?.character.age).toBe(15)
    // The chunks the queue wrote are this generation's.
    const ours = [...storage.data.keys()].filter((key) => key.startsWith(CHUNK_PREFIX))
    expect(ours.length).toBeGreaterThan(0)
  })

  it('removeRecord removes the head and every chunk of this generation, and nothing else', () => {
    setSaveBackend(localSaveBackend())
    const g = life()
    expect(save.saveGame(g)).toBe(true)
    expect([...storage.data.keys()].filter((k) => k.startsWith(CHUNK_PREFIX)).length).toBeGreaterThan(0)
    storage.data.set(`${SAVE_KEY}.bad`, 'a kept copy')
    storage.data.set(`${SAVE_KEY}.c4.world.abc123xyz`, 'a later chunk')
    storage.data.set('anotherlife.ribbons.v1', '{}')

    removeRecord()
    expect([...storage.data.keys()].sort()).toEqual(['anotherlife.ribbons.v1', `${SAVE_KEY}.bad`, `${SAVE_KEY}.c4.world.abc123xyz`])
    expect(save.loadGame()).toBeNull()
    // A save after a removal puts every chunk again.
    expect(save.saveGame(g)).toBe(true)
    expect(save.loadGame()).not.toBeNull()
  })

  it('gives the Time Machine room back for a chunk put exactly as it does for the head', () => {
    const snapshot = 'anotherlife.tm.l|life|0.abc'
    storage.data.set(snapshot, 'x'.repeat(100))
    const setItem = storage.setItem
    vi.spyOn(storage, 'setItem').mockImplementation((key, value) => {
      // Full for a chunk until that room is given back.
      if (key.startsWith(CHUNK_PREFIX) && storage.data.has(snapshot)) throw full()
      setItem(key, value)
    })
    const g = life()
    expect(save.saveGame(g)).toBe(true)
    expect(storage.data.has(snapshot)).toBe(false)
    expect(save.loadGame()?.flags.worldEconomy).toEqual(economy(1))
  })

  it('a storage that stays full fails the save with the old save whole', () => {
    const g = life({ age: 15 })
    expect(save.saveGame(g)).toBe(true)
    const head = storage.data.get(SAVE_KEY)
    const before = new Map(storage.data)
    const setItem = storage.setItem
    vi.spyOn(storage, 'setItem').mockImplementation((key, value) => {
      if (key.startsWith(CHUNK_PREFIX)) throw full()
      setItem(key, value)
    })
    expect(save.saveGame(nextYear(g, 2))).toBe(false)
    expect(getSaveStatus().persistFailed).toBe(true)
    expect(storage.data.get(SAVE_KEY)).toBe(head)
    expect(storage.data).toEqual(before)
  })

  it('holds a bounded side table: at most the newest, the stored and the pending head, after fifty saves', async () => {
    const backend = spiedMemory()
    setSaveBackend(backend)
    let g = life({ age: 11 })
    for (let i = 0; i < 50; i++) {
      g = i % 7 === 6 ? nextYear(g, i) : tap(g)
      save.saveGame(g)
    }
    expect(chunkTableSizeForTests()).toBeLessThanOrEqual(3)
    // And the same through the queue (a protected newer record sends every save there).
    resetSaveStoreForTests()
    setSaveBackend(spiedMemory())
    protectNewerRecord(JSON.stringify({ schemaVersion: SAVE_SCHEMA + 1 }), SAVE_SCHEMA + 1)
    for (let i = 0; i < 50; i++) {
      g = tap(g)
      save.saveGame(g)
    }
    await flushSave()
    expect(chunkTableSizeForTests()).toBeLessThanOrEqual(3)
  })

  it('writes a plain record as it always did, and leaves the chunks beside it alone', () => {
    const backend = spiedMemory()
    setSaveBackend(backend)
    save.saveGame(life())
    const held = backend.chunks!.ids()
    expect(saveRecord('{"plain":1}')).toBe(true)
    expect(backend.read()).toBe('{"plain":1}')
    expect(backend.chunks!.ids()).toEqual(held)
  })

  it('a backend with no chunk store keeps the one self-contained record', () => {
    const { chunks: _none, ...bare } = memorySaveBackend()
    setSaveBackend(bare)
    expect(chunksAvailable()).toBe(false)
    const g = life()
    expect(save.saveGame(g)).toBe(true)
    expect(bare.read()).toBe(inlineSave(g))
    expect(readChunk('world.abc123xyz')).toBeNull()
    expect(save.loadGame()?.flags.worldEconomy).toEqual(economy(1))
  })

  it('a chunked save handed to a backend with no chunk store is written whole, as its plain form', () => {
    const { chunks: _none, ...bare } = memorySaveBackend()
    setSaveBackend(bare)
    const g = life()
    expect(saveRecord('{"head":1}', { chunks: new Map([['world.abc123xyz', '{}']]), plain: () => inlineSave(g) })).toBe(true)
    expect(bare.read()).toBe(inlineSave(g))
  })

  it('primes what is stored at boot: the first chunked save writes only the head, and sweeps what its head does not name', () => {
    const backend = spiedMemory()
    setSaveBackend(backend)
    const g = life({ age: 15 })
    save.saveGame(g)
    // A chunk nothing names, left by the previous page; then a new page, which boot tells what the storage holds.
    backend.chunks!.put('world.zzzzzzzzzz', '{}')
    resetSaveStoreForTests()
    setSaveBackend(backend)
    expect(primeCache(backend.read(), backend.chunks!.ids())).toBe(true)
    backend.order.length = 0
    expect(save.saveGame(tap(g))).toBe(true)
    expect(backend.order).toEqual(['head'])
    // The leftover went with the sweep, though this save wrote no chunk.
    expect(backend.chunks!.ids()).toEqual([...chunkIds(backend.read()!)].sort())
  })

  it('reads the ids from storage at the first chunked save when boot did not hand them over', () => {
    const backend = spiedMemory()
    setSaveBackend(backend)
    const g = life({ age: 15 })
    save.saveGame(g)
    resetSaveStoreForTests()
    setSaveBackend(backend)
    backend.order.length = 0
    expect(save.saveGame(tap(g))).toBe(true)
    expect(backend.order).toEqual(['head'])
  })

  it('readChunk answers for a synchronous backend and for nothing else', () => {
    const backend = memorySaveBackend()
    setSaveBackend(backend)
    save.saveGame(life())
    const ids = chunkIds(readRecord()!)
    expect(ids.length).toBeGreaterThan(0)
    for (const id of ids) {
      const text = readChunk(id)
      expect(text).toBe(backend.chunks!.get(id))
      expect(textSum(text!)).toBe(id.slice(id.lastIndexOf('.') + 1))
    }
    expect(readChunk('world.nosuchchunk1')).toBeNull()
    setSaveBackend(chunkedBackend())
    expect(readChunk(ids[0])).toBeNull()
  })
})

describe('loadGame over chunks', () => {
  /** What the same record loads as when it is stored as one self-contained text. */
  function loadedInline(g: GameState): string {
    resetSaveStoreForTests()
    const { chunks: _none, ...bare } = memorySaveBackend()
    setSaveBackend(bare)
    save.saveGame(g)
    return JSON.stringify(save.loadGame())
  }

  it('loads the game back as the inline record loads, from a head with chunks', () => {
    const g = life()
    setSaveBackend(memorySaveBackend())
    save.saveGame(g)
    expect(isChunkedHead(JSON.parse(readRecord()!))).toBe(true)
    const loaded = JSON.stringify(save.loadGame())
    expect(loaded).toBe(loadedInline(g))
    expect(loaded).toBe(inlineSave(g))
  })

  it('loads a real life back to the same JSON, from a head with chunks and from an inline record', () => {
    const g = probeLife({ seed: STORE_LIFE_SEED, birthYear: 1990, businesses: 1, years: 6 })
    const backend = memorySaveBackend()
    setSaveBackend(backend)
    expect(save.saveGame(g)).toBe(true)
    const head = JSON.parse(readRecord()!) as Record<string, unknown>
    expect(isChunkedHead(head)).toBe(true)
    expect(neededChunkIds(head).length).toBeGreaterThan(0)
    const chunked = JSON.stringify(save.loadGame())
    expect(chunked).toBe(loadedInline(g))
  })

  it('loads an inline v3 record and a v2 plain record', () => {
    const g = life()
    storage.data.set(SAVE_KEY, inlineSave(g))
    expect(JSON.stringify(save.loadGame())).toBe(inlineSave(g))
    const v2 = JSON.stringify({ ...headOf(g), schemaVersion: 2 })
    storage.data.set(SAVE_KEY, v2)
    expect(save.loadGame()?.schemaVersion).toBe(SAVE_SCHEMA)
    const fixture = gunzipSync(readFileSync('test/fixtures/save-v4.0.2.json.gz')).toString()
    storage.data.set(SAVE_KEY, fixture)
    expect(save.loadGame()?.schemaVersion).toBe(SAVE_SCHEMA)
  })

  it('a missing chunk gives a loadable game, without what the chunk held', () => {
    const backend = memorySaveBackend()
    setSaveBackend(backend)
    const g = life({ age: 25 })
    save.saveGame(g)
    const ids = chunkIds(readRecord()!)
    const world = ids.find((id) => id.startsWith('world.'))!
    backend.chunks!.remove([world])
    const loaded = save.loadGame()
    expect(loaded).not.toBeNull()
    expect(loaded!.flags.worldEconomy).toBeUndefined()
    expect(loaded!.character.age).toBe(25)
    expect(loaded!.log.length).toBe(g.log.length)

    const decade = ids.find((id) => id.startsWith('log.1.'))!
    backend.chunks!.remove([decade])
    const lost = save.loadGame()
    expect(lost).not.toBeNull()
    expect(lost!.log.length).toBeLessThan(g.log.length)
  })

  it('a chunk whose text was changed is not loaded, and the game still is', () => {
    const backend = memorySaveBackend()
    setSaveBackend(backend)
    save.saveGame(life())
    const world = chunkIds(readRecord()!).find((id) => id.startsWith('world.'))!
    backend.chunks!.put(world, '{"flags.worldEconomy":{"v":2,"year":2026,"countries":{"us":{"gdp":999}}}}')
    const loaded = save.loadGame()
    expect(loaded).not.toBeNull()
    expect(loaded!.flags.worldEconomy).toBeUndefined()
  })

  it('reads no chunk of a later version: a head above this schema loads as nothing', () => {
    const backend = memorySaveBackend()
    setSaveBackend(backend)
    save.saveGame(life())
    const head = JSON.parse(readRecord()!) as Record<string, unknown>
    head.schemaVersion = SAVE_SCHEMA + 1
    backend.write(JSON.stringify(head))
    const get = vi.spyOn(backend.chunks!, 'get')
    expect(save.loadGame()).toBeNull()
    expect(get).not.toHaveBeenCalled()
  })

  it('loads nothing from a head that is junk, and nothing from no record', () => {
    expect(save.loadGame()).toBeNull()
    storage.data.set(SAVE_KEY, '{"schemaVersion":3,"chunks":{},"sv":{}}')
    expect(save.loadGame()).toBeNull()
    storage.data.set(SAVE_KEY, 'not json')
    expect(save.loadGame()).toBeNull()
  })
})

// --- The asynchronous backend ------------------------------------------------------------------

/** Waits, for a bounded while, until the store has handed the backend `count` chunk puts. */
async function putsReach(backend: ChunkedBackend, count: number): Promise<void> {
  for (let i = 0; i < 500 && backend.chunkPuts.length < count; i++) await tick()
  expect(backend.chunkPuts.length, 'chunk puts handed to the backend').toBeGreaterThanOrEqual(count)
}

/** Waits, for a bounded while, until the store has handed the backend `count` head writes. */
async function writesReach(backend: ChunkedBackend, count: number): Promise<void> {
  for (let i = 0; i < 500 && backend.writes.length < count; i++) await tick()
  expect(backend.writes.length, 'head writes handed to the backend').toBeGreaterThanOrEqual(count)
}

/** Settles each chunk put and each head write as the store hands it over, until the queue is dry; then what flushSave said. */
async function settleAll(backend: ChunkedBackend | ControlledBackend): Promise<boolean | undefined> {
  let flushed: boolean | undefined
  void flushSave().then((ok) => {
    flushed = ok
  })
  for (let i = 0; i < 500 && flushed === undefined; i++) {
    await tick()
    if ('chunkPuts' in backend) for (let n = 0; n < backend.chunkPuts.length; n++) backend.settleChunks(n)
    for (let n = 0; n < backend.writes.length; n++) backend.settle(n)
  }
  return flushed
}

function useChunked(initial?: string, chunks: Record<string, string> = {}): ChunkedBackend {
  const backend = chunkedBackend(initial, chunks)
  setSaveBackend(backend)
  return backend
}

/** The chunk ids the head stored in the backend names, and the chunk ids the backend holds. */
async function storedHead(backend: ChunkedBackend): Promise<Record<string, unknown>> {
  return JSON.parse(await decodeSnapshotRecord(backend.stored!)) as Record<string, unknown>
}

describe('an asynchronous backend, chunked', () => {
  it('writes the chunks in one transaction, then the head, in that order; a held chunk put holds the head back', async () => {
    const backend = useChunked()
    const g = life()
    expect(save.saveGame(g)).toBe(true)
    await putsReach(backend, 1)
    // The chunk put is in flight: the head waits for it.
    for (let i = 0; i < 20; i++) await tick()
    expect(backend.writes).toEqual([])
    expect(backend.chunkPuts).toHaveLength(1)
    expect(backend.chunkPuts[0].map(([id]) => id.slice(0, id.lastIndexOf('.'))).sort()).toEqual(['log.0', 'log.1', 'world'])

    backend.settleChunks(0)
    await writesReach(backend, 1)
    backend.settle(0)
    expect(await flushSave()).toBe(true)
    const head = await storedHead(backend)
    expect(isChunkedHead(head)).toBe(true)
    // Every record the head names was stored, and the records decode to the chunk texts.
    for (const id of neededChunkIds(head)) {
      const record = backend.chunkData.get(id)
      expect(record, id).toBeDefined()
      expect(textSum(await decodeSnapshotRecord(record!))).toBe(id.slice(id.lastIndexOf('.') + 1))
    }
    expect(JSON.stringify(save.loadGame())).toBe(inlineSave(g))
  })

  it('two saves made while a write is in flight make one more write, of the last, and its chunks are written', async () => {
    const backend = useChunked()
    const g = life({ age: 15 })
    save.saveGame(g)
    await putsReach(backend, 1)
    // Two more saves while the first is in flight: only the last of them is ever written.
    const second = nextYear(g, 2)
    const third = nextYear(second, 3)
    save.saveGame(second)
    save.saveGame(third)
    backend.settleChunks(0)
    await writesReach(backend, 1)
    backend.settle(0)
    await putsReach(backend, 2)
    // The coalesced save sends everything its head names against what is stored, not what was new since the last encode.
    const thirdIds = new Set(chunkIds(encodeSave(third).head))
    expect(backend.chunkPuts[1].every(([id]) => thirdIds.has(id))).toBe(true)
    backend.settleChunks(1)
    await writesReach(backend, 2)
    backend.settle(1)
    expect(await flushSave()).toBe(true)
    expect(backend.writes).toHaveLength(2)
    expect(backend.chunkPuts).toHaveLength(2)

    const head = await storedHead(backend)
    for (const id of neededChunkIds(head)) expect(backend.chunkData.has(id), id).toBe(true)
    // The sweep took what the last head dropped: nothing the two heads left behind is kept.
    expect([...backend.chunkData.keys()].sort()).toEqual([...neededChunkIds(head)].sort())
    expect(save.loadGame()?.character.age).toBe(17)
  })

  it('a chunk put that fails sets persistFailed, writes the plain backup to the legacy key, and flushSave is false', async () => {
    const backend = useChunked()
    const g = life()
    save.saveGame(g)
    await putsReach(backend, 1)
    backend.failChunks(0)
    expect(await flushSave()).toBe(false)
    expect(getSaveStatus().persistFailed).toBe(true)
    expect(backend.writes).toEqual([])
    // The backup stands alone: the inline form of the newest save, not a head.
    const backup = storage.data.get(SAVE_KEY)
    expect(backup).toBe(inlineSave(g))
    expect(JSON.parse(backup!)).not.toHaveProperty('chunks')
    // And a retry that works clears the warning.
    save.saveGame(g)
    await putsReach(backend, 2)
    expect(await settleAll(backend)).toBe(true)
    expect(getSaveStatus().persistFailed).toBe(false)
    expect(storage.data.has(SAVE_KEY)).toBe(false)
  })

  it('readRecord on an async backend is the inline text, and loadGame reads no chunk from it', async () => {
    const backend = useChunked()
    const g = life()
    const get = vi.spyOn(backend.chunks, 'get')
    save.saveGame(g)
    expect(readRecord()).toBe(inlineSave(g))
    expect(JSON.stringify(save.loadGame())).toBe(inlineSave(g))
    expect(get).not.toHaveBeenCalled()
    expect(readChunk('world.abc123xyz')).toBeNull()
    expect(await settleAll(backend)).toBe(true)
    // After the write too: the cache is the newest save, still as one text.
    expect(readRecord()).toBe(inlineSave(g))
  })

  it('spillSave writes the inline text of a save the queue has not stored', async () => {
    const backend = useChunked()
    const g = life()
    save.saveGame(g)
    await putsReach(backend, 1)
    expect(spillSave()).toBe(true)
    expect(storage.data.get(SAVE_KEY)).toBe(inlineSave(g))
    // The page stays: the queue catches up and takes the backup away.
    expect(await settleAll(backend)).toBe(true)
    expect(storage.data.has(SAVE_KEY)).toBe(false)
  })

  it('a removal discards a save made before it, chunks included', async () => {
    const backend = useChunked()
    save.saveGame(life())
    await putsReach(backend, 1)
    removeRecord()
    // The put was already in flight: it lands, and the save discards itself before it writes a head.
    backend.settleChunks(0)
    expect(await flushSave()).toBe(true)
    expect(backend.writes).toEqual([])
    expect(backend.stored).toBeNull()
    // The removal listed what had landed and took it.
    expect([...backend.chunkData.keys()]).toEqual([])
    expect(readRecord()).toBeNull()
    expect(save.loadGame()).toBeNull()
  })

  it('after a failed head write, readRecord answers with the last stored save as inline text', async () => {
    const backend = useChunked()
    const g = life({ age: 15 })
    save.saveGame(g)
    expect(await settleAll(backend)).toBe(true)
    const second = nextYear(g, 2)
    save.saveGame(second)
    await putsReach(backend, 2)
    backend.settleChunks(1)
    await writesReach(backend, 2)
    backend.fail(1)
    expect(await flushSave()).toBe(false)
    expect(getSaveStatus().persistFailed).toBe(true)
    // What a reload would load is the save that was stored, not the one that failed.
    expect(readRecord()).toBe(inlineSave(g))
    // And the old head still names chunks the storage holds (the failed save's chunks are only garbage).
    const head = await storedHead(backend)
    for (const id of neededChunkIds(head)) expect(backend.chunkData.has(id), id).toBe(true)
    expect(storage.data.get(SAVE_KEY)).toBe(inlineSave(second))
  })

  it('a removal takes the chunks of a stored save after the head', async () => {
    const backend = useChunked()
    save.saveGame(life())
    expect(await settleAll(backend)).toBe(true)
    expect(backend.chunkData.size).toBeGreaterThan(0)
    removeRecord()
    expect(await flushSave()).toBe(true)
    expect(backend.stored).toBeNull()
    expect(backend.chunkData.size).toBe(0)
    // The next save puts every chunk again.
    save.saveGame(life())
    await putsReach(backend, 2)
    expect(backend.chunkPuts[1]).toHaveLength(3)
    expect(await settleAll(backend)).toBe(true)
  })

  it('writes only the head for a save whose chunks are stored, and primes the ids it was told at boot', async () => {
    const backend = useChunked()
    const g = life({ age: 15 })
    save.saveGame(g)
    expect(await settleAll(backend)).toBe(true)
    const puts = backend.chunkPuts.length
    save.saveGame(tap(g))
    expect(await settleAll(backend)).toBe(true)
    expect(backend.chunkPuts).toHaveLength(puts)
    expect(backend.writes).toHaveLength(2)

    // A new page that boot told which records the database holds.
    const ids = [...backend.chunkData.keys()]
    resetSaveStoreForTests()
    setSaveBackend(backend)
    primeCache(inlineSave(g), ids)
    const ids2 = vi.spyOn(backend.chunks, 'ids')
    save.saveGame(tap(g))
    expect(await settleAll(backend)).toBe(true)
    expect(backend.chunkPuts).toHaveLength(puts)
    expect(ids2).not.toHaveBeenCalled()
  })

  it('encodes a big chunk with gzip, and the record decodes to the chunk text', async () => {
    const backend = useChunked()
    const g = life()
    // A world economy past the compression threshold (100,000 characters of text).
    g.flags.worldEconomy = { v: 2, year: 2026, countries: { us: { gdp: 1, rows: Array.from({ length: 30_000 }, (_, i) => i) } } }
    save.saveGame(g)
    expect(await settleAll(backend)).toBe(true)
    const worldId = chunkIds(encodeSave(g).head).find((id) => id.startsWith('world.'))!
    const record = backend.chunkData.get(worldId)!
    expect(record.startsWith('gz2:')).toBe(true)
    const text = await decodeSnapshotRecord(record)
    expect(text.length).toBeGreaterThan(100_000)
    expect(textSum(text)).toBe(worldId.slice(worldId.lastIndexOf('.') + 1))
    expect(JSON.stringify(save.loadGame())).toBe(inlineSave(g))
  })

  it('a chunk put that never answers stalls the queue: the warning shows, the plain backup is written, and flushSave is false', async () => {
    vi.useFakeTimers()
    const backend = useChunked()
    const g = life()
    save.saveGame(g)
    const flushed = flushSave()
    await vi.advanceTimersByTimeAsync(STORE_OP_TIMEOUT_MS + 1)
    expect(await flushed).toBe(false)
    expect(getSaveStatus()).toMatchObject({ persistFailed: true, database: true })
    expect(storage.data.get(SAVE_KEY)).toBe(inlineSave(g))
    expect(backend.writes).toEqual([])
    // A save made while it hangs is backed up at once, plain.
    const second = tap(g)
    save.saveGame(second)
    expect(storage.data.get(SAVE_KEY)).toBe(inlineSave(second))
  })

  it('a backend with no chunk store gets the plain form of the save', async () => {
    const backend = controlledBackend()
    setSaveBackend(backend)
    const g = life()
    expect(chunksAvailable()).toBe(false)
    save.saveGame(g)
    expect(await settleAll(backend)).toBe(true)
    expect(await decodeSnapshotRecord(backend.stored!)).toBe(inlineSave(g))
  })
})
