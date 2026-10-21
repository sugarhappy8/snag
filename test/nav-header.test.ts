// R1-N7: the header search button and inbox bell, the shortcut hints on the bottom bar, and how GameScreen wires the palette
// and the inbox sheet. The pattern of test/ui-return.test.ts: the real store, a seeded life, and static markup. With
// FLAGS.navPalette and FLAGS.quietInbox off every piece of markup is what v4.0.2 drew; the three constants below were taken
// from that code before this task touched it.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetFlags, setFlags, withFlags } from '../src/game/flags'
import { inboxUnread, pushInbox } from '../src/game/inbox'
import type { GameState } from '../src/game/types'
import { BottomBar } from '../src/ui/components/BottomBar'
import { Header } from '../src/ui/components/Header'
import { paletteRows } from '../src/ui/nav/paletteModel'
import { emptyPrefs, pushRecent } from '../src/ui/nav/prefs'
import { recentFromSpot } from '../src/ui/nav/place'
import { shortcutFor } from '../src/ui/nav/shortcuts'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'
import { NAV_OFF } from './nav-kit'

// Built-in tasks resolve to nothing here (the pattern of test/ui-return.test.ts), so only what a test queues shows up.
const offline = vi.hoisted(() => {
  const resolve = vi.fn()
  return { applyFallback: resolve, resolveTask: resolve, MAX_CUSTOM_ACTIONS_PER_YEAR: 5, CUSTOM_ACTION_KEY: 'doAnything' }
})
vi.mock('../src/game/offline', () => offline)

const store = await import('../src/ui/store')
const { notice } = await import('../src/game/core')
const { createPerson } = await import('../src/game/people')
const { openingClearsReturn } = await import('../src/ui/components/ReturnChip')
const { InboxSheet } = await import('../src/ui/components/InboxSheet')
const { GameScreen, linkSheet, placeSheet, rememberSpot } = await import('../src/ui/screens/GameScreen')
const { placeOfLink, placeToReopen } = await import('../src/ui/nav/reopen')

/** Header and BottomBar as v4.0.2 drew them (makeTestGame, nothing else passed). */
const HEADER_V402 = "<header class=\"hdr\"><div class=\"hdr-top\"><button class=\"hdr-icon hdr-menu\" aria-label=\"Main menu\" title=\"Main menu\">☰</button><div class=\"hdr-brand\">AnotherLife<span class=\"hdr-brand-year\">2026</span></div><button class=\"hdr-icon\" aria-label=\"Settings\" title=\"Settings\">⚙️</button></div><div class=\"hdr-main\"><button class=\"hdr-who\" aria-label=\"Open Test Player&#x27;s profile\"><span class=\"hdr-avatar\" aria-hidden=\"true\">👶</span><span class=\"hdr-text\"><span class=\"hdr-name\">Test Player</span><span class=\"hdr-role\">🇺🇸 Infant</span></span></button><div class=\"hdr-money\"><div class=\"hdr-money-label\">Bank Balance · USD</div><div class=\"hdr-money-value\" title=\"$0\">$0</div></div></div></header>"
const BAR_V402 = "<nav class=\"bottombar\" aria-label=\"Main menu\"><button type=\"button\" class=\"bb-btn\" aria-label=\"Occupation\"><span class=\"bb-icon c-occupation\" aria-hidden=\"true\">💼</span><span class=\"bb-label\">Occupation</span></button><button type=\"button\" class=\"bb-btn\" aria-label=\"Assets\"><span class=\"bb-icon c-assets\" aria-hidden=\"true\">🏠</span><span class=\"bb-label\">Assets</span></button><button type=\"button\" class=\"bb-age\" data-focus-home=\"true\" aria-label=\"Age up one year\"><span class=\"bb-age-plus\" aria-hidden=\"true\">+</span><span class=\"bb-age-label\">Age</span></button><button type=\"button\" class=\"bb-btn\" aria-label=\"Relationships\"><span class=\"bb-icon c-relationships\" aria-hidden=\"true\">❤️</span><span class=\"bb-label\">Relationships</span></button><button type=\"button\" class=\"bb-btn\" aria-label=\"Activities\"><span class=\"bb-icon c-activities\" aria-hidden=\"true\">⭐</span><span class=\"bb-label\">Activities</span></button></nav>"
const BAR_OFF_V402 = "<nav class=\"bottombar\" aria-label=\"Main menu\"><button type=\"button\" class=\"bb-btn\" disabled=\"\" aria-label=\"Occupation\"><span class=\"bb-icon c-occupation\" aria-hidden=\"true\">💼</span><span class=\"bb-label\">Occupation</span></button><button type=\"button\" class=\"bb-btn\" disabled=\"\" aria-label=\"Assets\"><span class=\"bb-icon c-assets\" aria-hidden=\"true\">🏠</span><span class=\"bb-label\">Assets</span></button><button type=\"button\" class=\"bb-age\" data-focus-home=\"true\" disabled=\"\" aria-label=\"Age up one year\"><span class=\"bb-age-plus\" aria-hidden=\"true\">+</span><span class=\"bb-age-label\">Age</span></button><button type=\"button\" class=\"bb-btn\" disabled=\"\" aria-label=\"Relationships\"><span class=\"bb-icon c-relationships\" aria-hidden=\"true\">❤️</span><span class=\"bb-label\">Relationships</span></button><button type=\"button\" class=\"bb-btn\" disabled=\"\" aria-label=\"Activities\"><span class=\"bb-icon c-activities\" aria-hidden=\"true\">⭐</span><span class=\"bb-label\">Activities</span></button></nav>"

