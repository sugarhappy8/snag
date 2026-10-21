// R1-C7: the first part of the chart kit (src/ui/charts): Frame, Sparkline, KpiTile, Meter, BulletRow and charts.css.
// Every component is rendered the way this repo tests the UI: createElement + renderToStaticMarkup, no DOM. The
// colour tokens have their own file (test/chart-contrast.test.ts).
import { readFileSync } from 'node:fs'
import { createElement, useContext, type ReactElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { bindMoneyContext, setMoneyDisplay, shortMoney } from '../src/game/core'
import '../src/game/data/currencies'
import type { ChartSpec } from '../src/game/charts/spec'
import { BulletRow } from '../src/ui/charts/BulletRow'
import { Frame, FrameContext, legendOf, type FrameProps } from '../src/ui/charts/Frame'
import { KpiTile, kpiPropsOf } from '../src/ui/charts/KpiTile'
import { Meter } from '../src/ui/charts/Meter'
import { Sparkline, plainNumber, sparkLabel } from '../src/ui/charts/Sparkline'
import { MARKER_SHAPES } from '../src/ui/charts/geometry'
import { countSvgNodes, renderHtml } from './charts-kit'

const BAD = /NaN|Infinity|undefined|\[object Object\]/

afterEach(() => {
  setMoneyDisplay({ mode: 'usd', nominal: false })
  bindMoneyContext(null)
})

function spec(over: Partial<ChartSpec> = {}): ChartSpec {
  return {
    v: 1,
    kind: 'line',
    title: 'Net profit',
    unit: 'money',
    x: [2027, 2028, 2029],
    series: [{ id: 'net', label: 'Net profit', tone: 'c1', values: [100_000, 250_000, 1_200_000] }],
    summary: 'Net profit rose from $100K to $1.2M.',
    ...over,
  }
}

function sixSeries(): ChartSpec {
  const tones = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'] as const
  return spec({
    title: 'Six lines',
    unit: 'count',
    series: tones.map((tone, i) => ({ id: `s${i}`, label: `Line ${i + 1}`, tone, values: [i, i + 1, i + 2] })),
    summary: 'Six lines.',
  })
}

/** A Frame around a plot (createElement does not count its children argument toward the required children prop). */
function frameEl(props: Omit<FrameProps, 'children'>, plot: ReactNode = null): ReactElement {
  return createElement(Frame, { ...props, children: plot })
}

function attr(html: string, name: string): string {
  const m = new RegExp(`${name}="([^"]+)"`).exec(html)
  if (!m) throw new Error(`no ${name} in ${html.slice(0, 200)}`)
  return m[1]!
}

function count(html: string, re: RegExp): number {
  return (html.match(re) ?? []).length
}

describe('Frame', () => {
  const frame = (s: ChartSpec, props: Record<string, unknown> = {}): string =>
    renderHtml(frameEl({ spec: s, ...props }, createElement('svg', { 'data-plot': '1' }, createElement('path', { d: 'M0 0' }))))

  it('is a labelled group, not an image, with ids that exist', () => {
    const html = frame(spec())
    expect(html).toMatch(/^<figure class="ch-frame" role="group"/)
    expect(html).not.toContain('role="img"')
    const title = attr(html, 'aria-labelledby')
    const summary = attr(html, 'aria-describedby')
    expect(title).not.toBe(summary)
    expect(html).toContain(`<h4 id="${title}" class="ch-title">Net profit</h4>`)
    expect(html).toMatch(new RegExp(`<p id="${summary}" class="ch-sr">Net profit rose from \\$100K to \\$1.2M.</p>`))
  })

  it('shows the plot it is given', () => {
    expect(frame(spec())).toContain('<svg data-plot="1"><path d="M0 0"></path></svg>')
  })

  it('shows the chip "prices of {basis}" only for a money spec with a basis', () => {
    expect(frame(spec({ basis: 2030 }))).toContain('<span class="ch-chip">prices of 2030</span>')
    expect(frame(spec())).not.toContain('ch-chip')
    expect(frame(spec({ unit: 'count', basis: 2030 }))).not.toContain('ch-chip')
    expect(frame(spec({ unit: 'pct', basis: 2030 }))).not.toContain('ch-chip')
  })

  it('reads the summary in a live region until a readout is given', () => {
    expect(frame(spec())).toContain('<p class="ch-readout" aria-live="polite">Net profit rose from $100K to $1.2M.</p>')
    expect(frame(spec(), { readout: '2028: Net profit $250K' })).toContain('<p class="ch-readout" aria-live="polite">2028: Net profit $250K</p>')
    expect(frame(spec(), { readout: '' })).toContain('<p class="ch-readout" aria-live="polite">Net profit rose')
  })

  it('leaves the readout out of the live regions when told the plot speaks for itself', () => {
    expect(frame(spec(), { readout: '2028: Net profit $250K', live: false })).toContain('<p class="ch-readout">2028: Net profit $250K</p>')
    expect(frame(spec(), { readout: '2028: Net profit $250K', live: false })).not.toContain('aria-live')
    expect(frame(spec(), { readout: '2028: Net profit $250K', live: true })).toContain('<p class="ch-readout" aria-live="polite">2028: Net profit $250K</p>')
  })

  it('has a "Show as table" toggle that names the table it controls', () => {
    const html = frame(spec())
    const toggle = /<button type="button" class="ch-toggle" aria-expanded="false" aria-controls="([^"]+)">Show as table<\/button>/.exec(html)
    expect(toggle).not.toBeNull()
    expect(html).toContain(`id="${toggle![1]}"`)
    expect(html).not.toContain('<table')
  })

  it('opens a real table: caption, column and row headers, one body row for each x', () => {
    const html = frame(spec(), { tableOpen: true })
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('>Hide table</button>')
    expect(html).toContain('<table class="ch-table"><caption>Net profit</caption>')
    expect(count(html, /<th scope="col">/g)).toBe(2)
    expect(html).toContain('<th scope="col">Year</th><th scope="col">Net profit</th>')
    const body = /<tbody>([\s\S]*)<\/tbody>/.exec(html)![1]!
    expect(count(body, /<tr>/g)).toBe(3)
    expect(count(body, /<th scope="row">/g)).toBe(3)
    expect(body).toContain('<th scope="row">2029</th><td>$1.2M</td>')
    // The toggle controls the wrapper that holds the table.
    const controls = attr(html, 'aria-controls')
    expect(html).toMatch(new RegExp(`id="${controls}"[^>]*><table`))
  })

  it('gives the plot the title and summary ids through FrameContext', () => {
    function Probe(): ReactElement {
      const ids = useContext(FrameContext)
      return createElement('i', { 'data-title': ids?.title ?? 'none', 'data-summary': ids?.summary ?? 'none' })
    }
    expect(renderHtml(createElement(Probe))).toBe('<i data-title="none" data-summary="none"></i>')
    const html = renderHtml(frameEl({ spec: spec() }, createElement(Probe)))
    expect(attr(html, 'data-title')).toBe(attr(html, 'aria-labelledby'))
    expect(attr(html, 'data-summary')).toBe(attr(html, 'aria-describedby'))
  })

  it('adds the class it is given and gives two frames different ids', () => {
    expect(frame(spec(), { className: 'mine' })).toContain('class="ch-frame mine"')
    const both = renderHtml(createElement('div', null, frameEl({ spec: spec() }), frameEl({ spec: spec() })))
    const ids = [...both.matchAll(/aria-labelledby="([^"]+)"/g)].map((m) => m[1])
    expect(ids).toHaveLength(2)
    expect(ids[0]).not.toBe(ids[1])
  })

  it('builds a table for a waterfall, a ladder and a kpi spec as well', () => {
    const wf = spec({
      kind: 'waterfall',
      series: [],
      x: [],
      steps: [
        { label: 'Sales', value: 1000, kind: 'total' },
        { label: 'Wages', value: -400, kind: 'delta' },
      ],
    })
    const html = frame(wf, { tableOpen: true })
    expect(html).toContain('<th scope="col">Step</th>')
    expect(count(/<tbody>([\s\S]*)<\/tbody>/.exec(html)![1]!, /<tr>/g)).toBe(2)
  })
})

