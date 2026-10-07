// People of their time: what an NPC's job was called in a given era (no baristas in 1930, no
// software developers in 1960), how many parents stayed home, how families were shaped and how
// many siblings a child usually had. life.ts and people.ts use it for historical years only, so
// lives in the present keep their exact old behavior. Pure: no RNG, no state.
import { PRESENT_YEAR } from './timeline'

/** [modern title, [until year, era title]...] — the first era whose year is >= the calendar year wins. */
const ERA_TITLES: Readonly<Record<string, readonly (readonly [number, string])[]>> = {
  'Software Developer': [[1949, 'Telegraph Operator'], [1979, 'Keypunch Operator'], [1994, 'Programmer']],
  Barista: [[1959, 'Milkman'], [1989, 'Café Worker']],
  'Graphic Designer': [[1949, 'Sign Painter'], [1989, 'Commercial Artist']],
  'Personal Trainer': [[1949, 'Blacksmith'], [1979, 'Gym Instructor']],
  'Marketing Manager': [[1949, 'Traveling Salesman'], [1979, 'Advertising Executive']],
  'Retail Manager': [[1949, 'Shopkeeper']],
  Receptionist: [[1949, 'Switchboard Operator']],
  'Truck Driver': [[1924, 'Wagon Driver']],
  Pilot: [[1929, 'Train Conductor']],
  'Bus Driver': [[1924, 'Streetcar Driver']],
  'Security Guard': [[1949, 'Night Watchman']],
  'Real Estate Agent': [[1929, 'Land Agent']],
  'Hedge Fund Manager': [[1979, 'Stockbroker']],
  'Plastic Surgeon': [[1959, 'Surgeon']],
  CEO: [[1969, 'Industrialist']],
  'Motorcycle Taxi Driver': [[1959, 'Rickshaw Puller'], [1979, 'Taxi Driver']],
  'Import-Export Tycoon': [[1929, 'Merchant']],
}

/** The job title as it would have been called in `year` (unchanged from PRESENT_YEAR on). */
export function eraOccupation(title: string, year: number): string {
  if (year >= PRESENT_YEAR) return title
  const eras = ERA_TITLES[title]
  if (!eras) return title
  for (const [until, name] of eras) if (year <= until) return name
  return title
}

/** Jobs that employed far more people in the old days (farms, mines, mills). */
export const OLD_TRADES = ['Farmer', 'Farmhand', 'Factory Worker', 'Coal Miner', 'Seamstress', 'Dock Worker', 'Railway Worker'] as const

/** Share of working adults in the old trades, by year (0 today). */
export function oldTradeShare(year: number): number {
  if (year >= PRESENT_YEAR) return 0
  if (year < 1920) return 0.45
  if (year < 1950) return 0.32
  if (year < 1970) return 0.18
  if (year < 1990) return 0.08
  return 0
}

/** Chance a mother in a two-parent family was a full-time homemaker. */
export function homemakerShare(year: number): number {
  if (year >= PRESENT_YEAR) return 0
  if (year < 1940) return 0.7
  if (year < 1960) return 0.6
  if (year < 1975) return 0.45
  if (year < 1990) return 0.28
  if (year < 2005) return 0.15
  return 0.08
}

export type FamilyShape = 'together' | 'singleMother' | 'singleFather' | 'divorced' | 'blended' | 'adopted'

/** Weights of the family shapes a child was born into, by era (null = use today's). */
export function familyWeights(year: number): Record<FamilyShape, number> | null {
  if (year >= PRESENT_YEAR) return null
  // Before the 1970s divorce was rare; single parents were mostly widowed.
  if (year < 1950) return { together: 88, singleMother: 6, singleFather: 2, divorced: 1, blended: 2, adopted: 1 }
  if (year < 1970) return { together: 87, singleMother: 5, singleFather: 1, divorced: 3, blended: 3, adopted: 1 }
  if (year < 1990) return { together: 81, singleMother: 8, singleFather: 2, divorced: 3, blended: 5, adopted: 1 }
  return null
}

/** Weights for 0..5 older siblings at birth, by era (null = use today's). */
export function siblingWeights(year: number): readonly number[] | null {
  if (year >= PRESENT_YEAR) return null
  if (year < 1930) return [12, 16, 20, 20, 18, 14]
  if (year < 1960) return [18, 26, 24, 16, 10, 6]
  if (year < 1980) return [26, 34, 22, 11, 5, 2]
  return null
}

/** Whether same-sex couples could adopt (as a rough share of the world), by year. */
export function sameSexAdoptionShare(year: number): number | null {
  if (year >= PRESENT_YEAR) return null
  if (year < 2000) return 0
  return 0.1
}

/** How much richer people were in real terms than today (1 = today): parents' savings at birth. */
export function realWealthFactor(year: number): number {
  if (year >= PRESENT_YEAR) return 1
  const points: readonly (readonly [number, number])[] = [[1900, 0.25], [1930, 0.3], [1950, 0.4], [1970, 0.6], [1990, 0.75], [2010, 0.9], [PRESENT_YEAR, 1]]
  if (year <= points[0][0]) return points[0][1]
  for (let i = 1; i < points.length; i++) {
    const [y1, v1] = points[i]
    if (year <= y1) {
      const [y0, v0] = points[i - 1]
      return v0 + ((v1 - v0) * (year - y0)) / (y1 - y0)
    }
  }
  return 1
}

// ---------------------------------------------------------------------------
// Names of their time

/**
 * First names in the name pools that were coined or only caught on later (mostly English-language
 * trends), with the first birth year they fit. A 1910 baby isn't a Jayden; a 1960 one isn't a
 * Nevaeh. Names not listed are timeless (James, Mary, Wei, Fatima...).
 */
const NAME_FROM: Readonly<Record<string, number>> = {
  // Boys
  Jayden: 1994, Brayden: 1994, Kayden: 1994, Aiden: 1993, Mason: 1990, Hunter: 1978, Logan: 1978, Wyatt: 1988,
  Tyler: 1972, Brandon: 1962, Austin: 1978, Dylan: 1975, Connor: 1980, Caleb: 1978, Kevin: 1945, Justin: 1962,
  Ryan: 1952, Shawn: 1958, Darren: 1955, Kelvin: 1950, Callum: 1970, Rhys: 1968, Alfie: 1988, Finley: 1994,
  Hudson: 2004, Cooper: 1994, Riley: 1988, Bailey: 1988, Lachlan: 1972, Harrison: 1978, Mitchell: 1962,
  Yadiel: 1995, 'Jan Carlos': 1985, Kobe: 1997, Senne: 1990, Robbe: 1990, Seppe: 1990, Tibo: 1990, Wout: 1980,
  // Girls
  Nevaeh: 2001, Madison: 1985, Harper: 2004, Avery: 1995, Scarlett: 1998, Hailey: 1985, Taylor: 1982,
  Brittany: 1975, Ashley: 1965, Jennifer: 1955, Jessica: 1962, Megan: 1972, Lauren: 1962, Chloe: 1982,
  Zoe: 1980, Mia: 1988, Ava: 1990, Isla: 1998, Freya: 1993, Poppy: 1993, Evie: 1993, Millie: 1988, Bethany: 1978,
  Katie: 1962, Imogen: 1975, Holly: 1962, Kimberly: 1955, Tiffany: 1965, Destiny: 1990, Jasmine: 1975,
}

/** True when this first name fits someone born in `birthYear` (unlisted names always do). */
export function nameFitsYear(name: string, birthYear: number): boolean {
  const from = NAME_FROM[name]
  return from === undefined || birthYear >= from
}
