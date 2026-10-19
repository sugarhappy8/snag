// Astronaut 2.0 world model: pure functions over (game, record, year). The era, who can fly, what flies,
// the funding index, mood shocks, launch risk and the body cost of a tour. Nothing here draws g.rng or
// writes state, so menus, hints, the rival field and the yearly sim can all call it and agree. Imports
// from astronaut.ts (the agency list) are read inside function bodies only.
import { economyOf } from '../economy/model'
import { hasTech } from '../history/timeline'
import type { GameState } from '../types'
import { SPACE_AGENCIES } from './astronaut'
import {
  ACADEMY_FROM,
  AGENCY_FROM,
  BACKGROUNDS,
  BONE_RATE,
  CREWS_FROM,
  DOSE_RATE,
  ERA,
  FIELD_BASE,
  MISSIONS,
  MISSION_IDS,
  MUSCLE_RATE,
  NATIONAL_PROGRAM,
  OUTPOST_DAYS,
  OUTPOST_YEARS,
  OWN_LAUNCH,
  PARTNER_FROM,
  REGIMEN_MULT,
  ROCKETEER_NAME,
  SFA_NAME,
  SPACE_SHOCKS,
  STRAIN_RATE,
  eraKey,
  type MissionId,
  type Regimen,
} from './astronaut-data'
import { astronautStore, type AstroState } from './astronaut-state'
import { ownFlag } from './common'
import type { RivalSpec } from './kit/rivals'
import { budgetLevel } from './kit/year'

export { eraKey }

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))
const fin = (n: unknown, d = 0): number => (typeof n === 'number' && Number.isFinite(n) ? n : d)

// ---------------------------------------------------------------------------
// Access and agencies

/** The agency as a country and year know it: never before `AGENCY_FROM`, else 'National Space Program'. */
export function agencyName(country: string, year: number): string {
  if (!Object.hasOwn(SPACE_AGENCIES, country)) return NATIONAL_PROGRAM
  const name = SPACE_AGENCIES[country]
  const key = name === 'European Space Agency' ? 'esa' : country
  return Object.hasOwn(AGENCY_FROM, key) && year >= AGENCY_FROM[key] ? name : NATIONAL_PROGRAM
}

/** `id` is the legacy AGENCIES id (own and partner are both 'oea'): Job.data.agency, ClassRec.agency, astro.apply.<id>. */
export interface Access { agency: 'own' | 'partner' | 'sfa' | 'rocketeer'; id: 'oea' | 'sfa' | 'rocketeer'; name: string }

/** This country launches crews itself in `year`: us and ru from 1961, cn from 2003. */
function ownLauncher(country: string, year: number): boolean {
  return Object.hasOwn(OWN_LAUNCH, country) && year >= OWN_LAUNCH[country]
}

/**
 * Who a life here can train and fly with in `year`: the country's own launchers, or its agency as a partner from
 * 1983; the consortium from 1983; the private operator once `privateSpace` exists (its crews fly from 2020).
 * Empty before the Academy opens or where nothing flies crews yet.
 */
export function access(g: GameState, year: number = g.year): Access[] {
  if (!Number.isFinite(year) || year < ACADEMY_FROM) return []
  const country = g.character.countryId
  const out: Access[] = []
  if (ownLauncher(country, year)) out.push({ agency: 'own', id: 'oea', name: agencyName(country, year) })
  else if (year >= PARTNER_FROM && Object.hasOwn(SPACE_AGENCIES, country)) out.push({ agency: 'partner', id: 'oea', name: agencyName(country, year) })
  if (year >= PARTNER_FROM) out.push({ agency: 'sfa', id: 'sfa', name: SFA_NAME })
  if (hasTech(g, 'privateSpace', year)) out.push({ agency: 'rocketeer', id: 'rocketeer', name: ROCKETEER_NAME })
  return out
}

/**
 * Flight types whose window is open for this agency in `year` (default this year): empty without access, and
 * the private operator flies nothing before 2020. 'own' is the commercial exit's flight, not a board offer: the
 * Flight Board skips it and the exit gates it by the company the astronaut owns. Reads the record for Mars only.
 */
export function missionsOpen(g: GameState, agency: Access['agency'], year: number = g.year): MissionId[] {
  if (!Number.isFinite(year) || !access(g, year).some((a) => a.agency === agency)) return []
  if (agency === 'rocketeer' && year < CREWS_FROM) return []
  const country = g.character.countryId
  const priv = hasTech(g, 'privateSpace', year)
  const flyer = agency === 'own' && (country === 'us' || country === 'ru')
  const mars = (): boolean => fundingIndex(g, astronautStore.view(g), year) >= 60 || ownFlag(g, 'marsFunding') === true
  const open: Record<MissionId, boolean> = {
    hop: (flyer && year >= 1961 && year <= 1975) || (priv && year >= 2021),
    orbit: year >= 1961,
    orbiter: year >= 1981 && year <= 2011,
    satellite: year >= 1981,
    station: year >= OUTPOST_YEARS[0],
    moon: (agency === 'own' && country === 'us' && year >= 1969 && year <= 1972) || year >= 2031,
    deep: year >= 2030,
    mars: year >= 2041 && mars(),
    own: priv && year >= CREWS_FROM,
  }
  return MISSION_IDS.filter((m) => open[m])
}

