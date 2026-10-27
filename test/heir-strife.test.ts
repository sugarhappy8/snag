// ci: fast
// R4-L10 (D.9 b; X31, X40, C12, C39): the family quarrels over the will, between NPCs. At the reading of the will (settleReading in
// src/game/events/will-estate.ts) the relatives who were cut out and took it hard hold it against the relatives who were favored. On a
// STAMPED life (X6) that is an edge `cut > favored` between two NPCs: resentment `s` always, a cold feud rung `q` only while fewer than 12
// feuds are live (the 3 a person and 36 in all are edge caps, not feud caps, X31). The reading says it in one line for the strongest pair,
// and the choice it puts to the heir takes one of the year's three family choices. An unstamped life reads the will as it always did.
//
// Sections, in the order of the plan's steps:
//   1. strifeEdges on a hand-made plan: who is written about, `s` and `q`, the per-person cap, the 36, the 12 feuds, the strongest pair,
//      an unstamped life, a hostile plan, a full map, no dice and no dollars.
//   2. planEstate: `plan.recipients` (the slices of the people other than the heir; empty unstamped).
//   3. settleReading on a hand-made hall: the line, the one slot, and an unstamped life that ignores the new input.
//   4. a real hand-over (continueAsChild): an heir cut out, three siblings, two favored and one cut.
//   5. a family with no slot left: the question is not asked and the claim goes back.
//   6. the files: the one door, no long dash, the pool.
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { killCharacter } from '../src/game/death'
import { changeWill } from '../src/game/events/will-act'
import { CHARITY, readWill, updateWl } from '../src/game/events/will-core'
import { planEstate, S_ASK, S_HEIR, settleReading, type CutOut, type EstatePlan } from '../src/game/events/will-estate'
import { strifeEdges, strifeLine, STRIFE } from '../src/game/events/will-strife'
import { personEntity } from '../src/game/kernel/person-ref'
import { continueAsChild } from '../src/game/life'
import { runScript } from '../src/game/scripts'
import { KIN_STRIFE } from '../src/game/text/pools'
import { fillSlots } from '../src/game/text/state'
import type { ChoiceModal, GameState, NoticeModal, Person } from '../src/game/types'
import { EDGE_CAPS } from '../src/game/world/caps'
import { formatMemory } from '../src/game/world/edge-memory'
import { putEdge } from '../src/game/world/edge-write'
import { edgeKey, edgeLocalBound, edgeMap, edgeProblems, isSecretKey, liveFeuds, readEdge, type Edge } from '../src/game/world/edges'
import { worldProblems } from '../src/game/world/invariants'
import { playerRef } from '../src/game/world/people'
import { socialOn } from '../src/game/world/social'
import { readWorld } from '../src/game/world/state'
import { deepFreeze } from './fuzz-kit'
import { makeCharacter, makeTestGame } from './helpers'
import { expectConserved } from './ledger-kit'
import { cast, socialGame } from './social-kit'

// The budget door, watched: every call of useFamilyAct is written down, and a test may close it for the reading ('will') only.
const gate = vi.hoisted(() => ({ calls: [] as string[], deny: false }))
vi.mock('../src/game/society/contract', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/game/society/contract')>()
  return {
    ...real,
    useFamilyAct: (g: GameState, source: Parameters<typeof real.useFamilyAct>[1]): boolean => {
      gate.calls.push(source)
      return gate.deny && source === 'will' ? false : real.useFamilyAct(g, source)
    },
  }
})

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8')

const ref = (p: Person) => personEntity(p)
const edgeOf = (g: GameState, a: Person, b: Person): Readonly<Edge> | null => readEdge(g, ref(a), ref(b))
const keysOf = (g: GameState): string[] => Object.keys(edgeMap(g)).filter((k) => !isSecretKey(k))
/** The edges between two NPCs: neither end is the player. */
const npcKeys = (g: GameState): string[] =>
  keysOf(g).filter((k) => {
    const at = k.indexOf('>')
    const me = playerRef(g)
    return k.slice(0, at) !== me && k.slice(at + 1) !== me
  })
const notices = (g: GameState): NoticeModal[] => g.queue.filter((m): m is NoticeModal => m.kind === 'notice')
const choices = (g: GameState): ChoiceModal[] => g.queue.filter((m): m is ChoiceModal => m.kind === 'choice')
const reading = (g: GameState): string => notices(g).find((m) => m.title === 'The Reading of the Will')?.text ?? ''
const famActs = (g: GameState): number => g.yearActions['fam.act'] ?? 0
const lowest = (...ids: string[]): string => [...ids].sort()[0]!

const EDGE_ROW = { t: 50, f: 50, r: 50, s: 0, o: 0, y: 2020, l: 2020 } as const
const BOUND_ROW = { ...EDGE_ROW, k: 'kin' } as const

// ---------------------------------------------------------------------------------------------------------------------
// A hand-made plan and the people around it

function blank(over: Partial<EstatePlan> = {}): EstatePlan {
  return { willed: true, heirIncluded: true, ways: 2, keepProperty: false, tax: 0, fees: 0, heirCash: 0, held: 0, charityCash: 0, cutOut: [], heirClaim: null, lines: [], carried: 0, pot: null, recipients: [], ...over }
}
const cutOf = (p: Person, anger: number, outcome: CutOut['outcome'] = ''): CutOut => ({ id: p.id, anger, filed: outcome !== '', outcome, award: 0 })
const sliceOf = (p: Person, pct: number): { id: string; pct: number } => ({ id: p.id, pct })

