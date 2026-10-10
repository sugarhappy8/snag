import type { BizState, KeyStaff } from './state'
import type { StaffFocus } from './industries'
import { traitOf } from './flavor'

export const LEADERSHIP = { sales: .20, capacity: .22, unitCost: .09, overhead: .10, quality: 24 }
export function individualLeadershipPower(s: Pick<KeyStaff, 'skill' | 'trait' | 'morale'>): number {
  return Math.max(0, Math.min(100, s.skill)) / 100 * traitOf(s.trait).impact * (.35 + .95 * Math.max(0, Math.min(100, s.morale)) / 100)
}
/** Diminishing returns leave room for every specialist; nobody is erased by a hard cap. */
export function leadershipPower(b: BizState, focus: StaffFocus): number {
  const raw = b.staff.filter(s => s.focus === focus).reduce((sum, s) => sum + individualLeadershipPower(s), 0)
  return 2.5 * (1 - Math.exp(-raw / 2.5))
}
export function leadershipSummary(b: BizState): string {
  const pct = (v: number) => `${Math.round(v * 100)}%`
  return `Team impact: sales +${pct(LEADERSHIP.sales * leadershipPower(b, 'sales'))} demand; operations +${pct(LEADERSHIP.capacity * leadershipPower(b, 'ops'))} capacity and −${pct(LEADERSHIP.unitCost * leadershipPower(b, 'ops'))} unit costs; finance −${pct(LEADERSHIP.overhead * leadershipPower(b, 'finance'))} operating overhead; technical leadership +${Math.round(LEADERSHIP.quality * leadershipPower(b, 'quality'))} quality target. Skills, traits and morale determine each contribution. Financial firms apply these roles to client growth, execution, underwriting and research.`
}
