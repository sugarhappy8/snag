// R1-A4: the pure half of the modal focus kit (G.12). The trap reducer, the tabbable filter, the inert-target walk
// and the restore chain are tables over plain objects; there is no DOM in these tests. The controller that uses them
// is in a11y-modal.test.ts.
import { describe, expect, it } from 'vitest'
import {
  isolationTargets,
  isTabbable,
  restoreTarget,
  TABBABLE_SELECTOR,
  trapFocus,
  type TabCandidate,
  type TrapMove,
  type TrapNode,
  type TreeAccess,
} from '../src/ui/a11y/focus'

const nodes = (n: number, active: number | null): TrapNode[] => Array.from({ length: n }, (_, i) => ({ active: i === active }))
const tab = { key: 'Tab', shiftKey: false }
const shiftTab = { key: 'Tab', shiftKey: true }
const pass: TrapMove = { kind: 'pass' }
const focusAt = (index: number): TrapMove => ({ kind: 'focus', index })
const toContainer: TrapMove = { kind: 'container' }

describe('trapFocus', () => {
  it('lets the browser move focus inside the trap: Tab before the last node, Shift+Tab after the first', () => {
    expect(trapFocus(nodes(4, 0), tab)).toEqual(pass)
    expect(trapFocus(nodes(4, 1), tab)).toEqual(pass)
    expect(trapFocus(nodes(4, 2), tab)).toEqual(pass)
    expect(trapFocus(nodes(4, 1), shiftTab)).toEqual(pass)
    expect(trapFocus(nodes(4, 2), shiftTab)).toEqual(pass)
    expect(trapFocus(nodes(4, 3), shiftTab)).toEqual(pass)
  })

  it('wraps Tab on the last node to the first, and Shift+Tab on the first node to the last', () => {
    expect(trapFocus(nodes(4, 3), tab)).toEqual(focusAt(0))
    expect(trapFocus(nodes(4, 0), shiftTab)).toEqual(focusAt(3))
    expect(trapFocus(nodes(2, 1), tab)).toEqual(focusAt(0))
    expect(trapFocus(nodes(2, 0), shiftTab)).toEqual(focusAt(1))
  })

  it('pulls focus in from nowhere: Tab lands on the first node, Shift+Tab on the last', () => {
    expect(trapFocus(nodes(4, null), tab)).toEqual(focusAt(0))
    expect(trapFocus(nodes(4, null), shiftTab)).toEqual(focusAt(3))
    expect(trapFocus(nodes(1, null), tab)).toEqual(focusAt(0))
    expect(trapFocus(nodes(1, null), shiftTab)).toEqual(focusAt(0))
  })

  it('keeps a single node on itself in both directions', () => {
    expect(trapFocus(nodes(1, 0), tab)).toEqual(focusAt(0))
    expect(trapFocus(nodes(1, 0), shiftTab)).toEqual(focusAt(0))
  })

  it('sends focus to the container when there is nothing to tab to', () => {
    expect(trapFocus([], tab)).toEqual(toContainer)
    expect(trapFocus([], shiftTab)).toEqual(toContainer)
  })

  it('passes every key that is not Tab, with or without nodes', () => {
    for (const key of ['Enter', ' ', 'Escape', 'ArrowDown', 'ArrowUp', 'Home', 'a', 'tab', '']) {
      expect(trapFocus(nodes(3, 2), { key, shiftKey: false })).toEqual(pass)
      expect(trapFocus(nodes(3, 0), { key, shiftKey: true })).toEqual(pass)
      expect(trapFocus([], { key, shiftKey: false })).toEqual(pass)
    }
  })
})

describe('TABBABLE_SELECTOR', () => {
  it('is the agreed candidate list, narrowed afterwards by isTabbable', () => {
    expect(TABBABLE_SELECTOR).toBe(
      'a[href], area[href], button, input, select, textarea, summary, [contenteditable=""], [contenteditable="true"], [tabindex]',
    )
  })
})

