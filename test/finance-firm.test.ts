import { describe, expect, it } from 'vitest'
import { becomeCeo } from '../src/game/business/career'
import { valuationOf } from '../src/game/business/economy'
import { executiveOperations } from '../src/game/business/executive'
import { closeBusiness, declareBankruptcy, goPublic, sellShares } from '../src/game/business/exit'
import { movableCash } from '../src/game/business/conglomerate-actions'
import type { GroupMember } from '../src/game/business/conglomerate-state'
import { createBusinessAsset, initialProduction, newBiz } from '../src/game/business/founding'
import { financeView, saveFinance } from '../src/game/business/finance-firm-state'
import { attractFinanceClients, financeAlgoBlock, financeAlgoCost, financeEraBlock, financeNodes, financeTeamSkill, researchFinanceAlgorithm, setFinancePolicy, simulateFinanceYear } from '../src/game/business/finance-firm'
import { bizOf, normalizeBiz, readBiz, type KeyStaff } from '../src/game/business/state'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import type { Industry } from '../src/game/data/markets'
import type { GameState, Json, MenuNode } from '../src/game/types'
import { makeTestGame } from './helpers'

function institution(industry: Industry = 'investmentFirm', countryId = 'us') {
  const g = makeTestGame(3, { age: 30, money: 50_000_000, countryId, city: 'Chicago' })
  const b = newBiz(g, industry, countryId, 'Chicago', { cash: 5_000_000 })
  const a = createBusinessAsset(g, 'Test Financial', b, b.cash)
  g.assets.push(a)
  return { g, a, b: bizOf(g, a) }
}

function staff(skill: number): KeyStaff {
  return { id: 'key1', firstName: 'Alex', lastName: 'Lee', gender: 'female', age: 40, role: 'Risk Officer', focus: 'quality', skill, salary: 80_000, trait: 'loyal', morale: 90, years: 4 }
}

function walk(g: GameState, nodes: MenuNode[], depth = 0): void {
  for (const n of nodes) {
    n.visible?.(g)
    if (n.type === 'info') { if (typeof n.text === 'function') n.text(g); continue }
    if (n.type === 'heading') continue
    if (typeof n.subtitle === 'function') n.subtitle(g)
    n.disabledReason?.(g)
    if (n.type === 'action') { n.confirm?.(g); n.input?.defaultValue?.(g) }
    else if (depth < 5) { n.header?.(g); walk(g, n.children(g), depth + 1) }
  }
}

