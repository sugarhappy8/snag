// R1-C3 (S1): the company books. A YearRecord grows 14 optional dollar fields, a player company keeps 30 rows
// instead of 10, the simulation keeps reading ten (simHistory), and a damaged row can never break a load.
// Also holds the unit test of test/r1-strip.ts (stripR1), the helper the "no simulation output change" probe uses.
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { installManager, managerCandidate } from '../src/game/business/career'
import { formGroup } from '../src/game/business/conglomerate-actions'
import { groupsOf } from '../src/game/business/conglomerate-state'
import { techOf } from '../src/game/business/deeptech-core'
import { recordYear } from '../src/game/business/economy'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { prepareInternalServices, settleInternalServices, toggleService } from '../src/game/business/group-services'
import { MILESTONES } from '../src/game/business/milestones'
import {
  BOOK_KEYS,
  bizOf,
  businessAssets,
  HISTORY_ROWS,
  LINE_KEYS,
  normalizeBiz,
  readBiz,
  SIM_HISTORY,
  simHistory,
  syncBookRow,
  type BizState,
  type Statement,
  type YearRecord,
} from '../src/game/business/state'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import { initializeNpc, npcCompany, startNpcCompany, yearlyNpcLife } from '../src/game/npc-lives'
import { yearlyEconomy } from '../src/game/economy'
import { createPerson } from '../src/game/people'
import { migrateSave } from '../src/game/save-schema'
import type { GameState, Json } from '../src/game/types'
import { deepFreeze, ownerGame, statementSamples } from './charts-kit'
import { makeTestGame } from './helpers'
import { adult, company } from './market-kit'
import { stripR1 } from './r1-strip'

const OLD_KEYS = ['year', 'revenue', 'profit', 'tax', 'units', 'price', 'staff', 'valuation', 'outlets']

/** One company and its first statement (a restaurant: the first industry in the list that has a statement). */
function sample(): { b: BizState; s: Statement; g: GameState } {
  const x = statementSamples([1]).find((y) => y.industry === 'restaurant')!
  const b = structuredClone(x.b)
  b.history = []
  return { b, s: { ...x.s }, g: x.g }
}

describe('recordYear (S1 writer)', () => {
  it('writes the 14 book fields, defaulting draws to 0, and rounds a cash balance to whole dollars', () => {
    const { b, s } = sample()
    b.cash = 12_345.6
    b.debt = 99.4
    const r = recordYear(b, s)
    expect(r).toBe(b.history[b.history.length - 1])
    for (const k of BOOK_KEYS) expect(Number.isInteger(r[k]), k).toBe(true)
    expect(r.cash).toBe(12_346)
    expect(r.debt).toBe(99)
    expect(r.draws).toBe(0)
    expect(r.cogs).toBe(Math.round(s.cogs))
    expect(r.ownerPay).toBe(Math.round(s.ownerPay))
    expect(r.otherIncome).toBe(Math.round(s.otherIncome))
  })

  it('a non-finite input writes 0, and a huge one is held at 1e15', () => {
    const { b, s } = sample()
    b.cash = Number.NaN
    b.debt = Number.POSITIVE_INFINITY
    const r = recordYear(b, { ...s, wages: 1e300, rent: -1e300, upkeep: Number.NaN })
    expect(r.cash).toBe(0)
    expect(r.debt).toBe(0)
    expect(r.wages).toBe(1e15)
    expect(r.rent).toBe(-1e15)
    expect(r.upkeep).toBe(0)
  })

  it('1: twice for one year leaves one row and the second call wins', () => {
    const { b, s } = sample()
    recordYear(b, s)
    recordYear(b, { ...s, revenue: s.revenue + 1000, cogs: s.cogs + 77 })
    expect(b.history).toHaveLength(1)
    expect(b.history[0]!.revenue).toBe(s.revenue + 1000)
    expect(b.history[0]!.cogs).toBe(Math.round(s.cogs + 77))
  })

  it('2: 31 years leave 30 rows and the oldest year is dropped', () => {
    const { b, s } = sample()
    for (let i = 0; i < 31; i++) recordYear(b, { ...s, year: 2000 + i })
    expect(HISTORY_ROWS).toBe(30)
    expect(b.history).toHaveLength(30)
    expect(b.history[0]!.year).toBe(2001)
    expect(b.history[29]!.year).toBe(2030)
  })

  it('5: lean writes the nine old fields only and caps at ten rows', () => {
    const { b, s } = sample()
    for (let i = 0; i < 12; i++) recordYear(b, { ...s, year: 2000 + i }, { lean: true })
    expect(SIM_HISTORY).toBe(10)
    expect(b.history).toHaveLength(10)
    for (const r of b.history) expect(Object.keys(r).sort()).toEqual([...OLD_KEYS].sort())
    expect(b.history[0]!.year).toBe(2002)
  })

  it('3: the 14 fields are whole numbers and rebuild the statement within six dollars, for every industry', () => {
    const samples = statementSamples([1])
    expect(samples.length).toBe(56)
    for (const x of samples) {
      const r = x.b.history[x.b.history.length - 1]!
      for (const k of BOOK_KEYS) expect(Number.isInteger(r[k]), `${x.industry} ${k}`).toBe(true)
      const rebuilt = r.revenue - r.salesTax! - r.cogs! - r.wages! - r.keyStaff! - r.rent! - r.marketing! - r.interest! - r.upkeep! - r.other! + r.otherIncome! - r.ownerPay! - r.tax
      expect(Math.abs(rebuilt - r.profit), `${x.industry} rebuilt ${rebuilt} profit ${r.profit}`).toBeLessThanOrEqual(6)
    }
  })

  it('simHistory is the last ten rows of whatever the company holds', () => {
    const { b, s } = sample()
    for (let i = 0; i < 15; i++) recordYear(b, { ...s, year: 2000 + i })
    expect(simHistory(b).map((r) => r.year)).toEqual([2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014])
    expect(simHistory({ history: [] })).toEqual([])
  })
})

