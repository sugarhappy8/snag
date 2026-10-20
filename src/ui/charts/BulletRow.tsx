// A bullet row: how you stand against the market. A bar for you, a thin tick for the market mean and a diamond for the
// best, on one track from min to max. The whole row is one image whose label says every number, so nothing hangs on
// reading the marks; the value and the rank are also written as text.
import type { ReactElement } from 'react'
import { percentAt, trackRange } from './Meter'
import { plainNumber } from './Sparkline'
import './charts.css'

export interface BulletRowProps {
  label: string
  mine: number
  market?: number
  best?: number
  min: number
  max: number
  /** Your value as text: '71', '$250K'. Always shown. */
  valueText: string
  /** Where you rank, as text: 'rank 3 of 9'. */
  rankText?: string
  /** How the market and the best read in the label. Default: plainNumber. */
  fmt?: (n: number) => string
}

function real(v: number | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

export function BulletRow(p: BulletRowProps): ReactElement {
  const [lo, hi] = trackRange(p.min, p.max)
  const fmt = p.fmt ?? plainNumber
  const yours = p.valueText.length > 0 ? p.valueText : real(p.mine) ? fmt(p.mine) : 'no data'
  const said = [`Yours ${yours}`]
  if (real(p.market)) said.push(`market ${fmt(p.market)}`)
  if (real(p.best)) said.push(`best ${fmt(p.best)}`)
  if (p.rankText) said.push(p.rankText)
  return (
    <div className="ch-bullet" role="img" aria-label={`${p.label}. ${said.join(', ')}`}>
      <div className="ch-bullet-head">
        <span className="ch-bullet-label">{p.label}</span>
        <span className="ch-bullet-value">{p.valueText}</span>
        {p.rankText ? <span className="ch-bullet-rank">{p.rankText}</span> : null}
      </div>
      <div className="ch-bullet-track">
        <span className="ch-bullet-bar" style={{ width: `${real(p.mine) ? percentAt(p.mine, lo, hi) : 0}%` }} />
        {real(p.market) ? <span className="ch-bullet-market" style={{ left: `${percentAt(p.market, lo, hi)}%` }} /> : null}
        {real(p.best) ? <span className="ch-bullet-best" style={{ left: `${percentAt(p.best, lo, hi)}%` }} /> : null}
      </div>
    </div>
  )
}
