// R1-N5: breadcrumbs, popTo and the runner hooks. crumbsOf and Breadcrumbs (src/ui/nav/Breadcrumbs.tsx) are pure and render
// to static markup; the path helpers in menuModel.ts are what useMenuNav.push, popTo and openPath are built from; Sheet
// takes a subheader; MenuSheet and PersonSheet show the strip behind FLAGS.navRegroup and write recents and pins behind
// FLAGS.navPalette. With both flags off the markup is the v4.0.2 markup.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetFlags, setFlags } from '../src/game/flags'
import { activitiesMenu, assetsMenu } from '../src/game/menus'
import type { GameState, MenuAction, MenuGroup } from '../src/game/types'
import type { MenuNav, MenuRunner, MenuRunnerOptions } from '../src/ui/components/MenuList'
import { pathAfterOpen, pathAfterPopTo, pathAfterPush } from '../src/ui/components/menuModel'
import { Breadcrumbs, crumbsOf, type Crumb } from '../src/ui/nav/Breadcrumbs'
import { isPinned, lifeOf, resetPrefsForTest, togglePin, updatePrefs, usePrefs, type UiPrefs } from '../src/ui/nav/prefs'
import { Sheet } from '../src/ui/components/Sheet'
import { NAV_OFF } from './nav-kit'

// Built-in tasks resolve to nothing here (the pattern of test/ui-return.test.ts), so only what a test queues shows up.
const offline = vi.hoisted(() => {
  const resolve = vi.fn()
  return { applyFallback: resolve, resolveTask: resolve, MAX_CUSTOM_ACTIONS_PER_YEAR: 5, CUSTOM_ACTION_KEY: 'doAnything' }
})
vi.mock('../src/game/offline', () => offline)

const store = await import('../src/ui/store')
const menuList = await import('../src/ui/components/MenuList')
const sheetModule = await import('../src/ui/components/Sheet')
const { MenuSheet } = await import('../src/ui/components/MenuSheet')
const { PersonSheet, personName, safeActions } = await import('../src/ui/components/PersonSheet')
const { rememberSpot } = await import('../src/ui/screens/GameScreen')
const { createPerson } = await import('../src/game/people')

const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el)

function game(): GameState {
  return store.getApp().game as GameState
}

function prefsNow(): UiPrefs {
  let seen: UiPrefs | null = null
  const Probe = () => {
    seen = usePrefs()
    return null
  }
  render(createElement(Probe))
  return seen as unknown as UiPrefs
}

beforeEach(() => {
  setFlags(NAV_OFF)
  resetPrefsForTest()
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
  resetPrefsForTest()
  vi.restoreAllMocks()
})

const COMPUTER = { path: ['computer'], scrolls: [0, 0] }

describe('9. crumbsOf', () => {
  it('gives the root and one crumb per group, depths 0 to 2, only the last current', () => {
    const crumbs = crumbsOf('Activities', [{ label: 'Computer' }, { label: 'Ventures' }])
    expect(crumbs).toEqual([
      { label: 'Activities', depth: 0, current: false },
      { label: 'Computer', depth: 1, current: false },
      { label: 'Ventures', depth: 2, current: true },
    ])
  })

  it('puts the lead labels in front, and counts depth across them', () => {
    const crumbs = crumbsOf('Alex', [{ label: 'Spend Time' }], ['Relationships'])
    expect(crumbs.map((c) => c.label)).toEqual(['Relationships', 'Alex', 'Spend Time'])
    expect(crumbs.map((c) => c.depth)).toEqual([0, 1, 2])
    expect(crumbs.map((c) => c.current)).toEqual([false, false, true])
    const two = crumbsOf('Activities', [{ label: 'Computer' }], ['Relationships', 'Alex'])
    expect(two.map((c) => c.label).slice(0, 2)).toEqual(['Relationships', 'Alex'])
  })

  it('with no trail the root is the only crumb, and it is current', () => {
    expect(crumbsOf('Activities', [])).toEqual([{ label: 'Activities', depth: 0, current: true }])
  })

  it('does not change what it is given', () => {
    const trail = Object.freeze([Object.freeze({ label: 'Computer' })])
    const lead = Object.freeze(['Relationships'])
    expect(() => crumbsOf('Alex', trail, lead)).not.toThrow()
  })
})

