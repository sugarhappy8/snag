// Ecosystem companies: spec sheets. One sheet per hardware kind on sale, three rows each (performance, quality, price) against the
// rivals that sell that kind, with the price negated so the cheapest ranks first. Pure, and no row names a rival.
import { describe, expect, it } from 'vitest'
import { familyId } from '../src/game/business/competition-roster'
import { devicePerf, HARDWARE_FAMILIES, kindReference, LINE_PRICE, MARKET_YIELD, marketNode, OS_FAMILY } from '../src/game/business/devices-data'
import { specLines, specSheet } from '../src/game/business/devices-specs'
import { localEcon, marketCtxFor } from '../src/game/business/economy'
import { fieldFor } from '../src/game/business/product-market'
import { scoreText } from '../src/game/business/scorecard'
import { rivalPriceIndex } from '../src/game/business/silicon'
import { bizOf, type BizState, type Product } from '../src/game/business/state'
import { money } from '../src/game/business/util'
import type { GameState } from '../src/game/types'
import { adult, company } from './market-kit'

const rival = (id: string, quality: number, tech: number, pull = 1, legacy = false) => ({
  id, name: `Rival ${id}`, hq: 'us', founded: 1990, quality, tech, legacy, real: false, tier: 'mid' as const, seg: 'mass' as const, pull, prev: 0,
})
type Rival = ReturnType<typeof rival>

const ctxWith = (g: GameState, b: BizState, rivals: Rival[], versions: number[]) => {
  const c = marketCtxFor(g, b, g.year)
  return { ...c, rivals, field: { ...fieldFor(c), versions: () => versions } }
}

const devices = (seed = 5, year = 2026) => {
  const g = adult(seed, year, 'us')
  const a = company(g, 'devices', { cash: 5e9 })
  const b = bizOf(g, a)
  b.price = localEcon(b.industry, b.countryId, b.city).goingPrice
  return { g, a, b }
}

const line = (name: string, family: string, quality: number, launched: number, kind: Product['kind'] = 'core'): Product => ({ name, launched, boost: 0, quality, family, kind })

/** The fixed field of the plan: A and B count, C has no version, D has no pull, E is legacy. */
const FIELD = [rival('A', 60, 67), rival('B', 60, 40), rival('C', 60, 50), rival('D', 60, 50, 0), rival('E', 60, 50, 1, true)]
const VERSIONS = [60, 60, -1, 60, 60]

