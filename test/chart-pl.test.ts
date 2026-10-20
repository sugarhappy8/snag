// R1-C4: the Profit and Loss builders (src/game/charts/pl.ts). One statement becomes a waterfall that starts at the
// sales after tax and ends at the net profit, with every dollar in between on a named row. The sum is exact: the
// rows are whole dollars and the only residual is a labelled Rounding row. Proves D.11 criterion 1.
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { beforeAll, describe, expect, it } from 'vitest'
import { newBiz } from '../src/game/business/founding'
import { LAB_STATEMENT } from '../src/game/business/lab-text'
import { economicReportOf, recordEconomicReport } from '../src/game/business/economic-report'
import { businessAssets, findBusiness, readBiz, type BizState, type Statement, type YearRecord } from '../src/game/business/state'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import * as barrel from '../src/game/charts'
import { PL_LABELS, bridgeSpec, plSpec, plSteps, plSummarySpec, profitVerdict } from '../src/game/charts/pl'
import { CHART_LIMITS, readChartSpec, type ChartSpec, type ChartStep } from '../src/game/charts/spec'
import { migrateSave } from '../src/game/save-schema'
import type { GameState } from '../src/game/types'
import { getCountry } from '../src/game/world'
import { deepFreeze, statementSamples, type StatementSample } from './charts-kit'
import { makeTestGame } from './helpers'

// ---------------------------------------------------------------------------
// Fixtures

/** A statement whose lines add up, with any line (or the pbt and net themselves) overridden. */
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
    corpTax: 0,
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

function row(year: number, draws?: number): YearRecord {
  return { year, revenue: 1, profit: 1, tax: 0, units: 1, price: 1, staff: 1, valuation: 1, outlets: 1, ...(draws === undefined ? {} : { draws }) }
}

/** A restaurant of 2031 whose last statement is `over`, with the optional state the P&L reads. */
function built(over: Partial<Statement> = {}, extra: Partial<BizState> = {}): { g: GameState; b: BizState; s: Statement } {
  const g = makeTestGame(1, { countryId: 'us' })
  g.year = 2031
  const s = statement(over)
  const b = newBiz(g, 'restaurant', 'us', getCountry('us').cities[0]!, { cash: 1_000_000, founded: 2025, last: s, ...extra })
  return { g, b, s }
}

/** Every line present: 18 steps. Franchise 30,000, lab credit and grant 12,000, royalty 8,000, research crew 20,000. */
const FULL: Partial<Statement> = {
  netRevenue: 1_000_000,
  cogs: 300_000,
  wages: 200_000,
  keyStaff: 50_000,
  rent: 80_000,
  marketing: 40_000,
  interest: 10_000,
  upkeep: 60_000,
  other: 70_000,
  otherIncome: 90_000,
  ownerPay: 100_000,
  corpTax: 50_000,
}
const FULL_EXTRA: Partial<BizState> = {
  franchise: { units: 3, ledger: [{ year: 2030, fees: 18_000, royalty: 12_000 }] },
  lab: { v: 1, ledger: [{ year: 2030, credit: 7_000, grant: 5_000, royalty: 8_000, payroll: 20_000 }] },
}

type RowKey = 'sales' | 'cogs' | 'wages' | 'keyStaff' | 'rent' | 'marketing' | 'interest' | 'upkeep' | 'oneOff' | 'research' | 'otherIncome' | 'franchise' | 'credit' | 'royalty' | 'ownerPay' | 'rounding' | 'adjustments' | 'pbt' | 'tax' | 'net' | 'rest'
const L = PL_LABELS as Readonly<Record<RowKey, string>>
const labels = (steps: ChartStep[]) => steps.map((x) => x.label)
const values = (steps: ChartStep[]) => steps.map((x) => x.value)
const deltaSum = (steps: ChartStep[]) => steps.filter((x) => x.kind === 'delta').reduce((t, x) => t + x.value, 0)
const isRounding = (x: ChartStep) => x.kind === 'delta' && (x.label === L.rounding || x.label === L.adjustments)
const strings = (v: unknown, into: string[] = []): string[] => {
  if (typeof v === 'string') into.push(v)
  else if (Array.isArray(v)) for (const x of v) strings(x, into)
  else if (v && typeof v === 'object') for (const x of Object.values(v)) strings(x, into)
  return into
}

/** The sum identity of a P&L: first total plus every delta is the last total, exactly, and the totals in between agree. */
function expectExact(steps: ChartStep[], net: number, tag = ''): void {
  const first = steps[0]!
  const last = steps[steps.length - 1]!
  expect(first.kind, tag).toBe('total')
  expect(last.kind, tag).toBe('total')
  expect(first.value + deltaSum(steps), tag).toBe(last.value)
  expect(last.value, tag).toBe(Math.round(net))
  let run = first.value
  for (const x of steps.slice(1)) {
    if (x.kind === 'delta') run += x.value
    else expect(x.value, `${tag} ${x.label}`).toBe(run)
  }
  for (const x of steps) expect(Number.isInteger(x.value), `${tag} ${x.label}`).toBe(true)
}

// ---------------------------------------------------------------------------
// The 168 statements: 3 seeds x 56 industries

let samples: StatementSample[] = []
beforeAll(() => {
  samples = statementSamples([11, 12, 13])
}, 80_000)

