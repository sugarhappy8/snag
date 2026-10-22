// R3-H2 (H.1): the estimate core. know/estimate give an honest, stable and pure Estimate for any key, in Exact or Realistic mode.
//
//   honest  the 80% band holds the truth 80% of the time (10,000 draws per unit, each draw its own life), with the Business
//           talent, and for a stored row that has aged with a simulated drift
//   stable  the same life, key and year give the same number; another year or another life another one; truth x3 on a log scale
//           moves the number x3
//   pure    nothing is written, g.rng does not move, and knowledge/** has no way to draw (a token scan)
//   exact   Exact mode and own: keys return the truth
//
// The suite runs in Exact (test/setup-exact.ts). Every Realistic case goes through inFog (test/knowledge-kit.ts).
import { describe, expect, it } from 'vitest'
import {
  BAND_Z,
  SD_MIN,
  agedSd,
  estimate,
  know,
  mergeReadings,
  readValue,
  type Estimate,
  type StoredRow,
  type Unit,
} from '../src/game/knowledge/contract'
import { sharpFactor } from '../src/game/knowledge/estimate'
import { RULES, isExactKey, parseKey, ruleOf } from '../src/game/knowledge/keys'
import { zOf } from '../src/game/knowledge/normal'
import { K_ID, ROOT, isPunct, loadSources } from './scan-kit'
import { coverage, deepFreeze, fogGame, inFog, unitAt } from './knowledge-kit'

const N = 10_000
const LOW = 0.77
const HIGH = 0.83

/** One key per unit, with a truth that spreads over a real range (so the log scales are exercised across decades). */
interface Case {
  unit: Unit
  key: string
  truth: (i: number) => number
  opts?: { scale?: number }
}
const CASES: Case[] = [
  { unit: 'money', key: 'mkt:cafe:us:size', truth: (i) => 10 ** (4 + 7 * unitAt('money', i)) },
  { unit: 'count', key: 'mkt:cafe:us:units', truth: (i) => 10 ** (2 + 6 * unitAt('count', i)) },
  { unit: 'pct', key: 'mkt:cafe:us:share', truth: (i) => 0.005 + 0.6 * unitAt('pct', i) },
  // Away from the ends of the scale: within Z sd of an end the band is clipped, which only ever helps (see 'near the ends').
  { unit: 'score', key: 'riv:r1:quality', truth: (i) => 40 + 20 * unitAt('score', i) },
  { unit: 'odds', key: 'odds:x:rd:p', truth: (i) => 0.3 + 0.4 * unitAt('odds', i) },
  { unit: 'delta', key: 'scn:s1:value', truth: (i) => -60e6 + 120e6 * unitAt('delta', i), opts: { scale: 200e6 } },
]

