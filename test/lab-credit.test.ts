// The R&D tax credit and the research grant: the same formula as deep tech's, booked once a fiscal year
// through yearIncome, shown on the annual report and never capitalized in the valuation.
import { describe, expect, it } from 'vitest'
import { RD_CREDIT } from '../src/game/business/deeptech-data'
import { valuationOf } from '../src/game/business/economy'
import { breakthroughsFor } from '../src/game/business/heavy-data'
import { labCreditRate, labGrantAmount, LAB_CREDIT_CAP, LAB_GRANTS } from '../src/game/business/lab-data'
import { readLab } from '../src/game/business/lab-state'
import { bookLabYear, labCredit, labSpendIn } from '../src/game/business/lab-year'
import { productIdeas } from '../src/game/business/products'
import { rdRange, startRd } from '../src/game/business/rd'
import type { BizState } from '../src/game/business/state'
import { clampN, money } from '../src/game/business/util'
import { statementLines } from '../src/game/business/yearly'
import { marketOf } from '../src/game/data/markets'
import type { Asset, GameState } from '../src/game/types'
import { labGame, noDraw, patchLab } from './lab-kit'
import { nextYear } from './market-kit'

const COUNTRIES = [...Object.keys(RD_CREDIT), 'zz']
const CREDIT_LABEL = 'R&D tax credit and grants'
const ROYALTY_LABEL = 'Patent licences'
const TEAM_LABEL = 'Research team'

function logCount(g: GameState): number {
  return g.log.reduce((n, y) => n + y.entries.length, 0)
}

/** Start the first idea of a company at its normal budget; returns the budget. */
function startIdea(g: GameState, a: Asset, b: BizState): number {
  const idea = productIdeas(g, b, 1)[0]
  const budget = rdRange(b, idea).normal
  expect(startRd(g, a, b, idea, budget)).not.toBeNull()
  return budget
}

/** The dollars a statement line shows (an unsigned number), 0 when the line is not there. */
function shown(lines: { label: string; value: string }[], label: string): number {
  const row = lines.find((l) => l.label === label)
  return row ? Number(row.value.replace(/[^0-9.]/g, '')) : 0
}

describe('the R&D credit', () => {
  it('credit equals the deep-tech formula for a small spend', () => {
    for (const c of COUNTRIES) expect(labCredit(c, 40_000), c).toBe(Math.round(Math.min(50_000_000, 40_000 * clampN(RD_CREDIT[c] ?? 0, 0, 0.5))))
  })

  it('credit is capped at 250,000 and never above half the spend', () => {
    expect(LAB_CREDIT_CAP).toBe(250_000)
    for (const c of COUNTRIES) {
      expect(labCredit(c, 1e9), c).toBe(labCreditRate(c) > 0 ? 250_000 : 0)
      for (const s of [1e3, 1e5, 1e6]) expect(labCredit(c, s), c).toBeLessThanOrEqual(s / 2)
    }
    for (const bad of [0, -5, Number.NaN]) expect(labCredit('ca', bad)).toBe(0)
  })

  it('reads a rate only from the table, never from the prototype', () => {
    for (const c of ['constructor', '__proto__', 'toString', '', 'zz']) expect(labCreditRate(c), c).toBe(0)
    expect(labCreditRate('ca')).toBe(0.35)
  })

  it('credit plus grant is at most half the price in every country and tier', () => {
    for (const c of COUNTRIES) {
      for (const tier of ['low', 'mid', 'high'] as const) {
        for (const price of [20_000, 60_000, 260_000, 2e6]) {
          const grant = labGrantAmount(c, tier, price)
          expect(grant, `${c} ${tier}`).toBeGreaterThanOrEqual(0)
          expect(labCredit(c, price) + grant, `${c} ${tier} ${price}`).toBeLessThanOrEqual(price / 2 + 1)
        }
      }
    }
    expect(labGrantAmount('us', 'low', 60_000)).toBe(0) // the us row covers mid and high only
    expect(labGrantAmount('us', 'mid', 60_000)).toBeGreaterThan(0)
    expect(labGrantAmount('zz', 'low', 60_000)).toBeGreaterThan(0) // any other country: all three tiers
    for (const c of COUNTRIES) expect(labGrantAmount(c, 'breakthrough', 60_000), c).toBe(0)
  })

  it('has the ten grant rows of the design', () => {
    expect(LAB_GRANTS).toHaveLength(10)
    expect(LAB_GRANTS.map((r) => r.where)).toEqual(['us', 'gb', 'de', 'fr', 'jp', 'ca', 'au', 'sg', 'kr', '*'])
    expect(labGrantAmount('de', 'high', 1e9)).toBe(120_000)
    expect(labGrantAmount('gb', 'low', 100_000)).toBe(Math.floor(100_000 * Math.min(0.3, 0.5 - 0.2)))
    for (const bad of [0, -1, Number.NaN]) expect(labGrantAmount('gb', 'low', bad)).toBe(0)
  })

  it('counts what was started in the fiscal year, of every kind', () => {
    const { b } = labGame(10, 'restaurant', { country: 'ca' })
    const heavy = breakthroughsFor('restaurant')[0].name
    b.rd = [
      { id: 'r1', name: 'A line', budget: 10_000, years: 1, progress: 0, odds: 0.5, boost: 0, started: 2031 },
      { id: 'r2', name: 'Older line', budget: 7_000, years: 1, progress: 0, odds: 0.5, boost: 0, started: 2030 },
      { id: 'r3', name: heavy, budget: 90_000, years: 4, progress: 1, odds: 0.5, boost: 0, heavy: true, cost: 80_000, started: 2031 },
    ]
    patchLab(b, (d) => {
      d.programs.push({ id: 'ops.cost.1', started: 2031, years: 1, progress: 0, odds: 0.7, price: 50_000, grant: 0 })
    })
    expect(labSpendIn(b, 2031)).toBe(10_000 + 80_000 + 50_000)
    expect(labSpendIn(b, 2030)).toBe(7_000)
    expect(labSpendIn(b, 2029)).toBe(0)
  })
})

