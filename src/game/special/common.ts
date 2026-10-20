// Shared helpers for special careers, fame, social media and the military.
// Persistent per-career data (skills, discography, medals...) lives in g.flags under
// "special.<key>" so it survives quitting a career; the current gig lives in Job.data.
import { outcomeTag } from '../timeMachine'
import { addHidden, article, count, endJob, formatMoney, notice, shortMoney } from '../core'
import { typicalIncome, US_TYPICAL_INCOME } from '../events/wealth-core'
import { createPerson } from '../people'
import { nextRandom, pick, rand } from '../rng'
import { ageCeiling, liftSkill, type MasteryFamily } from '../mastery'
import { effectiveTalents, hasMainCharacter } from '../talents'
import type { CareerRecord, DegreeKind, GameState, Gender, Job, JobCategory, Json, Person, Tone } from '../types'

/** Fame (0-100) at which the game treats you as a celebrity. */
export const FAMOUS = 25

// ---------------------------------------------------------------------------
// Persistent profiles

/**
 * Identifies the current character, so profiles left in g.flags by a previous generation
 * (if flags carry over to a child's life) are never mistaken for the child's own.
 */
export function ownerKey(g: GameState): string {
  const c = g.character
  const generation = Number.isFinite(g.generation) ? Math.max(0, Math.round(g.generation)) : 0
  return `v2:${generation}:${c.id}`
}

/**
 * Match both the stable owner key and the name-based key used by releases through v1.9.1.
 * The legacy check deliberately ignores the name segment: marriage, divorce and renaming must
 * not orphan a profile or make a once-per-year settlement payable again.
 */
export function ownerMatches(g: GameState, value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (value === ownerKey(g)) return true
  const c = g.character
  const born = Number.isFinite(g.year) && Number.isFinite(c.age) ? g.year - c.age : null
  return born !== null && value.startsWith(`${c.id}:`) && value.endsWith(`:${born}`)
}

/** Read-only profile lookup. Safe in menu render code (never writes). */
export function peek<T>(g: GameState, key: string): T | null {
  const v = g.flags[`special.${key}`]
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  if (!ownerMatches(g, v.owner)) return null
  return v as unknown as T
}

/** Mutable profile, created from `init` on first use. Only call from actions and hooks. */
export function prof<T extends object>(g: GameState, key: string, init: (g: GameState) => T): T {
  const existing = peek<T>(g, key)
  if (existing) {
    // Mutable access upgrades a legacy owner key without making read-only menu lookup write.
    ;(existing as T & { owner: string }).owner = ownerKey(g)
    return existing
  }
  const created = { ...init(g), owner: ownerKey(g) }
  g.flags[`special.${key}`] = created as unknown as Json
  return created
}

/** Typed view of a JSON record (Job.data etc.). Mutations write through. */
export function view<T>(rec: Record<string, Json>): T {
  return rec as unknown as T
}

/**
 * A list generated once per age and cached in flags (job listings, teams, agencies...),
 * so reopening a menu doesn't reroll it. Only call from actions and hooks.
 */
export function yearlyList<T>(g: GameState, key: string, gen: () => T[]): T[] {
  const k = `special.list.${key}`
  const v = g.flags[k] as unknown as { age: number; owner: string; items: T[] } | undefined
  if (v && typeof v === 'object' && v.age === g.character.age && ownerMatches(g, v.owner) && Array.isArray(v.items)) return v.items
  const items = gen()
  g.flags[k] = { age: g.character.age, owner: ownerKey(g), items } as unknown as Json
  return items
}

export function dropList(g: GameState, key: string): void {
  delete g.flags[`special.list.${key}`]
}

/**
 * Claim one yearly-career settlement for this character/year/age tick. The age is included for
 * old saves and tests that can legitimately advance age before their calendar is repaired.
 */
