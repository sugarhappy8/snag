import { describe, expect, it } from 'vitest'
import { makeTestGame } from './helpers'
import { createPerson } from '../src/game/people'
import { updateWl } from '../src/game/events/will-core'
import { runScript } from '../src/game/scripts'
import { boardInternals, boardYear } from '../src/game/business/board'
import { handOver, installManager, managerCandidate } from '../src/game/business/career'
import { formGroup, groupBiz } from '../src/game/business/conglomerate-actions'
import { appointGroupRelative, prepareGroupFamily, removeGroupRelative } from '../src/game/business/conglomerate-family'
import { readGroupJob } from '../src/game/business/conglomerate-job'
import { retainDivisionCeo } from '../src/game/business/conglomerate-management'
import { diluteGroupEquity, groupById, groupsOf, liveGroup, saveGroup } from '../src/game/business/conglomerate-state'
import { equityDue, equityTerms, executiveRetentionYear, grantCeoEquity, groupRetentionYear } from '../src/game/business/executive'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { simulateYear } from '../src/game/business/economy'
import { fire, hireRelative, makeCeo } from '../src/game/business/nepo-actions'
import { readJob } from '../src/game/business/nepo-job'
import { familyYear } from '../src/game/business/nepo-year'
import { bizOf, diluteManagerEquity, hasExecutiveShares, readBiz } from '../src/game/business/state'
import type { ChoiceModal } from '../src/game/types'

function company() {
  const g = makeTestGame(937, { age: 50, money: 1e9 })
  const a = createBusinessAsset(g, 'Loyalty Co', newBiz(g, 'solar', 'us', 'Chicago', { cash: 20e6 }), 1e6)
  g.assets.push(a)
  const b = bizOf(g, a)
  installManager(g, b, managerCandidate(g, b, 95))
  g.queue = []
  return { g, a, b }
}
function group() {
  const { g, a } = company()
  const sister = createBusinessAsset(g, 'Sister', newBiz(g, 'solar', 'us', 'Chicago', { cash: 20e6 }), 1e6)
  g.assets.push(sister)
  expect(formGroup(g, [a.id, sister.id], 'Loyalty Group')).toBe(true)
  const id = groupsOf(g)[0].core.id, grp = liveGroup(g, id)!
  grp.core.ceo = 'manager'
  grp.core.manager = managerCandidate(g, groupBiz(g, grp), 95)
  grp.core.autonomous = false
  saveGroup(g, grp)
  g.queue = []
  return { g, id }
}
function relative(g: ReturnType<typeof makeTestGame>) {
  return createPerson(g, { relation: 'child', age: 40, relationship: 90, countryId: 'us', stats: { smarts: 95 }, occupation: 'Unemployed' })
}

