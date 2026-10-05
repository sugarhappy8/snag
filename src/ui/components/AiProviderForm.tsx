// The AI provider picker and connection form, shared by the first-run "Choose your AI" screen
// and the AI Connection section of Settings: provider cards, server URL, API key (with a
// privacy note), the provider's setup steps, "Test connection" and the model list.
//
// The form is controlled: the parent owns the AiConnection draft. The setup screen keeps it as
// a draft until "Start playing"; Settings saves it on every commit (blur, Enter, selection).
import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { testConnection } from '../../ai/director'
import {
  CLOUD_PROVIDERS,
  defaultBaseUrlFor,
  getProvider,
  LOCAL_PROVIDERS,
  onHostedPage,
  providerFor,
  type ProviderDef,
  type ProviderKind,
} from '../../ai/providers'
import { aiConfigProblem, providerConfig, type ProviderId, type Settings } from '../../settings'
import type { AiConnection } from '../store'
import '../styles/screens.css'

// ---------------------------------------------------------------------------
// Helpers

/** The URL/key/model `settings` holds for provider `id` (the active one by default). */
export function connectionFor(settings: Settings, id: ProviderId = settings.provider): AiConnection {
  return { provider: id, ...providerConfig(settings, id) }
}

export function sameConnection(a: AiConnection, b: AiConnection): boolean {
  return a.provider === b.provider && a.baseUrl === b.baseUrl && a.apiKey === b.apiKey && a.model === b.model
}

/** Tidy a typed URL: trim, drop trailing slashes, fall back to the provider's default when empty. */
export function cleanBaseUrl(def: ProviderDef, url: string): string {
  return url.trim().replace(/\/+$/, '') || defaultBaseUrlFor(def)
}

/** Label for the model list's "Auto" choice. */
export function autoModelLabel(def: ProviderDef): string {
  if (def.kind === 'local') return 'Auto: use the loaded model'
  return def.defaultModel ? `Auto: ${def.defaultModel}` : 'Auto: pick a good model'
}

/** Models to offer: what the provider listed, else (cloud) its suggestions; the current pick stays first. */
export function modelChoices(def: ProviderDef, listed: string[], current: string): string[] {
  const list = listed.length > 0 ? [...listed] : def.kind === 'cloud' ? [...def.suggestedModels] : []
  if (current && !list.includes(current)) list.unshift(current)
  return list
}

/** "Ollama", or "your server" for the generic local entry. */
function serverName(def: ProviderDef): string {
  return def.id === 'customLocal' ? 'your server' : def.name
}

/** Where an API key goes, in plain words, for the privacy note. */
export function keyPrivacyNote(def: ProviderDef): string {
  const dest =
    def.id === 'customCloud' ? 'the API URL above' : def.id === 'customLocal' ? 'your server' : def.kind === 'local' ? `your ${def.name} server` : def.name
  return `Your key is stored only in this browser and is sent only to ${dest}. AnotherLife has no server of its own.`
}

/** Render `code` spans in a setup step as keyboard chips. */
function withCode(text: string): ReactNode {
  const parts = text.split('`')
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="al-kbd">
        {part}
      </span>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  )
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// ---------------------------------------------------------------------------
// Connection test

export interface ConnectionTest {
  status: 'idle' | 'testing' | 'done'
  ok: boolean
  message: string
  models: string[]
}

export const IDLE_TEST: ConnectionTest = { status: 'idle', ok: false, message: '', models: [] }

function lateMessage(def: ProviderDef): string {
  return def.kind === 'local'
    ? `${def.name} didn't answer in time. Is its server running? If your browser asked about access to your local network, choose Allow and test again.`
    : `${def.name} didn't answer in time — check your internet connection and try again.`
}

/**
 * Runs testConnection with a timeout and keeps the latest result. A newer test (or reset)
 * cancels the one in flight. Returns [state, run, reset]; run resolves with the result.
 */