export function claimYearly(g: GameState, key: string): boolean {
  const flag = `special.yearly.${key}`
  const raw = g.flags[flag]
  const year = Number.isFinite(g.year) ? Math.max(-10_000, Math.min(100_000, Math.round(g.year))) : 0
  const age = Number.isFinite(g.character.age) ? Math.max(0, Math.min(10_000, Math.round(g.character.age))) : 0
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && ownerMatches(g, raw.owner) && raw.year === year && raw.age === age) return false
  g.flags[flag] = { owner: ownerKey(g), year, age }
  return true
}

/**
 * A deterministic 0-1 roll for this year of this life and `key`. Never touches g.rng, so it
 * is safe in menu code; used for hidden "what's hot this year" facts that talent hints reveal.
 */
export function stableRoll(g: GameState, key: string): number {
  const s = `${g.lifeId}${outcomeTag(g, g.year)}|${g.year}|${key}`
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return nextRandom(h | 0)[0]
}

/** Spread into a ChoiceOption: `{ hint }` when there is a purple hint, nothing otherwise. */
export function withHint(text: string | null | undefined): { hint?: string } {
  return text ? { hint: text } : {}
}

/** A stable pick for this year of this life (see stableRoll). */
export function stableChoice<T>(g: GameState, key: string, items: readonly T[]): T {
  return items[Math.min(items.length - 1, Math.floor(stableRoll(g, key) * items.length))]
}

// ---------------------------------------------------------------------------
// Messages

/** Result popup. */
export function say(g: GameState, title: string, text: string, emoji?: string, tone: Tone = 'neutral'): void {
  notice(g, title, text, { emoji, tone })
}

/** Plain popup with no tone (refusals, rules, menus). */
export function tell(g: GameState, title: string, text: string, emoji?: string): void {
  notice(g, title, text, { emoji })
}

// ---------------------------------------------------------------------------
// Gating

/** Standard reason an action is unavailable (dead, in prison, too young), or null. */
export function blocked(g: GameState, minAge = 0): string | null {
  const c = g.character
  if (!c.alive) return 'You are no longer alive.'
  if (c.prison) return "You can't do that while you're behind bars."
  if (c.age < minAge) return `You must be at least ${minAge} years old.`
  return null
}

const COLLEGE: DegreeKind[] = ['bachelor', 'master', 'doctorate', 'jd', 'md', 'mba', 'dds', 'pharmd', 'dvm']

export function hasCollegeDegree(g: GameState): boolean {
  return g.character.education.degrees.some((d) => COLLEGE.includes(d.kind))
}

export function hasHighSchool(g: GameState): boolean {
  const e = g.character.education
  return (
    e.completed.includes('high') ||
    e.degrees.some((d) => d.kind === 'highschool' || d.kind === 'ged' || d.kind === 'associate') ||
    hasCollegeDegree(g)
  )
}

/** Has (or had) any university education. */
export function attendedUniversity(g: GameState): boolean {
  const e = g.character.education
  return (
    hasCollegeDegree(g) ||
    e.current?.level === 'university' ||
    e.current?.level === 'graduate' ||
    e.completed.includes('university') ||
    e.droppedOut.includes('university')
  )
}

export function convictions(g: GameState): number {
  return g.character.criminalRecord.filter((r) => r.convicted).length
}

export function hasAddiction(g: GameState): boolean {
  return g.character.conditions.some((x) => x.kind === 'addiction')
}

/**
 * True when any of the character's talents (picked before birth or discovered as a kid)
 * matches. Prefer talents.ts hasTalent(g, id) in new code.
 */
export function talentMatches(g: GameState, re: RegExp): boolean {
  return effectiveTalents(g).some((t) => re.test(t))
}

// ---------------------------------------------------------------------------
// Jobs

export interface HireSpec {
  defId: string
  title: string
  company: string
  salary: number
  category?: JobCategory
  level?: number
  performance?: number
  data?: Record<string, Json>
}

