// Rival R&D (R&D 3.0 task 7): a rival's version of a kind rises with the years it has sold it, by a pure hash
// schedule (riseOf), in the field every reader shares (fieldOf with a market) and in the Market screen's
// rivalLines. Capped at 8 points, never above a Heavy pioneer, whole numbers up to 99, no g.rng.
import { describe, expect, it, vi } from 'vitest'
import { marketCtxFor } from '../src/game/business/economy'
import type { FieldRival } from '../src/game/business/competition-core'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { heavyArrival, type HeavyRecord } from '../src/game/business/heavy-rd'
import { INDUSTRIES } from '../src/game/business/industries'
import { shieldsOf } from '../src/game/business/lab-state'
import * as productData from '../src/game/business/product-data'
import * as productMarket from '../src/game/business/product-market'
import { familiesOf, fieldFor, fieldOf, RISE_BASE, RISE_CAP, RISE_SIZE, RISE_SPAN, rivalLines, riseOf } from '../src/game/business/product-market'
import { productIdeas } from '../src/game/business/products'
import { bestRdIdea } from '../src/game/business/rd'
import { bizOf, readBiz, type BizState } from '../src/game/business/state'
import type { Industry } from '../src/game/data/markets'
import type { GameState } from '../src/game/types'
import { deepFreeze, labGame, launchBreakthrough, noDraw, patchLab } from './lab-kit'
import { adult } from './market-kit'

type Rival = Pick<FieldRival, 'id' | 'tier' | 'quality' | 'pull'>
const RIVALS: Rival[] = [
  { id: 'rv-g1', tier: 'giant', quality: 70, pull: 8 },
  { id: 'rv-g2', tier: 'giant', quality: 66, pull: 6 },
  { id: 'rv-m1', tier: 'major', quality: 62, pull: 4 },
  { id: 'rv-d1', tier: 'mid', quality: 58, pull: 2 },
  { id: 'rv-s1', tier: 'small', quality: 50, pull: 1 },
  { id: 'rv-s2', tier: 'small', quality: 48, pull: 1 },
]
/** Rivals at both ends of the quality scale, so the floor (10) and the ceiling (99) are both in reach. */
const EDGES: Rival[] = [
  ...RIVALS,
  { id: 'rv-top', tier: 'giant', quality: 99, pull: 5 },
  { id: 'rv-top2', tier: 'major', quality: 97, pull: 3 },
  { id: 'rv-low', tier: 'small', quality: 5, pull: 1 },
]
const SIZES = ['giant', 'major', 'mid', 'small'] as const
const IDS = Object.keys(INDUSTRIES) as Industry[]
const FAM = 'Tableside Ordering Screens'

function heavyRec(over: Partial<HeavyRecord> = {}): HeavyRecord {
  return { family: FAM, year: 2021, years: 5, quality: 80, cost: 3_000_000, by: 'biz1', ...over }
}

/** Every version in a field is -1 (no offer) or a whole number from 10 to 99. */
function wholeVersions(f: productMarket.Field, families: readonly string[]): void {
  for (const fam of families) {
    for (const v of f.versions(fam)) {
      if (v === -1) continue
      expect(Number.isInteger(v), `${fam} ${v}`).toBe(true)
      expect(v).toBeGreaterThanOrEqual(10)
      expect(v).toBeLessThanOrEqual(99)
    }
  }
}

