// Shows the head of the modal queue above everything: notices, choices, inputs,
// minigames and the AI "thinking" card.
import { useEffect, useRef, useState } from 'react'
import { getPerson, personAvatar, relationLabel } from '../../game/core'
import type { ChoiceModal, GameState, InputModal, MinigameModal, ModalItem, NoticeModal, Tone } from '../../game/types'
import { MINIGAMES } from '../minigames'
import {
  chooseOption,
  dismissNotice,
  finishMinigame,
  getApp,
  processQueue,
  skipAi,
  submitInput,
  useApp,
} from '../store'
import type { AiLevel } from '../../settings'
import { InputField, moneyDefault, normalizeInput, PopupFrame, rangeHint, validateInput } from './Dialogs'
import { personName } from './PersonSheet'
import { cleanHint, TalentHint } from './TalentHint'

const TONE_EMOJI: Partial<Record<Tone, string>> = {
  good: '😄',
  bad: '😟',
  event: '📣',
  ai: '✨',
}

/** Seconds after which the Skip button appears on the thinking card. */
const SKIP_AFTER = 3

/** Mirrors the store: will this notice be rewritten by the AI before it is shown? */
function narrationWanted(m: NoticeModal, level: AiLevel): boolean {
  if (!m.ai) return false
  return level === 'full' || (level === 'balanced' && m.ai.when === 'balanced')
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'SELECT' || target.isContentEditable
}

export function ModalHost() {
  const head = useApp((s) => s.game?.queue[0] ?? null)
  const game = useApp((s) => s.game)
  const ai = useApp((s) => s.ai)
  const aiLevel = useApp((s) => s.settings.aiLevel)
  const aiForHead = ai !== null && head !== null && ai.modalId === head.id

  const thinking =
    head !== null && (head.kind === 'aiTask' || (head.kind === 'notice' && (aiForHead || narrationWanted(head, aiLevel))))

  // Make sure AI work at the head of the queue is running (e.g. right after loading a save).
  useEffect(() => {
    if (!thinking || aiForHead) return
    const t = setTimeout(() => processQueue(), 60)
    return () => clearTimeout(t)
  }, [thinking, aiForHead, head?.id])

  if (!head || !game) return null

  if (thinking) return <ThinkingCard key={head.id} modal={head} />

  switch (head.kind) {
    case 'notice':
      return <NoticeCard key={head.id} modal={head} />
    case 'choice':
      return <ChoiceCard key={head.id} modal={head} g={game} />
    case 'input':
      return <InputCard key={head.id} modal={head} />
    case 'minigame':
      return <MinigameCard key={head.id} modal={head} />
    default:
      return null
  }
}

// ---------------------------------------------------------------------------

function NoticeCard({ modal }: { modal: NoticeModal }) {
  const emoji = modal.emoji ?? (modal.tone ? TONE_EMOJI[modal.tone] : undefined)
  const toneClass = modal.tone === 'good' ? 'tone-good' : modal.tone === 'bad' ? 'tone-bad' : ''

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat || isTyping(e.target)) return
      e.preventDefault()
      dismissNotice(modal.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modal.id])

  return (
    <PopupFrame className={toneClass} label={modal.title}>
      {emoji ? (
        <span className="popup-emoji" aria-hidden>
          {emoji}
        </span>
      ) : null}
      <h2 className="popup-title">{modal.title}</h2>
      <p className="popup-text">{modal.text}</p>
      <div className="popup-actions">
        <button className="btn btn-primary btn-block" onClick={() => dismissNotice(modal.id)} autoFocus>
          OK
        </button>
      </div>
    </PopupFrame>
  )
}

export function ChoiceCard({ modal, g }: { modal: ChoiceModal; g: GameState }) {
  const showBadges = useApp((s) => s.settings.showAiBadges)
  const person = getPerson(g, modal.personId)
  const fromAi = modal.source === 'ai'

  // Desktop shortcut: number keys pick a choice (1 = first).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return
      const n = Number(e.key)
      if (!Number.isInteger(n) || n < 1 || n > modal.choices.length) return
      e.preventDefault()
      chooseOption(modal.id, modal.choices[n - 1].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modal.id, modal.choices])
  return (
    <PopupFrame label={modal.title}>
      {modal.emoji ? (
        <span className="popup-emoji" aria-hidden>
          {modal.emoji}
        </span>
      ) : null}
      <h2 className="popup-title">{modal.title}</h2>
      {fromAi && showBadges ? (
        <div className="popup-tag">
          <span className="pill">✨ AI event</span>
        </div>
      ) : null}
      {person ? (
        <div className="popup-person">
          <span className="popup-person-avatar" aria-hidden>
            {personAvatar(person)}
          </span>
          {personName(person)} · {relationLabel(person)}
        </div>
      ) : null}
      <p className="popup-text">{modal.text}</p>
      <div className="popup-actions">
        {modal.choices.map((c) => {
          const hint = cleanHint(c.hint)
          return (
            <button
              key={c.id}
              className={hint ? 'btn btn-primary btn-block popup-choice has-hint' : 'btn btn-primary btn-block popup-choice'}
              onClick={() => chooseOption(modal.id, c.id)}
            >
              {c.emoji ? (
                <span className="popup-choice-emoji" aria-hidden>
                  {c.emoji}
                </span>
              ) : null}
              <span className="popup-choice-text">
                <span className="popup-choice-label">{c.label}</span>
                {hint ? <TalentHint text={hint} className="popup-choice-hint" /> : null}
              </span>
              {fromAi && showBadges ? (
                <span className="popup-choice-ai" aria-hidden>
                  ✨
                </span>
              ) : null}
            </button>
          )
        })}
        {modal.choices.length === 0 ? (
          // A malformed event with no options must still be dismissible.
          <button className="btn btn-primary btn-block" onClick={() => chooseOption(modal.id, 'ok')}>
            OK
          </button>
        ) : null}
      </div>
    </PopupFrame>
  )
}

