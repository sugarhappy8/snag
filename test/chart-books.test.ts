// R1-C5: the history and cash builders (src/game/charts/books.ts). A company's thirty booked years become a profit
// line, a cost structure, a cash walk and a cash line; the Annual Report gets four KPI tiles and a strip of every
// company the player owns. Pure reads of settled years: nothing here draws a random number or writes state.
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import type { MarketView } from '../src/game/business/competition'
import { bestPlan } from '../src/game/business/economy'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { readDividend } from '../src/game/business/dividend-policy'
import { bizOf, businessAssets, HISTORY_ROWS, normalizeBiz, readBiz, runsIt, stakeValue, type BizState, type Statement, type YearRecord } from '../src/game/business/state'
import * as barrel from '../src/game/charts'
import { COST_GROUPS, cashLinesSpec, cashWalkSpec, companyKpis, companyStrip, costShareSpec, profitSpec, type StripRow } from '../src/game/charts/books'
import { deltaLabel, moneyLabel } from '../src/game/charts/money'
import { readChartSpec, type ChartSpec, type ChartStep } from '../src/game/charts/spec'
import { moneyDisplay, setMoneyDisplay } from '../src/game/core'
import { PRESENT_YEAR } from '../src/game/history/timeline'
import { migrateSave } from '../src/game/save-schema'
import type { GameState, Json } from '../src/game/types'
import { getCountry } from '../src/game/world'
import { deepFreeze, ownerGame } from './charts-kit'
import { makeTestGame } from './helpers'

// ---------------------------------------------------------------------------
// Fixtures

const CITY = getCountry('us').cities[0]!
const savedDisplay = { ...moneyDisplay() }
beforeEach(() => setMoneyDisplay({ mode: 'usd', nominal: false }))
afterEach(() => setMoneyDisplay({ mode: savedDisplay.mode, nominal: savedDisplay.nominal }))

/** A statement whose lines add up: sales after tax 100,000, costs 80,000, tax 4,000, so a net profit of 16,000. */
function statement(over: Partial<Statement> = {}): Statement {
  const s = {
    year: 2030,
    demand: 1000,
    sold: 900,
    produced: 1000,
    spoiled: 0,
    price: 100,
    revenue: 120_000,
    salesTax: 20_000,
    netRevenue: 100_000,
    cogs: 40_000,
    wages: 25_000,
    keyStaff: 0,
    rent: 10_000,
    marketing: 0,
    interest: 0,
    upkeep: 5_000,
    other: 0,
    otherIncome: 0,
    ownerPay: 0,
    pbt: 0,
    corpTax: 4_000,
    net: 0,
    cashErosion: 0,
    cycle: 0,
    openFraction: 1,
    employees: 5,
    ...over,
  }
  const pbt = over.pbt ?? s.netRevenue - s.cogs - s.wages - s.keyStaff - s.rent - s.marketing - s.interest - s.upkeep - s.other + s.otherIncome - s.ownerPay
  return { ...s, pbt, net: over.net ?? pbt - s.corpTax }
}

/** A year row that matches statement(): the same lines, as whole dollars, with the books-close cash and debt. */
function booked(year: number, over: Partial<YearRecord> = {}): YearRecord {
  return {
    year, revenue: 120_000, profit: 16_000, tax: 4_000, units: 900, price: 100, staff: 6, valuation: 500_000, outlets: 1,
    cash: 200_000, debt: 0, salesTax: 20_000, cogs: 40_000, wages: 25_000, keyStaff: 0, rent: 10_000, marketing: 0,
    interest: 0, upkeep: 5_000, other: 0, otherIncome: 0, ownerPay: 0, draws: 0,
    ...over,
  }
}

/** A row from before R1: the nine old fields and nothing else. */
function old(year: number, over: Partial<YearRecord> = {}): YearRecord {
  return { year, revenue: 100_000, profit: 12_000, tax: 3_000, units: 800, price: 90, staff: 5, valuation: 400_000, outlets: 1, ...over }
}

/** A restaurant whose books end in the last row's year; its statement is that year's, and the game stands in the year after. */
function company(rows: YearRecord[], over: Partial<BizState> = {}, st: Partial<Statement> = {}): { g: GameState; b: BizState } {
  const lastRow = rows[rows.length - 1]
  const year = lastRow ? lastRow.year : 2030
  const g = makeTestGame(1, { countryId: 'us' })
  g.year = year + 1
  const last = lastRow ? statement({ year, net: lastRow.profit, corpTax: lastRow.tax, ...st }) : null
  const b = newBiz(g, 'restaurant', 'us', CITY, { cash: 238_000, debt: 0, founded: 2020, history: rows, last, valuation: 500_000, ...over })
  return { g, b }
}

/** n booked years ending in `end`, each a little better than the one before. */
function years(n: number, end = 2031): YearRecord[] {
  return Array.from({ length: n }, (_, i) => {
    const year = end - n + 1 + i
    return booked(year, { profit: 10_000 + i * 1_000, revenue: 100_000 + i * 2_000, cash: 100_000 + i * 5_000, valuation: 300_000 + i * 10_000 })
  })
}

/**
 * Books that add up, as a real company's do: sales after tax of `netRevenue` plus a sixth for the sales tax, the usual
 * costs, `interest`, `other` and `otherIncome`, a fifth of the profit before tax as corporate tax. So revenue minus profit
 * is exactly the sales tax, the corporate tax and the costs net of other income.
 */
function consistent(year: number, o: { netRevenue: number; interest?: number; other?: number; otherIncome?: number }): YearRecord {
  const { netRevenue, interest = 0, other = 0, otherIncome = 0 } = o
  const salesTax = Math.round(netRevenue / 5)
  const cogs = Math.round(netRevenue * 0.4)
  const wages = Math.round(netRevenue * 0.25)
  const rent = Math.round(netRevenue * 0.1)
  const upkeep = Math.round(netRevenue * 0.05)
  const pbt = netRevenue - cogs - wages - rent - upkeep - interest - other + otherIncome
  const tax = Math.max(0, Math.round(pbt * 0.2))
  return booked(year, { revenue: netRevenue + salesTax, salesTax, cogs, wages, rent, upkeep, interest, other, otherIncome, tax, profit: pbt - tax })
}

const labels = (steps: ChartStep[]) => steps.map((x) => x.label)
const values = (steps: ChartStep[]) => steps.map((x) => x.value)
const deltaSum = (steps: ChartStep[]) => steps.filter((x) => x.kind === 'delta').reduce((t, x) => t + x.value, 0)

function strings(v: unknown, into: string[] = []): string[] {
  if (typeof v === 'string') into.push(v)
  else if (Array.isArray(v)) for (const x of v) strings(x, into)
  else if (v && typeof v === 'object') for (const x of Object.values(v)) strings(x, into)
  return into
}

function numbers(v: unknown, into: number[] = []): number[] {
  if (typeof v === 'number') into.push(v)
  else if (Array.isArray(v)) for (const x of v) numbers(x, into)
  else if (v && typeof v === 'object') for (const x of Object.values(v)) numbers(x, into)
  return into
}

