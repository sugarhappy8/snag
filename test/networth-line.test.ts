// R1-C15: the net-worth line. netWorthSpec turns the life series (S3) into a timeline spec; LifeLine draws it behind
// the chartKit flag on the Profile and Death screens; the Graveyard shows the trail kept with each grave as a sparkline.
// The builder is checked on synthetic series (short, long, damaged), the screens by server render with the store mocked
// the way test/screens.test.ts mocks it. Every case that depends on chartKit sets it with withFlags.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { downsample, netWorthSpec } from '../src/game/charts/networth'
import { priceBasisYear } from '../src/game/charts/money'
import { readChartSpec, type ChartSpec } from '../src/game/charts/spec'
import { moneyDisplay, netWorth, setMoneyDisplay } from '../src/game/core'
import { withFlags } from '../src/game/flags'
import { PRESENT_YEAR } from '../src/game/history/timeline'
import { readLifeSeries } from '../src/game/life-series'
import type { GameState, Json } from '../src/game/types'
import { RIBBONS } from '../src/game/ribbons'
import { countSvgNodes, deepFreeze, ownerGame } from './charts-kit'
import { makeTestGame } from './helpers'
import { adult } from './market-kit'

// The same store mock as test/screens.test.ts, so the screens render without the real store.
const mock = vi.hoisted(() => ({
  state: {
    screen: 'home',
    previousScreen: 'home',
    game: null as unknown,
    settings: {} as Record<string, unknown>,
  },
  calls: [] as string[],
}))

vi.mock('../src/ui/store', () => ({
  useApp: (sel: (s: typeof mock.state) => unknown) => sel(mock.state),
  getApp: () => mock.state,
  goTo: (s: string) => mock.calls.push(`goTo:${s}`),
  goBack: () => mock.calls.push('goBack'),
  startNewLife: () => mock.calls.push('startNewLife'),
  resumeSavedGame: () => false,
  hasSavedGame: () => false,
  continueAs: (id: string) => mock.calls.push(`continueAs:${id}`),
  abandonLife: () => mock.calls.push('abandonLife'),
  updateSettings: () => mock.calls.push('updateSettings'),
  act: (fn: (g: unknown) => void) => fn(mock.state.game),
}))

const { LifeLine } = await import('../src/ui/components/LifeLine')
const { ProfileSheet } = await import('../src/ui/components/ProfileSheet')
const { DeathScreen } = await import('../src/ui/screens/DeathScreen')
const { GraveyardScreen, readGraves } = await import('../src/ui/screens/GraveyardScreen')
const { ChartViewLazy, LazySparkline } = await import('../src/ui/charts/lazy')

const DASH = /[\u2013\u2014]/
const on = <T>(fn: () => T): T => withFlags({ chartKit: true }, fn)
const off = <T>(fn: () => T): T => withFlags({ chartKit: false }, fn)
const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el)

const savedDisplay = { ...moneyDisplay() }

beforeEach(() => {
  setMoneyDisplay({ mode: 'usd', nominal: false })
  mock.calls.length = 0
  mock.state.game = null
  installStorage()
})

afterEach(() => {
  setMoneyDisplay({ mode: savedDisplay.mode, nominal: savedDisplay.nominal })
})

// Minimal in-memory localStorage for node (the graveyard lives there).
function installStorage(): Map<string, string> {
  const data = new Map<string, string>()
  const storage = {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size
    },
  }
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true })
  return data
}

// ---------------------------------------------------------------------------
// Fixtures

/** A grown-up of `age` in 2030 with no assets or loans, so net worth is the money in the bank. */
function life(age: number, seed = 5): GameState {
  const g = adult(seed, 2030, 'us', 0)
  g.character.age = age
  return g
}

