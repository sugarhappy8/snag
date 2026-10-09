import { describe, expect, it } from 'vitest'
import { makeTestGame } from './helpers'
import { createPerson } from '../src/game/people'
import { becomeCeo, installManager, managerCandidate } from '../src/game/business/career'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { formGroup, groupBiz, movableCash } from '../src/game/business/conglomerate-actions'
import { diluteGroupEquity, groupById, groupsOf, liveGroup, saveGroup, syncMembers } from '../src/game/business/conglomerate-state'
import { allocateGroupCapital, delegationMenu, managementEffectiveness, retainDivisionCeo } from '../src/game/business/conglomerate-management'
import { appointGroupRelative, cleanGroupJobs, familyRoleEdge, groupFamilyMenu, groupRolePay, prepareGroupFamily, removeGroupRelative } from '../src/game/business/conglomerate-family'
import { GROUP_ROLES, readGroupJob } from '../src/game/business/conglomerate-job'
import { prepareGroupManagement, yearlyGroups } from '../src/game/business/conglomerate-year'
import { executiveRetentionYear } from '../src/game/business/executive'
import { boardView } from '../src/game/business/board-state'
import { reserveDollars } from '../src/game/business/board-vote'
import { hireBlock } from '../src/game/business/nepo-state'
import { holdsFamilyJob } from '../src/game/business/nepo-job'
import { bizOf, readBiz } from '../src/game/business/state'
import type { MenuAction, MenuNode } from '../src/game/types'

function world(skill = 100, size = 4) {
  const g = makeTestGame(937, { age: 50, money: 1e9 })
  g.year = 2026
  const assets = Array.from({ length: size }, (_, i) => {
    const b = newBiz(g, 'solar', 'us', 'Chicago', { cash: 20e6, founded: 2018, outlets: [{ countryId: 'us', city: 'Chicago', count: 10, opened: 2018 }] })
    b.valuation = 40e6
    const a = createBusinessAsset(g, `Division ${i}`, b, 1e6)
    g.assets.push(a)
    installManager(g, bizOf(g, a), managerCandidate(g, b, 20))
    return a
  })
  expect(formGroup(g, assets.map(a => a.id), 'Autonomous Group')).toBe(true)
  const id = groupsOf(g)[0].core.id, grp = liveGroup(g, id)!
  grp.core.ceo = 'manager'
  grp.core.manager = managerCandidate(g, groupBiz(g, grp), skill)
  grp.core.manager.equity = .1
  grp.core.autoEquity = false
  saveGroup(g, grp)
  g.queue = []
  return { g, id, assets }
}
function relative(g: ReturnType<typeof makeTestGame>, age = 30) {
  return createPerson(g, { relation: 'child', age, relationship: 80, stats: { smarts: 95 }, traits: ['ambitious', 'serious', 'honest'], countryId: 'us', occupation: 'Unemployed' })
}
function walk(g: ReturnType<typeof makeTestGame>, nodes: MenuNode[]): void {
  for (const node of nodes) {
    if (node.type === 'info' || node.type === 'heading') continue
    node.visible?.(g); node.disabledReason?.(g); node.hint?.(g)
    if (typeof node.subtitle === 'function') node.subtitle(g)
    if (node.type === 'menu') walk(g, node.children(g))
  }
}

