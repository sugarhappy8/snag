import { addRelationship, getPerson, log, notice, useYearAction, yearActionsUsed } from '../core'
import { addCvEntry, seededStream } from '../cv'
import type { GameState, Job, Json, MenuGroup, MenuNode } from '../types'
import { resolveWorkplaceJobDef, WORK_FAMILIES, workFamilyDef, workFamilyForDef, type WorkFamily } from './catalog'
import { appointmentIdOf } from './state'

export type ShiftFocus = 'reliability' | 'learning' | 'customers'
type ShiftRating = 'excellent' | 'steady' | 'setback'
interface ShiftPlan { year: number; focus: ShiftFocus }
interface ShiftReview { year: number; focus: ShiftFocus; rating: ShiftRating; summary: string }
interface ShiftState {
  v: 1
  owner: string
  appointmentId: string
  trust: number
  completed: number
  lastSettledYear: number
  plan: ShiftPlan | null
  reviews: ShiftReview[]
}
interface ShiftProfile {
  v: 1
  owner: string
  skill: number
  completed: number
  lastChoiceYear: number
  lastReviewYear: number
  referenceFamily?: WorkFamily
  referenceYear?: number
}

const FOCUS: Record<ShiftFocus, { label: string; detail: string }> = {
  reliability: { label: 'Be dependable', detail: 'Prioritize punctuality and careful handovers; stronger trust and steadier results.' },
  learning: { label: 'Learn the role', detail: 'Practice unfamiliar tasks; build transferable shift skills more quickly.' },
  customers: { label: 'Support people', detail: 'Help customers and colleagues; strengthen your working relationships.' },
}
const FOCI = Object.keys(FOCUS) as ShiftFocus[]
const RATINGS: ShiftRating[] = ['excellent', 'steady', 'setback']
const ACTION_KEY = 'parttime.shiftFocus'
const REFERENCE_TITLE = 'Part-time employer reference'
const VALID_REFERENCE_TAGS = new Set(Object.values(WORK_FAMILIES).flatMap((family) => family.tags))

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function bounded(value: unknown, fallback: number, min = 0, max = 100): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.max(min, Math.min(max, value))) : fallback
}
function owner(g: GameState): string { return `${g.lifeId}:${g.generation}:${g.character.id}` }
function isFocus(value: unknown): value is ShiftFocus { return FOCI.includes(value as ShiftFocus) }
function currentJob(g: GameState, job = g.character.partTimeJob): Job | null {
  if (!job || job !== g.character.partTimeJob || job.category !== 'parttime') return null
  const def = resolveWorkplaceJobDef(job.defId)
  return def?.category === 'parttime' ? job : null
}

/** Pure, owner-scoped portable progress: one focus and one review per calendar year. */
export function partTimeShiftProfile(g: GameState): ShiftProfile {
  const raw = record(g.flags.partTimeShifts)
  const stamp = owner(g)
  if (raw.v !== 1 || raw.owner !== stamp) return { v: 1, owner: stamp, skill: 20, completed: 0, lastChoiceYear: -1, lastReviewYear: -1 }
  const reference = typeof raw.referenceFamily === 'string' && Object.hasOwn(WORK_FAMILIES, raw.referenceFamily) && typeof raw.referenceYear === 'number' && Number.isInteger(raw.referenceYear) && raw.referenceYear >= 0 && raw.referenceYear <= g.year
    ? { referenceFamily: raw.referenceFamily as WorkFamily, referenceYear: raw.referenceYear } : {}
  return {
    v: 1, owner: stamp,
    skill: bounded(raw.skill, 20), completed: bounded(raw.completed, 0, 0, 10000),
    lastChoiceYear: bounded(raw.lastChoiceYear, -1, -1, g.year),
    lastReviewYear: bounded(raw.lastReviewYear, -1, -1, g.year),
    ...reference,
  }
}

