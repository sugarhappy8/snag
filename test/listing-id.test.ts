// Where a listed company trades, and the four-letter ticker it gets (own-listing phase 1, task 2).
import { describe, expect, it } from 'vitest'
import { formGroup, spinOff } from '../src/game/business/conglomerate-actions'
import { detach, groupIdOf } from '../src/game/business/conglomerate-state'
import { goPublic } from '../src/game/business/exit'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { companyExchange, exchangeTickers, listedExchange, newTicker, ownTickerFor, tickerOf } from '../src/game/business/listing-id'
import { bizOf, isTicker, normalizeBiz, readBiz } from '../src/game/business/state'
import { exchangeInfo, exchangesWithCode, isRealSecId, reservedTickers } from '../src/game/invest/engine'
import { investmentListing } from '../src/game/investments'
import type { Asset, GameState } from '../src/game/types'
import { COUNTRIES } from '../src/game/world'
import { deepFreeze } from './fuzz-kit'
import { founder, listed, privateCompany } from './own-listing-kit'

/** A company that earns enough to list, as in test/share-structure.test.ts. */
function ipoCompany(g: GameState, name = 'Acme Robotics') {
  const a = createBusinessAsset(g, name, newBiz(g, 'software', 'us', 'Chicago', { cash: 5_000_000 }), 1e6)
  g.assets.push(a)
  const b = bizOf(g, a)
  b.history = [2023, 2024, 2025].map((year) => ({ year, revenue: 120e6, profit: 30e6, tax: 0, units: 1e6, price: 120, staff: 300, valuation: 0, outlets: 1 }))
  return { a, b }
}

describe('the exchange a company trades on', () => {
  it('finds the exchange a company trades on, even when codes repeat', () => {
    expect(listedExchange(['jp'], 'TSE').key).toBe('TSE:Nikkei 225')
    expect(listedExchange(['ir'], 'TSE').key).toBe('TSE:TEDPIX')
    expect(listedExchange(['jp'], 'NYSE').key).toBe('NYSE:S&P 500')
    expect(listedExchange(['ws'], 'ASX').key).toBe(exchangeInfo('ws').key)
    expect(listedExchange(['jp'], 'NOPE').key).toBe(exchangeInfo('jp').key)
    expect(listedExchange([], 'TSE').key).toBe(exchangeInfo('us').key)
    expect(listedExchange(['ir', 'jp'], 'TSE').key).toBe('TSE:TEDPIX')
    expect(exchangesWithCode('TSE').map((i) => i.home).sort()).toEqual(['ir', 'jp'])
    expect(exchangesWithCode('NYSE')).toHaveLength(1)
    expect(exchangesWithCode('NOPE')).toEqual([])
  })

  it('does not throw for a country or code it has never heard of', () => {
    expect(listedExchange(['zz'], 'TSE').key).toBeTruthy()
    expect(companyExchange({ countryId: 'zz', exchange: '' }).key).toBeTruthy()
    expect(companyExchange({ countryId: '', exchange: 'NYSE' }).key).toBe('NYSE:S&P 500')
  })

  it('reads the exchange from the company itself', () => {
    expect(companyExchange({ countryId: 'ir', exchange: 'TSE' }).key).toBe('TSE:TEDPIX')
    expect(companyExchange({ countryId: 'jp', exchange: 'TSE' }).key).toBe('TSE:Nikkei 225')
    expect(companyExchange({ countryId: 'jp', exchange: 'NYSE' }).key).toBe('NYSE:S&P 500')
  })
})