describe('10. Breadcrumbs markup', () => {
  const crumbs: Crumb[] = crumbsOf('Activities', [{ label: 'Computer' }, { label: 'Ventures' }])

  it('is a labelled nav with an ordered list, buttons for the ones before and a span for the current one', () => {
    const html = render(createElement(Breadcrumbs, { crumbs, onGo: () => {} }))
    expect(html).toMatch(/<nav[^>]*aria-label="Breadcrumb"/)
    expect(html).toContain('<ol')
    expect(html).toContain('aria-label="Go to Activities"')
    expect(html).toContain('aria-label="Go to Computer"')
    expect(html).not.toContain('aria-label="Go to Ventures"')
    expect(html).toMatch(/<span[^>]*aria-current="page"[^>]*>Ventures<\/span>/)
    expect(html.match(/<button/g)).toHaveLength(2)
    expect(html.match(/<li/g)).toHaveLength(3)
    expect(html).toContain('type="button"')
    expect(html).not.toContain('aria-pressed')
  })

  it('has no button for the current crumb, and no pin star unless asked', () => {
    const html = render(createElement(Breadcrumbs, { crumbs, onGo: () => {} }))
    expect(html).not.toContain('crumbs-pin')
  })

  it('renders nothing for one crumb, or none', () => {
    expect(render(createElement(Breadcrumbs, { crumbs: crumbsOf('Activities', []), onGo: () => {} }))).toBe('')
    expect(render(createElement(Breadcrumbs, { crumbs: [], onGo: () => {} }))).toBe('')
  })

  it('escapes the labels', () => {
    const html = render(createElement(Breadcrumbs, { crumbs: crumbsOf('A & B', [{ label: '<b>Hi</b>' }]), onGo: () => {} }))
    expect(html).toContain('Go to A &amp; B')
    expect(html).toContain('&lt;b&gt;Hi&lt;/b&gt;')
    expect(html).not.toContain('<b>')
  })

  it('has a button handler on each earlier crumb that calls onGo with that depth', () => {
    const calls: number[] = []
    const el = Breadcrumbs({ crumbs, onGo: (d) => calls.push(d) }) as ReactElement
    const buttons: ReactElement<{ onClick: () => void; 'aria-label': string }>[] = []
    const walk = (node: ReactNode): void => {
      if (Array.isArray(node)) return node.forEach(walk)
      if (typeof node !== 'object' || node === null) return
      const e = node as ReactElement<{ children?: ReactNode; onClick?: () => void; 'aria-label'?: string }>
      if (e.type === 'button') buttons.push(e as ReactElement<{ onClick: () => void; 'aria-label': string }>)
      walk(e.props.children)
    }
    walk(el)
    expect(buttons.map((b) => b.props['aria-label'])).toEqual(['Go to Activities', 'Go to Computer'])
    for (const b of buttons) b.props.onClick()
    expect(calls).toEqual([0, 1])
  })
})

describe('11. the pin star', () => {
  const crumbs = crumbsOf('Activities', [{ label: 'Computer' }, { label: 'Ventures' }])

  it('is pressed when pinned, and keeps its name: a toggle that says Unpin and is pressed reads as double', () => {
    const html = render(createElement(Breadcrumbs, { crumbs, onGo: () => {}, pin: { pinned: true, label: 'Ventures', onToggle: () => {} } }))
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>/)
    expect(html).toContain('aria-label="Pin Ventures"')
    expect(html).not.toContain('Unpin')
  })

  it('is not pressed and says Pin when not pinned', () => {
    const html = render(createElement(Breadcrumbs, { crumbs, onGo: () => {}, pin: { pinned: false, label: 'Ventures', onToggle: () => {} } }))
    expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*>/)
    expect(html).toContain('aria-label="Pin Ventures"')
  })

  it('shows no star for a single crumb, even with a pin', () => {
    const html = render(createElement(Breadcrumbs, { crumbs: crumbsOf('Activities', []), onGo: () => {}, pin: { pinned: false, label: 'Activities', onToggle: () => {} } }))
    expect(html).toBe('')
  })

  it('calls onToggle from the star', () => {
    const onToggle = vi.fn()
    const el = Breadcrumbs({ crumbs, onGo: () => {}, pin: { pinned: false, label: 'Ventures', onToggle } }) as ReactElement
    const stars: ReactElement<{ onClick: () => void }>[] = []
    const walk = (node: ReactNode): void => {
      if (Array.isArray(node)) return node.forEach(walk)
      if (typeof node !== 'object' || node === null) return
      const e = node as ReactElement<{ children?: ReactNode; onClick?: () => void; 'aria-pressed'?: boolean }>
      if (e.type === 'button' && e.props['aria-pressed'] !== undefined) stars.push(e as ReactElement<{ onClick: () => void }>)
      walk(e.props.children)
    }
    walk(el)
    expect(stars).toHaveLength(1)
    stars[0]!.props.onClick()
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})

