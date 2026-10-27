// R4-E11 part A (D.4, X27, X29, X5, C39; section 3.1 "Acts, secrets, feuds, staff"): secrets and gossip. A secret is a record under
// 'secret:<n>' in the edges map ({ a, k, v, h, y, p? }, cap 40, 6 holders), written by society/secret.ts through the one writer of the
// map (world/edge-write.ts putSecret). Once a year, inside the one `society.acts` entry, each holder of a secret rolls to leak it;
// the first to do so tells at most 2 people (the holder's best-liked contacts) and each of those at most 1 more, then it stops (hop cap
// 2). Everyone told gets `gossiped_about_me` and a relationship hit of 3 x severity as an offence; the player is told once by the
// notice `Word Got Around`; the fact `social.leak` goes on the bus. A secret leaks at most once: the leak sets `p`.
//
//   1. The record: addSecret writes it, the cap is 40 (the 41st is refused), holders are 6 at most, a hostile record reads as none.
//   2. The spread: hop count never above 2 in 10,000 simulated leaks, at most 4 people told, each at most once.
//   3. The odds: 0.02 + 0.10 x resentment + 0.06 x (1 - honesty) + a temper term; an honest holder with no grudge leaks under 3% a year.
//   4. The pass: who is told and what it costs them, one leak each over 50 years, the bound on what a person can lose in a year.
//   5. The fact, the notice and the log line; the module declares `social.leak`.
//   6. Purity, text and the files.
//
// The mentor (social-mentor.test.ts), betrayal and reconciliation (social-reconcile.test.ts) are part B of the same task and are written
// red first in their own files.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { registeredFacts } from '../src/game/kernel/registry'
import { loadGame, saveGame } from '../src/game/save'
import { memorySaveBackend } from '../src/game/save-backends'
import { resetSaveStoreForTests, setSaveBackend } from '../src/game/save-store'
import { personEntity, personKey } from '../src/game/kernel/person-ref'
import '../src/game/modules/index'
import { actRoll } from '../src/game/society/acts'
import { acquainted } from '../src/game/society/favor'
import { HOP_CAP, MAX_TOLD, TELLS, contactsOf, spread } from '../src/game/society/gossip'
import { societyModule, yearlyActs } from '../src/game/society/module'
import { honestyOf } from '../src/game/society/seam'
import { HOLDER_CAP, LEAK, SECRET_CAP, addSecret, leakOdds, leakPass, leakSeverity, readSecret, secretsOf } from '../src/game/society/secret'
import { LEAK_LINES } from '../src/game/text/pools'
import type { EntityRef } from '../src/game/kernel/ids'
import { EDGE_CAPS } from '../src/game/world/caps'
import { edgeProblems, memoriesOf, normalizeEdges, readEdge, readSecrets, type Edge, type SecretRecord } from '../src/game/world/edges'
import { putEdge, putSecret } from '../src/game/world/edge-write'
import { readFacts } from '../src/game/world/facts'
import { readMet, writeMet } from '../src/game/world/met'
import type { AxisTuple } from '../src/game/world/axes'
import { makeSid } from '../src/game/world/sid'
import { busStats, resetBusStats } from '../src/game/kernel/bus'
import { worldProblems } from '../src/game/world/invariants'
import { playerRef } from '../src/game/world/people'
import type { GameState, Person } from '../src/game/types'
import { deepFreeze, installStorageShim } from './fuzz-kit'
import { cast, socialGame, socialLife } from './social-kit'
import { trapRng } from './social-parity-kit'

/** [seed, year] of the one life the save round trip plays (a constant tuple, X30: no new seed pin). */
const LIFE = [5, 1990] as const

const ROOT = resolve(__dirname, '..')
const src = (file: string): string => readFileSync(resolve(ROOT, file), 'utf8')
const json = (g: GameState): string => JSON.stringify(g)

// ---------------------------------------------------------------------------------------------------------------------
// Helpers

const HONEST = ['honest', 'religious', 'kind', 'nerdy', 'loyal'] as const
const LIAR = ['sneaky', 'manipulative', 'jealous'] as const

/** A stamped adult with `n` friends (they all know each other: one circle). */
function circle(n: number, seed = 1): { g: GameState; list: Person[] } {
  const g = socialGame(seed, { age: 30 })
  const list: Person[] = []
  for (let i = 0; i < n; i++) list.push(cast(g, 70, 'friend'))
  return { g, list }
}

const ref = (p: Person): EntityRef => personEntity(p)
const toPlayer = (g: GameState, p: Person): string => `${ref(p)}>${playerRef(g)}`
const edgeOf = (g: GameState, p: Person): Readonly<Edge> | null => readEdge(g, ref(p), playerRef(g))

function setEdge(g: GameState, p: Person, over: Partial<Edge> = {}): void {
  if (!putEdge(g, toPlayer(g, p), { t: 60, f: p.relationship, r: 50, s: 0, o: 0, y: g.year, l: g.year, ...over })) throw new Error('setEdge refused')
}

/** An edge between two other people: how much `from` likes `to`. */
function like(g: GameState, from: Person, to: Person, f: number): void {
  if (!putEdge(g, `${ref(from)}>${ref(to)}`, { t: 50, f, r: 50, s: 0, o: 0, y: g.year, l: g.year })) throw new Error('like refused')
}

/** Gives a person the axes of a record of the Met shard (ambition, honesty, empathy, risk, steadiness): the only way to reach honesty 100, since the words of a person are cut to 5..95. */
function withAxes(g: GameState, p: Person, a: AxisTuple): void {
  p.data.sid = makeSid({ kind: 'frn', place: 'us', cohort: 1995, ord: Number(p.id.slice(1)) })
  writeMet(g, { ...readMet(g), [personKey(p)]: { f: 'Ines', l: 'Okafor', g: 0, b: 1995, c: 'us', k: 0, a, y: g.year, s: g.year, w: 0, fl: 0, gr: 0, ob: 0 } })
}

/** The next year, with the year step that the module runs. */
function nextYear(g: GameState): void {
  g.year += 1
  yearlyActs(g)
}

/** A lifeId whose stream `social` gives the roll the test needs. Scans, so no seed is pinned. */
function lifeWhere(pred: (lifeId: string) => boolean): string {
  for (let i = 1; i < 6000; i++) if (pred(`life-${i}`)) return `life-${i}`
  throw new Error('no life found')
}

const rollOf = (g: GameState, lifeId: string, id: string, holder: Person): number => actRoll({ lifeId, flags: g.flags, year: g.year }, 'leak', `${id}|${ref(holder)}`)()

/** Sets g.lifeId so that `holder` surely leaks `id` this year (the roll is under the 0.02 floor of the odds). */
function makeLeak(g: GameState, id: string, holder: Person): void {
  g.lifeId = lifeWhere((l) => rollOf(g, l, id, holder) < LEAK.base)
}

