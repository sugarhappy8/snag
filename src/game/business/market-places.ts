// Names and flags for the places the market screens mention: every country in the game plus the
// handful of off-map countries real companies trade in or come from (the game does not model them,
// but a rival's profile may say it is headquartered in Luxembourg or sells in Ghana).
import { COUNTRIES, flagEmoji, getCountry, type Continent } from '../world'

const OFF_MAP: Record<string, string> = {
  lu: 'Luxembourg', la: 'Laos', bg: 'Bulgaria', na: 'Namibia', mz: 'Mozambique', al: 'Albania', by: 'Belarus', ci: 'Ivory Coast',
  om: 'Oman', gh: 'Ghana', ly: 'Libya', bw: 'Botswana', mu: 'Mauritius', lk: 'Sri Lanka', mv: 'the Maldives', bb: 'Barbados',
  tz: 'Tanzania', rw: 'Rwanda', hn: 'Honduras', bh: 'Bahrain', mm: 'Myanmar', lr: 'Liberia', kh: 'Cambodia', lt: 'Lithuania',
}

const OFF_MAP_CONTINENT: Record<string, Continent> = {
  lu: 'Europe', la: 'Asia', bg: 'Europe', na: 'Africa', mz: 'Africa', al: 'Europe', by: 'Europe', ci: 'Africa',
  om: 'Middle East', gh: 'Africa', ly: 'Africa', bw: 'Africa', mu: 'Africa', lk: 'Asia', mv: 'Asia', bb: 'North America',
  tz: 'Africa', rw: 'Africa', hn: 'North America', bh: 'Middle East', mm: 'Asia', lr: 'Africa', kh: 'Asia', lt: 'Europe',
}

const IN_GAME = new Set(COUNTRIES.map((c) => c.id))

/** True when the game models this country (it has a market, a regime and a name pool). */
export function onMap(id: string): boolean {
  return IN_GAME.has(id)
}

/** 'Japan', 'Luxembourg', or the code when nothing is known. */
export function placeName(id: string): string {
  if (IN_GAME.has(id)) return getCountry(id).name
  return OFF_MAP[id] ?? id.toUpperCase()
}

/** The flag emoji of any two-letter country code. */
export function placeFlag(id: string): string {
  return /^[a-z]{2}$/.test(id) ? flagEmoji(id) : '\u{1F3F3}\u{FE0F}'
}

/** Geographic region for both modelled countries and named off-map rival headquarters. */
export function placeContinent(id: string): Continent {
  return IN_GAME.has(id) ? getCountry(id).continent : OFF_MAP_CONTINENT[id] ?? 'Asia'
}

/** True for places a rival may be headquartered (modelled or off-map but named). */
export function knownPlace(id: string): boolean {
  return IN_GAME.has(id) || id in OFF_MAP
}
