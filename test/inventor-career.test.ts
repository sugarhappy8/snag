import { describe, expect, it } from 'vitest'
import { makeTestGame } from './helpers'
import { finishInventorProject, inventorNextYear, prepareInventor } from './inventor-helpers'
import { assignPersonalInvention, personalInventorMenu, personalResearchBlock, personalResearchQuote, researchExperiment, startPersonalResearch, studyInventionTopic, yearlyInventor } from '../src/game/inventor'
import { inventorView, personalInventions, readInventionIp, saveInventor } from '../src/game/inventor-state'
import { applyInventorGrant, inventorGrantQuote, recordInventorAdoption, resolveInventorEvent, tinkerInvention, yearlyInventorCareer } from '../src/game/inventor-career'
import { researchReadiness, researchSupportQuote, setResearchPace, shelvePersonalResearch, supportPersonalResearch } from '../src/game/inventor-research'
import { economicRoll } from '../src/game/economy'
import { ownerKey } from '../src/game/special/common'
import { marketBreakthroughs } from '../src/game/invest/shocks'
import { inventionAdoptedUnits, recordInventionAdoption } from '../src/game/invention-adoption'
import { externalInventionLicenseQuote, signExternalInventionLicense, yearlyInventionLicenses } from '../src/game/business/invention-licensing'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { becomeCeo } from '../src/game/business/career'
import { bizOf } from '../src/game/business/state'
import { buildInventionFab, commitInventionProducts, inventionMarketDemand, inventionProductsOf, simulateInventionProducts } from '../src/game/business/invention-products'
import type { GameState, Json, MenuNode } from '../src/game/types'

function game() { return makeTestGame(77, { age: 25, money: 1e10, talents: ['Inventor'] }) }
function start(g: GameState, topic = 'heat-recovery') { prepareInventor(g, topic); expect(startPersonalResearch(g, topic, undefined, 'practical')).toBe(true) }
function walk(g: GameState, nodes: MenuNode[]) {
  for (const node of nodes) {
    if ('subtitle' in node && typeof node.subtitle === 'function') node.subtitle(g)
    if ('header' in node) node.header?.(g)
    if ('disabledReason' in node) node.disabledReason?.(g)
    if ('confirm' in node) node.confirm?.(g)
    if (node.type === 'menu') walk(g, node.children(g))
  }
}

describe('inventor preparation and research funding', () => {
  it('supports free childhood practice, with field-specific knowledge and annual limits', () => {
    const g = game(); g.character.age = 8; g.character.money = 0
    expect(tinkerInvention(g, 'materials')).toBe(true)
    expect(tinkerInvention(g, 'materials')).toBe(true)
    expect(tinkerInvention(g, 'energy')).toBe(false)
    expect(inventorView(g).expertise).toEqual({ materials: 8 })
    expect(g.character.money).toBe(0)
    expect(g.flags.taxableIncome).toBeUndefined()
    expect(startPersonalResearch(g, 'quick-fastener')).toBe(false)
    expect(tinkerInvention(g, 'bad' as 'energy')).toBe(false)
  })

  it('requires deeper preparation and available infrastructure for ambitious projects', () => {
    const g = game()
    studyInventionTopic(g, 'cold-fusion', true)
    expect(personalResearchBlock(g, 'cold-fusion')).toMatch(/8 points/)
    const p = inventorView(g); p.studies[0].points = 10; saveInventor(g, p)
    expect(personalResearchBlock(g, 'cold-fusion')).toMatch(/expertise to 60/)
    g.year = 1900
    expect(personalResearchBlock(g, 'adaptive-chip')).toMatch(/infrastructure/)
    expect(studyInventionTopic(g, 'adaptive-chip', true)).toBe(false)
  })

  it('lets relevant education accelerate learning while keeping a self-taught path', () => {
    const trained = game(), selfTaught = game()
    trained.character.education.degrees.push({ kind: 'bachelor', name: 'Mechanical Engineering', major: 'Mechanical Engineering', school: 'University', age: 22 })
    studyInventionTopic(trained, 'heat-recovery'); studyInventionTopic(selfTaught, 'heat-recovery')
    expect(inventorView(trained).expertise.energy).toBe(5)
    expect(inventorView(selfTaught).expertise.energy).toBe(3)
    start(selfTaught); finishInventorProject(selfTaught)
    expect(personalInventions(selfTaught)).toHaveLength(1)
  })

  it('awards restricted grants without creating cash or allowing repeated applications', () => {
    const g = game(); prepareInventor(g); tinkerInvention(g, 'energy'); tinkerInvention(g, 'energy')
    const p = inventorView(g); p.expertise.energy = 50; saveInventor(g, p)
    const q = inventorGrantQuote(g, 'heat-recovery')!
    for (let i = 0; i < 100; i++) { g.lifeId = `grant-${i}`; if (economicRoll(`${g.lifeId}|${ownerKey(g)}|inventor-grant|${g.year}|heat-recovery`) < q.odds) break }
    const cash = g.character.money
    expect(applyInventorGrant(g, 'heat-recovery')).toBe(true)
    expect(inventorView(g).grant?.amount).toBe(q.amount)
    expect(g.character.money).toBe(cash)
    expect(g.flags.taxableIncome).toBeUndefined()
    const after = JSON.stringify(g)
    expect(applyInventorGrant(g, 'heat-recovery')).toBe(false)
    expect(JSON.stringify(g)).toBe(after)
    const funded = personalResearchQuote(g, 'heat-recovery')!
    expect(funded.personalCost + funded.grant).toBe(funded.budget)
    expect(startPersonalResearch(g, 'heat-recovery')).toBe(true)
    expect(g.character.money).toBe(cash - funded.personalCost)
    expect(inventorView(g).grant).toBeNull()
    expect(shelvePersonalResearch(g)).toBe(true)
    expect(g.character.money).toBe(cash - funded.personalCost)
  })

  it('expires unused grant support and never applies it to a different topic', () => {
    const g = game(); prepareInventor(g)
    const p = inventorView(g); p.grant = { topic: 'heat-recovery', amount: 999999, expires: g.year }; saveInventor(g, p)
    expect(personalResearchQuote(g, 'solar-film')!.grant).toBe(0)
    inventorNextYear(g)
    expect(inventorView(g).grant).toBeNull()
    expect(personalResearchQuote(g, 'heat-recovery')!.grant).toBe(0)
  })
})

