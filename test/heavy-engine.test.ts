// Heavy R&D, the pure engine (spec 3.4 to 3.6): the record a breakthrough leaves in the market, the
// demand curve of its kind, when and how well each rival follows, and the pulse it gives the whole
// trade. Everything here is a pure reader: none of it may draw on the game RNG, and a market with no
// record must come out exactly as it did before.
import { describe, expect, it } from 'vitest'
import type { FieldRival } from '../src/game/business/competition-core'
import { marketCtxFor, productsPullOf } from '../src/game/business/economy'
import { BREAKTHROUGHS, breakthroughsFor } from '../src/game/business/heavy-data'
import {
  addHeavy,
  heavyArrival,
  heavyFringeArrival,
  heavyKey,
  heavyLevel,
  heavyLevelFor,
  heavyOf,
  heavyPulse,
  heavyVersionQuality,
  MAX_HEAVY_RECORDS,
  readHeavy,
  TIER_LAG,
  type HeavyRecord,
} from '../src/game/business/heavy-rd'
import { demandLevel, demandTrend } from '../src/game/business/product-data'
import { fieldOf, infoOf, KIND_COST, KIND_WEIGHT, kindLevel, kindTrend, productPull } from '../src/game/business/product-market'
import { rdQuote, rdValue, retireOrder } from '../src/game/business/rd'
import { bizOf, normalizeBiz, readBiz, type Product } from '../src/game/business/state'
import type { GameState, Json } from '../src/game/types'
import { adult, company, nextYear, renderAll } from './market-kit'

const FAM = 'Tableside Ordering Screens'
const ALL_FAMILIES = Object.values(BREAKTHROUGHS).flatMap((list) => list.map((b) => b.name))

function rec(over: Partial<HeavyRecord> = {}): HeavyRecord {
  return { family: FAM, year: 2021, years: 5, quality: 80, cost: 3_000_000, by: 'biz1', ...over }
}

type Rival = Pick<FieldRival, 'id' | 'tier' | 'quality' | 'pull'>
const RIVALS: Rival[] = [
  { id: 'rv-g1', tier: 'giant', quality: 70, pull: 8 },
  { id: 'rv-g2', tier: 'giant', quality: 66, pull: 6 },
  { id: 'rv-m1', tier: 'major', quality: 62, pull: 4 },
  { id: 'rv-d1', tier: 'mid', quality: 58, pull: 2 },
  { id: 'rv-s1', tier: 'small', quality: 50, pull: 1 },
  { id: 'rv-s2', tier: 'small', quality: 48, pull: 1 },
]
const idsOf = (tier: string) => RIVALS.map((r, i) => ({ r, i })).filter((x) => x.r.tier === tier).map((x) => x.i)

function flagsOnly(flags: Record<string, Json> = {}): Pick<GameState, 'flags'> {
  return { flags }
}

/** An adult with a restaurant in the US and one year booked: a real company, a real market. */
function restaurant(seed = 5) {
  const g = adult(seed, 2020, 'us')
  const a = company(g, 'restaurant')
  nextYear(g)
  return { g, a, b: readBiz(g, a) }
}