describe('12. the path helpers', () => {
  it('pathAfterPush keeps the levels above the list and adds the group', () => {
    expect(pathAfterPush([], 0, 'a')).toEqual(['a'])
    expect(pathAfterPush(['a'], 1, 'b')).toEqual(['a', 'b'])
    // A stale tail (the path is longer than the trail that still resolves) is cut at the depth.
    expect(pathAfterPush(['a', 'gone', 'gone2'], 1, 'c')).toEqual(['a', 'c'])
  })

  it('pathAfterPopTo keeps the first n ids', () => {
    expect(pathAfterPopTo(['a', 'b', 'c'], 3, 0)).toEqual([])
    expect(pathAfterPopTo(['a', 'b', 'c'], 3, 1)).toEqual(['a'])
    expect(pathAfterPopTo(['a', 'b', 'c'], 3, 2)).toEqual(['a', 'b'])
    // Same as going back one level.
    expect(pathAfterPopTo(['a', 'b', 'c'], 3, 2)).toEqual(['a', 'b', 'c'].slice(0, 2))
    // A stale tail is cut with the rest.
    expect(pathAfterPopTo(['a', 'b', 'gone'], 2, 1)).toEqual(['a'])
  })

  it('pathAfterPopTo returns the input path itself when n is out of range', () => {
    const path = ['a', 'b']
    for (const n of [2, 3, 99, -1, 0.5, Number.NaN, Infinity, -Infinity]) expect(pathAfterPopTo(path, 2, n)).toBe(path)
    const root: string[] = []
    expect(pathAfterPopTo(root, 0, 0)).toBe(root)
  })

  it('pathAfterOpen drops what is not a non-empty string and keeps at most 12', () => {
    expect(pathAfterOpen(['a', 'b'])).toEqual(['a', 'b'])
    expect(pathAfterOpen([])).toEqual([])
    expect(pathAfterOpen(['a', '', 'b', 7, null, undefined, {}, ['x'], 'c'] as unknown as string[])).toEqual(['a', 'b', 'c'])
    const long = Array.from({ length: 20 }, (_, i) => `g${i}`)
    expect(pathAfterOpen(long)).toEqual(long.slice(0, 12))
    expect(pathAfterOpen('not an array' as unknown as string[])).toEqual([])
    expect(pathAfterOpen(null as unknown as string[])).toEqual([])
  })

  it('returns new arrays and does not change its input', () => {
    const ids = Object.freeze(['a', 'b'])
    const out = pathAfterOpen(ids)
    expect(out).not.toBe(ids)
    const path = Object.freeze(['a', 'b', 'c']) as unknown as string[]
    expect(() => pathAfterPush(path, 1, 'x')).not.toThrow()
    expect(() => pathAfterPopTo(path, 3, 1)).not.toThrow()
  })
})

describe('useMenuNav', () => {
  it('has popTo and openPath beside push and pop, and they are safe to call before anything is mounted', () => {
    let nav: MenuNav | null = null
    const Probe = () => {
      nav = menuList.useMenuNav((path) => (path.length ? [activitiesMenu] : []), { path: ['activities'], scrolls: [0, 0] })
      return null
    }
    render(createElement(Probe))
    expect(typeof nav!.popTo).toBe('function')
    expect(typeof nav!.openPath).toBe('function')
    expect(() => nav!.popTo(0)).not.toThrow()
    expect(() => nav!.popTo(5)).not.toThrow()
    expect(() => nav!.openPath(['computer', 'ventures'])).not.toThrow()
    expect(() => nav!.openPath([])).not.toThrow()
  })
})

