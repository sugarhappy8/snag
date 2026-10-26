// R4-E10a (design 14.1 invariant 4): authorization inside the function. A SocialAct is checked where it is run, not where the menu offers it,
// so a caller that bypasses the menu (a test, a script, a later task, a hostile click on a stale row) gets nothing it could not have got through
// the menu. This file is table-driven: for every act and every blocked state it calls `runAct` directly and asserts that
//
//   - the answer is null,
//   - the state is unchanged to the byte (`JSON.stringify(g)`, which holds the world, the ledger and the queue),
//   - g.rng and g.nextId are what they were,
//
// and for the same act in the allowed state (the control) that it does answer and does write, so a table that blocks everything cannot pass.
// R4-E10b to R4-E13 add their rows to the same table: a new act appends an entry to ACTS, a new blocked state appends to STATES.
// R4-E13 is not an act (a company's key people are not people of the game): its rows are the last describe, the same check for the year
// step and the five writers of business/staff-loyalty.ts on a life that is not stamped.
//
// The blocked states: a life that is not stamped; the person dead, a pet, estranged or not in the game; the call-in cooldown not elapsed; the
// edge cap reached (a map of 1,200 bound edges with none for this person); a key whose second end is not the current ego (another owner's edge,
// or an edge between two other people); a person that does not match the key; and the roles of the other two acts (a vouch for a third who is
// the voucher, dead or already at 100; a broker for a relative who is not cut out, has no edge or is already at the top of the obligation).
import { describe, expect, it } from 'vitest'
import { personEntity } from '../src/game/kernel/person-ref'
import { installManager, managerCandidate } from '../src/game/business/career'
import { staffTurnover } from '../src/game/business/staff'
import { managerPoached, staffGone, staffHired, staffLoyaltyYear, staffRaised, staffYelled } from '../src/game/business/staff-loyalty'
import { bizOf, type KeyStaff } from '../src/game/business/state'
import { peekLedger } from '../src/game/kernel/ledger'
import { runAct, type SocialAct } from '../src/game/society/acts'
import { broker, helpAct, vouch } from '../src/game/society/favor'
import type { Edge } from '../src/game/world/edges'
import { putEdge } from '../src/game/world/edge-write'
import { playerRef } from '../src/game/world/people'
import type { GameState, Person } from '../src/game/types'
import { makeTestGame } from './helpers'
import { company } from './market-kit'
import { cast, socialGame } from './social-kit'

/** The cast of one row: a stamped adult with a circle of friends. The giver is asked; the third is vouched to; the relative is cut out. */
interface World {
  g: GameState
  giver: Person
  third: Person
  relative: Person
  others: Person[]
}

const keyOf = (g: GameState, p: Person): string => `${personEntity(p)}>${playerRef(g)}`

function setEdge(g: GameState, p: Person, over: Partial<Edge> = {}): void {
  if (!putEdge(g, keyOf(g, p), { t: 60, f: p.relationship, r: 50, s: 0, o: 0, y: g.year, l: g.year, ...over })) throw new Error('setEdge refused')
}

function build(stamped = true): World {
  const g = stamped ? socialGame(1) : makeTestGame(1)
  g.character.age = 30
  const people: Person[] = []
  for (let i = 0; i < 8; i++) people.push(cast(g, 70, 'friend'))
  const [giver, third, relative, ...others] = people as [Person, Person, Person, ...Person[]]
  relative.data.wl = { by: g.character.id, anger: 60, cut: true, estr: true }
  if (stamped) setEdge(g, relative, { s: 50 })
  return { g, giver, third, relative, others }
}

/** One act in the table: how to make it, who it is run on, and the extra blocked states that belong to its own roles. */
interface ActRow {
  name: string
  make(w: World): SocialAct
  /** The person the act is run on (the one who is asked). */
  who(w: World): Person
  extra: readonly State[]
}

/** One blocked state: how it is made, and optionally the key and person the act is called with (the defaults are the ego's edge with `who`). */
interface State {
  name: string
  apply(w: World, row: ActRow): void
  key?(w: World, row: ActRow): string
  person?(w: World, row: ActRow): Person | null
  stamped?: boolean
}

