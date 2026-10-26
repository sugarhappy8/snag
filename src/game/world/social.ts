// The social stamp (R4-E6b, X6): the one switch that makes a life play the social track. It is a small shard of the world,
// g.world.social = { v: 1, on: 1, y, fy } with two optional fields the acts write and this file sanitizes:
//
//   v, on   the version of the shard and the stamp itself: `on` is 1, and a shard where it is anything else is no stamp at all
//   y       the year the yearly edge step last ran (R4-E7 writes it, through patchSocial). The step is idempotent by it
//   fy      the first year: the year the life was stamped. Never changed after the stamp is written
//   ay      the year society.acts last ran (R4-E10a); the acts are idempotent by it
//   ms      the mentor baseline (R4-E11): at most 3 [person ref, skill] pairs, the skill the protege had when the pair was written
//
//   stampSocial(g)     the one writer of the stamp. createNewLife calls it when the build key `social` is on (R4-E7); nothing else does.
//                      Idempotent: a life that has the stamp keeps its very shard. It writes nothing for a year that is not a year
//   socialOn(g)        true when the stamp is there and valid. Pure and total on any world, however hostile
//   readSocial(g)      the stored shard through its reader, or null when the life is not stamped. Pure, total, never creates the world
//   patchSocial(g, p)  the one writer of y, ay and ms: it replaces the shard root, keeps a value that did not change by identity, and
//                      writes nothing for an unchanged patch. It cannot make the stamp (a life that is not stamped stays so) and it
//                      cannot change v, on or fy. A year that is not a year refuses the whole patch
//   normalizeSocial    the shard's own reader: TOTAL, a valid shard comes back as itself
//   socialProblems     every way a stored shard is wrong, one line each, for the world invariant
//
// Every v5.2.0 save, every unstamped life and every heir of one has no `social` key and keeps v5.2.0 behaviour byte for byte (X6).
// The key `social` of flags.ts decides only whether a NEW life is stamped, and the stamp is read from the save, never from the flag.
//
// The reader is strict about the stamp and forgiving about the rest. A shard that is not a plain object, or whose `v` or `on` is not
// 1, is no shard (the world drops it and the life is not stamped); a hostile world can turn nothing on by accident. A stamp whose
// years are damaged is repaired when one of `y` and `fy` is good (the good one stands for both) and dropped when neither is. `ay` is
// kept only as a whole year; `ms` keeps the first three valid pairs (a repeated person counts once, a skill is cut to 0 to 100) and is
// left out when none is valid. Fields are read off the object itself, never off its prototype, and unknown keys go.
//
// The writer replaces the shard root, never edits it, because the Save track shares each shard root between drafts, frozen
// (save-clone.ts); what it stores is frozen too, so a stray in-place write is a TypeError at the line that wrote it. The shard is a
// derived row of the `world` chunk (about 5 nodes, 15 with a full mentor baseline); it changes once a year, with the world.
//
// Layer 2: it imports the ref grammar, the world rows and the world root. It draws no number and reads no clock.
import type { EntityRef } from '../kernel/ids'
import type { GameState } from '../types'
import { SEEN_MAX, SEEN_MIN, isPlain, refOfKind } from './rows'
import { ensureWorld, registerShard, worldShard } from './state'

/** Most mentor pairs the shard keeps. */
export const SOCIAL_MS_MAX = 3

/** One protege of the mentor baseline: the person's ref and the skill they had (0 to 100) when it was written. */
export type MentorPair = readonly [ref: EntityRef, skill: number]

export interface SocialShard {
  v: 1
  on: 1
  y: number
  fy: number
  ay?: number
  ms?: readonly MentorPair[]
}

/** What patchSocial writes: the three fields the acts own. `ms: null` (or an empty list) clears the baseline. */
export interface SocialPatch {
  y?: number
  ay?: number
  ms?: readonly MentorPair[] | null
}

/** A hostile list is read from its first entries only: a valid list is three long. */
const SCAN_MAX = 64
const SKILL_MAX = 100
/** Most problems socialProblems lists. */
const PROBLEMS_MAX = 20
const FIELDS: ReadonlySet<string> = new Set(['v', 'on', 'y', 'fy', 'ay', 'ms'])

