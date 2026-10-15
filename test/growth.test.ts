// Unlimited growth without free money: an endless, era-appropriate stream of product ideas; R&D
// projects funded with a budget (several at once, no yearly cap); outlets and capacity lines
// built through sliders with no hard cap; deep-tech next-generation R&D that never runs out;
// bigger studios running more games at once. And the honest limits that keep it from minting
// money: diminishing demand, complexity costs, crowded cities, rents, head office, cash.
import { describe, expect, it } from 'vitest'
import { becomeCeo } from '../src/game/business/career'
import { bestPlan, citySaturation, cityCrowding, densityRent, equipmentValue, evolve, lineCost, localEcon, maxProduction, planFor, productsBoost, recordYear, simulateYear, valuationOf } from '../src/game/business/economy'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { businessView } from '../src/game/business/manage'
import { complexityShare, productIdeas, rangeBrand } from '../src/game/business/products'
import { bestRdBudget, rdRange, rdQuote, rdSlots, rdValue, retireLines } from '../src/game/business/rd'
import { fieldOf, productPull, RANGE_CAP } from '../src/game/business/product-market'
import { bizOf, findBusiness, normalizeBiz, readBiz, totalOutlets, type BizState, type Product } from '../src/game/business/state'
import { applyPlan, autoPlan, yearlyBusinessImpl } from '../src/game/business/yearly'
import { advancePrograms, maxPrograms, programCost, programLine, programTerms, startProgram } from '../src/game/business/deeptech-rd'
import { money } from '../src/game/business/util'
import { PROGRAMS, maxStage, programDef } from '../src/game/business/deeptech-data'
import { techOf, techView } from '../src/game/business/deeptech-core'
import { readTech } from '../src/game/business/deeptech-state'
import { maxPipeline } from '../src/game/business/gamestudio'
import { anachronismsIn } from '../src/game/events/era'
import type { Industry } from '../src/game/data/markets'
import { createNewLife } from '../src/game/life'
import { runScript } from '../src/game/scripts'
import { HINT_EMOJI } from '../src/game/talents'
import type { Asset, ChoiceModal, GameState, Json, MenuAction, MenuNode } from '../src/game/types'
import { getCountry } from '../src/game/world'

/** An adult who has run a company for two years (it has a history and a last statement). */
function company(seed: number, countryId: string, industry: Industry, opts: { talent?: boolean; cash?: number; year?: number } = {}): { g: GameState; a: Asset; b: BizState } {
  const g = createNewLife({ seed, year: 2000, countryId })
  g.queue = []
  const c = g.character
  c.age = 30
  g.year = opts.year ?? 2030
  c.money = 5_000_000
  c.talent = null
  c.talents = opts.talent ? ['Business'] : undefined
  c.stats.smarts = 65
  c.licenses = ['driver']
  const city = getCountry(countryId).cities[0]
  const b0 = newBiz(g, industry, countryId, city, { cash: opts.cash ?? 250_000 })
  const a = createBusinessAsset(g, 'Test Co', b0, 100_000)
  g.assets.push(a)
  becomeCeo(g, a, b0)
  const b = bizOf(g, a)
  applyPlan(b, autoPlan(g, b, 1))
  for (let y = 0; y < 2; y++) {
    const r = simulateYear(g, b, g.year, b.ownerSalary)
    evolve(g, b, r.stmt, g.year)
    recordYear(b, r.stmt)
    b.valuation = valuationOf(b)
    g.year += 1
    applyPlan(b, autoPlan(g, b, r.stmt.cycle))
  }
  if (opts.cash !== undefined) b.cash = opts.cash
  g.queue = []
  return { g, a, b }
}

/** Every row of a menu tree, depth first (groups' children included). */
function allNodes(g: GameState, nodes: MenuNode[], depth = 0, max = 4): MenuNode[] {
  const out: MenuNode[] = []
  for (const n of nodes) {
    out.push(n)
    if (n.type === 'menu' && depth < max) out.push(...allNodes(g, n.children(g), depth + 1, max))
  }
  return out
}

function action(g: GameState, a: Asset, prefix: string): MenuAction {
  const n = allNodes(g, businessView(g, a)).find((x) => x.type === 'action' && x.id.startsWith(prefix))
  if (!n || n.type !== 'action') throw new Error(`no action ${prefix}`)
  return n
}

function fresh(n: number, year: number, boost = 0.1): Product[] {
  return Array.from({ length: n }, (_, i) => ({ name: `Line ${i}`, launched: year, boost }))
}

function finite(b: BizState): boolean {
  return [b.cash, b.valuation, b.debt, b.price, b.production, b.inventory, b.brand, b.quality, b.morale].every((x) => Number.isFinite(x))
}

