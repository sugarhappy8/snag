// The bar plot of the chart kit: one column for each x (up to 64), kinds 'bars' and 'stack'. A stack puts the series on
// each other with stackLayout (negatives go below the axis); plain bars set the series side by side. Each series is ONE
// path whose `d` holds a rectangle for every column, so 30 columns of 6 series are 6 elements and not 180, and the
// 150-element cap holds with room to spare (64 by 6 included). Same slider wrapper and axes as LineChart. When the
// legend names the series, each series also ends with its legend marker in the right margin (up to 6 more elements).
import type { ReactElement } from 'react'
import { MARKER_SHAPES, dodgeLabels, extentOf, linearScale, markerPath, stackLayout } from './geometry'
import { BOX, PLOT_BOTTOM, PLOT_TOP, SliderPlot, XAxis, YAxis, clampIndex, r2, yTicks, type PlotProps } from './LineChart'
import './charts.css'

const RIGHT = 8
const COLUMN_GAP = 2
const BIG = 1e300

/** The series markers sit in the right margin, in the middle of it, as small as a marker of the line plot is wide. */
const MARK_R = 3
const MARK_X = BOX.w - RIGHT / 2
const MARK_GAP = 8

/**
 * The left and right margin of a bar plot for useScrub's `inset` option. Columns are centred in their slots, so the
 * first and last points sit half a slot inside the plot area. In drawing-box units: pass BOX.w as useScrub's `span`.
 */
export function barInset(n: number): [number, number] {
  const count = Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1
  const half = (BOX.w - BOX.left - RIGHT) / count / 2
  return [BOX.left + half, RIGHT + half]
}

function finite(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** One rectangle as path text; the corners are already in drawing-box units. */
function rect(x: number, x2: number, top: number, bottom: number): string {
  return `M${r2(x)} ${r2(top)}H${r2(x2)}V${r2(bottom)}H${r2(x)}Z`
}

export function BarChart(p: PlotProps & { stacked?: boolean }): ReactElement {
  const { spec, scrub } = p
  const n = spec.x.length
  const stacked = p.stacked ?? spec.kind === 'stack'
  const k = Math.max(1, spec.series.length)
  const rows = spec.series.map((s) => Array.from({ length: n }, (_, i) => (finite(s.values[i]) ? (s.values[i] as number) : null)))

  // Where each cell starts and ends on the value axis.
  let lo: number[][]
  let hi: number[][]
  let min: number
  let max: number
  if (stacked) {
    const lay = stackLayout(rows)
    lo = lay.lo
    hi = lay.hi
    min = lay.min
    max = lay.max
  } else {
    min = 0
    max = 0
    lo = rows.map((r) => r.map((v) => (v !== null && v < 0 ? Math.max(-BIG, v) : 0)))
    hi = rows.map((r) => r.map((v) => (v !== null && v > 0 ? Math.min(BIG, v) : 0)))
    for (const r of lo) for (const v of r) if (v < min) min = v
    for (const r of hi) for (const v of r) if (v > max) max = v
  }

  // A stack of shares has a line at 100% of sales, and the axis always reaches it.
  const reference = stacked && spec.unit === 'pct'
  const [lo0, hi0] = extentOf(reference ? [min, max, 1] : [min, max], { zero: true })
  const room = (hi0 - lo0) * 0.06
  const dlo = lo0 < 0 ? lo0 - room : lo0
  const dhi = hi0 > 0 ? hi0 + room : hi0
  const sy = linearScale(dlo, dhi, PLOT_BOTTOM, PLOT_TOP)
  const ticks = yTicks(dlo, dhi, spec.unit)

  const plotW = BOX.w - BOX.left - RIGHT
  const slot = plotW / Math.max(1, n)
  const gap = Math.min(COLUMN_GAP, slot * 0.3)
  const width = Math.max(1, slot - gap)
  const part = stacked ? width : Math.max(0.5, width / k)
  const colX = (i: number): number => BOX.left + i * slot + gap / 2

  const paths = spec.series.map((s, si) => {
    let d = ''
    for (let i = 0; i < n; i++) {
      const a = lo[si]?.[i] ?? 0
      const b = hi[si]?.[i] ?? 0
      if (!(b > a)) continue
      let top = sy(b)
      let bottom = sy(a)
      // A value too small to see still shows, one unit tall.
      if (bottom - top < 1) {
        const mid = (top + bottom) / 2
        top = mid - 0.5
        bottom = mid + 0.5
      }
      const x = stacked ? colX(i) : colX(i) + si * part
      d += rect(x, x + part, top, bottom)
    }
    return d.length > 0 ? <path className={`ch-bc-series ch-tone-${s.tone}`} key={si} d={d} /> : null
  })

  // The legend gives every series a marker shape, so the picture shows them too, or the bands would be told apart by
  // colour alone: each series that has a bar in the last column gets its shape in the right margin, at the height of that
  // bar, the way a line ends with its own marker. They are whole pixels, pushed apart when two bars are close.
  const keyed = k >= 2 || spec.kind === 'stack'
  const ends: { si: number; y: number }[] = []
  if (keyed && n >= 1) {
    for (let si = 0; si < spec.series.length; si++) {
      const a = lo[si]?.[n - 1] ?? 0
      const b = hi[si]?.[n - 1] ?? 0
      if (b > a) ends.push({ si, y: Math.round((sy(a) + sy(b)) / 2) })
    }
  }
  const placed = dodgeLabels(
    ends.map((e) => e.y),
    MARK_GAP,
    PLOT_TOP + MARK_R,
    PLOT_BOTTOM,
  )

  const cur = scrub.active && n >= 1 ? clampIndex(scrub.index, n - 1) : -1
  const zeroY = r2(sy(0))
  const refY = r2(sy(1))

  return (
    <SliderPlot spec={spec} scrub={scrub} points={n}>
      <YAxis ticks={ticks} sy={sy} unit={spec.unit} right={BOX.w - RIGHT} />
      <line className="ch-zero" x1={BOX.left} x2={BOX.w - RIGHT} y1={zeroY} y2={zeroY} />
      <XAxis x={spec.x} at={(i) => BOX.left + (i + 0.5) * slot} />
      {paths}
      {ends.map((e, j) => {
        const shape = MARKER_SHAPES[e.si % MARKER_SHAPES.length]!
        return <path className={`ch-mk ch-bc-mk ch-tone-${spec.series[e.si]!.tone}`} key={e.si} data-shape={shape} d={markerPath(shape, MARK_X, r2(placed[j] ?? e.y), MARK_R)} />
      })}
      {reference ? (
        <>
          <line className="ch-ref" x1={BOX.left} x2={BOX.w - RIGHT} y1={refY} y2={refY} />
          <text className="ch-ref-label" x={BOX.w - RIGHT} y={r2(refY - 3)} textAnchor="end">
            100% of sales
          </text>
        </>
      ) : null}
      {cur >= 0 ? <rect className="ch-bc-cursor" x={r2(BOX.left + cur * slot)} y={PLOT_TOP} width={r2(slot)} height={PLOT_BOTTOM - PLOT_TOP} /> : null}
    </SliderPlot>
  )
}