/** A secret about the player, held by `holders`, begun last year (so it can leak this year). */
function plant(g: GameState, holders: Person[], v = 3, kind: SecretRecord['k'] = 'affair'): string {
  g.year -= 1
  const id = addSecret(g, playerRef(g), kind, v, holders)
  g.year += 1
  if (id === null) throw new Error('addSecret refused')
  return id
}

const hitOf = (p: Person, before: number): number => before - p.relationship
const told = (g: GameState): Person[] => g.people.filter((p) => memoriesOf(edgeOf(g, p) ?? ({} as Edge)).some((m) => m.kind === 'gossiped_about_me'))

// ---------------------------------------------------------------------------------------------------------------------
// 1. The record

describe('a secret', () => {
  it('is written under secret:<n> with its about, kind, severity, holders and the year it began, and no leak year', () => {
    const { g, list } = circle(4)
    const id = addSecret(g, playerRef(g), 'affair', 4, [list[0]!, ref(list[1]!)])
    expect(id).toBe('secret:1')
    const s = readSecret(g, id!)!
    expect(s).toEqual({ a: playerRef(g), k: 'affair', v: 4, h: [ref(list[0]!), ref(list[1]!)], y: g.year })
    expect('p' in s).toBe(false)
    expect(Object.isFrozen(s)).toBe(true)
    expect(Object.isFrozen(s.h)).toBe(true)
    expect(secretsOf(g)).toEqual([{ id: 'secret:1', n: 1, secret: s }])
    expect(readSecrets(g)).toEqual([['secret:1', s]])
    expect(worldProblems(g)).toEqual([])
  })

  it('takes the next number after the largest one held, and the list is in number order (2 before 10)', () => {
    const { g, list } = circle(3)
    const mk = (n: number): void => void expect(putSecret(g, `secret:${n}`, { a: playerRef(g), k: 'affair', v: 1, h: [ref(list[0]!)], y: g.year })).toBe(true)
    mk(10)
    mk(2)
    mk(1)
    expect(secretsOf(g).map((r) => r.n)).toEqual([1, 2, 10])
    expect(addSecret(g, playerRef(g), 'debt', 2, [list[1]!])).toBe('secret:11')
  })

  it('refuses on a life that is not stamped, and writes nothing', () => {
    const { g, list } = circle(2)
    delete g.world!.social
    const before = json(g)
    expect(addSecret(g, playerRef(g), 'affair', 3, [list[0]!])).toBeNull()
    expect(json(g)).toBe(before)
  })

  it('refuses a severity that is not 1 to 5, a kind it does not know, an about that is not the player, and no holder it could use', () => {
    const { g, list } = circle(3)
    const dead = list[2]!
    dead.alive = false
    const pet = cast(g, 70, 'pet')
    const before = json(g)
    for (const v of [0, 6, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY, '3' as unknown as number]) expect(addSecret(g, playerRef(g), 'affair', v, [list[0]!]), String(v)).toBeNull()
    expect(addSecret(g, playerRef(g), 'rumour' as never, 3, [list[0]!])).toBeNull()
    expect(addSecret(g, ref(list[0]!), 'affair', 3, [list[1]!])).toBeNull()
    expect(addSecret(g, 'person:old-ego' as EntityRef, 'affair', 3, [list[1]!])).toBeNull()
    expect(addSecret(g, playerRef(g), 'affair', 3, [])).toBeNull()
    expect(addSecret(g, playerRef(g), 'affair', 3, [dead])).toBeNull()
    expect(addSecret(g, playerRef(g), 'affair', 3, [pet])).toBeNull()
    expect(addSecret(g, playerRef(g), 'affair', 3, ['person:nobody' as EntityRef])).toBeNull()
    expect(addSecret(g, playerRef(g), 'affair', 3, ['not a ref' as EntityRef])).toBeNull()
    expect(json(g)).toBe(before)
  })

  it('keeps 6 holders at most, each once, and skips a holder who is dead (9 offered, 6 kept)', () => {
    const { g, list } = circle(10)
    list[1]!.alive = false
    const id = addSecret(g, playerRef(g), 'affair', 3, [...list.slice(0, 9), list[0]!])!
    const h = readSecret(g, id)!.h
    expect(h).toHaveLength(EDGE_CAPS.holders)
    expect(h).toEqual([0, 2, 3, 4, 5, 6].map((i) => ref(list[i]!)))
  })

  it('is refused a second time in the year for the same kind and the same holders, and allowed in another year or for other holders', () => {
    const { g, list } = circle(3)
    expect(addSecret(g, playerRef(g), 'affair', 3, [list[0]!])).toBe('secret:1')
    expect(addSecret(g, playerRef(g), 'affair', 5, [list[0]!])).toBeNull()
    expect(addSecret(g, playerRef(g), 'affair', 3, [list[1]!])).toBe('secret:2')
    expect(addSecret(g, playerRef(g), 'debt', 3, [list[0]!])).toBe('secret:3')
    g.year += 1
    expect(addSecret(g, playerRef(g), 'affair', 3, [list[0]!])).toBe('secret:4')
  })

  it('is 40 at most: the 40th is taken and the 41st refused, and the 40 are untouched', () => {
    const { g, list } = circle(3)
    expect(SECRET_CAP).toBe(40)
    expect(SECRET_CAP).toBe(EDGE_CAPS.secrets)
    expect(HOLDER_CAP).toBe(EDGE_CAPS.holders)
    for (let i = 0; i < 40; i++) {
      g.year = 2000 + i
      expect(addSecret(g, playerRef(g), 'affair', 1 + (i % 5), [list[i % 3]!]), `secret ${i + 1}`).toBe(`secret:${i + 1}`)
    }
    expect(secretsOf(g)).toHaveLength(40)
    g.year = 2045
    const full = json(g)
    expect(addSecret(g, playerRef(g), 'affair', 5, [list[0]!])).toBeNull()
    expect(addSecret(g, playerRef(g), 'debt', 5, [list[1]!])).toBeNull()
    expect(json(g)).toBe(full)
    expect(secretsOf(g)).toHaveLength(40)
  })

  it('makes room for a new secret by dropping the oldest that is spent: leaked ten years ago or more, or about an earlier player; never a live one', () => {
    const { g, list } = circle(3)
    const mk = (n: number, over: Partial<SecretRecord> = {}): void =>
      void expect(putSecret(g, `secret:${n}`, { a: playerRef(g), k: 'affair', v: 2, h: [ref(list[0]!)], y: 2010 + (n % 5), ...over })).toBe(true)
    for (let n = 1; n <= 40; n++) mk(n)
    // all 40 are live and unleaked: the 41st is refused
    expect(addSecret(g, playerRef(g), 'debt', 2, [list[1]!])).toBeNull()
    // one leaked 9 years ago is not spent yet, one leaked 10 years ago is
    mk(7, { p: g.year - 9 })
    expect(addSecret(g, playerRef(g), 'debt', 2, [list[1]!])).toBeNull()
    mk(7, { p: g.year - 10 })
    expect(addSecret(g, playerRef(g), 'debt', 2, [list[1]!])).toBe('secret:41')
    expect(readSecret(g, 'secret:7')).toBeNull()
    expect(secretsOf(g)).toHaveLength(40)
    // one about an earlier player is spent at once, and the oldest spent one goes first
    mk(3, { a: 'person:old-ego' as EntityRef })
    mk(9, { p: g.year - 30 })
    expect(addSecret(g, playerRef(g), 'debt', 2, [list[2]!])).toBe('secret:42')
    expect(readSecret(g, 'secret:3')).toBeNull()
    expect(readSecret(g, 'secret:9')).not.toBeNull()
  })

  it('survives a save and a load, the open one and the one that leaked, and the loaded game leaks the open one once', () => {
    // a life the way the game makes one (a bare test game has no ledger and a world the save store keeps as placeholders)
    const g = socialLife({ seed: LIFE[0], year: LIFE[1], countryId: 'us' })
    const list = [0, 1, 2, 3, 4].map(() => cast(g, 70, 'friend'))
    like(g, list[0]!, list[1]!, 90)
    const open = plant(g, [list[0]!], 4)
    const out = plant(g, [list[2]!], 2)
    putSecret(g, out, { ...readSecret(g, out)!, p: g.year - 1 })
    resetSaveStoreForTests()
    installStorageShim()
    setSaveBackend(memorySaveBackend())
    try {
      expect(saveGame(g)).toBe(true)
      const back = loadGame()!
      expect(back).not.toBeNull()
      expect(secretsOf(back)).toEqual(secretsOf(g))
      expect(readSecret(back, open)).toEqual({ a: playerRef(g), k: 'affair', v: 4, h: [ref(list[0]!)], y: g.year - 1 })
      expect(readSecret(back, out)!.p).toBe(g.year - 1)
      expect(worldProblems(back)).toEqual([])
      makeLeak(back, open, back.people.find((p) => p.id === list[0]!.id)!)
      leakPass(back)
      expect(readSecret(back, open)!.p).toBe(back.year)
      expect(readSecret(back, out)!.p).toBe(g.year - 1)
    } finally {
      resetSaveStoreForTests()
    }
  }, 60_000)

  it('stays inside the cap when written around the writer: 4,000 secrets of 600 holders read as 40 of 6', () => {
    const { g } = circle(1)
    const raw: Record<string, unknown> = {}
    for (let i = 0; i < 4000; i++) raw[`secret:${i}`] = { a: playerRef(g), k: i % 2 ? 'affair' : 'debt', v: 1 + (i % 5), h: Array.from({ length: 600 }, (_, j) => `person:q${j}`), y: 2000 + (i % 30) }
    ;(g.world as Record<string, unknown>).edges = raw
    const rows = secretsOf(g)
    expect(rows).toHaveLength(EDGE_CAPS.secrets)
    for (const r of rows) expect(r.secret.h.length).toBeLessThanOrEqual(EDGE_CAPS.holders)
  })
})

