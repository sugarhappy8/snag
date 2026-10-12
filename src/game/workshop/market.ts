// Pure Workshop economics: prices, sales curves, route quotes and invention values. No RNG from
// g and no writes, so menus and talent hints use exactly the numbers the resolvers use.
import { marketOf } from '../data/markets'
import { economicRoll } from '../economy'
import { realWealthFactor } from '../history/events-people'
import type { GameState } from '../types'
import { getCountry } from '../world'
import { CATEGORIES, type IdeaDef, type Level } from './catalog'
import type { Inv, Patent, PatentScope } from './state'

/** Unit price by difficulty (constant 2026 USD, times the category's multiplier). */
export const PRICE = [0, 15, 45, 150, 500, 2000] as const
/** Peak yearly units of an average idea by difficulty (times the category's multiplier). */
export const UNITS = [0, 5000, 2800, 1600, 800, 400] as const
/** Sales multiplier by real appeal ★1-5. */
export const APPEAL = [0, 0.3, 0.6, 1, 1.7, 2.8] as const
/** The world was waiting for it: a history-race first sells like nothing else. */
export const HISTORY_BOOST = 4
/** Company margin when you make it in your own company. */
export const COMPANY_MARGIN = 0.3
/** Own-production margin by crowdfunding goal tier. */
export const CROWD_MARGIN = [0.2, 0.25, 0.3] as const
/** Crowdfunding goals as a share of the expected first-year sales. */
export const CROWD_GOAL = [0.4, 0.8, 1.3] as const
/** Investors' connections sell more units. */
export const PITCH_BOOST = 1.25
const DISCOUNT = 0.9
const MAX_YEARS = 45

/** Patent rules by country: term, filing fee (constant USD) and how well courts enforce it. */
export function patentLaw(country: string, year: number): { term: number; fee: number; enforcement: number } {
  const m = marketOf(country)
  return {
    term: country === 'us' && year < 1995 ? 17 : 20,
    fee: Math.round(1_000 + m.startupFee * 0.2 + m.gdpPerCapita * 0.02 + m.startupDays * 20),
    enforcement: 0.65 + 0.35 * (1 - m.corruption / 100),
  }
}
export const WORLD_PATENT = 6

export function patentFee(country: string, year: number, scope: PatentScope): number {
  return patentLaw(country, year).fee * (scope === 'world' ? WORLD_PATENT : 1)
}

export function patentActive(p: Patent | null, year: number): boolean {
  return !!p && p.filed <= year && p.expires > year
}

/** The lineage of a life (heirs share it), so an idea's hidden facts survive inheritance. */
export function familyOf(g: GameState): string {
  return (g.lifeId || 'life').replace(/-g\d+$/, '')
}

/** The idea's real appeal (★1-5): within one star of what people expect; history ideas are 5. Pure. */
export function trueAppeal(g: GameState, def: IdeaDef): Level {
  if (typeof def.real === 'number') return 5
  const r = economicRoll(`${familyOf(g)}|ws-appeal|${def.id}`)
  const shift = r < 0.3 ? -1 : r < 0.75 ? 0 : 1
  return Math.max(1, Math.min(5, def.a + shift)) as Level
}

export function qualityMult(q: number): number {
  return Math.pow(Math.max(0.25, Math.min(100, q) / 70), 1.5)
}

/** Bigger, richer markets later in history (1 = today). */
export function eraMarket(year: number): number {
  return 0.3 + 0.7 * realWealthFactor(year)
}

export function homeReach(country: string): number {
  const w = getCountry(country).wealth
  return 0.25 + 0.75 * Math.min(1.3, Math.max(0.05, typeof w === 'number' && Number.isFinite(w) ? w : 1))
}

/** Where it sells: the home market, plus the world with a worldwide patent (or copies without one). */
export function reachOf(scope: PatentScope | null, country: string): number {
  return homeReach(country) + (scope === 'world' ? 1.2 : scope === 'home' ? 0 : 0.15)
}

export function priceOf(def: IdeaDef): number {
  return Math.round(PRICE[def.d] * CATEGORIES[def.cat].price * 100) / 100
}

/** Expected peak yearly units (luck 1). The launch multiplies it by a hidden luck of 0.65-1.35. */
export function expectedPeak(def: IdeaDef, q: number, appeal: number, scope: PatentScope | null, country: string, year: number, history: boolean): number {
  const a = APPEAL[Math.max(1, Math.min(5, Math.round(appeal)))]
  return UNITS[def.d] * CATEGORIES[def.cat].units * a * qualityMult(q) * eraMarket(year) * reachOf(scope, country) * (history ? HISTORY_BOOST : 1)
}

export interface CurveSpec { launched: number; rise: number; plateau: number; decay: number; patent: Patent | null }

/** Share of peak sales in the t-th year on sale: a rise, a plateau, then a fade (faster with no patent). */
export function curveAt(s: CurveSpec, t: number): number {
  if (!(t >= 0)) return 0
  if (t > MAX_YEARS) return 0
  if (t < s.rise) return 0.35 + (0.65 * t) / s.rise
  if (t < s.rise + s.plateau) return 1
  let v = 1
  for (let k = s.rise + s.plateau; k <= t; k++) v *= patentActive(s.patent, s.launched + k) ? s.decay : Math.min(s.decay, 0.68)
  return v
}

/** True once an invention has left the shelves for good. */
export function curveOver(s: CurveSpec, t: number): boolean {
  return t > MAX_YEARS || (t >= s.rise + s.plateau && curveAt(s, t) < 0.04)
}

