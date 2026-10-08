// Strategy beyond the classic four: entering countries (export / partner / subsidiary), brand
// campaigns, defending home, supply chains and patent cross-licences. Every move has a cost, a
// term, tariffs that eat into it and diminishing returns; none is free share or a money loop, and
// the quotes the menus and purple hints show are the numbers the actions use.
import { describe, expect, it } from 'vitest'
import { antitrustChance, antitrustOf, marketOfBiz, marketViewOf, saveMarket } from '../src/game/business/competition'
import { effectiveRegime } from '../src/game/business/competition-data'
import { acquireRival, acquisitionQuote } from '../src/game/business/competition-moves'
import { marketCtxFor } from '../src/game/business/economy'
import { campaignStrength, entryStrength, MODE_TERM, presenceIn, REACH_CAP, reachOf, termFactor } from '../src/game/business/market-reach'
import { barriersInto, blocsOf, fxExposure, goodsShare, otherBarriers, sharedBloc, tariffOn } from '../src/game/business/market-trade'
import { entryEligibility, quoteCampaign, quoteDefend, quoteEnter, quoteLicense, quoteSupply, runCampaign, runDefend, runEnter, runLicense, runSupply } from '../src/game/business/market-strategy'
import { techOf } from '../src/game/business/deeptech-core'
import { bizWorth } from '../src/game/business/economy'
import { bizOf, readBiz } from '../src/game/business/state'
import type { Industry } from '../src/game/data/markets'
import type { Asset, GameState } from '../src/game/types'
import { adult, company, nextYear } from './market-kit'

function setup(ind: Industry, country = 'us', year = 2015, years = 2): { g: GameState; a: Asset } {
  const g = adult(7, year, country)
  const a = company(g, ind, { cash: 200_000_000 })
  for (let i = 0; i < years; i++) nextYear(g)
  g.yearActions = {}
  return { g, a }
}

describe('trade model', () => {
  it('has no tariffs inside the EU single market, the North American area or ASEAN, and high ones in the 1950s', () => {
    expect(tariffOn('fr', 'de', 2000)).toBe(0)
    expect(sharedBloc('fr', 'de', 1960)).toBeNull()
    expect(sharedBloc('fr', 'de', 1970)).toBe('eu')
    expect(tariffOn('us', 'ca', 1995)).toBe(0)
    expect(tariffOn('us', 'ca', 1980)).toBeGreaterThan(0)
    expect(tariffOn('th', 'my', 2000)).toBe(0)
    expect(tariffOn('ch', 'de', 2000)).toBe(0)
    expect(blocsOf('gb', 2015)).toContain('eu')
    expect(blocsOf('gb', 2022)).not.toContain('eu')
    expect(tariffOn('us', 'in', 1955)).toBeGreaterThan(tariffOn('us', 'in', 2020))
    expect(tariffOn('us', 'in', 2020)).toBeGreaterThan(tariffOn('us', 'ca', 2020))
    expect(tariffOn('us', 'cn', 2019)).toBeGreaterThan(tariffOn('us', 'cn', 2012))
    expect(tariffOn('us', 'us', 2020)).toBe(0)
    for (const y of [1900, 1950, 1990, 2026]) for (const [a, b] of [['us', 'jp'], ['cn', 'br'], ['ng', 'za']]) {
      const t = tariffOn(a, b, y)
      expect(t >= 0 && t <= 0.6 && Number.isFinite(t)).toBe(true)
    }
  })

  it('weights tariffs by physical goods, rates barriers and currency exposure sensibly', () => {
    expect(goodsShare('manufacturing')).toBeGreaterThan(goodsShare('software'))
    const soft = barriersInto('us', 'in', 'software', 2020)
    const mfg = barriersInto('us', 'in', 'manufacturing', 2020)
    expect(mfg.effective).toBeGreaterThan(soft.effective)
    expect(['open', 'moderate', 'restrictive', 'closed']).toContain(mfg.label)
    expect(otherBarriers('cn', 1970)).toBe(1)
    expect(fxExposure('fr', 'de', 2010).shared).toBe(true)
    expect(fxExposure('us', 'jp', 2015).label).not.toBe('none')
    expect(fxExposure('us', 'us', 2015).label).toBe('none')
  })
})

