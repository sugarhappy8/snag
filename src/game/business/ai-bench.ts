// AI Lab 2.0, the roster-free layer: what the best lab in the world rates in each capability by year,
// how hard each year's benchmark is, and the one formula that turns a lab into a model rating.
// Everything takes the year it is about and never reads the game's year (only benchYear derives one). Nothing
// here draws from the game's random stream; the drift past 2026 and a model's specialty are seeded from the family id.
// No roster code is imported, so deeptech-data.ts can use this file without an import cycle.
import { seeded } from '../assets'
import { PRESENT_YEAR, TECH } from '../history/timeline'
import { CAP_IDS, CAPS, type CapId, type CapMap } from './ai-bench-data'
import type { AiModel } from './deeptech-state'
import { clampN } from './util'

/** Starting numbers, tuned by the calibration tests (steps of 5 for the offset). */
export const RATING_OFFSET = 320
export const LEAD_DIVISOR = 190

/** The fields of an AiModel that rating code reads. */
type RatedModel = AiModel & { rating?: CapMap; held?: true }

const FIRST_YEAR = 2012
const LAST_YEAR = 2200
const CACHE_CAP = 160

/** A year as a whole number; a non-finite one reads as the present. */
function wholeYear(year: number): number {
  return Number.isFinite(year) ? Math.round(year) : PRESENT_YEAR
}

/** Find or build a cached value; the oldest entry goes when the map is over its cap (the rosterCache pattern). */
function remember<T>(cache: Map<string, T>, key: string, make: () => T): T {
  const hit = cache.get(key)
  if (hit) return hit
  const v = make()
  cache.set(key, v)
  if (cache.size > CACHE_CAP) {
    const first = cache.keys().next().value
    if (first !== undefined) cache.delete(first)
  }
  return v
}

/** The year a capability opens: its era's invention year plus its delay. */
export function capOpen(cap: CapId): number {
  return TECH[CAPS[cap].era].invented + CAPS[cap].delay
}

/** Share of the composite in `year`: 0 before the capability opens, the open ones rescaled to sum to 1. */
export function capWeight(cap: CapId, year: number): number {
  if (!(capOpen(cap) <= year)) return 0
  let total = 0
  for (const c of CAP_IDS) if (capOpen(c) <= year) total += CAPS[c].weight
  return total > 0 ? CAPS[cap].weight / total : 0
}

/** The anchored history, linear between control points, flat before the first and after the last. */
function anchored(cap: CapId, year: number): number {
  const a = CAPS[cap].anchors
  if (year <= a[0][0]) return a[0][1]
  for (let i = 1; i < a.length; i++) {
    if (year <= a[i][0]) {
      const [y0, v0] = a[i - 1]
      const [y1, v1] = a[i]
      return Math.round(v0 + ((v1 - v0) * (year - y0)) / (y1 - y0))
    }
  }
  return a[a.length - 1][1]
}

/** The drift past the present, one series per (family, capability): index 0 is PRESENT_YEAR. */
const driftCache = new Map<string, number[]>()

/** The best rating in the world in a capability: history up to PRESENT_YEAR, then a seeded drift. Whole numbers. */
export function capBest(fam: string, cap: CapId, year: number): number {
  const y = clampN(wholeYear(year), FIRST_YEAR, LAST_YEAR)
  if (y <= PRESENT_YEAR) return anchored(cap, y)
  const s = remember(driftCache, `${fam}|${cap}`, () => [anchored(cap, PRESENT_YEAR)])
  while (s.length <= y - PRESENT_YEAR) {
    const yr = PRESENT_YEAR + s.length
    const u = seeded(`${fam}|aicap|${cap}|${yr}`).next()
    s.push(s[s.length - 1] + Math.max(5, Math.round(55 * 0.97 ** (yr - PRESENT_YEAR) + 50 * (u - 0.5))))
  }
  return s[y - PRESENT_YEAR]
}

/** A benchmark score, 0 to 99: a logistic in the rating minus the test's difficulty. */
export function benchScore(rating: number, hard: number): number {
  return clampN(Math.round(100 / (1 + 2 ** (-(rating - hard) / 100))), 0, 99)
}

/** The difficulty series, one per (family, capability): index 0 is the opening year. */
const hardCache = new Map<string, number[]>()

