// Employer assignments are covered by the ordinary salary, never paid twice.
import { addHidden, addStat, formatMoney, log, notice, useYearAction } from './core'
import { payForAction } from './activities/common'
import { addCvEntry } from './cv'
import { getJobDef, jobInEra } from './data/jobs'
import { meetsEducation } from './education'
import { chance } from './rng'
import { foundingProblem, startFounding } from './business/founding'
import type { Industry } from './data/markets'
import type { GameState, Json, MenuGroup, MenuNode } from './types'

export type Profession = 'medicine' | 'law' | 'engineering' | 'trade'
interface Assignment { title: string; started: number; remaining: number; approach: string; preparation: number; job: string }
export interface ProfessionalRecord { v: 1; skill: number; reputation: number; completed: number; failed: number; specialty: string; lastYear: number; assignment: Assignment | null; history: string[] }
const paths: Record<Profession, { name: string; emoji: string; tags: string[]; specialties: string[]; business?: Industry; assignments: string[]; choices: string[] }> = {
  medicine: { name: 'Clinical Practice', emoji: '🩺', tags: ['health', 'science'], specialties: ['Community care', 'Complex diagnosis'], business: 'clinic', assignments: ['Community follow-up program', 'Difficult diagnostic review'], choices: ['Evidence review & safe referral', 'High patient throughput', 'Take underserved patients'] },
  law: { name: 'Legal Practice', emoji: '⚖️', tags: ['law', 'business'], specialties: ['Negotiation', 'Litigation'], assignments: ['Small-business contract dispute', 'Contested civil case'], choices: ['Negotiate a settlement', 'Aggressive court strategy', 'Take a difficult public-interest case'] },
  engineering: { name: 'Engineering Portfolio', emoji: '📐', tags: ['science', 'tech'], specialties: ['Structures', 'Production systems'], business: 'construction', assignments: ['Public-building design', 'Factory process redesign'], choices: ['Prototype and safety review', 'Accelerated delivery', 'Resource-efficient design'] },
  trade: { name: 'Craft & Apprenticeship', emoji: '🔧', tags: ['service', 'tech'], specialties: ['Repair diagnostics', 'Installation'], business: 'homeCare', assignments: ['Difficult repair commission', 'New installation and inspection'], choices: ['Diagnose before replacing parts', 'Rush the repair queue', 'Take a difficult restoration'] },
}
const n = (x: unknown, fallback: number, max = 100) => typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.min(max, x)) : fallback
const obj = (x: unknown): Record<string, unknown> => x && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : {}

export function professionOf(g: GameState): Profession | null {
  const job = g.character.job, def = job && getJobDef(job.defId)
  if (!job || job.category !== 'fulltime' || !def || !jobInEra(def, g.year, g.character.countryId) || !meetsEducation(g, def.edu, def.majors)) return null
  if (['family_physician', 'brain_surgeon', 'psychiatrist', 'dentist', 'nurse'].includes(def.id)) return 'medicine'
  if (def.id === 'lawyer') return 'law'
  if (['engineer', 'chemical_engineer', 'mechanical_engineer', 'architect'].includes(def.id)) return 'engineering'
  if (['electrician', 'plumber', 'carpenter', 'auto_mechanic'].includes(def.id)) return 'trade'
  return null
}
export function professionalRecord(g: GameState, path: Profession): ProfessionalRecord {
  const x = obj(obj(g.flags.professions)[path]), a = obj(x.assignment)
  const valid = typeof a.title === 'string' && typeof a.job === 'string' && ['careful', 'fast', 'advocate'].includes(String(a.approach))
  return { v: 1, skill: n(x.skill, 25), reputation: n(x.reputation, 40), completed: n(x.completed, 0, 10000), failed: n(x.failed, 0, 10000),
    specialty: paths[path].specialties.includes(String(x.specialty)) ? String(x.specialty) : '', lastYear: typeof x.lastYear === 'number' && Number.isFinite(x.lastYear) ? x.lastYear : -1,
    assignment: valid ? { title: String(a.title).slice(0, 100), job: String(a.job), started: n(a.started, g.year, 100000), remaining: n(a.remaining, 1, 3), approach: String(a.approach), preparation: n(a.preparation, 0, 30) } : null,
    history: Array.isArray(x.history) ? x.history.filter((s): s is string => typeof s === 'string').slice(-12) : [] }
}
function save(g: GameState, path: Profession, r: ProfessionalRecord) { g.flags.professions = { ...obj(g.flags.professions), [path]: r } as unknown as Json }
function block(g: GameState, path: Profession): string | null { return !g.character.alive || g.character.prison ? 'You cannot work right now.' : professionOf(g) !== path ? 'Hold a qualified job in this profession first.' : null }
const jobKey = (g: GameState) => `${g.character.job?.defId}|${g.character.job?.company}|${g.character.job?.data.appointmentId ?? ''}`

