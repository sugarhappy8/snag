// The module `society.acts` (R4-E10a, X42, C14): the yearly entry of the social acts, in the `close` phase of the aging seam at order 6,
// right after the edge step (`world.edges`, close 5) and before the milestones (close 10), so the acts of the year see edges that have
// faded and legacy records that have been followed. ONE entry, so its entry id is the module id the group tables use.
//
// It runs once a year on a life the social stamp marks and does nothing at all on any other life. It is idempotent by the stamp
// `social.ay` (written with patchSocial, the one writer): a second call in the year, a replay, a clone, a reload and a Time Machine jump
// all see the same stamp and change nothing; a stamp from the future (a hostile save) is run once and put right.
//
// The step list below was EMPTY in R4-E10a. The tasks of the acts lane append their steps in this order, each inside this one entry:
//   R4-E10b   serviceDebts: the interest and the service of the loans the player owes (kind 0 only; L7 serves the divorce debts)
//   R4-E11    the leak pass, then the mentor settle (the module's `facts` then declare social.leak)
//   R4-E12    stepFeuds (and social.feud)
// A step takes the state and draws only from the stream `social` (actRoll in society/acts.ts; the lines it logs come from the text kit,
// which has a stream of its own), books money through cash.moveCash and writes through putEdge; it must be idempotent on its own,
// because the stamp is written after the list has run.
//
// Layer 3 (society). modules/index.ts registers it.
import type { ModuleDef } from '../kernel/registry'
import type { GameState } from '../types'
import { SEEN_MAX, SEEN_MIN } from '../world/rows'
import { patchSocial, readSocial } from '../world/social'
import { serviceDebts } from './debt'

/** One yearly step of the acts. */
type Step = (g: GameState) => void

/** The steps, in order. A function and not a list: a module-level const would read the imports while this module loads (layer rule d). */
const steps = (): readonly Step[] => [serviceDebts]

const isYear = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= SEEN_MIN && x <= SEEN_MAX

/** The yearly entry. Idempotent by social.ay; a no-op for a life that is not stamped. */
export function yearlyActs(g: GameState): void {
  const stamp = readSocial(g)
  if (stamp === null) return
  const year = g.year
  if (!isYear(year) || stamp.ay === year) return
  for (const step of steps()) step(g)
  patchSocial(g, { ay: year })
}

/** The module: one aging entry in the close phase, order 6. */
export const societyModule: ModuleDef = {
  id: 'society.acts',
  layer: 3,
  yearly: [{ seam: 'aging', phase: 'close', order: 6, run: yearlyActs }],
}
