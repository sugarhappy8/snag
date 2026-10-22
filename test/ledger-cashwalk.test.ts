// R2-L19 (A.K1 g): the cash walk without a residual. A company keeps a small tally of why its cash moved (the ledger's reason for each
// move, whole dollars), the books close copies it into the year's row (`flows`), and the company "Where the cash went" chart names every
// move from it: the "Everything else" row is gone for a company with ledger-era books and a test pins it. Rows from before R2 (no flows)
// draw the walk as R1 did. Not in the fast tier: it plays real founder lives.
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { becomeCeo } from '../src/game/business/career'
import { evolve, recordYear, simulateYear } from '../src/game/business/economy'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { businessView } from '../src/game/business/manage'
import { transactEquity } from '../src/game/business/rescue'
import { bizOf, businessAssets, HISTORY_ROWS, normalizeBiz, readBiz, shiftFlow, tallied, type BizState, type Statement, type YearRecord } from '../src/game/business/state'
import { CASH_LABELS, cashWalkSpec } from '../src/game/charts/books'
import { readChartSpec, type ChartSpec, type ChartStep } from '../src/game/charts/spec'
import { erodeFirm, firmCash, firmPurse, moveCash } from '../src/game/cash'
import { initializeNpc, npcBusinessYear, npcCompany, startNpcCompany } from '../src/game/npc-lives'
import { createPerson } from '../src/game/people'
import { REASONS } from '../src/game/kernel/reasons'
import { migrateSave } from '../src/game/save-schema'
import type { GameState, Json, MenuNode } from '../src/game/types'
import { getCountry } from '../src/game/world'
import { jsonNodes } from './charts-kit'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'
import { expectConserved } from './ledger-kit'
import { LEDGER_SEEDS } from './ledger-probe'
import { probeLife } from './probe-life'

const CITY = getCountry('us').cities[0]!
const labels = (steps: ChartStep[]) => steps.map((x) => x.label)
const stepOf = (spec: ChartSpec, label: string): number | undefined => spec.steps!.find((x) => x.label === label)?.value

/** The sum identity of a cash walk: the first total plus every delta is the last total, exactly, in whole dollars. */
function expectExact(steps: ChartStep[], tag = ''): void {
  const deltas = steps.filter((x) => x.kind === 'delta').reduce((t, x) => t + x.value, 0)
  expect(steps[0]!.kind, tag).toBe('total')
  expect(steps[steps.length - 1]!.kind, tag).toBe('total')
  expect(steps[0]!.value + deltas, tag).toBe(steps[steps.length - 1]!.value)
  for (const x of steps) expect(Number.isInteger(x.value), `${tag} ${x.label}`).toBe(true)
}

/** The row of the statement's year, or undefined. */
const rowOf = (b: BizState): YearRecord | undefined => b.history.find((h) => h.year === b.last?.year)

// ---------------------------------------------------------------------------------------------------------------------------
// Real founder lives
// ---------------------------------------------------------------------------------------------------------------------------

interface Walk {
  /** Years played when the walk was drawn; 6.5 is the walk drawn right after the year-six actions. */
  at: number
  name: string
  id: string
  b: BizState
  spec: ChartSpec | null
}

function walk(g: GameState, nodes: MenuNode[], depth = 0): MenuNode[] {
  return nodes.flatMap((n) => (n.type === 'menu' && depth < 5 ? [n, ...walk(g, n.children(g), depth + 1)] : [n]))
}

const BONUS = 10_000
const INJECT = 50_000
const RESCUE = 20_000

/**
 * A founder with `businesses` companies, twelve years, and in year six an owner bonus, an injection and a rescue on the first company, all
 * through the public functions (the company menu and transactEquity). Every year's walk is drawn after the year's step.
 */
const lives = new Map<string, { g: GameState; walks: Walk[] }>()
function life(businesses: number, seed: number): { g: GameState; walks: Walk[] } {
  const key = `${businesses}:${seed}`
  const known = lives.get(key)
  if (known) return known
  const made = play(businesses, seed)
  lives.set(key, made)
  return made
}

function play(businesses: number, seed: number): { g: GameState; walks: Walk[] } {
  const walks: Walk[] = []
  const snap = (g: GameState, at: number): void => {
    for (const a of businessAssets(g)) {
      const b = readBiz(g, a)
      walks.push({ at, name: a.name, id: a.id, b, spec: cashWalkSpec(g, b) })
    }
  }
  const g = probeLife({ seed, birthYear: 1960, businesses, years: 6, keepAlive: true, onYear: snap })
  const first = businessAssets(g)[0]!
  g.queue = []
  becomeCeo(g, first, bizOf(g, first))
  const nodes = walk(g, businessView(g, first))
  for (const [id, input] of [[`biz.bonus.${first.id}`, String(BONUS)], [`biz.inject.${first.id}`, String(INJECT)]] as const) {
    const n = nodes.find((x) => x.id === id)
    expect(n?.type, id).toBe('action')
    if (n?.type === 'action') n.run(g, input)
  }
  expect(transactEquity(g, first.id, 'subscribe', RESCUE)).toBe(true)
  g.queue = []
  snap(g, 6.5)
  for (let y = 7; y <= 12; y++) {
    g.queue = []
    g.character.stats.health = 100
    g.character.conditions = []
    ageUp(g)
    snap(g, y)
  }
  return { g, walks }
}

