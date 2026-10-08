// A one-line summary of the relatives on the payroll, for the Employees screen (staff.ts).
import type { Asset, GameState } from '../types'
import { employeesOf } from './nepo-state'
import { money, plural } from './util'

/** 'Family on the payroll: Liam (Sales Intern), Ana (VP of Finance)', or '' when none. */
export function familyStaffLine(g: GameState, a: Asset): string {
  const emps = employeesOf(g, a.id)
  if (emps.length === 0) return ''
  const shown = emps.slice(0, 3).map((e) => `${e.p.firstName} (${e.job.title})`).join(', ')
  const more = emps.length > 3 ? ` and ${plural(emps.length - 3, 'more')}` : ''
  const pay = emps.reduce((s, e) => s + e.job.pay, 0)
  return `Family on the payroll: ${shown}${more} \u{00B7} ${money(pay)}/yr. Manage them under Leadership \u{203A} Family at the Company.`
}
