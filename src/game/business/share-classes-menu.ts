// Choosing a share structure: for a private company a plan for its IPO (free, any time), for a listed one a
// recap the board votes on once a year. The maths of the votes is share-classes.ts; the control rule is
// board-state.ts (controlsFor). This file holds the choice itself: what it would do, why it is blocked, and
// the change. The menu rows are added on top (Task 4).
import { formatPrice, log, notice, useYearAction, yearActionsUsed } from '../core'
import type { Asset, GameState } from '../types'
import { boardAllows, passOdds, type Proposal } from './board'
import { boardOf, controlsFor, syncSeats } from './board-state'
import { groupIdOf } from './conglomerate-state'
import { refreshValue } from './economy'
import { ipoRetain } from './exit'
import { manageBlock } from './gate'
import { afterIpo, CLASS_MERIT, CLASS_PHRASE, classFactor, ownerVotes, planFactor, votesAfterIpo } from './share-classes'
import { FLOAT_DEFAULT } from './share-structure'
import { bizOf, findBusiness, readClasses, type BizState, type ClassKind } from './state'
import { pct, round2 } from './util'

/** One of the three structures a company can have: one class, founder shares, a non-voting float. */
export type ClassChoice = ClassKind | 'single'

export const CLASS_CHOICES: readonly ClassChoice[] = ['single', 'ab', 'nv']

/** The year-action key a listed company's recap counts under (one change a year). */
export function classesKey(assetId: string): string {
  return `classes.${assetId}`
}

/** The structure the company has (or, while private, plans to list with). A damaged record is one class. */
export function currentChoice(b: BizState): ClassChoice {
  return readClasses(b.classes)?.kind ?? 'single'
}

function kindOf(choice: ClassChoice): ClassKind | null {
  return choice === 'ab' || choice === 'nv' ? choice : null
}

function isChoice(v: unknown): v is ClassChoice {
  return v === 'single' || v === 'ab' || v === 'nv'
}

/**
 * The board's proposal for a change of structure. Hints (classOption) and the vote (changeClasses) both
 * use this, so the odds shown are the odds rolled.
 */
export function recapProposal(a: Asset, choice: ClassChoice): Proposal {
  return { kind: 'recap', by: 'owner', merit: CLASS_MERIT[choice], label: `Change ${a.name} to ${CLASS_PHRASE[choice]}` }
}

/** Why this change can't be made now, or null. */
export function classBlock(g: GameState, a: Asset, b: BizState, choice: ClassChoice): string | null {
  const blocked = manageBlock(g, a)
  if (blocked) return blocked
  if (groupIdOf(b)) return "A division can't have its own share classes."
  if (currentChoice(b) === choice) return 'It already has this structure.'
  if (b.public && yearActionsUsed(g, classesKey(a.id)) > 0) return 'Classes change once a year.'
  return null
}

export interface ClassOption {
  choice: ClassChoice
  /** This is the structure the company has now. */
  current: boolean
  /** Why it can't be picked now (classBlock), or null. */
  reason: string | null
  /** The owner's part of the votes under this structure (after a default float while private). */
  votes: number
  /** Whether that part of the votes would give the owner the board. */
  controls: boolean
  /** The change in the price the market pays: 0.96 is 4% less. */
  factor: number
  /** The board's chance of passing the change (listed companies only). */
  odds: number | null
}

/** What picking `choice` would do. Pure: no vote, no draw, nothing changes. */
export function classOption(g: GameState, a: Asset, b: BizState, choice: ClassChoice): ClassOption {
  const kind = kindOf(choice)
  const current = currentChoice(b) === choice
  const reason = classBlock(g, a, b, choice)
  if (b.public) {
    const copy: BizState = { ...b }
    if (kind) copy.classes = { kind, hi: b.share }
    else delete copy.classes
    return {
      choice,
      current,
      reason,
      votes: ownerVotes(copy),
      controls: controlsFor(g, copy),
      factor: planFactor(kind) / classFactor(b),
      odds: passOdds(g, a, b, recapProposal(a, choice)),
    }
  }
  const retain = ipoRetain(g, b, FLOAT_DEFAULT, kind)
  return {
    choice,
    current,
    reason,
    votes: votesAfterIpo(b, retain, kind),
    controls: controlsFor(g, afterIpo(b, retain, kind)),
    factor: planFactor(kind),
    odds: null,
  }
}

/**
 * Pick a structure. A private company only sets the plan its IPO will use (free, any time, no vote).
 * A listed company asks its board, once a year: a yes converts the owner's whole stake to the founders'
 * class (or back to one class), moves the price once by the difference in what the market pays, and
 * re-seats the board. A no changes nothing and leaves the year's other board proposals alone.
 * Every refusal posts a notice. Returns whether the structure changed.
 */
export function changeClasses(g: GameState, assetId: string, choice: ClassChoice): boolean {
  if (!isChoice(choice)) return false
  const a = findBusiness(g, assetId)
  if (!a) return false
  const b = bizOf(g, a)
  const reason = classBlock(g, a, b, choice)
  if (reason) {
    notice(g, 'Share Classes', reason)
    return false
  }
  const kind = kindOf(choice)
  if (!b.public) {
    const option = classOption(g, a, b, choice)
    if (kind) b.classes = { kind, hi: 1 }
    else delete b.classes
    log(g, `I changed ${a.name} to ${CLASS_PHRASE[choice]}.`)
    const votes = `You'd hold ${pct(option.votes, 0)} of the votes after a ${FLOAT_DEFAULT}% float.`
    const cost = option.factor < 1 ? ` The market pays ${pct(1 - option.factor, 0)} less.` : ''
    notice(g, 'Share Classes', `${a.name} will list with ${CLASS_PHRASE[choice]}. ${votes}${cost}`)
    return true
  }
  if (!boardAllows(g, a, b, recapProposal(a, choice))) return false
  useYearAction(g, classesKey(a.id), 1)
  const before = classFactor(b)
  if (kind) b.classes = { kind, hi: b.share }
  else delete b.classes
  const after = planFactor(kind)
  b.sharePrice = Math.max(0.01, round2((b.sharePrice * after) / before))
  b.valuation = Math.round(b.sharePrice * b.sharesOut)
  syncSeats(g, a, b, boardOf(b))
  refreshValue(a, b)
  log(g, `I changed ${a.name} to ${CLASS_PHRASE[choice]}.`)
  notice(g, 'Share Classes', `${a.name} now has ${CLASS_PHRASE[choice]}. You hold ${pct(ownerVotes(b), 0)} of the votes. The price is ${formatPrice(b.sharePrice)}.`)
  return true
}
