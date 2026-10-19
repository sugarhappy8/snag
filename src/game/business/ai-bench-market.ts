// AI Lab 2.0, the market: which rival labs are on the board in a year, what each rates in every capability,
// how the best rival catches up to a lab's released models, and where a lab stands on that board. Pure: every
// function takes the year it is about, reads no game state and draws no random number (a lab's specialty is
// seeded from its id). Results are cached per world in bounded maps, so a hint or a demand read is cheap.
import { seeded } from '../assets'
import { PRESENT_YEAR } from '../history/timeline'
import { CAP_IDS, CAPS, type CapId, type CapMap } from './ai-bench-data'
import { benchHard, benchScore, capBest, capMilestone, capOpen, capWeight, compositeRating, modelScore, type BestRival } from './ai-bench'
import { marketDef } from './competition-data'
import { activeRivals, rawPull, rosterOf } from './competition-roster'
import { bestModelAsOf, frontierScore } from './deeptech-data'
import type { AiModel, TechState } from './deeptech-state'
import { scoreRow, type ScoreRow } from './scorecard'
import { clampN } from './util'

/** One lab on a board. `modeled` marks a real company: the rating is a stylized stand-in, never a claim about it. */
export interface LabRow {
  id: string
  name: string
  modeled: boolean
  rating: number
}

/** The market in one capability and year, strongest lab first. */
export interface CapFront {
  cap: CapId
  year: number
  /** The best rating in the world (capBest). The leader sits exactly on it. */
  best: number
  /** The best rating's score on that year's test. */
  score: number
  leader: LabRow
  rows: readonly LabRow[]
}

/** Where a lab's best model stands in one year: every number is for `year`. */
export interface LabStanding {
  year: number
  /** The model being scored. */
  model: string
  composite: ScoreRow
  /** One row per capability open in `year`, in CAP_IDS order. */
  caps: ScoreRow[]
  /** Composite rating minus the best rival's, after catch-up. */
  lead: number
  /** The best rival overall. */
  leader: LabRow | null
}

const FIRST_YEAR = 2012
const CACHE_CAP = 600
/** A lab is on the board when its pull is at least this share of the strongest lab's. */
const BOARD_PULL = 0.1
/** Rivals follow to within this many rating points of a released model. */
const CATCH_UP = 70
/** Years a rival needs to follow a closed release, and open weights (which they can start from at once). */
const LAG_CLOSED = 2
const LAG_OPEN = 1

interface BoardLab {
  id: string
  name: string
  modeled: boolean
  ratings: CapMap
  composite: number
}

interface Board {
  /** The capabilities open that year, in CAP_IDS order. */
  open: CapId[]
  /** In roster order. */
  labs: BoardLab[]
  best: BoardLab
  /** The highest rating on the board in each open capability. */
  top: CapMap
}

/** A year as a whole number; a non-finite one reads as the present. */
function whole(year: number): number {
  return Number.isFinite(year) ? Math.round(year) : PRESENT_YEAR
}

/** Find or build a cached value (null results too); the oldest entry goes when the map is over its cap. */
function memo<T>(cache: Map<string, T>, key: string, make: () => T): T {
  if (cache.has(key)) return cache.get(key) as T
  const v = make()
  cache.set(key, v)
  if (cache.size > CACHE_CAP) {
    const first = cache.keys().next().value
    if (first !== undefined) cache.delete(first)
  }
  return v
}

const boards = new Map<string, Board | null>()
const fronts = new Map<string, CapFront | null>()
let builds = 0

/** Board builds so far and the current cache sizes (the cost test reads it). */
export function benchStats(): { builds: number; boards: number; fronts: number } {
  return { builds, boards: boards.size, fronts: fronts.size }
}

