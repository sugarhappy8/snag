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
// R4-E10b added the loan ask and the loan itself (`lend`) to ACTS, with the states of their own (lender cash below the principal, an
// amount that is not a number or over the cap, a lender already owed, three loans open, the table of 40 debts full), and a second table
// for `serviceDebt`, which is not an act but a function that books money: it answers 0 where an act answers null.
//
// The blocked states: a life that is not stamped; the person dead, a pet, estranged or not in the game; the call-in cooldown not elapsed; the
// edge cap reached (a map of 1,200 bound edges with none for this person); a key whose second end is not the current ego (another owner's edge,
// or an edge between two other people); a person that does not match the key; and the roles of the other two acts (a vouch for a third who is
// the voucher, dead or already at 100; a broker for a relative who is not cut out, has no edge or is already at the top of the obligation).
import { describe, expect, it } from 'vitest'
import { personEntity } from '../src/game/kernel/person-ref'
import { runAct, type SocialAct } from '../src/game/society/acts'
import { debtToken, serviceDebt } from '../src/game/society/debt'
import { broker, helpAct, vouch } from '../src/game/society/favor'
import { askLoan, lend, lendAct, loanAct } from '../src/game/society/loan'
import type { Edge } from '../src/game/world/edges'
import { putEdge } from '../src/game/world/edge-write'
import { playerRef } from '../src/game/world/people'
import type { GameState, Person } from '../src/game/types'
import { makeTestGame } from './helpers'
import { cast, socialGame } from './social-kit'

/** The cast of one row: a stamped adult with a circle of friends. The giver is asked; the third is vouched to; the relative is cut out. */
interface World {
  g: GameState
  giver: Person
  third: Person
  relative: Person
  others: Person[]
  /** The sum a loan row is asked for (a state may change it). */
  amount: number
}

const keyOf = (g: GameState, p: Person): string => `${personEntity(p)}>${playerRef(g)}`

function setEdge(g: GameState, p: Person, over: Partial<Edge> = {}): void {
  if (!putEdge(g, keyOf(g, p), { t: 60, f: p.relationship, r: 50, s: 0, o: 0, y: g.year, l: g.year, ...over })) throw new Error('setEdge refused')
}

function build(stamped = true, row?: ActRow): World {
  const g = stamped ? socialGame(1) : makeTestGame(1)
  g.character.age = 30
  const people: Person[] = []
  for (let i = 0; i < 8; i++) people.push(cast(g, 70, 'friend'))
  const [giver, third, relative, ...others] = people as [Person, Person, Person, ...Person[]]
  relative.data.wl = { by: g.character.id, anger: 60, cut: true, estr: true }
  if (stamped) setEdge(g, relative, { s: 50 })
  const w: World = { g, giver, third, relative, others, amount: 10_000 }
  row?.prep?.(w)
  return w
}

/** The giver is rich, so that the loan rows are blocked by the state under test and by nothing else. */
const rich = (w: World): void => void (w.giver.money = 1_000_000)

/** The debt of the player to a person, written by hand: the edge `player > person`, kind 0, `since` a year back. */
function owe(w: World, p: Person, owed = 8_000): void {
  expect(putEdge(w.g, `${playerRef(w.g)}>${personEntity(p)}`, { t: 50, f: 50, r: 50, s: 0, o: 0, y: w.g.year, l: w.g.year, dv: [owed, 8, w.g.year - 1, 0, 0] })).toBe(true)
}

/** Takes the debts of the player to a person off again (the loan rows can be asked once the debt is gone). */
const forgive = (w: World, p: Person): void => void putEdge(w.g, `${playerRef(w.g)}>${personEntity(p)}`, { dv: undefined })

