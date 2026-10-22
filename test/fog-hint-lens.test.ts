// R3-G11 (H.11): the talent rework through the helpers. A hint is a talent's gut, so it is honest and it is fallible: in Realistic
// mode a number that follows "about", "roughly", "around" or "~" is what the talent reads, not what the engine knows, and the
// choice marked "best" is the one the gut ranks first, so a close call can go the wrong way. No hint site changes: talentHint and
// markBest call the lens (fog/hint), and Exact mode prints today's text.
//
//   exact    Exact mode: every hint string and every ranking is what it was before this task
//   honest   the shown number is within 1.28 sd of the truth about 80% of the time (10,000 lives); the rank noise is the same draw
//   stable   the same text in the same year for the same life reads the same; another year, another life or another text reads
//            another number. The key hashes the words of the text, not its digits, so a value that drifts inside a year does not
//            re-roll the gut
//   shape    the same unit suffix and currency shape, at most three significant digits, percents to the nearest 5 (whole percents
//            of 10 or more), "a" or "an" kept right, "year" or "years" kept right; a limit written without "about" is left alone
//   pure     nothing is written and g.rng does not move (a deep-frozen game reads fine)
//
// The suite runs in Exact (test/setup-exact.ts). Every Realistic case goes through inFog (test/knowledge-kit.ts).
import { afterAll, describe, expect, it, vi } from 'vitest'
import { markBest, money, pct } from '../src/game/business/util'
import { setMoneyDisplay, withMoneyContext } from '../src/game/core'
import '../src/game/data/currencies'
import { lensHint, rankNoise } from '../src/game/fog/hint/contract'
import { know } from '../src/game/knowledge/contract'
import { HINT_EMOJI, talentHint } from '../src/game/talents'
import type { ChoiceOption, GameState } from '../src/game/types'
import { HINT_MAX, cleanHint } from '../src/ui/components/menuModel'
import { deepFreeze, fogGame, inFog, unitAt } from './knowledge-kit'

const BIZ = { talents: ['Business'] } as const
const biz = (i: number, year?: number): GameState => fogGame(i, { ...BIZ, ...(year !== undefined ? { year } : {}) })
const N = 10_000
/** The 80% band of a normal draw is 1.28 sd wide; the 78 to 82 window is the plan's, for 10,000 lives. */
const Z80 = 1.28

/** 40 hint strings in the shapes the 207 sites write (copied from the sources, with numbers filled in). */
const SAMPLES: readonly string[] = [
  'Your odds of passing: about 62%.',
  'Your best way out (about 45%).',
  "Now's the moment: about 70% they say yes.",
  'A great price: licensing it yourself is worth ~$412K.',
  'Expected: $1.2M now + ~$300K in royalties. Licensing alone: ~$2.5M.',
  'Expect to beat ~85% of peers; clients +12% a year',
  'Best balance of growth and margin: about 1.25%',
  'About +8% a year before fees, swings ±15%',
  'The big push lands about 40% of the time',
  'Best campaign right now: about $18K back on top of its cost',
  'Switch to a bigger budget: about $52K better a year',
  'Best budget: about 80% of a normal spend (bold), about $9,400 more profit a year, brand included',
  'Best R&D budget: about $1.4M (62% odds, quality ~4, worth about $3M on average)',
  'Develop a faster engine: about $800K is the best budget (55% odds, worth $2.1M on average)',
  'Best place to expand: about 3 new Cafes here pay for themselves in 2.5 years',
  'Build about 12 outlets: they pay for themselves in 4 years',
  'On average the premium costs about $4,200 a year more than the damage it covers',
  'The board would likely approve up to about $50K a year',
  'Above $50K a year the board will likely say no',
  'Keep it under $20K: above that the board will likely say no',
  'Underwriters audit the books first: about 25% chance they find the cooking (no IPO, and maybe prosecutors)',
  'The report has a better plan for you: about $310K profit next year',
  'Worth pitching: a typical deal beats self-publishing by about $75K',
  'Worth it: about $14K more than it costs over 6 years',
  'A good fit: about $2.2M a year in synergies, worth about $9.5M over 7 years after fees and integration',
  'A sharp group CEO (about skill 82 at $250K a year) would add about $1.1M a year after pay',
  'Best move: about a 64% chance of a rave',
  'Best move by the numbers: about an 88% chance nobody notices',
  'Best move: the check beats the sales you give up',
  'Best move, by a hair: the options are nearly even',
  'Hire this role first: a good one adds about $65K a year after pay',
  'Keeping it should bring ~$90K over the years',
  'Dirty money: about 18% a year that investigators trace it, for years',
  'About 35% to calm them; if it fails you sell loans anyway',
  'Your reflexes are real: about 55% to beat the top score.',
  'Expect about $24K back after 3 years (+4% in today’s money): steady dividends.',
  'This sound is about to blow up on the charts this year.',
  "Players will be all over this genre in 2031, about when a game this size could be ready.",
  'Keep it closed: it is your best model, and open weights would cut your API sales by about a quarter.',
  'About 12 in 100 pieces sold this way are counterfeits.',
]

