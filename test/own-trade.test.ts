// Buying more of your own listed company from the Stocks row (own-listing phase 1, task 4).
import { describe, expect, it } from 'vitest'
import { ownerControls } from '../src/game/business/board'
import { valuationOf } from '../src/game/business/economy'
import { businessAssetView } from '../src/game/business'
import { sellShares } from '../src/game/business/exit'
import { outsideFloat } from '../src/game/business/own-listing'
import { MAX_BUY_SHARE, MIN_OUTSIDE, SHARE_SALES_PER_YEAR, buyLimit, buyOwnShares, buyPreview, buyQuote, controlsWith, sellLimit, sellNote, sellOwnShares, shareSaleKey, type BuyQuote } from '../src/game/business/own-trade'
import { tickerOf } from '../src/game/business/listing-id'
import { equityYearKey, transactEquity } from '../src/game/business/rescue'
import { bizOf, executiveEquity, isTicker, readBiz, stakeValue } from '../src/game/business/state'
import { netWorth, useYearAction, yearActionsUsed } from '../src/game/core'
import { investmentHoldings, liquidatePortfolio } from '../src/game/investments'
import { createPerson } from '../src/game/people'
import type { GameState, MenuAction } from '../src/game/types'
import { deepFreeze } from './fuzz-kit'
import { findNode, founder, listed, listedGroup, privateCompany } from './own-listing-kit'

/** The notices queued under one title, oldest first. */
function noticesTitled(g: GameState, title: string): string[] {
  const out: string[] = []
  for (const m of g.queue) if (m.kind === 'notice' && m.title === title) out.push(m.text)
  return out
}

const NUMERIC: (keyof BuyQuote)[] = ['dollars', 'basePrice', 'avgPrice', 'fraction', 'shares', 'newShare', 'maxFraction', 'maxDollars']

