// R1-A6: roving tabindex in menu rows. The key table and the stop rule are pure; the rows are
// rendered with renderToStaticMarkup, and the keyboard handler is driven with plain objects
// (there is no DOM in these tests).
import { createElement, isValidElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MenuAction, MenuGroup, MenuNode } from '../src/game/types'
import { ROVING_PAGE, rovingMove, rovingStop } from '../src/ui/a11y/roving'
import { MenuRow, MenuRows } from '../src/ui/components/MenuList'
import { makeTestGame } from './helpers'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('rovingMove', () => {
  it('moves down and up, and wraps at both ends', () => {
    expect(rovingMove(5, 0, 'ArrowDown')).toBe(1)
    expect(rovingMove(5, 3, 'ArrowDown')).toBe(4)
    expect(rovingMove(5, 4, 'ArrowDown')).toBe(0)
    expect(rovingMove(5, 4, 'ArrowUp')).toBe(3)
    expect(rovingMove(5, 1, 'ArrowUp')).toBe(0)
    expect(rovingMove(5, 0, 'ArrowUp')).toBe(4)
  })

  it('jumps to the first and last stop with Home and End', () => {
    expect(rovingMove(5, 3, 'Home')).toBe(0)
    expect(rovingMove(5, 0, 'Home')).toBe(0)
    expect(rovingMove(5, 1, 'End')).toBe(4)
    expect(rovingMove(5, 4, 'End')).toBe(4)
  })

  it('pages by ROVING_PAGE and stops at the ends instead of wrapping', () => {
    expect(ROVING_PAGE).toBe(8)
    expect(rovingMove(30, 2, 'PageDown')).toBe(10)
    expect(rovingMove(30, 20, 'PageUp')).toBe(12)
    expect(rovingMove(30, 25, 'PageDown')).toBe(29)
    expect(rovingMove(30, 29, 'PageDown')).toBe(29)
    expect(rovingMove(30, 3, 'PageUp')).toBe(0)
    expect(rovingMove(30, 0, 'PageUp')).toBe(0)
    expect(rovingMove(5, 1, 'PageDown')).toBe(4)
  })

  it('answers null for no stops and for keys it does not own', () => {
    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp']) {
      expect(rovingMove(0, 0, key)).toBeNull()
      expect(rovingMove(0, -1, key)).toBeNull()
      expect(rovingMove(-3, 0, key)).toBeNull()
    }
    for (const key of ['ArrowLeft', 'ArrowRight', 'Enter', ' ', 'Tab', 'Escape', 'a', 'arrowdown', '']) {
      expect(rovingMove(5, 2, key)).toBeNull()
    }
  })

  it('keeps a single stop on itself', () => {
    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp']) {
      expect(rovingMove(1, 0, key)).toBe(0)
    }
  })

  it('treats an index outside the list as nothing focused', () => {
    expect(rovingMove(5, -1, 'ArrowDown')).toBe(0)
    expect(rovingMove(5, -1, 'PageDown')).toBe(0)
    expect(rovingMove(5, -1, 'Home')).toBe(0)
    expect(rovingMove(5, -1, 'ArrowUp')).toBe(4)
    expect(rovingMove(5, -1, 'PageUp')).toBe(4)
    expect(rovingMove(5, -1, 'End')).toBe(4)
    expect(rovingMove(5, 9, 'ArrowDown')).toBe(0)
    expect(rovingMove(5, 9, 'ArrowUp')).toBe(4)
    expect(rovingMove(5, Number.NaN, 'ArrowDown')).toBe(0)
  })
})

