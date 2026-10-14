// The save backends: memory, localStorage and IndexedDB behind one shape. IndexedDB runs against
// the hand-written fake in save-kit.ts, which gets its own checks at the end of this file.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { idbSaveBackend, localSaveBackend, memorySaveBackend, SAVE_KEY } from '../src/game/save-backends'
import { controlledBackend, fakeIndexedDb, memoryLocalStorage } from './save-kit'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** What a browser throws when localStorage is full. */
const full = () => new DOMException('The quota has been exceeded.', 'QuotaExceededError')

/** Lets everything already queued run (the fake answers in microtasks, so one macrotask is enough). */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

/** Follows a promise without waiting on it, so a test can look at it halfway and fail fast instead of hanging. */
function watch(promise: Promise<unknown>) {
  const seen: { state: 'pending' | 'resolved' | 'rejected'; reason?: unknown } = { state: 'pending' }
  promise.then(
    () => {
      seen.state = 'resolved'
    },
    (reason: unknown) => {
      seen.state = 'rejected'
      seen.reason = reason
    },
  )
  return seen
}

/**
 * A database that refuses every write the way Firefox and Safari report it: the request fails, the
 * error reaches the transaction while that has no error of its own yet, and only then it aborts.
 * (The kit's `failWrite` is the other way, a refusal at commit.)
 */
function refusingIndexedDb(): IDBFactory {
  const refusal = new DOMException('The quota has been exceeded.', 'QuotaExceededError')
  const request = { result: undefined, error: refusal }
  const tx: { error: DOMException | null; onerror?: () => void; onabort?: () => void; objectStore(): unknown } = {
    error: null,
    objectStore: () => ({ put: () => request }),
  }
  const connection = {
    objectStoreNames: { contains: () => true },
    transaction: () => {
      void Promise.resolve().then(() => {
        tx.onerror?.()
        tx.error = refusal
        tx.onabort?.()
      })
      return tx
    },
  }
  const opening: { result: unknown; onsuccess?: () => void } = { result: connection }
  return {
    open: () => {
      void Promise.resolve().then(() => opening.onsuccess?.())
      return opening
    },
  } as unknown as IDBFactory
}

it('keeps the key every earlier build wrote to', () => {
  expect(SAVE_KEY).toBe('anotherlife.save.v1')
})

describe('memorySaveBackend', () => {
  it('writes, reads and removes a record', () => {
    const backend = memorySaveBackend()
    expect(backend.read()).toBeNull()
    expect(backend.write('a')).toBe(true)
    expect(backend.read()).toBe('a')
    backend.remove()
    expect(backend.read()).toBeNull()
  })

  it('starts from the record it is given', () => {
    expect(memorySaveBackend('first').read()).toBe('first')
  })
})

