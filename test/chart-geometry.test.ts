// R1-C2: the pure helpers under the chart kit (src/ui/charts/geometry.ts, useScrub.ts, format.ts, table.ts).
// Everything here is a pure function (or a hook rendered on the server), so the tests need no DOM. Random input
// comes from a seeded LCG, never the global random generator, so a failure replays.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindMoneyContext, setMoneyDisplay, shortMoney } from '../src/game/core'
import '../src/game/data/currencies'
import type { ChartKind, ChartSpec, ChartUnit } from '../src/game/charts/spec'
import { describeDelta, formatSigned, formatUnit, readoutFor } from '../src/ui/charts/format'
import {
  MARKER_SHAPES,
  dodgeLabels,
  extentOf,
  indexAt,
  linePath,
  linearScale,
  markerPath,
  niceTicks,
  stackLayout,
  waterfallLayout,
  xTicks,
} from '../src/ui/charts/geometry'
import { specTable } from '../src/ui/charts/table'
import { scrubIndex, scrubReducer, useScrub, type ScrubApi, type ScrubState } from '../src/ui/charts/useScrub'
import { makeTestGame } from './helpers'

function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

const BAD = /NaN|Infinity|undefined/
// The en dash and the em dash, written as escapes so this file holds neither character.
const DASHES = new RegExp('[\\u2013\\u2014]')

afterEach(() => {
  setMoneyDisplay({ mode: 'usd', nominal: false })
  bindMoneyContext(null)
})

describe('linearScale', () => {
  it('maps the endpoints and the middle, forward and reversed', () => {
    const up = linearScale(0, 10, 100, 200)
    expect(up(0)).toBe(100)
    expect(up(10)).toBe(200)
    expect(up(5)).toBe(150)
    const down = linearScale(0, 4, 100, 0)
    expect(down(0)).toBe(100)
    expect(down(4)).toBe(0)
    expect(down(1)).toBe(75)
  })

  it('is monotone for any domain and range', () => {
    const r = lcg(11)
    for (let t = 0; t < 60; t++) {
      const d0 = (r() - 0.5) * 1000
      const d1 = d0 + 1 + r() * 1000
      const r0 = r() * 300
      const r1 = r() * 300
      const s = linearScale(d0, d1, r0, r1)
      let prev = s(d0 - 50)
      for (let i = 1; i <= 20; i++) {
        const v = s(d0 - 50 + (i * (d1 - d0 + 100)) / 20)
        if (r1 >= r0) expect(v).toBeGreaterThanOrEqual(prev)
        else expect(v).toBeLessThanOrEqual(prev)
        prev = v
      }
    }
  })

  it('gives the midpoint of the range for a degenerate domain', () => {
    expect(linearScale(5, 5, 0, 100)(5)).toBe(50)
    expect(linearScale(5, 5, 0, 100)(9999)).toBe(50)
    expect(linearScale(NaN, 5, 0, 100)(3)).toBe(50)
    expect(linearScale(0, Infinity, 0, 100)(3)).toBe(50)
  })

  it('gives the start of the range for a non-finite input, and never a non-finite number', () => {
    const s = linearScale(0, 10, 20, 80)
    expect(s(NaN)).toBe(20)
    expect(s(Infinity)).toBe(20)
    expect(s(-Infinity)).toBe(20)
    expect(Number.isFinite(linearScale(0, 1e-300, 0, 100)(1e300))).toBe(true)
    expect(Number.isFinite(linearScale(0, 10, NaN, Infinity)(5))).toBe(true)
  })
})

