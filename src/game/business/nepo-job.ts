// A relative's job at the player's company, stored on the Person (Person.data.nepo, plain JSON).
// This file has no game logic and imports no business modules, so low-level code (wealth asks,
// career.syncCeo) can read it without cycles.
//
// The record belongs to the Person, not to the company: when an heir takes over, a sibling who
// worked at the family firm still does, and an heir who was an employee simply stops being one
// (the heir's Person is not in the list any more).
import type { Json, Person } from '../types'
import type { StaffFocus } from './industries'
import { clampN, num, rec, str } from './util'
import { readGroupJob } from './conglomerate-job'

/**
 * The key a person's stable rolls (drive, department, made-up title) are drawn from. An in-law or a
 * cousin who asks before being hired is shown with a stand-in id; once hired they keep that key
 * (Person.data.nepoSeed), so the skill and the title the owner saw are the ones they get.
 */
export function seedKey(p: Person): string {
  const k = p.data.nepoSeed
  return typeof k === 'string' && k ? k : p.id
}

export const FOCUSES: readonly StaffFocus[] = ['ops', 'sales', 'quality', 'finance']

/** Highest rank: the CEO. Ranks run 0 (intern / apprentice) to 5. */
export const MAX_RANK = 5

export interface FamilyJob {
  /** The company (Asset.id). */
  assetId: string
  /** 0 intern / apprentice, 1 associate / clerk, 2 manager, 3 director, 4 vice president, 5 CEO. */
  rank: number
  focus: StaffFocus
  /** 'cushy': a made-up job with a big title and nothing to do. */
  kind: 'real' | 'cushy'
  /** The title as written when they got it (era-correct for that year). */
  title: string
  since: number
  rankSince: number
  /** Yearly pay in engine dollars. */
  pay: number
  /** Real competence at the work, 0-100: it grows with practice. */
  skill: number
  /** How they feel about the job, 0-100. */
  mood: number
  /** Last year's performance rating, 0-100 (what the company screen shows). */
  perf: number
  /** Year of the last raise (0: none). */
  raised: number
  /** Years in a row the company could not pay them in full. */
  unpaid: number
  /** Years in a row in a role far above their skill. */
  burn: number
  /** True while it is a summer / part-time job (a minor). */
  part: boolean
  /** Being groomed as the successor: mentored, learns faster. */
  groom: boolean
  /** Character id of the player who hired them. */
  by: string
  /** 'cousin', 'brother-in-law'...: relatives who are not in the contact list as family. */
  kin: string
}

/** The family job on a person, normalized (null when they have none). */
export function readJob(p: Person): FamilyJob | null {
  const d = rec(p.data.nepo)
  if (!d) return null
  const assetId = str(d.assetId)
  if (!assetId) return null
  const focus = FOCUSES.find((f) => f === d.focus) ?? 'ops'
  const since = num(d.since)
  return {
    assetId,
    rank: Math.round(clampN(num(d.rank), 0, MAX_RANK)),
    focus,
    kind: d.kind === 'cushy' ? 'cushy' : 'real',
    title: str(d.title, 'Staff'),
    since,
    rankSince: num(d.rankSince, since),
    pay: Math.max(0, Math.round(num(d.pay))),
    skill: clampN(num(d.skill, 30), 0, 100),
    mood: clampN(num(d.mood, 70), 0, 100),
    perf: clampN(num(d.perf, 55), 0, 100),
    raised: num(d.raised),
    unpaid: Math.max(0, Math.round(num(d.unpaid))),
    burn: Math.max(0, Math.round(num(d.burn))),
    part: d.part === true,
    groom: d.groom === true,
    by: str(d.by),
    kin: str(d.kin),
  }
}

/** Store a family job on a person (rounded, plain JSON). */
export function writeJob(p: Person, j: FamilyJob): void {
  const out: Record<string, Json> = {
    assetId: j.assetId,
    rank: Math.round(clampN(j.rank, 0, MAX_RANK)),
    focus: j.focus,
    kind: j.kind,
    title: j.title,
    since: j.since,
    rankSince: j.rankSince,
    pay: Math.max(0, Math.round(j.pay)),
    skill: Math.round(clampN(j.skill, 0, 100) * 10) / 10,
    mood: Math.round(clampN(j.mood, 0, 100)),
    perf: Math.round(clampN(j.perf, 0, 100)),
    raised: j.raised,
    unpaid: j.unpaid,
    burn: j.burn,
    part: j.part,
    groom: j.groom,
    by: j.by,
    kin: j.kin,
  }
  p.data.nepo = out
}

export function clearJob(p: Person): void {
  delete p.data.nepo
}

/** True when this person holds a job at one of the player's companies. */
export function holdsFamilyJob(p: Person): boolean {
  return readJob(p) !== null || readGroupJob(p) !== null
}

/** What a person did before: a job that ended (fired, quit, poached, started a company). */
export interface PastJob {
  assetId: string
  year: number
  how: 'fired' | 'quit' | 'startup' | 'poached' | 'burnout' | 'closed' | 'replaced'
  rank: number
}

export function readPast(p: Person): PastJob | null {
  const d = rec(p.data.nepoPast)
  if (!d) return null
  const how = ['fired', 'quit', 'startup', 'poached', 'burnout', 'closed', 'replaced'].find((h) => h === d.how)
  if (!how) return null
  return { assetId: str(d.assetId), year: num(d.year), how: how as PastJob['how'], rank: Math.round(clampN(num(d.rank), 0, MAX_RANK)) }
}

export function writePast(p: Person, past: PastJob): void {
  p.data.nepoPast = { assetId: past.assetId, year: past.year, how: past.how, rank: past.rank }
}
