// Who holds what share in each country of a world market. The market model itself is global (one
// share per company); this splits it by country in a way that is consistent with it: every
// company has a home advantage and a neighbourhood advantage (same continent or trade bloc), pays
// for tariffs and red tape when it sells into a country from abroad, and the split is balanced
// (iterative proportional fitting) so that each country's shares add up to 100% and each company's
// shares, weighted by the size of the countries, add back up to its world share. Pure: no RNG, no
// game state.
import { marketOf } from '../data/markets'
import { getCountry } from '../world'
import { demandWeights } from './market-reach'
import { goodsShare, otherBarriers, sharedBloc, tariffOn } from './market-trade'

export interface RegionalRival {
  id: string
  hq: string
  /** World share (0-1). */
  share: number
  legacy: boolean
}

export interface RegionalInput {
  industry: string
  year: number
  /** The player's company: its home country and world share. */
  home: string
  meShare: number
  /** Presence of the player in a country (1 at home, less abroad). */
  mePresence: (country: string) => number
  rivals: readonly RegionalRival[]
  /** Share of the long tail of small companies. */
  fringe: number
}

export interface Regional {
  /** Each country's slice of the industry's world demand. */
  weights: Map<string, number>
  /** The player's share in each country. */
  me: Map<string, number>
  /** Each rival's share in each country. */
  rivals: Map<string, Map<string, number>>
  /** The long tail's share in each country. */
  fringe: Map<string, number>
}

const HOME_ADVANTAGE = 3
const NEIGHBOUR_ADVANTAGE = 1.5

/** How much stronger a rival headquartered in `hq` is in country `c` than the same company far from home. */
export function homeBias(hq: string, c: string, industry: string, year: number, legacy: boolean): number {
  if (hq === c) return HOME_ADVANTAGE
  let h = 1
  const near = getCountry(hq).continent === getCountry(c).continent || sharedBloc(hq, c, year) !== null
  if (near) h = NEIGHBOUR_ADVANTAGE
  // Selling into a country from abroad: tariffs on the goods and red tape take a bite.
  const bite = Math.min(0.7, tariffOn(hq, c, year) * goodsShare(industry) * 2 + otherBarriers(c, year) * 0.3)
  h *= 1 - bite
  // State-backed incumbents barely sell outside their own sphere.
  if (legacy) h *= 0.35
  return Math.max(0.02, h)
}

/** Continent label of a country (for grouping the Regions list). */
export function continentOf(c: string): string {
  return getCountry(c).continent
}

export function regionalShares(inp: RegionalInput): Regional {
  const weights = demandWeights(inp.industry)
  const countries = [...weights.keys()].filter((c) => (weights.get(c) ?? 0) > 0)
  // Rows: the player, every rival, the tail.
  type Row = { key: string; share: number; h: (c: string) => number }
  const rows: Row[] = [
    { key: '__me', share: Math.max(0, inp.meShare), h: (c) => 0.03 + 3 * Math.max(0, inp.mePresence(c)) },
    ...inp.rivals.filter((r) => r.share > 0).map((r): Row => ({ key: r.id, share: r.share, h: (c) => homeBias(r.hq, c, inp.industry, inp.year, r.legacy) })),
    { key: '__tail', share: Math.max(0, inp.fringe), h: (c) => 1 + 0.6 * otherBarriers(c, inp.year) + (marketOf(c).easeOfBusiness < 45 ? 0.2 : 0) },
  ]
  const L = rows.map((r) => countries.map((c) => r.share * r.h(c)))
  const w = countries.map((c) => weights.get(c) ?? 0)
  for (let it = 0; it < 14; it++) {
    // Each country's shares add up to 1.
    for (let j = 0; j < countries.length; j++) {
      let tot = 0
      for (let i = 0; i < rows.length; i++) tot += L[i][j]
      if (tot > 0) for (let i = 0; i < rows.length; i++) L[i][j] /= tot
    }
    // Each company's shares, weighted by country size, add back up to its world share.
    for (let i = 0; i < rows.length; i++) {
      if (!(rows[i].share > 0)) continue
      let tot = 0
      for (let j = 0; j < countries.length; j++) tot += w[j] * L[i][j]
      if (tot > 0) for (let j = 0; j < countries.length; j++) L[i][j] *= rows[i].share / tot
    }
  }
  const me = new Map<string, number>()
  const fringe = new Map<string, number>()
  const rivals = new Map<string, Map<string, number>>()
  rows.forEach((r, i) => {
    const m = new Map<string, number>()
    countries.forEach((c, j) => m.set(c, Number.isFinite(L[i][j]) ? Math.max(0, Math.min(1, L[i][j])) : 0))
    if (r.key === '__me') m.forEach((v, c) => me.set(c, v))
    else if (r.key === '__tail') m.forEach((v, c) => fringe.set(c, v))
    else rivals.set(r.key, m)
  })
  return { weights, me, rivals, fringe }
}
