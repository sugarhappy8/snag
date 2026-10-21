// Boot: choosing where the save lives, importing the localStorage record of v4.0.2 into IndexedDB,
// and setting aside every record that can't be played (save-hydrate.ts). The storage is the kit's:
// a localStorage in memory and a fake IndexedDB that can fail, hang, answer late or corrupt a read.
import { readFileSync } from 'node:fs'
import { gzipSync, gunzipSync } from 'node:zlib'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ageUp } from '../src/game/aging'
import { createNewLife } from '../src/game/life'
import * as save from '../src/game/save'
import type { AsyncSaveBackend } from '../src/game/save-backends'
import { IDB_MARKER_KEY, idbMarked, idbSaveBackend, memorySaveBackend, SAVE_KEY } from '../src/game/save-backends'
import { diagnoseRecord, hydrateSaves, newerOf } from '../src/game/save-hydrate'
import { QUARANTINE_SLOTS } from '../src/game/save-quarantine'
import { isLoadableGame, migrateSave, SAVE_SCHEMA } from '../src/game/save-schema'
import {
  activeBackend,
  activeBackendName,
  addSaveNotice,
  deleteSaveCopy,
  flushSave,
  getSaveStatus,
  primeCache,
  readRecord,
  readSaveCopy,
  resetSaveStoreForTests,
  savedThisSession,
  saveRecord,
  setSaveBackend,
} from '../src/game/save-store'
import { decodeSnapshotRecord, encodeSnapshotRecord } from '../src/game/snapshot-codec'
import type { GameState } from '../src/game/types'
import { controlledBackend, fakeIndexedDb, memoryLocalStorage } from './save-kit'
import type { ControlledBackend } from './save-kit'

const [SLOT_1, SLOT_2] = QUARANTINE_SLOTS

/** The schema 1 save of v2.4.0, as the text a store would hold. */
const fixtureJson = gunzipSync(readFileSync('test/fixtures/save-v1.json.gz')).toString()

// One life at three moments, and another life: built once, so this file stays quick.
let older: string
let later: string
let otherLife: string
let lifeId: string

