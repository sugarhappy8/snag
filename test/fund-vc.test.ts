// Investment Firms 2.0: venture capital. Pitches, diligence, the power-law portfolio, follow-ons,
// exits, unicorns, management fees and 20% carry, and the next fund's size.
import { describe, expect, it } from 'vitest'
import { diligence, investInPitch, passPitch, setFollowOn } from '../src/game/business/fund-actions'
import { fundNodes, simulateFundYear } from '../src/game/business/fund'
import { readFund, saveFund, type FundState, type Startup } from '../src/game/business/fund-state'
import { advanceVc, ddCost, gutRead, investingFund, newVcFund, openPitches, pitchesFor, raiseQuote, sectorsFor, VC_CARRY, VC_INVESTABLE } from '../src/game/business/fund-vc'
import { anachronismsIn } from '../src/game/events/era'
import { bizOf, readBiz } from '../src/game/business/state'
import { firm, menuText, walk } from './fund-fixtures'
import { makeTestGame } from './helpers'

describe('venture capital: pitches', () => {
  it('generates 3-5 pitches a year from a pure function of the firm and year', () => {
    const { g, b } = firm('vc', { year: 2015 })
    const f = readFund(b)
    const before = JSON.stringify(g), rng = g.rng
    const one = pitchesFor(g, b, f, 2015), two = pitchesFor(g, b, f, 2015)
    expect(one).toEqual(two)
    expect(one.length).toBeGreaterThanOrEqual(3)
    expect(one.length).toBeLessThanOrEqual(5)
    expect(JSON.stringify(g)).toBe(before)
    expect(g.rng).toBe(rng)
    expect(pitchesFor(g, b, f, 2016)).not.toEqual(one)
    // No fund investing, no pitches.
    const empty: FundState = { ...f, funds: [] }
    expect(pitchesFor(g, b, empty, 2015)).toEqual([])
    for (const p of one) {
      expect(p.ask).toBeGreaterThan(0)
      expect(p.pre).toBeGreaterThan(p.ask)
      expect(p.lo).toBeLessThanOrEqual(p.q)
      expect(p.hi).toBeGreaterThanOrEqual(p.q)
    }
  })

  it('keeps sectors and pitch text era-correct in every country', () => {
    expect(sectorsFor('us', 1950).map(s => s.id)).not.toContain('dotcom')
    expect(sectorsFor('us', 1999).map(s => s.id)).toContain('dotcom')
    expect(sectorsFor('us', 2020).map(s => s.id)).toContain('ai')
    expect(sectorsFor('us', 1975).map(s => s.id)).not.toContain('pc')
    for (const countryId of ['us', 'ng', 'jp', 'br', 'in', 'de']) {
      for (let year = 1946; year <= 2030; year += 3) {
        const { g, b } = firm('vc', { year, countryId, city: undefined, lifeId: `era-${countryId}-${year}` })
        for (const p of pitchesFor(g, b, readFund(b), year)) {
          for (const text of [p.name, p.line, p.founder, p.trait, p.sector]) expect(anachronismsIn(text, year, [countryId]), `${year} ${countryId}: ${text}`).toEqual([])
        }
      }
    }
  }, 60_000)

  it('invests LP money, charges diligence to the firm, and lets you pass', () => {
    const { g, a, b } = firm('vc', { year: 2015 })
    const cash = b.cash
    const [p1, p2, p3] = openPitches(g, b, readFund(b), 2015)
    const dryBefore = investingFund(readFund(b), 2015)!.dry
    expect(diligence(g, a.id, p1.id)).toBe(true)
    expect(diligence(g, a.id, p1.id)).toBe(false)
    let live = bizOf(g, a)
    expect(live.cash).toBe(cash - ddCost(live, p1.ask))
    expect(live.yearCosts).toBe(ddCost(live, p1.ask))
    expect(investInPitch(g, a.id, p1.id)).toBe(true)
    expect(investInPitch(g, a.id, p1.id)).toBe(false)
    live = bizOf(g, a)
    const f = readFund(live)
    expect(investingFund(f, 2015)!.dry).toBe(dryBefore - p1.ask)
    expect(live.cash).toBe(cash - ddCost(live, p1.ask))
    const c = f.cos.find(x => x.id === p1.id)!
    expect(c.cost).toBe(p1.ask)
    expect(c.own).toBeCloseTo(p1.ask / (p1.pre + p1.ask), 10)
    expect(passPitch(g, a.id, p2.id)).toBe(true)
    expect(openPitches(g, live, readFund(bizOf(g, a)), 2015).map(p => p.id)).not.toContain(p2.id)
    expect(openPitches(g, live, readFund(bizOf(g, a)), 2015).map(p => p.id)).toContain(p3.id)
    g.assets = []
    expect(investInPitch(g, a.id, p3.id)).toBe(false)
  })

  it('gives talents an honest, noisy read of the same hidden quality', () => {
    const g = makeTestGame(3, { age: 40 })
    expect(gutRead(g, 'x', 70)).toBe(gutRead(g, 'x', 70))
    let hi = 0, lo = 0
    for (let i = 0; i < 400; i++) { hi += gutRead(g, `p${i}`, 80); lo += gutRead(g, `p${i}`, 20) }
    expect(hi / 400 - lo / 400).toBeGreaterThan(55)
    const spread = Array.from({ length: 200 }, (_, i) => gutRead(g, `q${i}`, 50))
    expect(Math.max(...spread) - Math.min(...spread)).toBeGreaterThan(30)
  })
})

