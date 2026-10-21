// The lazy gate of the chart kit (R1-A8 zone rule): the only file outside src/ui/charts/ that other code may import, and
// the only file in here that starts a chunk. Every kit module is reached through import(), so the charts stay out of the
// first download; a screen renders its text rows (the `fallback`) until the chunk is ready, and a failed load leaves them
// in place with a way to try again (lazyView). Types come from the kit with `import type`, which costs nothing at run time.
// R1-C11 appends LazyReportBook and R1-C12 appends LazyYearEndDesk, each in its own hunk.
import { Fragment, type ReactElement, type ReactNode } from 'react'
import type { ChartSpec } from '../../game/charts/spec'
import { lazyView, type LazyView } from '../lazy/lazyView'
import type { KpiTileProps } from './KpiTile'
import type { ReportBookProps } from './ReportBook'
import type { SparklineProps } from './Sparkline'
import type { YearEndDeskProps } from './YearEndDesk'

/** The chart for a spec: a Frame and the plot for its kind. */
export const ChartViewLazy: LazyView<{ spec: ChartSpec; className?: string }> = lazyView('chart', () => import('./ChartView'))

/** A small trend with no axes, for a stock row or a company card. Pass fallback={null} where there is nothing to show instead. */
export const LazySparkline: LazyView<SparklineProps> = lazyView('sparkline', () => import('./Sparkline').then((m) => ({ default: m.Sparkline })))

/** A KPI tile: a label, a value, how it moved and a sparkline. */
export const LazyKpiTile: LazyView<KpiTileProps> = lazyView('kpi', () => import('./KpiTile').then((m) => ({ default: m.KpiTile })))

/**
 * ChartViewLazy that accepts a spec that may not exist: a null spec (a builder had nothing to draw) renders only the
 * fallback and loads nothing. This is what a screen puts where its text row used to be.
 */
export function LazyChartView(p: { spec: ChartSpec | null; fallback?: ReactNode }): ReactElement | null {
  if (p.spec === null) return p.fallback === undefined || p.fallback === null ? null : <Fragment>{p.fallback}</Fragment>
  return <ChartViewLazy spec={p.spec} fallback={p.fallback} />
}

/**
 * The Annual Report 2.0 book: five tabs over the report's charts. Give it the text layout as `fallback`: that is what shows
 * while the chunk loads, on the server, and when the load fails (lazyView adds a way to try again).
 */
export const LazyReportBook: LazyView<ReportBookProps> = lazyView('report-book', () => import('./ReportBook'))

/**
 * The Year-End Desk: the header block above the book when two or more reports queue for one year. Give it the report as
 * `fallback` (and as its children): that is what shows while the chunk loads, on the server and when the load fails.
 */
export const LazyYearEndDesk: LazyView<YearEndDeskProps> = lazyView('year-end-desk', () => import('./YearEndDesk'))