/** Pure, appointment-local view. Old saves and foreign-life records start cleanly. */
export function partTimeShiftState(g: GameState, job: Job): ShiftState {
  const raw = record(job.data.shiftFocus)
  const stamp = owner(g)
  const appointmentId = appointmentIdOf(g, job)
  const empty: ShiftState = { v: 1, owner: stamp, appointmentId, trust: 50, completed: 0, lastSettledYear: -1, plan: null, reviews: [] }
  if (raw.v !== 1 || raw.owner !== stamp || raw.appointmentId !== appointmentId) return empty
  const lastSettledYear = bounded(raw.lastSettledYear, -1, -1, g.year)
  const pending = record(raw.plan)
  const plan = typeof pending.year === 'number' && Number.isInteger(pending.year) && pending.year >= 0 && pending.year <= g.year && pending.year > lastSettledYear && isFocus(pending.focus)
    ? { year: pending.year, focus: pending.focus } : null
  const reviews: ShiftReview[] = []
  for (const candidate of Array.isArray(raw.reviews) ? raw.reviews : []) {
    const item = record(candidate)
    if (typeof item.year !== 'number' || !Number.isInteger(item.year) || item.year < 0 || item.year > g.year || !isFocus(item.focus) || !RATINGS.includes(item.rating as ShiftRating) || typeof item.summary !== 'string') continue
    const review = { year: item.year, focus: item.focus, rating: item.rating as ShiftRating, summary: item.summary.slice(0, 240) }
    const previous = reviews.findIndex((entry) => entry.year === review.year)
    if (previous >= 0) reviews.splice(previous, 1)
    reviews.push(review)
  }
  return { ...empty, trust: bounded(raw.trust, 50), completed: bounded(raw.completed, 0, 0, 10000), lastSettledYear, plan, reviews: reviews.slice(-4) }
}

function save(g: GameState, job: Job, state: ShiftState, profile?: ShiftProfile): void {
  job.data.shiftFocus = state as unknown as Json
  if (profile) g.flags.partTimeShifts = profile as unknown as Json
}
function actionProblem(g: GameState, expectedAppointment?: string): string | null {
  if (!g.character.alive) return 'Your career is over.'
  if (g.character.prison) return 'You cannot work while in prison.'
  const job = currentJob(g)
  if (!job) return 'You need a current part-time job.'
  if (expectedAppointment && appointmentIdOf(g, job) !== expectedAppointment) return 'This is no longer the same job.'
  const state = partTimeShiftState(g, job)
  if (state.plan && state.plan.year < g.year) return 'Your previous shift year is awaiting review.'
  if (partTimeShiftProfile(g).lastChoiceYear === g.year || yearActionsUsed(g, ACTION_KEY) >= 1) return 'You already chose a shift focus this year, including at other employers.'
  return null
}

export function choosePartTimeShiftFocus(g: GameState, focus: ShiftFocus, expectedAppointment?: string): boolean {
  const job = currentJob(g)
  if (!job || !isFocus(focus) || actionProblem(g, expectedAppointment)) return false
  if (!useYearAction(g, ACTION_KEY, 1)) return false
  const state = partTimeShiftState(g, job)
  const profile = partTimeShiftProfile(g)
  state.lastSettledYear = Math.min(state.lastSettledYear, g.year - 1)
  state.plan = { year: g.year, focus }
  profile.lastChoiceYear = g.year
  save(g, job, state, profile)
  notice(g, 'Shift Focus Set', `${FOCUS[focus].label} is your focus at ${job.company}. Your review arrives next birthday; this does not add a second wage payment.`, { emoji: '🕒' })
  return true
}

function earnReference(g: GameState, job: Job, state: ShiftState, profile: ShiftProfile): void {
  if (state.completed < 3 || state.trust < 60) return
  const def = resolveWorkplaceJobDef(job.defId)!
  const family = workFamilyForDef(def)
  const tags = workFamilyDef(family).tags
  if (profile.referenceFamily !== family) profile.referenceYear = g.year
  profile.referenceFamily = family
  profile.referenceYear ??= g.year
  const detail = `${state.completed} successful shift years at ${job.company}; employer trust ${state.trust}/100. Transferable shift skill ${profile.skill}/100.`.slice(0, 240)
  const entries = g.character.cv ?? []
  const existing = entries.find((entry) => entry.source === 'parttime-shifts' && entry.title === REFERENCE_TITLE)
  if (existing) {
    existing.org = job.company
    existing.endAge = g.character.age
    existing.detail = detail
    existing.strength = Math.max(bounded(existing.strength, 4, 0, 6), Math.min(6, 3 + Math.floor(state.completed / 3)))
    const oldTags = Array.isArray(existing.tags) ? existing.tags.filter((tag) => typeof tag === 'string' && VALID_REFERENCE_TAGS.has(tag)) : []
    existing.tags = [...new Set([...oldTags, ...tags])]
    g.character.cv = entries.filter((entry) => entry === existing || entry.source !== 'parttime-shifts' || entry.title !== REFERENCE_TITLE)
  } else {
    addCvEntry(g, { kind: 'experience', title: REFERENCE_TITLE, org: job.company, startAge: g.character.age, endAge: g.character.age, detail, strength: 4, tags, source: 'parttime-shifts' })
    notice(g, 'A Reference Earned', `${job.company} will vouch for your sustained part-time work. The reference stays on your CV when you move on.`, { emoji: '📝', tone: 'good' })
  }
}

