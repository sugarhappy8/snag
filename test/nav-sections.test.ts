// R1-N2: the Activities list is sectioned at render time. The data order never changes (five seeded tests pick actions
// by position in activitiesMenu.children), so regroupForDisplay only reorders what MenuSheet shows.
//
//   - the table covers every activity row, so the "More" section is empty for a normal life;
//   - the display list is a permutation of the data list plus new headings, with Do Anything on top and Surrender last;
//   - short lists (prison) and the other roots come back as the same array.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  ACTIVITY_SECTION,
  SECTION_LABEL,
  SECTION_MIN_ROWS,
  SECTION_ORDER,
  SECTIONED_ROOTS,
  sectionOf,
  type SectionId,
} from '../src/game/hubs/sections'
import { activitiesMenu, assetsMenu, occupationMenu } from '../src/game/menus'
import type { GameState, MenuAction, MenuGroup, MenuHeading, MenuNode } from '../src/game/types'
import { MenuRows } from '../src/ui/components/MenuList'
import { nodeVisible } from '../src/ui/components/menuModel'
import { regroupForDisplay } from '../src/ui/nav/sections'
import { SECTIONED_ROOTS as KIT_SECTIONED_ROOTS, frozen, lintOf, navState, walkTreeCached } from './nav-kit'

const isRow = (n: MenuNode): n is MenuAction | MenuGroup => n.type === 'action' || n.type === 'menu'
const isHeading = (n: MenuNode): n is MenuHeading => n.type === 'heading'
const rowIds = (nodes: readonly MenuNode[]) => nodes.filter(isRow).map((n) => n.id)

function adultList(): { g: GameState; data: MenuNode[]; shown: MenuNode[] } {
  const g = frozen('adult')
  const data = activitiesMenu.children(g)
  return { g, data, shown: regroupForDisplay('activities', data, g) }
}

function action(id: string, extra: Partial<MenuAction> = {}): MenuAction {
  return { type: 'action', id, label: id.toUpperCase(), emoji: 'E', run: () => {}, ...extra }
}

/** A synthetic activities list of `n` known rows between Do Anything and Surrender. */
function syntheticList(n: number): MenuNode[] {
  const ids = Object.keys(ACTIVITY_SECTION).slice(0, n)
  return [action('doAnything'), ...ids.map((id) => action(id)), action('surrenderLife')]
}

describe('the section table', () => {
  it('1. covers every activity row of a normal life, so More stays empty', () => {
    for (const name of ['kid', 'adult', 'ceo', 'elder'] as const) {
      const ids = rowIds(activitiesMenu.children(frozen(name))).filter((id) => id !== 'doAnything' && id !== 'surrenderLife')
      const missing = ids.filter((id) => !Object.prototype.hasOwnProperty.call(ACTIVITY_SECTION, id))
      expect(missing, `${name}: ids missing from ACTIVITY_SECTION`).toEqual([])
      for (const id of ids) expect(sectionOf({ id }), id).not.toBe('more')
    }
  })

  it('has 36 rows, every one in a real section, and a label for each section', () => {
    expect(Object.keys(ACTIVITY_SECTION)).toHaveLength(36)
    for (const [id, section] of Object.entries(ACTIVITY_SECTION)) expect(SECTION_ORDER, id).toContain(section)
    expect(SECTION_ORDER).toEqual(['health', 'love', 'money', 'law', 'travel', 'fame', 'home', 'world', 'more'])
    expect(SECTION_LABEL).toEqual({
      health: 'Health and Mind',
      love: 'Love and Social',
      money: 'Money and Games',
      law: 'Law and Crime',
      travel: 'Travel',
      fame: 'Fame and Media',
      home: 'Home and Shopping',
      world: 'World and Politics',
      more: 'More',
    })
    expect(SECTION_MIN_ROWS).toBe(13)
    expect(SECTIONED_ROOTS).toEqual(['activities'])
  })

  it('sectionOf prefers a valid node.section, then the table, then More', () => {
    expect(sectionOf({ id: 'doctor' })).toBe('health')
    expect(sectionOf({ id: 'doctor', section: 'travel' })).toBe('travel')
    expect(sectionOf({ id: 'doctor', section: 'Travel' })).toBe('health')
    expect(sectionOf({ id: 'doctor', section: 'nonsense' })).toBe('health')
    expect(sectionOf({ id: 'brand.new' })).toBe('more')
    expect(sectionOf({ id: 'brand.new', section: 'law' })).toBe('law')
    for (const id of ['constructor', '__proto__', 'toString', 'hasOwnProperty', '']) expect(sectionOf({ id }), id).toBe('more')
    expect(sectionOf({ id: 'x', section: 'constructor' })).toBe('more')
  })
})

