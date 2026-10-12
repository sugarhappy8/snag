import { describe, expect, it } from 'vitest'
import { makeTestGame } from './helpers'
import { installManager, managerCandidate } from '../src/game/business/career'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { financeManagerTurn, financeNodes, financeQuantEdge, financeTeamSkill, simulateFinanceYear } from '../src/game/business/finance-legacy'
import { financeView, saveFinance } from '../src/game/business/finance-firm-state'
import { readBank } from '../src/game/business/bank-state'
import { executiveOperations } from '../src/game/business/executive'
import { settlePerfectForesight } from '../src/game/business/executive-foresight'
import { bizOf, readBiz } from '../src/game/business/state'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import { simulateYear } from '../src/game/business/economy'
import type { Industry } from '../src/game/data/markets'

function company(industry: Industry, skill = 95) {
  const g = makeTestGame(71, { age: 40, money: 0 })
  const b = newBiz(g, industry, 'us', 'Chicago', { cash: 20e6, founded: 2020, valuation: 25e6, quality: 80, morale: 90 })
  installManager(g, b, managerCandidate(g, b, skill)); b.manager!.equity = .1
  const a = createBusinessAsset(g, 'Elite Operations', b, 1e6)
  g.assets.push(a)
  return { g, a, b: bizOf(g, a) }
}

describe('elite CEO foresight', () => {
  it('makes 85+ operating execution materially stronger than ordinary CEOs', () => {
    const low = company('manufacturing', 70), high = company('manufacturing', 95)
    executiveOperations(low.g, low.b, 2025, low.a.id)
    executiveOperations(high.g, high.b, 2025, high.a.id)
    expect(high.b.brand).toBeGreaterThan(low.b.brand)
    expect(high.b.quality).toBeGreaterThan(low.b.quality)
    expect(high.b.production).toBeGreaterThan(0)
    expect(simulateYear(high.g, high.b, 2025, 0, 1).stmt.net).toBeGreaterThan(simulateYear(low.g, low.b, 2025, 0, 1).stmt.net)
  })

  // Investment firms and banks 2.0 removed perfect-foresight returns: see their guards below.
  it.each(['manufacturing', 'gameStudio', 'semiconductor'] as const)('guarantees a 100-rated %s CEO positive booked earnings, with taxable income and no duplicate settlement', industry => {
    const { g, a, b } = company(industry, 100)
    b.debt = 500e6; b.debtRate = .5; b.capacityLoss = .9; b.demandShock = .3
    yearlyBusinessImpl(g)
    const after = readBiz(g, a)
    expect(after.last!.net).toBeGreaterThan(0)
    expect(after.last!.strategicIncome).toBeGreaterThan(0)
    expect(after.last!.interest).toBeGreaterThan(0)
    expect(after.last!.corpTax).toBeGreaterThan(0)
    expect(after.last!.pbt - after.last!.corpTax).toBeCloseTo(after.last!.net, -1)
    expect(after.cash).toBeGreaterThanOrEqual(0)
    expect(g.character.money).toBe(0)
    const booked = JSON.stringify(g)
    yearlyBusinessImpl(g)
    expect(JSON.stringify(g)).toBe(booked)
    const restored = JSON.parse(booked)
    expect(readBiz(restored, restored.assets[0]).last!.strategicIncome).toBe(after.last!.strategicIncome)
  })

  it('gives a 100-rated investment-firm CEO no perfect-foresight top-up, and books the loss exactly once', () => {
    const { g, a, b } = company('investmentFirm', 100)
    b.debt = 500e6; b.debtRate = .5; b.capacityLoss = .9; b.demandShock = .3
    yearlyBusinessImpl(g)
    const after = readBiz(g, a)
    expect(after.last!.strategicIncome).toBe(0)
    expect(after.last!.net).toBeLessThan(0)
    expect(after.last!.interest).toBeGreaterThan(0)
    expect(after.last!.otherIncome).toBe(0)
    expect(g.character.money).toBe(0)
    const booked = JSON.stringify(g)
    yearlyBusinessImpl(g)
    expect(JSON.stringify(g)).toBe(booked)
  })

  it('gives a 100-rated bank CEO no perfect-foresight top-up: the bank earns what its books earn, booked once', () => {
    const { g, a, b } = company('bank', 100)
    b.debt = 500e6; b.debtRate = .5
    yearlyBusinessImpl(g)
    const after = readBiz(g, a)
    expect(after.last!.strategicIncome).toBe(0)
    expect(after.last!.net).toBeLessThan(0)
    expect(after.last!.interest).toBeGreaterThan(0)
    expect(after.last!.otherIncome).toBe(0)
    expect(readBank(after).last!.profit).toBe(after.last!.net)
    expect(g.character.money).toBe(0)
    const booked = JSON.stringify(g)
    yearlyBusinessImpl(g)
    expect(JSON.stringify(g)).toBe(booked)
  })

  it('keeps the perfect-income settlement exclusive to 100-rated hired CEOs', () => {
    const { g, b } = company('manufacturing', 99)
    b.debt = 1e9; b.debtRate = .5
    const s = simulateYear(g, b, 2025, 0, 1).stmt, cash = b.cash
    settlePerfectForesight(g, b, s)
    expect(b.cash).toBe(cash)
    expect(s.net).toBeLessThan(0)
    b.manager!.skill = 100
    settlePerfectForesight(g, b, s)
    expect(s.net).toBeGreaterThan(0)
    const final = JSON.stringify(b)
    settlePerfectForesight(g, b, s)
    expect(JSON.stringify(b)).toBe(final)
  })
})

