// Investment Firms 2.0 review regressions: unique startup names, a hired CEO who leaves pitches
// for the owner, LPs who won't fund a manager that never invests, era-legal firms from every
// source (founding, listings, group ventures, old saves), an honest hedge fee preview, lawyers
// who are actually paid for, and guards: the whole company screen is pure for every type and
// state, and damaged old books run through the real yearly loop without minting money.
import { describe, expect, it } from 'vitest'
import { becomeCeo } from '../src/game/business/career'
import { createBusinessAsset, listingsForSale, newBiz, startFounding } from '../src/game/business/founding'
import { fundNodes, simulateFundYear } from '../src/game/business/fund'
import { investInPitch, setCall, setCommission, setHedgeTerms } from '../src/game/business/fund-actions'
import { fundYearlyChecks, presentFundEvent, PROBE } from '../src/game/business/fund-events'
import { brokerEra, quantBlock } from '../src/game/business/fund-model'
import { bestCommission, hedgeFeeOutlook, strategyOutlook } from '../src/game/business/fund-outlook'
import { readFund, saveFund, type FundState, type FundType } from '../src/game/business/fund-state'
import { fundLine } from '../src/game/business/fund-text'
import { newVcFund, openPitches, pitchesFor, raiseQuote } from '../src/game/business/fund-vc'
import { bizOf, findBusiness, readBiz } from '../src/game/business/state'
import { businessAssetView } from '../src/game/business'
import { runScript } from '../src/game/scripts'
import type { GameState, Json } from '../src/game/types'
import { ageBusinessYear, allFinite, drain, firm, menuText, walk } from './fund-fixtures'
import { makeTestGame } from './helpers'

const TYPES: FundType[] = ['asset', 'hedge', 'vc', 'broker']

/** Run a VC firm's owner-CEO for some years, backing every pitch (follow-ons and raises accepted). */
function ownerVc(lifeId: string, year: number, years: number, back = true) {
  const { g, a } = firm('vc', { year, lifeId })
  g.character.job = null
  becomeCeo(g, a, bizOf(g, a)); g.queue = []
  const seen: { year: number; names: string[]; portfolio: Set<string> }[] = []
  for (let y = 0; y < years; y++) {
    const b = readBiz(g, a), f = readFund(b)
    seen.push({ year: g.year, names: pitchesFor(g, b, f, g.year).map(p => p.name), portfolio: new Set(f.cos.filter(c => c.born < g.year).map(c => c.name)) })
    if (back) for (const p of openPitches(g, b, f, g.year)) investInPitch(g, a.id, p.id)
    ageBusinessYear(g)
    drain(g, m => m.choices.find(c => c.id === (back ? 'invest' : 'pass') || c.id === 'safe' || c.id === 'cooperate')?.id ?? m.choices[0].id)
    g.character.age = 40
  }
  return { g, a, seen }
}

describe('venture capital: startup names', () => {
  it('never pitches two startups with the same name in a year, or one the firm already backed', () => {
    let years = 0, names = 0
    for (let i = 0; i < 6; i++) {
      // A 2015 US firm draws from the 2015 syllables (the "Novagrid twice" report).
      for (const s of ownerVc(`names-${i}`, 2015, 14).seen) {
        years++; names += s.names.length
        expect(new Set(s.names.map(n => n.toLowerCase())).size, `${s.year}: ${s.names.join(', ')}`).toBe(s.names.length)
        for (const n of s.names) expect(s.portfolio.has(n), `${s.year}: ${n} is already in the portfolio`).toBe(false)
      }
    }
    expect(years).toBe(84)
    expect(names).toBeGreaterThan(200)
  }, 120_000)

  it('keeps a year’s pitches identical while the player invests in them', () => {
    const { g, a, b } = firm('vc', { year: 2015 })
    const before = pitchesFor(g, b, readFund(b), 2015)
    for (const p of before.slice(0, 2)) expect(investInPitch(g, a.id, p.id)).toBe(true)
    const live = bizOf(g, a)
    expect(pitchesFor(g, live, readFund(live), 2015)).toEqual(before)
  })

  it('renames a pitch that would repeat an older portfolio company, without touching the rest', () => {
    const { g, b } = firm('vc', { year: 2015 })
    const f = readFund(b)
    const plain = pitchesFor(g, b, f, 2015)
    // Pretend the firm backed a company with the first pitch's name last year.
    const old: FundState = { ...f, cos: [{ id: '2014.0', name: plain[0].name, emoji: '🚀', sector: 'Software', fund: 1, q: 50, stage: 0, val: 5e6, own: .1, cost: 5e5, born: 2014, status: 'dead', end: 2015, got: 0, how: 'ran out of money', round: null, unicorn: false }] }
    const renamed = pitchesFor(g, b, old, 2015)
    expect(renamed[0].name).not.toBe(plain[0].name)
    expect(renamed.map(p => ({ ...p, name: '' }))).toEqual(plain.map(p => ({ ...p, name: '' })))
  })
})

