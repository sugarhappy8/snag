// R4-U3 (People UI and fog track, H.7): what the player may read about one person. A pure builder: `personFacts(g, p)` returns the rows of
// the profile, and the profile (R4-U4) draws them. Nothing here is a screen, and nothing here draws or writes.
//
//   known      your own feeling (the Relationship bar), the job, how long you have known them, where you met, the other parent, who lives
//              with you, an expecting partner, an adoption, and the notes of shared history. Facts the player has.
//   estimate   happiness, health, smarts, looks and cash on hand: the words of `readPerson` (people-fog.ts), with the confidence chip
//              (`conf`) and the age of an old read (`asOf`). The personality stats are estimates too, but as one word each.
//   unknown    a trait not seen yet ("Not clear yet."), cash of someone you aren't close to ("Private."), "N more things you can't tell yet."
//
// The rows follow PERSON_SECTIONS and a row id starts with its section: `facts.`, `traits.`, `personality.`, `notes.`. The sections
// `connections` (R4-U9) and `memories` (R4-U10) are cards of the profile and `rep` is reserved for R5, so they draw nothing here.
//
// Null is the legacy layout: Exact, the flag off, a pet and the dead (`usesProfile` of people-fog.ts is the one gate, and the profile
// shows the old sheet exactly when it is false). No row carries a number from the truth: an estimate prints `readPerson`'s words (a range or
// a word, never the truth), a personality stat is a word from the read, and a trait is named only once exposure reaches it. A stat that
// cannot be read (a key the contract refuses, a number that is not finite) is an unknown row, never the number itself.
//
// Every reader is total: a person with NaN stats, 500 traits, a data stat of 1e9, no `data` or a `traits` that is not an array gives rows
// within the caps (a row's text 90 characters, its `how` line static copy of at most 120, at most PEOPLE_CAPS.personality personality rows, six notes). A long
// word is cut, a long dash is written as a hyphen, and a value that is not text is left out.
//
// Layer: hubs (L4). The 15 data stats are copied from PersonSheet.tsx (a game file cannot import src/ui; test/people-facts.test.ts reads
// that file as text and pins the same keys, labels and emoji in the same order). Only PersonProfile.tsx (R4-U4) imports this file, so
// it joins that lazy chunk.
import { personKey } from '../kernel/person-ref'
import { readKnow, type Estimate } from '../knowledge/contract'
import { PEOPLE_CAPS, exposureOf, isClose, pplKey, readPerson, traitsShown, usesProfile } from '../people-fog'
import { fnv1a } from '../text/hash'
import type { GameState, Person } from '../types'

export type FactState = 'known' | 'estimate' | 'unknown'

/** One line of the profile. `text` is at most 90 characters; `how` is static copy of at most 120. */
export interface FactRow {
  id: string
  label: string
  emoji: string
  text: string
  state: FactState
  /** How sure an estimate is, 0 to 3 (the dots of the chip). Only on an `estimate`. */
  conf?: 0 | 1 | 2 | 3
  /** The year of a reading two or more years old (the chip prints "as of 2023"). Only on an `estimate`. */
  asOf?: number
  /** The Relationship row only: 0 to 100, drawn as a bar. */
  bar?: number
  /** The second line of the row: why it is unknown, or whose feeling it is. */
  how?: string
}

/** The rows, how much of the person the player has seen (0 to 1), and how many rows are unknown. */
export interface PersonFacts {
  rows: FactRow[]
  exposure: number
  unknown: number
}

/** The sections of a profile, in order. `rep` draws nothing in R4 (R5, D.7). */
export const PERSON_SECTIONS = ['facts', 'traits', 'personality', 'connections', 'rep', 'memories', 'notes'] as const

/** Extra 0-100 stats some modules keep in Person.data (key, label, emoji). A copy of PersonSheet.tsx; a test pins the two together. */
export const DATA_STATS: readonly (readonly [key: string, label: string, emoji: string])[] = [
  ['generosity', 'Generosity', '🎁'],
  ['religiousness', 'Religiousness', '🙏'],
  ['kindness', 'Kindness', '🤗'],
  ['professionalism', 'Professionalism', '👔'],
  ['strictness', 'Strictness', '📏'],
  ['popularity', 'Popularity', '🌟'],
  ['craziness', 'Craziness', '🤪'],
  ['willpower', 'Willpower', '💪'],
  ['petulance', 'Petulance', '😤'],
  ['diligence', 'Diligence', '📚'],
  ['loyalty', 'Loyalty', '🤝'],
  ['obedience', 'Obedience', '🦮'],
  ['entitlement', 'Entitlement', '👑'],
  ['respect', 'Respect', '🫡'],
  ['toughness', 'Toughness', '🥊'],
]

const TEXT_MAX = 90
const NOTE_ROWS = 6
/** The age from which the legacy sheet shows cash on hand. */
const CASH_AGE = 16
/** A years-known figure is shown up to this. */
const YEARS_MAX = 999
/** Work on at most this many characters of a long text before it is cut (a hostile note cannot cost a page of work). */
const SCAN_FACTOR = 4

