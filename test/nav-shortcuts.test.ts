// R1-N7: the keyboard shortcuts of the game screen (G.9). shortcutFor is a pure function of one key event and a small
// context; routeKey is the part of the window listener that reads the page (the focused element and the open dialogs), so
// both are tested in node with plain objects. The hook itself only adds and removes the listener.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { isModalOpen, openModal, type ModalEnv } from '../src/ui/a11y/modal'
import {
  SHORTCUTS_OFF,
  TAB_KEYS,
  isTypingTarget,
  routeKey,
  shortcutFor,
  type ShortcutAction,
  type ShortcutContext,
  type ShortcutEvent,
} from '../src/ui/nav/shortcuts'

function ev(key: string, over: Partial<ShortcutEvent> = {}): ShortcutEvent {
  return { key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, ...over }
}

function ctx(over: Partial<ShortcutContext> = {}): ShortcutContext {
  return { typing: false, queueBusy: false, dead: false, sheetOpen: false, paletteOpen: false, popupOpen: false, ...over }
}

const PALETTE: ShortcutAction = { type: 'palette' }
const AGE: ShortcutAction = { type: 'age' }
const tab = (t: 'occupation' | 'assets' | 'relationships' | 'activities'): ShortcutAction => ({ type: 'tab', tab: t })

describe('1. Ctrl+K and Cmd+K', () => {
  it('open the palette, in either case, and also while typing', () => {
    expect(shortcutFor(ev('k', { ctrlKey: true }), ctx())).toEqual(PALETTE)
    expect(shortcutFor(ev('k', { metaKey: true }), ctx())).toEqual(PALETTE)
    expect(shortcutFor(ev('K', { ctrlKey: true }), ctx())).toEqual(PALETTE)
    expect(shortcutFor(ev('k', { ctrlKey: true }), ctx({ typing: true }))).toEqual(PALETTE)
    expect(shortcutFor(ev('k', { metaKey: true }), ctx({ typing: true }))).toEqual(PALETTE)
  })

  it.each([
    ['queueBusy', { queueBusy: true }],
    ['dead', { dead: true }],
    ['popupOpen', { popupOpen: true }],
  ] as const)('are blocked with %s', (_name, over) => {
    expect(shortcutFor(ev('k', { ctrlKey: true }), ctx(over))).toBeNull()
    expect(shortcutFor(ev('k', { metaKey: true }), ctx({ ...over, typing: true }))).toBeNull()
  })

  it('leave Alt and Shift combinations to the browser (Firefox opens its console on Ctrl+Shift+K and Cmd+Option+K)', () => {
    expect(shortcutFor(ev('k', { ctrlKey: true, altKey: true }), ctx())).toBeNull()
    expect(shortcutFor(ev('k', { metaKey: true, altKey: true }), ctx())).toBeNull()
    expect(shortcutFor(ev('K', { ctrlKey: true, shiftKey: true }), ctx())).toBeNull()
  })
})

describe('2. the slash key', () => {
  it('opens the palette when nothing is being typed', () => {
    expect(shortcutFor(ev('/'), ctx())).toEqual(PALETTE)
    expect(shortcutFor(ev('/'), ctx({ sheetOpen: true }))).toEqual(PALETTE)
  })

  it('is just a character while typing, and never fires with Ctrl, Cmd or Alt', () => {
    expect(shortcutFor(ev('/'), ctx({ typing: true }))).toBeNull()
    expect(shortcutFor(ev('/', { ctrlKey: true }), ctx())).toBeNull()
    expect(shortcutFor(ev('/', { metaKey: true }), ctx())).toBeNull()
    expect(shortcutFor(ev('/', { altKey: true }), ctx())).toBeNull()
  })

  it('still works where / needs Shift (a German keyboard)', () => {
    expect(shortcutFor(ev('/', { shiftKey: true }), ctx())).toEqual(PALETTE)
  })
})

