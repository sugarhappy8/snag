// R4-U6 (People UI and fog track, H.5, first half; R4-U7 adds the CEO reads on top): hired people are read through Knowledge, with tenure
// as exposure. A shortlist already shows a range for the skill and "not clear yet" for the trait (R3, staff-fog.ts). The sheet of the
// person you hired used to print the true skill, the trait label and a "current contribution" worked out from both, so the sentence gave
// the numbers back by inversion. Now, in Realistic with the build flag `peopleProfile` on (staffFog):
//
//   staffExposure(years)         min(1, years / 3): the passive read narrows by x(1 - .4 exposure) as the years go
//   staffSkillRead(g, asset, s)  the estimate of a hire's skill on the key `stf:<asset>:<id>:skill` (rule row stf.skill, sd .20, drift .05)
//   carryRead(g, asset, id, r)   the read you had of the candidate you hired goes with the hire: it is learned into that key, source
//                                `interview`, or `diligence` after a background check. It wins in the year of the hire (its sd, .18 or
//                                .108 with the Business talent, is below the passive .20 or .12) and later while its aged sd is lower
//   traitNamed(g, asset, s)      the trait is named after a year, or at once after a background check
//   shownLeader(g, asset, s)     a hire as the player knows them: the middle of the read for the skill, a steady trait until it is named.
//                                The sheet works "current contribution" out on that copy, so it no longer gives the true values away
//   leaderRead, skillText        a range and its chip for any skill key (the CEO shortlist and rows of R4-U7), and the words of a range
//   leaderEstimate               the estimate behind leaderRead, for a screen that works a second number out of the range (finance skill)
//
// R4-U7 puts the hired CEO on the same key family (`stf:<company>:ceo:skill`; a group's CEO uses the group's id):
//
//   ceoSkillRead(g, id, m)       the read of a CEO's skill at the exposure of their years (g.year - since); a row learned before they began
//                                is about the CEO before and is ignored
//   ceoRead                      its text and chip: today's `N/100` without staffFog(), a range, or "not clear yet"
//   ceoWord                      the letter's word (competent, elite, world-class), from the middle of the read and never from the skill
//   startCeoRead                 a new CEO: the row of the one before goes, and the read you had of the one you hired is kept
//   mappedText                   a range worked through a function of the skill (the finance skill of a finance CEO)
//
// The leaf also registers the owner of the `stf` kind: a label and `gone` (true when the hire left, or the company is gone, or the CEO
// has changed since the row was learned, so the yearly knowledge step forgets the row). It has no truth to sell and no scope, so no source reads it and nothing is for sale: the interview is
// the read, the background check is the other one, and both are the shortlist's. `cand` stays ownerless (test/fog-acceptance.test.ts).
//
// Why a leaf of its own. A business file may not import people-fog.ts (business->life is a counted pair of the layer ratchet, 97 today),
// and staff.ts and board-ceo.ts sit in the 59-module business cycle, manage.ts and conglomerate-menu.ts in another. So this file imports
// the flags, the knowledge door and the types and nothing from business/: it reads a company as raw JSON (Asset.details.staff and
// .manager), and it cannot join a cycle. It is, with people-fog.ts, one of the two files allowed to pass `exp:` to know()
// (test/knowledge-unwired.test.ts).
//
// Rules: nothing here draws or writes except carryRead, which learns one row (flags.know, capped at 120 by Knowledge); the noise of a
// read is a hashed draw of life, key, year and source (knowledge/normal.ts), never g.rng; every reader is total (a key the contract
// refuses reads as "not clear yet", never as the exact number); Exact and a flag-off life never get here, they print today's sheet.
import { flagOn } from '../flags'
import { estimate, forget, isExact, know, learn, parseKey, readKnow, registerKeyKind, type Estimate, type StoredRow } from '../knowledge/contract'
import type { GameState } from '../types'

