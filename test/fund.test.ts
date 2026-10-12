// Investment Firms 2.0: books, money conservation, the four firm types, migration of old saves,
// purity of menus and hints, the hired CEO and the end of the perfect-foresight exploit.
import { describe, expect, it } from 'vitest'
import { seeded } from '../src/game/assets'
import { becomeCeo, installManager, managerCandidate } from '../src/game/business/career'
import { valuationOf } from '../src/game/business/economy'
import { financeManagerTurn, simulateFinanceYear } from '../src/game/business/finance-firm'
import { createBusinessAsset, newBiz, startFounding } from '../src/game/business/founding'
import { fundCapitalNeed, fundClientAssets, fundInfo, fundManagerTurn, fundNodes, fundSettledYear, simulateFundYear } from '../src/game/business/fund'
import { algoBlock, inventAlgorithm, runCampaign, setCall, setCommission, setFee, setHedgeTerms, setStrategy, setStyle } from '../src/game/business/fund-actions'
import { callHint, gutCall } from '../src/game/business/fund-events'
import { fundAutopilot } from '../src/game/business/fund-manager'
import { brokerEra, callPayoff, financingCost, hedgeGross, marketMove, marketYearOf, quantBlock, styleBlock, STYLES } from '../src/game/business/fund-model'
import { bestCommission, bestFee, brokerOutlook, feeOutlook, phi, styleOutlook } from '../src/game/business/fund-outlook'
import { readFund, saveFund, type FundState, type FundType } from '../src/game/business/fund-state'
import { bizOf, findBusiness, normalizeBiz, readBiz, type BizState } from '../src/game/business/state'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import { marketInstinct } from '../src/game/invest/instinct'
import { runScript } from '../src/game/scripts'
import type { GameState, Json } from '../src/game/types'
import { ageBusinessYear, allFinite, drain, firm, menuText, walk } from './fund-fixtures'
import { makeTestGame } from './helpers'

const TYPES: FundType[] = ['asset', 'hedge', 'vc', 'broker']

/** One fiscal year for a detached firm, like yearly.ts does it (manager, books, manager). */
function bookYear(g: GameState, b: BizState, fiscal: number, autopilot = true): { net: number; booked: number; cashBefore: number; cashAfter: number } {
  g.year = fiscal + 1
  if (b.ceo === 'manager') fundManagerTurn(g, b)
  const cashBefore = b.cash, booked = b.yearCosts - b.yearIncome
  const res = simulateFundYear(g, b, fiscal, 0)
  const cashAfter = b.cash
  b.yearCosts = 0; b.yearIncome = 0
  if (autopilot) fundManagerTurn(g, b)
  return { net: res.stmt.net, booked, cashBefore, cashAfter }
}

