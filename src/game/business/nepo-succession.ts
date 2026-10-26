// Turning a relative (or a key employee) into the company's CEO. career.syncCeo uses it when the
// owner stops running the company and has named a successor; the Family at the Company menu uses it
// for "Make CEO". The CEO is a plain Manager (BizState.manager) built from the person's real
// skill, so the hired-CEO model (planning, board reviews, raises, letters) treats a son or a
// daughter exactly like a stranger. This file imports no career or board code (career imports it).
import { entitlement } from '../events/wealth-core'
import { isEstranged } from '../events/will-core'
import type { Asset, GameState, Person } from '../types'
import { seeded } from '../assets'
import { INTEGRITY_TRAITS } from '../world/axes'
import { readJob, seedKey, writeJob, type FamilyJob } from './nepo-job'
import { employeesOf, isCeoOf, readFamily, familyOf, successorOf } from './nepo-state'
import { CEO_STYLES, type BizState, type CeoStyle, type Manager } from './state'
import { clampN } from './util'
import { successionReadiness } from './succession-review'

/** Youngest a relative can be named CEO. */
export const CEO_MIN_AGE = 21

/** A relative's style at the top, from temperament. */
export function styleFor(p: Person): CeoStyle {
  const t = (x: string) => p.traits.includes(x)
  if (t('ambitious') || t('outgoing')) return 'grower'
  if (t('stingy') || t('serious')) return 'costCutter'
  if (t('artistic') || t('nerdy') || t('optimistic')) return 'visionary'
  if (t('calm') || t('loyal') || t('honest')) return 'steady'
  return seeded(`style|${seedKey(p)}`).pick(CEO_STYLES)
}

/** How straight a relative plays, 0-100: honest and loyal types high, spoiled and sneaky ones low. */
export function integrityFor(p: Person): number {
  let v = 62 + seeded(`integrity|${seedKey(p)}`).next() * 20
  for (const [t, d] of Object.entries(INTEGRITY_TRAITS)) if (p.traits.includes(t)) v += d
  v -= entitlement(p) * 0.3
  return Math.round(clampN(v, 5, 98))
}

/** The Manager record for a relative who runs the company at this pay. */
export function managerFromPerson(g: GameState, p: Person, job: FamilyJob, salary: number): Manager {
  return {
    firstName: p.firstName,
    lastName: p.lastName,
    gender: p.gender === 'female' ? 'female' : 'male',
    skill: Math.round(clampN(job.skill, 0, 100)),
    salary: Math.max(0, Math.round(salary)),
    since: g.year,
    style: styleFor(p),
    integrity: integrityFor(p),
    personId: p.id,
  }
}

/** The relative's family job after they are made CEO (the title, the pay and the mood follow). */
export function promoteToCeo(g: GameState, p: Person, job: FamilyJob, salary: number): void {
  job.rank = 5
  job.kind = 'real'
  job.title = 'CEO'
  job.rankSince = g.year
  job.pay = Math.max(0, Math.round(salary))
  job.part = false
  job.burn = 0
  job.mood = clampN(job.mood + 15, 0, 100)
  writeJob(p, job)
  p.occupation = 'CEO'
}

/**
 * The CEO the owner named in advance, ready to take over (null: nobody named, or not ready).
 * `salaryFor` is what a CEO of that skill costs here (career.askingSalary). Does not change anything.
 */
export function successorManager(g: GameState, a: Asset, b: BizState, salaryFor: (skill: number) => number): Manager | null {
  const review = b.successionReview
  if (review && typeof review === 'object' && !Array.isArray(review) && review.enabled === true && successionReadiness(g, a, b)) return null
  const s = successorOf(g, a, b)
  if (!s) return null
  if (s.kind === 'person') {
    const { person, job } = s
    if (person.age < CEO_MIN_AGE || person.data.disowned === true || isEstranged(g, person)) return null
    return managerFromPerson(g, person, job, salaryFor(job.skill))
  }
  const staff = b.staff.find((x) => x.id === s.id)
  if (!staff) return null
  return {
    firstName: staff.firstName,
    lastName: staff.lastName,
    gender: staff.gender,
    skill: Math.round(clampN(staff.skill, 0, 100)),
    salary: Math.max(0, Math.round(salaryFor(staff.skill))),
    since: g.year,
    style: seeded(`style|${staff.id}`).pick(CEO_STYLES),
    integrity: Math.round(clampN(70 + (staff.trait === 'shady' ? -35 : staff.trait === 'steady' ? 10 : 0), 5, 98)),
  }
}

/**
 * Book the change after a successor was installed as CEO: the relative's job becomes the CEO job,
 * a key employee leaves the leadership team (they run the company now), and the plan is spent.
 */
export function afterSuccession(g: GameState, a: Asset, b: BizState, m: Manager): void {
  const fam = familyOf(b)
  const plan = readFamily(b.family).succ
  let spent = false
  if (m.personId) {
    const p = g.people.find((x) => x.id === m.personId)
    const job = p ? readJob(p) : null
    if (p && job) promoteToCeo(g, p, job, m.salary)
    spent = plan.kind === 'person' && plan.id === m.personId
  } else {
    const staff = plan.kind === 'staff' ? b.staff.find((x) => x.id === plan.id) : undefined
    spent = !!staff && staff.firstName === m.firstName && staff.lastName === m.lastName
    b.staff = b.staff.filter((x) => !(x.firstName === m.firstName && x.lastName === m.lastName))
  }
  if (spent) fam.succ = { kind: '', id: '' }
  void a
}

/**
 * Relatives who could be put up as CEO candidates next to a headhunter's shortlist: adults in a real
 * job of at least associate rank, with the pay a CEO of their skill would ask. Does not change anything.
 */
export function familyCandidates(g: GameState, a: Asset, b: BizState, salaryFor: (skill: number) => number): Manager[] {
  return employeesOf(g, a.id)
    .filter((e) => e.job.kind === 'real' && e.job.rank >= 1 && e.p.age >= CEO_MIN_AGE && e.p.data.disowned !== true && !isEstranged(g, e.p) && !isCeoOf(b, e.p))
    .map((e) => managerFromPerson(g, e.p, e.job, salaryFor(e.job.skill)))
}