function InputCard({ modal }: { modal: InputModal }) {
  const money = modal.money === true && modal.input === 'number'
  const [value, setValue] = useState(() => money ? moneyDefault(modal.defaultValue) : (modal.defaultValue ?? ''))
  const [error, setError] = useState<string | null>(null)
  const submit = () => {
    const err = validateInput(modal.input, value, modal.min, modal.max, money)
    if (err) {
      setError(err)
      return
    }
    submitInput(modal.id, normalizeInput(modal.input, value, money, modal.min, modal.max))
  }
  const hint = rangeHint(modal.input, modal.min, modal.max, money)
  return (
    <PopupFrame label={modal.title}>
      {modal.emoji ? (
        <span className="popup-emoji" aria-hidden>
          {modal.emoji}
        </span>
      ) : null}
      <h2 className="popup-title">{modal.title}</h2>
      {modal.text ? <p className="popup-text">{modal.text}</p> : null}
      <div className="popup-field">
        <InputField
          kind={modal.input}
          value={value}
          placeholder={money ? moneyDefault(modal.placeholder) : modal.placeholder}
          money={money}
          label={modal.title}
          onChange={(v) => {
            setValue(v)
            if (error) setError(null)
          }}
          onSubmit={submit}
        />
        {error ? <span className="popup-error">{error}</span> : hint ? <span className="popup-hint">{hint}</span> : null}
      </div>
      <div className="popup-actions">
        <button className="btn btn-primary btn-block" onClick={submit}>
          Done
        </button>
      </div>
    </PopupFrame>
  )
}

function MinigameCard({ modal }: { modal: MinigameModal }) {
  const Game = MINIGAMES[modal.game]
  const done = useRef(false)
  const onDone = (result: string) => {
    if (done.current) return
    done.current = true
    finishMinigame(modal.id, result)
  }
  return (
    <PopupFrame wide label={modal.title}>
      <h2 className="popup-title">{modal.title}</h2>
      {Game ? (
        <Game modal={modal} onDone={onDone} />
      ) : (
        <div className="stack center">
          <p className="popup-text">This game isn't available right now.</p>
          <button className="btn btn-primary btn-block" onClick={() => onDone('skip')}>
            Continue
          </button>
        </div>
      )}
    </PopupFrame>
  )
}

// ---------------------------------------------------------------------------

function useSecondsSince(startedAt: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [])
  return Math.max(0, Math.floor((now - startedAt) / 1000))
}

const FALLBACK_LABELS: Record<string, string> = {
  yearEvents: 'Living through the year…',
  resolveChoice: 'Seeing what happens…',
  customAction: 'Seeing what happens…',
  interview: 'Preparing your interview…',
  screenApplication: 'Reading your CV…',
  obituary: 'Writing your obituary…',
}

const SUBTITLES = [
  'Your AI is writing what happens next',
  'The AI is dreaming up your life',
  'Consulting the narrator',
]

function ThinkingCard({ modal }: { modal: ModalItem }) {
  const ai = useApp((s) => s.ai)
  const model = useApp((s) => s.settings.model)
  const active = ai !== null && ai.modalId === modal.id
  // Count from when this card appeared if the task hasn't started yet.
  const [mountedAt] = useState(() => Date.now())
  const seconds = useSecondsSince(active ? ai.startedAt : mountedAt)
  // A notice being rewritten shows its own title ("Small talk…"); AI tasks show what's happening.
  const label =
    modal.kind === 'notice'
      ? `${modal.title}…`
      : active
        ? ai.label
        : modal.kind === 'aiTask'
          ? (FALLBACK_LABELS[modal.task.type] ?? 'Thinking…')
          : 'Thinking…'
  const [randomSub] = useState(() => SUBTITLES[Math.floor(Math.random() * SUBTITLES.length)])
  const sub = modal.kind === 'notice' ? 'Your AI is telling it in its own words' : randomSub
  const orb = modal.kind === 'notice' && modal.emoji ? modal.emoji : '✨'

  const skip = () => {
    if (getApp().ai?.modalId === modal.id) skipAi()
    else processQueue()
  }

  return (
    <PopupFrame label={label}>
      <div className="thinking" aria-live="polite">
        <div className="thinking-orb" aria-hidden>
          {orb}
        </div>
        <div className="thinking-label">{label}</div>
        <div className="thinking-sub">
          {sub}
          {model ? ` (${model})` : ''}
          <span className="thinking-dots" aria-hidden>
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        </div>
        <div className="thinking-elapsed">{seconds}s</div>
        <div className="thinking-skip-slot">
          {seconds >= SKIP_AFTER ? (
            <button className="btn btn-small thinking-skip" onClick={skip}>
              Skip (use offline story)
            </button>
          ) : null}
        </div>
      </div>
    </PopupFrame>
  )
}