describe('honest: the 80% band holds the truth', () => {
  for (const c of CASES) {
    it(`${c.unit}: ${c.key}, 10,000 draws, each its own life`, () => {
      const share = inFog(() =>
        coverage(N, (i) => {
          const truth = c.truth(i)
          return { est: know(fogGame(i), c.key, truth, c.opts), truth }
        }),
      )
      expect(share).toBeGreaterThan(LOW)
      expect(share).toBeLessThan(HIGH)
    })

    it(`${c.unit}: with the Business talent the band is narrower and still holds the truth about 80% of the time`, () => {
      const wide = inFog(() => know(fogGame(1), c.key, c.truth(1), c.opts))
      const sharp = inFog(() => know(fogGame(1, { talents: ['Business'] }), c.key, c.truth(1), c.opts))
      expect(sharp.sd).toBeCloseTo(wide.sd * 0.6, 9)
      const share = inFog(() =>
        coverage(N, (i) => {
          const truth = c.truth(i)
          return { est: know(fogGame(i, { talents: ['Business'] }), c.key, truth, c.opts), truth }
        }),
      )
      expect(share).toBeGreaterThan(LOW)
      expect(share).toBeLessThan(HIGH)
    })
  }

  it('near the ends of a bounded scale the clipped band holds the truth at least 80% of the time, never less', () => {
    for (const [key, lo, span] of [['riv:r1:quality', 0, 100], ['odds:x:rd:p', 0, 1]] as const) {
      const share = inFog(() =>
        coverage(N, (i) => {
          const truth = lo + span * unitAt('ends' + key, i)
          return { est: know(fogGame(i), key, truth), truth }
        }),
      )
      expect(share, key).toBeGreaterThan(0.79)
      expect(share, key).toBeLessThan(0.93)
    }
  })

  it('the band constant is the 80% point of the draw it is built from (the sum of six uniforms, unit variance)', () => {
    // Irwin-Hall n=6 CDF at 3 + t, with t = BAND_Z / sqrt 2, must be 0.9 (so P(|z| <= BAND_Z) = 0.8) within a tenth of a point.
    const fact = (n: number): number => (n <= 1 ? 1 : n * fact(n - 1))
    const choose = (n: number, k: number): number => fact(n) / (fact(k) * fact(n - k))
    const cdf = (x: number): number => {
      let s = 0
      for (let k = 0; k <= Math.floor(x); k++) s += (k % 2 ? -1 : 1) * choose(6, k) * (x - k) ** 6
      return s / fact(6)
    }
    const inside = 2 * cdf(3 + BAND_Z / Math.SQRT2) - 1
    expect(Math.abs(inside - 0.8)).toBeLessThan(0.001)
  })

  it('zOf is a unit-variance draw centred on 0, within 4.25 (the support of six uniforms)', () => {
    let sum = 0
    let sq = 0
    let max = 0
    for (let i = 0; i < N; i++) {
      const z = zOf(fogGame(i), 'mkt:cafe:us:size', 2026, 'passive')
      sum += z
      sq += z * z
      max = Math.max(max, Math.abs(z))
    }
    expect(Math.abs(sum / N)).toBeLessThan(0.03)
    expect(sq / N).toBeGreaterThan(0.95)
    expect(sq / N).toBeLessThan(1.05)
    expect(max).toBeLessThanOrEqual(3 * Math.SQRT2 + 1e-9)
  })

  it('a stored row that has aged with a simulated drift: the shown row band holds today\'s truth about 80% of the time', () => {
    const key = 'mkt:cafe:us:size' // drift .06, passive sd .25
    const years = 3
    let rowShown = 0
    const share = inFog(() =>
      coverage(N, (i) => {
        const g = fogGame(i, { year: 2030 })
        const truth0 = 10 ** (6 + 2 * unitAt('aged', i))
        const sdRow = 0.06
        const row: StoredRow = { mid: truth0 * Math.exp(sdRow * zOf(g, key, 2030 - years, 'sim-read')), sd: sdRow, y: 2030 - years, src: 'press' }
        const truth = truth0 * Math.exp(0.06 * Math.sqrt(years) * zOf(g, key, 2030, 'sim-world'))
        const est = estimate(g, key, truth, { row })
        if (est.src === 'press') rowShown++
        return { est, truth }
      }),
    )
    expect(rowShown).toBe(N) // the aged row (sd .12) is sharper than the passive read (.25)
    expect(share).toBeGreaterThan(LOW)
    expect(share).toBeLessThan(HIGH)
  })

  it('shows the sharper of the aged row and the passive read, and the choice never looks at the truth', () => {
    const key = 'riv:r1:cash' // sd0 .60, drift .35: a 3-year-old row of sd .10 has aged to sqrt(.01 + .3675) = .614, worse than passive
    const g = fogGame(5, { year: 2030 })
    const row: StoredRow = { mid: 2e6, sd: 0.1, y: 2027, src: 'report' }
    const old = inFog(() => estimate(g, key, 3e6, { row }))
    expect(old.src).toBe('passive')
    const fresh = inFog(() => estimate(g, key, 3e6, { row: { ...row, y: 2029 } }))
    expect(fresh.src).toBe('report')
    expect(fresh.y).toBe(2029)
    expect(fresh.mid).toBe(2e6)
    // the choice is made from sd alone: a different truth picks the same source
    for (const truth of [1, 5e3, 3e6, 9e12]) {
      expect(inFog(() => estimate(g, key, truth, { row })).src).toBe('passive')
      expect(inFog(() => estimate(g, key, truth, { row: { ...row, y: 2029 } })).src).toBe('report')
    }
    // coverage over 10,000 draws of this mixed choice
    const share = inFog(() =>
      coverage(N, (i) => {
        const gi = fogGame(i, { year: 2030 })
        const truth0 = 10 ** (5 + 3 * unitAt('mix', i))
        const r: StoredRow = { mid: truth0 * Math.exp(0.1 * zOf(gi, key, 2029, 'sim-read')), sd: 0.1, y: 2029, src: 'report' }
        const truth = truth0 * Math.exp(0.35 * zOf(gi, key, 2030, 'sim-world'))
        return { est: estimate(gi, key, truth, { row: r }), truth }
      }),
    )
    expect(share).toBeGreaterThan(LOW)
    expect(share).toBeLessThan(HIGH)
  })

  it('a row that fails, or comes from a year after g.year, is ignored (no foresight)', () => {
    const key = 'mkt:cafe:us:size'
    const g = fogGame(3, { year: 2030 })
    const base = inFog(() => estimate(g, key, 5e6))
    const bad: Array<StoredRow | null> = [
      null,
      { mid: 5e6, sd: 0.05, y: 2031, src: 'press' }, // a reading from next year
      { mid: -4, sd: 0.05, y: 2029, src: 'press' }, // not above 0 on a log scale
      { mid: Number.NaN, sd: 0.05, y: 2029, src: 'press' },
      { mid: 5e6, sd: 0, y: 2029, src: 'press' },
      { mid: 5e6, sd: Number.NaN, y: 2029, src: 'press' },
      { mid: 5e6, sd: 0.05, y: Number.NaN, src: 'press' },
    ]
    for (const row of bad) expect(inFog(() => estimate(g, key, 5e6, { row })), JSON.stringify(row)).toEqual(base)
  })
})

