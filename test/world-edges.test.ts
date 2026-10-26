// ci: fast
// R4-E6a (D.3): the Edge model as pure code (src/game/world/edges.ts). Nothing is stored and nothing is written here: the types, the
// key, the TOTAL normalizer, the reads (readEdge, edgesOf, memoriesOf, salience, liveFeuds, openDebts), the edge-local bound
// predicate and the pure edgeProblems. E6b adds the writer, the stamp and the slice on top.
//
// What this file pins: hostile maps of every kind (a number, an array, `__proto__`, NaN fields, 10,000 keys, 100-character strings,
// unknown memory kinds, unsorted keys, a secret with nine holders) come back as valid maps and never throw; a valid map comes back as
// itself; 100 x the caps (120,000 edges offered) stay at the caps and keep their bound edges; the counters agree with the caps; the
// reads touch nothing; edgeProblems names every fault and agrees with the normalizer; and the worst case the model can reach is
// counted in nodes.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { EntityRef } from '../src/game/kernel/ids'
import type { GameState, Person } from '../src/game/types'
import { EDGE_CAPS } from '../src/game/world/caps'
import { formatMemory, type MemoryKind } from '../src/game/world/edge-memory'
import {
  LINK_KINDS,
  edgeKey,
  edgeLocalBound,
  edgeProblems,
  edgesOf,
  isSecretKey,
  liveFeuds,
  memoriesOf,
  normalizeEdges,
  openDebts,
  readEdge,
  salience,
  type Edge,
  type EdgeMap,
} from '../src/game/world/edges'
import { nodeCount } from '../src/game/world/state'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'
import { layerOf } from './layer-kit'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8')
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)

const ME: EntityRef = 'person:me'
const pr = (n: number | string): EntityRef => `person:p${n}`
const key = (n: number | string, to: EntityRef = ME): string => `${pr(n)}>${to}`
const mem = (kind: MemoryKind, year: number, w = 1, by: 'ego' | 'them' = 'ego'): string => formatMemory({ kind, year, w, by })

/** A valid edge. */
const E = (over: Partial<Edge> = {}): Edge => ({ t: 50, f: 50, r: 50, s: 0, o: 0, y: 2000, l: 2001, ...over })

/** A map with its keys in ascending code-unit order, the way a stored map is. */
function mapOf(entries: readonly (readonly [string, unknown])[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of [...entries].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) out[k] = v
  return out
}

/** The four ways an edge is bound without looking at anyone else (edgeLocalBound). */
const BOUND = {
  link: (): Partial<Edge> => ({ k: 'kin' }),
  debt: (): Partial<Edge> => ({ dv: [100, 5, 2000, 0, 0] }),
  feud: (): Partial<Edge> => ({ q: [1, 2000, 0] }),
  pinned: (): Partial<Edge> => ({ m: [mem('betrayal', 2000, 3)] }),
}

function gameWith(edges: unknown): GameState {
  const g = makeTestGame(1)
  ;(g as { world?: unknown }).world = { v: 1, edges }
  return g
}

const asMap = (x: unknown): Record<string, Edge> => x as Record<string, Edge>
const keysOf = (x: unknown): string[] => Object.keys(x as object)
const sortedKeys = (ks: readonly string[]): boolean => ks.every((k, i) => i === 0 || ks[i - 1]! < k)

describe('EDGE_CAPS (world/caps.ts)', () => {
  it('is the set of numbers of the plan, appended beside the frontier caps', () => {
    expect(EDGE_CAPS).toEqual({ edges: 1200, memPerEdge: 8, memTotal: 4000, talkEdges: 120, feuds: 12, debts: 40, secrets: 40, holders: 6 })
  })

  it('leaves the neighbours alone (the frontier caps and the world cap are P2 and R3, not this task)', () => {
    const src = read('src/game/world/caps.ts')
    expect(src).toContain('export const FRONTIER_CAPS')
    expect(src).toContain('export const WORLD_NODE_CAP = 80_000')
    expect(src).toContain('export const EDGE_CAPS')
  })
})