describe('product ideas: an endless, era-appropriate stream', () => {
  it('never runs out, never repeats a line on sale or in development', () => {
    const { g, b } = company(1, 'us', 'restaurant')
    const taken: string[] = []
    let products: Product[] = []
    for (let i = 0; i < 600; i++) {
      const ideas = productIdeas(g, { ...b, products, rd: [] }, 5)
      expect(ideas.length).toBe(5)
      for (const x of ideas) expect(taken).not.toContain(x)
      taken.push(ideas[0])
      products = [...products, { name: ideas[0], launched: g.year, boost: 0.05 }]
    }
    // Classics first, then variants (premium, regional, bundles...), then next generations.
    expect(taken[0]).toBe('Tasting Menu')
    expect(taken.some((x) => x.startsWith('Premium '))).toBe(true)
    expect(taken.some((x) => /Recipe No\. \d+/.test(x))).toBe(true)
    // Ideas in development are skipped too.
    const dev = productIdeas(g, { ...b, products: [], rd: [{ name: 'Tasting Menu' }] }, 3)
    expect(dev).not.toContain('Tasting Menu')
  })

  it('works for every classic industry and respects the era (no apps in 1975)', () => {
    for (const ind of ['foodTruck', 'cafe', 'bakery', 'fashion', 'beauty', 'gym', 'software', 'manufacturing', 'farm', 'energy', 'clinic', 'marketing', 'ecommerce'] as Industry[]) {
      const { g, b } = company(2, 'us', ind)
      const ideas = productIdeas(g, { ...b, products: fresh(40, g.year) }, 8)
      expect(ideas.length, ind).toBe(8)
    }
    const old = company(3, 'us', 'software', { year: 1975 })
    const many = productIdeas(old.g, { ...old.b, products: [] }, 60)
    expect(many.length).toBeGreaterThan(10)
    for (const x of many) expect(anachronismsIn(x, 1975, ['us']), x).toEqual([])
    expect(many.some((x) => /app\b/i.test(x))).toBe(false)
  })
})

describe('product ideas in historical lives (review: 1925 bakeries offered cronut knockoffs)', () => {
  const MODERN = ['Smart Home Gadget', 'Hard Seltzer', 'Hazy IPA', 'Cronut Knockoffs', 'Vegan Burger', 'Telehealth', 'Battery Storage', 'Oat Milk Everything', 'Birria Tacos', 'Athleisure Range', 'Spin Studio', 'Influencer Network', 'Fitness App']
  const CLASSIC = ['foodTruck', 'restaurant', 'cafe', 'bakery', 'bar', 'brewery', 'grocery', 'fashion', 'beauty', 'salon', 'gym', 'autoShop', 'construction', 'realEstate', 'marketing', 'clinic', 'hotel', 'logistics', 'manufacturing', 'farm', 'energy', 'entertainment'] as Industry[]

  it('offers era-appropriate ideas without end, in 1925 and 1960', () => {
    for (const year of [1925, 1960]) {
      const g = createNewLife({ seed: 3, year: year - 35, countryId: 'us' })
      g.queue = []
      g.year = year
      for (const ind of CLASSIC) {
        const b: Pick<BizState, 'industry' | 'countryId' | 'products' | 'outlets'> = { industry: ind, countryId: 'us', products: [], outlets: [{ countryId: 'us', city: getCountry('us').cities[0], count: 1, opened: year }] }
        const ideas = productIdeas(g, b, 30)
        expect(ideas.length, `${year} ${ind}`).toBe(30)
        for (const x of ideas) {
          for (const m of MODERN) expect(x.includes(m), `${year} ${ind}: ${x}`).toBe(false)
          if (year < 1975) expect(x, `${year} ${ind}`).not.toMatch(/^Eco | Lite\b| Pro\b| Max\b|\d\.0\b|Take-Home Kit/)
          expect(anachronismsIn(x, year, ['us']), x).toEqual([])
        }
      }
    }
  })

  it('gives the newer trades period classics before their modern ideas existed (1925, 1965)', () => {
    const NEWER = ['battery', 'water', 'recycling', 'telecom', 'dataCenter', 'education', 'petCare', 'homeCare', 'packaging', 'furniture', 'travel', 'casino', 'nightclub'] as Industry[]
    for (const year of [1925, 1965]) {
      const g = createNewLife({ seed: 3, year: year - 35, countryId: 'us' })
      g.queue = []
      g.year = year
      for (const ind of NEWER) {
        if (ind === 'dataCenter' && year < 1960) continue
        const b: Pick<BizState, 'industry' | 'countryId' | 'products' | 'outlets'> = { industry: ind, countryId: 'us', products: [], outlets: [{ countryId: 'us', city: getCountry('us').cities[0], count: 1, opened: year }] }
        const ideas = productIdeas(g, b, 30)
        expect(ideas.length, `${year} ${ind}`).toBe(30)
        for (const x of ideas) expect(anachronismsIn(x, year, ['us']), `${year} ${ind}: ${x}`).toEqual([])
        for (const modern of ['Fiber Broadband', 'Cloud Hosting', 'Coding Bootcamps', 'E-Waste Processing', 'Grid Storage', 'Smart Metering']) expect(ideas.some((x) => x.includes(modern)), `${year} ${ind}`).toBe(false)
      }
    }
  })

  it('keeps the modern classics first today', () => {
    const { g, b } = company(4, 'us', 'bakery')
    const ideas = productIdeas(g, { ...b, products: [] }, 6)
    expect(ideas).toContain('Cronut Knockoffs')
    expect(ideas).not.toContain('Rye Loaf')
  })
})

