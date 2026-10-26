// R1-N9: the wealth cockpit and the thin tab cockpits. cockpitOf builds a small model for a tab (tiles, a net-worth chart,
// one card per company) and CockpitPanel draws it above the list of Assets, Occupation, Relationships and Activities.
// Everything in the game layer is pure: no draw, no write to the game, no foresight, and the numbers it shows are the
// ones the screens above already print. The chart kit arrives through the lazy views, so until a chunk is ready the
// tiles and the cards show their text, and a test reads real words.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bizOf, businessAssets, findBusiness, readBiz, type YearRecord } from '../src/game/business/state'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { moneyLabel } from '../src/game/charts/money'
import { readChartSpec } from '../src/game/charts/spec'
import { netWorth, shortMoney } from '../src/game/core'
import { resetFlags, setFlags, withFlags } from '../src/game/flags'
import { cockpitOf, type CockpitModel, type CockpitTab } from '../src/game/hubs/cockpit'
import { hubIds } from '../src/game/hubs/company'
import { peopleMenu, personGroupId } from '../src/game/hubs/people'
import { needsYou } from '../src/game/hubs/needs'
import { companyCards, type CompanyCard } from '../src/game/hubs/wealth'
import { assetsMenu } from '../src/game/menus'
import type { Asset, GameState, Job, Json } from '../src/game/types'
import { getCountry } from '../src/game/world'
import { CockpitBody, jumpLinks, type JumpLink } from '../src/ui/nav/CockpitBody'
import { CockpitPanel } from '../src/ui/nav/CockpitPanel'
import { JumpStrip } from '../src/ui/nav/JumpStrip'
import { LazyChartView, LazyKpiTile, LazySparkline } from '../src/ui/nav/kit'
import { emptyPrefs, pushRecent, resetPrefsForTest, togglePin, updatePrefs, type UiPrefs } from '../src/ui/nav/prefs'
import { ChartViewLazy } from '../src/ui/charts/lazy'
import { deepFreeze } from './fuzz-kit'
import { NAV_OFF, frozen, navState } from './nav-kit'

// Built-in tasks resolve to nothing here (the pattern of test/ui-return.test.ts), so only what a test queues shows up.
const offline = vi.hoisted(() => {
  const resolve = vi.fn()
  return { applyFallback: resolve, resolveTask: resolve, MAX_CUSTOM_ACTIONS_PER_YEAR: 5, CUSTOM_ACTION_KEY: 'doAnything' }
})
vi.mock('../src/game/offline', () => offline)

const store = await import('../src/ui/store')
const { MenuSheet } = await import('../src/ui/components/MenuSheet')
const { RelationshipsSheet } = await import('../src/ui/components/RelationshipsSheet')

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)
const BAD = /NaN|undefined|Infinity/
const render = (el: ReactElement): string => renderToStaticMarkup(el)

beforeEach(() => {
  setFlags(NAV_OFF)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  resetFlags()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Builders

/** The life series of a state, as the writer leaves it: [age, year, netWorth, cash, debt, income, happiness, health]. */
function withRows(g: GameState, worth: readonly number[], firstAge = 30): GameState {
  const rows = worth.map((w, i) => [firstAge + i, g.year - worth.length + i, w, 1000, 0, 0, 50, 50])
  g.flags.lifeSeries = { v: 1, id: g.lifeId, rows } as unknown as Json
  return g
}

/** `n` cafes on top of whatever the state owns, valuation 100K + 7K * ((i * 5) % n), so the order in the list is not the order of worth. */
function withCompanies(g: GameState, n: number): GameState {
  for (let i = 0; i < n; i++) {
    const b = newBiz(g, 'cafe', 'us', getCountry('us').cities[0]!, { cash: 40_000 })
    b.valuation = 100_000 + 7_000 * ((i * 5) % n)
    const a = createBusinessAsset(g, `Cafe ${i}`, b, 10_000)
    g.assets.push(a)
  }
  return g
}

function job(extra: Partial<Job> = {}): Job {
  return { defId: 'barista', title: 'Barista', company: 'Corner Cafe', category: 'fulltime', salary: 41_000, level: 0, performance: 60, yearsInRole: 1, yearsAtCompany: 3, data: {}, ...extra }
}

/** Every number in a value is finite and no string says NaN, undefined or Infinity. */
function expectClean(v: unknown, where = 'model'): void {
  if (typeof v === 'number') {
    expect(Number.isFinite(v), `${where} is ${v}`).toBe(true)
  } else if (typeof v === 'string') {
    expect(v, where).not.toMatch(BAD)
  } else if (Array.isArray(v)) {
    v.forEach((x, i) => expectClean(x, `${where}[${i}]`))
  } else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) expectClean(x, `${where}.${k}`)
  }
}

/** Replace the store's game with a canned state (the way a load would), keeping the store's own bookkeeping. */
function install(g: GameState): void {
  store.startNewLife({ seed: 7, year: 2026 })
  store.act((cur) => {
    Object.assign(cur, structuredClone(g))
    cur.queue = []
  })
}

// ---------------------------------------------------------------------------