describe('the pioneer record in game flags', () => {
  it('builds the key from the trade and the market', () => {
    expect(heavyKey('restaurant', 'us')).toBe('heavy.restaurant|us')
    expect(heavyKey('software', 'world')).toBe('heavy.software|world')
  })

  it('with no record returns one shared, frozen, empty list (no allocation on the hot path)', () => {
    const a = readHeavy(flagsOnly(), 'restaurant', 'us')
    const b = readHeavy(flagsOnly({ other: 1 }), 'software', 'world')
    expect(a).toEqual([])
    expect(a).toBe(b)
    expect(Object.isFrozen(a)).toBe(true)
    expect(() => (a as HeavyRecord[]).push(rec())).toThrow()
  })

  it('round-trips a record through addHeavy and readHeavy, newest last', () => {
    const g = adult(1, 2030, 'us')
    const [one, two] = breakthroughsFor('restaurant')
    addHeavy(g, 'restaurant', 'us', rec({ family: one.name, year: 2025 }))
    addHeavy(g, 'restaurant', 'us', rec({ family: two.name, year: 2030 }))
    expect(readHeavy(g, 'restaurant', 'us').map((r) => r.family)).toEqual([one.name, two.name])
    expect(readHeavy(g, 'restaurant', 'us')[1]).toEqual(rec({ family: two.name, year: 2030 }))
    expect(readHeavy(g, 'restaurant', 'jp')).toEqual([])
    expect(readHeavy(g, 'cafe', 'us')).toEqual([])
    // The stored value is plain JSON.
    expect(JSON.parse(JSON.stringify(g.flags[heavyKey('restaurant', 'us')]))).toEqual(g.flags[heavyKey('restaurant', 'us')])
  })

  it('heavyOf reads the record of the company’s own market (world for a tradable trade)', () => {
    const g = adult(2, 2030, 'jp')
    addHeavy(g, 'software', 'world', rec({ family: breakthroughsFor('software')[0].name }))
    expect(heavyOf(g, { industry: 'software', countryId: 'jp' }).map((r) => r.family)).toEqual([breakthroughsFor('software')[0].name])
    expect(heavyOf(g, { industry: 'restaurant', countryId: 'jp' })).toEqual([])
  })

  it('keeps the earliest record of a family', () => {
    const g = adult(3, 2030, 'us')
    addHeavy(g, 'restaurant', 'us', rec({ year: 2024, quality: 70 }))
    addHeavy(g, 'restaurant', 'us', rec({ year: 2027, quality: 99, by: 'later' }))
    expect(readHeavy(g, 'restaurant', 'us')).toEqual([rec({ year: 2024, quality: 70 })])
    // A record that really is earlier replaces it.
    addHeavy(g, 'restaurant', 'us', rec({ year: 2022, quality: 60, by: 'first' }))
    expect(readHeavy(g, 'restaurant', 'us')).toEqual([rec({ year: 2022, quality: 60, by: 'first' })])
    // Same year: the one already there stays.
    addHeavy(g, 'restaurant', 'us', rec({ year: 2022, quality: 90, by: 'tie' }))
    expect(readHeavy(g, 'restaurant', 'us')[0].by).toBe('first')
  })

  it('holds at most 12 records, dropping the oldest', () => {
    const g = adult(4, 2030, 'us')
    const names = ALL_FAMILIES.slice(0, 20)
    names.forEach((family, i) => addHeavy(g, 'restaurant', 'us', rec({ family, year: 2000 + i })))
    const got = readHeavy(g, 'restaurant', 'us')
    expect(MAX_HEAVY_RECORDS).toBe(12)
    expect(got).toHaveLength(12)
    expect(got.map((r) => r.family)).toEqual(names.slice(-12))
    expect((g.flags[heavyKey('restaurant', 'us')] as Json[]).length).toBe(12)
  })

  it('refuses to store a record that is not valid', () => {
    const g = adult(5, 2030, 'us')
    addHeavy(g, 'restaurant', 'us', rec({ family: 'Not In The Catalogue' }))
    addHeavy(g, 'restaurant', 'us', rec({ year: Number.NaN }))
    addHeavy(g, 'restaurant', 'us', rec({ quality: Number.POSITIVE_INFINITY }))
    expect(heavyKey('restaurant', 'us') in g.flags).toBe(false)
  })

  describe('hostile flags', () => {
    const read = (v: Json | undefined) => readHeavy(flagsOnly(v === undefined ? {} : { [heavyKey('restaurant', 'us')]: v }), 'restaurant', 'us')

    it('anything that is not a list reads as empty', () => {
      for (const v of [7, 'x', true, null, { family: FAM }, undefined, [] as Json]) expect(read(v), String(v)).toEqual([])
    })

    it('drops entries of the wrong shape and keeps the good ones', () => {
      const good = rec()
      const out = read([null, 4, 'a', [good], { ...good, family: 7 }, { ...good, family: 'Nope' }, { ...good, year: 'soon' }, { ...good, years: null }, { ...good, quality: Number.NaN }, { ...good, cost: Number.POSITIVE_INFINITY }, { ...good, by: 9 }, good] as unknown as Json)
      expect(out).toEqual([good])
    })

    it('clamps out-of-range numbers: year 1800-2300, years 1-6, quality 0-100, cost 0-1e15', () => {
      const [lo] = read([rec({ year: -5000, years: -3, quality: -50, cost: -1e9 })] as unknown as Json)
      expect(lo).toMatchObject({ year: 1800, years: 1, quality: 0, cost: 0 })
      const [hi] = read([rec({ year: 9e9, years: 99, quality: 4000, cost: 1e30 })] as unknown as Json)
      expect(hi).toMatchObject({ year: 2300, years: 6, quality: 100, cost: 1e15 })
      const [frac] = read([rec({ year: 2020.6, years: 4.4 })] as unknown as Json)
      expect(Number.isInteger(frac.year)).toBe(true)
      expect(Number.isInteger(frac.years)).toBe(true)
    })

    it('caps a long asset id', () => {
      const [r] = read([rec({ by: 'x'.repeat(5000) })] as unknown as Json)
      expect(r.by.length).toBeLessThanOrEqual(64)
    })

    it('100 records read as a clean list of at most 12, newest last, no repeated family', () => {
      const many = Array.from({ length: 100 }, (_, i) => rec({ family: ALL_FAMILIES[i % 40], year: 1900 + i }))
      const out = read(many as unknown as Json)
      expect(out.length).toBeLessThanOrEqual(12)
      expect(new Set(out.map((r) => r.family)).size).toBe(out.length)
      for (const r of out) expect(ALL_FAMILIES).toContain(r.family)
    })

    it('a million entries cost no more than a short scan', () => {
      const huge = new Array(1_000_000).fill(rec())
      const t = performance.now()
      const out = read(huge as unknown as Json)
      expect(performance.now() - t).toBeLessThan(250)
      expect(out).toHaveLength(1)
    })

    it('repeated families read once, the earliest', () => {
      const out = read([rec({ year: 2030 }), rec({ year: 2025 }), rec({ year: 2028 })] as unknown as Json)
      expect(out).toHaveLength(1)
      expect(out[0].year).toBe(2025)
    })

    it('a stored list is repaired the next time a record is added', () => {
      const g = adult(6, 2030, 'us')
      g.flags[heavyKey('restaurant', 'us')] = [null, 5, { family: 'Nope' }, rec({ cost: -1 })] as unknown as Json
      addHeavy(g, 'restaurant', 'us', rec({ family: breakthroughsFor('restaurant')[0].name }))
      expect(readHeavy(g, 'restaurant', 'us').map((r) => r.family)).toEqual([FAM, breakthroughsFor('restaurant')[0].name])
      expect(readHeavy(g, 'restaurant', 'us')[0].cost).toBe(0)
    })
  })
})

