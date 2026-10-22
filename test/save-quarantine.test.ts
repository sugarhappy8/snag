// Byte-exact quarantine: copies of records the game couldn't load, kept in three localStorage slots
// and, when IndexedDB is open, two more in its `quarantine` store. The slots are in the global
// localStorage (a memory one here) whichever backend holds the main save; IndexedDB is the kit's fake.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { idbSaveBackend, localSaveBackend, memorySaveBackend, SAVE_KEY } from '../src/game/save-backends'
import type { AsyncSaveBackend, SaveBackend, SyncSaveBackend } from '../src/game/save-backends'
import {
  deleteQuarantine,
  QUARANTINE_MAX,
  QUARANTINE_SLOTS,
  quarantineRecord,
  readQuarantine,
  replaceQuarantine,
  scanQuarantine,
} from '../src/game/save-quarantine'
import type { SaveNotice, SaveNoticeKind } from '../src/game/save-quarantine'
import { fakeIndexedDb, memoryLocalStorage } from './save-kit'

afterEach(() => {
  vi.unstubAllGlobals()
})

const [SLOT_1, SLOT_2, SLOT_3] = QUARANTINE_SLOTS

type Memory = ReturnType<typeof memoryLocalStorage>

/** A fresh localStorage in memory, installed as the global the slots live in. */
function installStorage(initial: Record<string, string> = {}): Memory {
  const storage = memoryLocalStorage(initial)
  vi.stubGlobal('localStorage', storage)
  return storage
}

const openIdb = (opts?: Parameters<typeof fakeIndexedDb>[0]) => idbSaveBackend(fakeIndexedDb(opts))

/** The two synchronous backends: both keep their copies in the same slots, and neither has an overflow. */
const syncBackends: [string, () => SyncSaveBackend][] = [
  ['local', () => localSaveBackend()],
  ['memory', () => memorySaveBackend()],
]

/** What a browser throws when localStorage is full, and when it is off limits. */
const full = () => new DOMException('The quota has been exceeded.', 'QuotaExceededError')
const denied = () => new DOMException('Access denied', 'SecurityError')

/** Makes `count` copies in turn, "copy 1" to "copy <count>", and hands back what each one returned. */
async function keep(backend: SaveBackend, count: number): Promise<(SaveNotice | null)[]> {
  const notices: (SaveNotice | null)[] = []
  for (let n = 1; n <= count; n++) notices.push(await quarantineRecord(backend, `copy ${n}`, 'damaged'))
  return notices
}

/** Every copy kept right now, slot by slot and key by key, to compare before and after. */
async function everything(storage: Memory, backend: SaveBackend) {
  const overflow: Record<string, string | null> = {}
  if (backend.kind === 'async') for (const key of await backend.overflow.keys()) overflow[key] = await backend.overflow.get(key)
  return { slots: Object.fromEntries(storage.data), overflow }
}

/**
 * Notes every write that lands on a key already holding a copy, in localStorage and in the overflow
 * store: a copy being overwritten. Use the backend it returns; `overwrites` is empty if none was.
 */
function watchOverwrites(storage: Memory, idb: AsyncSaveBackend) {
  const overwrites: string[] = []
  const setItem = storage.setItem
  vi.spyOn(storage, 'setItem').mockImplementation((key, value) => {
    if (storage.data.has(key)) overwrites.push(key)
    setItem(key, value)
  })
  const backend: AsyncSaveBackend = {
    ...idb,
    overflow: {
      ...idb.overflow,
      put: async (key, record) => {
        if ((await idb.overflow.get(key)) !== null) overwrites.push(key)
        await idb.overflow.put(key, record)
      },
    },
  }
  return { backend, overwrites }
}

/** The same backend, but every call to its overflow store fails, as IndexedDB's can once the database is gone. */
function withBrokenOverflow(backend: AsyncSaveBackend): AsyncSaveBackend {
  const gone = () => Promise.reject(new Error('IndexedDB is gone'))
  return { ...backend, overflow: { put: gone, get: gone, keys: gone, remove: gone } }
}

