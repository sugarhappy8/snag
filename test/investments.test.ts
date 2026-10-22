import { describe, expect, it } from 'vitest'
import { COUNTRIES } from '../src/game/world'
import { exchangeFor } from '../src/game/data/markets'
import {
  buySecurity,
  investmentAssetSubtitle,
  investmentAssetView,
  investmentHoldings,
  investmentListing,
  investmentsMenu,
  investmentsSummary,
  liquidatePortfolio,
  minTrade,
  riskMeter,
  sellHolding,
  yearlyInvestments,
} from '../src/game/investments'
import {
  companyDef,
  cryptoYear,
  defaultChance,
  exchangeInfo,
  exchangeYear,
  fxYear,
  indexMove,
  slotPlan,
  type SectorId,
} from '../src/game/invest/engine'
import type { Asset, GameState, MenuAction, MenuGroup, MenuNode } from '../src/game/types'
import { capitalGainsRate, capitalGainsTax } from '../src/game/nation/rates'
import { flowTotal } from './ledger-kit'
import { makeTestGame } from './helpers'

function adult(countryId = 'us', money = 1_000_000, seed = 7): GameState {
  const g = makeTestGame(seed, { age: 30, money, countryId, residence: { status: 'renting', rent: 0 } })
  g.lifeId = `invest-${seed}`
  return g
}

/** One trip around the sun for the investments module only. */
function passYear(g: GameState): number {
  g.year += 1
  g.character.age += 1
  g.yearActions = {}
  g.flags.taxableIncome = 0
  g.queue = []
  yearlyInvestments(g)
  const popups = g.queue.length
  g.queue = []
  return popups
}

function passYearKeepQueue(g: GameState): void {
  g.year += 1
  g.character.age += 1
  g.flags.taxableIncome = 0
  g.queue = []
  yearlyInvestments(g)
}

function children(g: GameState, group: MenuGroup): MenuNode[] {
  return group.children(g)
}

function findNode(nodes: MenuNode[], id: string): MenuNode | undefined {
  return nodes.find((n) => n.id === id)
}

function quote(g: GameState, type: string, i = 0) {
  const q = investmentListing(g).filter((x) => x.type === type)[i]
  expect(q, `no ${type} #${i} for sale`).toBeTruthy()
  return q
}

function sane(g: GameState): void {
  expect(Number.isFinite(g.character.money)).toBe(true)
  for (const a of investmentHoldings(g)) {
    expect(Number.isFinite(a.value), `${a.name} value`).toBe(true)
    expect(a.value).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(a.details.units as number)).toBe(true)
    expect(a.details.units as number).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(a.details.price as number)).toBe(true)
    expect(a.details.price as number).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(a.details.basis as number)).toBe(true)
    expect(investmentAssetSubtitle(g, a)).not.toMatch(/NaN|undefined|Infinity/)
    for (const n of investmentAssetView(g, a)) {
      if (n.type === 'info') expect(typeof n.text === 'string' ? n.text : n.text(g)).not.toMatch(/NaN|undefined|Infinity/)
    }
  }
}

