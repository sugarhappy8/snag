// ci: fast
// R3-H2 (H.1): what a menu prints for an Estimate. One formatter for every unit:
//   sd <= .06   '$4.2M'            three significant digits
//   sd <= .15   'about $4M'        one digit (two when the mantissa is under 2)
//   sd <= .30   '$3M to $5M'       one digit each, never equal
//   above       a word             the caller's ladder, else a default for the unit ('in the millions', 'average', 'unlikely')
// Odds are words below conf 2, 'about 65%' (nearest 5) at conf 2, '65%' at conf 3. A delta carries its sign. No dash characters,
// and a line is 40 characters at most.
import { afterEach, describe, expect, it } from 'vitest'
import { bindMoneyContext, setMoneyDisplay } from '../src/game/core'
// Importing the currencies registers the real converter, as the game does at startup.
import '../src/game/data/currencies'
import { estimate, type Estimate, type Unit } from '../src/game/knowledge/contract'
import { exactWords, wordsFor } from '../src/game/knowledge/format'
import { fogGame, inFog } from './knowledge-kit'
import { makeTestGame } from './helpers'

/** The words of a band built the way estimate() builds it: log units centre on the geometric mean, linear ones on the arithmetic. */
function band(unit: Unit, mid: number, sd: number, span = 1): { mid: number; lo: number; hi: number; conf: 0 | 1 | 2 | 3 } {
  const Z = 1.298
  const log = unit === 'money' || unit === 'count' || unit === 'pct'
  const lo = log ? mid * Math.exp(-Z * sd) : mid - Z * sd * span
  const hi = log ? mid * Math.exp(Z * sd) : mid + Z * sd * span
  const conf = sd <= 0.06 ? 3 : sd <= 0.15 ? 2 : sd <= 0.3 ? 1 : 0
  return { mid, lo, hi, conf }
}
const words = (unit: Unit, mid: number, sd: number, span = 1): string => wordsFor(unit, band(unit, mid, sd, span))

