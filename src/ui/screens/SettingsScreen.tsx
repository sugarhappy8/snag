// Settings: AI narration level, the AI connection (provider picker + connection form shared
// with the first-run setup screen), advanced model options and the danger zone. Also exports
// the small screen header / confirm dialog / toast pieces the other out-of-game screens share.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { providerFor } from '../../ai/providers'
import { formatMoney, moneyContextOf, withMoneyContext } from '../../game/core'
import { clearRibbonsAndGraveyard, loadGame } from '../../game/save'
import type { GameState } from '../../game/types'
import { getCountry } from '../../game/world'
import {
  DEFAULT_SETTINGS,
  type AiLevel,
  type ContentRating,
  type MoneySetting,
  type PricesSetting,
  type ProviderId,
  type Settings,
} from '../../settings'
import { connectionFor, ProviderConfigForm, ProviderPicker, sameConnection, useConnectionTest } from '../components/AiProviderForm'
import { abandonLife, checkAi, getApp, goBack, goTo, hasSavedGame, saveAiConnection, updateSettings, useApp, type AiConnection } from '../store'
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

const AI_LEVELS: { id: AiLevel; emoji: string; title: string; desc: string; tag?: string }[] = [
  {
    id: 'off',
    emoji: '📴',
    title: 'Off',
    desc: 'Classic offline mode. Every event comes from the built-in story library. Instant, and you don’t need any AI.',
  },
  {
    id: 'balanced',
    emoji: '⚖️',
    title: 'Balanced',
    tag: 'Recommended',
    desc: 'Your AI writes each year’s random events, what happens after your choices, chats, job interviews, “Do Anything” and your obituary. Everyday activity results use the built-in text, so it stays quick.',
  },
  {
    id: 'full',
    emoji: '✨',
    title: 'Full',
    desc: 'Everything in Balanced, plus the AI retells every activity result in its own words. The most alive it gets, and the slowest. Best with a fast GPU.',
  },
]

const RATINGS: { id: ContentRating; label: string; desc: string }[] = [
  { id: 'family', label: 'Family', desc: 'Wholesome and gentle. No crude jokes, violence stays offscreen. Fine for kids.' },
  { id: 'teen', label: 'Teen', desc: 'Dark humor, drama, crime and bad decisions, but nothing explicit. The classic feel.' },
  { id: 'mature', label: 'Mature', desc: 'Edgier jokes, harsher outcomes and stronger language. Still nothing sexually explicit.' },
]

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

function Toggle({ title, desc, value, onChange }: { title: string; desc: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="set-toggle-row">
      <div className="set-toggle-text">
        <div className="set-toggle-title">{title}</div>
        <div className="al-muted al-small">{desc}</div>
      </div>
      <button type="button" role="switch" aria-checked={value} aria-label={title} className="set-switch" onClick={() => onChange(!value)} />
    </div>
  )
}

/** Number input with clamping; invalid input reverts on blur. */
function NumberSetting(props: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; help?: string; onCommit: (v: number) => void }) {
  const { label, value, min, max, step = 1, suffix, help, onCommit } = props
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  const commit = () => {
    const n = Number(draft)
    if (!Number.isFinite(n) || draft.trim() === '') {
      setDraft(String(value))
      return
    }
    const v = Math.min(max, Math.max(min, Math.round(n / step) * step))
    setDraft(String(v))
    if (v !== value) onCommit(v)
  }
  return (
    <label className="al-field">
      <span className="al-label">
        {label}
        {suffix ? ` (${suffix})` : ''}
      </span>
      <input
        className="al-input"
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
        }}
      />
      {help ? <span className="al-muted al-small">{help}</span> : null}
    </label>
  )
}

const ADVANCED_KEYS = ['temperature', 'maxTokens', 'timeoutSec', 'structuredOutput', 'disableThinking', 'contentRating', 'showAiBadges'] as const

function advancedDefaults(): Partial<Settings> {
  const out: Partial<Settings> = {}
  for (const k of ADVANCED_KEYS) Object.assign(out, { [k]: DEFAULT_SETTINGS[k] })
  return out
}

// ---------------------------------------------------------------------------
// The screen