/** Rows for the life's ages firstAge, firstAge + 1, ...: one net worth each, the other columns plain. */
function setSeries(g: GameState, worths: readonly number[], firstAge = 0): void {
  g.flags.lifeSeries = {
    v: 1,
    id: g.lifeId,
    rows: worths.map((w, i) => [firstAge + i, 1990 + firstAge + i, w, 0, 0, 0, 50, 50]),
  } as unknown as Json
}

/** Make the live net worth exactly `n` (the game has no assets or loans). */
function pinWorth(g: GameState, n: number): void {
  g.character.money += n - netWorth(g)
  expect(netWorth(g)).toBe(n)
}

/** A long, bumpy worth with one clear peak (age 70) and one clear low (age 33), so no tie can hide a bug. */
function bumpy(n: number): number[] {
  return Array.from({ length: n }, (_, i) => (i === 70 ? 900_000 : i === 33 ? -250_000 : ((i * 7919) % 97) * 1000))
}

function reread(spec: ChartSpec): ChartSpec | null {
  return readChartSpec(JSON.parse(JSON.stringify(spec)))
}

function values(spec: ChartSpec): number[] {
  return spec.series[0]!.values as number[]
}

/** The spec for a game, asserting that building it never throws. */
function build(g: GameState, label: string): ChartSpec | null {
  let spec: ChartSpec | null = null
  expect(() => {
    spec = netWorthSpec(g)
  }, label).not.toThrow()
  return spec
}

// ---------------------------------------------------------------------------
// 1. netWorthSpec