const asDamaged = async (): Promise<{ kind: SaveNoticeKind }> => ({ kind: 'damaged' })

it('names the three slots, and caps the copies at five', () => {
  expect(QUARANTINE_SLOTS).toEqual(['anotherlife.save.v1.bad', 'anotherlife.save.v1.bad.2', 'anotherlife.save.v1.bad.3'])
  expect(QUARANTINE_MAX).toBe(5)
})

describe('quarantineRecord', () => {
  it('keeps the first three copies byte-exact in the three slots, in order', async () => {
    const storage = installStorage()
    const backend = localSaveBackend()
    // Text a tidy-up would change: a cut-off record, non-ASCII with a CRLF, bare whitespace with a NUL.
    const raws = ['{"life":{"age":4', 'gz2:café 😀\r\n', ' \t\u0000 ']

    const first = await quarantineRecord(backend, raws[0], 'damaged')
    const second = await quarantineRecord(backend, raws[1], 'newer', 3)
    const third = await quarantineRecord(backend, raws[2], 'tooOld', 0)

    expect(Object.fromEntries(storage.data)).toEqual({ [SLOT_1]: raws[0], [SLOT_2]: raws[1], [SLOT_3]: raws[2] })
    expect(first).toStrictEqual({ id: SLOT_1, kind: 'damaged', bytes: raws[0].length })
    expect(second).toStrictEqual({ id: SLOT_2, kind: 'newer', bytes: raws[1].length, version: 3 })
    expect(third).toStrictEqual({ id: SLOT_3, kind: 'tooOld', bytes: raws[2].length, version: 0 })
  })

  it('counts an empty copy as a copy: the next one goes to the next slot', async () => {
    const storage = installStorage()
    const backend = localSaveBackend()
    expect(await quarantineRecord(backend, '', 'damaged')).toStrictEqual({ id: SLOT_1, kind: 'damaged', bytes: 0 })
    expect(await quarantineRecord(backend, 'next', 'damaged')).toStrictEqual({ id: SLOT_2, kind: 'damaged', bytes: 4 })
    expect(Object.fromEntries(storage.data)).toEqual({ [SLOT_1]: '', [SLOT_2]: 'next' })
  })

  it('sends copies four and five to overflow as bad-1 and bad-2, and refuses the sixth without changing anything', async () => {
    const storage = installStorage()
    const backend = await openIdb()

    const notices = await keep(backend, 5)
    expect(notices.map((notice) => notice?.id)).toEqual([SLOT_1, SLOT_2, SLOT_3, 'bad-1', 'bad-2'])
    expect(await everything(storage, backend)).toEqual({
      slots: { [SLOT_1]: 'copy 1', [SLOT_2]: 'copy 2', [SLOT_3]: 'copy 3' },
      overflow: { 'bad-1': 'copy 4', 'bad-2': 'copy 5' },
    })

    const before = await everything(storage, backend)
    expect(await quarantineRecord(backend, 'copy 6', 'damaged')).toBeNull()
    expect(await everything(storage, backend)).toEqual(before)
  })

  it.each(syncBackends)('refuses the fourth copy on a %s backend, which has no overflow', async (_name, make) => {
    const storage = installStorage()
    const backend = make()
    expect((await keep(backend, 3)).every((notice) => notice !== null)).toBe(true)

    const before = await everything(storage, backend)
    expect(await quarantineRecord(backend, 'copy 4', 'damaged')).toBeNull()
    expect(await everything(storage, backend)).toEqual(before)
  })

  it('falls through to overflow when a slot refuses the write', async () => {
    const storage = installStorage()
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw full()
    })
    const backend = await openIdb()

    expect(await quarantineRecord(backend, 'raw', 'damaged')).toStrictEqual({ id: 'bad-1', kind: 'damaged', bytes: 3 })
    expect(await everything(storage, backend)).toEqual({ slots: {}, overflow: { 'bad-1': 'raw' } })
  })

  it.each(syncBackends)('returns null when a slot refuses the write and there is no overflow (%s backend)', async (_name, make) => {
    const storage = installStorage()
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw full()
    })
    expect(await quarantineRecord(make(), 'raw', 'damaged')).toBeNull()
    expect(storage.data.size).toBe(0)
  })

  it('puts the next copy in the slot that was freed, leaves the other slots as they are, and overwrites nothing', async () => {
    const storage = installStorage()
    const { backend, overwrites } = watchOverwrites(storage, await openIdb())
    await keep(backend, 5)

    await deleteQuarantine(backend, SLOT_2)
    expect(await quarantineRecord(backend, 'copy 6', 'stale')).toStrictEqual({ id: SLOT_2, kind: 'stale', bytes: 6 })
    expect(await everything(storage, backend)).toEqual({
      slots: { [SLOT_1]: 'copy 1', [SLOT_2]: 'copy 6', [SLOT_3]: 'copy 3' },
      overflow: { 'bad-1': 'copy 4', 'bad-2': 'copy 5' },
    })

    expect(await quarantineRecord(backend, 'copy 7', 'damaged')).toBeNull()
    expect(overwrites).toEqual([])
  })

  it('reuses the smallest overflow key that is free, never one in use', async () => {
    const storage = installStorage()
    const { backend, overwrites } = watchOverwrites(storage, await openIdb())
    await keep(backend, 5)

    // One copy is kept under bad-2, so the next must not be numbered by how many there are.
    await deleteQuarantine(backend, 'bad-1')
    expect(await quarantineRecord(backend, 'copy 6', 'damaged')).toStrictEqual({ id: 'bad-1', kind: 'damaged', bytes: 6 })
    expect(await everything(storage, backend)).toEqual({
      slots: { [SLOT_1]: 'copy 1', [SLOT_2]: 'copy 2', [SLOT_3]: 'copy 3' },
      overflow: { 'bad-1': 'copy 6', 'bad-2': 'copy 5' },
    })
    expect(overwrites).toEqual([])
  })

  it('counts overflow copies toward the five, even when a slot is free', async () => {
    installStorage()
    const backend = await openIdb()
    // Kept in an earlier session, when localStorage couldn't be used.
    for (let n = 1; n <= QUARANTINE_MAX; n++) await backend.overflow.put(`bad-${n}`, `copy ${n}`)

    expect(await quarantineRecord(backend, 'one too many', 'damaged')).toBeNull()
    expect(await backend.overflow.keys()).toEqual(['bad-1', 'bad-2', 'bad-3', 'bad-4', 'bad-5'])
  })

  it('keeps every copy when several are made at once, none taking the key of another', async () => {
    const storage = installStorage()
    const backend = await openIdb()
    const made = await Promise.all(Array.from({ length: 7 }, (_, i) => quarantineRecord(backend, `copy ${i + 1}`, 'damaged')))

    expect(made.map((notice) => notice?.id ?? null)).toEqual([SLOT_1, SLOT_2, SLOT_3, 'bad-1', 'bad-2', null, null])
    expect(await everything(storage, backend)).toEqual({
      slots: { [SLOT_1]: 'copy 1', [SLOT_2]: 'copy 2', [SLOT_3]: 'copy 3' },
      overflow: { 'bad-1': 'copy 4', 'bad-2': 'copy 5' },
    })
  })

  it('only copies: the record it is given stays where it is', async () => {
    const storage = installStorage({ [SAVE_KEY]: 'raw' })
    expect(await quarantineRecord(localSaveBackend(), 'raw', 'damaged')).not.toBeNull()
    expect(storage.data.get(SAVE_KEY)).toBe('raw')

    const idb = await openIdb()
    await idb.write('raw')
    expect(await quarantineRecord(idb, 'raw', 'damaged')).not.toBeNull()
    expect(await idb.read()).toBe('raw')
  })

  describe('a record that is kept already', () => {
    it('is not kept again: the notice is the existing copy, in a slot or in the overflow, and nothing is written', async () => {
      const storage = installStorage()
      const idb = await openIdb()
      const first = await quarantineRecord(idb, 'same record', 'stale')
      expect(first).toStrictEqual({ id: SLOT_1, kind: 'stale', bytes: 'same record'.length })
      const setItem = vi.spyOn(storage, 'setItem')
      expect(await quarantineRecord(idb, 'same record', 'stale')).toStrictEqual(first)
      expect(setItem).not.toHaveBeenCalled()
      expect(QUARANTINE_SLOTS.filter((slot) => storage.data.has(slot))).toEqual([SLOT_1])

      // Fill the slots, so that the next copy goes to the overflow: that one is not kept twice either.
      await quarantineRecord(idb, 'two', 'damaged')
      await quarantineRecord(idb, 'three', 'damaged')
      const overflow = await quarantineRecord(idb, 'four', 'damaged')
      expect(overflow).toStrictEqual({ id: 'bad-1', kind: 'damaged', bytes: 4 })
      expect(await quarantineRecord(idb, 'four', 'damaged')).toStrictEqual(overflow)
      expect(await idb.overflow.keys()).toEqual(['bad-1'])
    })

    it('still counts as kept when five other copies fill every place', async () => {
      installStorage()
      const idb = await openIdb()
      await keep(idb, 5)
      expect(await quarantineRecord(idb, 'copy 3', 'damaged')).toStrictEqual({ id: SLOT_3, kind: 'damaged', bytes: 'copy 3'.length })
      expect(await quarantineRecord(idb, 'a sixth', 'damaged')).toBeNull()
    })

    it('is the same for a synchronous backend', async () => {
      const storage = installStorage()
      const backend = localSaveBackend()
      await quarantineRecord(backend, 'x', 'damaged')
      await quarantineRecord(backend, 'x', 'damaged')
      expect([...storage.data.keys()]).toEqual([SLOT_1])
    })
  })

  describe('confirming a copy', () => {
    it('does not report a slot copy it can not read back the same, takes it out again, and tries overflow', async () => {
      const storage = installStorage()
      const setItem = storage.setItem
      // A storage that loses the last character of whatever it is given.
      vi.spyOn(storage, 'setItem').mockImplementation((key, value) => setItem(key, value.slice(0, -1)))

      expect(await quarantineRecord(localSaveBackend(), 'record', 'damaged')).toBeNull()
      expect(storage.data.size).toBe(0)

      const idb = await openIdb()
      expect(await quarantineRecord(idb, 'record', 'damaged')).toStrictEqual({ id: 'bad-1', kind: 'damaged', bytes: 6 })
      expect(await everything(storage, idb)).toEqual({ slots: {}, overflow: { 'bad-1': 'record' } })
    })

    it('does not report an overflow copy it can not read back the same, and takes it out again', async () => {
      installStorage()
      const backend = await openIdb({ corruptReadback: true })
      await keep(backend, 3)

      expect(await quarantineRecord(backend, 'copy 4', 'damaged')).toBeNull()
      expect(await backend.overflow.keys()).toEqual([])
    })

    it('does not report an overflow copy IndexedDB refuses, and leaves nothing behind', async () => {
      installStorage()
      const backend = await openIdb({ failWrite: true })
      await keep(backend, 3)

      expect(await quarantineRecord(backend, 'copy 4', 'damaged')).toBeNull()
      expect(await backend.overflow.keys()).toEqual([])
    })
  })

  describe('when storage fails', () => {
    it('writes to no slot it can not read, so a copy it can not see is never overwritten', async () => {
      const storage = installStorage()
      vi.spyOn(storage, 'getItem').mockImplementation(() => {
        throw denied()
      })
      const setItem = vi.spyOn(storage, 'setItem')
      const backend = await openIdb()

      expect(await quarantineRecord(backend, 'raw', 'damaged')).toStrictEqual({ id: 'bad-1', kind: 'damaged', bytes: 3 })
      expect(setItem).not.toHaveBeenCalled()
      expect(await quarantineRecord(localSaveBackend(), 'raw', 'damaged')).toBeNull()
      expect(setItem).not.toHaveBeenCalled()
    })

    it('keeps using the slots when the overflow store fails, and refuses what does not fit them', async () => {
      installStorage()
      const backend = withBrokenOverflow(await openIdb())

      expect((await keep(backend, 3)).map((notice) => notice?.id)).toEqual(QUARANTINE_SLOTS)
      expect(await quarantineRecord(backend, 'copy 4', 'damaged')).toBeNull()
    })

    it('does not write to the overflow when it can not tell which keys are in use', async () => {
      installStorage()
      const real = await openIdb()
      await keep(real, 5)
      const unlisted: AsyncSaveBackend = {
        ...real,
        overflow: { ...real.overflow, keys: () => Promise.reject(new Error('IndexedDB is gone')) },
      }

      expect(await quarantineRecord(unlisted, 'copy 6', 'damaged')).toBeNull()
      expect(await real.overflow.get('bad-1')).toBe('copy 4')
      expect(await real.overflow.get('bad-2')).toBe('copy 5')
    })

    it('does not throw when localStorage is missing altogether', async () => {
      vi.stubGlobal('localStorage', undefined)
      expect(await quarantineRecord(localSaveBackend(), 'raw', 'damaged')).toBeNull()
    })
  })
})

