// Money in local currency and in the prices of the year (data/currencies.ts + core.ts display).
import { afterEach, describe, expect, it } from 'vitest'
import {
  bindMoneyContext,
  formatCents,
  formatMoney,
  formatPrice,
  moneyCurrencyLabel,
  moneyScale,
  moneyWith,
  setMoneyDisplay,
  shortMoney,
  showMoney,
  withMoneyContext,
} from '../src/game/core'
import {
  currencyChangeAt,
  currencyOf,
  exchangeRate,
  hasCurrencyData,
  presentCurrency,
  unitsPerDollar,
} from '../src/game/data/currencies'
import { hasMarketData, marketOf } from '../src/game/data/markets'
import { HISTORY_START, PRESENT_YEAR, priceLevel } from '../src/game/history/timeline'
import type { GameState } from '../src/game/types'
import { COUNTRIES } from '../src/game/world'
import { makeTestGame } from './helpers'

function life(countryId: string, year: number): GameState {
  const g = makeTestGame(1, { countryId, age: 30 })
  g.year = year
  return g
}

function show(countryId: string, year: number, mode: 'usd' | 'local', nominal: boolean): void {
  setMoneyDisplay({ mode, nominal })
  bindMoneyContext(life(countryId, year))
}

afterEach(() => {
  setMoneyDisplay({ mode: 'usd', nominal: false })
  bindMoneyContext(null)
})

