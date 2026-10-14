// Choosing a share structure: for a private company a plan for its IPO (free, any time), for a listed one a
// recap the board votes on once a year. The maths of the votes is share-classes.ts; the control rule is
// board-state.ts (controlsFor). This file holds the choice itself: what it would do, why it is blocked, and
// the change. classesNode is the "Share Classes" submenu on top of it: one row per structure.
import { formatPrice, log, notice, useYearAction, yearActionsUsed } from '../core'
import type { Asset, GameState, MenuAction, MenuGroup } from '../types'
import { boardAllows, passOdds, type Proposal } from './board'
import { boardOf, controlsFor, syncSeats } from './board-state'
import { groupIdOf } from './conglomerate-state'
import { refreshValue } from './economy'
import { ipoRetain } from './exit'
import { manageBlock } from './gate'
import { rawStake } from './own-listing'
import { afterIpo, CLASS_MERIT, CLASS_PHRASE, CLASS_VOTES, classFactor, ownerVotes, planFactor, votesAfterIpo } from './share-classes'
import { FLOAT_DEFAULT } from './share-structure'
import { bizOf, findBusiness, readBiz, readClasses, type BizState, type ClassKind } from './state'
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

// ---------------------------------------------------------------------------
// The menu: Capital & Ownership and beside Go Public. Every label, subtitle and reason here is read from
// the live state each time it is shown, so a node held across a change shows the change.

const CHOICE_LABEL: Readonly<Record<ClassChoice, string>> = Object.freeze({
  single: 'One Class of Shares',
  ab: 'Founder Class (A/B)',
  nv: 'Non-Voting Float',
})

const CHOICE_SUBTITLE: Readonly<Record<ClassChoice, string>> = Object.freeze({
  single: 'One class: every share has one vote',
  ab: `Founder class: B has ${CLASS_VOTES.ab.hi} votes, A has ${CLASS_VOTES.ab.lo}`,
  nv: 'Non-voting float: the public has no vote',
})

const EMOJI = '🗳️'

interface Live {
  a: Asset
  b: BizState
}

/** The company as an action will see it: normalized, with the stake exactly as stored (a sale can leave under 1%). */
function liveOf(g: GameState, id: string): Live | null {
  const a = findBusiness(g, id)
  return a ? { a, b: { ...readBiz(g, a), share: rawStake(g, a) } } : null
}

/** What a row says under its name: the votes you'd hold and what the market does to the price. */
function rowSubtitle(o: ClassOption, listed: boolean): string {
  const votes = pct(o.votes, 0)
  if (o.current) return listed ? `Current. You hold ${votes} of the votes.` : `Current. You'd hold ${votes} of the votes after a ${FLOAT_DEFAULT}% float.`
  const head = `You'd hold ${votes} of the votes${listed ? '' : ` after a ${FLOAT_DEFAULT}% float`}.`
  if (listed && o.factor > 1) return `${head} The price rises about ${pct(o.factor - 1, 0)}.`
  return `${head} ${o.factor < 1 ? `The market pays ${pct(1 - o.factor, 0)} less.` : 'No price cost.'}`
}

/** The question before a vote: who decides, and which way the price goes. */
function rowConfirm(name: string, choice: ClassChoice, factor: number): string {
  const move = factor === 1 ? '' : ` The price ${factor < 1 ? 'falls' : 'rises'} about ${pct(Math.abs(1 - factor), 0)}.`
  return `Change ${name} to ${CLASS_PHRASE[choice]}? The board votes first.${move}`
}

function choiceRow(id: string, choice: ClassChoice, listed: boolean): MenuAction {
  const row: MenuAction = {
    type: 'action',
    id: `biz.classes.${id}.${choice}`,
    label: CHOICE_LABEL[choice],
    emoji: EMOJI,
    subtitle: (g) => {
      const live = liveOf(g, id)
      return live ? rowSubtitle(classOption(g, live.a, live.b, choice), live.b.public) : ''
    },
    disabledReason: (g) => {
      const live = liveOf(g, id)
      return live ? classBlock(g, live.a, live.b, choice) : 'You no longer own this.'
    },
    run: (g) => {
      changeClasses(g, id, choice)
    },
  }
  // Only a listed company asks its board first. A private company's choice is a plan: no question.
  if (listed) {
    row.confirm = (g) => {
      const live = liveOf(g, id)
      if (!live || !live.b.public) return null
      return rowConfirm(live.a.name, choice, classOption(g, live.a, live.b, choice).factor)
    }
  }
  return row
}

/**
 * The "Share Classes" submenu of a company that stands alone: one row per structure, each saying what it
 * would do to your votes and to the price. Private: sets the plan the IPO will use. Listed: a board
 * vote, once a year. The caller leaves it out for a division of a group.
 */
export function classesNode(a: Asset): MenuGroup {
  return {
    type: 'menu',
    id: `biz.classes.${a.id}`,
    label: 'Share Classes',
    emoji: EMOJI,
    subtitle: (g) => {
      const live = liveOf(g, a.id)
      return CHOICE_SUBTITLE[live ? currentChoice(live.b) : 'single']
    },
    header: (g) => {
      const live = liveOf(g, a.id)
      if (live?.b.public) return 'Changing the classes takes a board vote, once a year. The share price moves when it passes.'
      return `Pick how ${live?.a.name ?? a.name}'s shares are sold at the IPO. Investors pay less for shares with fewer votes.`
    },
    children: (g) => {
      const live = liveOf(g, a.id)
      return live ? CLASS_CHOICES.map((choice) => choiceRow(a.id, choice, live.b.public)) : []
    },
  }
}
