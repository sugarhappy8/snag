// Who has a computer, and may use it. Moved verbatim out of computer.ts (R2-K5, cuts 1 to 5): the Computer menu imports its own
// children (dev, money, online), and each child asked the menu file back for these predicates, which closed an import cycle between
// them. The predicates need only the game state, so they live here, and this file imports only types. computer.ts re-exports them, so the
// menus, aging and the tests still import them from './computer'.
import type { Asset, GameState } from '../types'

const COMPUTER_NAME = /\b(laptop|gaming pc|computer|desktop|pc|macbook|workstation|chromebook)\b/i

/** Assets that count as a computer (the Electronics Store's Laptop and Gaming PC, and similar). */
export function isComputer(a: Asset): boolean {
  return (a.kind === 'other' || a.kind === 'collectible') && COMPUTER_NAME.test(a.name) && a.condition > 0
}

export function computerAsset(g: GameState): Asset | undefined {
  return g.assets.find(isComputer)
}

export function ownsComputer(g: GameState): boolean {
  return !!computerAsset(g)
}

/**
 * Parents (or a court) can take the computer away: g.flags.computerLockedUntil = the age it comes
 * back. Returns a reason while it's locked, else null.
 */
export function computerLocked(g: GameState): string | null {
  const until = g.flags.computerLockedUntil
  if (typeof until !== 'number' || g.character.age >= until) return null
  const who = typeof g.flags.computerLockedBy === 'string' ? g.flags.computerLockedBy : 'Your parents'
  return `${who} took your computer away until you're ${until}.`
}

/** True when the player has a computer they can actually use right now. */
export function canUseComputer(g: GameState): boolean {
  return ownsComputer(g) && !computerLocked(g)
}
