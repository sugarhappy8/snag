// R4-E6b (D.3, X9, X10): the writer of edges, `putEdge` and `remember` (src/game/world/edge-write.ts), and the save slice of the edge
// map, `world.edges` (src/game/world/edges-slice.ts). The second entity slice of the game and the first one that a played life
// writes: a slice of the chunk `entities`, cut into eight records `e.edge.<n>` by a hash of the key, so a tap that changes one edge
// writes one small chunk and the head, and never the `world` chunk. Nothing in the game calls the writers yet (R4-E7 is the first caller).
//
// What the file proves, in the order of the plan:
//   1. putEdge: the key and the patch are checked; a sorted insert keeps the keys ascending; every untouched entry keeps its identity;
//      the root is replaced, never edited (a deep-frozen root is the alarm); `null` removes; a map at 1,200 evicts the lowest-salience
//      unbound edge and a map full of bound edges refuses; the caps of feuds, debts, `n`/`d` and memories hold; 100 x the caps stay
//      at the caps and keep their bound edges.
//   2. remember: a no-op unless the life is stamped; writes `kind.year.weight.by` on `who > ego`; applies MEMORY_FX once, scaled by the
//      weight; once a kind-year; 8 an edge and 4,000 in all.
//   3. The row of the slice, and 1,200 edges at their worst in the codec: at most eight chunks, no unsorted entity, the very JSON back.
//   4. A tap that changes one edge: one chunk id changes and the world chunk id does not (the codec, the save store, the bytes printed).
//   5. The Time Machine. 6. Every fixture by the release that recorded it. 7. Twelve hostile `edges` or `social` worlds put into the
//   oldest fixture. 8. Forged edge chunks. 9. The world budget with the edges and the stamp at their caps.
//
// The fixtures are read by a directory listing and the version comes from the file name (save-v<major>.<minor>.<patch>[-name]), so the
// release that records one (R4-P6 records a stamped v5.3.0 life) needs no edit here.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import type { EntityRef } from '../src/game/kernel/ids'
import { countNodes, listSlices, sliceOf } from '../src/game/kernel/slices'
import { personEntity } from '../src/game/kernel/person-ref'
import { createNewLife } from '../src/game/life'
import { createPerson } from '../src/game/people'
import { loadGame, loadSnapshot, memorySnapshotBackend, saveGame, setSnapshotBackend, snapshotWritesSettled, startTimeline, takeSnapshot } from '../src/game/save'
import { memorySaveBackend, type SyncSaveBackend } from '../src/game/save-backends'
import { cloneForAct } from '../src/game/save-clone'
import { HEAD_CHUNKS_KEY, HEAD_VERSIONS_KEY, assembleSave, encodeSave, inlineSave, neededChunkIds, shardOf, textSum, type EncodedSave } from '../src/game/save-codec'
import { isLoadableGame, migrateSave } from '../src/game/save-schema'
import { resetSaveStoreForTests, setSaveBackend } from '../src/game/save-store'
import type { GameState, Person } from '../src/game/types'
import { worldBudget } from '../src/game/world/budget'
import { EDGE_CAPS, WORLD_NODE_CAP } from '../src/game/world/caps'
import { putEdge, remember } from '../src/game/world/edge-write'
import { MEMORY_FX, MEMORY_KINDS, formatMemory, type MemoryKind } from '../src/game/world/edge-memory'
import { LINK_KINDS, edgeKey, edgeLocalBound, edgeProblems, edgesOf, liveFeuds, memoriesOf, normalizeEdges, openDebts, readEdge, salience, type Edge, type EdgeMap } from '../src/game/world/edges'
import { worldProblems } from '../src/game/world/invariants'
import { playerRef } from '../src/game/world/people'
import '../src/game/world/shards'
import { SOCIAL_MS_MAX, normalizeSocial, readSocial, socialProblems, stampSocial } from '../src/game/world/social'
import { readWorld, worldShard } from '../src/game/world/state'
import { trapRng } from './effort-kit'
import { deepFreeze, installStorageShim } from './fuzz-kit'
import { makeTestGame } from './helpers'
import { memoryChunkStore } from './save-kit'

type Rec = Record<string, unknown>

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const FIXTURE_DIR = join(ROOT, 'test', 'fixtures')

// A fixed life as a constant, not a pin of the form the seed ratchet counts (test/seed-pins.test.ts).
const LIFE_SEED = 3
const BIRTH_YEAR = 1990

// ---------------------------------------------------------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------------------------------------------------------

const ME: EntityRef = 'person:me'
const pad = (n: number, w = 4): string => String(n).padStart(w, '0')
const pr = (n: number | string): EntityRef => `person:p${typeof n === 'number' ? pad(n) : n}`
/** The key of the edge `person:p<n> > ego`. */
const key = (n: number | string, to: EntityRef = ME): string => `${pr(n)}>${to}`
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
const mem = (kind: MemoryKind, year: number, w = 1, by: 'ego' | 'them' = 'ego'): string => formatMemory({ kind, year, w, by })
const json = (x: unknown): string => JSON.stringify(x)
/** JSON with the keys of every object sorted: the content of a state, whatever order its parts were first written in. */
const canonical = (x: unknown): string => JSON.stringify(x, (_key, v: unknown) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => cmp(a, b))) : v))

/** A valid edge. */
const E = (over: Partial<Edge> = {}): Edge => ({ t: 50, f: 50, r: 50, s: 0, o: 0, y: 2000, l: 2001, ...over })

/** A map with its keys in ascending code-unit order, the way a stored map is. */
function mapOf(entries: readonly (readonly [string, unknown])[]): Record<string, unknown> {
  return Object.fromEntries([...entries].sort((a, b) => cmp(a[0], b[0])))
}

/** n edges, `person:p0000 > me` upward, each with a salience of its own unless `make` says otherwise (f runs 20 to 89). */
function many(n: number, make: (i: number) => Partial<Edge> = () => ({})): Record<string, Edge> {
  return mapOf(Array.from({ length: n }, (_, i) => [key(i), E({ f: 20 + (i % 70), ...make(i) })] as const)) as Record<string, Edge>
}

/** A game whose world holds exactly this raw edge map (no map when `edges` is undefined). */
function gameWith(edges: unknown, year = 2030): GameState {
  const g = makeTestGame(1)
  g.year = year
  if (edges !== undefined) (g as { world?: unknown }).world = { v: 1, edges }
  return g
}

/** A stamped game: the social stamp of this year, and this raw edge map. */
function stampedWith(edges: unknown, year = 2030): GameState {
  const g = gameWith(edges, year)
  stampSocial(g)
  return g
}

const stored = (g: Pick<GameState, 'world'>): Record<string, Edge> => ((g.world as { edges?: Record<string, Edge> } | undefined)?.edges ?? {})
const rootOf = (g: Pick<GameState, 'world'>): unknown => (g.world as { edges?: unknown } | undefined)?.edges
const keysOf = (x: unknown): string[] => Object.keys(x as object)
const sortedKeys = (ks: readonly string[]): boolean => ks.every((k, i) => i === 0 || ks[i - 1]! < k)

/** A valid root: it reads as itself, nothing is wrong with it, and its keys ascend. */
function expectValidRoot(g: Pick<GameState, 'world'>, why = 'the map'): void {
  const root = rootOf(g)
  expect(root, why).toBeDefined()
  expect(normalizeEdges(root), `${why}: the reader gives it back as itself`).toBe(root)
  expect(edgeProblems(root), `${why}: its problems`).toEqual([])
  expect(sortedKeys(keysOf(root)), `${why}: keys ascend`).toBe(true)
}

/** The worst case the model can reach, valid: 1,200 edges of a link kind, a call-in and 3 or 4 memories (4,000 in all), `n` and `d` on the 120 strongest, 12 feuds, 40 debts, and 40 secrets of 6 holders. Keys use long sids at both ends. */
function worstMap(year = 2030): Rec {
  const kinds: MemoryKind[] = ['gift_given', 'loan_given', 'told_gently', 'kept_secret']
  const sid = (i: number): string => `person:astronaut.abcdefghijkl.${1950 + (i % 60)}.${pad(i)}`
  const entries: [string, unknown][] = []
  for (let i = 0; i < EDGE_CAPS.edges; i++) {
    const e: Edge = E({
      // the first 120 are the most salient (200 and up; no other edge reaches 177), so n and d sit where the model allows them
      f: i < EDGE_CAPS.talkEdges ? 100 : 40 + (i % 60) + 0.25,
      s: i < EDGE_CAPS.talkEdges ? 100 : (i % 7) + 0.5,
      o: (i % 21) - 10.75,
      t: 55.5,
      r: 48.25,
      y: year - 20,
      l: year,
      k: LINK_KINDS[i % LINK_KINDS.length]!,
      c: year - (i % 20),
      m: Array.from({ length: i < 400 ? 4 : 3 }, (_, j) => mem(kinds[j]!, year - 40 + j * 2)),
    })
    if (i < EDGE_CAPS.talkEdges) {
      e.n = ['k1', 'k2', 'k3', 'k4', 'k5', 'k6']
      e.d = [1, 2, 3, 4, 5, 6, 7, 8]
    }
    if (i < EDGE_CAPS.feuds) e.q = [1 + (i % 4), year - 3, 5]
    if (i < EDGE_CAPS.debts) e.dv = [1000 + i, 5, year - 2, i % 2, 0]
    entries.push([`${sid(i)}>${sid(i + 1)}`, e])
  }
  for (let i = 0; i < EDGE_CAPS.secrets; i++) entries.push([`secret:${i}`, { a: pr(i), k: 'affair', v: 5, h: Array.from({ length: 6 }, (_, j) => sid(100 + j)), y: year - 4, p: year - 1 }])
  return mapOf(entries)
}

/** A life of twelve years: it has a real world (people, firms, homes, holdings, lod, a ledger), so a world chunk exists. */
function baseLife(): GameState {
  const g = createNewLife({ seed: LIFE_SEED, year: BIRTH_YEAR })
  for (let i = 0; i < 12; i++) {
    g.queue = []
    g.character.stats.health = 100
    g.character.conditions = []
    ageUp(g)
  }
  return g
}

/** One year the way a test plays it: no popup in the way. */
function oneYear(g: GameState): void {
  g.queue = []
  ageUp(g)
}

const edgeChunks = (e: EncodedSave): string[] => Object.keys(e.manifest).filter((n) => n.startsWith('e.edge.'))
const idsOf = (e: EncodedSave): Record<string, string> => Object.fromEntries(Object.entries(e.manifest).map(([n, ref]) => [n, ref.id]))
const textOf = (e: EncodedSave, name: string): string => e.chunks.get(e.manifest[name]!.id)!

/** The state read back the way the boot reads it: the head and its chunk texts, then migrateSave. */
function reloaded(g: GameState): { first: EncodedSave; lost: readonly unknown[]; game: GameState } {
  const first = encodeSave(g)
  const head = JSON.parse(first.head) as Rec
  const texts = new Map<string, string | null>(neededChunkIds(head).map((id) => [id, first.chunks.get(id) ?? null]))
  const a = assembleSave(head, texts)
  if (a.kind !== 'ready') throw new Error(`the save did not assemble: ${a.reason}`)
  const m = migrateSave(a.game, { versions: a.versions })
  if (m.kind !== 'ready') throw new Error(`the save did not load: ${m.kind}`)
  return { first, lost: a.lost, game: m.game }
}

