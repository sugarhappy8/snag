// AI Lab 2.0 text builders. Pure reads over a lab's models and the rival board: nothing here draws a random
// number, reads the clock or the game's year, or touches the game or its saved state, so menus, popups and
// reports share one source for what they say. Every function takes the year it is about (the callers pass the
// last closed fiscal year, or the plan year for the one competitiveness figure).
// Legacy models (no rating, or trained before 2012) keep today's wording, read at the model's own year.
import { PRESENT_YEAR } from '../history/timeline'
import { isExact } from '../knowledge/contract'
import { capMilestone, capOpen } from './ai-bench'
import type { AiFirst } from './ai-bench-claims'
import { CAP_IDS, CAPS, isCapId, type CapId } from './ai-bench-data'
import { bestRival, labStanding, marketYear, modelLead, type LabStanding } from './ai-bench-market'
import { competitiveness } from './deeptech-core'
import { bestModel, bestModelAsOf, frontierScore } from './deeptech-data'
import type { AiModel, TechState } from './deeptech-state'
import { spark, trendArrow } from './market-view'
import { scoreText, type ScoreRow } from './scorecard'

/** One line of the Benchmarks screen. `id` is a capability id on a capability row, else header, overall, leader or none. */
export interface BenchLine {
  id: string
  text: string
}

type Models = Pick<TechState, 'models'>

/** The most years of history a series shows. */
const SERIES_YEARS = 12

/** A year as a whole number; a non-finite one reads as the present. */
function whole(year: number): number {
  return Number.isFinite(year) ? Math.round(year) : PRESENT_YEAR
}

/**
 * The release popup text. A rated model names its own year and the best rival of that year; any other
 * model keeps today's wording with the frontier line read at its own year. Both say what a hold costs.
 */
export function releaseText(m: AiModel, fam: string, models: readonly AiModel[]): string {
  const rival = m.rating ? bestRival(fam, m.year, models) : null
  if (rival) return `${m.name} scored ${m.score} on the ${m.year} benchmarks. The best rival scored ${rival.score}. Closed earns API money, open earns fans but cuts it. A held model earns nothing.`
  return `${m.name} scored ${m.score} on the benchmarks (the best anyone has is about ${frontierScore(m.year)}). How do you release it? Closed models earn API money; open weights win fans, talent and hype but undercut your own API. A held model earns nothing until you release it.`
}

/** The launch line of a closed release: a model that leads the best rival of its year is the best in the world. */
export function launchText(m: AiModel, fam: string, models: readonly AiModel[]): string {
  const lead = m.rating ? modelLead(fam, models, m) : null
  const leads = lead !== null ? lead > 0 : m.score >= frontierScore(m.year)
  return leads ? 'Tech journalists are calling it the best model in the world.' : 'Reviews are solid.'
}

/** The lab's standing for each year from its first model (at most 12 years back), oldest first; empty with no model. */
function standings(fam: string, t: Models, year: number): (LabStanding | null)[] {
  const y = whole(year)
  if (!t.models.length) return []
  const first = Math.max(whole(Math.min(...t.models.map((m) => m.year))), y - (SERIES_YEARS - 1))
  const out: (LabStanding | null)[] = []
  for (let yr = first; yr <= y; yr++) out.push(labStanding(fam, t, yr))
  return out
}

/**
 * The lab's score for each year from its first model, at most 12, oldest first: the overall score, or one
 * capability's when `cap` is given. 0 for a year with no rated model or before the capability opened. Empty with no model.
 */
export function benchSeries(fam: string, t: Models, year: number, cap?: CapId): number[] {
  return standings(fam, t, year).map((s) => (!s ? 0 : cap ? (s.caps.find((r) => r.id === cap)?.mine ?? 0) : s.composite.mine))
}

/**
 * The Benchmarks screen, one line each: the header, the overall row, the best lab when it is a modeled real
 * one, then one row per capability open in `year` (its id is the capability id). Without an open capability
 * there is one line saying so; without a rated model there is the header and a nudge to train one.
 */
export function benchRows(fam: string, t: Models, year: number): BenchLine[] {
  const y = whole(year)
  if (!CAP_IDS.some((c) => capOpen(c) <= y)) return [{ id: 'none', text: 'No benchmark exists yet.' }]
  const header: BenchLine = { id: 'header', text: `Scores are your best released model on ${y}'s tests. Tests get harder near the top, so a score can fall while your model doesn't change.` }
  const s = labStanding(fam, t, y)
  if (!s) return [header, { id: 'none', text: 'Train a model to see where it ranks.' }]
  const series = standings(fam, t, y)
  const row = (r: ScoreRow, pick: (x: LabStanding) => ScoreRow | undefined): string =>
    `${scoreText(r)} ${trendArrow(r.trend)} ${spark(series.map((x) => (x ? (pick(x)?.mine ?? 0) : 0)))}`
  const out: BenchLine[] = [header, { id: 'overall', text: row(s.composite, (x) => x.composite) }]
  // R3-G5: the board is a public leaderboard. Exact mode keeps the old "modeled" disclaimer; Realistic calls it published.
  if (s.leader?.modeled) out.push({ id: 'leader', text: `Best lab: ${s.leader.name} (${isExact() ? 'modeled' : 'published'}).` })
  for (const r of s.caps) out.push({ id: r.id, text: row(r, (x) => x.caps.find((c) => c.id === r.id)) })
  return out
}