describe('13. MenuSheet with the real store', () => {
  const sheet = (initial: { path: string[]; scrolls: number[] } | null = COMPUTER) =>
    render(createElement(MenuSheet, { root: activitiesMenu, onClose: () => {}, initial }))

  it('shows the strip under the header at depth 1 with the flag on', () => {
    setFlags({ ...NAV_OFF, navRegroup: true })
    const html = sheet()
    expect(html).toMatch(/<nav[^>]*aria-label="Breadcrumb"/)
    expect(html).toContain('aria-label="Go to Activities"')
    expect(html).toMatch(/<span[^>]*aria-current="page"[^>]*>Computer<\/span>/)
    expect(html.indexOf('</header>')).toBeLessThan(html.indexOf('Breadcrumb'))
    expect(html.indexOf('Breadcrumb')).toBeLessThan(html.indexOf('sheet-body'))
  })

  it('shows no strip with the flag off', () => {
    expect(sheet()).not.toContain('Breadcrumb')
  })

  it('shows no strip at the root, where there is only one crumb', () => {
    setFlags({ ...NAV_OFF, navRegroup: true })
    expect(sheet(null)).not.toContain('Breadcrumb')
  })

  it('shows a longer trail as it is, root first', () => {
    setFlags({ ...NAV_OFF, navRegroup: true })
    const computer = activitiesMenu.children(game()).find((n): n is MenuGroup => n.type === 'menu' && n.id === 'computer')!
    const inner = menuList.groupChildren(computer, game()).find((n): n is MenuGroup => n.type === 'menu')
    if (!inner) throw new Error('the computer menu has no group to open')
    const html = sheet({ path: ['computer', inner.id], scrolls: [0, 0, 0] })
    const labels = [...html.matchAll(/aria-label="Go to ([^"]+)"/g)].map((m) => m[1])
    expect(labels).toHaveLength(2)
    expect(labels[0]).toBe('Activities')
    expect(html).toMatch(/<span[^>]*aria-current="page"[^>]*>/)
    expect(html.match(/<li/g)).toHaveLength(3)
  })

  it('shows the pin star only with navPalette as well', () => {
    setFlags({ ...NAV_OFF, navRegroup: true })
    expect(sheet()).not.toContain('aria-pressed')
    setFlags({ ...NAV_OFF, navRegroup: true, navPalette: true })
    const html = sheet()
    expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*>/)
    expect(html).toContain('aria-label="Pin Computer"')
  })

  it('shows the star pressed once the place is pinned for this life', () => {
    setFlags({ ...NAV_OFF, navRegroup: true, navPalette: true })
    updatePrefs((p) => togglePin(p, game().lifeId, { tab: 'activities', path: ['computer'] }).prefs)
    const html = sheet()
    expect(html).toContain('aria-label="Pin Computer"')
    expect(html).not.toContain('Unpin')
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>/)
  })

  it('does not show a pin made for another life', () => {
    setFlags({ ...NAV_OFF, navRegroup: true, navPalette: true })
    updatePrefs((p) => togglePin(p, 'some-other-life', { tab: 'activities', path: ['computer'] }).prefs)
    expect(sheet()).toContain('aria-label="Pin Computer"')
    expect(sheet()).toMatch(/<button[^>]*aria-pressed="false"[^>]*>/)
  })

  it('shows no star with navPalette alone (the star lives in the strip)', () => {
    setFlags({ ...NAV_OFF, navPalette: true })
    const html = sheet()
    expect(html).not.toContain('aria-pressed')
    expect(html).not.toContain('Breadcrumb')
  })
})

describe('14. Sheet subheader', () => {
  it('renders the subheader after the header and before the body', () => {
    const html = render(createElement(Sheet, { title: 'T', onClose: () => {}, subheader: createElement('i', { id: 'sub' }), children: createElement('p', null, 'body text') }))
    const header = html.indexOf('</header>')
    const sub = html.indexOf('<i id="sub">')
    const body = html.indexOf('class="sheet-body"')
    expect(header).toBeGreaterThan(-1)
    expect(sub).toBeGreaterThan(header)
    expect(body).toBeGreaterThan(sub)
    expect(html.indexOf('body text')).toBeGreaterThan(body)
  })

  it('without a subheader the header is followed directly by the body, as in v4.0.2', () => {
    const html = render(createElement(Sheet, { title: 'T', onClose: () => {}, children: createElement('p', null, 'x') }))
    expect(html).toContain('</header><div class="sheet-body">')
  })

  it('a footer still comes after the body', () => {
    const html = render(createElement(Sheet, { title: 'T', onClose: () => {}, subheader: createElement('i', { id: 'sub' }), footer: createElement('b', null, 'foot'), children: 'x' }))
    expect(html.indexOf('<i id="sub">')).toBeLessThan(html.indexOf('sheet-body'))
    expect(html.indexOf('sheet-body')).toBeLessThan(html.indexOf('sheet-footer'))
  })
})