describe('readQuarantine', () => {
  it('returns the exact text of a slot copy and of an overflow copy', async () => {
    installStorage()
    const backend = await openIdb()
    const raws = ['first \r\n', 'gz2:é😀', ' ', '{"cut":', 'last\u0000']
    const ids: string[] = []
    for (const raw of raws) ids.push((await quarantineRecord(backend, raw, 'damaged'))?.id ?? 'refused')

    expect(ids).toEqual([SLOT_1, SLOT_2, SLOT_3, 'bad-1', 'bad-2'])
    expect(await Promise.all(ids.map((id) => readQuarantine(backend, id)))).toEqual(raws)
  })

  it('returns null for a copy that is not kept, and for an overflow id on a backend without overflow', async () => {
    installStorage()
    const idb = await openIdb()
    await keep(idb, 1)
    expect(await readQuarantine(idb, SLOT_2)).toBeNull()
    expect(await readQuarantine(idb, 'bad-1')).toBeNull()
    expect(await readQuarantine(idb, 'nonsense')).toBeNull()

    await idb.overflow.put('bad-1', 'kept')
    expect(await readQuarantine(localSaveBackend(), 'bad-1')).toBeNull()
  })

  it('never reads the main save, whatever id it is given', async () => {
    installStorage({ [SAVE_KEY]: 'main save' })
    const idb = await openIdb()
    await idb.write('main save')
    expect(await readQuarantine(idb, SAVE_KEY)).toBeNull()
    expect(await readQuarantine(localSaveBackend(), SAVE_KEY)).toBeNull()
  })

  it('returns null when storage fails', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw denied()
      },
    })
    expect(await readQuarantine(localSaveBackend(), SLOT_1)).toBeNull()
  })
})