describe('PL_LABELS', () => {
  it('names every row in at most 40 characters, with no dash character', () => {
    const all = Object.values(PL_LABELS)
    expect(all.length).toBeGreaterThanOrEqual(18)
    for (const t of all) {
      expect(t.length, t).toBeGreaterThan(0)
      expect(t.length, t).toBeLessThanOrEqual(40)
      expect(/[\u2013\u2014]/.test(t), t).toBe(false)
    }
    expect(all).toContain(LAB_STATEMENT.credit)
    expect(all).toContain(LAB_STATEMENT.royalty)
    expect(all).toContain(LAB_STATEMENT.payroll)
    expect(all).toContain('Franchise fees and royalties')
  })

  it('is re-exported from the charts barrel with the builders', () => {
    expect(barrel.PL_LABELS).toBe(PL_LABELS)
    expect(barrel.plSteps).toBe(plSteps)
    expect(barrel.plSpec).toBe(plSpec)
    expect(barrel.plSummarySpec).toBe(plSummarySpec)
    expect(barrel.bridgeSpec).toBe(bridgeSpec)
    expect(barrel.profitVerdict).toBe(profitVerdict)
  })
})

describe('D.11.1: the waterfall sums to the net profit for 168 statements', () => {
  it('gives 168 statements, each summing exactly to its net, with known labels and small rounding', () => {
    expect(samples.length).toBe(168)
    const known = new Set<string>([...Object.values(PL_LABELS), ...Object.values(LAB_STATEMENT), 'Franchise fees and royalties'])
    let roundingRows = 0
    let big = 0
    const used = new Set<string>()
    for (const x of samples) {
      const b = readBiz(x.g, x.a)
      const steps = plSteps(b, x.s)
      const tag = `${x.seed}:${x.industry}`
      expect(steps.length, tag).toBeGreaterThanOrEqual(3)
      expect(steps.length, tag).toBeLessThanOrEqual(20)
      expectExact(steps, x.s.net, tag)
      expect(steps[0]!.label, tag).toBe(L.sales)
      expect(steps[0]!.value, tag).toBe(Math.round(x.s.netRevenue))
      for (const st of steps) {
        expect(known.has(st.label), `${tag} ${st.label}`).toBe(true)
        used.add(st.label)
        if (isRounding(st)) {
          roundingRows++
          if (Math.abs(st.value) >= 5) big++
        }
      }
    }
    expect(big, `${big} of ${roundingRows} rounding rows are $5 or more`).toBeLessThanOrEqual(1)
    // The 168 companies really do exercise the main rows.
    for (const l of [L.sales, L.cogs, L.wages, L.rent, L.upkeep, L.pbt, L.net]) expect(used.has(l), l).toBe(true)
  })

  it('plSpec carries the same steps and is a waterfall titled with the statement year', () => {
    for (const x of samples) {
      const b = readBiz(x.g, x.a)
      const spec = plSpec(x.g, b)
      expect(spec, x.industry).not.toBeNull()
      expect(spec!.kind).toBe('waterfall')
      expect(spec!.unit).toBe('money')
      expect(spec!.title).toBe(`Where the sales went, ${x.s.year}`)
      expect(spec!.x).toEqual([])
      expect(spec!.series).toEqual([])
      expect(spec!.basis).toBeUndefined()
      expect(spec!.steps).toEqual(plSteps(b, x.s))
    }
  })
})