describe('netWorthSpec', () => {
  it('1: a short life (40 rows) is drawn whole, as a timeline of net worth by age', () => {
    const g = life(39)
    const worths = bumpy(40)
    setSeries(g, worths)
    pinWorth(g, worths[39]!)
    const spec = netWorthSpec(g)!
    expect(spec).not.toBeNull()
    expect(reread(spec)).not.toBeNull()
    expect(spec.kind).toBe('timeline')
    expect(spec.unit).toBe('money')
    expect(spec.title).toBe('Your net worth by age')
    expect(spec.series).toHaveLength(1)
    expect(spec.series[0]).toMatchObject({ id: 'worth', label: 'Net worth', tone: 'c1' })
    expect(spec.x).toEqual(Array.from({ length: 40 }, (_, i) => i))
    expect(values(spec)).toEqual(worths)
  })

  it('1: a long life (120 rows) is cut to 64 points, with the first, the last, the peak and the low kept', () => {
    const g = life(119)
    const worths = bumpy(120)
    setSeries(g, worths)
    pinWorth(g, worths[119]!)
    const spec = netWorthSpec(g)!
    expect(spec).not.toBeNull()
    expect(reread(spec)).not.toBeNull()
    expect(spec.x).toHaveLength(64)
    expect(spec.series[0]!.values).toHaveLength(64)
    const ages = spec.x as number[]
    expect(ages[0]).toBe(0)
    expect(ages[63]).toBe(119)
    expect(ages).toContain(70)
    expect(ages).toContain(33)
    for (let i = 1; i < ages.length; i++) expect(ages[i]!).toBeGreaterThan(ages[i - 1]!)
    // Every value is the real worth of its age, none is invented.
    ages.forEach((age, i) => expect(values(spec)[i]).toBe(worths[age]))
    expect(Math.max(...values(spec))).toBe(900_000)
    expect(Math.min(...values(spec))).toBe(-250_000)
    // The picks are spread: no stretch of the life is skipped over.
    for (let i = 1; i < ages.length; i++) expect(ages[i]! - ages[i - 1]!).toBeLessThanOrEqual(4)
  })

  it('1: marks are Peak, Low point (only below zero) and Now, all read from the series itself', () => {
    const g = life(9)
    setSeries(g, [0, 5_000, -3_000, 20_000, 150_000, 90_000, 40_000, 300_000, 250_000, 120_000])
    pinWorth(g, 120_000)
    const spec = netWorthSpec(g)!
    expect(spec.marks).toEqual([
      { at: 7, label: 'Peak $300K' },
      { at: 2, label: 'Low point -$3,000' },
      { at: 9, label: 'Now' },
    ])
    expect(spec.summary).toBe('Net worth $120K at age 9, peak $300K at age 7.')

    // No low point when the life never went below zero.
    const rich = life(4)
    setSeries(rich, [1_000, 2_000, 8_000, 5_000, 6_000])
    pinWorth(rich, 6_000)
    expect(netWorthSpec(rich)!.marks!.map((m) => m.label)).toEqual(['Peak $8,000', 'Now'])
  })

  it('1: every mark points at a real place, labels fit, the text is plain and within the limits', () => {
    for (const n of [3, 40, 120]) {
      const g = life(n - 1)
      const worths = bumpy(n)
      setSeries(g, worths)
      pinWorth(g, worths[n - 1]!)
      const spec = netWorthSpec(g)!
      expect(spec.marks!.length).toBeLessThanOrEqual(3)
      for (const m of spec.marks!) {
        expect(Number.isInteger(m.at)).toBe(true)
        expect(m.at).toBeGreaterThanOrEqual(0)
        expect(m.at).toBeLessThan(spec.x.length)
        expect(m.label.length).toBeLessThanOrEqual(40)
      }
      const peak = spec.marks!.find((m) => m.label.startsWith('Peak '))!
      expect(values(spec)[peak.at]).toBe(Math.max(...values(spec)))
      const now = spec.marks!.find((m) => m.label === 'Now')!
      expect(now.at).toBe(spec.x.length - 1)
      expect(spec.title.length).toBeLessThanOrEqual(60)
      expect(spec.summary.length).toBeLessThanOrEqual(120)
      for (const text of [spec.title, spec.summary, ...spec.marks!.map((m) => m.label), ...spec.series.map((s) => s.label)]) expect(DASH.test(text)).toBe(false)
    }
  })

  it('1: a flat life has no separate low point to flag', () => {
    const g = life(3)
    setSeries(g, [-500, -500, -500, -500])
    pinWorth(g, -500)
    expect(netWorthSpec(g)!.marks!.map((m) => m.label)).toEqual(['Peak -$500', 'Now'])
  })

  it('1: a one row series is not a line (null), nor is a life with no series', () => {
    const one = life(30)
    setSeries(one, [12_000], 30)
    pinWorth(one, 12_000)
    expect(netWorthSpec(one)).toBeNull()
    expect(netWorthSpec(life(30))).toBeNull()
  })

  it("1: another life's series reads as nothing", () => {
    const g = life(39)
    setSeries(g, bumpy(40))
    g.flags.lifeSeries = { ...(g.flags.lifeSeries as object), id: 'someone-else' } as unknown as Json
    expect(netWorthSpec(g)).toBeNull()
  })

  it('1: damaged series never throw: the result is null or a spec the reader accepts', () => {
    const good = (age: number, w: number) => [age, 2000 + age, w, 0, 0, 0, 50, 50]
    const g = life(20)
    const lifeId = g.lifeId
    const cases: unknown[] = [
      undefined,
      null,
      'a string',
      5,
      [],
      {},
      { v: 1, id: lifeId },
      { v: 1, id: lifeId, rows: 'rows' },
      { v: 2, id: lifeId, rows: [good(1, 5), good(2, 6)] },
      { v: 1, id: lifeId, rows: [[Number.NaN, 2000, 5, 0, 0, 0, 50, 50], ['x', 2000, 5, 0, 0, 0, 50, 50], null, 7, {}, 'row', [1, 2, 3]] },
      { v: 1, id: lifeId, rows: [good(1, Number.NaN), good(2, Number.POSITIVE_INFINITY), good(3, 1e300), good(4, -1e300), good(5, 10)] },
      { v: 1, id: lifeId, rows: [good(18, 100), good(19, 200), ['x', 'y'], null, good(20, 300)] },
      { v: 1, id: lifeId, rows: Array.from({ length: 20_000 }, (_, i) => good(i % 150, i)) },
      { v: 1, id: lifeId, rows: [good(5, 5), good(6, 6)], extra: { deep: [1, 2, 3] } },
    ]
    for (const bad of cases) {
      const h = life(20)
      h.flags.lifeSeries = bad as Json
      const label = String(JSON.stringify(bad)).slice(0, 80)
      const spec = build(h, label)
      if (spec) {
        expect(reread(spec), label).not.toBeNull()
        expect(spec.x.length).toBeLessThanOrEqual(64)
        for (const v of values(spec)) expect(Number.isFinite(v)).toBe(true)
      }
    }
  })

  it('1: a damaged character (no age, no money) still never throws', () => {
    const base = life(20)
    setSeries(base, bumpy(20))
    for (const patch of [{ age: Number.NaN }, { age: Number.POSITIVE_INFINITY }, { age: -4 }, { age: 400 }, { money: Number.NaN }, { money: Number.POSITIVE_INFINITY }]) {
      const g = structuredClone(base)
      Object.assign(g.character, patch)
      const spec = build(g, JSON.stringify(patch))
      if (spec) expect(reread(spec), JSON.stringify(patch)).not.toBeNull()
    }
  })

  it('2: a game whose current age has no row gets the live point appended', () => {
    const g = life(41)
    setSeries(g, [10_000, 12_000, 20_000, 18_000], 37)
    pinWorth(g, 55_000)
    const spec = netWorthSpec(g)!
    expect(spec.x).toEqual([37, 38, 39, 40, 41])
    expect(values(spec)).toEqual([10_000, 12_000, 20_000, 18_000, 55_000])
    expect(spec.marks!.find((m) => m.label === 'Now')!.at).toBe(4)
    expect(spec.summary).toBe('Net worth $55K at age 41, peak $55K at age 41.')
  })

  it('2: when the current age has a row that differs, the live worth stands in for it (one point, not two)', () => {
    const g = life(40)
    setSeries(g, [10_000, 12_000, 20_000, 18_000], 37)
    pinWorth(g, 31_000)
    const spec = netWorthSpec(g)!
    expect(spec.x).toEqual([37, 38, 39, 40])
    expect(values(spec)).toEqual([10_000, 12_000, 20_000, 31_000])
  })

  it('2: when the current age has a row that agrees, nothing is added', () => {
    const g = life(40)
    setSeries(g, [10_000, 12_000, 20_000, 18_000], 37)
    pinWorth(g, 18_000)
    const spec = netWorthSpec(g)!
    expect(spec.x).toEqual([37, 38, 39, 40])
    expect(values(spec)).toEqual([10_000, 12_000, 20_000, 18_000])
  })

  it('2: the live point never reorders the ages', () => {
    const g = life(38)
    // A row from an age the character is not at yet (a damaged save) must not land the live point out of order.
    setSeries(g, [10_000, 12_000, 20_000, 18_000], 37)
    pinWorth(g, 7_000)
    const spec = netWorthSpec(g)!
    const ages = spec.x as number[]
    for (let i = 1; i < ages.length; i++) expect(ages[i]!).toBeGreaterThan(ages[i - 1]!)
    expect(values(spec)[ages.indexOf(38)]).toBe(7_000)
  })

  it('3: eight years through ageUp write the series, and the spec draws it', { timeout: 120_000 }, () => {
    const { g } = ownerGame({ years: 8 })
    expect(readLifeSeries(g).length).toBeGreaterThanOrEqual(8)
    const spec = netWorthSpec(g)!
    expect(spec).not.toBeNull()
    expect(spec.x.length).toBeGreaterThanOrEqual(8)
    expect(spec.x.length).toBeLessThanOrEqual(64)
    expect(reread(spec)).not.toBeNull()
    // The last point is the live worth.
    expect(values(spec)[values(spec).length - 1]).toBe(netWorth(g))
    expect(spec.x[spec.x.length - 1]).toBe(g.character.age)
  })

  it('3: basis follows the money display setting', () => {
    const g = life(9)
    setSeries(g, bumpy(10))
    setMoneyDisplay({ nominal: true })
    expect(netWorthSpec(g)!.basis).toBe(g.year)
    expect(netWorthSpec(g)!.basis).toBe(priceBasisYear(g))
    setMoneyDisplay({ nominal: false })
    expect(netWorthSpec(g)!.basis).toBe(PRESENT_YEAR)
  })

  it('6: is a pure read: a frozen game, the generator and the whole state are left as they were', () => {
    const g = life(119)
    setSeries(g, bumpy(120))
    pinWorth(g, 77_000)
    const frozen = deepFreeze(structuredClone(g))
    const before = JSON.stringify(frozen)
    const rng = frozen.rng
    const first = netWorthSpec(frozen)
    expect(first).not.toBeNull()
    expect(netWorthSpec(frozen)).toEqual(first)
    expect(frozen.rng).toBe(rng)
    expect(JSON.stringify(frozen)).toBe(before)
    // And it builds a fresh object each time.
    expect(netWorthSpec(frozen)).not.toBe(first)
  })
})