/** A spec the reader accepts unchanged, with finite numbers, every string within the limits and no dash character. */
function expectValid(spec: ChartSpec | null, tag = ''): asserts spec is ChartSpec {
  expect(spec, tag).not.toBeNull()
  expect(readChartSpec(spec), tag).toEqual(spec)
  for (const n of numbers(spec)) expect(Number.isFinite(n), `${tag} ${n}`).toBe(true)
  for (const t of strings(spec)) {
    expect(t.length, `${tag} ${t}`).toBeLessThanOrEqual(120)
    expect(/[\u2013\u2014]/.test(t), `${tag} ${t}`).toBe(false)
  }
}

/** The sum identity of a cash walk: the first total plus every delta is the last total, exactly. */
function expectExact(steps: ChartStep[], tag = ''): void {
  const first = steps[0]!
  const last = steps[steps.length - 1]!
  expect(first.kind, tag).toBe('total')
  expect(last.kind, tag).toBe('total')
  expect(first.value + deltaSum(steps), tag).toBe(last.value)
  for (const x of steps) expect(Number.isInteger(x.value), `${tag} ${x.label}`).toBe(true)
}

/** A hand-built market view: only `booked`, `rank` and `rivals` matter to the tiles. */
function view(over: Partial<MarketView> = {}): MarketView {
  const rival = (i: number) => ({ id: `r${i}`, name: `Rival ${i}`, hq: 'us', founded: 1990, share: 0.05, quality: 50, tech: 50, trend: 0, legacy: false, real: false, tier: 'small' as const })
  return {
    scope: 'national', noun: 'restaurants', place: 'the United States', year: 2030, booked: true, size: 1e9, growth: 0.03,
    share: 0.1, rank: 3, tier: 'startup', unmet: 0, base: 0, dominance: 0, rivals: Array.from({ length: 8 }, (_, i) => rival(i)),
    fringe: 0.3, worldShare: 0.01, home: null,
    antitrust: { regime: 'none', p: 0, label: 'none', acquisitions: 0, regional: [] },
    history: [],
    ...over,
  } as unknown as MarketView
}

// ---------------------------------------------------------------------------
// Real lives, built once

let owner: ReturnType<typeof ownerGame>
let walkers: ReturnType<typeof ownerGame>[] = []
beforeAll(() => {
  owner = ownerGame({ years: 8 })
  const industries = ['restaurant', 'bakery', 'restaurant', 'bakery', 'restaurant', 'bakery', 'restaurant', 'bakery', 'restaurant', 'bakery'] as const
  walkers = industries.map((industry, i) => ownerGame({ seed: i + 1, industry, years: 3 }))
}, 120_000)

describe('the barrel', () => {
  it('re-exports the builders', () => {
    expect(barrel.COST_GROUPS).toBe(COST_GROUPS)
    expect(barrel.profitSpec).toBe(profitSpec)
    expect(barrel.costShareSpec).toBe(costShareSpec)
    expect(barrel.cashWalkSpec).toBe(cashWalkSpec)
    expect(barrel.cashLinesSpec).toBe(cashLinesSpec)
    expect(barrel.companyKpis).toBe(companyKpis)
    expect(barrel.companyStrip).toBe(companyStrip)
  })
})

// ---------------------------------------------------------------------------
// 1 and 2: profitSpec

describe('profitSpec', () => {
  it('draws the net profit of an eight year owner life, valid, with a price basis', () => {
    const b = readBiz(owner.g, owner.a)
    const spec = profitSpec(owner.g, b)
    expectValid(spec)
    expect(spec.kind).toBe('line')
    expect(spec.unit).toBe('money')
    expect(spec.x.length).toBeGreaterThanOrEqual(8)
    expect(spec.series.length).toBe(1)
    expect(spec.series[0]).toMatchObject({ id: 'net', label: 'Net profit', tone: 'c1' })
    expect(spec.series[0]!.values).toEqual(b.history.map((h) => h.profit))
    expect(spec.x).toEqual(b.history.map((h) => h.year))
    expect(spec.basis).toBe(PRESENT_YEAR)
  })

  it('uses the prices of the year lived when the player reads nominal money', () => {
    setMoneyDisplay({ nominal: true })
    const spec = profitSpec(owner.g, readBiz(owner.g, owner.a))
    expectValid(spec)
    expect(spec.basis).toBe(owner.g.year)
  })

  it('says where the profit started, where it ended and when it was best', () => {
    const { g, b } = company([booked(2029, { profit: 10_000 }), booked(2030, { profit: 16_000 }), booked(2031, { profit: 12_000 })])
    const spec = profitSpec(g, b)
    expectValid(spec)
    expect(spec.title).toBe('Net profit by year')
    expect(spec.x).toEqual([2029, 2030, 2031])
    expect(spec.summary).toBe('Net profit from 2029 to 2031: $10K to $12K, best $16K in 2030.')
  })

  it('needs two booked years', () => {
    expect(profitSpec(...pair(company([])))).toBeNull()
    expect(profitSpec(...pair(company([booked(2031)])))).toBeNull()
    expect(profitSpec(...pair(company([booked(2030), booked(2031)])))).not.toBeNull()
  })

  it('keeps a loss as a loss, and the label reads it', () => {
    const { g, b } = company([booked(2030, { profit: -5_000 }), booked(2031, { profit: -2_000 })])
    const spec = profitSpec(g, b)
    expectValid(spec)
    expect(spec.series[0]!.values).toEqual([-5_000, -2_000])
    expect(spec.summary).toBe('Net profit from 2030 to 2031: -$5,000 to -$2,000, best -$2,000 in 2031.')
  })

  it('shows at most thirty years of a 32 year history, the latest thirty', () => {
    const rows = Array.from({ length: 32 }, (_, i) => booked(2000 + i, { profit: 1_000 + i }))
    const { g, b } = company(rows)
    b.history = rows
    const spec = profitSpec(g, b)
    expectValid(spec)
    expect(spec.x.length).toBe(30)
    expect(spec.x[0]).toBe(2002)
    expect(spec.x[29]).toBe(2031)
    expect(spec.series[0]!.values.length).toBe(30)
    expect(HISTORY_ROWS).toBe(30)
    // The same through the reader that a saved company goes through.
    const stored = normalizeBiz(JSON.parse(JSON.stringify({ ...b, history: rows })) as Record<string, Json>, 2032)
    expect(profitSpec(g, stored)!.x.length).toBe(30)
  })

  it('puts the years in order and keeps one row for a year', () => {
    const { g, b } = company([booked(2031, { profit: 3_000 }), booked(2029, { profit: 1_000 }), booked(2030, { profit: 2_000 }), booked(2030, { profit: 2_500 })])
    const spec = profitSpec(g, b)
    expectValid(spec)
    expect(spec.x).toEqual([2029, 2030, 2031])
    expect(spec.series[0]!.values).toEqual([1_000, 2_500, 3_000])
  })

  it('works on the old nine field rows too', () => {
    const { g, b } = company([old(2029), old(2030), old(2031)])
    const spec = profitSpec(g, b)
    expectValid(spec)
    expect(spec.x).toEqual([2029, 2030, 2031])
  })
})