describe('Investment firms 2.0: books and money', () => {
  it('books fees, never client money, and settles a year exactly once', () => {
    for (const type of TYPES) {
      const { g, b } = firm(type)
      b.yearCosts = 20_000; b.cash -= 20_000
      const cash = b.cash
      const res = simulateFundYear(g, b, g.year, 30_000)
      expect(b.cash).toBe(cash + res.stmt.net + 20_000)
      expect(res.stmt.ownerPay).toBe(30_000)
      expect(res.stmt.strategicIncome).toBe(0)
      expect(res.market).toBeNull()
      expect(res.bank).toBeUndefined()
      expect(b.production).toBe(0)
      expect(b.inventory).toBe(0)
      const f = readFund(b)
      expect(res.stmt.revenue).toBe(Math.round(f.last.fees + Math.max(0, f.last.own)))
      const settled = JSON.stringify(b)
      simulateFundYear(g, b, g.year, 30_000)
      expect(JSON.stringify(b)).toBe(settled)
      expect(fundSettledYear(b)).toBe(g.year)
    }
  })

  it('values the firm on its own profits and cash, not on clients’ money', () => {
    for (const type of TYPES) {
      const { b } = firm(type)
      const value = valuationOf(b), f = readFund(b)
      f.aum *= 50
      for (const x of f.funds) { x.dry *= 50; x.size *= 50 }
      saveFund(b, f)
      expect(valuationOf(b)).toBe(value)
      expect(fundClientAssets(b)).toBeGreaterThan(0)
    }
  })

  it('conserves money every year for thirty years (cash moves only by booked profit)', () => {
    for (const type of TYPES) {
      const { g, b } = firm(type, { year: 1990, skill: 70, cash: 3_000_000 })
      let sumNet = 0
      const start = b.cash
      for (let y = 1990; y < 2020; y++) {
        const r = bookYear(g, b, y)
        // Spending decided after the books (campaigns, diligence) is out of cash and booked next year.
        expect(r.cashAfter).toBe(r.cashBefore + r.net + r.booked)
        sumNet += r.net
        expect(allFinite(b)).toBe(true)
      }
      // Over the whole run the firm's cash moved by exactly its booked profits, less this year's
      // already-paid (and not yet booked) costs.
      expect(b.cash).toBe(start + sumNet - b.yearCosts)
    }
  }, 60_000)

  it('stays finite for 65 years across countries and eras', () => {
    const cases: [FundType, string, number][] = []
    for (const country of ['us', 'jp', 'ng', 'de', 'br', 'in']) {
      cases.push(['asset', country, 1925], ['broker', country, 1930], ['hedge', country, 1955], ['vc', country, 1960], ['asset', country, 1990], ['hedge', country, 2000], ['vc', country, 2010], ['broker', country, 1995])
    }
    for (const [type, countryId, year] of cases) {
      const { g, b } = firm(type, { year, countryId, city: undefined, skill: 60, lifeId: `finite-${countryId}-${year}` })
      for (let y = year; y < year + 65; y++) {
        bookYear(g, b, y)
        const f = readFund(b)
        expect(f.aum).toBeGreaterThanOrEqual(0)
        expect(f.accounts).toBeGreaterThanOrEqual(0)
        for (const x of f.funds) expect(x.dry).toBeGreaterThanOrEqual(0)
      }
      expect(allFinite(b)).toBe(true)
      expect(allFinite(JSON.parse(JSON.stringify(b)))).toBe(true)
    }
  }, 240_000)

  it('keeps a starting firm with normal settings viable for an owner', () => {
    for (const type of TYPES) {
      let alive = 0
      for (let i = 0; i < 12; i++) {
        const { g, b } = firm(type, { year: 2000, cash: 400_000, lifeId: `viable-${i}` })
        let lowest = b.cash
        for (let y = 2000; y < 2010; y++) { bookYear(g, b, y, type === 'vc'); lowest = Math.min(lowest, b.cash) }
        if (lowest > 0) alive++
      }
      expect({ type, alive }).toMatchObject({ type, alive: expect.any(Number) })
      expect(alive, type).toBeGreaterThanOrEqual(9)
    }
  }, 60_000)
})

describe('Investment firms 2.0: the asset manager', () => {
  it('earns its fee on AUM and ranks against peers', () => {
    const { g, b } = firm('asset')
    const f0 = readFund(b)
    simulateFundYear(g, b, 2026, 0)
    const f = readFund(b)
    expect(f.last.rank).toBeGreaterThanOrEqual(0)
    expect(f.last.rank).toBeLessThanOrEqual(1)
    expect(f.last.market).toBe(marketMove(g, 'us', marketYearOf(2026)))
    // The fee is charged on the clients' assets after the year's return.
    expect(f.last.fees).toBeCloseTo(f0.fee * f0.aum * (1 + (f.last.ret + f0.fee) / (1 - f0.fee)), -2)
  })

  it('gates the index style to its era and validates every lever', () => {
    const { g, a } = firm('asset', { year: 1950 })
    expect(styleBlock('index', 'us', 1950)).toBeTruthy()
    expect(setStyle(g, a.id, 'index')).toBe(false)
    expect(setStyle(g, a.id, 'growth')).toBe(true)
    expect(readFund(readBiz(g, a)).style).toBe('growth')
    expect(setFee(g, a.id, NaN)).toBe(false)
    expect(setFee(g, a.id, 5)).toBe(true)
    expect(readFund(readBiz(g, a)).fee).toBe(.02)
    expect(styleBlock('index', 'us', 2000)).toBeNull()
    g.assets = []
    expect(setStyle(g, a.id, 'value')).toBe(false)
  })

  it('rewards skill with better ranks and more clients, never with certainty', () => {
    const avg = (skill: number) => {
      let rank = 0, aum = 0, worst = 1
      for (let i = 0; i < 16; i++) {
        const { g, b } = firm('asset', { year: 1985, skill, lifeId: `skill-${i}` })
        for (let y = 1985; y < 2005; y++) { bookYear(g, b, y); const f = readFund(b); rank += f.last.rank; worst = Math.min(worst, f.last.rank) }
        aum += readFund(b).aum
      }
      return { rank: rank / (16 * 20), aum: aum / 16, worst }
    }
    const low = avg(30), high = avg(95)
    expect(high.rank).toBeGreaterThan(low.rank)
    expect(high.aum).toBeGreaterThan(low.aum)
    expect(high.worst).toBeLessThan(.2)
    expect(high.rank).toBeLessThan(.75)
  }, 120_000)

  it('the Business hint matches the outlook functions and the fee optimizer', () => {
    const { g, b } = firm('asset', { talent: 'Business' })
    const f = readFund(b)
    const o = styleOutlook(g, b, f, 'value')
    expect(o.rank).toBeCloseTo(phi(o.edge / STYLES.value.active), 10)
    const best = bestFee(g, b, f)
    const score = (fee: number) => { const x = feeOutlook(g, b, f, fee); return x.revenue * Math.pow(1 + x.flow, 6) }
    for (let k = 1; k <= 40; k++) expect(score(best)).toBeGreaterThanOrEqual(score(k * .0005) - 1e-6)
  })
})