function buildBoard(fam: string, year: number): Board | null {
  const open = CAP_IDS.filter((c) => capOpen(c) <= year)
  if (!open.length) return null
  const d = marketDef('aiLab')
  const pulls = activeRivals(rosterOf(fam, 'aiLab', 'world'), year).map((r) => ({ r, w: rawPull(d, r, year) })).filter((p) => Number.isFinite(p.w) && p.w > 0)
  const wMax = pulls.reduce((m, p) => Math.max(m, p.w), 0)
  if (!(wMax > 0)) return null
  const kept = pulls.filter((p) => p.w >= BOARD_PULL * wMax)
  builds++
  const labs: BoardLab[] = kept.map(({ r }) => ({ id: r.id, name: r.name, modeled: !!r.real, ratings: {}, composite: 0 }))
  const top: CapMap = {}
  for (const c of open) {
    const best = capBest(fam, c, year)
    // Weaker labs sit lower; each lab has a fixed specialty per capability. The best on the board is exactly capBest.
    const deltas = kept.map(({ r, w }) => 220 * (1 - Math.sqrt(w / wMax)) + 160 * (seeded(`aiLab|${r.id}|${c}`).next() - 0.5))
    const lo = Math.min(...deltas)
    let hi = 0
    labs.forEach((l, i) => {
      const rating = clampN(Math.round(best - (deltas[i] - lo)), 0, 5000)
      l.ratings[c] = rating
      hi = Math.max(hi, rating)
    })
    top[c] = hi
  }
  let leader = labs[0]
  for (const l of labs) {
    l.composite = compositeRating(l.ratings, year)
    if (l.composite > leader.composite) leader = l
  }
  return { open, labs, best: leader, top }
}

function boardOf(fam: string, year: number): Board | null {
  return memo(boards, `${fam}|${year}`, () => buildBoard(fam, year))
}

/** The market in one capability: null before it opens, or when no lab trades that year. Strongest lab first, ties in roster order. */
export function capFrontier(fam: string, cap: CapId, year: number): CapFront | null {
  const y = whole(year)
  if (!(capOpen(cap) <= y)) return null
  return memo(fronts, `${fam}|${cap}|${y}`, () => {
    const board = boardOf(fam, y)
    if (!board) return null
    const rows = board.labs.map((l): LabRow => ({ id: l.id, name: l.name, modeled: l.modeled, rating: l.ratings[cap] ?? 0 })).sort((a, b) => b.rating - a.rating)
    const best = capBest(fam, cap, y)
    return { cap, year: y, best, score: benchScore(best, benchHard(fam, cap, y)), leader: rows[0], rows }
  })
}

/**
 * How far every rival rises in each open capability. A rival follows a released model: from `m.year + 2`
 * (`+ 1` for open weights) the best rival is at least 70 under the best released rating in that capability,
 * the largest over every unheld model so a newer, weaker one never undoes an older catch-up. All rivals rise by
 * the same amount, so the order of the board doesn't change.
 */
function liftsOf(board: Board, models: readonly AiModel[], year: number): CapMap {
  const out: CapMap = {}
  for (const c of board.open) {
    let floor = -Infinity
    for (const m of models) {
      if (m.held) continue
      const r = m.rating?.[c]
      if (typeof r !== 'number' || !Number.isFinite(r) || !(m.year + (m.open ? LAG_OPEN : LAG_CLOSED) <= year)) continue
      floor = Math.max(floor, r - CATCH_UP)
    }
    const lift = floor - (board.top[c] ?? 0)
    if (lift > 0) out[c] = lift
  }
  return out
}

/** A rival's ratings with the catch-up added. */
function lifted(ratings: CapMap, up: CapMap): CapMap {
  const out: CapMap = {}
  for (const c of CAP_IDS) {
    const r = ratings[c]
    if (r !== undefined) out[c] = r + (up[c] ?? 0)
  }
  return out
}

function liftSum(up: CapMap, year: number): number {
  let s = 0
  for (const c of CAP_IDS) s += capWeight(c, year) * (up[c] ?? 0)
  return s
}