describe('extentOf and niceTicks', () => {
  it('answers [0, 1] for nothing, and widens a constant', () => {
    expect(extentOf([])).toEqual([0, 1])
    expect(extentOf([null, undefined, NaN, Infinity])).toEqual([0, 1])
    const [lo, hi] = extentOf([5, 5, 5])
    expect(lo).toBeLessThan(5)
    expect(hi).toBeGreaterThan(5)
    expect(extentOf([0, 0])).toEqual([0, 1])
    expect(extentOf([5, 7], { zero: true })).toEqual([0, 7])
    expect(extentOf([-5, -7], { zero: true })).toEqual([-7, 0])
    const [plo, phi] = extentOf([0, 10], { pad: 0.1 })
    expect(plo).toBeCloseTo(-1, 9)
    expect(phi).toBeCloseTo(11, 9)
  })

  it('reads known ranges the way a person would', () => {
    expect(niceTicks(0, 100, 5)).toEqual([0, 20, 40, 60, 80, 100])
    expect(niceTicks(0, 1, 4)).toEqual([0, 0.5, 1])
    expect(niceTicks(-3, 7, 5)).toEqual([-2, 0, 2, 4, 6])
    expect(niceTicks(0, 0.3, 3)).toEqual([0, 0.1, 0.2, 0.3])
    expect(niceTicks(7, 7)).toEqual([7])
    expect(niceTicks(10, 0, 5)).toEqual(niceTicks(0, 10, 5))
  })

  it('holds its promises over 500 random series', () => {
    const r = lcg(2026)
    for (let t = 0; t < 500; t++) {
      const len = Math.floor(r() * 71)
      const mag = 10 ** (-9 + r() * 24)
      const values: (number | null)[] = []
      for (let i = 0; i < len; i++) {
        const u = r()
        values.push(u < 0.05 ? null : u < 0.08 ? NaN : u < 0.1 ? Infinity : (r() * 2 - 1) * mag)
      }
      const zero = r() < 0.5
      const [lo, hi] = extentOf(values, { zero, pad: r() < 0.5 ? 0.05 : undefined })
      expect(Number.isFinite(lo) && Number.isFinite(hi)).toBe(true)
      expect(lo).toBeLessThan(hi)
      for (const v of values) if (typeof v === 'number' && Number.isFinite(v)) expect(v >= lo && v <= hi).toBe(true)
      if (zero) expect(lo <= 0 && hi >= 0).toBe(true)

      const count = 2 + Math.floor(r() * 8)
      const scale = r() < 0.5 ? 1 : 150
      const ticks = niceTicks(lo, hi, count, scale)
      expect(ticks.length).toBeGreaterThanOrEqual(1)
      expect(ticks.length).toBeLessThanOrEqual(count + 2)
      const tol = 1e-9 * Math.max(Math.abs(lo), Math.abs(hi))
      for (let i = 0; i < ticks.length; i++) {
        const tk = ticks[i]!
        expect(Number.isFinite(tk)).toBe(true)
        expect(tk >= lo - tol && tk <= hi + tol).toBe(true)
        if (i > 0) expect(tk).toBeGreaterThan(ticks[i - 1]!)
      }
      if (lo < 0 && hi > 0) expect(ticks).toContain(0)
      if (ticks.length >= 2) {
        // The step, in display units, is 1, 2 or 5 times a power of ten, and every tick is a whole multiple of it.
        const step = (ticks[1]! - ticks[0]!) * scale
        const mant = step / 10 ** Math.floor(Math.log10(step) + 1e-9)
        expect([1, 2, 5].some((m) => Math.abs(mant - m) < 1e-6)).toBe(true)
        for (let i = 1; i < ticks.length; i++) expect(Math.abs((ticks[i]! - ticks[i - 1]!) * scale - step) / step).toBeLessThan(1e-6)
        for (const tk of ticks) {
          const q = (tk * scale) / step
          expect(Math.abs(q - Math.round(q))).toBeLessThan(1e-6)
        }
      }
    }
  })

  it('shows round numbers in display units, so a yen axis reads round in yen', () => {
    const ticks = niceTicks(0, 1_000_000, 5, 150)
    expect(ticks.length).toBeGreaterThanOrEqual(3)
    for (const tk of ticks) {
      const shown = Math.round(tk * 150)
      expect(Math.abs(tk * 150 - shown)).toBeLessThan(1e-6)
      expect(shown % 10_000_000).toBe(0)
    }
  })

  it('survives nonsense input', () => {
    for (const args of [[NaN, NaN], [Infinity, -Infinity], [0, 1e300], [-1e300, 1e300], [1e15, 1e15 + 1], [0, 1e-9]] as const) {
      const ticks = niceTicks(args[0], args[1], 5)
      expect(ticks.length).toBeGreaterThanOrEqual(1)
      expect(ticks.every(Number.isFinite)).toBe(true)
    }
    expect(niceTicks(0, 10, NaN, NaN).every(Number.isFinite)).toBe(true)
    expect(niceTicks(0, 10, 5, -3)).toEqual(niceTicks(0, 10, 5, 1))
  })
})

describe('linePath', () => {
  const sx = linearScale(0, 4, 0, 100)
  const sy = linearScale(0, 4, 100, 0)

  it('breaks the line at a null or a non-finite value', () => {
    const d = linePath([0, 1, 2, 3, 4], [1, 2, null, 4, NaN], sx, sy)
    expect(d).toBe('M0 75 L25 50 M75 0')
    expect((d.match(/M/g) ?? []).length).toBe(2)
    expect(linePath([0, 1, 2], [1, 2, 3], sx, sy)).toBe('M0 75 L25 50 L50 25')
  })

  it('gives a single move for one point and nothing for no point', () => {
    const one = linePath([0, 1, 2], [null, 2, null], sx, sy)
    expect(one).toBe('M25 50')
    expect((one.match(/M/g) ?? []).length).toBe(1)
    expect(one).not.toContain('L')
    expect(linePath([], [], sx, sy)).toBe('')
    expect(linePath([0, 1], [null, null], sx, sy)).toBe('')
  })

  it('never writes a bad number', () => {
    expect(linePath([0, NaN, 2], [1, 2, 3], sx, sy)).toBe('M0 75 M50 25')
    expect(BAD.test(linePath([0, 1], [1e300, -1e300], sx, sy))).toBe(false)
    expect(BAD.test(linePath([0, 1], [1, 2], () => NaN, sy))).toBe(false)
  })
})

