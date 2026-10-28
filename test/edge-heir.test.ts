// R4-E8 (X28, X33, C10): the heir copy of the edges (src/game/world/edge-heir.ts). heirEdges is the pure half of the hand-over: Life's
// carryEdges (R4-L9) calls it over the edges that end at the late player and merges what it returns, so the keys are final.
//
//   - every edge `X > fromEgo` becomes `X > toEgo`, and nothing else is copied (a key that starts at the late player, a secret, a self
//     edge and a key that is not an edge are left behind);
//   - trust, affection and respect are halved, resentment is scaled by 0.6, obligation by 1, and no field is ever raised;
//   - every memory keeps at one point less of weight (a memory at weight 1 goes), the pinned five included;
//   - the dialogue store (n, d), the call-in stamp (c) and the debt (dv) are dropped; q and k are kept for the link kinds in
//     HEIR_KEEP_KINDS (kin) only, so a rival's feud ends at the hand-over;
//   - 100 times the caps in gives an answer inside EDGE_CAPS, and a hostile map copies to a valid one.
import { describe, expect, it } from 'vitest'
import type { EntityRef } from '../src/game/kernel/ids'
import { EDGE_CAPS } from '../src/game/world/caps'
import { EGO_COPY, HEIR_KEEP_KINDS, heirEdges } from '../src/game/world/edge-heir'
import { MEMORY_KINDS, formatMemory, parseMemory, type MemoryKind } from '../src/game/world/edge-memory'
import { LINK_KINDS, edgeProblems, normalizeEdges, type Edge, type EdgeMap } from '../src/game/world/edges'
import { deepFreeze } from './fuzz-kit'

const OLD = 'person:c1' as EntityRef
const HEIR = 'person:c2' as EntityRef
const YEAR = 2040

const E = (over: Partial<Edge> = {}): Edge => ({ t: 80, f: 61, r: 41, s: 50, o: 37, y: 2000, l: 2035, ...over })
const mem = (kind: MemoryKind, year: number, w: 1 | 2 | 3, by: 'ego' | 'them' = 'ego'): string => formatMemory({ kind, year, w, by })
const keyTo = (who: string, ego: EntityRef = OLD): string => `person:${who}>${ego}`
const only = (map: EdgeMap): Readonly<Edge> => {
  const keys = Object.keys(map)
  expect(keys).toHaveLength(1)
  return map[keys[0]!]!
}
const count = (map: EdgeMap, f: (e: Readonly<Edge>) => number): number => Object.keys(map).reduce((n, k) => n + f(map[k]!), 0)

describe('the constants', () => {
  it('copies trust, affection and respect at one half, resentment at 0.6 and obligation whole', () => {
    expect(EGO_COPY).toEqual({ t: 0.5, f: 0.5, r: 0.5, s: 0.6, o: 1 })
    expect(Object.isFrozen(EGO_COPY)).toBe(true)
  })

  it('keeps only the kin link across the switch (X28)', () => {
    expect([...HEIR_KEEP_KINDS]).toEqual(['kin'])
    for (const k of HEIR_KEEP_KINDS) expect(LINK_KINDS as readonly string[]).toContain(k)
  })
})

