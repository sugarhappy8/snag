// ci: fast
// R2-L1 (A.K2 a): the world root. g.world is where every later world module keeps its state, so before any money moves it needs
// one reader that is empty when the field is absent (an old save), one writer, one id scheme and one normalizer that stays
// bounded whatever a hostile or garbage load puts there (RF3: it reaches an heir by clone; RF4: it never throws and never grows
// past WORLD_NODE_CAP). The shards themselves arrive in later tasks; here a synthetic shard stands in for them.
import { describe, expect, it } from 'vitest'
import { killCharacter } from '../src/game/death'
import { isRef, parseRef, ref } from '../src/game/kernel/ids'
import { continueAsChild } from '../src/game/life'
import { createPerson } from '../src/game/people'
import type { GameState } from '../src/game/types'
import { LOD_CAPS, WORLD_DROP_FIRST, WORLD_KEEP_LAST, WORLD_NODE_CAP } from '../src/game/world/caps'
import { ensureWorld, normalizeWorld, overCapDrops, readWorld, registerShard, shardNames, worldShard, WORLD_V } from '../src/game/world/state'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'

interface ProbeShard {
  v: 1
  rows: number[]
}

/** A shard that keeps at most 3 finite numbers. A valid input comes back as the same object. */
function normalizeProbe(raw: unknown): ProbeShard | undefined {
  if (!raw || typeof raw !== 'object' || (raw as { v?: unknown }).v !== 1) return undefined
  const rows = (raw as { rows?: unknown }).rows
  if (!Array.isArray(rows)) return undefined
  const kept = rows.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)).slice(0, 3)
  return kept.length === rows.length ? (raw as ProbeShard) : { v: 1, rows: kept }
}

let counted = 0
registerShard('probe', { normalize: normalizeProbe })
// Shards that keep whatever they are given (no cap of their own), so only the world's node cap can stop them.
registerShard('bulka', { normalize: (raw) => raw })
registerShard('bulkb', { normalize: (raw) => raw })
registerShard('small', { normalize: (raw) => raw })
registerShard('counted', {
  normalize: (raw) => {
    counted++
    return raw
  },
})
registerShard('boom', {
  normalize: () => {
    throw new Error('a hostile shard')
  },
})

function setWorld(g: GameState, value: unknown): void {
  ;(g as { world?: unknown }).world = value
}

/** Every value is one node, the way the save loader counts (save-schema.ts finiteJsonTree). */
function nodesOf(value: unknown): number {
  let n = 0
  const stack: unknown[] = [value]
  while (stack.length) {
    const item = stack.pop()
    n++
    if (item && typeof item === 'object') for (const c of Array.isArray(item) ? item : Object.values(item)) stack.push(c)
  }
  return n
}

/** An array of `n - 1` numbers is a shard of `n` nodes (the array itself counts as one); `n` is rounded, so a fraction of the cap is fine. */
function shardOf(n: number): number[] {
  return Array.from({ length: Math.round(n) - 1 }, () => 1)
}

describe('readWorld and ensureWorld', () => {
  it('reads an absent world as { v: 1 } without writing, even on a frozen state', () => {
    const g = makeTestGame()
    const before = JSON.stringify(g)
    expect(readWorld(g)).toEqual({ v: WORLD_V })
    expect(WORLD_V).toBe(1)
    expect(JSON.stringify(g)).toBe(before)
    expect('world' in g).toBe(false)
    const frozen = deepFreeze(makeTestGame())
    expect(() => readWorld(frozen)).not.toThrow()
    expect(readWorld(frozen)).toEqual({ v: 1 })
    expect(Object.isFrozen(readWorld(frozen))).toBe(true)
  })

  it('reads garbage as empty and leaves it where it is (garbage is dropped on a write, never on a read)', () => {
    for (const bad of [5, 'x', [], null, true, { v: 2 }, { v: 1.5 }, { v: '1' }, { y: 2026 }]) {
      const g = makeTestGame()
      setWorld(g, bad)
      expect(readWorld(g)).toEqual({ v: 1 })
      expect((g as { world?: unknown }).world).toBe(bad)
    }
  })

  it('returns a valid world itself', () => {
    const g = makeTestGame()
    const w = { v: 1 as const, y: 2026, probe: { v: 1, rows: [1] } }
    g.world = w
    expect(readWorld(g)).toBe(w)
  })

  it('creates { v: 1 } once: the second call returns the same object', () => {
    const g = makeTestGame()
    const w = ensureWorld(g)
    expect(w).toEqual({ v: 1 })
    expect(g.world).toBe(w)
    expect(ensureWorld(g)).toBe(w)
    w.y = 2026
    expect(ensureWorld(g).y).toBe(2026)
  })

  it('replaces a world that is not a plain object with v 1', () => {
    for (const bad of [5, 'x', [], null, { v: 2 }, { v: 1.5 }]) {
      const g = makeTestGame()
      setWorld(g, bad)
      const w = ensureWorld(g)
      expect(w).toEqual({ v: 1 })
      expect(g.world).toBe(w)
    }
  })
})

