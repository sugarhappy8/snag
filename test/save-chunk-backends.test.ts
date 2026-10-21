// R2-S5 K.5 (e): the chunk stores of the three backends. A chunk is a record that lives beside the
// saved head: in a Map (memory), under `anotherlife.save.v1.c3.<id>` (localStorage), or under the same
// key as a row of the `saves` store (IndexedDB, which stays at database version 1, so an older build
// still opens it). The head is stored exactly as before; what this file pins is that the chunk
// stores can put, get, list and remove, and never touch the head, the quarantine copies or another
// generation's chunks.
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CHUNK_ID_PATTERN,
  CHUNK_PREFIX,
  chunkKey,
  idbSaveBackend,
  isOurChunkKey,
  localSaveBackend,
  memorySaveBackend,
  SAVE_KEY,
  type AsyncChunkStore,
  type AsyncSaveBackend,
  type SyncChunkStore,
  type SyncSaveBackend,
} from '../src/game/save-backends'
import { QUARANTINE_SLOTS } from '../src/game/save-quarantine'
import { chunkedBackend, controlledBackend, fakeIndexedDb, memoryChunkStore, memoryLocalStorage, type FakeIndexedDb } from './save-kit'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

// Three ids in the grammar of the codec: a world chunk, a log decade and an entity shard.
const WORLD = 'world.1k2j3h4g5f'
const LOG3 = 'log.3.abcdef012345'
const ENTITY = 'e.firms.12.zz99yy88xx'
const OTHER = 'world.0a0a0a0a0a'

/** What a browser throws when localStorage is full, and when it is off limits. */
const full = () => new DOMException('The quota has been exceeded.', 'QuotaExceededError')
const denied = (): never => {
  throw new DOMException('Access denied', 'SecurityError')
}

/** A localStorage that refuses every call, as a browser with storage disabled does. */
function disabledStorage(): Storage {
  return {
    get length(): number {
      return denied()
    },
    clear: denied,
    getItem: denied,
    key: denied,
    removeItem: denied,
    setItem: denied,
  }
}

/** Lets everything already queued run (the fake answers in microtasks, so one macrotask is enough). */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

// --- The key helpers ----------------------------------------------------------------------------

describe('chunkKey and isOurChunkKey', () => {
  it('puts a chunk under the save key with the generation in the key, so a later format is never swept by this one', () => {
    expect(CHUNK_PREFIX).toBe('anotherlife.save.v1.c3.')
    expect(CHUNK_PREFIX.startsWith(`${SAVE_KEY}.`)).toBe(true)
    expect(chunkKey(WORLD)).toBe(`anotherlife.save.v1.c3.${WORLD}`)
    expect(isOurChunkKey(chunkKey(WORLD))).toBe(true)
  })

  it('does not collide with the head, the quarantine slots or the other keys the game keeps', () => {
    for (const other of [SAVE_KEY, ...QUARANTINE_SLOTS, 'anotherlife.idb.v1', 'anotherlife.timemachine.v1', 'anotherlife.tm.abc']) {
      expect(isOurChunkKey(other), other).toBe(false)
      expect(other.startsWith(CHUNK_PREFIX), other).toBe(false)
    }
    // No quarantine slot is a prefix of a chunk key, so nothing that scans for a slot's key meets a chunk.
    for (const slot of QUARANTINE_SLOTS) expect(chunkKey(WORLD).startsWith(slot), slot).toBe(false)
  })

  it('accepts the id grammar of the codec: world, log.<n>, e.<kind>.<n>, each with a checksum of 6 to 32 base-36 characters', () => {
    for (const id of [WORLD, LOG3, ENTITY, 'log.12.0123456789abcdefghijklmnopqrstuv', 'e.a.0.abcdef', 'e.0123456789abcdef.99.abcdef']) {
      expect(isOurChunkKey(chunkKey(id)), id).toBe(true)
      expect(CHUNK_ID_PATTERN.test(id), id).toBe(true)
    }
  })

  it('rejects the next generation, the quarantine slots, a path with .. and everything outside the grammar', () => {
    const rejected = [
      'anotherlife.save.v1.c4.world.1k2j3h4g5f',
      `${SAVE_KEY}.bad`,
      `${SAVE_KEY}.bad.2`,
      `${SAVE_KEY}.bad.3`,
      `${SAVE_KEY}.c3`,
      CHUNK_PREFIX,
      `${CHUNK_PREFIX}world`,
      `${CHUNK_PREFIX}world.abc`,
      `${CHUNK_PREFIX}world.${'a'.repeat(33)}`,
      `${CHUNK_PREFIX}world.1k2j3h4g5f.extra`,
      `${CHUNK_PREFIX}world..1k2j3h4g5f`,
      `${CHUNK_PREFIX}log.1..abcdef`,
      `${CHUNK_PREFIX}log.123.abcdef`,
      `${CHUNK_PREFIX}log..abcdef`,
      `${CHUNK_PREFIX}e.firms.abcdef`,
      `${CHUNK_PREFIX}e.${'k'.repeat(17)}.1.abcdef`,
      `${CHUNK_PREFIX}e.Firms.1.abcdef`,
      `${CHUNK_PREFIX}e.fi/rms.1.abcdef`,
      `${CHUNK_PREFIX}../../anotherlife.save.v1`,
      `${CHUNK_PREFIX}world.1K2J3H4G5F`,
      `${CHUNK_PREFIX}other.1k2j3h4g5f`,
      `${CHUNK_PREFIX}${WORLD}\n`,
      ` ${CHUNK_PREFIX}${WORLD}`,
      '',
    ]
    for (const key of rejected) expect(isOurChunkKey(key), JSON.stringify(key)).toBe(false)
  })

  it('rejects an id over 64 characters, however it is built', () => {
    const long = `world.${'a'.repeat(60)}`
    expect(long.length).toBeGreaterThan(64)
    expect(isOurChunkKey(chunkKey(long))).toBe(false)
    expect(CHUNK_ID_PATTERN.test(long)).toBe(false)
    // The longest id the grammar allows is still well under 64.
    expect(`e.${'k'.repeat(16)}.99.${'a'.repeat(32)}`.length).toBeLessThanOrEqual(64)
  })
})

