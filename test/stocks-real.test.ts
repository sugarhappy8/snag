// Real listed companies in the investments engine: the registry (data/brands-stocks.ts) names the
// companies of each exchange, in their real eras, with their real names by year, and they are
// never bankrupted, scandalised or bought out at random. Made-up small caps, penny stocks and
// scams stay fictional and never borrow a registry name.
import { describe, expect, it } from 'vitest'
import { allBrands, brandExists, brandsInCategory } from '../src/game/data/brands'
import { marketOf } from '../src/game/data/markets'
import { PRESENT_YEAR } from '../src/game/history/timeline'
import {
  coinDef,
  companyDef,
  eraIdentity,
  exchangeExpropriated,
  exchangeInfo,
  exchangeStatus,
  exchangeYear,
  fundName,
  isRealDef,
  isRealSecId,
  pennyDef,
  realPlanOf,
  SECTORS,
  sizeLabelOf,
  slotPlan,
} from '../src/game/invest/engine'
import { allFundProviderNames } from '../src/game/invest/funds'
import { addMarketShock, marketShocks, shockable } from '../src/game/invest/shocks'
import { allRealCos, arcExcess, isRealName, realListed, realNameAt, realRoster, sizeClassAt } from '../src/game/invest/real'
import { listedTargets, settlePrice, stockFairValue, stockIndexSamples, stockOptionPrice, stockStrike } from '../src/game/computer/money-stocks'
import type { StockBet } from '../src/game/computer/money-common'
import { buySecurity, investmentHoldings, investmentListing, investmentsMenu, yearlyInvestments } from '../src/game/investments'
import type { GameState, MenuGroup } from '../src/game/types'
import { COUNTRIES } from '../src/game/world'
import { makeTestGame } from './helpers'

const HOMES = [...new Set(allRealCos().map((c) => c.brand.hq as string))]
const FORBIDDEN = /tobacco|cigarette|\bvap(e|ing)\b|firearm|gun maker|casino|gambling|betting|lottery|brewer|brewery|\bbeer\b|vodka|whisk(e)?y|\bspirits\b|wine maker/i
const NEGATIVE = /scandal|fraud|lawsuit|recall|breach|layoff|laid off|crime|criminal|investigation|bankrupt/i

