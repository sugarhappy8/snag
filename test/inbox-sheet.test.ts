// R1-T6 (G.11 step 2): the inbox sheet. The store is mocked and there is no DOM, so the markup is checked with
// renderToStaticMarkup, and the handlers and the mount effect are reached by calling the component as a function with
// useEffect and useRef swapped for plain stand-ins (the way test/lazy-view-mount.test.ts runs effects by hand).
import { readFileSync } from 'node:fs'
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { unitFlags } from '../scripts/voice/rules.mjs'
import { inboxUnread, type InboxItem, type InboxState } from '../src/game/inbox'
import type { GameState } from '../src/game/types'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'

const mock = vi.hoisted(() => ({
  state: { game: null as unknown, settings: { quietMode: true } as Record<string, unknown> },
  calls: [] as string[],
  patches: [] as unknown[],
  effects: [] as Array<() => void | (() => void)>,
}))

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useEffect: (effect: () => void | (() => void)) => {
      mock.effects.push(effect)
    },
    useRef: <T>(initial: T) => ({ current: initial }),
  }
})

vi.mock('../src/ui/store', () => ({
  useApp: (sel: (s: typeof mock.state) => unknown) => sel(mock.state),
  getApp: () => mock.state,
  markInboxSeen: () => mock.calls.push('markInboxSeen'),
  clearInbox: () => mock.calls.push('clearInbox'),
  updateSettings: (patch: unknown) => {
    mock.calls.push('updateSettings')
    mock.patches.push(patch)
  },
}))

const { InboxSheet, inboxGroups } = await import('../src/ui/components/InboxSheet')

const noop = (): void => undefined

function row(n: number, extra: Partial<InboxItem> = {}): InboxItem {
  return { id: `i${n}`, y: 2030, a: 30, t: `Item ${n}: something small happened.`, ...extra }
}

function stateOf(items: InboxItem[], extra: Partial<Omit<InboxState, 'items'>> = {}): InboxState {
  return { v: 1, total: items.length, seen: items.length, items, ...extra }
}

function setInbox(inbox: unknown): GameState {
  const g = makeTestGame(1)
  if (inbox !== undefined) g.flags.inbox = inbox as never
  mock.state.game = g
  return g
}

function html(props: { onOpenLink?: (link: string) => void } = {}): string {
  return renderToStaticMarkup(createElement(InboxSheet, { onClose: noop, ...props }))
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

type El = { type: unknown; props: Record<string, unknown> }

function walk(node: unknown, visit: (el: El) => void): void {
  if (Array.isArray(node)) {
    for (const n of node) walk(n, visit)
    return
  }
  if (node !== null && typeof node === 'object' && 'props' in node) {
    const el = node as El
    visit(el)
    walk(el.props.children, visit)
    walk(el.props.footer, visit)
  }
}

function textOfNode(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOfNode).join('')
  if (node !== null && typeof node === 'object' && 'props' in node) return textOfNode((node as El).props.children)
  return ''
}

/** Call the component once as a function and give back the buttons it drew, by their text. */
function mount(props: { onOpenLink?: (link: string) => void } = {}): { buttons: Map<string, El[]>; tree: ReactElement } {
  mock.effects.length = 0
  const tree = InboxSheet({ onClose: noop, ...props })
  const buttons = new Map<string, El[]>()
  walk(tree, (el) => {
    if (el.type !== 'button') return
    const label = textOfNode(el.props.children)
    buttons.set(label, [...(buttons.get(label) ?? []), el])
  })
  return { buttons, tree }
}

function press(el: El | undefined): void {
  expect(el).toBeDefined()
  ;(el!.props.onClick as () => void)()
}

beforeEach(() => {
  mock.calls.length = 0
  mock.patches.length = 0
  mock.effects.length = 0
  mock.state.settings = { quietMode: true }
  mock.state.game = null
})