// ---------------------------------------------------------------------------
// downsample

describe('downsample', () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => i)

  it('returns a short list whole (a copy), and cuts a long one to the cap', () => {
    const short = rows(10)
    const same = downsample(short, 64, () => false)
    expect(same).toEqual(short)
    expect(same).not.toBe(short)
    expect(downsample(rows(64), 64, () => false)).toHaveLength(64)
    const cut = downsample(rows(500), 64, () => false)
    expect(cut).toHaveLength(64)
  })

  it('always keeps the first and the last, and every kept row, in the original order, once each', () => {
    const cut = downsample(rows(120), 64, (_, i) => i === 33 || i === 70 || i === 90)
    expect(cut).toHaveLength(64)
    expect(cut[0]).toBe(0)
    expect(cut[63]).toBe(119)
    for (const k of [33, 70, 90]) expect(cut).toContain(k)
    expect(new Set(cut).size).toBe(64)
    for (let i = 1; i < cut.length; i++) expect(cut[i]!).toBeGreaterThan(cut[i - 1]!)
  })

  it('spreads the other picks evenly', () => {
    const cut = downsample(rows(1000), 11, () => false)
    expect(cut).toHaveLength(11)
    expect(cut[0]).toBe(0)
    expect(cut[10]).toBe(999)
    for (let i = 1; i < cut.length; i++) expect(cut[i]! - cut[i - 1]!).toBeLessThanOrEqual(200)
  })

  it('never returns more than the cap, even when everything asks to be kept', () => {
    const cut = downsample(rows(300), 64, () => true)
    expect(cut.length).toBeLessThanOrEqual(64)
    expect(cut[0]).toBe(0)
    expect(cut[cut.length - 1]).toBe(299)
    expect(new Set(cut).size).toBe(cut.length)
  })

  it('hands keep the row and its index', () => {
    const seen: [number, number][] = []
    downsample(rows(100).map((n) => n * 2), 10, (r, i) => {
      seen.push([r, i])
      return false
    })
    expect(seen.length).toBeGreaterThan(0)
    for (const [r, i] of seen) expect(r).toBe(i * 2)
  })

  it('copes with nothing, one row, and a cap that is not a number', () => {
    expect(downsample([], 64, () => true)).toEqual([])
    expect(downsample([5], 64, () => true)).toEqual([5])
    expect(downsample(rows(50), Number.NaN, () => false)).toEqual([0, 49])
    expect(downsample(rows(50), 1, () => false)).toEqual([0, 49])
  })
})