describe('elite financial businesses', () => {
  it('gives Business talent an effective financial strategy action without click-generated money', () => {
    const { g, a, b } = company('investmentFirm', 50)
    b.ceo = 'owner'; b.manager = null; g.character.talent = 'Business'
    expect(financeTeamSkill(g, b)).toBeGreaterThan(90)
    const before = JSON.stringify(g), nodes = financeNodes(g, a)
    expect(JSON.stringify(g)).toBe(before)
    const action = nodes.find(n => n.type === 'action' && n.id.endsWith('.optimize'))!
    if (action.type !== 'action') throw new Error('Missing optimizer')
    action.run(g); action.run(g)
    const updated = readBiz(g, a), f = financeView(updated)
    expect(updated.cash).toBe(b.cash)
    expect(g.character.money).toBe(0)
    expect(f.tradingCapital).toBeGreaterThan(0)
    expect(f.researchBudget).toBeGreaterThan(0)
  })

  it('automatically funds quant research and trades real shareholder capital for strong returns', () => {
    const { g, b } = company('investmentFirm', 95)
    financeManagerTurn(g, b)
    const before = b.cash, f = financeView(b)
    f.researchQuality = 100; f.computing = 80; f.algoEdge = .9
    saveFinance(b, f)
    const result = simulateFinanceYear(g, b, 2025, 0), after = financeView(b)
    expect(after.lastReturn).toBeGreaterThan(.6)
    expect(after.lastTrading).toBeGreaterThan(1e6)
    expect(result.stmt.net).toBeGreaterThan(0)
    expect(b.cash).toBe(before + result.stmt.net)
    expect(after.lastResearch).toBeGreaterThan(0)
    const final = JSON.stringify(b)
    simulateFinanceYear(g, b, 2025, 0)
    expect(JSON.stringify(b)).toBe(final)
  })

  it('scales algorithm returns down above capacity instead of printing unlimited client principal', () => {
    const { g, b } = company('investmentFirm'), f = financeView(b)
    f.algoEdge = 1; f.researchQuality = 100
    saveFinance(b, f)
    const small = financeQuantEdge(g, b, 2025)
    f.aum = 1e14; saveFinance(b, f)
    expect(financeQuantEdge(g, b, 2025)).toBeLessThan(small / 1000)
  })

  it('elite bank management outperforms weak leadership without treating deposits as company cash', () => {
    let strong = 0, weak = 0, strongLosses = 0, weakLosses = 0
    for (let i = 0; i < 12; i++) {
      for (const rating of [40, 95]) {
        const { g, b } = company('bank', rating)
        g.lifeId = `bank-${i}`
        financeManagerTurn(g, b)
        const before = b.cash
        const result = simulateFinanceYear(g, b, 2025, 0), f = financeView(b)
        expect(b.cash).toBe(before + result.stmt.net)
        expect(f.reserves + f.loanBook + f.bonds).toBeCloseTo(f.deposits, 3)
        if (rating === 95) { strong += result.stmt.net; strongLosses += f.lastDefaults }
        else { weak += result.stmt.net; weakLosses += f.lastDefaults }
      }
    }
    expect(strong).toBeGreaterThan(weak)
    expect(strongLosses).toBeLessThan(weakLosses)
  })
})
