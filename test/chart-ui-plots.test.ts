// R1-C8: the second part of the chart kit (src/ui/charts): LineChart, BarChart (stacked or grouped) and Waterfall.
// Every plot is rendered the way this repo tests the UI: createElement + renderToStaticMarkup, no DOM. useScrub is
// called through a tiny wrapper component, and a hand-made ScrubApi stands in for a reader who has moved the cursor
// (a static render never has one). The frame, sparkline and tiles are test/chart-ui-frame.test.ts.
import { readFileSync } from 'node:fs'
import { createElement, type ReactElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { bindMoneyContext, moneyScale, setMoneyDisplay } from '../src/game/core'
import '../src/game/data/currencies'
import type { ChartSpec, ChartStep, ChartUnit } from '../src/game/charts/spec'
import { readoutFor } from '../src/ui/charts/format'
import { Frame } from '../src/ui/charts/Frame'
import { MARKER_SHAPES, markerPath } from '../src/ui/charts/geometry'
import { BarChart, barInset } from '../src/ui/charts/BarChart'
import { LINE_INSET, LineChart, PLOT_BOTTOM, PLOT_TOP } from '../src/ui/charts/LineChart'
import { Waterfall } from '../src/ui/charts/Waterfall'
import { useScrub, type ScrubApi } from '../src/ui/charts/useScrub'
import { countSvgNodes, deepFreeze, renderHtml } from './charts-kit'
import { makeTestGame } from './helpers'

const BAD = /NaN|Infinity|undefined|\[object Object\]/
const DASHES = new RegExp('[\\u2013\\u2014]')

afterEach(() => {
  setMoneyDisplay({ mode: 'usd', nominal: false })
  bindMoneyContext(null)
})

// ---------------------------------------------------------------------------
// Helpers

type PlotId = 'line' | 'timeline' | 'bars' | 'stack' | 'waterfall'

function plotFor(id: PlotId, spec: ChartSpec, scrub: ScrubApi): ReactElement {
  switch (id) {
    case 'line':
    case 'timeline':
      return createElement(LineChart, { spec, scrub })
    case 'bars':
      return createElement(BarChart, { spec, scrub, stacked: false })
    case 'stack':
      return createElement(BarChart, { spec, scrub, stacked: true })
    case 'waterfall':
      return createElement(Waterfall, { spec, scrub })
  }
}

function pointsOf(id: PlotId, spec: ChartSpec): number {
  return id === 'waterfall' ? (spec.steps ?? []).length : spec.x.length
}

/** A plot inside a Frame, with the real hook: what ChartView (R1-C9) will do. */
function Scrubbed(p: { id: PlotId; spec: ChartSpec; framed: boolean }): ReactElement {
  const scrub = useScrub(pointsOf(p.id, p.spec))
  const plot = plotFor(p.id, p.spec, scrub)
  if (!p.framed) return plot
  return createElement(Frame, { spec: p.spec, readout: readoutFor(p.spec, scrub.index), children: plot })
}

function html(id: PlotId, spec: ChartSpec, framed = true): string {
  return renderHtml(createElement(Scrubbed, { id, spec, framed }))
}

const noop = (): void => {}

/** A reader who has put the cursor on `index`. */
function fakeScrub(index: number, active = true): ScrubApi {
  return { index, active, handlers: { tabIndex: 0, onKeyDown: noop, onPointerDown: noop, onPointerMove: noop, onPointerLeave: noop, onBlur: noop } }
}

function activeHtml(id: PlotId, spec: ChartSpec, index: number): string {
  const plot = plotFor(id, spec, fakeScrub(index))
  return renderHtml(createElement(Frame, { spec, children: plot }))
}

function tagOf(markup: string, re: RegExp): string {
  const m = re.exec(markup)
  if (!m) throw new Error(`no ${re} in ${markup.slice(0, 300)}`)
  return m[0]
}

function attrOf(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)
  return m ? m[1]! : null
}

function count(markup: string, re: RegExp): number {
  return (markup.match(re) ?? []).length
}

/** The opening tags of every element of one class, in order. */
function tagsWithClass(markup: string, cls: string): string[] {
  return [...markup.matchAll(new RegExp(`<[a-z]+ [^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>`, 'g'))].map((m) => m[0])
}

function num(tag: string, name: string): number {
  const v = attrOf(tag, name)
  if (v === null) throw new Error(`no ${name} in ${tag}`)
  return Number(v)
}

function lineSpec(over: Partial<ChartSpec> = {}): ChartSpec {
  return {
    v: 1,
    kind: 'line',
    title: 'Net profit and cash',
    unit: 'money',
    x: [2025, 2026, 2027, 2028, 2029],
    series: [
      { id: 'net', label: 'Net profit', tone: 'c1', values: [100_000, 250_000, 150_000, 600_000, 1_200_000] },
      { id: 'cash', label: 'Cash', tone: 'c2', values: [400_000, 500_000, 450_000, 900_000, 2_000_000] },
    ],
    summary: 'Net profit rose from $100K to $1.2M while cash reached $2M.',
    ...over,
  }
}

function barSpec(over: Partial<ChartSpec> = {}): ChartSpec {
  return lineSpec({
    kind: 'bars',
    title: 'Net profit by year',
    series: [{ id: 'net', label: 'Net profit', tone: 'c1', values: [100_000, -250_000, 150_000, 600_000, 1_200_000] }],
    summary: 'Net profit by year, with one loss in 2026.',
    ...over,
  })
}

function stackSpec(columns = 5, series = 3, over: Partial<ChartSpec> = {}): ChartSpec {
  const tones = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'] as const
  return {
    v: 1,
    kind: 'stack',
    title: 'Where the money went',
    unit: 'money',
    x: Array.from({ length: columns }, (_, i) => 2000 + i),
    series: Array.from({ length: series }, (_, s) => ({
      id: `s${s}`,
      label: `Cost ${s + 1}`,
      tone: tones[s % 6]!,
      values: Array.from({ length: columns }, (_, i) => 1000 * (s + 1) + ((i * 37 + s * 11) % 400)),
    })),
    summary: 'Costs by year, stacked.',
    ...over,
  }
}

function wfSpec(steps: ChartStep[], over: Partial<ChartSpec> = {}): ChartSpec {
  return { v: 1, kind: 'waterfall', title: 'Where the sales went', unit: 'money', x: [], series: [], steps, summary: 'Net profit $2.2M on $9.6M of sales after tax.', ...over }
}

const PL_STEPS: ChartStep[] = [
  { label: 'Sales after tax', value: 9_600_000, kind: 'total' },
  { label: 'Materials and direct costs', value: -3_900_000, kind: 'delta' },
  { label: 'Wages', value: -2_200_000, kind: 'delta' },
  { label: 'Rent', value: -600_000, kind: 'delta' },
  { label: 'Marketing', value: -400_000, kind: 'delta' },
  { label: 'Other income', value: 300_000, kind: 'delta' },
  { label: 'Profit before tax', value: 2_800_000, kind: 'total' },
  { label: 'Corporate tax', value: -600_000, kind: 'delta' },
  { label: 'Net profit', value: 2_200_000, kind: 'total' },
]

/** The rows of a waterfall's markup, one string for each <li>. */
function rowsOf(markup: string): string[] {
  return [...markup.matchAll(/<li\b[\s\S]*?<\/li>/g)].map((m) => m[0])
}

// ---------------------------------------------------------------------------
// 1. Role, name, description