describe('stable: the same life, key and year give the same number', () => {
  for (const c of CASES) {
    it(`${c.unit}: twice is the same JSON, another year or life is another number`, () => {
      const g = fogGame(7)
      const a = inFog(() => know(g, c.key, c.truth(7), c.opts))
      const b = inFog(() => know(g, c.key, c.truth(7), c.opts))
      expect(JSON.stringify(b)).toBe(JSON.stringify(a))
      const next = inFog(() => know({ ...g, year: g.year + 1 }, c.key, c.truth(7), c.opts))
      expect(next.mid).not.toBe(a.mid)
      expect(next.y).toBe(g.year + 1)
      const other = inFog(() => know(fogGame(8), c.key, c.truth(7), c.opts))
      expect(other.mid).not.toBe(a.mid)
      const otherKey = inFog(() => know(g, c.key + 'x', c.truth(7), c.opts))
      expect(otherKey.mid).not.toBe(a.mid)
    })
  }

  it('truth x3 on a log unit keeps mid / truth; score and odds keep mid - truth', () => {
    const g = fogGame(11)
    for (const key of ['mkt:cafe:us:size', 'mkt:cafe:us:units', 'mkt:cafe:us:share']) {
      const a = inFog(() => know(g, key, 2e5))
      const b = inFog(() => know(g, key, 6e5))
      expect(b.mid / 6e5).toBeCloseTo(a.mid / 2e5, 9)
      expect(b.hi / b.lo).toBeCloseTo(a.hi / a.lo, 9)
    }
    const mild = [...Array(40).keys()].find((i) => ['riv:r1:quality', 'odds:x:rd:p'].every((k) => Math.abs(zOf(fogGame(i), k, 2026, 'passive')) < 1))!
    const b = fogGame(mild, { talents: ['Business'] }) // a mild draw keeps the reading off the ends of the scale
    const s1 = inFog(() => know(b, 'riv:r1:quality', 50))
    const s2 = inFog(() => know(b, 'riv:r1:quality', 60))
    expect(s1.mid).toBeGreaterThan(0)
    expect(s1.mid).toBeLessThan(100)
    expect(s2.mid - 60).toBeCloseTo(s1.mid - 50, 9)
    const o1 = inFog(() => know(b, 'odds:x:rd:p', 0.5))
    const o2 = inFog(() => know(b, 'odds:x:rd:p', 0.6))
    expect(o1.mid).toBeGreaterThan(0)
    expect(o1.mid).toBeLessThan(1)
    expect(o2.mid - 0.6).toBeCloseTo(o1.mid - 0.5, 9)
  })

  it('shapes: log units centre the band on the geometric mean, linear units on the arithmetic one', () => {
    const g = fogGame(12)
    const m = inFog(() => know(g, 'mkt:cafe:us:size', 3e6))
    expect(m.lo).toBeLessThan(m.mid)
    expect(m.mid).toBeLessThan(m.hi)
    expect(Math.sqrt(m.lo * m.hi) / m.mid).toBeCloseTo(1, 9)
    // a life whose draw is mild, so the reading stays off the ends of the scale (clipping would move the centre of the band)
    const mild = [...Array(40).keys()].find((i) => Math.abs(zOf(fogGame(i), 'riv:r1:quality', 2026, 'passive')) < 1)!
    const s = inFog(() => know(fogGame(mild, { talents: ['Business'] }), 'riv:r1:quality', 50))
    expect((s.lo + s.hi) / 2).toBeCloseTo(s.mid, 9)
    const d = inFog(() => know(g, 'scn:s1:value', 12e6, { scale: 100e6 }))
    expect((d.lo + d.hi) / 2).toBeCloseTo(d.mid, 3)
    // a delta band is absolute: sd x scale
    expect(d.hi - d.lo).toBeCloseTo(2 * BAND_Z * d.sd * 100e6, 3)
  })

  it('exposure sharpens the passive read by up to 40%, and readValue is the mid', () => {
    const g = fogGame(13)
    const a = inFog(() => know(g, 'mkt:cafe:us:size', 4e6))
    const b = inFog(() => know(g, 'mkt:cafe:us:size', 4e6, { exp: 1 }))
    expect(b.sd).toBeCloseTo(a.sd * 0.6, 9)
    expect(inFog(() => know(g, 'mkt:cafe:us:size', 4e6, { exp: 7 })).sd).toBeCloseTo(a.sd * 0.6, 9)
    expect(inFog(() => know(g, 'mkt:cafe:us:size', 4e6, { exp: -3 })).sd).toBeCloseTo(a.sd, 9)
    expect(inFog(() => know(g, 'mkt:cafe:us:size', 4e6, { exp: Number.NaN })).sd).toBeCloseTo(a.sd, 9)
    expect(inFog(() => readValue(g, 'mkt:cafe:us:size', 4e6))).toBe(a.mid)
  })

  it('a unit option overrides the rule (a mkt.* key is a count unless the caller says it is a percent)', () => {
    const g = fogGame(14)
    const c = inFog(() => know(g, 'mkt:cafe:us:growth', 0.08))
    const p = inFog(() => know(g, 'mkt:cafe:us:growth', 0.08, { unit: 'pct' }))
    expect(c.words).not.toContain('%')
    expect(p.words).toContain('%')
  })

  it('bounds and edges: score and odds stay in range, and a truth outside the range is read as its end', () => {
    for (let i = 0; i < 400; i++) {
      const g = fogGame(i)
      for (const [key, hi] of [['riv:r1:quality', 100], ['odds:x:rd:p', 1]] as const) {
        for (const truth of [0, hi * 0.02, hi * 0.98, hi, hi * 3, -hi]) {
          const e = inFog(() => know(g, key, truth))
          expect(e.lo).toBeGreaterThanOrEqual(0)
          expect(e.hi).toBeLessThanOrEqual(hi)
          expect(e.lo).toBeLessThanOrEqual(e.mid)
          expect(e.mid).toBeLessThanOrEqual(e.hi)
        }
      }
    }
  })
})

