// The palette's rows and keys (G.9), as pure functions. paletteRows gives the list for a query: with nothing typed, the
// places worth a tap (Back to, Needs you, Pinned, Recent); with a query, the ranked hits of the index with their lock read
// again from the live menus, then "Do Anything: {query}" last. paletteReduce is the keyboard, activate says what a tap on
// a row means. The highlight starts on the first row, except when the best hit is only a subsequence guess (tier 3): then it
// starts on the Do Anything row, so Enter on a sentence meant for Do Anything never runs an unrelated row. Nothing here
// writes the game, draws, runs a row, or reads a hint, subtitle or header.
//
// Part of the palette zone (test/lazy-zones.test.ts): only Palette.tsx and the gate import this file at run time.
import { personIdOf } from '../../game/hubs/people'
import { needsYou } from '../../game/hubs/needs'
import { doAnythingAction } from '../../game/menus'
import type { GameState, MenuAction, MenuGroup } from '../../game/types'
import { groupChildren, nodeDisabled } from '../components/menuModel'
import { resolveReturnPoint } from '../components/ReturnChip'
import type { ReturnPoint } from '../store'
import { placeKey, placeOfEntry, recentFromSpot, type PlaceRef, type SearchTab } from './place'
import { isPinned, lifeOf, MAX_PINS, MAX_RECENTS, type UiPrefs } from './prefs'
import { createResolver, defaultRoots, indexKey, type IndexEntry, type IndexRoots, type SearchIndex } from './searchIndex'
import { DO_ANYTHING_ID, search, type SearchHit } from './searchRank'

/** At most this many "Needs you" rows, over the four roots together. */
export const MAX_NEED_ROWS = 6
/** At most this many hits for a query, whose lock is read again live. */
export const MAX_HIT_ROWS = 30
/** The query as shown in the "Do Anything" label, and as submitted. */
export const LABEL_QUERY_MAX = 40
export const SUBMIT_QUERY_MAX = 300
/** PageDown and PageUp move the highlight this far. */
export const PAGE_STEP = 8

export const READING_TEXT = 'Still reading the menus.'
export const GONE_TEXT = 'Not available any more.'
/** The index stopped at a cap (6,000 rows, or 7 lists deep): a search can miss a row at the bottom of a long tree. */
export const CUT_TEXT = 'Search skips some deep rows.'
const TYPE_TEXT = 'Type to search.'

const TABS: readonly SearchTab[] = ['occupation', 'assets', 'relationships', 'activities']

export type PaletteWhy = 'back' | 'need' | 'pinned' | 'recent'

/**
 * `place`: somewhere to go (a group, or the list an action sits in). `hit`: a row of the index. `pinned` on a place row and
 * `locked` on a place row are read live: a place can be locked too.
 */
export type PaletteRow =
  | { kind: 'section'; id: string; label: string }
  | {
      kind: 'place'
      id: string
      ref: PlaceRef
      label: string
      emoji: string
      crumbs: string[]
      why: PaletteWhy
      badge?: string
      pinned?: boolean
      locked?: string | null
    }
  | { kind: 'hit'; id: string; hit: SearchHit; pinned: boolean }
  | { kind: 'doAnything'; id: string; query: string; locked: string | null }

/**
 * `selectable`: the indexes in `rows` of the rows that can be activated. `status`: the text for the live region.
 * `start`: where the highlight sits until the player moves it, as a position in `selectable` (0 when absent).
 * `note`: a line to show with the list, for a query whose index was cut short.
 */
export interface PaletteView {
  rows: PaletteRow[]
  selectable: number[]
  status: string
  start?: number
  note?: string
}

type Resolver = ReturnType<typeof createResolver>
type PlaceRow = Extract<PaletteRow, { kind: 'place' }>

// ---------------------------------------------------------------------------
// Small helpers

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** The first `max` characters (by code point), with an ellipsis when something was cut. */
function cut(text: string, max: number): string {
  const points = Array.from(text)
  return points.length <= max ? text : `${points.slice(0, max).join('').trimEnd()}…`
}

/** "Do Anything: buy a boat", the query cut to 40 characters for display. */
export function doAnythingLabel(query: string): string {
  return `Do Anything: ${cut(query.trim(), LABEL_QUERY_MAX)}`
}

/** The text to read for a row. */
export function rowLabel(row: PaletteRow): string {
  switch (row.kind) {
    case 'section':
    case 'place':
      return row.label
    case 'hit':
      return row.hit.entry.label
    case 'doAnything':
      return doAnythingLabel(row.query)
  }
}