describe('booking the year', () => {
  it('books the credit of a project started in the fiscal year, once [RF2]', () => {
    const { g, a, b } = labGame(11, 'restaurant', { country: 'ca' })
    const budget = startIdea(g, a, b)
    const fiscal = g.year
    g.year += 1
    const credit = Math.round(Math.min(250_000, budget * 0.35))
    expect(credit).toBeGreaterThan(0)
    const cash = b.cash
    const income = b.yearIncome
    const costs = b.yearCosts
    const logs = logCount(g)
    bookLabYear(g, a, b, fiscal)
    expect(b.cash - cash).toBe(credit)
    expect(b.yearIncome - income).toBe(credit)
    expect(b.yearCosts).toBe(costs)
    expect(readLab(b).ledger).toEqual([{ year: fiscal, credit, grant: 0, royalty: 0, payroll: 0 }])
    expect(readLab(b).booked).toBe(fiscal)
    expect(logCount(g)).toBe(logs)
    const snapshot = JSON.stringify(b)
    const rng = g.rng
    expect(noDraw(g, () => bookLabYear(g, a, b, fiscal))).toBe(true)
    expect(JSON.stringify(b)).toBe(snapshot)
    expect(g.rng).toBe(rng)
    expect(logCount(g)).toBe(logs)
  })

  it('books through the real year end, once', () => {
    const { g, a, b } = labGame(16, 'restaurant', { country: 'ca' })
    const budget = startIdea(g, a, b)
    const credit = labCredit('ca', budget)
    nextYear(g)
    expect(readLab(b).ledger.map((r) => [r.year, r.credit])).toEqual([[g.year - 1, credit]])
    expect(b.last?.year).toBe(g.year - 1)
    // the next year spends nothing new, so the lab books no second credit
    nextYear(g)
    expect(readLab(b).ledger.filter((r) => r.credit > 0)).toHaveLength(1)
  })

  it('creates no lab when nothing was spent [RF1]', () => {
    const { g, a, b } = labGame(12, 'restaurant', { country: 'ca' })
    expect('lab' in b).toBe(false)
    nextYear(g)
    g.queue = []
    expect('lab' in b).toBe(false)
    bookLabYear(g, a, b, g.year)
    expect('lab' in b).toBe(false)
    // a country with no credit: money was spent, but no credit and no lab
    expect(labCreditRate('ng')).toBe(0)
    const none = labGame(13, 'restaurant', { country: 'ng' })
    startIdea(none.g, none.a, none.b)
    bookLabYear(none.g, none.a, none.b, none.g.year)
    expect('lab' in none.b).toBe(false)
  })

  it('skips deep-tech, finance and studio companies', () => {
    for (const industry of ['aiLab', 'bank', 'gameStudio'] as const) {
      const { g, a, b } = labGame(14, industry, { country: 'ca' })
      b.rd = [{ id: 'rd.test', name: 'Test line', budget: 100_000, years: 1, progress: 0, odds: 0.5, boost: 0, started: g.year }]
      const cash = b.cash
      bookLabYear(g, a, b, g.year)
      expect(b.cash, industry).toBe(cash)
      expect('lab' in b, industry).toBe(false)
    }
    // the same project in an ordinary company does earn the credit
    const { g, a, b } = labGame(14, 'restaurant', { country: 'ca' })
    b.rd = [{ id: 'rd.test', name: 'Test line', budget: 100_000, years: 1, progress: 0, odds: 0.5, boost: 0, started: g.year }]
    const cash = b.cash
    bookLabYear(g, a, b, g.year)
    expect(b.cash - cash).toBe(35_000)
  })

  it('pays a due grant once and clears it', () => {
    const { g, a, b } = labGame(15, 'restaurant', { country: 'ca' })
    patchLab(b, (d) => {
      d.due.grant = 12_000
    })
    const cash = b.cash
    const income = b.yearIncome
    const logs = logCount(g)
    bookLabYear(g, a, b, g.year)
    expect(b.cash - cash).toBe(12_000)
    expect(b.yearIncome - income).toBe(12_000)
    expect(readLab(b).due.grant).toBe(0)
    expect(readLab(b).ledger).toEqual([{ year: g.year, credit: 0, grant: 12_000, royalty: 0, payroll: 0 }])
    expect(logCount(g)).toBe(logs + 1)
    const line = g.log[g.log.length - 1].entries.at(-1)!
    expect(line.text).toBe(`${a.name} received a ${money(12_000)} research grant.`)
    bookLabYear(g, a, b, g.year)
    expect(b.cash - cash).toBe(12_000)
    expect(logCount(g)).toBe(logs + 1)
  })

  it('books a due grant and a credit together in one ledger row', () => {
    const { g, a, b } = labGame(17, 'restaurant', { country: 'ca' })
    const budget = startIdea(g, a, b)
    const fiscal = g.year
    patchLab(b, (d) => {
      d.due.grant = 3_000
    })
    const cash = b.cash
    bookLabYear(g, a, b, fiscal)
    const credit = labCredit('ca', budget)
    expect(b.cash - cash).toBe(credit + 3_000)
    expect(readLab(b).ledger).toEqual([{ year: fiscal, credit, grant: 3_000, royalty: 0, payroll: 0 }])
  })
})