describe('prototype development and setbacks', () => {
  it('plays through a working invention with an independent review and credited collaborator', () => {
    const g = game(); start(g)
    expect(personalInventions(g)).toHaveLength(0)
    const before = JSON.stringify(g); walk(g, [personalInventorMenu]); expect(JSON.stringify(g)).toBe(before)
    const fee = researchSupportQuote(g, 'collaborator').cost, cash = g.character.money
    expect(supportPersonalResearch(g, 'collaborator')).toBe(true)
    expect(g.character.money).toBe(cash - fee)
    expect(supportPersonalResearch(g, 'collaborator')).toBe(false)
    finishInventorProject(g)
    const a = personalInventions(g)[0], ip = readInventionIp(a)!
    expect(ip).toMatchObject({ evidenceBased: true, contributors: 'Independent energy engineering specialist' })
    expect(ip.inventor).toBe(`${g.character.firstName} ${g.character.lastName}`)
    expect(inventorView(g).work[0]).toMatchObject({ id: a.id, units: 0, royalties: 0 })
    expect(g.flags.taxableIncome ?? 0).toBe(0)
    expect(marketBreakthroughs(g)).toHaveLength(0)
    expect(personalResearchBlock(g, 'heat-recovery')).toMatch(/already developed/)
    expect(applyInventorGrant(g, 'heat-recovery')).toBe(false)
  })

  it('stops at the evidence gate instead of inventing automatically or charging more money', () => {
    const g = game(); start(g)
    const p = inventorView(g); p.project!.progress = p.project!.years; p.project!.engineering = 100; p.project!.validation = 0; saveInventor(g, p)
    const cash = g.character.money
    inventorNextYear(g)
    expect(personalInventions(g)).toHaveLength(0)
    expect(inventorView(g).project?.validation).toBe(0)
    expect(researchReadiness(g, inventorView(g).project!).reason).toMatch(/customer trial/)
    expect(g.character.money).toBe(cash)
    expect(researchExperiment(g, 'customers')).toBe(true)
    expect(researchExperiment(g, 'engineering')).toBe(false)
    finishInventorProject(g)
    expect(personalInventions(g)).toHaveLength(1)
  })

  it('failed replication preserves knowledge and needs an explicitly funded revision', () => {
    const g = game(); start(g)
    const p = inventorView(g); p.project!.progress = p.project!.years; p.project!.engineering = 100; p.project!.validation = 100; saveInventor(g, p)
    const chance = researchReadiness(g, p.project!, p).odds
    for (let i = 0; i < 1000; i++) { g.lifeId = `failure-${i}`; if (economicRoll(`${g.lifeId}|research-review|${p.project!.id}|1`) >= chance) break }
    const cash = g.character.money, expertise = p.expertise.energy!
    inventorNextYear(g)
    expect(inventorView(g).project?.revision).toBe(true)
    expect(inventorView(g).expertise.energy).toBeGreaterThan(expertise)
    expect(inventorView(g).setbacks).toBe(1)
    expect(g.character.money).toBe(cash)
    const held = inventorView(g).project?.progress
    inventorNextYear(g)
    expect(inventorView(g).project?.progress).toBe(held)
    g.character.money = 0
    const before = JSON.stringify(g)
    expect(supportPersonalResearch(g, 'revise')).toBe(false)
    expect(JSON.stringify(g)).toBe(before)
    g.character.money = cash
    const fee = researchSupportQuote(g, 'revise').cost
    expect(supportPersonalResearch(g, 'revise')).toBe(true)
    expect(g.character.money).toBe(cash - fee)
    finishInventorProject(g)
    expect(personalInventions(g)).toHaveLength(1)
  })

  it('burnout pauses work; resting recovers strain without losing progress or money', () => {
    const g = game(); start(g)
    expect(setResearchPace(g, 'intensive')).toBe(true)
    const p = inventorView(g); p.strain = 85; saveInventor(g, p)
    const health = g.character.stats.health, cash = g.character.money
    inventorNextYear(g)
    expect(inventorView(g).project?.progress).toBe(0)
    expect(g.character.stats.health).toBe(health - 3)
    const strain = inventorView(g).strain
    expect(setResearchPace(g, 'rest')).toBe(true)
    inventorNextYear(g)
    // Optional mentor invitations are never auto-accepted.
    expect(inventorView(g).strain).toBe(Math.max(0, strain - 25))
    expect(g.character.money).toBe(cash)
    finishInventorProject(g)
    expect(personalInventions(g)).toHaveLength(1)
  })

  it('keeps uncertain research deterministic after save/load and pauses it in prison', () => {
    const g = game(); start(g, 'solar-film')
    const restored = JSON.parse(JSON.stringify(g)) as GameState
    inventorNextYear(g); inventorNextYear(restored)
    expect(restored).toEqual(g)
    const before = JSON.stringify(g); yearlyInventor(g); expect(JSON.stringify(g)).toBe(before)
    g.character.prison = { name: 'Prison', security: 'medium', crime: 'Fraud', sentenceYears: 1, yearsServed: 0, respect: 0, appealed: false, escapeAttempts: 0 }
    const progress = inventorView(g).project?.progress
    inventorNextYear(g)
    expect(inventorView(g).project?.progress).toBe(progress)
    expect(shelvePersonalResearch(g)).toBe(false)
  })

  it('allows a researched speculative breakthrough without automatically pumping global stocks', () => {
    const g = game(); start(g, 'cold-fusion'); finishInventorProject(g)
    expect(readInventionIp(personalInventions(g)[0])!).toMatchObject({ kind: 'generational', evidenceBased: true })
    expect(marketBreakthroughs(g)).toHaveLength(0)
  })
})