/** Why a row cannot be run now (or "Not available any more."), or null. */
export function rowLock(row: PaletteRow): string | null {
  switch (row.kind) {
    case 'place':
      return row.locked ?? null
    case 'hit':
      return row.hit.locked
    case 'doAnything':
      return row.locked
    case 'section':
      return null
  }
}

/** The place a row can be pinned as: a hit's own place, a place row's, nothing for the others. */
export function rowPlace(row: PaletteRow): PlaceRef | null {
  if (row.kind === 'place') return row.ref
  if (row.kind === 'hit') return placeOfEntry(row.hit.entry)
  return null
}

/** The chip's own rule (store.returnChipVisible): same life, alive, no birthday since, and no popup waiting. */
function chipLive(point: ReturnPoint | null, g: GameState): point is ReturnPoint {
  return (
    point !== null &&
    g.character.alive &&
    g.lifeId === point.lifeId &&
    g.character.age === point.age &&
    g.year === point.year &&
    g.queue.length === 0
  )
}

// ---------------------------------------------------------------------------
// Places

/** A stand-in entry for the resolver, which reads only the tab, the id path and the type. */
function probe(tab: SearchTab, idPath: string[], type: 'action' | 'menu'): IndexEntry {
  return {
    key: '',
    tab,
    idPath,
    type,
    id: idPath[idPath.length - 1] ?? '',
    label: '',
    emoji: '',
    crumbs: [],
    labelN: '',
    kwN: '',
    crumbN: '',
    depth: idPath.length,
    locked: null,
    input: false,
  }
}

/** The ids from the root's children down to the place; an action's id is the last. Empty for a tab root. */
function idPathOf(ref: PlaceRef): string[] {
  return ref.id === undefined ? ref.path : [...ref.path, ref.id]
}

/** The live node of a place and the labels above it (the root's first), or null when it no longer resolves. */
function findPlace(ref: PlaceRef, resolve: Resolver, roots: IndexRoots): { node: MenuAction | MenuGroup; crumbs: string[] } | null {
  const root = roots[ref.tab]
  if (!root) return null
  const full = idPathOf(ref)
  if (full.length === 0) return { node: root, crumbs: [] }
  const node = resolve(probe(ref.tab, full, ref.id === undefined ? 'menu' : 'action'))
  if (!node) return null
  const crumbs = [root.label]
  for (let i = 1; i < full.length; i++) {
    const above = resolve(probe(ref.tab, full.slice(0, i), 'menu'))
    crumbs.push(above ? above.label : full[i - 1]!)
  }
  return { node, crumbs }
}

function placeRowOf(
  g: GameState,
  prefs: UiPrefs,
  resolve: Resolver,
  roots: IndexRoots,
  ref: PlaceRef,
  why: PaletteWhy,
): PlaceRow | null {
  const found = findPlace(ref, resolve, roots)
  if (!found) return null
  const lock = nodeDisabled(found.node, g)
  const row: PlaceRow = {
    kind: 'place',
    id: `${why}:${placeKey(ref)}`,
    ref,
    label: found.node.label,
    emoji: found.node.emoji,
    crumbs: found.crumbs,
    why,
    pinned: isPinned(prefs, g.lifeId, ref),
  }
  if (lock) row.locked = lock
  return row
}

/** A path with the person split off, for a sheet to open on: `person.<id>` first on Relationships becomes `personId`. */
export function openPlace(ref: PlaceRef): PlaceRef & { personId?: string } {
  if (ref.tab === 'relationships' && ref.path.length > 0) {
    const person = personIdOf(ref.path[0]!)
    if (person !== null) return { ...ref, path: ref.path.slice(1), personId: person }
  }
  return { ...ref, path: [...ref.path] }
}

// ---------------------------------------------------------------------------
// Rows

export interface PaletteArgs {
  g: GameState
  index: SearchIndex | null
  query: string
  prefs: UiPrefs
  returnPoint: ReturnPoint | null
  roots?: IndexRoots
}

function sectionRow(id: string, label: string): PaletteRow {
  return { kind: 'section', id: `section:${id}`, label }
}

/** The Back to row: the chip's target, re-resolved against the latest state. */
function backRow(g: GameState, returnPoint: ReturnPoint | null): PlaceRow | null {
  if (!chipLive(returnPoint, g)) return null
  try {
    const t = resolveReturnPoint(g, returnPoint)
    const ref = recentFromSpot(t.sheet, { path: t.path, personId: t.personId })
    return { kind: 'place', id: `back:${placeKey(ref)}`, ref, label: t.label, emoji: t.emoji, crumbs: t.crumbs.slice(0, -1), why: 'back', pinned: false }
  } catch (err) {
    console.error('[palette] the Back to target failed:', err)
    return null
  }
}

