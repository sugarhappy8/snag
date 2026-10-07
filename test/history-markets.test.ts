// Historical markets: a life lived in the past trades in the past. The engine follows real market
// history before PRESENT_YEAR (the 1929 crash, Japan's lost decades, the dot-com bust, 2008...),
// in real (inflation-adjusted) terms because engine money is constant PRESENT_YEAR dollars, and
// the procedural future is exactly what it was before history existed.
import { describe, expect, it } from 'vitest'
import { baseLoanRate, lendingEra, offeredRate, realBaseLoanRate, yearlyFinance } from '../src/game/finance'
import {
  cryptoExists,
  cycleScore,
  exchangeClosedReason,
  exchangeState,
  goldBan,
  historicalCoin,
  historicalCryptoReturn,
  historicalCycle,
  historicalGoldPrice,
  historicalHousing,
  historicalIndexReturn,
  historicalInflation,
  historicalMortgageRate,
  historicalPolicyRate,
  historicalSectorExcess,
  inHistory,
  investingBlocked,
  marketHistory,
  marketNote,
} from '../src/game/history/markets'
import { HISTORY_START, PRESENT_YEAR, priceLevel } from '../src/game/history/timeline'
import {
  bondRate,
  coinDef,
  companyDef,
  cryptoYear,
  depositInsurance,
  eraIdentity,
  exchangeInfo,
  exchangeYear,
  expectedDepreciation,
  fundName,
  fxYear,
  goldYear,
  indexMove,
  listedCoins,
  pennyDef,
  savingsRate,
  slotPlan,
  syntheticIndexMove,
  worldYear,
  type SectorId,
} from '../src/game/invest/engine'
import { marketInstinct } from '../src/game/invest/instinct'
import { buySecurity, investmentHoldings, investmentListing, investmentsMenu, yearlyInvestments } from '../src/game/investments'
import type { GameState, MenuGroup, MenuNode } from '../src/game/types'
import { COUNTRIES } from '../src/game/world'
import { makeTestGame } from './helpers'

const LAST = PRESENT_YEAR - 1

/** Compound real return of a country's market over [from, to] (1 = flat). */
function cumulative(cid: string, from: number, to: number): number {
  let v = 1
  for (let y = from; y <= to; y++) v *= 1 + (historicalIndexReturn(cid, y) ?? 0)
  return v
}

