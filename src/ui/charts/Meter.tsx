// A meter: one value on a track from min to max, with its text always written beside it. The track is the meter role
// (its children are decoration); the text row is for the eye, and aria-valuetext says the same to a screen reader.
// Bands tint the fill by the band the value is in and put a tick on each edge between bands. Plain elements, no svg.
import type { ReactElement } from 'react'
import type { ChartTone } from '../../game/charts/spec'
import './charts.css'

export interface MeterBand {
  /** The top of the band, in the meter's own units. */
  to: number
  tone: ChartTone
}

export interface MeterProps {
  label: string
  value: number
  min: number
  max: number
  /** What the value reads as: '14 months', '71 of 100'. Always shown. */
  valueText: string
  bands?: MeterBand[]
}

/** Two bounds that are finite and in order, with room between them. Shared with BulletRow. */
export function trackRange(min: number, max: number): [number, number] {
  let lo = Number.isFinite(min) ? min : 0
  let hi = Number.isFinite(max) ? max : lo + 1
  if (lo > hi) [lo, hi] = [hi, lo]
  if (!(hi > lo)) hi = lo + 1
  return [lo, hi]
}

/** A position along the track as a percentage, two decimals at most, inside 0 to 100. */
export function percentAt(v: number, lo: number, hi: number): number {
  const f = (v - lo) / (hi - lo)
  if (!Number.isFinite(f)) return 0
  return Math.round(Math.max(0, Math.min(1, f)) * 10000) / 100
}

export function Meter(p: MeterProps): ReactElement {
  const [lo, hi] = trackRange(p.min, p.max)
  const now = Number.isFinite(p.value) ? Math.max(lo, Math.min(hi, p.value)) : lo
  const bands = (p.bands ?? []).filter((b) => Number.isFinite(b.to)).sort((a, b) => a.to - b.to)
  const tone = (bands.find((b) => now <= b.to) ?? bands[bands.length - 1])?.tone ?? 'c1'
  const edges = bands.map((b) => b.to).filter((t) => t > lo && t < hi)
  return (
    <div className="ch-meter">
      <div className="ch-meter-head">
        <span className="ch-meter-label">{p.label}</span>
        <span className="ch-meter-value">{p.valueText}</span>
      </div>
      <div className="ch-meter-track" role="meter" aria-label={p.label} aria-valuemin={lo} aria-valuemax={hi} aria-valuenow={now} aria-valuetext={p.valueText}>
        <span className={`ch-meter-fill ch-tone-${tone}`} style={{ width: `${percentAt(now, lo, hi)}%` }} />
        {edges.map((t, i) => (
          <span className="ch-meter-tick" style={{ left: `${percentAt(t, lo, hi)}%` }} key={i} />
        ))}
      </div>
    </div>
  )
}