interface Milestone {
  cap: CapId
  k: 1 | 2 | 3
  /** The milestone rating. */
  goal: number
  /** The sort figure: the gap to close, or the year the market passed it. */
  rank: number
}

const MILESTONES = [1, 2, 3] as const

/** The claim key `${cap}.${k}` split back into its parts, or null when it isn't one. */
function claimOf(key: string): { cap: CapId; k: 1 | 2 | 3 } | null {
  const [cap, k] = key.split('.')
  return isCapId(cap) && (k === '1' || k === '2' || k === '3') ? { cap, k: Number(k) as 1 | 2 | 3 } : null
}

/**
 * Up to three lines about milestones, in this order, never more than one of each kind. The newest claim in
 * `claims` (the world record, always the player's family). The open milestone closest to the best model's
 * rating, which no lab has reached. The milestone the market passed most recently. A market year after `year`
 * never appears in any line: until the market passes a milestone, the line only says it is open.
 */
export function firstRows(fam: string, t: Models, year: number, claims: Readonly<Record<string, AiFirst>>): BenchLine[] {
  const y = whole(year)
  const out: BenchLine[] = []
  const label = (c: CapId): string => CAPS[c].label.toLowerCase()
  let newest: { cap: CapId; k: 1 | 2 | 3; year: number } | null = null
  for (const key of Object.keys(claims)) {
    const c = claimOf(key)
    if (c && (!newest || claims[key].year > newest.year)) newest = { ...c, year: claims[key].year }
  }
  if (newest) out.push({ id: 'first.claim', text: `First to ${capMilestone(newest.cap, newest.k)} in ${label(newest.cap)}: you, ${newest.year}.` })
  const rating = bestModelAsOf(t, y)?.rating
  let open: Milestone | null = null
  let passed: Milestone | null = null
  for (const cap of CAP_IDS) {
    if (!(capOpen(cap) <= y)) continue
    for (const k of MILESTONES) {
      if (`${cap}.${k}` in claims) continue
      const goal = capMilestone(cap, k)
      const at = marketYear(fam, cap, k)
      if (at > y) {
        const gap = goal - (rating?.[cap] ?? 0)
        if (rating && gap > 0 && (!open || gap < open.rank)) open = { cap, k, goal, rank: gap }
      } else if (!passed || at > passed.rank) passed = { cap, k, goal, rank: at }
    }
  }
  if (open) out.push({ id: 'first.open', text: `Open: ${open.goal} in ${label(open.cap)}. No lab has reached it.` })
  if (passed) out.push({ id: 'first.passed', text: `A rival reached ${passed.goal} in ${label(passed.cap)} in ${passed.rank}.` })
  return out
}

/**
 * The Compute & Models line. A rated standing names the model, the best rival and the rank, then the
 * competitiveness the pitch and demand use (read at `planYear`). A lab with no model in 2012 or later says so;
 * any other lab keeps today's frontier line, read at the best model's own year.
 */
export function aiLine(fam: string, t: Models, year: number, planYear: number): string {
  const y = whole(year)
  const pct = (): number => Math.round(competitiveness(t, planYear, fam) * 100)
  const s = labStanding(fam, t, y)
  if (s) return `Benchmarks as of ${y}. ${s.model} scores ${s.composite.mine}, the best rival scores ${bestRival(fam, y, t.models)?.score ?? 0}. You rank ${s.composite.rank} of ${s.composite.of}. Competitiveness ${pct()}%.`
  if (!t.models.length && y >= 2012) return `Benchmarks as of ${y}. You have no model yet.`
  const best = bestModel(t)
  return `The frontier: about ${frontierScore(best?.year ?? y)}/100 and rising. ${best ? `Your best, ${best.name}, scores ${best.score} (competitiveness ${pct()}%).` : 'You have no model yet.'}`
}

/** The Annual Report note for an AI lab. Empty with no model. */
export function marketNote(fam: string, t: Models, year: number): string {
  const y = whole(year)
  const s = labStanding(fam, t, y)
  if (s) return `${s.model} scores ${s.composite.mine}; the best rival scores ${bestRival(fam, y, t.models)?.score ?? 0}. You rank ${s.composite.rank} of ${s.composite.of}.`
  const best = bestModel(t)
  return best ? `${best.name} scores ${best.score}; the frontier is about ${frontierScore(best.year)} and rising.` : ''
}

/** The clause in the profile's Business line. Empty with no model. */
export function summaryClause(fam: string, t: Models, year: number): string {
  const s = labStanding(fam, t, whole(year))
  if (s) return `best model ${s.model} (score ${s.composite.mine}, rank ${s.composite.rank} of ${s.composite.of})`
  const best = bestModel(t)
  return best ? `best model ${best.name} (score ${best.score})` : ''
}
