// The second listed class of a real company (Alphabet's Class C, Berkshire's Class B, Tata Motors' DVR
// shares...). A line is part of its company's screen: it is not in the Stocks list or in
// investmentListing, its id is '<company id>~<letter>', its price is the company's price plus a fixed
// spread for its votes, and a holding in it moves, splits, is renamed and ends with its company. When the
// line's own last year passes, the holder is paid out as delisted. Nothing here reads g.rng.
import { describe, expect, it } from 'vitest'
import { findTarget, listedTargets } from '../src/game/computer/money-stocks'
import { netWorth } from '../src/game/core'
import { companyKey, exchangeInfo, lineLetter, slotPlan, type SecYear } from '../src/game/invest/engine'
import { CLASS_ENTRIES, linesOf, lineOpen, lineSecId, lineSpread, lineYear } from '../src/game/invest/class-data'
import { addMarketShock, marketShocks } from '../src/game/invest/shocks'
import { buySecurity, investmentAssetView, investmentHoldings, investmentListing, investmentsMenu, revalueHoldings, yearlyInvestments } from '../src/game/investments'
import type { Asset, GameState, MenuAction, MenuGroup, MenuNode } from '../src/game/types'
import { deepFreeze, FailureLog, probeActions, renderAll } from './fuzz-kit'
import { makeTestGame } from './helpers'

function resident(countryId: string, year: number, seed = 9, money = 5_000_000): GameState {
  const g = makeTestGame(seed, { age: 30, money, countryId, residence: { status: 'renting', rent: 0 } })
  g.lifeId = `class-lines-${countryId}-${seed}-${year}`
  g.year = year
  g.log = [{ age: 30, year, entries: [] }]
  return g
}

function passYear(g: GameState): void {
  g.year += 1
  g.character.age += 1
  g.yearActions = {}
  g.flags.taxableIncome = 0
  g.queue = []
  yearlyInvestments(g)
  g.queue = []
}

function stocksOf(g: GameState): MenuGroup {
  return investmentsMenu.children(g).find((n) => n.id === 'inv-stocks') as MenuGroup
}

/** The company's id on this game's exchange, by the name it has this year. */
function companyId(g: GameState, name: string): string {
  const q = investmentListing(g).find((x) => x.type === 'stock' && x.name === name)
  if (!q) throw new Error(`${name} is not listed`)
  return q.secId
}

function offerFor(g: GameState, name: string): MenuGroup {
  const node = stocksOf(g).children(g).find((n) => n.id === `inv-offer-${companyId(g, name)}`)
  if (!node || node.type !== 'menu') throw new Error(`no offer node for ${name}`)
  return node
}

function textOf(n: MenuNode, g: GameState): string {
  return n.type === 'info' ? (typeof n.text === 'string' ? n.text : n.text(g)) : ''
}

function lineHeadings(g: GameState, name: string): MenuNode[] {
  return offerFor(g, name).children(g).filter((n) => n.id.startsWith('inv-oline-'))
}

function actionOn(g: GameState, node: MenuGroup, id: string): MenuAction {
  const a = node.children(g).find((n) => n.id === id)
  if (!a || a.type !== 'action') throw new Error(`no action ${id}`)
  return a
}

function holdingOf(g: GameState, secId: string): Asset {
  const a = investmentHoldings(g).find((x) => x.details.secId === secId)
  if (!a) throw new Error(`no holding in ${secId}`)
  return a
}