describe('yearly.ts hands recordYear the owner draws', () => {
  it('4: a bonus taken in the year is recorded as draws and is inside other (a memo, not a second cost)', () => {
    const { g, b } = ownerGame({ years: 2 })
    g.queue = []
    b.ownerDraws = 50_000
    b.yearCosts += 50_000
    ageUp(g)
    const last = b.history[b.history.length - 1]!
    expect(last.draws).toBe(50_000)
    expect(last.other).toBeGreaterThanOrEqual(50_000)
    expect(b.ownerDraws).toBeUndefined()
  })

  it('a year with no bonus records draws 0', () => {
    const { b } = ownerGame({ years: 2 })
    expect(b.history[b.history.length - 1]!.draws).toBe(0)
  })
})

/** A booked year whose lines add up, as simulateYear builds one: net revenue, pbt and net follow from the lines. */
function booked(year: number, over: Partial<Statement> = {}): Statement {
  const s: Statement = {
    year, demand: 1000, sold: 1000, produced: 1000, spoiled: 0, price: 10, revenue: 1_100_000, salesTax: 100_000, netRevenue: 0,
    cogs: 300_000, wages: 200_000, keyStaff: 0, rent: 50_000, marketing: 150_000, interest: 0, upkeep: 20_000, other: 10_000,
    otherIncome: 0, ownerPay: 0, pbt: 0, corpTax: 60_000, net: 0, cashErosion: 0, cycle: 0, openFraction: 1, employees: 12, ...over,
  }
  s.netRevenue = s.revenue - s.salesTax
  s.pbt = s.netRevenue - s.cogs - s.wages - s.keyStaff - s.rent - s.marketing - s.interest - s.upkeep - s.other + s.otherIncome - s.ownerPay
  s.net = s.pbt - s.corpTax
  return s
}

/** Close a year the way yearlyBusinessImpl does: the statement becomes b.last and the row is recorded from it. */
function closeYear(b: BizState, s: Statement): void {
  b.last = s
  recordYear(b, s)
}

function rowOf(b: BizState, year: number): YearRecord {
  return b.history.find((h) => h.year === year)!
}

/** The row's own lines against its own profit: zero for a row that still rebuilds its statement. */
function gap(r: YearRecord): number {
  const rebuilt = r.revenue - r.salesTax! - r.cogs! - r.wages! - r.keyStaff! - r.rent! - r.marketing! - r.interest! - r.upkeep! - r.other! + r.otherIncome! - r.ownerPay! - r.tax
  return Math.abs(rebuilt - r.profit)
}

