// ci: fast
// R2-L3 (A.K1 b): the three money primitives (addMoney, spend, earnIncome) and the cash helpers (src/game/cash.ts) book every
// dollar once, with a named default counterparty, a declared inflation burn, and the lending mint. The wrappers keep today's
// validation and rounding exactly: only the books are new.
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import {
  erodeCash,
  erodeFirm,
  firmCash,
  firmPurse,
  lend,
  moveCash,
  payPerson,
  personCash,
  personPurse,
  playerPurse,
  poolPurse,
  writeoff,
} from '../src/game/cash'
import { addMoney, earnIncome, spend } from '../src/game/core'
import { addLoan } from '../src/game/finance'
import { acctBalance, checkLedger, flowsOf, peekLedger, playerAcct, tokenSeen, type Why } from '../src/game/kernel/ledger'
import { MINTS, type Reason } from '../src/game/kernel/reasons'
import { createNewLife } from '../src/game/life'
import { careerCtx } from '../src/game/special/kit/year'
import type { CareerBase } from '../src/game/special/kit/state'
import type { GameState, Person } from '../src/game/types'
import '../src/game/world/shards'
import { makeTestGame } from './helpers'
import { findSeed } from './seed-kit'
import { acctOf, booksOf, driftSince, expectConserved, flowTotal } from './ledger-kit'

/** A small seeded generator for the tests (never g.rng). */
function prng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const withMoney = (money: number, character: Partial<GameState['character']> = {}): GameState => makeTestGame(1, { money, ...character })

function person(id: string, money: number, data: Person['data'] = {}): Person {
  return {
    id,
    firstName: 'Pat',
    lastName: 'Doe',
    gender: 'female',
    age: 40,
    alive: true,
    relation: 'friend',
    relationship: 50,
    stats: { happiness: 50, health: 50, smarts: 50, looks: 50 },
    money,
    occupation: 'Clerk',
    traits: [],
    yearsKnown: 3,
    livesWithPlayer: false,
    notes: [],
    data,
  }
}

/** The body of each primitive at v4.1.1 (a65349a), copied here as the reference the wrappers must match. */
function refAddMoney(g: GameState, delta: number): void {
  const next = g.character.money + delta
  if (!Number.isFinite(g.character.money) || !Number.isFinite(delta) || !Number.isFinite(next)) return
  g.character.money = Math.round(next)
}
function refSpend(g: GameState, amount: number): boolean {
  if (!Number.isFinite(g.character.money) || !Number.isFinite(amount)) return false
  if (amount <= 0) return true
  if (g.character.money < amount) return false
  g.character.money = Math.round(g.character.money - amount)
  return true
}
function refEarnIncome(g: GameState, amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) return
  const prev = typeof g.flags.taxableIncome === 'number' && Number.isFinite(g.flags.taxableIncome) ? g.flags.taxableIncome : 0
  const money = g.character.money + amount
  const taxable = prev + amount
  if (!Number.isFinite(g.character.money) || !Number.isFinite(money) || !Number.isFinite(taxable)) return
  g.character.money = Math.round(money)
  g.flags.taxableIncome = Math.round(taxable)
}

describe('the wrappers keep today\'s behavior', () => {
  const STARTS = [0, 1, 100, 1234, 100.4, 100.5, -50, -50.7, 0.3, 1e12, 9e15, Number.NaN, Number.POSITIVE_INFINITY]
  const AMOUNTS = [0, 1, -1, 99.5, -99.5, 0.4, -0.4, 1e9, -1e9, 2.6e15, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1e308]

  it('leaves money, taxable income and the returned boolean the same as the v4.1.1 bodies over a table of inputs', () => {
    let rows = 0
    for (const start of STARTS) {
      for (const amount of AMOUNTS) {
        for (const prior of [undefined, 500, Number.NaN] as const) {
          const mk = (): GameState => {
            const g = withMoney(start)
            if (prior !== undefined) g.flags.taxableIncome = prior
            return g
          }
          const tag = `start ${start}, amount ${amount}, prior taxable ${String(prior)}`

          const a1 = mk()
          const a2 = mk()
          addMoney(a1, amount)
          refAddMoney(a2, amount)
          expect(Object.is(a1.character.money, a2.character.money), `addMoney: ${tag}`).toBe(true)

          const s1 = mk()
          const s2 = mk()
          const ok1 = spend(s1, amount)
          const ok2 = refSpend(s2, amount)
          expect(ok1, `spend result: ${tag}`).toBe(ok2)
          expect(Object.is(s1.character.money, s2.character.money), `spend: ${tag}`).toBe(true)

          const e1 = mk()
          const e2 = mk()
          earnIncome(e1, amount)
          refEarnIncome(e2, amount)
          expect(Object.is(e1.character.money, e2.character.money), `earnIncome money: ${tag}`).toBe(true)
          expect(Object.is(e1.flags.taxableIncome, e2.flags.taxableIncome), `earnIncome taxable: ${tag}`).toBe(true)
          rows += 3
        }
      }
    }
    expect(rows).toBeGreaterThan(30)
  })

  it('returns the change applied: the delta when it took, 0 when it refused', () => {
    const g = withMoney(1000)
    expect(addMoney(g, 250)).toBe(250)
    expect(addMoney(g, -100)).toBe(-100)
    expect(addMoney(g, Number.NaN)).toBe(0)
    expect(addMoney(g, 0.4)).toBe(0)
    expect(Object.is(addMoney(withMoney(0), -0.4), 0), 'a rounded-away change is a plain 0, never -0').toBe(true)
    expect(g.character.money).toBe(1150)
    expect(earnIncome(g, 100)).toBe(100)
    expect(earnIncome(g, -5)).toBe(0)
    expect(earnIncome(g, Number.NaN)).toBe(0)
    expect(g.flags.taxableIncome).toBe(100)
    expect(spend(g, 0)).toBe(true)
    expect(spend(g, 1e9)).toBe(false)
    expect(g.character.money).toBe(1250)
  })

  it('books nothing for a call that moved no money', () => {
    const g = withMoney(1000)
    addMoney(g, 0, 'wage')
    addMoney(g, Number.NaN, 'wage')
    spend(g, 0, 'purchase')
    spend(g, 5000, 'purchase')
    earnIncome(g, 0, 'wage')
    expect(peekLedger(g).k).toBe(0)
    expect(g.world).toBeUndefined()
  })
})

