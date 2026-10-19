// Astronaut 2.0 data: every era table, mission row, agency date and mood shock lives in this one file, so
// tuning the career means editing numbers here. Pure constants and two tiny lookups, no state. Real-world
// dates carry the design's approximations; no vehicle, crew or mission is named.

/** Race 1957-75, lull 1976-80, shuttle 1981-99, station 2000-19, commercial 2020 on. */
export type EraKey = 'race' | 'lull' | 'shuttle' | 'station' | 'commercial'
export type MissionId = 'hop' | 'orbit' | 'orbiter' | 'satellite' | 'station' | 'moon' | 'deep' | 'mars' | 'own'
export type Role = 'commander' | 'pilot' | 'specialist'
export type Regimen = 'light' | 'standard' | 'intense'
export type Background = 'pilot' | 'engineer' | 'scientist' | 'physician'

export const ERA_KEYS: readonly EraKey[] = ['race', 'lull', 'shuttle', 'station', 'commercial']
/** The first year of each era. */
export const ERA_START: Record<EraKey, number> = { race: 1957, lull: 1976, shuttle: 1981, station: 2000, commercial: 2020 }

/**
 * Per era: funding base, public mood target, flights a year on the world manifest, years between classes,
 * class seats at funding 50, and the launch-risk multiplier.
 */
export const ERA: Record<EraKey, { fundBase: number; moodTarget: number; manifest: number; classEvery: number; seats: number; riskMult: number }> = {
  race: { fundBase: 70, moodTarget: 70, manifest: 5, classEvery: 2, seats: 10, riskMult: 2.0 },
  lull: { fundBase: 30, moodTarget: 40, manifest: 1, classEvery: 6, seats: 3, riskMult: 1.2 },
  shuttle: { fundBase: 52, moodTarget: 52, manifest: 5, classEvery: 3, seats: 14, riskMult: 1.5 },
  station: { fundBase: 46, moodTarget: 50, manifest: 4, classEvery: 4, seats: 10, riskMult: 0.9 },
  commercial: { fundBase: 56, moodTarget: 55, manifest: 5, classEvery: 2, seats: 12, riskMult: 1.0 },
}

export function eraKey(year: number): EraKey {
  if (!Number.isFinite(year)) return 'commercial'
  if (year >= ERA_START.commercial) return 'commercial'
  if (year >= ERA_START.station) return 'station'
  if (year >= ERA_START.shuttle) return 'shuttle'
  if (year >= ERA_START.lull) return 'lull'
  return 'race'
}

export const MISSION_IDS: readonly MissionId[] = ['hop', 'orbit', 'orbiter', 'satellite', 'station', 'moon', 'deep', 'mars', 'own']

/**
 * Seats, tour lengths in days, launch risk and the pay bonus of each flight type. Names stay generic. A station
 * tour uses `OUTPOST_DAYS` in outpost years. Where the legacy `DESTINATIONS` has a row, its bonus is kept.
 */
export const MISSIONS: Record<MissionId, { label: string; seatCount: number; days: number[]; risk: number; bonus: number }> = {
  hop: { label: 'Suborbital hop', seatCount: 1, days: [1], risk: 0.004, bonus: 0.04 },
  orbit: { label: 'Orbital flight', seatCount: 2, days: [3], risk: 0.007, bonus: 0.05 },
  orbiter: { label: 'Orbiter flight', seatCount: 6, days: [10], risk: 0.008, bonus: 0.06 },
  satellite: { label: 'Satellite repair', seatCount: 2, days: [8], risk: 0.008, bonus: 0.07 },
  station: { label: 'Station tour', seatCount: 3, days: [90, 180, 365], risk: 0.008, bonus: 0.06 },
  moon: { label: 'Lunar flight', seatCount: 3, days: [8], risk: 0.014, bonus: 0.12 },
  deep: { label: 'Deep space survey', seatCount: 4, days: [120], risk: 0.012, bonus: 0.12 },
  mars: { label: 'Mars flight', seatCount: 6, days: [420], risk: 0.02, bonus: 0.2 },
  own: { label: 'Commercial flight', seatCount: 3, days: [5], risk: 0.01, bonus: 0.06 },
}

/** Station tours in these years (inclusive) are outpost stays. */
export const OUTPOST_YEARS: readonly [number, number] = [1973, 1999]
export const OUTPOST_DAYS: readonly number[] = [28, 56, 84]