beforeAll(() => {
  const g = createNewLife({ seed: 7, year: 2026 })
  for (let i = 0; i < 5; i++) {
    g.queue = []
    ageUp(g)
  }
  g.queue = []
  older = JSON.stringify(g)
  lifeId = g.lifeId
  ageUp(g)
  g.queue = []
  later = JSON.stringify(g)
  const other = createNewLife({ seed: 8, year: 2026 })
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

/** A localStorage that refuses every call, as a browser with storage disabled does. */
function disabledStorage(): Storage {
  const denied = (): never => {
    throw new DOMException('Access denied', 'SecurityError')
  }
  return { get length(): number { return denied() }, clear: denied, getItem: denied, key: denied, removeItem: denied, setItem: denied }
}

/** Timers a hang can be waited out with. The streams of the codec need the real rest. */
function fakeTimers(): void {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
}

/** Waits for the import to hand its write to `backend` (the codec's gzip streams run on real time). */
async function writeReaches(backend: ControlledBackend): Promise<void> {
  const giveUp = Date.now() + 5000
  while (backend.writes.length === 0 && Date.now() < giveUp) await new Promise<void>((resolve) => setImmediate(resolve))
  expect(backend.writes).toHaveLength(1)
}

/** The record the IndexedDB of `factory` holds in the main slot, as stored. */
async function idbRecord(factory: IDBFactory): Promise<string | null> {
  return (await idbSaveBackend(factory)).read()
}

async function putIdbRecord(factory: IDBFactory, record: string): Promise<void> {
  await (await idbSaveBackend(factory)).write(record)
}

/** The game a record migrates to, as JSON: what boot stores when it imports `raw`. */
function migratedJson(raw: string): string {
  const found = migrateSave(JSON.parse(raw))
  if (found.kind !== 'ready') throw new Error(`expected a ready save, got ${found.kind}`)
  return JSON.stringify(found.game)
}

/** A save a later version of the game wrote. */
function newerRecord(): string {
  return JSON.stringify({ ...(JSON.parse(older) as Record<string, unknown>), schemaVersion: SAVE_SCHEMA + 1 })
}

describe('the first visit', () => {
  it('uses IndexedDB, has nothing to load, and the first save lands in it', async () => {
    const factory = fakeIndexedDb()
    const out = await hydrateSaves({ factory })
    expect(out).toEqual({ backend: 'idb', source: 'none', fellBack: false, imported: false })
    expect(getSaveStatus().notices).toEqual([])
    expect(save.loadGame()).toBeNull()
    expect(saveRecord('{"a":1}')).toBe(true)
    expect(await flushSave()).toBe(true)
    expect(readRecord()).toBe('{"a":1}')
    expect(await idbRecord(factory)).toBe('{"a":1}')
  })

  it('with every storage refused, resolves with a warning on the first save and no notices', async () => {
    vi.stubGlobal('localStorage', disabledStorage())
    const out = await hydrateSaves({ factory: fakeIndexedDb({ failOpen: true }) })
    expect(out).toMatchObject({ backend: 'local', source: 'none', fellBack: true, imported: false })
    expect(getSaveStatus().notices).toEqual([])
    expect(saveRecord('{}')).toBe(false)
    expect(getSaveStatus().persistFailed).toBe(true)
  })

  it('stays on localStorage, without a fallback, when the IndexedDB switch is off', async () => {
    storage.data.set(SAVE_KEY, older)
    const out = await hydrateSaves({ idb: false, factory: fakeIndexedDb({ failOpen: true }) })
    expect(out).toEqual({ backend: 'local', source: 'local', fellBack: false, imported: false })
    expect(storage.data.get(SAVE_KEY)).toBe(older)
    expect(save.loadGame()?.lifeId).toBe(lifeId)
  })

  it('uses exactly the backend it is given, and reads a synchronous one live', async () => {
    const memory = memorySaveBackend(older)
    const out = await hydrateSaves({ backend: memory })
    expect(out).toEqual({ backend: 'memory', source: 'local', fellBack: false, imported: false })
    expect(activeBackend()).toBe(memory)
    expect(save.loadGame()?.lifeId).toBe(lifeId)
  })
})

describe('a database that fails, hangs or answers late', () => {
  it('falls back to localStorage when the database refuses to open', async () => {
    storage.data.set(SAVE_KEY, older)
    const out = await hydrateSaves({ factory: fakeIndexedDb({ failOpen: true }) })
    expect(out).toEqual({ backend: 'local', source: 'local', fellBack: true, imported: false })
    expect(activeBackendName()).toBe('local')
    expect(save.loadGame()?.lifeId).toBe(lifeId)
  })

  it.each(['open', 'read'] as const)('a database that hangs on %s falls back after 3000 ms, not before', async (hang) => {
    fakeTimers()
    storage.data.set(SAVE_KEY, older)
    let outcome: Awaited<ReturnType<typeof hydrateSaves>> | undefined
    const pending = hydrateSaves({ factory: fakeIndexedDb({ hang }) }).then((out) => {
      outcome = out
    })
    await vi.advanceTimersByTimeAsync(2999)
    expect(outcome).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1)
    await pending
    expect(outcome).toMatchObject({ backend: 'local', source: 'local', fellBack: true, imported: false })
    expect(activeBackendName()).toBe('local')
    expect(storage.data.get(SAVE_KEY)).toBe(older)
  })

  it('an open that answers after the fallback neither switches back nor writes', async () => {
    fakeTimers()
    const factory = fakeIndexedDb({ slowOpen: 4000 })
    const pending = hydrateSaves({ factory })
    await vi.advanceTimersByTimeAsync(3000)
    expect(await pending).toMatchObject({ backend: 'local', fellBack: true })
    await vi.advanceTimersByTimeAsync(2000)
    expect(activeBackendName()).toBe('local')
    expect(storage.data.size).toBe(0)
    const reopened = idbSaveBackend(factory, 10_000)
    await vi.advanceTimersByTimeAsync(4000)
    expect(await (await reopened).read()).toBeNull()
  })
})

describe('importing the localStorage save', () => {
  it('moves a save of the current shape into IndexedDB, and the next boot loads it from there', async () => {
    storage.data.set(SAVE_KEY, older)
    const factory = fakeIndexedDb()
    const out = await hydrateSaves({ factory })
    expect(out).toEqual({ backend: 'idb', source: 'legacy', fellBack: false, imported: true })
    expect(storage.data.has(SAVE_KEY)).toBe(false)
    expect(await decodeSnapshotRecord((await idbRecord(factory)) ?? '')).toBe(migratedJson(older))
    const loaded = save.loadGame()
    expect(isLoadableGame(loaded)).toBe(true)
    expect(loaded?.lifeId).toBe(lifeId)
    expect(getSaveStatus().notices).toEqual([])

    resetSaveStoreForTests()
    const again = await hydrateSaves({ factory })
    expect(again).toEqual({ backend: 'idb', source: 'idb', fellBack: false, imported: false })
    expect(save.loadGame()?.lifeId).toBe(lifeId)
  })

  it('migrates the schema 1 fixture on the way in', async () => {
    storage.data.set(SAVE_KEY, fixtureJson)
    const factory = fakeIndexedDb()
    expect(await hydrateSaves({ factory })).toMatchObject({ backend: 'idb', source: 'legacy', imported: true })
    const stored = JSON.parse(await decodeSnapshotRecord((await idbRecord(factory)) ?? '')) as GameState
    expect(stored.schemaVersion).toBe(SAVE_SCHEMA)
    expect(save.loadGame()?.schemaVersion).toBe(SAVE_SCHEMA)
  })

  it('keeps the localStorage record, and plays from it, when the read-back differs', async () => {
    storage.data.set(SAVE_KEY, older)
    const out = await hydrateSaves({ factory: fakeIndexedDb({ corruptReadback: true }) })
    expect(out).toMatchObject({ backend: 'local', fellBack: true, imported: false })
    expect(storage.data.get(SAVE_KEY)).toBe(older)
    expect(activeBackendName()).toBe('local')
    expect(save.loadGame()?.lifeId).toBe(lifeId)
  })

  it('keeps the localStorage record when the write is refused', async () => {
    storage.data.set(SAVE_KEY, older)
    const out = await hydrateSaves({ factory: fakeIndexedDb({ failWrite: true }) })
    expect(out).toMatchObject({ backend: 'local', fellBack: true, imported: false })
    expect(storage.data.get(SAVE_KEY)).toBe(older)
    expect(save.loadGame()?.lifeId).toBe(lifeId)
  })

  it('gives up on a write that never settles after 3000 ms, and leaves the localStorage record alone', async () => {
    fakeTimers()
    storage.data.set(SAVE_KEY, older)
    const backend = controlledBackend()
    let outcome: Awaited<ReturnType<typeof hydrateSaves>> | undefined
    const pending = hydrateSaves({ backend }).then((out) => {
      outcome = out
    })
    await writeReaches(backend)
    await vi.advanceTimersByTimeAsync(2999)
    expect(outcome).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1)
    await pending
    expect(outcome).toMatchObject({ backend: 'local', fellBack: true, imported: false })
    expect(backend.writes).toHaveLength(1)
    // The write settling late changes nothing: the legacy key stays and the backend stays local.
    backend.settle()
    await vi.advanceTimersByTimeAsync(10)
    expect(storage.data.get(SAVE_KEY)).toBe(older)
    expect(activeBackendName()).toBe('local')
  })

  it('stores a record of 100,000 characters or more compressed, and reads it back whole after a reboot', async () => {
    const big = JSON.parse(older) as GameState
    Object.assign(big.flags, { pad: 'x'.repeat(150_000) })
    const bigJson = JSON.stringify(big)
    expect(bigJson.length).toBeGreaterThanOrEqual(100_000)
    storage.data.set(SAVE_KEY, bigJson)
    const factory = fakeIndexedDb()
    expect(await hydrateSaves({ factory })).toMatchObject({ source: 'legacy', imported: true })
    const stored = (await idbRecord(factory)) ?? ''
    expect(stored.startsWith('gz2:')).toBe(true)
    expect(await decodeSnapshotRecord(stored)).toBe(migratedJson(bigJson))

    resetSaveStoreForTests()
    expect(await hydrateSaves({ factory })).toMatchObject({ backend: 'idb', source: 'idb' })
    expect(readRecord()).toBe(migratedJson(bigJson))
  })
})