describe('riseOf', () => {
  it('is 0 at once, monotone in years, capped at 8 and deterministic', () => {
    const r = { id: 'rival-7', tier: 'giant' }
    const rise = () => Array.from({ length: 14 }, (_, y) => riseOf('software', r, 'Mobile App', y))
    const xs = rise()
    expect(xs[0]).toBe(0)
    expect(xs).toEqual(rise())
    expect(Math.max(...xs)).toBeLessThanOrEqual(8)
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1])
    // the span stops it: years past RISE_SPAN add nothing
    expect(riseOf('software', r, 'Mobile App', RISE_SPAN + 5)).toBe(riseOf('software', r, 'Mobile App', RISE_SPAN))
    expect(RISE_CAP).toBe(8)
    expect(RISE_SPAN).toBe(12)
  })

  it('is within 0-8 over 12 years for all 55 trades, every rival size and sample kinds [RF4]', () => {
    expect(IDS).toHaveLength(55)
    let n = 0
    for (const ind of IDS) {
      const kinds = ['Mobile App', 'Street Lighting', '', ...familiesOf(ind).slice(0, 3)]
      for (const tier of [...SIZES, 'unknown', '']) {
        for (const fam of kinds) {
          const r = { id: `rv-${n++ % 17}`, tier }
          for (const years of [-3, 0, 1, 2, 5, 11, 12, 13, 100, 1e9, Infinity, -Infinity, NaN]) {
            const x = riseOf(ind, r, fam, years)
            expect(Number.isFinite(x), `${ind} ${tier} ${years}`).toBe(true)
            expect(x).toBeGreaterThanOrEqual(0)
            expect(x).toBeLessThanOrEqual(RISE_CAP)
          }
        }
      }
    }
    // an id that is not a trade reads as a mid-tier trade, and a tier that is not a size as 1
    expect(riseOf('nonsense', { id: 'a', tier: 'giant' }, 'x', 5)).toBe(riseOf('brewery', { id: 'a', tier: 'giant' }, 'x', 5))
    expect(riseOf('brewery', { id: 'a', tier: 'constructor' }, 'x', 5)).toBe(riseOf('brewery', { id: 'a', tier: 'mid' }, 'x', 5))
  })

  it('has tier order: RISE_BASE low < mid < high < breakthrough and RISE_SIZE giant > major > mid > small', () => {
    expect(RISE_BASE).toEqual({ low: 0.2, mid: 0.3, high: 0.45, breakthrough: 0.6 })
    expect(RISE_BASE.low).toBeLessThan(RISE_BASE.mid)
    expect(RISE_BASE.mid).toBeLessThan(RISE_BASE.high)
    expect(RISE_BASE.high).toBeLessThan(RISE_BASE.breakthrough)
    expect(RISE_SIZE).toEqual({ giant: 1.3, major: 1.15, mid: 1, small: 0.7 })
    expect(RISE_SIZE.giant).toBeGreaterThan(RISE_SIZE.major)
    expect(RISE_SIZE.major).toBeGreaterThan(RISE_SIZE.mid)
    expect(RISE_SIZE.mid).toBeGreaterThan(RISE_SIZE.small)
    // the same rival and kind rise more in a higher tier, and a bigger rival more than a smaller one
    const at = (ind: string, tier: string) => riseOf(ind, { id: 'rv-x', tier }, 'Mobile App', 4)
    expect(at('restaurant', 'mid')).toBeLessThan(at('brewery', 'mid'))
    expect(at('brewery', 'mid')).toBeLessThan(at('software', 'mid'))
    expect(at('software', 'mid')).toBeLessThan(at('aiLab', 'mid'))
    expect(at('software', 'small')).toBeLessThan(at('software', 'mid'))
    expect(at('software', 'mid')).toBeLessThan(at('software', 'giant'))
  })

  it('ten years of rise cost a mid rival in a high trade about 4.5 points', () => {
    const family = 'Mobile App'
    const xs = Array.from({ length: 40 }, (_, i) => riseOf('software', { id: `rival-${i}`, tier: 'mid' }, family, 10))
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length
    expect(mean).toBeGreaterThan(3.5)
    expect(mean).toBeLessThan(5.5)
  })
})