/** The rows of each root that have something waiting, in tab order, at most MAX_NEED_ROWS in all. */
function needRows(g: GameState, prefs: UiPrefs, roots: IndexRoots): PlaceRow[] {
  const out: PlaceRow[] = []
  for (const tab of TABS) {
    const root = roots[tab]
    if (out.length >= MAX_NEED_ROWS || !root || nodeDisabled(root, g)) continue
    for (const need of needsYou(groupChildren(root, g), g, MAX_NEED_ROWS - out.length)) {
      const ref: PlaceRef = need.node.type === 'menu' ? { tab, path: [need.node.id] } : { tab, path: [], id: need.node.id }
      out.push({
        kind: 'place',
        id: `need:${placeKey(ref)}`,
        ref,
        label: need.node.label,
        emoji: need.node.emoji,
        crumbs: [root.label],
        why: 'need',
        badge: need.badge,
        pinned: isPinned(prefs, g.lifeId, ref),
      })
    }
  }
  return out
}

function finish(rows: PaletteRow[], status: string): PaletteView {
  const selectable: number[] = []
  rows.forEach((r, i) => {
    if (r.kind !== 'section') selectable.push(i)
  })
  return { rows, selectable, status }
}

function emptyView(a: PaletteArgs, roots: IndexRoots, resolve: Resolver, ready: boolean): PaletteView {
  const { g, prefs } = a
  const life = lifeOf(prefs, g.lifeId)
  const rows: PaletteRow[] = []
  const add = (id: string, label: string, list: (PlaceRow | null)[]): void => {
    const shown = list.filter((r): r is PlaceRow => r !== null)
    if (shown.length > 0) rows.push(sectionRow(id, label), ...shown)
  }
  add('back', 'Back to', [backRow(g, a.returnPoint)])
  add('need', 'Needs you', needRows(g, prefs, roots))
  add('pinned', 'Pinned', life.pins.slice(0, MAX_PINS).map((ref) => placeRowOf(g, prefs, resolve, roots, ref, 'pinned')))
  add('recent', 'Recent', life.recents.slice(0, MAX_RECENTS).map((ref) => placeRowOf(g, prefs, resolve, roots, ref, 'recent')))
  const view = finish(rows, '')
  view.status = !ready ? READING_TEXT : view.selectable.length === 0 ? TYPE_TEXT : count(view.selectable.length, 'suggestion', 'suggestions')
  return view
}

/** The index's own Do Anything row. The palette ends with a row of its own, which takes the typed text. */
function isDoAnythingEntry(e: IndexEntry): boolean {
  return e.type === 'action' && e.tab === 'activities' && e.idPath.length === 1 && e.id === DO_ANYTHING_ID
}

function queryView(a: PaletteArgs, query: string, resolve: Resolver, ready: boolean): PaletteView {
  const { g, prefs } = a
  const life = lifeOf(prefs, g.lifeId)
  const found = a.index ? search(a.index, query, { pins: life.pins, recents: life.recents }, MAX_HIT_ROWS) : []
  // The index may be a little old: ask the live menus about each row we are about to show.
  const live = found
    .filter((h) => !isDoAnythingEntry(h.entry))
    .map((h): SearchHit => {
      const node = resolve(h.entry)
      return { ...h, locked: node ? nodeDisabled(node, g) : GONE_TEXT }
    })
  // Rows that can be run keep the rank order and come first; locked ones follow in their rank order.
  const open = live.filter((h) => h.locked === null)
  const shut = live.filter((h) => h.locked !== null)
  const rows: PaletteRow[] = [...open, ...shut].map((hit): PaletteRow => ({ kind: 'hit', id: `hit:${hit.entry.key}`, hit, pinned: hit.pinned }))
  rows.push({ kind: 'doAnything', id: 'doAnything', query, locked: nodeDisabled(doAnythingAction, g) })
  const hits = live.length
  const status = hits > 0 ? count(hits, 'result', 'results') : ready ? `Nothing matches "${cut(query, LABEL_QUERY_MAX)}".` : READING_TEXT
  const view = finish(rows, status)
  // A subsequence guess is not worth a tap: Enter then takes the player's own words to Do Anything.
  const best = open[0] ?? shut[0]
  if (best !== undefined && best.tier === 3) view.start = view.selectable.length - 1
  // A full list of hits needs no excuse; a short one (or none) may be missing a row the walk never reached.
  if (a.index && a.index.truncated && hits < MAX_HIT_ROWS) view.note = CUT_TEXT
  return view
}

/**
 * The palette's list for what is typed. An empty query (or only spaces) gives the places: "Back to" (the chip's target,
 * only while the chip would show), "Needs you" (at most 6), "Pinned" (at most 12) and "Recent" (at most 8), each only when
 * it has a row. Any other query gives the ranked hits, then the Do Anything row. A place that no longer resolves is left out.
 */