/** A money text such as "$412K", "$4.2M", "$9,400", "412K kr" as a number, or NaN. */
function amountOf(s: string): number {
  const m = /(\d[\d,]*(?:\.\d+)?)(K|M|B|T)?/.exec(s)
  if (!m) return Number.NaN
  const scale = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[m[2] as 'K' | 'M' | 'B' | 'T'] ?? 1
  return Number(m[1]!.replace(/,/g, '')) * scale
}

const sigDigits = (s: string): number => s.replace(/[^0-9]/g, '').replace(/^0+/, '').length

describe('Exact mode prints today’s text', () => {
  it('leaves 40 sampled hint strings as they are, through the lens and through talentHint', () => {
    expect(SAMPLES.length).toBe(40)
    const g = biz(1)
    for (const s of SAMPLES) {
      expect(lensHint(g, 'Business', s), s).toBe(s)
      expect(talentHint(g, 'Business', s), s).toBe(`${HINT_EMOJI} ${s}`)
    }
  })

  it('ranks by the true value, so markBest picks what it always picked (the first of a tie)', () => {
    const g = biz(1)
    expect(rankNoise(g, 'any', 1234.5)).toBe(1234.5)
    expect(rankNoise(g, 'any', -77)).toBe(-77)
    const choices: ChoiceOption[] = [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
    ]
    markBest(g, choices, (id) => ({ a: 1000, b: 1000, c: 400 })[id] ?? null)
    expect(choices.filter((c) => c.hint).map((c) => c.id)).toEqual(['a'])
    expect(choices[0]!.hint).toBe(`${HINT_EMOJI} Best move, by a hair: the options are nearly even`)
  })

  it('still gives no hint without the talent', () => {
    const g = fogGame(1)
    expect(talentHint(g, 'Business', 'about $5K')).toBe('')
    inFog(() => expect(talentHint(g, 'Business', 'about $5K')).toBe(''))
  })
})

