// Astronaut 2.0 state: one optional, owner-stamped, versioned record at special.astronaut.sim (version 1,
// start standing 40), built on the career kit. Every reader tolerates junk and returns capped, finite
// values. `migrate[0]` lifts the legacy special.astronaut profile and the job's data in memory (pure: a view
// of a legacy life is byte-identical) and never writes the legacy flag or Job.data. This file imports
// nothing from astronaut.ts, so the legacy file can import it freely.
import type { GameState } from '../types'
import { ERA, MISSION_IDS, eraKey, type MissionId, type Regimen, type Role } from './astronaut-data'
import { myJob, peek } from './common'
import { arr, cap, defineCareerState, flt, int, rec, txt, type CareerBase, type CareerStore, type Raw } from './kit/state'

export interface ClassRec { year: number; agency: string; seats: number; finalists: number; rank: number; cut: number; mates: string[] }
export interface FlightRec { year: number; type: MissionId; role: Role; days: number; regimen: Regimen; result: 'clean' | 'abort' | 'anomaly'; crew: string[]; bone: number; dose: number }
export interface Inquiry { id: string; year: number; cause: 'hardware' | 'procedure' | 'schedule' | 'crew'; lost: string[]; involved: boolean; yearsOpen: number; status: 'open' | 'closed'; stance: '' | 'cause' | 'protect' | 'recuse'; coverup: boolean }
export interface AstroExtra {
  agency: string
  stint: string
  bone: number
  muscle: number
  dose: number
  family: number
  mood: number
  safety: number
  lobby: number
  skills: { eva: number; pilot: number; fit: number; team: number }
  fund: number[]
  classes: ClassRec[]
  flights: FlightRec[]
  inquiries: Inquiry[]
  tally: { flights: number; days: number; evas: number; commands: number; lunar: number; mars: number; own: number; concerns: number; blame: number; firsts: string[] }
  mark: { groundedYear: number; rush: boolean }
  legacy: { hall: boolean; memoirs: { year: number; advance: number; last: number; paid: number }[] }
}
export type AstroState = CareerBase & AstroExtra

/** Caps: 6 classes, 12 flights, 4 inquiries, 8 firsts, 3 memoirs, 6 funding values. */
const CAPS = { classes: 6, flights: 12, inquiries: 4, firsts: 8, memoirs: 3, fund: 6, crew: 6, mates: 6, lost: 3 } as const
const COUNT_MAX = 1e6
const DAYS_MAX = 1e7
const MONEY_MAX = 1e10
const NAME_MAX = 40
const ID_MAX = 24
const AGENCY_MAX = 24
const FIRST_MAX = 60
const BLAME_MAX = 20

const CAUSES: readonly Inquiry['cause'][] = ['hardware', 'procedure', 'schedule', 'crew']
const STANCES: readonly Inquiry['stance'][] = ['', 'cause', 'protect', 'recuse']
const ROLES: readonly Role[] = ['commander', 'pilot', 'specialist']
const REGIMENS: readonly Regimen[] = ['light', 'standard', 'intense']
const RESULTS: readonly FlightRec['result'][] = ['clean', 'abort', 'anomaly']

function pickOf<T extends string>(v: unknown, all: readonly T[], d: T): T {
  return typeof v === 'string' && (all as readonly string[]).includes(v) ? (v as T) : d
}

/** One decimal, clamped: body numbers are fractional, and rounding keeps a re-read stable. */
function dec(v: unknown, d: number, lo: number, hi: number): number {
  return Math.round(flt(v, d, lo, hi) * 10) / 10
}

function strings(v: unknown, max: number, len: number): string[] {
  const out: string[] = []
  for (const x of cap(arr(v), max * 4)) {
    const s = typeof x === 'string' ? txt(x, len) : ''
    if (s) out.push(s)
  }
  return cap(out, max)
}

const names = (v: unknown, max: number): string[] => strings(v, max, NAME_MAX)

const hasYear = (r: Raw): boolean => typeof r.year === 'number' && Number.isFinite(r.year)

