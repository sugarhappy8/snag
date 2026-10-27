// ci: fast
// R4-L9 (D.9 a; X15, X22, X28, X33, X34, X39, C10, C11, C12, C21): the hand-over rebuilds people with what they felt. continueAsChild
// (src/game/life.ts) builds the next generation from the heir's seat. On a STAMPED life (X6) it keeps what the family felt and the people
// the player was bound to, and the heir's NPC spouse comes over with the same face. An unstamped life hands over exactly as v5.2.0.
//
// The file has two halves, in the order of the plan's behaviour list. The first half is the blend and the spouse (part A of the task):
//   1. The blend (X33). The seven re-rolls keep their order and count, so `n.rng` and `n.nextId` equal the unstamped twin's. A direct kin
//      (the other parent, the late player's spouse as a stepparent, a sibling, a grandparent, the heir's own child) is
//      round((roll + old) / 2), where `roll` is what the unstamped twin got from the same dice. The heir's spouse and the pets are as before.
//   2. The heir's spouse (C21, X15). With a valid `spouseSid` and a Met record the call keeps its draws and the record gives the name,
//      gender, age and the sid; a Person that already holds the sid is reset to spouse and no second Person ever shares the account; a
//      garbage link, a tombstone, a dead record and an unstamped life take the old path. `heirSpouseOverrides` is pure and total.
// The second half is part B: the kept contacts (the old rule at half strength, bound persons, the best friends, feud enemies, at most
// 40), the edge copy (`t`, `r` and a non-kin's `f` at 0.5, `s` at 0.6, `f === Person.relationship`, a kin's `q` kept and a rival's gone,
// a merge into an existing edge, nothing ends at the late ego) and the notes and stamps that stay as they are.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { killCharacter } from '../src/game/death'
import { readTies, updateTies } from '../src/game/events/wealth-core'
import { readWl, updateWl } from '../src/game/events/will-core'
import { heirUnsafe, personEntity, personKey } from '../src/game/kernel/person-ref'
import { adoptSpouse, syncKin } from '../src/game/kin'
import { continueAsChild } from '../src/game/life'
import { materializePerson } from '../src/game/materialize'
import { heirSpouseOverrides } from '../src/game/modules/heirs'
import type { GameState, Gender, Person, RelationKind } from '../src/game/types'
import { formatMemory } from '../src/game/world/edge-memory'
import { putEdge } from '../src/game/world/edge-write'
import { edgeKey, edgeProblems, readEdge, type Edge } from '../src/game/world/edges'
import { worldProblems } from '../src/game/world/invariants'
import { kinProblems } from '../src/game/world/kin'
import { metRecord } from '../src/game/world/met'
import { markMet, tombstoneMet, touchMet } from '../src/game/world/met-ops'
import { playerRef } from '../src/game/world/people'
import { socialOn, stampSocial } from '../src/game/world/social'
import { readWorld } from '../src/game/world/state'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'
import { withLife } from './kin-kit'
import { acctOf, expectConserved } from './ledger-kit'
import { cast } from './social-kit'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8')
const person = (id: string): `person:${string}` => `person:${id}`

// ---------------------------------------------------------------------------------------------------------------------
// The family

interface Fam {
  g: GameState
  /** The cast by seat: ex, wife, heir, sib1, sib2, gp, grand, pet, and whatever a test's `prepare` adds. */
  who: Record<string, Person>
  /** The heir's spouse record (a stamped scene with `link`), else null. */
  sid: string | null
}

interface Opts {
  stamped: boolean
  /** The relationship every direct kin has before the death. */
  old?: number
  /** A stamped scene gives the heir a spouse record ('record'), or also a Person who holds its sid ('holder'), or a link to nothing ('garbage'). */
  link?: 'none' | 'record' | 'holder' | 'garbage'
  /** The gender the record has (the legacy rule gives the opposite of a straight heir's). */
  spouseGender?: Gender
  sexuality?: 'straight' | 'bisexual'
  /** Anything else the scene needs before the death. */
  prepare?: (f: Fam) => void
}

/**
 * The late player of 70 with $400,000 and a family: an ex who is the heir's other parent, a wife (a stepparent), two siblings and a
 * grandparent of the heir, the heir's own child, a dog, and the heir (30, married by the legacy fields to Ana Ruiz, who lives with them).
 * Everything is built with every field given, so nothing here draws and the stamped and unstamped scenes get the same ids and dice.
 */
