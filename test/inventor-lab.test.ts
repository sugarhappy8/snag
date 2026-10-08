import { describe, expect, it } from 'vitest'
import { makeTestGame } from './helpers'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { bizOf, normalizeBiz } from '../src/game/business/state'
import { becomeCeo } from '../src/game/business/career'
import { businessEffects, expansionOf, productDemand, protectedIn } from '../src/game/business/dynamics'
import { allNationsPatentQuote, fileInventionPatent, fileInventionPatentAllNations, inventionYear, inventorMenu, researchQuote, startInvention, studyMarket } from '../src/game/business/expansion'
import { INVENTION_TIERS, nationalPatentLaw, type InventionTier } from '../src/game/business/inventions'
import { nextRandom } from '../src/game/rng'
import type { MenuAction, MenuNode } from '../src/game/types'
import { COUNTRIES } from '../src/game/world'

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

describe('all-nations patent filing', () => {
  it('files every remaining nation once, preserves existing rights, and pays the exact summed fees from company cash', () => {
    const { g, a, b } = lab()
    startInvention(g, a.id, 'small')
    const id = expansionOf(b).patents[0].id!
    expect(fileInventionPatent(g, a.id, id, 'jp')).toBe(true)
    const prior = expansionOf(b).patents[0].protections!, cash = b.cash, costs = b.yearCosts, personal = g.character.money, rng = g.rng
    const remaining = COUNTRIES.filter(c => !['us', 'jp'].includes(c.id))
    const total = remaining.reduce((sum, c) => sum + nationalPatentLaw(c.id, g.year).filingCost, 0)
    const quote = allNationsPatentQuote(g, a, id)
    expect(quote.countries).toEqual(remaining)
    expect(quote.cost).toBe(total)
    expect(quote.block).toBeNull()
    g.queue = []
    expect(fileInventionPatentAllNations(g, a.id, id)).toBe(true)
    const p = expansionOf(b).patents[0]
    expect(p.protections).toHaveLength(COUNTRIES.length)
    expect(new Set(p.protections!.map(t => t.country)).size).toBe(COUNTRIES.length)
    expect(p.protections!.filter(t => ['us', 'jp'].includes(t.country))).toEqual(prior)
    for (const c of COUNTRIES) expect(protectedIn(p, c.id, g.year), c.id).toBe(true)
    expect(b.cash).toBe(cash - total)
    expect(b.yearCosts).toBe(costs + total)
    expect(g.character.money).toBe(personal)
    expect(g.rng).toBe(rng)
    expect(g.queue).toHaveLength(1)
    const after = JSON.stringify(g)
    expect(fileInventionPatentAllNations(g, a.id, id)).toBe(false)
    expect(fileInventionPatent(g, a.id, id, 'gb')).toBe(false)
    expect(allNationsPatentQuote(g, a, id).block).toBe('Already filed in all nations.')
    expect(JSON.stringify(g)).toBe(after)
    const restored = expansionOf(normalizeBiz(JSON.parse(JSON.stringify(b)), g.year)).patents[0]
    expect(restored).toEqual(p)
    for (const c of COUNTRIES) expect(protectedIn(restored, c.id, g.year), c.id).toBe(true)
  })

  it('rejects an unaffordable batch without spending or partial filings; individual filing still works', () => {
    const { g, a, b } = lab()
    startInvention(g, a.id, 'small')
    const id = expansionOf(b).patents[0].id!, total = allNationsPatentQuote(g, a, id).cost
    b.cash = total - 1
    expect(b.cash).toBeGreaterThan(nationalPatentLaw('jp', g.year).filingCost)
    const before = JSON.stringify(g)
    expect(allNationsPatentQuote(g, a, id).block).toContain('Not enough company cash')
    expect(fileInventionPatentAllNations(g, a.id, id)).toBe(false)
    expect(JSON.stringify(g)).toBe(before)
    expect(fileInventionPatent(g, a.id, id, 'jp')).toBe(true)
    expect(expansionOf(b).patents[0].protections).toHaveLength(2)
  })

  it('accepts the exact total without an extra home-country fee', () => {
    const { g, a, b } = lab()
    startInvention(g, a.id, 'small')
    const id = expansionOf(b).patents[0].id!
    b.cash = allNationsPatentQuote(g, a, id).cost
    expect(fileInventionPatentAllNations(g, a.id, id)).toBe(true)
    expect(b.cash).toBe(0)
    expect(expansionOf(b).patents[0].protections).toHaveLength(COUNTRIES.length)
  })

  it('uses each historical national term from the invention date, not the later bulk-filing date', () => {
    const { g, a, b } = lab(45, 1980)
    b.countryId = 'jp'
    studyMarket(g, a.id, 'jp')
    startInvention(g, a.id, 'small')
    const id = expansionOf(b).patents[0].id!, home = expansionOf(b).patents[0].protections![0]
    g.year++
    expect(fileInventionPatentAllNations(g, a.id, id)).toBe(true)
    const p = expansionOf(b).patents[0]
    expect(p.protections!.find(t => t.country === 'jp')).toEqual(home)
    expect(p.protections!.find(t => t.country === 'us')).toEqual({ country: 'us', filed: 1981, expires: 1997 })
    expect(p.protections!.find(t => t.country === 'gb')).toEqual({ country: 'gb', filed: 1981, expires: 2000 })
    for (const t of p.protections!) expect(t.expires).toBe(p.launched + nationalPatentLaw(t.country, p.launched).term)
  })

  it.each([-1, 2])('cannot bypass the filing window at launch year %+d', offset => {
    const { g, a, b } = lab()
    startInvention(g, a.id, 'small')
    const id = expansionOf(b).patents[0].id!
    g.year += offset
    const before = JSON.stringify(g)
    expect(allNationsPatentQuote(g, a, id).block).toContain('filing window')
    expect(fileInventionPatentAllNations(g, a.id, id)).toBe(false)
    expect(JSON.stringify(g)).toBe(before)
  })

  it('rejects another company, missing inventions, and lost management authority', () => {
    const { g, a, b } = lab()
    startInvention(g, a.id, 'small')
    const id = expansionOf(b).patents[0].id!
    const sister = createBusinessAsset(g, 'Sister', newBiz(g, 'solar', 'us', 'Chicago', { cash: 1e8 }), 1e6)
    g.assets.push(sister)
    let before = JSON.stringify(g)
    expect(fileInventionPatentAllNations(g, sister.id, id)).toBe(false)
    expect(fileInventionPatentAllNations(g, a.id, 'missing-invention')).toBe(false)
    expect(fileInventionPatentAllNations(g, 'missing-company', id)).toBe(false)
    expect(JSON.stringify(g)).toBe(before)
    g.character.age = 13
    before = JSON.stringify(g)
    expect(fileInventionPatentAllNations(g, a.id, id)).toBe(false)
    expect(JSON.stringify(g)).toBe(before)
  })

  it('offers a pure menu action with a fresh quote after individual filings, and safely disables stale actions', () => {
    const { g, a, b } = lab()
    startInvention(g, a.id, 'small')
    const id = expansionOf(b).patents[0].id!
    const findAction = (): MenuAction => {
      const invention = inventorMenu(a).children(g).find(n => n.type === 'menu' && n.id === `inventor.patent.${a.id}.0`)!
      if (invention.type !== 'menu') throw new Error('Missing invention menu')
      const action = invention.children(g).find(n => n.id === `inventor.file.all.${id}`)!
      if (action.type !== 'action') throw new Error('Missing bulk action')
      return action
    }
    const action = findAction(), before = JSON.stringify(g)
    expect(action.label).toBe('Patent in All Nations')
    expect(action.disabledReason?.(g)).toBeNull()
    expect(typeof action.subtitle === 'function' ? action.subtitle(g) : action.subtitle).toContain(`${COUNTRIES.length - 1} new national filings`)
    expect(action.confirm?.(g)).toContain('Already-filed countries are skipped')
    findAction()
    expect(JSON.stringify(g)).toBe(before)
    const oldCost = allNationsPatentQuote(g, a, id).cost
    fileInventionPatent(g, a.id, id, 'jp')
    const quote = allNationsPatentQuote(g, a, id), cash = b.cash
    expect(quote.cost).toBe(oldCost - nationalPatentLaw('jp', g.year).filingCost)
    expect(typeof action.subtitle === 'function' ? action.subtitle(g) : action.subtitle).toContain(`${COUNTRIES.length - 2} new national filings`)
    action.run(g)
    expect(b.cash).toBe(cash - quote.cost)
    expect(action.disabledReason?.(g)).toBe('Already filed in all nations.')
    const after = JSON.stringify(g)
    action.run(g)
    expect(JSON.stringify(g)).toBe(after)
    g.assets = []
    expect(action.disabledReason?.(g)).toBe('You no longer own this business.')
  })

  it('quotes the live company rather than a stale menu asset after a save/load round trip', () => {
    const { g, a, b } = lab()
    startInvention(g, a.id, 'small')
    const id = expansionOf(b).patents[0].id!, original = allNationsPatentQuote(g, a, id)
    const restored = JSON.parse(JSON.stringify(g))
    expect(fileInventionPatent(restored, a.id, id, 'jp')).toBe(true)
    const quote = allNationsPatentQuote(restored, a, id)
    expect(quote.countries).toHaveLength(original.countries.length - 1)
    expect(quote.cost).toBe(original.cost - nationalPatentLaw('jp', restored.year).filingCost)
    const live = bizOf(restored, restored.assets.find((candidate: { id: string }) => candidate.id === a.id)!)
    live.cash = quote.cost - 1
    expect(allNationsPatentQuote(restored, a, id).block).toContain('Not enough company cash')
    const before = JSON.stringify(restored)
    expect(fileInventionPatentAllNations(restored, a.id, id)).toBe(false)
    expect(JSON.stringify(restored)).toBe(before)
  })
})
