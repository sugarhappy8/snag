// The one chart a screen asks for: ChartView({ spec }) picks the plot by spec.kind and puts it in a Frame (title, price
// chip, legend, readout, table toggle). It owns the cursor (useScrub) and hands it to the plots, so the frame's readout
// follows the plot. A kpi spec is not a chart but a row of tiles, one for each series, and has no frame. A kind this
// build does not know draws the summary and nothing else. Default and named export: the lazy gate needs the default.
import type { ReactElement } from 'react'
import { CHART_LIMITS, type ChartSpec } from '../../game/charts/spec'
import { BarChart, barInset } from './BarChart'
import { BulletRow } from './BulletRow'
import { Frame } from './Frame'
import { clipText, formatUnit, readoutFor, xText } from './format'
import { KpiTile, kpiPropsOf } from './KpiTile'
import { LINE_INSET, LineChart } from './LineChart'
import { RankLadder } from './RankLadder'
import { Timeline, ageLabelled } from './Timeline'
import { Waterfall } from './Waterfall'
import { useScrub } from './useScrub'
import './charts.css'

export interface ChartViewProps {
  spec: ChartSpec
  className?: string
}

function real(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** How many places the cursor can take: one for each x of a plot, one for each step of a waterfall, none for the rest. */
function pointsOf(spec: ChartSpec): number {
  switch (spec.kind) {
    case 'line':
    case 'bars':
    case 'stack':
    case 'timeline':
      return spec.x.length
    case 'waterfall':
      return (spec.steps ?? []).length
    default:
      return 0
  }
}

/** The margins around the points inside the plot, so a pointer maps onto the points the plot draws. */
function insetOf(spec: ChartSpec, n: number): [number, number] | undefined {
  switch (spec.kind) {
    case 'line':
    case 'timeline':
      return LINE_INSET
    case 'bars':
    case 'stack':
      return barInset(n)
    default:
      return undefined
  }
}

/** One bullet row for each x: you, the market mean and the best, with your place from the marks ('3 of 9'). */
function MeterRows(p: { spec: ChartSpec }): ReactElement {
  const { spec } = p
  const byId = (id: string) => spec.series.find((s) => s.id === id)
  const known = byId('mine') !== undefined || byId('market') !== undefined || byId('best') !== undefined
  const pick = (id: string, position: number) => (known ? byId(id) : spec.series[position])
  const mine = pick('mine', 0)
  const market = pick('market', 1)
  const best = pick('best', 2)
  const fmt = (n: number): string => formatUnit(spec.unit, n)
  const marks = Array.isArray(spec.marks) ? spec.marks : []
  return (
    <div className="ch-bullets">
      {spec.x.slice(0, CHART_LIMITS.points).map((x, i) => {
        const m = mine?.values[i]
        const k = market?.values[i]
        const b = best?.values[i]
        const seen = [m, k, b].filter(real)
        const rank = marks.find((mk) => real(mk.at) && Math.round(mk.at) === i)?.label
        return (
          <BulletRow
            key={i}
            label={clipText(xText(x), CHART_LIMITS.title)}
            mine={real(m) ? m : NaN}
            market={real(k) ? k : undefined}
            best={real(b) ? b : undefined}
            min={Math.min(0, ...seen)}
            max={Math.max(0, ...seen)}
            valueText={real(m) ? fmt(m) : 'no data'}
            rankText={rank}
            fmt={fmt}
          />
        )
      })}
    </div>
  )
}

export function ChartView(p: ChartViewProps): ReactElement {
  // A timeline is net worth by age: plain numbers on its x axis read "age 30" in the axis, the readout and the table alike.
  const spec = p.spec.kind === 'timeline' ? ageLabelled(p.spec) : p.spec
  const n = pointsOf(spec)
  const inset = insetOf(spec, n)
  const scrub = useScrub(n, inset ? { inset } : undefined)

  let plot: ReactElement
  let scrubbed = true
  switch (spec.kind) {
    case 'line':
      plot = <LineChart spec={spec} scrub={scrub} />
      break
    case 'bars':
    case 'stack':
      plot = <BarChart spec={spec} scrub={scrub} />
      break
    case 'waterfall':
      plot = <Waterfall spec={spec} scrub={scrub} />
      break
    case 'timeline':
      plot = <Timeline spec={spec} scrub={scrub} />
      break
    case 'ladder':
      plot = <RankLadder spec={spec} />
      scrubbed = false
      break
    case 'meter':
      plot = <MeterRows spec={spec} />
      scrubbed = false
      break
    case 'kpi':
      if (spec.series.length === 0) return <p className={p.className ? `ch-summary ${p.className}` : 'ch-summary'}>{spec.summary}</p>
      return (
        <div className={p.className ? `ch-kpi-grid ${p.className}` : 'ch-kpi-grid'}>
          {spec.series.map((_, i) => (
            <KpiTile key={i} {...kpiPropsOf(spec, i)} />
          ))}
        </div>
      )
    default:
      return <p className={p.className ? `ch-summary ${p.className}` : 'ch-summary'}>{spec.summary}</p>
  }

  // Ladder and meter have no cursor: their readout is the summary, which Frame writes when it is given none.
  return (
    <Frame spec={spec} className={p.className} readout={scrubbed ? readoutFor(spec, scrub.index) : undefined}>
      {plot}
    </Frame>
  )
}

export default ChartView
