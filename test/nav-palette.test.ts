// R1-N6: the palette (G.9). paletteModel.ts is pure: rows for an empty query (Back to, Needs you, Pinned, Recent), rows for
// a query (ranked hits with their lock re-read live, then "Do Anything: {query}" last), the keyboard reducer and the tap
// decision. Palette.tsx is the container and the markup (inside a ModalSurface), useSearchIndex.ts keeps the index warm in
// small slices, and lazy.tsx is the gate that loads the chunk (lazyView, never React.lazy). Nothing here writes the game,
// draws, or reads a hint.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fullName } from '../src/game/core'
import { resetFlags, setFlags } from '../src/game/flags'
import { contractCondition } from '../src/game/health'
import { personGroupId } from '../src/game/hubs/people'
import { doAnythingAction } from '../src/game/menus'
import type { GameState, MenuAction, MenuGroup, MenuNode } from '../src/game/types'
import type { MenuRunner, MenuRunnerOptions } from '../src/ui/components/MenuList'
import {
  GONE_TEXT,
  READING_TEXT,
  activate,
  doAnythingLabel,
  openPlace,
  paletteReduce,
  paletteRows,
  rowLabel,
  rowLock,
  rowPlace,
  type PaletteRow,
  type PaletteState,
  type PaletteView,
} from '../src/ui/nav/paletteModel'
import { PINS_FULL_TEXT, emptyPrefs, lifeOf, pushRecent, resetPrefsForTest, togglePin, updatePrefs, usePrefs, type UiPrefs } from '../src/ui/nav/prefs'
import { placeKey, type PlaceRef } from '../src/ui/nav/place'
import {
  Palette,
  PaletteViewMarkup,
  STALE_TEXT,
  leaveFrom,
  makeController,
  ranFrom,
  togglePinRow,
  type Spot,
} from '../src/ui/nav/Palette'
import PaletteDefault from '../src/ui/nav/Palette'
import { LazyPalette } from '../src/ui/nav/lazy'
import { buildIndex, cachedIndex, clearIndexCache, createResolver, indexKey, storeIndex, type IndexRoots, type SearchIndex } from '../src/ui/nav/searchIndex'
import { search, tapsToReach } from '../src/ui/nav/searchRank'
import { runIndexJob, resetSearchIndexForTest, useSearchIndex } from '../src/ui/nav/useSearchIndex'
import { closure, dynamicImports, listSources, resolve as resolveImport, staticImports } from './lazy-kit'
import { deepFreeze } from './fuzz-kit'
import { buildIndexCached, frozen, navState, type NavTab } from './nav-kit'

// Built-in tasks resolve to nothing here (the pattern of test/ui-return.test.ts), so only what a test queues shows up.
const offline = vi.hoisted(() => {
  const resolve = vi.fn()
  return { applyFallback: resolve, resolveTask: resolve, MAX_CUSTOM_ACTIONS_PER_YEAR: 5, CUSTOM_ACTION_KEY: 'doAnything' }
})
vi.mock('../src/game/offline', () => offline)

const store = await import('../src/ui/store')
const menuList = await import('../src/ui/components/MenuList')

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const render = (el: ReactElement) => renderToStaticMarkup(el)

