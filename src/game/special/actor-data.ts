// Actor 2.0 data: the industries, the five genre types, the project budgets and the invented awards.
// Data only. No money is formatted here (the figures are plain numbers at scale 1), so this file can
// be imported at load time by every module that needs it.

export type IndustryId = 'hollywood' | 'bollywood' | 'nollywood' | 'kdrama' | 'hongkong' | 'domestic'
export type TypeId = 'action' | 'comedy' | 'drama' | 'genre' | 'romance'
export type BudgetId = 'indie' | 'studio' | 'blockbuster' | 'cable' | 'network' | 'streaming'

export interface IndustryDef {
  id: IndustryId
  /** Money multiplier at hollywood scale 1. Domestic is 0.25 here and 0.25 x wealth (min 0.05) in `scaleOf`. */
  scale: number
  /** First year the industry makes films. Before it, a life there plays domestic. */
  filmStart: number
  /** The studio-system years, inclusive, or null when the industry never had one. */
  studio: [number, number] | null
  /** Active rivals wanted at heat 1 (see ACTOR_SPEC). */
  field: number
  /** Heat keyframes (year, heat), linear between them. The last one is 2026 and holds after it. */
  heat: [number, number][]
  /** Country ids that play this industry. Domestic is everyone else. */
  countries: readonly string[]
}

export const INDUSTRIES: Record<IndustryId, IndustryDef> = {
  hollywood: {
    id: 'hollywood',
    scale: 1,
    filmStart: 1910,
    studio: [1928, 1955],
    field: 20,
    heat: [[1910, 0.3], [1927, 0.8], [1946, 1.2], [1960, 0.7], [1977, 0.9], [2000, 1.2], [2019, 1.3], [2020, 0.5], [2023, 1.0], [2026, 1.0]],
    countries: ['us', 'ca', 'gb', 'ie', 'au', 'nz'],
  },
  bollywood: {
    id: 'bollywood',
    scale: 0.3,
    filmStart: 1913,
    studio: [1935, 1955],
    field: 16,
    heat: [[1913, 0.3], [1931, 0.8], [1950, 1.0], [1975, 1.0], [1994, 1.3], [2019, 1.4], [2020, 0.5], [2023, 1.1], [2026, 1.2]],
    countries: ['in', 'pk', 'bd'],
  },
  nollywood: {
    id: 'nollywood',
    scale: 0.02,
    filmStart: 1992,
    studio: null,
    field: 14,
    heat: [[1992, 0.3], [2000, 0.7], [2010, 1.0], [2019, 1.2], [2020, 0.8], [2023, 1.0], [2026, 1.1]],
    countries: ['ng', 'gh'],
  },
  kdrama: {
    id: 'kdrama',
    scale: 0.14,
    filmStart: 1955,
    studio: null,
    field: 16,
    heat: [[1955, 0.4], [1975, 0.6], [1995, 0.8], [2003, 1.0], [2013, 1.3], [2020, 1.2], [2026, 1.3]],
    countries: ['kr'],
  },
  hongkong: {
    id: 'hongkong',
    scale: 0.16,
    filmStart: 1950,
    studio: null,
    field: 16,
    heat: [[1950, 0.4], [1970, 0.9], [1985, 1.3], [1993, 1.5], [1998, 1.0], [2010, 0.8], [2020, 0.5], [2026, 0.6]],
    countries: ['hk'],
  },
  domestic: {
    id: 'domestic',
    scale: 0.25,
    filmStart: 1900,
    studio: [1930, 1960],
    field: 16,
    heat: [[1900, 0.4], [1930, 0.7], [1950, 0.8], [1975, 0.8], [1995, 0.9], [2010, 1.0], [2019, 1.1], [2020, 0.6], [2023, 0.9], [2026, 1.0]],
    countries: [],
  },
}

const NAMED: readonly IndustryDef[] = [INDUSTRIES.hollywood, INDUSTRIES.bollywood, INDUSTRIES.nollywood, INDUSTRIES.kdrama, INDUSTRIES.hongkong]

