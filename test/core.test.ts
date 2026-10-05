import { describe, expect, it } from 'vitest'
import { addStat, earnIncome, formatMoney, log, relationLabel, shortMoney, useYearAction, zodiacFor } from '../src/game/core'
import { createPerson } from '../src/game/people'
import { chance, randInt, rand } from '../src/game/rng'
import { makeTestGame } from './helpers'

describe('rng', () => {
  it('is deterministic for a seed', () => {
    const a = makeTestGame(42)
    const b = makeTestGame(42)
    expect([rand(a), rand(a), randInt(a, 1, 6)]).toEqual([rand(b), rand(b), randInt(b, 1, 6)])
  })
  it('chance(0) is never true and chance(1) always is', () => {
    const g = makeTestGame(7)
    for (let i = 0; i < 50; i++) {
      expect(chance(g, 0)).toBe(false)
      expect(chance(g, 1)).toBe(true)
    }
  })
})

describe('core helpers', () => {
  it('clamps stats to 0-100', () => {
    const g = makeTestGame()
    addStat(g, 'health', 500)
    expect(g.character.stats.health).toBe(100)
    addStat(g, 'health', -500)
    expect(g.character.stats.health).toBe(0)
  })
  it('limits per-year actions', () => {
    const g = makeTestGame()
    expect(useYearAction(g, 'gym', 2)).toBe(true)
    expect(useYearAction(g, 'gym', 2)).toBe(true)
    expect(useYearAction(g, 'gym', 2)).toBe(false)
  })
  it('formats money', () => {
    expect(formatMoney(1234567)).toBe('$1,234,567')
    expect(formatMoney(-50)).toBe('-$50')
    expect(shortMoney(2_500_000)).toBe('$2.5M')
  })
  it('tracks taxable income', () => {
    const g = makeTestGame()
    earnIncome(g, 1000)
    earnIncome(g, 500)
    expect(g.character.money).toBe(1500)
    expect(g.flags.taxableIncome).toBe(1500)
  })
  it('logs into the current age', () => {
    const g = makeTestGame()
    log(g, 'I was born.')
    expect(g.log[0].entries[0].text).toBe('I was born.')
  })
  it('computes zodiac signs', () => {
    expect(zodiacFor(3, 14)).toBe('Pisces')
    expect(zodiacFor(12, 25)).toBe('Capricorn')
    expect(zodiacFor(1, 25)).toBe('Aquarius')
  })
  it('labels relations by gender', () => {
    const g = makeTestGame()
    const mom = createPerson(g, { relation: 'parent', age: 30, gender: 'female' })
    expect(relationLabel(mom)).toBe('Mother')
    expect(g.people).toHaveLength(1)
  })
})
