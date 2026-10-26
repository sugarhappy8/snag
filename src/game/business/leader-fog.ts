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
//
// The leaf also registers the owner of the `stf` kind: a label and `gone` (true when the hire left, or the company is gone, so the yearly
// knowledge step forgets the row). It has no truth to sell and no scope, so no source reads it and nothing is for sale: the interview is
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
import { isExact, know, learn, parseKey, readKnow, registerKeyKind, type Estimate } from '../knowledge/contract'
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
 * The skill of a candidate or a leader as a screen prints it, with its confidence (R4-U7 calls this for the CEO shortlist and rows).
 * `key` is a `cand` or `stf` skill key and `exposure` 0 to 1. Exact and a flag-off life print today's `N/100`; otherwise a range, or
 * "not clear yet" for a key the contract refuses, another family, or a skill that is not a number. Never the truth.
 */
export function leaderRead(g: GameState, key: string, skill: number, exposure: number): LeaderText {
  if (!staffFog()) return { text: `${skill}/100` }
  const p = parseKey(key)
  if (p === null || p.field !== 'skill' || (p.kind !== 'cand' && p.kind !== 'stf') || !finite(skill)) return { text: NOT_CLEAR, conf: 0 }
  const e = know(g, key, Math.min(100, Math.max(0, skill)), { exp: finite(exposure) ? Math.min(1, Math.max(0, exposure)) : 0 })
  return e.exact ? { text: NOT_CLEAR, conf: 0 } : { text: skillText(e, skill), conf: e.conf }
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
    if (p.ids[1] === 'ceo') return !isObj(d.manager)
    if (!Array.isArray(d.staff)) return false
    return !d.staff.some((x: unknown) => isObj(x) && x.id === p.ids[1])
  },
})