describe('the ticker', () => {
  it('makes a four-letter ticker from the name, the same every time', () => {
    expect(ownTickerFor('Acme Robotics', 'a1', new Set())).toBe('ACMR')
    expect(ownTickerFor('Acme Robotics', 'a1', new Set())).toBe('ACMR')
    expect(ownTickerFor('3', 'a1', new Set())).toMatch(/^[A-Z]{4}$/)
    expect(ownTickerFor('Ōsaka Gas', 'a1', new Set())).toMatch(/^[A-Z]{4}$/)
    expect(ownTickerFor('', 'a1', new Set())).toMatch(/^[A-Z]{4}$/)
    const second = ownTickerFor('Acme Robotics', 'a1', new Set(['ACMR']))
    expect(second).not.toBe('ACMR')
    expect(second.startsWith('ACM')).toBe(true)
    const letters = Array.from({ length: 26 }, (_, i) => `ACM${String.fromCharCode(65 + i)}`)
    const third = ownTickerFor('Acme Robotics', 'a1', new Set(['ACMR', ...letters]))
    expect(third.startsWith('AC')).toBe(true)
    expect(new Set(['ACMR', ...letters]).has(third)).toBe(false)
    expect(third).toMatch(/^[A-Z]{4}$/)
  })

  it('never takes a ticker the exchange already uses', () => {
    for (const home of ['us', 'jp', 'gb', 'in', 'za', 'jm', 'ir']) {
      const info = exchangeInfo(home)
      const taken = reservedTickers(info)
      const rows = investmentListing(founder(5, home)).filter((r) => r.type === 'stock' && (isRealSecId(r.secId) || r.secId.endsWith('g0')))
      expect(rows.length, home).toBeGreaterThan(0)
      for (const row of rows) {
        expect(taken.has(row.symbol), `${home} ${row.secId} ${row.symbol}`).toBe(true)
        expect(taken.has(ownTickerFor(row.name, 'x', taken)), `${home} ${row.name}`).toBe(false)
      }
    }
  })

  it('has a line-up to steer clear of on every exchange', () => {
    const seen = new Set<string>()
    for (const c of COUNTRIES) {
      const info = exchangeInfo(c.id)
      if (seen.has(info.key)) continue
      seen.add(info.key)
      const taken = reservedTickers(info)
      expect(taken.size, info.key).toBeGreaterThanOrEqual(8)
      for (const name of ['Acme Robotics', 'Sakura Motors', 'Bank of the North', '3', '']) {
        const t = ownTickerFor(name, 'biz1', taken)
        expect(t, `${info.key} ${name}`).toMatch(/^[A-Z]{4}$/)
        expect(taken.has(t), `${info.key} ${name}`).toBe(false)
      }
    }
    expect(seen.size).toBeGreaterThan(30)
  })

  it('does not depend on the seed', () => {
    const tickers: string[] = [], fresh: string[] = [], ipo: (string | undefined)[] = []
    for (const seed of [1, 2, 99]) {
      const g = founder(seed)
      const { a, b } = listed(g, { name: 'Acme Robotics' })
      tickers.push(tickerOf(g, a, b))
      fresh.push(newTicker(g, a, b))
    }
    for (const seed of [1, 2]) {
      const g = founder(seed, 'us', 1e6)
      const { a, b } = ipoCompany(g)
      goPublic(g, a, b, 25)
      ipo.push(b.ticker)
    }
    expect(new Set(tickers).size).toBe(1)
    expect(new Set(fresh).size).toBe(1)
    expect(isTicker(tickers[0])).toBe(true)
    expect(isTicker(ipo[0])).toBe(true)
    expect(ipo[0]).toBe(ipo[1])
  })

  it('does not move the generator', () => {
    const g = founder(3)
    const { a, b } = listed(g, { name: 'Acme Robotics' })
    const rng = g.rng, json = JSON.stringify(g)
    tickerOf(g, a, b)
    newTicker(g, a, b)
    exchangeTickers(g, companyExchange(b))
    expect(g.rng).toBe(rng)
    expect(JSON.stringify(g)).toBe(json)
  })

  it('gives two of your companies on one exchange different tickers', () => {
    const g = founder(8)
    const one = listed(g, { name: 'Acme Robotics' }), two = listed(g, { name: 'Acme Robotics' })
    const taken = reservedTickers(exchangeInfo('us'))
    one.b.ticker = newTicker(g, one.a, one.b)
    two.b.ticker = newTicker(g, two.a, two.b)
    for (const t of [one.b.ticker, two.b.ticker]) {
      expect(isTicker(t)).toBe(true)
      expect(taken.has(t)).toBe(false)
    }
    expect(one.b.ticker).not.toBe(two.b.ticker)
    delete one.b.ticker
    delete two.b.ticker
    const first = [tickerOf(g, one.a, one.b), tickerOf(g, two.a, two.b)]
    expect(first[0]).not.toBe(first[1])
    expect([tickerOf(g, one.a, one.b), tickerOf(g, two.a, two.b)]).toEqual(first)
    g.year += 10
    expect([tickerOf(g, one.a, one.b), tickerOf(g, two.a, two.b)]).toEqual(first)
  })

  it('reads from a frozen state without writing to it', () => {
    const g = founder(30)
    const { a, b } = listed(g, { name: 'Acme Robotics' })
    listed(g, { name: 'Acme Robotics' })
    privateCompany(g, 'us', 'Quiet Co')
    const before = JSON.stringify(g)
    deepFreeze(g)
    expect(isTicker(tickerOf(g, a, b))).toBe(true)
    expect(isTicker(newTicker(g, a, b))).toBe(true)
    expect(exchangeTickers(g, exchangeInfo('us')).size).toBe(2)
    expect(JSON.stringify(g)).toBe(before)
  })

  it('keeps ids in the order they were made, past ten', () => {
    // biz10 sorts before biz9 as text; the second company must still be the one that moves aside.
    const g = founder(9)
    g.nextId = 8
    const one = listed(g, { name: 'Acme Robotics' })
    const two = listed(g, { name: 'Acme Robotics' })
    expect(one.a.id).toBe('biz9')
    expect(two.a.id).toBe('biz10')
    const t = exchangeTickers(g, exchangeInfo('us'))
    expect(t.get(one.a.id)).toBe('ACMR')
    expect(t.get(two.a.id)).not.toBe('ACMR')
  })

  it('counts only your standalone listed companies on that exchange', () => {
    const g = founder(12, 'gb')
    const gb = listed(g, { name: 'Acme Robotics' })
    const jp = listed(g, { name: 'Acme Robotics', countryId: 'jp' })
    const ny = listed(g, { name: 'Acme Robotics', countryId: 'jp', exchange: 'NYSE' })
    const quiet = privateCompany(g, 'gb', 'Acme Robotics')
    const lse = exchangeTickers(g, exchangeInfo('gb'))
    expect([...lse.keys()]).toEqual([gb.a.id])
    expect([...exchangeTickers(g, exchangeInfo('jp')).keys()]).toEqual([jp.a.id])
    expect([...exchangeTickers(g, exchangeInfo('us')).keys()]).toEqual([ny.a.id])
    expect(tickerOf(g, quiet.a, quiet.b)).toMatch(/^[A-Z]{4}$/)
  })

  it('the IPO stores the ticker and the offer price', () => {
    const g = founder(14, 'us', 1e6)
    const { a, b } = ipoCompany(g)
    goPublic(g, a, b, 25)
    expect(isTicker(b.ticker)).toBe(true)
    expect(b.ipoPrice!).toBeGreaterThan(0)
    const ratio = b.sharePrice / b.ipoPrice!
    expect(ratio).toBeGreaterThan(0.79)
    expect(ratio).toBeLessThan(1.46)
    a.details = JSON.parse(JSON.stringify(a.details))
    const back = readBiz(g, a)
    expect(back.ticker).toBe(b.ticker)
    expect(back.ipoPrice).toBe(b.ipoPrice)
  })

  it('a listing out of a group gets a ticker; a wound-up group keeps its IPO year without an IPO price', () => {
    const g = founder(16)
    const one = privateCompany(g, 'us', 'Spun Off Co'), two = privateCompany(g, 'us', 'Wound Up Co')
    detach(g, one.a, one.b, { exchange: 'NYSE', ipoYear: 2015, sharesOut: 1e6, sharePrice: 10 })
    expect(one.b.public).toBe(true)
    expect(isTicker(one.b.ticker)).toBe(true)
    expect(one.b.ipoYear).toBe(g.year)
    expect(one.b.ipoPrice).toBe(one.b.sharePrice)
    detach(g, two.a, two.b, { exchange: 'NYSE', ipoYear: 2015, sharesOut: 1e6, sharePrice: 10 }, { keepIpoYear: true })
    expect(two.b.public).toBe(true)
    expect(isTicker(two.b.ticker)).toBe(true)
    expect(two.b.ipoYear).toBe(2015)
    expect(two.b.ipoPrice).toBeUndefined()
    expect(two.b.ticker).not.toBe(one.b.ticker)
  })
})

