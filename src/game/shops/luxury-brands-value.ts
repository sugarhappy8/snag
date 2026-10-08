// How brand pieces keep (or lose) their value: one table of value classes, the used-market curve,
// the yearly market step, condition, service, insurance, theft, counterfeit odds and the auction
// room's fees. The model is deliberately one-sided against flipping: you buy at a retail markup,
// the next owner pays the market, and a dealer or auction takes a cut, so a buy-sell loop always
// loses money after fees and spreads, and appreciation is capped per class.
//
// Per-asset state (plain JSON, Asset.details): mkt = market value of a mint example, basis =
// the pre-tax price the value is anchored to, cls, boughtYear, used, auth ('unknown' | 'verified'
// | 'fake'), lfake (the hidden truth), serviced (year), luxIns (policy). Asset.value is the
// quick-sale value: market value x condition x the dealer's spread, so net worth is what you
// could really raise, and the Assets tab's own sell offers can't beat the auction room.
import { nicePrice, seeded } from '../assets'
import { bell, chance } from '../rng'
import { hasTech, PRESENT_YEAR } from '../history/timeline'
import type { Asset, GameState } from '../types'
import type { LuxLine, ValClass } from './luxury-brands-types'
import { eraMult, lineById } from './luxury-brands-catalog'
import { num, str } from './luxury-common'

export type Channel = 'boutique' | 'preowned' | 'gray' | 'auction'

export interface ClassDef {
  label: string
  /** Market value of a new piece right after you buy it, as a share of the pre-tax price. */
  instant: number
  /** Yearly change in market value: [year 1, years 2-5, year 6+]. */
  trend: [number, number, number]
  /** Yearly noise (the class's market mood each year is +/- 0.8 of this). */
  sigma: number
  /** Value never falls below this share of the basis for a real piece. */
  floor: number
  /** Lifetime cap on market value as a share of the basis: appreciation is bounded. */
  cap: number
  /** Condition lost each year [min, max]. */
  wear: [number, number]
  /** Years between services (0 = no regular service). */
  service: number
  /** Cost of a service as a share of market value. */
  serviceCost: number
  /** Yearly chance a portable piece is stolen or lost. */
  theft: number
  /** Share of gray-market (street, online, back-room) pieces that are counterfeit; 0 = no gray market. */
  gray: number
  /** Share of dealer and auction pieces that are counterfeit or misdescribed. */
  dealerFake: number
  /** What a dealer pays for it, as a share of market value. */
  spread: number
  /** Insurance premium as a share of market value a year. */
  insure: number
  /** Running costs a year (storage, fuel, hangar, docking) as a share of market value. */
  upkeep: number
}

