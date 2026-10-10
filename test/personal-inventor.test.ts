import { describe, expect, it } from 'vitest'
import { makeTestGame } from './helpers'
import { assignPersonalInvention, filePersonalInventionPatent, inventionAssetNodes, personalInventorMenu, personalResearchBlock, personalResearchQuote, startPersonalResearch, studyInventionTopic, yearlyInventor } from '../src/game/inventor'
import { inventorView, personalInventions, readInventionIp } from '../src/game/inventor-state'
import { INVENTION_TOPICS } from '../src/game/inventor-data'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { becomeCeo } from '../src/game/business/career'
import { bizOf, findBusiness, normalizeBiz } from '../src/game/business/state'
import { businessEffects, expansionOf, saveExpansion } from '../src/game/business/dynamics'
import { inventionYear } from '../src/game/business/expansion'
import { buildInventionFab, commitInventionProducts, inventionProductsOf, simulateInventionProducts, setInventionProduction } from '../src/game/business/invention-products'
import { COUNTRIES } from '../src/game/world'
import { corporateTax } from '../src/game/data/markets'
import { localEcon, yearFixed } from '../src/game/business/economy'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import { createPerson } from '../src/game/people'
import { continueAsChild } from '../src/game/life'
import { designateSuccessor, hireRelative } from '../src/game/business/nepo-actions'
import type { GameState, MenuNode } from '../src/game/types'

function game(year = 2026) {
  const g = makeTestGame(23, { age: 35, money: 1e9, talents: ['Inventor'] })
  g.year = year
  return g
}
function next(g: GameState) { g.year++; g.character.age++; g.yearActions = {}; yearlyInventor(g) }
function study(g: GameState, topic = 'heat-recovery') { expect(studyInventionTopic(g, topic)).toBe(true); expect(studyInventionTopic(g, topic)).toBe(true) }
function company(g: GameState, industry = 'energy') {
  const a = createBusinessAsset(g, 'Product Company', newBiz(g, industry as 'energy', 'us', 'Chicago', { cash: 100_000 }), 100_000)
  g.assets.push(a)
  const b = bizOf(g, a)
  becomeCeo(g, a, b)
  return { a, b }
}
function walk(g: GameState, nodes: MenuNode[], depth = 0) {
  if (depth > 6) return
  for (const node of nodes) {
    if ('subtitle' in node && typeof node.subtitle === 'function') node.subtitle(g)
    if ('disabledReason' in node) node.disabledReason?.(g)
    if ('header' in node) node.header?.(g)
    if ('confirm' in node) node.confirm?.(g)
    if (node.type === 'menu') walk(g, node.children(g), depth + 1)
  }
}