describe('3. the digits 1 to 4', () => {
  it('follow the bottom bar: occupation, assets, relationships, activities', () => {
    expect(shortcutFor(ev('1'), ctx())).toEqual(tab('occupation'))
    expect(shortcutFor(ev('2'), ctx())).toEqual(tab('assets'))
    expect(shortcutFor(ev('3'), ctx())).toEqual(tab('relationships'))
    expect(shortcutFor(ev('4'), ctx())).toEqual(tab('activities'))
  })

  it('share one table with the bottom bar labels', () => {
    expect(TAB_KEYS).toEqual({ occupation: '1', assets: '2', relationships: '3', activities: '4' })
  })

  it.each([
    ['typing', { typing: true }],
    ['queueBusy', { queueBusy: true }],
    ['paletteOpen', { paletteOpen: true }],
    ['popupOpen', { popupOpen: true }],
    ['dead', { dead: true }],
  ] as const)('give nothing with %s', (_name, over) => {
    for (const key of ['1', '2', '3', '4']) expect(shortcutFor(ev(key), ctx(over))).toBeNull()
  })

  it('give nothing with Ctrl, Cmd, Alt or on a repeat (Ctrl+1 belongs to the browser)', () => {
    for (const key of ['1', '2', '3', '4']) {
      expect(shortcutFor(ev(key, { ctrlKey: true }), ctx())).toBeNull()
      expect(shortcutFor(ev(key, { metaKey: true }), ctx())).toBeNull()
      expect(shortcutFor(ev(key, { altKey: true }), ctx())).toBeNull()
      expect(shortcutFor(ev(key, { repeat: true }), ctx())).toBeNull()
    }
  })

  it('still work where a digit needs Shift (a French keyboard)', () => {
    expect(shortcutFor(ev('1', { shiftKey: true }), ctx())).toEqual(tab('occupation'))
  })
})

describe('4. the A key', () => {
  it('ages you up, in either case, only when everything is closed', () => {
    expect(shortcutFor(ev('a'), ctx())).toEqual(AGE)
    expect(shortcutFor(ev('A'), ctx())).toEqual(AGE)
  })

  it.each([
    ['sheetOpen', { sheetOpen: true }],
    ['paletteOpen', { paletteOpen: true }],
    ['popupOpen', { popupOpen: true }],
    ['typing', { typing: true }],
    ['queueBusy', { queueBusy: true }],
    ['dead', { dead: true }],
  ] as const)('does nothing with %s', (_name, over) => {
    expect(shortcutFor(ev('a'), ctx(over))).toBeNull()
    expect(shortcutFor(ev('A'), ctx(over))).toBeNull()
  })

  it('does nothing on a repeat, with Ctrl (so Ctrl+A keeps selecting text), Cmd, Alt or Shift', () => {
    expect(shortcutFor(ev('a', { repeat: true }), ctx())).toBeNull()
    expect(shortcutFor(ev('a', { ctrlKey: true }), ctx())).toBeNull()
    expect(shortcutFor(ev('a', { metaKey: true }), ctx())).toBeNull()
    expect(shortcutFor(ev('a', { altKey: true }), ctx())).toBeNull()
    expect(shortcutFor(ev('A', { shiftKey: true }), ctx())).toBeNull()
  })
})