describe('dedicated financial institutions', () => {
  it('starts segregated client books, not shareholder cash or goods', () => {
    for (const industry of ['investmentFirm', 'bank', 'onlineBank'] as const) {
      const { g, b } = institution(industry)
      const f = financeView(b)
      expect(b.cash).toBe(5_000_000)
      expect(initialProduction(g, b)).toBe(0)
      expect(b.products).toEqual([])
      expect(f.aum + f.deposits).toBeGreaterThan(0)
      if (industry !== 'investmentFirm') expect(f.reserves + f.loanBook + f.bonds).toBeCloseTo(f.deposits, 5)
      const value = valuationOf(b)
      f.aum *= 20; f.deposits *= 20; f.loanBook *= 20; f.bonds *= 20; f.reserves *= 20
      saveFinance(b, f)
      expect(valuationOf(b)).toBe(value)
    }
  })

  it('scales the initial client economy locally and gates online banks by era', () => {
    const poor = institution('bank', 'ng'), rich = institution('bank', 'us')
    expect(financeView(poor.b).deposits).toBeLessThan(financeView(rich.b).deposits)
    const { g } = rich
    expect(financeEraBlock(g, 'onlineBank', 'us', 1980)).toBeTruthy()
    expect(financeEraBlock(g, 'onlineBank', 'us', 2026)).toBeNull()
    expect(financeEraBlock(g, 'bank', 'us', 1800)).toBeNull()
  })

  it('normalizes malformed partial finance saves without exposing client principal', () => {
    const { b } = institution('bank')
    b.financeFirm = { deposits: 1_000_000, loanBook: 3_000_000, bonds: -10, reserves: 'bad', controls: Infinity, reserveRatio: -5, lastYear: NaN } as unknown as Json
    const before = JSON.stringify(b)
    const f = financeView(b)
    expect(JSON.stringify(b)).toBe(before)
    expect(f.reserves + f.loanBook + f.bonds).toBeCloseTo(f.deposits, 5)
    expect(f.reserveRatio).toBe(.1)
    expect(f.controls).toBe(50)
    expect(f.lastYear).toBe(-1)
    for (const v of Object.values(f)) if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true)
  })

  it('pays fees or interest only, keeps balanced customer liabilities, and books costs once', () => {
    for (const industry of ['investmentFirm', 'bank', 'onlineBank'] as const) {
      const { g, b } = institution(industry)
      b.yearCosts = 20_000; b.cash -= b.yearCosts
      const cash = b.cash
      const res = simulateFinanceYear(g, b, g.year, 30_000)
      const f = financeView(b)
      expect(res.stmt.revenue).toBeLessThan(10_000_000)
      expect(b.cash).toBe(cash + res.stmt.net + 20_000)
      expect(res.stmt.ownerPay).toBe(30_000)
      expect(b.production).toBe(0)
      expect(b.inventory).toBe(0)
      expect(res.market).toBeNull()
      if (industry !== 'investmentFirm') expect(f.reserves + f.loanBook + f.bonds).toBeCloseTo(f.deposits, 5)
      const settled = JSON.stringify(b)
      simulateFinanceYear(g, b, g.year, 30_000)
      expect(JSON.stringify(b)).toBe(settled)
    }
  })

  it('has skill-dependent performance and still permits losing market years', () => {
    let lowDefaults = 0, highDefaults = 0, lowReturns = 0, highReturns = 0, losses = 0
    for (let i = 0; i < 40; i++) {
      const low = institution('bank'), high = institution('bank')
      low.g.lifeId = high.g.lifeId = `finance-comparison-${i}`
      low.b.staff = [staff(20)]; high.b.staff = [staff(95)]
      expect(financeTeamSkill(high.g, high.b)).toBeGreaterThan(financeTeamSkill(low.g, low.b))
      simulateFinanceYear(low.g, low.b, 2026, 0); simulateFinanceYear(high.g, high.b, 2026, 0)
      lowDefaults += financeView(low.b).lastDefaults; highDefaults += financeView(high.b).lastDefaults
      const cheap = institution(), expert = institution()
      cheap.g.lifeId = expert.g.lifeId = `finance-comparison-${i}`
      cheap.b.staff = [staff(20)]; expert.b.staff = [staff(95)]
      simulateFinanceYear(cheap.g, cheap.b, 2026, 0); simulateFinanceYear(expert.g, expert.b, 2026, 0)
      lowReturns += financeView(cheap.b).lastReturn; highReturns += financeView(expert.b).lastReturn
      if (financeView(expert.b).lastReturn < 0) losses++
    }
    expect(highDefaults).toBeLessThan(lowDefaults)
    expect(highReturns).toBeGreaterThan(lowReturns)
    expect(losses).toBeGreaterThan(0)
  })

  it('requires Inventor talent and own company funds, completes in two fiscal years, and decays', () => {
    const { g, a, b } = institution()
    expect(financeAlgoBlock(g, b)).toMatch(/Inventor/)
    g.character.talent = 'Inventor'
    expect(financeAlgoBlock(g, b)).toBeNull()
    const cash = b.cash, clients = financeView(b).aum
    researchFinanceAlgorithm(g, a.id)
    let live = bizOf(g, a)
    expect(live.cash).toBe(cash - financeAlgoCost(live))
    expect(financeView(live).aum).toBe(clients)
    researchFinanceAlgorithm(g, a.id)
    expect(bizOf(g, a).cash).toBe(live.cash)
    live = bizOf(g, a)
    simulateFinanceYear(g, live, 2026, 0)
    expect(financeView(live).algoProgress).toBe(1)
    expect(financeView(live).algoEdge).toBe(0)
    simulateFinanceYear(g, live, 2027, 0)
    expect(financeView(live).algoResearching).toBe(false)
    expect(financeView(live).algoEdge).toBeGreaterThan(0)
    expect(financeAlgoBlock(g, live)).toMatch(/six years/)
    for (let y = 2028; y <= 2032; y++) simulateFinanceYear(g, live, y, 0)
    expect(financeView(live).algoEdge).toBe(0)
  })

  it('cannot turn repeated policy or outreach clicks into earnings and ignores stale actions', () => {
    const { g, a, b } = institution()
    const cash = b.cash, personal = g.character.money
    setFinancePolicy(g, a.id, 'fees', .03)
    setFinancePolicy(g, a.id, 'fees', NaN)
    expect(financeView(readBiz(g, a)).feeRate).toBe(.03)
    expect(readBiz(g, a).cash).toBe(cash)
    attractFinanceClients(g, a.id)
    const after = readBiz(g, a).cash
    attractFinanceClients(g, a.id)
    expect(readBiz(g, a).cash).toBe(after)
    expect(after).toBeLessThan(cash)
    expect(g.character.money).toBe(personal)
    const saved = structuredClone(a)
    g.assets = []
    setFinancePolicy(g, a.id, 'fees', .005)
    researchFinanceAlgorithm(g, a.id)
    expect(a).toEqual(saved)
  })

  it('keeps financial menus pure and prevents high-rated CEOs planning manufactured units', () => {
    const { g, a, b } = institution('bank')
    const before = JSON.stringify(g)
    walk(g, financeNodes(g, a))
    walk(g, financeNodes(g, a))
    expect(JSON.stringify(g)).toBe(before)
    b.ceo = 'manager'
    b.manager = { firstName: 'Alex', lastName: 'Lee', gender: 'female', skill: 95, salary: 150_000, since: g.year }
    executiveOperations(g, b, 2026, a.id)
    expect(b.production).toBe(0)
    expect(b.price).toBe(0)
  })

  it('cannot pay an owner salary twice when the annual hook is retried', () => {
    const { g, a } = institution('bank')
    const b = bizOf(g, a)
    becomeCeo(g, a, b)
    bizOf(g, a).ownerSalary = 40_000
    g.year = 2027; g.character.age = 31
    yearlyBusinessImpl(g)
    const money = g.character.money, cash = readBiz(g, a).cash
    expect(financeView(readBiz(g, a)).lastYear).toBe(2026)
    yearlyBusinessImpl(g)
    expect(g.character.money).toBe(money)
    expect(readBiz(g, a).cash).toBe(cash)
  })

  it('never pays client capital out through liquidation, bankruptcy, IPO, shares or group treasury', () => {
    const x = institution('bank'), y = institution('bank')
    const customer = financeView(y.b)
    customer.deposits *= 50; customer.loanBook *= 50; customer.reserves *= 50; customer.bonds *= 50
    saveFinance(y.b, customer)
    const member = (z: typeof x) => ({ a: z.a, b: z.b, m: { own: 1 } }) as GroupMember
    expect(movableCash(x.g, member(x))).toBe(movableCash(y.g, member(y)))
    const beginning = x.g.character.money
    closeBusiness(x.g, x.a, x.b, 100_000); closeBusiness(y.g, y.a, y.b, 100_000)
    expect(x.g.character.money).toBe(beginning + 5_100_000)
    expect(y.g.character.money).toBe(x.g.character.money)
    const bankrupt = institution('bank'), before = bankrupt.g.character.money
    declareBankruptcy(bankrupt.g, bankrupt.a, bankrupt.b, 'Testing:')
    expect(bankrupt.g.character.money).toBe(before)
    const listed = institution('bank'), hugeClients = institution('bank')
    const f = financeView(hugeClients.b)
    f.deposits *= 50; f.loanBook *= 50; f.reserves *= 50; f.bonds *= 50
    saveFinance(hugeClients.b, f)
    goPublic(listed.g, listed.a, listed.b); goPublic(hugeClients.g, hugeClients.a, hugeClients.b)
    expect(hugeClients.a.value).toBe(listed.a.value) // estate/inheritance carries only Asset.value
    expect(hugeClients.b.cash).toBe(listed.b.cash)
    sellShares(listed.g, listed.a, listed.b, .25); sellShares(hugeClients.g, hugeClients.a, hugeClients.b, .25)
    expect(hugeClients.g.character.money).toBe(listed.g.character.money)
  })

  it('a closed institution generates no fee/interest revenue', () => {
    for (const industry of ['investmentFirm', 'bank'] as const) {
      const { g, b } = institution(industry)
      b.openFraction = 0
      expect(normalizeBiz(b as unknown as Record<string, Json>, g.year).openFraction).toBe(0)
      expect(simulateFinanceYear(g, b, g.year, 0).stmt.revenue).toBe(0)
    }
  })

  it('round-trips its client books, settings, research and fiscal guard as JSON', () => {
    const { g, a, b } = institution('bank')
    setFinancePolicy(g, a.id, 'reserves', .4)
    g.character.talent = 'Inventor'
    researchFinanceAlgorithm(g, a.id)
    simulateFinanceYear(g, b, 2026, 0)
    const restored = JSON.parse(JSON.stringify(g)) as GameState
    const loaded = bizOf(restored, restored.assets[0])
    expect(financeView(loaded)).toEqual(financeView(b))
    const before = JSON.stringify(restored)
    simulateFinanceYear(restored, loaded, 2026, 0)
    expect(JSON.stringify(restored)).toBe(before)
  })
})
