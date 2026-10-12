// Executive ownership is a transfer, not newly printed shares or company cash. Elite CEOs (skill
// 85+) ask for a small stake: a conglomerate's own CEO up to 5%, a standalone company's CEO up to
// 3%, a division's CEO 0.5-1% (of the group's holding in that division, paid in group shares).
// A shareholder CEO never resigns or retires; if they leave anyway (dismissed, replaced, the owner
// takes over, death), their shares go back to the founder (executive-shares.ts).
import { log, notice } from '../core'
import type { Asset, GameState, MenuNode } from '../types'
import { ownerControls } from './board'
import { installManager, managerCandidate } from './career'
import { allGroups, groupById, groupIdOf, inGroup, liveGroup, saveGroup, syncMembers } from './conglomerate-state'
import { interimCeo } from './conglomerate-actions'
import { clearGroupCeoJob } from './conglomerate-job'
import { executiveEdge } from './dynamics'
import { bestPlan, refreshValue } from './economy'
import { isFinanceFirm } from './finance-firm-state'
import { manageBlock } from './gate'
import { bizOf, executiveEquity, findBusiness, hasExecutiveShares, readBiz, type BizState, type Manager } from './state'
import { pct, priceCapOf } from './util'
import { equityTarget, stakeText, type EquitySeat } from './executive-shares'

export { EQUITY_TIERS, equityTarget, stakeText, type EquitySeat } from './executive-shares'

export function equityDue(m: Manager, seat: EquitySeat = 'company'): number {
  return hasExecutiveShares(m) ? 0 : equityTarget(m.skill, seat)
}
/** A company's CEO seat: a division while the company belongs to a live conglomerate. */
export function seatOf(g: GameState, b: BizState): EquitySeat {
  return inGroup(g, b) ? 'division' : 'company'
}
export function equityTerms(m: Manager, seat: EquitySeat = 'company'): string {
  if (hasExecutiveShares(m)) return `${stakeText(m.equity ?? 0)} ${seat === 'group' ? 'group' : 'company'}${m.groupEquity ? ` + ${pct(m.groupEquity.share, 2)} group shares` : ' shares'}; shareholder loyalty — will not resign or retire, and the shares come back to you if they leave`
  const t = equityTarget(m.skill, seat)
  return t ? `${stakeText(t)} initial ownership-equivalent requested for shareholder loyalty` : 'Salary-based retention'
}

