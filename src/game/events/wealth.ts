// Being rich, felt: once you have real money the people around you notice. Kids want pocket
// money, cars, a house and vacation money; friends and family ask for loans and help. Requests
// scale with your net worth and the era's prices; how you answer shapes relationships (and a
// spoiled kid).
//
// CONTRACT STUB (lead): the wealth builder implements this file. The yearly hook is already
// registered in aging.ts YEARLY_HOOKS (after finance).
import type { GameState } from '../types'

/** Yearly hook: maybe queue this year's money requests. No-op when nobody would ask. */
export function yearlyWealth(_g: GameState): void {}