describe('reach: terms, caps and diminishing returns', () => {
  it('ramps over three years, holds through the term, fades over two more, then is gone', () => {
    expect(termFactor(2000, 2001, 2005)).toBe(0)
    expect(termFactor(2001, 2001, 2005)).toBeCloseTo(1 / 3, 5)
    expect(termFactor(2003, 2001, 2005)).toBe(1)
    expect(termFactor(2006, 2001, 2005)).toBeCloseTo(0.6, 5)
    expect(termFactor(2007, 2001, 2005)).toBeCloseTo(0.3, 5)
    expect(termFactor(2008, 2001, 2005)).toBe(0)
  })

  it('never lets reach pass its cap, however many countries and campaigns', () => {
    const { g, a } = setup('software')
    const b = bizOf(g, a)
    const st = marketOfBiz(b)
    for (const c of ['cn', 'in', 'jp', 'de', 'gb', 'fr', 'kr', 'br', 'ru', 'ca', 'au', 'mx']) {
      st.entries.push({ country: c, home: 'us', mode: 'sub', year: g.year - 5, until: g.year + 10 })
      st.campaigns.push({ country: c, home: 'us', year: g.year - 5, until: g.year + 10 })
    }
    st.campaigns.push({ country: 'us', home: 'us', year: g.year - 5, until: g.year + 10 })
    st.defendUntil = g.year + 5
    const r = reachOf(st, b.industry, g.year)
    expect(r).toBeGreaterThan(1.2)
    expect(r).toBeLessThanOrEqual((1 + REACH_CAP) * 1.05 + 1e-9)
  })

  it('gives each extra country less than the one before', () => {
    const { g, a } = setup('software')
    const b = bizOf(g, a)
    const base = marketOfBiz(b)
    const gains: number[] = []
    let prev = reachOf(base, b.industry, g.year + 3)
    const order = ['cn', 'jp', 'de', 'gb', 'in']
    const st = marketOfBiz(b)
    for (const c of order) {
      st.entries.push({ country: c, home: 'us', mode: 'sub', year: g.year, until: g.year + 14 })
      const r = reachOf(st, b.industry, g.year + 3)
      gains.push(r - prev)
      prev = r
    }
    expect(gains.every((x) => x > 0)).toBe(true)
    // Entering the biggest market first beats entering a small one first, and the sum saturates.
    expect(gains[0]).toBeGreaterThan(gains[gains.length - 1])
    expect(prev).toBeLessThan(1 + REACH_CAP)
  })

  it('makes exporters pay the tariff in full, partners some of it and a local subsidiary least', () => {
    const tariffed = { country: 'in', home: 'us', year: 2020, until: 2030 } as const
    const exp = entryStrength({ ...tariffed, mode: 'export' }, 'manufacturing', 2023)
    const jv = entryStrength({ ...tariffed, mode: 'jv' }, 'manufacturing', 2023)
    const sub = entryStrength({ ...tariffed, mode: 'sub' }, 'manufacturing', 2023)
    expect(exp).toBeLessThan(jv)
    expect(jv).toBeLessThan(sub)
    // Services ignore tariffs; diversified supply chains ease them for goods.
    expect(entryStrength({ ...tariffed, mode: 'export' }, 'software', 2023)).toBeGreaterThan(exp)
    expect(entryStrength({ ...tariffed, mode: 'export' }, 'manufacturing', 2023, 2030)).toBeGreaterThan(exp)
  })
})

