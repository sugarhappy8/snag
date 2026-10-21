// The sections of the Activities list (G.8). Pure data and one lookup, no imports: the list is regrouped at render time
// (regroupForDisplay, in the UI layer), never in the data, because five seeded tests pick actions by position in
// activitiesMenu.children and the data order must not move.

export type SectionId = 'health' | 'love' | 'money' | 'law' | 'travel' | 'fame' | 'home' | 'world' | 'more'

/** Top to bottom on screen. Do Anything sits above the first and Surrender below the last. */
export const SECTION_ORDER: readonly SectionId[] = ['health', 'love', 'money', 'law', 'travel', 'fame', 'home', 'world', 'more']

export const SECTION_LABEL: Readonly<Record<SectionId, string>> = {
  health: 'Health and Mind',
  love: 'Love and Social',
  money: 'Money and Games',
  law: 'Law and Crime',
  travel: 'Travel',
  fame: 'Fame and Media',
  home: 'Home and Shopping',
  world: 'World and Politics',
  more: 'More',
}

/** The 36 Activities rows (Do Anything and Surrender are placed by hand). An id that is not here lands in More. */
export const ACTIVITY_SECTION: Readonly<Record<string, SectionId>> = Object.freeze({
  doctor: 'health',
  mindBody: 'health',
  surgery: 'health',
  rehab: 'health',
  salon: 'health',
  pray: 'health',
  love: 'love',
  adoption: 'love',
  pets: 'love',
  pastimes: 'love',
  nightlife: 'love',
  'shared.projects': 'love',
  charity: 'love',
  zoo: 'love',
  casino: 'money',
  lottery: 'money',
  sweepstakes: 'money',
  computer: 'money',
  workshop: 'money',
  crime: 'law',
  corruption: 'law',
  lawsuit: 'law',
  surrender: 'law',
  identity: 'law',
  will: 'law',
  licenses: 'law',
  vacation: 'travel',
  emigrate: 'travel',
  fame: 'fame',
  socialMedia: 'fame',
  movies: 'fame',
  shopping: 'home',
  lifePriorities: 'home',
  thisYear: 'world',
  economy: 'world',
  'royal.court': 'world',
})

/** Roots whose long list is sectioned at render time. The menu lint (test/nav-kit.ts) does not ask these for headings in the data. */
export const SECTIONED_ROOTS: readonly string[] = ['activities']

/** Lists with fewer visible rows than this (prison has 5) are shown as they are. */
export const SECTION_MIN_ROWS = 13

const IDS: ReadonlySet<string> = new Set(SECTION_ORDER)

function fromTable(id: string): SectionId | null {
  return Object.prototype.hasOwnProperty.call(ACTIVITY_SECTION, id) ? ACTIVITY_SECTION[id]! : null
}

/** Where a row goes: its own `section` when that names a real section, else the table, else More. */
export function sectionOf(node: { id: string; section?: string }): SectionId {
  const named = typeof node.section === 'string' && IDS.has(node.section) ? (node.section as SectionId) : null
  return named ?? fromTable(node.id) ?? 'more'
}