describe('personal specific-topic research', () => {
  it('offers a broad, concrete catalogue, pure menus and custom invention names', () => {
    const g = game()
    expect(INVENTION_TOPICS.length).toBeGreaterThanOrEqual(28)
    const before = JSON.stringify(g)
    walk(g, [personalInventorMenu])
    expect(JSON.stringify(g)).toBe(before)
    expect(startPersonalResearch(g, 'heat-recovery')).toBe(false)
    study(g)
    expect(startPersonalResearch(g, 'heat-recovery', 'My Pocket Heat Harvester')).toBe(true)
    const a = personalInventions(g)[0]
    expect(a.name).toBe('My Pocket Heat Harvester')
    expect(a.kind).toBe('invention')
    expect(readInventionIp(a)).toMatchObject({ topic: 'heat-recovery', field: 'energy', kind: 'small' })
    expect(g.counters.inventions).toBe(1)
    const saved = JSON.stringify(g)
    walk(g, [personalInventorMenu]); walk(g, inventionAssetNodes(g, a.id))
    expect(JSON.stringify(g)).toBe(saved)
  })

  it.each([['heat-recovery', 0], ['solar-film', 1], ['solid-battery', 3], ['cold-fusion', 5]] as const)('%s completes after exactly %s active years with no success gambling', (topic, years) => {
    const g = game(), original = g.character.money
    study(g, topic)
    const budget = personalResearchQuote(g, topic)!.budget
    expect(startPersonalResearch(g, topic)).toBe(true)
    expect(g.character.money).toBe(original - 20 - budget)
    for (let i = 0; i < years; i++) {
      expect(personalInventions(g)).toHaveLength(0)
      next(g)
    }
    expect(personalInventions(g)).toHaveLength(1)
    expect(inventorView(g).project).toBeNull()
    const before = JSON.stringify(g)
    yearlyInventor(g)
    expect(JSON.stringify(g)).toBe(before)
    expect(g.character.money).toBe(original - 20 - budget)
    expect(g.flags.taxableIncome ?? 0).toBe(0)
  })

  it('requires talent, topic-specific recent study and personal money; online study opens in 1995', () => {
    const g = game(1994)
    expect(studyInventionTopic(g, 'solar-film', true)).toBe(false)
    expect(studyInventionTopic(g, 'unknown')).toBe(false)
    g.year = 1995
    expect(studyInventionTopic(g, 'solar-film', true)).toBe(true)
    expect(inventorView(g).studies[0].points).toBe(2)
    expect(personalResearchBlock(g, 'heat-recovery')).toMatch(/specific topic/)
    g.character.money = 0
    const before = JSON.stringify(g)
    expect(startPersonalResearch(g, 'solar-film')).toBe(false)
    expect(JSON.stringify(g)).toBe(before)
    g.character.money = 1e9; g.character.talents = []
    expect(startPersonalResearch(g, 'solar-film')).toBe(false)
    expect(studyInventionTopic(g, 'solar-film')).toBe(false)
  })

  it('pauses active research in prison, prevents multiple projects, and survives saves', () => {
    const g = game()
    study(g, 'solar-film'); startPersonalResearch(g, 'solar-film')
    const restored = JSON.parse(JSON.stringify(g)) as GameState
    expect(inventorView(restored)).toEqual(inventorView(g))
    restored.character.prison = { name: 'Prison', security: 'medium', crime: 'Fraud', sentenceYears: 2, yearsServed: 0, respect: 0, appealed: false, escapeAttempts: 0 }
    next(restored)
    expect(inventorView(restored).project?.progress).toBe(0)
    expect(personalInventions(restored)).toHaveLength(0)
    restored.character.prison = null
    expect(startPersonalResearch(restored, 'solar-film')).toBe(false)
    next(restored)
    expect(personalInventions(restored)).toHaveLength(1)
  })

  it('files national and all-nations patents once using personal savings and original terms', () => {
    const g = game(1980)
    study(g); startPersonalResearch(g, 'heat-recovery')
    const a = personalInventions(g)[0]
    expect(readInventionIp(a)!.protections[0].expires).toBe(1997)
    expect(filePersonalInventionPatent(g, a.id, 'jp')).toBe(true)
    const before = g.character.money
    expect(filePersonalInventionPatent(g, a.id, 'jp')).toBe(false)
    expect(g.character.money).toBe(before)
    expect(filePersonalInventionPatent(g, a.id, 'all')).toBe(true)
    expect(readInventionIp(a)!.protections).toHaveLength(COUNTRIES.length)
    expect(readInventionIp(a)!.protections.find(p => p.country === 'jp')!.expires).toBe(2000)
    const saved = JSON.stringify(g)
    expect(filePersonalInventionPatent(g, a.id, 'all')).toBe(false)
    expect(JSON.stringify(g)).toBe(saved)
  })
})

