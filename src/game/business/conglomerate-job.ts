// Low-level HQ employment records, independent of the group/CEO modules.
import type { GameState, Person } from '../types'
import { clampN, num, rec, str } from './util'

export const GROUP_ROLES = {
  ceo: { label: 'Group CEO', brief: 'Runs the whole portfolio', age: 21, pay: 1 },
  finance: { label: 'Chief Financial Officer', brief: 'Capital allocation and debt', age: 21, pay: .55 },
  operations: { label: 'Chief Operating Officer', brief: 'Execution across divisions', age: 18, pay: .5 },
  talent: { label: 'Chief People Officer', brief: 'Executive hiring and retention', age: 18, pay: .4 },
  strategy: { label: 'Strategy Director', brief: 'Markets and investment priorities', age: 18, pay: .35 },
} as const
export type GroupRole = keyof typeof GROUP_ROLES
export interface GroupJob {
  groupId: string; groupName: string; role: GroupRole; skill: number; pay: number
  since: number; lastYear: number; paidYear: number; unpaid: number
}
export function isGroupRole(value: unknown): value is GroupRole { return typeof value === 'string' && Object.hasOwn(GROUP_ROLES, value) }
export function readGroupJob(p: Person): GroupJob | null {
  const d = rec(p.data.groupJob)
  if (!d || !str(d.groupId) || !isGroupRole(d.role)) return null
  return { groupId: str(d.groupId), groupName: str(d.groupName, 'The Group'), role: d.role,
    skill: clampN(num(d.skill, 30), 0, 100), pay: Math.max(0, Math.round(num(d.pay))),
    since: num(d.since), lastYear: num(d.lastYear, -1), paidYear: num(d.paidYear, -1), unpaid: Math.max(0, Math.round(num(d.unpaid))) }
}
export function writeGroupJob(p: Person, job: GroupJob): void { p.data.groupJob = { ...job } }
export function clearGroupJob(p: Person): void {
  const job = readGroupJob(p)
  if (job && p.occupation === `${GROUP_ROLES[job.role].label} at ${job.groupName}`) p.occupation = 'Unemployed'
  delete p.data.groupJob
}
export function clearGroupCeoJob(g: GameState, manager: { personId?: string } | null): void {
  const p = g.people.find(p => p.id === manager?.personId)
  if (p && readGroupJob(p)?.role === 'ceo') clearGroupJob(p)
}
