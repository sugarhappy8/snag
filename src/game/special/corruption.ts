// Fictional, abstract influence-peddling. This is a risky life-sim choice, not a depiction of
// real people or a guide to real-world bribery: the player pays an unnamed intermediary and the
// game resolves uncertain access, scandal and a bounded NPC job.
import { arrestPlayer } from '../crime'
import { personCash } from '../cash'
import { addHidden, addRelationship, addStat, count, formatMoney, log, notice, scriptChoice, spend, useYearAction } from '../core'
import { typicalIncome } from '../events/wealth-core'
import { chance } from '../rng'
import { defineScript } from '../scripts'
import type { GameState, Json, MenuAction, MenuGroup, Person, RelationKind } from '../types'

export type InfluenceTargetId = 'president' | 'ceo' | 'politician'

interface InfluenceTarget {
  id: InfluenceTargetId
  label: string
  emoji: string
  costYears: number
  salaryYears: number
  success: number
  exposure: number
  jobs: string[]
}

interface InfluenceJob {
  by: string
  target: InfluenceTargetId
  title: string
  salary: number
  hiredYear: number
  lastPaid: number
}

const TARGETS: InfluenceTarget[] = [{
  id: 'president', label: "The President's Inner Circle", emoji: '🏛️', costYears: 8, salaryYears: 2.5, success: .22, exposure: .35,
  jobs: ['Presidential Policy Adviser', 'National Development Liaison', 'State Enterprise Director'],
}, {
  id: 'ceo', label: 'A Major Corporate CEO', emoji: '🏢', costYears: 5, salaryYears: 2, success: .35, exposure: .25,
  jobs: ['Corporate Strategy Manager', 'Executive Projects Director', 'Regional Operations Lead'],
}, {
  id: 'politician', label: 'A Senior Politician', emoji: '🗳️', costYears: 2, salaryYears: 1.3, success: .45, exposure: .18,
  jobs: ['Constituency Office Director', 'Public Affairs Adviser', 'Government Program Manager'],
}]

const FAMILY: RelationKind[] = [
  'child', 'stepchild', 'sibling', 'halfSibling', 'stepsibling', 'parent', 'stepparent',
  'grandchild', 'grandparent', 'spouse', 'partner', 'fiance',
]

function object(value: Json | undefined): Record<string, Json> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

function targetById(id: string): InfluenceTarget | undefined {
  return TARGETS.find((target) => target.id === id)
}

function price(g: GameState, target: InfluenceTarget): number {
  return Math.max(10_000, Math.min(2_000_000, Math.round(typicalIncome(g) * target.costYears)))
}

function salary(g: GameState, target: InfluenceTarget): number {
  return Math.max(8_000, Math.min(500_000, Math.round(typicalIncome(g) * target.salaryYears)))
}

function validFamily(person: Person): boolean {
  return person.alive && person.age >= 18 && FAMILY.includes(person.relation) && person.data.disowned !== true
}

export function influenceJob(g: GameState, person: Person): InfluenceJob | null {
  const raw = object(person.data.influenceJob)
  if (!raw || raw.by !== g.character.id || typeof raw.target !== 'string' || !targetById(raw.target) || typeof raw.title !== 'string') return null
  const pay = typeof raw.salary === 'number' && Number.isFinite(raw.salary) ? raw.salary : 0
  const hiredYear = typeof raw.hiredYear === 'number' && Number.isFinite(raw.hiredYear) ? raw.hiredYear : 0
  const lastPaid = typeof raw.lastPaid === 'number' && Number.isFinite(raw.lastPaid) ? raw.lastPaid : -1
  return {
    by: g.character.id,
    target: raw.target as InfluenceTargetId,
    title: raw.title.trim().slice(0, 80),
    salary: Math.max(0, Math.min(500_000, Math.round(pay))),
    hiredYear: Math.round(hiredYear),
    lastPaid: Math.round(lastPaid),
  }
}

export function holdsInfluenceJob(g: GameState, person: Person): boolean {
  return influenceJob(g, person) !== null
}

export function influenceCandidates(g: GameState): Person[] {
  return g.people.filter((person) => validFamily(person) && !holdsInfluenceJob(g, person) && !object(person.data.nepo))
}

function globalBlock(g: GameState): string | null {
  if (!g.character.alive) return 'You are no longer alive.'
  if (g.character.prison) return "You can't arrange political favors from prison."
  if (g.character.age < 18) return 'You must be 18 or older.'
  if ((g.yearActions['corruption.bribe'] ?? 0) >= 1) return 'You already tried to buy influence this year.'
  if (!influenceCandidates(g).length) return 'You need a living adult family member who is not already in a family job.'
  return null
}