describe('stackLayout', () => {
  it('stacks positives up and negatives down', () => {
    const { lo, hi, min, max } = stackLayout([
      [1, 2, -1],
      [3, -2, null],
      [2, 1, -3],
    ])
    expect([lo[0]![0], hi[0]![0]]).toEqual([0, 1])
    expect([lo[1]![0], hi[1]![0]]).toEqual([1, 4])
    expect([lo[2]![0], hi[2]![0]]).toEqual([4, 6])
    expect([lo[0]![1], hi[0]![1]]).toEqual([0, 2])
    expect([lo[1]![1], hi[1]![1]]).toEqual([-2, 0])
    expect([lo[2]![1], hi[2]![1]]).toEqual([2, 3])
    expect([lo[0]![2], hi[0]![2]]).toEqual([-1, 0])
    expect(hi[1]![2]! - lo[1]![2]!).toBe(0)
    expect([lo[2]![2], hi[2]![2]]).toEqual([-4, -1])
    expect(min).toBe(-4)
    expect(max).toBe(6)
  })

  it('has hi minus lo equal to the size of the value, and totals that bound min and max', () => {
    const r = lcg(5)
    for (let t = 0; t < 100; t++) {
      const rows = 1 + Math.floor(r() * 6)
      const cols = Math.floor(r() * 12)
      const series = Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => (r() < 0.1 ? null : (r() - 0.4) * 100)),
      )
      const out = stackLayout(series)
      expect(out.lo.length).toBe(rows)
      for (let s = 0; s < rows; s++) {
        expect(out.lo[s]!.length).toBe(cols)
        for (let i = 0; i < cols; i++) {
          const v = series[s]![i]
          expect(out.hi[s]![i]! - out.lo[s]![i]!).toBeCloseTo(Math.abs(v ?? 0), 9)
          expect(out.lo[s]![i]!).toBeGreaterThanOrEqual(out.min)
          expect(out.hi[s]![i]!).toBeLessThanOrEqual(out.max)
        }
      }
      expect(out.min).toBeLessThanOrEqual(0)
      expect(out.max).toBeGreaterThanOrEqual(0)
    }
  })

  it('handles no data, uneven series and non-finite values', () => {
    expect(stackLayout([])).toEqual({ lo: [], hi: [], min: 0, max: 0 })
    const odd = stackLayout([[1, 2, 3], [NaN, Infinity]])
    expect(odd.hi[1]!.length).toBe(3)
    expect(odd.max).toBe(3)
    expect(BAD.test(JSON.stringify(odd))).toBe(false)
  })
})

describe('waterfallLayout', () => {
  it('starts totals at 0 and chains deltas from the running level', () => {
    const { bars, min, max } = waterfallLayout([
      { value: 100, kind: 'total' },
      { value: -40, kind: 'delta' },
      { value: -10, kind: 'delta' },
      { value: 50, kind: 'total' },
    ])
    expect(bars).toEqual([
      { start: 0, end: 100, level: 100, kind: 'total' },
      { start: 100, end: 60, level: 60, kind: 'delta' },
      { start: 60, end: 50, level: 50, kind: 'delta' },
      { start: 0, end: 50, level: 50, kind: 'total' },
    ])
    expect(min).toBe(0)
    expect(max).toBe(100)
  })

  it('copes with a negative first total', () => {
    const { bars, min, max } = waterfallLayout([
      { value: -50, kind: 'total' },
      { value: 20, kind: 'delta' },
      { value: -30, kind: 'delta' },
    ])
    expect(bars.map((b) => [b.start, b.end])).toEqual([[0, -50], [-50, -30], [-30, -60]])
    expect(min).toBe(-60)
    expect(max).toBe(0)
  })

  it('bounds every bar, even for random and hostile steps', () => {
    const r = lcg(8)
    for (let t = 0; t < 100; t++) {
      const steps = Array.from({ length: Math.floor(r() * 20) }, () => ({
        value: r() < 0.05 ? NaN : (r() - 0.5) * 1000,
        kind: r() < 0.25 ? ('total' as const) : ('delta' as const),
      }))
      const { bars, min, max } = waterfallLayout(steps)
      expect(bars.length).toBe(steps.length)
      for (const b of bars) {
        expect(Number.isFinite(b.start) && Number.isFinite(b.end) && Number.isFinite(b.level)).toBe(true)
        expect(Math.min(b.start, b.end)).toBeGreaterThanOrEqual(min)
        expect(Math.max(b.start, b.end)).toBeLessThanOrEqual(max)
      }
    }
    expect(waterfallLayout([])).toEqual({ bars: [], min: 0, max: 0 })
  })
})

describe('indexAt', () => {
  it('maps a pointer to the nearest point and clamps at both ends', () => {
    expect(indexAt(50, 0, 100, 11)).toBe(5)
    expect(indexAt(54, 0, 100, 11)).toBe(5)
    expect(indexAt(56, 0, 100, 11)).toBe(6)
    expect(indexAt(-30, 0, 100, 11)).toBe(0)
    expect(indexAt(500, 0, 100, 11)).toBe(10)
    expect(indexAt(Infinity, 0, 100, 11)).toBe(10)
    expect(indexAt(110, 10, 100, 3)).toBe(2)
  })

  it('is -1 for no points, 0 for one, and 0 for an unmeasured box', () => {
    expect(indexAt(50, 0, 100, 0)).toBe(-1)
    expect(indexAt(50, 0, 100, -3)).toBe(-1)
    expect(indexAt(50, 0, 100, NaN)).toBe(-1)
    expect(indexAt(50, 0, 100, 1)).toBe(0)
    expect(indexAt(9999, 0, 100, 1)).toBe(0)
    expect(indexAt(50, 0, 0, 5)).toBe(0)
    expect(indexAt(NaN, 0, 100, 5)).toBe(0)
  })
})