const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el)

function game(): GameState {
  return store.getApp().game as GameState
}

const noop = () => {}
const SEARCH_BUTTON = /<button[^>]*aria-label="Search"[^>]*>[^<]*<\/button>/
const BELL_BUTTON = /<button[^>]*aria-label="Inbox[^"]*"[^>]*>.*?<\/button>/
const KEY_HINTS = / aria-keyshortcuts="[^"]*"/g

function inboxLabel(html: string): { count: number } | null {
  const m = /aria-label="Inbox(?:, (\d+) new)?"/.exec(html)
  return m ? { count: m[1] === undefined ? 0 : Number(m[1]) } : null
}

beforeEach(() => {
  setFlags(NAV_OFF)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  offline.resolveTask.mockReset()
  store.startNewLife({ seed: 7, year: 2026 })
  store.act((g) => {
    g.queue = []
    g.character.age = 30
  })
})

afterEach(() => {
  store.clearReturnPoint()
  resetFlags()
  vi.restoreAllMocks()
})

describe('7. Header: the search button', () => {
  const plain = () => render(createElement(Header, { g: makeTestGame(), onProfile: noop }))

  it('draws exactly what v4.0.2 drew when no optional prop is passed', () => {
    expect(plain()).toBe(HEADER_V402)
    expect(plain()).not.toContain('Search')
  })

  it('shows a Search button with its shortcut hint between the brand and Settings when onSearch is given', () => {
    const html = render(createElement(Header, { g: makeTestGame(), onProfile: noop, onSearch: noop }))
    const button = SEARCH_BUTTON.exec(html)?.[0] ?? ''
    expect(button).toContain('class="hdr-icon"')
    expect(button).toContain('aria-label="Search"')
    expect(button).toContain('title="Search (Ctrl+K or /)"')
    expect(button).toContain('aria-keyshortcuts="Control+K /"')
    expect(button).toContain('type="button"')
    expect(html.indexOf('hdr-brand')).toBeLessThan(html.indexOf('aria-label="Search"'))
    expect(html.indexOf('aria-label="Search"')).toBeLessThan(html.indexOf('aria-label="Settings"'))
    // Nothing else moved.
    expect(html.replace(SEARCH_BUTTON, '')).toBe(HEADER_V402)
  })
})