describe('the plots are sliders with a name and a description', () => {
  const cases: [PlotId, ChartSpec][] = [
    ['line', lineSpec()],
    ['timeline', lineSpec({ kind: 'timeline', title: 'Net worth by age', x: ['age 30', 'age 31', 'age 32', 'age 33', 'age 34'] })],
    ['bars', barSpec()],
    ['stack', stackSpec()],
  ]

  for (const [id, spec] of cases) {
    it(`${id}: slider values, labelled and described by the frame's ids`, () => {
      const out = html(id, spec)
      const n = spec.x.length
      const tag = tagOf(out, /<div [^>]*class="ch-plot"[^>]*>/)
      expect(attrOf(tag, 'role')).toBe('slider')
      expect(attrOf(tag, 'tabindex')).toBe('0')
      expect(attrOf(tag, 'aria-valuemin')).toBe('0')
      expect(attrOf(tag, 'aria-valuemax')).toBe(String(n - 1))
      // Nobody has moved the cursor, so the slider rests on the last point and says what the readout says.
      expect(attrOf(tag, 'aria-valuenow')).toBe(String(n - 1))
      expect(attrOf(tag, 'aria-valuetext')).toBe(readoutFor(spec, n - 1))
      expect(attrOf(tag, 'aria-label')).toBe(spec.title)

      const labelled = attrOf(tag, 'aria-labelledby')!
      const described = attrOf(tag, 'aria-describedby')!
      expect(labelled).toBeTruthy()
      expect(described).toBeTruthy()
      expect(labelled).not.toBe(described)
      expect(out).toContain(`<h4 id="${labelled}" class="ch-title">${spec.title}</h4>`)
      expect(out).toContain(`<p id="${described}" class="ch-sr">${spec.summary}</p>`)
    })

    it(`${id}: the picture is hidden from assistive technology`, () => {
      const out = html(id, spec)
      const plotSvg = tagOf(out, /<svg [^>]*viewBox="0 0 320 180"[^>]*>/)
      expect(attrOf(plotSvg, 'aria-hidden')).toBe('true')
      expect(attrOf(plotSvg, 'focusable')).toBe('false')
      expect(plotSvg).not.toContain('role=')
    })

    it(`${id}: outside a frame it still has a name, and no id to point at`, () => {
      const out = html(id, spec, false)
      const tag = tagOf(out, /<div [^>]*class="ch-plot"[^>]*>/)
      expect(attrOf(tag, 'role')).toBe('slider')
      expect(attrOf(tag, 'aria-label')).toBe(spec.title)
      expect(attrOf(tag, 'aria-labelledby')).toBeNull()
      expect(attrOf(tag, 'aria-describedby')).toBeNull()
    })
  }

  it('line: viewBox 320 by 180 and a full-width box', () => {
    const out = html('line', lineSpec())
    expect(out).toContain('viewBox="0 0 320 180"')
    expect(out).toContain('style="width:100%"')
  })

  it('a slider with no points rests on 0, never on -1', () => {
    const empty = lineSpec({ x: [], series: [] })
    for (const id of ['line', 'bars', 'stack'] as const) {
      const tag = tagOf(html(id, empty), /<div [^>]*class="ch-plot"[^>]*>/)
      expect(attrOf(tag, 'aria-valuemin'), id).toBe('0')
      expect(attrOf(tag, 'aria-valuemax'), id).toBe('0')
      expect(attrOf(tag, 'aria-valuenow'), id).toBe('0')
    }
  })

  it('follows the cursor: the slider value and its text move with the scrub index', () => {
    const spec = lineSpec()
    for (const id of ['line', 'bars'] as const) {
      const tag = tagOf(activeHtml(id, id === 'bars' ? barSpec() : spec, 1), /<div [^>]*class="ch-plot"[^>]*>/)
      expect(attrOf(tag, 'aria-valuenow'), id).toBe('1')
      expect(attrOf(tag, 'aria-valuetext'), id).toBe(readoutFor(id === 'bars' ? barSpec() : spec, 1))
    }
  })

  it('waterfall: a focusable list named by the frame, one row for each step', () => {
    const spec = wfSpec(PL_STEPS)
    const out = html('waterfall', spec)
    const tag = tagOf(out, /<ol [^>]*>/)
    expect(attrOf(tag, 'class')).toBe('ch-wf')
    expect(attrOf(tag, 'tabindex')).toBe('0')
    expect(attrOf(tag, 'aria-label')).toBe(spec.summary)
    const labelled = attrOf(tag, 'aria-labelledby')!
    const described = attrOf(tag, 'aria-describedby')!
    expect(out).toContain(`<h4 id="${labelled}" class="ch-title">${spec.title}</h4>`)
    expect(out).toContain(`<p id="${described}" class="ch-sr">${spec.summary}</p>`)
    expect(tag).not.toContain('role=')
    expect(rowsOf(out)).toHaveLength(PL_STEPS.length)
  })

  it('waterfall: needs no scrub from its caller, and without a frame it has no ids', () => {
    const out = renderHtml(createElement(Waterfall, { spec: wfSpec(PL_STEPS) }))
    const tag = tagOf(out, /<ol [^>]*>/)
    expect(attrOf(tag, 'aria-label')).toContain('Net profit')
    expect(attrOf(tag, 'aria-labelledby')).toBeNull()
    expect(rowsOf(out)).toHaveLength(PL_STEPS.length)
  })
})

// ---------------------------------------------------------------------------
// 2. At most 150 drawing elements

describe('the plots stay small', () => {
  function six(points: number): ChartSpec {
    const tones = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'] as const
    return lineSpec({
      x: Array.from({ length: points }, (_, i) => 1990 + i),
      series: tones.map((tone, s) => ({
        id: `s${s}`,
        label: `Line ${s + 1}`,
        tone,
        values: Array.from({ length: points }, (_, i) => Math.round(1000 + s * 300 + 500 * Math.sin((i + s) / 4))),
      })),
    })
  }

  it('a 6-series by 64-point line is at most 150 elements, six of them paths for the series', () => {
    const spec = six(64)
    for (const out of [html('line', spec), activeHtml('line', spec, 30)]) {
      expect(countSvgNodes(out)).toBeLessThanOrEqual(150)
      expect(tagsWithClass(out, 'ch-lc-line')).toHaveLength(6)
      expect(count(out, /<svg\b/g)).toBeGreaterThanOrEqual(1)
    }
    expect(countSvgNodes(html('line', spec))).toBeLessThanOrEqual(80)
  })

  it('a 30-column by 6-series stack is at most 150 elements: one path for each series', () => {
    const spec = stackSpec(30, 6)
    for (const out of [html('stack', spec), activeHtml('stack', spec, 12)]) {
      expect(countSvgNodes(out)).toBeLessThanOrEqual(150)
      expect(tagsWithClass(out, 'ch-bc-series')).toHaveLength(6)
    }
  })

  it('a 64-column by 6-series stack is still at most 150 elements, and still six series paths', () => {
    const spec = stackSpec(64, 6)
    for (const out of [html('stack', spec), activeHtml('stack', spec, 63)]) {
      expect(countSvgNodes(out)).toBeLessThanOrEqual(150)
      expect(tagsWithClass(out, 'ch-bc-series')).toHaveLength(6)
    }
    // Grouped bars of the same shape are one path for each series as well.
    expect(tagsWithClass(html('bars', spec), 'ch-bc-series')).toHaveLength(6)
    expect(countSvgNodes(html('bars', spec))).toBeLessThanOrEqual(150)
  })

  it('a 20-step waterfall is at most 60 elements: one bar for each row, one picture for each row', () => {
    const steps: ChartStep[] = [{ label: 'Sales', value: 20_000, kind: 'total' }]
    for (let i = 1; i < 19; i++) steps.push({ label: `Cost ${i}`, value: i % 3 === 0 ? 150 : -900, kind: 'delta' })
    steps.push({ label: 'Net', value: 20_000 - 6_000, kind: 'total' })
    expect(steps).toHaveLength(20)
    const spec = wfSpec(steps)
    for (const out of [html('waterfall', spec), activeHtml('waterfall', spec, 7)]) {
      expect(countSvgNodes(out)).toBeLessThanOrEqual(60)
      expect(count(out, /<svg\b/g)).toBe(20)
      expect(count(out, /<rect\b/g)).toBe(20)
      expect(rowsOf(out)).toHaveLength(20)
    }
  })
})