describe('moves: costs, limits and the share model', () => {
  it('entering a country costs cash, lifts the pull the share model sees, and ramps up', () => {
    const { g, a } = setup('software')
    const b = bizOf(g, a)
    const v = marketViewOf(g, b)
    const q = quoteEnter(g, b, v, 'de', 'jv')!
    expect(q.block).toBeNull()
    expect(q.cost).toBeGreaterThan(0)
    expect(q.path.length).toBeGreaterThan(5)
    expect(q.path[0]).toBeGreaterThanOrEqual(1)
    expect(q.path[3]).toBeGreaterThan(q.path[0])
    const cash = b.cash
    const edge0 = marketCtxFor(g, readBiz(g, a), g.year).edge
    expect(runEnter(g, a, b, 'de', 'jv')).toBe(true)
    const after = bizOf(g, a)
    expect(cash - after.cash).toBe(q.cost)
    expect(marketCtxFor(g, readBiz(g, a), g.year).edge).toBeGreaterThan(edge0)
    // The quote's multiplier is the one the share model then uses.
    expect(marketCtxFor(g, readBiz(g, a), g.year).edge / edge0).toBeCloseTo(q.path[0], 3)
    expect(marketOfBiz(after).entries).toHaveLength(1)
    // A third of the strength in year one, all of it by year three.
    const e = marketOfBiz(after).entries[0]
    expect(entryStrength(e, after.industry, g.year)).toBeLessThan(entryStrength(e, after.industry, g.year + 2))
  })

  it('refuses the home market, banned or closed places, repeats, a broke company and a third entry in a year', () => {
    const { g, a } = setup('software')
    const b = bizOf(g, a)
    const v = marketViewOf(g, b)
    expect(entryEligibility(b, v, 'us')).toMatch(/home/i)
    const poor = quoteEnter(g, { ...b, cash: 10 }, v, 'de', 'sub')!
    expect(poor.block).toMatch(/cash/)
    expect(runEnter(g, a, b, 'de', 'export')).toBe(true)
    expect(quoteEnter(g, bizOf(g, a), v, 'de', 'export')!.block).toMatch(/Already/)
    expect(runEnter(g, a, bizOf(g, a), 'fr', 'export')).toBe(true)
    const cash = bizOf(g, a).cash
    expect(runEnter(g, a, bizOf(g, a), 'jp', 'export')).toBe(false)
    expect(bizOf(g, a).cash).toBe(cash)
    // A local trade has no countries to enter: it opens outlets abroad instead.
    const r = setup('restaurant', 'jp', 2012)
    expect(entryEligibility(bizOf(r.g, r.a), marketViewOf(r.g, bizOf(r.g, r.a)), 'us')).toMatch(/Expansion|outlet/i)
  })

  it('upgrading an entry is allowed, repeating the same one is not, and terms end', () => {
    const { g, a } = setup('software')
    runEnter(g, a, bizOf(g, a), 'gb', 'export')
    g.yearActions = {}
    const b = bizOf(g, a)
    const v = marketViewOf(g, b)
    expect(quoteEnter(g, b, v, 'gb', 'sub')!.block).toBeNull()
    expect(runEnter(g, a, b, 'gb', 'sub')).toBe(true)
    const st = marketOfBiz(bizOf(g, a))
    expect(st.entries.filter((e) => e.country === 'gb')).toHaveLength(1)
    expect(st.entries[0].until).toBe(g.year + MODE_TERM.sub - 1)
    // An export deal made now has fully lapsed after its term and two years of fade.
    const old = { country: 'gb', home: 'us', mode: 'export' as const, year: 2000, until: 2003 }
    expect(entryStrength(old, 'software', 2003)).toBeGreaterThan(0)
    expect(entryStrength(old, 'software', 2006)).toBe(0)
  })

  it('brand campaigns and home defence cost cash, last three years, and do not stack for free', () => {
    const { g, a } = setup('software')
    const b = bizOf(g, a)
    const v = marketViewOf(g, b)
    const q = quoteCampaign(g, b, v, 'us')!
    expect(q.cost).toBeGreaterThan(0)
    expect(q.block).toBeNull()
    expect(q.path[1]).toBeGreaterThan(1)
    const cash = b.cash
    expect(runCampaign(g, a, b, 'us')).toBe(true)
    expect(cash - bizOf(g, a).cash).toBe(q.cost)
    expect(quoteCampaign(g, bizOf(g, a), v, 'us')!.block).toMatch(/already running/)
    const st = marketOfBiz(bizOf(g, a))
    expect(campaignStrength(st.campaigns[0], g.year + 5)).toBe(0)
    // Defence: once per term.
    const d = quoteDefend(g, bizOf(g, a))
    expect(d.block).toBeNull()
    expect(runDefend(g, a, bizOf(g, a))).toBe(true)
    expect(quoteDefend(g, bizOf(g, a)).block).toMatch(/hold/)
    expect(reachOf(marketOfBiz(bizOf(g, a)), 'software', g.year)).toBeGreaterThan(1.04)
  })

  it('campaigns only work at home for a local trade, and help a world business more where it already sells', () => {
    const r = setup('restaurant', 'jp', 2012)
    const rb = bizOf(r.g, r.a)
    const rv = marketViewOf(r.g, rb)
    expect(quoteCampaign(r.g, rb, rv, 'us')!.block).toMatch(/home country/)
    expect(quoteCampaign(r.g, rb, rv, 'jp')!.block).toBeNull()
    const { g, a } = setup('software')
    const b = bizOf(g, a)
    const st = marketOfBiz(b)
    const cold = presenceIn({ ...st, campaigns: [{ country: 'de', home: 'us', year: g.year, until: g.year + 2 }] }, 'software', 'de', 'us', g.year + 2)
    const warm = presenceIn({ ...st, entries: [{ country: 'de', home: 'us', mode: 'sub', year: g.year - 3, until: g.year + 9 }], campaigns: [{ country: 'de', home: 'us', year: g.year, until: g.year + 2 }] }, 'software', 'de', 'us', g.year + 2)
    expect(warm).toBeGreaterThan(cold)
  })

  it('diversified supply chains cost cash and only exist for businesses with goods to ship', () => {
    const sw = setup('software')
    expect(quoteSupply(sw.g, bizOf(sw.g, sw.a)).cost).toBeGreaterThan(0)
    const m = setup('manufacturing', 'us', 2015)
    const b = bizOf(m.g, m.a)
    const q = quoteSupply(m.g, b)
    expect(q.block).toBeNull()
    const cash = b.cash
    expect(runSupply(m.g, m.a, b)).toBe(true)
    expect(cash - bizOf(m.g, m.a).cash).toBe(q.cost)
    expect(marketOfBiz(bizOf(m.g, m.a)).supplyUntil).toBe(m.g.year + 4)
    expect(quoteSupply(m.g, bizOf(m.g, m.a)).block).toMatch(/already/)
  })

  it('patent cross-licences are for deep tech: they cost money, lift your tech, strengthen the partner and are watched', () => {
    const sw = setup('software')
    expect(quoteLicense(sw.g, bizOf(sw.g, sw.a), marketViewOf(sw.g, bizOf(sw.g, sw.a)), 'x')).toBeNull()
    const { g, a } = setup('semiconductor', 'us', 1995)
    const b = bizOf(g, a)
    const v = marketViewOf(g, b)
    const rival = v.rivals.find((r) => !r.legacy)!
    const q = quoteLicense(g, b, v, rival.id)!
    expect(q.block).toBeNull()
    const level = techOf(b).level
    const quality = b.quality
    const cash = b.cash
    expect(runLicense(g, a, b, rival.id)).toBe(true)
    const after = bizOf(g, a)
    expect(techOf(after).level).toBeGreaterThan(level)
    expect(after.quality).toBeGreaterThan(quality)
    expect(cash - after.cash).toBe(q.cost)
    const st = marketOfBiz(after)
    expect(st.mods[rival.id].mult).toBeGreaterThan(1)
    expect(st.deals).toHaveLength(1)
    expect(quoteLicense(g, after, v, rival.id)!.block).toMatch(/already share/)
    g.yearActions = {}
    expect(runLicense(g, a, after, rival.id)).toBe(false)
  })

  it('a dominant company cannot cross-license with the runner-up (regulators would call it collusion)', () => {
    const { g, a } = setup('semiconductor', 'us', 1995)
    const b = bizOf(g, a)
    const st = marketOfBiz(b)
    st.year = g.year - 1
    st.share = 0.5
    st.base = 0.5
    const v0 = marketViewOf(g, b)
    st.rivals = v0.rivals.slice(0, 3).map((r, i): [string, number] => [r.id, [0.2, 0.1, 0.05][i]])
    saveMarket(b, st)
    const b2 = bizOf(g, a)
    const v = marketViewOf(g, b2)
    const q = quoteLicense(g, b2, v, v.rivals[0].id)!
    expect(q.block).toMatch(/collusion/)
  })
})

