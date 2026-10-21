// R1-N2: "Needs you" badges. A badge is a pure read of the committed state (no children(), no hint, no row text), kept in a
// small registry so later releases add signals without touching menus. The pill sits inside the row text (the end slot is
// aria-hidden), and everything is dark behind FLAGS.navRegroup.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bizOf } from '../src/game/business/state'
import { companyHealth } from '../src/game/business/dashboard'
import { resetFlags, setFlags, withFlags } from '../src/game/flags'
import { badgeText, BADGE_MAX_CHARS, needsYou, registerBadge, registerBadgePrefix, type NeedRow } from '../src/game/hubs/needs'
import { SECTION_LABEL, SECTION_ORDER } from '../src/game/hubs/sections'
import { activitiesMenu } from '../src/game/menus'
import type { Asset, Condition, GameState, MenuAction, MenuGroup, MenuNode } from '../src/game/types'
import { MenuRow } from '../src/ui/components/MenuList'
import { nodeBadge, nodeVisible } from '../src/ui/components/menuModel'
import { NeedsYouCard } from '../src/ui/nav/NeedsYouCard'
import { NAV_OFF, frozen, navState } from './nav-kit'

// The memo test counts calls to the real companyHealth through a spy that delegates to it.
vi.mock('../src/game/business/dashboard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/game/business/dashboard')>()
  return { ...actual, companyHealth: vi.fn(actual.companyHealth) }
})

const store = await import('../src/ui/store')
const { MenuSheet } = await import('../src/ui/components/MenuSheet')

beforeEach(() => {
  setFlags(NAV_OFF)
})

afterEach(() => {
  resetFlags()
  vi.restoreAllMocks()
})

const fakeNode = (id: string) => ({ id })

function cond(severity: number, diagnosed = true): Condition {
  return { id: `c${severity}${diagnosed}`, name: 'Flu', kind: 'disease', severity, yearsHad: 1, curable: true, diagnosed, age: 30 }
}

function action(id: string, extra: Partial<MenuAction> = {}): MenuAction {
  return { type: 'action', id, label: id.toUpperCase(), emoji: 'E', run: () => {}, ...extra }
}

function businesses(g: GameState): Asset[] {
  return g.assets.filter((a) => a.kind === 'business')
}

function harborGrill(g: GameState): Asset {
  const a = g.assets.find((x) => x.kind === 'business' && x.name === 'Harbor Grill')
  if (!a) throw new Error('the canned CEO has no Harbor Grill')
  return a
}

