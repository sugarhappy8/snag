// Share classes: the maths of who holds the votes. Economics stay one pool (BizState.share); the
// votes are derived from it and from the record in BizState.classes ({ kind, hi }, state.ts).
// board-state.ts seatPlan is the only place a stake becomes seats, and it reads ownerVotes here.
// A leaf module: it imports state.ts and util.ts only. Pure: nothing here reads g.rng or the clock.
import { diluteBusinessEquity, executiveEquity, readClasses, type BizState, type ClassKind, type ClassPlan } from './state'
import { clampN } from './util'

/** Votes a share carries: `hi` is the founders' class, `lo` the ordinary one. The only place these live. */
export const CLASS_VOTES: Readonly<Record<ClassKind, { hi: number; lo: number }>> = Object.freeze({
  ab: Object.freeze({ hi: 10, lo: 1 }),
  nv: Object.freeze({ hi: 1, lo: 0 }),
})

/** What the market takes off the price for fewer votes. The only place these live. */
export const CLASS_DISCOUNT: Readonly<Record<ClassKind, number>> = Object.freeze({ ab: 0.04, nv: 0.07 })

/** How a board weighs a change of structure (board-vote.ts 'recap'): one class is good governance, fewer votes is not. */
export const CLASS_MERIT: Readonly<Record<ClassKind | 'single', number>> = Object.freeze({ single: 0.3, ab: -1, nv: -1.3 })

/** What each structure is called in a sentence. */
export const CLASS_PHRASE: Readonly<Record<ClassKind | 'single', string>> = Object.freeze({
  single: 'one class of shares',
  ab: 'founder shares',
  nv: 'a non-voting float',
})

/**
 * The share structure that is live right now: the record, only while the company is listed, stands
 * alone and has shares out. A private company's record is a plan for its IPO; a division has none.
 */
export function activeClasses(b: BizState): ClassPlan | null {
  if (!b.public || b.group || !(b.sharesOut > 0)) return null
  return readClasses(b.classes)
}

/** The relatives' part of the company (they hold the founders' class). Damaged rows count as nothing. */
function familyPart(b: BizState): number {
  if (!Array.isArray(b.familyShares)) return 0
  let sum = 0
  for (const holder of b.familyShares) {
    const s = (holder as { share?: unknown } | null)?.share
    if (typeof s === 'number' && Number.isFinite(s) && s > 0) sum += s
  }
  return sum
}

/**
 * The part of the votes the owner holds, 0-1 and always finite. With no live record it is the
 * owner's share exactly. With one, the owner's founders'-class part (`hi`, never more than the
 * stake) and the relatives' shares carry the high weight, and everything else (the rest of the
 * owner's stake, executives, the float) the low one.
 */
export function ownerVotes(b: BizState): number {
  const s = clampN(b.share, 0, 1)
  const plan = activeClasses(b)
  if (!plan) return s
  const w = CLASS_VOTES[plan.kind]
  const fam = familyPart(b)
  const exec = executiveEquity(b)
  const out = Math.max(0, 1 - s - fam - exec)
  const mine = Math.min(plan.hi, s)
  const loMine = s - mine
  const total = w.hi * (mine + fam) + w.lo * (loMine + exec + out)
  const votes = (w.hi * mine + w.lo * loMine) / total
  if (!(total > 0) || !Number.isFinite(total) || !Number.isFinite(votes)) return s
  return clampN(votes, 0, 1)
}

/** The price factor of a structure: 1 for one class. */
export function planFactor(kind: ClassKind | null): number {
  return kind ? 1 - CLASS_DISCOUNT[kind] : 1
}

/** The price factor a company's live structure carries today. */
export function classFactor(b: BizState): number {
  return planFactor(activeClasses(b)?.kind ?? null)
}

/**
 * Scale the founders' class by `factor` (a buyback shrinks the company, so the owner's part of it
 * grows). A no-op without a valid record or with a factor that is not a number above 0.
 */
export function scaleFounders(b: BizState, factor: number): void {
  const plan = readClasses(b.classes)
  if (!plan || !Number.isFinite(factor) || !(factor > 0)) return
  b.classes = { kind: plan.kind, hi: clampN(plan.hi * factor, 0, 1) }
}

/** The founders' class can never be more than the owner's stake (a sale takes shares out of it). A no-op without a record. */
export function clampFounders(b: BizState): void {
  const plan = readClasses(b.classes)
  if (!plan) return
  b.classes = { kind: plan.kind, hi: Math.min(plan.hi, clampN(b.share, 0, 1)) }
}

/**
 * The founders' class as a whole, as a part of the company: the owner's founder shares (never more than the
 * stake) and every relative's shares. null without a live record. This is what an estate that splits the
 * stake must not grow (foundersWhole / keepFoundersWhole).
 */
export function foundersWhole(b: BizState): number | null {
  const plan = activeClasses(b)
  return plan ? Math.min(plan.hi, clampN(b.share, 0, 1)) + familyPart(b) : null
}

/**
 * The stake has been split between holders (an estate): the founders' class stays the `whole` it was. The
 * relatives' shares hold it by rule, so whatever they hold now is theirs and the owner's founder shares are
 * the rest (never below 0 or above the stake). A no-op without a valid record.
 */
export function keepFoundersWhole(b: BizState, whole: number): void {
  const plan = readClasses(b.classes)
  if (!plan || !Number.isFinite(whole)) return
  b.classes = { kind: plan.kind, hi: clampN(whole - familyPart(b), 0, clampN(b.share, 0, 1)) }
}

/**
 * The company as a purchase finds it: the founders' class is no more than the stake held now. A stake can
 * shrink without a sale (a hired CEO's equity grant, an inheritance) and leave `hi` above it; shares bought
 * afterwards are ordinary ones and must not bring those votes back. Returns `b` itself when nothing is above
 * the stake; otherwise a copy. Pure.
 */
export function foundersCapped(b: BizState): BizState {
  const plan = readClasses(b.classes)
  const held = clampN(b.share, 0, 1)
  if (!plan || plan.hi <= held) return b
  return { ...b, classes: { kind: plan.kind, hi: held } }
}

/**
 * The company as it would stand just after listing with `retain` of the owner's part kept and the
 * structure `kind` (null: one class), the way goPublic leaves it: the owner's stake, the relatives'
 * and the executives' parts thinned by `retain`, public, shares out, no group, and the whole of the
 * owner's stake in the founders' class. The company it is given is not changed; the copy shares
 * the parts listing does not touch, so treat it as read-only.
 */
export function afterIpo(b: BizState, retain: number, kind: ClassKind | null): BizState {
  const r = clampN(retain, 0, 1)
  const copy: BizState = {
    ...b,
    familyShares: Array.isArray(b.familyShares) ? b.familyShares.map((holder) => ({ ...holder })) : undefined,
    manager: b.manager ? { ...b.manager } : b.manager,
  }
  if (copy.familyShares === undefined) delete copy.familyShares
  diluteBusinessEquity(copy, r)
  copy.share = clampN(b.share * r, copy.familyShares?.length ? 0 : 0.01, 1)
  copy.public = true
  copy.sharesOut = Number.isFinite(b.sharesOut) ? Math.max(1, b.sharesOut) : 1
  delete copy.group
  if (kind) copy.classes = { kind, hi: copy.share }
  else delete copy.classes
  return copy
}

/** The owner's part of the votes just after listing (previews). */
export function votesAfterIpo(b: BizState, retain: number, kind: ClassKind | null): number {
  return ownerVotes(afterIpo(b, retain, kind))
}