describe('venture capital: a hired CEO and the owner', () => {
  it('leaves the pitches it passes on for an owner who isn’t running the firm', () => {
    const { g, a } = firm('vc', { year: 2010, skill: 60, lifeId: 'mgr-vc' })
    let open = 0, offered = 0
    for (let y = 0; y < 10; y++) {
      ageBusinessYear(g); drain(g)
      const b = readBiz(g, a), f = readFund(b)
      const all = pitchesFor(g, b, f, g.year), left = openPitches(g, b, f, g.year)
      const backed = f.cos.filter(c => c.born === g.year)
      expect(backed.length).toBeLessThanOrEqual(3)
      // Only the CEO's own picks are off the table.
      expect(left.map(p => p.id).sort()).toEqual(all.filter(p => !backed.some(c => c.id === p.id)).map(p => p.id).sort())
      offered += all.length; open += left.length
    }
    expect(offered).toBeGreaterThan(20)
    expect(open).toBeGreaterThan(5)
    // The owner can still back one of them.
    const b = readBiz(g, a), f = readFund(b)
    const left = openPitches(g, b, f, g.year)
    if (left.length) expect(investInPitch(g, a.id, left[0].id)).toBe(true)
  }, 60_000)

  it('explains an empty pitch list instead of a bare "No pitches right now"', () => {
    const { g, a } = firm('vc', { year: 2015 })
    const b = bizOf(g, a), f = readFund(b)
    f.funds[0].dry = 0; f.funds[0].invested = f.funds[0].size * .8
    saveFund(b, f)
    const text = menuText(g, fundNodes(g, a)).join('\n')
    expect(text).not.toMatch(/No pitches right now/)
    expect(text).toMatch(/Fund I has finished investing/)
  })
})

describe('venture capital: LPs judge what you invested', () => {
  it('a firm that never backs a startup can’t keep raising funds just to collect fees', () => {
    const { g, a } = ownerVc('lazy-vc', 1990, 26, false)
    const f = readFund(readBiz(g, a))
    expect(f.cos).toHaveLength(0)
    expect(f.funds).toHaveLength(1)
    const q = raiseQuote(g, readBiz(g, a), f, g.year)
    expect(q.size).toBe(0)
    expect(q.block).toMatch(/barely invested/)
  }, 60_000)

  it('sizes the next fund by how much of the last one went to work', () => {
    const { g, b } = firm('vc', { year: 2000 })
    const f = readFund(b)
    const after = (invested: number): FundState => {
      const x = newVcFund(1, 30e6, 2000)
      x.invested = invested; x.dry = 24e6 - invested; x.fees = 3e6; x.dist = 1.2 * (invested + 3e6)
      return { ...f, funds: [x], cos: [] }
    }
    const full = raiseQuote(g, b, after(24e6), 2006), half = raiseQuote(g, b, after(.35 * 24e6), 2006), none = raiseQuote(g, b, after(0), 2006)
    expect(full.block).toBeNull()
    expect(half.block).toBeNull()
    expect(half.size).toBeLessThan(full.size * .7)
    expect(half.size).toBeGreaterThan(0)
    expect(none.block).toBeTruthy()
    // After the fee years the unused money goes back to LPs: that doesn't count as invested.
    const old = after(0)
    old.funds[0].dry = 0
    expect(raiseQuote(g, b, old, 2012).block).toBeTruthy()
  })

  it('shows no multiple for a fund that hasn’t backed anyone, and no "carry $0" in the report', () => {
    const { g, a, b } = firm('vc', { year: 2015 })
    expect(fundLine(readFund(b), 1, 2016)).toMatch(/no startups yet · \$[\d.]+M to invest/)
    expect(fundLine(readFund(b), 1, 2016)).not.toMatch(/0\.0×/)
    g.character.job = null
    becomeCeo(g, a, bizOf(g, a)); g.queue = []
    ageBusinessYear(g)
    const report = g.queue.find(m => m.kind === 'notice' && m.title.endsWith('Financial Institution Report'))
    expect(report && report.kind === 'notice' ? report.text : '').not.toMatch(/carry \$0/)
  })
})

