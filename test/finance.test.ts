import { describe, expect, it } from 'vitest'
import { addLoan, annualPayment, creditScore, effectiveTaxRate, incomeTax, livingCost, residenceText, taxAdditionalIncome, yearlyFinance } from '../src/game/finance'
import { createPerson } from '../src/game/people'
import type { GameState, Job } from '../src/game/types'
import { makeTestGame } from './helpers'

function job(salary: number): Job {
  return { defId: 'test', title: 'Tester', company: 'Test Co', category: 'fulltime', salary, level: 0, performance: 60, yearsInRole: 1, yearsAtCompany: 1, data: {} }
}

function adult(money = 0, age = 30): GameState {
  return makeTestGame(3, { age, money })
}

function logText(g: GameState): string[] {
  return g.log.flatMap((y) => y.entries.map((e) => e.text))
}

describe('income tax', () => {
  it('is zero on no income and progressive on more income', () => {
    expect(incomeTax('us', 0)).toBe(0)
    const low = effectiveTaxRate('us', 30_000)
    const mid = effectiveTaxRate('us', 90_000)
    const high = effectiveTaxRate('us', 1_000_000)
    expect(low).toBeGreaterThan(0)
    expect(mid).toBeGreaterThan(low)
    expect(high).toBeGreaterThan(mid)
    expect(high).toBeLessThan(0.5)
  })
  it('is roughly realistic for an average US salary', () => {
    const rate = effectiveTaxRate('us', 60_000)
    expect(rate).toBeGreaterThan(0.1)
    expect(rate).toBeLessThan(0.25)
  })
  it('has tax havens and lighter taxes in poorer places', () => {
    expect(incomeTax('ae', 500_000)).toBe(0)
    expect(incomeTax('mc', 2_000_000)).toBe(0)
    // Unknown country ids fall back to a wealth-scaled generic table.
    expect(incomeTax('zz-unknown', 50_000)).toBeGreaterThan(0)
    expect(effectiveTaxRate('in', 20_000)).toBeLessThan(effectiveTaxRate('fr', 20_000) + 0.2)
  })
})

