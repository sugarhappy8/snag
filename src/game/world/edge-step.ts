// The yearly step of the edges (R4-E7, D.3, X22, X42, C14): the module `world.edges`, the `close` phase of the aging seam at order 5, which
// owns the slice `world.edges`. It runs before milestones (close 10), so every relationship change the year made (the drift of the life
// phase, the allowances and loans of the money phase, the will's feuds) is already on the edge when it fades.
//
// Once a year, on a life the social stamp marks, and nothing at all on any other life:
//   1. resentment fades: s x 0.9, rounded down to hundredths, so it reaches 0 and a stored number stays short;
//   2. memories lose weight: every memory loses one point of weight every `decay` years of its MEMORY_FX row (4 for most kinds, 2 for a
//      petty one), counted from the year it was made; at 0 it goes. The pinned five (decay 0) never lose any. A gap of years is counted
//      exactly: the decays that fall in the years since the last step are all paid;
//   3. the legacy records are followed for every person of the game (syncLegacy, below);
//   4. orphan edges are removed: the person is gone from the game, the edge is not bound (isBound of world/edge-bound.ts: a link kind, a
//      feud, an unpaid debt or a pinned memory on the edge, or a held person at one of its ends), has no debt at all (a debt that was
//      paid is still a record), was last touched five years ago or more, and its salience (f + s + |o|) is under 40.
// Resentment fades before the legacy sync raises it, so a will that is still angry holds s at its anger year after year.
//
// Why it is safe:
//   - idempotent by a year stamp: the social shard remembers the last year the step ran (social.y, written with patchSocial, the one
//     writer). A second call in the year, a replay of the year, a clone, a reload and a Time Machine jump all see the same stamp and the
//     same edges. A stamp from the future (a hostile save) is stepped once and put right, as the frontier does;
//   - nothing to do, nothing written: an unstamped life returns first. A calm map is left as it is, the very object, and so is a map
//     with nothing to fade;
//   - it draws nothing from g.rng, makes no id, books no dollar and logs nothing: the player sees the edges through the screens that read
//     them, not through a line;
//   - bounded: every write is putEdge's, so the caps hold and a field is cut to its range; the fade only lowers resentment, the decay only
//     lowers a weight, the orphan rule only removes. The sync raises obligation to at most 100 and writes a debt of at most 1e12.
//
// syncLegacy(g, p) follows the two legacy records of one person into the edge `person > player` (R4-E7, X22). The records stay the
// authority; this is the mirror's second half, called after updateTies and updateWl write (so a loan or an anger is on the edge at once)
// and by the step for everyone:
//   - the debt: while the ego's record says the person owes (data.w.owes above 0) the edge carries a kind-0 debt [owed, 0, since, 0, 0]
//     (no interest, nothing paid; the legacy record keeps its own books) and obligation is at least min(100, 20 + 10 x years owed), which
//     only ever raises it. When they owe nothing a kind-0 debt is removed and obligation is left to the acts. A debt of another kind (a
//     divorce debt, kind 1) is never touched, and never overwritten by a loan;
//   - the anger: s is at least the anger of the ego's will record, never lowered. A record stamped by another owner syncs nothing.
// The numbers 20 and 10 are the planner's; the tests prove the range. An edge is made only when there is something to write.
//
// Layer 2: it imports the kernel's registry type and person key, the edge model, writer, bound predicate and legacy readers, the stamp and
// the world root.
import { personEntity } from '../kernel/person-ref'
import type { ModuleDef } from '../kernel/registry'
import type { GameState, Person } from '../types'
import { boundTest } from './edge-bound'
import { legacyTies, legacyWl } from './edge-legacy'
import './edge-mirror'
import { MEMORY_FX, formatMemory, parseMemory } from './edge-memory'
import { putEdge } from './edge-write'
import { edgeKey, isSecretKey, readEdge, type Edge, type EdgeMap } from './edges'
import { playerRef } from './people'
import { SEEN_MAX, SEEN_MIN } from './rows'
import { patchSocial, readSocial, socialOn } from './social'
import { worldShard } from './state'

/** Resentment keeps this much of itself each year (hundredths, rounded down). */
const FADE_PCT = 90
/** An orphan edge is this many years old, or more, before it goes, and light below this salience. */
const ORPHAN_YEARS = 5
const ORPHAN_SALIENCE = 40
/** The obligation a debt holds: at least BASE + PER_YEAR x years owed, at most 100 (the planner's numbers). */
const OWE_BASE = 20
const OWE_PER_YEAR = 10
/** The most a debt can hold: the edge model's own bound (world/edges.ts), so the debt is never dropped for being large. */
const DEBT_MAX = 1e12

const isYear = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= SEEN_MIN && x <= SEEN_MAX

// ---------------------------------------------------------------------------------------------------------------------------------
// The legacy sync
// ---------------------------------------------------------------------------------------------------------------------------------

/** The year a debt began, as the edge stores it: the record's year when it is a whole year, never after this year; this year when it is not. */
function debtYear(since: number, year: number): number {
  const s = Math.round(since)
  return isYear(s) ? Math.min(s, year) : year
}

const sameDebt = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((x, i) => x === b[i])

/**
 * Follows the ego's legacy records of one person into the edge person > player (see the header). A no-op for a life that is not
 * stamped, a pet, a person with no ref, and for a person whose records say nothing to follow (no edge is made for them).
 */
