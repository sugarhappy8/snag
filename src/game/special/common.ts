// Shared helpers for special careers, fame, social media and the military.
// Persistent per-career data (skills, discography, medals...) lives in g.flags under
// "special.<key>" so it survives quitting a career; the current gig lives in Job.data.
import { outcomeTag } from '../timeMachine'
import { addHidden, article, count, endJob, formatMoney, notice, shortMoney } from '../core'
import { createPerson } from '../people'
import { nextRandom, pick, rand } from '../rng'
import { characterTalents } from '../talents'
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
  return `${c.id}:${c.firstName}:${c.lastName}:${g.year - c.age}`
}

/** Read-only profile lookup. Safe in menu render code (never writes). */
export function peek<T>(g: GameState, key: string): T | null {
  const v = g.flags[`special.${key}`]
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  if (v.owner !== ownerKey(g)) return null
  return v as unknown as T
}

/** Mutable profile, created from `init` on first use. Only call from actions and hooks. */
export function prof<T extends object>(g: GameState, key: string, init: (g: GameState) => T): T {
  const existing = peek<T>(g, key)
  if (existing) return existing
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
  if (v && typeof v === 'object' && v.age === g.character.age && v.owner === ownerKey(g) && Array.isArray(v.items)) return v.items
  const items = gen()
  g.flags[k] = { age: g.character.age, owner: ownerKey(g), items } as unknown as Json
  return items
}

export function dropList(g: GameState, key: string): void {
  delete g.flags[`special.list.${key}`]
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
  return characterTalents(g).some((t) => re.test(t))
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
    salary: Math.max(0, Math.round(spec.salary)),
    level: spec.level ?? 0,
    performance: spec.performance ?? 60,
    yearsInRole: 0,
    yearsAtCompany: 0,
    data: { ...(spec.data ?? {}), startAge: c.age, roleStartAge: c.age },
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
  const age = g.character.age
  const start = typeof job.data.startAge === 'number' ? job.data.startAge : age - job.yearsAtCompany
  const role = typeof job.data.roleStartAge === 'number' ? job.data.roleStartAge : start
  job.yearsAtCompany = Math.max(0, age - start)
  job.yearsInRole = Math.max(0, age - role)
}

export function setRole(g: GameState, job: Job, title: string, salary: number, level: number): void {
  job.title = title
  job.salary = Math.max(0, Math.round(salary))
  job.level = level
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
  job.performance = Math.round(Math.max(0, Math.min(100, job.performance + delta)))
}

// ---------------------------------------------------------------------------
// Fame

export function addFame(g: GameState, delta: number): void {
  addHidden(g, 'fame', Math.round(delta))
  if (delta > 0) setOwnFlag(g, 'fameActiveAge', g.character.age)
}

export function fameOf(g: GameState): number {
  return g.character.hidden.fame
}

export function isFamous(g: GameState): boolean {
  return g.character.hidden.fame >= FAMOUS
}

/** Move fame a step toward a target level (used by careers with their own popularity stat). */
export function fameToward(g: GameState, target: number, step: number): void {
  const f = g.character.hidden.fame
  if (target > f) addFame(g, Math.min(step, target - f))
  else if (target < f - 5) addHidden(g, 'fame', -Math.min(step / 2, f - target))
}

// ---------------------------------------------------------------------------
// Numbers & text

export function money(n: number): string {
  return formatMoney(n)
}

export function short(n: number): string {
  return shortMoney(n)
}

/** 1.2M / 45.3K / 812 for follower counts and record sales. */
export function compact(n: number): string {
  const a = Math.abs(Math.round(n))
  if (a >= 1e9) return `${(a / 1e9).toFixed(1)}B`
  if (a >= 1e6) return `${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`
  if (a >= 1e3) return `${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}K`
  return String(a)
}

export function clamp100(n: number): number {
  return Math.round(Math.max(0, Math.min(100, n)))
}

/** n scaled by a random factor in [1 - spread, 1 + spread]. */
export function vary(g: GameState, n: number, spread = 0.25): number {
  return Math.round(n * (1 - spread + rand(g) * 2 * spread))
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
  'Jasmine Jetset',
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
  if (!v || typeof v !== 'object' || Array.isArray(v) || v.owner !== ownerKey(g)) return undefined
  return v.value
}

export function setOwnFlag(g: GameState, key: string, value: Json): void {
  g.flags[`special.own.${key}`] = { owner: ownerKey(g), value }
}
