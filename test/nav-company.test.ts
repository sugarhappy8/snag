// R1-N8: the company cockpit. businessScreen wraps businessView: with FLAGS.cockpits on, the 39+ flat rows become a short
// top (who, a KPI row, market, health, the small zone-0 groups) plus four tiles (Run, Money, Leadership, Exit) that hold
// the same nodes in the same order. The data never moves: the seeded drivers pick actions by DFS position, so the action
// sequence must be identical with the flag off and on (hub groups are invisible in a canonical path). Everything here
// is pure: no draw, no write, and the tiles read the latest state each time they are opened.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { becomeCeo, installManager, managerCandidate } from '../src/game/business/career'
import { evolve, recordYear, simulateYear, valuationOf } from '../src/game/business/economy'
import { goPublic } from '../src/game/business/exit'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { formGroup } from '../src/game/business/conglomerate-actions'
import { groupOfCompany } from '../src/game/business/conglomerate'
import { groupView } from '../src/game/business/conglomerate-menu'
import { businessScreen, businessView } from '../src/game/business/manage'
import { bizOf, findBusiness, readBiz, type BizState, type YearRecord } from '../src/game/business/state'
import { money } from '../src/game/business/util'
import { applyPlan, autoPlan } from '../src/game/business/yearly'
import { businessAssetView, businessCareerMenu } from '../src/game/business'
import { companyKpis } from '../src/game/charts/books'
import { CHART_LIMITS, readChartSpec, SPEC_LIMITS, type ChartSpec } from '../src/game/charts/spec'
import { resetFlags, withFlags, type FlagOverrides } from '../src/game/flags'
import { companyKpiSpec, companyScreen, HUB_PREFIX, hubIds } from '../src/game/hubs/company'
import { createNewLife } from '../src/game/life'
import { gameIndustryMenu } from '../src/game/special/gamedev'
import type { Asset, GameState, Json, MenuGroup, MenuInfo, MenuNode } from '../src/game/types'
import { getCountry } from '../src/game/world'
import { FailureLog, deepFreeze, probeActions } from './fuzz-kit'
import { canonical, isTruncated, walkTree, type Walked } from './nav-kit'

/** A walk of a company tree can take seconds on a loaded box. */
const HEAVY = 120_000
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)
const BAD = /NaN|undefined|Infinity/

beforeEach(() => {
  resetFlags()
})

afterEach(() => {
  resetFlags()
  vi.restoreAllMocks()
})

// The company() pattern of test/company-dashboard.test.ts.
function company(seed: number, industry: string, opts: Partial<BizState> & { years?: number } = {}): { g: GameState; a: Asset; b: BizState } {
  const country = 'us'
  const g = createNewLife({ seed, year: 1980, countryId: country })
  g.queue = []
  g.year = 2012
  const c = g.character
  c.age = 32
  c.money = 3_000_000
  c.talent = null
  c.talents = ['Business']
  c.licenses = ['driver']
  const { years = 2, ...rest } = opts
  const b0 = newBiz(g, industry as BizState['industry'], country, getCountry(country).cities[0], { cash: 400_000, ...rest })
  const a = createBusinessAsset(g, 'Test Co', b0, 100_000)
  g.assets.push(a)
  becomeCeo(g, a, b0)
  const b = bizOf(g, a)
  applyPlan(b, autoPlan(g, b, 1))
  for (let y = 0; y < years; y++) {
    const r = simulateYear(g, b, g.year, b.ownerSalary)
    evolve(g, b, r.stmt, g.year)
    recordYear(b, r.stmt)
    b.valuation = valuationOf(b)
    g.year += 1
    applyPlan(b, autoPlan(g, b, r.stmt.cycle))
  }
  g.queue = []
  return { g, a, b }
}

interface Kind {
  name: string
  industry: string
  years: number
  extra?: Partial<BizState>
}

/** Classic, studio, deep tech, finance, brand new (the five kinds of the plan). */
const KINDS: readonly Kind[] = [
  { name: 'classic', industry: 'restaurant', years: 3 },
  { name: 'studio', industry: 'gameStudio', years: 3 },
  { name: 'deep tech', industry: 'semiconductor', years: 3, extra: { cash: 30_000_000 } },
  { name: 'finance', industry: 'bank', years: 3 },
  { name: 'brand new', industry: 'cafe', years: 0 },
]

const built = new Map<string, { g: GameState; a: Asset; b: BizState }>()

/** A built company, once per file; every call returns a fresh copy of the state. */
function kind(k: Kind): { g: GameState; a: Asset } {
  let base = built.get(k.name)
  if (!base) {
    base = company(11, k.industry, { years: k.years, ...k.extra })
    built.set(k.name, base)
  }
  const g = structuredClone(base.g)
  return { g, a: findBusiness(g, base.a.id)! }
}

const idOf = (n: MenuNode): string => n.id
const COCKPIT: FlagOverrides = { cockpits: true }

function groupNode(nodes: readonly MenuNode[], id: string): MenuGroup {
  const found = nodes.find((n): n is MenuGroup => n.type === 'menu' && n.id === id)
  if (!found) throw new Error(`no group ${id} in [${nodes.map(idOf).join(', ')}]`)
  return found
}

