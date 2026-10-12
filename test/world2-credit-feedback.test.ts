import { describe, expect, it } from 'vitest'
import { makeTestGame } from './helpers'
import { economyOf, economyState, ensureEconomy, lendingConditions, recordEconomicActivity, yearlyEconomy } from '../src/game/economy'
import { economyMenu } from '../src/game/economy/menu'
import { marketOf } from '../src/game/data/markets'
import { newBiz, createBusinessAsset } from '../src/game/business/founding'
import { planFor } from '../src/game/business/economy'
import { financeNodes, simulateFinanceYear } from '../src/game/business/finance-firm'
import { loanTotal, readBank, saveBank } from '../src/game/business/bank-state'
import type { GameState, Json, MenuNode } from '../src/game/types'

function fixture(): GameState {
  const g = makeTestGame(882, { age: 35, money: 321_000 })
  g.year = 2030; g.lifeId = 'world2-credit'; g.log = [{ age: 35, year: 2030, entries: [] }]
  ensureEconomy(g)
  return g
}

function gdp(country = 'us'): number {
  const m = marketOf(country)
  return Math.max(1e9, m.populationM * 1e6 * m.gdpPerCapita)
}

function next(g: GameState): void {
  g.year++; g.character.age++; g.yearActions = {}; yearlyEconomy(g)
}

function systemic(g: GameState): void {
  recordEconomicActivity(g, 'settled-systemic-bank-2030', 'us', 'bank', {
    bankLoss: gdp() * .1, bankRun: gdp() * .2, bankLending: -gdp() * .2,
  })
}

function inspect(g: GameState, rows: MenuNode[]): void {
  for (const row of rows) {
    row.visible?.(g)
    if ('subtitle' in row && typeof row.subtitle === 'function') row.subtitle(g)
    if (row.type === 'info' && typeof row.text === 'function') row.text(g)
    if (row.type === 'action') { row.disabledReason?.(g); row.input?.defaultValue?.(g) }
    if (row.type === 'menu') { row.header?.(g); inspect(g, row.children(g)) }
  }
}

function firstDifference(a: unknown, b: unknown, path = ''): string | undefined {
  if (Object.is(a, b)) return
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return `${path}: ${Object.is(a, -0) ? '-0' : String(a)} != ${Object.is(b, -0) ? '-0' : String(b)}`
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>
  for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
    const diff = firstDifference(left[key], right[key], `${path}.${key}`)
    if (diff) return diff
  }
}

