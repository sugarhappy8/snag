// Settings: AI narration level, the LM Studio connection, advanced model options, a setup
// guide and the danger zone. Also exports the small screen header / confirm dialog / toast
// pieces the other out-of-game screens share.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { testConnection } from '../../ai/director'
import { loadGame } from '../../game/save'
import { DEFAULT_SETTINGS, type AiLevel, type ContentRating, type Settings } from '../../settings'
import { abandonLife, checkAi, getApp, goBack, hasSavedGame, updateSettings, useApp } from '../store'
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
    desc: 'Classic offline mode. Every event comes from the built-in story library. Instant, and you don’t need LM Studio.',
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

/** Text input that keeps a local draft and saves on blur / Enter. */
function TextSetting(props: {
  label: string
  value: string
  placeholder?: string
  type?: 'text' | 'password'
  help?: ReactNode
  onCommit: (v: string) => void
  /** Clean up the typed value before saving (e.g. fall back to a default when empty). */
  normalize?: (v: string) => string
  extra?: ReactNode
}) {
  const { label, value, placeholder, type = 'text', help, onCommit, normalize, extra } = props
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = () => {
    const v = normalize ? normalize(draft.trim()) : draft.trim()
    setDraft(v)
    if (v !== value) onCommit(v)
  }
  return (
    <label className="al-field">
      <span className="al-label">{label}</span>
      <div className="al-input-row">
        <input
          className="al-input"
          type={type}
          value={draft}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
          }}
        />
        {extra}
      </div>
      {help ? <span className="al-muted al-small">{help}</span> : null}
    </label>
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

interface TestState {
  status: 'idle' | 'testing' | 'done'
  ok: boolean
  message: string
  models: string[]
}

const ADVANCED_KEYS = ['temperature', 'maxTokens', 'timeoutSec', 'structuredOutput', 'disableThinking', 'contentRating', 'showAiBadges'] as const

function advancedDefaults(): Partial<Settings> {
  const out: Partial<Settings> = {}
  for (const k of ADVANCED_KEYS) Object.assign(out, { [k]: DEFAULT_SETTINGS[k] })
  return out
}

