// Staff loyalty (R4-E13, D.4, X1, X22): what the people who run a company feel about the player, and the year-end rule that lets
// them go. A key person (KeyStaff) and a hired CEO (Manager) are not people of the game: nothing in `g.people` stands for them, so their
// edges name them by a ref of their own, `staff:<ks id>` and `mgr:<asset id>` (a Manager has no id; the company is what it follows), and
// every edge is `ref > player`, like the edge of a relative.
//
//   staffRef(s), mgrRef(a)   the refs. Total: an id that is no name (a hostile save) gives pool:other, which no writer here uses
//   staffLoyaltyYear(g, a, b)   the year-end rule of one company. staffTurnover (business/staff.ts) calls it on a stamped life and
//                            keeps the old rule (morale under 30, a 35% roll from g.rng) on any other
//   quitOdds, poachOdds      the two odds, pure
//   staffHired, staffRaised, staffYelled, staffGone, managerPoached   the five writers staff.ts and board.ts call; each is a no-op
//                            on a life that is not stamped
//
// The year-end rule, once a year per company, stamped lives only:
//   1. the manager edge is reset when the manager is not the one it was written for (the company has no hired CEO now, or the CEO
//      started after the edge did);
//   2. a staff edge bound to the company whose person is in no company any more is dropped (a person let go by one of the events, a
//      CEO promoted out of the staff, a company sold): the edge drops with the staff member;
//   3. each key person gets two numbers from the stream `social`, outcomeStream(g, 'social', year, 'staff|<id>'): the first decides
//      a quit, with odds clamp(0.04 + (35 - morale)/150 + s/500 - (f - 50)/600, 0, 0.6) where s and f are the resentment and the
//      affection of the edge (0 and 50 when there is none); the second decides a poaching, for a person of skill 70 or more who is
//      resentful (s of 40 or more) or paid under the going rate (the company's pay policy under 100%), with odds
//      0.03 + 0.10 x s/100 x (1 - honesty), the honesty of the person's trait (world/axes.ts, the staff axes).
//   A person who quits leaves the old line ("<name>, our <role>, quit <company>.") and their edge goes. A person who is poached leaves
//   a line from a pool of four, and their edge stays as a plain edge (the link is cut) holding poached_me, the one memory of a person
//   who went to a rival; it is evicted by salience like any edge.
//
// What the player does, written by the callers: a hire leaves hired_me (weight 2), a raise gift_given (2 for one person, 1 for all),
// a yell told_bluntly (3, the slight with resentment), and a firing, a walk-out or a lawsuit drops the edge. A hired CEO who is
// poached leaves poached_me (3) on mgr:<asset id>, dated from the day that CEO started, and the first year step after a new CEO has
// started removes it.
//
// Why it is safe:
//   - a life that is not stamped: every function returns first, writes nothing and draws nothing;
//   - luck is the named stream, never g.rng, and a Time Machine jump re-rolls only the year it lands in (outcomeStream). The rule is
//     idempotent without a stamp of its own: its two numbers are a function of the year and the person, a person who quit or was
//     poached is gone from the list, and the second run finds the same people staying;
//   - no money: pay and severance stay on the company's books where staff.ts put them (firmCash, 'payroll'); a quit and a poaching
//     cost nothing, as before;
//   - bounded: an edge goes through putEdge, so the caps hold (a staff edge is bound while the person works there; a hire into a map
//     full of bound edges simply has no edge, and the rule reads that person as resentment 0 and affection 50); both odds are
//     clamped, so 100 times any input gives the same ceiling.
//
// A leaf of the business cycle: this file imports no other business module at run time (state.ts is read as types only), so the 59
// modules of that cycle stay 59. It takes the kernel's refs and streams, the log, the text pool, and the files of world/.
import { log } from '../core'
import { parseRef, type EntityRef } from '../kernel/ids'
import { outcomeStream } from '../kernel/streams'
import { pickLine } from '../text/pick'
import { STAFF_POACHED_LINES } from '../text/pools'
import { fillSlots } from '../text/state'
import type { Asset, GameState } from '../types'
import { axesFromStaff } from '../world/axes'
import type { MemoryKind } from '../world/edge-memory'
import { putEdge, remember } from '../world/edge-write'
import { edgeKey, edgesOf, readEdge, type EdgeKey } from '../world/edges'
import { playerRef } from '../world/people'
import { SEEN_MAX, SEEN_MIN } from '../world/rows'
import { socialOn } from '../world/social'
import type { BizState, KeyStaff, Manager } from './state'

/** The ref of nobody: what a ref helper answers for an id that is no name. No writer here makes an edge for it. */
const NOBODY: EntityRef = 'pool:other'