export function curveSpec(def: IdeaDef, launched: number, patent: Patent | null): CurveSpec {
  const c = CATEGORIES[def.cat]
  return { launched, rise: c.rise, plateau: c.plateau, decay: c.decay, patent }
}

/** Discounted sum of `perYear(t)` from year `from` of a curve to its end. */
export function streamValue(s: CurveSpec, from: number, perUnit: number, peak: number): number {
  let total = 0
  for (let t = Math.max(0, from); t <= MAX_YEARS; t++) {
    if (curveOver(s, t)) break
    total += peak * curveAt(s, t) * perUnit * Math.pow(DISCOUNT, t - Math.max(0, from))
  }
  return total
}

/** The licence royalty a manufacturer offers: 2.5-8%, better with quality and reputation. */
export function licenseRate(q: number, rep: number, history = false): number {
  const merit = Math.max(0, Math.min(1, (0.6 * (q - 30)) / 70 + (0.4 * rep) / 100))
  return Math.round((0.025 + 0.055 * merit + (history ? 0.02 : 0)) * 1000) / 1000
}

/** What a thing on the bench is: an idea (no patent) or a patented invention. */
export interface Subject { def: IdeaDef; q: number; patent: Patent | null; country: string; history: boolean }

/** Expected discounted licence royalties if launched this year at a given appeal. Pure. */
export function licenseValue(g: GameState, s: Subject, appeal: number, rep: number, year = g.year): number {
  const peak = expectedPeak(s.def, s.q, appeal, s.patent?.scope ?? null, s.country, year, s.history)
  return streamValue(curveSpec(s.def, year, s.patent), 0, priceOf(s.def) * licenseRate(s.q, rep, s.history), peak)
}

/** Expected discounted revenue (all sales) if launched this year. */
export function revenueValue(g: GameState, s: Subject, appeal: number, year = g.year): number {
  const peak = expectedPeak(s.def, s.q, appeal, s.patent?.scope ?? null, s.country, year, s.history)
  return streamValue(curveSpec(s.def, year, s.patent), 0, priceOf(s.def), peak)
}

/** Expected first-year sales revenue (the crowdfunding yardstick). */
export function firstYearRevenue(g: GameState, s: Subject, appeal: number): number {
  return expectedPeak(s.def, s.q, appeal, s.patent?.scope ?? null, s.country, g.year, s.history) * curveAt(curveSpec(s.def, g.year, s.patent), 0) * priceOf(s.def)
}

/** Odds investors bite on the pitch show (or at the trade fair). Pure; the resolver rolls against it. */
export function pitchOdds(g: GameState, s: Subject, appeal: number, rep: number): number {
  const c = g.character
  const x = 0.12 + (appeal - 1) * 0.12 + (s.q - 50) / 250 + c.stats.looks / 600 + c.hidden.fame / 400 + rep / 500
  return Math.round(Math.max(0.05, Math.min(0.9, x)) * 100) / 100
}

/** Fans multiply pledges. */
export function crowdFans(g: GameState): number {
  return 1 + Math.max(0, Math.min(100, g.character.hidden.fame)) / 150
}

/** Chance a crowdfunding campaign at goal tier `tier` reaches its goal (pledges ~ U[0.2, 1.8] × expected). */
export function crowdOdds(g: GameState, tier: number): number {
  const k = CROWD_GOAL[Math.max(0, Math.min(2, tier))] / crowdFans(g)
  return Math.round(Math.max(0, Math.min(1, (1.8 - k) / 1.6)) * 100) / 100
}

export function crowdGoal(g: GameState, s: Subject, appeal: number, tier: number): number {
  return Math.round(firstYearRevenue(g, s, appeal) * CROWD_GOAL[Math.max(0, Math.min(2, tier))])
}

/** Chance a funded campaign fails to deliver (cheap prototypes break in the mail). */
export function deliveryFailOdds(s: Subject): number {
  return Math.round(Math.max(0.03, Math.min(0.5, 0.38 - s.q / 250 + s.def.d * 0.03)) * 100) / 100
}

/** Sales penalty when your own products crowd the same shelves. */
export function saturation(sameCat: number, total: number): number {
  return 1 / (1 + 0.2 * Math.max(0, sameCat - 1)) / (1 + 0.08 * Math.max(0, total - 1))
}

// ---------------------------------------------------------------------------
// Launched inventions

export function invCurve(inv: Inv): CurveSpec {
  return { launched: inv.launched, rise: inv.rise, plateau: inv.plateau, decay: inv.decay, patent: inv.patent }
}

/** Personal income per unit sold (company route: none). */
export function personalPerUnit(inv: Inv): number {
  return inv.route === 'company' || inv.route === 'open' ? 0 : inv.price * inv.rate
}

/** What an invention asset is worth to its owner right now. Pure. */
export function inventionValue(g: GameState, inv: Inv, def: IdeaDef, rep: number): number {
  if (inv.stage === 'launched') {
    if (inv.route === 'company' || inv.route === 'open') return 0
    const from = g.year - inv.launched
    return Math.round(0.75 * streamValue(invCurve(inv), from, personalPerUnit(inv), inv.peak * inv.hit))
  }
  // Patented, not launched: about what a buyer would pay for the rights, at the appeal people expect.
  const s: Subject = { def, q: inv.q, patent: inv.patent, country: inv.country, history: inv.history && typeof def.real === 'number' && g.year <= def.real }
  return Math.round(Math.max(inv.legacyValue, 0.5 * licenseValue(g, s, def.a, rep)))
}