/** (g, b) from a company(): the builders take them as two arguments. */
function pair(x: { g: GameState; b: BizState }): [GameState, BizState] {
  return [x.g, x.b]
}

// ---------------------------------------------------------------------------
// 3: costShareSpec

describe('COST_GROUPS', () => {
  it('has six groups with the plan labels, a tone each and short labels', () => {
    expect(COST_GROUPS.map((c) => c.label)).toEqual(['Materials', 'People', 'Premises and upkeep', 'Marketing', 'Taxes', 'Interest and one-offs, net'])
    expect(COST_GROUPS.map((c) => c.tone)).toEqual(['c1', 'c2', 'c3', 'c4', 'c5', 'c6'])
    expect(new Set(COST_GROUPS.map((c) => c.id)).size).toBe(6)
    for (const c of COST_GROUPS) {
      expect(c.label.length, c.label).toBeLessThanOrEqual(40)
      expect(c.id).toMatch(/^[a-z0-9_-]+$/)
      expect(c.keys.length).toBeGreaterThan(0)
    }
    expect(COST_GROUPS[1]!.keys).toEqual(['wages', 'keyStaff', 'ownerPay'])
    expect(COST_GROUPS[2]!.keys).toEqual(['rent', 'upkeep'])
    expect(COST_GROUPS[4]!.keys).toEqual(['salesTax', 'tax'])
  })
})

describe('costShareSpec', () => {
  it('splits each year of sales into six shares, rounded to four decimals', () => {
    const { g, b } = company([booked(2030), booked(2031)])
    const spec = costShareSpec(g, b)
    expectValid(spec)
    expect(spec.kind).toBe('stack')
    expect(spec.unit).toBe('pct')
    expect(spec.x).toEqual([2030, 2031])
    expect(spec.series.map((s) => s.label)).toEqual(COST_GROUPS.map((c) => c.label))
    expect(spec.series.map((s) => s.tone)).toEqual(COST_GROUPS.map((c) => c.tone))
    // Sales 120,000: materials 40,000, people 25,000, premises 15,000, marketing 0, taxes 20,000 + 4,000, nothing else.
    expect(spec.series.map((s) => s.values[1])).toEqual([0.3333, 0.2083, 0.125, 0, 0.2, 0])
    expect(spec.note).toBeUndefined()
    expect(spec.basis).toBeUndefined()
  })

  it('adds the people costs and the taxes together', () => {
    const { g, b } = company([booked(2030, { wages: 12_000, keyStaff: 6_000, ownerPay: 6_000, salesTax: 10_000, tax: 2_000 }), booked(2031)])
    const spec = costShareSpec(g, b)
    expectValid(spec)
    const at = (id: string) => spec.series.find((s) => s.id === id)!.values[0]
    expect(at('people')).toBe(0.2)
    expect(at('taxes')).toBe(0.1)
  })

  it('shows interest and one-off costs net of other income, never below nothing', () => {
    const { g, b } = company([booked(2030, { interest: 6_000, other: 12_000, otherIncome: 6_000 }), booked(2031, { interest: 1_000, other: 1_000, otherIncome: 50_000 })])
    const spec = costShareSpec(g, b)
    expectValid(spec)
    const net = spec.series[5]!
    expect(net.label).toBe('Interest and one-offs, net')
    expect(net.values).toEqual([0.1, 0])
  })

  it('draws every point between 0 and the stack total, and a profitable year stacks to at most 1 plus its other income', () => {
    const rows = [
      consistent(2026, { netRevenue: 100_000 }),
      consistent(2027, { netRevenue: 120_000, interest: 2_000, other: 3_000, otherIncome: 10_000 }),
      consistent(2028, { netRevenue: 130_000, otherIncome: 6_000 }),
      consistent(2029, { netRevenue: 90_000, interest: 8_000, other: 4_000 }),
      consistent(2030, { netRevenue: 140_000, interest: 1_000, other: 1_000, otherIncome: 50_000 }),
      consistent(2031, { netRevenue: 150_000, other: 20_000, otherIncome: 5_000 }),
    ]
    expect(rows.every((r) => r.profit > 0)).toBe(true)
    const { g, b } = company(rows)
    const spec = costShareSpec(g, b)
    expectValid(spec)
    for (let i = 0; i < spec.x.length; i++) {
      const total = spec.series.reduce((t, s) => t + s.values[i]!, 0)
      for (const s of spec.series) {
        expect(s.values[i]!, `${s.id} ${i}`).toBeGreaterThanOrEqual(0)
        expect(s.values[i]!, `${s.id} ${i}`).toBeLessThanOrEqual(total + 1e-9)
      }
      const r = rows.find((x) => x.year === spec.x[i])!
      // Four decimals on six series can add up to 0.0003 of rounding.
      if (r.profit >= 0) expect(total).toBeLessThanOrEqual(1 + r.otherIncome! / r.revenue + 0.0003)
    }
  })

  it('does the same for a real eight year owner life', () => {
    const b = readBiz(owner.g, owner.a)
    const spec = costShareSpec(owner.g, b)
    expectValid(spec)
    expect(spec.series.length).toBe(6)
    const rows = new Map(b.history.map((h) => [h.year, h]))
    for (let i = 0; i < spec.x.length; i++) {
      const total = spec.series.reduce((t, s) => t + s.values[i]!, 0)
      const r = rows.get(spec.x[i] as number)!
      for (const s of spec.series) expect(s.values[i]!).toBeGreaterThanOrEqual(0)
      if (r.profit > 0) expect(total, `${spec.x[i]}`).toBeLessThanOrEqual(1 + (r.otherIncome ?? 0) / r.revenue + 0.0003)
    }
  })

  it('skips rows without the book fields and says when the cost detail starts', () => {
    const { g, b } = company([old(2027), old(2028), booked(2029), booked(2030), booked(2031)])
    const spec = costShareSpec(g, b)
    expectValid(spec)
    expect(spec.x).toEqual([2029, 2030, 2031])
    expect(spec.note).toBe('Cost detail starts in 2029.')
  })

  it('skips a booked row with no sales, without a note', () => {
    const { g, b } = company([booked(2029, { revenue: 0 }), booked(2030), booked(2031)])
    const spec = costShareSpec(g, b)
    expectValid(spec)
    expect(spec.x).toEqual([2030, 2031])
    expect(spec.note).toBeUndefined()
  })

  it('returns null below two usable rows', () => {
    expect(costShareSpec(...pair(company([])))).toBeNull()
    expect(costShareSpec(...pair(company([booked(2031)])))).toBeNull()
    expect(costShareSpec(...pair(company([old(2030), old(2031)])))).toBeNull()
    expect(costShareSpec(...pair(company([old(2029), old(2030), booked(2031)])))).toBeNull()
    expect(costShareSpec(...pair(company([booked(2030, { revenue: 0 }), booked(2031)])))).toBeNull()
  })

  it('shows at most thirty years', () => {
    const rows = Array.from({ length: 33 }, (_, i) => booked(1999 + i))
    const { g, b } = company(rows)
    b.history = rows
    const spec = costShareSpec(g, b)
    expectValid(spec)
    expect(spec.x.length).toBe(30)
  })
})

// ---------------------------------------------------------------------------
// 4: cashWalkSpec