describe('rovingStop', () => {
  it('keeps the active id while it is in the list', () => {
    expect(rovingStop(['a', 'b', 'c'], 'b')).toBe('b')
    expect(rovingStop(['a', 'b', 'c'], 'c')).toBe('c')
    expect(rovingStop(['a'], 'a')).toBe('a')
  })

  it('falls back to the first id when the active one is missing or unset', () => {
    expect(rovingStop(['a', 'b', 'c'], 'x')).toBe('a')
    expect(rovingStop(['a', 'b', 'c'], null)).toBe('a')
    expect(rovingStop(['a', 'b', 'c'], '')).toBe('a')
  })

  it('answers null for no ids', () => {
    expect(rovingStop([], null)).toBeNull()
    expect(rovingStop([], 'a')).toBeNull()
  })

  it('answers one id for duplicates', () => {
    expect(rovingStop(['a', 'b', 'a'], 'a')).toBe('a')
    expect(rovingStop(['a', 'a'], null)).toBe('a')
    expect(rovingStop(['a', 'b', 'b'], 'b')).toBe('b')
  })
})

// ---------------------------------------------------------------------------
// Rows

const g = makeTestGame(1, { age: 30 })
const action = (id: string, extra: Partial<MenuAction> = {}): MenuAction => ({ type: 'action', id, label: `Row ${id}`, emoji: '🏭', run: () => {}, ...extra })
const group = (id: string): MenuGroup => ({ type: 'menu', id, label: `Group ${id}`, emoji: '📁', children: () => [] })
const render = (el: ReactElement) => renderToStaticMarkup(el)

/** Every `<button>` tag of the markup, opening tag only. */
const buttons = (html: string) => html.match(/<button\b[^>]*>/g) ?? []

describe('MenuRows markup', () => {
  const nodes: MenuNode[] = [
    { type: 'heading', id: 'h1', label: 'Money' },
    { type: 'info', id: 'i1', emoji: 'ℹ️', text: 'Rates are low.' },
    action('a'),
    action('b', { disabledReason: () => 'Not yet.' }),
    { type: 'heading', id: 'h2', label: 'More' },
    group('c'),
    { type: 'info', id: 'i2', text: 'That is all.' },
    action('d'),
  ]
  const html = render(createElement(MenuRows, { nodes, g, onTap: () => {} }))
  const tags = buttons(html)

  it('has exactly one tab stop, the first row, and the rest at -1', () => {
    expect(tags).toHaveLength(4)
    expect(html.match(/tabindex="0"/g) ?? []).toHaveLength(1)
    expect(html.match(/tabindex="-1"/g) ?? []).toHaveLength(3)
    expect(tags[0]).toContain('tabindex="0"')
    for (const t of tags.slice(1)) expect(t).toContain('tabindex="-1"')
  })

  it('gives every row the same data-roving value', () => {
    const values = tags.map((t) => /data-roving="([^"]*)"/.exec(t)?.[1])
    expect(values.every((v) => typeof v === 'string' && v.length > 0)).toBe(true)
    expect(new Set(values).size).toBe(1)
  })

  it('puts nothing on heading and info rows', () => {
    expect(html.match(/data-roving=/g) ?? []).toHaveLength(4)
    expect(html.match(/tabindex=/g) ?? []).toHaveLength(4)
    for (const cls of ['menu-heading', 'menu-info']) {
      for (const tag of html.match(new RegExp(`<div class="${cls}[^"]*"[^>]*>`, 'g')) ?? []) {
        expect(tag).not.toContain('tabindex')
        expect(tag).not.toContain('data-roving')
      }
    }
  })

  it('keeps a disabled row in the order, with its reason and aria-disabled', () => {
    expect(tags[1]).toContain('aria-disabled="true"')
    expect(tags[1]).toContain('title="Not yet."')
    expect(tags[1]).toContain('tabindex="-1"')
    expect(html.indexOf('Row a')).toBeLessThan(html.indexOf('Row b'))
    expect(html.indexOf('Row b')).toBeLessThan(html.indexOf('Group c'))
  })

  it('leaves the row class string alone', () => {
    expect(html).toContain('class="menu-row"')
    expect(html).toContain('class="menu-row is-disabled"')
  })

  it('still renders every heading, info row and the empty text as before', () => {
    expect(html).toContain('<div class="menu-heading">Money</div>')
    expect(html).toContain('<div class="menu-heading">More</div>')
    expect(html).toContain('Rates are low.')
    expect(html).toContain('That is all.')
    const empty = render(createElement(MenuRows, { nodes: [], g, onTap: () => {}, emptyText: 'Nothing.' }))
    expect(empty).toBe('<div class="menu-empty">Nothing.</div>')
  })

  it('gives different lists different data-roving values', () => {
    const one = render(createElement('div', null, createElement(MenuRows, { nodes: [action('x')], g, onTap: () => {} }), createElement(MenuRows, { nodes: [action('y')], g, onTap: () => {} })))
    const values = buttons(one).map((t) => /data-roving="([^"]*)"/.exec(t)?.[1])
    expect(values).toHaveLength(2)
    expect(values[0]).not.toBe(values[1])
    expect(buttons(one).every((t) => t.includes('tabindex="0"'))).toBe(true)
  })

  it('keeps a duplicate id as its own row with one stop for the list', () => {
    const dup = render(createElement(MenuRows, { nodes: [action('a'), action('a'), action('b')], g, onTap: () => {} }))
    const t = buttons(dup)
    expect(t).toHaveLength(3)
    expect(dup.match(/tabindex="0"/g) ?? []).toHaveLength(1)
  })

  it('skips rows that are not visible when it picks the stop', () => {
    const list: MenuNode[] = [action('hidden', { visible: () => false }), action('shown'), action('also')]
    const out = render(createElement(MenuRows, { nodes: list, g, onTap: () => {} }))
    const t = buttons(out)
    expect(t).toHaveLength(2)
    expect(t[0]).toContain('tabindex="0"')
    expect(out).not.toContain('Row hidden')
  })
})

