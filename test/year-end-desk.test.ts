// R1-C12: the Year-End Desk and the company strip (src/ui/minigames/yearEnd.ts, src/ui/charts/YearEndDesk.tsx and the
// hunks in ModalHost.tsx, AnnualReport.tsx, types.ts, lazy.tsx and business.css). The desk is dormant in v4.0.2 play
// (one annual report a year), so everything here runs on synthetic queues; the one real company is a game with three
// of them. The store is mocked the way test/annualReport.test.ts mocks it, with finishMinigame as a spy, and flags are
// set with withFlags. The lazy desk and book are rendered after `await preload()`, the pattern of test/report-book.test.ts.
import { readFileSync } from 'node:fs'
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { bizOf } from '../src/game/business/state'
import { toJson } from '../src/game/business/util'
import { reportData } from '../src/game/business/yearly'
import { companyStrip, type StripRow } from '../src/game/charts/books'
import { readReportCharts } from '../src/game/charts/report'
import { flagOn, resetFlags, withFlags } from '../src/game/flags'
import type { Asset, ChoiceModal, GameState, Json, MinigameModal, ModalItem, NoticeModal } from '../src/game/types'
import type { BookHead } from '../src/ui/minigames/bookModel'
import { deskPosition, KEEP_ALL_LABEL, nextBatch, reportsIn, shouldShowDesk, type DeskBatch } from '../src/ui/minigames/yearEnd'
import { ownerGame } from './charts-kit'

const mock = vi.hoisted(() => ({ state: { game: null as unknown }, finish: vi.fn() }))

// One test below needs a ModalHost that is drawn again with a shorter queue and still remembers its batch, which a one-shot
// server render cannot do. While `persist.on` is set, useRef hands out the same slots in the same call order on every
// render (ModalHost's own ref is the first call, because it renders first); otherwise it is React's.
const persist = vi.hoisted(() => ({ on: false, next: 0, slots: [] as { current: unknown }[] }))

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useRef: (init: unknown) => {
      if (!persist.on) return (actual.useRef as (v: unknown) => unknown)(init)
      const slot = (persist.slots[persist.next] ??= { current: init })
      persist.next++
      return slot
    },
  }
})

vi.mock('../src/ui/store', () => ({
  useApp: (sel: (s: typeof mock.state) => unknown) => sel(mock.state),
  getApp: () => mock.state,
  runMenuAction: () => {},
  finishMinigame: (id: string, result: string) => mock.finish(id, result),
  dismissNotice: () => {},
  dismissNotices: () => {},
  chooseOption: () => {},
  submitInput: () => {},
  processQueue: () => {},
}))

const { YearEndDesk } = await import('../src/ui/charts/YearEndDesk')
const { ReportBook } = await import('../src/ui/charts/ReportBook')
const { LazyYearEndDesk, LazyReportBook } = await import('../src/ui/charts/lazy')
const { ModalHost, MinigameCard } = await import('../src/ui/components/ModalHost')

beforeEach(() => {
  mock.finish.mockClear()
})

afterEach(() => {
  resetFlags()
  mock.state.game = null
})

/** The en dash and the em dash, spelled by code so this file holds neither (docs/VOICE.md). */
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)
const BAD_TEXT = /NaN|undefined|Infinity|\[object Object\]/

// ---------------------------------------------------------------------------
// Fixtures

function report(id: string, year: number | string | null, name = `Company ${id}`): MinigameModal {
  return {
    kind: 'minigame',
    id,
    game: 'annualReport',
    title: 'Annual Report',
    scriptId: 'business.annualReport',
    data: { assetId: `asset-${id}`, businessName: name, emoji: '🏢', year, lines: [{ label: 'Net profit', value: '$41,500', tone: 'good' }] },
  }
}

const NOTICE: NoticeModal = { kind: 'notice', id: 'n1', title: 'News', text: 'Something happened.' }
const CHOICE: ChoiceModal = { kind: 'choice', id: 'c1', title: 'Pick', text: 'Which one?', choices: [{ id: 'a', label: 'First' }], source: 'script', scriptId: 'none' }
const BLACKJACK: MinigameModal = { kind: 'minigame', id: 'bj', game: 'blackjack', title: 'Cards', scriptId: 'none', data: null }
const NATION: MinigameModal = { kind: 'minigame', id: 'nat', game: 'nationReport', title: 'Nation', scriptId: 'none', data: null }
const TASK: ModalItem = { kind: 'aiTask', id: 't1', task: { type: 'yearEvents' } }

