// Ecosystem companies: chip costs, the quality lift and the chip fab. `costFactor` reads one chip source, a fab is priced by
// the plant and never by the money, and the build is authorized inside the action (RF5).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { boardOf } from '../src/game/business/board-state'
import { FAB_BASE, FAB_MAX, type ChipSupply } from '../src/game/business/devices-data'
import {
  bestPlan, bookYear, capitalIndex, costFactor, equipmentValue, evolve, fabCost, fabUpkeep, headOffice, localEcon, planFor, simulateYear, yearFixed,
} from '../src/game/business/economy'
import { buildFabAction, fabGain } from '../src/game/business/manage'
import { industryDef } from '../src/game/business/industries'
import { bizOf, totalOutlets, type BizState } from '../src/game/business/state'
import type { GameState } from '../src/game/types'
import { getCountry } from '../src/game/world'
import { adult, company } from './market-kit'

const textsOf = (g: GameState): string[] => g.log.flatMap((y) => y.entries.map((e) => e.text))
const noticeTexts = (g: GameState): string[] => g.queue.flatMap((m) => (m.kind === 'notice' ? [`${m.title}\n${m.text}`] : []))

const HUBS = ['us', 'cn', 'kr', 'jp', 'tw', 'in', 'gb', 'de', 'fi', 'sg', 'fr']
const SIS = (stage: number, cover: number, node = 5, y = 0.8): ChipSupply => ({ year: 2026, from: 'a1', name: 'Acme Silicon', stage, node, yield: y, cover })

const devices = (seed = 5, year = 2026) => {
  const g = adult(seed, year, 'us')
  const a = company(g, 'devices', { cash: 5e9 })
  return { g, a, b: bizOf(g, a) }
}

describe('costFactor reads one chip source', () => {
  it('scales unit cost by the better of the fabs and the sister, never both', () => {
    const { b } = devices()
    const plain = costFactor(b, true)
    const ratio = (o: object) => costFactor({ ...b, ...o } as BizState, true) / plain
    expect(ratio({ fabs: 1 })).toBeCloseTo(0.9475, 4)
    expect(ratio({ fabs: 3 })).toBeCloseTo(0.895, 4)
    expect(ratio({ chips: SIS(4, 1) })).toBeCloseTo(0.916, 4)
    expect(ratio({ fabs: 3, chips: SIS(4, 1) })).toBeCloseTo(0.895, 4)
    const g = adult(5, 2026, 'us')
    const r = bizOf(g, company(g, 'restaurant', { cash: 1e7 }))
    expect(costFactor({ ...r, fabs: 3 } as BizState, true) / costFactor(r, true)).toBeCloseTo(1, 4)
  })
})

describe('a fab is priced by the plant, never by the money', () => {
  it('fabCost never reads cash, valuation or a statement, and each fab costs 35% more', () => {
    const { b } = devices()
    const price = fabCost(b)
    expect(price).toBe(Math.round(FAB_BASE * capitalIndex(b)))
    for (const o of [{ cash: 1e6 }, { cash: 1e12 }, { valuation: 1, last: null }, { valuation: 1e13 }]) expect(fabCost({ ...b, ...o } as BizState)).toBe(price)
    expect(fabCost({ ...b, fabs: 1 })).toBe(Math.round(FAB_BASE * capitalIndex(b) * 1.35))
    expect(fabCost({ ...b, fabs: 2 })).toBe(Math.round(FAB_BASE * capitalIndex(b) * 1.7))
    expect(Math.abs(fabCost(b, 2) - (price + fabCost({ ...b, fabs: 1 })))).toBeLessThanOrEqual(1)
  })

  it('capitalIndex is the local capital against the trade default', () => {
    const { b } = devices()
    expect(capitalIndex(b)).toBeCloseTo(localEcon(b.industry, b.countryId, b.city).capital / industryDef('devices').capital, 10)
  })

  it('fabUpkeep follows the plant count and is zero for other trades', () => {
    const { g, b } = devices()
    const idx = capitalIndex(b)
    const one = Math.round(0.07 * FAB_BASE * idx)
    expect(fabUpkeep(b)).toBe(0)
    expect(fabUpkeep({ ...b, fabs: 1 })).toBe(one)
    expect(Math.abs(fabUpkeep({ ...b, fabs: 2 }) - one * 2.35)).toBeLessThanOrEqual(1)
    const r = bizOf(g, company(g, 'restaurant', { cash: 1e7 }))
    expect(fabUpkeep({ ...r, fabs: 3 } as BizState)).toBe(0)
  })
})

