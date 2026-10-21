// "↩ Back to <menu>": the store remembers where an action closed a sheet, the chip waits
// for the popups, reopens the same menu (or its deepest ancestor that still exists) and
// goes away on a birthday, a new life, or when you move on.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameState, MenuAction, MenuGroup, MenuNode } from '../src/game/types'
import { makeTestGame } from './helpers'

// Built-in tasks (year events, interviews...) resolve to nothing here, so only what a test
// queues itself shows up.
const offline = vi.hoisted(() => {
  const resolve = vi.fn()
  return { applyFallback: resolve, resolveTask: resolve, MAX_CUSTOM_ACTIONS_PER_YEAR: 5, CUSTOM_ACTION_KEY: 'doAnything' }
})
vi.mock('../src/game/offline', () => offline)

const store = await import('../src/ui/store')
const { notice } = await import('../src/game/core')
const { createPerson } = await import('../src/game/people')
const { returnTarget } = await import('../src/ui/components/menuModel')
const { resolveReturnPoint, returnDescription, ReturnChip, MENU_SHEETS, openingClearsReturn } = await import('../src/ui/components/ReturnChip')
const { MenuSheet } = await import('../src/ui/components/MenuSheet')
const { RelationshipsSheet } = await import('../src/ui/components/RelationshipsSheet')
const { GameScreen } = await import('../src/ui/screens/GameScreen')

function game(): GameState {
  return store.getApp().game as GameState
}

const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el)

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  offline.resolveTask.mockReset()
  store.startNewLife({ seed: 7, year: 2026 })
  store.act((g) => {
    g.queue = []
    g.character.age = 24
  })
})

afterEach(() => {
  store.clearReturnPoint()
  vi.restoreAllMocks()
})

const ventures = { sheet: 'activities' as const, path: ['computer', 'ventures', 'venture-1'], scrolls: [320, 0, 48, 600] }

describe('return point (store)', () => {
  it('remembers the spot, stamped with the life, age and year', () => {
    store.setReturnPoint(ventures)
    const point = store.getApp().returnPoint
    expect(point).toMatchObject({ sheet: 'activities', path: ['computer', 'ventures', 'venture-1'], scrolls: [320, 0, 48, 600] })
    expect(point?.lifeId).toBe(game().lifeId)
    expect(point?.age).toBe(24)
    expect(point?.year).toBe(game().year)
    expect(point && 'personId' in point).toBe(false)
    expect(store.returnChipVisible(point, game())).toBe(true)
  })

  it('cleans up junk scroll offsets and empty ids', () => {
    store.setReturnPoint({ sheet: 'assets', path: ['', 'houses'], scrolls: [Number.NaN, -40, 12.6, Infinity] })
    const point = store.getApp().returnPoint
    expect(point?.path).toEqual(['houses'])
    expect(point?.scrolls).toEqual([0, 0, 13, 0])
  })

  it('survives the popups that follow the action and shows once they are dealt with', () => {
    store.setReturnPoint(ventures)
    store.act((g) => {
      notice(g, 'Shipped', 'You shipped three features and broke two.')
      notice(g, 'Reviews', 'Users noticed.')
    })
    const point = store.getApp().returnPoint
    expect(point).not.toBeNull()
    expect(store.returnChipVisible(point, game())).toBe(false)
    store.dismissNotice(game().queue[0].id)
    expect(store.returnChipVisible(store.getApp().returnPoint, game())).toBe(false)
    store.dismissNotice(game().queue[0].id)
    expect(game().queue).toHaveLength(0)
    expect(store.returnChipVisible(store.getApp().returnPoint, game())).toBe(true)
  })

  it('clears when you age up', () => {
    store.setReturnPoint(ventures)
    store.ageUpAction()
    expect(store.getApp().returnPoint).toBeNull()
  })

  it('does not clear when aging is blocked by a popup', () => {
    store.setReturnPoint(ventures)
    store.act((g) => notice(g, 'Wait', 'Not yet.'))
    store.ageUpAction()
    expect(store.getApp().returnPoint).not.toBeNull()
  })

  it('goes stale after a birthday, death or another life', () => {
    store.setReturnPoint(ventures)
    const point = store.getApp().returnPoint
    const g = structuredClone(game())
    expect(store.returnPointLive(point, g)).toBe(true)
    g.character.age += 1
    g.year += 1
    expect(store.returnPointLive(point, g)).toBe(false)
    const dead = structuredClone(game())
    dead.character.alive = false
    expect(store.returnPointLive(point, dead)).toBe(false)
    const other = structuredClone(game())
    other.lifeId = 'someone-else'
    expect(store.returnPointLive(point, other)).toBe(false)
    expect(store.returnPointLive(null, game())).toBe(false)
    expect(store.returnPointLive(point, null)).toBe(false)
  })

  it('a new life, continuing a save or abandoning drops it', () => {
    store.setReturnPoint(ventures)
    store.startNewLife({ seed: 8, year: 2026 })
    expect(store.getApp().returnPoint).toBeNull()
    store.setReturnPoint(ventures)
    store.abandonLife()
    expect(store.getApp().returnPoint).toBeNull()
  })

  it('opening a menu sheet moves you on, but a peek at your profile keeps the chip', () => {
    for (const sheet of ['occupation', 'assets', 'activities', 'relationships']) expect(openingClearsReturn(sheet)).toBe(true)
    expect(openingClearsReturn('profile')).toBe(false)
  })

  it('is UI state only: never written into the game state', () => {
    store.setReturnPoint(ventures)
    expect(JSON.stringify(game())).not.toContain('venture-1')
  })
})