describe('1. companyCards', () => {
  it('gives one finite card for each company of the ceo, with the sales of its years oldest first', () => {
    const g = frozen('ceo')
    const cards = companyCards(g)
    expect(cards).toHaveLength(2)
    expect(cards.map((c) => c.name).sort()).toEqual(['Harbor Grill', 'Pixel Forge'])
    for (const card of cards) {
      const a = findBusiness(g, card.assetId)!
      const b = readBiz(g, a)
      expectClean(card, card.name)
      expect(card.open).toEqual([`asset-${card.assetId}`])
      expect(card.sales.length).toBeLessThanOrEqual(10)
      expect(card.sales).toEqual(b.history.slice(-10).map((h) => h.revenue))
      expect(card.salesNow).toBe(b.last ? b.last.revenue : null)
      expect(card.net).toBe(b.last ? b.last.net : null)
      expect(card.valuation).toBe(b.valuation)
      expect(card.cash).toBe(b.cash)
      expect(card.emoji).not.toBe('')
      expect(card.industry).not.toBe('')
      expect(['new', 'thriving', 'steady', 'struggling', 'danger']).toContain(card.health.id)
      expect(card.health.label).not.toBe('')
      expect(card.health.emoji).not.toBe('')
    }
  })

  it('keeps at most the last 10 years of sales, oldest first', () => {
    const g = navState('ceo')
    const a = businessAssets(g)[0]!
    const rows: YearRecord[] = Array.from({ length: 14 }, (_, i) => ({ ...bizOf(g, a).history[0]!, year: 2000 + i, revenue: 1000 * (i + 1) }))
    bizOf(g, a).history = rows
    const card = companyCards(g).find((c) => c.assetId === a.id)!
    expect(card.sales).toHaveLength(10)
    expect(card.sales).toEqual(rows.slice(-10).map((r) => r.revenue))
  })

  it('has no runway for a company that made money and a positive one for a company that lost it', () => {
    const g = navState('ceo')
    const [rich, poor] = businessAssets(g) as [Asset, Asset]
    const b1 = bizOf(g, rich)
    b1.last!.net = 80_000
    b1.cash = 100_000
    const b2 = bizOf(g, poor)
    b2.last!.net = -50_000
    b2.cash = 100_000
    const cards = companyCards(g)
    expect(cards.find((c) => c.assetId === rich.id)!.runwayYears).toBeNull()
    const losing = cards.find((c) => c.assetId === poor.id)!
    expect(losing.runwayYears).toBeCloseTo(2, 5)
    expect(losing.net).toBe(-50_000)
  })

  it('has no cards for a life without a company', () => {
    expect(companyCards(frozen('adult'))).toEqual([])
    expect(cockpitOf('assets', frozen('adult')).cards).toEqual([])
    expect(cockpitOf('assets', frozen('adult')).moreCards).toBe(0)
  })
})

describe('2. the cap and the order', () => {
  it('shows 12 of 13 companies, the richest first, and counts the one more', () => {
    const g = withCompanies(navState('adult'), 13)
    expect(businessAssets(g)).toHaveLength(13)
    const cards = companyCards(g)
    expect(cards).toHaveLength(12)
    const worth = cards.map((c) => c.valuation)
    expect(worth).toEqual([...worth].sort((a, b) => b - a))
    const all = businessAssets(g).map((a) => readBiz(g, a).valuation)
    expect(Math.min(...worth)).toBeGreaterThan(Math.min(...all))
    const model = cockpitOf('assets', g)
    expect(model.cards).toHaveLength(12)
    expect(model.moreCards).toBe(1)
  })

  it('takes a smaller cap when asked', () => {
    const g = withCompanies(navState('adult'), 5)
    expect(companyCards(g, 3)).toHaveLength(3)
    expect(companyCards(g, 99)).toHaveLength(5)
    expect(companyCards(g, 0)).toEqual([])
    expect(companyCards(g, Number.NaN)).toHaveLength(5)
  })
})

describe('3. the memo', () => {
  it('returns the same array for the same state and recomputes for a new one', () => {
    const g = frozen('ceo')
    const first = companyCards(g)
    expect(companyCards(g)).toBe(first)
    const next = structuredClone(g)
    const again = companyCards(next)
    expect(again).not.toBe(first)
    expect(again).toEqual(first)
  })

  it('keeps one answer for each cap', () => {
    const g = frozen('ceo')
    expect(companyCards(g, 1)).toHaveLength(1)
    expect(companyCards(g)).toHaveLength(2)
    expect(companyCards(g, 1)).toBe(companyCards(g, 1))
  })
})

describe('4. cockpitOf assets', () => {
  it('has Net worth, Cash and Debt that read the same books as the screens', () => {
    const g = navState('adult')
    g.character.loans.push({ id: 'loan-x', kind: 'personal', lender: 'First Bank', balance: 12_000, yearlyPayment: 2_000, rate: 0.06 })
    const model = cockpitOf('assets', g)
    expect(model.tab).toBe('assets')
    expect(model.tiles.map((t) => t.id)).toEqual(['net', 'cash', 'debt'])
    const [net, cash, debt] = model.tiles as [CockpitModel['tiles'][number], CockpitModel['tiles'][number], CockpitModel['tiles'][number]]
    expect(net.label).toBe('Net worth')
    expect(net.value).toBe(moneyLabel(g, netWorth(g)))
    expect(net.value).toBe(shortMoney(netWorth(g)))
    expect(net.tone).toBe('c1')
    expect(cash.label).toBe('Cash')
    expect(cash.value).toBe(moneyLabel(g, g.character.money))
    expect(cash.tone).toBe('c3')
    const owed = g.character.loans.reduce((t, l) => t + l.balance, 0) + g.assets.reduce((t, a) => t + (a.mortgage?.balance ?? 0), 0)
    expect(owed).toBeGreaterThanOrEqual(12_000)
    expect(debt.label).toBe('Debt')
    expect(debt.value).toBe(moneyLabel(g, owed))
    expect(debt.tone).toBe('bad')
    expect(model.summary).not.toBe('')
    expect(model.summary.length).toBeLessThanOrEqual(120)
    expectClean(model)
  })

  it('tones Debt muted when there is none', () => {
    const g = navState('adult')
    g.character.loans = []
    for (const a of g.assets) delete a.mortgage
    const debt = cockpitOf('assets', g).tiles.find((t) => t.id === 'debt')!
    expect(debt.tone).toBe('muted')
    expect(debt.value).toBe(moneyLabel(g, 0))
  })

  it('opens Banking from Debt only when the Assets list has that group', () => {
    for (const name of ['kid', 'adult', 'ceo', 'elder'] as const) {
      const g = frozen(name)
      const listed = assetsMenu.children(g).some((n) => n.type === 'menu' && n.id === 'banking' && (n.visible ? n.visible(g) : true))
      const debt = cockpitOf('assets', g).tiles.find((t) => t.id === 'debt')!
      expect(debt.open, name).toEqual(listed ? ['banking'] : undefined)
    }
    expect(cockpitOf('assets', frozen('adult')).tiles.find((t) => t.id === 'debt')!.open).toEqual(['banking'])
    expect(cockpitOf('assets', frozen('kid')).tiles.find((t) => t.id === 'debt')!.open).toBeUndefined()
    // The other two tiles have no screen of their own.
    expect(cockpitOf('assets', frozen('adult')).tiles.filter((t) => t.id !== 'debt').every((t) => t.open === undefined)).toBe(true)
  })

  it('has no chart with fewer than two points and a timeline with three rows', () => {
    const none = navState('adult')
    expect(cockpitOf('assets', none).chart).toBeNull()
    const net0 = cockpitOf('assets', none).tiles[0]!
    expect(net0.spark === undefined || net0.spark.length < 2).toBe(true)
    // One row at the present age is the same point as the live worth: still no line.
    const one = withRows(navState('adult'), [50_000], 35)
    expect(cockpitOf('assets', one).chart).toBeNull()

    const three = withRows(navState('adult'), [10_000, 30_000, 90_000], 32)
    const model = cockpitOf('assets', three)
    expect(model.chart).not.toBeNull()
    expect(model.chart!.kind).toBe('timeline')
    expect(model.chart!.series[0]!.values.length).toBeGreaterThanOrEqual(3)
    expect(readChartSpec(JSON.parse(JSON.stringify(model.chart)))).not.toBeNull()
    const spark = model.tiles[0]!.spark!
    expect(spark).toEqual([10_000, 30_000, 90_000])
  })
})