describe('the second listed class of a real company', () => {
  it('a company with a listed second class shows it on its screen', () => {
    const g = resident('us', 2020)
    const id = companyId(g, 'Alphabet')
    const line = `${id}~C`
    const offer = offerFor(g, 'Alphabet')
    const kids = offer.children(g)
    expect(kids.some((n) => n.type === 'heading' && n.id === `inv-oline-${line}`)).toBe(true)
    const buy = actionOn(g, offer, `inv-buy-${line}`)
    expect(buy.disabledReason?.(g)).toBeNull()
    // The main line keeps its own Buy.
    expect(kids.some((n) => n.type === 'action' && n.id === `inv-buy-${id}`)).toBe(true)
    // The line's facts: five-letter ticker ending in C, no vote.
    const heading = kids.find((n) => n.id === `inv-oline-${line}`)
    expect(heading && heading.type === 'heading' ? heading.label : '').toMatch(/^Class C \([A-Z]{4}C\)$/)
    const text = kids.map((n) => textOf(n, g)).join('\n')
    expect(text).toMatch(/Class C has no vote\./)
    // Its price is the main price times 0.96. Prices over $1,000 show whole dollars, so allow for that.
    const prices = kids.filter((n) => n.type === 'info').map((n) => textOf(n, g)).filter((t) => t.startsWith('Price: '))
    expect(prices).toHaveLength(2)
    const [main, second] = prices.map((t) => Number(/Price: \$([\d,.]+)/.exec(t)![1].replace(/,/g, '')))
    expect(Math.abs(second - main * 0.96)).toBeLessThanOrEqual(main >= 1_000 ? 1 : 0.011)
  })

  it('the line is priced at the company price times its spread, to the cent', () => {
    const g = resident('us', 2020, 9, 50_000_000)
    const id = companyId(g, 'Alphabet')
    expect(buySecurity(g, id, 10_000)).toBe(true)
    expect(buySecurity(g, `${id}~C`, 10_000)).toBe(true)
    const main = holdingOf(g, id)
    const line = holdingOf(g, `${id}~C`)
    const ratio = Number(line.details.price) / Number(main.details.price)
    expect(ratio).toBeGreaterThan(0.96 - 1e-4)
    expect(ratio).toBeLessThan(0.96 + 1e-4)
    expect(String(line.details.symbol)).toMatch(/^[A-Z]{4}C$/)
    expect(String(line.details.symbol)).toBe(`${String(main.details.symbol)}C`)
  })

  it('not before the class existed, and not after it ended', () => {
    expect(lineHeadings(resident('us', 2013), 'Google')).toHaveLength(0)
    expect(lineHeadings(resident('us', 2014), 'Google')).toHaveLength(1)
    expect(lineHeadings(resident('us', 1995), 'Berkshire Hathaway')).toHaveLength(0)
    const b96 = lineHeadings(resident('us', 1996), 'Berkshire Hathaway')
    expect(b96).toHaveLength(1)
    expect(b96[0].id).toMatch(/~B$/)
    expect(lineHeadings(resident('in', 2024), 'Tata Motors')).toHaveLength(1)
    expect(lineHeadings(resident('in', 2025), 'Tata Motors')).toHaveLength(0)
  })

  it('a company with no listed second class has no line', () => {
    expect(lineHeadings(resident('us', 2020), 'Apple')).toHaveLength(0)
    // Meta's Class B exists but is not listed: facts only.
    expect(lineHeadings(resident('us', 2022), 'Meta Platforms')).toHaveLength(0)
  })

  it('lines stay out of the list and the helpers', () => {
    for (const [country, year] of [['us', 2020], ['us', 1996], ['in', 2024], ['de', 2020], ['se', 2020]] as const) {
      const g = resident(country, year)
      const list = investmentListing(g)
      expect(list.some((q) => q.secId.includes('~'))).toBe(false)
      const offers = stocksOf(g).children(g).filter((n) => n.type === 'menu' && n.id.startsWith('inv-offer-'))
      expect(offers.length).toBe(slotPlan(exchangeInfo(country)).length)
      const tickers = list.filter((q) => q.type === 'stock').map((q) => q.symbol)
      expect(new Set(tickers).size).toBe(tickers.length)
    }
  })

  it('a line ticker is five letters, so no four-letter ticker equals one', () => {
    const g = resident('de', 2020)
    const listed = investmentListing(g).filter((q) => q.type === 'stock')
    const taken = new Set(listed.map((q) => q.symbol))
    for (const e of CLASS_ENTRIES) {
      for (const r of e.rows) {
        if (!r.listed) continue
        for (const q of listed) expect(taken.has(`${q.symbol}${r.letter}`)).toBe(false)
      }
    }
  })

  it('buying a line makes a holding', () => {
    const twin = resident('us', 2020)
    const g = resident('us', 2020)
    const id = companyId(g, 'Alphabet')
    const worth = netWorth(g)
    expect(buySecurity(twin, id, 10_000)).toBe(true)
    const fee = worth - netWorth(twin)
    expect(buySecurity(g, `${id}~C`, 10_000)).toBe(true)
    const held = investmentHoldings(g)
    expect(held).toHaveLength(1)
    expect(held[0].details.secId).toBe(`${id}~C`)
    expect(held[0].details.classOf).toBe(id)
    expect(held[0].name.endsWith('(Class C)')).toBe(true)
    expect(held[0].name).toBe('Alphabet (Class C)')
    // Net worth falls by the fee, the same as for the main line.
    expect(worth - netWorth(g)).toBeLessThanOrEqual(fee + 1)
    expect(worth - netWorth(g)).toBeGreaterThanOrEqual(0)
    // A second buy tops the same holding up.
    expect(buySecurity(g, `${id}~C`, 5_000)).toBe(true)
    expect(investmentHoldings(g)).toHaveLength(1)
  })

  it('the portfolio screen of a line holding can buy and sell it', () => {
    const g = resident('us', 2020)
    const id = companyId(g, 'Alphabet')
    buySecurity(g, `${id}~C`, 10_000)
    const view = investmentAssetView(g, holdingOf(g, `${id}~C`))
    expect(view.some((n) => n.id === `inv-buy-${id}~C`)).toBe(true)
    expect(view.some((n) => n.id.startsWith('inv-sellall-'))).toBe(true)
  })

  it('a holding moves with its company', () => {
    const g = resident('us', 2020, 9, 50_000_000)
    const id = companyId(g, 'Alphabet')
    buySecurity(g, id, 10_000)
    buySecurity(g, `${id}~C`, 10_000)
    const before = { main: holdingOf(g, id).value, line: holdingOf(g, `${id}~C`).value }
    passYear(g)
    const main = holdingOf(g, id)
    const line = holdingOf(g, `${id}~C`)
    const moved = (now: number, was: number) => now / was - 1
    expect(Math.abs(moved(main.value, before.main))).toBeGreaterThan(0.0001)
    expect(Math.abs(moved(line.value, before.line) - moved(main.value, before.main))).toBeLessThan(0.001)
    // The same last-change figure, to the engine's rounding.
    expect(Math.abs(Number(line.details.lastChange) - Number(main.details.lastChange))).toBeLessThan(0.001)
  })

  it('a split splits the line (in the engine)', () => {
    // On this seed Berkshire does a 3-for-1 split in 2000, one year after the game starts.
    const g = resident('us', 1999, 5, 50_000_000)
    const id = companyId(g, 'Berkshire Hathaway')
    expect(buySecurity(g, id, 10_000)).toBe(true)
    expect(buySecurity(g, `${id}~B`, 10_000)).toBe(true)
    const units = (secId: string) => Number(holdingOf(g, secId).details.units)
    const before = { main: units(id), line: units(`${id}~B`), mainValue: holdingOf(g, id).value, lineValue: holdingOf(g, `${id}~B`).value }
    passYear(g)
    expect(g.year).toBe(2000)
    expect(units(id) / before.main).toBeCloseTo(3, 6)
    expect(units(`${id}~B`) / before.line).toBeCloseTo(3, 6)
    // The value follows the market, not the split: both holdings moved alike.
    const moved = (secId: string, was: number) => holdingOf(g, secId).value / was - 1
    expect(Math.abs(moved(`${id}~B`, before.lineValue) - moved(id, before.mainValue))).toBeLessThan(0.001)
    expect(g.log.flatMap((y) => y.entries).some((e) => /3-for-1 stock split/.test(e.text))).toBe(true)
  })

  it('a split splits the line (pure)', () => {
    const cur: SecYear = { id: 'NYSE:S&P 500#s1g100001', slot: 1, gen: 100001, price: 50, ret: 0.1, payout: 0.02, ratio: 2, event: 'split' }
    const copy = JSON.stringify(cur)
    const out = lineYear(cur, 'C', -0.04)
    expect(out.id).toBe('NYSE:S&P 500#s1g100001~C')
    expect(out.price).toBeCloseTo(48, 10)
    expect(out.ratio).toBe(2)
    expect(out.event).toBe('split')
    expect(out.ret).toBe(0.1)
    expect(out.payout).toBe(0.02)
    expect(out.slot).toBe(1)
    expect(out.gen).toBe(100001)
    expect(JSON.stringify(cur)).toBe(copy)
  })

  it('the company ending pays the line (pure)', () => {
    const cur: SecYear = { id: 'X#s1g100002', slot: 1, gen: 100002, price: 30, ret: 0, payout: 0, ended: { id: 'X#s1g100001', kind: 'acquired', perUnit: 10, premium: 0.2 } }
    const copy = JSON.stringify(cur)
    const out = lineYear(cur, 'C', -0.04)
    expect(out.id).toBe('X#s1g100002~C')
    expect(out.ended?.id).toBe('X#s1g100001~C')
    expect(out.ended?.perUnit).toBeCloseTo(9.6, 10)
    expect(out.ended?.kind).toBe('acquired')
    expect(out.ended?.premium).toBe(0.2)
    expect(JSON.stringify(cur)).toBe(copy)
    // A filler without an ending stays without one.
    expect(lineYear({ ...cur, ended: undefined }, 'B', 0.03).ended).toBeUndefined()
    // A damaged spread is no spread at all.
    expect(lineYear(cur, 'C', Number.NaN).price).toBe(30)
    expect(lineYear(cur, 'C', Number.POSITIVE_INFINITY).price).toBe(30)
  })

  it("a line's own last year cashes it out", () => {
    const g = resident('in', 2024)
    const id = companyId(g, 'Tata Motors')
    expect(buySecurity(g, `${id}~D`, 10_000)).toBe(true)
    const marked = holdingOf(g, `${id}~D`).value
    const bank = g.character.money
    passYear(g)
    expect(g.year).toBe(2025)
    expect(investmentHoldings(g).some((a) => a.details.secId === `${id}~D`)).toBe(false)
    // The position came back as cash at its last price, not as a loss of the position.
    expect(g.character.money).toBeGreaterThan(bank + marked * 0.98)
    expect(g.character.money).toBeLessThan(bank + marked * 1.02)
    expect(g.log.flatMap((y) => y.entries).some((e) => /delisted|landed in my bank/.test(e.text))).toBe(true)
  })

  it('selling a line pays like selling any stock', () => {
    const g = resident('us', 2020)
    const id = companyId(g, 'Alphabet')
    const line = `${id}~C`
    buySecurity(g, line, 20_000)
    const a = holdingOf(g, line)
    const value = a.value
    const cash = g.character.money
    const offer = offerFor(g, 'Alphabet')
    const sell = actionOn(g, offer, `inv-sell-${a.id}`)
    expect(sell.disabledReason?.(g)).toBeNull()
    sell.run(g, String(Math.round(value / 2)))
    const after = holdingOf(g, line)
    expect(after.value).toBeGreaterThan(value / 2 - 30)
    expect(after.value).toBeLessThan(value / 2 + 30)
    // Cash rises by about half the value, less the broker fee.
    expect(g.character.money).toBeGreaterThan(cash + value / 2 - 600)
    expect(g.character.money).toBeLessThan(cash + value / 2 + 30)
    // The order flow is on the line, never on the company.
    const flow = marketShocks(g).filter((s) => s.cause === 'liquidity')
    expect(flow.some((s) => s.secId === line)).toBe(true)
    expect(flow.some((s) => s.secId === id)).toBe(false)
  })

  it('a reload keeps the holding', () => {
    const g = resident('us', 2020)
    const id = companyId(g, 'Alphabet')
    buySecurity(g, `${id}~C`, 10_000)
    buySecurity(g, id, 10_000)
    const copy: GameState = JSON.parse(JSON.stringify(g))
    const screen = (x: GameState) => {
      const held = investmentHoldings(x)
      return JSON.stringify({
        held: held.map((a) => [a.name, a.value, a.details.secId]),
        header: typeof investmentsMenu.header === 'function' ? investmentsMenu.header(x) : investmentsMenu.header,
        offer: offerFor(x, 'Alphabet').children(x).map((n) => [n.id, textOf(n, x)]),
        views: held.map((a) => investmentAssetView(x, a).map((n) => [n.id, textOf(n, x)])),
      })
    }
    expect(screen(copy)).toBe(screen(g))
    passYear(g)
    passYear(copy)
    expect(investmentHoldings(copy).map((a) => [a.name, a.value, a.details.secId])).toEqual(investmentHoldings(g).map((a) => [a.name, a.value, a.details.secId]))
    expect(investmentHoldings(copy)).toHaveLength(2)
  })

  it('a line held for twelve years, through a rename and a reload, is never cashed out by accident', () => {
    let g = resident('us', 2014, 9, 50_000_000)
    const id = companyId(g, 'Google')
    expect(buySecurity(g, `${id}~C`, 10_000)).toBe(true)
    for (let i = 0; i < 12; i++) {
      passYear(g)
      if (i === 5) g = JSON.parse(JSON.stringify(g)) as GameState
      const held = investmentHoldings(g)
      expect(held, `year ${g.year}`).toHaveLength(1)
      expect(held[0].details.secId).toBe(`${id}~C`)
      expect(held[0].value).toBeGreaterThan(0)
      expect(held[0].name).toBe(g.year >= 2015 ? 'Alphabet (Class C)' : 'Google (Class C)')
    }
    expect(g.year).toBe(2026)
  })

  it('the same seed gives the same game with a line in it', () => {
    const run = () => {
      const g = resident('us', 2014, 21, 50_000_000)
      const id = companyId(g, 'Google')
      buySecurity(g, `${id}~C`, 10_000)
      buySecurity(g, id, 5_000)
      for (let i = 0; i < 6; i++) passYear(g)
      return JSON.stringify({ m: g.character.money, a: g.assets, f: g.flags })
    }
    expect(run()).toBe(run())
  })

  it('order flow stays on the line and is kept', () => {
    const g = resident('us', 2020)
    const id = companyId(g, 'Alphabet')
    buySecurity(g, `${id}~C`, 10_000)
    const flowOn = (x: GameState, secId: string) => marketShocks(x).filter((s) => s.cause === 'liquidity' && s.secId === secId)
    expect(flowOn(g, `${id}~C`)).toHaveLength(1)
    expect(flowOn(g, id)).toHaveLength(0)
    passYear(g)
    expect(flowOn(g, `${id}~C`)).toHaveLength(1)
    expect(flowOn(g, id)).toHaveLength(0)
  })

  it("a line's order flow is dropped once its class is gone", () => {
    const g = resident('in', 2024)
    const id = companyId(g, 'Tata Motors')
    buySecurity(g, `${id}~D`, 10_000)
    const flow = () => marketShocks(g).filter((s) => s.secId === `${id}~D`)
    expect(flow()).toHaveLength(1)
    passYear(g) // 2025: the holding is paid out; its last year (2024) still counts
    expect(investmentHoldings(g)).toHaveLength(0)
    expect(flow()).toHaveLength(1)
    passYear(g) // 2026: nothing of the line trades any more
    expect(flow()).toHaveLength(0)
  })

  it('a line is renamed with its company', () => {
    const g = resident('us', 2014)
    const id = companyId(g, 'Google')
    expect(buySecurity(g, `${id}~C`, 10_000)).toBe(true)
    expect(holdingOf(g, `${id}~C`).name).toBe('Google (Class C)')
    passYear(g)
    expect(holdingOf(g, `${id}~C`).name).toBe('Alphabet (Class C)')
    const lines = g.log.flatMap((y) => y.entries).map((e) => e.text)
    expect(lines.some((t) => /renamed itself Alphabet \(Class C\)/.test(t))).toBe(true)
  })

  it('news on the company reprices the line holding, mid-year and at the year step', () => {
    const g = resident('us', 2020)
    const id = companyId(g, 'Alphabet')
    buySecurity(g, `${id}~C`, 10_000)
    const t = listedTargets(g).find((x) => x.secId === id)!
    const before = holdingOf(g, `${id}~C`).value
    addMarketShock(g, { asset: 'stock', secId: id, exKey: t.exKey, slot: t.slot, name: t.name, symbol: t.symbol, cause: 'contract', year: g.year, mult: 1.2, fade: 0, countryId: 'us' })
    revalueHoldings(g)
    expect(holdingOf(g, `${id}~C`).value / before).toBeGreaterThan(1.19)
    expect(holdingOf(g, `${id}~C`).value / before).toBeLessThan(1.21)
  })

  it('a line held abroad is repriced by world news', () => {
    const g = resident('us', 2020)
    const id = companyId(g, 'Alphabet')
    buySecurity(g, `${id}~C`, 10_000)
    const t = listedTargets(g).find((x) => x.secId === id)!
    g.character.countryId = 'de'
    const before = holdingOf(g, `${id}~C`).value
    addMarketShock(g, { asset: 'stock', secId: id, exKey: t.exKey, slot: t.slot, name: t.name, symbol: t.symbol, cause: 'contract', year: g.year, mult: 1.2, fade: 0, countryId: 'us' })
    revalueHoldings(g, false, true)
    expect(holdingOf(g, `${id}~C`).value / before).toBeGreaterThan(1.19)
    expect(holdingOf(g, `${id}~C`).value / before).toBeLessThan(1.21)
    // And the yearly step still works on it from the other country.
    passYear(g)
    expect(holdingOf(g, `${id}~C`).value).toBeGreaterThan(0)
  })

  it('no bets and no politics', () => {
    const g = resident('us', 2020)
    const id = companyId(g, 'Alphabet')
    expect(listedTargets(g).some((t) => t.secId.includes('~'))).toBe(false)
    expect(findTarget(g, `${id}~C`)).toBeUndefined()
    expect(findTarget(g, id)).toBeDefined()
  })

  it('renders from a frozen state without changing it, and draws no random numbers', () => {
    const g = resident('us', 2020)
    const id = companyId(g, 'Alphabet')
    buySecurity(g, `${id}~C`, 10_000)
    const snapshot = JSON.stringify(g)
    const rng = g.rng
    deepFreeze(g)
    const kids = offerFor(g, 'Alphabet').children(g)
    expect(kids.some((n) => n.id === `inv-oline-${id}~C`)).toBe(true)
    expect(kids.some((n) => n.id === `inv-oheld-${id}~C`)).toBe(true)
    investmentAssetView(g, holdingOf(g, `${id}~C`))
    expect(JSON.stringify(g)).toBe(snapshot)
    expect(g.rng).toBe(rng)
  })
})