describe('both stores hold a game', () => {
  it('imports the later save of the same life, and keeps the older IndexedDB record as a stale copy', async () => {
    const factory = fakeIndexedDb()
    await putIdbRecord(factory, older)
    storage.data.set(SAVE_KEY, later)
    const out = await hydrateSaves({ factory })
    expect(out).toEqual({ backend: 'idb', source: 'legacy', fellBack: false, imported: true })
    const notices = getSaveStatus().notices
    expect(notices).toHaveLength(1)
    expect(notices[0]).toMatchObject({ kind: 'stale', bytes: older.length })
    expect(await readSaveCopy(notices[0].id)).toBe(older)
    expect(storage.data.has(SAVE_KEY)).toBe(false)
    expect(await decodeSnapshotRecord((await idbRecord(factory)) ?? '')).toBe(migratedJson(later))
  })

  it('keeps the IndexedDB save when it is the later one, and the legacy record becomes the stale copy', async () => {
    const factory = fakeIndexedDb()
    await putIdbRecord(factory, later)
    storage.data.set(SAVE_KEY, older)
    const out = await hydrateSaves({ factory })
    expect(out).toEqual({ backend: 'idb', source: 'idb', fellBack: false, imported: false })
    const notices = getSaveStatus().notices
    expect(notices).toHaveLength(1)
    expect(notices[0]).toMatchObject({ kind: 'stale' })
    expect(await readSaveCopy(notices[0].id)).toBe(older)
    expect(storage.data.has(SAVE_KEY)).toBe(false)
    expect(await idbRecord(factory)).toBe(later)
    expect(save.loadGame()?.lifeId).toBe(lifeId)
  })

  it('keeps the IndexedDB save when the two are different lives', async () => {
    const factory = fakeIndexedDb()
    await putIdbRecord(factory, older)
    storage.data.set(SAVE_KEY, otherLife)
    expect(await hydrateSaves({ factory })).toMatchObject({ source: 'idb', imported: false })
    const notices = getSaveStatus().notices
    expect(notices).toHaveLength(1)
    expect(await readSaveCopy(notices[0].id)).toBe(otherLife)
    expect(save.loadGame()?.lifeId).toBe(lifeId)
  })

  describe('newerOf', () => {
    const game = (id: string, year: number, age: number) => ({ lifeId: id, year, character: { age } }) as unknown as GameState

    it.each([
      ['a tie', game('a', 2030, 5), game('a', 2030, 5), 'idb'],
      ['the legacy save a year later', game('a', 2030, 5), game('a', 2031, 6), 'legacy'],
      ['the IndexedDB save a year later', game('a', 2031, 6), game('a', 2030, 5), 'idb'],
      ['the same year, the legacy save older in age', game('a', 2030, 5), game('a', 2030, 4), 'idb'],
      ['the same year, the legacy save older in age by one more', game('a', 2030, 5), game('a', 2030, 6), 'legacy'],
      ['different lives, the legacy one later', game('a', 2030, 5), game('b', 2040, 15), 'idb'],
      ['different lives, the legacy one earlier', game('a', 2040, 15), game('b', 2030, 5), 'idb'],
    ] as const)('%s', (_name, idb, legacy, expected) => {
      expect(newerOf(idb, legacy)).toBe(expected)
    })
  })
})