describe('era-legal investment firms from every source', () => {
  it('a company record made outside the founding popup is an asset manager, never a 1930s hedge fund', () => {
    const g = makeTestGame(4, { age: 40 })
    g.year = 1935
    const b = newBiz(g, 'investmentFirm', 'us', 'Chicago', { cash: 1e6 })
    const f = readFund(b)
    expect(f.type).toBe('asset')
    expect(f.kind).toBe('fund')
    expect(b.cash).toBe(1e6)
  })

  it('lists investment firms for sale only as types that exist that year, and says which', () => {
    const seen: { year: number; type: FundType }[] = []
    for (let year = 1925; year <= 2026 && seen.length < 12; year++) {
      for (const lifeId of ['a', 'b', 'c']) {
        const g = makeTestGame(3, { age: 40, money: 1e8, countryId: 'us', city: 'Chicago' })
        g.year = year; g.lifeId = `list-${lifeId}`
        const before = JSON.stringify(g)
        const listings = listingsForSale(g)
        expect(JSON.stringify(g)).toBe(before)
        expect(listingsForSale(g)).toEqual(listings)
        for (const l of listings) if (l.biz.industry === 'investmentFirm') seen.push({ year, type: readFund(l.biz).type })
      }
    }
    expect(seen.length).toBeGreaterThanOrEqual(6)
    for (const s of seen) {
      expect(s.type).not.toBe('vc')
      if (s.year < 1949) expect(s.type).not.toBe('hedge')
    }
    expect(new Set(seen.map(s => s.type)).size).toBeGreaterThan(1)
  }, 60_000)

  it('the founding popup ends with the chosen type’s next step, not banking text', () => {
    for (const type of TYPES) {
      const g = makeTestGame(21, { age: 30, money: 50_000_000 })
      g.year = 1995
      startFounding(g, 'investmentFirm')
      let text = ''
      for (let step = 0; g.queue.length && step < 30; step++) {
        const m = g.queue.shift()!
        if (m.kind === 'notice' && m.title === 'Open for Business!') text = m.text
        if (m.kind === 'input') runScript(g, m.scriptId, m.defaultValue ?? 'Test Capital', m.data, m)
        else if (m.kind === 'choice' && m.source === 'script') runScript(g, m.scriptId!, m.scriptId === 'business.found.investmentModel' ? type : m.choices.find(c => c.id === 'savings' || c.id === 'me')?.id ?? m.choices[0].id, m.data, m)
      }
      expect(text, type).toBeTruthy()
      expect(text).not.toMatch(/banking spreads|deposits/)
      if (type === 'vc') expect(text).toMatch(/Fund I/)
    }
  })

  it('maps an old pre-1949 "private" firm to an asset manager, and an old quant firm only where computers exist', () => {
    const legacy = (rec: Json, year: number) => {
      const g = makeTestGame(5, { age: 40, money: 1_000_000 })
      g.year = year
      const b0 = newBiz(g, 'investmentFirm', 'us', 'Chicago', { cash: 3_000_000, founded: year - 10 })
      b0.financeFirm = rec
      const a = createBusinessAsset(g, 'Old Capital', b0, 1_000_000)
      g.assets.push(a)
      return { g, a }
    }
    const old = legacy({ model: 'private', aum: 4e7, feeRate: .015, lastYear: 1934 }, 1935)
    expect(readFund(readBiz(old.g, old.a))).toMatchObject({ type: 'asset', aum: 4e7, lastYear: 1934 })
    const none = legacy({ model: 'private', aum: 4e7 }, 1940)
    // Never booked: the founding year decides (1930).
    expect(readFund(readBiz(none.g, none.a)).type).toBe('asset')
    expect(quantBlock('us', 1961)).toBeTruthy()
    const early = legacy({ model: 'private', aum: 4e7, algoEdge: 1, algoCompleted: 1958, lastYear: 1960 }, 1961)
    expect(readFund(readBiz(early.g, early.a))).toMatchObject({ type: 'hedge', strategy: 'longShort' })
    // An edge with no completion year still fades as rivals copy it.
    const undated = legacy({ model: 'private', aum: 4e7, algoEdge: 1, lastYear: 2024 }, 2025)
    const f = readFund(readBiz(undated.g, undated.a))
    expect(f.strategy).toBe('quant')
    expect(f.algoDone).toBeGreaterThan(0)
    installCeo(undated.g, undated.a)
    ageBusinessYear(undated.g)
    expect(readFund(readBiz(undated.g, undated.a)).algoEdge).toBeLessThan(f.algoEdge)
  })
})