describe('row order and omissions on hand-built statements', () => {
  it('a plain company shows only the lines it has', () => {
    const { b, s } = built({ corpTax: 4_000 })
    const steps = plSteps(b, s)
    expect(labels(steps)).toEqual([L.sales, L.cogs, L.wages, L.rent, L.upkeep, L.pbt, L.tax, L.net])
    expect(values(steps)).toEqual([100_000, -40_000, -25_000, -10_000, -5_000, 20_000, -4_000, 16_000])
    expect(steps.map((x) => x.kind)).toEqual(['total', 'delta', 'delta', 'delta', 'delta', 'total', 'delta', 'total'])
    // No key staff, no marketing, no interest, no owner pay, no one-off costs: none of them is a row.
    for (const l of [L.keyStaff, L.marketing, L.interest, L.ownerPay, L.oneOff, L.research, L.otherIncome, L.franchise, L.credit, L.royalty]) {
      expect(labels(steps)).not.toContain(l)
    }
  })

  it('leaves out the tax row when there is no tax, and the sum still holds', () => {
    const { b, s } = built({ cogs: 120_000 })
    const steps = plSteps(b, s)
    expect(labels(steps)).toEqual([L.sales, L.cogs, L.wages, L.rent, L.upkeep, L.pbt, L.net])
    expect(steps[steps.length - 1]!.value).toBe(-60_000)
    expectExact(steps, s.net)
  })

  it('names the labels from the plan, in the order of the 12 lines of the economic report', () => {
    expect(L.sales).toBe('Sales after tax')
    expect(L.cogs).toBe('Materials and direct costs')
    expect(L.wages).toBe('Wages')
    expect(L.keyStaff).toBe('Key staff and managers')
    expect(L.rent).toBe('Premises')
    expect(L.marketing).toBe('Marketing')
    expect(L.interest).toBe('Debt interest')
    expect(L.upkeep).toBe('Upkeep and investments')
    expect(L.oneOff).toBe('One-off costs')
    expect(L.research).toBe('Research team')
    expect(L.otherIncome).toBe('Other income')
    expect(L.franchise).toBe('Franchise fees and royalties')
    expect(L.credit).toBe('R&D tax credit and grants')
    expect(L.royalty).toBe('Patent licences')
    expect(L.ownerPay).toBe('Your salary')
    expect(L.pbt).toBe('Profit before tax')
    expect(L.tax).toBe('Corporate tax')
    expect(L.net).toBe('Net profit')
  })

  it('with key staff, marketing and interest the rows come in statement order', () => {
    const { b, s } = built({ keyStaff: 7_000, marketing: 3_000, interest: 2_000, corpTax: 1_000 })
    const steps = plSteps(b, s)
    expect(labels(steps)).toEqual([L.sales, L.cogs, L.wages, L.keyStaff, L.rent, L.marketing, L.interest, L.upkeep, L.pbt, L.tax, L.net])
    expect(values(steps).slice(0, 8)).toEqual([100_000, -40_000, -25_000, -7_000, -10_000, -3_000, -2_000, -5_000])
    expectExact(steps, s.net)
  })

  it('with franchise income, the fees and royalties leave Other income', () => {
    const extra: Partial<BizState> = { franchise: { units: 2, ledger: [{ year: 2030, fees: 30_000, royalty: 20_000 }] } }
    const { b, s } = built({ otherIncome: 90_000, corpTax: 5_000 }, extra)
    const steps = plSteps(b, s)
    expect(labels(steps)).toEqual([L.sales, L.cogs, L.wages, L.rent, L.upkeep, L.otherIncome, L.franchise, L.pbt, L.tax, L.net])
    expect(steps[5]!.value).toBe(40_000)
    expect(steps[6]!.value).toBe(50_000)
    expectExact(steps, s.net)
  })

  it('caps franchise money at the other income the statement shows, and drops an empty Other income row', () => {
    const extra: Partial<BizState> = { franchise: { units: 2, ledger: [{ year: 2030, fees: 90_000, royalty: 10_000 }] } }
    const { b, s } = built({ otherIncome: 40_000 }, extra)
    const steps = plSteps(b, s)
    expect(labels(steps)).toEqual([L.sales, L.cogs, L.wages, L.rent, L.upkeep, L.franchise, L.pbt, L.net])
    expect(steps[5]!.value).toBe(40_000)
    expectExact(steps, s.net)
  })

  it('with a lab credit, grant and royalty, they leave Other income with the labels the lab uses', () => {
    const extra: Partial<BizState> = { lab: { v: 1, ledger: [{ year: 2030, credit: 3_000, grant: 2_000, royalty: 4_000, payroll: 0 }] } }
    const { b, s } = built({ otherIncome: 15_000 }, extra)
    const steps = plSteps(b, s)
    expect(labels(steps)).toEqual([L.sales, L.cogs, L.wages, L.rent, L.upkeep, L.otherIncome, L.credit, L.royalty, L.pbt, L.net])
    expect(values(steps).slice(5, 8)).toEqual([6_000, 5_000, 4_000])
    expect(L.credit).toBe(LAB_STATEMENT.credit)
    expect(L.royalty).toBe(LAB_STATEMENT.royalty)
    expectExact(steps, s.net)
  })

  it('with a research crew, its pay leaves the one-off costs and gets its own row', () => {
    const extra: Partial<BizState> = { lab: { v: 1, ledger: [{ year: 2030, credit: 0, grant: 0, royalty: 0, payroll: 12_000 }] } }
    const { b, s } = built({ other: 20_000 }, extra)
    const steps = plSteps(b, s)
    expect(labels(steps)).toEqual([L.sales, L.cogs, L.wages, L.rent, L.upkeep, L.oneOff, L.research, L.pbt, L.net])
    expect(values(steps).slice(5, 7)).toEqual([-8_000, -12_000])
    expect(L.research).toBe(LAB_STATEMENT.payroll)
    expectExact(steps, s.net)
  })

  it('never takes more crew pay than the one-off costs hold, and a crew with no other cost has no One-off row', () => {
    const extra: Partial<BizState> = { lab: { v: 1, ledger: [{ year: 2030, credit: 0, grant: 0, royalty: 0, payroll: 50_000 }] } }
    const { b, s } = built({ other: 20_000 }, extra)
    const steps = plSteps(b, s)
    expect(labels(steps)).toEqual([L.sales, L.cogs, L.wages, L.rent, L.upkeep, L.research, L.pbt, L.net])
    expect(steps[5]!.value).toBe(-20_000)
    expectExact(steps, s.net)
    // Negative one-off costs (a refund) are income, and the crew gets nothing out of them.
    const refund = built({ other: -5_000 }, extra)
    const st = plSteps(refund.b, refund.s)
    expect(labels(st)).toContain(L.oneOff)
    expect(st.find((x) => x.label === L.oneOff)!.value).toBe(5_000)
    expect(labels(st)).not.toContain(L.research)
    expectExact(st, refund.s.net)
  })

  it('with an owner salary, it is the last cost row before the profit', () => {
    const { b, s } = built({ ownerPay: 30_000 })
    const steps = plSteps(b, s)
    expect(labels(steps)).toEqual([L.sales, L.cogs, L.wages, L.rent, L.upkeep, L.ownerPay, L.pbt, L.net])
    expect(steps[5]!.value).toBe(-30_000)
    expectExact(steps, s.net)
  })

  it('shows every row in its place when a company has them all: 18 steps', () => {
    const { b, s } = built(FULL, FULL_EXTRA)
    const steps = plSteps(b, s)
    expect(labels(steps)).toEqual([
      L.sales, L.cogs, L.wages, L.keyStaff, L.rent, L.marketing, L.interest, L.upkeep, L.oneOff, L.research, L.otherIncome, L.franchise, L.credit, L.royalty, L.ownerPay, L.pbt, L.tax, L.net,
    ])
    expect(values(steps)).toEqual([
      1_000_000, -300_000, -200_000, -50_000, -80_000, -40_000, -10_000, -60_000, -50_000, -20_000, 40_000, 30_000, 12_000, 8_000, -100_000, 180_000, -50_000, 130_000,
    ])
    expectExact(steps, s.net)
    const spec = plSpec(built(FULL, FULL_EXTRA).g, b)!
    expect(spec.steps!.length).toBe(18)
    expect(spec.steps!.length).toBeLessThanOrEqual(CHART_LIMITS.steps)
  })

  it('the cost steps are shares of the first total: abs(value) / first total', () => {
    const { b, s } = built(FULL, FULL_EXTRA)
    const steps = plSteps(b, s)
    const first = steps[0]!.value
    const cogs = steps.find((x) => x.label === L.cogs)!
    expect(Math.abs(cogs.value) / first).toBeCloseTo(0.3, 10)
  })
})