/** The state the call is made in is the one the world is in after `apply`. */
const STATES: readonly State[] = [
  { name: 'a life that is not stamped', apply: () => undefined, stamped: false },
  { name: 'the person dead', apply: (w, r) => void (r.who(w).alive = false) },
  { name: 'the person a pet', apply: (w, r) => void (r.who(w).relation = 'pet') },
  { name: 'the person estranged', apply: (w, r) => void (r.who(w).data.wl = { by: w.g.character.id, anger: 60, cut: true, estr: true }) },
  { name: 'the player dead', apply: (w) => void (w.g.character.alive = false) },
  { name: 'the player a child', apply: (w) => void (w.g.character.age = 10) },
  { name: 'the call-in cooldown not elapsed (last year)', apply: (w, r) => setEdge(w.g, r.who(w), { c: w.g.year - 1 }) },
  { name: 'the call-in cooldown not elapsed (this year)', apply: (w, r) => setEdge(w.g, r.who(w), { c: w.g.year }) },
  { name: 'trust under 40', apply: (w, r) => setEdge(w.g, r.who(w), { t: 39 }) },
  { name: 'affection under 50', apply: (w, r) => void ((r.who(w).relationship = 49), setEdge(w.g, r.who(w))) },
  {
    name: 'the edge cap reached (1,200 bound edges, none for this person)',
    apply: (w, r) => {
      if (w.g.world?.edges !== undefined) setEdge(w.g, w.relative, { k: 'kin' })
      for (let i = 0; i < 1200; i++) if (!putEdge(w.g, `person:z${i}>${playerRef(w.g)}`, { t: 50, f: 50, r: 50, s: 0, o: 0, y: w.g.year, l: w.g.year, k: 'kin' })) break
      void r
    },
  },
  { name: 'a key whose second end is not the current ego (another owner)', apply: () => undefined, key: (w, r) => `${personEntity(r.who(w))}>person:old-ego` },
  { name: 'a key whose first end is another owner\'s ego', apply: () => undefined, key: (w, r) => `person:old-ego>${personEntity(r.who(w))}`, person: () => null },
  { name: 'an edge between two other people', apply: () => undefined, key: (w) => `${personEntity(w.others[0]!)}>${personEntity(w.others[1]!)}` },
  { name: 'a person that does not match the key', apply: () => undefined, person: (w) => w.others[0]! },
  { name: 'no person', apply: () => undefined, person: () => null },
  { name: 'a person who is not in the game', apply: () => undefined, person: (w, r) => ({ ...r.who(w), id: 'p-not-in-the-game' }) },
  { name: 'a key that is not a key', apply: () => undefined, key: () => 'person:p1>' },
]

const ACTS: readonly ActRow[] = [
  {
    name: 'favor call-in (helpAct)',
    make: () => helpAct,
    who: (w) => w.giver,
    extra: [],
  },
  {
    name: 'vouch',
    make: (w) => vouch(w.third),
    who: (w) => w.giver,
    extra: [
      { name: 'the third the voucher', apply: (w) => void (w.third = w.giver) },
      { name: 'the third dead', apply: (w) => void (w.third.alive = false) },
      { name: 'the third estranged', apply: (w) => void (w.third.data.wl = { by: w.g.character.id, anger: 60, cut: true, estr: true }) },
      { name: 'the third already at 100', apply: (w) => void (w.third.relationship = 100) },
      { name: 'the third a stranger to the voucher', apply: (w) => void ((w.third.relation = 'coworker'), (w.third.contextId = 'firm-7')) },
    ],
  },
  {
    name: 'broker',
    make: (w) => broker(w.relative),
    who: (w) => w.giver,
    extra: [
      { name: 'the relative not cut out', apply: (w) => void delete w.relative.data.wl },
      { name: 'the relative with no edge', apply: (w) => void putEdge(w.g, keyOf(w.g, w.relative), null) },
      { name: 'the relative already at obligation 100', apply: (w) => setEdge(w.g, w.relative, { s: 50, o: 100 }) },
      { name: 'the relative dead', apply: (w) => void (w.relative.alive = false) },
      { name: 'the relative the broker', apply: (w) => void (w.relative = w.giver) },
    ],
  },
]

