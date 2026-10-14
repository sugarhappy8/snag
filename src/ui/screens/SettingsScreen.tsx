// Settings: how money is shown, the Time Machine, About and the danger zone. Also exports the small
// screen header / confirm dialog / toast pieces the other out-of-game screens share.
import { TimeMachineSettingsSection } from '../components/TimeMachineSettings'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { formatMoney, moneyContextOf, withMoneyContext } from '../../game/core'
import { clearRibbonsAndGraveyard, loadGame } from '../../game/save'
import type { GameState } from '../../game/types'
import { getCountry } from '../../game/world'
import type { MoneySetting, PricesSetting } from '../../settings'
import { abandonLife, goBack, hasSavedGame, updateSettings, useApp } from '../store'
import '../styles/screens.css'

// ---------------------------------------------------------------------------
// Shared bits for the out-of-game screens

export interface ScreenHeaderProps {
  title: string
  emoji?: string
  onBack?: () => void
  right?: ReactNode
}

/** Blue top bar with a back arrow, like the app's sub-screens. */
export function ScreenHeader({ title, emoji, onBack, right }: ScreenHeaderProps) {
  return (
    <header className="al-topbar">
      {onBack ? (
        <button type="button" className="al-back" onClick={onBack} aria-label="Back">
          ‹
        </button>
      ) : (
        <span className="al-back-spacer" />
      )}
      <h1 className="al-topbar-title">
        {emoji ? <span aria-hidden="true">{emoji}</span> : null}
        {title}
      </h1>
      <span className="al-topbar-right">{right}</span>
    </header>
  )
}

