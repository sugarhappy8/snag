// Money the player types and the AI writes is in the display currency: it must come back to
// internal dollars exactly once (Dialogs.tsx inputs, director.ts AI effects, settings.ts).
import { afterEach, describe, expect, it } from 'vitest'
import { aiMoneyToDollars, moneyPattern, toGameEffects } from '../src/ai/director'
import { effectsGuide } from '../src/ai/prompts'
import { NEUTRAL_EFFECTS } from '../src/ai/schemas'
import { bindMoneyContext, formatMoney, moneyDisplay, moneyFromInput, moneyScale, moneyToInput, setMoneyDisplay } from '../src/game/core'
import { applyEffects } from '../src/game/effects'
import type { GameState } from '../src/game/types'
import { DEFAULT_SETTINGS, applyMoneySettings, normalizeSettings } from '../src/settings'
import { moneyDefault, moneyFieldValue, normalizeInput, parseMoneyInput, rangeHint, validateInput } from '../src/ui/components/Dialogs'
import { formatPrice as reportPrice } from '../src/ui/minigames/AnnualReport'
import { makeTestGame } from './helpers'

function life(countryId: string, year: number, age = 30): GameState {
  const g = makeTestGame(1, { countryId, age })
  g.year = year
  return g
}

function show(countryId: string, year: number, mode: 'usd' | 'local' = 'local', nominal = true): GameState {
  setMoneyDisplay({ mode, nominal })
  const g = life(countryId, year)
  bindMoneyContext(g)
  return g
}

afterEach(() => {
  setMoneyDisplay({ mode: 'usd', nominal: false })
  bindMoneyContext(null)
})

describe('typing amounts', () => {
  it('parses what people type in any currency', () => {
    expect(parseMoneyInput('¥150,000')).toBe(150_000)
    expect(parseMoneyInput('Rp 2.5M')).toBe(2_500_000)
    expect(parseMoneyInput('1.500.000')).toBe(1_500_000)
    expect(parseMoneyInput('1.500', true)).toBe(1_500)
    expect(parseMoneyInput('1.5')).toBe(1.5)
    expect(parseMoneyInput('12,50 €')).toBe(12.5)
    expect(parseMoneyInput('1.234,56')).toBe(1234.56)
    expect(parseMoneyInput('45k')).toBe(45_000)
    expect(parseMoneyInput('2 million')).toBe(2_000_000)
    expect(parseMoneyInput('1 500 kr')).toBe(1_500)
    expect(parseMoneyInput('-$20')).toBe(-20)
    // A multiplier is a whole word: "Kč" is Czech crowns, not thousands.
    expect(parseMoneyInput('500 Kč')).toBe(500)
    expect(parseMoneyInput('100 krónur')).toBe(100)
    expect(parseMoneyInput('2.5 million yen')).toBe(2_500_000)
    expect(parseMoneyInput('5 quadrillion ℳ')).toBe(5e15)
    expect(parseMoneyInput('lots')).toBeNull()
    expect(parseMoneyInput('')).toBeNull()
  })

  it('converts yen fields to internal dollars and back', () => {
    show('jp', 2026)
    expect(moneyScale()).toBe(150)
    expect(moneyDefault('1000')).toBe('150000')
    expect(moneyFieldValue(12.5)).toBe('1875')
    expect(normalizeInput('number', '¥150,000', true, 1, 5_000)).toBe('1000')
    // Rounding never escapes the engine's bounds.
    expect(normalizeInput('number', '¥750,049', true, 1, 5_000)).toBe('5000')
    expect(normalizeInput('number', '¥1', true, 1, 5_000)).toBe('1')
    expect(validateInput('number', '¥750,000', 1, 5_000, true)).toBeNull()
    expect(validateInput('number', '¥900,000', 1, 5_000, true)).toBe('The maximum is ¥750,000.')
    expect(validateInput('number', '¥10', 1, 5_000, true)).toBe('The minimum is ¥150.')
    expect(validateInput('number', 'lots', 1, 5_000, true)).toBe('Please enter an amount.')
    expect(rangeHint('number', 1, 5_000, true)).toBe('Between ¥150 and ¥750,000')
    expect(rangeHint('number', undefined, undefined, true)).toBe('Amount in Japanese yen (¥)')
  })

  it('accepts the rounded bound the player was shown', () => {
    show('de', 2026)
    // $1,234 → €1,061.24 shown as €1,061.
    expect(validateInput('number', '1061', 1, 1_234, true)).toBeNull()
    expect(normalizeInput('number', '1061', true, 1, 1_234)).toBe('1234')
    expect(validateInput('number', '1063', 1, 1_234, true)).toBe('The maximum is €1,061.')
  })

  it('handles cents in old money', () => {
    show('us', 1925)
    expect(moneyDefault('100')).toBe('5.3')
    expect(normalizeInput('number', '$5.30', true, 1)).toBe('100')
    expect(validateInput('number', '0.04', 1, undefined, true)).toBe('The minimum is $0.05.')
  })

  it('writes hyperinflation amounts out in full', () => {
    show('hu', 1946)
    const v = moneyFieldValue(1_000)
    expect(v).toMatch(/^\d{25,}$/)
    expect(normalizeInput('number', v, true, 1, 5_000)).toBe('1000')
  })

  it('leaves non-money inputs and plain dollars as they were', () => {
    show('jp', 2026)
    expect(normalizeInput('number', '$1,234.6')).toBe('1235')
    expect(validateInput('number', '0', 1, 100)).toBe('The minimum is 1.')
    expect(rangeHint('number', 1, 10_000)).toBe('Between 1 and 10,000')
    setMoneyDisplay({ mode: 'usd', nominal: false })
    expect(normalizeInput('number', '$1,500', true, 1, 10_000)).toBe('1500')
    expect(moneyDefault('250')).toBe('250')
    expect(moneyToInput(250)).toBe(250)
  })
})

