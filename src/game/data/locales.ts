// Local life: what growing up and living in each country looks and sounds like.
//
// world.ts gives every country names, cities and religions; markets.ts gives it an economy.
// This file gives it a culture: what schools are called and named after, street names,
// neighborhoods, where couples run off to, holidays, food, sports, how people get around,
// whether it ever snows, landmarks and hangouts. Text all over the game pulls from it so an
// Indonesian childhood happens at "SD Negeri 3 Menteng" and ends with a trip to Bali, not at
// "Northgate Primary School" and an elopement in Las Vegas.
//
// Data lives in data/locales/*.ts (one file per region); countries without data fall back to
// a neutral profile (no American-specific places). All text is English.
import { pick, randInt } from '../rng'
import type { GameState } from '../types'
import { getCountry } from '../world'
import { AFRICA_MIDDLE_EAST_LOCALES } from './locales/africaMiddleEast'
import { AMERICAS_LOCALES } from './locales/americas'
import { ASIA_OCEANIA_LOCALES } from './locales/asiaOceania'
import { EUROPE_LOCALES } from './locales/europe'

export type Climate = 'tropical' | 'arid' | 'mediterranean' | 'temperate' | 'continental' | 'cold'

export type SchoolLevel = 'primary' | 'middle' | 'high'

export interface LocaleProfile {
  /** Lowercase ISO alpha-2 code, same as world.ts. */
  countryId: string
  /** Neighborhoods, districts, rivers, hills and local words used to name schools, parks and streets. */
  placeWords: string[]
  /** National heroes, writers, saints and leaders that schools and streets are commonly named after. */
  honorees: string[]
  /**
   * School name patterns per level, in the local style (English text, local words kept).
   * Placeholders: {place} {honoree} {city} {n} (a small number). e.g. Indonesia primary:
   * 'SD Negeri {n} {place}'; Mexico: 'Escuela Primaria {honoree}'; UK: '{place} Primary School'.
   */
  schoolNames: Record<SchoolLevel, string[]> & {
    /** Kindergarten / preschool names in the local style, e.g. 'TK Aisyiyah {n} {place}', 'Kita {place}', 'Jardín de Niños {honoree}'. */
    preschool?: string[]
  }
  /** University name patterns ({city} {place} {honoree}), e.g. 'University of {city}', 'Universitas {honoree}'. */
  universityNames: string[]
  /** Street name patterns ({place} {honoree} {n}), e.g. 'Jalan {honoree}', 'Calle {place}', '{place} Road'. */
  streetNames: string[]
  /** What things are called here, in English: 'primary school', 'secondary school', the big exam... */
  terms: {
    /** e.g. 'elementary school' (US), 'primary school'. */
    primary: string
    /** e.g. 'middle school', 'junior high', 'lower secondary'. */
    middle: string
    /** e.g. 'high school', 'secondary school', 'senior high'. */
    high: string
    /** e.g. 'college' (US), 'university'. */
    university: string
    /** The school-leaving / university entrance exam: 'the SATs', 'A-levels', 'the gaokao', 'the Abitur'. */
    finalExam: string
    /** The end-of-school celebration: 'prom', 'the leavers' ball', 'graduation night', 'matric dance'. */
    schoolDance: string
    /** Where you get a driver's license: 'the DMV', 'the driving school', 'the transport office'. */
    licenseOffice: string
    /** Emergency number, e.g. '911', '112', '999'. */
    emergencyNumber: string
  }
  /** Romantic getaway / elopement / honeymoon spots people here actually go to (domestic or nearby). */
  getaways: string[]
  /** Big local holidays and festivals, most widely celebrated first. */
  holidays: string[]
  /** Everyday dishes, snacks and comfort food. */
  foods: string[]
  /** A drink people bond over (tea, coffee, beer, mate, soju...). */
  drinks: string[]
  /** Most popular sports, most popular first. */
  sports: string[]
  /** How people get around: 'the subway', 'a jeepney', 'a matatu', 'a tuk-tuk', 'the bus'. */
  transport: string[]
  climate: Climate
  /** Does it snow where most people live (snow days, sledding, snowmen)? */
  snow: boolean
  /** Famous domestic landmarks and day-trip spots. */
  landmarks: string[]
  /** Where people hang out: 'the night market', 'the mall', 'the beach', 'the plaza', 'a karaoke bar'. */
  hangouts: string[]
  /** Local spots for a cheap first date or a teen hangout ('the boardwalk', 'a bubble tea shop'). */
  dateSpots: string[]
}

