// R4-E14 (X13, X14, X25, C4, C5, C6): `isBound`, the eviction guards, and the Met protector and salience (src/game/world/edge-bound.ts).
// An edge is bound when the edge says so (a link kind, an unpaid debt, a feud, a pinned memory: edgeLocalBound) or when the person at
// either end of it is held at the person level: owes the player, a living spouse or fiance, a child or stepchild, holds a family share,
// owns an old NPC firm, holds a family job, or is cut out of the will or estranged. The file proves, in the order of the plan:
//   1. isBound, one reason at a time and its controls, both directions of the key, hostile data, a deep-frozen game with g.rng trapped.
//   2. The society door re-exports the same function (C4).
//   3. The protector `edges.bound`: the far end of every bound edge, as personKey values; registered once, at load; total on a hostile map.
//   4. The salience `edges.salience`: f + s + abs(o) of the edge person>player and nothing for the role (Met adds its own, X13).
//   5. Eviction: putEdge at 1,200 edges evicts only unbound edges, weakest first, whatever the order of the inserts; a world full of bound
//      edges refuses; the orphan rule of the yearly step keeps a bound edge.
//   6. cleanupPeople (relationships.ts): 25 exes with one debtor keep the debtor; a dead friend who owes is still there when
//      settleTheDead runs; a life that is not stamped keeps the v5.2.0 rule to the digit; 100 x the exes stay at the ceiling.
//   7. Across the two tracks: a sid-born debtor with an edge debt survives the Met sweep, and one without it does not.
// No pinned seed: lives are makeTestGame games with a constant, casts are built with every field given.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readTies, updateTies } from '../src/game/events/wealth-core'
import { yearlyWealth } from '../src/game/events/wealth'
import { personEntity } from '../src/game/kernel/person-ref'
import { yearlyRelationships } from '../src/game/relationships'
import { isBound as isBoundByContract } from '../src/game/society/contract'
import type { GameState, Person } from '../src/game/types'
import { EDGE_CAPS } from '../src/game/world/caps'
import { boundFarEnds, boundTest, isBound, playerEdgeSalience } from '../src/game/world/edge-bound'
import { formatMemory, type MemoryKind } from '../src/game/world/edge-memory'
import { stepEdges } from '../src/game/world/edge-step'
import { putEdge } from '../src/game/world/edge-write'
import { edgeKey, edgeLocalBound, edgeProblems, normalizeEdges, readEdge, salience, type Edge, type EdgeKey } from '../src/game/world/edges'
import { OUTSIDE } from '../src/game/world/holdings'
import { playerRef } from '../src/game/world/people'
import { fromSeeded } from '../src/game/world/latent'
import { isProtected, registerProtector, registerSalience, salienceOf, sweepMet, touchMet } from '../src/game/world/met-ops'
import { readMet, writeMet, type MetRecord } from '../src/game/world/met'
import '../src/game/world/shards'
import { makeSid } from '../src/game/world/sid'
import { ensureWorld, readWorld } from '../src/game/world/state'
import { worldSeed } from '../src/game/kernel/streams'
import { trapRng } from './effort-kit'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'
import { cast, socialGame } from './social-kit'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const FILE = 'src/game/world/edge-bound.ts'
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)

// ---------------------------------------------------------------------------------------------------------------------
// Builders

const E = (over: Partial<Edge> = {}): Edge => ({ t: 50, f: 50, r: 50, s: 0, o: 0, y: 2020, l: 2026, ...over })
const mem = (kind: MemoryKind, year = 2024, w: 1 | 2 | 3 = 2): string => formatMemory({ kind, year, w, by: 'ego' })
const pad = (n: number, w = 4): string => String(n).padStart(w, '0')
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
const keyTo = (g: GameState, p: Person): EdgeKey => edgeKey(personEntity(p), playerRef(g))!
const keyFrom = (g: GameState, p: Person): EdgeKey => edgeKey(playerRef(g), personEntity(p))!
const rootOf = (g: GameState): Record<string, Edge> => (readWorld(g).edges ?? {}) as Record<string, Edge>
const keysOf = (g: GameState): string[] => Object.keys(rootOf(g))

/** A stamped game with a player of 40. */
const game = (seed = 5): GameState => socialGame(seed, { age: 40, money: 50_000 })

/** A friend with a plain edge person>player: nothing binds it until the test says so. */
function friend(g: GameState, over: Partial<Parameters<typeof cast>[3]> = {}, relationship = 50): Person {
  const p = cast(g, relationship, 'friend', over)
  expect(putEdge(g, keyTo(g, p), E({ f: relationship }))).toBe(true)
  return p
}

