// The year card's money line says what inflation took from held cash that year ("... Cash $19.5B. Inflation took $480M."), so a bank
// that shrinks every birthday has its reason beside it, not only once in the log (finance.ts sayInflationLoss). The clause is added
// only for a loss worth a line, and a line without it is exactly what it was.
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { bindMoneyContext, shortMoney } from '../src/game/core'
import { buildCard, moneyFacts, moneyLine } from '../src/game/hubs/year-plan'
import { createNewLife } from '../src/game/life'
import type { GameState } from '../src/game/types'
import '../src/game/menus'
import { findSeed } from './seed-kit'
import { unitFlags } from '../scripts/voice/rules.mjs'

const DASHES = /[–—]/

function prng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function adultWith(money: number, seed: number, year = 2030): GameState {
  const g = createNewLife({ seed, year: year - 30, countryId: 'us' })
  g.queue = []
  g.character.age = 30
  g.year = year
  g.character.money = money
  bindMoneyContext(g)
  return g
}

// Any adult who lives through the year: the test is about the bank, not about who owns it.
const seed = findSeed(
  (s) => {
    const g = adultWith(10e9, s)
    ageUp(g)
    return g.character.alive
  },
  { label: 'an adult who lives through the year (card)' },
)

describe('moneyLine with the year\'s inflation', () => {
  const f = { cash: 8_400_000, netWorth: 52_300_000, delta: 4_100_000, income: 1_200_000 }
  const plain = `Net worth ${shortMoney(52_300_000)} (up ${shortMoney(4_100_000)}). Income ${shortMoney(1_200_000)}. Cash ${shortMoney(8_400_000)}.`

  it('adds the loss after the cash, and leaves a line without one exactly as it was', () => {
    expect(moneyLine({ ...f, inflation: 480_000 })).toBe(`${plain} Inflation took ${shortMoney(480_000)}.`)
    expect(moneyLine(f)).toBe(plain)
    expect(moneyLine({ ...f, inflation: 0 })).toBe(plain)
    expect(moneyLine({ ...f, inflation: -5 })).toBe(plain)
    expect(moneyLine({ ...f, inflation: Number.NaN })).toBe(plain)
  })

  it('drops the income, then the move, before it drops the loss', () => {
    const big = { cash: 19_500_000_000_000, netWorth: 22_100_000_000_000, delta: 1_300_000_000_000, income: 4_100_000_000_000, inflation: 480_000_000_000 }
    const line = moneyLine(big)
    expect(line.length).toBeLessThanOrEqual(90)
    expect(line).toContain('Inflation took')
    expect(line).toMatch(/^Net worth /)
    expect(line).toContain('Cash ')
  })

  it('stays within 90 characters and under every voice cap for any figure', () => {
    const r = prng(11)
    for (let i = 0; i < 400; i++) {
      const mag = 10 ** Math.floor(r() * 30)
      const pick = () => Math.round((r() * 2 - 0.5) * mag)
      const line = moneyLine({ cash: pick(), netWorth: pick(), delta: pick(), income: pick(), inflation: Math.abs(pick()) + 1 })
      expect(line.length, line).toBeLessThanOrEqual(90)
      expect(unitFlags(line, 'log'), line).not.toContain('over-cap')
      expect(line, line).not.toMatch(DASHES)
      expect(line).toMatch(/^Net worth /)
    }
  })
})

describe('moneyFacts reads the year\'s inflation from the flag finance.ts keeps', () => {
  it('after a rich life ages, the facts carry the loss and the line says it', () => {
    const g = adultWith(10e9, seed)
    ageUp(g)
    const facts = moneyFacts(g)!
    expect(facts.inflation).toBeGreaterThan(10_000)
    expect(moneyLine(facts)).toContain(`Inflation took ${shortMoney(facts.inflation!)}.`)
    expect('money' in buildCard(g, [], [], [])).toBe(true)
    expect(buildCard(g, [], [], []).money).toContain('Inflation took')
  })

  it('is told every year, not once: the second year says it too', () => {
    const g = adultWith(10e9, seed)
    ageUp(g)
    g.queue = []
    ageUp(g)
    expect(moneyFacts(g)!.inflation).toBeGreaterThan(10_000)
    expect(buildCard(g, [], [], []).money).toContain('Inflation took')
  })

  it('says nothing for a small loss, and nothing for a loss from another year', () => {
    const poor = adultWith(20_000, seed)
    ageUp(poor)
    expect(moneyFacts(poor)!.inflation).toBeUndefined()
    expect(buildCard(poor, [], [], []).money ?? '').not.toContain('Inflation')

    const g = adultWith(10e9, seed)
    ageUp(g)
    g.flags.inflationLoss = [g.year - 3, 9_999_999]
    expect(moneyFacts(g)!.inflation).toBeUndefined()
    g.flags.inflationLoss = 'garbage'
    expect(moneyFacts(g)!.inflation).toBeUndefined()
    g.flags.inflationLoss = [g.year, -4]
    expect(moneyFacts(g)!.inflation).toBeUndefined()
  })
})