describe('the field with a market', () => {
  it('has no rise without one, a rise with one, and the key differs', () => {
    const plain = fieldOf(RIVALS, 3, 'us', 2030)
    const risen = fieldOf(RIVALS, 3, 'us', 2030, undefined, { industry: 'software' })
    expect(risen).not.toBe(plain)
    expect(fieldOf(RIVALS, 3, 'us', 2030, undefined, { industry: 'software' })).toBe(risen)
    expect(fieldOf(RIVALS, 3, 'us', 2030, undefined, { industry: 'restaurant' })).not.toBe(risen)
    expect(plain.market).toBeUndefined()
    let higher = 0
    let equalAtStart = 0
    for (const fam of familiesOf('software')) {
      for (let y = 1990; y <= 2040; y += 2) {
        const p = fieldOf(RIVALS, 3, 'us', y).versions(fam)
        const q = fieldOf(RIVALS, 3, 'us', y, undefined, { industry: 'software' }).versions(fam)
        RIVALS.forEach((_, i) => {
          if (p[i] < 0) {
            expect(q[i]).toBe(-1)
            return
          }
          expect(q[i]).toBeGreaterThanOrEqual(p[i])
          expect(q[i]).toBeLessThanOrEqual(Math.min(99, p[i] + RISE_CAP))
          if (q[i] > p[i]) higher++
        })
      }
    }
    expect(higher).toBeGreaterThan(20)
    // in the year a rival starts selling a kind it has no rise yet
    for (const fam of familiesOf('software').slice(0, 8)) {
      RIVALS.forEach((_, i) => {
        let y = 1900
        while (y < 2100 && fieldOf(RIVALS, 3, 'us', y).versions(fam)[i] < 0) y++
        if (y >= 2100) return
        expect(fieldOf(RIVALS, 3, 'us', y, undefined, { industry: 'software' }).versions(fam)[i]).toBe(fieldOf(RIVALS, 3, 'us', y).versions(fam)[i])
        equalAtStart++
      })
    }
    expect(equalAtStart).toBeGreaterThan(10)
    // the pull-weighted quality follows the versions: never below the plain field's
    const fam = familiesOf('software').find((f) => plain.of(f).offer > 0 && plain.of(f).exists)!
    expect(risen.of(fam).quality).toBeGreaterThanOrEqual(plain.of(fam).quality)
  })

  it('lets a Heavy kind rise from its arrival and never pass the pioneer', () => {
    for (const quality of [80, 72]) {
      const rec = heavyRec({ quality })
      for (const industry of ['restaurant', 'software']) {
        let higher = 0
        for (let y = 2018; y <= 2060; y++) {
          const plain = fieldOf(RIVALS, 3, 'us', y, [rec]).versions(FAM)
          const risen = fieldOf(RIVALS, 3, 'us', y, [rec], { industry }).versions(FAM)
          RIVALS.forEach((r, i) => {
            if (plain[i] < 0) {
              expect(risen[i]).toBe(-1)
              return
            }
            expect(risen[i]).toBeGreaterThanOrEqual(plain[i])
            expect(risen[i], `${industry} ${y} ${r.id}`).toBeLessThanOrEqual(rec.quality)
            if (y === heavyArrival(rec, r)) expect(risen[i]).toBe(plain[i])
            if (risen[i] > plain[i]) higher++
          })
        }
        expect(higher).toBeGreaterThan(0)
      }
    }
  })

  it('keeps versions whole numbers from 10 to 99', () => {
    const fams = [...new Set([...familiesOf('software'), ...familiesOf('ecommerce'), ...familiesOf('telecom')])].slice(0, 24)
    expect(fams.length).toBeGreaterThanOrEqual(20)
    for (const ind of ['software', 'restaurant', 'aiLab'] as const) {
      for (let y = 2009; y <= 2020; y++) wholeVersions(fieldOf(EDGES, 3, 'us', y, undefined, { industry: ind }), fams)
      for (const y of [1900, 1950, 2100]) wholeVersions(fieldOf(EDGES, 3, 'world', y, undefined, { industry: ind }), fams)
    }
    // the ceiling is reached and held (a rival that starts at 99 stays at 99)
    let top = 0
    for (const fam of fams) for (let y = 2000; y <= 2040; y++) top = Math.max(top, ...fieldOf(EDGES, 3, 'us', y, undefined, { industry: 'software' }).versions(fam))
    expect(top).toBe(99)
    for (const r of EDGES) {
      for (let y = 2009; y <= 2020; y++) {
        for (const l of rivalLines(r, 'software', 'us', y)) {
          expect(Number.isInteger(l.quality)).toBe(true)
          expect(l.quality).toBeGreaterThanOrEqual(10)
          expect(l.quality).toBeLessThanOrEqual(99)
        }
      }
    }
  })

  it('reaches deep tech too, finite and in range', () => {
    for (const ind of ['aiLab', 'fusion'] as const) {
      const g = adult(7, 2030, 'us')
      const c = g.character
      const nb = newBiz(g, ind, c.countryId, c.city, { cash: 100_000_000 })
      const a = createBusinessAsset(g, `Test ${ind}`, nb, 0)
      g.assets.push(a)
      const b = bizOf(g, a)
      let seen = 0
      for (let y = g.year; y < g.year + 12; y++) {
        const f = fieldFor(marketCtxFor(g, b, y))
        expect(f.market?.industry).toBe(ind)
        wholeVersions(f, familiesOf(ind))
        for (const fam of familiesOf(ind)) {
          const plain = fieldOf(f.rivals as Rival[], marketCtxFor(g, b, y).fringe, f.place, y, f.heavy).versions(fam)
          f.versions(fam).forEach((v, i) => {
            if (v < 0) return
            seen++
            expect(v).toBeGreaterThanOrEqual(plain[i])
          })
        }
      }
      expect(seen).toBeGreaterThan(0)
    }
  })
})