/** What a screen prints when a read cannot be made. */
const NOT_CLEAR = 'not clear yet'
/** A leader the read cannot reach counts as middling in the contribution, and steady until the trait is named. */
const MIDDLING = 50
const NEUTRAL_TRAIT = 'steady'
/** Past this many years the exposure is 1. */
const FULL_YEARS = 3

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** A staff member as the leaf needs them (the KeyStaff of business/state.ts fits; the leaf imports nothing from there). */
export interface StaffRef {
  id: string
  skill: number
  years: number
}

/** What a hire carries from the shortlist to the sheet: the middle and the relative sd of the read, and whether a check made it. */
export interface HiredRead {
  mid: number
  sd: number
  checked: boolean
}

/** What a screen prints for a fogged skill, and how sure the read is (the shape staff-fog.ts calls Fogged). */
export interface LeaderText {
  text: string
  conf?: 0 | 1 | 2 | 3
}

/** The hired-staff and CEO reads exist: the build flag is on and the player reads estimates (Realistic). Always equal to peopleFog(). */
export function staffFog(): boolean {
  return flagOn('peopleProfile') && !isExact()
}

/** How much of a hire the player has seen: min(1, years / 3). Total: a number that is not finite, or below 0, counts as 0. */
export function staffExposure(years: number): number {
  return finite(years) ? Math.min(1, Math.max(0, years / FULL_YEARS)) : 0
}

/** The Knowledge key of a hire's skill, `stf:<asset>:<id>:skill`; null when the contract refuses it (a space, a colon, a long id). */
export function staffKey(assetId: string, staffId: string): string | null {
  if (typeof assetId !== 'string' || typeof staffId !== 'string') return null
  const key = `stf:${assetId}:${staffId}:skill`
  const p = parseKey(key)
  return p !== null && p.kind === 'stf' && p.field === 'skill' && p.ids.length === 2 && p.ids[0] === assetId && p.ids[1] === staffId ? key : null
}

/**
 * The skill as a range, rounded outward so it holds the truth at least as often as the band (to 5 while the read is rough, to 1 once
 * a check has sharpened it): "about 55 to 75", or "about 70" when it comes to one number. Exact estimates print as today.
 */
export function skillText(e: Estimate, skill: number): string {
  if (e.exact) return `${skill}/100`
  const step = e.sd > 0.1 ? 5 : 1
  const lo = Math.max(0, Math.floor(e.lo / step) * step)
  const hi = Math.min(100, Math.ceil(e.hi / step) * step)
  return lo >= hi ? `about ${lo}` : `about ${lo} to ${hi}`
}

/**
 * What the player may read of a hire's skill: the estimate of the true skill on `stf:<asset>:<id>:skill` at the exposure of their years,
 * or the carried read while that one is sharper. Null when staffFog() is off (the caller prints today's text), when the key is refused
 * or the skill is not a number, and never the truth.
 */
export function staffSkillRead(g: GameState, assetId: string, s: StaffRef): Estimate | null {
  if (!staffFog() || typeof s !== 'object' || s === null) return null
  const key = staffKey(assetId, s.id)
  if (key === null || !finite(s.skill)) return null
  const e = know(g, key, Math.min(100, Math.max(0, s.skill)), { exp: staffExposure(s.years) })
  return e.exact ? null : e
}

/** The trait is named: after a year, or at once when the carried read came from a background check. Total. */
export function traitNamed(g: GameState, assetId: string, s: { id: string; years: number }): boolean {
  if (typeof s !== 'object' || s === null) return false
  if (finite(s.years) && s.years >= 1) return true
  const key = staffKey(assetId, s.id)
  const row = key === null ? undefined : readKnow(g)?.k[key]
  return row !== undefined && row.src.split('+').includes('diligence')
}

/**
 * A hire as the player knows them: the skill at the middle of the read (50 when nothing can be read) and a steady trait until the trait
 * is named. The contribution sentence of the sheet is worked out on a team of these, so it follows the player's read and not the truth.
 */
export function shownLeader<T extends StaffRef & { trait: string }>(g: GameState, assetId: string, s: T): T {
  const e = staffSkillRead(g, assetId, s)
  const skill = e === null ? MIDDLING : Math.round(Math.min(100, Math.max(0, e.mid)))
  return { ...s, skill, trait: traitNamed(g, assetId, s) ? s.trait : NEUTRAL_TRAIT }
}