describe('markerPath, xTicks and dodgeLabels', () => {
  it('draws six distinct shapes made of finite numbers', () => {
    expect(MARKER_SHAPES.length).toBe(6)
    expect(new Set(MARKER_SHAPES).size).toBe(6)
    const paths = MARKER_SHAPES.map((s) => markerPath(s, 10, 20, 4))
    expect(new Set(paths).size).toBe(6)
    for (const p of paths) {
      expect(p.startsWith('M')).toBe(true)
      expect(p.endsWith('Z')).toBe(true)
      const nums = p.match(/-?\d+(?:\.\d+)?/g) ?? []
      expect(nums.length).toBeGreaterThanOrEqual(6)
      expect(nums.every((n) => Number.isFinite(Number(n)))).toBe(true)
    }
    for (const s of MARKER_SHAPES) expect(BAD.test(markerPath(s, NaN, Infinity, -5))).toBe(false)
  })

  it('picks x labels from the first to the last, evenly', () => {
    expect(xTicks([], 5)).toEqual([])
    expect(xTicks([2020], 5)).toEqual([0])
    expect(xTicks([1, 2], 5)).toEqual([0, 1])
    expect(xTicks([1, 2, 3, 4, 5], 9)).toEqual([0, 1, 2, 3, 4])
    const t = xTicks(Array.from({ length: 30 }, (_, i) => 2000 + i), 5)
    expect(t[0]).toBe(0)
    expect(t[t.length - 1]).toBe(29)
    expect(t.length).toBeLessThanOrEqual(5)
    expect(xTicks(Array.from({ length: 30 }, (_, i) => i), 0)).toEqual([0, 29])
    expect(xTicks(Array.from({ length: 30 }, (_, i) => i), NaN)).toEqual([0, 29])
  })

  it('pushes labels apart, keeps their order, and leaves a fitting set alone', () => {
    expect(dodgeLabels([0, 20, 40], 10, 0, 100)).toEqual([0, 20, 40])
    expect(dodgeLabels([10, 12, 50], 10, 0, 100)).toEqual([10, 20, 50])
    expect(dodgeLabels([50, 10, 12], 10, 0, 100)).toEqual([50, 10, 20])
    expect(dodgeLabels([95, 96, 97], 10, 0, 100)).toEqual([80, 90, 100])
    expect(dodgeLabels([], 10, 0, 100)).toEqual([])
    expect(dodgeLabels([-50], 10, 0, 100)).toEqual([0])
    expect(dodgeLabels([5, 5, 5], 10, 0, 100)).toEqual([5, 15, 25])
  })

  it('holds for random labels: in the box, in order, and at least minGap apart when there is room', () => {
    const r = lcg(77)
    for (let t = 0; t < 300; t++) {
      const n = Math.floor(r() * 9)
      const gap = 1 + Math.floor(r() * 20)
      const ys = Array.from({ length: n }, () => (r() < 0.05 ? NaN : -20 + r() * 140))
      const out = dodgeLabels(ys, gap, 0, 100)
      expect(out.length).toBe(n)
      for (const v of out) {
        expect(Number.isFinite(v)).toBe(true)
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(100)
      }
      const order = ys.map((_, i) => i).sort((a, b) => (out[a]! - out[b]!) || a - b)
      for (let k = 1; k < n; k++) {
        const a = order[k - 1]!
        const b = order[k]!
        if (Number.isFinite(ys[a]!) && Number.isFinite(ys[b]!)) expect(ys[a]!).toBeLessThanOrEqual(ys[b]!)
        if ((n - 1) * gap <= 100) expect(out[b]! - out[a]!).toBeGreaterThanOrEqual(gap - 1e-9)
      }
      if ((n - 1) * gap <= 100) {
        const sorted = [...ys].filter(Number.isFinite).sort((a, b) => a - b)
        const fits =
          sorted.length === n && sorted.every((v, i) => v >= 0 && v <= 100 && (i === 0 || v - sorted[i - 1]! >= gap))
        if (fits) expect(out).toEqual(ys)
      }
    }
  })
})

describe('scrubReducer', () => {
  const at = (index: number | null): ScrubState => ({ index })
  const table: [string, ScrubState, string, number, number | null][] = [
    ['left from no cursor starts at the last point', at(null), 'ArrowLeft', 10, 8],
    ['right from no cursor stays on the last point', at(null), 'ArrowRight', 10, 9],
    ['right', at(3), 'ArrowRight', 10, 4],
    ['down is right', at(3), 'ArrowDown', 10, 4],
    ['up is left', at(3), 'ArrowUp', 10, 2],
    ['left stops at the first point', at(0), 'ArrowLeft', 10, 0],
    ['right stops at the last point', at(9), 'ArrowRight', 10, 9],
    ['Home', at(5), 'Home', 10, 0],
    ['End from no cursor', at(null), 'End', 10, 9],
    ['PageDown', at(2), 'PageDown', 10, 7],
    ['PageDown clamps', at(8), 'PageDown', 10, 9],
    ['PageUp', at(7), 'PageUp', 10, 2],
    ['PageUp clamps', at(2), 'PageUp', 10, 0],
    ['Escape clears the cursor', at(4), 'Escape', 10, null],
    ['one point: right', at(null), 'ArrowRight', 1, 0],
    ['one point: Home', at(null), 'Home', 1, 0],
    ['a stale index is clamped first', at(50), 'ArrowLeft', 10, 8],
  ]
  it.each(table)('%s', (_name, state, key, n, want) => {
    expect(scrubReducer(state, key, n)).toEqual({ index: want })
  })

  it('returns the same state object for a key it does not handle', () => {
    const s = at(4)
    expect(scrubReducer(s, 'a', 10)).toBe(s)
    expect(scrubReducer(s, 'Tab', 10)).toBe(s)
    expect(scrubReducer(s, 'Enter', 10)).toBe(s)
  })

  it('has no cursor when there are no points', () => {
    expect(scrubReducer(at(4), 'ArrowRight', 0)).toEqual({ index: null })
    expect(scrubReducer(at(null), 'End', -2)).toEqual({ index: null })
    expect(scrubReducer(at(4), 'a', 0)).toEqual({ index: null })
  })

  it('scrubIndex is the cursor, or the last point, or -1', () => {
    expect(scrubIndex(at(null), 7)).toBe(6)
    expect(scrubIndex(at(2), 7)).toBe(2)
    expect(scrubIndex(at(20), 7)).toBe(6)
    expect(scrubIndex(at(-4), 7)).toBe(0)
    expect(scrubIndex(at(2), 0)).toBe(-1)
    expect(scrubIndex(at(null), 0)).toBe(-1)
  })
})

