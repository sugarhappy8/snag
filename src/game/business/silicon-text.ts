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
import { scoreRow, scoreText } from './scorecard'
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
 */
export function siliconRows(g: GameState, b: BizState, t: TechState): { goodwill: string; perf: string; quality: string; price: string; share: string } {
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
  return {
    goodwill: `Goodwill ${n}/100, ${goodwillBand(n)}. ${effect}${tight}`,
    perf: scoreText(scoreRow('perf', 'Performance', '', chipPerformance(t), rivals.map((r) => r.tech), s.last?.perf)),
    quality: scoreText(scoreRow('quality', 'Quality', '', b.quality, rivals.map((r) => r.quality), s.last?.quality)),
    // scoreRow ranks the higher value first, so the indices go in negated (the cheapest ranks first) and print back positive.
    price: scoreText(scoreRow('price', 'Price', '', -mixIndex(plan), rivals.map((r) => -rivalPriceIndex(fam, r, g.year, cutting(r.id)))), (x) => `${Math.abs(x).toFixed(2)}x`),
    share: scoreText(scoreRow('share', 'Share of segment', '%', (mine?.me ?? 0) * 100, (mine?.others ?? []).map((x) => x * 100)), (x) => `${x.toFixed(1)}%`),
  }
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
