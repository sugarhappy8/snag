// Cross-feature contracts completed after the independent year-system modules landed.
import { afterEach, describe, expect, it } from 'vitest'
import { validateEffects } from '../src/ai/schemas'
import { buildCtx } from '../src/game/business/competition-core'
import { emptyMarket } from '../src/game/business/competition-state'
import { sellBusiness } from '../src/game/business/exit'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { bindMoneyContext, netWorth, setMoneyDisplay } from '../src/game/core'
import { yearlyHistory } from '../src/game/history/events'
import { exchangeInfo, fxYear, goldYear, indexMove, worldYear } from '../src/game/invest/engine'
import { timelineFamily } from '../src/game/timeMachine'
import { normalizeSettings } from '../src/settings'
import { makeTestGame } from './helpers'

afterEach(() => {
  bindMoneyContext(null)
  setMoneyDisplay({ mode: 'usd', nominal: false })
})

describe('year-system integration', () => {
  it('keeps fractional, negative and hyperinflated AI amounts until currency conversion', () => {
    expect(validateEffects({ money: 0.125 }).money).toBe(0.125)
    expect(validateEffects({ money: '-¥1,500.25' }).money).toBe(-1500.25)
    expect(validateEffects({ money: 'Rp 2.5M' }).money).toBe(2_500_000)
    expect(validateEffects({ money: 9e25 }).money).toBe(9e25)
    expect(validateEffects({ money: '-1.25e20' }).money).toBe(-1.25e20)
    expect(validateEffects({ money: '500 Kč' }).money).toBe(500)
    expect(validateEffects({ money: Infinity }).money).toBe(0)
  })

  it('normalizes the sandbox setting without turning old saves into unlimited games', () => {
    expect(normalizeSettings({}).sandboxTimeMachine).toBe(false)
    expect(normalizeSettings({ sandboxTimeMachine: 'true' }).sandboxTimeMachine).toBe(false)
    expect(normalizeSettings({ sandboxTimeMachine: true }).sandboxTimeMachine).toBe(true)
  })

  it('passes encoded timeline forks through the investment engine without rewriting quoted prices or history', () => {
    const g = makeTestGame(7)
    const base = 'integration-family'
    g.flags.timelineForks = [{ year: 2040, salt: 'abc123' }]
    const fam = timelineFamily(g, base)
    const ix = exchangeInfo('us')
    for (const y of [1999, 2000, 2001, 2002, 2039, 2040]) {
      expect(worldYear(fam, y)).toEqual(worldYear(base, y))
      expect(indexMove(fam, ix, y)).toEqual(indexMove(base, ix, y))
      expect(goldYear(fam, 2026, y)).toEqual(goldYear(base, 2026, y))
      expect(fxYear(fam, 'br', y)).toEqual(fxYear(base, 'br', y))
    }
    expect([2041, 2042, 2043].map((y) => worldYear(fam, y))).not.toEqual([2041, 2042, 2043].map((y) => worldYear(base, y)))
    expect(goldYear(fam, 2026, 2043)).not.toEqual(goldYear(base, 2026, 2043))
  })

  it('does not share a competition cache entry between divergent saves with the same revision', () => {
    const original = emptyMarket('world')
    Object.assign(original, { rev: 3, year: 2025, base: 0.1, edge: 1, edgeUntil: 2027 })
    const alternative = structuredClone(original)
    alternative.edge = 1.8
    const first = buildCtx('cache-family', 'aiLab', 'world', 2026, original, 1000, 10)
    alternative.gone = [first.rivals[0].id]
    const second = buildCtx('cache-family', 'aiLab', 'world', 2026, alternative, 1000, 10)
    expect(second.edge).toBe(1.8)
    expect(second.rivals.some((r) => r.id === first.rivals[0].id)).toBe(false)
    expect(buildCtx('cache-family', 'aiLab', 'world', 2026, original, 1000, 10)).toEqual(first)
  })

  it('retains the unpaid personal founding loan when a business sells below its balance', () => {
    const g = makeTestGame(3, { age: 30, money: 1000 })
    const b = newBiz(g, 'foodTruck', 'us', 'New York', { invested: 20_000, loanId: 'founding', share: 1 })
    const a = createBusinessAsset(g, 'Test Truck', b, 20_000)
    a.value = 5_000
    g.assets.push(a)
    g.character.loans.push({ id: 'founding', kind: 'business', lender: 'Test Bank', balance: 20_000, yearlyPayment: 2000, rate: 0.05 })
    const before = netWorth(g)
    sellBusiness(g, a, b, 5_000, 'a buyer')
    expect(g.character.money).toBe(1000)
    expect(g.character.loans[0].balance).toBe(15_000)
    expect(g.assets).not.toContain(a)
    expect(netWorth(g)).toBe(before)
    expect(g.queue.at(-1)).toMatchObject({ kind: 'notice', text: expect.stringContaining('You still owe') })
  })

  it('logs a currency change once without consuming IDs or random numbers', () => {
    const g = makeTestGame(1, { countryId: 'de', age: 0 })
    g.year = 2002
    g.log = [{ year: 2002, age: 0, entries: [] }]
    const rng = g.rng
    yearlyHistory(g)
    yearlyHistory(g)
    const entries = g.log[0].entries.filter((e) => e.id.startsWith('currency-'))
    expect(entries).toHaveLength(1)
    expect(entries[0].text).toMatch(/euro.*Deutsche mark.*1.95583/i)
    expect(g.rng).toEqual(rng)
  })
})
