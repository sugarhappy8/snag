import type { Json, Person } from './types'

export type NpcField = 'Engineering' | 'Finance' | 'Mathematics' | 'Law' | 'Marketing' | 'Medicine' | 'Business' | 'Computer Science'
export interface NpcLife {
  v: 1; lastYear: number; country: string; field: NpcField; education: number; study: number;
  skill: number; experience: number; income: number; debt: number; investments: number; housing: number;
  ambition: number; employer: string; history: string[]; achievements: string[]; housingQuality: number; city?: string;
}
const fields: NpcField[] = ['Engineering', 'Finance', 'Mathematics', 'Law', 'Marketing', 'Medicine', 'Business', 'Computer Science']
const n = (v: unknown, base = 0, max = 1e15, min = 0) => typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : base
export function npcLife(p: Person): NpcLife | null {
  const d = p.data.life
  if (!d || typeof d !== 'object' || Array.isArray(d) || d.v !== 1) return null
  const strings = (x: Json | undefined) => Array.isArray(x) ? x.filter((y): y is string => typeof y === 'string').slice(-24) : []
  const country = typeof p.data.countryId === 'string' ? p.data.countryId : typeof d.country === 'string' ? d.country : 'us'
  return { v: 1, lastYear: n(d.lastYear, -1, 10000, -1), country, city: d.country === country && typeof d.city === 'string' ? d.city : '',
    field: fields.includes(d.field as NpcField) ? d.field as NpcField : 'Business', education: Math.floor(n(d.education, 0, 3)), study: Math.floor(n(d.study, 0, 8)),
    skill: n(d.skill, 25, 100), experience: n(d.experience, 0, 100), income: n(d.income), debt: n(d.debt), investments: n(d.investments), housing: n(d.housing),
    ambition: n(d.ambition, 50, 100), employer: typeof d.employer === 'string' ? d.employer : '', history: strings(d.history), achievements: strings(d.achievements), housingQuality: n(d.housingQuality, 50, 100) }
}
export function saveNpcLife(p: Person, life: NpcLife): void { p.data.life = life as unknown as Json }
export function npcEducationSkill(p: Person, focus?: string): number {
  const l = npcLife(p)
  if (!l) return 0
  const relevant = !focus || (focus === 'finance' ? ['Finance', 'Mathematics', 'Business'] : focus === 'sales' ? ['Marketing', 'Business', 'Law'] : ['Engineering', 'Computer Science', 'Medicine', 'Mathematics']).includes(l.field)
  return relevant ? Math.min(18, l.education * 3 + l.experience * .4) : Math.min(4, l.education)
}
