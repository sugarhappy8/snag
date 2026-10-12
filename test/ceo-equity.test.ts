// CEO equity rules (v2.3.1): a conglomerate's own CEO can ask for up to 5%, a standalone
// company's CEO for less (up to 3%), a division's CEO for 0.5-1% by level; a shareholder CEO
// never resigns, and when one leaves anyway the shares go back to the founder.
import { describe, expect, it } from 'vitest'
import { makeTestGame } from './helpers'
import { createPerson } from '../src/game/people'
import { becomeCeo, handOver, installManager, managerCandidate } from '../src/game/business/career'
import { chairGroup, formGroup, spinOff } from '../src/game/business/conglomerate-actions'
import { appointGroupRelative, prepareGroupFamily } from '../src/game/business/conglomerate-family'
import { retainDivisionCeo } from '../src/game/business/conglomerate-management'
import { groupsOf, liveGroup, readMembership, saveGroup } from '../src/game/business/conglomerate-state'
import { equityMenu, equityTarget, executiveRetentionYear, grantCeoEquity } from '../src/game/business/executive'
import { returnFormerExecutiveShares, settleAfterCeoChange, stakeText } from '../src/game/business/executive-shares'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { bizOf, executiveEquity, readBiz } from '../src/game/business/state'
import type { GameState, MenuAction } from '../src/game/types'

function company(skill = 95) {
  const g = makeTestGame(941, { age: 50, money: 1e9 })
  const a = createBusinessAsset(g, 'Equity Co', newBiz(g, 'solar', 'us', 'Chicago', { cash: 20e6 }), 1e6)
  g.assets.push(a)
  const b = bizOf(g, a)
  installManager(g, b, managerCandidate(g, b, skill))
  g.queue = []
  return { g, a, b }
}

function group(skill = 95) {
  const { g, a } = company(skill)
  const sister = createBusinessAsset(g, 'Sister', newBiz(g, 'solar', 'us', 'Chicago', { cash: 20e6 }), 1e6)
  g.assets.push(sister)
  expect(formGroup(g, [a.id, sister.id], 'Equity Group')).toBe(true)
  const id = groupsOf(g)[0].core.id
  const grp = liveGroup(g, id)!
  grp.core.ceo = 'manager'
  grp.core.manager = { ...managerCandidate(g, grp.members[0].b, skill), since: g.year }
  grp.core.autonomous = false
  saveGroup(g, grp)
  g.queue = []
  return { g, id, a, sister }
}

function trio(skill = 95) {
  const g = makeTestGame(943, { age: 50, money: 1e9 })
  const assets = ['One', 'Two', 'Three'].map((n) => {
    const a = createBusinessAsset(g, n, newBiz(g, 'solar', 'us', 'Chicago', { cash: 20e6 }), 1e6)
    g.assets.push(a)
    const b = bizOf(g, a)
    installManager(g, b, managerCandidate(g, b, skill))
    return a
  })
  expect(formGroup(g, assets.map((a) => a.id), 'Trio')).toBe(true)
  g.queue = []
  return { g, id: groupsOf(g)[0].core.id, assets }
}

function subtitle(g: GameState, node: ReturnType<typeof equityMenu>): string {
  const n = node as MenuAction
  return typeof n.subtitle === 'function' ? n.subtitle(g) : n.subtitle ?? ''
}

describe('what CEOs can ask for', () => {
  it('caps a conglomerate CEO at 5%, a company CEO below that, and a division CEO at 0.5-1% by level', () => {
    expect([80, 85, 90, 95, 100].map((s) => equityTarget(s, 'group'))).toEqual([0, 0.02, 0.035, 0.05, 0.05])
    expect([80, 85, 90, 95, 100].map((s) => equityTarget(s, 'company'))).toEqual([0, 0.01, 0.02, 0.03, 0.03])
    expect([80, 85, 90, 95, 100].map((s) => equityTarget(s, 'division'))).toEqual([0, 0.005, 0.0075, 0.01, 0.01])
    // Only a conglomerate's own CEO ever reaches 5%.
    for (const seat of ['company', 'division'] as const) for (const s of [85, 90, 95, 100]) expect(equityTarget(s, seat)).toBeLessThan(0.05)
    expect([0.005, 0.0075, 0.01, 0.035, 0.05].map(stakeText)).toEqual(['0.5%', '0.75%', '1%', '3.5%', '5%'])
  })

  it('asks a standalone company for 3% and a division for 1%, in the menu and the warning', () => {
    const solo = company(95)
    expect(subtitle(solo.g, equityMenu(solo.a.id))).toMatch(/^3% initial ownership/)
    const { g, a } = group(95)
    const div = bizOf(g, a)
    installManager(g, div, managerCandidate(g, div, 95))
    expect(subtitle(g, equityMenu(a.id))).toMatch(/^1% initial ownership/)
    expect(subtitle(g, equityMenu(groupsOf(g)[0].core.id, true))).toMatch(/^5% initial ownership/)
    div.manager!.since = g.year - 3
    g.queue = []
    executiveRetentionYear(g, a, div)
    const warn = g.queue.find((q) => q.kind === 'notice' && q.title === 'CEO Wants Ownership')
    expect(warn && warn.kind === 'notice' ? warn.text : '').toContain('wants 1% ownership (paid in group shares)')
  })

  it('grants a division CEO 0.75% of the group’s holding at level 90, and a group CEO 5% at 95', () => {
    const { g, id, a } = group(95)
    expect(grantCeoEquity(g, id, true)).toBe(true)
    expect(groupsOf(g)[0].core.share).toBeCloseTo(0.95)
    const div = bizOf(g, a)
    installManager(g, div, managerCandidate(g, div, 90))
    expect(grantCeoEquity(g, a.id)).toBe(true)
    expect(readMembership(readBiz(g, a).group)!.own).toBeCloseTo(0.9925, 6)
    expect(readBiz(g, a).manager!.equity).toBeCloseTo(0.0075, 6)
  })
})

