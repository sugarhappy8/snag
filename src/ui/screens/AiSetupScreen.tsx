// First-run "Choose your AI" screen (also reachable from Settings and the home AI card).
// Welcome → local or cloud → pick a provider → configure (URL, key, test, model) → play.
// Nothing is saved until "Start playing" / "Save anyway" / "Play without AI".
import { useRef, useState } from 'react'
import { getProvider, type ProviderKind } from '../../ai/providers'
import { aiConfigProblem, type ProviderId } from '../../settings'
import {
  connectionFor,
  KIND_LABELS,
  ProviderCards,
  ProviderConfigForm,
  providersOfKind,
  useConnectionTest,
} from '../components/AiProviderForm'
import { closeAiSetup, finishAiSetup, getApp, settingsWithConnection, useApp, type AiConnection } from '../store'
import '../styles/screens.css'
import { ScreenHeader } from './SettingsScreen'

type Step = { at: 'welcome' } | { at: 'pick'; kind: ProviderKind } | { at: 'configure'; kind: ProviderKind }

const AI_WRITES: { emoji: string; text: string }[] = [
  { emoji: '📅', text: 'Every year’s events' },
  { emoji: '🎭', text: 'What happens after your choices' },
  { emoji: '💬', text: 'Conversations & job interviews' },
  { emoji: '🪦', text: 'Your obituary' },
]

const KIND_INTRO: Record<ProviderKind, string> = {
  local:
    'Free and private: a model runs on your own computer and this page talks straight to it. Needs a decent graphics card or an Apple Silicon Mac. Pick the app you use (or want to use):',
  cloud:
    'Works on any device, including phones. Paste an API key from the provider; they bill you directly (some have free tiers). Pick a provider:',
}