export function grantCeoEquity(g: GameState, id: string, group = false): boolean {
  if (group) {
    const grp = liveGroup(g, id), m = grp?.core.manager
    if (!grp || grp.core.ceo !== 'manager' || !m || manageBlock(g, grp.members[0].a)) return false
    const due = equityDue(m, 'group'), before = grp.core.share
    if (!due || before - due < .01) return false
    grp.core.share -= due
    grp.core.executiveEquity = (grp.core.executiveEquity ?? 0) + due
    m.equity = (m.equity ?? 0) + due
    delete m.equityAsked
    for (const x of grp.members) x.b.invested *= grp.core.share / before
    syncMembers(grp)
    saveGroup(g, grp)
    notice(g, 'Group Equity Granted', `${m.firstName} now owns ${stakeText(m.equity)} of ${grp.core.name}. Your stake is ${pct(grp.core.share)}. Shareholders never resign or retire while they hold shares, even after dilution or a skill increase. Salary is still payable. If they ever leave (dismissed, replaced or otherwise), the shares come back to you.`, { emoji: '🤝' })
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
  const due = equityDue(m, grp && member ? 'division' : 'company'), before = b.share
  if (!due || before - due < .01) return false
  if (grp && member) {
    if (grp.core.share <= .5 || !ownerControls(g, a) || (member.m.own - due) * grp.core.share < .01) return false
    member.m.own -= due
    syncMembers(grp)
  } else b.share -= due
  b.invested *= b.share / before
  b.executiveEquity = executiveEquity(b) + due
  m.equity = (m.equity ?? 0) + due
  delete m.equityAsked
  if (grp) saveGroup(g, grp)
  else refreshValue(a, b)
  notice(g, 'CEO Equity Granted', `${m.firstName} now owns ${stakeText(m.equity)} of ${a.name}. Your effective stake is ${pct(b.share)}. ${grp ? 'The stake came from the group’s holding in this division. ' : ''}Shareholders never resign or retire while they hold shares, even after dilution or a skill increase. Salary is still payable. If they ever leave (dismissed, replaced or otherwise), the shares come back to you.`, { emoji: '🤝' })
  return true
}

/** Warning at year three, departure two years later. Calling twice cannot accelerate the deadline. */
function retention(g: GameState, name: string, m: Manager, seat: EquitySeat): boolean {
  if (hasExecutiveShares(m)) { delete m.equityAsked; return false }
  const due = equityDue(m, seat)
  if (!due || g.year - m.since < 3) return false
  if (m.equityAsked === undefined) {
    m.equityAsked = g.year
    notice(g, 'CEO Wants Ownership', `${m.firstName} ${m.lastName}, ${name}'s ${m.skill}-rated CEO, wants ${stakeText(due)} ownership${seat === 'division' ? ' (paid in group shares)' : ''}. Salary alone will not retain this executive. Open CEO Equity before ${g.year + 2}; otherwise they will resign.`, { emoji: '🤝' })
    return false
  }
  if (g.year < m.equityAsked + 2) return false
  notice(g, 'CEO Resigned', `${m.firstName} ${m.lastName} left ${name} after the equity deadline passed without receiving shares. An interim executive will take over.`, { emoji: '🚪', tone: 'bad' })
  log(g, `${name}'s CEO resigned over ownership terms.`, 'bad')
  return true
}

export function executiveRetentionYear(g: GameState, a: Asset, b: BizState): void {
  if (b.ceo === 'manager' && b.manager && retention(g, a.name, b.manager, seatOf(g, b))) {
    const parent = groupById(g, groupIdOf(b))
    const leader = parent?.core.ceo === 'manager' && parent.core.autonomous !== false ? parent.core.manager : null
    installManager(g, b, leader ? managerCandidate(g, b, leader.skill) : undefined)
  }
}
export function groupRetentionYear(g: GameState): void {
  for (const row of allGroups(g)) {
    const grp = liveGroup(g, row.core.id)
    if (!grp || grp.core.ceo !== 'manager' || !grp.core.manager) continue
    const before = JSON.stringify(grp.core.manager)
    if (retention(g, grp.core.name, grp.core.manager, 'group')) { clearGroupCeoJob(g, grp.core.manager); grp.core.manager = { ...interimCeo(g, grp), since: g.year } }
    // Saving increments the group revision; a repeated annual hook must not write a no-op.
    if (JSON.stringify(grp.core.manager) !== before) saveGroup(g, grp)
  }
}

/** Elite executives anticipate the current fiscal market and repair execution quickly. */
export function executiveOperations(g: GameState, b: BizState, year: number, assetId = ''): void {
  if (b.ceo !== 'manager' || !b.manager || b.manager.skill < 85) return
  const edge = executiveEdge(b.manager.skill)
  b.quality = Math.min(100, b.quality + 18 * edge)
  b.morale = Math.min(100, b.morale + 20 * edge)
  b.brand = Math.min(100, b.brand + 14 * edge)
  if (!isFinanceFirm(b) && b.industry !== 'gameStudio' && !['semiconductor', 'aiLab', 'robotics', 'biotech', 'spaceTech', 'electricVehicles', 'quantum', 'cybersecurity'].includes(b.industry)) {
    const plan = bestPlan(g, b, { quick: true, year, maxPrice: priceCapOf(g, assetId) ?? undefined })
    b.price = plan.price
    b.production = plan.production
  }
}

export function equityMenu(id: string, group = false): MenuNode {
  const current = (g: GameState) => group ? groupById(g, id)?.core.manager : (() => { const a = findBusiness(g, id); return a ? readBiz(g, a).manager : null })()
  const seat = (g: GameState): EquitySeat => {
    if (group) return 'group'
    const a = findBusiness(g, id)
    return a ? seatOf(g, readBiz(g, a)) : 'company'
  }
  return { type: 'action', id: `biz.equity.${group ? 'group.' : ''}${id}`, label: 'CEO Equity', emoji: '🤝',
    subtitle: g => { const m = current(g); return m ? equityTerms(m, seat(g)) : 'Hire a CEO first' },
    disabledReason: g => {
      const m = current(g), grp = group ? groupById(g, id) : null
      const a = group ? grp?.members[0]?.a : findBusiness(g, id)
      if (!a) return 'No company found.'
      const block = manageBlock(g, a)
      if (block) return block
      if (!m) return 'Hire a CEO first.'
      if (!equityDue(m, seat(g))) return 'No additional equity required.'
      const b = readBiz(g, a), parent = groupById(g, groupIdOf(b))
      if (!group && parent && (parent.core.share <= .5 || !ownerControls(g, a))) return 'You must control the group and division to grant division equity.'
      if ((group ? grp!.core.share : b.share) - equityDue(m, seat(g)) < .01) return 'Not enough ownership to make this grant.'
      return null
    },
    confirm: g => { const m = current(g); return m ? `Transfer ${stakeText(equityDue(m, seat(g)))} of the ${group ? 'conglomerate' : seat(g) === 'division' ? 'division' : 'company'} to this CEO? Your ownership and future dividends fall. Salary continues. A shareholder CEO never resigns or retires; if they ever leave (dismissed, replaced or otherwise), the shares come back to you.` : null },
    run: g => { grantCeoEquity(g, id, group) } }
}
