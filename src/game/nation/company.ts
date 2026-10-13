// Governments' trade measures reach the player's own export business: each year (and whenever a
// measure changes) the extra tariffs and sanctions on a company's goods in the countries it
// entered are stamped on its market state (MarketState.barriers), which market-reach reads.
import { tariffOn } from '../business/market-trade'
import { saveMarket } from '../business/competition'
import { marketStateOf } from '../business/competition-core'
import { bizOf, businessAssets } from '../business/state'
import type { GameState } from '../types'
import { sanctionBarrier, tariffWith, tradeOverlay } from './trade-policy'

export function stampCompanyBarriers(g: GameState): void {
  const overlay = tradeOverlay(g, g.year)
  for (const a of businessAssets(g)) {
    const b = bizOf(g, a)
    const st = marketStateOf(b)
    if (!st || (!st.entries.length && !st.barriers)) continue
    const next: Record<string, number> = {}
    if (overlay) for (const e of st.entries) {
      const extra = Math.max(0, tariffWith(g, e.home, e.country, g.year, b.industry) - tariffOn(e.home, e.country, g.year)) + sanctionBarrier(g, e.home, e.country) * .5
      if (extra > .001) next[e.country] = Math.min(.9, Math.round(extra * 1e4) / 1e4)
    }
    const same = JSON.stringify(next) === JSON.stringify(st.barriers ?? {})
    if (same) continue
    if (Object.keys(next).length) st.barriers = next
    else delete st.barriers
    saveMarket(b, st)
  }
}