describe('localSaveBackend', () => {
  it('stores plain text under the save key, synchronously, and removes it', () => {
    const storage = memoryLocalStorage()
    vi.stubGlobal('localStorage', storage)
    const backend = localSaveBackend()
    expect(backend.read()).toBeNull()
    expect(backend.write('{"x":1}')).toBe(true)
    expect(storage.data.get(SAVE_KEY)).toBe('{"x":1}')
    expect(backend.read()).toBe('{"x":1}')
    backend.remove()
    expect(storage.data.has(SAVE_KEY)).toBe(false)
    expect(backend.read()).toBeNull()
  })

  it('returns false and leaves storage as it was when a refused write finds nothing to evict', () => {
    const storage = memoryLocalStorage({ [SAVE_KEY]: 'old' })
    vi.stubGlobal('localStorage', storage)
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw full()
    })
    const evict = vi.fn(() => false)
    expect(localSaveBackend(evict).write('new')).toBe(false)
    expect(evict).toHaveBeenCalledTimes(1)
    expect(storage.data.get(SAVE_KEY)).toBe('old')
  })

  it('returns false at the first refusal when it has no evictor', () => {
    const storage = memoryLocalStorage()
    vi.stubGlobal('localStorage', storage)
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw full()
    })
    expect(localSaveBackend().write('new')).toBe(false)
  })

  it('retries once the evictor has made room, asking it exactly once', () => {
    const storage = memoryLocalStorage()
    vi.stubGlobal('localStorage', storage)
    let room = false
    vi.spyOn(storage, 'setItem').mockImplementation((key, value) => {
      if (!room) throw full()
      storage.data.set(key, value)
    })
    const evict = vi.fn(() => {
      room = true
      return true
    })
    expect(localSaveBackend(evict).write('{"x":1}')).toBe(true)
    expect(evict).toHaveBeenCalledTimes(1)
    expect(storage.data.get(SAVE_KEY)).toBe('{"x":1}')
  })

  it('keeps evicting for as long as the evictor frees something', () => {
    const storage = memoryLocalStorage()
    vi.stubGlobal('localStorage', storage)
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw full()
    })
    const evict = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(true).mockReturnValue(false)
    expect(localSaveBackend(evict).write('new')).toBe(false)
    expect(evict).toHaveBeenCalledTimes(3)
  })

  it('reads null when the storage throws, and a refused remove is not an error', () => {
    const boom = () => {
      throw new DOMException('Access denied', 'SecurityError')
    }
    vi.stubGlobal('localStorage', { getItem: boom, setItem: boom, removeItem: boom })
    const backend = localSaveBackend()
    expect(backend.read()).toBeNull()
    expect(backend.write('x')).toBe(false)
    expect(() => backend.remove()).not.toThrow()
  })
})

describe('idbSaveBackend', () => {
  it('round-trips a record, replaces it, and removes it', async () => {
    const backend = await idbSaveBackend(fakeIndexedDb())
    expect(await backend.read()).toBeNull()
    await backend.write('{"x":1}')
    expect(await backend.read()).toBe('{"x":1}')
    await backend.write('{"x":2}')
    expect(await backend.read()).toBe('{"x":2}')
    await backend.remove()
    expect(await backend.read()).toBeNull()
  })

  it('keeps overflow copies apart from the save', async () => {
    const backend = await idbSaveBackend(fakeIndexedDb())
    await backend.overflow.put('bad-1', 'x')
    expect(await backend.read()).toBeNull()
    expect(await backend.overflow.keys()).toEqual(['bad-1'])
    expect(await backend.overflow.get('bad-1')).toBe('x')
    expect(await backend.overflow.get('bad-2')).toBeNull()

    await backend.write('save')
    expect(await backend.overflow.keys()).toEqual(['bad-1'])
    await backend.overflow.put('bad-0', 'w')
    expect(await backend.overflow.keys()).toEqual(['bad-0', 'bad-1'])
    await backend.overflow.remove('bad-1')
    await backend.overflow.remove('bad-0')
    expect(await backend.overflow.keys()).toEqual([])
    expect(await backend.read()).toBe('save')
  })

  it('uses the global indexedDB when it is not handed a factory', async () => {
    vi.stubGlobal('indexedDB', fakeIndexedDb())
    const backend = await idbSaveBackend()
    await backend.write('x')
    expect(await backend.read()).toBe('x')
  })

  it('rejects when IndexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined)
    await expect(idbSaveBackend()).rejects.toThrow('IndexedDB unavailable')
  })

  it('gives up on an open that never answers, after 3000 ms', async () => {
    vi.useFakeTimers()
    const opening = watch(idbSaveBackend(fakeIndexedDb({ hang: 'open' })))
    await vi.advanceTimersByTimeAsync(2999)
    expect(opening.state).toBe('pending')
    await vi.advanceTimersByTimeAsync(1)
    expect(opening.state).toBe('rejected')
    expect(opening.reason).toEqual(new Error('IndexedDB timed out'))
  })

  it('takes the open timeout as a parameter', async () => {
    vi.useFakeTimers()
    const opening = watch(idbSaveBackend(fakeIndexedDb({ hang: 'open' }), 500))
    await vi.advanceTimersByTimeAsync(499)
    expect(opening.state).toBe('pending')
    await vi.advanceTimersByTimeAsync(1)
    expect(opening.state).toBe('rejected')
    expect(opening.reason).toEqual(new Error('IndexedDB timed out'))
  })

  it('rejects with the request error when a failed request reaches the transaction before it aborts', async () => {
    const backend = await idbSaveBackend(refusingIndexedDb())
    const writing = watch(backend.write('x'))
    await flush()
    expect(writing.state).toBe('rejected')
    expect(writing.reason).toMatchObject({ name: 'QuotaExceededError' })
  })

  it('leaves no timer running once it has opened', async () => {
    vi.useFakeTimers()
    await idbSaveBackend(fakeIndexedDb())
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects with the error the open reports, and leaves no timer running', async () => {
    vi.useFakeTimers()
    const opening = watch(idbSaveBackend(fakeIndexedDb({ failOpen: true })))
    await vi.advanceTimersByTimeAsync(0)
    expect(opening.state).toBe('rejected')
    expect(opening.reason).toBeInstanceOf(DOMException)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects when open throws, and leaves no timer running', async () => {
    vi.useFakeTimers()
    const throws = {
      open: () => {
        throw new DOMException('Access denied', 'SecurityError')
      },
    } as unknown as IDBFactory
    const opening = watch(idbSaveBackend(throws))
    await vi.advanceTimersByTimeAsync(0)
    expect(opening.state).toBe('rejected')
    expect(opening.reason).toMatchObject({ name: 'SecurityError' })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects when the database is blocked, and leaves no timer running', async () => {
    vi.useFakeTimers()
    const request: { onblocked?: () => void } = {}
    const blocked = {
      open: () => {
        void Promise.resolve().then(() => request.onblocked?.())
        return request
      },
    } as unknown as IDBFactory
    const opening = watch(idbSaveBackend(blocked))
    await vi.advanceTimersByTimeAsync(0)
    expect(opening.state).toBe('rejected')
    expect(opening.reason).toEqual(new Error('IndexedDB blocked'))
    expect(vi.getTimerCount()).toBe(0)
  })
})

