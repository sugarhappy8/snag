// R1 visual check: the labels down a y axis read in one short money format. The cash chart of the phone photo had
// "$5.0M" next to "$10M": the game's compact money writes a decimal under ten units and none from ten, which is right for
// one number and wrong for a column of ticks. formatTicks (src/ui/charts/format.ts) writes the ticks of one axis together.
import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { axisMoney, bindMoneyContext, setMoneyDisplay, shortMoney } from '../src/game/core'
// Importing the currencies registers the real converter (yen), as the game does at startup.
import '../src/game/data/currencies'
import type { ChartSpec } from '../src/game/charts/spec'
import { formatTicks, formatUnit } from '../src/ui/charts/format'
import { niceTicks } from '../src/ui/charts/geometry'
import { yTicks } from '../src/ui/charts/LineChart'
import ChartView from '../src/ui/charts/ChartView'
import { renderHtml } from './charts-kit'
import { makeTestGame } from './helpers'

afterEach(() => {
  setMoneyDisplay({ mode: 'usd', nominal: false })
  bindMoneyContext(null)
})

/** The y labels of a rendered plot, top to bottom as the markup writes them. */
function yLabels(markup: string): string[] {
  return [...markup.matchAll(/<text [^>]*class="ch-ax ch-ax-y"[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]!)
}

function cashChart(values: number[]): ChartSpec {
  return {
    v: 1,
    kind: 'line',
    title: 'Cash and debt',
    unit: 'money',
    x: values.map((_, i) => 2010 + i),
    series: [{ id: 'cash', label: 'Cash', tone: 'c1', values }],
    basis: 2026,
    summary: 'Cash went up.',
  }
}

describe('formatTicks, money in dollars', () => {
  it('drops the trailing zero: the photo axis reads $0, $5M, $10M, $15M', () => {
    expect(formatTicks('money', [0, 5_000_000, 10_000_000, 15_000_000])).toEqual(['$0', '$5M', '$10M', '$15M'])
    // What the single-number format says for the same ticks, the mix the photo showed.
    expect([5_000_000, 10_000_000].map((t) => formatUnit('money', t))).toEqual(['$5.0M', '$10M'])
  })

  it('keeps one decimal on the ticks that need it, and none on the ones that do not', () => {
    expect(formatTicks('money', [1_000_000, 1_500_000, 2_000_000, 2_500_000])).toEqual(['$1M', '$1.5M', '$2M', '$2.5M'])
    expect(formatTicks('money', [0, 500_000, 1_000_000, 1_500_000])).toEqual(['$0', '$500K', '$1M', '$1.5M'])
  })

  it('gives each tick its own text when whole millions would not tell them apart', () => {
    // The single-number format rounds 10.5M and 11.5M to whole millions: $10M, $11M, $11M, $12M.
    const ticks = [10_000_000, 10_500_000, 11_000_000, 11_500_000]
    expect(ticks.map((t) => formatUnit('money', t))).toContain('$11M')
    expect(formatTicks('money', ticks)).toEqual(['$10M', '$10.5M', '$11M', '$11.5M'])
  })

  it('counts a thousand-dollar axis in K once it reaches ten thousand, so $5,000 never sits next to $10K', () => {
    expect(formatTicks('money', [0, 5_000, 10_000, 15_000])).toEqual(['$0', '$5K', '$10K', '$15K'])
    expect(formatTicks('money', [0, 200_000, 400_000, 600_000, 800_000, 1_000_000])).toEqual(['$0', '$200K', '$400K', '$600K', '$800K', '$1M'])
    // Under ten thousand the plain figure is the short one.
    expect(formatTicks('money', [0, 2_000, 4_000, 6_000, 8_000])).toEqual(['$0', '$2,000', '$4,000', '$6,000', '$8,000'])
    expect(formatTicks('money', [0, 200, 400])).toEqual(['$0', '$200', '$400'])
  })

  it('writes a negative tick with its sign and moves up a unit instead of writing 1000K', () => {
    expect(formatTicks('money', [-2_000_000, -1_000_000, 0, 1_000_000])).toEqual(['-$2M', '-$1M', '$0', '$1M'])
    expect(formatTicks('money', [0, 999_999, 2_000_000])).toEqual(['$0', '$1M', '$2M'])
  })

  it('writes billions and trillions the same way', () => {
    expect(formatTicks('money', [0, 5e9, 10e9])).toEqual(['$0', '$5B', '$10B'])
    expect(formatTicks('money', [0, 2.5e12, 5e12])).toEqual(['$0', '$2.5T', '$5T'])
  })

  it('is total: no tick that is not a number, an empty axis, and hyperinflation sums read as shortMoney does', () => {
    expect(formatTicks('money', [])).toEqual([])
    expect(formatTicks('money', [Number.NaN, 5_000_000])).toEqual(['$0', '$5M'])
    expect(formatTicks('money', [0, Number.POSITIVE_INFINITY])).toEqual(['$0', '$0'])
    expect(formatTicks('money', [0, 2e16])).toEqual(['$0', shortMoney(2e16)])
  })

  it('leaves the other units as formatUnit writes them', () => {
    expect(formatTicks('pct', [0, 0.1, 0.25])).toEqual([0, 0.1, 0.25].map((t) => formatUnit('pct', t)))
    expect(formatTicks('count', [0, 1_200, 5_000])).toEqual([0, 1_200, 5_000].map((t) => formatUnit('count', t)))
    expect(formatTicks('rank', [1, 2, 3])).toEqual(['#1', '#2', '#3'])
    expect(formatTicks('years', [0, 5, 10])).toEqual([0, 5, 10].map((t) => formatUnit('years', t)))
  })
})

describe('axisMoney, in other currencies', () => {
  function life(countryId: string) {
    setMoneyDisplay({ mode: 'local', nominal: false })
    const g = makeTestGame(1, { countryId })
    g.year = 2026
    bindMoneyContext(g)
  }

  it('keeps the symbol after the number for a krona and writes no trailing .0', () => {
    life('se')
    const labels = axisMoney(niceTicks(0, 3_000_000, 4))
    expect(labels.length).toBeGreaterThanOrEqual(3)
    for (const label of labels) expect(label).toMatch(/^(0|[\d,]+|\d+(\.\d)?[KMB]) kr$/)
    expect(labels.join(' ')).not.toMatch(/\.0/)
  })

  it('keeps the space after a Swiss franc symbol', () => {
    life('ch')
    const labels = axisMoney(niceTicks(0, 3_000_000, 4))
    for (const label of labels) expect(label).toMatch(/^CHF (0|[\d,]+|\d+(\.\d)?[KMB])$/)
    expect(labels.join(' ')).not.toMatch(/\.0/)
  })

  it('reads like shortMoney for a single plain figure, and for a tick list under ten thousand', () => {
    expect(axisMoney([4_500])).toEqual([shortMoney(4_500)])
    expect(axisMoney([0, 2_500, 5_000])).toEqual(['$0', '$2,500', '$5,000'])
  })
})

describe('formatTicks, in the ticks an axis really draws', () => {
  it('never ends a label in .0, and never writes two ticks alike, over many ranges', () => {
    let checked = 0
    for (const lo of [0, 1_000, 40_000, 750_000, 2_300_000, 9_400_000, 10_200_000, 120_000_000]) {
      for (const span of [800, 5_000, 90_000, 450_000, 1_800_000, 3_000_000, 12_000_000, 60_000_000, 900_000_000]) {
        // A span under 2% of where it sits (a range of $800 at $120M) cannot be told apart in any short format.
        if (span < lo * 0.02) continue
        const ticks = niceTicks(lo, lo + span, 4)
        const labels = formatTicks('money', ticks)
        expect(labels).toHaveLength(ticks.length)
        for (const label of labels) expect(label, `${lo}+${span}`).not.toMatch(/\.0(?![0-9])/)
        expect(new Set(labels).size, `${lo}+${span}: ${labels.join(' ')}`).toBe(labels.length)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(50)
  })

  it('reads back as the tick it labels, to the digit it shows', () => {
    const unit: Record<string, number> = { '': 1, K: 1e3, M: 1e6, B: 1e9, T: 1e12 }
    for (const [lo, hi] of [
      [0, 20_000_000],
      [9_700_000, 12_300_000],
      [10_200_000, 11_800_000],
      [300_000, 4_100_000],
      [0, 84_000],
    ] as const) {
      const ticks = yTicks(lo, hi, 'money')
      const labels = formatTicks('money', ticks)
      labels.forEach((label, i) => {
        const m = /^(-?)\$([\d,.]+)([KMBT]?)$/.exec(label)
        expect(m, label).not.toBeNull()
        const value = (m![1] === '-' ? -1 : 1) * Number(m![2]!.replace(/,/g, '')) * unit[m![3]!]!
        expect(value, `${label} for ${ticks[i]}`).toBeCloseTo(ticks[i]!, -Math.floor(Math.log10(Math.max(1, Math.abs(ticks[i]!)))) + 2)
      })
    }
  })
})

describe('the y axis of a chart', () => {
  it('writes the photo cash chart as one short format', () => {
    // The chart's own ticks are $5M and $10M; the single-number format wrote them "$5.0M" and "$10M".
    const spec = cashChart([1_000_000, 3_000_000, 7_000_000, 11_000_000, 14_200_000])
    expect(yLabels(renderHtml(createElement(ChartView, { spec })))).toEqual(['$5M', '$10M'])
    const wide = yLabels(renderHtml(createElement(ChartView, { spec: cashChart([0, 4_000_000, 9_000_000, 12_000_000, 16_000_000]) })))
    expect(wide.length).toBeGreaterThanOrEqual(3)
    for (const label of wide) expect(label).toMatch(/^\$(0|\d+(\.\d)?[KM])$/)
    expect(wide.join(' ')).not.toMatch(/\.0/)
  })

  it('does the same for a yen axis', () => {
    setMoneyDisplay({ mode: 'local', nominal: false })
    const g = makeTestGame(1, { countryId: 'jp' })
    g.year = 2026
    bindMoneyContext(g)
    const labels = yLabels(renderHtml(createElement(ChartView, { spec: cashChart([0, 4_000_000, 9_000_000, 15_000_000]) })))
    expect(labels.length).toBeGreaterThanOrEqual(3)
    for (const label of labels) expect(label).toMatch(/^¥(0|[\d,]+|\d+(\.\d)?[KMB])$/)
    expect(labels.join(' ')).not.toMatch(/\.0/)
  })
})