describe('rounding', () => {
  it('a small gap before the profit is a Rounding row, and the sum is still exact', () => {
    const base = statement().pbt
    const { b, s } = built({ pbt: base + 3, corpTax: 4_000, net: base + 3 - 4_000 })
    const steps = plSteps(b, s)
    expect(labels(steps)).toEqual([L.sales, L.cogs, L.wages, L.rent, L.upkeep, L.rounding, L.pbt, L.tax, L.net])
    expect(steps[5]!.value).toBe(3)
    expectExact(steps, s.net)
  })

  it('calls a gap above the limit Other adjustments, where the limit is the larger of $5 and 0.001% of the sales', () => {
    const base = statement().pbt
    // Exactly the limit is still rounding; one dollar above is not (sales of 100,000 give a limit of $5).
    const at = plSteps(...pair(built({ pbt: base + 5 })))
    expect(labels(at)).toContain(L.rounding)
    const over = plSteps(...pair(built({ pbt: base + 6 })))
    expect(labels(over)).toContain(L.adjustments)
    expect(labels(over)).not.toContain(L.rounding)
    expectExact(over, base + 6)
    // A statement of a hundred million: the limit is 1,000, so 400 is rounding and 1,500 is not.
    const big = { netRevenue: 100_000_000, cogs: 40_000_000, wages: 25_000_000, rent: 10_000_000, upkeep: 5_000_000 }
    const pbt = statement(big).pbt
    expect(labels(plSteps(...pair(built({ ...big, pbt: pbt - 400 }))))).toContain(L.rounding)
    expect(labels(plSteps(...pair(built({ ...big, pbt: pbt + 1_500 }))))).toContain(L.adjustments)
  })

  it('a gap between the profit and the net is a second Rounding row, with or without tax', () => {
    const base = statement().pbt
    const taxed = built({ corpTax: 4_000, net: base - 4_000 + 2 })
    const a = plSteps(taxed.b, taxed.s)
    expect(labels(a)).toEqual([L.sales, L.cogs, L.wages, L.rent, L.upkeep, L.pbt, L.tax, L.rounding, L.net])
    expect(a[7]!.value).toBe(2)
    expectExact(a, taxed.s.net)
    const free = built({ net: base - 3 })
    const c = plSteps(free.b, free.s)
    expect(labels(c)).toEqual([L.sales, L.cogs, L.wages, L.rent, L.upkeep, L.pbt, L.rounding, L.net])
    expect(c[6]!.value).toBe(-3)
    expectExact(c, free.s.net)
  })

  it('rounds each line first and takes the gap from the rounded values, so fractions never break the sum', () => {
    const { b, s } = built({ netRevenue: 100_000.4, cogs: 40_000.4, wages: 25_000.6, rent: 10_000.5, upkeep: 5_000.2, corpTax: 3_999.6 })
    const steps = plSteps(b, s)
    expectExact(steps, s.net)
    expect(steps[0]!.value).toBe(100_000)
    for (const x of steps) expect(Object.is(x.value, -0), x.label).toBe(false)
    const gap = steps.filter(isRounding)
    for (const x of gap) expect(Math.abs(x.value)).toBeLessThan(5)
  })
})

describe('the bonus mark', () => {
  it('points at the One-off costs row when the year had owner draws', () => {
    const { g, b } = built({ other: 250_000, cogs: 40_000 }, { history: [row(2029), row(2030, 250_000)] })
    const spec = plSpec(g, b)!
    const at = spec.steps!.findIndex((x) => x.label === L.oneOff)
    expect(at).toBeGreaterThan(0)
    expect(spec.marks).toEqual([{ at, label: 'Includes your $250K bonus' }])
  })

  it('points at the Research team row when the whole one-off cost is the crew', () => {
    const extra: Partial<BizState> = {
      lab: { v: 1, ledger: [{ year: 2030, credit: 0, grant: 0, royalty: 0, payroll: 90_000 }] },
      history: [row(2030, 40_000)],
    }
    const { g, b } = built({ other: 60_000 }, extra)
    const spec = plSpec(g, b)!
    const at = spec.steps!.findIndex((x) => x.label === L.research)
    expect(at).toBeGreaterThan(0)
    expect(spec.steps!.some((x) => x.label === L.oneOff)).toBe(false)
    expect(spec.marks).toEqual([{ at, label: 'Includes your $40K bonus' }])
  })

  it('adds nothing for no draws, the wrong year, or a cash erosion', () => {
    const none = built({ other: 50_000 }, { history: [row(2030, 0)] })
    expect(plSpec(none.g, none.b)!.marks).toBeUndefined()
    const other = built({ other: 50_000 }, { history: [row(2029, 99_000)] })
    expect(plSpec(other.g, other.b)!.marks).toBeUndefined()
    const old = built({ other: 50_000 }, { history: [row(2030)] })
    expect(plSpec(old.g, old.b)!.marks).toBeUndefined()
    const erosion = built({ cashErosion: 12_000 }, { history: [row(2030, 0)] })
    expect(plSpec(erosion.g, erosion.b)!.marks).toBeUndefined()
  })

  it('keeps the label within 40 characters, and the mark within the spec limits', () => {
    const { g, b } = built({ other: 900_000_000_000 }, { history: [row(2030, 900_000_000_000)] })
    const spec = plSpec(g, b)!
    expect(spec.marks![0]!.label.length).toBeLessThanOrEqual(40)
    expect(readChartSpec(spec)).toEqual(spec)
  })
})