/** Start a special/military job, quitting the current main job. Returns the old title, if any. */
export function hire(g: GameState, spec: HireSpec): { job: Job; quit: string | null } {
  const c = g.character
  let quit: string | null = null
  if (c.job) {
    quit = c.job.title
    endJob(g, 'job', 'quit')
  }
  const job: Job = {
    defId: spec.defId,
    title: spec.title,
    company: spec.company,
    category: spec.category ?? 'special',
    salary: Number.isFinite(spec.salary) ? Math.max(0, Math.min(1e15, Math.round(spec.salary))) : 0,
    level: Number.isFinite(spec.level) ? Math.max(0, Math.min(1e6, Math.round(spec.level!))) : 0,
    // Main Character Syndrome starts a special career near the top of the performance scale.
    performance: clamp100(hasMainCharacter(g) ? Math.max(Number.isFinite(spec.performance) ? spec.performance! : 60, 78) : (Number.isFinite(spec.performance) ? spec.performance! : 60)),
    yearsInRole: 0,
    yearsAtCompany: 0,
    data: {
      ...(spec.data ?? {}),
      startAge: c.age,
      roleStartAge: c.age,
      appointmentId: `${g.year}:${c.age}:${g.counters.jobs ?? 0}`,
    },
  }
  c.job = job
  count(g, 'jobs')
  return { job, quit }
}

/** " You quit your job as a Barista." or "". */
export function quitNote(quit: string | null): string {
  return quit ? ` You quit your job as ${article(quit)} ${quit} to make it happen.` : ''
}

/** The player's main job if it is this special career (by defId or defId prefix ending in '.'). */
export function myJob(g: GameState, defId: string): Job | null {
  const j = g.character.job
  if (!j || (j.category !== 'special' && j.category !== 'military')) return null
  if (defId.endsWith('.') ? j.defId.startsWith(defId) : j.defId === defId) return j
  return null
}

/** Recompute tenure from the stored start ages (idempotent, safe if another hook also counts). */
export function syncTenure(g: GameState, job: Job): void {
  const age = Number.isFinite(g.character.age) ? Math.max(0, Math.min(10_000, g.character.age)) : 0
  const fallbackYears = Number.isFinite(job.yearsAtCompany) ? Math.max(0, job.yearsAtCompany) : 0
  const start = typeof job.data.startAge === 'number' && Number.isFinite(job.data.startAge) ? job.data.startAge : age - fallbackYears
  const role = typeof job.data.roleStartAge === 'number' && Number.isFinite(job.data.roleStartAge) ? job.data.roleStartAge : start
  job.yearsAtCompany = Math.max(0, Math.min(10_000, Math.round(age - start)))
  job.yearsInRole = Math.max(0, Math.min(10_000, Math.round(age - role)))
}

export function setRole(g: GameState, job: Job, title: string, salary: number, level: number): void {
  job.title = title
  job.salary = Number.isFinite(salary) ? Math.max(0, Math.min(1e15, Math.round(salary))) : 0
  job.level = Number.isFinite(level) ? Math.max(0, Math.min(1e6, Math.round(level))) : 0
  job.data.roleStartAge = g.character.age
  job.yearsInRole = 0
}

export function promote(g: GameState, job: Job, title: string, salary: number, level: number): void {
  setRole(g, job, title, salary, level)
  count(g, 'promotions')
}

export function leave(g: GameState, reason: CareerRecord['reason']): void {
  endJob(g, 'job', reason)
}

export function bump(job: Job, delta: number): void {
  const performance = Number.isFinite(job.performance) ? job.performance : 0
  job.performance = clamp100(performance + (Number.isFinite(delta) ? delta : 0))
}

// ---------------------------------------------------------------------------
// Fame

export function addFame(g: GameState, delta: number): void {
  if (!Number.isFinite(delta)) return
  const change = Math.max(-100, Math.min(100, Math.round(delta)))
  if (!Number.isFinite(g.character.hidden.fame)) g.character.hidden.fame = 0
  addHidden(g, 'fame', change)
  if (change > 0) setOwnFlag(g, 'fameActiveAge', g.character.age)
}