describe('owned invention products', () => {
  it('assigns concrete IP to a compatible business without boosting unrelated demand', () => {
    const g = game(); study(g); startPersonalResearch(g, 'heat-recovery')
    const ip = personalInventions(g)[0], { a, b } = company(g), cost = readInventionIp(ip)!.unitCost
    expect(assignPersonalInvention(g, ip.id, a.id)).toBe(true)
    expect(personalInventions(g)).toHaveLength(0)
    expect(inventionProductsOf(b)[0]).toMatchObject({ id: ip.id, rights: 'owned', price: 100, unitCost: cost, inventory: 0, sold: 0 })
    expect(expansionOf(b).patents[0].id).toBe(ip.id)
    expect(businessEffects(g, b, 'us', g.year).demand).toBe(1)
    const restored = normalizeBiz(JSON.parse(JSON.stringify(b)), g.year)
    expect(inventionProductsOf(restored)).toEqual(inventionProductsOf(b))
  })

  it('licenses IP with actual-sales royalties and bounds production by cash and shared staff capacity', () => {
    const g = game(); study(g); startPersonalResearch(g, 'heat-recovery')
    const ip = personalInventions(g)[0], { a, b } = company(g)
    expect(assignPersonalInvention(g, ip.id, a.id, true)).toBe(true)
    expect(personalInventions(g)).toHaveLength(1)
    expect(buildInventionFab(g, a.id, ip.id, 100)).toBe(true)
    const cost = readInventionIp(ip)!.unitCost
    b.cash = cost; b.employees = 10; b.quality = 100
    const before = JSON.stringify(g), plan = simulateInventionProducts(g, b, g.year)
    expect(JSON.stringify(g)).toBe(before)
    expect(plan).toMatchObject({ revenue: 100, cogs: cost, royalties: 5, units: 1 })
    const money = g.character.money
    commitInventionProducts(g, b, g.year, plan, a.id)
    expect(g.character.money).toBe(money + 5)
    expect(b.cash).toBe(cost)
    expect(inventionProductsOf(b)[0].sold).toBe(1)
    commitInventionProducts(g, b, g.year, plan, a.id)
    expect(g.character.money).toBe(money + 5)
    expect(simulateInventionProducts(g, b, g.year).rows).toHaveLength(0)
    expect(simulateInventionProducts(g, b, g.year + 5).rows).toHaveLength(0)
    expect(assignPersonalInvention(g, ip.id, a.id)).toBe(false)
  })

  it('rejects unrelated companies and invalid production settings without consuming assets', () => {
    const g = game(); study(g); startPersonalResearch(g, 'heat-recovery')
    const ip = personalInventions(g)[0], { a } = company(g, 'restaurant')
    const before = JSON.stringify(g)
    expect(assignPersonalInvention(g, ip.id, a.id)).toBe(false)
    expect(assignPersonalInvention(g, ip.id, 'missing')).toBe(false)
    expect(setInventionProduction(g, a.id, 'missing', Number.NaN)).toBe(false)
    expect(JSON.stringify(g)).toBe(before)
  })

  it('preserves paid inventory, production settings and lifetime results on licence renewal', () => {
    const g = game(); study(g); startPersonalResearch(g, 'heat-recovery')
    const ip = personalInventions(g)[0], { a, b } = company(g)
    expect(assignPersonalInvention(g, ip.id, a.id, true)).toBe(true)
    expect(buildInventionFab(g, a.id, ip.id, 100)).toBe(true)
    const plan = simulateInventionProducts(g, b, g.year)
    commitInventionProducts(g, b, g.year, plan, a.id)
    setInventionProduction(g, a.id, ip.id, 42)
    const prior = inventionProductsOf(b)[0]
    g.year += 5
    expect(assignPersonalInvention(g, ip.id, a.id, true)).toBe(true)
    expect(inventionProductsOf(b)[0]).toMatchObject({ sold: prior.sold, revenue: prior.revenue, costs: prior.costs, inventory: prior.inventory, production: 42, expires: g.year + 5 })
  })

  it('honours an inherited company licence when the separate IP is liquidated by the estate', () => {
    const g = game(); g.character.age = 70
    study(g); startPersonalResearch(g, 'heat-recovery')
    const ip = personalInventions(g)[0], { a, b } = company(g)
    b.cash = 10_000_000; b.founded = g.year - 2
    expect(assignPersonalInvention(g, ip.id, a.id, true)).toBe(true)
    expect(buildInventionFab(g, a.id, ip.id, 100)).toBe(true)
    const heir = createPerson(g, { relation: 'child', age: 35, relationship: 90, stats: { smarts: 90 } })
    createPerson(g, { relation: 'child', age: 32, relationship: 70 })
    expect(hireRelative(g, a, b, heir, { rank: 2 }, { quiet: true }).ok).toBe(true)
    expect(designateSuccessor(g, a, bizOf(g, a), heir, { quiet: true }).ok).toBe(true)
    g.character.alive = false; g.character.causeOfDeath = 'Old Age'; g.queue = []
    const inherited = continueAsChild(g, heir.id)
    const companyAsset = findBusiness(inherited, a.id)!
    expect(companyAsset).toBeDefined()
    expect(personalInventions(inherited)).toHaveLength(0)
    inherited.year++; inherited.character.age++; inherited.queue = []
    const companyState = bizOf(inherited, companyAsset), plan = simulateInventionProducts(inherited, companyState, inherited.year - 1)
    expect(plan.units).toBeGreaterThan(0); expect(plan.royalties).toBeGreaterThan(0)
    const personal = inherited.character.money
    yearlyBusinessImpl(inherited)
    expect(inventionProductsOf(companyState)[0].sold).toBe(plan.units)
    expect(inherited.character.money).toBe(personal + companyState.last!.ownerPay)
    expect(simulateInventionProducts(inherited, companyState, g.year + 5).rows).toHaveLength(0)
  })

  it('books actual product sales, wages, consumption and corporate taxes once through the full business year', () => {
    const g = game(); study(g); startPersonalResearch(g, 'heat-recovery')
    const ip = personalInventions(g)[0], { a, b } = company(g)
    b.cash = 10_000_000; b.founded = g.year - 2; b.production = 100_000; b.ownerSalary = 1_000
    expect(assignPersonalInvention(g, ip.id, a.id, true)).toBe(true)
    expect(buildInventionFab(g, a.id, ip.id, 100)).toBe(true)
    g.year++; g.character.age++; g.queue = []
    const fixed = yearFixed(g, b), home = localEcon(b.industry, b.countryId, b.city)
    const plan = simulateInventionProducts(g, b, g.year - 1, home.wage * b.wageLevel * fixed.licence * fixed.finance * fixed.ceoEff)
    expect(plan.wages).toBeGreaterThan(0)
    expect(plan.staffUsed).toBeGreaterThan(0)
    const cash = b.cash, personal = g.character.money
    yearlyBusinessImpl(g)
    const s = b.last!
    expect(inventionProductsOf(b)[0]).toMatchObject({ lastYear: g.year - 1, sold: plan.units, revenue: plan.revenue, costs: plan.cogs + plan.royalties + plan.wages })
    expect(s.salesTax).toBeGreaterThanOrEqual(Math.round(plan.revenue * home.taxRate / (1 + home.taxRate)))
    expect(s.cogs).toBeGreaterThanOrEqual(plan.cogs + plan.royalties)
    expect(s.wages).toBeGreaterThanOrEqual(plan.wages)
    expect(s.other).toBe(0); expect(s.otherIncome).toBe(0)
    // Statement fields are rounded separately from the underlying taxable profit.
    expect(Math.abs(s.corpTax - corporateTax('us', s.pbt))).toBeLessThanOrEqual(1)
    expect(Math.abs(b.cash - (cash + s.net - s.cashErosion))).toBeLessThanOrEqual(2)
    expect(g.character.money).toBe(personal + s.ownerPay + plan.royalties)
    const booked = { cash: b.cash, money: g.character.money, history: JSON.stringify(b.history), products: JSON.stringify(b.inventionProducts) }
    yearlyBusinessImpl(g)
    expect({ cash: b.cash, money: g.character.money, history: JSON.stringify(b.history), products: JSON.stringify(b.inventionProducts) }).toEqual(booked)
  })

  it('converts legacy company IP once without changing existing identifiers or patent rights', () => {
    const g = game(), { a, b } = company(g)
    const x = expansionOf(b)
    x.patents.push({ id: 'legacy-permanent-id', name: 'Legacy Heat Module', kind: 'small', launched: 2020, expires: 2040, ownerId: a.id, demand: .1, protections: [{ country: 'us', filed: 2020, expires: 2040 }] })
    saveExpansion(b, x)
    inventionYear(g, a, b)
    expect(inventionProductsOf(b)[0].id).toBe('legacy-permanent-id')
    expect(expansionOf(b).patents[0]).toMatchObject(x.patents[0])
    const before = JSON.stringify(g)
    inventionYear(g, a, b)
    expect(JSON.stringify(g)).toBe(before)
  })
})
