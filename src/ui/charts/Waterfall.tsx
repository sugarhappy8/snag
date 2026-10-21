// The waterfall of the chart kit: ROWS, not columns. A list of 44 px rows, each with a sign glyph, the label and the
// amount on the first line and a bar on the second, drawn on one scale for the whole list. A cost hangs from where the
// running level was, so it visibly eats the sales; a total stands on the zero axis. A row never depends on colour: the
// ASCII glyph (= for a total, + or - for a change) and the amount's own sign say the same thing. The list is the focus
// target: the arrow keys move a highlighted row, which then also says the running total. The picture of every row is
// hidden from assistive technology; a visually hidden sentence says the row in words.
import { useContext, type ReactElement } from 'react'
import type { ChartSpec, ChartStep, ChartTone } from '../../game/charts/spec'
import { FrameContext } from './Frame'
import { formatSigned, formatUnit } from './format'
import { linearScale, waterfallLayout } from './geometry'
import { r2 } from './LineChart'
import { useScrub, type ScrubApi } from './useScrub'
import './charts.css'

/** The drawing box of one bar. */
const BAR_W = 100
const BAR_H = 8
/** The least a bar may be wide, so a small amount still shows. */
const MIN_BAR = 0.6

function safe(v: number): number {
  return Number.isFinite(v) ? v : 0
}

/** The tone of an amount: more than nothing is good, less is bad, nothing is neutral. */
function toneOf(v: number): ChartTone {
  return v > 0 ? 'good' : v < 0 ? 'bad' : 'c6'
}

/** 'sales after tax' for mid-sentence use; a label that starts with an acronym is left alone. */
function lowerFirst(s: string): string {
  const word = s.split(' ')[0] ?? ''
  return /[A-Z]/.test(word.slice(1)) ? s : s.charAt(0).toLowerCase() + s.slice(1)
}

function shareOf(part: number, whole: number): string {
  const p = (Math.abs(safe(part)) / Math.abs(safe(whole))) * 100
  if (!Number.isFinite(p)) return ''
  if (p > 0 && p < 0.5) return '<1%'
  return p > 999 ? 'over 999%' : `${Math.round(p)}%`
}

/** The row in words: 'Materials and direct costs, minus $3.9M, 41% of sales after tax'. */
function sentenceOf(unit: ChartSpec['unit'], step: ChartStep, first: ChartStep | undefined): string {
  const label = typeof step.label === 'string' ? step.label : ''
  const v = safe(step.value)
  let amount: string
  if (step.kind === 'delta') amount = v === 0 ? 'no change' : `${v < 0 ? 'minus' : 'plus'} ${formatUnit(unit, Math.abs(v))}`
  else amount = v < 0 ? `minus ${formatUnit(unit, -v)}` : formatUnit(unit, v)
  const share = first && first !== step && safe(first.value) !== 0 ? shareOf(v, first.value) : ''
  return `${label}, ${amount}${share && first ? `, ${share} of ${lowerFirst(typeof first.label === 'string' ? first.label : '')}` : ''}`
}

export function Waterfall(p: { spec: ChartSpec; scrub?: ScrubApi }): ReactElement {
  const { spec } = p
  const ids = useContext(FrameContext)
  const steps = spec.steps ?? []
  // The list keeps a cursor of its own when its caller does not hand one over.
  const own = useScrub(steps.length)
  const scrub = p.scrub ?? own
  const { bars, min, max } = waterfallLayout(steps)
  const sx = linearScale(min, max, 0, BAR_W)
  const zero = r2(sx(0))
  const crosses = min < 0 && max > 0
  const first = steps.find((s) => s.kind === 'total')
  const on = scrub.active && Number.isInteger(scrub.index) && scrub.index >= 0 && scrub.index < steps.length ? scrub.index : -1
  const marks = spec.marks ?? []

  // The list is the focus target and only the keyboard drives it: a pointer's position along a column of rows says
  // nothing about which row it is over.
  return (
    <ol
      className="ch-wf"
      aria-label={spec.summary}
      aria-labelledby={ids?.title}
      aria-describedby={ids?.summary}
      tabIndex={0}
      onKeyDown={scrub.handlers.onKeyDown}
      onBlur={scrub.handlers.onBlur}
    >
      {steps.map((s, i) => {
        const bar = bars[i]
        const v = safe(s.value)
        const total = s.kind === 'total'
        const a = sx(Math.min(bar?.start ?? 0, bar?.end ?? 0))
        const b = sx(Math.max(bar?.start ?? 0, bar?.end ?? 0))
        const w = Math.min(BAR_W, Math.max(MIN_BAR, b - a))
        const x = Math.max(0, Math.min(a, BAR_W - w))
        const glyph = total ? '=' : v < 0 ? '-' : '+'
        const isOn = i === on
        const notes = marks.filter((m) => m.at === i)
        return (
          <li className={`ch-wf-row ch-wf-${total ? 'total' : 'delta'}${isOn ? ' ch-wf-on' : ''}`} key={i} aria-current={isOn ? 'true' : undefined}>
            <span className="ch-wf-line" aria-hidden="true">
              <span className="ch-wf-sign">{glyph}</span>
              <span className="ch-wf-label">{s.label}</span>
              <span className="ch-wf-amt">{total ? formatUnit(spec.unit, v) : formatSigned(spec.unit, v)}</span>
            </span>
            <svg className="ch-wf-bar" viewBox={`0 0 ${BAR_W} ${BAR_H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
              {crosses ? <line className="ch-wf-zero" x1={zero} x2={zero} y1={0} y2={BAR_H} /> : null}
              <rect className={`ch-wf-fill ch-tone-${toneOf(v)}`} x={r2(x)} y={0} width={r2(w)} height={BAR_H} />
            </svg>
            <span className="ch-sr">{sentenceOf(spec.unit, s, first)}</span>
            {isOn ? <span className="ch-wf-run">{`Running total ${formatUnit(spec.unit, safe(bar?.level ?? 0))}`}</span> : null}
            {notes.map((m, k) => (
              <span className="ch-wf-note" key={k}>
                {m.label}
              </span>
            ))}
          </li>
        )
      })}
    </ol>
  )
}
