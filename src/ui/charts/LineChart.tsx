// The line plot of the chart kit, and the pieces BarChart shares with it: the slider wrapper, the y axis and the x axis.
// The focusable element is an HTML div, not the svg. A slider is the role that makes the arrow keys, Home and End mean
// something to assistive technology (an image role has presentational children and no keyboard semantics), and the svg
// inside is hidden from it: the readout under the plot, the summary and the table say what the picture shows.
// Kinds 'line' and 'timeline' share this geometry; Timeline (R1-C9) wraps it. The only animation is the line draw, in
// charts.css, and only when the reader has not asked for less motion.
import { Fragment, useContext, type ReactElement, type ReactNode } from 'react'
import { moneyScale } from '../../game/core'
import type { ChartSpec, ChartUnit } from '../../game/charts/spec'
import { FrameContext } from './Frame'
import { clipText, formatUnit, readoutFor, xText } from './format'
import { MARKER_SHAPES, dodgeLabels, extentOf, linePath, linearScale, markerPath, niceTicks, xTicks, type Scale } from './geometry'
import type { ScrubApi } from './useScrub'
import './charts.css'

export interface PlotProps {
  spec: ChartSpec
  scrub: ScrubApi
}

/** The drawing box of a plot, in its own units: the svg scales to the width of its container. */
export const BOX = { w: 320, h: 180, left: 44, top: 8, bottom: 22 } as const

const LINE_RIGHT = 56

/**
 * The left and right margin of a line plot, for useScrub's `inset` option, so a pointer maps onto the points the plot
 * draws. In drawing-box units: the numbers are exact when the plot is 320 px wide and scale with it otherwise.
 */
export const LINE_INSET: [number, number] = [BOX.left, LINE_RIGHT]

const MARKER_R = 3.5
const CURSOR_R = 4.5
const END_GAP = 12
const END_FONT_BASELINE = 3.5

/** A coordinate with two decimals at most, finite, and never -0, so the markup holds no float noise and no NaN. */
export function r2(n: number): number {
  if (!Number.isFinite(n)) return 0
  const r = Math.round(n * 100) / 100
  return r === 0 ? 0 : r
}