/** An adult investor living in `year` (the family's market starts at their birth). */
function investor(year: number, countryId = 'us', seed = 1, extra: Partial<GameState['character']> = {}): GameState {
  const g = makeTestGame(seed, { age: 30, money: 2_000_000, countryId, residence: { status: 'renting', rent: 0 }, ...extra })
  g.lifeId = `hist-${countryId}-${seed}`
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

function wealth(g: GameState): number {
  return g.character.money + investmentHoldings(g).reduce((s, a) => s + a.value, 0)
}

function children(g: GameState, group: MenuGroup): MenuNode[] {
  return group.children(g)
}

function sub(g: GameState, id: string): MenuGroup {
  const n = investmentsMenu.children(g).find((x) => x.id === id)
  if (!n || n.type !== 'menu') throw new Error(`no menu ${id}`)
  return n
}

/**
 * Compound price change over [from, to] of the company in a listing slot at the start, or 0 if it
 * went bust on the way; null when that company isn't in one of `sectors` (slots get new companies,
 * of any sector, when the old ones go bust or are bought out).
 */
function slotPath(fam: string, anchor: number, cid: string, slot: number, from: number, to: number, sectors?: SectorId[]): number | null {
  const info = exchangeInfo(cid)
  const g0 = exchangeYear(fam, anchor, info, from - 1).stocks[slot].gen
  if (sectors && !sectors.includes(companyDef(info, slot, g0).sector as SectorId)) return null
  let v = 1
  for (let y = from; y <= to; y++) {
    const s = exchangeYear(fam, anchor, info, y).stocks[slot]
    if (s.gen !== g0) return s.ended?.kind === 'acquired' ? v * (1 + s.ended.premium) : 0
    v *= 1 + s.ret
  }
  return v
}

/** Every listing slot's compound move over [from, to] across many families (companies of `sectors` only). */
function paths(cid: string, sectors: SectorId[] | undefined, from: number, to: number, families = 50, tag = cid): number[] {
  const out: number[] = []
  const n = slotPlan(exchangeInfo(cid)).length
  for (let f = 0; f < families; f++) {
    for (let s = 0; s < n; s++) {
      const v = slotPath(`${tag}${f}`, 1940 + (f % 40), cid, s, from, to, sectors)
      if (v !== null) out.push(v)
    }
  }
  return out
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

describe('the history data', () => {
  it('covers every country and year with finite, sane numbers, and nothing for the future', () => {
    for (const c of COUNTRIES) {
      for (let y = HISTORY_START; y <= LAST; y++) {
        const r = historicalIndexReturn(c.id, y)
        expect(Number.isFinite(r), `${c.id} ${y} index`).toBe(true)
        expect(r!, `${c.id} ${y} index`).toBeGreaterThanOrEqual(-0.97)
        expect(r!, `${c.id} ${y} index`).toBeLessThanOrEqual(12)
        const infl = historicalInflation(c.id, y)!
        expect(Number.isFinite(infl) && infl > -0.5, `${c.id} ${y} inflation ${infl}`).toBe(true)
        const rate = historicalPolicyRate(c.id, y)!
        expect(Number.isFinite(rate) && rate > -0.02, `${c.id} ${y} rate ${rate}`).toBe(true)
        const mort = historicalMortgageRate(c.id, y)!
        expect(Number.isFinite(mort) && mort > 0, `${c.id} ${y} mortgage ${mort}`).toBe(true)
        const house = historicalHousing(c.id, y)!
        expect(Number.isFinite(house) && Math.abs(house) < 0.6, `${c.id} ${y} housing ${house}`).toBe(true)
      }
      for (const y of [1913, 1931, 1974, 2000, 2008, 2020]) {
        const mh = marketHistory(c.id, y)!
        expect(mh, `${c.id} ${y}`).not.toBeNull()
        for (const v of [mh.index, mh.gold, mh.housing, mh.inflation, mh.rate, ...Object.values(mh.sectors ?? {})]) expect(Number.isFinite(v), `${c.id} ${y} ${JSON.stringify(mh)}`).toBe(true)
      }
      expect(marketHistory(c.id, PRESENT_YEAR)).toBeNull()
      expect(marketHistory(c.id, PRESENT_YEAR + 40)).toBeNull()
      expect(historicalIndexReturn(c.id, PRESENT_YEAR)).toBeNull()
      expect(historicalInflation(c.id, PRESENT_YEAR + 3)).toBeNull()
    }
    expect(inHistory(HISTORY_START - 1)).toBe(false)
    expect(inHistory(LAST)).toBe(true)
    expect(inHistory(PRESENT_YEAR)).toBe(false)
  })

  it('tells the famous stories: 1929, the 1970s, 1987, Japan, Asia 1997, Russia 1998, 2008, the euro crisis', () => {
    // The Great Crash: US shares lost more than half their real value over 1929-32.
    expect(cumulative('us', 1929, 1932)).toBeLessThan(0.5)
    expect(historicalIndexReturn('us', 1931)!).toBeLessThan(-0.35)
    // 1937 and 1973-74.
    expect(historicalIndexReturn('us', 1937)!).toBeLessThan(-0.3)
    expect(cumulative('us', 1973, 1974)).toBeLessThan(0.6)
    expect(cumulative('gb', 1973, 1974)).toBeLessThan(0.35)
    // Black Monday was a day, not a year: 1987 ends roughly flat.
    expect(Math.abs(historicalIndexReturn('us', 1987)!)).toBeLessThan(0.08)
    // Japan's bubble and its lost decades.
    expect(cumulative('jp', 1985, 1989)).toBeGreaterThan(2)
    expect(cumulative('jp', 1990, 2003)).toBeLessThan(0.35)
    // Mexico 1994-95, Asia 1997-98, Russia 1998.
    expect(cumulative('mx', 1994, 1995)).toBeLessThan(0.75)
    for (const c of ['th', 'id', 'kr', 'my']) expect(cumulative(c, 1997, 1998), c).toBeLessThan(0.85)
    expect(historicalIndexReturn('ru', 1998)!).toBeLessThan(-0.6)
    // 2008 hit almost every market that had one.
    const markets = COUNTRIES.filter((c) => exchangeState(c.id, 2008).status === 'open')
    const fell = markets.filter((c) => historicalIndexReturn(c.id, 2008)! < -0.15)
    expect(fell.length / markets.length).toBeGreaterThan(0.85)
    expect(historicalIndexReturn('us', 2008)!).toBeLessThan(-0.35)
    // The euro crisis.
    expect(cumulative('gr', 2010, 2012)).toBeLessThan(0.5)
    // 2022: inflation returns and both shares and bonds fall.
    expect(historicalIndexReturn('us', 2022)!).toBeLessThan(-0.2)
    expect(marketNote('us', 2000)).toMatch(/dot-com/i)
  })

  it('has sector stories: tech, banks, energy, airlines and housing', () => {
    // Tech: the dot-com run-up and its crash, 2022.
    expect(historicalSectorExcess('us', 'tech', 1999)!).toBeGreaterThan(0.3)
    for (const y of [2000, 2001, 2002]) expect(historicalSectorExcess('us', 'tech', y)!, `${y}`).toBeLessThan(-0.15)
    expect(historicalSectorExcess('us', 'tech', 2022)!).toBeLessThan(0)
    // Banks in 2008 (worldwide), energy in the oil shocks and 2014-15, airlines in 2001 and 2020.
    expect(historicalSectorExcess('us', 'banks', 2008)!).toBeLessThan(-0.2)
    expect(historicalSectorExcess('de', 'banks', 2008)!).toBeLessThan(-0.1)
    expect(historicalSectorExcess('us', 'oil', 1979)!).toBeGreaterThan(0.1)
    expect(historicalSectorExcess('us', 'oil', 2015)!).toBeLessThan(-0.2)
    expect(historicalSectorExcess('us', 'oil', 2020)!).toBeLessThan(-0.3)
    expect(historicalSectorExcess('us', 'airlines', 2001)!).toBeLessThan(-0.2)
    expect(historicalSectorExcess('us', 'airlines', 2020)!).toBeLessThan(-0.3)
    expect(historicalSectorExcess('jp', 'banks', 1992)!).toBeLessThan(-0.2)
    // House prices: the US bust of 2006-11, Spain, Ireland, Japan after 1991.
    const houses = (cid: string, a: number, b: number) => {
      let v = 1
      for (let y = a; y <= b; y++) v *= 1 + historicalHousing(cid, y)!
      return v
    }
    expect(houses('us', 2007, 2011)).toBeLessThan(0.75)
    expect(houses('es', 2008, 2013)).toBeLessThan(0.7)
    expect(houses('ie', 2007, 2012)).toBeLessThan(0.6)
    expect(houses('jp', 1991, 2005)).toBeLessThan(0.6)
  })

  it('has gold peaking in 1980 and 2011, and the gold standard before', () => {
    const gold = (y: number) => historicalGoldPrice(y)!
    expect(gold(1980)).toBeGreaterThan(gold(1979))
    expect(gold(1980)).toBeGreaterThan(gold(1985) * 1.5)
    expect(gold(2011)).toBeGreaterThan(gold(2008))
    expect(gold(2011)).toBeGreaterThan(gold(2015) * 1.3)
    // $20.67 then $35 an ounce in the money of the day.
    expect(gold(1925) * priceLevel(1925)).toBeCloseTo(20.67, 1)
    expect(gold(1960) * priceLevel(1960)).toBeCloseTo(35, 1)
    expect(historicalGoldPrice(PRESENT_YEAR)).toBeNull()
  })

  it('has real inflation, rates and hyperinflations', () => {
    expect(historicalInflation('us', 1980)!).toBeGreaterThan(0.11)
    expect(historicalPolicyRate('us', 1981)!).toBeGreaterThan(0.14)
    expect(historicalMortgageRate('us', 1981)!).toBeGreaterThan(0.15)
    expect(historicalMortgageRate('us', 2021)!).toBeLessThan(0.035)
    expect(historicalInflation('us', 1932)!).toBeLessThan(-0.05)
    // Weimar 1923, Argentina 1989, Brazil's early 1990s, Zimbabwe 2008, Venezuela 2018.
    expect(historicalInflation('de', 1923)!).toBeGreaterThan(1_000)
    expect(historicalInflation('ar', 1989)!).toBeGreaterThan(10)
    expect(historicalInflation('br', 1993)!).toBeGreaterThan(10)
    expect(historicalInflation('zw', 2008)!).toBeGreaterThan(1_000)
    expect(historicalInflation('ve', 2018)!).toBeGreaterThan(100)
    // Savings and bonds lose everything in a hyperinflation.
    expect(fxYear('any', 'de', 1923).dep).toBeGreaterThan(0.99)
    expect(fxYear('any', 'zw', 2008).dep).toBeGreaterThan(0.99)
  })

  it('knows which exchanges existed, were shut, or were abolished', () => {
    expect(exchangeState('cn', 1960).status).toBe('none')
    expect(exchangeState('cn', 1949).expropriated).toBe(true)
    expect(exchangeState('cn', 1995).status).toBe('open')
    expect(exchangeState('ru', 1950).status).toBe('none')
    expect(exchangeState('tw', 1950).status).toBe('none')
    expect(exchangeState('jp', 1947).status).toBe('closed')
    expect(exchangeClosedReason('jp', 1947)).toMatch(/occupation/)
    expect(exchangeState('us', 1931).status).toBe('open')
    expect(investingBlocked('ru', 1960)).toMatch(/state/)
    expect(investingBlocked('ru', 2000)).toBeNull()
    expect(goldBan('us', 1933)?.recall).toBe(true)
    expect(goldBan('us', 1950)?.recall).toBe(false)
    expect(goldBan('us', 1980)).toBeNull()
    for (const c of COUNTRIES) expect(exchangeState(c.id, PRESENT_YEAR).status).toBe('open')
  })
})

describe('the dot-com bubble can wipe you out', () => {
  const TECH: SectorId[] = ['tech', 'ecommerce', 'ai', 'semis', 'electronics']

  it('US tech stocks bought in 1999 lose about three quarters by 2002', () => {
    const bust = paths('us', TECH, 2000, 2002, 50, 'dot')
    expect(bust.length).toBeGreaterThan(100)
    expect(mean(bust)).toBeLessThan(0.3)
    expect(median(bust)).toBeLessThan(0.28)
    // ...after a mania that multiplied them in the late nineties.
    expect(median(paths('us', TECH, 1995, 1999, 30, 'dot'))).toBeGreaterThan(3)
    // Boring companies came through far better.
    expect(median(paths('us', ['banks', 'supermarkets', 'food', 'pharma', 'insurance'], 2000, 2002, 50, 'dot'))).toBeGreaterThan(0.55)
  })

  it('a tech-heavy portfolio really goes up in smoke, a diversified index fund "only" loses ~45% real', () => {
    const ratios: number[] = []
    const fundRatios: number[] = []
    for (let seed = 1; seed <= 8; seed++) {
      const g = investor(1999, 'us', seed)
      const info = exchangeInfo('us')
      const listing = investmentListing(g)
      const techIds = listing.filter((q) => q.type === 'stock').filter((q) => {
        const m = q.secId.match(/#s(\d+)g(\d+)$/)
        return !!m && TECH.includes(companyDef(info, Number(m[1]), Number(m[2])).sector as SectorId)
      })
      expect(techIds.length).toBeGreaterThanOrEqual(3)
      for (const q of techIds) expect(buySecurity(g, q.secId, 20_000)).toBe(true)
      const invested = techIds.length * 20_000
      const cashAfter = g.character.money
      const f = investor(1999, 'us', seed)
      const fund = investmentListing(f).find((q) => q.type === 'index')!
      expect(buySecurity(f, fund.secId, 100_000)).toBe(true)
      const fundCash = f.character.money
      for (let i = 0; i < 3; i++) {
        passYear(g)
        passYear(f)
      }
      expect(g.year).toBe(2002)
      ratios.push((wealth(g) - cashAfter) / invested)
      fundRatios.push((wealth(f) - fundCash) / 100_000)
      expect(JSON.stringify(g.log)).not.toMatch(/NaN|undefined/)
    }
    expect(mean(ratios)).toBeLessThan(0.32)
    expect(fundRatios.every((r) => r > 0.45 && r < 0.66), fundRatios.join(', ')).toBe(true)
  })

  it('the index loses 40%+ in real terms over 2000-02 and is back above its 1999 level (in the dollars of the day) by 2007', () => {
    expect(cumulative('us', 2000, 2002)).toBeLessThan(0.62)
    expect(cumulative('us', 2003, 2007)).toBeGreaterThan(1.45)
    const nominal = cumulative('us', 2000, 2007) * (priceLevel(2007) / priceLevel(1999))
    expect(nominal).toBeGreaterThan(1)
    // The engine's index fund (price only, dividends are paid out on top) follows it.
    const info = exchangeInfo('us')
    const fund = (y: number) => exchangeYear('dotfund', 1960, info, y).fund.price
    expect(fund(2002) / fund(1999)).toBeLessThan(0.6)
    expect(fund(2007) / fund(2002)).toBeGreaterThan(1.3)
  })

  it('dot-com penny stocks soar in the mania and mostly die in the bust', () => {
    const info = exchangeInfo('us')
    let dotcoms = 0
    let dead = 0
    for (let f = 0; f < 60; f++) {
      for (const was of exchangeYear(`penny${f}`, 1950, info, 1999).pennies) {
        if (!/Dot-Com|Online Pet/.test(eraIdentity(pennyDef(info, was.slot, was.gen), 1999).name)) continue
        // Follow the listing through 2000-02 (prices are per share; reverse splits multiply them).
        let v = 1
        let gone = false
        for (let y = 2000; y <= 2002 && !gone; y++) {
          const s = exchangeYear(`penny${f}`, 1950, info, y).pennies[was.slot]
          if (s.gen !== was.gen) gone = true
          else v *= 1 + s.ret
        }
        dotcoms++
        if (gone || v < 0.05) dead++
      }
    }
    expect(dotcoms).toBeGreaterThan(5)
    expect(dead / dotcoms).toBeGreaterThan(0.75)
  })
})

describe('other crashes', () => {
  it('2008 hits stocks, and banks hardest', () => {
    expect(mean(paths('us', undefined, 2008, 2008, 40, 'gfc'))).toBeLessThan(0.7)
    expect(median(paths('us', ['banks'], 2008, 2008, 60, 'gfc'))).toBeLessThan(0.55)
    // Japan's banks in the lost decade.
    expect(median(paths('jp', ['banks'], 1990, 2003, 60, 'jpb'))).toBeLessThan(0.15)
  })

  it('1929-32 wipes out most of a stock portfolio', () => {
    const g = investor(1928, 'us', 3)
    const fund = investmentListing(g).find((q) => q.type === 'index')!
    expect(fund.name).toMatch(/Investment Trust/)
    expect(buySecurity(g, fund.secId, 100_000)).toBe(true)
    const cash = g.character.money
    for (let i = 0; i < 4; i++) passYear(g)
    expect((wealth(g) - cash) / 100_000).toBeLessThan(0.55)
  })

  it("Japan's investors wait decades to get back to 1989", () => {
    const info = exchangeInfo('jp')
    const fund = (y: number) => exchangeYear('nikkei', 1950, info, y).fund.price
    expect(fund(2003) / fund(1989)).toBeLessThan(0.35)
    expect(fund(2012) / fund(1989)).toBeLessThan(0.5)
  })

  it('a revolution nationalizes the stock market', () => {
    const g = investor(1948, 'cn', 2)
    const fund = investmentListing(g).find((q) => q.type === 'index')!
    expect(buySecurity(g, fund.secId, 50_000)).toBe(true)
    passYear(g)
    expect(g.year).toBe(1949)
    expect(investmentHoldings(g).some((a) => a.details.type === 'index')).toBe(false)
    expect(JSON.stringify(g.log)).toMatch(/nationalized/)
    // No stock market for decades afterwards (and no private investing at all).
    g.year = 1960
    const stocks = children(g, sub(g, 'inv-stocks'))
    expect(stocks).toHaveLength(1)
    expect(stocks[0].type).toBe('info')
    const fundRow = investmentsMenu.children(g).find((n) => n.id === `inv-offer-${fund.secId}`)
    expect(fundRow?.visible?.(g)).toBe(false)
    expect(buySecurity(g, fund.secId, 10_000)).toBe(false)
  })

  it('the US gold recall of 1933 buys your gold back, and gold is off limits until 1975', () => {
    const g = investor(1932, 'us', 4)
    const gold = investmentListing(g).find((q) => q.type === 'gold')!
    expect(buySecurity(g, gold.secId, 10_000)).toBe(true)
    passYear(g)
    expect(investmentHoldings(g).some((a) => a.details.type === 'gold')).toBe(false)
    g.year = 1950
    expect(buySecurity(g, gold.secId, 10_000)).toBe(false)
    g.year = 1980
    expect(buySecurity(g, `gold:us`, 10_000)).toBe(true)
  })
})

describe('crypto', () => {
  it('does not exist before 2009', () => {
    for (let y = HISTORY_START; y < 2009; y += 3) {
      expect(cryptoExists(y)).toBe(false)
      expect(historicalCryptoReturn(y)).toBeNull()
      expect(listedCoins(cryptoYear('c', HISTORY_START, y))).toHaveLength(0)
    }
    expect(cryptoExists(2009)).toBe(true)
    const g = investor(2005, 'us')
    expect(investmentListing(g).some((q) => q.type === 'crypto')).toBe(false)
    const crypto = investmentsMenu.children(g).find((n) => n.id === 'inv-crypto')!
    expect(crypto.visible?.(g)).toBe(false)
    g.year = 2015
    expect(crypto.visible?.(g)).toBe(true)
  })

  it("the first coin follows Bitcoin's real path (in the dollars of each year)", () => {
    const nominal = (y: number) => historicalCoin(0, y)!.price * priceLevel(y)
    expect(nominal(2010)).toBeLessThan(1)
    expect(nominal(2013)).toBeGreaterThan(500)
    expect(nominal(2013)).toBeLessThan(1_300)
    expect(nominal(2017)).toBeGreaterThan(10_000)
    expect(nominal(2017)).toBeLessThan(20_000)
    expect(nominal(2018)).toBeGreaterThan(3_000)
    expect(nominal(2018)).toBeLessThan(5_000)
    expect(nominal(2021)).toBeGreaterThan(40_000)
    expect(nominal(2022)).toBeGreaterThan(13_000)
    expect(nominal(2022)).toBeLessThan(20_000)
    expect(nominal(2024)).toBeGreaterThan(90_000)
    // The engine's coin is the same (whatever year the family's market started).
    for (const y of [2010, 2013, 2017, 2021, 2024]) {
      const c = cryptoYear('btc', 1950, y).coins[0]
      expect(c.unlisted).toBeFalsy()
      expect(c.price).toBeCloseTo(historicalCoin(0, y)!.price, 6)
    }
  })

  it('later coins appear in their eras, and the algorithmic stablecoin collapses in 2022', () => {
    const listed = (y: number) => listedCoins(cryptoYear('eras', 1980, y)).map((c) => c.slot)
    expect(listed(2012)).toEqual([0])
    expect(listed(2014)).toEqual([0, 2])
    expect(listed(2016)).toEqual([0, 1, 2])
    expect(listed(2021)).toEqual([0, 1, 2, 3])
    expect(listed(2022)).toEqual([0, 1, 2])
    const crash = cryptoYear('eras', 1980, 2022).coins[3]
    expect(crash.ended?.id).toBe(coinDef(3, 0).id)
    expect(listed(2024)).toEqual([0, 1, 2, 3])
    // The future goes on from the real 2025 prices.
    const last = cryptoYear('eras', 1980, LAST).coins[0].price
    const next = cryptoYear('eras', 1980, PRESENT_YEAR + 1).coins[0].price
    expect(next / last).toBeGreaterThan(0.05)
    expect(next / last).toBeLessThan(20)
  })

  it('the early market was tiny: you could not buy a fortune of coins in 2010', () => {
    const g = investor(2010, 'us', 5)
    const coin = investmentListing(g).find((q) => q.type === 'crypto')!
    expect(buySecurity(g, coin.secId, 1_000_000)).toBe(false)
  })
})

describe('rates are real inside, nominal on screen', () => {
  it('1980 savings pay double digits but about zero after inflation', () => {
    const nominal = savingsRate('us', 1980)
    expect(nominal).toBeGreaterThan(0.1)
    const real = (1 + nominal) / (1 + historicalInflation('us', 1980)!) - 1
    expect(Math.abs(real)).toBeLessThan(0.03)
    expect(savingsRate('us', 1981)).toBeGreaterThan(0.13)
    // A balance held through 1980 keeps about its buying power, interest included.
    const g = investor(1979, 'us', 6)
    const sav = investmentListing(g).find((q) => q.type === 'savings')!
    expect(buySecurity(g, sav.secId, 100_000)).toBe(true)
    passYear(g)
    const a = investmentHoldings(g).find((x) => x.details.type === 'savings')!
    expect(a.value / 100_000).toBeGreaterThan(0.96)
    expect(a.value / 100_000).toBeLessThan(1.02)
  })

  it('mortgages and loans cost the era rate, and inflation erodes what you owe', () => {
    expect(baseLoanRate('us', 'mortgage', 1981)).toBeGreaterThan(0.15)
    expect(baseLoanRate('us', 'mortgage', 2021)).toBeLessThan(0.04)
    const g = investor(1981, 'us')
    expect(offeredRate(g, 'mortgage')).toBeGreaterThan(0.14)
    // Real cost of borrowing in 1981: nominal minus inflation.
    expect(realBaseLoanRate('us', 'mortgage', 1981)).toBeLessThan(baseLoanRate('us', 'mortgage', 1981) - 0.07)
    const loanAfter = (year: number): number => {
      const h = investor(year, 'us', 7)
      h.character.loans = [{ id: 'l1', kind: 'personal', lender: 'Bank', principal: 10_000, balance: 10_000, rate: 0.1, yearlyPayment: 1_000, yearsLeft: 20 } as GameState['character']['loans'][number]]
      h.year += 1
      yearlyFinance(h)
      return h.character.loans[0]?.balance ?? 0
    }
    const inflated = loanAfter(1979) // 1980: 13.5% inflation
    const today = loanAfter(PRESENT_YEAR + 2)
    expect(today).toBe(10_000) // +10% interest, -1,000 payment
    expect(inflated).toBeLessThan(9_000)
    expect(inflated).toBeGreaterThan(8_500)
  })

  it('lending had era rules', () => {
    const g = investor(1925, 'us')
    expect(lendingEra(g, 'mortgage').maxYears).toBeLessThanOrEqual(10)
    g.year = 1960
    g.character.countryId = 'ru'
    expect(lendingEra(g, 'mortgage').available).toBe(false)
    g.year = PRESENT_YEAR + 1
    expect(lendingEra(g, 'mortgage').available).toBe(true)
    expect(lendingEra(g, 'mortgage').maxYears).toBe(30)
  })

  it('deposit insurance only exists from its era', () => {
    expect(depositInsurance('us', 1925)).toBe(0)
    expect(depositInsurance('us', 1940)).toBeGreaterThan(0)
    expect(depositInsurance('us', 2010)).toBeGreaterThan(depositInsurance('us', 1990) * 0.9)
    expect(bondRate('us', 1981)).toBeGreaterThan(0.15)
    expect(expectedDepreciation('us', 1980)).toBeGreaterThan(0.1)
  })
})

describe('the business cycle', () => {
  it('follows real recessions and booms, blended with the synthetic noise', () => {
    expect(historicalCycle('us', 1932, 1)).toBeLessThan(0.75)
    expect(historicalCycle('us', 2009, 1)).toBeLessThan(0.85)
    expect(historicalCycle('jp', 1998, 1)).toBeLessThan(0.9)
    expect(historicalCycle('th', 1998, 1)).toBeLessThan(0.8)
    expect(historicalCycle('us', 1999, 1)).toBeGreaterThan(1.05)
    expect(historicalCycle('us', 1999, 1.2)).toBeGreaterThan(historicalCycle('us', 1999, 0.9))
    expect(cycleScore('us', 2020)).toBeLessThan(-0.5)
    // The future is untouched.
    for (const s of [0.6, 1, 1.3]) expect(historicalCycle('us', PRESENT_YEAR, s)).toBe(s)
    expect(historicalCycle('us', PRESENT_YEAR + 10, 1.17)).toBe(1.17)
  })
})

describe('the Investing talent stays honest with history', () => {
  it('reads the real moves: few "climb" calls into 2000 or 2008, and picks that mostly rise', () => {
    let upCalls = 0
    let calls = 0
    let picks = 0
    let rose = 0
    for (let seed = 1; seed <= 60; seed++) {
      for (const year of [1999, 2007]) {
        const g = investor(year, 'us', seed, { talents: ['Investing'] })
        g.lifeId = `gut-${seed}`
        const inst = marketInstinct(g)!
        expect(inst.year).toBe(year + 1)
        calls++
        if (inst.market === 'up') upCalls++
      }
    }
    expect(upCalls / calls).toBeLessThan(0.2)
    // Over many historical years, picks rise most of the time (the same ~80% edge as the future).
    for (let seed = 1; seed <= 25; seed++) {
      for (let year = 1985; year <= 2023; year += 2) {
        const g = investor(year, 'us', seed, { talents: ['Investing'] })
        g.lifeId = `gutp-${seed}`
        const inst = marketInstinct(g)!
        if (!inst.picks.length) continue
        const h = structuredClone(g)
        for (const p of inst.picks) buySecurity(h, p.secId, 10_000)
        const held = investmentHoldings(h).map((a) => String(a.details.secId))
        passYear(h)
        for (const id of held) {
          const a = investmentHoldings(h).find((x) => String(x.details.secId) === id)
          picks++
          if (a && Number(a.details.lastChange ?? 0) > 0) rose++
        }
      }
    }
    expect(picks).toBeGreaterThan(100)
    expect(rose / picks).toBeGreaterThan(0.65)
  })

  it('never feels anything about coins before 2009, or property trusts before they existed', () => {
    for (let seed = 1; seed <= 30; seed++) {
      for (const year of [1950, 1990, 2007]) {
        const g = investor(year, 'us', seed, { talents: ['Investing'] })
        const inst = marketInstinct(g)!
        expect(inst.picks.some((p) => p.kind === 'crypto')).toBe(false)
        if (year < 1960) expect(inst.picks.some((p) => p.kind === 'reit')).toBe(false)
        if (year === 1950) expect(inst.picks.some((p) => p.kind === 'gold')).toBe(false)
      }
    }
  })
})

describe('the present and the future are unchanged', () => {
  it('a family whose market starts at PRESENT_YEAR sees exactly the old procedural market', () => {
    // Golden values from the engine as it was before history existed.
    const info = exchangeInfo('us')
    const ey = exchangeYear('golden', 2026, info, 2040)
    expect(ey.fund.price).toBeCloseTo(305.6355561153331, 8)
    expect(ey.stocks[0].price).toBeCloseTo(216.7221368171653, 8)
    expect(ey.stocks[3].price).toBeCloseTo(176.14183164955386, 8)
    expect(ey.pennies[1].price).toBeCloseTo(0.02305906985078545, 12)
    expect(ey.reit.price).toBeCloseTo(13.34282786181325, 8)
    expect(ey.level).toBeCloseTo(67644.42128137044, 6)
    const ej = exchangeYear('golden', 2030, exchangeInfo('jp'), 2061)
    expect(ej.fund.price).toBeCloseTo(67.43362118998319, 8)
    expect(ej.stocks[5].price).toBeCloseTo(7.109773422669037, 8)
    const cy = cryptoYear('golden', 2026, 2045)
    expect(cy.coins.map((c) => c.id)).toEqual(['crypto#c0g0', 'crypto#c1g0', 'crypto#c2g1', 'crypto#c3g2'])
    expect(cy.coins[0].price).toBeCloseTo(968.6694583131491, 8)
    expect(cy.coins[1].price).toBeCloseTo(66.00004254319042, 8)
    expect(goldYear('golden', 2026, 2050).price).toBeCloseTo(6379.695841551205, 6)
    const fx = fxYear('golden', 'ar', 2035)
    expect(fx.dep).toBeCloseTo(0.13897716971686344, 12)
    expect(fx.bondMove).toBeCloseTo(-0.0015755835568804603, 12)
    expect(indexMove('golden', info, 2031).logRet).toBeCloseTo(0.09609433267487785, 12)
    expect(worldYear('golden', 2033).z).toBeCloseTo(-0.5722132268380281, 12)
    expect(savingsRate('us')).toBe(0.026)
    expect(fundName(info, PRESENT_YEAR).name).toBe(`${info.ex.index} Index Fund`)
  })

  it('future years are procedural even for families whose market started in the past', () => {
    const info = exchangeInfo('gb')
    for (const y of [PRESENT_YEAR, PRESENT_YEAR + 1, PRESENT_YEAR + 50]) {
      expect(indexMove('old-family', info, y)).toEqual(syntheticIndexMove('old-family', info, y))
      expect(savingsRate('gb', y)).toBe(savingsRate('gb'))
      expect(fxYear('old-family', 'gb', y)).toEqual(fxYear('old-family', 'gb', y))
    }
    // ...and a historical year is the same for every family (it is history, after all).
    expect(indexMove('a', info, 1987)).toEqual(indexMove('b', info, 1987))
    expect(exchangeYear('a', 1950, info, 2026).fund.price).toBeGreaterThan(0)
  })

  it('heirs see the same market, and reading it never touches the game RNG', () => {
    const g = investor(1999, 'us', 9)
    g.lifeId = 'dynasty'
    const heir = investor(1999, 'us', 9)
    heir.lifeId = 'dynasty-g2'
    heir.ancestors = [{ bornYear: 1969 } as GameState['ancestors'][number]]
    const rng = g.rng
    const a = investmentListing(g).map((q) => [q.secId, q.price])
    const b = investmentListing(heir).map((q) => [q.secId, q.price])
    expect(b).toEqual(a)
    expect(g.rng).toBe(rng)
    investmentsMenu.children(g)
    expect(g.rng).toBe(rng)
  })

  it('companies wear their era names', () => {
    const info = exchangeInfo('us')
    const tech = slotPlan(info).indexOf('tech')
    expect(tech).toBeGreaterThanOrEqual(0)
    const def = companyDef(info, tech, 0)
    expect(eraIdentity(def, 1925).label).toBe('Office Machines')
    expect(eraIdentity(def, PRESENT_YEAR).name).toBe(def.name)
    expect(fundName(info, 1950).trust).toBe(true)
    expect(fundName(info, 1990).name).toMatch(/S&P 500 Index Fund/)
    expect(fundName(info, 1950).name).toMatch(/Investment Trust/)
  })
})