const NOT_CLEAR = { text: 'Not clear yet.', how: "You haven't spent enough time with them." } as const
const PRIVATE = { text: 'Private.', how: "You aren't close enough to know." } as const
const MORE_HOW = 'Time together shows more.'

const DASHES = new RegExp(`[${String.fromCharCode(0x2014, 0x2013)}]`, 'g')

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k)
/** A number held to 0..100 and rounded; a value that is not a finite number counts as 0. */
const wholePercent = (v: unknown): number => (finite(v) ? Math.round(Math.min(100, Math.max(0, v))) : 0)

/** `s` cut to `max` characters (the cut is marked, and never splits a surrogate pair). */
function cap(s: string, max: number): string {
  if (s.length <= max) return s
  let cut = s.slice(0, max - 1)
  const last = cut.charCodeAt(cut.length - 1)
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1)
  return `${cut.trimEnd()}…`
}

/** Text a row can print: a string with its long dashes written as hyphens and its white space collapsed, cut to `max`; '' for anything else. */
function clean(v: unknown, max: number): string {
  if (typeof v !== 'string') return ''
  return cap(v.slice(0, max * SCAN_FACTOR).replace(DASHES, '-').replace(/\s+/g, ' ').trim(), max)
}

/** A person's name as text ('' when there is none). */
function nameOf(p: Person): string {
  return [clean(p.firstName, 40), clean(p.lastName, 40)].filter((x) => x !== '').join(' ')
}

/** One number of the person's stats, whatever the record holds. */
function statOf(p: Person, field: string): unknown {
  const stats: unknown = p.stats
  return isRecord(stats) && hasOwn(stats, field) ? stats[field] : undefined
}

function knownRow(id: string, label: string, emoji: string, value: unknown, extra: Partial<FactRow> = {}): FactRow[] {
  const text = clean(value, TEXT_MAX)
  return text === '' ? [] : [{ id, label, emoji, text, state: 'known', ...extra }]
}

function unknownRow(id: string, label: string, emoji: string, text: string, how: string): FactRow {
  return { id, label, emoji, text, state: 'unknown', how }
}

/** What the player reads of one number: the estimate, or null when it cannot be read (a key the contract refuses, a truth that is not a number). */
function readOf(g: GameState, p: Person, field: string, truth: unknown): Estimate | null {
  if (!finite(truth)) return null
  try {
    const e = readPerson(g, p, field, truth)
    return e !== null && !e.exact ? e : null
  } catch {
    return null
  }
}

/** The chip fields of an estimate: its confidence, and the year of a reading two or more years old. */
function chipOf(e: Estimate): Pick<FactRow, 'conf' | 'asOf'> {
  return { conf: e.conf, ...(Number.isInteger(e.asOf) ? { asOf: e.asOf } : {}) }
}

/** An estimate row: the words of the read with the chip; unknown when the number cannot be read. */
function estimateRow(g: GameState, p: Person, id: string, label: string, emoji: string, field: string, truth: unknown): FactRow {
  const e = readOf(g, p, field, truth)
  const text = e === null ? '' : clean(e.words, TEXT_MAX)
  if (e === null || text === '') return unknownRow(id, label, emoji, NOT_CLEAR.text, NOT_CLEAR.how)
  return { id, label, emoji, text, state: 'estimate', ...chipOf(e) }
}

/** The player has paid for a read of this person's cash (a stored `ppl:<key>:cash` row), so they know it without being close. */
function cashResearched(g: GameState, p: Person): boolean {
  const key = pplKey(p, 'cash')
  if (key === null) return false
  try {
    const rec = readKnow(g)
    return rec !== null && hasOwn(rec.k, key)
  } catch {
    return false
  }
}

