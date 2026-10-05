// The life feed: "Age: N years" headers followed by first-person lines, newest at the
// bottom, auto-scrolling as the story grows.
import { memo, useLayoutEffect, useRef } from 'react'
import type { LogYear } from '../../game/types'
import { useApp } from '../store'

export interface LifeLogProps {
  log: LogYear[]
}

export function ageHeading(age: number): string {
  return age === 1 ? 'Age: 1 year' : `Age: ${age} years`
}

interface YearProps {
  year: LogYear
  showBadges: boolean
  /** Index of the first entry added since the last render (entries.length = none new). */
  freshFrom: number
}

const YearBlock = memo(
  function YearBlock({ year, showBadges, freshFrom }: YearProps) {
    return (
      <section className="lifelog-year" aria-label={ageHeading(year.age)}>
        <h3 className="lifelog-age">
          <span>{ageHeading(year.age)}</span>
          <span className="lifelog-calyear">{year.year}</span>
        </h3>
        {year.entries.map((e, i) => (
          <p key={e.id} className={`lifelog-entry tone-${e.tone}${i >= freshFrom ? ' is-new' : ''}`}>
            {e.text}
            {e.tone === 'ai' && showBadges ? (
              <span className="ai-spark" title="Written by your local AI" aria-label="AI">
                ✨
              </span>
            ) : null}
          </p>
        ))}
      </section>
    )
  },
  (a, b) =>
    a.showBadges === b.showBadges &&
    a.freshFrom === b.freshFrom &&
    a.year.age === b.year.age &&
    a.year.year === b.year.year &&
    a.year.entries.length === b.year.entries.length &&
    a.year.entries[a.year.entries.length - 1]?.id === b.year.entries[b.year.entries.length - 1]?.id &&
    a.year.entries[a.year.entries.length - 1]?.text === b.year.entries[b.year.entries.length - 1]?.text,
)

export function LifeLog({ log }: LifeLogProps) {
  const showBadges = useApp((s) => s.settings.showAiBadges)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const total = log.reduce((n, y) => n + y.entries.length, 0)
  const signature = `${log.length}:${total}`
  // Entries counted at the previous commit; anything after that animates in.
  const seenRef = useRef<number | null>(null)
  if (seenRef.current === null || seenRef.current > total) seenRef.current = total
  const seen = seenRef.current
  const mountedRef = useRef(false)

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

  let index = 0
  return (
    <div className="lifelog" ref={scrollRef} role="log" aria-live="polite" aria-label="Life story">
      {log.length === 0 ? <div className="lifelog-empty">Your story hasn't started yet.</div> : null}
      {log.map((year) => {
        const start = index
        index += year.entries.length
        const freshFrom = Math.min(year.entries.length, Math.max(0, seen - start))
        return <YearBlock key={`${year.age}-${year.year}`} year={year} showBadges={showBadges} freshFrom={freshFrom} />
      })}
    </div>
  )
}