// The kit is shared by later tasks' tests, so what it promises is pinned here.
describe('memoryLocalStorage', () => {
  it('behaves like Storage and shows what it holds', () => {
    const storage = memoryLocalStorage({ a: '1' })
    expect(storage.length).toBe(1)
    expect(storage.getItem('a')).toBe('1')
    expect(storage.getItem('b')).toBeNull()
    storage.setItem('b', '2')
    expect(storage.key(1)).toBe('b')
    expect(storage.key(2)).toBeNull()
    expect(storage.data.get('b')).toBe('2')
    storage.removeItem('a')
    expect(storage.length).toBe(1)
    storage.clear()
    expect(storage.length).toBe(0)
  })
})

describe('fakeIndexedDb', () => {
  it('answers after the call returns, never inside it', async () => {
    const request = fakeIndexedDb().open('db', 1)
    const events: string[] = []
    request.onupgradeneeded = () => {
      events.push('upgrade')
      request.result.createObjectStore('rows')
    }
    request.onsuccess = () => {
      events.push('success')
    }
    expect(events).toEqual([])
    await flush()
    expect(events).toEqual(['upgrade', 'success'])
  })

  it('keeps what is stored for the next connection to the same factory, and only that factory', async () => {
    const factory = fakeIndexedDb()
    await (await idbSaveBackend(factory)).write('kept')
    expect(await (await idbSaveBackend(factory)).read()).toBe('kept')
    expect(await (await idbSaveBackend(fakeIndexedDb())).read()).toBeNull()
  })

  it('refuses what IndexedDB refuses: a write in a read-only transaction, a store that is not there', async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = fakeIndexedDb().open('db', 1)
      request.onupgradeneeded = () => {
        request.result.createObjectStore('rows')
      }
      request.onsuccess = () => resolve(request.result)
    })
    expect(() => db.transaction('rows', 'readonly').objectStore('rows').put('v', 'k')).toThrow(/read-only/)
    expect(() => db.transaction('missing', 'readonly')).toThrow(/No object store/)
  })

  it('refuses every write when asked to, and undoes it', async () => {
    const backend = await idbSaveBackend(fakeIndexedDb({ failWrite: true }))
    const refused = async (...writes: Promise<void>[]) => {
      const seen = writes.map(watch)
      await flush()
      for (const write of seen) {
        expect(write.state).toBe('rejected')
        expect(write.reason).toMatchObject({ name: 'QuotaExceededError' })
      }
    }
    await refused(backend.write('x'), backend.overflow.put('bad-1', 'x'))
    // The puts ran before the commit was refused: they must not show afterwards.
    expect(await backend.read()).toBeNull()
    expect(await backend.overflow.keys()).toEqual([])
    await refused(backend.remove(), backend.overflow.remove('bad-1'))
  })

  it('refuses a write at commit: its request is answered first, then the transaction aborts, with no error event', async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = fakeIndexedDb({ failWrite: true }).open('db', 1)
      request.onupgradeneeded = () => {
        request.result.createObjectStore('rows')
      }
      request.onsuccess = () => resolve(request.result)
    })
    const events: string[] = []
    const tx = db.transaction('rows', 'readwrite')
    const put = tx.objectStore('rows').put('v', 'k')
    put.onsuccess = () => events.push('request answered')
    tx.oncomplete = () => events.push('complete')
    tx.onerror = () => events.push('error')
    tx.onabort = () => events.push(`abort: ${tx.error?.name}`)
    await flush()
    expect(events).toEqual(['request answered', 'abort: QuotaExceededError'])
  })

  it('never answers a read when asked to hang, but still takes writes', async () => {
    vi.useFakeTimers()
    const backend = await idbSaveBackend(fakeIndexedDb({ hang: 'read' }))
    await backend.write('kept')
    let answered = false
    void backend.read().then(() => {
      answered = true
    })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(answered).toBe(false)
  })

  it('hands back an altered record when asked to, so a read-back can be told from the write', async () => {
    const backend = await idbSaveBackend(fakeIndexedDb({ corruptReadback: true }))
    await backend.write('record')
    expect(await backend.read()).not.toBe('record')
  })
})

