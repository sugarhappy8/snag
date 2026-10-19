// Astronaut 2.0 selection: class years, seats, the seeded field of finalists, the player's score and the
// board that ranks them. The field is seeded from the family seed, never g.rng, so a menu, a hint and the
// board agree; the one random input is the caller's roll (randInt(g, -6, 6), in actions only). Pure.
import { seeded, type SRng } from '../assets'
import { counter } from '../core'
import { allBrands } from '../data/brands'
import { nameFitsYear } from '../history/events-people'
import { outcomeTag } from '../timeMachine'
import type { GameState } from '../types'
import { namePoolOf, type NamePool } from '../world'
import {
  ACADEMY_FROM,
  BACKGROUNDS,
  BIAS,
  ERA,
  ERA_START,
  MEDICAL_MAJORS,
  PRIVATE_FROM,
  SCIENCE_MAJORS,
  STEM_MAJORS,
  eraKey,
  type Background,
} from './astronaut-data'
import type { AstroState } from './astronaut-state'
import { fundingIndex, type Access } from './astronaut-world'
import { convictions, myJob, peek } from './common'
import { familySeed } from './kit/rivals'
import { int, rec, type Raw } from './kit/state'

export type { Background }

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))
const fin = (n: unknown, d = 0): number => (typeof n === 'number' && Number.isFinite(n) ? n : d)

const SEATS_MAX = 40
const FINALISTS_MAX = 400
const NAME_TRIES = 8
const COHORT_SEATS = 0.6
const COHORT_PER_SEAT = 3

// ---------------------------------------------------------------------------
// Class years and seats

/**
 * Whether the agency runs a class in `year`: every `classEvery` years of the era counted from its first year
 * (2, 6, 3, 4, 2), from the Academy's opening in 1959; the private operator runs one every year from 2008.
 * Access is a separate question (`access` in the world model).
 */
export function classYear(agency: Access['agency'], year: number): boolean {
  if (!Number.isInteger(year) || year < ACADEMY_FROM) return false
  if (agency === 'rocketeer') return year >= PRIVATE_FROM
  const era = eraKey(year)
  return (year - ERA_START[era]) % ERA[era].classEvery === 0
}

/**
 * Seats in the class: clamp(round(base x F/50), 0, 40) with the era's seat base and the funding index F. The
 * private operator ignores the national line: it funds 40 + 2 x (year - 2008), at most 90, scaled by mood, and
 * has no class before 2008. `agency` is optional (a national class by default).
 */
export function classSeats(g: GameState, s: AstroState, year: number, agency?: string): number {
  if (!Number.isFinite(year)) return 0
  const base = ERA[eraKey(year)].seats
  if (agency === 'rocketeer') {
    if (year < PRIVATE_FROM) return 0
    const mood = 0.7 + 0.6 * (clamp(fin(s.mood, 50), 0, 100) / 100)
    const funded = clamp(Math.round(Math.min(90, 40 + 2 * (year - PRIVATE_FROM)) * mood), 5, 100)
    return clamp(Math.round((base * funded) / 50), 0, SEATS_MAX)
  }
  return clamp(Math.round((base * fundingIndex(g, s, year)) / 50), 0, SEATS_MAX)
}

// ---------------------------------------------------------------------------
// The class's taste

/** What the class wants: a seeded, weighted pick by era (race leans pilot, the station years scientist). */
export function classBias(g: GameState, agency: string, year: number): Background {
  const w = BIAS[eraKey(year)]
  return seeded(`astro|${familySeed(g)}|bias|${agency}|${year}${outcomeTag(g, year)}`).weighted(BACKGROUNDS, (b) => w[b])
}

/** What a life reads as: a flyer (pilot skill 50 or more), else by the best degree's major, else an engineer. */
export function playerBackground(g: GameState, s: AstroState): Background {
  if (fin(s.skills.pilot) >= 50) return 'pilot'
  const degrees = g.character.education.degrees
  const majors = degrees.flatMap((d) => (typeof d.major === 'string' ? [d.major] : []))
  if (degrees.some((d) => d.kind === 'md') || majors.some((m) => MEDICAL_MAJORS.includes(m))) return 'physician'
  if (degrees.some((d) => d.kind === 'doctorate') || majors.some((m) => SCIENCE_MAJORS.includes(m))) return 'scientist'
  return 'engineer'
}

// ---------------------------------------------------------------------------
// The field

let brandNames: Set<string> | null = null
function isBrand(name: string): boolean {
  brandNames ??= new Set(allBrands().map((b) => b.name.toLowerCase()))
  return brandNames.has(name.toLowerCase())
}

/** A name from the home pool that fits the birth year, is not yet used and is not a brand. */
function nameOf(r: SRng, pool: NamePool, female: boolean, born: number, used: ReadonlySet<string>): string {
  const all = female ? pool.female : pool.male
  const fitting = all.filter((f) => nameFitsYear(f, born))
  const firsts = fitting.length ? fitting : all
  if (!firsts.length || !pool.last.length) return female ? 'Sam Doe' : 'Alex Doe'
  let name = ''
  for (let i = 0; i < NAME_TRIES; i++) {
    name = `${r.pick(firsts)} ${r.pick(pool.last)}`.slice(0, 40)
    if (!used.has(name.toLowerCase()) && !isBrand(name)) return name
  }
  return name
}

/**
 * The finalists of a class, seeded from the family seed, the agency and the year (never g.rng), so the same
 * call always returns the same people: score 34 + 24 u1 + 22 u2 (mean 57, sd 9.4), plus 3 when the
 * background matches the class's. The first n of a longer list are the same n.
 */