describe('buying your own shares', () => {
  it('pays at least the fundamental price plus 3% and leaves the quote where the market had it', () => {
    // The quote is above the fundamental: the buy is priced off the quote.
    {
      const g = founder()
      const { a, b } = listed(g, { marketCap: 10e9, profit: 0 })
      const q = buyQuote(g, a, b, 1e8)
      expect(b.sharePrice).toBe(100)
      expect(q.basePrice).toBeCloseTo(b.sharePrice * 1.03, 6)
      expect(q.avgPrice).toBeGreaterThanOrEqual(q.basePrice)
    }
    // The fundamental is above the quote: the buy is priced off the fundamental.
    {
      const g = founder()
      const { a, b } = listed(g, { marketCap: 10e9, profit: 5e9 })
      expect(valuationOf(b) / b.sharesOut).toBeGreaterThan(b.sharePrice)
      const q = buyQuote(g, a, b, 1e8)
      expect(q.basePrice).toBeCloseTo((valuationOf(b) / b.sharesOut) * 1.03, 6)
      expect(q.avgPrice).toBeGreaterThanOrEqual(q.basePrice)

      const { sharePrice, valuation, sharesOut, share } = b
      expect(buyOwnShares(g, a, b, 1e8)).toBe(true)
      expect(b.sharePrice).toBe(sharePrice)
      expect(b.valuation).toBe(valuation)
      expect(b.sharesOut).toBe(sharesOut)
      expect(b.share).toBeCloseTo(share + q.fraction, 9)
    }
  })

  it('moves the cash into the stake once', () => {
    const g = founder()
    const { a, b } = listed(g, { marketCap: 10e9 })
    const cash = g.character.money
    const invested = b.invested
    const assets = g.assets.length
    const worth = netWorth(g)
    const rng = g.rng
    const trades = g.counters.investTrades
    const placed = g.counters.moneyInvested
    const share = b.share

    expect(buyOwnShares(g, a, b, 1e8)).toBe(true)

    expect(g.character.money).toBe(cash - 1e8)
    expect(b.invested).toBe(invested + 1e8)
    expect(a.value).toBe(stakeValue(b))
    expect(b.share).toBeGreaterThan(share)
    // The shares are not copied anywhere else.
    expect(investmentHoldings(g)).toEqual([])
    expect(g.assets).toHaveLength(assets)
    expect(netWorth(g)).toBeLessThanOrEqual(worth)
    expect(netWorth(g)).toBeGreaterThanOrEqual(worth - 1e8)
    // Not an investment trade, and no dice.
    expect(g.counters.investTrades).toBe(trades)
    expect(g.counters.moneyInvested).toBe(placed)
    expect(g.rng).toBe(rng)

    // Sell Everything does not touch the company.
    liquidatePortfolio(g)
    expect(g.assets.filter((x) => x.id === a.id)).toHaveLength(1)
    expect(readBiz(g, a).share).toBe(b.share)
  })

  it('stops at 15% a year and leaves 1% with the public', () => {
    expect(MAX_BUY_SHARE).toBe(0.15)
    expect(MIN_OUTSIDE).toBe(0.01)

    // Share 0.6: the cap is 15% of the company.
    {
      const g = founder()
      const { a, b } = listed(g, { share: 0.6 })
      const q = buyQuote(g, a, b, 1)
      expect(q.maxFraction).toBeCloseTo(0.15, 9)
      expect(buyQuote(g, a, b, 1e30).fraction).toBeLessThanOrEqual(0.15)

      // One dollar over the most it takes is refused, and nothing is used up.
      const cash = g.character.money
      expect(buyOwnShares(g, a, b, q.maxDollars + 10)).toBe(false)
      expect(noticesTitled(g, 'Buy Shares')).toHaveLength(1)
      expect(noticesTitled(g, 'Buy Shares')[0]).toMatch(/^You can buy up to /)
      expect(b.share).toBe(0.6)
      expect(g.character.money).toBe(cash)
      expect(yearActionsUsed(g, equityYearKey(a.id))).toBe(0)

      // Exactly the most it takes goes through.
      expect(buyOwnShares(g, a, b, q.maxDollars)).toBe(true)
      expect(b.share).toBeCloseTo(0.75, 4)
    }
    // Share 0.9: the buy stops with 1% outside.
    {
      const g = founder()
      const { a, b } = listed(g, { share: 0.9 })
      const q = buyQuote(g, a, b, 1)
      expect(q.maxFraction).toBeCloseTo(0.09, 9)
      expect(buyOwnShares(g, a, b, q.maxDollars)).toBe(true)
      expect(outsideFloat(b)).toBeCloseTo(0.01, 4)
    }
    // Relatives and executives are not bought out: the cap is what is left of the float.
    {
      const g = founder()
      const sib = createPerson(g, { relation: 'sibling', age: 45, firstName: 'Mina', money: 10_000, occupation: 'Clerk', relationship: 80 })
      const { a, b } = listed(g, { share: 0.6, executive: 0.05, family: [{ id: sib.id, share: 0.3 }] })
      const q = buyQuote(g, a, b, 1)
      expect(q.maxFraction).toBeCloseTo(0.04, 9)
      expect(buyOwnShares(g, a, b, q.maxDollars)).toBe(true)
      expect(b.familyShares?.[0].share).toBe(0.3)
      expect(executiveEquity(b)).toBe(0.05)
      // Nothing is clamped on load either.
      expect(readBiz(g, a).familyShares?.[0].share).toBe(0.3)
      expect(readBiz(g, a).share).toBeCloseTo(0.64, 4)
    }
    // Dollars are whole: an order of 0.4 over the most still takes the most.
    {
      const g = founder()
      const { a, b } = listed(g, { share: 0.6 })
      const q = buyQuote(g, a, b, 1)
      const cash = g.character.money
      const invested = b.invested
      expect(buyOwnShares(g, a, b, q.maxDollars + 0.4)).toBe(true)
      expect(g.character.money).toBe(cash - q.maxDollars)
      expect(b.invested).toBe(invested + q.maxDollars)
    }
    // Share 0.995: nothing is left to buy.
    {
      const g = founder()
      const { a, b } = listed(g, { share: 0.995 })
      expect(buyLimit(g, a, b)).toBe('No outside shares left to buy. 1% stays with the public.')
      expect(buyOwnShares(g, a, b, 1e6)).toBe(false)
      expect(noticesTitled(g, 'Buy Shares')).toEqual(['No outside shares left to buy. 1% stays with the public.'])
      expect(b.share).toBe(0.995)
    }
  })

  it('once a year, shared with Capital & Ownership', () => {
    const g = founder()
    const { a, b } = listed(g, { share: 0.6 })
    expect(buyLimit(g, a, b)).toBeNull()
    expect(buyOwnShares(g, a, b, 1e8)).toBe(true)
    expect(yearActionsUsed(g, equityYearKey(a.id))).toBe(1)
    const year = "You've used this company's one ownership move this year, here or in Capital & Ownership."
    expect(buyLimit(g, a, b)).toBe(year)
    const share = b.share
    expect(buyOwnShares(g, a, b, 1e8)).toBe(false)
    expect(noticesTitled(g, 'Buy Shares')).toEqual([year])
    expect(b.share).toBe(share)

    // The other door refuses before any board vote.
    expect(transactEquity(g, a.id, 'secondary', 1000)).toBe(false)
    expect(transactEquity(g, a.id, 'subscribe', 1000)).toBe(false)
    expect(noticesTitled(g, 'Ownership')).toEqual(['One of these a year per company.', 'One of these a year per company.'])

    // A new year frees it.
    g.yearActions = {}
    expect(buyLimit(g, a, b)).toBeNull()

    // And the other direction: any Capital & Ownership move uses the same key.
    const h = founder()
    const other = listed(h, { share: 0.6 })
    expect(useYearAction(h, equityYearKey(other.a.id), 1)).toBe(true)
    expect(buyLimit(h, other.a, other.b)).toBe(year)
    expect(buyOwnShares(h, other.a, other.b, 1e8)).toBe(false)
    expect(other.b.share).toBe(0.6)
  })

  it('needs an adult out of prison, an open exchange and the cash', () => {
    {
      const g = founder()
      const { a, b } = listed(g)
      g.character.age = 17
      expect(buyLimit(g, a, b)).toMatch(/18/)
      expect(buyOwnShares(g, a, b, 1e8)).toBe(false)
      expect(noticesTitled(g, 'Buy Shares')).toHaveLength(1)
      expect(yearActionsUsed(g, equityYearKey(a.id))).toBe(0)
    }
    {
      const g = founder()
      const { a, b } = listed(g)
      g.character.prison = { name: 'State Pen', security: 'medium', crime: 'Theft', sentenceYears: 2, yearsServed: 0, respect: 20, appealed: false, escapeAttempts: 0 }
      expect(buyLimit(g, a, b)).toMatch(/prison/)
    }
    {
      const g = founder()
      const { a, b } = listed(g)
      g.character.alive = false
      expect(buyLimit(g, a, b)).toBeTruthy()
    }
    {
      const g = founder()
      const { a, b } = privateCompany(g)
      expect(buyLimit(g, a, b)).toBe("It isn't listed.")
    }
    {
      const g = founder()
      const grp = listedGroup(g, 'us', 0.7)
      const b = bizOf(g, grp.members[0])
      b.public = true
      expect(buyLimit(g, grp.members[0], b)).toMatch(/group/)
    }
    {
      // A company on a shut exchange, whatever country its owner lives in.
      const g = founder(41, 'us', 50_000_000_000, 1946)
      const { a, b } = listed(g, { countryId: 'jp' })
      expect(buyLimit(g, a, b)).toMatch(/closed this year/)
    }
    {
      const g = founder()
      const { a, b } = listed(g)
      g.character.money = 10
      expect(buyLimit(g, a, b)).toBe("You can't afford one share.")
      expect(buyOwnShares(g, a, b, 5)).toBe(false)
    }
    {
      // It is not trading when it has no shares or no price.
      const g = founder()
      const { a, b } = listed(g)
      b.sharePrice = 0
      expect(buyLimit(g, a, b)).toBe("It isn't trading.")
    }
    {
      // The stake is gone (an old save before the yearly cleanup).
      const g = founder()
      const { a, b } = listed(g, { share: 0 })
      expect(buyLimit(g, a, b)).toMatch(/no ownership stake/)
    }
  })

  it('judges the exchange the company trades on, not the one you live near', () => {
    const g = founder(41, 'gb')
    const { a, b } = listed(g, { countryId: 'jp' })
    expect(b.exchange).toBe('TSE')
    expect(buyLimit(g, a, b)).toBeNull()
    expect(buyOwnShares(g, a, b, 1e8)).toBe(true)
    expect(noticesTitled(g, 'Shares Bought')).toHaveLength(1)

    // A company spun off a New York group trades in New York.
    const h = founder(41, 'gb')
    const spun = listed(h, { countryId: 'jp', exchange: 'NYSE' })
    expect(buyLimit(h, spun.a, spun.b)).toBeNull()
    expect(buyOwnShares(h, spun.a, spun.b, 1e8)).toBe(true)
    expect(g.log.flatMap((y) => y.entries).some((e) => e.text.includes('on the TSE'))).toBe(true)
    expect(h.log.flatMap((y) => y.entries).some((e) => e.text.includes('on the NYSE'))).toBe(true)
  })

  it('edge of control', () => {
    // The preview and the board agree at every stake.
    for (const s of [0.3, 0.49, 0.5, 0.51, 0.8]) {
      const g = founder()
      const { a, b } = listed(g, { share: s })
      expect(controlsWith(g, b, s)).toBe(ownerControls(g, a))
    }
    // Control is not needed to buy.
    {
      const g = founder()
      const { a, b } = listed(g, { share: 0.49 })
      expect(buyLimit(g, a, b)).toBeNull()
    }
    {
      const g = founder()
      const { a, b } = listed(g, { share: 0.3 })
      expect(ownerControls(g, a)).toBe(false)
      expect(buyLimit(g, a, b)).toBeNull()
      expect(buyPreview(g, a, b, 1e8)).not.toContain('control of the board')
    }
    // A buy that crosses 50% gives control, and says so.
    {
      const g = founder()
      const { a, b } = listed(g, { share: 0.45 })
      expect(ownerControls(g, a)).toBe(false)
      const m = buyQuote(g, a, b, 1).maxDollars
      const q = buyQuote(g, a, b, m)
      expect(q.controlsBefore).toBe(false)
      expect(q.controls).toBe(true)
      const text = buyPreview(g, a, b, m)
      expect(text).toContain(' This gives you control of the board.')
      expect(text).not.toContain('You keep control')
      expect(buyOwnShares(g, a, b, m)).toBe(true)
      expect(ownerControls(g, a)).toBe(true)
    }
    // A buy from 50% keeps it.
    {
      const g = founder()
      const { a, b } = listed(g, { share: 0.5 })
      expect(ownerControls(g, a)).toBe(true)
      expect(buyPreview(g, a, b, 1e8)).toContain(' You keep control of the board.')
      expect(buyOwnShares(g, a, b, 1e8)).toBe(true)
      expect(ownerControls(g, a)).toBe(true)
    }
  })

  it('a buy never loses control, and the preview and the board agree at every stake', () => {
    const g = founder()
    const { a, b } = listed(g, { share: 0.5 })
    for (let s = 0; s <= 1; s += 0.005) {
      b.share = s
      expect(controlsWith(g, b, s), `stake ${s}`).toBe(ownerControls(g, a))
      for (const more of [0.001, 0.01, 0.05, 0.1, 0.15]) {
        if (controlsWith(g, b, s)) expect(controlsWith(g, b, Math.min(1, s + more)), `stake ${s} plus ${more}`).toBe(true)
      }
    }
  })

  it('stays finite and refuses cleanly on a hostile record', () => {
    const g = founder()
    const { a, b } = listed(g)
    const bad: [keyof typeof b, number | null][] = [
      ['share', NaN], ['share', null], ['share', 7], ['share', -3], ['sharesOut', Infinity], ['sharesOut', 1e-300], ['sharesOut', 1e300],
      ['sharePrice', Infinity], ['sharePrice', 1e-300], ['sharePrice', 1e300], ['valuation', NaN], ['valuation', Infinity], ['valuation', -1e9],
    ]
    for (const [field, value] of bad) {
      const c = { ...b, [field]: value }
      for (const d of [0, 1, 1e8, 1e30, Infinity, NaN]) {
        const q = buyQuote(g, a, c, d)
        for (const k of NUMERIC) expect(Number.isFinite(q[k] as number), `${field}=${value} ${k} for ${d}`).toBe(true)
        expect(buyPreview(g, a, c, d), `${field}=${value} for ${d}`).not.toMatch(/NaN|undefined|Infinity/)
        expect(() => buyLimit(g, a, c)).not.toThrow()
      }
    }
    // A stake that is not a number leaves no float to buy from: the buy is refused and nothing moves.
    const h = founder()
    const sick = listed(h)
    sick.b.share = NaN
    const cash = h.character.money
    expect(buyOwnShares(h, sick.a, sick.b, 1e8)).toBe(false)
    expect(h.character.money).toBe(cash)
    expect(yearActionsUsed(h, equityYearKey(sick.a.id))).toBe(0)
  })

  it('previews an order over the limit as the biggest order allowed', () => {
    const g = founder()
    const { a, b } = listed(g, { marketCap: 10e9, share: 0.6 })
    const top = buyQuote(g, a, b, 1).maxDollars
    const atTop = buyQuote(g, a, b, top)
    for (const d of [top + 1, top * 2, 1e15, 1e30]) {
      const q = buyQuote(g, a, b, d)
      expect(q.fraction).toBeCloseTo(q.maxFraction, 6)
      // Not the whole order spread over the capped shares.
      expect(q.avgPrice).toBeCloseTo(atTop.avgPrice, 4)
      expect(q.avgPrice).toBeLessThan(q.basePrice * 1.2)
      expect(buyPreview(g, a, b, d)).not.toMatch(/sextillion|quintillion|quadrillion|trillion/)
    }
    // A small order is unchanged: the whole amount buys its shares.
    const small = buyQuote(g, a, b, 1e8)
    expect(small.avgPrice).toBeCloseTo(1e8 / small.shares, 6)
  })

  it('says what the buy is and what it does', () => {
    const g = founder()
    const { a, b } = listed(g, { marketCap: 10e9, share: 0.6 })
    const text = buyPreview(g, a, b, 1e8)
    expect(text).toMatch(/^[\d,.]+( million| billion)? shares at about \$[\d,.]+ each \(market \$100\.00\)\. You'd own 6\d\.\d%\./)
    expect(text).toContain(' You keep control of the board.')

    const before = g.queue.length
    const log = g.log.flatMap((y) => y.entries).length
    expect(buyOwnShares(g, a, b, 1e8)).toBe(true)
    const [msg] = noticesTitled(g, 'Shares Bought')
    expect(msg).toMatch(/^You paid \$100,000,000 for [\d,.]+( million| billion)? shares of Listed Co, about \$[\d.,]+ each\. You own 6\d\.\d%\.$/)
    expect(g.queue.length).toBe(before + 1)
    const lines = g.log.flatMap((y) => y.entries).map((e) => e.text)
    expect(lines.length).toBe(log + 1)
    expect(lines[lines.length - 1]).toMatch(/^I bought more of Listed Co on the NYSE\. I own 6\d\.\d%\.$/)
  })

  it('says "1 share" for one share and "shares" for the rest', () => {
    const g = founder()
    const { a, b } = listed(g, { marketCap: 5e9 })
    // $50 a share: the smallest buy the slider offers is one share's price, rounded up.
    const one = Math.ceil(buyQuote(g, a, b, 0).basePrice)
    expect(one).toBe(52)
    expect(buyPreview(g, a, b, one)).toMatch(/^1 share at about \$[\d.,]+ each \(market \$50\.00\)\./)
    expect(buyPreview(g, a, b, 2 * one)).toMatch(/^2 shares at about /)
    expect(buyPreview(g, a, b, 100 * one)).toMatch(/^10\d shares at about /)
    expect(buyOwnShares(g, a, b, one)).toBe(true)
    const [msg] = noticesTitled(g, 'Shares Bought')
    expect(msg).toMatch(/^You paid \$52 for 1 share of Listed Co, about \$[\d.,]+ each\. You own /)
    expect(msg).not.toContain('1 shares')
  })

  it('never reads 0 shares at the smallest buy, whatever the price of a share', () => {
    for (const price of [0.2, 0.9, 1, 3.7, 50, 999.99, 25_000]) {
      const g = founder()
      const { a, b } = listed(g, { sharesOut: 1e8, marketCap: price * 1e8 })
      const min = Math.max(1, Math.ceil(buyQuote(g, a, b, 0).basePrice))
      const text = buyPreview(g, a, b, min)
      expect(text, String(price)).toMatch(/^[1-9][\d,]*( million| billion)? shares? at about /)
      expect(text, String(price)).not.toMatch(/^1 shares|^0 /)
    }
  })

  it('writes the ticker down when it buys, and fixes a bad one', () => {
    const g = founder()
    const { a, b } = listed(g)
    expect(b.ticker).toBeUndefined()
    const shown = tickerOf(g, a, b)
    expect(buyOwnShares(g, a, b, 1e8)).toBe(true)
    expect(b.ticker).toBe(shown)

    const h = founder()
    const bad = listed(h)
    bad.b.ticker = 'acme'
    const fixed = tickerOf(h, bad.a, bad.b)
    expect(isTicker(fixed)).toBe(true)
    expect(buyOwnShares(h, bad.a, bad.b, 1e8)).toBe(true)
    expect(bad.b.ticker).toBe(fixed)
  })

  it('refuses amounts that are not money, without using the year', () => {
    for (const d of [0, -5, 0.4, NaN, Infinity, -Infinity]) {
      const g = founder()
      const { a, b } = listed(g)
      const cash = g.character.money
      expect(buyOwnShares(g, a, b, d)).toBe(false)
      expect(g.character.money).toBe(cash)
      expect(b.share).toBe(0.6)
      expect(yearActionsUsed(g, equityYearKey(a.id))).toBe(0)
    }
    // More than the cash on hand, though inside the 15% cap.
    const g = founder(41, 'us', 5_000_000)
    const { a, b } = listed(g, { marketCap: 10e9 })
    expect(buyOwnShares(g, a, b, 6_000_000)).toBe(false)
    expect(noticesTitled(g, 'Buy Shares')).toEqual(['You can buy up to $5.0M this year.'])
    expect(g.character.money).toBe(5_000_000)
    expect(buyOwnShares(g, a, b, 5_000_000)).toBe(true)
    expect(g.character.money).toBe(0)
  })

  it('does not hand out shares for nothing when the cash is not a number', () => {
    const g = founder()
    const { a, b } = listed(g)
    g.character.money = NaN
    expect(buyOwnShares(g, a, b, 1e8)).toBe(false)
    expect(b.share).toBe(0.6)
    expect(yearActionsUsed(g, equityYearKey(a.id))).toBe(0)
  })

  it('quotes and previews are pure and finite for any amount', () => {
    const g = founder()
    const { a, b } = listed(g, { marketCap: 10e9, share: 0.6 })
    const bare = { ...b, sharesOut: 0 }
    const state = JSON.stringify(g)
    const rng = g.rng
    for (const d of [0, -5, NaN, 1, 1e8, 1e30]) {
      const q = buyQuote(g, a, b, d)
      for (const k of NUMERIC) expect(Number.isFinite(q[k] as number), `${k} for ${d}`).toBe(true)
      expect(typeof q.controlsBefore).toBe('boolean')
      expect(typeof q.controls).toBe('boolean')
      if (!(d > 0)) expect(q.dollars).toBe(0)
      expect(q.fraction).toBeGreaterThanOrEqual(0)
      expect(q.fraction).toBeLessThanOrEqual(q.maxFraction)

      const z = buyQuote(g, a, bare, d)
      for (const k of NUMERIC) expect(Number.isFinite(z[k] as number), `${k} for ${d} with no shares`).toBe(true)
      expect(z.maxDollars).toBe(0)
      expect(z.fraction).toBe(0)
      expect(z.newShare).toBe(0.6)

      for (const text of [buyPreview(g, a, b, d), buyPreview(g, a, bare, d)]) {
        expect(text).not.toMatch(/NaN|undefined|Infinity/)
      }
      expect(buyLimit(g, a, bare)).toBeTruthy()
      controlsWith(g, b, 0.3)
    }
    buyLimit(g, a, b)
    expect(JSON.stringify(g)).toBe(state)
    expect(g.rng).toBe(rng)
  })

  it('reads a frozen game without writing to it', () => {
    const g = founder()
    const { a, b } = listed(g)
    deepFreeze(g)
    expect(() => {
      buyQuote(g, a, b, 1e8)
      buyLimit(g, a, b)
      buyPreview(g, a, b, 1e8)
      controlsWith(g, b, 0.4)
    }).not.toThrow()
  })

  it('does not depend on the seed', () => {
    const quotes = [1, 2, 99].map((seed) => {
      const g = founder(seed)
      const { a, b } = listed(g, { marketCap: 10e9 })
      return { q: buyQuote(g, a, b, 1e8), text: buyPreview(g, a, b, 1e8), why: buyLimit(g, a, b) }
    })
    expect(quotes[1]).toEqual(quotes[0])
    expect(quotes[2]).toEqual(quotes[0])
  })
})

describe('selling from the Stocks row', () => {
  it('is Exit > Sell Shares: same proceeds, tax and price', () => {
    const g = founder()
    const { a } = listed(g, { marketCap: 10e9, share: 0.6 })
    const clone = structuredClone(g)
    const a2 = clone.assets.find((x) => x.id === a.id)!
    const b2 = bizOf(clone, a2)
    sellShares(clone, a2, b2, 0.1)

    expect(sellOwnShares(g, a.id, 0.1)).toBe(true)
    const b = bizOf(g, a)
    expect(g.character.money).toBe(clone.character.money)
    expect(b.share).toBe(b2.share)
    expect(b.sharePrice).toBe(b2.sharePrice)
    expect(b.invested).toBe(b2.invested)
    expect(b.share).toBeLessThan(0.6)
    expect(noticesTitled(g, 'Shares Sold')).toHaveLength(1)
  })

  it('uses the same two sales a year as Exit > Sell Shares', () => {
    expect(SHARE_SALES_PER_YEAR).toBe(2)
    const g = founder()
    const { a } = listed(g, { marketCap: 10e9, share: 0.6 })
    expect(shareSaleKey(a.id)).toBe(`biz.shares.${a.id}`)
    expect(sellOwnShares(g, a.id, 0.05)).toBe(true)
    expect(sellOwnShares(g, a.id, 0.05)).toBe(true)
    const share = bizOf(g, a).share
    expect(sellOwnShares(g, a.id, 0.05)).toBe(false)
    expect(noticesTitled(g, 'Sell Shares')).toEqual(["You've sold shares twice this year."])
    expect(yearActionsUsed(g, shareSaleKey(a.id))).toBe(2)
    expect(bizOf(g, a).share).toBe(share)

    // The Exit menu spends the same two sales, from the same count.
    g.yearActions = {}
    const exit = findNode(g, businessAssetView(g, a), `biz.sellShares.${a.id}`) as MenuAction
    expect(exit).toBeTruthy()
    exit.run(g, '5')
    expect(yearActionsUsed(g, shareSaleKey(a.id))).toBe(1)
    expect(sellOwnShares(g, a.id, 0.05)).toBe(true)
    expect(sellOwnShares(g, a.id, 0.05)).toBe(false)
    // And the other way round: both Stocks sales used, Exit refuses.
    const h = founder()
    const other = listed(h, { marketCap: 10e9, share: 0.6 })
    expect(sellOwnShares(h, other.a.id, 0.05)).toBe(true)
    expect(sellOwnShares(h, other.a.id, 0.05)).toBe(true)
    const cash = h.character.money
    ;(findNode(h, businessAssetView(h, other.a), `biz.sellShares.${other.a.id}`) as MenuAction).run(h, '5')
    expect(h.character.money).toBe(cash)
    expect(yearActionsUsed(h, shareSaleKey(other.a.id))).toBe(2)
  })

  it('selling out removes the company once and pays relatives once', () => {
    const g = founder()
    const sib = createPerson(g, { relation: 'sibling', age: 45, firstName: 'Mina', money: 10_000, occupation: 'Clerk', relationship: 80 })
    const { a } = listed(g, { marketCap: 10e9, share: 0.5, family: [{ id: sib.id, share: 0.3 }] })
    const before = sib.money
    const cash = g.character.money
    expect(sellOwnShares(g, a.id, 1)).toBe(true)
    expect(g.assets.some((x) => x.id === a.id)).toBe(false)
    expect(g.character.money).toBeGreaterThan(cash)
    const paid = sib.money - before
    expect(paid).toBeGreaterThan(0.3 * 10e9 * 0.6)
    expect(paid).toBeLessThanOrEqual(0.3 * 10e9)
    const sold = noticesTitled(g, 'Sold Out')
    expect(sold).toHaveLength(1)
    expect(sold[0]).toContain('Mina')

    // A second sale finds no company: nothing is paid and nothing is posted.
    const after = g.character.money
    expect(sellOwnShares(g, a.id, 0.5)).toBe(false)
    expect(sib.money - before).toBe(paid)
    expect(g.character.money).toBe(after)
    expect(noticesTitled(g, 'Sold Out')).toHaveLength(1)
    expect(noticesTitled(g, 'Sell Shares')).toEqual([])
  })

  it('the preview says what the sale does', () => {
    const g = founder()
    const { a, b } = listed(g, { marketCap: 10e9, share: 0.52 })
    const state = JSON.stringify(g)
    const rng = g.rng
    const last = `That's the last of your shares. ${a.name} leaves your companies.`

    expect(sellNote(g, a, b, 0.1)).toContain("You'd lose control of the board.")
    expect(sellNote(g, a, b, 0.01)).not.toContain("You'd lose control of the board.")
    expect(sellNote(g, a, b, 1)).toContain(last)
    expect(sellNote(g, a, b, 1)).not.toContain('lose control')
    expect(sellNote(g, a, b, 0.1)).not.toContain(last)
    expect(JSON.stringify(g)).toBe(state)
    expect(g.rng).toBe(rng)

    // A stored 0.6% is not rounded up to 1%: selling a fifth of it leaves under half a percent.
    b.share = 0.006
    const small = JSON.stringify(g)
    expect(sellNote(g, a, b, 0.2)).toContain(last)
    expect(sellNote(g, a, b, 0.1)).not.toContain(last)
    expect(JSON.stringify(g)).toBe(small)
    // Selling nothing from a stake that small still takes nothing away.
    b.share = 0.004
    expect(sellNote(g, a, b, 0)).not.toContain(last)
    expect(sellNote(g, a, b, 0.01)).toContain(last)

    // The proceeds in the note are the proceeds of the sale.
    const c = founder()
    const x = listed(c, { marketCap: 10e9, share: 0.6 })
    const note = sellNote(c, x.a, x.b, 0.1)
    expect(note).toMatch(/^About \S+ before \S+ tax\./)
    for (const f of [0, -1, NaN, 0.1, 0.5, 1, 7, Infinity]) {
      const text = sellNote(c, x.a, x.b, f)
      expect(text.startsWith('About '), String(f)).toBe(true)
      expect(text, String(f)).not.toMatch(/NaN|undefined|Infinity/)
    }
    // And for a record with no shares or no price.
    for (const hostile of [{ ...x.b, sharesOut: 0 }, { ...x.b, sharePrice: 0 }, { ...x.b, sharePrice: NaN }, { ...x.b, invested: NaN }]) {
      const text = sellNote(c, x.a, hostile, 0.3)
      expect(text.startsWith('About '), JSON.stringify([hostile.sharesOut, hostile.sharePrice, hostile.invested])).toBe(true)
      expect(text).not.toMatch(/NaN|undefined|Infinity/)
    }
  })

  it('leaves the tax out of the preview when there is none to pay', () => {
    const g = founder()
    const { a, b } = listed(g, { marketCap: 10e9, share: 0.6 })
    // A cost basis far above the proceeds: no gain, no tax.
    b.invested = 1e12
    const note = sellNote(g, a, b, 0.1)
    expect(note).toMatch(/^About \S+\.$/)
    expect(note).not.toMatch(/tax|\$0\b/)
    // A gain still shows its tax.
    b.invested = 1
    expect(sellNote(g, a, b, 0.1)).toMatch(/^About \S+ before \S+ tax\./)
    // The same with a sale that ends your ownership.
    b.invested = 1e12
    expect(sellNote(g, a, b, 1)).toMatch(/^About \S+\. That's the last of your shares\./)
  })

  it('refuses without selling', () => {
    // A fraction that is not a sale.
    for (const f of [0, -1, NaN, Infinity, -Infinity]) {
      const g = founder()
      const { a } = listed(g, { marketCap: 10e9 })
      const cash = g.character.money
      expect(sellOwnShares(g, a.id, f), String(f)).toBe(false)
      expect(yearActionsUsed(g, shareSaleKey(a.id))).toBe(0)
      expect(g.character.money).toBe(cash)
    }
    // No such company: no notice, no key.
    {
      const g = founder()
      listed(g, { marketCap: 10e9 })
      expect(sellOwnShares(g, 'nope', 0.5)).toBe(false)
      expect(g.queue.filter((m) => m.kind === 'notice')).toHaveLength(0)
      expect(g.yearActions).toEqual({})
    }
    // Private, in prison, a minor, dead, stake gone.
    {
      const g = founder()
      const { a, b } = privateCompany(g)
      expect(sellLimit(g, a, b)).toBe("It isn't listed.")
      expect(sellOwnShares(g, a.id, 0.5)).toBe(false)
      expect(noticesTitled(g, 'Sell Shares')).toEqual(["It isn't listed."])
      expect(yearActionsUsed(g, shareSaleKey(a.id))).toBe(0)
    }
    {
      const g = founder()
      const { a } = listed(g)
      g.character.prison = { name: 'State Pen', security: 'medium', crime: 'Theft', sentenceYears: 2, yearsServed: 0, respect: 20, appealed: false, escapeAttempts: 0 }
      const share = bizOf(g, a).share
      expect(sellOwnShares(g, a.id, 0.5)).toBe(false)
      expect(noticesTitled(g, 'Sell Shares')[0]).toMatch(/prison/)
      expect(bizOf(g, a).share).toBe(share)
      expect(yearActionsUsed(g, shareSaleKey(a.id))).toBe(0)
    }
    {
      const g = founder()
      const { a, b } = listed(g)
      g.character.age = 17
      expect(sellLimit(g, a, b)).toMatch(/18/)
      g.character.age = 45
      g.character.alive = false
      expect(sellLimit(g, a, b)).toBeTruthy()
    }
    {
      const g = founder()
      const { a, b } = listed(g, { share: 0 })
      expect(sellLimit(g, a, b)).toMatch(/no ownership stake/)
    }
    // Any exchange: a sale has no exchange check, as in Exit.
    {
      const g = founder(41, 'us', 50_000_000_000, 1946)
      const { a, b } = listed(g, { countryId: 'jp' })
      expect(sellLimit(g, a, b)).toBeNull()
    }
  })

  it('sells a stake under 1% as it is stored, and reads a frozen game', () => {
    // A company you hold 0.6% of, as a sale leaves it: a fifth of that leaves under half a percent.
    const g = founder()
    const { a, b } = listed(g, { marketCap: 10e9, share: 0.006 })
    expect(sellLimit(g, a, b)).toBeNull()
    const cash = g.character.money
    expect(sellOwnShares(g, a.id, 0.2)).toBe(true)
    expect(g.assets.some((x) => x.id === a.id)).toBe(false)
    expect(g.character.money).toBeGreaterThan(cash)

    // The notes read a frozen game without writing to it.
    const h = founder()
    const x = listed(h, { marketCap: 10e9 })
    deepFreeze(h)
    expect(() => {
      sellLimit(h, x.a, x.b)
      sellNote(h, x.a, x.b, 0.3)
    }).not.toThrow()
  })
})
