// Special Careers › Game Industry: work at game studios, make games (indie and AAA), and start
// your own game studio. Contract stub.
import type { GameState, MenuGroup, MenuNode } from '../types'

/** Special Careers › Game Industry. */
export const gameIndustryMenu: MenuGroup = {
  type: 'menu',
  id: 'gameIndustry',
  label: 'Game Industry',
  emoji: '\u{1F3AE}',
  subtitle: 'Make games, work at studios, start your own',
  visible: (g) => g.character.alive && !g.character.prison,
  children: (): MenuNode[] => [],
}

/** Occupation tab rows while the player has a game-industry job. */
export function gameDevJobNodes(_g: GameState): MenuNode[] {
  return []
}

/** Yearly hook: dev cycles, releases, reviews, sales, studio years. */
export function yearlyGameDev(_g: GameState): void {}

/** One compact line for the AI context ('' when nothing to say). */
export function gameDevSummary(_g: GameState): string {
  return ''
}
