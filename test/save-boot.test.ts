// R1-A2 (K.5a, part 2 of 3): the boot and the store around the save queue. bootApp renders only after the
// saves are hydrated (and still renders when hydrate fails), the store mirrors an asynchronous write failure
// into the "Progress isn't saved" banner, and a Time Machine jump waits until its arrival is in storage.
// The bootApp cases use plain objects; the store cases use the kit's controlled backend, whose writes the test
// settles by hand, and a localStorage stub installed before the store loads.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bootApp, type BootEnv } from '../src/boot'
import type { GameState, ModalItem } from '../src/game/types'
import { controlledBackend, type ControlledBackend } from './save-kit'

// Minimal in-memory localStorage, installed before the store loads its settings.
vi.hoisted(() => {
  const data = new Map<string, string>()
  const ls = {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size
    },
  }
  Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true, writable: true })
})

const store = await import('../src/ui/store')
const save = await import('../src/game/save')
const { flushSave, resetSaveStoreForTests, setSaveBackend } = await import('../src/game/save-store')

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const read = (rel: string) => readFileSync(new URL(rel, `file://${ROOT}/`), 'utf8')

/** One macrotask: whatever is already queued gets to run, the codec's gzip streams included. */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

/** Waits, for a bounded while, until the store has handed the backend `count` writes. */
async function writesReach(backend: ControlledBackend, count: number): Promise<void> {
  for (let i = 0; i < 500 && backend.writes.length < count; i++) await tick()
  expect(backend.writes.length, 'writes handed to the backend').toBeGreaterThanOrEqual(count)
}

function game(): GameState {
  return store.getApp().game as GameState
}

/** Answer every popup through the store, taking the last, usually safest, option. */
function drain(): void {
  for (let i = 0; i < 300; i++) {
    const m: ModalItem | undefined = game().queue[0]
    if (!m) return
    if (m.kind === 'notice') store.dismissNotice(m.id)
    else if (m.kind === 'choice') store.chooseOption(m.id, m.choices[m.choices.length - 1].id)
    else if (m.kind === 'input') store.submitInput(m.id, m.input === 'number' ? String(m.min ?? 1) : m.defaultValue || 'Alex')
    else if (m.kind === 'minigame') store.finishMinigame(m.id, m.game === 'annualReport' ? 'skip' : 'done')
    else store.processQueue()
  }
  throw new Error('queue never drained')
}

async function live(years: number): Promise<void> {
  for (let i = 0; i < years; i++) {
    store.ageUpAction()
    drain()
    expect(game().character.alive).toBe(true)
    await save.snapshotWritesSettled()
  }
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  save.setSnapshotBackend(save.memorySnapshotBackend())
  setSaveBackend(null)
  store.abandonLife()
  resetSaveStoreForTests()
})