// --- The two stores that answer on the spot (memory and localStorage) ------------------------------

interface SyncRig {
  store: SyncChunkStore
  /** Every chunk record the backend holds, by id, read the way a person looking at the storage would. */
  stored(): Record<string, string>
  /** The backend the store belongs to. */
  backend: SyncSaveBackend
}

const syncRigs: [string, () => SyncRig][] = [
  [
    'memorySaveBackend',
    () => {
      const backend = memorySaveBackend()
      const store = backend.chunks as SyncChunkStore
      return { store, backend, stored: () => Object.fromEntries(store.ids().map((id) => [id, store.get(id) as string])) }
    },
  ],
  [
    'localSaveBackend',
    () => {
      const storage = memoryLocalStorage()
      vi.stubGlobal('localStorage', storage)
      const backend = localSaveBackend()
      const store = backend.chunks as SyncChunkStore
      return {
        store,
        backend,
        stored: () => Object.fromEntries([...storage.data].filter(([key]) => key.startsWith(CHUNK_PREFIX)).map(([key, value]) => [key.slice(CHUNK_PREFIX.length), value])),
      }
    },
  ],
]

describe.each(syncRigs)('the chunk store of %s', (_name, makeRig) => {
  it('is there', () => {
    const { store } = makeRig()
    expect(store).toBeDefined()
    expect(typeof store.put).toBe('function')
  })

  it('puts, gets, lists and removes records', () => {
    const { store, stored } = makeRig()
    expect(store.ids()).toEqual([])
    expect(store.get(WORLD)).toBeNull()
    expect(store.put(WORLD, '{"a":1}')).toBe(true)
    expect(store.put(LOG3, '[1,2]')).toBe(true)
    expect(store.put(ENTITY, '{}')).toBe(true)
    expect(store.get(WORLD)).toBe('{"a":1}')
    expect(store.get(LOG3)).toBe('[1,2]')
    expect(stored()).toEqual({ [WORLD]: '{"a":1}', [LOG3]: '[1,2]', [ENTITY]: '{}' })

    store.remove([WORLD, ENTITY])
    expect(store.get(WORLD)).toBeNull()
    expect(store.ids()).toEqual([LOG3])
  })

  it('lists ids sorted, the same way for every backend, with the prefix removed', () => {
    const { store } = makeRig()
    for (const id of [WORLD, OTHER, LOG3, ENTITY]) store.put(id, id)
    expect(store.ids()).toEqual([ENTITY, LOG3, OTHER, WORLD].sort())
  })

  it('replaces a record put under an id it already holds', () => {
    const { store } = makeRig()
    store.put(WORLD, 'one')
    expect(store.put(WORLD, 'two')).toBe(true)
    expect(store.get(WORLD)).toBe('two')
    expect(store.ids()).toEqual([WORLD])
  })

  it('removes ids it never held, an empty list and the same id twice without a word', () => {
    const { store } = makeRig()
    store.put(WORLD, 'x')
    expect(() => store.remove([])).not.toThrow()
    expect(() => store.remove([OTHER, 'not an id', ''])).not.toThrow()
    expect(() => store.remove([WORLD, WORLD])).not.toThrow()
    expect(store.ids()).toEqual([])
  })

  it('refuses an id outside the grammar, so what it holds is always what ids() lists and a sweep can reach', () => {
    const { store, stored } = makeRig()
    for (const id of ['', 'world', 'world.abc', 'c4.world.1k2j3h4g5f', '../x', SAVE_KEY, `${SAVE_KEY}.bad`, `world.${'a'.repeat(60)}`]) {
      expect(store.put(id, 'x'), JSON.stringify(id)).toBe(false)
      expect(store.get(id), JSON.stringify(id)).toBeNull()
    }
    expect(store.ids()).toEqual([])
    expect(stored()).toEqual({})
  })

  it('never touches the head: writing, reading and removing it leave the chunks alone, and the other way round', () => {
    const { store, backend } = makeRig()
    expect(backend.write('{"head":1}')).toBe(true)
    store.put(WORLD, 'w')
    expect(backend.read()).toBe('{"head":1}')
    expect(store.ids()).toEqual([WORLD])

    store.remove([WORLD])
    expect(backend.read()).toBe('{"head":1}')

    store.put(WORLD, 'w')
    backend.remove()
    expect(backend.read()).toBeNull()
    expect(store.get(WORLD)).toBe('w')
  })

  it('does not list or remove the head when it is handed as an id', () => {
    const { store, backend } = makeRig()
    backend.write('{"head":1}')
    store.remove([SAVE_KEY, chunkKey(WORLD), ...QUARANTINE_SLOTS])
    expect(backend.read()).toBe('{"head":1}')
    expect(store.ids()).toEqual([])
  })
})