describe('5. cockpitOf occupation', () => {
  const ids = (g: GameState): string[] => cockpitOf('occupation', g).tiles.map((t) => t.id)
  const tile = (g: GameState, id: string) => cockpitOf('occupation', g).tiles.find((t) => t.id === id)!

  it('has Role, Pay, Performance and Years here for a job', () => {
    const g = navState('adult')
    expect(g.character.job).not.toBeNull()
    const model = cockpitOf('occupation', g)
    expect(model.tab).toBe('occupation')
    expect(model.tiles.map((t) => t.id)).toEqual(['role', 'pay', 'performance', 'years'])
    const j = g.character.job!
    expect(tile(g, 'role').value).toBe(j.title)
    expect(tile(g, 'role').note).toBe(j.company)
    expect(tile(g, 'pay').value).toBe(`${moneyLabel(g, j.salary)}/yr`)
    expect(tile(g, 'performance').meter).toBe(Math.round(j.performance))
    expect(tile(g, 'years').value).toContain(String(j.yearsAtCompany))
    expect(model.chart).toBeNull()
    expect(model.cards).toEqual([])
    expect(model.summary).toContain(j.title)
    expectClean(model)
  })

  it('holds the Performance meter to 0 to 100', () => {
    for (const [given, want] of [[250, 100], [-5, 0], [Number.NaN, 0], [Infinity, 0], [72.4, 72]] as const) {
      const g = navState('adult')
      g.character.job!.performance = given
      const t = tile(g, 'performance')
      expect(t.meter, String(given)).toBe(want)
      expectClean(t)
    }
  })

  it('shows the hourly wage of a part-time job', () => {
    const g = navState('adult')
    g.character.job = null
    g.character.partTimeJob = job({ category: 'parttime', salary: 18_720, data: { hourly: 18, hours: 20 } })
    expect(ids(g)).toEqual(['role', 'pay', 'performance', 'years'])
    expect(tile(g, 'pay').value).toBe(`${moneyLabel(g, 18)}/hr`)
  })

  it('shows School and Grades for a student, and holds the grades to 0 to 100', () => {
    const g = navState('adult')
    g.character.job = null
    g.character.education.current = { level: 'high', school: 'Lincoln High', year: 2, totalYears: 4, grades: 140, data: {} }
    expect(ids(g)).toEqual(['school', 'grades'])
    expect(tile(g, 'school').value).toBe('Lincoln High')
    expect(tile(g, 'grades').meter).toBe(100)
    g.character.education.current.grades = Number.NaN
    expect(tile(g, 'grades').meter).toBe(0)
    expectClean(cockpitOf('occupation', g))
  })

  it('shows the Pension of a retired life', () => {
    const g = frozen('elder')
    expect(ids(g)).toEqual(['pension'])
    expect(tile(g, 'pension').value).toBe(`${moneyLabel(g, g.character.pension)}/yr`)
  })

  it('shows one Prison tile in prison', () => {
    const g = navState('adult')
    g.character.prison = { name: 'Stateville', security: 'medium', crime: 'fraud', sentenceYears: 5, yearsServed: 2, respect: 40, appealed: false, escapeAttempts: 0 }
    expect(ids(g)).toEqual(['prison'])
    expect(tile(g, 'prison').value).toBe('Stateville')
    expectClean(cockpitOf('occupation', g))
  })

  it('shows one Role tile with the header word for everyone else', () => {
    const g = navState('adult')
    g.character.job = null
    expect(ids(g)).toEqual(['role'])
    expect(tile(g, 'role').value).toBe('Unemployed')
    const dead = navState('adult')
    dead.character.alive = false
    expect(tile(dead, 'role').value).toBe('Deceased')
    const kid = frozen('kid')
    expect(ids(kid).length).toBeGreaterThan(0)
    expectClean(cockpitOf('occupation', kid))
  })

  it('survives a job whose numbers and words are damaged', () => {
    const g = navState('adult')
    const j = g.character.job as unknown as Record<string, unknown>
    j.title = 7
    j.company = null
    j.salary = Number.NaN
    j.yearsAtCompany = Infinity
    const model = cockpitOf('occupation', g)
    expectClean(model)
    expect(model.tiles.length).toBeGreaterThan(0)
  })
})

describe('6. cockpitOf relationships and activities', () => {
  // Relationships has tiles behind `peopleProfile` (R4-U8, test/people-cockpit.test.ts), so the "no tiles" pin names the flag off.
  it('has no tiles and a one-line summary', () => {
    withFlags({ peopleProfile: false }, () => {
      for (const tab of ['relationships', 'activities'] as const) {
        for (const name of ['kid', 'adult', 'ceo', 'elder'] as const) {
          const model = cockpitOf(tab, frozen(name))
          expect(model.tab).toBe(tab)
          expect(model.tiles, `${tab} ${name}`).toEqual([])
          expect(model.summary, `${tab} ${name}`).not.toBe('')
          expect(model.summary).not.toContain('\n')
          expect(model.summary.length).toBeLessThanOrEqual(120)
          expect(model.chart).toBeNull()
          expect(model.cards).toEqual([])
          expect(model.moreCards).toBe(0)
          expectClean(model)
        }
      }
    })
  })

  it('counts the people who are still in your life', () => {
    const g = navState('adult')
    const living = g.people.filter((p) => p.alive).length
    expect(living).toBeGreaterThan(0)
    expect(cockpitOf('relationships', g).summary).toContain(String(living))
    for (const p of g.people) p.alive = false
    expect(cockpitOf('relationships', g).summary).not.toBe('')
  })
})

