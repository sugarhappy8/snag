// The shared optional types of Release R1 (R1-P2). Every R1 track reads these fields and nobody else
// edits types.ts: the menu row fields (keywords, section, badge, conf, spark), the info row chart,
// the notice weight and link, the annual report chart, and the chart spec types in charts/spec.ts.
// It is types plus two conditional spreads in notice(), so most of this file is compile-time:
// `npm run typecheck` is what checks the expectTypeOf lines.
import { readFileSync } from 'node:fs'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { notice, type NoticeOptions } from '../src/game/core'
import {
  CHART_LIMITS,
  type ChartKind,
  type ChartMark,
  type ChartSeries,
  type ChartSpec,
  type ChartStep,
  type ChartTone,
  type ChartUnit,
} from '../src/game/charts/spec'
import type {
  AnnualReportData,
  GameState,
  Json,
  MenuAction,
  MenuGroup,
  MenuHeading,
  MenuInfo,
  NoticeModal,
} from '../src/game/types'
import { makeTestGame } from './helpers'

/** The keys a plain notice has had since before R1 (emoji and tone are always written, maybe undefined). */
const PLAIN_KEYS = ['kind', 'id', 'title', 'text', 'emoji', 'tone']

/** The one notice a fresh test game pushes, with its id fixed by the game's counter. */
function pushed(opts?: NoticeOptions): NoticeModal {
  const g = makeTestGame()
  notice(g, 't', 'x', opts)
  expect(g.queue).toHaveLength(1)
  return g.queue[0] as NoticeModal
}

describe('menu row types (compile-time, checked by npm run typecheck)', () => {
  it('MenuAction and MenuGroup share the new row fields', () => {
    expectTypeOf<MenuAction['keywords']>().toEqualTypeOf<readonly string[] | undefined>()
    expectTypeOf<MenuGroup['keywords']>().toEqualTypeOf<readonly string[] | undefined>()
    expectTypeOf<MenuAction['section']>().toEqualTypeOf<string | undefined>()
    expectTypeOf<MenuGroup['section']>().toEqualTypeOf<string | undefined>()
    expectTypeOf<MenuAction['conf']>().toEqualTypeOf<0 | 1 | 2 | 3 | undefined>()
    expectTypeOf<MenuGroup['conf']>().toEqualTypeOf<0 | 1 | 2 | 3 | undefined>()

    expectTypeOf<NonNullable<MenuAction['badge']>>().parameters.toEqualTypeOf<[GameState]>()
    expectTypeOf<NonNullable<MenuAction['badge']>>().returns.toEqualTypeOf<string | number | null>()
    expectTypeOf<NonNullable<MenuGroup['badge']>>().returns.toEqualTypeOf<string | number | null>()

    expectTypeOf<NonNullable<MenuAction['spark']>>().parameters.toEqualTypeOf<[GameState]>()
    expectTypeOf<NonNullable<MenuAction['spark']>>().returns.toEqualTypeOf<(number | null)[] | null>()
    expectTypeOf<NonNullable<MenuGroup['spark']>>().returns.toEqualTypeOf<(number | null)[] | null>()
  })

  it('a row can carry the new fields and an array literal of search words is accepted', () => {
    const row: MenuAction = {
      type: 'action',
      id: 'a',
      label: 'A',
      emoji: 'x',
      keywords: ['cash', 'bank'],
      section: 'money',
      badge: () => 2,
      conf: 3,
      spark: () => [1, null, 3],
      run: () => {},
    }
    expect(row.keywords).toEqual(['cash', 'bank'])
    expect(row.badge?.(makeTestGame())).toBe(2)
  })

  it('MenuInfo gets chart and conf only', () => {
    expectTypeOf<MenuInfo['conf']>().toEqualTypeOf<0 | 1 | 2 | 3 | undefined>()
    expectTypeOf<NonNullable<MenuInfo['chart']>>().parameters.toEqualTypeOf<[GameState]>()
    expectTypeOf<NonNullable<MenuInfo['chart']>>().returns.toEqualTypeOf<ChartSpec | null>()
    expectTypeOf<MenuInfo>().not.toHaveProperty('keywords')
    expectTypeOf<MenuInfo>().not.toHaveProperty('badge')
  })

  it('MenuHeading is unchanged', () => {
    const heading: MenuHeading = { type: 'heading', id: 'h', label: 'Money' }
    for (const key of ['keywords', 'section', 'badge', 'conf', 'spark', 'chart'] as const) {
      // @ts-expect-error a heading has none of the new row keys
      expect(heading[key]).toBeUndefined()
    }
  })
})