describe('the demand curve of a breakthrough kind', () => {
  it('is zero before the launch and exists from the launch year', () => {
    const r = rec()
    expect(heavyLevel(r, 2020)).toEqual({ exists: false, adoption: 0, level: 0 })
    expect(heavyLevel(r, 1900)).toEqual({ exists: false, adoption: 0, level: 0 })
    const first = heavyLevel(r, 2021)
    expect(first.exists).toBe(true)
    expect(first.level).toBeGreaterThanOrEqual(0.005)
    expect(first.level).toBeLessThan(0.2)
  })

  it('climbs without a dip, reaches 1 in ten years and holds', () => {
    const r = rec()
    let prev = 0
    for (let y = 2021; y <= 2031; y++) {
      const l = heavyLevel(r, y)
      expect(l.level, String(y)).toBeGreaterThanOrEqual(prev)
      expect(l.adoption).toBe(l.level)
      prev = l.level
    }
    expect(heavyLevel(r, 2031).level).toBe(1)
    for (let y = 2031; y <= 2021 + 18; y++) expect(heavyLevel(r, y).level, String(y)).toBe(1)
    // An S: slow, then fast, then slow.
    const step = (y: number) => heavyLevel(r, y + 1).level - heavyLevel(r, y).level
    expect(step(2025)).toBeGreaterThan(step(2021))
    expect(step(2025)).toBeGreaterThan(step(2029))
  })

  it('declines from year 18 after the launch toward 0.6 and no further', () => {
    const r = rec()
    expect(heavyLevel(r, 2021 + 18).level).toBe(1)
    let prev = 1
    for (let y = 2021 + 19; y <= 2021 + 80; y++) {
      const l = heavyLevel(r, y).level
      expect(l, String(y)).toBeLessThanOrEqual(prev)
      expect(l).toBeGreaterThan(0.6)
      prev = l
    }
    expect(heavyLevel(r, 2021 + 200).level).toBeCloseTo(0.6, 3)
  })

  it('is always finite, inside 0.005-1 once it exists, and safe against odd years', () => {
    const r = rec()
    for (const y of [2021, 2050, 2300, 5000, 1e9]) {
      const l = heavyLevel(r, y)
      expect(Number.isFinite(l.level)).toBe(true)
      expect(l.level).toBeGreaterThanOrEqual(0.005)
      expect(l.level).toBeLessThanOrEqual(1)
    }
    for (const y of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const l = heavyLevel(r, y)
      expect(Number.isFinite(l.level)).toBe(true)
      expect(l.level).toBeGreaterThanOrEqual(0)
      expect(l.level).toBeLessThanOrEqual(1)
    }
  })

  it('heavyLevelFor finds the record of the family or answers null', () => {
    const records = [rec(), rec({ family: breakthroughsFor('restaurant')[0].name, year: 2000 })]
    expect(heavyLevelFor(FAM, records, 2026)).toEqual(heavyLevel(records[0], 2026))
    expect(heavyLevelFor(breakthroughsFor('restaurant')[0].name, records, 2026)).toEqual(heavyLevel(records[1], 2026))
    expect(heavyLevelFor('Tasting Menu', records, 2026)).toBeNull()
    expect(heavyLevelFor(FAM, [], 2026)).toBeNull()
  })
})

describe('when and how well the rivals follow', () => {
  const TIERS = ['giant', 'major', 'mid', 'small']

  it('never before the pioneer’s own development time after the launch', () => {
    for (let years = 1; years <= 6; years++) {
      for (const tier of TIERS) {
        for (let i = 0; i < 60; i++) {
          const r = rec({ years })
          expect(heavyArrival(r, { id: `rival-${i}`, tier }), `${tier} ${years} ${i}`).toBeGreaterThanOrEqual(r.year + years)
        }
      }
    }
  })

  it('big rivals are never later than small ones (same rival, any tier)', () => {
    for (let years = 1; years <= 6; years++) {
      for (let i = 0; i < 60; i++) {
        const r = rec({ years })
        const at = TIERS.map((tier) => heavyArrival(r, { id: `rival-${i}`, tier }))
        for (let k = 1; k < at.length; k++) expect(at[k], `${years} ${i}`).toBeGreaterThanOrEqual(at[k - 1])
      }
    }
  })

  it('follows the tier table: ceil(years x lag) plus zero or one year', () => {
    expect(TIER_LAG).toEqual({ giant: 1, major: 1.25, mid: 1.5, small: 2 })
    for (let years = 1; years <= 6; years++) {
      for (const tier of TIERS) {
        const base = Math.ceil(years * TIER_LAG[tier])
        const seen = new Set<number>()
        for (let i = 0; i < 80; i++) seen.add(heavyArrival(rec({ years }), { id: `rival-${i}`, tier }) - 2021)
        for (const lag of seen) expect([base, base + 1], `${tier} ${years}`).toContain(lag)
        expect(seen.size, `${tier} ${years} uses both`).toBe(2)
      }
    }
  })

  it('is deterministic and does not depend on call order', () => {
    const r = rec()
    const first = RIVALS.map((x) => [heavyArrival(r, x), heavyVersionQuality(r, x)])
    const again = [...RIVALS].reverse().map((x) => [heavyArrival(r, x), heavyVersionQuality(r, x)]).reverse()
    expect(again).toEqual(first)
    expect(heavyArrival(r, { id: 'rv-g1', tier: 'giant' })).toBe(heavyArrival({ ...r }, { id: 'rv-g1', tier: 'giant' }))
  })

  it('treats an unknown tier like a mid-size rival and survives odd ids', () => {
    const r = rec()
    expect(heavyArrival(r, { id: 'z', tier: 'mystery' })).toBe(heavyArrival(r, { id: 'z', tier: 'mid' }))
    expect(heavyArrival(r, { id: 'z', tier: '__proto__' })).toBe(heavyArrival(r, { id: 'z', tier: 'mid' }))
    expect(heavyArrival(r, { id: 'z', tier: 'constructor' })).toBe(heavyArrival(r, { id: 'z', tier: 'mid' }))
    expect(Number.isFinite(heavyArrival(r, { id: '', tier: 'giant' }))).toBe(true)
    expect(Number.isFinite(heavyArrival(r, { id: 'x'.repeat(10_000), tier: 'small' }))).toBe(true)
  })

  it('has the fringe follow after twice the development time', () => {
    for (let years = 1; years <= 6; years++) expect(heavyFringeArrival(rec({ years }))).toBe(2021 + Math.ceil(years * 2))
  })

  it('gives a version never better than the pioneer’s, a little worse, and a whole number', () => {
    for (const quality of [0, 5, 30, 60, 80, 97, 100]) {
      for (let i = 0; i < 50; i++) {
        const r = rec({ quality })
        const q = heavyVersionQuality(r, { id: `rival-${i}`, tier: TIERS[i % 4] })
        expect(q, `${quality} ${i}`).toBeLessThanOrEqual(quality)
        expect(q).toBeGreaterThanOrEqual(Math.min(10, quality))
        expect(Number.isInteger(q)).toBe(true)
        if (quality >= 40) expect(q).toBeLessThanOrEqual(quality - 6)
        if (quality >= 40) expect(q).toBeGreaterThanOrEqual(quality - 15)
      }
    }
  })
})

