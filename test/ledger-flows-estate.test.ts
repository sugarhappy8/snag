// R2-L8 (A.K1 e): migration 3, the events, the activities and the estate in life.ts. Every scenario plays one real flow of the batch
// through its public function and asserts what the batch owes: the player's cash and the player's account never part (driftSince),
// the reason rows and the class of the counterparty are the ones the plan names (flowTotal, acctOf), and the books balance
// (expectConserved). The estate scenarios settle a death through continueAsChild. Not in the fast tier.
import { describe, expect, it } from 'vitest'
import { payFor, payForAction } from '../src/game/activities/common'
import { boatingTestAction } from '../src/game/activities/licenses'
import { personCash } from '../src/game/cash'
import { killCharacter } from '../src/game/death'
import '../src/game/events'
import { applyFx } from '../src/game/events/helpers'
import { changeWill, removeHeir } from '../src/game/events/will-act'
import { readWl, updateWl } from '../src/game/events/will-core'
import { payOff } from '../src/game/events/will-scenes'
import { updateTies } from '../src/game/events/wealth-core'
import { giveFor } from '../src/game/events/wealth-resolve'
import { yearlyWealth } from '../src/game/events/wealth'
import { planEstate, yearlyEstateTail } from '../src/game/events/will-estate'
import { continueAsChild } from '../src/game/life'
import { acctBalance, flowsOf } from '../src/game/kernel/ledger'
import { createPerson } from '../src/game/people'
import { runScript } from '../src/game/scripts'
import type { GameState, Json, ModalItem, Person } from '../src/game/types'
import { acctOf, booksOf, driftSince, expectConserved, flowTotal } from './ledger-kit'
import { makeTestGame } from './helpers'
import { findSeed } from './seed-kit'

const rows = (g: GameState, reason: string): number => flowsOf(g).filter((r) => r.reason === reason).length

/** Nothing the scenario did went through the default reason, and the books balance. */
function clean(g: GameState): void {
  expect(rows(g, 'unreasoned')).toBe(0)
  expectConserved(g)
}

interface Family {
  g: GameState
  a: Person
  b: Person
  c: Person
}

/** A rich old player with three adult children, dead and ready for continueAsChild. */
function family(seed: number, money: number): Family {
  const g = makeTestGame(seed, { age: 78, money, countryId: 'us', residence: { status: 'renting', rent: 0 } })
  g.year = 2026
  g.log = [{ age: g.character.age, year: g.year, entries: [] }]
  const mk = (age: number, traits: string[]): Person => {
    const p = createPerson(g, { relation: 'child', age, relationship: 70, traits, money: 20_000, countryId: 'us' })
    p.yearsKnown = Math.min(age, 40)
    return p
  }
  const a = mk(50, ['kind', 'calm'])
  const b = mk(47, ['calm', 'loyal'])
  const c = mk(44, ['funny', 'outgoing'])
  return { g, a, b, c }
}

function die(g: GameState): void {
  killCharacter(g, 'Old Age')
  g.queue = g.queue.filter((m) => m.kind !== 'aiTask')
}

const person = (id: string): `person:${string}` => `person:${id}`

