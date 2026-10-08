import { describe, expect, it } from 'vitest'
import { makeTestGame } from './helpers'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { bizOf, normalizeBiz } from '../src/game/business/state'
import { becomeCeo } from '../src/game/business/career'
import { businessEffects, expansionOf, productDemand, protectedIn } from '../src/game/business/dynamics'
import { fileInventionPatent, inventionYear, inventorMenu, researchQuote, startInvention, studyMarket } from '../src/game/business/expansion'
import { INVENTION_TIERS, nationalPatentLaw, type InventionTier } from '../src/game/business/inventions'
import { nextRandom } from '../src/game/rng'
import type { MenuNode } from '../src/game/types'

function lab(seed = 45, year = 2026) {
  const g = makeTestGame(seed, { age: 35, money: 1e9, countryId: 'us', talents: ['Inventor'] })
  g.year = year
  const a = createBusinessAsset(g, 'Invention Co', newBiz(g, 'solar', 'us', 'Chicago', { cash: 1e8, founded: year - 5 }), 1e6)
  g.assets.push(a)
  const b = bizOf(g, a)
  becomeCeo(g, a, b)
  g.queue = []
  studyMarket(g, a.id, 'us')
  return { g, a, b }
}

function seedFor(odds: number, succeeds: boolean): number {
  for (let seed = 0; seed < 10000; seed++) if ((nextRandom(seed)[0] < odds) === succeeds) return seed
  throw new Error('No suitable deterministic seed')
}

