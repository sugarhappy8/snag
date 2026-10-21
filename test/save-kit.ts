// Test doubles for the save storage, shared by the save tests: a localStorage in memory, a
// hand-written fake of the IndexedDB calls idbSaveBackend makes, and an async backend whose writes
// the test settles by hand.
import type { AsyncSaveBackend } from '../src/game/save-backends'

/** A localStorage that lives in memory. `data` is what it holds, to arrange a test and to check it. */
export function memoryLocalStorage(initial: Record<string, string> = {}): Storage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial))
  return {
    data,
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  }
}

// --- A fake IndexedDB ---------------------------------------------------------------------------
// Only what idbSaveBackend calls: open (onupgradeneeded, onsuccess, onerror, onblocked),
// objectStoreNames.contains, createObjectStore, transaction (oncomplete, onerror, onabort) and
// objectStore get, put, delete and getAllKeys. Anything else is missing on purpose, so a new call
// in the backend fails the tests loudly until the fake learns it.

type Handler = (() => void) | null

interface FakeRequest<T> {
  result: T | undefined
  error: DOMException | null
  onsuccess: Handler
}

interface FakeOpenRequest extends FakeRequest<FakeDb> {
  onerror: Handler
  onupgradeneeded: Handler
  onblocked: Handler
}

interface FakeObjectStore {
  get(key: string): FakeRequest<string | undefined>
  put(value: string, key: string): FakeRequest<string>
  delete(key: string): FakeRequest<undefined>
  getAllKeys(): FakeRequest<string[]>
}

interface FakeTransaction {
  error: DOMException | null
  oncomplete: Handler
  /** Never fired: no request fails in here (a refused write aborts at commit instead). */
  onerror: Handler
  onabort: Handler
  objectStore(name: string): FakeObjectStore
}

interface FakeDb {
  objectStoreNames: { contains(name: string): boolean }
  createObjectStore(name: string): void
  transaction(store: string, mode: IDBTransactionMode): FakeTransaction
  /** The browser dropped the connection (dropConnections), or the page let go of it. */
  onclose: Handler
  /** Another tab wants to upgrade or delete the database (never fired by the fake). */
  onversionchange: Handler
  close(): void
}

/** The fake factory: an IDBFactory, plus the means to cut its connections and to count its opens. */
export type FakeIndexedDb = IDBFactory & {
  /**
   * The browser drops every open connection (WebKit: "Connection to Indexed Database server lost"): onclose
   * fires (unless `silent`: the page is not told), and a transaction on a dropped connection throws
   * InvalidStateError. Stored rows survive. `failOpen` and `hang` change how the opens after it behave.
   */
  dropConnections(then?: { failOpen?: boolean; hang?: 'open'; silent?: boolean }): void
  /** How many times open() has been called. */
  readonly opens: number
}

type Rows = Map<string, string>
interface Database {
  version: number
  stores: Map<string, Rows>
}

/**
 * IndexedDB answers in a later task, never inside the call. So does the fake, in microtasks: they
 * run whatever the test does to timers, so fake timers can't stall it.
 */
function later(fn: () => void): void {
  void Promise.resolve().then(fn)
}

/**
 * An empty IndexedDB. What a factory stores lasts as long as the factory does, so a second
 * idbSaveBackend(factory) sees what the first one wrote, like a page reload.
 */