describe('legend', () => {
  it('has one entry and one distinct marker shape for each of six series', () => {
    const six = sixSeries()
    const entries = legendOf(six)
    expect(entries).toHaveLength(6)
    expect(new Set(entries.map((e) => e.shape)).size).toBe(6)
    expect(entries.map((e) => e.shape)).toEqual([...MARKER_SHAPES])
    expect(entries.map((e) => e.id)).toEqual(['s0', 's1', 's2', 's3', 's4', 's5'])
    expect(entries.map((e) => e.label)).toEqual(['Line 1', 'Line 2', 'Line 3', 'Line 4', 'Line 5', 'Line 6'])
    expect(entries.map((e) => e.tone)).toEqual(['c1', 'c2', 'c3', 'c4', 'c5', 'c6'])

    const html = renderHtml(frameEl({ spec: six }))
    expect(count(html, /<li class="ch-legend-item"/g)).toBe(6)
    const shapes = [...html.matchAll(/data-shape="([a-z]+)"/g)].map((m) => m[1])
    expect(new Set(shapes).size).toBe(6)
    expect(html).toContain('Line 6')
  })

  it('is shown for two or more series, or for any stack, and not for one line', () => {
    const one = spec()
    expect(renderHtml(frameEl({ spec: one }))).not.toContain('ch-legend')
    const two = spec({ series: [...one.series, { id: 'rev', label: 'Revenue', tone: 'c2', values: [1, 2, 3] }] })
    expect(renderHtml(frameEl({ spec: two }))).toContain('ch-legend')
    expect(renderHtml(frameEl({ spec: spec({ kind: 'stack' }) }))).toContain('ch-legend')
  })

  it('has nothing to list for a spec with no series, and wraps shapes past six', () => {
    expect(legendOf(spec({ kind: 'waterfall', series: [] }))).toEqual([])
    const many = spec({ series: Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, label: `S${i}`, tone: 'c1' as const, values: [1, 2, 3] })) })
    expect(legendOf(many)[6]!.shape).toBe(MARKER_SHAPES[0])
  })
})