describe('useScrub', () => {
  function probe(n: number, opts?: Parameters<typeof useScrub>[1]): ScrubApi {
    const box: { api?: ScrubApi } = {}
    function Probe() {
      box.api = useScrub(n, opts)
      return null
    }
    expect(renderToStaticMarkup(createElement(Probe))).toBe('')
    if (!box.api) throw new Error('the hook did not run')
    return box.api
  }

  /** A fake keyboard event, and the spy that says whether the page was stopped from scrolling. */
  function press(k: string, extra: Record<string, unknown> = {}) {
    const preventDefault = vi.fn()
    return { ev: { key: k, preventDefault, ...extra } as never, preventDefault }
  }
  /** A fake pointer event over a box 100 wide that starts at 0. */
  function pointer(x: number, type = 'mouse') {
    return { clientX: x, pointerType: type, currentTarget: { getBoundingClientRect: () => ({ left: 0, width: 100 }) } } as never
  }

  it('starts with no cursor and shows the last point', () => {
    const api = probe(12)
    expect(api.active).toBe(false)
    expect(api.index).toBe(11)
    expect(api.handlers.tabIndex).toBe(0)
    for (const k of ['onKeyDown', 'onPointerDown', 'onPointerMove', 'onPointerLeave', 'onBlur'] as const) {
      expect(typeof api.handlers[k]).toBe('function')
    }
    expect(probe(0).index).toBe(-1)
    expect(probe(0).active).toBe(false)
  })

  it('moves with the keyboard and stops the page from scrolling for the keys it uses', () => {
    const onMove = vi.fn()
    const api = probe(5, { onMove })
    const left = press('ArrowLeft')
    api.handlers.onKeyDown(left.ev)
    expect(onMove).toHaveBeenLastCalledWith(3)
    expect(left.preventDefault).toHaveBeenCalledTimes(1)
    api.handlers.onKeyDown(press('Home').ev)
    expect(onMove).toHaveBeenLastCalledWith(0)
    const other = press('a')
    api.handlers.onKeyDown(other.ev)
    expect(other.preventDefault).not.toHaveBeenCalled()
    const modified = press('ArrowLeft', { altKey: true })
    api.handlers.onKeyDown(modified.ev)
    expect(modified.preventDefault).not.toHaveBeenCalled()
  })

  it('keeps Escape for the dialog until the chart has a cursor', () => {
    const onMove = vi.fn()
    const api = probe(5, { onMove })
    const first = press('Escape')
    api.handlers.onKeyDown(first.ev)
    expect(first.preventDefault).not.toHaveBeenCalled()
    expect(onMove).not.toHaveBeenCalled()
    api.handlers.onKeyDown(press('ArrowLeft').ev)
    const second = press('Escape')
    api.handlers.onKeyDown(second.ev)
    expect(second.preventDefault).toHaveBeenCalledTimes(1)
    expect(onMove).toHaveBeenLastCalledWith(null)
  })

  it('follows the pointer inside the inset, and clears when the pointer leaves', () => {
    const onMove = vi.fn()
    const api = probe(5, { onMove, inset: [10, 10] })
    api.handlers.onPointerMove(pointer(50))
    expect(onMove).toHaveBeenLastCalledWith(2)
    api.handlers.onPointerMove(pointer(50))
    expect(onMove).toHaveBeenCalledTimes(1)
    api.handlers.onPointerDown(pointer(500))
    expect(onMove).toHaveBeenLastCalledWith(4)
    api.handlers.onPointerLeave(pointer(500))
    expect(onMove).toHaveBeenLastCalledWith(null)
  })

  it('keeps a touch cursor until blur, and a keyboard cursor through blur and leave', () => {
    const touch = vi.fn()
    const a = probe(5, { onMove: touch })
    a.handlers.onPointerDown(pointer(0, 'touch'))
    expect(touch).toHaveBeenLastCalledWith(0)
    a.handlers.onPointerLeave(pointer(0, 'touch'))
    expect(touch).toHaveBeenCalledTimes(1)
    a.handlers.onBlur({} as never)
    expect(touch).toHaveBeenLastCalledWith(null)

    const board = vi.fn()
    const b = probe(5, { onMove: board })
    b.handlers.onKeyDown(press('Home').ev)
    expect(board).toHaveBeenLastCalledWith(0)
    b.handlers.onBlur({} as never)
    b.handlers.onPointerLeave(pointer(0))
    expect(board).toHaveBeenCalledTimes(1)
  })
})