const ALL: Record<string, LocaleProfile> = {
  ...AMERICAS_LOCALES,
  ...EUROPE_LOCALES,
  ...AFRICA_MIDDLE_EAST_LOCALES,
  ...ASIA_OCEANIA_LOCALES,
}

const NEUTRAL_PRESCHOOLS = ['{place} Kindergarten', '{city} Kindergarten No. {n}', '{place} Preschool']

/** Neutral profile for a country with no data: nothing American-specific. */
function neutralProfile(countryId: string): LocaleProfile {
  const c = getCountry(countryId)
  return {
    countryId,
    placeWords: ['Riverside', 'Hillside', 'Old Town', 'Harbor', 'Central', 'Park', 'Market', 'Station'],
    honorees: [`${c.name} Unity`, 'Independence', 'Liberty'],
    schoolNames: {
      primary: ['{place} Primary School', '{city} Primary School No. {n}'],
      middle: ['{place} Middle School', '{city} Middle School No. {n}'],
      high: ['{place} Secondary School', '{city} Secondary School No. {n}'],
    },
    universityNames: ['University of {city}', '{city} National University'],
    streetNames: ['{place} Road', '{place} Street', '{honoree} Avenue'],
    terms: {
      primary: 'primary school',
      middle: 'middle school',
      high: 'secondary school',
      university: 'university',
      finalExam: 'the national exams',
      schoolDance: 'the graduation party',
      licenseOffice: 'the licensing office',
      emergencyNumber: '112',
    },
    getaways: c.cities.slice(1, 4).length ? c.cities.slice(1, 4) : [c.name],
    holidays: ['New Year', 'Independence Day'],
    foods: ['street food', 'a home-cooked stew', 'fresh bread'],
    drinks: ['tea', 'coffee'],
    sports: ['soccer', 'basketball'],
    transport: ['the bus', 'a taxi'],
    climate: 'temperate',
    snow: false,
    landmarks: [`the ${c.name} National Museum`, 'the old town'],
    hangouts: ['the market', 'the park', 'the mall'],
    dateSpots: ['a café', 'the park', 'the cinema'],
  }
}

/** The locale profile for a country (always defined). */
export function localeOf(countryId: string): LocaleProfile {
  return ALL[countryId] ?? neutralProfile(countryId)
}

/** The locale where the player lives now. */
export function locale(g: GameState): LocaleProfile {
  return localeOf(g.character.countryId)
}

/** True when the country has hand-written locale data (tests use this). */
export function hasLocaleData(countryId: string): boolean {
  return countryId in ALL
}

/** Words a template can ask for with {token}. */
export type LocaleToken =
  | 'place'
  | 'honoree'
  | 'getaway'
  | 'holiday'
  | 'food'
  | 'drink'
  | 'sport'
  | 'transport'
  | 'landmark'
  | 'hangout'
  | 'dateSpot'

const TOKEN_FIELD: Record<LocaleToken, keyof LocaleProfile> = {
  place: 'placeWords',
  honoree: 'honorees',
  getaway: 'getaways',
  holiday: 'holidays',
  food: 'foods',
  drink: 'drinks',
  sport: 'sports',
  transport: 'transport',
  landmark: 'landmarks',
  hangout: 'hangouts',
  dateSpot: 'dateSpots',
}

/** A random local word of one kind for the player's country, e.g. localPick(g, 'food') → 'nasi goreng'. */
export function localPick(g: GameState, token: LocaleToken, countryId = g.character.countryId): string {
  const list = localeOf(countryId)[TOKEN_FIELD[token]] as string[]
  return list.length ? pick(g, list) : ''
}

/** A local term ('the SATs', 'secondary school', '911'...). */
export function localTerm(g: GameState, term: keyof LocaleProfile['terms'], countryId = g.character.countryId): string {
  return localeOf(countryId).terms[term]
}