describe('normalizeWorld', () => {
  const EMPTY = { v: 1 }

  it('turns every hostile input into a valid { v: 1 }', () => {
    const throwing = Object.defineProperty({}, 'v', {
      enumerable: true,
      get() {
        throw new Error('a getter that throws')
      },
    })
    const inputs: unknown[] = [
      null,
      undefined,
      5,
      'x',
      true,
      [],
      [1, 2],
      { v: 2 },
      { v: '1' },
      { v: 1, y: 'x' },
      { v: 1, y: 1e9 },
      { v: 1, y: 1899 },
      { v: 1, y: 2026.5 },
      { v: 1, y: Number.NaN },
      { v: 1, ghost: { v: 1, rows: [1, 2] } },
      { v: 1, boom: { v: 1 } },
      throwing,
    ]
    for (const raw of inputs) {
      let out: unknown
      expect(() => {
        out = normalizeWorld(raw)
      }).not.toThrow()
      expect(out).toEqual(EMPTY)
    }
  })

  it('keeps a year only as an integer from 1900 to 100000', () => {
    expect(normalizeWorld({ v: 1, y: 2026 })).toEqual({ v: 1, y: 2026 })
    expect(normalizeWorld({ v: 1, y: 1900 })).toEqual({ v: 1, y: 1900 })
    expect(normalizeWorld({ v: 1, y: 100000 })).toEqual({ v: 1, y: 100000 })
    expect(normalizeWorld({ v: 1, y: 100001 })).toEqual(EMPTY)
  })

  it('survives a __proto__ key built by JSON.parse and does not pollute anything', () => {
    const raw = JSON.parse('{"v":1,"__proto__":{"polluted":true},"probe":{"v":1,"rows":[1,2]}}') as unknown
    const out = normalizeWorld(raw)
    expect(out).toEqual({ v: 1, probe: { v: 1, rows: [1, 2] } })
    expect(Object.keys(out)).not.toContain('__proto__')
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype)
    expect(({} as { polluted?: unknown }).polluted).toBeUndefined()
  })

  it('drops unknown shards and a shard whose reader throws, and keeps the registered ones', () => {
    const out = normalizeWorld({ v: 1, y: 2026, ghost: { a: 1 }, boom: { v: 1 }, probe: { v: 1, rows: [4] }, small: [1, 2, 3] })
    expect(out).toEqual({ v: 1, y: 2026, probe: { v: 1, rows: [4] }, small: [1, 2, 3] })
  })

  it("runs each shard's reader: 500 rows come back as 3, and the result is a new object", () => {
    const rows = Array.from({ length: 500 }, (_, i) => i + 1)
    const raw = { v: 1, y: 2026, probe: { v: 1, rows } }
    const out = normalizeWorld(raw)
    expect(out.y).toBe(2026)
    expect(out.probe).toEqual({ v: 1, rows: [1, 2, 3] })
    expect(out).not.toBe(raw)
    expect(raw.probe.rows).toHaveLength(500)
  })

  it('drops a shard of 100,000 nodes, and a cyclic one', () => {
    const cycle: Record<string, unknown> = {}
    cycle.self = cycle
    const out = normalizeWorld({ v: 1, probe: { v: 1, rows: [1] }, bulka: shardOf(100_000), bulkb: cycle })
    expect(out).toEqual({ v: 1, probe: { v: 1, rows: [1] } })
  })

  it('never returns more than the node cap (80,000): the largest shard goes first, ties by name', () => {
    expect(WORLD_NODE_CAP).toBe(80_000)
    const a = shardOf(WORLD_NODE_CAP * 0.75)
    const b = shardOf(WORLD_NODE_CAP * 0.5)
    const out = normalizeWorld({ v: 1, y: 2026, bulka: a, bulkb: b, small: [1] })
    expect(Object.keys(out).sort()).toEqual(['bulkb', 'small', 'v', 'y'])
    expect(nodesOf(out)).toBeLessThanOrEqual(WORLD_NODE_CAP)
    // Equal sizes: the earlier name is dropped first, whatever order the keys came in.
    const tie1 = normalizeWorld({ v: 1, bulka: shardOf(WORLD_NODE_CAP * 0.625), bulkb: shardOf(WORLD_NODE_CAP * 0.625) })
    const tie2 = normalizeWorld({ v: 1, bulkb: shardOf(WORLD_NODE_CAP * 0.625), bulka: shardOf(WORLD_NODE_CAP * 0.625) })
    expect(Object.keys(tie1).sort()).toEqual(['bulkb', 'v'])
    expect(Object.keys(tie2).sort()).toEqual(['bulkb', 'v'])
    // Three shards: it drops only as many as it must.
    const three = normalizeWorld({ v: 1, bulka: shardOf(WORLD_NODE_CAP * 0.375), bulkb: shardOf(WORLD_NODE_CAP * 0.375), small: shardOf(WORLD_NODE_CAP * 0.375) })
    expect(Object.keys(three).sort()).toEqual(['bulkb', 'small', 'v'])
    expect(nodesOf(three)).toBeLessThanOrEqual(WORLD_NODE_CAP)
  })

  it('keeps a world that fits exactly as it is', () => {
    const raw = { v: 1 as const, y: 2026, bulka: shardOf(WORLD_NODE_CAP * 0.975), small: [1, 2] }
    const out = normalizeWorld(raw)
    expect(out).toEqual(raw)
    expect(nodesOf(out)).toBeLessThanOrEqual(WORLD_NODE_CAP)
  })
})

