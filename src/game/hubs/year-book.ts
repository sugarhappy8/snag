// The year book and the pending asks (R3, E.D2 b): the two things the year close (year-close.ts) remembers between years.
//
//   flags.yearBook    the last year the close ran for (so a second call changes nothing), how many cards were popups (the card is a popup for
//                     the first YEAR_LIMITS.popupYears years of a life, then it is drawn inline), and the newest 3 cards.
//   flags.pendingAsks the unrequested choices the year had no room for. They wait at most YEAR_LIMITS.pendingYears years, 6 at a time, and
//                     come back as new popups when a later year has room.
//
// Both are personal flags (world-flags.ts): the heir starts without them. Both are written by the close and read by the close and the UI.
//
// Like inbox.ts, every reader sanitizes what it reads and never writes, so a damaged or hostile save is bounded and valid on the way
// out, and every writer sanitizes first. Nothing here reads a year after g.year (no foresight): a card dated later is dropped, a book
// whose last year is later reads as the year before, an ask dated later is dropped. No draw, no new id.
//
// Layer L4. No module-level const reads an import: the limits below are literals, and every function reads its imports when it runs.
import { validLogSource } from '../core'
import type { ChoiceModal, ChoiceOption, GameState, Json, YearCard, YearGroup } from '../types'
import { YEAR_GROUP_ORDER, YEAR_LIMITS, clipText } from './year-plan'

/** What the year close remembers about the years it closed. `last` is the newest year it closed, `shown` how many cards were popups. */
export interface YearBook {
  v: 1
  last: number
  shown: number
  /** The newest 3 cards, oldest first, one for each year. */
  cards: YearCard[]
}

/** An unrequested choice a year had no room for. `y` is the year it was deferred, `m` the choice without its id (a new id is made when it returns). */
export interface PendingAsk {
  y: number
  m: Omit<ChoiceModal, 'id'>
}

/** The bounds of the year book. */
const BOOK = Object.freeze({
  /** Cards kept. */
  cards: 3,
  /** A reader looks at no more than the newest this many stored cards, so a huge damaged list costs the same as a full one. */
  scan: 30,
  /** The most a count of lines in a group may say. */
  count: 9999,
  /** `shown` never needs to be bigger than this. */
  shown: 1_000_000,
  year: 100_000,
  age: 150,
})

/** The bounds of a pending ask. */
const ASK = Object.freeze({
  /** A reader looks at no more than the newest this many stored asks. */
  scan: 60,
  title: 120,
  text: 2000,
  /** Options of one choice. A real ask has up to about eight. */
  options: 12,
  optionId: 40,
  label: 200,
  hint: 400,
  emoji: 16,
  scriptId: 60,
  personId: 40,
  /** Characters of the data once it is written as JSON. */
  dataChars: 16_000,
  dataDepth: 6,
  dataNodes: 800,
  dataKeys: 60,
  dataText: 2000,
})

const SCRIPT_ID = /^[a-z][a-zA-Z0-9._-]*$/

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function isInt(v: unknown, lo: number, hi: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi
}

/** A text without a trailing high surrogate: a cut between the two halves of an emoji would leave one alone. */
function dropHalfPair(t: string): string {
  const last = t.charCodeAt(t.length - 1)
  return last >= 0xd800 && last <= 0xdbff ? t.slice(0, -1) : t
}

/** A line of a card: white space collapsed and cut to `max` by the rule of the inbox (clipText). The cut starts on a window, so a 3 MB string costs little. */
function lineOf(v: unknown, max: number): string {
  return typeof v === 'string' ? clipText(v.length > max * 8 ? v.slice(0, max * 8) : v, max) : ''
}

/** A free text kept as it is (new lines stay) and cut to `max` characters; '' when it is not a string. */
function plainOf(v: unknown, max: number): string {
  return typeof v === 'string' ? dropHalfPair(v.slice(0, max)) : ''
}

// ---------------------------------------------------------------------------
// The year book

/** A list of at most `max` good lines of at most `cap` characters each. */
function lines(v: unknown, max: number, cap: number): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (let i = 0; i < v.length && i < max * 4 && out.length < max; i++) {
    const t = lineOf(v[i], cap)
    if (t) out.push(t)
  }
  return out
}

