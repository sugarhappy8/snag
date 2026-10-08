// Special talents: gifts the player can pick before birth (New Life › Special Talents, up to
// MAX_START_TALENTS) on top of the one talent a kid may discover in childhood (life.ts TALENTS).
// Each talent has a perk that the owning module applies by asking hasTalent(g, id):
//   Business  → purple hints (best price/production, best event choices, hot industries) in every
//               company you run, and a little extra growth
//   Investing → purple hints on which stocks, funds and coins look set to rise next year
//   Acting / Music / Comedy / Modeling / Writing / Art → faster skill growth, better roles and deals
//   Athletics / Gaming → faster training, better scouting / esports ranks and better games
//   Academics / Programming → faster smarts / coding growth, better grades and projects
//   Cooking / Crime / Leadership → chef and food businesses, crime success, elections and morale
//   MainCharacter → every talent at once (hasTalent is true for any id) and mastery of anything
//               after the first time (mastery.ts); it takes one of the MAX_START_TALENTS slots
// Purple hints are shown with ChoiceOption.hint, MenuBase.hint and AnnualReportData.talentHint.
import type { GameState } from './types'

export type TalentId =
  | 'Business'
  | 'Investing'
  | 'Acting'
  | 'Music'
  | 'Athletics'
  | 'Art'
  | 'Writing'
  | 'Comedy'
  | 'Academics'
  | 'Modeling'
  | 'Cooking'
  | 'Crime'
  | 'Programming'
  | 'Leadership'
  | 'Gaming'
  | 'MainCharacter'

export interface SpecialTalentDef {
  id: TalentId
  label: string
  emoji: string
  /** One line for the New Life picker: what the perk does in play. */
  perk: string
}

/** Every talent the player can pick before birth. Ids match life.ts TALENTS where both exist. */
export const SPECIAL_TALENTS: readonly SpecialTalentDef[] = [
  { id: 'Business', label: 'Business', emoji: '\u{1F4BC}', perk: 'Purple hints in every company you run (best price and output, crisis calls, hot industries) and faster growth.' },
  { id: 'Investing', label: 'Investing', emoji: '\u{1F4C8}', perk: 'Purple hints on which stocks, funds and coins look set to rise next year, if any. Gut feelings, not guarantees.' },
  { id: 'Acting', label: 'Acting', emoji: '\u{1F3AD}', perk: 'Acting skill grows much faster and casting directors notice: better auditions and bigger roles.' },
  { id: 'Music', label: 'Music', emoji: '\u{1F3B5}', perk: 'Learn instruments and singing faster; better gigs, record deals and chart runs.' },
  { id: 'Athletics', label: 'Athletics', emoji: '\u{1F3C3}', perk: 'Train faster, get scouted earlier and perform better in every sport.' },
  { id: 'Art', label: 'Art', emoji: '\u{1F3A8}', perk: 'Your art improves faster and sells for more; art contests come easier.' },
  { id: 'Writing', label: 'Writing', emoji: '\u{270D}\u{FE0F}', perk: 'Books, essays and scripts come out better and sell more.' },
  { id: 'Comedy', label: 'Comedy', emoji: '\u{1F602}', perk: 'Funnier sets and faster fame in comedy; charm in interviews and on dates.' },
  { id: 'Academics', label: 'Academics', emoji: '\u{1F9E0}', perk: 'Smarts grow faster; better grades, exams, scholarships and university offers.' },
  { id: 'Modeling', label: 'Modeling', emoji: '\u{1F484}', perk: 'Looks fade more slowly and modeling agencies come looking for you.' },
  { id: 'Cooking', label: 'Cooking', emoji: '\u{1F373}', perk: 'Chef careers take off faster and your food businesses earn better reviews.' },
  { id: 'Crime', label: 'Crime', emoji: '\u{1F977}', perk: 'Crimes succeed more often and you get caught less.' },
  { id: 'Programming', label: 'Programming', emoji: '\u{1F4BB}', perk: 'Coding skill grows faster; better projects, apps and tech jobs.' },
  { id: 'Leadership', label: 'Leadership', emoji: '\u{1F3DB}\u{FE0F}', perk: 'Win elections and promotions more easily; people you manage are happier.' },
  { id: 'Gaming', label: 'Gaming', emoji: '\u{1F3AE}', perk: 'Climb esports ranks faster and make better video games.' },
  { id: 'MainCharacter', label: 'Main Character Syndrome', emoji: '\u{1F31F}', perk: 'You have every talent, and anything you do once, you master.' },
]