describe('pure: a read changes nothing and draws nothing', () => {
  it('reads a deep-frozen game: g.rng and the JSON are unchanged', () => {
    const g = deepFreeze(structuredClone(fogGame(21, { talents: ['Business'] })))
    const before = JSON.stringify(g)
    const rng = g.rng
    inFog(() => {
      for (const c of CASES) {
        know(g, c.key, c.truth(3), c.opts)
        estimate(g, c.key, c.truth(3), { ...c.opts, row: { mid: c.truth(4), sd: 0.1, y: g.year - 1, src: 'press' } })
        readValue(g, c.key, c.truth(3), c.opts)
      }
    })
    expect(g.rng).toBe(rng)
    expect(JSON.stringify(g)).toBe(before)
  })

  it('knowledge/** has no way to draw: no rand, chance, pick, shuffle, .rng, Math.random or Date', () => {
    const files = loadSources(ROOT, 'src/game/knowledge')
    expect(files.map((f) => f.path)).toEqual(expect.arrayContaining(['src/game/knowledge/estimate.ts', 'src/game/knowledge/normal.ts']))
    const BANNED = new Set(['rand', 'randInt', 'randFloat', 'chance', 'pick', 'weightedPick', 'shuffle', 'bell', 'Date', 'uid'])
    const found: string[] = []
    for (const f of files) {
      f.toks.forEach((t, i) => {
        if (t.k !== K_ID) return
        const prev = f.toks[i - 1]
        if (BANNED.has(t.v)) found.push(`${f.path}: ${t.v}`)
        if (t.v === 'rng' && isPunct(prev, '.')) found.push(`${f.path}: .rng`)
        if (t.v === 'random' && isPunct(prev, '.') && f.toks[i - 2]?.v === 'Math') found.push(`${f.path}: Math.random`)
      })
    }
    expect(found).toEqual([])
    expect(files.every((f) => f.toks.length > 0)).toBe(true)
  })

  it('the memo is only a cache: a read after thousands of other reads equals the first read', () => {
    const g = fogGame(31)
    const first = JSON.stringify(inFog(() => know(g, 'mkt:cafe:us:size', 9e6)))
    for (let i = 0; i < 2000; i++) inFog(() => know(fogGame(1000 + i), 'mkt:cafe:us:size', 9e6))
    expect(JSON.stringify(inFog(() => know(g, 'mkt:cafe:us:size', 9e6)))).toBe(first)
  })
})