describe('Investment firms 2.0: the hedge fund', () => {
  it('resolves a macro call against the engine’s real index move', () => {
    const m = .17, lev = 2
    const r1 = seeded('macro-test'), r2 = seeded('macro-test')
    const bull = hedgeGross('macro', m, 0, 0, { call: 'bull', lev }, .02, r1)
    const bear = hedgeGross('macro', m, 0, 0, { call: 'bear', lev }, .02, r2)
    expect(bull - bear).toBeCloseTo(lev * (callPayoff('bull', m) - callPayoff('bear', m)), 10)
    expect(callPayoff('flat', .02)).toBeGreaterThan(callPayoff('flat', .3))
    // Through the real year: the firm's own capital rides the same gross return.
    const gross = (call: 'bull' | 'bear') => {
      const { g, a } = firm('hedge', { cash: 5_000_000 })
      setCall(g, a.id, call, 2)
      setHedgeTerms(g, a.id, 'coinvest', 1_000_000)
      const live = bizOf(g, a)
      simulateFundYear(g, live, 2026, 0)
      return { g, own: readFund(live).last.own / 1_000_000, market: readFund(live).last.market }
    }
    const up = gross('bull'), down = gross('bear')
    expect(up.market).toBe(marketMove(up.g, 'us', 2027))
    expect(up.own - down.own).toBeCloseTo(2 * (callPayoff('bull', up.market) - callPayoff('bear', up.market)), 6)
    expect(financingCost('us', 2027)).toBeGreaterThanOrEqual(0)
  })

  it('charges performance fees only above the high-water mark', () => {
    const { g, b } = firm('hedge')
    const f = readFund(b)
    f.hwm = f.aum * 2; saveFund(b, f)
    simulateFundYear(g, b, 2026, 0)
    const after = readFund(b)
    // No gain above the mark: the only fee is the management fee.
    expect(after.last.fees).toBeCloseTo(f.mgmt * f.aum * (1 + (after.last.ret + f.mgmt) / (1 - f.mgmt)), -2)
    expect(after.hwm).toBeGreaterThan(after.aum)
  })

  it('co-invests only spare company cash, and the gain or loss is the firm’s', () => {
    const { g, a } = firm('hedge', { cash: 3_000_000 })
    expect(setHedgeTerms(g, a.id, 'coinvest', 1e12)).toBe(true)
    const b = bizOf(g, a)
    expect(readFund(b).coinvest).toBe(3_000_000)
    const cash = b.cash
    const res = simulateFundYear(g, b, 2026, 0)
    const f = readFund(b)
    expect(f.last.own).not.toBe(0)
    expect(b.cash).toBe(cash + res.stmt.net)
  })

  it('shows the Investing gut read honestly and only with the talent', () => {
    const { g, b } = firm('hedge')
    expect(callHint(g, b, 'bull') + callHint(g, b, 'bear') + callHint(g, b, 'flat')).toBe('')
    g.character.talent = 'Investing'
    const before = JSON.stringify(g)
    const inst = marketInstinct(g)!
    const gut = gutCall(g, b)
    expect(gut).toBe(inst.market === 'up' ? 'bull' : inst.market === 'down' ? 'bear' : 'unsure')
    const hints = (['bull', 'bear', 'flat'] as const).map(c => callHint(g, b, c))
    expect(hints.filter(Boolean)).toHaveLength(1)
    expect(JSON.stringify(g)).toBe(before)
    // A firm in another market gets no read from your home market.
    expect(gutCall(g, { countryId: 'jp' })).toBeNull()
  })

  it('needs the Inventor talent for a trading algorithm, which is never a sure thing', () => {
    const { g, a, b } = firm('hedge', { year: 2010 })
    expect(algoBlock(g, b, readFund(b))).toMatch(/inventor/i)
    g.character.talent = 'Inventor'
    expect(algoBlock(g, b, readFund(b))).toBeNull()
    const cash = b.cash
    expect(inventAlgorithm(g, a.id)).toBe(true)
    expect(inventAlgorithm(g, a.id)).toBe(false)
    const live = bizOf(g, a)
    expect(live.cash).toBeLessThan(cash)
    expect(live.yearCosts).toBe(cash - live.cash)
    expect(readFund(live).aum).toBe(readFund(b).aum)
    simulateFundYear(g, live, 2010, 0); live.yearCosts = 0
    expect(readFund(live).algoEdge).toBe(0)
    simulateFundYear(g, live, 2011, 0)
    const edge = readFund(live).algoEdge
    expect(edge).toBeGreaterThan(0)
    expect(edge).toBeLessThan(.08)
    for (let y = 2012; y < 2016; y++) simulateFundYear(g, live, y, 0)
    expect(readFund(live).algoEdge).toBeLessThan(edge)
    let duds = 0, wins = 0
    for (let i = 0; i < 40; i++) {
      const x = firm('hedge', { year: 2010, lifeId: `algo-${i}`, talent: 'Inventor' })
      inventAlgorithm(x.g, x.a.id)
      const lb = bizOf(x.g, x.a)
      simulateFundYear(x.g, lb, 2010, 0); simulateFundYear(x.g, lb, 2011, 0)
      if (readFund(lb).algoEdge < .01) duds++; else wins++
    }
    expect(duds).toBeGreaterThan(0)
    expect(wins).toBeGreaterThan(duds)
  })

  it('gates quant trading and hedge funds by era', () => {
    expect(quantBlock('us', 1960)).toBeTruthy()
    expect(quantBlock('us', 1990)).toBeNull()
    const { g, a } = firm('hedge', { year: 1960 })
    expect(setStrategy(g, a.id, 'quant')).toBe(false)
    expect(setStrategy(g, a.id, 'event')).toBe(true)
  })
})

