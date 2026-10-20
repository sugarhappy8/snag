// R1-C1: readChartSpec, the one reader every chart consumer goes through (data.chart in a modal, a menu info row,
// a hostile save). It returns a fresh spec or null, never a truncated or half-trusted one. Proves D.11.4 for specs.
import { describe, expect, expectTypeOf, it } from 'vitest'
import { reveal } from '../src/game/charts/reveal'
import {
  CHART_LIMITS,
  SPEC_LIMITS,
  readChartSpec,
  type ChartKind,
  type ChartSpec,
  type LadderRow,
} from '../src/game/charts/spec'
import { deepFreeze } from './charts-kit'

const series = (id: string, values: (number | null)[], tone: ChartSpec['series'][number]['tone'] = 'c1') => ({ id, label: `Series ${id}`, tone, values })

/** One valid spec of each kind, with every optional field the kind can use. */
const VALID: Record<ChartKind, () => ChartSpec> = {
  line: () => ({
    v: 1,
    kind: 'line',
    title: 'Profit by year',
    unit: 'money',
    x: [2020, 2021, 2022],
    series: [series('profit', [10, null, 30]), series('cost', [5, 6, 7], 'c2')],
    marks: [{ at: 2021, label: 'Recession' }],
    basis: 2026,
    note: 'Prices of 2026.',
    summary: 'Profit grew from 10 to 30 over three years.',
  }),
  bars: () => ({ v: 1, kind: 'bars', title: 'Costs', unit: 'money', x: ['Wages', 'Rent'], series: [series('c', [3, 4], 'c2')], summary: 'Wages cost 3 and rent cost 4.' }),
  stack: () => ({
    v: 1,
    kind: 'stack',
    title: 'Where sales came from',
    unit: 'pct',
    x: ['2021', '2022'],
    series: [series('a', [60, 55]), series('b', [40, 45], 'c3')],
    summary: 'Two products split the sales.',
  }),
  waterfall: () => ({
    v: 1,
    kind: 'waterfall',
    title: 'Profit and loss',
    unit: 'money',
    x: [],
    series: [],
    steps: [
      { label: 'Revenue', value: 100, kind: 'total' },
      { label: 'Costs', value: -60, kind: 'delta' },
      { label: 'Profit', value: 40, kind: 'total' },
    ],
    basis: 2031,
    summary: 'Revenue 100, costs 60, profit 40.',
  }),
  ladder: () => ({
    v: 1,
    kind: 'ladder',
    title: 'Market share',
    unit: 'pct',
    x: [],
    series: [],
    rows: [
      { id: 'you', name: 'Your company', value: 31.5, rank: 1, prevRank: 2, prev: 28, spark: [20, 25, null, 31.5], you: true },
      { id: 'acme', name: 'Acme Corp', value: 22, rank: 2, prevRank: null, prev: null, spark: [] },
    ],
    summary: 'You lead the market with 31.5 percent.',
  }),
  timeline: () => ({
    v: 1,
    kind: 'timeline',
    title: 'Net worth by age',
    unit: 'money',
    x: [18, 19, 20],
    series: [series('nw', [0, 5, 9])],
    marks: [{ at: 18, label: 'First job' }],
    summary: 'Net worth rose from nothing to 9.',
  }),
  meter: () => ({ v: 1, kind: 'meter', title: 'Stability', unit: 'pct', x: [], series: [series('s', [70], 'muted')], summary: 'Stability is at 70 percent.' }),
  kpi: () => ({
    v: 1,
    kind: 'kpi',
    title: 'Profit',
    unit: 'money',
    x: [],
    series: [series('p', [-5], 'bad')],
    note: 'Down from last year.',
    summary: 'You lost 5 this year.',
  }),
}

const KINDS = Object.keys(VALID) as ChartKind[]