describe('replaceQuarantine', () => {
  it('swaps the text of a slot copy and of an overflow copy, and says so', async () => {
    installStorage()
    const real = await openIdb()
    await keep(real, 4)
    expect(await replaceQuarantine(real, SLOT_2, 'whole game')).toBe(true)
    expect(await readQuarantine(real, SLOT_2)).toBe('whole game')
    expect(await replaceQuarantine(real, 'bad-1', 'whole game 2')).toBe(true)
    expect(await readQuarantine(real, 'bad-1')).toBe('whole game 2')
    // The others are untouched.
    expect(await readQuarantine(real, SLOT_1)).toBe('copy 1')
    expect(await readQuarantine(real, SLOT_3)).toBe('copy 3')
  })

  it('changes nothing, and says false, for a copy that is not kept, the main save, and an overflow id without overflow', async () => {
    const storage = installStorage({ [SAVE_KEY]: 'the save' })
    const backend = localSaveBackend()
    expect(await replaceQuarantine(backend, SLOT_1, 'x')).toBe(false)
    expect(await replaceQuarantine(backend, SAVE_KEY, 'x')).toBe(false)
    expect(await replaceQuarantine(backend, 'bad-1', 'x')).toBe(false)
    expect(Object.fromEntries(storage.data)).toEqual({ [SAVE_KEY]: 'the save' })
    const real = await openIdb()
    expect(await replaceQuarantine(real, 'bad-1', 'x')).toBe(false)
    expect(await real.overflow.keys()).toEqual([])
  })

  it('puts the old text back when the new one is refused or read back differently', async () => {
    const storage = installStorage()
    const backend = localSaveBackend()
    await keep(backend, 1)
    const set = storage.setItem.bind(storage)
    vi.spyOn(storage, 'setItem').mockImplementation((key: string, value: string) => {
      if (value === 'too big') throw full()
      if (value === 'garbled') set(key, 'something else')
      else set(key, value)
    })
    expect(await replaceQuarantine(backend, SLOT_1, 'too big')).toBe(false)
    expect(storage.data.get(SLOT_1)).toBe('copy 1')
    expect(await replaceQuarantine(backend, SLOT_1, 'garbled')).toBe(false)
    expect(storage.data.get(SLOT_1)).toBe('copy 1')

    installStorage()
    const real = await openIdb()
    await keep(real, 4)
    const put = real.overflow.put
    const flaky: AsyncSaveBackend = { ...real, overflow: { ...real.overflow, put: (key, record) => put(key, record === 'garbled' ? 'something else' : record) } }
    expect(await replaceQuarantine(flaky, 'bad-1', 'garbled')).toBe(false)
    expect(await real.overflow.get('bad-1')).toBe('copy 4')
  })
})