/**
 * The read you had of the candidate you hired, kept for the sheet: learned into the key of the new hire, source `diligence` after a
 * background check and `interview` otherwise. Nothing when staffFog() is off or the key is refused; Knowledge refuses a reading that is
 * not a number, and keeps at most 120 rows. One row a carried hire.
 */
export function carryRead(g: GameState, assetId: string, staffId: string, r: HiredRead): void {
  if (!staffFog() || typeof r !== 'object' || r === null) return
  const key = staffKey(assetId, staffId)
  if (key === null) return
  learn(g, key, { mid: r.mid, sd: r.sd, src: r.checked === true ? 'diligence' : 'interview' })
}

/**
 * The estimate behind leaderRead: the read of `skill` on a `cand` or `stf` skill key at `exposure` 0 to 1. Null when staffFog() is off,
 * when the key is refused or belongs to another family, when the skill is not a number, and when the answer would be the truth.
 */
export function leaderEstimate(g: GameState, key: string, skill: number, exposure: number): Estimate | null {
  if (!staffFog()) return null
  const p = parseKey(key)
  if (p === null || p.field !== 'skill' || (p.kind !== 'cand' && p.kind !== 'stf') || !finite(skill)) return null
  const e = know(g, key, Math.min(100, Math.max(0, skill)), { exp: finite(exposure) ? Math.min(1, Math.max(0, exposure)) : 0 })
  return e.exact ? null : e
}

/**
 * The skill of a candidate or a leader as a screen prints it, with its confidence (R4-U7 calls this for the CEO shortlist).
 * `key` is a `cand` or `stf` skill key and `exposure` 0 to 1. Exact and a flag-off life print today's `N/100`; otherwise a range, or
 * "not clear yet" for a key the contract refuses, another family, or a skill that is not a number. Never the truth.
 */
export function leaderRead(g: GameState, key: string, skill: number, exposure: number): LeaderText {
  if (!staffFog()) return { text: `${skill}/100` }
  const e = leaderEstimate(g, key, skill, exposure)
  return e === null ? { text: NOT_CLEAR, conf: 0 } : { text: skillText(e, skill), conf: e.conf }
}

