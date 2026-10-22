// The door into the effort engine (R3-E10, C.1): the one file a migrated system imports from (`from '../effort'`). Layer 2, so a domain
// above it reaches it with no contract.ts. It re-exports the contract of the track and writes nothing of its own: each name is the
// function or value of its own file, and the model, the constants and the steps of a migration are in docs/EFFORT.md.
//
// Left out on purpose: the small pieces `quote` is built from (factors.ts: the logit shifts, the attribution, the speed, the risks)
// and the shared number readers (num.ts). A system asks `quote` for the odds and never works a term out for itself.
//
// This file imports only its own folder. Nothing in the folder draws a random number or books a dollar, so importing it moves nothing.

// The shapes.
export type {
  CauseKind,
  EffortInput,
  EffortMode,
  Fx,
  Outcome,
  OutcomeKind,
  Posture,
  QualityCurve,
  Quote,
  Reason,
  Reveal,
  StepCtx,
  StepResult,
  Task,
  TaskSpec,
  TermKey,
  Worker,
} from './types'

// Every number that bounds the engine, and the words of the terms.
export * from './limits'

// What a kind of work is, and the know-how a field holds.
export { defineTask, isField, normalizeTask } from './task'
export { fadeKnowHow, knowHowOf, learnKnowHow, readKnowHow } from './knowhow'

// The two seams that cross a track (Knowledge binds the first, Fog the second).
export { EXACT_POLICY, bindRevealPolicy, bindRevealed, revealPolicyOf, revealedSink } from './hooks'
export type { RevealPolicy } from './hooks'

// The pure curves and the terms that come from the world.
export { boldOf, budgetQuality, crewRatio, knowBank, knowGain, knowOdds, laborOf, phiOf, rhoOf, softCeil, workerOutput } from './curves'
export { ceilingOf, rivalPts, spillPts } from './world'

// The odds, the years and the quality of a piece of work.
export { quote } from './engine'

// How a run came out, and what it taught.
export { causeOf, landQuality, resolve, step } from './step'
export type { ResolveOpts } from './step'
export { FX_CAPS, newFx, normalizeFx } from './fx'

// The player: ambition, posture, fatigue and the record they sit in.
export {
  POSTURE_LABELS,
  STAFF_DRIVE,
  YOU_KEY,
  ambitionOf,
  ambitionReveal,
  ambitionWord,
  blankYou,
  burnedOut,
  effortStrain,
  fatigueOf,
  hasYou,
  postureOf,
  readYou,
  recordBurnout,
  recordWin,
  setPosture,
  staffDrive,
  writeYou,
  youInput,
} from './persona'
export type { BurnoutResult, EffortYou } from './persona'

// The focus weeks, the posture rows and the yearly settle.
export { FOCUS_FULL_TEXT, FOCUS_KEYS, focusLeft, focusPreview, focusReason, focusUsed, isFocusKey, spendFocus } from './focus'
export type { FocusUse } from './focus'
export { postureNodes } from './menu'
export { effortModule, yearlyEffort } from './module'

// What the player reads.
export { causeLine, hintOdds, oddsChip, oddsLine, payoffLine, researchOdds, whyLines, whyNodes } from './why'