describe('specSheet', () => {
  it('ranks and ties on a fixed field', () => {
    const { g, b } = devices()
    b.products = [line('Smartphone', 'Smartphone', 62, 2025)]
    const sheet = specSheet(g, b, g.year, ctxWith(g, b, FIELD, VERSIONS))
    expect(sheet).toHaveLength(1)
    const spec = sheet[0]
    // the rivals' performance is the market's chips at their tech: 69 and 65
    expect(devicePerf(60, marketNode(2026), MARKET_YIELD) + Math.round((67 - 55) / 6)).toBe(69)
    expect(devicePerf(60, marketNode(2026), MARKET_YIELD) + Math.round((40 - 55) / 6)).toBe(65)
    expect(scoreText(spec.perf)).toBe('Performance 68. Market 67, best 69, rank 2 of 3.')
    expect(scoreText(spec.quality)).toBe('Quality 62. Market 60, best 62, rank 1 of 3.')
    expect(spec.family).toBe('Smartphone')
    expect(spec.line).toBe('Smartphone')
  })

  it('shares the better rank on a tie, and says so plainly with no rivals', () => {
    const { g, b } = devices()
    b.products = [line('Smartphone', 'Smartphone', 62, 2025)]
    const tied = specSheet(g, b, g.year, ctxWith(g, b, [rival('A', 62, 50), rival('B', 62, 50)], [62, 62]))[0]
    expect(tied.quality.rank).toBe(1)
    expect(tied.quality.of).toBe(3)
    expect(tied.quality.best).toBe(62)
    const alone = specSheet(g, b, g.year, ctxWith(g, b, [], []))[0]
    expect(scoreText(alone.perf)).toBe('Performance 68. The market has no figures.')
    expect(scoreText(alone.quality)).toBe('Quality 62. The market has no figures.')
    expect(scoreText(alone.price, (n) => money(Math.abs(n)))).toBe('Price $900. The market has no figures.')
    expect(specLines(alone).join(' ')).not.toMatch(/NaN|undefined|Infinity/)
  })

  it('clamps a rival performance to 0 to 100', () => {
    const { g, b } = devices()
    b.products = [line('Smartphone', 'Smartphone', 62, 2025)]
    const spec = specSheet(g, b, g.year, ctxWith(g, b, [rival('A', 100, 100), rival('B', 0, 0)], [100, 0]))[0]
    expect(spec.perf.best).toBeLessThanOrEqual(100)
    expect(spec.perf.market).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(spec.perf.market)).toBe(true)
  })

  it('negates the price so the cheapest ranks first', () => {
    const { g, b } = devices()
    b.products = [line('Smartphone', 'Smartphone', 62, 2025)]
    const ctx = ctxWith(g, b, FIELD, VERSIONS)
    const spec = specSheet(g, b, g.year, ctx)[0]
    expect(spec.price.mine).toBe(-900)
    expect(spec.price.of).toBe(3)
    expect(scoreText(spec.price, (n) => money(Math.abs(n)))).toMatch(/^Price \$900\./)
    const fam = familyId(g.lifeId)
    const theirs = [FIELD[0], FIELD[1]].map((r) => -kindReference('Smartphone', 2026) * rivalPriceIndex(fam, r, 2026))
    expect(spec.price.best).toBeCloseTo(Math.max(-900, ...theirs), 6)
    expect(spec.price.market).toBeCloseTo((theirs[0] + theirs[1]) / 2, 6)
    expect(spec.price.rank).toBe(1 + theirs.filter((n) => n > -900).length)
  })

  it('scales the price by the going price and by the sort of line', () => {
    const { g, b } = devices()
    const going = localEcon(b.industry, b.countryId, b.city).goingPrice
    b.price = 1.1 * going
    b.products = [line('Smartphone Pro', 'Smartphone', 62, 2025, 'premium')]
    const pro = specSheet(g, b, g.year, ctxWith(g, b, FIELD, VERSIONS))[0]
    expect(pro.price.mine).toBeCloseTo(-900 * 1.1 * 1.25, 6)
    b.price = going
    for (const kind of ['core', 'next', 'premium', 'value', 'regional'] as const) {
      b.products = [line(`Smartphone ${kind}`, 'Smartphone', 62, 2025, kind)]
      const spec = specSheet(g, b, g.year, ctxWith(g, b, FIELD, VERSIONS))[0]
      expect(spec.price.mine).toBeCloseTo(-900 * LINE_PRICE[kind], 6)
    }
  })

  it('gives bundles, add-ons, breakthroughs and the platform no sheet', () => {
    const { g, b } = devices()
    b.products = [
      line('Smartphone Accessories', 'Smartphone', 80, 2025, 'addon'),
      line('Smartphone Bundle', 'Smartphone', 80, 2025, 'bundle'),
      line('Touch Slate Computer', 'Touch Slate Computer', 80, 2025, 'breakthrough'),
      line(OS_FAMILY, OS_FAMILY, 80, 2025),
    ]
    expect(specSheet(g, b, g.year, ctxWith(g, b, FIELD, VERSIONS))).toEqual([])
  })

  it('picks the best line of a kind and gives one sheet per hardware kind, in order', () => {
    const { g, b } = devices()
    b.products = [
      line('Smartphone', 'Smartphone', 55, 2025),
      line('Smartphone Pro', 'Smartphone', 70, 2025, 'premium'),
      line('Laptop', 'Laptop', 60, 2025),
      line(OS_FAMILY, OS_FAMILY, 80, 2025),
    ]
    const sheet = specSheet(g, b, g.year, ctxWith(g, b, FIELD, VERSIONS))
    expect(sheet.map((s) => s.family)).toEqual(['Laptop', 'Smartphone'])
    expect(sheet.map((s) => s.family)).toEqual(HARDWARE_FAMILIES.filter((f) => f === 'Laptop' || f === 'Smartphone'))
    expect(sheet[1].line).toBe('Smartphone Pro')
    expect(sheet[1].quality.mine).toBe(70)
    // a tie in effective quality goes to the later launch (neither has aged yet), then to the name
    b.products = [line('Smartphone', 'Smartphone', 62, 2025), line('Smartphone Pro', 'Smartphone', 62, 2026, 'premium')]
    expect(specSheet(g, b, g.year, ctxWith(g, b, FIELD, VERSIONS))[0].line).toBe('Smartphone Pro')
    b.products = [line('Smartphone B', 'Smartphone', 62, 2026), line('Smartphone A', 'Smartphone', 62, 2026)]
    expect(specSheet(g, b, g.year, ctxWith(g, b, FIELD, VERSIONS))[0].line).toBe('Smartphone A')
  })

  it('reads a line launched this year as flat, and an aging line as slipping', () => {
    const { g, b } = devices()
    b.products = [line('Smartphone', 'Smartphone', 62, 2026)]
    const fresh = specSheet(g, b, g.year, ctxWith(g, b, FIELD, VERSIONS))[0]
    expect([fresh.perf.trend, fresh.quality.trend, fresh.price.trend]).toEqual([0, 0, 0])
    b.products = [line('Smartphone', 'Smartphone', 62, 2022)]
    const old = specSheet(g, b, g.year, ctxWith(g, b, FIELD, VERSIONS))[0]
    expect(old.quality.trend).toBe(-1)
    // the market price moved about 4 dollars on 900, under the half-percent band the score rows use
    expect(old.price.trend).toBe(0)
  })

  it('reads a real price move as a trend', () => {
    const { g, b } = devices(5, 2008)
    b.products = [line('Smartphone', 'Smartphone', 62, 2005)]
    const spec = specSheet(g, b, g.year, ctxWith(g, b, [], []))[0]
    // 1,100 in 2007 to 1,000 in 2010: the cheaper year is better
    expect(spec.price.mine).toBeGreaterThan(-1100)
    expect(spec.price.trend).toBe(1)
  })

  it('is pure and names nobody', () => {
    const { g, b } = devices()
    b.products = [line('Smartphone', 'Smartphone', 62, 2025), line('Laptop', 'Laptop', 60, 2024)]
    const ctx = ctxWith(g, b, FIELD, VERSIONS)
    const json = JSON.stringify(g)
    const rng = g.rng
    const sheet = specSheet(g, b, g.year, ctx)
    const texts = sheet.flatMap((s) => specLines(s))
    expect(texts).toHaveLength(6)
    expect(JSON.stringify(g)).toBe(json)
    expect(g.rng).toBe(rng)
    for (const t of texts) {
      expect(t).not.toMatch(/NaN|undefined|Infinity|null/)
      for (const r of FIELD) expect(t).not.toContain(r.name)
    }
  })

  it('is empty for a company that is not a device maker', () => {
    const g = adult(5, 2026, 'us')
    const a = company(g, 'restaurant', { cash: 1e7 })
    const b = bizOf(g, a)
    expect(specSheet(g, b, g.year, marketCtxFor(g, b, g.year))).toEqual([])
  })
})
