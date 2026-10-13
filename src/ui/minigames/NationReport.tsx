// The yearly State of the Nation (nation/yearly.ts buildReport): the country's results, how each
// group of voters sees you, and what your own laws did. Read-only: one button closes it.
import '../styles/politics.css'
import type { MinigameProps } from './types'

interface Metric { label: string; value: string; delta: string; tone: 'good' | 'bad' | 'neutral' }
interface Group { label: string; emoji: string; value: number }
interface Data {
  year: number | null
  country: string
  office: string
  approval: number
  metrics: Metric[]
  groups: Group[]
  causes: string[]
  rating: string
  ratingNote: string
}

const text = (v: unknown, max = 160): string => (typeof v === 'string' ? v.slice(0, max) : '')
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {})

/** Defensive parse: a damaged save still renders a readable card. */
export function readNationReport(raw: unknown): Data {
  const r = rec(raw)
  const metrics = (Array.isArray(r.metrics) ? r.metrics : []).slice(0, 8).map(rec).map((m): Metric => ({
    label: text(m.label, 40), value: text(m.value, 40), delta: text(m.delta, 40), tone: m.tone === 'good' || m.tone === 'bad' ? m.tone : 'neutral',
  })).filter(m => m.label)
  const groups = (Array.isArray(r.groups) ? r.groups : []).slice(0, 8).map(rec).map((x): Group => ({ label: text(x.label, 30), emoji: text(x.emoji, 8), value: Math.max(0, Math.min(100, Math.round(num(x.value, 50)))) })).filter(x => x.label)
  const causes = (Array.isArray(r.causes) ? r.causes : []).slice(0, 8).map(c => text(c, 200)).filter(Boolean)
  return {
    year: typeof r.year === 'number' && Number.isFinite(r.year) ? Math.round(r.year) : null,
    country: text(r.country, 60) || 'Your country', office: text(r.office, 60), approval: Math.max(0, Math.min(100, Math.round(num(r.approval, 50)))),
    metrics, groups, causes, rating: text(r.rating, 4) || '—', ratingNote: text(r.ratingNote, 160),
  }
}

function barTone(v: number): string {
  return v >= 60 ? 'is-good' : v >= 40 ? 'is-mid' : 'is-bad'
}

export function NationReport({ modal, onDone }: MinigameProps) {
  const r = readNationReport(modal.data)
  const ratingTone = ['AAA', 'AA', 'A'].includes(r.rating) ? 'is-good' : ['BBB', 'BB'].includes(r.rating) ? 'is-mid' : 'is-bad'
  return (
    <div className="nation-report">
      <header className="nr-head">
        <span className="nr-emoji" aria-hidden>🏛️</span>
        <div className="nr-id">
          {r.office ? <div className="nr-year">{r.office}</div> : null}
          <div className="nr-name">{r.country}</div>
          <div className="nr-sub">Approval {r.approval}%{r.year !== null ? ` · ${r.year}` : ''}</div>
        </div>
        <div className={`nr-rating ${ratingTone}`} title="Credit rating">
          <span className="nr-rating-label">Rating</span>
          <span className="nr-rating-value">{r.rating}</span>
        </div>
      </header>

      {r.metrics.length > 0 ? (
        <section className="nr-section" aria-label="Results">
          <div className="nr-metrics">
            {r.metrics.map((m) => (
              <div key={m.label} className={`nr-metric is-${m.tone}`}>
                <div className="nr-metric-label">{m.label}</div>
                <div className="nr-metric-value">{m.value}</div>
                {m.delta ? <div className="nr-metric-delta">{m.delta}</div> : null}
              </div>
            ))}
          </div>
          {r.ratingNote ? <p className="nr-note">{r.ratingNote}</p> : null}
        </section>
      ) : null}

      {r.groups.length > 0 ? (
        <section className="nr-section" aria-label="Approval by group">
          <h3 className="nr-heading">How voters see you</h3>
          <ul className="nr-groups">
            {r.groups.map((x) => (
              <li key={x.label} className="nr-group">
                <span className="nr-group-name"><span aria-hidden>{x.emoji}</span> {x.label}</span>
                <span className="nr-bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={x.value} aria-label={`${x.label} approval`}>
                  <span className={`nr-bar-fill ${barTone(x.value)}`} style={{ width: `${x.value}%` }} />
                </span>
                <span className="nr-group-value">{x.value}%</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="nr-section" aria-label="What your policies did">
        <h3 className="nr-heading">What your policies did</h3>
        {r.causes.length > 0 ? (
          <ul className="nr-causes">
            {r.causes.map((c, i) => <li key={`${i}-${c.slice(0, 20)}`}>{c}</li>)}
          </ul>
        ) : (
          <p className="nr-empty">No laws of yours are moving the economy yet.</p>
        )}
      </section>

      <button type="button" className="btn btn-primary btn-block" onClick={() => onDone('ok')}>
        Back to work
      </button>
    </div>
  )
}