describe('the registered badges', () => {
  it('10. are all null for a kid (no false alarms)', () => {
    const g = frozen('kid')
    for (const id of ['doctor', 'crime', 'occupation.jobs', 'biz.company.nothing', 'asset-nothing']) expect(badgeText(fakeNode(id), g), id).toBeNull()
  })

  it('are all null for the canned adult, CEO and elder without trouble', () => {
    // The adult has a job and a healthy house; the CEO runs two fine companies; the elder is retired.
    expect(badgeText(fakeNode('occupation.jobs'), frozen('adult'))).toBeNull()
    expect(badgeText(fakeNode('crime'), frozen('adult'))).toBeNull()
    expect(badgeText(fakeNode('occupation.jobs'), frozen('elder'))).toBeNull()
    const ceo = frozen('ceo')
    for (const a of ceo.assets) {
      if (a.kind === 'business') expect(badgeText(fakeNode(`biz.company.${a.id}`), ceo), a.name).toBeNull()
      expect(badgeText(fakeNode(`asset-${a.id}`), ceo), a.name).toBeNull()
    }
  })

  it('11. doctor: a diagnosed condition of severity 40 or more gives Sick, several give a count', () => {
    const g = navState('adult')
    g.character.conditions = [cond(60)]
    expect(badgeText(fakeNode('doctor'), g)).toBe('Sick')
    g.character.conditions = [cond(60), cond(45)]
    expect(badgeText(fakeNode('doctor'), g)).toBe('2 illnesses')
    g.character.conditions = [cond(40), cond(90), cond(41), cond(99)]
    expect(badgeText(fakeNode('doctor'), g)).toBe('4 illnesses')
    g.character.conditions = [cond(60, false)]
    expect(badgeText(fakeNode('doctor'), g), 'undiagnosed').toBeNull()
    g.character.conditions = [cond(20)]
    expect(badgeText(fakeNode('doctor'), g), 'mild').toBeNull()
    g.character.conditions = [cond(39)]
    expect(badgeText(fakeNode('doctor'), g), 'just under the line').toBeNull()
    g.character.conditions = [cond(40)]
    expect(badgeText(fakeNode('doctor'), g), 'on the line').toBe('Sick')
    g.character.conditions = [cond(60), cond(60, false), cond(10)]
    expect(badgeText(fakeNode('doctor'), g), 'only the serious diagnosed one counts').toBe('Sick')
    g.character.conditions = []
    expect(badgeText(fakeNode('doctor'), g)).toBeNull()
  })

  it('12. crime: a wanted level above zero gives Wanted', () => {
    const g = navState('adult')
    g.character.wantedLevel = 2
    expect(badgeText(fakeNode('crime'), g)).toBe('Wanted')
    g.character.wantedLevel = 0
    expect(badgeText(fakeNode('crime'), g)).toBeNull()
  })

  it('13. occupation.jobs: a free adult with no job gives No job', () => {
    const idle = (): GameState => {
      const g = navState('adult')
      const c = g.character
      c.job = null
      c.partTimeJob = null
      c.retired = false
      c.education.current = null
      c.prison = null
      return g
    }
    const g = idle()
    expect(badgeText(fakeNode('occupation.jobs'), g)).toBe('No job')
    g.character.age = 18
    expect(badgeText(fakeNode('occupation.jobs'), g), 'on the 18th birthday').toBe('No job')

    expect(badgeText(fakeNode('occupation.jobs'), navState('adult')), 'employed').toBeNull()
    const part = idle()
    part.character.partTimeJob = navState('adult').character.job
    expect(badgeText(fakeNode('occupation.jobs'), part), 'part-time job').toBeNull()
    const retired = idle()
    retired.character.retired = true
    expect(badgeText(fakeNode('occupation.jobs'), retired), 'retired').toBeNull()
    const student = idle()
    student.character.education.current = { level: 'university', school: 'State U', yearsLeft: 2, gpa: 3, major: null } as unknown as typeof student.character.education.current
    expect(badgeText(fakeNode('occupation.jobs'), student), 'student').toBeNull()
    const jailed = idle()
    jailed.character.prison = { name: 'State Pen', security: 'medium', crime: 'Burglary', sentenceYears: 4, yearsServed: 1, respect: 50, appealed: false, escapeAttempts: 0 }
    expect(badgeText(fakeNode('occupation.jobs'), jailed), 'prisoner').toBeNull()
    const young = idle()
    young.character.age = 17
    expect(badgeText(fakeNode('occupation.jobs'), young), 'under 18').toBeNull()
    const dead = idle()
    dead.character.alive = false
    expect(badgeText(fakeNode('occupation.jobs'), dead), 'dead').toBeNull()
    expect(badgeText(fakeNode('occupation.jobs'), frozen('kid'))).toBeNull()
  })

  it('14. companies: In danger, Struggling, nothing for a healthy company or a house', () => {
    const g = navState('ceo')
    const grill = harborGrill(g)
    const node = fakeNode(`biz.company.${grill.id}`)
    expect(badgeText(node, g), 'healthy company').toBeNull()

    const broke = structuredClone(g)
    bizOf(broke, harborGrill(broke)).cash = -5000
    expect(badgeText(node, broke)).toBe('In danger')
    expect(badgeText(fakeNode(`asset-${grill.id}`), broke), 'the same company seen as an owned asset').toBe('In danger')

    const sad = structuredClone(g)
    const b = bizOf(sad, harborGrill(sad))
    b.cash = 1e9
    b.morale = 10
    expect(badgeText(node, sad)).toBe('Struggling')

    const home = g.assets.find((a) => a.kind === 'house')
    expect(home, 'the canned CEO owns a house').toBeTruthy()
    expect(badgeText(fakeNode(`asset-${home!.id}`), g)).toBeNull()
    expect(badgeText(fakeNode('asset-no-such-id'), g)).toBeNull()
    expect(badgeText(fakeNode('biz.company.no-such-id'), g)).toBeNull()
    // A house id under the company prefix is not a company.
    expect(badgeText(fakeNode(`biz.company.${home!.id}`), g)).toBeNull()
  })

  it('14. reads each company once per state, and again for a new state', () => {
    const spy = vi.mocked(companyHealth)
    const g = frozen('ceo')
    const companies = businesses(g)
    expect(companies.length).toBeGreaterThanOrEqual(2)
    spy.mockClear()
    for (const a of companies) badgeText(fakeNode(`biz.company.${a.id}`), g)
    expect(spy).toHaveBeenCalledTimes(companies.length)
    for (const a of companies) {
      badgeText(fakeNode(`biz.company.${a.id}`), g)
      badgeText(fakeNode(`asset-${a.id}`), g)
    }
    expect(spy, 'second look, same state').toHaveBeenCalledTimes(companies.length)
    const next = frozen('ceo')
    badgeText(fakeNode(`biz.company.${companies[0]!.id}`), next)
    expect(spy, 'a new state').toHaveBeenCalledTimes(companies.length + 1)
  })
})