export interface ConfirmDialogProps {
  title: string
  text: string
  emoji?: string
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** Centered yes/no popup. Escape or tapping outside cancels. */
export function ConfirmDialog({ title, text, emoji, confirmLabel, cancelLabel = 'Cancel', danger, onConfirm, onCancel }: ConfirmDialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])
  return (
    <div className="al-dialog-backdrop" onClick={onCancel}>
      <div className="al-dialog" role="alertdialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        {emoji ? <div className="al-dialog-emoji">{emoji}</div> : null}
        <h2>{title}</h2>
        <p>{text}</p>
        <div className="al-dialog-actions">
          <button type="button" className={danger ? 'al-btn red block' : 'al-btn green block'} onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
          <button type="button" className="al-btn ghost block" onClick={onCancel}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

/** A short-lived toast message. Returns [message, show]. */
export function useFlash(ms = 2600): [string | null, (msg: string) => void] {
  const [msg, setMsg] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  const show = (m: string) => {
    if (timer.current) clearTimeout(timer.current)
    setMsg(m)
    timer.current = setTimeout(() => setMsg(null), ms)
  }
  return [msg, show]
}

export function Flash({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="al-flash" role="status">
      {message}
    </div>
  )
}

export function errorText(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

// ---------------------------------------------------------------------------
// Settings-specific controls

const MONEY_OPTIONS: { id: MoneySetting; label: string; desc: string }[] = [
  { id: 'local', label: 'Local currency', desc: 'Yen in Japan, rupiah in Indonesia, Deutsche Marks in 1980s Germany: whatever people there were paid in.' },
  { id: 'usd', label: 'US dollars', desc: 'Dollars everywhere, wherever you live.' },
]

const PRICE_OPTIONS: { id: PricesSetting; label: string; desc: string }[] = [
  { id: 'nominal', label: 'As they were', desc: 'The prices of the year you are living: a 1980 salary looks like a 1980 salary.' },
  { id: 'today', label: 'Today’s money', desc: 'Every year in today’s prices, so amounts are easy to compare across a life.' },
]

/** One line showing what the money settings do, for the life in progress or an example. */
export function moneyPreview(g: GameState | null): string {
  if (g) {
    const where = getCountry(g.character.countryId).name
    const cash = withMoneyContext(moneyContextOf(g), () => formatMoney(g.character.money))
    return `${g.character.firstName}’s bank balance (${where}, ${g.year}): ${cash}`
  }
  const salary = withMoneyContext({ countryId: 'jp', year: 1980 }, () => formatMoney(40_000))
  const today = withMoneyContext(null, () => formatMoney(40_000))
  return `Example: a job paying ${today} today, for a life in Japan in 1980: ${salary} a year`
}

// ---------------------------------------------------------------------------
// The screen

export function SettingsScreen() {
  const settings = useApp((s) => s.settings)
  const game = useApp((s) => s.game)
  const [confirm, setConfirm] = useState<'abandon' | 'reset' | null>(null)
  const [flash, showFlash] = useFlash()

  // The life that "Abandon" would end: the one in memory, else the saved one.
  const currentLife = useMemo(() => {
    const g = game ?? (hasSavedGame() ? loadGame() : null)
    if (!g) return null
    return { name: `${g.character.firstName} ${g.character.lastName}`, alive: g.character.alive, age: g.character.age }
  }, [game])

  const doAbandon = () => {
    setConfirm(null)
    abandonLife()
  }

  const doReset = () => {
    setConfirm(null)
    clearRibbonsAndGraveyard()
    showFlash('Ribbons and graveyard wiped clean. 🧹')
  }

  return (
    <div className="al-screen settings">
      <ScreenHeader title="Settings" emoji="⚙️" onBack={goBack} />

      {/* Money */}
      <section className="al-card set-section">
        <h2>
          <span aria-hidden="true">💱</span> Money
        </h2>
        <p className="set-help">
          How amounts are shown. Only the display changes: what things are worth, and what you can afford, stays the same.
        </p>
        <div className="al-field">
          <span className="al-label">Currency</span>
          <div className="al-seg" role="radiogroup" aria-label="Currency">
            {MONEY_OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={settings.money === o.id}
                aria-pressed={settings.money === o.id}
                onClick={() => updateSettings({ money: o.id })}
              >
                {o.label}
              </button>
            ))}
          </div>
          <span className="al-muted al-small">{MONEY_OPTIONS.find((o) => o.id === settings.money)?.desc}</span>
        </div>
        <div className="al-field">
          <span className="al-label">Prices</span>
          <div className="al-seg" role="radiogroup" aria-label="Prices">
            {PRICE_OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={settings.prices === o.id}
                aria-pressed={settings.prices === o.id}
                onClick={() => updateSettings({ prices: o.id })}
              >
                {o.label}
              </button>
            ))}
          </div>
          <span className="al-muted al-small">{PRICE_OPTIONS.find((o) => o.id === settings.prices)?.desc}</span>
        </div>
        <p className="al-muted al-small" aria-live="polite">
          {moneyPreview(game)}
        </p>
      </section>

      <TimeMachineSettingsSection />

      {/* About: the game's one disclaimer (docs/VOICE.md rule 9). Game text carries none. */}
      <section className="al-card set-section">
        <h2>About</h2>
        <p className="set-help">
          Everything here is made up. People, companies and events are fictional, and the money and crime systems are simulations. Outcomes aren't guaranteed.
        </p>
      </section>

      {/* Danger zone */}
      <section className="al-card set-section set-danger">
        <h2>
          <span aria-hidden="true">⚠️</span> Danger Zone
        </h2>
        <div className="set-toggle-row">
          <div className="set-toggle-text">
            <div className="set-toggle-title">Abandon current life</div>
            <div className="al-muted al-small">
              {currentLife
                ? currentLife.alive
                  ? `${currentLife.name} (age ${currentLife.age}) will vanish. No grave, no ribbon.`
                  : `Clears ${currentLife.name}’s final screen. Their grave stays in the graveyard.`
                : 'There’s no life in progress.'}
            </div>
          </div>
          <button type="button" className="al-btn red small" disabled={!currentLife} onClick={() => setConfirm('abandon')}>
            Abandon
          </button>
        </div>
        <div className="set-toggle-row">
          <div className="set-toggle-text">
            <div className="set-toggle-title">Reset ribbons &amp; graveyard</div>
            <div className="al-muted al-small">Forget every ribbon you’ve earned and bulldoze every grave.</div>
          </div>
          <button type="button" className="al-btn red small" onClick={() => setConfirm('reset')}>
            Reset
          </button>
        </div>
      </section>

      <p className="home-footer">Your lives and settings are stored only in this browser.</p>

      {confirm === 'abandon' && currentLife ? (
        <ConfirmDialog
          emoji="🚪"
          title="Abandon this life?"
          text={
            currentLife.alive
              ? `${currentLife.name} will simply stop existing. No funeral, no grave, no ribbon. This can’t be undone.`
              : `You’ll lose the chance to continue as one of ${currentLife.name}’s children.`
          }
          confirmLabel="Abandon life"
          danger
          onConfirm={doAbandon}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
      {confirm === 'reset' ? (
        <ConfirmDialog
          emoji="🚜"
          title="Bulldoze everything?"
          text="Every ribbon you’ve collected and every grave in your graveyard will be erased. Your current life is not affected."
          confirmLabel="Erase ribbons & graves"
          danger
          onConfirm={doReset}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
      <Flash message={flash} />
    </div>
  )
}

export default SettingsScreen
