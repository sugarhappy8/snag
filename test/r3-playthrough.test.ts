// R3 exit gate: the three-life playthrough (scripts/r3-playthrough.ts). Opt-in, so CI never plays it:
//
//   R3_PLAY=1 R3_PLAY_OUT=<dir> /Users/saeed/projects/anotherlife/wt/bin/vt22 test/r3-playthrough.test.ts
//
// It plays three seeded lives through the real store flow (ageUpAction with the year card on, every popup answered through the store,
// every tap a menu row found by its label) and writes r3-playthrough.md (the transcript, a summary on top), three saves for the
// screenshots (shot-research.json, shot-market.json, shot-card.json, and the card as a popup in shot-card-popup.json) and shots.md into
// R3_PLAY_OUT. It is a reading of the game, not a test of it: what it asserts is that the run produced what it is for, that each save is
// one the app would load, and that the snippet shots.md gives, run against the real save code (a fake IndexedDB, as test/save-hydrate.test.ts
// has), puts that very life back after a reload. The seeds are found, not pinned. The script is imported inside the tests, so a run
// without R3_PLAY=1 loads none of it.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlaythroughResult } from '../scripts/r3-playthrough'
import { fakeIndexedDb, memoryLocalStorage } from './save-kit'

const ON = process.env.R3_PLAY === '1'
// A run that is not asked for makes nothing, not even a folder: the output goes where R3_PLAY_OUT says, else to a temporary one.
const OUT = !ON ? '' : (process.env.R3_PLAY_OUT ?? mkdtempSync(join(tmpdir(), 'r3-play-')))
afterAll(() => {
  if (ON && process.env.R3_PLAY_OUT === undefined) rmSync(OUT, { recursive: true, force: true })
})