describe('the pulse a breakthrough gives the whole trade', () => {
  const lift = (records: HeavyRecord[], year: number) => heavyPulse(records, year) - 1

  it('is exactly 1 with no record, and before the launch', () => {
    expect(heavyPulse([], 2030)).toBe(1)
    expect(heavyPulse([rec()], 2020)).toBe(1)
    expect(heavyPulse([rec()], 1500)).toBe(1)
  })

  it('ramps up over three years from the launch, then holds', () => {
    const r = [rec()]
    expect(lift(r, 2021)).toBeGreaterThan(0)
    expect(lift(r, 2022)).toBeGreaterThan(lift(r, 2021))
    expect(lift(r, 2023)).toBeGreaterThan(lift(r, 2022))
    expect(lift(r, 2024)).toBe(lift(r, 2023))
    expect(lift(r, 2021 + 8)).toBe(lift(r, 2023))
    // Linear ramp.
    expect(lift(r, 2022) - lift(r, 2021)).toBeCloseTo(lift(r, 2023) - lift(r, 2022), 12)
  })

  it('decays after year 8 with a ten-year half-life, never to nothing', () => {
    const r = [rec()]
    const full = lift(r, 2023)
    expect(lift(r, 2021 + 9)).toBeLessThan(full)
    expect(lift(r, 2021 + 18)).toBeCloseTo(full / 2, 9)
    expect(lift(r, 2021 + 28)).toBeCloseTo(full / 4, 9)
    expect(lift(r, 2021 + 200)).toBeGreaterThan(0)
  })

  it('is bigger for a costlier breakthrough, within bounds', () => {
    const at = (cost: number) => lift([rec({ cost })], 2025)
    expect(at(0)).toBeCloseTo(0.1, 9)
    expect(at(240_000)).toBeCloseTo(0.1, 9)
    expect(at(1_000_000)).toBeGreaterThan(at(240_000))
    expect(at(8_000_000)).toBeGreaterThan(at(1_000_000))
    expect(at(1e15)).toBeCloseTo(0.26, 9)
    expect(at(1e9)).toBe(at(1e15))
  })

  it('adds the records up and stops at +40%', () => {
    const two = [rec({ cost: 240_000 }), rec({ family: breakthroughsFor('restaurant')[0].name, cost: 240_000 })]
    expect(lift(two, 2030)).toBeCloseTo(lift([two[0]], 2030) * 2, 12)
    expect(lift(two, 2025)).toBeCloseTo(0.2, 12)
    const twenty = ALL_FAMILIES.slice(0, 20).map((family) => rec({ family, cost: 5e7 }))
    expect(heavyPulse(twenty, 2030)).toBe(1.4)
    for (let y = 2000; y < 2400; y += 7) {
      const p = heavyPulse(twenty, y)
      expect(p).toBeGreaterThanOrEqual(1)
      expect(p).toBeLessThanOrEqual(1.4)
    }
  })

  it('is always finite, even for damaged records or years', () => {
    const bad = [rec({ cost: Number.POSITIVE_INFINITY }), rec({ year: Number.NaN }), rec({ cost: Number.NaN }), rec({ cost: -1e30 }), rec({ year: 1e12 })]
    for (const y of [2030, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1e12, -1e12]) {
      const p = heavyPulse(bad, y)
      expect(Number.isFinite(p), String(y)).toBe(true)
      expect(p).toBeGreaterThanOrEqual(1)
      expect(p).toBeLessThanOrEqual(1.4)
    }
  })

  it('gives the same answer every time it is asked', () => {
    const r = [rec(), rec({ family: breakthroughsFor('restaurant')[0].name, year: 2024, cost: 9e6 })]
    expect(heavyPulse(r, 2027)).toBe(heavyPulse(r, 2027))
    expect(heavyPulse([...r].reverse(), 2027)).toBeCloseTo(heavyPulse(r, 2027), 12)
  })
})

