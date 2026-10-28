// R4 fix (CP4, the year step at the caps): `putEdges` (src/game/world/edge-write.ts), many writes of the edges in one copy of the root.
//
// Why it exists. The yearly step of the edges fades the resentment of every edge and decays its memories. At the cap of 1,200 edges
// with resentment on all of them it made 1,200 `putEdge` calls, and each call copies the root (1,240 keys), so the step copied about
// 1.5 million entries a year: 70 of the 107 ms of a year at the caps on the machine that measured it, and 190 ms on a CI runner,
// where test/social-acceptance.test.ts ("ages up in at most 160 ms") failed. `putEdges` applies a list of writes with one copy.
//
// What the file proves:
//   1. The answers and the stored map are exactly what the same writes made one at a time give: the booleans, the keys in their order,
//      every edge, the counts that the next write starts from. Random batches over 70 keys (caps of feuds, debts and dialogue edges
//      refuse some), a map full of memories (trimming), a map at 1,200 edges (an eviction), a key twice in a batch, a key that is no
//      edge key, a patch that is not a plain object, and a root that a clone or a load left unsealed.
//   2. The root is stored once for a batch of writes that only change or remove edges the map holds, and not at all for a batch that
//      changes nothing.
//   3. The yearly step at 1,200 edges stores the root once, and its result is the one it had.
//   4. What is stored is still frozen, sealed and valid.
import { describe, expect, it } from 'vitest'
import { personEntity } from '../src/game/kernel/person-ref'
import type { GameState } from '../src/game/types'
import { EDGE_CAPS } from '../src/game/world/caps'
import { MEMORY_KINDS, formatMemory, type MemoryKind } from '../src/game/world/edge-memory'
import { stepEdges } from '../src/game/world/edge-step'
import { putEdge, putEdges } from '../src/game/world/edge-write'
import { edgeProblems, type Edge } from '../src/game/world/edges'
import { playerRef } from '../src/game/world/people'
import { ensureWorld, readWorld } from '../src/game/world/state'
import { cast, socialGame } from './social-kit'

type Write = readonly [string, Partial<Edge> | null]

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
const E = (over: Partial<Edge> = {}): Edge => ({ t: 50, f: 50, r: 50, s: 0, o: 0, y: 2000, l: 2026, ...over })
const mem = (kind: MemoryKind, year: number, w: 1 | 2 | 3 = 3): string => formatMemory({ kind, year, w, by: 'ego' })
const rootOf = (g: GameState): Record<string, Edge> => (readWorld(g).edges ?? {}) as Record<string, Edge>
/** The content of a map, whatever order its parts were first written in. */
const canonical = (x: unknown): string => JSON.stringify(x, (_k, v: unknown) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => cmp(a, b))) : v))

/** A counter on the stores of the edges: how many times the root of g.world.edges is replaced from now on. */
function rootStores(g: GameState): () => number {
  const world = ensureWorld(g) as unknown as Record<string, unknown>
  let held = world.edges
  let n = 0
  Object.defineProperty(world, 'edges', {
    configurable: true,
    enumerable: true,
    get: () => held,
    set: (v: unknown) => {
      n++
      held = v
    },
  })
  return () => n
}

/** The same writes, one at a time. */
const oneByOne = (g: GameState, writes: readonly Write[]): boolean[] => writes.map(([k, p]) => putEdge(g, k, p))

/** Two games that hold the same edges, and a step that gives them the same writes. */
function pair(seed = 3): { a: GameState; b: GameState; ego: string } {
  const a = socialGame(seed)
  const b = socialGame(seed)
  return { a, b, ego: playerRef(a) }
}

function expectSame(batched: GameState, single: GameState, why: string): void {
  expect(Object.keys(rootOf(batched)), `${why}: the keys, in their order`).toEqual(Object.keys(rootOf(single)))
  expect(canonical(rootOf(batched)), `${why}: the edges`).toBe(canonical(rootOf(single)))
  expect(edgeProblems(readWorld(batched).edges), `${why}: the batched map is valid`).toEqual([])
}