/** The very record another save makes from a game that was read back: the head and every chunk id, byte for byte. */
function expectSavesAgain(name: string, g: GameState): GameState {
  const r = reloaded(g)
  const again = encodeSave(r.game)
  expect(r.lost, `${name}: a chunk was lost`).toEqual([])
  expect(again.head, `${name}: the head after a reload`).toBe(r.first.head)
  expect(again.manifest, `${name}: the chunks after a reload`).toEqual(r.first.manifest)
  expect(inlineSave(r.game), `${name}: the state after a reload`).toBe(inlineSave(g))
  return r.game
}

// ---------------------------------------------------------------------------------------------------------------------------
// 1. putEdge
// ---------------------------------------------------------------------------------------------------------------------------

describe('putEdge: the key and the patch', () => {
  const BAD_KEYS: readonly string[] = [
    '',
    'x',
    'person:a',
    'person:a>',
    '>person:a',
    'person:a>person:b>person:c',
    'person:a>nope',
    'nope>person:a',
    'person:a >person:b',
    `person:${'x'.repeat(60)}>person:b`,
    `person:${'x'.repeat(40)}>person:${'y'.repeat(40)}x${'z'.repeat(40)}`,
    'secret:1',
    'secret:12',
    '__proto__',
    'person:a>__proto__',
    'constructor',
  ]

  it.each(BAD_KEYS.map((k) => [k.length > 40 ? `${k.slice(0, 40)}...` : k, k] as const))('refuses the key %j and writes nothing, not even a world', (_name, bad) => {
    const g = gameWith(undefined)
    expect(putEdge(g, bad, E())).toBe(false)
    expect(g.world).toBeUndefined()
    const h = gameWith(many(3))
    const root = rootOf(h)
    expect(putEdge(h, bad, E())).toBe(false)
    expect(rootOf(h)).toBe(root)
  })

  it('refuses a key that is not text at all', () => {
    const g = gameWith(undefined)
    for (const bad of [undefined, null, 42, {}, [], Symbol('k')]) expect(putEdge(g, bad as unknown as string, E())).toBe(false)
    expect(g.world).toBeUndefined()
  })

  it('refuses a patch that is not a plain object or null', () => {
    const g = gameWith(many(3))
    const root = rootOf(g)
    for (const bad of [undefined, 42, 'x', true, [], [E()], () => E(), new Date(0), new Map()]) expect(putEdge(g, key(1), bad as never), String(typeof bad)).toBe(false)
    expect(rootOf(g)).toBe(root)
  })

  it('refuses a new edge that has not all seven of t, f, r, s, o, y and l, and writes nothing', () => {
    const g = gameWith(undefined)
    expect(putEdge(g, key(1), {})).toBe(false)
    expect(putEdge(g, key(1), { t: 50 })).toBe(false)
    expect(putEdge(g, key(1), { ...E(), o: undefined } as never)).toBe(false)
    expect(putEdge(g, key(1), { ...E(), y: NaN })).toBe(false)
    expect(g.world).toBeUndefined()
  })

  it('creates the first edge with the world, and the map is the edge under its key', () => {
    const g = gameWith(undefined)
    expect(putEdge(g, key(1), E())).toBe(true)
    expect(g.world).toEqual({ v: 1, edges: { [key(1)]: E() } })
    expectValidRoot(g)
    expect(readEdge(g, pr(1), ME)).toBe(stored(g)[key(1)])
    expect(edgesOf(g, ME).map(([k]) => k)).toEqual([key(1)])
  })

  it('keeps the other shards of the world and writes only the edges key', () => {
    const g = makeTestGame(1)
    const people = { v: 1, rows: [{ id: pr(1), seen: 2030 }], over: 0 }
    ;(g as { world?: unknown }).world = { v: 1, y: 2030, people }
    putEdge(g, key(1), E())
    expect(readWorld(g).people).toBe(people)
    expect(Object.keys(readWorld(g))).toEqual(['v', 'y', 'people', 'edges'])
  })

  it('merges a patch into the edge: the fields it names change, the others stay, and a field out of range is cut', () => {
    const g = gameWith(many(5, () => ({ m: [mem('gift_given', 2020)], k: 'kin' })))
    const before = stored(g)[key(2)]!
    expect(putEdge(g, key(2), { s: 30, l: 2031 })).toBe(true)
    const after = stored(g)[key(2)]!
    expect(after).toEqual({ ...before, s: 30, l: 2031 })
    expect(after.m).toEqual(before.m)
    expect(putEdge(g, key(2), { t: 500, o: -500, r: -3 })).toBe(true)
    expect(stored(g)[key(2)]).toMatchObject({ t: 100, o: -100, r: 0 })
    expectValidRoot(g)
  })

  it('writes nothing, and keeps the very root, when the patch changes nothing (an equal copy of a list is the stored list)', () => {
    const g = gameWith(many(5, () => ({ m: [mem('gift_given', 2020), mem('loan_given', 2022)], dv: [100, 5, 2020, 0, 0] })))
    const root = rootOf(g)
    const e = stored(g)[key(2)]!
    expect(putEdge(g, key(2), { s: e.s })).toBe(true)
    expect(putEdge(g, key(2), { m: [...e.m!], dv: [...e.dv!] })).toBe(true)
    expect(putEdge(g, key(2), {})).toBe(true)
    expect(putEdge(g, key(2), { zz: 1, q: [9, 9, 9] } as never)).toBe(true)
    expect(rootOf(g)).toBe(root)
  })

  it('refuses a patch that spoils a required field of an edge that exists, and writes nothing', () => {
    const g = gameWith(many(5))
    const root = rootOf(g)
    for (const bad of [{ t: NaN }, { f: Infinity }, { r: 'x' }, { s: null }, { o: undefined }, { y: '2000' }, { l: [2001] }]) {
      expect(putEdge(g, key(2), bad as never), json(bad)).toBe(false)
      expect(rootOf(g), json(bad)).toBe(root)
    }
  })

  it('cuts a number that is a number but out of range, and rounds a year', () => {
    const g = gameWith(many(5))
    expect(putEdge(g, key(2), { y: 1.5e9, l: -1, t: -5, f: 1e300, s: 12.3456 })).toBe(true)
    expect(stored(g)[key(2)]).toMatchObject({ y: 100_000, l: 1900, t: 0, f: 100, s: 12.3456 })
    expect(putEdge(g, key(2), { y: 2000.4 })).toBe(true)
    expect(stored(g)[key(2)]!.y).toBe(2000)
    expectValidRoot(g)
  })

  it('clears an optional field with undefined, and drops one that is not valid', () => {
    const g = gameWith(many(3, () => ({ q: [2, 2025, 5], c: 2029, m: [mem('gift_given', 2020)] })))
    expect(putEdge(g, key(1), { q: undefined, c: undefined })).toBe(true)
    expect(stored(g)[key(1)]).not.toHaveProperty('q')
    expect(stored(g)[key(1)]).not.toHaveProperty('c')
    expect(stored(g)[key(1)]!.m).toHaveLength(1)
    expect(putEdge(g, key(1), { k: 'nonsense' as never, m: ['junk.1.1.e', mem('loan_given', 2025)] })).toBe(true)
    expect(stored(g)[key(1)]).not.toHaveProperty('k')
    expect(stored(g)[key(1)]!.m).toEqual([mem('loan_given', 2025)])
    expectValidRoot(g)
  })

  it('does not alias what the caller passed: its arrays are copied, and a list of its own is left unfrozen', () => {
    const g = gameWith(undefined)
    const m = [mem('gift_given', 2020)]
    const q: [number, number, number] = [1, 2025, 3]
    expect(putEdge(g, key(1), E({ m, q }))).toBe(true)
    const e = stored(g)[key(1)]!
    expect(e.m).toEqual(m)
    expect(e.m).not.toBe(m)
    expect(e.q).not.toBe(q)
    expect(Object.isFrozen(m)).toBe(false)
    expect(Object.isFrozen(q)).toBe(false)
    m.push('x')
    expect(e.m).toHaveLength(1)
  })

  it('never reads or writes a prototype: a patch with a __proto__ key and a map key __proto__ do nothing', () => {
    const g = gameWith(undefined)
    const evil = JSON.parse('{"__proto__":{"polluted":1},"t":50,"f":50,"r":50,"s":0,"o":0,"y":2000,"l":2001}') as Partial<Edge>
    expect(putEdge(g, key(1), evil)).toBe(true)
    expect(({} as Rec).polluted).toBeUndefined()
    expect(Object.keys(stored(g)[key(1)]!)).toEqual(['t', 'f', 'r', 's', 'o', 'y', 'l'])
  })
})

describe('putEdge: the sorted insert and the identity of what is not touched', () => {
  it('keeps the keys ascending whatever order the edges came in (300 edges in a shuffled order)', () => {
    const g = gameWith(undefined)
    // a fixed shuffle: no g.rng, no Math.random
    const order = Array.from({ length: 300 }, (_, i) => (i * 97) % 300)
    expect(new Set(order).size).toBe(300)
    for (const i of order) {
      expect(putEdge(g, key(i), E({ f: i % 100 }))).toBe(true)
      expect(sortedKeys(keysOf(rootOf(g)))).toBe(true)
    }
    expect(keysOf(rootOf(g))).toHaveLength(300)
    expectValidRoot(g)
  })

  it('keeps ascending code-unit order, not locale order: upper case before lower case, and secrets among the edges', () => {
    const secret = { a: pr(1), k: 'affair', v: 2, h: [pr(2)], y: 2020 }
    const g = gameWith(mapOf([['secret:3', secret], [key('b'), E()], [key('Z'), E()]]))
    putEdge(g, key('a'), E())
    putEdge(g, key('B'), E())
    expect(keysOf(rootOf(g))).toEqual([key('B'), key('Z'), key('a'), key('b'), 'secret:3'])
    expect(stored(g)['secret:3' as never]).toBe(secret)
  })

  it('replaces the root and keeps every other entry by identity, for an insert, an update and a removal', () => {
    const g = gameWith(many(100))
    const before = rootOf(g) as Record<string, unknown>
    putEdge(g, key('0050x'), E({ f: 77 }))
    const inserted = rootOf(g) as Record<string, unknown>
    expect(inserted).not.toBe(before)
    for (const k of Object.keys(before)) expect(inserted[k], k).toBe(before[k])
    expect(Object.keys(inserted)).toHaveLength(101)
    putEdge(g, key(10), { s: 40 })
    const updated = rootOf(g) as Record<string, unknown>
    for (const k of Object.keys(inserted)) if (k !== key(10)) expect(updated[k], k).toBe(inserted[k])
    expect(updated[key(10)]).not.toBe(inserted[key(10)])
    putEdge(g, key(20), null)
    const removed = rootOf(g) as Record<string, unknown>
    expect(Object.keys(removed)).toHaveLength(100)
    for (const k of Object.keys(removed)) expect(removed[k], k).toBe(updated[k])
    expect(removed[key(20)]).toBeUndefined()
  })

  it('leaves the old root as it was', () => {
    const g = gameWith(many(10))
    const before = rootOf(g)
    const text = json(before)
    putEdge(g, key(1), { s: 50 })
    putEdge(g, key(2), null)
    putEdge(g, key(99), E())
    expect(json(before)).toBe(text)
  })

  it('removes an edge with null, removes the last one into an empty map, and a removal of what is not there writes nothing', () => {
    const g = gameWith(many(2))
    expect(putEdge(g, key(0), null)).toBe(true)
    expect(keysOf(rootOf(g))).toEqual([key(1)])
    expect(putEdge(g, key(1), null)).toBe(true)
    expect(rootOf(g)).toEqual({})
    const empty = rootOf(g)
    expect(putEdge(g, key(5), null)).toBe(true)
    expect(rootOf(g)).toBe(empty)
    const none = gameWith(undefined)
    expect(putEdge(none, key(5), null)).toBe(true)
    expect(none.world).toBeUndefined()
  })

  it('does not remove a secret with null: a secret is not an edge', () => {
    const secret = { a: pr(1), k: 'affair', v: 2, h: [pr(2)], y: 2020 }
    const g = gameWith(mapOf([['secret:3', secret], [key(1), E()]]))
    const root = rootOf(g)
    expect(putEdge(g, 'secret:3', null)).toBe(false)
    expect(rootOf(g)).toBe(root)
  })

  it('reads a hostile stored map as the cleaned one, and the first write replaces it with a valid root', () => {
    const g = gameWith({ [key(2)]: E(), [key(1)]: E({ t: 5e9 }), junk: 5, [`${pr(3)}>nope`]: E() })
    expect(putEdge(g, key(4), E())).toBe(true)
    expect(keysOf(rootOf(g))).toEqual([key(1), key(2), key(4)])
    expect(stored(g)[key(1)]!.t).toBe(100)
    expectValidRoot(g)
    const garbage = gameWith('a map that is a string')
    expect(putEdge(garbage, key(1), E())).toBe(true)
    expect(keysOf(rootOf(garbage))).toEqual([key(1)])
  })

  it('writes a root the E6a reads accept as it is: no normalizing pass changes it', () => {
    const g = gameWith(undefined)
    for (let i = 0; i < 60; i++) putEdge(g, key(i), E({ f: i, m: [mem('gift_given', 2000 + (i % 30))] }))
    putEdge(g, key(7), { k: 'kin', dv: [10, 5, 2020, 0, 0] })
    putEdge(g, key(9), null)
    expectValidRoot(g)
    expect(openDebts(g)).toBe(1)
    expect(liveFeuds(g)).toBe(0)
  })
})