describe('exact: Exact mode and own: keys return the truth', () => {
  it('Exact mode (the suite default) returns the truth for every unit', () => {
    for (const c of CASES) {
      const g = fogGame(2)
      const truth = c.truth(2)
      const e: Estimate = know(g, c.key, truth, c.opts)
      expect(e.exact, c.key).toBe(true)
      expect(e.mid).toBe(truth)
      expect(e.lo).toBe(truth)
      expect(e.hi).toBe(truth)
      expect(e.conf).toBe(3)
      expect(e.sd).toBe(0)
      expect(e.src).toBe('exact')
      expect(e.y).toBe(g.year)
      expect(e.asOf).toBeUndefined()
      expect(e.words.length).toBeGreaterThan(0)
    }
  })

  it('an own: key is exact in Realistic mode too, and no rule row is needed', () => {
    const g = fogGame(3)
    for (const key of ['own:cash', 'own:co1:revenue', 'own:co1:site:rent']) {
      const e = inFog(() => know(g, key, 123_456))
      expect(e.exact).toBe(true)
      expect(e.mid).toBe(123_456)
      expect(isExactKey(key)).toBe(true)
    }
    expect(isExactKey('mkt:cafe:us:size')).toBe(false)
  })

  it('a key with no rule, a malformed key and a truth that cannot be read give the exact estimate, never NaN', () => {
    const g = fogGame(4)
    const long = `mkt:${'x'.repeat(40)}:${'y'.repeat(30)}:size`
    expect(long.length).toBeGreaterThan(64)
    for (const key of ['', 'plain', 'nokind:a:b', 'mkt:only', `mkt:a:b:c:d:size`, long, 'MKT:a:b', 'mkt:a b:c']) {
      const e = inFog(() => know(g, key, 5e6))
      expect(e.exact, key).toBe(true)
      expect(e.mid).toBe(5e6)
    }
    for (const truth of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const e = inFog(() => know(g, 'mkt:cafe:us:size', truth))
      expect(e.exact).toBe(true)
      for (const v of [e.mid, e.lo, e.hi, e.sd, e.conf, e.y]) expect(Number.isFinite(v), `${truth}`).toBe(true)
      expect(e.words).not.toMatch(/NaN|undefined|Infinity/)
    }
  })

  it('a delta with no usable scale falls back to |truth|, and a zero truth with no scale is exact', () => {
    const g = fogGame(5)
    const a = inFog(() => know(g, 'scn:s1:value', 8e6))
    expect(a.exact).toBe(false)
    expect(a.hi - a.lo).toBeCloseTo(2 * BAND_Z * a.sd * 8e6, 3)
    const b = inFog(() => know(g, 'scn:s1:value', -8e6, { scale: Number.NaN }))
    expect(b.exact).toBe(false)
    expect(b.hi - b.lo).toBeCloseTo(2 * BAND_Z * b.sd * 8e6, 3)
    expect(inFog(() => know(g, 'scn:s1:value', 0)).exact).toBe(true)
    expect(inFog(() => know(g, 'scn:s1:value', 0, { scale: 5e6 })).exact).toBe(false)
  })
})

describe('mergeReadings and agedSd', () => {
  it('two .2 reads merge to .1414, and never below the 3% floor', () => {
    for (const unit of ['money', 'count', 'pct', 'score', 'odds', 'delta'] as const) {
      const m = mergeReadings({ mid: 10, sd: 0.2 }, { mid: 10, sd: 0.2 }, unit)
      expect(m.sd).toBeCloseTo(0.2 / Math.SQRT2, 9)
      expect(m.sd).toBeCloseTo(0.1414, 4)
      const tight = mergeReadings({ mid: 10, sd: 0.03 }, { mid: 10, sd: 0.03 }, unit)
      expect(tight.sd).toBe(SD_MIN)
      expect(mergeReadings({ mid: 10, sd: 0.001 }, { mid: 10, sd: 0.001 }, unit).sd).toBe(SD_MIN)
    }
    expect(SD_MIN).toBe(0.03)
  })

  it('weights by inverse variance in the scale of the unit: geometric on a log unit, arithmetic on a linear one', () => {
    const log = mergeReadings({ mid: 1e6, sd: 0.1 }, { mid: 4e6, sd: 0.1 }, 'money')
    expect(log.mid).toBeCloseTo(2e6, 0)
    const lin = mergeReadings({ mid: 20, sd: 0.1 }, { mid: 80, sd: 0.1 }, 'score')
    expect(lin.mid).toBeCloseTo(50, 9)
    const heavy = mergeReadings({ mid: 20, sd: 0.1 }, { mid: 80, sd: 0.2 }, 'score')
    expect(heavy.mid).toBeCloseTo((20 * 100 + 80 * 25) / 125, 9)
    expect(heavy.mid).toBeLessThan(50)
  })

  it('is symmetric, and a reading that cannot be used leaves the other one', () => {
    const a = { mid: 3e6, sd: 0.2 }
    const b = { mid: 5e6, sd: 0.1 }
    const ab = mergeReadings(a, b, 'money')
    const ba = mergeReadings(b, a, 'money')
    expect(ab.mid).toBeCloseTo(ba.mid, 3)
    expect(ab.sd).toBeCloseTo(ba.sd, 12)
    expect(mergeReadings({ mid: -1, sd: 0.2 }, b, 'money')).toEqual(b)
    expect(mergeReadings(a, { mid: Number.NaN, sd: 0.2 }, 'money')).toEqual({ mid: a.mid, sd: a.sd })
    const none = mergeReadings({ mid: Number.NaN, sd: 0 }, { mid: 0, sd: Number.NaN }, 'money')
    expect(Number.isFinite(none.mid) && Number.isFinite(none.sd)).toBe(true)
  })

  it('agedSd grows with the square root of the age, starts at sd, and ignores junk', () => {
    expect(agedSd(0.1, 0.06, 0)).toBeCloseTo(0.1, 12)
    expect(agedSd(0.1, 0.06, 4)).toBeCloseTo(Math.sqrt(0.01 + 0.06 ** 2 * 4), 12)
    expect(agedSd(0, 0.06, 4)).toBeCloseTo(2 * agedSd(0, 0.06, 1), 12)
    expect(agedSd(0, 0.06, 9)).toBeCloseTo(3 * agedSd(0, 0.06, 1), 12)
    expect(agedSd(0.1, 0, 50)).toBeCloseTo(0.1, 12)
    expect(agedSd(0.1, 0.06, -5)).toBeCloseTo(0.1, 12)
    expect(agedSd(0.1, Number.NaN, 5)).toBeCloseTo(0.1, 12)
    expect(Number.isFinite(agedSd(Number.NaN, 0.06, Number.NaN))).toBe(true)
  })
})

