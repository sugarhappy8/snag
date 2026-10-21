// The Annual Report 2.0 book (R1-C11, roadmap D.4): the report as five tabs, Summary, P&L, Cash, Market and Plan, with a
// sticky header, a tab row that scrolls sideways and a sticky bottom bar for the two buttons. It lives in the chart zone
// and loads lazily (lazy.tsx), so the charts stay out of the first download; until the chunk is there, and after a failed
// load, AnnualReport shows its text layout. The book holds no plan state: the sliders, the projection and the two buttons
// come in as `plan` and `actions`, built by AnnualReport with their handlers, so the price and the production survive a
// change of tab and nothing about the plan logic moves here.
//
// Only the open tab's panel is rendered. Money labels use the live bound money context, like every component.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement, type ReactNode } from 'react'
import type { StripRow } from '../../game/charts/books'
import { withLiveBasis } from '../../game/charts/money'
import type { ReportCharts } from '../../game/charts/report'
import type { ChartSpec } from '../../game/charts/spec'
import { rovingStop } from '../a11y/roving'
import { BOOK_TABS, TAB_LABELS, TAB_NAMES, missingNote, tabKey, type BookHead, type BookTab } from '../minigames/bookModel'
import { ChartView } from './ChartView'
import { KpiTile, kpiPropsOf, type KpiTileProps } from './KpiTile'
import { Sparkline } from './Sparkline'
import { describeDelta, formatSigned, formatUnit } from './format'
import './charts.css'

export interface ReportBookProps {
  head: BookHead
  charts: ReportCharts
  /** The Plan tab: the talent hint, the two sliders and the projection, exactly as the text report shows them. */
  plan: ReactNode
  /** The two buttons. The bottom bar shows them on every tab. */
  actions: ReactNode
  /** The player's companies, best first (companyStrip). The Summary tab shows it from two rows. */
  strip?: StripRow[]
  initialTab?: BookTab
}

/** The most rows the strip draws, as many as companyStrip returns. */
const STRIP_MAX = 12

/** The tile for one KPI spec: a rise is good news for all four (profit, sales, cash, value), so it is tinted that way. */
function tileProps(spec: ChartSpec): KpiTileProps {
  const p = kpiPropsOf(spec, 0)
  return p.delta ? { ...p, delta: { ...p.delta, good: p.delta.dir === 'flat' ? null : p.delta.dir === 'up' } } : p
}

/**
 * A chart in its frame, and its footnote under it (the cash walk and the cost structure carry one; the frame does not
 * draw it). The report was built when it was queued, so the chip names the prices on screen now, like the axes do.
 */
function Chart({ spec }: { spec: ChartSpec }): ReactElement {
  return (
    <div className="rb-block">
      <ChartView spec={withLiveBasis(spec)} />
      {spec.note ? <p className="rb-foot">{spec.note}</p> : null}
    </div>
  )
}