function cleanGroups(v: unknown): YearCard['groups'] {
  if (!Array.isArray(v)) return []
  const L = YEAR_LIMITS
  const byKind = new Map<YearGroup, YearCard['groups'][number]>()
  for (let i = 0; i < v.length && i < YEAR_GROUP_ORDER.length * 4; i++) {
    const raw = v[i]
    if (!isRecord(raw)) continue
    const k = YEAR_GROUP_ORDER.find((kind) => kind === raw.k)
    if (k === undefined || byKind.has(k)) continue
    const n = typeof raw.n === 'number' && Number.isFinite(raw.n) ? Math.max(0, Math.min(BOOK.count, Math.round(raw.n))) : 0
    byKind.set(k, { k, n, lines: lines(raw.lines, L.groupLines, L.group) })
  }
  return YEAR_GROUP_ORDER.filter((k) => byKind.has(k)).map((k) => byKind.get(k)!)
}

/** A card with every field checked, or null when it can't be one or is dated after `now` (no foresight). */
function cleanCard(raw: unknown, now: number): YearCard | null {
  if (!isRecord(raw) || raw.v !== 1) return null
  if (!isInt(raw.year, 1, BOOK.year) || raw.year > now || !isInt(raw.age, 0, BOOK.age)) return null
  const L = YEAR_LIMITS
  const head = lineOf(raw.head, L.head)
  if (head === '') return null
  const card: YearCard = { v: 1, year: raw.year, age: raw.age, head, stories: lines(raw.stories, L.stories, L.story), groups: cleanGroups(raw.groups) }
  const money = lineOf(raw.money, L.head)
  if (money) card.money = money
  const people = lines(raw.people, L.people, L.story)
  if (people.length > 0) card.people = people
  const world = lineOf(raw.world, L.head)
  if (world) card.world = world
  if (raw.inline === true) card.inline = true
  return card
}

/** Whatever is stored, made into a valid book (see the header for the foresight rule). */
function sanitizeBook(raw: unknown, now: number): YearBook {
  const empty: YearBook = { v: 1, last: 0, shown: 0, cards: [] }
  if (!isRecord(raw)) return empty
  const byYear = new Map<number, YearCard>()
  const list: unknown[] = Array.isArray(raw.cards) ? raw.cards : []
  for (let i = Math.max(0, list.length - BOOK.scan); i < list.length; i++) {
    const card = cleanCard(list[i], now)
    if (card) byYear.set(card.year, card)
  }
  const cards = [...byYear.values()].sort((a, b) => a.year - b.year).slice(-BOOK.cards)
  let last = isInt(raw.last, 0, BOOK.year) ? raw.last : 0
  // A year after this one is not known yet. The book reads as it was the year before, so this year can still be closed.
  if (last > now) last = Math.max(0, now - 1)
  const shown = isInt(raw.shown, 0, BOOK.shown) ? raw.shown : typeof raw.shown === 'number' && raw.shown > BOOK.shown ? BOOK.shown : 0
  return { v: 1, last, shown, cards }
}

/** The year book of a game: a sanitized copy. Pure, never throws, and writes nothing. */
export function readYearBook(g: GameState): YearBook {
  return sanitizeBook(g?.flags?.yearBook, typeof g?.year === 'number' && Number.isFinite(g.year) ? g.year : BOOK.year)
}

/** Store a year book. It is sanitized first, so a hostile value is repaired on the way in. */
export function writeYearBook(g: GameState, b: YearBook): void {
  g.flags.yearBook = sanitizeBook(b, g.year) as unknown as Json
}

// ---------------------------------------------------------------------------
// The pending asks

/** The sentinel for a data value that cannot be kept. */
const BAD = Symbol('bad json')

/** A bounded copy of a JSON value, or BAD when it is too deep, too wide, too long or not JSON. `budget.n` counts the nodes left. */
function boundedJson(v: unknown, depth: number, budget: { n: number }): Json | typeof BAD {
  if (--budget.n < 0 || depth > ASK.dataDepth) return BAD
  if (v === null || typeof v === 'boolean') return v
  if (typeof v === 'number') return Number.isFinite(v) ? v : BAD
  if (typeof v === 'string') return v.length <= ASK.dataText ? v : BAD
  if (Array.isArray(v)) {
    if (v.length > ASK.dataKeys) return BAD
    const out: Json[] = []
    for (const item of v) {
      const x = boundedJson(item, depth + 1, budget)
      if (x === BAD) return BAD
      out.push(x)
    }
    return out
  }
  if (isRecord(v)) {
    const keys = Object.keys(v)
    if (keys.length > ASK.dataKeys) return BAD
    const out: { [key: string]: Json } = {}
    for (const key of keys) {
      if (key === '__proto__' || key.length > ASK.optionId * 2) return BAD
      const x = boundedJson(v[key], depth + 1, budget)
      if (x === BAD) return BAD
      out[key] = x
    }
    return out
  }
  return BAD
}