describe('every dollar is booked once', () => {
  const REASONS_USED: Reason[] = ['wage', 'tax.income', 'rent', 'purchase', 'gift', 'health', 'tuition', 'dividend', 'fine', 'royalty']

  it('keeps the cash and the player\'s account together over 500 random calls', () => {
    const rand = prng(20261022)
    const g = withMoney(250_000)
    for (let i = 0; i < 500; i++) {
      const before = booksOf(g)
      const reason = REASONS_USED[Math.floor(rand() * REASONS_USED.length)]!
      const amount = rand() < 0.3 ? Math.round(rand() * 20000 * 10) / 10 : Math.floor(rand() * 20000)
      const kind = Math.floor(rand() * 4)
      if (kind === 0) addMoney(g, amount, reason)
      else if (kind === 1) addMoney(g, -amount, reason)
      else if (kind === 2) spend(g, amount, reason)
      else earnIncome(g, amount, reason)
      expect(driftSince(g, before), `call ${i}: ${reason} ${amount} (kind ${kind})`).toBe(0)
      expect(checkLedger(g).ok, `call ${i}`).toBe(true)
    }
    expect(peekLedger(g).k).toBeGreaterThan(300)
    expectConserved(g)
  })

  it('books a call with no reason as unreasoned against pool:other', () => {
    const g = withMoney(0)
    addMoney(g, 50)
    spend(g, 20)
    expect(flowTotal(g, 'unreasoned', 'person')).toBe(30)
    expect(acctOf(g, 'pool:other')).toBe(-30)
    expect(acctOf(g, playerAcct(g))).toBe(30)
  })

  it('books under the player\'s id, so an heir\'s account is the child\'s', () => {
    const g = withMoney(0, { id: 'kid7' })
    earnIncome(g, 400, 'wage')
    expect(acctOf(g, 'person:kid7')).toBe(400)
    expect(playerAcct(g)).toBe('person:kid7')
  })
})

describe('counterparties', () => {
  it('sends a tax to the government, rent to landlords and rent received from households', () => {
    const g = withMoney(5000)
    addMoney(g, -500, 'tax.income')
    expect(flowTotal(g, 'tax.income', 'gov')).toBe(500)
    expect(flowTotal(g, 'tax.income', 'person')).toBe(-500)
    expect(acctOf(g, 'gov:us')).toBe(500)

    addMoney(g, -300, 'rent')
    expect(acctOf(g, 'pool:landlords')).toBe(300)
    addMoney(g, 200, 'rent')
    expect(acctOf(g, 'pool:hh:us')).toBe(-200)
    expect(flowTotal(g, 'rent', 'person')).toBe(-100)
  })

  it('names the counterparty when the call does: a bond paid by the French government', () => {
    const g = withMoney(0)
    addMoney(g, 900, { reason: 'bond.redeem', with: 'gov:fr' })
    expect(acctOf(g, 'gov:fr')).toBe(-900)
    expect(acctOf(g, 'gov:us')).toBe(0)
    expect(flowTotal(g, 'bond.redeem', 'gov')).toBe(-900)
  })

  it('switches households and government with a country', () => {
    const g = withMoney(0)
    earnIncome(g, 100, { reason: 'wage', country: 'fr' })
    addMoney(g, -40, { reason: 'tax.income', country: 'fr' })
    addMoney(g, 60, { reason: 'rent', country: 'fr' })
    expect(acctOf(g, 'gov:fr')).toBe(40)
    expect(acctOf(g, 'gov:us')).toBe(0)
    expect(acctOf(g, 'pool:hh:fr')).toBe(-60)
    expect(flowTotal(g, 'tax.income', 'gov', g.year, 'fr')).toBe(40)
    expect(flowTotal(g, 'tax.income', 'gov', g.year, 'us')).toBe(0)
  })

  it('books an income as a payment from employers', () => {
    const g = withMoney(0)
    earnIncome(g, 1200, 'wage')
    expect(acctOf(g, 'pool:employers')).toBe(-1200)
    expect(g.flags.taxableIncome).toBe(1200)
  })
})

