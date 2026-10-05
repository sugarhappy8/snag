// Everything about your character, like the original's profile page: identity, stats and
// hidden attributes, school, career, money, health, legal trouble, family tree and more.
import type { ReactNode } from 'react'
import {
  characterAvatar,
  formatMoney,
  fullName,
  MONTHS,
  netWorth,
  roleLabel,
  shortMoney,
} from '../../game/core'
import { highestEducationLabel } from '../../game/education'
import { getRibbon } from '../../game/ribbons'
import { getCountry } from '../../game/world'
import type {
  Enrollment,
  GameState,
  GradProgram,
  HiddenKey,
  HomeStatus,
  JobCategory,
  LoanKind,
  SchoolLevel,
} from '../../game/types'
import { useApp } from '../store'
import { Sheet } from './Sheet'
import { StatBar } from './StatBar'
import { LOW_STAT, STAT_META } from './StatPanel'

export interface ProfileSheetProps {
  onClose: () => void
}

const ZODIAC_EMOJI: Record<string, string> = {
  Aries: '♈',
  Taurus: '♉',
  Gemini: '♊',
  Cancer: '♋',
  Leo: '♌',
  Virgo: '♍',
  Libra: '♎',
  Scorpio: '♏',
  Sagittarius: '♐',
  Capricorn: '♑',
  Aquarius: '♒',
  Pisces: '♓',
}

const HIDDEN_META: { key: HiddenKey; label: string; emoji: string }[] = [
  { key: 'karma', label: 'Karma', emoji: '😇' },
  { key: 'fame', label: 'Fame', emoji: '⭐' },
  { key: 'notoriety', label: 'Notoriety', emoji: '🚨' },
  { key: 'craziness', label: 'Craziness', emoji: '🤪' },
  { key: 'willpower', label: 'Willpower', emoji: '💪' },
  { key: 'discipline', label: 'Discipline', emoji: '🎯' },
  { key: 'athleticism', label: 'Athleticism', emoji: '🏃' },
  { key: 'fertility', label: 'Fertility', emoji: '🍼' },
  { key: 'religiousness', label: 'Religiousness', emoji: '🙏' },
]

const LEVEL_LABEL: Record<SchoolLevel, string> = {
  preschool: 'Preschool',
  elementary: 'Elementary School',
  middle: 'Middle School',
  high: 'High School',
  community: 'Community College',
  university: 'University',
  graduate: 'Graduate School',
}

const PROGRAM_LABEL: Record<GradProgram, string> = {
  law: 'Law School',
  medical: 'Medical School',
  business: 'Business School',
  dental: 'Dental School',
  nursing: 'Nursing School',
  pharmacy: 'Pharmacy School',
  veterinary: 'Veterinary School',
  phd: 'PhD Program',
}

const CATEGORY_LABEL: Record<JobCategory, string> = {
  fulltime: 'Full-time',
  parttime: 'Part-time',
  freelance: 'Freelance',
  special: 'Special career',
  military: 'Military',
}

const HOME_LABEL: Record<HomeStatus, string> = {
  parents: "Living with parents",
  owned: 'Homeowner',
  renting: 'Renting',
  homeless: 'Homeless',
  dorm: 'College dorm',
  prison: 'Prison cell',
  military: 'Military barracks',
  partner: "Living with partner",
}

const LOAN_LABEL: Record<LoanKind, string> = {
  student: 'Student loan',
  personal: 'Personal loan',
  car: 'Car loan',
  business: 'Business loan',
}