describe('product range economics', () => {
  it('stacks different kinds of product one for one, lets variants share their kind and saturates a vast range', () => {
    const year = 2030
    // A market with no named rivals: only the long tail, so every kind is judged the same way.
    const field = fieldOf([], 10, 'us', year)
    const line = (name: string, quality = 60) => ({ name, launched: year, boost: 0, quality })
    const one = productPull('restaurant', [line('Tasting Menu')], year, field).total
    const other = productPull('restaurant', [line('Weekend Brunch')], year, field).total
    const both = productPull('restaurant', [line('Tasting Menu'), line('Weekend Brunch')], year, field).total
    expect(one).toBeGreaterThan(0)
    expect(both).toBeCloseTo(one + other, 9)
    // A premium edition of the same kind adds much less than a new kind would.
    const variant = productPull('restaurant', [line('Tasting Menu'), line('Premium Tasting Menu')], year, field).total - one
    expect(variant).toBeGreaterThan(0)
    expect(variant).toBeLessThan(other / 2)
    // A better line pulls more than a worse one of the same kind.
    expect(productPull('restaurant', [line('Tasting Menu', 80)], year, field).total).toBeGreaterThan(productPull('restaurant', [line('Tasting Menu', 40)], year, field).total * 2)
    // Hundreds of lines never multiply demand without end.
    expect(productPull('restaurant', fresh(200, year), year, field).total).toBeLessThan(RANGE_CAP)
    expect(rangeBrand(200)).toBeLessThanOrEqual(16)
    expect(rangeBrand(6)).toBeLessThan(12)
    // Complexity grows faster than the range.
    expect(complexityShare(100) / complexityShare(10)).toBeGreaterThan(10)
  })

  it('follows each kind of product\'s real history: nothing before it existed, booms and fades after', () => {
    const field = (year: number) => fieldOf([], 10, 'us', year)
    const pull = (name: string, year: number) => productPull('energy', [{ name, launched: year, boost: 0, quality: 60 }], year, field(year)).total
    // Coal plants were the backbone of power in 1960 and are fading now; batteries the reverse.
    expect(pull('Coal-Fired Plant', 1960)).toBeGreaterThan(pull('Coal-Fired Plant', 2030) * 1.8)
    expect(pull('Battery Storage', 2030)).toBeGreaterThan(0)
    expect(pull('Battery Storage', 1990)).toBe(0)
    // A fad: cronut knockoffs in 2014 against 2030.
    const bakery = (year: number) => productPull('bakery', [{ name: 'Cronut Knockoffs', launched: year, boost: 0, quality: 60 }], year, field(year)).total
    expect(bakery(2014)).toBeGreaterThan(bakery(2030) * 3)
  })

  it('makes 200 product lines lose money in every kind of company (no profit from R&D spam)', () => {
    for (const ind of ['restaurant', 'software', 'manufacturing', 'cafe', 'hotel', 'energy'] as Industry[]) {
      const { g, b } = company(5, 'us', ind)
      const profit = (n: number) => bestPlan(g, { ...b, products: fresh(n, g.year) }, { fast: true }).profit
      const none = profit(0)
      const some = profit(12)
      const spam = profit(200)
      expect(some, ind).toBeGreaterThan(none)
      expect(spam, ind).toBeLessThan(none)
      expect(spam, ind).toBeLessThan(0)
    }
  })

  it('books the complexity of a big range as a real cost', () => {
    const { g, b } = company(6, 'us', 'cafe')
    const small = simulateYear(g, { ...b, products: fresh(3, g.year), inventory: 0 }, g.year, 0, 1).stmt
    const big = simulateYear(g, { ...b, products: fresh(120, g.year), inventory: 0 }, g.year, 0, 1).stmt
    expect(big.upkeep).toBeGreaterThan(small.upkeep * 2)
    expect(big.net).toBeLessThan(small.net)
  })

  it('retires the weakest lines first (the most outdated)', () => {
    const { g, b } = company(7, 'us', 'bakery')
    b.products = [
      { name: 'Old', launched: g.year - 12, boost: 0.1 },
      { name: 'New', launched: g.year, boost: 0.1 },
      { name: 'Mid', launched: g.year - 5, boost: 0.1 },
    ]
    expect(retireLines(b, 2, g.year)).toEqual(['Old', 'Mid'])
    expect(b.products.map((p) => p.name)).toEqual(['New'])
  })
})

