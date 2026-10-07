// Main menu: continue / new life / ribbons / graveyard / settings.
import { useMemo } from 'react'
import { characterAvatar } from '../../game/core'
import { RIBBONS, type RibbonDef } from '../../game/ribbons'
import { loadGame, loadGraveyard, loadRibbons } from '../../game/save'
import type { GameState } from '../../game/types'
import { getCountry } from '../../game/world'
import { getApp, goTo, hasSavedGame, resumeSavedGame, useApp } from '../store'
import '../styles/screens.css'
import { Flash, useFlash } from './SettingsScreen'

export interface SavedLifeSummary {
  name: string
  age: number
  alive: boolean
  avatar: string
  flag: string
  generation: number
}

/** What the "Continue Life" button shows for a saved game. */
export function summarizeLife(g: GameState): SavedLifeSummary {
  const c = g.character
  return {
    name: `${c.firstName} ${c.lastName}`,
    age: c.age,
    alive: c.alive,
    avatar: characterAvatar(c),
    flag: getCountry(c.countryId).flag,
    generation: g.generation,
  }
}

function MenuButton(props: { emoji: string; label: string; sub?: string; tone?: 'green' | 'light' | 'purple'; onClick: () => void }) {
  const { emoji, label, sub, tone, onClick } = props
  return (
    <button type="button" className={`al-bigbtn ${tone ?? ''}`} onClick={onClick}>
      <span className="al-bigbtn-emoji" aria-hidden="true">
        {emoji}
      </span>
      <span className="al-bigbtn-text">
        <span>{label}</span>
        {sub ? <span className="al-bigbtn-sub">{sub}</span> : null}
      </span>
      <span className="al-bigbtn-chevron" aria-hidden="true">
        ›
      </span>
    </button>
  )
}

export function HomeScreen() {
  const game = useApp((s) => s.game)
  const [flash, showFlash] = useFlash()

  const saved = useMemo<SavedLifeSummary | null>(() => {
    if (game) return summarizeLife(game)
    if (!hasSavedGame()) return null
    const g = loadGame()
    return g ? summarizeLife(g) : null
  }, [game])

  const ribbonInfo = useMemo(() => {
    const earned = loadRibbons()
    const got = RIBBONS.filter((r: RibbonDef) => (earned[r.id] ?? 0) > 0).length
    return `${got} of ${RIBBONS.length} collected`
  }, [])

  const graveInfo = useMemo(() => {
    const n = loadGraveyard().length
    return n === 0 ? 'No graves yet' : n === 1 ? '1 past life' : `${n} past lives`
  }, [])

  const onContinue = () => {
    if (resumeSavedGame()) return
    if (getApp().game) goTo('game')
    else showFlash('That save couldn’t be loaded. Time for a new life!')
  }

  return (
    <div className="al-screen home">
      <header className="home-hero">
        <div className="home-logo" aria-hidden="true">
          🧬
        </div>
        <h1 className="home-title">AnotherLife</h1>
        <p className="home-tagline">Live a whole life, one year at a time. Every choice is yours.</p>
      </header>

      <nav className="home-menu" aria-label="Main menu">
        {saved ? (
          <MenuButton
            emoji={saved.avatar}
            label="Continue Life"
            sub={
              saved.alive
                ? `${saved.flag} ${saved.name}, age ${saved.age}${saved.generation > 1 ? ` · Gen ${saved.generation}` : ''}`
                : `🪦 ${saved.name} has died. Choose what’s next`
            }
            tone="green"
            onClick={onContinue}
          />
        ) : null}
        <MenuButton emoji="👶" label="New Life" sub="Random or custom" onClick={() => goTo('newLife')} />
        <MenuButton emoji="🎗️" label="Ribbons" sub={ribbonInfo} tone="light" onClick={() => goTo('ribbons')} />
        <MenuButton emoji="🪦" label="Graveyard" sub={graveInfo} tone="light" onClick={() => goTo('graveyard')} />
        <MenuButton emoji="⚙️" label="Settings" sub="Money display & Time Machine" tone="light" onClick={() => goTo('settings')} />
      </nav>

      <p className="home-footer">Everything runs in your browser: your lives and settings stay on this device.</p>
      <Flash message={flash} />
    </div>
  )
}

export default HomeScreen
