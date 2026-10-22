// R3-G1 (H.4): what the market screens may show of a rival. A rival's quality, its technology and the quality of each product
// line are numbers the player cannot see, so in Realistic mode they read through the estimate core (knowledge/contract.ts) and
// come back as a range with a confidence; in Exact mode, and wherever a truth cannot be fogged, they are today's text.
//
//   rivalStars(g, b, r, 'quality')           the stars of a profile row: '2 stars to 4 stars', 'about 3 stars', or the exact stars
//   rivalLine(g, b, rivalId, family, q)      the number in 'Sells: Street Lighting (64)': '45 to 85', 'about 65', or '64'
//   rivalRead / lineRead                     the Estimate behind them (the band tests and the Look closer rows read these)
//   rivalTruth(g, key)                       the true value behind a riv: key, found through the companies the player owns
//
// Keys. `riv:<scope>:quality`, `riv:<scope>:tech` and `riv:<scope>:<family>:line`. The scope is a short hash of (industry, market,
// rival id), because one rival id stands for different numbers in different markets (a restaurant chain is stronger at home than
// abroad, and a fictional challenger `f41` is a different company in each market). So a report bought for a rival in one market
// never sharpens the same name in another. The family is a slug of its name (unique inside an industry, pinned by the test).
// Nothing here reads g.rng or writes the state: a read is a hashed draw (knowledge/normal.ts).
import { hashKey } from '../kernel/streams'
import { isExact, know, type Estimate } from '../knowledge/contract'
import type { GameState } from '../types'
import { marketViewOf, type RivalView } from './competition'
import { marketKey } from './competition-core'
import { shieldsOf } from './lab-state'
import { rivalLines } from './product-market'
import { businessAssets, readBiz, type BizState } from './state'
import { stars } from './util'

export type Conf = 0 | 1 | 2 | 3

/** A piece of a menu row: its text, and the confidence and age of the reading behind it (both undefined in Exact mode). */
export interface Fogged {
  text: string
  conf?: Conf
  asOf?: number
}

/** True when a screen should speak in estimates (Realistic mode). */
export function fogOn(): boolean {
  return !isExact()
}

type Market = Pick<BizState, 'industry' | 'countryId'>

/** The part of a key that names one rival in one market. */
export function rivalScope(b: Market, rivalId: string): string {
  return (hashKey(`${b.industry}|${marketKey(b)}|${rivalId}`) >>> 0).toString(36)
}

/** A product family as a key part: 'Street Lighting' is 'street-lighting'. */
export function familySlug(family: string): string {
  return family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'x'
}

export type RivalField = 'quality' | 'tech'

export const rivalKey = (b: Market, rivalId: string, what: RivalField): string => `riv:${rivalScope(b, rivalId)}:${what}`

export const lineKey = (b: Market, rivalId: string, family: string): string => `riv:${rivalScope(b, rivalId)}:${familySlug(family)}:line`

/** The product lines a rival sells in the company's market, best-selling first (a kind one of the company's patents holds is left out). */
export function rivalLinesOf(g: GameState, b: BizState, r: Pick<RivalView, 'id' | 'tier' | 'quality'>) {
  return rivalLines(r, b.industry, marketKey(b), g.year, shieldsOf(b))
}

/** The estimate of a rival's quality or technology (0 to 100). */
export function rivalRead(g: GameState, b: Market, r: RivalView, what: RivalField): Estimate {
  return know(g, rivalKey(b, r.id, what), r[what])
}

/** The estimate of a rival's quality in one product family (0 to 100). */
export function lineRead(g: GameState, b: Market, rivalId: string, family: string, quality: number): Estimate {
  return know(g, lineKey(b, rivalId, family), quality)
}

/** The stars a profile row has always shown: a real company never reads under three. */
const starsOf = (v: number, real: boolean): string => stars(real ? Math.max(3, v / 20) : v / 20)

/** A score estimate in stars: the stars at each end of the band, 'about' one number, or a word when the reading is too loose. */
function starText(e: Estimate, real: boolean): string {
  switch (e.conf) {
    case 3:
      return starsOf(e.mid, real)
    case 1: {
      const lo = starsOf(e.lo, real)
      const hi = starsOf(e.hi, real)
      if (lo !== hi) return `${lo} to ${hi}`
      return `about ${starsOf(e.mid, real)}`
    }
    case 2:
      return `about ${starsOf(e.mid, real)}`
    default:
      return e.words
  }
}

const aged = (e: Estimate): Pick<Fogged, 'asOf'> => (e.asOf !== undefined ? { asOf: e.asOf } : {})

/** A rival's quality or technology as the stars of a profile row. Exact mode: the stars of the true number. */
export function rivalStars(g: GameState, b: Market, r: RivalView, what: RivalField): Fogged {
  const e = rivalRead(g, b, r, what)
  if (e.exact) return { text: starsOf(r[what], r.real) }
  return { text: starText(e, r.real), conf: e.conf, ...aged(e) }
}

/** The quality in 'Sells: Street Lighting (64)'. Exact mode: the number itself. */
export function rivalLine(g: GameState, b: Market, rivalId: string, family: string, quality: number): Fogged {
  const e = lineRead(g, b, rivalId, family, quality)
  if (e.exact) return { text: String(quality) }
  return { text: e.words, conf: e.conf, ...aged(e) }
}

/** The weakest confidence and the oldest reading among several pieces of one row (what its chip should say). */
export function weakest(parts: readonly Fogged[]): Pick<Fogged, 'conf' | 'asOf'> {
  let conf: Conf | undefined
  let asOf: number | undefined
  for (const p of parts) {
    if (p.conf !== undefined) conf = conf === undefined ? p.conf : (Math.min(conf, p.conf) as Conf)
    if (p.asOf !== undefined) asOf = asOf === undefined ? p.asOf : Math.min(asOf, p.asOf)
  }
  return { ...(conf !== undefined ? { conf } : {}), ...(asOf !== undefined ? { asOf } : {}) }
}

/**
 * The true number behind a riv: key, found through the companies the player owns (null when none of them still meets that rival
 * in that market, or the key is not one of ours). A purchased report is paid for by key, and this is how the key finds its truth.
 */
export function rivalTruth(g: GameState, key: string): number | null {
  const p = key.split(':')
  if (p[0] !== 'riv' || (p.length !== 3 && p.length !== 4)) return null
  for (const a of businessAssets(g)) {
    const b = readBiz(g, a)
    for (const r of marketViewOf(g, b).rivals) {
      if (rivalScope(b, r.id) !== p[1]) continue
      if (p.length === 3) return p[2] === 'quality' ? r.quality : p[2] === 'tech' ? r.tech : null
      if (p[3] !== 'line') return null
      return rivalLinesOf(g, b, r).find((l) => familySlug(l.family) === p[2])?.quality ?? null
    }
  }
  return null
}
