import { describe, expect, it } from 'vitest'
import { makeTestGame } from './helpers'
import { boardYear, setMandate } from '../src/game/business/board'
import { askingSalary, installManager, managerCandidate } from '../src/game/business/career'
import { smartManagerTurn } from '../src/game/business/board-ceo'
import { formGroup, groupBiz, treasuryOf } from '../src/game/business/conglomerate-actions'
import { groupView } from '../src/game/business/conglomerate-menu'
import { groupById, groupsOf, liveGroup, saveGroup, syncMembers } from '../src/game/business/conglomerate-state'
import { prepareGroupManagement } from '../src/game/business/conglomerate-year'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { buyBackGroupShares, groupBuybackQuote } from '../src/game/business/group-buyback'
import { assignAllServices, serviceContracts } from '../src/game/business/group-services'
import { divisionBuffer, sweepGroupTreasury } from '../src/game/business/group-treasury'
import { foundGroupVenture } from '../src/game/business/group-ventures'
import { executiveRetentionYear } from '../src/game/business/executive'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import type { Statement } from '../src/game/business/state'
import type { Industry } from '../src/game/data/markets'

function world(industries: Industry[] = ['solar', 'logistics'], skill = 95) {
  const g = makeTestGame(123, { age: 45, money: 1e9 })
  for (const [i, industry] of industries.entries()) {
    const b = newBiz(g, industry, 'us', 'Chicago', { cash: 200e6, founded: g.year - 5, valuation: 220e6 })
    installManager(g, b, managerCandidate(g, b, skill))
    b.manager!.since = g.year - 5; b.manager!.equity = .02
    g.assets.push(createBusinessAsset(g, `Division ${i}`, b, 1e6))
  }
  expect(formGroup(g, g.assets.map(a => a.id), 'Atlas')).toBe(true)
  const id = groupsOf(g)[0].core.id, grp = liveGroup(g, id)!
  grp.core.ceo = 'manager'; grp.core.manager = managerCandidate(g, groupBiz(g, grp), skill)
  grp.core.autoEquity = false
  saveGroup(g, grp); g.queue = []
  return { g, id }
}
const cashOf = (grp: NonNullable<ReturnType<typeof groupById>>) => grp.members.reduce((s, x) => s + x.b.cash, 0)