describe.skipIf(!ON)('R3 playthrough (R3_PLAY=1)', () => {
  let res: PlaythroughResult

  it(
    'plays three lives and writes the transcript, the saves and shots.md',
    async () => {
      const P = await import('../scripts/r3-playthrough')
      res = await P.runPlaythrough()
      const files = P.writeOutputs(OUT, res)
      expect(files.map((f) => f.slice(OUT.length + 1))).toEqual(expect.arrayContaining(['r3-playthrough.md', 'shots.md', 'shot-research.json', 'shot-market.json', 'shot-card.json']))
      expect(res.lives).toHaveLength(3)
    },
    1_800_000,
  )

  it('opens with a summary of what a player sees, the numbers and what is confusing, and has a part for each life', () => {
    const md = readFileSync(join(OUT, 'r3-playthrough.md'), 'utf8')
    expect(md.indexOf('### What a player sees')).toBeGreaterThan(0)
    expect(md.indexOf('### Numbers')).toBeGreaterThan(md.indexOf('### What a player sees'))
    expect(md.indexOf('### Anything confusing')).toBeGreaterThan(md.indexOf('### Numbers'))
    expect(md.indexOf('## Life 1')).toBeGreaterThan(md.indexOf('### Anything confusing'))
    expect(md).toContain('## Life 2')
    expect(md).toContain('## Life 3')
  })

  it('writes saves the app would load, with nothing waiting in the queue, and a shots.md that names each with its taps and its snippet', async () => {
    const P = await import('../scripts/r3-playthrough')
    const shots = readFileSync(join(OUT, 'shots.md'), 'utf8')
    expect(res.shots.map((s) => s.name).sort()).toEqual(['card', 'card-popup', 'market', 'research'])
    for (const s of res.shots) {
      expect(P.loadable(readFileSync(join(OUT, s.file), 'utf8')), s.file).toBe(true)
      // The popup card is the one state with a popup waiting: the card itself.
      const queue = (JSON.parse(s.json) as { queue: { digest?: unknown }[] }).queue
      expect(queue.length, `${s.file} queue`).toBe(s.name === 'card-popup' ? 1 : 0)
      if (s.name === 'card-popup') expect(queue[0]!.digest, 'the one popup is the card').toBeDefined()
      expect(shots).toContain(s.file)
      expect(shots).toContain(P.loadSnippet(s.file))
      for (const t of s.taps) expect(shots).toContain(t.join(' > '))
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// The snippet against the save code. The steps below are the snippet's, in its order (the snippet itself runs in a browser, where its
// dynamic imports name /src/... paths), and a guard holds the snippet to those steps.

describe.skipIf(!ON)('the loading snippet of shots.md, run against the save code', () => {
  let storage: ReturnType<typeof memoryLocalStorage>

  beforeEach(async () => {
    const { resetSaveStoreForTests } = await import('../src/game/save-store')
    resetSaveStoreForTests()
    storage = memoryLocalStorage()
    vi.stubGlobal('localStorage', storage)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** What the page does before the snippet runs: boots over the same IndexedDB (the app's own hydrate). */
  async function boot(factory: IDBFactory): Promise<void> {
    const { resetSaveStoreForTests } = await import('../src/game/save-store')
    const { hydrateSaves } = await import('../src/game/save-hydrate')
    resetSaveStoreForTests()
    await hydrateSaves({ factory })
  }

  /** The snippet, step by step. `clean` is its legacy-slot cleanup (the part that guards against a stale copy winning the next boot). */
  async function runSnippet(json: string, clean: boolean): Promise<void> {
    const { migrateSave } = await import('../src/game/save-schema')
    const { saveGame } = await import('../src/game/save')
    const { activeBackendName, flushSave } = await import('../src/game/save-store')
    const { localSaveBackend } = await import('../src/game/save-backends')
    const state = JSON.parse(json)
    expect(migrateSave(JSON.parse(json)).kind).toBe('ready')
    expect(saveGame(state)).toBe(true)
    expect(await flushSave()).toBe(true)
    if (clean && activeBackendName() === 'idb') {
      const legacy = localSaveBackend()
      legacy.remove()
      legacy.chunks?.remove(legacy.chunks.ids())
    }
  }

  /** The page after location.reload(): new modules over the same storage, then what Continue Life's loadGame finds. */
  async function reload(factory: IDBFactory): Promise<{ lifeId: string; age: number; year: number; queue: number; source: string }> {
    const { hydrateSaves } = await import('../src/game/save-hydrate')
    const { resetSaveStoreForTests } = await import('../src/game/save-store')
    const { loadGame } = await import('../src/game/save')
    resetSaveStoreForTests()
    const out = await hydrateSaves({ factory })
    const g = loadGame()
    if (!g) throw new Error('Continue Life would find no game')
    return { lifeId: g.lifeId, age: g.character.age, year: g.year, queue: g.queue.length, source: out.source }
  }

  const shotsOf = (): { name: string; json: string }[] => {
    const names = ['research', 'market', 'card', 'card-popup'] as const
    return names.map((n) => ({ name: n, json: readFileSync(join(OUT, n === 'card-popup' ? 'shot-card-popup.json' : `shot-${n}.json`), 'utf8') }))
  }

  it('puts each life back after a reload, on a clean profile and over a life the profile already holds', async () => {
    const { IDB_MARKER_KEY } = await import('../src/game/save-backends')
    const shots = shotsOf()
    for (const s of shots) {
      const want = JSON.parse(s.json) as { lifeId: string; year: number; character: { age: number }; queue: unknown[] }
      // A clean profile.
      let factory = fakeIndexedDb()
      await boot(factory)
      await runSnippet(s.json, true)
      expect(await reload(factory), s.name).toMatchObject({ lifeId: want.lifeId, age: want.character.age, year: want.year, queue: want.queue.length, source: 'idb' })
      // A profile that holds another life already, in IndexedDB.
      const other = shots.find((x) => x.name !== s.name)!
      factory = fakeIndexedDb()
      await boot(factory)
      await runSnippet(other.json, true)
      await reload(factory)
      await runSnippet(s.json, true)
      expect(await reload(factory), `${s.name} over ${other.name}`).toMatchObject({ lifeId: want.lifeId, age: want.character.age, queue: want.queue.length })
      expect(storage.getItem(IDB_MARKER_KEY)).toBe('1')
    }
  }, 600_000)

  it('needs the legacy slot cleared: a stale copy there wins the next boot of a browser that keeps its life in IndexedDB', async () => {
    const { SAVE_KEY } = await import('../src/game/save-backends')
    const by = (name: string): string => shotsOf().find((x) => x.name === name)!.json
    // The life the page keeps, a stale backup of that same life in the legacy slot, and another life. The backup is the kept
    // save itself, so the case does not depend on which life the playthrough's popup card happens to come from.
    const [mine, wanted] = [by('research'), by('market')]
    const stale = mine
    const life = (json: string): string => (JSON.parse(json) as { lifeId: string }).lifeId
    expect(life(wanted)).not.toBe(life(mine))
    /** A page that keeps the life `mine` in IndexedDB, with an older backup of it left in the legacy slot while it ran. */
    const staged = async (): Promise<IDBFactory> => {
      const factory = fakeIndexedDb()
      await boot(factory)
      await runSnippet(mine, true)
      await reload(factory)
      storage.setItem(SAVE_KEY, stale)
      return factory
    }
    // Without the cleanup the life the snippet saved loses to the stale copy ...
    let factory = await staged()
    await runSnippet(wanted, false)
    expect((await reload(factory)).lifeId, 'without the cleanup').toBe(life(stale))
    // ... and with it, it is the one that loads.
    factory = await staged()
    await runSnippet(wanted, true)
    expect((await reload(factory)).lifeId, 'with the cleanup').toBe(life(wanted))
  }, 600_000)

  it('is held to those steps: the snippet in shots.md makes the same calls in the same order', async () => {
    const P = await import('../scripts/r3-playthrough')
    const text = P.loadSnippet('shot-x.json')
    const steps = [
      "fetch('/shot-x.json'",
      "import('/src/game/save-schema.ts')",
      "migrateSave(JSON.parse(text)).kind !== 'ready'",
      "import('/src/game/save.ts')",
      "import('/src/game/save-store.ts')",
      'saveGame(state)',
      'await flushSave()',
      "activeBackendName() === 'idb'",
      "import('/src/game/save-backends.ts')",
      'localSaveBackend()',
      'legacy.remove()',
      'legacy.chunks?.remove(legacy.chunks.ids())',
      'location.reload()',
    ]
    let at = -1
    for (const step of steps) {
      const next = text.indexOf(step)
      expect(next, step).toBeGreaterThan(at)
      at = next
    }
  })
})
