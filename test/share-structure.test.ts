// Share count, IPO float and retail demand (v2.4.0).
import { describe, expect, it } from 'vitest'
import { makeTestGame } from './helpers'
import { goPublic, ipoPreview } from '../src/game/business/exit'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { setShareCount } from '../src/game/business/rescue'
import { DEFAULT_SHARES, ipoPlan, MAX_SHARES, MIN_SHARES, retailAppeal, retailDepth, retailVerdict, shareCountText } from '../src/game/business/share-structure'
import { bizOf, readBiz } from '../src/game/business/state'
import { valuationOf } from '../src/game/business/economy'
import { runScript } from '../src/game/scripts'
import { foundingSliderPreview } from '../src/game/business/founding'
import type { GameState } from '../src/game/types'

function company(g: GameState) {
  const a = createBusinessAsset(g, 'Share Co', newBiz(g, 'software', 'us', 'Chicago', { cash: 5_000_000 }), 1e6)
  g.assets.push(a)
  const b = bizOf(g, a)
  b.history = [2023, 2024, 2025].map((year) => ({ year, revenue: 120e6, profit: 30e6, tax: 0, units: 1e6, price: 120, staff: 300, valuation: 0, outlets: 1 }))
  return { a, b }
}

describe('retail investors and the price of one share', () => {
  it('like affordable shares, cool on expensive ones, and distrust penny stocks', () => {
    expect(retailAppeal(10)).toBeGreaterThan(retailAppeal(500))
    expect(retailAppeal(500)).toBeGreaterThan(retailAppeal(20_000))
    expect(retailAppeal(0.05)).toBeLessThan(retailAppeal(5))
    expect(retailVerdict(0.2)).toContain('penny stock')
    expect(retailVerdict(12)).toContain('love')
    expect(retailVerdict(50_000)).toContain('too expensive')
    // The old listing price keeps today's market depth.
    expect(retailDepth(25)).toBeCloseTo(1, 9)
    expect(retailDepth(5)).toBeGreaterThan(1)
    expect(retailDepth(5000)).toBeLessThan(1)
  })

  it('writes share counts in words', () => {
    expect([25_000, 10_000_000, 1_200_000_000, 10_000_000_000].map(shareCountText)).toEqual(['25,000', '10 million', '1.2 billion', '10 billion'])
  })
})

describe('an IPO of a chosen float', () => {
  it('conserves ownership and money, and more shares mean more buyers', () => {
    const pre = 300e6
    for (const float of [5, 25, 60]) {
      const p = ipoPlan(pre, DEFAULT_SHARES, float)
      expect(p.sharesOut).toBe(p.baseShares + p.sold)
      expect(p.retain).toBeCloseTo(p.baseShares / p.sharesOut, 12)
      expect(p.raise).toBe(Math.round(p.sold * p.price))
      expect(p.fees).toBe(Math.round(p.raise * 0.06))
      if (p.coverage >= 1) expect(1 - p.retain).toBeCloseTo(float / 100, 3)
    }
    // Same company, same float: $30 shares sell far better than $30,000 shares.
    const cheap = ipoPlan(pre, 10_000_000, 25), dear = ipoPlan(pre, 10_000, 25)
    expect(cheap.basePrice).toBeCloseTo(30)
    expect(cheap.coverage).toBeGreaterThan(dear.coverage)
    expect(cheap.raise).toBeGreaterThan(dear.raise)
    expect(cheap.premium).toBeGreaterThan(0)
    expect(dear.coverage).toBeLessThan(1)
    expect(dear.sold).toBeLessThan(dear.offered)
    // A bigger float is harder to fill; a booming market fills more.
    expect(ipoPlan(pre, DEFAULT_SHARES, 60).coverage).toBeLessThan(ipoPlan(pre, DEFAULT_SHARES, 10).coverage)
    expect(ipoPlan(pre, DEFAULT_SHARES, 25, 1.3).coverage).toBeGreaterThan(ipoPlan(pre, DEFAULT_SHARES, 25, 0.7).coverage)
    // Old saves (no count) list at about $25 a share.
    expect(ipoPlan(pre, null, 25).basePrice).toBeCloseTo(25, 0)
  })

  it('lists the chosen float, keeps the share count and pays the company', () => {
    const g = makeTestGame(51, { age: 40, money: 1e6 })
    const { a, b } = company(g)
    b.shareCount = 20_000_000
    const cash = b.cash, pre = valuationOf(b)
    expect(ipoPreview(g, b, 40)).toMatch(/new shares at about .*You'd keep 6\d\.\d%|new shares at about .*You'd keep 5\d\.\d%/)
    goPublic(g, a, b, 40)
    const plan = ipoPlan(pre, 20_000_000, 40, 1)
    expect(b.public).toBe(true)
    expect(b.shareCount).toBeUndefined()
    expect(b.sharesOut).toBeGreaterThan(20_000_000)
    expect(b.share).toBeCloseTo(20_000_000 / b.sharesOut, 6)
    expect(b.cash - cash).toBeGreaterThan(0)
    expect(b.cash - cash).toBeLessThanOrEqual(plan.raise * 1.5)
    const ipo = g.queue.find((q) => q.kind === 'notice' && q.title === 'IPO Day!')
    expect(ipo && ipo.kind === 'notice' ? ipo.text : '').toMatch(/shares are listed/)
  })

  it('keeps 25% as the default float', () => {
    const g = makeTestGame(52, { age: 40, money: 1e6 })
    const { a, b } = company(g)
    goPublic(g, a, b)
    expect(b.share).toBeCloseTo(0.75, 2)
  })
})