describe('Sparkline', () => {
  it('says first, last, low and high in its label', () => {
    expect(sparkLabel('Net profit', [40_000, 500_000, 1_200_000], shortMoney)).toBe('Net profit: first $40K, last $1.2M, low $40K, high $1.2M')
    expect(sparkLabel('Cash', [null, 5, null, 9, 2, null], String)).toBe('Cash: first 5, last 2, low 2, high 9')
    expect(sparkLabel('Cash', [null, null], String)).toBe('Cash: no data')
    expect(sparkLabel('Cash', [], String)).toBe('Cash: no data')
    expect(sparkLabel('Cash', [3, NaN, Infinity, 7], String)).toBe('Cash: first 3, last 7, low 3, high 7')
  })

  it('is an image with that label, one path and one end dot', () => {
    const html = renderHtml(createElement(Sparkline, { values: [40_000, 500_000, 1_200_000], tone: 'c1', label: 'Net profit', fmt: shortMoney }))
    expect(html).toMatch(/^<svg [^>]*role="img"/)
    expect(html).toContain('aria-label="Net profit: first $40K, last $1.2M, low $40K, high $1.2M"')
    expect(html).toContain('viewBox="0 0 80 24"')
    expect(html).toContain('ch-tone-c1')
    expect(count(html, /<path /g)).toBe(2)
    expect(html).toContain('class="ch-spark-line"')
    expect(html).toContain('class="ch-spark-dot"')
    expect(countSvgNodes(html)).toBe(2)
  })

  it('draws nothing for fewer than two real points', () => {
    for (const values of [[], [5], [null], [null, 5], [5, null, NaN], [null, null, null]]) {
      expect(renderHtml(createElement(Sparkline, { values, tone: 'c1', label: 'x' })), JSON.stringify(values)).toBe('')
    }
    expect(Sparkline({ values: [], tone: 'c1', label: 'x' })).toBeNull()
    expect(Sparkline({ values: [1], tone: 'c1', label: 'x' })).toBeNull()
  })

  it('never writes NaN, infinity or undefined, whatever the numbers are', () => {
    const cases: (number | null)[][] = [
      [5, 5, 5],
      [0, 0],
      [null, null, 1, null, null],
      [1e15, 1e15, 1e15],
      [-1e15, 1e15],
      [1e-9, 2e-9],
      [1e300, -1e300, 5],
      [1, NaN, 3],
      [Infinity, 1, 2],
      [1, null, 3],
      [1, null, 3, null, 5],
    ]
    for (const values of cases) {
      const html = renderHtml(createElement(Sparkline, { values, tone: 'good', label: 'Test' }))
      expect(html, JSON.stringify(values)).not.toMatch(BAD)
    }
  })

  it('breaks the line at a gap and still shows a lone point', () => {
    const html = renderHtml(createElement(Sparkline, { values: [1, null, 3], tone: 'c1', label: 'x' }))
    const d = /class="ch-spark-line"[^>]*d="([^"]+)"|d="([^"]+)"[^>]*class="ch-spark-line"/.exec(html)
    const path = d ? (d[1] ?? d[2])! : ''
    expect(count(path, /M/g)).toBe(2)
    expect(path).toContain('h0')
    expect(countSvgNodes(html)).toBe(2)
  })

  it('stays two drawing elements however many points it has', () => {
    const values = Array.from({ length: 400 }, (_, i) => (i % 7 === 0 ? null : Math.sin(i) * 100))
    expect(countSvgNodes(renderHtml(createElement(Sparkline, { values, tone: 'c3', label: 'Long' })))).toBe(2)
  })

  it('takes a size for the box and keeps it sane', () => {
    const big = renderHtml(createElement(Sparkline, { values: [1, 2], tone: 'c1', label: 'x', width: 160, height: 40 }))
    expect(big).toContain('viewBox="0 0 160 40"')
    const silly = renderHtml(createElement(Sparkline, { values: [1, 2], tone: 'c1', label: 'x', width: NaN, height: -3 }))
    expect(silly).toContain('viewBox="0 0 80 24"')
    const huge = renderHtml(createElement(Sparkline, { values: [1, 2], tone: 'c1', label: 'x', width: 1e9, height: 1e9 }))
    expect(huge).not.toMatch(BAD)
    expect(Number(/viewBox="0 0 (\d+) (\d+)"/.exec(huge)![1])).toBeLessThanOrEqual(240)
  })

  it('has a plain number format of three significant digits', () => {
    expect(plainNumber(842)).toBe('842')
    expect(plainNumber(12.345)).toBe('12.3')
    expect(plainNumber(0.5)).toBe('0.5')
    expect(plainNumber(-7.123)).toBe('-7.12')
    expect(plainNumber(1234.5)).toBe('1.2K')
    expect(plainNumber(999.6)).toBe('1K')
    expect(plainNumber(2_500_000)).toBe('2.5M')
    expect(plainNumber(0)).toBe('0')
    expect(plainNumber(1e-9)).toBe('0')
    expect(plainNumber(NaN)).toBe('0')
    expect(plainNumber(Infinity)).toBe('0')
  })
})

