// R4-U9 (People UI and fog track, D.10): "How you're connected". A pure builder: `connectionsOf(g, p)` returns the rows of the connections card of
// the person profile, and PersonProfile.tsx draws them with FactRow after the personality card. Nothing here is a screen, and nothing draws or writes.
//
// Every row is a fact the player already has, read from the data the game keeps today (so a life that was never stamped by the social flag
// has the same card, X6): a cut-off and a debt (the badges of the Relationships tab say the same words), a spouse by name and a count of kids
// (a sibling who married is a record with `data.married`, `spouseName` and `kids`, and the baby of a sibling is a Met-only record with no
// profile in R4, so the count is how it shows), the other parent of a stepchild or a grandchild, who a parent split from, a job at one of
// your companies and a stake in one. Nothing about the person's own secrets: the will's anger, the loan's history, a stat, a trait.
//
// Rows in this order, the first CAP of them (PEOPLE_CAPS.connections): estranged, owes, spouse, kids, other, ex, job, stake. What needs an
// answer comes first. A row that is not true of the person is left out, and a record that cannot be read leaves its row out and never throws.
//
// A row names a person only when the game holds them (the other parent and the ex are looked up in `g.people`) or the record stores the
// name (a spouse's name is text on the sibling). A company is named only while it is one of yours: the asset is in `g.assets`.
//
// Null of the profile is an empty card: Exact, the flag off, a pet and the dead have none (`usesProfile` of people-fog.ts is the one gate).
// Every text is at most 90 characters, a long dash is written as a hyphen, and a value that is not text is left out. The rows are plain
// JSON. Layer: hubs (L4). Only PersonProfile.tsx (R4-U4's lazy chunk) imports this file.
import { shortMoney } from '../core'
import { readJob } from '../business/nepo-job'
import { readTies } from '../events/wealth-core'
import { isEstranged, readWl } from '../events/will-core'
import { isRomantic } from '../love'
import { PEOPLE_CAPS, usesProfile } from '../people-fog'
import type { GameState, Person } from '../types'
import type { FactRow } from './people-facts'

const TEXT_MAX = 90
/** A company or a person is named in at most this many characters, so "and 499 more" always fits. */
const NAME_MAX = 40
/** Work on at most this many characters of a long text before it is cut. */
const SCAN_FACTOR = 4
/** The most kids the card counts (a record that says more is not believed past this). */
const KIDS_MAX = 99

const DASHES = new RegExp(`[${String.fromCharCode(0x2014, 0x2013)}]`, 'g')

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

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
function nameOf(p: unknown): string {
  if (!isRecord(p)) return ''
  return [clean(p.firstName, NAME_MAX), clean(p.lastName, NAME_MAX)].filter((x) => x !== '').join(' ')
}

/** The name of the person the game holds under this id, or '' (the id is not text, the game has nobody by it, or the name is empty). */
function holderName(g: GameState, id: unknown): string {
  const people: unknown = g.people
  if (typeof id !== 'string' || !Array.isArray(people)) return ''
  return nameOf((people as unknown[]).find((x) => isRecord(x) && x.id === id))
}

function row(id: string, label: string, emoji: string, text: string): FactRow[] {
  return text === '' ? [] : [{ id: `connections.${id}`, label, emoji, text: cap(text, TEXT_MAX), state: 'known' }]
}

/** The year a cut-off began, when it is a year that has happened. */
function sinceText(g: GameState, p: Person): string {
  const year = readWl(g, p).estrY
  return Number.isInteger(year) && year > 0 && year <= g.year ? `Since ${year}` : 'Yes'
}

function estrangedRow(g: GameState, p: Person): FactRow[] {
  return isEstranged(g, p) ? row('estranged', 'Estranged', '🚫', sinceText(g, p)) : []
}

function owesRow(g: GameState, p: Person): FactRow[] {
  const owes = readTies(g, p).owes
  return finite(owes) && owes > 0 ? row('owes', 'Owes you', '💸', shortMoney(owes)) : []
}

/** A spouse by name: the record of a sibling, a child or a friend who married keeps the name as text. Your own partner's name is yours already. */
function spouseRow(p: Person, data: Record<string, unknown>): FactRow[] {
  return data.married === true && !isRomantic(p) ? row('spouse', 'Married to', '💍', clean(data.spouseName, TEXT_MAX)) : []
}