describe('the memory chunk store', () => {
  it('belongs to its backend: another backend starts empty and keeps its own', () => {
    const one = memorySaveBackend()
    const two = memorySaveBackend()
    one.chunks?.put(WORLD, 'one')
    expect(two.chunks?.ids()).toEqual([])
    expect(one.chunks?.ids()).toEqual([WORLD])
  })

  it('starts empty even when the backend starts from a head record', () => {
    const backend = memorySaveBackend('{"head":1}')
    expect(backend.read()).toBe('{"head":1}')
    expect(backend.chunks?.ids()).toEqual([])
  })
})

describe('the localStorage chunk store', () => {
  it('keeps each chunk under chunkKey(id), as plain text', () => {
    const storage = memoryLocalStorage()
    vi.stubGlobal('localStorage', storage)
    const store = localSaveBackend().chunks as SyncChunkStore
    store.put(WORLD, '{"a":1}')
    expect(storage.data.get(chunkKey(WORLD))).toBe('{"a":1}')
    expect([...storage.data.keys()]).toEqual([`${SAVE_KEY}.c3.${WORLD}`])
  })

  it('lists and removes only this generation: the head, the quarantine slots, the Time Machine and the next generation stay', () => {
    const foreign = {
      [SAVE_KEY]: 'head',
      [QUARANTINE_SLOTS[0]]: 'bad 1',
      [QUARANTINE_SLOTS[1]]: 'bad 2',
      [QUARANTINE_SLOTS[2]]: 'bad 3',
      'anotherlife.save.v1.c4.world.1k2j3h4g5f': 'next generation',
      'anotherlife.save.v1.c4.x': 'next generation, no id',
      'anotherlife.save.v1.c3.junk': 'ours by prefix, not by grammar',
      'anotherlife.tm.abc': 'snapshot',
      'anotherlife.timemachine.v1': '{}',
      'anotherlife.idb.v1': '1',
      unrelated: 'x',
    }
    const storage = memoryLocalStorage({ ...foreign, [chunkKey(WORLD)]: 'w', [chunkKey(LOG3)]: 'l' })
    vi.stubGlobal('localStorage', storage)
    const store = localSaveBackend().chunks as SyncChunkStore

    expect(store.ids()).toEqual([LOG3, WORLD].sort())
    // A key under our prefix that is not an id of ours is not ours to remove, even when it is named.
    store.remove([...store.ids(), 'junk', 'anotherlife.save.v1.c4.x'])
    expect(store.ids()).toEqual([])
    expect(Object.fromEntries(storage.data)).toEqual(foreign)
  })

  it('returns false and stores nothing when a full storage has nothing to give back', () => {
    const storage = memoryLocalStorage({ [SAVE_KEY]: 'head' })
    vi.stubGlobal('localStorage', storage)
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw full()
    })
    const evict = vi.fn(() => false)
    const store = localSaveBackend(evict).chunks as SyncChunkStore
    expect(store.put(WORLD, 'w')).toBe(false)
    expect(evict).toHaveBeenCalledTimes(1)
    expect(store.ids()).toEqual([])
    expect(storage.data.get(SAVE_KEY)).toBe('head')
  })

  it('returns false at the first refusal when the backend has no evictor', () => {
    const storage = memoryLocalStorage()
    vi.stubGlobal('localStorage', storage)
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw full()
    })
    expect((localSaveBackend().chunks as SyncChunkStore).put(WORLD, 'w')).toBe(false)
  })

  it('asks the evictor for room, exactly as the head write does, and retries for as long as it frees some', () => {
    const storage = memoryLocalStorage()
    vi.stubGlobal('localStorage', storage)
    let room = 0
    vi.spyOn(storage, 'setItem').mockImplementation((key, value) => {
      if (room < 2) throw full()
      storage.data.set(key, value)
    })
    const evict = vi.fn(() => {
      room++
      return true
    })
    const backend = localSaveBackend(evict)
    expect((backend.chunks as SyncChunkStore).put(WORLD, 'w')).toBe(true)
    expect(evict).toHaveBeenCalledTimes(2)
    expect(storage.data.get(chunkKey(WORLD))).toBe('w')

    // The head write and the chunk write share the one evictor, and each loops on its own.
    room = 0
    evict.mockClear()
    expect(backend.write('head')).toBe(true)
    expect(evict).toHaveBeenCalledTimes(2)
  })

  it('stops asking once the evictor says it freed nothing', () => {
    const storage = memoryLocalStorage()
    vi.stubGlobal('localStorage', storage)
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw full()
    })
    const evict = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(true).mockReturnValue(false)
    expect((localSaveBackend(evict).chunks as SyncChunkStore).put(WORLD, 'w')).toBe(false)
    expect(evict).toHaveBeenCalledTimes(3)
  })

  it('does not ask the evictor to make room for an id it would refuse anyway', () => {
    vi.stubGlobal('localStorage', memoryLocalStorage())
    const evict = vi.fn(() => true)
    expect((localSaveBackend(evict).chunks as SyncChunkStore).put('nope', 'x')).toBe(false)
    expect(evict).not.toHaveBeenCalled()
  })

  it('survives a localStorage that throws: ids is empty, get is null, put is false, remove says nothing', () => {
    vi.stubGlobal('localStorage', disabledStorage())
    const store = localSaveBackend().chunks as SyncChunkStore
    expect(store.ids()).toEqual([])
    expect(store.get(WORLD)).toBeNull()
    expect(store.put(WORLD, 'w')).toBe(false)
    expect(() => store.remove([WORLD, LOG3])).not.toThrow()
  })

  it('survives a missing localStorage altogether (a host with no storage)', () => {
    vi.stubGlobal('localStorage', undefined)
    const store = localSaveBackend().chunks as SyncChunkStore
    expect(store.ids()).toEqual([])
    expect(store.get(WORLD)).toBeNull()
    expect(store.put(WORLD, 'w')).toBe(false)
    expect(() => store.remove([WORLD])).not.toThrow()
  })

  it('keeps removing the rest when one removal is refused', () => {
    const storage = memoryLocalStorage({ [chunkKey(WORLD)]: 'w', [chunkKey(LOG3)]: 'l', [chunkKey(ENTITY)]: 'e' })
    vi.stubGlobal('localStorage', storage)
    const real = storage.removeItem.bind(storage)
    vi.spyOn(storage, 'removeItem').mockImplementation((key) => {
      if (key === chunkKey(LOG3)) throw denied()
      real(key)
    })
    const store = localSaveBackend().chunks as SyncChunkStore
    expect(() => store.remove([WORLD, LOG3, ENTITY])).not.toThrow()
    expect(store.ids()).toEqual([LOG3])
  })

  it('lists what it saw when the storage fails halfway through the walk', () => {
    const storage = memoryLocalStorage({ [chunkKey(WORLD)]: 'w', [chunkKey(LOG3)]: 'l' })
    vi.stubGlobal('localStorage', storage)
    const real = storage.key.bind(storage)
    let calls = 0
    vi.spyOn(storage, 'key').mockImplementation((index) => {
      if (++calls > 1) throw denied()
      return real(index)
    })
    const ids = (localSaveBackend().chunks as SyncChunkStore).ids()
    expect(ids.length).toBeLessThanOrEqual(1)
    for (const id of ids) expect([WORLD, LOG3]).toContain(id)
  })
})