function isAbsoluteUrl(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

// ---------------------------------------------------------------------------
// The screen

export function SettingsScreen() {
  const settings = useApp((s) => s.settings)
  const aiStatus = useApp((s) => s.aiStatus)
  const aiMessage = useApp((s) => s.aiMessage)
  const game = useApp((s) => s.game)
  const [test, setTest] = useState<TestState>({ status: 'idle', ok: false, message: '', models: [] })
  const [showKey, setShowKey] = useState(false)
  const [confirm, setConfirm] = useState<'abandon' | 'reset' | null>(null)
  const [flash, showFlash] = useFlash()
  const controller = useRef<AbortController | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      controller.current?.abort()
    }
  }, [])

  // The life that "Abandon" would end: the one in memory, else the saved one.
  const currentLife = useMemo(() => {
    const g = game ?? (hasSavedGame() ? loadGame() : null)
    if (!g) return null
    return { name: `${g.character.firstName} ${g.character.lastName}`, alive: g.character.alive, age: g.character.age }
  }, [game])

  const modelOptions = useMemo(() => {
    const list = [...test.models]
    if (settings.model && !list.includes(settings.model)) list.unshift(settings.model)
    return list
  }, [test.models, settings.model])

  const setLevel = (aiLevel: AiLevel) => {
    if (aiLevel === settings.aiLevel) return
    updateSettings({ aiLevel })
    void checkAi()
  }

  const runTest = async () => {
    controller.current?.abort()
    const ctrl = new AbortController()
    controller.current = ctrl
    const s = getApp().settings
    const timer = setTimeout(() => ctrl.abort(), Math.min(Math.max(s.timeoutSec, 5), 30) * 1000)
    setTest((t) => ({ ...t, status: 'testing', message: '' }))
    try {
      const res = await testConnection(s, ctrl.signal)
      if (!mounted.current || controller.current !== ctrl) return
      const message = !res.ok && ctrl.signal.aborted ? 'LM Studio didn’t answer in time. Is the server running?' : res.message
      setTest({ status: 'done', ok: res.ok, message, models: res.models ?? [] })
      if (getApp().settings.aiLevel !== 'off') void checkAi()
    } catch (err) {
      if (!mounted.current || controller.current !== ctrl) return
      const message = ctrl.signal.aborted ? 'LM Studio didn’t answer in time. Is the server running?' : errorText(err)
      setTest({ status: 'done', ok: false, message, models: [] })
    } finally {
      clearTimeout(timer)
    }
  }

  const doAbandon = () => {
    setConfirm(null)
    abandonLife()
  }

  const doReset = () => {
    setConfirm(null)
    try {
      localStorage.removeItem('anotherlife.ribbons.v1')
      localStorage.removeItem('anotherlife.graveyard.v1')
      showFlash('Ribbons and graveyard wiped clean. 🧹')
    } catch {
      showFlash('Couldn’t clear storage in this browser.')
    }
  }

  const statusLabel =
    settings.aiLevel === 'off'
      ? 'AI narration is off'
      : aiStatus === 'online'
        ? 'Connected to LM Studio'
        : aiStatus === 'checking'
          ? 'Checking LM Studio…'
          : aiStatus === 'offline'
            ? 'Can’t reach LM Studio'
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
          A model running in LM Studio on your own computer writes your life as you live it. If it’s slow or offline, the game
          quietly falls back to the built-in stories.
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
          <span aria-hidden="true">🔌</span> LM Studio Connection
        </h2>
        <div className="al-ai-card-head">
          <span className={`al-status-dot ${dotClass}`} />
          <div>
            <strong>{statusLabel}</strong>
            {aiMessage && settings.aiLevel !== 'off' ? <p className="al-ai-message">{aiMessage}</p> : null}
          </div>
        </div>

        <TextSetting
          label="Server URL"
          value={settings.baseUrl}
          placeholder={DEFAULT_SETTINGS.baseUrl}
          normalize={(v) => v.replace(/\/+$/, '') || DEFAULT_SETTINGS.baseUrl}
          onCommit={(baseUrl) => updateSettings({ baseUrl })}
          extra={
            settings.baseUrl !== DEFAULT_SETTINGS.baseUrl ? (
              <button type="button" className="al-btn ghost small" onClick={() => updateSettings({ baseUrl: DEFAULT_SETTINGS.baseUrl })}>
                Reset
              </button>
            ) : null
          }
          help={
            isAbsoluteUrl(settings.baseUrl) ? (
              <>
                You’re calling LM Studio directly. Turn on <b>Enable CORS</b> in LM Studio’s server settings, or the browser will block
                the requests.
              </>
            ) : (
              <>
                The default <span className="al-kbd">/lmstudio/v1</span> goes through the game’s dev-server proxy to{' '}
                <span className="al-kbd">http://localhost:1234</span>, so you don’t need to set up CORS. To use another machine, enter its
                full address (e.g. <span className="al-kbd">http://192.168.1.20:1234/v1</span>) and enable CORS in LM Studio.
              </>
            )
          }
        />

        <TextSetting
          label="API token (optional)"
          type={showKey ? 'text' : 'password'}
          value={settings.apiKey}
          placeholder="Only if you turned on authentication"
          onCommit={(apiKey) => updateSettings({ apiKey })}
          extra={
            <button type="button" className="al-btn ghost small" onClick={() => setShowKey((v) => !v)} aria-label={showKey ? 'Hide token' : 'Show token'}>
              {showKey ? '🙈' : '👁️'}
            </button>
          }
        />

        <button type="button" className="al-btn block" onClick={() => void runTest()} disabled={test.status === 'testing'}>
          {test.status === 'testing' ? '⏳ Testing…' : '🔎 Test connection'}
        </button>
        {test.status === 'done' ? (
          <div className={`set-test-result ${test.ok ? 'ok' : 'fail'}`} role="status">
            {test.ok ? '✅ ' : '⚠️ '}
            {test.message || (test.ok ? 'LM Studio is answering.' : 'Couldn’t connect.')}
            {test.ok && test.models.length > 0 ? (
              <div className="al-small" style={{ marginTop: 4 }}>
                {test.models.length === 1 ? '1 model available.' : `${test.models.length} models available.`}
              </div>
            ) : null}
          </div>
        ) : null}

        <label className="al-field">
          <span className="al-label">Model</span>
          <select className="al-select" value={settings.model} onChange={(e) => updateSettings({ model: e.target.value })}>
            <option value="">Auto: use the loaded model</option>
            {modelOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <span className="al-muted al-small">
            {test.models.length > 0
              ? 'Pick a specific model, or leave it on Auto to use whatever LM Studio has loaded.'
              : 'Test the connection to list the models LM Studio has. Auto works fine with one model loaded.'}
          </span>
        </label>
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
              desc="Asks LM Studio for strict JSON that matches the game’s schema. Turn this off if your model or LM Studio version errors on it."
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

      {/* Setup guide */}
      <section className="al-card set-section">
        <h2>
          <span aria-hidden="true">📘</span> How to set up LM Studio
        </h2>
        <ol className="set-steps">
          <li>
            Install <b>LM Studio</b> from lmstudio.ai (free, Windows / Mac / Linux).
          </li>
          <li>
            In the <b>Discover</b> tab, download a small instruct model. Anything from 7B to 12B works well, for example a Qwen, Llama,
            Gemma or Mistral instruct model. Pick a quantization that fits your GPU memory (Q4_K_M is a safe bet).
          </li>
          <li>
            Open the <b>Developer</b> tab, load the model and switch <b>Start Server</b> on. It listens on port{' '}
            <span className="al-kbd">1234</span> by default.
          </li>
          <li>
            Keep <span className="al-kbd">npm run dev</span> running for this game, then press <b>Test connection</b> above.
          </li>
          <li>Pick a narration level and start a new life. If a year takes too long, tap Skip and the built-in stories take over.</li>
        </ol>
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