function infoNode(nodes: readonly MenuNode[], id: string): MenuInfo {
  const found = nodes.find((n): n is MenuInfo => n.type === 'info' && n.id === id)
  if (!found) throw new Error(`no info row ${id}`)
  return found
}

function textOf(n: MenuInfo, g: GameState): string {
  return typeof n.text === 'function' ? n.text(g) : n.text
}

function subtitleOf(n: MenuGroup, g: GameState): string {
  return typeof n.subtitle === 'function' ? n.subtitle(g) : (n.subtitle ?? '')
}

function lastReal(values: readonly (number | null)[]): number | null {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i]
    if (v !== null && v !== undefined) return v
  }
  return null
}

function seriesOf(spec: ChartSpec, id: string): (number | null)[] {
  const s = spec.series.find((x) => x.id === id)
  if (!s) throw new Error(`no series ${id}`)
  return s.values
}

function emptyRoot(id: string): MenuGroup {
  return { type: 'menu', id, label: id, emoji: 'E', children: () => [] }
}

/** The company screen as the assets tab; the other three tabs are empty, so a walk costs only this company. */
function walkScreen(g: GameState, a: Asset, flags: FlagOverrides): Walked[] {
  const root: MenuGroup = {
    type: 'menu',
    id: 'company',
    label: 'Company',
    emoji: 'E',
    children: (gg) => {
      const cur = findBusiness(gg, a.id)
      return cur ? businessScreen(gg, cur) : []
    },
  }
  return withFlags(flags, () => walkTree(g, { roots: { occupation: emptyRoot('o'), assets: root, relationships: emptyRoot('r'), activities: emptyRoot('a') } }))
}

function actionPaths(walked: Walked[]): string[] {
  return walked.filter((w) => w.type === 'action').map(canonical)
}

/** Every observable thing about a screen to a depth: ids, labels, subtitles, info texts, chart specs. */
function dump(g: GameState, nodes: readonly MenuNode[], depth = 0): unknown[] {
  return nodes.map((n) => {
    if (n.type === 'heading') return [n.id, n.label]
    if (n.type === 'info') return [n.id, textOf(n, g), n.chart ? n.chart(g) : null]
    const sub = typeof n.subtitle === 'function' ? n.subtitle(g) : (n.subtitle ?? null)
    return n.type === 'menu' && depth < 2 ? [n.id, n.label, sub, dump(g, n.children(g), depth + 1)] : [n.id, n.label, sub]
  })
}

describe('hubIds', () => {
  it('names the KPI row and the four tiles after the asset, all under the hub prefix', () => {
    expect(HUB_PREFIX).toBe('hub.')
    expect(hubIds('a7')).toEqual({ kpi: 'hub.biz.kpi.a7', run: 'hub.biz.run.a7', money: 'hub.biz.money.a7', lead: 'hub.biz.lead.a7', exit: 'hub.biz.exit.a7' })
  })
})

