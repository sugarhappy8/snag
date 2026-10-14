// Share classes: what a payout does to a listed share price. The price carries the structure's factor
// (classFactor), so cash that leaves the company takes factor x the payout per share off it, not the
// whole payout: the price lands where the next yearly update would put it, and nothing is left to
// heal. A one-class company (factor 1) is exactly as it was. Covers the dividend (payOut, which the
// yearly rule uses too), the buyback and the owner's extra money (transactEquity), and the hired
// CEO's cash payout.
import { describe, expect, it } from 'vitest'
import '../src/game/business'
import { smartManagerTurn } from '../src/game/business/board-ceo'
import { payOut } from '../src/game/business/board-menu'
import { boardOf } from '../src/game/business/board-state'
import { askingSalary, becomeCeo, stepDown } from '../src/game/business/career'
import { bestPlan, refreshValue, updateSharePrice, valuationOf } from '../src/game/business/economy'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { equityQuote, transactEquity } from '../src/game/business/rescue'
import { classFactor } from '../src/game/business/share-classes'
import { autoDividendYear } from '../src/game/business/dividend-year'
import { bizOf, businessAssets, type BizState, type Statement } from '../src/game/business/state'
import { netWorth } from '../src/game/core'
import { createNewLife } from '../src/game/life'
import type { Asset, GameState } from '../src/game/types'
import { getCountry } from '../src/game/world'
import { founder, listed } from './own-listing-kit'

type Kind = 'single' | 'ab' | 'nv'
const KINDS: Kind[] = ['single', 'ab', 'nv']
const SHARES = 1e8

/** A listed company with the owner on 60%, 600M of cash, and a price already at the market's price for its structure. */
function structured(kind: Kind, seed = 7): { g: GameState; a: Asset; b: BizState } {
  const g = founder(seed)
  const { a, b } = listed(g, { share: 0.6, profit: 20e6 })
  b.cash = 600e6
  if (kind !== 'single') b.classes = { kind, hi: 0.6 }
  b.sharePrice = Math.round((valuationOf(b) / b.sharesOut) * classFactor(b) * 100) / 100
  b.valuation = Math.round(b.sharePrice * b.sharesOut)
  refreshValue(a, b)
  return { g, a, b }
}

/** A booked year with a fiscal year and 12M of costs, which is all the dividend rule reads. */
function books(year: number): Statement {
  return {
    year, demand: 0, sold: 0, produced: 0, spoiled: 0, price: 0, revenue: 0, salesTax: 0, netRevenue: 12e6, cogs: 0, wages: 0, keyStaff: 0,
    rent: 0, marketing: 0, interest: 0, upkeep: 0, other: 0, otherIncome: 0, ownerPay: 0, pbt: 0, corpTax: 0, net: 50e6, cashErosion: 0, cycle: 1,
    openFraction: 1, employees: 0,
  }
}

/** What the yearly update would aim for: the company's value now, per share, at its structure's factor. */
function structurePrice(b: BizState): number {
  return (valuationOf(b) / b.sharesOut) * classFactor(b)
}

/** The yearly price update, booked the way the company loop books it (yearly.ts). */
function updateYear(g: GameState, a: Asset, b: BizState): void {
  b.valuation = updateSharePrice(g, b, g.year)
  refreshValue(a, b)
}

describe('a dividend moves the price by the structure factor', () => {
  it('a one-class company is exactly as before: the whole payout comes off the price', () => {
    const { g, a, b } = structured('single')
    expect(b.sharePrice).toBe(9.22)
    const mine = payOut(g, a, b, 500e6)
    expect(mine).toBe(300e6)
    expect(b.cash).toBe(100e6)
    expect(b.sharePrice).toBe(4.22)
    expect(b.valuation).toBe(Math.round(4.22 * SHARES))
    expect(a.value).toBe(Math.round(b.valuation * 0.6))
  })

  it('a founder-share or non-voting company lands on the price of its structure', () => {
    for (const kind of ['ab', 'nv'] as const) {
      const { g, a, b } = structured(kind)
      const cf = classFactor(b)
      expect(cf).toBeLessThan(1)
      const before = b.sharePrice
      payOut(g, a, b, 500e6)
      // The price fell by cf x the payout per share (to the cent), and sits where the structure puts it.
      expect(Math.abs(before - b.sharePrice - 5 * cf), kind).toBeLessThanOrEqual(0.0101)
      expect(Math.abs(b.sharePrice - structurePrice(b)), kind).toBeLessThanOrEqual(0.0151)
      expect(b.valuation, kind).toBe(Math.round(b.sharePrice * SHARES))
      expect(a.value, kind).toBe(Math.round(b.valuation * 0.6))
    }
  })

  it('the price update after a payout does not lift a classed owner past a one-class owner', () => {
    // The same payout, the same year and the same seed (so the same market move). The owner's net worth
    // over the update is what the update changes: a price below its structure would heal up here.
    const drift = (kind: Kind): number => {
      const { g, a, b } = structured(kind)
      payOut(g, a, b, 500e6)
      const after = netWorth(g)
      updateYear(g, a, b)
      return netWorth(g) - after
    }
    const one = drift('single')
    expect(one).not.toBe(0)
    for (const kind of ['ab', 'nv'] as const) {
      // A cent a share is the price's own rounding.
      expect(drift(kind), kind).toBeLessThanOrEqual(one + 0.011 * SHARES * 0.6)
    }
  })

  it('the yearly dividend rule pays through the same move', () => {
    for (const kind of KINDS) {
      const { g, a, b } = structured(kind)
      b.dividend = { mode: 'cash', pct: 0.5, keep: 3 }
      b.last = books(g.year - 1)
      const out = autoDividendYear(g, a, b, b.last)
      expect(out?.kind, kind).toBe('paid')
      expect(Math.abs(b.sharePrice - structurePrice(b)), kind).toBeLessThanOrEqual(0.0151)
    }
  })
})

