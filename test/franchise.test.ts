// Franchising: who can do it, what a sale books, royalties booked exactly once a year, churn,
// scandals, buy-backs, and money conservation (every dollar comes from a modeled franchisee).
import { describe, expect, it } from 'vitest'
import { becomeCeo } from '../src/game/business/career'
import { evolve, recordYear, simulateYear, startupCost, valuationOf } from '../src/game/business/economy'
import {
  bestFranchiseCount,
  bookFranchiseYear,
  buyBackFranchises,
  buyBackPrice,
  closeRate,
  FRANCHISE_INDUSTRIES,
  franchiseBlock,
  franchiseFee,
  franchiseIncomeFor,
  franchiseInternals,
  franchiseMenu,
  franchiseQuote,
  franchiseValue,
  maxSellable,
  netFee,
  networkRoom,
  networkSize,
  readFranchise,
  ROYALTY,
  sellFranchises,
  SUPPORT,
  unitRoyalty,
  unitSales,
} from '../src/game/business/franchise'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { bizOf, findBusiness, readBiz, totalOutlets, type BizState } from '../src/game/business/state'
import { applyPlan, autoPlan, yearlyBusinessImpl } from '../src/game/business/yearly'
import { INDUSTRY_IDS, marketOf } from '../src/game/data/markets'
import { createNewLife } from '../src/game/life'
import { runScript } from '../src/game/scripts'
import type { Asset, ChoiceModal, GameState, Json } from '../src/game/types'
import { getCountry } from '../src/game/world'

function company(seed: number, industry: string, opts: Partial<BizState> & { years?: number; talent?: boolean } = {}): { g: GameState; a: Asset; b: BizState } {
  const g = createNewLife({ seed, year: 1980, countryId: 'us' })
  g.queue = []
  g.year = 2012
  const c = g.character
  c.age = 32
  c.money = 3_000_000
  c.talent = null
  c.talents = opts.talent === false ? undefined : ['Business']
  const { years = 3, talent: _t, ...rest } = opts
  const b0 = newBiz(g, industry as BizState['industry'], 'us', getCountry('us').cities[0], { cash: 400_000, brand: 60, quality: 70, ...rest })
  const a = createBusinessAsset(g, 'Test Co', b0, 100_000)
  g.assets.push(a)
  becomeCeo(g, a, b0)
  const b = bizOf(g, a)
  applyPlan(b, autoPlan(g, b, 1))
  for (let y = 0; y < years; y++) {
    const r = simulateYear(g, b, g.year, b.ownerSalary)
    evolve(g, b, r.stmt, g.year)
    recordYear(b, r.stmt)
    b.valuation = valuationOf(b)
    g.year += 1
    applyPlan(b, autoPlan(g, b, r.stmt.cycle))
  }
  // Keep the brand and quality where the test wants them (a few years of drift moved them).
  b.brand = rest.brand ?? 60
  b.quality = rest.quality ?? 70
  if (b.last && b.last.net <= 0) b.last = { ...b.last, net: 10_000 }
  g.queue = []
  return { g, a, b }
}

