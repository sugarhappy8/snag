// R4-E7 (D.3, X6, X22, X42, C14): the yearly edge step, `world.edges` (src/game/world/edge-step.ts), the module of the `close` phase at
// order 5 that owns the slice `world.edges`. Once a year, on a life the social stamp marks, and idempotent by `social.y`:
//
//   - resentment (s) fades by a tenth, rounded down to hundredths, so it reaches 0;
//   - every memory loses one weight every `decay` years of its MEMORY_FX row (0 removes it), the pinned five never;
//   - the legacy records are followed (syncLegacy) for every person of the game;
//   - an orphan edge is removed: the person is gone from the game, the edge is not bound by its own fields (edgeLocalBound), has no
//     debt, was last touched five years ago or more and its salience is under 40. E14 widens the bound test to isBound.
// It draws nothing, books nothing and makes no id.
//
// What the file proves, in the order of the plan:
//   1. The module: id, layer, slice, the phase and the order, the registry's order (before milestones), the group rows of X42.
//   2. A no-op unstamped; idempotent by social.y; a stamp from the future is stepped once and put right.
//   3. Resentment: the fade, 20 years of no contact leaves a friend under 10.
//   4. Memories: all 40 kinds across 14 years, the multi-year gap, the pinned five.
//   5. Legacy sync inside the step. 6. The orphan rule, one condition at a time.
//   7. Bounds at 100 times: 1,200 edges for 100 years; 5,000 people touched; the cost of a tap at 1,200 edges.
//   8. A clone, a reload and a Time Machine jump give the same edges. 9. Through the real ageUp: stamped lives, an unstamped one.
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { killCharacter } from '../src/game/death'
import { personEntity } from '../src/game/kernel/person-ref'
import { yearlyEntries } from '../src/game/kernel/registry'
import { MODULES } from '../src/game/modules/index'
import { continueAsChild } from '../src/game/life'
import { loadGame, loadSnapshot, memorySnapshotBackend, saveGame, setSnapshotBackend, snapshotWritesSettled, startTimeline, takeSnapshot } from '../src/game/save'
import { memorySaveBackend } from '../src/game/save-backends'
import { resetSaveStoreForTests, setSaveBackend } from '../src/game/save-store'
import type { GameState, Person } from '../src/game/types'
import { EDGE_CAPS } from '../src/game/world/caps'
import { edgesModule, stepEdges, syncLegacy } from '../src/game/world/edge-step'
import { MEMORY_FX, MEMORY_KINDS, formatMemory, type MemoryKind } from '../src/game/world/edge-memory'
import { putEdge } from '../src/game/world/edge-write'
import { edgeProblems, memoriesOf, readEdge, type Edge } from '../src/game/world/edges'
import { worldProblems } from '../src/game/world/invariants'
import { playerRef } from '../src/game/world/people'
import { readSocial, socialOn } from '../src/game/world/social'
import { readWorld } from '../src/game/world/state'
import { installStorageShim } from './fuzz-kit'
import { makeTestGame } from './helpers'
import { machineFactor } from './perf-kit'
import { playLife } from './play-kit'
import { cast, socialGame, socialLife } from './social-kit'
import { applyDelta } from './social-parity-kit'

// A fixed life as a constant, not a pin of the form the seed ratchet counts (test/seed-pins.test.ts).
// The cradle of test/social-lives-parity.test.ts: a life that lives past 60.
const LIFE_SEED = 17
const BIRTH = 1990

type Game = ReturnType<typeof socialGame>

const rootOf = (g: GameState): Record<string, Edge> => (readWorld(g).edges ?? {}) as Record<string, Edge>
const keyOf = (g: GameState, p: Person): string => `${personEntity(p)}>${playerRef(g)}`
const edgeOf = (g: GameState, p: Person): Readonly<Edge> | null => readEdge(g, personEntity(p), playerRef(g))
const E = (over: Partial<Edge> = {}): Edge => ({ t: 50, f: 50, r: 50, s: 0, o: 0, y: 2000, l: 2026, ...over })
const mem = (kind: MemoryKind, year: number, w: 1 | 2 | 3 = 3): string => formatMemory({ kind, year, w, by: 'ego' })
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
/** The content of a map, whatever order its parts were first written in. */
const canonical = (x: unknown): string => JSON.stringify(x, (_k, v: unknown) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => cmp(a, b))) : v))

/** A person with an edge: the number is the relationship, `over` the rest of the edge. */
function withEdge(g: GameState, relationship: number, over: Partial<Edge> = {}): Person {
  const p = cast(g, relationship)
  expect(putEdge(g, keyOf(g, p), E({ f: relationship, ...over }))).toBe(true)
  return p
}