function readClass(v: unknown): ClassRec | null {
  const r = rec(v)
  if (!hasYear(r)) return null
  return {
    year: int(r.year, 0, 0, 9999),
    agency: txt(r.agency, AGENCY_MAX),
    seats: int(r.seats, 0, 0, 999),
    finalists: int(r.finalists, 0, 0, 9999),
    rank: int(r.rank, 0, 0, 9999),
    cut: int(r.cut, 0, 0, 100),
    mates: names(r.mates, CAPS.mates),
  }
}

function readFlight(v: unknown): FlightRec | null {
  const r = rec(v)
  if (!hasYear(r)) return null
  return {
    year: int(r.year, 0, 0, 9999),
    type: pickOf(r.type, MISSION_IDS, 'orbit'),
    role: pickOf(r.role, ROLES, 'specialist'),
    days: int(r.days, 1, 1, 1000),
    regimen: pickOf(r.regimen, REGIMENS, 'standard'),
    result: pickOf(r.result, RESULTS, 'clean'),
    crew: names(r.crew, CAPS.crew),
    bone: dec(r.bone, 0, 0, 100),
    dose: dec(r.dose, 0, 0, 100),
  }
}

function readInquiry(v: unknown): Inquiry | null {
  const r = rec(v)
  const id = txt(r.id, ID_MAX)
  if (!id || !hasYear(r)) return null
  return {
    id,
    year: int(r.year, 0, 0, 9999),
    cause: pickOf(r.cause, CAUSES, 'hardware'),
    lost: names(r.lost, CAPS.lost),
    involved: r.involved === true,
    yearsOpen: int(r.yearsOpen, 0, 0, 9),
    status: r.status === 'closed' ? 'closed' : 'open',
    stance: pickOf(r.stance, STANCES, ''),
    coverup: r.coverup === true,
  }
}

function readMemoir(v: unknown): { year: number; advance: number; last: number; paid: number } | null {
  const r = rec(v)
  if (!hasYear(r)) return null
  return { year: int(r.year, 0, 0, 9999), advance: int(r.advance, 0, 0, MONEY_MAX), last: int(r.last, 0, 0, 9999), paid: int(r.paid, 0, 0, MONEY_MAX) }
}

/** The newest `max` rows that read, keeping the first row of each id when rows carry one. */
function readList<T>(v: unknown, max: number, one: (x: unknown) => T | null, idOf?: (x: T) => string): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const x of cap(arr(v), max * 2)) {
    const row = one(x)
    if (row === null) continue
    if (idOf) {
      const id = idOf(row)
      if (seen.has(id)) continue
      seen.add(id)
    }
    out.push(row)
  }
  return cap(out, max)
}

function readTally(v: unknown): AstroExtra['tally'] {
  const r = rec(v)
  return {
    flights: int(r.flights, 0, 0, COUNT_MAX),
    days: int(r.days, 0, 0, DAYS_MAX),
    evas: int(r.evas, 0, 0, COUNT_MAX),
    commands: int(r.commands, 0, 0, COUNT_MAX),
    lunar: int(r.lunar, 0, 0, COUNT_MAX),
    mars: int(r.mars, 0, 0, COUNT_MAX),
    own: int(r.own, 0, 0, COUNT_MAX),
    concerns: int(r.concerns, 0, 0, COUNT_MAX),
    blame: int(r.blame, 0, 0, BLAME_MAX),
    firsts: strings(r.firsts, CAPS.firsts, FIRST_MAX),
  }
}

