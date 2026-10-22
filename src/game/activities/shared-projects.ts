import { personCash } from '../cash'
import { addHidden, addRelationship, addStat, formatMoney, fullName, log, notice, remember, useYearAction } from '../core'
import { addCvEntry } from '../cv'
import { initializeNpc } from '../npc-lives'
import { npcLife, saveNpcLife } from '../npc-state'
import { notePerson } from '../people'
import { chance, uid } from '../rng'
import { readJob, writeJob } from '../business/nepo-job'
import { gate, payForAction, paymentBlock } from './common'
import type { GameState, Json, MenuGroup, MenuNode, Person } from '../types'

export type SharedKind = 'mentorship' | 'garden' | 'familyHistory' | 'amateurSport'
export interface SharedProject { id: string; kind: SharedKind; person: string; year: number; progress: number; effort: boolean; lastYear: number; spent: number; completed: boolean; note: string }
const definitions: Record<SharedKind, { label: string; emoji: string; fee: number; age: number; years: number }> = {
  mentorship: { label: 'Professional Mentorship', emoji: '🧑‍🏫', fee: 300, age: 21, years: 3 },
  garden: { label: 'Community Garden', emoji: '🌱', fee: 80, age: 10, years: 2 },
  familyHistory: { label: 'Family Oral-History Album', emoji: '📔', fee: 40, age: 10, years: 2 },
  amateurSport: { label: 'Amateur Club Championship', emoji: '🏅', fee: 120, age: 12, years: 3 },
}
const num = (x: unknown, fallback = 0, max = 1e12, min = 0) => typeof x === 'number' && Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : fallback
export function sharedProjects(g: GameState): SharedProject[] {
  const raw = g.flags.sharedProjects
  if (!Array.isArray(raw)) return []
  return raw.slice(-24).flatMap(x => {
    if (!x || typeof x !== 'object' || Array.isArray(x) || typeof x.id !== 'string' || typeof x.person !== 'string' || !Object.hasOwn(definitions, String(x.kind))) return []
    return [{ id: x.id, kind: x.kind as SharedKind, person: x.person, year: num(x.year, g.year, 100000), progress: num(x.progress, 0, 3), effort: x.effort === true, lastYear: num(x.lastYear, -1, 100000, -1), spent: num(x.spent), completed: x.completed === true, note: typeof x.note === 'string' ? x.note.slice(0, 240) : '' }]
  })
}
const save = (g: GameState, projects: SharedProject[]) => { g.flags.sharedProjects = projects as unknown as Json }
export function sharedAvailability(g: GameState, p: Person, kind: SharedKind): string | null {
  if (!definitions[kind]) return 'Unknown project.'
  const l = npcLife(p), local = p.livesWithPlayer || ((!l || l.country === g.character.countryId) && (!l?.city || l.city === g.character.city))
  if (!p.alive || p.relation === 'pet' || p.data.disowned === true || p.relationship < 40) return 'A living, trusted contact is needed.'
  if (!local) return 'They live elsewhere and cannot attend a local project.'
  if (p.age < (kind === 'mentorship' ? 16 : 8)) return 'They are too young for this project.'
  const relevantDegree = g.character.education.degrees.some(d => l?.field === 'Medicine' ? ['md', 'dds', 'nursing'].includes(d.kind) : l?.field === 'Law' ? d.kind === 'jd' : d.major === l?.field || (l?.field === 'Business' && d.kind === 'mba'))
  if (kind === 'mentorship' && (p.age >= g.character.age || (l?.skill ?? 0) >= Math.min(85, g.character.stats.smarts) || !relevantDegree)) return 'Mentoring needs a younger participant, education in their field and more knowledge than the learner.'
  if (kind === 'familyHistory' && !['parent', 'grandparent', 'sibling', 'child', 'stepchild', 'spouse', 'grandchild'].includes(p.relation)) return 'Choose a relative to record your family history.'
  if (kind === 'amateurSport' && (p.stats.health < 40 || g.character.stats.health < 40)) return 'Both participants need at least 40 health.'
  return null
}
export function startSharedProject(g: GameState, personId: string, kind: SharedKind): boolean {
  const p = g.people.find(p => p.id === personId), def = definitions[kind], projects = sharedProjects(g)
  if (!p || !def || gate(g, { minAge: def.age }) || sharedAvailability(g, p, kind) || projects.filter(p => !p.completed).length >= 4 || projects.some(q => q.person === personId && q.kind === kind && !q.completed) || !useYearAction(g, `shared.invite.${personId}`, 1)) return false
  const l = initializeNpc(g, p)
  const interest = kind === 'mentorship' ? l.ambition / 200 : kind === 'amateurSport' ? p.stats.health / 200 : p.relationship / 200
  if (!chance(g, Math.min(.95, .4 + interest - (l.income > 0 && l.experience < 4 ? .12 : 0)))) {
    notePerson(p, `${g.year}: I declined ${g.character.firstName}'s invitation to ${def.label.toLowerCase()}; I had other priorities.`)
    notice(g, 'Invitation Declined', `${p.firstName} has other priorities this year. Their own work and interests matter; you can ask again next year.`, { emoji: def.emoji }); return false
  }
  const q: SharedProject = { id: uid(g, 'shared'), kind, person: p.id, year: g.year, progress: 0, effort: false, lastYear: g.year, spent: 0, completed: false, note: `${p.firstName} agreed. Fund and attend this year's session.` }
  save(g, [...projects.filter(q => !q.completed), ...projects.filter(q => q.completed).slice(-12), q]); notePerson(p, `${g.year}: I joined ${def.label.toLowerCase()} with ${g.character.firstName}.`)
  notice(g, 'Shared Project', `${p.firstName} joined ${def.label.toLowerCase()}. It takes ${def.years} attended years. You sponsor materials; an adult participant contributes only what they can afford.`, { emoji: def.emoji }); return true
}
export function workSharedProject(g: GameState, id: string): boolean {
  const projects = sharedProjects(g), q = projects.find(q => q.id === id), p = q && g.people.find(p => p.id === q.person)
  if (!q || !p || q.completed || q.effort || gate(g, { minAge: definitions[q.kind].age }) || sharedAvailability(g, p, q.kind)) return false
  const fee = definitions[q.kind].fee, own = p.age >= 18 ? Math.min(Math.max(0, p.money) * .005, fee * .1) : 0
  if (!payForAction(g, fee - own)) return false
  personCash(g, p, -own, 'purchase'); q.spent += fee - own; q.effort = true; q.note = 'Materials paid and sessions attended. Outcome at next birthday.'; save(g, projects)
  addStat(g, 'happiness', 2)
  notice(g, 'A Year of Shared Effort', `You paid ${formatMoney(fee - own)}; ${p.firstName} contributed ${formatMoney(own)}. Advance a year to see the result.`, { emoji: definitions[q.kind].emoji }); return true
}
export function yearlySharedProjects(g: GameState): void {
  if (!g.character.alive) return
  const projects = sharedProjects(g)
  if (!projects.length) return
  for (const q of projects) {
    if (q.completed || q.lastYear >= g.year) continue
    q.lastYear = g.year
    const p = g.people.find(p => p.id === q.person), def = definitions[q.kind]
    if (!p || !p.alive) { q.completed = true; q.note = 'The project ended when the participant was no longer available.'; continue }
    if (!q.effort) { q.note = 'Paused. Arrange and attend a session to continue.'; continue }
    q.effort = false
    const unavailable = sharedAvailability(g, p, q.kind)
    if (unavailable) { q.note = `${unavailable} Paid materials were used for the attempted year; progress is paused.`; continue }
    q.progress++; addRelationship(p, 5)
    if (q.kind === 'mentorship') {
      const l = initializeNpc(g, p); l.skill = Math.min(85, g.character.stats.smarts, l.skill + 3)
      l.history = [...l.history, `${g.year}: completed a year of practical mentorship with ${fullName(g.character)}`].slice(-24); saveNpcLife(p, l)
      const job = readJob(p)
      if (job?.kind === 'real') { job.skill = Math.max(job.skill, Math.min(g.character.stats.smarts, 85, job.skill + 2)); writeJob(p, job) }
    } else if (q.kind === 'amateurSport') { addHidden(g, 'athleticism', 2); p.stats.health = Math.min(100, p.stats.health + 1) }
    else if (q.kind === 'garden') { addHidden(g, 'karma', 2); addStat(g, 'health', 1) }
    else addStat(g, 'happiness', 3)
    q.note = `${q.progress}/${def.years} years completed with ${p.firstName}.`
    notePerson(p, `${g.year}: ${def.label} with ${g.character.firstName}, year ${q.progress}.`)
    if (q.progress >= def.years) {
      q.completed = true
      const text = `${def.label} completed with ${fullName(p)}`
      remember(g, text); notePerson(p, `${g.year}: We completed ${def.label.toLowerCase()} together.`)
      addCvEntry(g, { kind: q.kind === 'garden' ? 'volunteering' : q.kind === 'mentorship' ? 'leadership' : 'activity', title: def.label, org: g.character.city, startAge: g.character.age - (g.year - q.year), endAge: g.character.age, detail: `Completed with ${fullName(p)} over ${q.progress} active years.`, strength: q.kind === 'mentorship' ? 4 : 3, tags: q.kind === 'amateurSport' ? ['sports'] : ['service'], source: 'shared-project' })
      if (q.kind === 'mentorship') { const l = initializeNpc(g, p); l.achievements = [...l.achievements, `Practical mentorship with ${fullName(g.character)} (not a degree)`].slice(-24); saveNpcLife(p, l) }
      if (q.kind === 'amateurSport') { const placed = chance(g, g.character.hidden.athleticism / 140); q.note += placed ? ' Your club placed in the local championship.' : ' Your club finished outside the medals.'; addStat(g, 'happiness', placed ? 6 : 2) }
      log(g, `I completed ${def.label.toLowerCase()} with ${p.firstName}.`, 'good')
    }
  }
  save(g, projects)
}
export const sharedProjectsMenu: MenuGroup = {
  type: 'menu', id: 'shared.projects', label: 'Shared Life Projects', emoji: '🤝', disabledReason: g => gate(g, { minAge: 10 }),
  children: g => [
    { type: 'info', id: 'shared.intro', text: 'Build something over several years with a real contact. They may decline, move away, become busy or die. Sessions need time and materials. Mentorship improves practical skill, never awards a degree or license.' },
    ...sharedProjects(g).map(q => ({ type: 'menu' as const, id: `shared.${q.id}`, label: `${definitions[q.kind].label} · ${g.people.find(p => p.id === q.person)?.firstName ?? 'Former contact'}`, emoji: definitions[q.kind].emoji, children: (): MenuNode[] => [
      { type: 'info', id: `shared.status.${q.id}`, text: `${q.note}\nSpent ${formatMoney(q.spent)} · ${q.completed ? 'Closed' : 'Active'}` },
      { type: 'action', id: `shared.work.${q.id}`, label: 'Fund & Attend This Year’s Sessions', emoji: '🤝', visible: () => !q.completed, subtitle: `Materials up to ${formatMoney(definitions[q.kind].fee)}`, disabledReason: gg => {
        const live = sharedProjects(gg).find(x => x.id === q.id), person = live && gg.people.find(p => p.id === live.person)
        if (!live || live.completed || !person) return 'This project is no longer active.'
        if (live.effort) return 'Already attended; advance a year.'
        const fee = definitions[live.kind].fee, contribution = person.age >= 18 ? Math.min(Math.max(0, person.money) * .005, fee * .1) : 0
        return gate(gg, { minAge: definitions[live.kind].age }) ?? sharedAvailability(gg, person, live.kind) ?? paymentBlock(gg, fee - contribution)
      }, run: gg => { workSharedProject(gg, q.id) } },
      { type: 'action', id: `shared.stop.${q.id}`, label: 'End This Project', emoji: '✋', visible: () => !q.completed, run: gg => { if (gate(gg, { minAge: 10 })) return; const all = sharedProjects(gg), live = all.find(x => x.id === q.id); if (live) { live.completed = true; live.note = 'Ended by agreement; already spent materials are not refundable.'; save(gg, all); notice(gg, 'Project Ended', live.note, { emoji: '✋' }) } } },
    ] })),
    ...(Object.keys(definitions) as SharedKind[]).map(kind => ({ type: 'menu' as const, id: `shared.new.${kind}`, label: `Start ${definitions[kind].label}`, emoji: definitions[kind].emoji, disabledReason: (gg: GameState) => gate(gg, { minAge: definitions[kind].age }), children: (gg: GameState): MenuNode[] => {
      const candidates = gg.people.filter(p => !sharedAvailability(gg, p, kind)).slice(0, 40)
      return candidates.length ? candidates.map(p => ({ type: 'action', id: `shared.invite.${kind}.${p.id}`, label: fullName(p), emoji: '🤝', subtitle: 'Ask about their interest and availability', run: ggg => { startSharedProject(ggg, p.id, kind) } })) : [{ type: 'info', id: `shared.empty.${kind}`, text: 'No eligible local contacts yet. Build relationships, check their Life & Career location, and meet the project’s age or qualification requirements.' }]
    } })),
  ],
}
