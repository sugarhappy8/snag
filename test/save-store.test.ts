// The save store: the main save behind one door, whichever backend holds it. A synchronous backend
// (localStorage, memory) is written inside saveRecord and read live. An asynchronous one (IndexedDB,
// here the kit's controlled backend, whose writes the test settles by hand) is read from a cache and
// written through a queue: one write in flight, the latest save next, a removal after the write in
// flight. Then the save.ts facade on top of it.
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as save from '../src/game/save'
import { localSaveBackend, memorySaveBackend, SAVE_KEY } from '../src/game/save-backends'
import type { AsyncSaveBackend } from '../src/game/save-backends'
import { QUARANTINE_SLOTS } from '../src/game/save-quarantine'
import { SAVE_SCHEMA } from '../src/game/save-schema'
import {
  activeBackendName,
  deleteSaveCopy,
  flushSave,
  getSaveStatus,
  protectNewerRecord,
  readRecord,
  readSaveCopy,
  removeRecord,
  resetSaveStoreForTests,
  saveRecord,
  setSaveBackend,
  STORE_OP_TIMEOUT_MS,
  subscribeSaveStatus,
} from '../src/game/save-store'
import { decodeSnapshotRecord } from '../src/game/snapshot-codec'
import type { GameState } from '../src/game/types'
import { controlledBackend, memoryLocalStorage } from './save-kit'
import type { ControlledBackend } from './save-kit'

const [SLOT_1, SLOT_2, SLOT_3] = QUARANTINE_SLOTS

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

/** One macrotask: whatever is already queued gets to run, the codec's gzip streams included. */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

/** Waits, for a bounded while, until the store has handed the backend `count` writes. */
async function writesReach(backend: ControlledBackend, count: number): Promise<void> {
  for (let i = 0; i < 500 && backend.writes.length < count; i++) await tick()
  expect(backend.writes.length, 'writes handed to the backend').toBeGreaterThanOrEqual(count)
}

/** Settles each write as the store hands it over, until it has nothing left to write; then what flushSave said. */
async function settleAll(backend: ControlledBackend): Promise<boolean | undefined> {
  let flushed: boolean | undefined
  void flushSave().then((ok) => {
    flushed = ok
  })
  for (let i = 0; i < 500 && flushed === undefined; i++) {
    await tick()
    for (let n = 0; n < backend.writes.length; n++) backend.settle(n)
  }
  return flushed
}

/** The kit's controlled backend, made the store's backend. */
function useControlled(initial?: string): ControlledBackend {
  const backend = controlledBackend(initial)
  setSaveBackend(backend)
  return backend
}

/** Holds the next quarantine copy halfway: listing the overflow waits until the function returned is called. */
function holdCopies(backend: ControlledBackend): () => void {
  let open: () => void = () => undefined
  const gate = new Promise<void>((resolve) => {
    open = resolve
  })
  const keys = backend.overflow.keys
  backend.overflow.keys = async () => {
    await gate
    return keys()
  }
  return open
}

/** Fills the quarantine: three slots and, on `backend`, two overflow copies. */
async function fillQuarantine(backend: ControlledBackend): Promise<void> {
  for (const [n, slot] of QUARANTINE_SLOTS.entries()) storage.data.set(slot, `copy ${n + 1}`)
  await backend.overflow.put('bad-1', 'copy 4')
  await backend.overflow.put('bad-2', 'copy 5')
}

/** A record written by a later version of the game: this one must never load it, overwrite it or delete it. */
const newer = JSON.stringify({ version: 1, schemaVersion: SAVE_SCHEMA + 1, extra: {} })

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

describe('the backend', () => {
  it('is localStorage by default, and setSaveBackend(null) goes back to it', () => {
    expect(activeBackendName()).toBe('local')
    expect(saveRecord('{"a":1}')).toBe(true)
    expect(storage.data.get(SAVE_KEY)).toBe('{"a":1}')

    setSaveBackend(controlledBackend())
    expect(activeBackendName()).toBe('idb')
    setSaveBackend(memorySaveBackend())
    expect(activeBackendName()).toBe('memory')
    setSaveBackend(null)
    expect(activeBackendName()).toBe('local')
    expect(readRecord()).toBe('{"a":1}')

    // Nothing in the queue: localStorage is emptied inside the call, as clearSave always did.
    removeRecord()
    expect(storage.data.has(SAVE_KEY)).toBe(false)
  })
})