describe('formatUnit, formatSigned and describeDelta', () => {
  it('writes money the way the game does', () => {
    expect(formatUnit('money', 1_100_000)).toBe('$1.1M')
    expect(formatUnit('money', 0)).toBe('$0')
    expect(formatUnit('money', -2_100_000)).toBe('-$2.1M')
    expect(formatUnit('money', 45_000)).toBe(shortMoney(45_000))
    expect(formatSigned('money', 310_000)).toBe('+$310K')
    expect(formatSigned('money', -2_100_000)).toBe('-$2.1M')
    expect(formatSigned('money', 0)).toBe('$0')
    expect(formatSigned('money', 1e-9)).toBe('$0')
    expect(describeDelta('money', 310_000)).toBe('up $310K')
    expect(describeDelta('money', -2_100_000)).toBe('down $2.1M')
    expect(describeDelta('money', 0)).toBe('no change')
    expect(describeDelta('money', 1e-9)).toBe('no change')
  })

  it('writes money in the bound currency', () => {
    setMoneyDisplay({ mode: 'local', nominal: false })
    const g = makeTestGame(1, { countryId: 'jp' })
    g.year = 2026
    bindMoneyContext(g)
    expect(formatUnit('money', 1_000_000)).toBe(shortMoney(1_000_000))
    expect(formatUnit('money', 1_000_000)).toContain('¥')
    expect(formatSigned('money', -1_000_000).startsWith('-')).toBe(true)
  })

  it('writes percentages from fractions', () => {
    expect(formatUnit('pct', 0.072)).toBe('7.2%')
    expect(formatUnit('pct', 0.0035)).toBe('0.35%')
    expect(formatUnit('pct', 0.00004)).toBe('<0.01%')
    expect(formatUnit('pct', 0)).toBe('0%')
    expect(formatUnit('pct', 0.35)).toBe('35%')
    expect(formatUnit('pct', 0.5)).toBe('50%')
    expect(formatUnit('pct', 0.005)).toBe('0.5%')
    expect(formatUnit('pct', -0.072)).toBe('-7.2%')
    expect(formatUnit('pct', 1.5)).toBe('150%')
    expect(formatUnit('pct', 25)).toBe('2.5K%')
    expect(formatSigned('pct', 0.021)).toBe('+2.1%')
    expect(formatSigned('pct', -0.021)).toBe('-2.1%')
    expect(formatSigned('pct', 0)).toBe('0%')
    expect(describeDelta('pct', 0.021)).toBe('up 2.1 points')
    expect(describeDelta('pct', -0.01)).toBe('down 1 point')
    expect(describeDelta('pct', 0)).toBe('no change')
  })

  it('writes counts, ranks and years', () => {
    expect(formatUnit('count', 842)).toBe('842')
    expect(formatUnit('count', 1200)).toBe('1.2K')
    expect(formatUnit('count', 12_400)).toBe('12K')
    expect(formatUnit('count', 2_500_000)).toBe('2.5M')
    expect(formatUnit('count', 999_999)).toBe('1M')
    expect(formatUnit('count', 0)).toBe('0')
    expect(formatUnit('count', -1200)).toBe('-1.2K')
    expect(formatSigned('count', 1200)).toBe('+1.2K')
    expect(describeDelta('count', -50)).toBe('down 50')

    expect(formatUnit('rank', 3)).toBe('#3')
    expect(formatUnit('rank', 2.6)).toBe('#3')
    expect(formatUnit('rank', 0)).toBe('#0')
    expect(formatSigned('rank', 2)).toBe('+2')
    expect(formatSigned('rank', -3)).toBe('-3')
    expect(formatSigned('rank', 0)).toBe('0')
    // A lower rank number is a better place, so for rank the words follow the places, not the sign.
    expect(describeDelta('rank', -2)).toBe('up 2 places')
    expect(describeDelta('rank', 1)).toBe('down 1 place')
    expect(describeDelta('rank', 0)).toBe('no change')

    expect(formatUnit('years', 12)).toBe('12 yrs')
    expect(formatUnit('years', 1)).toBe('1 yr')
    expect(formatUnit('years', 2.5)).toBe('2.5 yrs')
    expect(formatUnit('years', 0)).toBe('0 yrs')
    expect(formatSigned('years', 2)).toBe('+2 yrs')
    expect(describeDelta('years', 3)).toBe('up 3 yrs')
  })

  it('stays finite and clean for every unit and every awkward number', () => {
    const units: ChartUnit[] = ['money', 'pct', 'count', 'rank', 'years']
    const awkward = [0, -0, 1, -1, 0.5, 1e-9, -1e-9, 1e15, -1e15, 1e300, -1e300, NaN, Infinity, -Infinity, 123456789.987]
    for (const u of units) {
      for (const v of awkward) {
        for (const text of [formatUnit(u, v), formatSigned(u, v), describeDelta(u, v)]) {
          expect(text.length).toBeGreaterThan(0)
          expect(BAD.test(text)).toBe(false)
          expect(DASHES.test(text)).toBe(false)
        }
      }
    }
  })
})

const X5 = [2025, 2026, 2027, 2028, 2029]