describe('layer and files', () => {
  it('puts both files in layer 2 and keeps the sources free of long dashes', () => {
    expect(layerOf('src/game/world/edges.ts')).toBe(2)
    expect(layerOf('src/game/world/edge-memory.ts')).toBe(2)
    for (const f of ['src/game/world/edges.ts', 'src/game/world/edge-memory.ts']) expect(DASH.test(read(f)), f).toBe(false)
  })

  it('registers exactly one shard, `edges`, in edges.ts (R4-E6b) and none in edge-memory.ts, and draws no number: the sources never mention a generator', () => {
    const edges = read('src/game/world/edges.ts')
    expect(edges.match(/registerShard\(/g)).toHaveLength(1)
    expect(edges).toContain("registerShard('edges', { normalize: (raw) => normalizeEdges(raw) })")
    expect(read('src/game/world/edge-memory.ts')).not.toMatch(/registerShard\(/)
    for (const f of ['src/game/world/edges.ts', 'src/game/world/edge-memory.ts']) {
      const src = read(f)
      expect(src, f).not.toMatch(/g\.rng|\brand\(|Math\.random|Date\.now|\bensureWorld\(/)
    }
  })
})

describe('edgeKey', () => {
  it('writes first>second for two refs', () => {
    expect(edgeKey('person:p12', 'person:p3')).toBe('person:p12>person:p3')
    expect(edgeKey('staff:ks4', 'person:you')).toBe('staff:ks4>person:you')
    expect(edgeKey('person:s77', 'mgr:a9')).toBe('person:s77>mgr:a9')
  })

  it('is null when either end is not a ref, and never longer than 140 characters', () => {
    for (const bad of ['', 'p12', 'person:', ':p12', 'Person:p12', 'person:p 12', 'person:p12>person:p3', 'x:y', 'person:' + 'a'.repeat(53)]) {
      expect(edgeKey(bad as EntityRef, ME), bad).toBeNull()
      expect(edgeKey(ME, bad as EntityRef), bad).toBeNull()
    }
    for (const bad of [null, undefined, 5, {}, []]) {
      expect(edgeKey(bad as never, ME)).toBeNull()
      expect(edgeKey(ME, bad as never)).toBeNull()
    }
    const longest = `person:${'a'.repeat(52)}` as EntityRef
    const k = edgeKey(longest, longest)
    expect(k).not.toBeNull()
    expect(k!.length).toBeLessThanOrEqual(140)
  })

  it('keeps the two directions apart', () => {
    expect(edgeKey(pr(1), pr(2))).not.toBe(edgeKey(pr(2), pr(1)))
  })
})

describe('a valid map comes back as itself', () => {
  it('returns the very same object for an empty map and for a full, sorted, canonical one', () => {
    const empty = {}
    expect(normalizeEdges(empty)).toBe(empty)
    const m = mapOf([
      [key(1), E({ k: 'kin', m: [mem('loan_given', 2001, 2), mem('betrayal', 2003, 3, 'them')], n: ['told.a', 'told.b'], d: [1, 2, 3], c: 2005 })],
      [key(2), E({ q: [2, 2004, 17], dv: [1500.5, 7.5, 2003, 0, 200] })],
      [key(3), E({ t: 0, f: 100, r: 33.3, s: 100, o: -100 })],
      ['secret:1', { a: pr(1), k: 'affair', v: 3, h: [pr(2), pr(3)], y: 2002 }],
      ['secret:2', { a: pr(2), k: 'debt', v: 5, h: [pr(3)], y: 2002, p: 2004 }],
    ])
    expect(normalizeEdges(m)).toBe(m)
    expect(edgeProblems(m)).toEqual([])
    // the entries are untouched too
    expect(asMap(normalizeEdges(m))[key(1)]).toBe(asMap(m)[key(1)])
  })

  it('is a fixed point: normalizing a normalized map changes nothing, however bad the first input was', () => {
    const bad = {
      zzz: 1,
      [key(9)]: E({ t: 500, m: [mem('betrayal', 2000), 'nope', mem('loan_given', 1999)] }),
      [key(1)]: E({ q: [9, 1, 1], dv: [-1, 1, 1, 1, 1] }),
      'secret:3': { a: pr(1), k: 'affair', v: 2, h: Array.from({ length: 9 }, (_, i) => pr(i)), y: 2000 },
    }
    const once = normalizeEdges(bad)
    expect(normalizeEdges(once)).toBe(once)
    expect(edgeProblems(once)).toEqual([])
  })

  it('does not write to its input: a deep-frozen map of any quality is read without a throw', () => {
    const hostile = deepFreeze({
      [key(2)]: E({ t: 999, m: [mem('betrayal', 2000), 'x'], n: ['a', 'b'], d: [1, 1.5], q: [8, 1, 1] }),
      [key(1)]: E(),
      junk: [],
      'secret:1': { a: 'x', k: 'y', v: 9, h: 'z', y: 'w' },
    })
    expect(() => normalizeEdges(hostile)).not.toThrow()
    expect(edgeProblems(hostile).length).toBeGreaterThan(0)
  })
})

describe('hostile maps', () => {
  it('turns anything that is not a plain object into an empty map', () => {
    for (const bad of [5, 0, NaN, 'str', '', true, false, null, undefined, [], [E()], [[key(1), E()]], () => 1, Symbol('s'), new Date(0), new Map([[key(1), E()]]), new Set([1])]) {
      const out = normalizeEdges(bad)
      expect(out, String(bad)).toEqual({})
      expect(Object.keys(out)).toHaveLength(0)
    }
  })

  it('drops `__proto__` as a key (JSON.parse makes it an own key) and pollutes nothing', () => {
    const raw = JSON.parse(`{"__proto__":{"t":50,"f":50,"r":50,"s":0,"o":0,"y":2000,"l":2000,"polluted":1},"${key(1)}":{"t":50,"f":50,"r":50,"s":0,"o":0,"y":2000,"l":2000,"__proto__":{"k":"kin"}}}`)
    const out = normalizeEdges(raw)
    expect(keysOf(out)).toEqual([key(1)])
    expect(Object.prototype.hasOwnProperty.call(out, '__proto__')).toBe(false)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(({} as Record<string, unknown>).k).toBeUndefined()
    expect(asMap(out)[key(1)]!.k).toBeUndefined()
    expect(edgeProblems(raw).some((p) => /__proto__/.test(p))).toBe(true)
  })

  it('drops an edge whose seven required numbers are not numbers (NaN, Infinity, text, missing, null)', () => {
    for (const field of ['t', 'f', 'r', 's', 'o', 'y', 'l'] as const) {
      for (const badValue of [NaN, Infinity, -Infinity, '50', null, undefined, {}, [], true]) {
        const m = mapOf([[key(1), { ...E(), [field]: badValue }], [key(2), E()]])
        const out = normalizeEdges(m)
        expect(keysOf(out), `${field}=${String(badValue)}`).toEqual([key(2)])
        expect(edgeProblems(m).length, `${field}=${String(badValue)}`).toBeGreaterThan(0)
      }
      const missing: Record<string, unknown> = { ...E() }
      delete missing[field]
      expect(keysOf(normalizeEdges(mapOf([[key(1), missing]])))).toEqual([])
    }
  })

  it('clamps a finite number to its range: 0 to 100 (obligation -100 to 100), and years to 1900 to 100000 as whole numbers', () => {
    const m = mapOf([[key(1), E({ t: 150, f: -5, r: 100.5, s: 1e300, o: 500, y: 5, l: 1e9 })], [key(2), E({ o: -500, y: 2000.6, l: 2001.4 })]])
    const out = asMap(normalizeEdges(m))
    expect(out[key(1)]).toMatchObject({ t: 100, f: 0, r: 100, s: 100, o: 100, y: 1900, l: 100_000 })
    expect(out[key(2)]).toMatchObject({ o: -100, y: 2001, l: 2001 })
    expect(edgeProblems(m).length).toBeGreaterThanOrEqual(2)
  })

  it('keeps a fractional value inside the range as it is (heirEdges scales by exactly 0.5 and 0.6)', () => {
    const m = mapOf([[key(1), E({ t: 25.5, f: 30.6, r: 12.25, s: 0.6, o: -3.5 })]])
    expect(normalizeEdges(m)).toBe(m)
  })

  it('drops every key that is not an edge key or a secret key, whatever its value', () => {
    const e = E()
    const junk = [
      'v', '__proto__', 'constructor', '', ' ', 'x', 'person:p1', 'person:p1>', '>person:p1', 'person:p1>person:p2>person:p3', 'person:p1>>person:p2',
      'Person:p1>person:p2', 'person:p1>Person:p2', 'person:p 1>person:p2', 'p:1>person:p2', '1:2>3:4', '-a:b>c:d', ' person:p1>person:p2', 'person:p1>person:p2 ',
      'person:p1 > person:p2', 'person:p1>person:', 'person:>person:p2', 'secret:', 'secret:x', 'secret:01', 'secret:-1', 'secret:1.5', 'secret: 1', 'secret:1234567890',
      `person:${'a'.repeat(53)}>person:p2`, `person:p1>person:${'b'.repeat(53)}`, 'a'.repeat(100), `person:p1>person:p2${'x'.repeat(100)}`,
    ]
    const raw: Record<string, unknown> = { [key(1)]: e }
    for (const j of junk) raw[j] = e
    const out = normalizeEdges(raw)
    expect(keysOf(out)).toEqual([key(1)])
    expect(edgeProblems(raw).length).toBeGreaterThanOrEqual(junk.length)
  })

  it('accepts a staff, a manager and a pool end as readily as a person (the staff edges of E13 are staff: and mgr: refs)', () => {
    const m = mapOf([['staff:ks4>person:me', E({ k: 'staff' })], ['mgr:a9>person:me', E({ k: 'staff' })], ['person:me>pool:other', E()]])
    expect(normalizeEdges(m)).toBe(m)
  })

  it('drops an entry that is not a plain object (null, a list, a number, a string, a Date)', () => {
    const m = mapOf([[key(1), null], [key(2), []], [key(3), 5], [key(4), 'edge'], [key(5), new Date(0)], [key(6), E()], [key(7), [E()]]])
    expect(keysOf(normalizeEdges(m))).toEqual([key(6)])
  })

  it('drops an unknown field and keeps the rest of the edge', () => {
    const m = mapOf([[key(1), { ...E(), extra: 1, __meta: {}, x: [1] }]])
    const out = normalizeEdges(m)
    expect(asMap(out)[key(1)]).toEqual(E())
    expect(edgeProblems(m).some((p) => /unknown field/.test(p))).toBe(true)
  })

  it('sorts unsorted keys by code unit and says so in edgeProblems', () => {
    const e = E()
    const m = { [key(3)]: e, [key(1)]: e, [key(2)]: e, [`person:B>${ME}`]: e }
    // `person:B` has an upper case key part: valid; it sorts before `person:p..` by code unit
    const out = normalizeEdges(m)
    expect(keysOf(out)).toEqual([`person:B>${ME}`, key(1), key(2), key(3)])
    expect(sortedKeys(keysOf(out))).toBe(true)
    expect(edgeProblems(m).some((p) => /out of order/.test(p))).toBe(true)
  })

  it('survives 10,000 junk keys (all dropped) and a 10,000-key map of valid edges (cut to the cap)', () => {
    const junk: Record<string, unknown> = {}
    for (let i = 0; i < 10_000; i++) junk[`junk${i}`] = E()
    expect(normalizeEdges(junk)).toEqual({})
    const many: [string, unknown][] = []
    for (let i = 0; i < 10_000; i++) many.push([key(String(i).padStart(5, '0')), E({ f: i % 101 })])
    const out = normalizeEdges(mapOf(many))
    expect(keysOf(out)).toHaveLength(EDGE_CAPS.edges)
    expect(sortedKeys(keysOf(out))).toBe(true)
  })

  it('cuts 100-character strings: a memory, a callback key and a long topic list are dropped, the edge stays', () => {
    const long = 'x'.repeat(100)
    const m = mapOf([[key(1), E({ m: [long, `betrayal.2000.1.e${long}`, mem('gift_given', 2001)], n: [long, 'ok', `${long}.z`], d: [1, 2] })]])
    const e = asMap(normalizeEdges(m))[key(1)]!
    expect(e.m).toEqual([mem('gift_given', 2001)])
    expect(e.n).toEqual(['ok'])
    expect(e.d).toEqual([1, 2])
  })

  it('drops a memory of an unknown kind or a malformed text, and keeps the good ones in order', () => {
    const m = mapOf([[key(1), E({ m: ['nope.2000.1.e', mem('loan_given', 2000), 'loan_given.2000.9.e', 'loan_given.2000.1.x', 5 as never, mem('gift_given', 2002, 2, 'them'), '__proto__.2000.1.e'] })]])
    expect(asMap(normalizeEdges(m))[key(1)]!.m).toEqual([mem('loan_given', 2000), mem('gift_given', 2002, 2, 'them')])
    const none = mapOf([[key(1), E({ m: ['nope.2000.1.e', 'x'] })]])
    expect('m' in asMap(normalizeEdges(none))[key(1)]!).toBe(false)
  })

  it('drops an empty list instead of keeping a node for it, and a list that is not a list', () => {
    const m = mapOf([[key(1), E({ m: [], n: [], d: [] })], [key(2), { ...E(), m: 'betrayal.2000.1.e', n: 5, d: {}, q: 'x', dv: 7, c: 'y', k: 9 }]])
    const out = asMap(normalizeEdges(m))
    expect(out[key(1)]).toEqual(E())
    expect(out[key(2)]).toEqual(E())
  })

  it('puts memories in the order they were made (oldest first, a stable sort inside a year) and says so', () => {
    const m = mapOf([[key(1), E({ m: [mem('gift_given', 2005), mem('loan_given', 2001), mem('gift_refused', 2005), mem('told_gently', 2003)] })]])
    expect(asMap(normalizeEdges(m))[key(1)]!.m).toEqual([mem('loan_given', 2001), mem('told_gently', 2003), mem('gift_given', 2005), mem('gift_refused', 2005)])
    expect(edgeProblems(m).some((p) => /out of order/.test(p))).toBe(true)
  })

  it('cuts memories to 8 an edge and drops the oldest unpinned first, so a pinned one outlives them', () => {
    const years = [1990, 1991, 1992, 1993, 1994, 1995, 1996, 1997, 1998, 1999]
    const list = years.map((y, i) => (i === 0 ? mem('betrayal', y, 3) : i === 1 ? mem('saved_me', y, 2) : mem('gift_given', y)))
    const m = mapOf([[key(1), E({ m: list })]])
    const out = asMap(normalizeEdges(m))[key(1)]!.m!
    expect(out).toHaveLength(EDGE_CAPS.memPerEdge)
    expect(out).toContain(mem('betrayal', 1990, 3))
    expect(out).toContain(mem('saved_me', 1991, 2))
    expect(out).not.toContain(mem('gift_given', 1992))
    expect(out).not.toContain(mem('gift_given', 1993))
    expect(out[out.length - 1]).toBe(mem('gift_given', 1999))
    expect(edgeProblems(m).some((p) => /cap 8/.test(p))).toBe(true)
  })

  it('cuts a list of pinned memories to 8 too, oldest first, when nothing else is left to drop', () => {
    const list = Array.from({ length: 12 }, (_, i) => mem('betrayal', 1990 + i, 1))
    const out = asMap(normalizeEdges(mapOf([[key(1), E({ m: list })]])))[key(1)]!.m!
    expect(out).toEqual(list.slice(4))
  })

  it('cuts n to 6 and d to 8, keeping the latest, and keeps only well formed entries', () => {
    const n = Array.from({ length: 10 }, (_, i) => `cb${i}`)
    const d = Array.from({ length: 12 }, (_, i) => i)
    const e = asMap(normalizeEdges(mapOf([[key(1), E({ n, d })]])))[key(1)]!
    expect(e.n).toEqual(n.slice(4))
    expect(e.d).toEqual(d.slice(4))
    const dirty = asMap(normalizeEdges(mapOf([[key(1), E({ n: ['a b', 'ok.1', 'a:b', '', 'ü', 'fine-2'], d: [1.5, -1, 10_000, NaN, 7, 9999, 0] as number[] })]])))[key(1)]!
    expect(dirty.n).toEqual(['ok.1', 'fine-2'])
    expect(dirty.d).toEqual([7, 9999, 0])
  })

  it('keeps n and d only on the 120 edges of highest salience', () => {
    const entries: [string, Edge][] = []
    for (let i = 0; i < 200; i++) entries.push([key(String(i).padStart(3, '0')), E({ f: Math.min(100, i % 100), s: i < 100 ? 0 : 50, n: ['a'], d: [1] })])
    const out = asMap(normalizeEdges(mapOf(entries)))
    const withTalk = Object.entries(out).filter(([, e]) => e.n !== undefined || e.d !== undefined)
    expect(withTalk).toHaveLength(EDGE_CAPS.talkEdges)
    const talkSal = Math.min(...withTalk.map(([, e]) => salience(e)))
    const bareSal = Math.max(...Object.values(out).filter((e) => e.n === undefined && e.d === undefined).map((e) => salience(e)))
    expect(talkSal).toBeGreaterThanOrEqual(bareSal)
  })
})

describe('feuds (q) and debts (dv)', () => {
  it('accepts a feud rung 1 to 4 and rejects the rest of the shapes', () => {
    const good = [[1, 2000, 0], [4, 100_000, 255], [2, 1900, 17]]
    const bad: unknown[] = [[0, 2000, 0], [5, 2000, 0], [1.5, 2000, 0], [NaN, 2000, 0], [1, 1899, 0], [1, 100_001, 0], [1, 2000.5, 0], [1, 2000, -1], [1, 2000, 256], [1, 2000], [1, 2000, 0, 0], 'q', 7, {}, null, ['1', 2000, 0]]
    for (const q of good) expect(asMap(normalizeEdges(mapOf([[key(1), E({ q: q as never })]])))[key(1)]!.q, JSON.stringify(q)).toEqual(q)
    for (const q of bad) expect(asMap(normalizeEdges(mapOf([[key(1), E({ q: q as never })]])))[key(1)]!.q, JSON.stringify(q)).toBeUndefined()
  })

  it('accepts a debt of owed, rate, since, kind and paid within their ranges and rejects the rest', () => {
    const good = [[100, 5, 2000, 0, 0], [0, 0, 1900, 1, 0], [1e12, 60, 100_000, 9, 1e12], [1500.5, 7.5, 2003, 0, 200.25]]
    const bad: unknown[] = [
      [-1, 5, 2000, 0, 0], [NaN, 5, 2000, 0, 0], [Infinity, 5, 2000, 0, 0], [1e300, 5, 2000, 0, 0], [100, -1, 2000, 0, 0], [100, 61, 2000, 0, 0], [100, NaN, 2000, 0, 0],
      [100, 5, 1899, 0, 0], [100, 5, 2000.5, 0, 0], [100, 5, 2000, -1, 0], [100, 5, 2000, 10, 0], [100, 5, 2000, 0.5, 0], [100, 5, 2000, 0, -1], [100, 5, 2000, 0, 1e300],
      [100, 5, 2000, 0], [100, 5, 2000, 0, 0, 0], '100', 7, {}, null, ['100', 5, 2000, 0, 0],
    ]
    for (const dv of good) expect(asMap(normalizeEdges(mapOf([[key(1), E({ dv: dv as never })]])))[key(1)]!.dv, JSON.stringify(dv)).toEqual(dv)
    for (const dv of bad) expect(asMap(normalizeEdges(mapOf([[key(1), E({ dv: dv as never })]])))[key(1)]!.dv, JSON.stringify(dv)).toBeUndefined()
  })

  it('holds at most 12 live feuds and 40 debts, and the survivors are the edges of highest salience', () => {
    const entries: [string, Edge][] = []
    for (let i = 0; i < 100; i++) entries.push([key(String(i).padStart(3, '0')), E({ f: i, q: [1 + (i % 4), 2000, 0], dv: [100 + i, 5, 2000, 0, 0] })])
    const out = asMap(normalizeEdges(mapOf(entries)))
    const feuds = Object.entries(out).filter(([, e]) => e.q !== undefined)
    const debts = Object.entries(out).filter(([, e]) => e.dv !== undefined)
    expect(feuds).toHaveLength(EDGE_CAPS.feuds)
    expect(debts).toHaveLength(EDGE_CAPS.debts)
    expect(Math.min(...feuds.map(([, e]) => e.f))).toBe(88)
    expect(Math.min(...debts.map(([, e]) => e.f))).toBe(60)
    expect(Object.keys(out)).toHaveLength(100)
  })

  it('counts the edges that carry a valid q or dv, never above the caps (liveFeuds, openDebts)', () => {
    const g = gameWith(mapOf([
      [key(1), E({ q: [1, 2000, 0] })], [key(2), E({ q: [4, 2000, 0] })], [key(3), E({ q: [5, 2000, 0] })], [key(4), E()],
      [key(5), E({ dv: [10, 0, 2000, 0, 0] })], [key(6), E({ dv: [10, 0, 2000, 0, 10] })], [key(7), E({ dv: [-5, 0, 2000, 0, 0] })], [key(8), E({ q: [2, 2000, 0], dv: [1, 0, 2000, 1, 0] })],
    ]))
    expect(liveFeuds(g)).toBe(3)
    expect(openDebts(g)).toBe(3)
  })

  it('stays at the caps when 1,000 feuds and 4,000 debts are offered (100 x)', () => {
    const entries: [string, Edge][] = []
    for (let i = 0; i < 4000; i++) entries.push([key(String(i).padStart(4, '0')), E({ f: i % 101, ...(i < 1000 ? { q: [1, 2000, 0] as [number, number, number] } : {}), dv: [50, 5, 2000, 0, 0] })])
    const g = gameWith(mapOf(entries))
    expect(liveFeuds(g)).toBe(EDGE_CAPS.feuds)
    expect(openDebts(g)).toBe(EDGE_CAPS.debts)
  })

  it('counts nothing on a hostile root and never throws', () => {
    for (const bad of [5, 'x', null, undefined, [], [E()], true, NaN, { v: 1 }, { a: 1 }, new Date(0)]) {
      const g = gameWith(bad)
      expect(liveFeuds(g), String(bad)).toBe(0)
      expect(openDebts(g), String(bad)).toBe(0)
    }
    const noWorld = makeTestGame(1)
    expect(liveFeuds(noWorld)).toBe(0)
    expect(openDebts(noWorld)).toBe(0)
    ;(noWorld as { world?: unknown }).world = 'garbage'
    expect(liveFeuds(noWorld)).toBe(0)
  })
})

describe('salience(e, role?)', () => {
  it('is f + s + abs(o) + the weight of the link: kin 40, pair 60, staff 20, anything else 0', () => {
    expect(salience(E({ f: 30, s: 20, o: -10 }))).toBe(60)
    expect(salience(E({ f: 30, s: 20, o: 10 }))).toBe(60)
    expect(salience(E({ f: 30, s: 20, o: -10, k: 'kin' }))).toBe(100)
    expect(salience(E({ f: 30, s: 20, o: -10, k: 'pair' }))).toBe(120)
    expect(salience(E({ f: 30, s: 20, o: -10, k: 'staff' }))).toBe(80)
    expect(salience(E({ f: 30, s: 20, o: -10, k: 'rival' }))).toBe(60)
    expect(salience(E({ f: 30, s: 20, o: -10, k: 'company' }))).toBe(60)
  })

  it('takes the role from the caller when it is given (E14 passes 0)', () => {
    expect(salience(E({ f: 30, s: 20, o: -10, k: 'pair' }), 0)).toBe(60)
    expect(salience(E({ f: 30, s: 20, o: -10 }), 25)).toBe(85)
    expect(salience(E({ f: 30, s: 20, o: -10, k: 'kin' }), Number.NaN)).toBe(100)
    expect(salience(E({ f: 30, s: 20, o: -10, k: 'kin' }), 'x' as never)).toBe(100)
  })

  it('is total and sanitized: a hostile edge never gives NaN, a negative or more than the sum of the ranges', () => {
    for (const bad of [null, undefined, 5, 'x', [], {}, { f: NaN, s: Infinity, o: 'x' }, { f: -1e9, s: 1e9, o: -1e9, k: 'nope' }, { f: 1e300, s: 1e300, o: 1e300, k: 'pair' }]) {
      const v = salience(bad as never)
      expect(Number.isFinite(v), JSON.stringify(bad)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(100 + 100 + 100 + 60)
    }
    expect(salience({ f: 1e300, s: 1e300, o: -1e300, k: 'pair' } as never)).toBe(360)
    expect(salience(null as never, 5)).toBe(5)
  })

  it('is pure: the edge is not touched', () => {
    const e = deepFreeze(E({ k: 'kin', m: [mem('betrayal', 2000)] }))
    expect(() => salience(e)).not.toThrow()
  })
})

describe('memoriesOf(e)', () => {
  it('reads the memory strings as { kind, year, w, by }, oldest first, newest last', () => {
    const e = E({ m: [mem('loan_given', 2001, 2), mem('betrayal', 2005, 3, 'them'), mem('gift_given', 2003, 1, 'ego')] })
    expect(memoriesOf(e)).toEqual([
      { kind: 'loan_given', year: 2001, w: 2, by: 'ego' },
      { kind: 'gift_given', year: 2003, w: 1, by: 'ego' },
      { kind: 'betrayal', year: 2005, w: 3, by: 'them' },
    ])
  })

  it('is sanitized and total: bad entries are skipped, a hostile edge reads as none, 100 entries read as 8', () => {
    expect(memoriesOf(E())).toEqual([])
    for (const bad of [null, undefined, 5, 'x', [], {}, { m: 5 }, { m: 'betrayal.2000.1.e' }, { m: [5, null, {}, 'nope'] }]) expect(memoriesOf(bad as never), JSON.stringify(bad)).toEqual([])
    const many = Array.from({ length: 100 }, (_, i) => mem('gift_given', 1900 + i))
    const out = memoriesOf(E({ m: many }))
    expect(out).toHaveLength(EDGE_CAPS.memPerEdge)
    expect(out[out.length - 1]!.year).toBe(1999)
  })

  it('is pure: a deep-frozen edge reads, and a second read is equal but a new array', () => {
    const e = deepFreeze(E({ m: [mem('betrayal', 2000, 3)] }))
    const a = memoriesOf(e)
    const b = memoriesOf(e)
    expect(a).toEqual(b)
    expect(a).not.toBe(b)
    ;(a as unknown as { kind: string }[])[0]!.kind = 'x'
    expect(memoriesOf(e)[0]!.kind).toBe('betrayal')
  })
})

describe('edgeLocalBound(e): bound by the edge alone', () => {
  it('is true for each of the four fields: a link kind, an unpaid debt, a feud, a pinned memory', () => {
    for (const [name, make] of Object.entries(BOUND)) expect(edgeLocalBound(E(make())), name).toBe(true)
    for (const k of LINK_KINDS) expect(edgeLocalBound(E({ k })), k).toBe(true)
    for (const pinned of ['betrayal', 'saved_me', 'cut_from_will', 'estranged', 'divorced'] as const) expect(edgeLocalBound(E({ m: [mem('gift_given', 1999), mem(pinned, 2000)] })), pinned).toBe(true)
  })

  it('is false for a plain edge and for each field in a state that does not bind', () => {
    expect(edgeLocalBound(E())).toBe(false)
    expect(edgeLocalBound(E({ k: 'banana' as never }))).toBe(false)
    expect(edgeLocalBound(E({ dv: [100, 5, 2000, 0, 100] }))).toBe(false) // paid in full
    expect(edgeLocalBound(E({ dv: [100, 5, 2000, 0, 250] }))).toBe(false) // paid past it
    expect(edgeLocalBound(E({ dv: [0, 5, 2000, 0, 0] }))).toBe(false) // owes nothing
    expect(edgeLocalBound(E({ dv: [NaN, 5, 2000, 0, 0] as never }))).toBe(false)
    expect(edgeLocalBound(E({ q: [0, 2000, 0] }))).toBe(false)
    expect(edgeLocalBound(E({ q: [5, 2000, 0] }))).toBe(false)
    expect(edgeLocalBound(E({ m: [mem('gift_given', 2000), mem('loan_given', 2001)] }))).toBe(false)
    expect(edgeLocalBound(E({ m: ['betrayal.2000.9.e', 'betrayal'] }))).toBe(false)
  })

  it('is total: anything that is not an edge is not bound', () => {
    for (const bad of [null, undefined, 5, 'x', [], {}, true]) expect(edgeLocalBound(bad as never)).toBe(false)
  })

  it('keeps a bound edge through normalization and lets a plain one go first', () => {
    const entries: [string, Edge][] = []
    for (let i = 0; i < EDGE_CAPS.edges + 5; i++) entries.push([key(String(i).padStart(4, '0')), E({ f: 100, s: 100 })])
    entries[0] = [key('0000'), E({ f: 0, s: 0, ...BOUND.link() })]
    const out = asMap(normalizeEdges(mapOf(entries)))
    expect(keysOf(out)).toHaveLength(EDGE_CAPS.edges)
    expect(out[key('0000')]).toBeDefined()
  })
})

describe('100 x the caps', () => {
  it('120,000 edges offered stay at 1,200, the bound ones kept, the rest by salience, in sorted order', () => {
    const entries: [string, Edge][] = []
    const N = 120_000
    const boundKeys: string[] = []
    for (let i = 0; i < N; i++) {
      const k = key(String(i).padStart(6, '0'))
      // a plain edge, of high salience; the first 640 are bound, of salience 0
      if (i < 300) { entries.push([k, E({ f: 0, s: 0, ...BOUND.link() })]); boundKeys.push(k) }
      else if (i < 600) { entries.push([k, E({ f: 0, s: 0, ...BOUND.pinned() })]); boundKeys.push(k) }
      else if (i < 610) { entries.push([k, E({ f: 0, s: 0, ...BOUND.feud() })]); boundKeys.push(k) }
      else if (i < 640) { entries.push([k, E({ f: 0, s: 0, ...BOUND.debt() })]); boundKeys.push(k) }
      else entries.push([k, E({ f: 100 - (i % 50), s: 100 })])
    }
    const out = asMap(normalizeEdges(mapOf(entries)))
    const ks = keysOf(out)
    expect(ks).toHaveLength(EDGE_CAPS.edges)
    expect(sortedKeys(ks)).toBe(true)
    for (const bk of boundKeys) expect(out[bk], bk).toBeDefined()
    const plainKept = ks.filter((k) => !boundKeys.includes(k))
    expect(plainKept).toHaveLength(EDGE_CAPS.edges - boundKeys.length)
    // every plain edge that was kept is at least as salient as any plain edge that was not
    const keptMin = Math.min(...plainKept.map((k) => salience(out[k]!)))
    expect(keptMin).toBe(200 - 0) // f 100 + s 100: only the top class survived 119,360 rivals
  })

  it('1,200 + 800 bound edges offered: the bound edges alone fill the cap, the lowest salience of them go', () => {
    const entries: [string, Edge][] = []
    for (let i = 0; i < 2000; i++) entries.push([key(String(i).padStart(4, '0')), E({ f: i % 101, k: 'rival' })])
    const out = asMap(normalizeEdges(mapOf(entries)))
    expect(keysOf(out)).toHaveLength(EDGE_CAPS.edges)
    const min = Math.min(...Object.values(out).map((e) => e.f))
    expect(min).toBeGreaterThanOrEqual(40)
  })

  it('9,600 memories offered (8 an edge on 1,200 edges) end at 4,000 in all, and 120,000 at 100 x memories an edge end at the caps', () => {
    const entries: [string, Edge][] = []
    for (let i = 0; i < EDGE_CAPS.edges; i++) {
      const m = Array.from({ length: 8 }, (_, j) => mem('gift_given', 1990 + j, 1))
      entries.push([key(String(i).padStart(4, '0')), E({ f: i % 101, m })])
    }
    const out = asMap(normalizeEdges(mapOf(entries)))
    const total = Object.values(out).reduce((n, e) => n + (e.m?.length ?? 0), 0)
    expect(total).toBe(EDGE_CAPS.memTotal)
    for (const e of Object.values(out)) expect((e.m ?? []).length).toBeLessThanOrEqual(EDGE_CAPS.memPerEdge)
    const huge = mapOf([[key(1), E({ m: Array.from({ length: 800 }, (_, j) => mem('gift_given', 1900 + (j % 100))) })]])
    expect(asMap(normalizeEdges(huge))[key(1)]!.m).toHaveLength(EDGE_CAPS.memPerEdge)
  })

  it('takes the memories of the lowest-salience edge first, the oldest unpinned first, and pinned ones last', () => {
    const entries: [string, Edge][] = []
    // 600 edges of 8 unpinned memories, salience rising with the index, plus 100 edges that hold a pinned memory and 7 others, at salience 0
    for (let i = 0; i < 600; i++) entries.push([key(`a${String(i).padStart(3, '0')}`), E({ f: 1 + (i % 100), m: Array.from({ length: 8 }, (_, j) => mem('gift_given', 1990 + j)) })])
    for (let i = 0; i < 100; i++) entries.push([key(`b${String(i).padStart(3, '0')}`), E({ f: 0, m: [mem('betrayal', 1990, 3), ...Array.from({ length: 7 }, (_, j) => mem('gift_given', 1991 + j))] })])
    const out = asMap(normalizeEdges(mapOf(entries)))
    const all = Object.values(out)
    expect(all.reduce((n, e) => n + (e.m?.length ?? 0), 0)).toBe(EDGE_CAPS.memTotal)
    // 5,600 offered, 1,600 to go: the 100 low edges lose their 7 unpinned each first (700), the rest from the next lowest
    for (let i = 0; i < 100; i++) expect(out[key(`b${String(i).padStart(3, '0')}`)]!.m, `b${i}`).toEqual([mem('betrayal', 1990, 3)])
    // inside an edge it is the oldest unpinned that goes
    const cut = all.filter((e) => e.m && e.m.length > 0 && e.m.length < 8 && !e.m.some((s) => s.startsWith('betrayal')))
    for (const e of cut) expect(e.m![e.m!.length - 1]).toBe(mem('gift_given', 1997))
  })

  it('cuts even a world of nothing but pinned memories to 4,000 (the hard cap beats the pin)', () => {
    const entries: [string, Edge][] = []
    for (let i = 0; i < EDGE_CAPS.edges; i++) entries.push([key(String(i).padStart(4, '0')), E({ f: i % 101, m: Array.from({ length: 8 }, (_, j) => mem('betrayal', 1990 + j, 1)) })])
    const out = asMap(normalizeEdges(mapOf(entries)))
    expect(Object.values(out).reduce((n, e) => n + (e.m?.length ?? 0), 0)).toBe(EDGE_CAPS.memTotal)
  })

  it('40 secrets stay at 40 and 6 holders each when 4,000 secrets of 600 holders are offered', () => {
    const entries: [string, unknown][] = []
    for (let i = 0; i < 4000; i++) entries.push([`secret:${i}`, { a: pr(i % 50), k: i % 2 ? 'affair' : 'debt', v: 1 + (i % 5), h: Array.from({ length: 600 }, (_, j) => pr(j)), y: 2000 + (i % 30) }])
    const out = normalizeEdges(mapOf(entries)) as unknown as Record<string, { h: string[] }>
    expect(keysOf(out)).toHaveLength(EDGE_CAPS.secrets)
    for (const s of Object.values(out)) expect(s.h).toHaveLength(EDGE_CAPS.holders)
    expect(sortedKeys(keysOf(out))).toBe(true)
  })

  it('does not count secrets against the 1,200 edges, and does not let them crowd one out', () => {
    const entries: [string, unknown][] = []
    for (let i = 0; i < EDGE_CAPS.edges; i++) entries.push([key(String(i).padStart(4, '0')), E()])
    for (let i = 0; i < 40; i++) entries.push([`secret:${i}`, { a: pr(1), k: 'affair', v: 1, h: [pr(2)], y: 2000 }])
    const out = normalizeEdges(mapOf(entries))
    expect(keysOf(out).filter((k) => !isSecretKey(k))).toHaveLength(EDGE_CAPS.edges)
    expect(keysOf(out).filter((k) => isSecretKey(k))).toHaveLength(40)
  })
})

describe('secrets', () => {
  const S = (over: Record<string, unknown> = {}): Record<string, unknown> => ({ a: pr(1), k: 'affair', v: 3, h: [pr(2), pr(3)], y: 2000, ...over })

  it('knows a secret key: secret: and a whole number without a leading zero', () => {
    for (const k of ['secret:0', 'secret:1', 'secret:42', 'secret:123456789']) expect(isSecretKey(k), k).toBe(true)
    for (const k of ['secret:', 'secret:01', 'secret:-1', 'secret:1.5', 'secret:a', 'secret:1234567890', 'secret:1>person:p1', 'person:p1>person:p2', '', 5, null]) expect(isSecretKey(k), String(k)).toBe(false)
  })

  it('keeps a canonical secret and rejects the shapes that are not one', () => {
    const bad: Record<string, unknown>[] = [
      S({ a: 'nope' }), S({ a: 5 }), S({ k: 'murder' }), S({ k: 5 }), S({ v: 0 }), S({ v: 6 }), S({ v: 2.5 }), S({ v: '3' }), S({ y: 1899 }), S({ y: 'x' }), S({ y: 2000.5 }),
      S({ p: 'x' }), S({ p: 1899 }), S({ p: NaN }), S({ h: 'x' }), S({ h: null }), { a: pr(1), k: 'affair', v: 3, y: 2000 },
    ]
    for (const s of bad) {
      expect(keysOf(normalizeEdges({ 'secret:1': s })), JSON.stringify(s)).toEqual([])
      expect(edgeProblems({ 'secret:1': s }).length, JSON.stringify(s)).toBeGreaterThan(0)
    }
    for (const s of [S(), S({ p: 2003 }), S({ h: [] }), S({ k: 'debt', v: 5 }), S({ v: 1, y: 100_000 })]) {
      const m = { 'secret:1': s }
      expect(normalizeEdges(m)).toBe(m)
    }
  })

  it('cuts nine holders to six, drops a holder that is not a ref and a holder named twice, and keeps the order', () => {
    const h = [pr(1), 'nope', pr(2), pr(1), 5, pr(3), pr(4), pr(5), pr(6), pr(7), pr(8)]
    const out = normalizeEdges({ 'secret:1': S({ h }) }) as unknown as Record<string, { h: string[] }>
    expect(out['secret:1']!.h).toEqual([pr(1), pr(2), pr(3), pr(4), pr(5), pr(6)])
    expect(edgeProblems({ 'secret:1': S({ h }) }).some((p) => /holders/.test(p))).toBe(true)
  })

  it('drops unknown fields of a secret and keeps the rest', () => {
    const out = normalizeEdges({ 'secret:1': { ...S(), extra: 1 } }) as unknown as Record<string, unknown>
    expect(out['secret:1']).toEqual(S())
  })

  it('keeps the 40 that matter when more are offered: an unleaked secret over a leaked one, a worse one over a lighter one, a newer one over an older one', () => {
    const entries: [string, unknown][] = []
    for (let i = 0; i < 50; i++) entries.push([`secret:${i}`, S({ v: 1 + (i % 5), y: 2000 + i, ...(i < 15 ? { p: 2020 } : {}) })])
    const out = normalizeEdges(mapOf(entries)) as unknown as Record<string, { v: number; p?: number }>
    const kept = Object.entries(out)
    expect(kept).toHaveLength(40)
    // 35 unleaked ones all stay, and 5 of the 15 leaked ones fill the rest, the heaviest first
    expect(kept.filter(([, s]) => s.p === undefined)).toHaveLength(35)
    expect(kept.filter(([, s]) => s.p !== undefined).every(([, s]) => s.v >= 3)).toBe(true)
  })

  it('stays out of edgesOf, readEdge, liveFeuds and openDebts', () => {
    const g = gameWith(mapOf([[key(1), E({ q: [1, 2000, 0] })], ['secret:1', S()]]))
    expect(edgesOf(g, pr(1)).map(([k]) => k)).toEqual([key(1)])
    expect(readEdge(g, pr(1), ME)).not.toBeNull()
    expect(liveFeuds(g)).toBe(1)
    expect(openDebts(g)).toBe(0)
  })
})

describe('the reads: readEdge, edgesOf', () => {
  const MAP = mapOf([
    [key(1), E({ f: 70 })],
    [key(2), E({ f: 20 })],
    [`${ME}>${pr(1)}`, E({ f: 40 })],
    [`${pr(1)}>${pr(2)}`, E({ f: 30 })],
    [`staff:ks1>${ME}`, E({ k: 'staff' })],
  ])

  it('reads the edge from the first end to the second, and null for a missing one or a bad ref', () => {
    const g = gameWith(MAP)
    expect(readEdge(g, pr(1), ME)).toEqual(E({ f: 70 }))
    expect(readEdge(g, ME, pr(1))).toEqual(E({ f: 40 }))
    expect(readEdge(g, pr(3), ME)).toBeNull()
    expect(readEdge(g, 'nope' as EntityRef, ME)).toBeNull()
    expect(readEdge(g, pr(1), 'person:me>x' as EntityRef)).toBeNull()
    expect(readEdge(g, '__proto__' as EntityRef, ME)).toBeNull()
    expect(readEdge(g, 'constructor' as EntityRef, 'toString' as EntityRef)).toBeNull()
  })

  it('returns the stored edge itself for a valid map, and the same one on a second read', () => {
    const g = gameWith(MAP)
    expect(readEdge(g, pr(1), ME)).toBe((MAP as Record<string, Edge>)[key(1)])
    expect(readEdge(g, pr(1), ME)).toBe(readEdge(g, pr(1), ME))
  })

  it('reads the normalized edge from a hostile map, not the raw one', () => {
    const g = gameWith(mapOf([[key(1), E({ t: 900, m: ['nope', mem('betrayal', 2000)] })]]))
    expect(readEdge(g, pr(1), ME)).toMatchObject({ t: 100, m: [mem('betrayal', 2000)] })
  })

  it('lists every edge that has the ref at either end, sorted by key, as frozen [key, edge] pairs', () => {
    const g = gameWith(MAP)
    const list = edgesOf(g, pr(1))
    expect(list.map(([k]) => k)).toEqual([`${ME}>${pr(1)}`, key(1), `${pr(1)}>${pr(2)}`])
    expect(Object.isFrozen(list)).toBe(true)
    expect(edgesOf(g, ME).map(([k]) => k)).toEqual([`${ME}>${pr(1)}`, key(1), key(2), `staff:ks1>${ME}`])
    expect(edgesOf(g, pr(9))).toEqual([])
    expect(edgesOf(g, 'nope' as EntityRef)).toEqual([])
    expect(edgesOf(g, 5 as never)).toEqual([])
    expect(edgesOf(g, pr(1))).toBe(edgesOf(g, pr(1)))
  })

  it('reads an empty world, a missing one and a hostile root as no edges', () => {
    const noWorld = makeTestGame(1)
    expect(readEdge(noWorld, pr(1), ME)).toBeNull()
    expect(edgesOf(noWorld, ME)).toEqual([])
    for (const bad of [5, 'x', null, [], [E()], true]) {
      const g = gameWith(bad)
      expect(readEdge(g, pr(1), ME), String(bad)).toBeNull()
      expect(edgesOf(g, ME), String(bad)).toEqual([])
    }
    ;(noWorld as { world?: unknown }).world = 12
    expect(edgesOf(noWorld, ME)).toEqual([])
  })

  it('never creates g.world, never draws g.rng and never touches g.nextId (a read, under deepFreeze)', () => {
    const noWorld = deepFreeze(makeTestGame(7))
    const rng = noWorld.rng
    const nextId = noWorld.nextId
    expect(() => {
      readEdge(noWorld, pr(1), ME)
      edgesOf(noWorld, ME)
      liveFeuds(noWorld)
      openDebts(noWorld)
    }).not.toThrow()
    expect('world' in noWorld).toBe(false)
    expect(noWorld.rng).toBe(rng)
    expect(noWorld.nextId).toBe(nextId)

    const g = deepFreeze(gameWith(MAP))
    expect(() => {
      readEdge(g, pr(1), ME)
      edgesOf(g, pr(1))
      liveFeuds(g)
      openDebts(g)
    }).not.toThrow()
  })

  it('re-reads when the root is replaced and caches while it is not (the shard is written by replacing its root)', () => {
    const g = gameWith(MAP)
    const before = readEdge(g, pr(1), ME)
    g.world = { v: 1, edges: mapOf([[key(1), E({ f: 11 })]]) }
    expect(readEdge(g, pr(1), ME)).toEqual(E({ f: 11 }))
    expect(before).toEqual(E({ f: 70 }))
  })
})

describe('edgeProblems(raw, people?, ego?)', () => {
  const VALID = mapOf([[key(1), E()]])

  it('is empty for a valid map and for an absent one', () => {
    expect(edgeProblems(VALID)).toEqual([])
    expect(edgeProblems({})).toEqual([])
    expect(edgeProblems(undefined)).toEqual([])
  })

  it('names a root that is not a plain object', () => {
    for (const bad of [5, 'x', null, [], [E()], true, new Date(0)]) expect(edgeProblems(bad).join('|'), String(bad)).toMatch(/not a plain object/)
  })

  const FAULTS: [string, unknown, RegExp][] = [
    ['a key that is not an edge key', { [key(1)]: E(), v: E() }, /key "v"/],
    ['a key with a bad end', { 'person:p1>nope': E() }, /key "person:p1>nope"/],
    ['an entry that is not an object', { [key(1)]: 5 }, /not a plain object/],
    ['an unknown field', { [key(1)]: { ...E(), zz: 1 } }, /unknown field "zz"/],
    ['t out of range', { [key(1)]: E({ t: 101 }) }, /\bt\b.*0 to 100/],
    ['f out of range', { [key(1)]: E({ f: -1 }) }, /\bf\b.*0 to 100/],
    ['r not a number', { [key(1)]: { ...E(), r: 'x' } }, /\br\b.*0 to 100/],
    ['s NaN', { [key(1)]: E({ s: NaN }) }, /\bs\b.*0 to 100/],
    ['o out of range', { [key(1)]: E({ o: -101 }) }, /\bo\b.*-100 to 100/],
    ['y not a year', { [key(1)]: E({ y: 1800 }) }, /\by\b.*1900 to 100000/],
    ['l not whole', { [key(1)]: E({ l: 2000.5 }) }, /\bl\b.*1900 to 100000/],
    ['m not a list', { [key(1)]: { ...E(), m: 'x' } }, /\bm\b.*list/],
    ['m empty', { [key(1)]: E({ m: [] }) }, /\bm\b.*empty/],
    ['an unknown memory kind', { [key(1)]: E({ m: ['nope.2000.1.e'] }) }, /unknown memory kind "nope"/],
    ['a malformed memory', { [key(1)]: E({ m: ['betrayal.2000'] }) }, /memory "betrayal\.2000"/],
    ['more than 8 memories', { [key(1)]: E({ m: Array.from({ length: 9 }, (_, i) => mem('gift_given', 2000 + i)) }) }, /9 memories.*cap 8/],
    ['memories out of order', { [key(1)]: E({ m: [mem('gift_given', 2003), mem('gift_given', 2001)] }) }, /m is out of order/],
    ['n too long', { [key(1)]: E({ n: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }) }, /\bn\b.*cap 6/],
    ['n entry bad', { [key(1)]: E({ n: ['a b'] }) }, /\bn\b.*"a b"/],
    ['d too long', { [key(1)]: E({ d: [1, 2, 3, 4, 5, 6, 7, 8, 9] }) }, /\bd\b.*cap 8/],
    ['d entry bad', { [key(1)]: E({ d: [1.5] }) }, /\bd\b.*1\.5/],
    ['a bad feud', { [key(1)]: E({ q: [5, 2000, 0] as never }) }, /\bq\b.*feud/],
    ['a bad debt', { [key(1)]: E({ dv: [-1, 0, 2000, 0, 0] as never }) }, /\bdv\b.*debt/],
    ['c not a year', { [key(1)]: E({ c: 3 }) }, /\bc\b.*year/],
    ['k not a link kind', { [key(1)]: E({ k: 'boss' as never }) }, /\bk\b.*link kind/],
    ['a bad secret', { 'secret:1': { a: 'x' } }, /secret:1/],
    ['a secret with 9 holders', { 'secret:1': { a: pr(1), k: 'affair', v: 3, h: Array.from({ length: 9 }, (_, i) => pr(i)), y: 2000 } }, /9 holders.*cap 6/],
    ['a secret with a bad kind', { 'secret:1': { a: pr(1), k: 'x', v: 3, h: [], y: 2000 } }, /secret:1.*"affair" or "debt"/],
    ['a secret with a bad severity', { 'secret:1': { a: pr(1), k: 'debt', v: 7, h: [], y: 2000 } }, /secret:1.*\bv\b.*1 to 5/],
    ['a secret with a bad holder', { 'secret:1': { a: pr(1), k: 'debt', v: 2, h: ['x'], y: 2000 } }, /secret:1.*holder/],
    ['a secret holder named twice', { 'secret:1': { a: pr(1), k: 'debt', v: 2, h: [pr(2), pr(2)], y: 2000 } }, /secret:1.*twice/],
  ]
  for (const [name, raw, re] of FAULTS) {
    it(`names ${name}`, () => {
      const problems = edgeProblems(raw)
      expect(problems.length).toBeGreaterThan(0)
      expect(problems.join('\n')).toMatch(re)
      for (const p of problems) {
        expect(p.length, p).toBeLessThanOrEqual(240)
        expect(DASH.test(p), p).toBe(false)
      }
    })
  }

  it('names the caps: 1,201 edges, 4,001 memories, 13 feuds, 41 debts, n and d on 121 edges, 41 secrets', () => {
    const edges: [string, unknown][] = []
    for (let i = 0; i < EDGE_CAPS.edges + 1; i++) edges.push([key(String(i).padStart(4, '0')), E()])
    expect(edgeProblems(mapOf(edges)).join('\n')).toMatch(/1201 edges.*cap 1200/)

    const memories: [string, unknown][] = []
    for (let i = 0; i < 501; i++) memories.push([key(String(i).padStart(3, '0')), E({ m: Array.from({ length: 8 }, (_, j) => mem('gift_given', 1990 + j)) })])
    expect(edgeProblems(mapOf(memories)).join('\n')).toMatch(/4008 memories.*cap 4000/)

    const feuds: [string, unknown][] = []
    for (let i = 0; i < 13; i++) feuds.push([key(String(i).padStart(2, '0')), E({ q: [1, 2000, 0] })])
    expect(edgeProblems(mapOf(feuds)).join('\n')).toMatch(/13 feuds.*cap 12/)

    const debts: [string, unknown][] = []
    for (let i = 0; i < 41; i++) debts.push([key(String(i).padStart(2, '0')), E({ dv: [1, 0, 2000, 0, 0] })])
    expect(edgeProblems(mapOf(debts)).join('\n')).toMatch(/41 debts.*cap 40/)

    const talk: [string, unknown][] = []
    for (let i = 0; i < 121; i++) talk.push([key(String(i).padStart(3, '0')), E({ n: ['a'] })])
    expect(edgeProblems(mapOf(talk)).join('\n')).toMatch(/121 edges.*cap 120/)

    const secrets: [string, unknown][] = []
    for (let i = 0; i < 41; i++) secrets.push([`secret:${i}`, { a: pr(1), k: 'affair', v: 1, h: [], y: 2000 }])
    expect(edgeProblems(mapOf(secrets)).join('\n')).toMatch(/41 secrets.*cap 40/)
  })

  it('names the order of the keys', () => {
    const m = { [key(2)]: E(), [key(1)]: E() }
    expect(edgeProblems(m).join('\n')).toMatch(/out of order/)
  })

  it('stays short on a map that is wrong everywhere: at most 60 lines, the last one counting the rest', () => {
    const raw: Record<string, unknown> = {}
    for (let i = 0; i < 5000; i++) raw[`junk${i}`] = 5
    const problems = edgeProblems(raw)
    expect(problems.length).toBeLessThanOrEqual(61)
    expect(problems[problems.length - 1]).toMatch(/and \d+ more/)
  })

  it('agrees with the normalizer: a map has no problems exactly when normalizeEdges gives it back as itself', () => {
    const cases: unknown[] = [
      {}, VALID, mapOf([[key(1), E({ k: 'kin', m: [mem('betrayal', 2000, 3)], n: ['a'], d: [1], c: 2003, q: [1, 2000, 0], dv: [10, 5, 2000, 0, 0] })]]),
      5, 'x', null, [], { v: 1 }, { [key(2)]: E(), [key(1)]: E() }, { [key(1)]: { ...E(), z: 1 } }, { [key(1)]: E({ t: 101 }) }, { [key(1)]: E({ m: [] }) },
      { [key(1)]: E({ m: [mem('gift_given', 2003), mem('gift_given', 2001)] }) }, { [key(1)]: E({ q: [5, 2000, 0] as never }) }, { [key(1)]: E({ dv: [1, 61, 2000, 0, 0] as never }) },
      { [key(1)]: E({ n: ['a b'] }) }, { [key(1)]: E({ d: [1, 1.5] }) }, { [key(1)]: E({ c: 3 }) }, { [key(1)]: E({ k: 'x' as never }) },
      { 'secret:1': { a: pr(1), k: 'affair', v: 3, h: [pr(2)], y: 2000 } }, { 'secret:1': { a: pr(1), k: 'affair', v: 9, h: [pr(2)], y: 2000 } },
      { 'secret:1': { a: pr(1), k: 'affair', v: 3, h: [pr(2), pr(2)], y: 2000 } }, { 'secret:01': { a: pr(1), k: 'affair', v: 3, h: [], y: 2000 } },
      { [key(1)]: E({ f: 25.5 }), [key(3)]: E({ o: -50.25 }) }, { [key(1)]: null }, { [key(1)]: E({ y: 2000.5 }) },
    ]
    for (const c of cases) {
      const out = normalizeEdges(c)
      const same = out === c
      const ok = edgeProblems(c).length === 0
      expect(ok, JSON.stringify(c)).toBe(same)
    }
  })

  describe('the affection invariant (with people and an ego)', () => {
    const person = (id: string, relationship: number, over: Partial<Person> = {}): Person =>
      ({ id, relation: 'friend', relationship, data: {}, ...over }) as unknown as Person

    it('names an edge person>ego of a non-pet person whose f differs from Person.relationship', () => {
      const map = mapOf([[key(1), E({ f: 60 })], [key(2), E({ f: 40 })]])
      const people = [person('p1', 60), person('p2', 41)]
      const problems = edgeProblems(map, people, ME)
      expect(problems).toHaveLength(1)
      expect(problems[0]).toMatch(/person:p2/)
      expect(problems[0]).toMatch(/40/)
      expect(problems[0]).toMatch(/41/)
    })

    it('says nothing when the numbers agree, when there is no edge, for a pet, for an edge toward someone else, or without people or ego', () => {
      const map = mapOf([[key(1), E({ f: 60 })], [key(2), E({ f: 40 })], [`${pr(3)}>${pr(9)}`, E({ f: 1 })]])
      expect(edgeProblems(map, [person('p1', 60)], ME)).toEqual([])
      expect(edgeProblems(map, [person('p7', 33)], ME)).toEqual([])
      expect(edgeProblems(map, [person('p2', 99, { relation: 'pet' })], ME)).toEqual([])
      expect(edgeProblems(map, [person('p3', 50)], ME)).toEqual([])
      expect(edgeProblems(map, [person('p1', 5)])).toEqual([])
      expect(edgeProblems(map, undefined, ME)).toEqual([])
      expect(edgeProblems(map, [person('p1', 5)], 'nope' as EntityRef)).toEqual([])
    })

    it('keys a person by personEntity, so a person with a sid is found under person:<sid>', () => {
      const map = mapOf([[`person:cls.us.2004.12>${ME}`, E({ f: 10 })]])
      const p = person('p5', 20, { data: { sid: 'cls.us.2004.12' } })
      expect(edgeProblems(map, [p], ME)).toHaveLength(1)
      expect(edgeProblems(map, [person('p5', 10, { data: { sid: 'cls.us.2004.12' } })], ME)).toEqual([])
    })

    it('is total on hostile people (null, text, no data, a huge list)', () => {
      const map = mapOf([[key(1), E({ f: 60 })]])
      const hostile = [null, undefined, 5, 'x', {}, { id: 5 }, { id: 'p1' }, { id: 'p1', relation: 'friend', relationship: 'x' }, { id: 'p1', relation: 'friend', relationship: 60, data: null }] as unknown as Person[]
      expect(() => edgeProblems(map, hostile, ME)).not.toThrow()
      expect(() => edgeProblems(map, 5 as never, ME)).not.toThrow()
      const many = Array.from({ length: 20_000 }, (_, i) => person(`p${i}`, 1))
      expect(() => edgeProblems(map, many, ME)).not.toThrow()
    })
  })
})

describe('fuzz: the normalizer and edgeProblems on 600 maps made wrong in random ways', () => {
  /** A small deterministic generator (a linear congruence): the same maps on every machine, no g.rng. */
  function lcg(start: number): () => number {
    let x = start >>> 0
    return () => {
      x = (Math.imul(x, 1664525) + 1013904223) >>> 0
      return x / 2 ** 32
    }
  }

  const JUNK: unknown[] = [
    NaN, Infinity, -Infinity, -1, 0, 1, 2.5, 50, 100, 101, -101, 1e300, -1e300, 1899, 2000, 2000.5, 100_000, 100_001, '', 'x', 'person:p1', 'betrayal.2000.1.e', null, undefined, true,
    [], {}, [1], ['a'], [1, 2000, 0], [1, 2000, 0, 5, 9], { a: 1 }, 'secret:1', 'kin', 'nope.2000.1.e', [mem('betrayal', 2000), mem('gift_given', 1999)], new Date(0),
  ]
  const FIELDS = ['t', 'f', 'r', 's', 'o', 'y', 'l', 'm', 'n', 'd', 'q', 'dv', 'c', 'k', 'zz']
  const SECRET_FIELDS = ['a', 'k', 'v', 'h', 'y', 'p']

  function base(rnd: () => number): Record<string, unknown> {
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!
    const entries: [string, unknown][] = []
    const count = 3 + Math.floor(rnd() * 6)
    for (let i = 0; i < count; i++) {
      const e: Edge = E({ f: Math.floor(rnd() * 101), s: Math.floor(rnd() * 101), o: Math.floor(rnd() * 201) - 100 })
      if (rnd() < 0.5) e.m = [mem('gift_given', 1990 + i), mem(pick(MEMORY_KINDS_LIST), 2000 + i, 1 + Math.floor(rnd() * 3), pick(['ego', 'them'] as const))]
      if (rnd() < 0.3) e.n = ['k1', 'k2']
      if (rnd() < 0.3) e.d = [1, 2, 3]
      if (rnd() < 0.3) e.q = [1 + Math.floor(rnd() * 4), 2000, 5]
      if (rnd() < 0.3) e.dv = [Math.floor(rnd() * 1000), 5, 2000, Math.floor(rnd() * 2), 0]
      if (rnd() < 0.3) e.c = 2003
      if (rnd() < 0.4) e.k = pick(LINK_KINDS)
      entries.push([key(String(i).padStart(3, '0')), e])
    }
    if (rnd() < 0.7) entries.push(['secret:1', { a: pr(1), k: 'affair', v: 3, h: [pr(2), pr(3)], y: 2000 }])
    return mapOf(entries)
  }

  function spoil(rnd: () => number, map: Record<string, unknown>): Record<string, unknown> {
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(map)) out[k] = v !== null && typeof v === 'object' ? { ...(v as object) } : v
    const rounds = Math.floor(rnd() * 4)
    for (let i = 0; i < rounds; i++) {
      const keys = Object.keys(out)
      const k = pick(keys)
      const v = out[k]
      const roll = rnd()
      if (roll < 0.55 && v !== null && typeof v === 'object') (v as Record<string, unknown>)[pick(isSecretKey(k) ? SECRET_FIELDS : FIELDS)] = pick(JUNK)
      else if (roll < 0.65 && v !== null && typeof v === 'object') delete (v as Record<string, unknown>)[pick(isSecretKey(k) ? SECRET_FIELDS : FIELDS)]
      else if (roll < 0.75) out[k] = pick(JUNK)
      else if (roll < 0.85) out[pick(['v', 'junk', 'person:p9>', 'secret:01', key(77), `secret:${Math.floor(rnd() * 50)}`])] = pick([E(), E({ t: 500 }), 5, null])
      else if (roll < 0.92) delete out[k]
      else {
        // put the keys in a new order
        const shuffled = Object.entries(out).sort(() => rnd() - 0.5)
        for (const key2 of Object.keys(out)) delete out[key2]
        for (const [k2, v2] of shuffled) out[k2] = v2
      }
    }
    return out
  }

  const MEMORY_KINDS_LIST: MemoryKind[] = ['gift_given', 'loan_given', 'betrayal', 'saved_me', 'told_gently', 'divorced', 'kept_secret']

  it('never throws, is a fixed point, has no problems once normalized, and has none exactly when it is its own normal form', () => {
    const rnd = lcg(0x5eed5)
    let valid = 0
    let spoiled = 0
    for (let i = 0; i < 600; i++) {
      const input = spoil(rnd, base(rnd))
      const before = JSON.stringify(input, (_, v: unknown) => (v === undefined ? '__undefined__' : typeof v === 'number' && !Number.isFinite(v) ? `__${String(v)}__` : v))
      let out: EdgeMap = {}
      expect(() => {
        out = normalizeEdges(input)
      }, before).not.toThrow()
      // a plain object whose keys ascend, and every cap holds
      expect(Object.getPrototypeOf(out) === Object.prototype || out === input, before).toBe(true)
      expect(sortedKeys(keysOf(out)), before).toBe(true)
      // a fixed point with no problems
      expect(normalizeEdges(out), before).toBe(out)
      expect(edgeProblems(out), before).toEqual([])
      // the input was not touched
      expect(JSON.stringify(input, (_, v: unknown) => (v === undefined ? '__undefined__' : typeof v === 'number' && !Number.isFinite(v) ? `__${String(v)}__` : v)), before).toBe(before)
      // problems exactly when the map is not its own normal form
      const clean = edgeProblems(input).length === 0
      expect(clean, `${before}\\n${edgeProblems(input).join('\\n')}`).toBe(out === input)
      if (clean) valid++
      else spoiled++
    }
    // the generator really does produce both kinds
    expect(valid).toBeGreaterThan(30)
    expect(spoiled).toBeGreaterThan(300)
  })
})

describe('the worst case the model can reach', () => {
  /** 1,200 edges, each with every field that can sit on all of them: a link kind and a call-in, 3 or 4 memories (4,000 in all), 120 with n and d, 12 feuds, 40 debts. */
  function maximal(): Record<string, unknown> {
    const entries: [string, unknown][] = []
    const kinds: MemoryKind[] = ['gift_given', 'loan_given', 'told_gently', 'kept_secret']
    for (let i = 0; i < EDGE_CAPS.edges; i++) {
      const count = i < 400 ? 4 : 3
      const e: Edge = E({
        // the first 120 are the most salient (200 and up; no other edge reaches 177), so n and d sit where the model allows them
        f: i < EDGE_CAPS.talkEdges ? 100 : 100 - (i % 100),
        s: i < EDGE_CAPS.talkEdges ? 100 : i % 7,
        o: (i % 21) - 10,
        k: LINK_KINDS[i % LINK_KINDS.length]!,
        c: 2000 + (i % 20),
        m: Array.from({ length: count }, (_, j) => mem(kinds[j]!, 1990 + j * 2)),
      })
      if (i < EDGE_CAPS.talkEdges) { e.n = ['k1', 'k2', 'k3', 'k4', 'k5', 'k6']; e.d = [1, 2, 3, 4, 5, 6, 7, 8] }
      if (i < EDGE_CAPS.feuds) e.q = [1 + (i % 4), 2000, 5]
      if (i < EDGE_CAPS.debts) e.dv = [1000 + i, 5, 2000, i % 2, 0]
      entries.push([key(String(i).padStart(4, '0')), e])
    }
    return mapOf(entries)
  }

  it('is a valid map: it comes back as itself with no problems', () => {
    const m = maximal()
    expect(keysOf(m)).toHaveLength(EDGE_CAPS.edges)
    expect(normalizeEdges(m)).toBe(m)
    expect(edgeProblems(m)).toEqual([])
  })

  it('counts 19,409 nodes with a link kind and a call-in on every edge: the plan\'s 17,000 leaves those two fields out', () => {
    const m = maximal()
    const base = EDGE_CAPS.edges * 8 // an edge object and its seven numbers
    const kc = EDGE_CAPS.edges * 2 // k and c
    const memArrays = EDGE_CAPS.edges
    const memStrings = EDGE_CAPS.memTotal
    const talk = EDGE_CAPS.talkEdges * (1 + 6 + 1 + 8)
    const feuds = EDGE_CAPS.feuds * (1 + 3)
    const debts = EDGE_CAPS.debts * (1 + 5)
    const sum = 1 + base + kc + memArrays + memStrings + talk + feuds + debts
    expect(sum).toBe(19_409)
    expect(nodeCount(m, 1_000_000)).toBe(sum)
    // the plan's list (no k, no c) is the 17,000 of the allotment comment in world/caps.ts
    expect(base + memArrays + memStrings + talk + feuds + debts).toBeGreaterThan(16_900)
    expect(base + memArrays + memStrings + talk + feuds + debts).toBeLessThan(17_200)
    // and the slice E6b registers for it (24,000 nodes) holds the real worst case
    expect(sum).toBeLessThan(24_000)
  })

  it('adds 520 nodes for 40 secrets of 6 holders, a leaked year and all, and stays far under the world cap together', () => {
    const entries: [string, unknown][] = []
    for (let i = 0; i < EDGE_CAPS.secrets; i++) entries.push([`secret:${i}`, { a: pr(i), k: 'affair', v: 5, h: Array.from({ length: 6 }, (_, j) => pr(100 + j)), y: 2000, p: 2003 }])
    const secrets = mapOf(entries)
    expect(normalizeEdges(secrets)).toBe(secrets)
    const n = nodeCount(secrets, 1_000_000) - 1
    expect(n).toBe(40 * 13)
    expect(n + 19_409).toBeLessThan(25_000)
  })
})