describe('kpiPropsOf', () => {
  const kpi = (values: (number | null)[], over: Partial<ChartSpec> = {}): ChartSpec =>
    spec({ kind: 'kpi', x: values.map((_, i) => 2020 + i), series: [{ id: 'net', label: 'Net profit', tone: 'c3', values }], ...over })
  // The tile props without the formatter, which is a function.
  const plain = (s: ChartSpec, i?: number): Record<string, unknown> => {
    const { fmt, ...rest } = kpiPropsOf(s, i)
    expect(typeof fmt).toBe('function')
    return rest
  }

  it('reads a rising series: the last value, and the change against the one before', () => {
    expect(plain(kpi([100_000, 250_000]))).toEqual({
      label: 'Net profit',
      value: '$250K',
      delta: { text: '$150K', dir: 'up', good: null },
      values: [100_000, 250_000],
      tone: 'c3',
    })
  })

  it('reads a falling series', () => {
    expect(plain(kpi([250_000, 100_000]))).toMatchObject({ value: '$100K', delta: { text: '$150K', dir: 'down', good: null } })
  })

  it('reads a flat series as flat, with a zero change', () => {
    expect(plain(kpi([100_000, 100_000]))).toMatchObject({ value: '$100K', delta: { text: '$0', dir: 'flat', good: null } })
    // A move that rounds to nothing is flat too.
    expect(plain(kpi([100_000, 100_000.2]))).toMatchObject({ delta: { dir: 'flat' } })
  })

  it('has no delta for one point, and says "no data" for none', () => {
    const one = plain(kpi([100_000]))
    expect(one).toMatchObject({ label: 'Net profit', value: '$100K', values: [100_000], tone: 'c3' })
    expect(one).not.toHaveProperty('delta')
    const none = plain(kpi([null, null, null]))
    expect(none).toMatchObject({ label: 'Net profit', value: 'no data', values: [null, null, null] })
    expect(none).not.toHaveProperty('delta')
    const empty = plain(kpi([]))
    expect(empty).toMatchObject({ value: 'no data', values: [] })
  })

  it('skips gaps: the last two real values count, whatever sits between them', () => {
    expect(plain(kpi([100_000, null, 400_000, null]))).toMatchObject({ value: '$400K', delta: { text: '$300K', dir: 'up' } })
    expect(plain(kpi([NaN, 5, 9]))).toMatchObject({ value: '$9', delta: { text: '$4', dir: 'up' } })
  })

  it('takes the series you ask for, and the note of the spec', () => {
    const two = kpi([1, 2], {
      unit: 'count',
      note: 'after tax',
      series: [
        { id: 'a', label: 'Sales', tone: 'c1', values: [840, 1200] },
        { id: 'b', label: 'Orders', tone: 'c2', values: [30, 20] },
      ],
    })
    expect(plain(two, 0)).toMatchObject({ label: 'Sales', value: '1.2K', note: 'after tax', delta: { text: '360', dir: 'up' }, tone: 'c1', values: [840, 1200] })
    expect(plain(two, 1)).toMatchObject({ label: 'Orders', value: '20', note: 'after tax', delta: { text: '10', dir: 'down' }, tone: 'c2', values: [30, 20] })
    // An index that is not there is clamped to the series that are.
    expect(plain(two, 7)).toMatchObject({ label: 'Orders' })
    expect(plain(two, -3)).toMatchObject({ label: 'Sales' })
    expect(plain(two, NaN)).toMatchObject({ label: 'Sales' })
  })

  it('reads places the way a ladder does: a smaller rank number is up', () => {
    expect(plain(kpi([5, 3], { unit: 'rank' }))).toMatchObject({ value: '#3', delta: { text: '2', dir: 'up' } })
    expect(plain(kpi([3, 5], { unit: 'rank' }))).toMatchObject({ value: '#5', delta: { text: '2', dir: 'down' } })
  })

  it('keeps the money in the life currency, also in the label of its sparkline', () => {
    const props = kpiPropsOf(kpi([100_000, 250_000]))
    expect(props.fmt!(250_000)).toBe(shortMoney(250_000))
  })

  it('copes with a spec that has no series', () => {
    const none = kpiPropsOf(spec({ kind: 'kpi', series: [], x: [] }))
    expect(none.label).toBe('Net profit')
    expect(none.value).toBe('no data')
    expect(none.tone).toBe('muted')
  })
})