describe('extremes: finite fields for any truth', () => {
  it('100x truths up to 1e15 give finite, ordered fields on every unit', () => {
    const g = fogGame(41)
    inFog(() => {
      for (let e10 = -3; e10 <= 15; e10 += 2) {
        const t = 10 ** e10
        for (const c of CASES) {
          const unit = c.unit
          const truth = unit === 'score' ? Math.min(100, t) : unit === 'odds' ? Math.min(1, t) : t
          const e = know(g, c.key, truth, c.opts)
          for (const v of [e.mid, e.lo, e.hi, e.sd]) expect(Number.isFinite(v), `${c.key} ${t}`).toBe(true)
          expect(e.lo).toBeLessThanOrEqual(e.mid)
          expect(e.mid).toBeLessThanOrEqual(e.hi)
          expect(e.words, `${c.key} ${t}`).not.toMatch(/NaN|undefined|Infinity/)
        }
      }
    })
  })

  it('a tiny truth on a log unit stays positive', () => {
    const g = fogGame(42)
    const e = inFog(() => know(g, 'mkt:cafe:us:size', 1e-9))
    expect(e.lo).toBeGreaterThan(0)
  })
})

describe('talents sharpen the right kinds only', () => {
  const at = (key: string, talents: readonly string[], opts = {}): number =>
    inFog(() => know(fogGame(50, { talents }), key, key.startsWith('riv') || key.startsWith('cast') || key.startsWith('peer') || key.startsWith('pol') ? 50 : 4e6, opts).sd)

  it('Business: markets, rivals, candidates, odds, scorecards, hints; not securities or valuations', () => {
    for (const [key, sd0] of [['mkt:cafe:us:size', 0.25], ['riv:r1:quality', 0.3], ['riv:r1:cash', 0.6], ['cmp:r1:rev', 0.25], ['cand:abc:skill', 0.18], ['odds:x:rd:p', 0.2], ['ev:a:b', 0.3], ['scn:s1:value', 0.3]] as const) {
      expect(at(key, []), key).toBeCloseTo(sd0, 9)
      expect(at(key, ['Business']), key).toBeCloseTo(sd0 * 0.6, 9)
      expect(at(key, ['Investing']), key).toBeCloseTo(sd0, 9)
    }
    for (const key of ['sec:x:vol', 'fund:x:ret', 'val:x:value']) {
      expect(at(key, ['Business']), key).toBeCloseTo(at(key, []), 9)
      expect(at(key, ['Investing']), key).toBeCloseTo(at(key, []) * 0.6, 9)
    }
  })

  it('Acting or Modeling: casting and peers', () => {
    const base = at('cast:a:fame', [])
    expect(at('cast:a:fame', ['Acting'])).toBeCloseTo(base * 0.6, 9)
    expect(at('cast:a:fame', ['Modeling'])).toBeCloseTo(base * 0.6, 9)
    expect(at('peer:a:fame', ['Modeling'])).toBeCloseTo(base * 0.6, 9)
    expect(at('cast:a:fame', ['Acting', 'Modeling'])).toBeCloseTo(base * 0.6, 9) // one factor, not two
    expect(at('cast:a:fame', ['Business'])).toBeCloseTo(base, 9)
  })

  it('Main Character sharpens every key that is read, including the ones that list no talent', () => {
    for (const key of ['mkt:cafe:us:size', 'riv:r1:quality', 'sec:x:vol', 'val:x:value', 'cast:a:fame', 'eco:us:inflation', 'pol:us:approval', 'ppl:a:smarts', 'war:w1:odds']) {
      expect(at(key, ['MainCharacter']), key).toBeCloseTo(Math.max(SD_MIN, at(key, []) * 0.6), 9)
    }
    expect(inFog(() => know(fogGame(51, { talents: ['MainCharacter'] }), 'own:cash', 5)).exact).toBe(true)
  })

  it('the source factor is .8 and the passive factor .6, by the same rule', () => {
    const g = fogGame(52, { talents: ['Business'] })
    const plain = fogGame(52)
    expect(sharpFactor(g, 'mkt:cafe:us:size', 'passive')).toBe(0.6)
    expect(sharpFactor(g, 'mkt:cafe:us:size', 'source')).toBe(0.8)
    expect(sharpFactor(plain, 'mkt:cafe:us:size', 'passive')).toBe(1)
    expect(sharpFactor(plain, 'mkt:cafe:us:size', 'source')).toBe(1)
    expect(sharpFactor(g, 'sec:x:vol', 'passive')).toBe(1)
    expect(sharpFactor(g, 'own:cash', 'passive')).toBe(1)
    expect(sharpFactor(g, 'nope', 'passive')).toBe(1)
  })

  it('a hint key takes its talent from the caller; the unit from the options', () => {
    const base = inFog(() => know(fogGame(53), 'hint:abc:0', 4e6, { unit: 'money' }))
    expect(base.sd).toBeCloseTo(0.2, 9)
    expect(inFog(() => know(fogGame(53, { talents: ['Business'] }), 'hint:abc:0', 4e6, { unit: 'money' })).sd).toBeCloseTo(0.2, 9)
    expect(inFog(() => know(fogGame(53, { talents: ['Business'] }), 'hint:abc:0', 4e6, { unit: 'money', talent: 'Business' })).sd).toBeCloseTo(0.12, 9)
    expect(inFog(() => know(fogGame(53, { talents: ['Investing'] }), 'hint:abc:0', 4e6, { unit: 'money', talent: 'Business' })).sd).toBeCloseTo(0.2, 9)
    expect(inFog(() => know(fogGame(53, { talents: ['MainCharacter'] }), 'hint:abc:0', 4e6, { unit: 'money' })).sd).toBeCloseTo(0.12, 9)
    expect(inFog(() => know(fogGame(53), 'hint:abc:1', 0.42, { unit: 'odds' })).words).toMatch(/[a-z]/)
  })

  it('the passive sd is floored at 3%, even for the most sharpened read', () => {
    const e = inFog(() => know(fogGame(54, { talents: ['MainCharacter'] }), 'eco:us:inflation', 0.04, { exp: 1 }))
    expect(e.sd).toBe(SD_MIN)
  })
})

