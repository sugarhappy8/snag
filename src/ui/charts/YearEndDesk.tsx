// The Year-End Desk (R1-C12, roadmap D.4): what sits above the Annual Report book when two or more reports queue for one
// year. A header block with the title and "2 of 6", a sideways row of company chips (the same numbers as the strip on the
// Summary tab) and one text button, Keep every plan. The block is not sticky: it scrolls away, so the only things that
// stay in view are the book's own header, tab row and button bar. The report itself comes in as `children`.
//
// It lives in the chart zone and loads lazily (lazy.tsx); until the chunk is there ModalHost shows the report alone.
// The desk holds no state and calls nothing of its own: the button is a handler ModalHost hands in.
import type { ReactElement, ReactNode } from 'react'
import type { StripRow } from '../../game/charts/books'
import { KEEP_ALL_LABEL } from '../minigames/yearEnd'
import { Sparkline } from './Sparkline'
import { describeDelta, formatSigned, formatUnit } from './format'
import './charts.css'

export interface YearEndDeskProps {
  /** The fiscal year of the reports; null when the data names none (the title then has no year). */
  year: number | null
  /** Where the open report stands in the batch. Both numbers are at least 1. */
  position: { index: number; of: number }
  /** The player's companies, best first (companyStrip). */
  strip: StripRow[]
  /** The company whose report is open: its chip is marked as the current step. */
  currentName: string
  /** Finish every queued report with "keep last year's plan". */
  onKeepAll: () => void
  /** The report (the book, or the text layout). */
  children: ReactNode
}

/** The most chips the desk draws, as many as companyStrip returns. */
const CHIP_MAX = 12

export function YearEndDesk(p: YearEndDeskProps): ReactElement {
  const { index, of } = p.position
  const rows = p.strip.slice(0, CHIP_MAX)
  // Two companies can share a name; the first one with it is the step.
  const current = rows.findIndex((row) => row.name === p.currentName)
  return (
    <div className="year-end-desk">
      <div className="yd-block">
        <header className="yd-head">
          <h3 className="yd-title">{p.year === null ? 'Year-End Desk' : `Year-End Desk, ${p.year}`}</h3>
          <span className="yd-step" role="img" aria-label={`Report ${index} of ${of}`}>
            {`${index} of ${of}`}
          </span>
        </header>
        {rows.length > 0 ? (
          <ul className="yd-chips" aria-label="Your companies" tabIndex={0}>
            {rows.map((row, i) => (
              <li key={row.id} className="yd-chip" aria-current={i === current ? 'step' : undefined}>
                <span className="yd-chip-emoji" aria-hidden="true">
                  {row.emoji}
                </span>
                <span className="yd-chip-text">
                  <span className="yd-chip-name">{row.name}</span>
                  <span className="yd-chip-num">
                    <span className="ch-sr">Net profit </span>
                    <strong>{formatSigned('money', row.net)}</strong>
                    {row.delta !== null ? <small>{describeDelta('money', row.delta)}</small> : null}
                  </span>
                </span>
                <Sparkline values={row.spark} tone="c1" label={`${row.name} net profit`} fmt={(n) => formatUnit('money', n)} />
              </li>
            ))}
          </ul>
        ) : null}
        <button type="button" className="btn btn-ghost yd-keep" onClick={p.onKeepAll}>
          {KEEP_ALL_LABEL}
        </button>
      </div>
      {p.children}
    </div>
  )
}

export default YearEndDesk