describe('putEdge: on a deep-frozen root (a stray in-place write is a TypeError, the intended alarm)', () => {
  it('replaces a deep-frozen root and keeps every untouched entry, frozen as it was', () => {
    const g = gameWith(deepFreeze(many(50, () => ({ m: [mem('gift_given', 2020)] }))))
    const before = rootOf(g) as Record<string, Edge>
    expect(Object.isFrozen(before)).toBe(true)
    expect(putEdge(g, key(5), { s: 12, m: [mem('gift_given', 2020), mem('loan_given', 2024)] })).toBe(true)
    expect(putEdge(g, key('9999'), E())).toBe(true)
    expect(putEdge(g, key(6), null)).toBe(true)
    const after = rootOf(g) as Record<string, Edge>
    expect(after).not.toBe(before)
    for (const k of Object.keys(before)) if (k !== key(5) && k !== key(6)) expect(after[k], k).toBe(before[k])
    expect(Object.keys(before)).toHaveLength(50)
    expect(before[key(5)]!.s).toBe(0)
  })

  it('stores a sealed root: the root, each new edge and its lists are frozen, so an in-place edit throws', () => {
    const g = gameWith(undefined)
    putEdge(g, key(1), E({ m: [mem('gift_given', 2020)], q: [1, 2025, 4], dv: [10, 5, 2020, 0, 0], n: ['a'], d: [1] }))
    const root = rootOf(g) as Record<string, Edge>
    const e = root[key(1)]!
    expect(Object.isFrozen(root)).toBe(true)
    expect(Object.isFrozen(e)).toBe(true)
    for (const f of ['m', 'q', 'dv', 'n', 'd'] as const) expect(Object.isFrozen(e[f]), f).toBe(true)
    expect(() => {
      root[key(2)] = E()
    }).toThrow(TypeError)
    expect(() => {
      e.t = 1
    }).toThrow(TypeError)
    expect(() => e.m!.push('x')).toThrow(TypeError)
  })

  it('writes a sealed edge on a state whose root was shared by a draft (cloneForAct), and leaves the committed root alone', () => {
    const g = gameWith(many(30))
    encodeSave(g)
    const draft = cloneForAct(g)
    expect(rootOf(draft)).toBe(rootOf(g))
    const committed = json(rootOf(g))
    expect(putEdge(draft, key(3), { s: 44 })).toBe(true)
    expect(rootOf(draft)).not.toBe(rootOf(g))
    expect(json(rootOf(g))).toBe(committed)
    expect(stored(draft)[key(3)]!.s).toBe(44)
  })
})

describe('putEdge: 1,200 edges and the eviction of the weakest unbound edge', () => {
  const full = (make: (i: number) => Partial<Edge> = () => ({})): GameState => gameWith(many(EDGE_CAPS.edges, make))

  it('evicts the lowest-salience edge and takes the new one: still 1,200, every other entry the very same object', () => {
    const g = full((i) => (i === 700 ? { f: 5, s: 0 } : {}))
    const before = rootOf(g) as Record<string, Edge>
    expect(putEdge(g, key('new'), E({ f: 30 }))).toBe(true)
    const after = rootOf(g) as Record<string, Edge>
    expect(keysOf(after)).toHaveLength(EDGE_CAPS.edges)
    expect(after[key(700)]).toBeUndefined()
    expect(after[key('new')]).toBeDefined()
    for (const k of Object.keys(after)) if (k !== key('new')) expect(after[k], k).toBe(before[k])
    expectValidRoot(g)
  })

  it('takes the new edge even when it is weaker than all of them: the edge that was just touched is the one that is kept', () => {
    const g = full()
    expect(putEdge(g, key('weak'), E({ f: 0 }))).toBe(true)
    expect(stored(g)[key('weak')]).toBeDefined()
    expect(keysOf(rootOf(g))).toHaveLength(EDGE_CAPS.edges)
  })

  it('breaks a tie of salience the way the normalizer does: the highest key goes', () => {
    const g = full(() => ({ f: 40 }))
    const last = keysOf(rootOf(g)).at(-1)!
    expect(putEdge(g, key('0000a'), E({ f: 40 }))).toBe(true)
    expect(stored(g)[last]).toBeUndefined()
    const h = full(() => ({ f: 40 }))
    const via = normalizeEdges({ ...(rootOf(h) as Rec), [key('0000a')]: E({ f: 40 }) })
    putEdge(h, key('0000a'), E({ f: 40 }))
    expect(keysOf(rootOf(h))).toEqual(keysOf(via))
  })

  it('uses the same salience as the reader: f + s + abs(o) + role of the link', () => {
    const g = full((i) => (i === 100 ? { f: 10, s: 0, o: 0 } : i === 101 ? { f: 5, s: 4, o: -3 } : { f: 60 }))
    // 100 has 10, 101 has 12: the first goes
    expect(salience(stored(g)[key(100)]!)).toBe(10)
    expect(salience(stored(g)[key(101)]!)).toBe(12)
    putEdge(g, key('new'), E())
    expect(stored(g)[key(100)]).toBeUndefined()
    expect(stored(g)[key(101)]).toBeDefined()
  })

  it('never evicts a bound edge: a weak one with a link, a feud, an unpaid debt or a pinned memory stays whatever its salience', () => {
    const g = full((i) => {
      if (i === 1) return { f: 1, k: 'kin' }
      if (i === 2) return { f: 1, q: [1, 2020, 0] }
      if (i === 3) return { f: 1, dv: [100, 5, 2020, 0, 10] }
      if (i === 4) return { f: 1, m: [mem('betrayal', 2020, 3)] }
      return i === 5 ? { f: 2 } : { f: 60 }
    })
    for (const i of [1, 2, 3, 4]) expect(edgeLocalBound(stored(g)[key(i)]!), String(i)).toBe(true)
    expect(putEdge(g, key('new'), E())).toBe(true)
    for (const i of [1, 2, 3, 4]) expect(stored(g)[key(i)], String(i)).toBeDefined()
    expect(stored(g)[key(5)]).toBeUndefined()
  })

  it('evicts a paid-off debt, which is no longer bound', () => {
    const g = full((i) => (i === 3 ? { f: 1, dv: [100, 5, 2020, 0, 100] } : { f: 60 }))
    expect(edgeLocalBound(stored(g)[key(3)]!)).toBe(false)
    expect(putEdge(g, key('new'), E())).toBe(true)
    expect(stored(g)[key(3)]).toBeUndefined()
    expect(openDebts(g)).toBe(0)
  })

  it('returns false and writes nothing when the map is full of bound edges', () => {
    const g = full(() => ({ k: 'kin' }))
    const root = rootOf(g)
    expect(putEdge(g, key('new'), E())).toBe(false)
    expect(rootOf(g)).toBe(root)
    expect(keysOf(rootOf(g))).toHaveLength(EDGE_CAPS.edges)
  })

  it('evicts the one unbound edge among 1,199 bound ones, however strong it is', () => {
    const g = full((i) => (i === 600 ? { f: 100, s: 100 } : { k: 'staff' }))
    expect(putEdge(g, key('new'), E())).toBe(true)
    expect(stored(g)[key(600)]).toBeUndefined()
    expect(keysOf(rootOf(g))).toHaveLength(EDGE_CAPS.edges)
  })

  it('updates an edge that is there without evicting anything, and a removal makes room for a new one', () => {
    const g = full(() => ({ k: 'kin' }))
    const root = rootOf(g)
    expect(putEdge(g, key(5), { s: 9 })).toBe(true)
    expect(keysOf(rootOf(g))).toHaveLength(EDGE_CAPS.edges)
    expect(rootOf(g)).not.toBe(root)
    expect(putEdge(g, key('new'), E())).toBe(false)
    expect(putEdge(g, key(7), null)).toBe(true)
    expect(putEdge(g, key('new'), E())).toBe(true)
    expect(keysOf(rootOf(g))).toHaveLength(EDGE_CAPS.edges)
  })

  it('does not count the secrets as edges, and keeps them by identity through an eviction', () => {
    const secrets = Array.from({ length: 10 }, (_, i) => [`secret:${i}`, { a: pr(i), k: 'debt', v: 1, h: [pr(1)], y: 2020 }] as const)
    const g = gameWith(mapOf([...Object.entries(many(EDGE_CAPS.edges)), ...secrets]))
    const before = rootOf(g) as Rec
    expect(putEdge(g, key('new'), E())).toBe(true)
    const after = rootOf(g) as Rec
    for (const [k] of secrets) expect(after[k], k).toBe(before[k])
    expect(keysOf(after).filter((k) => !k.startsWith('secret:'))).toHaveLength(EDGE_CAPS.edges)
    expectValidRoot(g)
  })

  it('gives the same map the reader would make of the same edges (an insert at the cap is the normalizer\'s cut)', () => {
    const g = full((i) => ({ f: 10 + ((i * 37) % 80), s: i % 5 }))
    const offered = E({ f: 55, s: 2 })
    const expected = normalizeEdges({ ...(rootOf(g) as Rec), [key('0300x')]: offered })
    expect(putEdge(g, key('0300x'), offered)).toBe(true)
    expect(keysOf(rootOf(g))).toEqual(keysOf(expected))
    for (const k of keysOf(expected)) expect(json(stored(g)[k]), k).toBe(json((expected as Record<string, Edge>)[k]))
  })
})