describe('inboxGroups', () => {
  it('is [] for no rows', () => {
    expect(inboxGroups(stateOf([]))).toEqual([])
  })

  it('puts the newest year and age first, and the newest row first inside a group', () => {
    const a = row(1, { y: 2029, a: 29 })
    const b = row(2, { y: 2030, a: 30 })
    const c = row(3, { y: 2030, a: 30 })
    const d = row(4, { y: 2031, a: 31 })
    const groups = inboxGroups(stateOf([a, b, c, d]))
    expect(groups.map((g) => g.heading)).toEqual(['2031, age 31', '2030, age 30', '2029, age 29'])
    expect(groups.map((g) => g.items.map((i) => i.id))).toEqual([['i4'], ['i3', 'i2'], ['i1']])
  })

  it('gives every group its own key, even when the stored rows are out of order', () => {
    const groups = inboxGroups(stateOf([row(1, { y: 2030, a: 30 }), row(2, { y: 2029, a: 29 }), row(3, { y: 2030, a: 30 })]))
    expect(new Set(groups.map((g) => g.key)).size).toBe(groups.length)
    expect(groups.map((g) => g.items.map((i) => i.id))).toEqual([['i3', 'i1'], ['i2']])
  })

  it('is pure over a frozen state: it writes nothing and the result is a new list', () => {
    const state = deepFreeze(stateOf([row(1), row(2), row(3, { y: 2031, a: 31 })]))
    const before = JSON.stringify(state)
    const groups = inboxGroups(state)
    expect(JSON.stringify(state)).toBe(before)
    expect(groups.flatMap((g) => g.items)).toHaveLength(3)
    expect(groups[0].items).not.toBe(state.items)
  })
})

describe('the sheet', () => {
  it('is a dialog titled Inbox with the inbox emoji and a Close button', () => {
    setInbox(undefined)
    const out = html()
    expect(out).toContain('role="dialog"')
    expect(out).toContain('aria-label="Inbox"')
    expect(out).toContain('📥')
    expect(out).toContain('aria-label="Close"')
  })

  it('says why it is empty, and draws no Clear button', () => {
    setInbox(undefined)
    const out = html()
    expect(out).toContain('Nothing here. Routine news waits here while Quiet Mode is on.')
    expect(out).not.toContain('inbox-row')
    expect(out).not.toContain('inbox-group')
    expect(mount().buttons.has('Clear')).toBe(false)
  })

  it('draws the empty state with no game at all', () => {
    mock.state.game = null
    expect(html()).toContain('Nothing here.')
    expect(() => mount()).not.toThrow()
  })

  it('draws a damaged inbox as empty instead of throwing', () => {
    for (const junk of ['nope', 7, null, { items: 'x' }, { v: 1, total: 'many', seen: {}, items: [null, 3, { id: 1 }] }, []]) {
      setInbox(junk)
      expect(html(), JSON.stringify(junk)).toContain('Nothing here.')
    }
  })

  it('lists the groups newest first, each under its heading', () => {
    setInbox(stateOf([row(1, { y: 2029, a: 29 }), row(2, { y: 2030, a: 30 }), row(3, { y: 2031, a: 31 })]))
    const out = html()
    expect(count(out, 'class="inbox-group"')).toBe(3)
    expect(count(out, 'class="inbox-heading"')).toBe(3)
    const at = (s: string): number => out.indexOf(s)
    expect(at('2031, age 31')).toBeGreaterThan(-1)
    expect(at('2031, age 31')).toBeLessThan(at('2030, age 30'))
    expect(at('2030, age 30')).toBeLessThan(at('2029, age 29'))
    expect(at('Item 3:')).toBeLessThan(at('Item 2:'))
    expect(at('Item 2:')).toBeLessThan(at('Item 1:'))
  })

  it('draws a row as its text', () => {
    setInbox(stateOf([row(1, { t: 'A letter: it came today.' })]))
    expect(html()).toContain('A letter: it came today.')
  })
})

describe('hostile data', () => {
  it('renders a row as escaped plain text', () => {
    const evil = '<script>alert(1)</script> & <img src=x onerror=alert(1)> "quote"'
    setInbox(stateOf([row(1, { t: evil })]))
    const out = html()
    expect(out).not.toContain('<script')
    expect(out).not.toContain('<img')
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(out).toContain('&amp;')
  })

  it('drops a row link that is not a place key, so no Open button can lead anywhere odd', () => {
    setInbox(stateOf([row(1, { l: 'javascript:alert(1)' }), row(2, { l: '../../x' }), row(3, { l: '<b>' })]))
    expect(html({ onOpenLink: noop })).not.toContain('>Open<')
  })

  it('clamps an over-long row text', () => {
    setInbox(stateOf([row(1, { t: 'x'.repeat(5000) })]))
    expect(html().length).toBeLessThan(20_000)
  })
})

