// The family quarrels over the will, between NPCs (R4-L10, D.9 b; X31, X40, C12, C39). At the reading of the will, the relatives who were cut
// out and took it hard hold it against the relatives who were favored. Before R4 only the player's edges knew it; on a stamped life (X6) the
// resentment is an edge between the two of them, `cut > favored`, which the yearly step fades and the acts can read.
//
//   strifeEdges(n, plan, heirId)   for each relative the will cut out, other than the heir, with anger 30 or more who did not win or settle a
//                                  contest (plan.cutOut), and each person other than the heir who takes a quarter of the estate or more
//                                  (plan.recipients, set by planEstate): the edge `cut > favored`, resentment `s = max(s, round(anger / 2))`
//                                  always, and a cold feud rung `q = [1, year, 0]` only while fewer than 12 feuds are live (liveFeuds, E6a's
//                                  pure count) and the edge has none. Returns the strongest pair that was written (anger, then ids), or
//                                  null when nothing was written: an unstamped life, a plan with nobody to quarrel, a map that refused.
//   strifeLine(n, quarrel)         the one line the reading says for that pair (KIN_STRIFE), naming both; null when either is gone.
//
// The caps. At most 3 strife edges for one person and 36 in one reading: edge caps (X31), not feud caps. The feud rung shares the 12 of
// EDGE_CAPS.feuds with every other feud (the will ladder's `Wl.cut` pair stays on the will's own record and counts toward the 12 when it
// has a rung), so a reading with 12 feuds live writes `s` and no `q`. An edge that carries only `s` is not bound at the edge alone
// (edgeLocalBound) and may be evicted like any other at the 1,200 edges, by design; one with a live `q` is bound. When the map is full
// of bound edges the write is refused (putEdge) and the pair is simply not written.
//
// Order. The cut-out are taken by anger, then id, the favored by share, then id; the first writes come to the strongest. A plan is read as
// data: a list that is not a list, an entry that is not a plain object, an id that is not a living Person of the game (a pet, the dead,
// the heir), an anger or a share that is not a finite number, a repeated id: each is skipped, never thrown on. Only the first 400
// entries of each list are looked at, so a plan 100 times the size costs the same.
//
// What it does not do. No draw (the order is by number and id), no dollar (an edge holds none), no memory (the will ladder `Wl` and the
// edge's `m` are not touched), nothing at all on a life that is not stamped. The reading's own choice is the heir's, in will-estate.ts.
//
// Domain events (layer 3). It imports the kernel's person key, the text pools and the edge model, writer and stamp (layers 0 to 2); it
// imports no other domain and no society file.
import { personEntity } from '../kernel/person-ref'
import { pickLine } from '../text/pick'
import { KIN_STRIFE } from '../text/pools'
import { fillSlots } from '../text/state'
import type { GameState, Person } from '../types'
import { EDGE_CAPS } from '../world/caps'
import { putEdge } from '../world/edge-write'
import { edgeKey, liveFeuds, readEdge, type Edge } from '../world/edges'
import { isPlain, seenOf } from '../world/rows'
import { socialOn } from '../world/social'
import type { EstatePlan } from './will-estate'

/** The rules of a reading: the anger and share that count, the caps, how much of a list is read, how much of a name is said. */
export const STRIFE = Object.freeze({ anger: 30, share: 0.25, perPerson: 3, total: 36, scan: 400, name: 24 })

/** The strongest pair a reading wrote: Person ids, and the anger of the cut-out one (a whole number, 30 to 100). */
export interface Quarrel {
  a: string
  b: string
  anger: number
}

/** A share of exactly a quarter is a quarter whatever the floating point made of it. */
const SHARE_EPS = 1e-9

const cmp = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0)
const textOf = (x: unknown): string | null => (typeof x === 'string' && x !== '' ? x : null)
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

/** The first STRIFE.scan entries of a list, or none for anything that is not a list. */
function listOf(x: unknown): readonly unknown[] {
  return Array.isArray(x) ? x.slice(0, STRIFE.scan) : []
}

/** The living Persons of the game that a quarrel can name, by id: not a pet, with a ref, the first of a repeated id. */
function holders(n: GameState): Map<string, Person> {
  const out = new Map<string, Person>()
  if (!Array.isArray(n.people)) return out
  for (const p of n.people) {
    if (typeof p !== 'object' || p === null || p.alive !== true || p.relation === 'pet' || typeof p.id !== 'string' || out.has(p.id)) continue
    if (personEntity(p) === 'pool:other') continue
    out.set(p.id, p)
  }
  return out
}