describe('rivalLines', () => {
  it('equals the field, and leaves out a family a shield holds', () => {
    for (const [industry, place, year] of [['software', 'us', 2020], ['restaurant', 'us', 1995], ['brewery', 'de', 2010], ['software', 'world', 2024]] as const) {
      const field = fieldOf(RIVALS, 3, place, year, undefined, { industry })
      let total = 0
      RIVALS.forEach((r, i) => {
        const lines = rivalLines(r, industry, place, year)
        const listed = new Set(lines.map((l) => l.family))
        for (const l of lines) expect(field.versions(l.family)[i], `${industry} ${l.family}`).toBe(l.quality)
        for (const fam of familiesOf(industry)) expect(field.versions(fam)[i] >= 0, `${industry} ${fam}`).toBe(listed.has(fam))
        total += lines.length
      })
      expect(total).toBeGreaterThan(0)
      // best-selling kinds first, as before
      const l0 = rivalLines(RIVALS[0], industry, place, year)
      for (let i = 1; i < l0.length; i++) expect(l0[i - 1].level).toBeGreaterThanOrEqual(l0[i].level)
    }
    const industry = 'software'
    const place = 'us'
    const year = 2020
    const lines = rivalLines(RIVALS[0], industry, place, year)
    expect(lines.length).toBeGreaterThan(1)
    const held = lines[0].family
    const shield = [{ family: held, until: year + 3 }]
    const shut = rivalLines(RIVALS[0], industry, place, year, shield)
    expect(shut.map((l) => l.family)).toEqual(lines.map((l) => l.family).filter((f) => f !== held))
    const field = fieldOf(RIVALS, 3, place, year, undefined, { industry, shield })
    RIVALS.forEach((_, i) => expect(field.versions(held)[i]).toBe(-1))
    // a shield that has ended (or is for another kind) leaves the list as it was
    expect(rivalLines(RIVALS[0], industry, place, year, [{ family: held, until: year }])).toEqual(lines)
    expect(rivalLines(RIVALS[0], industry, place, year, [{ family: 'Not A Kind', until: year + 9 }])).toEqual(lines)
    expect(rivalLines(RIVALS[0], industry, place, year, [])).toEqual(lines)
  })

  it('carries the rise on its qualities', () => {
    let higher = 0
    for (let y = 2000; y <= 2030; y += 3) {
      for (const r of RIVALS) {
        for (const l of rivalLines(r, 'software', 'us', y)) {
          const base = productMarket.rivalVersion(r, l.family, 1).quality
          expect(l.quality).toBeGreaterThanOrEqual(base)
          expect(l.quality).toBeLessThanOrEqual(Math.min(99, base + RISE_CAP))
          if (l.quality > base) higher++
        }
      }
    }
    expect(higher).toBeGreaterThan(10)
  })
})

