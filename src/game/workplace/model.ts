import { getJobDef, type JobDef } from '../data/jobs'
import { earlyJobDef } from '../history/events-jobs'
import type { GameState, Job } from '../types'
import {
  PROFESSIONAL_JOB_IDS,
  assignmentTemplatesFor,
  workFamilyDef,
  workFamilyForDef,
  type WorkApproach,
  type WorkFamily,
} from './catalog'
import { appointmentIdOf, careerTrack, type CareerTrack, type WorkPlan, type WorkRating } from './state'

export interface WorkplaceContext {
  job: Job
  def: JobDef
  family: WorkFamily
  track: CareerTrack
}
export interface WorkOutcome {
  rating: WorkRating
  performance: number
  mastery: number
  reputation: number
  trust: number
}

export function workJobDef(id: string): JobDef | undefined {
  return getJobDef(id) ?? earlyJobDef(id)
}

export function workplaceContext(g: GameState, job: Job | null = g.character.job): WorkplaceContext | null {
  if (!job || job !== g.character.job || job.category !== 'fulltime' || PROFESSIONAL_JOB_IDS.has(job.defId)) return null
  const def = workJobDef(job.defId)
  if (!def) return null
  const family = workFamilyForDef(def)
  return { job, def, family, track: careerTrack(g, family) }
}

function hash(text: string): number {
  let value = 2166136261
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i)
    value = Math.imul(value, 16777619)
  }
  return value >>> 0
}

/** Pure and stable: opening the menu never consumes simulation RNG. */
export function makeWorkPlan(g: GameState, context: WorkplaceContext, approach: WorkApproach): WorkPlan {
  const templates = assignmentTemplatesFor(context.def, context.family)
  const key = `${appointmentIdOf(g, context.job)}:${g.year}:${context.track.completed}:${context.track.setbacks}`
  const template = templates[hash(key) % templates.length]
  return {
    year: g.year,
    templateId: template.id,
    title: template.title,
    difficulty: template.difficulty,
    approach,
    preparation: 0,
  }
}

export function masteryLabel(mastery: number): string {
  if (mastery >= 85) return 'Expert'
  if (mastery >= 65) return 'Established'
  if (mastery >= 45) return 'Capable'
  return 'Developing'
}

export function ratingLabel(rating: WorkRating): string {
  if (rating === 'outstanding') return 'Outstanding'
  if (rating === 'exceeds') return 'Exceeds expectations'
  if (rating === 'meets') return 'Meets expectations'
  return 'Setback'
}

export function workOutcome(
  roll: number,
  context: WorkplaceContext,
  plan: WorkPlan,
  trust: number,
  householdWork: number,
  bossRelationship: number,
): WorkOutcome {
  const specialty = context.track.specialty ? 0.05 : 0
  const approach = plan.approach === 'quality' ? 0.1 : plan.approach === 'speed' ? -0.12 : 0.02
  const people = plan.approach === 'people' ? (bossRelationship - 50) / 500 : 0
  const odds = Math.max(0.12, Math.min(0.94,
    0.3
      + context.track.mastery / 260
      + context.job.performance / 600
      + trust / 900
      + plan.preparation / 180
      + householdWork / 180
      + specialty
      + approach
      + people
      - (plan.difficulty - 1) * 0.055,
  ))
  const outstandingCutoff = Math.min(odds, Math.max(0.04, odds - 0.52))
  const exceedsCutoff = Math.min(odds, Math.max(outstandingCutoff, odds - 0.2))
  let rating: WorkRating
  if (roll < outstandingCutoff) rating = 'outstanding'
  else if (roll < exceedsCutoff) rating = 'exceeds'
  else if (roll < odds) rating = 'meets'
  else rating = 'setback'
  const changes: Record<WorkRating, Omit<WorkOutcome, 'rating'>> = {
    outstanding: { performance: 8, mastery: 6, reputation: 8, trust: 7 },
    exceeds: { performance: 5, mastery: 4, reputation: 5, trust: 4 },
    meets: { performance: 2, mastery: 2, reputation: 2, trust: 1 },
    setback: { performance: -7, mastery: 2, reputation: -8, trust: -6 },
  }
  return { rating, ...changes[rating] }
}

export function outcomeSummary(context: WorkplaceContext, plan: WorkPlan, rating: WorkRating): string {
  const templates = assignmentTemplatesFor(context.def, context.family)
  const template = templates.find((item) => item.id === plan.templateId)
  const success = (template?.success ?? 'The work landed well').replace(/[.!?]+$/, '')
  if (rating === 'outstanding') return `${success} and became a standout result.`
  if (rating === 'exceeds') return `${success} and beat expectations.`
  if (rating === 'meets') return `${success} with a solid result.`
  return template?.failure ?? 'The work missed its mark and needed follow-up.'
}

export function pathLabel(family: WorkFamily): string {
  return workFamilyDef(family).label
}