describe('random Inventor Lab', () => {
  it.each([
    ['small', 0, 1], ['middle', 1, .95], ['big', 3, .85], ['generational', 5, .7],
  ] as const)('%s uses exactly %s years and %s success, unlocking on completion', (kind, years, odds) => {
    const { g, a, b } = lab()
    expect(researchQuote(g, b, kind)).toMatchObject({ years, odds })
    const before = b.cash
    const budget = researchQuote(g, b, kind).budget
    expect(startInvention(g, a.id, kind)).toBe(true)
    expect(b.cash).toBe(before - budget)
    if (years > 0) {
      expect(expansionOf(b).research).toMatchObject({ years, odds })
      g.year += years - 1
      inventionYear(g, a, b)
      expect(expansionOf(b).patents).toHaveLength(0)
      expect(startInvention(g, a.id, 'small')).toBe(false)
      g.year++
      g.rng = seedFor(odds, true)
      inventionYear(g, a, b)
    }
    const x = expansionOf(b), p = x.patents[0]
    expect(x.research).toBeNull()
    expect(x.patents).toHaveLength(1)
    expect(p).toMatchObject({ kind, launched: 2026 + years, ownerId: a.id })
    expect(p.demand).toBeGreaterThanOrEqual(INVENTION_TIERS[kind].demand[0])
    expect(p.demand).toBeLessThan(INVENTION_TIERS[kind].demand[1])
    expect(protectedIn(p, 'us', g.year)).toBe(true)
    expect(businessEffects(g, b, 'us', g.year).demand).toBeGreaterThan(1)
    expect(b.cash).toBe(before - budget)
    expect(g.counters.inventions).toBe(1)
    inventionYear(g, a, b)
    expect(expansionOf(b).patents).toHaveLength(1)
    expect(g.counters.inventions).toBe(1)
  })

  it.each(['middle', 'big', 'generational'] as const)('%s can fail at its configured probability and never grants technology on failure', kind => {
    const { g, a, b } = lab()
    startInvention(g, a.id, kind)
    const research = expansionOf(b).research!, paid = b.cash
    g.year += research.years
    g.rng = seedFor(research.odds, false)
    inventionYear(g, a, b)
    expect(expansionOf(b).research).toBeNull()
    expect(expansionOf(b).patents).toHaveLength(0)
    expect(b.cash).toBe(paid)
    expect(g.queue.some(m => m.kind === 'notice' && m.title === 'Research Failed')).toBe(true)
  })

  it('rolls different individual inventions with their own demand, but identical seeds reproduce them', () => {
    const results = [lab(), lab()].map(({ g, a, b }) => {
      for (let i = 0; i < 12; i++) expect(startInvention(g, a.id, 'small')).toBe(true)
      return expansionOf(b).patents
    })
    expect(results[0]).toEqual(results[1])
    expect(new Set(results[0].map(p => p.name)).size).toBe(12)
    expect(new Set(results[0].map(p => p.demand)).size).toBeGreaterThan(1)
    expect(results[0].some(p => p.name.includes('generation 2'))).toBe(true)
  })

  it('gives each larger tier more demand, and demand changes locally and annually', () => {
    let previous = 0
    for (const kind of Object.keys(INVENTION_TIERS) as InventionTier[]) {
      const { g, a, b } = lab()
      startInvention(g, a.id, kind)
      if (kind !== 'small') {
        g.year += INVENTION_TIERS[kind].years
        g.rng = seedFor(INVENTION_TIERS[kind].odds, true)
        inventionYear(g, a, b)
      }
      const p = expansionOf(b).patents[0], demand = productDemand(p, 'us', g.year)
      expect(demand).toBeGreaterThan(previous)
      expect(productDemand(p, 'us', g.year + 1)).not.toBe(demand)
      expect(productDemand(p, 'jp', g.year)).toBeLessThan(demand)
      previous = demand
    }
  })

  it('keeps patent rights per company and country, charges filing once, and survives saves', () => {
    const { g, a, b } = lab()
    startInvention(g, a.id, 'small')
    const p = expansionOf(b).patents[0]
    const foreignBefore = productDemand(p, 'jp', g.year), cash = b.cash, costs = b.yearCosts
    const sister = createBusinessAsset(g, 'Sister Co', newBiz(g, 'solar', 'us', 'Chicago', { cash: 1e8 }), 1e6)
    g.assets.push(sister)
    expect(businessEffects(g, bizOf(g, sister), 'us', g.year).demand).toBe(1)
    expect(fileInventionPatent(g, sister.id, p.id!, 'jp')).toBe(false)
    expect(fileInventionPatent(g, a.id, p.id!, 'jp')).toBe(true)
    expect(fileInventionPatent(g, a.id, p.id!, 'jp')).toBe(false)
    expect(fileInventionPatent(g, a.id, p.id!, 'nonexistent')).toBe(false)
    expect(b.cash).toBe(cash - nationalPatentLaw('jp', g.year).filingCost)
    expect(b.yearCosts).toBe(costs + nationalPatentLaw('jp', g.year).filingCost)
    const restored = expansionOf(normalizeBiz(JSON.parse(JSON.stringify(b)), g.year)).patents[0]
    expect(restored.ownerId).toBe(a.id)
    expect(protectedIn(restored, 'jp', g.year)).toBe(true)
    expect(protectedIn(restored, 'gb', g.year)).toBe(false)
    expect(productDemand(restored, 'jp', g.year)).toBeGreaterThan(foreignBefore)
    const exclusive = productDemand(restored, 'jp', g.year)
    expect(protectedIn(restored, 'jp', restored.expires)).toBe(false)
    expect(productDemand(restored, 'jp', restored.expires)).toBeGreaterThan(0)
    expect(productDemand(restored, 'jp', restored.expires)).toBeLessThan(exclusive)
  })

  it('uses national historical terms, respects foreign filing deadlines, and never restarts a term', () => {
    const { g, a, b } = lab(45, 1980)
    startInvention(g, a.id, 'small')
    const p = expansionOf(b).patents[0]
    expect(p.expires).toBe(1997)
    g.year = 1981
    expect(fileInventionPatent(g, a.id, p.id!, 'jp')).toBe(true)
    expect(expansionOf(b).patents[0].protections!.find(t => t.country === 'jp')!.expires).toBe(2000)
    g.year = 1982
    const cash = b.cash
    expect(fileInventionPatent(g, a.id, p.id!, 'gb')).toBe(false)
    expect(b.cash).toBe(cash)
  })

  it('rejects invalid or unaffordable projects before consuming money or random numbers', () => {
    const { g, a, b } = lab()
    b.cash = 0
    const rng = g.rng
    expect(startInvention(g, a.id, 'small')).toBe(false)
    expect(startInvention(g, a.id, 'bogus' as InventionTier)).toBe(false)
    expect(g.rng).toBe(rng)
    expect(expansionOf(b).patents).toHaveLength(0)
  })

  it('shows all four tiers and country filings without rerolling or mutating the life', () => {
    const { g, a } = lab()
    startInvention(g, a.id, 'small')
    const before = JSON.stringify(g)
    const visit = (nodes: MenuNode[]) => {
      for (const node of nodes) {
        if ('subtitle' in node && typeof node.subtitle === 'function') node.subtitle(g)
        if ('disabledReason' in node) node.disabledReason?.(g)
        if (node.type === 'menu') visit(node.children(g))
      }
    }
    const nodes = inventorMenu(a).children(g)
    for (const kind of Object.keys(INVENTION_TIERS)) expect(nodes.some(n => n.id === `inventor.start.${a.id}.${kind}`)).toBe(true)
    visit(nodes)
    expect(JSON.stringify(g)).toBe(before)
  })
})