// ---------------------------------------------------------------------------

const action = (id: string): MenuAction => ({ type: 'action', id, label: id, emoji: '🙂', run: () => {} })
const group = (id: string, label: string, children: (g: GameState) => MenuNode[], extra: Partial<MenuGroup> = {}): MenuGroup => ({
  type: 'menu',
  id,
  label,
  emoji: '📁',
  children,
  ...extra,
})

describe('returnTarget (pure)', () => {
  const tree = (): MenuNode[] => [
    action('top'),
    group('computer', 'Computer', () => [
      group('ventures', 'Ventures', () => [
        group('venture-1', 'InvoiceSloth', () => [action('ship')], { visible: (s) => s.flags.ownsSloth === true }),
      ]),
    ]),
    group('locked', 'Locked', () => [group('inner', 'Inner', () => [])], { disabledReason: () => 'Nope' }),
  ]
  const root = (_g: GameState) => ({ label: 'Activities', emoji: '🎯', nodes: tree() })

  it('reopens the exact menu with its breadcrumb', () => {
    const g = makeTestGame()
    g.flags.ownsSloth = true
    const t = returnTarget(g, root(g), ['computer', 'ventures', 'venture-1'])
    expect(t).toEqual({
      path: ['computer', 'ventures', 'venture-1'],
      crumbs: ['Activities', 'Computer', 'Ventures', 'InvoiceSloth'],
      label: 'InvoiceSloth',
      emoji: '📁',
      exact: true,
    })
  })

  it('falls back to the deepest menu that still exists', () => {
    const g = makeTestGame()
    g.flags.ownsSloth = false // sold the venture
    const t = returnTarget(g, root(g), ['computer', 'ventures', 'venture-1'])
    expect(t.path).toEqual(['computer', 'ventures'])
    expect(t.label).toBe('Ventures')
    expect(t.exact).toBe(false)
  })

  it('names the group a cockpit tile belongs to, so the chip does not read just "Money"', () => {
    const g = makeTestGame()
    const kids = (): MenuNode[] => [
      group('biz.company.b1', 'Test Co', () => [
        group('hub.biz.money.b1', 'Money', () => [group('books', 'Books and Charts', () => [action('open')])]),
        group('hub.biz.run.b1', 'Run', () => []),
      ]),
    ]
    const root = { label: 'Assets', emoji: '💰', nodes: kids() }
    const tile = returnTarget(g, root, ['biz.company.b1', 'hub.biz.money.b1'])
    expect(tile).toMatchObject({ label: 'Test Co · Money', exact: true, crumbs: ['Assets', 'Test Co', 'Money'] })
    // Below a tile the company still leads the label.
    expect(returnTarget(g, root, ['biz.company.b1', 'hub.biz.money.b1', 'books']).label).toBe('Test Co · Books and Charts')
    // The company itself, and a plain group, are named as they always were.
    expect(returnTarget(g, root, ['biz.company.b1']).label).toBe('Test Co')
    // A tile straight under the root has no company above it.
    const lone = { label: 'Assets', emoji: '💰', nodes: [group('hub.top', 'Top tile', () => [])] }
    expect(returnTarget(g, lone, ['hub.top']).label).toBe('Top tile')
  })

  it('falls back to the root for missing, locked or action ids', () => {
    const g = makeTestGame()
    for (const path of [['gone'], ['locked', 'inner'], ['top']]) {
      const t = returnTarget(g, root(g), path)
      expect(t).toMatchObject({ path: [], label: 'Activities', emoji: '🎯', crumbs: ['Activities'], exact: false })
    }
    expect(returnTarget(g, root(g), [])).toMatchObject({ label: 'Activities', exact: true })
  })
})