describe('records that can not be played', () => {
  let bad: Record<string, string>

  beforeAll(async () => {
    const packed = await encodeSnapshotRecord(older, 0)
    expect(packed.startsWith('gz2:')).toBe(true)
    bad = {
      'corrupt JSON': '{"version": 1, "character": ',
      'a truncated gz2 string': packed.slice(0, packed.length - 3),
      'a gz2 string with a bad alphabet': 'gz2:3:ab',
      'JSON that is not a game': '{"version":1,"schemaVersion":2,"character":{}}',
    }
  })

  const names = ['corrupt JSON', 'a truncated gz2 string', 'a gz2 string with a bad alphabet', 'JSON that is not a game']

  describe.each(['IndexedDB', 'localStorage'] as const)('as the %s record', (where) => {
    it.each(names)('keeps %s byte for byte as a damaged copy, and frees the main slot', async (name) => {
      const raw = bad[name]
      const factory = fakeIndexedDb()
      if (where === 'IndexedDB') await putIdbRecord(factory, raw)
      else storage.data.set(SAVE_KEY, raw)
      const out = await hydrateSaves({ factory })
      expect(out).toEqual({ backend: 'idb', source: 'none', fellBack: false, imported: false })
      const notices = getSaveStatus().notices
      expect(notices).toHaveLength(1)
      expect(notices[0]).toMatchObject({ kind: 'damaged', bytes: raw.length })
      expect(await readSaveCopy(notices[0].id)).toBe(raw)
      expect(await idbRecord(factory)).toBeNull()
      expect(storage.data.has(SAVE_KEY)).toBe(false)
      expect(save.loadGame()).toBeNull()
      // A later save never touches the copy.
      expect(saveRecord('{}')).toBe(true)
      expect(await flushSave()).toBe(true)
      expect(await readSaveCopy(notices[0].id)).toBe(raw)
    })
  })

  it('keeps a save older than the oldest schema as a tooOld copy', async () => {
    const factory = fakeIndexedDb()
    await putIdbRecord(factory, fixtureJson)
    expect(await hydrateSaves({ factory, minSchema: 2 })).toMatchObject({ backend: 'idb', source: 'none' })
    const notices = getSaveStatus().notices
    expect(notices).toEqual([{ id: notices[0].id, kind: 'tooOld', bytes: fixtureJson.length, version: 1 }])
    expect(await readSaveCopy(notices[0].id)).toBe(fixtureJson)
    expect(await idbRecord(factory)).toBeNull()
  })

  it('keeps a tooOld legacy record the same way', async () => {
    storage.data.set(SAVE_KEY, fixtureJson)
    expect(await hydrateSaves({ factory: fakeIndexedDb(), minSchema: 2 })).toMatchObject({ source: 'none', imported: false })
    const notices = getSaveStatus().notices
    expect(notices).toHaveLength(1)
    expect(notices[0]).toMatchObject({ kind: 'tooOld', version: 1 })
    expect(await readSaveCopy(notices[0].id)).toBe(fixtureJson)
    expect(storage.data.has(SAVE_KEY)).toBe(false)
  })

  it('on a synchronous backend, keeps the damaged record as a copy and empties the slot', async () => {
    const memory = memorySaveBackend('not json')
    await hydrateSaves({ backend: memory })
    expect(memory.read()).toBeNull()
    expect(getSaveStatus().notices).toHaveLength(1)
    expect(await readSaveCopy(getSaveStatus().notices[0].id)).toBe('not json')
  })
})

describe('a record from a newer version of the game', () => {
  it('stays byte for byte in IndexedDB, listed under the main key, and the first save copies it', async () => {
    const raw = newerRecord()
    const factory = fakeIndexedDb()
    await putIdbRecord(factory, raw)
    const out = await hydrateSaves({ factory })
    expect(out).toEqual({ backend: 'idb', source: 'none', fellBack: false, imported: false })
    expect(getSaveStatus().notices).toEqual([{ id: SAVE_KEY, kind: 'newer', bytes: raw.length, version: SAVE_SCHEMA + 1 }])
    expect(await idbRecord(factory)).toBe(raw)
    expect(await readSaveCopy(SAVE_KEY)).toBe(raw)
    expect(save.loadGame()).toBeNull()

    expect(saveRecord(later)).toBe(true)
    expect(await flushSave()).toBe(true)
    const notices = getSaveStatus().notices
    expect(notices).toHaveLength(1)
    expect(notices[0]).toMatchObject({ kind: 'newer', version: SAVE_SCHEMA + 1 })
    expect(notices[0].id).not.toBe(SAVE_KEY)
    expect(await readSaveCopy(notices[0].id)).toBe(raw)
    expect(await decodeSnapshotRecord((await idbRecord(factory)) ?? '')).toBe(later)
  })

  it('as the localStorage record keeps the page on localStorage and leaves IndexedDB untouched', async () => {
    const raw = newerRecord()
    const factory = fakeIndexedDb()
    await putIdbRecord(factory, later)
    storage.data.set(SAVE_KEY, raw)
    const out = await hydrateSaves({ factory })
    expect(out).toEqual({ backend: 'local', source: 'none', fellBack: false, imported: false })
    expect(activeBackendName()).toBe('local')
    expect(getSaveStatus().notices).toEqual([{ id: SAVE_KEY, kind: 'newer', bytes: raw.length, version: SAVE_SCHEMA + 1 }])
    expect(storage.data.get(SAVE_KEY)).toBe(raw)
    expect(await idbRecord(factory)).toBe(later)
    expect(save.loadGame()).toBeNull()
  })

  it('beside a legacy record keeps the newer one in place and shelves the legacy one', async () => {
    const raw = newerRecord()
    const factory = fakeIndexedDb()
    await putIdbRecord(factory, raw)
    storage.data.set(SAVE_KEY, older)
    await hydrateSaves({ factory })
    const notices = getSaveStatus().notices
    expect(notices.map((n) => n.kind).sort()).toEqual(['newer', 'stale'])
    const stale = notices.find((n) => n.kind === 'stale')
    expect(await readSaveCopy(stale?.id ?? '')).toBe(older)
    expect(notices.find((n) => n.kind === 'newer')?.id).toBe(SAVE_KEY)
    expect(await idbRecord(factory)).toBe(raw)
    expect(storage.data.has(SAVE_KEY)).toBe(false)
  })
})

