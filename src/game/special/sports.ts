// Special Careers › Sports: every sport in one place. Team sports (the leagues in athlete.ts),
// individual sports and combat sports (MMA and more) live here. Contract stub: wraps the
// existing athlete career until the sports module fills it in.
import type { GameState, MenuGroup, MenuNode } from '../types'
import { athleteCareerMenu, athleteJobNodes, yearlyAthlete } from './athlete'

/** Special Careers › Sports. */
export const sportsCareerMenu: MenuGroup = {
  type: 'menu',
  id: 'sports',
  label: 'Sports',
  emoji: '\u{1F3C5}',
  subtitle: 'Team sports, individual sports and combat sports',
  visible: (g) => g.character.alive && !g.character.prison,
  children: (): MenuNode[] => [athleteCareerMenu],
}

/** Occupation tab rows while the player has a sports job. */
export function sportsJobNodes(g: GameState): MenuNode[] {
  return athleteJobNodes(g)
}

/** Yearly hook for every sports career. */
export function yearlySports(g: GameState): void {
  yearlyAthlete(g)
}
