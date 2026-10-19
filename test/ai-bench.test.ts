import { describe, expect, it } from 'vitest'
import { CAP_IDS, CAPS, isCapId } from '../src/game/business/ai-bench-data'
import { LEAD_ENDING, RATING_OFFSET, benchHard, benchScore, benchYear, capBest, capMilestone, capOpen, capWeight, compositeRating, leadTier, modelRating, modelScore, modelSpec, modelStrength, releasedRating, type RatingInput } from '../src/game/business/ai-bench'
import { TECH } from '../src/game/history/timeline'

const OPENS = { language: 2012, coding: 2021, vision: 2012, speech: 2012, reasoning: 2014, agents: 2022, robotics: 2016, science: 2017 }
const MILES = { language: [1300, 1450, 1650], coding: [1400, 1500, 1700], vision: [1300, 1450, 1650], speech: [1250, 1400, 1600], reasoning: [1300, 1450, 1650], agents: [1150, 1300, 1500], robotics: [800, 950, 1150], science: [1000, 1150, 1350] }
describe('data', () => {
  it('has eight capabilities with weights summing to 1, sorted anchors from the opening year to 2026, and eras in TECH', () => {
    expect(CAP_IDS).toHaveLength(8); expect(CAP_IDS.reduce((s, c) => s + CAPS[c].weight, 0)).toBeCloseTo(1, 9)
    for (const c of CAP_IDS) { const a = CAPS[c].anchors; expect([capOpen(c), a[0][0], a[a.length - 1][0], CAPS[c].era in TECH]).toEqual([OPENS[c], OPENS[c], 2026, true])
      a.forEach((p, i) => { if (i) { expect(p[0]).toBeGreaterThan(a[i - 1][0]); expect(p[1]).toBeGreaterThanOrEqual(a[i - 1][1]) } }) }
    expect([isCapId('coding'), isCapId('constructor'), isCapId('__proto__'), isCapId(7)]).toEqual([true, false, false, false])
  })
  it('capWeight is 0 before a capability opens and rescales the open ones to 1', () => {
    expect([capWeight('coding', 2020), capWeight('language', 2012)]).toEqual([0, expect.closeTo(0.52, 9)])
    for (const y of [2012, 2016, 2021, 2026, 2100]) expect(CAP_IDS.reduce((s, c) => s + capWeight(c, y), 0)).toBeCloseTo(1, 9)
    expect(CAP_IDS.reduce((s, c) => s + capWeight(c, 2011), 0)).toBe(0)
  })
})
describe('capBest', () => {
  it('follows the anchors in whole numbers, is flat before the first, clamps years, and history ignores the family', () => {
    expect([capBest('a', 'language', 2013), capBest('a', 'language', 2015), capBest('a', 'language', 2016), capBest('a', 'language', 2026)]).toEqual([233, 300, 360, 1260])
    expect([capBest('a', 'coding', 2015), capBest('a', 'language', 1900)]).toEqual([300, 200])
    for (const c of CAP_IDS) for (let y = 2012; y <= 2026; y++) expect(capBest('a', c, y)).toBe(capBest('zzz', c, y))
  })
  it('drifts after 2026: same family same path, families differ, at least +5 a year, 2200 clamp, about +53 in 2027', () => {
    for (const c of CAP_IDS) for (let y = 2027; y <= 2200; y++) expect(capBest('a', c, y) - capBest('a', c, y - 1)).toBeGreaterThanOrEqual(5)
    expect(capBest('a', 'language', 2060)).not.toBe(capBest('b', 'language', 2060)); expect(capBest('a', 'vision', 9999)).toBe(capBest('a', 'vision', 2200))
    const mean = Array.from({ length: 60 }, (_, i) => capBest(`f${i}`, 'language', 2027) - 1260).reduce((s, x) => s + x, 0) / 60
    expect(mean).toBeGreaterThan(46); expect(mean).toBeLessThan(60)
  })
  it('capMilestone is three steps above the 2026 best, rounded to 50', () => { for (const c of CAP_IDS) expect([1, 2, 3].map((k) => capMilestone(c, k as 1 | 2 | 3))).toEqual(MILES[c]) })
})
describe('benchmarks', () => {
  it('benchScore is a logistic in rating minus difficulty, 0 to 99', () => {
    expect([benchScore(500, 500), benchScore(600, 500), benchScore(-1e9, 0), benchScore(1e9, 0)]).toEqual([50, 67, 0, 99])
    for (let r = 0; r < 3000; r += 100) expect(benchScore(r + 100, 800)).toBeGreaterThanOrEqual(benchScore(r, 800))
  })
  it('a generation opens with the best lab at 67 and retires before it passes 90: hard only rises, in steps of 300, scores stay 50 to 92 to 2100', () => {
    for (const f of ['test-life', 'alpha', 'bravo']) for (const c of CAP_IDS) {
      const o = capOpen(c); expect(benchScore(capBest(f, c, o), benchHard(f, c, o))).toBe(67)
      let prev = 0, lo = 99, hi = 0
      for (let y = o; y <= 2100; y++) { const h = benchHard(f, c, y), s = benchScore(capBest(f, c, y), h); lo = Math.min(lo, s); hi = Math.max(hi, s); expect(h).toBeGreaterThanOrEqual(prev); expect((h - benchHard(f, c, o)) % 300).toBe(0); prev = h }
      expect(lo).toBeGreaterThanOrEqual(50); expect(hi).toBeLessThanOrEqual(92)
    }
  })
})
const base: RatingInput = { cap: 'language', year: 2026, fam: 'a', gen: 6, level: 70, compute: 3.6, research: 0, spec: 0, roll: 0.5, released: 0 }
const R = (o: Partial<RatingInput> = {}) => modelRating({ ...base, ...o })
describe('modelRating', () => {
  it('puts a typical lab within 40 of the best and moves by its coefficients below the ceiling', () => {
    expect(R()).toBeGreaterThan(1260 - 40); expect(R()).toBeLessThanOrEqual(1260 + 10)
    const lo = { level: 20, gen: 1, compute: 0 }, d = (o: Partial<RatingInput>, n: number) => expect(Math.abs(R({ ...lo, ...o }) - R(lo) - n)).toBeLessThanOrEqual(1)
    d({ level: 30 }, 27); d({ gen: 2 }, 15); d({ compute: 1 }, 9); d({ research: 1 }, 20); d({ roll: 1 }, 60); d({ spec: 10 }, 10)
    expect(R({ ...lo, gen: 8 })).toBe(R({ ...lo, gen: 12 }))
  })
  it('never leads the market by more than 90 whatever the lab has released, lifts the reference to a release under that ceiling, and never drops below 1', () => {
    const huge = { level: 100, gen: 8, compute: 12, research: 10, roll: 1 }
    expect(R(huge)).toBeGreaterThan(1260 + 60); expect(R(huge)).toBeLessThanOrEqual(1260 + 90)
    // A release 40 over the market lifts the reference: a raw rating below it counts in full instead of being compressed, and a huge one still stops at the ceiling.
    expect(R({ roll: 1, released: 1300 })).toBeGreaterThan(R({ roll: 1 })); expect(R({ ...huge, released: 1300 })).toBeGreaterThan(1300 + 40); expect(R({ ...huge, released: 1300 })).toBeLessThanOrEqual(1260 + 90)
    for (const released of [1349, 1350, 1500, 5000]) expect(R({ ...huge, released })).toBeLessThanOrEqual(1260 + 90)
    expect(R({ ...huge, released: 1500 })).toBe(1260 + 90)   // a release past the ceiling (an old save) lifts nothing
    expect(R({ cap: 'coding', year: 2012, level: 0, gen: 1, compute: 0, roll: 0 })).toBe(1)
    expect(RATING_OFFSET).toBeGreaterThan(0)
  })
  it('modelSpec is a zero-mean seeded offset within 35, stable per (family, gen, capability)', () => {
    expect(modelSpec('a', 3, 'coding')).toBe(modelSpec('a', 3, 'coding')); expect(modelSpec('a', 3, 'coding')).not.toBe(modelSpec('a', 4, 'coding'))
    const xs = Array.from({ length: 400 }, (_, i) => modelSpec('a', i + 1, CAP_IDS[i % 8])); expect(Math.max(...xs.map(Math.abs))).toBeLessThanOrEqual(35); expect(Math.abs(xs.reduce((s, x) => s + x, 0) / 400)).toBeLessThan(5)
  })
})
describe('composites', () => {
  const m = (o: object) => ({ gen: 1, name: 'N 1', score: 50, open: false, year: 2026, ...o })
  it('modelStrength uses base weights; compositeRating and modelScore use the weights of the year; releasedRating skips held', () => {
    expect(modelStrength({})).toBe(0); expect(modelStrength({ rating: { language: 1000, coding: 500 } })).toBeCloseTo(340, 6)
    expect(compositeRating(undefined, 2026)).toBe(0); expect(compositeRating({ language: 1000, coding: 500 }, 2020)).toBeCloseTo((0.26 / 0.74) * 1000, 6); expect(compositeRating({ language: 1000, coding: 500 }, 2026)).toBeCloseTo(340, 6)
    expect(modelScore('a', { language: 200, vision: 300, speech: 300 }, 2012)).toBe(67); expect(modelScore('a', {}, 2026)).toBe(0)
    expect(releasedRating([m({ rating: { language: 900 } }), m({ rating: { language: 1500 }, held: true }), m({})], 'language')).toBe(900); expect(releasedRating([], 'language')).toBe(0)
  })
  it('benchYear is the last closed fiscal year; leadTier splits at 0 and -60 and carries the ending', () => {
    expect([benchYear({ year: 2027 }), benchYear({ year: 2027.9 })]).toEqual([2026, 2027])
    expect([leadTier(1), leadTier(0), leadTier(-60), leadTier(-61)]).toEqual(['leads', 'close', 'close', 'trails'])
    expect(LEAD_ENDING).toEqual({ leads: 'It leads the field.', close: "It's close to the best.", trails: 'It trails the best.' })
  })
})