describe('badgeText', () => {
  it('15. turns numbers into text, caps at 99+, cuts words to 12 characters and drops junk', () => {
    const g = frozen('adult')
    const of = (v: unknown) => badgeText({ id: 'x', badge: () => v as never }, g)
    expect(BADGE_MAX_CHARS).toBe(12)
    expect(of(5)).toBe('5')
    expect(of(99)).toBe('99')
    expect(of(100)).toBe('99+')
    expect(of(250)).toBe('99+')
    expect(of(2.9)).toBe('2')
    expect(of(0)).toBeNull()
    expect(of(-4)).toBeNull()
    expect(of(Number.NaN)).toBeNull()
    expect(of(Number.POSITIVE_INFINITY)).toBeNull()
    expect(of('  Sick  ')).toBe('Sick')
    expect(of('x'.repeat(20))).toBe('x'.repeat(12))
    expect(of('two\nlines  here')).toBe('two lines he')
    expect(of('')).toBeNull()
    expect(of('   ')).toBeNull()
    expect(of(null)).toBeNull()
    expect(of(undefined)).toBeNull()
    expect(of(true)).toBeNull()
    expect(of({})).toBeNull()
    expect(of([3])).toBeNull()
    // A cut never splits an emoji into a broken character.
    const cut = of('\u{1F3E5}'.repeat(20))
    expect(Array.from(cut ?? '')).toHaveLength(12)
    expect(cut).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/)
  })

  it('15. gives null for a throwing function, and says so on the console', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const g = frozen('adult')
    expect(badgeText({ id: 'boom', badge: () => { throw new Error('nope') } }, g)).toBeNull()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('uses node.badge first, then an exact registration, then a prefix registration', () => {
    const g = frozen('adult')
    registerBadge('nav-needs.exact', () => 'exact')
    registerBadgePrefix('nav-needs.pfx.', (_g, rest) => `pfx:${rest}`)
    expect(badgeText(fakeNode('nav-needs.exact'), g)).toBe('exact')
    expect(badgeText(fakeNode('nav-needs.pfx.abc'), g)).toBe('pfx:abc')
    expect(badgeText({ id: 'nav-needs.exact', badge: () => 'own' }, g)).toBe('own')
    expect(badgeText({ id: 'nav-needs.pfx.abc', badge: () => null }, g), 'a node that says null stays null').toBeNull()
    expect(badgeText(fakeNode('nav-needs.unknown'), g)).toBeNull()
    // An exact id wins over a prefix that also matches.
    registerBadge('nav-needs.pfx.special', () => 'special')
    expect(badgeText(fakeNode('nav-needs.pfx.special'), g)).toBe('special')
    // Registering again replaces.
    registerBadge('nav-needs.exact', () => 'second')
    expect(badgeText(fakeNode('nav-needs.exact'), g)).toBe('second')
    // Junk registrations are ignored, never thrown.
    expect(() => registerBadge('', () => 1)).not.toThrow()
    expect(() => registerBadge('nav-needs.bad', 'nope' as never)).not.toThrow()
    expect(badgeText(fakeNode('nav-needs.bad'), g)).toBeNull()
    // Ids that are keys of Object.prototype are not registrations.
    for (const id of ['constructor', '__proto__', 'toString']) expect(badgeText(fakeNode(id), g), id).toBeNull()
  })
})

