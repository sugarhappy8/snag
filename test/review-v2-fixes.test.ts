// Regression tests for logic bugs found by reviewing the v1.8–v2.1.3 code.
import { describe, expect, it } from 'vitest'
import { makeTestGame } from './helpers'
import { becomeCeo, installManager, managerCandidate, maxOwnerSalary } from '../src/game/business/career'
import { formGroup, groupBiz } from '../src/game/business/conglomerate-actions'
import { groupsOf, liveGroup, saveGroup } from '../src/game/business/conglomerate-state'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { businessView } from '../src/game/business/manage'
import { bizOf, readBiz } from '../src/game/business/state'
import { closeRound } from '../src/game/business/deeptech-funding'
import { techOf } from '../src/game/business/deeptech-core'
import { yearlyCorruption } from '../src/game/special/corruption'
import { createPerson } from '../src/game/people'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import type { Industry } from '../src/game/data/markets'
import type { GameState, MenuAction, MenuNode } from '../src/game/types'
import { ceoSeverance } from '../src/game/business/career'
import { fire, hireRelative, makeCeo, severanceFor } from '../src/game/business/nepo-actions'
import { readJob } from '../src/game/business/nepo-job'
import { appointGroupRelative, removeGroupRelative } from '../src/game/business/conglomerate-family'
import { incomeTax } from '../src/game/finance'
import { runScript } from '../src/game/scripts'
import '../src/game/business/competition-events'
import { kid, world as nepoWorld } from './nepo-kit'

function group(industries: Industry[], skill: number) {
  const g = makeTestGame(123, { age: 45, money: 1e9 })
  for (const [i, industry] of industries.entries()) {
    const b = newBiz(g, industry, 'us', 'Chicago', { cash: 200e6, founded: g.year - 5, valuation: 220e6 })
    installManager(g, b, managerCandidate(g, b, 80))
    b.manager!.since = g.year - 5
    g.assets.push(createBusinessAsset(g, `Division ${i}`, b, 1e6))
  }
  expect(formGroup(g, g.assets.map(a => a.id), 'Atlas')).toBe(true)
  const id = groupsOf(g)[0].core.id, grp = liveGroup(g, id)!
  grp.core.ceo = 'manager'; grp.core.manager = managerCandidate(g, groupBiz(g, grp), skill)
  grp.core.autoEquity = false; grp.core.autoFound = false
  saveGroup(g, grp); g.queue = []
  return { g, id }
}

function find(g: GameState, nodes: MenuNode[], id: string): MenuAction {
  for (const n of nodes) {
    if (n.type === 'action' && n.id === id) return n
    if (n.type === 'menu') { const hit = (() => { try { return find(g, n.children(g), id) } catch { return null } })(); if (hit) return hit }
  }
  throw new Error(`no ${id}`)
}