describe('boot is once', () => {
  it('a second call after a save changes nothing and says why', async () => {
    const factory = fakeIndexedDb()
    await hydrateSaves({ factory })
    saveRecord(later)
    const again = await hydrateSaves({ factory })
    expect(again).toMatchObject({ backend: 'idb', source: 'none', skipped: 'already-saved' })
    expect(readRecord()).toBe(later)
    expect(await flushSave()).toBe(true)
    expect(readRecord()).toBe(later)
  })

  it('never rejects: an error nobody expected falls back to localStorage', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const opts = {
      get idb(): boolean {
        throw new Error('boom')
      },
    }
    const out = await hydrateSaves(opts)
    expect(out).toEqual({ backend: 'local', source: 'none', fellBack: true, imported: false })
    expect(activeBackendName()).toBe('local')
    expect(error).toHaveBeenCalled()
  })
})

describe('copies an earlier session kept', () => {
  it('lists each one with the kind its content has', async () => {
    storage.data.set(SLOT_1, 'garbage')
    storage.data.set(SLOT_2, older)
    await hydrateSaves({ factory: fakeIndexedDb() })
    expect(getSaveStatus().notices).toEqual([
      { id: SLOT_1, kind: 'damaged', bytes: 'garbage'.length },
      { id: SLOT_2, kind: 'stale', bytes: older.length },
    ])
  })

  it('drops a notice when its copy is deleted', async () => {
    storage.data.set(SLOT_1, 'garbage')
    storage.data.set(SLOT_2, older)
    await hydrateSaves({ factory: fakeIndexedDb() })
    await deleteSaveCopy(SLOT_1)
    expect(getSaveStatus().notices.map((n) => n.id)).toEqual([SLOT_2])
  })

  it('lists the copies in the overflow of IndexedDB too', async () => {
    const factory = fakeIndexedDb()
    const idb = await idbSaveBackend(factory)
    await idb.overflow.put('bad-1', older)
    storage.data.set(SLOT_1, 'garbage')
    await hydrateSaves({ factory })
    expect(getSaveStatus().notices.map((n) => [n.id, n.kind])).toEqual([
      [SLOT_1, 'damaged'],
      ['bad-1', 'stale'],
    ])
  })
})

describe('five copies already kept', () => {
  async function fillFive(factory: IDBFactory): Promise<void> {
    for (const [n, slot] of QUARANTINE_SLOTS.entries()) storage.data.set(slot, `copy ${n + 1}`)
    const idb = await idbSaveBackend(factory)
    await idb.overflow.put('bad-1', 'copy 4')
    await idb.overflow.put('bad-2', 'copy 5')
  }

  it('leaves a damaged IndexedDB record where it is, with a notice under the main key', async () => {
    const factory = fakeIndexedDb()
    await fillFive(factory)
    await putIdbRecord(factory, 'not json')
    await hydrateSaves({ factory })
    expect(await idbRecord(factory)).toBe('not json')
    const notices = getSaveStatus().notices
    expect(notices).toHaveLength(6)
    expect(notices.find((n) => n.id === SAVE_KEY)).toMatchObject({ kind: 'damaged', bytes: 'not json'.length })
    expect(await readSaveCopy(SAVE_KEY)).toBe('not json')
  })

  it('leaves a losing legacy record in localStorage, and lists nothing for it', async () => {
    const factory = fakeIndexedDb()
    await fillFive(factory)
    await putIdbRecord(factory, later)
    storage.data.set(SAVE_KEY, 'not json')
    expect(await hydrateSaves({ factory })).toMatchObject({ backend: 'idb', source: 'idb' })
    expect(storage.data.get(SAVE_KEY)).toBe('not json')
    expect(getSaveStatus().notices).toHaveLength(5)
    expect(getSaveStatus().notices.some((n) => n.id === SAVE_KEY)).toBe(false)
  })

  it('does not import over an IndexedDB record it could not keep', async () => {
    const factory = fakeIndexedDb()
    await fillFive(factory)
    await putIdbRecord(factory, 'not json')
    storage.data.set(SAVE_KEY, later)
    const out = await hydrateSaves({ factory })
    expect(out).toMatchObject({ backend: 'local', source: 'local', fellBack: true, imported: false })
    expect(await idbRecord(factory)).toBe('not json')
    expect(storage.data.get(SAVE_KEY)).toBe(later)
    expect(getSaveStatus().notices.some((n) => n.id === SAVE_KEY)).toBe(false)
    expect(save.loadGame()?.lifeId).toBe(lifeId)
  })
})

