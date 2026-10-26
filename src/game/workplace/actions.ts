import { addRelationship, addStat, getPerson, notice, useYearAction, yearActionsUsed } from '../core'
import { addCvEntry } from '../cv'
import type { GameState } from '../types'
import { workFamilyDef, type WorkApproach } from './catalog'
import { makeWorkPlan, workplaceContext } from './model'
import { careerTrack, saveCareerTrack, saveWorkplaceState, workplaceState } from './state'

function actionKey(action: string): string { return action }

export function workplaceActionProblem(g: GameState): string | null {
  if (!g.character.alive) return 'Your career is over.'
  if (g.character.prison) return 'You cannot work while in prison.'
  if (!workplaceContext(g)) return 'This job does not use the regular Work Plan system.'
  return null
}
export function workPlanChoiceUsed(g: GameState): boolean {
  return yearActionsUsed(g, actionKey('workplace.plan')) >= 1
}

export function workPreparationUsed(g: GameState): boolean {
  return yearActionsUsed(g, actionKey('workplace.prepare')) >= 1
}

export function chooseWorkApproach(g: GameState, approach: WorkApproach): boolean {
  const context = workplaceContext(g)
  if (!context || workplaceActionProblem(g) || !(['quality', 'speed', 'people'] as const).includes(approach)) return false
  const state = workplaceState(g, context.job)
  if (state.plan && state.plan.year !== g.year) return false
  if (!useYearAction(g, actionKey('workplace.plan'), 1)) return false
  if (state.plan) state.plan.approach = approach
  else {
    state.lastSettledPlanYear = Math.min(state.lastSettledPlanYear, g.year - 1)
    state.plan = makeWorkPlan(g, context, approach)
  }
  saveWorkplaceState(context.job, state)
  if (approach === 'speed') addStat(g, 'happiness', 2)
  if (approach === 'people') {
    const boss = getPerson(g, context.job.bossId)
    if (boss?.alive) addRelationship(g, boss, 1)
  }
  const pack = workFamilyDef(context.family)
  const choice = pack.approaches[approach]
  notice(g, 'Work Plan Set', `${state.plan.title} is your focus until your next birthday. You chose ${choice.label.toLowerCase()}. ${choice.subtitle}`, { emoji: pack.emoji })
  return true
}

export function prepareWorkPlan(g: GameState): boolean {
  const context = workplaceContext(g)
  if (!context || workplaceActionProblem(g)) return false
  const state = workplaceState(g, context.job)
  if (!state.plan || state.plan.year !== g.year || state.plan.preparation >= 30) return false
  if (!useYearAction(g, actionKey('workplace.prepare'), 1)) return false
  state.plan.preparation = Math.min(30, state.plan.preparation + 12)
  const track = careerTrack(g, context.family)
  track.mastery = Math.min(100, track.mastery + 1)
  saveCareerTrack(g, context.family, track)
  saveWorkplaceState(context.job, state)
  const boss = getPerson(g, context.job.bossId)
  if (boss?.alive) addRelationship(g, boss, 1)
  addStat(g, 'happiness', -2)
  notice(g, 'Prepared', `You reviewed the difficult parts of ${state.plan.title.toLowerCase()}, asked for feedback, and raised readiness to ${state.plan.preparation}/30.`, { emoji: '📚' })
  return true
}

export function specializeCareer(g: GameState, specialty: string): boolean {
  const context = workplaceContext(g)
  if (!context || workplaceActionProblem(g)) return false
  const pack = workFamilyDef(context.family)
  if (!pack.specialties.includes(specialty)) return false
  const track = careerTrack(g, context.family)
  if (track.completed < 3 || track.specialty) return false
  if (!useYearAction(g, actionKey('workplace.specialize'), 1)) return false
  track.specialty = specialty
  track.mastery = Math.min(100, track.mastery + 5)
  track.reputation = Math.min(100, track.reputation + 3)
  saveCareerTrack(g, context.family, track)
  const title = `${specialty} workplace specialization`
  if (!g.character.cv?.some((entry) => entry.source === 'workplace' && entry.title === title)) {
    addCvEntry(g, {
      kind: 'certification',
      title,
      org: context.job.company,
      startAge: g.character.age,
      endAge: g.character.age,
      detail: `Earned through sustained ${pack.label.toLowerCase()} work.`,
      strength: 5,
      tags: pack.tags,
      source: 'workplace',
    })
  }
  notice(g, 'Career Specialization', `${specialty} is now part of your ${pack.label.toLowerCase()} profile and stays with you when you change employers.`, { emoji: '🎓' })
  return true
}