describe('5. the truth table', () => {
  type Row = [name: string, event: ShortcutEvent, context: ShortcutContext, expected: ShortcutAction | null]
  const rows: Row[] = [
    ['Ctrl+K', ev('k', { ctrlKey: true }), ctx(), PALETTE],
    ['Cmd+K', ev('k', { metaKey: true }), ctx(), PALETTE],
    ['Ctrl+K with Caps Lock', ev('K', { ctrlKey: true }), ctx(), PALETTE],
    ['Ctrl+K typing', ev('k', { ctrlKey: true }), ctx({ typing: true }), PALETTE],
    ['Ctrl+K with a sheet open', ev('k', { ctrlKey: true }), ctx({ sheetOpen: true }), PALETTE],
    ['Ctrl+K queueBusy', ev('k', { ctrlKey: true }), ctx({ queueBusy: true }), null],
    ['Ctrl+K dead', ev('k', { ctrlKey: true }), ctx({ dead: true }), null],
    ['Ctrl+K popupOpen', ev('k', { ctrlKey: true }), ctx({ popupOpen: true }), null],
    ['Ctrl+K repeat', ev('k', { ctrlKey: true, repeat: true }), ctx(), null],
    ['Ctrl+Alt+K', ev('k', { ctrlKey: true, altKey: true }), ctx(), null],
    ['K alone', ev('k'), ctx(), null],
    ['Alt+K', ev('k', { altKey: true }), ctx(), null],
    ['slash', ev('/'), ctx(), PALETTE],
    ['slash typing', ev('/'), ctx({ typing: true }), null],
    ['Ctrl+slash', ev('/', { ctrlKey: true }), ctx(), null],
    ['Alt+slash', ev('/', { altKey: true }), ctx(), null],
    ['slash queueBusy', ev('/'), ctx({ queueBusy: true }), null],
    ['slash dead', ev('/'), ctx({ dead: true }), null],
    ['slash popupOpen', ev('/'), ctx({ popupOpen: true }), null],
    ['slash repeat', ev('/', { repeat: true }), ctx(), null],
    ['1', ev('1'), ctx(), tab('occupation')],
    ['2', ev('2'), ctx(), tab('assets')],
    ['3', ev('3'), ctx(), tab('relationships')],
    ['4', ev('4'), ctx(), tab('activities')],
    ['5', ev('5'), ctx(), null],
    ['0', ev('0'), ctx(), null],
    ['1 typing', ev('1'), ctx({ typing: true }), null],
    ['2 queueBusy', ev('2'), ctx({ queueBusy: true }), null],
    ['3 paletteOpen', ev('3'), ctx({ paletteOpen: true }), null],
    ['4 popupOpen', ev('4'), ctx({ popupOpen: true }), null],
    ['1 dead', ev('1'), ctx({ dead: true }), null],
    ['Ctrl+1', ev('1', { ctrlKey: true }), ctx(), null],
    ['a', ev('a'), ctx(), AGE],
    ['A', ev('A'), ctx(), AGE],
    ['a sheetOpen', ev('a'), ctx({ sheetOpen: true }), null],
    ['a paletteOpen', ev('a'), ctx({ paletteOpen: true }), null],
    ['a popupOpen', ev('a'), ctx({ popupOpen: true }), null],
    ['a typing', ev('a'), ctx({ typing: true }), null],
    ['a queueBusy', ev('a'), ctx({ queueBusy: true }), null],
    ['a dead', ev('a'), ctx({ dead: true }), null],
    ['a repeat', ev('a', { repeat: true }), ctx(), null],
    ['Ctrl+A', ev('a', { ctrlKey: true }), ctx(), null],
    ['Enter', ev('Enter'), ctx(), null],
    ['Escape', ev('Escape'), ctx(), null],
    ['space', ev(' '), ctx(), null],
    ['ArrowDown', ev('ArrowDown'), ctx(), null],
  ]

  it('has at least 40 rows', () => {
    expect(rows.length).toBeGreaterThanOrEqual(40)
  })

  it.each(rows)('%s', (_name, event, context, expected) => {
    expect(shortcutFor(event, context)).toEqual(expected)
  })
})

describe('6. other keys', () => {
  it('give nothing, whatever the context', () => {
    for (const key of ['Enter', 'Escape', 'Tab', '5', '9', '0', 'k', 'b', '?', 'ArrowLeft', 'F5', 'Shift', 'Control']) {
      expect(shortcutFor(ev(key), ctx())).toBeNull()
    }
  })

  it('give nothing for an event with no key (browser autofill sends one) or a key that is not text', () => {
    expect(shortcutFor({ ...ev('a'), key: undefined as unknown as string }, ctx())).toBeNull()
    expect(shortcutFor({ ...ev('a'), key: null as unknown as string }, ctx())).toBeNull()
    expect(shortcutFor({ ...ev('a'), key: 7 as unknown as string }, ctx())).toBeNull()
  })

  it('SHORTCUTS_OFF, the context GameScreen passes while the flag is off, gives nothing for any of them', () => {
    for (const e of [ev('k', { ctrlKey: true }), ev('k', { metaKey: true }), ev('/'), ev('1'), ev('4'), ev('a'), ev('A')]) {
      expect(shortcutFor(e, SHORTCUTS_OFF)).toBeNull()
    }
  })
})

describe('isTypingTarget', () => {
  it('is true for a text field, a text area, a select and anything editable', () => {
    expect(isTypingTarget({ tagName: 'INPUT' })).toBe(true)
    expect(isTypingTarget({ tagName: 'TEXTAREA' })).toBe(true)
    expect(isTypingTarget({ tagName: 'SELECT' })).toBe(true)
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true)
  })

  it('is false for a button, the page, nothing, or something that is not an element', () => {
    expect(isTypingTarget({ tagName: 'BUTTON' })).toBe(false)
    expect(isTypingTarget({ tagName: 'BODY' })).toBe(false)
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: false })).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
    expect(isTypingTarget(undefined)).toBe(false)
    expect(isTypingTarget('INPUT')).toBe(false)
    expect(isTypingTarget({ tagName: 7 })).toBe(false)
  })
})