describe('putEdge: the caps of feuds, debts, dialogue edges and memories', () => {
  it('refuses a 13th feud, accepts a change to a feud that is there, and takes a new one when a feud ends', () => {
    const g = gameWith(many(40, (i) => (i < 12 ? { q: [1, 2020, 0] } : {})))
    expect(liveFeuds(g)).toBe(12)
    const root = rootOf(g)
    expect(putEdge(g, key(20), { q: [2, 2030, 1] })).toBe(false)
    expect(rootOf(g)).toBe(root)
    expect(putEdge(g, key(3), { q: [3, 2030, 9] })).toBe(true)
    expect(stored(g)[key(3)]!.q).toEqual([3, 2030, 9])
    expect(putEdge(g, key(4), { q: undefined })).toBe(true)
    expect(liveFeuds(g)).toBe(11)
    expect(putEdge(g, key(20), { q: [2, 2030, 1] })).toBe(true)
    expect(liveFeuds(g)).toBe(12)
  })

  it('refuses a 41st debt the same way', () => {
    const g = gameWith(many(80, (i) => (i < 40 ? { dv: [100 + i, 5, 2020, 0, 0] } : {})))
    expect(openDebts(g)).toBe(40)
    const root = rootOf(g)
    expect(putEdge(g, key(50), { dv: [100, 5, 2030, 0, 0] })).toBe(false)
    expect(rootOf(g)).toBe(root)
    expect(putEdge(g, key(5), { dv: [999, 5, 2030, 0, 0] })).toBe(true)
    expect(putEdge(g, key(6), { dv: undefined })).toBe(true)
    expect(putEdge(g, key(50), { dv: [100, 5, 2030, 0, 0] })).toBe(true)
    expect(openDebts(g)).toBe(40)
  })

  it('refuses the dialogue store (n, d) on a 121st edge', () => {
    const g = gameWith(many(200, (i) => (i < EDGE_CAPS.talkEdges ? { n: ['k1'], d: [1] } : {})))
    const root = rootOf(g)
    expect(putEdge(g, key(150), { n: ['k2'] })).toBe(false)
    expect(putEdge(g, key(151), { d: [3] })).toBe(false)
    expect(rootOf(g)).toBe(root)
    expect(putEdge(g, key(5), { n: ['k1', 'k2'], d: [1, 2] })).toBe(true)
    expect(putEdge(g, key(6), { n: undefined, d: undefined })).toBe(true)
    expect(putEdge(g, key(150), { n: ['k2'] })).toBe(true)
  })

  it('cuts a list longer than the cap on the edge: 8 memories, 6 callback keys, 8 topics (100 x offered)', () => {
    const g = gameWith(undefined)
    const memories = Array.from({ length: 800 }, (_, i) => mem(MEMORY_KINDS[i % 40]!, 1900 + (i % 100)))
    expect(putEdge(g, key(1), E({ m: memories, n: Array.from({ length: 600 }, (_, i) => `k${i}`), d: Array.from({ length: 800 }, (_, i) => i) }))).toBe(true)
    const e = stored(g)[key(1)]!
    expect(e.m).toHaveLength(EDGE_CAPS.memPerEdge)
    expect(e.n).toHaveLength(6)
    expect(e.d).toHaveLength(8)
    expectValidRoot(g)
  })

  it('keeps the memories at 4,000 in all: a memory more takes the oldest unpinned memory of the lowest-salience edge', () => {
    const kinds: MemoryKind[] = ['gift_given', 'loan_given', 'told_gently', 'kept_secret']
    const g = gameWith(
      many(EDGE_CAPS.edges, (i) => ({
        f: i === 5 ? 1 : 30 + (i % 60),
        m: Array.from({ length: i < 400 ? 4 : 3 }, (_, j) => mem(kinds[j]!, 1990 + j * 2)),
      })),
    )
    const total = (): number => Object.values(stored(g)).reduce((a, e) => a + (e.m?.length ?? 0), 0)
    expect(total()).toBe(EDGE_CAPS.memTotal)
    const before = rootOf(g) as Record<string, Edge>
    // edge 1000 has three memories, so one more is no breach of the edge cap, and the total is 4,001 until the cut
    expect(putEdge(g, key(1000), { m: [...before[key(1000)]!.m!, mem('olive_branch', 2030)] })).toBe(true)
    expect(total()).toBe(EDGE_CAPS.memTotal)
    expect(stored(g)[key(1000)]!.m).toHaveLength(4)
    expect(stored(g)[key(5)]!.m).toEqual([mem('loan_given', 1992), mem('told_gently', 1994), mem('kept_secret', 1996)])
    expectValidRoot(g)
  })

  it('takes a pinned memory last: only when no edge holds an unpinned one does the oldest pinned memory of the weakest edge go', () => {
    const pinned: MemoryKind[] = ['betrayal', 'saved_me', 'cut_from_will', 'estranged']
    const g = gameWith(
      many(EDGE_CAPS.edges, (i) => ({
        f: i === 5 ? 1 : 30 + (i % 60),
        m: Array.from({ length: i < 400 ? 4 : 3 }, (_, j) => mem(pinned[j]!, 1990 + j * 2, 3)),
      })),
    )
    const total = (): number => Object.values(stored(g)).reduce((a, e) => a + (e.m?.length ?? 0), 0)
    expect(total()).toBe(EDGE_CAPS.memTotal)
    expect(putEdge(g, key(1000), { m: [...stored(g)[key(1000)]!.m!, mem('divorced', 2030, 3)] })).toBe(true)
    expect(total()).toBe(EDGE_CAPS.memTotal)
    expect(stored(g)[key(5)]!.m).toEqual([mem('saved_me', 1992, 3), mem('cut_from_will', 1994, 3), mem('estranged', 1996, 3)])
    expect(stored(g)[key(1000)]!.m).toHaveLength(4)
    expectValidRoot(g)
  })
})

describe('putEdge: 100 x the caps', () => {
  it('offers 120,000 edges one by one: the map stays at 1,200 and every bound edge is kept', () => {
    const g = gameWith(undefined)
    const bound = 1_000
    for (let i = 0; i < bound; i++) expect(putEdge(g, key(`b${pad(i)}`), E({ f: 1, k: 'kin' }))).toBe(true)
    const offered = 100 * EDGE_CAPS.edges
    let refused = 0
    for (let i = 0; i < offered; i++) {
      if (!putEdge(g, key(`n${pad(i, 6)}`), E({ f: 1 + (i % 99), s: i % 3 }))) refused++
    }
    expect(refused).toBe(0)
    const root = rootOf(g) as Record<string, Edge>
    expect(keysOf(root)).toHaveLength(EDGE_CAPS.edges)
    for (let i = 0; i < bound; i++) expect(root[key(`b${pad(i)}`)], String(i)).toBeDefined()
    expectValidRoot(g)
  }, 300_000)

  it('offers a map of 1,200 bound edges 100 x over: every offer is refused and the root never changes', () => {
    const g = gameWith(many(EDGE_CAPS.edges, () => ({ k: 'rival' })))
    const root = rootOf(g)
    for (let i = 0; i < 2_000; i++) expect(putEdge(g, key(`n${pad(i, 6)}`), E({ f: 100 })), String(i)).toBe(false)
    expect(rootOf(g)).toBe(root)
  })

  it('takes 100 x the memories on one edge: 800 offered, 8 kept, and the pinned one is among them', () => {
    const g = gameWith(undefined)
    const unpinned = MEMORY_KINDS.filter((x) => !['betrayal', 'saved_me', 'cut_from_will', 'estranged', 'divorced'].includes(x))
    // the reader looks at the last 64 entries of a hostile list, so the pinned one is among them
    const m = [...Array.from({ length: 799 }, (_, i) => mem(unpinned[i % unpinned.length]!, 2000 + (i % 30))), mem('betrayal', 1999, 3)]
    expect(putEdge(g, key(1), E({ m }))).toBe(true)
    const kept = memoriesOf(stored(g)[key(1)]!)
    expect(kept).toHaveLength(8)
    expect(kept.some((x) => x.kind === 'betrayal')).toBe(true)
    expectValidRoot(g)
  })
})

