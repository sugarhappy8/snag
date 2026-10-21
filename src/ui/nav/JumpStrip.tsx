// The Pinned and recent strip of a cockpit (G.9, G.5): up to four places of this tab, one tap each. A link opens a place
// the way a breadcrumb does, so the strip only hands the path to its caller. No hooks, so tests can call it directly.
import type { ReactElement } from 'react'
import type { PlaceRef } from './place'
import '../styles/nav.css'

/** A place worth coming back to, already checked against the latest state. `crumbs` run from the tab's root down to the place. */
export interface JumpLink {
  key: string
  label: string
  emoji: string
  crumbs: string[]
  place: PlaceRef
}

/** The most links a strip shows. */
export const MAX_JUMP = 4
/** A tooltip is at most 120 characters (docs/VOICE.md). */
const TITLE_MAX = 120

export interface JumpStripProps {
  links: readonly JumpLink[]
  /** Open the place: the group ids below the tab's root. */
  onOpen: (path: string[]) => void
}

export function JumpStrip({ links, onOpen }: JumpStripProps): ReactElement | null {
  const shown = links.slice(0, MAX_JUMP)
  if (shown.length === 0) return null
  return (
    <section className="cockpit-jump" aria-label="Pinned and recent">
      <div className="menu-heading">Pinned and recent</div>
      <div className="cockpit-jump-list">
        {shown.map((link) => (
          <button type="button" className="cockpit-jump-link" key={link.key} title={link.crumbs.join(' › ').slice(0, TITLE_MAX)} onClick={() => onOpen([...link.place.path])}>
            <span className="cockpit-jump-emoji" aria-hidden>
              {link.emoji}
            </span>
            <span className="cockpit-jump-label">{link.label}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