describe('7. hostile books', () => {
  function hostile(): GameState {
    const g = navState('ceo')
    const junk = (id: string, details: Record<string, Json>, extra: Record<string, unknown> = {}): Asset =>
      ({ id, kind: 'business', name: 'Junk', emoji: '', purchasePrice: 0, value: 0, condition: 100, purchasedAge: 30, upkeep: 0, details, ...extra }) as unknown as Asset
    g.assets.push(junk('junk1', { industry: 'restaurant', history: 'garbage', last: 7, cash: 'lots', valuation: Number.NaN }, { name: 7 }))
    g.assets.push(
      junk('junk2', {
        industry: 'cafe',
        history: Array.from({ length: 500 }, (_, i) => ({ year: 1900 + i, revenue: i % 7 === 0 ? Number.NaN : i * 1000, profit: i % 5 === 0 ? Infinity : -i, valuation: 1000 * i })),
        last: { year: 2300, revenue: Number.NaN, net: Number.NaN },
        cash: Number.NEGATIVE_INFINITY,
      }),
    )
    g.assets.push({ id: 'house-x', kind: 'house', name: 'Odd House', emoji: '\u{1F3E0}', purchasePrice: 0, value: Number.NaN, condition: 100, purchasedAge: 30, upkeep: 0, details: {} } as unknown as Asset)
    g.character.loans.push({ id: 'loan-nan', kind: 'personal', lender: 'Nobody', balance: Number.NaN, yearlyPayment: 0, rate: 0 })
    g.character.money = Number.NaN
    return g
  }

  it('keeps every model finite and bounded, and does not drop the damaged companies', () => {
    const g = hostile()
    expect(businessAssets(g)).toHaveLength(4)
    for (const tab of ['occupation', 'assets', 'relationships', 'activities'] as const) {
      const model = cockpitOf(tab, g)
      expectClean(model, tab)
      expect(model.cards.length).toBeLessThanOrEqual(12)
      for (const c of model.cards) {
        expect(c.sales.length).toBeLessThanOrEqual(10)
        expect(c.open).toHaveLength(1)
      }
    }
    const cards = companyCards(g)
    expect(cards.map((c) => c.assetId)).toEqual(expect.arrayContaining(['junk1', 'junk2']))
    expect(cards).toHaveLength(4)
  })

  it('draws the damaged model without a NaN in the markup', async () => {
    const g = hostile()
    await Promise.all([LazyKpiTile.preload(), LazySparkline.preload(), ChartViewLazy.preload()])
    const html = render(createElement(CockpitBody, { model: cockpitOf('assets', g), jump: [], onOpen: () => {} }))
    expect(html).not.toMatch(BAD)
    expect(html).toContain('cockpit-card')
  })

  it('reads a 500-row history for the last 10 rows only', () => {
    const g = hostile()
    const card = companyCards(g).find((c) => c.assetId === 'junk2')!
    expect(card.sales.length).toBeLessThanOrEqual(10)
    expectClean(card)
  })
})

describe('8. purity', () => {
  it('leaves a frozen ceo state and its dice alone, and gives the same answer twice', () => {
    const g = withRows(navState('ceo'), [10_000, 50_000, 200_000], 41)
    g.character.loans.push({ id: 'loan-p', kind: 'personal', lender: 'First Bank', balance: 5_000, yearlyPayment: 900, rate: 0.05 })
    deepFreeze(g)
    const before = JSON.stringify(g)
    const rng = g.rng
    for (const tab of ['occupation', 'assets', 'relationships', 'activities'] as const) {
      const first = cockpitOf(tab, g)
      const second = cockpitOf(tab, g)
      expect(second, tab).toEqual(first)
    }
    expect(companyCards(g)).toEqual(companyCards(g))
    expect(JSON.stringify(g)).toBe(before)
    expect(g.rng).toBe(rng)
  })

  it('does not write the state even for the hostile books', () => {
    const g = navState('ceo')
    g.character.money = Number.NaN
    const before = JSON.stringify(g)
    cockpitOf('assets', g)
    cockpitOf('occupation', g)
    expect(JSON.stringify(g)).toBe(before)
  })
})

// ---------------------------------------------------------------------------
// The view

function card(over: Partial<CompanyCard> = {}): CompanyCard {
  return {
    assetId: 'biz-1',
    name: 'Harbor Grill',
    emoji: '\u{1F37D}\u{FE0F}',
    industry: 'Restaurant',
    health: { id: 'thriving', label: 'Thriving', emoji: '\u{1F49A}' },
    sales: [100_000, 120_000, 150_000],
    salesNow: 150_000,
    net: 24_000,
    valuation: 900_000,
    cash: 80_000,
    runwayYears: null,
    open: ['asset-biz-1'],
    ...over,
  }
}

function model(over: Partial<CockpitModel> = {}): CockpitModel {
  return {
    tab: 'assets',
    summary: 'Net worth $1.2M',
    tiles: [
      { id: 'net', label: 'Net worth', value: '$1.2M', tone: 'c1', spark: [1, 2, 4, 8] },
      { id: 'cash', label: 'Cash', value: '$250K', tone: 'c3' },
      { id: 'debt', label: 'Debt', value: '$12K', tone: 'bad', open: ['banking'] },
    ],
    chart: null,
    cards: [card(), card({ assetId: 'biz-2', name: 'Pixel Forge', open: ['asset-biz-2'], net: -90_000, runwayYears: 1.5, health: { id: 'danger', label: 'In danger', emoji: '\u{1F6A8}' } })],
    moreCards: 0,
    ...over,
  }
}

function link(n: number): JumpLink {
  return { key: `assets/g${n}`, label: `Group ${n}`, emoji: '\u{1F4C1}', crumbs: ['Assets', `Group ${n}`], place: { tab: 'assets', path: [`g${n}`] } }
}