describe('8. Header: the inbox bell', () => {
  const withBell = (count: number, extra: Record<string, unknown> = {}) =>
    render(createElement(Header, { g: makeTestGame(), onProfile: noop, inbox: { count, onOpen: noop }, ...extra }))

  it('has the hdr-icon and hdr-bell classes, the label "Inbox, 3 new" and the count', () => {
    const html = withBell(3)
    const bell = BELL_BUTTON.exec(html)?.[0] ?? ''
    expect(bell).toContain('class="hdr-icon hdr-bell"')
    expect(bell).toContain('aria-label="Inbox, 3 new"')
    expect(bell).toContain('type="button"')
    expect(bell).toContain('<span class="hdr-bell-count" aria-hidden="true">3</span>')
    expect(html.indexOf('hdr-brand')).toBeLessThan(html.indexOf('hdr-bell'))
    expect(html.indexOf('hdr-bell')).toBeLessThan(html.indexOf('aria-label="Settings"'))
    expect(html.replace(BELL_BUTTON, '')).toBe(HEADER_V402)
  })

  it('is just "Inbox", with no count, for zero', () => {
    const bell = BELL_BUTTON.exec(withBell(0))?.[0] ?? ''
    expect(bell).toContain('aria-label="Inbox"')
    expect(bell).not.toContain('hdr-bell-count')
  })

  it('shows 9+ above nine', () => {
    expect(withBell(9)).toContain('aria-hidden="true">9</span>')
    expect(withBell(10)).toContain('aria-hidden="true">9+</span>')
    expect(withBell(60)).toContain('aria-hidden="true">9+</span>')
    expect(withBell(60)).toContain('aria-label="Inbox, 60 new"')
  })

  it('treats a count that is not a positive number as zero', () => {
    for (const bad of [Number.NaN, -4, Number.POSITIVE_INFINITY]) {
      const bell = BELL_BUTTON.exec(withBell(bad))?.[0] ?? ''
      expect(bell, String(bad)).toContain('aria-label="Inbox"')
      expect(bell, String(bad)).not.toContain('hdr-bell-count')
    }
    expect(withBell(2.9)).toContain('aria-label="Inbox, 2 new"')
  })

  it('is not drawn without the inbox prop, and sits after the search button when both are given', () => {
    expect(render(createElement(Header, { g: makeTestGame(), onProfile: noop, onSearch: noop }))).not.toContain('hdr-bell')
    const both = withBell(1, { onSearch: noop })
    expect(both.indexOf('aria-label="Search"')).toBeLessThan(both.indexOf('hdr-bell'))
    expect(both.replace(SEARCH_BUTTON, '').replace(BELL_BUTTON, '')).toBe(HEADER_V402)
  })
})

describe('9. BottomBar: the shortcut hints', () => {
  const bar = (disabled = false) => render(createElement(BottomBar, { disabled, onOpen: noop, onAge: noop }))

  it('draws exactly what v4.0.2 drew with navPalette off', () => {
    expect(bar()).toBe(BAR_V402)
    expect(bar(true)).toBe(BAR_OFF_V402)
  })

  it('carries aria-keyshortcuts 1 to 4 on the tabs and A on the age button with navPalette on', () => {
    const html = withFlags({ ...NAV_OFF, navPalette: true }, bar)
    const hints = [...html.matchAll(/<button[^>]*aria-label="([^"]+)"[^>]*>/g)].map((m) => {
      const key = /aria-keyshortcuts="([^"]+)"/.exec(m[0])
      return `${m[1]}=${key ? key[1] : ''}`
    })
    expect(hints).toEqual(['Occupation=1', 'Assets=2', 'Age up one year=A', 'Relationships=3', 'Activities=4'])
    // No other change.
    expect(html.replace(KEY_HINTS, '')).toBe(BAR_V402)
    expect(withFlags({ ...NAV_OFF, navPalette: true }, () => bar(true)).replace(KEY_HINTS, '')).toBe(BAR_OFF_V402)
  })

  it('names the same digit that shortcutFor turns into that tab', () => {
    const html = withFlags({ ...NAV_OFF, navPalette: true }, bar)
    const quiet = { typing: false, queueBusy: false, dead: false, sheetOpen: false, paletteOpen: false, popupOpen: false }
    for (const tab of ['occupation', 'assets', 'relationships', 'activities']) {
      const m = new RegExp(`<button[^>]*aria-label="${tab[0].toUpperCase()}${tab.slice(1)}"[^>]*>`).exec(html)
      const key = /aria-keyshortcuts="([^"]+)"/.exec(m?.[0] ?? '')?.[1] ?? ''
      expect(shortcutFor({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false }, quiet)).toEqual({ type: 'tab', tab })
    }
  })
})

describe('10. GameScreen: the search button', () => {
  it('shows the Search button with navPalette on, and no palette markup until it is opened', () => {
    setFlags({ ...NAV_OFF, navPalette: true })
    const html = render(createElement(GameScreen))
    expect(html).toContain('aria-label="Search"')
    expect(html).toContain('aria-keyshortcuts="Control+K /"')
    expect(html).not.toContain('palette')
  })

  it('shows no Search button with navPalette off, and the rest of the screen is the same', () => {
    // quietInbox is pinned off too, so the screen is the one v4.0.2 drew whatever the release commit sets as default.
    setFlags({ ...NAV_OFF, quietInbox: false })
    const off = render(createElement(GameScreen))
    expect(off).not.toContain('aria-label="Search"')
    expect(off).not.toContain('aria-keyshortcuts')
    expect(off).not.toContain('hdr-bell')
    const on = withFlags({ ...NAV_OFF, navPalette: true }, () => render(createElement(GameScreen)))
    expect(on.replace(SEARCH_BUTTON, '').replace(KEY_HINTS, '')).toBe(off)
  })

  it('hides the button while a popup waits and once the character is dead', () => {
    setFlags({ ...NAV_OFF, navPalette: true })
    store.act((g) => {
      notice(g, 'Rent', 'The landlord knocked.')
    })
    expect(render(createElement(GameScreen))).not.toContain('aria-label="Search"')
    store.act((g) => {
      g.queue = []
    })
    expect(render(createElement(GameScreen))).toContain('aria-label="Search"')
    store.act((g) => {
      g.character.alive = false
    })
    expect(render(createElement(GameScreen))).not.toContain('aria-label="Search"')
  })
})