/** A dialog on a page of two nodes, enough for openModal: it only has to register itself on the stack. */
function fakeDialog() {
  const root = { name: 'root' }
  const box = { name: 'dialog' }
  const env: ModalEnv<object> = {
    root,
    tree: { parentOf: () => null, childrenOf: () => [], exempt: () => false },
    active: () => null,
    contains: () => false,
    tabbables: () => [],
    focus: () => {},
    setInert: () => {},
    usable: () => false,
    isBody: () => false,
    home: () => null,
  }
  return openModal(env, box, null)
}

describe('routeKey: the part of the listener that reads the page', () => {
  function run(e: ShortcutEvent, context: ShortcutContext, page?: { active: unknown; modalOpen: boolean }) {
    const preventDefault = vi.fn()
    const handle = vi.fn()
    const handled = routeKey({ ...e, preventDefault }, context, handle, page)
    return { handled, preventDefault, handle }
  }

  it('hands the action over and stops the browser when a key is a shortcut', () => {
    const r = run(ev('k', { ctrlKey: true }), ctx(), { active: null, modalOpen: false })
    expect(r.handled).toBe(true)
    expect(r.handle).toHaveBeenCalledWith(PALETTE)
    expect(r.preventDefault).toHaveBeenCalledTimes(1)
  })

  it('leaves every other key alone', () => {
    const r = run(ev('Enter'), ctx(), { active: null, modalOpen: false })
    expect(r.handled).toBe(false)
    expect(r.handle).not.toHaveBeenCalled()
    expect(r.preventDefault).not.toHaveBeenCalled()
  })

  it('reads typing from the focused element at the moment of the key', () => {
    const typed = run(ev('1'), ctx(), { active: { tagName: 'INPUT' }, modalOpen: false })
    expect(typed.handle).not.toHaveBeenCalled()
    expect(typed.preventDefault).not.toHaveBeenCalled()
    const palette = run(ev('k', { ctrlKey: true }), ctx(), { active: { tagName: 'INPUT' }, modalOpen: false })
    expect(palette.handle).toHaveBeenCalledWith(PALETTE)
    const elsewhere = run(ev('1'), ctx(), { active: { tagName: 'BUTTON' }, modalOpen: false })
    expect(elsewhere.handle).toHaveBeenCalledWith(tab('occupation'))
  })

  it('15. a dialog that is open stops 1 to 4, A and the palette keys even when no sheet state is set', () => {
    expect(isModalOpen()).toBe(false)
    const dialog = fakeDialog()
    try {
      expect(isModalOpen()).toBe(true)
      for (const key of ['1', '2', '3', '4', 'a', 'A', '/']) {
        const r = run(ev(key), ctx())
        expect(r.handled, key).toBe(false)
        expect(r.handle, key).not.toHaveBeenCalled()
        expect(r.preventDefault, key).not.toHaveBeenCalled()
      }
      expect(run(ev('k', { ctrlKey: true }), ctx()).handled).toBe(false)
    } finally {
      dialog.close()
    }
    expect(isModalOpen()).toBe(false)
    expect(run(ev('1'), ctx()).handle).toHaveBeenCalledWith(tab('occupation'))
  })

  it('stacks: with two dialogs open, closing one keeps the keys quiet', () => {
    const lower = fakeDialog()
    const upper = fakeDialog()
    upper.close()
    expect(run(ev('a'), ctx()).handled).toBe(false)
    lower.close()
    expect(run(ev('a'), ctx()).handle).toHaveBeenCalledWith(AGE)
  })
})

describe('the files', () => {
  const DASHES = [String.fromCharCode(0x2014), String.fromCharCode(0x2013)]
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8')

  it('have no em-dash, no en-dash and no lazy helper of React', () => {
    for (const rel of ['src/ui/nav/shortcuts.ts', 'src/ui/nav/reopen.ts', 'test/nav-shortcuts.test.ts']) {
      const src = read(rel)
      expect(src, rel).not.toContain(DASHES[0])
      expect(src, rel).not.toContain(DASHES[1])
      expect(src, rel).not.toMatch(/React\.lazy|\blazy\(/)
    }
  })
})