describe('a mint clips what a wrapper adds', () => {
  it('raises the cash by the room the lending mint has, logs a cap row, and gives the room back next year', () => {
    const g = withMoney(0)
    const before = booksOf(g)
    expect(addMoney(g, 2e12, 'loan.principal')).toBe(1e12)
    expect(g.character.money).toBe(1e12)
    const cap = peekLedger(g).l.find((r) => r[1] === 'cap' && r[2] === 'lending')
    expect(cap?.[3]).toBe(1e12)
    expect(peekLedger(g).m.lending).toBe(1e12)
    expect(addMoney(g, 1e9, 'loan.principal')).toBe(0)
    expect(g.character.money).toBe(1e12)
    expect(driftSince(g, before)).toBe(0)

    g.year += 1
    expect(addMoney(g, 1000, 'loan.principal')).toBe(1000)
    expect(g.character.money).toBe(1e12 + 1000)
    expectConserved(g)
  })

  it('clips earnIncome the same way and takes only what was received into taxable income', () => {
    const g = withMoney(0)
    const before = booksOf(g)
    expect(earnIncome(g, 4e12, { reason: 'loan.principal' })).toBe(1e12)
    expect(g.flags.taxableIncome).toBe(1e12)
    expect(driftSince(g, before)).toBe(0)
  })

  it('does not clip a payment: paying a lender is never limited by a mint', () => {
    const g = withMoney(9e9)
    const before = booksOf(g)
    addMoney(g, -4e9, 'loan.principal')
    expect(g.character.money).toBe(5e9)
    expect(acctOf(g, 'pool:banks')).toBe(4e9)
    expect(driftSince(g, before)).toBe(0)
  })
})

describe('tokens', () => {
  it('earnIncome with a token changes the cash and the taxable income once', () => {
    const g = withMoney(0)
    expect(earnIncome(g, 100, { reason: 'wage', token: 'pay:2026' })).toBe(100)
    expect(tokenSeen(g, 'pay:2026')).toBe(true)
    expect(earnIncome(g, 100, { reason: 'wage', token: 'pay:2026' })).toBe(0)
    expect(g.character.money).toBe(100)
    expect(g.flags.taxableIncome).toBe(100)
    expect(acctOf(g, playerAcct(g))).toBe(100)
  })

  it('addMoney and spend skip a replayed token, and spend says it paid nothing', () => {
    const g = withMoney(1000)
    const before = booksOf(g)
    expect(addMoney(g, 50, { reason: 'gift', token: 'a:2026' })).toBe(50)
    expect(addMoney(g, 50, { reason: 'gift', token: 'a:2026' })).toBe(0)
    expect(spend(g, 30, { reason: 'purchase', token: 'b:2026' })).toBe(true)
    expect(spend(g, 30, { reason: 'purchase', token: 'b:2026' })).toBe(false)
    expect(g.character.money).toBe(1020)
    expect(driftSince(g, before)).toBe(0)
  })

  it('frees the token the next year', () => {
    const g = withMoney(0)
    earnIncome(g, 100, { reason: 'wage', token: 'pay:y' })
    g.year += 1
    expect(tokenSeen(g, 'pay:y')).toBe(false)
    expect(earnIncome(g, 100, { reason: 'wage', token: 'pay:y' })).toBe(100)
    expect(g.character.money).toBe(200)
  })
})