function cleanOption(raw: unknown): ChoiceOption | null {
  if (!isRecord(raw)) return null
  const { id, label } = raw
  if (typeof id !== 'string' || id.length < 1 || id.length > ASK.optionId) return null
  const text = plainOf(label, ASK.label)
  if (text === '') return null
  const out: ChoiceOption = { id, label: text }
  if (typeof raw.emoji === 'string' && raw.emoji.length >= 1 && raw.emoji.length <= ASK.emoji) out.emoji = raw.emoji
  const hint = plainOf(raw.hint, ASK.hint)
  if (hint) out.hint = hint
  return out
}

/** A pending choice with every field checked, or null when it can't be one a script can answer. */
function cleanAsk(raw: unknown): Omit<ChoiceModal, 'id'> | null {
  if (!isRecord(raw) || raw.kind !== 'choice' || raw.source !== 'script') return null
  if (typeof raw.scriptId !== 'string' || raw.scriptId.length > ASK.scriptId || !SCRIPT_ID.test(raw.scriptId)) return null
  const title = lineOf(raw.title, ASK.title)
  if (title === '' || !Array.isArray(raw.choices)) return null
  const options: ChoiceOption[] = []
  const seen = new Set<string>()
  for (let i = 0; i < raw.choices.length && i < ASK.options * 4 && options.length < ASK.options; i++) {
    const option = cleanOption(raw.choices[i])
    if (option === null || seen.has(option.id)) continue
    seen.add(option.id)
    options.push(option)
  }
  if (options.length === 0) return null
  const out: Omit<ChoiceModal, 'id'> = { kind: 'choice', title, text: plainOf(raw.text, ASK.text), choices: options, source: 'script', scriptId: raw.scriptId }
  if (typeof raw.emoji === 'string' && raw.emoji.length >= 1 && raw.emoji.length <= ASK.emoji) out.emoji = raw.emoji
  if (typeof raw.personId === 'string' && raw.personId.length >= 1 && raw.personId.length <= ASK.personId) out.personId = raw.personId
  if (validLogSource(raw.s)) out.s = raw.s
  if (raw.data !== undefined) {
    const data = boundedJson(raw.data, 0, { n: ASK.dataNodes })
    if (data === BAD || JSON.stringify(data).length > ASK.dataChars) return null
    out.data = data
  }
  return out
}

/** Whatever is stored, made into a valid list: oldest first, expired and future asks dropped, the newest 6 kept. */
function sanitizeAsks(raw: unknown, now: number): PendingAsk[] {
  if (!Array.isArray(raw)) return []
  const out: PendingAsk[] = []
  for (let i = Math.max(0, raw.length - ASK.scan); i < raw.length; i++) {
    const item: unknown = raw[i]
    if (!isRecord(item) || !isInt(item.y, 1, BOOK.year)) continue
    // No foresight (an ask dated after this year), and a wait of at most pendingYears.
    if (item.y > now || now - item.y > YEAR_LIMITS.pendingYears) continue
    const m = cleanAsk(item.m)
    if (m !== null) out.push({ y: item.y, m })
  }
  return out.length > YEAR_LIMITS.pending ? out.slice(out.length - YEAR_LIMITS.pending) : out
}

/** The asks waiting for a year with room: a sanitized copy, oldest first. Pure, never throws, and writes nothing. */
export function readPending(g: GameState): PendingAsk[] {
  return sanitizeAsks(g?.flags?.pendingAsks, typeof g?.year === 'number' && Number.isFinite(g.year) ? g.year : BOOK.year)
}

/** Store the waiting asks. They are sanitized first (and the newest 6 kept); an empty list removes the key. */
export function writePending(g: GameState, list: readonly PendingAsk[]): void {
  const clean = sanitizeAsks(list, g.year)
  if (clean.length === 0) delete g.flags.pendingAsks
  else g.flags.pendingAsks = clean as unknown as Json
}
