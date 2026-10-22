// Silicon 2.0: the words on a chip company's screen. Pure reads: nothing here writes state or draws from the game's
// RNG, and every year is the game's year the menu is planned in (g.year), never a fiscal year of its own choosing.
import { shortageIntensity } from '../history/market-events'
import type { GameState } from '../types'
import { marketViewOf } from './competition'
import { marketStateOf } from './competition-core'
import { familyId } from './competition-roster'
import { mixIndex, siliconView, techPlan } from './deeptech-core'
import type { TechState } from './deeptech-state'
import { segmentsOf } from './market-view'
import { cmpKey, scoreFog, scoreRow, scoreText } from './scorecard'
import { brandStep, chipPerformance, rivalPriceIndex } from './silicon'
import type { ChipLane } from './silicon-data'
import type { BizState } from './state'
import { pct, unitMoney } from './util'

export type GoodwillBand = 'angry' | 'cool' | 'neutral' | 'warm' | 'loyal' | 'devoted'

/** How buyers feel, in words: under 30 angry, under 45 cool, under 56 neutral, under 70 warm, under 85 loyal, then devoted. */
export function goodwillBand(goodwill: number): GoodwillBand {
  if (goodwill < 30) return 'angry'
  if (goodwill < 45) return 'cool'
  if (goodwill < 56) return 'neutral'
  if (goodwill < 70) return 'warm'
  if (goodwill < 85) return 'loyal'
  return 'devoted'
}

/**
 * The five rows Chips & Fabs shows a company from stage 2: goodwill (with the squeeze sentence while the squeeze
 * lasts), then where its chips stand on performance, quality, price and share of its segment.
 *
 * R3-G5: in Realistic mode the performance and quality rows read the rivals through scoreFog (ranges, "estimated") and
 * `siliconBoard` carries the chip for each; the price row (your own prices against posted ones) and the share row (a published
 * share) stay exact. In Exact mode, or with no rival to read, every line is the one it always was and there is no chip.
 */
export function siliconRows(g: GameState, b: BizState, t: TechState): SiliconRows {
  return siliconBoard(g, b, t).rows
}

export interface SiliconRows {
  goodwill: string
  perf: string
  quality: string
  price: string
  share: string
}

/** The chip for each fogged row (0 to 3); a row with nothing to fog has none. */
export interface SiliconConf {
  perf?: 0 | 1 | 2 | 3
  quality?: 0 | 1 | 2 | 3
}

/** siliconRows with the confidence of its fogged rows beside it, for the screen that draws the chip. One read of the market. */
export function siliconBoard(g: GameState, b: BizState, t: TechState): { rows: SiliconRows; conf: SiliconConf } {
  const s = siliconView(t)
  const v = marketViewOf(g, b)
  const rivals = v.rivals
  const n = Math.round(s.goodwill)
  const step = brandStep(s.goodwill)
  const size = Math.abs(step).toFixed(1)
  const effect = size === '0.0' ? "It doesn't move brand." : `It ${step > 0 ? 'adds' : 'costs'} ${size} brand a year.`
  const tight = shortageIntensity(b.countryId, g.year) > 0 ? ' Chip supply is tight this year. Buyers notice who charges what.' : ''
  // A rival's price index reads 7% lower while a deep cut of yours has it matching.
  const mods = marketStateOf(b)?.mods ?? {}
  const cutting = (id: string): boolean => {
    const m = mods[id]
    return !!m && m.until >= g.year && m.mult > 1
  }
  const plan = techPlan(g, b, t, g.year, { calm: true })
  const fam = familyId(g.lifeId)
  const mine = segmentsOf(b, v).find((x) => x.mine)
  const techs = rivals.map((r) => r.tech)
  const qualities = rivals.map((r) => r.quality)
  const perf = scoreRow('perf', 'Performance', '', chipPerformance(t), techs, s.last?.perf)
  const quality = scoreRow('quality', 'Quality', '', b.quality, qualities, s.last?.quality)
  const perfFog = scoreFog(g, perf, techs, (i) => cmpKey('chip.perf', rivals[i]!.id))
  const qualityFog = scoreFog(g, quality, qualities, (i) => cmpKey('chip.quality', rivals[i]!.id))
  const conf = { ...(perfFog ? { perf: perfFog.conf } : {}), ...(qualityFog ? { quality: qualityFog.conf } : {}) }
  const rows: SiliconRows = {
    goodwill: `Goodwill ${n}/100, ${goodwillBand(n)}. ${effect}${tight}`,
    perf: scoreText(perf, undefined, perfFog),
    quality: scoreText(quality, undefined, qualityFog),
    // scoreRow ranks the higher value first, so the indices go in negated (the cheapest ranks first) and print back positive.
    price: scoreText(scoreRow('price', 'Price', '', -mixIndex(plan), rivals.map((r) => -rivalPriceIndex(fam, r, g.year, cutting(r.id)))), (x) => `${Math.abs(x).toFixed(2)}x`),
    share: scoreText(scoreRow('share', 'Share of segment', '%', (mine?.me ?? 0) * 100, (mine?.others ?? []).map((x) => x * 100)), (x) => `${x.toFixed(1)}%`),
  }
  return { rows, conf }
}

/**
 * The Annual Report's goodwill line for the year just booked, '62 (warm) · 0.88x': goodwill with its band, then the
 * price position of the squeeze lanes (below 1 is cheaper than the market). Good from 56, bad up to 44. Null when the
 * company has no booked chip year for `year`. A pure read of a possibly live `t`, so it goes through `siliconView`.
 */
export function reportLine(t: TechState, year: number): { label: string; value: string; tone: 'good' | 'bad' | 'neutral' } | null {
  const s = siliconView(t)
  if (!s.last || s.last.year !== year) return null
  const n = Math.round(s.goodwill)
  return { label: 'Goodwill · price vs market', value: `${n} (${goodwillBand(n)}) · ${s.last.index.toFixed(2)}x`, tone: n >= 56 ? 'good' : n <= 44 ? 'bad' : 'neutral' }
}

/** A lane's price line from the calm plan: '$52.00 each, 0.88x the market, 24% of your sales' ('' when the lane isn't in the plan). */
export function laneSubtitle(g: GameState, b: BizState, t: TechState, lane: ChipLane): string {
  const row = techPlan(g, b, t, g.year, { calm: true }).lanes.find((l) => l.id === lane.id)
  return row ? `${unitMoney(row.price)} each, ${row.index.toFixed(2)}x the market, ${pct(row.share)} of your sales` : ''
}

/** The pricing policy in one line: a cap on the hired CEO's headline price, or none. */
export function policySubtitle(ceiling: number): string {
  return ceiling > 0 ? `Hired CEO prices at most ${Math.round(ceiling * 100)}% of the market` : 'Hired CEO plans by profit alone'
}