describe('money', () => {
  it('prints by the sd: exact-ish, about, a range, a word', () => {
    expect(words('money', 4_237_000, 0.05)).toBe('$4.2M')
    expect(words('money', 4_237_000, 0.12)).toBe('about $4M')
    expect(words('money', 4_237_000, 0.2)).toBe('$3M to $5M')
    expect(words('money', 4_237_000, 0.5)).toBe('in the millions')
  })

  it('about: one digit, two when the mantissa is under 2', () => {
    expect(words('money', 1_370_000, 0.12)).toBe('about $1.4M')
    expect(words('money', 1_990_000, 0.12)).toBe('about $2M')
    expect(words('money', 8_300_000, 0.12)).toBe('about $8M')
    expect(words('money', 46_000, 0.12)).toBe('about $50K')
    expect(words('money', 1_460_000_000, 0.12)).toBe('about $1.5B')
    expect(words('money', 7_400, 0.12)).toBe('about $7,000')
  })

  it('exact-ish: three digits through the money formatter', () => {
    expect(words('money', 46_300, 0.04)).toBe('$46K')
    expect(words('money', 463_000_000, 0.04)).toBe('$463M')
    expect(words('money', 2_540_000_000, 0.04)).toBe('$2.5B')
    expect(words('money', 8_346, 0.04)).toBe('$8,350')
  })

  it('a range is never two equal ends', () => {
    // a narrow conf-1 band whose ends round to the same single digit gets a second digit
    for (const mid of [1.0e6, 1.2e6, 1.45e6, 3.0e6, 9.6e6, 98e3, 1.04e9, 412, 7]) {
      for (const sd of [0.151, 0.18, 0.22, 0.3]) {
        const w = words('money', mid, sd)
        const parts = w.split(' to ')
        expect(parts, `${mid} ${sd}: ${w}`).toHaveLength(2)
        expect(parts[0], `${mid} ${sd}: ${w}`).not.toBe(parts[1])
      }
    }
  })

  it('the default word is the order of magnitude', () => {
    const w = (mid: number): string => wordsFor('money', band('money', mid, 0.6))
    expect(w(400)).toBe('under a thousand')
    expect(w(5_000)).toBe('in the thousands')
    expect(w(60_000)).toBe('in the tens of thousands')
    expect(w(600_000)).toBe('in the hundreds of thousands')
    expect(w(6_000_000)).toBe('in the millions')
    expect(w(60_000_000)).toBe('in the tens of millions')
    expect(w(600_000_000)).toBe('in the hundreds of millions')
    expect(w(6e9)).toBe('in the billions')
    expect(w(6e10)).toBe('in the tens of billions')
    expect(w(6e11)).toBe('in the hundreds of billions')
    expect(w(6e12)).toBe('in the trillions')
    expect(w(6e15)).toBe('in the trillions')
  })

  it("the caller's ladder beats the default; a ladder entry is an upper bound, the last word catches the rest", () => {
    const ladder = [[1e6, 'a corner shop'], [1e8, 'a chain'], [1e10, 'a giant']] as const
    const w = (mid: number): string => wordsFor('money', band('money', mid, 0.6), ladder)
    expect(w(5e5)).toBe('a corner shop')
    expect(w(1e6)).toBe('a chain')
    expect(w(5e7)).toBe('a chain')
    expect(w(5e9)).toBe('a giant')
    expect(w(5e12)).toBe('a giant')
    // an empty ladder falls back to the default
    expect(wordsFor('money', band('money', 6e6, 0.6), [])).toBe('in the millions')
    // the ladder is not used while a number is shown
    expect(wordsFor('money', band('money', 4_237_000, 0.2), ladder)).toBe('$3M to $5M')
  })

  describe('follows the money settings', () => {
    afterEach(() => {
      setMoneyDisplay({ mode: 'usd', nominal: false })
      bindMoneyContext(null)
    })
    it('prints through shortMoney, so the player\'s currency applies', () => {
      expect(words('money', 4_237_000, 0.05)).toBe('$4.2M')
      bindMoneyContext(makeTestGame(1, { countryId: 'jp' }))
      setMoneyDisplay({ mode: 'local', nominal: false })
      const yen = words('money', 4_237_000, 0.05)
      expect(yen).not.toContain('$')
      expect(yen).toMatch(/\d/)
      // the magnitude word follows the shown amount, not the dollars: 4.2 million dollars is hundreds of millions of yen
      const w = wordsFor('money', band('money', 4_237_000, 0.6))
      expect(w).not.toBe('in the millions')
      expect(wordsFor('money', band('money', 4_237_000, 0.6))).toMatch(/^in the (tens|hundreds) of millions$|^in the billions$/)
    })
  })
})

describe('count', () => {
  it('K, M and B suffixes; plain digits below ten thousand', () => {
    expect(words('count', 4_237_000, 0.05)).toBe('4.2M')
    expect(words('count', 4_237_000, 0.12)).toBe('about 4M')
    expect(words('count', 4_237_000, 0.2)).toBe('3M to 5M')
    expect(words('count', 8_346, 0.04)).toBe('8,350')
    expect(words('count', 46_300, 0.04)).toBe('46K')
    expect(words('count', 3_100_000_000, 0.04)).toBe('3.1B')
  })

  it('both ends of a range use the same units', () => {
    expect(wordsFor('count', { mid: 13_000, lo: 9_400, hi: 18_200, conf: 1 })).toBe('9K to 20K')
    expect(wordsFor('count', { mid: 2_000_000, lo: 800_000, hi: 4_100_000, conf: 1 })).toBe('800K to 4M')
    expect(wordsFor('count', { mid: 6_000, lo: 4_100, hi: 8_300, conf: 1 })).toBe('4,000 to 8,000')
  })

  it('the default word is the order of magnitude', () => {
    const w = (mid: number): string => wordsFor('count', band('count', mid, 0.6))
    expect(w(4)).toBe('a handful')
    expect(w(40)).toBe('dozens')
    expect(w(400)).toBe('hundreds')
    expect(w(4_000)).toBe('thousands')
    expect(w(40_000)).toBe('tens of thousands')
    expect(w(400_000)).toBe('hundreds of thousands')
    expect(w(4_000_000)).toBe('millions')
    expect(w(400_000_000)).toBe('hundreds of millions')
    expect(w(4e9)).toBe('billions')
  })
})