describe('the whole Investments screen with a line on it', () => {
  function withLines(): GameState {
    const g = resident('us', 2020, 9, 50_000_000)
    const id = companyId(g, 'Alphabet')
    buySecurity(g, `${id}~C`, 10_000)
    buySecurity(g, id, 10_000)
    return g
  }

  it('every menu renders from a frozen copy with unique ids', () => {
    const log = new FailureLog()
    expect(renderAll(withLines(), log)).toBeGreaterThan(0)
    expect(log.list().map((f) => f.first.message)).toEqual([])
  })

  it('every action of the Investments menu runs on a frozen copy without a failure', () => {
    const log = new FailureLog()
    expect(probeActions(withLines(), log, 3, { depth: 1, max: 80, roots: () => [investmentsMenu] })).toBeGreaterThan(0)
    expect(log.list().map((f) => f.first.message)).toEqual([])
  })

  it('a closed line cannot be bought and an unknown one is refused', () => {
    const g = resident('in', 2025)
    const id = companyId(g, 'Tata Motors')
    expect(buySecurity(g, `${id}~D`, 10_000)).toBe(false)
    expect(buySecurity(g, `${id}~Z`, 10_000)).toBe(false)
    expect(investmentHoldings(g)).toHaveLength(0)
  })
})

describe('what a line is made of', () => {
  it('the spread follows the votes against the main line', () => {
    expect(lineSpread(1, 1)).toBe(0)
    expect(lineSpread(1, 10)).toBe(0.03)
    expect(lineSpread(0, 50)).toBe(0.03)
    expect(lineSpread(0.1, 1)).toBe(0.03)
    expect(lineSpread(1, 0)).toBe(-0.04)
    expect(lineSpread(1, 0.15)).toBe(-0.02)
    expect(lineSpread(1, 0.1)).toBe(-0.02)
    expect(lineSpread(0, 0)).toBe(0)
    expect(lineSpread(Number.NaN, 1)).toBe(0)
    expect(lineSpread(1, Number.NaN)).toBe(0)
  })

  it('linesOf lists the listed rows open in the year, with their spread', () => {
    const lines = linesOf({ id: 'stock-us-alphabet' }, 'NYSE:S&P 500#s3g100012', 2020)
    expect(lines).toEqual([{ secId: 'NYSE:S&P 500#s3g100012~C', letter: 'C', label: 'Class C', votes: 0, spread: -0.04 }])
    expect(linesOf({ id: 'stock-us-alphabet' }, 'x', 2013)).toEqual([])
    expect(linesOf({ id: 'stock-us-meta-platforms' }, 'x', 2020)).toEqual([])
    expect(linesOf({ id: 'stock-us-apple' }, 'x', 2020)).toEqual([])
    expect(linesOf({ id: 'stock-us-alphabet' }, 'x', Number.NaN)).toEqual([])
    const rogers = linesOf({ id: 'stock-ca-rogers-communications' }, 'x', 2020)
    expect(rogers.map((l) => [l.letter, l.spread])).toEqual([['A', 0.03]])
  })

  it('lineOpen follows the row and only for a listed one', () => {
    expect(lineOpen({ id: 'stock-in-tata-motors' }, 'D', 2024)).toBe(true)
    expect(lineOpen({ id: 'stock-in-tata-motors' }, 'D', 2025)).toBe(false)
    expect(lineOpen({ id: 'stock-in-tata-motors' }, 'D', 2007)).toBe(false)
    expect(lineOpen({ id: 'stock-us-meta-platforms' }, 'B', 2020)).toBe(false)
    expect(lineOpen({ id: 'stock-us-alphabet' }, 'Z', 2020)).toBe(false)
    expect(lineOpen({ id: 'stock-us-apple' }, 'C', 2020)).toBe(false)
  })

  it("an id's key and letter are what the engine reads back", () => {
    for (const e of CLASS_ENTRIES) {
      for (const r of e.rows) {
        const id = lineSecId('NYSE:S&P 500#s3g100012', r.letter)
        expect(companyKey(id)).toBe('NYSE:S&P 500#s3g100012')
        expect(lineLetter(id)).toBe(r.letter)
      }
    }
  })
})