describe('100-rated CEO books no guaranteed profit', () => {
  it('never covers a company the player runs personally', () => {
    const g = makeTestGame(7, { age: 45, money: 0 })
    const b = newBiz(g, 'solar', 'us', 'Chicago', { cash: 20e6, founded: 2020, valuation: 25e6 })
    const a = createBusinessAsset(g, 'Own Run', b, 1e6)
    g.assets.push(a)
    // A division of a group whose hired CEO is rated 100, but the player is its own CEO.
    const owned = bizOf(g, a)
    becomeCeo(g, a, owned, 'Owner & CEO')
    owned.group = { id: 'grp', own: 1, joined: 2020, core: { id: 'grp', name: 'Atlas', rev: 1, founded: 2020, share: 1, ceo: 'manager', manager: { firstName: 'Ada', lastName: 'Best', gender: 'female', skill: 100, salary: 1e6, since: 2020 } } }
    owned.debt = 1e9; owned.debtRate = .5
    owned.ownerSalary = maxOwnerSalary(owned)
    const cash = owned.cash
    yearlyBusinessImpl(g)
    const after = readBiz(g, a)
    expect(after.ceo).toBe('owner')
    expect(after.last!.strategicIncome).toBeUndefined()
    expect(after.last!.net).toBeLessThan(0)
    // The loss comes straight out of the company's cash: nothing is added back.
    expect(after.cash - cash).toBeCloseTo(after.last!.net, -1)
  })

  it('does not refill an owner bonus taken before a 100-rated group CEO took the division back', () => {
    const { g, id } = group(['solar', 'logistics'], 100)
    const grp = liveGroup(g, id)!, mine = grp.members[0], other = grp.members[1]
    for (const x of [mine, other]) bizOf(g, x.a).cash = 5e6
    becomeCeo(g, mine.a, bizOf(g, mine.a), 'Owner & CEO')
    const bonus = find(g, businessView(g, mine.a), `biz.bonus.${mine.a.id}`)
    expect(bonus.disabledReason?.(g) ?? null).toBeNull()
    const n = Math.min(readBiz(g, mine.a).cash, maxOwnerSalary(readBiz(g, mine.a)))
    const personal = g.character.money
    bonus.run(g, String(n))
    expect(g.character.money - personal).toBe(n)
    expect(readBiz(g, mine.a).ownerDraws).toBe(n)
    // Heavy interest makes both divisions lose money; a 100-rated leadership no longer tops that up.
    for (const x of [mine, other]) { const b = bizOf(g, x.a); b.debt = 1e9; b.debtRate = .5 }
    // Same scenario without the bonus: what the 100-rated leadership books for an ordinary year.
    const control = structuredClone(g)
    const controlBiz = bizOf(control, control.assets.find(x => x.id === mine.a.id)!)
    controlBiz.cash += n; controlBiz.yearCosts -= n; delete controlBiz.ownerDraws
    yearlyBusinessImpl(g); yearlyBusinessImpl(control)
    const after = readBiz(g, mine.a), base = readBiz(control, control.assets.find(x => x.id === mine.a.id)!)
    // Autonomous management replaced the owner with a hired CEO before settlement…
    expect(after.ceo).toBe('manager')
    // …but nothing is booked back in: the owner's withdrawal stays withdrawn.
    expect(after.last!.strategicIncome).toBeUndefined()
    expect(base.last!.strategicIncome).toBeUndefined()
    expect(after.cash).toBeLessThan(base.cash - n * .5)
    expect(after.ownerDraws).toBeUndefined()
    // The sister division run by a hired CEO books its loss too: no rating guarantees a profit.
    expect(readBiz(g, other.a).last!.strategicIncome).toBeUndefined()
    expect(readBiz(g, other.a).last!.net).toBeLessThan(0)
    // Two full group years (control and test): room for a busy CI runner.
  }, 60_000)
})

describe('inherited family companies', () => {
  it('a deep-tech funding round never mints a 1% stake for an heir who owns none', () => {
    const g = makeTestGame(9, { age: 30 })
    for (const family of [true, false]) {
      const b = newBiz(g, 'aiLab', 'us', 'Chicago', { cash: 5e6, founded: 2020 })
      const a = createBusinessAsset(g, family ? 'Family Lab' : 'Own Lab', b, 1e6)
      g.assets.push(a)
      const live = bizOf(g, a)
      live.share = family ? 0 : .012
      if (family) live.familyShares = [{ id: 'sibling', share: .6 }]
      closeRound(g, a, live, techOf(live), { series: 1, investor: 'Fund', amount: 10e6, pre: 10e6, equity: .5, down: false, bridge: false })
      // Co-owners are diluted; a holding of 0 stays 0, while the ordinary 1% floor still applies.
      expect(live.share).toBe(family ? 0 : .01)
      if (family) expect(live.familyShares![0].share).toBeCloseTo(.3)
    }
  })
})