describe('Realistic: the number after "about" is what the talent reads', () => {
  it('turns "about $412K" into a nearby amount in the same shape, and most lives read something else', () => {
    let same = 0
    inFog(() => {
      for (let i = 0; i < 300; i++) {
        const out = lensHint(biz(i), 'Business', 'Best campaign right now: about $412K back on top of its cost')
        expect(out, out).toMatch(/^Best campaign right now: about \$\d{3}K back on top of its cost$/)
        const v = amountOf(out)
        expect(v).toBeGreaterThan(412_000 * 0.55)
        expect(v).toBeLessThan(412_000 * 1.8)
        if (v === 412_000) same++
      }
    })
    expect(same).toBeLessThan(15)
  })

  it('keeps "about $4.2M" in millions and caps the digits at three', () => {
    inFog(() => {
      for (let i = 0; i < 100; i++) {
        const out = lensHint(biz(i), 'Business', 'worth about $4.2M over 6 years')
        expect(out, out).toMatch(/^worth about \$(?:\d\.\d{1,2}|\d{3})(?:M|K) over 6 years$/)
        expect(sigDigits(out.replace('over 6 years', ''))).toBeLessThanOrEqual(3)
      }
      for (let i = 0; i < 100; i++) {
        const out = lensHint(biz(i), 'Business', 'costs about $4,200 a year more than the damage it covers')
        expect(out, out).toMatch(/^costs about \$[\d,]+ a year more than the damage it covers$/)
        const v = amountOf(out)
        expect(v).toBeGreaterThan(2500)
        expect(v).toBeLessThan(7500)
        // three significant digits at most: $4,230, not $4,231
        expect(v % 10).toBe(0)
      }
    })
  })

  it('keeps the cents of a small amount ("about $0.35")', () => {
    inFog(() => {
      for (let i = 0; i < 100; i++) {
        const out = lensHint(biz(i), 'Business', 'a ticket is about $0.35 here')
        expect(out, out).toMatch(/^a ticket is about \$0\.\d\d here$/)
      }
    })
  })

  it('moves a whole percent of 10 or more to a multiple of 5, and keeps a small or decimal percent in its own shape', () => {
    inFog(() => {
      const seen = new Set<number>()
      for (let i = 0; i < 300; i++) {
        const out = lensHint(biz(i), 'Business', 'Your odds of passing: about 62%.')
        const m = /^Your odds of passing: about (\d+)%\.$/.exec(out)
        expect(m, out).not.toBeNull()
        const n = Number(m![1])
        expect(n % 5, out).toBe(0)
        expect(n).toBeGreaterThanOrEqual(35)
        expect(n).toBeLessThanOrEqual(100)
        seen.add(n)
      }
      expect(seen.size).toBeGreaterThan(4)
      for (let i = 0; i < 100; i++) {
        expect(lensHint(biz(i), 'Business', 'It lands about 8% of the time'), 'whole, under 10').toMatch(/^It lands about (?:[4-9]|1[0-4])% of the time$/)
        expect(lensHint(biz(i), 'Business', 'Best balance: about 2.50% a trade'), 'two decimals stay').toMatch(/^Best balance: about \d\.\d\d% a trade$/)
      }
    })
  })

  it('never shows a certain "100%" for a percent that is below 100, and keeps a plus or minus sign', () => {
    inFog(() => {
      for (let i = 0; i < 400; i++) {
        const out = lensHint(biz(i), 'Business', 'It works about 98% of the time')
        expect(out, out).not.toMatch(/about 100%/)
        expect(out, out).toMatch(/^It works about (?:\d{2})% of the time$/)
      }
      for (let i = 0; i < 50; i++) {
        expect(lensHint(biz(i), 'Business', 'About +8% a year before fees')).toMatch(/^About \+\d+% a year before fees$/)
        expect(lensHint(biz(i), 'Business', 'About −3.0% a year')).toMatch(/^About −\d\.\d% a year$/)
      }
    })
  })

  it('keeps "a" and "an" right when the percent moves ("about a 64%", "about an 88%")', () => {
    inFog(() => {
      const articles = new Set<string>()
      for (let i = 0; i < 400; i++) {
        for (const s of ['Best move: about a 64% chance of a rave', 'Best move by the numbers: about an 88% chance nobody notices']) {
          const out = lensHint(biz(i), 'Business', s)
          const m = /about (an?) (\d+)% chance/.exec(out)
          expect(m, out).not.toBeNull()
          const p = `${m![2]}%`
          const wantAn = /^8/.test(p) || /^1[18]%/.test(p)
          expect(m![1], out).toBe(wantAn ? 'an' : 'a')
          articles.add(m![1]!)
        }
      }
      expect(articles).toEqual(new Set(['a', 'an']))
    })
  })

  it('handles "~", "roughly" and "around", any case', () => {
    inFog(() => {
      const g = biz(7)
      expect(lensHint(g, 'Business', 'Expect to beat ~85% of peers')).toMatch(/^Expect to beat ~\d+% of peers$/)
      expect(lensHint(g, 'Business', 'worth ~$412K')).toMatch(/^worth ~\$\d{3}K$/)
      expect(lensHint(g, 'Business', 'Roughly $9.5M a year')).toMatch(/^Roughly \$\d(?:\.\d)?M a year$/)
      expect(lensHint(g, 'Business', 'around 30% of the crowd')).toMatch(/^around \d+% of the crowd$/)
      expect(lensHint(g, 'Business', 'ABOUT $90K')).toMatch(/^ABOUT \$\d+K$/)
    })
  })

  it('keeps "year" and "years" right for "in about N years"', () => {
    inFog(() => {
      const seen = new Set<string>()
      for (let i = 0; i < 300; i++) {
        const out = lensHint(biz(i), 'Business', 'they pay for themselves in about 3 years')
        const m = /in about (\d+) (years?)$/.exec(out)
        expect(m, out).not.toBeNull()
        expect(m![2], out).toBe(Number(m![1]) === 1 ? 'year' : 'years')
        expect(Number(m![1])).toBeGreaterThanOrEqual(1)
        seen.add(m![1]!)
      }
      expect(seen.size).toBeGreaterThan(1)
      for (let i = 0; i < 100; i++) {
        const out = lensHint(biz(i), 'Business', 'it pays back in about 1 year')
        expect(out, out).toMatch(/^it pays back in about (?:1 year|[2-9] years)$/)
      }
    })
  })

  it('leaves a limit alone when it is written without "about" or is not a money, percent or years figure', () => {
    const LIMITS = [
      'Keep it under $20K: above that the board will likely say no',
      'Above $50K a year the board will likely say no',
      'a pay cap of $120K',
      'Players will be all over this genre in 2031',
      'It lasts over 5 years',
      'Develop it over 5 years',
      '(62% odds, quality 4)',
      'Best R&D budget: $1.4M (62% odds, quality ~4)',
      'Odds 62%: team +9, funding +7, hard field -12',
      'the lab is worth 15% of the market',
      'about skill 82 at the going rate',
      'about 12 in 100 pieces',
      'a 30-year-old with about 3-4 years of runway',
      'This sound is about to blow up on the charts',
      'roughly a quarter of the staff',
    ]
    inFog(() => {
      for (let i = 0; i < 50; i++) for (const s of LIMITS) expect(lensHint(biz(i), 'Business', s), s).toBe(s)
    })
  })

  it('moves only the numbers after "about" in a longer text, and the rest stays word for word', () => {
    inFog(() => {
      const g = biz(3)
      const s = 'Best R&D budget: about $1.4M (62% odds, quality ~4, worth about $3M on average)'
      const out = lensHint(g, 'Business', s)
      expect(out).not.toBe(s)
      expect(out).toMatch(/^Best R&D budget: about \$[\d.]+[KM] \(62% odds, quality ~4, worth about \$[\d.]+[KM] on average\)$/)
    })
  })

  it('does not read a hint twice (a text that already carries the purple emoji is left alone)', () => {
    inFog(() => {
      const t = `${HINT_EMOJI} worth about $412K`
      expect(lensHint(biz(1), 'Business', t)).toBe(t)
    })
  })

  it('never throws or prints NaN on odd input', () => {
    inFog(() => {
      const g = biz(1)
      for (const s of ['', ' ', 'about', 'about $', 'about $K', 'about 0%', 'about $0', 'about -%', '~', 'about 1e400%', `about ${'9'.repeat(400)}%`, 'about $,,,', 'about 99999999999999999999 years', 'about $1,2,3']) {
        const out = lensHint(g, 'Business', s)
        expect(typeof out).toBe('string')
        expect(out, s).not.toMatch(/NaN|Infinity|undefined/)
      }
      expect(lensHint(g, 'Business', 'about 0%')).toBe('about 0%')
      expect(lensHint(g, 'Business', 'about $0')).toBe('about $0')
    })
  })
})

