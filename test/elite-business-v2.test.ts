import { describe, expect, it } from 'vitest'
import { makeTestGame } from './helpers'
import { installManager, managerCandidate } from '../src/game/business/career'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { readBank } from '../src/game/business/bank-state'
import { capacityFactor } from '../src/game/business/fund-model'
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
  it('scales a manager’s edge down above capacity instead of printing unlimited client returns', () => {
    const { b } = company('investmentFirm')
    const small = capacityFactor(5e7, 95, b), huge = capacityFactor(1e14, 95, b)
    expect(small).toBe(1)
    expect(huge).toBeGreaterThanOrEqual(0)
    expect(huge).toBeLessThan(small / 100)
    expect(capacityFactor(1e14, 100, b)).toBeLessThan(.01)
  })
})
