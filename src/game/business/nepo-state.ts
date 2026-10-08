// Family at the company: per-company state (BizState.family) and the lists the menus and the
// yearly step share. A relative's own job lives on the Person (nepo-job.ts).
import { getPerson } from '../core'
import { isAbroad, personCountry } from '../events/wealth-core'
import { isEstranged } from '../events/will-core'
import type { Asset, GameState, Json, Person } from '../types'
import { getCountry } from '../world'
import { readJob, type FamilyJob } from './nepo-job'
import { readGroupJob } from './conglomerate-job'
import { businessAssets, isBusinessAsset, type BizState } from './state'
import { clampN, num, rec, str } from './util'

export const FAMILY_VERSION = 1

export interface Successor {
  kind: '' | 'person' | 'staff'
  id: string
}

export interface FamilyState {
  v: number
  succ: Successor
  /** 0-100: how much the staff resent the boss's relatives (favoritism); fades 30% a year. */
  resent: number
  /** 0-100: the "nepo baby" label in the press for this company; fades 20% a year. */
  label: number
  /** Year of the last press story, and of the last "pass the baton" question. */
  pressYear: number
  handYear: number
  /** Year the family last asked for a job (a family asks every other year at most). */
  askYear: number
  /** Relatives hired and let go over the years (for the press and the arcs). */
  hires: number
  fired: number
}

export function blankFamily(): FamilyState {
  return { v: FAMILY_VERSION, succ: { kind: '', id: '' }, resent: 0, label: 0, pressYear: 0, handYear: 0, askYear: 0, hires: 0, fired: 0 }
}

/** A complete, sane family state from whatever is stored (companies without one get a blank). */
export function readFamily(v: Json | undefined): FamilyState {
  const d = rec(v)
  if (!d) return blankFamily()
  const s = rec(d.succ)
  const kind = s && (s.kind === 'person' || s.kind === 'staff') ? s.kind : ''
  return {
    v: FAMILY_VERSION,
    succ: kind && s && str(s.id) ? { kind, id: str(s.id) } : { kind: '', id: '' },
    resent: Math.round(clampN(num(d.resent), 0, 100)),
    label: Math.round(clampN(num(d.label), 0, 100)),
    pressYear: num(d.pressYear),
    handYear: num(d.handYear),
    askYear: num(d.askYear),
    hires: Math.max(0, Math.round(num(d.hires))),
    fired: Math.max(0, Math.round(num(d.fired))),
  }
}

/** The mutable family state of a live company (stored on first use). Actions and yearly hooks only. */
export function familyOf(b: BizState): FamilyState {
  const cur = rec(b.family)
  if (cur && num(cur.v) === FAMILY_VERSION && rec(cur.succ)) return cur as unknown as FamilyState
  const st = readFamily(b.family)
  b.family = st as unknown as Json
  return st
}

// ---------------------------------------------------------------------------
// Who works where

export interface Employee {
  p: Person
  job: FamilyJob
}

/** Relatives (and in-laws and cousins hired from outside the contact list) working at a company, highest rank first. */
export function employeesOf(g: GameState, assetId: string): Employee[] {
  const out: Employee[] = []
  for (const p of g.people) {
    if (!p.alive) continue
    const job = readJob(p)
    if (job && job.assetId === assetId) out.push({ p, job })
  }
  return out.sort((x, y) => y.job.rank - x.job.rank || y.job.skill - x.job.skill || x.p.id.localeCompare(y.p.id))
}

/** The company a person works at (one of the player's), if any. */
export function employerOf(g: GameState, p: Person): Asset | undefined {
  const job = readJob(p)
  if (!job) return undefined
  return g.assets.find((a) => a.id === job.assetId && isBusinessAsset(a))
}

/** Everyone with a family job at any company the player owns. */
export function allEmployees(g: GameState): Employee[] {
  const ids = new Set(businessAssets(g).map((a) => a.id))
  const out: Employee[] = []
  for (const p of g.people) {
    if (!p.alive) continue
    const job = readJob(p)
    if (job && ids.has(job.assetId)) out.push({ p, job })
  }
  return out
}

/** The CEO who is a relative (the manager's Person), if any. */
export function familyCeo(g: GameState, b: BizState): Person | undefined {
  if (b.ceo !== 'manager' || !b.manager?.personId) return undefined
  const p = getPerson(g, b.manager.personId)
  return p && p.alive ? p : undefined
}

/** True when this person is the company's CEO right now. */
export function isCeoOf(b: BizState, p: Person): boolean {
  return b.ceo === 'manager' && !!b.manager && b.manager.personId === p.id
}

// ---------------------------------------------------------------------------
// Who could work there

const RELATIVE_RELATIONS = ['child', 'stepchild', 'grandchild', 'sibling', 'halfSibling', 'stepsibling', 'spouse', 'parent', 'stepparent', 'fiance'] as const

/** Family the player can hire: kin in the contact list, or the in-laws and cousins they hired before. */
export function isRelative(p: Person): boolean {
  if ((RELATIVE_RELATIONS as readonly string[]).includes(p.relation)) return true
  return p.relation === 'coworker' && typeof p.data.kin === 'string' && p.data.kin !== ''
}