// The formatters as they were before currencies existed (plain US dollars).
const old = {
  formatMoney: (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`,
  shortMoney(n: number): string {
    const a = Math.abs(n)
    const sign = n < 0 ? '-' : ''
    if (a >= 1e12) return `${sign}$${(a / 1e12).toFixed(a >= 1e13 ? 0 : 1)}T`
    if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(a >= 1e10 ? 0 : 1)}B`
    if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`
    if (a >= 1e4) return `${sign}$${Math.round(a / 1e3)}K`
    return old.formatMoney(n)
  },
  cents: (n: number) => (Math.abs(n) < 100 ? `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(2)}` : old.formatMoney(n)),
  price(p: number): string {
    if (!Number.isFinite(p) || p <= 0) return '$0'
    if (p >= 1_000) return old.formatMoney(p)
    if (p >= 1) return `$${p.toFixed(2)}`
    if (p >= 0.01) return `$${p.toFixed(3)}`
    return `$${p.toPrecision(2)}`
  },
}

const AMOUNTS = [0, 1, 2.5, -2.5, 3.49, 7, 99.99, 100, 250.5, 999, 1_000, 9_999, 10_000, 45_499, -45_500, 123_456, 999_999, 1_000_000, 12_345_678, -2_500_000, 1e9, 4.2e9, 7e10, 1e12, 3.3e13]

describe('plain US dollars are unchanged', () => {
  for (const [label, setup] of [
    ['no life bound', () => setMoneyDisplay({ mode: 'usd', nominal: false })],
    ['a 2026 American life in local mode', () => show('us', 2026, 'local', true)],
    ['a 1980 Japanese life in USD, today’s money', () => show('jp', 1980, 'usd', false)],
    ['a German life in USD, today’s money', () => show('de', 1990, 'usd', false)],
  ] as const) {
    it(label, () => {
      setup()
      for (const n of AMOUNTS) {
        expect(formatMoney(n)).toBe(old.formatMoney(n))
        expect(shortMoney(n)).toBe(old.shortMoney(n))
        expect(formatCents(n)).toBe(old.cents(n))
        expect(formatPrice(n)).toBe(old.price(n))
      }
      for (const p of [0.0004, 0.031, 0.5, 1.5, 8.17, 45.2, 999.99]) {
        expect(formatPrice(p)).toBe(old.price(p))
        expect(moneyWith(p, (x) => x.toFixed(2))).toBe(`$${p.toFixed(2)}`)
      }
      expect(moneyScale()).toBe(1)
    })
  }

  it('never prints NaN', () => {
    expect(formatMoney(Number.NaN)).toBe('$0')
    expect(shortMoney(Number.POSITIVE_INFINITY)).toBe('$0')
    show('jp', 1980, 'local', true)
    expect(formatMoney(Number.NaN)).toBe('¥0')
  })
})

describe('local currency (today’s money)', () => {
  it('shows each country in its own money and magnitude', () => {
    const cases: [string, RegExp, number, number][] = [
      ['jp', /^¥[\d,]+$/, 100, 200],
      ['id', /^Rp [\d,]+$/, 10_000, 25_000],
      ['ng', /^₦[\d,]+$/, 800, 3_000],
      ['br', /^R\$[\d,]+$/, 3, 9],
      ['de', /^€[\d,]+$/, 0.7, 1.1],
      ['gb', /^£[\d,]+$/, 0.6, 0.95],
      ['ch', /^CHF [\d,]+$/, 0.6, 1.1],
      ['in', /^₹[\d,]+$/, 60, 120],
      ['se', /^[\d,]+ kr$/, 7, 13],
    ]
    for (const [id, re, lo, hi] of cases) {
      show(id, 1990, 'local', false)
      const text = formatMoney(10_000)
      expect(text, id).toMatch(re)
      expect(moneyScale(), id).toBeGreaterThan(lo)
      expect(moneyScale(), id).toBeLessThan(hi)
    }
  })

  it('keeps yen and rupiah whole and other currencies in cents for small converted amounts', () => {
    show('jp', 2026, 'local', false)
    expect(formatMoney(4)).toBe('¥600')
    expect(formatCents(3.5)).toBe('¥525')
    show('de', 2026, 'local', false)
    expect(formatMoney(4)).toBe('€3.44')
    expect(formatCents(50)).toBe('€43.00')
    expect(formatMoney(50)).toBe('€43')
  })

  it('writes suffix currencies after the number, compact forms included', () => {
    show('se', 2026, 'local', false)
    expect(formatMoney(1_000)).toBe('9,500 kr')
    expect(shortMoney(1_000_000)).toBe('9.5M kr')
    expect(shortMoney(-100_000)).toBe('-950K kr')
    show('vn', 2026, 'local', false)
    expect(shortMoney(1_000_000)).toBe('26B ₫')
    show('ru', 2026, 'local', false)
    expect(shortMoney(5_000)).toBe('400K ₽')
  })

  it('labels the currency for prose and the AI', () => {
    show('jp', 2026, 'local', false)
    expect(moneyCurrencyLabel()).toBe('Japanese yen (¥)')
    expect(showMoney(1).code).toBe('JPY')
  })
})

describe('prices as they were', () => {
  it('shows a 1980 American salary in 1980 dollars (about a quarter)', () => {
    show('us', 1980, 'local', true)
    expect(moneyScale()).toBeCloseTo(priceLevel(1980), 6)
    expect(moneyScale()).toBeGreaterThan(0.22)
    expect(moneyScale()).toBeLessThan(0.28)
    expect(formatMoney(40_000)).toBe('$9,988')
    show('jp', 1980, 'usd', true)
    expect(formatMoney(40_000)).toBe('$9,988')
  })

  it('shows 1980 Japan in 1980 yen, deflated with Japan’s own inflation', () => {
    show('jp', 1980, 'local', true)
    expect(showMoney(1).symbol).toBe('¥')
    // ¥150 today → about ¥95 of 1980 money (Japanese prices rose ~1.6x since), not the
    // ¥57 that the US price level times the 1980 exchange rate would give.
    expect(moneyScale()).toBeGreaterThan(80)
    expect(moneyScale()).toBeLessThan(115)
    const salary = Number(formatMoney(40_000).replace(/[^\d]/g, ''))
    expect(salary).toBeGreaterThan(3_000_000)
    expect(salary).toBeLessThan(4_500_000)
  })

  it('uses Deutsche Marks before 2002 and euros after', () => {
    expect(currencyOf('de', 1990).code).toBe('DEM')
    expect(currencyOf('de', 2001).symbol).toBe('DM')
    expect(currencyOf('de', 2002).code).toBe('EUR')
    show('de', 1990, 'local', true)
    expect(formatMoney(10_000)).toMatch(/^[\d,]+ DM$/)
    show('de', 2002, 'local', true)
    expect(formatMoney(10_000)).toMatch(/^€[\d,]+$/)
    // The changeover keeps value: 1 euro = 1.95583 marks.
    const dm2001 = unitsPerDollar('de', 2001)
    const eur2002 = unitsPerDollar('de', 2002)
    expect(dm2001 / eur2002).toBeGreaterThan(1.8)
    expect(dm2001 / eur2002).toBeLessThan(2.1)
    expect(currencyChangeAt('de', 2002)).toMatchObject({ from: { code: 'DEM' }, to: { code: 'EUR' }, per: 1.95583 })
    // Today's money: euros in any year.
    show('de', 1990, 'local', false)
    expect(formatMoney(10_000)).toBe('€8,600')
  })

  it('knows the famous currency changes', () => {
    const at = (id: string, y: number) => currencyOf(id, y).code
    expect([at('fr', 1955), at('fr', 1990), at('fr', 2010)]).toEqual(['FRF', 'FRF', 'EUR'])
    expect(currencyOf('fr', 1955).name).toBe('old French franc')
    expect([at('it', 1990), at('es', 1990), at('nl', 1990), at('gr', 2000), at('sk', 2008), at('ee', 2010), at('hr', 2022)]).toEqual(['ITL', 'ESP', 'NLG', 'GRD', 'SKK', 'EEK', 'HRK'])
    expect([at('sk', 2009), at('ee', 2011), at('hr', 2023)]).toEqual(['EUR', 'EUR', 'EUR'])
    expect([at('ru', 1975), at('ru', 1995), at('ru', 2000)]).toEqual(['SUR', 'RUR', 'RUB'])
    expect(currencyChangeAt('ru', 1998)?.per).toBe(1000)
    expect([at('br', 1980), at('br', 1987), at('br', 1993), at('br', 1994)]).toEqual(['BRB', 'BRC', 'BRR', 'BRL'])
    expect(currencyChangeAt('br', 1994)?.per).toBe(2750)
    expect([at('tr', 2004), at('tr', 2005)]).toEqual(['TRL', 'TRY'])
    expect(currencyChangeAt('tr', 2005)?.per).toBe(1e6)
    expect([at('zw', 2005), at('zw', 2008), at('zw', 2012), at('zw', 2020), at('zw', 2026)]).toEqual(['ZWD', 'ZWR', 'USD', 'ZWL', 'ZWG'])
    expect([at('ve', 2007), at('ve', 2010), at('ve', 2019), at('ve', 2022)]).toEqual(['VEB', 'VEF', 'VES', 'VES'])
    expect(currencyOf('ve', 2019).symbol).toBe('Bs.S')
    expect([at('ar', 1960), at('ar', 1975), at('ar', 1984), at('ar', 1988), at('ar', 1995)]).toEqual(['ARM', 'ARL', 'ARP', 'ARA', 'ARS'])
    expect([at('mx', 1990), at('mx', 1993)]).toEqual(['MXP', 'MXN'])
    expect([at('ec', 1999), at('ec', 2000), at('sv', 2000), at('sv', 2001)]).toEqual(['ECS', 'USD', 'SVC', 'USD'])
    // A new symbol alone (₹ in 2010) is not a currency change.
    expect(currencyChangeAt('in', 2010)).toBeNull()
    expect(currencyOf('in', 2000).symbol).toBe('Rs')
    expect(currencyOf('in', 2020).symbol).toBe('₹')
  })

  it('shows hyperinflations without breaking the formatter', () => {
    show('de', 1923, 'local', true)
    expect(shortMoney(1_000)).toMatch(/^[\d.]+(B|T|Qa) ℳ$/)
    show('hu', 1946, 'local', true)
    expect(shortMoney(10)).toMatch(/pengő$/)
    expect(formatMoney(10)).not.toMatch(/NaN|Infinity|e\+/)
    show('zw', 2008, 'local', true)
    expect(formatMoney(4)).toMatch(/^Z\$/)
    expect(shortMoney(40_000)).toMatch(/^Z\$[\d.]+(T|Qa|Qi)$/)
  })

  it('carries on into the future with today’s currency and US-style inflation', () => {
    show('us', PRESENT_YEAR + 20, 'local', true)
    expect(moneyScale()).toBeCloseTo(priceLevel(PRESENT_YEAR + 20), 6)
    show('jp', PRESENT_YEAR + 10, 'local', true)
    expect(showMoney(1).code).toBe('JPY')
    expect(moneyScale()).toBeGreaterThan(150)
  })
})

describe('currency data', () => {
  it('covers every country with sane numbers in every year', () => {
    for (const c of COUNTRIES) {
      expect(hasCurrencyData(c.id), c.id).toBe(true)
      const cur = presentCurrency(c.id)
      if (hasMarketData(c.id)) expect(cur.code, c.id).toBe(marketOf(c.id).currencyCode)
      for (let y = HISTORY_START; y <= PRESENT_YEAR + 60; y += 1) {
        const u = unitsPerDollar(c.id, y)
        expect(Number.isFinite(u) && u > 0, `${c.id} ${y}`).toBe(true)
        expect(Number.isFinite(exchangeRate(c.id, y)), `${c.id} ${y}`).toBe(true)
      }
      expect(unitsPerDollar(c.id, PRESENT_YEAR)).toBe(unitsPerDollar(c.id, 1990, false))
    }
  })

  it('stays close to real exchange rates for big currencies', () => {
    // Purchasing-power rates drift from market rates, but not by more than ~2x for these.
    const real: [string, number, number][] = [
      ['jp', 1970, 360],
      ['gb', 1990, 0.563],
      ['de', 1960, 4.17],
      ['fr', 1970, 5.55],
      ['it', 1980, 856],
      ['ca', 2000, 1.49],
      ['ch', 1990, 1.39],
      ['kr', 2000, 1131],
      ['in', 2010, 45.7],
      ['mx', 2010, 12.6],
      ['br', 2000, 1.83],
      ['ru', 2020, 72],
      ['tr', 1990, 2609],
      ['il', 2000, 4.08],
      ['za', 2020, 16.46],
      ['cn', 2000, 8.28],
    ]
    for (const [id, y, fx] of real) {
      const ratio = exchangeRate(id, y) / fx
      expect(ratio, `${id} ${y}: ${exchangeRate(id, y)} vs ${fx}`).toBeGreaterThan(0.5)
      expect(ratio, `${id} ${y}: ${exchangeRate(id, y)} vs ${fx}`).toBeLessThan(2)
    }
  })

  it('formats for another life without touching the bound one', () => {
    show('us', 2026, 'local', true)
    expect(withMoneyContext({ countryId: 'jp', year: 2026 }, () => formatMoney(100))).toBe('¥15,000')
    expect(formatMoney(100)).toBe('$100')
  })
})