describe('plSpec', () => {
  it('describes the year in a summary and carries the change when two years are on the books', () => {
    const prev = statement({ year: 2029, cogs: 50_000 })
    const cur = statement({ corpTax: 4_000 })
    const { g, b } = built({ corpTax: 4_000 })
    recordEconomicReport(b, prev, cur)
    const spec = plSpec(g, b)!
    // Net 16,000 against 10,000 a year earlier (the money helper writes a four-digit amount in full).
    expect(spec.summary).toBe('Net profit $16K on $100K of sales after tax, up $6,000.')
    const first = built({ corpTax: 4_000 })
    expect(plSpec(first.g, first.b)!.summary).toBe('Net profit $16K on $100K of sales after tax.')
    const loss = built({ cogs: 120_000 })
    expect(plSpec(loss.g, loss.b)!.summary).toBe('Net loss $60K on $100K of sales after tax.')
  })

  it('returns null with no statement, and for a value that is not a finite number or is absurdly large', () => {
    const none = built()
    none.b.last = null
    expect(plSpec(none.g, none.b)).toBeNull()
    expect(plSummarySpec(none.g, none.b)).toBeNull()
    expect(bridgeSpec(none.g, none.b)).toBeNull()
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1e300, -1e20]) {
      for (const key of ['netRevenue', 'cogs', 'wages', 'other', 'otherIncome', 'ownerPay', 'pbt', 'corpTax', 'net'] as const) {
        const x = built()
        x.b.last = { ...x.b.last!, [key]: bad }
        expect(plSpec(x.g, x.b), `${key} ${bad}`).toBeNull()
        expect(plSummarySpec(x.g, x.b), `${key} ${bad}`).toBeNull()
      }
    }
  })

  it('never puts a non-finite number in the steps, even for a statement it was not given by the reader', () => {
    const { b, s } = built()
    const steps = plSteps(b, { ...s, cogs: Number.NaN, wages: Number.POSITIVE_INFINITY })
    for (const x of steps) expect(Number.isFinite(x.value), x.label).toBe(true)
  })

  it('shows an old statement that carries strategicIncome with no row of its own, and the sum holds', () => {
    const { g, b, s } = built({ otherIncome: 500_000, strategicIncome: 200_000, corpTax: 10_000 })
    const steps = plSteps(b, s)
    expect(labels(steps).some((l) => /strateg|foresight|trading/i.test(l))).toBe(false)
    // It is inside Other income.
    expect(steps.find((x) => x.label === L.otherIncome)!.value).toBe(500_000)
    expectExact(steps, s.net)
    const spec = plSpec(g, b)!
    expect(JSON.stringify(spec)).not.toMatch(/strateg|foresight/i)
    expect(readChartSpec(spec)).toEqual(spec)
    // And with a franchise or a lab it is still inside what is left of Other income.
    const mixed = built({ otherIncome: 500_000, strategicIncome: 200_000 }, { franchise: { units: 1, ledger: [{ year: 2030, fees: 40_000, royalty: 10_000 }] } })
    const m = plSteps(mixed.b, mixed.s)
    expect(m.find((x) => x.label === L.otherIncome)!.value).toBe(450_000)
    expect(m.find((x) => x.label === L.franchise)!.value).toBe(50_000)
    expectExact(m, mixed.s.net)
  })
})

/** (b, s) from a built(): plSteps takes them as two arguments. */
function pair(x: { b: BizState; s: Statement }): [BizState, Statement] {
  return [x.b, x.s]
}

// ---------------------------------------------------------------------------
// The summary