describe('R&D projects: a fixed cost per product, no yearly cap', () => {
  it('prices an idea by the product, never by the company\'s cash or sales', () => {
    const small = company(8, 'us', 'manufacturing', { cash: 50_000 })
    const rich = company(8, 'us', 'manufacturing', { cash: 80_000_000 })
    rich.b.last = { ...rich.b.last!, revenue: rich.b.last!.revenue * 40 }
    const idea = productIdeas(small.g, small.b, 1)[0]
    expect(rdRange(rich.b, idea)).toEqual(rdRange(small.b, idea))
    const r = rdRange(small.b, idea)
    expect(r.min).toBeLessThan(r.normal)
    expect(r.max).toBeGreaterThan(r.normal * 3)
    // The slider is the same for both: half to four times the idea's cost.
    const slider = (x: { g: GameState; a: Asset }) => action(x.g, x.a, `biz.launch.${idea}`).input!
    expect([slider(small).min, slider(small).max]).toEqual([slider(rich).min, slider(rich).max])
    expect(slider(small).max).toBe(r.max)
    // A next generation or a premium edition costs more than a regional edition.
    expect(rdRange(small.b, `Premium ${idea}`).normal).toBeGreaterThan(r.normal)
  })

  it('a bigger budget is faster, likelier and makes a better line, with diminishing returns', () => {
    const { g, b } = company(8, 'us', 'manufacturing')
    const idea = productIdeas(g, b, 1)[0]
    const base = rdRange(b, idea).normal
    const q = [0.5, 1, 2, 4].map((k) => rdQuote(g, b, idea, base * k))
    for (let i = 1; i < q.length; i++) {
      expect(q[i].odds).toBeGreaterThanOrEqual(q[i - 1].odds)
      expect(q[i].years).toBeLessThanOrEqual(q[i - 1].years)
      expect(q[i].quality).toBeGreaterThan(q[i - 1].quality)
    }
    // Doubling from 2x to 4x buys less quality than doubling from 1x to 2x.
    expect(q[3].quality - q[2].quality).toBeLessThan(q[2].quality - q[1].quality)
    expect(q[3].odds).toBeLessThanOrEqual(0.95)
    // Past the team's free slots, projects already running stretch it: the same money buys less.
    const busy = { ...b, rd: Array.from({ length: rdSlots(b) + 3 }, (_, i) => ({ id: `r${i}`, name: `P${i}`, budget: base, years: 2, progress: 0, odds: 0.5, boost: 0.1, started: g.year })) }
    expect(rdQuote(g, busy, idea, base).odds).toBeLessThan(rdQuote(g, b, idea, base).odds)
    expect(rdQuote(g, busy, idea, base).quality).toBeLessThan(rdQuote(g, b, idea, base).quality)
  })

  it('funds several projects in one year and launches them at year-end with their own quality', () => {
    const { g, a } = company(9, 'us', 'cafe', { cash: 2_000_000 })
    const cash0 = readBiz(g, a).cash
    let spent = 0
    for (let i = 0; i < 4; i++) {
      const row = action(g, a, `biz.launch.`)
      expect(row.disabledReason?.(g)).toBeNull()
      expect(row.input?.kind).toBe('slider')
      const budget = Math.round(rdRange(readBiz(g, a), row.label).normal * 1.5)
      row.run(g, String(budget))
      spent += budget
      g.queue = []
    }
    const b = readBiz(g, a)
    expect(b.rd?.length).toBe(4)
    expect(b.cash).toBe(cash0 - spent)
    expect(b.yearCosts).toBeGreaterThanOrEqual(spent)
    const names = new Set(b.rd!.map((p) => p.name))
    expect(names.size).toBe(4)
    for (const p of b.rd!) expect(p.quality).toBeGreaterThan(0)
    // Cafés develop recipes in a year: all four resolve at the year-end.
    g.year += 1
    yearlyBusinessImpl(g)
    const after = readBiz(g, findBusiness(g, a.id)!)
    expect(after.rd ?? []).toHaveLength(0)
    const launched = after.products.filter((p) => names.has(p.name))
    expect(launched.length).toBeLessThanOrEqual(4)
    for (const p of launched) {
      expect(p.launched).toBe(g.year)
      expect(p.quality).toBeGreaterThan(0)
      expect(p.family).toBeTruthy()
    }
    expect(finite(after)).toBe(true)
  })

  it('refuses a project the company cannot pay for', () => {
    const { g, a } = company(10, 'us', 'restaurant', { cash: 100 })
    const row = action(g, a, 'biz.launch.')
    expect(row.disabledReason?.(g)).toMatch(/company cash/)
  })

  it("gives an honest best-budget hint: the planner's best expected value", () => {
    const { g, a, b } = company(11, 'us', 'software', { talent: true, cash: 5_000_000 })
    const idea = productIdeas(g, b, 1)[0]
    const best = bestRdBudget(g, b, idea)
    expect(best).not.toBeNull()
    // No other budget in the idea's range is meaningfully better by the same model.
    const r = rdRange(b, idea)
    for (const k of [0.5, 0.75, 1, 1.5, 2, 3, 4]) {
      const budget = Math.min(r.max, Math.max(r.min, r.normal * k))
      expect(rdValue(g, b, idea, budget).value).toBeLessThanOrEqual(best!.value * 1.01 + 1)
    }
    expect(rdValue(g, b, idea, best!.budget).value).toBeCloseTo(best!.value, 6)
    const rng = g.rng
    const row = action(g, a, `biz.launch.${idea}`)
    expect(row.hint?.(g)).toMatch(new RegExp(`^${HINT_EMOJI}.*Best R&D budget`, 'u'))
    expect(g.rng).toBe(rng)
  })
})

