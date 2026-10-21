// R0-3 (owner decision D28): no CEO rating mints money. The old "perfect foresight" rule grossed a
// 100-rated manager's firm up to a target every year it would have missed it, straight into other
// income and company cash. These runs pin that every dollar a firm's cash moves is a dollar its
// statement booked, and that nothing is ever described as strategic trading income.
import { describe, expect, it } from 'vitest'
import { makeTestGame } from './helpers'
import { installManager, managerCandidate } from '../src/game/business/career'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { bizOf, findBusiness, readBiz } from '../src/game/business/state'
import { statementLines, yearlyBusinessImpl } from '../src/game/business/yearly'
import type { Industry } from '../src/game/data/markets'

// Deep-tech firms (semiconductor, ...) also draw their own venture money in some years, so the cash
// identity below is checked on the other trades; test/elite-business-v2.test.ts covers all three engines.
const INDUSTRIES: Industry[] = ['manufacturing', 'gameStudio', 'solar', 'logistics']

function firm(i: number) {
  const g = makeTestGame(900 + i, { age: 40, money: 0 })
  const b0 = newBiz(g, INDUSTRIES[i % INDUSTRIES.length], 'us', 'Chicago', { cash: 20e6, founded: g.year - 5, valuation: 25e6, quality: 80, morale: 90 })
  installManager(g, b0, managerCandidate(g, b0, 100)); b0.manager!.equity = .1
  const a = createBusinessAsset(g, `Mint ${i}`, b0, 1e6)
  g.assets.push(a)
  const b = bizOf(g, a)
  // Half-a-year's-worth interest on every dollar of debt, from a small loan to a crushing one.
  b.debt = (i + 1) * 20e6; b.debtRate = .5
  return { g, a }
}

describe('no CEO mints money', () => {
  it('twenty seeded firms with a skill-100 manager and 50% debt book what the books say for five years', () => {
    let losses = 0, exact = 0
    for (let i = 0; i < 20; i++) {
      const { g, a } = firm(i)
      for (let y = 0; y < 5; y++) {
        g.year++; g.character.age++
        if (!findBusiness(g, a.id)) break
        const live = bizOf(g, a), cash = live.cash, debt = live.debt
        yearlyBusinessImpl(g)
        const after = readBiz(g, a), at = `firm ${i} year ${y}`
        expect(after.last!.strategicIncome, at).toBeUndefined()
        expect(statementLines(after, after.last!).map(l => l.label).join('|'), at).not.toMatch(/foresight|strategic/i)
        const moved = after.cash - cash, net = after.last!.net
        // No dollar appears that the statement did not book: cash rises by the net profit, or by new borrowing.
        expect(moved, at).toBeLessThanOrEqual(net + Math.max(0, after.debt - debt) + 1)
        if (net < 0) losses++
        // A loss-making year that leaves the debt alone moves cash by exactly the booked net.
        if (net < 0 && after.debt === debt) { expect(moved, at).toBeCloseTo(net, -1); exact++ }
      }
      const lines = g.log.flatMap(year => year.entries.map(e => e.text))
      expect(lines.filter(t => /strategic trading/i.test(t)), `firm ${i}`).toEqual([])
    }
    // The scenario really does lose money: the old rule would have refilled almost every one of these years.
    expect(losses).toBeGreaterThan(60)
    expect(exact).toBeGreaterThan(60)
  }, 120_000)

  it('still reads and shows the strategic income row of a statement saved by v4.0.2', () => {
    const { g, a } = firm(0)
    g.year++; g.character.age++
    yearlyBusinessImpl(g)
    const live = bizOf(g, a)
    live.last = { ...live.last!, otherIncome: live.last!.otherIncome + 1_000_000, strategicIncome: 1_000_000 }
    const saved = JSON.parse(JSON.stringify(g))
    const restored = readBiz(saved, saved.assets[0])
    expect(restored.last!.strategicIncome).toBe(1_000_000)
    expect(statementLines(restored, restored.last!).some(l => /strategic trading income/.test(l.label))).toBe(true)
  })
})
