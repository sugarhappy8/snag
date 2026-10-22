// What the rest of the game may ask of the company domain without importing it (R2-K5, K.2a rule c).
//
// The company economy (business/economy.ts) sits in the 59-module business import cycle. The criminal economy (underworld.ts) once
// imported it for two calls, and that pulled crime and the underworld into the same cycle. A port cuts it: this file defines the
// call and what it does while nobody has bound it, business/economy.ts binds the real function when it loads, and the caller never
// learns where the answer comes from. Types only, so this file imports nothing at run time but the kernel's port facility.
import { definePort } from '../kernel/ports'
import type { Asset } from '../types'
import type { BizState } from './state'

/**
 * Re-price a company after its books changed outside the yearly step (the underworld pays laundered cash into a treasury): refresh
 * the valuation, then push the owner's stake into the asset. Bound by business/economy.ts. Unbound: does nothing, which is the
 * state of a test that never loaded the company economy; the app loads it with `aging`.
 */
export const revalueCompany = definePort('business.revalueCompany', (_a: Asset, _b: BizState): void => {})