describe('Open buttons', () => {
  const linked = (): void => {
    setInbox(stateOf([row(1, { l: 'assets/home/mortgage' }), row(2), row(3, { l: 'activities/social' })]))
  }

  it('are drawn only for rows with a link, and only when the host passed onOpenLink', () => {
    linked()
    expect(count(html({ onOpenLink: noop }), '>Open<')).toBe(2)
    expect(count(html(), '>Open<')).toBe(0)
  })

  it('are 44 px targets: they carry the inbox-open class', () => {
    linked()
    expect(count(html({ onOpenLink: noop }), 'inbox-open')).toBe(2)
  })

  it('call onOpenLink with the row link', () => {
    linked()
    const onOpenLink = vi.fn()
    const { buttons } = mount({ onOpenLink })
    const open = buttons.get('Open') ?? []
    expect(open).toHaveLength(2)
    open.forEach((el) => press(el))
    expect(onOpenLink.mock.calls.map((c) => c[0]).sort()).toEqual(['activities/social', 'assets/home/mortgage'])
  })

  it('are not drawn when no row has a link', () => {
    setInbox(stateOf([row(1), row(2)]))
    expect(mount({ onOpenLink: noop }).buttons.has('Open')).toBe(false)
  })
})

describe('new rows', () => {
  function items(n: number): InboxItem[] {
    return Array.from({ length: n }, (_, i) => row(i + 1, { y: 2030 + i, a: 30 + i }))
  }

  it('are the unread ones: as many is-new rows as unread, the newest first', () => {
    const g = setInbox(stateOf(items(5), { total: 5, seen: 3 }))
    expect(inboxUnread(g)).toBe(2)
    const out = html()
    expect(count(out, 'is-new')).toBe(2)
    const newRows = out.split('<li ').filter((s) => s.includes('is-new'))
    expect(newRows.some((s) => s.includes('Item 5:'))).toBe(true)
    expect(newRows.some((s) => s.includes('Item 4:'))).toBe(true)
    expect(newRows.some((s) => s.includes('Item 3:'))).toBe(false)
  })

  it('say New in text as well, so it is not colour alone', () => {
    setInbox(stateOf(items(4), { total: 4, seen: 2 }))
    const out = html()
    expect(count(out, 'sr-only')).toBe(2)
    expect(count(out, '>New<')).toBe(2)
  })

  it('are none when everything was seen', () => {
    setInbox(stateOf(items(4)))
    const out = html()
    expect(out).not.toContain('is-new')
    expect(out).not.toContain('>New<')
  })

  it('are every row when the unread count is at least the number of rows', () => {
    setInbox(stateOf(items(3), { total: 10, seen: 0 }))
    expect(count(html(), 'is-new')).toBe(3)
  })

  it('follow the unread count, not the order of the groups', () => {
    setInbox(stateOf([row(1, { y: 2031, a: 31 }), row(2, { y: 2030, a: 30 }), row(3, { y: 2031, a: 31 })], { total: 3, seen: 2 }))
    const out = html()
    expect(count(out, 'is-new')).toBe(1)
    expect(out.split('<li ').filter((s) => s.includes('is-new'))[0]).toContain('Item 3:')
  })
})

describe('on mount', () => {
  it('marks the inbox seen once when something is unread', () => {
    setInbox(stateOf([row(1), row(2)], { total: 2, seen: 0 }))
    mount()
    expect(mock.effects.length).toBeGreaterThan(0)
    for (const effect of [...mock.effects]) effect()
    expect(mock.calls.filter((c) => c === 'markInboxSeen')).toHaveLength(1)
  })

  it('does not call the store when nothing is unread', () => {
    setInbox(stateOf([row(1), row(2)]))
    mount()
    for (const effect of [...mock.effects]) effect()
    expect(mock.calls).toEqual([])
  })

  it('does not call the store when there is no inbox', () => {
    setInbox(undefined)
    mount()
    for (const effect of [...mock.effects]) effect()
    expect(mock.calls).toEqual([])
  })

  it('draws nothing from the store while rendering to markup', () => {
    setInbox(stateOf([row(1)], { total: 1, seen: 0 }))
    html()
    expect(mock.calls).toEqual([])
  })
})

