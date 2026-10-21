// The timeline of the chart kit: net worth by age. It is the line plot (same box, axes, slider wrapper and end labels as
// LineChart) with a filled area from the first line down to the zero line, and the spec's marks drawn as short flags: a
// dashed stem from the point on the line up to a label. The labels sit in a lane above the plot, one tier for each label
// that would overprint another, so a flag never covers the line and two flags never share a place. A mark's `at` is an
// index into `x`. The x axis reads "age 30" whether the spec holds numbers or text. Whatever the plot draws is in the
// table and the readout too; the flags are the one thing only the picture says, and they are repeated in the summary.
import { Fragment, type ReactElement } from 'react'
import { CHART_LIMITS, SPEC_LIMITS, type ChartMark, type ChartSpec } from '../../game/charts/spec'
import { clipText, formatUnit, xText } from './format'
import { MARKER_SHAPES, dodgeLabels, extentOf, linePath, linearScale, markerPath } from './geometry'
import { BOX, LINE_INSET, PLOT_BOTTOM, PLOT_TOP, SliderPlot, XAxis, YAxis, clampIndex, r2, yTicks, type PlotProps } from './LineChart'
import './charts.css'

const MARKER_R = 3.5
const CURSOR_R = 4.5
const FLAG_R = 3
const END_GAP = 12
const END_FONT_BASELINE = 3.5
/** The baseline of the first flag tier, below the top of the box, and the step down to each next tier. */
const LANE_FIRST = 8
const LANE_STEP = 11
/** The room kept between the last tier and the plot: a descender and a margin. */
const LANE_FOOT = 8
/** How wide one letter of a flag label is at 10 px, a little generously, and the gap kept between two labels on a tier. */
const CHAR_W = 5.6
const FLAG_GAP = 4
/** How far the text sits from its stem, and from the edge of the box. */
const STEM_OFFSET = 3
const EDGE = 2
const SCAN = 64
const AREA_OPACITY = 0.12

function finite(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** The spec with every number in `x` written as "age 30". Text stays as it is, so the result is the same when applied twice. */
export function ageLabelled(spec: ChartSpec): ChartSpec {
  if (!Array.isArray(spec.x) || !spec.x.some((v) => typeof v === 'number')) return spec
  return { ...spec, x: spec.x.map((v) => (typeof v === 'number' ? `age ${xText(v)}` : v)) }
}

interface FlagPlan {
  at: number
  label: string
  x: number
  /** Where the text starts (or ends, for anchor 'end'). */
  textX: number
  anchor: 'start' | 'end'
  tier: number
}

/**
 * The flags to draw, in the order the spec gives them, each with its tier. A mark is skipped when its place is not a
 * point of the plot or it has no text; at most CHART_LIMITS.marks are drawn. Tiers are given from the left, each flag to
 * the first tier where its label does not touch one already there.
 */
function planFlags(marks: readonly ChartMark[] | undefined, n: number, sx: (i: number) => number): { plans: FlagPlan[]; tiers: number } {
  const plans: FlagPlan[] = []
  const list: readonly unknown[] = Array.isArray(marks) ? marks : []
  for (let i = 0; i < list.length && i < SCAN && plans.length < CHART_LIMITS.marks; i++) {
    const m = list[i] as Partial<ChartMark> | null
    if (typeof m !== 'object' || m === null || !finite(m.at) || typeof m.label !== 'string' || m.label.length === 0) continue
    const at = Math.round(m.at)
    if (at < 0 || at > n - 1) continue
    const x = sx(at)
    if (!Number.isFinite(x)) continue
    // The text goes to the right of its stem, or to the left when that is where the room is.
    const right = BOX.w - EDGE - (x + STEM_OFFSET)
    const left = x - STEM_OFFSET - EDGE
    const full = clipText(m.label, SPEC_LIMITS.label)
    const anchor = full.length * CHAR_W > right && left > right ? 'end' : 'start'
    const label = clipText(full, Math.max(1, Math.floor((anchor === 'end' ? left : right) / CHAR_W)))
    plans.push({ at, label, x, textX: anchor === 'end' ? x - STEM_OFFSET : x + STEM_OFFSET, anchor, tier: 0 })
  }
  const extent = (f: FlagPlan): [number, number] => {
    const w = f.label.length * CHAR_W
    return f.anchor === 'end' ? [f.textX - w, f.textX] : [f.textX, f.textX + w]
  }
  const taken: [number, number][][] = []
  let tiers = 0
  for (const f of [...plans].sort((a, b) => a.x - b.x || a.at - b.at)) {
    const [from, to] = extent(f)
    let t = 0
    while ((taken[t] ?? []).some(([a, b]) => from < b + FLAG_GAP && a < to + FLAG_GAP)) t++
    const row = taken[t] ?? (taken[t] = [])
    row.push([from, to])
    f.tier = t
    tiers = Math.max(tiers, t + 1)
  }
  return { plans, tiers }
}

/** The closed shape under each run of two or more real points, down to the base line: 'M x base L x y ... L x base Z'. */
function areaPath(values: readonly (number | null)[], sx: (i: number) => number, sy: (v: number) => number, base: number): string {
  let d = ''
  let run: [number, number][] = []
  const close = (): void => {
    if (run.length >= 2) {
      d += `M${r2(run[0]![0])} ${r2(base)}`
      for (const [x, y] of run) d += `L${r2(x)} ${r2(y)}`
      d += `L${r2(run[run.length - 1]![0])} ${r2(base)}Z`
    }
    run = []
  }
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    const x = finite(v) ? sx(i) : NaN
    const y = finite(v) ? sy(v) : NaN
    if (Number.isFinite(x) && Number.isFinite(y)) run.push([x, y])
    else close()
  }
  close()
  return d
}