describe('Investment firms 2.0: the brokerage', () => {
  it('trades more in the online boom and the meme frenzy, and prices against the era', () => {
    const trades = (year: number, commission?: number) => {
      const { g, a, b } = firm('broker', { year })
      if (commission !== undefined) setCommission(g, a.id, commission)
      const live = bizOf(g, a)
      simulateFundYear(g, live, year, 0)
      return { trades: readFund(live).last.trades, fees: readFund(live).last.fees, b }
    }
    expect(trades(2021).trades).toBeGreaterThan(trades(2015).trades)
    expect(trades(1998).trades).toBeGreaterThan(trades(1980).trades)
    expect(trades(1980, .02).trades).toBeLessThan(trades(1980, .002).trades)
    // Zero commissions still earn order-flow payments and interest on idle cash.
    expect(trades(2023, 0).fees).toBeGreaterThan(0)
  })
})

describe('Investment firms 2.0: brokerage pricing', () => {
  it('opens at the era’s going rate, and the Business hint picks the best price by the same math', () => {
    for (const year of [1965, 1999, 2023]) {
      const { b } = firm('broker', { year })
      const f = readFund(b)
      expect(f.commission).toBe(brokerEra('us', year).normCommission)
      const best = bestCommission(b, f, year)
      const score = (c: number) => { const o = brokerOutlook(b, f, c, year); return o.revenue * Math.pow(1 + o.growth, 6) }
      for (let k = 0; k <= 200; k += 3) expect(score(best)).toBeGreaterThanOrEqual(score(k * .0001) - 1e-6)
    }
  })

  it('warns in the report when the commission is far above what rivals charge', () => {
    const { g, a } = firm('broker', { year: 2010 })
    g.character.job = null
    becomeCeo(g, a, bizOf(g, a)); g.queue = []
    setCommission(g, a.id, .02)
    ageBusinessYear(g)
    const report = g.queue.find(m => m.kind === 'notice' && m.title === 'Test Capital: Financial Institution Report')
    expect(report && report.kind === 'notice' && report.text).toMatch(/Rivals now charge/)
  })
})