describe('deleteQuarantine', () => {
  it('removes exactly the copy it is given', async () => {
    const storage = installStorage()
    const backend = await openIdb()
    await keep(backend, 5)

    await deleteQuarantine(backend, SLOT_2)
    expect(await everything(storage, backend)).toEqual({
      slots: { [SLOT_1]: 'copy 1', [SLOT_3]: 'copy 3' },
      overflow: { 'bad-1': 'copy 4', 'bad-2': 'copy 5' },
    })

    await deleteQuarantine(backend, 'bad-1')
    expect(await everything(storage, backend)).toEqual({
      slots: { [SLOT_1]: 'copy 1', [SLOT_3]: 'copy 3' },
      overflow: { 'bad-2': 'copy 5' },
    })
  })

  it('removes a slot copy on a backend without overflow', async () => {
    const storage = installStorage()
    const backend = localSaveBackend()
    await keep(backend, 3)
    await deleteQuarantine(backend, SLOT_1)
    expect(Object.fromEntries(storage.data)).toEqual({ [SLOT_2]: 'copy 2', [SLOT_3]: 'copy 3' })
  })

  it('changes nothing for an id that is not a copy, and never touches the main save', async () => {
    const storage = installStorage({ [SAVE_KEY]: 'main save' })
    const backend = await openIdb()
    await backend.write('main save')
    await keep(backend, 5)
    const before = await everything(storage, backend)

    await deleteQuarantine(backend, SAVE_KEY)
    await deleteQuarantine(backend, 'bad-9')
    await deleteQuarantine(backend, 'nonsense')
    await deleteQuarantine(localSaveBackend(), 'bad-1')
    expect(await everything(storage, backend)).toEqual(before)
    expect(storage.data.get(SAVE_KEY)).toBe('main save')
    expect(await backend.read()).toBe('main save')
  })

  it('is a no-op, not an error, when localStorage refuses the removal', async () => {
    vi.stubGlobal('localStorage', {
      removeItem: () => {
        throw denied()
      },
    })
    await expect(deleteQuarantine(localSaveBackend(), SLOT_1)).resolves.toBeUndefined()
  })

  it('is a no-op, not an error, when the overflow store refuses the removal', async () => {
    installStorage()
    await expect(deleteQuarantine(withBrokenOverflow(await openIdb()), 'bad-1')).resolves.toBeUndefined()
  })
})