describe('needsYou', () => {
  const flagged = (id: string, extra: Partial<MenuAction> = {}) => action(id, { badge: () => `b-${id}`, ...extra })

  it('16. keeps data order, skips locked and hidden rows and rows without a badge, and honours max', () => {
    const g = frozen('adult')
    const opened = vi.fn(() => [] as MenuNode[])
    const group: MenuGroup = { type: 'menu', id: 'grp', label: 'Grp', emoji: 'G', children: opened, badge: () => 3 }
    const nodes: MenuNode[] = [
      { type: 'info', id: 'i', text: 'info' },
      flagged('a'),
      flagged('hidden', { visible: () => false }),
      flagged('locked', { disabledReason: () => 'Not yet.' }),
      action('plain'),
      group,
      { type: 'heading', id: 'h', label: 'H' },
      flagged('b'),
    ]
    const rows = needsYou(nodes, g)
    expect(rows.map((r) => r.node.id)).toEqual(['a', 'grp', 'b'])
    expect(rows.map((r) => r.badge)).toEqual(['b-a', '3', 'b-b'])
    expect(rows[1]!.node).toBe(group)
    expect(needsYou(nodes, g, 2).map((r) => r.node.id)).toEqual(['a', 'grp'])
    expect(needsYou(nodes, g, 0)).toEqual([])
    expect(needsYou([], g)).toEqual([])
    const many = Array.from({ length: 10 }, (_, i) => flagged(`m${i}`))
    expect(needsYou(many, g)).toHaveLength(6)
  })

  it('16. never opens a group or reads a hint or a subtitle (no grandchild children() call)', () => {
    const g = frozen('adult')
    const children = vi.fn(() => [] as MenuNode[])
    const hint = vi.fn(() => 'hint')
    const subtitle = vi.fn(() => 'sub')
    const rows: MenuNode[] = [
      { type: 'menu', id: 'g1', label: 'G1', emoji: 'G', children, hint, subtitle, badge: () => 'x' },
      action('a1', { hint, subtitle, badge: () => 'y' }),
      { type: 'menu', id: 'doctor', label: 'Doctor', emoji: 'D', children, hint, subtitle },
    ]
    needsYou(rows, g)
    for (const r of rows) badgeText(r as MenuGroup, g)
    expect(children).not.toHaveBeenCalled()
    expect(hint).not.toHaveBeenCalled()
    expect(subtitle).not.toHaveBeenCalled()
  })

  it('does not trust a visible or disabledReason that throws', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const g = frozen('adult')
    const rows = needsYou(
      [flagged('v', { visible: () => { throw new Error('v') } }), flagged('d', { disabledReason: () => { throw new Error('d') } }), flagged('ok')],
      g,
    )
    // A throwing visible hides the row (as the menu does); a throwing disabledReason leaves it open.
    expect(rows.map((r) => r.node.id)).toEqual(['d', 'ok'])
    expect(spy).toHaveBeenCalled()
  })

  it('finds the real signals on the Activities root', () => {
    const g = navState('adult')
    g.character.wantedLevel = 2
    g.character.conditions = [cond(60)]
    const rows = needsYou(activitiesMenu.children(g), g)
    expect(rows.map((r) => `${r.node.id}:${r.badge}`)).toEqual(['crime:Wanted', 'doctor:Sick'])
  })
})