describe('notice and report types (compile-time, checked by npm run typecheck)', () => {
  it('NoticeModal and NoticeOptions carry an optional weight and link', () => {
    expectTypeOf<NoticeModal['weight']>().toEqualTypeOf<'minor' | undefined>()
    expectTypeOf<NoticeModal['link']>().toEqualTypeOf<string | undefined>()
    expectTypeOf<NoticeOptions['weight']>().toEqualTypeOf<'minor' | undefined>()
    expectTypeOf<NoticeOptions['link']>().toEqualTypeOf<string | undefined>()
  })

  it('AnnualReportData has an optional Json chart', () => {
    expectTypeOf<AnnualReportData['chart']>().toEqualTypeOf<Json | undefined>()
  })
})

describe('notice() weight and link', () => {
  it('a plain notice is saved exactly as before', () => {
    const m = pushed()
    expect(Object.keys(m)).toEqual(PLAIN_KEYS)
    expect(JSON.stringify(m)).toBe('{"kind":"notice","id":"m1","title":"t","text":"x"}')
  })

  it('emoji, tone and support keep their place and their bytes', () => {
    const m = pushed({ emoji: 'E', tone: 'good', support: true })
    expect(Object.keys(m)).toEqual([...PLAIN_KEYS, 'support'])
    expect(JSON.stringify(m)).toBe('{"kind":"notice","id":"m1","title":"t","text":"x","emoji":"E","tone":"good","support":true}')
  })

  it('weight minor adds exactly one key', () => {
    const m = pushed({ weight: 'minor' })
    expect(Object.keys(m)).toEqual([...PLAIN_KEYS, 'weight'])
    expect(m.weight).toBe('minor')
    expect(JSON.stringify(m)).toBe('{"kind":"notice","id":"m1","title":"t","text":"x","weight":"minor"}')
  })

  it('any other weight adds nothing', () => {
    const m = pushed({ weight: 'major' as never })
    expect(Object.keys(m)).toEqual(PLAIN_KEYS)
    expect('weight' in m).toBe(false)
  })

  it('a link adds exactly one key and an empty link adds none', () => {
    const withLink = pushed({ link: 'assets/home' })
    expect(Object.keys(withLink)).toEqual([...PLAIN_KEYS, 'link'])
    expect(withLink.link).toBe('assets/home')

    const empty = pushed({ link: '' })
    expect(Object.keys(empty)).toEqual(PLAIN_KEYS)
    expect('link' in empty).toBe(false)
  })

  it('support, weight and link come after the plain keys, in that order', () => {
    const m = pushed({ support: true, weight: 'minor', link: 'assets/home' })
    expect(Object.keys(m)).toEqual([...PLAIN_KEYS, 'support', 'weight', 'link'])
  })

  it('does not draw from the game rng', () => {
    const g = makeTestGame(7)
    notice(g, 't', 'x', { weight: 'minor', link: 'assets/home' })
    expect(g.rng).toBe(7)
  })
})

