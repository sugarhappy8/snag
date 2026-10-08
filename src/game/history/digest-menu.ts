// The "This Year" menu: one card for the year being lived, with its culture, what everyday things cost
// and which technology has reached the player's country. It is a plain MenuGroup that the Activities menu
// (or any menu) lists; it never touches the game's RNG or state. Real history only (not the present
// year or the future, which have no digest).
import { getCountry } from '../world'
import type { GameState, MenuGroup, MenuNode } from '../types'
import { thisYearNodes } from './digest'
import { HISTORY_START, isHistorical, TECH, techOdds, type TechId } from './timeline'

/** How widespread a technology was in the player's country this year, in words. */
export function adoptionWord(share: number): string {
  if (share < 0.02) return ''
  if (share < 0.08) return 'a rarity: only a few households'
  if (share < 0.3) return 'spreading to better-off households'
  if (share < 0.7) return 'in many homes'
  return 'almost everywhere'
}

/** The technologies that exist where the player lives this year, newest first, with how common they are. */
export function technologyRows(g: GameState): MenuNode[] {
  const rows: { tech: TechId; share: number }[] = []
  for (const id of Object.keys(TECH) as TechId[]) {
    const share = techOdds(g, id)
    if (share >= 0.02) rows.push({ tech: id, share })
  }
  rows.sort((a, b) => TECH[b.tech].invented - TECH[a.tech].invented)
  if (!rows.length) return [{ type: 'info', id: 'year.tech.none', emoji: '\u{1F56F}\u{FE0F}', text: `Life in ${getCountry(g.character.countryId).name} still runs on muscle, horses, lamps and letters.` }]
  const nodes: MenuNode[] = [{ type: 'heading', id: 'year.techH', label: `New in ${getCountry(g.character.countryId).name}` }]
  for (const r of rows.slice(0, 8)) {
    const label = TECH[r.tech].label
    nodes.push({ type: 'info', id: `year.tech.${r.tech}`, emoji: '\u{1F527}', text: `${label.charAt(0).toUpperCase()}${label.slice(1)}: ${adoptionWord(r.share)}` })
  }
  return nodes
}

/** The year being lived (HISTORY_START to the year before the present), as a menu card. */
export const thisYearMenu: MenuGroup = {
  type: 'menu',
  id: 'thisYear',
  label: 'This Year',
  emoji: '\u{1F4C5}',
  subtitle: (g) => `What ${g.year} looked and cost like`,
  visible: (g) => g.character.alive && isHistorical(g.year) && g.year >= HISTORY_START,
  header: (g) => `${g.year} in ${getCountry(g.character.countryId).name}: prices are approximate, shown in the money of your game.`,
  children: (g) => [...thisYearNodes(g), ...technologyRows(g)],
}