const cand = (over: Partial<TabCandidate> = {}): TabCandidate => ({
  tag: 'div',
  disabled: false,
  tabIndex: null,
  hidden: false,
  inert: false,
  ...over,
})

describe('isTabbable', () => {
  it('takes the native controls without a tabindex', () => {
    expect(isTabbable(cand({ tag: 'button' }))).toBe(true)
    expect(isTabbable(cand({ tag: 'select' }))).toBe(true)
    expect(isTabbable(cand({ tag: 'textarea' }))).toBe(true)
    expect(isTabbable(cand({ tag: 'input', type: 'text' }))).toBe(true)
    expect(isTabbable(cand({ tag: 'input' }))).toBe(true)
    expect(isTabbable(cand({ tag: 'summary' }))).toBe(true)
  })

  it('drops a disabled control, a hidden one, and one inside an inert subtree', () => {
    expect(isTabbable(cand({ tag: 'button', disabled: true }))).toBe(false)
    expect(isTabbable(cand({ tag: 'input', disabled: true }))).toBe(false)
    expect(isTabbable(cand({ tag: 'button', hidden: true }))).toBe(false)
    expect(isTabbable(cand({ tag: 'button', inert: true }))).toBe(false)
    expect(isTabbable(cand({ tag: 'div', tabIndex: 0, hidden: true }))).toBe(false)
    expect(isTabbable(cand({ tag: 'div', tabIndex: 0, inert: true }))).toBe(false)
    expect(isTabbable(cand({ tag: 'a', hasHref: true, disabled: true }))).toBe(false)
  })

  it('drops anything with a negative tabindex, native or not', () => {
    expect(isTabbable(cand({ tag: 'button', tabIndex: -1 }))).toBe(false)
    expect(isTabbable(cand({ tag: 'div', tabIndex: -1 }))).toBe(false)
    expect(isTabbable(cand({ tag: 'a', hasHref: true, tabIndex: -1 }))).toBe(false)
    expect(isTabbable(cand({ tag: 'div', editable: true, tabIndex: -1 }))).toBe(false)
  })

  it('takes a plain element only when tabindex is zero or more', () => {
    expect(isTabbable(cand({ tag: 'div' }))).toBe(false)
    expect(isTabbable(cand({ tag: 'span', tabIndex: null }))).toBe(false)
    expect(isTabbable(cand({ tag: 'div', tabIndex: 0 }))).toBe(true)
    expect(isTabbable(cand({ tag: 'div', tabIndex: 3 }))).toBe(true)
    expect(isTabbable(cand({ tag: 'button', tabIndex: 0 }))).toBe(true)
  })

  it('drops a hidden input even with a tabindex', () => {
    expect(isTabbable(cand({ tag: 'input', type: 'hidden' }))).toBe(false)
    expect(isTabbable(cand({ tag: 'input', type: 'hidden', tabIndex: 0 }))).toBe(false)
    expect(isTabbable(cand({ tag: 'input', type: 'checkbox' }))).toBe(true)
  })

  it('takes an anchor or area with an href, and without one only through a tabindex', () => {
    expect(isTabbable(cand({ tag: 'a', hasHref: true }))).toBe(true)
    expect(isTabbable(cand({ tag: 'area', hasHref: true }))).toBe(true)
    expect(isTabbable(cand({ tag: 'a', hasHref: false }))).toBe(false)
    expect(isTabbable(cand({ tag: 'a' }))).toBe(false)
    expect(isTabbable(cand({ tag: 'area', hasHref: false }))).toBe(false)
    expect(isTabbable(cand({ tag: 'a', hasHref: false, tabIndex: 0 }))).toBe(true)
  })

  it('takes an editable element', () => {
    expect(isTabbable(cand({ tag: 'div', editable: true }))).toBe(true)
    expect(isTabbable(cand({ tag: 'div', editable: false }))).toBe(false)
    expect(isTabbable(cand({ tag: 'div', editable: true, hidden: true }))).toBe(false)
  })
})