describe('diagnoseRecord', () => {
  it('reads a plain record, a gz1 record and a gz2 record', async () => {
    const gz1 = `gz1:${gzipSync(Buffer.from(older)).toString('base64')}`
    const gz2 = await encodeSnapshotRecord(older, 0)
    expect(gz2.startsWith('gz2:')).toBe(true)
    for (const raw of [older, gz1, gz2]) {
      const found = await diagnoseRecord(raw)
      expect(found.kind).toBe('ready')
      if (found.kind === 'ready') expect(found.game.lifeId).toBe(lifeId)
    }
  })

  it('names a newer and a too old record with their schema, and never rejects', async () => {
    expect(await diagnoseRecord(newerRecord())).toEqual({ kind: 'newer', version: SAVE_SCHEMA + 1 })
    expect(await diagnoseRecord(fixtureJson, { minSchema: 2 })).toEqual({ kind: 'tooOld', version: 1 })
    for (const raw of ['', 'null', '[]', '{', 'gz2:', 'gz1:!!!']) expect(await diagnoseRecord(raw)).toEqual({ kind: 'damaged' })
  })
})

describe('the boot functions of the store', () => {
  it('primeCache sets what an asynchronous backend reads, and does nothing once the page has saved', async () => {
    setSaveBackend(controlledBackend())
    expect(savedThisSession()).toBe(false)
    expect(primeCache('{"a":1}')).toBe(true)
    expect(readRecord()).toBe('{"a":1}')
    expect(saveRecord('{"b":2}')).toBe(true)
    expect(savedThisSession()).toBe(true)
    expect(primeCache('{"a":1}')).toBe(false)
    expect(readRecord()).toBe('{"b":2}')
  })

  it('addSaveNotice puts a notice where the one it replaces was, else last', () => {
    addSaveNotice({ id: 'a', kind: 'damaged', bytes: 1 })
    addSaveNotice({ id: 'b', kind: 'damaged', bytes: 2 })
    addSaveNotice({ id: 'c', kind: 'stale', bytes: 3 }, 'a')
    addSaveNotice({ id: 'b', kind: 'stale', bytes: 4 })
    expect(getSaveStatus().notices).toEqual([
      { id: 'c', kind: 'stale', bytes: 3 },
      { id: 'b', kind: 'stale', bytes: 4 },
    ])
  })

  it('activeBackend is the default localStorage backend until one is set', () => {
    expect(activeBackend().name).toBe('local')
    const memory = memorySaveBackend()
    setSaveBackend(memory)
    expect(activeBackend()).toBe(memory)
  })
})

// --- A browser whose life lives in IndexedDB ---------------------------------------------------

/** `older` with one stat changed: the same life, year and age, but not the same game. */
function sameMomentOtherAction(): string {
  const g = JSON.parse(older) as GameState
  g.character.stats.looks = (g.character.stats.looks + 17) % 100
  return JSON.stringify(g)
}

describe('the marker that this browser keeps its life in IndexedDB', () => {
  it('is set by an import, and by a boot that loads from IndexedDB, and not by an empty first visit', async () => {
    const factory = fakeIndexedDb()
    await hydrateSaves({ factory })
    expect(idbMarked()).toBe(false)

    storage.data.set(SAVE_KEY, older)
    resetSaveStoreForTests()
    expect(await hydrateSaves({ factory })).toMatchObject({ imported: true })
    expect(storage.data.get(IDB_MARKER_KEY)).toBe('1')

    storage.data.delete(IDB_MARKER_KEY)
    resetSaveStoreForTests()
    expect(await hydrateSaves({ factory })).toMatchObject({ source: 'idb' })
    expect(idbMarked()).toBe(true)
  })

  it('is not set when the import failed and the page plays from localStorage', async () => {
    storage.data.set(SAVE_KEY, older)
    await hydrateSaves({ factory: fakeIndexedDb({ failWrite: true }) })
    expect(idbMarked()).toBe(false)
  })
})