describe('MenuRow without roving props', () => {
  it('has no tabindex and no data-roving, and the markup is the old one', () => {
    const html = render(createElement(MenuRow, { node: action('solo', { subtitle: 'Sub' }), g, onTap: () => {} }))
    expect(html).not.toContain('tabindex')
    expect(html).not.toContain('data-roving')
    expect(html).toBe(
      '<button type="button" class="menu-row"><span class="menu-row-icon" aria-hidden="true">🏭</span><span class="menu-row-text"><span class="menu-row-label">Row solo</span><span class="menu-row-sub">Sub</span></span><span class="menu-row-end" aria-hidden="true"></span></button>',
    )
  })

  it('has no key or focus handler either', () => {
    const el = MenuRow({ node: action('solo'), g, onTap: () => {} })
    expect(isValidElement(el)).toBe(true)
    const props = (el as ReactElement<Record<string, unknown>>).props
    expect(props.onKeyDown).toBeUndefined()
    expect(props.onFocus).toBeUndefined()
    expect(props.tabIndex).toBeUndefined()
    expect(props['data-roving']).toBeUndefined()
  })
})

describe('MenuRow roving props', () => {
  it('sets tabindex 0 on the stop and -1 on the others', () => {
    const on = render(createElement(MenuRow, { node: action('s'), g, onTap: () => {}, rovingGroup: 'grp', tabStop: true }))
    const off = render(createElement(MenuRow, { node: action('s'), g, onTap: () => {}, rovingGroup: 'grp' }))
    expect(buttons(on)[0]).toContain('tabindex="0"')
    expect(buttons(on)[0]).toContain('data-roving="grp"')
    expect(buttons(off)[0]).toContain('tabindex="-1"')
    expect(buttons(off)[0]).toContain('data-roving="grp"')
  })
})

// ---------------------------------------------------------------------------
// Keyboard handler, driven with plain objects

interface FakeEl {
  attrs: Record<string, string>
  focused: number
  getAttribute: (name: string) => string | null
  focus: () => void
}

const fakeEl = (groupName: string): FakeEl => {
  const el: FakeEl = {
    attrs: { 'data-roving': groupName },
    focused: 0,
    getAttribute: (name) => el.attrs[name] ?? null,
    focus: () => {
      el.focused++
    },
  }
  return el
}

