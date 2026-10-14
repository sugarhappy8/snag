// Retired product lines never come back as R&D ideas (Heavy R&D spec 3.8). Three deliberate paths
// remember the name: the single-line retire action, "Retire Weak Lines" and the hired CEO (both
// through retireLines). Natural expiry after PRODUCT_LIFE, a rival's lines and the 400-line storage
// guard do not. Old saves have no list and behave as before.
import { describe, expect, it } from 'vitest'
import { smartManagerTurn } from '../src/game/business/board-ceo'
import { askingSalary, becomeCeo, stepDown } from '../src/game/business/career'
import { evolve, recordYear, simulateYear, valuationOf } from '../src/game/business/economy'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { businessView } from '../src/game/business/manage'
import { classicIdeas, productIdeas, PRODUCT_LIFE } from '../src/game/business/products'
import { advanceRd, rdBlock, rdRange, rememberRetired, retireLines, startRd } from '../src/game/business/rd'
import { bizOf, MAX_STORED_PRODUCTS, normalizeBiz, readBiz, type BizState, type Product } from '../src/game/business/state'
import { applyPlan, autoPlan } from '../src/game/business/yearly'
import type { Industry } from '../src/game/data/markets'
import { createNewLife } from '../src/game/life'
import type { Asset, GameState, Json, MenuAction, MenuNode } from '../src/game/types'
import { getCountry } from '../src/game/world'

/** An adult who has run a company for two years (it has a history and a last statement). */
function company(seed: number, industry: Industry, opts: { cash?: number } = {}): { g: GameState; a: Asset; b: BizState } {
  const countryId = 'us'
  const g = createNewLife({ seed, year: 2000, countryId })
  g.queue = []
  const c = g.character
  c.age = 30
  g.year = 2030
  c.money = 5_000_000
  c.talent = null
  c.talents = undefined
  c.stats.smarts = 65
  c.licenses = ['driver']
  const city = getCountry(countryId).cities[0]
  const b0 = newBiz(g, industry, countryId, city, { cash: opts.cash ?? 2_000_000 })
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
  g.queue = []
  return { g, a, b }
}

function allNodes(g: GameState, nodes: MenuNode[], depth = 0, max = 4): MenuNode[] {
  const out: MenuNode[] = []
  for (const n of nodes) {
    out.push(n)
    if (n.type === 'menu' && depth < max) out.push(...allNodes(g, n.children(g), depth + 1, max))
  }
  return out
}

function findAction(g: GameState, a: Asset, prefix: string): MenuAction | null {
  const n = allNodes(g, businessView(g, a)).find((x) => x.type === 'action' && x.id.startsWith(prefix))
  return n && n.type === 'action' ? n : null
}

function action(g: GameState, a: Asset, prefix: string): MenuAction {
  const n = findAction(g, a, prefix)
  if (!n) throw new Error(`no action ${prefix}`)
  return n
}

function line(g: GameState, name: string, launched = g.year - 1): Product {
  return { name, launched, boost: 0.1, quality: 55 }
}

const WAS_RETIRED = (idea: string) => `${idea} was retired. Develop something else.`