describe('the numbers', () => {
  it('scales trust, affection and respect by 0.5, resentment by 0.6 and obligation by 1', () => {
    const out = only(heirEdges({ [keyTo('p5')]: E() }, OLD, HEIR, YEAR))
    expect(out.t).toBe(40)
    expect(out.f).toBe(30.5)
    expect(out.r).toBe(20.5)
    expect(out.s).toBe(30)
    expect(out.o).toBe(37)
  })

  it('keeps the sign of an obligation and a stored number short', () => {
    const out = only(heirEdges({ [keyTo('p5')]: E({ s: 33, o: -64, t: 33.33 }) }, OLD, HEIR, YEAR))
    expect(out.o).toBe(-64)
    expect(out.s).toBe(19.8)
    expect(out.t).toBe(16.67)
  })

  it('never raises t, f, r or s, and keeps every field in its range, over a grid of inputs', () => {
    const grid = [0, 0.004, 0.0099, 0.01, 1, 7, 33.33, 50, 99.99, 100]
    const map: Record<string, Edge> = {}
    let n = 0
    for (const t of grid) for (const s of grid) map[keyTo(`p${n++}`)] = E({ t, f: t, r: s, s })
    const out = heirEdges(map, OLD, HEIR, YEAR)
    expect(Object.keys(out)).toHaveLength(n)
    for (const [k, e] of Object.entries(out)) {
      const was = map[k.replace(HEIR, OLD)]!
      expect(e.t).toBeLessThanOrEqual(was.t)
      expect(e.f).toBeLessThanOrEqual(was.f)
      expect(e.r).toBeLessThanOrEqual(was.r)
      expect(e.s).toBeLessThanOrEqual(was.s)
      expect(e.o).toBe(was.o)
      for (const v of [e.t, e.f, e.r, e.s]) expect(v >= 0 && v <= 100).toBe(true)
    }
  })

  it('stamps the hand-over as the last touch and never lets the start come after it', () => {
    const out = heirEdges({ [keyTo('p5')]: E({ y: 2030, l: 2035 }), [keyTo('p6')]: E({ y: 2041, l: 2041 }) }, OLD, HEIR, YEAR)
    expect(out[keyTo('p5', HEIR)]).toMatchObject({ y: 2030, l: YEAR })
    expect(out[keyTo('p6', HEIR)]).toMatchObject({ y: YEAR, l: YEAR })
  })
})

describe('the memories', () => {
  it('keeps every memory at one point less of weight and lets a memory at weight 1 go', () => {
    const m = [mem('loan_given', 2031, 3), mem('gift_given', 2033, 2), mem('hired_me', 2036, 1), mem('betrayal', 2030, 1, 'them'), mem('saved_me', 2032, 3)]
    const out = only(heirEdges({ [keyTo('p5')]: E({ m }) }, OLD, HEIR, YEAR))
    const read = (out.m ?? []).map((s) => parseMemory(s)!)
    expect(read.map((x) => [x.kind, x.w, x.year, x.by])).toEqual([
      ['loan_given', 2, 2031, 'ego'],
      ['saved_me', 2, 2032, 'ego'],
      ['gift_given', 1, 2033, 'ego'],
    ])
  })

  it('drops the memory list when no memory is left', () => {
    const out = only(heirEdges({ [keyTo('p5')]: E({ m: [mem('loan_given', 2031, 1), mem('divorced', 2030, 1)] }) }, OLD, HEIR, YEAR))
    expect('m' in out).toBe(false)
  })

  it('takes a point from the pinned five too, because standing and memory do not pass (D4)', () => {
    const out = only(heirEdges({ [keyTo('p5')]: E({ m: [mem('estranged', 2030, 3)] }) }, OLD, HEIR, YEAR))
    expect(parseMemory(out.m![0])).toMatchObject({ kind: 'estranged', w: 2 })
  })

  it('never makes a weight above 2 out of any stored weight', () => {
    for (const kind of MEMORY_KINDS) {
      const out = heirEdges({ [keyTo('p5')]: E({ m: [mem(kind, 2031, 3)] }) }, OLD, HEIR, YEAR)
      expect(parseMemory(only(out).m![0])!.w).toBe(2)
    }
  })
})

describe('what does not pass', () => {
  it('drops the dialogue store, the call-in stamp and the debt (C10)', () => {
    const rich = E({ k: 'kin', n: ['asked-twice'], d: [3, 4], c: 2036, dv: [5000, 10, 2030, 0, 1000] })
    const out = only(heirEdges({ [keyTo('p5')]: rich }, OLD, HEIR, YEAR))
    for (const f of ['n', 'd', 'c', 'dv'] as const) expect(f in out, f).toBe(false)
    expect(out.k).toBe('kin')
  })

  it('keeps the feud and the link of a kin edge only', () => {
    const q: [number, number, number] = [2, 2036, 17]
    const map: Record<string, Edge> = { [keyTo('kin')]: E({ k: 'kin', q }) }
    for (const k of LINK_KINDS) if (!HEIR_KEEP_KINDS.has(k)) map[keyTo(k)] = E({ k, q })
    map[keyTo('bare')] = E({ q })
    const out = heirEdges(map, OLD, HEIR, YEAR)
    expect(out[keyTo('kin', HEIR)]).toMatchObject({ k: 'kin', q })
    for (const k of LINK_KINDS) {
      if (HEIR_KEEP_KINDS.has(k)) continue
      const e = out[keyTo(k, HEIR)]!
      expect(e, k).toBeDefined()
      expect('q' in e, `${k} feud`).toBe(false)
      expect('k' in e, `${k} link`).toBe(false)
    }
    expect('q' in out[keyTo('bare', HEIR)]!).toBe(false)
  })

  it('gives the kept q a copy of its own, not the input list', () => {
    const q: [number, number, number] = [3, 2036, 9]
    const map = { [keyTo('kin')]: E({ k: 'kin', q, m: [mem('betrayal', 2030, 3)] }) }
    const e = heirEdges(map, OLD, HEIR, YEAR)[keyTo('kin', HEIR)]!
    expect(e.q).toEqual(q)
    expect(e.q).not.toBe(q)
    expect(e.m).not.toBe(map[keyTo('kin')]!.m)
  })
})