/** The `onKeyDown` a MenuRow hands to its button, with the list around it faked. */
function keyRig(opts: { els: FakeEl[]; current: number; closest?: 'sheet' | 'none' }) {
  const root = { querySelectorAll: (sel: string) => (sel === '[data-roving]' ? opts.els : []) }
  const closest = vi.fn((sel: string) => (opts.closest === 'none' ? null : sel === '.sheet-body' ? root : null))
  const el = MenuRow({ node: action('k'), g, onTap: () => {}, rovingGroup: 'grp', tabStop: true }) as ReactElement<{ onKeyDown: (e: unknown) => void }>
  const press = (key: string, mods: { altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean } = {}) => {
    const preventDefault = vi.fn()
    el.props.onKeyDown({ key, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...mods, preventDefault, currentTarget: Object.assign(opts.els[opts.current] ?? fakeEl('grp'), { closest }) })
    return preventDefault
  }
  return { press, closest, root }
}

describe('MenuRow key handling', () => {
  const list = () => Array.from({ length: 5 }, () => fakeEl('grp'))

  it('moves focus with the arrows and stops the page from scrolling', () => {
    const els = list()
    const { press } = keyRig({ els, current: 1 })
    const prevent = press('ArrowDown')
    expect(prevent).toHaveBeenCalledTimes(1)
    expect(els.map((e) => e.focused)).toEqual([0, 0, 1, 0, 0])
    press('ArrowUp')
    expect(els.map((e) => e.focused)).toEqual([1, 0, 1, 0, 0])
  })

  it('jumps with Home, End and the page keys', () => {
    const els = Array.from({ length: 20 }, () => fakeEl('grp'))
    const { press } = keyRig({ els, current: 3 })
    press('End')
    press('Home')
    press('PageDown')
    expect(els[19]?.focused).toBe(1)
    expect(els[0]?.focused).toBe(1)
    expect(els[3 + ROVING_PAGE]?.focused).toBe(1)
  })

  it('ignores keys with Alt, Ctrl or Meta held', () => {
    const els = list()
    const { press } = keyRig({ els, current: 1 })
    for (const mods of [{ altKey: true }, { ctrlKey: true }, { metaKey: true }]) {
      const prevent = press('ArrowDown', mods)
      expect(prevent).not.toHaveBeenCalled()
    }
    expect(els.every((e) => e.focused === 0)).toBe(true)
  })

  it('lets Shift through and leaves other keys alone', () => {
    const els = list()
    const { press } = keyRig({ els, current: 0 })
    expect(press('ArrowDown', { shiftKey: true })).toHaveBeenCalledTimes(1)
    for (const key of ['Tab', 'Enter', ' ', 'Escape', 'ArrowLeft', 'ArrowRight', 'a']) {
      expect(press(key)).not.toHaveBeenCalled()
    }
    expect(els.map((e) => e.focused)).toEqual([0, 1, 0, 0, 0])
  })

  it('only counts rows of its own list', () => {
    const els = [fakeEl('grp'), fakeEl('other'), fakeEl('grp'), fakeEl('other')]
    const { press } = keyRig({ els, current: 0 })
    press('ArrowDown')
    expect(els.map((e) => e.focused)).toEqual([0, 0, 1, 0])
    const last = keyRig({ els, current: 2 })
    last.press('ArrowDown')
    expect(els.map((e) => e.focused)).toEqual([1, 0, 1, 0])
  })

  it('reads the list from the sheet body when there is one, and from the document when there is not', () => {
    const els = list()
    const sheet = keyRig({ els, current: 0 })
    sheet.press('ArrowDown')
    expect(sheet.closest).toHaveBeenCalledWith('.sheet-body')
    expect(els[1]?.focused).toBe(1)

    const docEls = list()
    const doc = { querySelectorAll: (sel: string) => (sel === '[data-roving]' ? docEls : []) }
    vi.stubGlobal('document', doc)
    const loose = keyRig({ els: docEls, current: 4, closest: 'none' })
    loose.press('ArrowDown')
    expect(docEls[0]?.focused).toBe(1)
  })
})

describe('menu rows stay out of the saved state', () => {
  it('renders without touching the game state', () => {
    const before = JSON.stringify(g)
    render(createElement(MenuRows, { nodes: [action('a'), group('b')], g, onTap: () => {} }))
    expect(JSON.stringify(g)).toBe(before)
  })
})