interface N {
  readonly id: string
  readonly kids: N[]
  parent: N | null
  exempt?: boolean
}
function node(id: string, kids: N[] = [], exempt = false): N {
  const n: N = { id, kids, parent: null, exempt }
  for (const k of kids) k.parent = n
  return n
}
const tree: TreeAccess<N> = {
  parentOf: (n) => n.parent,
  childrenOf: (n) => n.kids,
  exempt: (n) => n.exempt === true,
}
const ids = (list: readonly N[]): string[] => list.map((n) => n.id)

describe('isolationTargets', () => {
  it('returns the siblings along the path, nearest first, and never the ancestors or the root', () => {
    // root > app > game > backdrop > dialog; every level has siblings of its own.
    const dialog = node('dialog', [node('dialog-kid')])
    const backdrop = node('backdrop', [node('b-left'), dialog, node('b-right')])
    const game = node('game', [node('content'), backdrop, node('bar')])
    const app = node('app', [game, node('banner-ish')])
    const root = node('root', [node('splash'), app])
    expect(ids(isolationTargets(dialog, root, tree))).toEqual(['b-left', 'b-right', 'content', 'bar', 'banner-ish', 'splash'])
    const out = isolationTargets(dialog, root, tree)
    for (const n of [dialog, backdrop, game, app, root]) expect(out).not.toContain(n)
  })

  it('skips a sibling that is exempt, and still walks past it', () => {
    const dialog = node('dialog')
    const backdrop = node('backdrop', [dialog])
    const game = node('game', [node('content'), backdrop])
    const toast = node('toast', [node('toast-text')], true)
    const app = node('app', [toast, game])
    const root = node('root', [app])
    expect(ids(isolationTargets(dialog, root, tree))).toEqual(['content'])
  })

  it('handles a dialog directly under the root', () => {
    const dialog = node('dialog')
    const root = node('root', [node('page'), dialog, node('footer', [], true), node('aside')])
    expect(ids(isolationTargets(dialog, root, tree))).toEqual(['page', 'aside'])
  })

  it('answers nothing for a dialog that is the root, or alone under it', () => {
    const lone = node('lone')
    const root = node('root', [lone])
    expect(isolationTargets(lone, root, tree)).toEqual([])
    expect(isolationTargets(root, root, tree)).toEqual([])
  })

  it('isolates what it can for a dialog outside the root', () => {
    // body > [root, other > dialog]; the root is not on the dialog's path.
    const dialog = node('dialog')
    const other = node('other', [node('other-sibling'), dialog])
    const root = node('root', [node('page')])
    const body = node('body', [root, other])
    node('html', [node('head'), body])
    const out = ids(isolationTargets(dialog, root, tree))
    expect(out).toEqual(['other-sibling', 'root', 'head'])
    expect(out).not.toContain('page')
  })

  it('stops at a dialog with no parent at all', () => {
    const orphan = node('orphan')
    const root = node('root', [node('page')])
    expect(isolationTargets(orphan, root, tree)).toEqual([])
  })
})

describe('restoreTarget', () => {
  const usable = (e: string): boolean => e.startsWith('ok')

  it('picks the first candidate that is usable', () => {
    expect(restoreTarget(['bad-1', 'ok-2', 'ok-3'], usable)).toBe('ok-2')
    expect(restoreTarget(['ok-1', 'ok-2'], usable)).toBe('ok-1')
  })

  it('skips null candidates', () => {
    expect(restoreTarget([null, 'ok-2'], usable)).toBe('ok-2')
    expect(restoreTarget([null, null, 'bad', 'ok-4'], usable)).toBe('ok-4')
  })

  it('answers null when nothing is usable', () => {
    expect(restoreTarget([], usable)).toBeNull()
    expect(restoreTarget([null, null], usable)).toBeNull()
    expect(restoreTarget(['bad-1', null, 'bad-2'], usable)).toBeNull()
  })

  it('does not ask usable about null', () => {
    const seen: string[] = []
    restoreTarget([null, 'a', null, 'b'], (e) => {
      seen.push(e)
      return false
    })
    expect(seen).toEqual(['a', 'b'])
  })
})