describe('putSecret, the one writer of the records', () => {
  const S = (g: GameState, over: Partial<SecretRecord> = {}): SecretRecord => ({ a: playerRef(g), k: 'affair', v: 3, h: ['person:p1' as EntityRef], y: 2020, ...over })

  it('writes a secret key only, validates the record, and refuses a key that is an edge or nothing', () => {
    const { g } = circle(1)
    expect(putSecret(g, 'secret:1', S(g))).toBe(true)
    for (const key of ['person:p1>person:p2', 'secret:', 'secret:01', 'secret:1.5', 'secret:1>person:p1', 'x', '', 5 as unknown as string]) expect(putSecret(g, key, S(g)), String(key)).toBe(false)
    for (const bad of ['x' as never, { ...S(g), v: 9 as never }, { ...S(g), k: 'rumour' as never }, { ...S(g), h: 'z' as never }, { ...S(g), y: 'w' as never }, { ...S(g), p: 'x' as never }]) {
      expect(putSecret(g, 'secret:2', bad), JSON.stringify(bad)).toBe(false)
    }
    expect(secretsOf(g).map((r) => r.id)).toEqual(['secret:1'])
  })

  it('replaces the root and never edits it (the root is frozen), keeps a record that did not change, and writes nothing for the same record', () => {
    const { g } = circle(1)
    putSecret(g, 'secret:1', S(g))
    const root = g.world!.edges
    expect(Object.isFrozen(root)).toBe(true)
    expect(putSecret(g, 'secret:1', S(g))).toBe(true)
    expect(g.world!.edges).toBe(root)
    expect(putSecret(g, 'secret:1', S(g, { p: 2024 }))).toBe(true)
    expect(g.world!.edges).not.toBe(root)
    expect(Object.isFrozen(g.world!.edges)).toBe(true)
    expect(readSecret(g, 'secret:1')!.p).toBe(2024)
  })

  it('removes a record for null, and answers true for one that is not there', () => {
    const { g } = circle(1)
    putSecret(g, 'secret:1', S(g))
    expect(putSecret(g, 'secret:1', null)).toBe(true)
    expect(secretsOf(g)).toEqual([])
    expect(putSecret(g, 'secret:1', null)).toBe(true)
  })

  it('holds 40 records and refuses the 41st, but replaces one of the 40', () => {
    const { g } = circle(1)
    for (let n = 1; n <= 40; n++) expect(putSecret(g, `secret:${n}`, S(g))).toBe(true)
    expect(putSecret(g, 'secret:41', S(g))).toBe(false)
    expect(putSecret(g, 'secret:40', S(g, { p: 2022 }))).toBe(true)
    expect(secretsOf(g)).toHaveLength(40)
  })

  it('leaves the edges alone, and an edge write leaves the secrets alone; 1,200 bound edges and 40 secrets fit together', () => {
    const { g, list } = circle(2)
    for (let n = 1; n <= 40; n++) putSecret(g, `secret:${n}`, S(g))
    for (let i = 0; i < 1200; i++) expect(putEdge(g, `person:z${i}>${playerRef(g)}`, { t: 50, f: 50, r: 50, s: 0, o: 0, y: g.year, l: g.year, k: 'kin' }), `edge ${i}`).toBe(true)
    expect(secretsOf(g)).toHaveLength(40)
    expect(putEdge(g, toPlayer(g, list[0]!), { t: 50, f: 50, r: 50, s: 0, o: 0, y: g.year, l: g.year })).toBe(false)
    expect(secretsOf(g)).toHaveLength(40)
    expect(worldProblems(g)).toEqual([])
  })
})