describe('plSummarySpec', () => {
  it('has at most 10 steps and the same exact sum for all 168 statements', () => {
    for (const x of samples) {
      const b = readBiz(x.g, x.a)
      const spec = plSummarySpec(x.g, b)
      const tag = `${x.seed}:${x.industry}`
      expect(spec, tag).not.toBeNull()
      const steps = spec!.steps!
      expect(steps.length, tag).toBeLessThanOrEqual(10)
      expect(spec!.title, tag).toBe('Where the sales went')
      expect(spec!.kind).toBe('waterfall')
      expectExact(steps, x.s.net, tag)
      const full = plSteps(b, x.s)
      expect(steps[0], tag).toEqual(full[0])
      expect(steps[steps.length - 1], tag).toEqual(full[full.length - 1])
      // The profit before tax stays a total in the summary too.
      expect(steps.find((s) => s.label === L.pbt), tag).toEqual(full.find((s) => s.label === L.pbt))
      // At most five cost or income rows, and one Everything else.
      const rest = steps.filter((s) => s.label === L.rest)
      expect(rest.length, tag).toBeLessThanOrEqual(1)
    }
  })

  it('keeps the five largest rows in statement order and folds the rest into Everything else with its sign', () => {
    const { g, b, s } = built(FULL, FULL_EXTRA)
    const spec = plSummarySpec(g, b)!
    const steps = spec.steps!
    // By size: cogs 300K, wages 200K, ownerPay 100K, rent 80K, upkeep 60K; then oneOff 50K, keyStaff 50K, marketing 40K ...
    expect(labels(steps)).toEqual([L.sales, L.cogs, L.wages, L.rent, L.upkeep, L.ownerPay, L.rest, L.pbt, L.tax, L.net])
    const restValue = -50_000 - 50_000 - 40_000 - 10_000 - 20_000 + 40_000 + 30_000 + 12_000 + 8_000
    expect(steps.find((x) => x.label === L.rest)!.value).toBe(restValue)
    expect(steps.length).toBe(10)
    expectExact(steps, s.net)
  })

  it('breaks a tie by statement order', () => {
    // Six rows of exactly 10,000: the first five in order are kept, the sixth goes to Everything else.
    const { g, b, s } = built({ netRevenue: 200_000, cogs: 10_000, wages: 10_000, keyStaff: 10_000, rent: 10_000, marketing: 10_000, interest: 10_000, upkeep: 0 })
    const steps = plSummarySpec(g, b)!.steps!
    expect(labels(steps)).toEqual([L.sales, L.cogs, L.wages, L.keyStaff, L.rent, L.marketing, L.rest, L.pbt, L.net])
    expect(steps.find((x) => x.label === L.rest)!.value).toBe(-10_000)
    expectExact(steps, s.net)
  })

  it('has no Everything else row when five rows or fewer say it all, or when the rest nets to nothing', () => {
    const { g, b, s } = built({ corpTax: 4_000 })
    const steps = plSummarySpec(g, b)!.steps!
    expect(labels(steps)).toEqual([L.sales, L.cogs, L.wages, L.rent, L.upkeep, L.pbt, L.tax, L.net])
    expectExact(steps, s.net)
    const zero = built({ netRevenue: 200_000, cogs: 10_000, wages: 10_000, keyStaff: 10_000, rent: 10_000, marketing: 10_000, interest: 5_000, otherIncome: 5_000, upkeep: 0 })
    expect(labels(plSummarySpec(zero.g, zero.b)!.steps!)).not.toContain(L.rest)
    expectExact(plSummarySpec(zero.g, zero.b)!.steps!, zero.s.net)
  })

  it('folds a rounding gap into the rows around it and still sums exactly, within 10 steps', () => {
    const base = statement(FULL).pbt
    const a = built({ ...FULL, pbt: base + 4, net: base + 4 - 50_000 + 3 }, FULL_EXTRA)
    const steps = plSummarySpec(a.g, a.b)!.steps!
    expect(steps.length).toBeLessThanOrEqual(10)
    expectExact(steps, a.s.net)
    expect(steps.find((x) => x.label === L.pbt)!.value).toBe(Math.round(a.s.pbt))
    // With no tax and a gap before the net, the gap gets a Rounding row of its own.
    const b = built({ net: statement().pbt + 2 })
    const free = plSummarySpec(b.g, b.b)!.steps!
    expect(labels(free)).toEqual([L.sales, L.cogs, L.wages, L.rent, L.upkeep, L.pbt, L.rounding, L.net])
    expectExact(free, b.s.net)
  })

  it('shows a gap as a Rounding row, not as Everything else, when every row is already shown', () => {
    const base = statement().pbt
    const { g, b, s } = built({ pbt: base + 3 })
    const steps = plSummarySpec(g, b)!.steps!
    expect(labels(steps)).toEqual([L.sales, L.cogs, L.wages, L.rent, L.upkeep, L.rounding, L.pbt, L.net])
    expect(steps[5]!.value).toBe(3)
    expectExact(steps, s.net)
  })

  it('writes the same one-line summary as the full chart', () => {
    const { g, b } = built({ corpTax: 4_000 })
    expect(plSummarySpec(g, b)!.summary).toBe(plSpec(g, b)!.summary)
  })
})

// ---------------------------------------------------------------------------
// The bridge: why profit changed