describe('a company that comes back to the market', () => {
  /** Acme Robotics lists and joins a group. While it is a division, Acme Rockets lists and takes the same ticker. */
  function swapped(seed: number) {
    const g = founder(seed, 'us', 1e6)
    const one = ipoCompany(g, 'Acme Robotics')
    goPublic(g, one.a, one.b, 25)
    const first = one.b.ticker
    const mate = privateCompany(g, 'us', 'Quiet Co')
    expect(formGroup(g, [one.a.id, mate.a.id], 'Test Holdings')).toBe(true)
    expect(bizOf(g, one.a).public).toBe(false)
    const two = ipoCompany(g, 'Acme Rockets')
    goPublic(g, two.a, two.b, 25)
    expect(two.b.ticker, 'the ticker a division gave up is free to take').toBe(first)
    return { g, one, two, first, group: groupIdOf(bizOf(g, one.a)) }
  }

  function expectDistinct(g: GameState, one: { a: Asset }, two: { a: Asset }, kept: string | undefined) {
    const x = bizOf(g, one.a), y = bizOf(g, two.a)
    expect(isTicker(x.ticker)).toBe(true)
    expect(isTicker(y.ticker)).toBe(true)
    expect(x.ticker).not.toBe(y.ticker)
    // The company that kept trading keeps its ticker, stored and shown.
    expect(y.ticker).toBe(kept)
    const shown = exchangeTickers(g, exchangeInfo('us'))
    expect(shown.get(two.a.id)).toBe(kept)
    expect(shown.get(one.a.id)).toBe(x.ticker)
    expect(tickerOf(g, two.a, y)).toBe(kept)
  }

  it('does not reuse a ticker another of your companies took meanwhile (spun off)', () => {
    const { g, one, two, first, group } = swapped(14)
    expect(spinOff(g, group, one.a.id)).toBe(true)
    expect(bizOf(g, one.a).public).toBe(true)
    expectDistinct(g, one, two, first)
  })

  it('does not reuse a ticker another of your companies took meanwhile (listed again)', () => {
    const { g, one, two, first } = swapped(15)
    detach(g, one.a, bizOf(g, one.a), null)
    expect(bizOf(g, one.a).public).toBe(false)
    goPublic(g, one.a, bizOf(g, one.a), 25)
    expectDistinct(g, one, two, first)
  })

  it('does not reuse it when the group is wound up around the company either', () => {
    const { g, one, two, first } = swapped(16)
    detach(g, one.a, bizOf(g, one.a), { exchange: 'NYSE', ipoYear: 2015, sharesOut: 1e6, sharePrice: 10 }, { keepIpoYear: true })
    expectDistinct(g, one, two, first)
  })

  it('keeps its own ticker when nobody took it', () => {
    const g = founder(17, 'us', 1e6)
    const one = ipoCompany(g, 'Acme Robotics')
    goPublic(g, one.a, one.b, 25)
    const first = one.b.ticker
    one.b.public = false
    goPublic(g, one.a, one.b, 25)
    expect(one.b.ticker).toBe(first)
    delete one.b.ticker
    one.b.public = false
    goPublic(g, one.a, one.b, 25)
    expect(one.b.ticker).toBe(first)
  })
})