describe('pct (a fraction of 1)', () => {
  it('prints percent with the digits of the sd', () => {
    expect(words('pct', 0.1234, 0.05)).toBe('12.3%')
    expect(words('pct', 0.1234, 0.12)).toBe('about 12%')
    expect(words('pct', 0.35, 0.2)).toBe('30% to 50%')
    expect(words('pct', 0.0042, 0.05)).toBe('0.42%')
    expect(words('pct', 2.5, 0.05)).toBe('250%')
  })

  it('the default word runs from a sliver to most of it', () => {
    const w = (v: number): string => wordsFor('pct', band('pct', v, 0.6))
    expect(w(0.01)).toBe('a sliver')
    expect(w(0.06)).toBe('a small slice')
    expect(w(0.15)).toBe('a fair slice')
    expect(w(0.35)).toBe('a big slice')
    expect(w(0.7)).toBe('most of it')
  })
})

describe('score (0 to 100)', () => {
  it('prints points: exact-ish, about (nearest 5), a range (nearest 5), a word', () => {
    expect(words('score', 72.4, 0.04, 100)).toBe('72')
    expect(words('score', 72.4, 0.12, 100)).toBe('about 70')
    expect(words('score', 72.4, 0.2, 100)).toBe('45 to 100')
    expect(words('score', 72.4, 0.5, 100)).toBe('strong')
  })

  it('the default word runs from poor to outstanding', () => {
    const w = (v: number): string => wordsFor('score', { mid: v, lo: 0, hi: 100, conf: 0 })
    expect(w(5)).toBe('poor')
    expect(w(30)).toBe('below par')
    expect(w(50)).toBe('average')
    expect(w(70)).toBe('strong')
    expect(w(95)).toBe('outstanding')
  })
})

describe('odds (0 to 1)', () => {
  it('words below conf 2, about 65% (nearest 5) at conf 2, 65% at conf 3', () => {
    expect(words('odds', 0.653, 0.04)).toBe('65%')
    expect(words('odds', 0.653, 0.12)).toBe('about 65%')
    expect(words('odds', 0.672, 0.12)).toBe('about 65%')
    expect(words('odds', 0.678, 0.12)).toBe('about 70%')
    expect(words('odds', 0.653, 0.2)).toBe('likely')
    expect(words('odds', 0.653, 0.5)).toBe('likely')
  })

  it('the default ladder', () => {
    const w = (v: number): string => wordsFor('odds', { mid: v, lo: 0, hi: 1, conf: 1 })
    expect(w(0.04)).toBe('a long shot')
    expect(w(0.2)).toBe('unlikely')
    expect(w(0.4)).toBe('less likely than not')
    expect(w(0.52)).toBe('even money')
    expect(w(0.7)).toBe('likely')
    expect(w(0.88)).toBe('very likely')
    expect(w(0.97)).toBe('close to certain')
  })

  it("the caller's ladder works for odds too", () => {
    const ladder = [[0.5, 'it will probably fail'], [1.01, 'it will probably work']] as const
    expect(wordsFor('odds', { mid: 0.3, lo: 0.1, hi: 0.5, conf: 1 }, ladder)).toBe('it will probably fail')
    expect(wordsFor('odds', { mid: 0.8, lo: 0.6, hi: 1, conf: 0 }, ladder)).toBe('it will probably work')
  })
})

describe('delta (a signed money amount)', () => {
  it('carries its sign', () => {
    const span = 100_000_000
    expect(words('delta', 32_400_000, 0.04, span)).toBe('+$32M')
    expect(words('delta', -32_400_000, 0.04, span)).toBe('-$32M')
    expect(words('delta', 32_500_000, 0.04, span)).toMatch(/^\+\$\d/)
    expect(words('delta', -32_500_000, 0.04, span)).toMatch(/^-\$\d/)
    expect(words('delta', 30_000_000, 0.12, span / 8)).toMatch(/^about \+\$/)
    expect(words('delta', -30_000_000, 0.12, span / 8)).toMatch(/^about -\$/)
  })

  it('a range names both signs: roughly +$20M to +$40M, or -$5M to +$10M', () => {
    expect(wordsFor('delta', { mid: 30_000_000, lo: 20_000_000, hi: 40_000_000, conf: 1 })).toBe('roughly +$20M to +$40M')
    expect(wordsFor('delta', { mid: 3_500_000, lo: -5_000_000, hi: 12_000_000, conf: 1 })).toBe('roughly -$5M to +$10M')
    expect(wordsFor('delta', { mid: -30_000_000, lo: -40_000_000, hi: -20_000_000, conf: 1 })).toBe('roughly -$40M to -$20M')
    // equal at one digit: a second digit, never '+$20M to +$20M'
    expect(wordsFor('delta', { mid: 21_000_000, lo: 20_400_000, hi: 21_600_000, conf: 1 })).toBe('roughly +$20M to +$22M')
  })

  it('the default word says gain or loss and how big', () => {
    expect(wordsFor('delta', { mid: 32_500_000, lo: 0, hi: 1e8, conf: 0 })).toBe('a gain in the tens of millions')
    expect(wordsFor('delta', { mid: -3_500_000, lo: -1e8, hi: 0, conf: 0 })).toBe('a loss in the millions')
    expect(wordsFor('delta', { mid: 120, lo: -1e6, hi: 1e6, conf: 0 })).toBe('about breakeven')
  })
})