/** Salary-neutral birthday review, once per life-year even if a job is replaced. */
export function yearlyPartTimeShift(g: GameState, suppliedJob: Job = g.character.partTimeJob!): void {
  const job = currentJob(g, suppliedJob)
  if (!job || !g.character.alive || g.character.prison) return
  const state = partTimeShiftState(g, job)
  const profile = partTimeShiftProfile(g)
  const plan = state.plan
  if (plan && plan.year < g.year) {
    if (profile.lastReviewYear < g.year) {
      // A private deterministic stream avoids perturbing unrelated annual event rolls.
      const random = seededStream(`shift:${owner(g)}:${state.appointmentId}:${plan.year}:${plan.focus}`)()
      const score = bounded(job.performance, 50) * 0.6 + bounded(g.character.hidden.discipline, 50) * 0.2 + state.trust * 0.1 + profile.skill * 0.1 + random * 24 - 12 + (plan.focus === 'reliability' ? 7 : plan.focus === 'customers' ? 2 : -1)
      const rating: ShiftRating = score >= 80 ? 'excellent' : score >= 52 ? 'steady' : 'setback'
      const success = rating !== 'setback'
      job.performance = bounded(bounded(job.performance, 50) + (rating === 'excellent' ? 4 : success ? 2 : -3), 50)
      state.trust = bounded(state.trust + (rating === 'excellent' ? 8 : success ? 5 : -5) + (success && plan.focus === 'reliability' ? 2 : 0), 50)
      profile.skill = bounded(profile.skill + (plan.focus === 'learning' ? success ? 4 : 1 : success ? 1 : 0), 20)
      if (success) {
        state.completed = Math.min(10000, state.completed + 1)
        profile.completed = Math.min(10000, profile.completed + 1)
      }
      const boss = getPerson(g, job.bossId)
      if (boss?.alive) addRelationship(boss, success ? plan.focus === 'customers' ? 3 : 1 : -2)
      const summary = success
        ? `${FOCUS[plan.focus].label}: your shifts were ${rating === 'excellent' ? 'excellent' : 'steady'}. Employer trust is ${state.trust}/100; transferable shift skill is ${profile.skill}/100.`
        : `${FOCUS[plan.focus].label}: missed expectations affected this year’s review. Employer trust is ${state.trust}/100; the next shift year is a fresh opportunity.`
      state.reviews = [...state.reviews, { year: g.year, focus: plan.focus, rating, summary }].slice(-4)
      profile.lastReviewYear = g.year
      earnReference(g, job, state, profile)
      log(g, `My part-time review at ${job.company}: ${summary}`, success ? 'good' : 'bad')
    }
    state.lastSettledYear = plan.year
    state.plan = null
  }
  if (!state.plan) {
    state.lastSettledYear = Math.min(state.lastSettledYear, g.year - 1)
    state.plan = { year: g.year, focus: 'reliability' }
  }
  save(g, job, state, profile)
}

export const partTimeShiftMenu: MenuGroup = {
  type: 'menu', id: 'parttime.shifts', label: 'Shift Focus', emoji: '🕒',
  visible: (g) => currentJob(g) !== null,
  subtitle: 'One yearly focus, feedback and a portable reference',
  header: () => 'Give your part-time work a direction without managing a business. Reviews affect performance and employer trust; three successful years with an employer can earn a CV reference. Your usual salary already pays for these shifts.',
  children: (g) => {
    const job = currentJob(g)
    if (!job) return [{ type: 'info', id: 'parttime.shifts.unavailable', text: 'Take a part-time job to choose your shift focus.' }]
    const state = partTimeShiftState(g, job)
    const profile = partTimeShiftProfile(g)
    const expectedAppointment = appointmentIdOf(g, job)
    const nodes: MenuNode[] = [{ type: 'info', id: 'parttime.shifts.status', text: `${job.company} · Employer trust ${state.trust}/100 · ${state.completed} successful years here\nTransferable shift skill ${profile.skill}/100 · ${profile.completed} successful years overall\n${state.plan ? `Current focus: ${FOCUS[state.plan.focus].label}. Review due next birthday.` : 'Choose a focus, or a dependable default starts at your next birthday.'}` }]
    for (const focus of FOCI) nodes.push({
      type: 'action', id: `parttime.shifts.${focus}`, label: FOCUS[focus].label, emoji: '🕒', subtitle: FOCUS[focus].detail,
      disabledReason: (game) => actionProblem(game, expectedAppointment),
      run: (game) => { choosePartTimeShiftFocus(game, focus, expectedAppointment) },
    })
    for (const [index, review] of state.reviews.slice(-3).reverse().entries()) nodes.push({ type: 'info', id: `parttime.shifts.review.${index}`, text: `${review.year} · ${review.rating}\n${review.summary}` })
    return nodes
  },
}