describe('autonomous conglomerate management', () => {
  it('toggles delegation policies from live state even when the same menu action is replayed', () => {
    const { g, id } = world()
    const nodes = delegationMenu(id).children(g)
    const autonomy = nodes.find((n): n is MenuAction => n.type === 'action' && n.id === `group.delegate.toggle.${id}`)!
    const equity = nodes.find((n): n is MenuAction => n.type === 'action' && n.id === `group.delegate.equity.${id}`)!

    autonomy.run(g)
    expect(groupById(g, id)!.core.autonomous).toBe(false)
    autonomy.run(g)
    expect(groupById(g, id)!.core.autonomous).toBe(true)
    equity.run(g)
    expect(groupById(g, id)!.core.autoEquity).toBe(true)
    equity.run(g)
    expect(groupById(g, id)!.core.autoEquity).toBe(false)
  })

  it('reviews and recruits for all four divisions, not only the weakest one, at the leader’s level or higher', () => {
    const { g, id, assets } = world()
    becomeCeo(g, assets[0], bizOf(g, assets[0]))
    const personal = g.character.money
    prepareGroupManagement(g)
    const grp = groupById(g, id)!
    expect(grp.members.every(x => x.b.ceo === 'manager' && x.b.manager!.skill >= 100)).toBe(true)
    expect(g.character.job).toBeNull()
    expect(g.character.money).toBe(personal)
    expect(grp.core.memo.filter(l => l.startsWith('Hired '))).toHaveLength(4)
    const cash = grp.members.reduce((s, x) => s + x.b.cash, 0), rng = g.rng
    prepareGroupManagement(g)
    expect(groupById(g, id)!.members.reduce((s, x) => s + x.b.cash, 0)).toBe(cash)
    expect(g.rng).toBe(rng)
  })

  it('automatically retains every star before their equity resignation deadline without awarding the leader anything', () => {
    const { g, id } = world()
    let grp = liveGroup(g, id)!
    grp.core.autoEquity = true
    for (const x of grp.members) {
      x.b.manager = { ...managerCandidate(g, x.b, 100), since: g.year - 6, equityAsked: g.year - 2 }
    }
    saveGroup(g, grp)
    const originalLeaderEquity = grp.core.manager!.equity
    prepareGroupManagement(g)
    grp = liveGroup(g, id)!
    for (const x of grp.members) {
      expect(x.b.manager!.groupEquity!.credit).toBeCloseTo(.1)
      expect(x.b.manager!.equityAsked).toBeUndefined()
      expect(x.m.own).toBe(1)
      const name = x.b.manager!.firstName
      executiveRetentionYear(g, x.a, x.b)
      expect(x.b.manager!.firstName).toBe(name)
    }
    expect(grp.core.share).toBeCloseTo(.9)
    expect(grp.members.every(x => x.m.own === 1)).toBe(true)
    expect(grp.members.reduce((s, x) => s + x.b.manager!.groupEquity!.share, 0)).toBeCloseTo(.1)
    expect(grp.core.manager!.equity).toBe(originalLeaderEquity)
    expect(grp.core.memo.filter(l => l.startsWith('Retained '))).toHaveLength(4)
    const after = JSON.parse(JSON.stringify(g))
    expect(groupById(after, id)!.members.every(x => x.b.manager!.groupEquity!.credit === .1)).toBe(true)
  })

  it('can disable automatic equity, and never grants away control of a subsidiary or group', () => {
    const { g, id } = world()
    const grp = liveGroup(g, id)!, x = grp.members[0]
    x.b.manager!.skill = 100
    expect(retainDivisionCeo(g, grp, x)).toBeNull()
    expect(x.b.manager!.equity).toBeUndefined()
    grp.core.autoEquity = true; x.m.own = .55; syncMembers(grp)
    expect(retainDivisionCeo(g, grp, x)).toContain('require your decision')
    expect(x.m.own).toBe(.55)
    grp.core.share = .4; x.m.own = 1; syncMembers(grp)
    expect(retainDivisionCeo(g, grp, x)).toContain('constraints')
    expect(x.m.own).toBe(1)
  })

  it('dilutes group retention awards on issuance, not on an owner share transfer, and clears bought-out grants', () => {
    const { g, id } = world(), grp = liveGroup(g, id)!, x = grp.members[0]
    grp.core.autoEquity = true; x.b.manager!.skill = 100
    retainDivisionCeo(g, grp, x)
    const award = x.b.manager!.groupEquity!, original = award.share
    diluteGroupEquity(grp, .75)
    expect(award.share).toBeCloseTo(original * .75)
    expect(award.credit).toBeCloseTo(.075)
    expect(x.m.own).toBe(1)
    diluteGroupEquity(grp, 0)
    expect(x.b.manager!.groupEquity).toBeUndefined()
  })

  it('moves real cash to underfunded operations while preserving total cash and donor reserves', () => {
    const { g, id } = world()
    const grp = liveGroup(g, id)!, receiver = grp.members[0]
    receiver.b.cash = 0
    const total = grp.members.reduce((s, x) => s + x.b.cash, 0), personal = g.character.money
    const lines = allocateGroupCapital(g, grp)
    expect(receiver.b.cash).toBeGreaterThan(0)
    expect(lines.some(l => l.startsWith('Moved '))).toBe(true)
    expect(grp.members.reduce((s, x) => s + x.b.cash, 0)).toBe(total)
    expect(g.character.money).toBe(personal)
    for (const x of grp.members.slice(1)) expect(x.b.cash).toBeGreaterThanOrEqual(reserveDollars(x.b, boardView(g, x.a, x.b)))
    expect(grp.members.every(x => x.b.yearIncome === 0)).toBe(true)
  })

  it('scales capital effectiveness continuously up to 100%, without promising profits', () => {
    const { g, id } = world(), grp = liveGroup(g, id)!
    grp.core.manager!.skill = 40
    const low = managementEffectiveness(g, grp)
    grp.core.manager!.skill = 95
    expect(managementEffectiveness(g, grp)).toBeGreaterThan(low)
    grp.core.manager!.skill = 100
    expect(managementEffectiveness(g, grp)).toBe(1)
  })

  it('does not transfer cash to or out of divisions with their own minority investors', () => {
    const { g, id } = world(), grp = liveGroup(g, id)!, outside = grp.members[0]
    outside.m.own = .8; outside.b.cash = 0; syncMembers(grp)
    expect(movableCash(g, outside)).toBe(0)
    allocateGroupCapital(g, grp)
    expect(outside.b.cash).toBe(0)
  })

  it('honors paused delegation and charges group salaries/synergies only once per fiscal year', () => {
    const { g, id } = world(), grp = liveGroup(g, id)!
    grp.core.autonomous = false; saveGroup(g, grp)
    prepareGroupManagement(g)
    expect(groupById(g, id)!.members.every(x => x.b.manager!.skill === 20)).toBe(true)
    yearlyGroups(g)
    const after = JSON.stringify(g)
    yearlyGroups(g)
    expect(JSON.stringify(g)).toBe(after)
  })
})