describe('erosion at an exact half dollar (found by the strict drift run: seeds 119 and 133)', () => {
  // The cash keeps the engine's own arithmetic after an erosion, so at a rate of 0.2 a whole-dollar cash lands on a half dollar when
  // it is 3 more than a multiple of 6. The books carry the cash rounded to whole dollars, so the next booking must close the gap
  // exactly, whichever way the half dollar was rounded. It used to leave the books one dollar off the cash.
  it('13,047 at 20% leaves 10,872.5, and the next payment keeps the cash and the books together', () => {
    const g = withMoney(13_047)
    const before = booksOf(g)
    erodeCash(g, 0.2)
    expect(g.character.money).toBe(10_872.5)
    addMoney(g, -1_321, 'living')
    expect(g.character.money).toBe(9_552)
    expect(driftSince(g, before)).toBe(0)
    expectConserved(g)
  })

  it('a receipt, a spend and an income after the same half dollar book to the cent as well', () => {
    for (const act of [(g: GameState) => addMoney(g, 100, 'wage'), (g: GameState) => spend(g, 100, 'purchase'), (g: GameState) => earnIncome(g, 100, 'wage'), (g: GameState) => addMoney(g, 0.4, 'luck')]) {
      const g = withMoney(13_047)
      const before = booksOf(g)
      erodeCash(g, 0.2)
      expect(g.character.money).toBe(10_872.5)
      act(g)
      expect(Number.isInteger(g.character.money)).toBe(true)
      expect(driftSince(g, before)).toBe(0)
    }
  })

  it('two erosions in a row, then a booking: still exact', () => {
    const g = withMoney(13_047)
    const before = booksOf(g)
    erodeCash(g, 0.2)
    erodeCash(g, 0.2)
    erodeCash(g, -0.2)
    expect(Math.abs(driftSince(g, before))).toBeLessThanOrEqual(0.5)
    addMoney(g, -7, 'living')
    expect(driftSince(g, before)).toBe(0)
  })

  it('a move out of the player after the half dollar books the same cash', () => {
    const g = withMoney(13_047)
    const before = booksOf(g)
    erodeCash(g, 0.2)
    moveCash(g, playerPurse(g), poolPurse('retail'), 1_321, 'purchase')
    expect(driftSince(g, before)).toBe(0)
  })

  it('holds for every whole-dollar cash from -400 to 400 at +20% and -20%, after each kind of booking', () => {
    const acts: ((g: GameState) => unknown)[] = [
      (g) => addMoney(g, -37, 'living'),
      (g) => addMoney(g, 38, 'wage'),
      (g) => earnIncome(g, 99, 'wage'),
      (g) => spend(g, 1, 'purchase'),
      (g) => moveCash(g, playerPurse(g), poolPurse('retail'), 5, 'purchase'),
    ]
    const off: string[] = []
    for (let money = -400; money <= 400; money++) {
      for (const rate of [0.2, -0.2]) {
        for (let i = 0; i < acts.length; i++) {
          const g = withMoney(money)
          const before = booksOf(g)
          erodeCash(g, rate)
          if (Math.abs(driftSince(g, before)) > 0.5) off.push(`${money} at ${rate} after erosion`)
          // A spend the player cannot afford is refused and changes nothing, so it closes nothing.
          if (i === 3 && g.character.money < 1) continue
          acts[i]!(g)
          if (g.character.money !== Math.round(g.character.money) || driftSince(g, before) !== 0) off.push(`${money} at ${rate}, booking ${i}: drift ${driftSince(g, before)}`)
        }
      }
    }
    expect(off.slice(0, 10)).toEqual([])
  })
})