export function paletteRows(a: PaletteArgs): PaletteView {
  const roots = a.roots ?? defaultRoots()
  const resolve = createResolver(a.g, roots)
  const ready = a.index !== null && a.index.complete && a.index.key === indexKey(a.g)
  const query = typeof a.query === 'string' ? a.query.trim().slice(0, SUBMIT_QUERY_MAX) : ''
  return query === '' ? emptyView(a, roots, resolve, ready) : queryView(a, query, resolve, ready)
}

// ---------------------------------------------------------------------------
// The keyboard

/**
 * `active` counts rows that can be activated (an index into `view.selectable`), so a heading is never the highlight.
 * `moved`: the player moved the highlight, so `active` is theirs; without it the highlight sits on `view.start`.
 */
export interface PaletteState {
  query: string
  active: number
  moved?: boolean
}

/** The highlighted position (in `view.selectable`): where the player put it, else where the view says to start. Always inside the list. */
export function highlightOf(s: PaletteState, view: PaletteView): number {
  const n = view.selectable.length
  if (n === 0) return 0
  const want = s.moved === true ? s.active : (view.start ?? 0)
  return Math.min(Math.max(0, Math.floor(want) || 0), n - 1)
}

export type PaletteEvent = { type: 'query'; value: string } | { type: 'key'; key: string; alt?: boolean }

export type PaletteEffect = null | 'activate' | 'close' | 'pin'

/**
 * ArrowDown and ArrowUp wrap; Home, End, PageDown and PageUp move without wrapping (the text field keeps Home and End, so
 * the screen does not send them); typing hands the highlight back to the view's start. `s.active` is where the highlight
 * is now: pass highlightOf, not the stored value.
 */
export function paletteReduce(s: PaletteState, view: PaletteView, ev: PaletteEvent): { state: PaletteState; effect: PaletteEffect } {
  if (ev.type === 'query') return { state: { query: ev.value, active: 0 }, effect: null }
  const n = view.selectable.length
  const at = n === 0 ? 0 : Math.min(Math.max(0, Math.floor(s.active) || 0), n - 1)
  const move = (to: number): { state: PaletteState; effect: PaletteEffect } => ({
    state: { query: s.query, active: Math.min(Math.max(0, to), Math.max(0, n - 1)), moved: true },
    effect: null,
  })
  const same = (effect: PaletteEffect): { state: PaletteState; effect: PaletteEffect } => ({ state: s, effect })
  if (ev.alt === true) return ev.key.toLowerCase() === 'p' && n > 0 ? same('pin') : same(null)
  switch (ev.key) {
    case 'ArrowDown':
      return move(n === 0 ? 0 : (at + 1) % n)
    case 'ArrowUp':
      return move(n === 0 ? 0 : (at - 1 + n) % n)
    case 'Home':
      return move(0)
    case 'End':
      return move(n - 1)
    case 'PageDown':
      return move(at + PAGE_STEP)
    case 'PageUp':
      return move(at - PAGE_STEP)
    case 'Enter':
      return same(n > 0 ? 'activate' : null)
    case 'Escape':
      return same('close')
    default:
      return same(null)
  }
}

// ---------------------------------------------------------------------------
// A tap on a row

export type Activation =
  | { kind: 'open'; place: PlaceRef & { personId?: string } }
  | { kind: 'run'; node: MenuAction }
  | { kind: 'doAnything'; query: string }
  | { kind: 'stale' }

const STALE: Activation = { kind: 'stale' }

/**
 * What a tap on `row` means. A group or a place opens (the caller closes the palette and opens the sheet); an action is
 * handed back as the live node to run; the Do Anything row hands back its text. A row whose node has gone since the
 * list was built is stale. `resolve` was made for `g`, which is why the state itself is not read again here.
 */
export function activate(row: PaletteRow, _g: GameState, resolve: Resolver): Activation {
  switch (row.kind) {
    case 'section':
      return STALE
    case 'doAnything':
      return { kind: 'doAnything', query: row.query }
    case 'hit': {
      const node = resolve(row.hit.entry)
      if (!node) return STALE
      if (row.hit.entry.type === 'action') return node.type === 'action' ? { kind: 'run', node } : STALE
      return { kind: 'open', place: openPlace(placeOfEntry(row.hit.entry)) }
    }
    case 'place': {
      const full = idPathOf(row.ref)
      if (full.length > 0 && !resolve(probe(row.ref.tab, full, row.ref.id === undefined ? 'menu' : 'action'))) return STALE
      return { kind: 'open', place: openPlace(row.ref) }
    }
  }
}