// ---------------------------------------------------------------------------
// 4 and 5. LifeLine and the three screens
//
// A lazy view keeps its module for the life of the process (resetLazyViewsForTests works once), so this file runs the
// cases that need an unloaded chart first and loads the chunks once, in beforeAll of the last group. The first test
// of the first group fails loudly if anything loaded a chunk before it.

function lineGame(): GameState {
  const g = life(39)
  setSeries(g, bumpy(40))
  pinWorth(g, bumpy(40)[39]!)
  return g
}

function profileGame(): GameState {
  const g = makeTestGame(7, { age: 40 })
  setSeries(g, bumpy(41))
  pinWorth(g, bumpy(41)[40]!)
  return g
}

function deadGame(): GameState {
  const g = makeTestGame(9, { age: 70 })
  g.character.alive = false
  g.character.causeOfDeath = 'Heart Attack'
  g.ribbon = RIBBONS[0]!.id
  g.obituary = 'Test Player loved soup.'
  setSeries(g, bumpy(71))
  pinWorth(g, bumpy(71)[70]!)
  return g
}

const KEY = 'anotherlife.graveyard.v1'
const grave = (lifeId: string, extra: Record<string, unknown> = {}) => ({
  lifeId,
  generation: 1,
  name: `Grave ${lifeId}`,
  gender: 'male',
  bornYear: 1960,
  diedYear: 2040,
  age: 80,
  causeOfDeath: 'Old Age',
  netWorth: 15_000,
  occupation: 'Chef',
  ribbon: null,
  obituary: 'He cooked.',
  ...extra,
})
const bury = (...graves: object[]) => localStorage.setItem(KEY, JSON.stringify(graves))
const openGrave = (id: string) => render(createElement(GraveyardScreen, { initialOpen: id }))
const TRAIL = [0, 100, 5_000, 20_000, 15_000]