describe('resolveReturnPoint (real menus)', () => {
  it('finds Activities › Computer, and falls back to Activities in prison', () => {
    store.setReturnPoint({ sheet: 'activities', path: ['computer'], scrolls: [200, 0] })
    const point = store.getApp().returnPoint!
    const t = resolveReturnPoint(game(), point)
    expect(t).toMatchObject({ sheet: 'activities', path: ['computer'], label: 'Computer', exact: true, scrolls: [200, 0] })
    expect(returnDescription(t)).toBe('Back to Activities › Computer')

    const jailed = structuredClone(game())
    jailed.character.prison = {
      name: 'County Jail',
      security: 'minimum',
      crime: 'Fraud',
      sentenceYears: 3,
      yearsServed: 0,
      respect: 50,
      appealed: false,
      escapeAttempts: 0,
    }
    const inPrison = resolveReturnPoint(jailed, point)
    expect(inPrison).toMatchObject({ sheet: 'activities', path: [], label: MENU_SHEETS.activities.label, exact: false })
  })

  it('reopens a person, or the relationships list once they are gone', () => {
    let personId = ''
    store.act((g) => {
      personId = createPerson(g, { relation: 'friend', age: 25, firstName: 'Priya', lastName: 'Nair' }).id
    })
    store.setReturnPoint({ sheet: 'relationships', personId, path: ['no-such-group'], scrolls: [0, 0] })
    const point = store.getApp().returnPoint!
    const t = resolveReturnPoint(game(), point)
    expect(t).toMatchObject({ sheet: 'relationships', personId, path: [], label: 'Priya Nair', exact: false })
    expect(t.crumbs).toEqual(['Relationships', 'Priya Nair'])

    const gone = structuredClone(game())
    gone.people = gone.people.filter((p) => p.id !== personId)
    const fallback = resolveReturnPoint(gone, point)
    expect(fallback).toMatchObject({ sheet: 'relationships', label: 'Relationships', path: [], exact: false })
    expect(fallback.personId).toBeUndefined()
  })
})

describe('reopening renders the right menu', () => {
  it('a menu sheet opens at the saved spot, or its deepest valid ancestor', () => {
    const html = render(createElement(MenuSheet, { root: MENU_SHEETS.activities, onClose: () => {}, initial: { path: ['computer'], scrolls: [0, 0] } }))
    expect(html).toMatch(/<h2 class="sheet-title">.*Computer<\/h2>/)
    expect(html).toContain('aria-label="Back"')

    const bogus = render(createElement(MenuSheet, { root: MENU_SHEETS.activities, onClose: () => {}, initial: { path: ['nope', 'computer'], scrolls: [] } }))
    expect(bogus).toMatch(/<h2 class="sheet-title">.*Activities<\/h2>/)
    expect(bogus).not.toContain('aria-label="Back"')
  })

  it('the relationships sheet reopens on the person', () => {
    let personId = ''
    store.act((g) => {
      personId = createPerson(g, { relation: 'friend', age: 25, firstName: 'Priya', lastName: 'Nair' }).id
    })
    const html = render(createElement(RelationshipsSheet, { onClose: () => {}, initial: { personId, spot: { path: [], scrolls: [0] } } }))
    expect(html).toContain('Spend Time')
    expect(html).not.toMatch(/AI chat|Talk \(/)
    expect(html).toMatch(/<h2 class="sheet-title">.*Priya Nair<\/h2>/)
    const list = render(createElement(RelationshipsSheet, { onClose: () => {}, initial: { personId: 'missing', spot: null } }))
    expect(list).not.toContain('Talk (AI chat)')
  })

  it('the chip is a labelled, keyboard-reachable pair of buttons', () => {
    store.setReturnPoint({ sheet: 'activities', path: ['computer'], scrolls: [0, 0] })
    const t = resolveReturnPoint(game(), store.getApp().returnPoint!)
    const html = render(createElement(ReturnChip, { target: t, onReturn: () => {}, onDismiss: () => {} }))
    expect(html).toContain('aria-label="Back to Activities › Computer"')
    expect(html).toContain('<strong>Computer</strong>')
    expect(html).toContain('aria-label="Dismiss"')
    expect((html.match(/<button type="button"/g) ?? []).length).toBe(2)
  })

  it('the game screen shows the chip only once the popups are done', () => {
    store.setReturnPoint({ sheet: 'activities', path: ['computer'], scrolls: [0, 0] })
    const shown = render(createElement(GameScreen))
    expect(shown).toContain('return-chip')
    expect(shown).toContain('lifelog has-chip')

    store.act((g) => notice(g, 'Hacked', 'Your laptop now mines crypto for someone else.'))
    const hidden = render(createElement(GameScreen))
    expect(hidden).not.toContain('return-chip')
    expect(hidden).not.toContain('has-chip')

    store.dismissNotice(game().queue[0].id)
    store.clearReturnPoint()
    expect(render(createElement(GameScreen))).not.toContain('return-chip')
  })
})