describe('a synchronous backend', () => {
  it('sync backend: save, read and a refused write', () => {
    setSaveBackend(memorySaveBackend())
    expect(saveRecord('{"a":1}')).toBe(true)
    expect(readRecord()).toBe('{"a":1}')

    setSaveBackend(localSaveBackend())
    expect(saveRecord('{"life":1}')).toBe(true)
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw full()
    })
    expect(saveRecord('{"life":2}')).toBe(false)
    expect(getSaveStatus().persistFailed).toBe(true)
    expect(readRecord()).toBe('{"life":1}')
  })

  it('a failed write that later succeeds clears the warning and returns the newest save', () => {
    setSaveBackend(localSaveBackend())
    const listener = vi.fn()
    const unsubscribe = subscribeSaveStatus(listener)
    saveRecord('{"life":1}')
    const refuse = vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw full()
    })
    expect(saveRecord('{"life":2}')).toBe(false)
    expect(saveRecord('{"life":3}')).toBe(false)
    expect(getSaveStatus().persistFailed).toBe(true)
    // Told once, when it flipped: a second refusal changes nothing.
    expect(listener).toHaveBeenCalledTimes(1)

    refuse.mockRestore()
    expect(saveRecord('{"life":4}')).toBe(true)
    expect(getSaveStatus().persistFailed).toBe(false)
    expect(listener).toHaveBeenCalledTimes(2)
    expect(readRecord()).toBe('{"life":4}')
    unsubscribe()
  })
})