/** A row and the live books it came from must agree on the year's lines, the sales, the profit and the tax. */
function expectRowMatches(b: BizState, label: string): void {
  const s = b.last!
  const r = rowOf(b, s.year)
  expect(r.revenue, `${label} revenue`).toBe(s.revenue)
  expect(r.profit, `${label} profit`).toBe(s.net)
  expect(r.tax, `${label} tax`).toBe(s.corpTax)
  for (const k of LINE_KEYS) expect(r[k], `${label} ${k}`).toBe(Math.round(s[k]))
  expect(gap(r), `${label} rebuilt profit`).toBeLessThanOrEqual(6)
}

describe('group contracts amend a booked year, and the row follows (review fix)', () => {
  it.each(['marketing', 'logistics', 'software', 'realEstate', 'investmentFirm'] as const)(
    'a %s division serving a restaurant: both rows still rebuild their statement and cash tracks the books',
    (industry) => {
      const g = adult(7, 2028, 'us')
      const p = company(g, industry, { name: 'Provider' })
      const q = company(g, 'restaurant', { name: 'Customer' })
      for (const a of [p, q]) closeYear(bizOf(g, a), booked(2026))
      expect(formGroup(g, [p.id, q.id], 'Test Group')).toBe(true)
      const id = groupsOf(g)[0]!.core.id
      expect(toggleService(g, id, p.id, q.id)).toBe(true)
      const was = { p: { ...rowOf(bizOf(g, p), 2026) }, q: { ...rowOf(bizOf(g, q), 2026) } }
      const cashWas = { p: bizOf(g, p).cash, q: bizOf(g, q).cash }
      for (const b of [bizOf(g, p), bizOf(g, q)]) expectRowMatches(b, 'before')

      settleInternalServices(g, 2026)

      // The invoice really was booked, so the checks below are not vacuous: the provider's sales rose, the buyer's profit rose.
      const results = g.flags.groupServiceResults as unknown as Record<string, unknown>[]
      expect(results).toHaveLength(1)
      expect(bizOf(g, p).last!.revenue).toBeGreaterThan(was.p.revenue)
      expect(bizOf(g, q).last!.net).toBeGreaterThan(was.q.profit)
      for (const [label, a, before, cash] of [['provider', p, was.p, cashWas.p], ['customer', q, was.q, cashWas.q]] as const) {
        const b = bizOf(g, a)
        expectRowMatches(b, label)
        // The row's cash moves by what the invoice did to the company's cash (to the dollar the row rounds); debt and the memo don't move.
        expect(Math.abs(rowOf(b, 2026).cash! - before.cash! - (b.cash - cash)), `${label} cash`).toBeLessThanOrEqual(1)
        expect(rowOf(b, 2026).debt).toBe(before.debt)
        expect(rowOf(b, 2026).draws).toBe(before.draws)
        expect(rowOf(b, 2026).valuation).toBe(before.valuation)
      }
      expect(rowOf(bizOf(g, q), 2026).cash).toBeGreaterThan(was.q.cash!)
    },
  )

  it.each(['software', 'investmentFirm'] as const)('through a real yearly pass: a %s division\'s invoice lands in the stored rows of both companies', (industry) => {
    const g = adult(7, 2030, 'us')
    const make = (id: typeof industry | 'restaurant', name: string) => {
      const a = createBusinessAsset(g, name, newBiz(g, id, 'us', g.character.city, { cash: 10_000_000, founded: g.year - 6 }), 100_000)
      g.assets.push(a)
      installManager(g, bizOf(g, a), managerCandidate(g, bizOf(g, a), 70))
      return a
    }
    const p = make(industry, 'Provider')
    const q = make('restaurant', 'Customer')
    yearlyBusinessImpl(g) // books the first year of both
    g.queue = []
    expect(formGroup(g, [p.id, q.id], 'Test Group')).toBe(true)
    expect(toggleService(g, groupsOf(g)[0]!.core.id, p.id, q.id)).toBe(true)
    g.year += 1
    yearlyBusinessImpl(g) // books the second year, and the group settles its invoice after both companies have booked

    const results = g.flags.groupServiceResults as unknown as Record<string, unknown>[]
    expect(results).toHaveLength(1)
    expect(results[0]!.invoice).toBeGreaterThan(0)
    for (const [label, a] of [['provider', p], ['customer', q]] as const) {
      const b = bizOf(g, a)
      expect(b.history.map((h) => h.year)).toEqual([2029, 2030])
      expectRowMatches(b, label)
      expect(rowOf(b, 2029).cogs, `${label} the year before is untouched`).toBeDefined()
    }
  })

  it('a chip invoice keeps the sister\'s row in step too', () => {
    const g = adult(7, 2028, 'us')
    const sister = company(g, 'semiconductor', { name: 'Acme Silicon' })
    const buyer = company(g, 'devices', { name: 'Acme Phones' })
    const t = techOf(bizOf(g, sister))
    t.stage = 3
    t.node = 5
    t.yieldRate = 0.8
    const year = (n: number): Statement => booked(n, { revenue: 100e6, salesTax: 0, cogs: 70e6, wages: 10e6, rent: 1e6, marketing: 1e6, upkeep: 1e6, other: 1e6, corpTax: 3e6 })
    for (const a of [sister, buyer]) closeYear(bizOf(g, a), year(2026))
    expect(formGroup(g, [sister.id, buyer.id], 'Chip Group')).toBe(true)
    const id = groupsOf(g)[0]!.core.id
    expect(toggleService(g, id, sister.id, buyer.id)).toBe(true)
    prepareInternalServices(g, 2027)
    for (const a of [sister, buyer]) closeYear(bizOf(g, a), year(2027))
    const cogsBefore = rowOf(bizOf(g, sister), 2027).cogs!
    const was = { sister: { cash: rowOf(bizOf(g, sister), 2027).cash!, books: bizOf(g, sister).cash }, buyer: { cash: rowOf(bizOf(g, buyer), 2027).cash!, books: bizOf(g, buyer).cash } }

    settleInternalServices(g, 2027)

    const results = g.flags.groupServiceResults as unknown as Record<string, unknown>[]
    expect(results.filter((r) => r.chips === true)).toHaveLength(1)
    expect(rowOf(bizOf(g, sister), 2027).cogs).toBeGreaterThan(cogsBefore)
    for (const [label, a, before] of [['sister', sister, was.sister], ['buyer', buyer, was.buyer]] as const) {
      const b = bizOf(g, a)
      expectRowMatches(b, label)
      expect(Math.abs(rowOf(b, 2027).cash! - before.cash - (b.cash - before.books)), `${label} cash`).toBeLessThanOrEqual(1)
    }
  })

  it('moves cash by what the books moved, not to wherever the books are by then (a dividend paid after the close stays out)', () => {
    const g = adult(7, 2028, 'us')
    const p = company(g, 'marketing', { name: 'Provider' })
    const q = company(g, 'restaurant', { name: 'Customer' })
    for (const a of [p, q]) closeYear(bizOf(g, a), booked(2026))
    expect(formGroup(g, [p.id, q.id], 'Test Group')).toBe(true)
    expect(toggleService(g, groupsOf(g)[0]!.core.id, p.id, q.id)).toBe(true)
    const qb = bizOf(g, q)
    const closed = rowOf(qb, 2026).cash!
    const cashAtClose = qb.cash
    qb.cash -= 1_000_000 // something paid out between the close and the invoices
    settleInternalServices(g, 2026)
    const change = bizOf(g, q).cash - (cashAtClose - 1_000_000)
    expect(change).toBeGreaterThan(0)
    expect(Math.abs(rowOf(bizOf(g, q), 2026).cash! - Math.round(closed + change))).toBeLessThanOrEqual(1)
  })
})