afterEach(async () => {
  setSaveBackend(null)
  resetSaveStoreForTests()
  await save.snapshotWritesSettled()
  save.setSnapshotBackend(null)
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------

/** A BootEnv of plain functions that records what happened, in order. */
function fakeEnv(over: Partial<BootEnv> = {}) {
  const calls: string[] = []
  const listeners = new Map<string, () => void>()
  let hidden = false
  const env: BootEnv = {
    hydrate: () => {
      calls.push('hydrate')
      return Promise.resolve()
    },
    render: () => void calls.push('render'),
    flush: () => {
      calls.push('flush')
      return Promise.resolve(true)
    },
    listen: (type, fn) => {
      calls.push(`listen:${type}`)
      listeners.set(type, fn)
    },
    hidden: () => hidden,
    ...over,
  }
  return {
    env,
    calls,
    fire: (type: 'pagehide' | 'visibilitychange') => listeners.get(type)?.(),
    hide: (value: boolean) => {
      hidden = value
    },
  }
}

describe('bootApp', () => {
  it('renders once, only after hydrate has resolved', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const t = fakeEnv({
      hydrate: () => {
        t.calls.push('hydrate')
        return gate
      },
    })
    const booted = bootApp(t.env)
    for (let i = 0; i < 5; i++) await Promise.resolve()
    expect(t.calls).toEqual(['hydrate'])
    release()
    await booted
    expect(t.calls.filter((c) => c === 'render')).toEqual(['render'])
    expect(t.calls.indexOf('hydrate')).toBeLessThan(t.calls.indexOf('render'))
  })

  it('still renders once when hydrate rejects, and logs why', async () => {
    const t = fakeEnv({ hydrate: () => Promise.reject(new Error('the database is on fire')) })
    await bootApp(t.env)
    expect(t.calls.filter((c) => c === 'render')).toHaveLength(1)
    expect(console.error).toHaveBeenCalled()
  })

  it('still renders once when hydrate throws before it returns a promise', async () => {
    const t = fakeEnv({
      hydrate: () => {
        throw new Error('no promise for you')
      },
    })
    await bootApp(t.env)
    expect(t.calls.filter((c) => c === 'render')).toHaveLength(1)
  })

  it('listens after the render, for pagehide and for visibilitychange', async () => {
    const t = fakeEnv()
    await bootApp(t.env)
    expect(t.calls).toEqual(['hydrate', 'render', 'listen:pagehide', 'listen:visibilitychange'])
  })

  it('flushes the save on pagehide', async () => {
    const t = fakeEnv()
    await bootApp(t.env)
    expect(t.calls).not.toContain('flush')
    t.fire('pagehide')
    expect(t.calls.filter((c) => c === 'flush')).toHaveLength(1)
  })

  it('flushes on visibilitychange only when the page is hidden', async () => {
    const t = fakeEnv()
    await bootApp(t.env)
    t.hide(false)
    t.fire('visibilitychange')
    expect(t.calls).not.toContain('flush')
    t.hide(true)
    t.fire('visibilitychange')
    expect(t.calls.filter((c) => c === 'flush')).toHaveLength(1)
  })

  it('does not wait for the flush, and a flush that returns nothing is fine', async () => {
    const t = fakeEnv({ flush: (() => undefined) as unknown as BootEnv['flush'] })
    await bootApp(t.env)
    expect(() => t.fire('pagehide')).not.toThrow()
  })
})

describe('the banner follows an asynchronous write', () => {
  it('shows when a queued write fails later', async () => {
    const b = controlledBackend()
    setSaveBackend(b)
    store.startNewLife({ seed: 3, year: 2026 })
    // The write is only queued: the save has not failed yet.
    expect(store.getApp().saveError).toBe(false)
    await writesReach(b, 1)
    b.fail(0)
    expect(await flushSave()).toBe(false)
    expect(store.getApp().saveError).toBe(true)
  })

  it('stays down while the writes work', async () => {
    const b = controlledBackend()
    setSaveBackend(b)
    store.startNewLife({ seed: 3, year: 2026 })
    await writesReach(b, 1)
    b.settle(0)
    expect(await flushSave()).toBe(true)
    expect(store.getApp().saveError).toBe(false)
  })

  it('retrySave keeps the banner while its write is pending, and drops it once the write lands', async () => {
    const b = controlledBackend()
    setSaveBackend(b)
    store.startNewLife({ seed: 3, year: 2026 })
    await writesReach(b, 1)
    b.fail(0)
    await flushSave()
    expect(store.getApp().saveError).toBe(true)

    store.retrySave()
    expect(store.getApp().saveError).toBe(true)
    await writesReach(b, 2)
    expect(store.getApp().saveError).toBe(true)

    b.settle(1)
    expect(await flushSave()).toBe(true)
    expect(store.getApp().saveError).toBe(false)
  })

  it('goes down on its own when the next ordinary save works', async () => {
    const b = controlledBackend()
    setSaveBackend(b)
    store.startNewLife({ seed: 3, year: 2026 })
    await writesReach(b, 1)
    b.fail(0)
    await flushSave()
    expect(store.getApp().saveError).toBe(true)

    store.act((g) => {
      g.character.stats.looks = 41
    })
    await writesReach(b, 2)
    b.settle(1)
    await flushSave()
    expect(store.getApp().saveError).toBe(false)
  })

  it('still shows for a refused localStorage write, as before', () => {
    store.startNewLife({ seed: 3, year: 2026 })
    expect(store.getApp().saveError).toBe(false)
    const refuse = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError')
    })
    try {
      store.act((g) => {
        g.character.stats.looks = 42
      })
      expect(store.getApp().saveError).toBe(true)
    } finally {
      refuse.mockRestore()
    }
    store.retrySave()
    expect(store.getApp().saveError).toBe(false)
  })
})

