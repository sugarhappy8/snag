// R2-S12 (K.5 and A.K9): the save budgets, measured on a 50-year life. This is the gate of the Save track: each `it` is one budget,
// so the one that fails names the lever (the economy diet and the shape tables of R2-S10 and R2-S11, an entity chunk, a core row).
//
//   (a) the head (the core) at most 400,000 characters, heavy and light
//   (b) the world chunk at most 1,000,000 characters and 600,000 bytes gzipped
//   (c) bytes written per tap: the head each tap, and no chunk while nothing a chunk holds changes
//   (d) reload gives the very JSON that was encoded, through the codec and through migrateSave
//   (e) the same life as v4.1.1 saved is at least 20% smaller, raw and gzipped
//   (f) the node-cap review: the cap stays at 500,000 and the life uses a fraction of it; each chunk stays inside its slice's caps
//   (g) the Time Machine stores no more than v4.1.1 did
//   (h) the guard of the world adapter: a module's slice names are slices, and a `world.<name>` is a registered shard
// and a section on the real world shards under act(): the S8 cases (shared roots, a write into one throws, the ledger stays
// writable) again on a 40-year life now that Ledger-world's shards exist.
//
// The lives are built once: the heavy one is a founder born in 1950 with twelve companies, kept alive to 80 (the roadmap's
// 50-year probe); the light one has none. A life is `findSeed`'s first founder alive at the end, the way scripts/save-size.ts picks.
import { readFileSync } from 'node:fs'
import { gunzipSync, gzipSync } from 'node:zlib'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ageUp } from '../src/game/aging'
import { businessAssets } from '../src/game/business/state'
import { addMoney } from '../src/game/core'
import { countNodes, hasSlice, sliceOf } from '../src/game/kernel/slices'
import { MODULES } from '../src/game/modules'
import { activitiesMenu, assetsMenu, occupationMenu } from '../src/game/menus'
import { registeredSlices } from '../src/game/kernel/registry'
import { assembleSave, encodeSave, inlineSave, neededChunkIds, type EncodedSave } from '../src/game/save-codec'
import { cloneForAct } from '../src/game/save-clone'
import { LOCAL_SNAPSHOT_BUDGET, saveGame } from '../src/game/save'
import { memorySaveBackend, type SyncSaveBackend } from '../src/game/save-backends'
import { resetSaveStoreForTests, setSaveBackend } from '../src/game/save-store'
import { isLoadableGame, migrateSave } from '../src/game/save-schema'
import type { GameState, MenuAction, MenuNode } from '../src/game/types'
import { recordFact } from '../src/game/world/facts'
import { shardNames } from '../src/game/world/state'
import { syncWorld } from '../src/game/world/sync'
import { FailureLog, formatFailures, probeActions } from './fuzz-kit'
import { memoryChunkStore, memoryLocalStorage } from './save-kit'
import { probeLife, type ProbeOptions } from './probe-life'
import { findSeed } from './seed-kit'

// --- The budgets, one place each (D.11 and the roadmap's save acceptance) --------------------------------------------------------

/** The head of a save, in characters: the core, what a tap pays for. */
const HEAD_BUDGET_CHARS = 400_000
/** The world chunk after 50 years: characters, and bytes at gzip level 6 (as scripts/save-size.ts measures). */
const WORLD_BUDGET_CHARS = 1_000_000
const WORLD_BUDGET_GZIP = 600_000
/** Characters of chunks a tap may write: none today, because nothing a chunk holds changes between two age-ups. */
const TAP_CHUNK_BUDGET_CHARS = 150_000
/** "Saves 20 to 30% smaller" than v4.1.1 on the same life: stored size at most this share of the old one. */
const SMALLER_THAN_V411 = 0.8
/** Half of the node cap of a loaded save (save-schema.ts MAX_JSON_NODES, 500,000): a 50-year life must stay well inside it. */
const NODE_BUDGET = 250_000
/** The slice caps the review keeps (R2-S1 table): the economy and the log. A chunk is held to the sum of its slices'. */
const NODE_CAP_OF_A_LOADED_SAVE = 500_000