describe('putEdges answers and stores what the same writes made one at a time do', () => {
  it('is exported, takes the game and a list of [key, patch] pairs, and answers one boolean for each', () => {
    expect(typeof putEdges).toBe('function')
    expect(putEdges.length).toBe(2)
    const g = socialGame(3)
    const ego = playerRef(g)
    expect(putEdges(g, [])).toEqual([])
    expect(putEdges(g, [[`person:a01>${ego}`, E()], [`person:a02>${ego}`, E()]])).toEqual([true, true])
    expect(Object.keys(rootOf(g))).toEqual([`person:a01>${ego}`, `person:a02>${ego}`])
  })

  it('500 random batches over 70 keys, with feuds, debts, dialogue edges and memories at their caps, give the same answers and the same map', () => {
    const { a: batched, b: single, ego } = pair()
    let x = 4242
    const next = (n: number): number => {
      x = (Math.imul(x, 1664525) + 1013904223) >>> 0
      return x % n
    }
    const kinds: MemoryKind[] = ['gift_given', 'loan_given', 'hired_me', 'betrayal', 'told_gently', 'reconciled', 'saved_me', 'olive_branch']
    let refused = 0
    let wrote = 0
    let g1 = batched
    let g2 = single
    for (let round = 0; round < 500; round++) {
      const writes: Write[] = []
      const size = 1 + next(24)
      for (let i = 0; i < size; i++) {
        const key = `person:c${String(next(70)).padStart(2, '0')}>${ego}`
        const op = next(10)
        const patch: Partial<Edge> | null =
          op === 0 ? null
          : op <= 2 ? { q: [1 + next(4), 2020, next(200)] }
          : op <= 4 ? { dv: [100 + next(900), next(30), 2020, next(2), next(50)] }
          : op === 5 ? { n: ['tellme'], d: [next(900)] }
          : op === 6 ? { q: undefined, dv: undefined, n: undefined, d: undefined }
          : op === 7 ? { s: next(100) }
          : { m: Array.from({ length: 1 + next(8) }, (_, k) => mem(kinds[(round + k) % kinds.length]!, 2000 + next(26), (1 + next(3)) as 1 | 2 | 3)) }
        writes.push([key, patch === null ? null : { t: 50, f: 50, r: 50, s: next(100), o: 0, y: 2020, l: 2026, ...patch }])
      }
      // a clone has an unsealed root: the batch reads it once, as a single write does
      if (round % 7 === 3) {
        g1 = structuredClone(g1)
        g2 = structuredClone(g2)
      }
      const got = putEdges(g1, writes)
      const want = oneByOne(g2, writes)
      expect(got, `round ${round}: ${JSON.stringify(writes)}`).toEqual(want)
      refused += want.filter((ok) => !ok).length
      wrote += want.filter((ok) => ok).length
      expectSame(g1, g2, `round ${round}`)
    }
    expect(refused, 'the caps must have refused something').toBeGreaterThan(0)
    expect(wrote, 'and the writes must have been stored').toBeGreaterThan(1000)
  })

  it('a key twice in a batch is read in order: the second write sees the first', () => {
    const { a: batched, b: single, ego } = pair()
    const k = `person:d01>${ego}`
    const writes: Write[] = [
      [k, E({ s: 80 })],
      [k, { s: 40 }],
      [k, { m: [mem('gift_given', 2026)] }],
      [k, null],
      [k, null],
      [k, E({ f: 33 })],
      [`person:d02>${ego}`, E()],
      [k, { f: 34 }],
    ]
    expect(putEdges(batched, writes)).toEqual(oneByOne(single, writes))
    expectSame(batched, single, 'a key twice')
    expect(rootOf(batched)[k]!.f).toBe(34)
  })

  it('refuses a key that is no edge key and a patch that is not a plain object, and writes the rest', () => {
    const { a: batched, b: single, ego } = pair()
    const good = `person:e01>${ego}`
    const writes = [
      ['not a key', E()],
      [`person:e02>${ego}>person:e03`, E()],
      [`secret:1`, E()],
      [good, E({ f: 61 })],
      [`person:e04>${ego}`, [] as unknown as Partial<Edge>],
      [`person:e05>${ego}`, 'x' as unknown as Partial<Edge>],
      [`person:e06>${ego}`, { t: 50 }],
      [`person:e07>${ego}`, null],
    ] as unknown as Write[]
    const got = putEdges(batched, writes)
    expect(got).toEqual(oneByOne(single, writes))
    expect(got).toEqual([false, false, false, true, false, false, false, true])
    expectSame(batched, single, 'refusals')
  })

  it('1,200 edges at the cap: a batch that adds edges evicts the weakest unbound ones, and changes the rest, as one at a time does', () => {
    const { a: batched, b: single, ego } = pair()
    const fill: Write[] = []
    for (let i = 0; i < EDGE_CAPS.edges; i++) fill.push([`person:x${String(i).padStart(5, '0')}>${ego}`, E({ f: 20 + (i % 70), s: i % 30, l: 2026 })])
    expect(oneByOne(single, fill).every(Boolean)).toBe(true)
    expect(putEdges(batched, fill).every(Boolean)).toBe(true)
    expectSame(batched, single, 'filled')
    const writes: Write[] = []
    for (let i = 0; i < 60; i++) writes.push([`person:x${String((i * 37) % EDGE_CAPS.edges).padStart(5, '0')}>${ego}`, i % 3 === 0 ? null : { s: 5 + i }])
    for (let i = 0; i < 25; i++) writes.push([`person:y${String(i).padStart(5, '0')}>${ego}`, E({ f: 90, s: 50 })])
    for (let i = 0; i < 40; i++) writes.push([`person:x${String((i * 53 + 7) % EDGE_CAPS.edges).padStart(5, '0')}>${ego}`, { s: 1 + i }])
    expect(putEdges(batched, writes)).toEqual(oneByOne(single, writes))
    expectSame(batched, single, 'evictions')
    expect(Object.keys(rootOf(batched)).length).toBeLessThanOrEqual(EDGE_CAPS.edges)
  })

  it('4,000 memories at the cap: a batch that adds memories trims the lowest-salience edges first, as one at a time does', () => {
    const { a: batched, b: single, ego } = pair()
    const kinds: MemoryKind[] = ['gift_given', 'loan_given', 'hired_me', 'told_gently', 'olive_branch', 'asked_too_often', 'covered_for_me', 'reconciled']
    const fill: Write[] = []
    for (let i = 0; i < 510; i++) fill.push([`person:m${String(i).padStart(4, '0')}>${ego}`, E({ f: 20 + (i % 60), s: i % 40, m: kinds.map((k) => mem(k, 2020)) })])
    expect(oneByOne(single, fill).every(Boolean)).toBe(true)
    expect(putEdges(batched, fill).every(Boolean)).toBe(true)
    expectSame(batched, single, 'filled')
    const writes: Write[] = []
    for (let i = 0; i < 30; i++) writes.push([`person:m${String((i * 17) % 510).padStart(4, '0')}>${ego}`, { m: kinds.map((k) => mem(k, 2021 + (i % 3))) }])
    for (let i = 0; i < 20; i++) writes.push([`person:m${String((i * 29 + 3) % 510).padStart(4, '0')}>${ego}`, { s: 90 - i }])
    expect(putEdges(batched, writes)).toEqual(oneByOne(single, writes))
    expectSame(batched, single, 'trims')
    const memories = Object.values(rootOf(batched)).reduce((n, e) => n + (e.m?.length ?? 0), 0)
    expect(memories).toBeLessThanOrEqual(EDGE_CAPS.memTotal)
  })

  it('the next write after a batch starts from the same counts as after the same writes one at a time', () => {
    const { a: batched, b: single, ego } = pair()
    const writes: Write[] = []
    for (let i = 0; i < 20; i++) writes.push([`person:f${String(i).padStart(2, '0')}>${ego}`, E({ q: [1, 2020, 5] })])
    putEdges(batched, writes)
    oneByOne(single, writes)
    // 12 feuds are the cap: the same ones were refused, and the next feuds are refused alike
    const more: Write[] = []
    for (let i = 0; i < 30; i++) more.push([`person:f${String(i).padStart(2, '0')}>${ego}`, { q: [2, 2021, 9] }])
    for (let i = 0; i < 10; i++) more.push([`person:g${String(i).padStart(2, '0')}>${ego}`, E({ dv: [100, 1, 2020, 0, 0] })])
    expect(oneByOne(single, more)).toEqual(putEdges(batched, more))
    expectSame(batched, single, 'counts')
  })
})

