import { describe, expect, it } from 'vitest'
import { makeTestGame } from './helpers'
import { finishInventorProject, inventorNextYear, prepareInventor } from './inventor-helpers'
import { assignPersonalInvention, filePersonalInventionPatent, inventionAssetNodes, personalInventorMenu, personalResearchBlock, personalResearchQuote, researchExperiment, startPersonalResearch, yearlyInventor } from '../src/game/inventor'
import { inventorView, personalInventions, readInventionIp } from '../src/game/inventor-state'
import { supportPersonalResearch } from '../src/game/inventor-research'
import { applyInventorGrant } from '../src/game/inventor-career'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { managerCandidate } from '../src/game/business/career'
import { bizOf, readBiz, type KeyStaff } from '../src/game/business/state'
import { closedInventionEffects, closedInventions, refreshClosedInvention } from '../src/game/business/closed-inventions'
import { externalInventionLicenseQuote } from '../src/game/business/invention-licensing'
import { inventionProductsOf } from '../src/game/business/invention-products'
import { inventionImpactView } from '../src/game/invention-impact'
import { financeTeamSkill, financeQuantEdge, simulateFinanceYear } from '../src/game/business/finance-firm'
import { financeView, saveFinance } from '../src/game/business/finance-firm-state'
import { appealOf, costFactor, planFor } from '../src/game/business/economy'
import { leadershipPower } from '../src/game/business/leadership'
import type { Industry } from '../src/game/data/markets'
import type { GameState, MenuNode } from '../src/game/types'

function company(industry: Industry = 'investmentFirm') {
  const g = makeTestGame(77, { age: 25, money: 1e9, talents: ['Inventor'] })
  const a = createBusinessAsset(g, 'Research Company', newBiz(g, industry, 'us', 'Chicago', { cash: 1e9 }), 1e9)
  g.assets.push(a)
  const b = bizOf(g, a); b.ceo = 'manager'; b.manager = managerCandidate(g, b, 90)
  return { g, a, b }
}
function leader(focus: KeyStaff['focus'], skill = 95): KeyStaff {
  return { id: focus, firstName: 'Skilled', lastName: 'Leader', gender: 'female', age: 40, role: focus, focus, skill, salary: 80000, trait: 'steady', morale: 90, years: 3 }
}
function walk(g: GameState, nodes: MenuNode[]): void {
  for (const n of nodes) {
    if ('subtitle' in n && typeof n.subtitle === 'function') n.subtitle(g)
    if ('disabledReason' in n) n.disabledReason?.(g)
    if (n.type === 'menu') { n.header?.(g); walk(g, n.children(g)) }
  }
}