describe('15. the runner hooks', () => {
  function capture(opts: MenuRunnerOptions): MenuRunner {
    let runner: MenuRunner | null = null
    const Probe = () => {
      runner = menuList.useMenuRunner(opts)
      return null
    }
    render(createElement(Probe))
    return runner as unknown as MenuRunner
  }

  function setup(extra: Partial<MenuRunnerOptions> = {}) {
    const calls: string[] = []
    const opts: MenuRunnerOptions = {
      onOpenGroup: () => calls.push('open'),
      onClose: () => calls.push('close'),
      onLeave: () => calls.push('leave'),
      onRan: (a) => calls.push(`ran:${a.id}`),
      ...extra,
    }
    const action = (id: string, over: Partial<MenuAction> = {}): MenuAction => ({
      type: 'action',
      id,
      label: id,
      emoji: 'E',
      run: () => void calls.push(`run:${id}`),
      ...over,
    })
    return { calls, runner: capture(opts), action }
  }

  it('submit runs a plain action: onRan, onLeave, then the action, then onClose, once each', () => {
    const { calls, runner, action } = setup()
    runner.submit(action('plain'), 'text')
    expect(calls).toEqual(['ran:plain', 'leave', 'run:plain', 'close'])
  })

  it('submit hands the ready input to the action and skips the input dialog', () => {
    const seen: (string | undefined)[] = []
    const { calls, runner, action } = setup()
    runner.submit(action('named', { input: { kind: 'text', label: 'Name' }, run: (_g, input) => void seen.push(input) }), 'Ada')
    expect(seen).toEqual(['Ada'])
    expect(calls).toEqual(['ran:named', 'leave', 'close'])
  })

  it('stops at the confirm step for an action with confirm: no onRan, nothing ran', () => {
    const { calls, runner, action } = setup()
    runner.submit(action('sure', { confirm: () => 'Are you sure?' }), 'text')
    expect(calls).toEqual([])
  })

  it('a stayOpen action calls onRan and runs, but does not call onLeave or onClose', () => {
    const { calls, runner, action } = setup()
    runner.submit(action('stay', { stayOpen: true }), '')
    expect(calls).toEqual(['ran:stay', 'run:stay'])
  })

  it('tap also calls onRan, for a plain action and for a stayOpen one', () => {
    const { calls, runner, action } = setup()
    runner.tap(action('plain'))
    runner.tap(action('stay', { stayOpen: true }))
    expect(calls).toEqual(['ran:plain', 'leave', 'run:plain', 'close', 'ran:stay', 'run:stay'])
  })

  it('tap on a group opens it and does not call onRan', () => {
    const { calls, runner } = setup()
    const group: MenuGroup = { type: 'menu', id: 'g', label: 'G', emoji: 'E', children: () => [] }
    runner.tap(group)
    expect(calls).toEqual(['open'])
  })

  it('is optional: no onRan, no error', () => {
    const calls: string[] = []
    const runner = capture({ onOpenGroup: () => {}, onClose: () => calls.push('close') })
    runner.submit({ type: 'action', id: 'a', label: 'A', emoji: 'E', run: () => void calls.push('run') }, '')
    expect(calls).toEqual(['run', 'close'])
  })

  it('an onRan that throws is reported and the action still runs', () => {
    const { calls, runner, action } = setup({
      onRan: () => {
        throw new Error('prefs broke')
      },
    })
    runner.submit(action('plain'), '')
    expect(calls).toEqual(['leave', 'run:plain', 'close'])
    expect(console.error).toHaveBeenCalled()
  })

  it('does nothing when there is no life on screen', () => {
    const { calls, runner, action } = setup()
    store.abandonLife()
    runner.submit(action('plain'), '')
    expect(calls).toEqual([])
  })
})

describe('16. flags off', () => {
  const sheet = (root: MenuGroup = activitiesMenu, initial = COMPUTER) =>
    render(createElement(MenuSheet, { root, onClose: () => {}, initial }))

  it('the markup at depth 1 has no subheader: the header is followed directly by the body', () => {
    const html = sheet()
    expect(html).toContain('</header><div class="sheet-body">')
    expect(html).not.toContain('crumbs')
  })

  it('navRegroup adds the strip and nothing else, so the flag-off markup is the v4.0.2 markup', () => {
    const off = sheet()
    setFlags({ ...NAV_OFF, navRegroup: true })
    const on = sheet()
    expect(on).not.toBe(off)
    const strip = /<div class="crumbs">.*?<\/div>/.exec(on)
    expect(strip).not.toBeNull()
    expect(on.replace(strip![0], '')).toBe(off)
  })

  it('navPalette alone changes no markup', () => {
    const off = sheet()
    setFlags({ ...NAV_OFF, navPalette: true })
    expect(sheet()).toBe(off)
  })
})

