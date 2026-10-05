// The end-of-life screen (shown by GameScreen once the character is dead and the queue is
// empty): tombstone, ribbon, obituary, life summary, journal, and what to do next —
// continue as one of your children, live again, or start over.
import { useMemo, useState } from 'react'
import {
  characterAvatar,
  children as childrenOf,
  formatMoney,
  fullName,
  netWorth,
  peopleBy,
  personAvatar,
  pronouns,
  relationLabel,
} from '../../game/core'
import { getRibbon } from '../../game/ribbons'
import type { Degree, DegreeKind, GameState, Person, RelationKind } from '../../game/types'
import { getCountry } from '../../game/world'
import { StatBar } from '../components/StatBar'
import { continueAs, goTo, startNewLife, useApp } from '../store'
import '../styles/screens.css'

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)

/** Deterministic pick so the same death always reads the same across re-renders. */
export function stablePick<T>(seed: string, list: readonly T[]): T {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return list[Math.abs(h) % list.length]
}

const DEGREE_RANK: Record<DegreeKind, number> = {
  ged: 1,
  highschool: 2,
  associate: 3,
  bachelor: 4,
  nursing: 5,
  master: 5,
  mba: 5,
  jd: 6,
  md: 6,
  dds: 6,
  pharmd: 6,
  dvm: 6,
  doctorate: 6,
}

/** Highest education reached, as BitLife's tombstone shows it. */
export function highestEducation(g: GameState): string {
  const ed = g.character.education
  const best = ed.degrees.reduce<Degree | null>((top, d) => (!top || (DEGREE_RANK[d.kind] ?? 0) > (DEGREE_RANK[top.kind] ?? 0) ? d : top), null)
  if (best) return best.name
  if (ed.droppedOut.includes('high')) return 'High school dropout'
  if (ed.completed.includes('middle')) return 'Middle school'
  if (ed.completed.includes('elementary')) return 'Elementary school'
  if (ed.current) return 'Still in school'
  return 'None'
}

/** Living children (biological, adopted or step) who can carry on the family, oldest first. */
export function heirsOf(g: GameState): Person[] {
  return childrenOf(g, true).sort((a, b) => b.age - a.age)
}

export interface DeathFact {
  label: string
  value: string
  emoji: string
  wide?: boolean
}

/** Tombstone stats: always the basics, plus the "if applicable" ones when non-zero. */
export function deathFacts(g: GameState): DeathFact[] {
  const c = g.character
  const country = getCountry(c.countryId)
  const n = (key: string) => g.counters[key] ?? 0
  const occupation = typeof g.flags.finalOccupation === 'string' && g.flags.finalOccupation ? g.flags.finalOccupation : 'Unemployed'
  const facts: DeathFact[] = [
    { label: 'Net worth', value: formatMoney(netWorth(g)), emoji: '💰' },
    { label: 'Lived in', value: `${country.flag} ${c.city}`, emoji: '🏙️' },
    { label: 'Career', value: occupation, emoji: '💼' },
    { label: 'Education', value: highestEducation(g), emoji: '🎓' },
  ]
  const kids = childrenOf(g, false).length
  const grandkids = peopleBy(g, ['grandchild'], false).length
  const optional: [string, number, string][] = [
    ['Children', kids, '👶'],
    ['Grandchildren', grandkids, '🧒'],
    ['Marriages', n('marriages'), '💍'],
    ['Lovers', n('partners'), '💘'],
    ['Degrees', c.education.degrees.length, '📜'],
    ['Crimes', n('crimes'), '🦹'],
    ['Murders', n('murders'), '🔪'],
    ['Years in prison', n('prisonYears'), '⛓️'],
    ['Prison escapes', n('escapes'), '🏃'],
    ['Pets', n('pets'), '🐾'],
    ['Countries visited', n('vacations'), '✈️'],
  ]
  for (const [label, value, emoji] of optional) {
    if (value > 0) facts.push({ label, value: value.toLocaleString('en-US'), emoji })
  }
  if (c.social && c.social.followers > 0) {
    facts.push({ label: `${c.social.platform} followers`, value: c.social.followers.toLocaleString('en-US'), emoji: '📱' })
  }
  if (facts.length % 2 === 1) facts[facts.length - 1].wide = true
  return facts
}