describe('syncBookRow', () => {
  it('rewrites the 11 statement lines and moves cash by the change; the nine old fields, debt and draws stay', () => {
    const { b, s } = sample()
    b.cash = 1000
    b.debt = 40
    recordYear(b, s, { draws: 7 })
    const row = b.history[0]!
    const was: Record<string, unknown> = { ...row }
    const next = { ...s, cogs: s.cogs + 500, marketing: s.marketing - 200, ownerPay: 1234.6 }
    syncBookRow(row, next, 250.4)
    expect(row.cogs).toBe(Math.round(next.cogs))
    expect(row.marketing).toBe(Math.round(next.marketing))
    expect(row.ownerPay).toBe(1235)
    expect(row.cash).toBe(1250)
    for (const k of ['debt', 'draws', ...OLD_KEYS]) expect((row as unknown as Record<string, unknown>)[k], k).toBe(was[k])
    expect(Object.keys(row).sort()).toEqual(Object.keys(was).sort())
  })

  it('leaves a row that has no book keys alone: a lean NPC row, or one from before R1', () => {
    const { b, s } = sample()
    recordYear(b, s, { lean: true })
    const row = b.history[0]!
    syncBookRow(row, { ...s, cogs: s.cogs + 999 }, 500)
    expect(Object.keys(row).sort()).toEqual([...OLD_KEYS].sort())
  })

  it('a change that is not a finite number moves nothing, and a huge one is held at 1e15', () => {
    const { b, s } = sample()
    b.cash = 1000
    recordYear(b, s)
    const row = b.history[0]!
    syncBookRow(row, s, Number.NaN)
    expect(row.cash).toBe(1000)
    syncBookRow(row, { ...s, wages: Number.NaN, rent: 1e300 }, 1e300)
    expect(row.cash).toBe(1e15)
    expect(row.wages).toBe(0)
    expect(row.rent).toBe(1e15)
  })
})