/**
 * What v4.1.1 stored for ten Time Machine snapshots at ages 61 to 70 of this same life shape (a 1950 founder with twelve companies,
 * seed 1, kept alive), in characters of keys and values: 1,227,273, which is 81.8% of the 1,500,000 localStorage budget. Measured by
 * playing the life and calling takeSnapshot on the v4.1.1 tree (git archive v4.1.1, scripts/save-fixtures.ts' localStorage shim,
 * memorySnapshotBackend). The audit's "45.9% used" is the figure of a lighter life: this one is the heavy end.
 */
const V411_TEN_SNAPSHOTS_CHARS = 1_227_273

// --- The lives -------------------------------------------------------------------------------------------------------------------

const BIRTH_YEAR = 1950
const YEARS = 50

interface Life {
  g: GameState
  /** The state at the start of each year from age 61 to 70 (the Time Machine's ten stops), copied as it was. */
  stops: GameState[]
}

/**
 * The first founder alive at the end of a `years`-year life with `businesses` companies and alive after one more year, the one the taps of
 * (c) play on from it (a founder who dies of old age in that year has no menu left to tap); the stops are kept for ages 61 to 70.
 */
function life(businesses: number, label: string, years = YEARS): Life {
  let found: Life | undefined
  findSeed(
    (seed) => {
      const stops: GameState[] = []
      const opts: ProbeOptions = {
        seed,
        birthYear: BIRTH_YEAR,
        businesses,
        years,
        keepAlive: true,
        onYear: (state) => {
          if (state.character.age >= 61 && state.character.age <= 70) stops.push(structuredClone(state))
        },
      }
      const g = probeLife(opts)
      if (!g.character.alive) return false
      const next = structuredClone(g)
      playYear(next)
      if (!next.character.alive) return false
      found = { g, stops }
      return true
    },
    { label, tries: 60 },
  )
  return found!
}

let heavy: Life
let light: Life

beforeAll(() => {
  heavy = life(12, 'a 1950 founder with twelve companies, alive at 80')
  light = life(0, 'a 1950 founder with no company, alive at 80')
}, 900_000)

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const gz = (text: string): number => gzipSync(text, { level: 6 }).length

/** The text of a chunk of the encode, by name. */
function chunkText(e: EncodedSave, name: string): string {
  const ref = e.manifest[name]
  if (ref === undefined) throw new Error(`the save has no chunk ${name}`)
  return e.chunks.get(ref.id)!
}

/** One year the way the store plays it: the popups cleared, the founder kept alive. */
function playYear(g: GameState): void {
  g.queue = []
  g.character.stats.health = 100
  g.character.conditions = []
  ageUp(g)
}

// --- (a) and (b): the head and the world chunk -----------------------------------------------------------------------------------

describe('the size of the parts of a 50-year save', () => {
  it('is alive at the end, old, and busy where it should be', () => {
    expect(heavy.g.character.alive).toBe(true)
    expect(heavy.g.character.age).toBe(80)
    // Twelve companies were founded; a few close in fifty years, so the test asks for most of them.
    expect(businessAssets(heavy.g).length).toBeGreaterThanOrEqual(8)
    expect(businessAssets(light.g)).toHaveLength(0)
    expect(light.g.character.age).toBe(80)
    expect(heavy.stops).toHaveLength(10)
  })

  it('(a) has a head of at most 400,000 characters, heavy and light', () => {
    for (const [name, l] of [['heavy', heavy], ['light', light]] as const) {
      const e = encodeSave(l.g)
      expect(e.head.length, `the ${name} head`).toBeLessThanOrEqual(HEAD_BUDGET_CHARS)
      expect(e.stats.coreChars).toBe(e.head.length)
    }
  })

  it('(b) has a world chunk of at most 1,000,000 characters and 600,000 bytes gzipped, heavy and light', () => {
    for (const [name, l] of [['heavy', heavy], ['light', light]] as const) {
      const text = chunkText(encodeSave(l.g), 'world')
      expect(text.length, `the ${name} world chunk`).toBeLessThanOrEqual(WORLD_BUDGET_CHARS)
      expect(gz(text), `the ${name} world chunk gzipped`).toBeLessThanOrEqual(WORLD_BUDGET_GZIP)
    }
  })
})

// --- (c) bytes per tap -----------------------------------------------------------------------------------------------------------

