// R1 review (charts-ui): ChartView gives useScrub the width of the drawing box next to the insets. The insets of the line
// and bar plots (LINE_INSET, barInset) are in the units of the 320 wide drawing box and the svg scales to its container,
// so without `span` a pointer is mapped with box units read as pixels and the end points are mis-picked at any width but
// 320. useScrub is wrapped here to record what ChartView asks of it; the hook itself is tested in test/chart-geometry.test.ts.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bindMoneyContext, setMoneyDisplay } from '../src/game/core'
import '../src/game/data/currencies'
import type { ChartSpec } from '../src/game/charts/spec'
import { ChartView } from '../src/ui/charts/ChartView'
import { barInset } from '../src/ui/charts/BarChart'
import { BOX, LINE_INSET } from '../src/ui/charts/LineChart'
import { useScrub } from '../src/ui/charts/useScrub'

vi.mock('../src/ui/charts/useScrub', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/ui/charts/useScrub')>()
  return { ...real, useScrub: vi.fn(real.useScrub) }
})

const spy = vi.mocked(useScrub)

beforeEach(() => {
  spy.mockClear()
})

afterEach(() => {
  setMoneyDisplay({ mode: 'usd', nominal: false })
  bindMoneyContext(null)
})

function spec(kind: ChartSpec['kind'], points = 30): ChartSpec {
  return {
    v: 1,
    kind,
    title: 'Net profit',
    unit: 'money',
    x: Array.from({ length: points }, (_, i) => 1990 + i),
    series: [
      { id: 'a', label: 'Net profit', tone: 'c1', values: Array.from({ length: points }, (_, i) => 100_000 + i * 10_000) },
      { id: 'b', label: 'Cash', tone: 'c2', values: Array.from({ length: points }, (_, i) => 50_000 + i * 20_000) },
    ],
    summary: 'Net profit rose.',
  }
}

/** The options ChartView passed to its own useScrub call: the first, as the parent renders before its children. */
function optionsFor(s: ChartSpec): Parameters<typeof useScrub>[1] {
  spy.mockClear()
  renderToStaticMarkup(createElement(ChartView, { spec: s }))
  expect(spy).toHaveBeenCalled()
  return spy.mock.calls[0]![1]
}

describe('ChartView and the pointer', () => {
  it('measures the insets of a line and a timeline in the units of the drawing box', () => {
    for (const kind of ['line', 'timeline'] as const) {
      const opts = optionsFor(spec(kind))
      expect(opts?.inset, kind).toEqual(LINE_INSET)
      expect(opts?.span, kind).toBe(BOX.w)
    }
  })

  it('measures the insets of bars and a stack in the units of the drawing box', () => {
    for (const kind of ['bars', 'stack'] as const) {
      const opts = optionsFor(spec(kind, 12))
      expect(opts?.inset, kind).toEqual(barInset(12))
      expect(opts?.span, kind).toBe(BOX.w)
    }
  })

  it('gives a chart with no pixel insets no span either', () => {
    const wf: ChartSpec = { ...spec('waterfall'), x: [], series: [], steps: [{ label: 'Sales', value: 10, kind: 'total' }] }
    expect(optionsFor(wf)).toBeUndefined()
  })
})
