// A person's profile (family, friends, partners, pets, coworkers...) with their stats and
// the interactions from personActions().
import { fullName, personAvatar, relationLabel, shortMoney } from '../../game/core'
import { FLAGS } from '../../game/flags'
import { personActions } from '../../game/relationships'
import type { GameState, MenuNode, Person } from '../../game/types'
import { Breadcrumbs, crumbsOf } from '../nav/Breadcrumbs'
import { recentFromSpot } from '../nav/place'
import { recordRecent } from '../nav/prefs'
import { useApp } from '../store'
import { groupChildren, groupHeader, MenuRows, resolveTrail, useMenuNav, useMenuRunner, useSheetEscape, type MenuSpot } from './MenuList'
import { Sheet } from './Sheet'
import { StatBar } from './StatBar'

export interface PersonSheetProps {
  personId: string
  onClose: () => void
  /** Back arrow at the top level (e.g. return to the relationships list). */
  onBack?: () => void
  /** Open inside this group path (or the deepest part of it that still exists). */
  initial?: MenuSpot | null
  /** An interaction is about to close the sheet: where the player was. */
  onLeave?: (spot: MenuSpot) => void
}

/** Display name: pets and people without a last name use the first name only. */
export function personName(p: Person): string {
  return p.relation === 'pet' || !p.lastName ? p.firstName : fullName(p)
}

function ageText(age: number): string {
  return age === 1 ? '1 year old' : `${age} years old`
}

/** "Mother · 45 years old" / "Dog · 3 years old" / "Father · Deceased (age 71)" */
export function personSubtitle(p: Person): string {
  const rel = relationLabel(p)
  if (!p.alive) return `${rel} · Deceased (age ${p.age})`
  return `${rel} · ${ageText(p.age)}`
}

export function safeActions(g: GameState, p: Person): MenuNode[] {
  try {
    return personActions(g, p)
  } catch (err) {
    console.error('[menu] personActions failed:', err)
    return [{ type: 'info', id: 'person.error', emoji: '⚠️', text: "You can't interact with them right now." }]
  }
}

/** Extra 0-100 stats some modules keep in Person.data (BitLife-style relationship stats). */
const DATA_STATS: [string, string, string][] = [
  ['generosity', 'Generosity', '🎁'],
  ['religiousness', 'Religiousness', '🙏'],
  ['kindness', 'Kindness', '🤗'],
  ['professionalism', 'Professionalism', '👔'],
  ['strictness', 'Strictness', '📏'],
  ['popularity', 'Popularity', '🌟'],
  ['craziness', 'Craziness', '🤪'],
  ['willpower', 'Willpower', '💪'],
  ['petulance', 'Petulance', '😤'],
  ['diligence', 'Diligence', '📚'],
  ['loyalty', 'Loyalty', '🤝'],
  ['obedience', 'Obedience', '🦮'],
  ['entitlement', 'Entitlement', '👑'],
  ['respect', 'Respect', '🫡'],
  ['toughness', 'Toughness', '🥊'],
]