describe('the field of a market with a breakthrough in it', () => {
  const years = 5
  const launch = 2021

  it('has no kind at all before the launch, and no rival at the launch', () => {
    const before = fieldOf(RIVALS, 3, 'us', 2020, [rec()])
    expect(before.of(FAM)).toMatchObject({ exists: false, offer: 0, adoption: 0, level: 0 })
    expect(before.versions(FAM).every((v) => v === -1)).toBe(true)
    const at = fieldOf(RIVALS, 3, 'us', launch, [rec()])
    expect(at.of(FAM).exists).toBe(true)
    expect(at.of(FAM).offer).toBe(0)
    expect(at.of(FAM).level).toBe(heavyLevel(rec(), launch).level)
    expect(at.of(FAM).adoption).toBe(heavyLevel(rec(), launch).adoption)
    // Nobody to compare with: customers use the par version.
    expect(at.of(FAM).quality).toBe(50)
  })

  it('has no rival sell it before the launch plus the development time', () => {
    for (let y = launch; y < launch + years; y++) {
      const f = fieldOf(RIVALS, 3, 'us', y, [rec()])
      expect(f.versions(FAM).every((v) => v === -1), String(y)).toBe(true)
      expect(f.of(FAM).offer, String(y)).toBe(0)
    }
  })

  it('has a giant offering it one year later at the latest, and a small rival not yet', () => {
    const f = fieldOf(RIVALS, 3, 'us', launch + years + 1, [rec()])
    const v = f.versions(FAM)
    for (const i of idsOf('giant')) expect(v[i], `giant ${i}`).toBeGreaterThanOrEqual(0)
    for (const i of idsOf('small')) expect(v[i], `small ${i}`).toBe(-1)
    expect(f.of(FAM).offer).toBeGreaterThan(0)
    // A small rival is still waiting just before twice the development time.
    const late = fieldOf(RIVALS, 3, 'us', launch + years * 2 - 1, [rec()])
    for (const i of idsOf('small')) expect(late.versions(FAM)[i], `small ${i}`).toBe(-1)
    // And everyone sells it a year after that at the latest.
    const all = fieldOf(RIVALS, 3, 'us', launch + years * 2 + 1, [rec()])
    expect(all.versions(FAM).every((x) => x >= 0)).toBe(true)
  })

  it('gives each rival the version heavyArrival and heavyVersionQuality say', () => {
    const r = rec()
    for (let y = launch; y < launch + 16; y++) {
      const f = fieldOf(RIVALS, 3, 'us', y, [r])
      RIVALS.forEach((rv, i) => {
        const v = f.versions(FAM)[i]
        if (y < heavyArrival(r, rv)) expect(v, `${rv.id} ${y}`).toBe(-1)
        else expect(v, `${rv.id} ${y}`).toBe(heavyVersionQuality(r, rv))
        if (v >= 0) expect(v).toBeLessThanOrEqual(r.quality)
      })
    }
  })

  it('has the long tail follow after twice the development time', () => {
    const r = rec()
    const fringeOnly = (y: number) => fieldOf([], 5, 'us', y, [r]).of(FAM)
    expect(fringeOnly(heavyFringeArrival(r) - 1).offer).toBe(0)
    expect(fringeOnly(heavyFringeArrival(r)).offer).toBeGreaterThan(0)
    expect(fringeOnly(heavyFringeArrival(r) + 3).offer).toBe(1)
  })

  it('skips the real-history curve: the kind’s demand is the record’s, not a mature default', () => {
    const without = fieldOf(RIVALS, 3, 'us', 2023)
    const withIt = fieldOf(RIVALS, 3, 'us', 2023, [rec()])
    // A name nobody listed reads as an old, mature line: level 1 and plenty of rivals.
    expect(without.of(FAM).level).toBeGreaterThan(0.9)
    expect(withIt.of(FAM).level).toBe(heavyLevel(rec(), 2023).level)
    expect(withIt.of(FAM).level).toBeLessThan(0.5)
  })

  it('leaves every classic kind exactly as it was', () => {
    const fams = ['Tasting Menu', 'Weekend Brunch', 'Delivery Service', 'Happy Hour', 'Mobile App', 'Street Lighting', 'Fiber Broadband']
    for (const y of [1960, 1990, 2005, 2020, 2035]) {
      const plain = fieldOf(RIVALS, 3, 'us', y)
      const heavy = fieldOf(RIVALS, 3, 'us', y, [rec(), rec({ family: breakthroughsFor('restaurant')[0].name, year: 1958 })])
      expect(heavy).not.toBe(plain)
      for (const fam of fams) {
        expect(heavy.of(fam), `${fam} ${y}`).toEqual(plain.of(fam))
        expect(heavy.versions(fam), `${fam} ${y}`).toEqual(plain.versions(fam))
      }
    }
  })

  it('shares one cached field when there are no records, and tells records apart', () => {
    expect(fieldOf(RIVALS, 3, 'us', 2025, [])).toBe(fieldOf(RIVALS, 3, 'us', 2025))
    expect(fieldOf(RIVALS, 3, 'us', 2025, undefined)).toBe(fieldOf(RIVALS, 3, 'us', 2025))
    expect(fieldOf(RIVALS, 3, 'us', 2025, [rec()])).toBe(fieldOf(RIVALS, 3, 'us', 2025, [rec()]))
    // Same family, year and quality, different development time: a different field (rivals follow later).
    const quick = fieldOf(RIVALS, 3, 'us', 2026, [rec({ years: 4 })])
    const slow = fieldOf(RIVALS, 3, 'us', 2026, [rec({ years: 6 })])
    expect(quick.of(FAM).offer).toBeGreaterThan(0)
    expect(slow.of(FAM).offer).toBe(0)
    // And a different quality.
    expect(fieldOf(RIVALS, 3, 'us', 2030, [rec({ quality: 90 })]).of(FAM).quality).toBeGreaterThan(fieldOf(RIVALS, 3, 'us', 2030, [rec({ quality: 40 })]).of(FAM).quality)
  })

  it('remembers the records it was made from, in a copy its owner can’t change', () => {
    expect(fieldOf(RIVALS, 3, 'us', 2025, [rec()]).heavy).toEqual([rec()])
    expect(fieldOf(RIVALS, 3, 'us', 2025).heavy).toEqual([])
    const mine = [rec({ quality: 71 })]
    const f = fieldOf(RIVALS, 3, 'us', 2026, mine)
    mine.push(rec({ family: breakthroughsFor('restaurant')[0].name }))
    expect(f.heavy).toHaveLength(1)
    expect(fieldOf(RIVALS, 3, 'us', 2026, [rec({ quality: 71 })])).toBe(f)
  })
})