describe('the year books the upkeep and the books ignore the fab as equipment', () => {
  it('bookYear adds the fab upkeep through the finance, CEO and head-office multipliers', () => {
    const { g, b } = devices()
    const k = yearFixed(g, b)
    const b2 = { ...b, fabs: 1 } as BizState
    const upkeep = (x: BizState) => bookYear(g, x, g.year, planFor(g, x, g.year, { calm: true }), x.production, 0, k).stmt.upkeep
    const want = fabUpkeep(b2) * k.finance * k.ceoEff * (1 + headOffice(totalOutlets(b)))
    expect(Math.abs(upkeep(b2) - upkeep(b) - want)).toBeLessThanOrEqual(2)
    expect(upkeep(b2)).toBeGreaterThan(upkeep(b))
  })

  it('a fab is not equipment (insurance, damage, credit and liquidation never see it)', () => {
    const { b } = devices()
    expect(equipmentValue({ ...b, fabs: 2 } as BizState)).toBe(equipmentValue(b))
  })
})

describe('chips lift quality through evolve', () => {
  it('three fabs end three years above no fab, under the cap', () => {
    const { g, b } = devices()
    const rng = g.rng
    const run = (clone: BizState): number => {
      g.rng = rng
      const stmt = simulateYear(g, clone, g.year, 0, 1).stmt
      for (let i = 0; i < 3; i++) evolve(g, clone, stmt, g.year + i)
      return clone.quality
    }
    const plain = run(structuredClone(b))
    const fabbed = run({ ...structuredClone(b), fabs: 3 } as BizState)
    expect(fabbed).toBeGreaterThanOrEqual(plain + 1)
    expect(fabbed).toBeLessThanOrEqual(98)
  })
})

describe('fabGain and its hint', () => {
  it('is the plan difference, negative for one studio, positive and repaid for a big company', () => {
    const { g, a, b } = devices()
    const diff = () => bestPlan(g, { ...b, fabs: 1 } as BizState, { fast: true }).profit - bestPlan(g, b, { fast: true }).profit
    expect(fabGain(g, a)).toBeCloseTo(diff(), 4)
    expect(fabGain(g, a)).toBeLessThan(0)
    expect(buildFabAction(a).hint!(g)).toContain("The savings don't cover the upkeep.")

    // Measured in 2026 (seed 5, US founder). In one country demand saturates near 0.8B of sales and a fab never repays there
    // (the gain turns positive from about 150 studios but is a few million a year against 159M). Spread over the eleven hub
    // countries with 100 studios each, sales are about 2.8B, one fab saves about 25M a year net of upkeep and repays in about 6 years.
    b.outlets = HUBS.map((countryId) => ({ countryId, city: getCountry(countryId).cities[0], count: 100, opened: 2020 }))
    const sales = bestPlan(g, b, { fast: true })
    expect(sales.demand * sales.price).toBeGreaterThan(2e9)
    expect(fabGain(g, a)).toBeCloseTo(diff(), 4)
    expect(fabGain(g, a)).toBeGreaterThan(0)
    expect(fabCost(b) / fabGain(g, a)).toBeLessThanOrEqual(8)
    expect(buildFabAction(a).hint!(g)).toMatch(/Cost savings alone repay it in about (a year|\d+ years)\. Quality gains are extra\./)
  })

  it('draws no random number', () => {
    const { g, a } = devices()
    const rng = g.rng
    const before = JSON.stringify(g)
    fabGain(g, a)
    buildFabAction(a).hint!(g)
    buildFabAction(a).disabledReason!(g)
    expect(g.rng).toBe(rng)
    expect(JSON.stringify(g)).toBe(before)
  })
})