// R4-P2 (X47): over the cap the shards go in a fixed order, not largest first across the board. The world used to drop its largest
// shard whole, and once `met` and `edges` exist the largest is `edges`, with every debt and memory in it. Three classes: the indexes
// and news (rebuilt or bounded) go first, every other shard next, and the books, the ownership table and the people's memory last.
// Inside a class the largest goes first, ties by name.
describe('the order shards go in when the world is over its cap (R4-P2, X47)', () => {
  const shards = (rows: Record<string, number>): { name: string; nodes: number }[] => Object.entries(rows).map(([name, nodes]) => ({ name, nodes }))
  /** The world's own size: the root and its `v` count 2 and the year 1, then every shard. */
  const totalOf = (list: readonly { nodes: number }[]): number => 3 + list.reduce((sum, s) => sum + s.nodes, 0)

  it('names the two classes, in the lists the cross-check fixes', () => {
    expect([...WORLD_DROP_FIRST].sort()).toEqual(['facts', 'firms', 'frontier', 'homes', 'lod', 'people'])
    expect([...WORLD_KEEP_LAST].sort()).toEqual(['edges', 'ledger', 'holdings', 'met', 'social'].sort())
    expect(WORLD_DROP_FIRST.filter((name) => WORLD_KEEP_LAST.includes(name))).toEqual([])
  })

  it('drops nothing while the world fits', () => {
    const list = shards({ ledger: 9_000, edges: 17_000, met: 10_401, facts: 2_800, frontier: 3_600 })
    expect(totalOf(list)).toBeLessThanOrEqual(WORLD_NODE_CAP)
    expect(overCapDrops(list, totalOf(list))).toEqual([])
    // Exactly at the cap is a fit.
    expect(overCapDrops(shards({ ledger: WORLD_NODE_CAP - 3 }), WORLD_NODE_CAP)).toEqual([])
    expect(overCapDrops(shards({ ledger: WORLD_NODE_CAP - 2 }), WORLD_NODE_CAP + 1)).toEqual(['ledger'])
  })

  it('drops facts and frontier before edges, even when edges is the largest shard', () => {
    const list = shards({ edges: 52_000, met: 10_401, ledger: 9_000, holdings: 5_000, social: 16, facts: 2_800, frontier: 3_600, lod: 9, people: 1_200, firms: 700, homes: 1_500 })
    expect(totalOf(list)).toBeGreaterThan(WORLD_NODE_CAP)
    // The index class goes largest first (frontier, then facts) and the world fits after two: nothing else goes.
    expect(overCapDrops(list, totalOf(list))).toEqual(['frontier', 'facts'])
    // The same list handed over in another order gives the same answer.
    expect(overCapDrops([...list].reverse(), totalOf(list))).toEqual(['frontier', 'facts'])
  })

  it('goes through the whole index class before it touches any other shard', () => {
    const list = shards({ edges: 60_000, met: 10_401, ledger: 9_000, facts: 2_800, frontier: 3_600, lod: 9, people: 1_200, firms: 700, homes: 1_500, stray: 5_000 })
    expect(totalOf(list)).toBe(94_213)
    // The indexes alone (9,809 nodes) do not bring 94,213 under the cap, so the stray (the second class) goes next, and then it fits.
    expect(overCapDrops(list, totalOf(list))).toEqual(['frontier', 'facts', 'homes', 'people', 'firms', 'lod', 'stray'])
  })

  it('keeps ledger, holdings, met, edges and social while any other shard can go', () => {
    const keep = shards({ edges: 40_000, met: 10_401, ledger: 9_000, holdings: 5_000, social: 16 })
    const others = shards({ zeta: 12_000, alpha: 12_000, facts: 2_800 })
    const list = [...keep, ...others]
    expect(totalOf(list)).toBeGreaterThan(WORLD_NODE_CAP)
    // facts (the index class) first; then the other class, largest first and the tie by name (alpha before zeta): one is enough.
    const out = overCapDrops(list, totalOf(list))
    expect(out).toEqual(['facts', 'alpha'])
    for (const name of WORLD_KEEP_LAST) expect(out, name).not.toContain(name)
    // Even with the protected shards the largest by far, a stray one-node shard is dropped before them when that is enough.
    const tight = shards({ edges: WORLD_NODE_CAP - 3, stray: 1 })
    expect(totalOf(tight)).toBe(WORLD_NODE_CAP + 1)
    expect(overCapDrops(tight, totalOf(tight))).toEqual(['stray'])
  })

  it('drops a protected shard only when nothing else is left, largest first and the tie by name', () => {
    const list = shards({ met: 50_000, edges: 50_000, social: 16, ledger: 9_000 })
    expect(overCapDrops(list, totalOf(list))).toEqual(['edges'])
    const more = shards({ met: 50_000, edges: 50_000, social: 16, ledger: 9_000, holdings: 50_000 })
    // 159,019 nodes: edges, holdings and met tie at 50,000, so the earlier names go first, and two are enough.
    expect(overCapDrops(more, totalOf(more))).toEqual(['edges', 'holdings'])
  })

  it('goes largest first inside a class, ties by name, whatever the order it was handed in', () => {
    const list = shards({ lod: 40_000, people: 40_000, firms: 40_000, homes: 1_000, ledger: 100 })
    const forward = overCapDrops(list, totalOf(list))
    expect(forward).toEqual(['firms', 'lod'])
    expect(overCapDrops([...list].reverse(), totalOf(list))).toEqual(forward)
    // The second class as well: three equal strays.
    const strays = shards({ gamma: 45_000, beta: 45_000, alpha: 45_000 })
    expect(overCapDrops(strays, totalOf(strays))).toEqual(['alpha', 'beta'])
  })

  it('is total: no shards, a total that is not a number, a cap that is not a number', () => {
    expect(overCapDrops([], 10)).toEqual([])
    expect(overCapDrops(shards({ ledger: 5 }), Number.NaN)).toEqual([])
    expect(overCapDrops(shards({ a: 5 }), 100, Number.NaN)).toEqual([])
  })

  it('applies the order through normalizeWorld: an index is dropped before a larger stray, a stray before the books', () => {
    // `people` is a real, registered shard (an index). The stray is far larger and is what is over, yet the index goes first.
    const people = { v: 1, rows: [{ id: 'person:p001', seen: 2020 }], over: 0 }
    expect(normalizeWorld({ v: 1, people }).people).toEqual(people)
    const out = normalizeWorld({ v: 1, y: 2026, people, bulka: shardOf(WORLD_NODE_CAP * 0.95), bulkb: shardOf(WORLD_NODE_CAP * 0.1) })
    expect(Object.keys(out).sort()).toEqual(['bulkb', 'v', 'y'])
    expect(nodesOf(out)).toBeLessThanOrEqual(WORLD_NODE_CAP)
    // `holdings` is a real, registered shard that is never dropped while a stray can go.
    const holdings = { v: 1, y: 2026, rows: [['person:p001', 'firm:f001', 1]] }
    expect(normalizeWorld({ v: 1, holdings }).holdings).toEqual(holdings)
    const kept = normalizeWorld({ v: 1, y: 2026, holdings, people, bulka: shardOf(WORLD_NODE_CAP * 0.6), bulkb: shardOf(WORLD_NODE_CAP * 0.6) })
    expect(Object.keys(kept).sort()).toEqual(['bulkb', 'holdings', 'v', 'y'])
    expect(nodesOf(kept)).toBeLessThanOrEqual(WORLD_NODE_CAP)
  })
})