describe('company-funded lead inventor', () => {
  it('requires a CEO and spends only company money for research, experiments and collaborators', () => {
    const { g, a, b } = company('energy'); prepareInventor(g)
    b.ceo = 'owner'
    const before = structuredClone(g)
    expect(startPersonalResearch(g, 'heat-recovery', undefined, 'practical', a.id)).toBe(false)
    expect(g).toEqual(before)
    b.ceo = 'manager'
    const personal = g.character.money, cash = b.cash, q = personalResearchQuote(g, 'heat-recovery', 'practical', a.id)!
    expect(startPersonalResearch(g, 'heat-recovery', undefined, 'practical', a.id)).toBe(true)
    expect(b.cash).toBe(cash - q.budget); expect(b.yearCosts).toBe(q.budget)
    expect(supportPersonalResearch(g, 'collaborator')).toBe(true)
    expect(researchExperiment(g, 'engineering')).toBe(true)
    expect(g.character.money).toBe(personal)
    expect(inventorView(g).project).toMatchObject({ sponsorId: a.id, personalCost: 0, companyCost: cash - b.cash })
    expect(b.yearCosts).toBe(cash - b.cash)
    const view = structuredClone(g); walk(g, [personalInventorMenu]); expect(g).toEqual(view)
  })
  it('pauses when the CEO leaves or the sponsor is sold, and resumes with an appointed CEO', () => {
    const { g, a, b } = company('energy'); prepareInventor(g)
    startPersonalResearch(g, 'heat-recovery', undefined, 'practical', a.id)
    b.ceo = 'owner'; const cash = b.cash
    inventorNextYear(g)
    expect(inventorView(g).project?.progress).toBe(0)
    expect(inventorView(g).project?.notes).toMatch(/Hire a CEO/)
    expect(researchExperiment(g, 'engineering')).toBe(false); expect(b.cash).toBe(cash)
    b.ceo = 'manager'
    const restored = JSON.parse(JSON.stringify(g)) as GameState
    finishInventorProject(restored)
    const result = readBiz(restored, restored.assets.find(x => x.id === a.id)!)
    expect(inventionProductsOf(result)[0].inventor).toBe('Test Player')
    expect(personalInventions(restored)).toHaveLength(0)
    expect(restored.character.money).toBe(g.character.money)
    const sold = structuredClone(g); sold.assets = []; inventorNextYear(sold)
    expect(inventorView(sold).project?.progress).toBe(0)
    expect(inventorView(sold).project?.notes).toMatch(/unavailable/)
  })
  it('cannot use customer funds or research through an unrelated/minority company', () => {
    const { g, a, b } = company('bank'); prepareInventor(g, 'private-risk-model')
    b.cash = 0
    expect(financeView(b).deposits).toBeGreaterThan(0)
    const before = structuredClone(g)
    expect(startPersonalResearch(g, 'private-risk-model', undefined, 'balanced', a.id)).toBe(false)
    expect(g).toEqual(before)
    b.cash = 1e8; b.share = .1
    expect(personalResearchBlock(g, 'private-risk-model', 'balanced', a.id)).toMatch(/controlling owner/)
  })
})

describe('closed-loop financial inventions', () => {
  it('completes private IP without a patent, public news, grant or external licence', () => {
    const { g, a, b } = company(); prepareInventor(g, 'private-risk-model')
    expect(applyInventorGrant(g, 'private-risk-model')).toBe(false)
    expect(startPersonalResearch(g, 'private-risk-model', 'Secret Credit', 'practical')).toBe(true)
    finishInventorProject(g)
    const asset = personalInventions(g)[0], ip = readInventionIp(asset)!
    expect(ip.closedLoop).toBe(true); expect(ip.protections).toEqual([])
    expect(inventionImpactView(g)).toEqual([])
    expect(filePersonalInventionPatent(g, asset.id, 'all')).toBe(false)
    expect(externalInventionLicenseQuote(g, { assetId: asset.id, inventionId: asset.id }, 'specialist')).toBeNull()
    expect(inventionAssetNodes(g, asset.id).some(n => /patent|license/.test(n.id))).toBe(false)
    expect(assignPersonalInvention(g, asset.id, a.id, true)).toBe(false)
    expect(assignPersonalInvention(g, asset.id, a.id)).toBe(true)
    expect(personalInventions(g)).toHaveLength(0)
    expect(inventionProductsOf(b)).toEqual([])
    expect(closedInventions(b)[0]).toMatchObject({ name: 'Secret Credit', inventor: 'Test Player', topic: 'private-risk-model' })
    expect(assignPersonalInvention(g, asset.id, a.id)).toBe(false)
    expect(closedInventions(readBiz(JSON.parse(JSON.stringify(g)), JSON.parse(JSON.stringify(a))))).toHaveLength(1)
  })
  it('automatically installs company-funded systems and never pays the player or publishes them', () => {
    const { g, a, b } = company(); prepareInventor(g, 'private-market-model')
    const money = g.character.money, clients = financeView(b).aum
    startPersonalResearch(g, 'private-market-model', undefined, 'practical', a.id)
    finishInventorProject(g)
    expect(closedInventions(b)).toHaveLength(1)
    expect(personalInventions(g)).toHaveLength(0)
    expect(g.character.money).toBe(money)
    expect(financeView(b).aum).toBe(clients)
    expect(inventionImpactView(g)).toHaveLength(0)
    const settled = structuredClone(g); yearlyInventor(g); expect(g).toEqual(settled)
    const noMethod = { ...b, closedInventions: undefined }
    expect(financeQuantEdge(g, b, g.year)).toBeGreaterThan(financeQuantEdge(g, noMethod, g.year))
    const plain = structuredClone(noMethod), secret = structuredClone(b)
    expect(simulateFinanceYear(g, secret, g.year, 0).stmt.revenue).toBeGreaterThan(simulateFinanceYear(g, plain, g.year, 0).stmt.revenue)
  })
  it('ages secret models and charges exactly once for a fresh confidential validation', () => {
    const { g, a, b } = company('bank'); prepareInventor(g, 'private-risk-model')
    startPersonalResearch(g, 'private-risk-model', undefined, 'practical', a.id); finishInventorProject(g)
    const row = closedInventions(b)[0], initial = closedInventionEffects(b, g.year).risk
    g.year += 5
    expect(closedInventionEffects(b, g.year).risk).toBeLessThan(initial)
    const cash = b.cash, personal = g.character.money
    expect(refreshClosedInvention(g, a.id, row.id)).toBe(true)
    expect(b.cash).toBe(cash - 5000); expect(g.character.money).toBe(personal)
    expect(closedInventionEffects(b, g.year).risk).toBeGreaterThanOrEqual(initial)
    const settled = structuredClone(g)
    expect(refreshClosedInvention(g, a.id, row.id)).toBe(false); expect(g).toEqual(settled)
  })
})