/** Writes `a > b`; true when the edge holds the quarrel (written, or already as strong). */
function quarrel(n: GameState, a: Person, b: Person, anger: number, year: number): boolean {
  const from = personEntity(a)
  const to = personEntity(b)
  if (from === to) return false
  const key = edgeKey(from, to)
  if (key === null) return false
  const s = Math.round(anger / 2)
  const old = readEdge(n, from, to)
  const patch: Partial<Edge> = old === null ? { t: 50, f: 50, r: 50, s, o: 0, y: year, l: year } : old.s >= s ? {} : { s }
  // the rung is cold, it is the first, and it is only given while the feuds of the whole map leave room (C12, X31)
  if (old?.q === undefined && liveFeuds(n) < EDGE_CAPS.feuds) patch.q = [1, year, 0]
  if (Object.keys(patch).length === 0) return true
  return putEdge(n, key, patch)
}

/** Does `x` come before `y`: the higher anger, then the lower ids. */
const stronger = (x: Quarrel, y: Quarrel): boolean => x.anger > y.anger || (x.anger === y.anger && (cmp(x.a, y.a) < 0 || (x.a === y.a && cmp(x.b, y.b) < 0)))

/**
 * Writes the quarrels of one reading (see the header). Mutates `n`'s edges only, through putEdge. Returns the strongest pair written, or
 * null. Safe on any plan: it reads, it does not trust, and it never throws on what a plan holds.
 */
export function strifeEdges(n: GameState, plan: EstatePlan, heirId: string): Quarrel | null {
  if (!socialOn(n)) return null
  const year = seenOf(n.year)
  if (year === null || !isPlain(plan)) return null
  const people = holders(n)

  const cutters: { p: Person; anger: number }[] = []
  const seenCut = new Set<string>()
  for (const raw of listOf(plan.cutOut)) {
    if (!isPlain(raw)) continue
    const id = textOf(raw.id)
    const anger = raw.anger
    if (id === null || id === heirId || seenCut.has(id) || !finite(anger) || anger < STRIFE.anger) continue
    if (raw.outcome === 'won' || raw.outcome === 'settled') continue
    const p = people.get(id)
    if (p === undefined) continue
    seenCut.add(id)
    cutters.push({ p, anger: Math.round(Math.min(100, anger)) })
  }
  if (cutters.length === 0) return null
  cutters.sort((x, y) => y.anger - x.anger || cmp(x.p.id, y.p.id))

  const favored: { p: Person; pct: number }[] = []
  const seenFav = new Set<string>()
  for (const raw of listOf(plan.recipients)) {
    if (!isPlain(raw)) continue
    const id = textOf(raw.id)
    const pct = raw.pct
    if (id === null || id === heirId || seenFav.has(id) || !finite(pct) || pct < STRIFE.share - SHARE_EPS) continue
    const p = people.get(id)
    if (p === undefined) continue
    seenFav.add(id)
    favored.push({ p, pct })
  }
  if (favored.length === 0) return null
  favored.sort((x, y) => y.pct - x.pct || cmp(x.p.id, y.p.id))

  let total = 0
  let best: Quarrel | null = null
  for (const c of cutters) {
    let mine = 0
    for (const f of favored) {
      if (total >= STRIFE.total || mine >= STRIFE.perPerson) break
      if (f.p.id === c.p.id || !quarrel(n, c.p, f.p, c.anger, year)) continue
      mine += 1
      total += 1
      const hit: Quarrel = { a: c.p.id, b: f.p.id, anger: c.anger }
      if (best === null || stronger(hit, best)) best = hit
    }
    if (total >= STRIFE.total) break
  }
  return best
}

/** The first name of a Person as the line says it: text, at most STRIFE.name characters. */
const shown = (p: Person): string => (typeof p.firstName === 'string' ? p.firstName.slice(0, STRIFE.name) : '')

/**
 * The line the reading says for a pair (one text draw, no g.rng draw): both first names, 90 characters or less. Null on a life that is not
 * stamped, and when either person is gone or has no name to say.
 */
export function strifeLine(n: GameState, hit: Pick<Quarrel, 'a' | 'b'>): string | null {
  if (!socialOn(n) || !Array.isArray(n.people)) return null
  const a = n.people.find((p) => p.id === hit.a)
  const b = n.people.find((p) => p.id === hit.b)
  if (a === undefined || b === undefined) return null
  const who = shown(a)
  const whom = shown(b)
  if (who === '' || whom === '') return null
  return fillSlots(pickLine(n, KIN_STRIFE), { who, whom })
}
