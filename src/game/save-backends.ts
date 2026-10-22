// Where the saved game is kept: IndexedDB, localStorage or memory, behind one shape. A record is an
// opaque string here (the codec and the parsing live elsewhere), so there is no game logic in this file.

/** The key the save lives under in localStorage and in IndexedDB. Older builds read it too: never rename it. */
export const SAVE_KEY = 'anotherlife.save.v1'

/**
 * The id of a chunk record: the chunk name (`world`, `log.<n>`, `e.<kind>.<n>`), then a base-36 checksum of
 * its text. save-codec.ts (R2-S3) makes ids in this grammar; this file is a leaf and so keeps the
 * expression itself, in the one place that has to refuse a key that is not ours. A test in the
 * codec's task must pin that the two are the same expression.
 */
export const CHUNK_ID_PATTERN = /^(?:world|log\.[0-9]{1,2}|e\.[a-z0-9]{1,16}\.[0-9]{1,2})\.[0-9a-z]{6,32}$/

/**
 * Where a chunk of a saved game is kept in localStorage, and the key it has in the IndexedDB `saves`
 * store: the head's key, then the generation of the format (`c3`: chunks of save v3). The generation is
 * in the key so a later format's chunks are never listed, and so never swept, by this one. It is not a
 * quarantine slot (`.bad`, `.bad.2`, `.bad.3`).
 */
export const CHUNK_PREFIX = `${SAVE_KEY}.c3.`

/** The storage key of the chunk `id`. */
export function chunkKey(id: string): string {
  return CHUNK_PREFIX + id
}

/** True when `key` is a chunk key of this generation: our prefix, then an id in the grammar. */
export function isOurChunkKey(key: string): boolean {
  return key.startsWith(CHUNK_PREFIX) && CHUNK_ID_PATTERN.test(key.slice(CHUNK_PREFIX.length))
}

const isChunkId = (id: string): boolean => CHUNK_ID_PATTERN.test(id)

/**
 * The chunk records of a save, beside its head (localStorage and memory). A store only ever holds, lists
 * and removes ids in the chunk grammar, so `ids()` is everything it keeps and a sweep reaches all of it.
 */
export interface SyncChunkStore {
  /** The ids (prefix removed) of every stored chunk of this generation, sorted. [] when the storage can't be read. */
  ids(): string[]
  /** The stored record; null when there is none or the storage can't be read. */
  get(id: string): string | null
  /**
   * False when the record could not be stored: storage full (a local store asks `evict` for room first,
   * exactly as the head write does) or an id outside the grammar.
   */
  put(id: string, record: string): boolean
  /** Removes the records it holds under these ids; the others are left alone. Never throws. */
  remove(ids: readonly string[]): void
}

/** The chunk records of a save in IndexedDB, in the `saves` store beside the head (the database version stays 1). */
export interface AsyncChunkStore {
  /** The ids (prefix removed) of every stored chunk of this generation, sorted. */
  ids(): Promise<string[]>
  /** The stored records in the order of `ids`; null for an id it doesn't hold (or whose row isn't text). One transaction. */
  get(ids: readonly string[]): Promise<(string | null)[]>
  /** All or nothing, in one transaction; an id outside the grammar rejects the whole call before anything is written. */
  put(entries: readonly (readonly [id: string, record: string])[]): Promise<void>
  /** In one transaction; ids it doesn't hold are ignored. */
  remove(ids: readonly string[]): Promise<void>
}

/** localStorage and memory: they answer on the spot, so a save is readable the moment it is written. */
export interface SyncSaveBackend {
  readonly kind: 'sync'
  readonly name: 'local' | 'memory'
  /** The stored record; null when there is none or the storage can't be read. */
  read(): string | null
  /** False when the record could not be stored. */
  write(record: string): boolean
  remove(): void
  /** Where the chunks of a chunked save go. A backend without one (a test double) keeps a save inline only. */
  readonly chunks?: SyncChunkStore
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
  /** Where the chunks of a chunked save go. A backend without one (a test double) keeps a save inline only. */
  readonly chunks?: AsyncChunkStore
}

export type SaveBackend = SyncSaveBackend | AsyncSaveBackend

/** The chunks of a memory backend: a Map, gone with the page. */
function memoryChunkStore(): SyncChunkStore {
  const held = new Map<string, string>()
  return {
    ids: () => [...held.keys()].sort(),
    get: (id) => held.get(id) ?? null,
    put: (id, record) => {
      if (!isChunkId(id)) return false
      held.set(id, record)
      return true
    },
    remove: (ids) => {
      for (const id of ids) if (isChunkId(id)) held.delete(id)
    },
  }
}

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
    chunks: memoryChunkStore(),
  }
}