describe('the annual report and the valuation', () => {
  it('shows the lab on the statement and conserves other income', () => {
    const { g, a, b } = labGame(18, 'restaurant', { country: 'ca' })
    startIdea(g, a, b)
    nextYear(g)
    const s = b.last!
    const row = readLab(b).ledger[0]
    expect(row.year).toBe(s.year)
    expect(row.credit).toBeGreaterThan(0)
    const lines = statementLines(b, s)
    expect(lines.find((l) => l.label === CREDIT_LABEL)?.value).toBe(money(row.credit))
    const rest = s.otherIncome - row.credit
    expect(lines.find((l) => l.label === 'Other income')?.value).toBe(rest > 0 ? money(rest) : undefined)
  })

  it('splits other income and one-off costs into the lab lines and keeps every dollar', () => {
    const { b } = labGame(19, 'restaurant', { country: 'ca' })
    const s = b.last!
    patchLab(b, (d) => {
      d.ledger = [{ year: s.year, credit: 12_000, grant: 3_000, royalty: 5_000, payroll: 7_000 }]
    })
    const lines = statementLines(b, { ...s, otherIncome: 40_000, other: 20_000, strategicIncome: undefined })
    expect(shown(lines, 'Other income') + shown(lines, 'Franchise fees & royalties') + shown(lines, CREDIT_LABEL) + shown(lines, ROYALTY_LABEL)).toBe(40_000)
    expect(shown(lines, CREDIT_LABEL)).toBe(15_000)
    expect(shown(lines, ROYALTY_LABEL)).toBe(5_000)
    expect(shown(lines, 'One-off costs') + shown(lines, TEAM_LABEL)).toBe(20_000)
    expect(shown(lines, TEAM_LABEL)).toBe(7_000)
    // less other income than the lab booked (a restored or damaged row): the lines are clipped, nothing is invented
    const short = statementLines(b, { ...s, otherIncome: 10_000, other: 2_000, strategicIncome: undefined })
    expect(shown(short, 'Other income') + shown(short, CREDIT_LABEL) + shown(short, ROYALTY_LABEL)).toBe(10_000)
    expect(shown(short, 'One-off costs') + shown(short, TEAM_LABEL)).toBe(2_000)
    // a company with no lab shows none of it
    const bare = labGame(19, 'restaurant', { country: 'ca' })
    const plain = statementLines(bare.b, { ...bare.b.last!, otherIncome: 40_000, other: 20_000 })
    expect(plain.map((l) => l.label)).not.toContain(CREDIT_LABEL)
    expect(plain.map((l) => l.label)).not.toContain(TEAM_LABEL)
    expect(shown(plain, 'Other income')).toBe(40_000)
    expect(shown(plain, 'One-off costs')).toBe(20_000)
  })

  it('does not capitalize a credit year in the valuation', () => {
    const { b } = labGame(20, 'restaurant', { country: 'ca' })
    const profit = 2_000_000
    const credit = 400_000
    const years = [b.last!.year - 2, b.last!.year - 1, b.last!.year]
    const history = (p: number) => years.map((year) => ({ year, revenue: 1_000_000, profit: p, tax: 0, units: 1000, price: 10, staff: 5, valuation: 0, outlets: 1 }))
    b.history = history(profit)
    const without = JSON.parse(JSON.stringify(b)) as BizState
    const keep = 1 - clampN(marketOf(b.countryId).corporateTax, 0, 0.9)
    without.history = history(profit - credit * keep)
    patchLab(b, (d) => {
      d.ledger = years.slice(-3).map((year) => ({ year, credit, grant: 0, royalty: 0, payroll: 0 }))
    })
    expect(valuationOf(b)).toBeGreaterThan(0)
    expect(Math.abs(valuationOf(b) - valuationOf(without))).toBeLessThanOrEqual(1)
    // the test is not vacuous: with the credit counted as ordinary profit the company would be worth much more
    const plain = JSON.parse(JSON.stringify(b)) as BizState
    delete plain.lab
    expect(valuationOf(plain) - valuationOf(b)).toBeGreaterThan(100_000)
  })
})