describe('a life in IndexedDB that the page cannot reach', () => {
  async function migrate(factory: IDBFactory): Promise<void> {
    storage.data.set(SAVE_KEY, older)
    expect(await hydrateSaves({ factory })).toMatchObject({ backend: 'idb', imported: true })
    expect(storage.data.has(SAVE_KEY)).toBe(false)
    resetSaveStoreForTests()
  }

  it('says so, with a notice that stays, when the database hangs on a later visit', async () => {
    const factory = fakeIndexedDb()
    await migrate(factory)
    fakeTimers()
    const pending = hydrateSaves({ factory: fakeIndexedDb({ hang: 'open' }) })
    await vi.advanceTimersByTimeAsync(3000)
    const out = await pending
    expect(out).toMatchObject({ backend: 'local', source: 'none', fellBack: true })
    expect(save.loadGame()).toBeNull()
    expect(getSaveStatus().notices).toEqual([{ id: IDB_MARKER_KEY, kind: 'unreachable', bytes: 0 }])
  })

  it('says so when the database refuses to open', async () => {
    await migrate(fakeIndexedDb())
    await hydrateSaves({ factory: fakeIndexedDb({ failOpen: true }) })
    expect(getSaveStatus().notices.map((n) => n.kind)).toEqual(['unreachable'])
  })

  it('says nothing to a browser that never kept a life there', async () => {
    await hydrateSaves({ factory: fakeIndexedDb({ failOpen: true }) })
    expect(getSaveStatus().notices).toEqual([])
  })

  it('says nothing when the database answers', async () => {
    const factory = fakeIndexedDb()
    await migrate(factory)
    expect(await hydrateSaves({ factory })).toMatchObject({ backend: 'idb', source: 'idb', fellBack: false })
    expect(getSaveStatus().notices).toEqual([])
  })

  it('keeps using the database when the IndexedDB switch is off, because the life is there', async () => {
    const factory = fakeIndexedDb()
    await migrate(factory)
    const out = await hydrateSaves({ idb: false, factory })
    expect(out).toEqual({ backend: 'idb', source: 'idb', fellBack: false, imported: false })
    expect(save.loadGame()?.lifeId).toBe(lifeId)
    expect(getSaveStatus().notices).toEqual([])
  })

  it('still plays a backup copy in localStorage, and still says the database did not answer', async () => {
    await migrate(fakeIndexedDb())
    storage.data.set(SAVE_KEY, later)
    const out = await hydrateSaves({ factory: fakeIndexedDb({ failOpen: true }) })
    expect(out).toMatchObject({ backend: 'local', source: 'local', fellBack: true })
    expect(save.loadGame()?.lifeId).toBe(lifeId)
    expect(getSaveStatus().notices.map((n) => n.kind)).toEqual(['unreachable'])
  })

  it('files a life started meanwhile in localStorage as the one to keep, and the database one as the older copy', async () => {
    const factory = fakeIndexedDb()
    await migrate(factory)
    // Life B was started while the database did not answer: it lives in localStorage now.
    storage.data.set(SAVE_KEY, otherLife)
    const out = await hydrateSaves({ factory })
    expect(out).toEqual({ backend: 'idb', source: 'legacy', fellBack: false, imported: true })
    const lifeB = JSON.parse(otherLife) as GameState
    expect(save.loadGame()?.lifeId).toBe(lifeB.lifeId)
    const notices = getSaveStatus().notices
    expect(notices).toHaveLength(1)
    expect(notices[0].kind).toBe('stale')
    expect(await decodeSnapshotRecord((await readSaveCopy(notices[0].id)) ?? '')).toBe(migratedJson(older))
    expect(storage.data.has(SAVE_KEY)).toBe(false)
  })

  it('gives a backup written at the same year and age the win over the database record, and keeps the record', async () => {
    const factory = fakeIndexedDb()
    await migrate(factory)
    const moved = sameMomentOtherAction()
    storage.data.set(SAVE_KEY, moved)
    expect(await hydrateSaves({ factory })).toMatchObject({ source: 'legacy', imported: true })
    expect(JSON.stringify(save.loadGame())).toBe(migratedJson(moved))
    const [kept] = getSaveStatus().notices
    expect(kept.kind).toBe('stale')
    expect(await decodeSnapshotRecord((await readSaveCopy(kept.id)) ?? '')).toBe(migratedJson(older))
  })

  it('judges a backup from an earlier year the newer one all the same (a Time Machine jump goes back)', async () => {
    const factory = fakeIndexedDb()
    await putIdbRecord(factory, later)
    storage.data.set(IDB_MARKER_KEY, '1')
    storage.data.set(SAVE_KEY, older)
    expect(await hydrateSaves({ factory })).toMatchObject({ source: 'legacy', imported: true })
    expect(JSON.stringify(save.loadGame())).toBe(migratedJson(older))
  })

  it('without the marker, the later year and age still decides, and a tie goes to the database', async () => {
    const factory = fakeIndexedDb()
    await putIdbRecord(factory, later)
    storage.data.set(SAVE_KEY, older)
    expect(await hydrateSaves({ factory })).toMatchObject({ source: 'idb', imported: false })
  })

  it('drops a localStorage record that is the same game as the database one, with no copy and no notice', async () => {
    const factory = fakeIndexedDb()
    await migrate(factory)
    storage.data.set(SAVE_KEY, older)
    expect(await hydrateSaves({ factory })).toMatchObject({ source: 'idb', imported: false })
    expect(storage.data.has(SAVE_KEY)).toBe(false)
    expect(getSaveStatus().notices).toEqual([])
    expect(QUARANTINE_SLOTS.some((slot) => storage.data.has(slot))).toBe(false)
  })
})

describe('boot reads the legacy key before the database record', () => {
  it('a tab that boots while another tab imports still finds the life', async () => {
    const backend = controlledBackend()
    // The other tab finishes its import (database written, legacy key removed) while this tab's database read is in flight.
    const read = backend.read
    backend.read = async () => {
      const answer = await read()
      storage.data.delete(SAVE_KEY)
      backend.stored = migratedJson(older)
      return answer
    }
    backend.write = async (record) => {
      backend.stored = record
    }
    storage.data.set(SAVE_KEY, older)
    const out = await hydrateSaves({ backend })
    expect(out).toMatchObject({ source: 'legacy', imported: true })
    expect(save.loadGame()?.lifeId).toBe(lifeId)
  })
})