describe('outlets without a cap, limited by the market', () => {
  it('opens far more than 25 at once and many times a year, paid from company cash', () => {
    const { g, a } = company(12, 'us', 'foodTruck', { cash: 20_000_000 })
    const city = getCountry('us').cities[1]
    for (let i = 0; i < 5; i++) {
      const row = action(g, a, `biz.open.us.${city}.`)
      expect(row.disabledReason?.(g)).toBeNull()
      expect(row.input?.kind).toBe('slider')
      expect(row.input!.max!).toBeGreaterThan(25)
      row.run(g, '40')
      g.queue = []
    }
    const b = readBiz(g, a)
    expect(b.outlets.find((o) => o.city === city)?.count).toBe(200)
    expect(totalOutlets(b)).toBe(201)
    expect(b.cash).toBeGreaterThan(0)
    expect(maxProduction(g, b)).toBeGreaterThan(0)
  })

  it('makes 5,000 outlets in one city lose money (crowding, rents, head office)', () => {
    for (const ind of ['restaurant', 'foodTruck', 'cafe', 'software', 'gym', 'grocery'] as Industry[]) {
      const { g, b } = company(13, 'us', ind)
      const profit = (n: number) => bestPlan(g, { ...b, outlets: [{ ...b.outlets[0], count: n }] }, { fast: true }).profit
      const one = profit(1)
      const huge = profit(5_000)
      expect(huge, ind).toBeLessThan(0)
      expect(huge, ind).toBeLessThan(one)
    }
    const { b } = company(13, 'us', 'restaurant')
    const e = localEcon(b.industry, b.countryId, b.city)
    const cs = citySaturation(e, b.countryId, b.city)
    expect(cityCrowding(5_000, cs)).toBeLessThan(0.5)
    expect(densityRent(5_000, cs)).toBeGreaterThan(1.5)
    expect(cityCrowding(3, cs)).toBe(1)
    expect(densityRent(3, cs)).toBe(1)
  })

  it('shows an honest payback preview, and "would lose money" when the city cannot take them', () => {
    const { g, a } = company(14, 'us', 'restaurant', { cash: 1e12 })
    const row = action(g, a, `biz.open.us.${getCountry('us').cities[0]}.`)
    const rng = g.rng
    const before = JSON.stringify(g)
    expect(row.input!.preview!(g, 1)).toMatch(/up front · rent about .* a year/)
    expect(row.input!.preview!(g, 5_000)).toMatch(/would lose money/)
    expect(JSON.stringify(g)).toBe(before)
    expect(g.rng).toBe(rng)
  })

  it('cannot mint money by opening and closing outlets', () => {
    const { g, a } = company(15, 'us', 'bakery', { cash: 10_000_000 })
    const city = getCountry('us').cities[2]
    const cash0 = readBiz(g, a).cash
    const value0 = valuationOf(readBiz(g, a))
    action(g, a, `biz.open.us.${city}.`).run(g, '30')
    g.queue = []
    action(g, a, `biz.closeOutlet.us.${city}.`).run(g, '30')
    g.queue = []
    const b = readBiz(g, a)
    expect(b.outlets.some((o) => o.city === city)).toBe(false)
    expect(b.cash).toBeLessThan(cash0)
    expect(valuationOf(b)).toBeLessThan(value0)
  })

  it("names the best number of new outlets by payback (Business talent), never consuming the RNG", () => {
    const { g, a } = company(16, 'us', 'foodTruck', { talent: true, cash: 5_000_000 })
    const rng = g.rng
    const rows = allNodes(g, businessView(g, a)).filter((n) => n.type === 'action' && n.id.startsWith('biz.open.us.'))
    const hints = rows.map((n) => (n.type === 'action' ? n.hint?.(g) : null)).filter((h): h is string => !!h)
    expect(hints.length).toBe(1)
    expect(hints[0]).toMatch(/Best place to expand/)
    expect(g.rng).toBe(rng)
  })
})

describe('capacity lines', () => {
  it('adds production capacity with real capex, and sits idle (a loss) when demand is already met', () => {
    const { g, a } = company(17, 'us', 'manufacturing', { cash: 50_000_000 })
    const b0 = readBiz(g, a)
    const cap0 = maxProduction(g, b0)
    const eq0 = equipmentValue(b0)
    const row = action(g, a, 'biz.lines.')
    expect(row.input?.kind).toBe('slider')
    row.run(g, '10')
    g.queue = []
    const b = readBiz(g, a)
    expect(b.lines).toBe(10)
    expect(maxProduction(g, b)).toBeGreaterThan(cap0)
    expect(b.cash).toBe(b0.cash - lineCost(b0, 10))
    expect(equipmentValue(b)).toBeGreaterThan(eq0)
    // A thousand idle lines cost upkeep and rent: profit falls.
    const idle = bestPlan(g, { ...b0, lines: 1_000 }, { fast: true }).profit
    expect(idle).toBeLessThan(bestPlan(g, b0, { fast: true }).profit)
    // Selling them back recovers only part of the cost.
    action(g, a, 'biz.sellLines.').run(g, '10')
    g.queue = []
    const c = readBiz(g, a)
    expect(c.lines ?? 0).toBe(0)
    expect(c.cash).toBeLessThan(b0.cash)
  })

  it('pays off when demand outgrows the floor', () => {
    const { g, b } = company(18, 'us', 'energy')
    // A booming brand and fresh products push demand past what one plant can make.
    const hot: BizState = { ...b, brand: 95, quality: 95, products: fresh(10, g.year, 0.2), marketingLevel: 2 }
    const p = planFor(g, hot, g.year, { calm: true })
    expect(p.demand).toBeGreaterThan(p.capacity)
    const more = bestPlan(g, { ...hot, lines: 2 }, { fast: true }).profit
    expect(more).toBeGreaterThan(bestPlan(g, hot, { fast: true }).profit)
  })
})