export function fameOf(g: GameState): number {
  return clamp100(g.character.hidden.fame)
}

export function isFamous(g: GameState): boolean {
  return fameOf(g) >= FAMOUS
}

/** Move fame a step toward a target level (used by careers with their own popularity stat). */
export function fameToward(g: GameState, target: number, step: number): void {
  const f = fameOf(g)
  if (!Number.isFinite(target) || !Number.isFinite(step) || step <= 0) return
  const goal = clamp100(target), pace = Math.min(100, step)
  if (goal > f) addFame(g, Math.min(pace, goal - f))
  else if (goal < f - 5) addFame(g, -Math.min(pace / 2, f - goal))
}

// ---------------------------------------------------------------------------
// Numbers & text

export function money(n: number): string {
  return formatMoney(n)
}

export function short(n: number): string {
  return shortMoney(n)
}

/**
 * How a career's pay table (written in US 2020s dollars) compares with what the same work pays
 * here and now: a typical local income over the US one. Exactly 1 for the US from 2026, 0.3 in
 * 1930, 0.2 in Nigeria today; never above 1.6 (typicalIncome caps the country's wealth). Reads
 * only g.year and the country, draws nothing.
 */
export function payScale(g: GameState): number {
  const scale = typicalIncome(g) / US_TYPICAL_INCOME
  return Number.isFinite(scale) && scale > 0 ? scale : 1
}

/** 1.2M / 45.3K / 812 for follower counts and record sales. */
export function compact(n: number): string {
  const a = Number.isFinite(n) ? Math.abs(Math.round(n)) : 0
  if (a >= 1e9) return `${(a / 1e9).toFixed(1)}B`
  if (a >= 1e6) return `${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`
  if (a >= 1e3) return `${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}K`
  return String(a)
}

export function clamp100(n: number): number {
  return Number.isFinite(n) ? Math.round(Math.max(0, Math.min(100, n))) : 0
}

/** n scaled by a random factor in [1 - spread, 1 + spread]. */
export function vary(g: GameState, n: number, spread = 0.25): number {
  const base = Number.isFinite(n) ? n : 0
  const width = Number.isFinite(spread) ? Math.max(0, Math.min(1, spread)) : .25
  const value = base * (1 - width + rand(g) * 2 * width)
  return Number.isFinite(value) ? Math.round(value) : 0
}