describe('an asynchronous backend', () => {
  it('async backend: five rapid saves make at most two writes and the last wins', async () => {
    const backend = useControlled()
    const saves = [1, 2, 3, 4, 5].map((n) => JSON.stringify({ save: n }))
    for (const json of saves) expect(saveRecord(json)).toBe(true)
    expect(backend.writes.length).toBeLessThanOrEqual(2)
    expect(readRecord()).toBe(saves[4])

    expect(await settleAll(backend)).toBe(true)
    expect(await flushSave()).toBe(true)
    expect(backend.writes.length).toBeLessThanOrEqual(2)
    expect(await decodeSnapshotRecord(backend.stored ?? '')).toBe(saves[4])
  })

  it('keeps one write in flight, and the saves made meanwhile make one more write, of the last', async () => {
    const backend = useControlled()
    saveRecord('{"save":1}')
    await writesReach(backend, 1)
    for (let n = 2; n <= 5; n++) saveRecord(`{"save":${n}}`)
    await tick()
    expect(backend.writes).toEqual(['{"save":1}'])
    expect(readRecord()).toBe('{"save":5}')

    backend.settle(0)
    await writesReach(backend, 2)
    expect(backend.writes).toEqual(['{"save":1}', '{"save":5}'])
    backend.settle(1)
    expect(await flushSave()).toBe(true)
    expect(backend.stored).toBe('{"save":5}')
  })

  it('async backend: a failed write sets persistFailed and the next save retries', async () => {
    const backend = useControlled()
    const listener = vi.fn()
    const unsubscribe = subscribeSaveStatus(listener)
    saveRecord('{"save":1}')
    await writesReach(backend, 1)
    backend.fail(0)
    expect(await flushSave()).toBe(false)
    expect(getSaveStatus().persistFailed).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)
    // What a reload would load: nothing was ever stored.
    expect(backend.stored).toBeNull()
    expect(readRecord()).toBeNull()

    saveRecord('{"save":2}')
    // The warning stays up, and reads stay on the stored record, until the retry has landed.
    expect(getSaveStatus().persistFailed).toBe(true)
    expect(readRecord()).toBeNull()
    await writesReach(backend, 2)
    backend.settle(1)
    expect(await flushSave()).toBe(true)
    expect(getSaveStatus().persistFailed).toBe(false)
    expect(listener).toHaveBeenCalledTimes(2)
    expect(readRecord()).toBe('{"save":2}')

    // A later failure falls back to that stored record, not to the newest save.
    saveRecord('{"save":3}')
    expect(readRecord()).toBe('{"save":3}')
    await writesReach(backend, 3)
    backend.fail(2)
    expect(await flushSave()).toBe(false)
    expect(readRecord()).toBe('{"save":2}')
    expect(listener).toHaveBeenCalledTimes(3)
    unsubscribe()
  })

  it('a save waiting behind a write that fails is written next, without another save', async () => {
    const backend = useControlled()
    saveRecord('{"save":1}')
    await writesReach(backend, 1)
    backend.settle(0)
    expect(await flushSave()).toBe(true)

    const seen: boolean[] = []
    const unsubscribe = subscribeSaveStatus(() => seen.push(getSaveStatus().persistFailed))
    saveRecord('{"save":2}') // A, in flight
    await writesReach(backend, 2)
    saveRecord('{"save":3}') // B, waiting behind it
    backend.fail(1)
    await writesReach(backend, 3)
    expect(backend.writes[2]).toBe('{"save":3}')
    // Between A failing and B landing, reads fall back to the last stored record.
    expect(getSaveStatus().persistFailed).toBe(true)
    expect(readRecord()).toBe('{"save":1}')

    backend.settle(2)
    expect(await flushSave()).toBe(true)
    expect(seen).toEqual([true, false])
    expect(readRecord()).toBe('{"save":3}')
    expect(backend.stored).toBe('{"save":3}')
    unsubscribe()
  })

  it('removeRecord during a write leaves no save', async () => {
    const backend = useControlled()
    saveRecord('{"life":1}')
    await writesReach(backend, 1)
    removeRecord()
    expect(readRecord()).toBeNull()
    backend.settle(0)
    expect(await flushSave()).toBe(true)
    expect(backend.stored).toBeNull()
    expect(readRecord()).toBeNull()
  })

  it('removeRecord drops a save waiting behind the write in flight', async () => {
    const backend = useControlled()
    saveRecord('{"life":1,"age":1}')
    await writesReach(backend, 1)
    saveRecord('{"life":1,"age":2}') // waits behind the write in flight
    removeRecord()
    backend.settle(0)
    expect(await flushSave()).toBe(true)
    // The removal ran after the write in flight, and the save that was waiting never went out.
    expect(backend.writes).toEqual(['{"life":1,"age":1}'])
    expect(backend.stored).toBeNull()
    expect(readRecord()).toBeNull()
  })

  it('a save made after removeRecord is written after the removal', async () => {
    const backend = useControlled()
    saveRecord('{"life":1}')
    await writesReach(backend, 1)
    removeRecord() // the life is abandoned...
    saveRecord('{"life":2}') // ...and a new one begins
    backend.settle(0)
    await writesReach(backend, 2)
    // The removal ran between the write in flight and the new life's write.
    expect(backend.stored).toBeNull()
    expect(backend.writes).toEqual(['{"life":1}', '{"life":2}'])
    backend.settle(1)
    expect(await flushSave()).toBe(true)
    expect(backend.stored).toBe('{"life":2}')
    expect(readRecord()).toBe('{"life":2}')
  })

  it('a write that lands after removeRecord is forgotten: a later failure falls back to no save, not to the removed one', async () => {
    const backend = useControlled()
    saveRecord('{"life":1}')
    await writesReach(backend, 1)
    removeRecord()
    backend.settle(0)
    expect(await flushSave()).toBe(true)

    saveRecord('{"life":2}')
    await writesReach(backend, 2)
    backend.fail(1)
    expect(await flushSave()).toBe(false)
    expect(backend.stored).toBeNull()
    expect(readRecord()).toBeNull()
  })

  it('a listener that throws neither stops the queue nor passes for a failed write', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const backend = useControlled()
    const unsubscribe = subscribeSaveStatus(() => {
      throw new Error('broken listener')
    })
    saveRecord('{"save":1}')
    await writesReach(backend, 1)
    backend.fail(0)
    expect(await flushSave()).toBe(false)

    saveRecord('{"save":2}')
    await writesReach(backend, 2)
    backend.settle(1)
    expect(await flushSave()).toBe(true)
    expect(getSaveStatus().persistFailed).toBe(false)
    expect(backend.stored).toBe('{"save":2}')
    expect(error).toHaveBeenCalledTimes(2)
    unsubscribe()
  })

  it('removeRecord with nothing in flight removes the stored record', async () => {
    const backend = useControlled('{"life":1}')
    removeRecord()
    expect(await flushSave()).toBe(true)
    expect(backend.stored).toBeNull()
  })

  it('a write that removeRecord discarded raises no warning when it fails, and removeRecord takes an earlier warning down', async () => {
    const backend = useControlled()
    saveRecord('{"life":1}')
    await writesReach(backend, 1)
    removeRecord()
    backend.fail(0)
    expect(await flushSave()).toBe(true)
    expect(getSaveStatus().persistFailed).toBe(false)

    saveRecord('{"life":2}')
    await writesReach(backend, 2)
    backend.fail(1)
    expect(await flushSave()).toBe(false)
    // The life whose save failed is abandoned: there is no save left to warn about.
    removeRecord()
    expect(getSaveStatus().persistFailed).toBe(false)
    expect(await flushSave()).toBe(true)
  })

  it('records of 100,000 characters or more are stored as gz2 and round-trip', async () => {
    const backend = useControlled()
    const ofLength = (n: number) => JSON.stringify({ text: 'x'.repeat(n - '{"text":""}'.length) })
    const big = ofLength(100_000)
    expect(big).toHaveLength(100_000)
    saveRecord(big)
    expect(await settleAll(backend)).toBe(true)
    expect(backend.writes[0]).toMatch(/^gz2:/)
    expect(await decodeSnapshotRecord(backend.writes[0])).toBe(big)
    expect(readRecord()).toBe(big)

    const below = ofLength(99_999)
    saveRecord(below)
    expect(await settleAll(backend)).toBe(true)
    expect(backend.writes[1]).toBe(below)

    saveRecord('{"a":1}')
    expect(await settleAll(backend)).toBe(true)
    expect(backend.writes[2]).toBe('{"a":1}')
  })
})