describe('the reader (normalizeBiz)', () => {
  const row = (year: number, extra: Record<string, unknown> = {}) => ({ year, revenue: 1000, profit: 100, tax: 10, units: 5, price: 2, staff: 3, valuation: 5000, outlets: 1, ...extra })
  function withHistory(rows: unknown[]): YearRecord[] {
    const x = statementSamples([1]).find((y) => y.industry === 'restaurant')!
    const d = JSON.parse(JSON.stringify(x.a.details)) as Record<string, Json>
    d.history = rows as Json
    return normalizeBiz(d, x.g.year).history
  }

  it('6: hostile book fields clamp or vanish, and the nine old fields read as before', () => {
    const h = withHistory([
      row(2001, { cash: Number.NaN, debt: Number.POSITIVE_INFINITY, salesTax: 1e300, cogs: '5', wages: null, keyStaff: [1], rent: {}, marketing: 1234.6, interest: -1e300, upkeep: -7.4, other: -0.2, otherIncome: true, ownerPay: 80, draws: 5 }),
    ])
    expect(h).toHaveLength(1)
    const r = h[0]!
    expect(r.salesTax).toBe(1e15)
    expect(r.interest).toBe(-1e15)
    expect(r.marketing).toBe(1235)
    expect(r.upkeep).toBe(-7)
    expect(Object.is(r.other, 0)).toBe(true)
    expect(r.ownerPay).toBe(80)
    expect(r.draws).toBe(5)
    for (const k of ['cash', 'debt', 'cogs', 'wages', 'keyStaff', 'rent', 'otherIncome'] as const) expect(k in r, k).toBe(false)
    expect(r.revenue).toBe(1000)
    expect(r.outlets).toBe(1)
  })

  it('6: junk rows are skipped, 500 rows keep the newest 30, duplicate years keep the newest copy, negative years stay', () => {
    expect(withHistory(['x', null, [1, 2], 5, row(2001), { year: 'no' }])).toHaveLength(1)
    const many = withHistory(Array.from({ length: 500 }, (_, i) => row(i + 1)))
    expect(many).toHaveLength(30)
    expect(many[0]!.year).toBe(471)
    expect(many[29]!.year).toBe(500)
    const dup = withHistory([row(2001, { revenue: 1 }), row(2002), row(2001, { revenue: 2 })])
    expect(dup.map((r) => [r.year, r.revenue])).toEqual([[2002, 1000], [2001, 2]])
    expect(withHistory([row(-5)]).map((r) => r.year)).toEqual([-5])
  })

  it('7: the v4.0.2 fixture migrates and its companies read as old rows, with no book keys', () => {
    const raw = JSON.parse(gunzipSync(readFileSync('test/fixtures/save-v1.json.gz')).toString()) as Record<string, unknown>
    const result = migrateSave(structuredClone(raw))
    expect(result.kind).toBe('ready')
    if (result.kind !== 'ready') return
    const game = result.game
    const assets = businessAssets(game)
    expect(assets.length).toBeGreaterThan(0)
    for (const a of assets) {
      const b = readBiz(game, a)
      expect(b.history.length).toBeGreaterThan(0)
      for (const r of b.history) {
        expect(Object.keys(r).sort()).toEqual([...OLD_KEYS].sort())
        for (const k of BOOK_KEYS) expect(k in r).toBe(false)
      }
    }
    // Played on, the old rows stay as they were and the new years carry the book fields.
    const first = readBiz(game, assets[0]!).history.length
    for (let i = 0; i < 2; i++) {
      game.queue = []
      ageUp(game)
    }
    const after = readBiz(game, businessAssets(game)[0]!).history
    expect(after.length).toBeGreaterThanOrEqual(first)
    expect('cogs' in after[0]!).toBe(false)
  }, 60_000)
})

