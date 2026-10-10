import { formatMoney, notice } from '../core'
import { payForAction } from '../activities/common'
import { npcLife } from '../npc-state'
import { manageBlock } from './gate'
import { successorOf } from './nepo-state'
import { bizOf, readBiz, type BizState } from './state'
import type { Asset, GameState, MenuGroup } from '../types'

export function successionReadiness(g: GameState, a: Asset, b: BizState): string | null {
  const successor = successorOf(g, a, b)
  if (!successor) return 'Name an employed family member or key employee through Succession Planning first.'
  if (successor.kind === 'staff') {
    const staff = b.staff.find(s => s.id === successor.id)
    return !staff || staff.skill < 55 || staff.years < 3 || staff.age < 21 ? 'Key staff need age 21, skill 55 and three years at the company.' : null
  }
  const { person, job } = successor, l = npcLife(person)
  if (person.age < 21 || job.part || job.kind !== 'real' || job.rank < 2 || job.skill < 55) return 'A family successor needs age 21, a real management role and skill 55.'
  const experience = Math.max(0, g.year - job.since)
  if (experience < 3 || (!(l && l.education >= 1) && experience < 6)) return 'Build three years of company experience with a degree, or six years of practical company experience without one.'
  if (person.relationship < 40 || person.data.disowned === true) return 'Repair the relationship before entrusting day-to-day control.'
  return null
}
export function adoptSuccessionReview(g: GameState, id: string): boolean {
  const a = g.assets.find(a => a.id === id && a.kind === 'business')
  if (!a || manageBlock(g, a)) return false
  const b = readBiz(g, a)
  if (b.share < .5 || b.group || (g.yearActions[`succession.review.${id}`] ?? 0) >= 1 || !payForAction(g, 500)) return false
  g.yearActions[`succession.review.${id}`] = 1
  bizOf(g, a).successionReview = { v: 1, enabled: true, year: g.year }
  const gap = successionReadiness(g, a, b)
  notice(g, 'Succession Policy Adopted', `${formatMoney(500)} paid for an independent review. ${gap ?? 'Your designated successor is ready.'} This company will only automatically appoint a successor who meets the readiness rules. Ownership still follows the existing will; an unready heir may own the company while professional management runs it. Use family employment and mentorship to prepare them.`, { emoji: '📋' }); return true
}
export function successionReviewMenu(a: Asset): MenuGroup {
  return { type: 'menu', id: `succession.review.${a.id}`, label: 'Succession Readiness Review', emoji: '📋', children: g => {
    const live = g.assets.find(x => x.id === a.id && x.kind === 'business')
    if (!live) return []
    const b = readBiz(g, live), raw = b.successionReview, active = raw && typeof raw === 'object' && !Array.isArray(raw) && raw.enabled === true
    return [
      { type: 'info', id: `succession.readiness.${a.id}`, text: `${active ? 'Readiness policy active.' : 'Existing succession rules; enhanced policy not adopted.'}\n${successionReadiness(g, live, b) ?? 'Designated successor meets the practical readiness criteria.'}\nDegrees and professional licenses are personal. The will transfers ownership, not competence. Family at the Company provides hiring, mentoring and designation controls.` },
      { type: 'action', id: `succession.adopt.${a.id}`, label: active ? 'Refresh Independent Review' : 'Adopt Reviewed Succession Policy', emoji: '📋', subtitle: `${formatMoney(500)} paid personally; no tax or ownership change`, disabledReason: gg => manageBlock(gg, live) ?? (b.share < .5 || b.group ? 'Requires majority control of a standalone company; groups use their existing governance.' : null), confirm: () => 'Automatic succession will require actual skill, management experience and readiness. Ownership bequests remain unchanged.', run: gg => { adoptSuccessionReview(gg, a.id) } },
    ]
  } }
}