describe('the screen', () => {
  it('1. flag off: businessScreen returns the ids businessView returns, for all five kinds', () => {
    for (const k of KINDS) {
      const { g, a } = kind(k)
      expect(businessScreen(g, a).map(idOf), k.name).toEqual(businessView(g, a).map(idOf))
    }
  })

  it('1b. companyScreen with the flag off, or with none of the four headings, hands back the very list it was given', () => {
    const { g, a } = kind(KINDS[0]!)
    const flat = businessView(g, a)
    const rebuild = () => flat
    expect(companyScreen(g, a, flat, rebuild)).toBe(flat)
    const bare: MenuNode[] = [{ type: 'info', id: 'x', text: 'x' }, { type: 'heading', id: 'biz.keyStaffH.1', label: 'Key Staff' }]
    withFlags(COCKPIT, () => {
      expect(companyScreen(g, a, bare, rebuild)).toBe(bare)
      expect(companyScreen(g, a, [], rebuild)).toEqual([])
    })
  })

  it('2. flag on, classic company: a short top, the KPI row before the market row, tiles in order run, money, lead, exit', () => {
    const { g, a } = kind(KINDS[0]!)
    const flat = businessView(g, a)
    expect(flat.length).toBeGreaterThanOrEqual(39)
    withFlags(COCKPIT, () => {
      const screen = businessScreen(g, a)
      const ids = screen.map(idOf)
      expect(screen.length).toBeLessThanOrEqual(14)
      const h = hubIds(a.id)
      expect(ids.filter((id) => id.startsWith(HUB_PREFIX))).toEqual([h.kpi, h.run, h.money, h.lead, h.exit])
      expect(ids[0]).toBe(`biz.dash.who.${a.id}`)
      expect(ids[1]).toBe(h.kpi)
      expect(ids.indexOf(h.kpi)).toBeLessThan(ids.indexOf(`biz.dash.market.${a.id}`))
      expect(ids.slice(2, 4)).toEqual([`biz.dash.market.${a.id}`, `biz.dash.health.${a.id}`])
      // The two rows the KPI row replaces are gone; the small groups of the top stay on top.
      expect(ids).not.toContain(`biz.dash.money.${a.id}`)
      expect(ids).not.toContain(`biz.dash.results.${a.id}`)
      expect(ids).toContain(`biz.milestones.${a.id}`)
      expect(ids).toContain(`biz.details.${a.id}`)
      for (const t of [h.run, h.money, h.lead, h.exit]) expect(groupNode(screen, t).type).toBe('menu')
      expect(groupNode(screen, h.run).label).toBe('Run')
      expect(groupNode(screen, h.money).label).toBe('Money')
      expect(groupNode(screen, h.lead).label).toBe('Leadership')
      expect(groupNode(screen, h.exit).label).toBe('Exit')
    })
  })

  it('2b. the tiles hold the flat nodes in the flat order, and every old heading is still the first node of its tile', () => {
    for (const k of KINDS) {
      const { g, a } = kind(k)
      const flat = businessView(g, a)
      const first = flat.findIndex((n) => n.type === 'heading' && (n.id === `biz.runH.${a.id}` || n.id === `biz.financeH.${a.id}`))
      expect(first, k.name).toBeGreaterThan(0)
      withFlags(COCKPIT, () => {
        const screen = businessScreen(g, a)
        const h = hubIds(a.id)
        const tiles = [h.run, h.money, h.lead, h.exit].map((t) => groupNode(screen, t).children(g))
        expect(tiles.flat().map(idOf), k.name).toEqual(flat.slice(first).map(idOf))
        expect(tiles.map((t) => t[0]!.type), k.name).toEqual(['heading', 'heading', 'heading', 'heading'])
        expect(tiles.map((t) => t[0]!.id), k.name).toEqual([flat[first]!.id, `biz.moneyH.${a.id}`, `biz.leadH.${a.id}`, `biz.exitH.${a.id}`])
      })
    }
  })

  it('2c. the top of the screen keeps the zone-0 nodes (governance, milestones, details, venue and sector menus) in flat order', () => {
    for (const k of KINDS) {
      const { g, a } = kind(k)
      const flat = businessView(g, a)
      const first = flat.findIndex((n) => n.type === 'heading' && (n.id === `biz.runH.${a.id}` || n.id === `biz.financeH.${a.id}`))
      const zone = flat.slice(0, first).map(idOf).filter((id) => id !== `biz.dash.money.${a.id}` && id !== `biz.dash.results.${a.id}`)
      withFlags(COCKPIT, () => {
        const top = businessScreen(g, a).filter((n) => !n.id.startsWith(HUB_PREFIX)).map(idOf)
        const spec = companyKpiSpec(g, a)
        // With a settled year the KPI row sits where the money row was; without one nothing is replaced.
        expect(top, k.name).toEqual(spec ? zone : flat.slice(0, first).map(idOf))
      })
    }
    // A venue and a sector company keep their own menus on top, not inside a tile.
    const bar = company(21, 'bar', { years: 2 })
    withFlags(COCKPIT, () => {
      const top = businessScreen(bar.g, bar.a).map(idOf)
      expect(top).toContain(`venue.owner.${bar.a.id}`)
      expect(businessView(bar.g, bar.a).map(idOf)).toContain(`venue.owner.${bar.a.id}`)
    })
  })

  it('2d. a finance firm has no market or health row, and still gets a KPI row and the four tiles (Run starts at Financial Operations)', () => {
    const { g, a } = kind(KINDS[3]!)
    withFlags(COCKPIT, () => {
      const screen = businessScreen(g, a)
      const ids = screen.map(idOf)
      const h = hubIds(a.id)
      expect(ids).not.toContain(`biz.dash.market.${a.id}`)
      expect(ids.slice(0, 2)).toEqual([`biz.dash.who.${a.id}`, h.kpi])
      expect(groupNode(screen, h.run).children(g)[0]!.id).toBe(`biz.financeH.${a.id}`)
    })
  })

  it('3. DFS parity: the action sequence is the same with the flag off and on, for all five kinds (hub segments stripped)', () => {
    for (const k of KINDS) {
      const { g, a } = kind(k)
      deepFreeze(g)
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const off = walkScreen(g, a, {})
      const on = walkScreen(g, a, COCKPIT)
      expect(spy.mock.calls.map((c) => String(c[0])).slice(0, 5), `${k.name}: a menu complained`).toEqual([])
      spy.mockRestore()
      expect(isTruncated(off), `${k.name}: flag off cut`).toBe(false)
      expect(isTruncated(on), `${k.name}: flag on cut`).toBe(false)
      const before = actionPaths(off)
      const after = actionPaths(on)
      expect(before.length, `${k.name}: the walk found actions`).toBeGreaterThan(5)
      expect(after, `${k.name}: sequence`).toEqual(before)
      expect(new Set(after), `${k.name}: set`).toEqual(new Set(before))
      // The hubs really were walked: the flag-on walk has the four tile groups, the flag-off walk none.
      expect(on.filter((w) => w.type === 'menu' && w.ids[w.ids.length - 1]!.startsWith(HUB_PREFIX)).length, k.name).toBe(4)
      expect(off.some((w) => w.ids.some((id) => id.startsWith(HUB_PREFIX))), k.name).toBe(false)
    }
  }, HEAVY)

  // R1-C13 has merged when the file is there; before it the Books group does not exist.
  const hasBooks = existsSync(fileURLToPath(new URL('../src/game/business/books-menu.ts', import.meta.url)))
  if (hasBooks) {
    it('3b. the Books group sits in the Money tile right after Why Profit Changed, and adds no action', () => {
      const { g, a } = kind(KINDS[0]!)
      deepFreeze(g)
      const both: FlagOverrides = { cockpits: true, chartKit: true }
      withFlags(both, () => {
        const money = groupNode(businessScreen(g, a), hubIds(a.id).money).children(g)
        const at = money.findIndex((n) => n.id === `biz.economicReport.${a.id}`)
        expect(at).toBeGreaterThanOrEqual(0)
        expect(money[at + 1]!.id).toBe(`biz.books.${a.id}`)
        const books = money[at + 1] as MenuGroup
        expect(books.children(g).every((n) => n.type === 'info')).toBe(true)
      })
      const off = actionPaths(walkScreen(g, a, {}))
      const on = actionPaths(walkScreen(g, a, both))
      expect(on).toEqual(off)
    }, HEAVY)
  }

  it('3c. the tiles read the latest state each time they are opened, not the state the screen was built from', () => {
    const { g, a } = kind(KINDS[0]!)
    withFlags(COCKPIT, () => {
      const screen = businessScreen(g, a)
      const h = hubIds(a.id)
      const moneyTile = groupNode(screen, h.money)
      const rescue = (nodes: readonly MenuNode[], id: string) => (nodes.find((n) => n.id === `biz.rescue.${id}`) as MenuGroup | undefined)?.label
      expect(rescue(moneyTile.children(g), a.id)).toBe('Capital & Ownership')
      // The same tile object, a later state: the company is broke now.
      const later = structuredClone(g)
      bizOf(later, findBusiness(later, a.id)!).cash = -1_000_000
      expect(rescue(moneyTile.children(later), a.id)).toBe('Financial Rescue & Ownership')
      // And the company is gone.
      const gone = structuredClone(g)
      gone.assets = gone.assets.filter((x) => x.id !== a.id)
      for (const t of [h.run, h.money, h.lead, h.exit]) {
        const kids = groupNode(screen, t).children(gone)
        expect(kids.map((n) => n.type), t).toEqual(['info'])
        expect(textOf(kids[0] as MenuInfo, gone), t).toBe('You no longer own this business.')
      }
    })
  })
})