describe('saveForTravel', () => {
  it('is false when the write fails, and true when it settles, and waits for either', async () => {
    const b = controlledBackend()
    setSaveBackend(b)
    store.startNewLife({ seed: 3, year: 2026 })
    await writesReach(b, 1)
    b.settle(0)
    await flushSave()

    let answered: boolean | undefined
    const failing = store.saveForTravel(game()).then((ok) => (answered = ok))
    await writesReach(b, 2)
    await tick()
    expect(answered, 'it waits for the write').toBeUndefined()
    b.fail(1)
    expect(await failing).toBe(false)

    answered = undefined
    const working = store.saveForTravel(game()).then((ok) => (answered = ok))
    await writesReach(b, 3)
    await tick()
    expect(answered, 'it waits for the write').toBeUndefined()
    b.settle(2)
    expect(await working).toBe(true)
  })

  it('behaves like saveGame on the default backend', async () => {
    store.startNewLife({ seed: 3, year: 2026 })
    const g = game()
    expect(await store.saveForTravel(g)).toBe(true)
    expect(save.loadGame()?.lifeId).toBe(g.lifeId)

    const refuse = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError')
    })
    try {
      const answer = await Promise.race([store.saveForTravel(g), tick().then(() => 'waited')])
      expect(answer).toBe(false)
    } finally {
      refuse.mockRestore()
    }
  })
})

describe('a Time Machine jump with an asynchronous save', () => {
  it('lands once its arrival is in storage', async () => {
    store.startNewLife({ seed: 41, year: 1980, countryId: 'us' })
    drain()
    await live(2)
    const b = controlledBackend()
    setSaveBackend(b)

    let done = false
    const trip = store.travelBack(1).then((ok) => {
      done = ok
      return ok
    })
    await writesReach(b, 1)
    await tick()
    expect(done, 'still saving the trip').toBe(false)
    expect(game().character.age).toBe(2)
    b.settle(0)
    expect(await trip).toBe(true)
    expect(game().character.age).toBe(1)
    expect(store.getApp().timeTravel).toMatchObject({ busy: false, error: '' })
  }, 30_000)

  it('is called off when the arrival cannot be saved', async () => {
    store.startNewLife({ seed: 41, year: 1980, countryId: 'us' })
    drain()
    await live(2)
    const b = controlledBackend()
    setSaveBackend(b)

    const before = game()
    const trip = store.travelBack(1)
    await writesReach(b, 1)
    b.fail(0)
    expect(await trip).toBe(false)
    expect(store.getApp().timeTravel.busy).toBe(false)
    expect(store.getApp().timeTravel.error).toMatch(/couldn't save your trip to 1981/)
    expect(game()).toBe(before)
  }, 30_000)

  it('is called off when the game moves on while the trip saves', async () => {
    store.startNewLife({ seed: 41, year: 1980, countryId: 'us' })
    drain()
    await live(2)
    const b = controlledBackend()
    setSaveBackend(b)

    const trip = store.travelBack(1)
    await writesReach(b, 1)
    // A tap in the gap while the write is in flight.
    store.act((g) => {
      g.character.stats.looks = 43
    })
    const moved = game()
    b.settle(0)
    await writesReach(b, 2)
    b.settle(1)

    expect(await trip).toBe(false)
    expect(game()).toBe(moved)
    expect(game().character.age).toBe(2)
    expect(store.getApp().timeTravel).toMatchObject({
      busy: false,
      error: 'The Time Machine trip was called off: the game moved on while it saved.',
    })
    expect(store.getApp().timeStops.map((s) => s.age)).toContain(1)
  }, 30_000)
})

describe('the page', () => {
  const EM_DASH = String.fromCharCode(0x2014)
  const EN_DASH = String.fromCharCode(0x2013)

  it('main.tsx boots through bootApp, reads the flag where it is used, and skips save.ts', () => {
    const main = read('src/main.tsx')
    expect(main).toContain("from './boot'")
    expect(main).toContain("from './game/save-hydrate'")
    expect(main).toContain("from './game/save-store'")
    expect(main).not.toMatch(/from '\.\/game\/save'/)
    expect(main).toMatch(/hydrateSaves\(\s*\{\s*idb:\s*FLAGS\.idbSaves\s*\}\s*\)/)
    expect(main).toContain('#root element is missing')
  })

  it('index.html has a status splash inside #root', () => {
    const html = read('index.html')
    expect(html).toMatch(/<div id="root">\s*<div class="boot" role="status">Loading your life<\/div>\s*<\/div>/)
    expect(html).toMatch(/#566072/)
    expect(html).toMatch(/#eef2f7/)
    expect(html).toMatch(/prefers-color-scheme:\s*dark/)
  })

  it('has no em-dash or en-dash in what this task wrote', () => {
    for (const rel of ['src/boot.ts', 'src/main.tsx', 'index.html', 'test/save-boot.test.ts']) {
      const text = read(rel)
      expect(text.includes(EM_DASH), `${rel} has an em-dash`).toBe(false)
      expect(text.includes(EN_DASH), `${rel} has an en-dash`).toBe(false)
    }
  })
})