describe('regroupForDisplay', () => {
  it('2. is a permutation: nothing lost or duplicated, the same row objects, the input untouched', () => {
    const { g, data, shown } = adultList()
    const before = data.slice()
    const again = regroupForDisplay('activities', data, g)
    expect(data).toEqual(before)
    expect(again).toHaveLength(shown.length)
    const nonHeading = (list: MenuNode[]) => list.filter((n) => !isHeading(n)).map((n) => n.id).sort()
    expect(nonHeading(shown)).toEqual(nonHeading(data))
    for (const n of shown.filter((x) => !isHeading(x))) expect(data.includes(n), `${n.id} is the same object`).toBe(true)
    // Invisible rows (fame, thisYear, royal.court, surrender in the adult state) are kept too.
    expect(data.some((n) => !nodeVisible(n, g))).toBe(true)
    expect(shown.filter(isRow)).toHaveLength(data.filter(isRow).length)
  })

  it('never opens a group while it regroups', () => {
    const g = frozen('adult')
    const children = vi.fn(() => [] as MenuNode[])
    const list: MenuNode[] = Object.keys(ACTIVITY_SECTION).map((id) => ({ type: 'menu', id, label: id, emoji: 'G', children }))
    const out = regroupForDisplay('activities', [action('doAnything'), ...list, action('surrenderLife')], g)
    expect(out.length).toBeGreaterThan(list.length)
    expect(children).not.toHaveBeenCalled()
  })

  it('does not mutate a frozen input list', () => {
    const g = frozen('adult')
    const data = Object.freeze(activitiesMenu.children(g)) as MenuNode[]
    expect(() => regroupForDisplay('activities', data, g)).not.toThrow()
  })

  it('3. puts Do Anything first, Surrender last after a blank separator, and the eight headings in order', () => {
    const { g, shown } = adultList()
    expect(shown[0]!.id).toBe('doAnything')
    expect(shown[shown.length - 1]!.id).toBe('surrenderLife')
    const sep = shown[shown.length - 2]!
    expect(sep).toEqual({ type: 'heading', id: 'activities.h.last', label: '' })

    const headings = shown.filter(isHeading).filter((h) => h.id !== 'activities.h.last')
    const expected = SECTION_ORDER.filter((s) => s !== 'more')
    expect(headings.map((h) => h.id)).toEqual(expected.map((s) => `activities.h.${s}`))
    expect(headings.map((h) => h.label)).toEqual(expected.map((s) => SECTION_LABEL[s]))

    shown.forEach((n, i) => {
      if (!isHeading(n) || n.id === 'activities.h.last') return
      let j = i + 1
      let visibleRows = 0
      while (j < shown.length && !isHeading(shown[j]!)) {
        if (isRow(shown[j]!) && nodeVisible(shown[j]!, g)) visibleRows++
        j++
      }
      expect(visibleRows, `${n.id} has a visible row`).toBeGreaterThan(0)
    })
  })

  it('4. keeps the data order inside a section', () => {
    const { data, shown } = adultList()
    const dataIndex = new Map(data.map((n, i) => [n, i]))
    let section: SectionId | null = null
    let prev = -1
    for (const n of shown) {
      if (isHeading(n)) {
        prev = -1
        section = n.id.startsWith('activities.h.') ? (n.id.slice('activities.h.'.length) as SectionId) : null
        continue
      }
      if (n.id === 'doAnything' || n.id === 'surrenderLife') continue
      expect(sectionOf(n), n.id).toBe(section)
      const at = dataIndex.get(n)!
      expect(at, `${n.id} after the row before it`).toBeGreaterThan(prev)
      prev = at
    }
  })

  it('5. returns the same array for the prison list and for the other roots', () => {
    const prisoner = navState('adult')
    prisoner.character.prison = { name: 'State Pen', security: 'medium', crime: 'Burglary', sentenceYears: 4, yearsServed: 1, respect: 50, appealed: false, escapeAttempts: 0 }
    const jail = activitiesMenu.children(prisoner)
    expect(jail.some((n) => n.id === 'prison.escape')).toBe(true)
    expect(regroupForDisplay('activities', jail, prisoner)).toBe(jail)

    const g = frozen('adult')
    const assets = assetsMenu.children(g)
    const occupation = occupationMenu.children(g)
    expect(regroupForDisplay('assets', assets, g)).toBe(assets)
    expect(regroupForDisplay('occupation', occupation, g)).toBe(occupation)
    // Even a long list is left alone when its root is not sectioned.
    const long = syntheticList(30)
    expect(regroupForDisplay('assets', long, g)).toBe(long)
  })

  it('regroups from SECTION_MIN_ROWS visible rows up, and leaves one fewer alone', () => {
    const g = frozen('adult')
    // Do Anything and Surrender count as rows, so 11 table rows make 13.
    const enough = syntheticList(SECTION_MIN_ROWS - 2)
    const out = regroupForDisplay('activities', enough, g)
    expect(out).not.toBe(enough)
    expect(out.filter(isHeading).length).toBeGreaterThan(0)
    const tooFew = syntheticList(SECTION_MIN_ROWS - 3)
    expect(regroupForDisplay('activities', tooFew, g)).toBe(tooFew)
    // Hidden rows do not count towards the minimum.
    const hidden = syntheticList(SECTION_MIN_ROWS - 3).concat([action('extra.hidden', { visible: () => false })])
    expect(regroupForDisplay('activities', hidden, g)).toBe(hidden)
  })

  it('6. puts an unknown id in More, before the separator', () => {
    const g = frozen('adult')
    const data = [...activitiesMenu.children(g)]
    const stranger = action('brand.new.activity')
    data.splice(5, 0, stranger)
    const shown = regroupForDisplay('activities', data, g)
    const at = shown.indexOf(stranger)
    expect(at).toBeGreaterThan(-1)
    const moreHeading = shown.findIndex((n) => n.id === 'activities.h.more')
    expect(moreHeading).toBe(at - 1)
    expect(moreHeading).toBe(shown.findIndex((n) => n.id === 'activities.h.last') - 2)
    expect(shown[moreHeading]).toMatchObject({ type: 'heading', label: 'More' })
    // A row that names its own section goes there instead.
    const own = action('brand.new.travel', { section: 'travel' })
    const withOwn = regroupForDisplay('activities', [...data, own], g)
    const travel = withOwn.findIndex((n) => n.id === 'activities.h.travel')
    expect(withOwn.indexOf(own)).toBeGreaterThan(travel)
    expect(withOwn.indexOf(own)).toBeLessThan(withOwn.findIndex((n) => n.id === 'activities.h.fame'))
  })

  it('keeps leading info and heading rows on top, and an info row with the row before it', () => {
    const g = frozen('adult')
    const lead: MenuNode = { type: 'info', id: 'lead.info', text: 'Hello' }
    const lead2: MenuHeading = { type: 'heading', id: 'lead.h', label: 'Top' }
    const note: MenuNode = { type: 'info', id: 'doctor.note', text: 'After the doctor' }
    const data = activitiesMenu.children(g)
    const i = data.findIndex((n) => n.id === 'doctor')
    const list = [lead, lead2, ...data.slice(0, i + 1), note, ...data.slice(i + 1)]
    const shown = regroupForDisplay('activities', list, g)
    expect(shown.slice(0, 3).map((n) => n.id)).toEqual(['lead.info', 'lead.h', 'doAnything'])
    expect(shown[shown.findIndex((n) => n.id === 'doctor') + 1]).toBe(note)
  })

  it('7. keeps the data order itself: Do Anything, the rows sorted by label, Surrender', () => {
    for (const name of ['kid', 'adult', 'ceo', 'elder'] as const) {
      const list = activitiesMenu.children(frozen(name))
      const middle = list.slice(1, -1)
      const expected = ['doAnything', ...[...middle].sort((a, b) => (a as MenuAction).label.localeCompare((b as MenuAction).label)).map((n) => n.id), 'surrenderLife']
      expect(list.map((n) => n.id), name).toEqual(expected)
      expect(list.some(isHeading), `${name}: the data list has no headings`).toBe(false)
    }
  })
})