/**
 * Enabled actions of the three tabs that ask for no input, in menu order: the rows a player taps between two birthdays. A group is
 * opened one level down. The ones that end a life are left out.
 */
function menuActions(g: GameState, limit: number): MenuAction[] {
  const out: MenuAction[] = []
  const visit = (nodes: MenuNode[], depth: number): void => {
    for (const n of nodes) {
      if (out.length >= limit) return
      if (n.visible && !n.visible(g)) continue
      if (n.type === 'action') {
        if (n.input || n.disabledReason?.(g) || n.id === 'surrenderLife' || /suicide/i.test(n.id)) continue
        out.push(n)
      } else if (n.type === 'menu' && depth < 2 && !n.disabledReason?.(g)) {
        visit(n.children(g), depth + 1)
      }
    }
  }
  for (const menu of [activitiesMenu, occupationMenu, assetsMenu]) visit(menu.children(g), 1)
  return out
}

describe('(c) the bytes a tap writes', () => {
  it('writes the head on every tap and no chunk while nothing a chunk holds changes, over ten taps between two birthdays', () => {
    const store = memoryChunkStore()
    const inner = memorySaveBackend()
    let headWrites = 0
    const backend: SyncSaveBackend = {
      ...inner,
      write: (record) => {
        headWrites++
        return inner.write(record)
      },
      chunks: store,
    }
    resetSaveStoreForTests()
    setSaveBackend(backend)
    try {
      // The first save writes every chunk of the life; a birthday makes a new economy and a new log year, so its save writes some.
      let committed = heavy.g
      expect(saveGame(committed)).toBe(true)
      expect(store.putSizes.length).toBeGreaterThan(2)
      let draft = cloneForAct(committed)
      playYear(draft)
      expect(saveGame(draft)).toBe(true)
      committed = draft

      // Ten taps: the real rows of the menus, then bookings and a log line to make up ten if the menus gave fewer.
      const rows = menuActions(committed, 10)
      expect(rows.length, 'menu rows with no input').toBeGreaterThanOrEqual(3)
      const putsBefore = store.putSizes.length
      const headsBefore = headWrites
      const worldId = encodeSave(committed).manifest.world!.id
      let ran = 0
      for (let i = 0; i < 10; i++) {
        draft = cloneForAct(committed)
        const row = rows[i]
        if (row !== undefined) {
          try {
            row.run(draft)
            ran++
          } catch (err) {
            // A row that needs more than the state it is given is not a tap; a write into a shared root is a bug and fails here.
            if (err instanceof TypeError) throw err
          }
        } else {
          addMoney(draft, i % 2 === 0 ? 40 : -25, i % 2 === 0 ? 'wage' : 'living')
          draft.character.stats.happiness = Math.min(100, draft.character.stats.happiness + 1)
        }
        expect(saveGame(draft)).toBe(true)
        committed = draft
      }
      expect(ran, 'menu rows that ran').toBeGreaterThanOrEqual(3)
      const written = store.putSizes.slice(putsBefore).reduce((a, n) => a + n, 0)
      console.log(`bytes per tap: ${ran} real rows and ${10 - ran} bookings wrote ${written} characters of chunks in ten taps (budget ${TAP_CHUNK_BUDGET_CHARS}); the head was written ${headWrites - headsBefore} times`)
      expect(headWrites - headsBefore, 'one head per tap').toBe(10)
      // The number names the shard that changed: a chunk written here is a part of the save a tap should not touch.
      expect(written).toBeLessThanOrEqual(TAP_CHUNK_BUDGET_CHARS)
      expect(encodeSave(committed).manifest.world!.id, 'the world chunk after ten taps').toBe(worldId)
    } finally {
      resetSaveStoreForTests()
    }
  }, 120_000)
})

// --- (d) reload identity ---------------------------------------------------------------------------------------------------------

/** The head and chunk texts of a save as the store would hand them back. */
function reloaded(g: GameState): ReturnType<typeof assembleSave> {
  const e = encodeSave(g)
  const head = JSON.parse(e.head) as Record<string, unknown>
  const texts = new Map<string, string | null>(neededChunkIds(head).map((id) => [id, e.chunks.get(id) ?? null]))
  return assembleSave(head, texts)
}