describe('a protected newer record', () => {
  it('a protected newer record is copied before the first write, and fails closed without room', async () => {
    // Copied, byte-exact, before the first write.
    const backend = useControlled(newer)
    protectNewerRecord(newer, 3)
    const copy = vi.spyOn(storage, 'setItem')
    const write = vi.spyOn(backend, 'write')
    expect(saveRecord('{"life":2}')).toBe(true)
    await writesReach(backend, 1)
    expect(getSaveStatus().notices).toStrictEqual([{ id: SLOT_1, kind: 'newer', bytes: newer.length, version: 3 }])
    expect(await readSaveCopy(getSaveStatus().notices[0].id)).toBe(newer)
    expect(copy.mock.invocationCallOrder[0]).toBeLessThan(write.mock.invocationCallOrder[0])
    backend.settle(0)
    expect(await flushSave()).toBe(true)
    expect(backend.stored).toBe('{"life":2}')
    // The copy is made once: later saves just write.
    saveRecord('{"life":2,"age":1}')
    expect(await settleAll(backend)).toBe(true)
    expect(storage.data.has(SLOT_2)).toBe(false)

    // With five copies kept already there is no room: no write, and the warning shows.
    resetSaveStoreForTests()
    storage = memoryLocalStorage()
    vi.stubGlobal('localStorage', storage)
    const crowded = useControlled(newer)
    await fillQuarantine(crowded)
    protectNewerRecord(newer, 3)
    const listener = vi.fn()
    const unsubscribe = subscribeSaveStatus(listener)
    expect(saveRecord('{"life":2}')).toBe(true)
    expect(await flushSave()).toBe(false)
    expect(crowded.writes).toEqual([])
    expect(crowded.stored).toBe(newer)
    expect(getSaveStatus().persistFailed).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(readRecord()).toBeNull()
    // Each retry tries the copy again, and fails closed again.
    saveRecord('{"life":2,"age":1}')
    expect(await flushSave()).toBe(false)
    expect(crowded.writes).toEqual([])
    unsubscribe()

    // removeRecord() leaves it where it is.
    removeRecord()
    expect(await flushSave()).toBe(true)
    expect(crowded.stored).toBe(newer)
    expect(crowded.writes).toEqual([])
  })

  it('makes the copy and the write once a copy is deleted to make room', async () => {
    storage.data.set(SLOT_1, 'copy 1')
    storage.data.set(SLOT_2, 'copy 2')
    storage.data.set(SLOT_3, 'copy 3')
    const memory = memorySaveBackend(newer)
    setSaveBackend(memory)
    protectNewerRecord(newer, 3)
    saveRecord('{"life":2}')
    expect(await flushSave()).toBe(false)
    expect(memory.read()).toBe(newer)

    await deleteSaveCopy(SLOT_2)
    saveRecord('{"life":2,"age":1}')
    expect(await flushSave()).toBe(true)
    expect(storage.data.get(SLOT_2)).toBe(newer)
    expect(memory.read()).toBe('{"life":2,"age":1}')
    expect(getSaveStatus().persistFailed).toBe(false)
  })

  it('on a synchronous backend, the first save also waits for the copy', async () => {
    const memory = memorySaveBackend(newer)
    setSaveBackend(memory)
    protectNewerRecord(newer, 3)
    expect(saveRecord('{"life":2}')).toBe(true)
    expect(memory.read()).toBe(newer)
    expect(await flushSave()).toBe(true)
    expect(storage.data.get(SLOT_1)).toBe(newer)
    expect(memory.read()).toBe('{"life":2}')

    // From then on a save is written inside the call again.
    expect(saveRecord('{"life":2,"age":1}')).toBe(true)
    expect(memory.read()).toBe('{"life":2,"age":1}')
  })

  it('is left alone by removeRecord on a synchronous backend too', () => {
    const memory = memorySaveBackend(newer)
    setSaveBackend(memory)
    protectNewerRecord(newer, 3)
    removeRecord()
    expect(memory.read()).toBe(newer)
  })

  it('removeRecord while the copy is being made keeps the copy and the newer record, and writes nothing', async () => {
    const backend = useControlled(newer)
    const open = holdCopies(backend)
    protectNewerRecord(newer, 3)
    saveRecord('{"life":2}')
    await tick()
    removeRecord()
    open()
    expect(await flushSave()).toBe(true)
    expect(backend.writes).toEqual([])
    expect(backend.stored).toBe(newer)
    expect(storage.data.get(SLOT_1)).toBe(newer)
    expect(getSaveStatus()).toStrictEqual({
      notices: [{ id: SLOT_1, kind: 'newer', bytes: newer.length, version: 3 }],
      persistFailed: false,
    })

    // The copy is safe, so the next life's save writes over the main slot as usual.
    saveRecord('{"life":3}')
    expect(await settleAll(backend)).toBe(true)
    expect(backend.stored).toBe('{"life":3}')
    expect(storage.data.has(SLOT_2)).toBe(false)
  })

  it('removeRecord while a copy that finds no room is being made raises no warning', async () => {
    const backend = useControlled(newer)
    await fillQuarantine(backend)
    const open = holdCopies(backend)
    protectNewerRecord(newer, 3)
    saveRecord('{"life":2}')
    await tick()
    removeRecord()
    open()
    expect(await flushSave()).toBe(true)
    expect(getSaveStatus().persistFailed).toBe(false)
    expect(backend.stored).toBe(newer)
    expect(backend.writes).toEqual([])
  })

  it('a save made while an earlier one is still queued is written after it, on a synchronous backend too', async () => {
    const memory = memorySaveBackend(newer)
    setSaveBackend(memory)
    protectNewerRecord(newer, 3)
    // Saving again the moment the copy is listed, before the first save has been written.
    const unsubscribe = subscribeSaveStatus(() => {
      if (memory.read() === newer) saveRecord('{"life":2,"age":1}')
    })
    saveRecord('{"life":2}')
    expect(await flushSave()).toBe(true)
    unsubscribe()
    expect(memory.read()).toBe('{"life":2,"age":1}')
  })
})