function installCeo(g: GameState, a: { id: string }): void {
  const live = findBusiness(g, a.id)!
  g.character.job = null
  becomeCeo(g, live, bizOf(g, live)); g.queue = []
}

describe('honest previews', () => {
  it('the hedge fee preview pays no performance fee while the fund is under water, like the year itself', () => {
    const { g, b } = firm('hedge')
    const f = readFund(b)
    const o = strategyOutlook(g, b, f, f.strategy)
    const gross = Math.max(0, o.expected)
    const under = hedgeFeeOutlook(g, b, { ...f, hwm: f.aum * 3 }, .02, .2)
    expect(under.revenue).toBeCloseTo(f.aum * (1 + gross) * .02, 4)
    const above = hedgeFeeOutlook(g, b, { ...f, hwm: f.aum * .5 }, .02, .2)
    const mgmt = f.aum * (1 + gross) * .02
    expect(above.revenue).toBeCloseTo(mgmt + .2 * (f.aum * (1 + gross) - mgmt - f.aum * .5), 4)
  })
})

describe('regulators', () => {
  it('top lawyers are paid by the firm, else by you; with no money you cooperate', () => {
    const fight = (cash: number, money: number) => {
      const { g, a, b } = firm('hedge', { cash, money })
      const f = readFund(b)
      f.lastYear = g.year - 1
      f.probe = { year: g.year - 1, crime: 'Insider Trading', odds: 1, by: g.character.id }
      saveFund(b, f)
      g.queue = []
      fundYearlyChecks(g, b, a)
      const m = g.queue.find(q => q.kind === 'choice' && q.scriptId === PROBE)
      if (!m || m.kind !== 'choice') throw new Error('no regulator popup')
      g.queue = g.queue.filter(q => q !== m)
      runScript(g, PROBE, 'lawyer', m.data, m)
      return { g, a }
    }
    const rich = fight(5e6, 1e6)
    expect(readBiz(rich.g, rich.a).cash).toBeLessThan(5e6)
    expect(rich.g.character.money).toBe(1e6)
    const broke = fight(0, 1e6)
    expect(broke.g.character.money).toBeLessThan(1e6)
    const nothing = fight(0, 0)
    expect(nothing.g.log.flatMap(y => y.entries.map(e => e.text)).join('\n')).toMatch(/couldn't afford the lawyers/)
  })
})

describe('brokerage pricing', () => {
  /** Ten booked years at a fixed commission, summed over a few timelines. */
  const tenYears = (year: number, commission: number): number => {
    let total = 0
    for (let seed = 0; seed < 4; seed++) {
      const { g, a } = firm('broker', { year, lifeId: `broker-price-${seed}`, cash: 5e6 })
      setCommission(g, a.id, commission)
      const b = bizOf(g, a)
      for (let y = year; y < year + 10; y++) { g.year = y; simulateFundYear(g, b, y, 0); b.yearCosts = 0; b.yearIncome = 0 }
      total += b.cash - 5e6
    }
    return total
  }

  it('charging far more than rivals loses money over time, even in the zero-commission era', () => {
    for (const year of [1985, 2000, 2006]) {
      const norm = brokerEra('us', year).normCommission
      expect(tenYears(year, norm * 3), `${year}`).toBeLessThan(tenYears(year, norm))
    }
    expect(tenYears(2023, .005)).toBeLessThan(tenYears(2023, 0))
  }, 60_000)

  it('the Business hint never recommends a price the yearly report warns about', () => {
    for (const year of [1930, 1965, 1985, 2000, 2006, 2015, 2023]) {
      const { b } = firm('broker', { year })
      const norm = brokerEra('us', year).normCommission
      expect(bestCommission(b, readFund(b), year), `${year}`).toBeLessThanOrEqual(norm * 1.5 + .0005)
    }
  })
})

describe('story events', () => {
  it('only firms that run a fund are offered an insider tip to "load the fund up" on', () => {
    for (const type of TYPES) {
      const { g, a, b } = firm(type, { year: 2009 })
      const f = readFund(b)
      f.aum = Math.max(f.aum, 2e8); f.lastYear = 2008
      saveFund(b, f)
      g.queue = []
      expect(presentFundEvent(g, a, 'tip'), type).toBe(type === 'asset' || type === 'hedge')
    }
  })
})

describe('purity and old books through the real loop', () => {
  it('renders the whole company screen of every firm type and state without touching the game', () => {
    for (const type of TYPES) {
      for (const managed of [false, true]) {
        const { g, a } = firm(type, managed ? { year: 2012, skill: 75, talent: 'Business' } : { year: 2012, talent: 'Business' })
        g.character.talents = ['Business', 'Investing', 'Inventor'] as never
        if (!managed) installCeo(g, a)
        for (let y = 0; y < 4; y++) { ageBusinessYear(g); drain(g); g.character.age = 40 }
        if (!findBusiness(g, a.id)) continue
        const b = bizOf(g, a), f = readFund(b)
        if (type === 'hedge') {
          setCall(g, a.id, 'bull', 2.5); setHedgeTerms(g, a.id, 'coinvest', 1e5)
          const h = readFund(bizOf(g, a))
          h.ponzi = { since: g.year - 1, hole: 1e6, fees: 1e4, by: g.character.id }
          h.probe = { year: g.year - 1, crime: 'Insider Trading', odds: .3, by: g.character.id }
          saveFund(bizOf(g, a), h)
        }
        if (type === 'vc') {
          const live = f.cos.find(c => c.status === 'live')
          if (live) live.round = { stage: live.stage + 1, pre: live.val * 2, size: live.val * .5, year: g.year + 1, take: -1 }
          saveFund(b, f)
        }
        const before = JSON.stringify(g), rng = g.rng
        const nodes = businessAssetView(g, a)
        expect(walk(g, nodes)).toBeGreaterThan(10)
        expect(JSON.stringify(g), `${type} ${managed}`).toBe(before)
        expect(g.rng).toBe(rng)
        for (const text of menuText(g, fundNodes(g, a))) expect(text.length, text).toBeLessThanOrEqual(text.startsWith('🔮') ? 220 : 140)
      }
    }
  }, 120_000)

  it('runs damaged old books through the yearly loop: no crash, finite, cash moves only by booked profit', () => {
    const records: Json[] = [
      'garbage', [1, 2], { model: 'retail', aum: 'x', feeRate: -1, lastYear: 'y' },
      { model: 'private', aum: 3e7, leverage: 99, tradingCapital: -1, highWater: Number.NaN, algoEdge: 9 },
      { model: 'brokerage', accounts: 2500, commission: 'free', aum: -3 },
      { kind: 'fund', type: 'nope', aum: -5, cos: 'x', funds: [{ size: 'big' }], marks: [null, { y: 'a' }] },
      { kind: 'fund', type: 'vc', funds: [{ n: 1, size: 2e7, vintage: 2018, dry: 9e9, reserve: -1 }, 'x'], cos: [{ id: 'a', status: 'live', own: 5, val: 2e6, fund: 1, born: 2019 }, { id: 'a' }, { name: 'no id' }], lastYear: 2024 },
    ]
    for (const rec of records) {
      const g = makeTestGame(5, { age: 40, money: 1_000_000 })
      g.year = 2025
      const b0 = newBiz(g, 'investmentFirm', 'us', 'Chicago', { cash: 3_000_000, founded: 2015 })
      b0.financeFirm = rec
      const a = createBusinessAsset(g, 'Old Capital', b0, 1_000_000)
      g.assets.push(a)
      installCeo(g, a)
      for (let y = 0; y < 5; y++) {
        const live = findBusiness(g, a.id)
        if (!live) break
        const cash = readBiz(g, live).cash
        ageBusinessYear(g)
        const after = findBusiness(g, a.id)
        if (!after) break
        const b = readBiz(g, after), s = b.last!
        expect(s.strategicIncome).toBe(0)
        expect(b.cash, JSON.stringify(rec)).toBe(cash + s.net + s.other - s.otherIncome - b.yearCosts)
        expect(allFinite(b)).toBe(true)
        expect(allFinite(readFund(b))).toBe(true)
        drain(g, m => m.choices.find(c => c.id === 'keep' || c.id === 'cooperate' || c.id === 'decline')?.id ?? m.choices[m.choices.length - 1].id)
        g.character.age = 41
      }
    }
  }, 120_000)
})