describe('(d) reload gives the JSON that was saved', () => {
  it('is exact through the codec, heavy and light, with no chunk lost', () => {
    for (const [name, l] of [['heavy', heavy], ['light', light]] as const) {
      const a = reloaded(l.g)
      expect(a.kind, name).toBe('ready')
      if (a.kind !== 'ready') continue
      expect(a.lost, name).toEqual([])
      expect(JSON.stringify(a.game), `the ${name} life`).toBe(inlineSave(l.g))
    }
  })

  it('is exact through migrateSave too: the record the game plays on is the one it saved', () => {
    for (const [name, l] of [['heavy', heavy], ['light', light]] as const) {
      const a = reloaded(l.g)
      if (a.kind !== 'ready') throw new Error(`${name}: ${a.reason}`)
      const m = migrateSave(a.game, { versions: a.versions })
      expect(m.kind, name).toBe('ready')
      if (m.kind !== 'ready') continue
      expect(isLoadableGame(m.game)).toBe(true)
      expect(JSON.stringify(m.game), `the ${name} life`).toBe(inlineSave(l.g))
    }
  })

  it('makes the same chunks again, so the first save after a boot writes none', () => {
    for (const [name, l] of [['heavy', heavy], ['light', light]] as const) {
      const a = reloaded(l.g)
      if (a.kind !== 'ready') throw new Error(`${name}: ${a.reason}`)
      const m = migrateSave(a.game, { versions: a.versions })
      if (m.kind !== 'ready') throw new Error(`${name}: ${m.kind}`)
      const before = encodeSave(l.g)
      const after = encodeSave(m.game)
      expect(after.manifest, `the ${name} manifest after a reload`).toEqual(before.manifest)
      expect(after.head, `the ${name} head after a reload`).toBe(before.head)
    }
  })
})

// --- (e) smaller than v4.1.1 -----------------------------------------------------------------------------------------------------

describe('(e) the same life as v4.1.1 saved it', () => {
  it('stores at least 20% fewer characters and gzipped bytes', () => {
    const text = gunzipSync(readFileSync('test/fixtures/save-v4.1.1-heavy.json.gz')).toString()
    const m = migrateSave(JSON.parse(text))
    if (m.kind !== 'ready') throw new Error(`the fixture did not migrate: ${m.kind}`)
    const e = encodeSave(m.game)
    const parts = [e.head, ...e.chunks.values()]
    const raw = parts.reduce((a, p) => a + p.length, 0)
    const zipped = parts.reduce((a, p) => a + gz(p), 0)
    const oldRaw = text.length
    const oldZipped = gz(text)
    console.log(
      `v4.1.1 heavy fixture: ${oldRaw} characters, ${oldZipped} bytes gzipped; now ${raw} characters (${((raw / oldRaw) * 100).toFixed(1)}%) in ${parts.length} records, ` +
        `${zipped} bytes gzipped (${((zipped / oldZipped) * 100).toFixed(1)}%)`,
    )
    expect(raw, 'stored characters').toBeLessThanOrEqual(oldRaw * SMALLER_THAN_V411)
    expect(zipped, 'stored gzip bytes, every record on its own').toBeLessThanOrEqual(oldZipped * SMALLER_THAN_V411)
  }, 60_000)
})

// --- (f) the node-cap review -----------------------------------------------------------------------------------------------------

