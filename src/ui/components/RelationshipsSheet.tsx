// Relationships: everyone in your life grouped like the original (Parents, Siblings,
// Partner, Children, Friends...). Tapping someone slides their PersonSheet over the list.
import { useState } from 'react'
import { personAvatar } from '../../game/core'
import { relationshipGroups } from '../../game/relationships'
import type { GameState, Person } from '../../game/types'
import { useApp } from '../store'
import { personName, personSubtitle, PersonSheet } from './PersonSheet'
import { Sheet } from './Sheet'
import { statColor } from './StatBar'

export interface RelationshipsSheetProps {
  onClose: () => void
}

function safeGroups(g: GameState): { title: string; people: Person[] }[] {
  try {
    return relationshipGroups(g).filter((grp: { title: string; people: Person[] }) => grp.people.length > 0)
  } catch (err) {
    console.error('[relationships] relationshipGroups failed:', err)
    return []
  }
}

export function RelationshipsSheet({ onClose }: RelationshipsSheetProps) {
  const g = useApp((s) => s.game)
  const [selected, setSelected] = useState<string | null>(null)
  if (!g) return null
  const groups = safeGroups(g)

  return (
    <>
      <Sheet title="Relationships" emoji="❤️" onClose={onClose}>
        {groups.length === 0 ? (
          <div className="menu-empty">
            <div style={{ fontSize: 40, marginBottom: 8 }}>🦗</div>
            Nobody's here. It's just you against the world.
          </div>
        ) : (
          groups.map((grp) => (
            <section key={grp.title}>
              <div className="menu-heading">
                {grp.title} <span style={{ opacity: 0.7 }}>({grp.people.length})</span>
              </div>
              <div className="menu-list">
                {grp.people.map((p) => (
                  <PersonRow key={p.id} person={p} onOpen={() => setSelected(p.id)} />
                ))}
              </div>
            </section>
          ))
        )}
      </Sheet>
      {selected ? <PersonSheet personId={selected} onBack={() => setSelected(null)} onClose={onClose} /> : null}
    </>
  )
}

function PersonRow({ person, onOpen }: { person: Person; onOpen: () => void }) {
  const p = person
  const rel = Math.max(0, Math.min(100, Math.round(p.relationship)))
  return (
    <button type="button" className={p.alive ? 'menu-row rel-row' : 'menu-row rel-row is-dead'} onClick={onOpen}>
      <span className="rel-avatar" aria-hidden>
        {personAvatar(p)}
      </span>
      <span className="menu-row-text">
        <span className="menu-row-label">{personName(p)}</span>
        <span className="menu-row-sub">{personSubtitle(p)}</span>
        {p.alive ? (
          <span className="rel-mini" role="meter" aria-label="Relationship" aria-valuenow={rel} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${rel}%`, background: statColor(rel) }} />
          </span>
        ) : null}
      </span>
      <span className="menu-row-end" aria-hidden>
        <span className="menu-row-chevron">›</span>
      </span>
    </button>
  )
}