describe('family head-office positions', () => {
  it('offers five roles, pays actual taxed salaries, trains relatives and prevents duplicate jobs', () => {
    const { g, id } = world(), p = relative(g), second = relative(g), teen = relative(g, 16)
    expect(Object.keys(GROUP_ROLES)).toHaveLength(5)
    expect(appointGroupRelative(g, id, teen.id, 'finance')).toBe(false)
    expect(appointGroupRelative(g, id, p.id, 'finance')).toBe(true)
    expect(appointGroupRelative(g, id, second.id, 'finance')).toBe(false)
    expect(holdsFamilyJob(p)).toBe(true)
    expect(hireBlock(g, readBiz(g, g.assets[0]), p)).toContain('head office')
    let grp = liveGroup(g, id)!, before = grp.members.reduce((s, x) => s + x.b.cash, 0), personal = g.character.money, skill = readGroupJob(p)!.skill
    const pay = groupRolePay(g, grp, p, 'finance')
    prepareGroupFamily(g, grp)
    expect(grp.members.reduce((s, x) => s + x.b.cash, 0)).toBe(before - pay)
    expect(p.money).toBeGreaterThan(0)
    expect(p.money).toBeLessThanOrEqual(pay)
    expect(readGroupJob(p)!.skill).toBeGreaterThan(skill)
    expect(g.character.money).toBe(personal)
    const money = p.money
    prepareGroupFamily(g, grp)
    expect(p.money).toBe(money)
    expect(familyRoleEdge(g, id, 'finance')).not.toBe(0)
    saveGroup(g, grp)
    const restored = JSON.parse(JSON.stringify(g))
    expect(readGroupJob(restored.people.find((x: { id: string }) => x.id === p.id)!)).toEqual(readGroupJob(p))
    expect(removeGroupRelative(g, id, p.id)).toBe(true)
    expect(readGroupJob(p)).toBeNull()
    grp = liveGroup(g, id)!
    expect(appointGroupRelative(g, id, second.id, 'finance')).toBe(true)
  })

  it('can appoint a family Group CEO, preserves their identity through saves, and does not duplicate salary credits', () => {
    const { g, id } = world(), p = relative(g, 45)
    expect(appointGroupRelative(g, id, p.id, 'ceo')).toBe(true)
    expect(groupById(g, id)!.core.manager!.personId).toBe(p.id)
    const before = p.money
    prepareGroupManagement(g)
    expect(p.money).toBe(before)
    yearlyGroups(g)
    expect(p.money).toBeGreaterThan(before)
    const paid = p.money
    yearlyGroups(g)
    expect(p.money).toBe(paid)
    const restored = JSON.parse(JSON.stringify(g))
    expect(groupById(restored, id)!.core.manager!.personId).toBe(p.id)
  })

  it('cannot create payroll cash in an insolvent group, and unpaid relatives eventually resign', () => {
    const { g, id } = world(), p = relative(g)
    appointGroupRelative(g, id, p.id, 'operations')
    const grp = liveGroup(g, id)!
    for (const x of grp.members) x.b.cash = 0
    const personal = p.money
    prepareGroupFamily(g, grp)
    expect(p.money).toBe(personal)
    expect(grp.members.every(x => x.b.cash === 0)).toBe(true)
    g.year++
    prepareGroupFamily(g, grp)
    expect(readGroupJob(p)).toBeNull()
  })

  it('clears jobs for departed/dead relatives and dissolved groups', () => {
    const { g, id } = world(), p = relative(g)
    appointGroupRelative(g, id, p.id, 'strategy')
    p.alive = false
    prepareGroupFamily(g, liveGroup(g, id)!)
    expect(readGroupJob(p)).toBeNull()
    p.alive = true
    appointGroupRelative(g, id, p.id, 'talent')
    g.assets = []
    cleanGroupJobs(g)
    expect(readGroupJob(p)).toBeNull()
    expect(p.occupation).toBe('Unemployed')
  })

  it('keeps all delegation and family menus pure across repeated reads', () => {
    const { g, id } = world(), p = relative(g)
    appointGroupRelative(g, id, p.id, 'strategy')
    const before = JSON.stringify(g)
    for (let i = 0; i < 2; i++) walk(g, [delegationMenu(id), groupFamilyMenu(id)])
    expect(JSON.stringify(g)).toBe(before)
  })
})
