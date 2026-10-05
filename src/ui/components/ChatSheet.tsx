// Free-form AI chat with someone in your life. The local model plays the person (using their
// traits, history and relationship); each exchange nudges the relationship bar. Limited to
// CHAT_LIMIT messages per person per year so it stays game-like.
import { useEffect, useRef, useState } from 'react'
import { chatReply, type ChatTurn } from '../../ai/director'
import {
  addRelationship,
  count,
  getPerson,
  log,
  personAvatar,
  pronouns,
  relationLabel,
  useYearAction,
  yearActionsUsed,
} from '../../game/core'
import { notePerson } from '../../game/people'
import { pick } from '../../game/rng'
import type { GameState, Person, RelationKind, Tone } from '../../game/types'
import { act, checkAi, getApp, goTo, updateSettings, useApp } from '../store'
import '../styles/screens.css'
import { Sheet } from './Sheet'
import { StatBar } from './StatBar'

export const CHAT_LIMIT = 12
export const CHAT_MAX_LENGTH = 300
export const QUICK_REPLIES = ['How are you?', 'I love you', 'Can I borrow money?', "You're annoying"]

export function chatKey(personId: string): string {
  return `chat:${personId}`
}

/** People you can still reach from a prison phone. */
const PRISON_REACHABLE: RelationKind[] = [
  'parent',
  'stepparent',
  'sibling',
  'halfSibling',
  'stepsibling',
  'grandparent',
  'child',
  'stepchild',
  'grandchild',
  'partner',
  'fiance',
  'spouse',
  'lover',
  'bestFriend',
  'cellmate',
]

/** Why the player can't chat with this person right now, or null if they can. */
export function chatBlockReason(g: GameState, personId: string): string | null {
  const c = g.character
  if (!c.alive) return 'You’re dead. The afterlife has terrible reception.'
  const p = getPerson(g, personId)
  if (!p) return 'This person is no longer part of your life.'
  if (!p.alive) return `${p.firstName} has passed away. You can only talk to ${pronouns(p.gender).him} in your memories now.`
  if (c.age < 4) return 'You’re too young to hold a conversation. Try again when your vocabulary is bigger than “ba-ba”.'
  if (p.relation !== 'pet' && p.age < 3) return `${p.firstName} is too young to talk back. Give ${pronouns(p.gender).him} a few years.`
  if (c.prison && !PRISON_REACHABLE.includes(p.relation)) return `You can’t reach ${p.firstName} from prison. Only family, partners and cellmates take your calls.`
  if (yearActionsUsed(g, chatKey(personId)) >= CHAT_LIMIT)
    return `You’ve talked ${p.firstName}’s ear off this year. Age up to chat again.`
  return null
}

function clampDelta(delta: number): number {
  if (!Number.isFinite(delta)) return 0
  return Math.max(-15, Math.min(10, Math.round(delta)))
}

