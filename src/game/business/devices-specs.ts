// Ecosystem companies: spec sheets. For each kind of hardware a device company sells, its best line is set against the rivals that sell
// that kind this year, on performance, quality and price. A pure read: nothing is written, no random number is drawn, and no row names
// a rival (their figures are the market's, modeled from the same seeded reads the Products screen and Silicon 2.0 use).
import type { GameState } from '../types'
import type { MarketCtx } from './competition-core'
import { familyId } from './competition-roster'
import { chipTerms, devicePerf, HARDWARE_FAMILIES, kindReference, LINE_PRICE, MARKET_YIELD, marketNode } from './devices-data'
import { localEcon } from './economy'
import { effectiveQuality, fieldFor, infoOf } from './product-market'
import { scoreRow, scoreText, type ScoreRow } from './scorecard'
import { rivalPriceIndex } from './silicon'
import type { BizState, Product } from './state'
import { clampN, money } from './util'

/** One kind of hardware: the company's best line of it and where that line stands. */
export interface DeviceSpec {
  family: string
  /** The name of the best line. */
  line: string
  perf: ScoreRow
  quality: ScoreRow
  /** Negated, so the cheapest ranks first: print it through `specLines` or with an absolute value. */
  price: ScoreRow
}

/** The best line of a kind: the highest effective quality, then the later launch, then the name. Bundles and add-ons sell no hardware. */
function bestLine(b: BizState, family: string, year: number): { p: Product; kind: string; q: number } | null {
  let best: { p: Product; kind: string; q: number } | null = null
  for (const p of b.products) {
    const info = infoOf(p, b.industry)
    if (info.family !== family || info.kind === 'bundle' || info.kind === 'addon') continue
    const q = effectiveQuality(p, b.industry, year)
    if (!Number.isFinite(q)) continue
    if (!best || q > best.q || (q === best.q && (p.launched > best.p.launched || (p.launched === best.p.launched && p.name < best.p.name)))) best = { p, kind: info.kind, q }
  }
  return best
}

/** A move under half a percent reads as flat, as half a point does on the 0 to 100 score rows. */
function steady(mine: number, prior: number): number {
  return Math.abs(prior - mine) <= 0.005 * Math.abs(mine) ? mine : prior
}

/** One sheet per kind of hardware the company has a line of, in the order the kinds opened. The platform and a breakthrough get none. */
export function specSheet(g: GameState, b: BizState, year: number, ctx: MarketCtx): DeviceSpec[] {
  if (b.industry !== 'devices') return []
  const going = localEcon(b.industry, b.countryId, b.city).goingPrice
  // How far the company's own price sits from the going one. A price that can't be read counts as the going price.
  const ratio = going > 0 && Number.isFinite(b.price) && b.price > 0 ? b.price / going : 1
  const fam = familyId(g.lifeId)
  const field = fieldFor(ctx)
  const out: DeviceSpec[] = []
  for (const family of HARDWARE_FAMILIES) {
    const best = bestLine(b, family, year)
    if (!best) continue
    // The same line in a year: its quality (it ages), the chips it gets and the going price of its kind.
    const at = (y: number) => {
      const q = effectiveQuality(best.p, b.industry, y)
      const t = chipTerms(b, y)
      return { q, perf: devicePerf(q, t.node, t.yield), price: kindReference(family, y) * ratio * (LINE_PRICE[best.kind] ?? 1) }
    }
    const now = at(year)
    const then = best.p.launched >= year ? now : at(year - 1)
    // The rivals that sell this kind and take customers: the same rule the Products screen uses for who a line beats.
    const versions = field.versions(family)
    const sellers = ctx.rivals.flatMap((r, i) => ((versions[i] ?? -1) >= 0 && r.pull > 0 && !r.legacy ? [{ r, v: versions[i] }] : []))
    const reference = kindReference(family, year)
    // Rivals buy chips on the open market, so their speed moves with the market's node and their own tech.
    const perf = sellers.map(({ r, v }) => clampN(devicePerf(v, marketNode(year), MARKET_YIELD) + Math.round((r.tech - 55) / 6), 0, 100))
    const quality = sellers.map(({ v }) => v)
    const price = sellers.map(({ r }) => -reference * rivalPriceIndex(fam, r, year))
    out.push({
      family,
      line: best.p.name,
      perf: scoreRow('perf', 'Performance', 'score', now.perf, perf, then.perf),
      quality: scoreRow('quality', 'Quality', 'score', now.q, quality, then.q),
      price: scoreRow('price', 'Price', 'usd', -now.price, price, -steady(now.price, then.price)),
    })
  }
  return out
}

/** The three plain lines of a sheet: performance, quality, then price in dollars. */
export function specLines(s: DeviceSpec): string[] {
  return [scoreText(s.perf), scoreText(s.quality), scoreText(s.price, (n) => money(Math.abs(n)))]
}