describe('a storage step that never answers', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  /** Lets the queue run as far as it can without fake time moving (the backend answers in microtasks). */
  const run = () => vi.advanceTimersByTimeAsync(0)

  it('a write that hangs raises the warning after STORE_OP_TIMEOUT_MS, and the queue carries on when it lands', async () => {
    const backend = useControlled()
    // A stored save to fall back to. Its watchdog went when the write landed.
    saveRecord('{"save":1}')
    await run()
    backend.settle(0)
    expect(await flushSave()).toBe(true)
    expect(vi.getTimerCount()).toBe(0)

    const listener = vi.fn()
    const unsubscribe = subscribeSaveStatus(listener)
    saveRecord('{"save":2}')
    await run()
    expect(backend.writes).toHaveLength(2)
    let flushed: boolean | undefined
    void flushSave().then((ok) => {
      flushed = ok
    })
    await vi.advanceTimersByTimeAsync(STORE_OP_TIMEOUT_MS - 1)
    expect(getSaveStatus().persistFailed).toBe(false)
    expect(flushed).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1)
    expect(getSaveStatus().persistFailed).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(flushed).toBe(false)
    // While it still hangs, a flush answers at once, and reads fall back to the last stored record.
    expect(await flushSave()).toBe(false)
    expect(readRecord()).toBe('{"save":1}')

    // A save made during the hang is taken, and waits: no second write starts.
    expect(saveRecord('{"save":3}')).toBe(true)
    await vi.advanceTimersByTimeAsync(STORE_OP_TIMEOUT_MS)
    expect(backend.writes).toEqual(['{"save":1}', '{"save":2}'])
    expect(listener).toHaveBeenCalledTimes(1)

    // The hung write lands at last: the newest save is written next, and the warning goes.
    backend.settle(1)
    await run()
    expect(backend.writes).toEqual(['{"save":1}', '{"save":2}', '{"save":3}'])
    backend.settle(2)
    expect(await flushSave()).toBe(true)
    expect(getSaveStatus().persistFailed).toBe(false)
    expect(listener).toHaveBeenCalledTimes(2)
    expect(readRecord()).toBe('{"save":3}')
    expect(backend.stored).toBe('{"save":3}')
    expect(vi.getTimerCount()).toBe(0)
    unsubscribe()
  })

  it('a hung write that fails late takes the usual failure path, and the queue carries on', async () => {
    const backend = useControlled()
    const listener = vi.fn()
    const unsubscribe = subscribeSaveStatus(listener)
    saveRecord('{"save":1}')
    await run()
    await vi.advanceTimersByTimeAsync(STORE_OP_TIMEOUT_MS)
    expect(listener).toHaveBeenCalledTimes(1)
    saveRecord('{"save":2}')
    backend.fail(0)
    await run()
    // Still failed, and not announced twice; the waiting save went out next.
    expect(getSaveStatus().persistFailed).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(backend.writes).toEqual(['{"save":1}', '{"save":2}'])
    backend.settle(1)
    expect(await flushSave()).toBe(true)
    expect(getSaveStatus().persistFailed).toBe(false)
    expect(listener).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
    unsubscribe()
  })

  it("a newer record's copy that hangs raises the warning the same way, and the saves go through when it lands", async () => {
    const backend = useControlled(newer)
    const open = holdCopies(backend)
    protectNewerRecord(newer, 3)
    const listener = vi.fn()
    const unsubscribe = subscribeSaveStatus(listener)
    expect(saveRecord('{"life":2}')).toBe(true)
    await run()
    await vi.advanceTimersByTimeAsync(STORE_OP_TIMEOUT_MS)
    expect(getSaveStatus().persistFailed).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(await flushSave()).toBe(false)
    expect(readRecord()).toBeNull()

    expect(saveRecord('{"life":2,"age":1}')).toBe(true)
    await vi.advanceTimersByTimeAsync(STORE_OP_TIMEOUT_MS)
    expect(backend.writes).toEqual([])
    expect(backend.stored).toBe(newer)
    expect(listener).toHaveBeenCalledTimes(1)

    // The copy is made at last: the save it held back is written, then the newest one.
    open()
    await run()
    expect(storage.data.get(SLOT_1)).toBe(newer)
    expect(backend.writes).toEqual(['{"life":2}'])
    backend.settle(0)
    await run()
    expect(backend.writes).toEqual(['{"life":2}', '{"life":2,"age":1}'])
    backend.settle(1)
    expect(await flushSave()).toBe(true)
    expect(getSaveStatus().persistFailed).toBe(false)
    expect(backend.stored).toBe('{"life":2,"age":1}')
    expect(vi.getTimerCount()).toBe(0)
    unsubscribe()
  })

  it('an encoding that hangs raises the warning too, and nothing is written meanwhile', async () => {
    // A gzip stream that takes its first chunk and never answers.
    vi.stubGlobal(
      'CompressionStream',
      class extends TransformStream<Uint8Array, Uint8Array> {
        constructor() {
          super({ transform: () => new Promise<void>(() => undefined) })
        }
      },
    )
    const backend = useControlled()
    saveRecord(JSON.stringify({ text: 'x'.repeat(100_000) }))
    await run()
    await vi.advanceTimersByTimeAsync(STORE_OP_TIMEOUT_MS)
    expect(getSaveStatus().persistFailed).toBe(true)
    expect(await flushSave()).toBe(false)
    expect(saveRecord('{"a":1}')).toBe(true)
    await run()
    expect(backend.writes).toEqual([])
  })

  it('a removal that hangs raises the warning, and takes it down when it lands', async () => {
    const backend = useControlled('{"life":1}')
    let land: () => void = () => undefined
    backend.remove = () =>
      new Promise<void>((resolve) => {
        land = () => {
          backend.stored = null
          resolve()
        }
      })
    removeRecord()
    await run()
    await vi.advanceTimersByTimeAsync(STORE_OP_TIMEOUT_MS)
    expect(getSaveStatus().persistFailed).toBe(true)
    expect(await flushSave()).toBe(false)
    expect(readRecord()).toBeNull()

    land()
    await run()
    expect(await flushSave()).toBe(true)
    expect(getSaveStatus().persistFailed).toBe(false)
    expect(backend.stored).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('resetSaveStoreForTests clears a running watchdog, and answers the flush waiting on it', async () => {
    const backend = useControlled()
    saveRecord('{"save":1}')
    await run()
    expect(backend.writes).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(1)
    const flushed = flushSave()
    resetSaveStoreForTests()
    expect(vi.getTimerCount()).toBe(0)
    expect(await flushed).toBe(false)
  })
})

