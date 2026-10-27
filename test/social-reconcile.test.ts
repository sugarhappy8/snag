// R4-E11 PART B (RED until part B is written): betrayal and reconciliation. Part A of the task wrote the secrets and the leak
// (test/social-gossip.test.ts, green); this file is the other half, written first so that part B starts from a red bar:
//
//   1. reconcileOdds (society/reconcile.ts): `clamp(0.0015 x max(0, o), 0, 0.15)` with `o` the obligation of the edge person > player. It is 0 on
//      a life that is not stamped and for a pair with no obligation, 0.15 at o 100 and never above it for a hostile `o`, and it is pure.
//   2. The peace odds of the will (events/will-amends.ts, two sites): a stamped life shows and rolls `clamp(peaceOdds + reconcileOdds, 0.05,
//      0.85)`; a stamped pair with no obligation rolls exactly as `peaceOdds` does; an unstamped life is untouched.
//   3. betray(g, key, severity) (society/secret.ts, exported by society/contract.ts): a pinned `betrayal` memory on the edge `key` and a hit of
//      20 to 40 on the relationship of the person at the other end, by severity 1 to 5. When the player is the offender (key `person > player`)
//      the victim now holds a secret about the player: an `affair`, held by that person, severity as given.
//   4. love.ts (an affair found out) creates the secret through the door; the leak betrays the leaker.
//   5. The authorization rows: betray in the states that block it answers nothing and changes nothing.
//
// The mentor is test/social-mentor.test.ts. The files that call into society/ reach it through society/contract.ts only (C39).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { willPersonNodes } from '../src/game/events/will-amends'
import { peaceOdds } from '../src/game/events/will-core'
import type { EntityRef } from '../src/game/kernel/ids'
import { personEntity } from '../src/game/kernel/person-ref'
import { hookUpWith } from '../src/game/love'
import { createPerson } from '../src/game/people'
import { actRoll, runAct } from '../src/game/society/acts'
import { betray as betrayViaDoor, reconcileOdds as reconcileViaDoor } from '../src/game/society/contract'
import { broker } from '../src/game/society/favor'
import { RECONCILE_MAX, RECONCILE_PER_POINT, reconcileOdds } from '../src/game/society/reconcile'
import { LEAK, addSecret, betray, leakPass, readSecret, secretsOf } from '../src/game/society/secret'
import type { GameState, MenuAction, Person } from '../src/game/types'
import { PINNED_MEMORY_KINDS } from '../src/game/world/edge-memory'
import { putEdge } from '../src/game/world/edge-write'
import { memoriesOf, readEdge, type Edge } from '../src/game/world/edges'
import { playerRef } from '../src/game/world/people'
import { deepFreeze } from './fuzz-kit'
import { findSeed } from './seed-kit'
import { cast, socialGame } from './social-kit'
import { trapRng } from './social-parity-kit'
import { makeTestGame } from './helpers'

const ROOT = resolve(__dirname, '..')
const src = (file: string): string => readFileSync(resolve(ROOT, file), 'utf8')
const json = (g: GameState): string => JSON.stringify(g)

const ref = (p: Person): EntityRef => personEntity(p)
const toPlayer = (g: GameState, p: Person): string => `${ref(p)}>${playerRef(g)}`
const fromPlayer = (g: GameState, p: Person): string => `${playerRef(g)}>${ref(p)}`

function setEdge(g: GameState, p: Person, over: Partial<Edge> = {}): void {
  if (!putEdge(g, toPlayer(g, p), { t: 60, f: p.relationship, r: 50, s: 0, o: 0, y: g.year, l: g.year, ...over })) throw new Error('setEdge refused')
}

const memoryKinds = (g: GameState, from: string, to: string): string[] => {
  const e = readEdge(g, from as EntityRef, to as EntityRef)
  return e === null ? [] : memoriesOf(e).map((m) => m.kind)
}

// ---------------------------------------------------------------------------------------------------------------------
// 1. reconcileOdds