export function either<T>(g: GameState, items: readonly T[]): T {
  return pick(g, items)
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

export function titleCase(s: string): string {
  return s.replace(/\b\w/g, (m) => m.toUpperCase())
}

/** Make a generated or typed name safe and short. */
export function cleanName(s: string | undefined, fallback: string, max = 40): string {
  const t = (s ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
  return t || fallback
}

export function num(v: Json | undefined, def = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : def
}

export function str(v: Json | undefined, def = ''): string {
  return typeof v === 'string' ? v : def
}

// ---------------------------------------------------------------------------
// People

/** Add a coworker-style contact tied to a company/band/team (removed by endJob unless befriended). */
export function addColleague(
  g: GameState,
  company: string,
  occupation: string,
  opts: { gender?: Gender; ageOffset?: [number, number]; relationship?: number } = {},
): Person {
  const age = Math.max(18, g.character.age + Math.round((opts.ageOffset?.[0] ?? -8) + rand(g) * ((opts.ageOffset?.[1] ?? 8) - (opts.ageOffset?.[0] ?? -8))))
  return createPerson(g, {
    relation: 'coworker',
    age,
    gender: opts.gender,
    occupation,
    contextId: company,
    relationship: opts.relationship ?? 50,
  })
}

/** Fictional celebrities (never real people). */
export const CELEBS = [
  'Brick Stallworth',
  'Tiffani Glamourton',
  'DJ Ruckus',
  'Chaz Brightwater',
  'Madame Velvet',
  'Kenzie Sparks',
  'Lord Fizzwick',
  'Skyler Monroe-Vance',
  'Big Tony Marbles',
  'Lulu Diamante',
  'Rex Thunderbolt',
  'Princess Pixel',
  'Dakota Sunshine',
  'Yung Glitter',
  'Sir Reginald Plum',
  'Aurora Blaze',
  'Vince Velour',
  'Nova St. Clair',
  'Marco Bellissimo',
  'Jasmine Starling',
  'Chef Gordo Flambé',
  'Captain Crunchwell',
  'Bianca Moonbeam',
  'Lil Tadpole',
]

// ---------------------------------------------------------------------------
// Skills shared with Activities > Mind & Body (lessons write the same flags)

/** Lesson skills stored by the activities module: 'acting', 'voice', 'modeling' (0-100). */
export function flagSkill(g: GameState, id: string): number {
  const v = g.flags[`skill.${id}`]
  return typeof v === 'number' && Number.isFinite(v) ? clamp100(v) : 0
}

export function actingSkill(g: GameState): number {
  return flagSkill(g, 'acting')
}

export function setFlagSkill(g: GameState, id: string, value: number): void {
  g.flags[`skill.${id}`] = clamp100(value)
}

function instrumentRecord(g: GameState): Record<string, Json> {
  const rec = g.flags.instruments
  return rec && typeof rec === 'object' && !Array.isArray(rec) ? rec : {}
}

/** Instrument skill (0-100) from Mind & Body > Instruments; 'Voice' maps to voice lessons. */
export function instrumentSkill(g: GameState, name: string): number {
  if (name === 'Voice') return flagSkill(g, 'voice')
  const v = instrumentRecord(g)[name]
  return typeof v === 'number' && Number.isFinite(v) ? clamp100(v) : 0
}

export function setInstrumentSkill(g: GameState, name: string, value: number): void {
  if (name === 'Voice') return setFlagSkill(g, 'voice', value)
  g.flags.instruments = { ...instrumentRecord(g), [name]: clamp100(value) }
}

/**
 * Main Character Syndrome: playing an instrument (or singing) for the first time is already
 * mastery, to the ceiling of the age. Returns the new skill. Everybody else is untouched.
 */
export function masterInstrument(g: GameState, name: string): number {
  const now = instrumentSkill(g, name)
  const top = ageCeiling(g.character.age, { from: 5, full: 15, floor: 35 })
  const next = liftSkill(g, name === 'Voice' ? 'lesson.voice' : `instrument.${name}`, name === 'Voice' ? 'stage' : 'instrument', name === 'Voice' ? 'singing' : name.toLowerCase(), now, top)
  if (next !== now) setInstrumentSkill(g, name, next)
  return next
}

/** Main Character Syndrome for a 0-100 flag skill (acting, modeling, voice...). */
export function masterFlagSkill(g: GameState, id: string, family: MasteryFamily, subject: string, top: number): number {
  const now = flagSkill(g, id)
  const next = liftSkill(g, `lesson.${id}`, family, subject, now, top)
  if (next !== now) setFlagSkill(g, id, next)
  return next
}

/** Instruments the character has any skill in ('Voice' first when they've had voice lessons). */
export function knownInstruments(g: GameState): string[] {
  const rec = instrumentRecord(g)
  const list = Object.keys(rec).filter((k) => typeof rec[k] === 'number' && (rec[k] as number) > 0)
  if (flagSkill(g, 'voice') > 0) list.unshift('Voice')
  return list
}

// ---------------------------------------------------------------------------
// Per-character flags (g.flags survives into the next generation, so tag the owner)

export function ownFlag(g: GameState, key: string): Json | undefined {
  const v = g.flags[`special.own.${key}`]
  if (!v || typeof v !== 'object' || Array.isArray(v) || !ownerMatches(g, v.owner)) return undefined
  return v.value
}

export function setOwnFlag(g: GameState, key: string, value: Json): void {
  g.flags[`special.own.${key}`] = { owner: ownerKey(g), value }
}
