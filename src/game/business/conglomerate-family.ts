// Real head-office jobs: one seat per role, one job per relative, cash-backed pay and learning.
import { log, notice } from '../core'
import { personCountry } from '../events/wealth-core'
import { isEstranged } from '../events/will-core'
import { incomeTax } from '../finance'
import type { GameState, MenuGroup, MenuNode, Person } from '../types'
import { askingSalary, ceoSeverance, managerCandidate, paySeverance } from './career'
import { groupBiz, groupBlock, groupNeedsVote, groupVote } from './conglomerate-actions'
import { clearGroupCeoJob, clearGroupJob, GROUP_ROLES, isGroupRole, readGroupJob, writeGroupJob, type GroupRole } from './conglomerate-job'
import { groupById, liveGroup, saveGroup, type Group } from './conglomerate-state'
import { earmarkedCash } from './gamestudio'
import { readJob } from './nepo-job'
import { ceilingOf, startSkill } from './nepo-model'
import { isRelative, yourKin } from './nepo-state'
import { hasExecutiveShares } from './state'
import { money } from './util'

export function groupFamily(g: GameState, id: string) {
  return g.people.flatMap(p => { const job = readGroupJob(p); return p.alive && job?.groupId === id ? [{ p, job }] : [] })
}
export function groupRolePay(g: GameState, grp: Group, p: Person, role: GroupRole): number {
  const job = readGroupJob(p)
  const skill = job?.groupId === grp.core.id ? job.skill : startSkill(p)
  return Math.round(askingSalary(groupBiz(g, grp), skill, 0) * GROUP_ROLES[role].pay)
}
export function groupFamilyBlock(g: GameState, grp: Group, p: Person, role: GroupRole): string | null {
  const job = readGroupJob(p)
  return groupBlock(g) ?? (grp.core.share <= 0 ? 'You do not own shares in this family holding.' : !p.alive ? 'No longer alive.' : !isRelative(p) ? 'Only relatives can take family positions.'
    : p.data.disowned === true || isEstranged(g, p) || p.relationship < 15 ? 'This relative is not on speaking terms with you.'
    : p.age < GROUP_ROLES[role].age || p.age > 72 ? `This position requires age ${GROUP_ROLES[role].age}–72.`
    : readJob(p) ? 'Already employed at a subsidiary. End that job first.'
    : job && job.groupId !== grp.core.id ? 'Already employed at another group.'
    : job?.role === role ? 'Already holds this position.'
    : groupFamily(g, grp.core.id).some(e => e.job.role === role && e.p.id !== p.id) ? 'This family position is occupied. Remove its holder first.'
    : availablePayroll(grp) < groupRolePay(g, grp, p, role) + (role === 'ceo' && grp.core.manager ? ceoSeverance(grp.core.manager, g.year) : 0) ? 'The group cannot fund this salary and any CEO severance.' : null)
}
function availablePayroll(grp: Group): number {
  return grp.members.reduce((s, x) => s + Math.max(0, Math.floor(x.b.cash - earmarkedCash(x.a))), 0)
}
/** Debit real company cash. Rounding cannot pay a relative more than the group actually spent. */
function payrollCharge(grp: Group, due: number): number {
  let left = Math.max(0, Math.round(due)), paid = 0
  for (const x of [...grp.members].sort((a, b) => b.b.cash - a.b.cash)) {
    const take = Math.min(left, Math.max(0, Math.floor(x.b.cash - earmarkedCash(x.a))))
    x.b.cash -= take; x.b.yearCosts += take
    if (!x.b.public) x.b.valuation = Math.max(0, x.b.valuation - take)
    left -= take; paid += take
    if (left <= 0) break
  }
  return paid
}
export function appointGroupRelative(g: GameState, id: string, personId: string, role: GroupRole): boolean {
  const grp = liveGroup(g, id), p = g.people.find(p => p.id === personId)
  if (!grp || grp.members.length < 2 || !p || !isGroupRole(role) || groupFamilyBlock(g, grp, p, role)) return false
  const old = readGroupJob(p), skill = old?.groupId === id ? old.skill : startSkill(p), pay = groupRolePay(g, grp, p, role)
  const proposal = { kind: 'familyHire' as const, by: 'owner' as const, label: `Appoint ${p.firstName} as ${GROUP_ROLES[role].label}`, amount: pay, market: pay, skill, rank: role === 'ceo' ? 5 : 4, cushy: false }
  if (groupNeedsVote(g, grp, proposal) && !groupVote(g, grp, proposal).passed) { saveGroup(g, grp); return false }
  if (old?.role === 'ceo' && grp.core.manager?.personId === p.id) { grp.core.ceo = 'owner'; grp.core.manager = null }
  if (role === 'ceo') {
    if (grp.core.manager) paySeverance(g, grp.members[0].b.countryId, grp.core.manager, payrollCharge(grp, ceoSeverance(grp.core.manager, g.year)))
    clearGroupCeoJob(g, grp.core.manager)
    const m = managerCandidate(g, groupBiz(g, grp), skill)
    grp.core.ceo = 'manager'; grp.core.manager = { ...m, firstName: p.firstName, lastName: p.lastName, gender: p.gender, personId: p.id, salary: pay }
    grp.core.misses = 0
  }
  writeGroupJob(p, { groupId: id, groupName: grp.core.name, role, skill, pay, since: old?.since ?? g.year,
    lastYear: old?.lastYear ?? -1, paidYear: old?.paidYear ?? -1, unpaid: 0 })
  p.occupation = `${GROUP_ROLES[role].label} at ${grp.core.name}`
  saveGroup(g, grp)
  log(g, `I appointed ${yourKin(p)} as ${GROUP_ROLES[role].label} at ${grp.core.name}.`)
  notice(g, 'Head Office Appointment', `${p.firstName} now serves as ${GROUP_ROLES[role].label}, skill ${Math.round(skill)}/100, for ${money(pay)} a year from group cash. This is a real job: competence affects results, experience improves skill, and no salary is created for free.`, { emoji: '🏢' })
  return true
}
export function removeGroupRelative(g: GameState, id: string, personId: string): boolean {
  const grp = liveGroup(g, id), p = g.people.find(p => p.id === personId), job = p && readGroupJob(p)
  if (!grp || grp.core.share <= 0 || !p || !job || job.groupId !== id || groupBlock(g)) return false
  const proposal = { kind: 'fire' as const, by: 'owner' as const, label: `Remove ${p.firstName} from head office` }
  if (groupNeedsVote(g, grp, proposal) && !groupVote(g, grp, proposal).passed) { saveGroup(g, grp); return false }
  if (job.role === 'ceo' && grp.core.manager?.personId === p.id) {
    const severance = ceoSeverance(grp.core.manager, g.year)
    if (availablePayroll(grp) < severance) return false
    paySeverance(g, grp.members[0].b.countryId, grp.core.manager, payrollCharge(grp, severance))
    grp.core.ceo = 'owner'; grp.core.manager = null
  }
  clearGroupJob(p)
  saveGroup(g, grp)
  log(g, `${p.firstName} left head office at ${grp.core.name}.`)
  return true
}
/** Pure contribution of a filled HQ role; unqualified relatives can hinder management. */
export function familyRoleEdge(g: GameState, id: string, role: GroupRole): number {
  const employee = groupFamily(g, id).find(e => e.job.role === role)
  return employee ? (employee.job.skill - 60) / 1000 : 0
}
export function prepareGroupFamily(g: GameState, grp: Group): string[] {
  const lines: string[] = []
  for (const p of g.people) {
    const job = readGroupJob(p)
    if (!job || job.groupId !== grp.core.id) continue
    const shareholder = job.role === 'ceo' && grp.core.manager?.personId === p.id && hasExecutiveShares(grp.core.manager)
    if (!p.alive || (!shareholder && (p.age > 72 || p.data.disowned === true || isEstranged(g, p))) || (job.role === 'ceo' && grp.core.manager?.personId !== p.id)) {
      if (grp.core.manager?.personId === p.id) { grp.core.ceo = 'owner'; grp.core.manager = null }
      clearGroupJob(p); lines.push(`${p.firstName} left the ${GROUP_ROLES[job.role].label} position.`); continue
    }
    if (job.lastYear >= g.year) continue
    job.lastYear = g.year
    job.skill = Math.min(100, job.skill + Math.max(0, ceilingOf(p) - job.skill) * .16)
    job.groupName = grp.core.name
    p.occupation = `${GROUP_ROLES[job.role].label} at ${job.groupName}`
    if (job.role === 'ceo' && grp.core.manager) {
      grp.core.manager.skill = Math.round(job.skill); job.pay = grp.core.manager.salary
    } else {
      const paid = payrollCharge(grp, job.pay)
      p.money += Math.max(0, paid - incomeTax(personCountry(g, p), paid))
      job.paidYear = g.year; job.unpaid = paid < job.pay ? job.unpaid + 1 : 0
      grp.core.familyPay = (grp.core.familyPay ?? 0) + paid
      lines.push(`${p.firstName}, ${GROUP_ROLES[job.role].label}: skill ${Math.round(job.skill)}, paid ${money(paid)}${paid < job.pay ? ` of ${money(job.pay)} owed` : ''}.`)
      if (job.unpaid >= 2) { clearGroupJob(p); lines.push(`${p.firstName} resigned after two unpaid years.`); continue }
    }
    writeGroupJob(p, job)
  }
  return lines
}
/** Group CEO salary is already charged by groupYear; credit only that existing pay, once. */
export function payFamilyGroupCeo(g: GameState, grp: Group, paid: number): void {
  const p = g.people.find(p => p.alive && p.id === grp.core.manager?.personId), job = p && readGroupJob(p)
  if (!p || !job || job.groupId !== grp.core.id || job.role !== 'ceo' || job.paidYear >= g.year) return
  p.money += Math.max(0, paid - incomeTax(personCountry(g, p), paid))
  job.paidYear = g.year; writeGroupJob(p, job)
}
export function cleanGroupJobs(g: GameState): void {
  for (const p of g.people) { const job = readGroupJob(p); if (job && !groupById(g, job.groupId)) clearGroupJob(p) }
}
export function groupFamilyMenu(id: string): MenuGroup {
  return { type: 'menu', id: `group.family.${id}`, label: 'Family Head Office', emoji: '👨‍👩‍👧‍👦', subtitle: 'CEO, finance, operations, people and strategy positions', children: g => {
    const grp = groupById(g, id)
    if (!grp) return []
    const nodes: MenuNode[] = [{ type: 'info', id: `group.family.help.${id}`, emoji: '🏢', text: 'Five real family positions, one person per seat. Salary comes from group cash. Skill improves with practice and affects management. Subsidiary employees must leave their old job first. Appointing a family Group CEO replaces the current leader and may cost severance.' }]
    for (const role of Object.keys(GROUP_ROLES) as GroupRole[]) {
      const current = groupFamily(g, id).find(e => e.job.role === role)
      nodes.push({ type: 'menu', id: `group.family.role.${id}.${role}`, label: GROUP_ROLES[role].label, emoji: '💼', subtitle: current ? `${current.p.firstName} · skill ${Math.round(current.job.skill)} · ${money(current.job.pay)}/yr` : `Vacant · ${GROUP_ROLES[role].brief}`, children: gg => {
        const live = groupById(gg, id)
        if (!live) return []
        const staff = groupFamily(gg, id).find(e => e.job.role === role)
        return [
          ...(staff ? [{ type: 'action' as const, id: `group.family.remove.${id}.${staff.p.id}`, label: `Remove ${staff.p.firstName}`, emoji: '🚪', disabledReason: (g2: GameState) => groupBlock(g2), confirm: () => `Remove ${staff.p.firstName} as ${GROUP_ROLES[role].label}? CEO severance applies.`, run: (g2: GameState) => { removeGroupRelative(g2, id, staff.p.id) } }] : []),
          ...gg.people.filter(p => p.alive && isRelative(p)).map(p => ({ type: 'action' as const, id: `group.family.hire.${id}.${role}.${p.id}`, label: `${p.firstName} ${p.lastName}`, emoji: '👤', subtitle: `Skill ${Math.round(readGroupJob(p)?.skill ?? startSkill(p))} · ${money(groupRolePay(gg, live, p, role))}/yr`, disabledReason: (g2: GameState) => { const gr = groupById(g2, id), pp = g2.people.find(x => x.id === p.id); return gr && pp ? groupFamilyBlock(g2, gr, pp, role) : 'Position unavailable.' }, confirm: () => `Appoint ${p.firstName} as ${GROUP_ROLES[role].label} at ${grp.core.name}? Company cash pays the salary; any CEO contract is bought out.`, run: (g2: GameState) => { appointGroupRelative(g2, id, p.id, role) } })),
        ]
      } })
    }
    return nodes
  } }
}