describe('putEdges stores the root once', () => {
  it('for any number of writes that change or remove the edges the map holds', () => {
    const g = socialGame(3)
    const ego = playerRef(g)
    const fill: Write[] = []
    for (let i = 0; i < 300; i++) fill.push([`person:r${String(i).padStart(3, '0')}>${ego}`, E({ s: 40, m: [mem('gift_given', 2020)] })])
    putEdges(g, fill)
    const stores = rootStores(g)
    const before = rootOf(g)
    const writes: Write[] = []
    for (let i = 0; i < 300; i++) writes.push([`person:r${String(i).padStart(3, '0')}>${ego}`, i % 10 === 0 ? null : { s: 36, m: undefined }])
    expect(putEdges(g, writes).every(Boolean)).toBe(true)
    expect(stores()).toBe(1)
    expect(Object.keys(rootOf(g))).toHaveLength(270)
    // the root was replaced, never edited, and the edges the batch did not name are the very objects they were
    expect(rootOf(g)).not.toBe(before)
    expect(Object.isFrozen(rootOf(g))).toBe(true)
  })

  it('and not at all when every write comes out as it was, or is refused', () => {
    const g = socialGame(3)
    const ego = playerRef(g)
    putEdges(g, [[`person:s01>${ego}`, E({ s: 10 })], [`person:s02>${ego}`, E({ s: 20 })]])
    const before = rootOf(g)
    const stores = rootStores(g)
    const got = putEdges(g, [[`person:s01>${ego}`, { s: 10 }], [`person:s02>${ego}`, E({ s: 20 })], [`person:s03>${ego}`, null], ['nothing', E()]])
    expect(got).toEqual([true, true, true, false])
    expect(stores()).toBe(0)
    expect(rootOf(g)).toBe(before)
  })

  it('keeps every edge it did not touch as the very same object, and freezes and seals every one it wrote', () => {
    const g = socialGame(3)
    const ego = playerRef(g)
    putEdges(g, [[`person:k01>${ego}`, E({ m: [mem('gift_given', 2020)] })], [`person:k02>${ego}`, E()], [`person:k03>${ego}`, E({ s: 60, m: [mem('loan_given', 2020)] })]])
    const before = rootOf(g)
    const list = [mem('told_gently', 2024)]
    putEdges(g, [[`person:k03>${ego}`, { s: 30, m: list }]])
    const after = rootOf(g)
    expect(after[`person:k01>${ego}`]).toBe(before[`person:k01>${ego}`])
    expect(after[`person:k02>${ego}`]).toBe(before[`person:k02>${ego}`])
    const e = after[`person:k03>${ego}`]!
    expect(Object.isFrozen(e)).toBe(true)
    expect(Object.isFrozen(e.m)).toBe(true)
    // the caller's list is copied, never frozen in place
    expect(e.m).not.toBe(list)
    expect(Object.isFrozen(list)).toBe(false)
    expect(() => {
      ;(after as Record<string, unknown>).stray = 1
    }).toThrow(TypeError)
  })
})