/** The next year of a game: the calendar moves, then the step runs. */
function nextYear(g: GameState, years = 1): void {
  g.year += years
  stepEdges(g)
}

// ---------------------------------------------------------------------------------------------------------------------
// 1. The module

describe('the module world.edges', () => {
  it('is the close phase at order 5 of the aging seam, layer 2, and owns the slice world.edges', () => {
    expect(edgesModule.id).toBe('world.edges')
    expect(edgesModule.layer).toBe(2)
    expect(edgesModule.slices).toEqual(['world.edges'])
    expect(edgesModule.yearly).toEqual([{ seam: 'aging', phase: 'close', order: 5, run: stepEdges }])
  })

  it('is registered in id order, between menus.core and world.facts, and runs two entries before milestones (society.acts is between)', () => {
    const ids = MODULES.map((m) => m.id)
    expect(ids).toContain('world.edges')
    expect(ids.indexOf('world.edges')).toBeGreaterThan(ids.indexOf('menus.core'))
    expect(ids.indexOf('world.edges')).toBeLessThan(ids.indexOf('world.facts'))
    expect([...ids].sort(cmp)).toEqual(ids)
    const aging = yearlyEntries('aging').map((e) => e.id)
    // R4-E10a: the acts (society.acts, close 6) sit between the edge step (close 5) and the milestones (close 10)
    expect(aging[aging.indexOf('yearly.milestones') - 1]).toBe('society.acts')
    expect(aging[aging.indexOf('society.acts') - 1]).toBe('world.edges')
    expect(aging.indexOf('world.edges')).toBeGreaterThan(aging.indexOf('yearly.advisors'))
    // the pins of test/kernel-aging.test.ts stay: the first two entries, effort.you after household, knowledge.core after milestones
    expect(aging[0]).toBe('world.frontier')
    expect(aging[aging.indexOf('yearly.household') + 1]).toBe('effort.you')
    expect(aging[aging.indexOf('yearly.milestones') + 1]).toBe('knowledge.core')
  })

  it('has its group row in the planner, the log view and the integration test (X42)', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const root = join(import.meta.dirname, '..')
    const plan = readFileSync(join(root, 'src/game/hubs/year-plan.ts'), 'utf8')
    const view = readFileSync(join(root, 'src/ui/components/logModel.ts'), 'utf8')
    const quiet = readFileSync(join(root, 'test/quiet-integration.test.ts'), 'utf8')
    expect(plan).toContain("'world.edges': 'people'")
    expect(view).toContain("'world.edges': 'people'")
    expect(quiet).toContain("'world.edges': 'people'")
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 2. No-op, idempotence, the stamp

describe('stepEdges is idempotent by social.y', () => {
  it('does nothing for a life that is not stamped: no world, no shard, nothing written', () => {
    const g = makeTestGame(3)
    const p = cast(g, 50)
    p.data.w = { by: g.character.id, owes: 400, owesSince: 2025 } as never
    const before = JSON.stringify(g)
    g.year += 1
    stepEdges(g)
    expect(JSON.stringify(g)).toBe(before.replace('"year":2026', '"year":2027'))
    expect(g.world).toBeUndefined()
  })

  it('does nothing for a hostile stamp', () => {
    const g = makeTestGame(3)
    g.world = { v: 1, social: { v: 1, on: 2, y: 2020, fy: 2020 }, edges: { 'person:a>person:b': E({ s: 80 }) } } as never
    const before = JSON.stringify(g.world)
    g.year += 4
    stepEdges(g)
    expect(JSON.stringify(g.world)).toBe(before)
  })

  it('runs once for a year: the second call and a replay of the year change nothing', () => {
    const g = socialGame(3)
    const p = withEdge(g, 60, { s: 50, m: [mem('gift_given', 2026)] })
    p.data.w = { by: g.character.id, owes: 200, owesSince: 2027 } as never
    expect(readSocial(g)!.y).toBe(2026)
    nextYear(g)
    expect(readSocial(g)!.y).toBe(2027)
    expect(edgeOf(g, p)!.s).toBe(45)
    const root = readWorld(g).edges
    const stamp = readWorld(g).social
    const text = JSON.stringify(g.world)
    stepEdges(g)
    stepEdges(g)
    expect(readWorld(g).edges, 'the very map').toBe(root)
    expect(readWorld(g).social).toBe(stamp)
    expect(JSON.stringify(g.world)).toBe(text)
    const clone = structuredClone(g)
    stepEdges(clone)
    expect(JSON.stringify(clone.world)).toBe(text)
  })

  it('does not run in the year the life was stamped (y is that year)', () => {
    const g = socialGame(3)
    const p = withEdge(g, 60, { s: 50 })
    stepEdges(g)
    expect(edgeOf(g, p)!.s).toBe(50)
    expect(readSocial(g)!.y).toBe(2026)
  })

  it('steps a stamp from the future once and puts it right', () => {
    const g = socialGame(3)
    const p = withEdge(g, 60, { s: 50 })
    ;(g.world as Record<string, unknown>).social = { v: 1, on: 1, y: 2090, fy: 2026 }
    g.year = 2027
    stepEdges(g)
    expect(readSocial(g)!.y).toBe(2027)
    expect(edgeOf(g, p)!.s).toBe(45)
    stepEdges(g)
    expect(edgeOf(g, p)!.s).toBe(45)
  })

  it('writes the year with patchSocial only: fy, ay and ms stay', () => {
    const g = socialGame(3)
    withEdge(g, 60, { s: 5 })
    ;(g.world as Record<string, unknown>).social = { v: 1, on: 1, y: 2026, fy: 2020, ay: 2024 }
    nextYear(g)
    expect(readSocial(g)).toEqual({ v: 1, on: 1, y: 2027, fy: 2020, ay: 2024 })
  })

  it('writes nothing when nothing changes (no edge at all, or a map with nothing to fade) but the year', () => {
    const g = socialGame(3)
    nextYear(g)
    expect(readWorld(g).edges).toBeUndefined()
    withEdge(g, 60, { s: 0 })
    const root = readWorld(g).edges
    nextYear(g)
    expect(readWorld(g).edges, 'a calm friend leaves the map as it was').toBe(root)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 3. Resentment

describe('resentment fades', () => {
  it('by a tenth a year, rounded down to hundredths, to 0', () => {
    const g = socialGame(3)
    const p = withEdge(g, 60, { s: 100 })
    let want = 100
    for (let i = 0; i < 80; i++) {
      nextYear(g)
      want = Math.floor(want * 90) / 100
      expect(edgeOf(g, p)!.s, `year ${i + 1}`).toBe(want)
    }
    expect(edgeOf(g, p)!.s).toBe(0)
  })

  it('leaves 0 alone and a tiny value falls to 0 and not forever to 0.05', () => {
    const g = socialGame(3)
    const p = withEdge(g, 60, { s: 0.05 })
    nextYear(g)
    expect(edgeOf(g, p)!.s).toBe(0.04)
    for (let i = 0; i < 6; i++) nextYear(g)
    expect(edgeOf(g, p)!.s).toBe(0)
  })

  it('20 years of no contact leave a friend who was offended by 60 under 10', () => {
    const g = socialGame(3)
    const p = cast(g, 80)
    applyDelta(g, p, -60)
    expect(edgeOf(g, p)!.s).toBe(60)
    for (let i = 0; i < 20; i++) nextYear(g)
    expect(edgeOf(g, p)!.s).toBeLessThan(10)
    expect(edgeOf(g, p)!.f, 'the step does not touch f').toBe(20)
  })

  it('leaves t, r, o and f alone', () => {
    const g = socialGame(3)
    const p = withEdge(g, 61, { t: 70, r: 33, o: -20, s: 40 })
    nextYear(g)
    const e = edgeOf(g, p)!
    expect([e.t, e.f, e.r, e.o]).toEqual([70, 61, 33, -20])
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 4. Memories

describe('memories lose weight', () => {
  const YEARS = 14

  it('every 4 years (2 for a petty kind) for each of the 40 kinds, never for the pinned five, 0 removes it', () => {
    const g = socialGame(3)
    const owners = MEMORY_KINDS.map((kind) => ({ kind, p: withEdge(g, 60, { m: [mem(kind, 2026)] }) }))
    expect(MEMORY_KINDS).toHaveLength(40)
    for (let n = 1; n <= YEARS; n++) {
      nextYear(g)
      for (const { kind, p } of owners) {
        const decay = MEMORY_FX[kind].decay
        const m = memoriesOf(edgeOf(g, p)!)
        if (decay === 0) {
          expect(m.map((x) => [x.kind, x.w]), `${kind} year ${n}`).toEqual([[kind, 3]])
          continue
        }
        const w = 3 - Math.floor(n / decay)
        if (w <= 0) expect(m, `${kind} year ${n}`).toEqual([])
        else expect(m.map((x) => [x.kind, x.w]), `${kind} year ${n}`).toEqual([[kind, w]])
      }
    }
    const gone = owners.filter(({ p }) => memoriesOf(edgeOf(g, p)!).length === 0).map((o) => o.kind)
    expect(gone.length).toBe(MEMORY_KINDS.length - 5)
    expect(memoCount(g)).toBe(5)
  })

  it('a memory of weight 1 goes at its first decay, and one of weight 3 lasts three decays', () => {
    const g = socialGame(3)
    const a = withEdge(g, 60, { m: [mem('gift_given', 2026, 1)] })
    const b = withEdge(g, 60, { m: [mem('gift_given', 2026, 3)] })
    nextYear(g, 3)
    expect(memoriesOf(edgeOf(g, a)!).length, 'the gap of three years is not a decay yet').toBe(1)
    nextYear(g)
    expect(memoriesOf(edgeOf(g, a)!)).toEqual([])
    expect(memoriesOf(edgeOf(g, b)!).map((m) => m.w)).toEqual([2])
    nextYear(g, 4)
    nextYear(g, 4)
    expect(memoriesOf(edgeOf(g, b)!)).toEqual([])
  })

  it('counts the decays of a gap of years exactly, and only once', () => {
    const g = socialGame(3)
    const p = withEdge(g, 60, { m: [mem('gift_given', 2026, 3), mem('asked_too_often', 2026, 3), mem('betrayal', 2026, 3)] })
    nextYear(g, 9)
    // 9 years of a decay-4 kind is two decays; of a decay-2 kind is four (gone); the pinned kind is untouched
    expect(memoriesOf(edgeOf(g, p)!).map((m) => [m.kind, m.w])).toEqual([['gift_given', 1], ['betrayal', 3]])
    stepEdges(g)
    expect(memoriesOf(edgeOf(g, p)!).map((m) => [m.kind, m.w])).toEqual([['gift_given', 1], ['betrayal', 3]])
  })

  it('does not decay a memory of this year or of a later year', () => {
    const g = socialGame(3)
    const p = withEdge(g, 60, { m: [mem('gift_given', 2027, 2), mem('gift_given', 2040, 2)] })
    nextYear(g)
    expect(memoriesOf(edgeOf(g, p)!).map((m) => m.w)).toEqual([2, 2])
  })

  it('keeps the memories in order and the text canonical (the map reads back as itself)', () => {
    const g = socialGame(3)
    withEdge(g, 60, { m: [mem('gift_given', 2020, 3), mem('betrayal', 2022, 2), mem('loan_repaid', 2024, 3), mem('told_gently', 2026, 1)] })
    for (let i = 0; i < 10; i++) nextYear(g)
    expect(edgeProblems(readWorld(g).edges, g.people, playerRef(g))).toEqual([])
  })
})

/** The memories on all edges. */
function memoCount(g: GameState): number {
  return Object.values(rootOf(g)).reduce((n, e) => n + (e.m?.length ?? 0), 0)
}

// ---------------------------------------------------------------------------------------------------------------------
// 5. The legacy sync inside the step

describe('the step follows the legacy records of every person', () => {
  it('lays a debt and raises obligation for a person who owes, and lifts s to the anger of the will', () => {
    const g = socialGame(3)
    const a = cast(g, 50)
    a.data.w = { by: g.character.id, owes: 800, owesSince: 2027 } as never
    const b = withEdge(g, 40, { s: 10 })
    b.data.wl = { by: g.character.id, anger: 70, cut: true, estr: false } as never
    const c = cast(g, 50)
    nextYear(g)
    expect(edgeOf(g, a)!.dv).toEqual([800, 0, 2027, 0, 0])
    expect(edgeOf(g, a)!.o).toBeGreaterThanOrEqual(20)
    expect(edgeOf(g, b)!.s, 'the fade comes first, then the anger').toBe(70)
    expect(edgeOf(g, c), 'a person with nothing to follow gets no edge').toBeNull()
  })

  it('removes the kind-0 debt of a loan that was paid, and keeps the obligation', () => {
    const g = socialGame(3)
    const a = cast(g, 50)
    a.data.w = { by: g.character.id, owes: 800, owesSince: 2026 } as never
    syncLegacy(g, a)
    const o = edgeOf(g, a)!.o
    ;(a.data.w as Record<string, unknown>).owes = 0
    nextYear(g)
    expect(edgeOf(g, a)!.dv).toBeUndefined()
    expect(edgeOf(g, a)!.o).toBe(o)
  })

  it('follows a dead person and an unmet one the same way, and ignores a record of another owner', () => {
    const g = socialGame(3)
    const dead = cast(g, 50)
    dead.alive = false
    dead.data.w = { by: g.character.id, owes: 100, owesSince: 2026 } as never
    const late = cast(g, 50)
    late.data.w = { by: 'the-late-player', owes: 100, owesSince: 2000 } as never
    nextYear(g)
    expect(edgeOf(g, dead)!.dv).toEqual([100, 0, 2026, 0, 0])
    expect(edgeOf(g, late)).toBeNull()
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 6. Orphans

describe('an orphan edge is removed', () => {
  /** An edge whose person is gone from the game (or still there), five years old and light; `over` changes it. */
  function orphan(over: Partial<Edge> = {}, present = false, age = 5): { g: Game; key: string } {
    const g = socialGame(3)
    const p = cast(g, 20)
    const key = keyOf(g, p)
    expect(putEdge(g, key, E({ f: 20, l: 2026, ...over }))).toBe(true)
    if (!present) g.people = g.people.filter((x) => x !== p)
    nextYear(g, age)
    return { g, key }
  }

  it('when the person is gone, nothing binds it, it has no debt, it is five years old and its salience is under 40', () => {
    const { g, key } = orphan()
    expect(rootOf(g)[key]).toBeUndefined()
  })

  it('and the edge of 5 years goes while a neighbour that is still met stays', () => {
    const g = socialGame(3)
    const gone = cast(g, 20)
    const here = cast(g, 20)
    expect(putEdge(g, keyOf(g, gone), E({ f: 20 }))).toBe(true)
    expect(putEdge(g, keyOf(g, here), E({ f: 20 }))).toBe(true)
    g.people = g.people.filter((x) => x !== gone)
    nextYear(g, 5)
    expect(edgeOf(g, gone)).toBeNull()
    expect(edgeOf(g, here)).not.toBeNull()
  })

  const KEEP: readonly (readonly [string, Partial<Edge>, boolean?, number?])[] = [
    ['the person is still in the game', {}, true],
    ['the edge is only four years old', {}, false, 4],
    ['it carries a link kind', { k: 'kin' }],
    ['it carries a feud', { q: [1, 2020, 3] }],
    ['it carries an unpaid debt', { dv: [100, 0, 2020, 0, 0] }],
    ['it carries a debt that was paid (it is a debt still)', { dv: [100, 0, 2020, 0, 100] }],
    ['it carries a pinned memory', { m: [mem('betrayal', 2020, 1)] }],
    ['it carries a pinned memory of the other four kinds', { m: [mem('saved_me', 2020, 1)] }],
    ['its salience is 40 (affection 40)', { f: 40 }],
    ['its salience is 45 by obligation alone', { f: 0, o: -45 }],
    ['its salience is 40 by resentment alone (it fades first, so 50 stays 45)', { f: 0, s: 50 }],
  ]

  for (const [name, over, present, age] of KEEP) {
    it(`is kept when ${name}`, () => {
      const { g, key } = orphan(over, present ?? false, age ?? 5)
      expect(rootOf(g)[key], name).toBeDefined()
    })
  }

  it('is removed at salience 39 and kept at 40, and an unpinned memory does not keep it', () => {
    expect(rootOf(orphan({ f: 39 }).g)).toEqual({})
    expect(Object.keys(rootOf(orphan({ f: 40 }).g))).toHaveLength(1)
    expect(rootOf(orphan({ m: [mem('gift_given', 2026, 3)] }).g)).toEqual({})
  })

  it('is removed only when a person end is gone: an edge to a firm is not an orphan of anybody, an edge from a stranger is', () => {
    const g = socialGame(3)
    const p = cast(g, 20)
    expect(putEdge(g, `person:zz1>${personEntity(p)}`, E({ f: 10 }))).toBe(true)
    expect(putEdge(g, `firm:f1>${playerRef(g)}`, E({ f: 10 }))).toBe(true)
    nextYear(g, 6)
    expect(rootOf(g)[`firm:f1>${playerRef(g)}`], 'only person ends can be gone').toBeDefined()
    expect(rootOf(g)[`person:zz1>${personEntity(p)}`], 'a person who is not in the game is gone').toBeUndefined()
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 7. Bounds at 100 times

describe('the step and the mirror hold at 100 times', () => {
  it('1,200 edges with resentment 100 and 8 memories, 100 years: every field in range, caps held, nothing but the bound and the pinned left', () => {
    const g = socialGame(3)
    const ego = playerRef(g)
    const pinned = ['betrayal', 'saved_me', 'cut_from_will', 'estranged', 'divorced'] as const
    for (let i = 0; i < EDGE_CAPS.edges; i++) {
      const bound = i % 2 === 0
      // a pinned memory binds an edge, so only the edges that are meant to stay carry one
      const m = [mem('gift_given', 2026), mem('loan_given', 2026), mem('hired_me', 2026), mem('told_gently', 2026), mem('olive_branch', 2026), mem('asked_too_often', 2026), mem(bound ? pinned[i % 5]! : 'covered_for_me', 2026), mem('reconciled', 2026)]
      const key = `person:x${String(i).padStart(5, '0')}>${ego}`
      expect(putEdge(g, key, E({ f: 30, s: 100, l: 2026, m, ...(bound ? { k: 'kin' as const } : {}) })), key).toBe(true)
    }
    for (let year = 1; year <= 100; year++) {
      nextYear(g)
      if (year === 1 || year === 7 || year === 30 || year === 100) {
        expect(edgeProblems(readWorld(g).edges), `after year ${year}`).toEqual([])
        expect(Object.keys(rootOf(g)).length).toBeLessThanOrEqual(EDGE_CAPS.edges)
        expect(memoCount(g)).toBeLessThanOrEqual(EDGE_CAPS.memTotal)
      }
    }
    const left = Object.entries(rootOf(g))
    expect(left).toHaveLength(EDGE_CAPS.edges / 2)
    expect(left.every(([, e]) => e.s === 0 && e.k === 'kin')).toBe(true)
    expect(left.every(([, e]) => (e.m ?? []).every((x) => pinned.includes(x.slice(0, x.indexOf('.')) as (typeof pinned)[number])))).toBe(true)
    expect(readSocial(g)!.y).toBe(2126)
  }, 120_000)

  it('5,000 people changed in one life: the map stays at its cap and every edge is valid', () => {
    const g = socialGame(3)
    const ego = playerRef(g)
    for (let i = 0; i < 5_000; i++) {
      const p = cast(g, 10 + (i % 80), 'friend', { data: { sid: `cls.us.2004.${i}` } })
      applyDelta(g, p, -(i % 7) - 1)
    }
    expect(Object.keys(rootOf(g)).length).toBe(EDGE_CAPS.edges)
    expect(edgeProblems(readWorld(g).edges, g.people, ego)).toEqual([])
    nextYear(g, 12)
    expect(Object.keys(rootOf(g)).length).toBeLessThanOrEqual(EDGE_CAPS.edges)
    expect(edgeProblems(readWorld(g).edges)).toEqual([])
  }, 120_000)

  it('offences without end cap resentment at 100 and obligation at 100', () => {
    const g = socialGame(3)
    const p = cast(g, 50)
    for (let i = 0; i < 10_000; i++) {
      applyDelta(g, p, 100)
      applyDelta(g, p, -100)
    }
    expect(edgeOf(g, p)!.s).toBe(100)
    p.data.w = { by: g.character.id, owes: 1e300, owesSince: 1900 } as never
    p.data.wl = { by: g.character.id, anger: 1e300, cut: true, estr: true } as never
    nextYear(g, 400)
    const e = edgeOf(g, p)!
    expect(e.s).toBeLessThanOrEqual(100)
    expect(e.o).toBe(100)
    expect(e.dv![0]).toBeLessThanOrEqual(1e12)
  })

  it('the writer keeps its counts between writes (R4-E7) and decides exactly as a cold one does: feuds, debts, dialogue edges and memories at their caps', () => {
    const warm = socialGame(3)
    let cold = socialGame(3)
    const ego = playerRef(warm)
    let x = 99
    const next = (n: number): number => {
      x = (Math.imul(x, 1664525) + 1013904223) >>> 0
      return x % n
    }
    const kinds: MemoryKind[] = ['gift_given', 'loan_given', 'hired_me', 'betrayal', 'told_gently', 'reconciled', 'saved_me', 'olive_branch']
    let refused = 0
    for (let i = 0; i < 500; i++) {
      const key = `person:c${String(next(70)).padStart(2, '0')}>${ego}`
      const op = next(10)
      const patch: Partial<Edge> | null =
        op === 0 ? null
        : op <= 2 ? { q: [1 + next(4), 2020, next(200)] }
        : op <= 4 ? { dv: [100 + next(900), next(30), 2020, next(2), next(50)] }
        : op === 5 ? { n: ['tellme'], d: [next(900)] }
        : op === 6 ? { q: undefined, dv: undefined, n: undefined, d: undefined }
        : { m: Array.from({ length: 1 + next(8) }, (_, k) => mem(kinds[(i + k) % kinds.length]!, 2000 + next(26), (1 + next(3)) as 1 | 2 | 3)) }
      const full = patch === null ? null : { t: 50, f: 50, r: 50, s: next(100), o: 0, y: 2020, l: 2026, ...patch }
      cold = structuredClone(cold)
      const a = putEdge(warm, key, full)
      const b = putEdge(cold, key, full)
      expect(a, `op ${i} ${JSON.stringify(full)}`).toBe(b)
      if (!a) refused++
      expect(canonical(readWorld(warm).edges), `op ${i}`).toBe(canonical(readWorld(cold).edges))
    }
    expect(refused, 'the caps must have refused something').toBeGreaterThan(0)
    expect(edgeProblems(readWorld(warm).edges)).toEqual([])
  })

  it('a tap of 10 writes at 1,200 edges costs less than a millisecond on the reference machine', () => {
    const g = socialGame(3)
    const ego = playerRef(g)
    const people: Person[] = []
    for (let i = 0; i < EDGE_CAPS.edges; i++) {
      const p = cast(g, 40 + (i % 40), 'friend', { data: { sid: `cls.us.2004.${i}` } })
      people.push(p)
      expect(putEdge(g, `${personEntity(p)}>${ego}`, E({ f: p.relationship, y: 2020, l: 2026 }))).toBe(true)
    }
    const taps: number[] = []
    for (let tap = 0; tap < 40; tap++) {
      const t0 = performance.now()
      for (let k = 0; k < 10; k++) applyDelta(g, people[(tap * 37 + k * 101) % people.length]!, tap % 2 === 0 ? -3 : 3)
      taps.push(performance.now() - t0)
    }
    taps.sort((a, b) => a - b)
    const median = taps[Math.floor(taps.length / 2)]!
    const budget = 1 * machineFactor()
    console.log(`tap of 10 mirrored writes at ${EDGE_CAPS.edges} edges (E7): median ${median.toFixed(3)} ms, best ${taps[0]!.toFixed(3)} ms, budget ${budget.toFixed(2)} ms (1 ms x machine factor ${machineFactor().toFixed(2)})`)
    expect(median).toBeLessThan(budget)
    expect(edgeProblems(readWorld(g).edges, g.people, ego)).toEqual([])
  }, 60_000)
})

// ---------------------------------------------------------------------------------------------------------------------
// 8. A clone, a reload and a Time Machine jump

/** A stamped game with a few years behind it: edges, memories, a debt, a feud and an orphan about to go. */
function lived(): GameState {
  const g = socialLife({ seed: LIFE_SEED, year: BIRTH, countryId: 'us' })
  const a = cast(g, 70, 'sibling')
  const b = cast(g, 40)
  const c = cast(g, 20)
  applyDelta(g, a, -25)
  applyDelta(g, b, 15)
  b.data.w = { by: g.character.id, owes: 640, owesSince: 2026 } as never
  c.data.wl = { by: g.character.id, anger: 55, cut: true, estr: false } as never
  expect(putEdge(g, keyOf(g, a), { m: [mem('gift_given', 2026), mem('betrayal', 2026, 2)], q: [2, 2026, 7] })).toBe(true)
  syncLegacy(g, b)
  syncLegacy(g, c)
  nextYear(g, 2)
  return g
}

describe('a clone, a reload and a Time Machine jump give the same edges', () => {
  const years = (g: GameState): string => {
    for (let i = 0; i < 6; i++) nextYear(g)
    return canonical({ edges: readWorld(g).edges, social: readWorld(g).social })
  }

  it('a clone steps to the same edges as the game it was made from', () => {
    const g = lived()
    const clone = structuredClone(g)
    expect(years(clone)).toBe(years(g))
  })

  it('a game that was saved and loaded steps to the same edges', () => {
    const g = lived()
    resetSaveStoreForTests()
    installStorageShim()
    setSaveBackend(memorySaveBackend())
    try {
      expect(saveGame(g)).toBe(true)
      const back = loadGame()
      expect(back, 'the save store reads back what it wrote').not.toBeNull()
      expect(canonical(readWorld(back!).edges)).toBe(canonical(readWorld(g).edges))
      expect(years(back!)).toBe(years(g))
    } finally {
      resetSaveStoreForTests()
    }
  }, 120_000)

  it('a snapshot of the Time Machine, restored and played on, steps to the same edges', async () => {
    const g = lived()
    const snap = structuredClone(g)
    const backend = memorySnapshotBackend()
    setSnapshotBackend(backend)
    try {
      startTimeline(snap.lifeId, null)
      await snapshotWritesSettled()
      expect(await takeSnapshot(snap)).toBe(true)
      await snapshotWritesSettled()
      const restored = await loadSnapshot(snap.lifeId, snap.character.age)
      expect(restored).not.toBeNull()
      expect(canonical(readWorld(restored!).edges)).toBe(canonical(readWorld(g).edges))
      expect(years(restored!)).toBe(years(g))
    } finally {
      setSnapshotBackend(null)
    }
  }, 120_000)

  it('the same game stepped twice from the start gives the same edges (no dice, no clock)', () => {
    expect(years(lived())).toBe(years(lived()))
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 8b. The heir switch

describe('the heir hand-over of a stamped life', () => {
  it('keeps the stamp, makes no problem, and starts the new ego with no edge until the heir plays (L9 copies them later)', () => {
    const g = socialGame(5, { age: 82, money: 2_000_000 })
    const kid = cast(g, 70, 'child', { age: 50, lastName: g.character.lastName })
    const sib = cast(g, 60, 'child', { age: 47, lastName: g.character.lastName })
    const pal = cast(g, 55, 'friend', { age: 80 })
    applyDelta(g, kid, -5)
    applyDelta(g, sib, 6)
    applyDelta(g, pal, -8)
    const oldEgo = playerRef(g)
    expect(Object.keys(rootOf(g))).toHaveLength(3)
    killCharacter(g, 'Heart Attack')
    g.queue = []
    const n = continueAsChild(g, kid.id)
    expect(n, 'the hand-over must happen').not.toBe(g)
    expect(socialOn(n)).toBe(true)
    const ego = playerRef(n)
    expect(ego).toBe(`person:${kid.id}`)
    expect(ego).not.toBe(oldEgo)
    // what the hand-over wrote on the way (the people rebuilt from the heir's seat) ends at the old ego or nowhere; none ends at the heir
    expect(Object.keys(rootOf(n)).filter((k) => k.endsWith(`>${ego}`))).toEqual([])
    expect(edgeProblems(readWorld(n).edges, n.people, ego)).toEqual([])
    expect(worldProblems(n, { live: false }).filter((p) => p.startsWith('edges') || p.startsWith('social'))).toEqual([])
    // the heir plays: a relative's number moves and the edge toward the heir holds it
    const rel = n.people.find((p) => p.alive && p.relation !== 'pet' && p.id !== kid.id && Number.isFinite(p.relationship) && p.relationship > 5)
    expect(rel, 'the heir has a relative').toBeDefined()
    applyDelta(n, rel!, -4)
    expect(readEdge(n, personEntity(rel!), ego)!.f).toBe(rel!.relationship)
    n.year += 1
    stepEdges(n)
    expect(readSocial(n)!.y).toBe(n.year)
    expect(edgeProblems(readWorld(n).edges, n.people, ego)).toEqual([])
  }, 120_000)
})

// ---------------------------------------------------------------------------------------------------------------------
// 9. Through the real ageUp

describe('through ageUp', () => {
  it('a stamped life keeps the stamp current, the affection invariant and valid bounded edges for 25 years', () => {
    const start = socialLife({ seed: LIFE_SEED, year: BIRTH, countryId: 'us' })
    expect(readSocial(start)).toEqual({ v: 1, on: 1, y: BIRTH, fy: BIRTH })
    let made = 0
    const { g } = playLife({
      seed: LIFE_SEED,
      birthYear: BIRTH,
      from: start,
      untilAge: 25,
      onYear: (game, n) => {
        if (n === 0) return
        expect(readSocial(game)!.y, `year ${n}`).toBe(game.year)
        expect(readSocial(game)!.fy).toBe(BIRTH)
        const problems = worldProblems(game, { live: false }).filter((p) => p.startsWith('edges') || p.startsWith('social'))
        expect(problems, `year ${n}`).toEqual([])
        made = Object.keys(rootOf(game)).length
        expect(made).toBeLessThanOrEqual(EDGE_CAPS.edges)
      },
    })
    expect(g.character.age).toBeGreaterThanOrEqual(25)
    expect(made, 'a family and a school full of people have edges after 25 years').toBeGreaterThan(5)
    // every living person with an edge to the player has f equal to the relationship
    for (const p of g.people) {
      if (p.relation === 'pet') continue
      const e = edgeOf(g, p)
      if (e !== null) expect(e.f, `${p.relation} ${p.firstName}`).toBe(p.relationship)
    }
  }, 240_000)

  it('a replay of the last year changes nothing', () => {
    const g = socialLife({ seed: LIFE_SEED, year: BIRTH, countryId: 'us' })
    for (let i = 0; i < 8; i++) {
      g.queue = []
      ageUp(g)
    }
    const text = canonical(g.world)
    stepEdges(g)
    expect(canonical(g.world)).toBe(text)
  }, 120_000)

  it('a life that is not stamped writes no edge and no shard in 25 years', () => {
    const { g } = playLife({
      seed: LIFE_SEED,
      birthYear: BIRTH,
      untilAge: 25,
      onYear: (game) => {
        const w = (game.world ?? {}) as Record<string, unknown>
        expect(w.edges).toBeUndefined()
        expect(w.social).toBeUndefined()
      },
    })
    expect(g.character.age).toBeGreaterThanOrEqual(25)
  }, 240_000)
})