/** Lifetime counters worth showing, in display order. */
const COUNTER_META: [string, string, string][] = [
  ['partners', 'Partners', '💘'],
  ['marriages', 'Marriages', '💍'],
  ['divorces', 'Divorces', '💔'],
  ['children', 'Children', '👶'],
  ['adoptions', 'Adoptions', '🧸'],
  ['pets', 'Pets', '🐾'],
  ['jobs', 'Jobs held', '💼'],
  ['promotions', 'Promotions', '📈'],
  ['fired', 'Times fired', '🔥'],
  ['degrees', 'Degrees', '🎓'],
  ['studied', 'Study sessions', '📚'],
  ['gym', 'Gym visits', '🏋️'],
  ['library', 'Library trips', '📖'],
  ['meditate', 'Meditations', '🧘'],
  ['walks', 'Walks', '🚶'],
  ['martialArts', 'Martial arts', '🥋'],
  ['vacations', 'Vacations', '🏖️'],
  ['emigrations', 'Emigrations', '✈️'],
  ['nightlife', 'Nights out', '🪩'],
  ['doctorVisits', 'Doctor visits', '🩺'],
  ['surgeries', 'Surgeries', '💉'],
  ['diseases', 'Illnesses', '🦠'],
  ['crimes', 'Crimes', '🦹'],
  ['arrests', 'Arrests', '🚓'],
  ['convictions', 'Convictions', '⚖️'],
  ['prisonYears', 'Years in prison', '⛓️'],
  ['escapes', 'Prison escapes', '🏃'],
  ['riots', 'Riots', '🔥'],
  ['murders', 'Murders', '🔪'],
  ['fights', 'Fights', '🥊'],
  ['pranks', 'Pranks', '🃏'],
  ['insults', 'Insults', '🤬'],
  ['compliments', 'Compliments', '🥰'],
  ['casinoWins', 'Casino wins', '🎰'],
  ['casinoLosses', 'Casino losses', '💸'],
  ['moneyGambled', 'Money gambled', '🎲'],
  ['lotteryTickets', 'Lottery tickets', '🎟️'],
  ['lotteryWins', 'Lottery wins', '🤑'],
  ['housesBought', 'Houses bought', '🏡'],
  ['carsBought', 'Cars bought', '🚗'],
  ['purchases', 'Purchases', '🛍️'],
  ['donated', 'Donated', '🤲'],
  ['lawsuitsWon', 'Lawsuits won', '⚖️'],
  ['fameActions', 'Fame moves', '📸'],
  ['albums', 'Albums', '💿'],
  ['movies', 'Movies', '🎬'],
  ['aiEvents', 'AI events', '✨'],
  ['customActions', '"Do Anything"s', '🪄'],
]

const MONEY_COUNTERS = new Set(['moneyGambled', 'donated'])

function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

function years(n: number): string {
  return n === 1 ? '1 year' : `${n} years`
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="profile-section">
      <h3>{title}</h3>
      <div className="card">{children}</div>
    </section>
  )
}

function KV({ rows }: { rows: [string, ReactNode, ('good' | 'bad')?][] }) {
  return (
    <div className="kv">
      {rows.map(([k, v, tone]) => (
        <div className="kv-row" key={k}>
          <span className="kv-key">{k}</span>
          <span className={tone ? `kv-val is-${tone}` : 'kv-val'}>{v}</span>
        </div>
      ))}
    </div>
  )
}

function schoolName(e: Enrollment): string {
  if (e.level === 'graduate' && e.program) return PROGRAM_LABEL[e.program]
  return LEVEL_LABEL[e.level]
}

function sexualityKnown(g: GameState): boolean {
  const f = g.flags
  return Boolean(f.sexualityRevealed || f.sexualityKnown || f.cameOut) || g.character.age >= 13
}

function safeEducationLabel(g: GameState): string | null {
  try {
    return highestEducationLabel(g)
  } catch {
    return null
  }
}

function ribbonLabel(id: string | null): string | null {
  if (!id) return null
  try {
    const r = getRibbon(id)
    return r ? `${r.emoji} ${r.name}` : null
  } catch {
    return null
  }
}

