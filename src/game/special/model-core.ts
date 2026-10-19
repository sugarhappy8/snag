// Model 2.0 core math: the age shelf, the look value, the score and ranking, fee splits, commission, strain,
// cast odds and the book. Everything here is pure: no g.rng, no state writes, so menus, hints and the
// yearly settle can all call it, and a hint prints the same numbers a roll uses. Tables live in model-data.ts.
import { economyOf } from '../economy/model'
import { hasTalent } from '../talents'
import type { GameState } from '../types'
import { activeField, standingOf, type RivalSpec } from './kit/rivals'
import { modelingSkill, viewModel } from './model'
import { COMMISSION, FLOOR_BONUS, FOCUS, FOCUSES, KINDS, SHELF_YOUNG, TALENT_PRIME, TIER_REQ } from './model-data'
import type { Focus, MdOffer, ModelState } from './model-state'
import { totalFollowers } from './social'

const fin = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))
const logistic = (x: number): number => 1 / (1 + Math.exp(-x))

/** Rivals: the three focuses are the edges; no field before 1925, then 12 active names. */
export const MODEL_SPEC: RivalSpec = {
  career: 'model',
  edges: FOCUSES,
  debutAge: [16, 22],
  length: [8, 20],
  field: (year) => (year < 1925 ? 0 : 12),
}

// ---------------------------------------------------------------------------
// Look

/**
 * How much of the look the market still wants. Before the prime: 0.75 at 16, +0.05 a year, 1 from 21. The prime
 * ends at 24 runway, 30 editorial, 36 commercial (+2 with Modeling); after it 1 - decay x years past it, never
 * under the floor (+0.05 from 1990, +0.10 from 2010). Under 16 reads as 16.
 */
export function shelf(focus: Focus, age: number, talent: boolean, year: number): number {
  const f = FOCUS[focus] ?? FOCUS.editorial
  const a = fin(age, SHELF_YOUNG.age)
  const prime = f.prime + (talent ? TALENT_PRIME : 0)
  if (a <= prime) return Math.min(1, SHELF_YOUNG.start + SHELF_YOUNG.step * Math.max(0, a - SHELF_YOUNG.age))
  const bonus = Number.isFinite(year) ? (FLOOR_BONUS.filter((b) => year >= b.from).at(-1)?.add ?? 0) : 0
  return Math.max(f.floor + bonus, 1 - f.decay * (a - prime))
}

/**
 * The look the market sees: base x shelf x (1 - 0.006 x strain past 60), 0-100. base = 0.6 looks + 0.15 headshot
 * x fresh + 0.15 skill + 10, where a headshot is fresh (1) within 3 years of its date and worth 0.8 after.
 */
export function lookValue(g: GameState, s: ModelState): number {
  const c = g.character
  const p = viewModel(g)
  const fresh = p.headshot > 0 && p.headshotAge >= 0 && fin(c.age, 0) - p.headshotAge <= 3 ? 1 : 0.8
  const base = 0.6 * fin(c.stats.looks, 0) + 0.15 * p.headshot * fresh + 0.15 * modelingSkill(g) + 10
  const strain = clamp(fin(s.strain, 0), 0, 100)
  return clamp(base * shelf(s.focus, c.age, hasTalent(g, 'Modeling'), g.year) * (1 - 0.006 * Math.max(0, strain - 60)), 0, 100)
}

// ---------------------------------------------------------------------------
// Score and ranking

/** The ranking score: 0.35 look + 0.30 book + 0.20 buzz + 0.15 rep, 0-100. Rivals are scored by the kit the same way. */
export function scoreOf(look: number, book: number, buzz: number, rep: number): number {
  const v = (n: number): number => clamp(fin(n, 0), 0, 100)
  return clamp(0.35 * v(look) + 0.3 * v(book) + 0.2 * v(buzz) + 0.15 * v(rep), 0, 100)
}

/**
 * The model's ranking: the kit rank among this year's rivals plus a long-tail term below a score of 70. Above 50
 * reads 'outside the top 50'. Monotone: a higher score never ranks worse.
 */
export function rankingOf(g: GameState, s: ModelState): number {
  const score = scoreOf(lookValue(g, s), s.book, s.buzz, s.rep)
  const st = standingOf(g, MODEL_SPEC, score, s.memory)
  return st.rank + Math.round(40 * clamp((70 - score) / 60, 0, 1) ** 1.5)
}

// ---------------------------------------------------------------------------
// Money

/**
 * Splits a fee into whole dollars: the agency's cut, the mother agency's cut, the advance it recoups and the net,
 * so gross = agency + mother + recoup + net exactly (the fee rounds once). 20,000 at 25% agency, 5% mother and
 * 2,000 unrecouped leaves 12,000.
 */
export function settleFee(fee: number, agencyPct: number, motherPct: number, unrecouped: number): { agency: number; mother: number; recoup: number; net: number } {
  const gross = Math.max(0, Math.round(fin(fee, 0)))
  const pct = (v: number): number => clamp(fin(v, 0), 0, 100)
  const agency = Math.min(gross, Math.round((gross * pct(agencyPct)) / 100))
  const mother = Math.min(gross - agency, Math.round((gross * pct(motherPct)) / 100))
  const rest = gross - agency - mother
  const recoup = Math.min(Math.max(0, Math.round(fin(unrecouped, 0))), rest)
  return { agency, mother, recoup, net: rest - recoup }
}