describe('franchising: who can franchise', () => {
  it('is for consumer-facing classic trades only', () => {
    for (const id of FRANCHISE_INDUSTRIES) expect(INDUSTRY_IDS as readonly string[]).toContain(id)
    for (const industry of ['bank', 'investmentFirm', 'gameStudio', 'semiconductor', 'construction', 'software', 'manufacturing']) {
      const { a, b } = company(1, industry, { years: 0, ...(industry === 'semiconductor' ? { cash: 30_000_000 } : {}) })
      expect(franchiseMenu(a, b), industry).toBeNull()
      expect(franchiseBlock(b), industry).toMatch(/don't franchise/)
    }
  })

  it('needs a proven, profitable, known concept', () => {
    const young = company(2, 'cafe', { years: 1 })
    expect(franchiseBlock(young.b)).toMatch(/proven concepts/)
    const { b } = company(2, 'cafe')
    expect(franchiseBlock(b)).toBeNull()
    expect(franchiseBlock({ ...b, brand: 20 })).toMatch(/unknown brand/)
    expect(franchiseBlock({ ...b, quality: 30 })).toMatch(/shaky/)
    expect(franchiseBlock({ ...b, last: { ...b.last!, net: -1 } })).toMatch(/profitable year/)
  })
})

describe('franchising: selling', () => {
  it('books the net fees once (cash and yearIncome) and never sells past the buyers or the room', () => {
    const { g, a, b } = company(3, 'restaurant')
    const max = maxSellable(g, b)
    expect(max).toBeGreaterThan(0)
    const cash = b.cash
    const income = b.yearIncome
    const fee = netFee(b)
    const sold = sellFranchises(g, a, b, max + 50)
    expect(sold).toBe(max)
    expect(b.cash - cash).toBe(fee * sold)
    expect(b.yearIncome - income).toBe(fee * sold)
    expect(readFranchise(b).units).toBe(sold)
    expect(maxSellable(g, b)).toBe(0)
    expect(sellFranchises(g, a, b, 5)).toBe(0)
    expect(franchiseIncomeFor(b, g.year)).toBe(fee * sold)
    expect(fee).toBe(Math.round(franchiseFee(b) * 0.7))
  })

  it('stops at the home market’s room and earns less per unit as the network crowds it', () => {
    const { g, b } = company(4, 'cafe')
    const room = networkRoom(b)
    const st = readFranchise(b)
    b.franchise = { ...st, units: room - totalOutlets(b) } as unknown as Json
    expect(networkSize(b)).toBe(room)
    expect(maxSellable(g, b)).toBe(0)
    expect(unitSales(b, room)).toBeLessThan(unitSales(b, 5))
  })

  it('the hint picks the count the shared value function likes best, and the quote matches the sale', () => {
    const { g, a, b } = company(5, 'restaurant', { brand: 80, quality: 85 })
    const best = bestFranchiseCount(g, b)
    expect(best).not.toBeNull()
    const max = maxSellable(g, b)
    for (const n of [1, Math.max(1, Math.floor(max / 2)), max]) expect(franchiseValue(g, b, n)).toBeLessThanOrEqual(best!.value + 1)
    const q = franchiseQuote(g, b, best!.n)
    const cash = b.cash
    sellFranchises(g, a, b, best!.n)
    expect(b.cash - cash).toBe(q.fees)
  })
})

describe('franchising: the year', () => {
  it('books royalties once per fiscal year, as income the year simulation counts but never pays twice', () => {
    const { g, a, b } = company(6, 'restaurant')
    sellFranchises(g, a, b, Math.min(5, maxSellable(g, b)))
    const units = readFranchise(b).units
    expect(units).toBeGreaterThan(0)
    const fiscal = g.year
    g.year += 1
    // Two copies of the company: one with the franchise network, one without, same dice.
    const g2 = structuredClone(g)
    const a2 = findBusiness(g2, a.id)!
    const b2 = bizOf(g2, a2)
    delete b2.franchise
    const per = unitRoyalty(b)
    const fresh = readFranchise(b).added
    const cash0 = b.cash
    const inc0 = b.yearIncome
    bookFranchiseYear(g, a, b, fiscal)
    const royalty = Math.round((units - fresh * 0.5) * per)
    expect(b.cash - cash0).toBe(royalty)
    expect(b.yearIncome - inc0).toBe(royalty)
    expect(readFranchise(b).ledger.find((x) => x.year === fiscal)?.royalty).toBe(royalty)
    // Booking the same year again does nothing.
    const again = b.cash
    bookFranchiseYear(g, a, b, fiscal)
    expect(b.cash).toBe(again)
    // The simulation counts it in profit; the extra cash equals the extra net profit exactly.
    g.rng = g2.rng = 4242
    const brandWith = b.brand
    b2.brand = brandWith
    const r1 = simulateYear(g, b, fiscal, 0, 1)
    const r2 = simulateYear(g2, b2, fiscal, 0, 1)
    // Both copies already hold the fees from this year's sale; only the royalty differs.
    expect(r1.stmt.otherIncome - r2.stmt.otherIncome).toBe(royalty)
    const extraNet = r1.stmt.net - r2.stmt.net
    expect(extraNet).toBeLessThanOrEqual(royalty)
    expect(extraNet).toBeGreaterThan(0)
    // Cash grew by the extra (after-tax) profit and nothing more (inflation erosion aside).
    expect(Math.abs(b.cash - b2.cash + (r1.stmt.cashErosion - r2.stmt.cashErosion) - extraNet)).toBeLessThanOrEqual(2)
  })

  it('lifetime franchise money equals what the ledger booked, and every booking moved cash once', () => {
    const { g, a, b } = company(7, 'cafe', { brand: 75, quality: 80 })
    let booked = 0
    for (let y = 0; y < 6; y++) {
      const cash = b.cash
      const sold = sellFranchises(g, a, b, maxSellable(g, b))
      booked += b.cash - cash
      expect(b.cash - cash).toBe(sold * netFee(b))
      const before = b.cash
      bookFranchiseYear(g, a, b, g.year)
      booked += b.cash - before
      b.yearIncome = 0
      b.yearCosts = 0
      g.queue = []
      g.year += 1
    }
    const st = readFranchise(b)
    expect(st.lifetime).toBe(booked)
    expect(st.units).toBeGreaterThan(0)
    expect(Number.isFinite(b.cash)).toBe(true)
  })

  it('loses a share of franchisees each year, exactly (fractions carry over, no dice)', () => {
    const { g, a, b } = company(8, 'cafe')
    b.franchise = { units: 100, since: 2000, added: 0, addedYear: 0, booked: 0, carry: 0, lifetime: 0, scandals: 0, lastScandal: g.year, ledger: [] } as unknown as Json
    const rate = closeRate(b)
    const rng = g.rng
    bookFranchiseYear(g, a, b, g.year)
    expect(g.rng).toBe(rng) // no scandal roll the year after one
    const st = readFranchise(b)
    expect(st.units).toBe(100 - Math.floor(100 * rate))
    expect(st.carry).toBeCloseTo(100 * rate - Math.floor(100 * rate), 6)
  })

  it('runs through the real yearly loop without breaking anything', () => {
    const { g, a, b } = company(9, 'restaurant')
    sellFranchises(g, a, b, maxSellable(g, b))
    for (let y = 0; y < 3; y++) {
      g.year += 1
      g.queue = []
      yearlyBusinessImpl(g)
      const cur = findBusiness(g, a.id)
      if (!cur) break
      const bb = readBiz(g, cur)
      expect(Number.isFinite(bb.cash)).toBe(true)
      expect(readFranchise(bb).booked).toBe(g.year - 1)
    }
  })
})

describe('franchising: scandals and buy-backs', () => {
  it('scandal choices do what they say, and the hint uses the same numbers', () => {
    const { g, a, b } = company(10, 'restaurant', { quality: 40 })
    b.franchise = { units: 20, since: 2000, added: 0, addedYear: 0, booked: 0, carry: 0, lifetime: 0, scandals: 0, lastScandal: 0, ledger: [] } as unknown as Json
    franchiseInternals.presentScandal(g, a, b)
    const m = [...g.queue].reverse().find((x): x is ChoiceModal => x.kind === 'choice')!
    expect(m.title).toBe('Franchisee Scandal')
    expect(m.choices.filter((c) => c.hint)).toHaveLength(1)
    const run = (id: string) => {
      const g1 = structuredClone(g)
      g1.queue = []
      runScript(g1, m.scriptId!, id, m.data, m)
      return readBiz(g1, findBusiness(g1, a.id)!)
    }
    const cut = run('cut')
    expect(readFranchise(cut).units).toBe(19)
    expect(cut.brand).toBe(b.brand - 2)
    const fix = run('fix')
    const cost = franchiseInternals.retrainCost(b)
    expect(b.cash - fix.cash).toBe(cost)
    expect(fix.yearCosts - b.yearCosts).toBe(cost)
    const deny = run('deny')
    expect(deny.brand).toBeLessThanOrEqual(b.brand - 4)
  })

  it('a hired CEO handles a scandal without a popup', () => {
    const { g, a, b } = company(11, 'restaurant', { quality: 40 })
    b.franchise = { units: 20 } as unknown as Json
    g.character.job = null
    b.ceo = 'manager'
    b.manager = { firstName: 'Pat', lastName: 'Morgan', gender: 'male', skill: 60, salary: 60_000, since: 2000 }
    franchiseInternals.presentScandal(g, a, b)
    expect(g.queue.some((m) => m.kind === 'choice')).toBe(false)
  })

  it('buying franchisees back is capital spending: cash for outlets, no expense, no money made', () => {
    const { g, a, b } = company(12, 'restaurant')
    b.cash = 50_000_000
    b.franchise = { units: 10 } as unknown as Json
    const price = buyBackPrice(b)
    const outlets = totalOutlets(b)
    const cash = b.cash
    const costs = b.yearCosts
    expect(buyBackFranchises(g, a, b, 4)).toBe(4)
    expect(cash - b.cash).toBe(price * 4)
    expect(b.yearCosts).toBe(costs)
    expect(totalOutlets(b)).toBe(outlets + 4)
    expect(readFranchise(b).units).toBe(6)
    // Selling them again and buying back never makes money.
    expect(price).toBeGreaterThan(netFee(b))
  })

  it('buying back is never a cheaper way to open an outlet, and selling to buy back always loses (every trade)', () => {
    for (const industry of FRANCHISE_INDUSTRIES) {
      const { b } = company(14, industry)
      // The dearest home city a bought-back outlet can land in: opening it there yourself.
      const open = Math.max(...getCountry('us').cities.slice(0, 10).map((city) => startupCost(b.industry, 'us', city).capital))
      expect(buyBackPrice(b), industry).toBeGreaterThanOrEqual(open + franchiseFee(b))
      expect(buyBackPrice(b) - netFee(b), industry).toBeGreaterThan(open)
    }
  })

  it('buying franchisees back does not hand this year’s buyers back (no sell, buy back, sell loop)', () => {
    const { g, a, b } = company(15, 'hotel', { brand: 85, quality: 85 })
    b.cash = 5_000_000_000
    const max = maxSellable(g, b)
    expect(max).toBeGreaterThan(0)
    let sold = 0
    for (let i = 0; i < 4; i++) {
      const k = sellFranchises(g, a, b, 10_000)
      sold += k
      buyBackFranchises(g, a, b, k)
    }
    expect(sold).toBe(max)
    expect(maxSellable(g, b)).toBe(0)
    // Terminating a franchisee after a scandal doesn't make a slot either.
    sellFranchises(g, a, b, 1)
    expect(readFranchise(b).units).toBe(0)
    b.franchise = { ...readFranchise(b), units: 3 } as unknown as Json
    franchiseInternals.resolveScandal(g, a, b, 'cut', false)
    expect(maxSellable(g, b)).toBe(0)
    // Next year the buyers are back.
    g.year += 1
    expect(maxSellable(g, b)).toBeGreaterThan(0)
  })

  it('values one-off fees at their cash, never capitalized as profit (a burst of sales cannot inflate the price)', () => {
    const { b } = company(17, 'restaurant')
    const last = b.history[b.history.length - 1]
    const fees = 2_000_000
    const keep = 1 - marketOf(b.countryId).corporateTax
    const base = valuationOf(b)
    // The year's profit carried the after-tax fees; the cash holds them once.
    const withFees: BizState = {
      ...b,
      cash: b.cash + fees * keep,
      history: [...b.history.slice(0, -1), { ...last, profit: last.profit + fees * keep }],
      franchise: { units: 40, ledger: [{ year: last.year, fees, royalty: 0 }] } as unknown as Json,
    }
    expect(Math.abs(valuationOf(withFees) - (base + fees * keep))).toBeLessThanOrEqual(2)
    // Royalties recur, so they are valued like any profit.
    const withRoyalty: BizState = { ...withFees, franchise: { units: 40, ledger: [{ year: last.year, fees: 0, royalty: fees }] } as unknown as Json }
    expect(valuationOf(withRoyalty)).toBeGreaterThan(valuationOf(withFees) + fees * keep)
  })

  it('royalty and support rates are honest constants', () => {
    expect(ROYALTY).toBeGreaterThan(SUPPORT)
    const { b } = company(13, 'cafe')
    expect(unitRoyalty(b)).toBeCloseTo(unitSales(b) * (ROYALTY - SUPPORT), 6)
  })

  it('reads junk franchise data from old or damaged saves safely', () => {
    for (const junk of [null, 5, 'x', [1, 2], { units: 'many', ledger: [null, { year: 'y' }, { year: 2010, fees: -5, royalty: 3 }] }]) {
      const st = readFranchise({ franchise: junk as Json })
      expect(Number.isFinite(st.units)).toBe(true)
      expect(st.units).toBeGreaterThanOrEqual(0)
      for (const row of st.ledger) expect(row.fees).toBeGreaterThanOrEqual(0)
    }
  })
})