describe('a hostile secret reads as none', () => {
  const bad: readonly [string, unknown][] = [
    ['a number', 7],
    ['text', 'secret'],
    ['null', null],
    ['an array', []],
    ['severity 9', { a: 'person:p1', k: 'affair', v: 9, h: [], y: 2020 }],
    ['severity NaN', { a: 'person:p1', k: 'affair', v: Number.NaN, h: [], y: 2020 }],
    ['a kind it does not know', { a: 'person:p1', k: 'rumour', v: 2, h: [], y: 2020 }],
    ['holders that are no list', { a: 'person:p1', k: 'affair', v: 2, h: 'z', y: 2020 }],
    ['an about that is no ref', { a: 'x y', k: 'affair', v: 2, h: [], y: 2020 }],
    ['a year that is no year', { a: 'person:p1', k: 'affair', v: 2, h: [], y: 99 }],
    ['a leak year that is no year', { a: 'person:p1', k: 'affair', v: 2, h: [], y: 2020, p: 'soon' }],
  ]

  for (const [name, value] of bad) {
    it(`${name}: no secret is read, the pass changes nothing and does not throw`, () => {
      const { g } = circle(3)
      ;(g.world as Record<string, unknown>).edges = { 'secret:1': value }
      expect(secretsOf(g)).toEqual([])
      expect(readSecret(g, 'secret:1')).toBeNull()
      const before = json(g)
      expect(() => leakPass(g)).not.toThrow()
      expect(json(g)).toBe(before)
      expect(edgeProblems((g.world as Record<string, unknown>).edges).length).toBeGreaterThan(0)
    })
  }

  it('a map that is no map, and a world with no edges at all, read as no secrets', () => {
    const { g } = circle(1)
    expect(secretsOf(g)).toEqual([])
    for (const junk of [7, 'x', null, [], { 'secret:1.5': 1 }]) {
      ;(g.world as Record<string, unknown>).edges = junk
      expect(secretsOf(g)).toEqual([])
      expect(() => leakPass(g)).not.toThrow()
    }
    expect(readSecret(g, 'person:p1>person:p2')).toBeNull()
    expect(readSecret(g, 'nope')).toBeNull()
  })

  it('normalizeEdges keeps what readSecrets reads: the two agree on a mixed map', () => {
    const { g, list } = circle(2)
    const raw = { 'secret:1': { a: playerRef(g), k: 'affair', v: 2, h: [ref(list[0]!)], y: 2020 }, 'secret:2': { a: 'x', k: 'y', v: 9, h: 'z', y: 'w' } }
    ;(g.world as Record<string, unknown>).edges = raw
    expect(readSecrets(g).map(([k]) => k)).toEqual(Object.keys(normalizeEdges(raw)))
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 2. The spread

/** A seeded stream for the simulations (an LCG), so a failure is the same failure next time. */
function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32)
}

describe('the spread of a leak (hop cap 2)', () => {
  const lists = (m: Record<string, string[]>) => (id: string) => m[id] ?? []

  it('tells two at the first hop and one more for each of those, and then stops', () => {
    expect(HOP_CAP).toBe(2)
    expect(TELLS).toEqual([2, 1])
    expect(MAX_TOLD).toBe(4)
    const out = spread('h', lists({ h: ['a', 'b', 'c'], a: ['h', 'd', 'e'], b: ['a', 'f', 'g'], d: ['z'], f: ['y'] }), new Set())
    expect(out).toEqual([
      { who: 'a', from: 'h', hop: 1 },
      { who: 'b', from: 'h', hop: 1 },
      { who: 'd', from: 'a', hop: 2 },
      { who: 'f', from: 'b', hop: 2 },
    ])
  })

  it('passes over the ones who know already (the holders) and over anyone told, and takes the next best', () => {
    const out = spread('h', lists({ h: ['k', 'a', 'b'], a: ['k', 'b', 'c'], b: ['a', 'h', 'd'] }), new Set(['k']))
    expect(out).toEqual([
      { who: 'a', from: 'h', hop: 1 },
      { who: 'b', from: 'h', hop: 1 },
      { who: 'c', from: 'a', hop: 2 },
      { who: 'd', from: 'b', hop: 2 },
    ])
  })

  it('tells fewer when there are fewer to tell, and no one when the holder has no contacts', () => {
    expect(spread('h', lists({}), new Set())).toEqual([])
    expect(spread('h', lists({ h: ['a'] }), new Set())).toEqual([{ who: 'a', from: 'h', hop: 1 }])
    expect(spread('h', lists({ h: ['h', 'h'] }), new Set())).toEqual([])
  })

  it('never passes hop 2, 4 people told, 2 at the first hop or 1 per teller at the second, in 10,000 simulated leaks of hostile contact lists', () => {
    let widest = 0
    let deepest = 0
    for (let i = 0; i < 10_000; i++) {
      const r = lcg(i + 1)
      const n = 1 + Math.floor(r() * 30)
      const ids = Array.from({ length: n }, (_, k) => `p${k}`)
      const contacts = new Map(ids.map((id) => [id, Array.from({ length: Math.floor(r() * 14) }, () => (r() < 0.12 ? id : r() < 0.05 ? `x${Math.floor(r() * 3)}` : ids[Math.floor(r() * n)]!))]))
      const skip = new Set(ids.filter(() => r() < 0.12))
      const holder = ids[Math.floor(r() * n)]!
      const out = spread(holder, (id) => contacts.get(id) ?? [], skip)
      const hops = out.map((t) => t.hop)
      deepest = Math.max(deepest, ...hops, 0)
      widest = Math.max(widest, out.length)
      expect(Math.max(0, ...hops), `leak ${i}`).toBeLessThanOrEqual(HOP_CAP)
      expect(out.length, `leak ${i}`).toBeLessThanOrEqual(MAX_TOLD)
      expect(out.filter((t) => t.hop === 1).length, `leak ${i}`).toBeLessThanOrEqual(2)
      const firsts = new Map<string, number>()
      for (const t of out) if (t.hop === 2) firsts.set(t.from, (firsts.get(t.from) ?? 0) + 1)
      for (const [from, count] of firsts) {
        expect(count, `leak ${i}: ${from}`).toBe(1)
        expect(out.some((t) => t.hop === 1 && t.who === from), `leak ${i}: ${from} was told at hop 1`).toBe(true)
      }
      const whos = out.map((t) => t.who)
      expect(new Set(whos).size, `leak ${i}`).toBe(whos.length)
      for (const who of whos) {
        expect(who, `leak ${i}`).not.toBe(holder)
        expect(skip.has(who), `leak ${i}`).toBe(false)
      }
      for (const t of out) if (t.hop === 1) expect(t.from).toBe(holder)
    }
    // the simulation is not vacuous: the widest leak told 4 and the deepest went to hop 2
    expect(widest).toBe(4)
    expect(deepest).toBe(2)
  })

  it('is pure and the same every time, and reads at most the first entries of a list that is a million long', () => {
    const big = Array.from({ length: 1_000_000 }, () => 'p1')
    const a = spread('p0', (id) => (id === 'p0' ? big : []), new Set())
    expect(a).toEqual([{ who: 'p1', from: 'p0', hop: 1 }])
    expect(spread('p0', (id) => (id === 'p0' ? big : []), new Set())).toEqual(a)
  })
})

describe('contacts: whom a holder tells first', () => {
  it('are the living people the holder knows, never a pet, the dead or the holder; the best liked first, then the circle, then by key', () => {
    const { g, list } = circle(6)
    const [h, a, b, c, d, e] = list as [Person, Person, Person, Person, Person, Person]
    d.alive = false
    const pet = cast(g, 70, 'pet')
    like(g, h, a, 30)
    like(g, h, b, 90)
    like(g, h, c, 50)
    const ids = contactsOf(g, h).map((p) => p.id)
    // b is liked most (90); c has an edge of 50 and e none, which reads as 50 too, so those two go by key; a is liked least (30)
    const even = [c, e].sort((x, y) => (personKey(x) < personKey(y) ? -1 : 1)).map((p) => p.id)
    expect(ids).toEqual([b.id, ...even, a.id])
    expect(ids).not.toContain(h.id)
    expect(ids).not.toContain(d.id)
    expect(ids).not.toContain(pet.id)
    for (const p of contactsOf(g, h)) expect(acquainted(h, p)).toBe(true)
  })

  it('are only the people of the holder\'s circle: a friend does not tell a sibling', () => {
    const { g, list } = circle(2)
    const sibling = cast(g, 70, 'sibling')
    expect(contactsOf(g, list[0]!).map((p) => p.id)).toEqual([list[1]!.id])
    expect(contactsOf(g, sibling)).toEqual([])
  })

  it('read the game and write nothing: a frozen game, a trapped g.rng', () => {
    const { g, list } = circle(5)
    like(g, list[0]!, list[1]!, 80)
    deepFreeze(trapRng(g))
    const before = json(g)
    expect(contactsOf(g, list[0]!).length).toBe(4)
    expect(json(g)).toBe(before)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 3. The odds

describe('the odds of a leak', () => {
  it('are 0.02 + 0.10 x resentment + 0.06 x (1 - honesty) + a temper term that only a grudge feeds', () => {
    const { g, list } = circle(3)
    const [honest, liar, hothead] = list as [Person, Person, Person]
    withAxes(g, honest, [50, 100, 50, 50, 50])
    liar.traits = [...LIAR]
    hothead.traits = ['hot-headed', 'jealous', 'sneaky']
    // no edge, no grudge: an honest holder 0.02, whatever the temper
    expect(leakOdds(g, honest)).toBeCloseTo(LEAK.base, 10)
    expect(leakOdds(g, hothead)).toBeGreaterThan(LEAK.base)
    setEdge(g, honest, { s: 0 })
    expect(leakOdds(g, honest)).toBeCloseTo(LEAK.base, 10)
    withAxes(g, honest, [50, 100, 50, 0, 0])
    expect(leakOdds(g, honest)).toBeCloseTo(LEAK.base, 10)
    withAxes(g, honest, [50, 100, 50, 50, 50])
    // a grudge adds 0.10 x s / 100 (and a little of the temper)
    setEdge(g, honest, { s: 50 })
    expect(leakOdds(g, honest)).toBeGreaterThan(LEAK.base + 0.05 - 1e-9)
    expect(leakOdds(g, honest)).toBeLessThan(LEAK.base + 0.05 + 0.02 + 1e-9)
    // dishonesty adds up to 0.06 more
    setEdge(g, honest, { s: 0 })
    setEdge(g, liar, { s: 0 })
    expect(leakOdds(g, liar) - leakOdds(g, honest)).toBeGreaterThan(0.04)
    expect(leakOdds(g, liar) - leakOdds(g, honest)).toBeLessThanOrEqual(0.06 + 1e-9)
    // a hot temper with a grudge and no scruples is the worst case, 0.22 at most
    hothead.traits = ['hot-headed', 'jealous', 'sneaky', 'manipulative']
    setEdge(g, hothead, { s: 100 })
    expect(leakOdds(g, hothead)).toBeGreaterThan(0.2)
    expect(leakOdds(g, hothead)).toBeLessThanOrEqual(LEAK.maxOdds + 1e-9)
    expect(LEAK.maxOdds).toBeCloseTo(0.22, 10)
  })

  it('stay between 0.02 and 0.22 for every holder and every grudge, hostile edge values included', () => {
    const { g, list } = circle(1)
    const p = list[0]!
    for (const traits of [[...HONEST], [...LIAR], ['hot-headed'], [], ['spoiled', 'arrogant']]) {
      p.traits = [...traits]
      for (const s of [0, 1, 33, 99, 100]) {
        setEdge(g, p, { s })
        const o = leakOdds(g, p)
        expect(o).toBeGreaterThanOrEqual(LEAK.base - 1e-12)
        expect(o).toBeLessThanOrEqual(LEAK.maxOdds + 1e-12)
      }
    }
    ;(g.world as Record<string, unknown>).edges = { [toPlayer(g, p)]: { t: 50, f: 50, r: 50, s: 1e300, o: 0, y: 2020, l: 2020 } }
    const o = leakOdds(g, p)
    expect(o).toBeGreaterThanOrEqual(LEAK.base - 1e-12)
    expect(o).toBeLessThanOrEqual(LEAK.maxOdds + 1e-12)
  })

  it('leave an honest holder (honesty 100) with no grudge under 3% a year, by the formula and over 4,000 years of the stream', () => {
    const { g, list } = circle(1)
    const p = list[0]!
    withAxes(g, p, [50, 100, 50, 50, 0])
    setEdge(g, p, { s: 0 })
    expect(honestyOf(g, p)).toBe(100)
    const odds = leakOdds(g, p)
    expect(odds).toBeLessThan(0.03)
    let leaks = 0
    for (let i = 0; i < 4000; i++) if (rollOf(g, `life-${i}`, 'secret:1', p) < odds) leaks++
    expect(leaks / 4000).toBeLessThan(0.03)
    // the most honest words a person can have (95) are under 3% too
    p.traits = [...HONEST]
    delete g.world!.met
    expect(honestyOf(g, p)).toBe(95)
    expect(leakOdds(g, p)).toBeLessThan(0.03)
  })

  it('make the real pass leak an honest holder under 3% of the years (the pass itself, 3,000 lives)', () => {
    const { g, list } = circle(3)
    const p = list[0]!
    p.traits = [...HONEST]
    setEdge(g, p, { s: 0 })
    const id = plant(g, [p])
    const open = readSecret(g, id)!
    let leaks = 0
    for (let i = 0; i < 3000; i++) {
      g.lifeId = `life-${i}`
      expect(putSecret(g, id, open)).toBe(true)
      leakPass(g)
      if (readSecret(g, id)!.p !== undefined) leaks++
    }
    expect(leaks / 3000).toBeLessThan(0.03)
    expect(leaks).toBeGreaterThan(0)
  })

  it('make a dishonest holder with a grudge leak about one year in five', () => {
    const { g, list } = circle(2)
    const p = list[0]!
    p.traits = [...LIAR]
    setEdge(g, p, { s: 100 })
    const odds = leakOdds(g, p)
    expect(odds).toBeGreaterThan(0.17)
    let leaks = 0
    for (let i = 0; i < 3000; i++) if (rollOf(g, `life-${i}`, 'secret:1', p) < odds) leaks++
    expect(leaks / 3000).toBeGreaterThan(0.14)
    expect(leaks / 3000).toBeLessThan(0.26)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 4. The pass

describe('leakPass', () => {
  it('tells the holder\'s two best-liked contacts and one more through each, and hits each of the four once, for 3 x severity as an offence', () => {
    const { g, list } = circle(9)
    const [h, a, b, c, d, e] = list as [Person, Person, Person, Person, Person, Person]
    like(g, h, a, 95)
    like(g, h, b, 90)
    like(g, a, c, 90)
    like(g, b, d, 90)
    for (const p of list) setEdge(g, p)
    const id = plant(g, [h], 4)
    makeLeak(g, id, h)
    const before = new Map(list.map((p) => [p.id, p.relationship]))
    leakPass(g)
    const hit = list.filter((p) => p.relationship < before.get(p.id)!)
    expect(hit.map((p) => p.id).sort()).toEqual([a, b, c, d].map((p) => p.id).sort())
    for (const p of hit) expect(hitOf(p, before.get(p.id)!)).toBe(3 * 4)
    // the holder, and the ones not told, are untouched
    expect(h.relationship).toBe(before.get(h.id))
    expect(e.relationship).toBe(before.get(e.id))
    // each told person remembers it, and the edge follows the number (the shim's mirror) with the grudge raised
    for (const p of [a, b, c, d]) {
      expect(memoriesOf(edgeOf(g, p)!).some((m) => m.kind === 'gossiped_about_me')).toBe(true)
      expect(edgeOf(g, p)!.f).toBe(p.relationship)
      expect(edgeOf(g, p)!.s).toBeGreaterThan(12)
    }
    expect(told(g).map((p) => p.id).sort()).toEqual([a, b, c, d].map((p) => p.id).sort())
    expect(readSecret(g, id)!.p).toBe(g.year)
  })

  it('scales the hit with the severity: 3 for a 1, 15 for a 5', () => {
    for (const [v, hit] of [[1, 3], [2, 6], [3, 9], [4, 12], [5, 15]] as const) {
      const { g, list } = circle(3)
      const [h, a] = list as [Person, Person]
      like(g, h, a, 90)
      const id = plant(g, [h], v)
      makeLeak(g, id, h)
      const was = a.relationship
      leakPass(g)
      expect(hitOf(a, was), `severity ${v}`).toBe(hit)
    }
  })

  it('does not leak a secret in the year it began: it can leak from the next year', () => {
    const { g, list } = circle(4)
    const [h, a] = list as [Person, Person]
    like(g, h, a, 90)
    const id = addSecret(g, playerRef(g), 'affair', 3, [h])!
    makeLeak(g, id, h)
    const before = json(g)
    leakPass(g)
    expect(json(g)).toBe(before)
    g.year += 1
    makeLeak(g, id, h)
    leakPass(g)
    expect(readSecret(g, id)!.p).toBe(g.year)
  })

  it('does not leak a secret about an earlier player (standing and memory do not pass to an heir)', () => {
    const { g, list } = circle(4)
    const [h, a] = list as [Person, Person]
    like(g, h, a, 90)
    expect(putSecret(g, 'secret:9', { a: 'person:old-ego' as EntityRef, k: 'affair', v: 5, h: [ref(h)], y: g.year - 3 })).toBe(true)
    makeLeak(g, 'secret:9', h)
    const before = json(g)
    leakPass(g)
    expect(json(g)).toBe(before)
    expect(readSecret(g, 'secret:9')!.p).toBeUndefined()
  })

  it('leaks a secret once: one that is out again changes nothing, this year or any later year', () => {
    const { g, list } = circle(5)
    const [h, a] = list as [Person, Person]
    like(g, h, a, 90)
    const id = plant(g, [h])
    makeLeak(g, id, h)
    leakPass(g)
    const out = json(g)
    expect(readSecret(g, id)!.p).toBe(g.year)
    leakPass(g)
    expect(json(g)).toBe(out)
    for (let y = 1; y <= 5; y++) {
      g.year += 1
      makeLeak(g, id, h)
      leakPass(g)
    }
    expect(readSecret(g, id)!.p).toBe(g.year - 5)
    expect(a.relationship).toBe(JSON.parse(out).people.find((x: Person) => x.id === a.id).relationship)
  })

  it('takes the first holder of the list whose roll is under their odds, and tells that holder\'s contacts', () => {
    const { g, list } = circle(8)
    const [h1, h2, a, b, c] = list as [Person, Person, Person, Person, Person, ...Person[]]
    like(g, h1, a, 90)
    like(g, h2, b, 90)
    like(g, h2, c, 80)
    const id = plant(g, [h1, h2], 2)
    g.lifeId = lifeWhere((l) => rollOf(g, l, id, h1) >= LEAK.maxOdds && rollOf(g, l, id, h2) < LEAK.base)
    leakPass(g)
    expect(readSecret(g, id)!.p).toBe(g.year)
    expect(told(g).map((p) => p.id)).toEqual(expect.arrayContaining([b.id, c.id]))
    expect(told(g).map((p) => p.id)).not.toContain(h1.id)
    expect(told(g).map((p) => p.id)).not.toContain(h2.id)
  })

  it('lets neither holder leak when both rolls are over the ceiling', () => {
    const { g, list } = circle(5)
    const [h1, h2] = list as [Person, Person]
    const id = plant(g, [h1, h2], 5)
    g.lifeId = lifeWhere((l) => rollOf(g, l, id, h1) >= LEAK.maxOdds && rollOf(g, l, id, h2) >= LEAK.maxOdds)
    const before = json(g)
    leakPass(g)
    expect(json(g)).toBe(before)
  })

  it('skips a holder who is dead, a pet or not in the game, and a holder with nobody to tell leaks nothing (p stays open)', () => {
    const { g, list } = circle(3)
    const [h, a] = list as [Person, Person]
    like(g, h, a, 90)
    const id = plant(g, [h], 3)
    makeLeak(g, id, h)
    const quiet = (change: () => void): void => {
      change()
      const before = json(g)
      leakPass(g)
      expect(json(g)).toBe(before)
    }
    quiet(() => void (h.alive = false))
    quiet(() => void ((h.alive = true), (h.relation = 'pet')))
    quiet(() => void ((h.relation = 'friend'), (g.people = g.people.filter((p) => p.id !== h.id))))
    // alone in the circle: the roll is under the odds and no one can be told
    const solo = circle(1)
    const sid = plant(solo.g, [solo.list[0]!])
    makeLeak(solo.g, sid, solo.list[0]!)
    const alone = json(solo.g)
    leakPass(solo.g)
    expect(json(solo.g)).toBe(alone)
    expect(readSecret(solo.g, sid)!.p).toBeUndefined()
  })

  it('leaks a debt secret only while the player still owes: a debt paid or gone makes it moot', () => {
    const { g, list } = circle(4)
    const [h, a] = list as [Person, Person]
    like(g, h, a, 90)
    const id = plant(g, [h], 3, 'debt')
    makeLeak(g, id, h)
    const quiet = json(g)
    leakPass(g)
    expect(json(g)).toBe(quiet)
    // the player owes h: the edge player > h carries an unpaid loan
    expect(putEdge(g, `${playerRef(g)}>${ref(h)}`, { t: 50, f: 50, r: 50, s: 0, o: 0, y: g.year, l: g.year, dv: [5000, 8, g.year - 1, 0, 0] })).toBe(true)
    leakPass(g)
    expect(readSecret(g, id)!.p).toBe(g.year)
  })

  it('draws from the stream social and nothing else: g.rng and g.nextId do not move, and the id of the draw is leak|<secret>|<holder>', () => {
    const { g, list } = circle(4)
    const [h, a] = list as [Person, Person]
    like(g, h, a, 90)
    const id = plant(g, [h])
    makeLeak(g, id, h)
    const rng = g.rng
    leakPass(g)
    expect(g.rng).toBe(rng)
    // the draw that decided it is the stream's, by that id
    expect(actRoll(g, 'leak', `${id}|${ref(h)}`)()).toBeLessThan(LEAK.base)
    expect(readSecret(g, id)!.p).toBe(g.year)
  })

  it('does nothing on a life that is not stamped, and nothing when the player is dead', () => {
    const { g, list } = circle(4)
    const [h, a] = list as [Person, Person]
    like(g, h, a, 90)
    const id = plant(g, [h])
    makeLeak(g, id, h)
    g.character.alive = false
    const dead = json(g)
    leakPass(g)
    expect(json(g)).toBe(dead)
    g.character.alive = true
    delete g.world!.social
    const plain = json(g)
    leakPass(g)
    expect(json(g)).toBe(plain)
  })

  it('is run once a year by the society.acts entry: a second call in the year, a clone and a reload change nothing', () => {
    const { g, list } = circle(5)
    const [h, a] = list as [Person, Person]
    like(g, h, a, 90)
    const id = plant(g, [h])
    makeLeak(g, id, h)
    yearlyActs(g)
    const once = json(g)
    expect(readSecret(g, id)!.p).toBe(g.year)
    yearlyActs(g)
    expect(json(g)).toBe(once)
    const clone = structuredClone(g)
    yearlyActs(clone)
    expect(json(clone)).toBe(once)
    const reload = JSON.parse(once) as GameState
    yearlyActs(reload)
    expect(json(reload)).toBe(once)
  })

  it('hits every person once for each secret and never twice for the same one, over 50 years of the real year step', () => {
    const { g, list } = circle(12)
    const holders = list.slice(0, 3)
    for (const h of holders) setEdge(g, h, { s: 100 })
    for (const h of holders) h.traits = [...LIAR]
    for (const p of list.slice(3)) setEdge(g, p)
    const ids = [plant(g, [holders[0]!, holders[1]!], 2), plant(g, [holders[2]!], 5)]
    const leakYear = new Map<string, number>()
    const drops = new Map<string, number[]>()
    for (const p of list) drops.set(p.id, [])
    for (let y = 0; y < 50; y++) {
      const was = new Map(list.map((p) => [p.id, p.relationship]))
      nextYear(g)
      for (const p of list) drops.get(p.id)!.push(was.get(p.id)! - p.relationship)
      for (const id of ids) {
        const s = readSecret(g, id)!
        if (s.p !== undefined && !leakYear.has(id)) leakYear.set(id, s.p)
        // p is set once and never changes
        if (leakYear.has(id)) expect(s.p, `${id} year ${y}`).toBe(leakYear.get(id))
      }
    }
    expect(leakYear.size).toBe(2)
    // the yearly step also drifts a relationship (v5.2.0 does not, the test game has no drift entry); what the leaks cost is bounded by the severities
    const worst = Math.max(...[...drops.values()].map((d) => Math.max(...d)))
    expect(worst).toBeLessThanOrEqual(3 * 2 + 3 * 5)
    // each told person was told of each secret at most once: at most two gossiped_about_me memories in all, one per secret year
    for (const p of list) {
      const m = memoriesOf(edgeOf(g, p) ?? ({} as Edge)).filter((x) => x.kind === 'gossiped_about_me')
      expect(m.length, p.firstName).toBeLessThanOrEqual(2)
    }
  })

  it('costs no person more than the yearly allowance with 40 secrets and 6 holders each, in a year or in twelve', () => {
    expect(LEAK.damageYear).toBe(30)
    const { g, list } = circle(14)
    for (const p of list) {
      p.traits = [...LIAR]
      setEdge(g, p, { s: 100 })
    }
    for (let i = 0; i < 40; i++) {
      g.year = 1990 + i
      expect(addSecret(g, playerRef(g), 'affair', 5, list.slice(i % 8, (i % 8) + 6)), `secret ${i}`).not.toBeNull()
    }
    g.year = 2030
    let leaked = 0
    for (let y = 0; y < 12; y++) {
      const was = new Map(list.map((p) => [p.id, p.relationship]))
      g.year += 1
      yearlyActs(g)
      for (const p of list) expect(was.get(p.id)! - p.relationship, `${p.firstName} year ${y}`).toBeLessThanOrEqual(LEAK.damageYear)
      leaked = secretsOf(g).filter((r) => r.secret.p !== undefined).length
    }
    // the bound was tested against real leaks: by now nearly all 40 are out, each once, in a year after 2030
    expect(leaked).toBeGreaterThan(30)
    for (const r of secretsOf(g)) if (r.secret.p !== undefined) expect(r.secret.p).toBeGreaterThan(2030)
  })

  it('never tells more than 4 people of one secret in a real game, whatever the size of the circle (40 friends, and 400 for the 100 x probe)', () => {
    for (const size of [40, 400]) {
      const { g, list } = circle(size)
      const h = list[0]!
      for (let i = 1; i < size; i++) like(g, h, list[i]!, 100 - (i % 50))
      const id = plant(g, [h], 3)
      makeLeak(g, id, h)
      leakPass(g)
      expect(told(g).length, `${size} friends`).toBeLessThanOrEqual(MAX_TOLD)
      expect(told(g).length, `${size} friends`).toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 5. The fact, the notice and the log

describe('what the player hears', () => {
  it('has the notice Word Got Around once, naming the holder and the first person told, and a log line of the same words', () => {
    const { g, list } = circle(6)
    const [h, a] = list as [Person, Person]
    like(g, h, a, 95)
    const id = plant(g, [h], 3)
    makeLeak(g, id, h)
    const queued = g.queue.length
    leakPass(g)
    const notes = g.queue.slice(queued).filter((m) => m.kind === 'notice' && m.title === 'Word Got Around')
    expect(notes).toHaveLength(1)
    const text = (notes[0] as { text: string }).text
    expect(text).toContain(h.firstName)
    expect(text).toContain(a.firstName)
    expect(text.length).toBeLessThanOrEqual(140)
    expect(text).not.toMatch(/[\u2013\u2014]/)
    const logged = g.log.flatMap((y) => y.entries).map((e) => e.text)
    expect(logged.some((l) => l.includes(h.firstName) && l.includes(a.firstName))).toBe(true)
  })

  it('has the notice once in the pace of the kin family leak: the next leak in the gap is a log line only', () => {
    const { g, list } = circle(8)
    const [h, h2, a, b] = list as [Person, Person, Person, Person, ...Person[]]
    for (const p of [h, h2]) {
      p.traits = [...LIAR]
      setEdge(g, p, { s: 100 })
    }
    like(g, h, a, 90)
    like(g, h2, b, 90)
    const one = plant(g, [h])
    const two = plant(g, [h2])
    g.lifeId = lifeWhere((l) => rollOf(g, l, one, h) < 0.19 && rollOf(g, l, two, h2) < 0.19)
    const queued = g.queue.length
    leakPass(g)
    expect(readSecret(g, one)!.p).toBe(g.year)
    expect(readSecret(g, two)!.p).toBe(g.year)
    expect(g.queue.slice(queued).filter((m) => m.kind === 'notice' && m.title === 'Word Got Around')).toHaveLength(1)
    expect(g.log.flatMap((y) => y.entries).filter((e) => e.text.includes(h.firstName) || e.text.includes(h2.firstName))).toHaveLength(2)
  })

  it('says the fact social.leak once for each leak: the subject, the holder, the number told and a severity of 40 to 90', () => {
    const { g, list } = circle(7)
    const [h, a, b] = list as [Person, Person, Person]
    like(g, h, a, 95)
    like(g, h, b, 90)
    const id = plant(g, [h], 5)
    makeLeak(g, id, h)
    leakPass(g)
    const rows = readFacts(g).filter((f) => f.k === 'social.leak')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ k: 'social.leak', y: g.year, c: playerRef(g), a: personKey(h), s: 90 })
    expect(rows[0]!.v).toBeGreaterThanOrEqual(2)
    expect(rows[0]!.v).toBeLessThanOrEqual(MAX_TOLD)
  })

  it('maps severity 1 to 5 onto 40 to 90', () => {
    expect([1, 2, 3, 4, 5].map(leakSeverity)).toEqual([40, 53, 65, 78, 90])
    for (let v = 1; v <= 5; v++) expect(leakSeverity(v)).toBeGreaterThanOrEqual(40)
    expect(leakSeverity(0)).toBe(40)
    expect(leakSeverity(99)).toBe(90)
    expect(leakSeverity(Number.NaN)).toBe(40)
  })

  it('says at most 8 facts in a pass, though more secrets leak in it', () => {
    const { g, list } = circle(10)
    for (const p of list) {
      p.traits = [...LIAR]
      setEdge(g, p, { s: 100 })
    }
    for (let i = 0; i < 30; i++) {
      g.year = 1990 + i
      expect(addSecret(g, playerRef(g), 'affair', 1 + (i % 5), [0, 1, 2, 3, 4, 5].map((k) => list[(i + k) % 10]!)), `secret ${i}`).not.toBeNull()
    }
    g.year = 2026
    resetBusStats()
    leakPass(g)
    const out = secretsOf(g).filter((r) => r.secret.p !== undefined).length
    expect(out).toBeGreaterThan(8)
    // eight facts went on the bus (the store keeps one row for a holder and a year, so it may hold fewer)
    expect(busStats().emitted).toBe(8)
    expect(readFacts(g).filter((f) => f.k === 'social.leak' && f.y === g.year).length).toBeGreaterThan(0)
  })

  it('declares the fact on the module: a kind no module declares is dropped by the bus', () => {
    expect(societyModule.facts).toEqual(expect.arrayContaining(['social.leak']))
    expect(registeredFacts().has('social.leak')).toBe(true)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 6. Purity, text and the files

describe('reads are pure', () => {
  it('secretsOf, readSecret, readSecrets and leakOdds read a frozen game with a trapped g.rng', () => {
    const { g, list } = circle(3)
    const id = plant(g, [list[0]!])
    deepFreeze(trapRng(g))
    const before = json(g)
    expect(secretsOf(g)).toHaveLength(1)
    expect(readSecret(g, id)).not.toBeNull()
    expect(readSecrets(g)).toHaveLength(1)
    expect(leakOdds(g, list[0]!)).toBeGreaterThan(0)
    expect(json(g)).toBe(before)
  })
})

describe('the text of a leak', () => {
  it('is a pool of 4 lines, each naming two people ({who} told {whom}), none opening on a slot', () => {
    expect(LEAK_LINES).toHaveLength(4)
    for (const line of LEAK_LINES) {
      expect(line, line).toContain('{who}')
      expect(line, line).toContain('{whom}')
      expect(line.startsWith('{'), line).toBe(false)
      expect(line, line).not.toMatch(/[\u2013\u2014]/)
    }
  })
})

describe('the files of the leak', () => {
  it('draw luck from the stream only: no g.rng, no rand, chance, pick, shuffle or Math.random in secret.ts or gossip.ts', () => {
    for (const f of ['secret.ts', 'gossip.ts']) {
      const text = src(`src/game/society/${f}`).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
      expect(text, f).not.toMatch(/\.rng\b|\brand\(|\bchance\(|\bpick\(|\bshuffle\(|Math\.random|\bDate\b/)
    }
  })

  it('book no money (a secret moves none), and hold no long dash', () => {
    for (const f of ['secret.ts', 'gossip.ts']) {
      const text = src(`src/game/society/${f}`)
      expect(text, f).not.toMatch(/moveCash|bookMint|bookBurn|\.money\s*[-+*/]?=[^=]/)
      expect(text, f).not.toMatch(/[\u2013\u2014]/)
    }
  })

  it('write the secrets through putSecret only, never by assigning the world', () => {
    const text = src('src/game/society/secret.ts').replace(/\/\/.*$/gm, '')
    expect(text).not.toMatch(/world\.edges\s*=|ensureWorld\(/)
    expect(text).toContain('putSecret(')
  })
})
