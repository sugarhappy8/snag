import { getPerson, yearActionsUsed } from '../core'
import type { GameState, MenuGroup, MenuNode } from '../types'
import { chooseWorkApproach, prepareWorkPlan, specializeCareer, workplaceActionProblem, workPlanChoiceUsed, workPreparationUsed } from './actions'
import { workFamilyDef, type WorkApproach } from './catalog'
import { masteryLabel, ratingLabel, workplaceContext } from './model'
import { careerTrack, workplaceState } from './state'

function specialtyUsed(g: GameState): boolean {
  return yearActionsUsed(g, 'workplace.specialize') >= 1
}
function approachNodes(g: GameState, current: WorkApproach | null): MenuNode[] {
  const context = workplaceContext(g)
  if (!context) return []
  const pack = workFamilyDef(context.family)
  return (['quality', 'speed', 'people'] as const).map((approach) => ({
    type: 'action' as const,
    id: `workplace.approach.${approach}`,
    label: `${pack.approaches[approach].label}${current === approach ? ' (current)' : ''}`,
    emoji: pack.emoji,
    subtitle: pack.approaches[approach].subtitle,
    disabledReason: (state: GameState) => workplaceActionProblem(state) ?? (current === approach ? 'This is your current approach.' : workPlanChoiceUsed(state) ? 'You already set your approach this year.' : null),
    run: (state: GameState) => { chooseWorkApproach(state, approach) },
  }))
}

export const workplaceMenu: MenuGroup = {
  type: 'menu',
  id: 'workplace.plan',
  label: 'Work Plan',
  emoji: '🗂️',
  visible: (g) => workplaceContext(g) !== null,
  subtitle: (g) => {
    const context = workplaceContext(g)
    if (!context) return 'Role-specific work and development'
    const state = workplaceState(g, context.job)
    return state.plan ? state.plan.title : `${workFamilyDef(context.family).label} development`
  },
  header: () => 'Choose how you handle one meaningful piece of work each year. Your normal salary already covers it; results shape performance, trust, mastery, reputation and your CV.',
  children: (g) => {
    const context = workplaceContext(g)
    if (!context) return [{ type: 'info', id: 'workplace.unavailable', text: 'This role uses its own career system.' }]
    const pack = workFamilyDef(context.family)
    const state = workplaceState(g, context.job)
    const track = careerTrack(g, context.family)
    const foundBoss = getPerson(g, context.job.bossId)
    const boss = foundBoss?.alive ? foundBoss : undefined
    const plan = state.plan?.year === g.year ? state.plan : null
    const nodes: MenuNode[] = [
      {
        type: 'info', id: 'workplace.status', emoji: pack.emoji,
        text: `${pack.label} · ${masteryLabel(track.mastery)} mastery ${track.mastery}/100 · Reputation ${track.reputation}/100\nEmployer trust ${state.trust}/100${boss ? ` · Manager relationship ${boss.relationship}%` : ''}${state.warnings ? ` · Warnings ${state.warnings}/3` : ''}\n${track.completed} successful plans / ${track.setbacks} setbacks · ${track.specialty || 'No specialization yet'}`,
      },
    ]
    if (plan) {
      nodes.push({ type: 'info', id: 'workplace.current', text: `${plan.title} · Difficulty ${plan.difficulty}/5 · Preparation ${plan.preparation}/30\nCurrent approach: ${pack.approaches[plan.approach].label}. The review arrives next birthday.` })
      nodes.push({ type: 'heading', id: 'workplace.h.approach', label: 'Approach' })
      nodes.push(...approachNodes(g, plan.approach))
      nodes.push({
        type: 'action', id: 'workplace.prepare', label: 'Prepare & Get Feedback', emoji: '📚',
        subtitle: 'Trade personal time for readiness; once per year',
        disabledReason: (stateG) => workplaceActionProblem(stateG) ?? (workPreparationUsed(stateG) ? 'You already prepared this year.' : plan.preparation >= 30 ? 'Preparation is already complete.' : null),
        run: (stateG) => { prepareWorkPlan(stateG) },
      })
    } else {
      nodes.push({ type: 'info', id: 'workplace.choose', text: 'Set this year’s approach. If you leave it alone, a careful default plan begins when you next age up.' })
      nodes.push(...approachNodes(g, null))
    }
    nodes.push({ type: 'heading', id: 'workplace.h.specialty', label: 'Development' })
    for (const specialty of pack.specialties) {
      nodes.push({
        type: 'action', id: `workplace.specialty.${specialty}`, label: `Specialize: ${specialty}`, emoji: '🎓',
        subtitle: 'A transferable field credential after three successful plans',
        disabledReason: (stateG) => workplaceActionProblem(stateG) ?? (track.specialty ? `Already specialized in ${track.specialty}.` : track.completed < 3 ? `Complete ${3 - track.completed} more successful plan${3 - track.completed === 1 ? '' : 's'} first.` : specialtyUsed(stateG) ? 'You already specialized this year.' : null),
        run: (stateG) => { specializeCareer(stateG, specialty) },
      })
    }
    if (state.lastReview) {
      nodes.push({ type: 'heading', id: 'workplace.h.reviews', label: 'Recent Reviews' })
      for (const [index, review] of state.reviews.slice(-3).reverse().entries()) {
        nodes.push({ type: 'info', id: `workplace.review.${index}`, text: `${review.year} · ${ratingLabel(review.rating)} · ${review.title}\n${review.summary}` })
      }
    }
    return nodes
  },
}
