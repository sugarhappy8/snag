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

/**
 * localStorage key whose presence says this browser keeps its life in IndexedDB. A record in the
 * localStorage main slot while it is set was written after the move (the page could not reach the
 * database, or was closing), so it is the newer one. It also keeps the IndexedDB switch from hiding a
 * life that has already moved.
 */
export const IDB_MARKER_KEY = 'anotherlife.idb.v1'

/** True when this browser has kept a life in IndexedDB. A localStorage that can't be read says no. */
export function idbMarked(): boolean {
  try {
    return localStorage.getItem(IDB_MARKER_KEY) === '1'
  } catch {
    return false
  }
}

/** Records that this browser keeps its life in IndexedDB. Best effort: a refused write is not an error. */
export function markIdbInUse(): void {
  try {
    if (localStorage.getItem(IDB_MARKER_KEY) !== '1') localStorage.setItem(IDB_MARKER_KEY, '1')
  } catch {
    // storage full or disabled: the marker is only a safeguard
  }
}

const IDB_NAME = 'anotherlife-save'
const SAVES = 'saves'
const QUARANTINE = 'quarantine'

/** Opens the database: rejects when IndexedDB is missing (`factory` defaults to the global one), refuses to open, is blocked, or is silent for `timeoutMs`. */
function openDatabase(factory: IDBFactory | undefined, timeoutMs: number): Promise<IDBDatabase> {
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
      resolve(req.result)
    }
  })
}

/**
 * The save in IndexedDB: database `anotherlife-save`, the record under SAVE_KEY in the `saves` store
 * and the overflow copies in `quarantine`. Rejects when IndexedDB is missing (`factory` defaults to
 * the global one), refuses to open, is blocked, or doesn't answer within `timeoutMs`: private modes
 * can leave open() hanging, and the caller then falls back to localStorage. Once open, a connection
 * the browser drops is reopened, once per failed call (see idbBackend).
 */
export function idbSaveBackend(factory?: IDBFactory, timeoutMs = 3000): Promise<AsyncSaveBackend> {
  // Separate from the Time Machine's openIdb (save.ts) on purpose: that path has no test coverage, so it isn't refactored here.
  return openDatabase(factory, timeoutMs).then((first) => idbBackend(first, () => openDatabase(factory, timeoutMs)))
}

/**
 * Whether `err` is what a dropped connection reports: the transaction can't start (InvalidStateError),
 * the server is lost (UnknownError) or the transaction is cut (AbortError). A refusal such as
 * QuotaExceededError is not.
 */
export function connectionLost(err: unknown): boolean {
  const name = typeof err === 'object' && err !== null && 'name' in err ? (err as { name: unknown }).name : undefined
  return name === 'InvalidStateError' || name === 'UnknownError' || name === 'AbortError'
}

/**
 * The backend over an open database. The browser may drop the connection (WebKit: "Connection to
 * Indexed Database server lost"; another tab clearing the site's data): the connection is forgotten
 * when it closes, and a call that fails because its connection was lost reopens the database once and
 * runs again. A read, put or delete is safe to run twice. Any other failure, a refused write among them, is not retried.
 */
function idbBackend(first: IDBDatabase, reopen: () => Promise<IDBDatabase>): AsyncSaveBackend {
  let db: IDBDatabase | null = null
  let opening: Promise<IDBDatabase> | null = null
  const forget = (conn: IDBDatabase): void => {
    if (db === conn) db = null
    try {
      conn.close()
    } catch {
      // already closed
    }
  }
  const adopt = (conn: IDBDatabase): IDBDatabase => {
    conn.onclose = () => forget(conn)
    conn.onversionchange = () => forget(conn)
    db = conn
    return conn
  }
  adopt(first)
  /** The connection in use; calls made together while it reopens share one reopen. */
  const connect = (): Promise<IDBDatabase> => {
    if (db) return Promise.resolve(db)
    opening ??= reopen()
      .then(adopt)
      .finally(() => {
        opening = null
      })
    return opening
  }
  /** One request in a transaction of its own; it settles when the transaction commits or aborts. */
  const attempt = <T>(conn: IDBDatabase, store: string, mode: IDBTransactionMode, ask: (objects: IDBObjectStore) => IDBRequest<T>): Promise<T> =>
    new Promise((resolve, reject) => {
      const tx = conn.transaction(store, mode)
      const request = ask(tx.objectStore(store))
      tx.oncomplete = () => resolve(request.result)
      // A failed request reaches the transaction before it aborts, when tx.error is still null.
      tx.onerror = () => reject(request.error ?? tx.error ?? new Error('IndexedDB request failed'))
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
    })
  const run = async <T>(store: string, mode: IDBTransactionMode, ask: (objects: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const conn = await connect()
    try {
      return await attempt(conn, store, mode, ask)
    } catch (err) {
      if (!connectionLost(err)) throw err
      forget(conn)
      return attempt(await connect(), store, mode, ask)
    }
  }
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