export function useConnectionTest(): [ConnectionTest, (settings: Settings) => Promise<ConnectionTest>, () => void] {
  const [test, setTest] = useState<ConnectionTest>(IDLE_TEST)
  const current = useRef<AbortController | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      current.current?.abort()
    }
  }, [])

  const run = async (settings: Settings): Promise<ConnectionTest> => {
    current.current?.abort()
    const ctrl = new AbortController()
    current.current = ctrl
    const def = providerFor(settings)
    // Say what's missing in this form's words instead of sending a request that can't work.
    if (aiConfigProblem(settings)) {
      const message =
        def.needsKey && !settings.apiKey.trim()
          ? `Paste your ${def.name} API key above first${def.keyUrl ? ' (tap “Get a key” to create one)' : ''}.`
          : `Enter the ${def.kind === 'local' ? 'server' : 'API'} URL above first.`
      const result: ConnectionTest = { status: 'done', ok: false, message, models: [] }
      setTest(result)
      return result
    }
    const timer = setTimeout(() => ctrl.abort(), Math.min(Math.max(Number(settings.timeoutSec) || 30, 5), 30) * 1000)
    setTest({ ...IDLE_TEST, status: 'testing' })
    let result: ConnectionTest
    try {
      const res = await testConnection(settings, ctrl.signal)
      const message = !res.ok && ctrl.signal.aborted ? lateMessage(def) : res.message
      result = { status: 'done', ok: res.ok, message, models: res.models ?? [] }
    } catch (err) {
      result = { status: 'done', ok: false, message: ctrl.signal.aborted ? lateMessage(def) : errorText(err), models: [] }
    } finally {
      clearTimeout(timer)
    }
    if (mounted.current && current.current === ctrl) setTest(result)
    return result
  }

  const reset = () => {
    current.current?.abort()
    current.current = null
    setTest(IDLE_TEST)
  }

  return [test, run, reset]
}

// ---------------------------------------------------------------------------
// Provider picker

export interface ProviderCardsProps {
  providers: readonly ProviderDef[]
  /** Highlights this provider (Settings); omit when picking navigates on (setup). */
  selected?: ProviderId
  onPick: (id: ProviderId) => void
}