describe('conf follows the sd', () => {
  const rowAt = (sd: number): Estimate =>
    inFog(() => estimate(fogGame(60), 'mkt:cafe:us:size', 4e6, { row: { mid: 4.2e6, sd, y: 2026, src: 'press' } }))
  it('<= .06 is 3, <= .15 is 2, <= .30 is 1, else 0 (the passive read is the fallback above .25)', () => {
    expect(rowAt(0.03).conf).toBe(3)
    expect(rowAt(0.06).conf).toBe(3)
    expect(rowAt(0.061).conf).toBe(2)
    expect(rowAt(0.15).conf).toBe(2)
    expect(rowAt(0.151).conf).toBe(1)
    expect(rowAt(0.249).conf).toBe(1)
    // passive .25 beats a row of .4: still conf 1
    expect(rowAt(0.4).conf).toBe(1)
    expect(inFog(() => know(fogGame(60), 'riv:r1:cash', 4e6)).conf).toBe(0) // sd0 .60
    expect(inFog(() => know(fogGame(60), 'ppl:a:smarts', 50)).conf).toBe(0) // sd0 .45
  })

  it('asOf is the row year, only once the reading is 2 or more years old', () => {
    const at = (y: number): Estimate => inFog(() => estimate(fogGame(61, { year: 2030 }), 'mkt:cafe:us:size', 4e6, { row: { mid: 4e6, sd: 0.03, y, src: 'press' } }))
    expect(at(2030).asOf).toBeUndefined()
    expect(at(2029).asOf).toBeUndefined()
    expect(at(2028).asOf).toBe(2028)
    expect(at(2025).asOf).toBe(2025)
    expect(inFog(() => know(fogGame(61, { year: 2030 }), 'mkt:cafe:us:size', 4e6)).asOf).toBeUndefined()
  })
})