describe('controlledBackend', () => {
  it('holds a write until the test settles it, then keeps it as the stored record', async () => {
    const backend = controlledBackend('first')
    expect(await backend.read()).toBe('first')
    let done = false
    const write = backend.write('second').then(() => {
      done = true
    })
    await flush()
    expect(backend.writes).toEqual(['second'])
    expect(done).toBe(false)
    expect(backend.stored).toBe('first')

    backend.settle(0)
    await write
    expect(done).toBe(true)
    expect(backend.stored).toBe('second')
    expect(await backend.read()).toBe('second')
  })

  it('rejects a write the test fails and keeps the last stored record', async () => {
    const backend = controlledBackend('first')
    const write = backend.write('second')
    backend.fail(0, new Error('disk full'))
    await expect(write).rejects.toThrow('disk full')
    expect(backend.stored).toBe('first')
    expect(backend.writes).toEqual(['second'])
  })

  it('settles the newest write by default, a chosen write by index, and a write only once', async () => {
    const backend = controlledBackend()
    const first = backend.write('a')
    const second = backend.write('b')
    backend.settle()
    await second
    expect(backend.stored).toBe('b')

    backend.fail(0)
    await expect(first).rejects.toThrow()
    backend.settle(0)
    expect(backend.stored).toBe('b')
    expect(() => backend.settle(2)).toThrow(/no write #2/)
  })

  it('removes the stored record, and keeps overflow copies in memory', async () => {
    const backend = controlledBackend('first')
    await backend.remove()
    expect(await backend.read()).toBeNull()

    await backend.overflow.put('bad-2', 'y')
    await backend.overflow.put('bad-1', 'x')
    expect(await backend.overflow.keys()).toEqual(['bad-1', 'bad-2'])
    expect(await backend.overflow.get('bad-1')).toBe('x')
    await backend.overflow.remove('bad-1')
    expect(await backend.overflow.get('bad-1')).toBeNull()
    expect(await backend.overflow.keys()).toEqual(['bad-2'])
  })
})