export function seededCandidates(g: GameState, agency: string, year: number, n: number): { name: string; score: number; bg: Background }[] {
  const count = int(n, 0, 0, FINALISTS_MAX)
  const pool = namePoolOf(g.character.countryId)
  const family = familySeed(g)
  const tag = outcomeTag(g, year)
  const bias = classBias(g, agency, year)
  const weights = BIAS[eraKey(year)]
  const used = new Set<string>()
  const out: { name: string; score: number; bg: Background }[] = []
  for (let i = 0; i < count; i++) {
    const r = seeded(`astro|${family}|${agency}|${year}|${i}${tag}`)
    const u1 = r.next()
    const u2 = r.next()
    const bg = r.weighted(BACKGROUNDS, (b) => weights[b])
    const female = r.chance(0.5)
    const born = year - r.int(26, 40)
    const name = nameOf(r, pool, female, born, used)
    used.add(name.toLowerCase())
    out.push({ name, score: 34 + 24 * u1 + 22 * u2 + (bg === bias ? 3 : 0), bg })
  }
  return out
}

// ---------------------------------------------------------------------------
// The player's score

/** 3 for a college degree, 6 for a STEM major, 8 for a doctorate or an MD: the best one counts. */
function degreeScore(g: GameState): number {
  let best = 0
  for (const d of g.character.education.degrees) {
    const v = d.kind === 'md' || d.kind === 'doctorate' ? 8 : d.major && STEM_MAJORS.includes(d.major) ? 6 : d.kind === 'highschool' || d.kind === 'ged' || d.kind === 'associate' || d.kind === 'nursing' ? 0 : 3
    best = Math.max(best, v)
  }
  return best
}

/**
 * How ready the training says you are: the cadet's or the astronaut's performance, the mean of the corps skills, or
 * 60 once you graduated from the Academy (its pass mark), whichever is highest.
 */
function readiness(g: GameState, s: AstroState): number {
  const perf = Math.max(fin(myJob(g, 'astronaut.cadet')?.performance), fin(myJob(g, 'astronaut')?.performance))
  const k = s.skills
  const mean = (fin(k.eva) + fin(k.pilot) + fin(k.fit) + fin(k.team)) / 4
  const graduated = rec(peek<Raw>(g, 'astronaut')).graduated === true ? 60 : 0
  return clamp(Math.max(perf, mean, graduated), 0, 100)
}

/**
 * The player's board score, with no roll: 8 + .30 smarts + .18 athleticism + .14 health + .22 readiness + degree
 * + min(6, 2 x space camp) - 5 x convictions, plus 3 when the player's background matches the class's.
 */
export function playerScore(g: GameState, s: AstroState, agency: string, year: number): number {
  const c = g.character
  const camp = Math.min(6, 2 * Math.max(0, counter(g, 'spaceCamp')))
  const bias = playerBackground(g, s) === classBias(g, agency, year) ? 3 : 0
  return 8 + 0.3 * fin(c.stats.smarts) + 0.18 * fin(c.hidden.athleticism) + 0.14 * fin(c.stats.health) + 0.22 * readiness(g, s) + degreeScore(g) + camp - 5 * convictions(g) + bias
}

// ---------------------------------------------------------------------------
// The board

export interface BoardResult { rank: number; finalists: number; seats: number; cut: number; passed: boolean; bias: Background; you: Background; mates: string[] }

/**
 * Rank the player against the seeded finalists. An open class has seats finalists x 4 + 6; the Academy's own cohort
 * has 0.6 of the seats and 3 finalists a seat. rank = 1 + the candidates scoring above the player; passed means
 * rank <= seats. `roll` is the caller's randInt(g, -6, 6) (0 for a hint or a subtitle). `cut` is the score the
 * last seat took. mates are up to 3 admitted candidates, seeded. Pure given `roll`.
 */
export function runBoard(g: GameState, s: AstroState, agency: string, year: number, o: { cohort?: boolean; roll: number }): BoardResult {
  const open = classSeats(g, s, year, agency)
  const cohort = o.cohort === true
  const seats = cohort ? (open > 0 ? Math.max(1, Math.round(open * COHORT_SEATS)) : 0) : open
  const finalists = Math.max(1, cohort ? seats * COHORT_PER_SEAT : seats * 4 + 6)
  const mine = playerScore(g, s, agency, year) + clamp(fin(o.roll), -6, 6)
  const field = seededCandidates(g, agency, year, finalists - 1).sort((a, b) => b.score - a.score || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  const rank = 1 + field.filter((c) => c.score > mine).length
  const passed = seats > 0 && rank <= seats
  const cut = seats <= 0 ? 100 : field.length >= seats ? Math.round(field[seats - 1].score) : 0
  const admitted = field.slice(0, Math.max(0, seats - (passed ? 1 : 0)))
  const r = seeded(`astro|${familySeed(g)}|mates|${agency}|${year}${outcomeTag(g, year)}`)
  const mates: string[] = []
  const left = admitted.map((c) => c.name)
  while (mates.length < 3 && left.length) mates.push(left.splice(r.int(0, left.length - 1), 1)[0])
  return { rank, finalists, seats, cut, passed, bias: classBias(g, agency, year), you: playerBackground(g, s), mates }
}

function ordinal(n: number): string {
  const tail = n % 100
  if (tail >= 11 && tail <= 13) return `${n}th`
  return `${n}${n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'}`
}

/** 'You placed 9th of 62. The class took 14.' */
export function boardNotice(r: BoardResult): string {
  return `You placed ${ordinal(r.rank)} of ${r.finalists}. The class took ${r.seats}.`
}