describe('R2-L8: the estate settles through the books', () => {
  it('1. a dead player with $1,000,000 and one child, no will: the heir gets the cash, the dead account is gone, the books balance', () => {
    const g = makeTestGame(7, { age: 78, money: 1_000_000, countryId: 'us' })
    g.year = 2026
    const child = createPerson(g, { relation: 'child', age: 45, relationship: 80, money: 20_000, countryId: 'us' })
    die(g)
    const dead = g.character.id
    const n = continueAsChild(g, child.id)
    expect(n.character.id).toBe(child.id)
    // The heir's cash is what it was before the books existed: their own money plus the share.
    expect(n.character.money).toBe(20_000 + 1_000_000)
    expect(acctOf(n, person(child.id))).toBe(1_000_000)
    expect(acctOf(n, person(dead))).toBe(0)
    // The dead player's account paid the heir and was folded into the households of the country; nothing else moved.
    expect(acctOf(n, 'pool:hh:us')).toBe(-1_000_000)
    expect(flowsOf(n).map((r) => r.reason).sort()).toEqual(['estate', 'inheritance'].filter((r) => rows(n, r) > 0).sort())
    clean(n)
  })

  it('1b. the estate tax, the lawyers and the charity are booked from the dead account to their own counterparties', () => {
    const f = family(7, 50_000_000)
    changeWill(f.g, (gg, w) => {
      gg.character.willBeneficiaries = [f.a.id, f.b.id, f.c.id]
      w.charity = 20
    })
    f.g.queue = []
    die(f.g)
    const dead = f.g.character.id
    const n = continueAsChild(f.g, f.a.id)
    // 50,000,000 less the 25 percent over 10,000,000 is 40,000,000; a fifth goes to charity and the rest in three.
    const tax = 10_000_000
    const charity = 8_000_000
    const share = Math.floor(32_000_000 / 3)
    expect(flowTotal(n, 'tax.estate', 'gov', 2026, 'us')).toBe(tax)
    expect(flowTotal(n, 'tax.estate', 'person', 2026, 'us')).toBe(-tax)
    expect(acctOf(n, 'gov:us')).toBe(tax)
    expect(flowTotal(n, 'donation', 'pool', 2026, 'us')).toBe(charity)
    expect(acctOf(n, 'pool:charity')).toBe(charity)
    for (const p of [f.a, f.b, f.c]) expect(acctOf(n, person(p.id))).toBe(share)
    expect(n.character.money).toBe(20_000 + share)
    expect(acctOf(n, person(dead))).toBe(0)
    // What was left in the dead account (the dollars the shares rounded away, the estate that was never booked in) went to the households.
    expect(acctOf(n, 'pool:hh:us')).toBe(-(tax + charity + 3 * share))
    clean(n)
  })

  it('2. a will with a charity slice books a donation row, and a sibling heir is paid by inheritance', () => {
    const f = family(8, 5_000_000)
    changeWill(f.g, (gg, w) => {
      gg.character.willBeneficiaries = [f.a.id, f.b.id]
      w.charity = 30
    })
    f.g.queue = []
    die(f.g)
    const n = continueAsChild(f.g, f.a.id)
    expect(flowTotal(n, 'donation', 'pool', 2026, 'us')).toBe(1_500_000)
    expect(acctOf(n, 'pool:charity')).toBe(1_500_000)
    // The sibling's cash is exactly the old rule's (20,000 of their own and a share), and the books say who paid it.
    expect(n.people.find((p) => p.id === f.b.id)!.money).toBe(20_000 + 1_750_000)
    expect(acctOf(n, person(f.b.id))).toBe(1_750_000)
    expect(acctOf(n, person(f.c.id))).toBe(0)
    expect(n.people.find((p) => p.id === f.c.id)!.money).toBe(20_000)
    clean(n)
  })

  it('3. continueAsChild called twice from the same state gives the same JSON (the books are part of the replay)', () => {
    const f = family(9, 12_000_000)
    changeWill(f.g, (gg, w) => {
      gg.character.willBeneficiaries = [f.a.id, f.b.id]
      w.charity = 10
    })
    f.g.queue = []
    die(f.g)
    const before = JSON.stringify(f.g)
    const first = continueAsChild(f.g, f.a.id)
    const second = continueAsChild(f.g, f.a.id)
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
    expect(JSON.stringify(f.g)).toBe(before)
    expect(rows(first, 'inheritance')).toBeGreaterThan(0)
  })

  it('3b. what a dead player still owed on loans is paid out of the estate, and what it could not pay is a declared write-off', () => {
    const rich = family(10, 1_000_000)
    rich.g.character.loans.push({ id: 'l1', kind: 'personal', lender: 'Bank', balance: 200_000, rate: 0.05, yearsLeft: 5, yearlyPayment: 40_000, countryId: 'us' })
    die(rich.g)
    const paid = continueAsChild(rich.g, rich.a.id)
    expect(flowTotal(paid, 'loan.repay', 'pool', 2026, 'us')).toBe(200_000)
    expect(flowTotal(paid, 'writeoff', 'burn', 2026, 'us')).toBe(0)
    // The heirs share what is left after the lender.
    expect(paid.character.money).toBe(20_000 + Math.floor(800_000 / 3))
    clean(paid)

    const poor = family(11, 50_000)
    poor.g.character.loans.push({ id: 'l2', kind: 'personal', lender: 'Bank', balance: 300_000, rate: 0.05, yearsLeft: 5, yearlyPayment: 60_000, countryId: 'us' })
    die(poor.g)
    const lost = continueAsChild(poor.g, poor.a.id)
    expect(flowTotal(lost, 'loan.repay', 'pool', 2026, 'us')).toBe(50_000)
    expect(Math.abs(flowTotal(lost, 'writeoff', 'burn', 2026, 'us'))).toBe(250_000)
    expect(lost.character.money).toBe(20_000)
    clean(lost)
  })

  it('4. a contested will: the held half and the claim sit in the family pool, and probate pays out of it a year or three later', () => {
    const seed = findSeed(
      (s) => {
        const f = family(s, 20_000_000)
        cutKnown(f.g, f.b, 90)
        f.g.queue = []
        die(f.g)
        const probe = structuredClone(f.g)
        const plan = planEstate(probe, { estate: probe.character.money, heirId: f.a.id, adult: true, hasProperty: false, cashAfterDebts: probe.character.money })
        return plan.held > 0 && plan.fees > 0
      },
      { label: 'a contested estate with a held share', tries: 300 },
    )
    const f = family(seed, 20_000_000)
    cutKnown(f.g, f.b, 90)
    f.g.queue = []
    die(f.g)
    const n = continueAsChild(f.g, f.a.id)
    const esc = n.flags['will.escrow'] as { amount: number; year: number }
    expect(esc.amount).toBeGreaterThan(0)
    expect(flowTotal(n, 'legal', 'pool', 2026, 'us')).toBeGreaterThan(0)
    // The heir's cash in the books is the cash share only; the held half is in the family pool.
    expect(acctOf(n, person(f.a.id))).toBe(n.character.money - 20_000)
    expect(acctOf(n, 'pool:family')).toBeGreaterThanOrEqual(esc.amount)
    const pool = acctOf(n, 'pool:family')
    clean(n)
    // Probate releases it: one inheritance booking out of the family pool into the heir.
    n.queue = []
    n.character.age = Math.max(n.character.age, 18)
    const before = booksOf(n)
    n.year = esc.year
    yearlyEstateTail(n)
    expect(n.character.money - before.cash).toBe(esc.amount)
    expect(driftSince(n, before)).toBe(0)
    expect(acctOf(n, 'pool:family')).toBe(pool - esc.amount)
    clean(n)
  })

  it('5. a sibling who feels guilty shares a part of the inheritance: one gift row from the sibling to the heir', () => {
    const seed = findSeed(
      (s) => {
        const f = family(s, 20_000_000)
        cutKnown(f.g, f.b, 80)
        f.g.queue = []
        die(f.g)
        return rows(continueAsChild(f.g, f.b.id), 'gift') > 0
      },
      { label: 'a guilty sibling shares the inheritance', tries: 300 },
    )
    const f = family(seed, 20_000_000)
    cutKnown(f.g, f.b, 80)
    f.g.queue = []
    die(f.g)
    const n = continueAsChild(f.g, f.b.id)
    // One gift row, and it moved the sibling's money into the heir's cash: the heir's account holds the gift, the cash holds it too.
    expect(rows(n, 'gift')).toBe(1)
    const gift = n.character.money - 20_000
    expect(gift).toBeGreaterThan(0)
    expect(acctOf(n, person(f.b.id))).toBe(gift)
    clean(n)
  })

  it('6. the heir who is asked for a share and gives it: one gift row between the heir and the sibling, drift 0', () => {
    const seed = findSeed(
      (s) => {
        const f = family(s, 20_000_000)
        cutKnown(f.g, f.b, 80)
        f.g.queue = []
        die(f.g)
        const n = continueAsChild(f.g, f.a.id)
        return n.queue.some((m) => m.kind === 'choice' && m.scriptId === 'will.estate.ask')
      },
      { label: 'a cut-out sibling asks the heir for a share', tries: 300 },
    )
    const f = family(seed, 20_000_000)
    cutKnown(f.g, f.b, 80)
    f.g.queue = []
    die(f.g)
    const n = continueAsChild(f.g, f.a.id)
    const bro = n.people.find((p) => p.id === f.b.id)!
    const before = booksOf(n)
    const bro0 = bro.money
    const i = n.queue.findIndex((m) => m.kind === 'choice' && m.scriptId === 'will.estate.ask')
    const m = n.queue.splice(i, 1)[0] as Extract<ModalItem, { kind: 'choice' }>
    runScript(n, m.scriptId!, 'half', m.data, m)
    const given = before.cash - n.character.money
    expect(given).toBeGreaterThan(0)
    expect(bro.money - bro0).toBe(given)
    expect(driftSince(n, before)).toBe(0)
    expect(rows(n, 'gift')).toBe(1)
    expect(acctOf(n, person(f.b.id))).toBeGreaterThanOrEqual(given)
    clean(n)
  })
})