describe('the rule table', () => {
  // [pattern, unit, sd0, drift, talents]; null unit means "from the caller" (hint.*).
  const TABLE: Array<[string, Unit | null, number, number, string[]]> = [
    ['mkt.size', 'money', 0.25, 0.06, ['Business']],
    ['mkt.share', 'pct', 0.25, 0.15, ['Business']],
    ['mkt.*', 'count', 0.25, 0.08, ['Business']],
    ['riv.quality', 'score', 0.3, 0.1, ['Business']],
    ['riv.tech', 'score', 0.3, 0.1, ['Business']],
    ['riv.line', 'score', 0.3, 0.1, ['Business']],
    ['riv.cash', 'money', 0.6, 0.35, ['Business']],
    ['riv.*', 'money', 0.3, 0.15, ['Business']],
    ['cmp.score', 'score', 0.2, 0.1, ['Business']],
    ['cmp.*', 'money', 0.25, 0.1, ['Business']],
    ['scn.*', 'delta', 0.3, 0.15, ['Business']],
    ['hint.*', null, 0.2, 0, []],
    ['cand.skill', 'score', 0.18, 0, ['Business']],
    ['odds.*', 'odds', 0.2, 0.05, ['Business']],
    ['ev.*', 'money', 0.3, 0, ['Business']],
    ['sec.*', 'pct', 0.25, 0.2, ['Investing']],
    ['fund.*', 'pct', 0.25, 0.2, ['Investing']],
    ['val.*', 'money', 0.3, 0.15, ['Investing']],
    ['cast.*', 'score', 0.25, 0.15, ['Acting', 'Modeling']],
    ['peer.*', 'score', 0.25, 0.15, ['Acting', 'Modeling']],
    ['eco.*', 'pct', 0.05, 0.02, []],
    ['pol.*', 'score', 0.25, 0.25, []],
    ['ppl.*', 'score', 0.45, 0.2, []],
    ['war.*', 'score', 0.3, 0.25, []],
    ['story.*', 'score', 0.3, 0.25, []],
    ['show.*', 'score', 0.3, 0.25, []],
  ]

  it('has exactly the rows of the plan (and the cross-check amendments), with their numbers', () => {
    expect(Object.keys(RULES).sort()).toEqual(TABLE.map((r) => r[0]).sort())
    for (const [pattern, unit, sd0, drift, talents] of TABLE) {
      const r = RULES[pattern]!
      expect(r, pattern).toBeDefined()
      expect(r.unit, pattern).toBe(unit)
      expect(r.sd0, pattern).toBe(sd0)
      expect(r.drift, pattern).toBe(drift)
      expect([...r.talents], pattern).toEqual(talents)
    }
  })

  it('looks a key up by kind.field first, then kind.*', () => {
    expect(ruleOf('mkt:cafe:us:size')).toBe(RULES['mkt.size'])
    expect(ruleOf('mkt:cafe:us:share')).toBe(RULES['mkt.share'])
    expect(ruleOf('mkt:cafe:us:units')).toBe(RULES['mkt.*'])
    expect(ruleOf('riv:r1:quality')).toBe(RULES['riv.quality'])
    expect(ruleOf('riv:r1:cash')).toBe(RULES['riv.cash'])
    expect(ruleOf('riv:r1:marketing')).toBe(RULES['riv.*'])
    expect(ruleOf('riv:r1:pizza:line')).toBe(RULES['riv.line'])
    expect(ruleOf('cmp:r1:score')).toBe(RULES['cmp.score'])
    expect(ruleOf('cmp:r1:rev')).toBe(RULES['cmp.*'])
    expect(ruleOf('hint:abc:3')).toBe(RULES['hint.*'])
    expect(ruleOf('zzz:a:b')).toBeNull()
    expect(ruleOf('own:cash')).toBeNull()
  })

  it('parses <kind>:<id>[:<id>]:<field> of 64 characters at most', () => {
    expect(parseKey('mkt:cafe:us:size')).toEqual({ kind: 'mkt', ids: ['cafe', 'us'], field: 'size' })
    expect(parseKey('riv:r1:quality')).toEqual({ kind: 'riv', ids: ['r1'], field: 'quality' })
    expect(parseKey('x:a:b:c:d')).toBeNull()
    expect(parseKey('mkt:a')).toBeNull()
    expect(parseKey('mkt::size')).toBeNull()
    expect(parseKey('mkt:a:' + 'f'.repeat(70))).toBeNull()
    expect(parseKey('mkt:' + 'a'.repeat(30) + ':' + 'b'.repeat(25) + ':size')).toBeNull() // 66 characters
    expect(parseKey('mkt:' + 'a'.repeat(30) + ':' + 'b'.repeat(20) + ':size')).not.toBeNull() // 61
  })

  it('every rule is sane: sd0 and drift are finite, units are known', () => {
    const units = new Set(['money', 'count', 'pct', 'score', 'odds', 'delta', null])
    for (const [p, r] of Object.entries(RULES)) {
      expect(units.has(r.unit), p).toBe(true)
      expect(r.sd0, p).toBeGreaterThan(0)
      expect(r.sd0, p).toBeLessThanOrEqual(1)
      expect(r.drift, p).toBeGreaterThanOrEqual(0)
    }
  })
})