describe('recents written by the sheets (behind navPalette)', () => {
  /** Render a sheet component and give back the options its useMenuRunner call got, so the test can play a tap. */
  function optionsOf(el: ReactElement): MenuRunnerOptions {
    const real = menuList.useMenuRunner
    let opts: MenuRunnerOptions | null = null
    const spy = vi.spyOn(menuList, 'useMenuRunner').mockImplementation((o) => {
      opts = o
      return real(o)
    })
    try {
      render(el)
    } finally {
      spy.mockRestore()
    }
    if (!opts) throw new Error('the sheet did not call useMenuRunner')
    return opts
  }

  const plain = (id: string): MenuAction => ({ type: 'action', id, label: id, emoji: 'E', run: () => {} })

  it('MenuSheet: the tab is the root id and the path is the open groups', () => {
    setFlags({ ...NAV_OFF, navPalette: true })
    const o = optionsOf(createElement(MenuSheet, { root: activitiesMenu, onClose: () => {}, initial: COMPUTER }))
    o.onRan?.(plain('somethingCool'))
    expect(lifeOf(prefsNow(), game().lifeId).recents).toEqual([{ tab: 'activities', path: ['computer'], id: 'somethingCool' }])
  })

  it('MenuSheet: nothing is written with navPalette off', () => {
    const o = optionsOf(createElement(MenuSheet, { root: activitiesMenu, onClose: () => {}, initial: COMPUTER }))
    o.onRan?.(plain('somethingCool'))
    expect(lifeOf(prefsNow(), game().lifeId).recents).toEqual([])
  })

  it('MenuSheet: a root that is not one of the four tabs writes nothing', () => {
    setFlags({ ...NAV_OFF, navPalette: true })
    const stray: MenuGroup = { type: 'menu', id: 'hub.company', label: 'X', emoji: 'E', children: () => [] }
    const o = optionsOf(createElement(MenuSheet, { root: stray, onClose: () => {} }))
    o.onRan?.(plain('a'))
    expect(lifeOf(prefsNow(), game().lifeId).recents).toEqual([])
  })

  it('MenuSheet: the assets root is the assets tab', () => {
    setFlags({ ...NAV_OFF, navPalette: true })
    const o = optionsOf(createElement(MenuSheet, { root: assetsMenu, onClose: () => {} }))
    o.onRan?.(plain('buy'))
    expect(lifeOf(prefsNow(), game().lifeId).recents).toEqual([{ tab: 'assets', path: [], id: 'buy' }])
  })

  it('PersonSheet: the tab is relationships and the path starts with person.<id>', () => {
    setFlags({ ...NAV_OFF, navPalette: true })
    let personId = ''
    store.act((g) => {
      personId = createPerson(g, { relation: 'friend', age: 25, firstName: 'Priya', lastName: 'Nair' }).id
    })
    const o = optionsOf(createElement(PersonSheet, { personId, onClose: () => {}, onBack: () => {} }))
    o.onRan?.(plain('hangOut'))
    expect(lifeOf(prefsNow(), game().lifeId).recents).toEqual([{ tab: 'relationships', path: [`person.${personId}`], id: 'hangOut' }])
  })
})

describe('GameScreen.rememberSpot: the chip and the recents', () => {
  const spot = { path: ['computer'], scrolls: [0, 120] }

  it('stores the spot for the "Back to" chip exactly as before, and writes no recent with navPalette off', () => {
    rememberSpot(game(), 'activities', spot)
    expect(store.getApp().returnPoint).toMatchObject({ sheet: 'activities', path: ['computer'], scrolls: [0, 120] })
    expect(lifeOf(prefsNow(), game().lifeId).recents).toEqual([])
  })

  it('also makes the same place the newest recent with navPalette on', () => {
    setFlags({ ...NAV_OFF, navPalette: true })
    rememberSpot(game(), 'activities', spot)
    expect(store.getApp().returnPoint).toMatchObject({ sheet: 'activities', path: ['computer'] })
    expect(lifeOf(prefsNow(), game().lifeId).recents).toEqual([{ tab: 'activities', path: ['computer'] }])
    // A second spot comes in front.
    rememberSpot(game(), 'assets', { path: ['houses'], scrolls: [0, 0] })
    expect(lifeOf(prefsNow(), game().lifeId).recents).toEqual([
      { tab: 'assets', path: ['houses'] },
      { tab: 'activities', path: ['computer'] },
    ])
  })

  it('keeps the recent when the chip goes away', () => {
    setFlags({ ...NAV_OFF, navPalette: true })
    rememberSpot(game(), 'activities', spot)
    store.clearReturnPoint()
    expect(store.getApp().returnPoint).toBeNull()
    expect(lifeOf(prefsNow(), game().lifeId).recents).toHaveLength(1)
  })

  it('writes nothing into the game state', () => {
    setFlags({ ...NAV_OFF, navPalette: true })
    const before = JSON.stringify(game())
    rememberSpot(game(), 'activities', spot)
    expect(JSON.stringify(game())).toBe(before)
  })
})

