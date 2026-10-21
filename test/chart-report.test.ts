// R1-C10: the Annual Report assembler (src/game/charts/report.ts) and its one hunk in reportData (business/yearly.ts).
// With annualReport2 on, the report's data carries a `chart` the Annual Report 2.0 book reads; with it off, reportData
// builds exactly what v4.0.2 built. Every case sets the flag it needs with withFlags (the lead flips the default in the
// release commit, so no case may lean on it).
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { bestPlan } from '../src/game/business/economy'
import { marketViewOf, type MarketView } from '../src/game/business/competition'
import { formGroup } from '../src/game/business/conglomerate-actions'
import { techReportData } from '../src/game/business/deeptech-sim'
import { bizOf, businessAssets, readBiz, type BizState } from '../src/game/business/state'
import { toJson } from '../src/game/business/util'
import { reportData, yearlyBusinessImpl } from '../src/game/business/yearly'
import * as barrel from '../src/game/charts'
import { readReportCharts, reportCharts, type ReportCharts } from '../src/game/charts/report'
import { readChartSpec, type ChartSpec } from '../src/game/charts/spec'
import { resetFlags, withFlags } from '../src/game/flags'
import { migrateSave } from '../src/game/save-schema'
import type { Asset, GameState, MinigameModal } from '../src/game/types'
import { deepFreeze, jsonNodes, ownerGame } from './charts-kit'
import { chipLab } from './silicon-kit'

afterEach(() => {
  resetFlags()
})

// ---------------------------------------------------------------------------
// Fixtures

type Loose = Record<string, any>

const on = <T>(fn: () => T): T => withFlags({ annualReport2: true }, fn)
const off = <T>(fn: () => T): T => withFlags({ annualReport2: false }, fn)

/** The report data of a company with the flag on, as the queued modal holds it. */
function dataOn(g: GameState, a: Asset, b: BizState): Loose {
  return on(() => toJson(reportData(g, a, b)) as Loose)
}

/** The tile whose title is `title`. */
function tile(kpis: readonly ChartSpec[], title: string): ChartSpec {
  const t = kpis.find((k) => k.title === title)
  if (!t) throw new Error(`no ${title} tile`)
  return t
}

function lastValue(s: ChartSpec): number | null | undefined {
  return s.series[0]?.values[s.series[0].values.length - 1]
}

function lastStep(s: ChartSpec): number | undefined {
  return s.steps?.[s.steps.length - 1]?.value
}

/** An owner-CEO who has run a restaurant for eight years (the Annual Report is queued). */
let world: ReturnType<typeof ownerGame>
let good: Loose
beforeAll(() => {
  world = ownerGame({ years: 8 })
  good = dataOn(world.g, world.a, bizOf(world.g, world.a)).chart as Loose
}, 120_000)

// ---------------------------------------------------------------------------
// The flag

describe('reportData and the annualReport2 flag', () => {
  it('off: no chart key, and every other key is exactly what the flag-on call builds without it', () => {
    const { g, a } = world
    const b = bizOf(g, a)
    const dark = off(() => reportData(g, a, b))
    expect('chart' in dark).toBe(false)
    expect(Object.keys(dark)).not.toContain('chart')
    const lit = on(() => reportData(g, a, b))
    expect(lit.chart).toBeDefined()
    const { chart: _chart, ...rest } = lit
    expect(dark).toEqual(rest)
    expect(Object.keys(dark)).toEqual(Object.keys(rest))
  })

  it('off: the data is plain JSON with no chart anywhere in it', () => {
    const { g, a } = world
    const dark = off(() => toJson(reportData(g, a, bizOf(g, a))))
    expect(JSON.stringify(dark)).not.toContain('"waterfall"')
    expect(JSON.stringify(dark)).not.toContain('"kpi"')
  })

  it('reportData writes nothing and draws no random number, with the flag on', () => {
    const { g, a } = world
    const before = JSON.stringify(g)
    const rng = g.rng
    on(() => reportData(g, a, bizOf(g, a)))
    expect(g.rng).toBe(rng)
    expect(JSON.stringify(g)).toBe(before)
  })
})

// ---------------------------------------------------------------------------
// The assembled report