describe('erosion', () => {
  it('burns the inflation of cash: 1,000,000 at 10% leaves 909,090.91 and burns 90,909 whole dollars', () => {
    const g = withMoney(1_000_000)
    expect(erodeCash(g, 0.1)).toBeCloseTo(-90_909.09, 2)
    expect(g.character.money).toBeCloseTo(909_090.909, 2)
    expect(peekLedger(g).b.inflation).toBe(90_909)
    expect(flowTotal(g, 'inflation', 'burn')).toBe(90_909)
    expect(acctOf(g, playerAcct(g))).toBe(-90_909)
    expectConserved(g)
  })

  it('keeps the engine\'s own arithmetic: the cash is the old `money / (1 + inflation)`, not rounded', () => {
    for (const [money, rate] of [[2000, 0.0371], [15.38, 0.12], [1.43, 0.034], [123_456.78, -0.04], [-5000.25, 0.07], [0.3, 0.5]] as const) {
      const g = withMoney(money)
      erodeCash(g, rate)
      expect(Object.is(g.character.money, money / (1 + rate)), `${money} at ${rate}`).toBe(true)
    }
  })

  it('closes the gap of under half a dollar at the next whole-dollar booking', () => {
    const g = withMoney(1_000_000)
    const before = booksOf(g)
    erodeCash(g, 0.1)
    expect(Math.abs(driftSince(g, before))).toBeLessThan(0.5)
    addMoney(g, 100, 'wage')
    expect(Number.isInteger(g.character.money)).toBe(true)
    expect(driftSince(g, before)).toBe(0)
    for (let year = 0; year < 30; year++) {
      erodeCash(g, 0.037)
      expect(Math.abs(driftSince(g, before)), `year ${year}`).toBeLessThan(0.5)
      spend(g, 10, 'purchase')
      expect(driftSince(g, before), `year ${year} after a booking`).toBe(0)
    }
    expectConserved(g)
  })

  it('mints a revaluation when prices fall: -50% doubles the cash', () => {
    const g = withMoney(1000)
    expect(erodeCash(g, -0.5)).toBe(1000)
    expect(g.character.money).toBe(2000)
    expect(peekLedger(g).m.revaluation).toBe(1000)
    expect(flowTotal(g, 'inflation', 'mint')).toBe(-1000)
    expectConserved(g)
  })

  it('shrinks a debt: -1,000 at 10% becomes -909.09 and mints 91 whole dollars', () => {
    const g = withMoney(-1000)
    expect(erodeCash(g, 0.1)).toBeCloseTo(90.91, 2)
    expect(g.character.money).toBeCloseTo(-909.09, 2)
    expect(peekLedger(g).m.revaluation).toBe(91)
    expect(acctOf(g, playerAcct(g))).toBe(91)
    expectConserved(g)
  })

  it('books the whole dollars of a fractional start and leaves the cash exact', () => {
    const g = withMoney(1000.5)
    erodeCash(g, 0.1)
    expect(g.character.money).toBeCloseTo(909.5454, 3)
    expect(acctOf(g, playerAcct(g))).toBe(-91)
  })

  it('does nothing for a bad rate', () => {
    for (const bad of [Number.NaN, -1, -2, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const g = withMoney(1000)
      expect(erodeCash(g, bad)).toBe(0)
      expect(g.character.money).toBe(1000)
      expect(peekLedger(g).k).toBe(0)
    }
    const broke = withMoney(Number.NaN)
    expect(erodeCash(broke, 0.1)).toBe(0)
    expect(erodeCash(withMoney(0), 0.1)).toBe(0)
  })

  it('clips the burn at its yearly cap and keeps only what the ledger booked', () => {
    const g = withMoney(5e12)
    const burned = -erodeCash(g, 1)
    expect(burned).toBe(1e12)
    expect(g.character.money).toBe(4e12)
    expect(peekLedger(g).b.inflation).toBe(1e12)
    expect(peekLedger(g).l.some((r) => r[1] === 'cap' && r[2] === 'inflation')).toBe(true)
    expectConserved(g)
  })

  it('is what ageUp does to cash: three years keep the books and book an inflation row', () => {
    const seed = findSeed((s) => createNewLife({ seed: s, year: 2000 }).character.alive, { label: 'a living newborn of 2000' })
    const g = createNewLife({ seed, year: 2000 })
    g.character.money = 1_000_000
    for (let i = 0; i < 3; i++) {
      ageUp(g)
      expect(checkLedger(g).ok, `after year ${i + 1}: ${checkLedger(g).problems.join('; ')}`).toBe(true)
      if (!g.character.alive) break
    }
    const burned = flowsOf(g).filter((r) => r.reason === 'inflation').reduce((s, r) => s + r.net.burn, 0)
    expect(burned).toBeGreaterThan(0)
    expect(peekLedger(g).b.inflation ?? 0).toBeGreaterThan(0)
  })

  it('erodes a company\'s cash without rounding it, under the firm\'s account', () => {
    const g = withMoney(0)
    const b = { cash: 10_000 }
    expect(erodeFirm(g, b, 250.5, 'a7')).toBe(-250.5)
    expect(b.cash).toBe(9749.5)
    expect(acctOf(g, 'firm:a7')).toBe(-251)
    expect(peekLedger(g).b.inflation).toBe(251)
    expectConserved(g)
  })

  it('revalues a company\'s cash when the amount is negative', () => {
    const g = withMoney(0)
    const b = { cash: 10_000 }
    expect(erodeFirm(g, b, -400, { id: 'a8' })).toBe(400)
    expect(b.cash).toBe(10_400)
    expect(acctOf(g, 'firm:a8')).toBe(400)
    expect(peekLedger(g).m.revaluation).toBe(400)
    expectConserved(g)
  })

  it('moves a firm with no id through pool:firms and ignores a bad amount', () => {
    const g = withMoney(0)
    const b = { cash: 100 }
    erodeFirm(g, b, 20)
    expect(acctOf(g, 'pool:firms')).toBe(-20)
    expect(erodeFirm(g, b, Number.NaN)).toBe(0)
    expect(erodeFirm(g, b, 0)).toBe(0)
    expect(b.cash).toBe(80)
  })
})

describe('the cash helpers', () => {
  it('personCash with a floor of 0 never goes below 0 and books what it applied', () => {
    const g = withMoney(0)
    const p = person('p1', 100)
    expect(personCash(g, p, -500, 'purchase', 0)).toBe(-100)
    expect(p.money).toBe(0)
    expect(acctOf(g, 'person:p1')).toBe(-100)
    expect(acctOf(g, 'pool:retail')).toBe(100)
    expect(personCash(g, p, -50, 'purchase', 0)).toBe(0)
    expect(acctOf(g, 'person:p1')).toBe(-100)
    expectConserved(g)
  })

  it('personCash applies a fractional delta as it came and books the rounded dollars', () => {
    const g = withMoney(0)
    const p = person('p2', 10)
    expect(personCash(g, p, 250.7, 'wage')).toBe(250.7)
    expect(p.money).toBeCloseTo(260.7, 9)
    expect(acctOf(g, 'person:p2')).toBe(251)
    expect(acctOf(g, 'pool:employers')).toBe(-251)
  })

  it('personCash uses the stranger\'s sid when it has one and ignores a sid that is not text', () => {
    const g = withMoney(0)
    const a = person('p3', 0, { sid: 's9' })
    const b = person('p4', 0, { sid: 77 })
    personCash(g, a, 10, 'gift')
    personCash(g, b, 10, 'gift')
    expect(acctOf(g, 'person:s9')).toBe(10)
    expect(acctOf(g, 'person:p4')).toBe(10)
    expect(personPurse(a).acct).toBe('person:s9')
    expect(personPurse(b).acct).toBe('person:p4')
  })

  it('personCash refuses a bad delta and a bad wealth', () => {
    const g = withMoney(0)
    const p = person('p5', 100)
    expect(personCash(g, p, Number.NaN, 'gift')).toBe(0)
    expect(personCash(g, p, Number.POSITIVE_INFINITY, 'gift')).toBe(0)
    expect(p.money).toBe(100)
    const broken = person('p6', Number.NaN)
    expect(personCash(g, broken, 5, 'gift')).toBe(0)
    expect(peekLedger(g).k).toBe(0)
  })

  it('personCash skips a replayed token', () => {
    const g = withMoney(0)
    const p = person('p7', 0)
    personCash(g, p, 100, { reason: 'gift', token: 'g:2026' })
    expect(personCash(g, p, 100, { reason: 'gift', token: 'g:2026' })).toBe(0)
    expect(p.money).toBe(100)
  })

  it('moveCash applies both sides and books once', () => {
    const g = withMoney(5000)
    const p = person('p8', 0)
    expect(moveCash(g, playerPurse(g), personPurse(p), 1000, 'gift')).toBe(1000)
    expect(g.character.money).toBe(4000)
    expect(p.money).toBe(1000)
    expect(acctOf(g, playerAcct(g))).toBe(-1000)
    expect(acctOf(g, 'person:p8')).toBe(1000)
    expect(peekLedger(g).k).toBe(1)
    expect(acctOf(g, 'pool:family')).toBe(0)
    expectConserved(g)
  })

  it('moveCash books only what a payer with a floor really had', () => {
    const g = withMoney(0)
    const p = person('p9', 300)
    expect(moveCash(g, personPurse(p, 0), playerPurse(g), 500, 'support')).toBe(300)
    expect(p.money).toBe(0)
    expect(g.character.money).toBe(300)
    expect(acctOf(g, 'person:p9')).toBe(-300)
    expect(acctOf(g, playerAcct(g))).toBe(300)
    expect(moveCash(g, personPurse(p, 0), playerPurse(g), 500, 'support')).toBe(0)
    expect(g.character.money).toBe(300)
  })

  it('moveCash between a firm and its owner (draw and inject) and between two firms', () => {
    const g = withMoney(0)
    const a = { cash: 5000 }
    const b = { cash: 0 }
    expect(moveCash(g, firmPurse(a, 'f1'), firmPurse(b, { id: 'f2' }), 1200, 'draw')).toBe(1200)
    expect(a.cash).toBe(3800)
    expect(b.cash).toBe(1200)
    expect(acctOf(g, 'firm:f1')).toBe(-1200)
    expect(acctOf(g, 'firm:f2')).toBe(1200)
    expect(moveCash(g, firmPurse(b, 'f2'), playerPurse(g), 700, 'draw')).toBe(700)
    expect(g.character.money).toBe(700)
    expectConserved(g)
  })

  it('moveCash refuses a bad amount and a replayed token', () => {
    const g = withMoney(1000)
    const p = person('p10', 0)
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) expect(moveCash(g, playerPurse(g), personPurse(p), bad, 'gift')).toBe(0)
    expect(g.character.money).toBe(1000)
    expect(moveCash(g, playerPurse(g), personPurse(p), 100, 'gift', 'm:2026')).toBe(100)
    expect(moveCash(g, playerPurse(g), personPurse(p), 100, 'gift', 'm:2026')).toBe(0)
    expect(g.character.money).toBe(900)
    expect(p.money).toBe(100)
  })

  it('payPerson returns false and books nothing when short, and pays when it can', () => {
    const g = withMoney(100)
    const p = person('p11', 0)
    expect(payPerson(g, p, 500, 'gift')).toBe(false)
    expect(g.character.money).toBe(100)
    expect(p.money).toBe(0)
    expect(peekLedger(g).k).toBe(0)
    expect(payPerson(g, p, 60, 'gift')).toBe(true)
    expect(g.character.money).toBe(40)
    expect(p.money).toBe(60)
    expect(acctOf(g, 'person:p11')).toBe(60)
    expect(payPerson(g, p, Number.NaN, 'gift')).toBe(false)
    expect(payPerson(g, p, -5, 'gift')).toBe(false)
  })

  it('firmCash without an id uses pool:firms, with an id the firm\'s own account', () => {
    const g = withMoney(0)
    const b = { cash: 0 }
    expect(firmCash(g, b, 500, 'sales')).toBe(500)
    expect(b.cash).toBe(500)
    expect(acctOf(g, 'pool:firms')).toBe(500)
    expect(acctOf(g, 'pool:hh:us')).toBe(-500)
    expect(firmCash(g, b, -120.5, 'inputs', 'a9')).toBe(-120.5)
    expect(b.cash).toBe(379.5)
    expect(acctOf(g, 'firm:a9')).toBe(-121)
    expect(acctOf(g, 'pool:retail')).toBe(121)
    expect(firmCash(g, { cash: 0 }, 50, 'sales', { id: 'a10' })).toBe(50)
    expect(acctOf(g, 'firm:a10')).toBe(50)
    expectConserved(g)
  })

  it('firmCash refuses a bad delta and falls back to pool:firms for an id that is not an account name', () => {
    const g = withMoney(0)
    const b = { cash: 10 }
    expect(firmCash(g, b, Number.NaN, 'sales')).toBe(0)
    expect(b.cash).toBe(10)
    expect(firmPurse(b, 'has space').acct).toBe('pool:firms')
    expect(firmPurse(b, '').acct).toBe('pool:firms')
    expect(firmPurse(b, 'ok.id-1').acct).toBe('firm:ok.id-1')
  })

  it('lend creates the lending mint and clips like one', () => {
    const g = withMoney(0)
    expect(lend(g, 10_000)).toBe(10_000)
    expect(acctOf(g, 'pool:sellers')).toBe(10_000)
    expect(peekLedger(g).m.lending).toBe(10_000)
    expect(lend(g, 3e12, 'bank:b1')).toBe(1e12 - 10_000)
    expect(acctOf(g, 'bank:b1')).toBe(1e12 - 10_000)
    expect(lend(g, 100)).toBe(0)
    expect(lend(g, Number.NaN)).toBe(0)
    expect(lend(g, 0)).toBe(0)
    g.year += 1
    expect(lend(g, 100, undefined, 'loan:x:2027')).toBe(100)
    expect(lend(g, 100, undefined, 'loan:x:2027')).toBe(0)
    expectConserved(g)
  })

  it('writeoff burns from pool:banks by default and from a named account when given', () => {
    const g = withMoney(0)
    expect(writeoff(g, 700)).toBe(700)
    expect(acctOf(g, 'pool:banks')).toBe(-700)
    expect(peekLedger(g).b.writeoff).toBe(700)
    expect(writeoff(g, 50, 'bank:b2')).toBe(50)
    expect(acctOf(g, 'bank:b2')).toBe(-50)
    expect(writeoff(g, 0)).toBe(0)
    expect(writeoff(g, Number.NaN)).toBe(0)
    expectConserved(g)
  })

  it('a pool purse names an account and changes nothing', () => {
    const g = withMoney(0)
    const retail = poolPurse('retail')
    expect(retail.acct).toBe('pool:retail')
    expect(retail.add(5)).toBe(5)
    expect(poolPurse('hh', 'fr').acct).toBe('pool:hh:fr')
    expect(peekLedger(g).k).toBe(0)
    expect(moveCash(g, retail, playerPurse(g), 40, 'purchase')).toBe(40)
    expect(g.character.money).toBe(40)
    expect(acctOf(g, 'pool:retail')).toBe(-40)
    expectConserved(g)
  })

  it('the player purse applies a change with the primitives\' checks and rounding, and books nothing itself', () => {
    const g = withMoney(100)
    const purse = playerPurse(g)
    expect(purse.acct).toBe(playerAcct(g))
    expect(purse.add(49.6)).toBe(50)
    expect(g.character.money).toBe(150)
    expect(purse.add(Number.NaN)).toBe(0)
    expect(purse.add(Number.POSITIVE_INFINITY)).toBe(0)
    expect(g.character.money).toBe(150)
    expect(peekLedger(g).k).toBe(0)
  })

  it('a person purse clamps the record at its floor with no rounding', () => {
    const p = person('p12', 10.5)
    expect(personPurse(p, 0).add(-20)).toBe(-10.5)
    expect(p.money).toBe(0)
    const q = person('q1', 10.5)
    expect(personPurse(q).add(-20)).toBe(-20)
    expect(q.money).toBe(-9.5)
  })
})