describe('venture capital: the portfolio', () => {
  function bookAll(seed: string, years = 16, pickAll = true) {
    const { g, a } = firm('vc', { year: 2000, lifeId: seed, cash: 3_000_000 })
    let revenue = 0, carryPaid = 0
    for (let y = 2000; y < 2000 + years; y++) {
      g.year = y
      if (pickAll) for (const p of openPitches(g, bizOf(g, a), readFund(bizOf(g, a)), y)) investInPitch(g, a.id, p.id)
      const live = bizOf(g, a)
      const before = readFund(live)
      const res = simulateFundYear(g, live, y, 0)
      live.yearCosts = 0
      const after = readFund(live)
      // Revenue is exactly this year's management fees plus new carry.
      const fees = after.funds.reduce((t, x) => t + x.fees, 0) - before.funds.reduce((t, x) => t + x.fees, 0)
      const carry = after.funds.reduce((t, x) => t + x.carry, 0) - before.funds.reduce((t, x) => t + x.carry, 0)
      expect(res.stmt.revenue).toBe(Math.round(fees + carry))
      revenue += fees + carry; carryPaid += carry
      for (const x of after.funds) {
        expect(x.carry).toBeCloseTo(VC_CARRY * Math.max(0, x.dist - x.size), 4)
        if (y - x.vintage < 9) expect(x.dry + x.reserve + x.invested + x.fees).toBeCloseTo(x.size, 2)
      }
    }
    return { g, a, f: readFund(bizOf(g, a)), revenue, carryPaid }
  }

  it('books fees and 20% carry above the LPs’ money, and keeps LP money out of company cash', () => {
    const { f, revenue } = bookAll('vc-books')
    expect(f.cos.length).toBeGreaterThan(8)
    expect(revenue).toBeGreaterThan(0)
  }, 30_000)

  it('is a power law: most bets fail, a few win big, unicorns are rare but real', () => {
    let dead = 0, resolved = 0, unicorns = 0, total = 0, bigWins = 0, carry = 0
    for (let i = 0; i < 24; i++) {
      const r = bookAll(`vc-power-${i}`, 15)
      for (const c of r.f.cos) {
        total++
        if (c.status !== 'live') resolved++
        if (c.status === 'dead') dead++
        if (c.unicorn) unicorns++
        if (c.got >= 10 * c.cost && c.cost > 0) bigWins++
      }
      carry += r.carryPaid
    }
    expect(dead / resolved).toBeGreaterThan(.5)
    expect(bigWins).toBeGreaterThan(0)
    expect(unicorns).toBeGreaterThan(0)
    expect(unicorns / total).toBeLessThan(.1)
    expect(carry).toBeGreaterThan(0)
  }, 120_000)

  it('closes follow-on rounds pro-rata or with dilution, as chosen', () => {
    const { g, a } = firm('vc', { year: 2010 })
    const b = bizOf(g, a), f = readFund(b)
    const make = (id: string, take: number): Startup => ({ id, name: id, emoji: '🚀', sector: 'Software', fund: 1, q: 60, stage: 1, val: 10e6, own: .1, cost: 1e6, born: 2005, status: 'live', end: 0, got: 0, how: '', round: { stage: 2, pre: 30e6, size: 10e6, year: 2010, take }, unicorn: false })
    f.cos.push(make('in', -1), make('out', -1))
    saveFund(b, f)
    expect(setFollowOn(g, a.id, 'in', true)).toBe(true)
    expect(setFollowOn(g, a.id, 'out', false)).toBe(true)
    expect(setFollowOn(g, a.id, 'nobody', true)).toBe(false)
    const live = bizOf(g, a), dry = readFund(live).funds[0].dry
    const v = readFund(live)
    advanceVc(g, live, v, 2010, false, false)
    const inCo = v.cos.find(c => c.id === 'in')!, outCo = v.cos.find(c => c.id === 'out')!
    expect(inCo.own).toBeCloseTo(.1, 10)
    expect(inCo.cost).toBe(2e6)
    expect(v.funds[0].dry).toBe(dry - 1e6)
    expect(outCo.own).toBeCloseTo(.1 * 30 / 40, 10)
    expect(outCo.val).toBe(40e6)
    expect(inCo.round).toBeNull()
  })

  it('sizes the next fund on the last one’s results', () => {
    const { g, b } = firm('vc', { year: 2000 })
    const f = readFund(b)
    expect(raiseQuote(g, b, f, 2001).block).toBeTruthy()
    const seasoned = (multiple: number): FundState => {
      const x = newVcFund(1, 30e6, 2000)
      x.dry = 3e6; x.invested = 24e6; x.fees = 3e6; x.dist = multiple * 27e6
      return { ...f, funds: [x], cos: [] }
    }
    const good = raiseQuote(g, b, seasoned(3), 2006), bad = raiseQuote(g, b, seasoned(.3), 2006)
    expect(good.block).toBeNull()
    expect(bad.block).toBeNull()
    expect(good.size).toBeGreaterThan(bad.size)
    expect(good.odds).toBeGreaterThan(bad.odds)
    expect(newVcFund(2, 10e6, 2006).dry).toBe(10e6 * VC_INVESTABLE)
  })

  it('renders the venture dashboard purely, pitches and portfolio included', () => {
    const { g, a } = firm('vc', { year: 2015, talent: 'Business' })
    const b = bizOf(g, a)
    const [p] = openPitches(g, b, readFund(b), 2015)
    investInPitch(g, a.id, p.id)
    const f = readFund(bizOf(g, a))
    f.cos[0].round = { stage: 1, pre: 50e6, size: 10e6, year: 2016, take: -1 }
    saveFund(bizOf(g, a), f)
    const before = JSON.stringify(g), rng = g.rng
    expect(walk(g, fundNodes(g, a))).toBeGreaterThan(10)
    for (const text of menuText(g, fundNodes(g, a))) expect(text.length, text).toBeLessThanOrEqual(text.startsWith('🔮') ? 220 : 140)
    expect(JSON.stringify(g)).toBe(before)
    expect(g.rng).toBe(rng)
    expect(readBiz(g, a).cash).toBe(b.cash)
  })
})