describe('scanQuarantine', () => {
  it('lists one notice per copy, slots then overflow keys, with the kind diagnose gives and the size of the stored text', async () => {
    installStorage()
    const backend = await openIdb()
    const texts = ['a', 'bb', 'ccc', 'dddd', 'eeeee']
    for (const text of texts) await quarantineRecord(backend, text, 'damaged')

    const diagnoses: Record<string, { kind: SaveNoticeKind; version?: number }> = {
      a: { kind: 'stale' },
      bb: { kind: 'newer', version: 9 },
      ccc: { kind: 'tooOld', version: 0 },
      dddd: { kind: 'damaged' },
      eeeee: { kind: 'newer', version: 3 },
    }
    const asked: string[] = []
    const notices = await scanQuarantine(backend, async (raw) => {
      asked.push(raw)
      return diagnoses[raw]
    })

    expect(notices).toStrictEqual([
      { id: SLOT_1, kind: 'stale', bytes: 1 },
      { id: SLOT_2, kind: 'newer', bytes: 2, version: 9 },
      { id: SLOT_3, kind: 'tooOld', bytes: 3, version: 0 },
      { id: 'bad-1', kind: 'damaged', bytes: 4 },
      { id: 'bad-2', kind: 'newer', bytes: 5, version: 3 },
    ])
    expect(asked).toEqual(texts)
  })

  it('hands each notice to onFound as it is made, before the overflow has answered', async () => {
    const storage = installStorage({ [SLOT_1]: 'garbage' })
    const idb = await openIdb()
    await idb.overflow.put('bad-1', 'more garbage')
    const found: string[] = []
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const keys = idb.overflow.keys
    idb.overflow.keys = async () => {
      await gate
      return keys()
    }
    const scanning = scanQuarantine(idb, asDamaged, (n) => found.push(n.id))
    for (let i = 0; i < 10; i++) await Promise.resolve()
    expect(found).toEqual([SLOT_1])
    release()
    expect((await scanning).map((n) => n.id)).toEqual([SLOT_1, 'bad-1'])
    expect(found).toEqual([SLOT_1, 'bad-1'])
    expect(storage.data.size).toBe(1)
  })

  it('skips empty slots, and takes the size from the text a slot holds', async () => {
    // Left by an earlier session: the notice is worked out from what is stored, not from what was reported then.
    installStorage({ [SLOT_1]: 'abc', [SLOT_3]: 'abcdefgh' })
    expect(await scanQuarantine(memorySaveBackend(), asDamaged)).toStrictEqual([
      { id: SLOT_1, kind: 'damaged', bytes: 3 },
      { id: SLOT_3, kind: 'damaged', bytes: 8 },
    ])
  })

  it('lists nothing, and asks nothing of diagnose, when no copy is kept', async () => {
    installStorage()
    const diagnose = vi.fn(asDamaged)
    expect(await scanQuarantine(await openIdb(), diagnose)).toEqual([])
    expect(diagnose).not.toHaveBeenCalled()
  })

  describe('when storage fails', () => {
    it('lists the slot copies when the overflow store fails', async () => {
      installStorage()
      const real = await openIdb()
      await keep(real, 5)
      const notices = await scanQuarantine(withBrokenOverflow(real), asDamaged)
      expect(notices.map((notice) => notice.id)).toEqual(QUARANTINE_SLOTS)
    })

    it('lists the other overflow copies when one can not be read', async () => {
      installStorage()
      const real = await openIdb()
      await keep(real, 5)
      const oneUnreadable: AsyncSaveBackend = {
        ...real,
        overflow: { ...real.overflow, get: (key) => (key === 'bad-1' ? Promise.reject(new Error('unreadable')) : real.overflow.get(key)) },
      }
      const notices = await scanQuarantine(oneUnreadable, asDamaged)
      expect(notices.map((notice) => notice.id)).toEqual([...QUARANTINE_SLOTS, 'bad-2'])
    })

    it('lists the overflow copies when localStorage can not be read, and nothing when there is no overflow', async () => {
      const storage = installStorage()
      const real = await openIdb()
      await keep(real, 5)
      vi.spyOn(storage, 'getItem').mockImplementation(() => {
        throw denied()
      })
      expect((await scanQuarantine(real, asDamaged)).map((notice) => notice.id)).toEqual(['bad-1', 'bad-2'])
      expect(await scanQuarantine(localSaveBackend(), asDamaged)).toEqual([])
    })
  })
})