const body = (m: CockpitModel, jump: JumpLink[] = [], onOpen: (p: string[]) => void = () => {}): string => render(createElement(CockpitBody, { model: m, jump, onOpen }))

/** Every element of a tree that `pick` accepts. Plain function components are called; the lazy views are left alone. */
type El = ReactElement<Record<string, unknown> & { children?: ReactNode }>
function collect(node: ReactNode, pick: (e: El) => boolean, out: El[] = []): El[] {
  if (Array.isArray(node)) {
    for (const n of node) collect(n as ReactNode, pick, out)
    return out
  }
  if (typeof node !== 'object' || node === null) return out
  const e = node as El
  if (pick(e)) out.push(e)
  const t = e.type as unknown
  if (typeof t === 'function' && !String((t as { displayName?: string }).displayName ?? '').startsWith('Lazy(')) {
    collect((t as (p: unknown) => ReactNode)(e.props), pick, out)
  } else {
    collect(e.props.children, pick, out)
  }
  return out
}

/**
 * A module graph of its own, in which every lazy view is still unloaded. A lazy view keeps what it loaded for the life of its
 * module, so a test that needs the state before the chunk cannot share a graph with a test that preloads it. The game data
 * (models, states) is plain data and crosses the graphs freely; the flags are the fresh graph's own.
 */
async function fresh() {
  vi.resetModules()
  const flags = await import('../src/game/flags')
  const bodyModule = await import('../src/ui/nav/CockpitBody')
  const panelModule = await import('../src/ui/nav/CockpitPanel')
  const gate = await import('../src/ui/charts/lazy')
  return {
    setFlags: flags.setFlags,
    body: (m: CockpitModel, jump: JumpLink[] = []): string => render(createElement(bodyModule.CockpitBody, { model: m, jump, onOpen: () => {} })),
    panel: (g: GameState, tab: CockpitTab = 'assets'): string => render(createElement(panelModule.CockpitPanel, { tab, g, onOpen: () => {} })),
    ready: async (): Promise<void> => {
      await Promise.all([gate.LazyKpiTile.preload(), gate.LazySparkline.preload(), gate.ChartViewLazy.preload()])
    },
  }
}

describe('9. CockpitBody markup', () => {
  it('shows each tile as text before the kit is loaded, with no chart frame', async () => {
    const f = await fresh()
    const html = f.body(model())
    for (const t of model().tiles) {
      expect(html).toContain(`>${t.label}<`)
      expect(html).toContain(`>${t.value}<`)
    }
    expect(html).not.toContain('ch-frame')
    expect(html).not.toContain('ch-spark')
    expect(html.match(/class="ch-kpi[ "]/g) ?? []).toHaveLength(3)
  })

  it('shows one real tile for each model tile once the kit is loaded', async () => {
    const f = await fresh()
    await f.ready()
    const html = f.body(model())
    expect(html.match(/class="ch-kpi[ "]/g) ?? []).toHaveLength(3)
    expect(html).not.toContain('cockpit-kpi-fallback')
    expect(html).toContain('class="ch-kpi-value">$1.2M<')
    // The Net worth tile has a trend and the pressed tile is a button.
    expect(html).toContain('ch-spark')
    expect(html).toMatch(/<button[^>]*class="ch-kpi ch-kpi-press"/)
  })

  it('draws a card for each company with its sparkline, health word, net and runway', async () => {
    const f = await fresh()
    await f.ready()
    const html = f.body(model())
    expect(html.match(/class="cockpit-card[ "]/g) ?? []).toHaveLength(2)
    expect(html).toContain('Harbor Grill')
    expect(html).toContain('Pixel Forge')
    expect(html).toContain('Thriving')
    expect(html).toContain('In danger')
    expect(html).toContain('aria-label="Sales, last 3 years: first $100K, last $150K, low $100K, high $150K"')
    expect(html).toContain('Profit $24K')
    expect(html).toContain('Loss $90K')
    expect(html).toContain('Runway 1.5 years')
    expect(html).not.toMatch(BAD)
  })

  it('shows the card text before the kit is loaded, with no sparkline yet', async () => {
    const f = await fresh()
    const html = f.body(model())
    expect(html).toContain('Harbor Grill')
    expect(html).toContain('Profit $24K')
    expect(html).not.toContain('<svg class="ch-spark')
  })

  it('has the +N more button only when there are more companies, and it opens the Businesses group', () => {
    expect(body(model({ moreCards: 0 }))).not.toContain('more</button>')
    const html = body(model({ moreCards: 3 }))
    expect(html).toContain('+3 more')
    expect(html).toContain('aria-label="Show 3 more companies"')
    const opened: string[][] = []
    const tree = CockpitBody({ model: model({ moreCards: 3 }), jump: [], onOpen: (p) => opened.push(p) }) as ReactElement
    const more = collect(tree, (e) => e.type === 'button' && e.props.className === 'cockpit-more')
    expect(more).toHaveLength(1)
    ;(more[0]!.props.onClick as () => void)()
    expect(opened).toEqual([['businesses']])
  })

  it('shows the jump strip with at most 4 links, and none when there are no links', () => {
    expect(body(model())).not.toContain('cockpit-jump')
    const six = [1, 2, 3, 4, 5, 6].map(link)
    const html = body(model(), six)
    expect(html).toContain('cockpit-jump')
    expect(html.match(/class="cockpit-jump-link"/g) ?? []).toHaveLength(4)
    expect(html).toContain('Group 1')
    expect(html).not.toContain('Group 5')
    const strip = render(createElement(JumpStrip, { links: six, onOpen: () => {} }))
    expect(strip.match(/class="cockpit-jump-link"/g) ?? []).toHaveLength(4)
    expect(render(createElement(JumpStrip, { links: [], onOpen: () => {} }))).toBe('')
  })

  it('leaves out the chart when the model has none and draws its frame when it has one', async () => {
    const g = withRows(navState('adult'), [10_000, 30_000, 90_000], 32)
    const spec = cockpitOf('assets', g).chart!
    expect(spec).not.toBeNull()
    const f = await fresh()
    expect(f.body(model({ chart: null }))).not.toContain('cockpit-chart')
    const before = f.body(model({ chart: spec }))
    expect(before).toContain('cockpit-chart')
    expect(before).toContain(spec.summary)
    expect(before).not.toContain('ch-frame')
    await f.ready()
    const after = f.body(model({ chart: spec }))
    expect(after).toContain('<figure class="ch-frame"')
    expect(after).not.toContain('cockpit-chart-fallback')
  })

  it('shows the summary line when there are no tiles, and a meter for a tile that has one', () => {
    const thin = body(model({ tab: 'activities', tiles: [], cards: [], summary: 'Age 35 and 2026' }))
    expect(thin).toContain('Age 35 and 2026')
    expect(thin).not.toContain('ch-kpi')
    const meter = body(model({ tiles: [{ id: 'performance', label: 'Performance', value: '72%', tone: 'good', meter: 72 }], cards: [] }))
    expect(meter).toMatch(/role="meter"[^>]*aria-valuenow="72"/)
    expect(meter).toContain('aria-valuemin="0"')
    expect(meter).toContain('aria-valuemax="100"')
    expect(body(model({ tiles: [{ id: 'cash', label: 'Cash', value: '$1', tone: 'c3' }], cards: [] }))).not.toContain('role="meter"')
  })

  it('escapes the words it is given', () => {
    const html = body(model({ cards: [card({ name: '<b>Hot</b> & Co' })] }))
    expect(html).toContain('&lt;b&gt;Hot&lt;/b&gt; &amp; Co')
    expect(html).not.toContain('<b>Hot')
  })
})

