// The seam (R4-E10a, C7): what society/ takes from the rest of the game, in one file. Today that is the person's axes. The acts
// need to know how honest a person is and how quick to anger; the one place that says so is `axesOfPerson(g, p)` of npc-state.ts
// (R4-S10), which reads the Met record of a person who began as a slot, else the axes of their trait words. Going through this file
// means a later release that moves the axes (R5's composer, R6's rivals) changes one import here and no act.
//
//   axesOf(g, p)     the five axes of a person, whole numbers 0 to 100, 50 neutral (world/axes.ts)
//   honestyOf(g, p)  the honesty axis: 0 a liar, 100 a person whose word holds
//   temperOf(g, p)   how quick to anger, 0 to 100: the other end of the steadiness axis (a hot-headed person is high)
//
// E10b adds the typical-income seam here (the loan cap and E12's fee both take it from this file). All of it is pure: no draw, no
// write, no life made, total on any person (the axes reader is). This file is the only one of society/ that imports npc-state.ts, which
// is what keeps the `society->life` pair to the two files the lead approved (cash.ts and npc-state.ts, X26).
import { axesOfPerson } from '../npc-state'
import type { GameState, Person } from '../types'
import type { Axes } from '../world/axes'

/** The five axes of a person. A new object each call. */
export function axesOf(g: Pick<GameState, 'world'>, p: Person): Axes {
  return axesOfPerson(g, p)
}

/** The honesty axis of a person, 0 to 100. */
export function honestyOf(g: Pick<GameState, 'world'>, p: Person): number {
  return axesOf(g, p).honesty
}

/** How quick to anger, 0 to 100: 100 less the steadiness axis. */
export function temperOf(g: Pick<GameState, 'world'>, p: Person): number {
  return 100 - axesOf(g, p).steadiness
}