/**
 * The agency's commission, percent: base 18/20/20/22 by tier, reputation trims up to 3 (one point from 55, two
 * from 70, three from 85), a Guarantee adds 3, kept inside 12 to 30.
 */
export function commissionFor(tier: number, rep: number, guarantee: boolean): number {
  const t = Math.round(clamp(fin(tier, 0), 0, COMMISSION.base.length - 1))
  const trim = clamp(Math.floor((clamp(fin(rep, 0), 0, 100) - 40) / 15), 0, COMMISSION.trim)
  return clamp(COMMISSION.base[t] - trim + (guarantee ? COMMISSION.guarantee : 0), COMMISSION.min, COMMISSION.max)
}

// ---------------------------------------------------------------------------
// Strain

/** Next year's strain: clamp100(0.5 strain + 1.2 days + 6 trips - 10 - rest). */
export function strainNext(strain: number, days: number, trips: number, rest: number): number {
  return clamp(0.5 * fin(strain, 0) + 1.2 * fin(days, 0) + 6 * fin(trips, 0) - 10 - fin(rest, 0), 0, 100)
}

/** The injury weight: 0.02 + 0.006 x strain past 55, capped at 0.29. */
export function strainRisk(strain: number): number {
  return Math.min(0.29, 0.02 + 0.006 * Math.max(0, fin(strain, 0) - 55))
}

// ---------------------------------------------------------------------------
// Casting

const NICHE_BONUS = 6
const HOME_BONUS = 4
const TALENT_BONUS = 6
const FOLLOWER_BONUS_MAX = 8

/**
 * The cast odds the roll and the hint both use. fit = clamp100(50 + 0.8 (standing - req) + 6 niche + 4 home + up to
 * 8 followers + 6 talent), req 15/28/42/58/72 by brand tier. rivalMean is the mean fit of the shortlisted rivals
 * (50 + 0.8 (score - req) + 6 niche each; an average rival of 50 when none is on the shortlist). odds =
 * clamp(logistic((fit - rivalMean - 4) / 12), 0.05, 0.92). Fit and mean are whole numbers, as they are shown.
 */
export function castPlan(g: GameState, s: ModelState, o: MdOffer): { fit: number; rivalMean: number; odds: number } {
  const req = TIER_REQ[Math.round(clamp(fin(o.minTitle, 0), 0, TIER_REQ.length - 1))]
  const niche = KINDS[o.kind]?.niche
  const followers = Math.max(0, fin(totalFollowers(g), 0))
  const fit = Math.round(
    clamp(
      50 +
        0.8 * (fin(s.standing, 0) - req) +
        (niche === s.focus ? NICHE_BONUS : 0) +
        (o.abroad ? 0 : HOME_BONUS) +
        Math.min(FOLLOWER_BONUS_MAX, 2.5 * Math.log10(1 + followers / 1000)) +
        (hasTalent(g, 'Modeling') ? TALENT_BONUS : 0),
      0,
      100,
    ),
  )
  const field = o.rivals.length ? activeField(g, MODEL_SPEC, s.memory) : []
  const fits: number[] = []
  for (const id of o.rivals) {
    const row = field.find((x) => x.rival.id === id)
    if (row) fits.push(clamp(50 + 0.8 * (row.score - req) + (row.rival.edge === niche ? NICHE_BONUS : 0), 0, 100))
  }
  const rivalMean = Math.round(fits.length ? fits.reduce((a, b) => a + b, 0) / fits.length : clamp(50 + 0.8 * (50 - req), 0, 100))
  return { fit, rivalMean, odds: clamp(logistic((fit - rivalMean - 4) / 12), 0.05, 0.92) }
}

/** The odds the agent gives ground at renewal: clamp(logistic((rep + book - 90) / 20), 0.10, 0.85). */
export function renewalOdds(rep: number, book: number): number {
  return clamp(logistic((fin(rep, 0) + fin(book, 0) - 90) / 20), 0.1, 0.85)
}

// ---------------------------------------------------------------------------
// Market, exits and the book

/** What the economy does to every fee: clamp(0.6 consumer demand + 0.4 leisure demand, 0.6, 1.4). Read only. */
export function marketFactor(g: GameState): number {
  const sectors = economyOf(g).sectors
  return clamp(0.6 * fin(sectors.consumer?.demand, 1) + 0.4 * fin(sectors.leisure?.demand, 1), 0.6, 1.4)
}

/** The brand a fashion label starts at: exactly the expression `newBiz` uses (a test pins them together). */
export function labelHeadStart(g: GameState): number {
  return Math.round(clamp(15 + fin(g.character.hidden.fame, 0) / 4, 0, 60))
}

/**
 * The book after a year: each win takes (100 - book) x min(0.5, points / 100) at once, then the whole book fades by
 * 0.93. Four luxury campaigns (7.2 points each) a year settle near 77, two mass campaigns (3 points) near 44.
 */
export function bookAfter(book: number, wins: { points: number }[]): number {
  let b = clamp(fin(book, 0), 0, 100)
  for (const w of wins) b += (100 - b) * Math.min(0.5, Math.max(0, fin(w.points, 0)) / 100)
  return clamp(b * 0.93, 0, 100)
}
