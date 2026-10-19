import { describe, expect, it } from 'vitest'
import { PRESENT_YEAR } from '../src/game/history/timeline'
import { newBiz } from '../src/game/business/founding'
import { hire, ownerKey } from '../src/game/special/common'
import { oddsText } from '../src/game/special/kit/crisis'
import { activeField } from '../src/game/special/kit/rivals'
import { agencyOpen, FACE_AGENCIES, kindLabel, kindOpen, KINDS } from '../src/game/special/model-data'
import {
  bookAfter,
  castPlan,
  commissionFor,
  labelHeadStart,
  lookValue,
  marketFactor,
  MODEL_SPEC,
  rankingOf,
  renewalOdds,
  scoreOf,
  settleFee,
  shelf,
  strainNext,
  strainRisk,
} from '../src/game/special/model-core'
import { modelStore, type MdOffer } from '../src/game/special/model-state'
import type { GameState, Json } from '../src/game/types'
import { makeTestGame } from './helpers'

/** A deterministic stream of numbers in [0, 1) for the property tests. */
function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** A 1995 life, age 22, looks 60, signed to Silhouette Models, with the given headshot. */
function life(opts: { looks?: number; headshot?: number; headshotAge?: number; skill?: number; age?: number; year?: number } = {}): GameState {
  const g = makeTestGame(7, { age: opts.age ?? 22 })
  g.year = opts.year ?? 1995
  g.character.stats.looks = opts.looks ?? 60
  g.flags['special.model'] = { owner: ownerKey(g), headshot: opts.headshot ?? 40, headshotAge: opts.headshotAge ?? g.character.age, couture: [], gigs: 0, fashionWeeks: 0, rejectedBy: [] } as unknown as Json
  if (opts.skill !== undefined) g.flags['skill.modeling'] = opts.skill as unknown as Json
  hire(g, { defId: 'model', title: 'New Face', company: 'Silhouette Models', salary: 32_000, data: { tier: 1, gigsThisYear: 0, sabotaged: 0 } })
  return g
}

