// A persistent time trade-off, settled once a year. Benefits never come from repeatedly
// clicking a menu, and defaults preserve the familiar life loop.
import { addStat, formatMoney, log, notice, spend } from './core'
import { bound, economyOf } from './economy'
import { postureNodes } from './effort/menu'
import { effortStrain } from './effort/persona'
import { getCountry } from './world'
import type { GameState, Json, MenuGroup } from './types'

export const PRIORITIES = [
  { id: 'balanced', label: 'Keep a balanced routine', text: 'Steady work, relationships and recovery; no extra recurring cost.', work: 0, study: 0, relationship: 0, recovery: 0, strain: 0 },
  { id: 'ambition', label: 'Push my career', text: 'Stronger performance, but fatigue builds and close relationships get less time.', work: 7, study: -2, relationship: -2, recovery: -1, strain: 10 },
  { id: 'learning', label: 'Invest in learning', text: 'Improve study and transferable skills. Adult training costs money each year and leaves less energy for work.', work: -3, study: 7, relationship: -1, recovery: 0, strain: 4 },
  { id: 'family', label: 'Make time for my people', text: 'Protect close relationships and support children; slower career and study progress.', work: -4, study: -2, relationship: 3, recovery: 1, strain: -4 },
  { id: 'recovery', label: 'Prioritize recovery', text: 'Recover health and reduce fatigue, with less effort available for career and study.', work: -7, study: -4, relationship: 1, recovery: 3, strain: -12 },
] as const
type Priority = typeof PRIORITIES[number]['id']
interface Household { owner: string; priority: Priority; fatigue: number; training: number; lastYear: number; effective: Priority; spent: number }
const owner = (g: GameState) => `${g.generation}:${g.character.id}`
const rec = (v: Json | undefined): Record<string, Json> => v && typeof v === 'object' && !Array.isArray(v) ? v : {}
const n = (v: Json | undefined, fallback = 0) => typeof v === 'number' && Number.isFinite(v) ? v : fallback
const priority = (v: Json | undefined): Priority => PRIORITIES.find(p => p.id === v)?.id ?? 'balanced'
export function householdView(g: GameState): Household {
  const r = rec(g.flags.household)
  if (r.owner !== owner(g)) return { owner: owner(g), priority: 'balanced', fatigue: 0, training: 0, lastYear: -1, effective: 'balanced', spent: 0 }
  return { owner: owner(g), priority: priority(r.priority), fatigue: bound(n(r.fatigue), 0, 100), training: bound(n(r.training), 0, 100), lastYear: n(r.lastYear, -1), effective: priority(r.effective), spent: bound(n(r.spent), 0, 1e6) }
}
export function householdEffects(g: GameState) {
  const h = householdView(g), p = PRIORITIES.find(p => p.id === (h.lastYear === g.year ? h.effective : h.priority))!
  return { work: p.work - Math.max(0, h.fatigue - 35) * .18 + h.training * .035,
    study: p.study - Math.max(0, h.fatigue - 45) * .12,
    relationship: p.relationship - (h.fatigue >= 70 ? 1 : 0), training: h.training }
}
export function annualLearningCost(g: GameState): number { return g.character.age < 18 ? 0 : Math.round(400 * Math.max(.15, getCountry(g.character.countryId).wealth)) }
export function setLifePriority(g: GameState, id: string): boolean {
  if (!g.character.alive || g.character.age < 12 || !PRIORITIES.some(p => p.id === id)) return false
  const h = householdView(g)
  h.priority = id as Priority; g.flags.household = h as unknown as Json
  notice(g, 'Life Priority Set', `${PRIORITIES.find(p => p.id === id)!.text}${id === 'learning' ? ` Budget ${formatMoney(annualLearningCost(g))}/year.` : ''} This routine takes effect when you age up, and continues until you change it.`, { emoji: '🧭' })
  return true
}
export function yearlyHousehold(g: GameState): void {
  if (!g.character.alive || g.character.age < 12) return
  const h = householdView(g)
  if (h.lastYear >= g.year) return
  h.lastYear = g.year; h.effective = h.priority; h.spent = 0
  if (h.priority === 'learning') {
    const cost = annualLearningCost(g)
    if (cost > 0 && !spend(g, cost, 'tuition')) {
      h.effective = 'balanced'
      log(g, 'I postponed my extra training because my savings could not cover it.', 'neutral')
    } else {
      h.spent = cost; h.training = Math.min(100, h.training + 5 + economyOf(g).services)
      addStat(g, 'smarts', 1)
    }
  } else h.training = Math.max(0, h.training - .5)
  const p = PRIORITIES.find(p => p.id === h.effective)!
  const hours = g.character.job ? bound(n(g.character.job.data.weeklyHours, 40), 10, 80) : 0
  const extraJob = g.character.partTimeJob ? 7 : 0
  const schoolWork = g.character.education.current && g.character.job ? 9 : 0
  const debtStress = g.character.money < 0 ? 6 : 0
  const before = h.fatigue
  h.fatigue = bound(h.fatigue * .78 + Math.max(0, hours - 40) * .65 + extraJob + schoolWork + debtStress + p.strain + effortStrain(g), 0, 100)
  addStat(g, 'health', p.recovery - (h.fatigue >= 65 ? 2 : 0))
  if (p.id === 'family' || p.id === 'recovery') addStat(g, 'happiness', 2)
  if (h.fatigue >= 65) addStat(g, 'happiness', -2)
  g.flags.household = h as unknown as Json
  if (before < 65 && h.fatigue >= 65) notice(g, 'Running on Empty', 'Your workload has caught up with you. Fatigue is affecting performance, learning and health. A recovery routine, fewer work hours, or dropping an extra commitment can help over the next few years.', { emoji: '😮‍💨', tone: 'bad' })
}
export const lifePrioritiesMenu: MenuGroup = {
  type: 'menu', id: 'lifePriorities', label: 'Life Priorities', emoji: '🧭', visible: g => g.character.alive && g.character.age >= 12,
  subtitle: g => { const h = householdView(g); return `${PRIORITIES.find(p => p.id === h.priority)!.label} · ${h.fatigue >= 65 ? 'exhausted' : h.fatigue >= 35 ? 'stretched' : 'manageable workload'}` },
  header: () => 'Choose a routine, then let it run. Time spent on one part of life leaves less for another. No yearly clicking is required.',
  children: g => [{ type: 'info', id: 'priority.context', text: `Fatigue ${Math.round(householdView(g).fatigue)}/100. Long work weeks, two jobs, studying while employed and money worries build strain. Recovery takes time. Extra adult learning costs ${formatMoney(annualLearningCost(g))}/year; accumulated skills help later performance.` },
    ...PRIORITIES.map(p => ({ type: 'action' as const, id: `priority.${p.id}`, label: `${p.label}${householdView(g).priority === p.id ? ' (current)' : ''}`, emoji: '🧭', subtitle: p.text, disabledReason: (gg: GameState) => householdView(gg).priority === p.id ? 'Your current routine.' : null, run: (gg: GameState) => { setLifePriority(gg, p.id) } })),
    ...postureNodes(g)],
}