const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k)
/** An own property of a plain object, else undefined: nothing is read off the prototype chain. */
const own = (o: Record<string, unknown>, k: string): unknown => (hasOwn(o, k) ? o[k] : undefined)
const isYear = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= SEEN_MIN && x <= SEEN_MAX
const isSkill = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const show = (x: unknown): string => {
  try {
    const t = typeof x === 'string' ? JSON.stringify(x.length > 40 ? `${x.slice(0, 40)}...` : x) : String(x)
    return t.slice(0, 60)
  } catch {
    return '?'
  }
}

/** The pair, clean: the pair itself when it already is one, a copy when its skill had to be cut, null when it is no pair. */
function cleanPair(raw: unknown): MentorPair | null {
  if (!Array.isArray(raw) || raw.length !== 2) return null
  const ref = refOfKind(raw[0], 'person')
  if (ref === null || !isSkill(raw[1])) return null
  const skill = Math.min(SKILL_MAX, Math.max(0, raw[1]))
  return skill === raw[1] ? (raw as unknown as MentorPair) : [ref, skill]
}

/** The mentor baseline of a raw list: the first valid pairs, at most 3, each person once. The same array when it already is that; undefined when nothing is left. */
function cleanMs(raw: unknown): readonly MentorPair[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: MentorPair[] = []
  const seen = new Set<string>()
  for (let i = 0; i < raw.length && i < SCAN_MAX && out.length < SOCIAL_MS_MAX; i++) {
    const pair = cleanPair(raw[i])
    if (pair === null || seen.has(pair[0])) continue
    seen.add(pair[0])
    out.push(pair)
  }
  if (out.length === 0) return undefined
  return out.length === raw.length && out.every((p, i) => p === raw[i]) ? (raw as readonly MentorPair[]) : out
}

/**
 * Makes any value into a valid social shard, or undefined when it is not one. TOTAL: it never throws. A valid shard comes back as
 * itself, so a read costs one pass and no allocation. It does not change its input.
 */
export function normalizeSocial(raw: unknown): SocialShard | undefined {
  try {
    if (!isPlain(raw) || own(raw, 'v') !== 1 || own(raw, 'on') !== 1) return undefined
    const y0 = own(raw, 'y')
    const f0 = own(raw, 'fy')
    const fy = isYear(f0) ? f0 : isYear(y0) ? y0 : null
    if (fy === null) return undefined
    const y = isYear(y0) ? y0 : fy
    const out: SocialShard = { v: 1, on: 1, y, fy }
    const ay = own(raw, 'ay')
    if (isYear(ay)) out.ay = ay
    const ms = cleanMs(own(raw, 'ms'))
    if (ms !== undefined) out.ms = ms
    // the same object when nothing changed: every value is the one that was read, and no key was added or dropped
    const keys = Object.keys(out) as (keyof SocialShard)[]
    if (Object.keys(raw).length !== keys.length) return out
    for (const k of keys) if (own(raw, k) !== out[k]) return out
    return raw as unknown as SocialShard
  } catch {
    return undefined
  }
}

registerShard('social', { normalize: (raw) => normalizeSocial(raw) })

/** Every fault of a stored `social` value, one line each (at most 20). Empty exactly when normalizeSocial gives it back as itself. Pure and total. */
export function socialProblems(raw: unknown): string[] {
  if (raw === undefined) return []
  const out: string[] = []
  const add = (text: string): void => {
    if (out.length < PROBLEMS_MAX) out.push(text)
  }
  try {
    if (!isPlain(raw)) return ['not a plain object']
    if (own(raw, 'v') !== 1) add('v must be 1')
    if (own(raw, 'on') !== 1) add('on must be 1')
    for (const f of ['y', 'fy'] as const) if (!isYear(own(raw, f))) add(`${f} must be a whole year from ${SEEN_MIN} to ${SEEN_MAX}`)
    if (hasOwn(raw, 'ay') && !isYear(raw.ay)) add(`ay must be a whole year from ${SEEN_MIN} to ${SEEN_MAX}`)
    for (const f of Object.keys(raw)) if (!FIELDS.has(f)) add(`unknown field ${show(f)}`)
    if (hasOwn(raw, 'ms')) {
      const ms = raw.ms
      if (!Array.isArray(ms)) add('ms must be a list of [person ref, skill] pairs')
      else if (ms.length === 0) add('ms is empty (leave it out)')
      else {
        if (ms.length > SOCIAL_MS_MAX) add(`ms has ${ms.length} pairs (cap ${SOCIAL_MS_MAX})`)
        const seen = new Set<unknown>()
        let twice = false
        for (let i = 0; i < ms.length && i < SCAN_MAX; i++) {
          const p: unknown = ms[i]
          const ok = Array.isArray(p) && p.length === 2 && refOfKind(p[0], 'person') !== null && isSkill(p[1]) && p[1] >= 0 && p[1] <= SKILL_MAX
          if (!ok) add(`ms holds a bad pair ${show(p)}`)
          else {
            if (seen.has(p[0])) twice = true
            seen.add(p[0])
          }
        }
        if (twice) add('ms names a ref twice')
      }
    }
  } catch {
    add('social could not be read')
  }
  return out
}