export function syncLegacy(g: GameState, p: Person): void {
  if (!socialOn(g) || p.relation === 'pet') return
  const from = personEntity(p)
  if (from === 'pool:other') return
  const to = playerRef(g)
  const key = edgeKey(from, to)
  if (key === null) return
  const year = g.year
  if (!isYear(year)) return
  const ego = g.character.id
  const ties = legacyTies(p, ego)
  const wl = legacyWl(p, ego)
  const old = readEdge(g, from, to)
  const patch: Partial<Edge> = {}

  if (ties.owes > 0) {
    // a debt of another kind keeps the slot: the loan is not mirrored over it
    if (old === null || old.dv === undefined || old.dv[3] === 0) {
      const since = debtYear(ties.since, year)
      const dv = [Math.min(ties.owes, DEBT_MAX), 0, since, 0, 0]
      if (old === null || old.dv === undefined || !sameDebt(old.dv, dv)) patch.dv = dv as Edge['dv']
      const floor = Math.min(100, OWE_BASE + OWE_PER_YEAR * Math.max(0, year - since))
      if ((old?.o ?? 0) < floor) patch.o = floor
    }
  } else if (old !== null && old.dv !== undefined && old.dv[3] === 0) {
    patch.dv = undefined
  }
  if (wl.anger > (old?.s ?? 0)) patch.s = wl.anger
  if (Object.keys(patch).length === 0) return

  if (old === null) {
    const rel = p.relationship
    putEdge(g, key, { t: 50, f: Number.isFinite(rel) ? Math.max(0, Math.min(100, rel)) : 50, r: 50, s: 0, o: 0, y: year, l: year, ...patch })
  } else {
    putEdge(g, key, patch)
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The step
// ---------------------------------------------------------------------------------------------------------------------------------

/**
 * The memories of an edge after the years from `prev` (the last step) to `year`: each loses the weight its decay row says it earned in
 * those years. The list itself when nothing changed; undefined when none is left.
 */
function decayed(m: readonly string[], prev: number, year: number): readonly string[] | undefined {
  let changed = false
  const out: string[] = []
  for (const text of m) {
    const mem = parseMemory(text)
    const decay = mem === null ? 0 : MEMORY_FX[mem.kind].decay
    if (mem === null || decay === 0 || year <= mem.year) {
      out.push(text)
      continue
    }
    const drops = Math.floor((year - mem.year) / decay) - Math.floor((Math.max(prev, mem.year) - mem.year) / decay)
    if (drops <= 0) {
      out.push(text)
      continue
    }
    changed = true
    if (mem.w - drops > 0) out.push(formatMemory({ ...mem, w: mem.w - drops }))
  }
  if (!changed) return m
  return out.length > 0 ? out : undefined
}

/** The ends of an edge key that are people, in order. The key is a valid edge key (the map holds nothing else). */
function personEnds(key: string): string[] {
  const at = key.indexOf('>')
  return [key.slice(0, at), key.slice(at + 1)].filter((end) => end.startsWith('person:'))
}

/**
 * The yearly step of the edges. Idempotent by social.y; a no-op for a life that is not stamped. See the header for what it does.
 */
export function stepEdges(g: GameState): void {
  const stamp = readSocial(g)
  if (stamp === null) return
  const year = g.year
  if (!isYear(year) || stamp.y === year) return
  // the years since the last step; a stamp from the future counts as one year back, so it is stepped once
  const prev = Math.min(stamp.y, year - 1)
  const ego = playerRef(g)
  const here = new Set<string>()
  for (const p of g.people) here.add(personEntity(p))

  const map: EdgeMap = worldShard<EdgeMap>(g, 'edges') ?? {}
  const bound = boundTest(g, map)
  const edits: [string, Partial<Edge> | null][] = []
  for (const key of Object.keys(map)) {
    if (isSecretKey(key)) continue
    const e = map[key]!
    const s = e.s > 0 ? Math.floor(e.s * FADE_PCT) / 100 : 0
    // an orphan: a person end that is not the ego and is not in the game, with nothing binding the edge (the held people are read only
    // when every other condition holds, so a calm map costs no look at the people)
    if (
      year - e.l >= ORPHAN_YEARS &&
      e.dv === undefined &&
      e.f + s + Math.abs(e.o) < ORPHAN_SALIENCE &&
      personEnds(key).some((end) => end !== ego && !here.has(end)) &&
      !bound(key)
    ) {
      edits.push([key, null])
      continue
    }
    const patch: Partial<Edge> = {}
    if (s !== e.s) patch.s = s
    if (e.m !== undefined) {
      const m = decayed(e.m, prev, year)
      if (m !== e.m) patch.m = m === undefined ? undefined : [...m]
    }
    if (Object.keys(patch).length > 0) edits.push([key, patch])
  }
  for (const [key, patch] of edits) putEdge(g, key, patch)

  for (const p of g.people) syncLegacy(g, p)
  patchSocial(g, { y: year })
}

/** The module: the edge step in the close phase of the aging seam, order 5, before milestones (10). One entry, so the entry id is the module id the group tables use (X42). */
export const edgesModule: ModuleDef = {
  id: 'world.edges',
  layer: 2,
  slices: ['world.edges'],
  yearly: [{ seam: 'aging', phase: 'close', order: 5, run: stepEdges }],
}