describe('Investment firms 2.0: old saves', () => {
  function legacy(model: Json | undefined, extra: Record<string, Json> = {}) {
    const g = makeTestGame(5, { age: 40, money: 1_000_000 })
    g.year = 2025
    const b0 = newBiz(g, 'investmentFirm', 'us', 'Chicago', { cash: 3_000_000, founded: 2015 })
    b0.financeFirm = (model === undefined ? undefined : { model, ...extra }) as Json
    if (model === undefined) delete b0.financeFirm
    const a = createBusinessAsset(g, 'Old Capital', b0, 1_000_000)
    g.assets.push(a)
    return { g, a }
  }

  it('maps retail, private and brokerage books to the new types without new money', () => {
    const retail = legacy('retail', { aum: 12_345_678, feeRate: .012, strategy: 'aggressive', confidence: 70, controls: 66, lastYear: 2024, lastReturn: .05, lastFees: 150_000 })
    const before = JSON.stringify(retail.g)
    const r = readFund(readBiz(retail.g, retail.a))
    expect(JSON.stringify(retail.g)).toBe(before)
    expect(r).toMatchObject({ type: 'asset', aum: 12_345_678, fee: .012, style: 'growth', lastYear: 2024, compliance: 66, rep: .7 })
    const priv = legacy('private', { aum: 50e6, highWater: 55e6, feeRate: .02, leverage: 2.5, tradingCapital: 1e6, algoEdge: .8, algoCompleted: 2020, lastYear: 2024 })
    const p = readFund(readBiz(priv.g, priv.a))
    expect(p).toMatchObject({ type: 'hedge', aum: 50e6, hwm: 55e6, mgmt: .02, lev: 2.5, coinvest: 1e6, strategy: 'quant' })
    expect(p.algoEdge).toBeLessThanOrEqual(.04)
    const brk = legacy('brokerage', { accounts: 4321, commission: .003, aum: 9e6, lastYear: 2024 })
    expect(readFund(readBiz(brk.g, brk.a))).toMatchObject({ type: 'broker', accounts: 4321, commission: .003, aum: 9e6 })
    const none = legacy(undefined)
    expect(readFund(readBiz(none.g, none.a)).type).toBe('hedge')
    const broken = legacy('retail', { aum: 'bad', feeRate: Infinity, lastYear: NaN, confidence: -5 })
    const fb = readFund(readBiz(broken.g, broken.a))
    expect(allFinite(fb)).toBe(true)
    expect(fb.lastYear).toBe(-1)
  })

  it('continues an old firm through the yearly loop with equivalent books and no top-up', () => {
    for (const model of ['retail', 'private', 'brokerage']) {
      const { g, a } = legacy(model, { aum: 30e6, accounts: 5000, lastYear: 2024 })
      const b = bizOf(g, a)
      installManager(g, b, managerCandidate(g, b, 100))
      const cash = b.cash, clients = readFund(b).aum
      g.year = 2026; g.character.age++
      yearlyBusinessImpl(g)
      const after = readBiz(g, a), f = readFund(after)
      expect(after.last?.year).toBe(2025)
      expect(after.last?.strategicIncome).toBe(0)
      expect(f.type).toBe(model === 'retail' ? 'asset' : model === 'private' ? 'hedge' : 'broker')
      // The hired CEO may already have paid next year's campaign (booked next year).
      expect(after.cash).toBe(cash + after.last!.net + (after.last!.other - after.last!.otherIncome) - after.yearCosts)
      expect(clients).toBe(30e6)
      expect(f.lastYear).toBe(2025)
      const saved = JSON.stringify(g)
      yearlyBusinessImpl(g)
      expect(JSON.stringify(g)).toBe(saved)
    }
  })

  it('round-trips the new books through JSON and never re-books a settled year', () => {
    for (const type of TYPES) {
      const { g, a, b } = firm(type)
      simulateFundYear(g, b, 2026, 0)
      const restored = JSON.parse(JSON.stringify(g)) as GameState
      const loaded = bizOf(restored, restored.assets[0])
      expect(readFund(loaded)).toEqual(readFund(b))
      expect(readFund(normalizeBiz(JSON.parse(JSON.stringify(loaded)), 2027))).toEqual(readFund(b))
      const before = JSON.stringify(restored)
      simulateFundYear(restored, loaded, 2026, 0)
      expect(JSON.stringify(restored)).toBe(before)
      expect(findBusiness(g, a.id)).toBeTruthy()
    }
  })
})