// ---------------------------------------------------------------------------
// Calendar

/** The Academy and the selection boards open. */
export const ACADEMY_FROM = 1959
/** Own launchers fly crews from this year. */
export const OWN_LAUNCH: Record<string, number> = { us: 1961, ru: 1961, cn: 2003 }
/** Partner agencies and the consortium take seats from this year. */
export const PARTNER_FROM = 1983
/** Commercial crew seats open (the private operator's astronaut class runs from `PRIVATE_FROM`). */
export const CREWS_FROM = 2020
export const PRIVATE_FROM = 2008
/** First year of an agency under its own name; earlier, or unlisted, it reads 'National Space Program'. */
export const AGENCY_FROM: Record<string, number> = { us: 1958, fr: 1961, in: 1969, esa: 1975, it: 1988, ca: 1989, ru: 1992, cn: 1993, jp: 2003, gb: 2010, ae: 2014, kr: 2024 }
export const NATIONAL_PROGRAM = 'National Space Program'
export const SFA_NAME = 'Stellar Frontier Alliance'
export const ROCKETEER_NAME = 'Rocketeer Aerospace'

/** Wanted active rivals by era (the rival field's base). */
export const FIELD_BASE: Record<EraKey, number> = { race: 4, lull: 3, shuttle: 8, station: 6, commercial: 8 }

/** Public mood shocks: the year, who feels it ('world' or a country id) and the change. */
export const SPACE_SHOCKS: { year: number; scope: 'world' | string; delta: number }[] = [
  { year: 1957, scope: 'world', delta: 8 },
  { year: 1961, scope: 'world', delta: 8 },
  { year: 1967, scope: 'us', delta: -12 },
  { year: 1969, scope: 'world', delta: 12 },
  { year: 1972, scope: 'world', delta: -6 },
  { year: 1981, scope: 'world', delta: 6 },
  { year: 1986, scope: 'us', delta: -16 },
  { year: 1986, scope: 'world', delta: -4 },
  { year: 2000, scope: 'world', delta: 4 },
  { year: 2003, scope: 'us', delta: -10 },
  { year: 2003, scope: 'cn', delta: 8 },
  { year: 2031, scope: 'world', delta: 8 },
  { year: 2041, scope: 'world', delta: 12 },
]

// ---------------------------------------------------------------------------
// Selection

export const BACKGROUNDS: readonly Background[] = ['pilot', 'engineer', 'scientist', 'physician']
/** What the class wants, by era: weights for pilot, engineer, scientist, physician. */
export const BIAS: Record<EraKey, Record<Background, number>> = {
  race: { pilot: 0.7, engineer: 0.15, scientist: 0.1, physician: 0.05 },
  lull: { pilot: 0.35, engineer: 0.25, scientist: 0.25, physician: 0.15 },
  shuttle: { pilot: 0.35, engineer: 0.25, scientist: 0.25, physician: 0.15 },
  station: { pilot: 0.15, engineer: 0.3, scientist: 0.35, physician: 0.2 },
  commercial: { pilot: 0.15, engineer: 0.3, scientist: 0.35, physician: 0.2 },
}
export const STEM_MAJORS: readonly string[] = ['Biology', 'Chemistry', 'Computer Science', 'Engineering', 'Information Systems', 'Mathematics', 'Physics']
export const SCIENCE_MAJORS: readonly string[] = ['Biology', 'Chemistry', 'Mathematics', 'Physics']
export const MEDICAL_MAJORS: readonly string[] = ['Nursing']

// ---------------------------------------------------------------------------
// Body

export const REGIMEN_MULT: Record<Regimen, number> = { light: 1, standard: 0.7, intense: 0.45 }
/** Per 30 days: bone and muscle loss at full mult, and family strain. Radiation dose is per day. */
export const BONE_RATE = 1.3
export const MUSCLE_RATE = 2.0
export const STRAIN_RATE = 1.4
export const DOSE_RATE = 0.12

// ---------------------------------------------------------------------------
// The Flight Board