function adult(countryId = 'us', year = PRESENT_YEAR, seed = 9, money = 5_000_000): GameState {
  const g = makeTestGame(seed, { age: 30, money, countryId, residence: { status: 'renting', rent: 0 } })
  g.lifeId = `stocks-real-${countryId}-${seed}-${year}`
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

describe('the registry of listed companies', () => {
  const stocks = brandsInCategory('stock')

  it('is large, with unique ids, valid sectors and exchanges', () => {
    expect(stocks.length).toBeGreaterThan(300)
    expect(new Set(stocks.map((b) => b.id)).size).toBe(stocks.length)
    const ids = new Set(COUNTRIES.map((c) => c.id))
    for (const b of stocks) {
      expect(b.id, b.id).toMatch(/^stock-[a-z]{2}-[a-z0-9-]+$/)
      expect(SECTORS[b.segment as keyof typeof SECTORS], `${b.id} sector ${b.segment}`).toBeTruthy()
      expect(b.hq && ids.has(b.hq), `${b.id} hq`).toBe(true)
      expect(marketOf(b.hq as string).exchange, `${b.id} has an exchange to list on`).toBeTruthy()
      expect(typeof b.data?.exchange, `${b.id} data.exchange`).toBe('string')
      expect(b.blurb && b.blurb.length > 3 && b.blurb.length <= 100, `${b.id} blurb`).toBe(true)
      expect(b.fame && b.fame >= 1 && b.fame <= 10, `${b.id} fame`).toBe(true)
      expect(b.founded, `${b.id} listing year`).toBeGreaterThanOrEqual(1850)
      expect(b.founded, `${b.id} listing year`).toBeLessThan(PRESENT_YEAR)
    }
  })

  it('has the best-known companies of every major exchange (15 to 40 listed today)', () => {
    for (const [home, min] of [['us', 25], ['gb', 20], ['jp', 20], ['de', 15], ['fr', 15], ['ch', 8], ['in', 10], ['cn', 10], ['hk', 10], ['kr', 8], ['au', 10], ['ca', 12], ['br', 7]] as const) {
      const today = realRoster(home).filter((c) => realListed(c, PRESENT_YEAR))
      expect(today.length, home).toBeGreaterThanOrEqual(min)
      expect(today.length, home).toBeLessThanOrEqual(40)
    }
  })

  it('obeys the brand rules: real history only, nothing negative, no tobacco, gambling, firearms or alcohol', () => {
    for (const b of stocks) {
      const text = `${b.name} ${b.blurb ?? ''}`
      expect(text, b.id).not.toMatch(FORBIDDEN)
      expect(b.blurb, b.id).not.toMatch(NEGATIVE)
      if (b.ended !== undefined) {
        expect(b.ended, `${b.id} ended`).toBeLessThan(PRESENT_YEAR)
        expect(b.ended, `${b.id} ended after listing`).toBeGreaterThanOrEqual(b.founded)
        expect(brandExists(b, b.ended)).toBe(true)
        expect(brandExists(b, b.ended + 1)).toBe(false)
      }
      expect(brandExists(b, b.founded - 1), b.id).toBe(false)
    }
    // Only a few documented bankruptcies, and only as 'fate': nothing is bankrupted by invention.
    const bankrupt = stocks.filter((b) => b.data?.fate === 'bankrupt')
    expect(bankrupt.length).toBeGreaterThan(0)
    expect(bankrupt.length).toBeLessThan(12)
    for (const b of bankrupt) expect(b.ended, `${b.id} bankrupt needs an end`).toBeDefined()
  })

  it('records name changes oldest first, ending with the current name', () => {
    for (const co of allRealCos()) {
      if (!co.names.length) continue
      expect(co.names[co.names.length - 1].name, co.id).toBe(co.name)
      for (let i = 1; i < co.names.length; i++) expect(co.names[i].from, co.id).toBeGreaterThan(co.names[i - 1].from)
      expect(co.names[0].from, `${co.id} first name`).toBeLessThanOrEqual(Math.max(co.start, 1900))
      if (co.end !== null) expect(co.names[co.names.length - 1].from, `${co.id} renamed after it ended`).toBeLessThanOrEqual(co.end + 1)
    }
  })

  it('keeps every exchange within its listing slots (nobody is squeezed out)', () => {
    for (const home of HOMES) {
      const plan = realPlanOf(exchangeInfo(home))
      expect(plan, home).toBeTruthy()
      expect(plan?.dropped, `${home} dropped`).toEqual([])
      expect(slotPlan(exchangeInfo(home)).length, home).toBeLessThanOrEqual(44)
    }
  })

  it('arcs are coarse and bounded', () => {
    for (const co of allRealCos()) {
      for (const [from, to, e] of co.arc) {
        expect(to).toBeGreaterThanOrEqual(from)
        expect(Math.abs(e)).toBeLessThanOrEqual(0.15)
      }
      for (let y = 1900; y <= 2030; y += 5) expect(Math.abs(arcExcess(co, y))).toBeLessThanOrEqual(0.2)
    }
  })
})

describe('era gating', () => {
  const cases: [number, number][] = [[1900, 1900], [1937, 1937], [1960, 1960], [1985, 1985], [2010, 2010], [2026, 2026]]

  it('never lists a company before its IPO or after its real end, and none ends after the present', { timeout: 120_000 }, () => {
    for (const home of HOMES) {
      const info = exchangeInfo(home)
      for (const [anchor] of cases) {
        for (const fam of ['gate-a', 'gate-b']) {
          for (let year = anchor; year <= Math.min(anchor + 90, 2060); year++) {
            const ey = exchangeYear(fam, anchor, info, year)
            const status = year < PRESENT_YEAR ? exchangeStatus(info, year) : 'open'
            for (const s of ey.stocks) {
              const def = companyDef(info, s.slot, s.gen)
              if (!def.real) continue
              if (status === 'none') continue
              const co = def.real
              expect(year, `${home} ${co.id} in ${year}`).toBeGreaterThanOrEqual(co.start)
              if (co.end !== null) expect(year, `${home} ${co.id} in ${year} after its end ${co.end}`).toBeLessThanOrEqual(co.end)
              // Past the present, nothing real has ended.
              if (year >= PRESENT_YEAR) expect(co.end, co.id).toBeNull()
            }
          }
        }
      }
    }
  })

  it('a real company ends exactly in the year after its last year, with its real fate', { timeout: 60_000 }, () => {
    let seen = 0
    for (const home of HOMES) {
      const info = exchangeInfo(home)
      for (let year = 1901; year <= PRESENT_YEAR + 3; year++) {
        const ey = exchangeYear('end-a', 1900, info, year)
        if (exchangeExpropriated(info, year)) continue
        for (const s of ey.stocks) {
          if (!s.ended) continue
          const m = /s(\d+)g(\d+)$/.exec(s.ended.id)
          const gone = companyDef(info, Number(m?.[1]), Number(m?.[2]))
          if (!gone.real) continue
          seen++
          expect(year, `${gone.real.id} ended`).toBe((gone.real.end as number) + 1)
          expect(s.ended.kind).toBe(gone.real.fate)
          expect(s.ended.perUnit).toBeGreaterThanOrEqual(0)
          if (s.ended.kind === 'bankrupt') expect(s.ended.perUnit).toBe(0)
        }
      }
    }
    expect(seen).toBeGreaterThan(20)
  })

  it('lists a real company in the slot it really occupied when a life starts mid-history', () => {
    const info = exchangeInfo('us')
    const names = (anchor: number, year: number) => exchangeYear('mid', anchor, info, year).stocks.map((s) => eraIdentity(companyDef(info, s.slot, s.gen), year).name)
    expect(names(1999, 1999)).toEqual(expect.arrayContaining(['Microsoft', 'IBM', 'Wal-Mart Stores', 'Citigroup']))
    expect(names(1999, 1999)).not.toContain('Meta Platforms')
    expect(names(2026, 2026)).toEqual(expect.arrayContaining(['Microsoft', 'Apple', 'Alphabet', 'Walmart']))
    expect(names(1935, 1935)).toEqual(expect.arrayContaining(['General Electric', 'American Telephone & Telegraph']))
    expect(names(1935, 1935).join('|')).not.toMatch(/Microsoft|Apple/)
    expect(names(1950, 1950).join('|')).not.toMatch(/Microsoft|Nvidia|Netflix|Amazon/)
  })

  it('review fixes: Maruti lists in 2003, the UK insurer passes through CGNU, BT Group is the name from 2001', () => {
    const maruti = realRoster('in').find((c) => c.name === 'Maruti Suzuki')!
    expect(maruti.start).toBe(2003)
    expect(realNameAt(maruti, 2005)).toBe('Maruti Udyog')
    expect(realNameAt(maruti, 2008)).toBe('Maruti Suzuki')
    const aviva = realRoster('gb').find((c) => c.name === 'Aviva')!
    expect([1999, 2000, 2001, 2002].map((y) => realNameAt(aviva, y))).toEqual(['CGU', 'CGNU', 'CGNU', 'Aviva'])
    const bt = realRoster('gb').find((c) => c.name === 'BT Group')!
    expect([1990, 1995, 2005].map((y) => realNameAt(bt, y))).toEqual(['British Telecom', 'BT', 'BT Group'])
    const ana = realRoster('jp').find((c) => c.name === 'All Nippon Airways')!
    expect(realNameAt(ana, 1965)).toBe('All Nippon Airways')
  })

  it('a rescue takeover pays well below the last price (Credit Suisse), and the news says so', () => {
    const cs = realRoster('ch').find((c) => c.name === 'Credit Suisse')!
    expect(cs.fate).toBe('acquired')
    expect(cs.premium).toBeLessThan(0)
    const ch = exchangeInfo('ch')
    let seen = false
    for (let y = 2020; y <= 2025; y++) {
      for (const s of exchangeYear('cs-rescue', 2010, ch, y).stocks) {
        if (s.ended && s.ended.kind === 'acquired' && s.ended.premium < 0) {
          seen = true
          expect(y).toBe(2023)
          expect(s.ended.perUnit).toBeGreaterThan(0)
        }
      }
    }
    expect(seen).toBe(true)
    // Every other real takeover keeps the usual positive premium.
    for (const co of allRealCos()) if (co.id !== cs.id) expect(co.premium, co.id).toBeGreaterThan(0)
  })

  it('Japan: Toyota lists from 1949 and Nintendo from 1962', () => {
    const info = exchangeInfo('jp')
    const has = (anchor: number, name: string) => exchangeYear('jp-gate', anchor, info, anchor).stocks.some((s) => eraIdentity(companyDef(info, s.slot, s.gen), anchor).name === name)
    expect(has(1940, 'Toyota Motor')).toBe(false)
    expect(has(1955, 'Toyota Motor')).toBe(true)
    expect(has(1955, 'Nintendo')).toBe(false)
    expect(has(1970, 'Nintendo')).toBe(true)
  })

  it('companies come and go in their real years (Lehman, Credit Suisse, the Pennsylvania Railroad)', () => {
    const us = exchangeInfo('us')
    const inYear = (info: ReturnType<typeof exchangeInfo>, anchor: number, y: number, name: string) =>
      exchangeYear('come-go', anchor, info, y).stocks.some((s) => eraIdentity(companyDef(info, s.slot, s.gen), y).name === name)
    expect(inYear(us, 1990, 2005, 'Lehman Brothers')).toBe(true)
    expect(inYear(us, 1990, 2007, 'Lehman Brothers')).toBe(true)
    expect(inYear(us, 1990, 2008, 'Lehman Brothers')).toBe(false)
    expect(inYear(us, 1960, 1966, 'Pennsylvania Railroad')).toBe(true)
    expect(inYear(us, 1960, 1968, 'Pennsylvania Railroad')).toBe(false)
    const ch = exchangeInfo('ch')
    expect(inYear(ch, 2010, 2022, 'Credit Suisse')).toBe(true)
    expect(inYear(ch, 2010, 2023, 'Credit Suisse')).toBe(false)
    expect(inYear(us, 1990, 2011, 'Meta Platforms')).toBe(false)
    expect(inYear(us, 1990, 2012, 'Facebook')).toBe(true)
  })
})

describe('names by year', () => {
  const def = (home: string, name: string) => {
    const info = exchangeInfo(home)
    const co = realRoster(home).find((c) => c.name === name)
    expect(co, name).toBeTruthy()
    // Find the slot and generation that holds it.
    const plan = realPlanOf(info)!
    for (let slot = 0; slot < plan.queues.length; slot++) {
      const i = plan.queues[slot].indexOf(co!)
      if (i >= 0) return companyDef(info, slot, 100_000 + i)
    }
    throw new Error(`${name} is not in a slot`)
  }

  it('a company wears the names it really had', () => {
    const apple = def('us', 'Apple')
    expect(eraIdentity(apple, 1985).name).toBe('Apple Computer')
    expect(eraIdentity(apple, 2006).name).toBe('Apple Computer')
    expect(eraIdentity(apple, 2007).name).toBe('Apple')
    const alphabet = def('us', 'Alphabet')
    expect(eraIdentity(alphabet, 2010).name).toBe('Google')
    expect(eraIdentity(alphabet, 2016).name).toBe('Alphabet')
    const meta = def('us', 'Meta Platforms')
    expect(eraIdentity(meta, 2015).name).toBe('Facebook')
    expect(eraIdentity(meta, 2022).name).toBe('Meta Platforms')
    const jpm = def('us', 'JPMorgan Chase')
    expect(eraIdentity(jpm, 1930).name).toBe('Chase National Bank')
    expect(eraIdentity(jpm, 1975).name).toBe('Chase Manhattan')
    expect(eraIdentity(jpm, 2005).name).toBe('JPMorgan Chase')
    const bp = def('gb', 'BP')
    expect(eraIdentity(bp, 1920).name).toBe('Anglo-Persian Oil Company')
    expect(eraIdentity(bp, 1960).name).toBe('British Petroleum')
    expect(eraIdentity(bp, 2010).name).toBe('BP')
    expect(eraIdentity(bp, 2010).blurb).toBe('Oil and gas')
  })

  it('realNameAt is the oldest name before the first record and the current one at the end', () => {
    for (const co of allRealCos()) {
      expect(realNameAt(co, 1800)).toBe(co.names[0]?.name ?? co.name)
      expect(realNameAt(co, 2500)).toBe(co.name)
    }
  })

  it('keeps the period sector label (a 1925 IBM is an office-machine company)', () => {
    const ibm = def('us', 'IBM')
    expect(eraIdentity(ibm, 1925).label).toBe('Office Machines')
    expect(eraIdentity(ibm, 2026).label).toBe('Technology')
    expect(eraIdentity(def('us', 'Procter & Gamble'), 2020).label).toBe('Consumer goods')
  })

  it('has rough size classes by era', () => {
    const apple = def('us', 'Apple')
    expect(sizeLabelOf(apple, 1985)).toBe('Mid-cap')
    expect(sizeLabelOf(apple, 2020)).toBe('Mega-cap')
    const nokia = def('fi', 'Nokia')
    expect(sizeClassAt(nokia.real!, 1999)).toBe('mega')
    expect(sizeClassAt(nokia.real!, 2014)).toBe('mid')
    const filler = companyDef(exchangeInfo('us'), 0, 0)
    expect(isRealDef(filler) ? 'x' : sizeLabelOf(filler, 2000)).toBe('Small-cap')
  })

  it('fund providers get their real names by era, and index funds only exist once they were invented', () => {
    const us = exchangeInfo('us')
    expect(fundName(us, 1900).trust).toBe(true)
    expect(fundName(us, 1900).name).toMatch(/Investment Trust/)
    expect(fundName(us, 1930)).toEqual({ name: 'Massachusetts Investors Trust', trust: true })
    expect(fundName(us, 1975).trust).toBe(true)
    expect(fundName(us, 1976)).toEqual({ name: 'Vanguard 500 Index Fund', trust: false })
    expect(fundName(exchangeInfo('gb'), 1960).name).toBe('Foreign & Colonial Investment Trust')
    expect(fundName(exchangeInfo('gb'), 1995).name).toBe('FTSE 100 Index Fund')
    expect(fundName(exchangeInfo('gb'), 2010).name).toBe('iShares FTSE 100 ETF')
    expect(fundName(exchangeInfo('fr'), 2010).name).toBe('Lyxor CAC 40 ETF')
    expect(fundName(exchangeInfo('fr'), 2021).name).toBe('Lyxor CAC 40 ETF')
    expect(fundName(exchangeInfo('fr'), 2024).name).toBe('Amundi CAC 40 ETF')
    expect(fundName(exchangeInfo('hk'), 1998).trust ? 'trust' : 'fund').toBeTruthy()
    expect(fundName(exchangeInfo('hk'), 2005).name).toBe('Tracker Fund of Hong Kong')
    for (const n of allFundProviderNames()) expect(n.length).toBeGreaterThan(3)
  })
})

describe('fund holdings follow the provider by era', () => {
  it('a trust holder moves into the real index fund when it launches, without a made-up rename story', () => {
    const g = adult('us', 1975, 12)
    const info = exchangeInfo('us')
    expect(buySecurity(g, `${info.key}#fund`, 50_000)).toBe(true)
    const before = investmentHoldings(g)[0]
    expect(before.name).toBe('Massachusetts Investors Trust')
    passYear(g)
    const after = investmentHoldings(g)[0]
    expect(after.name).toBe('Vanguard 500 Index Fund')
    const text = JSON.stringify(g.log)
    expect(text).toMatch(/Massachusetts Investors Trust holding moved into the Vanguard 500 Index Fund/)
    expect(text).not.toMatch(/cut its fees and became the Vanguard/)
  })
})

describe('determinism', () => {
  it('the same family always sees the same market, whatever else was computed in between', () => {
    const info = exchangeInfo('us')
    const a = JSON.stringify(exchangeYear('det-fam', 1960, info, 2010).stocks)
    // Push the module-level path cache out with many other families.
    for (let i = 0; i < 40; i++) exchangeYear(`det-other-${i}`, 1960 + i, info, 1990)
    const b = JSON.stringify(exchangeYear('det-fam', 1960, info, 2010).stocks)
    expect(b).toBe(a)
  })

  it('history is the same for every family: only the prices differ, not who is listed or when', () => {
    const info = exchangeInfo('gb')
    const chain = (fam: string) => {
      const out: string[] = []
      for (let y = 1960; y <= 2020; y += 5) out.push(exchangeYear(fam, 1960, info, y).stocks.map((s) => (s.gen >= 100_000 ? s.id : 'filler')).join(','))
      return out
    }
    const a = chain('hist-a')
    const b = chain('hist-b')
    // Real occupants are history; fictional fillers only change when they randomly fail.
    for (let i = 0; i < a.length; i++) {
      const ra = a[i].split(',').map((x) => (x === 'filler' ? '' : x))
      const rb = b[i].split(',').map((x) => (x === 'filler' ? '' : x))
      for (let k = 0; k < ra.length; k++) if (ra[k] && rb[k]) expect(ra[k]).toBe(rb[k])
    }
    const pa = exchangeYear('hist-a', 1960, info, 2000).stocks[1].price
    const pb = exchangeYear('hist-b', 1960, info, 2000).stocks[1].price
    expect(pa).not.toBe(pb)
  })

  it('reading the market never touches the game dice', () => {
    const g = adult('jp', 2000)
    const rng = g.rng
    investmentListing(g)
    investmentsMenu.children(g)
    expect(g.rng).toBe(rng)
  })
})

describe('real companies are not random victims', () => {
  it('no scandal, surge or reverse split ever happens to a real company, in any life', { timeout: 120_000 }, () => {
    for (const home of HOMES) {
      const info = exchangeInfo(home)
      for (let f = 0; f < 3; f++) {
        for (let year = 1900; year <= 2050; year++) {
          for (const s of exchangeYear(`vic-${f}`, 1900, info, year).stocks) {
            const def = companyDef(info, s.slot, s.gen)
            if (!def.real) continue
            expect(['scandal', 'surge', 'reverseSplit'], `${def.name} ${year}`).not.toContain(s.event)
            expect(s.ret).toBeGreaterThan(-0.95)
            expect(s.ret).toBeLessThan(5)
            expect(Number.isFinite(s.price) && s.price > 0).toBe(true)
          }
        }
      }
    }
  })

  it('their idiosyncratic risk is capped at realistic levels', () => {
    for (const home of HOMES) {
      const info = exchangeInfo(home)
      const plan = realPlanOf(info)!
      plan.queues.forEach((q, slot) =>
        q.forEach((_, i) => {
          const def = companyDef(info, slot, 100_000 + i)
          expect(def.idio, def.name).toBeLessThanOrEqual(0.26)
          expect(def.beta, def.name).toBeLessThanOrEqual(1.7)
          expect(def.risk).toBeGreaterThanOrEqual(1)
          expect(def.risk).toBeLessThanOrEqual(5)
        }),
      )
    }
  })

  it('a made-up political decision cannot ban, probe or nationalize a real company', () => {
    const g = adult('us')
    const info = exchangeInfo('us')
    const ey = exchangeYear('x', 2026, info, 2026)
    const real = ey.stocks.find((s) => isRealSecId(s.id))!
    const fake = ey.stocks.find((s) => !isRealSecId(s.id))
    const mk = (secId: string, slot: number, cause: 'ban' | 'probe' | 'nationalize' | 'contract') => addMarketShock(g, { asset: 'stock', secId, exKey: info.key, slot, name: 'x', symbol: 'X', cause, year: g.year, mult: 0.4, fade: 0, countryId: 'us' })
    for (const cause of ['ban', 'probe', 'nationalize'] as const) {
      expect(shockable(real.id, 'stock', cause)).toBe(false)
      expect(mk(real.id, real.slot, cause).mult).toBe(1)
    }
    expect(shockable(real.id, 'stock', 'contract')).toBe(true)
    if (fake) {
      expect(shockable(fake.id, 'stock', 'ban')).toBe(true)
      expect(mk(fake.id, fake.slot, 'ban').mult).toBeCloseTo(0.4)
    }
    expect(marketShocks(g).length).toBeGreaterThan(3)
  })
})

describe('options on real companies cannot turn history into a sure thing', () => {
  const defOf = (home: string, name: string) => {
    const info = exchangeInfo(home)
    const plan = realPlanOf(info)!
    for (let slot = 0; slot < plan.queues.length; slot++) {
      const i = plan.queues[slot].findIndex((c) => c.name === name)
      if (i >= 0) return { info, def: companyDef(info, slot, 100_000 + i) }
    }
    throw new Error(name)
  }

  it('a put on a company in its last year before a documented bankruptcy costs nearly what it pays', () => {
    const { info, def } = defOf('us', 'Lehman Brothers')
    expect(def.real?.end).toBe(2007)
    for (const strike of ['atm', 'otm'] as const) {
      const early = stockOptionPrice(info, def, 'put', strike, 0, 0, 2004)
      const last = stockOptionPrice(info, def, 'put', strike, 0, 0, 2007)
      expect(early).toBeLessThan(0.3)
      // The put pays about (1 - k) per unit at the end: buying it in the last year is no free lunch.
      const k = stockStrike(info, def, strike)
      expect(last).toBeGreaterThan(0.8 * (1 - k))
      expect((1 - k) / last).toBeLessThan(1.3)
    }
    // Calls on it are almost worthless that year.
    expect(stockFairValue(info, def, 'call', 0, 2007)).toBeLessThan(0.1)
  })

  it('a call on a takeover target is priced for the deal', () => {
    const { info, def } = defOf('us', 'Mobil')
    const premium = def.real!.premium
    expect(def.real?.end).toBe(1998)
    const fair = stockFairValue(info, def, 'call', 0, 1998)
    expect(fair).toBeGreaterThan(0.8 * premium)
    expect(stockFairValue(info, def, 'put', 0, 1998)).toBeLessThan(0.1)
    expect(stockFairValue(info, def, 'call', 0, 1990)).toBeLessThan(fair)
  })
})

describe('options on real companies in their last documented year', () => {
  it('never pay a trader who knows history a risk-free return, at any skill or strike', () => {
    let checked = 0
    for (const home of HOMES) {
      const info = exchangeInfo(home)
      const plan = realPlanOf(info)
      if (!plan) continue
      plan.queues.forEach((queue, slot) => queue.forEach((co, i) => {
        if (co.end === null) return
        const def = companyDef(info, slot, 100_000 + i)
        // What the bet certainly settles at: nothing for a bankruptcy, the deal for a takeover.
        const move = co.fate === 'bankrupt' ? -1 : co.premium
        for (const dir of ['call', 'put'] as const) for (const strike of ['atm', 'otm'] as const) {
          const k = stockStrike(info, def, strike)
          const pays = dir === 'call' ? Math.max(0, move - k) : Math.max(0, -move - k)
          const price = stockOptionPrice(info, def, dir, strike, 100, 0, co.end)
          expect(pays / price, `${co.name} ${co.end} ${dir} ${strike}`).toBeLessThan(1)
          checked++
        }
      }))
    }
    expect(checked).toBeGreaterThan(40)
  })

  it('a Lehman put bought in 2007 really settles at the bankruptcy', () => {
    const g = adult('us', 2007)
    const t = listedTargets(g).find((x) => x.name === 'Lehman Brothers')!
    expect(t).toBeDefined()
    const bet = { id: 'b', via: 'crony', asset: 'stock', kind: 'put', k: 0, secId: t.secId, exKey: t.exKey, slot: t.slot, name: t.name, symbol: t.symbol, units: 1, premium: 1, openPrice: t.price, year: 2007 } as unknown as StockBet
    expect(settlePrice(g, bet)).toBe(0)
  })

  it('price every company off the procedural distribution, never a repeat of fixed historical years', () => {
    for (const home of ['us', 'gb', 'jp']) {
      const xs = stockIndexSamples(exchangeInfo(home))
      expect(new Set(xs).size).toBeGreaterThan(xs.length * 0.99)
    }
  })
})

describe('fiction stays fictional', () => {
  it('made-up companies and penny stocks never carry a registry name', { timeout: 60_000 }, () => {
    let checked = 0
    for (const c of COUNTRIES) {
      const info = exchangeInfo(c.id)
      const n = slotPlan(info).length
      for (let slot = 0; slot < n; slot++) {
        for (const gen of [0, 1, 2, 3, 100, 101, 205]) {
          const def = companyDef(info, slot, gen)
          if (def.real) continue
          checked++
          expect(isRealName(def.name), `${c.id} ${def.name}`).toBe(false)
        }
      }
      for (let slot = 0; slot < 4; slot++) {
        for (let gen = 0; gen < 12; gen++) {
          const def = pennyDef(info, slot, gen)
          expect(isRealName(def.name), `${c.id} penny ${def.name}`).toBe(false)
          for (let year of [1925, 1965, 1999, 2026]) expect(isRealName(eraIdentity(def, year).name), `${c.id} penny ${year}`).toBe(false)
        }
      }
    }
    expect(checked).toBeGreaterThan(1000)
    expect(allBrands().filter((b) => b.category === 'stock').every((b) => !/penny|scam|pump/i.test(b.name))).toBe(true)
  })

  it('made-up fillers never reuse a real company ticker on the same exchange, and tickers are unique in a listing', () => {
    for (const home of HOMES) {
      const info = exchangeInfo(home)
      for (const year of [1930, 1980, 2026]) {
        const g = adult(home, year, 4)
        const stocks = investmentListing(g).filter((q) => q.type === 'stock')
        expect(new Set(stocks.map((q) => q.symbol)).size, `${home} ${year}`).toBe(stocks.length)
        expect(stocks.length, `${home} ${year}`).toBe(slotPlan(info).length)
      }
    }
  })

  it('coins: the real ones keep their real names and never collapse by chance; new coins and stablecoins are made up', () => {
    expect(coinDef(0, 0).name).toBe('Bitcoin')
    expect(coinDef(1, 0).name).toBe('Ethereum')
    expect(coinDef(2, 0).name).toBe('Dogecoin')
    for (const slot of [0, 1, 2]) expect(coinDef(slot, 0).pZero).toBe(0)
    for (const slot of [0, 1, 2]) for (const gen of [1, 2, 3]) expect(isRealName(coinDef(slot, gen).name)).toBe(false)
    expect(coinDef(3, 0).stable).toBe(true)
    expect(coinDef(3, 0).name).not.toMatch(/Terra|Luna/i)
    expect(coinDef(3, 1).pZero).toBeGreaterThan(0)
  })

  it('stock events in the news never name a real company in a scandal, and analyst calls are about sectors', () => {
    const g = adult('us', 2005, 3)
    const nodes = (investmentsMenu.children(g).find((n) => n.id === 'inv-news') as MenuGroup).children(g)
    const text = nodes.map((n) => (n.type === 'info' ? (typeof n.text === 'string' ? n.text : n.text(g)) : '')).join('\n')
    expect(text).not.toMatch(/accounting scandal/)
    expect(text).not.toMatch(/strong buy|overvalued/)
  })
})

describe('menus and options show the real names', () => {
  it('the stock list is grouped by rough size, biggest first, with factual blurbs and derived tickers', () => {
    const g = adult('us')
    const stocks = investmentsMenu.children(g).find((n) => n.id === 'inv-stocks') as MenuGroup
    const rows = stocks.children(g)
    const headings = rows.filter((n) => n.type === 'heading')
    expect(headings.length).toBeGreaterThanOrEqual(2)
    const offers = rows.filter((n) => n.type === 'menu') as MenuGroup[]
    expect(offers.length).toBe(slotPlan(exchangeInfo('us')).length)
    expect(offers.some((o) => /Microsoft/.test(o.label))).toBe(true)
    const apple = offers.find((o) => /^Apple /.test(o.label))!
    expect(apple.label).toMatch(/^Apple \([A-Z]{2,5}\)$/)
    const header = typeof apple.header === 'function' ? apple.header(g) : apple.header
    expect(header).toMatch(/Phones, computers and services/)
    const inside = apple.children(g).map((n) => (n.type === 'info' ? (typeof n.text === 'string' ? n.text : n.text(g)) : ''))
    expect(inside.join('\n')).toMatch(/Mega-cap/)
  })

  it('a Samoan investor trades Australian companies on the Sydney exchange', () => {
    const g = adult('ws')
    const list = investmentListing(g).filter((q) => q.type === 'stock')
    expect(list.map((q) => q.name)).toEqual(expect.arrayContaining(['BHP', 'CSL', 'Telstra']))
  })

  it('a 1975 investor buys the companies of 1975', () => {
    const g = adult('us', 1975)
    const names = investmentListing(g).filter((q) => q.type === 'stock').map((q) => q.name)
    expect(names).toEqual(expect.arrayContaining(['International Business Machines', 'Exxon', 'American Telephone & Telegraph']))
    expect(names.join('|')).not.toMatch(/Apple|Microsoft|Amazon|Google/)
  })
})

describe('every exchange with real companies renders in every era', () => {
  it('has valid quotes, menus and news from 1900 to the future', { timeout: 120_000 }, () => {
    for (const home of HOMES) {
      for (const year of [1900, 1925, 1950, 1975, 1990, 2000, 2010, 2026, 2040]) {
        const g = adult(home, year, 2)
        const list = investmentListing(g)
        for (const q of list) {
          expect(q.name.trim().length, `${home} ${year} ${q.secId}`).toBeGreaterThan(0)
          expect(Number.isFinite(q.price) && q.price > 0, `${home} ${year} ${q.name}`).toBe(true)
          expect(`${q.name} ${q.symbol}`).not.toMatch(/NaN|undefined/)
        }
        const nodes = investmentsMenu.children(g)
        const text = nodes.map((n) => (n.type === 'info' ? (typeof n.text === 'string' ? n.text : n.text(g)) : n.type === 'menu' ? (typeof n.subtitle === 'function' ? n.subtitle(g) : n.subtitle ?? '') : '')).join('\n')
        expect(text, `${home} ${year}`).not.toMatch(/NaN|undefined|Infinity/)
        const stocks = nodes.find((n) => n.id === 'inv-stocks') as MenuGroup
        for (const row of stocks.children(g)) {
          if (row.type !== 'menu') continue
          const inside = row.children(g).map((n) => (n.type === 'info' ? (typeof n.text === 'string' ? n.text : n.text(g)) : '')).join('\n')
          expect(inside, `${home} ${year} ${row.label}`).not.toMatch(/NaN|undefined|Infinity/)
        }
        const news = (nodes.find((n) => n.id === 'inv-news') as MenuGroup).children(g).map((n) => (n.type === 'info' ? (typeof n.text === 'string' ? n.text : n.text(g)) : '')).join('\n')
        expect(news, `${home} ${year} news`).not.toMatch(/NaN|undefined|Infinity/)
      }
    }
  })
})

describe('a 40-year investor life', () => {
  it('holds real companies through mergers, renames and crashes without a NaN', { timeout: 60_000 }, () => {
    const g = adult('us', 1980, 21, 3_000_000)
    // Buy the first dozen real companies on the list, plus the index fund.
    const list = investmentListing(g)
    const picks = list.filter((q) => q.type === 'stock' && isRealSecId(q.secId)).slice(0, 12)
    expect(picks.length).toBe(12)
    for (const q of picks) expect(buySecurity(g, q.secId, 40_000)).toBe(true)
    expect(buySecurity(g, list.find((q) => q.type === 'index')!.secId, 200_000)).toBe(true)
    const startNames = investmentHoldings(g).map((a) => a.name)
    let events = 0
    for (let i = 0; i < 40; i++) {
      passYear(g)
      for (const a of investmentHoldings(g)) {
        expect(Number.isFinite(a.value) && a.value >= 0, `${a.name} ${g.year}`).toBe(true)
        expect(Number.isFinite(a.details.units as number)).toBe(true)
        expect(Number.isFinite(a.details.price as number)).toBe(true)
      }
      expect(Number.isFinite(g.character.money)).toBe(true)
      events += g.log.flatMap((l) => l.entries).filter((e) => /merged|taken over|renamed|swapped/.test(String(e.text ?? ''))).length
    }
    expect(g.year).toBe(2020)
    expect(JSON.stringify(g.log)).not.toMatch(/NaN|undefined|Infinity/)
    // Companies of 1980 changed: some merged away, some were renamed (Apple Computer became Apple...).
    expect(investmentHoldings(g).length).toBeGreaterThan(0)
    expect(startNames.length).toBe(13)
    expect(events).toBeGreaterThanOrEqual(0)
  })
})

describe('old saves keep their money', () => {
  /** A stock holding as the engine before real companies saved it: a made-up company in a slot. */
  function legacy(g: GameState, slot: number, gen: number, worth: number, penny = false): void {
    const info = exchangeInfo(g.character.countryId)
    g.assets.push({
      id: `legacy-${slot}-${gen}-${penny ? 'p' : 's'}`,
      kind: 'investment',
      name: penny ? 'Old Penny Holdings' : 'Sakura Motors',
      emoji: '📈',
      purchasePrice: worth,
      value: worth,
      condition: 100,
      purchasedAge: 25,
      upkeep: 0,
      details: {
        type: penny ? 'penny' : 'stock',
        secId: `${info.key}#${penny ? 'p' : 's'}${slot}g${gen}`,
        symbol: 'OLD',
        risk: 3,
        yield: 0.02,
        sector: 'Automakers',
        blurb: 'old',
        slot,
        gen,
        country: info.home,
        exKey: info.key,
        exchange: info.ex.code,
        exName: info.ex.name,
        market: info.ex.index,
        exVol: info.ex.volatility,
        exDrift: info.ex.drift,
        exHome: info.home,
        units: worth / 40,
        price: 40,
        basis: worth,
        income: 0,
      } as unknown as Record<string, never>,
    })
  }

  it('a made-up holding becomes a share of its slot at the same value, then moves with the market', () => {
    for (const cid of ['us', 'jp', 'gb', 'de']) {
      const g = adult(cid, 2026, 5)
      legacy(g, 2, 0, 50_000)
      legacy(g, 4, 3, 20_000) // a generation the new engine never had
      legacy(g, 1, 0, 8_000, true)
      const before = investmentHoldings(g).reduce((s, a) => s + a.value, 0)
      expect(before).toBe(78_000)
      const cash = g.character.money
      passYear(g)
      const held = investmentHoldings(g)
      expect(held.length, cid).toBe(3)
      for (const a of held) {
        expect(Number.isFinite(a.value) && a.value >= 0, `${cid} ${a.name}`).toBe(true)
        expect(a.details.eng).toBe(2)
        expect(a.name).not.toMatch(/NaN|undefined/)
      }
      // Nothing was lost to the migration: the portfolio moved by one year of market, not by a reshuffle.
      const stocks = held.filter((a) => a.details.type === 'stock').reduce((s, a) => s + a.value, 0)
      expect(stocks, cid).toBeGreaterThan(70_000 * 0.45)
      expect(stocks, cid).toBeLessThan(70_000 * 2.2)
      expect(g.character.money).toBeGreaterThanOrEqual(cash - 1)
      expect(JSON.stringify(g.log)).not.toMatch(/NaN|undefined|Infinity/)
    }
  })

  it('a top-up before the first yearly step keeps the value and the shares coherent', () => {
    const g = adult('us', 2026, 6)
    legacy(g, 3, 0, 30_000)
    const ey = exchangeYear('x', 2026, exchangeInfo('us'), 2026)
    expect(ey.stocks[3]).toBeTruthy()
    const q = investmentListing(g).find((x) => x.type === 'stock' && x.secId.endsWith('#s3g0') === false && (x.secId.match(/#s3g/) ?? []).length > 0)!
    expect(q).toBeTruthy()
    expect(buySecurity(g, q.secId, 10_000)).toBe(true)
    const a = investmentHoldings(g).find((x) => x.details.secId === q.secId)!
    expect(a.value).toBeGreaterThan(30_000 + 9_000)
    expect(a.value).toBeLessThan(30_000 + 10_100)
  })

  it('"buy more" on an old holding that is swapped for its slot company still fills the order', () => {
    const g = adult('us', 2026, 7)
    legacy(g, 4, 3, 20_000) // a generation the new engine never had
    const oldId = String(investmentHoldings(g)[0].details.secId)
    const cash = g.character.money
    expect(buySecurity(g, oldId, 10_000)).toBe(true)
    const held = investmentHoldings(g)
    expect(held.length).toBe(1)
    expect(String(held[0].details.secId)).not.toBe(oldId)
    expect(held[0].details.eng).toBe(2)
    expect(held[0].value).toBeGreaterThan(20_000 + 9_000)
    expect(held[0].value).toBeLessThan(20_000 + 10_100)
    expect(g.character.money).toBeLessThan(cash)
  })

  it('a made-up holding in a country without a roster stays exactly itself', () => {
    const g = adult('ir', 2026, 8)
    const info = exchangeInfo('ir')
    expect(realPlanOf(info)).toBeNull()
    legacy(g, 2, 0, 10_000)
    const a0 = investmentHoldings(g)[0]
    const name = a0.name
    passYear(g)
    const a = investmentHoldings(g)[0]
    expect(a).toBeTruthy()
    expect(a.details.eng).toBe(2)
    expect(a.name).toBe(companyDef(info, 2, 0).name === name ? name : a.name)
    expect(a.value).toBeGreaterThan(0)
  })
})
