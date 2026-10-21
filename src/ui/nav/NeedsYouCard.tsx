// The "Needs you" card (G.8): the rows of a root menu that have something waiting, above the list. A row here is the
// same node as the one in the list below, so a tap goes through the same runner. No hooks, so tests can call it directly.
import type { ReactElement } from 'react'
import type { NeedRow } from '../../game/hubs/needs'
import type { MenuAction, MenuGroup } from '../../game/types'
import '../styles/nav.css'

export interface NeedsYouCardProps {
  rows: NeedRow[]
  onTap: (node: MenuAction | MenuGroup) => void
}

export function NeedsYouCard({ rows, onTap }: NeedsYouCardProps): ReactElement | null {
  if (rows.length === 0) return null
  return (
    <section className="menu-section needs-card">
      <div className="menu-heading">Needs you</div>
      <div className="menu-list">
        {rows.map((row, i) => (
          <button type="button" className="menu-row" key={`${row.node.id}#${i}`} onClick={() => onTap(row.node)}>
            <span className="menu-row-icon" aria-hidden>
              {row.node.emoji}
            </span>
            <span className="menu-row-text">
              <span className="menu-row-label">{row.node.label}</span>
              <span className="menu-row-badge">{row.badge}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