function factRows(g: GameState, p: Person): FactRow[] {
  const rel = wholePercent(p.relationship)
  const rows: FactRow[] = [{ id: 'facts.relationship', label: 'Relationship', emoji: '❤️', text: `${rel}%`, state: 'known', bar: rel, how: 'Your own feeling about them.' }]
  rows.push(estimateRow(g, p, 'facts.happiness', 'Happiness', '😊', 'happiness', statOf(p, 'happiness')))
  rows.push(estimateRow(g, p, 'facts.health', 'Health', '🩺', 'health', statOf(p, 'health')))
  rows.push(estimateRow(g, p, 'facts.smarts', 'Smarts', '🧠', 'smarts', statOf(p, 'smarts')))
  rows.push(estimateRow(g, p, 'facts.looks', 'Looks', '💅', 'looks', statOf(p, 'looks')))

  if (p.occupation !== 'None') rows.push(...knownRow('facts.occupation', 'Occupation', '💼', p.occupation))
  if (typeof p.age === 'number' && p.age >= CASH_AGE) {
    rows.push(
      isClose(p) || cashResearched(g, p)
        ? estimateRow(g, p, 'facts.cash', 'Cash on hand', '💰', 'cash', p.money)
        : unknownRow('facts.cash', 'Cash on hand', '💰', PRIVATE.text, PRIVATE.how),
    )
  }
  if (finite(p.yearsKnown) && p.yearsKnown >= 1 && p.relation !== 'parent' && p.relation !== 'sibling') {
    const years = Math.min(YEARS_MAX, Math.floor(p.yearsKnown))
    rows.push(...knownRow('facts.known', 'Known for', '⏳', years === 1 ? '1 year' : `${years} years`))
  }
  const data: unknown = p.data
  if (isRecord(data) && hasOwn(data, 'metAt')) rows.push(...knownRow('facts.met', 'Met', '📍', data.metAt))

  const people: unknown = g.people
  if (p.relation === 'child' && typeof p.otherParentId === 'string' && Array.isArray(people)) {
    const other = (people as unknown[]).find((x): x is Person => isRecord(x) && x.id === p.otherParentId)
    if (other) rows.push(...knownRow('facts.otherParent', other.gender === 'male' ? 'Father' : 'Mother', '👪', nameOf(other)))
  }
  if (p.livesWithPlayer === true) rows.push({ id: 'facts.home', label: 'Lives with you', emoji: '🏠', text: 'Yes', state: 'known' })
  if (p.pregnant === true) rows.push({ id: 'facts.expecting', label: 'Expecting', emoji: '🤰', text: 'Yes', state: 'known' })
  if (p.biological === false && (p.relation === 'child' || p.relation === 'parent')) rows.push({ id: 'facts.adopted', label: 'Adopted', emoji: '📜', text: 'Yes', state: 'known' })
  return rows
}

/** The trait words exposure has reached, and one unknown row for the rest. */
function traitRows(p: Person): FactRow[] {
  const { shown, hidden } = traitsShown(p)
  const rows = shown.flatMap((word, i) => knownRow(`traits.${i}`, 'Trait', '🧩', word))
  if (hidden > 0) rows.push(unknownRow('traits.more', shown.length === 0 ? 'Traits' : 'More traits', '🧩', NOT_CLEAR.text, NOT_CLEAR.how))
  return rows
}

/** [upper bound, word] of the read of a personality stat, in rising order; above the last bound is 'very high'. */
const PERSONALITY_WORDS: readonly (readonly [number, string])[] = [
  [20, 'very low'],
  [40, 'low'],
  [60, 'middling'],
  [80, 'high'],
]

const personalityWord = (mid: number): string => PERSONALITY_WORDS.find(([cut]) => mid < cut)?.[1] ?? 'very high'

/**
 * Up to PEOPLE_CAPS.personality of the stats a person has (a number from 0 to 100), in the order of fnv1a(personKey + stat), as one
 * word each from the read, and one unknown row for all the rest. The order is the person's own, so it does not change as exposure grows.
 */
function personalityRows(g: GameState, p: Person): FactRow[] {
  const data: unknown = p.data
  if (!isRecord(data)) return []
  const have = DATA_STATS.filter(([key]) => hasOwn(data, key) && finite(data[key]) && data[key] >= 0 && data[key] <= 100)
  if (have.length === 0) return []
  const who = personKey(p)
  const order = have.map((stat, i) => ({ stat, i, h: fnv1a(`${who}${stat[0]}`) })).sort((a, b) => a.h - b.h || a.i - b.i)
  const rows: FactRow[] = []
  for (const { stat } of order.slice(0, PEOPLE_CAPS.personality)) {
    const e = readOf(g, p, stat[0], data[stat[0]])
    if (e !== null) rows.push({ id: `personality.${stat[0]}`, label: stat[1], emoji: stat[2], text: personalityWord(e.mid), state: 'estimate', ...chipOf(e) })
  }
  const rest = have.length - rows.length
  if (rest > 0) rows.push(unknownRow('personality.more', 'Personality', '🎭', `${rest} more ${rest === 1 ? 'thing' : 'things'} you can't tell yet.`, MORE_HOW))
  return rows
}

/** The last six notes of shared history, the newest last (the legacy sheet's list). */
function noteRows(p: Person): FactRow[] {
  const notes: unknown = p.notes
  if (!Array.isArray(notes)) return []
  return (notes as unknown[]).slice(-NOTE_ROWS).flatMap((note, i) => knownRow(`notes.${i}`, 'Shared history', '📖', note))
}

/**
 * What the player may read about this person, or null when the profile does not apply (Exact, the flag off, a pet, the dead): the
 * screen then shows the legacy sheet. Pure and total: no draw, no write, the same rows twice in a year.
 */
export function personFacts(g: GameState, p: Person): PersonFacts | null {
  if (!usesProfile(p)) return null
  const rows = [...factRows(g, p), ...traitRows(p), ...personalityRows(g, p), ...noteRows(p)]
  return { rows, exposure: Math.min(1, Math.max(0, exposureOf(p))), unknown: rows.filter((r) => r.state === 'unknown').length }
}