/** The industry a country plays in a year: its named one once that has started, else domestic. */
export function industryAt(country: string, year: number): IndustryId {
  const named = NAMED.find((d) => d.countries.includes(country))
  return named && Number.isFinite(year) && year >= named.filmStart ? named.id : 'domestic'
}

export const TYPE_IDS: readonly TypeId[] = ['action', 'comedy', 'drama', 'genre', 'romance']

const GENRES: Record<TypeId, readonly string[]> = {
  action: ['Action', 'Superhero', 'Martial Arts'],
  comedy: ['Comedy', 'Sitcom', 'Animated'],
  drama: ['Drama', 'Crime Drama', 'Medical Drama', 'Teen Drama', 'Thriller', 'Nollywood Drama'],
  genre: ['Horror', 'Sci-Fi', 'Sci-Fi Series', 'Fantasy Series'],
  romance: ['Romance', 'Musical', 'Soap Opera', 'Telenovela', 'Bollywood', 'K-Drama'],
}

/** Genre string to type. No prototype, so `TYPE_OF[x] ?? fallback` is safe for any saved string. */
export const TYPE_OF: Record<string, TypeId> = Object.assign(
  Object.create(null) as Record<string, TypeId>,
  Object.fromEntries((Object.entries(GENRES) as [TypeId, readonly string[]][]).flatMap(([type, names]) => names.map((name) => [name, type] as const))),
)

export interface BudgetDef {
  kind: 'film' | 'tv'
  /** Cost of a film or of one season, at scale 1. */
  cost: number
  /** Base gross at scale 1, before quality, buzz, heat and luck. */
  gross: number
  /** Quality bonus or penalty at the wrap. */
  qBase: number
  /** First year offered. Streaming has no year here: it needs `hasTech(g, 'streaming')`. */
  from?: number
}

export const BUDGETS: Record<BudgetId, BudgetDef> = {
  indie: { kind: 'film', cost: 2_000_000, gross: 4_000_000, qBase: -5 },
  studio: { kind: 'film', cost: 40_000_000, gross: 70_000_000, qBase: 5 },
  blockbuster: { kind: 'film', cost: 180_000_000, gross: 420_000_000, qBase: 15, from: 1975 },
  cable: { kind: 'tv', cost: 3_000_000, gross: 6_000_000, qBase: -5, from: 1980 },
  network: { kind: 'tv', cost: 4_000_000, gross: 8_000_000, qBase: 5 },
  streaming: { kind: 'tv', cost: 8_000_000, gross: 14_000_000, qBase: 5 },
}

export interface AwardDef {
  id: string
  name: string
  industry: IndustryId | 'any'
  kind: 'film' | 'tv'
  from: number
}

/** Invented awards. One row per (industry, kind) that has a prize; a credit with no matching row is not nominated. */
export const AWARD_DEFS: AwardDef[] = [
  { id: 'golden-reel', name: 'Golden Reel', industry: 'hollywood', kind: 'film', from: 1929 },
  { id: 'primetime-glow', name: 'Primetime Glow', industry: 'hollywood', kind: 'tv', from: 1949 },
  { id: 'silver-lotus', name: 'Silver Lotus', industry: 'bollywood', kind: 'film', from: 1954 },
  { id: 'jade-crane', name: 'Jade Crane', industry: 'kdrama', kind: 'tv', from: 1963 },
  { id: 'lantern', name: 'Lantern', industry: 'hongkong', kind: 'film', from: 1982 },
  { id: 'palm-screen', name: 'Palm Screen', industry: 'nollywood', kind: 'film', from: 2005 },
  { id: 'national-film', name: 'National Film or Television Prize', industry: 'domestic', kind: 'film', from: 1946 },
  { id: 'national-tv', name: 'National Film or Television Prize', industry: 'domestic', kind: 'tv', from: 1946 },
  { id: 'viewers-choice', name: 'Viewers Choice', industry: 'any', kind: 'tv', from: 2013 },
]

/** Years the talkies reshape a studio-system industry (hollywood, bollywood, domestic), once. */
export const SOUND_SHIFT: readonly [number, number] = [1927, 1931]
