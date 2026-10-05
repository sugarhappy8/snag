// Main menu: continue / new life / ribbons / graveyard / settings, plus the LM Studio status card.
import { useMemo } from 'react'
import { characterAvatar } from '../../game/core'
import { RIBBONS, type RibbonDef } from '../../game/ribbons'
import { loadGame, loadGraveyard, loadRibbons } from '../../game/save'
import type { GameState } from '../../game/types'
import { getCountry } from '../../game/world'
import { checkAi, getApp, goTo, hasSavedGame, resumeSavedGame, updateSettings, useApp } from '../store'
import { HAS_DEV_PROXY } from '../../settings'
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

/** LM Studio connection status with a short how-to when it's offline. Used on the home screen. */
export function AiStatusCard() {
  const aiStatus = useApp((s) => s.aiStatus)
  const aiMessage = useApp((s) => s.aiMessage)
  const aiLevel = useApp((s) => s.settings.aiLevel)

  if (aiLevel === 'off') {
    return (
      <section className="al-card al-ai-card" aria-live="polite">
        <div className="al-ai-card-head">
          <span className="al-status-dot" />
          <strong>AI narration is off</strong>
        </div>
        <p className="al-ai-message">Lives use the built-in story library. Turn the AI on to have your local model write your life.</p>
        <div className="al-ai-actions">
          <button
            type="button"
            className="al-btn small green"
            onClick={() => {
              updateSettings({ aiLevel: 'balanced' })
              void checkAi()
            }}
          >
            ✨ Turn on AI
          </button>
          <button type="button" className="al-btn small ghost" onClick={() => goTo('settings')}>
            Settings
          </button>
        </div>
      </section>
    )
  }

  const online = aiStatus === 'online'
  const checking = aiStatus === 'checking' || aiStatus === 'unknown'
  return (
    <section className="al-card al-ai-card" aria-live="polite">
      <div className="al-ai-card-head">
        <span className={`al-status-dot ${online ? 'online' : checking ? 'checking' : 'offline'}`} />
        <strong>{online ? 'AI narrator is ready ✨' : checking ? 'Looking for LM Studio…' : 'LM Studio is offline'}</strong>
      </div>
      {aiMessage ? <p className="al-ai-message">{aiMessage}</p> : null}
      {online ? (
        <p className="al-ai-message">Your local model will write your random events, conversations and obituary.</p>
      ) : checking ? null : (
        <>
          <p className="al-ai-message">You can still play: the built-in stories fill in until your AI is reachable. To connect:</p>
          <ol className="al-ai-steps">
            <li>Open LM Studio and load a model.</li>
            <li>
              Go to <b>Developer</b> → <b>Start Server</b> (port 1234).
            </li>
            {HAS_DEV_PROXY ? (
              <li>
                Keep <span className="al-kbd">npm run dev</span> running, then tap Retry.
              </li>
            ) : (
              <li>
                In LM Studio's <b>Server Settings</b>, turn on <b>Enable CORS</b>. If your browser asks to let this site access devices
                on your local network, choose <b>Allow</b>. Then tap Retry.
              </li>
            )}
          </ol>
        </>
      )}
      <div className="al-ai-actions">
        <button type="button" className="al-btn small" onClick={() => void checkAi()} disabled={aiStatus === 'checking'}>
          {aiStatus === 'checking' ? '⏳ Checking…' : '↻ Retry'}
        </button>
        <button type="button" className="al-btn small ghost" onClick={() => goTo('settings')}>
          AI settings
        </button>
      </div>
    </section>
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
        <p className="home-tagline">Live a whole life, one year at a time, with an AI on your own computer telling the story.</p>
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
        <MenuButton emoji="⚙️" label="Settings" sub="AI narration & LM Studio" tone="light" onClick={() => goTo('settings')} />
      </nav>

      <AiStatusCard />

      <p className="home-footer">Private by design: your lives stay in this browser and your AI stays on your machine.</p>
      <Flash message={flash} />
    </div>
  )
}

export default HomeScreen
