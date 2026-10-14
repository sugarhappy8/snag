// Where the saved game is kept: IndexedDB, localStorage or memory, behind one shape. A record is an
// opaque string here (the codec and the parsing live elsewhere), so there is no game logic in this file.

/** The key the save lives under in localStorage and in IndexedDB. Older builds read it too: never rename it. */
export const SAVE_KEY = 'anotherlife.save.v1'

/** localStorage and memory: they answer on the spot, so a save is readable the moment it is written. */
export interface SyncSaveBackend {
  readonly kind: 'sync'
  readonly name: 'local' | 'memory'
  /** The stored record; null when there is none or the storage can't be read. */
  read(): string | null
  /** False when the record could not be stored. */
  write(record: string): boolean
  remove(): void
}

/** IndexedDB: every call is a promise, and a write rejects when it didn't reach the database. */
export interface AsyncSaveBackend {
  readonly kind: 'async'
  readonly name: 'idb'
  read(): Promise<string | null>
  write(record: string): Promise<void>
  remove(): Promise<void>
  /** Byte-exact copies of records that couldn't be loaded, in a store of their own beside the save. */
  readonly overflow: {
    put(key: string, record: string): Promise<void>
    get(key: string): Promise<string | null>
    /** Sorted, as IndexedDB returns them. */
    keys(): Promise<string[]>
    remove(key: string): Promise<void>
  }
}

export type SaveBackend = SyncSaveBackend | AsyncSaveBackend

/** Nothing is kept past the page: for tests, and for a host with no storage at all. */
export function memorySaveBackend(initial?: string): SyncSaveBackend {
  let record = initial ?? null
  return {
    kind: 'sync',
    name: 'memory',
    read: () => record,
    write: (next) => {
      record = next
      return true
    },
    remove: () => {
      record = null
    },
  }
}

/**
 * localStorage under SAVE_KEY, as `saveGame` has always used it. A refused write (storage full or
 * disabled) asks `evict` for room and tries again, for as long as `evict` says it freed some; it is
 * false once `evict` says it didn't. `evict` must only return true when it really made room, or
 * this loops.
 */
export function localSaveBackend(evict: () => boolean = () => false): SyncSaveBackend {
  return {
    kind: 'sync',
    name: 'local',
    read: () => {
      try {
        return localStorage.getItem(SAVE_KEY)
      } catch {
        return null
      }
    },
    write: (record) => {
      for (;;) {
        try {
          localStorage.setItem(SAVE_KEY, record)
          return true
        } catch {
          if (!evict()) return false
        }
      }
    },
    remove: () => {
      try {
        localStorage.removeItem(SAVE_KEY)
      } catch {
        // storage disabled: there is nothing to remove
      }
    },
  }
}

const IDB_NAME = 'anotherlife-save'
const SAVES = 'saves'
const QUARANTINE = 'quarantine'

/**
 * The save in IndexedDB: database `anotherlife-save`, the record under SAVE_KEY in the `saves` store
 * and the overflow copies in `quarantine`. Rejects when IndexedDB is missing (`factory` defaults to
 * the global one), refuses to open, is blocked, or doesn't answer within `timeoutMs`: private modes
 * can leave open() hanging, and the caller then falls back to localStorage.
 */
export function idbSaveBackend(factory?: IDBFactory, timeoutMs = 3000): Promise<AsyncSaveBackend> {
  // Separate from the Time Machine's openIdb (save.ts) on purpose: that path has no test coverage, so it isn't refactored here.
  return new Promise((resolve, reject) => {
    const idb: IDBFactory | undefined = factory ?? globalThis.indexedDB
    if (!idb) {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const timer = setTimeout(() => reject(new Error('IndexedDB timed out')), timeoutMs)
    let req: IDBOpenDBRequest
    try {
      req = idb.open(IDB_NAME, 1)
    } catch (err) {
      clearTimeout(timer)
      reject(err)
      return
    }
    req.onupgradeneeded = () => {
      for (const store of [SAVES, QUARANTINE]) if (!req.result.objectStoreNames.contains(store)) req.result.createObjectStore(store)
    }
    req.onerror = () => {
      clearTimeout(timer)
      reject(req.error)
    }
    req.onblocked = () => {
      clearTimeout(timer)
      reject(new Error('IndexedDB blocked'))
    }
    req.onsuccess = () => {
      clearTimeout(timer)
      resolve(idbBackend(req.result))
    }
  })
}

function idbBackend(db: IDBDatabase): AsyncSaveBackend {
  /** One request in a transaction of its own; it settles when the transaction commits or aborts. */
  const run = <T>(store: string, mode: IDBTransactionMode, ask: (objects: IDBObjectStore) => IDBRequest<T>): Promise<T> =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode)
      const request = ask(tx.objectStore(store))
      tx.oncomplete = () => resolve(request.result)
      // A failed request reaches the transaction before it aborts, when tx.error is still null.
      tx.onerror = () => reject(request.error ?? tx.error ?? new Error('IndexedDB request failed'))
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
    })
  const readString = async (store: string, key: string): Promise<string | null> => {
    const value: unknown = await run(store, 'readonly', (objects) => objects.get(key))
    return typeof value === 'string' ? value : null
  }
  const put = async (store: string, key: string, record: string): Promise<void> => {
    await run(store, 'readwrite', (objects) => objects.put(record, key))
  }
  const drop = async (store: string, key: string): Promise<void> => {
    await run(store, 'readwrite', (objects) => objects.delete(key))
  }
  return {
    kind: 'async',
    name: 'idb',
    read: () => readString(SAVES, SAVE_KEY),
    write: (record) => put(SAVES, SAVE_KEY, record),
    remove: () => drop(SAVES, SAVE_KEY),
    overflow: {
      put: (key, record) => put(QUARANTINE, key, record),
      get: (key) => readString(QUARANTINE, key),
      keys: async () => (await run(QUARANTINE, 'readonly', (objects) => objects.getAllKeys())).map(String),
      remove: (key) => drop(QUARANTINE, key),
    },
  }
}