describe('R2-L19: the walk of real founder lives names every move', () => {
  for (const [businesses, n] of [[1, 3], [3, 7], [6, 11]] as const) {
    it(`${businesses} ${businesses === 1 ? 'company' : 'companies'}, twelve years, a bonus, an injection and a rescue in year six`, () => {
      const { g, walks } = life(businesses, LEDGER_SEEDS[n]!)
      let named = 0
      for (const w of walks) {
        if (w.spec === null) continue
        const tag = `${w.name} after ${w.at} years`
        const steps = w.spec.steps!
        expectExact(steps, tag)
        expect(readChartSpec(w.spec), tag).toEqual(w.spec)
        const row = rowOf(w.b)
        if (row?.flows === undefined) continue
        named++
        // A row with reasons has no residual row of its own: the only unnamed step is a dollar or two of rounding.
        expect(labels(steps), tag).not.toContain('Everything else')
        expect(labels(steps), tag).not.toContain('Unexplained')
        expect(Math.abs(stepOf(w.spec, 'Rounding') ?? 0), tag).toBeLessThanOrEqual(2)
        expect(w.spec.note, tag).toBeUndefined()
        for (const s of steps) expect(s.label.length, s.label).toBeLessThanOrEqual(40)
      }
      // The check ran on real walks: every company has about ten years with reasons, minus the first (no books) and the second (the tally starts).
      expect(named).toBeGreaterThanOrEqual(businesses * 8)
      expectConserved(g)
    })

    it(`${businesses} ${businesses === 1 ? 'company' : 'companies'}: a year's flows add up to the cash that year changed by`, () => {
      const { walks } = life(businesses, LEDGER_SEEDS[n]!)
      let rows = 0
      for (const w of walks) {
        if (w.at !== 12) continue
        const b = w.b
        for (let i = 1; i < b.history.length; i++) {
          const h = b.history[i]!
          const prev = b.history[i - 1]!
          if (h.flows === undefined || h.cash === undefined || prev.cash === undefined || prev.year !== h.year - 1) continue
          rows++
          const sum = Object.values(h.flows).reduce((t, v) => t + v, 0)
          expect(Math.abs(h.cash - prev.cash - sum), `${w.name} ${h.year}`).toBeLessThanOrEqual(1)
          expect(Object.keys(h.flows).length).toBeLessThanOrEqual(16)
        }
      }
      expect(rows).toBeGreaterThanOrEqual(businesses * 8)
    })
  }

  it('the year-six actions are named in the walks of year six and year seven', () => {
    const { walks } = life(1, LEDGER_SEEDS[3]!)
    const at = (year: number): ChartSpec => walks.find((w) => w.at === year)!.spec!
    // Right after the actions the cash is live: the injection and the rescue are two moves of one reason, the bonus another.
    const now = at(6.5)
    expect(stepOf(now, 'Money you put in')).toBe(INJECT + RESCUE)
    expect(stepOf(now, 'Your bonus')).toBe(-BONUS)
    // After the next year's books the bonus is one of the year's one-offs, already inside net profit (the Net profit row carries the
    // mark), so it is not a step again; the injection still is.
    const next = at(7)
    expect(stepOf(next, 'Money you put in')).toBe(INJECT + RESCUE)
    expect(labels(next.steps!)).not.toContain('Your bonus')
    expect(next.marks?.[0]?.label).toMatch(/bonus/)
  })

  it('a company with no reasons in its row draws the R1 walk: Everything else and its note, still exact', () => {
    const { walks } = life(1, LEDGER_SEEDS[3]!)
    const last = walks.find((w) => w.at === 12)!
    const old = structuredClone(last.b)
    for (const h of old.history) delete h.flows
    delete old.tally
    const g = makeTestGame(1, { countryId: 'us' })
    const spec = cashWalkSpec(g, old)!
    expect(spec).not.toBeNull()
    expectExact(spec.steps!)
    expect(labels(spec.steps!)).not.toContain('Rounding')
    expect(spec.note).toBe("Moves the books don't name yet sit in everything else.")
    const rest = stepOf(spec, 'Everything else')
    // The R1 residual is exactly what the reasons now name.
    const named = cashWalkSpec(g, last.b)!
    const moves = named.steps!.filter((x) => !['Cash at the start', 'Net profit', 'Inflation on cash', 'Change in debt', 'Dividends paid', 'Cash now'].includes(x.label))
    expect(moves.reduce((t, x) => t + x.value, 0)).toBe(rest ?? 0)
  })

  it('an NPC company stepped by the world keeps no tally or flows, even one that was somebody\'s company before', () => {
    const g = makeTestGame(52, { age: 35, money: 20_000_000 })
    const p = createPerson(g, { relation: 'friend', firstName: 'Adam', age: 30, money: 3_000_000, occupation: 'Engineer', relationship: 90, stats: { smarts: 88 }, traits: ['ambitious', 'loyal'] })
    initializeNpc(g, p)
    expect(startNpcCompany(g, p, 'cafe')).toBe(true)
    const held = npcCompany(p, g.year)!
    held.b.cash = 20_000_000
    held.b.brand = 95
    held.b.quality = 95
    // A company a player adopted out (a sibling's firm) arrives with a tally; the first NPC close drops it.
    ;(p.data.npcCompany as unknown as { details: Record<string, Json> }).details.tally = { capex: -5 }
    for (let y = 0; y < 3; y++) {
      g.year += 1
      npcBusinessYear(g, p, initializeNpc(g, p))
    }
    const text = JSON.stringify(p.data.npcCompany)
    expect(npcCompany(p, g.year)?.b.history.length, 'the company stayed in business and booked years').toBeGreaterThanOrEqual(2)
    expect(text.includes('"tally"')).toBe(false)
    expect(text.includes('"flows"')).toBe(false)
    expectConserved(g)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// The tally: how a company's cash moves are kept
// ---------------------------------------------------------------------------------------------------------------------------

/** A rich owner with two companies in the world, the books of both closed once so their tallies are running. */
function pair() {
  const g = makeTestGame(32, { age: 35, money: 100_000_000 })
  const make = (name: string) => {
    const a = createBusinessAsset(g, name, newBiz(g, 'cafe', 'us', CITY, { cash: 1_000_000, founded: 2020 }), 1_000_000)
    g.assets.push(a)
    return { a, b: bizOf(g, a) }
  }
  const one = make('One')
  const two = make('Two')
  for (const x of [one, two]) {
    const r = simulateYear(g, x.b, g.year, 0)
    evolve(g, x.b, r.stmt, g.year)
    recordYear(x.b, r.stmt)
  }
  return { g, one, two }
}

describe('R2-L19: the tally of a company', () => {
  it('starts when the books first close, not before, so a row never claims moves it could not see', () => {
    const g = makeTestGame(32, { age: 35, money: 100_000_000 })
    const a = createBusinessAsset(g, 'Fresh', newBiz(g, 'cafe', 'us', CITY, { cash: 1_000_000, founded: 2020 }), 1_000_000)
    g.assets.push(a)
    const b = bizOf(g, a)
    expect(b.tally).toBeUndefined()
    firmCash(g, b, -5_000, 'marketing', a.id)
    expect(b.tally).toBeUndefined()
    const r = simulateYear(g, b, g.year, 0)
    evolve(g, b, r.stmt, g.year)
    const row = recordYear(b, r.stmt)
    expect(row.flows).toBeUndefined()
    expect(b.tally).toEqual({})
    firmCash(g, b, -5_000, 'marketing', a.id)
    expect(b.tally).toEqual({ marketing: -5_000 })
  })

  it('takes every move of firmCash and moveCash by its reason, and a move between two firms shows on both with opposite signs', () => {
    const { g, one, two } = pair()
    const cashOne = one.b.cash
    const cashTwo = two.b.cash
    firmCash(g, one.b, -7_000, 'capex', one.a.id)
    firmCash(g, one.b, 2_500, 'royalty', one.a.id)
    firmCash(g, one.b, -1_000, { reason: 'legal', with: 'pool:legal' }, one.a.id)
    expect(moveCash(g, firmPurse(one.b, one.a.id), firmPurse(two.b, two.a.id), 40_000, 'inject')).toBe(40_000)
    expect(one.b.tally).toEqual({ capex: -7_000, royalty: 2_500, legal: -1_000, inject: -40_000 })
    expect(two.b.tally).toEqual({ inject: 40_000 })
    expect(one.b.cash).toBe(cashOne - 7_000 + 2_500 - 1_000 - 40_000)
    expect(two.b.cash).toBe(cashTwo + 40_000)
    expectConserved(g)
  })

  it('takes the erosion of company cash as inflation, with its sign', () => {
    const { g, one } = pair()
    one.b.cash = 1_000_000
    const lost = erodeFirm(g, one.b, 12_345, one.a.id)
    expect(lost).toBe(-12_345)
    expect(one.b.tally).toEqual({ inflation: -12_345 })
    erodeFirm(g, one.b, -2_345, one.a.id)
    expect(one.b.tally).toEqual({ inflation: -10_000 })
  })

  it('tallies the change of the whole-dollar cash, so the tally and the closing cash never part, even on cents', () => {
    const { g, one } = pair()
    one.b.cash = 1_000_000
    for (const d of [0.4, 0.4, 0.4, -0.3, 0.7, 12.2, -3.9]) firmCash(g, one.b, d, 'purchase', one.a.id)
    const sum = Object.values(one.b.tally!).reduce((t, v) => t + v, 0)
    expect(sum).toBe(Math.round(one.b.cash) - 1_000_000)
  })

  it('keeps at most 16 keys: the next reasons fold into luck and the sum is the cash change', () => {
    const { g, one } = pair()
    one.b.cash = 1_000_000
    const names = ['capex', 'marketing', 'rnd', 'legal', 'fine', 'payroll', 'severance', 'inputs', 'royalty', 'sales', 'purchase', 'rent', 'tax.corp', 'benefit', 'claim', 'crime.take', 'trade.buy', 'trade.sell', 'invest.income', 'premium'] as const
    for (const n of names) firmCash(g, one.b, -10, n, one.a.id)
    expect(Object.keys(one.b.tally!).length).toBeLessThanOrEqual(16)
    expect(Object.values(one.b.tally!).reduce((t, v) => t + v, 0)).toBe(-200)
    expect(one.b.tally!.luck).toBeLessThan(0)
  })

  it('deletes a key that nets to zero', () => {
    const { g, one } = pair()
    firmCash(g, one.b, -500, 'capex', one.a.id)
    firmCash(g, one.b, 500, 'capex', one.a.id)
    expect(one.b.tally).toEqual({})
  })

  it('leaves a company out when told to, and never writes to a tally that a save damaged', () => {
    const { g, one } = pair()
    firmCash(g, one.b, -500, 'capex', one.a.id, { tally: false })
    expect(one.b.tally).toEqual({})
    for (const bad of [null, [1, 2], 'x', 7, true]) {
      ;(one.b as unknown as { tally: unknown }).tally = bad
      const cash = one.b.cash
      expect(() => firmCash(g, one.b, -100, 'capex', one.a.id)).not.toThrow()
      expect(one.b.cash).toBe(cash - 100)
    }
    // A tally with strings in it is cleaned by the next close, never added to as text.
    one.b.tally = { capex: 'many' as unknown as number, marketing: -5 }
    firmCash(g, one.b, -100, 'capex', one.a.id)
    expect(Number.isFinite(one.b.tally.capex)).toBe(true)
  })
})

describe('R2-L19: closing the books', () => {
  it('moves the tally into the year row and starts it again empty', () => {
    const { g, one } = pair()
    firmCash(g, one.b, -7_000, 'capex', one.a.id)
    firmCash(g, one.b, 1_000, 'royalty', one.a.id)
    const r = simulateYear(g, one.b, g.year + 1, 0)
    evolve(g, one.b, r.stmt, g.year + 1)
    const row = recordYear(one.b, r.stmt)
    expect(row.flows?.capex).toBe(-7_000)
    expect(row.flows?.royalty).toBe(1_000)
    expect(Object.values(row.flows!).reduce((t, v) => t + v, 0)).toBe(row.cash! - one.b.history[one.b.history.length - 2]!.cash!)
    expect(one.b.tally).toEqual({})
  })

  it('is idempotent: closing a year twice keeps the first row, and adds only what moved in between', () => {
    const { g, one } = pair()
    firmCash(g, one.b, -7_000, 'capex', one.a.id)
    const r = simulateYear(g, one.b, g.year + 1, 0)
    evolve(g, one.b, r.stmt, g.year + 1)
    const first = recordYear(one.b, r.stmt)
    const flows = { ...first.flows }
    const again = recordYear(one.b, r.stmt)
    expect(again.flows).toEqual(flows)
    expect(one.b.history.filter((h) => h.year === r.stmt.year)).toHaveLength(1)
    expect(one.b.tally).toEqual({})
    // Something moved after the first close and before the second: the row's cash is the cash now, so its flows take the move too.
    firmCash(g, one.b, 1_500, 'royalty', one.a.id)
    const third = recordYear(one.b, r.stmt)
    expect(third.flows).toEqual({ ...flows, royalty: 1_500 })
    expect(third.cash).toBe(Math.round(one.b.cash))
  })

  it('cleans a damaged row it closes again, and a damaged tally it closes into a new row', () => {
    const { g, one } = pair()
    const r = simulateYear(g, one.b, g.year + 1, 0)
    evolve(g, one.b, r.stmt, g.year + 1)
    const first = recordYear(one.b, r.stmt)
    first.flows = { capex: 'lots' as unknown as number, nonsense: 9, rnd: -40, inject: Number.NaN }
    one.b.tally = { rnd: -2.4, marketing: 1e300 }
    const again = recordYear(one.b, r.stmt)
    expect(again.flows).toEqual({ rnd: -42, marketing: 1e15 })
    expect(one.b.tally).toEqual({})
  })

  it('never gives a lean (NPC) company a tally or flows, and clears one it was left with', () => {
    const { g, one } = pair()
    const r = simulateYear(g, one.b, g.year + 1, 0)
    evolve(g, one.b, r.stmt, g.year + 1)
    expect(one.b.tally).toBeDefined()
    const row = recordYear(one.b, r.stmt, { lean: true })
    expect(row.flows).toBeUndefined()
    expect(one.b.tally).toBeUndefined()
    expect(row.cash).toBeUndefined()
  })

  it('a row amended after the close (a group invoice) takes the move from the live tally, so its flows still add up', () => {
    const { g, one } = pair()
    const r = simulateYear(g, one.b, g.year + 1, 0)
    evolve(g, one.b, r.stmt, g.year + 1)
    const row = recordYear(one.b, r.stmt)
    const before = tallied(one.b)
    firmCash(g, one.b, -300, 'inputs', one.a.id, { operating: true })
    const moved = tallied(one.b) - before
    expect(moved).toBe(-300)
    const flowsBefore = row.flows!.operating ?? 0
    shiftFlow(one.b, row, moved)
    expect(row.flows!.operating).toBe(flowsBefore - 300)
    expect(tallied(one.b)).toBe(before)
    // Nothing to shift for a company or a row that keeps no flows, or for a change of nothing.
    expect(() => shiftFlow({}, row, 5)).not.toThrow()
    expect(() => shiftFlow(one.b, { ...row, flows: undefined }, 5)).not.toThrow()
    shiftFlow(one.b, row, 0)
    expect(row.flows!.operating).toBe(flowsBefore - 300)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// The walk, from hand-built books
// ---------------------------------------------------------------------------------------------------------------------------

function statement(year: number, over: Partial<Statement> = {}): Statement {
  return {
    year, demand: 1000, sold: 900, produced: 1000, spoiled: 0, price: 100, revenue: 120_000, salesTax: 20_000, netRevenue: 100_000,
    cogs: 40_000, wages: 25_000, keyStaff: 0, rent: 10_000, marketing: 0, interest: 0, upkeep: 5_000, other: 0, otherIncome: 0, ownerPay: 0,
    pbt: 0, corpTax: 0, net: 4_200, cashErosion: 0, cycle: 0, openFraction: 1, employees: 5, ...over,
  }
}

function row(year: number, over: Partial<YearRecord> = {}): YearRecord {
  return {
    year, revenue: 120_000, profit: 4_200, tax: 0, units: 900, price: 100, staff: 6, valuation: 500_000, outlets: 1, cash: 100_000, debt: 0,
    salesTax: 20_000, cogs: 40_000, wages: 25_000, keyStaff: 0, rent: 10_000, marketing: 0, interest: 0, upkeep: 5_000, other: 0, otherIncome: 0,
    ownerPay: 0, draws: 0, ...over,
  }
}

interface Books {
  /** The cash at the start of the year (the year before's books close), the debt then and now. */
  opening?: number
  debtThen?: number
  debtNow?: number
  /** The year's net profit, erosion, one-off costs and income (the row's `other` and `otherIncome`). */
  net?: number
  erosion?: number
  other?: number
  otherIncome?: number
  /** The year's flows, the live tally and the dividend the statement year paid. */
  flows: Record<string, number>
  live?: Record<string, number>
  paid?: number
  /** The cash now. */
  closing: number
}

/** A company whose books end in 2031, built so every number of the walk is the one written here. */
function books(o: Books): { g: GameState; b: BizState } {
  const g = makeTestGame(1, { countryId: 'us' })
  g.year = 2032
  const b = newBiz(g, 'restaurant', 'us', CITY, {
    cash: o.closing,
    debt: o.debtNow ?? 0,
    founded: 2020,
    valuation: 500_000,
    history: [
      row(2030, { cash: o.opening ?? 100_000, debt: o.debtThen ?? 0 }),
      row(2031, { other: o.other ?? 0, otherIncome: o.otherIncome ?? 0, flows: o.flows, profit: o.net ?? 4_200 }),
    ],
    last: statement(2031, { net: o.net ?? 4_200, cashErosion: o.erosion ?? 0, other: o.other ?? 0, otherIncome: o.otherIncome ?? 0 }),
  })
  b.tally = o.live ?? {}
  if (o.paid) b.dividend = { mode: 'profit', pct: 0.3, keep: 3, last: { year: 2031, paid: o.paid, mine: o.paid, perShare: 0 } }
  return { g, b }
}

function drawn(o: Books): ChartSpec {
  const { g, b } = books(o)
  const spec = cashWalkSpec(g, b)
  expect(spec).not.toBeNull()
  expect(readChartSpec(spec)).toEqual(spec)
  expectExact(spec!.steps!)
  return spec!
}

describe('R2-L19: the walk, named', () => {
  it('a year of net profit, one injection and nothing else has exactly those two rows', () => {
    const spec = drawn({ flows: { operating: 4_200, inject: 20_000 }, closing: 124_200 })
    expect(labels(spec.steps!)).toEqual(['Cash at the start', 'Net profit', 'Money you put in', 'Cash now'])
    expect(spec.steps!.map((x) => x.value)).toEqual([100_000, 4_200, 20_000, 124_200])
    expect(spec.note).toBeUndefined()
  })

  it('a one-off cost that net profit already holds is not a step again, and the stock that moved without profit is named', () => {
    // Net profit 4,200 already counts the 800 of severance paid in the year. The operating booking reverses it (4,200 + 800 + 300 of stock
    // bought), so the cash moved by 5,300 - 800 = 4,500 and the walk is net profit and the 300 of stock.
    const spec = drawn({ flows: { operating: 5_300, payroll: -800 }, other: 800, closing: 104_500 })
    expect(labels(spec.steps!)).toEqual(['Cash at the start', 'Net profit', 'Stock and timing', 'Cash now'])
    expect(stepOf(spec, 'Stock and timing')).toBe(300)
  })

  it('a one-off of two reasons is taken out together, and one the books cannot place stays in view', () => {
    const both = drawn({ flows: { operating: 4_200 + 1_000, payroll: -600, legal: -400 }, other: 1_000, closing: 104_200 })
    expect(labels(both.steps!)).toEqual(['Cash at the start', 'Net profit', 'Cash now'])
    // Two reasons of the same size could each be the one-off: the books cannot say which, so both stay and the stock row holds the difference.
    const either = drawn({ flows: { operating: 4_200 + 800, payroll: -800, legal: -800 }, other: 800, closing: 103_400 })
    expect(stepOf(either, 'Staff pay')).toBe(-800)
    expect(stepOf(either, 'Lawyers')).toBe(-800)
    expect(stepOf(either, 'Stock and timing')).toBe(800)
  })

  it('names what happened after the books closed from the live tally, and a one-off income the same way', () => {
    const spec = drawn({
      flows: { operating: 4_200 - 900, sales: 900 },
      otherIncome: 900,
      live: { marketing: -3_000, inject: 8_000 },
      closing: 100_000 + 3_300 + 900 - 3_000 + 8_000,
    })
    expect(stepOf(spec, 'Marketing')).toBe(-3_000)
    expect(stepOf(spec, 'Money you put in')).toBe(8_000)
    expect(labels(spec.steps!)).not.toContain('Extra sales')
    expect(labels(spec.steps!)).not.toContain('Stock and timing')
  })

  it('keeps the dividend row to the statement year and names the other dividends', () => {
    const spec = drawn({ flows: { operating: 4_200, dividend: -3_000 }, live: { dividend: -4_000 }, paid: 4_000, closing: 100_000 + 4_200 - 7_000 })
    expect(stepOf(spec, 'Dividends paid')).toBe(-4_000)
    expect(stepOf(spec, 'Dividends paid earlier')).toBe(-3_000)
  })

  it('names the loans the debt row did not hold', () => {
    const spec = drawn({ flows: { operating: 4_200, 'loan.principal': 30_000, 'loan.repay': -2_000 }, debtThen: 10_000, debtNow: 36_000, closing: 100_000 + 4_200 + 28_000 })
    expect(stepOf(spec, 'Change in debt')).toBe(26_000)
    expect(stepOf(spec, 'Loan moves')).toBe(2_000)
  })

  it('shows the five biggest moves and sums the rest as Other moves', () => {
    const flows = { operating: 4_200, capex: -9_000, marketing: -8_000, rnd: -7_000, inject: 6_000, fine: -5_000, 'tax.corp': -400, rent: -300, 'fee.gov': -200 }
    const spec = drawn({ flows, closing: 100_000 + 4_200 - 9_000 - 8_000 - 7_000 + 6_000 - 5_000 - 900 })
    const moves = spec.steps!.filter((x) => !['Cash at the start', 'Net profit', 'Cash now'].includes(x.label))
    expect(moves.map((x) => x.label)).toEqual(['Equipment and buildings', 'Marketing', 'Research', 'Money you put in', 'Fines', 'Other moves'])
    expect(stepOf(spec, 'Other moves')).toBe(-900)
  })

  it('a reason with no name of its own goes to Other moves, and luck is where the tally folds its overflow', () => {
    const spec = drawn({ flows: { operating: 4_200, tuition: -100, luck: 40 }, closing: 100_000 + 4_200 - 60 })
    expect(stepOf(spec, 'Other moves')).toBe(-60)
  })

  it('a dollar or two the reasons cannot name is Rounding; anything bigger is Unexplained, never Everything else', () => {
    const base = { flows: { operating: 4_200 } }
    expect(stepOf(drawn({ ...base, closing: 104_201 }), 'Rounding')).toBe(1)
    expect(stepOf(drawn({ ...base, closing: 104_198 }), 'Rounding')).toBe(-2)
    const big = drawn({ ...base, closing: 109_200 })
    expect(stepOf(big, 'Unexplained')).toBe(5_000)
    expect(labels(big.steps!)).not.toContain('Everything else')
    expect(labels(big.steps!)).not.toContain('Rounding')
  })

  it('a row with no reasons, or reasons beyond a sane size, draws the R1 walk and never throws', () => {
    const { g, b } = books({ flows: { operating: 4_200 }, closing: 104_200 })
    const r = b.history[1]!
    delete r.flows
    const plain = cashWalkSpec(g, b)!
    expect(labels(plain.steps!)).toEqual(['Cash at the start', 'Net profit', 'Cash now'])
    b.cash += 5_000
    const rest = cashWalkSpec(g, b)!
    expect(stepOf(rest, 'Everything else')).toBe(5_000)
    expect(rest.note).toBe("Moves the books don't name yet sit in everything else.")
    expectExact(rest.steps!)
    for (const bad of [1e300, 4e13, Number.NaN, Number.POSITIVE_INFINITY, 'x']) {
      const x = books({ flows: { operating: 4_200 }, closing: 104_200 })
      x.b.history[1]!.flows = { operating: 4_200, capex: bad as number }
      expect(() => cashWalkSpec(x.g, x.b)).not.toThrow()
      const spec = cashWalkSpec(x.g, x.b)
      if (spec) expectExact(spec.steps!)
    }
  })

  it('is pure: the same books on frozen state draw the same walk and write nothing', () => {
    const { g, b } = books({ flows: { operating: 5_300, payroll: -800, inject: 20_000 }, other: 800, closing: 124_500 })
    const first = JSON.stringify(cashWalkSpec(g, b))
    const before = JSON.stringify(b)
    deepFreeze(b)
    expect(JSON.stringify(cashWalkSpec(g, b))).toBe(first)
    expect(JSON.stringify(b)).toBe(before)
  })

  it('names every reason a company moves cash with, in the plain voice', () => {
    for (const [reason, label] of Object.entries(CASH_LABELS)) {
      expect(Object.prototype.hasOwnProperty.call(REASONS, reason), reason).toBe(true)
      expect(label.length, label).toBeLessThanOrEqual(40)
      expect(/[\u2013\u2014]/.test(label), label).toBe(false)
    }
    for (const reason of ['inject', 'capex', 'rnd', 'marketing', 'tax.corp', 'legal', 'fine', 'firm.sale']) expect(CASH_LABELS[reason], reason).toBeTruthy()
    expect(CASH_LABELS['firm.sale']).toBe('Sale of a part of the business')
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// Hostile data, saves and size
// ---------------------------------------------------------------------------------------------------------------------------

describe('R2-L19: hostile tallies and flows', () => {
  const hostile: Record<string, unknown>[] = [
    { capex: 'a lot', marketing: Number.NaN, rnd: Number.POSITIVE_INFINITY, legal: null, fine: [3], inject: { x: 1 }, nonsense: 5, __proto__: { polluted: 1 } },
    { capex: 1e300, marketing: -1e300, rnd: 5.4, legal: -0.4, fine: 0 },
    Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`key${i}`, i + 1])),
    Object.fromEntries(Object.keys(REASONS).slice(0, 40).map((k, i) => [k, (i + 1) * 100])),
  ]
  const asDetails = (g: GameState, flows: unknown, tally: unknown): Record<string, Json> => {
    const b = newBiz(g, 'cafe', 'us', CITY, { cash: 10, founded: 2020, history: [row(2030, { flows: flows as Record<string, number> })] })
    return JSON.parse(JSON.stringify({ ...b, tally, history: [{ ...row(2030), flows }] })) as Record<string, Json>
  }

  it('reads back as at most 16 whole-dollar numbers under real reason names, in a tally and in a row', () => {
    const g = makeTestGame(1, { countryId: 'us' })
    for (const h of hostile) {
      const b = normalizeBiz(asDetails(g, h, h), 2030)
      for (const t of [b.tally, b.history[0]!.flows]) {
        expect(t).toBeDefined()
        const keys = Object.keys(t!)
        expect(keys.length).toBeLessThanOrEqual(16)
        for (const k of keys) {
          expect(Object.prototype.hasOwnProperty.call(REASONS, k) || k === 'operating', k).toBe(true)
          expect(Number.isInteger(t![k]), k).toBe(true)
          expect(Math.abs(t![k]!)).toBeLessThanOrEqual(1e15)
          expect(t![k]).not.toBe(0)
        }
      }
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('folds the overflow of a tally with too many reasons into luck and keeps the sum', () => {
    const g = makeTestGame(1, { countryId: 'us' })
    const h = hostile[3]!
    const sum = Object.values(h).reduce<number>((t, v) => t + (v as number), 0)
    const b = normalizeBiz(asDetails(g, h, h), 2030)
    expect(Object.keys(b.tally!)).toHaveLength(16)
    expect(Object.values(b.tally!).reduce((t, v) => t + v, 0)).toBe(sum)
    expect(b.tally!.luck).toBeGreaterThan(0)
  })

  it('reads anything that is not a plain object as no tally, and an empty object as a tally that is running', () => {
    const g = makeTestGame(1, { countryId: 'us' })
    for (const bad of [null, 5, 'x', [1, 2], true]) {
      const b = normalizeBiz(asDetails(g, bad, bad), 2030)
      expect(b.tally).toBeUndefined()
      expect(b.history[0]!.flows).toBeUndefined()
    }
    const b = normalizeBiz(asDetails(g, {}, {}), 2030)
    expect(b.tally).toEqual({})
    expect(b.history[0]!.flows).toEqual({})
  })

  it('a hostile row still draws a walk that adds up', () => {
    for (const h of hostile) {
      const x = books({ flows: { operating: 4_200 }, closing: 104_200 })
      const b = normalizeBiz(asDetails(x.g, h, h), 2030)
      b.last = x.b.last
      b.history = x.b.history.map((r) => (r.year === 2031 ? { ...r, flows: h as Record<string, number> } : r))
      b.cash = x.b.cash
      const spec = cashWalkSpec(x.g, b)
      if (spec) expectExact(spec.steps!)
    }
  })
})

describe('R2-L19: saves and size', () => {
  it('a save of a company with flows loads back to the same JSON', () => {
    const { g, walks } = life(1, LEDGER_SEEDS[3]!)
    const a = businessAssets(g)[0]!
    const b = readBiz(g, a)
    expect(b.history.some((h) => h.flows !== undefined)).toBe(true)
    expect(b.tally).toBeDefined()
    const text = JSON.stringify(g)
    const result = migrateSave(JSON.parse(text))
    expect(result.kind).toBe('ready')
    if (result.kind !== 'ready') return
    const back = businessAssets(result.game)[0]!
    expect(JSON.stringify(readBiz(result.game, back).tally)).toBe(JSON.stringify(b.tally))
    expect(JSON.stringify(readBiz(result.game, back).history)).toBe(JSON.stringify(b.history))
    expect(JSON.stringify(result.game.assets.find((x) => x.id === a.id)!.details)).toBe(JSON.stringify(a.details))
    expect(walks.length).toBeGreaterThan(0)
  })

  it('thirty rows of sixteen reasons and a live tally stay under 2,000 nodes a company', () => {
    const g = makeTestGame(1, { countryId: 'us' })
    const names = Object.keys(REASONS).slice(0, 15)
    const full = Object.fromEntries([...names, 'luck'].map((k, i) => [k, (i + 1) * 1_000]))
    const rows = Array.from({ length: HISTORY_ROWS }, (_, i) => row(2000 + i, { flows: { ...full } }))
    const b = newBiz(g, 'cafe', 'us', CITY, { cash: 10, founded: 1990, history: rows })
    b.tally = { ...full }
    const nodes = jsonNodes({ tally: b.tally, flows: b.history.map((h) => h.flows) })
    expect(nodes).toBeLessThan(2_000)
    const read = normalizeBiz(JSON.parse(JSON.stringify(b)) as Record<string, Json>, 2031)
    expect(read.history).toHaveLength(HISTORY_ROWS)
    for (const h of read.history) expect(Object.keys(h.flows!)).toHaveLength(16)
  })

  it('twelve real years of six companies keep the tallies and flows far under the budget', () => {
    const { g } = life(6, LEDGER_SEEDS[11]!)
    let nodes = 0
    for (const a of businessAssets(g)) {
      const b = readBiz(g, a)
      const here = jsonNodes({ tally: b.tally, flows: b.history.map((h) => h.flows) })
      expect(here).toBeLessThan(2_000)
      nodes += here
    }
    expect(nodes).toBeLessThan(12_000)
  })
})