describe('other sliders: marketing, pay, upgrades, training, interviews', () => {
  it('sets a continuous marketing budget and pay level', () => {
    const { g, a } = company(19, 'us', 'cafe')
    const budget = action(g, a, 'biz.budget.')
    expect(budget.input?.kind).toBe('slider')
    budget.run(g, '155')
    g.queue = []
    expect(readBiz(g, a).marketingLevel).toBeCloseTo(1.55, 6)
    const pay = action(g, a, 'biz.pay.')
    expect(pay.input?.kind).toBe('slider')
    pay.run(g, '115')
    g.queue = []
    expect(readBiz(g, a).wageLevel).toBeCloseTo(1.15, 6)
    expect(readBiz(g, a).raiseYear).toBe(g.year)
    // Raising and cutting again in the same year doesn't keep the inflation credit.
    pay.run(g, '100')
    g.queue = []
    expect(readBiz(g, a).raiseYear).toBeLessThan(g.year)
  })

  it('leaves pay alone when the slider is confirmed where it opened, even off the 5% grid (review)', () => {
    const { g, a } = company(24, 'us', 'cafe', { talent: true })
    // A union deal left pay at 108%: the slider opens snapped to 110%.
    bizOf(g, a).wageLevel = 1.08
    const morale = readBiz(g, a).morale
    const raiseYear = readBiz(g, a).raiseYear
    const pay = action(g, a, 'biz.pay.')
    const opened = pay.input!.defaultValue!(g)
    pay.run(g, String(Math.round(Number(opened) / 5) * 5))
    g.queue = []
    expect(readBiz(g, a).wageLevel).toBe(1.08)
    expect(readBiz(g, a).morale).toBe(morale)
    expect(readBiz(g, a).raiseYear).toBe(raiseYear)
    // The hint never points at a level the slider can't move to.
    expect(pay.hint?.(g) ?? '').not.toMatch(/about 110%/)
    // A real move still applies.
    pay.run(g, '100')
    g.queue = []
    expect(readBiz(g, a).wageLevel).toBe(1)
  })

  it('repeats upgrades and training with rising cost and shrinking gains', () => {
    const { g, a } = company(20, 'us', 'restaurant', { cash: 50_000_000 })
    const cash0 = readBiz(g, a).cash
    action(g, a, 'biz.upgrade.').run(g)
    g.queue = []
    const first = cash0 - readBiz(g, a).cash
    const cash1 = readBiz(g, a).cash
    action(g, a, 'biz.upgrade.').run(g)
    g.queue = []
    const second = cash1 - readBiz(g, a).cash
    expect(first).toBeGreaterThan(0)
    expect(second).toBeCloseTo(first * 1.5, -2)
    for (let i = 0; i < 4; i++) {
      action(g, a, 'biz.training.').run(g)
      g.queue = []
    }
    expect(g.yearActions[`biz.training.${a.id}`]).toBe(4)
  })

  it('holds as many interview rounds as the company pays for', () => {
    const { g, a } = company(21, 'us', 'restaurant', { cash: 1_000_000 })
    const cash0 = readBiz(g, a).cash
    const fees: number[] = []
    for (let i = 0; i < 6; i++) {
      const before = readBiz(g, a).cash
      const row = allNodes(g, businessView(g, a)).find((n) => n.type === 'action' && n.id.startsWith(`biz.hire.${a.id}.`) && !n.disabledReason?.(g)) as MenuAction
      row.run(g)
      fees.push(before - readBiz(g, a).cash)
      expect(g.queue.some((m) => m.kind === 'choice')).toBe(true)
      g.queue = []
    }
    expect(fees.every((f) => f > 0)).toBe(true)
    expect(fees[5]).toBeGreaterThan(fees[0])
    expect(readBiz(g, a).cash).toBeLessThan(cash0)
  })

  it('cannot replay a saved candidate modal to duplicate the same key role', () => {
    const { g, a } = company(211, 'us', 'restaurant', { cash: 1_000_000 })
    const row = allNodes(g, businessView(g, a)).find((n) => n.type === 'action' && n.id.startsWith(`biz.hire.${a.id}.`) && !n.disabledReason?.(g)) as MenuAction
    row.run(g)
    const modal = g.queue.find((m): m is ChoiceModal => m.kind === 'choice' && m.source === 'script' && m.scriptId === 'business.hire')!
    expect(modal).toBeDefined()
    const candidate = modal.choices.find((x) => x.id.startsWith('c'))!
    runScript(g, modal.scriptId!, candidate.id, modal.data, modal)
    runScript(g, modal.scriptId!, candidate.id, modal.data, modal)
    expect(readBiz(g, a).staff).toHaveLength(1)
  })
})

describe('slider previews are pure', () => {
  it('never change the game or consume its RNG, for every slider on a company screen', () => {
    const setups: [string, Industry, boolean][] = [
      ['us', 'restaurant', true],
      ['us', 'manufacturing', false],
      ['jp', 'software', true],
    ]
    let checked = 0
    for (const [cid, ind, talent] of setups) {
      const { g, a } = company(22, cid, ind, { talent, cash: 3_000_000 })
      g.character.money = 2_000_000
      const sliders = allNodes(g, businessView(g, a), 0, 3).filter((n): n is MenuAction => n.type === 'action' && n.input?.kind === 'slider')
      expect(sliders.length).toBeGreaterThan(5)
      const before = JSON.stringify(g)
      const rng = g.rng
      for (const s of sliders) {
        const { min = 0, max = 0, preview } = s.input!
        for (const v of [min, Math.round((min + max) / 2), max]) {
          const text = preview ? preview(g, v) : ''
          expect(typeof text).toBe('string')
          expect(text).not.toMatch(/NaN|undefined|Infinity/)
        }
        checked++
      }
      expect(JSON.stringify(g)).toBe(before)
      expect(g.rng).toBe(rng)
    }
    expect(checked).toBeGreaterThan(15)
  })
})