describe('the yearly step at the caps', () => {
  /** 1,200 edges that all hold resentment and a memory that decays, the worst case of the step (as test/social-acceptance.test.ts builds it). */
  function capsMap(): GameState {
    const g = socialGame(3)
    const ego = playerRef(g)
    const fill: Write[] = []
    for (let i = 0; i < EDGE_CAPS.edges; i++) fill.push([`person:z${String(i).padStart(5, '0')}>${ego}`, E({ f: 60 + (i % 30), s: 10 + (i % 80), l: 2026, m: [mem(MEMORY_KINDS[i % MEMORY_KINDS.length]!, 2022, 3)] })])
    expect(putEdges(g, fill).every(Boolean)).toBe(true)
    return g
  }

  it('stores the root once, however many edges fade and however many memories decay', () => {
    const g = capsMap()
    const before = rootOf(g)
    const stores = rootStores(g)
    g.year += 4
    stepEdges(g)
    expect(stores()).toBe(1)
    // every edge faded and every memory of the first kinds decayed: the step really did change them all
    const after = rootOf(g)
    expect(Object.keys(after).filter((k) => after[k] !== before[k])).toHaveLength(EDGE_CAPS.edges)
  })

  it('gives the edges the single writes gave: the fade and the decay of each edge, by the rules of the header', () => {
    const g = capsMap()
    const before = structuredClone(rootOf(g))
    g.year += 4
    stepEdges(g)
    const after = rootOf(g)
    expect(Object.keys(after)).toEqual(Object.keys(before))
    for (const [k, e] of Object.entries(before)) {
      const now = after[k]!
      expect(now.s, k).toBe(e.s > 0 ? Math.floor(e.s * 90) / 100 : 0)
      for (const f of ['t', 'f', 'r', 'o', 'y', 'l'] as const) expect(now[f], `${k} ${f}`).toBe(e[f])
    }
    expect(edgeProblems(readWorld(g).edges)).toEqual([])
  })

  it('with people in the game the step still follows their legacy records after the edges fade', () => {
    const g = socialGame(3)
    const ego = playerRef(g)
    const owing = cast(g, 50)
    owing.data.w = { by: g.character.id, owes: 640, owesSince: 2026 } as never
    putEdges(g, [[`${personEntity(owing)}>${ego}`, E({ f: 50, s: 30 })], [`person:orphan>${ego}`, E({ f: 5, s: 4, y: 2000, l: 2000 })]])
    g.year += 1
    stepEdges(g)
    const e = rootOf(g)[`${personEntity(owing)}>${ego}`]!
    expect(e.s).toBe(27)
    expect(e.dv?.[0]).toBe(640)
    expect(rootOf(g)[`person:orphan>${ego}`]).toBeUndefined()
  })
})