export function PersonDetails({ g, person }: { g: GameState; person: Person }) {
  const p = person
  const pet = p.relation === 'pet'
  const chips: string[] = []
  if (p.livesWithPlayer && p.alive) chips.push('🏠 Lives with you')
  if (p.pregnant && p.alive) chips.push('🤰 Expecting')
  if (p.biological === false && (p.relation === 'child' || p.relation === 'parent')) chips.push('📜 Adopted')

  const extra = DATA_STATS.filter(([key]) => {
    const v = p.data[key]
    return typeof v === 'number' && v >= 0 && v <= 100
  })

  const facts: [string, string][] = []
  if (pet) {
    if (p.breed) facts.push(['Breed', p.breed])
    if (p.species) facts.push(['Species', p.species])
  } else {
    if (p.occupation && p.occupation !== 'None') facts.push(['Occupation', p.occupation])
    if (p.age >= 16) facts.push(['Cash on hand', p.relationship >= 35 || p.livesWithPlayer ? shortMoney(Math.max(0, p.money)) : 'Private'])
  }
  if (p.yearsKnown > 0 && p.relation !== 'parent' && p.relation !== 'sibling') {
    facts.push(['Known for', p.yearsKnown === 1 ? '1 year' : `${p.yearsKnown} years`])
  }
  const metAt = p.data.metAt
  if (typeof metAt === 'string' && metAt) facts.push(['Met', metAt])
  if (!p.alive && p.causeOfDeath) facts.push(['Cause of death', p.causeOfDeath])
  const other = p.otherParentId ? g.people.find((x) => x.id === p.otherParentId) : undefined
  if (other && p.relation === 'child') facts.push([other.gender === 'male' ? 'Father' : 'Mother', personName(other)])

  return (
    <>
      <div className="person-hero">
        <div className="person-avatar" aria-hidden>
          {personAvatar(p)}
        </div>
        <div className="person-name">{personName(p)}</div>
        <div className="person-sub">{personSubtitle(p)}</div>
        {p.traits.length > 0 || chips.length > 0 ? (
          <div className="person-chips">
            {chips.map((c) => (
              <span className="pill" key={c}>
                {c}
              </span>
            ))}
            {p.traits.map((t) => (
              <span className="pill" key={t}>
                {t}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="card person-bars">
        <StatBar label="Relationship" emoji="❤️" value={p.relationship} />
        {pet ? (
          <>
            <StatBar small label="Health" emoji="🩺" value={p.stats.health} />
            <StatBar small label="Happiness" emoji="😊" value={p.stats.happiness} />
          </>
        ) : (
          <>
            <StatBar small label="Happiness" emoji="😊" value={p.stats.happiness} />
            <StatBar small label="Health" emoji="🩺" value={p.stats.health} />
            <StatBar small label="Smarts" emoji="🧠" value={p.stats.smarts} />
            <StatBar small label="Looks" emoji="💅" value={p.stats.looks} />
          </>
        )}
        {extra.map(([key, label, emoji]) => (
          <StatBar small key={key} label={label} emoji={emoji} value={p.data[key] as number} />
        ))}
        {facts.length > 0 ? (
          <div className="kv" style={{ marginTop: 4 }}>
            {facts.map(([k, v]) => (
              <div className="kv-row" key={k}>
                <span className="kv-key">{k}</span>
                <span className="kv-val">{v}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {p.notes.length > 0 ? (
        <div className="person-section">
          <div className="menu-heading">Shared history</div>
          <div className="card">
            <ul className="person-notes">
              {p.notes.slice(-6).map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  )
}

export function PersonSheet({ personId, onClose, onBack, initial, onLeave }: PersonSheetProps) {
  const g = useApp((s) => s.game)
  const person = g?.people.find((p) => p.id === personId)
  const rootNodes = g && person ? safeActions(g, person) : []
  const nav = useMenuNav((path) => (g ? resolveTrail(g, rootNodes, path) : []), initial)
  const runner = useMenuRunner({
    onOpenGroup: nav.push,
    onClose,
    onLeave: onLeave && (() => onLeave(nav.snapshot())),
    // Recents (G.9): on Relationships a place starts with the person (person.<id>), then the groups inside the sheet.
    onRan: (a) => {
      if (g) recordRecent(g.lifeId, { ...recentFromSpot('relationships', { path: nav.snapshot().path, personId }), id: a.id })
    },
  })
  useSheetEscape(nav.anchorRef, () => (nav.trail.length > 0 ? nav.pop() : (onBack ?? onClose)()))

  if (!g) return null

  if (!person) {
    // They left your life (broke up, moved away, removed) while the sheet was open.
    return (
      <Sheet title="Relationships" emoji="❤️" onClose={onClose} onBack={onBack}>
        <div className="menu-empty" ref={nav.anchorRef}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>👋</div>
          They're no longer part of your life.
          <div style={{ marginTop: 14 }}>
            <button className="btn btn-primary" onClick={onBack ?? onClose}>
              {onBack ? 'Back to relationships' : 'Close'}
            </button>
          </div>
        </div>
      </Sheet>
    )
  }

  const inGroup = nav.trail.length > 0
  const current = inGroup ? nav.trail[nav.trail.length - 1] : null
  const nodes = current ? groupChildren(current, g) : rootNodes
  const header = current ? groupHeader(current, g) : null
  // Breadcrumbs (G.8): Relationships, the person, then the groups. Crumb 0 is the list behind this sheet; crumb 1 is the
  // person's own page (level 0 of the trail); deeper crumbs are one level less than their place in the strip.
  const crumbs = FLAGS.navRegroup && inGroup ? crumbsOf(personName(person), nav.trail, ['Relationships']) : null
  const goCrumb = (depth: number) => (depth === 0 ? (onBack ?? onClose)() : nav.popTo(depth - 1))

  return (
    <>
      <Sheet
        title={current ? current.label : personName(person)}
        emoji={current ? current.emoji : undefined}
        onClose={onClose}
        onBack={inGroup ? nav.pop : onBack}
        subheader={crumbs ? <Breadcrumbs crumbs={crumbs} onGo={goCrumb} /> : undefined}
      >
        <div ref={nav.anchorRef}>
          {inGroup ? (
            <>
              <div className="row" style={{ margin: '0 4px 12px' }}>
                <span className="rel-avatar" aria-hidden>
                  {personAvatar(person)}
                </span>
                <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                  <strong>{personName(person)}</strong>
                  <span className="muted" style={{ fontSize: 13 }}>
                    {personSubtitle(person)}
                  </span>
                </span>
              </div>
              {header ? <div className="menu-header">{header}</div> : null}
              <MenuRows nodes={nodes} g={g} onTap={runner.tap} />
            </>
          ) : (
            <>
              <PersonDetails g={g} person={person} />
              <div className="person-section">
                <MenuRows
                  nodes={nodes}
                  g={g}
                  onTap={runner.tap}
                  emptyText={person.alive ? `There's nothing you can do with ${person.firstName} right now.` : 'Rest in peace.'}
                />
              </div>
            </>
          )}
        </div>
      </Sheet>
      {runner.overlay}
    </>
  )
}