/** Big tappable provider cards: emoji, name and one-line blurb. */
export function ProviderCards({ providers, selected, onPick }: ProviderCardsProps) {
  return (
    <div className="aip-cards">
      {providers.map((p) => {
        const active = selected === p.id
        return (
          <button
            key={p.id}
            type="button"
            className={`aip-card${active ? ' active' : ''}`}
            aria-pressed={selected === undefined ? undefined : active}
            onClick={() => onPick(p.id)}
          >
            <span className="aip-card-emoji" aria-hidden="true">
              {p.emoji}
            </span>
            <span className="aip-card-text">
              <span className="aip-card-name">{p.name}</span>
              <span className="aip-card-blurb">{p.blurb}</span>
            </span>
            <span className="aip-card-end" aria-hidden="true">
              {selected === undefined ? '›' : active ? '✓' : ''}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** title: the welcome-screen choice; header: fits the top bar on a phone; short: picker tab. */
export const KIND_LABELS: Record<ProviderKind, { emoji: string; title: string; header: string; short: string }> = {
  local: { emoji: '🖥️', title: 'AI on my computer', header: 'AI on my computer', short: 'On my computer' },
  cloud: { emoji: '🔑', title: 'AI service with my own API key', header: 'AI service + API key', short: 'Cloud + API key' },
}

export function providersOfKind(kind: ProviderKind): readonly ProviderDef[] {
  return kind === 'local' ? LOCAL_PROVIDERS : CLOUD_PROVIDERS
}

/** Local / cloud tabs over the provider cards (Settings). */
export function ProviderPicker({ selected, onPick }: { selected: ProviderId; onPick: (id: ProviderId) => void }) {
  const [kind, setKind] = useState<ProviderKind>(getProvider(selected).kind)
  return (
    <div className="aip-picker">
      <div className="al-seg" role="tablist" aria-label="Kind of AI">
        {(['local', 'cloud'] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} aria-pressed={kind === k} onClick={() => setKind(k)}>
            {KIND_LABELS[k].emoji} {KIND_LABELS[k].short}
          </button>
        ))}
      </div>
      <ProviderCards providers={providersOfKind(kind)} selected={selected} onPick={onPick} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Connection form

export interface ProviderConfigFormProps {
  conn: AiConnection
  /** Every edit (keystrokes included). */
  onChange: (conn: AiConnection) => void
  /** A finished edit: blur, Enter, Reset, or a model choice. Settings saves here. */
  onCommit?: (conn: AiConnection) => void
  test: ConnectionTest
  onTest: () => void
  /** Show the setup steps expanded (setup screen) or collapsed (Settings). */
  stepsOpen?: boolean
}

export function ProviderConfigForm({ conn, onChange, onCommit, test, onTest, stepsOpen = false }: ProviderConfigFormProps) {
  const def = getProvider(conn.provider)
  const ids = useId()
  const [showKey, setShowKey] = useState(false)
  const [typingModel, setTypingModel] = useState(false)
  const defaultUrl = defaultBaseUrlFor(def)
  // A relative URL like /lmstudio/v1 goes through the Vite dev/preview proxy.
  const proxied = conn.baseUrl.trim().startsWith('/')
  const hosted = onHostedPage()

  const commit = (next: AiConnection) => {
    onChange(next)
    onCommit?.(next)
  }
  const commitUrl = () => {
    const baseUrl = cleanBaseUrl(def, conn.baseUrl)
    commit({ ...conn, baseUrl })
  }
  const commitText = () => commit({ ...conn, apiKey: conn.apiKey.trim(), model: conn.model.trim() })
  const onEnter = (fn: () => void) => (e: { key: string }) => {
    if (e.key === 'Enter') fn()
  }

  const models = modelChoices(def, test.models, conn.model)
  const testing = test.status === 'testing'

  const urlHelp: ReactNode = proxied ? (
    <>
      <span className="al-kbd">{conn.baseUrl}</span> goes through the game’s dev-server proxy to LM Studio on this computer, so CORS
      isn’t needed. For another machine, enter its full address (e.g. <span className="al-kbd">http://192.168.1.20:1234/v1</span>).
    </>
  ) : def.kind === 'local' ? (
    <>
      Where {serverName(def)} is listening. Change it for another port or another computer’s address. To play on a phone or tablet,
      use an https tunnel to it (e.g. <span className="al-kbd">cloudflared tunnel --url http://localhost:1234</span>).
    </>
  ) : def.id === 'customCloud' ? (
    <>Your provider’s OpenAI-compatible base URL. It usually ends in /v1.</>
  ) : (
    <>{def.name}’s API address. Only change it to go through a proxy or gateway.</>
  )

  return (
    <div className="aip-form">
      <div className="al-field">
        <label className="al-label" htmlFor={`${ids}-url`}>
          {def.kind === 'local' ? 'Server URL' : 'API URL'}
        </label>
        <div className="al-input-row">
          <input
            id={`${ids}-url`}
            className="al-input"
            type="url"
            inputMode="url"
            value={conn.baseUrl}
            placeholder={def.baseUrlPlaceholder}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            onChange={(e) => onChange({ ...conn, baseUrl: e.target.value })}
            onBlur={commitUrl}
            onKeyDown={onEnter(commitUrl)}
          />
          {defaultUrl && conn.baseUrl !== defaultUrl ? (
            <button type="button" className="al-btn ghost small" onClick={() => commit({ ...conn, baseUrl: defaultUrl })}>
              Reset
            </button>
          ) : null}
        </div>
        <span className="al-muted al-small">{urlHelp}</span>
      </div>

      <div className="al-field">
        <label className="al-label" htmlFor={`${ids}-key`}>
          {def.needsKey ? `${def.name} API key` : 'API token (optional)'}
        </label>
        <div className="al-input-row">
          <input
            id={`${ids}-key`}
            className="al-input"
            type={showKey ? 'text' : 'password'}
            value={conn.apiKey}
            placeholder={def.keyPlaceholder}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            onChange={(e) => onChange({ ...conn, apiKey: e.target.value })}
            onBlur={commitText}
            onKeyDown={onEnter(commitText)}
          />
          <button
            type="button"
            className="al-btn ghost small aip-eye"
            onClick={() => setShowKey((v) => !v)}
            aria-label={showKey ? 'Hide key' : 'Show key'}
            aria-pressed={showKey}
          >
            {showKey ? '🙈 Hide' : '👁️ Show'}
          </button>
        </div>
        {def.keyUrl ? (
          <a className="aip-link" href={def.keyUrl} target="_blank" rel="noopener noreferrer">
            🔑 Get a key from {def.name} ↗
          </a>
        ) : null}
        <p className="aip-privacy">
          <span aria-hidden="true">🔒</span>{' '}
          {def.needsKey ? keyPrivacyNote(def) : `Only needed if you turned on authentication. ${keyPrivacyNote(def)}`}
        </p>
      </div>

      <details className="aip-steps" open={stepsOpen}>
        <summary>
          <span aria-hidden="true">📘</span> How to set up {def.name}
        </summary>
        <ol className="set-steps">
          {def.setupSteps.map((step) => (
            <li key={step}>{withCode(step)}</li>
          ))}
        </ol>
        {def.kind === 'local' && hosted && !proxied ? (
          <p className="aip-note">
            <span aria-hidden="true">🧭</span> This page is served over https, so your browser treats your computer as a separate
            network. Chrome and Edge ask once to let this site <b>access apps and devices on your local network</b>: choose{' '}
            <b>Allow</b>. Safari may block a secure page from reaching <span className="al-kbd">http://localhost</span> entirely; if the
            test keeps failing there, use Chrome, Edge or Firefox.
          </p>
        ) : null}
        {def.docsUrl ? (
          <a className="aip-link" href={def.docsUrl} target="_blank" rel="noopener noreferrer">
            {def.name} documentation ↗
          </a>
        ) : null}
      </details>

      <button type="button" className="al-btn block" onClick={onTest} disabled={testing}>
        {testing ? '⏳ Testing…' : '🔎 Test connection'}
      </button>
      {test.status === 'done' ? (
        <div className={`set-test-result ${test.ok ? 'ok' : 'fail'}`} role="status">
          {test.ok ? '✅ ' : '⚠️ '}
          {test.message || (test.ok ? `${def.name} is answering.` : 'Couldn’t connect.')}
        </div>
      ) : null}

      <div className="al-field">
        <label className="al-label" htmlFor={`${ids}-model`}>
          Model
        </label>
        {typingModel ? (
          <input
            id={`${ids}-model`}
            className="al-input"
            value={conn.model}
            placeholder={def.suggestedModels[0] ?? 'model-id'}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            onChange={(e) => onChange({ ...conn, model: e.target.value })}
            onBlur={commitText}
            onKeyDown={onEnter(commitText)}
          />
        ) : (
          <select
            id={`${ids}-model`}
            className="al-select"
            value={conn.model}
            onChange={(e) => commit({ ...conn, model: e.target.value })}
          >
            <option value="">{autoModelLabel(def)}</option>
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        )}
        <span className="al-muted al-small">
          {test.models.length > 0
            ? `${def.name} offers ${test.models.length === 1 ? '1 model' : `${test.models.length} models`}. Leave it on Auto or pick one.`
            : def.kind === 'local'
              ? `Test the connection to list ${def.name}’s models. Auto uses the one that’s loaded.`
              : 'Test the connection to list the models your key can use, or leave it on Auto.'}{' '}
          <button type="button" className="aip-linkbtn" onClick={() => setTypingModel((v) => !v)}>
            {typingModel ? 'Choose from the list' : 'Type a model id'}
          </button>
        </span>
      </div>
    </div>
  )
}