describe('the owner putting money in, and the company buying shares back', () => {
  it('a one-class company books them as before', () => {
    const buy = structured('single')
    const q = equityQuote(buy.g, buy.a, buy.b, 'buyback', 100e6)
    expect(transactEquity(buy.g, buy.a.id, 'buyback', 100e6)).toBe(true)
    expect(buy.b.valuation).toBe(Math.max(0, q.value - 100e6))
    const put = structured('single')
    const p = equityQuote(put.g, put.a, put.b, 'subscribe', 250e6)
    expect(transactEquity(put.g, put.a.id, 'subscribe', 250e6)).toBe(true)
    expect(put.b.valuation).toBe(p.value + 250e6)
  })

  it('a buyback lands on the structure price', () => {
    for (const kind of ['ab', 'nv'] as const) {
      const { g, a, b } = structured(kind)
      const q = equityQuote(g, a, b, 'buyback', 100e6)
      expect(q.units, kind).toBeGreaterThan(0.01)
      expect(transactEquity(g, a.id, 'buyback', 100e6), kind).toBe(true)
      expect(b.valuation, kind).toBeCloseTo(q.value - 100e6 * classFactor(b), 0)
      expect(Math.abs(b.sharePrice - structurePrice(b)) / b.sharePrice, kind).toBeLessThan(0.002)
    }
  })

  it('new money lands on the structure price', () => {
    for (const kind of ['ab', 'nv'] as const) {
      const { g, a, b } = structured(kind)
      const q = equityQuote(g, a, b, 'subscribe', 250e6)
      expect(transactEquity(g, a.id, 'subscribe', 250e6), kind).toBe(true)
      expect(b.valuation, kind).toBeCloseTo(q.value + 250e6 * classFactor(b), 0)
      expect(Math.abs(b.sharePrice - structurePrice(b)) / b.sharePrice, kind).toBeLessThan(0.002)
    }
  })
})

describe('a hired CEO on a cash mandate', () => {
  /** A listed company the player owns whole, run by a hired CEO told to pay out spare cash. */
  function ceoRun(kind: Kind): { price: number; drop: number; paid: number } {
    const g = createNewLife({ seed: 4, year: 1990, countryId: 'us' })
    g.queue = []
    g.character.age = 36
    g.year = 2026
    g.character.money = 1_000_000
    g.character.talent = null
    g.character.talents = []
    const city = getCountry('us').cities[0]
    const b0 = newBiz(g, 'restaurant', 'us', city, { cash: 5_000_000, founded: 2020, outlets: [{ countryId: 'us', city, count: 6, opened: 2020 }] })
    const asset = createBusinessAsset(g, 'Test Co', b0, 100_000)
    g.assets.push(asset)
    becomeCeo(g, asset, b0)
    const plan = bestPlan(g, bizOf(g, asset))
    bizOf(g, asset).price = plan.price
    bizOf(g, asset).production = plan.production
    stepDown(g, asset, bizOf(g, asset), { firstName: 'Pat', lastName: 'Lee', gender: 'female', skill: 90, salary: askingSalary(bizOf(g, asset), 90), since: g.year, style: 'steady', integrity: 100 })
    g.queue = []
    const a = businessAssets(g)[0]
    const b = bizOf(g, a)
    b.public = true
    b.exchange = 'NYSE'
    b.sharesOut = 1e6
    b.sharePrice = 100
    b.valuation = 1e8
    b.share = 1
    b.cash = 60e6
    if (kind !== 'single') b.classes = { kind, hi: 1 }
    boardOf(b).mandate = 'cash'
    boardOf(b).limits = { capex: 0.05, reserve: 2, pay: 1.25 }
    const price = b.sharePrice
    const money0 = g.character.money
    smartManagerTurn(g, a, b)
    return { price, drop: price - b.sharePrice, paid: g.character.money - money0 }
  }

  it('pays a classed company down by the structure factor, a one-class company as before', () => {
    const one = ceoRun('single')
    expect(one.paid).toBeGreaterThan(1e6)
    expect(Math.abs(one.drop - one.paid / 1e6)).toBeLessThanOrEqual(0.0101)
    for (const kind of ['ab', 'nv'] as const) {
      const x = ceoRun(kind)
      const cf = kind === 'ab' ? 0.96 : 0.93
      expect(x.paid, kind).toBeGreaterThan(1e6)
      expect(Math.abs(x.drop - (x.paid / 1e6) * cf), kind).toBeLessThanOrEqual(0.0101)
    }
  })
})
