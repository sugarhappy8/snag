// R3 fix (fog): the width of a forecast band is not a function of the truth. A delta is read against a scale; when the scale was the size
// of the truth itself (forecastScale: the larger of |truth| and a tenth of last year's sales; spanOf: |truth| when no scale came), the
// half-width of the band was BAND_Z x sd x |truth|, so (hi - lo) gave |truth| to within the display rounding, a second and sharper
// reading than the stated 30% band. The scale is now the move rounded UP on a 1-2-5 ladder (never sharper than the stated band, and
// the same for every move in one step of the ladder), kept above a share of last year's sales and a fixed floor; and a delta with no
// scale at all is not fogged.
import { describe, expect, it } from 'vitest'
import { FORECAST_FLOOR, FORECAST_MIN, forecastRead, forecastScale, scenarioKey, scenarioScope } from '../src/game/business/market-fog'
import { BAND_Z, know, spanOf } from '../src/game/knowledge/estimate'
import type { GameState } from '../src/game/types'
import { coverage, fogGame, inFog } from './knowledge-kit'

const NEW_CO = { last: undefined } as unknown as Parameters<typeof forecastScale>[0]
const withRevenue = (revenue: number) => ({ last: { revenue } }) as unknown as Parameters<typeof forecastScale>[0]
const SCOPE = 'fixscope'
const widthOf = (g: GameState, b: Parameters<typeof forecastScale>[0], id: string, truth: number): number => {
  const e = forecastRead(g, b, SCOPE, id, truth)
  return e.hi - e.lo
}

describe('forecastScale', () => {
  it('is the move rounded up on a 1-2-5 ladder, never below the move, a share of last year\'s sales or the fixed floor', () => {
    const ladder = [1, 2, 5]
    const up = (x: number): number => {
      const k = Math.floor(Math.log10(x))
      return (ladder.map((m) => m * 10 ** k).find((v) => v >= x * (1 - 1e-12)) ?? 10 ** (k + 1))
    }
    for (const t of [2.5e5, 3e6, 4.5e6, 5e6, 7.7e6, 2e7, 3.2e8, -3e6, -4.5e6]) {
      expect(forecastScale(NEW_CO, t), `${t}`).toBeCloseTo(Math.max(up(Math.abs(t)), FORECAST_MIN), 3)
      expect(forecastScale(NEW_CO, t), `${t} is never sharper than the move`).toBeGreaterThanOrEqual(Math.abs(t))
    }
    expect(forecastScale(withRevenue(1e9), 3e6)).toBeCloseTo(1e9 * FORECAST_FLOOR, 3)
    expect(forecastScale(NEW_CO, 0)).toBe(FORECAST_MIN)
    expect(forecastScale(NEW_CO, 40)).toBe(FORECAST_MIN)
    expect(Number.isFinite(forecastScale(NEW_CO, Number.NaN))).toBe(true)
  })

  it('two moves a factor of 1.5 apart in one step of the ladder read bands of the same width', () => {
    const g = fogGame(1)
    inFog(() => {
      for (const [a, b] of [[3e6, 4.5e6], [1.2e7, 1.8e7], [-6e7, -9e7], [2.2e5, 3.3e5]] as const) {
        const wa = widthOf(g, NEW_CO, 'x', a)
        const wb = widthOf(g, NEW_CO, 'x', b)
        expect(wa, `${a} and ${b}`).toBeGreaterThan(0)
        expect(wb / wa, `${a} and ${b}`).toBeCloseTo(1, 9)
      }
    })
  })

  it('the width says only which step of the ladder the move is in: many truths, a handful of widths', () => {
    const g = fogGame(2)
    inFog(() => {
      const widths = new Set<string>()
      for (let i = 0; i < 400; i++) {
        const truth = 3e5 * 1.0159 ** i
        widths.add(widthOf(g, NEW_CO, 'y', truth).toPrecision(6))
      }
      // 400 truths over four decades: three steps a decade, plus the step the first one starts in
      expect(widths.size).toBeLessThanOrEqual(14)
      expect(widths.size).toBeGreaterThanOrEqual(3)
    })
  })

  it('a sales-sized floor keeps the band the same width whatever the small move is', () => {
    const g = fogGame(3)
    const b = withRevenue(5e9)
    inFog(() => {
      const ws = [1e6, 3e6, 9e6, 4e7].map((t) => widthOf(g, b, 'z', t))
      for (const w of ws) expect(w / ws[0]!).toBeCloseTo(1, 9)
    })
  })

  it('the band is honest: it holds the move about 80% of 10,000 draws, whatever its size', () => {
    inFog(() => {
      const b = withRevenue(2e7)
      const hit = coverage(10_000, (i) => {
        const truth = (i % 2 ? 1 : -1) * 1.3e6 * 1.0007 ** (i % 4000)
        return { est: forecastRead(fogGame(i), b, SCOPE, 'cov', truth), truth }
      })
      expect(hit).toBeGreaterThan(0.77)
      expect(hit).toBeLessThan(0.83)
    })
  })
})

describe('a delta needs a scale', () => {
  it('spanOf has no scale to give a delta without one, and a delta read with none is not fogged', () => {
    expect(spanOf('delta', 8e6, undefined)).toBeNull()
    expect(spanOf('delta', 8e6, Number.NaN)).toBeNull()
    expect(spanOf('delta', 8e6, 0)).toBeNull()
    expect(spanOf('delta', 8e6, 5e6)).toBe(5e6)
    const g = fogGame(4)
    const e = inFog(() => know(g, scenarioKey(scenarioScope({ id: 'a1' }), 'offense'), 8e6))
    expect(e.exact).toBe(true)
    const scaled = inFog(() => know(g, scenarioKey(scenarioScope({ id: 'a1' }), 'offense'), 8e6, { scale: 1e7 }))
    expect(scaled.exact).toBe(false)
    expect(scaled.hi - scaled.lo).toBeCloseTo(2 * BAND_Z * scaled.sd * 1e7, 3)
  })
})
