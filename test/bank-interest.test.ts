// Cash in the bank earns interest (investments.ts payBankInterest, called from ageUp). It behaves like a nominal deposit: the year's
// inflation divides what is held (cash.ts erodeCash) and the interest is added at rate / (1 + inflation), so the balance ends the year
// at (1 + rate) / (1 + inflation) of what it began, less the tax on the interest. The rate is a third of the savings rate: a current
// account pays less than a savings one, and Savings stays the better place for money you do not need.
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { bindMoneyContext } from '../src/game/core'
import { economyOf } from '../src/game/economy'
import { bankCashRate, liveDepositRate, payBankInterest } from '../src/game/investments'
import { createNewLife } from '../src/game/life'
import type { GameState, LogEntry } from '../src/game/types'
import '../src/game/menus'
import { findSeed } from './seed-kit'

function adultWith(money: number, seed: number, year = 2030, countryId = 'us'): GameState {
  const g = createNewLife({ seed, year: year - 30, countryId })
  g.queue = []
  g.character.age = 30
  g.year = year
  g.character.money = money
  bindMoneyContext(g)
  return g
}

const seed = findSeed(
  (s) => {
    const g = adultWith(10e9, s)
    ageUp(g)
    return g.character.alive
  },
  { label: 'an adult who lives through the year (interest)' },
)

const lines = (g: GameState): LogEntry[] => g.log.flatMap((y) => y.entries)

describe('bankCashRate', () => {
  it('is a third of the savings rate, and never negative', () => {
    const g = adultWith(1_000_000, seed)
    ageUp(g)
    const savings = liveDepositRate(g, g.character.countryId, 'savings')
    expect(savings).toBeGreaterThan(0)
    expect(bankCashRate(g)).toBeCloseTo(savings / 3, 12)
    expect(bankCashRate(g)).toBeGreaterThanOrEqual(0)
  })
})

describe('payBankInterest', () => {
  it('pays the rate on what was held, less the year\'s inflation, as taxable income', () => {
    const g = adultWith(1_000_000, seed)
    ageUp(g)
    g.queue = []
    const rate = bankCashRate(g)
    const taxable = Number(g.flags.taxableIncome ?? 0)
    const before = g.character.money
    const paid = payBankInterest(g, 1_000_000, 0.03)
    expect(paid).toBe(Math.round((1_000_000 * rate) / 1.03))
    expect(paid).toBeGreaterThan(0)
    expect(g.character.money).toBe(before + paid)
    expect(Number(g.flags.taxableIncome ?? 0)).toBe(taxable + paid)
  })

  it('pays nothing on an empty or overdrawn account, or on a number that is not one', () => {
    const g = adultWith(1_000_000, seed)
    ageUp(g)
    g.queue = []
    const money = g.character.money
    for (const held of [0, -5_000, Number.NaN, Number.POSITIVE_INFINITY]) expect(payBankInterest(g, held, 0.03)).toBe(0)
    expect(payBankInterest(g, 1_000_000, Number.NaN)).toBe(0)
    expect(payBankInterest(g, 1_000_000, -1)).toBe(0)
    expect(g.character.money).toBe(money)
  })
})

describe('the year at the bank', () => {
  it('ends with more than inflation alone would leave, because the cash earned something', () => {
    const g = adultWith(10e9, seed)
    const before = g.character.money
    ageUp(g)
    const inflation = economyOf(g).inflation
    expect(inflation).toBeGreaterThan(0)
    // Erosion alone would leave before / (1 + inflation); the other flows of a year are a rounding error beside $10B.
    expect(g.character.money).toBeGreaterThan(before / (1 + inflation))
  })

  it('tells the player once that the bank pays only so much on it', () => {
    const g = adultWith(10e9, seed)
    ageUp(g)
    const told = lines(g).filter((e) => e.id.startsWith('infl-'))
    expect(told).toHaveLength(1)
    expect(told[0]!.text).toMatch(/pays only \d+(\.\d+)?%/)
    expect(told[0]!.text).not.toMatch(/earns nothing/)
  })
})