describe('13. GameScreen: the inbox count', () => {
  const addRows = (n: number) =>
    store.act((g) => {
      pushInbox(
        g,
        Array.from({ length: n }, (_, i) => ({ id: `n${i}`, y: g.year, a: g.character.age, t: `Row ${i}.` })),
      )
    })
  const setRaw = (value: unknown) =>
    store.act((g) => {
      ;(g.flags as Record<string, unknown>).inbox = value
    })

  it('passes inboxUnread(g) to the bell', () => {
    setFlags({ ...NAV_OFF, quietInbox: true })
    addRows(3)
    expect(inboxUnread(game())).toBe(3)
    expect(inboxLabel(render(createElement(GameScreen)))).toEqual({ count: 3 })
  })

  it('shows 0 for no inbox at all, and for rows the player has seen', () => {
    setFlags({ ...NAV_OFF, quietInbox: true })
    expect(inboxLabel(render(createElement(GameScreen)))).toEqual({ count: 0 })
    addRows(2)
    store.markInboxSeen()
    expect(inboxLabel(render(createElement(GameScreen)))).toEqual({ count: 0 })
  })

  it('stays bounded when the saved inbox is hostile: a string, a 500-element array, null', () => {
    setFlags({ ...NAV_OFF, quietInbox: true })
    setRaw('open sesame')
    expect(inboxLabel(render(createElement(GameScreen)))?.count).toBe(0)
    setRaw(Array.from({ length: 500 }, (_, i) => ({ id: `x${i}`, y: 2026, a: 30, t: 'Row.' })))
    const many = inboxLabel(render(createElement(GameScreen)))?.count ?? -1
    expect(many).toBeGreaterThanOrEqual(0)
    expect(many).toBeLessThanOrEqual(60)
    setRaw(null)
    expect(inboxLabel(render(createElement(GameScreen)))?.count).toBe(0)
    setRaw({ v: 1, total: 1e12, seen: -5, items: [{ id: 'a', y: 2026, a: 30, t: 'One.' }] })
    expect(inboxLabel(render(createElement(GameScreen)))?.count).toBe(1)
  })
})

describe('14. GameScreen: the bell and the inbox sheet', () => {
  it('draws the bell only with quietInbox on, whatever navPalette says', () => {
    // The off half pins quietInbox off, so the case means the same thing before and after the release commit flips it.
    setFlags({ ...NAV_OFF, quietInbox: false })
    expect(render(createElement(GameScreen))).not.toContain('hdr-bell')
    setFlags({ ...NAV_OFF, navPalette: true, quietInbox: false })
    expect(render(createElement(GameScreen))).not.toContain('hdr-bell')
    setFlags({ ...NAV_OFF, quietInbox: true })
    const html = render(createElement(GameScreen))
    expect(html).toContain('hdr-bell')
    expect(html).not.toContain('aria-label="Search"')
    setFlags({ ...NAV_OFF, quietInbox: true, navPalette: true })
    const both = render(createElement(GameScreen))
    expect(both).toContain('hdr-bell')
    expect(both).toContain('aria-label="Search"')
  })

  it('shows the sheet as an InboxSheet inside a Sheet, which is a dialog', () => {
    store.act((g) => {
      pushInbox(g, [{ id: 'n1', y: g.year, a: g.character.age, t: 'The rent went up.', l: 'assets/realEstate' }])
    })
    const html = render(createElement(GameScreen, { initialSheet: { kind: 'inbox' } }))
    expect(html).toContain('class="sheet-backdrop"')
    expect(html).toMatch(/<div[^>]*class="sheet"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-label="Inbox"|<div[^>]*role="dialog"[^>]*aria-label="Inbox"[^>]*class="sheet"/)
    expect(html).toContain('The rent went up.')
    // The host passes onOpenLink, so a row with a link has its Open button.
    expect(html).toContain('inbox-open')
    // It is the same markup the component draws by itself.
    const alone = render(createElement(InboxSheet, { onClose: noop, onOpenLink: noop }))
    expect(html).toContain(alone)
  })

  it('does not show the sheet by default', () => {
    expect(render(createElement(GameScreen))).not.toContain('class="sheet-backdrop"')
  })
})