describe('Realistic: a currency keeps its shape', () => {
  const display = (country: string, fn: () => void): void => {
    setMoneyDisplay({ mode: 'local' })
    try {
      withMoneyContext({ countryId: country, year: 2026 }, fn)
    } finally {
      setMoneyDisplay({ mode: 'usd' })
    }
  }
  afterAll(() => setMoneyDisplay({ mode: 'usd' }))

  it('a symbol that goes after the number ("kr") stays after it', () => {
    display('se', () => {
      const text = `about ${money(4_000_000)} better`
      expect(text).toMatch(/kr better$/)
      inFog(() => {
        for (let i = 0; i < 80; i++) {
          const out = lensHint(biz(i), 'Business', text)
          expect(out, out).toMatch(/^about \d+(?:\.\d+)?[KMB]? kr better$/)
          expect(out).not.toBe('')
        }
        expect(new Set([...Array(80).keys()].map((i) => lensHint(biz(i), 'Business', text))).size).toBeGreaterThan(20)
      })
    })
  })

  it('a symbol of letters with a space ("CHF 412K") keeps its letters and its space', () => {
    display('ch', () => {
      const text = `worth about ${money(330_000)} a year`
      expect(text).toMatch(/CHF /)
      inFog(() => {
        for (let i = 0; i < 80; i++) {
          const out = lensHint(biz(i), 'Business', text)
          expect(out, out).toMatch(/^worth about CHF \d+(?:\.\d+)?[KM] a year$/)
        }
      })
    })
  })

  it('a currency of big numbers (rupiah) is read in its own units', () => {
    display('id', () => {
      const text = `worth about ${money(2_000_000)} over 5 years`
      expect(text).toMatch(/Rp /)
      inFog(() => {
        for (let i = 0; i < 80; i++) {
          const out = lensHint(biz(i), 'Business', text)
          expect(out, out).toMatch(/^worth about Rp \d+(?:\.\d+)?[MBT] over 5 years$/)
        }
      })
    })
  })

  it('a dollar sign is not read when the player’s money is shown in another symbol', () => {
    display('se', () => {
      inFog(() => {
        const t = 'costs about $50K a year'
        expect(lensHint(biz(1), 'Business', t)).toBe(t)
      })
    })
  })
})