describe('the economy reads the record', () => {
  it('builds a market context exactly as before when the market has no record (or only damaged ones)', () => {
    const { g, b } = restaurant()
    const years = [g.year - 1, g.year, g.year + 4]
    const base = years.map((y) => marketCtxFor(g, b, y))
    g.flags[heavyKey('restaurant', 'us')] = 'junk'
    for (const junk of ['junk', [], [null, 3, { family: 'Nope', year: 2000 }], { family: FAM }] as Json[]) {
      g.flags[heavyKey('restaurant', 'us')] = junk
      years.forEach((y, i) => {
        const c = marketCtxFor(g, b, y)
        expect(c.field, String(junk)).toBe(base[i].field)
        expect({ ...c, field: undefined }).toEqual({ ...base[i], field: undefined })
        expect(c.pot).toBe(base[i].pot)
      })
    }
    // Records for other trades or other markets change nothing here either.
    delete g.flags[heavyKey('restaurant', 'us')]
    addHeavy(g, 'restaurant', 'jp', rec())
    addHeavy(g, 'cafe', 'us', rec({ family: breakthroughsFor('cafe')[0].name }))
    years.forEach((y, i) => expect(marketCtxFor(g, b, y).pot).toBe(base[i].pot))
  })

  it('raises the trade’s potential market by exactly the pulse once a record exists', () => {
    const { g, b } = restaurant()
    const years = [2019, 2020, 2021, 2022, 2023, 2024, 2030, 2045]
    const base = years.map((y) => marketCtxFor(g, b, y))
    addHeavy(g, 'restaurant', 'us', rec({ year: 2021 }))
    const records = readHeavy(g, 'restaurant', 'us')
    years.forEach((y, i) => {
      const c = marketCtxFor(g, b, y)
      expect(c.pot, String(y)).toBe(base[i].pot * heavyPulse(records, y))
      // Nothing else about the market moves.
      expect({ ...c, pot: 0, field: undefined }).toEqual({ ...base[i], pot: 0, field: undefined })
      expect(c.field!.heavy).toEqual(records)
    })
    expect(marketCtxFor(g, b, 2020).pot).toBe(base[1].pot)
    expect(marketCtxFor(g, b, 2023).pot).toBeGreaterThan(base[4].pot)
    expect(marketCtxFor(g, b, 2023).pot / base[4].pot).toBeLessThanOrEqual(1.4)
  })

  it('lifts every company of the trade in that market, not only the pioneer’s', () => {
    const { g, b } = restaurant(8)
    const other = { ...b, quality: 10, brand: 3 }
    const before = marketCtxFor(g, other, 2024).pot
    addHeavy(g, 'restaurant', 'us', rec())
    expect(marketCtxFor(g, other, 2024).pot).toBeGreaterThan(before)
  })

  it('finds a world market’s record under the world key', () => {
    const g = adult(7, 2020, 'jp')
    const a = company(g, 'software')
    nextYear(g)
    const b = readBiz(g, a)
    const family = breakthroughsFor('software')[1].name
    const base = marketCtxFor(g, b, 2030).pot
    addHeavy(g, 'software', 'jp', rec({ family, year: 2021 }))
    expect(marketCtxFor(g, b, 2030).pot).toBe(base)
    addHeavy(g, 'software', 'world', rec({ family, year: 2021 }))
    expect(marketCtxFor(g, b, 2030).pot).toBeGreaterThan(base)
  })

  it('never draws on the game RNG, and leaves the flags alone', () => {
    const { g, b } = restaurant(9)
    addHeavy(g, 'restaurant', 'us', rec())
    const rng = g.rng
    const flags = JSON.stringify(g.flags)
    marketCtxFor(g, b, 2024)
    marketCtxFor(g, b, 2024)
    heavyOf(g, b)
    heavyPulse(readHeavy(g, 'restaurant', 'us'), 2024)
    rdQuote(g, b, FAM, 500_000)
    retireOrder(b, 2024, heavyOf(g, b))
    expect(g.rng).toBe(rng)
    expect(JSON.stringify(g.flags)).toBe(flags)
  })

  it('works from a deep-frozen state', () => {
    const { g, b } = restaurant(10)
    addHeavy(g, 'restaurant', 'us', rec())
    const freeze = (o: unknown): void => {
      if (!o || typeof o !== 'object' || Object.isFrozen(o)) return
      Object.freeze(o)
      for (const v of Object.values(o)) freeze(v)
    }
    freeze(g.flags)
    expect(() => marketCtxFor(g, b, 2024)).not.toThrow()
    expect(readHeavy(g, 'restaurant', 'us')).toHaveLength(1)
  })
})

