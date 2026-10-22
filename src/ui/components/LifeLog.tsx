// The life feed: "Age: N years" headers followed by first-person lines, newest at the
// bottom, auto-scrolling as the story grows. The last few years are open; older ones fold to one
// row each (tap to open), which keeps a long life's DOM small. Inside a busy year the routine
// lines and the overflow fold into one closed row per category (logModel.ts). The inline year card (R3-Q6) is a block of this feed,
// right before the newest year: it has its own height and no scroller of its own, so it scrolls with the lines and shares no column with
// them (the lead slot, LifeLogProps.lead).
import { memo, useCallback, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import type { LogYear, Tone } from '../../game/types'
import { foldCount, viewYearLog } from './logModel'
import '../styles/notices.css'

export interface LifeLogProps {
  log: LogYear[]
  /** Leave room at the bottom for the floating "Back to …" chip. */
  reserveBottom?: boolean
  /** A block of the feed right before the newest year: the inline year card. It may draw nothing. */
  lead?: ReactNode
  /** Names the lead (the year of the card). When it changes and the lead draws something, the feed opens at the lead and not at the newest line. */
  leadKey?: string | number
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
  /** A block that comes right before the newest year (alone, when the log has no year). Its box is always there, with a key of its own. */
  lead?: ReactNode
}

/** The box of the lead: a block of the feed, outside the live region's announcements (the card is not a new line of the story). */
function LeadSlot({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="lifelog-lead" aria-live="off">
      {children}
    </div>
  )
}

/** The years of the feed, hook-free so tests can render it. With no lead its children are the year blocks and nothing else. */
export function YearList({ log, expanded, onToggle, seen, lead }: YearListProps): ReactElement {
  let index = 0
  const blocks = yearViews(log, expanded).map(({ key, year, open, collapsible }) => {
    const start = index
    index += year.entries.length
    const freshFrom = Math.min(year.entries.length, Math.max(0, seen - start))
    return <YearBlock key={key} year={year} freshFrom={freshFrom} open={open} collapsible={collapsible} onToggle={onToggle} />
  })
  // The slot has a key of its own, so the year blocks keep theirs (and their state) when a lead comes or goes.
  if (lead !== undefined) blocks.splice(Math.max(0, blocks.length - 1), 0, <LeadSlot key="lead">{lead}</LeadSlot>)
  return <>{blocks}</>
}

/**
 * Where the feed scrolls to show a block: its top edge `inset` px under the top of the feed, from the two boxes the browser
 * measured (tops in the same space, `scrollTop` the feed's own). Never above the top, and 0 for a box that is not a number.
 */
export function scrollTopFor(feed: { top: number; scrollTop: number }, block: { top: number }, inset = 0): number {
  const at = block.top - feed.top + feed.scrollTop - inset
  return Number.isFinite(at) ? Math.max(0, Math.round(at)) : 0
}

/** The gap (px) kept above a new year card when the feed opens at it, so its border is not flush with the header. */
const LEAD_INSET = 8

/** Extra bottom padding (px) while the "Back to …" chip floats over the feed (matches the CSS). */
const CHIP_ROOM = 56

export function LifeLog({ log, reserveBottom = false, lead, leadKey }: LifeLogProps) {
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

  // The lead the feed last opened at (its key), so only a new card pulls the feed to itself; a new line follows the newest line as ever.
  const leadSeenRef = useRef<string | number | null>(null)

  useLayoutEffect(() => {
    const el = scrollRef.current
    seenRef.current = total
    if (!el) return
    const first = !mountedRef.current
    mountedRef.current = true
    const card = el.querySelector<HTMLElement>('.lifelog-lead > *')
    const fresh = card !== null && leadKey !== undefined && leadKey !== leadSeenRef.current
    leadSeenRef.current = card === null || leadKey === undefined ? null : leadKey
    const top = fresh ? scrollTopFor({ top: el.getBoundingClientRect().top, scrollTop: el.scrollTop }, { top: card.getBoundingClientRect().top }, LEAD_INSET) : el.scrollHeight
    if (first || typeof el.scrollTo !== 'function') el.scrollTop = top
    else el.scrollTo({ top, behavior: 'smooth' })
  }, [signature, total, leadKey])

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
      <YearList log={log} expanded={expanded} onToggle={onToggle} seen={seen} lead={lead} />
    </div>
  )
}