/** A fresh, valid line spec for the hostile table to damage. */
const base = (): Record<string, unknown> => VALID.line() as unknown as Record<string, unknown>
const ladder = (): Record<string, unknown> => VALID.ladder() as unknown as Record<string, unknown>
const row = (patch: Record<string, unknown>) => {
  const r = ladder()
  ;(r.rows as Record<string, unknown>[])[0] = { ...(r.rows as Record<string, unknown>[])[0]!, ...patch }
  return r
}
const withSeries = (patch: Record<string, unknown>) => {
  const b = base()
  ;(b.series as Record<string, unknown>[])[0] = { ...(b.series as Record<string, unknown>[])[0]!, ...patch }
  return b
}
const withX = (x: unknown) => ({ ...base(), x })
const longText = (n: number) => 'a'.repeat(n)

describe('readChartSpec: valid specs', () => {
  it('each of the 8 kinds survives JSON and the reader unchanged', () => {
    expect(KINDS).toEqual(['line', 'bars', 'stack', 'waterfall', 'ladder', 'timeline', 'meter', 'kpi'])
    for (const kind of KINDS) {
      const spec = VALID[kind]()
      const read = readChartSpec(JSON.parse(JSON.stringify(spec)))
      expect(read, kind).toEqual(spec)
    }
  })

  it('reads a frozen spec (builders freeze the state they read)', () => {
    for (const kind of KINDS) expect(readChartSpec(deepFreeze(VALID[kind]())), kind).toEqual(VALID[kind]())
  })

  it('accepts the edges of every limit', () => {
    const edge: Record<string, unknown> = {
      v: 1,
      kind: 'line',
      title: longText(CHART_LIMITS.title),
      unit: 'count',
      x: Array.from({ length: CHART_LIMITS.points }, (_, i) => (i % 2 ? 'x'.repeat(40) : 1e15)),
      series: Array.from({ length: CHART_LIMITS.series }, (_, i) => ({
        id: `${'s'.repeat(23)}${i}`,
        label: longText(SPEC_LIMITS.label),
        tone: 'c1',
        values: Array.from({ length: CHART_LIMITS.points }, (_, j) => (j % 3 ? -1e15 : null)),
      })),
      marks: Array.from({ length: CHART_LIMITS.marks }, () => ({ at: -1e15, label: longText(40) })),
      basis: 1800,
      note: longText(SPEC_LIMITS.note),
      summary: longText(CHART_LIMITS.text),
    }
    expect(readChartSpec(edge)).toEqual(edge)
    const ranks = ladder()
    ranks.rows = Array.from({ length: SPEC_LIMITS.rows }, (_, i) => ({
      id: `r${i}`.padEnd(24, 'z'),
      name: longText(40),
      value: 1e15,
      rank: 1_000_000,
      prevRank: 1,
      prev: -1e15,
      spark: Array.from({ length: SPEC_LIMITS.spark }, () => 0),
    }))
    ranks.basis = 2300
    expect(readChartSpec(ranks)).toEqual(ranks)
  })

  it('pins SPEC_LIMITS and leaves CHART_LIMITS as R1-P2 wrote it', () => {
    expect(SPEC_LIMITS).toEqual({ rows: 12, spark: 12, label: 40, note: 60, id: 24, magnitude: 1e15 })
    expect(CHART_LIMITS).toEqual({ title: 60, text: 120, points: 64, series: 6, steps: 20, marks: 8 })
    expectTypeOf(SPEC_LIMITS).toEqualTypeOf<{
      readonly rows: 12
      readonly spark: 12
      readonly label: 40
      readonly note: 60
      readonly id: 24
      readonly magnitude: 1e15
    }>()
    expectTypeOf<LadderRow['prevRank']>().toEqualTypeOf<number | null>()
    expectTypeOf<LadderRow['spark']>().toEqualTypeOf<(number | null)[]>()
    expectTypeOf<LadderRow['you']>().toEqualTypeOf<true | undefined>()
    expectTypeOf<ChartSpec['rows']>().toEqualTypeOf<LadderRow[] | undefined>()
    expectTypeOf<ChartSpec['basis']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<ChartSpec['note']>().toEqualTypeOf<string | undefined>()
  })
})