function normalizeExtra(raw: Raw, g: GameState): AstroExtra {
  const skills = rec(raw.skills)
  const mark = rec(raw.mark)
  const legacy = rec(raw.legacy)
  return {
    agency: txt(raw.agency, AGENCY_MAX),
    stint: txt(raw.stint, 60),
    bone: dec(raw.bone, 100, 15, 100),
    muscle: dec(raw.muscle, 100, 15, 100),
    dose: dec(raw.dose, 0, 0, 100),
    family: dec(raw.family, 0, 0, 100),
    mood: int(raw.mood, ERA[eraKey(g.year)].moodTarget, 0, 100),
    safety: int(raw.safety, 60, 15, 95),
    lobby: int(raw.lobby, 0, -6, 20),
    skills: { eva: int(skills.eva, 0, 0, 100), pilot: int(skills.pilot, 0, 0, 100), fit: int(skills.fit, 0, 0, 100), team: int(skills.team, 0, 0, 100) },
    fund: cap(
      arr(raw.fund).flatMap((x) => (typeof x === 'number' && Number.isFinite(x) ? [int(x, 0, 0, 100)] : [])),
      CAPS.fund,
    ),
    classes: readList(raw.classes, CAPS.classes, readClass),
    flights: readList(raw.flights, CAPS.flights, readFlight),
    inquiries: readList(raw.inquiries, CAPS.inquiries, readInquiry, (i) => i.id),
    tally: readTally(raw.tally),
    mark: { groundedYear: int(mark.groundedYear, 0, 0, 9999), rush: mark.rush === true },
    legacy: { hall: legacy.hall === true, memoirs: readList(legacy.memoirs, CAPS.memoirs, readMemoir) },
  }
}

// ---------------------------------------------------------------------------
// The legacy profile

/** The legacy special.astronaut profile's counters, tolerating junk (a damaged `planets: 'bad'` is never read). */
export function readAstro(g: GameState): { missions: number; spacewalks: number; moonLandings: number; marsLandings: number } {
  const p = rec(peek<Raw>(g, 'astronaut'))
  return {
    missions: int(p.missions, 0, 0, COUNT_MAX),
    spacewalks: int(p.spacewalks, 0, 0, COUNT_MAX),
    moonLandings: int(p.moonLandings, 0, 0, COUNT_MAX),
    marsLandings: int(p.marsLandings, 0, 0, COUNT_MAX),
  }
}

/**
 * v0 to v1: the legacy counters become the tally, the astronaut job's performance becomes the standing and
 * 0.6 of it each skill, and its agency carries over. Nothing is invented retroactively: the body starts
 * fresh (the defaults of `normalizeExtra`). Reads only; never writes the legacy flag or Job.data.
 */
function migrateLegacy(raw: Raw, g: GameState): Raw {
  const legacy = readAstro(g)
  const job = myJob(g, 'astronaut')
  const out: Raw = {
    ...raw,
    tally: { flights: legacy.missions, evas: legacy.spacewalks, lunar: legacy.moonLandings, mars: legacy.marsLandings },
  }
  if (job) {
    const perf = int(job.performance, 0, 0, 100)
    const skill = Math.round(0.6 * perf)
    out.standing = perf
    out.skills = { eva: skill, pilot: skill, fit: skill, team: skill }
    out.agency = txt(rec(job.data).agency, AGENCY_MAX)
  }
  return out
}

export const astronautStore: CareerStore<AstroState> = defineCareerState<AstroExtra>({
  key: 'astronaut.sim',
  version: 1,
  start: 40,
  migrate: [migrateLegacy],
  extra: normalizeExtra,
})

// ---------------------------------------------------------------------------
// Politics link

/**
 * The astronaut's pull at the polls: 2 for having flown, 2 for a landing, 1 for a tour over 180 days and 1
 * for the Hall of Fame, at most 6, minus 3 for each point of blame. Reads the record only; 0 without one.
 */
export function astroPoliticsEdge(g: GameState): number {
  const s = astronautStore.peek(g)
  if (!s) return 0
  const flown = s.tally.flights > 0 ? 2 : 0
  const landing = s.tally.lunar + s.tally.mars > 0 ? 2 : 0
  const long = s.flights.some((f) => f.days > 180) ? 1 : 0
  const hall = s.legacy.hall ? 1 : 0
  return Math.min(6, flown + landing + long + hall) - 3 * s.tally.blame
}