describe('slider previews are pure: studios and deep tech', () => {
  it('never change a studio or a lab, or consume the RNG', () => {
    const g = createNewLife({ seed: 40, year: 2000, countryId: 'us' })
    g.queue = []
    g.year = 2030
    g.character.age = 35
    g.character.money = 1e8
    const city = getCountry('us').cities[0]
    const s0 = newBiz(g, 'gameStudio', 'us', city, { cash: 5_000_000 })
    s0.employees = 40
    s0.studio = { v: 1, policy: 'normal', seq: 1, hits: 0, flops: 0, crunchYears: 0, declined: 0, report: null, games: [{ id: 'sg1', title: 'Moon Farm', genre: 'platformer', platform: 'pc', scope: 'small', engine: 'cobalt', stage: 'dev', progress: 30, quality: 50, team: 12 }] } as unknown as Json
    const studio = createBusinessAsset(g, 'Pixel Co', s0, 0)
    g.assets.push(studio)
    becomeCeo(g, studio, s0)
    const l0 = newBiz(g, 'robotics', 'us', city, { cash: 50_000_000 })
    const t = readTech(undefined)
    Object.assign(t, { level: 60, stage: 2 })
    l0.tech = JSON.parse(JSON.stringify(t)) as Json
    const lab = createBusinessAsset(g, 'Bolt Co', l0, 0)
    g.assets.push(lab)
    const before = JSON.stringify(g)
    const rng = g.rng
    let n = 0
    for (const a of [studio, lab]) {
      const sliders = allNodes(g, businessView(g, a), 0, 3).filter((x): x is MenuAction => x.type === 'action' && x.input?.kind === 'slider')
      expect(sliders.length, a.name).toBeGreaterThan(2)
      for (const sl of sliders) {
        const { min = 0, max = 0, preview } = sl.input!
        for (const v of [min, max]) expect(preview ? preview(g, v) : '').not.toMatch(/NaN|undefined|Infinity/)
        n++
      }
    }
    expect(allNodes(g, businessView(g, studio), 0, 3).some((x) => x.id === `studio.team.sg1.${studio.id}` || x.id.startsWith(`studio.team.sg1`))).toBe(true)
    expect(JSON.stringify(g)).toBe(before)
    expect(g.rng).toBe(rng)
    expect(n).toBeGreaterThan(6)
  })
})

describe('old saves', () => {
  it('load and play: products and outlets in the old shape, no R&D or capacity fields', () => {
    const { g, a } = company(23, 'us', 'brewery')
    // What a v1.5 save stored: the old product and outlet shapes, nothing new.
    const old = JSON.parse(JSON.stringify(a.details)) as Record<string, Json>
    delete old.rd
    delete old.lines
    old.products = [
      { name: 'Hazy IPA', launched: g.year - 3, boost: 0.12 },
      { name: 'Hard Seltzer', launched: g.year - 31, boost: 0.08 },
    ]
    old.outlets = [{ countryId: 'us', city: old.city as string, count: 2, opened: 2020 }]
    a.details = old
    const view = readBiz(g, a)
    expect(view.rd).toBeUndefined()
    expect(view.lines).toBeUndefined()
    expect(productsBoost(g, view, g.year)).toBeGreaterThan(0)
    // Old lines get a quality from their old boost (a typical boost is an average line).
    expect(productPull(view.industry, view.products, g.year, fieldOf([], 1, 'us', g.year)).lines.every((l) => l.quality >= 25 && l.quality <= 90)).toBe(true)
    expect(allNodes(g, businessView(g, a)).length).toBeGreaterThan(20)
    // Start a project on the old save, then play three years.
    const first = action(g, a, 'biz.launch.')
    first.run(g, String(rdRange(view, first.label).normal))
    g.queue = []
    expect(readBiz(g, a).rd?.length).toBe(1)
    for (let y = 0; y < 3; y++) {
      g.year += 1
      yearlyBusinessImpl(g)
      g.queue = []
      const cur = findBusiness(g, a.id)
      if (!cur) break
      const b = readBiz(g, cur)
      expect(finite(b)).toBe(true)
      expect(Number.isFinite(cur.value)).toBe(true)
      // The 31-year-old line retired; nothing is left in development after the first year-end.
      expect(b.products.some((p) => p.name === 'Hard Seltzer')).toBe(false)
    }
    const b = readBiz(g, a)
    expect(b.rd ?? []).toHaveLength(0)
    // A malformed stored project or line count normalizes safely.
    const odd = normalizeBiz({ ...old, rd: [{ name: 'X', years: 99, odds: 7, budget: -5 }, 'junk', null] as unknown as Json, lines: -3 }, g.year)
    expect(odd.rd).toEqual([{ id: 'rd.X', name: 'X', budget: 0, years: 4, progress: 0, odds: 0.98, boost: 0.05, started: 0 }])
    expect(odd.lines).toBeUndefined()
  })
})