export const CLASSES: Record<ValClass, ClassDef> = {
  'budget-watch': { label: 'an everyday watch', instant: 0.85, trend: [-0.08, -0.03, -0.015], sigma: 0.03, floor: 0.2, cap: 1.3, wear: [1, 3], service: 6, serviceCost: 0.12, theft: 0.012, gray: 0.25, dealerFake: 0.01, spread: 0.65, insure: 0.012, upkeep: 0 },
  watch: { label: 'a luxury watch', instant: 0.92, trend: [-0.05, -0.02, 0], sigma: 0.04, floor: 0.35, cap: 1.9, wear: [1, 2], service: 6, serviceCost: 0.04, theft: 0.012, gray: 0.3, dealerFake: 0.02, spread: 0.78, insure: 0.012, upkeep: 0 },
  'icon-watch': { label: 'an icon of watchmaking', instant: 1, trend: [0.01, 0.04, 0.03], sigma: 0.07, floor: 0.6, cap: 6, wear: [1, 2], service: 7, serviceCost: 0.035, theft: 0.015, gray: 0.38, dealerFake: 0.03, spread: 0.84, insure: 0.014, upkeep: 0 },
  fashion: { label: 'fashion', instant: 0.6, trend: [-0.2, -0.1, -0.05], sigma: 0.04, floor: 0.05, cap: 1, wear: [4, 9], service: 0, serviceCost: 0, theft: 0.008, gray: 0.28, dealerFake: 0.02, spread: 0.5, insure: 0.008, upkeep: 0 },
  bag: { label: 'a designer bag', instant: 0.85, trend: [-0.05, -0.03, -0.02], sigma: 0.04, floor: 0.3, cap: 1.25, wear: [2, 5], service: 0, serviceCost: 0, theft: 0.015, gray: 0.35, dealerFake: 0.02, spread: 0.7, insure: 0.01, upkeep: 0 },
  'icon-bag': { label: 'an icon of leather goods', instant: 1, trend: [0.01, 0.045, 0.03], sigma: 0.06, floor: 0.6, cap: 4, wear: [1, 3], service: 0, serviceCost: 0, theft: 0.015, gray: 0.42, dealerFake: 0.03, spread: 0.8, insure: 0.012, upkeep: 0 },
  jewel: { label: 'jewelry', instant: 0.7, trend: [-0.01, 0, 0.01], sigma: 0.03, floor: 0.4, cap: 1.5, wear: [0, 1], service: 0, serviceCost: 0, theft: 0.015, gray: 0.22, dealerFake: 0.02, spread: 0.65, insure: 0.02, upkeep: 0 },
  sneaker: { label: 'sneakers', instant: 0.7, trend: [-0.15, -0.1, -0.05], sigma: 0.05, floor: 0.1, cap: 1, wear: [5, 10], service: 0, serviceCost: 0, theft: 0.006, gray: 0.4, dealerFake: 0.03, spread: 0.6, insure: 0.01, upkeep: 0 },
  'grail-sneaker': { label: 'a collector sneaker', instant: 1.1, trend: [0, 0.05, 0.04], sigma: 0.15, floor: 0.2, cap: 5, wear: [2, 5], service: 0, serviceCost: 0, theft: 0.006, gray: 0.5, dealerFake: 0.04, spread: 0.75, insure: 0.012, upkeep: 0 },
  pen: { label: 'a fine pen', instant: 0.8, trend: [-0.02, -0.01, 0], sigma: 0.02, floor: 0.4, cap: 1.3, wear: [0, 1], service: 0, serviceCost: 0, theft: 0.008, gray: 0, dealerFake: 0.03, spread: 0.65, insure: 0.01, upkeep: 0 },
  fine: { label: 'a fine object', instant: 0.75, trend: [-0.03, -0.01, 0], sigma: 0.03, floor: 0.35, cap: 1.5, wear: [0, 2], service: 0, serviceCost: 0, theft: 0.006, gray: 0, dealerFake: 0.03, spread: 0.6, insure: 0.012, upkeep: 0 },
  tech: { label: 'a gadget', instant: 0.6, trend: [-0.3, -0.2, -0.1], sigma: 0.03, floor: 0.03, cap: 1, wear: [3, 8], service: 0, serviceCost: 0, theft: 0.01, gray: 0, dealerFake: 0.01, spread: 0.5, insure: 0.015, upkeep: 0 },
  car: { label: 'a luxury car', instant: 0.88, trend: [-0.14, -0.08, -0.04], sigma: 0.05, floor: 0.12, cap: 1.1, wear: [2, 6], service: 1, serviceCost: 0.01, theft: 0.006, gray: 0, dealerFake: 0.01, spread: 0.85, insure: 0.035, upkeep: 0.02 },
  'car-collector': { label: 'a collector car', instant: 0.95, trend: [-0.03, 0.03, 0.04], sigma: 0.08, floor: 0.35, cap: 8, wear: [1, 3], service: 1, serviceCost: 0.012, theft: 0.004, gray: 0, dealerFake: 0.06, spread: 0.88, insure: 0.008, upkeep: 0.012 },
  moto: { label: 'a motorcycle', instant: 0.86, trend: [-0.12, -0.07, -0.04], sigma: 0.05, floor: 0.12, cap: 1.1, wear: [2, 5], service: 1, serviceCost: 0.02, theft: 0.01, gray: 0, dealerFake: 0.01, spread: 0.82, insure: 0.04, upkeep: 0.025 },
  boat: { label: 'a boat', instant: 0.82, trend: [-0.1, -0.07, -0.05], sigma: 0.05, floor: 0.1, cap: 1.1, wear: [2, 5], service: 1, serviceCost: 0.02, theft: 0.003, gray: 0, dealerFake: 0.01, spread: 0.78, insure: 0.02, upkeep: 0.06 },
  air: { label: 'an aircraft', instant: 0.88, trend: [-0.07, -0.05, -0.04], sigma: 0.04, floor: 0.12, cap: 1.1, wear: [2, 4], service: 1, serviceCost: 0.025, theft: 0.001, gray: 0, dealerFake: 0.01, spread: 0.8, insure: 0.025, upkeep: 0.05 },
  wine: { label: 'fine wine', instant: 1, trend: [0.05, 0.05, 0.01], sigma: 0.05, floor: 0.4, cap: 6, wear: [0, 1], service: 0, serviceCost: 0, theft: 0.002, gray: 0, dealerFake: 0.05, spread: 0.85, insure: 0.008, upkeep: 0.004 },
  spirit: { label: 'fine spirits', instant: 1, trend: [0.02, 0.02, 0.015], sigma: 0.04, floor: 0.6, cap: 2.5, wear: [0, 1], service: 0, serviceCost: 0, theft: 0.002, gray: 0, dealerFake: 0.04, spread: 0.8, insure: 0.008, upkeep: 0.003 },
  art: { label: 'art', instant: 0.9, trend: [0.01, 0.02, 0.02], sigma: 0.12, floor: 0.15, cap: 5, wear: [0, 1], service: 0, serviceCost: 0, theft: 0.002, gray: 0, dealerFake: 0.04, spread: 0.85, insure: 0.012, upkeep: 0 },
}

