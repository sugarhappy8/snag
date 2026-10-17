import type { GameState, Job, Json } from '../types'
import { resolveWorkplaceJobDef, WORK_FAMILIES, workFamilyForDef, type WorkFamily } from './catalog'
import { appointmentIdOf, careerTrack } from './state'

interface FamilyExperience {
  fulltimeYears: number
  partTimeEquivalentYears: number
  year: number | null
  annualFulltime: number
  annualPartTime: number
}

interface ExperienceProfile {
  v: 1
  owner: string
  tracks: Partial<Record<WorkFamily, FamilyExperience>>
}

const MAX_YEARS = 120
const MAX_PT_YEAR = 0.75
const FAMILIES = Object.keys(WORK_FAMILIES) as WorkFamily[]

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function bounded(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback
}

function precise(value: number): number {
  return Math.round(value * 1000) / 1000
}

function ownerOf(g: GameState): string {
  return `${g.lifeId}:${g.generation}:${g.character.id}`
}

function blankExperience(): FamilyExperience {
  return { fulltimeYears: 0, partTimeEquivalentYears: 0, year: null, annualFulltime: 0, annualPartTime: 0 }
}

/** Read only recorded work: titles and legacy tenure do not identify historical fields. */
function experienceProfile(g: GameState): ExperienceProfile {
  const owner = ownerOf(g)
  const raw = record(g.flags.careerExperience)
  const profile: ExperienceProfile = { v: 1, owner, tracks: {} }
  if (raw.owner !== owner || raw.v !== 1) return profile
  const tracks = record(raw.tracks)
  for (const family of FAMILIES) {
    if (tracks[family] === undefined) continue
    const saved = record(tracks[family])
    const fulltimeYears = Math.floor(bounded(saved.fulltimeYears, 0, 0, MAX_YEARS))
    const partTimeEquivalentYears = precise(bounded(saved.partTimeEquivalentYears, 0, 0, MAX_YEARS - fulltimeYears))
    const validYear = typeof saved.year === 'number' && Number.isInteger(saved.year) && saved.year >= -100000 && saved.year <= g.year
    const annualFulltime = validYear && fulltimeYears > 0 && saved.annualFulltime === 1 ? 1 : 0
    profile.tracks[family] = {
      fulltimeYears,
      partTimeEquivalentYears,
      year: validYear ? saved.year as number : null,
      annualFulltime,
      annualPartTime: annualFulltime || !validYear ? 0 : precise(bounded(saved.annualPartTime, 0, 0, Math.min(MAX_PT_YEAR, partTimeEquivalentYears))),
    }
  }
  return profile
}

function context(g: GameState, job: Job) {
  if (!g.character.alive || g.character.prison || (job !== g.character.job && job !== g.character.partTimeJob)) return null
  if (job.category !== 'fulltime' && job.category !== 'parttime') return null
  const def = resolveWorkplaceJobDef(job.defId)
  if (!def) return null
  return { def, family: workFamilyForDef(def), partTime: job === g.character.partTimeJob || job.category === 'parttime' }
}

/** Called after one working year, not at hire. No pay, RNG, or qualification changes. */
export function recordWorkExperience(g: GameState, job: Job): void {
  const ctx = context(g, job)
  if (!ctx || !Number.isInteger(g.year) || g.year < -100000 || g.year > 100000 || !Number.isFinite(job.yearsAtCompany) || job.yearsAtCompany < 1) return
  const owner = ownerOf(g)
  const appointment = appointmentIdOf(g, job)
  const stamp = record(job.data.careerExperienceStamp)
  if (stamp.owner === owner && stamp.appointment === appointment && stamp.year === g.year) return

  const profile = experienceProfile(g)
  const track = profile.tracks[ctx.family] ?? blankExperience()
  if (track.year !== g.year) {
    track.year = g.year
    track.annualFulltime = 0
    track.annualPartTime = 0
  }
  const remaining = Math.max(0, MAX_YEARS - track.fulltimeYears - track.partTimeEquivalentYears)
  if (!ctx.partTime && !track.annualFulltime) {
    // A full-time year replaces this year's same-field part-time credit, regardless
    // of settlement order. Two simultaneous jobs never create two field years.
    const credit = Math.min(1, remaining + track.annualPartTime)
    if (credit >= 1) {
      track.partTimeEquivalentYears = precise(Math.max(0, track.partTimeEquivalentYears - track.annualPartTime))
      track.fulltimeYears += 1
      track.annualFulltime = 1
      track.annualPartTime = 0
    }
  } else if (ctx.partTime && !track.annualFulltime) {
    const hours = bounded(job.data.hours, bounded(ctx.def.hours, 15, 0, 30), 0, 30)
    // Maximum, not sum: switching employers cannot farm another part-time year.
    const annual = precise(Math.min(MAX_PT_YEAR, hours / 40))
    const extra = Math.min(remaining, Math.max(0, annual - track.annualPartTime))
    track.partTimeEquivalentYears = precise(track.partTimeEquivalentYears + extra)
    track.annualPartTime = precise(track.annualPartTime + extra)
  }
  profile.tracks[ctx.family] = track
  g.flags.careerExperience = profile as unknown as Json
  job.data.careerExperienceStamp = { owner, appointment, year: g.year }
}

/** Small additive odds only. Existing performance, tenure, and qualification gates remain authoritative. */
export function careerProgressionBonus(g: GameState, job: Job): number {
  const ctx = context(g, job)
  if (!ctx) return 0
  const experience = experienceProfile(g).tracks[ctx.family] ?? blankExperience()
  const years = experience.fulltimeYears + experience.partTimeEquivalentYears
  if (years <= 0) return 0
  const track = careerTrack(g, ctx.family)
  const maturity = Math.min(1, years / 3)
  const mastery = Math.max(0, track.mastery - 25) / 75 * 0.01
  const reputation = Math.max(0, track.reputation - 35) / 65 * 0.01
  const boss = g.people.find((person) => person.id === job.bossId && person.alive && person.relation === 'boss' && person.contextId === job.company)
  const support = boss ? bounded(boss.relationship, 0, 50, 100) - 50 : 0
  const reference = record(g.flags.partTimeShifts)
  const hasReference = reference.v === 1 && reference.owner === ownerOf(g) && reference.referenceFamily === ctx.family
    && typeof reference.referenceYear === 'number' && Number.isInteger(reference.referenceYear)
    && reference.referenceYear >= -100000 && reference.referenceYear <= g.year
  const bonus = Math.min(years, 10) * 0.002 + maturity * (mastery + reputation + Math.max(0, support) / 50 * 0.005 + (hasReference ? 0.005 : 0))
  return Math.round(Math.max(0, Math.min(0.05, bonus)) * 1000000) / 1000000
}

/** A pure menu summary. Reading an old save never writes a migration or consumes RNG. */
export function careerExperienceSummary(g: GameState, job: Job): string {
  const ctx = context(g, job)
  if (!ctx) return ''
  const track = experienceProfile(g).tracks[ctx.family] ?? blankExperience()
  const label = WORK_FAMILIES[ctx.family].label
  if (!track.fulltimeYears && !track.partTimeEquivalentYears) return `${label}: no recorded field experience yet. Existing job requirements still use your career history.`
  const years = `${track.fulltimeYears} full-time + ${track.partTimeEquivalentYears} part-time equivalent years`
  const edge = Math.round(careerProgressionBonus(g, job) * 1000) / 10
  return `${label}: ${years} • progression edge +${edge} percentage points (existing requirements still apply).`
}
