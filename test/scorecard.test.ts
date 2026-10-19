import { describe, expect, it } from 'vitest'
import { scoreRow, scoreText } from '../src/game/business/scorecard'

const F = [78, 75, 70, 66, 64, 60, 55, 44]
describe('scoreRow', () => {
  it('ranks among the field and yourself, with the market as the mean of everyone else', () => {
    expect(scoreRow('coding', 'Coding', 'score', 71, F)).toEqual({ id: 'coding', label: 'Coding', unit: 'score', mine: 71, market: 64, best: 78, rank: 3, of: 9, trend: 1 })
    expect(scoreRow('x', 'X', 'u', 90, F)).toMatchObject({ best: 90, rank: 1, of: 9 })
    expect(scoreRow('x', 'X', 'u', 70, [70, 70, 60])).toMatchObject({ rank: 1, of: 4 })   // ties share the better rank
    expect(scoreRow('x', 'X', 'u', 5, [])).toMatchObject({ market: 0, best: 5, rank: 1, of: 1 })
  })
  it('drops non-finite field entries, reads a non-finite mine as 0 and leaves the field alone', () => {
    expect(scoreRow('x', 'X', 'u', NaN, [NaN, Infinity, -Infinity, 50])).toEqual({ id: 'x', label: 'X', unit: 'u', mine: 0, market: 50, best: 50, rank: 2, of: 2, trend: 0 })
    const f = Object.freeze([3, 1, 2]); expect(() => scoreRow('x', 'X', 'u', 2, f)).not.toThrow(); expect(f).toEqual([3, 1, 2])
  })
  it('trend is 1 above prior + 0.5, -1 below prior - 0.5, else 0; a missing or non-finite prior is 0', () => {
    const t = (m: number, p?: number) => scoreRow('x', 'X', 'u', m, [], p).trend
    expect([t(70.5, 70), t(70.51, 70), t(69.5, 70), t(69.49, 70), t(5), t(5, NaN), t(0.4)]).toEqual([0, 1, 0, -1, 1, 1, 0])
  })
})
describe('scoreText', () => {
  it('prints the sample line, rounds by default, takes fmt, and names an empty market without opening on Nobody', () => {
    expect(scoreText(scoreRow('coding', 'Coding', 'score', 71, F))).toBe('Coding 71. Market 64, best 78, rank 3 of 9.')
    expect(scoreText(scoreRow('coding', 'Coding', 'score', 71.4, [64.5, 60.2]))).toBe('Coding 71. Market 62, best 71, rank 1 of 3.')
    expect(scoreText(scoreRow('p', 'Price', 'usd', 1200, [900, 1500]), (n) => `$${n}`)).toBe('Price $1200. Market $1200, best $1500, rank 2 of 3.')
    const empty = scoreText(scoreRow('coding', 'Coding', 'score', 71, []))
    expect(empty).toBe('Coding 71. The market has no figures.'); expect(empty).not.toMatch(/^Nobody|[\u2014\u2013]/)
  })
})