function cutKnown(g: GameState, p: Person, anger: number): void {
  changeWill(g, (gg, w) => removeHeir(gg, w, p))
  g.queue = []
  updateWl(g, p, (w) => {
    w.known = true
    w.how = 'leak'
    w.told = 'out'
    w.anger = anger
  })
  expect(readWl(g, p).known).toBe(true)
}

describe('R2-L8: events and activities book under reasons', () => {
  it('a family event that moves money between the player and a relative books one gift row, both sides, drift 0', () => {
    const g = makeTestGame(7, { age: 40, money: 50_000 })
    const kid = createPerson(g, { relation: 'child', age: 25, relationship: 70, money: 1_000, countryId: 'us' })
    const before = booksOf(g)
    runScript(g, 'events.random', 'give', { eventId: 'family.adultChildMoney', personId: kid.id, amt: 5_000, why: 'cover the rent' } as Json, { kind: 'notice' } as unknown as ModalItem)
    expect(kid.money).toBe(6_000)
    expect(g.character.money).toBe(45_000)
    expect(driftSince(g, before)).toBe(0)
    expect(rows(g, 'gift')).toBe(1)
    expect(flowTotal(g, 'gift', 'person')).toBe(0)
    expect(acctOf(g, person(kid.id))).toBe(5_000)
    expect(acctOf(g, person(g.character.id))).toBe(-5_000)
    clean(g)
  })

  it('a person gets exactly what the event says even when the player cash carries cents (erosion leaves them)', () => {
    const g = makeTestGame(7, { age: 40, money: 50_000.456 })
    const kid = createPerson(g, { relation: 'child', age: 25, relationship: 70, money: 1_000, countryId: 'us' })
    runScript(g, 'events.random', 'give', { eventId: 'family.adultChildMoney', personId: kid.id, amt: 5_000, why: 'cover the rent' } as Json, { kind: 'notice' } as unknown as ModalItem)
    expect(kid.money).toBe(6_000)
    expect(g.character.money).toBe(45_000)
    expect(acctOf(g, person(kid.id))).toBe(5_000)
    clean(g)
  })

  it('the same event with nobody to take it leaves the loss to the event itself, booked as luck', () => {
    const g = makeTestGame(7, { age: 40, money: 50_000 })
    const before = booksOf(g)
    runScript(g, 'events.random', 'give', { eventId: 'family.adultChildMoney', amt: 5_000, why: 'cover the rent' } as Json, { kind: 'notice' } as unknown as ModalItem)
    expect(g.character.money).toBe(45_000)
    expect(driftSince(g, before)).toBe(0)
    expect(flowTotal(g, 'luck', 'person')).toBe(-5_000)
    clean(g)
  })

  it('a mystery inheritance is an inheritance from the family pool, a scratch-off is a gamble', () => {
    const g = makeTestGame(7, { age: 40, money: 1_000 })
    const before = booksOf(g)
    runScript(g, 'events.random', 'accept', { eventId: 'adult.inheritance', first: 'Ada', amt: 20_000 } as Json, { kind: 'notice' } as unknown as ModalItem)
    expect(g.character.money).toBe(21_000)
    expect(driftSince(g, before)).toBe(0)
    expect(flowTotal(g, 'inheritance', 'person')).toBe(20_000)
    expect(flowTotal(g, 'inheritance', 'pool')).toBe(-20_000)
    clean(g)
  })

  it('a licence fee is a fee to the government of the country', () => {
    const g = makeTestGame(7, { age: 30, money: 5_000 })
    const before = booksOf(g)
    boatingTestAction.run(g)
    const fee = before.cash - g.character.money
    expect(fee).toBeGreaterThan(0)
    expect(driftSince(g, before)).toBe(0)
    expect(flowTotal(g, 'fee.gov', 'gov')).toBe(fee)
    expect(acctOf(g, 'gov:us')).toBe(fee)
    clean(g)
  })

  it('payForAction books a purchase unless the caller names what it was for, and a donation is a donation', () => {
    const g = makeTestGame(7, { age: 30, money: 5_000 })
    const before = booksOf(g)
    expect(payForAction(g, 300)).toBe(true)
    expect(flowTotal(g, 'purchase', 'pool')).toBe(300)
    expect(payForAction(g, 200, 'donation')).toBe(true)
    expect(flowTotal(g, 'donation', 'pool')).toBe(200)
    expect(acctOf(g, 'pool:charity')).toBe(200)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })

  it('a parent who pays a minor lesson pays on the books too: the parent loses it, the school pool gains it, the child keeps their cash', () => {
    const g = makeTestGame(7, { age: 12, money: 100 })
    const parent = createPerson(g, { relation: 'parent', age: 42, relationship: 80, money: 90_000, countryId: 'us' })
    const before = booksOf(g)
    const paid = payFor(g, 60, true, 'tuition')
    expect(paid?.by).toBe('parent')
    expect(parent.money).toBe(89_940)
    expect(g.character.money).toBe(100)
    expect(driftSince(g, before)).toBe(0)
    expect(flowTotal(g, 'tuition', 'person')).toBe(-60)
    expect(acctOf(g, 'pool:edu')).toBe(60)
    expect(acctOf(g, person(parent.id))).toBe(-60)
    clean(g)
  })

  it('a gift of cash to a relative through payOff moves both purses with one gift row and keeps their money on a whole dollar', () => {
    const g = makeTestGame(7, { age: 50, money: 80_000 })
    const sis = createPerson(g, { relation: 'sibling', age: 48, relationship: 60, money: 0, countryId: 'us' })
    personCash(g, sis, 100.4, 'wage')
    const before = booksOf(g)
    const text = payOff(g, sis, 10_000)
    expect(text).not.toBeNull()
    expect(g.character.money).toBe(70_000)
    expect(sis.money).toBe(10_100)
    expect(driftSince(g, before)).toBe(0)
    expect(rows(g, 'gift')).toBe(1)
    clean(g)
  })

  it('a request for cash that goes to the asker is a gift between the two; one that pays a bill or buys a thing is a purchase', () => {
    const g = makeTestGame(7, { age: 45, money: 200_000 })
    const pal = createPerson(g, { relation: 'friend', age: 44, relationship: 70, money: 100, countryId: 'us' })
    const base = { pid: pal.id, title: 'A Favor', emoji: '\u{1F91D}', text: '' }
    const before = booksOf(g)
    giveFor(g, { ...base, k: 'friend.loan', amt: 6_000, what: 'back rent' }, 6_000, 'full')
    expect(pal.money).toBe(6_100)
    expect(g.character.money).toBe(194_000)
    expect(rows(g, 'gift')).toBe(1)
    expect(acctOf(g, person(pal.id))).toBe(6_000)
    expect(driftSince(g, before)).toBe(0)
    giveFor(g, { ...base, k: 'friend.dinner', amt: 300, what: 'a dinner' }, 300, 'full')
    expect(pal.money).toBe(6_100)
    expect(g.character.money).toBe(193_700)
    expect(flowTotal(g, 'purchase', 'pool')).toBe(300)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })

  it('a yearly allowance is a support row between the player and the person, and drift is 0', () => {
    const g = makeTestGame(7, { age: 45, money: 200_000 })
    const kid = createPerson(g, { relation: 'child', age: 20, relationship: 70, money: 500, countryId: 'us' })
    updateTies(g, kid, (t) => {
      t.allowance = 2_000
    })
    const before = booksOf(g)
    yearlyWealth(g)
    expect(kid.money).toBe(2_500)
    expect(g.character.money).toBe(198_000)
    expect(driftSince(g, before)).toBe(0)
    expect(flowTotal(g, 'support', 'person')).toBe(0)
    expect(acctOf(g, person(kid.id))).toBe(2_000)
    clean(g)
  })

  it('an event money effect with no named party is luck, with the same refusal to go below zero as before', () => {
    const g = makeTestGame(7, { age: 30, money: 300 })
    const before = booksOf(g)
    applyFx(g, null, { money: 700 })
    applyFx(g, null, { money: -5_000 })
    expect(g.character.money).toBe(0)
    expect(driftSince(g, before)).toBe(0)
    expect(flowTotal(g, 'luck', 'person')).toBe(-300)
    clean(g)
  })

  it('a war factory wage is a wage and a mid-life splurge is leisure', () => {
    const g = makeTestGame(7, { age: 45, money: 50_000 })
    const before = booksOf(g)
    runScript(g, 'history.warWork', 'factory', undefined, { kind: 'notice' } as unknown as ModalItem)
    expect(g.character.money).toBeGreaterThan(50_000)
    expect(flowTotal(g, 'wage', 'person')).toBe(g.character.money - 50_000)
    runScript(g, 'life.midlife', 'splurge', undefined, { kind: 'notice' } as unknown as ModalItem)
    expect(flowTotal(g, 'leisure', 'person')).toBeLessThan(0)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })

  it('the books keep an account of what the heir kept: the heir account is the player account after the switch', () => {
    const f = family(12, 3_000_000)
    die(f.g)
    const n = continueAsChild(f.g, f.a.id)
    expect(acctBalance(n, `person:${n.character.id}`)).toBe(1_000_000)
    expect(n.character.money - 20_000).toBe(acctBalance(n, `person:${n.character.id}`))
    clean(n)
  })
})