export function AiSetupScreen() {
  const setupDone = useApp((s) => s.settings.setupDone)
  const currentProvider = useApp((s) => s.settings.provider)
  const [step, setStep] = useState<Step>({ at: 'welcome' })
  const [conn, setConn] = useState<AiConnection | null>(null)
  const latest = useRef<AiConnection | null>(null)
  const [test, runTest, resetTest] = useConnectionTest()

  const edit = (next: AiConnection) => {
    latest.current = next
    setConn(next)
  }

  const pickProvider = (id: ProviderId, kind: ProviderKind) => {
    resetTest()
    edit(connectionFor(getApp().settings, id))
    setStep({ at: 'configure', kind })
  }

  const onTest = () => {
    const c = latest.current
    if (c) void runTest(settingsWithConnection(getApp().settings, c))
  }

  const finish = () => {
    const c = latest.current
    if (c) finishAiSetup(c)
  }

  // --- Welcome --------------------------------------------------------------
  if (step.at === 'welcome') {
    return (
      <div className="al-screen aisetup">
        <header className="aisetup-hero">
          {setupDone ? (
            <button type="button" className="al-back aisetup-close" onClick={closeAiSetup} aria-label="Back">
              ‹
            </button>
          ) : null}
          <div className="aisetup-logo" aria-hidden="true">
            🧬
          </div>
          <h1 className="aisetup-title">Choose your AI</h1>
          <p className="aisetup-tagline">
            AnotherLife is narrated by an AI that <b>you</b> bring. It writes your life as you live it:
          </p>
          <ul className="aisetup-writes">
            {AI_WRITES.map((w) => (
              <li key={w.text}>
                <span aria-hidden="true">{w.emoji}</span> {w.text}
              </li>
            ))}
          </ul>
        </header>

        <nav className="aisetup-choices" aria-label="Choose your AI">
          <button type="button" className="al-bigbtn" onClick={() => setStep({ at: 'pick', kind: 'local' })}>
            <span className="al-bigbtn-emoji" aria-hidden="true">
              🖥️
            </span>
            <span className="al-bigbtn-text">
              <span>AI on my computer</span>
              <span className="al-bigbtn-sub">Free &amp; private · LM Studio, Ollama, llama.cpp, Jan…</span>
            </span>
            <span className="al-bigbtn-chevron" aria-hidden="true">
              ›
            </span>
          </button>
          <button type="button" className="al-bigbtn green" onClick={() => setStep({ at: 'pick', kind: 'cloud' })}>
            <span className="al-bigbtn-emoji" aria-hidden="true">
              🔑
            </span>
            <span className="al-bigbtn-text">
              <span>AI service with my own API key</span>
              <span className="al-bigbtn-sub">Claude, OpenAI, Gemini, OpenRouter, Groq… · works on phones</span>
            </span>
            <span className="al-bigbtn-chevron" aria-hidden="true">
              ›
            </span>
          </button>
          <button type="button" className="al-bigbtn light" onClick={() => finishAiSetup(null)}>
            <span className="al-bigbtn-emoji" aria-hidden="true">
              🎲
            </span>
            <span className="al-bigbtn-text">
              <span>Play without AI</span>
              <span className="al-bigbtn-sub">Built-in stories, works offline</span>
            </span>
            <span className="al-bigbtn-chevron" aria-hidden="true">
              ›
            </span>
          </button>
        </nav>

        <p className="home-footer">
          You can change this any time in ⚙️ Settings. Your choice and any API key stay in this browser; there is no AnotherLife server.
        </p>
      </div>
    )
  }

  // --- Pick a provider --------------------------------------------------------
  if (step.at === 'pick' || !conn) {
    const kind = step.kind
    const other: ProviderKind = kind === 'local' ? 'cloud' : 'local'
    return (
      <div className="al-screen aisetup">
        <ScreenHeader title={KIND_LABELS[kind].header} emoji={KIND_LABELS[kind].emoji} onBack={() => setStep({ at: 'welcome' })} />
        <p className="aisetup-intro">{KIND_INTRO[kind]}</p>
        <ProviderCards providers={providersOfKind(kind)} onPick={(id) => pickProvider(id, kind)} />
        <button type="button" className="al-btn ghost block" onClick={() => setStep({ at: 'pick', kind: other })}>
          {KIND_LABELS[other].emoji} {other === 'cloud' ? 'Use an AI service with an API key instead' : 'Use an AI on my computer instead'}
        </button>
      </div>
    )
  }

  // --- Configure --------------------------------------------------------------
  const def = getProvider(conn.provider)
  const missing = aiConfigProblem(settingsWithConnection(getApp().settings, conn)) !== ''
  const failed = test.status === 'done' && !test.ok
  const shaky = failed || missing
  return (
    <div className="al-screen aisetup">
      <ScreenHeader title={def.name} emoji={def.emoji} onBack={() => setStep({ at: 'pick', kind: step.kind })} />
      <p className="aisetup-intro">
        {def.blurb}
        {currentProvider === def.id && setupDone ? ' (your current AI)' : ''}
      </p>

      <section className="al-card set-section">
        <ProviderConfigForm conn={conn} onChange={edit} test={test} onTest={onTest} stepsOpen />
      </section>

      <div className="aisetup-actions">
        {shaky ? (
          <p className="aisetup-warn">
            {missing && def.needsKey && !conn.apiKey.trim()
              ? `${def.name} needs an API key to work.`
              : `${def.name} isn’t answering yet.`}{' '}
            You can save it anyway and fix it later in ⚙️ Settings; the built-in stories fill in until the AI answers.
          </p>
        ) : null}
        <button type="button" className={`al-bigbtn ${shaky ? 'light' : 'green'} aisetup-go`} onClick={finish}>
          <span className="al-bigbtn-emoji" aria-hidden="true">
            {shaky ? '💾' : '▶️'}
          </span>
          <span className="al-bigbtn-text">
            <span>{shaky ? 'Save anyway' : 'Start playing'}</span>
            <span className="al-bigbtn-sub">
              {test.ok ? `Use ${def.name}` : shaky ? `Keep ${def.name} and play` : `Use ${def.name} (tip: test it first)`}
            </span>
          </span>
          <span className="al-bigbtn-chevron" aria-hidden="true">
            ›
          </span>
        </button>
        <button type="button" className="al-btn ghost block" onClick={() => setStep({ at: 'pick', kind: step.kind })}>
          ‹ Choose a different AI
        </button>
      </div>
    </div>
  )
}

export default AiSetupScreen