describe('yearlyFinance', () => {
  it('taxes this year’s income and logs it', () => {
    const g = adult(100_000)
    createPerson(g, { relation: 'parent', age: 60, relationship: 80 }) // lives at home: no living costs
    g.flags.taxableIncome = 80_000
    const tax = incomeTax('us', 80_000)
    yearlyFinance(g)
    expect(tax).toBeGreaterThan(5_000)
    expect(g.character.money).toBe(100_000 - tax)
    expect(g.flags.taxesPaid).toBe(tax)
    expect(logText(g).some((t) => t.includes('tax'))).toBe(true)
  })

  it('charges rent and living costs to independent adults only', () => {
    const kid = makeTestGame(1, { age: 10, money: 500 })
    yearlyFinance(kid)
    expect(kid.character.money).toBe(500)

    const g = adult(50_000)
    g.character.residence = { status: 'renting', rent: 12_000, description: 'a studio apartment in Riverside' }
    const living = livingCost(g)
    expect(living).toBeGreaterThan(0)
    yearlyFinance(g)
    expect(g.character.money).toBeLessThanOrEqual(50_000 - 12_000 - Math.round(living * 0.9))
    expect(g.character.money).toBeGreaterThanOrEqual(50_000 - 12_000 - Math.round(living * 1.1) - 1)
    expect(residenceText(g)).toContain('$1,000/month')
  })

  it('pays loans with interest and removes them when paid off', () => {
    const g = adult(100_000)
    const loan = addLoan(g, { kind: 'personal', lender: 'Bank', principal: 10_000, rate: 0.1, years: 2 })
    expect(loan.yearlyPayment).toBe(annualPayment(10_000, 0.1, 2))
    yearlyFinance(g)
    expect(g.character.loans).toHaveLength(1)
    expect(g.character.loans[0].balance).toBeLessThan(10_000)
    yearlyFinance(g)
    expect(g.character.loans).toHaveLength(0)
    expect(g.queue.some((m) => m.kind === 'notice' && m.title === 'Debt Free!')).toBe(true)
  })

  it('defers student loans while still in school', () => {
    const g = adult(5_000, 20)
    g.character.residence = { status: 'dorm' }
    g.character.education.current = { level: 'university', school: 'U', year: 2, totalYears: 4, grades: 70, data: {} }
    addLoan(g, { kind: 'student', lender: 'Federal Student Aid', principal: 20_000, rate: 0.05, years: 10 })
    yearlyFinance(g)
    expect(g.character.money).toBe(5_000)
    expect(g.character.loans[0].balance).toBe(21_000)
  })

  it('records missed payments and repossesses a car after two misses', () => {
    const g = adult(0)
    const loan = addLoan(g, { kind: 'car', lender: 'Auto Finance', principal: 20_000, rate: 0.07, years: 5 })
    g.assets.push({ id: 'car1', kind: 'car', name: '2026 Honda Civic', emoji: '🚗', purchasePrice: 22_000, value: 20_000, condition: 100, purchasedAge: 30, upkeep: 0, details: { loanId: loan.id } })
    yearlyFinance(g)
    expect(g.character.loans).toHaveLength(1)
    expect(g.flags.missedPayments).toBe(1)
    const beforeAuction = loan.balance
    yearlyFinance(g)
    expect(g.character.loans).toHaveLength(1)
    expect(loan.balance).toBeGreaterThan(0)
    expect(loan.balance).toBeLessThan(beforeAuction)
    expect(g.flags.creditDefaults).toBe(1)
    expect(g.assets).toHaveLength(0)
    expect(g.queue.some((m) => m.kind === 'notice' && m.title === 'Repossessed!')).toBe(true)
  })

  it('repossesses a financed boat, but a loan on a stolen car stays with you', () => {
    const g = adult(0)
    const boatLoan = addLoan(g, { kind: 'personal', lender: 'Marine Credit', principal: 50_000, rate: 0.08, years: 5 })
    const carLoan = addLoan(g, { kind: 'car', lender: 'Auto Finance', principal: 20_000, rate: 0.07, years: 5 })
    g.assets.push({ id: 'boat1', kind: 'boat', name: 'Speedboat', emoji: '🚤', purchasePrice: 60_000, value: 55_000, condition: 100, purchasedAge: 30, upkeep: 0, details: { loanId: boatLoan.id } })
    yearlyFinance(g)
    yearlyFinance(g)
    expect(g.assets).toHaveLength(0)
    expect(g.character.loans.map((l) => l.id)).toEqual([boatLoan.id, carLoan.id])
    expect(boatLoan.balance).toBeLessThan(50000)
    expect(carLoan.balance).toBeGreaterThan(20000)
  })

  it('evicts broke renters to homelessness after two years of debt', () => {
    const g = adult(0)
    g.character.residence = { status: 'renting', rent: 15_000, description: 'a 1-bedroom apartment in Midtown' }
    yearlyFinance(g)
    expect(g.character.money).toBeLessThan(0)
    expect(g.character.residence.status).toBe('renting')
    expect(g.queue.some((m) => m.kind === 'notice' && m.title === 'Debt Collectors')).toBe(true)
    yearlyFinance(g)
    expect(g.character.residence.status).toBe('homeless')
    expect(g.queue.some((m) => m.kind === 'notice' && m.title === 'Evicted!')).toBe(true)
    const happy = g.character.stats.happiness
    yearlyFinance(g)
    expect(g.character.stats.happiness).toBeLessThan(happy)
  })

  it('lets a welcoming parent take you in after an eviction', () => {
    const g = adult(0)
    createPerson(g, { relation: 'parent', age: 60, relationship: 90, money: 0 })
    g.character.residence = { status: 'renting', rent: 15_000 }
    g.flags.brokeYears = 1
    yearlyFinance(g)
    expect(g.character.residence.status).toBe('parents')
  })

  it('seizes belongings after three broke years', () => {
    const g = adult(-50_000)
    g.flags.brokeYears = 2
    g.assets.push({ id: 'w', kind: 'other', name: 'Luxury Watch', emoji: '⌚', purchasePrice: 30_000, value: 30_000, condition: 100, purchasedAge: 25, upkeep: 0, details: { category: 'luxury' } })
    yearlyFinance(g)
    expect(g.assets).toHaveLength(0)
    expect(g.character.money).toBeGreaterThan(-50_000)
  })

  it('taxes extra income at the marginal rate', () => {
    const g = adult(0)
    g.character.job = job(80_000)
    g.flags.taxableIncome = 100_000
    const extra = taxAdditionalIncome(g, 20_000)
    expect(extra).toBe(incomeTax('us', 100_000) - incomeTax('us', 80_000))
    expect(g.character.money).toBe(-extra)
  })

  it('computes a credit score in range', () => {
    const g = adult(100_000)
    g.character.job = job(70_000)
    const good = creditScore(g)
    expect(good).toBeGreaterThanOrEqual(300)
    expect(good).toBeLessThanOrEqual(850)
    g.flags.missedPayments = 5
    expect(creditScore(g)).toBeLessThan(good)
  })
})