// --- IndexedDB ---------------------------------------------------------------------------------

/** What the fake database holds in its `saves` store, read through the fake's own API (not through the backend under test). */
function savesRows(factory: IDBFactory): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const request = factory.open('anotherlife-save', 1)
    request.onsuccess = () => {
      const tx = request.result.transaction('saves', 'readonly')
      const store = tx.objectStore('saves')
      const keys = store.getAllKeys()
      const rows: Record<string, unknown> = {}
      keys.onsuccess = () => {
        for (const key of keys.result) {
          const get = store.get(key)
          get.onsuccess = () => {
            rows[String(key)] = get.result
          }
        }
      }
      tx.oncomplete = () => resolve(rows)
    }
  })
}

/** Writes a row of the `saves` store behind the backend's back, with any key and any value. */
function plantRow(factory: IDBFactory, key: unknown, value: unknown): Promise<void> {
  return new Promise((resolve) => {
    const request = factory.open('anotherlife-save', 1)
    request.onsuccess = () => {
      const tx = request.result.transaction('saves', 'readwrite')
      ;(tx.objectStore('saves') as unknown as { put(v: unknown, k: unknown): void }).put(value, key)
      tx.oncomplete = () => resolve()
    }
  })
}

/** A factory that sees everything the backend asks of the fake: the versions it opens at, and every transaction it starts. */
function watchedIndexedDb(inner: FakeIndexedDb): IDBFactory & { versions: (number | undefined)[]; transactions: { store: string; mode: string }[] } {
  const versions: (number | undefined)[] = []
  const transactions: { store: string; mode: string }[] = []
  const patched = new WeakSet<object>()
  const factory = {
    versions,
    transactions,
    open: (name: string, version?: number) => {
      versions.push(version)
      const request = inner.open(name, version)
      return new Proxy(request, {
        get: (target, prop) => {
          const value = Reflect.get(target, prop) as unknown
          if (prop === 'result' && typeof value === 'object' && value !== null && !patched.has(value)) {
            patched.add(value)
            const db = value as { transaction(store: string, mode: IDBTransactionMode): unknown }
            const begin = db.transaction.bind(db)
            db.transaction = (store, mode) => {
              transactions.push({ store, mode })
              return begin(store, mode)
            }
          }
          return value
        },
      })
    },
  }
  return factory as unknown as IDBFactory & { versions: (number | undefined)[]; transactions: { store: string; mode: string }[] }
}

