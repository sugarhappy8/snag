// R1-C13: chart rows in menus and the Books group on the company screen.
//   - chartInfo (src/game/charts): the one way a menu adds a chart row; nothing at all while chartKit is off
//   - infoChart (menuModel): reads a node's chart safely, like infoText reads its text
//   - MenuRows: an info node with a valid chart draws the chart, with its text as the loading and failure state
//   - booksMenu (src/game/business/books-menu.ts): "Books and Charts", seven chart rows on every company screen
// Flags are always set with withFlags, so the lead's release flip cannot change what these tests mean. The company screen
// is read both ways: the flat list (cockpits pinned off, v4.0.2's shape) and the screen a player gets with the cockpits on,
// where the Money tile holds the rows after the "Money" heading and each tile is opened in place (see companyList).
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { businessAssetView } from '../src/game/business'
import { booksMenu } from '../src/game/business/books-menu'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { businessAssets, readBiz } from '../src/game/business/state'
import { chartInfo, moneyLabel } from '../src/game/charts'
import { readChartSpec, type ChartSpec } from '../src/game/charts/spec'
import { withFlags } from '../src/game/flags'
import { hubIds } from '../src/game/hubs/company'
import { migrateSave } from '../src/game/save-schema'
import type { Asset, GameState, MenuAction, MenuGroup, MenuInfo, MenuNode } from '../src/game/types'
import { getCountry } from '../src/game/world'
import { infoChart, infoText, nodeSubtitle } from '../src/ui/components/menuModel'
import { deepFreeze, ownerGame, statementSamples } from './charts-kit'
import { makeTestGame, openTiles } from './helpers'

// The store is mocked the way test/annualReport.test.ts does it: MenuRows only needs getApp and runMenuAction.
const mock = vi.hoisted(() => ({ state: { game: null as unknown } }))
vi.mock('../src/ui/store', () => ({
  useApp: (sel: (s: typeof mock.state) => unknown) => sel(mock.state),
  getApp: () => mock.state,
  runMenuAction: () => {},
}))

const CITY = getCountry('us').cities[0]!
const DASHES = new RegExp('[' + String.fromCharCode(0x2013) + String.fromCharCode(0x2014) + ']')

/** A chart spec the reader accepts: three years of profit. */
function lineSpec(over: Partial<ChartSpec> = {}): ChartSpec {
  return {
    v: 1,
    kind: 'line',
    title: 'Profit by year',
    unit: 'money',
    x: [2030, 2031, 2032],
    series: [{ id: 'net', label: 'Net profit', tone: 'c1', values: [10, 20, 15] }],
    basis: 2030,
    summary: 'Net profit rose to $15 in 2032.',
    ...over,
  }
}

/**
 * The company screen as one flat list. With the cockpits on the tiles (ids `hub.`) hold the rows of the old list in the old
 * order, so each tile is opened in place; with them off the list is already flat. Built inside withFlags, because a tile
 * asks the latest state for its rows when it is opened.
 */
function companyList(g: GameState, a: Asset, flags: { chartKit: boolean; cockpits: boolean }): MenuNode[] {
  return withFlags(flags, () => openTiles(g, businessAssetView(g, a)))
}

function expectValid(spec: ChartSpec | null): asserts spec is ChartSpec {
  expect(spec).not.toBeNull()
  expect(readChartSpec(spec)).not.toBeNull()
}

const isInfo = (n: MenuNode): n is MenuInfo => n.type === 'info'

/** The rows of a company's Books group with the chart flag on. */
function booksRows(g: GameState, a: Asset): MenuInfo[] {
  return withFlags({ chartKit: true }, () => booksMenu(a).children(g)).filter(isInfo)
}

/** The text of an info row, read the way the menu reads it. */
function textOf(n: MenuInfo, g: GameState): string {
  return infoText(n, g)
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')
}

let errors: MockInstance<typeof console.error>
beforeEach(() => {
  errors = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  errors.mockRestore()
})

// ---------------------------------------------------------------------------
// One owner-run company with 8 years, one hired-CEO company beside it (read-only in every test below)

let owned: ReturnType<typeof ownerGame>
beforeAll(() => {
  owned = ownerGame({ seed: 1, years: 8, companies: 2 })
})

const ROW_KEYS = ['pl', 'bridge', 'profit', 'costs', 'cash', 'cashlines', 'share'] as const

