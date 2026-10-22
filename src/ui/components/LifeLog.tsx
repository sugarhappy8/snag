// The life feed: "Age: N years" headers followed by first-person lines, newest at the
// bottom, auto-scrolling as the story grows. The last few years are open; older ones fold to one
// row each (tap to open), which keeps a long life's DOM small. Inside a busy year the routine
// lines and the overflow fold into one closed row per category (logModel.ts).
import { memo, useCallback, useLayoutEffect, useRef, useState, type ReactElement } from 'react'
import type { LogYear, Tone } from '../../game/types'
import { foldCount, viewYearLog } from './logModel'
import '../styles/notices.css'

export interface LifeLogProps {
  log: LogYear[]
  /** Leave room at the bottom for the floating "Back to …" chip. */
  reserveBottom?: boolean
}

export function ageHeading(age: number): string {
  return age === 1 ? 'Age: 1 year' : `Age: ${age} years`
}

const TONES: readonly Tone[] = ['good', 'bad', 'neutral', 'event']

/**
 * The CSS class for a line's tone. Anything unknown (the retired 'ai' tone of older saves, junk)
 * is drawn as a plain line.
 */
export function toneClass(tone: unknown): string {
  return `tone-${typeof tone === 'string' && (TONES as readonly string[]).includes(tone) ? tone : 'neutral'}`
}

/** How many of the newest years stay open (and can't be folded). */
export const OPEN_YEARS = 3

export interface YearView {
  key: string
  year: LogYear
  open: boolean
  collapsible: boolean
}

/** The key a year is listed under: age and calendar year. */
export function yearKey(y: LogYear): string {
  return `${y.age}-${y.year}`
}

/** The last `openYears` entries are open and not collapsible; older ones are collapsed unless their key is in `expanded`. */
export function yearViews(log: readonly LogYear[], expanded: ReadonlySet<string>, openYears: number = OPEN_YEARS): YearView[] {
  const firstOpen = log.length - (Number.isFinite(openYears) ? Math.max(0, Math.floor(openYears)) : OPEN_YEARS)
  return log.map((year, i) => {
    const key = yearKey(year)
    return i >= firstOpen ? { key, year, open: true, collapsible: false } : { key, year, open: expanded.has(key), collapsible: true }
  })
}

/** What a folded year shows in place of its lines. */
export function collapsedSummary(y: LogYear): string {
  const n = y.entries.length
  return n === 0 ? 'No lines' : n === 1 ? '1 line' : `${n} lines`
}

interface YearProps {
  year: LogYear
  /** Index of the first entry added since the last render (entries.length = none new). */
  freshFrom: number
  /** Whether the lines are drawn. */
  open: boolean
  /** Whether the heading is a button that folds and opens the year (every year but the newest few). */
  collapsible: boolean
  onToggle: (key: string) => void
}

const YearBlock = memo(
  function YearBlock({ year, freshFrom, open, collapsible, onToggle }: YearProps) {
    if (!collapsible) {
      return (
        <section className="lifelog-year" aria-label={ageHeading(year.age)}>
          <h3 className="lifelog-age">
            <span>{ageHeading(year.age)}</span>
            <span className="lifelog-calyear">{year.year}</span>
          </h3>
          {entryLines(year, freshFrom)}
        </section>
      )
    }
    // No aria-controls: the lines it would point at are not in the page while the year is folded.
    return (
      <section className={open ? 'lifelog-year' : 'lifelog-year is-collapsed'} aria-label={ageHeading(year.age)}>
        <h3 className="lifelog-age">
          <button type="button" className="lifelog-toggle" aria-expanded={open} onClick={() => onToggle(yearKey(year))}>
            <span>{ageHeading(year.age)}</span> <span className="lifelog-calyear">{year.year}</span>{' '}
            <span className="lifelog-summary">{collapsedSummary(year)}</span>{' '}
            <span className="lifelog-glyph" aria-hidden="true">
              {open ? '-' : '+'}
            </span>
          </button>
        </h3>
        {open ? entryLines(year, freshFrom) : null}
      </section>
    )
  },
  (a, b) =>
    a.freshFrom === b.freshFrom &&
    a.open === b.open &&
    a.collapsible === b.collapsible &&
    a.onToggle === b.onToggle &&
    a.year.age === b.year.age &&
    a.year.year === b.year.year &&
    a.year.entries.length === b.year.entries.length &&
    a.year.entries[a.year.entries.length - 1]?.id === b.year.entries[b.year.entries.length - 1]?.id &&
    a.year.entries[a.year.entries.length - 1]?.text === b.year.entries[b.year.entries.length - 1]?.text,
)

