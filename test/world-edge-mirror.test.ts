// R4-E7 (D.3, X6, X22, X23, C3): the mirror. Person.relationship stays the authority; on a life the social stamp marks, every change to
// it (addRelationship and setRelationship of core.ts, which tell the hook of kernel/relations.ts) is followed into the Edge
// `person > player` by world/edge-mirror.ts, and the legacy records (the money ties `data.w` and the will's feelings `data.wl`) are
// followed by syncLegacy (world/edge-step.ts) through the two total readers of world/edge-legacy.ts. A life nobody stamped is
// untouched: no edge and no shard.
//
// What the file proves, in the order of the plan:
//   1. The hook is bound after entering the game through aging and menus (the hub-entry pattern), and by loading life.ts alone.
//   2. The mirror does nothing for an unstamped life, a pet, a zero or unchanged change, a non-finite one or a person with no ref.
//   3. First touch, then f = the relationship after every call (a long mixed sequence, setRelationship too), offence adds to s (cap 100),
//      and the rest of an edge is left alone. No draw, no id, no write outside the world.
//   4. edge-legacy.ts: total and pure, equal to readTies and readWl on a valid record, blank for another owner or a hostile one.
//   5. syncLegacy: a debt, a floor on obligation, anger, a record of another owner, idempotence, the 100 x probe.
//   6. updateTies and updateWl sync when the life is stamped and write nothing else when it is not.
//   7. The yearly negative call sites, reviewed by hand: the list and the kind each passes.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { setRelationship } from '../src/game/core'
import { readTies, updateTies } from '../src/game/events/wealth-core'
import { readWl, updateWl } from '../src/game/events/will-core'
import { personEntity } from '../src/game/kernel/person-ref'
import type { RelKind } from '../src/game/kernel/relations'
import type { Person } from '../src/game/types'
import { legacyTies, legacyWl } from '../src/game/world/edge-legacy'
import { syncLegacy } from '../src/game/world/edge-step'
import { putEdge } from '../src/game/world/edge-write'
import { EDGE_CAPS } from '../src/game/world/caps'
import { edgeProblems, edgesOf, readEdge, type Edge } from '../src/game/world/edges'
import { worldProblems } from '../src/game/world/invariants'
import { playerRef } from '../src/game/world/people'
import { readWorld } from '../src/game/world/state'
import { trapRng } from './effort-kit'
import { makeTestGame } from './helpers'
import { cast, socialGame } from './social-kit'
import { applyDelta } from './social-parity-kit'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')

// A fixed life as a constant, not a pin of the form the seed ratchet counts (test/seed-pins.test.ts).
const LIFE_SEED = 5

/** The edge `person > player` of a person, or null. */
const edgeOf = (g: ReturnType<typeof socialGame>, p: Person): Readonly<Edge> | null => readEdge(g, personEntity(p), playerRef(g))
const rootOf = (g: ReturnType<typeof socialGame>): unknown => readWorld(g).edges

// ---------------------------------------------------------------------------------------------------------------------
// 1. The hook is bound

describe('the relationship hook is bound', () => {
  it('after entering the game through aging and menus, the way the app does (hub-entry)', async () => {
    vi.resetModules()
    await import('../src/game/aging')
    await import('../src/game/menus')
    const core = await import('../src/game/core')
    const { makeTestGame: make } = await import('./helpers')
    const { stampSocial } = await import('../src/game/world/social')
    const { readEdge: read } = await import('../src/game/world/edges')
    const { playerRef: ego } = await import('../src/game/world/people')
    const { createPerson } = await import('../src/game/people')
    const g = make(3)
    stampSocial(g)
    const p = createPerson(g, { relation: 'friend', age: 30, gender: 'female', firstName: 'Ann', lastName: 'Test', relationship: 60, occupation: 'Clerk', traits: ['kind', 'calm'], money: 0, stats: { happiness: 60, health: 70, smarts: 50, looks: 50 } })
    core.setRelationship(g, p, p.relationship - 10)
    const e = read(g, personEntity(p), ego(g))
    expect(e, 'no edge: the mirror is not bound after aging and menus').not.toBeNull()
    expect(e!.f).toBe(50)
  }, 120_000)

  it('after loading life.ts alone: a life that createNewLife stamped mirrors its first change', async () => {
    vi.resetModules()
    const { createNewLife } = await import('../src/game/life')
    const { withFlags } = await import('../src/game/flags')
    const { setRelationship: set } = await import('../src/game/core')
    const { readEdge: read } = await import('../src/game/world/edges')
    const { playerRef: ego } = await import('../src/game/world/people')
    const { socialOn } = await import('../src/game/world/social')
    const g = withFlags({ social: true }, () => createNewLife({ seed: LIFE_SEED, year: 1990, countryId: 'us' }))
    expect(socialOn(g)).toBe(true)
    const p = g.people.find((x) => x.relation === 'parent')!
    const before = p.relationship
    set(g, p, before - 7)
    const e = read(g, personEntity(p), ego(g))
    expect(e).not.toBeNull()
    expect(e!.f).toBe(p.relationship)
    expect(p.relationship).toBeLessThan(before)
  }, 120_000)
})

