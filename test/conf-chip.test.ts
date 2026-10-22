// R3-H7: the confidence chip. A menu row that carries `conf` (0 to 3) draws three dots, and one whose reading is two or more
// years old (`asOf`) adds "as of 2023". Nothing in the game sets `conf` yet (the Fog track does); this is the draw side.
//   - nodeConf (menuModel): the one safe reader of conf and asOf, like nodeSubtitle reads a subtitle
//   - ConfChip: the markup, its label for a screen reader
//   - MenuRows: info rows draw the chip after the text, action and group rows after the subtitle, chart rows draw none
// A row with no conf renders exactly as it did before: BASELINE below is the markup of the same nodes captured on v5.0.0.
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChartSpec } from '../src/game/charts/spec'
import type { GameState, MenuAction, MenuGroup, MenuInfo, MenuNode } from '../src/game/types'
import { makeTestGame } from './helpers'

// MenuRows only needs getApp and runMenuAction from the store; the real store pulls the whole game in.
vi.mock('../src/ui/store', () => ({
  useApp: (sel: (s: { game: unknown }) => unknown) => sel({ game: null }),
  getApp: () => ({ game: null }),
  runMenuAction: () => {},
}))

const { MenuRows } = await import('../src/ui/components/MenuList')
const { ConfChip, CONF_LABELS } = await import('../src/ui/components/ConfChip')
const { nodeConf } = await import('../src/ui/components/menuModel')

const DASHES = new RegExp('[' + String.fromCharCode(0x2013) + String.fromCharCode(0x2014) + ']')

const g: GameState = makeTestGame(1, { age: 30 })

const html = (nodes: MenuNode[], game: GameState = g): string => renderToStaticMarkup(createElement(MenuRows, { nodes, g: game, onTap: () => {} }))
const chip = (conf: unknown, asOf?: unknown): string => renderToStaticMarkup(createElement(ConfChip, { conf: conf as 0, asOf: asOf as number | undefined }))
/** The ids React gives a list differ by tree position only; the proof is about the rest of the markup. */
const plain = (s: string): string => s.replace(/data-roving="[^"]*"/g, 'data-roving="R"')

const info = (over: Partial<MenuInfo> = {}): MenuInfo => ({ type: 'info', id: 'i1', emoji: '\u{1F4CA}', text: 'Market size: about $4M', ...over })
const action = (over: Partial<MenuAction> = {}): MenuAction => ({ type: 'action', id: 'a1', label: 'Row action', emoji: '\u{1F4BC}', subtitle: 'Sub line', run: () => {}, ...over })
const group = (over: Partial<MenuGroup> = {}): MenuGroup => ({ type: 'menu', id: 'm1', label: 'Row menu', emoji: '\u{1F4C1}', subtitle: 'Menu sub', children: () => [], ...over })

/** The same four rows with no conf, as v5.0.0 drew them (captured before this task changed MenuList). */
const BASELINE =
  '<section class="menu-section"><div class="menu-heading">Numbers</div><div class="menu-list">' +
  '<div class="menu-info"><span class="menu-info-emoji">\u{1F4CA}</span><span>Market size: about $4M</span></div>' +
  '<div class="menu-info"><span>Plain info row</span></div>' +
  '<button type="button" class="menu-row" tabindex="0" data-roving="R"><span class="menu-row-icon" aria-hidden="true">\u{1F4BC}</span><span class="menu-row-text"><span class="menu-row-label">Row action</span><span class="menu-row-sub">Sub line</span></span><span class="menu-row-end" aria-hidden="true"></span></button>' +
  '<button type="button" class="menu-row" tabindex="-1" data-roving="R"><span class="menu-row-icon" aria-hidden="true">\u{1F4C1}</span><span class="menu-row-text"><span class="menu-row-label">Row menu</span><span class="menu-row-sub">Menu sub</span></span><span class="menu-row-end" aria-hidden="true"><span class="menu-row-chevron">›</span></span></button>' +
  '</div></section>'

const BASE_NODES = (): MenuNode[] => [
  { type: 'heading', id: 'h', label: 'Numbers' },
  info(),
  { type: 'info', id: 'i2', text: 'Plain info row' },
  action(),
  group(),
]