describe('bridgeSpec', () => {
  it('after two consecutive passes, runs from last net to this net and sums within a cent', () => {
    const two = statementSamples([11])
    const g = two[0]!.g
    g.queue = []
    g.year += 1
    yearlyBusinessImpl(g)
    let checked = 0
    for (const x of two) {
      const a = findBusiness(g, x.a.id)
      if (!a) continue
      const b = readBiz(g, a)
      if (!b.last || b.last.year !== x.s.year + 1) continue
      const spec = bridgeSpec(g, b)
      const report = economicReportOf(b)
      if (!report) {
        expect(spec, x.industry).toBeNull()
        continue
      }
      expect(spec, x.industry).not.toBeNull()
      checked++
      const steps = spec!.steps!
      expect(spec!.kind).toBe('waterfall')
      expect(spec!.title).toBe('Why profit changed')
      expect(steps.length).toBeGreaterThanOrEqual(3)
      expect(steps.length).toBeLessThanOrEqual(15)
      expect(steps[0]!.kind).toBe('total')
      expect(steps[0]!.value).toBe(report.previousNet)
      expect(steps[0]!.label).toBe(`Net profit ${report.previousYear}`)
      expect(steps[steps.length - 1]!.kind).toBe('total')
      expect(steps[steps.length - 1]!.value).toBe(report.net)
      expect(steps[steps.length - 1]!.label).toBe(`Net profit ${report.year}`)
      expect(steps[steps.length - 1]!.value).toBe(b.last.net)
      expect(Math.abs(steps[0]!.value + deltaSum(steps) - steps[steps.length - 1]!.value)).toBeLessThanOrEqual(0.01)
      for (const st of steps) expect(st.label.length, st.label).toBeLessThanOrEqual(40)
      expect(readChartSpec(spec!)).toEqual(spec)
    }
    // Most of the 56 companies are still trading a year on.
    expect(checked).toBeGreaterThanOrEqual(30)
  }, 80_000)

  it('is built from the report: one delta a driver, the label cut to 40, and a summary that says what moved', () => {
    const prev = statement({ year: 2029, cogs: 50_000 })
    const cur = statement()
    const { g, b } = built()
    recordEconomicReport(b, prev, cur)
    const spec = bridgeSpec(g, b)!
    expect(spec.steps!.map((x) => x.kind)).toEqual(['total', ...spec.steps!.slice(1, -1).map(() => 'delta'), 'total'])
    expect(labels(spec.steps!)[0]).toBe('Net profit 2029')
    expect(labels(spec.steps!)[spec.steps!.length - 1]).toBe('Net profit 2030')
    expect(spec.steps!.find((x) => x.label === 'Materials and direct costs')!.value).toBe(10_000)
    expect(spec.summary).toBe('Net profit rose $10K from 2029. The biggest driver was materials and direct costs, adding $10K.')
    expect(spec.unit).toBe('money')
    expect(spec.x).toEqual([])
    expect(spec.series).toEqual([])
    expect(spec.basis).toBeUndefined()
    // A long driver label is cut to 40 characters.
    const long = built()
    recordEconomicReport(long.b, prev, cur)
    const report = long.b.economicReport as { drivers: { label: string; amount: number }[] }
    report.drivers[0]!.label = 'A very long driver name that goes on and on past the forty characters'
    const cut = bridgeSpec(long.g, long.b)!
    expect(cut.steps![1]!.label).toBe('A very long driver name that goes on and')
    expect(cut.steps![1]!.label.length).toBe(40)
    expect(readChartSpec(cut)).toEqual(cut)
  })

  it('is null for a company with no report, a report with no drivers, and a report that does not match the books', () => {
    const none = built()
    expect(bridgeSpec(none.g, none.b)).toBeNull()
    const same = built()
    recordEconomicReport(same.b, statement({ year: 2029 }), statement())
    expect((same.b.economicReport as { drivers: unknown[] }).drivers).toEqual([])
    expect(bridgeSpec(same.g, same.b)).toBeNull()
    // The report names a year other than the last statement's.
    const stale = built()
    recordEconomicReport(stale.b, statement({ year: 2029, cogs: 50_000 }), statement())
    stale.b.last = statement({ year: 2031 })
    expect(bridgeSpec(stale.g, stale.b)).toBeNull()
  })

  it('is null for a hostile report: drivers that do not sum, strings where numbers go, and huge numbers', () => {
    const make = () => {
      const x = built()
      recordEconomicReport(x.b, statement({ year: 2029, cogs: 50_000 }), statement())
      return x
    }
    const drivers = make()
    ;(drivers.b.economicReport as { drivers: { label: string; amount: number }[] }).drivers.push({ label: 'Invented', amount: 999 })
    expect(bridgeSpec(drivers.g, drivers.b)).toBeNull()

    const strings = make()
    ;(strings.b.economicReport as Record<string, unknown>).drivers = [{ label: 7, amount: '10000' }, 'x', null]
    expect(bridgeSpec(strings.g, strings.b)).toBeNull()

    const nets = make()
    ;(nets.b.economicReport as Record<string, unknown>).net = '16000'
    expect(bridgeSpec(nets.g, nets.b)).toBeNull()

    const notList = make()
    ;(notList.b.economicReport as Record<string, unknown>).drivers = { length: 1e9 }
    expect(bridgeSpec(notList.g, notList.b)).toBeNull()

    // Numbers that sum but are beyond what a spec may carry.
    const huge = built({ pbt: 1e300, net: 1e300 })
    huge.b.economicReport = { v: 1, year: 2030, previousYear: 2029, previousNet: 1e300, net: 1e300, delta: 0, drivers: [{ label: 'a', amount: 1e300 }, { label: 'b', amount: -1e300 }] }
    expect(bridgeSpec(huge.g, huge.b)).toBeNull()
  })

  it('cleans a driver label so the spec always reads back: empty, control characters and padding', () => {
    const x = built()
    recordEconomicReport(x.b, statement({ year: 2029, cogs: 50_000, wages: 30_000 }), statement())
    const report = x.b.economicReport as { drivers: { label: string; amount: number }[] }
    expect(report.drivers.length).toBeGreaterThanOrEqual(2)
    report.drivers[0]!.label = ''
    report.drivers[1]!.label = '\u0000Wages\u001f  '
    const spec = bridgeSpec(x.g, x.b)!
    expect(spec).not.toBeNull()
    expect(readChartSpec(spec)).toEqual(spec)
    for (const st of spec.steps!) expect(st.label.length).toBeGreaterThan(0)
  })
})