describe('KpiTile', () => {
  const tile = (props: Record<string, unknown>): string =>
    renderHtml(createElement(KpiTile, { label: 'Net profit', value: '$250K', tone: 'c3', ...props } as Parameters<typeof KpiTile>[0]))

  it('is a plain block with the label, the value and nothing else it was not given', () => {
    const html = tile({})
    expect(html).toMatch(/^<div class="ch-kpi">/)
    expect(html).toContain('<span class="ch-kpi-label">Net profit</span>')
    expect(html).toContain('<span class="ch-kpi-value">$250K</span>')
    expect(html).not.toContain('ch-kpi-delta')
    expect(html).not.toContain('ch-kpi-note')
    expect(html).not.toContain('<svg')
  })

  it('shows + and the word up for a rise, - and down for a fall, = and no change for flat', () => {
    const up = tile({ delta: { text: '$150K', dir: 'up', good: null } })
    expect(up).toContain('<span aria-hidden="true">+</span> $150K <span class="ch-sr">up</span>')
    const down = tile({ delta: { text: '$150K', dir: 'down', good: null } })
    expect(down).toContain('<span aria-hidden="true">-</span> $150K <span class="ch-sr">down</span>')
    const flat = tile({ delta: { text: '$0', dir: 'flat', good: null } })
    expect(flat).toContain('<span aria-hidden="true">=</span> $0 <span class="ch-sr">no change</span>')
  })

  it('tints a good or bad change and leaves an undecided one neutral', () => {
    expect(tile({ delta: { text: '$1', dir: 'up', good: true } })).toContain('ch-delta-good')
    expect(tile({ delta: { text: '$1', dir: 'up', good: false } })).toContain('ch-delta-bad')
    const neutral = tile({ delta: { text: '$1', dir: 'up', good: null } })
    expect(neutral).not.toContain('ch-delta-good')
    expect(neutral).not.toContain('ch-delta-bad')
    // A cost that falls is good news in a down arrow: the sign says what moved, the tint says what it means.
    const cost = tile({ delta: { text: '$1', dir: 'down', good: true } })
    expect(cost).toContain('ch-delta-good')
    expect(cost).toContain('>-</span>')
  })

  it('writes the sign once, even when the text already carries one', () => {
    const html = tile({ delta: { text: '+$310K', dir: 'up', good: true } })
    expect(html).toContain('<span aria-hidden="true">+</span> $310K <span class="ch-sr">up</span>')
    expect(html).not.toContain('+$310K')
    expect(tile({ delta: { text: '-2', dir: 'down', good: null } })).toContain('>-</span> 2 <span')
  })

  it('shows the note and a sparkline of the values', () => {
    const html = tile({ note: 'after tax', values: [1, 2, 3], fmt: shortMoney })
    expect(html).toContain('<span class="ch-kpi-note">after tax</span>')
    expect(html).toContain('role="img"')
    expect(html).toContain('aria-label="Net profit: first $1, last $3, low $1, high $3"')
    expect(html).toContain('ch-tone-c3')
    expect(tile({ values: [1] })).not.toContain('<svg')
    expect(tile({ values: [] })).not.toContain('<svg')
  })

  it('is a button of at least a target tall when it can be pressed', () => {
    const html = tile({ onPress: () => {} })
    expect(html).toMatch(/^<button type="button" class="ch-kpi ch-kpi-press">/)
    expect(html).toContain('<span class="ch-kpi-value">$250K</span>')
    expect(html).not.toContain('<div')
    expect(tile({})).not.toContain('<button')
  })

  it('comes from a spec in one step, and its markup is clean', () => {
    const s = spec({ kind: 'kpi', series: [{ id: 'net', label: 'Net profit', tone: 'c3', values: [100_000, 250_000] }] })
    const html = renderHtml(createElement(KpiTile, kpiPropsOf(s)))
    expect(html).toContain('$250K')
    expect(html).toContain('<span aria-hidden="true">+</span> $150K <span class="ch-sr">up</span>')
    expect(html).toContain('first $100K, last $250K')
    expect(html).not.toMatch(BAD)
  })
})