describe('stable: the same text reads the same, another year, life or text reads another', () => {
  const T = 'Best campaign right now: about $412K back on top of its cost'

  it('gives one answer for one life, text and year, however often it is asked', () => {
    inFog(() => {
      const g = biz(5)
      const first = lensHint(g, 'Business', T)
      for (let k = 0; k < 20; k++) expect(lensHint(g, 'Business', T)).toBe(first)
      expect(talentHint(g, 'Business', T)).toBe(`${HINT_EMOJI} ${first}`)
      expect(lensHint(biz(5), 'Business', T)).toBe(first)
    })
  })

  it('changes with the year', () => {
    let differ = 0
    inFog(() => {
      for (let i = 0; i < 40; i++) {
        const t = `worth about $${300 + i}K`
        if (lensHint(biz(i, 2026), 'Business', t) !== lensHint(biz(i, 2027), 'Business', t)) differ++
      }
    })
    expect(differ).toBeGreaterThanOrEqual(34)
  })

  it('changes with the life', () => {
    const outs = new Set<string>()
    inFog(() => {
      for (let i = 0; i < 40; i++) outs.add(lensHint(biz(i), 'Business', T))
    })
    expect(outs.size).toBeGreaterThan(25)
  })

  it('follows the truth smoothly inside a year: the gut does not re-roll when the value drifts', () => {
    inFog(() => {
      const g = biz(11)
      const lo = amountOf(lensHint(g, 'Business', 'worth about $400K'))
      const hi = amountOf(lensHint(g, 'Business', 'worth about $440K'))
      // the same words, the same draw: the reading moves up with the value (10% more, so about 10% more, within rounding)
      expect(hi / lo).toBeGreaterThan(1.05)
      expect(hi / lo).toBeLessThan(1.15)
      // a figure in the text that is not after "about" does not re-roll it either
      const a = lensHint(g, 'Business', 'A sharp CEO (about skill 82 at $250K a year) adds about $1.1M')
      const b = lensHint(g, 'Business', 'A sharp CEO (about skill 82 at $260K a year) adds about $1.1M')
      expect(b.replace('$260K', '$250K')).toBe(a)
    })
  })

  it('reads two numbers in one text with two draws', () => {
    let alike = 0
    inFog(() => {
      for (let i = 0; i < 200; i++) {
        const out = lensHint(biz(i), 'Business', 'worth about $400K now and about $400K later')
        const m = /about \$(\d+)K now and about \$(\d+)K later/.exec(out)
        expect(m, out).not.toBeNull()
        if (m![1] === m![2]) alike++
      }
    })
    expect(alike).toBeLessThan(25)
  })
})