describe('deep tech: R&D without a ceiling', () => {
  function lab(industry: string, patch: Record<string, unknown> = {}, sites = 1): { g: GameState; a: Asset; b: BizState } {
    const g = createNewLife({ seed: 30, year: 2000, countryId: 'us' })
    g.queue = []
    g.year = 2030
    g.character.age = 35
    g.character.money = 1e9
    const b0 = newBiz(g, industry as Industry, 'us', getCountry('us').cities[0], { cash: 5e9 })
    b0.outlets = [{ countryId: 'us', city: getCountry('us').cities[0], count: sites, opened: 2025 }]
    const t = readTech(undefined)
    Object.assign(t, { level: 80, venture: 0 }, patch)
    b0.tech = JSON.parse(JSON.stringify(t)) as Json
    const a = createBusinessAsset(g, 'Lab Co', b0, 0)
    g.assets.push(a)
    becomeCeo(g, a, b0)
    return { g, a, b: bizOf(g, a) }
  }

  it('grows the number of parallel programs with lab space, up to what a lab can hold', () => {
    const t = readTech(undefined)
    const at = (sites: number) => maxPrograms({ outlets: [{ countryId: 'us', city: 'X', count: sites, opened: 0 }], public: false }, t)
    expect(at(1)).toBe(2)
    expect(at(4)).toBeGreaterThan(at(1))
    expect(at(64)).toBeGreaterThan(at(4))
    expect(at(100_000)).toBe(8)
  })

  it('keeps next-generation work open forever at the top of the ladder: dearer and smaller each time', () => {
    for (const ind of ['semiconductor', 'aiLab', 'robotics', 'spaceTech', 'electricVehicles', 'quantum', 'cybersecurity'] as const) {
      const def = programDef(ind, 'nextgen')!
      expect(def, ind).toBeDefined()
      const low = readTech(undefined)
      expect(def.gate(low, 'us'), ind).toMatch(/top of the ladder/)
      const top = { ...readTech(undefined), stage: maxStage(ind) }
      expect(def.gate(top, 'us'), ind).toBeNull()
      // Twenty generations in: still available, far dearer, gains far smaller.
      const veteran = { ...top, done: Array.from({ length: 20 }, () => 'nextgen') }
      expect(def.gate(veteran, 'us')).toBeNull()
      expect(def.cost(veteran)).toBeGreaterThan(def.cost(top) * 100)
      const gain = (t: typeof top) => {
        const x = JSON.parse(JSON.stringify(t)) as typeof top
        x.done.push('nextgen')
        x.premium = 0
        def.win({ t: x, countryId: 'us', year: 2030, roll: () => 0.5, company: 'Lab' })
        return x.premium
      }
      expect(gain(veteran)).toBeLessThan(gain(top) / 4)
    }
  })

  it('lets factories and clusters keep coming, at rising cost', () => {
    const fab = programDef('semiconductor', 'fab')!
    const t = { ...readTech(undefined), stage: 3, plant: 6 }
    expect(fab.gate(t, 'us')).toBeNull()
    expect(fab.cost(t)).toBeGreaterThan(fab.cost({ ...t, plant: 0 }))
    const cluster = programDef('aiLab', 'cluster')!
    expect(cluster.gate({ ...readTech(undefined), models: [{ gen: 1, name: 'A 1', score: 50, open: false, year: 2030 }], plant: 9 }, 'us')).toBeNull()
    const train = programDef('aiLab', 'train')!
    const many = { ...readTech(undefined), plant: 4, models: Array.from({ length: 10 }, (_, i) => ({ gen: i + 3, name: `Nova ${i + 3}`, score: 60, open: false, year: 2030 })) }
    expect(train.gate(many, 'us')).toBeNull()
    expect(train.label(many)).toBe('Train Nova 13')
  })

  it('funds a program at a bigger budget: faster and likelier, dearer in total', () => {
    const { b } = lab('robotics')
    const t = techView(b)
    const def = PROGRAMS.robotics[0]
    const plan = programTerms(b, t, def, 1)
    const rush = programTerms(b, t, def, 3)
    const lean = programTerms(b, t, def, 0.5)
    expect(rush.years).toBeLessThan(plan.years)
    expect(rush.odds).toBeGreaterThan(plan.odds)
    expect(rush.cost * rush.years).toBeGreaterThan(plan.cost * plan.years)
    expect(lean.cost * lean.years).toBeLessThan(plan.cost * plan.years)
    expect(lean.odds).toBeLessThan(plan.odds)
  })

  it('quotes the years and money a rushed program really takes (review: "1.1 yrs" took two years)', () => {
    const { g, a, b } = lab('robotics', { stage: 2, venture: 1e9 })
    // A two-year program funded at 300%: the plan says 1.1 years, but progress moves a whole
    // year at every year-end, so it takes two steady years and two years of bills.
    const def = PROGRAMS.robotics.find((p) => p.years === 2 && !p.gate(techView(b), 'us') && !p.capex)!
    expect(def).toBeDefined()
    const row = action(g, a, `dt.rd.${def.id}.`)
    expect(row.input?.kind).toBe('slider')
    const caption = row.input!.preview!(g, 300)
    expect(caption).toMatch(/ for 2 years at a steady pace/)
    const terms = programTerms(b, techView(b), def, 3)
    expect(caption).toContain(`(${money(terms.cost * 2)} in all)`)
    row.run(g, '300')
    g.queue = []
    const t = techOf(b)
    const p = t.programs.find((x) => x.id === def.id)!
    expect(p).toBeDefined()
    expect(programLine(p)).toMatch(/2 yrs left at a steady pace/)
    let years = 0
    let spend = 0
    while (t.programs.some((x) => x.id === def.id) && years < 5) {
      const r = advancePrograms(g, a, b, t, g.year + years)
      spend += r.spend
      years++
      if (t.programs.some((x) => x.id === def.id)) expect(programLine(t.programs.find((x) => x.id === def.id)!)).toMatch(/1 yr left/)
    }
    expect(years).toBe(2)
    expect(spend).toBe(terms.cost * 2)
  })

  it('books next-generation work as products, not patents (no valuation pump)', () => {
    const { g, a, b } = lab('cybersecurity', { stage: 3, hype: 100, level: 100 })
    const def = programDef('cybersecurity', 'nextgen')!
    let wins = 0
    for (let i = 0; i < 12; i++) {
      const t = techOf(b)
      t.programs = []
      t.ipBook = 0
      const p = startProgram(g, b, t, def, 3)!
      expect(p).not.toBeNull()
      const r = advancePrograms(g, a, b, t, g.year)
      expect(r.spend).toBeGreaterThan(0)
      if (r.wins > 0) {
        wins++
        // A crash budget doesn't count, and only 30% of the plan becomes patents.
        expect(t.ipBook).toBeLessThanOrEqual(programCost(b, t, def) * def.years * 0.3 + 1)
        expect(t.ipBook).toBeLessThan(r.spend)
      }
    }
    expect(wins).toBeGreaterThan(0)
  })
})

describe('game studios: more games at once', () => {
  it('lets a big studio run more teams than a small one', () => {
    expect(maxPipeline({ employees: 3 })).toBe(4)
    expect(maxPipeline({ employees: 120 })).toBe(10)
    expect(maxPipeline({ employees: 600 })).toBeGreaterThan(40)
  })
})