describe('10. CockpitPanel', () => {
  const ceoWithRows = (): GameState => withRows(navState('ceo'), [10_000, 50_000, 200_000], 41)
  const panel = (g: GameState, tab: CockpitTab = 'assets'): string => render(createElement(CockpitPanel, { tab, g, onOpen: () => {} }))

  it('renders nothing with the flag off', () => {
    expect(CockpitPanel({ tab: 'assets', g: ceoWithRows(), onOpen: () => {} })).toBeNull()
    expect(panel(ceoWithRows())).toBe('')
  })

  it('shows each tile as text before the kit is loaded, and the real tiles after', async () => {
    const f = await fresh()
    f.setFlags({ ...NAV_OFF, cockpits: true })
    const g = ceoWithRows()
    const m = cockpitOf('assets', g)
    expect(m.chart).not.toBeNull()
    const before = f.panel(g)
    for (const t of m.tiles) {
      expect(before).toContain(t.label)
      expect(before).toContain(t.value)
    }
    expect(before).not.toContain('ch-frame')
    expect(before).not.toContain('<svg class="ch-spark')
    expect(before).toContain(m.chart!.summary)

    await f.ready()
    const after = f.panel(g)
    expect(after.match(/class="ch-kpi[ "]/g) ?? []).toHaveLength(3)
    expect(after).toContain('<svg class="ch-spark')
    expect(after).toContain('<figure class="ch-frame"')
    for (const c of m.cards) expect(after).toContain(c.name)
  })

  it('shows the occupation tiles and the thin cockpits', async () => {
    const f = await fresh()
    f.setFlags({ ...NAV_OFF, cockpits: true })
    await f.ready()
    const adult = navState('adult')
    const html = f.panel(adult, 'occupation')
    expect(html).toContain('Performance')
    expect(html).toContain('role="meter"')
    const thin = f.panel(adult, 'activities')
    expect(thin).toContain(cockpitOf('activities', adult).summary)
    expect(thin).not.toContain('ch-kpi')
  })

  it('shows the pinned and recent places of this tab from the live prefs', () => {
    setFlags({ ...NAV_OFF, cockpits: true })
    const g = navState('adult')
    resetPrefsForTest()
    expect(panel(g)).not.toContain('cockpit-jump')
    updatePrefs((p) => pushRecent(p, g.lifeId, { tab: 'assets', path: ['banking'] }))
    updatePrefs((p) => pushRecent(p, g.lifeId, { tab: 'activities', path: ['computer'] }))
    const html = panel(g)
    expect(html).toContain('cockpit-jump')
    expect(html).toContain('Banking')
    expect(html.match(/class="cockpit-jump-link"/g) ?? []).toHaveLength(1)
    expect(panel(g, 'activities')).toContain('Computer')
    resetPrefsForTest()
  })
})

describe('11. the sheets', () => {
  const order = (html: string, a: string, b: string): boolean => html.indexOf(a) >= 0 && html.indexOf(b) >= 0 && html.indexOf(a) < html.indexOf(b)

  function inDanger(): void {
    install(navState('ceo'))
    store.act((g) => {
      const a = businessAssets(g)[0]!
      bizOf(g, a).cash = -50_000
    })
  }

  it('puts the cockpit above the Needs you card and the rows at the root of Assets', () => {
    inDanger()
    setFlags({ ...NAV_OFF, cockpits: true, navRegroup: true })
    const html = render(createElement(MenuSheet, { root: assetsMenu, onClose: () => {} }))
    expect(html).toContain('cockpit-panel')
    expect(html).toContain('needs-card')
    expect(html).toContain('In danger')
    expect(order(html, 'cockpit-panel', 'needs-card')).toBe(true)
    expect(order(html, 'cockpit-panel', 'menu-row')).toBe(true)
    // After the header box, before the card.
    expect(order(html, 'menu-header', 'cockpit-panel')).toBe(true)
    expect(html).toContain('Net worth')
    expect(html).toContain('Harbor Grill')
  })

  it('adds neither the cockpit nor the card below the root', () => {
    inDanger()
    setFlags({ ...NAV_OFF, cockpits: true, navRegroup: true })
    const html = render(createElement(MenuSheet, { root: assetsMenu, onClose: () => {}, initial: { path: ['businesses'], scrolls: [0, 0] } }))
    expect(html).not.toContain('cockpit-panel')
    expect(html).not.toContain('needs-card')
    expect(html).toContain('menu-row')
  })

  it('adds nothing with the flag off', () => {
    inDanger()
    const html = render(createElement(MenuSheet, { root: assetsMenu, onClose: () => {} }))
    expect(html).not.toContain('cockpit')
  })

  it('has a cockpit at the root of Occupation and Activities too', async () => {
    install(navState('adult'))
    setFlags({ ...NAV_OFF, cockpits: true })
    const { occupationMenu, activitiesMenu } = await import('../src/game/menus')
    const occ = render(createElement(MenuSheet, { root: occupationMenu, onClose: () => {} }))
    expect(occ).toContain('cockpit-panel')
    expect(occ).toContain('Performance')
    expect(order(occ, 'cockpit-panel', 'menu-row')).toBe(true)
    const act = render(createElement(MenuSheet, { root: activitiesMenu, onClose: () => {} }))
    expect(act).toContain('cockpit-panel')
    expect(act).toContain(cockpitOf('activities', store.getApp().game as GameState).summary)
  })

  it('puts the cockpit and the Needs you card on the Relationships list', () => {
    install(navState('adult'))
    store.act((g) => {
      const parent = g.people.find((p) => p.alive && p.relation === 'parent')!
      parent.relationship = 5
    })
    const g = store.getApp().game as GameState
    const rows = needsYou(peopleMenu.children(g), g)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0]!.node.id).toBe(personGroupId(g.people.find((p) => p.alive && p.relation === 'parent')!.id))

    setFlags({ ...NAV_OFF, cockpits: true })
    const html = render(createElement(RelationshipsSheet, { onClose: () => {} }))
    expect(html).toContain('cockpit-panel')
    expect(html).toContain('needs-card')
    expect(html).toContain('Drifting')
    expect(order(html, 'cockpit-panel', 'needs-card')).toBe(true)
    expect(order(html, 'needs-card', 'rel-row')).toBe(true)

    setFlags(NAV_OFF)
    const off = render(createElement(RelationshipsSheet, { onClose: () => {} }))
    expect(off).not.toContain('cockpit')
    expect(off).not.toContain('needs-card')
  })
})