export function fakeIndexedDb(
  opts: {
    /** open() answers with an error. */
    failOpen?: boolean
    /** 'open': open() never answers. 'read': a read-only transaction never completes. */
    hang?: 'open' | 'read'
    /** A read-write transaction runs, then is refused at commit with a quota error: it aborts, and none of its changes stick. */
    failWrite?: boolean
    /** Every string a get() returns has been altered, so a record read back differs from the one written. */
    corruptReadback?: boolean
    /** open() answers after this many milliseconds, on a real timer, so tests use fake timers. */
    slowOpen?: number
  } = {},
): FakeIndexedDb {
  const options = { ...opts }
  const databases = new Map<string, Database>()
  const connections: { conn: FakeDb; closed: boolean }[] = []
  let opens = 0

  const begin = (db: Database, storeName: string, mode: IDBTransactionMode): FakeTransaction => {
    const rows = db.stores.get(storeName)
    if (!rows) throw new DOMException(`No object store named ${storeName}.`, 'NotFoundError')
    const queue: (() => void)[] = []
    /** A request waits in line; it runs, then answers, when its transaction gets to it. */
    const ask = <T>(run: () => T): FakeRequest<T> => {
      const request: FakeRequest<T> = { result: undefined, error: null, onsuccess: null }
      queue.push(() => {
        request.result = run()
        request.onsuccess?.()
      })
      return request
    }
    const change = <T>(run: () => T): FakeRequest<T> => {
      if (mode === 'readonly') throw new DOMException('The transaction is read-only.', 'ReadOnlyError')
      return ask(run)
    }
    const objectStore: FakeObjectStore = {
      get: (key) =>
        ask(() => {
          const row = rows.get(key)
          return row !== undefined && options.corruptReadback ? `${row}\u0000` : row
        }),
      put: (value, key) =>
        change(() => {
          rows.set(key, value)
          return key
        }),
      delete: (key) =>
        change(() => {
          rows.delete(key)
          return undefined
        }),
      getAllKeys: () => ask(() => [...rows.keys()].sort()),
    }
    const tx: FakeTransaction = { error: null, oncomplete: null, onerror: null, onabort: null, objectStore: () => objectStore }

    if (mode === 'readonly' && options.hang === 'read') return tx
    const undo = mode !== 'readonly' && options.failWrite ? new Map(rows) : null
    // The queue is filled before this first step runs; each request answers in a step of its own.
    const step = (): void => {
      const next = queue.shift()
      if (next) {
        next()
        later(step)
      } else if (undo) {
        // Quota runs out at commit, which is when the spec lets it: every request was answered, none
        // of it sticks, and the transaction aborts with the error and without an error event.
        rows.clear()
        for (const [key, value] of undo) rows.set(key, value)
        tx.error = new DOMException('The quota has been exceeded.', 'QuotaExceededError')
        tx.onabort?.()
      } else {
        tx.oncomplete?.()
      }
    }
    later(step)
    return tx
  }

  const connect = (db: Database): FakeDb => {
    const link = { closed: false, conn: undefined as unknown as FakeDb }
    link.conn = {
      objectStoreNames: { contains: (name) => db.stores.has(name) },
      createObjectStore: (name) => void db.stores.set(name, new Map()),
      transaction: (storeName, mode) => {
        if (link.closed) throw new DOMException('The database connection is closing.', 'InvalidStateError')
        return begin(db, storeName, mode)
      },
      onclose: null,
      onversionchange: null,
      close: () => {
        link.closed = true
      },
    }
    connections.push(link)
    return link.conn
  }

  const open = (name: string, version = 1): FakeOpenRequest => {
    opens++
    const request: FakeOpenRequest = { result: undefined, error: null, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null }
    if (options.hang === 'open') return request
    const wake = options.slowOpen === undefined ? later : (fn: () => void) => void setTimeout(fn, options.slowOpen)
    wake(() => {
      if (options.failOpen) {
        request.error = new DOMException('The database could not be opened.', 'UnknownError')
        request.onerror?.()
        return
      }
      const db = databases.get(name) ?? { version: 0, stores: new Map<string, Rows>() }
      databases.set(name, db)
      request.result = connect(db)
      if (db.version < version) {
        db.version = version
        request.onupgradeneeded?.()
      }
      later(() => request.onsuccess?.())
    })
    return request
  }

  const dropConnections = (then: { failOpen?: boolean; hang?: 'open'; silent?: boolean } = {}): void => {
    const { silent, ...behaviour } = then
    Object.assign(options, behaviour)
    for (const link of connections.splice(0)) {
      if (link.closed) continue
      link.closed = true
      if (!silent) link.conn.onclose?.()
    }
  }

  return { open, dropConnections, get opens() { return opens } } as unknown as FakeIndexedDb
}

// --- A backend the test drives -----------------------------------------------------------------

export type ControlledBackend = AsyncSaveBackend & {
  /** Every record handed to write(), in order. */
  writes: string[]
  /** The record of the last write that settled (or the one it started with); null after remove(). */
  stored: string | null
  /** Resolve write number `i` (default: the newest). A write that already settled is left alone. */
  settle(i?: number): void
  /** Reject write number `i` (default: the newest) with `err`. A write that already settled is left alone. */
  fail(i?: number, err?: Error): void
}

/**
 * An IndexedDB-shaped backend whose writes stay pending until the test settles or fails them, so a
 * test can hold a write in flight and see what the code does meanwhile. read() and remove() answer
 * at once, and `overflow` is a plain in-memory map.
 */
export function controlledBackend(initial?: string): ControlledBackend {
  const pending: { resolve(): void; reject(err: Error): void; done: boolean }[] = []
  const copies = new Map<string, string>()
  const nth = (i: number) => {
    const write = pending[i]
    if (!write) throw new Error(`controlledBackend has no write #${i}: ${pending.length} so far`)
    return write
  }
  const backend: ControlledBackend = {
    kind: 'async',
    name: 'idb',
    writes: [],
    stored: initial ?? null,
    read: () => Promise.resolve(backend.stored),
    write: (record) =>
      new Promise<void>((resolve, reject) => {
        backend.writes.push(record)
        pending.push({ resolve, reject, done: false })
      }),
    remove: () => {
      backend.stored = null
      return Promise.resolve()
    },
    overflow: {
      put: async (key, record) => void copies.set(key, record),
      get: async (key) => copies.get(key) ?? null,
      keys: async () => [...copies.keys()].sort(),
      remove: async (key) => void copies.delete(key),
    },
    settle: (i = backend.writes.length - 1) => {
      const write = nth(i)
      if (write.done) return
      write.done = true
      backend.stored = backend.writes[i]
      write.resolve()
    },
    fail: (i = backend.writes.length - 1, err = new Error('controlled write failure')) => {
      const write = nth(i)
      if (write.done) return
      write.done = true
      write.reject(err)
    },
  }
  return backend
}