describe('worldShard', () => {
  it('is undefined for an absent or unregistered shard', () => {
    const g = makeTestGame()
    expect(worldShard(g, 'probe')).toBeUndefined()
    g.world = { v: 1, ghost: { v: 1 } }
    expect(worldShard(g, 'ghost')).toBeUndefined()
    expect(worldShard(g, 'probe')).toBeUndefined()
    expect(worldShard(g, '__proto__')).toBeUndefined()
    expect(worldShard(g, 'constructor')).toBeUndefined()
  })

  it('normalizes with the registered reader', () => {
    const g = makeTestGame()
    g.world = { v: 1, probe: { v: 1, rows: [1, 2, 3, 4, 5] } }
    expect(worldShard<ProbeShard>(g, 'probe')).toEqual({ v: 1, rows: [1, 2, 3] })
    // The state itself is not touched by a read.
    expect((g.world.probe as ProbeShard).rows).toHaveLength(5)
  })

  it('runs the reader once for the same object, and once more after a structuredClone', () => {
    const g = makeTestGame()
    g.world = { v: 1, counted: { v: 1, rows: [1] } }
    const start = counted
    const first = worldShard(g, 'counted')
    expect(first).toEqual({ v: 1, rows: [1] })
    expect(worldShard(g, 'counted')).toBe(first)
    expect(counted).toBe(start + 1)
    const copy = structuredClone(g)
    expect(worldShard(copy, 'counted')).toEqual(first)
    expect(counted).toBe(start + 2)
    expect(worldShard(copy, 'counted')).toBeDefined()
    expect(counted).toBe(start + 2)
  })

  it('returns undefined for a shard whose reader throws, and works on a frozen state', () => {
    const g = makeTestGame()
    g.world = { v: 1, boom: { v: 1 }, probe: { v: 1, rows: [7] } }
    deepFreeze(g)
    expect(worldShard(g, 'boom')).toBeUndefined()
    expect(worldShard<ProbeShard>(g, 'probe')).toEqual({ v: 1, rows: [7] })
  })
})

