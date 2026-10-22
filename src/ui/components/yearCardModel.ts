// The year card as the UI reads it (R3-Q6, E.D3). closeYear (R3-Q4) queues one notice that carries the card in
// `digest`, and after ten popups keeps the card in the year book (a saved personal key) as `inline` for the Life tab. This file reads
// both as `unknown` and hands back a CardView, so the UI needs no game type and a damaged or hostile save can only ever
// give a smaller card or none. Pure: no React, no store, no draw, nothing is written. A leaf: it imports nothing.

/** The bounds of a card. The planner (hubs/year-plan.ts) writes inside them; the reader enforces them. */
export const CARD_LIMITS = {
  /** Characters in any one line of the card. */
  text: 90,
  stories: 3,
  people: 3,
  /** Head, stories, money, people and world together. */
  lines: 8,
  groups: 8,
  groupLines: 6,
  /** The newest cards of the year book that inlineCard looks at (the book keeps 3). */
  scan: 8,
} as const

/** The categories of a card, in the order they are drawn. */
export const GROUP_ORDER = ['people', 'body', 'work', 'companies', 'money', 'law', 'world', 'life'] as const
export type GroupKey = (typeof GROUP_ORDER)[number]

export const GROUP_LABEL: Readonly<Record<GroupKey, string>> = {
  people: 'People',
  body: 'Health',
  work: 'Work',
  companies: 'Your companies',
  money: 'Money',
  law: 'Law and order',
  world: 'The world',
  life: 'Everyday',
}

export interface CardGroup {
  k: GroupKey
  label: string
  /** Everything the year had in this category, which can be more than the lines listed. */
  n: number
  lines: string[]
}

export interface CardView {
  year: number
  age: number
  head: string
  stories: string[]
  /** '' when the year has no money line. */
  money: string
  people: string[]
  /** '' when the year has no news line. */
  world: string
  groups: CardGroup[]
  inline: boolean
  /** Head, stories, money, people and world: at most CARD_LIMITS.lines. */
  lineCount: number
}

const COUNT_MAX = 1e6
/** A reader looks at no more than this many characters of a string, so a huge damaged one costs what a normal one does. */
const SLICE = CARD_LIMITS.text * 4

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function isInt(v: unknown, lo: number, hi: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi
}

/** A text without a trailing high surrogate: a cut between the two halves of a pair would leave one alone. */
function dropHalfPair(t: string): string {
  const last = t.charCodeAt(t.length - 1)
  return last >= 0xd800 && last <= 0xdbff ? t.slice(0, -1) : t
}

/** One line: white space and control characters collapsed, trimmed, cut to the limit; '' when it is not a string. */
function cleanLine(v: unknown): string {
  if (typeof v !== 'string') return ''
  let t = v.slice(0, SLICE).replace(/[\s\u0000-\u001f\u007f]+/g, ' ').trim()
  if (t.length > CARD_LIMITS.text) t = dropHalfPair(t.slice(0, CARD_LIMITS.text)).trimEnd()
  return t
}

/** The first `max` readable lines of a list; a non-list is empty, and only the front of a long list is looked at. */
function cleanList(v: unknown, max: number): string[] {
  const out: string[] = []
  if (!Array.isArray(v)) return out
  const end = Math.min(v.length, max * 4)
  for (let i = 0; i < end && out.length < max; i++) {
    const line = cleanLine(v[i])
    if (line !== '') out.push(line)
  }
  return out
}

function cleanGroups(v: unknown): CardGroup[] {
  const found = new Map<GroupKey, CardGroup>()
  if (!Array.isArray(v)) return []
  const end = Math.min(v.length, CARD_LIMITS.groups * 4)
  for (let i = 0; i < end; i++) {
    const raw: unknown = v[i]
    if (!isRecord(raw)) continue
    const k = GROUP_ORDER.find((key) => key === raw.k)
    if (k === undefined || found.has(k)) continue
    const lines = cleanList(raw.lines, CARD_LIMITS.groupLines)
    const n = isInt(raw.n, 0, COUNT_MAX) ? Math.max(raw.n, lines.length) : lines.length
    if (n === 0) continue
    found.set(k, { k, label: GROUP_LABEL[k], n, lines })
  }
  return GROUP_ORDER.flatMap((k) => {
    const g = found.get(k)
    return g === undefined ? [] : [g]
  })
}