describe('honest: the number shown is within 1.28 sd of the truth about 80% of the time', () => {
  it('money, 10,000 lives, each its own draw', () => {
    const sd = inFog(() => know(biz(0), 'hint:Business:x:0', 1000, { unit: 'money', talent: 'Business' }).sd)
    expect(sd).toBeGreaterThan(0.05)
    const share = inFog(() => {
      let hit = 0
      for (let i = 0; i < N; i++) {
        const truth = Math.round(100 + 899 * unitAt('hint-money', i)) * 1000
        const out = lensHint(biz(i), 'Business', `Best campaign right now: about $${truth / 1000}K back`)
        const v = amountOf(out)
        if (Math.abs(Math.log(v / truth)) <= Z80 * sd) hit++
      }
      return hit / N
    })
    expect(share).toBeGreaterThan(0.78)
    expect(share).toBeLessThan(0.82)
  })

  it('percent, 10,000 lives: the nearest-5 rounding costs about a point', () => {
    // 40 to 80 percent: far enough from 100 that the "never a certainty" clamp cannot help the count.
    const sd = inFog(() => know(biz(0), 'hint:Business:x:0', 0.5, { unit: 'pct', talent: 'Business' }).sd)
    const share = inFog(() => {
      let hit = 0
      for (let i = 0; i < N; i++) {
        const whole = Math.round(40 + 40 * unitAt('hint-pct', i))
        const out = lensHint(biz(i), 'Business', `Your odds: about ${whole}%`)
        const v = Number(/about (\d+)%/.exec(out)![1])
        if (Math.abs(Math.log(v / whole)) <= Z80 * sd) hit++
      }
      return hit / N
    })
    expect(share).toBeGreaterThan(0.77)
    expect(share).toBeLessThan(0.82)
  })

  it('a talent holder reads sharper than a character without the talent would', () => {
    const sdWith = inFog(() => know(biz(0), 'hint:Business:x:0', 1000, { unit: 'money', talent: 'Business' }).sd)
    const sdWithout = inFog(() => know(fogGame(0), 'hint:Business:x:0', 1000, { unit: 'money', talent: 'Business' }).sd)
    expect(sdWith).toBeCloseTo(sdWithout * 0.6, 6)
    const sdMain = inFog(() => know(fogGame(0, { talents: ['MainCharacter'] }), 'hint:Business:x:0', 1000, { unit: 'money', talent: 'Business' }).sd)
    expect(sdMain).toBeCloseTo(sdWithout * 0.6, 6)
  })
})