describe('menus and access', () => {
  it('is hidden in prison and disabled with a reason for kids and the dead', () => {
    const kid = makeTestGame(1, { age: 12, money: 5_000 })
    expect(investmentsMenu.visible?.(kid) ?? true).toBe(true)
    expect(investmentsMenu.disabledReason?.(kid)).toMatch(/18/)
    const con = adult()
    con.character.prison = { crime: 'Fraud', yearsTotal: 3, yearsServed: 0, security: 'minimum', respect: 50 } as unknown as GameState['character']['prison']
    expect(investmentsMenu.visible?.(con)).toBe(false)
    const dead = adult()
    dead.character.alive = false
    expect(investmentsMenu.disabledReason?.(dead)).toBeTruthy()
    const g = adult()
    expect(investmentsMenu.disabledReason?.(g)).toBeNull()
  })

  it('shows market health, the local exchange and every product', () => {
    const g = adult('jp')
    const header = investmentsMenu.header!(g)
    expect(header).toMatch(/Nikkei 225/)
    expect(header).toMatch(/this year/)
    const nodes = children(g, investmentsMenu)
    for (const id of ['inv-stocks', 'inv-bonds', 'inv-penny', 'inv-crypto', 'inv-news', 'inv-liquidate']) expect(findNode(nodes, id), id).toBeTruthy()
    const local = findNode(nodes, 'inv-local')
    expect(local && local.type === 'info' && typeof local.text === 'string' ? local.text : '').toMatch(/Tokyo Stock Exchange/)
    const stocks = findNode(nodes, 'inv-stocks') as MenuGroup
    // Real companies fill the listing slots (up to 36 on a big exchange), grouped under size headings.
    const rows = stocks.children(g)
    expect(rows.some((n) => n.type === 'heading')).toBe(true)
    const offers = rows.filter((n) => n.type !== 'heading')
    expect(offers.length).toBeGreaterThanOrEqual(8)
    expect(offers.length).toBeLessThanOrEqual(44)
    for (const o of offers) {
      expect(o.type).toBe('menu')
      const sub = typeof (o as MenuGroup).subtitle === 'function' ? ((o as MenuGroup).subtitle as (g: GameState) => string)(g) : (o as MenuGroup).subtitle
      expect(sub).toMatch(/Risk [●○]{5}/)
      expect(sub).not.toMatch(/NaN|undefined/)
      const inside = (o as MenuGroup).children(g)
      expect(inside.some((n) => n.type === 'action' && n.id.startsWith('inv-buy-'))).toBe(true)
    }
    const news = findNode(nodes, 'inv-news') as MenuGroup
    expect(news.children(g).length).toBeGreaterThan(0)
  })

  it('quotes this year’s moves in the same money as the index line and "Recent years"', () => {
    // Review (2021 Britain): "FTSE 100 up 14.8% (+10% after inflation)" sat over "iShares FTSE 100
    // ETF ▲10.0% this year", and Shell read "▲19.3% this year" beside "Recent years: … '21 +24%".
    const g = adult('gb')
    g.year = 2021
    const pctOf = (s: string, re: RegExp) => {
      const m = re.exec(s)
      expect(m, `${re} in ${s}`).toBeTruthy()
      return Number(m![2]) * (m![1] === '▼' || m![1] === '-' || m![1] === 'down ' ? -1 : 1)
    }
    const header = investmentsMenu.header!(g)
    const index = pctOf(header, /(up |down )([\d.]+)%/)
    const nodes = children(g, investmentsMenu)
    const fund = nodes.find((n) => n.type === 'menu' && /FTSE 100/.test(n.label)) as MenuGroup
    const sub = typeof fund.subtitle === 'function' ? fund.subtitle(g) : String(fund.subtitle)
    expect(Math.abs(pctOf(sub, /(▲|▼)([\d.]+)% this year/) - index)).toBeLessThan(1.5)
    const stocks = (findNode(nodes, 'inv-stocks') as MenuGroup).children(g).filter((n): n is MenuGroup => n.type === 'menu')
    for (const s of stocks.slice(0, 8)) {
      const lines = s.children(g).filter((n) => n.type === 'info').map((n) => (n.type === 'info' ? (typeof n.text === 'string' ? n.text : n.text(g)) : ''))
      const price = lines.find((t) => /this year\)/.test(t))
      const recent = lines.find((t) => t.startsWith('Recent years'))
      if (!price || !recent || !/'21 [-+]?\d/.test(recent)) continue
      const now = pctOf(price, /(▲|▼)([\d.]+)% this year/)
      const listed = pctOf(recent, /'21 (\+|-)?(\d+)%/)
      expect(Math.abs(now - listed), `${s.label}: ${price} / ${recent}`).toBeLessThanOrEqual(0.6)
    }
    // A holding of that fund reports the same year the same way.
    const h = adult('gb')
    h.year = 2020
    const etf = investmentListing(h).find((q) => q.type === 'index')!
    expect(buySecurity(h, etf.secId, 100_000)).toBe(true)
    passYear(h)
    const held = investmentHoldings(h)[0]
    const row = investmentAssetView(h, held).map((n) => (n.type === 'info' ? (typeof n.text === 'string' ? n.text : n.text(h)) : '')).find((t) => t.startsWith('This year'))!
    const heldIndex = pctOf(investmentsMenu.header!(h), /(up |down )([\d.]+)%/)
    expect(Math.abs(pctOf(row, /(▲|▼)([\d.]+)%/) - heldIndex), `${row} vs ${heldIndex}%`).toBeLessThan(1.5)
  })

  it('renders a risk meter', () => {
    expect(riskMeter(1)).toBe('●○○○○')
    expect(riskMeter(5)).toBe('●●●●●')
    expect(riskMeter(Number.NaN)).toBe('●○○○○')
  })
})

describe('local markets', () => {
  it('uses each country\'s own exchange, or a regional hub', () => {
    const cases: [string, string, RegExp][] = [
      ['jp', 'TSE', /Nikkei 225/],
      ['gb', 'LSE', /FTSE 100/],
      ['br', 'B3', /Ibovespa/],
      ['sa', 'TADAWUL', /TASI/],
      ['za', 'JSE', /JSE/],
    ]
    for (const [cid, code, index] of cases) {
      const g = adult(cid)
      expect(exchangeInfo(cid).ex.code).toBe(code)
      expect(investmentsMenu.header!(g)).toMatch(index)
      expect(investmentListing(g).find((q) => q.type === 'stock')?.exchange).toBe(code)
    }
    // Samoa has no exchange of its own: it trades in Sydney.
    const ws = adult('ws')
    expect(exchangeFor('ws').code).toBe('ASX')
    const local = findNode(children(ws, investmentsMenu), 'inv-local')
    expect(local && local.type === 'info' ? String(local.text) : '').toMatch(/no stock exchange of its own/)
  })

  it('lists companies that follow the country\'s strongest industries', () => {
    const has = (cid: string, sectors: SectorId[]) => slotPlan(exchangeInfo(cid)).some((s) => sectors.includes(s))
    expect(has('sa', ['oil'])).toBe(true)
    expect(has('jp', ['automakers', 'electronics'])).toBe(true)
    expect(has('kr', ['automakers', 'electronics'])).toBe(true)
    expect(has('ch', ['pharma'])).toBe(true)
    expect(has('ch', ['banks'])).toBe(true)
    expect(has('au', ['mining', 'oil'])).toBe(true)
    expect(has('za', ['mining', 'oil'])).toBe(true)
    expect(has('us', ['tech', 'games', 'ecommerce'])).toBe(true)
    // Different countries, different companies.
    const names = (cid: string) => slotPlan(exchangeInfo(cid)).map((_, i) => companyDef(exchangeInfo(cid), i, 0).name)
    expect(names('jp')).not.toEqual(names('us'))
    expect(names('jp').join(' ')).not.toEqual(names('gb').join(' '))
  })

  it('builds a valid listing for all 102 countries', () => {
    expect(COUNTRIES.length).toBeGreaterThanOrEqual(100)
    for (const c of COUNTRIES) {
      const g = adult(c.id, 50_000, 3)
      const list = investmentListing(g)
      expect(list.length, c.id).toBeGreaterThanOrEqual(8 + 4 + 7)
      const stocks = list.filter((q) => q.type === 'stock')
      expect(new Set(stocks.map((q) => q.symbol)).size, `${c.id} tickers unique`).toBe(stocks.length)
      for (const q of list) {
        expect(q.name.trim().length, `${c.id} ${q.secId}`).toBeGreaterThan(0)
        expect(Number.isFinite(q.price) && q.price > 0, `${c.id} ${q.name} price`).toBe(true)
        expect(q.risk).toBeGreaterThanOrEqual(1)
        expect(q.risk).toBeLessThanOrEqual(5)
        expect(Number.isFinite(q.yield) && q.yield >= 0).toBe(true)
      }
      expect(investmentsMenu.header!(g)).not.toMatch(/NaN|undefined/)
      for (const n of children(g, investmentsMenu)) if (n.type === 'info') expect(String(typeof n.text === 'string' ? n.text : n.text(g))).not.toMatch(/NaN|undefined/)
    }
  })

  it('pays more on bonds in high-inflation, corrupt markets, with real default risk', () => {
    const ch = adult('ch')
    const ve = adult('ve')
    const chBond = quote(ch, 'bond')
    const veBond = quote(ve, 'bond')
    expect(veBond.yield).toBeGreaterThan(chBond.yield)
    expect(veBond.risk).toBeGreaterThan(chBond.risk)
    expect(defaultChance('ve')).toBeGreaterThan(0.02)
    expect(defaultChance('ch')).toBe(0)
  })
})

describe('trading', () => {
  it('buys, merges repeat buys at average cost, and sells with fees', () => {
    const g = adult('us', 100_000)
    const q = quote(g, 'stock', 1)
    expect(buySecurity(g, q.secId, 10_000)).toBe(true)
    expect(g.character.money).toBe(90_000)
    const [a] = investmentHoldings(g)
    expect(a.kind).toBe('investment')
    expect(a.details.basis).toBe(10_000)
    expect(a.value).toBeLessThan(10_000)
    expect(a.value).toBeGreaterThan(9_900)
    const units1 = a.details.units as number
    expect(buySecurity(g, q.secId, 5_000)).toBe(true)
    expect(investmentHoldings(g)).toHaveLength(1)
    expect(a.details.basis).toBe(15_000)
    expect(a.details.units as number).toBeGreaterThan(units1 * 1.45)
    expect(g.queue.filter((m) => m.kind === 'notice' && m.title === 'Order Filled')).toHaveLength(2)

    // Selling right away loses only the fees, which carry forward as a capital loss.
    const before = g.character.money
    const value = a.value
    expect(sellHolding(g, a.id, 'all')).toBe(true)
    expect(investmentHoldings(g)).toHaveLength(0)
    const got = g.character.money - before
    expect(got).toBeLessThan(value)
    expect(got).toBeGreaterThan(value * 0.99)
    expect(g.character.money).toBeLessThan(100_000)
    expect(g.flags.investLossCarry as number).toBeGreaterThan(0)
    expect(g.flags.taxesPaid ?? 0).toBe(0)
    sane(g)
  })

  it('sells part of a position and keeps the rest', () => {
    const g = adult('gb', 50_000)
    const q = quote(g, 'index')
    buySecurity(g, q.secId, 20_000)
    const a = investmentHoldings(g)[0]
    const units = a.details.units as number
    const value = a.value
    expect(sellHolding(g, a.id, 5_000)).toBe(true)
    expect(investmentHoldings(g)).toHaveLength(1)
    expect(a.details.units as number).toBeCloseTo(units * (1 - 5_000 / value), 4)
    expect(a.details.basis as number).toBeLessThan(20_000)
    sane(g)
  })

  it("taxes realized gains at the nation's capital gains rate, after carried-forward losses", () => {
    const g = adult('us', 200_000)
    g.flags.taxableIncome = 80_000
    const q = quote(g, 'stock', 0)
    buySecurity(g, q.secId, 50_000)
    const a = investmentHoldings(g)[0]
    // The stock doubles.
    a.details.price = (a.details.price as number) * 2
    a.value = Math.round((a.details.units as number) * (a.details.price as number))
    g.flags.investLossCarry = 5_000
    const before = g.character.money
    const basis = a.details.basis as number
    sellHolding(g, a.id, 'all')
    // R2-L13 (F38): the tax is the capital gains rate on the gain after the old losses, withheld at the sale and booked to the
    // government as tax.capgains. It no longer comes through taxable income or the income tax's credit.
    const tax = flowTotal(g, 'tax.capgains', 'gov')
    expect(tax).toBeGreaterThan(0)
    // Roughly 50K gain, 5K offset by old losses, taxed at a US rate.
    expect(tax).toBeGreaterThan(45_000 * 0.15)
    expect(tax).toBeLessThan(45_000 * 0.5)
    const net = -flowTotal(g, 'trade.sell', 'pool')
    expect(tax).toBe(Math.round((net - basis - 5_000) * capitalGainsRate(g)))
    expect(g.flags.investLossCarry).toBe(0)
    expect(g.flags.taxesPaid ?? 0).toBe(0)
    const fee = Math.round(a.value * 0.0012)
    expect(net).toBeGreaterThan(a.value - fee * 3)
    expect(g.character.money - before).toBe(net - tax)
    const n = g.queue.filter((m) => m.kind === 'notice' && m.title === 'Order Filled').pop()
    expect(n && n.kind === 'notice' ? n.text : '').toMatch(/Profit: .* capital gains tax/)
  })

  it('rejects bad orders', () => {
    const g = adult('us', 1_000)
    const q = quote(g, 'stock')
    expect(buySecurity(g, q.secId, 5)).toBe(false)
    expect(buySecurity(g, q.secId, 5_000)).toBe(false)
    expect(buySecurity(g, q.secId, Number.NaN)).toBe(false)
    expect(buySecurity(g, 'nope', 500)).toBe(false)
    expect(g.character.money).toBe(1_000)
    expect(investmentHoldings(g)).toHaveLength(0)
    const kid = makeTestGame(1, { age: 15, money: 10_000 })
    expect(buySecurity(kid, quote(kid, 'stock').secId, 500)).toBe(false)
    expect(investmentHoldings(kid)).toHaveLength(0)
    expect(minTrade(g)).toBeGreaterThan(0)
  })

  it('bans crypto where it is banned, but lets you sell what you own', () => {
    const g = adult('cn', 50_000)
    const coin = quote(g, 'crypto')
    expect(buySecurity(g, coin.secId, 1_000)).toBe(false)
    const us = adult('us', 50_000)
    const c2 = quote(us, 'crypto')
    expect(buySecurity(us, c2.secId, 1_000)).toBe(true)
    us.character.countryId = 'cn'
    const a = investmentHoldings(us)[0]
    expect(sellHolding(us, a.id, 'all')).toBe(true)
  })

  it('charges a penalty for breaking a term deposit early', () => {
    const g = adult('us', 50_000)
    const term = investmentListing(g).find((q) => q.secId.startsWith('term:'))!
    buySecurity(g, term.secId, 10_000)
    const a = investmentHoldings(g)[0]
    expect(a.details.maturity).toBe(g.year + 3)
    const before = g.character.money
    sellHolding(g, a.id, 'all')
    expect(g.character.money - before).toBeLessThan(10_000 - 100)
    const n = g.queue.find((m) => m.kind === 'notice' && m.title === 'Withdrawal')
    expect(n && n.kind === 'notice' ? n.text : '').toMatch(/penalty/)
  })

  it('liquidates everything at once', () => {
    const g = adult('de', 100_000)
    buySecurity(g, quote(g, 'stock').secId, 10_000)
    buySecurity(g, quote(g, 'gold').secId, 10_000)
    buySecurity(g, quote(g, 'bond').secId, 10_000)
    expect(investmentHoldings(g)).toHaveLength(3)
    expect(liquidatePortfolio(g)).toBe(true)
    expect(investmentHoldings(g)).toHaveLength(0)
    expect(g.character.money).toBeGreaterThan(99_000)
  })

  it('works through the menu actions', () => {
    const g = adult('jp', 30_000)
    const stocks = findNode(children(g, investmentsMenu), 'inv-stocks') as MenuGroup
    const offer = stocks.children(g).find((n) => n.type === 'menu') as MenuGroup
    const buy = offer.children(g).find((n) => n.type === 'action' && n.id.startsWith('inv-buy-')) as MenuAction
    expect(buy.input?.max).toBe(30_000)
    expect(buy.disabledReason?.(g)).toBeNull()
    buy.run(g, '2500')
    expect(investmentHoldings(g)).toHaveLength(1)
    const view = investmentAssetView(g, investmentHoldings(g)[0])
    const sellAll = view.find((n) => n.id.startsWith('inv-sellall-')) as MenuAction
    expect(sellAll.confirm?.(g)).toMatch(/Sell all/)
    sellAll.run(g)
    expect(investmentHoldings(g)).toHaveLength(0)
  })
})

describe('the yearly market', () => {
  it('is deterministic for the same seed', () => {
    const run = () => {
      const g = adult('kr', 500_000, 42)
      for (const t of ['stock', 'index', 'crypto', 'penny', 'gold', 'bond', 'savings', 'reit']) buySecurity(g, quote(g, t).secId, 20_000)
      for (let i = 0; i < 20; i++) passYear(g)
      return JSON.stringify({ m: g.character.money, a: g.assets, f: g.flags })
    }
    expect(run()).toEqual(run())
  })

  it('stays sane over 40 years and pays taxable income', () => {
    for (const cid of ['us', 'jp', 've', 'tr', 'ng', 'ch', 'ws']) {
      const g = adult(cid, 1_000_000, 11)
      for (const t of ['stock', 'index', 'crypto', 'penny', 'gold', 'bond', 'savings', 'reit']) buySecurity(g, quote(g, t).secId, 50_000)
      buySecurity(g, investmentListing(g).find((q) => q.secId.startsWith('term:'))!.secId, 20_000)
      let paid = 0
      for (let i = 0; i < 40; i++) {
        const popups = passYear(g)
        expect(popups, `${cid} popups in year ${i}`).toBeLessThanOrEqual(1)
        paid += (g.flags.taxableIncome as number) || 0
        sane(g)
        expect(investmentsSummary(g)).not.toMatch(/NaN|undefined/)
        // Keep trading now and then.
        if (i % 7 === 3) {
          const q = quote(g, 'index')
          if (g.character.money > 1_000) buySecurity(g, q.secId, 1_000)
        }
      }
      expect(paid, `${cid} dividends and interest`).toBeGreaterThan(0)
    }
  })

  it('grows the index near its long-run drift', () => {
    for (const cid of ['us', 'jp', 'gb', 'br', 'in']) {
      const info = exchangeInfo(cid)
      const cagrs: number[] = []
      for (let s = 0; s < 150; s++) {
        let total = 0
        for (let y = 2031; y <= 2070; y++) total += indexMove(`fam${s}`, info, y).logRet
        cagrs.push(Math.exp(total / 40) - 1)
      }
      cagrs.sort((a, b) => a - b)
      const median = cagrs[75]
      expect(Math.abs(median - info.ex.drift), `${cid} median ${median}`).toBeLessThan(0.02)
    }
  })

  it('shares market health across every holding on an exchange', () => {
    const info = exchangeInfo('jp')
    let crashes = 0
    for (let y = 2001; y <= 2200; y++) {
      const ey = exchangeYear('shared', 2000, info, y)
      if (ey.index.ret <= -0.25) {
        crashes++
        const live = ey.stocks.filter((s) => !s.event && !s.ended)
        const avg = live.reduce((sum, s) => sum + s.ret, 0) / Math.max(1, live.length)
        expect(avg, `year ${y}`).toBeLessThan(0)
      }
    }
    expect(crashes).toBeGreaterThan(0)
  })

  it('lets crypto crash 70% or more', () => {
    let worst = 0
    for (let y = 2001; y <= 2100; y++) worst = Math.min(worst, cryptoYear('cryptofam', 2000, y).ret)
    expect(worst).toBeLessThanOrEqual(-0.7)
  })

  it('wipes out holders when a government defaults', () => {
    // Find a family whose Venezuelan bonds default in the first years.
    let fam = ''
    let year = 0
    for (let s = 0; s < 400 && !fam; s++) {
      for (let y = 2027; y <= 2030; y++) {
        if (fxYear(`ve${s}`, 've', y).defaulted) {
          fam = `ve${s}`
          year = y
          break
        }
      }
    }
    expect(fam).not.toBe('')
    const g = adult('ve', 100_000)
    g.lifeId = fam
    buySecurity(g, quote(g, 'bond').secId, 10_000)
    const a = investmentHoldings(g)[0]
    let titles: string[] = []
    while (g.year < year) {
      g.year += 1
      g.character.age += 1
      g.queue = []
      const before = a.value
      yearlyInvestments(g)
      titles = g.queue.flatMap((m) => (m.kind === 'notice' ? [m.title] : []))
      if (g.year === year) expect(a.value).toBeLessThan(before * 0.7)
    }
    expect(titles).toContain('Government Default')
    sane(g)
  })

  it('caps bank-failure losses at the deposit guarantee, across all your accounts', () => {
    let fam = ''
    for (let s = 0; s < 2000 && !fam; s++) if (fxYear(`lb${s}`, 'lb', 2027).bankCrisis) fam = `lb${s}`
    expect(fam).not.toBe('')
    const g = adult('lb', 300_000)
    g.lifeId = fam
    buySecurity(g, investmentListing(g).find((q) => q.secId.startsWith('savings:'))!.secId, 100_000)
    buySecurity(g, investmentListing(g).find((q) => q.secId.startsWith('term:'))!.secId, 100_000)
    expect(g.year).toBe(2026)
    passYearKeepQueue(g)
    const total = investmentHoldings(g).reduce((sum, a) => sum + a.value, 0)
    expect(total).toBeLessThan(150_000)
    expect(total).toBeGreaterThan(0)
    expect(g.queue.some((m) => m.kind === 'notice' && m.title === 'Bank Collapse')).toBe(true)
    sane(g)
  })

  it('uses the guarantee law from the crisis year rather than modern deposit insurance', () => {
    const g = adult('us', 200_000)
    g.year = 1929
    const savings = investmentListing(g).find((q) => q.secId.startsWith('savings:'))
    expect(savings).toBeTruthy()
    expect(buySecurity(g, savings!.secId, 100_000)).toBe(true)
    const before = investmentHoldings(g)[0].value

    passYearKeepQueue(g)

    expect(g.year).toBe(1930)
    expect(investmentHoldings(g)[0].value).toBeLessThan(before * .9)
    expect(g.queue.some((m) => m.kind === 'notice' && m.title === 'Bank Collapse' && m.text.includes('$0'))).toBe(true)
    sane(g)
  })

  it('pays government bonds back at maturity', () => {
    const g = adult('de', 50_000)
    const bond = quote(g, 'bond')
    expect(bond.name).toMatch(/due 2036/)
    buySecurity(g, bond.secId, 10_000)
    const cash = g.character.money
    let coupons = 0
    for (let i = 0; i < 10; i++) {
      passYear(g)
      coupons += (g.flags.taxableIncome as number) || 0
    }
    expect(investmentHoldings(g)).toHaveLength(0)
    expect(coupons).toBeGreaterThan(0)
    // Coupons plus the principal (German inflation is low, so the euro barely moves).
    expect(g.character.money - cash).toBeGreaterThan(10_000)
    // An old issue can't be topped up.
    const g2 = adult('de', 50_000)
    buySecurity(g2, quote(g2, 'bond').secId, 5_000)
    passYear(g2)
    const old = investmentHoldings(g2)[0]
    expect(investmentAssetView(g2, old).some((n) => n.id.startsWith('inv-buy-'))).toBe(false)
  })

  it('compounds deposit interest into the balance and taxes it as income', () => {
    const g = adult('us', 50_000)
    buySecurity(g, investmentListing(g).find((q) => q.secId.startsWith('savings:'))!.secId, 20_000)
    const cash = g.character.money
    passYear(g)
    const a = investmentHoldings(g)[0]
    const interest = g.flags.taxableIncome as number
    expect(interest).toBeGreaterThan(0)
    expect(g.character.money).toBe(cash)
    expect(a.details.basis).toBe(20_000 + interest)
    expect(a.value).toBeGreaterThan(20_000)
  })

  it('repairs a future settlement guard and remains idempotent afterward', () => {
    const g = adult('us', 50_000)
    expect(buySecurity(g, quote(g, 'index').secId, 10_000)).toBe(true)
    g.flags.investmentsSettledYear = 100_000

    yearlyInvestments(g)

    expect(g.flags.investmentsSettledYear).toBe(g.year)
    sane(g)
    const settled = JSON.stringify(g)
    yearlyInvestments(g)
    expect(JSON.stringify(g)).toBe(settled)
  })

  it('bounds malformed astronomical positions and rejects oversized orders before spending', () => {
    const g = adult('us', 1e16)
    g.assets.push({
      id: 'malformed-investment', kind: 'investment', name: 'Malformed Savings', emoji: '🏦',
      purchasePrice: 1e308, value: Number.POSITIVE_INFINITY, condition: 100,
      purchasedAge: g.character.age, upkeep: 0,
      details: { type: 'savings', secId: 'savings:us:malformed', country: 'us', product: 'savings', yield: .02, units: 1e308, price: 1e308, basis: 1e308 },
    })
    expect(investmentsSummary(g)).not.toMatch(/NaN|Infinity/)
    yearlyInvestments(g)
    sane(g)

    const bank = g.character.money
    expect(buySecurity(g, quote(g, 'index').secId, 1e16)).toBe(false)
    expect(g.character.money).toBe(bank)
  })

  it('does not turn an overflowed acquisition settlement into a maximum-size windfall', () => {
    const g = adult('us', 0, 7)
    const info = exchangeInfo('us')
    const acquisitionYear = 2031
    const acquired = exchangeYear(g.lifeId, g.year - g.character.age, info, acquisitionYear).stocks.find((s) => s.ended?.kind === 'acquired')
    expect(acquired?.ended).toBeTruthy()
    if (!acquired?.ended) throw new Error('expected deterministic acquisition')

    g.character.age += acquisitionYear - g.year
    g.year = acquisitionYear
    const priorValue = 100_000_000
    g.assets.push({
      id: 'malformed-acquisition', kind: 'investment', name: 'Malformed Shares', emoji: '📈',
      purchasePrice: priorValue, value: priorValue, condition: 100,
      purchasedAge: g.character.age - 1, upkeep: 0,
      details: {
        type: 'stock', secId: acquired.ended.id, country: 'us', eng: 2,
        exKey: info.key, exchange: info.ex.code, slot: acquired.slot,
        units: 1e308, price: 1e-300, basis: priorValue,
      },
    })

    yearlyInvestments(g)

    const expected = Math.round(priorValue * (1 + acquired.ended.premium))
    // R2-L13 (F38): a gain pays the capital gains tax at the settlement, so the cash is the proceeds less that tax. The proceeds
    // themselves, read from the ledger's sale row, are the bounded settlement and nothing more.
    expect(-flowTotal(g, 'trade.sell', 'pool')).toBe(expected)
    expect(g.character.money).toBe(expected - capitalGainsTax(g, expected, priorValue))
    expect(g.character.money).toBeLessThan(1e15)
    expect(investmentHoldings(g)).toHaveLength(0)

    // A coherent finite position at the supported cap still receives the capped settlement.
    const capped = adult('us', 0, 7)
    capped.character.age += acquisitionYear - capped.year
    capped.year = acquisitionYear
    const priorPrice = acquired.ended.perUnit / (1 + acquired.ended.premium)
    capped.assets.push({
      id: 'capped-acquisition', kind: 'investment', name: 'Capped Shares', emoji: '📈',
      purchasePrice: 1e15, value: 1e15, condition: 100,
      purchasedAge: capped.character.age - 1, upkeep: 0,
      details: {
        type: 'stock', secId: acquired.ended.id, country: 'us', eng: 2,
        exKey: info.key, exchange: info.ex.code, slot: acquired.slot,
        units: 1e15 / priorPrice, price: priorPrice, basis: 1e15,
      },
    })

    yearlyInvestments(capped)

    expect(capped.character.money).toBe(1e15)
    expect(investmentHoldings(capped)).toHaveLength(0)
  })

  it('keeps holdings on their own exchange after emigrating', () => {
    const g = adult('jp', 100_000)
    buySecurity(g, quote(g, 'stock').secId, 10_000)
    const a = investmentHoldings(g)[0]
    expect(a.details.exchange).toBe('TSE')
    g.character.countryId = 'gb'
    passYear(g)
    expect(investmentAssetSubtitle(g, investmentHoldings(g)[0] ?? a)).toMatch(/TSE|\$/)
    expect(quote(g, 'stock').exchange).toBe('LSE')
    sane(g)
  })
})

describe('saves and summaries', () => {
  it('handles old saves without investment data', () => {
    const g = adult('fr')
    delete g.flags.investLossCarry
    expect(() => yearlyInvestments(g)).not.toThrow()
    expect(investmentsSummary(g)).toBe('')
    expect(() => children(g, investmentsMenu)).not.toThrow()
    // A malformed holding from some older version still moves and renders.
    const broken: Asset = { id: 'x1', kind: 'investment', name: 'Mystery Shares', emoji: '📈', purchasePrice: 1000, value: 1000, condition: 100, purchasedAge: 25, upkeep: 0, details: {} }
    g.assets.push(broken)
    expect(investmentAssetSubtitle(g, broken)).toMatch(/^\$1,000/)
    const cash = g.character.money
    for (let i = 0; i < 5; i++) passYear(g)
    // It can't be priced any more, so it was cashed out at its last value.
    expect(investmentHoldings(g)).toHaveLength(0)
    expect(g.character.money).toBe(cash + 1000)
    sane(g)
    expect(investmentsSummary(g)).not.toMatch(/NaN|undefined/)
  })

  it('summarizes the portfolio for the AI', () => {
    const g = adult('jp', 500_000)
    buySecurity(g, quote(g, 'index').secId, 50_000)
    buySecurity(g, quote(g, 'stock', 0).secId, 10_000)
    buySecurity(g, quote(g, 'stock', 1).secId, 10_000)
    buySecurity(g, quote(g, 'stock', 2).secId, 10_000)
    buySecurity(g, quote(g, 'crypto').secId, 5_000)
    passYear(g)
    const s = investmentsSummary(g)
    expect(s).toMatch(/^Portfolio \$\d+K: Nikkei 225 index fund, 3 stocks, some crypto; (up|down) \d+% this year$/)
  })
})