describe('before the chart chunks have loaded', () => {
  it('starts with both chunks unloaded (this group must run first)', () => {
    expect(ChartViewLazy.isReady()).toBe(false)
    expect(LazySparkline.isReady()).toBe(false)
  })

  it('4: LifeLine with the flag off renders nothing, even with a series', () => {
    expect(off(() => render(createElement(LifeLine, { g: lineGame() })))).toBe('')
  })

  it('4: LifeLine with the flag on shows the summary as a plain line until the chart has loaded', () => {
    const g = lineGame()
    const spec = netWorthSpec(g)!
    const html = on(() => render(createElement(LifeLine, { g })))
    expect(html).toBe(`<div class="life-line"><p class="life-line-text">${spec.summary}</p></div>`)
  })

  it('4: LifeLine with a null spec renders nothing', () => {
    expect(on(() => render(createElement(LifeLine, { g: life(30) })))).toBe('')
    const one = life(30)
    setSeries(one, [5_000], 30)
    pinWorth(one, 5_000)
    expect(on(() => render(createElement(LifeLine, { g: one })))).toBe('')
  })

  it('4: LifeLine reads the flag when it renders, not when the module loads', () => {
    const g = lineGame()
    expect(on(() => render(createElement(LifeLine, { g })))).not.toBe('')
    expect(off(() => render(createElement(LifeLine, { g })))).toBe('')
    expect(on(() => render(createElement(LifeLine, { g })))).not.toBe('')
  })

  it('Profile: the line sits in the Money section, after its rows, only with chartKit on', () => {
    const g = profileGame()
    mock.state.game = g
    const spec = netWorthSpec(g)!
    const offHtml = off(() => render(createElement(ProfileSheet, { onClose: () => {} })))
    expect(offHtml).toContain('Money')
    expect(offHtml).not.toContain('life-line')
    expect(offHtml).not.toContain(spec.summary)
    const onHtml = on(() => render(createElement(ProfileSheet, { onClose: () => {} })))
    expect(onHtml).toContain(`<p class="life-line-text">${spec.summary}</p>`)
    const money = onHtml.indexOf('<h3>Money</h3>')
    const line = onHtml.indexOf('life-line-text')
    const health = onHtml.indexOf('<h3>Health</h3>')
    expect(money).toBeGreaterThan(-1)
    expect(line).toBeGreaterThan(money)
    expect(line).toBeLessThan(health)
    expect(onHtml.indexOf('Bank balance')).toBeLessThan(line)
    // Nothing else moved: take the added block out and the markup is the flag-off markup.
    expect(onHtml.replace(`<div class="life-line"><p class="life-line-text">${spec.summary}</p></div>`, '')).toBe(offHtml)
  })

  it('Profile: with the flag off the markup is the same as for a life with no series', () => {
    const g = profileGame()
    const bare = structuredClone(g)
    delete bare.flags.lifeSeries
    mock.state.game = g
    const withSeries = off(() => render(createElement(ProfileSheet, { onClose: () => {} })))
    mock.state.game = bare
    const without = off(() => render(createElement(ProfileSheet, { onClose: () => {} })))
    expect(withSeries).toBe(without)
  })

  it('5: Death screen with the flag off is the one a life with no series gets (nothing was added)', () => {
    const g = deadGame()
    const bare = structuredClone(g)
    delete bare.flags.lifeSeries
    const a = off(() => render(createElement(DeathScreen, { game: g })))
    const b = off(() => render(createElement(DeathScreen, { game: bare })))
    expect(a).toBe(b)
    expect(a).not.toContain('Your life in numbers')
    expect(a).not.toContain('life-line')
  })

  it('5: Death screen with the flag on and a series has its own section titled "Your life in numbers"', () => {
    const g = deadGame()
    const spec = netWorthSpec(g)!
    const html = on(() => render(createElement(DeathScreen, { game: g })))
    expect(html).toContain('Your life in numbers')
    expect(html).toContain(`<p class="life-line-text">${spec.summary}</p>`)
    // A card of its own, after the facts card and before the next one.
    const facts = html.indexOf('death-facts')
    const title = html.indexOf('Your life in numbers')
    const journal = html.indexOf('Read Test')
    expect(title).toBeGreaterThan(facts)
    expect(title).toBeLessThan(journal)
    expect(html.slice(html.lastIndexOf('<section', title), title)).toContain('class="al-card"')
    expect(DASH.test(spec.summary)).toBe(false)
  })

  it('5: Death screen with the flag on but nothing to draw adds no empty card', () => {
    const g = deadGame()
    delete g.flags.lifeSeries
    const html = on(() => render(createElement(DeathScreen, { game: g })))
    expect(html).not.toContain('Your life in numbers')
    expect(html).toBe(off(() => render(createElement(DeathScreen, { game: g }))))
  })

  it('5: a grave shows a plain line while the sparkline is loading', () => {
    bury(grave('a', { spark: TRAIL }))
    const html = on(() => openGrave('a'))
    expect(html).toContain('<div class="grave-spark"><p class="grave-spark-text">Net worth over the life: $0 to $15K</p></div>')
    expect(html).not.toContain('<svg class="ch-spark')
  })
})