describe('the personal and commercial life of an inventor', () => {
  it('only pays consulting after a choice and cannot replay it or give it to an heir', () => {
    const g = game(), p = inventorView(g)
    p.reputation = 30; p.event = { kind: 'consulting', token: `${ownerKey(g)}:offer`, year: g.year, field: 'energy' }; saveInventor(g, p)
    const cash = g.character.money, before = JSON.stringify(g)
    walk(g, [personalInventorMenu]); expect(JSON.stringify(g)).toBe(before)
    expect(resolveInventorEvent(g, 'stale', 'accept')).toBe(false)
    const heir = structuredClone(g); heir.generation++; heir.character.id = 'heir'
    expect(resolveInventorEvent(heir, p.event.token, 'accept')).toBe(false)
    expect(resolveInventorEvent(g, p.event.token, 'accept')).toBe(true)
    expect(g.character.money).toBe(cash + 5500); expect(g.flags.taxableIncome).toBe(5500)
    expect(inventorView(g).strain).toBe(18)
    const settled = JSON.stringify(g)
    expect(resolveInventorEvent(g, p.event.token, 'accept')).toBe(false)
    expect(JSON.stringify(g)).toBe(settled)
  })

  it('makes credit disputes and bad promotion deals consequential without seizing IP', () => {
    const g = game(); start(g); finishInventorProject(g)
    const p = inventorView(g); p.reputation = 30; p.event = { kind: 'credit', token: 'credit', year: g.year, field: 'energy' }; saveInventor(g, p)
    expect(resolveInventorEvent(g, 'credit', 'claim')).toBe(true)
    expect(inventorView(g).reputation).toBe(18)
    const q = inventorView(g); q.event = { kind: 'promoter', token: 'promoter', year: g.year, field: 'energy' }; saveInventor(g, q)
    const money = g.character.money
    expect(resolveInventorEvent(g, 'promoter', 'accept')).toBe(true)
    expect(g.character.money).toBe(money - 2500)
    expect(personalInventions(g)).toHaveLength(1)
  })

  it('builds recognition from company sales after IP assignment without creating personal income', () => {
    const g = game(); start(g); finishInventorProject(g)
    const ip = personalInventions(g)[0], company = createBusinessAsset(g, 'Heat Works', newBiz(g, 'energy', 'us', 'Chicago', { cash: 1e7 }), 1e7)
    g.assets.push(company); const b = bizOf(g, company); becomeCeo(g, company, b)
    expect(assignPersonalInvention(g, ip.id, company.id)).toBe(true)
    expect(inventionProductsOf(b)[0].evidenceBased).toBe(true)
    expect(inventionProductsOf(b)[0].contributors).toBe('Independent energy engineering specialist')
    expect(buildInventionFab(g, company.id, ip.id, 1000)).toBe(true)
    b.employees = 10; b.quality = 100
    const plan = simulateInventionProducts(g, b, g.year), cash = g.character.money
    expect(plan.units).toBeGreaterThan(0)
    commitInventionProducts(g, b, g.year, plan, company.id)
    expect(inventorView(g).work[0].units).toBe(plan.units)
    expect(g.character.money).toBe(cash)
    const settled = JSON.stringify(g); commitInventionProducts(g, b, g.year, plan, company.id); expect(JSON.stringify(g)).toBe(settled)
    recordInventorAdoption(g, ip.id, 10000)
    expect(inventorView(g).work[0].recognition).toBe(2)
    expect(inventorView(g).reputation).toBeGreaterThanOrEqual(20)
    expect(g.character.money).toBe(cash)
  })

  it('tracks personal royalties exactly once and preserves the adoption model through licensing', () => {
    const g = game(); start(g); finishInventorProject(g)
    const a = personalInventions(g)[0], source = { assetId: a.id, inventionId: a.id }
    const quote = externalInventionLicenseQuote(g, source, 'specialist')!
    expect(quote.product.evidenceBased).toBe(true)
    const modern = inventionMarketDemand(g, quote.product, 'us', g.year, quote.protections)
    const legacy = inventionMarketDemand(g, { ...quote.product, evidenceBased: false }, 'us', g.year, quote.protections)
    expect(modern.demand).toBeLessThan(legacy.demand)
    const noSales = structuredClone(g)
    recordInventionAdoption(noSales, a.id, quote.product.potential, g.year - 1)
    expect(inventionMarketDemand(noSales, quote.product, 'us', g.year, quote.protections).demand).toBeGreaterThan(modern.demand)
    expect(signExternalInventionLicense(g, source, 'specialist')).toBe(true)
    const cash = g.character.money
    g.year++; yearlyInventionLicenses(g)
    expect(inventorView(g).work[0].royalties).toBe(quote.royalties)
    expect(inventorView(g).work[0].units).toBe(quote.units)
    expect(inventionAdoptedUnits(g, a.id)).toBe(quote.units)
    expect(inventionAdoptedUnits(g, a.id, g.year - 1)).toBe(0)
    expect(externalInventionLicenseQuote(g, source, 'specialist', g.year - 1)!.units).toBe(quote.units)
    expect(g.character.money).toBe(cash + quote.royalties)
    const settled = JSON.stringify(g); yearlyInventionLicenses(g); expect(JSON.stringify(g)).toBe(settled)
    g.generation++; g.character.id = 'new-owner'
    expect(inventorView(g).work).toHaveLength(0)
    expect(personalInventions(g)).toHaveLength(1)
    expect(inventionAdoptedUnits(g, a.id)).toBe(quote.units)
  })

  it('normalizes corrupt career fields purely and does not repeatedly migrate old study points', () => {
    const g = game()
    g.flags['special.inventor'] = { owner: ownerKey(g), v: 1, studies: [{ topic: 'heat-recovery', points: 3, year: g.year }, { topic: 'heat-recovery', points: 3, year: g.year }], reputation: 1000, strain: -40, expertise: { bogus: 100 }, event: { kind: 'bad' }, project: { topic: 'unknown', kind: 'small', id: 'bad', name: 'bad' } } as Json
    const before = JSON.stringify(g), p = inventorView(g)
    expect(p.expertise.energy).toBe(9); expect(p.studies).toHaveLength(1); expect(p.reputation).toBe(100); expect(p.strain).toBe(0); expect(p.project).toBeNull(); expect(p.event).toBeNull()
    expect(JSON.stringify(g)).toBe(before)
    saveInventor(g, p)
    expect(inventorView(g).expertise.energy).toBe(9)
    yearlyInventorCareer(g)
    const settled = JSON.stringify(g); yearlyInventorCareer(g); expect(JSON.stringify(g)).toBe(settled)
  })
})
