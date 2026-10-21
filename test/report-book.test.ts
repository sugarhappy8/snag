// R1-C11: the Annual Report 2.0 book (src/ui/charts/ReportBook.tsx, src/ui/minigames/bookModel.ts and the hunks in
// AnnualReport.tsx, ModalHost.tsx, lazy.tsx and business.css). The book is driven by the report data's `chart`, so
// nothing here depends on a flag: the one case that builds a real `chart` turns annualReport2 on with withFlags. The
// store is mocked the way test/annualReport.test.ts mocks it, and the lazy book is rendered after `await preload()`,
// the pattern of test/lazy-view-mount.test.ts. The visual check at 390 x 844 is R1-C16.
import { readFileSync } from 'node:fs'
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { bizOf } from '../src/game/business/state'
import { toJson } from '../src/game/business/util'
import { reportData } from '../src/game/business/yearly'
import { bindMoneyContext, moneyDisplay, setMoneyDisplay } from '../src/game/core'
import type { StripRow } from '../src/game/charts/books'
import { readReportCharts, type ReportCharts } from '../src/game/charts/report'
import type { ChartSpec } from '../src/game/charts/spec'
import { resetFlags, withFlags } from '../src/game/flags'
import type { Json, MinigameModal } from '../src/game/types'
import type { ReportBookProps } from '../src/ui/charts/ReportBook'
import type { BookHead, BookTab } from '../src/ui/minigames/bookModel'
import { countSvgNodes, ownerGame } from './charts-kit'
import { makeTestGame } from './helpers'

const mock = vi.hoisted(() => ({ state: { game: null as unknown } }))

vi.mock('../src/ui/store', () => ({
  useApp: (sel: (s: typeof mock.state) => unknown) => sel(mock.state),
  getApp: () => mock.state,
  runMenuAction: () => {},
}))

const model = await import('../src/ui/minigames/bookModel')
const { BOOK_TABS, TAB_LABELS, TAB_NAMES, isBook, missingNote, tabKey } = model
const { ReportBook } = await import('../src/ui/charts/ReportBook')
const { LazyReportBook } = await import('../src/ui/charts/lazy')
const { AnnualReport, readReportData, planResult, SKIP_RESULT } = await import('../src/ui/minigames/AnnualReport')
const { ModalHost } = await import('../src/ui/components/ModalHost')

afterEach(() => {
  resetFlags()
})

/** The en dash and the em dash, spelled by code so this file holds neither (docs/VOICE.md). */
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)

// ---------------------------------------------------------------------------
// Fixtures: a small report book by hand (so the cases do not depend on a seed), and the data of a real company below

const YEARS = [2027, 2028, 2029, 2030, 2031]

function tile(title: string, values: number[], note: string): ChartSpec {
  return {
    v: 1,
    kind: 'kpi',
    title,
    unit: 'money',
    x: YEARS,
    series: [{ id: title.toLowerCase().replace(/\s+/g, '-'), label: title, tone: 'c1', values }],
    basis: 2031,
    note,
    summary: `${title} was ${values[values.length - 1]}.`,
  }
}

function waterfall(title: string, steps: { label: string; value: number; kind: 'total' | 'delta' }[], note?: string): ChartSpec {
  return { v: 1, kind: 'waterfall', title, unit: 'money', x: [], series: [], steps, ...(note ? { note } : {}), summary: `${title}.` }
}

function line(title: string, unit: ChartSpec['unit'], series: { id: string; label: string; values: number[] }[]): ChartSpec {
  return {
    v: 1,
    kind: 'line',
    title,
    unit,
    x: YEARS,
    series: series.map((s, i) => ({ id: s.id, label: s.label, tone: i === 0 ? 'c1' : 'c2', values: s.values })),
    ...(unit === 'money' ? { basis: 2031 } : {}),
    summary: `${title}.`,
  }
}

const PL_STEPS = [
  { label: 'Sales after tax', value: 9_600_000, kind: 'total' as const },
  { label: 'Materials', value: -3_900_000, kind: 'delta' as const },
  { label: 'Wages', value: -2_200_000, kind: 'delta' as const },
  { label: 'Premises', value: -1_200_000, kind: 'delta' as const },
  { label: 'Profit before tax', value: 2_300_000, kind: 'total' as const },
  { label: 'Corporate tax', value: -500_000, kind: 'delta' as const },
  { label: 'Net profit', value: 1_800_000, kind: 'total' as const },
]