function entryLines(year: LogYear, freshFrom: number): ReactElement[] {
  const { shown, collapsed } = viewYearLog(year.entries)
  if (collapsed.length === 0) {
    return year.entries.map((e, i) => (
      <p key={e.id} className={`lifelog-entry ${toneClass(e.tone)}${i >= freshFrom ? ' is-new' : ''}`}>
        {e.text}
      </p>
    ))
  }
  // A line is new by its place in the whole year, so a fold before it doesn't move the animation.
  const inView = new Set<unknown>(shown)
  const rows: ReactElement[] = []
  year.entries.forEach((e, i) => {
    if (!inView.has(e)) return
    rows.push(
      <p key={e.id} className={`lifelog-entry ${toneClass(e.tone)}${i >= freshFrom ? ' is-new' : ''}`}>
        {e.text}
      </p>,
    )
  })
  // The rows start closed and are never given `open`, so a line arriving later doesn't close one the player opened.
  for (const g of collapsed) {
    rows.push(
      <details key={`fold-${g.k}`} className="lifelog-fold">
        <summary>
          <span className="lifelog-fold-label">{g.label}</span> <span className="lifelog-fold-count">{foldCount(g.n)}</span>
        </summary>
        {g.lines.map((e) => (
          <p key={e.id} className={`lifelog-entry lifelog-folded ${toneClass(e.tone)}`}>
            {e.text}
          </p>
        ))}
      </details>,
    )
  }
  return rows
}

export interface YearListProps {
  log: readonly LogYear[]
  /** Keys of older years the player has opened. */
  expanded: ReadonlySet<string>
  onToggle: (key: string) => void
  /** Entries counted at the previous commit, over every year (folded ones too); anything after that animates in. */
  seen: number
}

/** The years of the feed, hook-free so tests can render it. */
export function YearList({ log, expanded, onToggle, seen }: YearListProps): ReactElement {
  let index = 0
  return (
    <>
      {yearViews(log, expanded).map(({ key, year, open, collapsible }) => {
        const start = index
        index += year.entries.length
        const freshFrom = Math.min(year.entries.length, Math.max(0, seen - start))
        return <YearBlock key={key} year={year} freshFrom={freshFrom} open={open} collapsible={collapsible} onToggle={onToggle} />
      })}
    </>
  )
}

/** Extra bottom padding (px) while the "Back to …" chip floats over the feed (matches the CSS). */
const CHIP_ROOM = 56

export function LifeLog({ log, reserveBottom = false }: LifeLogProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const total = log.reduce((n, y) => n + y.entries.length, 0)
  const signature = `${log.length}:${total}`
  // Entries counted at the previous commit; anything after that animates in.
  const seenRef = useRef<number | null>(null)
  if (seenRef.current === null || seenRef.current > total) seenRef.current = total
  const seen = seenRef.current
  const mountedRef = useRef(false)
  // Older years the player has opened. UI only, never saved; it starts over with the component (GameScreen keys it by life).
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const onToggle = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (!next.delete(key)) next.add(key)
      return next
    })
  }, [])

  useLayoutEffect(() => {
    const el = scrollRef.current
    seenRef.current = total
    if (!el) return
    const first = !mountedRef.current
    mountedRef.current = true
    const top = el.scrollHeight
    if (first || typeof el.scrollTo !== 'function') el.scrollTop = top
    else el.scrollTo({ top, behavior: 'smooth' })
  }, [signature, total])

  // When the chip appears, keep the newest lines in view above it (if you were reading them).
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || !reserveBottom) return
    const gap = el.scrollHeight - el.clientHeight - el.scrollTop
    if (gap > 0 && gap < CHIP_ROOM + 80) el.scrollTop = el.scrollHeight
  }, [reserveBottom])

  return (
    <div className={reserveBottom ? 'lifelog has-chip' : 'lifelog'} ref={scrollRef} role="log" aria-live="polite" aria-label="Life story">
      {log.length === 0 ? <div className="lifelog-empty">Your story hasn't started yet.</div> : null}
      <YearList log={log} expanded={expanded} onToggle={onToggle} seen={seen} />
    </div>
  )
}
