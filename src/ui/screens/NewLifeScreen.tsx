// New life: a big "Random Life" button and a "Custom Life" form (name, gender, country, city,
// sexuality). Names are rolled from the country's name pool with Math.random (UI only; the
// engine itself is seeded).
import { useMemo, useState } from 'react'
import { avatarEmoji } from '../../game/core'
import type { NewLifeOptions } from '../../game/life'
import type { Gender, Sexuality } from '../../game/types'
import { COUNTRIES, NAME_POOLS, getCountry } from '../../game/world'
import { goTo, startNewLife, useApp } from '../store'
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

/** Clean up a typed name: trim, collapse spaces, cap length, capitalize the first letter. */
export function cleanName(raw: string): string {
  const t = raw.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX)
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : ''
}

const SORTED_COUNTRIES = [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name))

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

  const country = getCountry(countryId)
  const livingLife = game && game.character.alive ? `${game.character.firstName} ${game.character.lastName}` : null

  const preview = useMemo(() => {
    const name = `${cleanName(firstName) || '???'} ${cleanName(lastName) || '???'}`
    const place = city ? `${city}, ${country.name}` : `somewhere in ${country.name}`
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

  const customLife = () => {
    const first = cleanName(firstName) || rollFirstName(countryId, gender)
    const last = cleanName(lastName) || rollLastName(countryId)
    const opts: NewLifeOptions = { firstName: first, lastName: last, gender, countryId, year: new Date().getFullYear() }
    if (city) opts.city = city
    if (sexuality) opts.sexuality = sexuality
    begin(opts)
  }

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

        <button type="submit" className="al-bigbtn">
          <span className="al-bigbtn-emoji" aria-hidden="true">
            🍼
          </span>
          <span className="al-bigbtn-text">
            <span>Start Life</span>
            <span className="al-bigbtn-sub">Looks, smarts and family are still up to fate</span>
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