export function ProfileSheet({ onClose }: ProfileSheetProps) {
  const g = useApp((s) => s.game)
  if (!g) return null
  const c = g.character
  const country = getCountry(c.countryId)
  const birthCountry = getCountry(c.birthCountryId)
  const bornYear = g.year - c.age
  const zodiac = `${ZODIAC_EMOJI[c.zodiac] ?? ''} ${c.zodiac}`.trim()
  const worth = netWorth(g)

  // --- identity
  const about: [string, ReactNode][] = [
    ['Gender', c.gender === 'male' ? 'Male' : 'Female'],
    ['Age', c.alive ? years(c.age) : `Died at ${c.age}`],
    ['Birthday', `${MONTHS[c.birthday.month - 1] ?? ''} ${c.birthday.day}, ${bornYear}`],
    ['Zodiac sign', zodiac],
    ['Birthplace', `${birthCountry.flag} ${c.birthCountryId === c.countryId ? `${c.city}, ` : ''}${birthCountry.name}`],
    ['Lives in', `${country.flag} ${c.city}, ${country.name}`],
    ['Nationality', country.demonym],
    ['Sexuality', sexualityKnown(g) ? cap(c.sexuality) : 'Still figuring it out'],
  ]
  if (c.religion) about.push(['Religion', c.religion])
  if (c.talent) about.push(['Special talent', `🌟 ${c.talent}`])
  about.push(['Generation', `#${g.generation}`])
  if (!c.alive && c.causeOfDeath) about.push(['Cause of death', c.causeOfDeath])

  // --- education
  const edu = c.education
  const cur = edu.current
  const eduRows: [string, ReactNode][] = []
  const highest = safeEducationLabel(g)
  if (highest) eduRows.push(['Highest level', highest])
  if (cur) {
    eduRows.push(['Currently', `${schoolName(cur)} — year ${cur.year} of ${cur.totalYears}`])
    eduRows.push(['School', cur.school])
    if (cur.major) eduRows.push(['Major', cur.major])
  }
  if (edu.droppedOut.length > 0) eduRows.push(['Dropped out of', edu.droppedOut.map((l) => LEVEL_LABEL[l]).join(', ')])
  if (edu.expelled > 0) eduRows.push(['Expelled', edu.expelled === 1 ? 'Once' : `${edu.expelled} times`])

  // --- career
  const job = c.job
  const pt = c.partTimeJob
  const careerRows: [string, ReactNode, ('good' | 'bad')?][] = []
  if (job) {
    careerRows.push(['Job', `${job.title}`])
    careerRows.push(['Employer', job.company])
    careerRows.push(['Type', CATEGORY_LABEL[job.category]])
    careerRows.push(['Salary', `${formatMoney(job.salary)}/yr`, 'good'])
    careerRows.push(['Years in role', years(job.yearsInRole)])
  }
  if (pt) {
    careerRows.push(['Part-time job', `${pt.title} at ${pt.company}`])
    careerRows.push(['Part-time pay', `${formatMoney(pt.salary)}/yr`, 'good'])
  }
  if (c.retired) {
    careerRows.push(['Status', 'Retired'])
    if (c.pension > 0) careerRows.push(['Pension', `${formatMoney(c.pension)}/yr`, 'good'])
  }
  if (careerRows.length === 0) careerRows.push(['Status', roleLabel(g)])

  // --- money
  const assetsValue = g.assets.reduce((sum, a) => sum + a.value, 0)
  const debt = c.loans.reduce((sum, l) => sum + l.balance, 0) + g.assets.reduce((sum, a) => sum + (a.mortgage?.balance ?? 0), 0)
  const res = c.residence
  const home = res.status === 'owned' ? g.assets.find((a) => a.id === res.assetId) : undefined
  const moneyRows: [string, ReactNode, ('good' | 'bad')?][] = [
    ['Bank balance', formatMoney(c.money), c.money < 0 ? 'bad' : undefined],
    ['Net worth', formatMoney(worth), worth < 0 ? 'bad' : undefined],
    ['Assets', g.assets.length > 0 ? `${g.assets.length} worth ${shortMoney(assetsValue)}` : 'None'],
    ['Debt', debt > 0 ? formatMoney(debt) : 'None', debt > 0 ? 'bad' : undefined],
    [
      'Residence',
      res.description ||
        (home ? `${home.emoji} ${home.name}` : res.status === 'renting' && res.rent ? `Renting (${formatMoney(res.rent)}/yr)` : HOME_LABEL[res.status]),
    ],
  ]

  // --- health
  const conditions = c.conditions.filter((x) => x.diagnosed)

  // --- legal
  const record = c.criminalRecord
  const prison = c.prison

  // --- counters
  const counters = COUNTER_META.filter(([key]) => (g.counters[key] ?? 0) > 0)

  return (
    <Sheet title="Profile" emoji="🪪" onClose={onClose}>
      <div className="card">
        <div className="profile-hero">
          <div className="person-avatar" aria-hidden>
            {characterAvatar(c)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="profile-name">{fullName(c)}</div>
            <div className="muted" style={{ fontWeight: 600 }}>
              {country.flag} {roleLabel(g)}
            </div>
            <div className="muted" style={{ fontSize: 13 }}>
              {c.alive ? `${years(c.age)} old · ${g.year}` : `${bornYear} – ${g.year}`}
            </div>
          </div>
        </div>
      </div>

      <Section title="About">
        <KV rows={about} />
      </Section>

      <Section title="Stats">
        <div className="person-bars">
          {STAT_META.map(({ key, label, emoji }) => (
            <StatBar key={key} label={label} emoji={c.stats[key] < LOW_STAT ? '⚠️' : emoji} value={c.stats[key]} />
          ))}
        </div>
      </Section>

      <Section title="Hidden attributes">
        <div className="person-bars">
          {HIDDEN_META.map(({ key, label, emoji }) => (
            <StatBar small key={key} label={label} emoji={emoji} value={c.hidden[key]} />
          ))}
        </div>
      </Section>

      <Section title="Education">
        {eduRows.length > 0 ? <KV rows={eduRows} /> : <p className="muted">No schooling yet. Enjoy it while it lasts.</p>}
        {cur ? (
          <div style={{ marginTop: 8 }}>
            <StatBar small label="Grades" emoji="📝" value={cur.grades} />
          </div>
        ) : null}
        {edu.degrees.length > 0 ? (
          <ul className="list-plain" style={{ marginTop: 6 }}>
            {edu.degrees.map((d, i) => (
              <li key={i}>
                🎓 <strong>{d.name}</strong>
                {d.honors ? ' (honors)' : ''}
                <span className="li-sub">
                  {d.school} · age {d.age}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      <Section title="Career">
        <KV rows={careerRows} />
        {job ? (
          <div style={{ marginTop: 8 }}>
            <StatBar small label="Performance" emoji="📊" value={job.performance} />
          </div>
        ) : null}
        {c.careerHistory.length > 0 ? (
          <>
            <div className="menu-heading" style={{ margin: '14px 0 4px' }}>
              Career history
            </div>
            <ul className="list-plain">
              {[...c.careerHistory].reverse().map((r, i) => (
                <li key={i}>
                  <strong>{r.title}</strong> · {r.company}
                  <span className="li-sub">
                    Ages {r.startAge}–{r.endAge} · {formatMoney(r.salary)}/yr · {r.reason}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </Section>

      <Section title="Money">
        <KV rows={moneyRows} />
        {g.assets.length > 0 ? (
          <ul className="list-plain" style={{ marginTop: 6 }}>
            {g.assets.map((a) => (
              <li key={a.id}>
                {a.emoji} <strong>{a.name}</strong>
                <span className="li-sub">
                  Worth {formatMoney(a.value)}
                  {a.mortgage ? ` · mortgage ${formatMoney(a.mortgage.balance)}` : ''}
                  {a.rentedOutFor ? ` · rented out for ${formatMoney(a.rentedOutFor)}/yr` : ''}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {c.loans.length > 0 ? (
          <ul className="list-plain" style={{ marginTop: 6 }}>
            {c.loans.map((l) => (
              <li key={l.id}>
                🏦 <strong>{LOAN_LABEL[l.kind]}</strong> · {l.lender}
                <span className="li-sub">
                  {formatMoney(l.balance)} left · {formatMoney(l.yearlyPayment)}/yr · {(l.rate * 100).toFixed(1)}% APR
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      <Section title="Health">
        {conditions.length === 0 ? (
          <p className="muted">No known conditions. Knock on wood. 🪵</p>
        ) : (
          <ul className="list-plain">
            {conditions.map((x) => (
              <li key={x.id}>
                {x.kind === 'injury' ? '🩹' : x.kind === 'addiction' ? '🍾' : x.kind === 'mental' ? '🧠' : '🦠'} <strong>{x.name}</strong>
                <span className="li-sub">
                  Since age {x.age} · {x.severity >= 70 ? 'severe' : x.severity >= 40 ? 'moderate' : 'mild'}
                  {x.curable ? '' : ' · incurable'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Licenses">
        {c.licenses.length === 0 ? (
          <p className="muted">No licenses yet.</p>
        ) : (
          <div className="person-chips" style={{ justifyContent: 'flex-start', marginTop: 0 }}>
            {c.licenses.map((l) => (
              <span className="pill" key={l}>
                🪪 {cap(l)}
              </span>
            ))}
          </div>
        )}
      </Section>

      <Section title="Criminal record">
        {prison ? (
          <KV
            rows={[
              ['Incarcerated at', prison.name],
              ['Security', cap(prison.security)],
              ['Crime', prison.crime],
              [
                'Sentence',
                prison.deathRow ? 'Death row' : prison.life ? 'Life' : `${years(prison.yearsServed)} served of ${years(prison.sentenceYears)}`,
                'bad',
              ],
            ]}
          />
        ) : null}
        {c.wantedLevel > 0 ? <KV rows={[['Wanted level', '⭐'.repeat(Math.min(5, c.wantedLevel)), 'bad']]} /> : null}
        {record.length === 0 ? (
          <p className="muted">Squeaky clean. 😇</p>
        ) : (
          <ul className="list-plain" style={{ marginTop: prison ? 6 : 0 }}>
            {[...record].reverse().map((r, i) => (
              <li key={i}>
                🦹 <strong>{r.crime}</strong>
                <span className="li-sub">
                  Age {r.age} ·{' '}
                  {r.convicted
                    ? `Convicted${r.sentenceYears ? ` (${years(r.sentenceYears)})` : ''}`
                    : r.caught
                      ? 'Caught, not convicted'
                      : 'Got away with it'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {c.social ? (
        <Section title="Social media">
          <KV
            rows={[
              ['Platform', c.social.platform],
              ['Handle', `@${c.social.handle}${c.social.verified ? ' ✔️' : ''}`],
              ['Followers', c.social.followers.toLocaleString('en-US')],
              ['Monetized', c.social.monetized ? 'Yes 💰' : 'No'],
            ]}
          />
        </Section>
      ) : null}

      <Section title="Family tree">
        {g.ancestors.length === 0 ? (
          <p className="muted">You're the first of your line. Make it count.</p>
        ) : (
          <ul className="list-plain">
            {g.ancestors.map((a, i) => {
              const ribbon = ribbonLabel(a.ribbon)
              return (
                <li key={i}>
                  🪦 <strong>{a.name}</strong> · Gen {a.generation}
                  <span className="li-sub">
                    {a.bornYear}–{a.diedYear} (age {a.age}) · {a.occupation} · {a.causeOfDeath}
                  </span>
                  <span className="li-sub">
                    Net worth {shortMoney(a.netWorth)}
                    {ribbon ? ` · ${ribbon}` : ''}
                  </span>
                </li>
              )
            })}
            <li>
              {characterAvatar(c)} <strong>{fullName(c)}</strong> · Gen {g.generation}
              <span className="li-sub">Born {bornYear}</span>
            </li>
          </ul>
        )}
      </Section>

      <Section title="Life stats">
        {counters.length === 0 ? (
          <p className="muted">Nothing to brag about yet.</p>
        ) : (
          <div className="counter-grid">
            {counters.map(([key, label, emoji]) => (
              <div className="counter" key={key}>
                <span className="counter-emoji" aria-hidden>
                  {emoji}
                </span>
                <span className="counter-value">
                  {MONEY_COUNTERS.has(key) ? shortMoney(g.counters[key] ?? 0) : (g.counters[key] ?? 0).toLocaleString('en-US')}
                </span>
                <span className="counter-label">{label}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {c.memories.length > 0 ? (
        <Section title="Memorable moments">
          <ul className="list-plain">
            {c.memories.slice(-10).map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </Section>
      ) : null}
    </Sheet>
  )
}