export function def(cls: string): ClassDef {
  return CLASSES[cls as ValClass] ?? CLASSES.watch
}

/** The share of a counterfeit's value relative to the real thing (a fake is nearly worthless). */
export const FAKE_VALUE = 0.04

/** Odds a piece from this channel is a fake, from the real model (hints show exactly this). */
export function fakeOdds(g: GameState, cls: string, channel: Channel, year = g.year): number {
  const d = def(cls)
  if (channel === 'boutique') return 0
  let p = channel === 'gray' ? d.gray : channel === 'auction' ? d.dealerFake * 0.6 : d.dealerFake
  if (channel === 'gray') {
    if (year < 1970) p *= 0.7
    else if (hasTech(g, 'onlineShopping', year)) p *= 1.15
  }
  return Math.min(0.6, Math.max(0, p))
}

export function conditionFactor(condition: number): number {
  return 0.5 + 0.5 * Math.max(0, Math.min(100, condition)) / 100
}

// ---------------------------------------------------------------------------
// The value curve

function yearTrend(cls: string, k: number, peak?: number): number {
  const d = def(cls)
  if (cls === 'wine' && peak) return k <= peak ? 0.05 : k <= peak * 1.6 ? 0.01 : -0.05
  if (cls === 'spirit' && peak) return k <= peak ? 0.025 : 0.012
  return k <= 1 ? d.trend[0] : k <= 5 ? d.trend[1] : d.trend[2]
}

/** Market value of a piece of `age` years as a share of its new price: instant x the trend of each year. */
export function curveRatio(cls: string, age: number, peak?: number): number {
  const d = def(cls)
  let r = d.instant
  for (let k = 1; k <= Math.min(80, Math.max(0, Math.round(age))); k++) r *= 1 + yearTrend(cls, k, peak)
  return Math.max(d.floor * 0.9, Math.min(d.cap, r))
}

/** The extra premium allocation-only pieces fetch in the secondary market (bounded at 10%). */
export function scarcePremium(cls: string): number {
  // Small enough that selling a freshly allocated piece through the auction room (commission and
  // costs) never beats the retail price you paid: asking for an allocation is not a business.
  return cls === 'icon-watch' || cls === 'icon-bag' ? 0.1 : cls === 'grail-sneaker' ? 0.04 : 0.08
}

/** A limited, collector-grade line with a quoted value today: price path from its new price to `collect`. */
export function collectRef(l: LuxLine, year: number): number {
  const start = l.usd
  const end = l.collect ?? start
  if (year <= l.from) return start
  if (year >= PRESENT_YEAR) return end * Math.min(1.5, 1 + 0.02 * (year - PRESENT_YEAR))
  return start * Math.pow(end / start, (year - l.from) / (PRESENT_YEAR - l.from))
}

/** Market value (mint) of a used example of this line, `age` years old, in `year`. */
export function usedMarket(l: LuxLine, year: number, age: number, variantMult = 1): number {
  if (l.collect !== undefined) return collectRef(l, year) * variantMult
  const newPrice = l.usd * eraMult(l, Math.min(year, l.until ?? year)) * variantMult
  return newPrice * curveRatio(l.cls, age, l.peak)
}

/** The class's market mood this year: the same for every player (so hints about it are honest). */
export function classMood(cls: string, year: number): number {
  const r = seeded(`lux.mood|${cls}|${year}`)
  return r.float(-1, 1) * def(cls).sigma * 0.8
}

// ---------------------------------------------------------------------------
// Reading and writing a piece

export function isLux(a: Asset): boolean {
  return a.details.lux === 1
}

export function lineOf(a: Asset): LuxLine | undefined {
  return lineById(str(a.details.line))
}