describe('a blocked takeover', () => {
  it("books the bidder's break-up fee as the year's one-off income", () => {
    const g = makeTestGame(31, { age: 40 })
    const b = newBiz(g, 'cafe', 'us', 'Chicago', { cash: 100_000, founded: 2015 })
    const a = createBusinessAsset(g, 'Corner Cafe', b, 100_000)
    g.assets.push(a)
    const before = { cash: bizOf(g, a).cash, income: bizOf(g, a).yearIncome }
    runScript(g, 'business.comp.bid', 'accept', { assetId: a.id, offer: 1_000_000, blockP: 1, rival: 'Big Rival', rivalId: 'r1' }, { kind: 'choice', id: 'bid', title: '', text: '', choices: [{ id: 'accept', label: 'Accept' }] } as never)
    expect(g.assets.some(x => x.id === a.id)).toBe(true)
    expect(bizOf(g, a).cash - before.cash).toBe(30_000)
    expect(bizOf(g, a).yearIncome - before.income).toBe(30_000)
  })
})

describe('backroom favors', () => {
  it("a relative's influence-job salary never confiscates savings above the salary cap", () => {
    const g = makeTestGame(11, { age: 60 })
    const rich = createPerson(g, { relation: 'child', age: 35, money: 3e9 })
    const modest = createPerson(g, { relation: 'child', age: 33, money: 1_000 })
    for (const p of [rich, modest]) p.data.influenceJob = { by: g.character.id, target: 'ceo', title: 'Vice President', salary: 200_000, hiredYear: g.year - 2, lastPaid: g.year - 2 }
    yearlyCorruption(g)
    expect(rich.money).toBe(3e9)
    expect(modest.money).toBe(201_000)
  })
})

describe('severance reaches a relative', () => {
  // Company cash that leaves only to pay the relative: nothing vanishes but the income tax.
  it('a fired relative keeps their severance (and any settlement)', () => {
    const { g, a, b } = nepoWorld(631)
    const p = kid(g, 30, { smarts: 70 })
    expect(hireRelative(g, a, b, p, { rank: 2 }, { quiet: true }).ok).toBe(true)
    const sev = severanceFor(b, readJob(p)!), cash = bizOf(g, a).cash, money = p.money
    expect(sev).toBeGreaterThan(0)
    expect(fire(g, a, bizOf(g, a), p).ok).toBe(true)
    expect(p.money - money).toBeGreaterThanOrEqual(sev - incomeTax('us', sev))
    expect(cash - bizOf(g, a).cash - (p.money - money)).toBe(incomeTax('us', sev))
  })

  it('a relative CEO who is let go gets the contract buyout, like any CEO', () => {
    const { g, a, b } = nepoWorld(632)
    const p = kid(g, 40, { smarts: 80 })
    expect(hireRelative(g, a, b, p, { rank: 2 }, { quiet: true }).ok).toBe(true)
    expect(makeCeo(g, a, bizOf(g, a), p).ok).toBe(true)
    const sev = ceoSeverance(bizOf(g, a).manager!, g.year), cash = bizOf(g, a).cash, money = p.money
    expect(sev).toBeGreaterThan(0)
    expect(fire(g, a, bizOf(g, a), p).ok).toBe(true)
    expect(p.money - money).toBeGreaterThanOrEqual(sev - incomeTax('us', sev))
    expect(cash - bizOf(g, a).cash - (p.money - money)).toBe(incomeTax('us', sev))
  })

  it('a family Group CEO removed from head office gets the contract buyout', () => {
    const { g, id } = group(['solar', 'logistics'], 60)
    const p = createPerson(g, { relation: 'child', age: 45, relationship: 80, stats: { smarts: 95 }, traits: ['ambitious', 'serious', 'honest'], countryId: 'us', occupation: 'Unemployed' })
    expect(appointGroupRelative(g, id, p.id, 'ceo')).toBe(true)
    const m = groupsOf(g)[0].core.manager!
    expect(m.personId).toBe(p.id)
    const sev = ceoSeverance(m, g.year), cash = () => liveGroup(g, id)!.members.reduce((s, x) => s + x.b.cash, 0)
    const before = cash(), money = p.money
    expect(sev).toBeGreaterThan(0)
    expect(removeGroupRelative(g, id, p.id)).toBe(true)
    expect(p.money - money).toBe(sev - incomeTax('us', sev))
    expect(before - cash()).toBe(sev)
  })
})