describe('14b. openingClearsReturn', () => {
  it('keeps the Back to chip for a peek at the inbox or the profile, and forgets it for a menu', () => {
    expect(openingClearsReturn('inbox')).toBe(false)
    expect(openingClearsReturn('profile')).toBe(false)
    for (const tab of ['occupation', 'assets', 'relationships', 'activities']) expect(openingClearsReturn(tab)).toBe(true)
  })
})

describe('11. placeToReopen', () => {
  it('opens a group of the tab: the sheet, the path and no scroll offsets', () => {
    const t = placeToReopen(game(), { tab: 'activities', path: ['computer'] })
    expect(t.sheet).toBe('activities')
    expect(t.path).toEqual(['computer'])
    expect(t.scrolls).toEqual([])
    expect(t.exact).toBe(true)
    expect(t.personId).toBeUndefined()
  })

  it('opens the tab itself for an empty path', () => {
    const t = placeToReopen(game(), { tab: 'assets', path: [] })
    expect(t).toMatchObject({ sheet: 'assets', path: [], exact: true })
  })

  it('trims a vanished path to its deepest ancestor that still exists', () => {
    const t = placeToReopen(game(), { tab: 'activities', path: ['computer', 'no-such-group', 'deeper'] })
    expect(t.sheet).toBe('activities')
    expect(t.path).toEqual(['computer'])
    expect(t.exact).toBe(false)
    expect(placeToReopen(game(), { tab: 'assets', path: ['no-such-group'] }).path).toEqual([])
  })

  it('keeps a person who is still in the life, and drops one who is not', () => {
    let id = ''
    store.act((g) => {
      id = createPerson(g, { relation: 'friend', age: 25, firstName: 'Priya', lastName: 'Nair' }).id
    })
    const here = placeToReopen(game(), { tab: 'relationships', path: [], personId: id })
    expect(here).toMatchObject({ sheet: 'relationships', personId: id })
    const gone = placeToReopen(game(), { tab: 'relationships', path: [], personId: 'nobody-here' })
    expect(gone.sheet).toBe('relationships')
    expect(gone.personId).toBeUndefined()
    expect(gone.path).toEqual([])
  })

  it('is pure: a frozen state is enough and nothing in it changes', () => {
    const copy = structuredClone(game())
    const before = JSON.stringify(copy)
    deepFreeze(copy)
    expect(() => placeToReopen(copy, { tab: 'activities', path: ['computer'] })).not.toThrow()
    expect(JSON.stringify(copy)).toBe(before)
  })
})

describe('openLink and openPlace (the sheets they ask for)', () => {
  it('turns a link into a place, with a person split off the Relationships path', () => {
    expect(placeOfLink('assets/home')).toEqual({ tab: 'assets', path: ['home'] })
    expect(placeOfLink('activities')).toEqual({ tab: 'activities', path: [] })
    expect(placeOfLink('relationships/person.p12/hangOut')).toEqual({ tab: 'relationships', path: ['hangOut'], personId: 'p12' })
    expect(placeOfLink('relationships/person.p12')).toEqual({ tab: 'relationships', path: [], personId: 'p12' })
  })

  it('gives nothing for a link that is not a place', () => {
    for (const bad of ['x/%', '', 'x', 'nowhere/at/all', 'assets/%E0%A4%A', 'assets//home', 'a'.repeat(20_000)]) {
      expect(placeOfLink(bad), bad.slice(0, 20)).toBeNull()
    }
    expect(placeOfLink(undefined as unknown as string)).toBeNull()
    expect(placeOfLink(42 as unknown as string)).toBeNull()
  })

  it('14. openLink("assets/home") asks for the assets sheet, trimmed to what exists; openLink("x/%") asks for nothing', () => {
    const s = linkSheet(game(), 'assets/home', 4)
    expect(s?.kind).toBe('assets')
    expect(s?.nonce).toBe(4)
    expect(s?.reopen?.sheet).toBe('assets')
    expect(s?.reopen?.path).toEqual([])
    expect(linkSheet(game(), 'x/%', 5)).toBeNull()
  })

  it('opens an inbox link at its group when the group exists', () => {
    const s = linkSheet(game(), 'assets/realEstate', 1)
    expect(s).toMatchObject({ kind: 'assets', nonce: 1, reopen: { sheet: 'assets', path: ['realEstate'] } })
  })

  it('openPlace asks for the tab, the resolved spot and the next nonce', () => {
    const s = placeSheet(game(), { tab: 'activities', path: ['computer'] }, 2)
    expect(s).toMatchObject({ kind: 'activities', nonce: 2, reopen: { sheet: 'activities', path: ['computer'] } })
  })

  it('a sheet draws from the place it was asked for', () => {
    const s = placeSheet(game(), { tab: 'activities', path: ['computer'] }, 2)
    const html = render(createElement(GameScreen, { initialSheet: s }))
    expect(html).toContain('Computer')
    expect(html).toContain('aria-label="Activities"')
  })
})

