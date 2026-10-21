// R1-C14: ladders, sparklines and score charts wired into the screens that already show the numbers as text.
//   - lineSpec and growthSpec (src/game/charts/ranks.ts): a plain line, and "what 100 would have become"
//   - Leaderboard and History (market-menu), Benchmarks (deeptech-menu), device specs (devices-menu), the career
//     standings (special/kit/menu), the nation dashboard and the stock offers get one chart row each, through chartInfo
//   - stockTrail (investments.ts): ten years of one company's quote, oldest first, settled years only, no dice
//   - MenuRow draws node.spark through LazySparkline at the end of the row; a throwing spark is reported, not fatal
// Flags are always set with withFlags, so the lead's release flip cannot change what these tests mean.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { devicesMenu } from '../src/game/business/devices-menu'
import { buildFabAction } from '../src/game/business/manage'
import { historyMenu, leaderboardMenu } from '../src/game/business/market-menu'
import { bizOf } from '../src/game/business/state'
import { growthSpec, lineSpec } from '../src/game/charts/ranks'
import { readChartSpec, type ChartSpec } from '../src/game/charts/spec'
import { withFlags } from '../src/game/flags'
import { investmentListing, investmentsMenu, stockTrail } from '../src/game/investments'
import { companyDef, exchangeInfo, exchangeYear } from '../src/game/invest/engine'
import { addMarketShock } from '../src/game/invest/shocks'
import { dashboardMenu } from '../src/game/nation/menu'
import { editPolicy, writePolicy } from '../src/game/nation/state'
import { standingMenu } from '../src/game/special/kit/menu'
import { standingOf } from '../src/game/special/kit/rivals'
import { MUSIC_SPEC } from '../src/game/special/music-market'
import { musicStanding } from '../src/game/special/music-menu'
import { musicStore, type MusicState } from '../src/game/special/music-state'
import { timelineFamily } from '../src/game/timeMachine'
import type { Asset, GameState, MenuAction, MenuGroup, MenuInfo, MenuNode } from '../src/game/types'
import { infoChart, infoText } from '../src/ui/components/menuModel'
import { lab, node, offBest, rated } from './ai-bench-kit'
import { careerRoots, newCareerGame, nextYear, type CareerId } from './career-kit'
import { deepFreeze, ownerGame } from './charts-kit'
import { adult, company } from './market-kit'
import { newLeader } from './politics-kit'

// The store is mocked the way test/books-menu.test.ts does it: MenuRow only needs getApp and runMenuAction.
const mock = vi.hoisted(() => ({ state: { game: null as unknown } }))
vi.mock('../src/ui/store', () => ({
  useApp: (sel: (s: typeof mock.state) => unknown) => sel(mock.state),
  getApp: () => mock.state,
  runMenuAction: () => {},
}))

// The foresight spy of test/foresight-scan.test.ts: every year the market engine is asked for.
const asked = vi.hoisted(() => ({ years: [] as number[] }))
vi.mock('../src/game/invest/engine', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/game/invest/engine')>()
  return {
    ...real,
    exchangeYear: (...args: Parameters<typeof real.exchangeYear>) => {
      asked.years.push(args[3])
      return real.exchangeYear(...args)
    },
  }
})

const ON = { chartKit: true }
const OFF = { chartKit: false }
const DASHES = new RegExp('[' + String.fromCharCode(0x2013) + String.fromCharCode(0x2014) + ']')

let errors: MockInstance<typeof console.error>
beforeEach(() => {
  errors = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  errors.mockRestore()
})

// ---------------------------------------------------------------------------
// Helpers

/** The ids the chart rows of this task add. The plan names them by hand: not every one contains ".chart". */
const NEW_ID = /\.chart(\.|$)|^inv-ochart-|^dt\.bench\.caps\./
const isNew = (id: string): boolean => NEW_ID.test(id)

const isInfo = (n: MenuNode): n is MenuInfo => n.type === 'info'
const isGroup = (n: MenuNode): n is MenuGroup => n.type === 'menu'

function expectValid(spec: ChartSpec | null): asserts spec is ChartSpec {
  expect(spec).not.toBeNull()
  expect(readChartSpec(spec)).not.toBeNull()
}

/** Every node under `nodes`, groups opened down to `depth`. */
function walk(g: GameState, nodes: MenuNode[], depth = 4): MenuNode[] {
  return nodes.flatMap((n) => (isGroup(n) && depth > 0 ? [n, ...walk(g, n.children(g), depth - 1)] : [n]))
}

function groupNamed(g: GameState, nodes: MenuNode[], id: string): MenuGroup {
  const found = walk(g, nodes).find((n): n is MenuGroup => isGroup(n) && n.id === id)
  if (!found) throw new Error(`no group ${id}`)
  return found
}

/** The chart of a row, read the way the menu reads it. */
function chartOf(n: MenuNode, g: GameState): ChartSpec | null {
  return isInfo(n) ? infoChart(n, g) : null
}

const slug = (family: string): string => family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// ---------------------------------------------------------------------------
// Scenarios. Each one knows how to list the children of one screen for a given state.

interface Scenario {
  name: string
  g: GameState
  /** The children of the screen. */
  kids: (g: GameState) => MenuNode[]
  /** The ids the chart rows add with the flag on, in the order they show. */
  added: string[]
}

let owned: ReturnType<typeof ownerGame>
let aiLab: ReturnType<typeof lab>
let unrated: ReturnType<typeof lab>
let devs: { g: GameState; a: Asset }
let music: GameState
let leader: GameState
let broker: GameState