describe('PersonSheet breadcrumbs', () => {
  function personWithGroup(): { id: string; group: MenuGroup } {
    let id = ''
    store.act((g) => {
      id = createPerson(g, { relation: 'friend', age: 25, firstName: 'Priya', lastName: 'Nair' }).id
    })
    const person = game().people.find((p) => p.id === id)!
    const group = safeActions(game(), person).find((n): n is MenuGroup => n.type === 'menu')
    if (!group) throw new Error('a friend has no group of actions to open')
    return { id, group }
  }

  it('shows Relationships, the name and the group inside a group, with the flag on', () => {
    setFlags({ ...NAV_OFF, navRegroup: true })
    const { id, group } = personWithGroup()
    const name = personName(game().people.find((p) => p.id === id)!)
    const html = render(createElement(PersonSheet, { personId: id, onClose: () => {}, onBack: () => {}, initial: { path: [group.id], scrolls: [0, 0] } }))
    expect(html).toContain('aria-label="Go to Relationships"')
    expect(html).toContain(`aria-label="Go to ${name}"`)
    expect(html).toMatch(new RegExp(`<span[^>]*aria-current="page"[^>]*>${group.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</span>`))
  })

  it('shows no strip on the person page itself, or with the flag off', () => {
    const { id, group } = personWithGroup()
    setFlags({ ...NAV_OFF, navRegroup: true })
    expect(render(createElement(PersonSheet, { personId: id, onClose: () => {}, onBack: () => {} }))).not.toContain('Breadcrumb')
    setFlags(NAV_OFF)
    expect(render(createElement(PersonSheet, { personId: id, onClose: () => {}, onBack: () => {}, initial: { path: [group.id], scrolls: [0, 0] } }))).not.toContain('Breadcrumb')
  })

  it('crumb 0 goes back to the list, crumb 1 to the person, deeper ones one level less than their depth', () => {
    setFlags({ ...NAV_OFF, navRegroup: true })
    const { id, group } = personWithGroup()
    const onBack = vi.fn()
    const realNav = menuList.useMenuNav
    const popTo = vi.fn()
    const navSpy = vi.spyOn(menuList, 'useMenuNav').mockImplementation((resolve, initial) => {
      const nav = realNav(resolve, initial)
      nav.popTo = popTo
      return nav
    })
    const realSheet = sheetModule.Sheet
    let subheader: ReactNode = null
    const sheetSpy = vi.spyOn(sheetModule, 'Sheet').mockImplementation((p) => {
      subheader = p.subheader
      return realSheet(p)
    })
    try {
      render(createElement(PersonSheet, { personId: id, onClose: () => {}, onBack, initial: { path: [group.id], scrolls: [0, 0] } }))
    } finally {
      navSpy.mockRestore()
      sheetSpy.mockRestore()
    }
    const strip = subheader as unknown as ReactElement<{ crumbs: Crumb[]; onGo: (d: number) => void }>
    expect(strip).not.toBeNull()
    expect(strip.props.crumbs.map((c) => c.depth)).toEqual([0, 1, 2])
    strip.props.onGo(0)
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(popTo).not.toHaveBeenCalled()
    strip.props.onGo(1)
    expect(popTo).toHaveBeenLastCalledWith(0)
    strip.props.onGo(2)
    expect(popTo).toHaveBeenLastCalledWith(1)
    strip.props.onGo(3)
    expect(popTo).toHaveBeenLastCalledWith(2)
  })
})