describe('once the chart chunks have loaded', () => {
  beforeAll(async () => {
    expect(await ChartViewLazy.preload()).toBe(true)
    expect(await LazySparkline.preload()).toBe(true)
  })

  it('4: LifeLine is the chart, with its title, and the plain line is gone', () => {
    const html = on(() => render(createElement(LifeLine, { g: lineGame() })))
    expect(html).toContain('<figure class="ch-frame"')
    expect(html).toContain('class="ch-title">Your net worth by age</h4>')
    expect(html).toContain('ch-tl-area')
    expect(html).not.toContain('life-line-text')
    expect(countSvgNodes(html)).toBeLessThanOrEqual(150)
    expect(DASH.test(html)).toBe(false)
  })

  it('4: LifeLine with a null spec still renders nothing, and with the flag off too', () => {
    expect(on(() => render(createElement(LifeLine, { g: life(30) })))).toBe('')
    expect(off(() => render(createElement(LifeLine, { g: lineGame() })))).toBe('')
  })

  it('5: the Death screen draws the chart in its section', () => {
    const html = on(() => render(createElement(DeathScreen, { game: deadGame() })))
    expect(html).toContain('Your life in numbers')
    expect(html).toContain('class="ch-title">Your net worth by age</h4>')
  })

  it('5: a grave with a trail shows the sparkline, above the obituary', () => {
    bury(grave('a', { spark: TRAIL }))
    const html = on(() => openGrave('a'))
    expect(html).toContain('aria-label="Net worth over the life: first $0, last $15K, low $0, high $20K"')
    expect(html).toContain('<svg class="ch-spark ch-tone-c1"')
    expect(html).not.toContain('grave-spark-text')
    expect(html.indexOf('grave-body')).toBeLessThan(html.indexOf('ch-spark'))
    expect(html.indexOf('ch-spark')).toBeLessThan(html.indexOf('He cooked.'))
  })

  it('5: a grave without a trail shows none', () => {
    bury(grave('a'))
    const html = on(() => openGrave('a'))
    expect(html).toContain('He cooked.')
    expect(html).not.toContain('Net worth over the life')
    expect(html).not.toContain('ch-spark')
    expect(html).not.toContain('grave-spark')
  })

  it('5: with the flag off a grave shows none, trail or not', () => {
    bury(grave('a', { spark: TRAIL }))
    const html = off(() => openGrave('a'))
    expect(html).toContain('He cooked.')
    expect(html).not.toContain('Net worth over the life')
    expect(html).not.toContain('ch-spark')
    expect(html).not.toContain('grave-spark')
  })

  it('5: a grave that is shut shows no trail (it is part of the open grave)', () => {
    bury(grave('a', { spark: TRAIL }))
    const html = on(() => render(createElement(GraveyardScreen)))
    expect(html).toContain('Grave a')
    expect(html).not.toContain('ch-spark')
  })

  it('5: a trail does not leak into another grave', () => {
    bury(grave('a', { spark: TRAIL }), grave('b'))
    expect(on(() => openGrave('b'))).not.toContain('ch-spark')
    expect(on(() => openGrave('a'))).toContain('ch-spark')
  })

  it('5: a hostile trail loaded through loadGraveyard shows none, and the grave still loads', () => {
    const hostile: unknown[] = [
      'text',
      7,
      {},
      [],
      [1],
      [1, 'a'],
      [1, null],
      [1, { x: 1 }],
      Array.from({ length: 41 }, (_, i) => i),
      Array.from({ length: 5000 }, (_, i) => i),
    ]
    for (const spark of hostile) {
      bury(grave('h', { spark }))
      const label = String(JSON.stringify(spark)).slice(0, 60)
      const graves = readGraves()
      expect(graves, label).toHaveLength(1)
      expect(graves[0]!.spark, label).toBeUndefined()
      const html = on(() => openGrave('h'))
      expect(html, label).toContain('He cooked.')
      expect(html, label).not.toContain('ch-spark')
      expect(html, label).not.toContain('Net worth over the life')
    }
  })

  it('5: readGraves keeps a trail whole and held in range, and drops a one point trail', () => {
    bury(grave('a', { spark: [1.4, 2.6, 1e300] }), grave('b', { spark: [5] }))
    const graves = readGraves()
    expect(graves[0]!.spark).toEqual([1, 3, 1e15])
    expect(graves[1]!.spark).toBeUndefined()
  })

  it("5: the trail reads in the money of the grave's own country and death year", () => {
    setMoneyDisplay({ mode: 'local', nominal: false })
    bury(grave('jp', { countryId: 'jp', diedYear: 2040, nominalScale: 1, usdNominalScale: 1, spark: [100_000, 200_000, 300_000] }))
    const html = on(() => openGrave('jp'))
    expect(html).toMatch(/aria-label="Net worth over the life: first [^$"]*[0-9]/)
    expect(html).not.toMatch(/aria-label="Net worth over the life: first \$/)
  })
})