describe('(f) the node cap, reviewed', () => {
  it('leaves a 50-year life well inside half the 500,000 nodes a loaded save may hold', () => {
    const nodes = countNodes(JSON.parse(inlineSave(heavy.g)), NODE_CAP_OF_A_LOADED_SAVE)
    console.log(`the heavy 50-year life holds ${nodes} nodes (the cap of a loaded save is ${NODE_CAP_OF_A_LOADED_SAVE}, this budget ${NODE_BUDGET})`)
    expect(nodes).toBeLessThanOrEqual(NODE_BUDGET)
  })

  it('keeps every chunk inside the caps of the slices it holds, and the economy inside its own', () => {
    const e = encodeSave(heavy.g)
    const nodesOf = (name: string): number => countNodes(JSON.parse(chunkText(e, name)), 10_000_000)
    // The world chunk holds the economy and the world shards: the sum of their rows. (Packed, it has fewer nodes than plain.)
    const worldCap = sliceOf('flags.worldEconomy')!.caps.nodes + sliceOf('world')!.caps.nodes
    expect(nodesOf('world')).toBeLessThanOrEqual(worldCap)
    expect(countNodes(heavy.g.flags.worldEconomy, 10_000_000), 'the economy, unpacked').toBeLessThanOrEqual(sliceOf('flags.worldEconomy')!.caps.nodes)
    for (const name of Object.keys(e.manifest)) {
      if (!name.startsWith('log.')) continue
      expect(nodesOf(name), name).toBeLessThanOrEqual(sliceOf('log')!.caps.nodes)
      expect(chunkText(e, name).length, name).toBeLessThanOrEqual(sliceOf('log')!.caps.chars)
    }
    expect(chunkText(e, 'world').length).toBeLessThanOrEqual(sliceOf('flags.worldEconomy')!.caps.chars + sliceOf('world')!.caps.chars)
  })
})

// --- (g) the Time Machine --------------------------------------------------------------------------------------------------------

/** What a Time Machine with these snapshots stores, in characters of keys and values, through the engine's own takeSnapshot. */
async function snapshotChars(states: readonly GameState[]): Promise<number> {
  // The snapshot index is read from localStorage when save.ts is first imported: a module graph of its own, with a storage to read.
  vi.resetModules()
  vi.stubGlobal('localStorage', memoryLocalStorage())
  const save = await import('../src/game/save')
  const data = new Map<string, string>()
  save.setSnapshotBackend({
    name: 'idb',
    get: async (keys) => keys.map((k) => data.get(k) ?? null),
    put: async (entries) => {
      for (const [k, v] of entries) data.set(k, v)
    },
    remove: async (keys) => {
      for (const k of keys) data.delete(k)
    },
    keys: async () => [...data.keys()],
  })
  save.startTimeline(states[0]!.lifeId, null)
  for (const g of states) expect(await save.takeSnapshot(g), `the snapshot at ${g.character.age}`).toBe(true)
  await save.snapshotWritesSettled()
  let total = 0
  for (const [k, v] of data) total += k.length + v.length
  return total
}

describe('(g) the Time Machine', () => {
  it('stores ten snapshots of the heavy life, ages 61 to 70, in no more than v4.1.1 did', async () => {
    const chars = await snapshotChars(heavy.stops)
    const share = (chars / LOCAL_SNAPSHOT_BUDGET) * 100
    console.log(`ten snapshots, ages 61 to 70: ${chars} characters, ${share.toFixed(1)}% of the ${LOCAL_SNAPSHOT_BUDGET} localStorage budget (v4.1.1: ${V411_TEN_SNAPSHOTS_CHARS}, 81.8%)`)
    expect(chars).toBeLessThanOrEqual(V411_TEN_SNAPSHOTS_CHARS)
    expect(chars, 'inside the localStorage budget').toBeLessThanOrEqual(LOCAL_SNAPSHOT_BUDGET)
  }, 300_000)

  it('stores the four snapshots of the v4.1.1 fixture in fewer characters than the v4.1.1 engine stored them', async () => {
    const fx = JSON.parse(gunzipSync(readFileSync('test/fixtures/tm-v4.1.1.json.gz')).toString()) as { entries: Record<string, string>; states: Record<string, string> }
    let old = 0
    for (const [k, v] of Object.entries(fx.entries)) old += k.length + v.length
    const states = Object.keys(fx.states)
      .map(Number)
      .sort((a, b) => a - b)
      .map((age) => {
        const m = migrateSave(JSON.parse(fx.states[String(age)]!))
        if (m.kind !== 'ready') throw new Error(`the fixture state at ${age} did not migrate`)
        return m.game
      })
    expect(states).toHaveLength(4)
    const now = await snapshotChars(states)
    console.log(`the v4.1.1 fixture's four snapshots: ${old} characters then, ${now} now (${((now / old) * 100).toFixed(1)}%)`)
    expect(now).toBeLessThan(old)
  }, 120_000)
})

// --- (h) the guard of the world adapter ------------------------------------------------------------------------------------------