const FULL: ReportCharts = {
  v: 1,
  year: 2031,
  basis: 2031,
  verdict: 'Net profit rose $310K from 2030.',
  kpis: [
    tile('Net profit', [900_000, 1_000_000, 1_100_000, 1_490_000, 1_800_000], 'up $310K'),
    tile('Sales', [8_100_000, 8_600_000, 9_000_000, 9_400_000, 9_800_000], 'up 4.3%'),
    tile('Cash', [1_000_000, 1_400_000, 1_700_000, 1_900_000, 2_100_000], 'Debt $400K'),
    tile('Value', [9_000_000, 10_000_000, 11_000_000, 12_500_000, 14_000_000], '#3 of 9'),
  ],
  summary: waterfall('Where the sales went', [
    PL_STEPS[0]!,
    PL_STEPS[1]!,
    PL_STEPS[2]!,
    { label: 'Everything else', value: -1_700_000, kind: 'delta' },
    PL_STEPS[6]!,
  ]),
  pl: waterfall('Profit and loss, 2031', PL_STEPS),
  bridge: waterfall('Why profit changed', [
    { label: 'Net profit 2030', value: 1_490_000, kind: 'total' },
    { label: 'More sales', value: 400_000, kind: 'delta' },
    { label: 'Higher wages', value: -90_000, kind: 'delta' },
    { label: 'Net profit 2031', value: 1_800_000, kind: 'total' },
  ]),
  profit: line('Net profit by year', 'money', [{ id: 'net', label: 'Net profit', values: [900_000, 1_000_000, 1_100_000, 1_490_000, 1_800_000] }]),
  costs: {
    ...line('Costs as a share of sales', 'pct', [
      { id: 'materials', label: 'Materials', values: [0.4, 0.4, 0.41, 0.4, 0.4] },
      { id: 'people', label: 'People', values: [0.2, 0.22, 0.22, 0.23, 0.22] },
    ]),
    kind: 'stack',
    note: 'Cost detail starts in 2028.',
  },
  cash: waterfall(
    'Where the cash went, 2031',
    [
      { label: 'Cash at the start', value: 1_900_000, kind: 'total' },
      { label: 'Net profit', value: 1_800_000, kind: 'delta' },
      { label: 'Everything else', value: -1_600_000, kind: 'delta' },
      { label: 'Cash now', value: 2_100_000, kind: 'total' },
    ],
    "Moves the books don't name yet sit in everything else.",
  ),
  cashLines: line('Cash and debt', 'money', [
    { id: 'cash', label: 'Cash', values: [1_000_000, 1_400_000, 1_700_000, 1_900_000, 2_100_000] },
    { id: 'debt', label: 'Debt', values: [600_000, 500_000, 500_000, 450_000, 400_000] },
  ]),
  share: line('Share of the market', 'pct', [
    { id: 'you', label: 'You', values: [0.08, 0.09, 0.1, 0.11, 0.12] },
    { id: 'leader', label: 'Leader', values: [0.2, 0.2, 0.19, 0.19, 0.18] },
  ]),
  ladder: {
    v: 1,
    kind: 'ladder',
    title: 'Who leads the market',
    unit: 'pct',
    x: [],
    series: [],
    rows: [
      { id: 'a', name: 'Big Noodle', value: 0.18, rank: 1, prevRank: 1, prev: 0.19, spark: [0.2, 0.19, 0.18] },
      { id: 'b', name: 'Soup Co', value: 0.14, rank: 2, prevRank: 3, prev: 0.12, spark: [0.12, 0.14] },
      { id: 'you', name: 'Ramen Rocket', value: 0.12, rank: 3, prevRank: 4, prev: 0.11, spark: [0.1, 0.11, 0.12], you: true },
    ],
    summary: 'You are third with 12%.',
  },
  size: line('Market size', 'money', [{ id: 'size', label: 'Market size', values: [50_000_000, 52_000_000, 55_000_000, 56_000_000, 60_000_000] }]),
}

/** Only what every report has: the summary, the profit and loss, and no tiles. */
const THIN: ReportCharts = { v: 1, year: 2031, basis: 2031, verdict: '', kpis: [], summary: FULL.summary, pl: FULL.pl }

const LINES = [
  { label: 'Revenue', value: '$228,000', tone: 'good' as const },
  { label: 'Cost of goods', value: '-$76,800', tone: 'bad' as const },
  { label: 'Units sold', value: '24,000', tone: 'neutral' as const },
  { label: 'Net profit', value: '$41,500', tone: 'good' as const },
]

const HEAD: BookHead = {
  businessName: 'Ramen Rocket',
  emoji: '🍜',
  year: 2031,
  industryLabel: 'Restaurant',
  location: 'Osaka, Japan',
  marketNote: 'Osaka eats out more than anywhere in Japan; rents near the station are brutal.',
  lines: LINES,
}

const PLAN: ReactNode = createElement('section', { className: 'plan-stub' }, createElement('input', { type: 'range', className: 'ar-range', readOnly: true }))
const ACTIONS: ReactNode = createElement(
  'div',
  { className: 'ar-actions' },
  createElement('button', { type: 'button' }, 'Approve plan'),
  createElement('button', { type: 'button' }, "Keep last year's plan"),
)

const STRIP: StripRow[] = [
  { id: 'a', name: 'Ramen Rocket', emoji: '🍜', net: 1_800_000, delta: 310_000, spark: [900_000, 1_000_000, 1_490_000, 1_800_000], managed: false },
  { id: 'b', name: 'Bolt Bikes', emoji: '🚲', net: -250_000, delta: -400_000, spark: [150_000, -250_000], managed: true },
]

function renderBook(over: Partial<ReportBookProps> = {}): string {
  return renderToStaticMarkup(createElement(ReportBook, { head: HEAD, charts: FULL, plan: PLAN, actions: ACTIONS, ...over }))
}

function count(html: string, needle: string): number {
  return html.split(needle).length - 1
}

/** The five tab buttons: the whole opening tag and the text inside. */
function tabsOf(html: string): { tag: string; text: string }[] {
  return [...html.matchAll(/(<button\b[^>]*role="tab"[^>]*>)([\s\S]*?)<\/button>/g)].map((m) => ({ tag: m[1]!, text: m[2]!.replace(/<[^>]+>/g, '') }))
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)
  return m ? m[1]! : null
}

