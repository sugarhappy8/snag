// R1-C1: the money and text helpers every chart builder uses (src/game/charts/money.ts). One price basis per chart,
// labels built under the life's own money context (not whichever life the UI happens to have bound), and text that
// always fits the spec limits.
import { afterEach, describe, expect, it } from 'vitest'
import { bindMoneyContext, moneyContextOf, moneyDisplay, setMoneyDisplay, shortMoney, withMoneyContext } from '../src/game/core'
// Importing the currencies registers the real converter (yen, euros), as the game does at startup.
import '../src/game/data/currencies'
import { CHART_LIMITS, type ChartSpec } from '../src/game/charts/spec'
import { deltaLabel, fit, liveBasisYear, moneyLabel, pctLabel, priceBasisYear, priceChip, whole, withLiveBasis } from '../src/game/charts/money'
import { PRESENT_YEAR } from '../src/game/history/timeline'
import type { GameState } from '../src/game/types'
import { makeTestGame } from './helpers'

const us = (year = 2031): GameState => {
  const g = makeTestGame(1, { countryId: 'us' })
  g.year = year
  return g
}
const jp = (year = 2031): GameState => {
  const g = makeTestGame(1, { countryId: 'jp' })
  g.year = year
  return g
}

const saved = { ...moneyDisplay() }
afterEach(() => {
  setMoneyDisplay({ mode: saved.mode, nominal: saved.nominal })
  bindMoneyContext(null)
})

describe('priceBasisYear and priceChip', () => {
  it('uses the prices of the year lived when the player reads nominal money', () => {
    setMoneyDisplay({ nominal: true })
    expect(priceBasisYear(us(2031))).toBe(2031)
    expect(priceBasisYear(us(1985))).toBe(1985)
  })

  it('uses today money (PRESENT_YEAR) otherwise, whatever year it is in the life', () => {
    setMoneyDisplay({ nominal: false })
    expect(PRESENT_YEAR).toBe(2026)
    expect(priceBasisYear(us(2031))).toBe(2026)
    expect(priceBasisYear(us(1985))).toBe(2026)
  })

  it('writes the chip the Frame shows', () => {
    expect(priceChip(2031)).toBe('prices of 2031')
    expect(priceChip(2026)).toBe('prices of 2026')
  })
})

describe('liveBasisYear and withLiveBasis', () => {
  const money = (over: Partial<ChartSpec> = {}): ChartSpec => ({
    v: 1,
    kind: 'line',
    title: 'Net profit',
    unit: 'money',
    x: [2027, 2028],
    series: [{ id: 'net', label: 'Net profit', tone: 'c1', values: [1, 2] }],
    basis: 2026,
    summary: 'Net profit rose.',
    ...over,
  })

  it('follows the money display and the life on screen, as the axes and the table do', () => {
    bindMoneyContext(us(2050))
    setMoneyDisplay({ nominal: true })
    expect(liveBasisYear()).toBe(2050)
    setMoneyDisplay({ nominal: false })
    expect(liveBasisYear()).toBe(PRESENT_YEAR)
    // No life on screen: money is plain dollars, so there is no other year to name.
    bindMoneyContext(null)
    setMoneyDisplay({ nominal: true })
    expect(liveBasisYear()).toBe(PRESENT_YEAR)
  })

  it('agrees with the basis a builder gives the same life', () => {
    for (const nominal of [true, false]) {
      const g = us(2044)
      bindMoneyContext(g)
      setMoneyDisplay({ nominal })
      expect(liveBasisYear()).toBe(priceBasisYear(g))
    }
  })

  it('puts the live basis on a queued spec that carries one, and changes nothing else', () => {
    bindMoneyContext(us(2050))
    setMoneyDisplay({ nominal: true })
    const queued = money({ basis: 2026 })
    const shown = withLiveBasis(queued)
    expect(shown.basis).toBe(2050)
    expect({ ...shown, basis: 2026 }).toEqual(queued)
    expect(queued.basis).toBe(2026)
  })

  it('returns the same object when the basis is already right, and leaves a spec with no basis alone', () => {
    bindMoneyContext(us(2050))
    setMoneyDisplay({ nominal: false })
    const right = money({ basis: PRESENT_YEAR })
    expect(withLiveBasis(right)).toBe(right)
    const single = money()
    delete single.basis
    expect(withLiveBasis(single)).toBe(single)
    expect('basis' in withLiveBasis(single)).toBe(false)
  })
})