/** One fully revalidated fictional influence attempt. */
export function attemptInfluence(g: GameState, targetId: InfluenceTargetId, personId: string): void {
  const target = targetById(targetId)
  const person = g.people.find((candidate) => candidate.id === personId)
  const blocked = globalBlock(g)
  if (!target || blocked || !person || !validFamily(person) || holdsInfluenceJob(g, person) || object(person.data.nepo)) {
    if (blocked) notice(g, 'Backroom Favor', blocked, { emoji: '🚫' })
    return
  }
  const cost = price(g, target)
  if (g.character.money < cost) {
    notice(g, 'Backroom Favor', `The intermediary wants ${formatMoney(cost)} in cash. You cannot afford it.`, { emoji: '💸' })
    return
  }
  if (!useYearAction(g, 'corruption.bribe', 1) || !spend(g, cost, 'bribe')) return
  count(g, 'bribesAttempted')
  addHidden(g, 'karma', -8)

  const exposed = chance(g, target.exposure)
  const odds = Math.max(.08, Math.min(.72, target.success + g.character.stats.smarts / 500 + Math.max(0, person.relationship - 50) / 500))
  const succeeded = !exposed && chance(g, odds)
  if (exposed) {
    count(g, 'briberyScandals')
    addHidden(g, 'notoriety', 8)
    addStat(g, 'happiness', -8)
    log(g, `A payment meant to buy ${person.firstName} a job turned into a criminal scandal.`, 'bad')
    notice(g, 'Favor Exposed', `The go-between kept the money and investigators found the trail. ${person.firstName} got no job, and the police want a word with you.`, { emoji: '🚨', tone: 'bad' })
    arrestPlayer(g, 'Bribery', target.id === 'president' ? 3 : 2)
    return
  }
  if (!succeeded) {
    addRelationship(g, person, -2)
    log(g, `I paid for influence, but nobody found ${person.firstName} a job.`, 'bad')
    notice(g, 'No Favor Returned', `The go-between took ${formatMoney(cost)} and stopped returning calls. ${person.firstName} received nothing. Influence is never guaranteed.`, { emoji: '📵', tone: 'bad' })
    return
  }

  const titleIndex = Math.abs((g.rng ^ person.id.length ^ g.year) % target.jobs.length)
  const title = target.jobs[titleIndex]
  const annual = salary(g, target)
  person.occupation = title
  person.data.influenceJob = {
    by: g.character.id, target: target.id, title, salary: annual, hiredYear: g.year, lastPaid: g.year - 1,
  }
  // The cap bounds what this favor adds; it must never confiscate a wealthy relative's savings.
  personCash(g, person, Math.max(person.money, Math.min(1_000_000_000, Math.round(person.money + annual * .1))) - person.money, 'wage')
  addRelationship(g, person, 8)
  count(g, 'bribesSucceeded')
  log(g, `A corrupt favor secured ${person.firstName} a job as ${title}.`, 'bad')
  notice(g, 'Favor Granted', `${person.firstName} was installed as ${title}, earning about ${formatMoney(annual)} a year. Nobody asks how they got it. Yet.`, { emoji: target.emoji, tone: 'neutral' })
}

const CHOOSE_RELATIVE = defineScript('corruption.chooseRelative', (g, choice, data) => {
  if (choice === 'cancel' || !data || typeof data !== 'object' || Array.isArray(data) || typeof data.target !== 'string') return
  if (!targetById(data.target)) return
  attemptInfluence(g, data.target as InfluenceTargetId, choice)
})

function targetAction(target: InfluenceTarget): MenuAction {
  return {
    type: 'action',
    id: `corruption.${target.id}`,
    label: target.label,
    emoji: target.emoji,
    subtitle: (g) => `${formatMoney(price(g, target))} up front · no promises · could end in arrest`,
    disabledReason: (g) => globalBlock(g) ?? (g.character.money < price(g, target) ? 'You cannot afford the intermediary.' : null),
    confirm: () => 'The money can vanish, or the deal can blow up into a criminal scandal. Pick an adult relative?',
    run: (g) => {
      if (globalBlock(g) || g.character.money < price(g, target)) return
      const people = influenceCandidates(g)
      scriptChoice(g, CHOOSE_RELATIVE, 'Choose a Relative', `A go-between says ${target.label.toLowerCase()} can find a job for one adult relative. Nothing is guaranteed, and the ${formatMoney(price(g, target))} is gone either way.`, [
        ...people.map((person) => ({ id: person.id, label: `${person.firstName} ${person.lastName} · age ${person.age} · ${person.occupation}`, emoji: '👤' })),
        { id: 'cancel', label: 'Walk away', emoji: '✖️' },
      ], { emoji: target.emoji, data: { target: target.id } })
    },
  }
}

export const corruptionMenu: MenuGroup = {
  type: 'menu',
  id: 'corruption',
  label: 'Backroom Favors',
  emoji: '🕴️',
  subtitle: 'Pull strings for a relative’s job, at a risk',
  visible: (g) => g.character.alive && !g.character.prison && g.character.age >= 18,
  disabledReason: globalBlock,
  // One short content note for the whole section (people and offices are invented), not on every row.
  header: () => 'Pay a go-between to land an adult relative a cushy job. It may not work, the money is gone either way, and you could be arrested. All people and offices here are fictional.',
  children: () => TARGETS.map(targetAction),
}

/** Pay current-owner relatives one bounded fiscal-year salary, once per year. */
export function yearlyCorruption(g: GameState): void {
  if (!g.character.alive) return
  const fiscal = g.year - 1
  for (const person of g.people) {
    if (!person.alive || person.age < 18) continue
    const job = influenceJob(g, person)
    if (!job || job.hiredYear > fiscal || job.lastPaid >= fiscal) continue
    const pay = Math.max(0, Math.min(500_000, Math.round(job.salary)))
    personCash(g, person, Math.max(person.money, Math.min(1_000_000_000, Math.round(person.money + pay))) - person.money, 'wage')
    person.occupation = job.title
    person.data.influenceJob = { ...job, lastPaid: fiscal }
    if (pay > 0) log(g, `${person.firstName} earned ${formatMoney(pay)} in ${job.title} salary.`)
  }
}