export function Timeline(p: PlotProps): ReactElement {
  const spec = ageLabelled(p.spec)
  const { scrub } = p
  const n = spec.x.length
  const lines = spec.series.slice(0, CHART_LIMITS.series).map((s, i) => ({ s, i, values: s.values.slice(0, n) }))
  const right = BOX.w - LINE_INSET[1]
  const sx = linearScale(0, n - 1, BOX.left, right)
  const { plans, tiers } = planFlags(spec.marks, n, sx)

  // The worth stands on the zero line, so zero is always in the range. The lane for the flag labels sits above the plot.
  const [lo0, hi0] = extentOf(lines.flatMap((l) => l.values), { zero: true })
  const room = (hi0 - lo0) * 0.06
  const lo = lo0 < 0 ? lo0 - room : lo0
  const hi = hi0 > 0 ? hi0 + room : hi0
  const top = tiers > 0 ? PLOT_TOP + LANE_FIRST + (tiers - 1) * LANE_STEP + LANE_FOOT : PLOT_TOP
  const sy = linearScale(lo, hi, PLOT_BOTTOM, top)
  const xs = Array.from({ length: n }, (_, i) => i)
  const ticks = yTicks(lo, hi, spec.unit)
  const zeroY = r2(sy(0))
  const first = lines[0]

  // The last real point of each line gets a marker and an end label; the labels are pushed apart so two never overprint.
  const ends = lines.flatMap((l) => {
    let at = -1
    for (let k = 0; k < l.values.length; k++) if (finite(l.values[k])) at = k
    return at < 0 ? [] : [{ ...l, at, v: l.values[at] as number }]
  })
  const byHeight = ends.map((_, k) => k).sort((a, b) => sy(ends[a]!.v) - sy(ends[b]!.v) || a - b)
  const spread = dodgeLabels(
    byHeight.map((k) => Math.round(sy(ends[k]!.v))),
    END_GAP,
    top + 4,
    PLOT_BOTTOM,
  )
  const placed: number[] = []
  byHeight.forEach((k, j) => {
    placed[k] = spread[j] ?? 0
  })

  const cur = scrub.active && n >= 1 ? clampIndex(scrub.index, n - 1) : -1
  const curX = cur >= 0 ? r2(sx(cur)) : 0
  const area = first ? areaPath(first.values, sx, sy, sy(0)) : ''

  return (
    <SliderPlot spec={spec} scrub={scrub} points={n}>
      <YAxis ticks={ticks} sy={sy} unit={spec.unit} right={right} />
      <line className="ch-zero" x1={BOX.left} x2={right} y1={zeroY} y2={zeroY} />
      <XAxis x={spec.x} at={sx} />
      {cur >= 0 ? <line className="ch-cursor" x1={curX} x2={curX} y1={top} y2={PLOT_BOTTOM} /> : null}
      {first && area.length > 0 ? <path className={`ch-tl-area ch-tone-${first.s.tone}`} d={area} fillOpacity={AREA_OPACITY} /> : null}
      {lines.map((l) =>
        l.values.some(finite) ? <path className={`ch-lc-line ch-tone-${l.s.tone}`} key={l.i} d={linePath(xs, l.values, sx, sy)} pathLength={1} /> : null,
      )}
      {plans.map((f, k) => {
        const v = first?.values[f.at]
        const stemY = finite(v) ? r2(sy(v)) : zeroY
        return (
          <Fragment key={`stem${k}`}>
            <line className="ch-tl-stem" x1={r2(f.x)} x2={r2(f.x)} y1={r2(PLOT_TOP + LANE_FIRST + f.tier * LANE_STEP + 2)} y2={stemY} />
            {finite(v) ? (
              <path className={`ch-mk ch-tl-pt ch-tone-${first?.s.tone ?? 'c1'}`} data-shape="diamond" d={markerPath('diamond', r2(f.x), stemY, FLAG_R)} />
            ) : null}
          </Fragment>
        )
      })}
      {ends.map((e, k) => {
        const shape = MARKER_SHAPES[e.i % MARKER_SHAPES.length]!
        return (
          <Fragment key={e.i}>
            <path className={`ch-mk ch-mk-end ch-tone-${e.s.tone}`} data-shape={shape} d={markerPath(shape, r2(sx(e.at)), r2(sy(e.v)), MARKER_R)} />
            <text className={`ch-lc-end ch-tone-${e.s.tone}`} x={right + 6} y={r2((placed[k] ?? 0) + END_FONT_BASELINE)} textAnchor="start">
              {formatUnit(spec.unit, e.v)}
            </text>
          </Fragment>
        )
      })}
      {plans.map((f, k) => (
        <text className="ch-tl-flag" key={`flag${k}`} x={r2(f.textX)} y={PLOT_TOP + LANE_FIRST + f.tier * LANE_STEP} textAnchor={f.anchor}>
          {f.label}
        </text>
      ))}
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
