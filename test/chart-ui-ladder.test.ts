// R1-C9: the third part of the chart kit (src/ui/charts): RankLadder, Timeline, the ChartView dispatcher, the lazy gate
// (lazy.tsx) and the barrel. Rendered the way this repo tests the UI: createElement + renderToStaticMarkup, no DOM.
// A lazy view is tested with a11y's pattern: render before the load (the fallback), await View.preload(), render again
// (the real component). The zone rule itself is test/lazy-zones.test.ts; this file also reads lazy.tsx so a slip fails here.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement, type ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bindMoneyContext, setMoneyDisplay } from '../src/game/core'
import '../src/game/data/currencies'
import { CHART_LIMITS, type ChartKind, type ChartMark, type ChartSpec, type ChartStep, type LadderRow } from '../src/game/charts/spec'
import * as barrel from '../src/ui/charts/index'
import ChartViewDefault, { ChartView } from '../src/ui/charts/ChartView'
import { Frame } from '../src/ui/charts/Frame'
import { LINE_INSET } from '../src/ui/charts/LineChart'
import { RankLadder, ladderChange } from '../src/ui/charts/RankLadder'
import { Timeline } from '../src/ui/charts/Timeline'
import { readoutFor } from '../src/ui/charts/format'
import { specTable } from '../src/ui/charts/table'
import { useScrub, type ScrubApi } from '../src/ui/charts/useScrub'
import { countSvgNodes, deepFreeze, renderHtml } from './charts-kit'
import { dynamicImports, resolve as resolveImport, staticImports } from './lazy-kit'

const BAD = /NaN|Infinity|undefined|\[object Object\]/
const DASHES = new RegExp('[\\u2013\\u2014]')
const UP = '▲'
const DOWN = '▼'
const FLAT = '▪'

afterEach(() => {
  setMoneyDisplay({ mode: 'usd', nominal: false })
  bindMoneyContext(null)
})

// ---------------------------------------------------------------------------
// Helpers

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

function tagOf(markup: string, re: RegExp): string {
  const m = re.exec(markup)
  if (!m) throw new Error(`no ${re} in ${markup.slice(0, 300)}`)
  return m[0]
}

function numberOf(tag: string, name: string): number {
  const v = attrOf(tag, name)
  if (v === null) throw new Error(`no ${name} in ${tag}`)
  return Number(v)
}

/** The rows of a list's markup, one string for each <li>. */
function itemsOf(markup: string): string[] {
  return [...markup.matchAll(/<li\b[\s\S]*?<\/li>/g)].map((m) => m[0])
}