describe('purity and cost', () => {
  function plainGame(): { g: GameState; b: BizState } {
    const { g, b } = labGame(31, 'software')
    return { g, b }
  }

  it('draws no g.rng and a deep-frozen state does not throw', () => {
    const { g, b } = plainGame()
    expect(
      noDraw(g, () => {
        marketCtxFor(g, b, g.year + 5)
        rivalLines(RIVALS[0], 'software', 'us', g.year)
        riseOf('software', RIVALS[1], 'Mobile App', 6)
        fieldOf(RIVALS, 3, 'us', g.year + 2, undefined, { industry: 'software' }).versions('Mobile App')
      }),
    ).toBe(true)
    const frozen = deepFreeze(structuredClone(g))
    const fb = readBiz(frozen, frozen.assets[0])
    expect(() => {
      marketCtxFor(frozen, fb, frozen.year + 3)
      fieldFor(marketCtxFor(frozen, fb, frozen.year)).versions(familiesOf('software')[0])
      rivalLines(Object.freeze({ ...RIVALS[0] }), 'software', 'us', frozen.year, Object.freeze([Object.freeze({ family: 'x', until: 3000 })]))
    }).not.toThrow()
  })

  it('reads each kind\'s adoption series once [RF5]', () => {
    const rivals: Rival[] = Array.from({ length: 10 }, (_, i) => ({ id: `rv-series-${i}`, tier: SIZES[i % 4], quality: 50 + i, pull: 1 + i }))
    const family = familiesOf('software').find((f) => productData.demandLevel(f, 'us', 2047).exists)!
    expect(family).toBeDefined()
    const spy = vi.spyOn(productData, 'demandLevel')
    try {
      const f = fieldOf(rivals, 3, 'us', 2047, undefined, { industry: 'software' })
      f.of(family)
      f.versions(family)
      const first = spy.mock.calls.filter((c) => c[0] === family).length
      expect(first).toBeGreaterThan(0)
      expect(first).toBeLessThanOrEqual(RISE_SPAN + 1)
      spy.mockClear()
      // another field for the same kind and year (a different shield makes a different key) adds at most the field's own read
      const other = fieldOf(rivals, 3, 'us', 2047, undefined, { industry: 'software', shield: [{ family: 'Not A Kind', until: 3000 }] })
      other.of(family)
      expect(spy.mock.calls.filter((c) => c[0] === family).length).toBeLessThanOrEqual(1)
      // rivalLines shares the series: ten rivals read it once between them (plus each one's own read of the year)
      spy.mockClear()
      for (const r of rivals) rivalLines(r, 'software', 'us', 2049)
      const per = spy.mock.calls.filter((c) => c[0] === family).length
      expect(per).toBeLessThanOrEqual(rivals.length + RISE_SPAN)
    } finally {
      spy.mockRestore()
    }
  })

  it('builds a bounded number of fields in a planner run with a patent [RF5]', () => {
    const { g, a, b } = labGame(91, 'brewery', { country: 'ca' })
    const fam = launchBreakthrough(g, a, b)
    patchLab(b, (d) => {
      d.patents.push({ family: fam, filed: g.year, until: g.year + 5, mode: 'hold', lic: 0, plan: 400_000, book: 240_000, earned: 0 })
      d.filed.push(fam)
    })
    expect(shieldsOf(b)).toHaveLength(1)
    const spy = vi.spyOn(productMarket, 'fieldOf')
    try {
      bestRdIdea(g, b, productIdeas(g, b, 4), 5_000_000)
      const fields = new Set(spy.mock.results.map((x) => x.value))
      expect(fields.size).toBeGreaterThan(0)
      expect(fields.size).toBeLessThanOrEqual(20)
    } finally {
      spy.mockRestore()
    }
  })
})