describe('purity', () => {
  it('17. needs.ts never calls children(), a hint, an optimiser or a row subtitle', () => {
    const src = readFileSync(fileURLToPath(new URL('../src/game/hubs/needs.ts', import.meta.url)), 'utf8')
    for (const banned of ['.children(', 'bestPlan', '.hint(', 'subtitle']) expect(src.includes(banned), banned).toBe(false)
  })

  it('17. needs.ts imports nothing from the UI layer and draws no random number', () => {
    const src = readFileSync(fileURLToPath(new URL('../src/game/hubs/needs.ts', import.meta.url)), 'utf8')
    expect(src).not.toMatch(/from '\.\.\/\.\.\/ui/)
    expect(src).not.toMatch(/rand\(|\.rng|earnIncome|spend\(|addMoney|\.cash \+=|\.money \+=/)
    // Only the writes the memo needs: no assignment to the game state.
    expect(src).not.toMatch(/\bg\.[a-zA-Z.]+\s*=[^=]/)
  })

  it('17. runs on a frozen state and leaves its JSON unchanged', () => {
    for (const name of ['kid', 'adult', 'ceo', 'elder'] as const) {
      const g = frozen(name)
      const before = JSON.stringify(g)
      const ids = ['doctor', 'crime', 'occupation.jobs', ...g.assets.flatMap((a) => [`asset-${a.id}`, `biz.company.${a.id}`])]
      for (const id of ids) expect(() => badgeText(fakeNode(id), g), `${name} ${id}`).not.toThrow()
      expect(JSON.stringify(g), name).toBe(before)
    }
  })

  it('draws nothing from the game random stream', () => {
    const g = navState('ceo')
    g.character.wantedLevel = 3
    g.character.conditions = [cond(70)]
    const before = JSON.stringify(g.rng)
    for (const id of ['doctor', 'crime', 'occupation.jobs', ...g.assets.flatMap((a) => [`asset-${a.id}`, `biz.company.${a.id}`])]) badgeText(fakeNode(id), g)
    expect(JSON.stringify(g.rng)).toBe(before)
  })
})

function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (!isValidElement(node)) return ''
  return textOf((node.props as { children?: ReactNode }).children)
}

function buttons(node: ReactNode, out: ReactElement<{ onClick?: () => void; children?: ReactNode }>[] = []): ReactElement<{ onClick?: () => void; children?: ReactNode }>[] {
  if (Array.isArray(node)) {
    for (const n of node) buttons(n, out)
    return out
  }
  if (!isValidElement(node)) return out
  const props = node.props as { children?: ReactNode }
  if (node.type === 'button') out.push(node as ReactElement<{ onClick?: () => void; children?: ReactNode }>)
  buttons(props.children, out)
  return out
}

describe('the markup', () => {
  const g = frozen('adult')
  const sick: MenuAction = action('sick', { label: 'Doctor', subtitle: 'Visit a clinic', badge: () => 'Sick' })

  it('18. MenuRow shows the pill with the flag on, inside the text and outside the aria-hidden end slot', () => {
    const on = withFlags({ ...NAV_OFF, navRegroup: true }, () => renderToStaticMarkup(createElement(MenuRow, { node: sick, g, onTap: () => {} })))
    expect(on).toContain('class="menu-row-badge"')
    expect(on).toContain('>Sick</span>')
    const text = on.indexOf('menu-row-text')
    const label = on.indexOf('menu-row-label')
    const pill = on.indexOf('menu-row-badge')
    const sub = on.indexOf('menu-row-sub')
    const end = on.indexOf('menu-row-end')
    expect(text).toBeGreaterThan(-1)
    expect(text < label && label < pill && pill < sub && sub < end, 'text, label, pill, subtitle, end').toBe(true)
    expect(on.slice(end)).not.toContain('menu-row-badge')
  })

  it('18. MenuRow shows no pill with the flag off, and none on a locked row', () => {
    const off = renderToStaticMarkup(createElement(MenuRow, { node: sick, g, onTap: () => {} }))
    expect(off).not.toContain('menu-row-badge')
    expect(off).not.toContain('Sick')
    const locked = withFlags({ ...NAV_OFF, navRegroup: true }, () =>
      renderToStaticMarkup(createElement(MenuRow, { node: { ...sick, disabledReason: () => 'Not yet.' }, g, onTap: () => {} })),
    )
    expect(locked).not.toContain('menu-row-badge')
    expect(locked).toContain('menu-row-lock')
  })

  it('nodeBadge follows the flag', () => {
    expect(nodeBadge(sick, g)).toBeNull()
    expect(withFlags({ ...NAV_OFF, navRegroup: true }, () => nodeBadge(sick, g))).toBe('Sick')
    expect(withFlags({ ...NAV_OFF, navRegroup: true }, () => nodeBadge(action('quiet'), g))).toBeNull()
  })

  it('18. NeedsYouCard has the heading, one button per row and nothing for no rows', () => {
    const rows: NeedRow[] = [
      { node: action('a', { label: 'Doctor', emoji: 'D' }), badge: 'Sick' },
      { node: action('b', { label: 'Crime', emoji: 'C' }), badge: 'Wanted' },
    ]
    const html = renderToStaticMarkup(createElement(NeedsYouCard, { rows, onTap: () => {} }))
    expect(html).toContain('menu-section')
    expect(html).toContain('Needs you')
    expect(html.match(/<button/g)).toHaveLength(2)
    expect(html.match(/class="menu-row-badge"/g)).toHaveLength(2)
    expect(html).toContain('Doctor')
    expect(html).toContain('Wanted')
    expect(html).toContain('needs-card')

    expect(renderToStaticMarkup(createElement(NeedsYouCard, { rows: [], onTap: () => {} }))).toBe('')
    expect(NeedsYouCard({ rows: [], onTap: () => {} })).toBeNull()
  })

  it('18. a tap on a Needs you row goes to onTap with that node', () => {
    const taps: string[] = []
    const rows: NeedRow[] = [
      { node: action('a', { label: 'Doctor' }), badge: 'Sick' },
      { node: action('b', { label: 'Crime' }), badge: 'Wanted' },
    ]
    const tree = NeedsYouCard({ rows, onTap: (n) => taps.push(n.id) })
    const found = buttons(tree)
    expect(found).toHaveLength(2)
    expect(textOf(found[0]!)).toContain('Doctor')
    found[1]!.props.onClick?.()
    found[0]!.props.onClick?.()
    expect(taps).toEqual(['b', 'a'])
  })
})

describe('the Activities sheet', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    store.startNewLife({ seed: 7, year: 2026 })
    store.act((g) => {
      g.queue = []
      g.character.age = 35
    })
  })

  afterEach(() => {
    store.clearReturnPoint()
  })

  const sheet = () => renderToStaticMarkup(createElement(MenuSheet, { root: activitiesMenu, onClose: () => {} }))
  const labels = (html: string) =>
    [...html.matchAll(/<span class="menu-row-label">(.*?)<\/span>/g)].map((m) => m[1]!.replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))

  it('19. with the flag off, shows the v4.0.2 markup: no card, no pill, no section headings, data order', () => {
    store.act((g) => {
      g.character.wantedLevel = 2
      g.character.conditions = [cond(60)]
    })
    const html = sheet()
    expect(html).not.toContain('needs-card')
    expect(html).not.toContain('menu-row-badge')
    expect(html).not.toContain('Needs you')
    expect(html).not.toContain('menu-heading')
    for (const s of SECTION_ORDER) expect(html).not.toContain(`>${SECTION_LABEL[s]}</div>`)
    const g = store.getApp().game as GameState
    const expected = activitiesMenu.children(g).filter((n) => nodeVisible(n, g)).map((n) => (n as MenuAction).label)
    expect(labels(html)).toEqual(expected)
  })

  it('with the flag on, sections the list, shows the card and the pills', () => {
    store.act((g) => {
      g.character.wantedLevel = 2
      g.character.conditions = [cond(60)]
    })
    const html = withFlags({ ...NAV_OFF, navRegroup: true }, sheet)
    expect(html).toContain('needs-card')
    expect(html).toContain('Needs you')
    expect(html).toContain('>Wanted</span>')
    expect(html).toContain('>Sick</span>')
    for (const s of SECTION_ORDER.filter((x) => x !== 'more')) expect(html).toContain(`<div class="menu-heading">${SECTION_LABEL[s]}</div>`)
    const order = labels(html)
    expect(order.indexOf('Do Anything')).toBeGreaterThan(-1)
    expect(order[order.length - 1]).toBe('Surrender')
    // The card comes above the list: its first row is before Do Anything.
    expect(html.indexOf('needs-card')).toBeLessThan(html.indexOf('Do Anything'))
  })

  it('with the flag on and nothing to flag, shows no card but still sections the list', () => {
    const html = withFlags({ ...NAV_OFF, navRegroup: true }, sheet)
    expect(html).not.toContain('needs-card')
    expect(html).not.toContain('menu-row-badge')
    expect(html).toContain('<div class="menu-heading">Health and Mind</div>')
  })

  it('setFlags works like withFlags for the sheet', () => {
    setFlags({ ...NAV_OFF, navRegroup: true })
    expect(sheet()).toContain('<div class="menu-heading">Health and Mind</div>')
    setFlags(NAV_OFF)
    expect(sheet()).not.toContain('menu-heading')
  })
})