describe('moves are priced by the prize and wasted without capacity', () => {
  it('a bigger prize costs more: the price follows the revenue a move adds, so no giant slice for a rounding error', () => {
    const { g, a } = setup('software')
    const b = bizOf(g, a)
    const v = marketViewOf(g, b)
    const small = quoteEnter(g, b, v, 'cn', 'sub')!
    // Same company, ten times the sales.
    const big = bizOf(g, a)
    big.last = { ...big.last!, revenue: big.last!.revenue * 10, netRevenue: big.last!.netRevenue * 10, sold: big.last!.sold * 10, demand: big.last!.demand * 10 }
    const bigQuote = quoteEnter(g, big, v, 'cn', 'sub')!
    expect(bigQuote.cost).toBeGreaterThan(small.cost * 3)
    const w = bizWorth(g, big)
    const peak = Math.max(...bigQuote.path)
    expect(bigQuote.cost).toBeGreaterThanOrEqual(Math.round(1.2 * w.revenue * (peak - 1)) - 1)
    // A subsidiary costs more than a partnership, which costs more than exporting.
    const jv = quoteEnter(g, big, v, 'cn', 'jv')!
    const ex = quoteEnter(g, big, v, 'cn', 'export')!
    expect(bigQuote.cost).toBeGreaterThan(jv.cost)
    expect(jv.cost).toBeGreaterThan(ex.cost)
  })

  it('wastes extra pull on a company that cannot serve more customers', () => {
    const { g, a } = setup('software')
    const b = bizOf(g, a)
    const v = marketViewOf(g, b)
    const free = quoteCampaign(g, b, v, 'us')!
    expect(free.value + free.cost).toBeGreaterThan(0)
    // Demand far beyond capacity: nothing more can be sold, so the campaign only costs money.
    b.last = { ...b.last!, demand: b.last!.demand * 1000 }
    const full = quoteCampaign(g, b, v, 'us')!
    expect(full.value + full.cost).toBeLessThan(free.value + free.cost)
    expect(full.value + full.cost).toBeLessThan(1)
  })
})