describe('registerShard and shardNames', () => {
  it('lists the registered names, sorted', () => {
    const names = shardNames()
    expect(names).toContain('probe')
    expect([...names].sort()).toEqual([...names])
    registerShard('zeta', { normalize: (raw) => raw })
    registerShard('alpha', { normalize: (raw) => raw })
    const after = shardNames()
    expect([...after].sort()).toEqual([...after])
    expect(after).toContain('alpha')
    expect(after).toContain('zeta')
    expect(after.indexOf('alpha')).toBeLessThan(after.indexOf('probe'))
    expect(after.indexOf('probe')).toBeLessThan(after.indexOf('zeta'))
  })

  it('rejects a bad name', () => {
    const def = { normalize: (raw: unknown) => raw }
    for (const bad of ['v', 'y', 'Bad', '1x', '', 'has space', 'a-b', '__proto__', 'x'.repeat(17)]) {
      expect(() => registerShard(bad, def), bad).toThrow()
    }
    expect(() => registerShard('x'.repeat(16), def)).not.toThrow()
    expect(shardNames()).not.toContain('v')
    expect(shardNames()).not.toContain('y')
  })

  it('accepts the same definition twice and refuses a different one for a taken name', () => {
    const def = { normalize: (raw: unknown) => raw }
    registerShard('twice', def)
    expect(() => registerShard('twice', def)).not.toThrow()
    expect(() => registerShard('twice', { normalize: (raw) => raw })).toThrow()
    expect(shardNames().filter((n) => n === 'twice')).toHaveLength(1)
  })
})