describe('addLoan books the lending mint', () => {
  const loan = { kind: 'personal', lender: 'First Bank', principal: 20_000, rate: 0.07, years: 5 } as const

  it('to pool:sellers by default', () => {
    const g = withMoney(0)
    const l = addLoan(g, loan)
    expect(l.balance).toBe(20_000)
    expect(acctOf(g, 'pool:sellers')).toBe(20_000)
    expect(peekLedger(g).m.lending).toBe(20_000)
    expectConserved(g)
  })

  it('to the account it is given', () => {
    const g = withMoney(0)
    addLoan(g, { ...loan, to: 'person:seller1' })
    expect(acctOf(g, 'person:seller1')).toBe(20_000)
    expect(acctOf(g, 'pool:sellers')).toBe(0)
  })

  // The R2-L5 probe found it: in 6 of 40 lives a founding (a deep-tech company or a big start-up) borrowed more than the 2.5e9 the
  // lending cap first allowed in a year, up to 40.5e9 (seed 109 of the probe), so the mint was clipped and the books held less
  // than the loan. The cap is a brake on a runaway mint, not on a rich life: it sits at 1e12 like the other big sinks.
  it('books a founding loan of $40 billion whole, with no cap row', () => {
    const g = withMoney(0)
    const l = addLoan(g, { kind: 'business', lender: 'The bank', principal: 40_510_884_816, rate: 0.06, years: 7 })
    expect(l.balance).toBe(40_510_884_816)
    expect(acctOf(g, 'pool:sellers')).toBe(40_510_884_816)
    expect(peekLedger(g).m.lending).toBe(40_510_884_816)
    expect(peekLedger(g).l.some((r) => r[1] === 'cap')).toBe(false)
    expectConserved(g)
  })

  it('keeps a quarter of the lending cap above the largest request the probe saw', () => {
    expect(MINTS.lending.cap / 4).toBeGreaterThan(40_510_884_816)
    expect(MINTS.lending.cap).toBeLessThanOrEqual(MINTS.revaluation.cap)
  })

  it('creates no money when it only restructures a debt (noMint)', () => {
    const g = withMoney(0)
    const l = addLoan(g, { ...loan, noMint: true })
    expect(l.balance).toBe(20_000)
    expect(peekLedger(g).k).toBe(0)
    expect(peekLedger(g).m.lending).toBeUndefined()
    expect(g.character.loans).toHaveLength(1)
  })

  it('still adds the loan when the mint has no room left', () => {
    const g = withMoney(0)
    lend(g, 1e12)
    const l = addLoan(g, loan)
    expect(l.balance).toBe(20_000)
    expect(g.character.loans).toHaveLength(1)
    expect(peekLedger(g).m.lending).toBe(1e12)
  })
})