describe('a boot that cannot finish', () => {
  it('lets go of a copy that hangs after 3000 ms, and of a scan that hangs after 3000 ms more, and leaves the record where it is', async () => {
    fakeTimers()
    const backend = controlledBackend('not json')
    backend.overflow.keys = () => new Promise<string[]>(() => undefined)
    let outcome: Awaited<ReturnType<typeof hydrateSaves>> | undefined
    const pending = hydrateSaves({ backend }).then((out) => {
      outcome = out
    })
    await vi.advanceTimersByTimeAsync(2999)
    expect(outcome).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1)
    // No copy could be made, so the damaged record stays in the main slot and says so.
    await vi.advanceTimersByTimeAsync(3000)
    await pending
    expect(outcome).toMatchObject({ backend: 'idb', source: 'none', fellBack: false })
    expect(getSaveStatus().notices).toEqual([{ id: SAVE_KEY, kind: 'damaged', bytes: 'not json'.length }])
    expect(await backend.read()).toBe('not json')
  })

  it('still lists the copies in the slots when the overflow of the database does not answer', async () => {
    fakeTimers()
    storage.data.set(SLOT_1, 'garbage')
    const backend = controlledBackend()
    backend.overflow.keys = () => new Promise<string[]>(() => undefined)
    const pending = hydrateSaves({ backend })
    await vi.advanceTimersByTimeAsync(3000)
    await pending
    expect(getSaveStatus().notices).toEqual([{ id: SLOT_1, kind: 'damaged', bytes: 'garbage'.length }])
  })

  it('gives up on the whole boot at the budget and falls back to localStorage, and says so to a browser that keeps its life in the database', async () => {
    fakeTimers()
    storage.data.set(IDB_MARKER_KEY, '1')
    let outcome: Awaited<ReturnType<typeof hydrateSaves>> | undefined
    const pending = hydrateSaves({ factory: fakeIndexedDb({ hang: 'open' }), budgetMs: 1000 }).then((out) => {
      outcome = out
    })
    await vi.advanceTimersByTimeAsync(999)
    expect(outcome).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1)
    await pending
    expect(outcome).toEqual({ backend: 'local', source: 'none', fellBack: true, imported: false })
    expect(getSaveStatus().notices).toEqual([{ id: IDB_MARKER_KEY, kind: 'unreachable', bytes: 0 }])
  })

  it('a step still waiting when the budget runs out changes nothing when it finishes late', async () => {
    fakeTimers()
    const backend = controlledBackend(later)
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const keys = backend.overflow.keys
    backend.overflow.keys = async () => {
      await gate
      return keys()
    }
    // A leftover localStorage record loses to the later IndexedDB save: it is copied, and only then removed.
    storage.data.set(SAVE_KEY, older)
    let outcome: Awaited<ReturnType<typeof hydrateSaves>> | undefined
    const pending = hydrateSaves({ backend, budgetMs: 1000, timeoutMs: 5000 }).then((out) => {
      outcome = out
    })
    await vi.advanceTimersByTimeAsync(1000)
    await pending
    expect(outcome).toEqual({ backend: 'local', source: 'none', fellBack: true, imported: false })
    expect(activeBackendName()).toBe('local')

    // The page plays on from localStorage...
    expect(saveRecord('{"new":1}')).toBe(true)
    // ...and the copy that was still being made finishes late: it must not take the new save away.
    release()
    await vi.advanceTimersByTimeAsync(10)
    expect(storage.data.get(SAVE_KEY)).toBe('{"new":1}')
    expect(activeBackendName()).toBe('local')
  })
})

describe('an import that lands after the budget', () => {
  it('leaves the localStorage record alone, so the page that went on without it still has its life', async () => {
    fakeTimers()
    storage.data.set(SAVE_KEY, older)
    const backend = controlledBackend()
    const pending = hydrateSaves({ backend, budgetMs: 1000, timeoutMs: 5000 })
    await writeReaches(backend)
    await vi.advanceTimersByTimeAsync(1000)
    expect(await pending).toEqual({ backend: 'local', source: 'none', fellBack: true, imported: false })

    // The database takes the write at last, and the read-back matches: a boot that was still running would now remove the key.
    backend.settle()
    // The codec's streams run on real time: give the read-back a good second to land.
    const until = Date.now() + 1500
    while (Date.now() < until) await new Promise<void>((resolve) => setImmediate(resolve))
    expect(storage.data.get(SAVE_KEY)).toBe(older)
    expect(activeBackendName()).toBe('local')
    expect(save.loadGame()?.lifeId).toBe(lifeId)
  })
})

describe('the same record is kept once', () => {
  /** The database of `factory`, except that every write is refused: an import into it fails. */
  async function failingImportBackend(factory: IDBFactory): Promise<AsyncSaveBackend> {
    const real = await idbSaveBackend(factory)
    return { ...real, write: () => Promise.reject(new Error('refused')) }
  }

  it('a failing import does not copy the older database record again on every boot', async () => {
    // The database holds an older save; the localStorage one is later and wins, but cannot be imported.
    const factory = fakeIndexedDb()
    await putIdbRecord(factory, older)
    storage.data.set(SAVE_KEY, later)
    for (let boot = 1; boot <= 4; boot++) {
      resetSaveStoreForTests()
      const out = await hydrateSaves({ backend: await failingImportBackend(factory) })
      expect(out).toMatchObject({ backend: 'local', fellBack: true, imported: false })
    }
    const copies = QUARANTINE_SLOTS.filter((slot) => storage.data.has(slot))
    expect(copies).toHaveLength(1)
    expect(storage.data.get(copies[0])).toBe(older)
    expect(storage.data.get(SAVE_KEY)).toBe(later)
  })
})