describe('the chart a report carries', () => {
  it('reads back, has four tiles and ties every number to the books', () => {
    const { g, a } = world
    const b = bizOf(g, a)
    const s = b.last!
    const chart = readReportCharts(dataOn(g, a, b).chart)
    expect(chart).not.toBeNull()
    const c = chart!
    expect(c.v).toBe(1)
    expect(c.year).toBe(s.year)
    expect(Number.isInteger(c.basis)).toBe(true)
    expect(c.verdict.length).toBeGreaterThan(0)
    expect(c.verdict.length).toBeLessThanOrEqual(120)
    expect(c.kpis).toHaveLength(4)
    for (const k of c.kpis) {
      expect(k.kind).toBe('kpi')
      expect(k.series).toHaveLength(1)
    }
    expect(lastValue(tile(c.kpis, 'Net profit'))).toBe(Math.round(s.net))
    expect(lastValue(tile(c.kpis, 'Sales'))).toBe(Math.round(s.revenue))
    expect(lastValue(tile(c.kpis, 'Cash'))).toBe(Math.round(b.cash))
    expect(lastValue(tile(c.kpis, 'Value'))).toBe(Math.round(b.valuation))
    expect(c.pl.kind).toBe('waterfall')
    expect(lastStep(c.pl)).toBe(Math.round(s.net))
    expect(lastStep(c.summary)).toBe(Math.round(s.net))
    expect(c.summary.steps!.length).toBeLessThanOrEqual(c.pl.steps!.length)
    expect(c.cash).toBeDefined()
    expect(lastStep(c.cash!)).toBe(Math.round(b.cash))
  })

  it('carries the optional members the company has the history for, each a valid spec', () => {
    const { g, a } = world
    const c = readReportCharts(dataOn(g, a, bizOf(g, a)).chart)!
    for (const key of ['bridge', 'profit', 'costs', 'cash', 'cashLines'] as const) {
      expect(c[key], key).toBeDefined()
      expect(readChartSpec(c[key]), key).not.toBeNull()
    }
    for (const key of ['share', 'ladder', 'size'] as const) if (c[key]) expect(readChartSpec(c[key]), key).not.toBeNull()
    expect(c.profit!.kind).toBe('line')
    expect(c.costs!.kind).toBe('stack')
    expect(c.bridge!.kind).toBe('waterfall')
  })

  it('has market members when the market is booked, and the Value tile names the rank', () => {
    const { g, a } = world
    const b = readBiz(g, a)
    const view = marketViewOf(g, b)
    const c = reportCharts(g, a, b, view)!
    expect(view.booked).toBe(true)
    expect(c.size).toBeDefined()
    expect(c.ladder).toBeDefined()
    expect(tile(c.kpis, 'Value').note).toMatch(/^#\d+ of \d+$/)
  })

  it('stays under 3,000 JSON nodes', () => {
    const { g, a } = world
    const data = dataOn(g, a, bizOf(g, a))
    expect(jsonNodes(data.chart)).toBeLessThan(3000)
  })

  it('is JSON that survives a round trip unchanged', () => {
    const { g, a } = world
    const chart = dataOn(g, a, bizOf(g, a)).chart
    expect(JSON.parse(JSON.stringify(chart))).toEqual(chart)
    expect(readReportCharts(chart)).toEqual(chart)
  })

  it('every member is something readChartSpec accepts, whatever reportCharts returns', () => {
    const { g, a } = world
    const b = readBiz(g, a)
    const c = reportCharts(g, a, b, marketViewOf(g, b))!
    const specs: unknown[] = [...c.kpis, c.summary, c.pl, c.bridge, c.profit, c.costs, c.cash, c.cashLines, c.share, c.ladder, c.size]
    for (const s of specs) if (s !== undefined) expect(readChartSpec(s)).not.toBeNull()
    expect(readReportCharts(toJson(c))).toEqual(toJson(c))
  })

  it('has no market members, and a stake note, when the view is null', () => {
    const { g, a } = world
    const b = readBiz(g, a)
    const c = reportCharts(g, a, b, null)!
    expect(c).not.toBeNull()
    expect(c.share).toBeUndefined()
    expect(c.ladder).toBeUndefined()
    expect(c.size).toBeUndefined()
    expect('share' in c || 'ladder' in c || 'size' in c).toBe(false)
    expect(tile(c.kpis, 'Value').note).toMatch(/^Your stake /)
    expect(c.kpis).toHaveLength(4)
    expect(c.pl).toBeDefined()
    expect(c.profit).toBeDefined()
  })

  it('has no market members when the view is not booked', () => {
    const { g, a } = world
    const b = readBiz(g, a)
    const view = { ...marketViewOf(g, b), booked: false } as MarketView
    const c = reportCharts(g, a, b, view)!
    expect(c.share).toBeUndefined()
    expect(c.ladder).toBeUndefined()
    expect(c.size).toBeUndefined()
    expect(tile(c.kpis, 'Value').note).toMatch(/^Your stake /)
  })

  it('drops one member, not the report, when its builder throws', () => {
    const { g, a } = world
    const b = readBiz(g, a)
    const real = marketViewOf(g, b)
    // A booked view whose history cannot be read: the share line, the ladder and the size tile all read it.
    const broken = new Proxy(real, {
      get(target, key, receiver) {
        if (key === 'history') throw new Error('history is unreadable')
        return Reflect.get(target, key, receiver)
      },
    })
    const c = reportCharts(g, a, b, broken)
    expect(c).not.toBeNull()
    expect(c!.share).toBeUndefined()
    expect(c!.ladder).toBeUndefined()
    expect(c!.size).toBeUndefined()
    expect(c!.pl).toBeDefined()
    expect(c!.profit).toBeDefined()
    expect(c!.kpis).toHaveLength(4)
  })

  it('never throws, even when the view throws on every read', () => {
    const { g, a } = world
    const b = readBiz(g, a)
    const everything = new Proxy({} as MarketView, {
      get() {
        throw new Error('no reads allowed')
      },
    })
    expect(() => reportCharts(g, a, b, everything)).not.toThrow()
    const c = reportCharts(g, a, b, everything)
    expect(c === null || (readReportCharts(toJson(c)) !== null && c.share === undefined)).toBe(true)
  })

  it('exports from the charts barrel', () => {
    expect(barrel.reportCharts).toBe(reportCharts)
    expect(barrel.readReportCharts).toBe(readReportCharts)
  })
})

// ---------------------------------------------------------------------------
// Companies that cannot be charted

describe('no chart', () => {
  it('a first-year company (no statement) gets no chart key and a null assembler', () => {
    const { g, a } = ownerGame({ years: 0 })
    const b = bizOf(g, a)
    expect(b.last).toBeNull()
    expect(reportCharts(g, a, b, null)).toBeNull()
    expect(reportCharts(g, a, b, marketViewOf(g, b))).toBeNull()
    const data = on(() => reportData(g, a, b))
    expect('chart' in data).toBe(false)
    expect(data.lines[0]!.label).toBe('First year')
  })

  it('a deep-tech company: techReportData has no chart, with the flag on', () => {
    const L = chipLab({ year: 2025 })
    const data = on(() => techReportData(L.g, L.a, L.b))
    expect('chart' in data).toBe(false)
  })

  it('a statement that is not a number gives null, not a throw', () => {
    const { g, a } = world
    const b = readBiz(g, a)
    const ruined = { ...b, last: { ...b.last!, net: Number.NaN, pbt: Number.NaN, netRevenue: Number.POSITIVE_INFINITY } } as BizState
    expect(() => reportCharts(g, a, ruined, null)).not.toThrow()
    expect(reportCharts(g, a, ruined, null)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Twice, and in a group

describe('the group refresh', () => {
  it('reportData twice for one company gives equal data', () => {
    const { g, a } = world
    const b = bizOf(g, a)
    const first = dataOn(g, a, b)
    const second = dataOn(g, a, b)
    expect(second).toEqual(first)
    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
  })

  it('two companies formed into a group: a yearly pass leaves a valid chart on every queued report, refreshed or not', () => {
    const { g, a, others } = ownerGame({ years: 3, companies: 2 })
    expect(others).toHaveLength(1)
    expect(formGroup(g, [a.id, others[0]!.id], 'Holdings')).toBe(true)
    g.queue = []
    const mine = bizOf(g, a)
    const plan = bestPlan(g, mine)
    mine.price = plan.price
    mine.production = plan.production
    g.year += 1
    // A group invoice on the books: the yearly pass then refreshes every queued statement (yearly.ts "Refresh already queued").
    g.flags.groupServicesSettled = g.year - 1
    g.flags.groupServiceResults = [{ group: 'none', provider: 'p', customer: a.id, invoice: 1, saved: 1, year: g.year - 1, chips: true }]
    on(() => yearlyBusinessImpl(g))
    // The refresh loop's condition still held after the pass, so it re-called reportData for every queued report.
    expect(g.flags.groupServiceResults).toHaveLength(1)
    const reports = g.queue.filter((m): m is MinigameModal => m.kind === 'minigame' && m.game === 'annualReport')
    expect(reports.length).toBeGreaterThan(0)
    for (const m of reports) {
      const data = m.data as Loose
      const chart = readReportCharts(data.chart)
      expect(chart, String(data.assetId)).not.toBeNull()
      expect(chart!.kpis).toHaveLength(4)
      // The statement members are the books of record: a fresh build from the same statement gives the same charts. (The
      // group treasury moves cash after the refresh, so the cash and value members are not compared.)
      const asset = businessAssets(g).find((x) => x.id === data.assetId)!
      const fresh = readReportCharts(dataOn(g, asset, bizOf(g, asset)).chart)!
      expect(chart!.year).toBe(bizOf(g, asset).last!.year)
      for (const key of ['pl', 'summary', 'bridge', 'profit', 'costs'] as const) expect(chart![key], key).toEqual(fresh[key])
      expect(lastStep(chart!.pl)).toBe(Math.round(bizOf(g, asset).last!.net))
    }
  }, 120_000)

  it('the same pass with the flag off queues reports with no chart', () => {
    const { g, a, others } = ownerGame({ years: 3, companies: 2 })
    expect(formGroup(g, [a.id, others[0]!.id], 'Holdings')).toBe(true)
    g.queue = []
    const mine = bizOf(g, a)
    const plan = bestPlan(g, mine)
    mine.price = plan.price
    mine.production = plan.production
    g.year += 1
    off(() => yearlyBusinessImpl(g))
    const reports = g.queue.filter((m): m is MinigameModal => m.kind === 'minigame' && m.game === 'annualReport')
    expect(reports.length).toBeGreaterThan(0)
    for (const m of reports) expect('chart' in (m.data as Loose)).toBe(false)
  }, 120_000)
})

// ---------------------------------------------------------------------------
// Pure of simulation: the flag changes nothing but the data

describe('the flag changes presentation only', () => {
  it('a played year ends in the same state with the flag on and off (the queued report differs by its chart)', () => {
    const play = (flag: boolean): GameState => {
      const w = ownerGame({ years: 4 })
      const g = w.g
      g.queue = []
      const mine = bizOf(g, w.a)
      const plan = bestPlan(g, mine)
      mine.price = plan.price
      mine.production = plan.production
      withFlags({ annualReport2: flag }, () => ageUp(g))
      return g
    }
    const dark = play(false)
    const lit = play(true)
    expect(lit.rng).toBe(dark.rng)
    const strip = (g: GameState): unknown => {
      const copy = JSON.parse(JSON.stringify(g)) as GameState
      for (const m of copy.queue) if (m.kind === 'minigame' && m.game === 'annualReport') delete (m.data as Loose).chart
      return copy
    }
    expect(strip(lit)).toEqual(strip(dark))
    const litReport = lit.queue.find((m) => m.kind === 'minigame' && m.game === 'annualReport') as MinigameModal | undefined
    expect(readReportCharts((litReport?.data as Loose | undefined)?.chart)).not.toBeNull()
  }, 120_000)
})

// ---------------------------------------------------------------------------
// The reader

describe('readReportCharts', () => {
  const copy = (): Loose => structuredClone(good)
  const read = (v: unknown): ReportCharts | null => readReportCharts(v)

  it('reads the data it was given, as a fresh object', () => {
    const input = copy()
    const out = read(input)
    expect(out).toEqual(input)
    expect(out).not.toBe(input)
    expect(out!.pl).not.toBe(input.pl)
    expect(out!.kpis).not.toBe(input.kpis)
  })

  it('reads a deeply frozen blob without writing to it', () => {
    const frozen = deepFreeze(copy())
    expect(read(frozen)).toEqual(good)
  })

  const hostile: [string, () => unknown][] = [
    ['null', () => null],
    ['undefined', () => undefined],
    ['a string', () => 'chart'],
    ['a number', () => 7],
    ['NaN', () => Number.NaN],
    ['true', () => true],
    ['an empty array', () => []],
    ['an array holding the blob', () => [copy()]],
    ['a function', () => () => copy()],
    ['no v', () => ({ ...copy(), v: undefined })],
    ['v 2', () => ({ ...copy(), v: 2 })],
    ['v as a string', () => ({ ...copy(), v: '1' })],
    ['no pl', () => ({ ...copy(), pl: undefined })],
    ['pl null', () => ({ ...copy(), pl: null })],
    ['pl a string', () => ({ ...copy(), pl: 'waterfall' })],
    ['pl with a NaN step', () => {
      const c = copy()
      c.pl.steps[1].value = Number.NaN
      return c
    }],
    ['pl with an infinite step', () => {
      const c = copy()
      c.pl.steps[0].value = Number.POSITIVE_INFINITY
      return c
    }],
    ['pl with one step', () => {
      const c = copy()
      c.pl.steps = c.pl.steps.slice(0, 1)
      return c
    }],
    ['no summary', () => ({ ...copy(), summary: undefined })],
    ['summary with a NaN step', () => {
      const c = copy()
      c.summary.steps[1].value = Number.NaN
      return c
    }],
    ['six members of junk', () => ({ v: 1, year: 2030, basis: 2025, verdict: 'x', kpis: 'junk', summary: 1, pl: [], bridge: 'a', profit: 2, costs: {} })],
    ['year a fraction', () => ({ ...copy(), year: 2030.5 })],
    ['year a string', () => ({ ...copy(), year: '2030' })],
    ['year NaN', () => ({ ...copy(), year: Number.NaN })],
    ['year 0', () => ({ ...copy(), year: 0 })],
    ['year 10000', () => ({ ...copy(), year: 10_000 })],
    ['year infinite', () => ({ ...copy(), year: Number.POSITIVE_INFINITY })],
    ['no year', () => ({ ...copy(), year: undefined })],
    ['basis below range', () => ({ ...copy(), basis: 1799 })],
    ['basis above range', () => ({ ...copy(), basis: 2301 })],
    ['basis a fraction', () => ({ ...copy(), basis: 2025.5 })],
    ['basis NaN', () => ({ ...copy(), basis: Number.NaN })],
    ['no basis', () => ({ ...copy(), basis: undefined })],
    ['a prototype that holds the data', () => Object.create(copy())],
    ['a class instance', () => {
      class Blob {}
      return Object.assign(new Blob(), copy())
    }],
    ['a Map', () => new Map(Object.entries(copy()))],
    ['__proto__ carrying the members', () => {
      const c = copy()
      return JSON.parse(`{"__proto__":${JSON.stringify({ pl: c.pl, summary: c.summary, v: 1, year: c.year, basis: c.basis })}}`)
    }],
  ]

  it.each(hostile)('is null for %s', (_name, make) => {
    expect(read(make())).toBeNull()
  })

  it('does not pollute Object.prototype, and carries no __proto__ key, for a __proto__ member', () => {
    const c = copy()
    const text = JSON.stringify({ ...c, extra: 1 }).replace('"extra":1', '"__proto__":{"polluted":"yes","pl":{}}')
    const out = read(JSON.parse(text))
    expect(out).not.toBeNull()
    expect(({} as Loose).polluted).toBeUndefined()
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype)
    expect(Object.keys(out!)).not.toContain('__proto__')
    expect(Object.prototype.hasOwnProperty.call(out, '__proto__')).toBe(false)
  })

  it('drops keys it does not know', () => {
    const out = read({ ...copy(), surprise: 'yes', nested: { a: 1 } }) as Loose
    expect(out.surprise).toBeUndefined()
    expect(out.nested).toBeUndefined()
    expect(Object.keys(out).sort()).toEqual(Object.keys(good).sort())
  })

  it('keeps the rest when one optional member is broken', () => {
    const keys = ['bridge', 'profit', 'costs', 'cash', 'cashLines', 'share', 'ladder', 'size'] as const
    for (const key of keys) {
      if (good[key] === undefined) continue
      const c = copy()
      c[key].series = 'broken'
      const out = read(c) as Loose
      expect(out, key).not.toBeNull()
      expect(out[key], key).toBeUndefined()
      for (const other of keys) if (other !== key) expect(out[other], `${key} then ${other}`).toEqual(good[other])
      expect(out.pl).toEqual(good.pl)
      expect(out.kpis).toEqual(good.kpis)
    }
  })

  it('drops an optional member with a poisoned series id, a NaN or a string for a spec', () => {
    const c = copy()
    c.profit.series[0].id = '__proto__'
    c.cashLines = 'text'
    c.costs.series[0].values[0] = Number.NaN
    const out = read(c)!
    expect(out.profit).toBeUndefined()
    expect(out.cashLines).toBeUndefined()
    expect(out.costs).toBeUndefined()
    expect(out.cash).toEqual(good.cash)
    expect(out.summary).toEqual(good.summary)
  })

  it('keeps the valid tiles and drops the broken ones', () => {
    const c = copy()
    c.kpis[1] = { junk: true }
    c.kpis[2].series[0].values[0] = Number.NaN
    const out = read(c)!
    expect(out.kpis).toEqual([good.kpis[0], good.kpis[3]])
  })

  it('drops a tile that is not a one-series kpi', () => {
    const c = copy()
    c.kpis[0] = good.pl
    c.kpis[1].series.push({ ...c.kpis[1].series[0], id: 'second' })
    const out = read(c)!
    expect(out.kpis).toEqual([good.kpis[2], good.kpis[3]])
  })

  it('has no tiles when kpis is missing or not a list, and the rest still reads', () => {
    for (const kpis of [undefined, null, 'tiles', 7, {}, { length: 4 }]) {
      const out = read({ ...copy(), kpis })
      expect(out, String(kpis)).not.toBeNull()
      expect(out!.kpis).toEqual([])
      expect(out!.pl).toEqual(good.pl)
    }
  })

  it('keeps the first four of ten thousand tiles, touching almost none of them', () => {
    let reads = 0
    const tiles = Array.from({ length: 10_000 }, () => good.kpis[0])
    const spy = new Proxy(tiles, {
      get(target, key, receiver) {
        if (typeof key === 'string' && /^\d+$/.test(key)) reads++
        return Reflect.get(target, key, receiver)
      },
    })
    const out = read({ ...copy(), kpis: spy })!
    expect(out.kpis.length).toBeLessThanOrEqual(4)
    expect(out.kpis.length).toBeGreaterThan(0)
    expect(reads).toBeLessThan(20)
    const junk = Array.from({ length: 10_000 }, () => 'junk')
    expect(read({ ...copy(), kpis: junk })!.kpis).toEqual([])
  })

  it('reads a verdict of 120 characters and refuses 121, a number or a control character', () => {
    expect(read({ ...copy(), verdict: 'v'.repeat(120) })!.verdict).toBe('v'.repeat(120))
    expect(read({ ...copy(), verdict: 'v'.repeat(121) })!.verdict).toBe('')
    expect(read({ ...copy(), verdict: 12 })!.verdict).toBe('')
    expect(read({ ...copy(), verdict: null })!.verdict).toBe('')
    expect(read({ ...copy(), verdict: undefined })!.verdict).toBe('')
    expect(read({ ...copy(), verdict: 'bad\u0000text' })!.verdict).toBe('')
    expect(read({ ...copy(), verdict: 'x'.repeat(5_000_000) })!.verdict).toBe('')
  })

  it('refuses a spec with a string a hostile blob made huge, without walking it', () => {
    const c = copy()
    c.profit.title = 't'.repeat(5_000_000)
    c.profit.summary = 's'.repeat(5_000_000)
    const out = read(c)!
    expect(out.profit).toBeUndefined()
    expect(out.pl).toEqual(good.pl)
  })

  it('refuses a spec with a ten-million element array without walking it', () => {
    const c = copy()
    c.profit.x = new Array(10_000_000).fill(1)
    const out = read(c)!
    expect(out.profit).toBeUndefined()
    c.pl.steps = new Array(10_000_000).fill({ label: 'x', value: 1, kind: 'delta' })
    expect(read(c)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Old saves

describe('the v4.0.2 fixture', () => {
  it('charts every company that has a statement, with the profit line and no cash or cost detail', () => {
    const raw = JSON.parse(gunzipSync(readFileSync('test/fixtures/save-v1.json.gz')).toString()) as Record<string, unknown>
    const result = migrateSave(structuredClone(raw))
    expect(result.kind).toBe('ready')
    if (result.kind !== 'ready') return
    const game = result.game
    let charted = 0
    for (const a of businessAssets(game)) {
      const b = readBiz(game, a)
      const c = reportCharts(game, a, b, marketViewOf(game, b))
      if (!b.last) {
        expect(c, a.name).toBeNull()
        continue
      }
      expect(c, a.name).not.toBeNull()
      charted++
      expect(c!.cash, a.name).toBeUndefined()
      expect(c!.costs, a.name).toBeUndefined()
      expect(c!.profit, a.name).toBeDefined()
      expect(readReportCharts(toJson(c))).not.toBeNull()
      // And through the report itself, from the mutable view the yearly loop uses.
      const data = on(() => toJson(reportData(game, a, bizOf(game, a))) as Loose)
      expect(readReportCharts(data.chart), a.name).not.toBeNull()
    }
    expect(charted).toBeGreaterThan(0)
  }, 120_000)
})