describe('group treasury, ventures and shareholder capital', () => {
  it('sweeps to a named custodian without minting money or touching reserves, minorities or the player', () => {
    const { g, id } = world(['solar', 'logistics', 'software'])
    const grp = liveGroup(g, id)!, minority = grp.members[2]
    minority.m.own = .8; syncMembers(grp)
    const total = cashOf(grp), personal = g.character.money, outsideCash = minority.b.cash
    expect(sweepGroupTreasury(g, grp).length).toBe(1)
    expect(grp.core.treasuryId).toBe(treasuryOf(grp).a.id)
    expect(cashOf(grp)).toBe(total)
    expect(minority.b.cash).toBe(outsideCash)
    for (const x of grp.members) expect(x.b.cash).toBeGreaterThanOrEqual(divisionBuffer(g, x))
    expect(grp.members.every(x => x.b.yearIncome === 0)).toBe(true)
    expect(g.character.money).toBe(personal)
    saveGroup(g, grp)
    expect(groupById(JSON.parse(JSON.stringify(g)), id)!.core.treasuryId).toBe(grp.core.treasuryId)
  })

  it('keeps group cash inside the group even under a cash-mandate division CEO', () => {
    const { g, id } = world(), grp = liveGroup(g, id)!, x = grp.members[0]
    setMandate(g, x.a, x.b, 'cash')
    const personal = g.character.money
    smartManagerTurn(g, x.a, x.b)
    expect(g.character.money).toBe(personal)
  })

  it('creates a real funded business with a same-level CEO, not a player-funded shell', () => {
    const { g, id } = world(), grp = liveGroup(g, id)!
    g.year++
    const before = cashOf(grp), personal = g.character.money, count = g.assets.length
    const lines = foundGroupVenture(g, grp)
    expect(lines[0]).toContain('Founded ')
    expect(g.assets.length).toBe(count + 1)
    const child = grp.members.at(-1)!
    expect(child.b.manager!.skill).toBeGreaterThanOrEqual(grp.core.manager!.skill)
    expect(child.m.own).toBe(1)
    expect(child.b.cash).toBeGreaterThan(0)
    expect(child.b.invested).toBe(0)
    expect(cashOf(grp)).toBeLessThan(before)
    expect(g.character.money).toBe(personal)
    expect(foundGroupVenture(g, grp)).toEqual([])
    saveGroup(g, grp)
    expect(groupById(JSON.parse(JSON.stringify(g)), id)!.members).toHaveLength(count + 1)
  })

  it('obeys paused business creation, cash limits, and early-era technology gates', () => {
    const { g, id } = world(), grp = liveGroup(g, id)!
    g.year++
    grp.core.autoFound = false
    expect(foundGroupVenture(g, grp)).toEqual([])
    grp.core.autoFound = true
    for (const x of grp.members) x.b.cash = 0
    expect(foundGroupVenture(g, grp)).toEqual([])
    g.year = 1900; grp.core.founded = 1898; grp.core.lastFounded = 1898
    for (const x of grp.members) x.b.cash = 200e6
    foundGroupVenture(g, grp)
    expect(grp.members.some(x => x.b.founded === 1900 && ['software', 'onlineBank'].includes(x.b.industry))).toBe(false)
  })

  it('buys back only unvested outside shares from real group cash and preserves award ownership', () => {
    const { g, id } = world(), grp = liveGroup(g, id)!
    grp.core.share = .6; grp.core.manager!.equity = .1; grp.core.executiveEquity = .1
    grp.core.listing = { exchange: 'NYSE', ipoYear: 2020, sharesOut: 1e6, sharePrice: 100 }
    syncMembers(grp); saveGroup(g, grp)
    const before = cashOf(grp), personal = g.character.money
    const q = groupBuybackQuote(g, groupById(g, id)!, 20)
    expect(q.retired).toBeCloseTo(.06)
    expect(buyBackGroupShares(g, id, 20)).toBe(true)
    const after = groupById(g, id)!
    expect(cashOf(after)).toBeCloseTo(before - q.cost, 4)
    expect(after.core.share).toBeCloseTo(.6 / .94)
    expect(after.core.manager!.equity).toBeCloseTo(.1 / .94)
    expect(after.core.listing!.sharesOut).toBe(940000)
    expect(g.character.money).toBe(personal)
    expect(groupById(JSON.parse(JSON.stringify(g)), id)!.core.executiveEquity).toBeCloseTo(.1 / .94)
  })

  it('cannot confiscate former CEO awards or spend reserves for a buyback', () => {
    const { g, id } = world(), grp = liveGroup(g, id)!
    grp.core.share = .9; grp.core.executiveEquity = .1; grp.core.manager = null; grp.core.ceo = 'owner'
    syncMembers(grp); saveGroup(g, grp)
    expect(buyBackGroupShares(g, id, 100)).toBe(false)
    const current = liveGroup(g, id)!
    current.core.share = .6
    for (const x of current.members) x.b.cash = 0
    syncMembers(current); saveGroup(g, current)
    expect(buyBackGroupShares(g, id, 10)).toBe(false)
    expect(buyBackGroupShares(g, id, NaN)).toBe(false)
  })

  it('converts joining executives’ vested shares into protected group awards', () => {
    const g = makeTestGame(123, { age: 45, money: 1e9 })
    for (let i = 0; i < 2; i++) {
      const b = newBiz(g, 'solar', 'us', 'Chicago', { cash: 200e6, valuation: 220e6, share: .8, executiveEquity: .1 })
      installManager(g, b, { ...managerCandidate(g, b, 95), equity: .1 })
      g.assets.push(createBusinessAsset(g, `Incoming ${i}`, b, 1e6))
    }
    expect(formGroup(g, g.assets.map(a => a.id), 'Vested Group')).toBe(true)
    const grp = groupsOf(g)[0]
    expect(grp.core.share).toBeCloseTo(.8)
    expect(grp.core.executiveEquity).toBeCloseTo(.1)
    expect(grp.members.every(x => x.b.manager!.groupEquity?.id === grp.core.id && !x.b.manager!.equity)).toBe(true)
    expect(groupBuybackQuote(g, grp, 100).available).toBeCloseTo(.1)
  })

  it('gives a 100-rated group CEO no profit guarantee for supervised family divisions: each books its own loss', () => {
    const { g, id } = world(['solar', 'logistics', 'bank'], 100), grp = liveGroup(g, id)!
    grp.core.autoFound = false
    for (const x of grp.members) {
      x.b.manager!.skill = 70; x.b.manager!.personId = `family-${x.a.id}`
      if (x.b.industry !== 'bank') { x.b.debt = 1e9; x.b.debtRate = .5 }
    }
    saveGroup(g, grp)
    yearlyBusinessImpl(g)
    const members = groupById(g, id)!.members
    // R0-3 (D28): no rating guarantees a profit. The debt-laden divisions book what their books say.
    for (const x of members.filter(x => x.b.industry !== 'bank')) {
      expect(x.b.last!.net).toBeLessThan(0)
      expect(x.b.last!.strategicIncome).toBeUndefined()
    }
    // Banking 2.0: a bank earns what its books earn; no strategic trading income for any CEO.
    expect(members.find(x => x.b.industry === 'bank')!.b.last!.strategicIncome ?? 0).toBe(0)
    expect(groupById(g, id)!.core.history.at(-1)!.profit).toBeLessThan(0)
  })

  it('assigns all eligible pairs once, keeps existing contracts and excludes minority/cross-border pairs', () => {
    const { g, id } = world(['marketing', 'software', 'logistics', 'solar']), grp = liveGroup(g, id)!
    grp.members[3].m.own = .8; syncMembers(grp); saveGroup(g, grp)
    expect(assignAllServices(g, id)).toBe(6)
    const initial = serviceContracts(g)
    expect(assignAllServices(g, id)).toBe(0)
    expect(serviceContracts(g)).toEqual(initial)
    expect(initial.every(x => x.provider !== x.customer && x.customer !== grp.members[3].a.id)).toBe(true)
  })

  it('handles raise requests without owner popups and keeps replacement skills above the group floor', () => {
    const { g, id } = world(), grp = liveGroup(g, id)!, x = grp.members[0]
    x.b.manager!.salary = askingSalary(x.b, 95); x.b.manager!.since = g.year - 5
    const s: Statement = { year: g.year - 1, demand: 1e6, sold: 1e6, produced: 1e6, spoiled: 0, price: 100, revenue: 1e8, salesTax: 0, netRevenue: 1e8, cogs: 1e7, wages: 1e6, keyStaff: 2e5, rent: 1e5, marketing: 1e5, interest: 0, upkeep: 1e5, other: 0, otherIncome: 0, ownerPay: 0, pbt: 5e7, corpTax: 1e7, net: 4e7, cashErosion: 0, cycle: 1, openFraction: 1, employees: 20 }
    x.b.last = s
    for (let i = 0; i < 20 && x.b.manager!.asked !== g.year; i++) boardYear(g, x.a, x.b, s)
    expect(x.b.manager!.asked).toBe(g.year)
    expect(g.queue.some(m => m.kind === 'choice' && m.scriptId === 'business.board.raise')).toBe(false)
    x.b.manager!.equity = 0; x.b.manager!.equityAsked = g.year - 3
    executiveRetentionYear(g, x.a, x.b)
    expect(x.b.manager!.skill).toBeGreaterThanOrEqual(95)
  })

  it('keeps menu reads pure and repeated annual preparation idempotent', () => {
    const { g, id } = world()
    const before = JSON.stringify(g)
    groupView(g, id); groupView(g, id)
    expect(JSON.stringify(g)).toBe(before)
    prepareGroupManagement(g)
    const prepared = JSON.stringify(g)
    prepareGroupManagement(g)
    expect(JSON.stringify(g)).toBe(prepared)
  })
})