describe('Investment firms 2.0: the perfect-foresight exploit is gone', () => {
  it('a 100-rated CEO gets no strategic top-up: losses stay losses', () => {
    const { g, a, b } = firm('hedge', { skill: 100, cash: 20e6 })
    b.debt = 500e6; b.debtRate = .5
    g.year++; g.character.age++
    yearlyBusinessImpl(g)
    const after = readBiz(g, a)
    expect(after.last!.strategicIncome).toBe(0)
    expect(after.last!.net).toBeLessThan(0)
    expect(after.last!.otherIncome).toBe(0)
  })

  it('elite CEOs and the Business talent improve odds modestly, never 35-45% a year', () => {
    for (const type of ['asset', 'hedge'] as FundType[]) {
      let excess = 0, n = 0, huge = 0
      for (let i = 0; i < 12; i++) {
        const { g, b } = firm(type, { year: 1995, skill: 100, lifeId: `elite-${i}`, talent: 'Business' })
        for (let y = 1995; y < 2015; y++) {
          bookYear(g, b, y)
          const f = readFund(b)
          excess += f.last.ret - f.last.market; n++
          if (f.last.ret >= .35 && f.last.market < .15) huge++
        }
      }
      // Hedge funds hedge half the market away, so their excess is often negative in bull years.
      expect(excess / n).toBeLessThan(.06)
      expect(huge / n).toBeLessThan(.05)
    }
  }, 60_000)

  it('a Business-talent owner gets honest hints, not a foresight button', () => {
    const { g, a } = firm('asset', { talent: 'Business' })
    const nodes = fundNodes(g, a)
    const ids = JSON.stringify(nodes.map(n => n.id))
    expect(ids).not.toMatch(/optimize/)
    const before = JSON.stringify(g)
    expect(walk(g, nodes)).toBeGreaterThan(5)
    expect(JSON.stringify(g)).toBe(before)
  })
})

describe('Investment firms 2.0: the hired CEO', () => {
  it('runs every type without market foresight', () => {
    for (const type of ['asset', 'hedge', 'broker'] as FundType[]) {
      const decide = (lifeId: string) => {
        const { g, b } = firm(type, { skill: 85, lifeId })
        fundAutopilot(g, b)
        const f = readFund(b)
        return { style: f.style, fee: f.fee, strategy: f.strategy, lev: f.lev, call: f.call, commission: f.commission }
      }
      // Different timelines have different futures; the CEO's decisions can't see them.
      expect(decide('future-a')).toEqual(decide('future-b'))
      expect(decide('future-a').strategy).not.toBe('macro')
    }
  })

  it('only spends cash it booked, and a group forecast never touches the game state', () => {
    const g = makeTestGame(9, { age: 50, money: 1e9 })
    const b = newBiz(g, 'investmentFirm', 'us', 'Chicago', { ceo: 'manager', quality: 70, morale: 85, brand: 35 })
    b.manager = managerCandidate(g, b, 95)
    b.cash = 2_000_000
    const before = JSON.stringify(g), rng = g.rng
    financeManagerTurn(g, b)
    const profit = simulateFinanceYear(g, structuredClone(b), g.year, 0).stmt.net
    expect(Number.isFinite(profit)).toBe(true)
    expect(JSON.stringify(g)).toBe(before)
    expect(g.rng).toBe(rng)
    expect(fundCapitalNeed(g, b, 1e8, .8)).toBeGreaterThanOrEqual(0)
  })
})