describe('pure: no generator, no write', () => {
  it('leaves the game and g.rng as they were, and reads a deep-frozen game', () => {
    const g = fogGame(3, BIZ)
    const rngBefore = g.rng
    const before = JSON.stringify(g)
    inFog(() => {
      for (const s of SAMPLES) {
        lensHint(g, 'Business', s)
        talentHint(g, 'Business', s)
      }
      rankNoise(g, 'k', 1234)
      markBest(g, [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], (id) => (id === 'a' ? 1000 : 900))
    })
    expect(g.rng).toBe(rngBefore)
    expect(JSON.stringify(g)).toBe(before)
    const frozen = deepFreeze(JSON.parse(before) as GameState)
    inFog(() => {
      for (const s of SAMPLES) expect(() => talentHint(frozen, 'Business', s)).not.toThrow()
      expect(() => markBest(frozen, [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], (id) => (id === 'a' ? 1000 : 900))).not.toThrow()
    })
  })

  it('does not even name a generator: the lens files draw nothing', async () => {
    const { readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    for (const f of ['lens.ts', 'contract.ts']) {
      const text = readFileSync(fileURLToPath(new URL(`../src/game/fog/hint/${f}`, import.meta.url)), 'utf8')
      // the code, not the comments that say what it never does
      const src = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '')
      expect(src, f).not.toMatch(/\bg\.rng\b|Math\.random|\brng\(|nextRandom|seeded\(/)
    }
  })
})

describe('markBest ranks by the talent’s gut, so a close call can flip', () => {
  const mk = (): ChoiceOption[] => [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
    { id: 'x', label: 'Not an option' },
  ]
  const winner = (g: GameState, ev: (id: string) => number | null): string | undefined => {
    const c = mk()
    markBest(g, c, ev)
    return c.find((x) => x.hint)?.id
  }

  it('splits a seeded tie between the two options, and a close call both ways', () => {
    inFog(() => {
      let b = 0
      for (let i = 0; i < 400; i++) if (winner(biz(i), (id) => (id === 'a' || id === 'b' ? 1000 : null)) === 'b') b++
      expect(b).toBeGreaterThan(130)
      expect(b).toBeLessThan(270)
      let flips = 0
      for (let i = 0; i < 400; i++) if (winner(biz(i), (id) => (id === 'a' ? 1000 : id === 'b' ? 950 : null)) === 'b') flips++
      expect(flips).toBeGreaterThan(40)
      expect(flips).toBeLessThan(200)
    })
  })

  it('does not flip a clear call', () => {
    inFog(() => {
      for (let i = 0; i < 400; i++) expect(winner(biz(i), (id) => (id === 'a' ? 100_000 : id === 'b' ? 10_000 : null))).toBe('a')
    })
  })

  it('never invents an option: only a scored option is marked, and one option alone gets no hint', () => {
    inFog(() => {
      for (let i = 0; i < 200; i++) {
        const c = mk()
        markBest(biz(i), c, (id) => (id === 'a' ? 5 : id === 'b' ? 4 : null))
        expect(c.filter((x) => x.hint).length).toBe(1)
        expect(['a', 'b']).toContain(c.find((x) => x.hint)!.id)
        expect(c.find((x) => x.id === 'x')!.hint).toBeUndefined()
        const one = mk()
        markBest(biz(i), one, (id) => (id === 'a' ? 5 : null))
        expect(one.some((x) => x.hint)).toBe(false)
      }
    })
  })

  it('ranks negative values too (a loss is a value), and a zero stays a zero', () => {
    inFog(() => {
      for (let i = 0; i < 100; i++) expect(winner(biz(i), (id) => (id === 'a' ? -100_000 : id === 'b' ? -10_000 : null))).toBe('b')
      for (let i = 0; i < 100; i++) expect(winner(biz(i), (id) => (id === 'a' ? 50_000 : id === 'b' ? 0 : null))).toBe('a')
    })
  })

  it('writes the margin through the lens: a number that is not the true gap, in the same shape', () => {
    const ev = (id: string): number | null => (id === 'a' ? 100_000 : id === 'b' ? 40_000 : null)
    const c0 = mk()
    markBest(biz(1), c0, ev)
    expect(c0[0]!.hint).toBe(`${HINT_EMOJI} Best move: about $60,000 better than the next best option`)
    let differ = 0
    inFog(() => {
      for (let i = 0; i < 100; i++) {
        const c = mk()
        markBest(biz(i), c, ev)
        const m = /^\u{1F52E} Best move: about \$([\d,]+) better than the next best option$/u.exec(c[0]!.hint!)
        expect(m, c[0]!.hint).not.toBeNull()
        if (Number(m![1]!.replace(/,/g, '')) !== 60_000) differ++
      }
    })
    expect(differ).toBeGreaterThan(80)
  })

  it('gives a flipped pair a margin that is still a size, never a negative or a "by about $0"', () => {
    inFog(() => {
      let flipped = 0
      for (let i = 0; i < 400; i++) {
        const seen: number[] = []
        const c = mk()
        markBest(biz(i), c, (id) => (id === 'a' ? 100_000 : id === 'b' ? 98_000 : null), (_id, margin) => {
          seen.push(margin)
          return undefined
        })
        const id = c.find((x) => x.hint)!.id
        if (id === 'b') flipped++
        expect(seen.length).toBe(1)
        expect(seen[0]).toBeGreaterThanOrEqual(0)
        expect(seen[0]).toBe(2000)
      }
      expect(flipped).toBeGreaterThan(0)
    })
  })

  it('asks the reason for the option it marked, not for the true best', () => {
    inFog(() => {
      for (let i = 0; i < 200; i++) {
        const c = mk()
        markBest(biz(i), c, (id) => (id === 'a' ? 100 : id === 'b' ? 99 : null), (id) => `Best move: option ${id}`)
        const marked = c.find((x) => x.hint)!
        expect(marked.hint).toBe(`${HINT_EMOJI} Best move: option ${marked.id}`)
      }
    })
  })
})

describe('rankNoise', () => {
  it('is honest, stable and pure', () => {
    const g = biz(2)
    inFog(() => {
      const v = rankNoise(g, 'k|a', 80_000)
      expect(rankNoise(g, 'k|a', 80_000)).toBe(v)
      expect(rankNoise(g, 'k|b', 80_000)).not.toBe(v)
      expect(rankNoise(biz(3), 'k|a', 80_000)).not.toBe(v)
      expect(rankNoise(biz(2, 2027), 'k|a', 80_000)).not.toBe(v)
      expect(Math.abs(v - 80_000)).toBeLessThan(80_000 * 0.52)
      expect(rankNoise(g, 'k|a', 0)).toBe(0)
      expect(rankNoise(g, 'k|a', Number.NaN)).toBeNaN()
      expect(Math.sign(rankNoise(g, 'k|a', -80_000))).toBe(-1)
    })
  })

  it('holds the truth in the same 80% band the hint numbers use', () => {
    const sd = inFog(() => know(biz(0), 'hint:Business:x:0', 1000, { unit: 'delta', talent: 'Business', scale: 1000 }).sd)
    const share = inFog(() => {
      let hit = 0
      for (let i = 0; i < N; i++) {
        const truth = 1000 + 9000 * unitAt('rank', i)
        if (Math.abs(rankNoise(biz(i), 'k|a', truth) - truth) <= Z80 * sd * truth) hit++
      }
      return hit / N
    })
    expect(share).toBeGreaterThan(0.78)
    expect(share).toBeLessThan(0.82)
  })
})

describe('cleanHint still caps a lensed hint', () => {
  it('keeps a long hint within HINT_MAX and drops the emoji', () => {
    inFog(() => {
      const long = `Best move: ${'the gut says go. '.repeat(30)}worth about $412K more than it costs`
      const g = biz(4)
      const shown = cleanHint(talentHint(g, 'Business', long))
      expect(shown.length).toBeLessThanOrEqual(HINT_MAX)
      expect(shown.startsWith(HINT_EMOJI)).toBe(false)
      const short = cleanHint(talentHint(g, 'Business', 'worth about $412K more than it costs'))
      expect(short).toMatch(/^worth about \$\d{3}K more than it costs$/)
      expect(short).not.toBe('worth about $412K more than it costs')
    })
  })
})

describe('talentHint runs the lens, the port is bound after the real entry points, and unbound it does nothing', () => {
  it('talentHint is the emoji plus the lens of the text in Realistic, and the text in Exact', () => {
    const g = biz(9)
    const s = 'Best campaign right now: about $412K back on top of its cost'
    expect(talentHint(g, 'Business', s)).toBe(`${HINT_EMOJI} ${s}`)
    inFog(() => {
      expect(talentHint(g, 'Business', s)).toBe(`${HINT_EMOJI} ${lensHint(g, 'Business', s)}`)
      expect(lensHint(g, 'Business', s)).not.toBe(s)
    })
  })

  it('binds talents.hintLens once aging and menus have loaded', async () => {
    vi.resetModules()
    await import('../src/game/aging')
    await import('../src/game/menus')
    const { portStatus } = await import('../src/game/kernel/ports')
    expect(portStatus().find((p) => p.name === 'talents.hintLens')).toEqual({ name: 'talents.hintLens', bound: true })
    // the fresh copy of talents.ts runs the fresh copy of the lens
    const t = await import('../src/game/talents')
    expect(t.hintLens.bound).toBe(true)
    const { withInfoMode } = await import('../src/game/knowledge/mode')
    const g = biz(9)
    const s = 'Best campaign right now: about $412K back on top of its cost'
    expect(withInfoMode('realistic', () => t.talentHint(g, 'Business', s))).not.toBe(`${HINT_EMOJI} ${s}`)
    expect(t.talentHint(g, 'Business', s)).toBe(`${HINT_EMOJI} ${s}`)
  }, 120_000)

  it('is a plain pass-through while nothing is bound (a test that never loaded the lens)', async () => {
    vi.resetModules()
    const t = await import('../src/game/talents')
    expect(t.hintLens.bound).toBe(false)
    const { withInfoMode } = await import('../src/game/knowledge/mode')
    const g = biz(9)
    const s = 'worth about $412K'
    expect(withInfoMode('realistic', () => t.talentHint(g, 'Business', s))).toBe(`${HINT_EMOJI} ${s}`)
  }, 120_000)

  it('reads a percent written by the pct helper the way it reads a typed one', () => {
    inFog(() => {
      const g = biz(12)
      const text = `The big push lands about ${pct(0.4)} of the time`
      const out = talentHint(g, 'Business', text)
      expect(out).toMatch(/^\u{1F52E} The big push lands about \d+% of the time$/u)
    })
  })
})