describe('the world reaches an heir by clone (RF3)', () => {
  function oldPlayer(): GameState {
    return makeTestGame(1, { age: 70, gender: 'female', firstName: 'Ruth', lastName: 'Stone', money: 500_000 })
  }

  it('carries g.world to the heir as a copy that shares nothing with the parent, and indexes the heir\'s people on top', () => {
    const g = oldPlayer()
    const kid = createPerson(g, { relation: 'child', age: 30, lastName: 'Stone' })
    g.world = { v: 1, y: 2026, probe: { v: 1, rows: [1, 2] } }
    killCharacter(g, 'Old Age')
    const before = JSON.stringify(g.world)
    const n = continueAsChild(g, kid.id)
    expect(n).not.toBe(g)
    // R2-L15: the hand-over syncs the world's indexes (the heir's people were rebuilt), so the heir's world is the carried one
    // plus those four shards, and (R2-L8) the books: the estate is booked through the ledger, so the heir's world holds a ledger the
    // parent never wrote. Everything that was in g.world comes along unchanged.
    const carried: Record<string, unknown> = { ...n.world }
    for (const index of ['people', 'firms', 'homes', 'holdings', 'ledger']) delete carried[index]
    expect(carried).toEqual(g.world)
    expect(n.world?.y).toBe(n.year)
    expect(n.world).not.toBe(g.world)
    expect(n.world?.probe).not.toBe(g.world.probe)
    ;(n.world?.probe as ProbeShard).rows.push(9)
    expect(JSON.stringify(g.world)).toBe(before)
  })

  it('leaves an absent world absent in the parent: an old save has none and reads as empty; the heir gets the index of its people', () => {
    const g = oldPlayer()
    const kid = createPerson(g, { relation: 'child', age: 30, lastName: 'Stone' })
    killCharacter(g, 'Old Age')
    const n = continueAsChild(g, kid.id)
    // The parent's state is never written: it still has no world. R2-L15: the heir's hand-over is a writer (it syncs the indexes),
    // so the heir has a world of its own, stamped with the year it was synced, holding the indexes and the books and no other shard.
    expect('world' in g).toBe(false)
    expect(readWorld(g)).toEqual({ v: 1 })
    expect(n.world?.y).toBe(n.year)
    expect(Object.keys(n.world ?? {}).filter((k) => !['v', 'y', 'people', 'firms', 'homes', 'holdings', 'ledger'].includes(k))).toEqual([])
  })
})

describe('entity ids', () => {
  it('builds a ref from a kind and a key', () => {
    expect(ref('person', 'me1')).toBe('person:me1')
    expect(ref('pool', 'hh:us')).toBe('pool:hh:us')
    expect(ref('gov', 'us')).toBe('gov:us')
    expect(ref('asset', 42)).toBe('asset:42')
    expect(ref('firm', 'x'.repeat(52))).toBe(`firm:${'x'.repeat(52)}`)
  })

  it('throws a RangeError on a bad kind or key', () => {
    const bad: [string, string | number][] = [
      ['Person', 'x'],
      ['person', ''],
      ['person', 'a b'],
      ['person', 'x'.repeat(53)],
      ['', 'x'],
      ['p', 'x'],
      ['per son', 'x'],
      ['x'.repeat(17), 'x'],
      ['person', ':x'],
      ['person', 'x:'],
      ['person', 'a::b'],
      ['person', Number.NaN],
      ['person', 1.5],
      ['person', Number.POSITIVE_INFINITY],
    ]
    for (const [kind, key] of bad) expect(() => ref(kind, key), `${kind}|${String(key)}`).toThrow(RangeError)
  })

  it('splits at the first colon, and anything else is null', () => {
    expect(parseRef('pool:hh:us')).toEqual({ kind: 'pool', key: 'hh:us' })
    expect(parseRef('person:me1')).toEqual({ kind: 'person', key: 'me1' })
    for (const bad of ['abroad', 5, 'a:b', '', ':x', 'person:', 'Person:x', 'person:a b', null, undefined, {}, [], `person:${'x'.repeat(53)}`]) {
      expect(parseRef(bad), String(bad)).toBeNull()
    }
  })

  it('isRef agrees with parseRef on every one of them', () => {
    const all: unknown[] = ['pool:hh:us', 'person:me1', 'abroad', 5, 'a:b', '', ':x', 'person:', 'Person:x', null, undefined, {}, [], 'gov:us']
    for (const x of all) expect(isRef(x), String(x)).toBe(parseRef(x) !== null)
    expect(isRef('gov:us')).toBe(true)
    expect(isRef('abroad')).toBe(false)
  })
})

describe('the caps', () => {
  it('are the numbers the plan names', () => {
    expect(LOD_CAPS).toEqual({ people: 400, intimate: 80, firms: 60, fullFirms: 20, homes: 150, jobs: 600 })
  })
})
