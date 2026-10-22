// What the rest of the game may ask of the company domain without importing it (R2-K5, K.2a rule c).
//
// The company economy (business/economy.ts) sits in the 59-module business import cycle. The criminal economy (underworld.ts) once
// imported it for two calls, and that pulled crime and the underworld into the same cycle. A port cuts it: this file defines the
// call and what it does while nobody has bound it, business/economy.ts binds the real function when it loads, and the caller never
// learns where the answer comes from. Types only, so this file imports nothing at run time but the kernel's port facility.
import { definePort } from '../kernel/ports'
import type { Asset, GameState } from '../types'
import type { BizState } from './state'
import type { TechWave } from './tech-wave-factors'

/**
 * Re-price a company after its books changed outside the yearly step (the underworld pays laundered cash into a treasury): refresh
 * the valuation, then push the owner's stake into the asset. Bound by business/economy.ts. Unbound: does nothing, which is the
 * state of a test that never loaded the company economy; the app loads it with `aging`.
 */
export const revalueCompany = definePort('business.revalueCompany', (_a: Asset, _b: BizState): void => {})

/**
 * Research a domain disclosed to the world (R3-F3, spec 5.9): the research field (`fusion`, `ai.reasoning`; the ids of
 * world/frontier-fields.ts), the news name, how big the breakthrough is (0 to 1), a stable string for the milestone (one wave per
 * origin), the market (`world` when left out), the home country, and the asset id of the player's own company when it is theirs
 * (which earns the notice and the insider check).
 */
export interface ResearchDisclosure {
  field: string
  name: string
  size: number
  origin: string
  market?: string
  home?: string
  by?: string
}

/**
 * Disclose research as a tech wave of source `effort` (at most two a year from the player's side, one per origin, 64 stored, like
 * every other source) and return the stored wave, or null when the field has no wave kind, the size is under `EFFORT_WAVE_MIN`, or
 * the wave is refused. Bound by business/tech-waves.ts (`announceResearch`). Unbound: null, which is the state of a test that never
 * loaded the company economy; the app loads it with `aging`. Draws nothing from `g.rng`.
 */
export const discloseResearch = definePort('business.discloseResearch', (_g: GameState, _d: ResearchDisclosure): TechWave | null => null)