/** A company with a previous year on the books: cash 200,000 and debt 50,000 at the start, this year's net 16,000. */
function walking(over: Partial<BizState> = {}, st: Partial<Statement> = {}, thisRow: Partial<YearRecord> = {}) {
  return company([booked(2029), booked(2030, { cash: 200_000, debt: 50_000 }), booked(2031, { cash: 215_000, debt: 50_000, ...thisRow })], { cash: 238_000, debt: 50_000, ...over }, st)
}

describe('cashWalkSpec', () => {
  it('walks from the cash at the start of the year to the cash now, with every named row', () => {
    const { g, b } = walking(
      { cash: 238_000, debt: 80_000, dividend: { mode: 'profit', pct: 0.3, keep: 3, last: { year: 2031, paid: 5_000, mine: 5_000, perShare: 0 } } },
      { cashErosion: 1_200 },
    )
    const spec = cashWalkSpec(g, b)
    expectValid(spec)
    expect(spec.kind).toBe('waterfall')
    expect(spec.unit).toBe('money')
    expect(spec.title).toBe('Where the cash went, 2031')
    expect(spec.x).toEqual([])
    expect(spec.series).toEqual([])
    const steps = spec.steps!
    expect(labels(steps)).toEqual(['Cash at the start', 'Net profit', 'Inflation on cash', 'Change in debt', 'Dividends paid', 'Everything else', 'Cash now'])
    expect(steps.map((x) => x.kind)).toEqual(['total', 'delta', 'delta', 'delta', 'delta', 'delta', 'total'])
    // Cash 200,000 + net 16,000 - erosion 1,200 + borrowed 30,000 - dividend 5,000 leaves 239,800; the cash is 238,000.
    expect(values(steps)).toEqual([200_000, 16_000, -1_200, 30_000, -5_000, -1_800, 238_000])
    expectExact(steps)
    expect(spec.note).toBe("Moves the books don't name yet sit in everything else.")
    expect(spec.note!.length).toBeLessThanOrEqual(60)
    expect(spec.summary).toBe('Cash went from $200K at the start of 2031 to $238K now.')
  })

  it('leaves out every row that is nothing', () => {
    // 200,000 + 16,000 = 216,000: no erosion, no change in debt, no dividend, nothing left over.
    const { g, b } = walking({ cash: 216_000, debt: 50_000 })
    const spec = cashWalkSpec(g, b)
    expectValid(spec)
    expect(labels(spec.steps!)).toEqual(['Cash at the start', 'Net profit', 'Cash now'])
    expect(values(spec.steps!)).toEqual([200_000, 16_000, 216_000])
  })

  it('keeps a loss and a fall in debt with their signs', () => {
    const { g, b } = walking({ cash: 150_000, debt: 20_000 }, { net: -60_000 })
    const spec = cashWalkSpec(g, b)
    expectValid(spec)
    const steps = spec.steps!
    expect(steps[1]).toEqual({ label: 'Net profit', value: -60_000, kind: 'delta' })
    expect(steps.find((x) => x.label === 'Change in debt')!.value).toBe(-30_000)
    // 200,000 - 60,000 - 30,000 leaves 110,000; the cash is 150,000.
    expect(steps.find((x) => x.label === 'Everything else')!.value).toBe(40_000)
    expectExact(steps)
    expect(steps[steps.length - 1]!.value).toBe(150_000)
  })

  it('shows a dividend only for the year of the statement', () => {
    const paid = { mode: 'profit' as const, pct: 0.3, keep: 3, last: { year: 2031, paid: 4_000, mine: 4_000, perShare: 0 } }
    const now = walking({ cash: 212_000, dividend: paid })
    expect(labels(cashWalkSpec(...pair(now))!.steps!)).toContain('Dividends paid')
    expect(cashWalkSpec(...pair(now))!.steps!.find((x) => x.label === 'Dividends paid')!.value).toBe(-4_000)
    const older = walking({ cash: 212_000, dividend: { ...paid, last: { ...paid.last, year: 2030 } } })
    expect(labels(cashWalkSpec(...pair(older))!.steps!)).not.toContain('Dividends paid')
    const none = walking({ cash: 212_000, dividend: { mode: 'profit', pct: 0.3, keep: 3 } })
    expect(labels(cashWalkSpec(...pair(none))!.steps!)).not.toContain('Dividends paid')
  })

  it('puts the bonus on the Net profit row as a mark, not as a step of its own', () => {
    const { g, b } = walking({ cash: 216_000 }, {}, { draws: 40_000 })
    const spec = cashWalkSpec(g, b)
    expectValid(spec)
    expect(labels(spec.steps!).some((l) => /bonus|draw/i.test(l))).toBe(false)
    expect(spec.marks).toEqual([{ at: 1, label: 'Includes your $40K bonus' }])
    expect(spec.steps![1]!.label).toBe('Net profit')
    // No draws, or draws of another year, add no mark.
    expect(cashWalkSpec(...pair(walking({ cash: 216_000 }, {}, { draws: 0 })))!.marks).toBeUndefined()
    expect(cashWalkSpec(...pair(walking({ cash: 216_000 })))!.marks).toBeUndefined()
    const other = company([booked(2029, { draws: 9_000 }), booked(2030, { cash: 200_000, debt: 50_000, draws: 9_000 }), booked(2031, { draws: 0 })], { cash: 216_000, debt: 50_000 })
    expect(cashWalkSpec(...pair(other))!.marks).toBeUndefined()
  })

  it('rounds to whole dollars and the sum stays exact', () => {
    const { g, b } = walking({ cash: 238_000.6, debt: 50_000.4 }, { cashErosion: 1_200.5 })
    const spec = cashWalkSpec(g, b)
    expectValid(spec)
    expectExact(spec.steps!)
    expect(spec.steps![spec.steps!.length - 1]!.value).toBe(238_001)
  })

  it('returns null with no statement, no previous year, or a previous year without cash', () => {
    const none = walking()
    none.b.last = null
    expect(cashWalkSpec(none.g, none.b)).toBeNull()
    expect(cashWalkSpec(...pair(company([booked(2031)])))).toBeNull()
    expect(cashWalkSpec(...pair(company([booked(2028), booked(2031)])))).toBeNull()
    expect(cashWalkSpec(...pair(company([old(2030), booked(2031)])))).toBeNull()
    expect(cashWalkSpec(...pair(company([])))).toBeNull()
  })

  it('adds up exactly for ten real companies and ends at the cash the report prints', () => {
    expect(walkers.length).toBe(10)
    let withRows = 0
    for (const [i, w] of walkers.entries()) {
      const b = readBiz(w.g, w.a)
      const spec = cashWalkSpec(w.g, b)
      expectValid(spec, `company ${i}`)
      withRows++
      const steps = spec.steps!
      expectExact(steps, `company ${i}`)
      expect(steps[steps.length - 1]!.value, `company ${i}`).toBe(Math.round(b.cash))
      expect(steps[0]!.value, `company ${i}`).toBe(b.history.find((h) => h.year === b.last!.year - 1)!.cash)
      expect(steps[1]!.value, `company ${i}`).toBe(Math.round(b.last!.net))
      for (const x of steps) expect(x.label.length, x.label).toBeLessThanOrEqual(40)
    }
    expect(withRows).toBe(10)
  })

  it('shows the dividend row for a company that paid a dividend this year', () => {
    const w = ownerGame({ seed: 5, years: 2 })
    const b = bizOf(w.g, w.a)
    w.g.queue = []
    b.dividend = { mode: 'profit', pct: 0.5, keep: 0 }
    const plan = bestPlan(w.g, b)
    b.price = plan.price
    b.production = plan.production
    ageUp(w.g)
    const last = readDividend(b.dividend)?.last
    expect(last?.year, 'the rule paid in the year just booked').toBe(b.last!.year)
    expect(last!.paid).toBeGreaterThan(0)
    const spec = cashWalkSpec(w.g, readBiz(w.g, w.a))
    expectValid(spec)
    expect(spec.steps!.find((x) => x.label === 'Dividends paid')!.value).toBe(-last!.paid)
    expectExact(spec.steps!)
  })

  it('shows the change in debt for a company that borrowed', () => {
    const w = walkers[0]!
    const b = readBiz(w.g, w.a)
    const prev = b.history.find((h) => h.year === b.last!.year - 1)!
    b.debt = (prev.debt ?? 0) + 25_000
    b.cash += 25_000
    const spec = cashWalkSpec(w.g, b)
    expectValid(spec)
    expect(spec.steps!.find((x) => x.label === 'Change in debt')!.value).toBe(25_000)
    expectExact(spec.steps!)
    expect(spec.steps![spec.steps!.length - 1]!.value).toBe(Math.round(b.cash))
  })

  it('returns null rather than a walk with a number that is not a number', () => {
    for (const key of ['cash', 'debt'] as const) {
      for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 1e300]) {
        const x = walking()
        x.b[key] = bad
        expect(cashWalkSpec(x.g, x.b), `${key} ${bad}`).toBeNull()
      }
    }
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 1e300]) {
      const x = walking()
      x.b.last = { ...x.b.last!, net: bad }
      expect(cashWalkSpec(x.g, x.b), `net ${bad}`).toBeNull()
      const y = walking()
      y.b.last = { ...y.b.last!, cashErosion: bad }
      expect(cashWalkSpec(y.g, y.b), `erosion ${bad}`).toBeNull()
    }
  })
})