/**
 * Fill {tokens} in a template with local words: {place} {honoree} {getaway} {holiday} {food}
 * {drink} {sport} {transport} {landmark} {hangout} {dateSpot}, plus {city} (the player's city)
 * and {country}, and {n} (a small number). Unknown tokens are left alone so other fillers can
 * handle them.
 */
export function fillLocal(g: GameState, template: string, countryId = g.character.countryId): string {
  const country = getCountry(countryId)
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
    if (key === 'city') return countryId === g.character.countryId ? g.character.city : pick(g, country.cities)
    if (key === 'country') return country.name
    if (key === 'n') return String(randInt(g, 1, 12))
    if (key in TOKEN_FIELD) return localPick(g, key as LocaleToken, countryId) || whole
    return whole
  })
}

/** A school name for a level in the player's country (or another country), e.g. 'SD Negeri 3 Menteng'. */
export function localSchoolName(g: GameState, level: SchoolLevel, countryId = g.character.countryId): string {
  const patterns = localeOf(countryId).schoolNames[level]
  return fillLocal(g, pick(g, patterns.length ? patterns : neutralProfile(countryId).schoolNames[level]), countryId)
}

/** A kindergarten / preschool name in the local style ('TK Aisyiyah 2 Menteng', 'Kita Sonnenschein'). */
export function localPreschoolName(g: GameState, countryId = g.character.countryId): string {
  const patterns = localeOf(countryId).schoolNames.preschool ?? []
  return fillLocal(g, pick(g, patterns.length ? patterns : NEUTRAL_PRESCHOOLS), countryId)
}

/** A university name in the player's country. */
export function localUniversityName(g: GameState, countryId = g.character.countryId): string {
  const patterns = localeOf(countryId).universityNames
  return fillLocal(g, pick(g, patterns.length ? patterns : neutralProfile(countryId).universityNames), countryId)
}

/** A street name (no house number), e.g. 'Jalan Sudirman', 'Calle Hidalgo', 'Maple Street'. */
export function localStreetName(g: GameState, countryId = g.character.countryId): string {
  const patterns = localeOf(countryId).streetNames
  return fillLocal(g, pick(g, patterns.length ? patterns : neutralProfile(countryId).streetNames), countryId)
}

/** True when it snows where the player lives. */
export function hasSnow(g: GameState, countryId = g.character.countryId): boolean {
  return localeOf(countryId).snow
}

const ALCOHOLIC = /beer|wine|tequila|mezcal|\brum\b|vodka|soju|sake|whisk|\bgin\b|ouzo|rak[iı]|cacha[cç]a|pisco|chicha|arak|baijiu|makgeolli|brandy|cider|schnapps|aquavit|akvavit|grappa|p[aá]linka|rakija|\btej\b|lager|stout|michelada|caipirinha|aperol|spritz|cerveza|cava|prosecco|champagne|toddy|tuak|arrack|feni|chang\b|tuba|lambanog|absinthe|jenever|pastis|sangria|liqueur|bourbon|moonshine|kvass|horilka|sambuca|limoncello|retsina|tsipouro|slivovitz|vermouth|punch|\bmead\b|chacha|kumis|airag|tongba|raksi/i

/** True when a drink name is (or usually is) alcoholic. */
export function isAlcoholic(drink: string): boolean {
  return ALCOHOLIC.test(drink)
}

/** A non-alcoholic local drink (tea, coffee, mate, juice...) for scenes that shouldn't involve booze. */
export function localSoftDrink(g: GameState, countryId = g.character.countryId): string {
  const soft = localeOf(countryId).drinks.filter((d) => !isAlcoholic(d))
  return soft.length ? pick(g, soft) : pick(g, ['tea', 'coffee'])
}

/** A local drink for adults: alcohol only where people of drinking age commonly drink it. */
export function localAdultDrink(g: GameState, countryId = g.character.countryId): string {
  const c = getCountry(countryId)
  const muslim = c.religions.filter((r) => r === 'Islam').length * 2 > c.religions.length
  const ok = muslim || g.character.age < c.drinkingAge ? localeOf(countryId).drinks.filter((d) => !isAlcoholic(d)) : localeOf(countryId).drinks
  return ok.length ? pick(g, ok) : pick(g, ['tea', 'coffee'])
}