describe('readChartSpec: hostile input', () => {
  // The line spec above must read, or every null below proves nothing.
  it('the base spec the table damages is itself valid', () => {
    expect(readChartSpec(base())).not.toBeNull()
    expect(readChartSpec(ladder())).not.toBeNull()
  })

  const nan = (): Record<string, unknown> => withX([2020, Number.NaN, 2022])
  const HOSTILE: [string, () => unknown][] = [
    ['null', () => null],
    ['a string', () => 'line'],
    ['a number', () => 5],
    ['an array', () => [base()]],
    ['undefined', () => undefined],
    ['v is 2', () => ({ ...base(), v: 2 })],
    ['v is missing', () => ({ ...base(), v: undefined })],
    ['v is the string 1', () => ({ ...base(), v: '1' })],
    ['unknown kind', () => ({ ...base(), kind: 'pie' })],
    ['unknown unit', () => ({ ...base(), unit: 'dollars' })],
    ['unknown tone', () => withSeries({ tone: 'c9' })],
    ['empty title', () => ({ ...base(), title: '' })],
    ['title one over the limit', () => ({ ...base(), title: longText(CHART_LIMITS.title + 1) })],
    ['title with a control character', () => ({ ...base(), title: 'Profit\nby year' })],
    ['title is a number', () => ({ ...base(), title: 7 })],
    ['empty summary', () => ({ ...base(), summary: '' })],
    ['summary one over the limit', () => ({ ...base(), summary: longText(CHART_LIMITS.text + 1) })],
    ['summary with a tab', () => ({ ...base(), summary: 'Up.\tDown.' })],
    ['too many x entries', () => withX(Array.from({ length: CHART_LIMITS.points + 1 }, (_, i) => i))],
    ['NaN in x', nan],
    ['Infinity in x', () => withX([1, Number.POSITIVE_INFINITY, 3])],
    ['null in x', () => withX([2020, null, 2022])],
    ['an object in x', () => withX([2020, {}, 2022])],
    ['1e16 in x', () => withX([2020, 1e16, 2022])],
    ['an empty string in x', () => withX([2020, '', 2022])],
    ['a 41-character string in x', () => withX([2020, longText(41), 2022])],
    ['seven series', () => ({ ...base(), series: Array.from({ length: CHART_LIMITS.series + 1 }, (_, i) => series(`s${i}`, [1, 2, 3])) })],
    ['uppercase series id', () => withSeries({ id: 'Profit' })],
    ['25-character series id', () => withSeries({ id: longText(25) })],
    ['empty series id', () => withSeries({ id: '' })],
    ['__proto__ as a series id', () => withSeries({ id: '__proto__' })],
    ['constructor as a series id', () => withSeries({ id: 'constructor' })],
    ['41-character series label', () => withSeries({ label: longText(41) })],
    ['empty series label', () => withSeries({ label: '' })],
    ['65 values', () => ({ ...withX(Array.from({ length: 65 }, (_, i) => i)), series: [series('a', Array.from({ length: 65 }, () => 1))] })],
    ['a string among the values', () => withSeries({ values: [1, 'two', 3] })],
    ['NaN among the values', () => withSeries({ values: [1, Number.NaN, 3] })],
    ['-Infinity among the values', () => withSeries({ values: [1, Number.NEGATIVE_INFINITY, 3] })],
    ['1e16 among the values', () => withSeries({ values: [1, 1e16, 3] })],
    ['a hole among the values', () => withSeries({ values: [1, undefined, 3] })],
    ['values shorter than x', () => withSeries({ values: [1, 2] })],
    ['values longer than x', () => withSeries({ values: [1, 2, 3, 4] })],
    ['a line with no x', () => ({ ...base(), x: [], series: [series('a', [])] })],
    ['a line with no series', () => ({ ...base(), series: [] })],
    ['a kpi with no series', () => ({ ...VALID.kpi(), series: [] })],
    ['a meter with no series', () => ({ ...VALID.meter(), series: [] })],
    ['21 steps', () => ({ ...VALID.waterfall(), steps: Array.from({ length: 21 }, (_, i) => ({ label: `s${i}`, value: i, kind: 'delta' })) })],
    ['one waterfall step', () => ({ ...VALID.waterfall(), steps: [{ label: 'Revenue', value: 1, kind: 'total' }] })],
    ['no waterfall steps', () => ({ ...VALID.waterfall(), steps: undefined })],
    ['unknown step kind', () => ({ ...VALID.waterfall(), steps: [{ label: 'a', value: 1, kind: 'sum' }, { label: 'b', value: 1, kind: 'total' }] })],
    ['NaN step value', () => ({ ...VALID.waterfall(), steps: [{ label: 'a', value: Number.NaN, kind: 'total' }, { label: 'b', value: 1, kind: 'total' }] })],
    ['empty step label', () => ({ ...VALID.waterfall(), steps: [{ label: '', value: 1, kind: 'total' }, { label: 'b', value: 1, kind: 'total' }] })],
    ['nine marks', () => ({ ...base(), marks: Array.from({ length: CHART_LIMITS.marks + 1 }, () => ({ at: 1, label: 'm' })) })],
    ['a mark at NaN', () => ({ ...base(), marks: [{ at: Number.NaN, label: 'm' }] })],
    ['a 41-character mark label', () => ({ ...base(), marks: [{ at: 1, label: longText(41) }] })],
    ['13 ladder rows', () => ({ ...ladder(), rows: Array.from({ length: SPEC_LIMITS.rows + 1 }, (_, i) => ({ id: `r${i}`, name: 'n', value: 1, rank: i + 1, prevRank: null, prev: null, spark: [] })) })],
    ['a ladder with no rows', () => ({ ...ladder(), rows: [] })],
    ['a ladder with rows missing', () => ({ ...ladder(), rows: undefined })],
    ['rank 0', () => row({ rank: 0 })],
    ['rank 1.5', () => row({ rank: 1.5 })],
    ['rank 1,000,001', () => row({ rank: 1_000_001 })],
    ['prevRank 0', () => row({ prevRank: 0 })],
    ['prevRank is undefined', () => row({ prevRank: undefined })],
    ['prev is a string', () => row({ prev: '3' })],
    ['13 spark points', () => row({ spark: Array.from({ length: SPEC_LIMITS.spark + 1 }, () => 1) })],
    ['NaN in a spark', () => row({ spark: [1, Number.NaN] })],
    ['25-character row id', () => row({ id: longText(25) })],
    ['__proto__ as a row id', () => row({ id: '__proto__' })],
    ['empty row name', () => row({ name: '' })],
    ['row value 1e16', () => row({ value: 1e16 })],
    ['you is false', () => row({ you: false })],
    ['basis 1799', () => ({ ...base(), basis: 1799 })],
    ['basis 2301', () => ({ ...base(), basis: 2301 })],
    ['basis NaN', () => ({ ...base(), basis: Number.NaN })],
    ['basis is a string', () => ({ ...base(), basis: '2026' })],
    ['61-character note', () => ({ ...base(), note: longText(SPEC_LIMITS.note + 1) })],
    ['empty note', () => ({ ...base(), note: '' })],
    ['note with a control character', () => ({ ...base(), note: 'a\u0000b' })],
  ]

  it('returns null for each of the 40 plus hostile inputs, never a truncated spec', () => {
    expect(HOSTILE.length).toBeGreaterThanOrEqual(40)
    for (const [name, make] of HOSTILE) expect(readChartSpec(make()), name).toBeNull()
  })

  it('returns null for a spec whose JSON text carries a poisoned series id', () => {
    const text = JSON.stringify(base()).replace('"profit"', '"__proto__"')
    expect(readChartSpec(JSON.parse(text))).toBeNull()
  })

  it('never throws on odd values', () => {
    const weird: unknown[] = [Symbol('x'), () => 1, new Date(0), new Map(), Object.create(null), 10n, { v: 1 }, { ...base(), series: 'x' }, { ...base(), x: 'abc' }]
    for (const w of weird) expect(() => readChartSpec(w)).not.toThrow()
    expect(readChartSpec(Object.create(null))).toBeNull()
  })
})