describe('12. the Back to chip is the newest recent', () => {
  const spot = { path: ['computer'], scrolls: [0, 0] }

  it('puts the chip place first among the recents, and the palette lists the live chip before them', () => {
    setFlags({ ...NAV_OFF, navPalette: true })
    store.setReturnPoint({ sheet: 'activities', ...spot })
    const point = store.getApp().returnPoint
    expect(point).not.toBeNull()
    const place = recentFromSpot('activities', spot)
    expect(place).toEqual({ tab: 'activities', path: ['computer'] })

    let prefs = pushRecent(emptyPrefs(), game().lifeId, { tab: 'assets', path: ['realEstate'] })
    prefs = pushRecent(prefs, game().lifeId, place)
    expect(prefs.lives[game().lifeId]?.recents[0]).toEqual(place)

    const view = paletteRows({ g: game(), index: null, query: '', prefs, returnPoint: point })
    const kinds = view.rows.map((r) => (r.kind === 'section' ? `section:${r.id}` : r.kind === 'place' ? `${r.why}:${r.label}` : r.kind))
    expect(kinds[0]).toBe('section:section:back')
    expect(kinds[1]).toMatch(/^back:/)
    const firstRecent = kinds.findIndex((k) => k.startsWith('recent:'))
    expect(firstRecent).toBeGreaterThan(1)
    expect(kinds.indexOf('section:section:recent')).toBeGreaterThan(1)
  })

  it('rememberSpot writes the chip and the recent together, the recent staying when the chip goes', () => {
    setFlags({ ...NAV_OFF, navPalette: true })
    rememberSpot(game(), 'activities', spot)
    expect(store.getApp().returnPoint).toMatchObject({ sheet: 'activities', path: ['computer'] })
    store.clearReturnPoint()
    expect(store.getApp().returnPoint).toBeNull()
  })
})

describe('the files', () => {
  const DASHES = [String.fromCharCode(0x2014), String.fromCharCode(0x2013)]
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8')
  const TOUCHED = [
    'src/ui/nav/shortcuts.ts',
    'src/ui/nav/reopen.ts',
    'src/ui/components/Header.tsx',
    'src/ui/components/BottomBar.tsx',
    'src/ui/components/ReturnChip.tsx',
    'src/ui/screens/GameScreen.tsx',
    'src/ui/styles/nav.css',
    'test/nav-header.test.ts',
  ]

  // BottomBar.tsx has one old comment with a dash that this task did not write; no file may gain another.
  const OLD_DASHES: Record<string, number> = { 'src/ui/components/BottomBar.tsx': 1 }

  it('have no em-dash and no en-dash', () => {
    for (const rel of TOUCHED) {
      const src = read(rel)
      const found = [...src].filter((ch) => DASHES.includes(ch)).length
      expect(found, rel).toBeLessThanOrEqual(OLD_DASHES[rel] ?? 0)
    }
  })

  it('GameScreen takes the palette through the gate file and never through the lazy helper of React', () => {
    const src = read('src/ui/screens/GameScreen.tsx')
    expect(src).toContain("from '../nav/lazy'")
    expect(src).not.toMatch(/React\.lazy|\blazy\(|Suspense/)
    expect(src).not.toMatch(/nav\/(Palette|paletteModel|searchIndex|searchRank|useSearchIndex)'/)
  })

  it('no file under src/game imports from the UI navigation folder', () => {
    expect(read('src/game/inbox.ts')).not.toContain('ui/nav')
  })
})
