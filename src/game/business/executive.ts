// Executive ownership is a transfer, not newly printed shares or company cash.
import { log, notice } from '../core'
import type { Asset, GameState, MenuNode } from '../types'
import { ownerControls } from './board'
import { installManager } from './career'
import { allGroups, groupById, groupIdOf, liveGroup, saveGroup, syncMembers } from './conglomerate-state'
import { interimCeo } from './conglomerate-actions'
import { executiveEdge } from './dynamics'
import { bestPlan, refreshValue } from './economy'
import { manageBlock } from './gate'
import { bizOf, findBusiness, readBiz, type BizState, type Manager } from './state'
import { pct, priceCapOf } from './util'

export function equityTarget(skill: number): number { return skill >= 95 ? .10 : skill >= 90 ? .05 : skill >= 85 ? .02 : 0 }
export function equityDue(m: Manager): number {
  const due = equityTarget(m.skill) - (m.equity ?? 0)
  return due > 1e-10 ? due : 0
}
export function equityTerms(m: Manager): string {
  return equityTarget(m.skill) ? `${pct(equityTarget(m.skill))} ownership needed for long-term retention; ${pct(m.equity ?? 0)} granted` : 'Salary-based retention'
}

export function grantCeoEquity(g: GameState, id: string, group = false): boolean {
  if (group) {
    const grp = liveGroup(g, id), m = grp?.core.manager
    if (!grp || grp.core.ceo !== 'manager' || !m || manageBlock(g, grp.members[0].a)) return false
    const due = equityDue(m), before = grp.core.share
    if (!due || before - due < .01) return false
    grp.core.share -= due
    m.equity = (m.equity ?? 0) + due
    delete m.equityAsked
    for (const x of grp.members) x.b.invested *= grp.core.share / before
    syncMembers(grp)
    saveGroup(g, grp)
    notice(g, 'Group Equity Granted', `${m.firstName} now owns ${pct(m.equity)} of ${grp.core.name}. Your stake is ${pct(grp.core.share)}. Salary is still payable; the equity-retention requirement is satisfied. Granted shares are not returned if the CEO leaves or is fired.`, { emoji: '🤝' })
    return true
  }
  const a = findBusiness(g, id)
  if (!a || manageBlock(g, a)) return false
  let b = bizOf(g, a)
  const grp = liveGroup(g, groupIdOf(b))
  // liveGroup normalizes member records: use its canonical mutable record.
  const member = grp?.members.find(x => x.a.id === id)
  if (member) b = member.b
  const m = b.manager
  if (b.ceo !== 'manager' || !m) return false
  const due = equityDue(m), before = b.share
  if (!due || before - due < .01) return false
  if (grp && member) {
    if (grp.core.share <= .5 || !ownerControls(g, a) || (member.m.own - due) * grp.core.share < .01) return false
    member.m.own -= due
    syncMembers(grp)
  } else b.share -= due
  b.invested *= b.share / before
  m.equity = (m.equity ?? 0) + due
  delete m.equityAsked
  if (grp) saveGroup(g, grp)
  else refreshValue(a, b)
  notice(g, 'CEO Equity Granted', `${m.firstName} now owns ${pct(m.equity)} of ${a.name}. Your effective stake is ${pct(b.share)}. ${grp ? 'The stake came from the group’s holding in this division. ' : ''}Salary is still payable. Equity satisfies long-term retention, but does not prevent board dismissal. The shares stay granted after departure.`, { emoji: '🤝' })
  return true
}

/** Warning at year three, departure two years later. Calling twice cannot accelerate the deadline. */
function retention(g: GameState, name: string, m: Manager): boolean {
  const due = equityDue(m)
  if (!due || g.year - m.since < 3) return false
  if (m.equityAsked === undefined) {
    m.equityAsked = g.year
    notice(g, 'CEO Wants Ownership', `${m.firstName} ${m.lastName}, ${name}'s ${m.skill}-rated CEO, wants ${pct(due)} more ownership. Salary alone will not retain this executive. Open CEO Equity before ${g.year + 2}; otherwise they will resign.`, { emoji: '🤝' })
    return false
  }
  if (g.year < m.equityAsked + 2) return false
  notice(g, 'CEO Resigned', `${m.firstName} ${m.lastName} left ${name} after the equity deadline passed. Existing granted shares remain theirs. An interim executive will take over.`, { emoji: '🚪', tone: 'bad' })
  log(g, `${name}'s CEO resigned over ownership terms.`, 'bad')
  return true
}

export function executiveRetentionYear(g: GameState, a: Asset, b: BizState): void {
  if (b.ceo === 'manager' && b.manager && retention(g, a.name, b.manager)) installManager(g, b)
}
export function groupRetentionYear(g: GameState): void {
  for (const row of allGroups(g)) {
    const grp = liveGroup(g, row.core.id)
    if (!grp || grp.core.ceo !== 'manager' || !grp.core.manager) continue
    if (retention(g, grp.core.name, grp.core.manager)) grp.core.manager = { ...interimCeo(g, grp), since: g.year }
    saveGroup(g, grp)
  }
}

/** Strong executives repair execution gradually, and never receive free cash or guaranteed profits. */
export function executiveOperations(g: GameState, b: BizState, year: number, assetId = ''): void {
  if (b.ceo !== 'manager' || !b.manager || b.manager.skill < 85) return
  const edge = executiveEdge(b.manager.skill)
  b.quality = Math.min(100, b.quality + 6 * edge)
  b.morale = Math.min(100, b.morale + 8 * edge)
  b.brand = Math.min(100, b.brand + 4 * edge)
  if (b.manager.skill >= 90 && b.industry !== 'gameStudio' && !['semiconductor', 'aiLab', 'robotics', 'biotech', 'spaceTech', 'electricVehicles', 'quantum', 'cybersecurity'].includes(b.industry)) {
    const plan = bestPlan(g, b, { quick: true, year, maxPrice: priceCapOf(g, assetId) ?? undefined })
    b.price = plan.price
    b.production = plan.production
  }
}

export function equityMenu(id: string, group = false): MenuNode {
  const current = (g: GameState) => group ? groupById(g, id)?.core.manager : (() => { const a = findBusiness(g, id); return a ? readBiz(g, a).manager : null })()
  return { type: 'action', id: `biz.equity.${group ? 'group.' : ''}${id}`, label: 'CEO Equity', emoji: '🤝',
    subtitle: g => { const m = current(g); return m ? equityTerms(m) : 'Hire a CEO first' },
    disabledReason: g => {
      const m = current(g), grp = group ? groupById(g, id) : null
      const a = group ? grp?.members[0]?.a : findBusiness(g, id)
      if (!a) return 'No company found.'
      const block = manageBlock(g, a)
      if (block) return block
      if (!m) return 'Hire a CEO first.'
      if (!equityDue(m)) return 'No additional equity required.'
      const b = readBiz(g, a), parent = groupById(g, groupIdOf(b))
      if (!group && parent && (parent.core.share <= .5 || !ownerControls(g, a))) return 'You must control the group and division to grant division equity.'
      if ((group ? grp!.core.share : b.share) - equityDue(m) < .01) return 'Not enough ownership to make this grant.'
      return null
    },
    confirm: g => { const m = current(g); return m ? `Permanently transfer ${pct(equityDue(m))} of the ${group ? 'conglomerate' : 'company'} to this CEO? Your ownership and future dividends fall. Salary continues. These shares will not return if the CEO leaves.` : null },
    run: g => { grantCeoEquity(g, id, group) } }
}