/**
 * The chunks of the localStorage backend: one key each, `chunkKey(id)`. `ids()` walks every key of the
 * storage (a few dozen: the head, the chunks, the quarantine slots, the Time Machine and the settings), and the store asks for
 * it on every chunked save, to know which chunks another tab left or swept. `evict` is the backend's own.
 */
function localChunkStore(evict: () => boolean): SyncChunkStore {
  return {
    ids: () => {
      const found: string[] = []
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key !== null && isOurChunkKey(key)) found.push(key.slice(CHUNK_PREFIX.length))
        }
      } catch {
        // storage disabled or failing: what was seen so far is all there is to list
      }
      return found.sort()
    },
    get: (id) => {
      try {
        return localStorage.getItem(chunkKey(id))
      } catch {
        return null
      }
    },
    put: (id, record) => {
      if (!isChunkId(id)) return false
      for (;;) {
        try {
          localStorage.setItem(chunkKey(id), record)
          return true
        } catch {
          if (!evict()) return false
        }
      }
    },
    remove: (ids) => {
      for (const id of ids) {
        if (!isChunkId(id)) continue
        try {
          localStorage.removeItem(chunkKey(id))
        } catch {
          // storage disabled: there is nothing to remove
        }
      }
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
  const chunks = localChunkStore(evict)
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
    chunks,
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
  /** The error of the first request that has one; a request still pending has none to give (reading it would throw). */
  const failure = (requests: readonly IDBRequest[]): DOMException | null => {
    for (const request of requests) {
      try {
        if (request.error) return request.error
      } catch {
        // not finished yet
      }
    }
    return null
  }
  /**
   * Some requests in one transaction; it settles when the transaction commits (with every request's
   * result, in order) or aborts, and none of them sticks. A throw while the requests are queued aborts it.
   */
  const attempt = <T>(conn: IDBDatabase, store: string, mode: IDBTransactionMode, ask: (objects: IDBObjectStore) => IDBRequest<T>[]): Promise<T[]> =>
    new Promise((resolve, reject) => {
      const tx = conn.transaction(store, mode)
      let requests: IDBRequest<T>[]
      try {
        requests = ask(tx.objectStore(store))
      } catch (err) {
        try {
          tx.abort()
        } catch {
          // already finished, or not abortable: the throw below is what the caller needs
        }
        reject(err)
        return
      }
      tx.oncomplete = () => resolve(requests.map((request) => request.result))
      // A failed request reaches the transaction before it aborts, when tx.error is still null.
      tx.onerror = () => reject(failure(requests) ?? tx.error ?? new Error('IndexedDB request failed'))
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
    })
  const runAll = async <T>(store: string, mode: IDBTransactionMode, ask: (objects: IDBObjectStore) => IDBRequest<T>[]): Promise<T[]> => {
    const conn = await connect()
    try {
      return await attempt(conn, store, mode, ask)
    } catch (err) {
      if (!connectionLost(err)) throw err
      forget(conn)
      return attempt(await connect(), store, mode, ask)
    }
  }
  /** One request in a transaction of its own. */
  const run = async <T>(store: string, mode: IDBTransactionMode, ask: (objects: IDBObjectStore) => IDBRequest<T>): Promise<T> => (await runAll(store, mode, (objects) => [ask(objects)]))[0]
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
  const chunks: AsyncChunkStore = {
    ids: async () =>
      (await run(SAVES, 'readonly', (objects) => objects.getAllKeys()))
        .filter((key): key is string => typeof key === 'string' && isOurChunkKey(key))
        .map((key) => key.slice(CHUNK_PREFIX.length))
        .sort(),
    get: async (ids) => {
      if (ids.length === 0) return []
      const rows: unknown[] = await runAll(SAVES, 'readonly', (objects) => ids.map((id) => objects.get(chunkKey(id))))
      return rows.map((row) => (typeof row === 'string' ? row : null))
    },
    put: async (entries) => {
      const bad = entries.find(([id]) => !isChunkId(id))
      if (bad) throw new Error('not a chunk id')
      if (entries.length === 0) return
      await runAll(SAVES, 'readwrite', (objects) => entries.map(([id, record]) => objects.put(record, chunkKey(id))))
    },
    remove: async (ids) => {
      const ours = ids.filter(isChunkId)
      if (ours.length === 0) return
      await runAll(SAVES, 'readwrite', (objects) => ours.map((id) => objects.delete(chunkKey(id))))
    },
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
    chunks,
  }
}