async function idbRig(options: Parameters<typeof fakeIndexedDb>[0] = {}) {
  const factory = fakeIndexedDb(options)
  const backend = await idbSaveBackend(factory)
  return { factory, backend, chunks: backend.chunks as AsyncChunkStore }
}

describe('the IndexedDB chunk store', () => {
  it('is there', async () => {
    const { chunks } = await idbRig()
    expect(chunks).toBeDefined()
  })

  it('puts several records in one call, gets them back in the order asked (null for an id it does not hold) and lists them sorted', async () => {
    const { chunks } = await idbRig()
    expect(await chunks.ids()).toEqual([])
    await chunks.put([
      [WORLD, '{"w":1}'],
      [LOG3, '[3]'],
      [ENTITY, '{"e":1}'],
    ])
    expect(await chunks.get([ENTITY, OTHER, WORLD, LOG3])).toEqual(['{"e":1}', null, '{"w":1}', '[3]'])
    expect(await chunks.ids()).toEqual([ENTITY, LOG3, WORLD].sort())
    expect(await chunks.get([])).toEqual([])
  })

  it('replaces a record put under an id it already holds', async () => {
    const { chunks } = await idbRig()
    await chunks.put([[WORLD, 'one']])
    await chunks.put([[WORLD, 'two']])
    expect(await chunks.get([WORLD])).toEqual(['two'])
    expect(await chunks.ids()).toEqual([WORLD])
  })

  it('removes records, ids it never held and an empty list without a word', async () => {
    const { chunks } = await idbRig()
    await chunks.put([
      [WORLD, 'w'],
      [LOG3, 'l'],
      [ENTITY, 'e'],
    ])
    await chunks.remove([WORLD, OTHER, ENTITY])
    expect(await chunks.ids()).toEqual([LOG3])
    await chunks.remove([])
    expect(await chunks.put([])).toBeUndefined()
    expect(await chunks.ids()).toEqual([LOG3])
  })

  it('keeps a chunk as a row of the saves store under chunkKey(id), beside the head and apart from the quarantine store', async () => {
    const { factory, backend, chunks } = await idbRig()
    await backend.write('{"head":1}')
    await chunks.put([[WORLD, 'w']])
    await backend.overflow.put(QUARANTINE_SLOTS[0], 'copy')

    expect(await savesRows(factory)).toEqual({ [SAVE_KEY]: '{"head":1}', [chunkKey(WORLD)]: 'w' })
    expect(await backend.overflow.keys()).toEqual([QUARANTINE_SLOTS[0]])
    expect(await backend.read()).toBe('{"head":1}')
  })

  it('never lists, reads or removes the head, quarantine rows, another generation or a row that is not text', async () => {
    const { factory, backend, chunks } = await idbRig()
    await backend.write('{"head":1}')
    await plantRow(factory, QUARANTINE_SLOTS[0], 'bad copy')
    await plantRow(factory, 'anotherlife.save.v1.c4.world.1k2j3h4g5f', 'next generation')
    await plantRow(factory, `${CHUNK_PREFIX}junk`, 'ours by prefix, not by grammar')
    await plantRow(factory, 5, 'a numeric key')
    await plantRow(factory, chunkKey(OTHER), 42)
    await chunks.put([[WORLD, 'w']])

    expect(await chunks.ids()).toEqual([OTHER, WORLD].sort())
    expect(await chunks.get([OTHER, WORLD])).toEqual([null, 'w'])

    await chunks.remove([WORLD, OTHER, 'junk', SAVE_KEY, ...QUARANTINE_SLOTS])
    expect(await chunks.ids()).toEqual([])
    const rows = await savesRows(factory)
    expect(rows[SAVE_KEY]).toBe('{"head":1}')
    expect(rows[QUARANTINE_SLOTS[0]]).toBe('bad copy')
    expect(rows['anotherlife.save.v1.c4.world.1k2j3h4g5f']).toBe('next generation')
    expect(rows[`${CHUNK_PREFIX}junk`]).toBe('ours by prefix, not by grammar')
    expect(rows['5']).toBe('a numeric key')
  })

  it('does not disturb the head: it reads, writes and removes as before with chunks beside it', async () => {
    const { backend, chunks } = await idbRig()
    await chunks.put([[WORLD, 'w']])
    expect(await backend.read()).toBeNull()
    await backend.write('{"head":1}')
    await backend.remove()
    expect(await backend.read()).toBeNull()
    expect(await chunks.ids()).toEqual([WORLD])
    expect(await backend.overflow.keys()).toEqual([])
  })

  it('refuses an id outside the grammar before it writes anything: the whole put is rejected', async () => {
    const { factory, chunks } = await idbRig()
    await expect(
      chunks.put([
        [WORLD, 'w'],
        ['not an id', 'x'],
      ]),
    ).rejects.toThrow('not a chunk id')
    expect(await chunks.ids()).toEqual([])
    expect(await savesRows(factory)).toEqual({})
  })

  it('puts all of a call in one readwrite transaction, and nothing sticks when the database refuses it at commit', async () => {
    const watched = watchedIndexedDb(fakeIndexedDb())
    const backend = await idbSaveBackend(watched)
    const chunks = backend.chunks as AsyncChunkStore
    await chunks.put([
      [WORLD, 'w'],
      [LOG3, 'l'],
      [ENTITY, 'e'],
    ])
    expect(watched.transactions).toEqual([{ store: 'saves', mode: 'readwrite' }])

    watched.transactions.length = 0
    await chunks.get([WORLD, LOG3, ENTITY])
    await chunks.remove([WORLD, LOG3])
    expect(watched.transactions).toEqual([
      { store: 'saves', mode: 'readonly' },
      { store: 'saves', mode: 'readwrite' },
    ])

    const failing = await idbRig({ failWrite: true })
    await expect(
      failing.chunks.put([
        [WORLD, 'w'],
        [LOG3, 'l'],
        [ENTITY, 'e'],
      ]),
    ).rejects.toMatchObject({ name: 'QuotaExceededError' })
    expect(await failing.chunks.ids()).toEqual([])
    expect(await failing.chunks.get([WORLD, LOG3, ENTITY])).toEqual([null, null, null])
    expect(await savesRows(failing.factory)).toEqual({})
  })

  it('aborts the transaction when the browser throws while a put is being queued, so no earlier entry is committed', async () => {
    const seen = { puts: 0, aborted: 0, transactions: 0 }
    const request = { result: undefined, error: null }
    const tx: { error: null; objectStore(): unknown; abort(): void } = {
      error: null,
      objectStore: () => ({
        put: () => {
          if (++seen.puts === 2) throw new DOMException('The key is not valid.', 'DataError')
          return request
        },
      }),
      abort: () => {
        seen.aborted++
      },
    }
    const connection = {
      objectStoreNames: { contains: () => true },
      transaction: () => {
        seen.transactions++
        return tx
      },
    }
    const opening: { result: unknown; onsuccess?: () => void } = { result: connection }
    const throwing = {
      open: () => {
        void Promise.resolve().then(() => opening.onsuccess?.())
        return opening
      },
    } as unknown as IDBFactory
    const chunks = (await idbSaveBackend(throwing)).chunks as AsyncChunkStore
    await expect(
      chunks.put([
        [WORLD, 'w'],
        [LOG3, 'l'],
        [ENTITY, 'e'],
      ]),
    ).rejects.toMatchObject({ name: 'DataError' })
    expect(seen).toEqual({ puts: 2, aborted: 1, transactions: 1 })
  })

  it('opens the database at version 1, as before, so an older build still opens it', async () => {
    const watched = watchedIndexedDb(fakeIndexedDb())
    const backend = await idbSaveBackend(watched)
    const chunks = backend.chunks as AsyncChunkStore
    await chunks.put([[WORLD, 'w']])
    await chunks.ids()
    expect(watched.versions).toEqual([1])
    expect(await savesRows(watched)).toEqual({ [chunkKey(WORLD)]: 'w' })
    expect(watched.versions.every((version) => version === 1)).toBe(true)
  })

  it('a second connection to the same factory sees the chunks, like a page reload', async () => {
    const factory = fakeIndexedDb()
    await (await idbSaveBackend(factory)).chunks?.put([[WORLD, 'w']])
    const again = (await idbSaveBackend(factory)).chunks as AsyncChunkStore
    expect(await again.ids()).toEqual([WORLD])
    expect(await again.get([WORLD])).toEqual(['w'])
  })

  describe('a connection the browser drops', () => {
    it('reopens once and retries a put, a get, a listing and a removal, like the head calls do', async () => {
      const { factory, chunks } = await idbRig()
      await chunks.put([[WORLD, 'w']])
      expect(factory.opens).toBe(1)

      factory.dropConnections()
      await chunks.put([[LOG3, 'l']])
      expect(factory.opens).toBe(2)

      factory.dropConnections()
      expect(await chunks.get([WORLD, LOG3])).toEqual(['w', 'l'])
      expect(factory.opens).toBe(3)

      factory.dropConnections()
      expect(await chunks.ids()).toEqual([LOG3, WORLD].sort())
      expect(factory.opens).toBe(4)

      factory.dropConnections()
      await chunks.remove([WORLD])
      expect(factory.opens).toBe(5)
      expect(await chunks.ids()).toEqual([LOG3])
      expect(factory.opens).toBe(5)
    })

    it('heals a connection that closed without telling the page: InvalidStateError, one reopen, one retry', async () => {
      const { factory, chunks } = await idbRig()
      await chunks.put([[WORLD, 'w']])
      factory.dropConnections({ silent: true })
      await chunks.put([[LOG3, 'l']])
      expect(factory.opens).toBe(2)
      expect(await chunks.ids()).toEqual([LOG3, WORLD].sort())
    })

    it('shares one reopen with the head calls made together with it', async () => {
      const { factory, backend, chunks } = await idbRig()
      factory.dropConnections()
      await Promise.all([backend.write('{"head":1}'), chunks.put([[WORLD, 'w']]), chunks.ids(), backend.read()])
      expect(factory.opens).toBe(2)
      expect(await backend.read()).toBe('{"head":1}')
      expect(await chunks.get([WORLD])).toEqual(['w'])
    })

    it('rejects when the database cannot be reopened, and recovers once it can', async () => {
      const { factory, chunks } = await idbRig()
      await chunks.put([[WORLD, 'w']])
      factory.dropConnections({ failOpen: true })
      await expect(chunks.put([[LOG3, 'l']])).rejects.toBeInstanceOf(DOMException)
      await expect(chunks.ids()).rejects.toBeInstanceOf(DOMException)

      factory.dropConnections({ failOpen: false })
      await chunks.put([[LOG3, 'l']])
      expect(await chunks.ids()).toEqual([LOG3, WORLD].sort())
    })

    it('does not reopen for a quota refusal', async () => {
      const { factory, chunks } = await idbRig({ failWrite: true })
      await expect(chunks.put([[WORLD, 'w']])).rejects.toMatchObject({ name: 'QuotaExceededError' })
      await expect(chunks.remove([WORLD])).rejects.toMatchObject({ name: 'QuotaExceededError' })
      expect(factory.opens).toBe(1)
    })
  })
})

