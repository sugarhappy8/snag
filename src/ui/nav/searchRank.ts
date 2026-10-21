// Ranking (G.9): a query over a built index, in tiers. A token is a prefix of the label (0, first token only), the start of
// a word in the label, the keywords or the breadcrumbs (1), a substring of any of them (2), or its letters appear in order
// in the label (3, three characters or more, and only in a label of 24 characters or fewer: in a long shop label any word
// has its letters somewhere in order, and that is no match). Pins and recents only reorder rows inside a tier, so a pinned
// weak match never beats an unpinned strong one. Locked rows go last whatever their tier; the lock is the index's note, and
// the palette re-checks it live. Pure: reads the index and the context, writes nothing.
import { placeKey, placeOfEntry, type PlaceRef } from './place'
import type { IndexEntry, SearchIndex } from './searchIndex'

/** The id of the Do Anything action. The palette ends every result list with its own "Do Anything: {query}" row. */
export const DO_ANYTHING_ID = 'doAnything'

const DEFAULT_LIMIT = 30
/** A query is cut to this many words, and a word to this many characters (a longer one cannot match a label anyway). */
const MAX_TOKENS = 8
const MAX_TOKEN = 48
const MIN_SUBSEQUENCE = 3
/** A label longer than this (normalised) is never a subsequence hit. The palette also never runs a tier 3 hit on Enter. */
export const SUBSEQUENCE_LABEL_MAX = 24

/**
 * Lower case, accents folded, `&` read as "and", every other run of non-letters and non-digits one space, trimmed.
 * "Mind & Body" gives "mind and body".
 */
export function normalize(s: string): string {
  if (typeof s !== 'string') return ''
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** 0 prefix, 1 word start, 2 substring, 3 subsequence. */
export type Tier = 0 | 1 | 2 | 3

export interface RankContext {
  pins: PlaceRef[]
  recents: PlaceRef[]
}

/** `recent`: 0 for the newest recent place, -1 when the place is not in the recents. */
export interface SearchHit {
  entry: IndexEntry
  tier: Tier
  pinned: boolean
  recent: number
  locked: string | null
}

function startsWord(field: string, token: string): boolean {
  return field.startsWith(token) || field.includes(` ${token}`)
}

function isSubsequence(field: string, token: string): boolean {
  let at = 0
  for (let i = 0; i < field.length && at < token.length; i++) if (field.charCodeAt(i) === token.charCodeAt(at)) at++
  return at === token.length
}

/** The tier of one token against one entry, or -1 when it matches nothing. */
function tokenTier(e: IndexEntry, token: string, first: boolean): Tier | -1 {
  if (first && e.labelN.startsWith(token)) return 0
  if (startsWord(e.labelN, token) || startsWord(e.kwN, token) || startsWord(e.crumbN, token)) return 1
  if (e.labelN.includes(token) || e.kwN.includes(token) || e.crumbN.includes(token)) return 2
  if (token.length >= MIN_SUBSEQUENCE && e.labelN.length <= SUBSEQUENCE_LABEL_MAX && isSubsequence(e.labelN, token)) return 3
  return -1
}

/** The entry's tier: its worst token, each token taken at its best field. -1 when a token matches nothing. */
function entryTier(e: IndexEntry, tokens: readonly string[]): Tier | -1 {
  let worst: Tier = 0
  for (let i = 0; i < tokens.length; i++) {
    const t = tokenTier(e, tokens[i], i === 0)
    if (t < 0) return -1
    if (t > worst) worst = t as Tier
  }
  return worst
}

const collator = new Intl.Collator()

function compareHits(a: SearchHit, b: SearchHit): number {
  const lockedA = a.locked ? 1 : 0
  const lockedB = b.locked ? 1 : 0
  if (lockedA !== lockedB) return lockedA - lockedB
  if (a.tier !== b.tier) return a.tier - b.tier
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
  const recentA = a.recent < 0 ? Number.POSITIVE_INFINITY : a.recent
  const recentB = b.recent < 0 ? Number.POSITIVE_INFINITY : b.recent
  if (recentA !== recentB) return recentA < recentB ? -1 : 1
  if (a.entry.depth !== b.entry.depth) return a.entry.depth - b.entry.depth
  const entityA = a.entry.entity ? 1 : 0
  const entityB = b.entry.entity ? 1 : 0
  if (entityA !== entityB) return entityA - entityB
  return collator.compare(a.entry.label, b.entry.label)
}

/**
 * The hits for `query`, best first, at most `limit` (30 by default). An empty query, or one that normalises to nothing,
 * gives []. An entry matches when every word of the query matches its label, keywords or breadcrumbs.
 */
export function search(index: SearchIndex, query: string, ctx: RankContext, limit?: number): SearchHit[] {
  const cap = typeof limit === 'number' && !Number.isNaN(limit) ? Math.max(0, Math.floor(limit)) : DEFAULT_LIMIT
  const entries = index && Array.isArray(index.entries) ? index.entries : []
  const tokens = normalize(query)
    .split(' ')
    .filter((t) => t !== '')
    .slice(0, MAX_TOKENS)
    .map((t) => t.slice(0, MAX_TOKEN))
  if (cap === 0 || tokens.length === 0 || entries.length === 0) return []

  const pins = new Set<string>()
  const recents = new Map<string, number>()
  for (const p of ctx?.pins ?? []) pins.add(placeKey(p))
  const recentPlaces = ctx?.recents ?? []
  for (let i = 0; i < recentPlaces.length; i++) {
    const key = placeKey(recentPlaces[i])
    if (!recents.has(key)) recents.set(key, i)
  }
  const keyed = pins.size > 0 || recents.size > 0

  const hits: SearchHit[] = []
  for (const entry of entries) {
    const tier = entryTier(entry, tokens)
    if (tier < 0) continue
    let pinned = false
    let recent = -1
    if (keyed) {
      const key = placeKey(placeOfEntry(entry))
      pinned = pins.has(key)
      recent = recents.get(key) ?? -1
    }
    hits.push({ entry, tier: tier as Tier, pinned, recent, locked: entry.locked })
  }
  hits.sort(compareHits)
  return hits.length > cap ? hits.slice(0, cap) : hits
}

/** Taps from a closed game to the row done: open the palette, type, tap the hit; one more when the action asks for a value. */
export function tapsToReach(e: IndexEntry): number {
  return 3 + (e.type === 'action' && e.input ? 1 : 0)
}