describe('milestones read the ten rows the simulation always saw', () => {
  const profit = MILESTONES.find((m) => m.id === 'profit')!
  const rev1m = MILESTONES.find((m) => m.id === 'rev1m')!

  function fifteenRows(): { g: GameState; b: BizState } {
    const { b, s, g } = sample()
    for (let i = 0; i < 15; i++) {
      const old = i < 5
      recordYear(b, { ...s, year: 2000 + i, revenue: old ? 5_000_000 : 0, net: old ? 900 : -900 })
    }
    b.last = { ...s, year: 2014, net: -900, revenue: 0 }
    return { g, b }
  }

  it('8: profit progress stays 0 when only the oldest five of fifteen rows were profitable', () => {
    const { g, b } = fifteenRows()
    expect(b.history).toHaveLength(15)
    expect(profit.progress(g, b)).toBe(0)
    // A profitable year inside the last ten still counts.
    b.history[12]!.profit = 5
    expect(profit.progress(g, b)).toBe(1)
  })

  it('8: looking back for the year a sales milestone was reached ignores rows older than ten', () => {
    const { g, b } = fifteenRows()
    expect(rev1m.when!(g, b, true)).toBe(2014)
    b.history[10]!.revenue = 2_000_000
    expect(rev1m.when!(g, b, true)).toBe(2010)
  })
})

describe('NPC companies stay lean', () => {
  it('9: after a dozen years the rows have the nine old fields and there are at most ten', () => {
    const g = makeTestGame(991, { age: 55, money: 1_000_000_000 })
    g.year = 2030
    g.lifeId = 'series-npc'
    g.log = [{ age: 55, year: 2030, entries: [] }]
    const p = createPerson(g, { relation: 'friend', age: 33, money: 4_000_000, occupation: 'Engineer', stats: { smarts: 70 }, relationship: 80, countryId: 'us' })
    const l = initializeNpc(g, p)
    l.ambition = 60
    l.skill = 68
    expect(startNpcCompany(g, p, 'cafe')).toBe(true)
    g.queue = []
    for (let i = 0; i < 12; i++) {
      g.year++
      g.character.age++
      g.yearActions = {}
      g.log.push({ age: g.character.age, year: g.year, entries: [] })
      yearlyEconomy(g)
      p.age++
      yearlyNpcLife(g, p)
      g.queue = []
    }
    const b = npcCompany(p, g.year)!.b
    expect(b.history.length).toBeGreaterThanOrEqual(8)
    expect(b.history.length).toBeLessThanOrEqual(10)
    for (const r of b.history) for (const k of BOOK_KEYS) expect(k in r, k).toBe(false)
  }, 60_000)
})