// --- Backends with no chunk store are inline only ----------------------------------------------

describe('a backend without a chunk store', () => {
  it('still satisfies both backend interfaces, and says so by having no chunks member', () => {
    const syncOnly: SyncSaveBackend = { kind: 'sync', name: 'memory', read: () => null, write: () => true, remove: () => undefined }
    expect(syncOnly.chunks).toBeUndefined()
    const asyncOnly: AsyncSaveBackend = {
      kind: 'async',
      name: 'idb',
      read: () => Promise.resolve(null),
      write: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      overflow: { put: () => Promise.resolve(), get: () => Promise.resolve(null), keys: () => Promise.resolve([]), remove: () => Promise.resolve() },
    }
    expect(asyncOnly.chunks).toBeUndefined()
  })

  it('is what the existing controlled backend of the kit is', () => {
    expect(controlledBackend().chunks).toBeUndefined()
  })
})

// --- The kit's doubles are shared by later tasks' tests, so what they promise is pinned here ------------

describe('memoryChunkStore (the kit)', () => {
  it('behaves like a SyncChunkStore over a Map and shows what it holds', () => {
    const store = memoryChunkStore({ [OTHER]: 'start' })
    expect(store.data.get(OTHER)).toBe('start')
    expect(store.ids()).toEqual([OTHER])
    expect(store.put(WORLD, '{"w":1}')).toBe(true)
    expect(store.get(WORLD)).toBe('{"w":1}')
    expect(store.get(LOG3)).toBeNull()
    expect(store.ids()).toEqual([OTHER, WORLD].sort())
    store.remove([OTHER, LOG3])
    expect(store.ids()).toEqual([WORLD])
    expect(store.data.size).toBe(1)
  })

  it('records the size of every put, stored or not, and can be told to refuse', () => {
    const store = memoryChunkStore()
    store.put(WORLD, 'abc')
    store.refuse = true
    expect(store.put(LOG3, 'abcdefg')).toBe(false)
    expect(store.ids()).toEqual([WORLD])
    store.refuse = false
    store.put(WORLD, 'a')
    expect(store.putSizes).toEqual([3, 7, 1])
  })
})