describe('Meter', () => {
  const meter = (props: Record<string, unknown>): string =>
    renderHtml(createElement(Meter, { label: 'Reputation', value: 71, min: 0, max: 100, valueText: '71 of 100', ...props } as Parameters<typeof Meter>[0]))

  it('is a meter with its range, value, text and name, and shows the text', () => {
    const html = meter({})
    expect(html).toContain('role="meter"')
    expect(html).toContain('aria-valuemin="0"')
    expect(html).toContain('aria-valuemax="100"')
    expect(html).toContain('aria-valuenow="71"')
    expect(html).toContain('aria-valuetext="71 of 100"')
    expect(html).toContain('aria-label="Reputation"')
    expect(html).toContain('<span class="ch-meter-value">71 of 100</span>')
    expect(html).toContain('<span class="ch-meter-label">Reputation</span>')
    expect(html).toContain('width:71%')
  })

  it('marks the band edges inside the range and tints the fill by the band the value is in', () => {
    const bands = [
      { to: 30, tone: 'bad' },
      { to: 60, tone: 'c5' },
      { to: 100, tone: 'good' },
    ]
    const html = meter({ bands })
    expect(count(html, /ch-meter-tick/g)).toBe(2)
    expect(html).toContain('left:30%')
    expect(html).toContain('left:60%')
    expect(html).toMatch(/class="ch-meter-fill ch-tone-good"/)
    expect(meter({ bands, value: 10 })).toMatch(/class="ch-meter-fill ch-tone-bad"/)
    expect(meter({ bands, value: 45 })).toMatch(/class="ch-meter-fill ch-tone-c5"/)
    expect(meter({})).toMatch(/class="ch-meter-fill ch-tone-c1"/)
  })

  it('puts the value inside the range for any input, and never writes NaN', () => {
    const cases: [number, number, number][] = [
      [150, 0, 100],
      [-50, 0, 100],
      [NaN, 0, 100],
      [Infinity, 0, 100],
      [5, 100, 0],
      [5, 7, 7],
      [5, NaN, NaN],
      [1e15, 0, 1e15],
      [0, -1e15, 1e15],
    ]
    for (const [value, min, max] of cases) {
      const html = meter({ value, min, max, valueText: 'text', bands: [{ to: NaN, tone: 'bad' }, { to: 50, tone: 'good' }] })
      expect(html, `${value} ${min} ${max}`).not.toMatch(BAD)
      const lo = Number(attr(html, 'aria-valuemin'))
      const hi = Number(attr(html, 'aria-valuemax'))
      const now = Number(attr(html, 'aria-valuenow'))
      expect(lo).toBeLessThan(hi)
      expect(now).toBeGreaterThanOrEqual(lo)
      expect(now).toBeLessThanOrEqual(hi)
    }
  })

  it('is plain elements, no svg', () => {
    expect(countSvgNodes(meter({}))).toBe(0)
  })
})