export function SettingsScreen() {
  const settings = useApp((s) => s.settings)
  const aiStatus = useApp((s) => s.aiStatus)
  const aiMessage = useApp((s) => s.aiMessage)
  const game = useApp((s) => s.game)
  const [test, runTest, resetTest] = useConnectionTest()
  const [confirm, setConfirm] = useState<'abandon' | 'reset' | null>(null)
  const [picking, setPicking] = useState(false)
  const [flash, showFlash] = useFlash()
  const def = providerFor(settings)

  // The connection being edited: follows the saved settings, and is saved on every commit.
  const [conn, setConn] = useState<AiConnection>(() => connectionFor(settings))
  const latest = useRef(conn)
  const { provider, baseUrl, apiKey, model } = settings
  useEffect(() => {
    const saved: AiConnection = { provider, baseUrl, apiKey, model }
    latest.current = saved
    setConn(saved)
  }, [provider, baseUrl, apiKey, model])
  const edit = (next: AiConnection) => {
    latest.current = next
    setConn(next)
  }
  const commit = (next: AiConnection) => {
    edit(next)
    if (!sameConnection(next, connectionFor(getApp().settings))) saveAiConnection(next)
  }

  // The life that "Abandon" would end: the one in memory, else the saved one.
  const currentLife = useMemo(() => {
    const g = game ?? (hasSavedGame() ? loadGame() : null)
    if (!g) return null
    return { name: `${g.character.firstName} ${g.character.lastName}`, alive: g.character.alive, age: g.character.age }
  }, [game])

  const setLevel = (aiLevel: AiLevel) => {
    if (aiLevel === settings.aiLevel) return
    updateSettings({ aiLevel })
    void checkAi()
  }

  const onTest = async () => {
    // Save whatever was typed but not committed yet, then test what's saved.
    commit(latest.current)
    const res = await runTest(getApp().settings)
    if (res.status === 'done' && getApp().settings.aiLevel !== 'off') void checkAi()
  }

  const pickProvider = (id: ProviderId) => {
    setPicking(false)
    if (id === getApp().settings.provider) return
    resetTest()
    commit(connectionFor(getApp().settings, id))
    if (getApp().settings.aiLevel !== 'off') void checkAi()
  }

  const doAbandon = () => {
    setConfirm(null)
    abandonLife()
  }

  const doReset = () => {
    setConfirm(null)
    clearRibbonsAndGraveyard()
    showFlash('Ribbons and graveyard wiped clean. 🧹')
  }

  const statusLabel =
    settings.aiLevel === 'off'
      ? 'AI narration is off'
      : aiStatus === 'online'
        ? `Connected to ${def.name}`
        : aiStatus === 'checking'
          ? `Checking ${def.name}…`
          : aiStatus === 'offline'
            ? `Can’t reach ${def.name}`
            : 'Not checked yet'
  const dotClass = settings.aiLevel === 'off' ? '' : aiStatus === 'online' ? 'online' : aiStatus === 'checking' ? 'checking' : aiStatus === 'offline' ? 'offline' : ''

  return (
    <div className="al-screen settings">
      <ScreenHeader title="Settings" emoji="⚙️" onBack={goBack} />

      {/* AI narration level */}
      <section className="al-card set-section">
        <h2>
          <span aria-hidden="true">🤖</span> AI Narration
        </h2>
        <p className="set-help">
          The AI you chose ({def.name}) writes your life as you live it. If it’s slow or offline, the game quietly falls back to the
          built-in stories.
        </p>
        <div className="al-field" role="radiogroup" aria-label="AI narration level">
          {AI_LEVELS.map((lvl) => (
            <button
              key={lvl.id}
              type="button"
              role="radio"
              aria-checked={settings.aiLevel === lvl.id}
              className="set-radio"
              onClick={() => setLevel(lvl.id)}
            >
              <span className="set-radio-emoji" aria-hidden="true">
                {lvl.emoji}
              </span>
              <span>
                <span className="set-radio-title">
                  {lvl.title}
                  {lvl.tag ? <span className="al-ai-badge">{lvl.tag}</span> : null}
                </span>
                <span className="set-radio-desc" style={{ display: 'block' }}>
                  {lvl.desc}
                </span>
              </span>
              <span className="set-check" aria-hidden="true">
                {settings.aiLevel === lvl.id ? '✓' : ''}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Connection */}
      <section className="al-card set-section">
        <h2>
          <span aria-hidden="true">🔌</span> AI Connection
        </h2>
        <div className="al-ai-card-head">
          <span className={`al-status-dot ${dotClass}`} />
          <div>
            <strong>{statusLabel}</strong>
            {aiMessage && settings.aiLevel !== 'off' ? <p className="al-ai-message">{aiMessage}</p> : null}
          </div>
        </div>

        <div className="al-field">
          <span className="al-label">AI provider</span>
          <button
            type="button"
            className="aip-card active aip-current"
            aria-expanded={picking}
            onClick={() => setPicking((v) => !v)}
          >
            <span className="aip-card-emoji" aria-hidden="true">
              {def.emoji}
            </span>
            <span className="aip-card-text">
              <span className="aip-card-name">{def.name}</span>
              <span className="aip-card-blurb">{def.kind === 'local' ? 'On your computer' : 'Cloud AI with your API key'}</span>
            </span>
            <span className="aip-card-change">{picking ? 'Close' : 'Change'}</span>
          </button>
          {picking ? <ProviderPicker selected={settings.provider} onPick={pickProvider} /> : null}
          <span className="al-muted al-small">Each provider remembers its own URL, key and model, so you can switch back and forth.</span>
        </div>

        <ProviderConfigForm conn={conn} onChange={edit} onCommit={commit} test={test} onTest={() => void onTest()} />

        <button type="button" className="al-btn ghost block" onClick={() => goTo('aiSetup')}>
          🧭 Change AI provider / run setup again
        </button>
      </section>

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

      {/* Advanced */}
      <section className="al-card">
        <details className="set-details">
          <summary>
            <span aria-hidden="true">🛠️</span> Advanced
          </summary>
          <div className="set-details-body">
            <div className="al-field">
              <div className="set-range-head">
                <span className="al-label">Creativity (temperature)</span>
                <strong>{settings.temperature.toFixed(2)}</strong>
              </div>
              <input
                className="set-range"
                type="range"
                min={0}
                max={1.5}
                step={0.05}
                value={settings.temperature}
                onChange={(e) => updateSettings({ temperature: Number(e.target.value) })}
                aria-label="Temperature"
              />
              <span className="al-muted al-small">Lower is more predictable, higher is wilder. 0.7–1.0 suits most models.</span>
            </div>

            <div className="nl-grid">
              <NumberSetting
                label="Max tokens"
                value={settings.maxTokens}
                min={200}
                max={8000}
                step={50}
                help="Longest reply the AI may write."
                onCommit={(maxTokens) => updateSettings({ maxTokens })}
              />
              <NumberSetting
                label="Timeout"
                suffix="seconds"
                value={settings.timeoutSec}
                min={10}
                max={600}
                help="After this, the built-in stories take over."
                onCommit={(timeoutSec) => updateSettings({ timeoutSec })}
              />
            </div>

            <Toggle
              title="Structured output"
              desc="Asks the AI for strict JSON that matches the game’s schema (the game steps down automatically if it’s refused). Turn this off if your model or server errors on it."
              value={settings.structuredOutput}
              onChange={(structuredOutput) => updateSettings({ structuredOutput })}
            />
            <Toggle
              title="Skip thinking"
              desc="For reasoning models (Qwen 3, DeepSeek R1…): asks them to skip the long think step so years fly by faster."
              value={settings.disableThinking}
              onChange={(disableThinking) => updateSettings({ disableThinking })}
            />
            <Toggle
              title="Show AI badges"
              desc="Puts a little ✨ next to anything the AI wrote."
              value={settings.showAiBadges}
              onChange={(showAiBadges) => updateSettings({ showAiBadges })}
            />

            <div className="al-field">
              <span className="al-label">Content rating</span>
              <div className="al-seg" role="radiogroup" aria-label="Content rating">
                {RATINGS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    role="radio"
                    aria-checked={settings.contentRating === r.id}
                    aria-pressed={settings.contentRating === r.id}
                    onClick={() => updateSettings({ contentRating: r.id })}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <span className="al-muted al-small">{RATINGS.find((r) => r.id === settings.contentRating)?.desc}</span>
            </div>

            <button
              type="button"
              className="al-btn ghost block"
              onClick={() => {
                updateSettings(advancedDefaults())
                showFlash('Advanced settings restored.')
              }}
            >
              ↺ Restore defaults
            </button>
          </div>
        </details>
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