describe('a damaged or odd holding', () => {
  function holdingWith(g: GameState, secId: string, extra: Record<string, string | number> = {}): Asset {
    const id = companyId(g, 'Alphabet')
    buySecurity(g, `${id}~C`, 10_000)
    const a = holdingOf(g, `${id}~C`)
    a.details.secId = secId
    Object.assign(a.details, extra)
    return a
  }

  it('a suffix with no such class is paid out at its last price, not lost', () => {
    const g = resident('us', 2020)
    const id = companyId(g, 'Alphabet')
    const a = holdingWith(g, `${id}~Q`)
    const marked = a.value
    const bank = g.character.money
    passYear(g)
    expect(investmentHoldings(g)).toHaveLength(0)
    expect(g.character.money).toBeGreaterThan(bank + marked * 0.98)
  })

  it('a suffix on a made-up company is paid out too', () => {
    const g = resident('us', 2020)
    const made = investmentListing(g).find((q) => q.type === 'stock' && !/#s\d+g\d{6,}$/.test(q.secId))
    expect(made).toBeDefined()
    const a = holdingWith(g, `${made!.secId}~C`)
    expect(a.value).toBeGreaterThan(0)
    passYear(g)
    expect(investmentHoldings(g)).toHaveLength(0)
  })

  it('a line holding without the engine stamp stays a line', () => {
    const g = resident('us', 2020)
    const id = companyId(g, 'Alphabet')
    const a = holdingWith(g, `${id}~C`)
    delete a.details.eng
    expect(buySecurity(g, `${id}~C`, 1_000)).toBe(true)
    const kept = holdingOf(g, `${id}~C`)
    expect(kept.details.classOf).toBe(id)
    expect(kept.name).toBe('Alphabet (Class C)')
  })

  it('a missing class label leaves the name alone and breaks nothing', () => {
    const g = resident('us', 2014)
    const id = companyId(g, 'Google')
    buySecurity(g, `${id}~C`, 10_000)
    const a = holdingOf(g, `${id}~C`)
    delete a.details.classLabel
    expect(() => passYear(g)).not.toThrow()
    expect(holdingOf(g, `${id}~C`).name).toBe('Google (Class C)')
    expect(holdingOf(g, `${id}~C`).value).toBeGreaterThan(0)
  })

  it('a damaged slot number is paid out, not a crash', () => {
    const g = resident('us', 2020)
    const id = companyId(g, 'Alphabet')
    const a = holdingWith(g, `${id}~C`, { slot: -4 })
    expect(a.value).toBeGreaterThan(0)
    expect(() => passYear(g)).not.toThrow()
    expect(investmentHoldings(g)).toHaveLength(0)
  })
})