describe('model shelf', () => {
  it('follows the shelf table by focus, age, talent, 1990 and 2010', () => {
    // before the prime: 0.75 at 16, +0.05 a year, 1 from 21
    expect(shelf('runway', 16, false, 2000)).toBeCloseTo(0.75, 10)
    expect(shelf('runway', 18, false, 2000)).toBeCloseTo(0.85, 10)
    expect(shelf('runway', 21, false, 2000)).toBe(1)
    expect(shelf('editorial', 24, false, 2000)).toBe(1)
    expect(shelf('runway', 12, false, 2000)).toBeCloseTo(0.75, 10) // under 16 reads as 16
    // prime ends at 24 runway, 30 editorial, 36 commercial; Modeling adds 2
    expect(shelf('runway', 24, false, 2000)).toBe(1)
    expect(shelf('runway', 25, false, 2000)).toBeCloseTo(1 - 0.07, 10)
    expect(shelf('runway', 25, true, 2000)).toBe(1)
    expect(shelf('runway', 26, true, 2000)).toBe(1)
    expect(shelf('runway', 27, true, 2000)).toBeCloseTo(1 - 0.07, 10)
    expect(shelf('editorial', 31, false, 2000)).toBeCloseTo(1 - 0.05, 10)
    expect(shelf('editorial', 33, true, 2000)).toBeCloseTo(1 - 0.05, 10)
    expect(shelf('commercial', 36, false, 2000)).toBe(1)
    expect(shelf('commercial', 38, false, 2000)).toBeCloseTo(1 - 2 * 0.035, 10)
    // floors .25 / .35 / .45, +.05 from 1990, +.10 from 2010
    expect(shelf('runway', 60, false, 1980)).toBeCloseTo(0.25, 10)
    expect(shelf('editorial', 70, false, 1980)).toBeCloseTo(0.35, 10)
    expect(shelf('commercial', 80, false, 1980)).toBeCloseTo(0.45, 10)
    expect(shelf('runway', 60, false, 1989)).toBeCloseTo(0.25, 10)
    expect(shelf('runway', 60, false, 1990)).toBeCloseTo(0.3, 10)
    expect(shelf('runway', 60, false, 2009)).toBeCloseTo(0.3, 10)
    expect(shelf('runway', 60, false, 2010)).toBeCloseTo(0.35, 10)
    expect(shelf('commercial', 80, false, 2020)).toBeCloseTo(0.55, 10)
    // it never rises with age after the prime and stays in [floor, 1]
    for (const focus of ['runway', 'editorial', 'commercial'] as const) {
      let last = 1
      for (let age = 21; age <= 90; age++) {
        const v = shelf(focus, age, false, 2000)
        expect(v).toBeLessThanOrEqual(last + 1e-12)
        expect(v).toBeGreaterThan(0.2)
        last = v
      }
    }
    // junk never breaks it
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(Number.isFinite(shelf('runway', bad, false, bad))).toBe(true)
    }
  })

  it('makes a New Face (looks 60, headshot 40, skill 20) base 55 and lookValue fall past strain 60', () => {
    const g = life({ looks: 60, headshot: 40, skill: 20 })
    const s = modelStore.view(g)
    // base = .6 x 60 + .15 x 40 x fresh + .15 x 20 + 10 = 36 + 6 + 3 + 10 = 55; age 22 editorial, shelf 1
    expect(lookValue(g, { ...s, focus: 'editorial', strain: 0 })).toBeCloseTo(55, 10)
    expect(lookValue(g, { ...s, focus: 'editorial', strain: 60 })).toBeCloseTo(55, 10)
    expect(lookValue(g, { ...s, focus: 'editorial', strain: 70 })).toBeCloseTo(55 * (1 - 0.06), 10)
    expect(lookValue(g, { ...s, focus: 'editorial', strain: 100 })).toBeCloseTo(55 * (1 - 0.24), 10)
    let last = 100
    for (let strain = 0; strain <= 100; strain += 5) {
      const v = lookValue(g, { ...s, focus: 'editorial', strain })
      expect(v).toBeLessThanOrEqual(last + 1e-12)
      last = v
    }
    // a stale headshot (more than 3 years old) is worth 0.8 of a fresh one
    const stale = life({ looks: 60, headshot: 40, skill: 20, headshotAge: 18 })
    expect(lookValue(stale, { ...modelStore.view(stale), focus: 'editorial', strain: 0 })).toBeCloseTo(36 + 6 * 0.8 + 3 + 10, 10)
    // no headshot, no skill: looks and the flat 10 only
    const bare = life({ looks: 60, headshot: 0, skill: 0 })
    expect(lookValue(bare, { ...modelStore.view(bare), focus: 'editorial', strain: 0 })).toBeCloseTo(46, 10)
    // past the prime the shelf cuts it: runway at 26 (two years past 24)
    const older = life({ looks: 60, headshot: 40, skill: 20, age: 26 })
    expect(lookValue(older, { ...modelStore.view(older), focus: 'runway', strain: 0 })).toBeCloseTo(55 * (1 - 0.07 * 2), 10)
    // the result is finite and inside 0 to 100 for hostile numbers
    const hot = life({ looks: 100, headshot: 100, skill: 100 })
    const v = lookValue(hot, { ...modelStore.view(hot), strain: NaN })
    expect(Number.isFinite(v)).toBe(true)
    expect(v).toBeLessThanOrEqual(100)
  })
})