describe('putEdge: purity of the rest', () => {
  it('draws no number from g.rng and leaves g.nextId and the other parts of the state alone', () => {
    const g = trapRng(gameWith(undefined))
    const nextId = g.nextId
    const people = json(g.people)
    for (let i = 0; i < 20; i++) putEdge(g, key(i), E())
    putEdge(g, key(3), null)
    expect(g.nextId).toBe(nextId)
    expect(json(g.people)).toBe(people)
    expect(json(g.flags)).toBe('{}')
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// 2. remember
// ---------------------------------------------------------------------------------------------------------------------------

describe('remember', () => {
  const friend = (g: GameState, relationship = 63): Person => createPerson(g, { relation: 'friend', age: 30, relationship })

  function fresh(year = 2030): { g: GameState; p: Person; k: string } {
    const g = makeTestGame(7)
    g.year = year
    stampSocial(g)
    const p = friend(g)
    return { g, p, k: edgeKey(personEntity(p), playerRef(g))! }
  }

  const r2 = (x: number): number => Math.round(x * 100) / 100
  const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x))

  it('is a no-op unless the life is stamped: false, no world, no edge', () => {
    const g = makeTestGame(7)
    const p = friend(g)
    expect(remember(g, p, 'loan_given')).toBe(false)
    expect(g.world).toBeUndefined()
    const h = gameWith(many(3))
    const root = rootOf(h)
    expect(remember(h, pr(1), 'loan_given', { with: ME })).toBe(false)
    expect(rootOf(h)).toBe(root)
  })

  it('writes the memory string kind.year.weight.by on the edge person > player, with w 1 and by ego by default', () => {
    const { g, p, k } = fresh(2030)
    expect(remember(g, p, 'loan_given')).toBe(true)
    expect(k).toBe(`person:${p.id}>${playerRef(g)}`)
    expect(stored(g)[k]!.m).toEqual(['loan_given.2030.1.e'])
    expect(remember(g, p, 'gift_given', { w: 3, by: 'them' })).toBe(true)
    expect(stored(g)[k]!.m).toEqual(['loan_given.2030.1.e', 'gift_given.2030.3.t'])
    expect(memoriesOf(stored(g)[k]!)).toEqual([
      { kind: 'loan_given', year: 2030, w: 1, by: 'ego' },
      { kind: 'gift_given', year: 2030, w: 3, by: 'them' },
    ])
    expectValidRoot(g)
  })

  it('names a person with a sid by person:<sid>, and takes an EntityRef as it is', () => {
    const { g, p } = fresh()
    p.data = { ...p.data, sid: 'cls.us.1990.7' }
    expect(remember(g, p, 'told_gently')).toBe(true)
    expect(stored(g)[`person:cls.us.1990.7>${playerRef(g)}`]!.m).toEqual(['told_gently.2030.1.e'])
    expect(remember(g, 'person:zz9', 'told_gently')).toBe(true)
    expect(stored(g)[`person:zz9>${playerRef(g)}`]!.m).toEqual(['told_gently.2030.1.e'])
  })

  it('writes on the edge to another end when `with` says so, and leaves the player\'s edges out of it', () => {
    const { g, p } = fresh()
    expect(remember(g, p, 'betrayal', { with: pr('other') })).toBe(true)
    expect(Object.keys(stored(g))).toEqual([`person:${p.id}>${pr('other')}`])
  })

  it('applies MEMORY_FX once, scaled by weight / 3, to t, r, s and o of an edge that is there, and clamps to the ranges', () => {
    for (const kind of ['loan_given', 'allowance_cut', 'saved_me', 'betrayal', 'olive_branch'] as const) {
      for (const w of [1, 2, 3] as const) {
        const g = stampedWith({ [key(1)]: E({ t: 40, r: 60, s: 20, o: 5, f: 61 }) })
        expect(remember(g, pr(1), kind, { w, with: ME })).toBe(true)
        const e = stored(g)[key(1)]!
        const fx = MEMORY_FX[kind]
        expect(e.t, `${kind} ${w} t`).toBeCloseTo(clamp(40 + (fx.t * w) / 3, 0, 100), 2)
        expect(e.r, `${kind} ${w} r`).toBeCloseTo(clamp(60 + (fx.r * w) / 3, 0, 100), 2)
        expect(e.s, `${kind} ${w} s`).toBeCloseTo(clamp(20 + (fx.s * w) / 3, 0, 100), 2)
        expect(e.o, `${kind} ${w} o`).toBeCloseTo(clamp(5 + (fx.o * w) / 3, -100, 100), 2)
        expect(e.f, `${kind} ${w} f stays`).toBe(61)
        expect(e.l).toBe(2030)
        expect(e.y).toBe(2000)
      }
    }
  })

  it('stores a scaled number to hundredths, so a stored figure stays short', () => {
    const g = stampedWith({ [key(1)]: E() })
    remember(g, pr(1), 'gossiped_about_me', { w: 1, with: ME })
    const e = stored(g)[key(1)]!
    for (const f of ['t', 'r', 's', 'o'] as const) expect(e[f], f).toBe(r2(e[f]))
    expect(json(e).length).toBeLessThan(140)
  })

  it('clamps at the ends of the ranges and never goes beyond them', () => {
    const g = stampedWith({ [key(1)]: E({ t: 99, r: 99, s: 1, o: 95 }), [key(2)]: E({ t: 1, r: 1, s: 99, o: -95 }) })
    remember(g, pr(1), 'saved_me', { w: 3, with: ME })
    expect(stored(g)[key(1)]).toMatchObject({ t: 100, r: 100, s: 0, o: 100 })
    remember(g, pr(2), 'betrayal', { w: 3, with: ME })
    expect(stored(g)[key(2)]).toMatchObject({ t: 0, r: 0, s: 100, o: -100 })
  })

  it('writes nothing for a second call of the same kind on the same edge in the same year: no second memory and no second effect', () => {
    const { g, p, k } = fresh()
    expect(remember(g, p, 'loan_given', { w: 2 })).toBe(true)
    const root = rootOf(g)
    const after = json(stored(g)[k])
    expect(remember(g, p, 'loan_given', { w: 3, by: 'them' })).toBe(false)
    expect(remember(g, p, 'loan_given')).toBe(false)
    expect(rootOf(g)).toBe(root)
    expect(json(stored(g)[k])).toBe(after)
  })

  it('takes another kind in the same year, and the same kind in another year, each with its own effect', () => {
    const { g, p, k } = fresh(2030)
    remember(g, p, 'loan_given', { w: 3 })
    const t1 = stored(g)[k]!.t
    expect(remember(g, p, 'gift_given', { w: 3 })).toBe(true)
    expect(stored(g)[k]!.t).toBeCloseTo(t1 + 8, 2)
    g.year = 2031
    expect(remember(g, p, 'loan_given', { w: 3 })).toBe(true)
    expect(stored(g)[k]!.m).toEqual(['loan_given.2030.3.e', 'gift_given.2030.3.e', 'loan_given.2031.3.e'])
    expect(stored(g)[k]!.l).toBe(2031)
  })

  it('makes the edge at first touch with t 50, r 50, s 0, o 0, y and l this year, and f the relationship of the person', () => {
    const { g, p, k } = fresh(2030)
    p.relationship = 71
    remember(g, p, 'told_gently', { w: 3 })
    const e = stored(g)[k]!
    expect(e).toMatchObject({ f: 71, y: 2030, l: 2030 })
    expect(e.t).toBeCloseTo(54, 2)
    expect(e.r).toBeCloseTo(54, 2)
    expect(e.s).toBeCloseTo(0, 2)
    // the affection invariant holds for the edge it made
    expect(edgeProblems(rootOf(g), g.people, playerRef(g))).toEqual([])
  })

  it('gives an edge made for a ref a neutral f of 50, and a ref that names a person of the game that person\'s relationship', () => {
    const { g, p } = fresh()
    p.relationship = 33
    remember(g, `person:${p.id}`, 'told_gently')
    expect(stored(g)[`person:${p.id}>${playerRef(g)}`]!.f).toBe(33)
    remember(g, 'person:unknown1', 'told_gently')
    expect(stored(g)[`person:unknown1>${playerRef(g)}`]!.f).toBe(50)
  })

  it('keeps f, y and the other fields of an edge that is there', () => {
    const g = stampedWith({ [key(1)]: E({ f: 61, y: 1995, k: 'kin', c: 2020, dv: [10, 5, 2020, 0, 0] }) })
    remember(g, pr(1), 'gift_given', { with: ME })
    expect(stored(g)[key(1)]).toMatchObject({ f: 61, y: 1995, k: 'kin', c: 2020, dv: [10, 5, 2020, 0, 0] })
  })

  it('binds the edge when the memory is one of the pinned five', () => {
    const { g, p, k } = fresh()
    remember(g, p, 'gift_given')
    expect(edgeLocalBound(stored(g)[k]!)).toBe(false)
    remember(g, p, 'betrayal', { w: 3 })
    expect(edgeLocalBound(stored(g)[k]!)).toBe(true)
  })

  it('keeps 8 memories an edge: the oldest unpinned goes first, and a pinned one stays', () => {
    const kinds = MEMORY_KINDS.filter((x) => !['betrayal', 'saved_me', 'cut_from_will', 'estranged', 'divorced'].includes(x))
    const g = stampedWith({ [key(1)]: E({ m: [mem('betrayal', 2000, 3), ...Array.from({ length: 7 }, (_, i) => mem(kinds[i]!, 2022 + i))] }) }, 2030)
    expect(stored(g)[key(1)]!.m).toHaveLength(8)
    expect(remember(g, pr(1), kinds[10]!, { with: ME })).toBe(true)
    const m = stored(g)[key(1)]!.m!
    expect(m).toHaveLength(8)
    expect(m[0]).toBe(mem('betrayal', 2000, 3))
    expect(m).not.toContain(mem(kinds[0]!, 2022))
    expect(m.at(-1)).toBe(mem(kinds[10]!, 2030))
    expectValidRoot(g)
  })

  it('keeps 4,000 memories in all: the oldest unpinned memory of the lowest-salience edge goes first', () => {
    const kinds: MemoryKind[] = ['gift_given', 'loan_given', 'told_gently', 'kept_secret']
    const g = stampedWith(
      many(EDGE_CAPS.edges, (i) => ({
        f: i === 5 ? 1 : 30 + (i % 60),
        m: Array.from({ length: i < 400 ? 4 : 3 }, (_, j) => mem(kinds[j]!, 1990 + j * 2)),
      })),
    )
    const total = (): number => Object.values(stored(g)).reduce((a, e) => a + (e.m?.length ?? 0), 0)
    expect(total()).toBe(EDGE_CAPS.memTotal)
    expect(remember(g, pr(1000), 'olive_branch', { with: ME })).toBe(true)
    expect(total()).toBe(EDGE_CAPS.memTotal)
    expect(stored(g)[key(1000)]!.m).toHaveLength(4)
    expect(stored(g)[key(5)]!.m).toHaveLength(3)
    expect(stored(g)[key(5)]!.m![0]).toBe(mem('loan_given', 1992))
    expectValidRoot(g)
  })

  it('refuses what it cannot write and writes nothing: an unknown kind, a weight or side that is not allowed, a bad end', () => {
    const { g, p } = fresh()
    expect(remember(g, p, 'not_a_kind' as MemoryKind)).toBe(false)
    expect(remember(g, p, 'loan_given', { w: 4 as 1 })).toBe(false)
    expect(remember(g, p, 'loan_given', { w: 0 as 1 })).toBe(false)
    expect(remember(g, p, 'loan_given', { w: 1.5 as 1 })).toBe(false)
    expect(remember(g, p, 'loan_given', { by: 'me' as 'ego' })).toBe(false)
    expect(remember(g, p, 'loan_given', { with: 'nope' as EntityRef })).toBe(false)
    expect(remember(g, 'nope' as EntityRef, 'loan_given')).toBe(false)
    expect(remember(g, { id: 'x y', data: {} } as Person, 'loan_given')).toBe(false)
    g.year = 5
    expect(remember(g, p, 'loan_given')).toBe(false)
    expect(g.world).toEqual({ v: 1, social: { v: 1, on: 1, y: 2030, fy: 2030 } })
  })

  it('writes on a deep-frozen root by replacing it, and draws no number from g.rng', () => {
    const g = trapRng(stampedWith(deepFreeze(many(20))))
    const before = rootOf(g) as Record<string, Edge>
    expect(remember(g, pr(3), 'gift_given', { w: 2, with: ME })).toBe(true)
    const after = rootOf(g) as Record<string, Edge>
    expect(after).not.toBe(before)
    expect(after[key(4)]).toBe(before[key(4)])
    expect(before[key(3)]!.m).toBeUndefined()
  })

  it('makes room for the edge it creates the way putEdge does, and fails when the map is full of bound edges', () => {
    const g = stampedWith(many(EDGE_CAPS.edges, () => ({ k: 'kin' })))
    const root = rootOf(g)
    expect(remember(g, pr('new'), 'gift_given', { with: ME })).toBe(false)
    expect(rootOf(g)).toBe(root)
    const h = stampedWith(many(EDGE_CAPS.edges, (i) => (i === 3 ? { f: 1 } : { k: 'kin' })))
    expect(remember(h, pr('new'), 'gift_given', { with: ME })).toBe(true)
    expect(stored(h)[key(3)]).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// 3. The row, and 1,200 edges in the codec
// ---------------------------------------------------------------------------------------------------------------------------

describe('the slice row of the edge map', () => {
  it('is world.edges, an entity slice of eight shards, version 1, written by replace, with 24,000 nodes and 420,000 characters', () => {
    const row = sliceOf('world.edges')
    expect(row).toMatchObject({ key: 'world.edges', version: 1, chunk: 'entities', write: 'replace', caps: { nodes: 24_000, chars: 420_000 }, entities: { kind: 'edge', shards: 8 } })
    expect(listSlices().map((s) => s.key)).toContain('world.edges')
    expect(sliceOf('world.met')).toMatchObject({ entities: { kind: 'met', shards: 8 } })
  })

  it('keeps the world root a container of sub-slices, and the stamp a derived row of the world chunk', () => {
    expect(sliceOf('world')).toMatchObject({ chunk: 'world', shape: 'subkeys' })
    expect(sliceOf('world.social')).toMatchObject({ chunk: 'world', write: 'replace', shape: 'whole' })
  })

  it('reads through normalizeEdges: a valid map comes back as itself, a hostile value as a valid map', () => {
    const row = sliceOf('world.edges')!
    const map = worstMap()
    expect(row.normalize(map)).toBe(map)
    expect(row.normalize(42)).toEqual({})
    expect(row.normalize(json(map))).toEqual({})
    expect(row.normalize([E()])).toEqual({})
    const flood = Object.fromEntries(Array.from({ length: 5_000 }, (_, i) => [key(i), E({ f: i % 100 })]))
    const out = row.normalize(flood) as Rec
    expect(keysOf(out).length).toBeLessThanOrEqual(EDGE_CAPS.edges + EDGE_CAPS.secrets)
    expect(edgeProblems(out)).toEqual([])
  })

  it('has room for the worst case of the model: under 24,000 nodes and 420,000 characters in the row\'s own count', () => {
    const worst = worstMap()
    const row = sliceOf('world.edges')!
    const n = countNodes(worst, 1_000_000)
    console.log(`the edge map at its caps (link kind and call-in on every edge, 40 secrets): ${n} nodes, ${json(worst).length} characters`)
    expect(n).toBe(19_929)
    expect(n).toBeLessThanOrEqual(row.caps.nodes)
    expect(json(worst).length).toBeLessThanOrEqual(row.caps.chars)
    expect(normalizeEdges(worst)).toBe(worst)
  })
})

describe('1,200 edges in the codec', () => {
  let g: GameState
  beforeAll(() => {
    g = baseLife()
    ;(g.world as Rec).edges = worstMap(g.year)
  }, 300_000)

  it('starts from a life with a world of its own, so a world chunk exists to be left alone', () => {
    expect(Object.keys(readWorld(g)).filter((k) => k !== 'v' && k !== 'y' && k !== 'edges').length).toBeGreaterThanOrEqual(2)
    expect(keysOf(rootOf(g))).toHaveLength(EDGE_CAPS.edges + EDGE_CAPS.secrets)
    expect(encodeSave(g).manifest.world).toBeDefined()
  })

  it('encodes to at most eight e.edge.<n> chunks, more than one, every key in the chunk it hashes to, and no unsorted entity', () => {
    const e = encodeSave(g)
    const names = edgeChunks(e)
    expect(names.length).toBeGreaterThan(1)
    expect(names.length).toBeLessThanOrEqual(8)
    expect(e.stats.unsortedEntities).toEqual([])
    const seen: string[] = []
    for (const name of names) {
      const n = Number(name.split('.')[2])
      const part = JSON.parse(textOf(e, name)) as Rec
      for (const k of Object.keys(part)) {
        expect(shardOf(k, 8), k).toBe(n)
        seen.push(k)
      }
      expect(Object.keys(part)).toEqual([...Object.keys(part)].sort(cmp))
    }
    expect(seen.sort(cmp)).toEqual(keysOf(rootOf(g)))
  })

  it('keeps the map out of the world chunk, a placeholder in the head, and names the row in sv', () => {
    const e = encodeSave(g)
    expect(textOf(e, 'world')).not.toContain('"astronaut')
    expect(textOf(e, 'world')).not.toContain('"secret:')
    const head = JSON.parse(e.head) as Rec
    expect((head.world as Rec).edges).toBe('~world.edges')
    expect((head[HEAD_VERSIONS_KEY] as Rec)['world.edges']).toBe(1)
    expect(Object.keys(head[HEAD_CHUNKS_KEY] as Rec)).toEqual(expect.arrayContaining(['world', ...edgeChunks(e)]))
  })

  it('decodes to the very JSON, no chunk lost, and the map the game plays on is the one it saved', () => {
    const r = reloaded(g)
    expect(r.lost).toEqual([])
    expect(inlineSave(r.game)).toBe(inlineSave(g))
    expect(isLoadableGame(r.game)).toBe(true)
    expect(normalizeEdges((r.game.world as Rec).edges)).toBe((r.game.world as Rec).edges)
  })

  it('makes the same chunks again after a reload, so the first save after a boot writes none', () => {
    expectSavesAgain('1,200 edges', g)
  })

  it('stays inside the chunks and the characters of the row, and prints what the largest chunk is', () => {
    const e = encodeSave(g)
    const total = edgeChunks(e).reduce((a, n) => a + textOf(e, n).length, 0)
    expect(total).toBeLessThanOrEqual(420_000)
    console.log(`the edge map at its caps: ${edgeChunks(e).length} chunks, ${total} characters in all, the largest ${Math.max(...edgeChunks(e).map((n) => textOf(e, n).length))}`)
  })

  it('writes 1,200 edges put one by one by the writer into the same kind of chunks', () => {
    const h = baseLife()
    for (let i = 0; i < EDGE_CAPS.edges; i++) putEdge(h, `person:cls.us.${1950 + (i % 60)}.${pad(i)}>${playerRef(h)}`, E({ f: 20 + (i % 70), m: [mem('gift_given', 2000)] }))
    const e = encodeSave(h)
    expect(e.stats.unsortedEntities).toEqual([])
    expect(edgeChunks(e).length).toBeLessThanOrEqual(8)
    const r = reloaded(h)
    expect(r.lost).toEqual([])
    expect(inlineSave(r.game)).toBe(inlineSave(h))
  }, 300_000)
})

// ---------------------------------------------------------------------------------------------------------------------------
// 4. A tap that changes one edge
// ---------------------------------------------------------------------------------------------------------------------------

describe('a tap that changes one edge', () => {
  let g: GameState
  beforeAll(() => {
    g = baseLife()
    stampSocial(g)
    ;(g.world as Rec).edges = worstMap(g.year)
  }, 300_000)

  const edgeKeys = (): string[] => keysOf(rootOf(g)).filter((k) => !k.startsWith('secret:'))

  it('changes one e.edge chunk id and leaves the world chunk id and the other seven alone', () => {
    const k = edgeKeys()[123]!
    const next = cloneForAct(g)
    expect(putEdge(next, k, { s: 77.5, l: 2099 })).toBe(true)
    const a = idsOf(encodeSave(g))
    const b = idsOf(encodeSave(next))
    expect(Object.keys(b)).toEqual(Object.keys(a))
    const changed = Object.keys(a).filter((n) => a[n] !== b[n])
    expect(changed).toEqual([`e.edge.${shardOf(k, 8)}`])
    expect(b.world).toBe(a.world)
  })

  it('stringifies one shard only for the changed edge', () => {
    const k = edgeKeys()[7]!
    encodeSave(g)
    const next = cloneForAct(g)
    putEdge(next, k, { s: 31.5 })
    expect(encodeSave(next).stats.stringified).toBe(1)
  })

  it('also holds for remember: one memory on one edge is one chunk, two when the 4,000 cap takes a memory of another edge', () => {
    const next = cloneForAct(g)
    const k = edgeKeys()[300]!
    const [from, to] = k.split('>') as [EntityRef, EntityRef]
    expect(remember(next, from, 'told_gently', { with: to })).toBe(true)
    const a = idsOf(encodeSave(g))
    const b = idsOf(encodeSave(next))
    const changed = Object.keys({ ...a, ...b }).filter((n) => a[n] !== b[n])
    const chunks = changed.filter((n) => n.startsWith('e.edge.'))
    expect(chunks).toContain(`e.edge.${shardOf(k, 8)}`)
    expect(chunks.length).toBeLessThanOrEqual(2)
    expect(changed).not.toContain('world')
    expect(changed.every((n) => n.startsWith('e.edge.') || n === 'core')).toBe(true)
  })

  it('also holds when an edge joins or leaves a map with room: one chunk, never the world chunk', () => {
    const base = edgeKeys()
    const room = cloneForAct(g)
    putEdge(room, base[9]!, null)
    const fresh = `person:astronaut.zz.2001.0001>person:astronaut.zz.2001.0002`
    const joined = cloneForAct(room)
    putEdge(joined, fresh, E())
    const left = cloneForAct(g)
    putEdge(left, base[5]!, null)
    for (const [name, before, after, k] of [['joins', room, joined, fresh], ['leaves', g, left, base[5]!]] as const) {
      const a = idsOf(encodeSave(before))
      const b = idsOf(encodeSave(after))
      const changed = Object.keys({ ...a, ...b }).filter((n) => a[n] !== b[n])
      expect(changed, `an edge ${name}`).toEqual([`e.edge.${shardOf(k, 8)}`])
    }
  })

  it('at the cap of 1,200 a join also evicts the weakest edge, so at most two chunks change and the world chunk still does not', () => {
    const fresh = `person:astronaut.zz.2001.0003>person:astronaut.zz.2001.0004`
    const joined = cloneForAct(g)
    expect(putEdge(joined, fresh, E({ f: 99 }))).toBe(false)
    // the worst map is full of bound edges, so make a copy with one unbound edge and try again
    const open = cloneForAct(g)
    putEdge(open, edgeKeys()[40]!, { k: undefined, q: undefined, dv: undefined, n: undefined, d: undefined, m: undefined, c: undefined, f: 3, s: 0, o: 0 })
    const a = idsOf(encodeSave(open))
    const next = cloneForAct(open)
    expect(putEdge(next, fresh, E({ f: 99 }))).toBe(true)
    const b = idsOf(encodeSave(next))
    const changed = Object.keys({ ...a, ...b }).filter((n) => a[n] !== b[n])
    expect(changed.length).toBeGreaterThanOrEqual(1)
    expect(changed.length).toBeLessThanOrEqual(2)
    expect(changed.every((n) => n.startsWith('e.edge.'))).toBe(true)
    expect(b.world).toBe(a.world)
  })

  it('writes the head and one small chunk through the save store, and the world chunk is not written again', () => {
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
      const committed = cloneForAct(g)
      expect(saveGame(committed)).toBe(true)
      expect(store.ids().filter((id) => id.startsWith('e.edge.')).length).toBeGreaterThan(1)
      const before = new Set(store.ids())
      const puts = store.putSizes.length
      const heads = headWrites
      const draft = cloneForAct(committed)
      putEdge(draft, keysOf(rootOf(draft)).filter((x) => !x.startsWith('secret:'))[200]!, { s: 12.5 })
      expect(saveGame(draft)).toBe(true)
      const added = store.ids().filter((id) => !before.has(id))
      const written = store.putSizes.slice(puts)
      expect(added, 'the chunks this tap wrote').toHaveLength(1)
      expect(added[0]).toMatch(/^e\.edge\.[0-7]\./)
      expect(written, 'one put').toHaveLength(1)
      expect(headWrites - heads, 'one head').toBe(1)
      const world = store.ids().find((id) => id.startsWith('world.'))
      expect(world, 'the world chunk is the one that was there').toBeDefined()
      expect(before.has(world!)).toBe(true)
      console.log(`bytes a tap writes (E6b): one changed edge of 1,200 wrote ${written[0]} characters in one e.edge chunk; the world chunk of ${store.get(world!)!.length} characters was not written`)
      // one shard of eight, never the world chunk and never the whole map (the keys here share a long prefix, so the shards are uneven)
      expect(written[0]!).toBeLessThan(store.get(world!)!.length)
      expect(written[0]!).toBeLessThan(store.ids().filter((id) => id.startsWith('e.edge.')).reduce((a, id) => a + store.get(id)!.length, 0))
    } finally {
      resetSaveStoreForTests()
    }
  })

  afterEach(() => {
    resetSaveStoreForTests()
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// 5. The Time Machine
// ---------------------------------------------------------------------------------------------------------------------------

describe('a Time Machine snapshot of a life with edges and the stamp', () => {
  it('stores the entity chunks and restores the state that was saved', async () => {
    const g = baseLife()
    stampSocial(g)
    ;(g.world as Rec).edges = worstMap(g.year)
    const snap = structuredClone(g)
    const backend = memorySnapshotBackend()
    setSnapshotBackend(backend)
    try {
      startTimeline(snap.lifeId, null)
      await snapshotWritesSettled()
      expect(await takeSnapshot(snap)).toBe(true)
      await snapshotWritesSettled()
      const keys = await backend.keys()
      expect(keys.filter((k) => k.includes('|e.edge.')).length, 'entity chunks in the snapshot store').toBeGreaterThan(1)
      const restored = await loadSnapshot(snap.lifeId, snap.character.age)
      expect(restored).not.toBeNull()
      expect(canonical(restored)).toBe(canonical(snap))
      expect(restored!.world!.edges).toEqual(snap.world!.edges)
      expect(Object.keys(restored!.world!.edges as object)).toEqual(Object.keys(snap.world!.edges as object))
      expect(edgeProblems(restored!.world!.edges, restored!.people, playerRef(restored!))).toEqual([])
      expect(restored!.world!.social).toEqual(snap.world!.social)
    } finally {
      setSnapshotBackend(null)
    }
  }, 300_000)
})

// ---------------------------------------------------------------------------------------------------------------------------
// 6. Every fixture
// ---------------------------------------------------------------------------------------------------------------------------

type Version = readonly [number, number, number]

/** The release a fixture was recorded at, from its name: save-v1 is 1.0.0, save-v4.0.2 is 4.0.2, save-v5.2.0-social is 5.2.0. */
function versionOf(file: string): Version | null {
  const m = /^save-v(\d+)(?:\.(\d+))?(?:\.(\d+))?(?=[-.])/.exec(file)
  return m === null ? null : [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)]
}

/** True when `v` is at or after v5.3.0, the release that adds the edge shard and the stamp. */
function laterThanEdges(v: Version): boolean {
  return v[0] !== 5 ? v[0] > 5 : v[1] !== 3 ? v[1] > 3 : true
}

const FIXTURES = readdirSync(FIXTURE_DIR)
  .filter((name) => /^save-.*\.json\.gz$/.test(name))
  .sort()

function fixtureRaw(name: string): Rec {
  return JSON.parse(gunzipSync(readFileSync(join(FIXTURE_DIR, name))).toString()) as Rec
}

function fixtureGame(name: string): GameState {
  const r = migrateSave(fixtureRaw(name))
  if (r.kind !== 'ready') throw new Error(`${name} did not migrate: ${r.kind}`)
  return r.game
}

const hasKey = (g: GameState, k: string): boolean => Object.prototype.hasOwnProperty.call(g.world ?? {}, k)

/** A save from before v5.3.0: no edges or social key anywhere, no edge chunk, and the same bytes when it is saved again. */
function expectNoEdges(name: string, g: GameState): void {
  expect(hasKey(g, 'edges'), `${name}: an edges key`).toBe(false)
  expect(hasKey(g, 'social'), `${name}: a social key`).toBe(false)
  const r = reloaded(g)
  expect(edgeChunks(r.first), `${name}: an edge chunk`).toEqual([])
  expect(hasKey(r.game, 'edges'), `${name}: an edges key after a reload`).toBe(false)
  expect(hasKey(r.game, 'social'), `${name}: a social key after a reload`).toBe(false)
  expectSavesAgain(name, g)
}

/** A save of v5.3.0 or later: the shards it holds (if any) are valid shards that read as themselves, and the save is the same bytes again. */
function expectKeepsEdges(name: string, g: GameState): void {
  const edges: unknown = g.world?.edges
  if (edges !== undefined) {
    expect(normalizeEdges(edges), `${name}: the edge map normalizes to itself`).toBe(edges)
    expect(edgeProblems(edges, g.people, playerRef(g)), `${name}: the edge map`).toEqual([])
  }
  const social: unknown = g.world?.social
  if (social !== undefined) {
    expect(normalizeSocial(social), `${name}: the stamp normalizes to itself`).toBe(social)
    expect(socialProblems(social), `${name}: the stamp`).toEqual([])
  }
  const back = expectSavesAgain(name, g)
  expect(canonical(back.world?.edges), `${name}: the edge map after a reload`).toBe(canonical(edges))
  expect(canonical(back.world?.social), `${name}: the stamp after a reload`).toBe(canonical(social))
}

describe('every fixture, by the release that recorded it', () => {
  it('finds the fixtures, and every one has a version in its name', () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(7)
    expect(FIXTURES).toContain('save-v1.json.gz')
    for (const name of FIXTURES) expect(versionOf(name), name).not.toBeNull()
    expect(laterThanEdges([5, 2, 0])).toBe(false)
    expect(laterThanEdges([5, 3, 0])).toBe(true)
    expect(laterThanEdges([5, 10, 0])).toBe(true)
    expect(laterThanEdges([6, 0, 0])).toBe(true)
    expect(laterThanEdges([1, 0, 0])).toBe(false)
  })

  describe.each(FIXTURES)('%s', (name) => {
    it('loads and saves again byte for byte, with the rule of its release about the edge map and the stamp', () => {
      const g = fixtureGame(name)
      if (laterThanEdges(versionOf(name)!)) expectKeepsEdges(name, g)
      else expectNoEdges(name, g)
    }, 120_000)
  })

  describe('the two rules can fail', () => {
    it('the rule of a save from before v5.3.0 names an edges key, a social key and an edge chunk', () => {
      const g = fixtureGame('save-v1.json.gz')
      expectNoEdges('save-v1', g)
      putEdge(g, key(1), E())
      expect(() => expectNoEdges('save-v1 with an edge', g)).toThrow()
      const h = fixtureGame('save-v1.json.gz')
      stampSocial(h)
      expect(() => expectNoEdges('save-v1 with a stamp', h)).toThrow()
    })

    it('the rule of a save from v5.3.0 on passes a state that holds the shards, and names a map that is not its own reading', () => {
      const g = fixtureGame('save-v1.json.gz')
      stampSocial(g)
      for (let i = 0; i < 30; i++) putEdge(g, key(i), E({ f: i }))
      expectKeepsEdges('v1 with the shards', g)
      const bad = fixtureGame('save-v1.json.gz')
      ;(bad as { world?: unknown }).world = { v: 1, edges: { [key(1)]: E({ t: 500 }) } }
      expect(() => expectKeepsEdges('v1 with a bad map', bad)).toThrow()
      const worse = fixtureGame('save-v1.json.gz')
      ;(worse as { world?: unknown }).world = { v: 1, social: { v: 1, on: 1, y: 2030, fy: 2030, zz: 1 } }
      expect(() => expectKeepsEdges('v1 with a bad stamp', worse)).toThrow()
    })

    it('a save of v5.3.0 or later with no shard passes too: both are optional', () => {
      expectKeepsEdges('v1 without the shards', fixtureGame('save-v1.json.gz'))
    })
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// 7. Twelve hostile worlds put into the oldest fixture
// ---------------------------------------------------------------------------------------------------------------------------

const NEVER_MADE = 'a shard that no game wrote'

/** Every value is one node, the way the save loader counts (save-schema.ts finiteJsonTree). */
function nodes(value: unknown): number {
  let n = 0
  const stack: unknown[] = [value]
  while (stack.length > 0) {
    const item = stack.pop()
    n++
    if (item !== null && typeof item === 'object') for (const kid of Array.isArray(item) ? item : Object.values(item)) stack.push(kid)
  }
  return n
}

interface Hostile {
  name: string
  /** The `world` root to put in. `room` is how many nodes the save may still add before the loader's cap. */
  make: (room: number) => Rec
}

const flood = (n: number): Rec => Object.fromEntries(Array.from({ length: n }, (_, i) => [key(`z${pad(i, 6)}`), E({ f: i % 100, s: i % 7, l: 1900 + (i % 200) })]))

const HOSTILE: Hostile[] = [
  { name: 'an edges shard that is a number', make: () => ({ v: 1, edges: 42 }) },
  { name: 'an edges shard that is a string', make: () => ({ v: 1, edges: NEVER_MADE }) },
  { name: 'an edges shard that is a list of edges', make: () => ({ v: 1, edges: [E(), E({ f: 9 })] }) },
  { name: 'an edges shard with a __proto__ key', make: () => ({ v: 1, edges: JSON.parse(`{"__proto__":{"t":1},"${key(1)}":${json(E())}}`) as unknown }) },
  { name: '20,000 edges', make: () => ({ v: 1, edges: flood(20_000) }) },
  { name: 'as many edges as the loader leaves room for', make: (room) => ({ v: 1, edges: flood(Math.min(60_000, Math.floor((room - 100) / 8))) }) },
  {
    name: 'fields of 1e300 and minus 1e300, and a year of 1e300',
    make: () => ({ v: 1, edges: Object.fromEntries(['t', 'f', 'r', 's', 'o', 'y', 'l'].map((f, i) => [key(i), { ...E(), [f]: i % 2 === 0 ? 1e300 : -1e300 }])) }),
  },
  {
    name: '10,000-character memories, callback keys and keys',
    make: () => ({ v: 1, edges: { [key(1)]: E({ m: ['x'.repeat(10_000), mem('loan_given', 2020)], n: ['k'.repeat(10_000)] }), [`${pr('y'.repeat(10_000))}>${ME}`]: E() } }),
  },
  { name: 'keys out of order and keys that are no refs', make: () => ({ v: 1, edges: { [key(9)]: E(), [key(3)]: E(), nope: E(), 'a>b': E(), [`${pr(1)}>${pr(2)}>${pr(3)}`]: E(), [key(1)]: E() } }) },
  {
    name: 'a hostile edge: 100 memories of unknown kinds, a feud of rung 9 and a debt that is null',
    make: () => ({ v: 1, edges: { [key(1)]: E({ m: Array.from({ length: 100 }, (_, i) => `nope_${i}.2020.1.e`), q: [9, 2020, 999] as never, dv: [null, 5, 2020, 0, 0] as never, k: 'boss' as never }) } }),
  },
  {
    name: 'a stamp of strings, a future version and an array',
    make: () => ({ v: 1, edges: { [key(1)]: E() }, social: ['on', 1, { v: 1 }] }),
  },
  {
    name: 'a stamp that is on with 5,000 mentor pairs and a year of 1e300',
    make: () => ({ v: 1, social: { v: 1, on: 1, y: 2030, fy: 2000, ay: 1e300, ms: Array.from({ length: 5_000 }, (_, i) => [pr(i), 1e300]) }, edges: { [key(1)]: E() } }),
  },
]

describe('hostile edge maps and stamps put into the oldest fixture', () => {
  it('has twelve of them', () => {
    expect(HOSTILE).toHaveLength(12)
  })

  it.each(HOSTILE.map((h) => [h.name, h] as const))('%s: loads, three years play, every read of the shard is a valid bounded shard, and the first load from the store cleans what is stored', (_name, hostile) => {
    const raw = fixtureRaw('save-v1.json.gz')
    const room = 500_000 - nodes(raw)
    raw.world = hostile.make(room)
    const r = migrateSave(raw)
    if (r.kind !== 'ready') throw new Error(`the save did not load: ${r.kind}`)
    const g = r.game
    expect(isLoadableGame(g)).toBe(true)
    for (let i = 1; i <= 3; i++) {
      expect(() => oneYear(g), `year ${i}`).not.toThrow()
      expect(g.character.alive, `alive after year ${i}`).toBe(true)
      expect(nodes(g.world), `world nodes after year ${i}`).toBeLessThan(WORLD_NODE_CAP)
      // Nothing writes the shards in R4 but a stamped life's writers, so what was stored may still be raw (every reader cuts it);
      // what a reader returns is valid and bounded.
      if (readWorld(g).edges !== undefined) {
        const read = worldShard<EdgeMap>(g, 'edges')!
        expect(edgeProblems(read), `the edge map as read after year ${i}`).toEqual([])
        expect(nodes(read), `the edge map as read after year ${i}`).toBeLessThanOrEqual(19_929)
        expect(normalizeEdges(read)).toBe(read)
      }
      const stamp = readSocial(g)
      if (stamp !== null) {
        expect(socialProblems(stamp), `the stamp as read after year ${i}`).toEqual([])
        expect(nodes(stamp)).toBeLessThanOrEqual(16)
      }
    }
    // the save store is the door: what it wrote comes back as valid, bounded shards (normalizeEdges is the slice's reader)
    resetSaveStoreForTests()
    installStorageShim()
    setSaveBackend(memorySaveBackend())
    try {
      expect(saveGame(g)).toBe(true)
      const back = loadGame()
      expect(back, 'the save store reads back what it wrote').not.toBeNull()
      const edges: unknown = back!.world?.edges
      if (edges !== undefined) {
        expect(edgeProblems(edges), 'the stored map after a load').toEqual([])
        expect(nodes(edges)).toBeLessThanOrEqual(19_929)
        expect(normalizeEdges(edges)).toBe(edges)
      }
      expect(worldProblems(back!, { live: false }).filter((p) => !p.startsWith('ledger: '))).toEqual([])
      const e = encodeSave(back!)
      expect(e.stats.unsortedEntities).toEqual([])
      expect(edgeChunks(e).length).toBeLessThanOrEqual(8)
      expectSavesAgain(hostile.name, back!)
    } finally {
      resetSaveStoreForTests()
    }
  }, 120_000)
})

// ---------------------------------------------------------------------------------------------------------------------------
// 8. Forged edge chunks
// ---------------------------------------------------------------------------------------------------------------------------

/** The save of `g` with the text of chunk `name` replaced by `text`, its length and checksum made true (a forger who knows the format). */
function forged(e: EncodedSave, name: string, text: string): ReturnType<typeof assembleSave> {
  const head = JSON.parse(e.head) as Rec
  const manifest = head[HEAD_CHUNKS_KEY] as Record<string, { id: string; len: number }>
  const id = `${name}.${textSum(text)}`
  manifest[name] = { id, len: text.length }
  const texts = new Map<string, string | null>(Object.values(manifest).map((ref) => [ref.id, e.chunks.get(ref.id) ?? null]))
  texts.set(id, text)
  return assembleSave(head, texts)
}

/** An edge key that hashes to shard `n` of eight, the `i`-th such one. */
function keyIn(n: number, i: number): string {
  for (let ord = 0, hit = 0; ord < 100_000; ord++) {
    const k = key(`zz${ord}`)
    if (shardOf(k, 8) === n && hit++ === i) return k
  }
  throw new Error(`no key for shard ${n}`)
}

describe('a forged edge chunk is a bounded loss or a cleaned map', () => {
  let g: GameState
  let e: EncodedSave
  let target: string
  let others: string[]
  beforeAll(() => {
    g = baseLife()
    ;(g.world as Rec).edges = worstMap(g.year)
    e = encodeSave(g)
    target = edgeChunks(e)[0]!
    others = keysOf(rootOf(g)).filter((k) => `e.edge.${shardOf(k, 8)}` !== target)
  }, 300_000)

  const edgesOf_ = (a: ReturnType<typeof assembleSave>): Rec => {
    if (a.kind !== 'ready') throw new Error(`not ready: ${a.reason}`)
    return ((a.game.world as { edges?: Rec }).edges ?? {}) as Rec
  }

  it('a chunk holding a key of another shard is hostile: that shard is lost, the other seven stay, the life plays on', () => {
    const stray = others[0]!
    const a = forged(e, target, json({ [stray]: E() }))
    expect(a.kind).toBe('ready')
    if (a.kind !== 'ready') return
    expect(a.lost.map((l) => `${l.name}:${l.why}`)).toEqual([`${target}:hostile`])
    expect(keysOf(edgesOf_(a))).toEqual(others)
    expect(a.game.world).toBeDefined()
  })

  it('a chunk of the right shard with garbage in its edges is cleaned by the reader: the garbage goes, the rest stays', () => {
    const n = Number(target.split('.')[2])
    const [ok, bad, worse, listy] = [keyIn(n, 0), keyIn(n, 1), keyIn(n, 2), keyIn(n, 3)]
    const text = json(Object.fromEntries([[ok, E()], [bad, { t: 'x', f: null }], [worse, { ...E(), t: 1e300, m: ['junk'] }], [listy, [1, 2, 3]]].sort((x, y) => cmp(x[0] as string, y[0] as string))))
    const a = forged(e, target, text)
    expect(a.kind).toBe('ready')
    if (a.kind !== 'ready') return
    const map = edgesOf_(a)
    expect(a.lost).toEqual([])
    expect(keysOf(map)).toEqual([...others, ok, worse].sort(cmp))
    expect((map[worse] as Edge).t).toBe(100)
    expect(edgeProblems(map)).toEqual([])
  })

  it('a chunk over the node cap of the row is a size loss, and the other seven stay', () => {
    const k = keyIn(Number(target.split('.')[2]), 0)
    const a = forged(e, target, json({ [k]: Array.from({ length: 25_000 }, () => 0) }))
    expect(a.kind).toBe('ready')
    if (a.kind !== 'ready') return
    expect(a.lost.map((l) => `${l.name}:${l.why}`)).toEqual([`${target}:size`])
    expect(keysOf(edgesOf_(a))).toEqual(others)
  })

  it('a chunk that is not an object, or not JSON, is hostile too', () => {
    for (const text of ['[1,2,3]', '5', 'not json {{', 'null']) {
      const a = forged(e, target, text)
      expect(a.kind, text).toBe('ready')
      if (a.kind !== 'ready') continue
      expect(a.lost.map((l) => `${l.name}:${l.why}`), text).toEqual([`${target}:hostile`])
      expect(keysOf(edgesOf_(a)), text).toEqual(others)
    }
  })

  it('an edge chunk that is missing is a missing loss, and the life plays on without those edges', () => {
    const head = JSON.parse(e.head) as Rec
    const texts = new Map<string, string | null>(neededChunkIds(head).map((id) => [id, e.chunks.get(id) ?? null]))
    texts.delete(e.manifest[target]!.id)
    const a = assembleSave(head, texts)
    expect(a.kind).toBe('ready')
    if (a.kind !== 'ready') return
    expect(a.lost.map((l) => `${l.name}:${l.why}`)).toEqual([`${target}:missing`])
    expect(keysOf(edgesOf_(a))).toEqual(others)
    const m = migrateSave(a.game, { versions: a.versions })
    expect(m.kind).toBe('ready')
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// 9. The budget
// ---------------------------------------------------------------------------------------------------------------------------

describe('the world budget with the edges and the stamp at their caps', () => {
  it('stays under the budget: worldBudget(g).over is empty, and the shards are counted', () => {
    const g = baseLife()
    stampSocial(g)
    ;(g.world as Rec).edges = worstMap(g.year)
    const b = worldBudget(g)
    console.log(`the edges at their caps: edges ${b.nodes.edges} nodes, social ${b.nodes.social}, the whole world ${b.total} nodes and ${b.bytes} bytes`)
    expect(b.over).toEqual([])
    expect(b.nodes.edges).toBe(19_929)
    expect(b.nodes.social).toBe(5)
    expect(worldProblems(g, { live: false }).filter((p) => !p.startsWith('ledger: '))).toEqual([])
  }, 300_000)

  it('names an edge map written around its reader: more edges, memories, feuds, debts and dialogue edges than the caps', () => {
    const g = gameWith(undefined)
    const extra = EDGE_CAPS.edges + 5
    const over = many(extra, () => ({ q: [1, 2020, 0], dv: [10, 5, 2020, 0, 0], n: ['k1'], m: [mem('gift_given', 2000), mem('loan_given', 2001), mem('told_gently', 2002), mem('kept_secret', 2003)] }))
    ;(g as { world?: unknown }).world = { v: 1, edges: over }
    const lines = worldBudget(g).over
    expect(lines).toContain(`edges: ${extra} edges pass the cap of ${EDGE_CAPS.edges}`)
    expect(lines).toContain(`edges: ${extra * 4} memories pass the cap of ${EDGE_CAPS.memTotal}`)
    expect(lines).toContain(`edges: ${extra} feuds pass the cap of ${EDGE_CAPS.feuds}`)
    expect(lines).toContain(`edges: ${extra} debts pass the cap of ${EDGE_CAPS.debts}`)
    expect(lines).toContain(`edges: ${extra} dialogue edges pass the cap of ${EDGE_CAPS.talkEdges}`)
    const secrets = Object.fromEntries(Array.from({ length: 41 }, (_, i) => [`secret:${i}`, { a: pr(1), k: 'debt', v: 1, h: [pr(2)], y: 2020 }]))
    ;(g as { world?: unknown }).world = { v: 1, edges: secrets }
    expect(worldBudget(g).over).toContain(`edges: 41 secrets pass the cap of ${EDGE_CAPS.secrets}`)
  })

  it('is wired into worldProblems as "edges: ..." lines, with the affection invariant for the player\'s people', () => {
    const g = makeTestGame(7)
    g.year = 2030
    stampSocial(g)
    const p = createPerson(g, { relation: 'friend', age: 30, relationship: 60 })
    putEdge(g, `person:${p.id}>${playerRef(g)}`, E({ f: 60 }))
    expect(worldProblems(g, { live: false })).toEqual([])
    putEdge(g, `person:${p.id}>${playerRef(g)}`, { f: 20 })
    expect(worldProblems(g, { live: false }).filter((x) => x.startsWith('edges: ')).length).toBe(1)
    const bad = gameWith({ [key(2)]: E(), [key(1)]: E() })
    expect(worldProblems(bad, { live: false }).some((x) => x.startsWith('edges: ') && x.includes('out of order'))).toBe(true)
  })
})

describe('the limits the stamp and the edges share', () => {
  it('keeps the mentor baseline at three pairs, the number the budget meter counts', () => {
    expect(SOCIAL_MS_MAX).toBe(3)
  })
})