/** Writes the holdings table as the world reader expects it: these persons each hold a sliver of one company. */
function holders(g: GameState, keys: readonly string[]): void {
  const share = Math.round((0.5 / Math.max(1, keys.length)) * 1e6) / 1e6
  const rows = keys.map((k) => [`person:${k}`, 'firm:f1', share])
  ensureWorld(g).holdings = { v: 1, y: g.year, rows: [...rows, [OUTSIDE, 'firm:f1', Math.round((1 - share * keys.length) * 1e6) / 1e6]] } as never
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffled<T>(xs: readonly T[], rand: () => number): T[] {
  const out = [...xs]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

// ---------------------------------------------------------------------------------------------------------------------
// 1. isBound

describe('isBound: the edge says so', () => {
  const LOCAL: readonly (readonly [string, Partial<Edge>])[] = [
    ['a link kind', { k: 'kin' }],
    ['a feud', { q: [1, 2020, 3] }],
    ['an unpaid debt', { dv: [100, 5, 2020, 0, 10] }],
    ['a pinned memory', { m: [mem('betrayal')] }],
  ]
  for (const [name, over] of LOCAL) {
    it(`is true for ${name}, in both directions of the key, and agrees with edgeLocalBound`, () => {
      const g = game()
      const p = cast(g, 50)
      expect(putEdge(g, keyTo(g, p), E(over))).toBe(true)
      expect(putEdge(g, keyFrom(g, p), E(over))).toBe(true)
      expect(edgeLocalBound(readEdge(g, personEntity(p), playerRef(g))!)).toBe(true)
      expect(isBound(g, keyTo(g, p))).toBe(true)
      expect(isBound(g, keyFrom(g, p))).toBe(true)
    })
  }

  it('is false for a plain friend, a paid debt and an unpinned memory', () => {
    const g = game()
    const plain = friend(g)
    const paid = cast(g, 50)
    expect(putEdge(g, keyTo(g, paid), E({ dv: [100, 5, 2020, 0, 100] }))).toBe(true)
    const gift = cast(g, 50)
    expect(putEdge(g, keyTo(g, gift), E({ m: [mem('gift_given'), mem('loan_given')] }))).toBe(true)
    expect(isBound(g, keyTo(g, plain))).toBe(false)
    expect(isBound(g, keyTo(g, paid))).toBe(false)
    expect(isBound(g, keyTo(g, gift))).toBe(false)
  })

  it('is false for a key that is no edge key, and for anything that is not a key', () => {
    const g = game()
    friend(g)
    const bad: unknown[] = ['', 'banana', 'person:a', 'person:a>person:b>person:c', 'person:a>', '>person:b', `person:${'x'.repeat(150)}>${playerRef(g)}`, 'secret:1', 7, null, undefined, {}]
    for (const k of bad) expect(isBound(g, k as never), String(k)).toBe(false)
  })
})

describe('isBound: the person is held', () => {
  const ego = (g: GameState): string => g.character.id
  const CASES: readonly (readonly [string, (g: GameState) => Person])[] = [
    ['owes the player (the ties record, read raw)', (g) => cast(g, 50, 'friend', { data: { w: { by: ego(g), owes: 500, owesSince: 2024 } } })],
    ['is a living spouse', (g) => cast(g, 50, 'spouse')],
    ['is a living fiance', (g) => cast(g, 50, 'fiance')],
    ['is a child', (g) => cast(g, 50, 'child')],
    ['is a stepchild', (g) => cast(g, 50, 'stepchild')],
    ['owns an old NPC firm', (g) => cast(g, 50, 'friend', { data: { npcCompany: { id: 'npc1' } } })],
    ['holds a family job', (g) => cast(g, 50, 'sibling', { data: { nepo: { assetId: 'a1', rank: 1 } } })],
    ['is cut out of the will', (g) => cast(g, 50, 'friend', { data: { wl: { by: ego(g), cut: true } } })],
    ['is estranged', (g) => cast(g, 50, 'friend', { data: { wl: { by: ego(g), estr: true } } })],
  ]
  for (const [name, make] of CASES) {
    it(`is true for an edge to a person who ${name}, though the edge itself is plain, in both directions`, () => {
      const g = game()
      const p = make(g)
      expect(putEdge(g, keyTo(g, p), E())).toBe(true)
      expect(putEdge(g, keyFrom(g, p), E())).toBe(true)
      expect(edgeLocalBound(readEdge(g, personEntity(p), playerRef(g))!)).toBe(false)
      expect(isBound(g, keyTo(g, p))).toBe(true)
      expect(isBound(g, keyFrom(g, p))).toBe(true)
    })
  }

  it('is true for a holder of a family share, and the table is read as the world reads it', () => {
    const g = game()
    const p = friend(g)
    expect(isBound(g, keyTo(g, p))).toBe(false)
    holders(g, [personEntity(p).slice('person:'.length)])
    expect(isBound(g, keyTo(g, p))).toBe(true)
    // the player's own stake binds nobody, and the outside is no person
    const q = friend(g)
    ensureWorld(g).holdings = { v: 1, y: g.year, rows: [[playerRef(g), 'firm:f1', 0.5], [OUTSIDE, 'firm:f1', 0.5]] } as never
    expect(isBound(g, keyTo(g, q))).toBe(false)
  })

  it('is true when the person is the sid of a Person, by personKey: a sid-born holder is held under the sid', () => {
    const g = game()
    const sid = makeSid({ kind: 'frn', place: 'us', cohort: 1990, ord: 3 })
    const p = cast(g, 50, 'friend', { data: { sid } })
    expect(personEntity(p)).toBe(`person:${sid}`)
    expect(putEdge(g, keyTo(g, p), E())).toBe(true)
    expect(isBound(g, keyTo(g, p))).toBe(false)
    holders(g, [sid])
    expect(isBound(g, keyTo(g, p))).toBe(true)
  })

  const CONTROLS: readonly (readonly [string, (g: GameState) => Person])[] = [
    ['a dead spouse', (g) => Object.assign(cast(g, 50, 'spouse'), { alive: false })],
    ['an ex', (g) => cast(g, 50, 'ex')],
    ['a loan recorded by another owner', (g) => cast(g, 50, 'friend', { data: { w: { by: 'someone-else', owes: 500, owesSince: 2024 } } })],
    ['a loan of nothing', (g) => cast(g, 50, 'friend', { data: { w: { by: ego(g), owes: 0 } } })],
    ['a loan that is no number', (g) => cast(g, 50, 'friend', { data: { w: { by: ego(g), owes: 'lots' } } })],
    ['a firm record with no id', (g) => cast(g, 50, 'friend', { data: { npcCompany: { name: 'x' } } })],
    ['a firm record that is no object', (g) => cast(g, 50, 'friend', { data: { npcCompany: 'co9' } })],
    ['a job record with no company', (g) => cast(g, 50, 'friend', { data: { nepo: { rank: 2 } } })],
    ['a will record of another owner that says cut', (g) => cast(g, 50, 'friend', { data: { wl: { by: 'someone-else', cut: true } } })],
    ['a will record that is not cut or estranged', (g) => cast(g, 50, 'friend', { data: { wl: { by: ego(g), anger: 80, cut: false } } })],
  ]
  for (const [name, make] of CONTROLS) {
    it(`is false for ${name}`, () => {
      const g = game()
      const p = make(g)
      expect(putEdge(g, keyTo(g, p), E())).toBe(true)
      expect(isBound(g, keyTo(g, p))).toBe(false)
    })
  }

  it('needs no edge for the person-level reasons: a debtor with no edge yet is bound, a friend with none is not', () => {
    const g = game()
    const debtor = cast(g, 50, 'friend', { data: { w: { by: ego(g), owes: 500, owesSince: 2024 } } })
    const plain = cast(g, 50)
    expect(readEdge(g, personEntity(debtor), playerRef(g))).toBeNull()
    expect(isBound(g, keyTo(g, debtor))).toBe(true)
    expect(isBound(g, keyTo(g, plain))).toBe(false)
  })

  it('counts either person end of an edge between two people: the far end of a spouse is held', () => {
    const g = game()
    const spouse = cast(g, 50, 'spouse')
    const other = cast(g, 50, 'friend')
    const between = edgeKey(personEntity(spouse), personEntity(other))!
    expect(putEdge(g, between, E())).toBe(true)
    expect(isBound(g, between)).toBe(true)
    const far = edgeKey(personEntity(other), `person:ghost`)!
    expect(putEdge(g, far, E())).toBe(true)
    expect(isBound(g, far)).toBe(false)
  })
})

describe('isBound is pure and total', () => {
  it('reads a deep-frozen game with g.rng trapped: no write, no draw, no id', () => {
    const g = game()
    const debtor = cast(g, 50, 'friend', { data: { w: { by: g.character.id, owes: 500, owesSince: 2024 } } })
    const feud = cast(g, 50)
    const plain = friend(g)
    expect(putEdge(g, keyTo(g, debtor), E({ f: 20 }))).toBe(true)
    expect(putEdge(g, keyTo(g, feud), E({ q: [2, 2024, 1] }))).toBe(true)
    holders(g, [personEntity(plain).slice('person:'.length)])
    const nextId = g.nextId
    deepFreeze(trapRng(g))
    expect(isBound(g, keyTo(g, debtor))).toBe(true)
    expect(isBound(g, keyTo(g, feud))).toBe(true)
    expect(isBound(g, keyTo(g, plain))).toBe(true)
    expect(boundFarEnds(g).length).toBeGreaterThanOrEqual(3)
    expect(playerEdgeSalience(g, personEntity(feud).slice('person:'.length))).toBeGreaterThan(0)
    expect(boundTest(g)(keyTo(g, debtor))).toBe(true)
    expect(g.nextId).toBe(nextId)
  })

  it('does not throw on hostile people, hostile data, a hostile edge root or a game with no world', () => {
    const g = game()
    const p = friend(g)
    const key = keyTo(g, p)
    const bad = [null, 7, 'x', [], {}, { id: 'p9' }, { id: 'p10', data: null, relation: 'spouse' }] as unknown as Person[]
    const thrower = cast(g, 50)
    Object.defineProperty(thrower, 'data', { get: () => { throw new Error('a getter that throws') }, configurable: true })
    g.people.push(...bad, thrower)
    expect(() => isBound(g, key)).not.toThrow()
    expect(isBound(g, key)).toBe(false)
    expect(() => boundFarEnds(g)).not.toThrow()
    ensureWorld(g).edges = 'garbage' as never
    expect(boundFarEnds(g)).toEqual([])
    expect(playerEdgeSalience(g, 'p1')).toBe(0)
    expect(isBound(g, key)).toBe(false)
    const bare = makeTestGame(1)
    expect(isBound(bare, 'person:a>person:b')).toBe(false)
    expect(boundFarEnds(bare)).toEqual([])
    expect(playerEdgeSalience(bare, 'a')).toBe(0)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 2. The society door

describe('society/contract.ts', () => {
  it('re-exports the very function of world/edge-bound.ts (C4)', () => {
    expect(isBoundByContract).toBe(isBound)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 3. The protector

describe('the protector edges.bound', () => {
  it('names the person at the far end of every bound edge, as personKey values, once each and in order', () => {
    const g = game()
    const ego = playerRef(g)
    const spouse = cast(g, 50, 'spouse')
    const plain = friend(g)
    const raw: [string, Edge][] = [
      [`person:aa>${ego}`, E({ dv: [100, 0, 2024, 0, 0] })],
      [`${ego}>person:bb`, E({ q: [1, 2024, 0] })],
      ['person:cc>person:dd', E({ k: 'kin' })],
      [`person:ee>${ego}`, E()],
      [`person:ff>${ego}`, E({ m: [mem('saved_me')] })],
      [`${personEntity(spouse)}>${ego}`, E()],
      [`firm:f1>person:gg`, E({ k: 'company' })],
    ]
    for (const [k, e] of raw) expect(putEdge(g, k, e), k).toBe(true)
    expect(boundFarEnds(g)).toEqual(['aa', 'bb', 'cc', 'dd', 'ff', 'gg', personEntity(spouse).slice('person:'.length)].sort(cmp))
    expect(boundFarEnds(g)).not.toContain(personEntity(plain).slice('person:'.length))
    expect(boundFarEnds(g)).not.toContain('ee')
    expect(boundFarEnds(g)).not.toContain(ego.slice('person:'.length))
  })

  it('holds the key in the Met store through isProtected, for a key that no Person bears', () => {
    const g = game()
    const ego = playerRef(g)
    expect(putEdge(g, `person:aa>${ego}`, E({ dv: [100, 0, 2024, 0, 0] }))).toBe(true)
    expect(putEdge(g, `person:ee>${ego}`, E())).toBe(true)
    expect(isProtected(g, 'aa')).toBe(true)
    expect(isProtected(g, 'ee')).toBe(false)
  })

  it('is registered once, at load: the same id with another function throws', () => {
    expect(() => registerProtector('edges.bound', () => [])).toThrow()
    expect(() => registerSalience('edges.salience', () => 0)).toThrow()
  })

  it('names nothing for a life with no edges and nothing for a root that is no map', () => {
    const g = game()
    expect(boundFarEnds(g)).toEqual([])
    ensureWorld(g).edges = [1, 2, 3] as never
    expect(boundFarEnds(g)).toEqual([])
    ensureWorld(g).edges = 42 as never
    expect(boundFarEnds(g)).toEqual([])
  })

  it('stays inside the Met scan limit at 1,200 bound edges, and is a function of the set of edges alone', () => {
    const g = game()
    const ego = playerRef(g)
    const entries = Array.from({ length: EDGE_CAPS.edges }, (_, i) => [`person:p${pad(i)}>${ego}`, E({ k: 'kin' })] as const)
    for (const [k, e] of shuffled(entries, mulberry(3))) expect(putEdge(g, k, e)).toBe(true)
    const a = boundFarEnds(g)
    expect(a).toHaveLength(EDGE_CAPS.edges)
    expect([...a].sort(cmp)).toEqual(a)
    expect(new Set(a).size).toBe(a.length)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 4. The salience

describe('the salience edges.salience', () => {
  it('is f + s + abs(o) of the edge person>player, with no weight for the role', () => {
    const g = game()
    const ego = playerRef(g)
    expect(putEdge(g, `person:aa>${ego}`, E({ f: 40, s: 10, o: -5, k: 'kin' }))).toBe(true)
    const e = readEdge(g, 'person:aa', ego)!
    expect(salience(e)).toBe(95) // the edge's own salience counts the kin role (40)
    expect(playerEdgeSalience(g, 'aa')).toBe(55)
    expect(salience(e, 0)).toBe(55)
  })

  it('reads the edge person>player only: the other direction and an edge between two people count nothing', () => {
    const g = game()
    const ego = playerRef(g)
    expect(putEdge(g, `${ego}>person:bb`, E({ f: 90, s: 90, o: 90 }))).toBe(true)
    expect(putEdge(g, 'person:cc>person:bb', E({ f: 90 }))).toBe(true)
    expect(playerEdgeSalience(g, 'bb')).toBe(0)
    expect(playerEdgeSalience(g, 'zz')).toBe(0)
  })

  it('is 0 for a key that is not a ref and is never negative, NaN or above 300', () => {
    const g = game()
    const ego = playerRef(g)
    expect(putEdge(g, `person:aa>${ego}`, E({ f: 100, s: 100, o: -100 }))).toBe(true)
    expect(playerEdgeSalience(g, 'aa')).toBe(300)
    for (const k of ['', 'a b', 'a>b', 'x'.repeat(200), 7, null, undefined]) expect(playerEdgeSalience(g, k as never), String(k)).toBe(0)
  })

  it('is what the Met store ranks with, and Met adds the role weight itself, once (X13)', () => {
    const g = game()
    const ego = playerRef(g)
    const sid = makeSid({ kind: 'cls', place: 'us', cohort: 1990, ord: 4 })
    expect(touchMet(g, sid, { w: 3 })).toBe(true)
    expect(salienceOf(g, sid)).toBe(30)
    expect(putEdge(g, `person:${sid}>${ego}`, E({ f: 40, s: 10, o: -5, k: 'kin' }))).toBe(true)
    expect(salienceOf(g, sid)).toBe(55 + 30)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 5. Eviction and the orphan rule

describe('putEdge at 1,200 edges: only unbound edges go', () => {
  /** 12 children with a weak edge, 12 edges with a rival link, and 1,176 plain ones of salience 20 to 89: 1,200 edges. */
  function crowded(): { g: GameState; kids: Person[]; linked: string[]; plain: string[] } {
    const g = game()
    const ego = playerRef(g)
    const kids = Array.from({ length: 12 }, () => cast(g, 1, 'child'))
    for (const k of kids) expect(putEdge(g, keyTo(g, k), E({ f: 1 }))).toBe(true)
    const linked: string[] = []
    const plain: string[] = []
    for (let i = 0; i < 12; i++) {
      const k = `person:l${pad(i)}>${ego}`
      linked.push(k)
      expect(putEdge(g, k, E({ f: 1, k: 'rival' }))).toBe(true)
    }
    for (let i = 0; i < EDGE_CAPS.edges - 24; i++) {
      const k = `person:p${pad(i)}>${ego}`
      plain.push(k)
      expect(putEdge(g, k, E({ f: 20 + (i % 70) }))).toBe(true)
    }
    expect(keysOf(g)).toHaveLength(EDGE_CAPS.edges)
    return { g, kids, linked, plain }
  }

  it('keeps the weak edge of a child, which only the person binds, while the weakest plain edges go in salience order', () => {
    const { g, kids, linked, plain } = crowded()
    const ego = playerRef(g)
    const order = [...plain].sort((a, b) => salience(rootOf(g)[a]!) - salience(rootOf(g)[b]!) || (a < b ? 1 : -1))
    for (let i = 0; i < 10; i++) {
      const before = new Set(keysOf(g))
      const k = `person:n${pad(i)}>${ego}`
      expect(putEdge(g, k, E({ f: 100, s: 50 }))).toBe(true)
      const gone = [...before].filter((x) => !new Set(keysOf(g)).has(x))
      expect(gone, `insert ${i}`).toEqual([order[i]])
    }
    for (const kid of kids) expect(rootOf(g)[keyTo(g, kid)], 'a child is held').toBeDefined()
    for (const k of linked) expect(rootOf(g)[k], 'a link is held').toBeDefined()
    expect(keysOf(g)).toHaveLength(EDGE_CAPS.edges)
    expect(edgeProblems(rootOf(g))).toEqual([])
  })

  it('leaves the same set of edges whatever the order of the inserts, when every newcomer is stronger than every plain edge', () => {
    const results: string[] = []
    for (const seed of [1, 2, 3]) {
      const { g, kids } = crowded()
      const ego = playerRef(g)
      const unbound = EDGE_CAPS.edges - 24
      const cands = Array.from({ length: unbound }, (_, i) => `person:n${pad(i)}>${ego}`)
      for (const k of shuffled(cands, mulberry(seed))) expect(putEdge(g, k, E({ f: 100, s: Number(k.slice(8, 12)) % 50 }))).toBe(true)
      expect(keysOf(g)).toHaveLength(EDGE_CAPS.edges)
      for (const kid of kids) expect(rootOf(g)[keyTo(g, kid)]).toBeDefined()
      expect(keysOf(g).filter((k) => /^person:p\d{4}>/.test(k)), 'no plain edge is left').toEqual([])
      results.push(keysOf(g).join('|'))
    }
    expect(results[1]).toBe(results[0])
    expect(results[2]).toBe(results[0])
  })

  it('holds the bound edges and the cap against 100 x as many newcomers, strong and weak', () => {
    const { g, kids, linked } = crowded()
    const ego = playerRef(g)
    const rand = mulberry(9)
    for (let i = 0; i < 1200; i++) putEdge(g, `person:f${pad(i)}>${ego}`, E({ f: Math.floor(rand() * 100), s: Math.floor(rand() * 100) }))
    expect(keysOf(g).length).toBeLessThanOrEqual(EDGE_CAPS.edges)
    for (const kid of kids) expect(rootOf(g)[keyTo(g, kid)]).toBeDefined()
    for (const k of linked) expect(rootOf(g)[k]).toBeDefined()
    expect(edgeProblems(rootOf(g))).toEqual([])
    expect(normalizeEdges(rootOf(g))).toBe(rootOf(g))
  })

  it('refuses a new edge when all 1,200 are bound, edge by edge or person by person, and says so; one unbound edge makes room', () => {
    const g = game()
    const ego = playerRef(g)
    const held = EDGE_CAPS.edges / 2
    const ids = Array.from({ length: held }, (_, i) => `h${pad(i)}`)
    for (let i = 0; i < held; i++) expect(putEdge(g, `person:k${pad(i)}>${ego}`, E({ k: 'kin' }))).toBe(true)
    for (const id of ids) expect(putEdge(g, `person:${id}>${ego}`, E({ f: 1 }))).toBe(true)
    holders(g, ids)
    expect(keysOf(g)).toHaveLength(EDGE_CAPS.edges)
    const root = readWorld(g).edges
    expect(putEdge(g, `person:new>${ego}`, E({ f: 100 }))).toBe(false)
    expect(readWorld(g).edges).toBe(root)
    expect(rootOf(g)[`person:new>${ego}`]).toBeUndefined()
    // the table lets one of them go: its edge is the only one that may
    holders(g, ids.slice(1))
    expect(putEdge(g, `person:new>${ego}`, E({ f: 100 }))).toBe(true)
    expect(rootOf(g)[`person:${ids[0]}>${ego}`]).toBeUndefined()
    expect(keysOf(g)).toHaveLength(EDGE_CAPS.edges)
  })
})

describe('the yearly step: the orphan rule keeps a bound edge', () => {
  const orphan = (hold: boolean): { g: GameState; key: string } => {
    const g = game()
    const key = `person:gone>${playerRef(g)}`
    expect(putEdge(g, key, E({ f: 10, l: 2020 }))).toBe(true)
    if (hold) holders(g, ['gone'])
    g.year += 6
    stepEdges(g)
    return { g, key }
  }

  it('removes a light old edge of a person who is gone, as before', () => {
    expect(rootOf(orphan(false).g)).toEqual({})
  })

  it('keeps it when the person who is gone is a holder of a family share in the table', () => {
    const { g, key } = orphan(true)
    expect(rootOf(g)[key]).toBeDefined()
  })

  it('keeps the edge between a spouse who is here and a person who is gone', () => {
    const g = game()
    const spouse = cast(g, 50, 'spouse')
    const key = edgeKey(personEntity(spouse), 'person:ghost')!
    expect(putEdge(g, key, E({ f: 10, l: 2020 }))).toBe(true)
    g.year += 6
    stepEdges(g)
    expect(rootOf(g)[key]).toBeDefined()
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 6. cleanupPeople

describe('cleanupPeople on a stamped life keeps what is held', () => {
  /** n live exes with relationships 20, 23, 26 ...; the first (index 0) is at 1, the lowest ranked, so the old rule drops it first. */
  function exes(g: GameState, n: number, debtor = (i: number): boolean => i === 0, rel = (i: number): number => (i === 0 ? 1 : 20 + i * 3)): Person[] {
    return Array.from({ length: n }, (_, i) =>
      cast(g, rel(i), 'ex', { firstName: `Ex${i}`, age: 30, ...(debtor(i) ? { data: { w: { by: g.character.id, owes: 500, owesSince: 2024 } } } : {}) }),
    )
  }
  const liveExes = (g: GameState): Person[] => g.people.filter((p) => p.alive && p.relation === 'ex')
  /** The year's drift moves relationships a little before the cleanup ranks them: what the rule promises is an order, read afterwards. */
  const lowestKept = (people: readonly Person[], g: GameState, except: readonly Person[] = []): number =>
    Math.min(...people.filter((p) => p.alive && g.people.includes(p) && !except.includes(p)).map((p) => p.relationship))
  const highestDropped = (people: readonly Person[], g: GameState): number => Math.max(...people.filter((p) => p.alive && !g.people.includes(p)).map((p) => p.relationship))

  it('25 exes with one debtor keep the debtor and still end at 20 exes; the old rule dropped the debtor (the control)', () => {
    const old = makeTestGame(5, { age: 40, money: 50_000 })
    const olds = exes(old, 25)
    yearlyRelationships(old)
    expect(old.people.includes(olds[0]!), 'v5.2.0 drops the lowest ranked ex, debtor or not').toBe(false)
    expect(liveExes(old)).toHaveLength(20)

    const g = game()
    const people = exes(g, 25)
    yearlyRelationships(g)
    expect(g.people.includes(people[0]!), 'the debtor stays').toBe(true)
    expect(liveExes(g)).toHaveLength(20)
    // five went, the lowest ranked of the others, each no better regarded than any ex who stayed
    expect(people.filter((p) => p.alive && !g.people.includes(p))).toHaveLength(5)
    expect(highestDropped(people, g)).toBeLessThanOrEqual(lowestKept(people, g, [people[0]!]))
  })

  it('keeps an ex with a feud on the edge, and an ex who is a holder, in the same way', () => {
    const g = game()
    const people = exes(g, 25, () => false)
    expect(putEdge(g, keyTo(g, people[0]!), E({ f: 1, q: [1, 2024, 2] }))).toBe(true)
    holders(g, [personEntity(people[1]!).slice('person:'.length)])
    yearlyRelationships(g)
    expect(g.people.includes(people[0]!)).toBe(true)
    expect(g.people.includes(people[1]!)).toBe(true)
    expect(liveExes(g)).toHaveLength(20)
  })

  it('does nothing different on a life that is not stamped: the same exes go with the same debtors', () => {
    const a = makeTestGame(5, { age: 40, money: 50_000 })
    const b = makeTestGame(5, { age: 40, money: 50_000 })
    exes(a, 25, (i) => i < 6)
    exes(b, 25, () => false)
    yearlyRelationships(a)
    yearlyRelationships(b)
    expect(liveExes(a).map((p) => p.firstName)).toEqual(liveExes(b).map((p) => p.firstName))
  })

  it('stops at 40 exes however many are held: 2,500 debtors end at 40, the best regarded', () => {
    const g = game()
    const people = exes(g, 2500, () => true, (i) => 5 + ((i * 7) % 90))
    yearlyRelationships(g)
    expect(liveExes(g)).toHaveLength(40)
    expect(highestDropped(people, g)).toBeLessThanOrEqual(lowestKept(people, g))
  })

  it('keeps a dead friend who owes through the cleanup of the year, until settleTheDead has run, and then lets them go', () => {
    const g = game()
    const dead = cast(g, 50, 'friend', { firstName: 'Olde' })
    updateTies(g, dead, (t) => {
      t.owes = 800
      t.owesSince = g.year - 2
    })
    dead.alive = false
    dead.data.diedAge = 41
    const owesNothing = cast(g, 50, 'friend', { firstName: 'Free' })
    owesNothing.alive = false
    owesNothing.data.diedAge = 41
    yearlyRelationships(g)
    expect(g.people.includes(dead), 'the debtor is still there for settleTheDead').toBe(true)
    expect(g.people.includes(owesNothing), 'a dead friend who owes nothing goes as before').toBe(false)
    g.yearActions = {}
    yearlyWealth(g)
    expect(readTies(g, dead).owes).toBe(0)
    expect(JSON.stringify(g.log)).toContain('died with')
    g.year += 1
    g.character.age += 1
    yearlyRelationships(g)
    expect(g.people.includes(dead), 'settled, so the next cleanup lets them go').toBe(false)
  })

  it('keeps a dead friend who is owed on the edge alone (an open debt on person>player), until the debt is off the edge', () => {
    const g = game()
    const dead = cast(g, 50, 'friend', { firstName: 'Owed' })
    expect(putEdge(g, keyTo(g, dead), E({ dv: [300, 0, 2024, 0, 0] }))).toBe(true)
    dead.alive = false
    dead.data.diedAge = 41
    const paid = cast(g, 50, 'friend', { firstName: 'Paid' })
    expect(putEdge(g, keyTo(g, paid), E({ dv: [300, 0, 2024, 0, 300] }))).toBe(true)
    paid.alive = false
    paid.data.diedAge = 41
    yearlyRelationships(g)
    expect(g.people.includes(dead)).toBe(true)
    expect(g.people.includes(paid), 'a debt that is paid is no debt').toBe(false)
    // the yearly step takes the kind-0 debt off an edge whose record says nothing is owed; the next cleanup lets the person go
    g.year += 1
    g.character.age += 1
    stepEdges(g)
    yearlyRelationships(g)
    expect(g.people.includes(dead)).toBe(false)
  })

  it('does not keep a dead debtor on a life that is not stamped (v5.2.0 drops them in the year they die)', () => {
    const g = makeTestGame(5, { age: 40, money: 50_000 })
    const dead = cast(g, 50, 'friend', { firstName: 'Olde', data: { w: { by: g.character.id, owes: 800, owesSince: 2024 } } })
    dead.alive = false
    dead.data.diedAge = 41
    yearlyRelationships(g)
    expect(g.people.includes(dead)).toBe(false)
  })

  it('keeps at most 40 dead debtors, however many are owed: 100 x the debts do not hold 100 x the dead', () => {
    const g = game()
    const dead = Array.from({ length: 400 }, (_, i) => {
      const p = cast(g, 50, 'friend', { firstName: `Late${i}`, data: { w: { by: g.character.id, owes: 100 + i, owesSince: 2024 } } })
      p.alive = false
      p.data.diedAge = 41
      return p
    })
    yearlyRelationships(g)
    const kept = dead.filter((p) => g.people.includes(p))
    expect(kept).toHaveLength(EDGE_CAPS.debts)
    expect(kept.map((p) => p.id)).toEqual(dead.slice(0, EDGE_CAPS.debts).map((p) => p.id))
  })

  it('keeps a dead ex over the cap of ten while the ex still owes, and no other', () => {
    const g = game()
    const dead = Array.from({ length: 14 }, (_, i) => {
      const p = cast(g, 30, i % 2 === 0 ? 'ex' : 'exSpouse', { firstName: `Dead${i}`, age: 60 })
      p.alive = false
      p.data.diedAge = 20 + i
      return p
    })
    // the lowest ranked by age of death (the ones the old rule drops) is the one who owes
    updateTies(g, dead[0]!, (t) => {
      t.owes = 100
      t.owesSince = g.year - 1
    })
    yearlyRelationships(g)
    const kept = g.people.filter((p) => !p.alive && (p.relation === 'ex' || p.relation === 'exSpouse'))
    expect(kept).toHaveLength(11)
    expect(kept.includes(dead[0]!)).toBe(true)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 7. Across the two tracks

describe('a sid-born debtor survives the Met sweep, because of its edge', () => {
  /** A Met record for a sid that nobody has seen for ten years: the sweep would drop it. */
  function idle(g: GameState, sid: string): void {
    const identity = fromSeeded({ sid, first: 'Ida', last: 'Quist', gender: 'female', born: 1970, country: 'us' }, worldSeed(g))
    expect(touchMet(g, sid, undefined, undefined, identity)).toBe(true)
    const rec = readMet(g)[sid] as MetRecord
    writeMet(g, { ...readMet(g), [sid]: { ...rec, s: g.year - 10 } })
  }

  it('keeps the record while the edge person>player holds an unpaid debt, 30 sweeps in a row, and drops the one with no edge', () => {
    const g = game()
    const a = makeSid({ kind: 'frn', place: 'us', cohort: 1980, ord: 1 })
    const b = makeSid({ kind: 'frn', place: 'us', cohort: 1980, ord: 2 })
    idle(g, a)
    idle(g, b)
    expect(putEdge(g, `person:${a}>${playerRef(g)}`, E({ f: 30, dv: [900, 0, 2020, 0, 0] }))).toBe(true)
    for (let i = 0; i < 30; i++) {
      g.year += 1
      sweepMet(g)
      expect(readMet(g)[a], `sweep ${i}`).toBeDefined()
      expect(Array.isArray(readMet(g)[a]), `sweep ${i}: still a record, not a tombstone`).toBe(false)
    }
    const hold = readMet(g)[b]
    expect(hold === undefined || Array.isArray(hold), 'the sid with no edge is let go').toBe(true)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// The file

describe('src/game/world/edge-bound.ts', () => {
  const src = readFileSync(join(ROOT, FILE), 'utf8')

  it('holds no long dash, no Math.random and no g.rng', () => {
    expect(DASH.test(src)).toBe(false)
    expect(src).not.toMatch(/Math\.random/)
    expect(src).not.toMatch(/\bg\.rng\b/)
  })

  it('imports only the kernel ids, the person key, types and files of world/ (layer 2: no society/, events/ or business/)', () => {
    const imports = [...src.matchAll(/^import[^'"\n]*from\s+'([^']+)'/gm)].map((m) => m[1]!)
    expect(imports.length).toBeGreaterThan(3)
    for (const from of imports) expect(from, from).toMatch(/^(\.\/[a-z-]+|\.\.\/types|\.\.\/kernel\/[a-z-]+)$/)
  })

  it('registers the protector and the salience at load, once each', () => {
    expect(src.match(/registerProtector\('edges\.bound'/g)).toHaveLength(1)
    expect(src.match(/registerSalience\('edges\.salience'/g)).toHaveLength(1)
  })
})