describe('the sectioned list as markup', () => {
  it('8. renders eight headings, and the separator opens a card with no title', () => {
    const { g, shown } = adultList()
    const html = renderToStaticMarkup(createElement(MenuRows, { nodes: shown, g, onTap: () => {} }))
    expect(html.match(/class="menu-heading"/g)).toHaveLength(8)
    for (const s of SECTION_ORDER.filter((x) => x !== 'more')) expect(html).toContain(`<div class="menu-heading">${SECTION_LABEL[s]}</div>`)
    const cards = html.split('<section class="menu-section">').slice(1)
    // The top card holds Do Anything alone, then the eight sectioned cards, then Surrender alone.
    expect(cards).toHaveLength(10)
    expect(cards[0]!.startsWith('<div class="menu-list">')).toBe(true)
    expect(cards[0]!.match(/<button/g)).toHaveLength(1)
    const last = cards[cards.length - 1]!
    expect(last.startsWith('<div class="menu-list">')).toBe(true)
    expect(last).not.toContain('menu-heading')
    expect(last.match(/<button/g)).toHaveLength(1)
    expect(last).toContain('Surrender')
  })

  it('9. the N1 lint treats activities as sectioned, and the baseline does not list it', () => {
    expect(KIT_SECTIONED_ROOTS).toBe(SECTIONED_ROOTS)
    const g = navState('adult')
    const rows = activitiesMenu.children(g).filter((n) => isRow(n) && nodeVisible(n, g)).length
    expect(rows, 'the exemption is needed: more than 12 rows and no heading in the data').toBeGreaterThan(12)
    expect(lintOf(walkTreeCached('adult')).tooLong).not.toContain('activities')
    const baseline = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/nav-lint-baseline.json', import.meta.url)), 'utf8')) as { tooLong: string[]; single: string[] }
    expect(baseline.tooLong).not.toContain('activities')
    expect(baseline.single).not.toContain('activities')
  })
})
