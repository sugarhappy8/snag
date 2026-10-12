import { formatMoney, notice } from '../core'
import { payForAction } from '../activities/common'
import { npcLife } from '../npc-state'
import { manageBlock } from './gate'
import { employeesOf, successorOf } from './nepo-state'
import { bizOf, readBiz, type BizState } from './state'
import type { Asset, GameState, MenuGroup } from '../types'

export function successionReadiness(g: GameState, a: Asset, b: BizState): string | null {
  const successor = successorOf(g, a, b)
  if (!successor) return 'Name a successor first: a relative who works here, or a key employee.'
  if (successor.kind === 'staff') {
    const staff = b.staff.find(s => s.id === successor.id)
    return !staff || staff.skill < 55 || staff.years < 3 || staff.age < 21 ? 'A staff successor needs to be 21 or older, with skill 55+ and three years here.' : null
  }
  const { person, job } = successor, l = npcLife(person)
  if (person.age < 21 || job.part || job.kind !== 'real' || job.rank < 2 || job.skill < 55) return 'A family successor needs to be 21 or older, in a real management job here, with skill 55+.'
  const experience = Math.max(0, g.year - job.since)
  if (experience < 3 || (!(l && l.education >= 1) && experience < 6)) return 'They need three years here with a degree, or six years without one.'
  if (person.relationship < 40 || person.data.disowned === true) return 'Mend your relationship with them first.'
  return null
}

function reviewActive(b: BizState): boolean {
  const raw = b.successionReview
  return !!raw && typeof raw === 'object' && !Array.isArray(raw) && raw.enabled === true
}

/**
 * Only worth a look once succession is a real question: an older owner, a company with some
 * years behind it, relatives on the payroll, a named successor, or a review already in place.
 */
export function successionMatters(g: GameState, a: Asset, b: BizState): boolean {
  return reviewActive(b) || g.character.age >= 45 || g.year - b.founded >= 5 || employeesOf(g, a.id).length > 0 || successorOf(g, a, b) !== null
}

export function adoptSuccessionReview(g: GameState, id: string): boolean {
  const a = g.assets.find(a => a.id === id && a.kind === 'business')
  if (!a || manageBlock(g, a)) return false
  const b = readBiz(g, a)
  if (b.share < .5 || b.group || (g.yearActions[`succession.review.${id}`] ?? 0) >= 1 || !payForAction(g, 500)) return false
  g.yearActions[`succession.review.${id}`] = 1
  bizOf(g, a).successionReview = { v: 1, enabled: true, year: g.year }
  const gap = successionReadiness(g, a, b)
  notice(g, 'Successor Rule Set', `You paid ${formatMoney(500)} for an outside review. ${gap ?? 'Your successor is ready.'} From now on, only a ready successor takes over automatically. Your will still decides who inherits; until an heir is ready, a hired manager can run the company. Give them a job here and mentor them.`, { emoji: '📋' }); return true
}
export function successionReviewMenu(a: Asset): MenuGroup {
  const live = (g: GameState) => g.assets.find(x => x.id === a.id && x.kind === 'business')
  return { type: 'menu', id: `succession.review.${a.id}`, label: 'Successor Readiness', emoji: '📋',
    subtitle: g => { const x = live(g); return x && reviewActive(readBiz(g, x)) ? 'On: only a ready successor takes over' : 'Make sure whoever takes over is ready' },
    visible: g => { const x = live(g); return !!x && successionMatters(g, x, readBiz(g, x)) },
    children: g => {
      const x = live(g)
      if (!x) return []
      const b = readBiz(g, x), active = reviewActive(b)
      return [
        { type: 'info', id: `succession.readiness.${a.id}`, text: `${active ? 'On: your successor only takes over automatically once they are ready.' : 'Off: your named successor takes over when you step back, ready or not.'}\n${successionReadiness(g, x, b) ?? 'Your successor is ready.'}\nYour will decides who owns the company; this decides who runs it.` },
        { type: 'action', id: `succession.adopt.${a.id}`, label: active ? 'Check Again' : 'Only Let a Ready Successor Take Over', emoji: '📋', subtitle: `${formatMoney(500)} from your pocket for an outside review`, disabledReason: gg => manageBlock(gg, x) ?? (b.share < .5 || b.group ? "You need to own most of the company, and it can't be part of a group." : null), confirm: () => 'From now on your successor only takes over automatically once they have the skill and experience. Who inherits your shares stays the same.', run: gg => { adoptSuccessionReview(gg, a.id) } },
      ]
    } }
}