/** Seats on the board: six are built each year and at most four are shown (the era's manifest may cut that). */
export const BOARD = { built: 6, shown: 4, minFunding: 20, bids: 2 } as const
/** How a bid scores: 0.5 standing + 0.3 seat skill + 4 per level; the second bid of a year is 3 lower; swings are +-5 (yours) and +-4 (the rival's, seeded). */
export const BID = { standing: 0.5, skill: 0.3, level: 4, second: 3, swing: 5, rival: 4 } as const
/** Which skill a seat leans on. */
export const ROLE_SKILL: Record<Role, 'pilot' | 'team' | 'eva'> = { commander: 'team', pilot: 'pilot', specialist: 'eva' }
export const ROLES: readonly Role[] = ['commander', 'pilot', 'specialist']
/** The rank (and for the pilot, the skill) each seat asks for. */
export const SEAT_GATES: Record<Role, { level: number; skill: number }> = {
  commander: { level: 4, skill: 0 },
  pilot: { level: 2, skill: 50 },
  specialist: { level: 1, skill: 0 },
}
/** Weights for a seat's role on a flight with more than one seat; a single seat is always the pilot's. */
export const ROLE_WEIGHT: Record<Role, number> = { commander: 0.2, pilot: 0.3, specialist: 0.5 }
/** Which backgrounds a rival can bid against you with, by flight type. */
export const MISSION_EDGES: Record<MissionId, readonly Background[]> = {
  hop: ['pilot'],
  orbit: ['pilot', 'engineer'],
  orbiter: ['pilot', 'engineer', 'scientist', 'physician'],
  satellite: ['engineer', 'pilot'],
  station: ['scientist', 'engineer', 'physician', 'pilot'],
  moon: ['pilot', 'scientist'],
  deep: ['scientist', 'engineer'],
  mars: ['pilot', 'engineer', 'scientist', 'physician'],
  own: ['pilot', 'engineer'],
}
/** Rivals a seat can be contested by: the top few that fit (the strongest are out of reach early, the later ones are not). */
export const BID_RIVALS = 5
/** A year-long station tour needs this year and this rank. */
export const TOUR_365 = { year: 2015, level: 3 } as const
/** Launch prep: 1.2 unprepared, 1.0 after a training session this year. */
export const PREP = { cold: 1.2, trained: 1.0 } as const
/** The era's launch roll for a peer's flight is as prepared as it gets. */
export const PEER_PREP = 1.0

/** Flight pay: at most 40% of the salary, bonus x (0.8 to 1.3) plus a little a day. */
export const FLIGHT_PAY = { cap: 0.4, perDay: 0.0006, lo: 0.8, hi: 1.3 } as const
/** The cost of a bone injury in the regimen hint: one point of injury chance counts as this many points of bone. */
export const INJURY_COST = 100
/** A tour over this many days asks for a regimen. */
export const REGIMEN_DAYS = 30
/** The full rehab program: US dollars, bone and muscle on top of the free recovery. */
export const REHAB = { usd: 6000, bone: 2.5, muscle: 6 } as const
/** A year without a flight / a flight year: bone and muscle recovered. */
export const RECOVERY = { rest: { bone: 3, muscle: 8 }, flight: { bone: 1, muscle: 3 } } as const
/** Bone under this costs health every year; under the fracture line it also risks a stress fracture. */
export const BONE_LINE = 70
export const FRACTURE_LINE = 60
export const FRACTURE_ODDS = 0.1
/** Family strain: a year at home eases it; leave eases it more. */
export const STRAIN = { home: 10, child: 4, leave: 25, partnerFrom: 50, childFrom: 60 } as const
/** The mood and safety cost of a lost crew. */
export const LOSS = { mood: 18, safety: 10 } as const
/** Standing needed for each rank (indexed by the rank), and the corps seats for ranks 2 to 5. */
export const PROMOTION_STANDING: readonly number[] = [0, 50, 55, 60, 66, 74]
export const PROMOTION_SEATS: Record<number, number> = { 2: 12, 3: 8, 4: 4, 5: 1 }
/** What an inquiry finds, by weight; a schedule squeeze adds to the schedule cause. */
export const CAUSES: readonly ['hardware', 'procedure', 'schedule', 'crew'] = ['hardware', 'procedure', 'schedule', 'crew']
export const CAUSE_WEIGHT: Record<(typeof CAUSES)[number], number> = { hardware: 0.35, procedure: 0.25, schedule: 0.25, crew: 0.15 }
export const SQUEEZE_CAUSE = 0.3
/** A cover-up leaks this often a year, for this many years after the loss. */
export const COVERUP = { leak: 0.2, years: 4, standing: 8, mood: 8 } as const