function buildDevices(): { g: GameState; a: Asset } {
  const g = adult(5, 2026, 'us')
  const a = company(g, 'devices', { cash: 5e9 })
  const b = bizOf(g, a)
  b.products = ['Smartphone', 'Laptop'].map((family) => ({ name: family, launched: 2025, boost: 0, quality: 60, family, kind: 'core' as const }))
  return { g, a }
}

beforeAll(() => {
  owned = ownerGame({ seed: 1, years: 8, companies: 1 })

  aiLab = lab({}, 2027)
  aiLab.t.models = [rated(aiLab.fam, 1, 2024, offBest(aiLab.fam, 2024, 0)), rated(aiLab.fam, 2, 2026, offBest(aiLab.fam, 2026, 30))]
  unrated = lab({}, 2027)

  devs = buildDevices()

  music = newCareerGame('music', 5)
  for (let i = 0; i < 4; i++) nextYear(music)

  leader = newLeader(7)
  const p = editPolicy(leader, leader.character.countryId)
  p.reports = Array.from({ length: 12 }, (_, i) => ({
    year: leader.year - 11 + i,
    growth: 0.02,
    unemployment: 0.05,
    inflation: 0.02,
    debt: 0.6,
    deficit: 0.03,
    approval: 40 + i * 2,
    rating: 'A',
  }))
  writePolicy(leader, p)

  broker = adult(1, 2026, 'us')
})

function scenarios(): Scenario[] {
  const { g, a } = owned
  const out: Scenario[] = [
    { name: 'leaderboard', g, kids: (s) => leaderboardMenu(a).children(s), added: [`biz.mkt.lb.chart.${a.id}`] },
    { name: 'history', g, kids: (s) => historyMenu(a).children(s), added: [`biz.mkt.hist.chart.${a.id}`, `biz.mkt.hist.size.chart.${a.id}`] },
    {
      name: 'benchmarks',
      g: aiLab.g,
      kids: (s) => (node(s, aiLab.a, 'dt.bench') as MenuGroup).children(s),
      added: [`dt.bench.chart.${aiLab.a.id}`, `dt.bench.caps.${aiLab.a.id}`],
    },
  ]
  for (const family of ['laptop', 'smartphone']) {
    out.push({
      name: `device specs, ${family}`,
      g: devs.g,
      kids: (s) => groupNamed(s, devicesMenu(devs.a, buildFabAction(devs.a)).children(s), `biz.devices.spec.${devs.a.id}.${family}`).children(s),
      added: [`biz.devices.spec.chart.${devs.a.id}.${family}`],
    })
  }
  out.push(
    { name: 'music standing', g: music, kids: (s) => musicStanding.children(s), added: ['music.standing.chart', 'music.standing.peers.chart'] },
    { name: 'nation dashboard', g: leader, kids: (s) => dashboardMenu().children(s), added: ['nation.dash.approval.chart'] },
  )
  return out
}

// ---------------------------------------------------------------------------
// 1. The flag

