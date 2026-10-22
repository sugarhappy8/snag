// Shows the head of the modal queue above everything: notices, choices, inputs and minigames.
// Built-in tasks ('aiTask' modals) are never shown: the store resolves them on the spot.
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { reportDataNow } from '../../game/business/yearly'
import { companyStrip } from '../../game/charts/books'
import { getPerson, personAvatar, relationLabel } from '../../game/core'
import { FLAGS, flagOn } from '../../game/flags'
import type { ChoiceModal, GameState, InputModal, MinigameModal, NoticeModal, Tone } from '../../game/types'
import { LazyYearEndDesk } from '../charts/lazy'
import { MINIGAMES } from '../minigames'
import { isBook } from '../minigames/bookModel'
import { deskPosition, nextBatch, remainingIn, reportsIn, shouldShowDesk, type DeskBatch } from '../minigames/yearEnd'
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
import { focusWithoutScroll } from './focusWithoutScroll'
import { digestRows, digestTitle, digestTone, planHead } from './noticeModel'
import { YearCardPopup } from './YearCard'
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

// Moved to its own file (R3-Q6) so the year card can share it; still exported from here for the callers that import it.
export { focusWithoutScroll }

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

  // The Year-End Desk (R1-C12) keeps its place in the batch here and not in MinigameCard: that card is keyed by the head's id,
  // so it is built again for every report and would forget how many there were. nextBatch is idempotent for one queue, so a
  // render that runs twice is harmless, and nothing goes in the store. Behind annualReport2 it stays null.
  const deskBatch = useRef<DeskBatch | null>(null)
  deskBatch.current = flagOn('annualReport2') ? nextBatch(deskBatch.current, game ? reportsIn(game.queue) : []) : null

  // A run of plain notices at the head shares one card (G.11 step 1, behind FLAGS.noticeDigest). Every other plan,
  // the lone notice, a choice, an input, a minigame, falls through to the code below, which is today's.
  const plan = game ? planHead(game.queue, FLAGS.noticeDigest) : null
  // The year card (R3-Q6) is a notice that carries a card; it stands alone, ahead of the digest check, and is drawn
  // whatever the digest setting says. A card that can't be read never gets this plan: it is a plain notice below.
  if (plan?.kind === 'yearCard') return <YearCardPopup key={plan.modal.id} modal={plan.modal} />
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
      return <MinigameCard key={head.id} modal={head} batch={deskBatch.current} />
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

/**
 * One card for a run of plain notices: every row in full, one OK for all. A row's tone is never colour alone: it is the
 * row emoji, or a small tone glyph beside the notice's own emoji, and the words for a screen reader.
 */
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
            {r.toneLabel ? <span className="sr-only">{r.toneLabel}: </span> : null}
            <span className="digest-emoji" aria-hidden>
              {r.emoji}
            </span>
            {r.mark ? (
              <span className="digest-mark" aria-hidden>
                {r.mark}
              </span>
            ) : null}{' '}
            <strong className="digest-title">{r.title}</strong>
            <span className="digest-text">{r.text}</span>
          </li>
        ))}
      </ul>
      <div className="popup-actions">
        {/* Focused without scrolling: a tall digest must open at its title, with the first rows in view. */}
        <button ref={focusWithoutScroll} className="btn btn-primary btn-block" onClick={() => dismissNotices(ids)}>
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

export function MinigameCard({ modal: queued, batch = null }: { modal: MinigameModal; batch?: DeskBatch | null }) {
  const Game = MINIGAMES[queued.game]
  const done = useRef(false)
  const onDone = (result: string) => {
    if (done.current) return
    done.current = true
    finishMinigame(queued.id, result)
  }

  // The company strip and the Year-End Desk (R1-C12): the annual report only, and only behind annualReport2. companyStrip and
  // reportsIn read the game and write nothing; the memos keep them from running again until the game changes.
  const game = useApp((s) => s.game)
  const isReport = queued.game === 'annualReport'
  // The report was written when the year closed and the queue is saved, but the card draws its numbers now, in the prices
  // the player reads now. Its sentences (verdict, notes, market note, statement) are written again here from the books, so
  // no figure on the card is in other prices than its chip names. Nothing queued or saved changes; reportDataNow hands the
  // data back as it was when it cannot write it again.
  const modal = useMemo(() => {
    if (!isReport || !game) return queued
    const data = reportDataNow(game, queued.data)
    return data === queued.data ? queued : { ...queued, data }
  }, [isReport, game, queued])
  const on = isReport && flagOn('annualReport2')
  const strip = useMemo(() => (on && game ? companyStrip(game) : undefined), [on, game])
  const reports = useMemo(() => (isReport && game ? reportsIn(game.queue) : []), [isReport, game])
  const position = on ? deskPosition(batch, remainingIn(batch, reports)) : null
  // Keep every plan: 'skip' for each queued report through the same finishMinigame the card uses, and nothing else, so no
  // plan logic is touched. The card has done its one job after this, so a second tap or a later Done does nothing.
  const keepAll = () => {
    if (done.current) return
    done.current = true
    for (const r of reports) finishMinigame(r.id, 'skip')
  }

  const body = Game ? (
    <Game modal={modal} onDone={onDone} strip={strip} />
  ) : (
    <div className="stack center">
      <p className="popup-text">This game isn't available right now.</p>
      <button className="btn btn-primary btn-block" onClick={() => onDone('skip')}>
        Continue
      </button>
    </div>
  )
  const data = modal.data
  const name = data !== null && typeof data === 'object' && !Array.isArray(data) && typeof data.businessName === 'string' ? data.businessName : ''
  return (
    <PopupFrame wide label={modal.title} className={modal.game === 'annualReport' && isBook(modal.data) ? 'is-report' : undefined}>
      <h2 className="popup-title">{modal.title}</h2>
      {/* Known limit: if the desk chunk lands after the player has started on this report, lazyView swaps its fallback for the
          desk and the report mounts again inside it, so unsaved edits on the card are lost. The idle prefetch normally loads the
          chunk first; it is skipped on Save-Data and 2g, and the desk is dormant in v4.0.2 play (one report a year). */}
      {position && shouldShowDesk(on, position) ? (
        <LazyYearEndDesk
          year={reports.find((r) => r.id === modal.id)?.year ?? null}
          position={position}
          strip={strip ?? []}
          currentName={name}
          onKeepAll={keepAll}
          fallback={body}
        >
          {body}
        </LazyYearEndDesk>
      ) : (
        body
      )}
    </PopupFrame>
  )
}