describe('MenuSheet crumbs call popTo', () => {
  it('onGo(d) is nav.popTo(d); the star toggles the place and toasts when 12 are pinned', () => {
    setFlags({ ...NAV_OFF, navRegroup: true, navPalette: true })
    const realNav = menuList.useMenuNav
    const popTo = vi.fn()
    const navSpy = vi.spyOn(menuList, 'useMenuNav').mockImplementation((resolve, initial) => {
      const nav = realNav(resolve, initial)
      nav.popTo = popTo
      return nav
    })
    const realSheet = sheetModule.Sheet
    let subheader: ReactNode = null
    const sheetSpy = vi.spyOn(sheetModule, 'Sheet').mockImplementation((p) => {
      subheader = p.subheader
      return realSheet(p)
    })
    try {
      render(createElement(MenuSheet, { root: activitiesMenu, onClose: () => {}, initial: COMPUTER }))
    } finally {
      navSpy.mockRestore()
      sheetSpy.mockRestore()
    }
    const strip = subheader as unknown as ReactElement<{ crumbs: Crumb[]; onGo: (d: number) => void; pin?: { pinned: boolean; label: string; onToggle: () => void } }>
    strip.props.onGo(0)
    expect(popTo).toHaveBeenCalledWith(0)
    expect(strip.props.pin).toMatchObject({ pinned: false, label: 'Computer' })
    strip.props.pin!.onToggle()
    const lifeId = game().lifeId
    expect(isPinned(prefsNow(), lifeId, { tab: 'activities', path: ['computer'] })).toBe(true)
    strip.props.pin!.onToggle()
    expect(isPinned(prefsNow(), lifeId, { tab: 'activities', path: ['computer'] })).toBe(false)
  })

  it('the 13th pin changes nothing', () => {
    setFlags({ ...NAV_OFF, navRegroup: true, navPalette: true })
    const lifeId = game().lifeId
    for (let i = 0; i < 12; i++) updatePrefs((p) => togglePin(p, lifeId, { tab: 'assets', path: [`g${i}`] }).prefs)
    const before = prefsNow()
    const realSheet = sheetModule.Sheet
    let subheader: ReactNode = null
    const sheetSpy = vi.spyOn(sheetModule, 'Sheet').mockImplementation((p) => {
      subheader = p.subheader
      return realSheet(p)
    })
    try {
      render(createElement(MenuSheet, { root: activitiesMenu, onClose: () => {}, initial: COMPUTER }))
    } finally {
      sheetSpy.mockRestore()
    }
    const strip = subheader as unknown as ReactElement<{ pin: { onToggle: () => void } }>
    strip.props.pin.onToggle()
    expect(prefsNow()).toBe(before)
    expect(lifeOf(prefsNow(), lifeId).pins).toHaveLength(12)
  })
})

describe('the CSS and the voice', () => {
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8')
  const NAV_CSS = read('src/ui/styles/nav.css')

  function ruleBody(css: string, selector: string): string {
    const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const m = new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`).exec(css)
    if (!m) throw new Error(`no rule for ${selector}`)
    return m[1]!
  }

  it('an earlier crumb is at least 44px tall, and the star is a 44px square', () => {
    expect(ruleBody(NAV_CSS, '.crumb-link')).toMatch(/min-height:\s*var\(--target\)/)
    const pin = ruleBody(NAV_CSS, '.crumbs-pin')
    expect(pin).toMatch(/width:\s*var\(--target\)/)
    expect(pin).toMatch(/height:\s*var\(--target\)/)
  })

  it('the strip scrolls sideways, and a label is cut with an ellipsis at 18 characters by CSS alone', () => {
    expect(ruleBody(NAV_CSS, '.crumbs-list')).toMatch(/overflow-x:\s*auto/)
    // One rule is shared by the buttons and the current crumb.
    const body = ruleBody(NAV_CSS, '.crumb-link,\n.crumb-current')
    expect(body).toMatch(/max-width:\s*18ch/)
    expect(body).toMatch(/text-overflow:\s*ellipsis/)
    expect(body).toMatch(/overflow:\s*hidden/)
    expect(body).toMatch(/white-space:\s*nowrap/)
  })

  it('uses the global tokens, so it follows light and dark mode', () => {
    const crumbCss = NAV_CSS.slice(NAV_CSS.indexOf('.crumbs {'))
    expect(crumbCss).toContain('var(--card)')
    expect(crumbCss).toContain('var(--text)')
    expect(crumbCss).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  it.each(['src/ui/nav/prefs.ts', 'src/ui/nav/Breadcrumbs.tsx', 'src/ui/styles/nav.css', 'src/ui/components/menuModel.ts', 'src/ui/components/MenuList.tsx', 'src/ui/components/Sheet.tsx', 'src/ui/components/MenuSheet.tsx', 'src/ui/components/PersonSheet.tsx', 'src/ui/screens/GameScreen.tsx'])(
    '%s has no em-dash or en-dash',
    (rel) => {
      expect(read(rel)).not.toMatch(/[\u2013\u2014]/)
    },
  )

  it('the new nav files add no money call and no draw (pure UI state)', () => {
    for (const rel of ['src/ui/nav/prefs.ts', 'src/ui/nav/Breadcrumbs.tsx']) {
      const text = read(rel)
      expect(text).not.toMatch(/\b(earnIncome|spend|addMoney)\(/)
      expect(text).not.toMatch(/\.(cash|money)\s*\+=/)
      expect(text).not.toMatch(/\brand\(|g\.rng|Math\.random/)
    }
  })
})
