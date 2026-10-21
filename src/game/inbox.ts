// The Quiet Mode inbox (R1-T5, G.11 step 2): where routine notices wait instead of popping up. It lives in
// g.flags.inbox, a short list of one-line rows with a running count of how many were ever added and how many the
// player has seen. The header bell (R1-N7) shows the unread count and the sheet (R1-T6) lists the rows.
//
// Every reader sanitizes what it reads and never writes, so a damaged or hostile saved inbox is bounded and valid on
// the way out; every writer sanitizes first, so it is repaired the first time anything is written. No row is made
// from a draw of the generator or a new id: a row reuses the id of the notice it came from.
//
// A leaf: only types and the notice policy, so any module may use it without joining an import cycle.
import { routesToInbox } from './notice-policy'
import type { GameState, ModalItem, NoticeModal } from './types'

/** Rows kept; older ones fall off the front. */
export const INBOX_MAX = 60
/** Characters in one row's text. */
export const INBOX_TEXT_MAX = 160
/** Characters in a row's link. */
export const INBOX_LINK_MAX = 80

const INBOX_ID_MAX = 24
const COUNT_MAX = 1e9
/** A reader looks at no more than this many of the newest stored rows, so a huge damaged list costs the same as a full one. */
const SCAN_MAX = INBOX_MAX * 4

/** One row. y is the game year, a the character's age, k the tone and l where the row leads (a place key). */
export type InboxItem = { id: string; y: number; a: number; t: string; k?: 'good' | 'neutral' | 'event'; l?: string }
export type InboxState = { v: 1; total: number; seen: number; items: InboxItem[] }

const LINK_RE = /^[a-z]+(?:\/[A-Za-z0-9._:-]{1,40}){0,6}$/

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function isInt(v: unknown, lo: number, hi: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi
}

function validLink(v: unknown): v is string {
  return typeof v === 'string' && v.length <= INBOX_LINK_MAX && LINK_RE.test(v)
}

/** A text without a trailing high surrogate: a cut between the two halves of a pair would leave one alone. */
function dropHalfPair(t: string): string {
  const last = t.charCodeAt(t.length - 1)
  return last >= 0xd800 && last <= 0xdbff ? t.slice(0, -1) : t
}

/** A text trimmed and cut to the row limit (never in the middle of a surrogate pair); '' when it is not a string. */
function cleanText(v: unknown): string {
  if (typeof v !== 'string') return ''
  let t = v.trim()
  if (t.length > INBOX_TEXT_MAX) t = dropHalfPair(t.slice(0, INBOX_TEXT_MAX)).trimEnd()
  return t
}

/** A copy of a row with every field checked, or null when it can't be a row. */
function cleanItem(raw: unknown): InboxItem | null {
  if (!isRecord(raw)) return null
  const { id, y, a, k, l } = raw
  if (typeof id !== 'string' || id.length < 1 || id.length > INBOX_ID_MAX) return null
  if (!isInt(y, 1000, 100000) || !isInt(a, 0, 10000)) return null
  const t = cleanText(raw.t)
  if (t === '') return null
  const row: InboxItem = { id, y, a, t }
  if (k === 'good' || k === 'neutral' || k === 'event') row.k = k
  if (validLink(l)) row.l = l
  return row
}

/** Whatever is stored, made into a valid inbox: rows checked, ids unique, the newest INBOX_MAX kept, the counts sane. */
function sanitize(raw: unknown): InboxState {
  const items: InboxItem[] = []
  let total = 0
  let seen = 0
  if (isRecord(raw)) {
    const list: unknown[] = Array.isArray(raw.items) ? raw.items : []
    const ids = new Set<string>()
    for (let i = Math.max(0, list.length - SCAN_MAX); i < list.length; i++) {
      const row = cleanItem(list[i])
      if (row === null || ids.has(row.id)) continue
      ids.add(row.id)
      items.push(row)
    }
    if (items.length > INBOX_MAX) items.splice(0, items.length - INBOX_MAX)
    total = isInt(raw.total, 0, COUNT_MAX) ? raw.total : 0
    seen = isInt(raw.seen, 0, COUNT_MAX) ? raw.seen : 0
  }
  total = Math.max(total, items.length)
  return { v: 1, total, seen: Math.min(seen, total), items }
}