/** The statement lines of the text report, the way it prints them. */
function Statement({ lines }: { lines: BookHead['lines'] }): ReactElement {
  const last = lines.length - 1
  return (
    <dl className="ar-statement">
      {lines.map((l, i) => (
        <div key={`${i}-${l.label}`} className={`ar-line is-${l.tone}${i === last && i > 0 && /\b(net|profit|loss)\b/i.test(l.label) ? ' is-total' : ''}`}>
          <dt>{l.label}</dt>
          <dd>{l.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** The player's companies, one row each: name, the last net profit with its sign, the change and a small trend. */
function CompanyStrip({ rows }: { rows: readonly StripRow[] }): ReactElement {
  const id = useId()
  return (
    <section className="rb-strip" aria-labelledby={id}>
      <h4 className="rb-sub" id={id}>
        Your companies
      </h4>
      <ul className="rb-strip-list">
        {rows.slice(0, STRIP_MAX).map((row) => (
          <li className="rb-strip-row" key={row.id}>
            <span className="rb-strip-emoji" aria-hidden="true">
              {row.emoji}
            </span>
            <span className="rb-strip-name">{row.name}</span>
            <span className="rb-strip-num">
              <span className="ch-sr">Net profit </span>
              <strong>{formatSigned('money', row.net)}</strong>
              {row.delta !== null ? <small>{describeDelta('money', row.delta)}</small> : null}
            </span>
            <Sparkline values={row.spark} tone="c1" label={`${row.name} net profit`} fmt={(n) => formatUnit('money', n)} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function Summary({ p }: { p: ReportBookProps }): ReactElement {
  const { head, charts, strip } = p
  return (
    <>
      {charts.kpis.length > 0 ? (
        <div className="ch-kpi-grid">
          {charts.kpis.map((spec, i) => (
            <KpiTile key={i} {...tileProps(spec)} />
          ))}
        </div>
      ) : null}
      {charts.verdict ? <p className="rb-verdict">{charts.verdict}</p> : null}
      <Chart spec={charts.summary} />
      {strip && strip.length >= 2 ? <CompanyStrip rows={strip} /> : null}
      {head.lines.length > 0 ? (
        <details className="rb-all">
          <summary>All the numbers</summary>
          <Statement lines={head.lines} />
        </details>
      ) : null}
    </>
  )
}

function Market({ p }: { p: ReportBookProps }): ReactElement {
  const { head, charts } = p
  const drawn = [charts.share, charts.ladder, charts.size].filter((s): s is ChartSpec => s !== undefined)
  return (
    <>
      {drawn.length > 0 ? (
        <div className="rb-market-head">
          <h4 className="rb-sub">Your market</h4>
          <span className="ar-badge">Estimate</span>
        </div>
      ) : null}
      {head.marketNote ? (
        <p className="ar-note">
          <span className="ar-note-icon" aria-hidden="true">
            🌍
          </span>
          <span>{head.marketNote}</span>
        </p>
      ) : null}
      {drawn.map((spec, i) => (
        <Chart key={i} spec={spec} />
      ))}
    </>
  )
}

function Panel({ tab, p }: { tab: BookTab; p: ReportBookProps }): ReactElement {
  const { charts } = p
  switch (tab) {
    case 'summary':
      return <Summary p={p} />
    case 'pl':
      return (
        <>
          <Chart spec={charts.pl} />
          {charts.bridge ? <Chart spec={charts.bridge} /> : null}
          {charts.profit ? <Chart spec={charts.profit} /> : null}
          {charts.costs ? <Chart spec={charts.costs} /> : null}
        </>
      )
    case 'cash':
      return (
        <>
          {charts.cash ? <Chart spec={charts.cash} /> : null}
          {charts.cashLines ? <Chart spec={charts.cashLines} /> : null}
        </>
      )
    case 'market':
      return <Market p={p} />
    case 'plan':
      return <>{p.plan}</>
  }
}

export function ReportBook(p: ReportBookProps): ReactElement {
  const { head, charts } = p
  const [tab, setTab] = useState<BookTab>(p.initialTab !== undefined && BOOK_TABS.includes(p.initialTab) ? p.initialTab : 'summary')
  const uid = useId()
  const panelId = `${uid}-panel`
  const tabId = (t: BookTab): string => `${uid}-tab-${t}`
  const root = useRef<HTMLDivElement>(null)
  const buttons = useRef<Partial<Record<BookTab, HTMLButtonElement | null>>>({})
  const mounted = useRef(false)

  // A new tab starts at its top. The scroller is the popup around the book; the header and the tab row stay put.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    const scroller = root.current?.closest('.popup-scroll')
    if (scroller) scroller.scrollTop = 0
  }, [tab])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const next = tabKey(tab, e.key)
    if (next === tab) return
    setTab(next)
    buttons.current[next]?.focus()
  }

  const stop = rovingStop(BOOK_TABS, tab)
  const year = head.year ?? charts.year
  const note = missingNote(tab, charts)

  return (
    <div className="report-book" ref={root}>
      <header className="rb-head">
        <h3 className="rb-title">{`${year} Annual Report`}</h3>
        <span className="rb-company">
          <span aria-hidden="true">{head.emoji}</span>
          <span className="rb-name">{head.businessName}</span>
        </span>
      </header>
      <div className="rb-tabs" role="tablist" aria-label="Annual report sections" onKeyDown={onKeyDown}>
        {BOOK_TABS.map((t) => (
          <button
            key={t}
            ref={(el) => {
              buttons.current[t] = el
            }}
            type="button"
            role="tab"
            id={tabId(t)}
            className="rb-tab"
            aria-selected={t === tab}
            aria-controls={panelId}
            aria-label={TAB_NAMES[t]}
            tabIndex={t === stop ? 0 : -1}
            onClick={() => setTab(t)}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>
      <div className="rb-panel" role="tabpanel" id={panelId} aria-labelledby={tabId(tab)}>
        <Panel tab={tab} p={p} />
        {note ? <p className="rb-missing">{note}</p> : null}
      </div>
      <div className="rb-bar">{p.actions}</div>
    </div>
  )
}

export default ReportBook