/** Odds of a quit: the base, the ceiling, and the points of a morale under 35 (per point), of resentment (per point) and of affection under 50 (per point). */
const QUIT_BASE = 0.04
const QUIT_MAX = 0.6
const QUIT_MORALE_AT = 35
const QUIT_PER_MORALE = 1 / 150
const QUIT_PER_RESENT = 1 / 500
const QUIT_PER_AFFECT = 1 / 600
/** A person of this skill or more is worth a rival's call; with resentment of this much or more, or under the going rate. */
const POACH_SKILL = 70
const POACH_RESENT = 40
/** Odds of a poaching: the base, and the most resentment can add (times how little honest the person is). */
const POACH_BASE = 0.03
const POACH_SPAN = 0.1
/** What an edge that is not there stands for. */
const NEUTRAL_MORALE = 50
const NEUTRAL_RESENT = 0
const NEUTRAL_AFFECT = 50

const isYear = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= SEEN_MIN && x <= SEEN_MAX
const fin = (x: unknown, otherwise: number): number => (typeof x === 'number' && Number.isFinite(x) ? x : otherwise)
const cut = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x))

/** A ref from a kind and a key, or NOBODY when the key is no name (the ref grammar is the judge). Total. */
function refOf(kind: string, key: unknown): EntityRef {
  if (typeof key !== 'string') return NOBODY
  const r = `${kind}:${key}`
  return parseRef(r) === null ? NOBODY : (r as EntityRef)
}

/** `staff:<id>` for a key person. */
export function staffRef(s: Pick<KeyStaff, 'id'>): EntityRef {
  return refOf('staff', s?.id)
}

/** `mgr:<asset id>` for the hired CEO of a company: the edge follows the company, not the person. */
export function mgrRef(a: Pick<Asset, 'id'>): EntityRef {
  return refOf('mgr', a?.id)
}

/**
 * The odds that a person quits at the year's end: clamp(0.04 + (35 - morale)/150 + s/500 - (f - 50)/600, 0, 0.6). `s` is the resentment
 * and `f` the affection of the edge. A number that is not finite reads as the neutral one. Pure and total, and 0.6 at the most.
 */
export function quitOdds(morale: number, s: number, f: number): number {
  const m = fin(morale, NEUTRAL_MORALE)
  const raw = QUIT_BASE + (QUIT_MORALE_AT - m) * QUIT_PER_MORALE + fin(s, NEUTRAL_RESENT) * QUIT_PER_RESENT - (fin(f, NEUTRAL_AFFECT) - 50) * QUIT_PER_AFFECT
  return cut(raw, 0, QUIT_MAX)
}

/**
 * The odds that a rival poaches a person who can be: 0.03 + 0.10 x s/100 x (1 - honesty/100), with the resentment and the honesty cut to
 * their 0 to 100. So it is between 0.03 and 0.13 whatever the input. Pure and total.
 */
export function poachOdds(s: number, honesty: number): number {
  const resent = cut(fin(s, NEUTRAL_RESENT), 0, 100) / 100
  const honest = cut(fin(honesty, 50), 0, 100) / 100
  return POACH_BASE + POACH_SPAN * resent * (1 - honest)
}

function fullName(s: KeyStaff): string {
  return `${s.firstName} ${s.lastName}`
}

/** The ends of the edge of one key person and the player, or null when the life is not stamped, the person has no ref or the year is no year. */
function ends(g: GameState, s: Pick<KeyStaff, 'id'>): { ref: EntityRef; to: EntityRef; key: EdgeKey } | null {
  if (!socialOn(g) || !isYear(g.year)) return null
  const ref = staffRef(s)
  if (ref === NOBODY) return null
  const to = playerRef(g)
  const key = edgeKey(ref, to)
  return key === null ? null : { ref, to, key }
}

/**
 * The edge of a key person, made when it is not there (trust 50, affection 50, respect 50, no resentment, no obligation) and linked to
 * the company ('staff': bound, while the person works there). An edge that is there keeps its feelings and takes the link when it
 * has none (the edge of a person an heir inherited). Null when the map has no room for it.
 */
function staffEdge(g: GameState, s: KeyStaff): EntityRef | null {
  const e = ends(g, s)
  if (e === null) return null
  const old = readEdge(g, e.ref, e.to)
  const year = g.year
  if (old === null) return putEdge(g, e.key, { t: 50, f: 50, r: 50, s: 0, o: 0, y: year, l: year, k: 'staff' }) ? e.ref : null
  if (old.k !== 'staff') return putEdge(g, e.key, { k: 'staff' }) ? e.ref : null
  return e.ref
}

function staffMemory(g: GameState, s: KeyStaff, kind: MemoryKind, w: 1 | 2 | 3): void {
  const ref = staffEdge(g, s)
  if (ref !== null) remember(g, ref, kind, { w, by: 'ego' })
}

/** The player hired this person (business/staff.ts, the hire script): hired_me, weight 2. */
export function staffHired(g: GameState, s: KeyStaff): void {
  staffMemory(g, s, 'hired_me', 2)
}

/** The player gave this person a raise (weight 2) or a raise to everyone (weight 1): gift_given. */
export function staffRaised(g: GameState, s: KeyStaff, w: 1 | 2 = 2): void {
  staffMemory(g, s, 'gift_given', w)
}

/** The player yelled at this person: told_bluntly, weight 3 (a trust that drops and resentment that grows). */
export function staffYelled(g: GameState, s: KeyStaff): void {
  staffMemory(g, s, 'told_bluntly', 3)
}

