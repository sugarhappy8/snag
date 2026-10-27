// ci: fast
// R4-L6 (A.K8 a, D4, X18, X24, X34, C10, C11, C37): what the dead player owed to people is paid out of the estate, and what people owed the
// dead player passes to the heir by the will's share (src/game/modules/heirs.ts, called from continueAsChild on a stamped life only).
//
// What the file proves, in the order of the plan:
//   1. The debts: a $120,000 divorce debt and a $30,000 loan to a sibling are paid from a $1M estate, the heir's cash drops, the creditors'
//      money rises, the rows are `divorce` and `support`, the books balance, every edge the late player owned is gone, and the sentence
//      reaches the Generation notice.
//   2. The order and the limits: oldest first (by the age of the debt, not by its kind); the bank loans come first and still burn what the
//      estate cannot cover; a sole keeper is not paid twice; debts 100 times the estate pay at most the estate; a creditor who is gone,
//      dead or a pet, and a kind nobody serves, lapse with no money moved and no burn.
//   3. The tokens: two debts whose edge keys differ only in the last characters of two 40-character sids get two tokens, three years running.
//   4. The receivables: a friend's $40,000 passes at the heir's third of the will, stamped by the heir, one edge debt, a third owner reads
//      blank, a cut-out heir carries nothing, the rest is forgiven in one line, the claim never grows (1e12, 1e300, shares from 0 to 1).
//   5. The guards: hostile `dv` and `owes` read as none; an unstamped life changes nothing; the hand-over is a pure function of the state
//      (twice equal) and draws nothing; five generations leave no debt edge behind; the source and the docs keep the rules.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { killCharacter } from '../src/game/death'
import { updateTies, readTies } from '../src/game/events/wealth-core'
import { changeWill, removeHeir } from '../src/game/events/will-act'
import { addMoney } from '../src/game/core'
import { flowsOf, tokenSeen } from '../src/game/kernel/ledger'
import { personEntity } from '../src/game/kernel/person-ref'
import { continueAsChild } from '../src/game/life'
import { carryReceivables, estateSentences, heirShareOf, payPersonalDebts } from '../src/game/modules/heirs'
import { DEBT_KIND, debtToken, debtsOf } from '../src/game/society/contract'
import type { Asset, Character, GameState, Person } from '../src/game/types'
import { edgeKey, edgesOf, openDebts, readEdge } from '../src/game/world/edges'
import { putEdge } from '../src/game/world/edge-write'
import { worldProblems } from '../src/game/world/invariants'
import { playerRef } from '../src/game/world/people'
import { socialOn, stampSocial } from '../src/game/world/social'
import { trapRng } from './effort-kit'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'
import { withLife } from './kin-kit'
import { acctOf, expectConserved, flowTotal } from './ledger-kit'
import { cast } from './social-kit'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8')
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)

const person = (id: string): `person:${string}` => `person:${id}`
const rows = (g: GameState, reason: string): number => flowsOf(g).filter((r) => r.reason === reason).length

// ---------------------------------------------------------------------------------------------------------------------
// The family

interface Fam {
  g: GameState
  /** The child who takes over, and the other children. */
  heir: Person
  sibs: Person[]
}

/** A stamped old player with `kids` adult children (50, 47, 44), `money` in cash and nothing else, alive and ready to be killed. */
function fam(money: number, kids = 3, year = 2026, stamped = true): Fam {
  const g = makeTestGame(1, { age: 78, money, countryId: 'us', residence: { status: 'renting', rent: 0 } })
  g.year = year
  g.log = [{ age: g.character.age, year, entries: [] }]
  if (stamped) stampSocial(g)
  const mk = (age: number): Person => {
    const p = cast(g, 70, 'child', { age, money: 20_000, countryId: 'us', traits: ['kind', 'calm'] })
    p.yearsKnown = Math.min(age, 40)
    return p
  }
  const all = [50, 47, 44].slice(0, kids).map(mk)
  return { g, heir: all[0]!, sibs: all.slice(1) }
}

function die(g: GameState): void {
  killCharacter(g, 'Old Age')
  g.queue = g.queue.filter((m) => m.kind !== 'aiTask')
}