describe('old and hostile saves', () => {
  it('drops a ticker that is not four capital letters', () => {
    const g = founder(21)
    const { a } = listed(g, { name: 'Acme Robotics' })
    for (const v of ['acme', 'ACMEX', 'AC', 'AC1E', '', 7, null]) {
      expect(normalizeBiz({ ...a.details, ticker: v }, 2026).ticker, String(v)).toBeUndefined()
    }
    expect(normalizeBiz({ ...a.details, ticker: 'ACME' }, 2026).ticker).toBe('ACME')
  })

  it('drops an offer price that cannot be real', () => {
    const g = founder(22)
    const { a } = listed(g, { name: 'Acme Robotics' })
    for (const v of [-1, 0, '12', 1e13, Infinity]) {
      expect(normalizeBiz({ ...a.details, ipoPrice: v }, 2026).ipoPrice, String(v)).toBeUndefined()
    }
    expect(normalizeBiz({ ...a.details, ipoPrice: 12.5 }, 2026).ipoPrice).toBe(12.5)
    expect(normalizeBiz({ ...a.details, ipoPrice: 5e7 }, 2026).ipoPrice).toBe(5e7)
  })

  it('derives a ticker for a listing that has none, and keeps it', () => {
    const g = founder(23)
    const { a, b } = listed(g, { name: 'Acme Robotics' })
    const first = tickerOf(g, a, b)
    expect(isTicker(first)).toBe(true)
    expect(tickerOf(g, a, b)).toBe(first)
    g.year += 10
    expect(tickerOf(g, a, b)).toBe(first)
    const other = listed(g, { name: 'Other Holdings' })
    other.b.ticker = newTicker(g, other.a, other.b)
    expect(tickerOf(g, a, b)).toBe(first)
    expect(other.b.ticker).not.toBe(first)
  })

  it('never returns a hostile stored ticker', () => {
    const g = founder(24)
    const { a, b } = listed(g, { name: 'Acme Robotics' })
    a.details.ticker = 'acme'
    expect(isTicker(tickerOf(g, a, b))).toBe(true)
    a.details.ticker = 7
    expect(isTicker(tickerOf(g, a, b))).toBe(true)
    expect(isTicker(tickerOf(g, a, bizOf(g, a)))).toBe(true)
  })

  it('treats a ticker an earlier company already holds as missing', () => {
    const g = founder(25)
    const one = listed(g, { name: 'Acme Robotics' }), two = listed(g, { name: 'Other Holdings' })
    one.a.details.ticker = 'DUPE'
    two.a.details.ticker = 'DUPE'
    const map = exchangeTickers(g, exchangeInfo('us'))
    expect(map.get(one.a.id)).toBe('DUPE')
    expect(isTicker(map.get(two.a.id))).toBe(true)
    expect(map.get(two.a.id)).not.toBe('DUPE')
    expect(new Set(map.values()).size).toBe(2)
  })

  it('an old save with no ticker reads the same before and after a round trip', () => {
    const g = founder(26)
    const { a, b } = listed(g, { name: 'Acme Robotics' })
    const before = tickerOf(g, a, b)
    const copy: GameState = structuredClone(g)
    const a2 = copy.assets.find((x: Asset) => x.id === a.id)!
    expect(tickerOf(copy, a2, readBiz(copy, a2))).toBe(before)
  })
})