/**
 * A card made into a view, or null when it can't be a card: not an object, `v` not 1, no headline, or no year or age.
 * Total: it never throws and never writes what it reads. Every string is cut to 90 characters, the lists to their
 * bounds, the groups to the 8 known ones (each once, in display order, a group with nothing in it dropped), and a card
 * over 8 lines loses people first.
 */
export function cleanCard(raw: unknown): CardView | null {
  if (!isRecord(raw) || raw.v !== 1) return null
  const { year, age } = raw
  if (!isInt(year, 1000, 100000) || !isInt(age, 0, 10000)) return null
  const head = cleanLine(raw.head)
  if (head === '') return null
  const stories = cleanList(raw.stories, CARD_LIMITS.stories)
  const money = cleanLine(raw.money)
  const people = cleanList(raw.people, CARD_LIMITS.people)
  const world = cleanLine(raw.world)
  const count = (): number => 1 + stories.length + (money === '' ? 0 : 1) + people.length + (world === '' ? 0 : 1)
  while (count() > CARD_LIMITS.lines && people.length > 0) people.pop()
  while (count() > CARD_LIMITS.lines && stories.length > 0) stories.pop()
  return { year, age, head, stories, money, people, world, groups: cleanGroups(raw.groups), inline: raw.inline === true, lineCount: count() }
}

/** The card a notice carries in `digest`; null for any other modal, a notice with none, or one that can't be read. */
export function cardOfModal(m: unknown): CardView | null {
  return isRecord(m) ? cleanCard(m.digest) : null
}

/** Whether a modal carries a `digest` at all, readable or not. A notice that does is never part of a shared card. */
export function hasDigest(m: unknown): boolean {
  return isRecord(m) && m.digest !== undefined && m.digest !== null
}

/**
 * The card the Life tab draws for this year: the newest card of `year` that the year book kept inline. `book` is the
 * saved year book (GameScreen reads it by its key); the record that holds it is read as well, so either form works. Only
 * the newest few cards are looked at. Null when there is none, and for any other year (a card is never read ahead of
 * its year).
 */
export function inlineCard(book: unknown, year: number): CardView | null {
  const held = isRecord(book) && isRecord(book.yearBook) ? book.yearBook : book
  if (!isRecord(held)) return null
  const cards: unknown = held.cards
  if (!Array.isArray(cards)) return null
  for (let i = cards.length - 1; i >= Math.max(0, cards.length - CARD_LIMITS.scan); i--) {
    const raw: unknown = cards[i]
    if (!isRecord(raw) || raw.year !== year || raw.inline !== true) continue
    const view = cleanCard(raw)
    if (view !== null) return view
  }
  return null
}

/** What the card can't list: the group's count less the lines it shows. */
export function groupMore(g: CardGroup): number {
  return Math.max(0, g.n - g.lines.length)
}

/** The name of the card for a screen reader. */
export function cardLabel(card: CardView): string {
  return `Your year, age ${card.age}`
}

/** The line under the headline. */
export function cardWhen(card: CardView): string {
  return `Age ${card.age}, ${card.year}`
}

/** The elements that use Enter themselves: a group row opens and closes on it, a button presses. */
const OWN_ENTER = new Set(['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT', 'SUMMARY'])

/**
 * Whether a key press dismisses the popup card (the way NoticeCard does): Enter, not held down, and not while the focus
 * is on a control that uses Enter for itself. `tag` is the upper case tag name of the event target, '' for none.
 */
export function enterDismisses(key: string, repeat: boolean, tag: string, editable = false): boolean {
  return key === 'Enter' && !repeat && !editable && !OWN_ENTER.has(tag)
}