// ---------------------------------------------------------------------------
// 1. The flag

describe('the chartKit flag', () => {
  it('chartInfo returns nothing with the flag off and one info node with it on', () => {
    const build = vi.fn(() => lineSpec())
    expect(withFlags({ chartKit: false }, () => chartInfo('x.chart', 'E', 'words', build))).toEqual([])
    expect(build).not.toHaveBeenCalled()
    const on = withFlags({ chartKit: true }, () => chartInfo('x.chart', 'E', 'words', build))
    expect(on).toHaveLength(1)
    const node = on[0]!
    expect(node.type).toBe('info')
    expect(node.id).toBe('x.chart')
    expect(node.emoji).toBe('E')
    expect(node.text).toBe('words')
    expect(typeof node.chart).toBe('function')
    expect(build).not.toHaveBeenCalled()
  })

  it('reads the flag when the rows are asked for, not when the module loads', () => {
    expect(withFlags({ chartKit: true }, () => chartInfo('x', 'E', 't', () => null))).toHaveLength(1)
    expect(withFlags({ chartKit: false }, () => chartInfo('x', 'E', 't', () => null))).toHaveLength(0)
    expect(withFlags({ chartKit: true }, () => chartInfo('x', 'E', 't', () => null))).toHaveLength(1)
  })

  for (const cockpits of [false, true]) {
    it(`leaves the company screen alone with the flag off, and adds one group after Why Profit Changed with it on (cockpits ${cockpits ? 'on' : 'off'})`, () => {
      const { g, a } = owned
      const off = companyList(g, a, { chartKit: false, cockpits })
      const on = companyList(g, a, { chartKit: true, cockpits })
      const offIds = off.map((n) => n.id)
      const onIds = on.map((n) => n.id)
      expect(offIds.filter((id) => id.startsWith('biz.books.'))).toEqual([])
      const books = on.filter((n) => n.id.startsWith('biz.books.'))
      expect(books).toHaveLength(1)
      expect(books[0]!.id).toBe(`biz.books.${a.id}`)
      expect(books[0]!.type).toBe('menu')
      expect(onIds.indexOf(`biz.books.${a.id}`)).toBe(onIds.indexOf(`biz.economicReport.${a.id}`) + 1)
      expect(onIds.indexOf(`biz.economicReport.${a.id}`)).toBeGreaterThan(-1)
      expect(onIds.filter((id) => id !== `biz.books.${a.id}`)).toEqual(offIds)
    })
  }

  it('puts the group inside the Money tile when the cockpits are on, and at the top level when they are off', () => {
    const { g, a } = owned
    const h = hubIds(a.id)
    const tileHas = (flags: { chartKit: boolean; cockpits: boolean }, tile: string): string[] =>
      withFlags(flags, () => {
        const group = businessAssetView(g, a).find((n) => n.id === tile)
        return group && group.type === 'menu' ? group.children(g).map((n) => n.id) : []
      })
    expect(tileHas({ chartKit: true, cockpits: true }, h.money)).toContain(`biz.books.${a.id}`)
    expect(tileHas({ chartKit: false, cockpits: true }, h.money)).not.toContain(`biz.books.${a.id}`)
    const top = (flags: { chartKit: boolean; cockpits: boolean }): string[] => withFlags(flags, () => businessAssetView(g, a).map((n) => n.id))
    expect(top({ chartKit: true, cockpits: true })).not.toContain(`biz.books.${a.id}`)
    expect(top({ chartKit: true, cockpits: false })).toContain(`biz.books.${a.id}`)
  })

  it('shows the group for a hired-CEO company too', () => {
    const { g, others } = owned
    const hired = others[0]!
    for (const cockpits of [false, true]) {
      const ids = companyList(g, hired, { chartKit: true, cockpits }).map((n) => n.id)
      expect(ids.indexOf(`biz.books.${hired.id}`), `cockpits ${cockpits}`).toBe(ids.indexOf(`biz.economicReport.${hired.id}`) + 1)
      expect(ids.indexOf(`biz.books.${hired.id}`), `cockpits ${cockpits}`).toBeGreaterThan(0)
    }
  })

  it('serves every industry: one group on each company screen, and rows that build without a throw', () => {
    const samples = statementSamples([1])
    expect(samples.length).toBeGreaterThanOrEqual(50)
    for (const { industry, g, a } of samples) {
      const ids = companyList(g, a, { chartKit: true, cockpits: true }).map((n) => n.id)
      expect(ids.indexOf(`biz.books.${a.id}`), industry).toBe(ids.indexOf(`biz.economicReport.${a.id}`) + 1)
      expect(ids.indexOf(`biz.books.${a.id}`), industry).toBeGreaterThan(0)
      const rows = booksRows(g, a)
      expect(rows.length, industry).toBeGreaterThan(0)
      for (const row of rows) {
        expect(textOf(row, g).length, `${industry} ${row.id}`).toBeGreaterThan(0)
        const spec = infoChart(row, g)
        if (spec) expectValid(spec)
      }
    }
    expect(errors).not.toHaveBeenCalled()
  }, 120_000)
})