/** The inbox of a game: a sanitized copy. Pure, and it never throws. */
export function readInbox(g: GameState): InboxState {
  return sanitize(g?.flags?.inbox)
}

/** How many rows the player hasn't seen: min(rows kept, max(0, total - seen)). Pure; 0 for no game. */
export function inboxUnread(g: GameState | null | undefined): number {
  const s = sanitize(g?.flags?.inbox)
  return Math.min(s.items.length, Math.max(0, s.total - s.seen))
}

/**
 * The row text for a notice: `${title}: ${text}` with white space collapsed. Over INBOX_TEXT_MAX it is cut at the last
 * space that leaves room for three dots (at a hard cut when that space is in the first half) and ends with '...'.
 */
export function clipInboxText(title: string, text: string): string {
  const s = `${title}: ${text}`.replace(/\s+/g, ' ').trim()
  if (s.length <= INBOX_TEXT_MAX) return s
  const room = INBOX_TEXT_MAX - 3
  const space = s.lastIndexOf(' ', room)
  // The hard cut can land between the two halves of an emoji; the cut at a space never does.
  const cut = space >= room / 2 ? s.slice(0, space) : dropHalfPair(s.slice(0, room))
  return `${cleanText(cut)}...`
}

/** The row for a notice. A bad notice never routes, so the kind is good, event or neutral. */
export function inboxItemOf(g: GameState, m: NoticeModal): InboxItem {
  const row: InboxItem = {
    id: m.id,
    y: g.year,
    a: g.character.age,
    t: clipInboxText(m.title, m.text),
    k: m.tone === 'good' ? 'good' : m.tone === 'event' ? 'event' : 'neutral',
  }
  if (validLink(m.link)) row.l = m.link
  return row
}

/** Add rows: the stored inbox is sanitized first, a row whose id is already there is skipped, the newest INBOX_MAX stay. */
export function pushInbox(g: GameState, items: readonly InboxItem[]): void {
  const s = sanitize(g.flags.inbox)
  const have = new Set(s.items.map((row) => row.id))
  let added = 0
  for (const raw of items) {
    const row = cleanItem(raw)
    if (row === null || have.has(row.id)) continue
    have.add(row.id)
    s.items.push(row)
    added++
  }
  if (added === 0) return
  if (s.items.length > INBOX_MAX) s.items.splice(0, s.items.length - INBOX_MAX)
  s.total = Math.min(COUNT_MAX, s.total + added)
  g.flags.inbox = s
}

/** Count every row as seen. A game that never had an inbox is left as it is. */
export function markSeen(g: GameState): void {
  if (g.flags.inbox === undefined) return
  const s = sanitize(g.flags.inbox)
  s.seen = s.total
  g.flags.inbox = s
}

/** Remove every row and count them as seen; the total stays. A game that never had an inbox is left as it is. */
export function emptyInbox(g: GameState): void {
  if (g.flags.inbox === undefined) return
  const s = sanitize(g.flags.inbox)
  s.items = []
  s.seen = s.total
  g.flags.inbox = s
}

/**
 * Move every notice that routesToInbox(m, true) from the queue to the inbox, in place; the rest of the queue keeps its
 * order. Returns how many were moved and is idempotent. The caller decides whether Quiet Mode is on.
 */
export function routeMinorNotices(g: GameState): number {
  const moved: InboxItem[] = []
  const queue = g.queue
  let kept = 0
  for (const m of queue as ModalItem[]) {
    if (m.kind === 'notice' && routesToInbox(m, true)) moved.push(inboxItemOf(g, m))
    else queue[kept++] = m
  }
  if (moved.length === 0) return 0
  queue.length = kept
  pushInbox(g, moved)
  return moved.length
}