const MOURNER_RELATIONS: RelationKind[] = [
  'spouse',
  'fiance',
  'partner',
  'parent',
  'stepparent',
  'child',
  'stepchild',
  'grandchild',
  'sibling',
  'halfSibling',
  'stepsibling',
  'grandparent',
  'bestFriend',
  'friend',
]

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/** "Mourned by his wife Sarah, 3 children and his loyal dog Rex." — who came to the funeral. */
export function mournersLine(g: GameState): string {
  const c = g.character
  const his = pronouns(c.gender).his
  const came = g.people.filter((p) => p.alive && MOURNER_RELATIONS.includes(p.relation) && p.relationship >= 50)
  const pets = g.people.filter((p) => p.alive && p.relation === 'pet' && p.livesWithPlayer !== false)
  const parts: string[] = []
  const named = (rels: RelationKind[]) =>
    came.filter((p) => rels.includes(p.relation)).forEach((p) => parts.push(`${his} ${relationLabel(p).toLowerCase()} ${p.firstName}`))
  const grouped = (rels: RelationKind[], one: string, many: string) => {
    const list = came.filter((p) => rels.includes(p.relation))
    if (list.length === 1) parts.push(`${his} ${one} ${list[0].firstName}`)
    else if (list.length > 1) parts.push(`${list.length} ${many}`)
  }
  named(['spouse', 'fiance', 'partner'])
  named(['parent', 'stepparent'])
  grouped(['child', 'stepchild'], c.gender === 'male' ? 'kid' : 'kid', 'children')
  grouped(['grandchild'], 'grandchild', 'grandchildren')
  grouped(['sibling', 'halfSibling', 'stepsibling'], 'sibling', 'siblings')
  grouped(['grandparent'], 'grandparent', 'grandparents')
  grouped(['bestFriend', 'friend'], 'friend', 'friends')
  for (const pet of pets.slice(0, 2)) parts.push(`${his} loyal ${(pet.species ?? 'pet').toLowerCase()} ${pet.firstName}`)

  if (parts.length === 0) {
    return stablePick(g.lifeId + 'nobody', [
      'Nobody came to the funeral. The priest checked his watch twice.',
      'The funeral was attended by no one except a pigeon, who left early.',
      'Not a single person showed up. The flowers were for a different funeral.',
    ])
  }
  return `Mourned by ${joinList(parts)}.`
}

export interface LegacyRow {
  generation: number
  name: string
  years: string
  age: number
  ribbonEmoji: string
  current: boolean
}

/** The family line so far, oldest first, ending with the life that just ended. */
export function legacyRows(g: GameState): LegacyRow[] {
  const c = g.character
  const rows: LegacyRow[] = g.ancestors.map((a) => ({
    generation: a.generation,
    name: a.name,
    years: `${a.bornYear}–${a.diedYear}`,
    age: a.age,
    ribbonEmoji: (a.ribbon && getRibbon(a.ribbon)?.emoji) || '🪦',
    current: false,
  }))
  rows.push({
    generation: g.generation,
    name: fullName(c),
    years: `${g.year - c.age}–${g.year}`,
    age: c.age,
    ribbonEmoji: (g.ribbon && getRibbon(g.ribbon)?.emoji) || '🪦',
    current: true,
  })
  return rows
}

// ---------------------------------------------------------------------------
// Pieces

const DRIPS = [
  { left: 4, h: 36, d: 0 },
  { left: 15, h: 64, d: 0.3 },
  { left: 27, h: 28, d: 0.1 },
  { left: 39, h: 80, d: 0.5 },
  { left: 52, h: 40, d: 0.2 },
  { left: 63, h: 58, d: 0.6 },
  { left: 75, h: 30, d: 0.15 },
  { left: 86, h: 70, d: 0.4 },
  { left: 95, h: 34, d: 0.25 },
]

const CONFETTI = ['🎉', '✨', '🎊', '⭐', '🎉', '✨', '🎊', '⭐', '🎉', '✨', '🎊', '⭐', '🎉', '✨']