// ---------------------------------------------------------------------------
// 1. The key table

describe('tabKey', () => {
  it('wraps with the arrows, jumps with Home and End, and ignores every other key', () => {
    expect(tabKey('plan', 'ArrowRight')).toBe('summary')
    expect(tabKey('summary', 'ArrowLeft')).toBe('plan')
    expect(tabKey('summary', 'ArrowRight')).toBe('pl')
    expect(tabKey('pl', 'ArrowRight')).toBe('cash')
    expect(tabKey('cash', 'ArrowLeft')).toBe('pl')
    expect(tabKey('market', 'ArrowRight')).toBe('plan')
    expect(tabKey('cash', 'Home')).toBe('summary')
    expect(tabKey('cash', 'End')).toBe('plan')
    for (const key of ['a', 'Tab', 'Enter', ' ', '', 'ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Escape', 'constructor', '__proto__']) {
      for (const tab of BOOK_TABS) expect(tabKey(tab, key), `${tab} ${key}`).toBe(tab)
    }
  })

  it('is total: every tab and every arrow stays among the five tabs, and five steps right come back', () => {
    for (const tab of BOOK_TABS) {
      expect(BOOK_TABS).toContain(tabKey(tab, 'ArrowRight'))
      expect(BOOK_TABS).toContain(tabKey(tab, 'ArrowLeft'))
      let at: BookTab = tab
      for (let i = 0; i < BOOK_TABS.length; i++) at = tabKey(at, 'ArrowRight')
      expect(at).toBe(tab)
    }
  })

  it('names the tabs, with a spoken name for P&L', () => {
    expect(BOOK_TABS).toEqual(['summary', 'pl', 'cash', 'market', 'plan'])
    expect(TAB_LABELS).toEqual({ summary: 'Summary', pl: 'P&L', cash: 'Cash', market: 'Market', plan: 'Plan' })
    expect(TAB_NAMES.pl).toBe('P&L, profit and loss')
    for (const tab of BOOK_TABS) expect(TAB_NAMES[tab].length).toBeGreaterThan(0)
  })

  // WCAG 2.5.3 (label in name): a speech-control user says what they see, so the accessible name starts with the visible label.
  it('starts every spoken name with the label on the tab', () => {
    for (const tab of BOOK_TABS) expect(TAB_NAMES[tab].startsWith(TAB_LABELS[tab]), tab).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 2. The book, tab by tab

describe('ReportBook', () => {
  for (const tab of BOOK_TABS) {
    it(`opens on the ${tab} tab with one panel, five tabs and one tab stop`, () => {
      const html = renderBook({ initialTab: tab })
      expect(count(html, 'role="tabpanel"')).toBe(1)
      expect(count(html, 'role="tablist"')).toBe(1)
      const tabs = tabsOf(html)
      expect(tabs.map((t) => t.text)).toEqual(BOOK_TABS.map((t) => (TAB_LABELS[t] === 'P&L' ? 'P&amp;L' : TAB_LABELS[t])))
      const selected = tabs.filter((t) => attr(t.tag, 'aria-selected') === 'true')
      expect(selected).toHaveLength(1)
      expect(tabs.filter((t) => attr(t.tag, 'aria-selected') === 'false')).toHaveLength(4)
      expect(selected[0]!.text).toBe(TAB_LABELS[tab] === 'P&L' ? 'P&amp;L' : TAB_LABELS[tab])
      // Roving tabindex: the selected tab is the one stop, the rest are reachable with the arrows.
      expect(tabs.filter((t) => attr(t.tag, 'tabindex') === '0')).toEqual(selected)
      expect(tabs.filter((t) => attr(t.tag, 'tabindex') === '-1')).toHaveLength(4)
      // The accessible name of each tab is its spoken name.
      expect(tabs.map((t) => attr(t.tag, 'aria-label'))).toEqual(BOOK_TABS.map((t) => TAB_NAMES[t].replace('&', '&amp;')))
      // One panel, labelled by the selected tab, controlled by every tab.
      const panel = /<div\b[^>]*role="tabpanel"[^>]*>/.exec(html)![0]
      expect(attr(panel, 'aria-labelledby')).toBe(attr(selected[0]!.tag, 'id'))
      for (const t of tabs) expect(attr(t.tag, 'aria-controls')).toBe(attr(panel, 'id'))
      expect(html).toContain('2031 Annual Report')
      expect(html).toContain('Ramen Rocket')
      expect(html).toContain('Approve plan')
      expect(html).toContain('Keep last year&#x27;s plan')
      expect(html.includes('ar-range')).toBe(tab === 'plan')
      expect(html).not.toMatch(/NaN|undefined|Infinity|\[object Object\]/)
    })
  }

  describe('the price chip', () => {
    const saved = { ...moneyDisplay() }
    afterEach(() => {
      setMoneyDisplay({ mode: saved.mode, nominal: saved.nominal })
      bindMoneyContext(null)
    })

    // The report waits in the modal queue (the queue is saved), so the basis it carries can be older than the Settings the
    // player has when it opens. The axes and the table follow the live money display, and the chip names the same prices.
    for (const tab of ['pl', 'cash', 'market'] as const) {
      it(`names the prices on screen now, not the prices of the day the report was queued (${tab})`, () => {
        const g = makeTestGame(1, { countryId: 'us' })
        g.year = 2050
        bindMoneyContext(g)
        setMoneyDisplay({ nominal: true })
        const asLived = renderBook({ initialTab: tab })
        expect(asLived).toContain('<span class="ch-chip">prices of 2050</span>')
        expect(asLived).not.toContain('prices of 2031')
        setMoneyDisplay({ nominal: false })
        const today = renderBook({ initialTab: tab })
        expect(today).toContain('<span class="ch-chip">prices of 2026</span>')
        expect(today).not.toContain('prices of 2031')
        expect(today).not.toContain('prices of 2050')
      })
    }

    it('draws no chip on a chart that carries no basis', () => {
      const html = renderBook({ initialTab: 'pl', charts: THIN })
      expect(html).not.toContain('ch-chip')
    })
  })

  it('is a lazy view of its own, named for the registry', () => {
    expect(LazyReportBook.displayName).toBe('Lazy(report-book)')
  })

  it('starts on the Summary tab', () => {
    const tabs = tabsOf(renderBook())
    expect(attr(tabs[0]!.tag, 'aria-selected')).toBe('true')
  })

  it('falls back to the statement year when the head has none', () => {
    expect(renderBook({ head: { ...HEAD, year: null } })).toContain('2031 Annual Report')
  })

  it('has a header and a tab row that stay put, a bottom bar for the actions, and no heading above the panel level', () => {
    const html = renderBook()
    expect(html).toContain('class="report-book"')
    expect(html).toMatch(/class="rb-head"/)
    expect(html).toMatch(/class="rb-tabs"/)
    expect(html).toMatch(/class="rb-bar"/)
    expect(html.indexOf('rb-head')).toBeLessThan(html.indexOf('rb-tabs'))
    expect(html.indexOf('rb-tabs')).toBeLessThan(html.indexOf('rb-panel'))
    expect(html.indexOf('rb-panel')).toBeLessThan(html.indexOf('rb-bar'))
  })
})

describe('the Summary tab', () => {
  it('shows four KPI tiles, the verdict and the top drivers', () => {
    const html = renderBook({ initialTab: 'summary' })
    expect(count(html, 'class="ch-kpi"')).toBe(4)
    for (const label of ['Net profit', 'Sales', 'Cash', 'Value']) expect(html).toContain(`<span class="ch-kpi-label">${label}</span>`)
    expect(html).toContain('Net profit rose $310K from 2030.')
    expect(html).toContain('Where the sales went')
    // The tiles tint a rise as good, with a sign glyph so the colour is never the only cue.
    expect(html).toContain('ch-delta-good')
  })

  it('keeps the statement lines in "All the numbers"', () => {
    const html = renderBook({ initialTab: 'summary' })
    const details = /<details\b[\s\S]*?<\/details>/.exec(html)
    expect(details).not.toBeNull()
    const inside = details![0]
    expect(inside).toContain('All the numbers')
    expect(inside).toContain('ar-statement')
    for (const l of LINES) {
      expect(inside).toContain(l.label)
      expect(inside).toContain(l.value)
    }
    expect(inside).toContain('ar-line is-good is-total')
    expect(renderBook({ initialTab: 'summary', head: { ...HEAD, lines: [] } })).not.toContain('<details')
  })

  it('shows the company strip only with two or more rows', () => {
    const two = renderBook({ initialTab: 'summary', strip: STRIP })
    expect(two).toContain('Your companies')
    expect(two).toContain('Bolt Bikes')
    expect(two).toContain('+$1.8M')
    expect(two).toContain('-$250K')
    expect(two).not.toMatch(/NaN|undefined|Infinity/)
    for (const strip of [undefined, [], STRIP.slice(0, 1)]) expect(renderBook({ initialTab: 'summary', strip })).not.toContain('Your companies')
    // The strip belongs to the Summary tab only.
    expect(renderBook({ initialTab: 'pl', strip: STRIP })).not.toContain('Your companies')
  })

  it('does not draw a strip row with a hostile number', () => {
    const bad: StripRow[] = [
      { ...STRIP[0]!, net: Number.NaN, delta: Number.POSITIVE_INFINITY, spark: [Number.NaN, null] },
      { ...STRIP[1]!, delta: null },
    ]
    expect(renderBook({ initialTab: 'summary', strip: bad })).not.toMatch(/NaN|undefined|Infinity/)
  })
})

describe('the other tabs', () => {
  it('P&L: the waterfall, why profit changed, the profit history and the cost structure with its footnote', () => {
    const html = renderBook({ initialTab: 'pl' })
    for (const title of ['Profit and loss, 2031', 'Why profit changed', 'Net profit by year', 'Costs as a share of sales']) expect(html).toContain(title)
    expect(html).toContain('Cost detail starts in 2028.')
    expect(html.indexOf('Profit and loss, 2031')).toBeLessThan(html.indexOf('Why profit changed'))
    expect(html.indexOf('Why profit changed')).toBeLessThan(html.indexOf('Net profit by year'))
    expect(html.indexOf('Net profit by year')).toBeLessThan(html.indexOf('Costs as a share of sales'))
    expect(html).toContain('Show as table')
  })

  it('Cash: the walk with its footnote, then cash and debt', () => {
    const html = renderBook({ initialTab: 'cash' })
    expect(html).toContain('Where the cash went, 2031')
    expect(html).toContain('Moves the books don&#x27;t name yet sit in everything else.')
    expect(html).toContain('Cash and debt')
    expect(html.indexOf('Where the cash went')).toBeLessThan(html.indexOf('Cash and debt'))
  })

  it('Market: the note, an Estimate badge, then share, ladder and size', () => {
    const html = renderBook({ initialTab: 'market' })
    expect(html).toContain('Osaka eats out more than anywhere in Japan')
    expect(html).toContain('<span class="ar-badge">Estimate</span>')
    for (const title of ['Share of the market', 'Who leads the market', 'Market size']) expect(html).toContain(title)
    expect(html.indexOf('Share of the market')).toBeLessThan(html.indexOf('Who leads the market'))
    expect(html.indexOf('Who leads the market')).toBeLessThan(html.indexOf('Market size'))
  })

  // A kpi spec is drawn as a tile that prints its own note, so the footnote under the chart would say it twice.
  it('Market: a market size tile says its note once', () => {
    const size = tile('Market size', [50_000_000, 52_000_000, 55_000_000, 56_000_000, 60_000_000], 'flat')
    const html = renderBook({ initialTab: 'market', charts: { ...FULL, size } })
    expect(html).toContain('<span class="ch-kpi-note">flat</span>')
    expect(count(html, '>flat<')).toBe(1)
    expect(html).not.toContain('<p class="rb-foot">flat</p>')
  })

  it('keeps the footnote of a chart whose frame does not draw one, and of a tile with nothing to draw', () => {
    expect(count(renderBook({ initialTab: 'cash' }), 'class="rb-foot"')).toBe(1)
    const empty: ChartSpec = { ...tile('Market size', [], 'flat'), series: [] }
    const html = renderBook({ initialTab: 'market', charts: { ...FULL, size: empty } })
    expect(html).toContain('<p class="rb-foot">flat</p>')
  })

  it('Plan: the plan body and nothing else from the other tabs', () => {
    const html = renderBook({ initialTab: 'plan' })
    expect(html).toContain('plan-stub')
    expect(html).toContain('ar-range')
    expect(html).not.toContain('Profit and loss, 2031')
    expect(html).not.toContain('class="ch-kpi"')
  })
})

// ---------------------------------------------------------------------------
// 4. Parts a company does not have yet

describe('absent parts', () => {
  it('say where the history starts, and never draw an empty chart', () => {
    const pl = renderBook({ charts: THIN, initialTab: 'pl' })
    expect(pl).toContain('Profit and loss, 2031')
    expect(pl).toContain('History starts 2031.')
    expect(pl).not.toContain('Why profit changed')
    expect(renderBook({ charts: THIN, initialTab: 'cash' })).toContain('History starts 2031: the cash walk needs two booked years.')
    expect(renderBook({ charts: THIN, initialTab: 'market' })).toContain('The market fills in after a booked year.')
    const summary = renderBook({ charts: THIN, initialTab: 'summary' })
    expect(count(summary, 'class="ch-kpi"')).toBe(0)
    expect(summary).toContain('Where the sales went')
    expect(renderBook({ charts: THIN, initialTab: 'plan' })).toContain('ar-range')
  })

  it('missingNote names each absent part and is quiet when nothing is missing', () => {
    for (const tab of BOOK_TABS) expect(missingNote(tab, FULL), tab).toBeNull()
    expect(missingNote('pl', THIN)).toBe('The profit bridge needs a year to compare with. History starts 2031.')
    expect(missingNote('cash', THIN)).toBe('History starts 2031: the cash walk needs two booked years.')
    expect(missingNote('market', THIN)).toBe('The market fills in after a booked year.')
    expect(missingNote('plan', THIN)).toBeNull()
    expect(missingNote('summary', THIN)).not.toBeNull()
    // A first booked year: the ladder is there, the history is not.
    const first: ReportCharts = { ...THIN, ladder: FULL.ladder }
    expect(missingNote('market', first)).toBe('History starts 2031.')
    // Only the bridge is missing.
    const { bridge: _bridge, ...rest } = FULL
    expect(missingNote('pl', rest)).toBe('The profit bridge needs a year to compare with.')
    // Only the cash lines are missing.
    const { cashLines: _lines, ...noLines } = FULL
    expect(missingNote('cash', noLines)).toBe('The cash and debt lines need two booked years.')
  })

  it('keeps every note within the voice rules', () => {
    const { bridge: _bridge, cashLines: _lines, ...twoGone } = FULL
    for (const charts of [THIN, { ...THIN, ladder: FULL.ladder }, twoGone] as ReportCharts[]) {
      for (const tab of BOOK_TABS) {
        const note = missingNote(tab, charts)
        if (note === null) continue
        expect(note.length).toBeLessThanOrEqual(120)
        expect(note).not.toMatch(DASHES)
        expect(note).not.toMatch(/NaN|undefined/)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// 5. AnnualReport and the lazy book

const SAMPLE = {
  assetId: 'biz1',
  businessName: 'Ramen Rocket',
  emoji: '🍜',
  industryLabel: 'Restaurant',
  location: 'Osaka, Japan',
  year: 2031,
  unitLabel: 'meals',
  unitCost: 3.2,
  price: 9.5,
  minPrice: 2,
  maxPrice: 30,
  suggestedPrice: 11,
  production: 24000,
  maxProduction: 60000,
  inventory: 1500,
  expectedDemand: 26000,
  marketNote: 'Osaka eats out more than anywhere in Japan; rents near the station are brutal.',
  lines: [
    { label: 'Revenue', value: '$228,000', tone: 'good' },
    { label: 'Cost of goods', value: '-$76,800', tone: 'bad' },
    { label: 'Net profit', value: '$41,500', tone: 'good' },
  ],
}

const GOOD = FULL as unknown as { [key: string]: Json }
const HOSTILE_CHARTS: Json[] = ['x', {}, { v: 1, pl: 'x' }, null, 7, [], [GOOD], { ...GOOD, v: 2 }, { ...GOOD, pl: 'nope' }]

function modalOf(data: Json): MinigameModal {
  return { kind: 'minigame', id: 'm1', game: 'annualReport', title: 'Annual Report', scriptId: 'business.report', data }
}

function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children)
  return ''
}

function findButton(node: ReactNode, label: string): ReactElement<{ onClick: () => void }> | null {
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findButton(n, label)
      if (hit) return hit
    }
    return null
  }
  if (!isValidElement(node)) return null
  const props = node.props as { children?: ReactNode; onClick?: () => void }
  if (node.type === 'button' && textOf(props.children).includes(label)) return node as ReactElement<{ onClick: () => void }>
  return findButton(props.children, label)
}

/** Server-render the report and keep the element tree it returned, so its buttons can be "clicked" (as annualReport.test.ts does). */
function renderReport(data: Json) {
  const results: string[] = []
  let tree: ReactNode = null
  const props = { modal: modalOf(data), onDone: (r: string) => void results.push(r) }
  function Probe() {
    tree = AnnualReport(props)
    return tree
  }
  const html = renderToStaticMarkup(createElement(Probe))
  const click = (label: string, from: ReactNode = tree) => {
    const btn = findButton(from, label)
    expect(btn, `button "${label}"`).not.toBeNull()
    btn!.props.onClick()
  }
  return { html, results, click, tree: tree as ReactNode }
}

describe('AnnualReport', () => {
  it('is today\'s text layout with no chart, and with a damaged one', () => {
    expect(LazyReportBook.isReady()).toBe(false)
    const plain = renderReport(SAMPLE as unknown as Json)
    expect(plain.html).toContain('Fiscal year 2031')
    expect(plain.html).toContain('Approve plan')
    expect(plain.html).not.toContain('role="tablist"')
    for (const chart of HOSTILE_CHARTS) {
      const hostile = renderReport({ ...SAMPLE, chart } as unknown as Json)
      expect(hostile.html, JSON.stringify(chart)).toBe(plain.html)
    }
  })

  it('still reports the plan or skip from the layout without a chart', () => {
    const a = renderReport(SAMPLE as unknown as Json)
    a.click('Approve plan')
    expect(JSON.parse(a.results[0]!)).toEqual({ price: 9.5, production: 24000 })
    const b = renderReport(SAMPLE as unknown as Json)
    b.click('Keep last year')
    expect(b.results).toEqual([SKIP_RESULT])
    const r = readReportData(SAMPLE as unknown as Json)
    expect(a.results[0]).toBe(planResult(r, r.price, r.production))
  })

  it('with a chart: the text layout while the chunk loads, the five tabs once it has', async () => {
    const data = { ...SAMPLE, chart: FULL } as unknown as Json
    // Before the chunk is there, the server render is today's layout (also what a failed load leaves).
    expect(LazyReportBook.isReady()).toBe(false)
    const before = renderReport(data)
    expect(before.html).toBe(renderReport(SAMPLE as unknown as Json).html)
    expect(before.html).toContain('Approve plan')

    expect(await LazyReportBook.preload()).toBe(true)
    const after = renderReport(data)
    expect(count(after.html, 'role="tab"')).toBe(5)
    expect(after.html).toContain('2031 Annual Report')
    expect(after.html).toContain('class="ch-kpi"')
    expect(after.html).toContain('Approve plan')
    expect(after.html).not.toContain('Fiscal year 2031')
    expect(after.html).not.toMatch(/NaN|undefined|Infinity|\[object Object\]/)
  })

  it('hands the book the same plan and the same buttons as the text layout', async () => {
    await LazyReportBook.preload()
    const r = renderReport({ ...SAMPLE, chart: FULL } as unknown as Json)
    const props = (r.tree as ReactElement<Record<string, unknown>>).props
    // The buttons the book shows are the ones the layout has: same handlers, same results.
    r.click('Approve plan', props.actions as ReactNode)
    r.click('Keep last year', props.actions as ReactNode)
    expect(JSON.parse(r.results[0]!)).toEqual({ price: 9.5, production: 24000 })
    expect(r.results[1]).toBe(SKIP_RESULT)
    // The plan lands in the Plan tab, with the sliders, the projection and its Estimate badge.
    const bookProps = props as unknown as ReportBookProps
    const planTab = renderToStaticMarkup(createElement(ReportBook, { ...bookProps, initialTab: 'plan' }))
    expect(planTab).toContain('ar-range')
    expect(planTab).toContain('Price per meal')
    expect(planTab).toContain('Plan for 2032')
    expect(planTab).toContain('Estimate')
    // The head comes from the report data.
    const head = props.head as BookHead
    expect(head.businessName).toBe('Ramen Rocket')
    expect(head.year).toBe(2031)
    expect(head.lines).toHaveLength(3)
  })
})

describe('readReportData and isBook', () => {
  const MALFORMED: Json[] = [
    null,
    'nonsense',
    42,
    [],
    [1, 2, 3],
    {},
    { businessName: '', emoji: 7, lines: 'oops', year: 'soon' },
    { minPrice: 'x', maxPrice: -5, price: 'NaN', suggestedPrice: null, production: -40, maxProduction: 'lots' },
    { minPrice: 50, maxPrice: 5, price: 500, suggestedPrice: -3, unitCost: -2, inventory: -9, expectedDemand: 1e3 },
    { minPrice: 7, maxPrice: 7, price: 7, maxProduction: 0, production: 30, lines: [null, 3, { label: 'Revenue' }, { label: 'Tax', value: -1200, tone: 'meh' }] },
    { lines: Array.from({ length: 80 }, (_, i) => ({ label: `Line ${i}`, value: String(i) })) },
  ]

  it('reads no charts from malformed data and from every hostile chart', () => {
    for (const data of MALFORMED) {
      expect(readReportData(data).charts, JSON.stringify(data)).toBeNull()
      expect(isBook(data)).toBe(false)
    }
    for (const chart of HOSTILE_CHARTS) {
      const data = { ...SAMPLE, chart } as unknown as Json
      expect(readReportData(data).charts, JSON.stringify(chart)).toBeNull()
      expect(isBook(data)).toBe(false)
    }
  })

  it('reads the charts of a valid blob, and isBook agrees', () => {
    const data = { ...SAMPLE, chart: FULL } as unknown as Json
    const r = readReportData(data)
    expect(r.charts).not.toBeNull()
    expect(r.charts).toEqual(readReportCharts(FULL))
    expect(r.charts!.kpis).toHaveLength(4)
    expect(isBook(data)).toBe(true)
    // The text fields are read as they were.
    expect(r.businessName).toBe('Ramen Rocket')
    expect(r.lines).toHaveLength(3)
  })

  it('keeps a good book good when the rest of the data is damaged', () => {
    const data = { chart: FULL } as unknown as Json
    expect(isBook(data)).toBe(true)
    expect(readReportData(data).charts).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// The card around it

describe('ModalHost', () => {
  function host(data: Json): string {
    // `assets` is there for the company strip, which the card builds when annualReport2 is on; no companies, so no strip.
    mock.state.game = { queue: [modalOf(data)], assets: [] }
    try {
      return renderToStaticMarkup(createElement(ModalHost))
    } finally {
      mock.state.game = null
    }
  }

  it('gives the card the is-report class only for a report with a book', () => {
    const book = host({ ...SAMPLE, chart: FULL } as unknown as Json)
    expect(book).toMatch(/class="popup [^"]*\bis-report\b/)
    const plain = host(SAMPLE as unknown as Json)
    expect(plain).not.toContain('is-report')
    expect(plain).toMatch(/class="popup is-wide"/)
    for (const chart of HOSTILE_CHARTS) expect(host({ ...SAMPLE, chart } as unknown as Json), JSON.stringify(chart)).not.toContain('is-report')
  })

  // The card also reads the game for the company strip when annualReport2 is on (R1-C12), so the fake game has to look like
  // one, and the card has to come out the same with the flag on as with it off. This is the day the lead turns the flag on.
  it('draws the same card with annualReport2 on, from a game with no companies', () => {
    withFlags({ annualReport2: true }, () => {
      const book = host({ ...SAMPLE, chart: FULL } as unknown as Json)
      expect(book).toMatch(/class="popup [^"]*\bis-report\b/)
      const plain = host(SAMPLE as unknown as Json)
      expect(plain).not.toContain('is-report')
      expect(plain).toMatch(/class="popup is-wide"/)
      for (const chart of HOSTILE_CHARTS) expect(host({ ...SAMPLE, chart } as unknown as Json), JSON.stringify(chart)).not.toContain('is-report')
    })
  })
})

// ---------------------------------------------------------------------------
// 7. The styles

describe('business.css', () => {
  const css = readFileSync(new URL('../src/ui/styles/business.css', import.meta.url), 'utf8')
  const at = css.indexOf('Annual Report 2.0')
  const mine = at >= 0 ? css.slice(css.lastIndexOf('/*', at)) : ''

  /** The declarations of the first top-level rule whose selector list names `selector` exactly. */
  function rule(selector: string): string {
    for (const block of mine.split('}')) {
      const [head, body] = block.split('{')
      if (body === undefined) continue
      const names = head!.replace(/\/\*[\s\S]*?\*\//g, '').split(',').map((n) => n.trim())
      if (names.includes(selector)) return body
    }
    return ''
  }

  it('adds the book styles after one marker comment', () => {
    expect(at).toBeGreaterThan(0)
    expect(mine).toContain('.popup.is-report')
    expect(mine).toContain('.popup-backdrop:has(.popup.is-report)')
    expect(mine).toContain('.popup.is-report .annual-report')
    expect(mine).toContain('.popup.is-report .popup-scroll')
    expect(mine).toContain('.popup.is-report .popup-title')
  })

  it('sticks the header, the tab row and the bottom bar, and scrolls the tabs sideways', () => {
    for (const sel of ['.rb-head', '.rb-tabs', '.rb-bar']) expect(rule(sel), sel).toContain('position: sticky')
    expect(rule('.rb-tabs')).toContain('overflow-x: auto')
    expect(rule('.rb-tabs')).toContain('scroll-snap-type: x proximity')
    expect(rule('.rb-tab')).toContain('min-height: var(--target')
    expect(rule('.rb-bar')).toContain('safe-bottom')
  })

  // The scroller is the popup around the book and the three sticky bands sit inside it, so the browser counts a control
  // under a band as already in view. scroll-padding tells it where the clear part of the scroller starts and ends.
  it('keeps a focused control clear of the sticky header, tab row and bottom bar (WCAG 2.4.11)', () => {
    const body = rule('.popup.is-report .popup-scroll')
    const top = /scroll-padding-top\s*:\s*(\d+(?:\.\d+)?)px\s*;/.exec(body)
    expect(top, 'scroll-padding-top').not.toBeNull()
    const header = Number(/height\s*:\s*(\d+)px/.exec(rule('.rb-head'))![1])
    const tabs = Number(/var\(--target,\s*(\d+)px\)/.exec(rule('.rb-tab'))![1])
    expect(Number(top![1])).toBeGreaterThanOrEqual(header + tabs)
    const bottom = /scroll-padding-bottom\s*:\s*calc\(\s*(\d+(?:\.\d+)?)px\s*\+\s*var\(--safe-bottom\)\s*\)\s*;/.exec(body)
    expect(bottom, 'scroll-padding-bottom').not.toBeNull()
    // The bar is 10px, a 48px button, 10px and a 1px border, plus the safe area.
    expect(Number(bottom![1])).toBeGreaterThanOrEqual(10 + 48 + 10 + 1)
  })

  // ModalHost renders the card wide, so it carries .is-wide (440px, global.css) as well as .is-report, and global.css is
  // imported after this sheet (src/main.tsx). At equal specificity the later sheet wins, so the 480px needs a third class.
  it('keeps the book 480px wide although the card also carries .is-wide', () => {
    const classes = (selector: string): number => (selector.match(/\.[a-z][\w-]*/gi) ?? []).length
    const wide = [...mine.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter((m) => /max-width\s*:\s*480px/.test(m[2]!))
      .flatMap((m) => m[1]!.replace(/\/\*[\s\S]*?\*\//g, '').split(',').map((n) => n.trim()))
      .filter((n) => n.includes('.is-report') && !n.includes(' '))
    expect(wide.length).toBeGreaterThan(0)
    const global = readFileSync(new URL('../src/ui/styles/global.css', import.meta.url), 'utf8')
    expect(/\.popup\.is-wide\s*\{[^}]*max-width\s*:\s*440px/.test(global)).toBe(true)
    expect(wide.some((n) => n.includes('.is-wide') && classes(n) > classes('.popup.is-wide'))).toBe(true)
  })

  it('has no fixed width above 328px in the new rules, and no raw colour', () => {
    // The media queries name breakpoints (min-width: 520px); only the declarations count.
    const declared = mine.replace(/@media[^{]*\{/g, '{')
    const widths = [...declared.matchAll(/(?<![-\w])(?:min-)?width\s*:\s*(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]))
    expect(widths.length).toBeGreaterThan(0)
    for (const w of widths) expect(w).toBeLessThanOrEqual(328)
    expect(mine).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(mine).not.toMatch(DASHES)
  })
})

// ---------------------------------------------------------------------------
// 8. A real company

describe('a real company', () => {
  let data: Json = null
  let charts: ReportCharts | null = null
  beforeAll(() => {
    const { g, a } = ownerGame({ years: 6 })
    data = withFlags({ annualReport2: true }, () => toJson(reportData(g, a, bizOf(g, a)))) as Json
    charts = readReportData(data).charts
  }, 120_000)

  it('builds a book that reads back and shows every tab', () => {
    expect(isBook(data)).toBe(true)
    expect(charts).not.toBeNull()
    const r = readReportData(data)
    const head: BookHead = {
      businessName: r.businessName,
      emoji: r.emoji,
      year: r.year,
      industryLabel: r.industryLabel,
      location: r.location,
      marketNote: r.marketNote,
      lines: r.lines,
    }
    for (const tab of BOOK_TABS) {
      const html = renderToStaticMarkup(createElement(ReportBook, { head, charts: charts!, plan: PLAN, actions: ACTIONS, initialTab: tab }))
      expect(count(html, 'role="tabpanel"'), tab).toBe(1)
      expect(html, tab).not.toMatch(/NaN|undefined|Infinity|\[object Object\]/)
      // 8. At most 150 drawing elements in any one chart.
      for (const figure of html.matchAll(/<figure\b[\s\S]*?<\/figure>/g)) expect(countSvgNodes(figure[0]), tab).toBeLessThanOrEqual(150)
    }
    const summary = renderToStaticMarkup(createElement(ReportBook, { head, charts: charts!, plan: PLAN, actions: ACTIONS }))
    expect(count(summary, 'class="ch-kpi"')).toBe(charts!.kpis.length)
    expect(summary).toContain(charts!.summary.title)
  })

  it('opens through AnnualReport once the chunk is loaded', async () => {
    await LazyReportBook.preload()
    const r = renderReport(data)
    expect(count(r.html, 'role="tab"')).toBe(5)
    expect(r.html).toContain('Annual Report')
    expect(r.html).not.toMatch(/NaN|undefined|Infinity|\[object Object\]/)
  })
})