/** A stamped state of the heir at 50 with `kin` siblings (ages 40 and up), and the id the heir had before the hand-over. */
function hall(seed: number, kin: number, o: { stamped?: boolean } = {}): { n: GameState; sibs: Person[]; heirId: string } {
  const base = { age: 50, money: 1_000_000, countryId: 'us', firstName: 'Heir', residence: { status: 'renting' as const, rent: 0 } }
  const n = o.stamped === false ? makeTestGame(seed, base) : socialGame(seed, base)
  n.log = [{ age: 50, year: n.year, entries: [] }]
  const sibs: Person[] = []
  for (let i = 0; i < kin; i++) sibs.push(cast(n, 50, 'sibling', { age: 40 + (i % 20), countryId: 'us', money: 20_000, traits: ['kind', 'calm'] }))
  return { n, sibs, heirId: 'heir-before' }
}

// ---------------------------------------------------------------------------------------------------------------------
// 1. strifeEdges

describe('strifeEdges: who quarrels with whom', () => {
  it('writes cut > favored with s of at least 15 for an anger of 30, one way only, and nothing else about them', () => {
    const { n, sibs, heirId } = hall(1, 3)
    const [cut, f1, f2] = sibs as [Person, Person, Person]
    const hit = strifeEdges(n, blank({ cutOut: [cutOf(cut, 30)], recipients: [sliceOf(f1, 0.5), sliceOf(f2, 0.5)] }), heirId)
    expect(hit).toEqual({ a: cut.id, b: lowest(f1.id, f2.id), anger: 30 })
    for (const fav of [f1, f2]) {
      const e = edgeOf(n, cut, fav)!
      expect(e, `cut > ${fav.firstName}`).not.toBeNull()
      expect(e.s).toBe(15)
      expect({ t: e.t, f: e.f, r: e.r, o: e.o, y: e.y, l: e.l }).toEqual({ t: 50, f: 50, r: 50, o: 0, y: n.year, l: n.year })
      expect(edgeOf(n, fav, cut), 'the favored hold nothing against the cut').toBeNull()
    }
    expect(npcKeys(n)).toHaveLength(2)
    expect(edgeProblems(readWorld(n).edges, n.people, playerRef(n))).toEqual([])
  })

  it('sets s to round(anger / 2), and s = max(s, that): a stronger old resentment stays, a weaker one is raised, the rest of the edge is kept', () => {
    const { n, sibs, heirId } = hall(2, 3)
    const [cut, strong, weak] = sibs as [Person, Person, Person]
    const memory = formatMemory({ kind: 'cut_from_will', year: 2019, w: 2, by: 'ego' })
    expect(putEdge(n, edgeKey(ref(cut), ref(strong))!, { t: 30, f: 20, r: 40, s: 70, o: 5, y: 2015, l: 2024, k: 'kin', m: [memory] })).toBe(true)
    expect(putEdge(n, edgeKey(ref(cut), ref(weak))!, { t: 30, f: 20, r: 40, s: 5, o: 5, y: 2015, l: 2024 })).toBe(true)
    strifeEdges(n, blank({ cutOut: [cutOf(cut, 81)], recipients: [sliceOf(strong, 0.5), sliceOf(weak, 0.5)] }), heirId)
    expect(edgeOf(n, cut, strong)).toMatchObject({ s: 70, t: 30, f: 20, r: 40, o: 5, y: 2015, l: 2024, k: 'kin', m: [memory] })
    expect(edgeOf(n, cut, weak)).toMatchObject({ s: 41, t: 30, f: 20, r: 40, o: 5, y: 2015, l: 2024 })
  })

  it('puts a cold feud rung [1, year, 0] on the edge while fewer than 12 feuds are live, and that rung binds the edge', () => {
    const { n, sibs, heirId } = hall(3, 2)
    const [cut, fav] = sibs as [Person, Person]
    strifeEdges(n, blank({ cutOut: [cutOf(cut, 60)], recipients: [sliceOf(fav, 1)] }), heirId)
    const e = edgeOf(n, cut, fav)!
    expect(e.q).toEqual([1, n.year, 0])
    expect(e.s).toBe(30)
    expect(edgeLocalBound(e)).toBe(true)
    expect(liveFeuds(n)).toBe(1)
  })

  it('leaves a feud that is already there as it is: a rung 3 stays rung 3, and the count does not move', () => {
    const { n, sibs, heirId } = hall(4, 2)
    const [cut, fav] = sibs as [Person, Person]
    expect(putEdge(n, edgeKey(ref(cut), ref(fav))!, { ...EDGE_ROW, s: 10, q: [3, 2021, 7] })).toBe(true)
    strifeEdges(n, blank({ cutOut: [cutOf(cut, 60)], recipients: [sliceOf(fav, 1)] }), heirId)
    expect(edgeOf(n, cut, fav)).toMatchObject({ s: 30, q: [3, 2021, 7] })
    expect(liveFeuds(n)).toBe(1)
  })

  it('with 12 feuds live a strife edge gets s and no q; with 11 live, only the first edge gets the last rung', () => {
    for (const live of [12, 11]) {
      const { n, sibs, heirId } = hall(5, 3)
      const [cut, f1, f2] = sibs as [Person, Person, Person]
      for (let i = 0; i < live; i++) expect(putEdge(n, `person:x${i}>person:y${i}`, { ...EDGE_ROW, q: [1, 2020, 0] })).toBe(true)
      expect(liveFeuds(n)).toBe(live)
      strifeEdges(n, blank({ cutOut: [cutOf(cut, 80)], recipients: [sliceOf(f1, 0.5), sliceOf(f2, 0.5)] }), heirId)
      const edges = [edgeOf(n, cut, f1)!, edgeOf(n, cut, f2)!]
      expect(edges.map((e) => e.s)).toEqual([40, 40])
      expect(edges.filter((e) => e.q !== undefined)).toHaveLength(12 - live)
      expect(liveFeuds(n)).toBe(12)
      if (live === 12) for (const e of edges) expect(edgeLocalBound(e), 'an edge with only s is not bound at the edge alone').toBe(false)
    }
  })

  it('skips who it should: anger under 30, a won or settled contest, the heir (either end), the dead, a pet, a share under a quarter', () => {
    const { n, sibs, heirId } = hall(6, 10)
    const [calm, won, settled, lost, dead, pet, heirCut, small, edge, fav] = sibs as Person[] as [Person, Person, Person, Person, Person, Person, Person, Person, Person, Person]
    dead.alive = false
    pet.relation = 'pet'
    heirCut.id = heirId
    const cutOut = [cutOf(calm, 29), cutOf(won, 80, 'won'), cutOf(settled, 80, 'settled'), cutOf(lost, 80, 'lost'), cutOf(dead, 80), cutOf(pet, 80), cutOf(heirCut, 80), cutOf(edge, 30)]
    const recipients = [sliceOf(fav, 0.25), sliceOf(small, 0.2499), sliceOf(heirCut, 0.5), sliceOf(dead, 0.5), sliceOf(pet, 0.5)]
    strifeEdges(n, blank({ cutOut, recipients }), heirId)
    const made = npcKeys(n).sort()
    const want = [lost, edge].map((a) => edgeKey(ref(a), ref(fav))!).sort()
    expect(made).toEqual(want)
  })

  it('writes at most 3 edges for one person: the biggest shares first, ties by id', () => {
    const { n, sibs, heirId } = hall(7, 6)
    const [cut, a, b, c, d] = sibs as Person[] as [Person, Person, Person, Person, Person]
    strifeEdges(n, blank({ cutOut: [cutOf(cut, 70)], recipients: [sliceOf(a, 0.25), sliceOf(b, 0.25), sliceOf(c, 0.25), sliceOf(d, 0.25)] }), heirId)
    const four = [a, b, c, d].sort((x, y) => (x.id < y.id ? -1 : 1))
    expect(npcKeys(n).sort()).toEqual(four.slice(0, 3).map((f) => edgeKey(ref(cut), ref(f))!).sort())
    const { n: m, sibs: s2 } = hall(8, 5)
    const [cut2, p, q, r, t] = s2 as [Person, Person, Person, Person, Person]
    strifeEdges(m, blank({ cutOut: [cutOf(cut2, 70)], recipients: [sliceOf(p, 0.25), sliceOf(q, 0.3), sliceOf(r, 0.27), sliceOf(t, 0.26)] }), heirId)
    expect(npcKeys(m).sort()).toEqual([q, r, t].map((f) => edgeKey(ref(cut2), ref(f))!).sort())
  })

  it('leaves 36 edges for 100 cut-out relatives and 400 favored, 12 of them cold, for the strongest people by anger then id', () => {
    const { n, sibs, heirId } = hall(9, 104)
    const cutters = sibs.slice(0, 100)
    const favored = sibs.slice(100)
    // anger 30 to 99, so ties exist; the first ids of the strongest anger are the ones written about
    const cutOut = cutters.map((p, i) => cutOf(p, 30 + (i % 70)))
    const recipients = favored.map((p) => sliceOf(p, 0.25))
    const hit = strifeEdges(n, blank({ cutOut, recipients }), heirId)
    const keys = npcKeys(n)
    expect(keys).toHaveLength(STRIFE.total)
    expect(STRIFE.total).toBe(36)
    const per = new Map<string, number>()
    for (const k of keys) per.set(k.slice(0, k.indexOf('>')), (per.get(k.slice(0, k.indexOf('>'))) ?? 0) + 1)
    expect(per.size).toBe(12)
    expect([...per.values()].every((c) => c === 3)).toBe(true)
    expect(liveFeuds(n)).toBe(EDGE_CAPS.feuds)
    const want = [...cutOut].sort((x, y) => y.anger - x.anger || (x.id < y.id ? -1 : 1)).slice(0, 12)
    expect(new Set(per.keys())).toEqual(new Set(want.map((c) => `person:${c.id}`)))
    expect(hit!.anger).toBe(want[0]!.anger)
    expect(edgeProblems(readWorld(n).edges, n.people, playerRef(n))).toEqual([])
  })

  it('names the strongest pair: anger first, then the ids', () => {
    const { n, sibs, heirId } = hall(10, 5)
    const [weak, strong, twin, f1, f2] = sibs as [Person, Person, Person, Person, Person]
    const recipients = [sliceOf(f1, 0.5), sliceOf(f2, 0.5)]
    const hit = strifeEdges(n, blank({ cutOut: [cutOf(weak, 40), cutOf(strong, 70)], recipients }), heirId)
    expect(hit).toEqual({ a: strong.id, b: lowest(f1.id, f2.id), anger: 70 })
    const tie = strifeEdges(n, blank({ cutOut: [cutOf(twin, 70), cutOf(strong, 70)], recipients }), heirId)
    expect(tie).toEqual({ a: lowest(twin.id, strong.id), b: lowest(f1.id, f2.id), anger: 70 })
  })

  it('does nothing on a life that is not stamped: no edge, no world, null', () => {
    const { n, sibs, heirId } = hall(11, 3, { stamped: false })
    const before = JSON.stringify(n)
    const [cut, f1, f2] = sibs as [Person, Person, Person]
    expect(strifeEdges(n, blank({ cutOut: [cutOf(cut, 90)], recipients: [sliceOf(f1, 0.5), sliceOf(f2, 0.5)] }), heirId)).toBeNull()
    expect(JSON.stringify(n)).toBe(before)
    expect(n.world).toBeUndefined()
  })

  it('draws no dice and books no dollar, is the same twice, and the books still balance', () => {
    const { n, sibs, heirId } = hall(12, 4)
    const [cut, a, b, c] = sibs as [Person, Person, Person, Person]
    const plan = blank({ cutOut: [cutOf(cut, 66)], recipients: [sliceOf(a, 0.3), sliceOf(b, 0.3), sliceOf(c, 0.3)] })
    const rng = n.rng
    const nextId = n.nextId
    const cash = n.people.map((p) => p.money)
    const money = n.character.money
    strifeEdges(n, plan, heirId)
    const once = JSON.stringify(n)
    strifeEdges(n, plan, heirId)
    expect(JSON.stringify(n)).toBe(once)
    expect(n.rng).toBe(rng)
    expect(n.nextId).toBe(nextId)
    expect(n.people.map((p) => p.money)).toEqual(cash)
    expect(n.character.money).toBe(money)
    expectConserved(n)
  })

  it('refuses quietly when the map is full of bound edges, and evicts a loose edge, never a bound one, when it is not', () => {
    const full = hall(13, 3)
    const [cut, fav] = full.sibs as [Person, Person, Person]
    for (let i = 0; i < EDGE_CAPS.edges; i++) expect(putEdge(full.n, `person:b${i}>person:c${i}`, BOUND_ROW)).toBe(true)
    const before = JSON.stringify(readWorld(full.n).edges)
    expect(strifeEdges(full.n, blank({ cutOut: [cutOf(cut, 80)], recipients: [sliceOf(fav, 1)] }), full.heirId)).toBeNull()
    expect(JSON.stringify(readWorld(full.n).edges)).toBe(before)

    const loose = hall(14, 3)
    const [cut2, fav2] = loose.sibs as [Person, Person, Person]
    for (let i = 0; i < EDGE_CAPS.edges - 1; i++) expect(putEdge(loose.n, `person:b${i}>person:c${i}`, BOUND_ROW)).toBe(true)
    expect(putEdge(loose.n, 'person:z1>person:z2', EDGE_ROW)).toBe(true)
    expect(strifeEdges(loose.n, blank({ cutOut: [cutOf(cut2, 80)], recipients: [sliceOf(fav2, 1)] }), loose.heirId)).not.toBeNull()
    expect(readEdge(loose.n, 'person:z1', 'person:z2')).toBeNull()
    expect(keysOf(loose.n)).toHaveLength(EDGE_CAPS.edges)
    expect(edgeOf(loose.n, cut2, fav2)).not.toBeNull()
  })
})