describe('building a fab (RF5)', () => {
  it('builds a fab and nothing else', () => {
    const { g, a, b } = devices()
    const price = fabCost(b)
    b.cash = price + 1e6 // b is the live a.details, so take the price before the run
    const row = buildFabAction(a)
    const cash = b.cash
    const rng = g.rng
    const equipment = equipmentValue(b)
    expect(row.id).toBe(`biz.fab.${a.id}`)
    expect(row.label).toBe('Build a Chip Fab')
    row.run(g)
    expect(bizOf(g, a).fabs).toBe(1)
    expect(bizOf(g, a).cash).toBe(cash - price)
    expect(g.rng).toBe(rng)
    expect(equipmentValue(bizOf(g, a))).toBe(equipment)
    expect(textsOf(g)).toContain(`${a.name} built a chip fab.`)
    expect(noticeTexts(g).join('\n')).toContain('Fab Online')
  })

  it('takes the new price for the second fab and stops at three', () => {
    const { g, a, b } = devices()
    const first = fabCost(b)
    b.cash = first + 1e6
    buildFabAction(a).run(g)
    expect(bizOf(g, a).fabs).toBe(1)
    const second = fabCost(bizOf(g, a))
    expect(second).toBe(Math.round(first * 1.35))
    bizOf(g, a).cash = second + 1e6
    const cash = bizOf(g, a).cash
    buildFabAction(a).run(g)
    expect(bizOf(g, a).fabs).toBe(2)
    expect(bizOf(g, a).cash).toBe(cash - second)
    const third = fabCost(bizOf(g, a))
    bizOf(g, a).cash = third + 1e6
    buildFabAction(a).run(g)
    expect(bizOf(g, a).fabs).toBe(FAB_MAX)
    bizOf(g, a).cash = 5e10
    const row = buildFabAction(a)
    expect(row.disabledReason!(g)).toBe('Three fabs is the most a company can run.')
    const before = JSON.stringify(a.details)
    row.run(g)
    expect(bizOf(g, a).fabs).toBe(FAB_MAX)
    expect(JSON.stringify(a.details)).toBe(before)
  })

  it('refuses, and changes nothing, for a minor, a poor company, a fourth fab, another trade and a lost company', () => {
    const cases: Array<[string, () => { g: GameState; a: ReturnType<typeof devices>['a'] }]> = [
      ['age 17', () => { const { g, a } = devices(); g.character.age = 17; return { g, a } }],
      ['short of cash', () => { const { g, a, b } = devices(); b.cash = fabCost(b) - 1; return { g, a } }],
      ['fourth fab', () => { const { g, a, b } = devices(); b.fabs = 3; return { g, a } }],
      ['a restaurant', () => { const g = adult(7, 2026, 'us'); const a = company(g, 'restaurant', { cash: 5e9 }); return { g, a } }],
      ['no longer owned', () => { const { g, a } = devices(); g.assets = g.assets.filter((x) => x.id !== a.id); return { g, a } }],
    ]
    for (const [name, make] of cases) {
      const { g, a } = make()
      const details = JSON.stringify(a.details)
      const money = g.character.money
      const rng = g.rng
      buildFabAction(a).run(g)
      expect(JSON.stringify(a.details), name).toBe(details)
      expect(g.character.money, name).toBe(money)
      expect(g.rng, name).toBe(rng)
    }
  })

  it('says why a fab is not for sale', () => {
    const { g, a, b } = devices()
    b.cash = fabCost(b) - 1
    expect(buildFabAction(a).disabledReason!(g)).toMatch(/^Not enough company cash\. A fab costs \$/)
    const r = adult(8, 2026, 'us')
    const ra = company(r, 'restaurant', { cash: 5e9 })
    expect(buildFabAction(ra).disabledReason!(r)).toBe('Only a device company builds chip fabs.')
  })

  it('goes to a board vote when there is one, and moves money only on approval', () => {
    let approved = 0
    let rejected = 0
    for (let seed = 90; seed < 130 && !(approved >= 2 && rejected >= 2); seed++) {
      const { g, a, b } = devices(seed)
      b.share = 0.4
      boardOf(b).limits = { capex: 0, reserve: 3, pay: 1.5 }
      const price = fabCost(b)
      const cash = b.cash
      buildFabAction(a).run(g)
      const vote = noticeTexts(g).join('\n').match(/Board Vote: (Approved|Rejected)/)
      expect(vote, `seed ${seed}`).not.toBeNull()
      const built = (bizOf(g, a).fabs ?? 0) === 1
      expect(bizOf(g, a).cash, `seed ${seed}`).toBe(built ? cash - price : cash)
      expect(built, `seed ${seed}`).toBe(vote![1] === 'Approved')
      if (built) approved++
      else rejected++
    }
    expect(approved).toBeGreaterThan(0)
    expect(rejected).toBeGreaterThan(0)
  })

  it('draws no random number without a board', () => {
    const { g, a, b } = devices()
    b.cash = fabCost(b) + 1e6
    const rng = g.rng
    buildFabAction(a).run(g)
    expect(noticeTexts(g).join('\n')).not.toMatch(/Board Vote/)
    expect(g.rng).toBe(rng)
  })

  it('a hired CEO never builds one', () => {
    const src = readFileSync(new URL('../src/game/business/board-ceo.ts', import.meta.url), 'utf8')
    expect(src).not.toContain('fabs')
    expect(src).not.toContain('buildFab')
  })
})