export function mktOf(a: Asset): number {
  return Math.max(1, num(a.details.mkt, a.value))
}

export function isFake(a: Asset): boolean {
  return a.details.lfake === true
}

/** What the player has found out about authenticity: 'unknown' until it is checked. */
export function authOf(a: Asset): 'unknown' | 'verified' | 'fake' {
  const v = a.details.auth
  return v === 'verified' || v === 'fake' ? v : 'unknown'
}

/** Quick-sale value of a piece given its market value and condition. */
export function quickValue(a: Asset, mkt = mktOf(a)): number {
  const d = def(str(a.details.cls))
  // Until it is checked, a piece from a seller who can't vouch for it is priced for the risk that
  // it is a copy (the same for a real one and a fake one, so the number never gives it away).
  const doubt = authOf(a) === 'unknown' ? Math.min(0.6, Math.max(0, num(a.details.fo))) * (1 - FAKE_VALUE) : 0
  return Math.max(1, Math.round(mkt * conditionFactor(a.condition) * d.spread * (1 - doubt)))
}

/** Market value of the piece as it stands (mint market x condition), before any dealer spread. */
export function marketValue(a: Asset): number {
  return Math.max(1, Math.round(mktOf(a) * conditionFactor(a.condition)))
}

/** Keep Asset.value in step with the market value and condition. */
export function syncValue(a: Asset): void {
  a.value = quickValue(a)
}

/** Yearly change of the market value of one piece (uses g's RNG for the piece's own luck). */
export function stepMarket(g: GameState, a: Asset): void {
  const d = a.details
  const cls = str(d.cls)
  const cd = def(cls)
  const l = lineOf(a)
  if (isFake(a) && authOf(a) === 'fake') return
  const basis = Math.max(1, num(d.basis, a.purchasePrice))
  let mkt = mktOf(a)
  const luck = (bell(g, -100, 100) / 100) * cd.sigma * 0.6
  if (isFake(a)) {
    // A fake still "tracks" the genuine piece it imitates in the owner's eyes until someone checks.
    mkt *= 1 + yearTrend(cls, Math.max(1, g.year - num(d.boughtYear, g.year))) + classMood(cls, g.year) + luck
  } else if (l && l.collect !== undefined) {
    // A quoted classic follows the line's price path; its own luck stays within a band around it.
    const prev = collectRef(l, g.year - 1)
    const now = collectRef(l, g.year)
    mkt *= (prev > 0 ? now / prev : 1) * (1 + luck * 0.6 + classMood(cls, g.year) * 0.5)
    d.mkt = Math.round(Math.max(now * 0.6, Math.min(now * 1.5, mkt)))
    syncValue(a)
    return
  } else {
    const owned = Math.max(1, g.year - num(d.boughtYear, g.year))
    const age = num(d.used) === 1 ? owned + 5 : owned
    mkt *= 1 + yearTrend(cls, age, l?.peak) + classMood(cls, g.year) + luck
  }
  d.mkt = Math.round(Math.max(basis * cd.floor, Math.min(basis * cd.cap, mkt)))
  syncValue(a)
}

/** What the Business talent sees: the typical value of a purchase after `years` as a share of its price. */
export function holdOutlook(cls: string, years: number, scarce = false, peak?: number): { typical: number; low: number; high: number } {
  const d = def(cls)
  const start = curveRatio(cls, 0) * (scarce ? 1 + scarcePremium(cls) : 1)
  let r = start
  for (let k = 1; k <= years; k++) r *= 1 + yearTrend(cls, k, peak)
  const spread = d.sigma * Math.sqrt(years)
  const cap = (x: number) => Math.max(d.floor, Math.min(d.cap, x))
  return { typical: cap(r), low: cap(r * (1 - spread)), high: cap(r * (1 + spread)) }
}

// ---------------------------------------------------------------------------
// Service, insurance, authentication, theft

export function serviceDue(g: GameState, a: Asset): boolean {
  const d = def(str(a.details.cls))
  if (d.service <= 0) return false
  return g.year - num(a.details.serviced, num(a.details.boughtYear, g.year)) >= d.service
}