describe('reconcileOdds', () => {
  /** A stamped adult and a relative who is cut out of the will, with the obligation `o` on the edge person > player. */
  function relative(o: number | null, stamped = true): { g: GameState; p: Person } {
    const g = stamped ? socialGame(1, { age: 60 }) : makeTestGame(1, { age: 60 })
    const p = cast(g, 40, 'sibling')
    p.data.wl = { by: g.character.id, anger: 50, cut: true, known: true }
    if (stamped && o !== null) setEdge(g, p, { o })
    return { g, p }
  }

  it('is 0 for a life that is not stamped, a pair with no edge, no obligation, and an obligation owed the other way', () => {
    expect(reconcileOdds(relative(100, false).g, relative(100, false).p)).toBe(0)
    const none = relative(null)
    expect(reconcileOdds(none.g, none.p)).toBe(0)
    for (const o of [0, -1, -50, -100]) {
      const { g, p } = relative(o)
      expect(reconcileOdds(g, p), `o ${o}`).toBe(0)
    }
  })

  it('is 0.0015 for each point of obligation and 0.15 at 100: clamp(0.0015 x max(0, o), 0, 0.15)', () => {
    expect(RECONCILE_PER_POINT).toBe(0.0015)
    expect(RECONCILE_MAX).toBe(0.15)
    for (const o of [1, 20, 33, 60, 99, 100]) {
      const { g, p } = relative(o)
      expect(reconcileOdds(g, p), `o ${o}`).toBeCloseTo(Math.min(0.15, 0.0015 * o), 10)
    }
    const top = relative(100)
    expect(reconcileOdds(top.g, top.p)).toBeCloseTo(0.15, 10)
  })

  it('never passes 0.15 or goes under 0 for a hostile obligation written round the writer', () => {
    for (const o of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1e300, -1e300, 1e9, '100', null, {}, [100]]) {
      const { g, p } = relative(null)
      ;(g.world as Record<string, unknown>).edges = { [toPlayer(g, p)]: { t: 50, f: 40, r: 50, s: 0, o, y: 2026, l: 2026 } }
      const out = reconcileOdds(g, p)
      expect(Number.isFinite(out), String(o)).toBe(true)
      expect(out, String(o)).toBeGreaterThanOrEqual(0)
      expect(out, String(o)).toBeLessThanOrEqual(0.15)
    }
  })

  it('reads a frozen game with a trapped g.rng and takes the world and the character only', () => {
    const { g, p } = relative(60)
    deepFreeze(trapRng(g))
    const before = json(g)
    expect(reconcileOdds({ world: g.world, character: g.character }, p)).toBeCloseTo(0.09, 10)
    expect(json(g)).toBe(before)
  })

  it('rises by 0.03 with a brokered peace (the broker adds 20 to the obligation of the relative)', () => {
    const { g, p } = relative(0)
    const giver = cast(g, 80, 'sibling')
    setEdge(g, giver, { t: 70 })
    const was = reconcileOdds(g, p)
    // the ask is rolled on the stream social: a life whose roll is under the least odds of a yes (0.25) is a certain yes
    for (let i = 1; i < 6000; i++) {
      g.lifeId = `life-${i}`
      if (actRoll(g, 'favor.broker', toPlayer(g, giver))() < 0.25) break
    }
    expect(runAct(g, broker(p), toPlayer(g, giver), giver)).not.toBeNull()
    expect(reconcileOdds(g, p) - was).toBeGreaterThan(0.029)
    expect(reconcileOdds(g, p) - was).toBeLessThan(0.031)
  })

  it('is the same function through the door of society/contract.ts', () => {
    expect(reconcileViaDoor).toBe(reconcileOdds)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 2. The peace odds of the will

describe('the peace odds of the will, with the society side', () => {
  function cutOut(o: number | null, stamped = true): { g: GameState; p: Person } {
    const g = stamped ? socialGame(1, { age: 60 }) : makeTestGame(1, { age: 60 })
    const p = cast(g, 45, 'sibling')
    p.data.wl = { by: g.character.id, anger: 40, cut: true, known: true }
    if (stamped && o !== null) setEdge(g, p, { o })
    return { g, p }
  }
  const percent = (g: GameState, p: Person): number => {
    const row = willPersonNodes(g, p).find((n): n is MenuAction => n.type === 'action' && n.id === 'will.peace')!
    return Number(/about (\d+)%/.exec(String(row.subtitle))![1])
  }

  it('shows exactly what peaceOdds says for a stamped pair with no obligation, and for a life that is not stamped', () => {
    for (const stamped of [true, false]) {
      const { g, p } = cutOut(0, stamped)
      expect(percent(g, p)).toBe(Math.round(peaceOdds(g, p) * 100))
    }
  })

  it('adds the obligation on a stamped pair: peaceOdds plus 0.0015 a point, held between 0.05 and 0.85', () => {
    for (const o of [20, 60, 100]) {
      const { g, p } = cutOut(o)
      const want = Math.min(0.85, Math.max(0.05, peaceOdds(g, p) + reconcileOdds(g, p)))
      expect(percent(g, p), `o ${o}`).toBe(Math.round(want * 100))
    }
    const plain = cutOut(0)
    const full = cutOut(100)
    expect(percent(full.g, full.p) - percent(plain.g, plain.p)).toBe(15)
  })

  it('leaves the unstamped life alone whatever an edge-shaped record says', () => {
    const { g, p } = cutOut(null, false)
    const was = percent(g, p)
    Object.assign(g, { world: { v: 1, edges: { [toPlayer(g, p)]: { t: 50, f: 45, r: 50, s: 0, o: 100, y: 2026, l: 2026 } } } })
    expect(percent(g, p)).toBe(was)
  })

  it('imports the society side through the door only', () => {
    const text = src('src/game/events/will-amends.ts')
    expect(text).toMatch(/from '\.\.\/society\/contract'/)
    expect(text).not.toMatch(/from '\.\.\/society\/(?!contract')/)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 3. betray

describe('betray', () => {
  function pair(): { g: GameState; p: Person } {
    const g = socialGame(1, { age: 40 })
    const p = cast(g, 80, 'friend')
    setEdge(g, p)
    return { g, p }
  }

  it('pins the betrayal on the edge of the person who was betrayed and costs 20 to 40 relationship by severity (the player did it)', () => {
    for (const [v, cost] of [[1, 20], [2, 25], [3, 30], [4, 35], [5, 40]] as const) {
      const { g, p } = pair()
      betray(g, toPlayer(g, p), v)
      expect(memoryKinds(g, ref(p), playerRef(g)), `severity ${v}`).toContain('betrayal')
      expect(PINNED_MEMORY_KINDS.has('betrayal')).toBe(true)
      expect(80 - p.relationship, `severity ${v}`).toBe(cost)
      expect(readEdge(g, ref(p), playerRef(g))!.f).toBe(p.relationship)
    }
  })

  it('does the same on the edge player > person when the person did it: the pinned memory is the player\'s, the cost is the person\'s relationship', () => {
    const { g, p } = pair()
    betray(g, fromPlayer(g, p), 3)
    expect(memoryKinds(g, playerRef(g), ref(p))).toContain('betrayal')
    expect(80 - p.relationship).toBe(30)
  })

  it('makes the victim a holder of a secret about the player when the player did it (an affair found out), and not the other way round', () => {
    const { g, p } = pair()
    betray(g, fromPlayer(g, p), 4)
    expect(secretsOf(g)).toEqual([])
    const q = cast(g, 80, 'friend')
    setEdge(g, q)
    betray(g, toPlayer(g, q), 4)
    const rows = secretsOf(g)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.secret).toMatchObject({ a: playerRef(g), k: 'affair', v: 4, h: [ref(q)], y: g.year })
  })

  it('betrays once in a year: a second call changes nothing', () => {
    const { g, p } = pair()
    betray(g, toPlayer(g, p), 3)
    const once = json(g)
    betray(g, toPlayer(g, p), 5)
    expect(json(g)).toBe(once)
  })

  it('still pins and costs when the 40 secrets are full: only the record is left out', () => {
    const { g, p } = pair()
    const others = Array.from({ length: 40 }, () => cast(g, 70, 'friend'))
    for (let i = 0; i < 40; i++) {
      g.year = 1990 + i
      expect(addSecret(g, playerRef(g), 'affair', 2, [others[i]!])).not.toBeNull()
    }
    g.year = 2026
    betray(g, toPlayer(g, p), 3)
    expect(memoryKinds(g, ref(p), playerRef(g))).toContain('betrayal')
    expect(p.relationship).toBe(50)
    expect(secretsOf(g)).toHaveLength(40)
  })

  it('is the same function through the door, and love.ts and the leak reach it that way', () => {
    expect(betrayViaDoor).toBe(betray)
    const text = src('src/game/love.ts')
    expect(text).toMatch(/from '\.\/society\/contract'/)
    expect(text).not.toMatch(/from '\.\/society\/(?!contract')/)
  })

  const blocked: readonly [string, (g: GameState, p: Person) => string, ((g: GameState, p: Person) => void)?, boolean?][] = [
    ['a life that is not stamped', (g, p) => toPlayer(g, p), undefined, false],
    ['the person dead', (g, p) => toPlayer(g, p), (_g, p) => void (p.alive = false)],
    ['the person a pet', (g, p) => toPlayer(g, p), (_g, p) => void (p.relation = 'pet')],
    ['the person not in the game', (g, p) => toPlayer(g, p), (g, p) => void (g.people = g.people.filter((x) => x.id !== p.id))],
    ['the player dead', (g, p) => toPlayer(g, p), (g) => void (g.character.alive = false)],
    ['an edge of another owner (the second end is not the ego)', (_g, p) => `${ref(p)}>person:old-ego`],
    ['an edge of another owner (the first end is not the ego)', (_g, p) => `person:old-ego>${ref(p)}`],
    ['an edge between two other people', (g, p) => `${ref(p)}>${ref(g.people.find((x) => x.id !== p.id)!)}`],
    ['a key that is not a key', () => 'person:p1>'],
    ['the player to themselves', (g) => `${playerRef(g)}>${playerRef(g)}`],
  ]

  for (const [name, key, change, stamped] of blocked) {
    it(`changes nothing for: ${name}`, () => {
      const g = stamped === false ? makeTestGame(1, { age: 40 }) : socialGame(1, { age: 40 })
      const p = cast(g, 80, 'friend')
      cast(g, 80, 'friend')
      if (stamped !== false) setEdge(g, p)
      change?.(g, p)
      const k = key(g, p)
      const before = json(g)
      const { rng, nextId } = g
      betray(g, k, 3)
      expect(json(g)).toBe(before)
      expect(g.rng).toBe(rng)
      expect(g.nextId).toBe(nextId)
    })
  }

  for (const v of [0, 6, -3, Number.NaN, Number.POSITIVE_INFINITY, 2.5, '3' as unknown as number]) {
    it(`changes nothing for a severity of ${String(v)}`, () => {
      const { g, p } = pair()
      const before = json(g)
      betray(g, toPlayer(g, p), v)
      expect(json(g)).toBe(before)
    })
  }
})

// ---------------------------------------------------------------------------------------------------------------------
// 4. The callers

describe('an affair found out (love.ts)', () => {
  function cheat(stamped: boolean, seed: number): { g: GameState; partner: Person } {
    const g = stamped ? socialGame(seed, { age: 30, money: 200_000, countryId: 'us' }) : makeTestGame(seed, { age: 30, money: 200_000, countryId: 'us' })
    g.log = [{ age: 30, year: g.year, entries: [] }]
    const partner = createPerson(g, { relation: 'partner', age: 29, relationship: 80, traits: ['kind', 'calm'], money: 1_000, countryId: 'us' })
    partner.data.datingSince = 26
    const friend = createPerson(g, { relation: 'friend', age: 29, relationship: 60 })
    hookUpWith(g, friend)
    g.queue = []
    return { g, partner }
  }
  const found = (g: GameState, p: Person): boolean => memoryKinds(g, ref(p), playerRef(g)).includes('betrayal')
  const caught = (s: number): boolean => {
    const r = cheat(true, s)
    return found(r.g, r.partner)
  }

  it('creates the secret before it leaks: an affair about the player, held by the partner who found out', () => {
    const seed = findSeed(caught, { label: 'an affair found out', tries: 400 })
    const { g, partner } = cheat(true, seed)
    const rows = secretsOf(g)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.secret).toMatchObject({ a: playerRef(g), k: 'affair', h: [ref(partner)], y: g.year })
    expect(rows[0]!.secret.p).toBeUndefined()
    expect(partner.relationship).toBeLessThanOrEqual(60)
  })

  it('writes no secret on a life that is not stamped, and an affair that is not found out writes none', () => {
    const seed = findSeed(caught, { label: 'an affair found out', tries: 400 })
    expect(secretsOf(cheat(false, seed).g)).toEqual([])
    const quiet = findSeed((s) => !caught(s), { label: 'an affair not found out', tries: 400 })
    expect(secretsOf(cheat(true, quiet).g)).toEqual([])
  })
})

describe('a leak betrays the leaker', () => {
  it('pins the betrayal on the player\'s edge to the holder and costs the holder 20 to 40 relationship, once', () => {
    const g = socialGame(1, { age: 30 })
    const list = [0, 1, 2, 3].map(() => cast(g, 70, 'friend'))
    const h = list[0]!
    putEdge(g, `${ref(h)}>${ref(list[1]!)}`, { t: 50, f: 90, r: 50, s: 0, o: 0, y: g.year, l: g.year })
    g.year -= 1
    const id = addSecret(g, playerRef(g), 'affair', 3, [h])!
    g.year += 1
    for (let i = 1; i < 6000; i++) {
      g.lifeId = `life-${i}`
      if (actRoll(g, 'leak', `${id}|${ref(h)}`)() < LEAK.base) break
    }
    leakPass(g)
    expect(readSecret(g, id)!.p).toBe(g.year)
    expect(memoryKinds(g, playerRef(g), ref(h))).toContain('betrayal')
    expect(70 - h.relationship).toBeGreaterThanOrEqual(20)
    expect(70 - h.relationship).toBeLessThanOrEqual(40)
  })
})

