import type { GameState, Job, Json } from '../types'
import { WORK_FAMILIES, type WorkApproach, type WorkFamily } from './catalog'

export type WorkRating = 'outstanding' | 'exceeds' | 'meets' | 'setback'

export interface WorkPlan {
  year: number
  templateId: string
  title: string
  difficulty: number
  approach: WorkApproach
  preparation: number
}
export interface WorkReview {
  year: number
  title: string
  rating: WorkRating
  summary: string
}

export interface WorkplaceState {
  v: 1
  appointmentId: string
  trust: number
  warnings: number
  lastSettledPlanYear: number
  plan: WorkPlan | null
  lastReview: WorkReview | null
  reviews: WorkReview[]
}

export interface CareerTrack {
  mastery: number
  reputation: number
  completed: number
  setbacks: number
  specialty: string
}

export interface CareerProfile {
  v: 1
  owner: string
  tracks: Partial<Record<WorkFamily, CareerTrack>>
}

const APPROACHES: readonly WorkApproach[] = ['quality', 'speed', 'people']
const RATINGS: readonly WorkRating[] = ['outstanding', 'exceeds', 'meets', 'setback']

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function numberIn(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback
}

function integerIn(value: unknown, fallback: number, min: number, max: number): number {
  return Math.round(numberIn(value, fallback, min, max))
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : ''
}

function ownerOf(g: GameState): string {
  return `${g.lifeId}:${g.generation}:${g.character.id}`
}

export function appointmentIdOf(g: GameState, job: Job): string {
  const stored = job.data.appointmentId
  if (typeof stored === 'string' && stored.length > 0) return stored.slice(0, 160)
  return `${g.lifeId}:${g.character.id}:${job.defId}:${job.company}:${g.character.age - job.yearsAtCompany}`.slice(0, 160)
}

function planFrom(value: unknown): WorkPlan | null {
  const raw = record(value)
  const approach = APPROACHES.includes(raw.approach as WorkApproach) ? raw.approach as WorkApproach : null
  const title = text(raw.title, 120)
  const templateId = text(raw.templateId, 80)
  if (!approach || !title || !templateId || typeof raw.year !== 'number' || !Number.isFinite(raw.year)) return null
  return {
    year: integerIn(raw.year, -1, -100000, 100000),
    templateId,
    title,
    difficulty: integerIn(raw.difficulty, 3, 1, 5),
    approach,
    preparation: integerIn(raw.preparation, 0, 0, 30),
  }
}

function reviewFrom(value: unknown): WorkReview | null {
  const raw = record(value)
  const rating = RATINGS.includes(raw.rating as WorkRating) ? raw.rating as WorkRating : null
  const title = text(raw.title, 120)
  const summary = text(raw.summary, 240)
  if (!rating || !title || !summary || typeof raw.year !== 'number' || !Number.isFinite(raw.year)) return null
  return { year: integerIn(raw.year, -1, -100000, 100000), title, rating, summary }
}

function blankWorkplace(g: GameState, job: Job): WorkplaceState {
  return {
    v: 1,
    appointmentId: appointmentIdOf(g, job),
    trust: 50,
    warnings: 0,
    lastSettledPlanYear: -1,
    plan: null,
    lastReview: null,
    reviews: [],
  }
}

/** A defensive, side-effect-free view of the current employer-local record. */
export function workplaceState(g: GameState, job: Job): WorkplaceState {
  const raw = record(job.data.workplace)
  const expected = appointmentIdOf(g, job)
  if (raw.appointmentId !== expected) return blankWorkplace(g, job)
  const lastSettledPlanYear = integerIn(raw.lastSettledPlanYear, -1, -100000, g.year)
  const parsedPlan = planFrom(raw.plan)
  // Plans are only ever created for the current year. Clear impossible future plans and
  // half-saved records that already carry their own settlement marker so they cannot
  // permanently lock the player out of choosing a new plan.
  const plan = parsedPlan && parsedPlan.year <= g.year && lastSettledPlanYear < parsedPlan.year
    ? parsedPlan
    : null
  const parsedReviews = Array.isArray(raw.reviews)
    ? raw.reviews.map(reviewFrom).filter((item): item is WorkReview => item !== null)
    : []
  const reviewKeys = new Set<string>()
  const reviews = parsedReviews
    .slice()
    .reverse()
    .filter((review) => {
      const key = `${review.year}\u0000${review.title}`
      if (reviewKeys.has(key)) return false
      reviewKeys.add(key)
      return true
    })
    .slice(0, 6)
    .reverse()
  return {
    v: 1,
    appointmentId: expected,
    trust: integerIn(raw.trust, 50, 0, 100),
    warnings: integerIn(raw.warnings, 0, 0, 3),
    lastSettledPlanYear,
    plan,
    lastReview: reviewFrom(raw.lastReview),
    reviews,
  }
}

export function saveWorkplaceState(job: Job, state: WorkplaceState): void {
  job.data.workplace = state as unknown as Json
}

function blankTrack(): CareerTrack {
  return { mastery: 25, reputation: 35, completed: 0, setbacks: 0, specialty: '' }
}

function trackFrom(value: unknown, family: WorkFamily): CareerTrack {
  const raw = record(value)
  const specialty = text(raw.specialty, 80)
  return {
    mastery: integerIn(raw.mastery, 25, 0, 100),
    reputation: integerIn(raw.reputation, 35, 0, 100),
    completed: integerIn(raw.completed, 0, 0, 10000),
    setbacks: integerIn(raw.setbacks, 0, 0, 10000),
    specialty: WORK_FAMILIES[family].specialties.includes(specialty) ? specialty : '',
  }
}

/** Cross-employer career progress. An owner stamp prevents inheritance by another life. */
export function careerProfile(g: GameState): CareerProfile {
  const raw = record(g.flags.careerProfile)
  const owner = ownerOf(g)
  if (raw.owner !== owner) return { v: 1, owner, tracks: {} }
  const tracksRaw = record(raw.tracks)
  const tracks: Partial<Record<WorkFamily, CareerTrack>> = {}
  for (const family of ['office', 'technical', 'care', 'civic', 'education', 'creative', 'service', 'field', 'transport'] as const) {
    if (tracksRaw[family] !== undefined) tracks[family] = trackFrom(tracksRaw[family], family)
  }
  return { v: 1, owner, tracks }
}

export function careerTrack(g: GameState, family: WorkFamily): CareerTrack {
  return careerProfile(g).tracks[family] ?? blankTrack()
}

export function saveCareerTrack(g: GameState, family: WorkFamily, track: CareerTrack): void {
  const profile = careerProfile(g)
  profile.tracks[family] = trackFrom(track, family)
  g.flags.careerProfile = profile as unknown as Json
}