describe('leadership affects operations', () => {
  it('makes sales and operations materially affect demand, capacity and cost', () => {
    const { g, b } = company('manufacturing'), base = structuredClone(b)
    b.staff = [leader('sales')]
    expect(appealOf(g, b, g.year)).toBeGreaterThan(appealOf(g, base, g.year) * 1.12)
    b.staff = [leader('ops')]
    expect(planFor(g, b, g.year).capacity).toBeGreaterThan(planFor(g, base, g.year).capacity * 1.15)
    expect(costFactor(b)).toBeLessThan(costFactor(base) * .94)
  })
  it('gives every additional leader a contribution and makes morale and skill matter', () => {
    const { b } = company()
    b.staff = ['a', 'b', 'c'].map(id => ({ ...leader('finance'), id }))
    const before = leadershipPower(b, 'finance')
    b.staff.push({ ...leader('finance'), id: 'd' })
    expect(leadershipPower(b, 'finance')).toBeGreaterThan(before)
    const strong = leadershipPower(b, 'finance')
    b.staff[0].morale = 10
    expect(leadershipPower(b, 'finance')).toBeLessThan(strong)
    const lowMorale = leadershipPower(b, 'finance')
    b.staff[0].skill = 10
    expect(leadershipPower(b, 'finance')).toBeLessThan(lowMorale)
  })
  it('makes specialists matter alongside an elite CEO and keeps client funds separate', () => {
    const { g, b } = company('bank'), baseline = structuredClone(b)
    b.staff = [leader('finance'), leader('quality'), leader('ops'), leader('sales')]
    expect(financeTeamSkill(g, b)).toBeGreaterThan(financeTeamSkill(g, baseline))
    const books = financeView(b); books.controls = 75; saveFinance(b, books)
    const result = simulateFinanceYear(g, b, g.year, 0), f = financeView(b)
    expect(f.reserves + f.loanBook + f.bonds).toBeCloseTo(f.deposits, 2)
    expect(Number.isFinite(result.stmt.net)).toBe(true)
    expect(g.character.money).toBe(1e9)
  })
})