function fam(seed: number, o: Opts): Fam {
  const old = o.old ?? 50
  const g = makeTestGame(seed, { age: 70, money: 400_000, countryId: 'us', gender: 'male', residence: { status: 'renting', rent: 0 } })
  g.log = [{ age: 70, year: g.year, entries: [] }]
  if (o.stamped) stampSocial(g)
  const kin = (relation: RelationKind, age: number, extra: Partial<Parameters<typeof cast>[3]> = {}): Person => cast(g, old, relation, { age, countryId: 'us', money: 20_000, ...extra })
  const ex = kin('exSpouse', 68, { gender: 'female' })
  const wife = kin('spouse', 66, { gender: 'female', livesWithPlayer: true })
  const heir = kin('child', 30, {
    gender: 'male',
    relationship: 70,
    livesWithPlayer: true,
    data: { married: true, spouseName: 'Ana Ruiz', sexuality: o.sexuality ?? 'straight', kids: 1, birthday: { month: 5, day: 17 } },
  })
  const sib1 = kin('child', 33, { gender: 'female' })
  const sib2 = kin('child', 27, { gender: 'male' })
  const gp = kin('parent', 95, { gender: 'female' })
  const grand = kin('grandchild', 6, { gender: 'female', data: { parentId: heir.id } })
  const pet = cast(g, 80, 'pet', { age: 4 })
  heir.otherParentId = ex.id
  sib1.otherParentId = ex.id
  sib2.otherParentId = ex.id
  const f: Fam = { g, who: { ex, wife, heir, sib1, sib2, gp, grand, pet }, sid: null }
  const link = o.link ?? 'none'
  if (o.stamped && link !== 'none') {
    if (link === 'garbage') heir.data.spouseSid = 'not a sid'
    else {
      f.sid = adoptSpouse(g, heir, { gender: o.spouseGender ?? 'male' })
      expect(f.sid, 'the heir must get a spouse record').not.toBeNull()
      if (link === 'holder') {
        const held = materializePerson(g, f.sid!, { relation: 'friend', age: 28, relationship: 33, livesWithPlayer: false, data: { kin: 'daughter-in-law' } })
        expect(held, 'the record must become a Person').not.toBeNull()
      }
    }
  } else if (!o.stamped && link === 'holder') {
    // the twin of a holder: a plain friend made at the same place in the id sequence
    cast(g, 33, 'friend', { age: 28, countryId: 'us' })
  }
  o.prepare?.(f)
  return f
}

function die(g: GameState): void {
  killCharacter(g, 'Old Age')
  g.queue = g.queue.filter((m) => m.kind !== 'aiTask')
}

/** A hand-over of a family: the new state and the family it came from. */
function over(seed: number, o: Opts): { n: GameState; f: Fam } {
  const f = fam(seed, o)
  die(f.g)
  const n = continueAsChild(f.g, f.who.heir!.id)
  expect(n, 'the hand-over must happen').not.toBe(f.g)
  return { n, f }
}

const byId = (g: GameState, id: string): Person | undefined => g.people.find((p) => p.id === id)
const spouseOf = (g: GameState): Person | undefined => g.people.find((p) => p.relation === 'spouse')
const edgeOf = (g: GameState, p: Person): Readonly<Edge> | null => readEdge(g, personEntity(p), playerRef(g))
const clean = (g: GameState): void => {
  expectConserved(g)
}

/** The edge `person > ego` of someone, with every field given (a stamped game only: an unstamped life has no edges). */
function feel(g: GameState, p: Person, patch: Partial<Edge> = {}): void {
  if (!socialOn(g)) return
  const key = edgeKey(personEntity(p), playerRef(g))!
  expect(putEdge(g, key, { t: 60, f: p.relationship, r: 60, s: 0, o: 0, y: g.year - 8, l: g.year - 1, ...patch })).toBe(true)
}

const SEEDS = [1, 2, 3] as const
const OLDS = [10, 50, 90] as const

// ---------------------------------------------------------------------------------------------------------------------
// 1. The blend