describe('exactWords: what an exact estimate carries', () => {
  it('prints the truth in the unit', () => {
    expect(exactWords('money', 4_237_000)).toBe('$4.2M')
    expect(exactWords('count', 4_237_000)).toBe('4.2M')
    expect(exactWords('pct', 0.1234)).toBe('12.3%')
    expect(exactWords('score', 72.4)).toBe('72')
    expect(exactWords('odds', 0.653)).toBe('65%')
    expect(exactWords('delta', 12_000_000)).toBe('+$12M')
    expect(exactWords('delta', -12_000_000)).toBe('-$12M')
  })
})

describe('every line is plain, short and finite', () => {
  // en dash and em dash, by code point so this file carries none
  const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)
  const ESTIMATES: Estimate[] = []
  const grid: Array<[string, (i: number) => number, { scale?: number }]> = [
    ['mkt:cafe:us:size', (i) => 10 ** (2 + (i % 11)), {}],
    ['mkt:cafe:us:units', (i) => 10 ** (1 + (i % 9)), {}],
    ['mkt:cafe:us:share', (i) => 0.003 + (i % 19) * 0.03, {}],
    ['riv:r1:quality', (i) => 3 + (i % 20) * 4.7, {}],
    ['odds:x:rd:p', (i) => 0.02 + (i % 25) * 0.039, {}],
    ['scn:s1:value', (i) => ((i % 21) - 10) * 7e6, { scale: 150e6 }],
    ['riv:r1:cash', (i) => 10 ** (3 + (i % 8)), {}],
    ['ppl:a:smarts', (i) => 5 + (i % 18) * 5, {}],
    ['eco:us:inflation', (i) => 0.01 + (i % 15) * 0.005, {}],
  ]
  for (let i = 0; i < 220; i++) {
    const talents = i % 3 === 0 ? ['Business'] : i % 7 === 0 ? ['MainCharacter'] : []
    for (const [key, truth, opts] of grid) {
      ESTIMATES.push(inFog(() => estimate(fogGame(i, { talents }), key, truth(i), { ...opts, exp: (i % 5) / 4 })))
    }
  }

  it('has no dash characters, at most 40 characters, no NaN, and lo < hi', () => {
    expect(ESTIMATES.length).toBeGreaterThan(1000)
    for (const e of ESTIMATES) {
      expect(e.words, e.key).not.toMatch(DASHES)
      expect(e.words.length, `${e.key}: ${e.words}`).toBeLessThanOrEqual(40)
      expect(e.words.length, e.key).toBeGreaterThan(0)
      expect(e.words, e.key).not.toMatch(/NaN|undefined|Infinity|\[object/)
      expect(e.lo, `${e.key}: ${e.words}`).toBeLessThan(e.hi)
    }
  })

  it('covers all four tiers', () => {
    for (const c of [0, 1, 2, 3]) expect(ESTIMATES.filter((e) => e.conf === c).length, `conf ${c}`).toBeGreaterThan(20)
  })

  it('asOf is only ever set from a stored row 2 or more years old', () => {
    expect(ESTIMATES.every((e) => e.asOf === undefined)).toBe(true)
    const e = inFog(() => estimate(fogGame(1, { year: 2030 }), 'mkt:cafe:us:size', 5e6, { row: { mid: 5e6, sd: 0.05, y: 2027, src: 'press' } }))
    expect(e.asOf).toBe(2027)
    expect(e.words).not.toContain('2027') // the chip prints the year, not the words
  })
})
