// How good a relative is at the job. Everything is a pure function of the person (smarts, temper,
// how spoiled they are), the rank, and how long they have practiced: no randomness, so menus, hints
// and the yearly step all see the same numbers.
//
//   drive      how hard they work, 0-100 (a stable roll per person, moved by their traits and by
//              how spoiled they are)
//   aptitude   what they could grow into, from smarts and drive
//   ceiling    the best they can get at it with experience (aptitude + 14)
//   skill      where they are now: starts from aptitude and age, climbs toward the ceiling
//   fit        skill minus the rank's difficulty: positive grows and shines, negative drags
import { seeded } from '../assets'
import { entitlement } from '../events/wealth-core'
import type { Person } from '../types'
import { npcEducationSkill } from '../npc-state'
import { MAX_RANK, seedKey, type FamilyJob } from './nepo-job'
import { rankDef } from './nepo-roles'
import { clampN } from './util'

const DRIVE_TRAITS: Record<string, number> = {
  ambitious: 12,
  serious: 6,
  sporty: 4,
  nerdy: 4,
  loyal: 3,
  honest: 2,
  optimistic: 3,
  calm: 2,
  lazy: -22,
  rebellious: -4,
  arrogant: -3,
  anxious: -3,
  dramatic: -2,
}

/** How hard this person works, 0-100 (stable for a person). */
export function driveOf(p: Person): number {
  const roll = seeded(`drive|${seedKey(p)}`).next()
  let d = 35 + roll * 40
  for (const t of p.traits) d += DRIVE_TRAITS[t] ?? 0
  const e = entitlement(p)
  if (e > 30) d -= (e - 30) * 0.3
  if (p.data.nepoSelfMade !== undefined) d += 8
  return Math.round(clampN(d, 5, 98))
}

/** What they could grow into, 0-100: smarts and drive. */
export function aptitudeOf(p: Person): number {
  const selfMade = typeof p.data.nepoSelfMade === 'number' ? 8 : 0
  return clampN(0.5 * p.stats.smarts + 0.38 * driveOf(p) + 6 + selfMade, 5, 99)
}

/** The best skill they can reach at work. */
export function ceilingOf(p: Person): number {
  return clampN(aptitudeOf(p) + 14, 20, 97)
}

/** Skill on day one: from aptitude and a little life experience (a self-made kid brings real credentials). */
export function startSkill(p: Person): number {
  const selfMade = typeof p.data.nepoSelfMade === 'number' ? 10 : 0
  return Math.round(clampN(aptitudeOf(p) * 0.5 + Math.max(0, p.age - 18) * 0.7 + selfMade + npcEducationSkill(p), 3, 95))
}

/** Skill minus difficulty: how far above (+) or below (-) the job they are. */
export function fitOf(skill: number, rank: number): number {
  return skill - rankDef(rank).difficulty
}

/** Words for a fit. */
export function fitWord(fit: number): string {
  if (fit >= 25) return 'well ahead of the job'
  if (fit >= 8) return 'comfortable in it'
  if (fit >= -8) return 'about right for it'
  if (fit >= -25) return 'out of their depth'
  return 'hopelessly out of their depth'
}

/** Words for a performance rating. */
export function ratingWord(perf: number): string {
  if (perf >= 80) return 'excellent'
  if (perf >= 65) return 'good'
  if (perf >= 50) return 'solid'
  if (perf >= 35) return 'struggling'
  return 'failing'
}

/** Next year's skill: practice toward the ceiling, slower when the job is far over their head. */
export function nextSkill(p: Person, job: Pick<FamilyJob, 'skill' | 'rank' | 'kind' | 'groom' | 'mood'>): number {
  const ceiling = ceilingOf(p)
  if (job.skill >= ceiling) return job.skill
  let rate = 0.14 + 0.12 * (driveOf(p) / 100)
  if (job.kind === 'cushy') rate = 0.02
  else {
    if (rankDef(job.rank).difficulty > job.skill + 25) rate *= 0.5
    if (job.groom) rate *= 1.25
    if (job.mood < 35) rate *= 0.6
  }
  return Math.min(ceiling, job.skill + Math.max(0.3, (ceiling - job.skill) * rate))
}

/** The expected rating at a skill, rank and mood, before the year's luck (+/- 6). */
export function expectedRating(skill: number, rank: number, mood: number): number {
  return clampN(52 + fitOf(skill, rank) * 1.15 + (mood - 60) * 0.12, 0, 100)
}

/** What the company would see from this person in this job (for hints and offers). */
export interface Outlook {
  skill: number
  fit: number
  rating: number
  ceiling: number
  /** Years until they would grow into the job (0: already there, null: never). */
  yearsToGrow: number | null
}

export function outlookFor(p: Person, rank: number, kind: 'real' | 'cushy' = 'real', skill?: number): Outlook {
  const s = skill ?? startSkill(p)
  const fit = fitOf(s, rank)
  const ceiling = ceilingOf(p)
  let years: number | null = 0
  if (kind === 'real' && fit < 0) {
    years = null
    const sim = { skill: s, rank, kind, groom: false, mood: 70 }
    for (let y = 1; y <= 12; y++) {
      sim.skill = nextSkill(p, sim)
      if (fitOf(sim.skill, rank) >= 0) {
        years = y
        break
      }
    }
  } else if (kind === 'cushy') years = null
  return { skill: s, fit, rating: expectedRating(s, rank, 70), ceiling, yearsToGrow: years }
}

/** A few words on how the hire would go, shared by hints and offers. */
export function outlookText(o: Outlook, rank: number, kind: 'real' | 'cushy'): string {
  const need = rankDef(rank).difficulty
  if (kind === 'cushy') return 'a made-up job: they will learn nothing, the staff will notice and the books pay for it'
  if (o.fit >= 8) return `a good fit: skill about ${Math.round(o.skill)} against ${need} needed${rank < MAX_RANK - 1 && o.ceiling >= rankDef(rank + 1).difficulty ? ', with room to grow' : ''}`
  if (o.fit >= -8) return `a fair fit: skill about ${Math.round(o.skill)} against ${need} needed`
  if (o.yearsToGrow !== null) return `a stretch: skill about ${Math.round(o.skill)} against ${need} needed, about ${o.yearsToGrow} ${o.yearsToGrow === 1 ? 'year' : 'years'} to grow into it, dragging results until then`
  return `a mismatch: skill about ${Math.round(o.skill)} against ${need} needed and they will top out near ${Math.round(o.ceiling)}`
}

/** What a mismatch costs how others see the hire: how far over their head, 0-1 (0 when they can do it). */
export function overHead(job: Pick<FamilyJob, 'skill' | 'rank' | 'kind'>): number {
  if (job.kind === 'cushy') return 0.6
  return clampN(-fitOf(job.skill, job.rank) / 50, 0, 1)
}