describe('antitrust grows with dominance, buy-outs and local dominance abroad', () => {
  it('notices a string of buy-outs and lowers the share regulators care about', () => {
    const reg = effectiveRegime('us', 1995, true)
    const p0 = antitrustChance(reg, 0.32, 1, false, 5e9, 0)
    const p2 = antitrustChance(reg, 0.32, 1, false, 5e9, 2)
    expect(p0).toBe(0)
    expect(p2).toBeGreaterThan(0)
    const base = antitrustChance(reg, 0.5, 1, false, 5e9, 0)
    expect(antitrustChance(reg, 0.5, 1, false, 5e9, 3)).toBeGreaterThan(base)
    expect(antitrustChance(reg, 0.5, 1, false, 5e9, 99)).toBeLessThan(0.41)
    expect(antitrustChance(reg, 0.5, 1, true, 5e9, 3)).toBeLessThan(antitrustChance(reg, 0.5, 1, false, 5e9, 3))
  })

  it('records every buy-out and shows it on the overview exposure', () => {
    const { g, a } = setup('restaurant', 'jp', 2012)
    const b = bizOf(g, a)
    const v = marketViewOf(g, b)
    const small = v.rivals.filter((r) => !r.real).sort((x, y) => x.share - y.share)[0]
    const q = acquisitionQuote(g, b, small.id)!
    expect(q).toBeTruthy()
    b.cash = q.price * 3
    expect(acquireRival(g, a, b, small.id)).toBe(true)
    const after = bizOf(g, a)
    expect(marketOfBiz(after).acquired).toContain(g.year)
    expect(antitrustOf(after, 0.5, g.year).acquisitions).toBe(1)
  })
})