describe('a CEO who leaves gives the shares back to the founder', () => {
  it('when replaced, when the owner takes over, and only once', () => {
    for (const how of ['replaced', 'owner'] as const) {
      const { g, a, b } = company(95)
      b.invested = 1e6
      expect(grantCeoEquity(g, a.id)).toBe(true)
      expect(b.share).toBeCloseTo(0.97)
      // The grant took its slice of the cost basis; the return brings it back.
      expect(b.invested).toBeCloseTo(970_000)
      if (how === 'replaced') handOver(g, a, b, managerCandidate(g, b, 60))
      else becomeCeo(g, a, b)
      expect(b.share).toBeCloseTo(1)
      expect(executiveEquity(b)).toBe(0)
      expect(b.invested).toBeCloseTo(1e6)
      // Nothing left to return.
      expect(returnFormerExecutiveShares(g, b)).toBe(0)
      expect(b.share).toBeCloseTo(1)
    }
  })

  it('never touches a sitting CEO’s shares', () => {
    const { g, a, b } = company(95)
    expect(grantCeoEquity(g, a.id)).toBe(true)
    for (let i = 0; i < 3; i++) returnFormerExecutiveShares(g, b)
    expect(b.share).toBeCloseTo(0.97)
    expect(b.manager!.equity).toBe(0.03)
    const { g: g2, id } = group(95)
    expect(grantCeoEquity(g2, id, true)).toBe(true)
    for (let i = 0; i < 3; i++) saveGroup(g2, liveGroup(g2, id)!)
    expect(groupsOf(g2)[0].core.share).toBeCloseTo(0.95)
    expect(groupsOf(g2)[0].core.manager!.equity).toBe(0.05)
  })

  it('returns a division CEO’s shares to the group’s holding, at once from the company screen or at the group’s next save', () => {
    for (const when of ['now', 'save'] as const) {
      const { g, a, sister } = group(95)
      const div = bizOf(g, a)
      installManager(g, div, managerCandidate(g, div, 95))
      expect(grantCeoEquity(g, a.id)).toBe(true)
      expect(readMembership(readBiz(g, a).group)!.own).toBeCloseTo(0.99, 6)
      handOver(g, a, bizOf(g, a), managerCandidate(g, div, 60))
      if (when === 'now') settleAfterCeoChange(g, bizOf(g, a))
      else saveGroup(g, liveGroup(g, groupsOf(g)[0].core.id)!)
      const after = readBiz(g, a)
      expect(readMembership(after.group)!.own).toBeCloseTo(1, 6)
      expect(executiveEquity(after)).toBe(0)
      expect(after.share).toBeCloseTo(readBiz(g, sister).share, 6)
    }
  })

  it('returns a division CEO’s group shares when they leave', () => {
    const { g, id, a } = group(95)
    let grp = liveGroup(g, id)!
    grp.core.autoEquity = true
    const x = grp.members.find((m) => m.a.id === a.id)!
    x.b.manager = { ...managerCandidate(g, x.b, 95), since: g.year }
    expect(retainDivisionCeo(g, grp, x)).toContain('Retained')
    saveGroup(g, grp)
    expect(groupsOf(g)[0].core.share).toBeLessThan(1)
    grp = liveGroup(g, id)!
    const div = grp.members.find((m) => m.a.id === a.id)!
    handOver(g, div.a, div.b, managerCandidate(g, div.b, 60))
    saveGroup(g, grp)
    expect(groupsOf(g)[0].core.share).toBeCloseTo(1, 6)
    expect(groupsOf(g)[0].core.executiveEquity ?? 0).toBeCloseTo(0, 9)
  })

  it('returns a group CEO’s 5% when the owner chairs the group again', () => {
    const { g, id } = group(95)
    expect(grantCeoEquity(g, id, true)).toBe(true)
    expect(groupsOf(g)[0].core.share).toBeCloseTo(0.95)
    expect(chairGroup(g, id)).toBe(true)
    const core = groupsOf(g)[0].core
    expect(core.share).toBeCloseTo(1, 6)
    expect(core.manager).toBeNull()
    for (const m of groupsOf(g)[0].members) expect(m.b.share).toBeCloseTo(1, 6)
  })

  it('returns a family group CEO’s shares after their death', () => {
    const { g, id } = group(95)
    const p = createPerson(g, { relation: 'child', age: 40, relationship: 90, countryId: 'us', stats: { smarts: 95 }, occupation: 'Unemployed' })
    expect(appointGroupRelative(g, id, p.id, 'ceo')).toBe(true)
    let grp = liveGroup(g, id)!
    grp.core.manager!.skill = 95
    saveGroup(g, grp)
    expect(grantCeoEquity(g, id, true)).toBe(true)
    expect(groupsOf(g)[0].core.share).toBeCloseTo(0.95)
    p.alive = false
    grp = liveGroup(g, id)!
    prepareGroupFamily(g, grp)
    saveGroup(g, grp)
    expect(groupsOf(g)[0].core.share).toBeCloseTo(1, 6)
  })

  it('turns a spun-off division CEO’s group shares into shares of their company, and returns the group shares once', () => {
    const { g, id, assets } = trio()
    const grp = liveGroup(g, id)!
    grp.core.autoEquity = true
    const x = grp.members.find((m) => m.a.id === assets[2].id)!
    expect(retainDivisionCeo(g, grp, x)).toContain('Retained')
    saveGroup(g, grp)
    const award = readBiz(g, assets[2]).manager!.groupEquity!.share
    expect(groupsOf(g)[0].core.share).toBeCloseTo(1 - award, 9)
    expect(spinOff(g, id, assets[2].id)).toBe(true)
    const spun = bizOf(g, assets[2])
    // Still a shareholder of the company they run: their slice of it, as for every group shareholder.
    expect(spun.manager!.groupEquity).toBeUndefined()
    expect(spun.manager!.equity).toBeCloseTo(award, 9)
    expect(spun.executiveEquity).toBeCloseTo(award, 9)
    expect(spun.share).toBeCloseTo(1 - award, 9)
    // The group shares themselves come back to you, and only once.
    expect(groupsOf(g)[0].core.share).toBeCloseTo(1, 9)
    for (let i = 0; i < 3; i++) saveGroup(g, liveGroup(g, id)!)
    expect(groupsOf(g)[0].core.share).toBeCloseTo(1, 9)
    expect(groupsOf(g)[0].core.executiveEquity ?? 0).toBeCloseTo(0, 9)
    // When that CEO leaves the company later, those shares come back too.
    handOver(g, assets[2], spun, managerCandidate(g, spun, 60))
    expect(spun.share).toBeCloseTo(1, 9)
  })

  it('gives the group executives’ slice of a spun-off company back to you, and the group CEO’s stake when the group is wound up', () => {
    const { g, id, a, sister } = group(95)
    for (const x of [a, sister]) bizOf(g, x).invested = 1e6
    expect(grantCeoEquity(g, id, true)).toBe(true)
    expect(readBiz(g, sister).share).toBeCloseTo(0.95, 9)
    expect(readBiz(g, sister).invested).toBeCloseTo(950_000, 3)
    // Spinning off one of the last two companies winds the group up.
    expect(spinOff(g, id, sister.id)).toBe(true)
    expect(groupsOf(g)).toHaveLength(0)
    // Both come back whole, with the cost basis that went with the shares (the fees add to the
    // spun-off company's).
    expect(readBiz(g, sister).share).toBeCloseTo(1, 9)
    expect(readBiz(g, sister).invested).toBeGreaterThanOrEqual(1e6 - 1)
    expect(readBiz(g, a).share).toBeCloseTo(1, 9)
    expect(readBiz(g, a).invested).toBeCloseTo(1e6, 3)
    expect(readBiz(g, a).group).toBeUndefined()
  })

  it('returns old saves’ former-executive stakes to the founder at the yearly check', () => {
    const { g, b } = company(60)
    b.share = 0.9
    b.executiveEquity = 0.1
    expect(b.manager!.equity ?? 0).toBe(0)
    expect(returnFormerExecutiveShares(g, b)).toBeCloseTo(0.1)
    expect(b.share).toBeCloseTo(1)
    expect(b.executiveEquity).toBe(0)
  })
})