describe('moneyLabel', () => {
  it('reads like shortMoney in dollars, at three sizes', () => {
    setMoneyDisplay({ mode: 'usd', nominal: false })
    const g = us()
    expect(moneyLabel(g, 800)).toBe('$800')
    expect(moneyLabel(g, 45_000)).toBe('$45K')
    expect(moneyLabel(g, 3_200_000)).toBe('$3.2M')
    expect(moneyLabel(g, -45_000)).toBe('-$45K')
  })

  it('writes yen for a Japanese life, at three sizes', () => {
    setMoneyDisplay({ mode: 'local', nominal: false })
    const g = jp()
    expect(moneyLabel(g, 20)).toBe('¥3,000')
    expect(moneyLabel(g, 2_000)).toBe('¥300K')
    expect(moneyLabel(g, 400_000)).toBe('¥60M')
  })

  it('uses the life it is given, not the life the UI has bound, and puts the binding back', () => {
    setMoneyDisplay({ mode: 'local', nominal: false })
    const american = us()
    const japanese = jp()
    bindMoneyContext(american)
    expect(moneyLabel(japanese, 2_000)).toBe('¥300K')
    // Still the American life afterwards.
    expect(shortMoney(2_000)).toBe('$2,000')
    bindMoneyContext(japanese)
    expect(moneyLabel(american, 2_000)).toBe('$2,000')
    expect(moneyLabel(japanese, 2_000)).toBe(withMoneyContext(moneyContextOf(japanese), () => shortMoney(2_000)))
  })

  it('does not throw on a value that is not a number', () => {
    expect(() => moneyLabel(us(), Number.NaN)).not.toThrow()
    expect(moneyLabel(us(), Number.NaN)).toBe('$0')
    expect(moneyLabel(us(), Number.POSITIVE_INFINITY)).toBe('$0')
  })
})

describe('deltaLabel', () => {
  it('says up, down or unchanged in words', () => {
    setMoneyDisplay({ mode: 'usd', nominal: false })
    const g = us()
    expect(deltaLabel(g, 310_000)).toBe('up $310K')
    expect(deltaLabel(g, -2_100_000)).toBe('down $2.1M')
    expect(deltaLabel(g, 0)).toBe('unchanged')
  })

  it('treats a move that rounds to nothing, and a non-number, as unchanged', () => {
    const g = us()
    expect(deltaLabel(g, 0.2)).toBe('unchanged')
    expect(deltaLabel(g, -0.4)).toBe('unchanged')
    expect(deltaLabel(g, Number.NaN)).toBe('unchanged')
    expect(deltaLabel(g, 800)).toBe('up $800')
  })

  it('follows the life currency', () => {
    setMoneyDisplay({ mode: 'local', nominal: false })
    expect(deltaLabel(jp(), -2_000)).toBe('down ¥300K')
  })
})

describe('pctLabel', () => {
  it('writes a fraction as a percentage', () => {
    expect(pctLabel(0.35)).toBe('35%')
    expect(pctLabel(0)).toBe('0%')
    expect(pctLabel(1)).toBe('100%')
    expect(pctLabel(0.1234, 1)).toBe('12.3%')
    expect(pctLabel(-0.05)).toBe('-5%')
  })

  it('marks a share too small to show', () => {
    expect(pctLabel(0.0004)).toBe('<0.1%')
    expect(pctLabel(0.0004, 1)).toBe('<0.1%')
    // 0.3 percent must not read 0 percent.
    expect(pctLabel(0.003)).toBe('0.3%')
  })

  it('never prints NaN, undefined or minus zero', () => {
    expect(pctLabel(Number.NaN)).toBe('0%')
    expect(pctLabel(Number.POSITIVE_INFINITY)).toBe('0%')
    expect(pctLabel(-0)).toBe('0%')
    expect(pctLabel(-0.0004)).toBe('0%')
  })
})