// ---------------------------------------------------------------------------
// 3. No NaN, Infinity or undefined in the markup

function hostileSpecs(): [string, Partial<ChartSpec>][] {
  const one = (values: (number | null)[], x: (number | string)[] = values.map((_, i) => 2020 + i)): Partial<ChartSpec> => ({
    x,
    series: [{ id: 'a', label: 'A', tone: 'c1', values }],
  })
  return [
    ['no series', { series: [] }],
    ['no points', { x: [], series: [{ id: 'a', label: 'A', tone: 'c1', values: [] }] }],
    ['nothing at all', { x: [], series: [] }],
    ['one point', one([5])],
    ['one point at zero', one([0])],
    ['constant', one([7, 7, 7, 7])],
    ['zeros', one([0, 0, 0])],
    ['all nulls', one([null, null, null])],
    ['negative only', one([-5, -3, -9, -1])],
    ['1e15', one([1e15, -1e15, 5e14, 1e15])],
    ['tiny', one([1e-9, 2e-9, 1.5e-9])],
    ['raw NaN and infinity', one([NaN, Infinity, -Infinity, 3, NaN])],
    ['gaps', one([1, null, null, 4, null, 6])],
    ['values longer than x', { x: [1, 2], series: [{ id: 'a', label: 'A', tone: 'c1', values: [1, 2, 3, 4, 5] }] }],
    ['values shorter than x', { x: [1, 2, 3, 4], series: [{ id: 'a', label: 'A', tone: 'c1', values: [1, 2] }] }],
    ['x of strings', one([3, 5, 4], ['age 30', 'age 31', 'age 32'])],
    [
      'two series, one empty',
      {
        x: [1, 2, 3],
        series: [
          { id: 'a', label: 'A', tone: 'c1', values: [1, 2, 3] },
          { id: 'b', label: 'B', tone: 'c2', values: [null, null, null] },
        ],
      },
    ],
  ]
}

describe('no NaN, infinity or undefined in the markup', () => {
  const units: ChartUnit[] = ['money', 'pct', 'count', 'rank', 'years']

  for (const [name, over] of hostileSpecs()) {
    it(`line, bars and stack: ${name}`, () => {
      for (const unit of units) {
        for (const id of ['line', 'timeline', 'bars', 'stack'] as const) {
          const spec = lineSpec({ unit, ...over })
          const rested = html(id, spec)
          expect(rested, `${id} ${unit}`).not.toMatch(BAD)
          expect(countSvgNodes(rested), `${id} ${unit}`).toBeLessThanOrEqual(150)
          // A cursor anywhere, including where there is no point, must not break either.
          for (const at of [0, 2, 99, -1, NaN]) expect(activeHtml(id, spec, at), `${id} ${unit} cursor ${at}`).not.toMatch(BAD)
        }
      }
    })
  }

  const wfCases: [string, ChartStep[]][] = [
    ['no steps', []],
    ['one step', [{ label: 'Sales', value: 100, kind: 'total' }]],
    ['one delta', [{ label: 'Change', value: -100, kind: 'delta' }]],
    [
      'zeros',
      [
        { label: 'Sales', value: 0, kind: 'total' },
        { label: 'Cost', value: 0, kind: 'delta' },
        { label: 'Net', value: 0, kind: 'total' },
      ],
    ],
    [
      'negative only',
      [
        { label: 'Sales', value: -100, kind: 'total' },
        { label: 'Cost', value: -50, kind: 'delta' },
        { label: 'Net', value: -150, kind: 'total' },
      ],
    ],
    [
      '1e15',
      [
        { label: 'Sales', value: 1e15, kind: 'total' },
        { label: 'Cost', value: -1e15, kind: 'delta' },
        { label: 'Gain', value: 1e15, kind: 'delta' },
        { label: 'Net', value: 1e15, kind: 'total' },
      ],
    ],
    [
      'tiny',
      [
        { label: 'Sales', value: 1e-9, kind: 'total' },
        { label: 'Cost', value: -5e-10, kind: 'delta' },
        { label: 'Net', value: 5e-10, kind: 'total' },
      ],
    ],
    [
      'raw NaN and infinity',
      [
        { label: 'Sales', value: NaN, kind: 'total' },
        { label: 'Cost', value: Infinity, kind: 'delta' },
        { label: 'Gain', value: -Infinity, kind: 'delta' },
        { label: 'Net', value: 5, kind: 'total' },
      ],
    ],
    [
      'starts with deltas',
      [
        { label: 'Cost', value: -100, kind: 'delta' },
        { label: 'Gain', value: 40, kind: 'delta' },
      ],
    ],
  ]
  for (const [name, steps] of wfCases) {
    it(`waterfall: ${name}`, () => {
      for (const unit of units) {
        const spec = wfSpec(steps, { unit })
        expect(html('waterfall', spec), unit).not.toMatch(BAD)
        for (const at of [0, 1, 99, -1, NaN]) expect(activeHtml('waterfall', spec, at), `${unit} cursor ${at}`).not.toMatch(BAD)
      }
    })
  }
})

// ---------------------------------------------------------------------------
// 4. The waterfall

