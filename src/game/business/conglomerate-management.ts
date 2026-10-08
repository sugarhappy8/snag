// Portfolio-wide delegation. Transfers conserve cash; costs are paid, never minted.
import { notice } from '../core'
import type { GameState, MenuGroup } from '../types'
import { needsVote, ownerControls, vote } from './board'
import { outlook } from './board-ceo'
import { boardView } from './board-state'
import { reserveDollars } from './board-vote'
import { askingSalary, ceoSeverance, ceoValue, handOver, headhunterFee, managerCandidate, managerName, optimizerGain, shortlist } from './career'
import { groupBlock, movableCash } from './conglomerate-actions'
import { familyRoleEdge } from './conglomerate-family'
import { captureOfSkill } from './conglomerate-econ'
import { groupById, groupValue, liveGroup, memberValue, saveGroup, syncMembers, type Group, type GroupMember } from './conglomerate-state'
import { bizWorth } from './economy'
import { equityDue } from './executive'
import { earmarkedCash } from './gamestudio'
import { clampN, money, pct } from './util'

export function managementEffectiveness(g: GameState, grp: Group): number {
  return clampN(captureOfSkill(grp.core.manager?.skill ?? 0) + familyRoleEdge(g, grp.core.id, 'finance') + familyRoleEdge(g, grp.core.id, 'strategy'), 0, 1)
}
function transfer(from: GroupMember, to: GroupMember, amount: number): void {
  from.b.cash -= amount; to.b.cash += amount
  if (!from.b.public) from.b.valuation = Math.max(0, from.b.valuation - amount)
  if (!to.b.public) to.b.valuation += amount
}
function freeForOperations(g: GameState, x: GroupMember): number {
  return Math.max(0, Math.floor(x.b.cash - earmarkedCash(x.a) - reserveDollars(x.b, boardView(g, x.a, x.b))))
}
function fundingAvailable(g: GameState, grp: Group, to: GroupMember): number {
  return freeForOperations(g, to) + (to.m.own >= .999 ? grp.members.filter(x => x !== to).reduce((s, x) => s + movableCash(g, x), 0) : 0)
}
function fund(g: GameState, grp: Group, to: GroupMember, needed: number): number {
  if (to.m.own < .999) return 0
  let left = Math.max(0, Math.ceil(needed)), moved = 0
  for (const from of grp.members.filter(x => x !== to).sort((a, b) => movableCash(g, b) - movableCash(g, a))) {
    const take = Math.min(left, movableCash(g, from))
    if (take <= 0) continue
    transfer(from, to, take); left -= take; moved += take
    if (!left) break
  }
  return moved
}
/** Fund operating buffers first, then rank profitable investments by their modeled return. */
export function allocateGroupCapital(g: GameState, grp: Group): string[] {
  const lines: string[] = [], effectiveness = managementEffectiveness(g, grp)
  for (const x of grp.members) {
    if (x.m.own < .999) continue
    const reserve = earmarkedCash(x.a) + reserveDollars(x.b, boardView(g, x.a, x.b)) + (x.b.manager?.salary ?? 0)
    const moved = fund(g, grp, x, Math.max(0, reserve - x.b.cash))
    if (moved) lines.push(`Moved ${money(moved)} to ${x.a.name} for its operating reserve and executive pay.`)
  }
  // Evaluate each division as if the treasury could fund it, not only on its currently empty wallet.
  const pool = grp.members.reduce((s, x) => s + movableCash(g, x), 0)
  const opportunities = grp.members.filter(x => x.m.own >= .999 && ownerControls(g, x.a)).map(x => {
    const view = outlook(g, x.a, { ...x.b, cash: x.b.cash + Math.max(0, pool - movableCash(g, x)) })
    return { x, view }
  }).filter(o => o.view.modeled && o.view.invest > 0 && o.view.cost > 0).sort((a, b) => b.view.invest / b.view.cost - a.view.invest / a.view.cost)
  let budget = Math.floor(pool * effectiveness)
  for (const { x, view } of opportunities) {
    const need = Math.max(0, Math.ceil(view.cost - freeForOperations(g, x)))
    const moved = fund(g, grp, x, Math.min(need, budget))
    budget -= moved
    if (moved) lines.push(`Allocated ${money(moved)} to ${x.a.name}'s positive-return investment plan.`)
  }
  lines.push(`Capital allocation effectiveness ${pct(effectiveness)}; retained reserves and project commitments. Idle cash stays safe when no worthwhile investment exists.`)
  return lines
}
/** Transfer value-weighted group shares; subsidiaries stay wholly owned for capital pooling. */
export function retainDivisionCeo(g: GameState, grp: Group, x: GroupMember): string | null {
  const m = x.b.manager
  if (grp.core.autoEquity === false || !m || x.b.ceo !== 'manager') return null
  const due = equityDue(m)
  if (!due) return null
  if (x.m.own < .999 || m.groupEquity && m.groupEquity.id !== grp.core.id) return `Could not grant group shares to ${managerName(m)} at ${x.a.name}: separate subsidiary investors or an existing outside-group award require your decision.`
  const value = groupValue(grp)
  const weight = value > 0 ? clampN(memberValue(x.b, x.m.own, grp.core.mult) / value, 0, 1) : 1 / grp.members.length
  const shares = due * weight
  if (!shares || grp.core.share - shares < .51 || !ownerControls(g, x.a)) return `Could not retain ${managerName(m)} with equity at ${x.a.name}: ownership/control constraints require your decision.`
  const before = grp.core.share
  grp.core.share -= shares
  for (const member of grp.members) member.b.invested *= grp.core.share / before
  syncMembers(grp)
  m.groupEquity = { id: grp.core.id, share: (m.groupEquity?.share ?? 0) + shares, credit: (m.groupEquity?.credit ?? 0) + due }; delete m.equityAsked
  return `Retained ${managerName(m)} at ${x.a.name} with ${pct(shares, 2)} group ownership, worth ${pct(due)} of the group's holding in that division at grant. Your group stake is now ${pct(grp.core.share, 2)}. Shares remain granted after departure; subsidiary cash remains pooled.`
}
/** Review every seat. Headhunting, severance and salaries must all be affordable. */
export function manageDivisionCeos(g: GameState, grp: Group): string[] {
  const leader = grp.core.manager
  if (!leader) return []
  const lines: string[] = []
  for (const x of grp.members) {
    if (!ownerControls(g, x.a)) { lines.push(`${x.a.name}'s outside board retains control of its CEO seat.`); continue }
    const b = x.b, current = b.ceo === 'manager' ? b.manager : null
    // Owner-appointed family leaders are supported, not silently purged for nepotism.
    const needsHire = !current || (!current.personId && current.skill < leader.skill)
    if (needsHire) {
      const kind = leader.skill >= 85 ? 'executive' : 'standard', fee = Math.round(headhunterFee(b, kind, 0) * (1 - 3 * familyRoleEdge(g, grp.core.id, 'talent'))), severance = current ? ceoSeverance(current, g.year) : 0
      const minimumPay = askingSalary(b, leader.skill)
      if (fundingAvailable(g, grp, x) < fee + severance + minimumPay) {
        lines.push(`Deferred ${x.a.name}'s CEO search: protecting its reserve leaves too little for recruiting, severance and salary.`)
      } else {
        fund(g, grp, x, Math.max(0, fee + severance + minimumPay - freeForOperations(g, x)))
        // A targeted search guarantees at least one qualified applicant, priced at that skill.
        const candidates = shortlist(g, b, kind).filter(m => m.skill >= leader.skill)
        if (!candidates.length) candidates.push(managerCandidate(g, b, leader.skill))
        b.cash -= fee; b.yearCosts += fee
        if (!b.public) b.valuation = Math.max(0, b.valuation - fee)
        const worth = bizWorth(g, b), gain = optimizerGain(g, b)
        const best = candidates.filter(m => freeForOperations(g, x) >= severance + m.salary).sort((a, c) => ceoValue(worth, c, gain) - ceoValue(worth, a, gain))[0]
        if (best && (!current || ceoValue(worth, best, gain) > ceoValue(worth, current, gain) + (fee + severance) / 5)) {
          const proposal = { kind: 'hire' as const, by: 'ceo' as const, amount: best.salary, skill: best.skill, label: `Hire ${managerName(best)} as CEO of ${x.a.name}` }
          if (!needsVote(g, x.a, b, proposal) || vote(g, x.a, b, proposal, { quiet: true }).passed) {
            handOver(g, x.a, b, best)
            if (!b.public) b.valuation = Math.max(0, b.valuation - severance)
            lines.push(`Hired ${managerName(best)} (skill ${best.skill}, ${money(best.salary)}/yr) to run ${x.a.name}${current ? ` in place of ${managerName(current)}` : ''}. Recruiting cost ${money(fee)}, severance ${money(severance)}.`)
          } else lines.push(`${x.a.name}'s board declined the CEO appointment; recruiting cost ${money(fee)}.`)
        } else lines.push(`Reviewed ${x.a.name}'s CEO; a replacement would not justify salary and switching costs. Search cost ${money(fee)}.`)
      }
    }
  }
  return lines
}
export function delegationMenu(id: string): MenuGroup {
  return { type: 'menu', id: `group.delegation.${id}`, label: 'Autonomous Management', emoji: '🤖', subtitle: g => {
    const grp = groupById(g, id)
    return grp?.core.autonomous === false ? 'Paused — manual group management' : grp?.core.ceo === 'manager' ? 'CEO handles the whole portfolio' : 'Hire a group CEO to delegate'
  }, children: g => {
    const grp = groupById(g, id)
    if (!grp) return []
    const active = grp.core.autonomous !== false, equity = grp.core.autoEquity !== false
    return [
      { type: 'info', id: `group.delegate.help.${id}`, emoji: '📋', text: `A hired group CEO reviews every subsidiary, hires CEOs at their own level or higher, retains executives, pays down expensive debt, selects mandates and routes spare capital to viable investments. Skill drives effectiveness: skill 100 reaches 100% modeled capital allocation, not guaranteed profits. Reserves, earmarked projects, board limits and minority ownership are protected. Family appointments are not silently replaced. Your personal bank account is never used. Retention awards transfer value-weighted group shares from your holding and preserve subsidiary cash pooling. Grants are permanent; the group CEO cannot award themselves shares.` },
      { type: 'action', id: `group.delegate.toggle.${id}`, label: active ? 'Pause Autonomous Management' : 'Enable Autonomous Management', emoji: '🤖', disabledReason: gg => groupBlock(gg), run: gg => { const cur = liveGroup(gg, id); if (cur && !groupBlock(gg)) { cur.core.autonomous = !active; saveGroup(gg, cur) } } },
      { type: 'action', id: `group.delegate.equity.${id}`, label: equity ? 'Disable Automatic CEO Equity' : 'Allow Automatic CEO Equity', emoji: '🤝', disabledReason: gg => groupBlock(gg), confirm: () => equity ? 'Stop future automatic grants? Already granted ownership stays with its recipients.' : 'Authorize the group CEO to permanently transfer value-weighted group shares to retain subsidiary executives? Your future dividends and proceeds decrease.', run: gg => { const cur = liveGroup(gg, id); if (cur && !groupBlock(gg)) { cur.core.autoEquity = !equity; saveGroup(gg, cur); notice(gg, 'Retention Policy', `Automatic group equity for subsidiary CEOs is now ${!equity ? 'enabled' : 'disabled'}. Existing grants remain vested.`, { emoji: '🤝' }) } } },
      ...grp.core.memo.map((text, i) => ({ type: 'info' as const, id: `group.delegate.report.${id}.${i}`, emoji: '📝', text })),
    ]
  } }
}