describe('the career kit books its earnings and costs', () => {
  it('c.earn books career.income as taxable income and c.pay books career.cost', () => {
    const g = withMoney(1000)
    const c = careerCtx(g, 'probe', {} as CareerBase)
    expect(c.earn('Fee', 500)).toBe(500)
    expect(c.pay('Agent', 200)).toBe(true)
    expect(g.character.money).toBe(1300)
    expect(g.flags.taxableIncome).toBe(500)
    expect(flowTotal(g, 'career.income', 'person')).toBe(500)
    expect(flowTotal(g, 'career.income', 'pool')).toBe(-500)
    expect(acctOf(g, 'pool:employers')).toBe(-500)
    expect(flowTotal(g, 'career.cost', 'person')).toBe(-200)
    expect(acctOf(g, 'pool:other')).toBe(200)
    expectConserved(g)
  })
})

describe('cost', () => {
  it('books 100,000 wrapper calls inside a generous budget', () => {
    const g = withMoney(1e9)
    const t0 = performance.now()
    for (let i = 0; i < 50_000; i++) {
      addMoney(g, 120, 'wage')
      spend(g, 100, 'purchase')
    }
    const ms = performance.now() - t0
    expect(peekLedger(g).k).toBe(100_000)
    expect(ms).toBeLessThan(2500)
    expectConserved(g)
  })
})

describe('Why shapes', () => {
  it('takes a reason, an object, and treats junk like no reason', () => {
    const g = withMoney(0)
    const junk = [undefined, null, 5, 'not a reason', { reason: 'not a reason' }, {}] as unknown as (Why | undefined)[]
    for (const w of junk) addMoney(g, 10, w)
    expect(flowTotal(g, 'unreasoned', 'person')).toBe(60)
    expect(acctBalance(g, 'pool:other')).toBe(-60)
    expectConserved(g)
  })
})
