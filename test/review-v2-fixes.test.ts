// Regression tests for logic bugs found by reviewing the v1.8–v2.1.3 code.
import { describe, expect, it } from 'vitest'
import { makeTestGame } from './helpers'
import { becomeCeo, installManager, managerCandidate, maxOwnerSalary } from '../src/game/business/career'
import { formGroup, groupBiz } from '../src/game/business/conglomerate-actions'
import { groupsOf, liveGroup, saveGroup } from '../src/game/business/conglomerate-state'
import { settlePerfectForesight } from '../src/game/business/executive-foresight'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { businessView } from '../src/game/business/manage'
import { bizOf, readBiz } from '../src/game/business/state'
import { simulateYear } from '../src/game/business/economy'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import type { Industry } from '../src/game/data/markets'
import type { GameState, MenuAction, MenuNode } from '../src/game/types'

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

describe('100-rated CEO perfect foresight', () => {
  it('never covers a company the player runs personally', () => {
    const g = makeTestGame(7, { age: 45, money: 0 })
    const b = newBiz(g, 'solar', 'us', 'Chicago', { cash: 20e6, founded: 2020, valuation: 25e6 })
    const a = createBusinessAsset(g, 'Own Run', b, 1e6)
    g.assets.push(a)
    // A division of a group whose hired CEO is rated 100, but the player is its own CEO.
    const owned = bizOf(g, a)
    owned.group = { id: 'grp', own: 1, joined: 2020, core: { id: 'grp', name: 'Atlas', rev: 1, founded: 2020, share: 1, ceo: 'manager', manager: { firstName: 'Ada', lastName: 'Best', gender: 'female', skill: 100, salary: 1e6, since: 2020 } } }
    owned.ceo = 'owner'; owned.manager = null; owned.debt = 1e9; owned.debtRate = .5
    const s = simulateYear(g, owned, 2025, maxOwnerSalary(owned), 1).stmt, cash = owned.cash
    settlePerfectForesight(g, owned, s)
    expect(s.strategicIncome ?? 0).toBe(0)
    expect(owned.cash).toBe(cash)
    expect(s.net).toBeLessThan(0)
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
    // Heavy interest makes the 100-rated leadership book strategic income for both divisions anyway.
    for (const x of [mine, other]) { const b = bizOf(g, x.a); b.debt = 1e9; b.debtRate = .5 }
    // Same scenario without the bonus: what the 100-rated leadership books for an ordinary year.
    const control = structuredClone(g)
    const controlBiz = bizOf(control, control.assets.find(x => x.id === mine.a.id)!)
    controlBiz.cash += n; controlBiz.yearCosts -= n; delete controlBiz.ownerDraws
    yearlyBusinessImpl(g); yearlyBusinessImpl(control)
    const after = readBiz(g, mine.a), base = readBiz(control, control.assets.find(x => x.id === mine.a.id)!)
    // Autonomous management replaced the owner with a hired CEO before settlement…
    expect(after.ceo).toBe('manager')
    // …but the strategic income does not grow by the bonus: the owner's withdrawal stays withdrawn.
    expect(after.last!.strategicIncome ?? 0).toBeLessThanOrEqual(base.last!.strategicIncome ?? 0)
    expect(after.cash).toBeLessThan(base.cash - n * .5)
    expect(after.ownerDraws).toBeUndefined()
    // The sister division run by a hired CEO keeps the documented protection.
    expect((readBiz(g, other.a).last?.net ?? 0)).toBeGreaterThan(0)
  })
})
