// Breadcrumbs (G.9): the strip under a sheet's header that shows where the player is (Activities > Computer > Ventures)
// and goes straight back to any level above. With `pin` a star at the right end pins the place being shown.
// Nothing here reads the game: the sheet hands in labels and callbacks.
import { useEffect, useRef, type ReactElement, type ReactNode } from 'react'
import '../styles/nav.css'

export interface Crumb {
  label: string
  /** Its place in the strip, counting `lead` crumbs, so the first crumb is 0. */
  depth: number
  /** The last crumb: the sheet the player is looking at. */
  current: boolean
}

/**
 * The crumbs of a sheet: `lead` labels (screens above the sheet's own root, like Relationships above a person), then the
 * root's label, then one crumb per open group. Only the last one is current.
 */
export function crumbsOf(rootLabel: string, trail: readonly { label: string }[], lead: readonly string[] = []): Crumb[] {
  const labels = [...lead, rootLabel, ...trail.map((t) => t.label)]
  return labels.map((label, depth) => ({ label, depth, current: depth === labels.length - 1 }))
}

export interface BreadcrumbsProps {
  crumbs: Crumb[]
  /** Go to the level of this crumb (never called for the current one). */
  onGo: (depth: number) => void
  pin?: { pinned: boolean; label: string; onToggle: () => void }
}

/** The list. It keeps the end of the strip in view as the trail grows, so the current crumb is always on screen. */
function CrumbList({ end, children }: { end: string; children: ReactNode }): ReactElement {
  const ref = useRef<HTMLOListElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [end])
  return (
    <ol className="crumbs-list" ref={ref}>
      {children}
    </ol>
  )
}

/** Null for one crumb (a root list needs no strip). */
export function Breadcrumbs({ crumbs, onGo, pin }: BreadcrumbsProps): ReactElement | null {
  if (crumbs.length < 2) return null
  return (
    <div className="crumbs">
      <nav className="crumbs-nav" aria-label="Breadcrumb">
        <CrumbList end={`${crumbs.length}:${crumbs[crumbs.length - 1]!.label}`}>
          {crumbs.map((c) => (
            <li className="crumb" key={`${c.depth}:${c.label}`}>
              {c.current ? (
                <span className="crumb-current" aria-current="page">
                  {c.label}
                </span>
              ) : (
                <button type="button" className="crumb-link" aria-label={`Go to ${c.label}`} onClick={() => onGo(c.depth)}>
                  {c.label}
                </button>
              )}
            </li>
          ))}
        </CrumbList>
      </nav>
      {pin ? (
        <button
          type="button"
          className="crumbs-pin"
          aria-pressed={pin.pinned}
          aria-label={`${pin.pinned ? 'Unpin' : 'Pin'} ${pin.label}`}
          onClick={pin.onToggle}
        >
          <span aria-hidden>{pin.pinned ? '★' : '☆'}</span>
        </button>
      ) : null}
    </div>
  )
}