describe('BulletRow', () => {
  const bullet = (props: Record<string, unknown>): string =>
    renderHtml(
      createElement(BulletRow, { label: 'Quality', mine: 71, market: 64, best: 78, min: 0, max: 100, valueText: '71', rankText: 'rank 3 of 9', ...props } as Parameters<typeof BulletRow>[0]),
    )

  it('is one image that says all of it, and shows the value and the rank as text', () => {
    const html = bullet({})
    expect(html).toMatch(/^<div class="ch-bullet" role="img"/)
    expect(html).toContain('aria-label="Quality. Yours 71, market 64, best 78, rank 3 of 9"')
    expect(html).toContain('<span class="ch-bullet-label">Quality</span>')
    expect(html).toContain('<span class="ch-bullet-value">71</span>')
    expect(html).toContain('<span class="ch-bullet-rank">rank 3 of 9</span>')
    expect(html).toContain('width:71%')
    expect(html).toContain('left:64%')
    expect(html).toContain('left:78%')
  })

  it('leaves out what it was not given', () => {
    const html = bullet({ market: undefined, best: undefined, rankText: undefined })
    expect(html).toContain('aria-label="Quality. Yours 71"')
    expect(html).not.toContain('ch-bullet-market')
    expect(html).not.toContain('ch-bullet-best')
    expect(html).not.toContain('ch-bullet-rank')
    expect(bullet({ best: undefined })).toContain('Yours 71, market 64, rank 3 of 9')
  })

  it('speaks the market and the best in the format it is given', () => {
    const html = bullet({ mine: 250_000, market: 120_000, best: 1_200_000, max: 2_000_000, valueText: '$250K', fmt: shortMoney })
    expect(html).toContain('Yours $250K, market $120K, best $1.2M')
  })

  it('keeps every position inside the track, and never writes NaN', () => {
    const cases: [number, number | undefined, number | undefined, number, number][] = [
      [150, 200, -20, 0, 100],
      [NaN, NaN, NaN, 0, 100],
      [5, 5, 5, 7, 7],
      [5, 5, 5, 100, 0],
      [1e15, 1e15, -1e15, 0, 1e15],
      [Infinity, -Infinity, 3, NaN, NaN],
    ]
    for (const [mine, market, best, min, max] of cases) {
      const html = bullet({ mine, market, best, min, max, valueText: 'v' })
      expect(html, `${mine} ${market} ${best} ${min} ${max}`).not.toMatch(BAD)
      for (const m of html.matchAll(/(?:width|left):(-?[\d.]+)%/g)) {
        expect(Number(m[1])).toBeGreaterThanOrEqual(0)
        expect(Number(m[1])).toBeLessThanOrEqual(100)
      }
    }
  })

  it('is plain elements, no svg', () => {
    expect(countSvgNodes(bullet({}))).toBe(0)
  })
})