export function startProfessionalAssignment(g: GameState, path: Profession, approach: string): boolean {
  if (!paths[path] || block(g, path) || !['careful', 'fast', 'advocate'].includes(approach)) return false
  const r = professionalRecord(g, path)
  if (r.assignment || !useYearAction(g, 'profession.assignment', 1)) return false
  const def = paths[path]
  r.assignment = { title: def.assignments[r.completed % def.assignments.length], started: g.year, remaining: path === 'engineering' && approach !== 'fast' ? 2 : 1, approach, preparation: 0, job: jobKey(g) }
  if (approach === 'fast') addStat(g, 'happiness', 4)
  save(g, path, r)
  notice(g, def.name, `${r.assignment.title} is on your docket. ${r.assignment.remaining === 2 ? 'Design and delivery take two years.' : 'The outcome arrives next birthday.'} ${approach === 'fast' ? 'A compressed schedule gives you more free time but increases professional risk. ' : ''}Review it here before aging up. Your employer funds the project; this work is part of your salary.`, { emoji: def.emoji })
  return true
}
export function prepareProfessionalWork(g: GameState, path: Profession): boolean {
  if (!paths[path] || block(g, path)) return false
  const r = professionalRecord(g, path)
  if (!r.assignment || (g.yearActions['profession.review'] ?? 0) >= 1) return false
  const cost = Math.round(Math.max(25, g.character.job!.salary * .002))
  if (!payForAction(g, cost)) return false
  useYearAction(g, 'profession.review', 1)
  r.assignment.preparation = Math.min(30, r.assignment.preparation + 12); r.skill = Math.min(100, r.skill + 3)
  addStat(g, 'happiness', -2); save(g, path, r)
  notice(g, 'Peer Review & Study', `You spent ${formatMoney(cost)} on professional materials and gave up personal time. Preparation is ${r.assignment.preparation}/30.`, { emoji: '📚' })
  return true
}
export function specializeProfession(g: GameState, path: Profession, specialty: string): boolean {
  if (!paths[path]?.specialties.includes(specialty) || block(g, path)) return false
  const r = professionalRecord(g, path)
  if (r.completed < 2 || r.specialty || !payForAction(g, Math.max(100, g.character.job!.salary * .01))) return false
  r.specialty = specialty; r.skill = Math.min(100, r.skill + 5); save(g, path, r)
  addCvEntry(g, { kind: 'certification', title: `${specialty}: workplace qualification`, org: g.character.job!.company, startAge: g.character.age, endAge: g.character.age, strength: 4, tags: paths[path].tags, source: 'profession', detail: 'Supervised work and continuing development; not a transferable statutory license.' })
  notice(g, 'Professional Specialization', `${specialty} is recorded on your CV. Your achievements remain yours when you change employers.`, { emoji: paths[path].emoji })
  return true
}
export function yearlyProfessions(g: GameState): void {
  if (!g.character.alive || !g.flags.professions) return
  for (const path of Object.keys(paths) as Profession[]) {
    const r = professionalRecord(g, path), a = r.assignment
    if (!a || r.lastYear >= g.year || a.started >= g.year) continue
    r.lastYear = g.year
    if (block(g, path) || jobKey(g) !== a.job) { r.assignment = null; r.history = [...r.history, `${g.year}: ${a.title} handed back after leaving the role.`].slice(-12); save(g, path, r); continue }
    if (--a.remaining > 0) { log(g, `I completed the design stage of ${a.title.toLowerCase()}; delivery is due next year.`); save(g, path, r); continue }
    const careful = a.approach === 'careful', advocate = a.approach === 'advocate'
    let odds = .4 + r.skill / 250 + a.preparation / 150 + (r.specialty ? .08 : 0)
    if (path === 'law') odds += careful ? .16 : advocate ? -.08 : -.12
    else if (path === 'medicine') odds += careful ? .12 : advocate ? .03 : -.2
    else if (path === 'engineering') odds += careful ? .1 : advocate ? .04 : -.22
    else odds += careful ? .12 : advocate ? -.02 : -.14
    const success = chance(g, Math.max(.1, Math.min(.96, odds))), gain = path === 'law' && careful ? 5 : advocate ? 13 : 9
    r.reputation = Math.max(0, Math.min(100, r.reputation + (success ? gain : -10)))
    r.skill = Math.min(100, r.skill + (success ? 6 : 3)); r.completed += success ? 1 : 0; r.failed += success ? 0 : 1
    g.character.job!.performance = Math.max(0, Math.min(100, g.character.job!.performance + (success ? 7 : -8)))
    if (advocate && path === 'medicine') addHidden(g, 'karma', 2)
    if (!careful) addStat(g, 'happiness', -2)
    const outcome = success ? path === 'law' && careful ? 'settled fairly' : 'delivered successfully' : path === 'medicine' ? 'needed referral and a formal review' : path === 'trade' ? 'required warranty rework' : path === 'law' ? 'did not secure the requested outcome' : 'failed commissioning and required redesign'
    r.history = [...r.history, `${g.year}: ${a.title} ${outcome}.`].slice(-12); r.assignment = null; save(g, path, r)
    if (success) addCvEntry(g, { kind: 'project', title: a.title, org: g.character.job!.company, startAge: g.character.age - (g.year - a.started), endAge: g.character.age, detail: `${outcome}; ${r.specialty || 'general practice'}.`, tags: paths[path].tags, strength: Math.min(8, 3 + Math.floor(r.completed / 3)), source: 'profession' })
    log(g, `My ${a.title.toLowerCase()} ${outcome}. Professional reputation: ${r.reputation}/100.`, success ? 'good' : 'bad')
  }
}
export const professionalMenu: MenuGroup = {
  type: 'menu', id: 'professional.work', label: 'Professional Practice', emoji: '📋', visible: g => !!professionOf(g) || !!g.flags.professions,
  children: g => {
    const path = professionOf(g)
    if (!path) return [{ type: 'info', id: 'professional.entry', text: 'Join medicine, law, engineering or a skilled trade through Find Work. Completed work stays on your CV; assignments require an eligible current job.' }]
    const r = professionalRecord(g, path), def = paths[path]
    const nodes: MenuNode[] = [{ type: 'info', id: 'professional.status', text: `${def.name} · Skill ${r.skill}/100 · Reputation ${r.reputation}/100\n${r.completed} successes / ${r.failed} setbacks · ${r.specialty || 'General practice'}\n${r.assignment ? `${r.assignment.title}: ${r.assignment.remaining} year(s) left; preparation ${r.assignment.preparation}/30.` : 'Choose your next assignment. Outcomes affect performance and your CV, not an extra salary.'}` }]
    if (!r.assignment) def.choices.forEach((label, i) => nodes.push({ type: 'action', id: `professional.start.${i}`, label, emoji: def.emoji, subtitle: i === 0 ? 'Safer outcome; measured reputation growth' : i === 1 ? 'More free time now; higher failure risk' : 'Harder work; stronger reputation if delivered', disabledReason: gg => block(gg, path) ?? ((gg.yearActions['profession.assignment'] ?? 0) >= 1 ? 'Start your next assignment next year.' : null), run: gg => { startProfessionalAssignment(gg, path, ['careful', 'fast', 'advocate'][i]) } }))
    else nodes.push({ type: 'action', id: 'professional.review', label: 'Peer Review & Study', emoji: '📚', subtitle: `Costs ${formatMoney(Math.max(25, g.character.job!.salary * .002))}; once a year`, disabledReason: gg => (gg.yearActions['profession.review'] ?? 0) >= 1 ? 'Already reviewed this year.' : null, run: gg => { prepareProfessionalWork(gg, path) } })
    def.specialties.forEach(s => nodes.push({ type: 'action', id: `professional.specialize.${s}`, label: `Specialize: ${s}`, emoji: '🎓', disabledReason: () => r.specialty ? 'You already have a specialization.' : r.completed < 2 ? 'Complete two assignments first.' : null, subtitle: `Training costs ${formatMoney(Math.max(100, g.character.job!.salary * .01))}`, run: gg => { specializeProfession(gg, path, s) } }))
    if (def.business) nodes.push({ type: 'action', id: 'professional.found', label: path === 'medicine' ? 'Open a Medical Clinic' : path === 'trade' ? 'Start a Home Services Firm' : 'Start a Construction Firm', emoji: '🏢', disabledReason: gg => { const rr = professionalRecord(gg, path); return block(gg, path) ?? (rr.completed < 3 || rr.reputation < 60 ? 'Build three successes and 60 reputation first.' : foundingProblem(gg, def.business!)) }, subtitle: 'Uses existing company funding, hiring and management', run: gg => { const rr = professionalRecord(gg, path); if (!block(gg, path) && rr.completed >= 3 && rr.reputation >= 60) startFounding(gg, def.business!) } })
    if (path === 'law') nodes.push({ type: 'info', id: 'professional.partnership', text: 'Case achievements improve your CV and performance. Partnership is reached through your law job’s existing promotion ladder.' })
    nodes.push(...r.history.map((text, i) => ({ type: 'info' as const, id: `professional.history.${i}`, text })))
    return nodes
  },
}