describe('the blend of the direct kin (X33)', () => {
  it('makes a direct kin round((roll + old) / 2): the other parent, the stepparent, the siblings, the grandparent and the heir\'s child, for old 10, 50 and 90 and three dice', () => {
    for (const seed of SEEDS) {
      for (const old of OLDS) {
        const twin = over(seed, { stamped: false, old })
        const mine = over(seed, { stamped: true, old })
        // the unstamped twin shows the roll itself: the ranges of the five re-rolls
        const ranges: [string, number, number][] = [
          ['ex', 55, 95],
          ['wife', 30, 75],
          ['sib1', 35, 85],
          ['sib2', 35, 85],
          ['gp', 50, 90],
          ['grand', 60, 95],
        ]
        for (const [seat, lo, hi] of ranges) {
          const id = twin.f.who[seat]!.id
          const roll = byId(twin.n, id)!.relationship
          expect(roll, `${seat} (seed ${seed}) must show the roll`).toBeGreaterThanOrEqual(lo)
          expect(roll).toBeLessThanOrEqual(hi)
          expect(byId(mine.n, id)!.relationship, `${seat} at ${old} (seed ${seed})`).toBe(Math.round((roll + old) / 2))
        }
      }
    }
  })

  it('is not half of the old number: a sibling at 10 becomes about 42, not 5, and one at 90 is pulled down by the roll', () => {
    const twin = over(1, { stamped: false, old: 10 })
    const mine = over(1, { stamped: true, old: 10 })
    const roll = byId(twin.n, twin.f.who.sib1!.id)!.relationship
    const got = byId(mine.n, mine.f.who.sib1!.id)!.relationship
    expect(got).toBe(Math.round((roll + 10) / 2))
    expect(got).toBeGreaterThanOrEqual(23)
    expect(got).toBeLessThanOrEqual(48)
    expect(got).not.toBe(5)
    const high = over(1, { stamped: true, old: 90 })
    expect(byId(high.n, high.f.who.sib1!.id)!.relationship).toBeLessThan(88)
  })

  it('leaves the heir\'s spouse and the dog as they were: the same roll as the unstamped twin', () => {
    for (const seed of SEEDS) {
      const twin = over(seed, { stamped: false, old: 20 })
      const mine = over(seed, { stamped: true, old: 20 })
      expect(byId(mine.n, mine.f.who.pet!.id)!.relationship).toBe(byId(twin.n, twin.f.who.pet!.id)!.relationship)
      expect(spouseOf(mine.n)!.relationship).toBe(spouseOf(twin.n)!.relationship)
      expect(spouseOf(mine.n)!.relationship).toBeGreaterThanOrEqual(55)
      expect(spouseOf(mine.n)!.relationship).toBeLessThanOrEqual(90)
    }
  })

  it('draws the same dice and makes the same ids as the unstamped twin: n.rng and n.nextId, and the late player\'s own state is not moved', () => {
    for (const seed of SEEDS) {
      for (const sexuality of ['straight', 'bisexual'] as const) {
        const twin = over(seed, { stamped: false, sexuality })
        const mine = over(seed, { stamped: true, sexuality })
        expect(mine.n.rng, `rng (seed ${seed}, ${sexuality})`).toBe(twin.n.rng)
        expect(mine.n.nextId).toBe(twin.n.nextId)
        expect(mine.f.g.rng).toBe(twin.f.g.rng)
        expect(mine.n.people.map((p) => p.id)).toEqual(twin.n.people.map((p) => p.id))
        expect(mine.n.people.map((p) => p.relation)).toEqual(twin.n.people.map((p) => p.relation))
      }
    }
  })

  it('is a pure function of the state: the same twice, from a clone, and the late player\'s state is left as it was', () => {
    const a = fam(2, { stamped: true, old: 30, link: 'record' })
    const b = fam(2, { stamped: true, old: 30, link: 'record' })
    die(a.g)
    die(b.g)
    const before = JSON.stringify(a.g)
    const n1 = continueAsChild(a.g, a.who.heir!.id)
    expect(JSON.stringify(a.g)).toBe(before)
    const n2 = continueAsChild(structuredClone(b.g), b.who.heir!.id)
    const n3 = continueAsChild(a.g, a.who.heir!.id)
    expect(JSON.stringify(n2)).toBe(JSON.stringify(n1))
    expect(JSON.stringify(n3)).toBe(JSON.stringify(n1))
  })

  it('moves nothing unstamped: the old relationship is not read (old 10 and old 90 hand over the same numbers), and a link on an unstamped life is not read', () => {
    const low = over(1, { stamped: false, old: 10 })
    const high = over(1, { stamped: false, old: 90 })
    for (const seat of ['ex', 'wife', 'sib1', 'sib2', 'gp', 'grand']) {
      expect(byId(low.n, low.f.who[seat]!.id)!.relationship, seat).toBe(byId(high.n, high.f.who[seat]!.id)!.relationship)
    }
    // a Met record and a link put in by hand on an unstamped game: the old path, no sid
    const f = fam(1, { stamped: false })
    const stamped = fam(1, { stamped: true, link: 'record' })
    // the world of the stamped game without its stamp: a record and a link, on a life nobody stamped
    const world = structuredClone(stamped.g.world) as Record<string, unknown>
    delete world.social
    f.g.world = world as never
    expect(socialOn(f.g)).toBe(false)
    f.who.heir!.data.spouseSid = stamped.sid!
    die(f.g)
    const n = continueAsChild(f.g, f.who.heir!.id)
    const s = spouseOf(n)!
    expect(s.data.sid).toBeUndefined()
    expect(`${s.firstName} ${s.lastName}`).toBe('Ana Ruiz')
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 2. The heir's spouse

describe('the heir\'s spouse comes over with the same face (C21, X15)', () => {
  it('has the record\'s name, gender and age, the sid and its account, balanced books, and the dice of the unstamped twin', () => {
    for (const seed of SEEDS) {
      for (const sexuality of ['straight', 'bisexual'] as const) {
        const twin = over(seed, { stamped: false, sexuality })
        const mine = over(seed, { stamped: true, link: 'record', spouseGender: 'male', sexuality })
        const rec = metRecord(mine.f.g, mine.f.sid!)!
        const s = spouseOf(mine.n)!
        expect([s.firstName, s.lastName]).toEqual([rec.f, rec.l])
        expect(`${rec.f} ${rec.l}`).toBe('Ana Ruiz')
        expect(s.gender).toBe(rec.g === 1 ? 'male' : 'female')
        expect(s.gender).toBe('male')
        expect(s.age).toBe(mine.f.g.year - rec.b)
        expect(s.data.sid).toBe(mine.f.sid)
        expect(personKey(s)).toBe(mine.f.sid)
        expect(personEntity(s)).toBe(person(mine.f.sid!))
        expect(s.livesWithPlayer).toBe(true)
        expect(heirUnsafe(s)).toBe(false)
        expect(acctOf(mine.n, person(mine.f.sid!))).toBe(0)
        clean(mine.n)
        // the draws are the twin's: the gender, age, skin and years-known expressions are still evaluated
        expect(mine.n.rng, `rng (seed ${seed}, ${sexuality})`).toBe(twin.n.rng)
        expect(mine.n.nextId).toBe(twin.n.nextId)
        // the twin's spouse is the old path: a made-up face with no sid, the legacy name
        const t = spouseOf(twin.n)!
        expect(t.data.sid).toBeUndefined()
        expect(`${t.firstName} ${t.lastName}`).toBe('Ana Ruiz')
        // what the legacy rolls gave stays: the relationship, the years known, the money and the occupation
        expect(s.relationship).toBe(t.relationship)
        expect(s.yearsKnown).toBe(t.yearsKnown)
        expect(s.money).toBe(t.money)
        expect(s.occupation).toBe(t.occupation)
      }
    }
  })

  it('has one Person for one sid, and the heir\'s child has the spouse as the other parent', () => {
    const mine = over(1, { stamped: true, link: 'record' })
    const s = spouseOf(mine.n)!
    expect(mine.n.people.filter((p) => personKey(p) === mine.f.sid)).toHaveLength(1)
    expect(mine.n.people.filter((p) => p.relation === 'spouse')).toHaveLength(1)
    const kid = mine.n.people.find((p) => p.relation === 'child')!
    expect(kid.otherParentId).toBe(s.id)
    expect(mine.n.people.some((p) => p.id === mine.f.who.heir!.id)).toBe(false)
  })

  it('writes the sid on a new Person only: no child, stepchild, grandchild, pet or former player ever carries one', () => {
    const mine = over(1, { stamped: true, link: 'record' })
    const carriers = mine.n.people.filter((p) => typeof p.data.sid === 'string')
    expect(carriers.map((p) => p.relation)).toEqual(['spouse'])
    expect(mine.n.people.every((p) => !heirUnsafe(p))).toBe(true)
    const former = mine.n.people.find((p) => p.data.formerPlayer === true)!
    expect(former.data.sid).toBeUndefined()
    // the source: the sid is written in modules/heirs.ts (S11's scan allows materialize.ts and that file only), never in life.ts
    expect(read('src/game/life.ts')).not.toMatch(/\bsid\s*:/)
    expect(read('src/game/life.ts')).not.toMatch(/\.sid\s*=[^=]/)
    expect(read('src/game/modules/heirs.ts')).toMatch(/\bsid\b/)
  })

  it('resets a Person that already holds the sid to spouse and makes no second holder; the dice and the ids are the twin\'s with or without it', () => {
    for (const seed of SEEDS) {
      const none = over(seed, { stamped: true, link: 'record', spouseGender: 'male' })
      const held = over(seed, { stamped: true, link: 'holder', spouseGender: 'male' })
      const twin = over(seed, { stamped: false, link: 'holder' })
      const sid = held.f.sid!
      const before = held.f.g.people.find((p) => personKey(p) === sid)!
      const mine = held.n.people.filter((p) => personKey(p) === sid)
      expect(mine, 'one Person for the sid').toHaveLength(1)
      const s = mine[0]!
      expect(s.relation).toBe('spouse')
      expect(s.livesWithPlayer).toBe(true)
      expect(s.alive).toBe(true)
      // it keeps its identity: the Person that held the sid before is the same Person
      expect(s.id).toBe(before.id)
      expect([s.firstName, s.lastName]).toEqual([before.firstName, before.lastName])
      expect(s.data.sid).toBe(sid)
      expect(s.data.kin).toBeUndefined()
      expect(held.n.people.filter((p) => p.relation === 'spouse')).toHaveLength(1)
      // the discarded call made no Person: the id sequence and the dice are the unstamped twin's (which has the same extra friend)
      expect(held.n.rng).toBe(twin.n.rng)
      expect(held.n.nextId).toBe(twin.n.nextId)
      expect(held.n.rng).toBe(none.n.rng)
      // no second Person touched the account
      expect(acctOf(held.n, person(sid))).toBe(acctOf(none.n, person(sid)))
      clean(held.n)
    }
  })

  it('takes the old path for a garbage link, a link to nobody and a tombstone: no sid, the legacy name, the twin\'s dice', () => {
    const twin = over(2, { stamped: false })
    for (const bad of ['garbage', 'gone', 'tomb'] as const) {
      const f = fam(2, { stamped: true, link: bad === 'garbage' ? 'garbage' : 'record' })
      if (bad === 'gone') delete (f.g.world as Record<string, unknown>).met
      if (bad === 'tomb') {
        expect(markMet(f.g, f.sid!, { fl: 0 })).toBe(true)
        expect(tombstoneMet(f.g, f.sid!)).toBe(true)
        expect(metRecord(f.g, f.sid!)).toBeNull()
      }
      die(f.g)
      const n = continueAsChild(f.g, f.who.heir!.id)
      const s = spouseOf(n)!
      expect(s.data.sid, bad).toBeUndefined()
      expect(`${s.firstName} ${s.lastName}`).toBe('Ana Ruiz')
      expect(n.rng, bad).toBe(twin.n.rng)
      expect(n.nextId).toBe(twin.n.nextId)
      clean(n)
    }
    for (const junk of [12345, null, ['kin.us.2026.0'], { sid: 1 }, '', 'kin.us.2026.0:bad', 'kin..']) {
      const f = fam(2, { stamped: true })
      f.who.heir!.data.spouseSid = junk as never
      die(f.g)
      const n = continueAsChild(f.g, f.who.heir!.id)
      expect(spouseOf(n)!.data.sid, String(junk)).toBeUndefined()
      expect(n.rng).toBe(twin.n.rng)
    }
  })

  it('takes the old path for a spouse record that has died, and for a holder that is a child (never two Persons for one sid)', () => {
    const twin = over(3, { stamped: false })
    const dead = fam(3, { stamped: true, link: 'record' })
    expect(touchMet(dead.g, dead.sid!, { d: dead.g.year - 1 })).toBe(true)
    die(dead.g)
    const nd = continueAsChild(dead.g, dead.who.heir!.id)
    expect(spouseOf(nd)!.data.sid).toBeUndefined()
    expect(nd.rng).toBe(twin.n.rng)

    const odd = fam(3, { stamped: true, link: 'record' })
    odd.who.sib1!.data.sid = odd.sid!
    die(odd.g)
    const no = continueAsChild(odd.g, odd.who.heir!.id)
    expect(no.people.filter((p) => p.relation === 'spouse').every((p) => p.data.sid === undefined)).toBe(true)
    expect(no.rng).toBe(twin.n.rng)
  })

  it('keeps the heir\'s spouse edge true: the pair edge L4 wrote while the spouse was a record holds the final relationship', () => {
    for (const seed of SEEDS) {
      const mine = over(seed, { stamped: true, link: 'record' })
      const s = spouseOf(mine.n)!
      const e = edgeOf(mine.n, s)
      expect(e, 'the pair edge spouse > heir stays').not.toBeNull()
      expect(e!.k).toBe('pair')
      expect(e!.f).toBe(s.relationship)
      expect(edgeProblems(readWorld(mine.n).edges, mine.n.people, playerRef(mine.n))).toEqual([])
      // the other direction is the heir's own feeling and is left as it was
      expect(readEdge(mine.n, playerRef(mine.n), personEntity(s))!.k).toBe('pair')
    }
  })

  it('leaves the world sound: after the next step of the kin records nothing is dangling and the spouse keeps the sid', () => {
    const mine = over(1, { stamped: true, link: 'record' })
    // the heir's anchor is gone, so the flag of the record is an orphan until the sweep of the next life/37 step
    syncKin(mine.n)
    expect(kinProblems(mine.n)).toEqual([])
    expect(spouseOf(mine.n)!.data.sid).toBe(mine.f.sid)
    expect(worldProblems(mine.n).filter((p) => /edge|met|kin/i.test(p))).toEqual([])
  })
})

describe('heirSpouseOverrides', () => {
  it('answers the record\'s face and no holder for a record, the holder for a Person, and null otherwise; pure under deepFreeze', () => {
    const rec = fam(1, { stamped: true, link: 'record', spouseGender: 'male' })
    const r = heirSpouseOverrides(rec.g, rec.who.heir!)
    const m = metRecord(rec.g, rec.sid!)!
    expect(r).not.toBeNull()
    expect(r!.firstName).toBe(m.f)
    expect(r!.lastName).toBe(m.l)
    expect(r!.gender).toBe('male')
    expect(r!.age).toBe(rec.g.year - m.b)
    expect(r!.data).toEqual({ sid: rec.sid })
    expect(r!.holder).toBeNull()

    const held = fam(1, { stamped: true, link: 'holder' })
    const h = heirSpouseOverrides(held.g, held.who.heir!)
    expect(h!.holder).not.toBeNull()
    expect(personKey(h!.holder!)).toBe(held.sid)
    expect(h!.data).toEqual({ sid: held.sid })

    const frozen = deepFreeze(structuredClone(rec.g))
    const rng = frozen.rng
    expect(heirSpouseOverrides(frozen, frozen.people.find((p) => p.id === rec.who.heir!.id)!)).toEqual(r)
    expect(frozen.rng).toBe(rng)

    const plain = fam(1, { stamped: false })
    expect(heirSpouseOverrides(plain.g, plain.who.heir!)).toBeNull()
    const none = fam(1, { stamped: true })
    expect(heirSpouseOverrides(none.g, none.who.heir!)).toBeNull()
    const bad = fam(1, { stamped: true, link: 'garbage' })
    expect(heirSpouseOverrides(bad.g, bad.who.heir!)).toBeNull()
  })

  it('is total: a hostile heir or state answers null and never throws', () => {
    const f = fam(1, { stamped: true, link: 'record' })
    const hostile: unknown[] = [null, undefined, 5, 'x', [], {}, { data: null }, { data: { spouseSid: { toString: 1 } } }]
    for (const heir of hostile) expect(() => heirSpouseOverrides(f.g, heir as Person)).not.toThrow()
    for (const g of [null, undefined, {}, { people: 5, world: 5 }]) expect(() => heirSpouseOverrides(g as unknown as GameState, f.who.heir!)).not.toThrow()
    expect(heirSpouseOverrides({} as GameState, f.who.heir!)).toBeNull()
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 3. Part B: the kept contacts

describe('the kept contacts (part B)', () => {
  it('starts an NpcLife friend at 80 at 40 on a stamped life and at 60 on an unstamped one; one at 10 starts at 5 against 10', () => {
    for (const stamped of [false, true]) {
      const { n, f } = over(1, {
        stamped,
        prepare: (x) => {
          x.who.pal = withLife(cast(x.g, 80, 'friend', { age: 60, countryId: 'us' }))
          x.who.low = withLife(cast(x.g, 10, 'friend', { age: 60, countryId: 'us' }))
        },
      })
      const pal = byId(n, f.who.pal!.id)!
      const low = byId(n, f.who.low!.id)!
      expect(pal.relation).toBe('friend')
      expect(pal.relationship, stamped ? 'stamped' : 'unstamped').toBe(stamped ? 40 : 60)
      expect(low.relationship).toBe(stamped ? 5 : 10)
    }
  })

  it('keeps a debtor friend with no NpcLife (bound) at max(25, half), a feud enemy as an enemy at min(old, 30), and drops a cold feud and a classmate; the unstamped twin keeps none', () => {
    const prepare = (x: Fam): void => {
      x.who.debtor = cast(x.g, 30, 'friend', { age: 40, countryId: 'us' })
      updateTies(x.g, x.who.debtor, (t) => {
        t.owes = 5_000
        t.owesSince = 2024
      })
      x.who.rival = cast(x.g, 80, 'enemy', { age: 45, countryId: 'us' })
      feel(x.g, x.who.rival, { k: 'rival', q: [2, 2023, 1] })
      x.who.cold = cast(x.g, 80, 'enemy', { age: 45, countryId: 'us' })
      feel(x.g, x.who.cold, { k: 'rival', q: [1, 2023, 1] })
      x.who.mate = cast(x.g, 90, 'classmate', { age: 30, countryId: 'us' })
      feel(x.g, x.who.mate, { f: 95 })
    }
    const mine = over(1, { stamped: true, prepare })
    const twin = over(1, { stamped: false, prepare })
    const d = byId(mine.n, mine.f.who.debtor!.id)!
    expect(d, 'the bound debtor is kept').toBeDefined()
    expect(d.relation).toBe('friend')
    expect(d.relationship).toBe(25)
    expect(d.livesWithPlayer).toBe(false)
    const r = byId(mine.n, mine.f.who.rival!.id)!
    expect(r.relation).toBe('enemy')
    expect(r.relationship).toBe(30)
    expect(byId(mine.n, mine.f.who.cold!.id)).toBeUndefined()
    expect(byId(mine.n, mine.f.who.mate!.id)).toBeUndefined()
    for (const k of ['debtor', 'rival', 'cold', 'mate']) expect(byId(twin.n, twin.f.who[k]!.id), k).toBeUndefined()
    // the dice are the twin's
    expect(mine.n.rng).toBe(twin.n.rng)
  })

  it('keeps the 12 best friends, best friends and lovers by edge salience of 60 or more, and no friend under 60', () => {
    const { n, f } = over(1, {
      stamped: true,
      prepare: (x) => {
        for (let i = 0; i < 14; i++) {
          const relation: RelationKind = i % 3 === 0 ? 'bestFriend' : i % 3 === 1 ? 'lover' : 'friend'
          const p = cast(x.g, 61 + i, relation, { age: 35, countryId: 'us' })
          feel(x.g, p, { f: 61 + i })
          x.who[`top${i}`] = p
        }
        x.who.weak = cast(x.g, 59, 'friend', { age: 35, countryId: 'us' })
        feel(x.g, x.who.weak, { f: 59 })
      },
    })
    const kept = Array.from({ length: 14 }, (_, i) => byId(n, f.who[`top${i}`]!.id) !== undefined)
    // the two weakest (f 61 and 62) go, the other twelve stay
    expect(kept.filter(Boolean)).toHaveLength(12)
    expect(kept.slice(0, 2)).toEqual([false, false])
    expect(byId(n, f.who.weak!.id)).toBeUndefined()
    for (let i = 2; i < 14; i++) expect(byId(n, f.who[`top${i}`]!.id)!.relationship).toBe(Math.min(60, Math.round((61 + i) / 2)))
  })

  it('keeps at most 40 of 500 friends offered, and the late player\'s siblings with a life are an uncle or an aunt', () => {
    const crowd: string[] = []
    const { n, f } = over(1, {
      stamped: true,
      prepare: (x) => {
        for (let i = 0; i < 500; i++) {
          const p = cast(x.g, 70, 'friend', { age: 40, countryId: 'us' })
          updateWl(x.g, p, (v) => {
            v.cut = true
          })
          crowd.push(p.id)
        }
        x.who.uncle = withLife(cast(x.g, 60, 'sibling', { age: 66, gender: 'male', countryId: 'us' }))
        x.who.aunt = withLife(cast(x.g, 60, 'sibling', { age: 64, gender: 'female', countryId: 'us' }))
      },
    })
    expect(crowd.filter((id) => byId(n, id) !== undefined)).toHaveLength(40)
    expect(byId(n, f.who.uncle!.id)?.data.kin).toBe('uncle')
    expect(byId(n, f.who.aunt!.id)?.data.kin).toBe('aunt')
    for (const p of n.people) if (typeof p.data.kin === 'string') expect(p.data.kin.length).toBeLessThanOrEqual(20)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 4. Part B: the edges

describe('the edges the heir carries (part B)', () => {
  it('scales t and r by 0.5 and s by 0.6, sets f to the blended relationship, and keeps o', () => {
    for (const old of OLDS) {
      const { n, f } = over(2, {
        stamped: true,
        old,
        prepare: (x) => {
          feel(x.g, x.who.sib1!, { t: 80, r: 70, s: 40, o: 10 })
        },
      })
      const sib = byId(n, f.who.sib1!.id)!
      const e = edgeOf(n, sib)!
      expect(e, 'the sibling keeps an edge to the heir').not.toBeNull()
      expect(e.t).toBe(40)
      expect(e.r).toBe(35)
      expect(e.s).toBe(24)
      expect(e.o).toBe(10)
      expect(e.f).toBe(sib.relationship)
    }
  })

  it('gives a non-kin friend half of the old edge with f equal to the half, and carries a sibling\'s will anger as s x 0.6', () => {
    const { n, f } = over(1, {
      stamped: true,
      prepare: (x) => {
        x.who.pal = withLife(cast(x.g, 80, 'friend', { age: 60, countryId: 'us' }))
        feel(x.g, x.who.pal, { t: 70, r: 60, s: 10 })
        updateWl(x.g, x.who.sib2!, (v) => {
          v.anger = 80
        })
      },
    })
    const pal = byId(n, f.who.pal!.id)!
    const e = edgeOf(n, pal)
    expect(e, 'the friend keeps an edge to the heir').not.toBeNull()
    expect([e!.t, e!.r, e!.s, e!.f]).toEqual([35, 30, 6, 40])
    expect(pal.relationship).toBe(40)
    expect(edgeOf(n, byId(n, f.who.sib2!.id)!)!.s).toBe(48)
    // the will's record is the late player's: the heir reads blank, and the notes of the living stay cleared
    expect(readWl(n, byId(n, f.who.sib2!.id)!).anger).toBe(0)
    expect(byId(n, f.who.sib1!.id)!.notes).toEqual([])
  })

  it('has f === relationship for every person with an edge to the heir, the spouse included, and the world is sound', () => {
    for (const seed of SEEDS) {
      const { n } = over(seed, {
        stamped: true,
        link: 'record',
        prepare: (x) => {
          for (const seat of ['ex', 'wife', 'sib1', 'sib2', 'gp']) feel(x.g, x.who[seat]!, { t: 90, r: 80, s: 30 })
        },
      })
      let seen = 0
      for (const p of n.people) {
        if (p.relation === 'pet') continue
        const e = edgeOf(n, p)
        if (e === null) continue
        seen++
        expect(e.f, `${p.relation} ${p.firstName}`).toBe(p.relationship)
      }
      expect(seen).toBeGreaterThanOrEqual(6)
      expect(edgeProblems(readWorld(n).edges, n.people, playerRef(n))).toEqual([])
    }
  })

  it('keeps a kin edge\'s feud rung and link and ends a rival\'s: the enemy stays a contact with no q', () => {
    const { n, f } = over(1, {
      stamped: true,
      prepare: (x) => {
        feel(x.g, x.who.sib1!, { k: 'kin', q: [1, 2024, 3] })
        x.who.rival = cast(x.g, 80, 'enemy', { age: 45, countryId: 'us' })
        feel(x.g, x.who.rival, { k: 'rival', q: [3, 2023, 1] })
      },
    })
    const kin = edgeOf(n, byId(n, f.who.sib1!.id)!)
    expect(kin, 'the sibling keeps an edge to the heir').not.toBeNull()
    expect(kin!.k).toBe('kin')
    expect(kin!.q).toEqual([1, 2024, 3])
    const rival = byId(n, f.who.rival!.id)!
    expect(rival, 'the feud enemy is kept').toBeDefined()
    expect(rival.relation).toBe('enemy')
    const e = edgeOf(n, rival)
    expect(e, 'the enemy keeps an edge to the heir').not.toBeNull()
    expect(e!.q).toBeUndefined()
    expect(e!.k).toBeUndefined()
  })

  it('merges into an edge that is already on the heir: the larger s, memories at most 8; and nothing ends at the late ego', () => {
    const mem = (kind: 'visited' | 'stood_by_me' | 'gossiped_about_me' | 'gift_given' | 'told_gently', y: number): string => formatMemory({ kind: kind as never, year: y, w: 3, by: 'ego' })
    const { n, f } = over(1, {
      stamped: true,
      prepare: (x) => {
        const heirRef = person(x.who.heir!.id)
        const kinds = ['stood_by_me', 'gift_given', 'told_gently', 'gossiped_about_me'] as const
        putEdge(x.g, edgeKey(personEntity(x.who.sib1!), heirRef as never)!, {
          t: 60, f: 11, r: 60, s: 70, o: 0, y: 2019, l: 2024,
          m: [0, 1, 2, 3, 4, 5].map((i) => mem(kinds[i % 4]!, 2019 + i)),
        })
        feel(x.g, x.who.sib1!, { s: 20, m: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => mem(kinds[i % 4]!, 2010 + i)) })
        feel(x.g, x.who.sib2!, { s: 100, t: 100 })
        putEdge(x.g, edgeKey(personEntity(x.who.sib2!), heirRef as never)!, { t: 10, f: 12, r: 10, s: 30, o: 0, y: 2020, l: 2024 })
      },
    })
    const a = edgeOf(n, byId(n, f.who.sib1!.id)!)!
    expect(a, 'the sibling keeps an edge to the heir').not.toBeNull()
    expect(a.s).toBe(70)
    expect((a.m ?? []).length).toBeLessThanOrEqual(8)
    expect((a.m ?? []).length).toBeGreaterThan(0)
    expect(a.f).toBe(byId(n, f.who.sib1!.id)!.relationship)
    const b = edgeOf(n, byId(n, f.who.sib2!.id)!)!
    expect(b.s).toBe(60)
    const dead = person(f.g.character.id)
    const stale = Object.keys(readWorld(n).edges ?? {}).filter((k) => k.endsWith(`>${dead}`))
    expect(stale).toEqual([])
  })

  it('never has more edges after than before, and the hand-over is the same twice, from a clone and after a reload', () => {
    const prepare = (x: Fam): void => {
      for (const seat of ['ex', 'wife', 'sib1', 'sib2', 'gp']) feel(x.g, x.who[seat]!, { t: 90, r: 80, s: 30 })
    }
    const count = (g: GameState): number => Object.keys(readWorld(g).edges ?? {}).filter((k) => !k.startsWith('secret:')).length
    const a = fam(2, { stamped: true, link: 'record', prepare })
    const b = fam(2, { stamped: true, link: 'record', prepare })
    die(a.g)
    die(b.g)
    const was = count(a.g)
    const n1 = continueAsChild(a.g, a.who.heir!.id)
    const n2 = continueAsChild(structuredClone(b.g), b.who.heir!.id)
    const n3 = continueAsChild(JSON.parse(JSON.stringify(b.g)) as GameState, b.who.heir!.id)
    expect(count(n1)).toBeLessThanOrEqual(was)
    expect(JSON.stringify(n2)).toBe(JSON.stringify(n1))
    expect(JSON.stringify(n3)).toBe(JSON.stringify(n1))
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 5. Part B: the notes and the stamps

describe('what stays as it was (part B)', () => {
  it('keeps the owner stamps: a bound friend\'s claim passes by the will\'s share stamped by the heir, once, on the legacy record and its mirror', () => {
    const mine = over(1, {
      stamped: true,
      prepare: (x) => {
        x.who.debtor = cast(x.g, 30, 'friend', { age: 40, countryId: 'us' })
        updateTies(x.g, x.who.debtor, (t) => {
          t.owes = 30_000
          t.owesSince = 2024
        })
      },
    })
    const d = byId(mine.n, mine.f.who.debtor!.id)!
    expect(d, 'the bound debtor is kept').toBeDefined()
    expect(readTies(mine.n, d).owes).toBe(10_000)
    expect(edgeOf(mine.n, d)!.dv?.[0]).toBe(10_000)
    expect(edgeOf(mine.n, d)!.f).toBe(d.relationship)
    clean(mine.n)
  })

  it('keeps the old statements for an unstamped hand-over: the min(60, old) rule, no kin word, no edge', () => {
    const { n, f } = over(1, {
      stamped: false,
      prepare: (x) => {
        x.who.pal = withLife(cast(x.g, 80, 'friend', { age: 60, countryId: 'us' }))
        x.who.uncle = withLife(cast(x.g, 60, 'sibling', { age: 66, gender: 'male', countryId: 'us' }))
      },
    })
    expect(byId(n, f.who.pal!.id)!.relationship).toBe(60)
    expect(byId(n, f.who.uncle!.id)!.data.kin).toBeUndefined()
    expect(readWorld(n).edges).toBeUndefined()
  })
})

describe('the saved words', () => {
  it('writes no dash in the source or in this file', () => {
    const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)
    expect(read('src/game/modules/heirs.ts')).not.toMatch(DASH)
    expect(read('test/heir-carryover.test.ts')).not.toMatch(DASH)
  })
})