/** A range worked through a function of the skill, printed the way skillText prints it ("not clear yet" when there is no read). */
export function mappedText(e: Estimate | null, f: (skill: number) => number): string {
  if (e === null) return NOT_CLEAR
  const lo = f(e.lo)
  const hi = f(e.hi)
  const mid = f(e.mid)
  return [lo, hi, mid].every(finite) ? skillText({ ...e, lo, hi }, mid) : NOT_CLEAR
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The hired CEO (R4-U7)

/** The id a CEO has inside a company's `stf` keys: `stf:<company>:ceo:skill`. */
export const CEO_ID = 'ceo'

/** A hired CEO as the leaf needs them (the Manager of business/state.ts fits). */
export interface CeoRef {
  skill: number
  since: number
}

/** The row of a CEO, unless it was learned before they began (it is about the one before, and learn would blend the two). */
function ceoRow(g: GameState, key: string, m: CeoRef): StoredRow | null {
  const stored = readKnow(g)?.k[key]
  return stored !== undefined && (!finite(m.since) || stored.y >= m.since) ? stored : null
}

/**
 * What the player may read of a hired CEO's skill: the estimate on `stf:<id>:ceo:skill` at the exposure of their years in the chair
 * (`g.year - since`), or the carried read while that one is sharper. `ownerId` is the company, or the group for a group's CEO. Null
 * when staffFog() is off (the caller prints today's text), when the key is refused or the skill is not a number. Never the truth.
 */
export function ceoSkillRead(g: GameState, ownerId: string, m: CeoRef): Estimate | null {
  if (!staffFog() || typeof m !== 'object' || m === null) return null
  const key = staffKey(ownerId, CEO_ID)
  if (key === null || !finite(m.skill)) return null
  const e = estimate(g, key, Math.min(100, Math.max(0, m.skill)), { exp: staffExposure(g.year - m.since), row: ceoRow(g, key, m) })
  return e.exact ? null : e
}

/** A CEO's skill as a screen prints it: today's `N/100` without staffFog(), else a range with its chip, or "not clear yet". */
export function ceoRead(g: GameState, ownerId: string, m: CeoRef): LeaderText {
  if (!staffFog()) return { text: `${m.skill}/100` }
  const e = ceoSkillRead(g, ownerId, m)
  return e === null ? { text: NOT_CLEAR, conf: 0 } : { text: skillText(e, m.skill), conf: e.conf }
}

/** The word of the yearly letter, by the middle of the player's read against the same 90 and 95 as before (50 when nothing can be read). */
export function ceoWord(g: GameState, ownerId: string, m: CeoRef): 'competent' | 'elite' | 'world-class' {
  const e = ceoSkillRead(g, ownerId, m)
  const mid = e === null ? MIDDLING : Math.round(Math.min(100, Math.max(0, e.mid)))
  return mid >= 95 ? 'world-class' : mid >= 90 ? 'elite' : 'competent'
}

/**
 * A new CEO sits down: the row of the one before is forgotten (a stored read is merged with the next one, and it is not about this
 * person), and the read you had of the candidate you hired is kept. Nothing without staffFog().
 */
export function startCeoRead(g: GameState, ownerId: string, carried: HiredRead | null): void {
  if (!staffFog()) return
  const key = staffKey(ownerId, CEO_ID)
  if (key === null) return
  forget(g, key)
  if (carried !== null) carryRead(g, ownerId, CEO_ID, carried)
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The owner of the stf keys

/** The raw record of a company or of a person in it. The leaf reads Asset.details as JSON, because it imports nothing from business/. */
function detailsOf(g: GameState, assetId: string): Record<string, unknown> | null | undefined {
  const assets: unknown = g.assets
  if (!Array.isArray(assets)) return undefined
  const asset: unknown = assets.find((x: unknown) => isObj(x) && x.id === assetId)
  if (asset === undefined) return null
  return isObj(asset) && isObj(asset.details) ? asset.details : undefined
}

/** The name of the hire a key is about, or null. */
function nameOf(g: GameState, key: string): string | null {
  const p = parseKey(key)
  if (p === null || p.kind !== 'stf' || p.ids.length !== 2) return null
  const d = detailsOf(g, p.ids[0]!)
  if (!d) return null
  const who: unknown = p.ids[1] === 'ceo' ? d.manager : Array.isArray(d.staff) ? d.staff.find((x: unknown) => isObj(x) && x.id === p.ids[1]) : undefined
  if (!isObj(who)) return null
  const name = [who.firstName, who.lastName].filter((x): x is string => typeof x === 'string' && x.trim() !== '').join(' ')
  return name === '' ? null : name
}

registerKeyKind({
  kind: 'stf',
  label: (g, key) => `${nameOf(g, key) ?? 'A hire'}'s skill`.slice(0, 60),
  // Nothing is for sale: a hire is read by the interview and the check, which are the shortlist's, and by the years.
  truth: () => null,
  // True when the hire is not on the payroll any more (or the company is gone, or nobody but you runs it for the key `ceo`). A company
  // record that cannot be read forgets nothing.
  gone: (g, key) => {
    const p = parseKey(key)
    if (p === null || p.kind !== 'stf' || p.ids.length !== 2) return false
    const d = detailsOf(g, p.ids[0]!)
    if (d === null) return true
    if (d === undefined) return false
    if (p.ids[1] === 'ceo') {
      if (!isObj(d.manager)) return true
      // A row learned before this CEO began is about the one before: nothing reads it (ceoSkillRead) and the next step forgets it.
      const row = readKnow(g)?.k[key]
      return row !== undefined && finite(d.manager.since) && row.y < d.manager.since
    }
    if (!Array.isArray(d.staff)) return false
    return !d.staff.some((x: unknown) => isObj(x) && x.id === p.ids[1])
  },
})