describe('the chartKit flag', () => {
  it('adds the chart rows with the flag on, in the stated places, and moves nothing that was there', () => {
    for (const sc of scenarios()) {
      const off = withFlags(OFF, () => sc.kids(sc.g))
      const on = withFlags(ON, () => sc.kids(sc.g))
      expect(off.filter((n) => isNew(n.id)).map((n) => n.id), `${sc.name} off`).toEqual([])
      expect(on.filter((n) => isNew(n.id)).map((n) => n.id), `${sc.name} on`).toEqual(sc.added)
      expect(on.filter((n) => !isNew(n.id)).map((n) => n.id), `${sc.name} order`).toEqual(off.map((n) => n.id))
      for (const n of on.filter((x) => isNew(x.id))) expect(n.type, n.id).toBe('info')
    }
  })

  it('puts the leaderboard chart first, the history charts beside their text rows, the approval chart after the meters', () => {
    const { g, a } = owned
    const lb = withFlags(ON, () => leaderboardMenu(a).children(g))
    expect(lb[0]!.id).toBe(`biz.mkt.lb.chart.${a.id}`)
    const hist = withFlags(ON, () => historyMenu(a).children(g)).map((n) => n.id)
    expect(hist.indexOf(`biz.mkt.hist.chart.${a.id}`)).toBe(hist.indexOf(`biz.mkt.hist.me.${a.id}`) + 1)
    expect(hist.indexOf(`biz.mkt.hist.size.chart.${a.id}`)).toBe(hist.indexOf(`biz.mkt.hist.size.${a.id}`) + 1)
    const nation = withFlags(ON, () => dashboardMenu().children(leader)).map((n) => n.id)
    expect(nation.indexOf('nation.dash.approval.chart')).toBe(nation.indexOf('nation.dash.meters') + 1)
    const standing = withFlags(ON, () => musicStanding.children(music)).map((n) => n.id)
    expect(standing.indexOf('music.standing.chart')).toBeGreaterThan(standing.indexOf('music.standing.standing'))
  })

  it('shows no benchmark chart for a lab with no rated model', () => {
    const kids = withFlags(ON, () => (node(unrated.g, unrated.a, 'dt.bench') as MenuGroup).children(unrated.g))
    expect(kids.filter((n) => isNew(n.id))).toEqual([])
  })

  it('reads the flag when the rows are asked for, not when the module loads', () => {
    const { g, a } = owned
    expect(withFlags(ON, () => leaderboardMenu(a).children(g)).some((n) => isNew(n.id))).toBe(true)
    expect(withFlags(OFF, () => leaderboardMenu(a).children(g)).some((n) => isNew(n.id))).toBe(false)
    expect(withFlags(ON, () => leaderboardMenu(a).children(g)).some((n) => isNew(n.id))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 2. Each wired chart is a valid spec

describe('the wired charts', () => {
  it('draw a valid spec of the right kind for a company with booked years', () => {
    const { g, a } = owned
    const lb = withFlags(ON, () => leaderboardMenu(a).children(g))
    const ladder = chartOf(lb[0]!, g)
    expectValid(ladder)
    expect(ladder.kind).toBe('ladder')
    expect(ladder.rows!.some((r) => r.you === true)).toBe(true)

    const hist = withFlags(ON, () => historyMenu(a).children(g))
    const share = chartOf(hist.find((n) => n.id === `biz.mkt.hist.chart.${a.id}`)!, g)
    expectValid(share)
    expect(share.kind).toBe('line')
    expect(share.unit).toBe('pct')
    const size = chartOf(hist.find((n) => n.id === `biz.mkt.hist.size.chart.${a.id}`)!, g)
    expectValid(size)
    expect(size.kind).toBe('kpi')
    expect(size.unit).toBe('money')
  })

  it('draw the benchmark line and the capability scorecard of a rated lab', () => {
    const kids = withFlags(ON, () => (node(aiLab.g, aiLab.a, 'dt.bench') as MenuGroup).children(aiLab.g))
    const line = chartOf(kids.find((n) => n.id === `dt.bench.chart.${aiLab.a.id}`)!, aiLab.g)
    expectValid(line)
    expect(line.kind).toBe('line')
    expect(line.title).toBe('Overall benchmark score')
    // The lab's first model is from 2024 and the board is for 2026 (last year): the years before it are gaps, never zeros.
    expect(line.x[line.x.length - 1]).toBe(2026)
    expect(line.x.every((x) => typeof x === 'number' && x <= 2026)).toBe(true)
    expect(line.series[0]!.values.every((v) => v === null || v > 0)).toBe(true)
    expect(line.series[0]!.values.filter((v) => v !== null).length).toBeGreaterThanOrEqual(2)
    const caps = chartOf(kids.find((n) => n.id === `dt.bench.caps.${aiLab.a.id}`)!, aiLab.g)
    expectValid(caps)
    expect(caps.kind).toBe('meter')
    expect(caps.title).toBe('Where your best model stands')
    expect(caps.x.length).toBeGreaterThanOrEqual(1)
  })

  it('draw the device scorecard against the market for each kind of hardware', () => {
    for (const family of ['laptop', 'smartphone']) {
      const kids = withFlags(ON, () => groupNamed(devs.g, devicesMenu(devs.a, buildFabAction(devs.a)).children(devs.g), `biz.devices.spec.${devs.a.id}.${family}`).children(devs.g))
      const row = kids.find((n) => n.id === `biz.devices.spec.chart.${devs.a.id}.${slug(family)}`)!
      const spec = chartOf(row, devs.g)
      expectValid(spec)
      expect(spec.kind).toBe('meter')
      expect(spec.title.toLowerCase()).toContain(family)
      expect(spec.x).toHaveLength(2)
    }
  })

  it('draw the career standing line and the peer ladder', () => {
    const kids = withFlags(ON, () => musicStanding.children(music))
    const line = chartOf(kids.find((n) => n.id === 'music.standing.chart')!, music)
    expectValid(line)
    expect(line.kind).toBe('line')
    expect(line.unit).toBe('rank')
    expect(line.title).toBe('Your rank by year')
    const peers = chartOf(kids.find((n) => n.id === 'music.standing.peers.chart')!, music)
    expectValid(peers)
    expect(peers.kind).toBe('ladder')
    const mine = peers.rows!.filter((r) => r.you === true)
    expect(mine).toHaveLength(1)
    expect(mine[0]!.prev).toBeNull()
    expect(mine[0]!.prevRank).toBeNull()
  })

  it('draw the nation approval line from twelve yearly reports', () => {
    const kids = withFlags(ON, () => dashboardMenu().children(leader))
    const spec = chartOf(kids.find((n) => n.id === 'nation.dash.approval.chart')!, leader)
    expectValid(spec)
    expect(spec.kind).toBe('line')
    expect(spec.unit).toBe('pct')
    expect(spec.x).toHaveLength(12)
  })

  it('give every chart row a plain, short, dash-free summary', () => {
    for (const sc of scenarios()) {
      const rows = withFlags(ON, () => sc.kids(sc.g)).filter((n) => isNew(n.id))
      expect(rows.length, sc.name).toBeGreaterThan(0)
      for (const row of rows) {
        const text = isInfo(row) ? infoText(row, sc.g) : ''
        expect(text.length, row.id).toBeGreaterThan(0)
        expect(text.length, row.id).toBeLessThanOrEqual(120)
        expect(DASHES.test(text), row.id).toBe(false)
        expect(text, row.id).not.toMatch(/NaN|undefined|Infinity|\[object/)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// 2b. The peer ladder says where the player really stands

describe('the peer ladder on a career report card', () => {
  // The real music field, with the player's score chosen by the test: above everyone, level with the leader, in the
  // middle of the five listed, and below all of them. The memory is the career's own, so the expected standing is the
  // one the menu works out.
  const field = (): { st: ReturnType<typeof standingOf>; at: (score: number) => MenuNode[] } => {
    const memory = musicStore.view(music).memory
    const st = standingOf(music, MUSIC_SPEC, 0, memory)
    const at = (score: number): MenuNode[] =>
      withFlags(ON, () =>
        standingMenu<MusicState>({
          id: 'peerprobe',
          label: 'Probe',
          emoji: '\u{1F3C6}',
          store: musicStore,
          standingLabel: 'Standing',
          incomeLabel: 'Income',
          peers: { spec: MUSIC_SPEC, score: () => score },
        }).children(music),
      )
    return { st, at }
  }
  const ladderOf = (kids: MenuNode[]): { row: MenuInfo; spec: ChartSpec } => {
    const row = kids.find((n): n is MenuInfo => n.id === 'peerprobe.peers.chart' && isInfo(n))!
    expect(row).toBeDefined()
    const spec = chartOf(row, music)
    expectValid(spec)
    return { row, spec }
  }
  const mineOf = (spec: ChartSpec) => {
    const mine = spec.rows!.filter((r) => r.you === true)
    expect(mine).toHaveLength(1)
    return mine[0]!
  }

  it('is a real field for the probe: the five listed peers, more rivals behind them', () => {
    const { st } = field()
    expect(st.top).toHaveLength(5)
    expect(st.of).toBeGreaterThan(8)
  })

  it('says the player is first, and who is next, when the player tops the field', () => {
    const { st, at } = field()
    const { row, spec } = ladderOf(at(1000))
    const lead = st.top[0]!
    expect(spec.summary).toBe(`You rank 1 of ${st.of}. ${lead.name} is next with ${lead.score}.`)
    // No sentence that puts a rival first while the player is first.
    expect(spec.summary).not.toMatch(/is first/)
    expect(mineOf(spec).rank).toBe(1)
    // The visible fallback row on the report card reads the same way.
    const text = infoText(row, music)
    expect(text.length).toBeLessThanOrEqual(90)
    expect(text.startsWith(`You rank 1 of ${st.of}.`)).toBe(true)
    expect(text).not.toMatch(/is first/)
  })

  it('says the player is first when level with the leader (a tie ranks the player first)', () => {
    const { st, at } = field()
    const lead = st.top[0]!
    const { spec } = ladderOf(at(lead.score))
    expect(standingOf(music, MUSIC_SPEC, lead.score, musicStore.view(music).memory).rank).toBe(1)
    expect(spec.summary).toBe(`You rank 1 of ${st.of}. ${lead.name} is next with ${lead.score}.`)
    expect(spec.summary).not.toMatch(/is first/)
    expect(mineOf(spec).rank).toBe(1)
  })

  it('names the leader as first when the player is among the five but not on top', () => {
    const { st, at } = field()
    // Level with the first listed peer who scores below the leader: somebody is above, and at most four are.
    const level = st.top.find((p) => p.score < st.top[0]!.score)
    expect(level).toBeDefined()
    const score = level!.score
    const rank = standingOf(music, MUSIC_SPEC, score, musicStore.view(music).memory).rank
    expect(rank).toBeGreaterThan(1)
    expect(rank).toBeLessThanOrEqual(5)
    const { row, spec } = ladderOf(at(score))
    const lead = st.top[0]!
    expect(spec.summary).toBe(`You rank ${rank} of ${st.of}. ${lead.name} is first with ${lead.score}.`)
    expect(mineOf(spec).rank).toBe(rank)
    expect(infoText(row, music).startsWith(`You rank ${rank} of ${st.of}.`)).toBe(true)
  })

  it('gives the player row the true rank when the player is below the five listed', () => {
    const { st, at } = field()
    const truth = standingOf(music, MUSIC_SPEC, 0, musicStore.view(music).memory)
    // Behind the five listed peers and the ladder's own count (six rows) cannot tell the whole story.
    expect(truth.rank).toBeGreaterThan(6)
    const { spec } = ladderOf(at(0))
    expect(mineOf(spec).rank).toBe(truth.rank)
    expect(spec.summary).toBe(`You rank ${truth.rank} of ${st.of}. ${st.top[0]!.name} is first with ${st.top[0]!.score}.`)
    // The rivals above keep their own places, and none of them claims the player's.
    const others = spec.rows!.filter((r) => r.you !== true).map((r) => r.rank)
    expect(others).toEqual([1, 2, 3, 4, 5])
  })

  it('keeps every peer ladder summary short, dash-free and in the plain voice', () => {
    const { st, at } = field()
    for (const score of [1000, st.top[0]!.score, st.top[4]!.score, 0]) {
      const { row, spec } = ladderOf(at(score))
      expect(spec.summary.length).toBeLessThanOrEqual(120)
      expect(DASHES.test(spec.summary)).toBe(false)
      expect(infoText(row, music).length).toBeLessThanOrEqual(90)
    }
  })
})

// ---------------------------------------------------------------------------
// 3. lineSpec and growthSpec

describe('lineSpec', () => {
  const base = { title: 'Overall benchmark score', unit: 'count' as const, x: [2020, 2021, 2022, 2023], label: 'Overall', values: [40, 50, 45, 60], summary: 'Overall 60 in 2023, from 40 in 2020.' }

  it('builds a one-series line the reader accepts', () => {
    const spec = lineSpec(base)
    expectValid(spec)
    expect(spec.kind).toBe('line')
    expect(spec.unit).toBe('count')
    expect(spec.x).toEqual([2020, 2021, 2022, 2023])
    expect(spec.series).toHaveLength(1)
    expect(spec.series[0]!.label).toBe('Overall')
    expect(spec.series[0]!.tone).toBe('c1')
    expect(spec.series[0]!.values).toEqual([40, 50, 45, 60])
    expect(spec.summary).toBe(base.summary)
  })

  it('keeps gaps as gaps and needs two real points', () => {
    const gappy = lineSpec({ ...base, values: [null, 50, null, 60] })
    expectValid(gappy)
    expect(gappy.series[0]!.values).toEqual([null, 50, null, 60])
    expect(lineSpec({ ...base, values: [null, 50, null, null] })).toBeNull()
    expect(lineSpec({ ...base, x: [], values: [] })).toBeNull()
  })

  it('takes a tone, a basis and string labels on the axis', () => {
    const spec = lineSpec({ ...base, x: ['a', 'b', 'c', 'd'], tone: 'c6', basis: 2030 })
    expectValid(spec)
    expect(spec.series[0]!.tone).toBe('c6')
    expect(spec.basis).toBe(2030)
    expect(spec.x).toEqual(['a', 'b', 'c', 'd'])
    expect(lineSpec({ ...base, basis: 12 })!.basis).toBeUndefined()
  })

  it('answers null for arrays that do not pair up, and never throws on hostile input', () => {
    expect(lineSpec({ ...base, values: [1, 2, 3] })).toBeNull()
    const hostile = [null, undefined, 7, 'x', [], {}, { ...base, x: 'no' }, { ...base, values: 'no' }, { ...base, unit: 'bananas' }] as unknown[]
    for (const h of hostile) expect(() => lineSpec(h as never)).not.toThrow()
    for (const h of hostile) expect(lineSpec(h as never)).toBeNull()
  })

  it('turns NaN and infinity into gaps, cleans dashes and control characters, and cuts long text', () => {
    const dash = String.fromCharCode(0x2014)
    const spec = lineSpec({
      title: `A${dash}very ${'long '.repeat(30)}title`,
      unit: 'money',
      x: [1, 2, 3, `Y${dash}3`, 'Z\u0000'],
      label: 'L'.repeat(100),
      values: [Number.NaN, 5, Number.POSITIVE_INFINITY, 7, 1e30],
      summary: `${'word '.repeat(80)}${dash}`,
    })
    expectValid(spec)
    expect(spec.title.length).toBeLessThanOrEqual(60)
    expect(spec.summary.length).toBeLessThanOrEqual(120)
    expect(spec.series[0]!.label.length).toBeLessThanOrEqual(40)
    expect(JSON.stringify(spec)).not.toMatch(DASHES)
    expect(spec.series[0]!.values.slice(0, 4)).toEqual([null, 5, null, 7])
  })

  it('keeps the last 64 points of a long series, and reads a hostile length without walking it', () => {
    const n = 200
    const spec = lineSpec({ ...base, x: Array.from({ length: n }, (_, i) => 1900 + i), values: Array.from({ length: n }, (_, i) => i + 1) })
    expectValid(spec)
    expect(spec.x).toHaveLength(64)
    expect(spec.x[63]).toBe(1900 + n - 1)
    expect(spec.series[0]!.values[63]).toBe(n)
  })

  it('works on a frozen input', () => {
    const frozen = deepFreeze({ ...base, x: [...base.x], values: [...base.values] })
    expectValid(lineSpec(frozen))
  })
})

describe('growthSpec', () => {
  const g = adult(1, 2026, 'us')
  const years = [2020, 2021, 2022, 2023, 2024]

  it('shows what 100 put in at the first price became, in money', () => {
    const spec = growthSpec(g, 'What 100 would have become', years, [10, 12, 9, 15, 30])
    expectValid(spec)
    expect(spec.kind).toBe('line')
    expect(spec.unit).toBe('money')
    expect(spec.title).toBe('What 100 would have become')
    expect(spec.x).toEqual(years)
    expect(spec.series[0]!.values).toEqual([100, 120, 90, 150, 300])
    expect(typeof spec.basis).toBe('number')
    expect(spec.summary.length).toBeLessThanOrEqual(120)
    expect(spec.summary).toContain('2020')
    expect(spec.summary).toContain('2024')
  })

  it('starts at the first year the company had a price, and leaves the years before it as gaps', () => {
    const spec = growthSpec(g, 'What 100 would have become', years, [null, null, 4, 6, 3])
    expectValid(spec)
    expect(spec.series[0]!.values).toEqual([null, null, 100, 150, 75])
  })

  it('does not round a small price to nothing', () => {
    const spec = growthSpec(g, 'What 100 would have become', years, [0.0004, 0.0005, 0.0006, 0.0003, 0.0008])
    expectValid(spec)
    expect(spec.series[0]!.values).toEqual([100, 125, 150, 75, 200])
  })

  it('answers null with under two usable prices, and treats a price of nothing or less as a gap', () => {
    expect(growthSpec(g, 't', years, [null, null, null, null, 5])).toBeNull()
    expect(growthSpec(g, 't', years, [0, -1, Number.NaN, null, 5])).toBeNull()
    expect(growthSpec(g, 't', [2020], [5])).toBeNull()
    expect(growthSpec(g, 't', years, [5, 6])).toBeNull()
    const spec = growthSpec(g, 't', years, [5, 0, 10, Number.NaN, 20])
    expectValid(spec)
    expect(spec.series[0]!.values).toEqual([100, null, 200, null, 400])
  })

  it('works on a frozen game and never throws on hostile input', () => {
    const frozen = deepFreeze(structuredClone(g))
    expectValid(growthSpec(frozen, 'What 100 would have become', years, [10, 12, 9, 15, 30]))
    for (const bad of [null, undefined, 'x', 3] as unknown[]) {
      expect(() => growthSpec(g, 't', bad as never, bad as never)).not.toThrow()
      expect(growthSpec(g, 't', bad as never, bad as never)).toBeNull()
    }
  })
})

// ---------------------------------------------------------------------------
// 4. stockTrail

/** The listed stocks and pennies of a state, as stockTrail wants them (slot and generation from the engine). */
function listed(g: GameState): { q: Parameters<typeof stockTrail>[1]; price: number }[] {
  const info = exchangeInfo(g.character.countryId)
  const first = g.ancestors?.[0]?.bornYear
  const own = g.year - g.character.age
  const anchor = typeof first === 'number' && Number.isFinite(first) ? Math.min(first, own) : own
  const fam = timelineFamily(g, (g.lifeId || 'life').replace(/-g\d+$/, ''))
  const year = exchangeYear(fam, anchor, info, g.year)
  const prices = new Map(investmentListing(g).map((l) => [l.secId, l.price]))
  const out: { q: Parameters<typeof stockTrail>[1]; price: number }[] = []
  for (const [type, list] of [['stock', year.stocks], ['penny', year.pennies]] as const) {
    for (const s of list) {
      const id = type === 'stock' ? companyDef(info, s.slot, s.gen).id : s.id
      const price = prices.get(id)
      if (price === undefined) continue
      out.push({ q: { type, secId: id, details: { slot: s.slot, gen: s.gen } } as unknown as Parameters<typeof stockTrail>[1], price })
    }
  }
  return out
}

describe('stockTrail', () => {
  const states = (): GameState[] => [adult(1, 2026, 'us'), adult(2, 1985, 'gb'), adult(3, 2031, 'jp')]

  it('is at most ten long, oldest first, and ends at the price on the list this year', () => {
    let ended = 0
    for (const g of states()) {
      const quotes = listed(g)
      expect(quotes.length).toBeGreaterThan(5)
      for (const { q, price } of quotes) {
        const trail = stockTrail(g, q)
        expect(trail.length).toBeGreaterThan(0)
        expect(trail.length).toBeLessThanOrEqual(10)
        const last = trail[trail.length - 1]
        // A company that listed this very year has no track record: the year it lists is a null.
        if (last === null) continue
        ended++
        expect(last, `${q.secId} ends this year`).toBeCloseTo(price, 6)
      }
    }
    expect(ended).toBeGreaterThan(10)
  })

  it('has a null for every year the company was not listed, and only before it was', () => {
    let leading = 0
    let listedThisYear = 0
    for (const g of states()) {
      for (const { q } of listed(g)) {
        const trail = stockTrail(g, q)
        const firstReal = trail.findIndex((v) => v !== null)
        // No price at all: it listed this year (or the whole life is too young to look back from).
        if (firstReal < 0) {
          listedThisYear++
          expect(trail[trail.length - 1], q.secId).toBeNull()
          continue
        }
        for (let i = 0; i < trail.length; i++) {
          if (i < firstReal) expect(trail[i], `${q.secId} before listing`).toBeNull()
          else expect(typeof trail[i], `${q.secId} after listing`).toBe('number')
        }
        if (firstReal > 0) leading++
        for (const v of trail) if (v !== null) expect(Number.isFinite(v) && v > 0).toBe(true)
      }
    }
    expect(leading).toBeGreaterThan(0)
    expect(listedThisYear).toBeGreaterThanOrEqual(0)
  })

  it('takes fewer years for a young life, and honours the years argument', () => {
    const g = adult(1, 2026, 'us')
    const { q } = listed(g)[0]!
    expect(stockTrail(g, q, 4).length).toBeLessThanOrEqual(4)
    expect(stockTrail(g, q, 4)).toEqual(stockTrail(g, q).slice(-4))
    expect(stockTrail(g, q, 0).length).toBeGreaterThanOrEqual(0)
    expect(stockTrail(g, q, 500).length).toBeLessThanOrEqual(10)
    expect(stockTrail(g, q, Number.NaN).length).toBeLessThanOrEqual(10)
    const young = adult(1, 2026, 'us')
    young.character.age = 3
    const youngQ = listed(young)[0]!.q
    // The market's history starts at the family's anchor: no year before it is asked for.
    expect(stockTrail(young, youngQ).length).toBeLessThanOrEqual(3)
  })

  it('asks the engine for no year after g.year', () => {
    for (const g of states()) {
      const { q } = listed(g)[0]!
      asked.years.length = 0
      stockTrail(g, q)
      expect(asked.years.length).toBeGreaterThan(0)
      expect(Math.max(...asked.years)).toBeLessThanOrEqual(g.year)
    }
  })

  it('is the same on a second call, and the second call walks only this year again', () => {
    const g = adult(4, 2026, 'us')
    const { q } = listed(g)[3]!
    const first = stockTrail(g, q)
    asked.years.length = 0
    const second = stockTrail(g, q)
    expect(second).toEqual(first)
    expect(asked.years.length).toBeLessThanOrEqual(1)
    expect(asked.years.every((y) => y === g.year)).toBe(true)
  })

  it('follows a shock this year in its last point and leaves the earlier points alone', () => {
    const g = adult(5, 2026, 'us')
    const { q } = listed(g)[2]!
    const before = stockTrail(g, q)
    const info = exchangeInfo(g.character.countryId)
    addMarketShock(g, {
      asset: 'stock',
      secId: q.secId,
      exKey: info.key,
      slot: Number((q.details as Record<string, unknown>).slot),
      name: 'Test Co',
      symbol: 'TST',
      cause: 'endorse',
      year: g.year,
      mult: 2,
      fade: 0,
      countryId: g.character.countryId,
    })
    const after = stockTrail(g, q)
    expect(after.slice(0, -1)).toEqual(before.slice(0, -1))
    expect(after[after.length - 1]).toBeCloseTo((before[before.length - 1] as number) * 2, 6)
  })

  it('draws no random number and writes nothing', () => {
    const g = adult(1, 2026, 'us')
    const { q } = listed(g)[0]!
    const rng = g.rng
    const snapshot = JSON.stringify(g)
    stockTrail(g, q)
    expect(g.rng).toBe(rng)
    expect(JSON.stringify(g)).toBe(snapshot)
  })

  it('gives nothing for a quote that is not a stock or a penny', () => {
    const g = adult(1, 2026, 'us')
    expect(stockTrail(g, { type: 'index', secId: 'x', details: {} } as unknown as Parameters<typeof stockTrail>[1])).toEqual([])
    expect(stockTrail(g, { type: 'stock', secId: 'x', details: { slot: 'a' } } as unknown as Parameters<typeof stockTrail>[1])).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// The stock offers

/** Every offer group under the Investing menu with its security id. */
function offers(g: GameState): MenuGroup[] {
  return walk(g, investmentsMenu.children(g), 3).filter((n): n is MenuGroup => isGroup(n) && n.id.startsWith('inv-offer-'))
}

describe('the stock offers', () => {
  it('get a spark and a growth chart row for stocks and pennies only, and only with the flag on', () => {
    const g = broker
    const types = new Map(investmentListing(g).map((l) => [l.secId, l.type]))
    const off = withFlags(OFF, () => offers(g))
    const on = withFlags(ON, () => offers(g))
    expect(on.map((o) => o.id)).toEqual(off.map((o) => o.id))
    expect(on.length).toBeGreaterThan(10)
    let trails = 0
    for (let i = 0; i < on.length; i++) {
      const secId = on[i]!.id.slice('inv-offer-'.length)
      const type = types.get(secId)
      const trailed = type === 'stock' || type === 'penny'
      const offKids = withFlags(OFF, () => off[i]!.children(g))
      const onKids = withFlags(ON, () => on[i]!.children(g))
      expect(offKids.some((n) => isNew(n.id)), `${secId} off`).toBe(false)
      expect(withFlags(OFF, () => off[i]!.spark?.(g) ?? null), `${secId} spark off`).toBeNull()
      expect(onKids.filter((n) => !isNew(n.id)).map((n) => n.id), `${secId} order`).toEqual(offKids.map((n) => n.id))
      if (trailed) {
        trails++
        const spark = withFlags(ON, () => on[i]!.spark?.(g) ?? null)
        expect(spark, `${secId} spark on`).not.toBeNull()
        expect(spark!.length).toBeLessThanOrEqual(10)
        expect(onKids.filter((n) => isNew(n.id)).map((n) => n.id), secId).toEqual([`inv-ochart-${secId}`])
        const spec = chartOf(onKids.find((n) => isNew(n.id))!, g)
        if (spec) {
          expectValid(spec)
          expect(spec.kind).toBe('line')
          expect(spec.unit).toBe('money')
          expect(spec.title).toBe('What 100 would have become')
        }
      } else {
        expect(withFlags(ON, () => on[i]!.spark?.(g) ?? null), `${secId} no spark`).toBeNull()
        expect(onKids.some((n) => isNew(n.id)), `${secId} no chart`).toBe(false)
      }
    }
    expect(trails).toBeGreaterThan(5)
  })

  it('draw a growth chart for a company that has been listed for two years or more', () => {
    const g = broker
    let drawn = 0
    for (const o of withFlags(ON, () => offers(g))) {
      const row = withFlags(ON, () => o.children(g)).find((n) => isNew(n.id))
      if (!row) continue
      const spec = chartOf(row, g)
      if (spec) {
        drawn++
        expectValid(spec)
        const values = spec.series[0]!.values.filter((v): v is number => v !== null)
        expect(values[0]).toBe(100)
      }
    }
    expect(drawn).toBeGreaterThan(3)
  })
})

// ---------------------------------------------------------------------------
// 5. MenuRow and its spark

describe('MenuRow with a spark', () => {
  let rows: typeof import('../src/ui/components/MenuList')
  let gate: typeof import('../src/ui/charts/lazy')
  let react: typeof import('react')
  let server: typeof import('react-dom/server')
  const g = adult(1, 2026, 'us')

  // A lazy view keeps its loaded module for the life of the process, so each test gets a fresh copy of the modules.
  beforeEach(async () => {
    vi.resetModules()
    gate = await import('../src/ui/charts/lazy')
    rows = await import('../src/ui/components/MenuList')
    react = await import('react')
    server = await import('react-dom/server')
  })

  const action = (over: Partial<MenuAction> = {}): MenuAction => ({ type: 'action', id: 'row', label: 'Acme (ACME)', emoji: '\u{1F4C8}', run: () => {}, ...over })
  const group = (over: Partial<MenuGroup> = {}): MenuGroup => ({ type: 'menu', id: 'grp', label: 'Acme (ACME)', emoji: '\u{1F4C8}', children: () => [], ...over })
  const render = (node: MenuAction | MenuGroup): string => server.renderToStaticMarkup(react.createElement(rows.MenuRow, { node, g, onTap: () => {} }))

  it('shows a placeholder while the chunk loads and the sparkline once it is there', async () => {
    const node = group({ spark: () => [1, 2, 3, 2.5, 4] })
    const before = render(node)
    expect(before).toContain('<span class="menu-spark-ph" aria-hidden="true"></span>')
    expect(before).not.toContain('<svg')
    expect(gate.LazySparkline.isReady()).toBe(false)
    expect(await gate.LazySparkline.preload()).toBe(true)
    const after = render(node)
    expect(after).toContain('<span class="menu-spark-ph" aria-hidden="true"><svg')
    const label = /aria-label="([^"]*)"/.exec(after.slice(after.indexOf('<svg')))![1]!
    expect(label).toContain('Acme (ACME), price over ten years')
    for (const word of ['first', 'last', 'low', 'high']) expect(label).toContain(word)
  })

  it('puts the spark in the end slot before the chevron, and before the lock on a disabled row', async () => {
    await gate.LazySparkline.preload()
    const open = render(group({ spark: () => [1, 2, 3] }))
    expect(open.indexOf('menu-row-end')).toBeLessThan(open.indexOf('<svg'))
    expect(open.indexOf('<svg')).toBeLessThan(open.indexOf('menu-row-chevron'))
    const locked = render(group({ spark: () => [1, 2, 3], disabledReason: () => 'Not yet.' }))
    expect(locked.indexOf('<svg')).toBeLessThan(locked.indexOf('menu-row-lock'))
  })

  it('draws the sparkline in the share-price format, in the chart tone for prices', async () => {
    await gate.LazySparkline.preload()
    const html = render(group({ spark: () => [1.25, 2, 3.5] }))
    expect(html).toContain('ch-tone-c6')
    expect(html).toContain('$1.25')
    expect(html).toContain('$3.50')
  })

  it('renders a row with no spark exactly as it always did', async () => {
    const plain = render(action())
    expect(plain).not.toContain('menu-spark')
    expect(plain).not.toContain('<svg')
    await gate.LazySparkline.preload()
    expect(render(action())).toBe(plain)
    expect(render(action({ spark: () => null }))).toBe(plain)
  })

  it('draws nothing for fewer than two real points or a spark that is not a list', async () => {
    await gate.LazySparkline.preload()
    const plain = render(action())
    expect(render(action({ spark: () => [] }))).toBe(plain)
    expect(render(action({ spark: () => [5] }))).toBe(plain)
    expect(render(action({ spark: () => [null, 5, null] }))).toBe(plain)
    expect(render(action({ spark: () => [Number.NaN, 5, Number.POSITIVE_INFINITY] }))).toBe(plain)
    expect(render(action({ spark: (() => 'no') as unknown as MenuAction['spark'] }))).toBe(plain)
    expect(errors).not.toHaveBeenCalled()
  })

  it('catches a spark that throws, reports it, and still renders the row', async () => {
    const plain = render(action())
    const boom = action({
      spark: () => {
        throw new Error('boom')
      },
    })
    expect(render(boom)).toBe(plain)
    await gate.LazySparkline.preload()
    expect(render(boom)).toBe(plain)
    expect(errors).toHaveBeenCalled()
    expect(String(errors.mock.calls[0]![0])).toContain('spark(row)')
  })
})

// ---------------------------------------------------------------------------
// 6. A frozen state, and careers with nothing booked

describe('on a frozen state', () => {
  it('runs every wired builder, menu and spark without a write', () => {
    for (const sc of scenarios()) {
      const frozen = deepFreeze(structuredClone(sc.g))
      const rows = withFlags(ON, () => sc.kids(frozen))
      for (const row of rows.filter((n) => isNew(n.id))) {
        expect(isInfo(row) ? infoText(row, frozen).length : 0, `${sc.name} ${row.id}`).toBeGreaterThan(0)
        const spec = chartOf(row, frozen)
        if (spec) expectValid(spec)
      }
    }
    expect(errors).not.toHaveBeenCalled()
  })

  it('runs the stock offers and their sparks', () => {
    const frozen = deepFreeze(structuredClone(broker))
    withFlags(ON, () => {
      for (const o of offers(frozen).slice(0, 12)) {
        o.spark?.(frozen)
        for (const row of o.children(frozen)) chartOf(row, frozen)
      }
    })
    expect(errors).not.toHaveBeenCalled()
  })
})

describe('a career with nothing booked', () => {
  const ids: CareerId[] = ['actor', 'astronaut', 'model', 'music']

  it('gets no standing line and no throw; the peer ladder needs a field, not booked years', () => {
    for (const id of ids) {
      const g = newCareerGame(id, 5)
      const all = withFlags(ON, () => walk(g, careerRoots(id)(g)))
      const added = all.filter((n) => isNew(n.id))
      expect(added.map((n) => n.id).filter((x) => x !== `${id}.standing.peers.chart`), id).toEqual([])
      for (const row of added) {
        const spec = chartOf(row, g)
        if (spec) expectValid(spec)
      }
    }
    expect(errors).not.toHaveBeenCalled()
  })

  it('gets the standing charts once it has booked years, for every career that keeps a report card', () => {
    let drawn = 0
    for (const id of ids) {
      const g = newCareerGame(id, 5)
      for (let i = 0; i < 4; i++) nextYear(g)
      const all = withFlags(ON, () => walk(g, careerRoots(id)(g)))
      const charts = all.filter((n) => isNew(n.id))
      for (const row of charts) {
        const spec = chartOf(row, g)
        if (spec) expectValid(spec)
      }
      expect(charts.every((n) => n.id.startsWith(`${id}.standing.`)), id).toBe(true)
      drawn += charts.length
    }
    expect(drawn).toBeGreaterThan(0)
    expect(errors).not.toHaveBeenCalled()
  })
})