describe('profitVerdict', () => {
  it('says what the profit did, and that a first year is a first year', () => {
    const rose = built()
    recordEconomicReport(rose.b, statement({ year: 2029, cogs: 50_000 }), statement())
    expect(profitVerdict(rose.g, rose.b)).toBe('Net profit rose $10K from 2029.')
    const fell = built({ cogs: 50_000 })
    recordEconomicReport(fell.b, statement({ year: 2029 }), fell.s)
    expect(profitVerdict(fell.g, fell.b)).toBe('Net profit fell $10K from 2029.')
    const flat = built()
    recordEconomicReport(flat.b, statement({ year: 2029 }), flat.s)
    expect(profitVerdict(flat.g, flat.b)).toBe('Net profit was unchanged from 2029.')
    const first = built()
    expect(profitVerdict(first.g, first.b)).toBe('First full year on the books.')
    const bare = built()
    bare.b.last = null
    expect(profitVerdict(bare.g, bare.b)).toBe('First full year on the books.')
  })

  it('stays within 120 characters and uses no dash character for any size of change', () => {
    const x = built({ netRevenue: 9e13 })
    recordEconomicReport(x.b, statement({ year: 2029 }), x.s)
    const t = profitVerdict(x.g, x.b)
    expect(t.length).toBeLessThanOrEqual(120)
    expect(/[\u2013\u2014]/.test(t)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Every spec is one the UI accepts

describe('the specs are valid and short', () => {
  function allSpecs(): { tag: string; spec: ChartSpec }[] {
    const out: { tag: string; spec: ChartSpec }[] = []
    const add = (tag: string, spec: ChartSpec | null) => {
      if (spec) out.push({ tag, spec })
    }
    for (const x of samples) {
      const b = readBiz(x.g, x.a)
      add(`${x.seed}:${x.industry} pl`, plSpec(x.g, b))
      add(`${x.seed}:${x.industry} summary`, plSummarySpec(x.g, b))
      add(`${x.seed}:${x.industry} bridge`, bridgeSpec(x.g, b))
    }
    for (const [tag, over, extra] of [
      ['full', FULL, FULL_EXTRA],
      ['plain', {}, {}],
      ['bonus', { other: 250_000 }, { history: [row(2030, 250_000)] }],
    ] as [string, Partial<Statement>, Partial<BizState>][]) {
      const x = built(over, extra)
      add(`${tag} pl`, plSpec(x.g, x.b))
      add(`${tag} summary`, plSummarySpec(x.g, x.b))
      recordEconomicReport(x.b, statement({ year: 2029, cogs: 1 }), x.s)
      add(`${tag} bridge`, bridgeSpec(x.g, x.b))
    }
    return out
  }

  it('pass readChartSpec unchanged, with every string at most 120 characters and no dash character', () => {
    const list = allSpecs()
    expect(list.length).toBeGreaterThanOrEqual(168 * 2)
    for (const { tag, spec } of list) {
      expect(readChartSpec(spec), tag).toEqual(spec)
      expect(spec.title.length, tag).toBeLessThanOrEqual(CHART_LIMITS.title)
      for (const t of strings(spec)) {
        expect(t.length, `${tag}: ${t}`).toBeLessThanOrEqual(CHART_LIMITS.text)
        expect(/[\u2013\u2014]/.test(t), `${tag}: ${t}`).toBe(false)
      }
      for (const st of spec.steps ?? []) expect(st.label.length, `${tag}: ${st.label}`).toBeLessThanOrEqual(40)
    }
  })
})

// ---------------------------------------------------------------------------
// Purity

describe('purity', () => {
  it('runs on a frozen state and readBiz output, draws no random number, and changes nothing', () => {
    const g = samples[0]!.g
    const frozen = deepFreeze(structuredClone(g))
    const rng = frozen.rng
    const before = JSON.stringify(frozen)
    for (const x of samples.filter((s) => s.g === g)) {
      const a = frozen.assets.find((y) => y.id === x.a.id)!
      const b = deepFreeze(readBiz(frozen, a))
      const live = readBiz(g, x.a)
      expect(plSteps(b, x.s)).toEqual(plSteps(live, x.s))
      expect(plSpec(frozen, b)).toEqual(plSpec(g, live))
      expect(plSummarySpec(frozen, b)).toEqual(plSummarySpec(g, live))
      expect(bridgeSpec(frozen, b)).toEqual(bridgeSpec(g, live))
      expect(profitVerdict(frozen, b)).toBe(profitVerdict(g, live))
      // Two calls give two equal, separate objects.
      const one = plSpec(frozen, b)
      const two = plSpec(frozen, b)
      expect(one).toEqual(two)
      expect(one).not.toBe(two)
      expect(one!.steps).not.toBe(two!.steps)
    }
    expect(frozen.rng).toBe(rng)
    expect(JSON.stringify(frozen)).toBe(before)
  })

  it('does not draw from the life random stream or edit the company it reads', () => {
    const { g, b } = built(FULL, FULL_EXTRA)
    recordEconomicReport(b, statement({ year: 2029, cogs: 50_000 }), b.last!)
    const rng = g.rng
    const stored = JSON.stringify(b)
    plSteps(b, b.last!)
    plSpec(g, b)
    plSummarySpec(g, b)
    bridgeSpec(g, b)
    profitVerdict(g, b)
    expect(g.rng).toBe(rng)
    expect(JSON.stringify(b)).toBe(stored)
  })
})

// ---------------------------------------------------------------------------
// Old saves

describe('the v4.0.2 fixture', () => {
  it('gives every company with a statement a valid Profit and Loss, and a bridge exactly when its report adds up', () => {
    const raw = JSON.parse(gunzipSync(readFileSync('test/fixtures/save-v1.json.gz')).toString()) as Record<string, unknown>
    const result = migrateSave(structuredClone(raw))
    expect(result.kind).toBe('ready')
    if (result.kind !== 'ready') return
    const game = result.game
    let seen = 0
    for (const a of businessAssets(game)) {
      const b = readBiz(game, a)
      if (!b.last) continue
      seen++
      const spec = plSpec(game, b)
      expect(spec).not.toBeNull()
      expect(readChartSpec(spec!)).toEqual(spec)
      expectExact(spec!.steps!, b.last.net)
      const summary = plSummarySpec(game, b)
      expect(summary).not.toBeNull()
      expect(readChartSpec(summary!)).toEqual(summary)
      expectExact(summary!.steps!, b.last.net)
      // v4.0.2 already writes the economic report, so a fixture company with two years on the books has a bridge.
      const report = economicReportOf(b)
      const bridge = bridgeSpec(game, b)
      if (report) {
        expect(bridge).not.toBeNull()
        expect(readChartSpec(bridge!)).toEqual(bridge)
        const steps = bridge!.steps!
        expect(steps[0]!.value).toBe(report.previousNet)
        expect(steps[steps.length - 1]!.value).toBe(b.last.net)
        expect(Math.abs(steps[0]!.value + deltaSum(steps) - steps[steps.length - 1]!.value)).toBeLessThanOrEqual(0.01)
        expect(profitVerdict(game, b)).toMatch(/^Net profit (rose|fell|was unchanged)/)
      } else {
        expect(bridge).toBeNull()
        expect(profitVerdict(game, b)).toBe('First full year on the books.')
      }
    }
    expect(seen).toBeGreaterThan(0)
  })
})