/** The id of the talent that counts as every other talent. */
export const MAIN_CHARACTER: TalentId = 'MainCharacter'

/** Every talent a character can have besides Main Character Syndrome itself. */
export const ALL_TALENT_IDS: readonly TalentId[] = SPECIAL_TALENTS.filter((t) => t.id !== MAIN_CHARACTER).map((t) => t.id)

/** How many special talents a new life may start with. */
export const MAX_START_TALENTS = 3

/** Shown before every purple hint so players learn to spot them. */
export const HINT_EMOJI = '\u{1F52E}'

export function isTalentId(id: unknown): id is TalentId {
  return typeof id === 'string' && SPECIAL_TALENTS.some((t) => t.id === id)
}

export function specialTalent(id: string): SpecialTalentDef | undefined {
  return SPECIAL_TALENTS.find((t) => t.id === id)
}

/** Player-facing name for a talent id, including ids whose label is not the raw save key. */
export function talentLabel(id: string): string {
  return specialTalent(id)?.label ?? id
}

/**
 * Clean a list of picks (New Life options, an old or hand-edited save): known ids only, no
 * duplicates, at most `max`, in the order given.
 */
export function normalizeTalents(list: unknown, max: number = MAX_START_TALENTS): TalentId[] {
  if (!Array.isArray(list)) return []
  const out: TalentId[] = []
  for (const id of list) {
    if (out.length >= max) break
    if (isTalentId(id) && !out.includes(id)) out.push(id)
  }
  return out
}

/** Talents picked before birth (or inherited from a parent's picks), without the discovered one. */
export function pickedTalents(g: GameState): TalentId[] {
  return normalizeTalents(g.character.talents, SPECIAL_TALENTS.length)
}

/** The talents named on the character: picked before birth plus the one discovered in childhood. */
function namedTalents(g: GameState): string[] {
  const c = g.character
  const out: string[] = Array.isArray(c.talents) ? c.talents.filter((t): t is string => typeof t === 'string') : []
  if (c.talent && !out.includes(c.talent)) out.push(c.talent)
  return [...new Set(out)]
}

/** True when the character has Main Character Syndrome: every talent, and mastery of anything done once. */
export function hasMainCharacter(g: GameState): boolean {
  return namedTalents(g).includes(MAIN_CHARACTER)
}

/**
 * The talents to name in summaries, the profile, the CV and the obituary: picked before birth
 * plus the one discovered in childhood. Main Character Syndrome stands alone (not 15 chips).
 */
export function characterTalents(g: GameState): string[] {
  const named = namedTalents(g)
  return named.includes(MAIN_CHARACTER) ? [MAIN_CHARACTER] : named
}

/** Same as characterTalents (kept for readability where the profile shows chips). */
export function shownTalents(g: GameState): string[] {
  return characterTalents(g)
}

/**
 * Every talent the character effectively has, for code that matches talents by name: Main
 * Character Syndrome plus every special talent id.
 */
export function effectiveTalents(g: GameState): string[] {
  const named = namedTalents(g)
  return named.includes(MAIN_CHARACTER) ? [...new Set([MAIN_CHARACTER, ...ALL_TALENT_IDS, ...named])] : named
}

/**
 * True when the character has this talent (picked before birth or discovered as a kid). Main
 * Character Syndrome has every talent, including childhood ones that are not special talents.
 */
export function hasTalent(g: GameState, id: TalentId | string): boolean {
  const named = namedTalents(g)
  return named.includes(id) || named.includes(MAIN_CHARACTER)
}

/** `mult` when the character has the talent, else 1 (for skill growth, odds, prices...). */
export function talentMult(g: GameState, id: TalentId | string, mult: number): number {
  return hasTalent(g, id) ? mult : 1
}

/** A purple hint string for ChoiceOption.hint / MenuBase.hint ('' when the talent is missing). */
export function talentHint(g: GameState, id: TalentId | string, text: string): string {
  return hasTalent(g, id) ? `${HINT_EMOJI} ${text}` : ''
}

/** The emoji for a talent id ('🌟' for anything unknown). */
export function talentEmoji(id: string): string {
  return specialTalent(id)?.emoji ?? '\u{1F31F}'
}