describe('model fees and odds', () => {
  it('conserves fees over 500 random inputs', () => {
    const r = lcg(12345)
    for (let i = 0; i < 500; i++) {
      const fee = Math.round(r() * 2_000_000)
      const a = r() * 40
      const m = r() * 15
      const un = Math.round(r() * 30_000)
      const x = settleFee(fee, a, m, un)
      expect(x.agency + x.mother + x.recoup + x.net).toBe(fee)
      for (const n of [x.agency, x.mother, x.recoup, x.net]) {
        expect(Number.isInteger(n)).toBe(true)
        expect(n).toBeGreaterThanOrEqual(0)
      }
      expect(x.recoup).toBeLessThanOrEqual(un)
    }
    expect(settleFee(20_000, 25, 5, 2_000)).toEqual({ agency: 5000, mother: 1000, recoup: 2000, net: 12_000 })
    expect(settleFee(20_000, 25, 5, 0)).toEqual({ agency: 5000, mother: 1000, recoup: 0, net: 14_000 })
    // the recoup takes what is left when the advance is bigger than the rest
    expect(settleFee(1000, 20, 0, 5000)).toEqual({ agency: 200, mother: 0, recoup: 800, net: 0 })
    // a fraction of a fee rounds once, and the parts still add up
    const y = settleFee(1234.6, 18, 5, 100)
    expect(y.agency + y.mother + y.recoup + y.net).toBe(1235)
    // hostile input pays nothing and never goes negative or non-finite
    for (const [fee, a, m, un] of [[NaN, 20, 5, 0], [-100, 20, 5, 0], [1000, NaN, NaN, NaN], [1000, 500, 500, 0], [1000, -5, -5, -5], [Infinity, 20, 5, 0]]) {
      const z = settleFee(fee, a, m, un)
      for (const n of Object.values(z)) {
        expect(Number.isFinite(n)).toBe(true)
        expect(n).toBeGreaterThanOrEqual(0)
      }
      expect(z.agency + z.mother + z.recoup + z.net).toBe(Number.isFinite(fee) ? Math.max(0, Math.round(fee)) : 0)
    }
  })

  it('keeps commission 12-30 and odds .05-.92, rising with fit; ranking is monotone in score', () => {
    for (let tier = 0; tier <= 3; tier++) {
      let last = 99
      for (let rep = 0; rep <= 100; rep += 5) {
        for (const guarantee of [true, false]) {
          const c = commissionFor(tier, rep, guarantee)
          expect(c).toBeGreaterThanOrEqual(12)
          expect(c).toBeLessThanOrEqual(30)
        }
        const c = commissionFor(tier, rep, false)
        expect(c).toBeLessThanOrEqual(last)
        last = c
      }
    }
    expect([commissionFor(0, 0, false), commissionFor(1, 0, false), commissionFor(2, 0, false), commissionFor(3, 0, false)]).toEqual([18, 20, 20, 22])
    expect(commissionFor(1, 0, true)).toBe(23)
    expect(commissionFor(1, 100, false)).toBe(17) // reputation trims 3
    expect(commissionFor(1, 100, true)).toBe(20)
    expect(commissionFor(NaN, NaN, false)).toBe(18)
    expect(commissionFor(99, 1e9, true)).toBeGreaterThanOrEqual(12)

    // castPlan: odds stay inside .05 to .92 and rise with the player's standing
    const g = life({ looks: 80, headshot: 70, skill: 40 })
    const offer: MdOffer = { id: 'm1', kind: 'runway', season: 'aw', circuit: 'Paris', brand: 'Client', house: 'Atelier Noir', fee: 9000, days: 3, minLook: 40, minTitle: 2, abroad: false, window: 0, rivals: [], status: 'open', terms: null }
    const field = activeField(g, MODEL_SPEC)
    expect(field.length).toBeGreaterThan(5)
    const withRivals = { ...offer, rivals: [field[0].rival.id, field[1].rival.id] }
    let last = -1
    for (let standing = 0; standing <= 100; standing += 10) {
      const s = { ...modelStore.view(g), standing }
      for (const o of [offer, withRivals]) {
        const p = castPlan(g, s, o)
        expect(p.odds).toBeGreaterThanOrEqual(0.05)
        expect(p.odds).toBeLessThanOrEqual(0.92)
        expect(Number.isFinite(p.fit) && Number.isFinite(p.rivalMean)).toBe(true)
        expect(p.fit).toBeGreaterThanOrEqual(0)
        expect(p.fit).toBeLessThanOrEqual(100)
      }
      const p = castPlan(g, s, withRivals)
      expect(p.odds).toBeGreaterThanOrEqual(last)
      last = p.odds
    }
    expect(castPlan(g, { ...modelStore.view(g), standing: 0 }, withRivals).odds).toBe(0.05)
    const middling = { ...offer, rivals: [field[5].rival.id, field[6].rival.id] }
    expect(castPlan(g, { ...modelStore.view(g), standing: 100 }, middling).odds).toBeGreaterThan(0.5)
    expect(castPlan(g, { ...modelStore.view(g), standing: 100 }, middling).odds).toBeGreaterThan(castPlan(g, { ...modelStore.view(g), standing: 100 }, withRivals).odds)

    // ranking is monotone in score: more book never ranks worse; the label 'outside the top 50' is above 50
    let prev = 1e9
    for (let book = 0; book <= 100; book += 4) {
      const r = rankingOf(g, { ...modelStore.view(g), book, buzz: book, rep: book })
      expect(r).toBeLessThanOrEqual(prev)
      prev = r
    }
    const nobody = life({ looks: 0, headshot: 0, skill: 0 })
    // the long-tail term adds 40 below a score of 10, so the last places read 'outside the top 50' (above 50)
    expect(rankingOf(nobody, { ...modelStore.view(nobody), book: 0, buzz: 0, rep: 0 })).toBeGreaterThan(40)
    expect(rankingOf(g, { ...modelStore.view(g), book: 100, buzz: 100, rep: 100 })).toBeLessThanOrEqual(8)
    // scoreOf weights .35 / .30 / .20 / .15 and stays in 0-100
    expect(scoreOf(100, 0, 0, 0)).toBeCloseTo(35, 10)
    expect(scoreOf(0, 100, 0, 0)).toBeCloseTo(30, 10)
    expect(scoreOf(0, 0, 100, 0)).toBeCloseTo(20, 10)
    expect(scoreOf(0, 0, 0, 100)).toBeCloseTo(15, 10)
    expect(scoreOf(NaN, 1e9, -5, 100)).toBeLessThanOrEqual(100)

    // renewal odds: logistic((rep + book - 90) / 20) clamped .10 to .85
    expect(renewalOdds(0, 0)).toBe(0.1)
    expect(renewalOdds(100, 100)).toBe(0.85)
    expect(renewalOdds(50, 40)).toBeCloseTo(0.5, 10)
    let up = 0
    for (let n = 0; n <= 100; n += 10) {
      const o = renewalOdds(n, n)
      expect(o).toBeGreaterThanOrEqual(up)
      up = o
    }
  })

  it('shortlists rivals by their own fit and falls back to an average rival', () => {
    const g = life({ looks: 70, headshot: 60, skill: 30 })
    const s = { ...modelStore.view(g), standing: 50 }
    const field = activeField(g, MODEL_SPEC)
    const base: MdOffer = { id: 'm2', kind: 'editorial', season: 'ss', circuit: 'Milan', brand: 'the client', house: 'Halo Monthly', fee: 5000, days: 2, minLook: 30, minTitle: 1, abroad: false, window: 0, rivals: [], status: 'open', terms: null }
    const none = castPlan(g, s, base)
    const weak = castPlan(g, s, { ...base, rivals: [field[field.length - 1].rival.id] })
    const strong = castPlan(g, s, { ...base, rivals: [field[0].rival.id] })
    expect(strong.rivalMean).toBeGreaterThanOrEqual(weak.rivalMean)
    expect(strong.odds).toBeLessThanOrEqual(weak.odds)
    expect(Number.isFinite(none.rivalMean)).toBe(true)
    // an unknown rival id is skipped like no rival at all
    expect(castPlan(g, s, { ...base, rivals: ['nobody-here'] })).toEqual(none)
    // the same inputs give the same plan and never touch g.rng
    const rng = g.rng
    const again = castPlan(g, s, { ...base, rivals: [field[0].rival.id] })
    expect(again).toEqual(strong)
    expect(g.rng).toBe(rng)
    // a home casting fits 4 points better than an abroad one
    const away = castPlan(g, s, { ...base, abroad: true })
    expect(none.fit - away.fit).toBe(4)
  })

  it('computes strain, injury risk and the book as designed', () => {
    expect(strainNext(10, 0, 0, 0)).toBe(0)
    expect(strainNext(60, 20, 1, 0)).toBeCloseTo(0.5 * 60 + 1.2 * 20 + 6 - 10, 10)
    expect(strainNext(100, 40, 4, 0)).toBe(100)
    expect(strainNext(50, 10, 0, 30)).toBe(Math.max(0, 25 + 12 - 10 - 30))
    expect(strainNext(NaN, NaN, NaN, NaN)).toBe(0)
    expect(strainRisk(0)).toBeCloseTo(0.02, 10)
    expect(strainRisk(55)).toBeCloseTo(0.02, 10)
    expect(strainRisk(65)).toBeCloseTo(0.08, 10)
    expect(strainRisk(100)).toBeCloseTo(0.29, 10)
    expect(strainRisk(1e9)).toBeCloseTo(0.29, 10)
    expect(strainRisk(NaN)).toBeCloseTo(0.02, 10)
    // a luxury campaign is 1.2 x 6 = 7.2 points; four a year settle near 79
    let book = 0
    for (let year = 0; year < 40; year++) book = bookAfter(book, [{ points: 7.2 }, { points: 7.2 }, { points: 7.2 }, { points: 7.2 }])
    expect(book).toBeGreaterThan(76)
    expect(book).toBeLessThan(80)
    // two mass campaigns (1.2 x 2.5 = 3 points) settle near 44
    book = 0
    for (let year = 0; year < 60; year++) book = bookAfter(book, [{ points: 3 }, { points: 3 }])
    expect(book).toBeGreaterThan(42)
    expect(book).toBeLessThan(46)
    // one win takes (100 - book) x points / 100 at most half the gap; the year then x0.93
    expect(bookAfter(0, [{ points: 10 }])).toBeCloseTo(10 * 0.93, 10)
    expect(bookAfter(50, [{ points: 80 }])).toBeCloseTo(75 * 0.93, 10)
    expect(bookAfter(50, [])).toBeCloseTo(46.5, 10)
    expect(bookAfter(NaN, [{ points: NaN }])).toBe(0)
    expect(bookAfter(100, [{ points: 50 }])).toBeCloseTo(93, 10)
  })
})