describe('Waterfall rows', () => {
  const spec = wfSpec(PL_STEPS)
  const out = html('waterfall', spec)
  const rows = rowsOf(out)

  const signOf = (row: string): string => /<span class="ch-wf-sign">([^<]*)<\/span>/.exec(row)![1]!
  const sentenceOf = (row: string): string => /<span class="ch-sr">([^<]*)<\/span>/.exec(row)![1]!
  const barOf = (row: string): { x: number; width: number; tag: string } => {
    const tag = tagOf(row, /<rect [^>]*>/)
    return { x: num(tag, 'x'), width: num(tag, 'width'), tag }
  }

  it('has one row for each step, in order', () => {
    expect(rows).toHaveLength(PL_STEPS.length)
    PL_STEPS.forEach((s, i) => expect(rows[i], s.label).toContain(s.label))
  })

  it('writes an ASCII sign for each row: = on the three totals, - on costs, + on a gain', () => {
    expect(rows.map(signOf)).toEqual(['=', '-', '-', '-', '-', '+', '=', '-', '='])
    for (const row of rows) expect(row).toMatch(/<span class="ch-wf-sign"[^>]*>[=+-]<\/span>/)
  })

  it('hides the visible line and the sign from assistive technology', () => {
    for (const row of rows) {
      const line = tagOf(row, /<span class="ch-wf-line"[^>]*>/)
      expect(attrOf(line, 'aria-hidden')).toBe('true')
      expect(attrOf(tagOf(row, /<svg [^>]*>/), 'aria-hidden')).toBe('true')
    }
  })

  it('writes every amount through the unit: totals plain, changes signed', () => {
    const amount = (row: string): string => /<span class="ch-wf-amt">([^<]*)<\/span>/.exec(row)![1]!
    expect(rows.map(amount)).toEqual(['$9.6M', '-$3.9M', '-$2.2M', '-$600K', '-$400K', '+$300K', '$2.8M', '-$600K', '$2.2M'])
  })

  it('has a visually hidden sentence on every row', () => {
    for (const row of rows) {
      expect(row).toMatch(/<span class="ch-sr">[^<]+<\/span>/)
      expect(sentenceOf(row)).toMatch(/^[A-Z]/)
      expect(sentenceOf(row)).not.toMatch(/[+=]|\$-/)
    }
    expect(sentenceOf(rows[0]!)).toBe('Sales after tax, $9.6M')
    expect(sentenceOf(rows[1]!)).toBe('Materials and direct costs, minus $3.9M, 41% of sales after tax')
    expect(sentenceOf(rows[2]!)).toBe('Wages, minus $2.2M, 23% of sales after tax')
    expect(sentenceOf(rows[5]!)).toBe('Other income, plus $300K, 3% of sales after tax')
    expect(sentenceOf(rows[6]!)).toBe('Profit before tax, $2.8M, 29% of sales after tax')
    expect(sentenceOf(rows[8]!)).toBe('Net profit, $2.2M, 23% of sales after tax')
  })

  it('draws the bars on one scale: the longest bar is the biggest level, and totals start at 0', () => {
    const bars = rows.map(barOf)
    const widths = bars.map((b) => b.width)
    expect(widths[0]).toBe(100)
    expect(Math.max(...widths)).toBe(widths[0])
    // Totals stand on the axis (the left edge when nothing is negative), in proportion to the first total.
    for (const i of [0, 6, 8]) expect(bars[i]!.x, PL_STEPS[i]!.label).toBe(0)
    expect(bars[6]!.width).toBeCloseTo((2_800_000 / 9_600_000) * 100, 1)
    expect(bars[8]!.width).toBeCloseTo((2_200_000 / 9_600_000) * 100, 1)
    // Each cost hangs from where the running level was: the bar ends on the level before it.
    let level = 9_600_000
    for (const i of [1, 2, 3, 4]) {
      const value = -PL_STEPS[i]!.value
      expect(bars[i]!.width, PL_STEPS[i]!.label).toBeCloseTo((value / 9_600_000) * 100, 1)
      expect(bars[i]!.x + bars[i]!.width, PL_STEPS[i]!.label).toBeCloseTo((level / 9_600_000) * 100, 1)
      level -= value
    }
    // A gain rises from the level it found: it starts there.
    expect(bars[5]!.x).toBeCloseTo((level / 9_600_000) * 100, 1)
    expect(bars[5]!.width).toBeCloseTo((300_000 / 9_600_000) * 100, 1)
    for (const row of rows) expect(tagOf(row, /<svg [^>]*>/)).toContain('viewBox="0 0 100 8"')
    for (const row of rows) expect(tagOf(row, /<svg [^>]*>/)).toContain('preserveAspectRatio="none"')
  })

  it('tints gains and totals above 0 good, costs and totals below 0 bad, and a total of 0 neutral', () => {
    const tone = (row: string): string => /ch-tone-([a-z0-9]+)/.exec(barOf(row).tag)![1]!
    expect(rows.map(tone)).toEqual(['good', 'bad', 'bad', 'bad', 'bad', 'good', 'good', 'bad', 'good'])
    const mixed = html(
      'waterfall',
      wfSpec([
        { label: 'Sales', value: 100, kind: 'total' },
        { label: 'Loss', value: -150, kind: 'delta' },
        { label: 'Result', value: -50, kind: 'total' },
        { label: 'Reset', value: 0, kind: 'total' },
      ]),
    )
    expect(rowsOf(mixed).map(tone)).toEqual(['good', 'bad', 'bad', 'c6'])
  })

  it('keeps a bar visible, however small', () => {
    const tiny = html(
      'waterfall',
      wfSpec([
        { label: 'Sales', value: 1_000_000, kind: 'total' },
        { label: 'Crumb', value: -1, kind: 'delta' },
        { label: 'Net', value: 999_999, kind: 'total' },
      ]),
    )
    for (const row of rowsOf(tiny)) expect(barOf(row).width).toBeGreaterThan(0)
  })

  it('starts a negative total at 0 and draws the zero line when the walk crosses it', () => {
    const loss = html(
      'waterfall',
      wfSpec([
        { label: 'Sales', value: 100, kind: 'total' },
        { label: 'Costs', value: -150, kind: 'delta' },
        { label: 'Result', value: -50, kind: 'total' },
      ]),
    )
    const r = rowsOf(loss)
    // The range is -50 to 100, so 0 sits a third of the way along.
    const zero = (100 / 150) * 0 + (50 / 150) * 100
    expect(barOf(r[0]!).x).toBeCloseTo(zero, 1)
    expect(barOf(r[0]!).width).toBeCloseTo(100 - zero, 1)
    expect(barOf(r[2]!).x).toBeCloseTo(0, 1)
    expect(barOf(r[2]!).x + barOf(r[2]!).width).toBeCloseTo(zero, 1)
    for (const row of r) {
      const line = tagOf(row, /<line [^>]*class="ch-wf-zero"[^>]*>/)
      expect(num(line, 'x1')).toBeCloseTo(zero, 1)
    }
    expect(r[2]).toContain('minus $50')
    // No zero line when nothing crosses it.
    expect(out).not.toContain('ch-wf-zero')
  })

  it('prints a mark as a small note under its row', () => {
    const marked = html('waterfall', wfSpec(PL_STEPS, { marks: [{ at: 4, label: 'Includes your $50K bonus' }, { at: 4, label: 'Second note' }] }))
    const r = rowsOf(marked)
    expect(r[4]).toContain('<span class="ch-wf-note">Includes your $50K bonus</span>')
    expect(r[4]).toContain('<span class="ch-wf-note">Second note</span>')
    expect(count(marked, /ch-wf-note/g)).toBe(2)
    for (const i of [0, 1, 2, 3, 5]) expect(r[i], String(i)).not.toContain('ch-wf-note')
    // A mark that is not on a row is left out.
    const stray = html('waterfall', wfSpec(PL_STEPS, { marks: [{ at: 99, label: 'Nowhere' }, { at: -1, label: 'Before' }, { at: 1.5, label: 'Between' }] }))
    expect(stray).not.toContain('ch-wf-note')
  })

  it('highlights the row under the cursor and shows the running total there', () => {
    expect(out).not.toContain('ch-wf-on')
    expect(out).not.toContain('ch-wf-run')
    expect(out).not.toContain('aria-current')

    const at = rowsOf(activeHtml('waterfall', spec, 2))
    const on = at.map((r, i) => (r.includes('ch-wf-on') ? i : -1)).filter((i) => i >= 0)
    expect(on).toEqual([2])
    expect(at[2]).toContain('aria-current="true"')
    expect(at[2]).toContain('<span class="ch-wf-run">Running total $3.5M</span>')
    expect(count(at.join(''), /ch-wf-run/g)).toBe(1)
    expect(count(at.join(''), /aria-current/g)).toBe(1)

    // On a total, the running total is the total.
    const total = rowsOf(activeHtml('waterfall', spec, 6))[6]!
    expect(total).toContain('Running total $2.8M')
    // A cursor that is not on a row highlights nothing.
    expect(activeHtml('waterfall', spec, 99)).not.toContain('ch-wf-on')
  })

  it('does not show a cursor that nobody placed, whatever index the scrub reports', () => {
    const plot = plotFor('waterfall', spec, fakeScrub(3, false))
    const markup = renderHtml(createElement(Frame, { spec, children: plot }))
    expect(markup).not.toContain('ch-wf-on')
  })

  it('says a total and a delta apart in a class as well, for the stylesheet', () => {
    expect(rows[0]).toContain('ch-wf-total')
    expect(rows[1]).toContain('ch-wf-delta')
  })
})