/** This person is gone (fired, walked out, sued): the edge goes with them. Writes nothing when there is no edge. */
export function staffGone(g: GameState, s: KeyStaff): void {
  const e = ends(g, s)
  if (e !== null && readEdge(g, e.ref, e.to) !== null) putEdge(g, e.key, null)
}

/**
 * A hired CEO is poached (business/board.ts), called while that CEO is still the manager: poached_me, weight 3, on `mgr:<asset id>`. A
 * new edge is dated from the day the CEO started (never after this year), which is how the year step knows the edge is theirs.
 */
export function managerPoached(g: GameState, a: Asset, m: Pick<Manager, 'since'>): void {
  if (!socialOn(g) || !isYear(g.year)) return
  const ref = mgrRef(a)
  if (ref === NOBODY) return
  const to = playerRef(g)
  const key = edgeKey(ref, to)
  if (key === null) return
  if (readEdge(g, ref, to) === null) {
    const since = isYear(m?.since) ? Math.min(m.since, g.year) : g.year
    if (!putEdge(g, key, { t: 50, f: 50, r: 50, s: 0, o: 0, y: since, l: g.year })) return
  }
  remember(g, ref, 'poached_me', { w: 3, by: 'them' })
}

/** The ids of every key person in every company of the game, read off the asset records (no company is normalized or written). */
function livePeople(g: GameState): Set<string> {
  const ids = new Set<string>()
  for (const asset of g.assets) {
    const staff: unknown = (asset?.details as Record<string, unknown> | undefined)?.staff
    if (!Array.isArray(staff)) continue
    for (const k of staff) {
      const id: unknown = k !== null && typeof k === 'object' ? (k as { id?: unknown }).id : undefined
      if (typeof id === 'string') ids.add(id)
    }
  }
  return ids
}

/** Drops the edges linked to a company whose person is in no company any more. */
function dropGone(g: GameState, to: EntityRef): void {
  const tail = `>${to}`
  let live: Set<string> | null = null
  for (const [key, e] of edgesOf(g, to)) {
    if (e.k !== 'staff' || !key.startsWith('staff:') || !key.endsWith(tail)) continue
    live ??= livePeople(g)
    if (!live.has(key.slice('staff:'.length, key.length - tail.length))) putEdge(g, key, null)
  }
}

/** Resets the manager edge of this company when the manager is not the one it was written for. */
function settleManager(g: GameState, a: Asset, b: BizState, to: EntityRef): void {
  const ref = mgrRef(a)
  if (ref === NOBODY) return
  const e = readEdge(g, ref, to)
  if (e === null) return
  const m = b.ceo === 'manager' ? b.manager : null
  const key = edgeKey(ref, to)
  if (key !== null && (!m || !isYear(m.since) || e.y < m.since)) putEdge(g, key, null)
}

/**
 * A key person is lured away by a rival: the person leaves the company, a line says so, and the edge stays as a plain edge with the
 * memory of it (poached_me, weight 2). The link is cut so the edge no longer binds.
 */
function poached(g: GameState, a: Asset, b: BizState, s: KeyStaff, ref: EntityRef, to: EntityRef): void {
  b.staff = b.staff.filter((x) => x.id !== s.id)
  if (ref !== NOBODY) {
    remember(g, ref, 'poached_me', { w: 2, by: 'them' })
    const key = edgeKey(ref, to)
    if (key !== null && readEdge(g, ref, to)?.k !== undefined) putEdge(g, key, { k: undefined })
  }
  log(g, fillSlots(pickLine(g, STAFF_POACHED_LINES), { who: fullName(s), role: String(s.role), company: a.name }), 'bad')
}

/**
 * The year-end rule of one company on a stamped life (see the header). Called by staffTurnover once a year; a no-op on any other life.
 */
export function staffLoyaltyYear(g: GameState, a: Asset, b: BizState): void {
  if (!socialOn(g)) return
  const to = playerRef(g)
  if (parseRef(to) === null) return
  settleManager(g, a, b, to)
  dropGone(g, to)
  const year = g.year
  const underpaid = fin(b.wageLevel, 1) < 1
  for (const s of [...b.staff]) {
    const ref = staffRef(s)
    const e = ref === NOBODY ? null : readEdge(g, ref, to)
    const resent = e === null ? NEUTRAL_RESENT : e.s
    const roll = outcomeStream(g, 'social', year, `staff|${String(s.id)}`)
    const quitRoll = roll()
    const poachRoll = roll()
    if (quitRoll < quitOdds(s.morale, resent, e === null ? NEUTRAL_AFFECT : e.f)) {
      b.staff = b.staff.filter((x) => x.id !== s.id)
      log(g, `${fullName(s)}, our ${s.role}, quit ${a.name}.`, 'bad')
      staffGone(g, s)
      continue
    }
    if (fin(s.skill, 0) >= POACH_SKILL && (resent >= POACH_RESENT || underpaid) && poachRoll < poachOdds(resent, axesFromStaff(s.trait).honesty)) poached(g, a, b, s, ref, to)
  }
}