describe('Investment firms 2.0: founding, reports and menus', () => {
  function found(year: number, pickType: string) {
    const g = makeTestGame(21, { age: 30, money: 50_000_000 })
    g.year = year
    startFounding(g, 'investmentFirm')
    let offered: string[] = []
    for (let step = 0; g.queue.length && step < 30; step++) {
      const m = g.queue.shift()!
      if (m.kind === 'input') runScript(g, m.scriptId, m.defaultValue ?? 'Test Capital', m.data, m)
      else if (m.kind === 'choice' && m.source === 'script') {
        if (m.scriptId === 'business.found.investmentModel') { offered = m.choices.map(c => c.id); runScript(g, m.scriptId, pickType, m.data, m); continue }
        runScript(g, m.scriptId!, m.choices.find(c => c.id === 'savings')?.id ?? m.choices[0].id, m.data, m)
      }
    }
    return { g, offered, a: g.assets.find(x => x.kind === 'business') }
  }

  it('offers the firm types by era and founds the chosen one', () => {
    expect(found(1930, 'asset').offered).toEqual(['asset', 'broker'])
    expect(found(1947, 'asset').offered).toEqual(['asset', 'vc', 'broker'])
    expect(found(1960, 'asset').offered).toEqual(['asset', 'hedge', 'vc', 'broker'])
    for (const type of TYPES) {
      const { g, a } = found(1990, type)
      expect(a).toBeTruthy()
      const f = readFund(readBiz(g, a!))
      expect(f.type).toBe(type)
      if (type === 'vc') { expect(f.funds).toHaveLength(1); expect(f.funds[0].size).toBeGreaterThan(0); expect(readBiz(g, a!).cash).toBeLessThan(f.funds[0].size) }
    }
    // The resolver re-checks the era.
    expect(found(1930, 'hedge').a).toBeUndefined()
  })

  it('still accepts a type popup saved by an older version', () => {
    const g = makeTestGame(21, { age: 30, money: 50_000_000 })
    g.year = 1990
    startFounding(g, 'investmentFirm')
    let founded = false
    for (let step = 0; g.queue.length && step < 30; step++) {
      const m = g.queue.shift()!
      if (m.kind === 'input') runScript(g, m.scriptId, m.defaultValue ?? 'Old Popup Capital', m.data, m)
      else if (m.kind === 'choice' && m.source === 'script') {
        if (m.scriptId === 'business.found.investmentModel') {
          const old = { ...m, choices: [{ id: 'retail', label: 'Retail' }, { id: 'private', label: 'Private' }, { id: 'brokerage', label: 'Brokerage' }] }
          runScript(g, m.scriptId, 'private', old.data, old)
          founded = true
          continue
        }
        runScript(g, m.scriptId!, m.choices.find(c => c.id === 'savings')?.id ?? m.choices[0].id, m.data, m)
      }
    }
    expect(founded).toBe(true)
    const a = g.assets.find(x => x.kind === 'business')!
    expect(readFund(readBiz(g, a)).type).toBe('hedge')
  })

  it('shows a short yearly report with next year’s decision', () => {
    for (const type of TYPES) {
      const { g, a } = firm(type, { year: 2000 })
      g.character.job = null
      becomeCeo(g, a, bizOf(g, a)); g.queue = []
      ageBusinessYear(g)
      const report = g.queue.find(m => (m.kind === 'notice' || m.kind === 'choice') && m.title === 'Test Capital: Financial Institution Report')
      expect(report).toBeTruthy()
      if (!report || (report.kind !== 'notice' && report.kind !== 'choice')) continue
      const lines = report.text.split('\n')
      expect(lines.length).toBeLessThanOrEqual(12)
      for (const line of lines) expect(line.length).toBeLessThanOrEqual(160)
      if (type === 'asset' || type === 'hedge') expect(report.kind).toBe('choice')
      drain(g)
    }
  })

  it('keeps the header line short and every menu pure, hints included', () => {
    for (const type of TYPES) {
      const { g, a, b } = firm(type, { year: 2015, talent: 'Business' })
      g.character.talent = 'Business'
      g.character.talents = ['Business', 'Investing', 'Inventor'] as never
      expect(fundInfo(g, b).length).toBeLessThanOrEqual(140)
      if (type === 'hedge') { setStrategy(g, a.id, 'macro'); setHedgeTerms(g, a.id, 'coinvest', 100_000) }
      if (type === 'asset') runCampaign(g, a.id)
      const f: FundState = readFund(bizOf(g, a))
      if (type === 'hedge') { f.ponzi = { since: 2015, hole: 1e6, fees: 0 }; saveFund(bizOf(g, a), f) }
      const before = JSON.stringify(g), rng = g.rng
      const nodes = fundNodes(g, a)
      expect(walk(g, nodes)).toBeGreaterThan(4)
      expect(JSON.stringify(g)).toBe(before)
      expect(g.rng).toBe(rng)
      for (const text of menuText(g, nodes)) expect(text.length, text).toBeLessThanOrEqual(text.startsWith('🔮') ? 220 : 140)
    }
  })
})
