import { addRelationship, addStat, clamp, getPerson, log, notice } from '../core'
import { addCvEntry } from '../cv'
import { householdEffects } from '../household'
import { rand } from '../rng'
import type { CvEntry, GameState, Job } from '../types'
import { workFamilyDef } from './catalog'
import { makeWorkPlan, outcomeSummary, ratingLabel, workOutcome, workplaceContext } from './model'
import { careerTrack, saveCareerTrack, saveWorkplaceState, workplaceState, type CareerTrack, type WorkReview } from './state'

function bounded(value: number): number {
  return Math.round(clamp(value))
}
function updatePortfolio(g: GameState, familyLabel: string, tags: string[], track: CareerTrack, company: string): void {
  const title = `${familyLabel} portfolio`
  const detail = `${track.completed} successful work plan${track.completed === 1 ? '' : 's'}; reputation ${track.reputation}/100${track.specialty ? `; specialty: ${track.specialty}` : ''}.`
  const cv = g.character.cv
  const existingIndex = cv?.findIndex((entry) => entry.source === 'workplace' && entry.title === title) ?? -1
  const existing = existingIndex >= 0 ? cv?.[existingIndex] as CvEntry : undefined
  if (existing) {
    if (cv) {
      for (let index = cv.length - 1; index > existingIndex; index--) {
        if (cv[index].source === 'workplace' && cv[index].title === title) cv.splice(index, 1)
      }
    }
    existing.org = company
    existing.endAge = g.character.age
    existing.detail = detail
    existing.strength = Math.min(8, 2 + Math.floor(track.completed / 2))
    existing.tags = [...tags]
    return
  }
  addCvEntry(g, {
    kind: 'project',
    title,
    org: company,
    startAge: g.character.age,
    endAge: g.character.age,
    detail,
    strength: Math.min(8, 2 + Math.floor(track.completed / 2)),
    tags,
    source: 'workplace',
  })
}

function settlePlan(g: GameState, job: Job): void {
  const context = workplaceContext(g, job)
  if (!context) return
  const state = workplaceState(g, job)
  const plan = state.plan
  if (!plan || plan.year >= g.year || state.lastSettledPlanYear >= plan.year) return

  const foundBoss = getPerson(g, job.bossId)
  const boss = foundBoss?.alive ? foundBoss : undefined
  const outcome = workOutcome(rand(g), context, plan, state.trust, householdEffects(g).work, boss?.relationship ?? 50)
  const summary = outcomeSummary(context, plan, outcome.rating)
  const track = careerTrack(g, context.family)
  track.mastery = bounded(track.mastery + outcome.mastery)
  track.reputation = bounded(track.reputation + outcome.reputation)
  if (outcome.rating === 'setback') track.setbacks += 1
  else track.completed += 1
  state.trust = bounded(state.trust + outcome.trust)
  if (outcome.rating === 'setback' && plan.approach === 'speed') state.warnings = Math.min(3, state.warnings + 1)
  job.performance = bounded(job.performance + outcome.performance - (state.warnings >= 3 ? 2 : 0))
  if (boss) addRelationship(g, boss, outcome.rating === 'setback' ? -3 : plan.approach === 'people' ? 3 : 1)
  if (plan.approach === 'people') {
    for (const coworker of g.people.filter((person) => person.alive && person.relation === 'coworker' && person.contextId === job.company)) {
      addRelationship(g, coworker, outcome.rating === 'setback' ? -1 : 2)
    }
  }
  if (outcome.rating === 'setback') addStat(g, 'happiness', -2)
  else if (outcome.rating === 'outstanding') addStat(g, 'happiness', 3)

  const review: WorkReview = { year: g.year, title: plan.title, rating: outcome.rating, summary }
  state.lastSettledPlanYear = plan.year
  state.lastReview = review
  state.reviews = [...state.reviews, review].slice(-6)
  state.plan = null
  saveCareerTrack(g, context.family, track)
  const pack = workFamilyDef(context.family)
  if (outcome.rating !== 'setback') updatePortfolio(g, pack.label, pack.tags, track, job.company)
  log(g, `${plan.title}: ${ratingLabel(outcome.rating).toLowerCase()}. ${summary}`, outcome.rating === 'setback' ? 'bad' : outcome.rating === 'outstanding' ? 'good' : 'neutral')
  if (outcome.rating === 'outstanding' || outcome.rating === 'setback') {
    notice(g, `Annual Review: ${ratingLabel(outcome.rating)}`, `${summary} Performance is ${job.performance}%, employer trust is ${state.trust}/100, and your ${pack.label.toLowerCase()} reputation is ${track.reputation}/100.`, { emoji: pack.emoji, tone: outcome.rating === 'setback' ? 'bad' : 'good' })
  }
  saveWorkplaceState(job, state)
}

/** Resolve the prior plan once, then provide a safe default for the new work year. */
export function yearlyWorkplace(g: GameState, job: Job = g.character.job!): void {
  const context = workplaceContext(g, job)
  if (!context || !g.character.alive || g.character.prison) return
  settlePlan(g, job)
  const refreshed = workplaceContext(g, job)
  if (!refreshed) return
  const state = workplaceState(g, job)
  if (!state.plan) {
    state.lastSettledPlanYear = Math.min(state.lastSettledPlanYear, g.year - 1)
    state.plan = makeWorkPlan(g, refreshed, 'quality')
    saveWorkplaceState(job, state)
  }
}