describe('the KPI row', () => {
  it('replaces the money and results rows with their texts joined by a bar, and draws the same spec companyKpiSpec returns', () => {
    const { g, a } = kind(KINDS[0]!)
    const flat = businessView(g, a)
    const old = [`biz.dash.money.${a.id}`, `biz.dash.results.${a.id}`].map((id) => textOf(infoNode(flat, id), g))
    withFlags(COCKPIT, () => {
      const row = infoNode(businessScreen(g, a), hubIds(a.id).kpi)
      expect(textOf(row, g)).toBe(old.join(' | '))
      expect(row.emoji).toBe('\u{1F4CA}')
      expect(row.chart).toBeTypeOf('function')
      expect(row.chart!(g)).toEqual(companyKpiSpec(g, a))
      // Drawn from the state it is asked with: a later year gives a later spec, never the old one.
      const later = structuredClone(g)
      bizOf(later, findBusiness(later, a.id)!).cash += 123_456
      expect(lastReal(seriesOf(row.chart!(later)!, 'cash'))).toBe(Math.round(bizOf(later, findBusiness(later, a.id)!).cash))
      // A state without the company draws nothing.
      const gone = structuredClone(g)
      gone.assets = gone.assets.filter((x) => x.id !== a.id)
      expect(row.chart!(gone)).toBeNull()
    })
  })

  it('4. the spec: a kpi of at most 6 series and 64 points, short strings, valid for readChartSpec, numbers finite or null', () => {
    const variants: { label: string; g: GameState; a: Asset }[] = []
    for (const k of KINDS.filter((x) => x.years > 0)) variants.push({ label: k.name, ...kind(k) })
    // A 30-row history (the books keep 30 years).
    const long = kind(KINDS[0]!)
    const lb = bizOf(long.g, long.a)
    const endYear = lb.last!.year
    const rows: YearRecord[] = Array.from({ length: 30 }, (_, i) => ({
      year: endYear - 29 + i,
      revenue: 1_000_000 + i * 50_000,
      profit: 100_000 + i * 7_000,
      tax: 10_000,
      units: 1_000,
      price: 10,
      staff: 5,
      valuation: 2_000_000 + i * 90_000,
      outlets: 1,
      cash: 300_000 + i * 20_000,
      debt: 0,
    }))
    lb.history = rows
    variants.push({ label: '30 rows', ...long })
    for (const v of variants) {
      const b = readBiz(v.g, v.a)
      const spec = companyKpiSpec(v.g, v.a)
      expect(spec, v.label).not.toBeNull()
      const s = spec!
      expect(s.kind, v.label).toBe('kpi')
      expect(s.unit, v.label).toBe('money')
      expect(s.series.length, v.label).toBeLessThanOrEqual(CHART_LIMITS.series)
      expect(s.x.length, v.label).toBeLessThanOrEqual(CHART_LIMITS.points)
      expect(s.title.length, v.label).toBeLessThanOrEqual(CHART_LIMITS.title)
      expect(s.title, v.label).toBe(`${v.a.name}: at a glance`)
      expect(s.summary.length, v.label).toBeLessThanOrEqual(CHART_LIMITS.text)
      expect(s.summary, v.label).toMatch(/^Test Co: sales .+, net (profit|loss) .+, cash .+, value .+\.$/)
      for (const str of [s.title, s.summary, ...s.x.filter((x): x is string => typeof x === 'string'), ...s.series.map((x) => x.label)]) {
        expect(str.length, v.label).toBeLessThanOrEqual(CHART_LIMITS.text)
        expect(str, v.label).not.toMatch(DASH)
        expect(str, v.label).not.toMatch(BAD)
      }
      expect(readChartSpec(s), v.label).not.toBeNull()
      expect(s.series.map((x) => x.id), v.label).toEqual(['sales', 'net', 'cash', 'value'])
      expect(s.series.map((x) => x.label), v.label).toEqual(['Sales', 'Net profit', 'Cash', 'Value'])
      expect(s.series.map((x) => x.tone), v.label).toEqual(['c1', b.last!.net >= 0 ? 'good' : 'bad', 'c3', 'c2'])
      for (const line of s.series) {
        expect(line.values.length, v.label).toBe(s.x.length)
        for (const n of line.values) if (n !== null) expect(Number.isFinite(n) && Math.abs(n) <= SPEC_LIMITS.magnitude, `${v.label} ${line.id}`).toBe(true)
      }
      expect(s.x[s.x.length - 1], v.label).toBe('now')
      expect(s.x.slice(0, -1).every((x) => typeof x === 'number'), v.label).toBe(true)
      // Sales and net profit are history; cash and value end at the live numbers.
      expect(seriesOf(s, 'sales')[s.x.length - 1], v.label).toBeNull()
      expect(seriesOf(s, 'net')[s.x.length - 1], v.label).toBeNull()
      expect(lastReal(seriesOf(s, 'sales')), v.label).toBe(Math.round(b.last!.revenue))
      expect(lastReal(seriesOf(s, 'net')), v.label).toBe(Math.round(b.last!.net))
      expect(lastReal(seriesOf(s, 'cash')), v.label).toBe(Math.round(b.cash))
      expect(lastReal(seriesOf(s, 'value')), v.label).toBe(Math.round(b.valuation))
    }
    expect(companyKpiSpec(long.g, long.a)!.x.length).toBe(31)
  })

  it('4a. a loss turns the net profit tile bad and the summary says loss', () => {
    const { g, a } = kind(KINDS[0]!)
    bizOf(g, a).last!.net = -250_000
    const spec = companyKpiSpec(g, a)!
    expect(spec.series.find((x) => x.id === 'net')!.tone).toBe('bad')
    expect(lastReal(seriesOf(spec, 'net'))).toBe(-250_000)
    expect(spec.summary).toContain('net loss ')
    expect(readChartSpec(spec)).not.toBeNull()
  })

  // R1-C5 has merged when the file is there; the Annual Report tiles and the cockpit must print the same four numbers.
  const hasKpis = existsSync(fileURLToPath(new URL('../src/game/charts/books.ts', import.meta.url)))
  if (hasKpis) {
    it('4b. agrees with the Annual Report tiles (R1-C5 companyKpis) on sales, net profit, cash and value, after 8 booked years', () => {
      const { g, a } = company(13, 'restaurant', { years: 8 })
      const b = readBiz(g, a)
      expect(b.history.length).toBe(8)
      const tiles = companyKpis(g, b, null)
      const tile = (title: string) => lastReal(tiles.find((t) => t.title === title)!.series[0]!.values)
      const spec = companyKpiSpec(g, a)!
      expect(lastReal(seriesOf(spec, 'sales'))).toBe(tile('Sales'))
      expect(lastReal(seriesOf(spec, 'net'))).toBe(tile('Net profit'))
      expect(lastReal(seriesOf(spec, 'cash'))).toBe(tile('Cash'))
      expect(lastReal(seriesOf(spec, 'value'))).toBe(tile('Value'))
    })
  }

  it('5. a brand-new company has no settled year: no spec, the old money and results rows stay, no KPI row', () => {
    const { g, a } = kind(KINDS[4]!)
    expect(readBiz(g, a).last).toBeNull()
    expect(companyKpiSpec(g, a)).toBeNull()
    withFlags(COCKPIT, () => {
      const screen = businessScreen(g, a)
      const ids = screen.map(idOf)
      expect(ids).not.toContain(hubIds(a.id).kpi)
      expect(ids.slice(0, 3)).toEqual([`biz.dash.who.${a.id}`, `biz.dash.money.${a.id}`, `biz.dash.results.${a.id}`])
      expect(ids).toContain(hubIds(a.id).run)
    })
  })

  it('6. an old save: rows with the 9 original numbers, and a row of strings and NaN, give no NaN and no undefined', () => {
    const { g, a } = kind(KINDS[0]!)
    const b = bizOf(g, a)
    const nine = b.history.map(({ year, revenue, profit, tax, units, price, staff, valuation, outlets }) => ({ year, revenue, profit, tax, units, price, staff, valuation, outlets }))
    a.details.history = [...nine, { year: b.last!.year - 5, revenue: 'abc', profit: Number.NaN, tax: null, valuation: 'x', outlets: {} }] as unknown as Json
    const spec = companyKpiSpec(g, a)
    expect(spec).not.toBeNull()
    const text = JSON.stringify(spec)
    expect(text).not.toMatch(BAD)
    expect(readChartSpec(spec)).not.toBeNull()
    const cash = seriesOf(spec!, 'cash')
    expect(cash.slice(0, -1).every((v) => v === null)).toBe(true)
    expect(cash[cash.length - 1]).toBe(Math.round(readBiz(g, a).cash))
    for (const line of spec!.series) for (const v of line.values) if (v !== null) expect(Number.isFinite(v)).toBe(true)
    withFlags(COCKPIT, () => {
      const screen = businessScreen(g, a)
      for (const t of Object.values(hubIds(a.id)).filter((id) => id !== hubIds(a.id).kpi)) {
        const sub = subtitleOf(groupNode(screen, t), g)
        expect(sub, t).not.toMatch(BAD)
      }
    })
  })

  it('7. a hostile history (profit 1e300, valuation -Infinity, a statement of 1e300) is clamped or dropped: valid spec or null, no throw', () => {
    const { g, a } = kind(KINDS[0]!)
    const b = bizOf(g, a)
    a.details.history = b.history.map((r, i) => ({ ...r, profit: i === 0 ? 1e300 : r.profit, valuation: i === 1 ? Number.NEGATIVE_INFINITY : r.valuation, revenue: i === 2 ? -1e300 : r.revenue })) as unknown as Json
    const hostile = structuredClone(g)
    const hb = bizOf(hostile, findBusiness(hostile, a.id)!)
    hb.last!.revenue = 1e300
    hb.cash = 1e300
    for (const state of [g, hostile]) {
      const cur = findBusiness(state, a.id)!
      const attempt = (): ChartSpec | null => companyKpiSpec(state, cur)
      expect(attempt).not.toThrow()
      const spec = attempt()
      if (spec !== null) {
        expect(readChartSpec(spec)).not.toBeNull()
        for (const line of spec.series) for (const v of line.values) if (v !== null) expect(Number.isFinite(v) && Math.abs(v) <= SPEC_LIMITS.magnitude).toBe(true)
        expect(JSON.stringify(spec)).not.toMatch(BAD)
      }
      withFlags(COCKPIT, () => {
        expect(() => dump(state, businessScreen(state, cur))).not.toThrow()
      })
    }
    // 1e300 of cash is no number a chart can carry: the 'now' point is a gap, not a clamp.
    const gone = companyKpiSpec(hostile, findBusiness(hostile, a.id)!)
    if (gone !== null) {
      expect(seriesOf(gone, 'cash')[gone.x.length - 1]).toBeNull()
      expect(lastReal(seriesOf(gone, 'sales'))).not.toBe(1e300)
    }
  })

  it('7b. a company whose statement is not in its history still draws it (the statement is the book of record)', () => {
    const { g, a } = kind(KINDS[0]!)
    const b = bizOf(g, a)
    b.history = []
    const spec = companyKpiSpec(g, a)!
    expect(spec.x).toEqual([b.last!.year, 'now'])
    expect(lastReal(seriesOf(spec, 'sales'))).toBe(Math.round(b.last!.revenue))
    expect(lastReal(seriesOf(spec, 'net'))).toBe(Math.round(b.last!.net))
    expect(readChartSpec(spec)).not.toBeNull()
  })

  it('7c. a name with control characters, or none, still makes a valid title', () => {
    const { g, a } = kind(KINDS[0]!)
    a.name = 'Bad\u0000\nName'
    expect(readChartSpec(companyKpiSpec(g, a))).not.toBeNull()
    a.name = '   '
    const spec = companyKpiSpec(g, a)!
    expect(readChartSpec(spec)).not.toBeNull()
    expect(spec.title.length).toBeGreaterThan(0)
    a.name = 'W'.repeat(200)
    const long = companyKpiSpec(g, a)!
    expect(long.title.length).toBeLessThanOrEqual(CHART_LIMITS.title)
    expect(readChartSpec(long)).not.toBeNull()
  })
})