describe('authorization inside the function: runAct called directly, bypassing the menu', () => {
  for (const row of ACTS) {
    describe(row.name, () => {
      for (const state of [...STATES, ...row.extra]) {
        it(`answers null and changes nothing for: ${state.name}`, () => {
          const w = build(state.stamped ?? true)
          state.apply(w, row)
          const who = row.who(w)
          const key = state.key ? state.key(w, row) : keyOf(w.g, who)
          const person = state.person ? state.person(w, row) : who
          const act = row.make(w)
          const before = JSON.stringify(w.g)
          const rng = w.g.rng
          const nextId = w.g.nextId
          const out = runAct(w.g, act, key, person)
          expect(out).toBeNull()
          expect(JSON.stringify(w.g)).toBe(before)
          expect(w.g.rng).toBe(rng)
          expect(w.g.nextId).toBe(nextId)
        })
      }

      it('control: the same call in the allowed state answers with a patch and writes the call-in', () => {
        const w = build(true)
        const who = row.who(w)
        const before = JSON.stringify(w.g)
        const out = runAct(w.g, row.make(w), keyOf(w.g, who), who)
        expect(out).not.toBeNull()
        expect(JSON.stringify(w.g)).not.toBe(before)
        expect(w.g.world?.edges).toBeDefined()
      })

      it('control: the cooldown opens after 3 years, and not before', () => {
        const w = build(true)
        const who = row.who(w)
        expect(runAct(w.g, row.make(w), keyOf(w.g, who), who)).not.toBeNull()
        const y = w.g.year
        for (const dy of [0, 1, 2]) {
          w.g.year = y + dy
          const before = JSON.stringify(w.g)
          expect(runAct(w.g, row.make(w), keyOf(w.g, who), who), `year +${dy}`).toBeNull()
          expect(JSON.stringify(w.g)).toBe(before)
        }
        w.g.year = y + 3
        // the roles of a vouch (the third at 100 by now) or a broker (the obligation at the top) may close the act on their own after the first run
        w.third.relationship = Math.min(w.third.relationship, 50)
        setEdge(w.g, w.relative, { s: 50, o: 0 })
        expect(runAct(w.g, row.make(w), keyOf(w.g, who), who)).not.toBeNull()
      })
    })
  }

  it('the table is not vacuous: three acts, at least 18 blocked states for each, and the stamped control rows', () => {
    expect(ACTS).toHaveLength(3)
    for (const r of ACTS) expect(STATES.length + r.extra.length).toBeGreaterThanOrEqual(18)
  })
})

// R4-E13: staff loyalty. The key people of a company and its hired CEO are named by refs of their own (staff:<id>, mgr:<asset id>), so the
// authorization of the stamp is checked inside each function: on a life that is not stamped the year-end rule and the five writers answer
// with nothing written, nothing drawn and no ledger row; on a stamped life they write.
describe('staff loyalty: authorization inside the function', () => {
  const crew = (n: number, morale: number): KeyStaff[] =>
    Array.from({ length: n }, (_, i) => ({ id: `ks${i}`, firstName: 'Dana', lastName: `Reed${i}`, gender: 'female', age: 40, role: 'Head Chef', focus: 'ops', skill: 90, salary: 90_000, trait: 'steady', morale, years: 2 }))

  function firm(stamped: boolean, morale: number) {
    const g = stamped ? socialGame(7, { age: 40 }) : makeTestGame(7, { age: 40 })
    const a = company(g, 'restaurant', { cash: 5_000_000 })
    const b = bizOf(g, a)
    b.wageLevel = 0.85
    b.staff.push(...crew(12, morale))
    installManager(g, b, managerCandidate(g, b, 60))
    return { g, a, b }
  }

  type Call = (f: ReturnType<typeof firm>) => void
  const CALLS: readonly (readonly [string, Call])[] = [
    ['staffLoyaltyYear', (f) => staffLoyaltyYear(f.g, f.a, f.b)],
    ['staffTurnover (morale at 30 or more: the old rule draws nothing)', (f) => staffTurnover(f.g, f.a, f.b)],
    ['staffHired', (f) => staffHired(f.g, f.b.staff[0]!)],
    ['staffRaised', (f) => staffRaised(f.g, f.b.staff[0]!, 2)],
    ['staffYelled', (f) => staffYelled(f.g, f.b.staff[0]!)],
    ['staffGone', (f) => staffGone(f.g, f.b.staff[0]!)],
    ['managerPoached', (f) => managerPoached(f.g, f.a, f.b.manager!)],
  ]

  for (const [name, call] of CALLS) {
    it(`${name} on a life that is not stamped: no edge, no draw, no ledger row, nothing changed`, () => {
      const f = firm(false, 70)
      const before = JSON.stringify(f.g)
      const ledger = JSON.stringify(peekLedger(f.g))
      const { rng, nextId } = f.g
      call(f)
      expect(JSON.stringify(f.g)).toBe(before)
      expect(JSON.stringify(peekLedger(f.g))).toBe(ledger)
      expect(f.g.rng).toBe(rng)
      expect(f.g.nextId).toBe(nextId)
      expect(f.g.world?.edges).toBeUndefined()
    })
  }

  it('control: on a stamped life the writers write and the year step moves people', () => {
    for (const [name, call] of CALLS) {
      if (name === 'staffGone' || name.startsWith('staffTurnover')) continue
      const f = firm(true, 5)
      const before = JSON.stringify(f.g)
      call(f)
      expect(JSON.stringify(f.g), name).not.toBe(before)
    }
    const f = firm(true, 70)
    staffHired(f.g, f.b.staff[0]!)
    const hired = JSON.stringify(f.g.world?.edges)
    staffGone(f.g, f.b.staff[0]!)
    expect(JSON.stringify(f.g.world?.edges)).not.toBe(hired)
  })
})