function spec(kind: ChartKind, over: Partial<ChartSpec> & Record<string, unknown> = {}): ChartSpec {
  return {
    v: 1,
    kind,
    title: 'Net profit',
    unit: 'money',
    x: X5,
    series: [{ id: 'net', label: 'Net profit', tone: 'c1', values: [100_000, 400_000, 700_000, 900_000, 1_100_000] }],
    summary: 'Net profit grew to $1.1M by 2029.',
    ...over,
  } as ChartSpec
}

const WATERFALL = spec('waterfall', {
  title: 'Where the sales went',
  x: [],
  series: [],
  steps: [
    { label: 'Sales after tax', value: 9_600_000, kind: 'total' },
    { label: 'Materials', value: -3_900_000, kind: 'delta' },
    { label: 'Wages', value: -2_200_000, kind: 'delta' },
    { label: 'Other income', value: 300_000, kind: 'delta' },
    { label: 'Net profit', value: 3_800_000, kind: 'total' },
  ],
  summary: 'Sales of $9.6M left $3.8M in net profit.',
})

const LADDER = spec('ladder', {
  title: 'Who holds the ramen market',
  unit: 'pct',
  x: [],
  series: [],
  rows: [
    { id: 'a', name: 'Noodle Co', value: 0.31, rank: 1, prevRank: 1, prev: 0.3, spark: [0.3, 0.31] },
    { id: 'you', name: 'You', value: 0.12, rank: 2, prevRank: 4, prev: 0.08, spark: [0.08, 0.12], you: true },
    { id: 'c', name: 'Broth Bros', value: 0.07, rank: 3, prevRank: 2, prev: 0.1, spark: [] },
    { id: 'd', name: 'New Bowl', value: 0.02, rank: 4, prevRank: null, prev: null, spark: [] },
  ],
  summary: 'You are second in the ramen market.',
})

const KINDS: [ChartKind, ChartSpec][] = [
  ['line', spec('line')],
  ['bars', spec('bars')],
  ['stack', spec('stack', { unit: 'pct', series: [
    { id: 'a', label: 'Materials', tone: 'c1', values: [0.3, 0.31, 0.32, 0.3, 0.29] },
    { id: 'b', label: 'People', tone: 'c2', values: [0.2, 0.22, null, 0.21, 0.2] },
  ] })],
  ['waterfall', WATERFALL],
  ['ladder', LADDER],
  ['timeline', spec('timeline', { unit: 'count' })],
  ['meter', spec('meter', { unit: 'rank', x: ['Quality', 'Price'], series: [
    { id: 'mine', label: 'You', tone: 'c1', values: [3, 5] },
    { id: 'market', label: 'Market', tone: 'muted', values: [4, 4] },
  ] })],
  ['kpi', spec('kpi', { series: [
    { id: 'net', label: 'Net profit', tone: 'good', values: [100_000, null, 400_000] },
    { id: 'rev', label: 'Sales', tone: 'c2', values: [900_000] },
  ] })],
]

describe('readoutFor', () => {
  it('reads a line, bar, stack or timeline point as x, label and value', () => {
    expect(readoutFor(spec('line'), 4)).toBe('2029: Net profit $1.1M')
    expect(readoutFor(spec('bars'), 0)).toBe('2025: Net profit $100K')
    expect(readoutFor(KINDS[2]![1], 2)).toBe('2027: Materials 32%, People no data')
    expect(readoutFor(KINDS[2]![1], 1)).toBe('2026: Materials 31%, People 22%')
  })

  it('shows three series at most and counts the rest', () => {
    const many = spec('line', {
      series: Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, label: `Series ${i}`, tone: 'c1' as const, values: [1, 2, 3, 4, 5] })),
    })
    const text = readoutFor(many, 2)
    expect(text).toContain('Series 0')
    expect(text).toContain('Series 2')
    expect(text).not.toContain('Series 3')
    expect(text).toContain('and 3 more')
  })

  it('reads a waterfall row with its share of the first total', () => {
    expect(readoutFor(WATERFALL, 0)).toBe('Sales after tax: $9.6M')
    expect(readoutFor(WATERFALL, 2)).toBe('Wages: -$2.2M, 23% of sales after tax')
    expect(readoutFor(WATERFALL, 3)).toBe('Other income: +$300K, 3% of sales after tax')
    expect(readoutFor(WATERFALL, 4)).toBe('Net profit: $3.8M')
  })

  it('reads a ladder row as rank, name and value', () => {
    expect(readoutFor(LADDER, 1)).toBe('#2 You 12%')
    expect(readoutFor(LADDER, 3)).toBe('#4 New Bowl 2%')
  })

  it('falls back to the summary for a kpi, a meter and an index with nothing behind it', () => {
    expect(readoutFor(KINDS[7]![1], 0)).toBe(KINDS[7]![1].summary)
    expect(readoutFor(KINDS[6]![1], 1)).toBe(KINDS[6]![1].summary)
    expect(readoutFor(spec('line', { x: [], series: [] }), 0)).toBe('Net profit grew to $1.1M by 2029.')
    expect(readoutFor(spec('waterfall', { x: [], series: [] }), 0)).toBe('Net profit grew to $1.1M by 2029.')
  })

  it('clamps an index that is out of range', () => {
    expect(readoutFor(spec('line'), 99)).toBe('2029: Net profit $1.1M')
    expect(readoutFor(spec('line'), -4)).toBe('2025: Net profit $100K')
    expect(readoutFor(spec('line'), NaN)).toBe('2025: Net profit $100K')
  })

  it('never goes past 120 characters or prints a bad number, for one spec of each kind', () => {
    for (const [, s] of KINDS) {
      for (let i = -1; i < 6; i++) {
        const text = readoutFor(s, i)
        expect(text.length).toBeGreaterThan(0)
        expect(text.length).toBeLessThanOrEqual(120)
        expect(BAD.test(text)).toBe(false)
      }
    }
    const long = spec('line', {
      series: Array.from({ length: 3 }, (_, i) => ({
        id: `s${i}`,
        label: `A rather long series label number ${i} that goes on`,
        tone: 'c1' as const,
        values: [1, 2, 3, 4, 5],
      })),
    })
    expect(readoutFor(long, 3).length).toBeLessThanOrEqual(120)
    const hostile = spec('line', { series: [{ id: 'n', label: 'Net', tone: 'c1', values: [NaN, Infinity, -Infinity, 1e300, null] }] })
    for (let i = 0; i < 5; i++) expect(BAD.test(readoutFor(hostile, i))).toBe(false)
  })
})