/** The difficulty of the benchmark generation in force in `year`. A generation retires, and the next is 300 harder, when the best lab would score above 90 on it. */
export function benchHard(fam: string, cap: CapId, year: number): number {
  const open = capOpen(cap)
  const y = clampN(wholeYear(year), open, LAST_YEAR)
  const s = remember(hardCache, `${fam}|${cap}`, () => [])
  while (s.length <= y - open) {
    const yr = open + s.length
    let h = s.length ? s[s.length - 1] : capBest(fam, cap, open) - 100
    const best = capBest(fam, cap, yr)
    while (benchScore(best, h) > 90) h += 300
    s.push(h)
  }
  return s[y - open]
}

/** The k-th milestone rating of a capability, above today's market, for firsts. */
export function capMilestone(cap: CapId, k: 1 | 2 | 3): number {
  return Math.round((capBest('', cap, PRESENT_YEAR) + [60, 200, 400][k - 1]) / 50) * 50
}

/** A model's zero-mean specialty in one capability, within 35 either way. Seeded, no rng draw. */
export function modelSpec(fam: string, gen: number, cap: CapId): number {
  return 70 * (seeded(`${fam}|aispec|${gen}|${cap}`).next() - 0.5)
}

export interface RatingInput {
  cap: CapId
  year: number
  fam: string
  gen: number
  /** The lab's level. */
  level: number
  /** min(12, 2 plant + 0.8 rented), as the old formula. */
  compute: number
  /** Research levels in this capability (caps[cap]). */
  research: number
  spec: number
  /** The one training roll, 0 to 1. */
  roll: number
  /** The best released rating of this lab in this capability (held models don't count). */
  released: number
}

function fin(n: number, or = 0): number {
  return Number.isFinite(n) ? n : or
}

/** The rating of one new model in one capability. Nobody leads by more than 90 on one model. */
export function modelRating(i: RatingInput): number {
  const best = capBest(i.fam, i.cap, i.year)
  const raw = best - RATING_OFFSET + 2.7 * fin(i.level) + 15 * Math.min(fin(i.gen), 8) + 9 * fin(i.compute) + 20 * fin(i.research) + fin(i.spec) + 120 * (fin(i.roll, 0.5) - 0.5)
  const ref = Math.max(best, fin(i.released))
  const rating = raw <= ref ? raw : ref + 90 * (1 - Math.E ** (-(raw - ref) / 90))
  return clampN(Math.round(rating), 1, 5000)
}

function ratingOf(rating: CapMap | undefined, cap: CapId): number {
  const v = rating?.[cap]
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/** The best rating this lab has released in a capability; held models don't count. 0 for none. */
export function releasedRating(models: readonly RatedModel[], cap: CapId): number {
  let best = 0
  for (const m of models) if (!m.held) best = Math.max(best, ratingOf(m.rating, cap))
  return best
}

/** One number to rank models by across years: the base-weight sum of the ratings (missing = 0). */
export function modelStrength(m: Pick<RatedModel, 'rating'>): number {
  let s = 0
  for (const c of CAP_IDS) s += CAPS[c].weight * ratingOf(m.rating, c)
  return s
}

/** The weighted rating sum over the capabilities open in `year`. The market compares in this unit. */
export function compositeRating(rating: CapMap | undefined, year: number): number {
  let s = 0
  for (const c of CAP_IDS) s += capWeight(c, year) * ratingOf(rating, c)
  return s
}

/** A model's composite benchmark score, 0 to 99, on `year`'s tests. */
export function modelScore(fam: string, rating: CapMap, year: number): number {
  let s = 0
  for (const c of CAP_IDS) {
    const w = capWeight(c, year)
    if (w > 0) s += w * benchScore(ratingOf(rating, c), benchHard(fam, c, year))
  }
  return clampN(Math.round(s), 0, 99)
}

/** The last closed fiscal year, the one training stamps and the screens show. */
export function benchYear(s: { year: number }): number {
  return wholeYear(s.year) - 1
}

/** The best rival lab overall, on one year's board. */
export interface BestRival {
  composite: number
  score: number
  leader: string
  modeled: boolean
}

export type LeadTier = 'leads' | 'close' | 'trails'

/** Leads above 0, close within 60 rating points, else trails. */
export function leadTier(lead: number): LeadTier {
  return lead > 0 ? 'leads' : lead >= -60 ? 'close' : 'trails'
}

export const LEAD_ENDING: Record<LeadTier, string> = {
  leads: 'It leads the field.',
  close: "It's close to the best.",
  trails: 'It trails the best.',
}