const STRIP: StripRow[] = [
  { id: 'a', name: 'Ramen Rocket', emoji: '🍜', net: 1_800_000, delta: 310_000, spark: [900_000, 1_000_000, 1_490_000, 1_800_000], managed: false },
  { id: 'b', name: 'Bolt Bikes', emoji: '🚲', net: -250_000, delta: -400_000, spark: [150_000, -250_000], managed: true },
  { id: 'c', name: 'Sun Soda', emoji: '🥤', net: 0, delta: null, spark: [], managed: true },
]

const BODY: ReactNode = createElement('div', { className: 'body-stub' }, 'THE REPORT BODY')

function count(html: string, needle: string): number {
  return html.split(needle).length - 1
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)
  return m ? m[1]! : null
}

/** The chips of the desk: the whole opening tag and the markup inside. */
function chipsOf(html: string): { tag: string; inner: string }[] {
  return [...html.matchAll(/(<li\b[^>]*class="yd-chip[^"]*"[^>]*>)([\s\S]*?)<\/li>/g)].map((m) => ({ tag: m[1]!, inner: m[2]! }))
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')
}

function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children)
  return ''
}

/** Every element in the tree that `pred` accepts, depth first. */
function findAll(node: ReactNode, pred: (el: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap((n) => findAll(n, pred))
  if (!isValidElement(node)) return []
  const el = node as ReactElement<Record<string, unknown>>
  return [...(pred(el) ? [el] : []), ...findAll(el.props.children as ReactNode, pred)]
}

/** Server-render a function component and keep the element tree it returned, so its buttons can be "clicked". */
function capture<P>(fn: (p: P) => ReactNode, props: P): { html: string; tree: ReactNode } {
  let tree: ReactNode = null
  function Probe() {
    tree = fn(props)
    return tree
  }
  const html = renderToStaticMarkup(createElement(Probe))
  return { html, tree }
}

const DESK_PROPS = { year: 2031, position: { index: 2, of: 6 }, strip: STRIP, currentName: 'Bolt Bikes', onKeepAll: () => {}, children: BODY }

// ---------------------------------------------------------------------------
// 1. The pure half

describe('reportsIn', () => {
  it('picks only the annual reports, in queue order, with their year', () => {
    const queue: ModalItem[] = [NOTICE, report('a', 2031), BLACKJACK, report('b', 2031), CHOICE, NATION, TASK, report('c', 2030)]
    expect(reportsIn(queue)).toEqual([
      { id: 'a', year: 2031 },
      { id: 'b', year: 2031 },
      { id: 'c', year: 2030 },
    ])
  })

  it('gives a null year to data it cannot read, and never throws', () => {
    const queue: ModalItem[] = [
      report('a', null),
      report('b', Number.NaN),
      report('c', -4),
      report('d', 1e9),
      report('e', 2031.4),
      report('f', 'soon'),
      report('g', '2031'),
      { ...report('h', 2031), data: null },
      { ...report('i', 2031), data: [2031] },
      { ...report('j', 2031), data: 'x' },
    ]
    expect(reportsIn(queue).map((r) => r.year)).toEqual([null, null, null, null, 2031, null, 2031, null, null, null])
    for (const bad of [null, undefined, 7, 'queue', {}] as unknown[]) expect(reportsIn(bad as ModalItem[])).toEqual([])
    expect(reportsIn([null, 3, 'x', {}, { kind: 'minigame' }] as unknown as ModalItem[])).toEqual([])
    expect(reportsIn([])).toEqual([])
  })

  it('does not write the queue', () => {
    const queue = [report('a', 2031), NOTICE]
    const before = JSON.stringify(queue)
    Object.freeze(queue)
    for (const item of queue) Object.freeze(item)
    reportsIn(queue)
    expect(JSON.stringify(queue)).toBe(before)
  })
})

describe('nextBatch and deskPosition', () => {
  const six = Array.from({ length: 6 }, (_, i) => ({ id: `r${i + 1}`, year: 2031 as number | null }))

  function words(batch: DeskBatch | null, remaining: number): string | null {
    const p = deskPosition(batch, remaining)
    return p ? `${p.index} of ${p.of}` : null
  }

  it('walks a batch of six: 6 reports left reads "1 of 6", one left reads "6 of 6"', () => {
    let batch: DeskBatch | null = null
    const seen: (string | null)[] = []
    for (let left = 6; left >= 1; left--) {
      const reports = six.slice(6 - left)
      batch = nextBatch(batch, reports)
      seen.push(words(batch, reports.length))
    }
    expect(seen).toEqual(['1 of 6', '2 of 6', '3 of 6', '4 of 6', '5 of 6', '6 of 6'])
    expect(batch).toEqual({ year: 2031, total: 6 })
  })

  it('is idempotent for one input, so a second render changes nothing', () => {
    const once = nextBatch(null, six)
    expect(nextBatch(once, six)).toEqual(once)
    const later = nextBatch(once, six.slice(3))
    expect(nextBatch(later, six.slice(3))).toEqual(later)
    expect(later).toEqual({ year: 2031, total: 6 })
  })

  it('keeps the largest total seen for the same year, and raises it when more arrive', () => {
    const big: DeskBatch = { year: 2031, total: 6 }
    expect(nextBatch(big, six.slice(4))).toEqual({ year: 2031, total: 6 })
    expect(nextBatch(big, [...six, { id: 'r7', year: 2031 }, { id: 'r8', year: 2031 }])).toEqual({ year: 2031, total: 8 })
  })

  it('starts over for a new year', () => {
    const old: DeskBatch = { year: 2030, total: 6 }
    const next = nextBatch(old, [{ id: 'x', year: 2031 }, { id: 'y', year: 2031 }, { id: 'z', year: 2031 }])
    expect(next).toEqual({ year: 2031, total: 3 })
    expect(words(next, 3)).toBe('1 of 3')
  })

  it('counts only the reports of the head year, and reads a missing year as one year of its own', () => {
    expect(nextBatch(null, [{ id: 'a', year: 2031 }, { id: 'b', year: 2030 }, { id: 'c', year: 2031 }])).toEqual({ year: 2031, total: 2 })
    const unknown = nextBatch(null, [{ id: 'a', year: null }, { id: 'b', year: null }])
    expect(unknown).not.toBeNull()
    expect(unknown!.total).toBe(2)
    expect(words(unknown, 2)).toBe('1 of 2')
  })

  it('is null when no report remains', () => {
    expect(nextBatch(null, [])).toBeNull()
    expect(nextBatch({ year: 2031, total: 6 }, [])).toBeNull()
  })

  it('shows no position for a single report', () => {
    const one = nextBatch(null, [{ id: 'a', year: 2031 }])
    expect(one).toEqual({ year: 2031, total: 1 })
    expect(deskPosition(one, 1)).toBeNull()
    expect(deskPosition(null, 3)).toBeNull()
    expect(deskPosition({ year: 2031, total: 0 }, 1)).toBeNull()
  })

  it('stays inside 1..total for any remaining count', () => {
    const batch: DeskBatch = { year: 2031, total: 3 }
    expect(deskPosition(batch, 3)).toEqual({ index: 1, of: 3 })
    expect(deskPosition(batch, 1)).toEqual({ index: 3, of: 3 })
    expect(deskPosition(batch, 9)).toEqual({ index: 1, of: 3 })
    for (const bad of [0, -2, Number.NaN, Number.POSITIVE_INFINITY]) expect(deskPosition(batch, bad), String(bad)).toBeNull()
  })
})

describe('shouldShowDesk', () => {
  it('needs the flag and a position', () => {
    const pos = { index: 2, of: 6 }
    expect(shouldShowDesk(true, pos)).toBe(true)
    expect(shouldShowDesk(false, pos)).toBe(false)
    expect(shouldShowDesk(true, null)).toBe(false)
    expect(shouldShowDesk(false, null)).toBe(false)
  })

  it('follows annualReport2 when it is given the live flag', () => {
    const pos = { index: 1, of: 2 }
    withFlags({ annualReport2: true }, () => expect(shouldShowDesk(flagOn('annualReport2'), pos)).toBe(true))
    withFlags({ annualReport2: false }, () => expect(shouldShowDesk(flagOn('annualReport2'), pos)).toBe(false))
  })

  it('names the button honestly: it keeps last year\'s plan, it does not approve a new one', () => {
    expect(KEEP_ALL_LABEL).toBe('Keep every plan')
  })
})

// ---------------------------------------------------------------------------
// 2. The desk

describe('YearEndDesk', () => {
  const html = renderToStaticMarkup(createElement(YearEndDesk, DESK_PROPS))

  it('writes the title and the stepper, and labels the stepper in words', () => {
    expect(html).toContain('Year-End Desk, 2031')
    expect(html).toContain('2 of 6')
    const step = /<[a-z]+\b[^>]*class="yd-step"[^>]*>/.exec(html)
    expect(step).not.toBeNull()
    expect(attr(step![0], 'aria-label')).toBe('Report 2 of 6')
    expect(html).not.toMatch(DASHES)
    expect(html).not.toMatch(BAD_TEXT)
  })

  it('leaves the year out when the report has none', () => {
    const none = renderToStaticMarkup(createElement(YearEndDesk, { ...DESK_PROPS, year: null }))
    expect(none).toContain('Year-End Desk')
    expect(none).not.toMatch(/Year-End Desk,|null|NaN/)
  })

  it('draws one chip a company, in the order it is given, with a signed profit, the change and a trend', () => {
    const chips = chipsOf(html)
    expect(chips).toHaveLength(3)
    expect(chips.map((c) => (['Ramen Rocket', 'Bolt Bikes', 'Sun Soda'].find((n) => c.inner.includes(n)) ?? ''))).toEqual(['Ramen Rocket', 'Bolt Bikes', 'Sun Soda'])
    expect(chips[0]!.inner).toContain('+$1.8M')
    expect(chips[0]!.inner).toContain('up $310K')
    expect(chips[1]!.inner).toContain('-$250K')
    expect(chips[1]!.inner).toContain('down $400K')
    expect(chips[2]!.inner).toContain('$0')
    expect(chips[2]!.inner).not.toContain('+$0')
    // A company with two points or more gets a sparkline; one with none draws nothing and is still a chip.
    expect(chips[0]!.inner).toContain('<svg')
    expect(chips[1]!.inner).toContain('<svg')
    expect(chips[2]!.inner).not.toContain('<svg')
    for (const c of chips) expect(c.inner).toMatch(/[\u{1F300}-\u{1FAFF}]/u)
  })

  it('marks the current company, and only that one, as the current step', () => {
    expect(count(html, 'aria-current="step"')).toBe(1)
    const chips = chipsOf(html)
    const marked = chips.filter((c) => attr(c.tag, 'aria-current') === 'step')
    expect(marked).toHaveLength(1)
    expect(marked[0]!.inner).toContain('Bolt Bikes')
    const other = renderToStaticMarkup(createElement(YearEndDesk, { ...DESK_PROPS, currentName: 'Ramen Rocket' }))
    expect(chipsOf(other).filter((c) => attr(c.tag, 'aria-current') === 'step')[0]!.inner).toContain('Ramen Rocket')
    // A name that is not in the strip marks nothing.
    const none = renderToStaticMarkup(createElement(YearEndDesk, { ...DESK_PROPS, currentName: 'Nobody Inc' }))
    expect(count(none, 'aria-current')).toBe(0)
  })

  it('has the one keep-all button, and then the report it wraps', () => {
    expect(count(html, KEEP_ALL_LABEL)).toBe(1)
    const buttons = [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map((m) => m[0])
    expect(buttons).toHaveLength(1)
    expect(buttons[0]).toContain(KEEP_ALL_LABEL)
    expect(attr(/<button\b[^>]*>/.exec(buttons[0]!)![0], 'type')).toBe('button')
    expect(html).toContain('THE REPORT BODY')
    // The header block (title, stepper, strip, button) comes first and scrolls away with the page; the report follows it.
    expect(html.indexOf('Year-End Desk, 2031')).toBeLessThan(html.indexOf('Ramen Rocket'))
    expect(html.indexOf('Ramen Rocket')).toBeLessThan(html.indexOf(KEEP_ALL_LABEL))
    expect(html.indexOf(KEEP_ALL_LABEL)).toBeLessThan(html.indexOf('THE REPORT BODY'))
  })

  it('draws no strip row for an empty strip, and survives hostile numbers', () => {
    const empty = renderToStaticMarkup(createElement(YearEndDesk, { ...DESK_PROPS, strip: [] }))
    expect(chipsOf(empty)).toHaveLength(0)
    expect(empty).toContain(KEEP_ALL_LABEL)
    const bad: StripRow[] = [
      { ...STRIP[0]!, net: Number.NaN, delta: Number.POSITIVE_INFINITY, spark: [Number.NaN, null, Number.POSITIVE_INFINITY] },
      { ...STRIP[1]!, delta: Number.NEGATIVE_INFINITY, spark: [1, Number.NaN, 3] },
    ]
    const hostile = renderToStaticMarkup(createElement(YearEndDesk, { ...DESK_PROPS, strip: bad }))
    expect(hostile).not.toMatch(BAD_TEXT)
    expect(chipsOf(hostile)).toHaveLength(2)
  })

  it('draws at most twelve chips', () => {
    const many: StripRow[] = Array.from({ length: 30 }, (_, i) => ({ ...STRIP[0]!, id: `m${i}`, name: `Firm ${i}` }))
    expect(chipsOf(renderToStaticMarkup(createElement(YearEndDesk, { ...DESK_PROPS, strip: many })))).toHaveLength(12)
  })

  it('wires the button to onKeepAll', () => {
    const onKeepAll = vi.fn()
    const { tree } = capture(YearEndDesk, { ...DESK_PROPS, onKeepAll })
    const buttons = findAll(tree, (el) => el.type === 'button')
    expect(buttons).toHaveLength(1)
    expect(textOf(buttons[0]!.props.children as ReactNode)).toBe(KEEP_ALL_LABEL)
    expect(onKeepAll).not.toHaveBeenCalled()
    ;(buttons[0]!.props.onClick as () => void)()
    expect(onKeepAll).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// 5a. The lazy desk, before anything has loaded it (this file starts no load before this test)

describe('LazyYearEndDesk', () => {
  const props = { ...DESK_PROPS, children: BODY }

  it('is a lazy view of its own, named for the registry', () => {
    expect(LazyYearEndDesk.displayName).toBe('Lazy(year-end-desk)')
  })

  it('renders its fallback, the report, until the chunk is there, and the desk once it is', async () => {
    expect(LazyYearEndDesk.isReady()).toBe(false)
    const before = renderToStaticMarkup(createElement(LazyYearEndDesk, { ...props, fallback: BODY }))
    expect(before).toContain('THE REPORT BODY')
    expect(before).not.toContain('Year-End Desk')
    expect(before).not.toContain(KEEP_ALL_LABEL)

    expect(await LazyYearEndDesk.preload()).toBe(true)
    const after = renderToStaticMarkup(createElement(LazyYearEndDesk, { ...props, fallback: BODY }))
    expect(after).toContain('Year-End Desk, 2031')
    expect(after).toContain(KEEP_ALL_LABEL)
    expect(after).toContain('THE REPORT BODY')
    expect(count(after, 'THE REPORT BODY')).toBe(1)
    expect(after).toBe(renderToStaticMarkup(createElement(YearEndDesk, props)))
  })
})

// ---------------------------------------------------------------------------
// 3. Keep every plan

describe('Keep every plan', () => {
  const A = report('a', 2031, 'Ramen Rocket')
  const B = report('b', 2031, 'Bolt Bikes')
  const C = report('c', 2031, 'Sun Soda')

  function open(queue: ModalItem[], modal: MinigameModal = A, batch: DeskBatch | null = nextBatch(null, reportsIn(queue))) {
    mock.state.game = { queue, assets: [] }
    return capture(MinigameCard, { modal, batch })
  }

  function deskOf(tree: ReactNode): ReactElement<Record<string, unknown>> {
    const found = findAll(tree, (el) => el.type === LazyYearEndDesk)
    expect(found).toHaveLength(1)
    return found[0]!
  }

  it('calls finishMinigame with skip once for every queued report, in order, and for no other item', () => {
    withFlags({ annualReport2: true }, () => {
      const { tree } = open([A, NOTICE, B, CHOICE, BLACKJACK, TASK, NATION, C])
      expect(mock.finish).not.toHaveBeenCalled()
      const keepAll = deskOf(tree).props.onKeepAll as () => void
      keepAll()
    })
    expect(mock.finish.mock.calls).toEqual([
      ['a', 'skip'],
      ['b', 'skip'],
      ['c', 'skip'],
    ])
  })

  it('does it again for nobody: a second tap on the same card does nothing', () => {
    withFlags({ annualReport2: true }, () => {
      const { tree } = open([A, B, C])
      const keepAll = deskOf(tree).props.onKeepAll as () => void
      keepAll()
      keepAll()
    })
    expect(mock.finish).toHaveBeenCalledTimes(3)
  })

  it('works from the button the player taps', () => {
    let keepAll: () => void = () => {}
    withFlags({ annualReport2: true }, () => {
      keepAll = deskOf(open([A, B, C]).tree).props.onKeepAll as () => void
    })
    const { tree } = capture(YearEndDesk, { ...DESK_PROPS, onKeepAll: keepAll })
    const buttons = findAll(tree, (el) => el.type === 'button' && textOf(el.props.children as ReactNode) === KEEP_ALL_LABEL)
    expect(buttons).toHaveLength(1)
    ;(buttons[0]!.props.onClick as () => void)()
    expect(mock.finish.mock.calls.map((c) => c[0])).toEqual(['a', 'b', 'c'])
    expect(mock.finish.mock.calls.every((c) => c[1] === 'skip')).toBe(true)
  })

  it('reads the queue when the card draws, so a report that has gone is not finished again', () => {
    withFlags({ annualReport2: true }, () => {
      const { tree } = open([B, C], B, { year: 2031, total: 3 })
      ;(deskOf(tree).props.onKeepAll as () => void)()
    })
    expect(mock.finish.mock.calls.map((c) => c[0])).toEqual(['b', 'c'])
  })

  it('shows the desk at the right place in the batch', () => {
    withFlags({ annualReport2: true }, () => {
      const first = deskOf(open([A, B, C]).tree)
      expect(first.props.position).toEqual({ index: 1, of: 3 })
      expect(first.props.year).toBe(2031)
      expect(first.props.currentName).toBe('Ramen Rocket')
      // Two are done: the batch remembers three, one is left.
      const last = deskOf(open([C], C, { year: 2031, total: 3 }).tree)
      expect(last.props.position).toEqual({ index: 3, of: 3 })
      expect(last.props.currentName).toBe('Sun Soda')
    })
  })

  it('shows no desk for one report, with the flag off, or for another game', () => {
    withFlags({ annualReport2: true }, () => {
      expect(findAll(open([A]).tree, (el) => el.type === LazyYearEndDesk)).toHaveLength(0)
      expect(findAll(open([BLACKJACK, A, B], BLACKJACK).tree, (el) => el.type === LazyYearEndDesk)).toHaveLength(0)
    })
    withFlags({ annualReport2: false }, () => {
      expect(findAll(open([A, B, C]).tree, (el) => el.type === LazyYearEndDesk)).toHaveLength(0)
    })
    expect(mock.finish).not.toHaveBeenCalled()
  })
})

describe('the desk keeps its place from one report to the next', () => {
  const reports = ['a', 'b', 'c'].map((id) => report(id, 2031, `Firm ${id}`))
  const [A, B, C] = reports as [MinigameModal, MinigameModal, MinigameModal]

  /** Draw ModalHost for this queue, as the app does after each report is finished, and read the stepper. */
  function step(queue: ModalItem[]): string | null {
    mock.state.game = { queue, assets: [] }
    persist.next = 0
    const html = withFlags({ annualReport2: true }, () => renderToStaticMarkup(createElement(ModalHost)))
    return /aria-label="Report (\d+ of \d+)"/.exec(html)?.[1] ?? null
  }

  it('reads 1 of 3, 2 of 3, 3 of 3, because ModalHost remembers how many there were (the card is built again for each)', async () => {
    expect(await LazyYearEndDesk.preload()).toBe(true)
    persist.on = true
    persist.slots = []
    try {
      expect(step([A, B, C])).toBe('1 of 3')
      expect(step([B, C])).toBe('2 of 3')
      expect(step([C])).toBe('3 of 3')
      // The last report is done and a notice shows: the batch is forgotten, so two new reports read "1 of 2".
      expect(step([NOTICE])).toBeNull()
      expect(step([report('d', 2031), report('e', 2031)])).toBe('1 of 2')
      expect(step([report('e', 2031)])).toBe('2 of 2')
      // And once that batch is done too, a lone report is no batch.
      expect(step([NOTICE])).toBeNull()
      expect(step([report('f', 2031)])).toBeNull()
    } finally {
      persist.on = false
      persist.slots = []
    }
  })

  it('keeps nothing, and draws no desk, with the flag off', async () => {
    persist.on = true
    persist.slots = []
    try {
      mock.state.game = { queue: [A, B, C], assets: [] }
      persist.next = 0
      const html = withFlags({ annualReport2: false }, () => renderToStaticMarkup(createElement(ModalHost)))
      expect(html).not.toContain('Year-End Desk')
      expect(html).not.toContain(KEEP_ALL_LABEL)
    } finally {
      persist.on = false
      persist.slots = []
    }
  })
})

// ---------------------------------------------------------------------------
// 4. The strip on a real game

describe('companyStrip in the report', () => {
  let g: GameState
  let assets: Asset[]
  let datas: Json[]
  let heads: BookHead[]

  beforeAll(() => {
    const made = ownerGame({ companies: 3, years: 4 })
    g = made.g
    assets = [made.a, ...made.others]
    datas = assets.map((a) => withFlags({ annualReport2: true }, () => toJson(reportData(g, a, bizOf(g, a)))) as Json)
    heads = datas.map((d) => {
      const r = d as { [key: string]: Json }
      return {
        businessName: String(r.businessName),
        emoji: String(r.emoji),
        year: typeof r.year === 'number' ? r.year : null,
        industryLabel: '',
        location: '',
        marketNote: '',
        lines: [],
      }
    })
  }, 180_000)

  const modalOf = (i: number): MinigameModal => ({ ...report(`real${i}`, null), data: datas[i]! })

  it('gives three chips for three companies, one of them owner-run', () => {
    const strip = companyStrip(g)
    expect(strip).toHaveLength(3)
    expect(strip.filter((r) => !r.managed)).toHaveLength(1)
    const html = renderToStaticMarkup(createElement(YearEndDesk, { year: 2031, position: { index: 1, of: 3 }, strip, currentName: assets[0]!.name, onKeepAll: () => {}, children: BODY }))
    expect(chipsOf(html)).toHaveLength(3)
    expect(chipsOf(html).map((c) => c.inner)).toEqual(strip.map((_, i) => expect.stringContaining(escapeHtml(strip[i]!.name))))
    expect(html).not.toMatch(BAD_TEXT)
    expect(html).not.toMatch(DASHES)
  })

  it('shows the strip on the Summary tab from two companies, and not for one', () => {
    const charts = readReportCharts((datas[0] as { [key: string]: Json }).chart)
    expect(charts).not.toBeNull()
    const strip = companyStrip(g)
    const book = (s: StripRow[] | undefined, initialTab: 'summary' | 'pl' = 'summary') =>
      renderToStaticMarkup(createElement(ReportBook, { head: heads[0]!, charts: charts!, plan: BODY, actions: BODY, strip: s, initialTab }))
    const three = book(strip)
    expect(three).toContain('Your companies')
    for (const row of strip) expect(three).toContain(escapeHtml(row.name))
    expect(book(strip.slice(0, 2))).toContain('Your companies')
    expect(book(strip.slice(0, 1))).not.toContain('Your companies')
    expect(book(undefined)).not.toContain('Your companies')
    expect(book(strip, 'pl')).not.toContain('Your companies')
  })

  it('reaches the book through the card: the strip with the flag on, none with it off, none for one company', async () => {
    expect(await LazyReportBook.preload()).toBe(true)
    const solo = { ...g, assets: g.assets.filter((x) => x.id === assets[0]!.id), queue: [modalOf(0)] }
    const many = { ...g, queue: [modalOf(0)] }

    mock.state.game = many
    const on = withFlags({ annualReport2: true }, () => renderToStaticMarkup(createElement(MinigameCard, { modal: modalOf(0), batch: null })))
    expect(on).toContain('role="tab"')
    expect(on).toContain('Your companies')
    for (const a of assets) expect(on).toContain(escapeHtml(a.name))

    const off = withFlags({ annualReport2: false }, () => renderToStaticMarkup(createElement(MinigameCard, { modal: modalOf(0), batch: null })))
    expect(off).toContain('role="tab"')
    expect(off).not.toContain('Your companies')

    mock.state.game = solo
    const one = withFlags({ annualReport2: true }, () => renderToStaticMarkup(createElement(MinigameCard, { modal: modalOf(0), batch: null })))
    expect(one).toContain('role="tab"')
    expect(one).not.toContain('Your companies')
  })

  it('opens the desk around the book through ModalHost, at "1 of 3", with the current company marked', async () => {
    expect(await LazyYearEndDesk.preload()).toBe(true)
    expect(await LazyReportBook.preload()).toBe(true)
    const queue = [modalOf(0), modalOf(1), modalOf(2)]
    mock.state.game = { ...g, queue }

    const on = withFlags({ annualReport2: true }, () => renderToStaticMarkup(createElement(ModalHost)))
    expect(on).toContain('Year-End Desk, ')
    expect(on).toContain('1 of 3')
    expect(on).toContain('aria-label="Report 1 of 3"')
    expect(on).toContain(KEEP_ALL_LABEL)
    expect(on).toContain('role="tab"')
    expect(on).toMatch(/class="popup [^"]*\bis-report\b/)
    const marked = chipsOf(on).filter((c) => attr(c.tag, 'aria-current') === 'step')
    expect(marked).toHaveLength(1)
    expect(marked[0]!.inner).toContain(escapeHtml(assets[0]!.name))
    expect(on.indexOf('Year-End Desk, ')).toBeLessThan(on.indexOf('role="tablist"'))
    expect(on).not.toMatch(BAD_TEXT)
    // Drawing the card is not choosing anything.
    expect(mock.finish).not.toHaveBeenCalled()

    const off = withFlags({ annualReport2: false }, () => renderToStaticMarkup(createElement(ModalHost)))
    expect(off).not.toContain('Year-End Desk')
    expect(off).not.toContain(KEEP_ALL_LABEL)
    expect(off).toContain('role="tab"')

    // One report in the batch: the book alone, with its strip.
    mock.state.game = { ...g, queue: [modalOf(0)] }
    const single = withFlags({ annualReport2: true }, () => renderToStaticMarkup(createElement(ModalHost)))
    expect(single).not.toContain('Year-End Desk')
    expect(single).toContain('Your companies')
  })

  it('does not write the state it reads', () => {
    const state = { ...g, queue: [modalOf(0), modalOf(1)] }
    mock.state.game = state
    const before = JSON.stringify(state.queue)
    const assetsBefore = JSON.stringify(state.assets)
    withFlags({ annualReport2: true }, () => renderToStaticMarkup(createElement(ModalHost)))
    expect(JSON.stringify(state.queue)).toBe(before)
    expect(JSON.stringify(state.assets)).toBe(assetsBefore)
  })
})

// ---------------------------------------------------------------------------
// The styles

describe('business.css', () => {
  const css = readFileSync(new URL('../src/ui/styles/business.css', import.meta.url), 'utf8')
  const at = css.indexOf('Year-End Desk (R1-C12)')
  const mine = at >= 0 ? css.slice(css.lastIndexOf('/*', at)) : ''

  /** The declarations of the first rule whose selector list names `selector` exactly. */
  function rule(selector: string): string {
    for (const block of mine.split('}')) {
      const [head, body] = block.split('{')
      if (body === undefined) continue
      const names = head!.replace(/\/\*[\s\S]*?\*\//g, '').split(',').map((n) => n.trim())
      if (names.includes(selector)) return body
    }
    return ''
  }

  it('adds the desk styles after one marker comment, at the end of the file', () => {
    expect(at).toBeGreaterThan(0)
    expect(css.indexOf('Year-End Desk (R1-C12)', at + 1)).toBe(-1)
    expect(mine).toContain('.year-end-desk')
    expect(mine).toContain('.yd-chips')
    expect(mine).toContain('.yd-chip')
    expect(mine).toContain('.yd-keep')
  })

  it('scrolls the chips sideways, keeps the targets at 44px, and keeps the desk a column the book can fill', () => {
    expect(rule('.yd-chips')).toContain('overflow-x: auto')
    expect(rule('.yd-keep')).toContain('min-height: var(--target')
    expect(rule('.year-end-desk')).toContain('flex-direction: column')
  })

  it('uses tokens only, no raw colour, no dash character, no fixed width above 328px', () => {
    const declared = mine.replace(/@media[^{]*\{/g, '{')
    const widths = [...declared.matchAll(/(?<![-\w])(?:min-)?width\s*:\s*(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]))
    for (const w of widths) expect(w).toBeLessThanOrEqual(328)
    expect(mine).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(mine).not.toMatch(DASHES)
  })
})
