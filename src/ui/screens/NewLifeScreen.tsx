// New life: a big "Random Life" button and a "Custom Life" form (name, gender, country, city,
// sexuality, and optionally the starting stats and up to three special talents). Names and
// rolled stats use Math.random (UI only; the engine itself is seeded).
import { useId, useMemo, useState } from 'react'
import { avatarEmoji } from '../../game/core'
import { START_STAT_KEYS, type NewLifeOptions, type StartStatKey } from '../../game/life'
import { loadGame } from '../../game/save'
import { isTalentId, MAX_START_TALENTS, normalizeTalents, SPECIAL_TALENTS, specialTalent, type TalentId } from '../../game/talents'
import type { Gender, Sexuality } from '../../game/types'
import { COUNTRIES, NAME_POOLS, getCountry } from '../../game/world'
import { statColor } from '../components/StatBar'
import { STAT_META } from '../components/StatPanel'
import { goTo, hasSavedGame, startNewLife, useApp } from '../store'
import '../styles/screens.css'
import { ConfirmDialog, ScreenHeader } from './SettingsScreen'

const NAME_MAX = 20

function randomItem<T>(list: readonly T[]): T | undefined {
  if (list.length === 0) return undefined
  return list[Math.floor(Math.random() * list.length)]
}

function poolFor(countryId: string) {
  return NAME_POOLS[getCountry(countryId).names] ?? NAME_POOLS.anglo
}

/** A random first name from the country's pool, different from `avoid` when possible. */
export function rollFirstName(countryId: string, gender: Gender, avoid = ''): string {
  const pool = poolFor(countryId)
  const list = (gender === 'male' ? pool.male : pool.female).filter((n) => n !== avoid)
  return randomItem(list) ?? (gender === 'male' ? 'Alex' : 'Sam')
}

export function rollLastName(countryId: string, avoid = ''): string {
  const list = poolFor(countryId).last.filter((n) => n !== avoid)
  return randomItem(list) ?? 'Smith'
}

/** Best guess at the player's own country from the browser language, like a phone would default to. */
export function guessCountryId(language: string | undefined): string {
  const fallback = COUNTRIES[0]?.id ?? 'us'
  if (!language) return fallback
  try {
    const region = new Intl.Locale(language).maximize().region?.toLowerCase()
    if (region === 'uk') return COUNTRIES.some((c) => c.id === 'gb') ? 'gb' : fallback
    if (region && COUNTRIES.some((c) => c.id === region)) return region
  } catch {
    // malformed language tag
  }
  return fallback
}

/** Clean up a typed name: trim, collapse spaces, cap length; optionally capitalize the first letter. */
export function cleanName(raw: string, capitalize = true): string {
  const t = raw.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX)
  if (!t || !capitalize) return t
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/** "the United States", "France". */
export function countryPhrase(name: string): string {
  return /^(United|Republic|Netherlands|Philippines|Czech|Dominican|Bahamas|Maldives|Gambia)\b/.test(name) ? `the ${name}` : name
}

const SORTED_COUNTRIES = [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name))

// ---------------------------------------------------------------------------
// Starting stats ("Customize stats")

/** A chosen value per stat; null = Random (rolled at birth, looks and smarts from the parents). */
export type StatPicks = Record<StartStatKey, number | null>

export const RANDOM_PICKS: StatPicks = { happiness: null, health: null, smarts: null, looks: null }

const PICK_META = START_STAT_KEYS.map((key) => {
  const meta = STAT_META.find((m) => m.key === key)
  return { key, label: meta?.label ?? key, emoji: meta?.emoji ?? '•' }
})

/** 0-100 whole number (anything weird becomes 50). */
export function clampPick(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 50
}

/** One stepper press: from Random it starts at 50. */
export function stepPick(value: number | null, delta: number): number {
  return clampPick((value ?? 50) + delta)
}

/**
 * A tap on a slider that is still on Random sets it to the tapped spot. Tapping the parked
 * handle (at 50) fires no change event, so without this the tap would do nothing at all.
 */
export function pickFromTap(value: number | null, sliderValue: string | number): number {
  return value ?? clampPick(Number(sliderValue))
}

/** Roll concrete values for every stat (the player can still tweak them). */
export function rollStatPicks(random: () => number = Math.random): StatPicks {
  const roll = () => clampPick(Math.floor(random() * 101))
  return { happiness: roll(), health: roll(), smarts: roll(), looks: roll() }
}