/** One act in the table: how to make it, who it is run on, and the extra blocked states that belong to its own roles. */
interface ActRow {
  name: string
  make(w: World): SocialAct
  /** The person the act is run on (the one who is asked). */
  who(w: World): Person
  extra: readonly State[]
  /** Makes the world fit the act (the loan rows need a lender with cash), before any blocked state is applied. */
  prep?(w: World): void
  /** Opens the act again after it ran once (the loan rows are closed by the debt they made). */
  reopen?(w: World): void
  /** The function that wraps the act for a caller (`askLoan`, `lend`) and what it answers when the act is refused (null, false). Not run in a state that changes the key or the person. */
  door?: { call(w: World, who: Person): unknown; refused: unknown }
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

/** The blocked states of the two loan rows: the lender's cash and the amount, and what the player already owes. */
const LOAN_STATES: readonly State[] = [
  { name: 'lender cash below the principal', apply: (w, r) => void (r.who(w).money = 5_000) },
  { name: 'lender cash nothing', apply: (w, r) => void (r.who(w).money = 0) },
  { name: 'lender cash not a number', apply: (w, r) => void (r.who(w).money = Number.NaN) },
  { name: 'the amount over the cap (a lender with 1e12 still lends 2 x a typical income at most)', apply: (w, r) => void ((r.who(w).money = 1e12), (w.amount = 1e9)) },
  { name: 'the amount under the least', apply: (w) => void (w.amount = 5) },
  { name: 'the amount zero', apply: (w) => void (w.amount = 0) },
  { name: 'the amount negative', apply: (w) => void (w.amount = -10_000) },
  { name: 'the amount not a number', apply: (w) => void (w.amount = Number.NaN) },
  { name: 'the amount infinite', apply: (w) => void (w.amount = Number.POSITIVE_INFINITY) },
  { name: 'the player under 18', apply: (w) => void (w.g.character.age = 17) },
  { name: 'the lender under 18', apply: (w, r) => void (r.who(w).age = 15) },
  { name: 'the key of the debt (player > lender) and not the lender\'s edge', apply: () => undefined, key: (w, r) => `${playerRef(w.g)}>${personEntity(r.who(w))}` },
  { name: 'the player already owes this lender', apply: (w, r) => owe(w, r.who(w)) },
  { name: 'three loans open', apply: (w) => void w.others.slice(0, 3).forEach((p) => owe(w, p)) },
  {
    name: 'the table of 40 debts full',
    apply: (w) => {
      for (let i = 0; i < 40; i++) expect(putEdge(w.g, `person:d${i}>person:e${i}`, { t: 50, f: 50, r: 50, s: 0, o: 0, y: w.g.year, l: w.g.year, dv: [100, 0, w.g.year - 1, 1, 0] })).toBe(true)
    },
  },
  {
    name: 'the table of 40 debts full and an old edge to this lender already there',
    apply: (w, r) => {
      for (let i = 0; i < 40; i++) expect(putEdge(w.g, `person:d${i}>person:e${i}`, { t: 50, f: 50, r: 50, s: 0, o: 0, y: w.g.year, l: w.g.year, dv: [100, 0, w.g.year - 1, 1, 0] })).toBe(true)
      expect(putEdge(w.g, `${playerRef(w.g)}>${personEntity(r.who(w))}`, { t: 50, f: 50, r: 50, s: 0, o: 0, y: w.g.year - 9, l: w.g.year - 9 })).toBe(true)
    },
  },
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
  {
    name: 'loan ask',
    make: (w) => loanAct(w.amount),
    who: (w) => w.giver,
    extra: LOAN_STATES,
    prep: rich,
    reopen: (w) => forgive(w, w.giver),
    door: { call: (w, who) => askLoan(w.g, who, w.amount), refused: null },
  },
  {
    name: 'lend',
    make: (w) => lendAct(w.amount),
    who: (w) => w.giver,
    extra: LOAN_STATES,
    prep: rich,
    reopen: (w) => forgive(w, w.giver),
    door: { call: (w, who) => lend(w.g, who, w.amount), refused: false },
  },
]

describe('authorization inside the function: runAct called directly, bypassing the menu', () => {
  for (const row of ACTS) {
    describe(row.name, () => {
      for (const state of [...STATES, ...row.extra]) {
        it(`answers null and changes nothing for: ${state.name}`, () => {
          const w = build(state.stamped ?? true, row)
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
          if (row.door !== undefined && state.key === undefined && state.person === undefined) {
            expect(row.door.call(w, who), `${row.name} through its door`).toBe(row.door.refused)
            expect(JSON.stringify(w.g)).toBe(before)
            expect(w.g.rng).toBe(rng)
            expect(w.g.nextId).toBe(nextId)
          }
        })
      }

      it('control: the same call in the allowed state answers with a patch and writes the call-in', () => {
        const w = build(true, row)
        const who = row.who(w)
        const before = JSON.stringify(w.g)
        const out = runAct(w.g, row.make(w), keyOf(w.g, who), who)
        expect(out).not.toBeNull()
        expect(JSON.stringify(w.g)).not.toBe(before)
        expect(w.g.world?.edges).toBeDefined()
      })

      it('control: the cooldown opens after 3 years, and not before', () => {
        const w = build(true, row)
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
        row.reopen?.(w)
        expect(runAct(w.g, row.make(w), keyOf(w.g, who), who)).not.toBeNull()
      })
    })
  }

  it('the table is not vacuous: five acts, at least 18 blocked states for each, and the stamped control rows', () => {
    expect(ACTS).toHaveLength(5)
    for (const r of ACTS) expect(STATES.length + r.extra.length).toBeGreaterThanOrEqual(18)
  })

  it('the loan rows ask a lender who can lend: in the allowed state the patch moves the principal and writes the debt', () => {
    for (const make of [loanAct, lendAct]) {
      const w = build(true, ACTS.find((r) => r.name === 'lend'))
      const cash = w.g.character.money
      const out = runAct(w.g, make(w.amount), keyOf(w.g, w.giver), w.giver)
      expect(out).not.toBeNull()
      // the ask may be refused by its roll; the lend never is
      if (make === lendAct) {
        expect(w.g.character.money).toBe(cash + w.amount)
        expect(w.giver.money).toBe(1_000_000 - w.amount)
      }
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// serviceDebt: a function that books money, so it answers 0 where an act answers null

describe('authorization inside the function: serviceDebt called directly', () => {
  /** A stamped adult with cash, a creditor who is owed $8,000 on `player > creditor` and the token of the payment. */
  interface Pay {
    w: World
    creditor: Person
    key: string
    token: string
    amount: number
  }

  function pay(stamped = true): Pay {
    const w = build(stamped)
    w.g.character.money = 50_000
    const creditor = w.giver
    if (stamped) owe(w, creditor)
    const key = `${playerRef(w.g)}>${personEntity(creditor)}`
    return { w, creditor, key, token: debtToken('debt', w.g.year, key), amount: 2_000 }
  }

  interface PayState {
    name: string
    apply(p: Pay): void
    stamped?: boolean
  }

  const blocked: readonly PayState[] = [
    { name: 'a life that is not stamped', apply: () => undefined, stamped: false },
    { name: 'the creditor dead', apply: (p) => void (p.creditor.alive = false) },
    { name: 'the creditor a pet', apply: (p) => void (p.creditor.relation = 'pet') },
    { name: 'the creditor not in the game', apply: (p) => void (p.w.g.people = p.w.g.people.filter((x) => x.id !== p.creditor.id)) },
    { name: 'no debt on the edge', apply: (p) => forgive(p.w, p.creditor) },
    { name: 'no edge at all', apply: (p) => void putEdge(p.w.g, p.key, null) },
    { name: 'a debt paid in full (nothing left)', apply: (p) => void putEdge(p.w.g, p.key, { dv: [8_000, 8, p.w.g.year - 1, 0, 8_000] }) },
    { name: 'a debt of a kind the record allows and the books do not (5)', apply: (p) => void putEdge(p.w.g, p.key, { dv: [8_000, 0, p.w.g.year - 1, 5, 0] }) },
    { name: 'the player with no cash', apply: (p) => void (p.w.g.character.money = 0) },
    { name: 'the player in debt', apply: (p) => void (p.w.g.character.money = -500) },
    { name: 'the player\'s cash not a number', apply: (p) => void (p.w.g.character.money = Number.NaN) },
    { name: 'the amount NaN', apply: (p) => void (p.amount = Number.NaN) },
    { name: 'the amount zero', apply: (p) => void (p.amount = 0) },
    { name: 'the amount negative', apply: (p) => void (p.amount = -50) },
    { name: 'the amount under a dollar', apply: (p) => void (p.amount = 0.99) },
    { name: 'the amount infinite', apply: (p) => void (p.amount = Number.POSITIVE_INFINITY) },
    { name: 'the token empty', apply: (p) => void (p.token = '') },
    { name: 'the token already booked this year', apply: (p) => void expect(serviceDebt(p.w.g, p.key, 100, p.token)).toBe(100) },
    { name: 'the key of an earlier ego', apply: (p) => void ((p.key = `person:old-ego>${personEntity(p.creditor)}`), putEdge(p.w.g, p.key, { t: 50, f: 50, r: 50, s: 0, o: 0, y: p.w.g.year, l: p.w.g.year, dv: [8_000, 0, p.w.g.year - 1, 0, 0] })) },
    { name: 'the key of a debt the creditor owes the player (the mirror of the legacy record)', apply: (p) => void ((p.key = `${personEntity(p.creditor)}>${playerRef(p.w.g)}`), putEdge(p.w.g, p.key, { t: 50, f: 50, r: 50, s: 0, o: 0, y: p.w.g.year, l: p.w.g.year, dv: [8_000, 0, p.w.g.year - 1, 0, 0] })) },
    { name: 'a key between two other people', apply: (p) => void ((p.key = `${personEntity(p.w.others[0]!)}>${personEntity(p.w.others[1]!)}`), putEdge(p.w.g, p.key, { t: 50, f: 50, r: 50, s: 0, o: 0, y: p.w.g.year, l: p.w.g.year, dv: [8_000, 0, p.w.g.year - 1, 0, 0] })) },
    { name: 'the key of the ego to itself', apply: (p) => void (p.key = `${playerRef(p.w.g)}>${playerRef(p.w.g)}`) },
    { name: 'a key that is not a key', apply: (p) => void (p.key = 'person:p1>') },
    { name: 'a key that is not text', apply: (p) => void (p.key = undefined as never) },
  ]

  for (const state of blocked) {
    it(`answers 0 and changes nothing for: ${state.name}`, () => {
      const p = pay(state.stamped ?? true)
      state.apply(p)
      const before = JSON.stringify(p.w.g)
      const rng = p.w.g.rng
      const nextId = p.w.g.nextId
      expect(serviceDebt(p.w.g, p.key, p.amount, p.token)).toBe(0)
      expect(JSON.stringify(p.w.g)).toBe(before)
      expect(p.w.g.rng).toBe(rng)
      expect(p.w.g.nextId).toBe(nextId)
    })
  }

  it('control: the same call in the allowed state pays, books it and writes dv[4]; an estranged creditor is paid too', () => {
    const p = pay(true)
    p.creditor.data.wl = { by: p.w.g.character.id, anger: 60, cut: true, estr: true }
    const before = JSON.stringify(p.w.g)
    expect(serviceDebt(p.w.g, p.key, p.amount, p.token)).toBe(2_000)
    expect(JSON.stringify(p.w.g)).not.toBe(before)
    expect(p.w.g.character.money).toBe(48_000)
    expect(p.w.g.world?.edges).toBeDefined()
    expect(blocked.length).toBeGreaterThanOrEqual(20)
  })
})
