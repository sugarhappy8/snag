// Musician tables and pure era helpers. This file imports nothing from the game and holds no money text:
// every number here is a constant present-year dollar amount or a rate, and the text that shows them is
// built by the callers through money() at call time (test/currency-static.test.ts). All tuning lives here.

export type FormatId = 'shellac' | 'vinyl' | 'tape' | 'cd' | 'download' | 'stream'
export type SampleMode = 'original' | 'cleared' | 'risky'
export type TourTierId = 'club' | 'theater' | 'arena' | 'stadium'

// ---------------------------------------------------------------------------
// Genres and release types (moved verbatim from music.ts)

export const GENRES: Record<string, string[]> = {
  Pop: ['Bubblegum', 'Dance', 'Disco', 'Electro', 'Synth', 'Psychedelic Pop', 'Sing-Along'],
  Rock: ['Classic Rock', 'Hard Rock', 'Punk', 'Rockabilly', 'Southern Rock', 'Screamo', 'Ska'],
  Rap: ['Trap', 'Old School Rap', 'Conscious Rap', 'Mumble Rap', 'West Coast', 'Crunk', 'Emo Rap'],
  'R&B': ['Soul', 'Funk', 'Motown', 'Smooth Jazz', 'Contemporary R&B', 'Doo Wop', 'Blues'],
  Country: ['Bluegrass', 'Honky-Tonk', 'Outlaw', 'Country Rock', 'Hillbilly', 'Urban Cowboy', 'Dirt Road'],
  Alternative: ['Grunge', 'Emo', 'Indie Folk', 'New Wave', 'Garage', 'Art Punk', 'Steampunk'],
  Reggae: ['Dancehall', 'Dub', 'Afro-Beat', 'Reggae Fusion', 'Reggaeton', 'Rasta', 'Caribbean'],
  Folk: ['Fable', 'Folk Punk', 'Neofolk', 'Progressive Folk', 'Myth', 'Legend', 'Psychedelic'],
  Worship: ['Gospel', 'Hymn', 'Praise', 'Spiritual', 'Worship Pop', 'Worship Rock', 'Worship Hip Hop'],
}
export const GENRE_NAMES = Object.keys(GENRES)

export const RELEASE_TYPES = [
  { id: 'studio', label: 'Studio Album', emoji: '\u{1F4BF}', mult: 1, pay: 1 },
  { id: 'single', label: 'Single', emoji: '\u{1F3B5}', mult: 0.45, pay: 0.45 },
  { id: 'live', label: 'Live Album', emoji: '\u{1F3DF}\u{FE0F}', mult: 0.5, pay: 0.8 },
  { id: 'compilation', label: 'Compilation', emoji: '\u{1F4C0}', mult: 0.6, pay: 0.8 },
]

export const CERTS: [number, string][] = [
  [10_000_000, 'Diamond'],
  [2_000_000, 'Double Platinum'],
  [1_000_000, 'Platinum'],
  [500_000, 'Gold'],
]

// ---------------------------------------------------------------------------
// Era gates for genres and subgenres. A genre or subgenre not listed is open in every year.

/** The first year a genre can be picked or charted (a genre that is not listed is open in every year). */
export const GENRE_FROM: Record<string, number> = { Rock: 1954, Reggae: 1964, Rap: 1979, Alternative: 1980 }

/** The first year a subgenre can be picked. */
export const SUBGENRE_FROM: Record<string, number> = {
  Rockabilly: 1954,
  Ska: 1964,
  Disco: 1974,
  Punk: 1975,
  Electro: 1981,
  Grunge: 1989,
  Reggaeton: 1995,
  Crunk: 1996,
  Trap: 2003,
  'Mumble Rap': 2014,
}

/** The genres open in a year, in the original order. A year before every gate still leaves the open ones. */
export function genresAt(year: number): string[] {
  const open = GENRE_NAMES.filter((name) => (GENRE_FROM[name] ?? 0) <= year)
  return open.length > 0 ? open : [...GENRE_NAMES]
}

/** The subgenres of a genre open in a year, in the original order; the whole list if the filter would empty it. */
export function subgenresAt(genre: string, year: number): string[] {
  const all = GENRES[genre] ?? []
  const open = all.filter((name) => (SUBGENRE_FROM[name] ?? 0) <= year)
  return open.length > 0 ? open : [...all]
}

// ---------------------------------------------------------------------------
// Formats

/** anchors are (year, share) pairs read at the shifted year, flat outside; stream has none (techAdoption). */
export interface FormatDef {
  id: FormatId
  anchors: [number, number][]
  gross: number // dollars of retail a unit (one album-equivalent: 1,500 streams)
  cost: number // pressing, distribution, collection and publishing, as a share of gross
  k: number // the yearly tail: units a year later as a share of this year's
}

export const FORMATS: Record<FormatId, FormatDef> = {
  shellac: { id: 'shellac', anchors: [[1900, 1], [1948, 0.85], [1962, 0]], gross: 7, cost: 0.38, k: 0.25 },
  vinyl: { id: 'vinyl', anchors: [[1948, 0], [1958, 0.6], [1972, 0.8], [1992, 0.05], [2008, 0.01], [2025, 0.07]], gross: 12, cost: 0.34, k: 0.38 },
  tape: { id: 'tape', anchors: [[1966, 0], [1986, 0.5], [2002, 0]], gross: 9, cost: 0.29, k: 0.33 },
  cd: { id: 'cd', anchors: [[1982, 0], [1999, 0.85], [2014, 0.2], [2025, 0.06]], gross: 8, cost: 0.26, k: 0.42 },
  download: { id: 'download', anchors: [[2003, 0], [2010, 0.25], [2025, 0.02]], gross: 6.5, cost: 0.14, k: 0.42 },
  stream: { id: 'stream', anchors: [], gross: 6, cost: 0.08, k: 0.58 },
}