/** Why this person can't be given a job at this company right now (null: they can). */
export function hireBlock(g: GameState, b: BizState, p: Person): string | null {
  if (!p.alive) return `${p.firstName} is no longer with us.`
  if (!isRelative(p)) return `${p.firstName} isn't family.`
  if (p.data.disowned === true) return `You disowned ${p.firstName}.`
  if (isEstranged(g, p)) return `${p.firstName} is estranged from you.`
  if (p.age < 14) return `${p.firstName} is too young to work (14 and up).`
  if (p.age > 72) return `${p.firstName} is enjoying a long retirement.`
  if (p.relationship < 15) return `${p.firstName} and you are barely speaking.`
  if (personCountry(g, p) !== b.countryId) return `${p.firstName} lives in ${getCountry(personCountry(g, p)).name}${isAbroad(g, p) ? ', far from you' : ''}; the company is in ${getCountry(b.countryId).name}.`
  const hq = readGroupJob(p)
  if (hq) return `${p.firstName} already works at ${hq.groupName}'s head office.`
  const job = readJob(p)
  if (job) {
    const there = g.assets.find((a) => a.id === job.assetId)
    return there ? `${p.firstName} already works at ${there.name}.` : null
  }
  return null
}

/** Family who could be hired at this company, closest first. */
export function eligibleRelatives(g: GameState, b: BizState): Person[] {
  const order: Record<string, number> = { child: 0, stepchild: 1, grandchild: 2, spouse: 3, sibling: 4, halfSibling: 5, stepsibling: 6, parent: 7, stepparent: 8, fiance: 9, coworker: 10 }
  return g.people
    .filter((p) => isRelative(p) && hireBlock(g, b, p) === null)
    .sort((x, y) => (order[x.relation] ?? 20) - (order[y.relation] ?? 20) || y.age - x.age)
}

/** Total yearly pay of the relatives on the payroll (the CEO's pay is the company's CEO cost, not counted here). */
export function familyPayroll(g: GameState, a: Asset, b: BizState): number {
  let sum = 0
  for (const e of employeesOf(g, a.id)) if (!isCeoOf(b, e.p)) sum += e.job.pay
  return sum
}

/** A relative's name with how they are related ('your son Liam', 'your cousin Dele'). */
export function kinWord(p: Person): string {
  const kin = typeof p.data.kin === 'string' && p.data.kin ? p.data.kin : ''
  if (kin) return kin
  switch (p.relation) {
    case 'child':
      return p.gender === 'male' ? 'son' : 'daughter'
    case 'stepchild':
      return p.gender === 'male' ? 'stepson' : 'stepdaughter'
    case 'grandchild':
      return p.gender === 'male' ? 'grandson' : 'granddaughter'
    case 'sibling':
      return p.gender === 'male' ? 'brother' : 'sister'
    case 'halfSibling':
      return p.gender === 'male' ? 'half brother' : 'half sister'
    case 'stepsibling':
      return p.gender === 'male' ? 'stepbrother' : 'stepsister'
    case 'spouse':
      return p.gender === 'male' ? 'husband' : 'wife'
    case 'fiance':
      return p.gender === 'male' ? 'fiancé' : 'fiancée'
    case 'parent':
      return p.gender === 'male' ? 'father' : 'mother'
    case 'stepparent':
      return p.gender === 'male' ? 'stepfather' : 'stepmother'
    default:
      return 'relative'
  }
}

/** 'your son Liam'. */
export function yourKin(p: Person): string {
  return `your ${kinWord(p)} ${p.firstName}`
}

/** 'my son Liam'. */
export function myKin(p: Person): string {
  return `my ${kinWord(p)} ${p.firstName}`
}

/** The designated successor, validated against who is alive and still employed. */
export function successorOf(g: GameState, a: Asset, b: BizState): { kind: 'person'; person: Person; job: FamilyJob } | { kind: 'staff'; id: string; name: string; skill: number } | null {
  const st = readFamily(b.family)
  if (st.succ.kind === 'person') {
    const p = getPerson(g, st.succ.id)
    const job = p && p.alive ? readJob(p) : null
    if (p && p.data.disowned !== true && !isEstranged(g, p) && job && job.assetId === a.id) return { kind: 'person', person: p, job }
    return null
  }
  if (st.succ.kind === 'staff') {
    const s = b.staff.find((x) => x.id === st.succ.id)
    return s ? { kind: 'staff', id: s.id, name: `${s.firstName} ${s.lastName}`, skill: s.skill } : null
  }
  return null
}

/**
 * Who would inherit if the player died now, by the rules life.ts uses: the people named in the will
 * (living children, stepchildren and spouse), or every living child when nobody is named. One heir
 * keeps the company whole; with several heirs, a valid designated child successor keeps it as a
 * specific bequest and the rest of the estate is split.
 */
export function heirsOf(g: GameState): Person[] {
  const eligible = g.people.filter((p) => p.alive && (p.relation === 'child' || p.relation === 'stepchild' || p.relation === 'spouse'))
  const willed = g.character.willBeneficiaries.map((id) => eligible.find((p) => p.id === id)).filter((p): p is Person => !!p)
  return willed.length > 0 ? willed : eligible.filter((p) => p.relation === 'child' || p.relation === 'stepchild')
}