describe('a breakthrough is a sort of line of its own', () => {
  const line = (over: Partial<Product> = {}): Product => ({ name: FAM, launched: 2021, boost: 0, quality: 80, family: FAM, kind: 'breakthrough', ...over })

  it('weighs 1.6 against a core line and costs the base amount', () => {
    expect(KIND_WEIGHT.breakthrough).toBe(1.6)
    expect(KIND_COST.breakthrough).toBe(1)
    expect(KIND_WEIGHT.core).toBe(1)
  })

  it('is read from the stored family and kind, and a bare name is a kind of its own', () => {
    expect(infoOf(line(), 'restaurant')).toEqual({ family: FAM, kind: 'breakthrough', gen: 1 })
    expect(infoOf({ name: FAM }, 'restaurant')).toEqual({ family: FAM, kind: 'core', gen: 1 })
  })

  it('pulls 1.6 times a core line of the same quality in the same field, from the record’s demand', () => {
    const f = fieldOf(RIVALS, 3, 'us', 2023, [rec()])
    const heavy = productPull('restaurant', [line()], 2023, f)
    const core = productPull('restaurant', [line({ kind: 'core' })], 2023, f)
    expect(heavy.lines[0]).toMatchObject({ kind: 'breakthrough', family: FAM, level: heavyLevel(rec(), 2023).level })
    expect(heavy.total).toBeGreaterThan(0)
    expect(heavy.total / core.total).toBeCloseTo(1.6, 9)
  })

  it('pulls nothing before its kind exists and nothing extra once the kind is sold by everyone', () => {
    expect(productPull('restaurant', [line({ launched: 2019 })], 2020, fieldOf(RIVALS, 3, 'us', 2020, [rec()])).total).toBe(0)
    // The first years, with no rival offering it, carry the early-mover bonus; later it fades.
    const early = productPull('restaurant', [line()], 2023, fieldOf(RIVALS, 3, 'us', 2023, [rec()])).lines[0]
    const late = productPull('restaurant', [line()], 2034, fieldOf(RIVALS, 3, 'us', 2034, [rec()])).lines[0]
    expect(early.offer).toBe(0)
    expect(late.offer).toBeGreaterThan(0.9)
  })

  describe('in saved games', () => {
    const base = { industry: 'restaurant', countryId: 'us', city: 'Chicago' }
    const other = breakthroughsFor('restaurant')[2].name
    const stored = (kind: Json, family: Json = FAM): Record<string, Json> => ({
      ...base,
      products: [{ name: FAM, launched: 2025, boost: 0.05, quality: 70, family, kind }],
      rd: [{ id: 'rd1', name: other, budget: 1, years: 5, progress: 1, odds: 0.4, boost: 0.05, quality: 70, family, kind, started: 2025 }],
    })
    const load = (kind: Json, family?: Json) => normalizeBiz(stored(kind, family), 2030)

    it('keeps the kind of a catalogue breakthrough on lines and projects', () => {
      const biz = load('breakthrough')
      expect(biz.products[0]).toMatchObject({ family: FAM, kind: 'breakthrough' })
      expect(biz.rd?.[0]).toMatchObject({ name: other, family: FAM, kind: 'breakthrough' })
      const again = normalizeBiz(JSON.parse(JSON.stringify(biz)) as Record<string, Json>, 2030)
      expect(again.products).toEqual(biz.products)
      expect(again.rd).toEqual(biz.rd)
    })

    it('drops a breakthrough kind that does not belong to a catalogue family, and any unknown kind', () => {
      expect(load('breakthrough', 'Tasting Menu').products[0].kind).toBeUndefined()
      expect(load('breakthrough', 'Tasting Menu').rd?.[0].kind).toBeUndefined()
      expect(load('breakthrough', 7).products[0].kind).toBe('breakthrough')
      expect(load('bogus').products[0].kind).toBeUndefined()
      expect(load(5).products[0].kind).toBeUndefined()
      expect(load('core', 'Tasting Menu').products[0].kind).toBe('core')
    })
  })
})