function textOf(markup: string): string {
  return markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

const noop = (): void => {}

/** A reader who has put the cursor on `index`. */
function fakeScrub(index: number, active = true): ScrubApi {
  return { index, active, handlers: { tabIndex: 0, onKeyDown: noop, onPointerDown: noop, onPointerMove: noop, onPointerLeave: noop, onBlur: noop } }
}

// ---------------------------------------------------------------------------
// Specs

function row(rank: number, name: string, value: number, prevRank: number | null, spark: (number | null)[] = [], you = false): LadderRow {
  return { id: `r${rank}`, name, value, rank, prevRank, prev: prevRank === null ? null : value, spark, ...(you ? { you: true as const } : {}) }
}

/** Nine rows; the player is third and moved up two places. */
const NINE: LadderRow[] = [
  row(1, 'Bolt Burgers', 0.31, 1, [0.3, 0.3, 0.31]),
  row(2, 'Grill Co', 0.22, 3, [0.19, 0.2, 0.22]),
  row(3, 'Mia Foods', 0.12, 5, [0.08, 0.1, 0.12], true),
  row(4, 'Patty Palace', 0.1, 2, [0.14, 0.12, 0.1]),
  row(5, 'Fry Kings', 0.08, null, []),
  row(6, 'Bun Bros', 0.06, 6, [null, 0.06]),
  row(7, 'Pickle Plaza', 0.05, 6, [0.05, null, 0.05]),
  row(8, 'Sesame Street', 0.04, 9, [0.03, 0.04]),
  row(9, 'Lettuce Lane', 0.02, null, [0.02]),
]

function ladderSpec(rows: LadderRow[] = NINE, over: Partial<ChartSpec> = {}): ChartSpec {
  return { v: 1, kind: 'ladder', title: 'Who holds the burger market', unit: 'pct', x: [], series: [], rows, summary: 'You hold 12% and rank 3rd of 9.', ...over }
}

function tlSpec(points = 5, over: Partial<ChartSpec> = {}): ChartSpec {
  return {
    v: 1,
    kind: 'timeline',
    title: 'Your net worth by age',
    unit: 'money',
    x: Array.from({ length: points }, (_, i) => `age ${30 + i}`),
    series: [{ id: 'worth', label: 'Net worth', tone: 'c1', values: Array.from({ length: points }, (_, i) => 50_000 + i * 120_000 + ((i * 7919) % 5) * 10_000) }],
    basis: 2030,
    summary: 'Net worth $530K at age 34, peak $530K at age 34.',
    ...over,
  }
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

const PL_STEPS: ChartStep[] = [
  { label: 'Sales after tax', value: 9_600_000, kind: 'total' },
  { label: 'Materials and direct costs', value: -3_900_000, kind: 'delta' },
  { label: 'Wages', value: -2_200_000, kind: 'delta' },
  { label: 'Other income', value: 300_000, kind: 'delta' },
  { label: 'Net profit', value: 3_800_000, kind: 'total' },
]

function meterSpec(): ChartSpec {
  return {
    v: 1,
    kind: 'meter',
    title: 'You against the market',
    unit: 'count',
    x: ['Performance', 'Quality', 'Price'],
    series: [
      { id: 'mine', label: 'Yours', tone: 'c1', values: [71, 55, 80] },
      { id: 'market', label: 'Market', tone: 'c6', values: [60, 62, 70] },
      { id: 'best', label: 'Best', tone: 'c2', values: [88, 91, 85] },
    ],
    marks: [{ at: 0, label: '3 of 9' }, { at: 1, label: '7 of 9' }],
    summary: 'You rank 3rd of 9 on performance.',
  }
}

function kpiSpec(): ChartSpec {
  return {
    v: 1,
    kind: 'kpi',
    title: 'Company at a glance',
    unit: 'money',
    x: [2026, 2027, 2028, 2029],
    series: [
      { id: 'net', label: 'Net profit', tone: 'c1', values: [100_000, 250_000, 150_000, 600_000] },
      { id: 'rev', label: 'Revenue', tone: 'c2', values: [1_000_000, null, 1_400_000, 1_300_000] },
      { id: 'cash', label: 'Cash', tone: 'c3', values: [null, null, null, 900_000] },
    ],
    note: 'Settled years only',
    summary: 'Three numbers for the company.',
  }
}

const KIND_SPECS: Record<ChartKind, () => ChartSpec> = {
  line: () => lineSpec(),
  bars: () => lineSpec({ kind: 'bars', title: 'Net profit by year' }),
  stack: () => lineSpec({ kind: 'stack', title: 'Where the money went' }),
  waterfall: () => ({ v: 1, kind: 'waterfall', title: 'Where the sales went', unit: 'money', x: [], series: [], steps: PL_STEPS, summary: 'Net profit $3.8M on $9.6M of sales after tax.' }),
  ladder: () => ladderSpec(),
  timeline: () => tlSpec(),
  meter: () => meterSpec(),
  kpi: () => kpiSpec(),
}
const KINDS = Object.keys(KIND_SPECS) as ChartKind[]

// ---------------------------------------------------------------------------
// 1. RankLadder

describe('ladderChange', () => {
  it('says up, down, no change and new, in words', () => {
    expect(ladderChange(3, 5)).toEqual({ dir: 'up', text: 'up 2' })
    expect(ladderChange(4, 2)).toEqual({ dir: 'down', text: 'down 2' })
    expect(ladderChange(1, 1)).toEqual({ dir: 'flat', text: 'no change' })
    expect(ladderChange(5, null)).toEqual({ dir: 'new', text: 'new' })
  })

  it('treats a rank that is not a number as new, and rounds places', () => {
    expect(ladderChange(2, NaN).text).toBe('new')
    expect(ladderChange(2, Infinity).text).toBe('new')
    expect(ladderChange(2.4, 4.4)).toEqual({ dir: 'up', text: 'up 2' })
  })

  it('writes the same words as the table under the chart', () => {
    const table = specTable(ladderSpec())
    NINE.forEach((r, i) => expect(ladderChange(r.rank, r.prevRank).text, r.name).toBe(table.rows[i]![3]))
  })
})

describe('RankLadder', () => {
  const out = renderHtml(createElement(RankLadder, { spec: ladderSpec() }))
  const items = itemsOf(out)
  const wordsOf = (item: string): string => /class="ch-ladder-words">([^<]*)</.exec(item)![1]!

  it('is an ordered list named by the summary, with one item for each of nine rows', () => {
    const ol = tagOf(out, /<ol [^>]*>/)
    expect(attrOf(ol, 'class')).toBe('ch-ladder')
    expect(attrOf(ol, 'aria-label')).toBe('You hold 12% and rank 3rd of 9.')
    expect(items).toHaveLength(9)
    expect(count(out, /<li\b/g)).toBe(9)
  })

  it('writes the place, the name and the value of each row', () => {
    NINE.forEach((r, i) => {
      expect(items[i]).toContain(`<span class="ch-ladder-rank">#${r.rank}</span>`)
      expect(items[i]).toContain(r.name)
    })
    const values = items.map((it) => /class="ch-ladder-value">([^<]*)</.exec(it)![1])
    expect(values).toEqual(['31%', '22%', '12%', '10%', '8%', '6%', '5%', '4%', '2%'])
  })

  it('marks the player row: a "you" pill and aria-current, on that row only', () => {
    expect(count(out, /aria-current="true"/g)).toBe(1)
    expect(count(out, /ch-ladder-pill/g)).toBe(1)
    const mine = items[2]!
    expect(mine).toContain('aria-current="true"')
    expect(mine).toMatch(/<span class="ch-ladder-pill">you<\/span>/)
    expect(mine).toContain('Mia Foods')
    for (const [i, item] of items.entries()) if (i !== 2) expect(item).not.toContain('aria-current')
  })

  it('says what changed in each row, in words', () => {
    expect(items.map(wordsOf)).toEqual(['no change', 'up 1', 'up 2', 'down 2', 'new', 'no change', 'down 1', 'up 1', 'new'])
  })

  it('shows a row with no last rank as the word new', () => {
    expect(wordsOf(items[4]!)).toBe('new')
    expect(wordsOf(items[8]!)).toBe('new')
    expect(textOf(items[4]!)).toContain('new')
  })

  it('never leaves a change as a glyph or a colour alone: words in the text, the glyph hidden', () => {
    const cells = [...out.matchAll(/<span class="ch-ladder-change[^"]*">[\s\S]*?<\/span><\/span>/g)].map((m) => m[0])
    expect(cells).toHaveLength(9)
    for (const cell of cells) {
      expect(textOf(cell.replace(/<span class="ch-ladder-glyph"[^>]*>[^<]*<\/span>/, ''))).toMatch(/^(up \d+|down \d+|no change|new)$/)
      expect(cell).not.toMatch(/ch-tone-(good|bad)/)
    }
    for (const glyph of out.matchAll(/<span class="ch-ladder-glyph"[^>]*>/g)) expect(attrOf(glyph[0], 'aria-hidden')).toBe('true')
  })

  it('uses the triangle glyphs of the company dashboard for up, down and no change', () => {
    const glyphOf = (item: string): string | null => /class="ch-ladder-glyph"[^>]*>([^<]*)</.exec(item)?.[1] ?? null
    expect(glyphOf(items[1]!)).toBe(UP)
    expect(glyphOf(items[3]!)).toBe(DOWN)
    expect(glyphOf(items[0]!)).toBe(FLAT)
    expect(glyphOf(items[4]!)).toBeNull()
  })

  it('draws a sparkline only where the row has two or more real points', () => {
    // Rows 1, 2, 3, 4, 7 (two real points around a gap) and 8 have a trend; 5, 6 and 9 have fewer than two real points.
    const has = items.map((it) => it.includes('class="ch-spark'))
    expect(has).toEqual([true, true, true, true, false, false, true, true, false])
    expect(count(out, /<svg\b/g)).toBe(6)
    expect(items[2]).toMatch(/aria-label="Mia Foods[^"]*first 8%, last 12%/)
  })

  it('keeps a row 44px tall and the whole list small', () => {
    const css = readFileSync(new URL('../src/ui/charts/charts.css', import.meta.url), 'utf8')
    expect(css).toMatch(/\.ch-ladder-row\s*\{[^}]*min-height:\s*var\(--target,\s*44px\)/)
    expect(countSvgNodes(out)).toBeLessThanOrEqual(150)
  })

  it('shows at most 12 rows, however many it is given', () => {
    const many = Array.from({ length: 30 }, (_, i) => row(i + 1, `Rival ${i + 1}`, 0.5 - i * 0.01, i + 1, [0.1, 0.2]))
    const html = renderHtml(createElement(RankLadder, { spec: ladderSpec(many) }))
    expect(count(html, /<li\b/g)).toBe(12)
    expect(countSvgNodes(html)).toBeLessThanOrEqual(150)
  })

  it('puts a "..." row where the ranks jump, between the top five and the player window', () => {
    const windowed = [
      ...[1, 2, 3, 4, 5].map((r) => row(r, `Top ${r}`, 0.3 - r * 0.02, r)),
      ...[12, 13, 14, 15, 16].map((r) => row(r, `Low ${r}`, 0.05 - (r - 12) * 0.005, r, [], r === 14)),
    ]
    const html = renderHtml(createElement(RankLadder, { spec: ladderSpec(windowed) }))
    const list = itemsOf(html)
    expect(list).toHaveLength(11)
    const gaps = list.filter((it) => it.includes('ch-ladder-gap'))
    expect(gaps).toHaveLength(1)
    expect(list.indexOf(gaps[0]!)).toBe(5)
    expect(gaps[0]).toContain('>...<')
    expect(gaps[0]).toContain('ranks 6 to 11 not shown')
    // The dots are for the eye; the sentence is for the reader who cannot see them.
    expect(tagOf(gaps[0]!, /<span [^>]*>\.\.\.<\/span>/)).toContain('aria-hidden="true"')
  })

  it('says "rank 7 not shown" for a gap of one, and has no gap row for consecutive ranks', () => {
    const one = [row(1, 'A', 0.5, 1), row(2, 'B', 0.3, 2), row(4, 'D', 0.1, 4)]
    const html = renderHtml(createElement(RankLadder, { spec: ladderSpec(one) }))
    expect(html).toContain('rank 3 not shown')
    expect(count(renderHtml(createElement(RankLadder, { spec: ladderSpec() })), /ch-ladder-gap/g)).toBe(0)
  })

  it('writes values in the spec unit', () => {
    const money = renderHtml(createElement(RankLadder, { spec: ladderSpec([row(1, 'A', 2_500_000, 1), row(2, 'B', 900_000, 3)], { unit: 'money' }) }))
    expect(money).toContain('$2.5M')
    expect(money).toContain('$900K')
  })

  it('is named by the frame when it sits in one', () => {
    const html = renderHtml(createElement(Frame, { spec: ladderSpec(), children: createElement(RankLadder, { spec: ladderSpec() }) }))
    const ol = tagOf(html, /<ol [^>]*>/)
    const labelled = attrOf(ol, 'aria-labelledby')!
    expect(html).toContain(`<h4 id="${labelled}" class="ch-title">Who holds the burger market</h4>`)
    expect(attrOf(ol, 'aria-describedby')).toBeTruthy()
  })

  it('falls back to the summary when there are no rows, and survives damaged rows', () => {
    const none = renderHtml(createElement(RankLadder, { spec: ladderSpec([]) }))
    expect(none).toBe('<p class="ch-summary">You hold 12% and rank 3rd of 9.</p>')
    const missing = renderHtml(createElement(RankLadder, { spec: { ...ladderSpec(), rows: undefined } }))
    expect(missing).toContain('ch-summary')
    const damaged = [
      row(1, 'Fine', 0.3, 1, [0.1, 0.2]),
      { ...row(2, 'Nan value', NaN, NaN, [NaN, Infinity, 3]) },
      { ...row(3, '', Infinity, 3) },
      null,
      'text',
      { id: 'x', name: 5, value: 'y', rank: 'z' },
    ] as unknown as LadderRow[]
    for (const unit of ['money', 'pct', 'count', 'rank', 'years'] as const) {
      const html = renderHtml(createElement(RankLadder, { spec: ladderSpec(damaged, { unit }) }))
      expect(html, unit).not.toMatch(BAD)
      expect(html).toContain('Fine')
    }
  })
})

// ---------------------------------------------------------------------------
// 2. Timeline

/** A Timeline inside a Frame with the real hook, as ChartView does it. */
function Scrubbed(p: { spec: ChartSpec }): ReactElement {
  const scrub = useScrub(p.spec.x.length)
  return createElement(Frame, { spec: p.spec, children: createElement(Timeline, { spec: p.spec, scrub }) })
}

function tlHtml(spec: ChartSpec): string {
  return renderHtml(createElement(Scrubbed, { spec }))
}

function tlActive(spec: ChartSpec, index: number): string {
  return renderHtml(createElement(Frame, { spec, children: createElement(Timeline, { spec, scrub: fakeScrub(index) }) }))
}

interface Flag {
  text: string
  x: number
  y: number
  anchor: string
}

function flagsOf(markup: string): Flag[] {
  return [...markup.matchAll(/<text [^>]*class="ch-tl-flag"[^>]*>([^<]*)<\/text>/g)].map((m) => ({
    text: m[1]!,
    x: numberOf(m[0], 'x'),
    y: numberOf(m[0], 'y'),
    anchor: attrOf(m[0], 'text-anchor') ?? 'start',
  }))
}

/** The y numbers of a path: its coordinates are 'M x y L x y'. */
function pathYs(d: string): number[] {
  return [...d.matchAll(/[ML]\s*(-?[\d.]+)\s+(-?[\d.]+)/g)].map((m) => Number(m[2]))
}

describe('Timeline', () => {
  const marks: ChartMark[] = [
    { at: 1, label: 'First company' },
    { at: 3, label: 'Peak' },
    { at: 4, label: 'Now' },
  ]

  it('is a slider like the other plots, with a name and a description from the frame', () => {
    const spec = tlSpec(5)
    const out = tlHtml(spec)
    const tag = tagOf(out, /<div [^>]*class="ch-plot"[^>]*>/)
    expect(attrOf(tag, 'role')).toBe('slider')
    expect(attrOf(tag, 'aria-valuemax')).toBe('4')
    expect(attrOf(tag, 'aria-valuenow')).toBe('4')
    expect(attrOf(tag, 'aria-label')).toBe('Your net worth by age')
    expect(attrOf(tag, 'aria-labelledby')).toBeTruthy()
    expect(attrOf(tag, 'aria-describedby')).toBeTruthy()
    expect(attrOf(tagOf(out, /<svg [^>]*viewBox="0 0 320 180"[^>]*>/), 'aria-hidden')).toBe('true')
  })

  it('draws the line and a filled area under it at 12% opacity', () => {
    const out = tlHtml(tlSpec(5))
    expect(tagsWithClass(out, 'ch-lc-line')).toHaveLength(1)
    const areas = tagsWithClass(out, 'ch-tl-area')
    expect(areas).toHaveLength(1)
    expect(attrOf(areas[0]!, 'fill-opacity')).toBe('0.12')
    expect(attrOf(areas[0]!, 'class')).toContain('ch-tone-c1')
    expect(attrOf(areas[0]!, 'd')).toMatch(/^M[\d. -]+L[\s\S]*Z$/)
  })

  it('closes the area on the zero line, also when the worth goes below zero', () => {
    for (const values of [[50_000, 100_000, 400_000, 530_000], [-80_000, -20_000, 150_000, 400_000], [-300_000, -200_000, -100_000, -50_000]]) {
      const spec = tlSpec(4, { series: [{ id: 'worth', label: 'Net worth', tone: 'c1', values }] })
      const out = tlHtml(spec)
      const zero = numberOf(tagOf(out, /<line [^>]*class="ch-zero"[^>]*>/), 'y1')
      const d = attrOf(tagsWithClass(out, 'ch-tl-area')[0]!, 'd')!
      const ys = pathYs(d)
      // The path starts and ends on the zero line: 'M x0 zero L x0 y0 ... L xn yn L xn zero Z'.
      expect(ys[0], values.join()).toBe(zero)
      expect(ys[ys.length - 1], values.join()).toBe(zero)
    }
  })

  it('breaks the area where the series has a gap, and skips a lone point', () => {
    const gappy = tlSpec(7, { series: [{ id: 'worth', label: 'Net worth', tone: 'c1', values: [10, 20, null, 40, 50, null, 70] }] })
    const d = attrOf(tagsWithClass(tlHtml(gappy), 'ch-tl-area')[0]!, 'd')!
    expect(count(d, /M/g)).toBe(2)
    expect(count(d, /Z/g)).toBe(2)
  })

  it('labels the x axis as ages, for text and for plain numbers alike', () => {
    const text = tlHtml(tlSpec(5))
    expect(text).toContain('>age 30<')
    expect(text).toContain('>age 34<')
    const plain = tlHtml(tlSpec(5, { x: [30, 31, 32, 33, 34] }))
    expect(plain).toContain('>age 30<')
    expect(plain).toContain('>age 34<')
  })

  it('draws marks as short flags with their labels: a stem, a dot on the line and the text', () => {
    const out = tlHtml(tlSpec(5, { marks }))
    expect(flagsOf(out).map((f) => f.text)).toEqual(['First company', 'Peak', 'Now'])
    expect(tagsWithClass(out, 'ch-tl-stem')).toHaveLength(3)
    expect(count(out, /class="ch-mk ch-tl-pt /g)).toBe(3)
    // A flag stands on its own point: the stem is at the x of that point.
    const stems = tagsWithClass(out, 'ch-tl-stem')
    const xs = stems.map((s) => numberOf(s, 'x1'))
    expect(xs[0]!).toBeLessThan(xs[1]!)
    expect(xs[1]!).toBeLessThan(xs[2]!)
    expect(xs[2]).toBe(320 - LINE_INSET[1])
  })

  it('puts a mark on the first point at the left edge of the plot', () => {
    const out = tlHtml(tlSpec(5, { marks: [{ at: 0, label: 'Start' }] }))
    expect(numberOf(tagsWithClass(out, 'ch-tl-stem')[0]!, 'x1')).toBe(LINE_INSET[0])
  })

  it('draws at most 8 flags, the first eight, and drops marks that point at nothing', () => {
    const ten: ChartMark[] = Array.from({ length: 10 }, (_, i) => ({ at: i % 5, label: `Event ${i + 1}` }))
    const out = tlHtml(tlSpec(5, { marks: ten }))
    expect(flagsOf(out)).toHaveLength(CHART_LIMITS.marks)
    expect(flagsOf(out).map((f) => f.text)).toEqual(ten.slice(0, 8).map((m) => m.label))
    const stray = tlHtml(tlSpec(5, { marks: [{ at: 99, label: 'Far' }, { at: -3, label: 'Before' }, { at: NaN, label: 'None' }, { at: 2, label: 'Fine' }] }))
    expect(flagsOf(stray).map((f) => f.text)).toEqual(['Fine'])
  })

  it('dodges the flags: two labels that would overprint sit on different heights', () => {
    const crowded: ChartMark[] = [
      { at: 3, label: 'Sold the bakery' },
      { at: 3, label: 'Bought a house' },
      { at: 3, label: 'Had a child' },
      { at: 4, label: 'Retired early' },
      { at: 0, label: 'Start' },
    ]
    const out = tlHtml(tlSpec(5, { marks: crowded }))
    const flags = flagsOf(out)
    expect(flags).toHaveLength(5)
    // 4 px a letter is less than the plot reserves, so every pair this check calls overlapping really is.
    const span = (f: Flag): [number, number] => {
      const w = f.text.length * 4
      return f.anchor === 'end' ? [f.x - w, f.x] : [f.x, f.x + w]
    }
    for (let a = 0; a < flags.length; a++) {
      for (let b = a + 1; b < flags.length; b++) {
        const [a0, a1] = span(flags[a]!)
        const [b0, b1] = span(flags[b]!)
        if (a0 < b1 && b0 < a1) expect(Math.abs(flags[a]!.y - flags[b]!.y), `${flags[a]!.text} / ${flags[b]!.text}`).toBeGreaterThanOrEqual(10)
      }
    }
    expect(new Set(flags.slice(0, 3).map((f) => f.y)).size).toBe(3)
    // Labels stay inside the drawing box.
    for (const f of flags) {
      const [x0, x1] = span(f)
      expect(x0).toBeGreaterThanOrEqual(0)
      expect(x1).toBeLessThanOrEqual(320)
    }
  })

  it('keeps the flags above the line and the area, so a label never sits on the worth', () => {
    const crowded: ChartMark[] = [{ at: 1, label: 'A' }, { at: 1, label: 'B' }, { at: 2, label: 'C' }, { at: 4, label: 'D' }]
    const out = tlHtml(tlSpec(5, { marks: crowded }))
    const lowest = Math.max(...flagsOf(out).map((f) => f.y))
    const line = attrOf(tagsWithClass(out, 'ch-lc-line')[0]!, 'd')!
    expect(lowest).toBeLessThan(Math.min(...pathYs(line)))
    const area = attrOf(tagsWithClass(out, 'ch-tl-area')[0]!, 'd')!
    expect(lowest).toBeLessThan(Math.min(...pathYs(area)))
  })

  it('follows the cursor with a line and a marker, and says where it is', () => {
    const spec = tlSpec(5)
    const out = tlActive(spec, 2)
    expect(out).toContain('class="ch-cursor"')
    expect(count(out, /ch-mk-cur/g)).toBe(1)
    expect(attrOf(tagOf(out, /<div [^>]*class="ch-plot"[^>]*>/), 'aria-valuenow')).toBe('2')
    expect(tlHtml(spec)).not.toContain('class="ch-cursor"')
  })

  it('has an end marker and the last value for the series', () => {
    const out = tlHtml(tlSpec(5))
    expect(tagsWithClass(out, 'ch-lc-end')).toHaveLength(1)
    expect(out).toMatch(/class="ch-lc-end ch-tone-c1"[^>]*>\$/)
    expect(count(out, /ch-mk-end/g)).toBe(1)
  })

  it('is free of NaN for 3 points and for 64 points, and small', () => {
    for (const points of [3, 64]) {
      const spec = tlSpec(points, { marks: [{ at: 0, label: 'Start' }, { at: points - 1, label: 'Now' }, { at: 1, label: 'Peak' }] })
      for (const out of [tlHtml(spec), tlActive(spec, points - 2)]) {
        expect(out).not.toMatch(BAD)
        expect(countSvgNodes(out)).toBeLessThanOrEqual(150)
      }
    }
  })

  it('stays at most 150 elements with six series, 64 points, eight flags and a cursor', () => {
    const tones = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'] as const
    const spec = tlSpec(64, {
      series: tones.map((tone, s) => ({
        id: `s${s}`,
        label: `Line ${s + 1}`,
        tone,
        values: Array.from({ length: 64 }, (_, i) => Math.round(1000 + s * 300 + 500 * Math.sin((i + s) / 4))),
      })),
      marks: Array.from({ length: 8 }, (_, i) => ({ at: i * 8, label: `Flag number ${i + 1}` })),
    })
    for (const out of [tlHtml(spec), tlActive(spec, 30)]) {
      expect(countSvgNodes(out)).toBeLessThanOrEqual(150)
      expect(out).not.toMatch(BAD)
    }
    expect(tagsWithClass(tlHtml(spec), 'ch-tl-area')).toHaveLength(1)
  })

  it('survives odd data: no series, one point, constant, nulls, huge and non-finite values', () => {
    const one = (values: (number | null)[], x?: (number | string)[]): Partial<ChartSpec> => ({
      x: x ?? values.map((_, i) => `age ${30 + i}`),
      series: [{ id: 'worth', label: 'Net worth', tone: 'c1', values }],
    })
    const cases: [string, Partial<ChartSpec>][] = [
      ['no series', { series: [] }],
      ['nothing', { x: [], series: [] }],
      ['one point', one([5])],
      ['zero', one([0, 0, 0])],
      ['constant', one([7, 7, 7])],
      ['all nulls', one([null, null, null])],
      ['negative', one([-5, -3, -9])],
      ['huge', one([1e15, -1e15, 5e14])],
      ['raw NaN and infinity', one([NaN, Infinity, -Infinity, 3, NaN])],
      ['numbers for x', one([1, 2, 3], [30, 31, 32])],
    ]
    for (const [name, over] of cases) {
      for (const unit of ['money', 'pct', 'count', 'rank', 'years'] as const) {
        const spec = tlSpec(3, { unit, marks: [{ at: 0, label: 'Start' }, { at: 2, label: 'End' }], ...over })
        expect(tlHtml(spec), `${name} ${unit}`).not.toMatch(BAD)
        for (const at of [0, 1, 99, -1, NaN]) expect(tlActive(spec, at), `${name} ${unit} cursor ${at}`).not.toMatch(BAD)
      }
    }
  })

  it('renders a frozen spec', () => {
    const spec = deepFreeze(tlSpec(5, { marks }))
    expect(tlHtml(spec)).toContain('ch-tl-area')
  })
})

// ---------------------------------------------------------------------------
// 3. ChartView

describe('ChartView', () => {
  function view(spec: ChartSpec, className?: string): string {
    return renderHtml(createElement(ChartView, className === undefined ? { spec } : { spec, className }))
  }

  const EXPECTED: Record<ChartKind, (out: string) => void> = {
    line: (out) => {
      expect(out).toContain('role="slider"')
      expect(tagsWithClass(out, 'ch-lc-line')).toHaveLength(2)
    },
    bars: (out) => {
      expect(out).toContain('role="slider"')
      expect(tagsWithClass(out, 'ch-bc-series').length).toBeGreaterThan(0)
    },
    stack: (out) => {
      expect(out).toContain('role="slider"')
      expect(tagsWithClass(out, 'ch-bc-series').length).toBeGreaterThan(0)
      expect(out).toContain('ch-legend')
    },
    waterfall: (out) => {
      expect(tagOf(out, /<ol [^>]*>/)).toContain('class="ch-wf"')
      expect(itemsOf(out)).toHaveLength(PL_STEPS.length)
    },
    ladder: (out) => {
      expect(tagOf(out, /<ol [^>]*>/)).toContain('class="ch-ladder"')
      expect(itemsOf(out)).toHaveLength(NINE.length)
    },
    timeline: (out) => {
      expect(out).toContain('role="slider"')
      expect(tagsWithClass(out, 'ch-tl-area')).toHaveLength(1)
    },
    meter: (out) => {
      expect(count(out, /class="ch-bullet"/g)).toBe(3)
      expect(count(out, /role="img"/g)).toBe(3)
    },
    kpi: (out) => {
      expect(out).toContain('class="ch-kpi-grid"')
      expect(count(out, /class="ch-kpi"/g)).toBe(3)
    },
  }

  for (const kind of KINDS) {
    it(`draws kind ${kind} with the markup of its plot`, () => {
      const out = view(KIND_SPECS[kind]())
      EXPECTED[kind](out)
      expect(out).not.toMatch(BAD)
      expect(DASHES.test(out)).toBe(false)
      expect(countSvgNodes(out)).toBeLessThanOrEqual(150)
    })

    it(`kind ${kind}: ${kind === 'kpi' ? 'has no frame' : 'sits in a frame with a title, a readout and a table toggle'}`, () => {
      const spec = KIND_SPECS[kind]()
      const out = view(spec)
      if (kind === 'kpi') {
        expect(out).not.toContain('<figure')
        expect(out).not.toContain('Show as table')
        expect(out).not.toContain('<h4')
        return
      }
      expect(tagOf(out, /<figure [^>]*>/)).toContain('role="group"')
      expect(out).toContain(`class="ch-title">${spec.title}</h4>`)
      expect(out).toContain('class="ch-readout"')
      expect(out).toContain('>Show as table</button>')
    })

    it(`kind ${kind}: renders a frozen spec`, () => {
      expect(view(deepFreeze(KIND_SPECS[kind]()))).not.toMatch(BAD)
    })
  }

  it('has a named and a default export that are the same component', () => {
    expect(ChartViewDefault).toBe(ChartView)
  })

  it('reads the line under the plot from readoutFor, resting on the last point', () => {
    const spec = lineSpec()
    expect(view(spec)).toContain(`<p class="ch-readout" aria-live="polite">${readoutFor(spec, 4)}</p>`)
    const wf = KIND_SPECS.waterfall()
    expect(view(wf)).toContain(`<p class="ch-readout" aria-live="polite">${readoutFor(wf, PL_STEPS.length - 1)}</p>`)
  })

  it('reads a ladder, a meter and a tile from the summary: they have no cursor', () => {
    for (const kind of ['ladder', 'meter'] as const) {
      const spec = KIND_SPECS[kind]()
      expect(view(spec), kind).toContain(`<p class="ch-readout" aria-live="polite">${spec.summary}</p>`)
    }
  })

  it('gives the plot a slider range that matches the points', () => {
    expect(attrOfSlider(view(lineSpec()), 'aria-valuemax')).toBe('4')
    expect(attrOfSlider(view(KIND_SPECS.timeline()), 'aria-valuemax')).toBe('4')
  })

  it('writes a timeline of plain ages as "age 30" in the axis, the readout and the table', () => {
    const spec = tlSpec(5, { x: [30, 31, 32, 33, 34] })
    const out = view(spec)
    expect(out).toContain('>age 30<')
    expect(out).toMatch(/class="ch-readout"[^>]*>age 34: Net worth /)
  })

  it('passes the class name on to the frame, or to the tile grid', () => {
    expect(view(lineSpec(), 'mine')).toContain('class="ch-frame mine"')
    expect(view(kpiSpec(), 'mine')).toContain('class="ch-kpi-grid mine"')
  })

  it('draws a kpi spec as one tile for each series: the last real value, the change, the sparkline', () => {
    const out = view(kpiSpec())
    const tiles = [...out.matchAll(/<div class="ch-kpi">[\s\S]*?<\/div>/g)].map((m) => m[0])
    expect(tiles).toHaveLength(3)
    const labels = tiles.map((t) => /class="ch-kpi-label">([^<]*)</.exec(t)![1])
    const values = tiles.map((t) => /class="ch-kpi-value">([^<]*)</.exec(t)![1])
    expect(labels).toEqual(['Net profit', 'Revenue', 'Cash'])
    expect(values).toEqual(['$600K', '$1.3M', '$900K'])
    // Revenue goes from $1.4M to $1.3M (the gap is skipped), net profit up $450K; cash has one real point.
    expect(tiles[0]).toMatch(/ch-delta-up[^>]*>[\s\S]*?\+[\s\S]*?\$450K/)
    expect(tiles[1]).toMatch(/ch-delta-down[\s\S]*?\$100K/)
    expect(tiles[2]).not.toContain('ch-kpi-delta')
    expect(tiles.map((t) => t.includes('class="ch-spark'))).toEqual([true, true, false])
    for (const t of tiles) expect(t).toContain('Settled years only')
    expect(out).not.toContain('<button')
  })

  it('draws a meter spec as one bullet row for each x, with the rank from the marks', () => {
    const out = view(meterSpec())
    const labels = [...out.matchAll(/class="ch-bullet" role="img" aria-label="([^"]*)"/g)].map((m) => m[1])
    expect(labels).toEqual([
      'Performance. Yours 71, market 60, best 88, 3 of 9',
      'Quality. Yours 55, market 62, best 91, 7 of 9',
      'Price. Yours 80, market 70, best 85',
    ])
    expect(out).toContain('class="ch-bullet-rank">3 of 9<')
    expect(count(out, /ch-bullet-rank/g)).toBe(2)
    expect(out).toContain('class="ch-bullet-value">71<')
  })

  it('draws a meter spec with missing series or damaged values without breaking', () => {
    const spec = { ...meterSpec(), series: [meterSpec().series[0]!], x: ['A', 'B', 'C', 'D'] }
    spec.series[0] = { ...spec.series[0]!, values: [1, NaN, null, Infinity] }
    const out = view(spec)
    expect(out).not.toMatch(BAD)
    expect(count(out, /class="ch-bullet"/g)).toBe(4)
    expect(out).toContain('no data')
  })

  it('falls back to the summary alone for a kind it does not know', () => {
    const odd = { ...lineSpec(), kind: 'sparkles' } as unknown as ChartSpec
    expect(view(odd)).toBe(`<p class="ch-summary">${odd.summary}</p>`)
  })

  it('falls back to the summary for a tile spec with no series', () => {
    const empty = kpiSpec()
    empty.series = []
    expect(view(empty)).toBe(`<p class="ch-summary">${empty.summary}</p>`)
  })

  it('draws a spec as hostile as the reader would let through without a crash or a NaN', () => {
    const hostile: ChartSpec[] = [
      lineSpec({ x: [], series: [] }),
      lineSpec({ x: [1], series: [{ id: 'a', label: 'A', tone: 'c1', values: [NaN] }] }),
      lineSpec({ kind: 'timeline', x: [1, 2, 3], series: [{ id: 'a', label: 'A', tone: 'c1', values: [1e15, -1e15, 3] }] }),
      lineSpec({ kind: 'bars', x: ['a', 'b'], series: [{ id: 'a', label: 'A', tone: 'c1', values: [Infinity, 5] }] }),
      lineSpec({ kind: 'waterfall', steps: [] }),
      lineSpec({ kind: 'ladder', rows: [] }),
      lineSpec({ kind: 'meter', x: [], series: [] }),
      lineSpec({ kind: 'kpi', x: [], series: [{ id: 'a', label: 'A', tone: 'c1', values: [] }] }),
    ]
    for (const spec of hostile) expect(view(spec), spec.kind).not.toMatch(BAD)
  })
})

function attrOfSlider(markup: string, name: string): string | null {
  return attrOf(tagOf(markup, /<div [^>]*class="ch-plot"[^>]*>/), name)
}

// ---------------------------------------------------------------------------
// 4. The lazy gate

describe('lazy.tsx', () => {
  const FALLBACK = createElement('p', { className: 'fb' }, 'Net worth by age: $530K')
  const FALLBACK_HTML = '<p class="fb">Net worth by age: $530K</p>'

  // A lazy view keeps its loaded module for the life of the process, so each test gets a fresh copy of the gate.
  let gate: typeof import('../src/ui/charts/lazy')
  beforeEach(async () => {
    vi.resetModules()
    gate = await import('../src/ui/charts/lazy')
  })

  it('shows the fallback and none of the chart before the chunk is loaded', () => {
    const out = renderHtml(createElement(gate.LazyChartView, { spec: tlSpec(), fallback: FALLBACK }))
    expect(out).toBe(FALLBACK_HTML)
    expect(out).not.toContain('ch-frame')
    expect(gate.ChartViewLazy.isReady()).toBe(false)
  })

  it('shows the chart in its frame once the chunk is loaded', async () => {
    expect(await gate.ChartViewLazy.preload()).toBe(true)
    expect(gate.ChartViewLazy.isReady()).toBe(true)
    const out = renderHtml(createElement(gate.LazyChartView, { spec: tlSpec(), fallback: FALLBACK }))
    expect(out).toContain('<figure class="ch-frame"')
    expect(out).toContain('class="ch-title">Your net worth by age</h4>')
    expect(out).not.toContain('Net worth by age: $530K')
    expect(out).toContain('ch-tl-area')
  })

  it('draws every kind through the gate', async () => {
    await gate.ChartViewLazy.preload()
    for (const kind of KINDS) {
      const out = renderHtml(createElement(gate.LazyChartView, { spec: KIND_SPECS[kind](), fallback: FALLBACK }))
      expect(out, kind).not.toContain('class="fb"')
      expect(out, kind).not.toMatch(BAD)
    }
  })

  it('renders only the fallback for a null spec, before and after the load', async () => {
    expect(renderHtml(createElement(gate.LazyChartView, { spec: null, fallback: FALLBACK }))).toBe(FALLBACK_HTML)
    expect(renderHtml(createElement(gate.LazyChartView, { spec: null }))).toBe('')
    expect(renderHtml(createElement(gate.LazyChartView, { spec: null, fallback: null }))).toBe('')
    await gate.ChartViewLazy.preload()
    expect(renderHtml(createElement(gate.LazyChartView, { spec: null, fallback: FALLBACK }))).toBe(FALLBACK_HTML)
    expect(renderHtml(createElement(gate.LazyChartView, { spec: null }))).toBe('')
  })

  it('does not start a load for a null spec', () => {
    renderHtml(createElement(gate.LazyChartView, { spec: null, fallback: FALLBACK }))
    expect(gate.ChartViewLazy.isReady()).toBe(false)
  })

  it('has a sparkline view that is the fallback, then the real sparkline', async () => {
    const props = { values: [1, 3, 2, 5], tone: 'c1' as const, label: 'Net worth' }
    expect(renderHtml(createElement(gate.LazySparkline, { ...props, fallback: FALLBACK }))).toBe(FALLBACK_HTML)
    expect(renderHtml(createElement(gate.LazySparkline, { ...props, fallback: null }))).toBe('')
    expect(await gate.LazySparkline.preload()).toBe(true)
    const out = renderHtml(createElement(gate.LazySparkline, { ...props, fallback: FALLBACK }))
    expect(out).toMatch(/^<svg class="ch-spark ch-tone-c1"/)
    expect(out).toContain('aria-label="Net worth: first 1, last 5, low 1, high 5"')
  })

  it('has a tile view that is the fallback, then the real tile', async () => {
    const props = { label: 'Net profit', value: '$250K', tone: 'c3' as const }
    expect(renderHtml(createElement(gate.LazyKpiTile, { ...props, fallback: FALLBACK }))).toBe(FALLBACK_HTML)
    expect(await gate.LazyKpiTile.preload()).toBe(true)
    const out = renderHtml(createElement(gate.LazyKpiTile, { ...props, fallback: FALLBACK }))
    expect(out).toContain('<div class="ch-kpi">')
    expect(out).toContain('class="ch-kpi-value">$250K<')
  })

  it('names its views for the registry', () => {
    expect(gate.ChartViewLazy.displayName).toBe('Lazy(chart)')
    expect(gate.LazySparkline.displayName).toBe('Lazy(sparkline)')
    expect(gate.LazyKpiTile.displayName).toBe('Lazy(kpi)')
  })

  it('imports nothing under src/ui/charts/ at run time, and starts each chunk with import()', () => {
    const file = fileURLToPath(new URL('../src/ui/charts/lazy.tsx', import.meta.url))
    const statics = staticImports(file)
    expect(statics.sort()).toEqual(['../lazy/lazyView', 'react'])
    for (const spec of statics) {
      const to = resolveImport(file, spec)
      expect(to === null || !to.includes('/src/ui/charts/'), `${spec} resolves into the chart zone`).toBe(true)
    }
    const dynamic = dynamicImports(file).map((s) => resolveImport(file, s)?.split('/src/ui/charts/')[1])
    // R1-C11 adds the report book; R1-C12 adds the Year-End Desk in the same way.
    expect(dynamic.sort()).toEqual(['ChartView.tsx', 'KpiTile.tsx', 'ReportBook.tsx', 'Sparkline.tsx', 'YearEndDesk.tsx'])
    expect(DASHES.test(readFileSync(file, 'utf8'))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 5. The barrel

describe('the barrel', () => {
  it('exports the components and helpers the tests use, and nothing else', () => {
    expect(Object.keys(barrel).sort()).toEqual(
      [
        'BarChart',
        'BulletRow',
        'ChartView',
        'Frame',
        'FrameContext',
        'KpiTile',
        'LINE_INSET',
        'LineChart',
        'Meter',
        'RankLadder',
        'Sparkline',
        'Timeline',
        'Waterfall',
        'barInset',
        'describeDelta',
        'formatSigned',
        'formatUnit',
        'kpiPropsOf',
        'ladderChange',
        'legendOf',
        'plainNumber',
        'readoutFor',
        'scrubIndex',
        'scrubReducer',
        'sparkLabel',
        'specTable',
        'useScrub',
      ].sort(),
    )
  })

  it('does not re-export the gate: code outside the zone must import lazy.tsx itself', () => {
    expect(Object.keys(barrel)).not.toContain('LazyChartView')
    expect(Object.keys(barrel)).not.toContain('ChartViewLazy')
    expect(barrel.ChartView).toBe(ChartView)
  })
})

// ---------------------------------------------------------------------------
// 6. The styles and the text

describe('charts.css (R1-C9 rules)', () => {
  const css = readFileSync(new URL('../src/ui/charts/charts.css', import.meta.url), 'utf8')

  it('has the ladder, the timeline and the summary rules', () => {
    for (const cls of ['.ch-ladder', '.ch-ladder-row', '.ch-ladder-gap', '.ch-ladder-pill', '.ch-tl-area', '.ch-tl-stem', '.ch-tl-flag', '.ch-summary']) {
      expect(css, cls).toContain(cls)
    }
  })

  it('marks the player row by more than colour, and takes colours from tokens only', () => {
    expect(css).toMatch(/\.ch-ladder-you\s*\{[^}]*box-shadow:\s*inset/)
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(DASHES.test(css)).toBe(false)
  })
})

describe('the new files', () => {
  const FILES = ['RankLadder.tsx', 'Timeline.tsx', 'ChartView.tsx', 'lazy.tsx', 'index.ts']

  it('have no en-dash or em-dash, no raw hex colour and no inline colour', () => {
    for (const f of FILES) {
      const text = readFileSync(new URL(`../src/ui/charts/${f}`, import.meta.url), 'utf8')
      expect(DASHES.test(text), f).toBe(false)
      expect(text, f).not.toMatch(/#[0-9a-fA-F]{6}\b/)
      expect(text, f).not.toMatch(/\b(?:fill|stroke|color)=["{]/)
    }
  })
})
