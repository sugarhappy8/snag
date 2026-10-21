// The rank ladder of the chart kit: who holds the market, where you stand among your rivals. An ordered list of rows, each
// 44 px high: the place, the name (yours has a "you" pill and aria-current), the value, what changed since last time and a
// small trend. The change is always words ("up 2", "down 1", "no change", "new") with a triangle glyph that is only for the
// eye, so nothing hangs on a colour or a shape. The builder keeps the top five and a window around the player; where the
// places jump, a "..." row says so. At most 12 rows, so at most 12 sparklines of two paths each.
import { useContext, type ReactElement } from 'react'
import { SPEC_LIMITS, type ChartSpec, type LadderRow } from '../../game/charts/spec'
import { FrameContext } from './Frame'
import { clipText, formatUnit } from './format'
import { Sparkline } from './Sparkline'
import './charts.css'

export type LadderDir = 'up' | 'down' | 'flat' | 'new'

/** The same triangles the company dashboard uses for a rise, a fall and no change. A new entry has no glyph, only the word. */
const GLYPH: Record<LadderDir, string> = { up: '▲', down: '▼', flat: '▪', new: '' }

/** At most this many elements of a damaged rows array are looked at. */
const SCAN = 256

/**
 * What a row did since last time, in words: 'up 2', 'down 1', 'no change', or 'new' when there is no last place. A lower
 * rank number is a better place, so a rank that fell from 5 to 3 moved up. Wording matches the table under the chart.
 */
export function ladderChange(rank: number, prevRank: number | null): { dir: LadderDir; text: string } {
  if (prevRank === null || !Number.isFinite(prevRank) || !Number.isFinite(rank)) return { dir: 'new', text: 'new' }
  const d = Math.round(prevRank) - Math.round(rank)
  if (d === 0) return { dir: 'flat', text: 'no change' }
  return d > 0 ? { dir: 'up', text: `up ${d}` } : { dir: 'down', text: `down ${-d}` }
}

/** The rows that can be drawn, at most 12: each has a name, a value and a place, whatever else is wrong with the spec. */
function cleanRows(spec: ChartSpec): LadderRow[] {
  const raw: unknown = spec.rows
  if (!Array.isArray(raw)) return []
  const out: LadderRow[] = []
  for (let i = 0; i < raw.length && i < SCAN && out.length < SPEC_LIMITS.rows; i++) {
    const r: unknown = raw[i]
    if (typeof r !== 'object' || r === null) continue
    const o = r as Partial<Record<keyof LadderRow, unknown>>
    if (typeof o.name !== 'string' || typeof o.value !== 'number' || typeof o.rank !== 'number') continue
    out.push({
      id: typeof o.id === 'string' ? o.id : String(i),
      name: o.name,
      value: o.value,
      rank: o.rank,
      prevRank: typeof o.prevRank === 'number' ? o.prevRank : null,
      prev: typeof o.prev === 'number' ? o.prev : null,
      spark: Array.isArray(o.spark) ? (o.spark.slice(0, SPEC_LIMITS.spark) as (number | null)[]) : [],
      ...(o.you === true ? { you: true as const } : {}),
    })
  }
  return out
}

interface RowItem {
  row: LadderRow
}
interface GapItem {
  from: number
  to: number
}

/** The rows in order, with a gap marker wherever the places skip ahead. */
function itemsOf(rows: readonly LadderRow[]): (RowItem | GapItem)[] {
  const out: (RowItem | GapItem)[] = []
  let shown: number | null = null
  for (const row of rows) {
    const place = Number.isFinite(row.rank) ? Math.round(row.rank) : null
    if (shown !== null && place !== null && place - shown > 1) out.push({ from: shown + 1, to: place - 1 })
    if (place !== null) shown = place
    out.push({ row })
  }
  return out
}

function gapSentence(g: GapItem): string {
  return g.from === g.to ? `rank ${g.from} not shown` : `ranks ${g.from} to ${g.to} not shown`
}

export function RankLadder(p: { spec: ChartSpec }): ReactElement {
  const { spec } = p
  const ids = useContext(FrameContext)
  const rows = cleanRows(spec)
  if (rows.length === 0) return <p className="ch-summary">{spec.summary}</p>
  const fmt = (n: number): string => formatUnit(spec.unit, n)

  return (
    <ol className="ch-ladder" aria-label={spec.summary} aria-labelledby={ids?.title} aria-describedby={ids?.summary}>
      {itemsOf(rows).map((item, k) => {
        if ('from' in item) {
          return (
            <li className="ch-ladder-gap" key={`gap${k}`}>
              <span aria-hidden="true">...</span>
              <span className="ch-sr">{gapSentence(item)}</span>
            </li>
          )
        }
        const r = item.row
        const you = r.you === true
        const change = ladderChange(r.rank, r.prevRank)
        const glyph = GLYPH[change.dir]
        const name = clipText(r.name, SPEC_LIMITS.label)
        return (
          <li className={you ? 'ch-ladder-row ch-ladder-you' : 'ch-ladder-row'} key={`row${k}`} aria-current={you ? 'true' : undefined}>
            <span className="ch-ladder-rank">{formatUnit('rank', r.rank)}</span>
            <span className="ch-ladder-name">
              {name}
              {you ? ' ' : null}
              {you ? <span className="ch-ladder-pill">you</span> : null}
            </span>
            <span className="ch-ladder-value">{fmt(r.value)}</span>
            <span className={`ch-ladder-change ch-ladder-${change.dir}`}>
              {glyph ? (
                <span className="ch-ladder-glyph" aria-hidden="true">
                  {glyph}
                </span>
              ) : null}
              <span className="ch-ladder-words">{change.text}</span>
            </span>
            <Sparkline values={r.spark} tone={you ? 'c1' : 'muted'} label={`${name} trend`} fmt={fmt} />
          </li>
        )
      })}
    </ol>
  )
}