describe('12. jumpLinks', () => {
  const pin = (p: UiPrefs, g: GameState, tab: 'assets' | 'occupation' | 'relationships' | 'activities', path: string[]): UiPrefs => togglePin(p, g.lifeId, { tab, path }).prefs
  const recent = (p: UiPrefs, g: GameState, tab: 'assets' | 'occupation' | 'relationships' | 'activities', path: string[], id?: string): UiPrefs =>
    pushRecent(p, g.lifeId, id === undefined ? { tab, path } : { tab, path, id })
  const paths = (links: JumpLink[]): string[] => links.map((l) => l.place.path.join('/'))

  it('lists the pins and then the recents of the tab, newest recent first', () => {
    const g = frozen('adult')
    let prefs = pin(emptyPrefs(), g, 'assets', ['businesses'])
    prefs = recent(prefs, g, 'assets', ['banking'])
    prefs = recent(prefs, g, 'assets', ['realEstate'])
    const links = jumpLinks(g, prefs, 'assets')
    expect(paths(links)[0]).toBe('businesses')
    expect(links.every((l) => l.label !== '' && l.emoji !== '' && l.crumbs.length >= 2 && l.key !== '')).toBe(true)
    expect(links[0]!.crumbs[0]).toBe('Assets')
    expect(links[0]!.label).toBe('Businesses')
    expect(paths(links)).toContain('banking')
    expect(links.map((l) => l.key)).toHaveLength(new Set(links.map((l) => l.key)).size)
  })

  it('puts the company in the label of a tile, so two companies are not both "Money"', () => {
    setFlags({ ...NAV_OFF, cockpits: true, navRegroup: true, navPalette: true })
    const g = frozen('ceo')
    const a = businessAssets(g)[0]!
    const ids = hubIds(a.id)
    let p = recent(emptyPrefs(), g, 'assets', [`asset-${a.id}`, ids.money])
    p = recent(p, g, 'assets', [`asset-${a.id}`, ids.run])
    const links = jumpLinks(g, p, 'assets')
    expect(links.map((l) => l.label)).toEqual([`${a.name} · Run`, `${a.name} · Money`])
    // The tooltip still carries the whole trail.
    expect(links[1]!.crumbs).toEqual(['Assets', a.name, 'Money'])
    const html = render(createElement(JumpStrip, { links, onOpen: () => {} }))
    expect(html).toContain(`${a.name} · Money`)
  })

  it('leaves out the places of other tabs and of other lives', () => {
    const g = frozen('adult')
    let p = recent(emptyPrefs(), g, 'activities', ['computer'])
    p = recent(p, g, 'assets', ['banking'])
    p = pushRecent(p, 'another-life', { tab: 'assets', path: ['businesses'] })
    expect(paths(jumpLinks(g, p, 'assets'))).toEqual(['banking'])
    expect(paths(jumpLinks(g, p, 'activities'))).toEqual(['computer'])
    expect(jumpLinks(g, p, 'occupation')).toEqual([])
  })

  it('drops a place that has vanished, even when only its tail is gone', () => {
    const g = frozen('adult')
    let p = recent(emptyPrefs(), g, 'assets', ['gone-group'])
    p = recent(p, g, 'assets', ['businesses', 'no-such-company'])
    p = recent(p, g, 'assets', ['banking'])
    expect(paths(jumpLinks(g, p, 'assets'))).toEqual(['banking'])
  })

  it('opens the group of a recent action, and shows a group once', () => {
    const g = frozen('adult')
    let p = pin(emptyPrefs(), g, 'assets', ['banking'])
    p = recent(p, g, 'assets', ['banking'], 'some-action')
    p = recent(p, g, 'assets', ['banking'])
    const links = jumpLinks(g, p, 'assets')
    expect(paths(links)).toEqual(['banking'])
  })

  it('keeps at most 4, and takes the cap from the caller', () => {
    const g = frozen('adult')
    let p = emptyPrefs()
    for (const id of ['businesses', 'investments', 'banking', 'realEstate', 'rentals', 'carDealers']) p = recent(p, g, 'assets', [id])
    const all = jumpLinks(g, p, 'assets', 99)
    expect(all.length).toBeGreaterThan(4)
    expect(jumpLinks(g, p, 'assets')).toHaveLength(4)
    expect(jumpLinks(g, p, 'assets', 2)).toHaveLength(2)
    expect(jumpLinks(g, p, 'assets', 0)).toEqual([])
  })

  it('opens a person on Relationships, and drops one who has left', () => {
    const g = frozen('adult')
    const living = g.people.find((p) => p.alive)!
    let p = pin(emptyPrefs(), g, 'relationships', [personGroupId(living.id)])
    p = pin(p, g, 'relationships', [personGroupId('nobody-by-that-id')])
    const links = jumpLinks(g, p, 'relationships')
    expect(links).toHaveLength(1)
    expect(links[0]!.place.path).toEqual([personGroupId(living.id)])
    expect(links[0]!.crumbs[0]).toBe('Relationships')
  })

  it('does not change the state or the prefs it is given', () => {
    const g = frozen('adult')
    const p = recent(emptyPrefs(), g, 'assets', ['banking'])
    const before = JSON.stringify(p)
    jumpLinks(g, p, 'assets')
    expect(JSON.stringify(p)).toBe(before)
  })

  it('never reaches the search index', () => {
    const files = ['src/ui/nav/CockpitBody.tsx', 'src/ui/nav/JumpStrip.tsx', 'src/ui/nav/CockpitPanel.tsx', 'src/ui/nav/kit.ts']
    const hubs = readdirSync(`${ROOT}src/game/hubs`).map((f) => `src/game/hubs/${f}`)
    for (const f of [...files, ...hubs]) {
      const text = readFileSync(`${ROOT}${f}`, 'utf8')
      expect(text, f).not.toMatch(/from\s+['"][^'"]*searchIndex['"]/)
      expect(text, f).not.toMatch(/useSearchIndex|searchRank|paletteModel/)
    }
  })
})