describe('every reader of a kind’s demand uses the record for a breakthrough', () => {
  it('kindLevel and kindTrend: the record for a breakthrough family, the real history for the rest', () => {
    const records = [rec()]
    expect(kindLevel(FAM, 'us', 2023, records)).toEqual(heavyLevel(rec(), 2023))
    expect(kindLevel('Tasting Menu', 'us', 2023, records)).toEqual(demandLevel('Tasting Menu', 'us', 2023))
    expect(kindLevel('Tasting Menu', 'us', 2023)).toEqual(demandLevel('Tasting Menu', 'us', 2023))
    expect(kindLevel('Tasting Menu', 'us', 2023, [])).toEqual(demandLevel('Tasting Menu', 'us', 2023))
    // No record: the family is read like any unlisted name (as before).
    expect(kindLevel(FAM, 'us', 2023, [])).toEqual(demandLevel(FAM, 'us', 2023))
    expect(kindTrend(FAM, 'us', 2022, records)).toBe(1)
    expect(kindTrend(FAM, 'us', 2022, [])).toBe(0)
    expect(kindTrend(FAM, 'us', 2021 + 100, records)).toBe(0)
    expect(kindTrend(FAM, 'us', 2021 + 19, records)).toBe(-1)
    for (const fam of ['Tasting Menu', 'Weekend Brunch', 'Mobile App', 'Street Lighting']) {
      for (const y of [1950, 1990, 2010, 2030]) expect(kindTrend(fam, 'us', y, records)).toBe(demandTrend(fam, 'us', y))
    }
  })

  it('R&D quotes its trend from the record (and still reads the field’s own level)', () => {
    const { g, b } = restaurant(11)
    const plain = rdQuote(g, b, FAM, 500_000)
    addHeavy(g, 'restaurant', 'us', rec({ year: g.year }))
    const q = rdQuote(g, b, FAM, 500_000)
    expect(plain.trend).toBe(0)
    expect(q.trend).toBe(1)
    expect(q.level).toBe(heavyLevel(rec({ year: g.year }), g.year).level)
    // An ordinary idea is quoted exactly as before.
    const idea = 'Weekend Brunch'
    const withRecord = rdQuote(g, b, idea, 300_000)
    const g2 = adult(11, 2020, 'us')
    const a2 = company(g2, 'restaurant')
    nextYear(g2)
    expect(withRecord).toEqual(rdQuote(g2, readBiz(g2, a2), idea, 300_000))
  })

  it('R&D prices a launch year by the record: a kind that does not exist yet adds no customers and is worth less', () => {
    const { g, b } = restaurant(15)
    const plain = rdValue(g, b, FAM, 500_000)
    expect(plain.lift).toBeGreaterThan(0)
    // Another company pioneered it far in the future of this project: nothing to sell for a long while.
    addHeavy(g, 'restaurant', 'us', rec({ year: g.year + 30 }))
    const waiting = rdValue(g, b, FAM, 500_000)
    expect(waiting.lift).toBe(0)
    expect(waiting.value).toBeLessThan(plain.value)
    // Pioneered already: the launch-year pull is the record's own, not a mature default's.
    const g2 = adult(15, 2020, 'us')
    const a2 = company(g2, 'restaurant')
    nextYear(g2)
    const b2 = readBiz(g2, a2)
    addHeavy(g2, 'restaurant', 'us', rec({ year: g2.year }))
    const q = rdQuote(g2, b2, FAM, 500_000)
    const c = marketCtxFor(g2, b2, g2.year)
    const later = fieldOf(c.rivals, c.fringe, c.key, g2.year + q.years, c.field!.heavy)
    const line: Product = { name: FAM, launched: g2.year + q.years, boost: 0, quality: q.quality, family: q.info.family, kind: q.info.kind }
    expect(q.lift).toBeGreaterThan(0)
    expect(q.lift).toBe(Math.max(0, productPull('restaurant', [line], g2.year + q.years, later).total))
    expect(q.lift).toBeLessThan(plain.lift)
  })

  it('"weakest line" ranks a young breakthrough by the record, not by a mature default', () => {
    const { g, b } = restaurant(12)
    const classic: Product = { name: 'Weekend Brunch', launched: 2015, boost: 0, quality: 60 }
    const young: Product = { name: FAM, launched: 2021, boost: 0, quality: 60, family: FAM, kind: 'breakthrough' }
    b.products = [classic, young]
    addHeavy(g, 'restaurant', 'us', rec({ year: 2021 }))
    expect(retireOrder(b, 2022)[0].name).toBe('Weekend Brunch')
    expect(retireOrder(b, 2022, heavyOf(g, b))[0].name).toBe(FAM)
    // With no records the ordering argument changes nothing.
    expect(retireOrder(b, 2022, [])).toEqual(retireOrder(b, 2022))
    // Later, when the kind has caught on, the breakthrough is no longer the weakest.
    expect(retireOrder(b, 2036, heavyOf(g, b))[0].name).toBe('Weekend Brunch')
  })

  it('the Products screen shows the record’s trend for a breakthrough line', () => {
    const { g, a } = restaurant(13)
    const b = bizOf(g, a)
    b.products = [{ name: FAM, launched: g.year, boost: 0, quality: 70, family: FAM, kind: 'breakthrough' }]
    const row = (): string => renderAll(g, a).find((t) => t.startsWith('Quality ') && t.includes('tap to retire')) ?? ''
    expect(row()).toContain('demand steady')
    addHeavy(g, 'restaurant', 'us', rec({ year: g.year }))
    const rng = g.rng
    expect(row()).toContain('demand growing')
    expect(g.rng).toBe(rng)
  })

  it('productsPullOf carries the record through the whole company view', () => {
    const { g, a } = restaurant(14)
    const b = bizOf(g, a)
    b.products = [{ name: FAM, launched: g.year, boost: 0, quality: 70, family: FAM, kind: 'breakthrough' }]
    const none = productsPullOf(g, b, g.year + 1)
    addHeavy(g, 'restaurant', 'us', rec({ year: g.year }))
    const some = productsPullOf(g, b, g.year + 1)
    expect(some.lines[0].level).toBe(heavyLevel(rec({ year: g.year }), g.year + 1).level)
    expect(none.lines[0].level).toBeGreaterThan(some.lines[0].level)
  })
})