// ---------------------------------------------------------------------------
// Labels

export interface RosterLabel {
  id: string
  name: string
  tier: 0 | 1 | 2 | 3
  from: number
  countries?: readonly string[] // absent: open in every country
}

/** A stable key for a label name: lower-case, each run outside a-z and 0-9 becomes one '-', trimmed of '-', cut to 40. */
export function labelId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
}

const label = (name: string, tier: 0 | 1 | 2 | 3, from: number, countries?: readonly string[]): RosterLabel => ({ id: labelId(name), name, tier, from, ...(countries ? { countries } : {}) })

/** The invented roster (tested against allBrands). Tiers 0 to 2 are open in every country; majors are national. */
export const LABEL_ROSTER: readonly RosterLabel[] = [
  label('Garage Door Records', 0, 1965),
  label('Indigo Basement Music', 0, 1985),
  label('Echo Chamber Records', 1, 1950),
  label('Big Noise Music', 1, 1975),
  label('Velvet Records', 2, 1925),
  label('Platinum Peak Entertainment', 2, 1955),
  label('Meridian Sound Group', 3, 1900, ['us']),
  label('Crown & Anchor Music Group', 3, 1900, ['gb', 'ca', 'au']),
  label('Pacific Rim Music Co', 3, 1951, ['jp', 'kr']),
]

/** The artist's base share of net by label tier: 0.16 x [0.9, 1, 1.12, 1.25]. */
export const ROYALTY_BASE: readonly [number, number, number, number] = [0.16 * 0.9, 0.16 * 1, 0.16 * 1.12, 0.16 * 1.25]

// ---------------------------------------------------------------------------
// Touring

export interface TourTierDef {
  id: TourTierId
  seats: number
  shows: number
  minPop: number
  crew: number // heads
  travel: number // dollars a show
  production: number // dollars a show
  from: number // first year the tier exists
  wealth: number // the country's wealth needed
}

export const TOUR_TIERS: Record<TourTierId, TourTierDef> = {
  club: { id: 'club', seats: 500, shows: 24, minPop: 10, crew: 4, travel: 1_500, production: 1_000, from: 0, wealth: 0 },
  theater: { id: 'theater', seats: 2_500, shows: 24, minPop: 30, crew: 10, travel: 10_000, production: 18_000, from: 0, wealth: 0 },
  arena: { id: 'arena', seats: 15_000, shows: 30, minPop: 55, crew: 40, travel: 60_000, production: 180_000, from: 1955, wealth: 0.3 },
  stadium: { id: 'stadium', seats: 55_000, shows: 20, minPop: 75, crew: 120, travel: 200_000, production: 700_000, from: 1965, wealth: 0.5 },
}

/** Dollars a crew head a show. */
export const CREW_RATE = 300

// ---------------------------------------------------------------------------
// Ceremonies

export interface Ceremony {
  id: string
  country: string // a country id, or '*' for every other country
  name: string
  from: number
}

/** The invented ceremonies (tested against allBrands). */
export const CEREMONIES: readonly Ceremony[] = [
  { id: 'golden-record', country: 'us', name: 'Golden Record Award', from: 1959 },
  { id: 'maple-disc', country: 'ca', name: 'Maple Disc', from: 1970 },
  { id: 'silver-disc', country: 'gb', name: 'Silver Disc', from: 1977 },
  // The spec drafted "Southern Cross" here, but that is a real brand in allBrands (a clinic group).
  { id: 'wattle-disc', country: 'au', name: 'Wattle Disc', from: 1987 },
  { id: 'sakura-music', country: 'jp', name: 'Sakura Music Prize', from: 1959 },
  { id: 'hanbit', country: 'kr', name: 'Hanbit', from: 1992 },
  { id: 'trofeu-sol', country: 'br', name: 'Troféu Sol', from: 1990 },
  { id: 'naija-sound', country: 'ng', name: 'Naija Sound', from: 2000 },
  { id: 'national-music', country: '*', name: 'National Music Awards', from: 1975 },
]

/** The country's ceremony in a year, or null before it starts. Other countries share the National Music Awards. */
export function ceremonyAt(country: string, year: number): Ceremony | null {
  const own = CEREMONIES.find((c) => c.country === country) ?? CEREMONIES.find((c) => c.country === '*')
  return own && own.from <= year ? own : null
}

// ---------------------------------------------------------------------------
// Claims

export type ClaimKind = 'sample' | 'plagiarism'

/** The chance a row draws a claim: a sample claim needs a chart peak (top 10 .40, 11 to 20 .15), plagiarism a top-10 peak (.04). */
export function claimOdds(kind: ClaimKind, peak: number): number {
  const top10 = peak >= 1 && peak <= 10
  if (kind === 'plagiarism') return top10 ? 0.04 : 0
  return top10 ? 0.4 : peak > 10 && peak <= 20 ? 0.15 : 0
}