describe('AI money', () => {
  it('reads the AI’s yen as yen, not dollars', () => {
    const g = show('jp', 2026)
    expect(aiMoneyToDollars(g, -150_000)).toBe(-1_000)
    const eff = toGameEffects(g, { ...NEUTRAL_EFFECTS, money: 75_000 })
    expect(eff.money).toBe(500)
    const before = g.character.money
    const changes = applyEffects(g, eff)
    expect(g.character.money - before).toBe(500)
    expect(changes).toContain('+¥75,000')
  })

  it('applies age limits after converting', () => {
    const g = show('id', 2026)
    g.character.age = 10
    // Rp 50,000,000 is ~$3,000: a 10-year-old's windfall is capped at $400.
    expect(toGameEffects(g, { ...NEUTRAL_EFFECTS, money: 50_000_000 }).money).toBe(400)
    expect(toGameEffects(g, { ...NEUTRAL_EFFECTS, money: 165_000 }).money).toBe(10)
  })

  it('reads old money in old money', () => {
    const g = show('de', 1990)
    const perDollar = moneyScale()
    expect(aiMoneyToDollars(g, 1_000)).toBeCloseTo(1_000 / perDollar, 6)
    expect(perDollar).toBeLessThan(1.5)
    expect(perDollar).toBeGreaterThan(0.5)
  })

  it('is unchanged in plain US dollars', () => {
    const g = show('us', 2026, 'usd', false)
    expect(toGameEffects(g, { ...NEUTRAL_EFFECTS, money: -350 }).money).toBe(-350)
    expect(applyEffects(g, { money: -0 })).toEqual([])
    g.character.money = 10_000
    expect(applyEffects(g, { money: -500 })).toEqual(['-$500'])
  })

  it('tells the AI which money it is using', () => {
    const g = show('jp', 1980)
    const guide = effectsGuide(g)
    expect(guide).toContain('money in the currency of every amount above, Japanese yen (¥)')
    expect(guide).toMatch(/around ±¥[\d,]+ is typical/)
    const us = show('us', 2026, 'usd', false)
    expect(effectsGuide(us)).toContain('money in the currency of every amount above, US dollar ($)')
  })

  it('checks narrations for amounts in the shown currency', () => {
    const g = show('se', 2026)
    expect('You paid 1,500 kr and got 2.5M kr back.'.match(moneyPattern(g))).toEqual(['1,500 kr', '2.5M kr'])
    const jp = show('jp', 2026)
    expect('It cost ¥15,000.'.match(moneyPattern(jp))).toEqual(['¥15,000'])
    const us = show('us', 2026, 'usd', false)
    expect('It cost $15,000.'.match(moneyPattern(us))).toEqual(['$15,000'])
  })
})

describe('settings', () => {
  it('defaults to local currency in the prices of the year', () => {
    expect(DEFAULT_SETTINGS.money).toBe('local')
    expect(DEFAULT_SETTINGS.prices).toBe('nominal')
    expect(normalizeSettings({ money: 'usd', prices: 'today' })).toMatchObject({ money: 'usd', prices: 'today' })
    expect(normalizeSettings({ money: 'gold', prices: 'whenever' })).toMatchObject({ money: 'local', prices: 'nominal' })
  })

  it('drives the engine’s money display', () => {
    applyMoneySettings({ money: 'usd', prices: 'today' })
    expect(moneyDisplay()).toEqual({ mode: 'usd', nominal: false })
    applyMoneySettings({ money: 'local', prices: 'nominal' })
    expect(moneyDisplay()).toEqual({ mode: 'local', nominal: true })
    bindMoneyContext(life('jp', 2026))
    expect(formatMoney(100)).toBe('¥15,000')
    expect(moneyFromInput(15_000)).toBe(100)
  })
})

describe('minigames', () => {
  it('show Annual Report prices in the player’s money', () => {
    expect(reportPrice(3.5, 0.05)).toBe('$3.50')
    show('jp', 2026)
    expect(reportPrice(3.5, 0.05)).toBe('¥525')
    show('de', 2026)
    expect(reportPrice(3.5, 0.05)).toBe('€3.01')
  })
})

describe('settings screen', () => {
  it('previews what the money settings do', async () => {
    const { moneyPreview } = await import('../src/ui/screens/SettingsScreen')
    setMoneyDisplay({ mode: 'local', nominal: true })
    expect(moneyPreview(null)).toMatch(/^Example: a job paying \$40,000 today, for a life in Japan in 1980: ¥[\d,]+ a year$/)
    const g = life('id', 2026)
    g.character.money = 1_000
    expect(moneyPreview(g)).toBe('Test’s bank balance (Indonesia, 2026): Rp 16,500,000')
    setMoneyDisplay({ mode: 'usd', nominal: false })
    expect(moneyPreview(g)).toBe('Test’s bank balance (Indonesia, 2026): $1,000')
  })
})