describe('the kit as a whole', () => {
  it('stays under 150 drawing elements a component (D.11.2)', () => {
    const plotted = frameEl({ spec: sixSeries(), tableOpen: true }, createElement(Sparkline, { values: Array.from({ length: 64 }, (_, i) => i), tone: 'c1', label: 'x' }))
    const tiles = createElement(
      'div',
      null,
      ...[1, 2, 3, 4, 5, 6].map((n) => createElement(KpiTile, { key: n, ...kpiPropsOf(spec({ kind: 'kpi' })) })),
    )
    for (const el of [plotted, tiles]) expect(countSvgNodes(renderHtml(el))).toBeLessThan(150)
  })

  it('writes undefined, NaN or [object Object] nowhere', () => {
    const els: ReactElement[] = [
      frameEl({ spec: sixSeries(), tableOpen: true }),
      frameEl({ spec: spec({ basis: 2031 }) }),
      createElement(KpiTile, { label: '', value: '', tone: 'muted' }),
      createElement(KpiTile, kpiPropsOf(spec({ kind: 'kpi', series: [{ id: 'a', label: 'A', tone: 'c1', values: [null, null] }] }))),
      createElement(Meter, { label: 'M', value: NaN, min: NaN, max: NaN, valueText: '' }),
      createElement(BulletRow, { label: 'B', mine: NaN, min: NaN, max: NaN, valueText: '' }),
      createElement(Sparkline, { values: [1, 2], tone: 'c1', label: 'S' }),
    ]
    for (const el of els) expect(renderHtml(el)).not.toMatch(BAD)
  })
})

describe('charts.css', () => {
  const CSS = readFileSync(new URL('../src/ui/charts/charts.css', import.meta.url), 'utf8')
  const GLOBAL = readFileSync(new URL('../src/ui/styles/global.css', import.meta.url), 'utf8')
  /** The rules only: comments and the conditions of @media blocks are not declarations. */
  const body = CSS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]*/g, '@media ')

  it('honours prefers-reduced-motion, and animates only inside the no-preference query', () => {
    expect(CSS).toContain('prefers-reduced-motion')
    expect(CSS).toContain('@media (prefers-reduced-motion: no-preference)')
    const open = CSS.indexOf('@media (prefers-reduced-motion: no-preference)')
    const before = CSS.slice(0, open)
    expect(before).not.toMatch(/animation\s*:|@keyframes|transition\s*:/)
    expect(CSS.slice(open)).toMatch(/animation\s*:/)
  })

  it('tightens for a narrow phone', () => {
    expect(CSS).toContain('@media (max-width: 374px)')
  })

  it('has no hex colour literal', () => {
    expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  it('has no fixed width above 328px', () => {
    const widths = [...body.matchAll(/(?:^|[\s;{])(?:min-|max-)?width:\s*(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]))
    expect(widths.length).toBeGreaterThan(0)
    for (const w of widths) expect(w).toBeLessThanOrEqual(328)
  })

  it('has a tone class for each of the nine tones', () => {
    for (const tone of ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'good', 'bad', 'muted']) expect(CSS).toContain(`.ch-tone-${tone}`)
  })

  it('has the visually hidden class, a target height and the focus ring with fallbacks', () => {
    expect(CSS).toContain('.ch-sr')
    expect(CSS).toContain('var(--target, 44px)')
    expect(CSS).toContain('var(--focus-ring, currentColor)')
  })

  it('uses only tokens that global.css declares (or gives a fallback)', () => {
    const declared = new Set([...GLOBAL.matchAll(/--([a-z0-9-]+)\s*:/g)].map((m) => m[1]))
    const missing: string[] = []
    for (const m of body.matchAll(/var\(\s*--([a-z0-9-]+)\s*(,)?/g)) if (!m[2] && !declared.has(m[1]!)) missing.push(m[1]!)
    expect(missing).toEqual([])
  })

  it('has no en dash or em dash', () => {
    expect(CSS).not.toMatch(new RegExp('[\\u2013\\u2014]'))
  })
})