/** The stored shard through its reader, or null when the life is not stamped. Pure: it never creates g.world and never writes. */
export function readSocial(g: Pick<GameState, 'world'>): Readonly<SocialShard> | null {
  return worldShard<SocialShard>(g, 'social') ?? null
}

/** True when the life is stamped: the shard is there and valid. Pure and total on any world. */
export function socialOn(g: Pick<GameState, 'world'>): boolean {
  return readSocial(g) !== null
}

/** Freezes a shard and the lists it holds: what the world stores is sealed, so a stray in-place write is a TypeError. */
function seal(shard: SocialShard): SocialShard {
  if (shard.ms !== undefined) {
    for (const pair of shard.ms) if (!Object.isFrozen(pair)) Object.freeze(pair)
    if (!Object.isFrozen(shard.ms)) Object.freeze(shard.ms)
  }
  return Object.freeze(shard)
}

/**
 * Stamps the life: writes { v: 1, on: 1, y, fy } for this year, once. A life that is stamped keeps its very shard, so a second call, in
 * the same year or a later one, changes nothing. A shard that is hostile (no stamp) is replaced. Nothing is written for a year that is
 * not a whole year from 1900 to 100000.
 */
export function stampSocial(g: GameState): void {
  if (readSocial(g) !== null) return
  const year = g.year
  if (!isYear(year)) return
  ensureWorld(g).social = seal({ v: 1, on: 1, y: year, fy: year })
}

const sameMs = (a: readonly MentorPair[] | undefined, b: readonly MentorPair[] | undefined): boolean => {
  if (a === b) return true
  if (a === undefined || b === undefined || a.length !== b.length) return false
  return a.every((p, i) => p[0] === b[i]![0] && p[1] === b[i]![1])
}

/**
 * The one writer of `y`, `ay` and `ms`. Returns true when it replaced the shard root, false when it wrote nothing: the life is not
 * stamped (this never makes the stamp), the patch is not an object, a year in it is not a whole year (the whole patch is refused), or
 * nothing changed. A field the patch leaves out (or sets to undefined) keeps its value. `ms` is read the way the reader reads it (three
 * pairs at most, bad pairs go), and `null` or a list with nothing valid clears it. A value that did not change keeps its identity.
 */
export function patchSocial(g: GameState, patch: SocialPatch): boolean {
  if (!isPlain(patch)) return false
  const cur = readSocial(g)
  if (cur === null) return false
  let y = cur.y
  let ay = cur.ay
  let ms = cur.ms
  if (hasOwn(patch, 'y') && patch.y !== undefined) {
    if (!isYear(patch.y)) return false
    y = patch.y
  }
  if (hasOwn(patch, 'ay') && patch.ay !== undefined) {
    if (!isYear(patch.ay)) return false
    ay = patch.ay
  }
  if (hasOwn(patch, 'ms') && patch.ms !== undefined) {
    const next = patch.ms === null ? undefined : cleanMs(patch.ms)
    ms = sameMs(next, cur.ms) ? cur.ms : next
  }
  if (y === cur.y && ay === cur.ay && ms === cur.ms) return false
  const next: SocialShard = { v: 1, on: 1, y, fy: cur.fy }
  if (ay !== undefined) next.ay = ay
  if (ms !== undefined) next.ms = ms
  ensureWorld(g).social = seal(next)
  return true
}