// ---------------------------------------------------------------------------
// 5: cashLinesSpec

describe('cashLinesSpec', () => {
  it('ends at the live cash and debt when the last row is the statement year', () => {
    const { g, b } = company([booked(2029, { cash: 100_000, debt: 30_000 }), booked(2030, { cash: 150_000, debt: 40_000 }), booked(2031, { cash: 200_000, debt: 50_000 })], { cash: 238_000, debt: 80_000 })
    const spec = cashLinesSpec(g, b)
    expectValid(spec)
    expect(spec.kind).toBe('line')
    expect(spec.unit).toBe('money')
    expect(spec.title).toBe('Cash and debt')
    expect(spec.x).toEqual([2029, 2030, 2031])
    expect(spec.series.map((s) => [s.id, s.label, s.tone])).toEqual([['cash', 'Cash', 'c1'], ['debt', 'Debt', 'c2']])
    expect(spec.series[0]!.values).toEqual([100_000, 150_000, 238_000])
    expect(spec.series[1]!.values).toEqual([30_000, 40_000, 80_000])
    expect(spec.basis).toBe(PRESENT_YEAR)
  })

  it('leaves the last row as it was booked when the statement is of another year', () => {
    const { g, b } = company([booked(2030, { cash: 150_000 }), booked(2031, { cash: 200_000 })], { cash: 238_000 })
    b.last = { ...b.last!, year: 2029 }
    expect(cashLinesSpec(g, b)!.series[0]!.values).toEqual([150_000, 200_000])
  })

  it('omits the debt series when there was never any debt', () => {
    const { g, b } = company([booked(2030, { debt: 0 }), booked(2031, { debt: 0 })], { cash: 238_000, debt: 0 })
    const spec = cashLinesSpec(g, b)
    expectValid(spec)
    expect(spec.series.map((s) => s.id)).toEqual(['cash'])
  })

  it('keeps the debt series when only the live debt is above nothing', () => {
    const { g, b } = company([booked(2030, { debt: 0 }), booked(2031, { debt: 0 })], { cash: 238_000, debt: 9_000 })
    const spec = cashLinesSpec(g, b)
    expectValid(spec)
    expect(spec.series.map((s) => s.id)).toEqual(['cash', 'debt'])
    expect(spec.series[1]!.values).toEqual([0, 9_000])
  })

  it('starts at the first year that has books cash, and needs two of them', () => {
    const { g, b } = company([old(2028), old(2029), booked(2030, { cash: 90_000 }), booked(2031, { cash: 100_000 })])
    const spec = cashLinesSpec(g, b)
    expectValid(spec)
    expect(spec.x).toEqual([2030, 2031])
    expect(cashLinesSpec(...pair(company([old(2030), booked(2031)])))).toBeNull()
    expect(cashLinesSpec(...pair(company([old(2030), old(2031)])))).toBeNull()
    expect(cashLinesSpec(...pair(company([])))).toBeNull()
  })

  it('shows at most thirty years', () => {
    const rows = Array.from({ length: 34 }, (_, i) => booked(1998 + i, { cash: 1_000 * (i + 1) }))
    const { g, b } = company(rows)
    b.history = rows
    const spec = cashLinesSpec(g, b)
    expectValid(spec)
    expect(spec.x.length).toBe(30)
    expect(spec.x[29]).toBe(2031)
  })

  it('draws a real life and ends at its live cash and debt', () => {
    const b = readBiz(owner.g, owner.a)
    const spec = cashLinesSpec(owner.g, b)
    expectValid(spec)
    const cash = spec.series.find((s) => s.id === 'cash')!.values
    expect(cash[cash.length - 1]).toBe(Math.round(b.cash))
    const debt = spec.series.find((s) => s.id === 'debt')
    if (debt) expect(debt.values[debt.values.length - 1]).toBe(Math.round(b.debt))
    else expect(b.history.every((h) => !(h.debt! > 0)) && b.debt <= 0).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 6: companyKpis

describe('companyKpis', () => {
  it('gives four tiles for a company: net profit, sales, cash and value', () => {
    const b = readBiz(owner.g, owner.a)
    const tiles = companyKpis(owner.g, b, null)
    expect(tiles.length).toBe(4)
    tiles.forEach((t, i) => expectValid(t, `tile ${i}`))
    expect(tiles.map((t) => t.kind)).toEqual(['kpi', 'kpi', 'kpi', 'kpi'])
    expect(tiles.map((t) => t.series.length)).toEqual([1, 1, 1, 1])
    expect(tiles.map((t) => t.series[0]!.label)).toEqual(['Net profit', 'Sales', 'Cash', 'Value'])
    expect(tiles.map((t) => t.unit)).toEqual(['money', 'money', 'money', 'money'])
    for (const t of tiles) {
      expect(t.basis).toBe(PRESENT_YEAR)
      expect(t.x.length).toBeLessThanOrEqual(10)
      expect(t.x.length).toBeGreaterThanOrEqual(2)
      expect(t.series[0]!.values.length).toBe(t.x.length)
    }
    // The last point of every tile is what the report prints.
    const last = (t: ChartSpec) => t.series[0]!.values[t.x.length - 1]
    expect(last(tiles[0]!)).toBe(Math.round(b.last!.net))
    expect(last(tiles[1]!)).toBe(Math.round(b.last!.revenue))
    expect(last(tiles[2]!)).toBe(Math.round(b.cash))
    expect(last(tiles[3]!)).toBe(Math.round(b.valuation))
  })

  it('takes the last ten years of the history', () => {
    const { g, b } = company(years(15))
    const tiles = companyKpis(g, b, null)
    for (const t of tiles) {
      expect(t.x).toEqual([2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031])
    }
    expect(tiles[0]!.series[0]!.values).toEqual(Array.from({ length: 10 }, (_, i) => 15_000 + i * 1_000).map((v) => v - 0))
  })

  it('notes the change in net profit against the year before', () => {
    const up = company([booked(2030, { profit: 10_000 }), booked(2031, { profit: 16_000 })])
    const tile = companyKpis(...pair(up), null)[0]!
    expect(tile.note).toBe(deltaLabel(up.g, 6_000))
    expect(tile.note).toBe('up $6,000')
    const down = company([booked(2030, { profit: 16_000 }), booked(2031, { profit: 10_000 })])
    expect(companyKpis(...pair(down), null)[0]!.note).toBe('down $6,000')
    const same = company([booked(2030, { profit: 16_000 }), booked(2031, { profit: 16_000 })])
    expect(companyKpis(...pair(same), null)[0]!.note).toBe('unchanged')
  })

  it('says back in profit or into a loss when the sign flips', () => {
    const back = company([booked(2030, { profit: -5_000 }), booked(2031, { profit: 3_000 })])
    expect(back.b.last!.net).toBe(3_000)
    expect(companyKpis(...pair(back), null)[0]!.note).toBe('back in profit')
    const loss = company([booked(2030, { profit: 5_000 }), booked(2031, { profit: -3_000 })])
    expect(loss.b.last!.net).toBe(-3_000)
    expect(companyKpis(...pair(loss), null)[0]!.note).toBe('into a loss')
    // A loss that stays a loss is a plain change.
    const deeper = company([booked(2030, { profit: -5_000 }), booked(2031, { profit: -8_000 })])
    expect(companyKpis(...pair(deeper), null)[0]!.note).toBe('down $3,000')
  })

  it('notes the change in sales as a percentage', () => {
    const up = company([booked(2030, { revenue: 100_000 }), booked(2031, { revenue: 120_000 })])
    expect(companyKpis(...pair(up), null)[1]!.note).toBe('up 20%')
    const down = company([booked(2030, { revenue: 100_000 }), booked(2031, { revenue: 92_000 })], {}, { revenue: 92_000 })
    expect(companyKpis(...pair(down), null)[1]!.note).toBe('down 8%')
    const small = company([booked(2030, { revenue: 100_000 }), booked(2031, { revenue: 103_400 })], {}, { revenue: 103_400 })
    expect(companyKpis(...pair(small), null)[1]!.note).toBe('up 3.4%')
    const flat = company([booked(2030, { revenue: 100_000 }), booked(2031, { revenue: 100_000 })], {}, { revenue: 100_000 })
    expect(companyKpis(...pair(flat), null)[1]!.note).toBe('unchanged')
    // Nothing to compare with when last year sold nothing.
    const fromNothing = company([booked(2030, { revenue: 0 }), booked(2031, { revenue: 100_000 })], {}, { revenue: 100_000 })
    expect(companyKpis(...pair(fromNothing), null)[1]!.note).toBeUndefined()
  })

  it('ends the cash tile at the live cash and notes the debt', () => {
    const { g, b } = company([booked(2030, { cash: 150_000 }), booked(2031, { cash: 200_000 })], { cash: 238_000, debt: 80_000 })
    const tile = companyKpis(g, b, null)[2]!
    expect(tile.series[0]!.values).toEqual([150_000, 238_000])
    expect(tile.note).toBe(`Debt ${moneyLabel(g, 80_000)}`)
    expect(tile.note).toBe('Debt $80K')
  })

  it('notes the market rank when the market is booked, and the owner stake when it is not', () => {
    const { g, b } = company([booked(2030), booked(2031)], { share: 0.5, valuation: 800_000 })
    const ranked = companyKpis(g, b, view({ booked: true, rank: 3 }))[3]!
    expect(ranked.note).toBe('#3 of 9')
    expect(ranked.series[0]!.values[1]).toBe(800_000)
    const stake = `Your stake ${moneyLabel(g, stakeValue(b))}`
    expect(companyKpis(g, b, null)[3]!.note).toBe(stake)
    expect(stake).toBe('Your stake $400K')
    expect(companyKpis(g, b, view({ booked: false, rank: 2 }))[3]!.note).toBe(stake)
    expect(companyKpis(g, b, view({ booked: true, rank: 0 }))[3]!.note).toBe(stake)
    expect(companyKpis(g, b, view({ booked: true, rank: 1, rivals: [] }))[3]!.note).toBe('#1 of 1')
  })

  it('gives one point tiles to a company in its first year', () => {
    const { g, b } = company([booked(2031, { profit: 16_000 })], { cash: 238_000, debt: 10_000 })
    const tiles = companyKpis(g, b, null)
    expect(tiles.length).toBe(4)
    for (const t of tiles) {
      expectValid(t)
      expect(t.x).toEqual([2031])
      expect(t.series[0]!.values.length).toBe(1)
    }
    expect(tiles[0]!.note).toBeUndefined()
    expect(tiles[1]!.note).toBeUndefined()
    expect(tiles[2]!.note).toBe('Debt $10K')
    expect(tiles[3]!.note).toBe(`Your stake ${moneyLabel(g, stakeValue(b))}`)
  })

  it('takes the net profit and sales of the statement when it is the last row year', () => {
    const { g, b } = company([booked(2030), booked(2031, { profit: 15_000, revenue: 119_000 })], {}, { net: 16_000, revenue: 120_000 })
    // The statement is the books of record: 16,000 and 120,000.
    const tiles = companyKpis(g, b, null)
    expect(tiles[0]!.series[0]!.values[1]).toBe(16_000)
    expect(tiles[1]!.series[0]!.values[1]).toBe(120_000)
  })

  it('still gives the tiles the history holds when there is no statement, and none for no history', () => {
    const { g, b } = company([booked(2030), booked(2031)])
    b.last = null
    const tiles = companyKpis(g, b, null)
    expect(tiles.length).toBe(4)
    expect(tiles[0]!.series[0]!.values).toEqual([16_000, 16_000])
    expect(companyKpis(...pair(company([])), null)).toEqual([])
  })

  it('reads old nine field rows: cash has gaps and the rest is whole', () => {
    const { g, b } = company([old(2029), old(2030), old(2031)], { cash: 50_000 })
    const tiles = companyKpis(g, b, null)
    expect(tiles.length).toBe(4)
    tiles.forEach((t, i) => expectValid(t, `tile ${i}`))
    expect(tiles[2]!.series[0]!.values).toEqual([null, null, 50_000])
  })
})

// ---------------------------------------------------------------------------
// 7: companyStrip

/** A game with companies of the given nets; the first is run by its owner, the rest by hired CEOs. */
function strip(nets: (number | null)[]): { g: GameState; assets: string[] } {
  const { g, a, others } = ownerGame({ years: 0, companies: 3 })
  const all = [a, ...others]
  expect(all.length).toBe(3)
  const ids: string[] = []
  all.forEach((asset, i) => {
    const b = bizOf(g, asset)
    const net = nets[i]
    if (net !== null && net !== undefined) {
      b.history = [booked(2028, { profit: 1_000 }), booked(2029, { profit: 2_000 }), booked(2030, { profit: net - 500 })]
      b.last = statement({ year: 2030, net, pbt: net, corpTax: 0 })
    }
    ids.push(asset.id)
  })
  return { g, assets: ids }
}

describe('companyStrip', () => {
  it('gives one row for each of three companies, best net first, and says which are managed', () => {
    const { g, assets } = strip([5_000, 30_000, 12_000])
    const rows = companyStrip(g)
    expect(rows.length).toBe(3)
    expect(rows.map((r) => r.net)).toEqual([30_000, 12_000, 5_000])
    expect(rows.map((r) => r.id)).toEqual([assets[1], assets[2], assets[0]])
    // The first company is the owner's own; the other two have hired CEOs.
    expect(rows.map((r) => r.managed)).toEqual([true, true, false])
    for (const r of rows) {
      const a = g.assets.find((x) => x.id === r.id)!
      expect(r.name).toBe(a.name)
      expect(r.emoji).toBe(a.emoji)
      expect(r.managed).toBe(!runsIt(g, a))
    }
  })

  it('reads the change against the previous row and the last eight profits', () => {
    const { g } = strip([5_000, 30_000, 12_000])
    const a = businessAssets(g)[1]!
    const b = bizOf(g, a)
    b.history = Array.from({ length: 10 }, (_, i) => booked(2021 + i, { profit: 1_000 * (i + 1) }))
    b.last = statement({ year: 2030, net: 10_000, pbt: 10_000, corpTax: 0 })
    const row = companyStrip(g).find((r) => r.id === a.id)!
    expect(row.net).toBe(10_000)
    // 2030 is booked at 10,000 and 2029 at 9,000.
    expect(row.delta).toBe(1_000)
    expect(row.spark).toEqual([3_000, 4_000, 5_000, 6_000, 7_000, 8_000, 9_000, 10_000])
  })

  it('has no change for a first year, and a spark of one point', () => {
    const { g } = strip([5_000, 30_000, 12_000])
    const a = businessAssets(g)[0]!
    const b = bizOf(g, a)
    b.history = [booked(2030, { profit: 5_000 })]
    b.last = statement({ year: 2030, net: 5_000, pbt: 5_000, corpTax: 0 })
    const row = companyStrip(g).find((r) => r.id === a.id)!
    expect(row.delta).toBeNull()
    expect(row.spark).toEqual([5_000])
  })

  it('skips a company with no statement', () => {
    const { g, assets } = strip([5_000, null, 12_000])
    const rows = companyStrip(g)
    expect(rows.map((r) => r.id)).toEqual([assets[2], assets[0]])
    expect(companyStrip(strip([null, null, null]).g)).toEqual([])
  })

  it('breaks a tie by name', () => {
    const { g } = strip([7_000, 7_000, 7_000])
    const rows = companyStrip(g)
    const names = rows.map((r) => r.name)
    expect(names).toEqual([...names].sort())
  })

  it('keeps 12 of 15 companies, the best twelve', () => {
    const { g } = strip([1_000, 2_000, 3_000])
    const base = g.assets.find((a) => a.kind === 'business')!
    for (let i = 0; i < 12; i++) {
      const b = newBiz(g, 'restaurant', 'us', CITY, { cash: 1_000, history: [booked(2030)], last: statement({ year: 2030, net: 10_000 + i, pbt: 10_000 + i, corpTax: 0 }) })
      g.assets.push(createBusinessAsset(g, `Branch ${String(i).padStart(2, '0')}`, b, 1))
    }
    expect(businessAssets(g).length).toBe(15)
    const rows = companyStrip(g)
    expect(rows.length).toBe(12)
    expect(rows[0]!.net).toBe(10_011)
    expect(rows[11]!.net).toBe(10_000)
    expect(rows.every((r) => r.id !== base.id)).toBe(true)
  })

  it('returns nothing for a life with no company', () => {
    expect(companyStrip(makeTestGame(1, { countryId: 'us' }))).toEqual([])
  })

  it('matches the first row of a single real company with its tiles', () => {
    const rows = companyStrip(owner.g)
    expect(rows.length).toBe(1)
    const b = readBiz(owner.g, owner.a)
    expect(rows[0]!.net).toBe(Math.round(b.last!.net))
    expect(rows[0]!.managed).toBe(false)
    expect(rows[0]!.spark.length).toBeLessThanOrEqual(8)
    expect(rows[0]!.spark[rows[0]!.spark.length - 1]).toBe(Math.round(b.last!.net))
  })
})

// ---------------------------------------------------------------------------
// 8: valid, pure, hostile

describe('every spec is valid', () => {
  it('for the real lives: finite, bounded, under 120 characters a string, and no dash character', () => {
    const lives = [owner, ...walkers.slice(0, 3)]
    for (const [i, w] of lives.entries()) {
      const b = readBiz(w.g, w.a)
      for (const spec of [profitSpec(w.g, b), costShareSpec(w.g, b), cashWalkSpec(w.g, b), cashLinesSpec(w.g, b), ...companyKpis(w.g, b, null)]) {
        if (spec) expectValid(spec, `life ${i}`)
      }
      expect(profitSpec(w.g, b), `life ${i}`).not.toBeNull()
      expect(cashWalkSpec(w.g, b), `life ${i}`).not.toBeNull()
    }
  })

  it('names no row and no tile in more than 40 characters', () => {
    const b = readBiz(owner.g, owner.a)
    for (const spec of [profitSpec(owner.g, b)!, costShareSpec(owner.g, b)!, cashWalkSpec(owner.g, b)!, cashLinesSpec(owner.g, b)!, ...companyKpis(owner.g, b, null)]) {
      for (const s of spec.series) expect(s.label.length, s.label).toBeLessThanOrEqual(40)
      for (const s of spec.steps ?? []) expect(s.label.length, s.label).toBeLessThanOrEqual(40)
      expect(spec.title.length).toBeLessThanOrEqual(60)
      expect((spec.note ?? '').length).toBeLessThanOrEqual(60)
    }
  })
})

describe('purity', () => {
  it('reads a deep-frozen life and gives the same answer as the live one, twice over', () => {
    const frozen = deepFreeze(structuredClone(owner.g))
    const rng = frozen.rng
    const before = JSON.stringify(frozen)
    const a = frozen.assets.find((x) => x.id === owner.a.id)!
    const fb = deepFreeze(readBiz(frozen, a))
    const live = readBiz(owner.g, owner.a)
    const view9 = view()
    const same = (f: (g: GameState, b: BizState) => unknown) => expect(f(frozen, fb)).toEqual(f(owner.g, live))
    same(profitSpec)
    same(costShareSpec)
    same(cashWalkSpec)
    same(cashLinesSpec)
    same((g, b) => companyKpis(g, b, null))
    same((g, b) => companyKpis(g, b, view9))
    expect(companyStrip(frozen)).toEqual(companyStrip(owner.g))
    // Fresh objects each call.
    const one = profitSpec(frozen, fb)
    const two = profitSpec(frozen, fb)
    expect(one).toEqual(two)
    expect(one).not.toBe(two)
    expect(one!.series[0]!.values).not.toBe(two!.series[0]!.values)
    expect(frozen.rng).toBe(rng)
    expect(JSON.stringify(frozen)).toBe(before)
  })

  it('draws no random number and edits nothing it reads', () => {
    const { g, b } = walking({ cash: 238_000, debt: 80_000 }, { cashErosion: 1_200 }, { draws: 40_000 })
    const rng = g.rng
    const stored = JSON.stringify(b)
    const world = JSON.stringify(g)
    profitSpec(g, b)
    costShareSpec(g, b)
    cashWalkSpec(g, b)
    cashLinesSpec(g, b)
    companyKpis(g, b, view())
    companyStrip(g)
    expect(g.rng).toBe(rng)
    expect(JSON.stringify(b)).toBe(stored)
    expect(JSON.stringify(g)).toBe(world)
  })

  it('does not freeze or share the history it was given', () => {
    const { g, b } = company(years(5))
    const spec = profitSpec(g, b)!
    spec.series[0]!.values[0] = 12345
    expect(b.history[0]!.profit).toBe(10_000)
    expect(profitSpec(g, b)!.series[0]!.values[0]).toBe(10_000)
  })
})

describe('hostile books', () => {
  const NUMS = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1e300, -1e300]

  function check(g: GameState, b: BizState, tag: string): void {
    const view9 = view()
    expect(() => {
      for (const spec of [profitSpec(g, b), costShareSpec(g, b), cashWalkSpec(g, b), cashLinesSpec(g, b), ...companyKpis(g, b, view9), ...companyKpis(g, b, null)]) {
        if (spec) expectValid(spec, tag)
      }
      companyStrip(g)
    }, tag).not.toThrow()
  }

  it('survives a number that is not a number in any field of a row, set straight on the state', () => {
    const fields = ['year', 'revenue', 'profit', 'tax', 'cash', 'debt', 'cogs', 'wages', 'rent', 'upkeep', 'salesTax', 'other', 'otherIncome', 'interest', 'draws', 'valuation'] as const
    for (const key of fields) {
      for (const bad of NUMS) {
        const rows = [booked(2029), booked(2030), booked(2031)]
        const { g, b } = company(rows, {}, { cashErosion: 100 })
        b.history = rows.map((r, i) => (i === 1 || i === 2 ? { ...r, [key]: bad } : r))
        check(g, b, `${key} ${bad}`)
      }
    }
  })

  it('survives a history of junk, a missing history, and live numbers that are not numbers', () => {
    const { g, b } = company([booked(2030), booked(2031)])
    b.history = [null, 7, 'x', {}, { year: 'a' }, { year: 2030, profit: 'b', cash: {} }, [], booked(2031)] as unknown as YearRecord[]
    check(g, b, 'junk')
    b.history = undefined as unknown as YearRecord[]
    check(g, b, 'no history')
    for (const key of ['cash', 'debt', 'valuation', 'share'] as const) {
      for (const bad of NUMS) {
        const x = company([booked(2030), booked(2031)])
        x.b[key] = bad
        check(x.g, x.b, `${key} ${bad}`)
      }
    }
    for (const key of ['net', 'revenue', 'cashErosion'] as const) {
      for (const bad of NUMS) {
        const x = company([booked(2030), booked(2031)])
        x.b.last = { ...x.b.last!, [key]: bad }
        check(x.g, x.b, `last ${key} ${bad}`)
      }
    }
  })

  it('survives rows that went through the save reader with numbers that are not numbers', () => {
    const { g, b } = company([booked(2030), booked(2031)])
    const stored = JSON.parse(JSON.stringify(b)) as Record<string, Json>
    const hostile = {
      ...stored,
      history: [
        { year: Number.NaN, profit: 5 },
        { year: 2029, revenue: Number.NaN, profit: Number.POSITIVE_INFINITY, cash: Number.NaN, cogs: Number.NaN, debt: 1e300 },
        { year: 2030, profit: 'a', cash: 1e300, revenue: -5 },
        { year: 2031, revenue: 1e-9, cogs: 5e14, profit: -1e14, cash: -1e14 },
      ],
      last: null,
    }
    const read = normalizeBiz(hostile as unknown as Record<string, Json>, 2032)
    check(g, read, 'normalized')
  })

  it('keeps a cost share within a sane size even when the sales are tiny', () => {
    const { g, b } = company([booked(2030, { revenue: 1e-9, cogs: 5e14 }), booked(2031, { revenue: 1e-9, cogs: 5e14 })])
    const spec = costShareSpec(g, b)
    if (spec) expectValid(spec)
  })
})

// ---------------------------------------------------------------------------
// Old saves

describe('the v4.0.2 fixture', () => {
  it('gives every company a valid spec or none, and never throws', () => {
    const raw = JSON.parse(gunzipSync(readFileSync('test/fixtures/save-v1.json.gz')).toString()) as Record<string, unknown>
    const result = migrateSave(structuredClone(raw))
    expect(result.kind).toBe('ready')
    if (result.kind !== 'ready') return
    const game = result.game
    let seen = 0
    for (const a of businessAssets(game)) {
      const b = readBiz(game, a)
      seen++
      const profit = profitSpec(game, b)
      if (profit) expectValid(profit)
      expect(profit === null || profit.x.length >= 2).toBe(true)
      // Rows from v4.0.2 carry no books: no cost shares, no cash walk, no cash line.
      const shares = costShareSpec(game, b)
      if (shares) {
        expectValid(shares)
        expect(shares.note).toMatch(/^Cost detail starts in \d{4}\.$/)
      }
      for (const spec of [cashWalkSpec(game, b), cashLinesSpec(game, b), ...companyKpis(game, b, null)]) if (spec) expectValid(spec)
      if (b.history.length > 0) expect(companyKpis(game, b, null).length).toBeGreaterThan(0)
      if (b.history.every((h) => h.cash === undefined)) {
        expect(cashLinesSpec(game, b)).toBeNull()
        expect(cashWalkSpec(game, b)).toBeNull()
        expect(costShareSpec(game, b)).toBeNull()
      }
    }
    const rows: StripRow[] = companyStrip(game)
    expect(rows.length).toBeLessThanOrEqual(12)
    for (const r of rows) {
      expect(Number.isFinite(r.net)).toBe(true)
      expect(r.delta === null || Number.isFinite(r.delta)).toBe(true)
    }
    expect(seen).toBeGreaterThan(0)
  })
})