describe('stripR1 (the probe helper)', () => {
  const oldRow = (year: number) => ({ year, revenue: 1000 + year, profit: 100, tax: 10, units: 5, price: 2, staff: 3, valuation: 5000, outlets: 1 })
  const newRow = (year: number) => ({ ...oldRow(year), cash: 1, debt: 2, salesTax: 3, cogs: 4, wages: 5, keyStaff: 6, rent: 7, marketing: 8, interest: 9, upkeep: 10, other: 11, otherIncome: 12, ownerPay: 13, draws: 14 })
  const mkt = (year: number) => ({ year, share: 0.1, rank: 2, size: 1e9, lead: 0.2, hhi: 300 })
  const grave = { lifeId: 'l0', generation: 1, name: 'A B', causeOfDeath: 'Old Age', netWorth: 5, ribbon: null, obituary: null }

  function base(): Record<string, unknown> {
    return {
      version: 1,
      lifeId: 'l1',
      year: 2040,
      assets: [{ id: 'a1', kind: 'business', details: { history: Array.from({ length: 10 }, (_, i) => oldRow(2030 + i)), market: { history: [mkt(2038), mkt(2039)], rivals: [['r1', 0.1]] } } }],
      queue: [
        { kind: 'notice', id: 'm1', title: 't', text: 'x' },
        { kind: 'minigame', id: 'm2', game: 'annualReport', title: 'r', scriptId: 's', data: { assetId: 'a1', year: 2039 } },
      ],
      flags: { taxableIncome: 5, flavorRecent: ['f1', 'f2'], bumpedGraves: [grave], other: { top: 1, spark: [1, 2], history: [{ year: 1, x: 2 }] } },
    }
  }

  function withR1(): Record<string, unknown> {
    const o = base()
    const assets = o.assets as { details: { history: unknown[]; market: { history: Record<string, unknown>[] } } }[]
    assets[0]!.details.history = [...Array.from({ length: 20 }, (_, i) => newRow(2010 + i)), ...Array.from({ length: 10 }, (_, i) => newRow(2030 + i))]
    for (const h of assets[0]!.details.market.history) h.top = ['r1', 0.1, 'r2', 0.05]
    const queue = o.queue as Record<string, unknown>[]
    queue[0]!.weight = 'minor'
    queue[0]!.link = 'assets/home'
    ;(queue[1]!.data as Record<string, unknown>).chart = { v: 1, tabs: [] }
    const flags = o.flags as Record<string, unknown>
    delete flags.flavorRecent
    flags.lifeSeries = { v: 1, id: 'l1', rows: [[1, 2, 3, 4, 5, 6, 7, 8]] }
    flags.inbox = { v: 1, items: [] }
    flags.textMem = { r: { flavor: ['f1', 'f2'] } }
    flags.bumpedGraves = [{ ...grave, spark: [1, 2, 3] }]
    return o
  }

  it('returns the v4.0.2-shaped state when every R1 addition is taken away', () => {
    expect(stripR1(withR1())).toEqual(base())
  })

  it('leaves a v4.0.2 state as it is, and never writes to its input', () => {
    const frozen = deepFreeze(withR1())
    expect(stripR1(frozen)).toEqual(base())
    expect(stripR1(base())).toEqual(base())
  })

  it('keeps other keys of textMem, and a top, spark or history that is not a market or book row', () => {
    const o = withR1()
    ;(o.flags as Record<string, unknown>).textMem = { r: { flavor: ['f1', 'f2'], other: ['z'] }, extra: 1 }
    const out = stripR1(o) as { flags: Record<string, unknown> }
    expect(out.flags.textMem).toEqual({ r: { other: ['z'] }, extra: 1 })
    expect(out.flags.flavorRecent).toEqual(['f1', 'f2'])
    expect(out.flags.other).toEqual({ top: 1, spark: [1, 2], history: [{ year: 1, x: 2 }] })
  })

  it('still recognises a company history with a null in a row (a NaN that JSON.stringify wrote as null)', () => {
    const o = withR1()
    const b = base()
    const hist = (x: Record<string, unknown>): Record<string, unknown>[] => (x.assets as { details: { history: Record<string, unknown>[] } }[])[0]!.details.history
    // The same damaged row (a null price and a null staff count) sits in the last ten of both sides.
    hist(o)[hist(o).length - 3]!.price = null
    hist(o)[hist(o).length - 3]!.staff = null
    hist(b)[hist(b).length - 3]!.price = null
    hist(b)[hist(b).length - 3]!.staff = null
    expect(stripR1(o)).toEqual(b)
  })

  it('does not truncate a history that is not made of company rows', () => {
    const o = { history: Array.from({ length: 30 }, (_, i) => ({ year: i, revenue: 1, profit: 1 })) }
    expect((stripR1(o) as { history: unknown[] }).history).toHaveLength(30)
  })
})