const filled = (s: string): number => (s.match(/<i class="on"><\/i>/g) ?? []).length
const dots = (s: string): number => (s.match(/<i[ >]/g) ?? []).length
const chipsIn = (s: string): number => (s.match(/class="conf-chip"/g) ?? []).length

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ConfChip', () => {
  it('draws three dots, as many filled as the confidence, and the label for a screen reader', () => {
    for (const conf of [0, 1, 2, 3] as const) {
      const out = chip(conf)
      expect(dots(out), `conf ${conf}`).toBe(3)
      expect(filled(out), `conf ${conf}`).toBe(conf)
      expect(out).toContain('class="conf-chip"')
      expect(out).toContain('role="img"')
      expect(out).toContain(`aria-label="Confidence: ${CONF_LABELS[conf]}"`)
      expect(out).not.toContain('conf-asof')
    }
    expect(CONF_LABELS).toEqual(['a rough guess', 'a fair estimate', 'a good estimate', 'close to exact'])
  })

  it('puts the filled dots first', () => {
    expect(chip(2)).toContain('<i class="on"></i><i class="on"></i><i></i>')
    expect(chip(0)).toContain('<i></i><i></i><i></i>')
  })

  it('adds the year to the words and to the label when it has one', () => {
    const out = chip(2, 2023)
    expect(out).toContain('<span class="conf-asof">as of 2023</span>')
    expect(out).toContain('aria-label="Confidence: a good estimate, as of 2023"')
  })

  it('draws nothing for a confidence it cannot read, and never throws', () => {
    for (const bad of [7, 4, -1, 1.5, '2', NaN, Infinity, null, undefined, {}, [2]]) expect(chip(bad), String(bad)).toBe('')
    expect(chip(2, NaN)).not.toContain('conf-asof')
    expect(chip(2, 'soon')).not.toContain('conf-asof')
  })
})

describe('nodeConf', () => {
  it('reads an integer confidence 0 to 3 and nothing else', () => {
    for (const conf of [0, 1, 2, 3] as const) expect(nodeConf(info({ conf }), g)).toEqual({ conf, asOf: null })
    for (const bad of [7, 4, -1, 1.5, '2', NaN, Infinity, null, {}, [2]]) {
      expect(nodeConf(info({ conf: bad as 0 }), g), String(bad)).toBeNull()
    }
    expect(nodeConf(info(), g)).toBeNull()
    expect(nodeConf(action(), g)).toBeNull()
    expect(nodeConf(group({ conf: 9 as 0 }), g)).toBeNull()
  })

  it('shows the year of a reading only when it is two or more years old', () => {
    expect(nodeConf(info({ conf: 2, asOf: g.year }), g)).toEqual({ conf: 2, asOf: null })
    expect(nodeConf(info({ conf: 2, asOf: g.year - 1 }), g)).toEqual({ conf: 2, asOf: null })
    expect(nodeConf(info({ conf: 2, asOf: g.year - 2 }), g)).toEqual({ conf: 2, asOf: g.year - 2 })
    expect(nodeConf(info({ conf: 1, asOf: g.year - 9 }), g)).toEqual({ conf: 1, asOf: g.year - 9 })
    expect(nodeConf(action({ conf: 3, asOf: g.year - 4 }), g)).toEqual({ conf: 3, asOf: g.year - 4 })
    expect(nodeConf(group({ conf: 0, asOf: g.year - 4 }), g)).toEqual({ conf: 0, asOf: g.year - 4 })
  })

  it('refuses a reading from a year that has not happened (no foresight) and a year that is not a whole number', () => {
    for (const bad of [g.year + 1, g.year + 30, NaN, g.year - 2.5, '2020', Infinity]) {
      expect(nodeConf(info({ conf: 2, asOf: bad as number }), g), String(bad)).toBeNull()
    }
  })

  it('survives a node whose fields throw', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const node = info()
    Object.defineProperty(node, 'conf', {
      get() {
        throw new Error('boom')
      },
    })
    expect(nodeConf(node, g)).toBeNull()
    expect(errors).toHaveBeenCalled()
  })
})