describe('model world', () => {
  it('pins labelHeadStart to newBiz(...).brand', () => {
    for (const fame of [-40, 0, 7, 33, 90, 100, 177, 240, 500]) {
      const g = makeTestGame(2, { age: 30 })
      g.character.hidden.fame = fame
      expect(labelHeadStart(g)).toBe(newBiz(g, 'fashion', 'us', 'New York').brand)
    }
    const g = makeTestGame(2, { age: 30 })
    g.character.hidden.fame = 64
    expect(labelHeadStart(g)).toBe(31)
  })

  it('keeps marketFactor in .6-1.4 over 1930-2025 and agencies from 1925 only', () => {
    for (let year = 1930; year <= 2025; year++) {
      for (const country of ['us', 'fr', 'jp', 'ng', 'br']) {
        const g = makeTestGame(1, { age: 30, countryId: country })
        g.year = year
        const f = marketFactor(g)
        expect(f).toBeGreaterThanOrEqual(0.6)
        expect(f).toBeLessThanOrEqual(1.4)
      }
    }
    expect(Object.keys(FACE_AGENCIES)).toHaveLength(4)
    for (const name of Object.keys(FACE_AGENCIES)) {
      expect(agencyOpen(name, 1924)).toBe(false)
      expect(agencyOpen(name, 1900)).toBe(false)
    }
    expect([agencyOpen('Hometown Faces', 1925), agencyOpen('Silhouette Models', 1925), agencyOpen('Prestige Model Management', 1945), agencyOpen('Prestige Model Management', 1946), agencyOpen('Icon Elite', 1959), agencyOpen('Icon Elite', 1960)]).toEqual([true, true, false, true, false, true])
    expect(agencyOpen('Unknown House', 2000)).toBe(false)
    expect([FACE_AGENCIES['Silhouette Models'].book, FACE_AGENCIES['Prestige Model Management'].book, FACE_AGENCIES['Icon Elite'].book]).toEqual([12, 30, 50])
  })

  it('opens kinds by year, technology and followers; nothing is dated after the present', () => {
    const at = (year: number, followers = 0, country = 'us'): string[] => {
      const g = makeTestGame(1, { age: 30, countryId: country })
      g.year = year
      return (Object.keys(KINDS) as (keyof typeof KINDS)[]).filter((k) => kindOpen(g, k, followers))
    }
    expect(at(1910)).toEqual(['catalogue', 'couture'])
    expect(at(1935)).toEqual(['catalogue', 'editorial', 'cover', 'couture', 'campaign'])
    expect(at(1935)).not.toContain('commercial')
    expect(at(1935, 1e9)).not.toContain('digital')
    expect(at(1950)).toContain('runway')
    expect(at(1950)).not.toContain('face')
    expect(at(1975)).toContain('face')
    expect(at(1975)).toContain('commercial')
    expect(at(2010, 5_000)).not.toContain('digital')
    expect(at(2015, 25_000)).toContain('digital')
    expect(at(2015, 19_999)).not.toContain('digital')
    for (const def of Object.values(KINDS)) expect(def.from).toBeLessThanOrEqual(PRESENT_YEAR)
    const g = makeTestGame(1, { age: 30 })
    g.year = 1990
    expect(kindLabel(g, 'catalogue')).toBe('Catalogue shoot')
    g.year = 2015
    expect(kindLabel(g, 'catalogue')).toBe('E-commerce shoot')
  })

  it('builds the hint text from the castPlan odds rounded to 5%', () => {
    const g = life({ looks: 70, headshot: 60, skill: 30 })
    const s = { ...modelStore.view(g), standing: 45 }
    const field = activeField(g, MODEL_SPEC)
    const o: MdOffer = { id: 'm3', kind: 'campaign', season: 'year', circuit: 'Paris', brand: 'the client', house: 'Maison Lumière', fee: 20_000, days: 3, minLook: 40, minTitle: 2, abroad: false, window: 0, rivals: [field[0].rival.id, field[1].rival.id], status: 'open', terms: null }
    for (const standing of [0, 20, 40, 60, 80, 100]) {
      const plan = castPlan(g, { ...s, standing }, o)
      const text = oddsText(plan.odds)
      expect(text).toMatch(/^about \d+%$/)
      expect(Number(text.match(/\d+/)![0]) % 5).toBe(0)
      expect(Math.abs(Number(text.match(/\d+/)![0]) - plan.odds * 100)).toBeLessThanOrEqual(2.5 + 1e-9)
    }
  })
})