export function serviceCost(a: Asset, labor: number): number {
  const cls = str(a.details.cls)
  const d = def(cls)
  const mv = marketValue(a)
  // A specialist's bill grows with the car, but a priceless one doesn't need a priceless mechanic.
  const cap = cls === 'car' || cls === 'car-collector' || cls === 'moto' ? 15_000 + mv * 0.002 : Infinity
  let cost = Math.max(60, Math.min(cap, mv * (d.serviceCost || 0.01)))
  // Things that change hands on the gray market: bringing a worn piece back from the brink costs
  // about what the restoration adds to its value, so "buy it scruffy, restore it, resell it" is never a trade.
  if (d.gray > 0) {
    const pts = Math.max(0, Math.min(100, a.condition + 45) - a.condition)
    cost = Math.max(cost, mktOf(a) * 0.005 * pts * 0.92)
  }
  return nicePrice(cost * labor)
}

export function authCost(a: Asset, labor: number): number {
  return nicePrice(Math.max(60, marketValue(a) * 0.015) * labor)
}

export function insurePremium(a: Asset): number {
  const d = def(str(a.details.cls))
  return nicePrice(Math.max(40, marketValue(a) * d.insure))
}

export function deductibleOf(a: Asset): number {
  return nicePrice(Math.max(50, marketValue(a) * 0.05))
}

/** Part of the loss an insurer pays: market value minus the deductible, nothing for a counterfeit. */
export function claimPayout(a: Asset): number {
  if (isFake(a)) return 0
  return Math.max(0, marketValue(a) - deductibleOf(a))
}

export function runningCost(a: Asset): number {
  const cls = str(a.details.cls)
  const d = def(cls)
  if (d.upkeep <= 0) return 0
  const mv = marketValue(a)
  // A garage costs what a garage costs: past a point a priceless car doesn't need more servicing.
  const cap = cls === 'car' || cls === 'car-collector' || cls === 'moto' ? 20_000 + mv * 0.003 : Infinity
  return nicePrice(Math.max(100, Math.min(cap, mv * d.upkeep)))
}

/** Yearly chance this piece is stolen or lost; sturdier things and cars in a garage are safer. */
export function theftOdds(a: Asset): number {
  return def(str(a.details.cls)).theft
}

// ---------------------------------------------------------------------------
// Auction room

export interface AuctionTerms {
  /** Seller's commission as a share of the hammer price. */
  commission: number
  /** Photography, catalogue, shipping and insurance as a share of market value. */
  fixed: number
  /** Chance the lot is bought in (unsold). */
  unsold: number
}

/** Terms by lot size: the big houses charge less on big lots; every lot costs something. */
export function auctionTerms(a: Asset): AuctionTerms {
  const v = marketValue(a)
  return { commission: v >= 1_000_000 ? 0.08 : v >= 50_000 ? 0.1 : 0.13, fixed: 0.015, unsold: 0.12 }
}

/** The hammer price as a share of market value: 1 on average, never below 0.7 or above 1.35. */
export function hammerFactor(g: GameState, cls: string, year: number): number {
  const mood = classMood(cls, year) * 1.5
  const luck = bell(g, -100, 100) / 100
  return Math.max(0.7, Math.min(1.35, 1 + mood + luck * 0.16))
}

/** Expected net proceeds at auction: market x (1 - commission - fixed) x (1 - unsold chance)... shown as a typical figure. */
export function auctionTypical(a: Asset): number {
  const t = auctionTerms(a)
  return Math.round(marketValue(a) * (1 - t.commission - t.fixed))
}

/** Roll one auction: sold at a hammer price (the buyer's premium is the buyer's business) or bought in. */
export function runAuction(g: GameState, a: Asset): { sold: boolean; hammer: number; net: number; fees: number } {
  const t = auctionTerms(a)
  const mv = marketValue(a)
  const fixedFee = Math.round(mv * t.fixed)
  if (chance(g, t.unsold)) return { sold: false, hammer: 0, net: -fixedFee, fees: fixedFee }
  const hammer = Math.round(mv * hammerFactor(g, str(a.details.cls), g.year))
  const fees = Math.round(hammer * t.commission) + fixedFee
  return { sold: true, hammer, net: hammer - fees, fees }
}

/** What a dealer pays for the piece right now (the spread): the quick-sale value. */
export function dealerOffer(a: Asset): number {
  return quickValue(a)
}

/** What the Business talent sees about a piece you own: its typical value in `years` as a share of today's market value. */
export function outlookFrom(cls: string, ownedYears: number, years: number, peak?: number): { typical: number; low: number; high: number } {
  const d = def(cls)
  let r = 1
  for (let k = 1; k <= years; k++) r *= 1 + yearTrend(cls, Math.max(1, ownedYears) + k, peak)
  const spread = d.sigma * Math.sqrt(years)
  return { typical: r, low: r * (1 - spread), high: r * (1 + spread) }
}