/** The best rival lab on `year`'s board after catch-up from `models`; null before 2012 or with no lab trading. */
export function bestRival(fam: string, year: number, models: readonly AiModel[]): BestRival | null {
  const y = whole(year)
  const board = boardOf(fam, y)
  if (!board) return null
  const up = liftsOf(board, models, y)
  return { composite: board.best.composite + liftSum(up, y), score: modelScore(fam, lifted(board.best.ratings, up), y), leader: board.best.name, modeled: board.best.modeled }
}

/** The cheap read: composite rating of the lab's best model as of `year` minus the best rival's. Null without a rated best model or a board. */
export function labLead(fam: string, t: Pick<TechState, 'models'>, year: number): number | null {
  const y = whole(year)
  if (y < FIRST_YEAR) return null
  const m = bestModelAsOf(t, y)
  if (!m?.rating) return null
  const r = bestRival(fam, y, t.models)
  return r ? compositeRating(m.rating, y) - r.composite : null
}

/** The lab's best model as of `year` on the same board as the rivals: one row per open capability and an overall row. */
export function labStanding(fam: string, t: Pick<TechState, 'models'>, year: number): LabStanding | null {
  const y = whole(year)
  if (y < FIRST_YEAR) return null
  const m = bestModelAsOf(t, y)
  const board = boardOf(fam, y)
  const lead = labLead(fam, t, y)
  if (!m?.rating || !board || lead === null) return null
  const rating = m.rating
  const up = liftsOf(board, t.models, y)
  // The same lab a year earlier, scored on this year's test, so a retired generation isn't a fall. 0 without one.
  const prev = bestModelAsOf(t, y - 1)?.rating
  const caps = board.open.map((c) => {
    const hard = benchHard(fam, c, y)
    const field = board.labs.map((l) => benchScore((l.ratings[c] ?? 0) + (up[c] ?? 0), hard))
    return scoreRow(c, CAPS[c].label, 'score', benchScore(rating[c] ?? 0, hard), field, prev ? benchScore(prev[c] ?? 0, hard) : 0)
  })
  const composite = scoreRow('composite', 'Overall', 'score', modelScore(fam, rating, y), board.labs.map((l) => modelScore(fam, lifted(l.ratings, up), y)), prev ? modelScore(fam, prev, y) : 0)
  const b = board.best
  return { year: y, model: m.name, composite, caps, lead, leader: { id: b.id, name: b.name, modeled: b.modeled, rating: Math.round(b.composite + liftSum(up, y)) } }
}

/** A model's composite rating minus the best rival's in the model's own year. Null without a rating or a board. */
export function modelLead(fam: string, models: readonly AiModel[], m: AiModel): number | null {
  const y = whole(m.year)
  if (!m.rating || y < FIRST_YEAR) return null
  const r = bestRival(fam, y, models)
  return r ? compositeRating(m.rating, y) - r.composite : null
}

/**
 * True when `m` leads the best rival of its year and no earlier generation did (a rated one by its lead, an
 * unrated one by sitting at the old frontier line). A held generation counts too: its wave was written at training.
 */
export function firstToLead(fam: string, models: readonly AiModel[], m: AiModel): boolean {
  const lead = modelLead(fam, models, m)
  if (lead === null || !(lead > 0)) return false
  for (const x of models) {
    if (!(x.gen < m.gen)) continue
    const led = x.rating ? (modelLead(fam, models, x) ?? 0) > 0 : x.score >= frontierScore(x.year)
    if (led) return false
  }
  return true
}

/** The first year the world's best rating in a capability reaches its k-th milestone; 2201 when it never does. */
export function marketYear(fam: string, cap: CapId, k: 1 | 2 | 3): number {
  const goal = capMilestone(cap, k)
  for (let y = PRESENT_YEAR + 1; y <= 2200; y++) if (capBest(fam, cap, y) >= goal) return y
  return 2201
}