/** Tour lengths for a flight type in `year`: station outposts run 28, 56 or 84 days; every other row is fixed. */
export function tourDays(type: MissionId, year: number): number[] {
  const m = MISSIONS[type] ?? MISSIONS.orbit
  if (type === 'station' && year >= OUTPOST_YEARS[0] && year <= OUTPOST_YEARS[1]) return [...OUTPOST_DAYS]
  return [...m.days]
}

// ---------------------------------------------------------------------------
// Mood and funding

/** The public mood the years pull toward. */
export function moodTarget(year: number): number {
  return ERA[eraKey(year)].moodTarget
}

/** The year's mood shock for a country: the 'world' rows plus the rows scoped to it. */
export function shock(year: number, country: string): number {
  let n = 0
  for (const s of SPACE_SHOCKS) if (s.year === year && (s.scope === 'world' || s.scope === country)) n += s.delta
  return n
}

/**
 * The funding index F = clamp(round(base x line^0.85 x econ x (0.7 + 0.6 x mood/100) + lobby), 5, 100), plus 8
 * with marsFunding set. base is the era's; line is the national space budget level; econ = 1 + 2 x growth, minus
 * .06 when the deficit is over 5% of output. Read only: the nation and the economy are never written.
 */
export function fundingIndex(g: GameState, s: AstroState, year: number = g.year): number {
  const e = economyOf(g, g.character.countryId, year)
  const line = Math.max(0, fin(budgetLevel(g, 'space'), 1))
  const econ = 1 + 2 * fin(e.growth) - (fin(e.budget?.deficit) > 0.05 ? 0.06 : 0)
  const mood = 0.7 + 0.6 * (clamp(fin(s.mood, 50), 0, 100) / 100)
  const mars = ownFlag(g, 'marsFunding') === true ? 8 : 0
  return clamp(Math.round(ERA[eraKey(year)].fundBase * line ** 0.85 * econ * mood + fin(s.lobby) + mars), 5, 100)
}

// ---------------------------------------------------------------------------
// Risk and the body

/** A loss is fatal this often: the player's death stays near 0.4% a flight. */
export const FATAL_SHARE = 0.6

/**
 * The chance a launch is lost: the type's base (a station tour x (1 + days/720)) x the era multiplier x a safety
 * factor (1 + (60 - safety)/100, 0.6 to 1.5) x prep (1.2 unprepared, 1.0 after a training session) x 1.3 under a
 * schedule squeeze x 2.2 on the private operator. One function for the roll and the hint.
 */
export function launchRisk(g: GameState, s: AstroState, type: MissionId, days: number, o: { prep: number; squeeze: boolean; rocketeer: boolean }): number {
  const m = MISSIONS[type] ?? MISSIONS.orbit
  const base = m.risk * (type === 'station' ? 1 + clamp(fin(days), 0, 1000) / 720 : 1)
  const safety = clamp(1 + (60 - fin(s.safety, 60)) / 100, 0.6, 1.5)
  const risk = base * ERA[eraKey(g.year)].riskMult * safety * clamp(fin(o.prep, 1), 0.5, 2) * (o.squeeze ? 1.3 : 1) * (o.rocketeer ? 2.2 : 1)
  return clamp(risk, 0, 0.5)
}

/**
 * What a tour costs the body, as positive amounts: bone days/30 x 1.3 x mult x (1.25 - fit/200), muscle with 2.0,
 * dose 0.12 a day, strain days/30 x 1.4, and for the intense regimen an injury chance of max(1%, 8% - fit/15
 * points). mult is 1.0, 0.7 or 0.45 for light, standard and intense. Raw numbers: the record's floors clamp them.
 */
export function projectBody(_s: AstroState, days: number, regimen: Regimen, fit: number): { bone: number; muscle: number; dose: number; strain: number; injury: number } {
  const d = clamp(fin(days), 0, 1000)
  const f = clamp(fin(fit), 0, 100)
  const mult = REGIMEN_MULT[regimen] ?? REGIMEN_MULT.standard
  const body = (d / 30) * mult * (1.25 - f / 200)
  return {
    bone: BONE_RATE * body,
    muscle: MUSCLE_RATE * body,
    dose: DOSE_RATE * d,
    strain: (d / 30) * STRAIN_RATE,
    injury: regimen === 'intense' ? Math.max(0.01, 0.08 - f / 1500) : 0,
  }
}

// ---------------------------------------------------------------------------
// The rival field

/** Wanted active rivals for a country and year: none before the Academy opens or while nothing flies there. */
function fieldOf(year: number, country: string): number {
  if (!Number.isFinite(year) || year < ACADEMY_FROM) return 0
  return ownLauncher(country, year) || year >= PARTNER_FROM ? FIELD_BASE[eraKey(year)] : 0
}

/**
 * Peers: four backgrounds as edges, debut 26 to 40, 14 to 26 years in the corps. The field is the era's base
 * (4/3/8/6/8) where an agency flies crews, and funding deepens it: depth = clamp(F/50, 0.5, 1.3) from the record.
 */
export const ASTRO_SPEC: RivalSpec = {
  career: 'astronaut',
  edges: BACKGROUNDS,
  debutAge: [26, 40],
  length: [14, 26],
  field: fieldOf,
  depth: (g, year) => clamp(fundingIndex(g, astronautStore.view(g), year) / 50, 0.5, 1.3),
}