describe('a retired line is gone from R&D for good', () => {
  it('the retire action remembers the name: no longer offered, refused by R&D, nothing charged', () => {
    const { g, a, b } = company(21, 'restaurant')
    const idea = productIdeas(g, b, 1)[0]
    b.products = [line(g, idea)]
    // Retired from the Products menu.
    expect(findAction(g, a, `biz.launch.${idea}.`)).toBeNull()
    action(g, a, `biz.retire.${idea}.`).run(g)
    const after = readBiz(g, a)
    expect(after.products).toHaveLength(0)
    expect(after.retired).toEqual([idea])
    // It is not offered as an idea, and the menu has no row to fund it.
    expect(productIdeas(g, after, 80)).not.toContain(idea)
    expect(findAction(g, a, `biz.launch.${idea}.`)).toBeNull()
    // R&D refuses it with a plain reason and charges nothing.
    const live = bizOf(g, a)
    const budget = rdRange(live, idea).normal
    expect(rdBlock(live, idea, budget)).toBe(WAS_RETIRED(idea))
    const cash = live.cash
    const costs = live.yearCosts
    g.queue = []
    expect(startRd(g, a, live, idea, budget)).toBeNull()
    expect(g.queue).toHaveLength(1)
    expect(g.queue[0]).toMatchObject({ kind: 'notice', title: 'R&D', text: WAS_RETIRED(idea) })
    expect(live.cash).toBe(cash)
    expect(live.yearCosts).toBe(costs)
    expect(live.rd ?? []).toHaveLength(0)
  })

  it('without the retire, the same idea is offered again (the bug this fixes)', () => {
    const { g, b } = company(21, 'restaurant')
    const idea = productIdeas(g, b, 1)[0]
    b.products = [line(g, idea)]
    expect(productIdeas(g, b, 80)).not.toContain(idea)
    b.products = []
    expect(productIdeas(g, b, 80)).toContain(idea)
    expect(rdBlock(b, idea, rdRange(b, idea).normal)).toBeNull()
  })

  it('an on-sale line still reads as on sale first, not as retired', () => {
    const { g, b } = company(22, 'restaurant')
    const idea = productIdeas(g, b, 1)[0]
    b.products = [line(g, idea)]
    b.retired = [idea]
    expect(rdBlock(b, idea, rdRange(b, idea).normal)).toBe(`${idea} is already on sale.`)
  })

  it('Retire Weak Lines records every line it drops', () => {
    const { g, a, b } = company(23, 'cafe')
    b.products = [line(g, 'Old A', g.year - 12), line(g, 'Old B', g.year - 9), line(g, 'New C', g.year)]
    const row = action(g, a, 'biz.retireMany.')
    row.run(g, '2')
    const after = readBiz(g, a)
    expect(after.products.map((p) => p.name)).toEqual(['New C'])
    expect([...(after.retired ?? [])].sort()).toEqual(['Old A', 'Old B'])
  })
})

describe('retireLines (bulk retire, the hired CEO)', () => {
  it('records the names it returns, newest last', () => {
    const { g, b } = company(24, 'bakery')
    b.products = [line(g, 'Old', g.year - 12), line(g, 'New', g.year), line(g, 'Mid', g.year - 5)]
    expect(retireLines(b, 2, g.year)).toEqual(['Old', 'Mid'])
    expect(b.products.map((p) => p.name)).toEqual(['New'])
    expect(b.retired).toEqual(['Old', 'Mid'])
    expect(retireLines(b, 0, g.year)).toEqual([])
    expect(b.retired).toEqual(['Old', 'Mid'])
  })

  it('records the way the hired CEO calls it (one line at a time)', () => {
    const { g, b } = company(25, 'cafe')
    b.products = [line(g, 'Old', g.year - 12), line(g, 'Mid', g.year - 5), line(g, 'New', g.year)]
    retireLines(b, 1, g.year)
    retireLines(b, 1, g.year)
    expect(b.retired).toEqual(['Old', 'Mid'])
    expect(b.products.map((p) => p.name)).toEqual(['New'])
  })

  it('a real hired CEO year records every line it retires and does not redevelop them', () => {
    const { g, a, b } = company(26, 'restaurant', { cash: 3_000_000 })
    b.products = Array.from({ length: 70 }, (_, i) => ({ name: `Old Line ${i}`, launched: g.year - 25, boost: 0.05, quality: 20 }))
    const names = new Set(b.products.map((p) => p.name))
    stepDown(g, a, b, { firstName: 'Pat', lastName: 'Lee', gender: 'female', skill: 92, salary: askingSalary(b, 92), since: g.year, style: 'steady', integrity: 100 })
    g.queue = []
    smartManagerTurn(g, a, b)
    const gone = [...names].filter((n) => !b.products.some((p) => p.name === n))
    expect(gone.length).toBeGreaterThan(0)
    expect([...(b.retired ?? [])].sort()).toEqual(gone.sort())
    // What it started in R&D is never one of the lines it just let go.
    for (const p of b.rd ?? []) expect(gone).not.toContain(p.name)
  })
})