describe('World Simulation 2.0: settled banking losses and lagged credit feedback', () => {
  it('queues actual GDP-normalized losses once, with no immediate macro change, money charge or RNG roll', () => {
    const g = fixture(), before = JSON.stringify(economyOf(g)), cash = g.character.money, rng = g.rng
    recordEconomicActivity(g, 'bank-a-2030', 'us', 'bank', { bankLoss: gdp() * .02, bankRun: gdp() * .08, bankLending: -gdp() * .05 })
    expect(economyState(g)!.pending).toHaveLength(1)
    expect(economyState(g)!.pending[0]).toMatchObject({ bankLoss: .02, bankRun: .08, bankLending: -.05, failure: 0 })
    expect(JSON.stringify(economyOf(g))).toBe(before)
    const recorded = JSON.stringify(g)
    for (let i = 0; i < 3; i++) {
      recordEconomicActivity(g, 'bank-a-2030', 'us', 'bank', { bankLoss: gdp(), bankRun: gdp(), bankLending: -gdp() })
      yearlyEconomy(g); inspect(g, [economyMenu]); lendingConditions(g)
    }
    expect(JSON.stringify(g)).toBe(recorded)
    const reload = JSON.parse(recorded) as GameState
    recordEconomicActivity(reload, 'bank-a-2030', 'us', 'bank', { bankLoss: gdp() })
    expect(JSON.stringify(reload)).toBe(recorded)
    next(g)
    expect(economyOf(g).bankStress).toBeCloseTo(.2575, 6)
    expect(economyState(g)!.pending).toEqual([]); expect(economyState(g)!.receipts).toEqual([])
    expect(g.character.money).toBe(cash); expect(g.rng).toBe(rng)
  })

  it('transmits a systemic banking shock through credit into business orders, jobs and defaults', () => {
    const normal = fixture(), crisis = fixture()
    const business = newBiz(normal, 'cafe', 'us', 'Chicago', { cash: 1_000_000 })
    systemic(crisis); next(normal); next(crisis)
    const healthy = economyOf(normal), stressed = economyOf(crisis)
    expect(stressed.bankStress).toBeCloseTo(.95, 6)
    expect(stressed.credit).toBeLessThan(healthy.credit)
    expect(stressed.liquidity).toBeLessThan(healthy.liquidity)
    expect(stressed.spending).toBeLessThan(healthy.spending)
    expect(stressed.growth).toBeLessThan(healthy.growth)
    expect(stressed.unemployment).toBeGreaterThan(healthy.unemployment)
    expect(stressed.defaults).toBeGreaterThan(healthy.defaults)
    expect(stressed.sectors.housing.demand).toBeLessThan(healthy.sectors.housing.demand)
    expect(planFor(crisis, business, crisis.year, { calm: true }).demand).toBeLessThan(planFor(normal, business, normal.year, { calm: true }).demand)
    expect(lendingConditions(crisis).minScore).toBeGreaterThan(lendingConditions(normal).minScore)
    expect(lendingConditions(crisis).maxDti).toBeLessThan(lendingConditions(normal).maxDti)
  })

  it('allows capital repair and recovery instead of replaying the original crisis forever', () => {
    const normal = fixture(), crisis = fixture()
    systemic(crisis)
    let reload = JSON.parse(JSON.stringify(crisis)) as GameState, trough = 1, firstCreditGap = 0
    for (let year = 0; year < 30; year++) {
      next(normal); next(crisis); next(reload)
      expect(economyState(reload), firstDifference(economyState(reload), economyState(crisis))).toEqual(economyState(crisis))
      trough = Math.min(trough, economyOf(crisis).credit)
      if (!year) firstCreditGap = economyOf(normal).credit - economyOf(crisis).credit
      reload = JSON.parse(JSON.stringify(reload)) as GameState
    }
    const healed = economyOf(crisis), baseline = economyOf(normal)
    expect(healed.bankStress).toBeLessThan(.001)
    expect(healed.credit).toBeGreaterThan(trough + .05)
    expect(Math.abs(healed.credit - baseline.credit)).toBeLessThan(firstCreditGap / 2)
    expect(healed.sectors.industry.output).toBeGreaterThan(.4)
    expect(crisis.character.money).toBe(321_000); expect(crisis.rng).toBe(882)
    expect(economyState(crisis)!.pending).toEqual([])
  }, 30000)

  it('nets expansion and contraction before national caps, independent of bank settlement order and reloads', () => {
    const first = fixture(), reverse = fixture(), amounts = [.3, .3, -.3]
    for (const [index, amount] of amounts.entries()) recordEconomicActivity(first, `bank-${index}`, 'us', 'bank', { bankLending: amount * gdp() })
    for (const [index, amount] of [...amounts.entries()].reverse()) {
      recordEconomicActivity(reverse, `bank-${index}`, 'us', 'bank', { bankLending: amount * gdp() })
      reverse.flags = JSON.parse(JSON.stringify(reverse.flags))
    }
    expect(economyState(first)!.pending[0].bankLending).toBeCloseTo(.3, 10)
    expect(economyState(reverse)!.pending).toEqual(economyState(first)!.pending)
    next(first); next(reverse)
    expect(economyState(reverse)).toEqual(economyState(first))
  })

  it('nets company hiring and layoffs independently of settlement order and midyear JSON reloads', () => {
    const first = fixture(), reverse = fixture(), reloaded = fixture()
    const workforce = Math.max(50000, marketOf('us').populationM * 1e6 * .48)
    // Binary-exact shares cross the former sector cap before layoffs offset them.
    const amounts = [.03125, .03125, .03125, -.03125]
    for (const [index, amount] of amounts.entries()) {
      recordEconomicActivity(first, `employer-${index}`, 'us', 'manufacturing', { jobs: amount * workforce })
      recordEconomicActivity(reloaded, `employer-${index}`, 'us', 'manufacturing', { jobs: amount * workforce })
      reloaded.flags = JSON.parse(JSON.stringify(reloaded.flags))
      if (index === 2) expect(economyState(reloaded)!.pending[0].jobs).toBe(.09375)
    }
    for (const [index, amount] of [...amounts.entries()].reverse()) {
      recordEconomicActivity(reverse, `employer-${index}`, 'us', 'manufacturing', { jobs: amount * workforce })
      reverse.flags = JSON.parse(JSON.stringify(reverse.flags))
    }
    expect(economyState(first)!.pending[0].jobs).toBe(.0625)
    expect(economyState(reverse)!.pending).toEqual(economyState(first)!.pending)
    expect(economyState(reloaded)!.pending).toEqual(economyState(first)!.pending)
    next(first); next(reverse); next(reloaded)
    expect(economyState(reverse)).toEqual(economyState(first))
    expect(economyState(reloaded)).toEqual(economyState(first))
    expect(reloaded.character.money).toBe(321_000); expect(reloaded.rng).toBe(882)
  })

  it('still caps the final national employment effect after retaining gross signed company changes', () => {
    const workforce = Math.max(50000, marketOf('us').populationM * 1e6 * .48)
    for (const direction of [-1, 1]) {
      const gross = fixture(), capped = fixture(), unchanged = fixture()
      for (let i = 0; i < 10; i++) recordEconomicActivity(gross, `many-employers-${i}`, 'us', 'manufacturing', { jobs: direction * .04 * workforce })
      for (let i = 0; i < 2; i++) recordEconomicActivity(capped, `capped-employers-${i}`, 'us', 'manufacturing', { jobs: direction * .025 * workforce })
      gross.flags = JSON.parse(JSON.stringify(gross.flags))
      expect(economyState(gross)!.pending[0].jobs).toBeCloseTo(direction * .4, 10)
      next(gross); next(capped); next(unchanged)
      expect(economyState(gross)).toEqual(economyState(capped))
      expect(Math.abs(economyOf(gross).unemployment - economyOf(unchanged).unemployment)).toBeLessThanOrEqual(.050001)
      expect(economyOf(gross).unemployment).toBeGreaterThanOrEqual(.02)
      expect(economyOf(gross).unemployment).toBeLessThanOrEqual(.35)
    }
  })

  it('scales small institutions proportionally and rejects bank telemetry from non-bank businesses', () => {
    const normal = fixture(), small = fixture(), other = fixture()
    recordEconomicActivity(small, 'small-bank', 'us', 'bank', { bankLoss: 100_000, bankRun: 400_000, bankLending: -200_000 })
    recordEconomicActivity(other, 'not-bank', 'us', 'investmentFirm', { bankLoss: gdp(), bankRun: gdp(), bankLending: -gdp() })
    expect(economyState(other)!.pending[0].bankLoss).toBeUndefined()
    next(normal); next(small); next(other)
    expect(economyOf(small).bankStress).toBeLessThan(.00001)
    expect(Math.abs(economyOf(small).credit - economyOf(normal).credit)).toBeLessThan(.00001)
    expect(economyOf(other)).toEqual(economyOf(normal))
  })

  it('exports balanced bank settlement telemetry without letting a forecast write the world or spend customer principal', () => {
    const g = fixture(), b = newBiz(g, 'bank', 'us', 'Chicago', { cash: 5_000_000 })
    const a = createBusinessAsset(g, 'Existing Bank', b, b.cash); g.assets.push(a)
    const f = readBank(b); f.trust = 10; f.appetite = 'highYield'; saveBank(b, f)
    const opening = readBank(b), prediction = structuredClone(b), before = JSON.stringify(g)
    inspect(g, financeNodes(g, a))
    const result = simulateFinanceYear(g, prediction, g.year, 0), closing = readBank(prediction)
    expect(JSON.stringify(g)).toBe(before)
    expect(result.bank).toMatchObject({ bankLoss: closing.last!.bankLoss, bankRun: closing.last!.runWithdrawals,
      bankLending: loanTotal(closing) - loanTotal(opening) })
    expect(loanTotal(closing) + closing.badNet + closing.bonds + closing.reserves).toBeCloseTo(closing.deposits + closing.advance, 3)
    expect(prediction.cash).toBe(b.cash + result.stmt.net)
    expect(simulateFinanceYear(g, prediction, g.year, 0).bank).toBeUndefined()
    recordEconomicActivity(g, 'real-bank-settlement', 'us', 'bank', result.bank!)
    expect(economyState(g)!.pending[0].bankLoss).toBeCloseTo(closing.last!.bankLoss / gdp(), 12)
    expect(g.character.money).toBe(321_000)
  })

  it('upgrades old worlds through pure metadata and bounds malformed stress and feedback safely', () => {
    const g = fixture(), raw = JSON.parse(JSON.stringify(g.flags.worldEconomy))
    raw.v = 1
    for (const country of Object.values(raw.countries) as Record<string, unknown>[]) delete country.bankStress
    g.flags.worldEconomy = raw as Json
    const before = JSON.stringify(g)
    expect(economyOf(g).bankStress).toBe(0)
    inspect(g, [economyMenu]); expect(JSON.stringify(g)).toBe(before)
    raw.countries.us.bankStress = Infinity
    raw.pending = [{ country: 'us', sector: 'finance', jobs: 0, investment: 0, failure: 0, innovation: 0,
      bankLoss: NaN, bankRun: -1, bankLending: Infinity }]
    g.flags.worldEconomy = structuredClone(raw) as Json
    expect(economyOf(g).bankStress).toBe(0)
    expect(economyState(g)!.pending[0]).toMatchObject({ bankLoss: 0, bankRun: 0, bankLending: 0 })
    next(g)
    expect(Number.isFinite(economyOf(g).credit)).toBe(true)
    expect(g.character.money).toBe(321_000); expect(g.rng).toBe(882)
  })
})