/** The late player owes `p` `owed` dollars, opened in `since`: the edge player > person with its debt record. Returns the key. */
function owe(g: GameState, p: Person, owed: number, since: number, kind: number = DEBT_KIND.loan): string {
  const key = edgeKey(playerRef(g), personEntity(p))!
  expect(putEdge(g, key, { t: 50, f: 50, r: 50, s: 0, o: 0, y: g.year, l: g.year, dv: [owed, 0, since, kind, 0] })).toBe(true)
  return key
}

/** The edges the account owns: the keys that start at it. */
const ownedBy = (g: GameState, ref: string): string[] => edgesOf(g, ref as never).map(([k]) => k).filter((k) => k.startsWith(`${ref}>`))

/** The Generation notice of a hand-over. */
function generationText(n: GameState): string {
  const m = n.queue.find((x) => x.kind === 'notice' && x.title.startsWith('Generation'))
  return m && m.kind === 'notice' ? m.text : ''
}

function house(value: number): Asset {
  return { id: 'h1', kind: 'house', name: 'Starter Home', emoji: '', purchasePrice: value, value, condition: 80, purchasedAge: 30, upkeep: 0, details: {} }
}

/** The books are whole and nothing was booked as unreasoned. */
function clean(g: GameState): void {
  expect(rows(g, 'unreasoned')).toBe(0)
  expectConserved(g)
}

// ---------------------------------------------------------------------------------------------------------------------
// 1. The debts