describe('MenuRows', () => {
  it('draws rows with no conf exactly as v5.0.0 did', () => {
    expect(plain(html(BASE_NODES()))).toBe(BASELINE)
    expect(chipsIn(html(BASE_NODES()))).toBe(0)
  })

  it('draws an invalid conf, or a future asOf, as the row with no conf, and does not throw', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const bad of [7, '2', NaN, -1]) {
      const nodes = BASE_NODES().map((n) => (n.type === 'heading' ? n : { ...n, conf: bad as 0 }))
      expect(plain(html(nodes)), String(bad)).toBe(BASELINE)
    }
    const future = BASE_NODES().map((n) => (n.type === 'heading' ? n : { ...n, conf: 2 as const, asOf: g.year + 3 }))
    expect(plain(html(future))).toBe(BASELINE)
  })

  it('draws the chip after the text of an info row', () => {
    const out = html([info({ conf: 2 })])
    expect(out).toContain('<span>Market size: about $4M</span>' + chip(2) + '</div>')
    expect(filled(out)).toBe(2)
    expect(out).toContain('menu-info-emoji')
  })

  it('draws it after the subtitle of an action row and of a group row, before the talent hint', () => {
    const a = html([action({ conf: 1 })])
    expect(a).toContain('<span class="menu-row-sub">Sub line</span>' + chip(1) + '</span>')
    expect(a).toContain('<span class="menu-row-end" aria-hidden="true"></span>')
    const m = html([group({ conf: 3 })])
    expect(m).toContain('<span class="menu-row-sub">Menu sub</span>' + chip(3) + '</span>')
    expect(m).toContain('menu-row-chevron')
    const hinted = html([action({ conf: 2, hint: () => 'Semiconductors are heating up.' })])
    expect(hinted.indexOf('conf-chip')).toBeGreaterThan(hinted.indexOf('menu-row-sub'))
    expect(hinted.indexOf('conf-chip')).toBeLessThan(hinted.indexOf('menu-row-hint'))
  })

  it('draws the chip on a row with no subtitle too', () => {
    const out = html([action({ subtitle: undefined, conf: 2 })])
    expect(out).toContain('<span class="menu-row-label">Row action</span>' + chip(2) + '</span>')
  })

  it('adds "as of" only for a reading two or more years old', () => {
    expect(html([info({ conf: 2, asOf: g.year })])).not.toContain('as of')
    expect(html([info({ conf: 2, asOf: g.year - 1 })])).not.toContain('as of')
    const old = html([info({ conf: 2, asOf: g.year - 2 }), action({ conf: 1, asOf: g.year - 6 })])
    expect(old).toContain(`as of ${g.year - 2}`)
    expect(old).toContain(`as of ${g.year - 6}`)
    expect(chipsIn(old)).toBe(2)
  })

  it('draws no chip on a chart row, and none on a row with nothing to say', () => {
    const spec: ChartSpec = {
      v: 1,
      kind: 'line',
      title: 'Profit by year',
      unit: 'money',
      x: [2030, 2031, 2032],
      series: [{ id: 'net', label: 'Net profit', tone: 'c1', values: [10, 20, 15] }],
      basis: 2030,
      summary: 'Net profit rose to $15 in 2032.',
    }
    const out = html([info({ conf: 2, asOf: g.year - 3, chart: () => spec }), info({ id: 'empty', text: '', conf: 3 })])
    expect(out).not.toContain('conf-chip')
    expect(out).toContain('menu-info-chart')
  })

  it('keeps the chip out of the end slot (that slot is aria-hidden)', () => {
    const out = html([action({ conf: 2 }), group({ id: 'm2', conf: 2 })])
    // Each row is one button: its end slot is the last span before the closing tag.
    const slots = out.split('<span class="menu-row-end" aria-hidden="true">').slice(1).map((part) => part.slice(0, part.indexOf('</button>')))
    expect(slots).toHaveLength(2)
    for (const slot of slots) expect(slot).not.toContain('conf-chip')
    expect(chipsIn(out)).toBe(2)
  })

  it('has no dash characters in the chip, its labels or its styles', () => {
    expect(chip(3, 2020)).not.toMatch(DASHES)
    for (const label of CONF_LABELS) expect(label).not.toMatch(DASHES)
    for (const file of ['../src/ui/components/ConfChip.tsx', '../src/ui/styles/nav.css']) {
      const text = readFileSync(new URL(file, import.meta.url), 'utf8')
      const chipPart = file.endsWith('.css') ? text.slice(text.indexOf('.conf-chip')) : text
      expect(chipPart, file).not.toMatch(DASHES)
    }
  })
})

describe('styles', () => {
  const css = readFileSync(new URL('../src/ui/styles/nav.css', import.meta.url), 'utf8')
  const rule = (selector: string): string => {
    const at = css.indexOf('\n' + selector + ' {')
    expect(at, selector).toBeGreaterThanOrEqual(0)
    return css.slice(at, css.indexOf('}', at))
  }

  it('fills the dots with the action blue, empties them with the border colour and sets the words in muted 12px', () => {
    expect(rule('.conf-chip i.on')).toContain('var(--action-blue)')
    expect(rule('.conf-chip i')).toContain('var(--border)')
    expect(rule('.conf-chip')).toContain('var(--muted)')
    expect(rule('.conf-chip')).toContain('font-size: 12px')
  })
})
