// R3-M9 (C.4): the bench assistant, and the bench's readers in one place. effort.ts turns lab access and an assistant into bounded terms of a
// build's odds (at most 5 and 3 points of quality, blow-ups cut to 85% and 92%); notebook.ts says who has them (`workshopTools`,
// `workshopHelpers`, re-exported here); this file runs the hire.
//
// Lab access is read, never stored. A university or graduate student has 0.4 of it. The owner of a company with a research lab (scientists
// on its team, or a program under way) or a deep-tech lab has 0.6. The larger of the two counts, never the sum, and money buys none of it.
//
// The assistant is a record in the workshop (`Workshop.helper`, optional): the year they joined and their skill, 40 at the start and 3 more
// for every year they are paid, up to 100. The wage is `round(4000 x goodsMult)` through `spend(g, wage, 'payroll')`: paid when they join,
// then once a year by the Workshop's yearly step, which skips the year of the hire. An assistant that can't be paid leaves. An heir starts
// without one (the workshop is owner-stamped).
import { formatMoney, log, notice, spend } from '../core'
import type { GameState } from '../types'
import { HELPER_WAGE, helperWage } from './build'
import { HELPERS_MAX, helperShare, mutWorkshop, readWorkshop, toolsFrom, workshopBlock, workshopHelpers, workshopTools, type ToolsFrom } from './notebook'
import { HELPER_START_SKILL, type Workshop } from './state'

export { HELPER_START_SKILL, HELPER_WAGE, HELPERS_MAX, helperShare, helperWage, toolsFrom, workshopHelpers, workshopTools, type ToolsFrom }

/** An assistant gains this much skill for every paid year, up to 100. */
export const HELPER_SKILL_STEP = 3
/** An assistant is hired by an adult. */
export const HELPER_MIN_AGE = 18

/** Why an assistant can't be hired now, or null. Pure. */
export function helperBlock(g: GameState): string | null {
  const reason = workshopBlock(g, HELPER_MIN_AGE)
  if (reason) return reason
  if (readWorkshop(g).helper) return 'You already have an assistant.'
  const wage = helperWage(g)
  if (g.character.money < wage) return `An assistant costs ${formatMoney(wage)} a year.`
  return null
}

/** Hires an assistant and pays the first year. False (and nothing paid) when it can't be done. */
export function hireHelper(g: GameState): boolean {
  if (helperBlock(g)) return false
  if (!spend(g, helperWage(g), 'payroll')) return false
  const ws = mutWorkshop(g)
  ws.helper = { since: g.year, skill: HELPER_START_SKILL }
  notice(g, 'Bench Assistant', `Your assistant starts today. Pay: ${formatMoney(helperWage(g))} a year.`, { emoji: '\u{1F9F0}' })
  return true
}

/** Lets the assistant go. Nothing is refunded. False when there is none. */
export function releaseHelper(g: GameState): boolean {
  if (!readWorkshop(g).helper) return false
  const ws = mutWorkshop(g)
  delete ws.helper
  notice(g, 'Bench Assistant', 'You let your assistant go.', { emoji: '\u{1F9F0}' })
  return true
}

/**
 * The year's wage, from the Workshop's yearly step (which runs once a year): the assistant is paid and gains a little skill, or leaves when
 * the wage can't be paid. The year of the hire is already paid, so it is skipped. No assistant, nothing to do.
 */
export function settleHelper(g: GameState, ws: Workshop): void {
  const h = ws.helper
  if (!h || h.since >= g.year) return
  if (spend(g, helperWage(g), 'payroll')) {
    h.skill = Math.min(100, h.skill + HELPER_SKILL_STEP)
    return
  }
  delete ws.helper
  log(g, "My bench assistant left. I couldn't pay them.", 'bad')
}