describe('13. the tap contract', () => {
  it('opens the asset of a card from its button', () => {
    const opened: string[][] = []
    const tree = CockpitBody({ model: model(), jump: [], onOpen: (p) => opened.push(p) }) as ReactElement
    const cards = collect(tree, (e) => e.type === 'button' && String(e.props.className ?? '').startsWith('cockpit-card'))
    expect(cards).toHaveLength(2)
    for (const c of cards) (c.props.onClick as () => void)()
    expect(opened).toEqual([['asset-biz-1'], ['asset-biz-2']])
  })

  it('opens the screen of a tile from its press handler, and only for a tile that has one', () => {
    const opened: string[][] = []
    const tree = CockpitBody({ model: model(), jump: [], onOpen: (p) => opened.push(p) }) as ReactElement
    const tiles = collect(tree, (e) => e.type === LazyKpiTile)
    expect(tiles.map((t) => t.props.label)).toEqual(['Net worth', 'Cash', 'Debt'])
    expect(tiles.map((t) => typeof t.props.onPress)).toEqual(['undefined', 'undefined', 'function'])
    ;(tiles[2]!.props.onPress as () => void)()
    expect(opened).toEqual([['banking']])
  })

  it('opens the place of a jump link', () => {
    const opened: string[][] = []
    const tree = JumpStrip({ links: [link(1), link(2)], onOpen: (p) => opened.push(p) }) as ReactElement
    const buttons = collect(tree, (e) => e.type === 'button')
    expect(buttons).toHaveLength(2)
    ;(buttons[1]!.props.onClick as () => void)()
    expect(opened).toEqual([['g2']])
  })

  it('passes the sparkline and the chart through the lazy views only', () => {
    const tree = CockpitBody({ model: model(), jump: [], onOpen: () => {} }) as ReactElement
    const spark = collect(tree, (e) => e.type === LazySparkline)
    expect(spark).toHaveLength(2)
    expect(spark[0]!.props.label).toBe('Sales, last 3 years')
    expect(spark[0]!.props.fallback).toBeNull()
    expect(collect(tree, (e) => e.type === LazyChartView)).toHaveLength(0)
  })
})

describe('the files', () => {
  const NEW = [
    'src/game/hubs/wealth.ts',
    'src/game/hubs/cockpit.ts',
    'src/game/hubs/series-adapter.ts',
    'src/ui/nav/kit.ts',
    'src/ui/nav/CockpitPanel.tsx',
    'src/ui/nav/CockpitBody.tsx',
    'src/ui/nav/JumpStrip.tsx',
  ]
  const read = (f: string): string => readFileSync(`${ROOT}${f}`, 'utf8')

  it('exist', () => {
    for (const f of NEW) expect(existsSync(`${ROOT}${f}`), f).toBe(true)
  })

  it('hold no dash, no dice, no clock and no money movement', () => {
    for (const f of NEW) {
      const text = read(f)
      expect(text, f).not.toMatch(DASH)
      expect(text, f).not.toMatch(/Math\.random|Date\.now|new Date|\.rng\b|\brand\(|randInt\(/)
      expect(text, f).not.toMatch(/earnIncome\(|\bspend\(|addMoney\(|\.cash\s*\+=|\.money\s*\+=/)
    }
  })

  it('use no React.lazy and no Suspense', () => {
    for (const f of NEW) expect(read(f), f).not.toMatch(/React\.lazy|\blazy\(|Suspense/)
  })

  it('keep the chart kit behind kit.ts, which re-exports only the three lazy views', async () => {
    const kit = await import('../src/ui/nav/kit')
    expect(Object.keys(kit).sort()).toEqual(['LazyChartView', 'LazyKpiTile', 'LazySparkline'])
    expect(read('src/ui/nav/kit.ts')).toMatch(/from\s+'\.\.\/charts\/lazy'/)
    for (const f of ['src/ui/nav/CockpitPanel.tsx', 'src/ui/nav/CockpitBody.tsx', 'src/ui/nav/JumpStrip.tsx']) {
      expect(read(f), f).not.toMatch(/from\s+'\.\.\/charts/)
    }
  })

  it('re-export the series from the Charts track in two lines', () => {
    const text = read('src/game/hubs/series-adapter.ts')
    expect(text).toMatch(/export\s*\{\s*lifeRows as lifeRowsOf\s*\}\s*from\s*'\.\.\/life-series'/)
    expect(text).toMatch(/export\s*\{\s*netWorthSpec as netWorthChart\s*\}\s*from\s*'\.\.\/charts\/networth'/)
  })

  it('are not imported by the game layer from the UI', () => {
    for (const f of ['src/game/hubs/wealth.ts', 'src/game/hubs/cockpit.ts', 'src/game/hubs/series-adapter.ts']) {
      expect(read(f), f).not.toMatch(/from\s+'[./]*\/ui\//)
      expect(read(f), f).not.toMatch(/from\s+'[^']*\/(menus|manage|business|careers|assets)'/)
    }
  })
})