// ---------------------------------------------------------------------------
// 2. The rows of the group

describe('booksMenu', () => {
  it('is a menu group with the plan id, label and emoji', () => {
    const { g, a } = owned
    const group = booksMenu(a)
    expect(group.type).toBe('menu')
    expect(group.id).toBe(`biz.books.${a.id}`)
    expect(group.label).toBe('Books and Charts')
    expect(group.emoji).toBe('\u{1F4CA}')
    expect(typeof group.children).toBe('function')
    expect(g.assets).toContain(a)
  })

  it('shows the year and the net profit when the company has a statement', () => {
    const { g, a } = owned
    const b = readBiz(g, a)
    expect(b.last).toBeTruthy()
    expect(nodeSubtitle(booksMenu(a), g)).toBe(`${b.last!.year} net profit ${moneyLabel(g, b.last!.net)}`)
  })

  it('says when the books will fill in, for a company with no booked year', () => {
    const g = makeTestGame()
    const b0 = newBiz(g, 'restaurant', 'us', CITY, { cash: 1_000_000, founded: g.year })
    const a = createBusinessAsset(g, 'restaurant', b0, 100_000)
    g.assets.push(a)
    expect(readBiz(g, a).last).toBeFalsy()
    expect(nodeSubtitle(booksMenu(a), g)).toBe('Fills in after the first full year')
    const kids = withFlags({ chartKit: true }, () => booksMenu(a).children(g))
    expect(kids).toHaveLength(1)
    const only = kids[0] as MenuInfo
    expect(only.type).toBe('info')
    expect(infoText(only, g)).toBe('The books fill in after the first full year.')
    expect(only.chart).toBeUndefined()
  })

  it('gives nothing for a company that is gone', () => {
    const g = structuredClone(owned.g)
    const a = owned.a
    g.assets = g.assets.filter((x) => x.id !== a.id)
    expect(withFlags({ chartKit: true }, () => booksMenu(a).children(g))).toEqual([])
    expect(nodeSubtitle(booksMenu(a), g)).toBe('Fills in after the first full year')
  })

  it('returns the seven chart rows in order, with stable unique ids, on a frozen state, and draws no random number', () => {
    for (const [name, pick] of [['owner-run', owned.a], ['hired CEO', owned.others[0]!]] as const) {
      const g = deepFreeze(structuredClone(owned.g))
      const rng = g.rng
      const a = g.assets.find((x) => x.id === pick.id)!
      const one = booksRows(g, a)
      const two = booksRows(g, a)
      const ids = one.map((n) => n.id)
      expect(ids, name).toEqual(ROW_KEYS.map((k) => `biz.books.${k}.${a.id}`))
      expect(new Set(ids).size, name).toBe(ids.length)
      expect(two.map((n) => n.id), name).toEqual(ids)
      for (const row of one) {
        const text = textOf(row, g)
        expect(text.length, `${name} ${row.id}`).toBeGreaterThan(0)
        expect(text.length, `${name} ${row.id}`).toBeLessThanOrEqual(120)
        expect(text, `${name} ${row.id}`).not.toMatch(DASHES)
        const spec = infoChart(row, g)
        if (spec) expectValid(spec)
        // The text is the spec's summary when there is a spec.
        if (spec) expect(text, `${name} ${row.id}`).toBe(spec.summary)
      }
      expect(g.rng, name).toBe(rng)
    }
    expect(errors).not.toHaveBeenCalled()
  })

  it('draws every chart for the owner-run company with eight years', () => {
    const { g, a } = owned
    const rows = booksRows(g, a)
    const specs = rows.map((r) => infoChart(r, g))
    specs.forEach((s) => expectValid(s))
    const kinds = specs.map((s) => s!.kind)
    expect(kinds).toEqual(['waterfall', 'waterfall', 'line', 'stack', 'waterfall', 'line', 'line'])
  })

  it('draws the P&L, the history and the cash charts for the hired-CEO company', () => {
    const { g, others } = owned
    const rows = booksRows(g, others[0]!)
    const byKey = new Map(rows.map((r) => [r.id.split('.')[2], infoChart(r, g)]))
    for (const key of ['pl', 'profit', 'cashlines'] as const) expectValid(byKey.get(key) ?? null)
  })

  it('writes a plain sentence where a chart cannot be drawn yet', () => {
    const one = ownerGame({ seed: 2, years: 1 })
    const rows = booksRows(one.g, one.a)
    expect(rows).toHaveLength(7)
    const byKey = new Map(rows.map((r) => [r.id.split('.')[2]!, r]))
    expectValid(infoChart(byKey.get('pl')!, one.g))
    expect(infoChart(byKey.get('cash')!, one.g)).toBeNull()
    expect(infoText(byKey.get('cash')!, one.g)).toBe('The cash walk needs two booked years.')
    for (const key of ['bridge', 'profit', 'costs', 'cashlines', 'share']) {
      expect(infoChart(byKey.get(key)!, one.g), key).toBeNull()
      const text = infoText(byKey.get(key)!, one.g)
      expect(text.length, key).toBeGreaterThan(0)
      expect(text.length, key).toBeLessThanOrEqual(120)
      expect(text, key).not.toMatch(DASHES)
    }
  })

  it('gives no rows when the group is asked for with the flag off', () => {
    const { g, a } = owned
    expect(withFlags({ chartKit: false }, () => booksMenu(a).children(g))).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 4. infoChart

describe('infoChart', () => {
  const g = makeTestGame()
  const node = (chart?: MenuInfo['chart']): MenuInfo => ({ type: 'info', id: 'n.chart', text: 'words', ...(chart ? { chart } : {}) })

  it('is null for a node without a chart', () => {
    expect(infoChart(node(), g)).toBeNull()
  })

  it('returns the spec for a valid one', () => {
    const spec = infoChart(node(() => lineSpec()), g)
    expectValid(spec)
    expect(spec).toEqual(lineSpec())
  })

  it('is null when the builder has nothing to draw', () => {
    expect(infoChart(node(() => null), g)).toBeNull()
  })

  it('reports a builder that throws, and is null', () => {
    const boom = new Error('boom')
    const out = infoChart(
      node(() => {
        throw boom
      }),
      g,
    )
    expect(out).toBeNull()
    expect(errors).toHaveBeenCalledTimes(1)
    expect(String(errors.mock.calls[0]![0])).toContain('chart(n.chart)')
    expect(errors.mock.calls[0]![1]).toBe(boom)
  })

  it('is null for a spec that fails the reader, such as a NaN value', () => {
    const bad = lineSpec({ series: [{ id: 'net', label: 'Net profit', tone: 'c1', values: [10, Number.NaN, 15] }] })
    expect(infoChart(node(() => bad), g)).toBeNull()
    expect(infoChart(node(() => ({ ...lineSpec(), kind: 'pie' } as unknown as ChartSpec)), g)).toBeNull()
    expect(infoChart(node(() => 'nope' as unknown as ChartSpec), g)).toBeNull()
  })

  it('works on a frozen spec and a frozen state', () => {
    const frozen = deepFreeze(structuredClone(g))
    expectValid(infoChart(node(() => deepFreeze(lineSpec())), frozen))
  })
})

// ---------------------------------------------------------------------------
// 6. The memo

describe('chartInfo memo', () => {
  it('builds once for one game across the text and the chart', () => {
    const g = makeTestGame()
    const build = vi.fn(() => lineSpec())
    const node = withFlags({ chartKit: true }, () => chartInfo('m.chart', 'E', (_g, spec) => (spec ? spec.summary : 'nothing'), build))[0]!
    expect(infoText(node, g)).toBe(lineSpec().summary)
    expectValid(infoChart(node, g))
    expect(infoText(node, g)).toBe(lineSpec().summary)
    expectValid(infoChart(node, g))
    expect(build).toHaveBeenCalledTimes(1)
  })

  it('builds again for another game object, so a changed state is never read from the memo', () => {
    const g = makeTestGame()
    const other = structuredClone(g)
    let n = 0
    const build = vi.fn(() => lineSpec({ summary: `Build ${++n}.` }))
    const node = withFlags({ chartKit: true }, () => chartInfo('m.chart', 'E', (_g, spec) => spec?.summary ?? 'nothing', build))[0]!
    expect(infoText(node, g)).toBe('Build 1.')
    expect(infoChart(node, g)?.summary).toBe('Build 1.')
    expect(infoText(node, other)).toBe('Build 2.')
    expect(infoChart(node, other)?.summary).toBe('Build 2.')
    expect(infoChart(node, g)?.summary).toBe('Build 1.')
    expect(build).toHaveBeenCalledTimes(2)
  })

  it('keeps one memo for each node, so two rows with the same game never share a spec', () => {
    const g = makeTestGame()
    const rows = withFlags({ chartKit: true }, () => [
      ...chartInfo('a.chart', 'E', 'a', () => lineSpec({ summary: 'First.' })),
      ...chartInfo('b.chart', 'E', 'b', () => lineSpec({ summary: 'Second.' })),
    ])
    expect(infoChart(rows[0]!, g)?.summary).toBe('First.')
    expect(infoChart(rows[1]!, g)?.summary).toBe('Second.')
  })

  it('remembers a null result too', () => {
    const g = makeTestGame()
    const build = vi.fn((): ChartSpec | null => null)
    const node = withFlags({ chartKit: true }, () => chartInfo('m.chart', 'E', (_g, spec) => (spec ? 'chart' : 'plain words'), build))[0]!
    expect(infoText(node, g)).toBe('plain words')
    expect(infoChart(node, g)).toBeNull()
    expect(build).toHaveBeenCalledTimes(1)
  })

  it('reports a builder that throws once, builds it once, and keeps the row as plain words', () => {
    const g = makeTestGame()
    const build = vi.fn((): ChartSpec | null => {
      throw new Error('broken builder')
    })
    const node = withFlags({ chartKit: true }, () => chartInfo('m.chart', 'E', (_g, spec) => (spec ? 'chart' : 'plain words'), build))[0]!
    expect(infoText(node, g)).toBe('plain words')
    expect(infoChart(node, g)).toBeNull()
    expect(build).toHaveBeenCalledTimes(1)
    expect(errors).toHaveBeenCalledTimes(1)
    expect(String(errors.mock.calls[0]![0])).toContain('m.chart')
  })

  it('leaves a plain string text exactly as given', () => {
    const g = makeTestGame()
    const node = withFlags({ chartKit: true }, () => chartInfo('m.chart', 'E', 'Plain.', () => lineSpec()))[0]!
    expect(infoText(node, g)).toBe('Plain.')
  })
})

// ---------------------------------------------------------------------------
// 5. MenuRows

describe('MenuRows with a chart node', () => {
  let rows: typeof import('../src/ui/components/MenuList')
  let gate: typeof import('../src/ui/charts/lazy')
  let react: typeof import('react')
  let server: typeof import('react-dom/server')
  const g = makeTestGame()

  // A lazy view keeps its loaded module for the life of the process, so each test gets a fresh copy of the modules.
  beforeEach(async () => {
    vi.resetModules()
    gate = await import('../src/ui/charts/lazy')
    rows = await import('../src/ui/components/MenuList')
    react = await import('react')
    server = await import('react-dom/server')
  })

  const render = (nodes: MenuNode[]): string => server.renderToStaticMarkup(react.createElement(rows.MenuRows, { nodes, g, onTap: () => {} }))
  const info = (over: Partial<MenuInfo> = {}): MenuInfo => ({ type: 'info', id: 'row', emoji: '\u{1F4CA}', text: 'Net profit rose.', ...over })

  const PLAIN = (text: string): string =>
    `<section class="menu-section"><div class="menu-list"><div class="menu-info"><span class="menu-info-emoji">\u{1F4CA}</span><span>${text}</span></div></div></section>`

  it('shows the fallback text inside menu-info-chart before the chunk loads, and the chart after it', async () => {
    const nodes = [info({ chart: () => lineSpec() })]
    const before = render(nodes)
    expect(before).toBe('<section class="menu-section"><div class="menu-list"><div class="menu-info menu-info-chart"><span>Net profit rose.</span></div></div></section>')
    expect(before).not.toContain('ch-frame')
    expect(gate.ChartViewLazy.isReady()).toBe(false)
    expect(await gate.ChartViewLazy.preload()).toBe(true)
    const after = render(nodes)
    expect(after).toContain('<div class="menu-info menu-info-chart"><figure class="ch-frame"')
    expect(after).toContain('class="ch-title">Profit by year</h4>')
    expect(after).not.toContain('<span>Net profit rose.</span>')
  })

  it('renders a node with no chart exactly as it always did', async () => {
    const plain = render([info()])
    expect(plain).toBe(PLAIN('Net profit rose.'))
    expect(render([info({ chart: () => null })])).toBe(plain)
    expect(render([info({ chart: undefined })])).toBe(plain)
    await gate.ChartViewLazy.preload()
    expect(render([info({ chart: () => null })])).toBe(plain)
  })

  it('treats a chart that fails the reader, or throws, as no chart', async () => {
    await gate.ChartViewLazy.preload()
    const bad = lineSpec({ series: [{ id: 'net', label: 'Net profit', tone: 'c1', values: [10, Number.NaN, 15] }] })
    expect(render([info({ chart: () => bad })])).toBe(PLAIN('Net profit rose.'))
    const out = render([
      info({
        chart: () => {
          throw new Error('boom')
        },
      }),
    ])
    expect(out).toBe(PLAIN('Net profit rose.'))
    expect(errors).toHaveBeenCalled()
  })

  it('still draws nothing for an empty text with no chart, and draws the chart for an empty text with one', async () => {
    expect(render([info({ text: '' })])).toBe('<div class="menu-empty">Nothing to do here right now.</div>')
    expect(render([info({ text: '', chart: () => null })])).toBe('<div class="menu-empty">Nothing to do here right now.</div>')
    await gate.ChartViewLazy.preload()
    const out = render([info({ text: '', chart: () => lineSpec() })])
    expect(out).toContain('menu-info-chart')
    expect(out).toContain('<figure class="ch-frame"')
  })

  it('keeps the neighbours of a chart row: the tappable rows, the headings and the plain info rows', async () => {
    const action: MenuAction = { type: 'action', id: 'act', label: 'Do it', emoji: 'A', run: () => {} }
    const group: MenuGroup = { type: 'menu', id: 'grp', label: 'Open it', emoji: 'G', children: () => [] }
    const out = render([{ type: 'heading', id: 'h', label: 'Books' }, info({ id: 'c', chart: () => lineSpec() }), info({ id: 'p', text: 'Plain row.' }), action, group])
    expect(out).toContain('<div class="menu-heading">Books</div>')
    expect(out).toContain('menu-info menu-info-chart')
    expect(out.indexOf('menu-info-chart')).toBeLessThan(out.indexOf('Plain row.'))
    expect(out).toContain('Plain row.')
    expect(out).toContain('Do it')
    expect(out).toContain('Open it')
  })
})

// ---------------------------------------------------------------------------
// 7. A company from a v4.0.2 save

describe('the v4.0.2 fixture', () => {
  it('renders text for every Books row of every company, and nothing throws', async () => {
    const raw = JSON.parse(gunzipSync(readFileSync('test/fixtures/save-v1.json.gz')).toString()) as Record<string, unknown>
    const result = migrateSave(structuredClone(raw))
    expect(result.kind).toBe('ready')
    if (result.kind !== 'ready') return
    const game = result.game
    const assets = businessAssets(game)
    expect(assets.length).toBeGreaterThan(0)
    vi.resetModules()
    const rows = await import('../src/ui/components/MenuList')
    const react = await import('react')
    const server = await import('react-dom/server')
    for (const a of assets) {
      const kids = booksRows(game, a)
      expect(kids.length, a.id).toBeGreaterThan(0)
      for (const kid of kids) {
        expect(textOf(kid, game).length, kid.id).toBeGreaterThan(0)
        const spec = infoChart(kid, game)
        if (spec) expectValid(spec)
      }
      const html = server.renderToStaticMarkup(react.createElement(rows.MenuRows, { nodes: kids, g: game, onTap: () => {} }))
      // Before the chart chunk loads (or with no chart at all) every row reads as its text.
      for (const kid of kids) expect(html, kid.id).toContain(escapeHtml(textOf(kid, game)))
    }
    expect(errors).not.toHaveBeenCalled()
  })
})