describe('the footer', () => {
  it('says Quiet Mode is on with a Turn off button, and turns it off', () => {
    setInbox(stateOf([row(1)]))
    const out = html()
    expect(out).toContain('Quiet Mode is on.')
    expect(out).toContain('>Turn off<')
    expect(out).not.toContain('>Turn on<')
    press(mount().buttons.get('Turn off')?.[0])
    expect(mock.patches).toEqual([{ quietMode: false }])
  })

  it('says Quiet Mode is off with a Turn on button, and turns it on', () => {
    mock.state.settings = { quietMode: false }
    setInbox(stateOf([row(1)]))
    const out = html()
    expect(out).toContain('Quiet Mode is off.')
    expect(out).toContain('>Turn on<')
    expect(out).not.toContain('>Turn off<')
    press(mount().buttons.get('Turn on')?.[0])
    expect(mock.patches).toEqual([{ quietMode: true }])
  })

  it('counts a missing quietMode setting as on', () => {
    mock.state.settings = {}
    setInbox(stateOf([row(1)]))
    expect(html()).toContain('Quiet Mode is on.')
  })

  it('shows Clear only when there are rows, and Clear empties the inbox', () => {
    setInbox(stateOf([row(1)]))
    expect(html()).toContain('>Clear<')
    press(mount().buttons.get('Clear')?.[0])
    expect(mock.calls).toEqual(['clearInbox'])
    setInbox(undefined)
    expect(html()).not.toContain('>Clear<')
  })

  it('keeps the Quiet Mode line when the inbox is empty', () => {
    setInbox(undefined)
    expect(html()).toContain('Quiet Mode is on.')
  })
})

describe('voice and styles', () => {
  const css = readFileSync(new URL('../src/ui/styles/notices.css', import.meta.url), 'utf8')
  const inboxCss = css.slice(css.indexOf('/* Inbox sheet'))

  it('the copy passes the tooltip rules with no flag', () => {
    for (const text of [
      'Nothing here. Routine news waits here while Quiet Mode is on.',
      'Quiet Mode is on.',
      'Quiet Mode is off.',
      'Inbox',
      'Clear',
      'Open',
      'Turn off',
      'Turn on',
    ]) {
      expect(unitFlags(text, 'tooltip'), text).toEqual([])
      expect(text).not.toMatch(/[\u2013\u2014]/)
    }
  })

  it('what the sheet draws has no en or em dash, in any state', () => {
    setInbox(stateOf([row(1, { l: 'assets/home/mortgage' })], { total: 2, seen: 0 }))
    expect(html({ onOpenLink: noop })).not.toMatch(/[\u2013\u2014]/)
    mock.state.settings = { quietMode: false }
    setInbox(undefined)
    expect(html()).not.toMatch(/[\u2013\u2014]/)
  })

  it('the component and the stylesheet carry no en or em dash', () => {
    for (const path of ['src/ui/components/InboxSheet.tsx', 'src/ui/styles/notices.css']) {
      expect(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), path).not.toMatch(/[\u2013\u2014]/)
    }
  })

  it('notices.css has the inbox rules', () => {
    expect(css).toContain('/* Inbox sheet')
    for (const rule of ['.inbox-group', '.inbox-heading', '.inbox-row', '.inbox-row.is-new', '.inbox-open', '.inbox-footer']) {
      expect(inboxCss, rule).toContain(rule)
    }
  })

  it('a new row has a 3px left border in the event tone, and an Open target is at least 44px tall', () => {
    const block = (selector: string): string => {
      const at = inboxCss.indexOf(`${selector} {`)
      expect(at, selector).toBeGreaterThan(-1)
      return inboxCss.slice(at, inboxCss.indexOf('}', at))
    }
    expect(block('.inbox-row.is-new')).toMatch(/border-left:\s*3px solid var\(--tone-event\)/)
    expect(block('.inbox-open')).toMatch(/min-height:\s*44px/)
  })

  it('the inbox rules use tokens only: no colour literal, and only the agreed variables', () => {
    expect(inboxCss).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(inboxCss).not.toMatch(/\b(?:rgb|rgba|hsl|hsla)\(/)
    const used = new Set([...inboxCss.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]))
    expect(used.size).toBeGreaterThan(0)
    for (const name of used) expect(['--card', '--hairline', '--muted', '--text', '--tone-event'], name).toContain(name)
  })
})