describe('what does not count as a retirement', () => {
  it('a line that expires after PRODUCT_LIFE is not recorded and can be offered again', () => {
    const { g, b } = company(27, 'restaurant')
    const idea = productIdeas(g, b, 1)[0]
    b.products = [line(g, idea, g.year - PRODUCT_LIFE - 1), line(g, 'Keeper', g.year)]
    expect(productIdeas(g, b, 80)).not.toContain(idea)
    const r = simulateYear(g, b, g.year, b.ownerSalary)
    evolve(g, b, r.stmt, g.year)
    expect(b.products.some((p) => p.name === idea)).toBe(false)
    expect(b.retired ?? []).toEqual([])
    expect(productIdeas(g, b, 80)).toContain(idea)
    expect(rdBlock(b, idea, rdRange(b, idea).normal)).toBeNull()
  })

  it('the 400-line storage guard in R&D does not record what it drops', () => {
    const { g, a, b } = company(28, 'restaurant')
    b.products = Array.from({ length: MAX_STORED_PRODUCTS + 5 }, (_, i) => ({ name: `Spare ${i}`, launched: g.year - 10 + (i % 5), boost: 0.05, quality: 30 }))
    // A project that is not finished keeps advanceRd from returning early.
    b.rd = [{ id: 'rd.guard', name: 'Slow Thing', budget: 1_000, years: 3, progress: 0, odds: 0.5, boost: 0, started: g.year }]
    advanceRd(g, b, g.year)
    expect(a.details).toBe(b as unknown as typeof a.details)
    expect(b.products.length).toBeLessThanOrEqual(MAX_STORED_PRODUCTS)
    expect(b.retired ?? []).toEqual([])
  })

  it('a company with no retire list behaves as before', () => {
    const { g, b } = company(29, 'restaurant')
    expect('retired' in b).toBe(false)
    const plain = productIdeas(g, b, 30)
    const withEmpty = productIdeas(g, { ...b, retired: [] }, 30)
    expect(withEmpty).toEqual(plain)
  })

  it('a stale Retire row (the line already gone) records nothing', () => {
    const { g, a, b } = company(30, 'restaurant')
    const idea = productIdeas(g, b, 1)[0]
    b.products = [line(g, idea)]
    const row = action(g, a, `biz.retire.${idea}.`)
    b.products = []
    row.run(g)
    expect(readBiz(g, a).retired ?? []).toEqual([])
  })
})

describe('retiring X does not hide its other editions', () => {
  for (const industry of ['restaurant', 'manufacturing', 'software'] as const) {
    it(`${industry}: Premium, next-generation and bundle names of a retired classic stay on offer`, () => {
      const { g, a, b } = company(31, industry)
      const x = classicIdeas(g, b)[0]
      b.products = [line(g, x)]
      action(g, a, `biz.retire.${x}.`).run(g)
      const after = readBiz(g, a)
      expect(after.retired).toEqual([x])
      const ideas = productIdeas(g, after, 120)
      expect(ideas).not.toContain(x)
      const others = ideas.filter((n) => n !== x && n.includes(x))
      expect(others.length).toBeGreaterThanOrEqual(3)
      // The retired list holds exactly the name that was retired, nothing derived from it.
      expect(after.retired).not.toContain(others[0])
      expect(rdBlock(after, others[0], rdRange(after, others[0]).normal)).toBeNull()
    })
  }
})