describe('charts/spec.ts', () => {
  it('CHART_LIMITS holds the D.2 numbers', () => {
    expect(CHART_LIMITS).toEqual({ title: 60, text: 120, points: 64, series: 6, steps: 20, marks: 8 })
    expectTypeOf(CHART_LIMITS).toEqualTypeOf<{
      readonly title: 60
      readonly text: 120
      readonly points: 64
      readonly series: 6
      readonly steps: 20
      readonly marks: 8
    }>()
  })

  it('names the tones, kinds and units of the spec', () => {
    expectTypeOf<ChartTone>().toEqualTypeOf<'c1' | 'c2' | 'c3' | 'c4' | 'c5' | 'c6' | 'good' | 'bad' | 'muted'>()
    expectTypeOf<ChartKind>().toEqualTypeOf<'line' | 'bars' | 'stack' | 'waterfall' | 'ladder' | 'timeline' | 'meter' | 'kpi'>()
    expectTypeOf<ChartUnit>().toEqualTypeOf<'money' | 'pct' | 'count' | 'rank' | 'years'>()
    expectTypeOf<ChartSeries['values']>().toEqualTypeOf<(number | null)[]>()
    expectTypeOf<ChartStep['kind']>().toEqualTypeOf<'total' | 'delta'>()
    expectTypeOf<ChartMark>().toEqualTypeOf<{ at: number; label: string }>()
    expectTypeOf<ChartSpec['v']>().toEqualTypeOf<1>()
    expectTypeOf<ChartSpec['steps']>().toEqualTypeOf<ChartStep[] | undefined>()
    expectTypeOf<ChartSpec['marks']>().toEqualTypeOf<ChartMark[] | undefined>()
  })

  const one = (id: string, tone: ChartTone, values: (number | null)[]): ChartSeries => ({ id, label: id, tone, values })

  /** One literal spec per kind: Record<ChartKind, ...> fails to compile if a kind is missing or extra. */
  const SPECS: Record<ChartKind, ChartSpec> = {
    line: { v: 1, kind: 'line', title: 'Net worth', unit: 'money', x: [2020, 2021, 2022], series: [one('nw', 'c1', [1, 2, null])], summary: 'Up.' },
    bars: { v: 1, kind: 'bars', title: 'Costs', unit: 'money', x: ['2020', '2021'], series: [one('c', 'c2', [3, 4])], summary: 'Costs rose.' },
    stack: { v: 1, kind: 'stack', title: 'Sales', unit: 'pct', x: ['a', 'b'], series: [one('a', 'c3', [60, 60]), one('b', 'c4', [40, 40])], summary: 'Two shares.' },
    waterfall: {
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
      summary: 'Revenue 100, costs 60, profit 40.',
    },
    ladder: { v: 1, kind: 'ladder', title: 'Rank', unit: 'rank', x: [1, 2, 3], series: [one('r', 'good', [3, 2, 1])], summary: 'Rank 1.' },
    timeline: {
      v: 1,
      kind: 'timeline',
      title: 'Net worth by age',
      unit: 'money',
      x: [18, 19],
      series: [one('nw', 'c1', [0, 5])],
      marks: [{ at: 18, label: 'First job' }],
      summary: 'Up.',
    },
    meter: { v: 1, kind: 'meter', title: 'Stability', unit: 'pct', x: [], series: [one('s', 'muted', [70])], summary: '70 percent.' },
    kpi: { v: 1, kind: 'kpi', title: 'Profit', unit: 'money', x: [], series: [one('p', 'bad', [-5])], summary: 'Lost 5.' },
  }

  it('a literal spec of every kind compiles and stays inside the limits', () => {
    expect(Object.keys(SPECS)).toEqual(['line', 'bars', 'stack', 'waterfall', 'ladder', 'timeline', 'meter', 'kpi'])
    for (const [kind, spec] of Object.entries(SPECS)) {
      expect(spec.kind).toBe(kind)
      expect(spec.title.length).toBeLessThanOrEqual(CHART_LIMITS.title)
      expect(spec.summary.length).toBeLessThanOrEqual(CHART_LIMITS.text)
      expect(spec.x.length).toBeLessThanOrEqual(CHART_LIMITS.points)
      expect(spec.series.length).toBeLessThanOrEqual(CHART_LIMITS.series)
      expect((spec.steps ?? []).length).toBeLessThanOrEqual(CHART_LIMITS.steps)
      expect((spec.marks ?? []).length).toBeLessThanOrEqual(CHART_LIMITS.marks)
    }
  })

  it('a spec is plain JSON, so a modal can carry it', () => {
    for (const spec of Object.values(SPECS)) expect(JSON.parse(JSON.stringify(spec))).toEqual(spec)
  })

  it('has no import line, so it stays a leaf both ways', () => {
    const text = readFileSync(new URL('../src/game/charts/spec.ts', import.meta.url), 'utf8')
    expect(text).not.toMatch(/^\s*import[\s({]/m)
    expect(text).not.toMatch(/\brequire\(/)
  })
})
