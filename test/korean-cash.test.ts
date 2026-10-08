import { afterEach, describe, expect, it } from 'vitest'
import { ageUp, YEARLY_HOOKS } from '../src/game/aging'
import { bindMoneyContext, setMoneyDisplay, showMoney } from '../src/game/core'
import { currencyChangeAt, currencyInflation, currencyOf, unitsPerDollar } from '../src/game/data/currencies'
import { makeTestGame } from './helpers'

afterEach(() => { setMoneyDisplay({ mode: 'usd', nominal: false }); bindMoneyContext(null) })

describe('cash during South Korea’s early won years', () => {
  it('does not create income in an untouched 13-year-old’s bank account', () => {
    const g = makeTestGame(1, { age: 12, countryId: 'kr', money: 2000 / unitsPerDollar('kr', 1962) })
    g.year = 1962
    bindMoneyContext(g)
    setMoneyDisplay({ mode: 'local', nominal: true })
    expect(showMoney(g.character.money).amount).toBeCloseTo(2000)
    const hooks = YEARLY_HOOKS.splice(0)
    try { ageUp(g) } finally { YEARLY_HOOKS.push(...hooks) }
    expect(g.character.age).toBe(13)
    expect(showMoney(g.character.money).amount).toBeCloseTo(2000)
  })

  it('uses hwan between 1953 and 1962 with the correct redenominations', () => {
    expect(currencyOf('kr', 1950).code).toBe('KRW')
    expect(currencyOf('kr', 1953).code).toBe('KRH')
    expect(currencyOf('kr', 1961).code).toBe('KRH')
    expect(currencyOf('kr', 1962).code).toBe('KRW')
    expect(currencyChangeAt('kr', 1953)?.per).toBe(100)
    expect(currencyChangeAt('kr', 1962)?.per).toBe(10)
  })

  it.each([1950, 1951, 1952, 1953, 1961, 1962, 1963, 1964, 1970])('keeps idle nominal cash fixed through %s, except the actual currency conversion', year => {
    const g = makeTestGame(1, { age: 12, countryId: 'kr', money: 2000 / unitsPerDollar('kr', year - 1) })
    g.year = year - 1
    bindMoneyContext(g)
    setMoneyDisplay({ mode: 'local', nominal: true })
    const hooks = YEARLY_HOOKS.splice(0)
    try { ageUp(g) } finally { YEARLY_HOOKS.push(...hooks) }
    expect(showMoney(g.character.money).amount).toBeCloseTo(2000 / (currencyChangeAt('kr', year)?.per ?? 1))
  })

  it('does not erode fresh income, mint interest, or depend on display settings', () => {
    const run = (nominal: boolean) => {
      const g = makeTestGame(1, { age: 12, countryId: 'kr', money: 1000 })
      g.year = 1962
      setMoneyDisplay({ mode: 'local', nominal })
      const hooks = YEARLY_HOOKS.splice(0, YEARLY_HOOKS.length, ['test income', gg => { gg.character.money += 100 }])
      try { ageUp(g) } finally { YEARLY_HOOKS.splice(0, YEARLY_HOOKS.length, ...hooks) }
      return g.character.money
    }
    expect(run(true)).toBeCloseTo(1000 / (1 + currencyInflation('kr', 1963)) + 100)
    expect(run(false)).toBe(run(true))
  })

  it.each([['us', 1932], ['us', 1980], ['jp', 1974], ['de', 2002], ['tr', 2005], ['kr', 2027]] as const)('handles inflation, deflation and redenomination in %s %s', (country, year) => {
    const g = makeTestGame(1, { age: 12, countryId: country, money: 2000 / unitsPerDollar(country, year - 1) })
    g.year = year - 1
    setMoneyDisplay({ mode: 'local', nominal: true })
    bindMoneyContext(g)
    const hooks = YEARLY_HOOKS.splice(0)
    try { ageUp(g) } finally { YEARLY_HOOKS.push(...hooks) }
    expect(showMoney(g.character.money).amount).toBeCloseTo(2000 / (currencyChangeAt(country, year)?.per ?? 1))
  })
})