describe('purity', () => {
  it('8. rendering twice on a frozen state gives equal screens, and leaves the state and the random stream alone', () => {
    for (const k of KINDS) {
      const { g, a } = kind(k)
      deepFreeze(g)
      const before = JSON.stringify(g)
      const rng = JSON.stringify(g.rng)
      withFlags({ cockpits: true, chartKit: true }, () => {
        const one = JSON.stringify(dump(g, businessScreen(g, a)))
        const two = JSON.stringify(dump(g, businessScreen(g, a)))
        expect(two, k.name).toBe(one)
        expect(one, k.name).not.toMatch(BAD)
      })
      expect(JSON.stringify(g), `${k.name}: the state changed`).toBe(before)
      expect(JSON.stringify(g.rng), `${k.name}: the random stream moved`).toBe(rng)
    }
  }, HEAVY)

  it('8b. hubs/company.ts imports no menu, business, career or asset module, draws nothing and books no money', () => {
    const src = readFileSync(fileURLToPath(new URL('../src/game/hubs/company.ts', import.meta.url)), 'utf8')
    expect(src).not.toMatch(/from '\.\.\/(menus|business|careers?|assets)'/)
    expect(src).not.toMatch(/from '\.\.\/business\/(manage|career|conglomerate)/)
    expect(src).not.toMatch(/from '\.\.\/\.\.\/ui/)
    expect(src).not.toMatch(/rand\(|\.rng|earnIncome|spend\(|addMoney|\.cash \+=|\.money \+=/)
    expect(src).not.toMatch(/\bg\.[a-zA-Z.]+\s*=[^=]/)
    expect(src).not.toMatch(DASH)
  })
})

describe('wiring', () => {
  it('9. the company group, the owned-asset view, the studio group and a division all show businessScreen', () => {
    const { g, a } = company(31, 'restaurant', { years: 2 })
    const studio = createBusinessAsset(g, 'Studio Co', newBiz(g, 'gameStudio', 'us', 'Chicago', { cash: 800_000 }), 0)
    g.assets.push(studio)
    for (const flags of [{}, COCKPIT]) {
      withFlags(flags, () => {
        const screen = businessScreen(g, a).map(idOf)
        const row = groupNode(businessCareerMenu.children(g), `biz.company.${a.id}`)
        expect(row.children(g).map(idOf), 'Business > company').toEqual(screen)
        expect(businessAssetView(g, a).map(idOf), 'owned-asset view').toEqual(screen)
        const studioScreen = businessScreen(g, studio).map(idOf)
        const fromGameIndustry = groupNode(gameIndustryMenu.children(g), `gamedev.studio.${studio.id}`)
        expect(fromGameIndustry.children(g).map(idOf), 'Game Industry > studio').toEqual(studioScreen)
      })
    }
  })

  it('9b. a division on a conglomerate screen opens the same cockpit', () => {
    const grp = company(27, 'restaurant', { years: 2, brand: 60, quality: 70 })
    const other = createBusinessAsset(grp.g, 'Sister Co', newBiz(grp.g, 'cafe', 'us', 'Chicago', { cash: 1_000_000 }), 0)
    grp.g.assets.push(other)
    expect(formGroup(grp.g, [grp.a.id, other.id], 'Test Holdings')).toBe(true)
    grp.g.queue = []
    const groupId = groupOfCompany(grp.g, findBusiness(grp.g, grp.a.id)!)!.core.id
    for (const flags of [{}, COCKPIT]) {
      withFlags(flags, () => {
        const division = groupNode(groupView(grp.g, groupId), `biz.company.${grp.a.id}`)
        expect(division.children(grp.g).map(idOf)).toEqual(businessScreen(grp.g, findBusiness(grp.g, grp.a.id)!).map(idOf))
      })
    }
  })

  it('9c. no code outside manage.ts and hubs/ calls businessView(', () => {
    const root = fileURLToPath(new URL('../src', import.meta.url))
    const hits: string[] = []
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const path = `${dir}/${e.name}`
        if (e.isDirectory()) walk(path)
        else if (/\.(ts|tsx)$/.test(e.name)) {
          const rel = path.slice(root.length + 1)
          if (rel === 'game/business/manage.ts' || rel.startsWith('game/hubs/')) continue
          if (/\bbusinessView\(/.test(readFileSync(path, 'utf8'))) hits.push(rel)
        }
      }
    }
    walk(root)
    expect(hits).toEqual([])
  })
})

describe('tile subtitles', () => {
  function subtitles(g: GameState, a: Asset): { run: string; money: string; lead: string; exit: string } {
    return withFlags(COCKPIT, () => {
      const screen = businessScreen(g, a)
      const h = hubIds(a.id)
      return { run: subtitleOf(groupNode(screen, h.run), g), money: subtitleOf(groupNode(screen, h.money), g), lead: subtitleOf(groupNode(screen, h.lead), g), exit: subtitleOf(groupNode(screen, h.exit), g) }
    })
  }

  it('10. every kind: at most 60 characters, no dash, no NaN, undefined or Infinity', () => {
    for (const k of KINDS) {
      const { g, a } = kind(k)
      for (const [which, text] of Object.entries(subtitles(g, a))) {
        expect(text.length, `${k.name} ${which}: ${text}`).toBeLessThanOrEqual(60)
        expect(text.length, `${k.name} ${which}`).toBeGreaterThan(0)
        expect(text, `${k.name} ${which}`).not.toMatch(DASH)
        expect(text, `${k.name} ${which}`).not.toMatch(BAD)
      }
    }
  })

  it('10b. says what the plan says: sites and staff, cash and debt, who is CEO, what it is worth', () => {
    const { g, a } = kind(KINDS[0]!)
    const b = readBiz(g, a)
    const sites = b.outlets.reduce((s, o) => s + o.count, 0)
    const staff = b.employees + b.staff.length
    let s = subtitles(g, a)
    expect(s.run).toBe(`${sites === 1 ? '1 restaurant' : `${sites} restaurants`} · ${staff} staff`)
    expect(s.money).toBe(`Cash ${money(b.cash)}`)
    expect(s.lead).toBe('You are CEO')
    expect(s.exit).toBe(`Worth ${money(b.valuation)}`)

    // Debt, three sites.
    const indebted = structuredClone(g)
    const ib = bizOf(indebted, findBusiness(indebted, a.id)!)
    ib.debt = 250_000
    ib.outlets[0]!.count = 3
    s = subtitles(indebted, findBusiness(indebted, a.id)!)
    expect(s.money).toBe(`Cash ${money(ib.cash)} · debt ${money(250_000)}`)
    expect(s.run).toMatch(/^3 restaurants · /)

    // A hired CEO.
    const hired = structuredClone(g)
    const hb = bizOf(hired, findBusiness(hired, a.id)!)
    installManager(hired, hb, managerCandidate(hired, hb, 60))
    hired.character.job = null
    s = subtitles(hired, findBusiness(hired, a.id)!)
    expect(s.lead).toMatch(/^Hired CEO · skill \d+$/)

    // Nobody.
    const nobody = structuredClone(g)
    nobody.character.job = null
    const nb = bizOf(nobody, findBusiness(nobody, a.id)!)
    nb.ceo = 'owner'
    nb.manager = null
    expect(subtitles(nobody, findBusiness(nobody, a.id)!).lead).toBe('No CEO')

    // Listed.
    const listed = structuredClone(g)
    const la = findBusiness(listed, a.id)!
    goPublic(listed, la, bizOf(listed, la))
    listed.queue = []
    s = subtitles(listed, la)
    expect(s.exit).toBe(`Listed · ${money(readBiz(listed, la).valuation)}`)
  })

  it('10c. a company that is gone has empty subtitles, not an error', () => {
    const { g, a } = kind(KINDS[0]!)
    withFlags(COCKPIT, () => {
      const screen = businessScreen(g, a)
      const gone = structuredClone(g)
      gone.assets = gone.assets.filter((x) => x.id !== a.id)
      for (const t of Object.values(hubIds(a.id)).filter((id) => id !== hubIds(a.id).kpi)) expect(subtitleOf(groupNode(screen, t), gone), t).toBe('')
    })
  })

  it('10d. the facts are read once per state: a state mutated after the first read is not read again (the memo is keyed by the state object)', () => {
    const { g, a } = kind(KINDS[0]!)
    withFlags(COCKPIT, () => {
      const screen = businessScreen(g, a)
      const tile = groupNode(screen, hubIds(a.id).money)
      const first = subtitleOf(tile, g)
      bizOf(g, a).cash += 5_000_000
      expect(subtitleOf(tile, g)).toBe(first)
      // A new state object is a new read.
      const next = structuredClone(g)
      expect(subtitleOf(tile, next)).not.toBe(first)
    })
  })
})

describe('fuzz-kit walk depth', () => {
  function group(id: string, children: MenuNode[]): MenuGroup {
    return { type: 'menu', id, label: id, emoji: 'E', children: () => children }
  }

  /** A chain of groups named in `ids`, one inside the other, with an action at the bottom. */
  function chain(ids: string[], ran: string[]): MenuNode[] {
    const leaf: MenuNode = { type: 'action', id: 'leaf', label: 'Leaf', emoji: 'E', run: () => void ran.push('leaf') }
    return [ids.reduceRight<MenuNode>((inner, id) => group(id, [inner]), leaf)]
  }

  function reached(ids: string[]): boolean {
    const ran: string[] = []
    const log = new FailureLog()
    probeActions(createNavKid(), log, 1, { roots: () => chain(ids, ran) })
    expect(log.size, JSON.stringify([...log.bySig.keys()])).toBe(0)
    return ran.length > 0
  }

  function createNavKid(): GameState {
    const g = createNewLife({ seed: 77, year: 2020, countryId: 'us' })
    g.queue = []
    return g
  }

  it('11. a hub group adds no depth: the same tree is walked one level deeper with a hub in it', () => {
    // probeActions walks with maxDepth 7: a group in a list at depth 7 is not entered. Seven plain groups hide the leaf.
    expect(reached(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'])).toBe(false)
    expect(reached(['c1', 'c2', 'c3', 'c4', 'c5', 'c6'])).toBe(true)
    // The same seven groups with one of them a hub: the leaf is reached.
    expect(reached(['c1', 'c2', 'c3', 'hub.c4', 'c5', 'c6', 'c7'])).toBe(true)
    // A hub at the cap itself is still entered.
    expect(reached(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'hub.c7'])).toBe(true)
    // Two hubs cost nothing either.
    expect(reached(['hub.a', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'hub.b'])).toBe(true)
  }, HEAVY)
})