function RibbonAward({ ribbonId }: { ribbonId: string | null }) {
  const ribbon = ribbonId ? getRibbon(ribbonId) : undefined
  if (!ribbon) {
    return (
      <section className="al-card death-ribbon">
        <div className="ribbon-wrap">
          <div className="ribbon-badge none" aria-hidden="true">
            🤷
          </div>
        </div>
        <h3>No ribbon this time</h3>
        <p className="al-muted">Some lives refuse to be summed up in one word.</p>
      </section>
    )
  }
  return (
    <section className="al-card death-ribbon" aria-label={`Ribbon earned: ${ribbon.name}`}>
      <div className="ribbon-confetti" aria-hidden="true">
        {CONFETTI.map((e, i) => (
          <span key={i} style={{ left: `${(i * 37 + 5) % 96}%`, animationDelay: `${0.5 + (i % 7) * 0.17}s` }}>
            {e}
          </span>
        ))}
      </div>
      <div className="al-small al-muted" style={{ fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        You earned a ribbon!
      </div>
      <div className="ribbon-wrap">
        <span className="ribbon-tail left" />
        <span className="ribbon-tail right" />
        <div className="ribbon-badge" aria-hidden="true">
          {ribbon.emoji}
        </div>
      </div>
      <h3>{ribbon.name}</h3>
      <p className="al-muted">{ribbon.description}</p>
    </section>
  )
}

function Journal({ g, showAi }: { g: GameState; showAi: boolean }) {
  const years = g.log.filter((y) => y.entries.length > 0)
  if (years.length === 0) return <p className="al-muted">The pages are blank. It was a quiet life.</p>
  return (
    <div className="journal-scroll">
      {years.map((y) => (
        <div className="journal-year" key={`${y.age}-${y.year}`}>
          <div className="journal-age">
            Age {y.age} <span className="al-muted al-small">({y.year})</span>
          </div>
          {y.entries.map((e) => (
            <p key={e.id} className={`journal-entry ${e.tone === 'ai' && !showAi ? '' : e.tone}`}>
              {e.text}
            </p>
          ))}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// The screen

export interface DeathScreenProps {
  /** Defaults to the game in the store. */
  game?: GameState
}

export function DeathScreen({ game: gameProp }: DeathScreenProps = {}) {
  const storeGame = useApp((s) => s.game)
  const aiLevel = useApp((s) => s.settings.aiLevel)
  const showAiBadges = useApp((s) => s.settings.showAiBadges)
  const aiStatus = useApp((s) => s.aiStatus)
  const [journalOpen, setJournalOpen] = useState(false)
  const g = gameProp ?? storeGame

  const view = useMemo(() => {
    if (!g) return null
    return {
      facts: deathFacts(g),
      heirs: heirsOf(g),
      mourners: mournersLine(g),
      legacy: g.ancestors.length > 0 ? legacyRows(g) : [],
    }
  }, [g])

  if (!g || !view) return null
  const c = g.character
  const bornYear = g.year - c.age
  const cause = c.causeOfDeath ?? 'Unknown causes'
  const his = pronouns(c.gender).his

  const source = g.flags.obituarySource
  const aiObituary = source === 'ai' || (source === undefined && aiLevel !== 'off' && aiStatus === 'online')
  const obituary =
    g.obituary?.trim() ||
    stablePick(g.lifeId + 'obit', [
      `${c.firstName} lived ${c.age} years and then, rather abruptly, didn't.`,
      `${c.firstName} ${c.lastName} is survived by ${his} browser history.`,
      `Nobody got around to writing ${c.firstName}'s obituary. Somehow that sums it up.`,
    ])

  const liveAgain = () => {
    startNewLife({
      firstName: c.firstName,
      lastName: c.lastName,
      gender: c.gender,
      countryId: c.birthCountryId,
      city: c.birthCountryId === c.countryId ? c.city : undefined,
      sexuality: c.sexuality,
      year: new Date().getFullYear(),
    })
  }

  return (
    <div className="al-screen death-screen">
      <div className="death-drip" aria-hidden="true">
        {DRIPS.map((d, i) => (
          <span key={i} style={{ left: `${d.left}%`, height: d.h, animationDelay: `${d.d}s` }} />
        ))}
      </div>
      <div className="death-banner">You died</div>

      <section className="death-tomb" aria-label="Tombstone">
        <div className="death-herelies">Here lies</div>
        <div className="death-avatar" aria-hidden="true">
          {characterAvatar({ ...c, alive: true })}
        </div>
        <h1 className="death-name">{fullName(c)}</h1>
        <div className="death-years">
          {bornYear} – {g.year}
        </div>
        <div className="al-small">Age {c.age}{g.generation > 1 ? ` · Generation ${g.generation}` : ''}</div>
        <div className="death-cause">
          Cause of death: <b>{cause}</b>
        </div>
        <div className="death-rip">R.I.P.</div>
      </section>

      <RibbonAward ribbonId={g.ribbon} />

      <section className="al-card">
        <div className="death-obit-head">
          <h3>📰 Obituary</h3>
          {aiObituary && showAiBadges && g.obituary ? <span className="al-ai-badge">✨ AI-written</span> : null}
        </div>
        <p className="death-obit">{obituary}</p>
        <p className="death-mourners">🕯️ {view.mourners}</p>
      </section>

      <section className="al-card">
        <div className="death-facts">
          {view.facts.map((f) => (
            <div key={f.label} className={`death-fact ${f.wide ? 'wide' : ''}`}>
              <span className="death-fact-label">
                {f.emoji} {f.label}
              </span>
              <span className="death-fact-value">{f.value}</span>
            </div>
          ))}
        </div>
        <div className="death-bars">
          <StatBar label="Happiness" emoji="😊" value={c.stats.happiness} />
          <StatBar label="Smarts" emoji="🧠" value={c.stats.smarts} />
          <StatBar label="Looks" emoji="💅" value={c.stats.looks} />
          <StatBar label="Karma" emoji="☯️" value={c.hidden.karma} />
        </div>
      </section>

      {view.legacy.length > 0 ? (
        <section className="al-card">
          <h3 style={{ margin: '0 0 10px' }}>🌳 Family Legacy</h3>
          <ul className="death-legacy">
            {view.legacy.map((row) => (
              <li key={`${row.generation}-${row.name}`} className={row.current ? 'current' : ''}>
                <span className="gen">Gen {row.generation}</span>
                <span aria-hidden="true">{row.ribbonEmoji}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b>{row.name}</b>{' '}
                  <span className="al-muted al-small">
                    {row.years} · age {row.age}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="al-card">
        <button type="button" className="al-btn ghost block" onClick={() => setJournalOpen((v) => !v)} aria-expanded={journalOpen}>
          📖 {journalOpen ? 'Close the journal' : `Read ${c.firstName}'s journal`}
        </button>
        {journalOpen ? <Journal g={g} showAi={showAiBadges} /> : null}
      </section>

      {view.heirs.length > 0 ? (
        <>
          <p className="al-section-title">Continue the family</p>
          <div className="death-heirs">
            {view.heirs.map((p) => (
              <button key={p.id} type="button" className="al-bigbtn green" onClick={() => continueAs(p.id)}>
                <span className="al-bigbtn-emoji" aria-hidden="true">
                  {personAvatar(p)}
                </span>
                <span className="al-bigbtn-text">
                  <span>Continue as {p.firstName}</span>
                  <span className="al-bigbtn-sub">
                    {relationLabel(p)} · age {p.age}
                    {p.relationship >= 70 ? ' · adored you' : p.relationship < 30 ? ' · barely spoke to you' : ''}
                  </span>
                </span>
                <span className="al-bigbtn-chevron" aria-hidden="true">
                  ›
                </span>
              </button>
            ))}
          </div>
        </>
      ) : null}

      <p className="al-section-title">What’s next?</p>
      <div className="death-heirs">
        <button type="button" className="al-bigbtn" onClick={() => goTo('newLife')}>
          <span className="al-bigbtn-emoji" aria-hidden="true">
            👶
          </span>
          <span className="al-bigbtn-text">
            <span>New Life</span>
            <span className="al-bigbtn-sub">Random or custom</span>
          </span>
        </button>
        <button type="button" className="al-bigbtn purple" onClick={liveAgain}>
          <span className="al-bigbtn-emoji" aria-hidden="true">
            🔁
          </span>
          <span className="al-bigbtn-text">
            <span>Live again as {c.firstName}</span>
            <span className="al-bigbtn-sub">Same name and birthplace, brand-new fate</span>
          </span>
        </button>
        <div className="nl-grid">
          <button type="button" className="al-bigbtn light" onClick={() => goTo('graveyard')}>
            <span className="al-bigbtn-emoji" aria-hidden="true">
              🪦
            </span>
            <span className="al-bigbtn-text">Graveyard</span>
          </button>
          <button type="button" className="al-bigbtn light" onClick={() => goTo('home')}>
            <span className="al-bigbtn-emoji" aria-hidden="true">
              🏠
            </span>
            <span className="al-bigbtn-text">Home</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default DeathScreen