describe('the keys', () => {
  it('re-keys every edge that ends at the late player to end at the heir, and copies nothing else', () => {
    const map: Record<string, unknown> = {
      [keyTo('p5')]: E(),
      [keyTo('p6')]: E({ t: 10 }),
      [`${OLD}>person:p5`]: E(),
      [`person:p5>person:p6`]: E(),
      'secret:3': { a: 'person:p5', k: 'affair', v: 2, h: ['person:p6'], y: 2030 },
      [`${OLD}>${OLD}`]: E(),
      [keyTo('c2')]: E(),
      'not a key': E(),
    }
    const out = heirEdges(map as EdgeMap, OLD, HEIR, YEAR)
    expect(Object.keys(out)).toEqual([keyTo('p5', HEIR), keyTo('p6', HEIR)])
  })

  it('answers with final keys: a second copy does not find the first (nothing ends at the late player any more)', () => {
    const once = heirEdges({ [keyTo('p5')]: E() }, OLD, HEIR, YEAR)
    expect(heirEdges(once, OLD, HEIR, YEAR)).toEqual({})
    expect(Object.keys(heirEdges(once, HEIR, 'person:c3' as EntityRef, YEAR))).toEqual([keyTo('p5', 'person:c3' as EntityRef)])
  })

  it('returns keys in ascending order and a map the normalizer gives back as itself', () => {
    const map: Record<string, Edge> = {}
    for (const w of ['p9', 'p10', 'p2', 'a1', 'z0']) map[keyTo(w)] = E()
    const out = heirEdges(map, OLD, HEIR, YEAR)
    const keys = Object.keys(out)
    expect(keys).toEqual([...keys].sort())
    expect(normalizeEdges(out)).toBe(out)
    expect(edgeProblems(out)).toEqual([])
  })

  it('answers with nothing for a map with nothing to copy and for ends that are not refs', () => {
    expect(heirEdges({}, OLD, HEIR, YEAR)).toEqual({})
    expect(heirEdges({ [keyTo('p5')]: E() }, 'nope' as EntityRef, HEIR, YEAR)).toEqual({})
    expect(heirEdges({ [keyTo('p5')]: E() }, OLD, 'nope' as EntityRef, YEAR)).toEqual({})
    expect(heirEdges({ [keyTo('p5')]: E() }, OLD, OLD, YEAR)).toEqual({})
  })
})

describe('purity', () => {
  it('reads a frozen map, changes nothing in it and answers the same twice', () => {
    const map = deepFreeze({ [keyTo('p5')]: E({ k: 'kin', q: [1, 2030, 3], dv: [10, 0, 2030, 0, 0], m: [mem('loan_given', 2031, 3)] }), [keyTo('p6')]: E() })
    const snap = JSON.stringify(map)
    const a = heirEdges(map, OLD, HEIR, YEAR)
    const b = heirEdges(map, OLD, HEIR, YEAR)
    expect(JSON.stringify(map)).toBe(snap)
    expect(a).toEqual(b)
    expect(a).not.toBe(b)
  })
})