// ---------------------------------------------------------------------------
// 5. Stack percentages, rank axis, and the rest of the line chart

describe('BarChart', () => {
  const pctStack = (): ChartSpec =>
    stackSpec(6, 3, {
      unit: 'pct',
      title: 'Costs as a share of sales',
      series: [
        { id: 'a', label: 'Materials', tone: 'c1', values: [0.3, 0.32, 0.31, 0.33, 0.3, 0.28] },
        { id: 'b', label: 'People', tone: 'c2', values: [0.2, 0.22, 0.24, 0.22, 0.25, 0.26] },
        { id: 'c', label: 'Rent', tone: 'c3', values: [0.1, 0.1, 0.12, 0.1, 0.11, 0.1] },
      ],
    })

  it('draws a labelled reference line at 100% for a stack in percent, above every bar', () => {
    const out = html('stack', pctStack())
    const ref = tagOf(out, /<line [^>]*class="ch-ref"[^>]*>/)
    expect(out).toMatch(/<text [^>]*class="ch-ref-label"[^>]*>100% of sales<\/text>/)
    const zero = tagOf(out, /<line [^>]*class="ch-zero"[^>]*>/)
    expect(num(ref, 'y1')).toBeLessThan(num(zero, 'y1'))
    expect(num(ref, 'y1')).toBeGreaterThan(0)
    expect(num(ref, 'y1')).toBe(num(ref, 'y2'))
    // The top of the tallest column is below the line.
    const tops = [...tagOf(out, /<path [^>]*class="ch-bc-series[^"]*"[^>]*>/).matchAll(/M[\d.]+ ([\d.]+)H/g)].map((m) => Number(m[1]))
    expect(Math.min(...tops)).toBeGreaterThan(num(ref, 'y1'))
  })

  it('draws that line even when the stack is short of 100%', () => {
    const out = html('stack', pctStack())
    expect(count(out, /class="ch-ref"/g)).toBe(1)
  })

  it('has no such line for money, or for grouped bars in percent', () => {
    expect(html('stack', stackSpec())).not.toContain('ch-ref')
    expect(html('bars', pctStack())).not.toContain('ch-ref')
    expect(html('bars', pctStack())).not.toContain('100% of sales')
  })

  it('draws every column of a 30-year stack inside the plot, each one wide enough to see', () => {
    const out = html('stack', stackSpec(30, 6))
    const paths = tagsWithClass(out, 'ch-bc-series')
    expect(paths).toHaveLength(6)
    const rects = [...paths[0]!.matchAll(/M([\d.]+) ([\d.]+)H([\d.]+)V([\d.]+)H/g)].map((m) => ({ x: Number(m[1]), x2: Number(m[3]) }))
    expect(rects).toHaveLength(30)
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(44)
      expect(r.x2).toBeLessThanOrEqual(320)
      expect(r.x2 - r.x).toBeGreaterThanOrEqual(5)
    }
    // Columns do not touch.
    for (let i = 1; i < rects.length; i++) expect(rects[i]!.x - rects[i - 1]!.x2).toBeGreaterThanOrEqual(1.5)
  })

  it('puts negative values below the axis and positive ones above it', () => {
    const out = html('bars', barSpec())
    const zero = num(tagOf(out, /<line [^>]*class="ch-zero"[^>]*>/), 'y1')
    const d = attrOf(tagOf(out, /<path [^>]*class="ch-bc-series[^"]*"[^>]*>/), 'd')!
    const rects = [...d.matchAll(/M([\d.]+) ([\d.]+)H([\d.]+)V([\d.]+)H/g)].map((m) => ({ top: Number(m[2]), bottom: Number(m[4]) }))
    // Five columns, five rectangles: 2026 is the loss.
    expect(rects).toHaveLength(5)
    expect(rects[0]!.bottom).toBeCloseTo(zero, 1)
    expect(rects[0]!.top).toBeLessThan(zero)
    expect(rects[1]!.top).toBeCloseTo(zero, 1)
    expect(rects[1]!.bottom).toBeGreaterThan(zero)
    expect(rects[4]!.top).toBeLessThan(rects[3]!.top)
  })

  it('stacks the series of a stack on each other, and sets those of grouped bars side by side', () => {
    const two = stackSpec(3, 2, { series: [{ id: 'a', label: 'A', tone: 'c1', values: [100, 100, 100] }, { id: 'b', label: 'B', tone: 'c2', values: [100, 100, 100] }] })
    const stacked = html('stack', two)
    const [a, b] = tagsWithClass(stacked, 'ch-bc-series').map((t) => [...attrOf(t, 'd')!.matchAll(/M([\d.]+) ([\d.]+)H([\d.]+)V([\d.]+)H/g)].map((m) => ({ x: Number(m[1]), top: Number(m[2]), bottom: Number(m[4]) })))
    expect(a![0]!.x).toBe(b![0]!.x)
    expect(b![0]!.bottom).toBeCloseTo(a![0]!.top, 1)

    const grouped = html('bars', two)
    const [ga, gb] = tagsWithClass(grouped, 'ch-bc-series').map((t) => [...attrOf(t, 'd')!.matchAll(/M([\d.]+) ([\d.]+)H([\d.]+)V([\d.]+)H/g)].map((m) => ({ x: Number(m[1]), x2: Number(m[3]), top: Number(m[2]), bottom: Number(m[4]) })))
    expect(gb![0]!.x).toBeGreaterThanOrEqual(ga![0]!.x2 - 0.01)
    expect(gb![0]!.top).toBeCloseTo(ga![0]!.top, 1)
  })

  it('takes its kind from the spec unless told: a stack spec stacks, a bars spec groups', () => {
    const two = [{ id: 'a', label: 'A', tone: 'c1' as const, values: [100, 100] }, { id: 'b', label: 'B', tone: 'c2' as const, values: [100, 100] }]
    const byKind = (kind: 'bars' | 'stack', stacked?: boolean): string =>
      renderHtml(createElement(Frame, { spec: stackSpec(2, 2, { kind, series: two }), children: createElement(BarChart, { spec: stackSpec(2, 2, { kind, series: two }), scrub: fakeScrub(1, false), ...(stacked === undefined ? {} : { stacked }) }) }))
    expect(byKind('stack')).toEqual(byKind('stack', true))
    expect(byKind('bars')).toEqual(byKind('bars', false))
    expect(byKind('stack')).not.toEqual(byKind('bars'))
  })

  // The legend gives each series a marker shape; a band has no shape of its own, so the series that the legend names are
  // marked in the picture too, once at the right edge beside the band they have in the last column (the way a line ends
  // with its own marker). Without it the bands would be told apart by colour alone.
  describe('series markers', () => {
    const MARK_X = 316
    const MARK_R = 3
    const marks = (out: string): string[] => tagsWithClass(out, 'ch-bc-mk')
    const lastRects = (out: string): { top: number; bottom: number }[] =>
      tagsWithClass(out, 'ch-bc-series').map((t) => {
        const all = [...attrOf(t, 'd')!.matchAll(/M([\d.]+) ([\d.]+)H([\d.]+)V([\d.]+)H/g)]
        const last = all[all.length - 1]!
        return { top: Number(last[2]), bottom: Number(last[4]) }
      })

    it('draws one marker for each series of a stack, in the shape the legend gives it, beside its band', () => {
      const out = html('stack', stackSpec(30, 6))
      const found = marks(out)
      expect(found).toHaveLength(6)
      expect(found.map((t) => attrOf(t, 'data-shape'))).toEqual(['circle', 'square', 'triangle', 'diamond', 'cross', 'star'])
      expect(found.map((t) => /ch-tone-(c\d)/.exec(t)![1])).toEqual(['c1', 'c2', 'c3', 'c4', 'c5', 'c6'])
      const bands = lastRects(out)
      found.forEach((t, i) => {
        const mid = Math.round((bands[i]!.top + bands[i]!.bottom) / 2)
        expect(attrOf(t, 'd'), `series ${i}`).toBe(markerPath(MARKER_SHAPES[i]!, MARK_X, mid, MARK_R))
      })
    })

    it('keeps them at the right edge, outside the columns, and inside the picture', () => {
      const out = html('stack', stackSpec(30, 6))
      expect(marks(out)).toHaveLength(6)
      const columnsEnd = Math.max(...tagsWithClass(out, 'ch-bc-series').flatMap((t) => [...attrOf(t, 'd')!.matchAll(/H([\d.]+)V/g)].map((m) => Number(m[1]))))
      for (const t of marks(out)) {
        const xs = [...attrOf(t, 'd')!.matchAll(/[ML]([\d.]+) /g)].map((m) => Number(m[1]))
        expect(Math.min(...xs)).toBeGreaterThan(columnsEnd)
        expect(Math.max(...xs)).toBeLessThanOrEqual(320)
      }
    })

    it('does not follow the cursor: the bands change column, the markers stay with the last one', () => {
      const spec = stackSpec(10, 3)
      expect(marks(html('stack', spec))).toHaveLength(3)
      expect(marks(activeHtml('stack', spec, 2))).toEqual(marks(html('stack', spec)))
    })

    /** The y a marker was drawn at: the one that makes markerPath give its `d`. */
    function centreOf(tag: string): number {
      const shape = attrOf(tag, 'data-shape') as (typeof MARKER_SHAPES)[number]
      for (let y = 0; y <= 180; y += 0.5) if (markerPath(shape, MARK_X, y, MARK_R) === attrOf(tag, 'd')) return y
      throw new Error(`no centre for ${tag}`)
    }

    it('keeps thin bands apart, at least 8 px between two markers and inside the plot', () => {
      // The last column is a hair next to the first, so every band there is under a pixel tall.
      const tones = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'] as const
      const spec = stackSpec(4, 6, { series: tones.map((tone, s) => ({ id: `s${s}`, label: `Cost ${s + 1}`, tone, values: [1_000_000, 1_000_000, 1_000_000, 1 + s] })) })
      const ys = marks(html('stack', spec)).map(centreOf)
      expect(ys).toHaveLength(6)
      const sorted = [...ys].sort((a, b) => a - b)
      for (let i = 1; i < sorted.length; i++) expect(sorted[i]! - sorted[i - 1]!).toBeGreaterThanOrEqual(8)
      expect(sorted[0]!).toBeGreaterThanOrEqual(PLOT_TOP)
      expect(sorted[sorted.length - 1]!).toBeLessThanOrEqual(PLOT_BOTTOM)
    })

    it('marks only the series that have a bar in the last column', () => {
      const spec = stackSpec(5, 3, {
        series: [
          { id: 'a', label: 'A', tone: 'c1', values: [100, 100, 100, 100, 100] },
          { id: 'b', label: 'B', tone: 'c2', values: [100, 100, 100, 100, null] },
          { id: 'c', label: 'C', tone: 'c3', values: [100, 100, 100, 100, 100] },
        ],
      })
      const found = marks(html('stack', spec))
      expect(found.map((t) => attrOf(t, 'data-shape'))).toEqual(['circle', 'triangle'])
    })

    it('marks grouped bars of two series or more, and a lone series of bars not at all', () => {
      const two = stackSpec(6, 2, { kind: 'bars' })
      expect(marks(html('bars', two))).toHaveLength(2)
      expect(marks(html('bars', barSpec()))).toHaveLength(0)
      expect(marks(html('stack', stackSpec(6, 1)))).toHaveLength(1)
    })

    it('stays within 150 elements for 64 columns of 6 series, and draws no marker for no columns', () => {
      const big = stackSpec(64, 6)
      for (const out of [html('stack', big), activeHtml('stack', big, 63), html('bars', big)]) expect(countSvgNodes(out)).toBeLessThanOrEqual(150)
      expect(marks(html('stack', stackSpec(0, 3)))).toHaveLength(0)
    })
  })

  it('outlines the cursor column, and only when there is a cursor', () => {
    const spec = stackSpec(10, 2)
    expect(html('stack', spec)).not.toContain('ch-bc-cursor')
    const out = activeHtml('stack', spec, 3)
    const tag = tagOf(out, /<rect [^>]*class="ch-bc-cursor"[^>]*>/)
    expect(count(out, /ch-bc-cursor/g)).toBe(1)
    expect(num(tag, 'width')).toBeGreaterThan(0)
    expect(num(tag, 'height')).toBeGreaterThan(0)
    // Column 3 sits to the right of column 2.
    const at = (i: number): number => num(tagOf(activeHtml('stack', spec, i), /<rect [^>]*class="ch-bc-cursor"[^>]*>/), 'x')
    expect(at(3)).toBeGreaterThan(at(2))
    expect(at(0)).toBeLessThan(at(9))
  })

  it('labels the x axis at most six times, first and last included, and the y axis in the unit', () => {
    const out = html('stack', stackSpec(30, 2))
    const xs = tagsWithClass(out, 'ch-ax-x')
    expect(xs.length).toBeLessThanOrEqual(6)
    expect(xs.length).toBeGreaterThanOrEqual(2)
    const text = [...out.matchAll(/<text [^>]*class="ch-ax ch-ax-x"[^>]*>([^<]*)<\/text>/g)].map((m) => m[1])
    expect(text[0]).toBe('2000')
    expect(text[text.length - 1]).toBe('2029')
    const ys = [...out.matchAll(/<text [^>]*class="ch-ax ch-ax-y"[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]!)
    expect(ys.length).toBeGreaterThanOrEqual(2)
    expect(ys.length).toBeLessThanOrEqual(7)
    for (const label of ys) expect(label).toMatch(/^\$/)
  })

  it('says where a pointer lands: the inset centres the first and last columns', () => {
    const [left, right] = barInset(30)
    expect(left).toBeGreaterThan(44)
    expect(right).toBeGreaterThan(8)
    expect(left + right).toBeLessThan(320)
    for (const n of [0, 1, 2, 64, NaN]) {
      const [l, r] = barInset(n)
      expect(Number.isFinite(l) && Number.isFinite(r), String(n)).toBe(true)
      expect(l).toBeGreaterThanOrEqual(44)
      expect(r).toBeGreaterThanOrEqual(8)
    }
  })
})

describe('LineChart', () => {
  it('flips the axis for ranks: #1 at the top', () => {
    const rank = lineSpec({ unit: 'rank', series: [{ id: 'r', label: 'Your rank', tone: 'c1', values: [1, 3, 5] }], x: [2027, 2028, 2029] })
    const count_ = lineSpec({ unit: 'count', series: [{ id: 'r', label: 'Your rank', tone: 'c1', values: [1, 3, 5] }], x: [2027, 2028, 2029] })
    const ysOf = (spec: ChartSpec): number[] => {
      const d = attrOf(tagOf(html('line', spec), /<path [^>]*class="ch-lc-line[^"]*"[^>]*>/), 'd')!
      return [...d.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map((m) => Number(m[2]))
    }
    const r = ysOf(rank)
    const c = ysOf(count_)
    expect(r).toHaveLength(3)
    expect(r[0]!).toBeLessThan(r[2]!)
    expect(c[0]!).toBeGreaterThan(c[2]!)
    // The same points, mirrored.
    expect(r[0]!).toBeCloseTo(c[2]!, 1)
    expect(r[2]!).toBeCloseTo(c[0]!, 1)
  })

  it('labels a rank axis with whole places only', () => {
    const rank = lineSpec({ unit: 'rank', series: [{ id: 'r', label: 'Your rank', tone: 'c1', values: [2, 3, 2, 4] }], x: [1, 2, 3, 4] })
    const ys = [...html('line', rank).matchAll(/<text [^>]*class="ch-ax ch-ax-y"[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]!)
    expect(ys.length).toBeGreaterThanOrEqual(1)
    for (const label of ys) expect(label).toMatch(/^#\d+$/)
    // The end label reads as a place too.
    expect(html('line', rank)).toMatch(/class="ch-lc-end[^"]*"[^>]*>#4</)
  })

  it('draws one path for each series, a grid, and a zero line only when the range crosses 0', () => {
    const positive = html('line', lineSpec())
    expect(tagsWithClass(positive, 'ch-lc-line')).toHaveLength(2)
    expect(count(positive, /class="ch-grid"/g)).toBeGreaterThanOrEqual(2)
    expect(positive).not.toContain('ch-zero')
    const crossing = html('line', lineSpec({ series: [{ id: 'a', label: 'A', tone: 'c1', values: [-100, 50, 200, 80, -20] }] }))
    expect(count(crossing, /class="ch-zero"/g)).toBe(1)
    const allNegative = html('line', lineSpec({ series: [{ id: 'a', label: 'A', tone: 'c1', values: [-100, -50, -200, -80, -20] }] }))
    expect(allNegative).not.toContain('ch-zero')
  })

  it('takes its tone from the series and ends each line with its own marker shape', () => {
    const tones = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'] as const
    const spec = lineSpec({ series: tones.map((tone, i) => ({ id: `s${i}`, label: `S${i}`, tone, values: [i, i + 2, i + 5, i + 9, i * 30] })) })
    const out = html('line', spec)
    const lines = tagsWithClass(out, 'ch-lc-line')
    expect(lines.map((t) => /ch-tone-(c\d)/.exec(t)![1])).toEqual([...tones])
    const marks = tagsWithClass(out, 'ch-mk-end')
    expect(marks).toHaveLength(6)
    expect(marks.map((t) => attrOf(t, 'data-shape'))).toEqual(['circle', 'square', 'triangle', 'diamond', 'cross', 'star'])
    expect(new Set(marks.map((t) => attrOf(t, 'd'))).size).toBe(6)
  })

  it('draws the cursor as a vertical line with a marker on each series, only when there is one', () => {
    const spec = lineSpec()
    const rested = html('line', spec)
    expect(rested).not.toContain('ch-cursor')
    expect(rested).not.toContain('ch-mk-cur')
    const out = activeHtml('line', spec, 1)
    const cur = tagOf(out, /<line [^>]*class="ch-cursor"[^>]*>/)
    expect(count(out, /class="ch-cursor"/g)).toBe(1)
    expect(num(cur, 'x1')).toBe(num(cur, 'x2'))
    expect(tagsWithClass(out, 'ch-mk-cur')).toHaveLength(2)
    // The cursor moves right as the index grows, and stays inside the plot area.
    const x = (i: number): number => num(tagOf(activeHtml('line', spec, i), /<line [^>]*class="ch-cursor"[^>]*>/), 'x1')
    expect(x(0)).toBeCloseTo(LINE_INSET[0], 1)
    expect(x(4)).toBeCloseTo(320 - LINE_INSET[1], 1)
    expect(x(2)).toBeGreaterThan(x(1))
  })

  it('skips the cursor marker of a series that has a gap there', () => {
    const spec = lineSpec({
      series: [
        { id: 'a', label: 'A', tone: 'c1', values: [1, 2, 3, 4, 5] },
        { id: 'b', label: 'B', tone: 'c2', values: [1, null, 3, 4, 5] },
      ],
    })
    expect(tagsWithClass(activeHtml('line', spec, 1), 'ch-mk-cur')).toHaveLength(1)
    expect(tagsWithClass(activeHtml('line', spec, 2), 'ch-mk-cur')).toHaveLength(2)
  })

  it('breaks a line at a gap', () => {
    const gappy = lineSpec({ series: [{ id: 'a', label: 'A', tone: 'c1', values: [1, 2, null, 4, 5] }] })
    const d = attrOf(tagOf(html('line', gappy), /<path [^>]*class="ch-lc-line[^"]*"[^>]*>/), 'd')!
    expect(count(d, /M/g)).toBe(2)
    expect(count(d, /L/g)).toBe(2)
  })

  it('labels the x axis at most six times, first and last included', () => {
    const years = Array.from({ length: 40 }, (_, i) => 1990 + i)
    const spec = lineSpec({ x: years, series: [{ id: 'a', label: 'A', tone: 'c1', values: years.map((y) => y - 1900) }] })
    const out = html('line', spec)
    const text = [...out.matchAll(/<text [^>]*class="ch-ax ch-ax-x"[^>]*>([^<]*)<\/text>/g)].map((m) => m[1])
    expect(text.length).toBeLessThanOrEqual(6)
    expect(text[0]).toBe('1990')
    expect(text[text.length - 1]).toBe('2029')
    const two = lineSpec({ x: [2020, 2021], series: [{ id: 'a', label: 'A', tone: 'c1', values: [1, 2] }] })
    expect(count(html('line', two), /ch-ax-x/g)).toBe(2)
  })

  it('writes the y axis and the end labels in the unit', () => {
    const out = html('line', lineSpec())
    const ys = [...out.matchAll(/<text [^>]*class="ch-ax ch-ax-y"[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]!)
    expect(ys.length).toBeGreaterThanOrEqual(2)
    expect(ys.length).toBeLessThanOrEqual(7)
    for (const label of ys) expect(label).toMatch(/^\$[\d.]+[KM]?$/)
    const ends = [...out.matchAll(/<text [^>]*class="ch-lc-end[^"]*"[^>]*>([^<]*)<\/text>/g)].map((m) => m[1])
    expect(ends).toEqual(['$1.2M', '$2.0M'])
    const pct = html('line', lineSpec({ unit: 'pct', series: [{ id: 'a', label: 'A', tone: 'c1', values: [0.1, 0.2, 0.35] }], x: [1, 2, 3] }))
    expect(pct).toMatch(/class="ch-lc-end[^"]*"[^>]*>35%</)
  })

  it('reads round in the currency: yen ticks are chosen in yen', () => {
    setMoneyDisplay({ mode: 'local', nominal: false })
    const g = makeTestGame(1, { countryId: 'jp' })
    g.year = 2026
    bindMoneyContext(g)
    expect(moneyScale()).toBeGreaterThan(50)
    const spec = lineSpec({ series: [{ id: 'a', label: 'A', tone: 'c1', values: [0, 200_000, 500_000, 800_000, 1_000_000] }] })
    const out = html('line', spec)
    expect(out).not.toMatch(BAD)
    const grid = tagsWithClass(out, 'ch-grid')
    const labels = [...out.matchAll(/<text [^>]*class="ch-ax ch-ax-y"[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]!)
    expect(labels.length).toBe(grid.length)
    expect(labels.length).toBeGreaterThanOrEqual(3)
    // A label such as ¥150M, in yen.
    const yen = labels.map((l) => {
      const m = /^¥([\d.]+)([KMB]?)$/.exec(l)
      expect(m, l).not.toBeNull()
      return Number(m![1]) * ({ '': 1, K: 1e3, M: 1e6, B: 1e9 } as Record<string, number>)[m![2]!]!
    })
    // Evenly spaced, and the step is 1, 2 or 5 times a power of ten in yen, so the axis counts in round yen.
    const step = yen[1]! - yen[0]!
    for (let i = 1; i < yen.length; i++) expect(yen[i]! - yen[i - 1]!).toBeCloseTo(step, -2)
    const mantissa = step / 10 ** Math.floor(Math.log10(step) + 1e-9)
    expect([1, 2, 5]).toContain(Math.round(mantissa * 1000) / 1000)
    // In dollars that step is not a round number: the currency scale is what made the yen axis round.
    const dollars = step / moneyScale()
    expect([1, 2, 5]).not.toContain(Math.round((dollars / 10 ** Math.floor(Math.log10(dollars) + 1e-9)) * 1000) / 1000)
  })

  it('keeps two lines that end together apart: end labels at least 12 px from each other', () => {
    const values = (end: number): number[] => [0, 40, 70, 90, end]
    const spec = lineSpec({
      unit: 'count',
      series: [
        { id: 'a', label: 'A', tone: 'c1', values: values(100) },
        { id: 'b', label: 'B', tone: 'c2', values: values(100.5) },
      ],
    })
    const ys = (markup: string): number[] => tagsWithClass(markup, 'ch-lc-end').map((t) => num(t, 'y'))
    const placed = ys(html('line', spec))
    expect(placed).toHaveLength(2)
    expect(Math.abs(placed[0]! - placed[1]!)).toBeGreaterThanOrEqual(12)
    // The lines themselves end within 3 px of each other.
    const endY = (i: number): number => {
      const d = attrOf(tagsWithClass(html('line', spec), 'ch-lc-line')[i]!, 'd')!
      return Number([...d.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].pop()![2])
    }
    expect(Math.abs(endY(0) - endY(1))).toBeLessThan(3)
    // Each label stays inside the picture.
    for (const y of placed) {
      expect(y).toBeGreaterThan(0)
      expect(y).toBeLessThan(180)
    }
  })

  it('keeps six lines that end together apart, in the order they end', () => {
    const tones = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'] as const
    const spec = lineSpec({
      unit: 'count',
      series: tones.map((tone, i) => ({ id: `s${i}`, label: `S${i}`, tone, values: [0, 10, 20, 30, 50 + i * 0.1] })),
    })
    const ys = tagsWithClass(html('line', spec), 'ch-lc-end').map((t) => num(t, 'y'))
    expect(ys).toHaveLength(6)
    const sorted = [...ys].sort((a, b) => a - b)
    for (let i = 1; i < sorted.length; i++) expect(sorted[i]! - sorted[i - 1]!).toBeGreaterThanOrEqual(12)
    // The highest value is the highest on the page (the smallest y), as the lines are.
    expect(ys[5]!).toBe(sorted[0])
    for (const y of ys) {
      expect(y).toBeGreaterThan(0)
      expect(y).toBeLessThan(180)
    }
  })

  it('leaves labels that already fit where the lines end', () => {
    const spec = lineSpec({
      unit: 'count',
      series: [
        { id: 'a', label: 'A', tone: 'c1', values: [0, 10, 20, 30, 100] },
        { id: 'b', label: 'B', tone: 'c2', values: [0, 10, 20, 30, 10] },
      ],
    })
    const out = html('line', spec)
    const labels = tagsWithClass(out, 'ch-lc-end').map((t) => num(t, 'y'))
    const ends = tagsWithClass(out, 'ch-lc-line').map((t) => Number([...attrOf(t, 'd')!.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].pop()![2]))
    expect(labels).toHaveLength(2)
    // The label sits 3.5 px below the line's end (so its middle is on it), to the nearest whole pixel.
    labels.forEach((y, i) => expect(Math.abs(y - 3.5 - ends[i]!)).toBeLessThanOrEqual(0.5))
  })

  it('gives a line with no real point no end label and no marker', () => {
    const out = html('line', lineSpec({ series: [{ id: 'a', label: 'A', tone: 'c1', values: [null, null, null, null, null] }] }))
    expect(out).not.toContain('ch-lc-end')
    expect(out).not.toContain('ch-mk')
  })

  it('has a pointer inset that matches its margins', () => {
    expect(LINE_INSET).toEqual([44, 56])
  })

  it('animates nothing in the markup: no animate element, no inline animation', () => {
    const out = html('line', lineSpec())
    expect(out).not.toMatch(/<animate|<set |animation/)
  })
})

// ---------------------------------------------------------------------------
// 7. Frozen props

describe('frozen specs', () => {
  const cases: [PlotId, () => ChartSpec][] = [
    ['line', lineSpec],
    ['timeline', () => lineSpec({ kind: 'timeline' })],
    ['bars', barSpec],
    ['stack', () => stackSpec(12, 4)],
    ['stack', () => stackSpec(6, 3, { unit: 'pct' })],
    ['waterfall', () => wfSpec(PL_STEPS, { marks: [{ at: 1, label: 'A note' }] })],
  ]
  cases.forEach(([id, make], i) => {
    it(`${id} #${i} renders from a deep-frozen spec, the same as from a plain one`, () => {
      const frozen = deepFreeze(make())
      const plain = make()
      expect(html(id, frozen)).toBe(html(id, plain))
      expect(activeHtml(id, frozen, 1)).toBe(activeHtml(id, plain, 1))
      // The spec is still what it was.
      expect(frozen).toEqual(plain)
    })
  })
})

// ---------------------------------------------------------------------------
// Text and style

describe('text and style', () => {
  const rendered = [
    html('line', lineSpec()),
    html('bars', barSpec()),
    html('stack', stackSpec(6, 3, { unit: 'pct' })),
    html('waterfall', wfSpec(PL_STEPS, { marks: [{ at: 1, label: 'Includes your bonus' }] })),
    activeHtml('waterfall', wfSpec(PL_STEPS), 3),
    activeHtml('line', lineSpec(), 2),
  ]

  it('has no en-dash or em-dash character in any markup', () => {
    for (const out of rendered) expect(DASHES.test(out)).toBe(false)
  })

  it('has no inline colour: every colour comes from a class and the tokens', () => {
    for (const out of rendered) {
      expect(out).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(out).not.toMatch(/\b(?:fill|stroke|color)="(?!none|currentColor)/)
    }
  })

  it('appends its rules to charts.css with colours from tokens only', () => {
    const css = readFileSync(new URL('../src/ui/charts/charts.css', import.meta.url), 'utf8')
    for (const cls of ['.ch-plot', '.ch-wf', '.ch-wf-row', '.ch-lc-line', '.ch-bc-series', '.ch-cursor', '.ch-ref']) expect(css, cls).toContain(cls)
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(DASHES.test(css)).toBe(false)
    // The line draw is the only animation, and only without a reduced-motion request.
    expect(css).toMatch(/prefers-reduced-motion:\s*no-preference/)
    expect(css).not.toMatch(/prefers-reduced-motion:\s*reduce/)
  })
})
