// Shows the head of the modal queue above everything: notices, choices, inputs and minigames.
// Built-in tasks ('aiTask' modals) are never shown: the store resolves them on the spot.
import { useEffect, useRef, useState, type ReactElement } from 'react'
import { getPerson, personAvatar, relationLabel } from '../../game/core'
import { FLAGS } from '../../game/flags'
import type { ChoiceModal, GameState, InputModal, MinigameModal, NoticeModal, Tone } from '../../game/types'
import { MINIGAMES } from '../minigames'
import { isBook } from '../minigames/bookModel'
import {
  chooseOption,
  dismissNotice,
  dismissNotices,
  finishMinigame,
  processQueue,
  submitInput,
  useApp,
} from '../store'
import { InputField, moneyDefault, normalizeInput, PopupFrame, rangeHint, validateInput } from './Dialogs'
import { personName } from './PersonSheet'
import { cleanHint, TalentHint } from './TalentHint'
import { canSlide } from './menuModel'
import { SliderInputCard } from './SliderCard'
import { digestRows, digestTitle, digestTone, planHead } from './noticeModel'
import '../styles/notices.css'

const TONE_EMOJI: Partial<Record<Tone, string>> = {
  good: '😄',
  bad: '😟',
  event: '📣',
}

/** The real-world help line under a notice with `support` (the self-harm outcome). UI, not story. */
const SUPPORT_LINE = "If you're struggling in real life, talk to someone you trust or call a local crisis line."

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'SELECT' || target.isContentEditable
}

export function ModalHost() {
  const head = useApp((s) => s.game?.queue[0] ?? null)
  const game = useApp((s) => s.game)
  const taskAtHead = head !== null && head.kind === 'aiTask'

  // The store resolves built-in tasks as soon as they reach the head of the queue. Should one
  // ever be left there (a save loaded some other way), resolve it now. Idempotent: running twice
  // (StrictMode) finds the task already gone.
  useEffect(() => {
    if (taskAtHead) processQueue()
  }, [taskAtHead, head?.id])

  // A run of plain notices at the head shares one card (G.11 step 1, behind FLAGS.noticeDigest). Every other plan,
  // the lone notice, a choice, an input, a minigame, falls through to the code below, which is today's.
  const plan = game ? planHead(game.queue, FLAGS.noticeDigest) : null
  if (plan?.kind === 'digest') return <DigestCard key={plan.items.map((m) => m.id).join('+')} items={plan.items} />

  // Nothing to draw for a task: it's replaced by whatever it produces in the same moment.
  if (!head || !game || taskAtHead) return null

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

export function NoticeCard({ modal }: { modal: NoticeModal }) {
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
      {modal.support ? <p className="popup-support">{SUPPORT_LINE}</p> : null}
      <div className="popup-actions">
        <button className="btn btn-primary btn-block" onClick={() => dismissNotice(modal.id)} autoFocus>
          OK
        </button>
      </div>
    </PopupFrame>
  )
}

/** One card for a run of plain notices: every row in full, one OK for all. Tone is also in the row emoji, never colour alone. */
export function DigestCard({ items }: { items: readonly NoticeModal[] }): ReactElement {
  const rows = digestRows(items)
  const tone = digestTone(items)
  const toneClass = tone === 'bad' ? 'tone-bad' : tone === 'good' ? 'tone-good' : ''
  const title = digestTitle(items.length)
  const ids = items.map((m) => m.id)
  const idKey = ids.join('+')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat || isTyping(e.target)) return
      e.preventDefault()
      dismissNotices(ids)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // ids is derived from idKey, so the key is the only dependency
  }, [idKey])

  return (
    <PopupFrame className={toneClass} label={title}>
      <span className="popup-emoji" aria-hidden>
        {tone === 'bad' ? '😟' : '📋'}
      </span>
      <h2 className="popup-title">{title}</h2>
      <ul className="digest-list">
        {rows.map((r) => (
          <li key={r.id} className={`digest-item tone-${r.tone}`}>
            <span className="digest-emoji" aria-hidden>
              {r.emoji}
            </span>{' '}
            <strong className="digest-title">{r.title}</strong>
            <span className="digest-text">{r.text}</span>
          </li>
        ))}
      </ul>
      <div className="popup-actions">
        <button className="btn btn-primary btn-block" onClick={() => dismissNotices(ids)} autoFocus>
          OK
        </button>
      </div>
    </PopupFrame>
  )
}

export function ChoiceCard({ modal, g }: { modal: ChoiceModal; g: GameState }) {
  const person = getPerson(g, modal.personId)

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
  // A slider needs finite bounds; without them it falls back to a number field.
  if (modal.input === 'slider' && canSlide(modal.min, modal.max)) return <SliderInputCard modal={modal} />
  return <FieldInputCard modal={modal} />
}

function FieldInputCard({ modal }: { modal: InputModal }) {
  const kind = modal.input === 'slider' ? 'number' : modal.input
  const money = modal.money === true && kind === 'number'
  const [value, setValue] = useState(() => money ? moneyDefault(modal.defaultValue) : (modal.defaultValue ?? ''))
  const [error, setError] = useState<string | null>(null)
  const submit = () => {
    const err = validateInput(kind, value, modal.min, modal.max, money)
    if (err) {
      setError(err)
      return
    }
    submitInput(modal.id, normalizeInput(kind, value, money, modal.min, modal.max))
  }
  const hint = rangeHint(kind, modal.min, modal.max, money)
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
          kind={kind}
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
    <PopupFrame wide label={modal.title} className={modal.game === 'annualReport' && isBook(modal.data) ? 'is-report' : undefined}>
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