describe('shareholder loyalty', () => {
  it.each(['company', 'group'] as const)('any positive %s stake keeps a subsidiary CEO despite an expired deadline, dilution and improving skill', kind => {
    const { g, a, b } = company(), m = b.manager!
    if (kind === 'company') m.equity = .000001
    else m.groupEquity = { id: 'group', share: .000001, credit: 0 }
    m.since = g.year - 10; m.equityAsked = g.year - 5; m.skill = 100
    diluteManagerEquity(m, .1)
    const initial = structuredClone(b), cash = g.character.money
    for (let year = 0; year < 40; year++) { g.year++; executiveRetentionYear(g, a, b) }
    expect(b.manager).toBe(m)
    expect(m.equityAsked).toBeUndefined()
    expect(equityDue(m)).toBe(0)
    expect(hasExecutiveShares(m)).toBe(true)
    expect(equityTerms(m)).toContain('will not resign or retire')
    expect(grantCeoEquity(g, a.id)).toBe(false)
    expect(b.cash).toBe(initial.cash)
    expect(b.share).toBe(initial.share)
    expect(g.character.money).toBe(cash)
    expect(g.queue).toHaveLength(0)
    const restored = JSON.parse(JSON.stringify(g))
    expect(hasExecutiveShares(readBiz(restored, restored.assets[0]).manager)).toBe(true)
  })

  it.each(['missing', 'zero', 'credit only'] as const)('%s ownership does not prevent an unretained star from resigning', kind => {
    const { g, a, b } = company(), m = b.manager!
    if (kind === 'zero') m.equity = 0
    if (kind === 'credit only') m.groupEquity = { id: 'group', share: 0, credit: .1 }
    m.since = g.year - 10; m.equityAsked = g.year - 5
    expect(hasExecutiveShares(m)).toBe(false)
    expect(equityDue(m)).toBe(.1)
    executiveRetentionYear(g, a, b)
    expect(b.manager).not.toBe(m)
    expect(g.queue.some(q => 'title' in q && q.title === 'CEO Resigned')).toBe(true)
  })

  it('keeps a group CEO through decades and dilution, clearing legacy requests without taking more owner shares', () => {
    const { g, id } = group()
    let grp = liveGroup(g, id)!
    expect(grantCeoEquity(g, id, true)).toBe(true)
    grp = liveGroup(g, id)!
    const name = grp.core.manager!.firstName
    grp.core.manager!.skill = 100; grp.core.manager!.since = g.year - 10; grp.core.manager!.equityAsked = g.year - 5
    diluteGroupEquity(grp, .001)
    saveGroup(g, grp)
    const share = grp.core.share, stake = grp.core.manager!.equity
    g.queue = []
    for (let year = 0; year < 40; year++) { g.year++; groupRetentionYear(g) }
    grp = liveGroup(g, id)!
    expect(grp.core.manager!.firstName).toBe(name)
    expect(grp.core.manager!.equity).toBe(stake)
    expect(grp.core.manager!.equityAsked).toBeUndefined()
    expect(grp.core.share).toBe(share)
    expect(g.queue).toHaveLength(0)
    expect(grantCeoEquity(g, id, true)).toBe(false)
  })

  it('never makes automatic top-up grants for an existing subsidiary shareholder', () => {
    const { g, id } = group(), grp = liveGroup(g, id)!, x = grp.members[0]
    grp.core.autoEquity = true
    x.b.manager!.equity = .0001; x.b.manager!.skill = 100
    const share = grp.core.share, cash = x.b.cash
    expect(retainDivisionCeo(g, grp, x)).toBeNull()
    expect(grp.core.share).toBe(share)
    expect(x.b.cash).toBe(cash)
    expect(x.b.manager!.groupEquity).toBeUndefined()
  })

  it.each(['company', 'group', 'none'] as const)('%s ownership is respected by ordinary rival poaching, not just equity deadlines', kind => {
    let departures = 0
    for (let seed = 1; seed <= 100; seed++) {
      const { g, a, b } = company(), m = b.manager!
      g.rng = seed; m.since = g.year - 5; m.salary = 1; m.asked = g.year; m.integrity = 100
      if (kind === 'company') m.equity = .000001
      if (kind === 'group') m.groupEquity = { id: 'group', share: .000001, credit: 0 }
      const stmt = simulateYear(g, b, g.year, 0, 1).stmt
      stmt.revenue = 10e6; stmt.net = 3e6
      b.last = stmt
      boardYear(g, a, b, stmt)
      if (b.manager !== m) departures++
    }
    if (kind === 'none') expect(departures).toBeGreaterThan(0)
    else expect(departures).toBe(0)
  })

  it.each(['company', 'group', 'none'] as const)('%s ownership is checked again when refusing an already queued raise', kind => {
    let departures = 0
    for (let seed = 1; seed <= 100; seed++) {
      const { g, a, b } = company(), m = b.manager!
      const modal: ChoiceModal = { kind: 'choice', id: 'queued-raise', title: 'Your CEO Wants a Raise', text: '', source: 'script', scriptId: boardInternals.RAISE,
        data: { assetId: a.id, who: `${m.firstName} ${m.lastName}`, ask: m.salary * 2 }, choices: [{ id: 'refuse', label: 'Say no' }] }
      // The stake arrives after the raise request. Old saved popups use this same resolver.
      if (kind === 'company') expect(grantCeoEquity(g, a.id)).toBe(true)
      if (kind === 'group') m.groupEquity = { id: 'group', share: .000001, credit: 0 }
      g.queue = []; g.rng = seed
      const salary = m.salary, cash = b.cash
      runScript(g, boardInternals.RAISE, 'refuse', modal.data, modal)
      if (b.manager !== m) departures++
      else {
        expect(m.salary).toBe(salary)
        expect(b.cash).toBe(cash)
        if (kind !== 'none') expect(g.queue.some(q => q.kind === 'notice' && q.title === 'Raise Refused' && q.text.includes('stays committed as a shareholder'))).toBe(true)
      }
    }
    if (kind === 'none') expect(departures).toBeGreaterThan(0)
    else expect(departures).toBe(0)
  })

  it('keeps shareholder family Group CEOs past retirement age and family conflict, but allows owner dismissal', () => {
    const { g, id } = group(), p = relative(g)
    expect(appointGroupRelative(g, id, p.id, 'ceo')).toBe(true)
    let grp = liveGroup(g, id)!
    grp.core.manager!.skill = 95
    saveGroup(g, grp)
    expect(grantCeoEquity(g, id, true)).toBe(true)
    p.age = 90; p.data.disowned = true; updateWl(g, p, w => { w.estr = true })
    grp = liveGroup(g, id)!
    prepareGroupFamily(g, grp)
    expect(readGroupJob(p)?.role).toBe('ceo')
    expect(grp.core.manager!.personId).toBe(p.id)
    saveGroup(g, grp)
    expect(removeGroupRelative(g, id, p.id)).toBe(true)
    expect(readGroupJob(p)).toBeNull()
    expect(groupById(g, id)!.core.manager).toBeNull()
  })

  it('still cleans up a shareholder family Group CEO after death', () => {
    const { g, id } = group(), p = relative(g)
    appointGroupRelative(g, id, p.id, 'ceo')
    const grp = liveGroup(g, id)!
    grp.core.manager!.equity = .01
    p.alive = false
    prepareGroupFamily(g, grp)
    expect(readGroupJob(p)).toBeNull()
    expect(grp.core.manager).toBeNull()
  })

  it.each(['family conflict', 'moving abroad'] as const)('keeps a shareholder family subsidiary CEO after %s', reason => {
    const { g, a, b } = company(), p = relative(g)
    expect(hireRelative(g, a, b, p, { rank: 2 }, { quiet: true }).ok).toBe(true)
    expect(makeCeo(g, a, b, p).ok).toBe(true)
    b.manager!.skill = 95
    expect(grantCeoEquity(g, a.id)).toBe(true)
    if (reason === 'family conflict') { p.data.disowned = true; updateWl(g, p, w => { w.estr = true }) }
    else p.data.countryId = 'ae'
    familyYear(g)
    expect(b.manager!.personId).toBe(p.id)
    expect(readJob(p)?.rank).toBe(5)
    expect(fire(g, a, b, p).ok).toBe(true)
    expect(readJob(p)).toBeNull()
    expect(b.manager!.personId).not.toBe(p.id)
  })

  it('does not make shareholders immune to an explicit CEO replacement', () => {
    const { g, a, b } = company(), old = b.manager!
    old.equity = .01
    const replacement = managerCandidate(g, b, 100)
    handOver(g, a, b, replacement)
    expect(b.manager!.equity).toBeUndefined()
    expect(b.manager!.skill).toBe(100)
    expect(old.equity).toBe(.01)
  })
})