function kidsRow(data: Record<string, unknown>): FactRow[] {
  const kids = data.kids
  if (!finite(kids) || kids < 1) return []
  const n = Math.min(KIDS_MAX, Math.floor(kids))
  return row('kids', 'Kids', '👶', n === 1 ? '1 kid' : `${n} kids`)
}

/** The other parent of a stepchild or a grandchild. A child's other parent is already a row of the facts card (Mother or Father). */
function otherParentRow(g: GameState, p: Person): FactRow[] {
  return p.relation === 'child' ? [] : row('other', 'Other parent', '👪', holderName(g, p.otherParentId))
}

/** Who a parent who split up was married to: the other parent of the household. */
function exRow(g: GameState, data: Record<string, unknown>): FactRow[] {
  return row('ex', 'Split from', '💔', holderName(g, data.exSpouseId))
}

/** The business asset of this id, while it is one of yours. */
function companyNamed(g: GameState, id: string): string {
  const assets: unknown = g.assets
  if (!Array.isArray(assets)) return ''
  const a = (assets as unknown[]).find((x) => isRecord(x) && x.id === id && x.kind === 'business')
  return isRecord(a) ? clean(a.name, NAME_MAX) : ''
}

function jobRow(g: GameState, p: Person): FactRow[] {
  const job = readJob(p)
  const name = job === null ? '' : companyNamed(g, job.assetId)
  return row('job', 'Your company', '🏢', name === '' ? '' : `Works at ${name}`)
}

/** True when the list of holders ({ id, share }) names this person with a share above nothing. */
function holds(holders: unknown, id: string): boolean {
  return Array.isArray(holders) && (holders as unknown[]).some((h) => isRecord(h) && h.id === id && finite(h.share) && h.share > 0)
}

/**
 * The companies where this person holds a stake, by name, in the order of your assets. A division of a group is held through the group, so
 * the group is named once (the record every division carries) and not each division; the shares a division keeps for itself are a copy.
 */
function stakesOf(g: GameState, p: Person): string[] {
  const assets: unknown = g.assets
  if (!Array.isArray(assets)) return []
  const names: string[] = []
  const seen = new Set<string>()
  for (const a of assets as unknown[]) {
    if (!isRecord(a) || a.kind !== 'business' || !isRecord(a.details)) continue
    const group = isRecord(a.details.group) ? a.details.group : null
    const core = group !== null && isRecord(group.core) ? group.core : null
    const key = core !== null ? `g:${String(group?.id)}` : `a:${String(a.id)}`
    const name = clean(core !== null ? core.name : a.name, NAME_MAX)
    if (name === '' || seen.has(key) || !holds(core !== null ? core.familyShares : a.details.familyShares, p.id)) continue
    seen.add(key)
    names.push(name)
  }
  return names
}

function stakeRow(g: GameState, p: Person): FactRow[] {
  const names = stakesOf(g, p)
  if (names.length === 0) return []
  return row('stake', 'Family stake', '📈', names.length === 1 ? names[0]! : `${names[0]!} and ${names.length - 1} more`)
}

/** A reader that cannot read its record leaves its rows out: the card is a convenience, never a reason for the sheet to fail. */
function safely(read: () => FactRow[]): FactRow[] {
  try {
    return read()
  } catch {
    return []
  }
}

/**
 * The rows of the connections card for one person: at most PEOPLE_CAPS.connections, all `known`, none from a secret, an empty list for Exact,
 * the flag off, a pet and the dead. Pure and total: no draw, no write, the same rows twice in a year.
 */
export function connectionsOf(g: GameState, p: Person): FactRow[] {
  if (!usesProfile(p)) return []
  const data: Record<string, unknown> = isRecord(p.data) ? p.data : {}
  return [
    ...safely(() => estrangedRow(g, p)),
    ...safely(() => owesRow(g, p)),
    ...safely(() => spouseRow(p, data)),
    ...safely(() => kidsRow(data)),
    ...safely(() => otherParentRow(g, p)),
    ...safely(() => exRow(g, data)),
    ...safely(() => jobRow(g, p)),
    ...safely(() => stakeRow(g, p)),
  ].slice(0, PEOPLE_CAPS.connections)
}
