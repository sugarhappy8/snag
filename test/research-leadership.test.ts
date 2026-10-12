import { describe, expect, it } from 'vitest'
import { makeTestGame } from './helpers'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { managerCandidate } from '../src/game/business/career'
import { bizOf, type KeyStaff } from '../src/game/business/state'
import { financeTeamSkill, simulateFinanceYear } from '../src/game/business/finance-legacy'
import { financeView, saveFinance } from '../src/game/business/finance-firm-state'
import { appealOf, costFactor, planFor } from '../src/game/business/economy'
import { leadershipPower } from '../src/game/business/leadership'
import type { Industry } from '../src/game/data/markets'

function company(industry: Industry = 'investmentFirm') {
  const g = makeTestGame(77, { age: 25, money: 1e9, talents: ['Inventor'] })
  const a = createBusinessAsset(g, 'Research Company', newBiz(g, industry, 'us', 'Chicago', { cash: 1e9 }), 1e9)
  g.assets.push(a)
  const b = bizOf(g, a); b.ceo = 'manager'; b.manager = managerCandidate(g, b, 90)
  return { g, a, b }
}
function leader(focus: KeyStaff['focus'], skill = 95): KeyStaff {
  return { id: focus, firstName: 'Skilled', lastName: 'Leader', gender: 'female', age: 40, role: focus, focus, skill, salary: 80000, trait: 'steady', morale: 90, years: 3 }
}

describe('leadership affects operations', () => {
  it('makes sales and operations materially affect demand, capacity and cost', () => {
    const { g, b } = company('manufacturing'), base = structuredClone(b)
    b.staff = [leader('sales')]
    expect(appealOf(g, b, g.year)).toBeGreaterThan(appealOf(g, base, g.year) * 1.12)
    b.staff = [leader('ops')]
    expect(planFor(g, b, g.year).capacity).toBeGreaterThan(planFor(g, base, g.year).capacity * 1.15)
    expect(costFactor(b)).toBeLessThan(costFactor(base) * .94)
  })
  it('gives every additional leader a contribution and makes morale and skill matter', () => {
    const { b } = company()
    b.staff = ['a', 'b', 'c'].map(id => ({ ...leader('finance'), id }))
    const before = leadershipPower(b, 'finance')
    b.staff.push({ ...leader('finance'), id: 'd' })
    expect(leadershipPower(b, 'finance')).toBeGreaterThan(before)
    const strong = leadershipPower(b, 'finance')
    b.staff[0].morale = 10
    expect(leadershipPower(b, 'finance')).toBeLessThan(strong)
    const lowMorale = leadershipPower(b, 'finance')
    b.staff[0].skill = 10
    expect(leadershipPower(b, 'finance')).toBeLessThan(lowMorale)
  })
  it('makes specialists matter alongside an elite CEO and keeps client funds separate', () => {
    const { g, b } = company('bank'), baseline = structuredClone(b)
    b.staff = [leader('finance'), leader('quality'), leader('ops'), leader('sales')]
    expect(financeTeamSkill(g, b)).toBeGreaterThan(financeTeamSkill(g, baseline))
    const books = financeView(b); books.controls = 75; saveFinance(b, books)
    const result = simulateFinanceYear(g, b, g.year, 0), f = financeView(b)
    expect(f.reserves + f.loanBook + f.bonds).toBeCloseTo(f.deposits, 2)
    expect(Number.isFinite(result.stmt.net)).toBe(true)
    expect(g.character.money).toBe(1e9)
  })
})
