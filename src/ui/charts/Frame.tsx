// The frame around every chart: title, the price-year chip, the plot, a legend, one line of readout, and a button that
// swaps the picture for a table of the same numbers. The frame is a labelled group, not an image: the children of an
// image role are presentational, which would hide the table button. The role of the picture belongs on the plot, which
// reads FrameContext to point its aria-labelledby and aria-describedby at the title and the summary written here.
import { createContext, useId, useState, type ReactElement, type ReactNode } from 'react'
import { priceChip } from '../../game/charts/money'
import type { ChartSpec, ChartTone } from '../../game/charts/spec'
import { MARKER_SHAPES, markerPath, type MarkerShape } from './geometry'
import { specTable } from './table'
import './charts.css'

export interface FrameProps {
  spec: ChartSpec
  children: ReactNode
  /** The line under the plot. Default: the spec's summary. */
  readout?: string
  /** Start with the table open. */
  tableOpen?: boolean
  className?: string
}

/** The ids a plot wires to: its name is the title, its description is the summary. */
export interface FrameIds {
  title: string
  summary: string
}

export const FrameContext = createContext<FrameIds | null>(null)

export interface LegendEntry {
  id: string
  label: string
  tone: ChartTone
  shape: MarkerShape
}

/** One entry for each series, each with its own marker shape (series i uses MARKER_SHAPES[i % 6]), so colour is never the only cue. */
export function legendOf(spec: ChartSpec): LegendEntry[] {
  return spec.series.map((s, i) => ({ id: s.id, label: s.label, tone: s.tone, shape: MARKER_SHAPES[i % MARKER_SHAPES.length]! }))
}

function Legend({ entries }: { entries: readonly LegendEntry[] }): ReactElement {
  return (
    <ul className="ch-legend">
      {entries.map((e, i) => (
        <li className="ch-legend-item" data-shape={e.shape} key={i}>
          <svg className={`ch-legend-mark ch-tone-${e.tone}`} viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">
            <path d={markerPath(e.shape, 6, 6, 5)} />
          </svg>
          <span>{e.label}</span>
        </li>
      ))}
    </ul>
  )
}

function DataTable({ spec }: { spec: ChartSpec }): ReactElement {
  const t = specTable(spec)
  return (
    <table className="ch-table">
      <caption>{t.caption}</caption>
      <thead>
        <tr>
          {t.head.map((h, i) => (
            <th scope="col" key={i}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {t.rows.map((row, r) => (
          <tr key={r}>
            {row.map((cell, c) =>
              c === 0 ? (
                <th scope="row" key={c}>
                  {cell}
                </th>
              ) : (
                <td key={c}>{cell}</td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function Frame(p: FrameProps): ReactElement {
  const { spec } = p
  const base = useId()
  const ids: FrameIds = { title: `${base}-title`, summary: `${base}-summary` }
  const tableId = `${base}-table`
  const [open, setOpen] = useState(p.tableOpen ?? false)
  const legend = legendOf(spec)
  const readout = p.readout !== undefined && p.readout.length > 0 ? p.readout : spec.summary

  return (
    <figure className={p.className ? `ch-frame ${p.className}` : 'ch-frame'} role="group" aria-labelledby={ids.title} aria-describedby={ids.summary}>
      <h4 id={ids.title} className="ch-title">
        {spec.title}
      </h4>
      {spec.unit === 'money' && spec.basis !== undefined ? <span className="ch-chip">{priceChip(spec.basis)}</span> : null}
      <FrameContext.Provider value={ids}>{p.children}</FrameContext.Provider>
      {legend.length >= 2 || (spec.kind === 'stack' && legend.length >= 1) ? <Legend entries={legend} /> : null}
      <p className="ch-readout" aria-live="polite">
        {readout}
      </p>
      <p id={ids.summary} className="ch-sr">
        {spec.summary}
      </p>
      <button type="button" className="ch-toggle" aria-expanded={open} aria-controls={tableId} onClick={() => setOpen(!open)}>
        {open ? 'Hide table' : 'Show as table'}
      </button>
      <div id={tableId} className="ch-table-wrap">
        {open ? <DataTable spec={spec} /> : null}
      </div>
    </figure>
  )
}