describe('chunkedBackend (the kit)', () => {
  it('is a controlled backend with a chunk store whose put waits for the test, all or nothing, like write', async () => {
    const backend = chunkedBackend('{"head":0}')
    expect(backend.kind).toBe('async')
    expect(await backend.read()).toBe('{"head":0}')

    let settled = false
    const putting = backend.chunks.put([[WORLD, 'w'], [LOG3, 'l']]).then(() => {
      settled = true
    })
    await flush()
    expect(settled).toBe(false)
    expect(backend.chunkPuts).toEqual([[[WORLD, 'w'], [LOG3, 'l']]])
    expect(await backend.chunks.ids()).toEqual([])

    backend.settleChunks()
    await putting
    expect(await backend.chunks.ids()).toEqual([LOG3, WORLD].sort())
    expect(await backend.chunks.get([WORLD, ENTITY, LOG3])).toEqual(['w', null, 'l'])
    expect(backend.chunkData.get(WORLD)).toBe('w')

    // The head still waits for its own settle.
    void backend.write('{"head":1}')
    expect(backend.stored).toBe('{"head":0}')
    backend.settle()
    expect(backend.stored).toBe('{"head":1}')
  })

  it('fails a held put with the error it is given and stores none of it', async () => {
    const backend = chunkedBackend()
    const putting = backend.chunks.put([[WORLD, 'w'], [LOG3, 'l']])
    backend.failChunks(0, new Error('no room'))
    await expect(putting).rejects.toThrow('no room')
    expect(await backend.chunks.ids()).toEqual([])
    expect(backend.chunkData.size).toBe(0)
  })

  it('settles a put by number, ignores one that already settled, and removes at once', async () => {
    const backend = chunkedBackend(undefined, { [OTHER]: 'x' })
    expect(await backend.chunks.ids()).toEqual([OTHER])
    const first = backend.chunks.put([[WORLD, 'one']])
    const second = backend.chunks.put([[LOG3, 'two']])
    backend.settleChunks(1)
    await second
    expect(await backend.chunks.ids()).toEqual([LOG3, OTHER].sort())
    backend.settleChunks(0)
    await first
    backend.settleChunks(0)
    backend.failChunks(0)
    expect(await backend.chunks.ids()).toEqual([LOG3, OTHER, WORLD].sort())
    await backend.chunks.remove([OTHER, WORLD])
    expect(await backend.chunks.ids()).toEqual([LOG3])
    expect(() => backend.settleChunks(9)).toThrow(/no chunk put #9/)
  })
})
