// R&D 3.0 bookings: what the lab earns and pays for a fiscal year, booked once before the year is
// simulated, the way bookFranchiseYear books royalties. Credit, grant and royalty are
// `b.cash += x; b.yearIncome += x`; payroll is `b.cash -= x; b.yearCosts += x`. Cash moves exactly once,
// here: the statement and the corporate tax count the amounts through yearIncome and yearCosts, and every
// amount has a ledger field (lab-state.ts LabRow) and a line on the annual report. Nothing here draws
// g.rng, and a year booked is never booked again (`lab.booked`).
import { log } from '../core'
import type { Asset, GameState } from '../types'
import { heavyEligible } from './heavy-rd'
import { labCreditRate, LAB_CREDIT_CAP } from './lab-data'
import { draftLab, readLab, saveLab, type LabRow, type LabState } from './lab-state'
import { LAB_LOG } from './lab-text'
import { rdProjects } from './rd'
import type { BizState } from './state'
import { money, rec } from './util'

/**
 * Dollars of R&D the company started in a fiscal year: the budgets of its ordinary projects, the cost of
 * its breakthroughs and the prices of its Operations programs. This is what the tax credit is paid on.
 */
export function labSpendIn(b: BizState, fiscal: number): number {
  let spend = 0
  for (const p of rdProjects(b)) if (p.started === fiscal) spend += p.heavy === true && p.cost !== undefined ? p.cost : p.budget
  for (const p of readLab(b).programs) if (p.started === fiscal) spend += p.price
  return spend
}

/** The refundable credit on a year's R&D spend: the deep-tech rate and formula, with a cap that does not grow. */
export function labCredit(countryId: string, spend: number): number {
  if (!(spend > 0)) return 0
  return Math.round(Math.min(LAB_CREDIT_CAP, spend * labCreditRate(countryId)))
}

interface LabMove {
  key: Exclude<keyof LabRow, 'year'>
  amount: number
}

/** The money the lab moves for a fiscal year, in booking order. */
function labMoves(_g: GameState, _a: Asset, b: BizState, d: LabState, fiscal: number): LabMove[] {
  return [
    { key: 'credit', amount: labCredit(b.countryId, labSpendIn(b, fiscal)) },
    { key: 'grant', amount: Math.round(d.due.grant) },
  ]
}

/**
 * Books the lab's money for one fiscal year, once. Called before the year is simulated (yearly.ts), so
 * every amount lands in that year's statement. Deep-tech, finance and studio companies keep their own
 * R&D and are skipped. A company that has no lab and moved no money never gets one.
 */
export function bookLabYear(g: GameState, a: Asset, b: BizState, fiscal: number): void {
  if (!heavyEligible(b)) return
  if (readLab(b).booked >= fiscal) return
  const d = draftLab(b)
  const moves = labMoves(g, a, b, d, fiscal)
  if (!rec(b.lab) && moves.every((m) => !(m.amount > 0))) return
  const row: LabRow = { year: fiscal, credit: 0, grant: 0, royalty: 0, payroll: 0 }
  let booked = false
  for (const m of moves) {
    if (!(m.amount > 0)) continue
    if (m.key === 'payroll') {
      b.cash -= m.amount
      b.yearCosts += m.amount
    } else {
      b.cash += m.amount
      b.yearIncome += m.amount
    }
    row[m.key] = m.amount
    booked = true
  }
  if (booked) d.ledger.push(row)
  d.due.grant = 0
  d.booked = fiscal
  saveLab(b, d)
  if (row.grant > 0) log(g, LAB_LOG.grant(a.name, money(row.grant)), 'good')
}