describe('readChartSpec: keys and copies', () => {
  it('drops unknown keys and never copies __proto__, constructor or prototype', () => {
    const spec = JSON.stringify(VALID.waterfall())
    const text = `{"__proto__":{"polluted":1},"constructor":{"x":1},"prototype":{"y":2},"extra":5,${spec.slice(1)}`
    const parsed = JSON.parse(text) as Record<string, unknown>
    expect(Object.keys(parsed)).toContain('__proto__')
    const read = readChartSpec(parsed)
    expect(read).not.toBeNull()
    expect(Object.keys(read!).sort()).toEqual(Object.keys(VALID.waterfall()).sort())
    for (const k of ['__proto__', 'constructor', 'prototype', 'extra']) expect(Object.prototype.hasOwnProperty.call(read, k)).toBe(false)
    expect(Object.getPrototypeOf(read)).toBe(Object.prototype)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(({} as Record<string, unknown>).x).toBeUndefined()
  })

  it('drops unknown keys inside series, steps, marks and rows too', () => {
    const b = base()
    ;(b.series as Record<string, unknown>[])[0]!.evil = { deep: 1 }
    ;(b.marks as Record<string, unknown>[])[0]!.evil = 1
    const l = ladder()
    ;(l.rows as Record<string, unknown>[])[0]!.evil = 1
    const w = VALID.waterfall() as unknown as Record<string, unknown>
    ;(w.steps as Record<string, unknown>[])[0]!.evil = 1
    const text = JSON.parse(
      JSON.stringify(b).replace('{"id":"profit"', '{"__proto__":{"polluted":1},"id":"profit"'),
    ) as Record<string, unknown>
    for (const [input, kind] of [[text, 'line'], [l, 'ladder'], [w, 'waterfall']] as const) {
      const read = readChartSpec(input)
      expect(read, kind).not.toBeNull()
      expect(JSON.stringify(read), kind).not.toContain('evil')
      expect(JSON.stringify(read), kind).not.toContain('polluted')
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('does not alias its input', () => {
    for (const kind of KINDS) {
      const input = JSON.parse(JSON.stringify(VALID[kind]())) as Record<string, unknown>
      const read = readChartSpec(input)!
      const before = JSON.stringify(read)
      input.title = 'changed'
      input.summary = 'changed'
      for (const k of ['x', 'series', 'steps', 'marks', 'rows']) {
        const list = input[k] as unknown[] | undefined
        if (!list) continue
        for (const item of list) {
          if (item && typeof item === 'object') {
            const o = item as Record<string, unknown>
            for (const key of Object.keys(o)) {
              if (Array.isArray(o[key])) (o[key] as unknown[]).push(99)
              else if (typeof o[key] === 'number') o[key] = 12345
              else if (typeof o[key] === 'string') o[key] = 'changed'
            }
          }
        }
        list.push(7)
      }
      expect(JSON.stringify(read), kind).toBe(before)
    }
    // And the result is a new object each time.
    const spec = VALID.line()
    expect(readChartSpec(spec)).not.toBe(spec)
    expect(readChartSpec(spec)!.series[0]!.values).not.toBe(spec.series[0]!.values)
  })
})

describe('readChartSpec: cost', () => {
  it('rejects a 5,000,000 element x array in under 50 ms (the length is checked before the walk)', () => {
    const x = new Array<number>(5_000_000).fill(1)
    const input = { ...base(), x }
    const t0 = performance.now()
    const read = readChartSpec(input)
    const ms = performance.now() - t0
    expect(read).toBeNull()
    expect(ms).toBeLessThan(50)
  })

  it('is just as quick on huge series values, steps, marks, rows and sparks', () => {
    const huge = new Array<number>(5_000_000).fill(1)
    const inputs = [
      withSeries({ values: huge }),
      { ...VALID.waterfall(), steps: huge },
      { ...base(), marks: huge },
      { ...ladder(), rows: huge },
      row({ spark: huge }),
      { ...base(), series: huge },
    ]
    const t0 = performance.now()
    for (const input of inputs) expect(readChartSpec(input)).toBeNull()
    expect(performance.now() - t0).toBeLessThan(50)
  })
})

describe('reveal', () => {
  it('is the identity in R1 (R3 replaces the body)', () => {
    for (const kind of KINDS) {
      const spec = VALID[kind]()
      expect(reveal(spec)).toBe(spec)
    }
  })
})
