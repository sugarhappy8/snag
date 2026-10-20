// A KPI tile: a label, one big value, how it moved, a note and a sparkline. Two sit side by side on a phone. With
// onPress the whole tile is a button (a cockpit opens its screen from a tile). The change is written with an ASCII sign
// and a word for the screen reader, so a rise and a fall never depend on colour: the tint only says whether it was good.
import type { ReactElement } from 'react'
import type { ChartSpec, ChartTone } from '../../game/charts/spec'
import { formatSigned, formatUnit } from './format'
import { Sparkline } from './Sparkline'
import './charts.css'

export interface KpiTileDelta {
  /** The size of the change, without its sign: '$310K'. A leading + or - is dropped, the tile writes its own. */
  text: string
  dir: 'up' | 'down' | 'flat'
  /** True or false tints the change good or bad. Null leaves it neutral (the caller has not decided what it means). */
  good: boolean | null
}

export interface KpiTileProps {
  label: string
  value: string
  note?: string
  delta?: KpiTileDelta
  /** The trend, oldest first. Fewer than two real points draws no sparkline. */
  values?: readonly (number | null)[]
  tone: ChartTone
  onPress?: () => void
  /** How a value reads in the sparkline's label (money: the life's own formatter). Default: plainNumber. */
  fmt?: (n: number) => string
}

const GLYPH = { up: '+', down: '-', flat: '=' } as const
const WORD = { up: 'up', down: 'down', flat: 'no change' } as const

function finite(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function deltaOf(unit: ChartSpec['unit'], change: number): KpiTileDelta {
  const signed = formatSigned(unit, change)
  const sign = signed.charAt(0)
  const text = sign === '+' || sign === '-' ? signed.slice(1) : signed
  let dir: KpiTileDelta['dir'] = sign === '+' ? 'up' : sign === '-' ? 'down' : 'flat'
  // A lower rank number is a better place, so a falling number reads as up, as it does in a ladder.
  if (unit === 'rank' && dir !== 'flat') dir = dir === 'up' ? 'down' : 'up'
  return { text, dir, good: null }
}

/**
 * The tile for one series of a spec: its last real value, the change against the real value before it, the spec's note
 * and the series as the sparkline. `good` stays null; the caller decides what a rise means. A series with no real value
 * reads 'no data'. An index that is not there is clamped to the series that are.
 */
export function kpiPropsOf(spec: ChartSpec, seriesIndex?: number): KpiTileProps {
  const fmt = (n: number): string => formatUnit(spec.unit, n)
  const note = spec.note !== undefined ? { note: spec.note } : {}
  const count = spec.series.length
  if (count === 0) return { label: spec.title, value: 'no data', tone: 'muted', values: [], fmt, ...note }
  const asked = typeof seriesIndex === 'number' && Number.isFinite(seriesIndex) ? Math.trunc(seriesIndex) : 0
  const s = spec.series[Math.max(0, Math.min(count - 1, asked))]!
  let last: number | null = null
  let prev: number | null = null
  for (const v of s.values) {
    if (!finite(v)) continue
    prev = last
    last = v
  }
  const props: KpiTileProps = { label: s.label, value: last === null ? 'no data' : fmt(last), tone: s.tone, values: s.values, fmt, ...note }
  if (last !== null && prev !== null) props.delta = deltaOf(spec.unit, last - prev)
  return props
}

function unsigned(text: string): string {
  return text.replace(/^\s*[+\-=]\s*/, '')
}

export function KpiTile(p: KpiTileProps): ReactElement {
  const d = p.delta
  const tint = d && d.good === true ? ' ch-delta-good' : d && d.good === false ? ' ch-delta-bad' : ''
  const body = (
    <>
      <span className="ch-kpi-label">{p.label}</span>
      <span className="ch-kpi-value">{p.value}</span>
      {d ? (
        <span className={`ch-kpi-delta ch-delta-${d.dir}${tint}`}>
          <span aria-hidden="true">{GLYPH[d.dir] ?? GLYPH.flat}</span> {unsigned(d.text)} <span className="ch-sr">{WORD[d.dir] ?? WORD.flat}</span>
        </span>
      ) : null}
      {p.note ? <span className="ch-kpi-note">{p.note}</span> : null}
      {p.values ? <Sparkline values={p.values} tone={p.tone} label={p.label} fmt={p.fmt} /> : null}
    </>
  )
  if (p.onPress) {
    return (
      <button type="button" className="ch-kpi ch-kpi-press" onClick={p.onPress}>
        {body}
      </button>
    )
  }
  return <div className="ch-kpi">{body}</div>
}