describe('bounds', () => {
  it('stays inside EDGE_CAPS when 100 times the edges cap comes in', () => {
    const map: Record<string, Edge> = {}
    const m = [mem('loan_given', 2031, 3), mem('gift_given', 2033, 3)]
    for (let i = 0; i < EDGE_CAPS.edges * 100; i++) map[keyTo(`p${i}`)] = E({ k: 'kin', t: i % 100, f: (i * 7) % 100, s: (i * 13) % 100, m })
    const out = heirEdges(map as EdgeMap, OLD, HEIR, YEAR)
    expect(Object.keys(out).length).toBeLessThanOrEqual(EDGE_CAPS.edges)
    expect(Object.keys(out).length).toBeGreaterThan(0)
    expect(edgeProblems(out)).toEqual([])
  })

  it('stays inside the memory caps when each edge brings 100 times the memories of an edge, and the other caps when 100 times come in', () => {
    const lots: string[] = []
    for (let i = 0; i < EDGE_CAPS.memPerEdge * 100; i++) lots.push(mem(MEMORY_KINDS[i % MEMORY_KINDS.length]!, 2000 + (i % 30), 3))
    const map: Record<string, Edge> = {}
    for (let i = 0; i < EDGE_CAPS.edges; i++) map[keyTo(`p${i}`)] = E({ k: 'kin', m: lots, n: ['a'], d: [1], c: 2030, dv: [1, 0, 2030, 0, 0], q: [1, 2030, 1] })
    const out = heirEdges(map, OLD, HEIR, YEAR)
    expect(Object.keys(out).length).toBe(EDGE_CAPS.edges)
    expect(count(out, (e) => e.m?.length ?? 0)).toBeLessThanOrEqual(EDGE_CAPS.memTotal)
    for (const k of Object.keys(out)) expect((out[k]!.m ?? []).length).toBeLessThanOrEqual(EDGE_CAPS.memPerEdge)
    expect(count(out, (e) => (e.q === undefined ? 0 : 1))).toBeLessThanOrEqual(EDGE_CAPS.feuds)
    expect(count(out, (e) => (e.dv === undefined ? 0 : 1))).toBe(0)
    expect(count(out, (e) => (e.n === undefined && e.d === undefined ? 0 : 1))).toBe(0)
    expect(edgeProblems(out)).toEqual([])
  })
})

describe('a hostile map', () => {
  it('copies to a valid one: no throw, the entries that can be read are cleaned and the rest are left behind', () => {
    const bad: Record<string, unknown> = {
      [keyTo('nan')]: E({ t: Number.NaN }),
      [keyTo('inf')]: E({ s: Number.POSITIVE_INFINITY }),
      [keyTo('big')]: E({ t: 1e300, f: -5, r: 1e9, s: 500, o: 1e9, k: 'kin' }),
      [keyTo('str')]: 'x',
      [keyTo('nil')]: null,
      [keyTo('arr')]: [1, 2, 3],
      [keyTo('junk')]: E({ k: 'boss' as never, m: ['nonsense', 7, null, mem('loan_given', 2031, 3)] as never, q: [9, 9, 9] as never }),
      [keyTo('proto')]: Object.assign(Object.create({ t: 50, f: 50, r: 50, s: 0, o: 0, y: 2000, l: 2000 }) as object, {}),
    }
    Object.defineProperty(bad, keyTo('throws'), { enumerable: true, get: () => { throw new Error('boom') } })
    const out = heirEdges(bad as EdgeMap, OLD, HEIR, YEAR)
    expect(edgeProblems(out)).toEqual([])
    expect(normalizeEdges(out)).toBe(out)
    const names = Object.keys(out)
    expect(names).toContain(keyTo('big', HEIR))
    expect(names).toContain(keyTo('junk', HEIR))
    for (const gone of ['nan', 'inf', 'str', 'nil', 'arr', 'proto', 'throws']) expect(names, gone).not.toContain(keyTo(gone, HEIR))
    const big = out[keyTo('big', HEIR)]!
    expect(big).toMatchObject({ t: 50, f: 0, r: 50, s: 60, o: 100, k: 'kin' })
    const junk = out[keyTo('junk', HEIR)]!
    expect('k' in junk).toBe(false)
    expect(junk.m).toEqual([mem('loan_given', 2031, 2)])
  })

  it('answers {} for a value that is not a map', () => {
    for (const bad of [null, undefined, 5, 'x', [], [1], () => 1]) expect(heirEdges(bad as never, OLD, HEIR, YEAR)).toEqual({})
  })
})