describe('the saved list', () => {
  const base = { industry: 'restaurant', countryId: 'us', city: 'Chicago' }
  const load = (retired: Json | undefined): string[] | undefined => normalizeBiz({ ...base, ...(retired === undefined ? {} : { retired }) } as Record<string, Json>, 2030).retired

  it('survives the load unchanged, in order', () => {
    expect(load(['Burger', 'Soup of the Day'])).toEqual(['Burger', 'Soup of the Day'])
  })

  it('a save without the field loads as absent, and an empty list is absent too', () => {
    const biz = normalizeBiz({ ...base } as Record<string, Json>, 2030)
    expect('retired' in biz).toBe(false)
    expect(load([])).toBeUndefined()
  })

  it('hostile values load as absent or as a clean list', () => {
    expect(load(7)).toBeUndefined()
    expect(load('x')).toBeUndefined()
    expect(load(null)).toBeUndefined()
    expect(load({ a: 1 })).toBeUndefined()
    expect(load([1, 'a', 'a', '', '   ', null, ['b'], { n: 1 }, true] as Json)).toEqual(['a'])
    expect(load(['  padded  ', 'padded'])).toEqual(['padded'])
    expect(load(['x'.repeat(300), 'y'.repeat(80), 'z'.repeat(81)])).toEqual(['y'.repeat(80)])
  })

  it('1000 entries load capped to the newest 400, and a repeated name keeps its newest spot', () => {
    const many = Array.from({ length: 1000 }, (_, i) => `Line ${i}`)
    const kept = load(many)!
    expect(kept).toHaveLength(MAX_STORED_PRODUCTS)
    expect(kept[0]).toBe('Line 600')
    expect(kept[kept.length - 1]).toBe('Line 999')
    expect(load(['A', 'B', 'A'])).toEqual(['B', 'A'])
  })

  it('round-trips through JSON', () => {
    const once = normalizeBiz({ ...base, retired: ['Burger', 'Fries'] } as Record<string, Json>, 2030)
    const twice = normalizeBiz(JSON.parse(JSON.stringify(once)) as Record<string, Json>, 2030)
    expect(twice.retired).toEqual(['Burger', 'Fries'])
  })

  it('a live company with a hostile in-memory list repairs it and never throws', () => {
    const { g, b } = company(32, 'restaurant')
    const idea = productIdeas(g, b, 1)[0]
    ;(b as unknown as { retired: unknown }).retired = 7
    expect(() => productIdeas(g, b, 5)).not.toThrow()
    expect(() => rdBlock(b, idea, rdRange(b, idea).normal)).not.toThrow()
    rememberRetired(b, ['A'])
    expect(b.retired).toEqual(['A'])
    ;(b as unknown as { retired: unknown }).retired = 'text'
    expect(productIdeas(g, b, 5).length).toBe(5)
  })
})

describe('rememberRetired', () => {
  it('creates the list on first use, appends, de-duplicates and caps at 400 newest', () => {
    const { b } = company(33, 'restaurant')
    expect(b.retired).toBeUndefined()
    rememberRetired(b, [])
    expect(b.retired).toBeUndefined()
    rememberRetired(b, ['A', 'B'])
    rememberRetired(b, ['A', 'C'])
    expect(b.retired).toEqual(['B', 'A', 'C'])
    rememberRetired(b, Array.from({ length: 500 }, (_, i) => `Line ${i}`))
    expect(b.retired).toHaveLength(MAX_STORED_PRODUCTS)
    expect(b.retired![MAX_STORED_PRODUCTS - 1]).toBe('Line 499')
    expect(b.retired).not.toContain('A')
  })

  it('keeps only names a saved list would keep (same rules as the load)', () => {
    const { b } = company(34, 'restaurant')
    rememberRetired(b, ['', '  ', 'x'.repeat(81), ' Good '])
    expect(b.retired).toEqual(['Good'])
  })
})

describe('no random numbers', () => {
  it('retiring, remembering and reading the ideas never touch g.rng', () => {
    const { g, a, b } = company(35, 'restaurant')
    const idea = productIdeas(g, b, 1)[0]
    b.products = [line(g, idea), line(g, 'Old A', g.year - 12), line(g, 'Old B', g.year - 9)]
    const rng = g.rng
    action(g, a, `biz.retire.${idea}.`).run(g)
    expect(g.rng).toBe(rng)
    action(g, a, 'biz.retireMany.').run(g, '2')
    expect(g.rng).toBe(rng)
    const live = bizOf(g, a)
    rememberRetired(live, ['Z'])
    productIdeas(g, live, 30)
    rdBlock(live, idea, rdRange(live, idea).normal)
    expect(g.rng).toBe(rng)
    expect(live.retired).toContain(idea)
  })
})