function finite(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** An index inside 0..last, or 0 when it is not a number. */
export function clampIndex(i: number, last: number): number {
  if (!Number.isFinite(i)) return 0
  return Math.max(0, Math.min(Math.max(0, last), Math.round(i)))
}

/**
 * The focusable wrapper of a plot and the svg inside it. `points` is how many positions the cursor can take (the
 * slider's maximum is points - 1). Name and description point at the frame's title and summary when there is a frame;
 * the title is also the label, for a plot used without one.
 */
export function SliderPlot(p: { spec: ChartSpec; scrub: ScrubApi; points: number; children: ReactNode }): ReactElement {
  const ids = useContext(FrameContext)
  const last = Math.max(0, Math.floor(Number.isFinite(p.points) ? p.points : 0) - 1)
  const now = clampIndex(p.scrub.index, last)
  return (
    <div
      className="ch-plot"
      role="slider"
      aria-label={p.spec.title}
      aria-labelledby={ids?.title}
      aria-describedby={ids?.summary}
      aria-valuemin={0}
      aria-valuemax={last}
      aria-valuenow={now}
      aria-valuetext={readoutFor(p.spec, now)}
      {...p.scrub.handlers}
    >
      <svg viewBox={`0 0 ${BOX.w} ${BOX.h}`} style={{ width: '100%' }} aria-hidden="true" focusable="false">
        {p.children}
      </svg>
    </div>
  )
}

/** Whole places from the best (1) down: at most five or six of them, thinned when the range is wide. */
function rankTicks(lo: number, hi: number): number[] {
  const first = Math.max(1, Math.ceil(lo - 1e-9))
  const last = Math.floor(hi + 1e-9)
  if (!(last >= first)) return []
  const step = Math.max(1, Math.ceil((last - first + 1) / 5))
  const out: number[] = []
  for (let v = first; v <= last && out.length < 8; v += step) out.push(v)
  return out
}

/** Round ticks for a y axis. Money is rounded in the player's own currency (a yen axis reads 10M, 20M, 50M yen). */
export function yTicks(lo: number, hi: number, unit: ChartUnit): number[] {
  if (unit === 'rank') return rankTicks(lo, hi)
  return niceTicks(lo, hi, 4, unit === 'money' ? moneyScale() : 1)
}

/** The y axis: a grid line and a label for each tick. `right` is where the grid ends. */
export function YAxis(p: { ticks: readonly number[]; sy: Scale; unit: ChartUnit; right: number }): ReactElement {
  return (
    <>
      {p.ticks.map((t, i) => {
        const y = r2(p.sy(t))
        return (
          <Fragment key={i}>
            <line className="ch-grid" x1={BOX.left} x2={r2(p.right)} y1={y} y2={y} />
            <text className="ch-ax ch-ax-y" x={BOX.left - 4} y={r2(y + END_FONT_BASELINE)} textAnchor="end">
              {formatUnit(p.unit, t)}
            </text>
          </Fragment>
        )
      })}
    </>
  )
}

/** The x axis: at most six labels, the first and the last always among them. `at` maps an index to an x position. */
export function XAxis(p: { x: readonly (number | string)[]; at: (i: number) => number }): ReactElement {
  return (
    <>
      {xTicks(p.x, 6).map((i) => {
        const x = r2(p.at(i))
        return (
          <text className="ch-ax ch-ax-x" key={i} x={x} y={BOX.h - 6} textAnchor={x > BOX.w - 20 ? 'end' : 'middle'}>
            {clipText(xText(p.x[i]), 10)}
          </text>
        )
      })}
    </>
  )
}

/** The top and the bottom of the plot area inside the drawing box. */
export const PLOT_TOP = BOX.top
export const PLOT_BOTTOM = BOX.h - BOX.bottom

export function LineChart(p: PlotProps): ReactElement {
  const { spec, scrub } = p
  const n = spec.x.length
  const flip = spec.unit === 'rank'
  const lines = spec.series.map((s, i) => ({ s, i, values: s.values.slice(0, n) }))

  // A little room above and below, but never across 0 when every value is on one side of it.
  const [lo0, hi0] = extentOf(lines.flatMap((l) => l.values))
  const room = (hi0 - lo0) * 0.06
  const lo = lo0 >= 0 ? Math.max(0, lo0 - room) : lo0 - room
  const hi = hi0 <= 0 ? Math.min(0, hi0 + room) : hi0 + room
  const sy = linearScale(lo, hi, flip ? PLOT_TOP : PLOT_BOTTOM, flip ? PLOT_BOTTOM : PLOT_TOP)
  const sx = linearScale(0, n - 1, BOX.left, BOX.w - LINE_RIGHT)
  const xs = Array.from({ length: n }, (_, i) => i)
  const ticks = yTicks(lo, hi, spec.unit)
  const crossesZero = lo < 0 && hi > 0

  // The last real point of each line gets a marker and an end label; the labels are pushed apart so two never overprint.
  const ends = lines.flatMap((l) => {
    let at = -1
    for (let k = 0; k < l.values.length; k++) if (finite(l.values[k])) at = k
    return at < 0 ? [] : [{ ...l, at, v: l.values[at] as number }]
  })
  // Whole pixels, so a gap of 12 stays 12 in the markup. The labels go in order of height, so two lines that end on the
  // same pixel keep the order their values have.
  const byHeight = ends.map((_, k) => k).sort((a, b) => sy(ends[a]!.v) - sy(ends[b]!.v) || a - b)
  const spread = dodgeLabels(
    byHeight.map((k) => Math.round(sy(ends[k]!.v))),
    END_GAP,
    PLOT_TOP + 4,
    PLOT_BOTTOM,
  )
  const placed: number[] = []
  byHeight.forEach((k, j) => {
    placed[k] = spread[j] ?? 0
  })

  const cur = scrub.active && n >= 1 ? clampIndex(scrub.index, n - 1) : -1
  const curX = cur >= 0 ? r2(sx(cur)) : 0

  return (
    <SliderPlot spec={spec} scrub={scrub} points={n}>
      <YAxis ticks={ticks} sy={sy} unit={spec.unit} right={BOX.w - LINE_RIGHT} />
      {crossesZero ? <line className="ch-zero" x1={BOX.left} x2={BOX.w - LINE_RIGHT} y1={r2(sy(0))} y2={r2(sy(0))} /> : null}
      <XAxis x={spec.x} at={sx} />
      {cur >= 0 ? <line className="ch-cursor" x1={curX} x2={curX} y1={PLOT_TOP} y2={PLOT_BOTTOM} /> : null}
      {lines.map((l) =>
        l.values.some(finite) ? <path className={`ch-lc-line ch-tone-${l.s.tone}`} key={l.i} d={linePath(xs, l.values, sx, sy)} pathLength={1} /> : null,
      )}
      {ends.map((e, k) => {
        const shape = MARKER_SHAPES[e.i % MARKER_SHAPES.length]!
        return (
          <Fragment key={e.i}>
            <path className={`ch-mk ch-mk-end ch-tone-${e.s.tone}`} data-shape={shape} d={markerPath(shape, r2(sx(e.at)), r2(sy(e.v)), MARKER_R)} />
            <text className={`ch-lc-end ch-tone-${e.s.tone}`} x={BOX.w - LINE_RIGHT + 6} y={r2((placed[k] ?? 0) + END_FONT_BASELINE)} textAnchor="start">
              {formatUnit(spec.unit, e.v)}
            </text>
          </Fragment>
        )
      })}
      {cur >= 0
        ? lines.map((l) => {
            const v = l.values[cur]
            if (!finite(v)) return null
            const shape = MARKER_SHAPES[l.i % MARKER_SHAPES.length]!
            return <path className={`ch-mk ch-mk-cur ch-tone-${l.s.tone}`} key={l.i} data-shape={shape} d={markerPath(shape, curX, r2(sy(v)), CURSOR_R)} />
          })
        : null}
    </SliderPlot>
  )
}
