// Era-aware words for the business modules: what exists in the company's country this year
// (history/timeline techAdoption) and the shared anachronism rules (events/era.ts), so a 1950s
// diner never runs a social-media blitz, launches a fitness app or hires an influencer manager.
// Pure helpers: they only read the year and the country, never the RNG.
import { anachronismsIn } from '../events/era'
import { techAdoption, type TechId } from '../history/timeline'
import type { GameState } from '../types'

/** True when a technology exists in this country this year (the same 2% bar as hasTech). */
export function bizHas(g: GameState, countryId: string, tech: TechId): boolean {
  return techAdoption(countryId, tech, g.year) >= 0.02
}

/** True when a text only mentions things that exist in this country this year. */
export function eraFits(g: GameState, countryId: string, text: string): boolean {
  return anachronismsIn(text, g.year, [countryId]).length === 0
}

/** The text, or '' when it mentions something that doesn't exist here yet (country notes...). */
export function eraNote(g: GameState, countryId: string, text: string): string {
  return eraFits(g, countryId, text) ? text : ''
}

/** Leadership roles that had another name before the technology behind them existed. */
const ROLE_ERA: Record<string, { tech: TechId; before: string }> = {
  'Social Media Whiz': { tech: 'socialMedia', before: 'Publicity Whiz' },
  'Influencer Manager': { tech: 'socialMedia', before: 'Publicity Manager' },
}

/** A role's title in this country and year ('Publicity Whiz' in 1965, 'Social Media Whiz' today). */
export function roleTitle(g: GameState, countryId: string, title: string): string {
  const e = ROLE_ERA[title]
  return e && !bizHas(g, countryId, e.tech) ? e.before : title
}

/** True when a stored staff role is this role, under either of its names. */
export function sameRole(stored: string, title: string): boolean {
  return stored === title || ROLE_ERA[title]?.before === stored
}