const TABS: NavTab[] = ['occupation', 'assets', 'relationships', 'activities']
/** The en-dash and the em-dash, built from their code points so this file holds neither. */
const DASH = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`)

beforeEach(() => {
  resetFlags()
  resetPrefsForTest()
  resetSearchIndexForTest()
  clearIndexCache()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  offline.resolveTask.mockReset()
})

afterEach(() => {
  resetFlags()
  resetPrefsForTest()
  store.clearReturnPoint()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Helpers

function act(id: string, over: Partial<MenuAction> = {}): MenuAction {
  return { type: 'action', id, label: id, emoji: 'x', run: () => {}, ...over }
}

function grp(id: string, children: MenuNode[] | (() => MenuNode[]), over: Partial<MenuGroup> = {}): MenuGroup {
  return { type: 'menu', id, label: id, emoji: 'x', children: typeof children === 'function' ? children : () => children, ...over }
}

/** Roots for a synthetic index: `group` on `tab`, an empty list on the other three tabs. */
function only(tab: NavTab, group: MenuGroup): IndexRoots {
  const roots: Record<string, MenuGroup> = {}
  for (const t of TABS) roots[t] = t === tab ? group : grp(t, [])
  return roots as IndexRoots
}

function returnPointFor(g: GameState, over: Partial<NonNullable<ReturnType<typeof store.getApp>['returnPoint']>> = {}) {
  return { sheet: 'activities' as const, path: ['computer'], scrolls: [0, 0], lifeId: g.lifeId, age: g.character.age, year: g.year, ...over }
}

function prefsWith(g: GameState, pins: PlaceRef[], recents: PlaceRef[]): UiPrefs {
  let p = emptyPrefs()
  for (const r of [...pins].reverse()) p = togglePin(p, g.lifeId, r).prefs
  for (const r of [...recents].reverse()) p = pushRecent(p, g.lifeId, r)
  return p
}

/** The adult with a diagnosed illness, so the Doctor row carries a "Needs you" badge. */
function sickAdult(): GameState {
  const g = navState('adult')
  contractCondition(g, 'Diabetes', { severity: 60, diagnosed: true, quiet: true })
  g.queue = []
  return g
}

function rowsOf(view: PaletteView, kind: PaletteRow['kind']): PaletteRow[] {
  return view.rows.filter((r) => r.kind === kind)
}

function game(): GameState {
  return store.getApp().game as GameState
}

function freshLife(): void {
  store.startNewLife({ seed: 7, year: 2026 })
  store.act((g) => {
    g.queue = []
    g.character.age = 30
  })
}

/** Render a Palette and give back what its useMenuRunner call got and returned (the capture pattern of test/nav-breadcrumbs.test.ts). */
function capturePalette(props: Parameters<typeof Palette>[0]): { opts: MenuRunnerOptions; runner: MenuRunner; html: string } {
  const real = menuList.useMenuRunner
  let opts: MenuRunnerOptions | null = null
  let runner: MenuRunner | null = null
  const spy = vi.spyOn(menuList, 'useMenuRunner').mockImplementation((o) => {
    opts = o
    runner = real(o)
    return runner
  })
  let html = ''
  try {
    html = render(createElement(Palette, props))
  } finally {
    spy.mockRestore()
  }
  if (!opts || !runner) throw new Error('the palette did not call useMenuRunner')
  return { opts, runner, html }
}

function optionTags(html: string): string[] {
  return [...html.matchAll(/<div[^>]*role="option"[^>]*>/g)].map((m) => m[0])
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)
  return m ? m[1]! : null
}

/** The text of each option, tags stripped (the option holds spans only, so the first </div> closes it). */
function optionTexts(html: string): string[] {
  return [...html.matchAll(/<div[^>]*role="option"[^>]*>(.*?)<\/div>/g)].map((m) => m[1]!.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())
}

// ---------------------------------------------------------------------------

describe('1. the empty query', () => {
  it('lists Back to, Needs you, Pinned and Recent in that order, and skips a pin that no longer resolves', () => {
    const g = deepFreeze(sickAdult())
    const pins: PlaceRef[] = [
      { tab: 'assets', path: ['investments'] },
      { tab: 'activities', path: ['gone-for-good'] },
      { tab: 'activities', path: ['computer'] },
    ]
    const recents: PlaceRef[] = [
      { tab: 'activities', path: ['doctor'] },
      { tab: 'assets', path: ['investments', 'inv-stocks'] },
    ]
    const view = paletteRows({
      g,
      index: buildIndexCached('adult'),
      query: '',
      prefs: deepFreeze(prefsWith(g, pins, recents)),
      returnPoint: returnPointFor(g),
    })
    expect(rowsOf(view, 'section').map((r) => rowLabel(r))).toEqual(['Back to', 'Needs you', 'Pinned', 'Recent'])
    const places = view.rows.filter((r): r is Extract<PaletteRow, { kind: 'place' }> => r.kind === 'place')
    expect(places.map((r) => r.why)).toEqual(['back', 'need', 'pinned', 'pinned', 'recent', 'recent'])
    const back = places[0]!
    expect(back.ref).toEqual({ tab: 'activities', path: ['computer'] })
    expect(back.crumbs).toEqual(['Activities'])
    const need = places[1]!
    expect(need.label).toBe('Doctor')
    expect(need.badge).toBe('Sick')
    expect(need.ref).toEqual({ tab: 'activities', path: ['doctor'] })
    expect(places.filter((r) => r.why === 'pinned').map((r) => placeKey(r.ref))).toEqual(['assets/investments', 'activities/computer'])
    expect(places.filter((r) => r.why === 'recent').map((r) => placeKey(r.ref))).toEqual(['activities/doctor', 'assets/investments/inv-stocks'])
    // Sections are not selectable; every other row is, in order.
    expect(view.selectable).toEqual(view.rows.flatMap((r, i) => (r.kind === 'section' ? [] : [i])))
    expect(view.status).toBe('6 suggestions')
  })

  it('leaves out a section with nothing in it, and says so when there is nothing at all', () => {
    const g = frozen('adult')
    const view = paletteRows({ g, index: buildIndexCached('adult'), query: '', prefs: emptyPrefs(), returnPoint: null })
    expect(view.rows).toEqual([])
    expect(view.selectable).toEqual([])
    expect(view.status).toBe('Type to search.')
    const pinned = paletteRows({ g, index: buildIndexCached('adult'), query: '   ', prefs: prefsWith(g, [{ tab: 'assets', path: ['investments'] }], []), returnPoint: null })
    expect(rowsOf(pinned, 'section').map((r) => rowLabel(r))).toEqual(['Pinned'])
  })

  it('reads "Still reading the menus." until the index is there for this state', () => {
    const g = frozen('adult')
    const prefs = prefsWith(g, [{ tab: 'assets', path: ['investments'] }], [])
    expect(paletteRows({ g, index: null, query: '', prefs, returnPoint: null }).status).toBe(READING_TEXT)
    expect(READING_TEXT).toBe('Still reading the menus.')
    const stale: SearchIndex = { ...buildIndexCached('adult'), key: 'another|state' }
    expect(paletteRows({ g, index: stale, query: '', prefs, returnPoint: null }).status).toBe(READING_TEXT)
    const partial: SearchIndex = { ...buildIndexCached('adult'), complete: false }
    expect(paletteRows({ g, index: partial, query: '', prefs, returnPoint: null }).status).toBe(READING_TEXT)
    // The pins still show while the index is read: they resolve on their own.
    expect(rowsOf(paletteRows({ g, index: null, query: '', prefs, returnPoint: null }), 'place')).toHaveLength(1)
  })

  it('shows the Back to row only while the chip itself would show', () => {
    const g = frozen('adult')
    const ready = buildIndexCached('adult')
    const view = (point: ReturnType<typeof returnPointFor> | null, state: GameState = g) =>
      paletteRows({ g: state, index: ready, query: '', prefs: emptyPrefs(), returnPoint: point })
    expect(rowsOf(view(returnPointFor(g)), 'place')).toHaveLength(1)
    expect(view(null).rows).toEqual([])
    expect(view(returnPointFor(g, { age: g.character.age - 1 })).rows).toEqual([])
    expect(view(returnPointFor(g, { year: g.year - 1 })).rows).toEqual([])
    expect(view(returnPointFor(g, { lifeId: 'another-life' })).rows).toEqual([])
    const busy = structuredClone(g)
    busy.queue = [{ kind: 'notice', id: 'm1', title: 'T', text: 'x' } as never]
    expect(view(returnPointFor(busy), busy).rows).toEqual([])
    const dead = structuredClone(g)
    dead.character.alive = false
    expect(view(returnPointFor(dead), dead).rows).toEqual([])
  })

  it('agrees with the store about when the chip shows', () => {
    freshLife()
    const g = game()
    store.setReturnPoint({ sheet: 'activities', path: ['computer'], scrolls: [0, 0] })
    const point = store.getApp().returnPoint
    // This life has no job yet, so a Needs you row may sit beside the Back to row: look for the Back to row itself.
    const shows = () =>
      paletteRows({ g: game(), index: null, query: '', prefs: emptyPrefs(), returnPoint: store.getApp().returnPoint }).rows.some((r) => r.kind === 'place' && r.why === 'back')
    expect(store.returnChipVisible(point, g)).toBe(true)
    expect(shows()).toBe(true)
    store.act((s) => {
      s.queue.push({ kind: 'notice', id: 'm9', title: 'T', text: 'x' } as never)
    })
    expect(store.returnChipVisible(store.getApp().returnPoint, game())).toBe(false)
    expect(shows()).toBe(false)
  })

  it('puts a person on the Back to row for a Relationships spot, and the root when the person has left', () => {
    const g = frozen('adult')
    const friend = g.people.find((p) => p.relation === 'friend')!
    const view = paletteRows({
      g,
      index: buildIndexCached('adult'),
      query: '',
      prefs: emptyPrefs(),
      returnPoint: returnPointFor(g, { sheet: 'relationships', personId: friend.id, path: [] }),
    })
    const back = view.rows.find((r) => r.kind === 'place')!
    expect(back.kind === 'place' && back.ref).toEqual({ tab: 'relationships', path: [personGroupId(friend.id)] })
    expect(back.kind === 'place' && back.label).toBe(fullName(friend))
    expect(back.kind === 'place' && back.crumbs).toEqual(['Relationships'])
    const gone = paletteRows({
      g,
      index: buildIndexCached('adult'),
      query: '',
      prefs: emptyPrefs(),
      returnPoint: returnPointFor(g, { sheet: 'relationships', personId: 'nobody', path: [] }),
    })
    const root = gone.rows.find((r) => r.kind === 'place')!
    expect(root.kind === 'place' && root.ref).toEqual({ tab: 'relationships', path: [] })
  })

  it('shows at most 6 Needs you rows, over the four roots in tab order', () => {
    const g = frozen('adult')
    const flagged = Array.from({ length: 8 }, (_, i) => grp(`flag${i}`, [act('x')], { badge: () => 'Soon' }))
    const roots = only('activities', grp('activities', flagged))
    const index = buildIndex(g, roots)
    const view = paletteRows({ g, index, query: '', prefs: emptyPrefs(), returnPoint: null, roots })
    const needs = view.rows.filter((r) => r.kind === 'place')
    expect(needs).toHaveLength(6)
    expect(needs.map((r) => r.kind === 'place' && r.ref.path[0])).toEqual(['flag0', 'flag1', 'flag2', 'flag3', 'flag4', 'flag5'])
  })

  it('holds at most 12 pins and 8 recents', () => {
    const g = frozen('adult')
    const many = (n: number): PlaceRef[] => Array.from({ length: n }, (_, i) => ({ tab: 'activities', path: [`g${i}`] }) as PlaceRef)
    const roots = only('activities', grp('activities', many(20).map((p) => grp(p.path[0]!, [act('a')]))))
    const prefs: UiPrefs = {
      v: 1,
      lives: Object.assign(Object.create(null), { [g.lifeId]: { pins: many(14), recents: many(10) } }),
      order: [g.lifeId],
    }
    const view = paletteRows({ g, index: buildIndex(g, roots), query: '', prefs, returnPoint: null, roots })
    const places = view.rows.filter((r): r is Extract<PaletteRow, { kind: 'place' }> => r.kind === 'place')
    expect(places.filter((r) => r.why === 'pinned')).toHaveLength(12)
    expect(places.filter((r) => r.why === 'recent')).toHaveLength(8)
  })

  it('marks a pinned place as pinned, and shows the lock of a locked pin', () => {
    const g = frozen('adult')
    let lock: string | null = null
    const roots = only('activities', grp('activities', [grp('door', [act('a')], { disabledReason: () => lock }), grp('open', [act('b')])]))
    const index = buildIndex(g, roots)
    const prefs = prefsWith(g, [{ tab: 'activities', path: ['door'] }], [{ tab: 'activities', path: ['open'] }])
    lock = 'Come back later.'
    const view = paletteRows({ g, index, query: '', prefs, returnPoint: null, roots })
    const places = view.rows.filter((r): r is Extract<PaletteRow, { kind: 'place' }> => r.kind === 'place')
    const pin = places.find((r) => r.why === 'pinned')!
    expect(pin.pinned).toBe(true)
    expect(rowLock(pin)).toBe('Come back later.')
    const recent = places.find((r) => r.why === 'recent')!
    expect(recent.pinned).toBe(false)
    expect(rowLock(recent)).toBeNull()
  })
})

// ---------------------------------------------------------------------------

describe('2. a query', () => {
  it('"stock": the Stocks group is first and "Do Anything: stock" is last', () => {
    const g = frozen('adult')
    const view = paletteRows({ g, index: buildIndexCached('adult'), query: 'stock', prefs: emptyPrefs(), returnPoint: null })
    const first = view.rows[view.selectable[0]!]!
    expect(first.kind).toBe('hit')
    expect(first.kind === 'hit' && first.hit.entry.id).toBe('inv-stocks')
    expect(rowLabel(first)).toBe('Stocks')
    const last = view.rows[view.rows.length - 1]!
    expect(last.kind).toBe('doAnything')
    expect(rowLabel(last)).toBe('Do Anything: stock')
    expect(view.selectable[view.selectable.length - 1]).toBe(view.rows.length - 1)
    expect(rowsOf(view, 'section')).toEqual([])
    expect(rowsOf(view, 'hit').length).toBeLessThanOrEqual(30)
  })

  it('cuts a long input to 40 characters in the label only, and submits up to 300', () => {
    const g = frozen('adult')
    const long = 'a'.repeat(120)
    const view = paletteRows({ g, index: buildIndexCached('adult'), query: long, prefs: emptyPrefs(), returnPoint: null })
    const last = view.rows[view.rows.length - 1]!
    expect(last.kind === 'doAnything' && last.query).toBe(long)
    expect(rowLabel(last)).toBe(`Do Anything: ${'a'.repeat(40)}…`)
    expect(doAnythingLabel('x'.repeat(40))).toBe(`Do Anything: ${'x'.repeat(40)}`)
    const huge = paletteRows({ g, index: null, query: 'b'.repeat(500), prefs: emptyPrefs(), returnPoint: null })
    const row = huge.rows[huge.rows.length - 1]!
    expect(row.kind === 'doAnything' && row.query.length).toBe(300)
  })

  it('trims the query it submits', () => {
    const g = frozen('adult')
    const view = paletteRows({ g, index: buildIndexCached('adult'), query: '  buy a boat  ', prefs: emptyPrefs(), returnPoint: null })
    const last = view.rows[view.rows.length - 1]!
    expect(last.kind === 'doAnything' && last.query).toBe('buy a boat')
  })

  it('still ends with the Do Anything row when nothing matches, and says what happened', () => {
    const g = frozen('adult')
    const view = paletteRows({ g, index: buildIndexCached('adult'), query: 'qqzzxx', prefs: emptyPrefs(), returnPoint: null })
    expect(view.rows).toHaveLength(1)
    expect(view.rows[0]!.kind).toBe('doAnything')
    expect(view.status).toBe('Nothing matches "qqzzxx".')
  })

  it('counts the hits, not the Do Anything row', () => {
    const g = frozen('adult')
    const roots = only('activities', grp('activities', ['one', 'two', 'three', 'four', 'five'].map((n) => act(`${n}-widget`))))
    const index = buildIndex(g, roots)
    const five = paletteRows({ g, index, query: 'widget', prefs: emptyPrefs(), returnPoint: null, roots })
    expect(five.status).toBe('5 results')
    expect(five.rows).toHaveLength(6)
    const one = paletteRows({ g, index, query: 'five widget', prefs: emptyPrefs(), returnPoint: null, roots })
    expect(one.status).toBe('1 result')
  })

  it('says it is still reading the menus when there is no index to search yet', () => {
    const g = frozen('adult')
    const view = paletteRows({ g, index: null, query: 'stock', prefs: emptyPrefs(), returnPoint: null })
    expect(view.status).toBe(READING_TEXT)
    expect(view.rows).toHaveLength(1)
    expect(view.rows[0]!.kind).toBe('doAnything')
  })

  it('leaves the index\'s own Do Anything entry out, since the palette ends with its own row', () => {
    const g = frozen('adult')
    const view = paletteRows({ g, index: buildIndexCached('adult'), query: 'do anything', prefs: emptyPrefs(), returnPoint: null })
    expect(rowsOf(view, 'hit').some((r) => r.kind === 'hit' && r.hit.entry.id === 'doAnything')).toBe(false)
    expect(view.rows.filter((r) => r.kind === 'doAnything')).toHaveLength(1)
  })

  it('treats a query of only spaces as the empty state', () => {
    const g = frozen('adult')
    const prefs = prefsWith(g, [{ tab: 'assets', path: ['investments'] }], [])
    const view = paletteRows({ g, index: buildIndexCached('adult'), query: '   ', prefs, returnPoint: null })
    expect(rowsOf(view, 'doAnything')).toEqual([])
    expect(rowsOf(view, 'section').map((r) => rowLabel(r))).toEqual(['Pinned'])
  })

  it('carries the pinned flag of a hit and lets a pinned hit lead its tier', () => {
    const g = frozen('adult')
    const roots = only('activities', grp('activities', [act('alpha-widget'), act('beta-widget'), act('gamma-widget')]))
    const index = buildIndex(g, roots)
    const prefs = prefsWith(g, [{ tab: 'activities', path: [], id: 'gamma-widget' }], [])
    const view = paletteRows({ g, index, query: 'widget', prefs, returnPoint: null, roots })
    const hits = rowsOf(view, 'hit')
    expect(hits.map((r) => r.kind === 'hit' && r.hit.entry.id)).toEqual(['gamma-widget', 'alpha-widget', 'beta-widget'])
    expect(hits.map((r) => r.kind === 'hit' && r.pinned)).toEqual([true, false, false])
  })

  it('runs on a frozen state and frozen prefs, writes nothing, and gives the same rows twice', () => {
    const g = frozen('adult')
    const before = JSON.stringify(g)
    const prefs = deepFreeze(prefsWith(g, [{ tab: 'assets', path: ['investments'] }], [{ tab: 'activities', path: ['computer'] }]))
    const index = buildIndexCached('adult')
    const a = paletteRows({ g, index, query: 'stock', prefs, returnPoint: null })
    const b = paletteRows({ g, index, query: 'stock', prefs, returnPoint: null })
    expect(b).toEqual(a)
    paletteRows({ g, index, query: '', prefs, returnPoint: returnPointFor(g) })
    expect(JSON.stringify(g)).toBe(before)
  })
})

// ---------------------------------------------------------------------------

describe('3. the Do Anything lock', () => {
  it('is "You are too young to do that." for a child of 3, and null for the adult', () => {
    const kid = navState('kid')
    kid.character.age = 3
    const kidView = paletteRows({ g: deepFreeze(kid), index: null, query: 'fly', prefs: emptyPrefs(), returnPoint: null })
    const kidRow = kidView.rows[kidView.rows.length - 1]!
    expect(kidRow.kind === 'doAnything' && kidRow.locked).toBe('You are too young to do that.')
    expect(rowLock(kidRow)).toBe('You are too young to do that.')
    const adultView = paletteRows({ g: frozen('adult'), index: null, query: 'fly', prefs: emptyPrefs(), returnPoint: null })
    const adultRow = adultView.rows[adultView.rows.length - 1]!
    expect(adultRow.kind === 'doAnything' && adultRow.locked).toBeNull()
    expect(rowLock(adultRow)).toBeNull()
  })
})

// ---------------------------------------------------------------------------

describe('4. the lock is read live', () => {
  it('sorts a locked hit after the unlocked ones, and shows "Not available any more." for a row that has gone', () => {
    const g = frozen('adult')
    let shown = true
    let alpha: string | null = 'Not yet.'
    let delta: string | null = null
    const roots = only(
      'activities',
      grp('activities', [
        act('alpha-widget', { disabledReason: () => alpha }),
        act('beta-widget'),
        act('gamma-widget', { visible: () => shown }),
        act('delta-widget', { disabledReason: () => delta }),
      ]),
    )
    const index = buildIndex(g, roots)
    // At index time the index puts locked alpha last: beta, delta, gamma, alpha. Then alpha opens, delta closes and gamma goes.
    expect(search(index, 'widget', { pins: [], recents: [] }).map((h) => h.entry.id)).toEqual(['beta-widget', 'delta-widget', 'gamma-widget', 'alpha-widget'])
    alpha = null
    delta = 'Closed today.'
    shown = false
    const view = paletteRows({ g, index, query: 'widget', prefs: emptyPrefs(), returnPoint: null, roots })
    const hits = rowsOf(view, 'hit')
    // Unlocked first (beta, alpha), then the locked ones in rank order: closed (delta) and gone (gamma).
    expect(hits.map((r) => r.kind === 'hit' && r.hit.entry.id)).toEqual(['beta-widget', 'alpha-widget', 'delta-widget', 'gamma-widget'])
    expect(hits.map((r) => rowLock(r))).toEqual([null, null, 'Closed today.', GONE_TEXT])
    expect(GONE_TEXT).toBe('Not available any more.')
  })

  it('a person who has left shows as "Not available any more."', () => {
    const g = navState('adult')
    const friend = g.people.find((p) => p.relation === 'friend')!
    const index = buildIndexCached('adult')
    expect(index.entries.some((e) => e.id === personGroupId(friend.id))).toBe(true)
    g.people = g.people.filter((p) => p.id !== friend.id)
    const view = paletteRows({ g: deepFreeze(g), index, query: fullName(friend), prefs: emptyPrefs(), returnPoint: null })
    const hit = rowsOf(view, 'hit').find((r) => r.kind === 'hit' && r.hit.entry.id === personGroupId(friend.id))
    expect(hit).toBeDefined()
    expect(rowLock(hit!)).toBe(GONE_TEXT)
    // The index was built before this person left, so it is out of date.
    expect(index.key).not.toBe(indexKey(g))
  })

  it('shows a lock that appeared after the index was built', () => {
    const g = frozen('adult')
    let lock: string | null = null
    const roots = only('activities', grp('activities', [act('alpha-widget', { disabledReason: () => lock }), act('beta-widget')]))
    const index = buildIndex(g, roots)
    lock = 'Back in spring.'
    const view = paletteRows({ g, index, query: 'widget', prefs: emptyPrefs(), returnPoint: null, roots })
    const hits = rowsOf(view, 'hit')
    expect(hits.map((r) => r.kind === 'hit' && r.hit.entry.id)).toEqual(['beta-widget', 'alpha-widget'])
    expect(rowLock(hits[1]!)).toBe('Back in spring.')
  })

  it('re-reads the lock of at most 30 rows', () => {
    const g = frozen('adult')
    let reads = 0
    const widgets = Array.from({ length: 45 }, (_, i) => act(`w${String(i).padStart(2, '0')}-widget`, { disabledReason: () => (reads++, null) }))
    const roots = only('activities', grp('activities', widgets))
    const index = buildIndex(g, roots)
    reads = 0
    const view = paletteRows({ g, index, query: 'widget', prefs: emptyPrefs(), returnPoint: null, roots })
    expect(rowsOf(view, 'hit')).toHaveLength(30)
    expect(reads).toBeLessThanOrEqual(30)
  })
})

// ---------------------------------------------------------------------------

describe('5. paletteReduce', () => {
  const view = (n: number): PaletteView => ({ rows: [], selectable: Array.from({ length: n }, (_, i) => i + 1), status: '' })
  const at = (active: number): PaletteState => ({ query: 'q', active })
  const key = (k: string, alt = false) => ({ type: 'key' as const, key: k, alt })

  it('ArrowDown and ArrowUp wrap at both ends', () => {
    expect(paletteReduce(at(0), view(4), key('ArrowDown')).state.active).toBe(1)
    expect(paletteReduce(at(3), view(4), key('ArrowDown')).state.active).toBe(0)
    expect(paletteReduce(at(0), view(4), key('ArrowUp')).state.active).toBe(3)
    expect(paletteReduce(at(2), view(4), key('ArrowUp')).state.active).toBe(1)
    expect(paletteReduce(at(0), view(1), key('ArrowDown')).state.active).toBe(0)
  })

  it('Home and End jump to the ends, PageDown and PageUp move by 8 and stop at the ends', () => {
    expect(paletteReduce(at(5), view(20), key('Home')).state.active).toBe(0)
    expect(paletteReduce(at(5), view(20), key('End')).state.active).toBe(19)
    expect(paletteReduce(at(5), view(20), key('PageDown')).state.active).toBe(13)
    expect(paletteReduce(at(15), view(20), key('PageDown')).state.active).toBe(19)
    expect(paletteReduce(at(13), view(20), key('PageUp')).state.active).toBe(5)
    expect(paletteReduce(at(3), view(20), key('PageUp')).state.active).toBe(0)
  })

  it('Enter activates, Escape closes, Alt+P pins, and nothing else has an effect', () => {
    expect(paletteReduce(at(2), view(4), key('Enter'))).toEqual({ state: at(2), effect: 'activate' })
    expect(paletteReduce(at(2), view(4), key('Escape'))).toEqual({ state: at(2), effect: 'close' })
    expect(paletteReduce(at(2), view(4), key('p', true))).toEqual({ state: at(2), effect: 'pin' })
    expect(paletteReduce(at(2), view(4), key('P', true)).effect).toBe('pin')
    expect(paletteReduce(at(2), view(4), key('p')).effect).toBeNull()
    expect(paletteReduce(at(2), view(4), key('a')).effect).toBeNull()
    expect(paletteReduce(at(2), view(4), key('Tab')).state).toEqual(at(2))
  })

  it('Enter and Alt+P on an empty list have no effect, but Escape still closes', () => {
    expect(paletteReduce(at(0), view(0), key('Enter')).effect).toBeNull()
    expect(paletteReduce(at(0), view(0), key('p', true)).effect).toBeNull()
    expect(paletteReduce(at(0), view(0), key('Escape')).effect).toBe('close')
    expect(paletteReduce(at(0), view(0), key('ArrowDown')).state.active).toBe(0)
    expect(paletteReduce(at(0), view(0), key('End')).state.active).toBe(0)
  })

  it('typing sets the text and puts the highlight back on the first row', () => {
    const out = paletteReduce(at(3), view(4), { type: 'query', value: 'stoc' })
    expect(out).toEqual({ state: { query: 'stoc', active: 0 }, effect: null })
  })

  it('a highlight that is past a shorter list is pulled back first', () => {
    expect(paletteReduce(at(9), view(3), key('ArrowDown')).state.active).toBe(0)
    expect(paletteReduce(at(9), view(3), key('ArrowUp')).state.active).toBe(1)
  })

  it('moves over selectable positions, so a section heading is never the highlight', () => {
    const g = deepFreeze(sickAdult())
    const prefs = prefsWith(g, [{ tab: 'assets', path: ['investments'] }], [{ tab: 'activities', path: ['doctor'] }])
    const v = paletteRows({ g, index: buildIndexCached('adult'), query: '', prefs, returnPoint: returnPointFor(g) })
    expect(rowsOf(v, 'section').length).toBeGreaterThan(1)
    let s: PaletteState = { query: '', active: 0 }
    for (let i = 0; i < v.selectable.length * 2; i++) {
      expect(v.rows[v.selectable[s.active]!]!.kind).not.toBe('section')
      s = paletteReduce(s, v, key('ArrowDown')).state
    }
  })
})

// ---------------------------------------------------------------------------

describe('6. activate', () => {
  it('a group hit opens its place', () => {
    const g = frozen('adult')
    const index = buildIndexCached('adult')
    const view = paletteRows({ g, index, query: 'stock', prefs: emptyPrefs(), returnPoint: null })
    const row = view.rows[view.selectable[0]!]!
    expect(activate(row, g, createResolver(g))).toEqual({ kind: 'open', place: { tab: 'assets', path: ['investments', 'inv-stocks'] } })
  })

  it('a person hit opens Relationships on the person, with the in-sheet path shortened', () => {
    const g = frozen('adult')
    const friend = g.people.find((p) => p.relation === 'friend')!
    const index = buildIndexCached('adult')
    const entry = index.entries.find((e) => e.id === personGroupId(friend.id))!
    const row: PaletteRow = { kind: 'hit', id: 'h', hit: { entry, tier: 0, pinned: false, recent: -1, locked: null }, pinned: false }
    expect(activate(row, g, createResolver(g))).toEqual({ kind: 'open', place: { tab: 'relationships', path: [], personId: friend.id } })
    const deeper = { ...entry, idPath: [personGroupId(friend.id), 'talk'], id: 'talk', type: 'menu' as const }
    const resolveDeeper = (): MenuGroup => grp('talk', [])
    const deeperRow: PaletteRow = { kind: 'hit', id: 'h2', hit: { entry: deeper, tier: 0, pinned: false, recent: -1, locked: null }, pinned: false }
    const out = activate(deeperRow, g, resolveDeeper)
    expect(out).toEqual({ kind: 'open', place: { tab: 'relationships', path: ['talk'], personId: friend.id } })
  })

  it('an action hit runs the live node', () => {
    const g = frozen('adult')
    const live = act('alpha-widget')
    const roots = only('activities', grp('activities', [live]))
    const index = buildIndex(g, roots)
    const view = paletteRows({ g, index, query: 'alpha', prefs: emptyPrefs(), returnPoint: null, roots })
    const out = activate(view.rows[view.selectable[0]!]!, g, createResolver(g, roots))
    expect(out.kind).toBe('run')
    expect(out.kind === 'run' && out.node).toBe(live)
  })

  it('a node that was deleted gives stale, for an action and for a group', () => {
    const g = frozen('adult')
    let shown = true
    const roots = only('activities', grp('activities', [act('alpha-widget', { visible: () => shown }), grp('beta-widget', [act('x')], { visible: () => shown })]))
    const index = buildIndex(g, roots)
    const view = paletteRows({ g, index, query: 'widget', prefs: emptyPrefs(), returnPoint: null, roots })
    shown = false
    const resolve = createResolver(g, roots)
    for (const row of rowsOf(view, 'hit')) expect(activate(row, g, resolve)).toEqual({ kind: 'stale' })
  })

  it('the Do Anything row gives its own kind, with the query', () => {
    const g = frozen('adult')
    const row: PaletteRow = { kind: 'doAnything', id: 'doAnything', query: 'buy a boat', locked: null }
    expect(activate(row, g, createResolver(g))).toEqual({ kind: 'doAnything', query: 'buy a boat' })
  })

  it('a place row opens its place (a person place gets the person apart), or is stale when it no longer resolves', () => {
    const g = frozen('adult')
    const friend = g.people.find((p) => p.relation === 'friend')!
    const resolve = createResolver(g)
    const place = (ref: PlaceRef): PaletteRow => ({ kind: 'place', id: 'p', ref, label: 'x', emoji: 'x', crumbs: [], why: 'recent' })
    expect(activate(place({ tab: 'activities', path: ['computer'] }), g, resolve)).toEqual({ kind: 'open', place: { tab: 'activities', path: ['computer'] } })
    expect(activate(place({ tab: 'relationships', path: [personGroupId(friend.id)] }), g, resolve)).toEqual({
      kind: 'open',
      place: { tab: 'relationships', path: [], personId: friend.id },
    })
    expect(activate(place({ tab: 'activities', path: ['gone-for-good'] }), g, resolve)).toEqual({ kind: 'stale' })
    // A place whose action has gone is stale too.
    expect(activate(place({ tab: 'activities', path: ['computer'], id: 'whatever' }), g, createResolver(g))).toEqual({ kind: 'stale' })
  })

  it('a tab root is a place that always resolves', () => {
    const g = frozen('adult')
    const row: PaletteRow = { kind: 'place', id: 'p', ref: { tab: 'activities', path: [] }, label: 'Activities', emoji: 'x', crumbs: [], why: 'recent' }
    expect(activate(row, g, createResolver(g))).toEqual({ kind: 'open', place: { tab: 'activities', path: [] } })
  })

  it('openPlace splits the person off a Relationships path and leaves every other tab alone', () => {
    expect(openPlace({ tab: 'relationships', path: ['person.p7', 'talk', 'x'], id: 'hug' })).toEqual({ tab: 'relationships', path: ['talk', 'x'], id: 'hug', personId: 'p7' })
    expect(openPlace({ tab: 'relationships', path: [] })).toEqual({ tab: 'relationships', path: [] })
    expect(openPlace({ tab: 'relationships', path: ['rel.h.friends'] })).toEqual({ tab: 'relationships', path: ['rel.h.friends'] })
    expect(openPlace({ tab: 'assets', path: ['person.p7'] })).toEqual({ tab: 'assets', path: ['person.p7'] })
  })

  it('rowPlace gives the place of a hit or a place, and nothing for the Do Anything row or a heading', () => {
    const entry = buildIndexCached('adult').entries.find((e) => e.id === 'inv-stocks')!
    const hit: Extract<PaletteRow, { kind: 'hit' }> = { kind: 'hit', id: 'h', hit: { entry, tier: 0, pinned: false, recent: -1, locked: null }, pinned: false }
    expect(rowPlace(hit)).toEqual({ tab: 'assets', path: ['investments', 'inv-stocks'] })
    const action = { ...entry, type: 'action' as const, idPath: ['investments', 'x'], id: 'x' }
    expect(rowPlace({ ...hit, hit: { ...hit.hit, entry: action } })).toEqual({ tab: 'assets', path: ['investments'], id: 'x' })
    const ref: PlaceRef = { tab: 'activities', path: ['computer'] }
    expect(rowPlace({ kind: 'place', id: 'p', ref, label: 'x', emoji: 'x', crumbs: [], why: 'pinned' })).toEqual(ref)
    expect(rowPlace({ kind: 'doAnything', id: 'doAnything', query: 'x', locked: null })).toBeNull()
    expect(rowPlace({ kind: 'section', id: 's', label: 'Pinned' })).toBeNull()
  })
})

// ---------------------------------------------------------------------------

describe('7. the markup', () => {
  const ids = { list: 'pal-list', option: (i: number) => `pal-opt-${i}` }
  const noop = () => {}

  function sample(): { view: PaletteView; state: PaletteState } {
    const g = frozen('adult')
    const prefs = prefsWith(g, [{ tab: 'assets', path: ['investments'] }], [])
    const v = paletteRows({ g, index: buildIndexCached('adult'), query: 'stock', prefs, returnPoint: null })
    return { view: { ...v, status: '5 results' }, state: { query: 'stock', active: 1 } }
  }

  const markup = (view: PaletteView, state: PaletteState) =>
    render(createElement(PaletteViewMarkup, { view, state, ids, onQuery: noop, onPick: noop, onPin: noop }))

  it('has the dialog, combobox, listbox and option roles', () => {
    const { view, state } = sample()
    const html = markup(view, state)
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('role="combobox"')
    expect(html).toContain('role="listbox"')
    expect(html).toContain('placeholder="Search actions, people, companies"')
    expect(attr(/<input[^>]*>/.exec(html)![0], 'aria-expanded')).toBe('true')
    expect(attr(/<input[^>]*>/.exec(html)![0], 'aria-controls')).toBe('pal-list')
    expect(/<[^>]*role="listbox"[^>]*>/.exec(html)![0]).toContain('id="pal-list"')
  })

  it('gives every option a unique id, marks only the active one selected, and points aria-activedescendant at it', () => {
    const { view, state } = sample()
    const html = markup(view, state)
    const tags = optionTags(html)
    expect(tags).toHaveLength(view.selectable.length)
    const idList = tags.map((t) => attr(t, 'id'))
    expect(new Set(idList).size).toBe(tags.length)
    expect(idList).toEqual(view.selectable.map((_, i) => ids.option(i)))
    expect(tags.filter((t) => attr(t, 'aria-selected') === 'true')).toHaveLength(1)
    expect(attr(tags[1]!, 'aria-selected')).toBe('true')
    expect(attr(/<input[^>]*>/.exec(html)![0], 'aria-activedescendant')).toBe(ids.option(1))
  })

  it('has a polite, visually hidden status line', () => {
    const { view, state } = sample()
    const html = markup(view, state)
    const status = /<div[^>]*role="status"[^>]*>(.*?)<\/div>/.exec(html)!
    expect(status[0]).toContain('aria-live="polite"')
    expect(status[0]).toContain('sr-only')
    expect(status[1]).toBe('5 results')
  })

  it('has a pin button on a result row, with the state in aria-pressed', () => {
    const g = frozen('adult')
    const prefs = prefsWith(g, [{ tab: 'assets', path: ['investments', 'inv-stocks'] }], [])
    const v = paletteRows({ g, index: buildIndexCached('adult'), query: 'stock', prefs, returnPoint: null })
    const html = markup(v, { query: 'stock', active: 0 })
    const buttons = [...html.matchAll(/<button[^>]*class="palette-pin"[^>]*>/g)].map((m) => m[0])
    expect(buttons.length).toBe(rowsOf(v, 'hit').length)
    expect(attr(buttons[0]!, 'aria-pressed')).toBe('true')
    expect(attr(buttons[0]!, 'aria-label')).toBe('Pin Stocks')
    expect(attr(buttons[1]!, 'aria-pressed')).toBe('false')
    for (const b of buttons) expect(attr(b, 'tabindex')).toBe('-1')
    // The Do Anything row has no place to pin.
    expect(html.match(/<button[^>]*class="palette-pin"/g)!.length).toBe(rowsOf(v, 'hit').length)
  })

  it('shows the section headings as groups, and the lock reason with a lock glyph', () => {
    const g = deepFreeze(sickAdult())
    let lock: string | null = null
    const roots = only('activities', grp('activities', [grp('door', [act('a')], { disabledReason: () => lock })]))
    const index = buildIndex(g, roots)
    lock = 'Come back later.'
    const prefs = prefsWith(g, [{ tab: 'activities', path: ['door'] }], [])
    const v = paletteRows({ g, index, query: '', prefs, returnPoint: null, roots })
    const html = markup(v, { query: '', active: 0 })
    expect(html).toContain('role="group"')
    expect(html).toContain('Pinned')
    expect(html).toContain('Come back later.')
    expect(html).toContain('\u{1F512}')
    expect(attr(optionTags(html)[0]!, 'aria-disabled')).toBe('true')
  })

  it('shows a note instead of a list when there is nothing to show', () => {
    const html = markup({ rows: [], selectable: [], status: 'Type to search.' }, { query: '', active: 0 })
    expect(html).toContain('palette-empty')
    expect(optionTags(html)).toEqual([])
  })

  it('shows the Do Anything row with its label and its lock', () => {
    const view: PaletteView = {
      rows: [{ kind: 'doAnything', id: 'doAnything', query: 'fly to the moon', locked: 'You are too young to do that.' }],
      selectable: [0],
      status: '0 results',
    }
    const html = markup(view, { query: 'fly to the moon', active: 0 })
    expect(optionTexts(html)[0]).toContain('Do Anything: fly to the moon')
    expect(optionTexts(html)[0]).toContain('You are too young to do that.')
  })
})

// ---------------------------------------------------------------------------

describe('8. acceptance: a stock is found and opened in at most 4 taps', () => {
  it('typing "stock" shows Stocks in the first option', () => {
    const g = frozen('adult')
    const index = buildIndexCached('adult')
    const html = render(createElement(Palette, { g, onClose: () => {}, onOpenPlace: () => {}, indexOverride: index, initialQuery: 'stock' }))
    const texts = optionTexts(html)
    expect(texts[0]).toContain('Stocks')
    expect(texts[texts.length - 1]).toContain('Do Anything: stock')
    const stocks = index.entries.find((e) => e.id === 'inv-stocks')!
    expect(tapsToReach(stocks)).toBeLessThanOrEqual(4)
  })

  it('opens the empty palette with the input focused for typing and nothing selected from a query', () => {
    const g = frozen('adult')
    const html = render(createElement(Palette, { g, onClose: () => {}, onOpenPlace: () => {}, indexOverride: buildIndexCached('adult') }))
    expect(html).toContain('<input')
    expect(optionTexts(html)).toEqual([])
    expect(html).toContain('palette-empty')
  })
})

// ---------------------------------------------------------------------------

describe('9. the runner', () => {
  it('submitting Do Anything queues a customAction task and closes the palette', () => {
    freshLife()
    const closed = vi.fn()
    const { runner } = capturePalette({ g: game(), onClose: closed, onOpenPlace: () => {}, indexOverride: null })
    runner.submit(doAnythingAction, 'buy a boat')
    expect(offline.resolveTask).toHaveBeenCalledTimes(1)
    expect(offline.resolveTask.mock.calls[0]![1]).toMatchObject({ type: 'customAction', text: 'buy a boat' })
    expect(closed).toHaveBeenCalledTimes(1)
  })

  it('tapping an action that asks for a value runs nothing', () => {
    freshLife()
    const closed = vi.fn()
    const { runner, opts } = capturePalette({ g: game(), onClose: closed, onOpenPlace: () => {}, indexOverride: null })
    const onRan = vi.fn()
    opts.onRan = onRan
    const before = JSON.stringify(game())
    runner.tap(doAnythingAction)
    expect(JSON.stringify(game())).toBe(before)
    expect(onRan).not.toHaveBeenCalled()
    expect(closed).not.toHaveBeenCalled()
    expect(offline.resolveTask).not.toHaveBeenCalled()
  })

  it('passes onClose to the runner, and an onOpenGroup that does nothing', () => {
    freshLife()
    const closed = vi.fn()
    const { opts } = capturePalette({ g: game(), onClose: closed, onOpenPlace: () => {}, indexOverride: null })
    expect(opts.onClose).toBe(closed)
    expect(() => opts.onOpenGroup(grp('g', []))).not.toThrow()
  })

  it('leaveFrom remembers the list the action was in as the Back to spot', () => {
    freshLife()
    leaveFrom({ tab: 'activities', path: ['computer', 'ventures'] })
    expect(store.getApp().returnPoint).toMatchObject({ sheet: 'activities', path: ['computer', 'ventures'], scrolls: [0, 0, 0] })
    store.clearReturnPoint()
    leaveFrom({ tab: 'relationships', personId: 'p3', path: [] })
    expect(store.getApp().returnPoint).toMatchObject({ sheet: 'relationships', personId: 'p3', path: [], scrolls: [0] })
    store.clearReturnPoint()
    leaveFrom(null)
    expect(store.getApp().returnPoint).toBeNull()
  })

  it('ranFrom pushes the recent in the format the sheets write (behind navPalette)', () => {
    freshLife()
    const action = act('hug')
    ranFrom(game().lifeId, { tab: 'relationships', personId: 'p3', path: ['talk'] }, action)
    expect(lifeOf(prefsNow(), game().lifeId).recents).toEqual([])
    setFlags({ navPalette: true })
    ranFrom(game().lifeId, { tab: 'relationships', personId: 'p3', path: ['talk'] }, action)
    ranFrom(game().lifeId, { tab: 'activities', path: [] }, doAnythingAction)
    ranFrom(game().lifeId, null, action)
    expect(lifeOf(prefsNow(), game().lifeId).recents).toEqual([
      { tab: 'activities', path: [], id: 'doAnything' },
      { tab: 'relationships', path: ['person.p3', 'talk'], id: 'hug' },
    ])
  })
})

function prefsNow(): UiPrefs {
  let seen: UiPrefs | null = null
  const Probe = () => {
    seen = usePrefs()
    return null
  }
  render(createElement(Probe))
  return seen as unknown as UiPrefs
}

// ---------------------------------------------------------------------------

describe('10. pins', () => {
  const placeRow = (ref: PlaceRef): PaletteRow => ({ kind: 'place', id: placeKey(ref), ref, label: 'x', emoji: 'x', crumbs: [], why: 'recent' })

  it('toggling through updatePrefs changes what usePrefs gives', () => {
    freshLife()
    const id = game().lifeId
    const row = placeRow({ tab: 'activities', path: ['computer'] })
    expect(lifeOf(prefsNow(), id).pins).toEqual([])
    expect(togglePinRow(row, id)).toBe('pinned')
    expect(lifeOf(prefsNow(), id).pins).toEqual([{ tab: 'activities', path: ['computer'] }])
    expect(togglePinRow(row, id)).toBe('unpinned')
    expect(lifeOf(prefsNow(), id).pins).toEqual([])
    updatePrefs((p) => togglePin(p, id, { tab: 'assets', path: ['investments'] }).prefs)
    expect(lifeOf(prefsNow(), id).pins).toEqual([{ tab: 'assets', path: ['investments'] }])
  })

  it('the 13th pin is refused, and the text for the toast is the one from the sheets', () => {
    freshLife()
    const id = game().lifeId
    for (let i = 0; i < 12; i++) expect(togglePinRow(placeRow({ tab: 'activities', path: [`g${i}`] }), id)).toBe('pinned')
    expect(togglePinRow(placeRow({ tab: 'activities', path: ['one-too-many'] }), id)).toBe('full')
    expect(lifeOf(prefsNow(), id).pins).toHaveLength(12)
    expect(PINS_FULL_TEXT).toBe("You've pinned 12. Unpin one first.")
    // The controller shows that text.
    const calls: string[] = []
    const c = controllerFor(frozen('adult'), calls, undefined, { lifeId: id })
    c.pin(placeRow({ tab: 'activities', path: ['one-too-many'] }))
    expect(calls).toContain(`toast:${PINS_FULL_TEXT}`)
  })

  it('has nothing to pin on the Do Anything row, a heading, or a row that has gone', () => {
    freshLife()
    const id = game().lifeId
    expect(togglePinRow({ kind: 'doAnything', id: 'doAnything', query: 'x', locked: null }, id)).toBe('none')
    expect(togglePinRow({ kind: 'section', id: 's', label: 'Pinned' }, id)).toBe('none')
    const index = buildIndexCached('adult')
    const entry = index.entries.find((e) => e.id === 'inv-stocks')!
    const gone: PaletteRow = { kind: 'hit', id: 'h', hit: { entry, tier: 0, pinned: false, recent: -1, locked: GONE_TEXT }, pinned: false }
    expect(togglePinRow(gone, id)).toBe('none')
    expect(lifeOf(prefsNow(), id).pins).toEqual([])
  })

  it('pins the place of a hit', () => {
    freshLife()
    const id = game().lifeId
    const entry = buildIndexCached('adult').entries.find((e) => e.id === 'inv-stocks')!
    const hit: PaletteRow = { kind: 'hit', id: 'h', hit: { entry, tier: 0, pinned: false, recent: -1, locked: null }, pinned: false }
    expect(togglePinRow(hit, id)).toBe('pinned')
    expect(lifeOf(prefsNow(), id).pins).toEqual([{ tab: 'assets', path: ['investments', 'inv-stocks'] }])
  })
})

// ---------------------------------------------------------------------------

function controllerFor(g: GameState, calls: string[], roots?: IndexRoots, over: { lifeId?: string } = {}) {
  const spot: { current: Spot | null } = { current: null }
  const runner = {
    tap: (n: MenuAction | MenuGroup) => void calls.push(`tap:${n.id}`),
    submit: (a: MenuAction, s: string) => void calls.push(`submit:${a.id}:${s}`),
    toast: (m: string) => void calls.push(`toast:${m}`),
  }
  const controller = makeController({
    g,
    runner,
    spot,
    roots,
    lifeId: over.lifeId ?? g.lifeId,
    onClose: () => calls.push('close'),
    onOpenPlace: (p) => calls.push(`open:${placeKey(p)}${p.personId ? `@${p.personId}` : ''}`),
    onStale: () => calls.push('stale'),
  })
  return Object.assign(controller, { spot })
}

describe('the controller (what a tap on a row does)', () => {
  it('a group hit closes the palette and then opens the place', () => {
    const g = frozen('adult')
    const view = paletteRows({ g, index: buildIndexCached('adult'), query: 'stock', prefs: emptyPrefs(), returnPoint: null })
    const calls: string[] = []
    controllerFor(g, calls).pick(view.rows[view.selectable[0]!]!)
    expect(calls).toEqual(['close', 'open:assets/investments/inv-stocks'])
  })

  it('a person place opens with the person apart', () => {
    const g = frozen('adult')
    const friend = g.people.find((p) => p.relation === 'friend')!
    const row: PaletteRow = { kind: 'place', id: 'p', ref: { tab: 'relationships', path: [personGroupId(friend.id)] }, label: 'x', emoji: 'x', crumbs: [], why: 'recent' }
    const calls: string[] = []
    controllerFor(g, calls).pick(row)
    expect(calls).toEqual(['close', `open:relationships@${friend.id}`])
  })

  it('an action hit is tapped through the runner, with its place noted for the Back to chip', () => {
    const g = frozen('adult')
    const live = act('alpha-widget')
    const roots = only('activities', grp('activities', [grp('inner', [live])]))
    const index = buildIndex(g, roots)
    const view = paletteRows({ g, index, query: 'alpha', prefs: emptyPrefs(), returnPoint: null, roots })
    const calls: string[] = []
    const c = controllerFor(g, calls, roots)
    c.pick(view.rows[view.selectable[0]!]!)
    expect(calls).toEqual(['tap:alpha-widget'])
    expect(c.spot.current).toEqual({ tab: 'activities', path: ['inner'] })
  })

  it('an action in a person\'s list notes the person and the path inside the sheet', () => {
    const g = frozen('adult')
    const roots = only('relationships', grp('relationships', [grp('person.p9', [act('hug')])]))
    const index = buildIndex(g, roots)
    const view = paletteRows({ g, index, query: 'hug', prefs: emptyPrefs(), returnPoint: null, roots })
    const calls: string[] = []
    const c = controllerFor(g, calls, roots)
    c.pick(view.rows[view.selectable[0]!]!)
    expect(calls).toEqual(['tap:hug'])
    expect(c.spot.current).toEqual({ tab: 'relationships', personId: 'p9', path: [] })
  })

  it('a locked row shows its reason and runs nothing', () => {
    const g = frozen('adult')
    const roots = only('activities', grp('activities', [act('alpha-widget', { disabledReason: () => 'Not yet.' })]))
    const index = buildIndex(g, roots)
    const view = paletteRows({ g, index, query: 'alpha', prefs: emptyPrefs(), returnPoint: null, roots })
    const calls: string[] = []
    controllerFor(g, calls, roots).pick(view.rows[view.selectable[0]!]!)
    expect(calls).toEqual(['toast:Not yet.'])
    const locked: PaletteRow = { kind: 'doAnything', id: 'doAnything', query: 'fly', locked: 'You are too young to do that.' }
    const more: string[] = []
    controllerFor(g, more).pick(locked)
    expect(more).toEqual(['toast:You are too young to do that.'])
  })

  it('the Do Anything row submits the text, with Activities as the spot', () => {
    const g = frozen('adult')
    const calls: string[] = []
    const c = controllerFor(g, calls)
    c.pick({ kind: 'doAnything', id: 'doAnything', query: 'buy a boat', locked: null })
    expect(calls).toEqual(['submit:doAnything:buy a boat'])
    expect(c.spot.current).toEqual({ tab: 'activities', path: [] })
  })

  it('a stale row says so, drops the cache and starts the read again', () => {
    const g = frozen('adult')
    let shown = true
    const roots = only('activities', grp('activities', [act('alpha-widget', { visible: () => shown })]))
    const index = buildIndex(g, roots)
    storeIndex(index)
    expect(cachedIndex(g)).not.toBeNull()
    const view = paletteRows({ g, index, query: 'alpha', prefs: emptyPrefs(), returnPoint: null, roots })
    shown = false
    const calls: string[] = []
    controllerFor(g, calls, roots).pick(view.rows[view.selectable[0]!]!)
    expect(calls).toEqual([`toast:${STALE_TEXT}`, 'stale'])
    expect(STALE_TEXT).toBe("That's not there any more.")
    expect(cachedIndex(g)).toBeNull()
  })

  it('a heading does nothing', () => {
    const g = frozen('adult')
    const calls: string[] = []
    controllerFor(g, calls).pick({ kind: 'section', id: 's', label: 'Pinned' })
    expect(calls).toEqual([])
  })
})

// ---------------------------------------------------------------------------

describe('11. voice', () => {
  const FILES = ['src/ui/nav/paletteModel.ts', 'src/ui/nav/Palette.tsx', 'src/ui/nav/useSearchIndex.ts', 'src/ui/nav/lazy.tsx', 'src/ui/styles/nav.css']

  it('has no em-dash or en-dash anywhere in the new files', () => {
    for (const file of FILES) expect(read(file), file).not.toMatch(DASH)
  })

  it('keeps tooltips and labels in the markup within 120 characters', () => {
    for (const file of ['src/ui/nav/paletteModel.ts', 'src/ui/nav/Palette.tsx']) {
      const source = read(file)
      for (const m of source.matchAll(/\b(?:title|aria-label|placeholder)=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})/g)) {
        const text = m[1] ?? m[2] ?? m[3] ?? ''
        expect(text.length, `${file}: ${text}`).toBeLessThanOrEqual(120)
      }
    }
  })

  it('keeps the visible sentences short and plain', () => {
    const texts = [READING_TEXT, GONE_TEXT, STALE_TEXT, PINS_FULL_TEXT]
    const g = frozen('adult')
    texts.push(paletteRows({ g, index: null, query: 'zz', prefs: emptyPrefs(), returnPoint: null }).status)
    texts.push(paletteRows({ g, index: buildIndexCached('adult'), query: 'qqzzxx', prefs: emptyPrefs(), returnPoint: null }).status)
    texts.push(paletteRows({ g, index: buildIndexCached('adult'), query: '', prefs: emptyPrefs(), returnPoint: null }).status)
    for (const t of texts) {
      expect(t.length).toBeLessThanOrEqual(90)
      expect(t).not.toMatch(DASH)
      expect(t).not.toMatch(/\b(?:Let's|Welcome to|Feel free|Consider)\b/)
    }
  })
})

// ---------------------------------------------------------------------------

describe('12. the lazy contract', () => {
  it('Palette has a default export that is a function, the same one', () => {
    expect(typeof PaletteDefault).toBe('function')
    expect(PaletteDefault).toBe(Palette)
  })

  it('LazyPalette renders no palette before the chunk is loaded, and the dialog with its combobox after', async () => {
    const g = frozen('adult')
    const props = { g, onClose: () => {}, onOpenPlace: () => {}, indexOverride: buildIndexCached('adult'), initialQuery: 'stock' }
    const before = render(createElement(LazyPalette, props))
    expect(before).not.toContain('role="dialog"')
    expect(before).not.toContain('role="combobox"')
    // A caller can give something to show until the chunk is there.
    expect(render(createElement(LazyPalette, { ...props, fallback: createElement('i', { id: 'wait' }) }))).toContain('id="wait"')
    expect(LazyPalette.isReady()).toBe(false)
    expect(await LazyPalette.preload()).toBe(true)
    expect(LazyPalette.isReady()).toBe(true)
    const after = render(createElement(LazyPalette, props))
    expect(after).toContain('role="dialog"')
    expect(after).toContain('role="combobox"')
  })
})

// ---------------------------------------------------------------------------

describe('13. the palette zone', () => {
  it('no file under src/game mentions useSearchIndex or imports from src/ui/nav', () => {
    const offenders: string[] = []
    for (const file of listSources(join(ROOT, 'src', 'game'))) {
      const text = readFileSync(file, 'utf8')
      if (/useSearchIndex/.test(text) || /from ['"](?:\.\.\/)+ui\/nav\//.test(text)) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })

  it('no file outside the five zone files and lazy.tsx imports a zone file at run time', () => {
    const zone = ['Palette.tsx', 'paletteModel.ts', 'searchIndex.ts', 'searchRank.ts', 'useSearchIndex.ts'].map((f) => join(ROOT, 'src', 'ui', 'nav', f))
    const gate = join(ROOT, 'src', 'ui', 'nav', 'lazy.tsx')
    const bad: string[] = []
    for (const file of listSources(join(ROOT, 'src'))) {
      if (zone.includes(file)) continue
      for (const spec of staticImports(file)) {
        const to = resolveImport(file, spec)
        if (to && zone.includes(to)) bad.push(`${file} -> ${to}`)
      }
      if (file === gate) continue
      for (const spec of dynamicImports(file)) {
        const to = resolveImport(file, spec)
        if (to && zone.includes(to)) bad.push(`${file} => ${to}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('the gate loads Palette.tsx dynamically and nothing static reaches it from main', () => {
    const gate = join(ROOT, 'src', 'ui', 'nav', 'lazy.tsx')
    const loaded = dynamicImports(gate).map((s) => resolveImport(gate, s))
    expect(loaded).toContain(join(ROOT, 'src', 'ui', 'nav', 'Palette.tsx'))
    const reached = closure(join(ROOT, 'src', 'main.tsx'))
    expect(reached.has(join(ROOT, 'src', 'ui', 'nav', 'Palette.tsx'))).toBe(false)
  })

  it('does not use React.lazy or Suspense', () => {
    for (const file of ['src/ui/nav/Palette.tsx', 'src/ui/nav/lazy.tsx', 'src/ui/nav/useSearchIndex.ts', 'src/ui/nav/paletteModel.ts']) {
      expect(read(file), file).not.toMatch(/React\.lazy|\blazy\(|Suspense/)
    }
  })

  it('writes no money and draws no dice', () => {
    for (const file of ['src/ui/nav/Palette.tsx', 'src/ui/nav/lazy.tsx', 'src/ui/nav/useSearchIndex.ts', 'src/ui/nav/paletteModel.ts']) {
      expect(read(file), file).not.toMatch(/earnIncome\(|\bspend\(|addMoney\(|\.cash\s*\+=|\.money\s*\+=|g\.rng|rand\(g|Math\.random/)
    }
  })
})

// ---------------------------------------------------------------------------

describe('14. the palette is a modal surface', () => {
  it('has the dialog, aria-modal, the label and tabindex on one element, inside the palette backdrop', () => {
    const g = frozen('adult')
    const html = render(createElement(Palette, { g, onClose: () => {}, onOpenPlace: () => {}, indexOverride: buildIndexCached('adult'), initialQuery: 'stock' }))
    const surface = /<div[^>]*role="dialog"[^>]*>/.exec(html)![0]
    expect(surface).toContain('aria-modal="true"')
    expect(surface).toContain('aria-label="Search"')
    expect(surface).toContain('tabindex="-1"')
    expect(surface).toContain('class="palette"')
    expect(html.startsWith('<div class="sheet-backdrop palette-backdrop"')).toBe(true)
    expect(html.indexOf('palette-backdrop')).toBeLessThan(html.indexOf('role="dialog"'))
  })
})

// ---------------------------------------------------------------------------

describe('the stylesheet', () => {
  const css = read('src/ui/styles/nav.css')

  function body(selector: string): string {
    const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const m = new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`).exec(css)
    if (!m) throw new Error(`no rule for ${selector}`)
    return m[1]!
  }

  it('keeps the rows and the pin button at 44px', () => {
    expect(body('.palette-row')).toMatch(/min-height:\s*var\(--target\)/)
    expect(body('.palette-pin')).toMatch(/width:\s*var\(--target\)/)
    expect(body('.palette-pin')).toMatch(/height:\s*var\(--target\)/)
  })

  it('uses theme tokens only, so it follows light and dark', () => {
    const at = css.indexOf('/* Palette')
    expect(at).toBeGreaterThan(-1)
    const palette = css.slice(at).replace(/\/\*[\s\S]*?\*\//g, '')
    expect(palette.length).toBeGreaterThan(500)
    expect(palette).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  it('keeps the dialog without a focus ring around the whole card, and reads at 16px so a phone does not zoom', () => {
    expect(css).toMatch(/\.palette:focus\s*\{[^}]*outline:\s*none/)
    expect(body('.palette-input')).toMatch(/font-size:\s*16px/)
  })
})

// ---------------------------------------------------------------------------

describe('useSearchIndex', () => {
  /** A scheduler the test drives by hand. */
  function manual() {
    const queue: (() => void)[] = []
    return {
      queue,
      schedule: (run: () => void) => {
        queue.push(run)
        return () => {
          const at = queue.indexOf(run)
          if (at >= 0) queue.splice(at, 1)
        }
      },
      tick(): boolean {
        const next = queue.shift()
        if (!next) return false
        next()
        return true
      },
    }
  }

  it('walks the menus in small slices and stores the finished index', () => {
    const g = frozen('adult')
    const m = manual()
    const done: SearchIndex[] = []
    runIndexJob(g, (i) => done.push(i), { schedule: m.schedule, budgetMs: 0 })
    expect(m.queue).toHaveLength(1)
    let ticks = 0
    while (m.tick()) ticks++
    expect(ticks).toBeGreaterThan(5)
    expect(done).toHaveLength(1)
    expect(done[0]!.complete).toBe(true)
    expect(done[0]!.key).toBe(indexKey(g))
    expect(cachedIndex(g)).toBe(done[0])
    // The same entries as the one-go build.
    expect(done[0]!.entries.map((e) => e.key)).toEqual(buildIndexCached('adult').entries.map((e) => e.key))
  })

  it('does nothing until the browser is idle, and stops when cancelled', () => {
    const g = frozen('adult')
    const m = manual()
    const done: SearchIndex[] = []
    const cancel = runIndexJob(g, (i) => done.push(i), { schedule: m.schedule, budgetMs: 0 })
    expect(done).toEqual([])
    m.tick()
    cancel()
    expect(m.queue).toEqual([])
    while (m.tick());
    expect(done).toEqual([])
    expect(cachedIndex(g)).toBeNull()
  })

  it('uses idle time when the browser has it, and a 16 ms timer when it does not', async () => {
    const g = frozen('adult')
    const timers: number[] = []
    const realSet = globalThis.setTimeout
    vi.stubGlobal('setTimeout', ((fn: () => void, ms?: number) => {
      timers.push(ms ?? 0)
      return realSet(fn, 0)
    }) as typeof setTimeout)
    try {
      const done = await new Promise<SearchIndex>((resolve) => {
        runIndexJob(g, resolve)
      })
      expect(done.complete).toBe(true)
      expect(timers[0]).toBe(16)
    } finally {
      vi.unstubAllGlobals()
    }
    const seen: unknown[] = []
    vi.stubGlobal('requestIdleCallback', (fn: () => void) => {
      seen.push('idle')
      realSet(fn, 0)
      return 1
    })
    vi.stubGlobal('cancelIdleCallback', () => {})
    try {
      await new Promise<SearchIndex>((resolve) => {
        runIndexJob(g, resolve)
      })
      expect(seen[0]).toBe('idle')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  /** The hook's return value, from a throwaway component. */
  function hook(g: GameState, enabled: boolean) {
    let seen: ReturnType<typeof useSearchIndex> | null = null
    const Probe = () => {
      seen = useSearchIndex(g, enabled)
      return null
    }
    render(createElement(Probe))
    return seen as unknown as ReturnType<typeof useSearchIndex>
  }

  it('serves the cached index at once, the stale one while a new one is read, and nothing when it is off', () => {
    const g = frozen('adult')
    expect(hook(g, true)).toMatchObject({ index: null, ready: false })
    const index = buildIndexCached('adult')
    storeIndex(index)
    expect(hook(g, true)).toMatchObject({ index, ready: true })
    expect(hook(g, false)).toMatchObject({ index: null, ready: false })
    // Another state: the old index is served, and it is not ready.
    const later = navState('adult')
    later.year += 1
    const stale = hook(deepFreeze(later), true)
    expect(stale.index).toBe(index)
    expect(stale.ready).toBe(false)
    expect(typeof stale.refresh).toBe('function')
  })
})