/** What createNewLife gets: only the stats the player chose, or nothing at all. */
export function statsOption(picks: StatPicks): NewLifeOptions['stats'] {
  const out: Partial<Record<StartStatKey, number>> = {}
  for (const key of START_STAT_KEYS) {
    const v = picks[key]
    if (v !== null) out[key] = clampPick(v)
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/** "All random" / "2 of 4 set" / "All 4 set" for the collapsed header. */
export function statsSummary(picks: StatPicks): string {
  const set = START_STAT_KEYS.filter((k) => picks[k] !== null).length
  if (set === 0) return 'All random'
  if (set === START_STAT_KEYS.length) return `All ${set} set`
  return `${set} of ${START_STAT_KEYS.length} set`
}

/** The Start Life button's small print (`talents` = how many special talents are picked). */
export function startSubtitle(picks: StatPicks, talents = 0): string {
  const set = START_STAT_KEYS.filter((k) => picks[k] !== null).length
  if (talents > 0) {
    const gifts = talents === 1 ? 'a special talent' : `${talents} special talents`
    return set === 0 ? `Born with ${gifts}; fate rolls the rest` : `Born with ${gifts} and your stats; fate rolls the rest`
  }
  if (set === 0) return 'Looks, smarts and family are up to fate'
  if (set === START_STAT_KEYS.length) return 'Stats locked in; family is up to fate'
  return 'Your picks are in; fate rolls the rest'
}

export interface StatCustomizerProps {
  picks: StatPicks
  onChange: (picks: StatPicks) => void
  open: boolean
  onToggle: () => void
}

/** Collapsible "Customize stats" section of the Custom Life form. */
export function StatCustomizer({ picks, onChange, open, onToggle }: StatCustomizerProps) {
  const panelId = useId()
  const anySet = START_STAT_KEYS.some((k) => picks[k] !== null)
  const set = (key: StartStatKey, value: number | null) => onChange({ ...picks, [key]: value === null ? null : clampPick(value) })

  return (
    <div className={open ? 'nl-stats is-open' : 'nl-stats'}>
      <button type="button" className="nl-stats-toggle" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
        <span className="nl-stats-icon" aria-hidden="true">
          📊
        </span>
        <span className="nl-stats-title">Customize stats</span>
        <span className={anySet ? 'nl-stats-summary is-set' : 'nl-stats-summary'}>{statsSummary(picks)}</span>
        <span className="nl-stats-chevron" aria-hidden="true">
          ▾
        </span>
      </button>
      {open ? (
        <div className="nl-stats-panel" id={panelId}>
          <p className="al-muted al-small nl-stats-hint">
            Pick a starting value, or leave it on Random and let fate (and your parents' genes) decide.
          </p>
          {PICK_META.map(({ key, label, emoji }) => {
            const v = picks[key]
            const random = v === null
            const shown = v ?? 50
            const labelId = `${panelId}-${key}`
            return (
              <div className="nl-stat" role="group" aria-labelledby={labelId} key={key}>
                <div className="nl-stat-top">
                  <span className="nl-stat-label" id={labelId}>
                    <span aria-hidden="true">{emoji}</span> {label}
                  </span>
                  {random ? (
                    <output className="nl-stat-value is-random" aria-live="polite">
                      🎲 Random
                    </output>
                  ) : (
                    <span className="nl-stat-set">
                      <output className="nl-stat-value" aria-live="polite" style={{ color: statColor(shown) }}>
                        {shown}
                      </output>
                      <button
                        type="button"
                        className="nl-stat-clear"
                        aria-label={`Make ${label} random again`}
                        title="Back to Random"
                        onClick={() => set(key, null)}
                      >
                        ✕
                      </button>
                    </span>
                  )}
                </div>
                <div className="nl-stat-controls">
                  <button
                    type="button"
                    className="nl-step"
                    aria-label={`Lower ${label}`}
                    disabled={!random && shown <= 0}
                    onClick={() => set(key, stepPick(v, -1))}
                  >
                    −
                  </button>
                  <input
                    type="range"
                    className={random ? 'nl-stat-range is-random' : 'nl-stat-range'}
                    min={0}
                    max={100}
                    step={1}
                    value={shown}
                    aria-label={label}
                    aria-valuetext={random ? 'Random' : String(shown)}
                    style={{ ['--fill' as string]: `${shown}%`, ['--fill-color' as string]: random ? 'var(--muted)' : statColor(shown) }}
                    onChange={(e) => set(key, Number(e.target.value))}
                    onPointerUp={(e) => {
                      // pointerup, not click: phones send no click to a range input after a tap.
                      if (random) set(key, pickFromTap(v, e.currentTarget.value))
                    }}
                  />
                  <button
                    type="button"
                    className="nl-step"
                    aria-label={`Raise ${label}`}
                    disabled={!random && shown >= 100}
                    onClick={() => set(key, stepPick(v, 1))}
                  >
                    +
                  </button>
                </div>
              </div>
            )
          })}
          <div className="nl-stats-actions">
            <button type="button" className="al-btn small" onClick={() => onChange(rollStatPicks())}>
              🎲 Randomize
            </button>
            <button type="button" className="al-btn small ghost" disabled={!anySet} onClick={() => onChange({ ...RANDOM_PICKS })}>
              ↺ All random
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Special talents (picked before birth)

/** Tap a talent: unpick it, or pick it when there's room (never more than `max`). */
export function toggleTalentPick(picks: readonly string[], id: string, max: number = MAX_START_TALENTS): TalentId[] {
  const chosen = normalizeTalents(picks, max)
  if (!isTalentId(id)) return chosen
  if (chosen.includes(id)) return chosen.filter((t) => t !== id)
  return chosen.length >= max ? chosen : [...chosen, id]
}

/** What createNewLife gets: the picks, or nothing at all. */
export function talentsOption(picks: readonly string[]): string[] | undefined {
  const chosen = normalizeTalents(picks)
  return chosen.length > 0 ? chosen : undefined
}

/** "2/3 picked" (the counter in the open panel). */
export function talentCount(picks: readonly string[]): string {
  return `${normalizeTalents(picks).length}/${MAX_START_TALENTS} picked`
}

/** The collapsed header: "None picked" or the picks' emoji plus the counter. */
export function talentSummary(picks: readonly string[]): string {
  const chosen = normalizeTalents(picks)
  if (chosen.length === 0) return 'None picked'
  return `${chosen.map((id) => specialTalent(id)?.emoji ?? '').join('')} ${chosen.length}/${MAX_START_TALENTS}`
}

export interface TalentPickerProps {
  picks: readonly string[]
  onChange: (picks: TalentId[]) => void
  open: boolean
  onToggle: () => void
}

/** Collapsible "Special talents" section of the Custom Life form: pick up to MAX_START_TALENTS. */
export function TalentPicker({ picks, onChange, open, onToggle }: TalentPickerProps) {
  const panelId = useId()
  const chosen = normalizeTalents(picks)
  const full = chosen.length >= MAX_START_TALENTS

  return (
    <div className={open ? 'nl-stats nl-talents is-open' : 'nl-stats nl-talents'}>
      <button type="button" className="nl-stats-toggle" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
        <span className="nl-stats-icon" aria-hidden="true">
          🌟
        </span>
        <span className="nl-stats-title">Special talents</span>
        <span className={chosen.length > 0 ? 'nl-stats-summary nl-talents-summary is-set' : 'nl-stats-summary nl-talents-summary'}>{talentSummary(chosen)}</span>
        <span className="nl-stats-chevron" aria-hidden="true">
          ▾
        </span>
      </button>
      {open ? (
        <div className="nl-stats-panel nl-talents-panel" id={panelId}>
          <p className="al-muted al-small nl-stats-hint">
            Born gifted. Pick up to {MAX_START_TALENTS}: each perk works from day one, and you'll still get that "wait, I'm good at
            this!" moment as a kid.
          </p>
          <div className="nl-talents-bar">
            <output className={full ? 'nl-talents-count is-full' : 'nl-talents-count'} aria-live="polite">
              {talentCount(chosen)}
              {full ? <span className="nl-talents-max"> · unpick one to swap</span> : null}
            </output>
            <button type="button" className="al-btn small ghost" disabled={chosen.length === 0} onClick={() => onChange([])}>
              ✕ Clear
            </button>
          </div>
          <div className="nl-talent-list" role="group" aria-label={`Special talents, up to ${MAX_START_TALENTS}`}>
            {SPECIAL_TALENTS.map((t) => {
              const on = chosen.includes(t.id)
              const locked = full && !on
              return (
                <button
                  key={t.id}
                  type="button"
                  className={on ? 'nl-talent is-on' : locked ? 'nl-talent is-locked' : 'nl-talent'}
                  aria-pressed={on}
                  aria-disabled={locked || undefined}
                  title={locked ? `You can pick up to ${MAX_START_TALENTS}. Unpick one first.` : undefined}
                  onClick={() => {
                    if (!locked) onChange(toggleTalentPick(chosen, t.id))
                  }}
                >
                  <span className="nl-talent-emoji" aria-hidden="true">
                    {t.emoji}
                  </span>
                  <span className="nl-talent-text">
                    <span className="nl-talent-label">{t.label}</span>
                    <span className="nl-talent-perk">{t.perk}</span>
                  </span>
                  <span className="nl-talent-check" aria-hidden="true">
                    {on ? '✓' : ''}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** Everything the Custom Life form holds. */
export interface CustomLifeForm {
  firstName: string
  lastName: string
  gender: Gender
  countryId: string
  /** '' = random. */
  city: string
  sexuality: Sexuality | ''
  picks: StatPicks
  talents: readonly string[]
  year: number
}

/** What Start Life passes to createNewLife: blank names are rolled, unset choices left to fate. */
export function customLifeOptions(f: CustomLifeForm): NewLifeOptions {
  const first = cleanName(f.firstName) || rollFirstName(f.countryId, f.gender)
  const last = cleanName(f.lastName, false) || rollLastName(f.countryId)
  const opts: NewLifeOptions = { firstName: first, lastName: last, gender: f.gender, countryId: f.countryId, year: f.year }
  if (f.city) opts.city = f.city
  if (f.sexuality) opts.sexuality = f.sexuality
  const stats = statsOption(f.picks)
  if (stats) opts.stats = stats
  const talents = talentsOption(f.talents)
  if (talents) opts.talents = talents
  return opts
}

export function NewLifeScreen() {
  const game = useApp((s) => s.game)
  const [countryId, setCountryId] = useState(() => guessCountryId(typeof navigator !== 'undefined' ? navigator.language : undefined))
  const [gender, setGender] = useState<Gender>(() => (Math.random() < 0.5 ? 'male' : 'female'))
  const [firstName, setFirstName] = useState(() => rollFirstName(countryId, gender))
  const [lastName, setLastName] = useState(() => rollLastName(countryId))
  // Names the player hasn't typed themselves get re-rolled when gender/country change.
  const [firstAuto, setFirstAuto] = useState(true)
  const [lastAuto, setLastAuto] = useState(true)
  const [city, setCity] = useState('')
  const [sexuality, setSexuality] = useState<Sexuality | ''>('')
  const [pending, setPending] = useState<NewLifeOptions | null>(null)
  const [picks, setPicks] = useState<StatPicks>(RANDOM_PICKS)
  const [statsOpen, setStatsOpen] = useState(false)
  const [talents, setTalents] = useState<TalentId[]>([])
  const [talentsOpen, setTalentsOpen] = useState(false)
  const chosenTalents = talentsOption(talents)

  const country = getCountry(countryId)
  // A life still in progress (in memory or only in the save) gets a warning before it's replaced.
  const livingLife = useMemo(() => {
    const g = game ?? (hasSavedGame() ? loadGame() : null)
    return g && g.character.alive ? `${g.character.firstName} ${g.character.lastName}` : null
  }, [game])

  const preview = useMemo(() => {
    const name = `${cleanName(firstName) || '???'} ${cleanName(lastName, false) || '???'}`
    const place = city ? `in ${city}, ${country.name}` : `somewhere in ${countryPhrase(country.name)}`
    return { name, place }
  }, [firstName, lastName, city, country.name])

  const changeGender = (next: Gender) => {
    if (next === gender) return
    setGender(next)
    if (firstAuto) setFirstName(rollFirstName(countryId, next))
  }

  const changeCountry = (id: string) => {
    setCountryId(id)
    setCity('')
    if (firstAuto) setFirstName(rollFirstName(id, gender))
    if (lastAuto) setLastName(rollLastName(id))
  }

  const begin = (opts: NewLifeOptions) => {
    if (livingLife) setPending(opts)
    else startNewLife(opts)
  }

  const randomLife = () => begin({ year: new Date().getFullYear() })

  const customLife = () =>
    begin(customLifeOptions({ firstName, lastName, gender, countryId, city, sexuality, picks, talents, year: new Date().getFullYear() }))

  return (
    <div className="al-screen new-life">
      <ScreenHeader title="New Life" emoji="👶" onBack={() => goTo('home')} />

      <button type="button" className="al-bigbtn green nl-random" onClick={randomLife}>
        <span className="al-bigbtn-emoji" aria-hidden="true">
          🎲
        </span>
        <span className="al-bigbtn-text">
          <span>Random Life</span>
          <span className="al-bigbtn-sub">Random name, family, country and looks</span>
        </span>
      </button>

      <p className="al-section-title">Custom Life</p>
      <form
        className="al-card nl-form"
        onSubmit={(e) => {
          e.preventDefault()
          customLife()
        }}
      >
        <div className="nl-preview" aria-live="polite">
          <span className={`nl-preview-avatar ${gender}`} aria-hidden="true">
            {avatarEmoji(gender, 0)}
          </span>
          <div>
            <div className="nl-preview-name">{preview.name}</div>
            <div className="al-muted al-small">
              {country.flag} Born {preview.place}
            </div>
            {chosenTalents ? (
              <div className="nl-preview-talents">
                {chosenTalents.map((id) => `${specialTalent(id)?.emoji ?? ''} ${specialTalent(id)?.label ?? id}`).join(' · ')}
              </div>
            ) : null}
          </div>
        </div>

        <div className="nl-grid">
          <label className="al-field">
            <span className="al-label">First name</span>
            <div className="al-input-row">
              <input
                className="al-input"
                value={firstName}
                maxLength={NAME_MAX}
                autoComplete="off"
                onChange={(e) => {
                  setFirstName(e.target.value)
                  setFirstAuto(false)
                }}
              />
              <button
                type="button"
                className="al-dice"
                aria-label="Random first name"
                title="Random first name"
                onClick={() => {
                  setFirstName(rollFirstName(countryId, gender, firstName))
                  setFirstAuto(true)
                }}
              >
                🎲
              </button>
            </div>
          </label>
          <label className="al-field">
            <span className="al-label">Last name</span>
            <div className="al-input-row">
              <input
                className="al-input"
                value={lastName}
                maxLength={NAME_MAX}
                autoComplete="off"
                onChange={(e) => {
                  setLastName(e.target.value)
                  setLastAuto(false)
                }}
              />
              <button
                type="button"
                className="al-dice"
                aria-label="Random last name"
                title="Random last name"
                onClick={() => {
                  setLastName(rollLastName(countryId, lastName))
                  setLastAuto(true)
                }}
              >
                🎲
              </button>
            </div>
          </label>
        </div>

        <div className="al-field">
          <span className="al-label">Gender</span>
          <div className={`al-seg ${gender === 'female' ? 'al-seg-female' : ''}`} role="radiogroup" aria-label="Gender">
            <button type="button" role="radio" aria-checked={gender === 'male'} aria-pressed={gender === 'male'} onClick={() => changeGender('male')}>
              ♂ Male
            </button>
            <button type="button" role="radio" aria-checked={gender === 'female'} aria-pressed={gender === 'female'} onClick={() => changeGender('female')}>
              ♀ Female
            </button>
          </div>
        </div>

        <div className="nl-grid">
          <label className="al-field">
            <span className="al-label">Country</span>
            <select className="al-select" value={countryId} onChange={(e) => changeCountry(e.target.value)}>
              {SORTED_COUNTRIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.flag} {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="al-field">
            <span className="al-label">City</span>
            <select className="al-select" value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">🎲 Random</option>
              {[...country.cities]
                .sort((a, b) => a.localeCompare(b))
                .map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
            </select>
          </label>
        </div>

        <label className="al-field">
          <span className="al-label">Sexuality (optional)</span>
          <select className="al-select" value={sexuality} onChange={(e) => setSexuality(e.target.value as Sexuality | '')}>
            <option value="">🎲 Let life decide</option>
            <option value="straight">Straight</option>
            <option value="gay">{gender === 'female' ? 'Lesbian' : 'Gay'}</option>
            <option value="bisexual">Bisexual</option>
          </select>
        </label>

        <StatCustomizer picks={picks} onChange={setPicks} open={statsOpen} onToggle={() => setStatsOpen((o) => !o)} />

        <TalentPicker picks={talents} onChange={setTalents} open={talentsOpen} onToggle={() => setTalentsOpen((o) => !o)} />

        <button type="submit" className="al-bigbtn">
          <span className="al-bigbtn-emoji" aria-hidden="true">
            🍼
          </span>
          <span className="al-bigbtn-text">
            <span>Start Life</span>
            <span className="al-bigbtn-sub">{startSubtitle(picks, chosenTalents?.length ?? 0)}</span>
          </span>
        </button>
      </form>

      {pending && livingLife ? (
        <ConfirmDialog
          emoji="⚠️"
          title="Abandon your current life?"
          text={`${livingLife} is still alive. Starting a new life ends theirs on the spot: no grave, no ribbon, no heirs.`}
          confirmLabel="Start a new life"
          danger
          onConfirm={() => {
            const opts = pending
            setPending(null)
            startNewLife(opts)
          }}
          onCancel={() => setPending(null)}
        />
      ) : null}
    </div>
  )
}

export default NewLifeScreen
