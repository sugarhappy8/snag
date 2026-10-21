// Relationships: everyone in your life grouped like the original (Parents, Siblings,
// Partner, Children, Friends...). Tapping someone slides their PersonSheet over the list.
// It can reopen on a person (and a submenu of theirs) for the "Back to …" chip.
import { useRef, useState } from 'react'
import { personAvatar } from '../../game/core'
import { FLAGS } from '../../game/flags'
import { needsYou } from '../../game/hubs/needs'
import { peopleMenu, personIdOf } from '../../game/hubs/people'
import { relationshipGroups } from '../../game/relationships'
import type { GameState, Person } from '../../game/types'
import { CockpitPanel } from '../nav/CockpitPanel'
import { NeedsYouCard } from '../nav/NeedsYouCard'
import { useApp } from '../store'
import { useSheetEscape, type MenuSpot } from './MenuList'
import { personName, personSubtitle, PersonSheet } from './PersonSheet'
import { Sheet } from './Sheet'
import { statColor } from './StatBar'

export interface RelationshipsSheetProps {
  onClose: () => void
  /** Reopen on this person (if they're still around), inside `spot` of their interactions. */
  initial?: { personId?: string; spot?: MenuSpot | null } | null
  /** An interaction is about to close the sheet: who and where the player was. */
  onLeave?: (personId: string, spot: MenuSpot) => void
}

function safeGroups(g: GameState): { title: string; people: Person[] }[] {
  try {
    return relationshipGroups(g).filter((grp: { title: string; people: Person[] }) => grp.people.length > 0)
  } catch (err) {
    console.error('[relationships] relationshipGroups failed:', err)
    return []
  }
}

export function RelationshipsSheet({ onClose, initial, onLeave }: RelationshipsSheetProps) {
  const g = useApp((s) => s.game)
  const [selected, setSelected] = useState<string | null>(() => {
    const id = initial?.personId
    return id && g?.people.some((p) => p.id === id) ? id : null
  })
  // The remembered submenu applies to the first person sheet only, not to later visits.
  const reopenSpot = useRef(initial?.spot ?? null)
  const anchorRef = useRef<HTMLDivElement | null>(null)
  useSheetEscape(anchorRef, onClose)
  if (!g) return null
  const groups = safeGroups(g)
  // The cockpit and its Needs you card (G.5) hand a person group id; the sheet opens that person if they are still around.
  const openPerson = (groupId: string | undefined): void => {
    const id = groupId === undefined ? null : personIdOf(groupId)
    if (id !== null && g.people.some((p) => p.id === id)) setSelected(id)
  }

  return (
    <>
      <Sheet title="Relationships" emoji="❤️" onClose={onClose}>
        <div ref={anchorRef} />
        <CockpitPanel tab="relationships" g={g} onOpen={(path) => openPerson(path[0])} />
        {FLAGS.cockpits ? <NeedsYouCard rows={needsYou(peopleMenu.children(g), g)} onTap={(node) => openPerson(node.id)} /> : null}
        {groups.length === 0 ? (
          <div className="menu-empty">
            <div style={{ fontSize: 40, marginBottom: 8 }}>🦗</div>
            Nobody's here. It's just you against the world.
          </div>
        ) : (
          groups.map((grp) => (
            <section className="menu-section" key={grp.title}>
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
      {selected ? (
        <PersonSheet
          personId={selected}
          onBack={() => {
            reopenSpot.current = null
            setSelected(null)
          }}
          onClose={onClose}
          initial={selected === initial?.personId ? reopenSpot.current : null}
          onLeave={onLeave && ((spot) => onLeave(selected, spot))}
        />
      ) : null}
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