// ---------------------------------------------------------------------------------------------------------------------
// 2. When it does nothing

describe('the mirror does nothing', () => {
  it('for a life that is not stamped: no edge, no shard, no world', () => {
    const g = makeTestGame(2)
    const p = cast(g, 60)
    applyDelta(g, p, -20)
    setRelationship(g, p, 10)
    applyDelta(g, p, 9, 'decay')
    expect(g.world).toBeUndefined()
    expect(p.relationship).toBe(19)
  })

  it('for a hostile stamp (on is not 1): the life is not stamped', () => {
    const g = makeTestGame(2)
    g.world = { v: 1, social: { v: 1, on: 0, y: 2026, fy: 2026 } } as never
    const p = cast(g, 60)
    applyDelta(g, p, -20)
    expect((g.world as Record<string, unknown>).edges).toBeUndefined()
  })

  it('for a pet', () => {
    const g = socialGame(2)
    const dog = cast(g, 90, 'pet')
    applyDelta(g, dog, -30)
    setRelationship(g, dog, 5)
    expect(rootOf(g)).toBeUndefined()
  })

  it('for a zero change, a change that does not move the number and a number that is not finite', () => {
    const g = socialGame(2)
    const a = cast(g, 100)
    const b = cast(g, 0)
    const c = cast(g, 50)
    applyDelta(g, c, 0)
    applyDelta(g, a, 5)
    applyDelta(g, b, -5)
    applyDelta(g, c, Number.NaN)
    applyDelta(g, c, Number.POSITIVE_INFINITY)
    setRelationship(g, c, 50)
    setRelationship(g, c, Number.NaN)
    expect(rootOf(g), 'no edge for any of them').toBeUndefined()
    expect(a.relationship).toBe(100)
    expect(b.relationship).toBe(0)
  })

  it('for a person who has no ref (an id that is no name)', () => {
    const g = socialGame(2)
    const p = cast(g, 60)
    p.id = 'not a name'
    expect(personEntity(p)).toBe('pool:other')
    applyDelta(g, p, -10)
    expect(rootOf(g)).toBeUndefined()
    expect(p.relationship).toBe(50)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 3. What it writes

describe('the mirror writes the edge person > player', () => {
  it('makes the edge at the first touch: t 50, r 50, o 0, this year, f the number after', () => {
    const g = socialGame(4)
    g.year = 2031
    const p = cast(g, 60)
    applyDelta(g, p, 15)
    expect(edgeOf(g, p)).toEqual({ t: 50, f: 75, r: 50, s: 0, o: 0, y: 2031, l: 2031 })
    expect(Object.keys(rootOf(g) as object)).toEqual([`${personEntity(p)}>${playerRef(g)}`])
  })

  it('an offence adds what was lost to s, and the cap is 100', () => {
    const g = socialGame(4)
    const p = cast(g, 90)
    applyDelta(g, p, -30)
    expect(edgeOf(g, p)!.f).toBe(60)
    expect(edgeOf(g, p)!.s).toBe(30)
    setRelationship(g, p, 5)
    expect(edgeOf(g, p)!.s).toBe(85)
    applyDelta(g, p, 80)
    expect(edgeOf(g, p)!.s, 'affection adds nothing').toBe(85)
    applyDelta(g, p, -80)
    expect(edgeOf(g, p)!.s, 'a total over 100 is cut at 100').toBe(100)
    for (let i = 0; i < 100; i++) {
      applyDelta(g, p, 100)
      applyDelta(g, p, -100)
    }
    expect(edgeOf(g, p)!.s).toBe(100)
  })

  it('a decay is a change of f and adds nothing to s, whatever its sign', () => {
    const g = socialGame(4)
    const p = cast(g, 70)
    applyDelta(g, p, -9, 'decay')
    applyDelta(g, p, 3, 'decay')
    expect(edgeOf(g, p)!.f).toBe(64)
    expect(edgeOf(g, p)!.s).toBe(0)
  })

  it('an explicit kind is followed: offence on a rise adds nothing, affection on a fall adds nothing', () => {
    const g = socialGame(4)
    const p = cast(g, 50)
    applyDelta(g, p, 10, 'offence')
    applyDelta(g, p, -10, 'affection')
    expect(edgeOf(g, p)!.s).toBe(0)
    expect(edgeOf(g, p)!.f).toBe(50)
  })

  it('touches l but leaves every other field of an edge it did not make alone', () => {
    const g = socialGame(4)
    g.year = 2040
    const p = cast(g, 50)
    const key = `${personEntity(p)}>${playerRef(g)}`
    expect(putEdge(g, key, { t: 71, f: 50, r: 33, s: 12, o: -8, y: 2000, l: 2035, m: ['betrayal.2030.2.e'], k: 'kin', q: [2, 2036, 5], c: 2038 })).toBe(true)
    applyDelta(g, p, -4)
    expect(edgeOf(g, p)).toEqual({ t: 71, f: 46, r: 33, s: 16, o: -8, y: 2000, l: 2040, m: ['betrayal.2030.2.e'], k: 'kin', q: [2, 2036, 5], c: 2038 })
  })

  it('names a person with a sid by the sid', () => {
    const g = socialGame(4)
    const p = cast(g, 50, 'friend', { data: { sid: 'cls.us.2004.12' } })
    applyDelta(g, p, 10)
    expect(Object.keys(rootOf(g) as object)).toEqual([`person:cls.us.2004.12>${playerRef(g)}`])
  })

  it('keeps f equal to the relationship through a long mixed sequence of 12 people (affection, offence, decay, raw writes)', () => {
    const g = socialGame(9)
    const people = Array.from({ length: 12 }, (_, i) => cast(g, 5 + i * 8, i % 5 === 0 ? 'parent' : i % 3 === 0 ? 'sibling' : 'friend'))
    const kinds: (RelKind | undefined)[] = [undefined, 'affection', 'offence', 'decay']
    let x = 12345
    const next = (n: number): number => {
      x = (Math.imul(x, 1664525) + 1013904223) >>> 0
      return x % n
    }
    for (let i = 0; i < 600; i++) {
      const p = people[next(people.length)]!
      if (next(5) === 0) setRelationship(g, p, next(101))
      else applyDelta(g, p, next(61) - 30, kinds[next(kinds.length)])
      if (i % 25 === 0) g.year += 1
      for (const q of people) {
        const e = edgeOf(g, q)
        if (e !== null) expect(e.f, `${q.firstName} after step ${i}`).toBe(q.relationship)
      }
    }
    expect(people.filter((q) => edgeOf(g, q) !== null).length).toBeGreaterThan(8)
    expect(edgeProblems(rootOf(g), g.people, playerRef(g))).toEqual([])
    expect(worldProblems(g, { live: false })).toEqual([])
  })

  it('draws no number, makes no id and writes nothing outside the world', () => {
    const g = socialGame(6)
    const p = cast(g, 60)
    // everything but the world, the dice and the numbers the changes are about
    const outside = (): string => JSON.stringify({ ...g, rng: undefined, world: undefined, people: g.people.map((x) => ({ ...x, relationship: 0 })) })
    const nextId = g.nextId
    const before = outside()
    trapRng(g)
    applyDelta(g, p, -12)
    setRelationship(g, p, 33)
    applyDelta(g, p, 4, 'decay')
    // a read of g.rng would have thrown: the mirror drew nothing
    expect(g.nextId).toBe(nextId)
    expect(outside()).toBe(before)
    expect(edgeOf(g, p)!.f).toBe(37)
  })

  it('leaves a person alone when the map is full of bound edges: the number moves, no edge is made', () => {
    const g = socialGame(4)
    const ego = playerRef(g)
    for (let i = 0; i < EDGE_CAPS.edges; i++) {
      const key = `person:b${String(i).padStart(5, '0')}>${ego}`
      expect(putEdge(g, key, { t: 50, f: 50, r: 50, s: 0, o: 0, y: 2020, l: 2020, k: 'kin' })).toBe(true)
    }
    const p = cast(g, 60)
    applyDelta(g, p, -15)
    expect(p.relationship).toBe(45)
    expect(edgeOf(g, p)).toBeNull()
    expect(Object.keys(rootOf(g) as object)).toHaveLength(EDGE_CAPS.edges)
  })

  it('evicts a weak unbound edge for a new one when the map is full, as the writer does', () => {
    const g = socialGame(4)
    const ego = playerRef(g)
    for (let i = 0; i < EDGE_CAPS.edges; i++) {
      const key = `person:w${String(i).padStart(5, '0')}>${ego}`
      expect(putEdge(g, key, { t: 50, f: 10 + (i % 5), r: 50, s: 0, o: 0, y: 2020, l: 2020 })).toBe(true)
    }
    const p = cast(g, 60)
    applyDelta(g, p, -15)
    expect(edgeOf(g, p)!.f).toBe(45)
    expect(Object.keys(rootOf(g) as object)).toHaveLength(EDGE_CAPS.edges)
  })

  it('mirrors the people of one ego only: edges of another ego are not touched', () => {
    const g = socialGame(4)
    const p = cast(g, 50)
    const other = `${personEntity(p)}>person:oldego`
    expect(putEdge(g, other, { t: 40, f: 40, r: 40, s: 0, o: 0, y: 2000, l: 2000 })).toBe(true)
    applyDelta(g, p, 20)
    expect(readEdge(g, personEntity(p), 'person:oldego')!.f).toBe(40)
    expect(edgeOf(g, p)!.f).toBe(70)
    expect(edgesOf(g, personEntity(p))).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 4. The two legacy readers

const EGO = 'ego1'

describe('edge-legacy.ts reads data.w and data.wl for the current ego, totally', () => {
  const holder = (data: Record<string, unknown>): Pick<Person, 'data'> => ({ data: data as Person['data'] })

  const TIES: readonly (readonly [string, unknown])[] = [
    ['a valid record', { by: EGO, owes: 120, owesSince: 2019 }],
    ['a fraction', { by: EGO, owes: 120.6, owesSince: 2019.4 }],
    ['a negative debt', { by: EGO, owes: -50, owesSince: 2019 }],
    ['text', { by: EGO, owes: '500', owesSince: '2019' }],
    ['not a number', { by: EGO, owes: Number.NaN, owesSince: Number.NaN }],
    ['infinite', { by: EGO, owes: Number.POSITIVE_INFINITY, owesSince: Number.NEGATIVE_INFINITY }],
    ['huge', { by: EGO, owes: 1e300, owesSince: 1e300 }],
    ['another owner', { by: 'someone-else', owes: 900, owesSince: 2001 }],
    ['no owner', { owes: 900, owesSince: 2001 }],
    ['an array', [EGO, 900]],
    ['null', null],
    ['a number', 7],
    ['text instead of a record', EGO],
    ['nothing', undefined],
  ]

  it('legacyTies equals readTies on every record, valid or hostile', () => {
    for (const [name, raw] of TIES) {
      const g = socialGame(1)
      g.character.id = EGO
      const p = cast(g, 50)
      if (raw !== undefined) p.data.w = raw as never
      const t = readTies(g, p)
      expect(legacyTies(p, EGO), name).toEqual({ owes: t.owes, since: t.owesSince })
    }
  })

  const WLS: readonly (readonly [string, unknown])[] = [
    ['a valid record', { by: EGO, anger: 55, cut: true, estr: true }],
    ['a fraction', { by: EGO, anger: 55.5, cut: false, estr: false }],
    ['over the top', { by: EGO, anger: 9e9, cut: true }],
    ['below zero', { by: EGO, anger: -20, estr: true }],
    ['text', { by: EGO, anger: '80', cut: 'true', estr: 1 }],
    ['not a number', { by: EGO, anger: Number.NaN, cut: true }],
    ['infinite', { by: EGO, anger: Number.POSITIVE_INFINITY, estr: true }],
    ['another owner', { by: 'someone-else', anger: 90, cut: true, estr: true }],
    ['no owner', { anger: 90, cut: true, estr: true }],
    ['an array', [EGO, 90]],
    ['null', null],
    ['text instead of a record', EGO],
    ['nothing', undefined],
  ]

  it('legacyWl equals readWl on every record, valid or hostile', () => {
    for (const [name, raw] of WLS) {
      const g = socialGame(1)
      g.character.id = EGO
      const p = cast(g, 50)
      if (raw !== undefined) p.data.wl = raw as never
      const w = readWl(g, p)
      expect(legacyWl(p, EGO), name).toEqual({ anger: w.anger, cut: w.cut, estr: w.estr })
    }
  })

  it('a record whose by is not the ego reads as blank, even with the ego passed as something odd', () => {
    const p = holder({ w: { by: 'x', owes: 5, owesSince: 3 }, wl: { by: 'x', anger: 5, cut: true, estr: true } })
    expect(legacyTies(p, EGO)).toEqual({ owes: 0, since: 0 })
    expect(legacyWl(p, EGO)).toEqual({ anger: 0, cut: false, estr: false })
    const q = holder({ w: { owes: 5, owesSince: 3 }, wl: { anger: 5, cut: true } })
    for (const odd of [undefined, null, 0, {}, ''] as unknown[]) {
      expect(legacyTies(q, odd as string)).toEqual({ owes: 0, since: 0 })
      expect(legacyWl(q, odd as string)).toEqual({ anger: 0, cut: false, estr: false })
    }
  })

  it('is total on a person with no data, a data that is no object and a getter that throws', () => {
    expect(legacyTies({} as Pick<Person, 'data'>, EGO)).toEqual({ owes: 0, since: 0 })
    expect(legacyWl({ data: null } as unknown as Pick<Person, 'data'>, EGO)).toEqual({ anger: 0, cut: false, estr: false })
    expect(legacyTies({ data: 'x' } as unknown as Pick<Person, 'data'>, EGO)).toEqual({ owes: 0, since: 0 })
    const bomb = { get w(): never { throw new Error('boom') }, get wl(): never { throw new Error('boom') } }
    expect(legacyTies({ data: bomb } as unknown as Pick<Person, 'data'>, EGO)).toEqual({ owes: 0, since: 0 })
    expect(legacyWl({ data: bomb } as unknown as Pick<Person, 'data'>, EGO)).toEqual({ anger: 0, cut: false, estr: false })
  })

  it('reads and writes nothing: a frozen person gives the same answer twice', () => {
    const p = holder({ w: Object.freeze({ by: EGO, owes: 40, owesSince: 2020 }), wl: Object.freeze({ by: EGO, anger: 30, cut: true, estr: false }) })
    Object.freeze(p.data)
    expect(legacyTies(p, EGO)).toEqual({ owes: 40, since: 2020 })
    expect(legacyTies(p, EGO)).toEqual(legacyTies(p, EGO))
    expect(legacyWl(p, EGO)).toEqual({ anger: 30, cut: true, estr: false })
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 5. syncLegacy

/** A stamped game in 2030 and a friend; the ego is g.character.id. */
function lent(owes: number, since: number, relationship = 50): { g: ReturnType<typeof socialGame>; p: Person } {
  const g = socialGame(5)
  g.year = 2030
  const p = cast(g, relationship)
  p.data.w = { by: g.character.id, owes, owesSince: since } as never
  return { g, p }
}

describe('syncLegacy', () => {
  it('lays a kind-0 debt on the edge the person owes: owed, since, no interest, nothing paid', () => {
    const { g, p } = lent(500, 2028, 63)
    syncLegacy(g, p)
    const e = edgeOf(g, p)!
    expect(e.dv).toEqual([500, 0, 2028, 0, 0])
    expect(e.f).toBe(63)
    expect(e.t).toBe(50)
    expect(e.y).toBe(2030)
  })

  it('raises obligation to a floor that grows with the years owed and stops at 100 (the planner\'s numbers are tested as a range)', () => {
    const o = (years: number): number => {
      const { g, p } = lent(500, 2030 - years)
      syncLegacy(g, p)
      return edgeOf(g, p)!.o
    }
    expect(o(0)).toBeGreaterThanOrEqual(20)
    expect(o(0)).toBeLessThanOrEqual(30)
    let last = o(0)
    for (const years of [1, 2, 3, 5, 8, 12, 30, 100]) {
      const now = o(years)
      expect(now, `${years} years`).toBeGreaterThanOrEqual(last)
      expect(now).toBeLessThanOrEqual(100)
      last = now
    }
    expect(o(100)).toBe(100)
    expect(o(5)).toBeGreaterThan(o(0))
  })

  it('only raises obligation: a higher o stays, and the sync does not lower it', () => {
    const { g, p } = lent(500, 2029)
    const key = `${personEntity(p)}>${playerRef(g)}`
    expect(putEdge(g, key, { t: 50, f: 50, r: 50, s: 0, o: 90, y: 2020, l: 2020 })).toBe(true)
    syncLegacy(g, p)
    expect(edgeOf(g, p)!.o).toBe(90)
    expect(edgeOf(g, p)!.dv).toEqual([500, 0, 2029, 0, 0])
  })

  it('follows a changed debt: more owed, then paid off removes the kind-0 debt and leaves o to the acts', () => {
    const { g, p } = lent(500, 2028)
    syncLegacy(g, p)
    const raised = edgeOf(g, p)!.o
    ;(p.data.w as Record<string, unknown>).owes = 900
    syncLegacy(g, p)
    expect(edgeOf(g, p)!.dv![0]).toBe(900)
    ;(p.data.w as Record<string, unknown>).owes = 0
    syncLegacy(g, p)
    expect(edgeOf(g, p)!.dv).toBeUndefined()
    expect(edgeOf(g, p)!.o, 'o is left to the acts').toBe(raised)
  })

  it('removes only a kind-0 debt: a divorce debt (kind 1) stays, and is not overwritten by a loan', () => {
    const { g, p } = lent(0, 0)
    const key = `${personEntity(p)}>${playerRef(g)}`
    expect(putEdge(g, key, { t: 50, f: 50, r: 50, s: 0, o: 0, y: 2020, l: 2020, dv: [3000, 5, 2025, 1, 200] })).toBe(true)
    syncLegacy(g, p)
    expect(edgeOf(g, p)!.dv).toEqual([3000, 5, 2025, 1, 200])
    ;(p.data.w as Record<string, unknown>).owes = 700
    ;(p.data.w as Record<string, unknown>).owesSince = 2027
    syncLegacy(g, p)
    expect(edgeOf(g, p)!.dv).toEqual([3000, 5, 2025, 1, 200])
  })

  it('makes no edge when there is nothing to follow: no debt, no anger, no edge', () => {
    const g = socialGame(5)
    const p = cast(g, 50)
    syncLegacy(g, p)
    p.data.w = { by: g.character.id, owes: 0, owesSince: 0 } as never
    p.data.wl = { by: g.character.id, anger: 0, cut: true, estr: true } as never
    syncLegacy(g, p)
    expect(rootOf(g)).toBeUndefined()
  })

  it('s is at least the anger of a will record of the current ego, and never lowered', () => {
    const g = socialGame(5)
    const p = cast(g, 50)
    p.data.wl = { by: g.character.id, anger: 60, cut: false, estr: false } as never
    syncLegacy(g, p)
    expect(edgeOf(g, p)!.s).toBe(60)
    ;(p.data.wl as Record<string, unknown>).anger = 20
    syncLegacy(g, p)
    expect(edgeOf(g, p)!.s, 'max(s, anger)').toBe(60)
    ;(p.data.wl as Record<string, unknown>).anger = 75
    syncLegacy(g, p)
    expect(edgeOf(g, p)!.s).toBe(75)
  })

  it('syncs nothing from a record stamped by another owner (a hostile or an older generation)', () => {
    const g = socialGame(5)
    const p = cast(g, 50)
    p.data.w = { by: 'the-late-player', owes: 9999, owesSince: 1999 } as never
    p.data.wl = { by: 'the-late-player', anger: 99, cut: true, estr: true } as never
    syncLegacy(g, p)
    expect(rootOf(g)).toBeUndefined()
    applyDelta(g, p, -5)
    syncLegacy(g, p)
    expect(edgeOf(g, p)!.s).toBe(5)
    expect(edgeOf(g, p)!.dv).toBeUndefined()
    expect(edgeOf(g, p)!.o).toBe(0)
  })

  it('is idempotent: a second call writes nothing and keeps the very map', () => {
    const { g, p } = lent(500, 2027)
    p.data.wl = { by: g.character.id, anger: 40, cut: false, estr: false } as never
    syncLegacy(g, p)
    const root = rootOf(g)
    const text = JSON.stringify(root)
    syncLegacy(g, p)
    syncLegacy(g, p)
    expect(rootOf(g)).toBe(root)
    expect(JSON.stringify(rootOf(g))).toBe(text)
  })

  it('does nothing for a life that is not stamped, a pet or a person with no ref', () => {
    const g = makeTestGame(5)
    const p = cast(g, 50)
    p.data.w = { by: g.character.id, owes: 500, owesSince: 2020 } as never
    syncLegacy(g, p)
    expect(g.world).toBeUndefined()
    const s = socialGame(5)
    const dog = cast(s, 80, 'pet')
    dog.data.w = { by: s.character.id, owes: 500, owesSince: 2020 } as never
    syncLegacy(s, dog)
    const odd = cast(s, 80)
    odd.id = 'not a name'
    odd.data.w = { by: s.character.id, owes: 500, owesSince: 2020 } as never
    syncLegacy(s, odd)
    expect(rootOf(s)).toBeUndefined()
  })

  it('holds at 100 times: a debt of 1e300 since the year 1 gives o 100 and a debt the edge model accepts', () => {
    for (const [owes, since] of [[1e300, 1], [1e300, -5], [1e300, 1e12], [5e12, 1900], [1e12, 2030]] as const) {
      const { g, p } = lent(owes, since)
      syncLegacy(g, p)
      const e = edgeOf(g, p)!
      expect(e.dv, `${owes} since ${since}`).toBeDefined()
      expect(e.dv![0]).toBeLessThanOrEqual(1e12)
      expect(e.dv![0]).toBeGreaterThan(0)
      expect(Number.isInteger(e.dv![2])).toBe(true)
      expect(e.o).toBeLessThanOrEqual(100)
      expect(edgeProblems(rootOf(g), g.people, playerRef(g))).toEqual([])
    }
  })

  it('a year in the future for the debt reads as this year, not as a negative age', () => {
    const { g, p } = lent(300, 2099)
    syncLegacy(g, p)
    expect(edgeOf(g, p)!.o).toBeGreaterThanOrEqual(20)
    expect(edgeOf(g, p)!.o).toBeLessThanOrEqual(30)
    expect(edgeOf(g, p)!.dv![2], 'a debt cannot begin after today').toBe(2030)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 6. The two writers of the legacy records follow themselves into the edge

describe('updateTies and updateWl', () => {
  it('on a stamped life, a loan written through updateTies is on the edge at once', () => {
    const g = socialGame(8)
    g.year = 2033
    const p = cast(g, 55)
    updateTies(g, p, (t) => {
      t.owes = 1200
      t.owesSince = 2033
    })
    expect(edgeOf(g, p)!.dv).toEqual([1200, 0, 2033, 0, 0])
    updateTies(g, p, (t) => {
      t.owes = 0
    })
    expect(edgeOf(g, p)!.dv).toBeUndefined()
  })

  it('on a stamped life, anger written through updateWl is on the edge at once', () => {
    const g = socialGame(8)
    const p = cast(g, 55)
    updateWl(g, p, (w) => {
      w.anger = 45
      w.cut = true
    })
    expect(edgeOf(g, p)!.s).toBe(45)
    expect(edgeOf(g, p)!.f).toBe(55)
  })

  it('on a life that is not stamped they write the record and nothing else', () => {
    const g = makeTestGame(8)
    const p = cast(g, 55)
    updateTies(g, p, (t) => {
      t.owes = 1200
      t.owesSince = 2033
    })
    updateWl(g, p, (w) => {
      w.anger = 45
    })
    expect(g.world).toBeUndefined()
    expect(readTies(g, p).owes).toBe(1200)
    expect(readWl(g, p).anger).toBe(45)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 7. The yearly negative call sites, reviewed by hand (the list)

/**
 * The call sites of addRelationship that a yearly step reaches and that can lower a number, read by hand in R4-E7. The kind says what
 * the mirror does with a fall: `decay` is the slow drift (it adds nothing to resentment), `offence` is a slight somebody did (the
 * default: the fall is added to resentment). A site that is an event, a quarrel, a refusal or a chase is an offence even when it runs
 * in a yearly step. Only the drift and the nepo mood steps are decay.
 */
const YEARLY_NEGATIVE: readonly (readonly [file: string, fn: string, kind: 'decay' | 'offence', why: string])[] = [
  ['relationships.ts', 'driftRelationships', 'decay', 'the slow loss of contact: every living person, every year'],
  ['business/nepo-year.ts', 'step (the two mood steps)', 'decay', 'a relative who likes or hates the job drifts by 1 or 2 a year'],
  ['relationships.ts', 'partnerDrama', 'offence', 'a partner who cheats, nags or is caught: a slight'],
  ['business/nepo-year.ts', 'step (a relative leaves)', 'offence', 'a relative who quits or burns out: a slight'],
  ['business/nepo-year.ts', 'siblingDrama', 'offence', 'the favoured and the passed over argue: a slight'],
  ['events/wealth.ts', 'payAllowances', 'offence', 'a missed allowance is felt'],
  ['events/wealth.ts', 'collectLoans', 'offence', 'chasing a loan that was not repaid is felt'],
  ['events/wealth.ts', 'settleVentures', 'offence', 'a venture that went wrong is felt'],
]

function sources(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...sources(path))
    else if (/\.tsx?$/.test(name)) out.push(path)
  }
  return out
}

describe('the yearly negative call sites of addRelationship', () => {
  const src = (rel: string): string => readFileSync(join(ROOT, 'src/game', rel), 'utf8')

  it('lists every site by name, and each one is in the file the list says', () => {
    for (const [file, fn] of YEARLY_NEGATIVE) {
      const name = fn.split(' ')[0]!
      expect(src(file), `${file} ${fn}`).toMatch(new RegExp(`function ${name}\\b`))
    }
  })

  it('exactly four calls pass decay: the two drift writes and the two mood steps', () => {
    const found: string[] = []
    for (const path of sources(join(ROOT, 'src/game'))) {
      const text = readFileSync(path, 'utf8')
      for (const m of text.matchAll(/addRelationship\(g, [^\n]*'decay'\)/g)) found.push(`${path.slice(join(ROOT, 'src/game').length + 1)}: ${m[0]}`)
    }
    expect(found.map((f) => f.split(':')[0]).sort()).toEqual(['business/nepo-year.ts', 'business/nepo-year.ts', 'relationships.ts', 'relationships.ts'])
    const decayNames = YEARLY_NEGATIVE.filter((r) => r[2] === 'decay').map((r) => r[0])
    expect(new Set(decayNames)).toEqual(new Set(['relationships.ts', 'business/nepo-year.ts']))
  })

  it('driftRelationships passes decay on both of its writes, and the mood steps on both of theirs', () => {
    const drift = src('relationships.ts')
    const body = drift.slice(drift.indexOf('export function driftRelationships'), drift.indexOf('// --- Partner drama'))
    expect(body).toContain("addRelationship(g, p, randInt(g, 0, 3), 'decay')")
    expect(body).toContain("addRelationship(g, p, -Math.round(d), 'decay')")
    const nepo = src('business/nepo-year.ts')
    expect(nepo).toContain("addRelationship(g, p, 1, 'decay')")
    expect(nepo).toContain("addRelationship(g, p, -2, 'decay')")
  })
})