describe('strifeEdges: a hostile plan', () => {
  it('survives anything a plan can hold and writes only what is sane', () => {
    const { n, sibs, heirId } = hall(20, 6)
    const [cut, a, b, pet, c, d] = sibs as [Person, Person, Person, Person, Person, Person]
    pet.relation = 'pet'
    const junk: unknown[] = [null, undefined, 7, 'x', [], {}, { id: 5, anger: 80 }, { id: cut.id }, { id: cut.id, anger: 'high' }, { id: 'nobody', anger: 90 }]
    const cutOut = [...junk, cutOf(cut, Number.NaN), cutOf(a, Number.POSITIVE_INFINITY), cutOf(b, -50), cutOf(pet, 80), cutOf(c, 1e300), cutOf(c, 40), cutOf(d, 60)]
    const recipients = [...junk, sliceOf(a, Number.NaN), sliceOf(b, -1), sliceOf(d, 2), { id: d.id, pct: '0.9' }, sliceOf(c, 0.4), sliceOf(c, 0.4)]
    const plan = deepFreeze(blank({ cutOut: cutOut as CutOut[], recipients: recipients as EstatePlan['recipients'] }))
    expect(() => strifeEdges(n, plan, heirId)).not.toThrow()
    // c (anger 1e300 cut to 100: s 50) and d (60: s 30) write to the finite shares at or over a quarter; a, b, pet and cut write nothing
    const keys = npcKeys(n).sort()
    expect(keys).toEqual([edgeKey(ref(c), ref(d))!, edgeKey(ref(d), ref(c))!].sort())
    expect(edgeOf(n, c, d)!.s).toBe(50)
    expect(edgeOf(n, d, c)!.s).toBe(30)
    for (const e of Object.values(edgeMap(n) as Record<string, Edge>)) expect(Number.isFinite(e.s) && e.s >= 0 && e.s <= 100).toBe(true)
  })

  it('reads a plan with no lists, a heir id that is no text, a year that is no year, and a deep-frozen state, without a throw', () => {
    const { n, sibs } = hall(21, 3)
    const [cut, f1] = sibs as [Person, Person]
    expect(strifeEdges(n, {} as EstatePlan, 'x')).toBeNull()
    expect(strifeEdges(n, null as unknown as EstatePlan, 'x')).toBeNull()
    expect(strifeEdges(n, blank({ cutOut: 'no' as unknown as CutOut[], recipients: 7 as unknown as EstatePlan['recipients'] }), 'x')).toBeNull()
    const plan = blank({ cutOut: [cutOf(cut, 80)], recipients: [sliceOf(f1, 1)] })
    expect(() => strifeEdges(n, plan, 5 as unknown as string)).not.toThrow()
    expect(npcKeys(n)).toHaveLength(1)
    const bad = hall(22, 2)
    bad.n.year = Number.NaN
    expect(strifeEdges(bad.n, blank({ cutOut: [cutOf(bad.sibs[0]!, 80)], recipients: [sliceOf(bad.sibs[1]!, 1)] }), bad.heirId)).toBeNull()
    expect(npcKeys(bad.n)).toHaveLength(0)
  })

  it('does a bounded amount of work for a plan 100 times the size: 40,000 entries a side leave at most 36 edges', () => {
    const { n, sibs, heirId } = hall(23, 8)
    const cutters = sibs.slice(0, 4)
    const favored = sibs.slice(4)
    const cutOut: CutOut[] = []
    const recipients: { id: string; pct: number }[] = []
    for (let i = 0; i < 40_000; i++) {
      cutOut.push(cutOf(cutters[i % cutters.length]!, 30 + (i % 70)))
      recipients.push(sliceOf(favored[i % favored.length]!, 0.25))
    }
    const t0 = Date.now()
    strifeEdges(n, blank({ cutOut, recipients }), heirId)
    expect(Date.now() - t0).toBeLessThan(2000)
    expect(npcKeys(n).length).toBeLessThanOrEqual(STRIFE.total)
    expect(npcKeys(n).length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 2. planEstate: recipients

interface House {
  g: GameState
  heir: Person
  s1: Person
  s2: Person
  s3: Person
}

/** The late player of 78 with $6M and four grown children: the heir (50), and three siblings (47, 44, 41). Everything is given, so nothing draws. */
function house(seed: number, o: { stamped: boolean; money?: number }): House {
  const base = { age: 78, money: o.money ?? 6_000_000, countryId: 'us', gender: 'male' as const, residence: { status: 'renting' as const, rent: 0 } }
  const g = o.stamped ? socialGame(seed, base) : makeTestGame(seed, base)
  g.log = [{ age: 78, year: g.year, entries: [] }]
  const kid = (age: number, traits: string[]): Person => cast(g, 70, 'child', { age, countryId: 'us', money: 20_000, traits })
  return { g, heir: kid(50, ['kind', 'calm']), s1: kid(47, ['kind', 'calm']), s2: kid(44, ['funny', 'outgoing']), s3: kid(41, ['calm']) }
}

/** Anger the person felt on learning, as the reading uses it (a known record, so it is not worked out again). */
function angry(g: GameState, p: Person, anger: number): void {
  updateWl(g, p, (w) => {
    w.known = true
    w.how = 'leak'
    w.told = 'out'
    w.anger = anger
  })
}

/** A will that names `who` (equal shares) and leaves the rest of the children out. */
function will(g: GameState, who: Person[], charity = 0): void {
  changeWill(g, (gg, w) => {
    gg.character.willBeneficiaries = who.map((p) => p.id)
    w.shares = {}
    w.charity = charity
  })
  g.queue = []
}

const planOf = (g: GameState, heir: Person): EstatePlan => {
  const n = structuredClone(g)
  return planEstate(n, { estate: n.character.money, heirId: heir.id, adult: heir.age >= 18, hasProperty: false, cashAfterDebts: n.character.money })
}

describe('planEstate: plan.recipients', () => {
  it('lists the slices of the people other than the heir on a stamped life: no charity, no heir, no empty slice', () => {
    const f = house(30, { stamped: true })
    will(f.g, [f.s1, f.s2])
    const plan = planOf(f.g, f.heir)
    expect(plan.recipients).toHaveLength(2)
    expect(plan.recipients.map((r) => r.id).sort()).toEqual([f.s1.id, f.s2.id].sort())
    for (const r of plan.recipients) expect(r.pct).toBeCloseTo(0.5)
    // the heir is in the will, a charity takes a fifth: the recipients are the siblings, the heir's own slice is left out
    const g2 = house(31, { stamped: true })
    will(g2.g, [g2.heir, g2.s1, g2.s2], 20)
    const two = planOf(g2.g, g2.heir)
    expect(two.recipients.map((r) => r.id).sort()).toEqual([g2.s1.id, g2.s2.id].sort())
    for (const r of two.recipients) expect(r.pct).toBeCloseTo(0.8 / 3)
    expect(two.recipients.every((r) => r.id !== CHARITY && r.id !== g2.heir.id && Number.isFinite(r.pct) && r.pct > 0)).toBe(true)
  })

  it('is empty on a life that is not stamped, and for an heir who is the only one named', () => {
    const f = house(32, { stamped: false })
    will(f.g, [f.s1, f.s2])
    expect(planOf(f.g, f.heir).recipients).toEqual([])
    const sole = house(33, { stamped: true })
    will(sole.g, [sole.heir])
    expect(planOf(sole.g, sole.heir).recipients).toEqual([])
    expect(readWill(sole.g).written).toBe(true)
  })

  it('does not change a thing about the money: a stamped plan and an unstamped twin pay the same', () => {
    for (const seed of [34, 35, 36]) {
      const a = house(seed, { stamped: true })
      const b = house(seed, { stamped: false })
      for (const f of [a, b]) {
        will(f.g, [f.s1, f.s2])
        angry(f.g, f.s3, 35)
        angry(f.g, f.heir, 60)
      }
      const pa = planOf(a.g, a.heir)
      const pb = planOf(b.g, b.heir)
      expect({ ...pa, recipients: [] }).toEqual({ ...pb, recipients: [] })
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 3. settleReading on a hand-made hall

describe('settleReading: the line, the slot and the unstamped life', () => {
  const old = makeCharacter({ gender: 'male', firstName: 'Old', lastName: 'Man', age: 80 })
  interface Reading {
    n: GameState
    plan: EstatePlan
    cut: Person
    favored: Person[]
    /** The sources useFamilyAct was asked for during the reading. */
    calls: string[]
  }

  /** A reading where the heir is favored and one cut-out sibling is angry enough to ask. */
  function asking(stamped: boolean): Reading {
    const { n, sibs, heirId } = hall(40, 3, { stamped })
    const [cut, f1, f2] = sibs as [Person, Person, Person]
    const plan = blank({ heirCash: 900_000, cutOut: [cutOf(cut, 80)], recipients: [sliceOf(f1, 0.4), sliceOf(f2, 0.4)] })
    n.queue = []
    gate.calls = []
    settleReading(n, plan, old, heirId)
    return { n, plan, cut, favored: [f1, f2], calls: [...gate.calls] }
  }

  /** A reading where the heir was cut out and presses a claim, with one more sibling cut out and angry. */
  function claiming(stamped: boolean): Reading {
    const { n, sibs, heirId } = hall(41, 3, { stamped })
    const [cut, f1, f2] = sibs as [Person, Person, Person]
    const back = [sliceOf(f1, 0.5), sliceOf(f2, 0.5)]
    const plan = blank({
      heirIncluded: false,
      cutOut: [{ id: heirId, anger: 60, filed: false, outcome: '', award: 0 }, cutOf(cut, 35)],
      heirClaim: { claim: 100_000, odds: 0.3, fee: 5_000 },
      pot: { claim: 100_000, odds: 0.3, year: 0, back },
      recipients: back,
    })
    n.queue = []
    gate.calls = []
    settleReading(n, plan, old, heirId)
    return { n, plan, cut, favored: [f1, f2], calls: [...gate.calls] }
  }

  it('says one more line in the notice for the strongest pair: it names both, is in the pool and is 90 characters or less', () => {
    const { n, cut, favored } = asking(true)
    const text = reading(n)
    const paragraphs = text.split('\n\n')
    const b = lowest(favored[0]!.id, favored[1]!.id) === favored[0]!.id ? favored[0]! : favored[1]!
    const lines = KIN_STRIFE.map((l) => fillSlots(l, { who: cut.firstName, whom: b.firstName }))
    const hits = paragraphs.filter((p) => lines.includes(p))
    expect(hits, `one line of the pool in\n${text}`).toHaveLength(1)
    expect(hits[0]!.length).toBeLessThanOrEqual(90)
    expect(hits[0]).toContain(cut.firstName)
    expect(hits[0]).toContain(b.firstName)
    // and the notice says it once, after the reaction of the person it is about
    expect(text.indexOf(hits[0]!)).toBeGreaterThan(text.indexOf(`${cut.firstName} `))
  })

  it('writes the edges the line is about, from the same hall', () => {
    const { n, cut, favored } = asking(true)
    for (const fav of favored) expect(edgeOf(n, cut, fav)).toMatchObject({ s: 40, q: [1, n.year, 0] })
  })

  it('spends exactly one family choice when the reading asks: S_ASK for a favored heir, S_HEIR for a cut one, nothing for neither', () => {
    const ask = asking(true)
    expect(choices(ask.n).map((m) => m.scriptId)).toEqual([S_ASK])
    expect(famActs(ask.n)).toBe(1)
    expect(ask.calls).toEqual(['will'])

    const claim = claiming(true)
    expect(choices(claim.n).map((m) => m.scriptId)).toEqual([S_HEIR])
    expect(famActs(claim.n)).toBe(1)
    expect(claim.calls).toEqual(['will'])

    // neither: a cut-out sibling too calm to ask and an heir who is not cut
    const { n, sibs, heirId } = hall(42, 3)
    const [cut, f1] = sibs as [Person, Person, Person]
    gate.calls = []
    settleReading(n, blank({ heirCash: 900_000, cutOut: [cutOf(cut, 35)], recipients: [sliceOf(f1, 0.5)] }), old, heirId)
    expect(choices(n)).toEqual([])
    expect(famActs(n)).toBe(0)
    expect(gate.calls).toEqual([])
    expect(reading(n)).not.toBe('')
  })

  it('never queues both choices, and takes the one slot before either', () => {
    for (const make of [asking, claiming]) {
      const { n } = make(true)
      const ids = choices(n).map((m) => m.scriptId)
      expect(ids.filter((id) => id === S_ASK || id === S_HEIR)).toHaveLength(1)
    }
  })

  it('on a life that is not stamped reads the will as it always did: the new input is ignored, no edge, no line, no slot taken', () => {
    for (const make of [asking, claiming]) {
      const free = make(false)
      expect(socialOn(free.n)).toBe(false)
      expect(keysOf(free.n)).toEqual([])
      expect(famActs(free.n)).toBe(0)
      expect(free.n.yearActions).toEqual({})
      const text = reading(free.n)
      for (const l of KIN_STRIFE) for (const fav of free.favored) expect(text).not.toContain(fillSlots(l, { who: free.cut.firstName, whom: fav.firstName }))
      // the same hall with no recipients at all: the same state, byte for byte, and the same queue
      const { n, sibs, heirId } = hall(make === asking ? 40 : 41, 3, { stamped: false })
      const [cut] = sibs as [Person, Person, Person]
      const plan = make === asking ? blank({ heirCash: 900_000, cutOut: [cutOf(cut, 80)] }) : blank({ heirIncluded: false, cutOut: [{ id: heirId, anger: 60, filed: false, outcome: '', award: 0 }, cutOf(cut, 35)], heirClaim: { claim: 100_000, odds: 0.3, fee: 5_000 }, pot: { claim: 100_000, odds: 0.3, year: 0, back: [sliceOf(sibs[1]!, 0.5), sliceOf(sibs[2]!, 0.5)] } })
      n.queue = []
      settleReading(n, plan, old, heirId)
      expect(JSON.stringify(n)).toBe(JSON.stringify(free.n))
      expect(choices(n).map((m) => m.kind + (m.scriptId ?? ''))).toEqual(choices(free.n).map((m) => m.kind + (m.scriptId ?? '')))
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 4. A real hand-over

function die(g: GameState): void {
  killCharacter(g, 'Old Age')
  g.queue = g.queue.filter((m) => m.kind !== 'aiTask')
}

/** The family of section 2 with a will: `heirCut` leaves the heir out (anger 60) and names two siblings; else the heir is named too. s3 is out, at `anger`. */
function over(seed: number, o: { stamped: boolean; heirCut: boolean; anger?: number; traits?: string[] }): { n: GameState; f: House } {
  const f = house(seed, { stamped: o.stamped, money: 24_000_000 })
  if (o.traits) f.s3.traits = o.traits
  will(f.g, o.heirCut ? [f.s1, f.s2] : [f.heir, f.s1, f.s2])
  angry(f.g, f.s3, o.anger ?? 35)
  if (o.heirCut) angry(f.g, f.heir, 60)
  f.g.queue = []
  die(f.g)
  gate.calls = []
  const n = continueAsChild(f.g, f.heir.id)
  expect(n, 'the hand-over must happen').not.toBe(f.g)
  return { n, f }
}

describe('a real hand-over: an heir cut out, three siblings, two favored and one cut', () => {
  it('writes cut > favored with s of at least 15, says so in one line that names both, and takes one slot for the heir\'s choice', () => {
    const { n, f } = over(50, { stamped: true, heirCut: true })
    const s3 = n.people.find((p) => p.id === f.s3.id)!
    const favored = [f.s1, f.s2].map((p) => n.people.find((x) => x.id === p.id)!)
    for (const fav of favored) {
      const e = edgeOf(n, s3, fav)!
      expect(e, `s3 > ${fav.firstName}`).not.toBeNull()
      expect(e.s).toBeGreaterThanOrEqual(15)
      expect(e.s).toBe(18)
      expect(e.q).toEqual([1, n.year, 0])
      expect(edgeOf(n, fav, s3)).toBeNull()
    }
    // between NPCs there is nothing else: the heir is not in a strife edge (the heir is the player now)
    expect(npcKeys(n).sort()).toEqual(favored.map((p) => edgeKey(ref(s3), ref(p))!).sort())
    const b = lowest(f.s1.id, f.s2.id) === f.s1.id ? f.s1 : f.s2
    const mine = KIN_STRIFE.map((l) => fillSlots(l, { who: s3.firstName, whom: b.firstName }))
    const hits = reading(n).split('\n\n').filter((p) => mine.includes(p))
    expect(hits).toHaveLength(1)
    expect(hits[0]!.length).toBeLessThanOrEqual(90)
    expect(choices(n).map((m) => m.scriptId)).toEqual([S_HEIR])
    expect(famActs(n)).toBe(1)
    expect(gate.calls.filter((s) => s === 'will')).toEqual(['will'])
    expect(edgeProblems(readWorld(n).edges, n.people, playerRef(n))).toEqual([])
    expect(worldProblems(n).filter((p) => /edge/i.test(p))).toEqual([])
    expectConserved(n)
  })

  it('a favored heir gets S_ASK from an angry cut-out sibling: one slot, and the strife edges are there too', () => {
    let seen = 0
    for (let seed = 60; seed < 100 && seen < 2; seed++) {
      const { n, f } = over(seed, { stamped: true, heirCut: false, anger: 80, traits: ['hot-headed', 'arrogant'] })
      const ask = choices(n).find((m) => m.scriptId === S_ASK)
      if (!ask) continue
      seen += 1
      expect(choices(n).map((m) => m.scriptId)).toEqual([S_ASK])
      expect(famActs(n)).toBe(1)
      expect(gate.calls.filter((s) => s === 'will')).toEqual(['will'])
      const s3 = n.people.find((p) => p.id === f.s3.id)!
      expect(edgeOf(n, s3, n.people.find((p) => p.id === f.s1.id)!)!.s).toBe(40)
      expect(edgeOf(n, s3, n.people.find((p) => p.id === f.s2.id)!)!.s).toBe(40)
    }
    expect(seen, 'an angry sibling must ask in some of 40 seeds').toBeGreaterThan(0)
  })

  it('the same family on a life that is not stamped: no edge, no slot, the same choice', () => {
    const stamped = over(50, { stamped: true, heirCut: true })
    const free = over(50, { stamped: false, heirCut: true })
    expect(socialOn(free.n)).toBe(false)
    expect(keysOf(free.n)).toEqual([])
    expect(famActs(free.n)).toBe(0)
    expect(choices(free.n).map((m) => m.scriptId)).toEqual(choices(stamped.n).map((m) => m.scriptId))
    const s3 = free.n.people.find((p) => p.id === free.f.s3.id)!
    for (const l of KIN_STRIFE) for (const p of [free.f.s1, free.f.s2]) expect(reading(free.n)).not.toContain(fillSlots(l, { who: s3.firstName, whom: p.firstName }))
  })

  it('is the same twice, from a clone and after a reload', () => {
    const a = over(51, { stamped: true, heirCut: true })
    const b = over(51, { stamped: true, heirCut: true })
    expect(JSON.stringify(a.n)).toBe(JSON.stringify(b.n))
    expect(JSON.stringify(structuredClone(a.n))).toBe(JSON.stringify(a.n))
    expect(JSON.parse(JSON.stringify(a.n))).toEqual(JSON.parse(JSON.stringify(b.n)))
    expect(npcKeys(a.n)).toEqual(npcKeys(b.n))
  })

  it('leaves the will ladder alone: the cut-out sibling\'s record is the one the reading wrote, and the strife edge adds no memory', () => {
    const { n, f } = over(52, { stamped: true, heirCut: true })
    const s3 = n.people.find((p) => p.id === f.s3.id)!
    const e = edgeOf(n, s3, n.people.find((p) => p.id === f.s1.id)!)!
    expect(e.m).toBeUndefined()
    expect(e.k).toBeUndefined()
    expect(e.dv).toBeUndefined()
  })

  it('counts toward the 12 feuds: with 12 already live the hand-over writes s and no rung', () => {
    const f = house(53, { stamped: true, money: 24_000_000 })
    for (let i = 0; i < 12; i++) expect(putEdge(f.g, `person:x${i}>person:y${i}`, { ...EDGE_ROW, q: [1, 2020, 0] })).toBe(true)
    will(f.g, [f.s1, f.s2])
    angry(f.g, f.s3, 35)
    angry(f.g, f.heir, 60)
    f.g.queue = []
    die(f.g)
    const n = continueAsChild(f.g, f.heir.id)
    const s3 = n.people.find((p) => p.id === f.s3.id)!
    const e = edgeOf(n, s3, n.people.find((p) => p.id === f.s1.id)!)!
    expect(e.s).toBe(18)
    expect(e.q).toBeUndefined()
    expect(liveFeuds(n)).toBe(12)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 5. No slot left

describe('a family with no slot left for the reading', () => {
  const sum = (g: GameState): number[] => g.people.map((p) => p.money)

  it('does not ask, and the claim the heir would have pressed goes back to the relatives it was taken from', () => {
    gate.deny = true
    let denied: GameState
    let f: House
    try {
      const run = over(54, { stamped: true, heirCut: true })
      denied = run.n
      f = run.f
    } finally {
      gate.deny = false
    }
    expect(choices(denied).map((m) => m.scriptId)).toEqual([])
    expect(famActs(denied)).toBe(0)
    expect(denied.flags['will.pot']).toBeUndefined()
    expectConserved(denied)
    // the strife is still there and the notice still says it: only the question is dropped
    const s3 = denied.people.find((p) => p.id === f.s3.id)!
    expect(edgeOf(denied, s3, denied.people.find((p) => p.id === f.s1.id)!)).not.toBeNull()
    expect(reading(denied)).not.toBe('')

    // the same family with the slot open, and the heir lets it go: the siblings and the heir hold what they held without the question
    const open = over(54, { stamped: true, heirCut: true })
    expect(choices(open.n).map((m) => m.scriptId)).toEqual([S_HEIR])
    expect(open.n.flags['will.pot']).toBeTruthy()
    const m = choices(open.n)[0]!
    open.n.queue = open.n.queue.filter((x) => x !== m)
    runScript(open.n, m.scriptId!, 'drop', m.data, m)
    expect(open.n.flags['will.pot']).toBeUndefined()
    expect(sum(denied)).toEqual(sum(open.n))
    expect(denied.character.money).toBe(open.n.character.money)
    expectConserved(open.n)
  })

  it('and an asker who finds no slot is not asked: the heir keeps what the will gave, and the quarrel is still written', () => {
    for (let seed = 60; seed < 100; seed++) {
      const open = over(seed, { stamped: true, heirCut: false, anger: 80, traits: ['hot-headed', 'arrogant'] })
      if (!choices(open.n).some((m) => m.scriptId === S_ASK)) continue
      gate.deny = true
      try {
        const shut = over(seed, { stamped: true, heirCut: false, anger: 80, traits: ['hot-headed', 'arrogant'] })
        expect(choices(shut.n)).toEqual([])
        expect(famActs(shut.n)).toBe(0)
        expect(shut.n.character.money).toBe(open.n.character.money)
        const s3 = shut.n.people.find((p) => p.id === shut.f.s3.id)!
        expect(edgeOf(shut.n, s3, shut.n.people.find((p) => p.id === shut.f.s1.id)!)!.s).toBe(40)
      } finally {
        gate.deny = false
      }
      return
    }
    throw new Error('an angry sibling never asked in 40 seeds')
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 6. The files

describe('the files of the task', () => {
  const strife = read('src/game/events/will-strife.ts')
  const estate = read('src/game/events/will-estate.ts')
  const pools = read('src/game/text/pools.ts')
  const LONG_DASHES = new RegExp(`[${String.fromCharCode(0x2014)}${String.fromCharCode(0x2013)}]`)

  it('will-strife.ts reaches society only through its one door, and nothing in it is a long dash', () => {
    expect(strife).not.toMatch(LONG_DASHES)
    expect(strife).not.toMatch(/from '\.\.\/society\/(?!contract')/)
    expect(strife).not.toMatch(/from '\.\.\/(business|shops|life|love|relationships)/)
  })

  it('will-estate.ts imports the budget from society/contract.ts and no other society file', () => {
    const societies = [...estate.matchAll(/from '\.\.\/society\/([a-z-]+)'/g)].map((m) => m[1])
    expect(societies).toEqual(['contract'])
    expect(estate).toMatch(/useFamilyAct\(n, 'will'\)/)
    expect(estate).toMatch(/from '\.\/will-strife'/)
    expect(estate).not.toMatch(LONG_DASHES)
  })

  it('KIN_STRIFE is a pool of at least 5 lines with the two slots, short enough for any first name, and has no long dash', () => {
    expect(pools).toMatch(/export const KIN_STRIFE = defineLines\('life\.kinStrife'/)
    expect(KIN_STRIFE.length).toBeGreaterThanOrEqual(5)
    const name = 'N'.repeat(24)
    for (const line of KIN_STRIFE) {
      expect(line, line).toContain('{who}')
      expect(line, line).toContain('{whom}')
      expect(line).not.toMatch(LONG_DASHES)
      expect(fillSlots(line, { who: name, whom: name }).length, line).toBeLessThanOrEqual(90)
    }
  })

  it('strifeLine names the pair, trims a long name, and says nothing about people who are gone', () => {
    const { n, sibs } = hall(70, 2)
    const [a, b] = sibs as [Person, Person]
    a.firstName = 'A'.repeat(60)
    const line = strifeLine(n, { a: a.id, b: b.id })!
    expect(line.length).toBeLessThanOrEqual(90)
    expect(line).toContain(b.firstName)
    expect(strifeLine(n, { a: a.id, b: 'nobody' })).toBeNull()
    expect(strifeLine(n, { a: 'nobody', b: b.id })).toBeNull()
  })
})