describe('the copies', () => {
  it('readSaveCopy(SAVE_KEY) reads the main slot as stored, and deleteSaveCopy(SAVE_KEY) never removes it', async () => {
    storage.data.set(SAVE_KEY, 'main')
    storage.data.set(SLOT_1, 'copy')
    expect(await readSaveCopy(SAVE_KEY)).toBe('main')
    expect(await readSaveCopy(SLOT_1)).toBe('copy')
    await deleteSaveCopy(SAVE_KEY)
    expect(storage.data.get(SAVE_KEY)).toBe('main')

    const backend = useControlled('gz2:kept as stored')
    expect(await readSaveCopy(SAVE_KEY)).toBe('gz2:kept as stored')
    await deleteSaveCopy(SAVE_KEY)
    expect(backend.stored).toBe('gz2:kept as stored')
  })

  it('deleteSaveCopy removes the copy and its notice, and keeps the notice when the copy stays', async () => {
    setSaveBackend(memorySaveBackend(newer))
    protectNewerRecord(newer, 3)
    saveRecord('{"life":2}')
    expect(await flushSave()).toBe(true)
    const [notice] = getSaveStatus().notices
    expect(notice.id).toBe(SLOT_1)

    // A refused removal keeps both, and so does one whose read-back is refused as well.
    const refuseRemoval = vi.spyOn(storage, 'removeItem').mockImplementation(denied)
    await deleteSaveCopy(notice.id)
    expect(storage.data.get(SLOT_1)).toBe(newer)
    expect(getSaveStatus().notices).toEqual([notice])
    const refuseRead = vi.spyOn(storage, 'getItem').mockImplementation(denied)
    await deleteSaveCopy(notice.id)
    expect(storage.data.get(SLOT_1)).toBe(newer)
    expect(getSaveStatus().notices).toEqual([notice])
    refuseRemoval.mockRestore()
    refuseRead.mockRestore()

    const listener = vi.fn()
    const unsubscribe = subscribeSaveStatus(listener)
    await deleteSaveCopy(notice.id)
    expect(storage.data.has(SLOT_1)).toBe(false)
    expect(getSaveStatus().notices).toEqual([])
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it("deleteSaveCopy keeps an overflow copy's notice until the overflow confirms the copy is gone", async () => {
    for (const [n, slot] of QUARANTINE_SLOTS.entries()) storage.data.set(slot, `copy ${n + 1}`)
    const backend = useControlled(newer)
    protectNewerRecord(newer, 3)
    saveRecord('{"life":2}')
    expect(await settleAll(backend)).toBe(true)
    const [notice] = getSaveStatus().notices
    expect(notice.id).toBe('bad-1')

    const { get, remove } = backend.overflow
    const gone = () => Promise.reject(new Error('IndexedDB is gone'))
    backend.overflow.remove = gone
    backend.overflow.get = gone
    await deleteSaveCopy('bad-1')
    expect(getSaveStatus().notices).toEqual([notice])
    backend.overflow.get = get
    await deleteSaveCopy('bad-1')
    expect(await backend.overflow.get('bad-1')).toBe(newer)
    expect(getSaveStatus().notices).toEqual([notice])

    backend.overflow.remove = remove
    await deleteSaveCopy('bad-1')
    expect(await backend.overflow.get('bad-1')).toBeNull()
    expect(getSaveStatus().notices).toEqual([])
  })

  it('nothing throws or rejects when storage fails', async () => {
    vi.stubGlobal('localStorage', disabledStorage())
    expect(readRecord()).toBeNull()
    await expect(readSaveCopy(SAVE_KEY)).resolves.toBeNull()
    await expect(readSaveCopy(SLOT_1)).resolves.toBeNull()
    await expect(deleteSaveCopy(SLOT_1)).resolves.toBeUndefined()
    expect(() => removeRecord()).not.toThrow()

    const gone = () => Promise.reject(new Error('IndexedDB is gone'))
    const broken: AsyncSaveBackend = {
      kind: 'async',
      name: 'idb',
      read: gone,
      write: gone,
      remove: gone,
      overflow: { put: gone, get: gone, keys: gone, remove: gone },
    }
    setSaveBackend(broken)
    await expect(readSaveCopy(SAVE_KEY)).resolves.toBeNull()
    await expect(readSaveCopy('bad-1')).resolves.toBeNull()
    await expect(deleteSaveCopy('bad-1')).resolves.toBeUndefined()
    // A refused write and a refused removal are answered, never left as unhandled rejections.
    expect(saveRecord('{}')).toBe(true)
    expect(await flushSave()).toBe(false)
    removeRecord()
    expect(await flushSave()).toBe(true)
  })
})

describe('the save.ts facade', () => {
  const fixture = gunzipSync(readFileSync('test/fixtures/save-v1.json.gz')).toString()

  it('loads the v2.4.0 save from localStorage, migrated to the current schema', () => {
    storage.data.set(SAVE_KEY, fixture)
    expect(save.loadGame()?.schemaVersion).toBe(SAVE_SCHEMA)
  })

  it('loads nothing from a save with schemaVersion 3, and leaves it as it is', () => {
    const fromLater = JSON.stringify({ ...(JSON.parse(fixture) as Record<string, unknown>), schemaVersion: 3 })
    storage.data.set(SAVE_KEY, fromLater)
    expect(save.loadGame()).toBeNull()
    expect(storage.data.get(SAVE_KEY)).toBe(fromLater)
  })

  it('with localStorage disabled, saveGame is false and the warning shows', () => {
    vi.stubGlobal('localStorage', disabledStorage())
    expect(save.saveGame(JSON.parse(fixture) as GameState)).toBe(false)
    const status: save.SaveStatus = save.getSaveStatus()
    expect(status.persistFailed).toBe(true)
  })

  it("gives the main save the room the Time Machine's localStorage snapshots take", () => {
    const snapshot = 'anotherlife.tm.l|life|0.abc'
    storage.data.set(snapshot, 'x'.repeat(100))
    const setItem = storage.setItem
    vi.spyOn(storage, 'setItem').mockImplementation((key, value) => {
      // Full until that room is given back.
      if (key === SAVE_KEY && storage.data.has(snapshot)) throw full()
      setItem(key, value)
    })
    const game = JSON.parse(fixture) as GameState
    expect(save.saveGame(game)).toBe(true)
    expect(storage.data.has(snapshot)).toBe(false)
    expect(storage.data.get(SAVE_KEY)).toBe(JSON.stringify(game))
  })

  it('saveGame is false, and writes nothing, when the game cannot be turned into JSON', () => {
    const game = JSON.parse(fixture) as GameState
    Object.assign(game.flags, { big: 1n })
    expect(save.saveGame(game)).toBe(false)
    expect(storage.data.has(SAVE_KEY)).toBe(false)
  })

  it('re-exports the status and copy functions of the store', () => {
    expect(save.flushSave).toBe(flushSave)
    expect(save.getSaveStatus).toBe(getSaveStatus)
    expect(save.subscribeSaveStatus).toBe(subscribeSaveStatus)
    expect(save.readSaveCopy).toBe(readSaveCopy)
    expect(save.deleteSaveCopy).toBe(deleteSaveCopy)
    const notices: readonly save.SaveNotice[] = save.getSaveStatus().notices
    expect(notices).toEqual([])
  })
})