describe('(h) the slices modules declare', () => {
  it('are slices, and a world.<name> is a registered shard', () => {
    const declared = MODULES.flatMap((m) => m.slices ?? [])
    expect(declared.length, 'the module list declares at least the fact store').toBeGreaterThan(0)
    for (const key of declared) {
      expect(hasSlice(key), `module slice ${key}`).toBe(true)
      if (key.startsWith('world.')) expect(shardNames(), `the shard of ${key}`).toContain(key.slice('world.'.length))
    }
    // The registry's own list is the same list: nothing is owned that no module def named.
    expect([...registeredSlices()].sort()).toEqual([...declared].sort())
    expect(declared).toContain('world.facts')
  })
})

// --- the real world shards under act() -------------------------------------------------------------------------------------------

describe('the world shards of the game, shared by act()', () => {
  let forty: GameState

  beforeAll(() => {
    forty = life(3, 'a 1950 founder with three companies, alive at 70', 40).g
  }, 600_000)

  /** The world shards that are saved as `replace` roots: every object-valued member but the ledger. */
  const sharedShards = (g: GameState): string[] =>
    Object.keys((g.world ?? {}) as Record<string, unknown>).filter((n) => n !== 'ledger' && typeof (g.world as Record<string, unknown>)[n] === 'object')

  it('has the shards the world step makes, and a ledger that stays with the core', () => {
    const world = forty.world as Record<string, unknown>
    expect(world).toBeDefined()
    expect(sharedShards(forty).length).toBeGreaterThanOrEqual(3)
    expect(world.ledger).toBeDefined()
    expect(sliceOf('world.ledger')).toMatchObject({ chunk: 'core', write: 'inplace' })
  })

  /**
   * The shards of `world` that are shaped like an entity record and that the slice table does not declare as one. An entity record is a
   * plain object of at least eight plain objects with its keys in ascending order: the shape the codec cuts into `e.<kind>.<n>` shards
   * (save-codec.ts). Ledger-world's shards are `{ v, rows: [...] }`. A shard that qualifies and changes on player actions is declared
   * `chunk: 'entities'` (R4-S5 declares world.met in world/met-slice.ts, and E6b declares world.edges): the premise of this guard, that
   * none did, ends with that declaration, so a shard the table declares as an entity slice is skipped, and one that nothing declares
   * still fails. `names` is the shard names to look at (the registered ones).
   */
  const entityShaped = (world: Record<string, unknown>, names: readonly string[] = shardNames()): string[] => {
    const found: string[] = []
    for (const name of names) {
      const shard = world[name]
      if (name === 'ledger' || typeof shard !== 'object' || shard === null || Array.isArray(shard)) continue
      if (sliceOf(`world.${name}`)?.chunk === 'entities') continue
      const keys = Object.keys(shard)
      const values = Object.values(shard)
      const ascending = keys.every((k, i) => i === 0 || keys[i - 1]! < k)
      const objects = values.every((v) => typeof v === 'object' && v !== null && !Array.isArray(v))
      if (keys.length >= 8 && ascending && objects) found.push(name)
    }
    return found
  }
  /** Eight plain objects under ascending keys: the least a shard needs to look like an entity record. */
  const eightRecords = (): Record<string, unknown> => Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`k${i}`, { n: i }]))

  it('has no shard shaped like an entity record that the slice table does not declare as an entity slice', () => {
    expect(entityShaped(forty.world as Record<string, unknown>).map((name) => `world.${name} looks like an entity record`)).toEqual([])
  })

  it('passes a life holding a met shard of eight object records, because world.met is a declared entity slice', () => {
    const world = { ...(forty.world as Record<string, unknown>), met: eightRecords() }
    expect(sliceOf('world.met')?.chunk).toBe('entities')
    expect(entityShaped(world, ['met'])).toEqual([])
    expect(entityShaped(world)).toEqual([])
  })

  it('still fails a synthetic shard of eight object records that nothing declares', () => {
    expect(sliceOf('world.junk')?.chunk).toBe('world')
    expect(entityShaped({ junk: eightRecords() }, ['junk'])).toEqual(['junk'])
    expect(entityShaped({ junk: { ...eightRecords(), k9: 1 } }, ['junk'])).toEqual([])
    expect(entityShaped({ junk: Object.fromEntries(Object.entries(eightRecords()).reverse()) }, ['junk'])).toEqual([])
    expect(entityShaped({ junk: Object.fromEntries(Object.entries(eightRecords()).slice(0, 7)) }, ['junk'])).toEqual([])
  })

  it('hands a draft the very roots of the state, frozen, and a ledger of its own that a booking may edit', () => {
    const before = JSON.stringify(forty)
    const draft = cloneForAct(forty)
    const world = draft.world as Record<string, unknown>
    const old = forty.world as Record<string, unknown>
    for (const name of sharedShards(forty)) {
      expect(world[name], name).toBe(old[name])
      expect(Object.isFrozen(world[name]), name).toBe(true)
    }
    expect(world.ledger).not.toBe(old.ledger)
    expect(Object.isFrozen(world.ledger)).toBe(false)
    // The ledger is edited in place by every booking: on the draft it must work, and the state must not feel it.
    expect(() => addMoney(draft, 25, 'gift')).not.toThrow()
    expect(JSON.stringify(draft.world!.ledger)).not.toBe(JSON.stringify(old.ledger))
    expect(JSON.stringify(forty)).toBe(before)
  })

  it('throws a write into a shared shard, however deep, and a replaced shard root goes in without a throw', () => {
    const draft = cloneForAct(forty)
    const world = draft.world as Record<string, unknown>
    for (const name of sharedShards(forty)) {
      const root = world[name] as Record<string, unknown>
      expect(() => {
        root.poke = 1
      }, name).toThrow(TypeError)
      for (const value of Object.values(root)) {
        if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
          expect(() => {
            ;(value[0] as Record<string, unknown>).poke = 1
          }, `${name} row`).toThrow(TypeError)
        }
      }
    }
    // The writers' door: a shard is replaced, never edited (world/state.ts), and a fact is such a write.
    expect(recordFact(draft, { k: 'sale.big', y: draft.year, c: draft.character.countryId, v: 3 })).toBe(true)
    expect(Object.keys(draft.world as object)).toContain('facts')
    expect(Object.keys(forty.world as object)).not.toContain('facts')
  })

  it('runs the world step on a draft: the index shards are replaced, and the state the draft came from does not change', () => {
    const before = JSON.stringify(forty)
    const draft = cloneForAct(forty)
    draft.year += 1
    expect(() => syncWorld(draft)).not.toThrow()
    expect(JSON.stringify(forty)).toBe(before)
    expect((draft.world as { y?: number }).y).toBe(draft.year)
  })

  it('runs every enabled menu action of the 40-year life on a draft that shares the frozen roots, and none writes into one', () => {
    // The fuzz kit's action probe (test/fuzz-kit.ts probeActions) deep-freezes the state, makes each draft with cloneForAct and
    // classifies a write into a shared root as `action-stale-throw`: the detector for an in-place writer of a replace slice.
    const g = structuredClone(forty)
    g.queue = []
    const log = new FailureLog()
    const ran = probeActions(g, log, 3, { depth: 1, max: 150 })
    expect(ran).toBeGreaterThan(20)
    expect(formatFailures(log)).toBe('')
    expect(log.list()).toEqual([])
  }, 240_000)

  it('plays four birthdays, each on a draft of the one before, with no write into a shared root and the same JSON as structured clones', () => {
    let viaClone = structuredClone(forty)
    let viaAct: GameState = forty
    const frozenBefore = JSON.stringify(forty)
    for (let i = 0; i < 4; i++) {
      viaClone = structuredClone(viaClone)
      playYear(viaClone)
      viaAct = cloneForAct(viaAct)
      playYear(viaAct)
    }
    expect(JSON.stringify(viaAct)).toBe(JSON.stringify(viaClone))
    expect(JSON.stringify(forty)).toBe(frozenBefore)
    // And what was played saves and loads again as itself.
    const a = reloaded(viaAct)
    if (a.kind !== 'ready') throw new Error(a.reason)
    expect(a.lost).toEqual([])
    expect(JSON.stringify(a.game)).toBe(inlineSave(viaAct))
  }, 300_000)
})