describe('choosing the share count', () => {
  it('is asked at founding, right after the starting capital, and kept on the company', () => {
    const g = makeTestGame(53, { age: 30, money: 5e6 })
    g.character.countryId = 'us'
    const plan = { mode: 'found', industry: 'bakery', name: 'Crumb Co', city: 'Chicago', countryId: 'us', funding: 'savings', loan: 0, rate: 0, lender: '', investor: 0, equity: 0, investorName: '', extraFees: 0, days: 7, listingId: '', noLoan: false, cofounder: '', expert: false, seed: 0, seedEquity: 0, seedInvestor: '' }
    runScript(g, 'business.found.capital', '500000', plan, undefined as never)
    const ask = g.queue.find((q) => q.kind === 'input' && q.scriptId === 'business.found.shares')
    expect(ask && ask.kind === 'input' ? [ask.min, ask.max, ask.defaultValue] : []).toEqual([MIN_SHARES, MAX_SHARES, String(DEFAULT_SHARES)])
    const preview = foundingSliderPreview(g, 'business.found.shares', ask && ask.kind === 'input' ? ask.data : undefined)!
    expect(preview(1_000_000)).toMatch(/^1 million shares: about .* each at the start\. If it grows big enough to list/)
    expect(foundingSliderPreview(g, 'business.found.capital', plan)).toBeTypeOf('function')
    g.queue = []
    runScript(g, 'business.found.shares', '2500000', ask && ask.kind === 'input' ? ask.data : plan, undefined as never)
    // On to the funding choice, carrying the share count.
    const next = g.queue[0]
    expect(next?.kind).toBe('choice')
    expect(JSON.stringify(next && 'data' in next ? next.data : {})).toContain('"shares":2500000')
  })

  it('can be changed while private, never changing ownership', () => {
    const g = makeTestGame(54, { age: 40, money: 1e6 })
    const { a, b } = company(g)
    b.share = 0.8
    expect(setShareCount(g, a.id, 123_456_789)).toBe(true)
    expect(readBiz(g, a).shareCount).toBe(123_456_789)
    expect(readBiz(g, a).share).toBe(0.8)
    b.public = true
    expect(setShareCount(g, a.id, 5_000)).toBe(false)
    // Saves keep it; a listed company drops it for sharesOut.
    const back = readBiz(JSON.parse(JSON.stringify(g)), a)
    expect(back.shareCount).toBeUndefined()
  })
})