describe('what the late player owed to people', () => {
  it('pays a $120,000 divorce debt and a $30,000 loan to a sibling out of a $1M estate; the heir gets less, the creditors more, the books balance', () => {
    const f = fam(1_000_000)
    const twin = fam(1_000_000)
    const ex = cast(f.g, 15, 'exSpouse', { age: 52, money: 0 })
    const sib = f.sibs[0]!
    const k1 = owe(f.g, ex, 120_000, 2019, DEBT_KIND.divorce)
    const k2 = owe(f.g, sib, 30_000, 2024, DEBT_KIND.loan)
    die(f.g)
    die(twin.g)
    const dead = f.g.character.id
    const n = continueAsChild(f.g, f.heir.id)
    const base = continueAsChild(twin.g, twin.heir.id)

    // 850,000 in three after the 150,000; the twin without debts splits 1,000,000
    expect(base.character.money).toBe(20_000 + 333_333)
    expect(n.character.money).toBe(20_000 + 283_333)
    expect(acctOf(n, person(f.heir.id))).toBe(283_333)
    expect(acctOf(n, person(ex.id))).toBe(120_000)
    expect(acctOf(n, person(sib.id))).toBe(30_000 + 283_333)
    expect(n.people.find((p) => p.id === sib.id)!.money).toBe(20_000 + 30_000 + 283_333)
    expect(rows(n, 'divorce')).toBe(1)
    expect(rows(n, 'support')).toBe(1)
    expect(flowTotal(n, 'writeoff', 'burn', 2026, 'us')).toBe(0)
    expect(acctOf(n, person(dead))).toBe(0)
    clean(n)
    expect(worldProblems(n)).toEqual([])
    // each payment was booked once under its own token, short enough for the ledger
    for (const k of [k1, k2]) {
      const t = debtToken('estate', 2026, k as never, dead)
      expect(tokenSeen(n, t)).toBe(true)
      expect(t.length).toBeLessThan(40)
    }
    // every debt that was listed is closed: no edge keyed from the late ego is left, and nothing counts against the 40
    expect(ownedBy(n, person(dead))).toEqual([])
    expect(readEdge(n, person(dead) as never, personEntity(ex))).toBeNull()
    expect(openDebts(n)).toBe(0)
    expect(debtsOf(n, person(dead) as never)).toEqual([])
    // the sentence reaches the Generation notice
    expect(generationText(n)).toContain('The estate paid $150,000 that he owed to people.')
  })

  it('pays oldest first, by the age of the debt and not by its kind, and lets the rest lapse with no money moved and no burn', () => {
    for (const [divorceSince, loanSince, exGets, sibGets] of [
      [2018, 2024, 120_000, 10_000],
      [2024, 2015, 100_000, 30_000],
    ] as const) {
      const f = fam(130_000)
      const ex = cast(f.g, 15, 'exSpouse', { age: 52, money: 0 })
      const sib = f.sibs[0]!
      owe(f.g, ex, 120_000, divorceSince, DEBT_KIND.divorce)
      owe(f.g, sib, 30_000, loanSince, DEBT_KIND.loan)
      die(f.g)
      const n = continueAsChild(f.g, f.heir.id)
      expect(acctOf(n, person(ex.id))).toBe(exGets)
      expect(acctOf(n, person(sib.id))).toBe(sibGets)
      // nothing is left for the heirs, and nobody goes below what they had
      expect(n.character.money).toBe(20_000)
      expect(n.people.find((p) => p.id === sib.id)!.money).toBe(20_000 + sibGets)
      // the 20,000 that lapsed made no deposit, so it burns nothing
      expect(flowTotal(n, 'writeoff', 'burn', 2026, 'us')).toBe(0)
      expect(ownedBy(n, person(f.g.character.id))).toEqual([])
      expect(generationText(n)).toContain('$20,000 more went unpaid.')
      clean(n)
    }
  })

  it('pays the bank first: the bank part still burns what the estate cannot cover, and a personal debt after it gets what is left', () => {
    // 100,000 in cash, a 130,000 bank loan and a 40,000 debt to a friend: the bank takes it all, the burn is 30,000, the friend gets nothing
    const a = fam(100_000)
    a.g.character.loans.push({ id: 'l1', kind: 'personal', lender: 'Bank', balance: 130_000, rate: 0.05, yearsLeft: 5, yearlyPayment: 30_000, countryId: 'us' })
    const ex = cast(a.g, 15, 'exSpouse', { age: 52, money: 0 })
    owe(a.g, ex, 40_000, 2020, DEBT_KIND.divorce)
    die(a.g)
    const na = continueAsChild(a.g, a.heir.id)
    expect(flowTotal(na, 'loan.repay', 'pool', 2026, 'us')).toBe(100_000)
    expect(Math.abs(flowTotal(na, 'writeoff', 'burn', 2026, 'us'))).toBe(30_000)
    expect(acctOf(na, person(ex.id))).toBe(0)
    expect(na.character.money).toBe(20_000)
    expect(ownedBy(na, person(a.g.character.id))).toEqual([])
    clean(na)

    // 150,000 in cash and a 100,000 bank loan: the bank is paid in full and the debt gets the other 50,000 of its 60,000
    const b = fam(150_000)
    b.g.character.loans.push({ id: 'l2', kind: 'personal', lender: 'Bank', balance: 100_000, rate: 0.05, yearsLeft: 5, yearlyPayment: 20_000, countryId: 'us' })
    const ex2 = cast(b.g, 15, 'exSpouse', { age: 52, money: 0 })
    owe(b.g, ex2, 60_000, 2020, DEBT_KIND.divorce)
    die(b.g)
    const nb = continueAsChild(b.g, b.heir.id)
    expect(flowTotal(nb, 'loan.repay', 'pool', 2026, 'us')).toBe(100_000)
    expect(flowTotal(nb, 'writeoff', 'burn', 2026, 'us')).toBe(0)
    expect(acctOf(nb, person(ex2.id))).toBe(50_000)
    expect(nb.character.money).toBe(20_000)
    clean(nb)
  })

  it('does not pay a sole keeper twice: the cash after the debts is what the heir keeps beside the house', () => {
    const f = fam(1_000_000, 1)
    f.g.assets.push(house(300_000))
    const ex = cast(f.g, 15, 'exSpouse', { age: 52, money: 0 })
    owe(f.g, ex, 150_000, 2019, DEBT_KIND.divorce)
    die(f.g)
    const n = continueAsChild(f.g, f.heir.id)
    expect(n.assets.map((a) => a.id)).toContain('h1')
    expect(acctOf(n, person(ex.id))).toBe(150_000)
    expect(n.character.money).toBe(20_000 + 850_000)
    clean(n)

    // when the cash alone cannot pay the debt, the property is sold into the estate, as it is for a bank loan
    const g2 = fam(100_000, 1)
    g2.g.assets.push(house(300_000))
    const ex2 = cast(g2.g, 15, 'exSpouse', { age: 52, money: 0 })
    owe(g2.g, ex2, 150_000, 2019, DEBT_KIND.divorce)
    die(g2.g)
    const n2 = continueAsChild(g2.g, g2.heir.id)
    expect(n2.assets.map((a) => a.id)).not.toContain('h1')
    expect(acctOf(n2, person(ex2.id))).toBe(150_000)
    expect(n2.character.money).toBe(20_000 + 250_000)
    clean(n2)
  })

  it('pays the heir too when the heir is the creditor, and the money is in their hands when they take over', () => {
    const f = fam(600_000)
    owe(f.g, f.heir, 30_000, 2022, DEBT_KIND.loan)
    die(f.g)
    const n = continueAsChild(f.g, f.heir.id)
    // 570,000 in three, and the 30,000 the heir lent
    expect(n.character.money).toBe(20_000 + 30_000 + 190_000)
    expect(acctOf(n, person(f.heir.id))).toBe(30_000 + 190_000)
    clean(n)
  })

  it('lets a debt lapse when its creditor is gone, dead or a pet, or when nobody serves its kind: no money moves, the edge goes, no burn', () => {
    const f = fam(500_000)
    const gone = cast(f.g, 15, 'friend', { age: 60, money: 0 })
    const dead = cast(f.g, 15, 'friend', { age: 80, money: 0 })
    dead.alive = false
    const pet = cast(f.g, 50, 'pet', { age: 4 })
    const odd = cast(f.g, 15, 'friend', { age: 60, money: 0 })
    owe(f.g, gone, 10_000, 2020, DEBT_KIND.loan)
    owe(f.g, dead, 20_000, 2020, DEBT_KIND.loan)
    owe(f.g, pet, 30_000, 2020, DEBT_KIND.loan)
    owe(f.g, odd, 40_000, 2020, 2)
    // 'gone' leaves the game before the death
    f.g.people = f.g.people.filter((p) => p.id !== gone.id)
    die(f.g)
    const before = JSON.stringify(f.g)
    const n = continueAsChild(f.g, f.heir.id)
    expect(JSON.stringify(f.g)).toBe(before)
    for (const p of [gone, dead, pet, odd]) expect(acctOf(n, person(p.id))).toBe(0)
    expect(rows(n, 'support')).toBe(0)
    expect(flowTotal(n, 'writeoff', 'burn', 2026, 'us')).toBe(0)
    expect(ownedBy(n, person(f.g.character.id))).toEqual([])
    expect(openDebts(n)).toBe(0)
    // the heirs share the whole 500,000: nothing was paid
    expect(n.character.money).toBe(20_000 + Math.floor(500_000 / 3))
    expect(generationText(n)).toContain('He owed people $100,000, and none of it was paid.')
    clean(n)
  })

  it('keeps every growth term bounded: debts 100 times the estate pay at most the estate, never below zero cash', () => {
    const f = fam(50_000)
    const people = [0, 1, 2, 3].map(() => cast(f.g, 40, 'friend', { age: 40, money: 0 }))
    people.forEach((p, i) => owe(f.g, p, 1_250_000, 2015 + i, DEBT_KIND.loan))
    die(f.g)
    const n = continueAsChild(f.g, f.heir.id)
    const paid = people.reduce((s, p) => s + acctOf(n, person(p.id)), 0)
    expect(paid).toBe(50_000)
    // the oldest creditor takes it all
    expect(acctOf(n, person(people[0]!.id))).toBe(50_000)
    expect(n.character.money).toBe(20_000)
    expect(flowTotal(n, 'writeoff', 'burn', 2026, 'us')).toBe(0)
    expect(openDebts(n)).toBe(0)
    clean(n)

    // the function on its own, at the ends: the claims are never paid beyond what is available or owed
    for (const available of [0, 1, 49_999.9, 50_000, 1e9, 1e15, Number.NaN, -5, Number.POSITIVE_INFINITY]) {
      const g = fam(50_000).g
      const c = [0, 1, 2].map(() => cast(g, 40, 'friend', { age: 40, money: 0 }))
      c.forEach((p, i) => owe(g, p, 1e12, 2015 + i, DEBT_KIND.loan))
      die(g)
      const m = structuredClone(g)
      const r = payPersonalDebts(m, m.character, available)
      const cap = Number.isFinite(available) ? Math.max(0, Math.floor(available)) : 0
      expect(r.paid).toBeLessThanOrEqual(cap)
      expect(r.paid + r.lapsed).toBeLessThanOrEqual(3e12 + 1)
      expect(Number.isFinite(r.paid) && Number.isFinite(r.lapsed)).toBe(true)
      expect(c.reduce((s, p) => s + acctOf(m, person(p.id)), 0)).toBe(r.paid)
      expect(ownedBy(m, person(m.character.id))).toEqual([])
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 3. The tokens

describe('the token of a payment', () => {
  it('is different for two debts whose edge keys differ only in the last characters of two 40-character sids, in each of three years', () => {
    for (const year of [2026, 2027, 2028]) {
      const f = fam(900_000, 3, year)
      const sid1 = `${'q'.repeat(38)}01`
      const sid2 = `${'q'.repeat(38)}02`
      const c1 = cast(f.g, 40, 'friend', { age: 40, money: 0 })
      const c2 = cast(f.g, 40, 'friend', { age: 40, money: 0 })
      c1.data.sid = sid1
      c2.data.sid = sid2
      expect(personEntity(c1)).toBe(`person:${sid1}`)
      const k1 = owe(f.g, c1, 10_000, year - 3, DEBT_KIND.loan)
      const k2 = owe(f.g, c2, 20_000, year - 2, DEBT_KIND.loan)
      expect(sid1.length).toBe(40)
      die(f.g)
      const dead = f.g.character.id
      const t1 = debtToken('estate', year, k1 as never, dead)
      const t2 = debtToken('estate', year, k2 as never, dead)
      expect(t1).not.toBe(t2)
      const n = continueAsChild(f.g, f.heir.id)
      expect(acctOf(n, `person:${sid1}`)).toBe(10_000)
      expect(acctOf(n, `person:${sid2}`)).toBe(20_000)
      expect(tokenSeen(n, t1) && tokenSeen(n, t2)).toBe(true)
      expect(ownedBy(n, person(dead))).toEqual([])
      clean(n)
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 4. The receivables

/** A friend who owes the late player `owes`, since `since`; with a life, so the hand-over keeps the friend (the old rule). */
function lent(g: GameState, owes: number, since = 2022): Person {
  const p = withLife(cast(g, 55, 'friend', { age: 40, money: 0 }))
  updateTies(g, p, (t) => {
    t.owes = owes
    t.owesSince = since
    t.allowance = 700
    t.marks.avoid = 2020
  })
  return p
}

describe('what people owed the late player', () => {
  it('passes at the will share, stamped by the heir: a friend who owed $40,000 owes $13,333 to the heir, with one edge debt and the rest forgiven', () => {
    const f = fam(900_000)
    const friend = lent(f.g, 40_000)
    expect(readEdge(f.g, personEntity(friend), playerRef(f.g))?.dv).toEqual([40_000, 0, 2022, 0, 0])
    die(f.g)
    const dead = f.g.character.id
    const n = continueAsChild(f.g, f.heir.id)
    const kept = n.people.find((p) => p.id === friend.id)!
    expect(kept.relation).toBe('friend')
    const t = readTies(n, kept)
    expect(t.owes).toBe(13_333)
    expect(t.owesSince).toBe(2022)
    expect(t.by).toBe(f.heir.id)
    expect((kept.data.w as { by: string }).by).toBe(f.heir.id)
    // the allowance, the history and the marks stay blank: they are the late player's
    expect(t.allowance).toBe(0)
    expect(t.marks).toEqual({})
    expect(t.history).toEqual([])
    // one edge debt towards the heir, written by the mirror of updateTies, and no copy of the old one
    expect(readEdge(n, personEntity(kept), playerRef(n))?.dv).toEqual([13_333, 0, 2022, 0, 0])
    const towardsHeir = edgesOf(n, playerRef(n)).filter(([k, e]) => k.endsWith(`>${playerRef(n)}`) && e.dv !== undefined)
    expect(towardsHeir).toHaveLength(1)
    // a third owner reads blank (the readers stay owner-stamped, C11)
    const other = structuredClone(n)
    other.character.id = 'someone-else'
    expect(readTies(other, kept).owes).toBe(0)
    expect(generationText(n)).toContain('You took over $13,333 of what people owed him. The other $26,667 was forgiven.')
    expect(rows(n, 'unreasoned')).toBe(0)
    expect(ownedBy(n, person(dead))).toEqual([])
  })

  it('reads the share from the will: a 50 and a 100 weight make a third and two thirds, a charity slice takes its part off the top', () => {
    const f = fam(900_000)
    changeWill(f.g, (gg, w) => {
      gg.character.willBeneficiaries = [f.heir.id, f.sibs[0]!.id]
      w.shares[f.heir.id] = 50
      w.shares[f.sibs[0]!.id] = 100
    })
    f.g.queue = []
    const n = structuredClone(f.g)
    expect(heirShareOf(n, f.heir.id)).toBeCloseTo(1 / 3, 9)
    expect(heirShareOf(n, f.sibs[0]!.id)).toBeCloseTo(2 / 3, 9)
    expect(heirShareOf(n, f.sibs[1]!.id)).toBe(0)
    expect(heirShareOf(n, 'nobody')).toBe(0)
    changeWill(n, (_g, w) => {
      w.charity = 20
      w.shares[f.heir.id] = 100
      w.shares[f.sibs[0]!.id] = 100
    })
    n.queue = []
    expect(heirShareOf(n, f.heir.id)).toBeCloseTo(0.4, 9)
    // no will: an even split among the living children
    expect(heirShareOf(fam(1, 3).g, 'x')).toBe(0)
    const even = fam(1, 3)
    expect(heirShareOf(even.g, even.heir.id)).toBeCloseTo(1 / 3, 9)
    // a read: a frozen state with a trapped roll, nothing written
    const frozen = deepFreeze(trapRng(structuredClone(even.g)))
    expect(heirShareOf(frozen, even.heir.id)).toBeCloseTo(1 / 3, 9)
  })

  it('carries nothing for a heir the will cuts out, and forgives the claim in one line', () => {
    const f = fam(900_000)
    const friend = lent(f.g, 40_000)
    changeWill(f.g, (gg, w) => removeHeir(gg, w, f.heir))
    f.g.queue = []
    die(f.g)
    const n = continueAsChild(f.g, f.heir.id)
    const kept = n.people.find((p) => p.id === friend.id)!
    expect(readTies(n, kept).owes).toBe(0)
    expect(edgesOf(n, playerRef(n)).filter(([k, e]) => k.endsWith(`>${playerRef(n)}`) && e.dv !== undefined)).toHaveLength(0)
    expect(generationText(n)).toContain('The $40,000 people owed him was forgiven.')
  })

  it('never carries more than the claim, the trillion or the share, for any claim and any share', () => {
    for (const claim of [1, 7, 100, 40_000, 1e12, 1e13, 1e300]) {
      for (const share of [0, 0.25, 1 / 3, 1, 2, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
        const f = fam(1)
        const friends = [0, 1, 2].map(() => cast(f.g, 50, 'friend', { age: 40, money: 0 }))
        for (const p of friends) p.data.w = { by: f.g.character.id, owes: claim, owesSince: 2020 }
        const n = structuredClone(f.g)
        const old = n.character
        n.character = { ...old, id: 'heir-id' } as Character
        const r = carryReceivables(n, old, share)
        const s = Number.isFinite(share) ? Math.min(1, Math.max(0, share)) : 0
        const each = Math.min(claim, 1e12)
        expect(r.carried).toBeLessThanOrEqual(3 * each)
        expect(r.carried).toBeLessThanOrEqual(3 * Math.min(each, Math.round(each * s)) + 3)
        expect(Number.isFinite(r.carried) && Number.isFinite(r.forgiven)).toBe(true)
        expect(r.forgiven).toBeGreaterThanOrEqual(0)
        for (const p of friends) expect(readTies(n, n.people.find((x) => x.id === p.id)!).owes).toBeLessThanOrEqual(each)
      }
    }
  })

  it('reads a hostile claim as none: NaN, a negative, text, an object, infinity and the late player\'s dead debtors', () => {
    const f = fam(1)
    const raws: unknown[] = [Number.NaN, -5, 'x', {}, [], Number.POSITIVE_INFINITY, null, undefined]
    const people = raws.map((raw) => {
      const p = cast(f.g, 50, 'friend', { age: 40, money: 0 })
      p.data.w = { by: f.g.character.id, owes: raw, owesSince: raw } as never
      return p
    })
    const gone = cast(f.g, 50, 'friend', { age: 40, money: 0 })
    gone.data.w = { by: f.g.character.id, owes: 5_000, owesSince: 2020 }
    gone.alive = false
    const stranger = cast(f.g, 50, 'friend', { age: 40, money: 0 })
    stranger.data.w = { by: 'someone-else', owes: 9_999, owesSince: 2020 }
    const n = structuredClone(f.g)
    const old = n.character
    n.character = { ...old, id: 'heir-id' } as Character
    const r = carryReceivables(n, old, 1)
    expect(r.carried).toBe(0)
    // the dead debtor's 5,000 cannot be taken on, so it is forgiven; the stranger's record is not the late player's
    expect(r.forgiven).toBe(5_000)
    for (const p of people) expect(readTies(n, n.people.find((x) => x.id === p.id)!).owes).toBe(0)
    expect(readTies(n, n.people.find((x) => x.id === stranger.id)!).owes).toBe(0)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 5. The guards

describe('guards', () => {
  it('reads a hostile debt record as no debt at all: nothing is paid, nothing throws, the books balance', () => {
    const raws: unknown[] = [[Number.NaN, 0, 2020, 0, 0], 'junk', [1e300, 0, 2020, 0, 0], [-5, 0, 2020, 1, 0], [10, 0, 2020, 99, 0], [], { a: 1 }, [5, 0, 2020, 0, 9], [50_000, 0, 2020]]
    const f = fam(300_000)
    const hostile = { t: 50, f: 50, r: 50, s: 0, o: 0, y: 2026, l: 2026 }
    const edges: Record<string, unknown> = {}
    raws.forEach((dv, i) => {
      const p = cast(f.g, 40, 'friend', { age: 40, money: 0 })
      edges[`${playerRef(f.g)}>${personEntity(p)}`] = { ...hostile, dv }
      expect(i).toBeGreaterThanOrEqual(0)
    })
    f.g.world = { ...(f.g.world ?? {}), edges } as never
    die(f.g)
    const n = continueAsChild(f.g, f.heir.id)
    expect(rows(n, 'support')).toBe(0)
    expect(rows(n, 'divorce')).toBe(0)
    expect(n.character.money).toBe(20_000 + 100_000)
    expect(openDebts(n)).toBe(0)
    clean(n)
  })

  it('changes nothing on a life the social stamp does not mark, in the functions and in the hand-over', () => {
    const f = fam(400_000, 3, 2026, false)
    const ex = cast(f.g, 15, 'exSpouse', { age: 52, money: 0 })
    const key = owe(f.g, ex, 100_000, 2019, DEBT_KIND.divorce)
    const friend = lent(f.g, 40_000)
    expect(socialOn(f.g)).toBe(false)
    die(f.g)
    const probe = structuredClone(f.g)
    const before = JSON.stringify(probe)
    expect(payPersonalDebts(probe, probe.character, 1e9)).toEqual({ paid: 0, lapsed: 0 })
    expect(JSON.stringify(probe)).toBe(before)
    const heirView = structuredClone(probe)
    heirView.character = { ...heirView.character, id: 'heir-id' } as Character
    expect(carryReceivables(heirView, probe.character, 1)).toEqual({ carried: 0, forgiven: 0 })
    expect(JSON.stringify({ ...heirView, character: probe.character })).toBe(before)

    const n = continueAsChild(f.g, f.heir.id)
    // the hand-written debt is untouched: the unstamped hand-over is the one of v5.2.0
    expect(acctOf(n, person(ex.id))).toBe(0)
    expect(readEdge(n, playerRef(f.g), personEntity(ex))?.dv).toEqual([100_000, 0, 2019, DEBT_KIND.divorce, 0])
    expect(key.length).toBeGreaterThan(0)
    expect(readTies(n, n.people.find((p) => p.id === friend.id)!).owes).toBe(0)
    expect(n.character.money).toBe(20_000 + Math.floor(400_000 / 3))
    expect(generationText(n)).not.toContain('owed')
    clean(n)
  })

  it('is a function of the state alone: the hand-over twice gives equal JSON, the first state is untouched, and the new code draws no roll', () => {
    const f = fam(1_000_000)
    const ex = cast(f.g, 15, 'exSpouse', { age: 52, money: 0 })
    owe(f.g, ex, 120_000, 2019, DEBT_KIND.divorce)
    owe(f.g, f.sibs[0]!, 30_000, 2024, DEBT_KIND.loan)
    lent(f.g, 40_000)
    die(f.g)
    const before = JSON.stringify(f.g)
    const first = continueAsChild(f.g, f.heir.id)
    const second = continueAsChild(f.g, f.heir.id)
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
    expect(JSON.stringify(f.g)).toBe(before)

    // the two functions on a state whose roll throws when it is read or written: nothing is drawn, no id is made
    const trapped = structuredClone(f.g)
    const old = trapped.character
    const next = trapped.nextId
    trapRng(trapped)
    expect(payPersonalDebts(trapped, old, 1e6).paid).toBe(150_000)
    trapped.character = { ...old, id: 'heir-id' } as Character
    expect(carryReceivables(trapped, old, 1 / 3).carried).toBe(13_333)
    expect(trapped.nextId).toBe(next)
  })

  it('does not let the count of debts creep over five generations: each hand-over closes every edge the late player owned', () => {
    let g = fam(2_000_000).g
    let heirId = g.people.find((p) => p.relation === 'child')!.id
    for (let gen = 0; gen < 5; gen++) {
      const ex = cast(g, 15, 'exSpouse', { age: 52, money: 0 })
      const friend = cast(g, 40, 'friend', { age: 40, money: 0 })
      owe(g, ex, 60_000, g.year - 6, DEBT_KIND.divorce)
      // the second debt is more than the estate can pay in the last generation: the estate pays what it has and the rest lapses
      owe(g, friend, gen === 4 ? 9_000_000 : 20_000, g.year - 2, DEBT_KIND.loan)
      expect(openDebts(g)).toBe(2)
      die(g)
      const dead = g.character.id
      const n = continueAsChild(g, heirId)
      expect(ownedBy(n, person(dead))).toEqual([])
      expect(openDebts(n)).toBe(0)
      expect(debtsOf(n, person(dead) as never)).toEqual([])
      expectConserved(n)
      // the next player: a year on, rich enough, and with an adult child to take over
      n.year += 1
      n.queue = []
      addMoney(n, 2_000_000 - n.character.money, 'luck')
      const child = cast(n, 70, 'child', { age: 22, money: 20_000, countryId: 'us' })
      child.yearsKnown = 22
      heirId = child.id
      g = n
    }
    expect(openDebts(g)).toBe(0)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// The words and the docs

describe('the sentences, the source and the docs', () => {
  it('tells the debts and the claims in short sentences with no dash, for any sum', () => {
    const old = { gender: 'female' } as Character
    for (const [paid, lapsed] of [[0, 0], [150_000, 0], [50_000, 20_000], [0, 40_000], [1e12, 1e12], [1e15, 1e15]] as const) {
      for (const [carried, forgiven] of [[0, 0], [13_333, 0], [13_333, 26_667], [0, 40_000], [1e12, 1e12]] as const) {
        const lines = estateSentences(old, { paid, lapsed }, { carried, forgiven })
        for (const line of lines) {
          expect(line.length).toBeLessThanOrEqual(140)
          expect(DASH.test(line)).toBe(false)
          expect(line.trim()).toBe(line)
        }
        expect(lines.length).toBe((paid + lapsed >= 1 ? 1 : 0) + (carried + forgiven >= 1 ? 1 : 0))
      }
    }
    expect(estateSentences(old, null, null)).toEqual([])
    expect(estateSentences(old, { paid: 150_000, lapsed: 0 }, null)).toEqual(['The estate paid $150,000 that she owed to people.'])
  })

  it('keeps its source rules: no long dash, no roll, no money written outside the ledger, no sid in an object literal', () => {
    const text = read('src/game/modules/heirs.ts')
    const code = text.replace(/\/\/.*$/gm, '')
    expect(DASH.test(text)).toBe(false)
    expect(/from '\.\.\/rng'|g\.rng|\brand(Int|Float)?\(|\bchance\(|\bweightedPick\(|Math\.random/.test(code)).toBe(false)
    expect(/\.money\s*(\+|-)?=[^=]/.test(code)).toBe(false)
    expect(/\b(addMoney|spend|earnIncome|bookMint|bookBurn)\(/.test(code)).toBe(false)
    expect(/\bsid:\s*[^\s,}]/.test(code)).toBe(false)
    // the life file calls the three functions and writes no booking of its own for them
    const life = read('src/game/life.ts')
    for (const name of ['heirShareOf', 'payPersonalDebts', 'carryReceivables', 'estateSentences']) expect(life).toContain(`${name}(`)
  })

  it('names the rules in docs/KIN.md and the two reasons in docs/LEDGER.md, with no long dash', () => {
    const kin = read('docs/KIN.md')
    for (const word of ['payPersonalDebts', 'carryReceivables', 'heirShareOf', 'debtToken', 'estate:']) expect(kin).toContain(word)
    const ledger = read('docs/LEDGER.md')
    expect(/\| `support` \|[^\n]*R4-L6/.test(ledger)).toBe(true)
    expect(/\| `divorce` \|[^\n]*R4-L6/.test(ledger)).toBe(true)
    expect(DASH.test(kin)).toBe(false)
    expect(DASH.test(ledger)).toBe(false)
  })
})