function shorten(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

/**
 * Apply one finished chat exchange to the game: uses one of this year's chat messages,
 * moves the relationship bar, counts the conversation and (once a year per person, or on a
 * big swing) leaves a life-log line and a note the AI will remember. Returns the applied delta.
 */
export function applyChatExchange(g: GameState, personId: string, message: string, reply: string, delta: number): number {
  const p = getPerson(g, personId)
  if (!p || !p.alive || !g.character.alive) return 0
  if (!useYearAction(g, chatKey(personId), CHAT_LIMIT)) return 0
  const d = clampDelta(delta)
  if (d !== 0) addRelationship(p, d)
  count(g, 'conversations')

  const firstThisYear = useYearAction(g, `chatlog:${personId}`, 1)
  if (firstThisYear) {
    const tone: Tone = d >= 3 ? 'good' : d <= -3 ? 'bad' : 'neutral'
    log(g, chatLogLine(g, p, d), tone)
  }
  if (firstThisYear || Math.abs(d) >= 4) {
    const mood = d >= 4 ? 'it went great' : d <= -4 ? 'it went badly' : d > 0 ? 'it went well' : d < 0 ? 'it got tense' : 'small talk'
    notePerson(p, `Age ${g.character.age}: chatted, I said "${shorten(message, 50)}", they said "${shorten(reply, 50)}" (${mood}).`)
  }
  return d
}

function chatLogLine(g: GameState, p: Person, d: number): string {
  if (p.relation === 'pet') {
    const species = (p.species ?? 'pet').toLowerCase()
    return pick(g, [
      `I had a heart-to-heart with my ${species}, ${p.firstName}.`,
      `I told my ${species} ${p.firstName} all my secrets.`,
      `I talked to ${p.firstName} for an hour. My ${species} listened better than most people.`,
    ])
  }
  const rel = relationLabel(p).toLowerCase()
  if (d >= 4) {
    return pick(g, [
      `I had a wonderful talk with my ${rel}, ${p.firstName}.`,
      `${p.firstName} and I had a great conversation.`,
      `I caught up with my ${rel} ${p.firstName} and it made my day.`,
    ])
  }
  if (d <= -4) {
    return pick(g, [
      `My conversation with ${p.firstName} went off the rails.`,
      `I said the wrong thing to my ${rel}, ${p.firstName}.`,
      `${p.firstName} and I ended our chat on a sour note.`,
    ])
  }
  return pick(g, [
    `I had a chat with my ${rel}, ${p.firstName}.`,
    `I caught up with ${p.firstName}.`,
    `I talked with my ${rel} ${p.firstName} for a while.`,
  ])
}

/** Tidy the model's reply: trim, drop wrapping quotes, cap the length. */
export function cleanReply(reply: unknown): string {
  let t = typeof reply === 'string' ? reply.trim() : ''
  if (t.length >= 2 && /^["“]/.test(t) && /["”]$/.test(t)) t = t.slice(1, -1).trim()
  if (t.length > 700) t = `${t.slice(0, 699)}…`
  return t || '…'
}

// ---------------------------------------------------------------------------
// Conversation memory for this browser session (not part of the save).

interface Bubble {
  id: number
  from: 'player' | 'npc' | 'delta'
  text: string
  failed?: boolean
  delta?: number
}

const memory = new Map<string, Bubble[]>()
let nextBubbleId = 1

function toHistory(bubbles: Bubble[]): ChatTurn[] {
  const turns: ChatTurn[] = []
  for (const b of bubbles) {
    if (b.failed || b.from === 'delta') continue
    turns.push({ from: b.from, text: b.text })
  }
  return turns.slice(-16)
}

// ---------------------------------------------------------------------------
// The sheet

export interface ChatSheetProps {
  personId: string
  onClose: () => void
}

export function ChatSheet({ personId, onClose }: ChatSheetProps) {
  const game = useApp((s) => s.game)
  const aiLevel = useApp((s) => s.settings.aiLevel)
  const memKey = `${game?.lifeId ?? 'none'}:${personId}`
  const [bubbles, setBubbles] = useState<Bubble[]>(() => memory.get(memKey) ?? [])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const controller = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      controller.current?.abort()
      controller.current = null
    }
  }, [])

  useEffect(() => {
    memory.set(memKey, bubbles.slice(-40))
  }, [memKey, bubbles])

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end', behavior: 'smooth' })
  }, [bubbles, busy])

  const person = game ? getPerson(game, personId) : undefined
  if (!game || !person) {
    return (
      <Sheet title="Chat" emoji="💬" onClose={onClose}>
        <div className="chat-blocked">
          <p className="al-muted">This person is no longer part of your life.</p>
          <button type="button" className="al-btn" onClick={onClose}>
            OK
          </button>
        </div>
      </Sheet>
    )
  }

  const blocked = chatBlockReason(game, personId)
  const used = yearActionsUsed(game, chatKey(personId))
  const left = Math.max(0, CHAT_LIMIT - used)
  const aiOff = aiLevel === 'off'
  const canSend = !aiOff && !blocked && !busy
  const failed = bubbles.find((b) => b.failed)
  const pr = pronouns(person.gender)

  const request = async (g: GameState, history: ChatTurn[], text: string, bubbleId: number) => {
    controller.current?.abort()
    const ctrl = new AbortController()
    controller.current = ctrl
    const settings = getApp().settings
    const timer = setTimeout(() => ctrl.abort(), Math.max(5, settings.timeoutSec) * 1000)
    setBusy(true)
    setError(null)
    try {
      const res = await chatReply(g, personId, history, text, settings, ctrl.signal)
      if (!mounted.current || controller.current !== ctrl) return
      const reply = cleanReply(res?.reply)
      let applied = 0
      act((draftGame) => {
        applied = applyChatExchange(draftGame, personId, text, reply, Number(res?.relationshipDelta ?? 0))
      })
      setBubbles((prev) => {
        const next: Bubble[] = [...prev, { id: nextBubbleId++, from: 'npc', text: reply }]
        if (applied !== 0) next.push({ id: nextBubbleId++, from: 'delta', text: '', delta: applied })
        return next
      })
    } catch (err) {
      if (!mounted.current || controller.current !== ctrl) return
      const msg = ctrl.signal.aborted
        ? `${person.firstName} got distracted and never answered (the AI timed out).`
        : `Couldn’t reach your AI: ${err instanceof Error ? err.message : String(err)}`
      setError(msg)
      setBubbles((prev) => prev.map((b) => (b.id === bubbleId ? { ...b, failed: true } : b)))
    } finally {
      clearTimeout(timer)
      if (mounted.current && controller.current === ctrl) {
        controller.current = null
        setBusy(false)
      }
    }
  }

  const send = (raw: string) => {
    const text = raw.replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_LENGTH)
    const g = getApp().game
    if (!text || busy || aiOff || !g || chatBlockReason(g, personId)) return
    // Starting a new message abandons a failed one.
    const kept = bubbles.filter((b) => !b.failed)
    const bubble: Bubble = { id: nextBubbleId++, from: 'player', text }
    setBubbles([...kept, bubble])
    setDraft('')
    void request(g, toHistory(kept), text, bubble.id)
  }

  const retry = () => {
    const g = getApp().game
    if (!failed || busy || !g || chatBlockReason(g, personId)) return
    const before = bubbles.filter((b) => b.id !== failed.id)
    setBubbles(bubbles.map((b) => (b.id === failed.id ? { ...b, failed: false } : b)))
    void request(g, toHistory(before), failed.text, failed.id)
  }

  const intro =
    person.relation === 'pet'
      ? `${person.firstName} tilts ${pr.his} head and waits for you to say something.`
      : `Say anything to your ${relationLabel(person).toLowerCase()}. ${person.firstName}’s replies are written live by your AI.`

  const footer = aiOff ? null : blocked ? (
    <p className="al-muted al-small" style={{ margin: 0, textAlign: 'center', width: '100%' }}>
      {blocked}
    </p>
  ) : (
    <div className="chat-footer">
      <div className="chat-chips" aria-label="Quick replies">
        {QUICK_REPLIES.map((q) => (
          <button key={q} type="button" className="chat-chip" disabled={!canSend} onClick={() => send(q)}>
            {q}
          </button>
        ))}
      </div>
      <form
        className="chat-input-row"
        onSubmit={(e) => {
          e.preventDefault()
          send(draft)
        }}
      >
        <input
          className="al-input"
          value={draft}
          maxLength={CHAT_MAX_LENGTH}
          placeholder={`Message ${person.firstName}…`}
          aria-label={`Message ${person.firstName}`}
          onChange={(e) => setDraft(e.target.value)}
          disabled={!canSend && !busy}
        />
        <button type="submit" className="chat-send" disabled={!canSend || !draft.trim()} aria-label="Send">
          ➤
        </button>
      </form>
      <div className="chat-meta">
        <span>{busy ? `${person.firstName} is typing…` : ''}</span>
        <span>
          {left} {left === 1 ? 'message' : 'messages'} left this year
        </span>
      </div>
    </div>
  )

  return (
    <Sheet title={`${person.firstName} ${person.lastName}`.trim()} emoji={personAvatar(person)} onClose={onClose} footer={footer}>
      <div className="chat-head">
        <div className="chat-head-line">
          {relationLabel(person)} · Age {person.age}
          {person.relation !== 'pet' && person.occupation && person.occupation !== 'None' ? ` · ${person.occupation}` : ''}
          {person.traits.length > 0 ? ` · ${person.traits.slice(0, 3).join(', ')}` : ''}
        </div>
        <StatBar label="Relationship" emoji="❤️" value={person.relationship} small />
      </div>

      {aiOff ? (
        <div className="chat-blocked">
          <span className="chat-intro-emoji" aria-hidden="true">
            💬
          </span>
          <p>
            <b>Live chat needs the AI narrator.</b>
          </p>
          <p className="al-muted al-small">
            Turn on AI narration and connect LM Studio to talk freely with {person.firstName}. You can still use the regular
            interactions in the meantime.
          </p>
          <div className="al-ai-actions" style={{ justifyContent: 'center' }}>
            <button
              type="button"
              className="al-btn green"
              onClick={() => {
                updateSettings({ aiLevel: 'balanced' })
                void checkAi()
              }}
            >
              ✨ Turn on AI
            </button>
            <button
              type="button"
              className="al-btn ghost"
              onClick={() => {
                onClose()
                goTo('settings')
              }}
            >
              Settings
            </button>
          </div>
        </div>
      ) : (
        <div className="chat-log" aria-live="polite">
          {bubbles.length === 0 && !busy ? (
            <div className="chat-intro">
              <span className="chat-intro-emoji" aria-hidden="true">
                {personAvatar(person)}
              </span>
              {blocked ?? intro}
            </div>
          ) : null}
          {bubbles.map((b) =>
            b.from === 'delta' ? (
              <span key={b.id} className={`chat-delta ${(b.delta ?? 0) > 0 ? 'up' : 'down'}`}>
                {(b.delta ?? 0) > 0 ? `❤️ Relationship +${b.delta}` : `💔 Relationship ${b.delta}`}
              </span>
            ) : b.from === 'player' ? (
              <div key={b.id} className={`chat-row me ${b.failed ? 'failed' : ''}`}>
                <div className="chat-bubble">{b.text}</div>
              </div>
            ) : (
              <div key={b.id} className="chat-row them">
                <span className="chat-avatar" aria-hidden="true">
                  {personAvatar(person)}
                </span>
                <div className="chat-bubble">{b.text}</div>
              </div>
            ),
          )}
          {busy ? (
            <div className="chat-row them">
              <span className="chat-avatar" aria-hidden="true">
                {personAvatar(person)}
              </span>
              <div className="chat-bubble chat-typing" aria-label={`${person.firstName} is typing`}>
                <i />
                <i />
                <i />
              </div>
            </div>
          ) : null}
          {error && failed ? (
            <div className="chat-failed-note" role="alert">
              <span>⚠️ {error}</span>
              <button type="button" className="al-btn small" onClick={retry} disabled={busy || !!blocked}>
                ↻ Retry
              </button>
            </div>
          ) : null}
          <div ref={endRef} />
        </div>
      )}
    </Sheet>
  )
}

export default ChatSheet