describe('specTable', () => {
  it('has one row per x for a line, and a column per series', () => {
    const t = specTable(spec('line'))
    expect(t.caption).toBe('Net profit')
    expect(t.head).toEqual(['Year', 'Net profit'])
    expect(t.rows.length).toBe(5)
    expect(t.rows[0]).toEqual(['2025', '$100K'])
    expect(t.rows[4]).toEqual(['2029', '$1.1M'])
    const stack = specTable(KINDS[2]![1])
    expect(stack.head).toEqual(['Year', 'Materials', 'People'])
    expect(stack.rows[2]).toEqual(['2027', '32%', 'no data'])
  })

  it('has one row per step for a waterfall, with the running total', () => {
    const t = specTable(WATERFALL)
    expect(t.rows.length).toBe(WATERFALL.steps!.length)
    expect(t.head).toEqual(['Step', 'Amount', 'Running total'])
    expect(t.rows[0]).toEqual(['Sales after tax', '$9.6M', '$9.6M'])
    expect(t.rows[1]).toEqual(['Materials', '-$3.9M', '$5.7M'])
    expect(t.rows[4]).toEqual(['Net profit', '$3.8M', '$3.8M'])
  })

  it('has one row per row for a ladder, with the change in places', () => {
    const t = specTable(LADDER)
    expect(t.rows.length).toBe(4)
    expect(t.head).toEqual(['Rank', 'Name', 'Value', 'Change'])
    expect(t.rows[0]).toEqual(['#1', 'Noodle Co', '31%', 'no change'])
    expect(t.rows[1]).toEqual(['#2', 'You', '12%', 'up 2'])
    expect(t.rows[2]).toEqual(['#3', 'Broth Bros', '7%', 'down 1'])
    expect(t.rows[3]).toEqual(['#4', 'New Bowl', '2%', 'new'])
  })

  it('has one row per series for a kpi', () => {
    const t = specTable(KINDS[7]![1])
    expect(t.head).toEqual(['Measure', 'Latest', 'Change'])
    expect(t.rows).toEqual([
      ['Net profit', '$400K', 'up $300K'],
      ['Sales', '$900K', 'no data'],
    ])
  })

  it('always gives a rectangle of clean strings, whatever the kind and whatever the data', () => {
    const hostile = spec('line', { series: [{ id: 'n', label: 'Net', tone: 'c1', values: [NaN, Infinity, null, 1e300, 5] }] })
    const broken = { ...spec('waterfall'), steps: undefined, x: [], series: [] } as ChartSpec
    for (const [, s] of [...KINDS, ['line', hostile], ['waterfall', broken]] as [ChartKind, ChartSpec][]) {
      const t = specTable(s)
      expect(t.caption.length).toBeGreaterThan(0)
      expect(t.head.length).toBeGreaterThan(0)
      for (const row of t.rows) {
        expect(row.length).toBe(t.head.length)
        for (const cell of [...row, ...t.head, t.caption]) {
          expect(typeof cell).toBe('string')
          expect(BAD.test(cell)).toBe(false)
        }
      }
    }
    expect(specTable(broken).rows.length).toBe(0)
  })
})

describe('purity', () => {
  function freeze<T>(v: T): T {
    if (typeof v === 'object' && v !== null && !Object.isFrozen(v)) {
      Object.freeze(v)
      for (const k of Object.keys(v)) freeze((v as Record<string, unknown>)[k])
    }
    return v
  }

  it('reads frozen input and writes nothing', () => {
    const xs = freeze([0, 1, 2, 3])
    const ys = freeze([1, null, 3, 4])
    const sx = linearScale(0, 3, 0, 100)
    const sy = linearScale(0, 4, 100, 0)
    expect(() => {
      extentOf(freeze([1, 2, null, NaN]), { zero: true, pad: 0.1 })
      linePath(xs, ys, sx, sy)
      stackLayout(freeze([[1, -2], [3, null]]))
      waterfallLayout(freeze([{ value: 5, kind: 'total' as const }, { value: -2, kind: 'delta' as const }]))
      xTicks(freeze(['a', 'b', 'c']), 2)
      dodgeLabels(freeze([5, 6, 7]), 10, 0, 100)
      for (const [, s] of KINDS) {
        const frozen = freeze(structuredClone(s))
        readoutFor(frozen, 1)
        specTable(frozen)
      }
    }).not.toThrow()
  })
})