describe('whole', () => {
  it('rounds, and turns anything that is not a finite number into 0', () => {
    expect(whole(2.4)).toBe(2)
    expect(whole(2.5)).toBe(3)
    expect(whole(-2.6)).toBe(-3)
    expect(whole(Number.NaN)).toBe(0)
    expect(whole(Number.POSITIVE_INFINITY)).toBe(0)
    expect(whole(Number.NEGATIVE_INFINITY)).toBe(0)
  })

  it('clamps to plus or minus 1e15', () => {
    expect(whole(1e300)).toBe(1e15)
    expect(whole(-1e300)).toBe(-1e15)
    expect(whole(1e15)).toBe(1e15)
    expect(whole(-0.2)).toBe(0)
    expect(Object.is(whole(-0.2), -0)).toBe(false)
  })
})

describe('fit', () => {
  const WORDS = ['profit', 'rose', "doesn't", 'matter', 'when', 'costs', 'grew', 'faster', 'than', 'sales', 'across', 'every', 'single', 'market', 'you', 'run']
  const sentence = (n: number, start = 0) => Array.from({ length: n }, (_, i) => WORDS[(start + i) % WORDS.length]).join(' ')

  it('returns short text unchanged', () => {
    expect(fit('Profit rose 12%.')).toBe('Profit rose 12%.')
    expect(fit('')).toBe('')
    expect(fit('x'.repeat(120))).toBe('x'.repeat(120))
  })

  it('never goes past the limit and never ends mid-word', () => {
    for (let n = 15; n < 80; n++) {
      const text = sentence(n)
      const out = fit(text)
      expect(out.length, `n=${n}`).toBeLessThanOrEqual(CHART_LIMITS.text)
      expect(text.startsWith(out), `n=${n}`).toBe(true)
      const next = text.charAt(out.length)
      expect(next === '' || /[\s.,;:!?-]/.test(next), `n=${n}: next char "${next}"`).toBe(true)
      expect(out.endsWith(' ')).toBe(false)
    }
  })

  it('drops trailing clauses at a sentence boundary first', () => {
    const first = 'Profit rose 12% on strong sales.'
    const text = `${first} ${sentence(12)}. ${sentence(14, 3)}.`
    expect(text.length).toBeGreaterThan(120)
    expect(fit(text)).toBe(`${first} ${sentence(12)}.`)
    const longer = `${first} ${sentence(30)}.`
    expect(fit(longer)).toBe(first)
  })

  it('falls back to a word boundary when there is no sentence boundary', () => {
    const text = sentence(40)
    const out = fit(text)
    expect(out.length).toBeLessThanOrEqual(120)
    expect(out.length).toBeGreaterThan(100)
    expect(text.charAt(out.length)).toBe(' ')
  })

  it('drops a dangling comma or colon and writes no ellipsis', () => {
    const text = `${'a'.repeat(100)}, ${'b'.repeat(40)}`
    const out = fit(text)
    expect(out).toBe('a'.repeat(100))
    expect(fit(sentence(60))).not.toMatch(/…|\.\.\./)
  })

  it('honours another limit', () => {
    const out = fit(sentence(20), 40)
    expect(out.length).toBeLessThanOrEqual(40)
    expect(out.length).toBeGreaterThan(20)
    expect(fit('hello world', 5)).toBe('hello')
  })

  it('cuts a single huge word at the limit, since there is no boundary to use', () => {
    expect(fit('x'.repeat(300))).toBe('x'.repeat(120))
  })
})
