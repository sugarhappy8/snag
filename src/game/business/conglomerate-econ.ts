// Conglomerate economics (pure: no g.rng, no state changes): which industries are related,
// the synergies a group earns (a shared back office, cross-selling between related businesses,
// purchasing power within an industry) and what sprawl costs (complexity, one-off integration,
// deal fees and the conglomerate discount on the value of unrelated businesses). The yearly step,
// the merger terms, the boards' merit and the Business talent's hints all use these functions, so
// a hint is exactly what the year will book (before the economy's own noise).
import { hasTalent } from '../talents'
import type { Industry } from '../data/markets'
import type { GameState } from '../types'
import { performance } from './board-vote'
import { SMART_SKILL } from './career'
import { marketKey } from './competition-core'
import { effectiveRegime, marketDef, mergerLimit } from './competition-data'
import { marketViewOf, shareText } from './competition'
import { localEcon } from './economy'
import { ownerProceeds } from './exit'
import { industryDef } from './industries'
import { moodOf, operatingValue, type Group, type GroupCore } from './conglomerate-state'
import type { BizState } from './state'
import { cap, clampN } from './util'

/** Years a recurring gain or cost is counted for in a deal's value (the expansion hints' yardstick). */
export const DEAL_YEARS = 5

// ---------------------------------------------------------------------------
// Related industries

type Sector = 'food' | 'hospitality' | 'leisure' | 'retail' | 'consumer' | 'services' | 'health' | 'property' | 'industry' | 'transport' | 'land' | 'tech' | 'media'

const SECTORS: Record<Industry, Sector[]> = {
  foodTruck: ['food'],
  restaurant: ['food', 'hospitality'],
  cafe: ['food', 'hospitality'],
  bakery: ['food', 'retail'],
  bar: ['food', 'hospitality', 'leisure'],
  brewery: ['food', 'industry'],
  grocery: ['food', 'retail'],
  fashion: ['retail', 'consumer'],
  beauty: ['retail', 'consumer', 'health'],
  salon: ['consumer', 'services'],
  gym: ['leisure', 'health'],
  autoShop: ['services', 'transport'],
  construction: ['property', 'industry'],
  realEstate: ['property', 'hospitality'],
  software: ['tech', 'media'],
  gameStudio: ['tech', 'media'],
  ecommerce: ['retail', 'tech'],
  marketing: ['services', 'media'],
  clinic: ['health', 'services'],
  hotel: ['hospitality', 'leisure', 'property'],
  logistics: ['transport', 'industry', 'retail'],
  manufacturing: ['industry'],
  farm: ['food', 'land'],
  energy: ['industry', 'land'],
  entertainment: ['leisure', 'media'],
  semiconductor: ['tech', 'industry'],
  aiLab: ['tech', 'media'],
  robotics: ['tech', 'industry'],
  biotech: ['health', 'tech'],
  spaceTech: ['tech', 'industry'],
  electricVehicles: ['transport', 'industry', 'tech'],
  quantum: ['tech'],
  cybersecurity: ['tech', 'services'],
}

const SECTOR_LABEL: Record<Sector, string> = {
  food: 'food & drink',
  hospitality: 'hospitality',
  leisure: 'leisure',
  retail: 'retail',
  consumer: 'consumer goods',
  services: 'services',
  health: 'health',
  property: 'property',
  industry: 'industry',
  transport: 'transport',
  land: 'land & resources',
  tech: 'technology',
  media: 'media',
}

function sectorsOf(industry: string): Sector[] {
  return SECTORS[industry as Industry] ?? ['services']
}

/** 1 for the same industry, 0.5 for related industries (a shared sector), 0 for unrelated ones. */
export function relatedness(x: string, y: string): number {
  if (x === y) return 1
  const a = sectorsOf(x)
  return sectorsOf(y).some((s) => a.includes(s)) ? 0.5 : 0
}

/** The group's sectors, biggest first ('food & drink, retail'). */
export function sectorList(industries: string[]): string {
  const seen: Sector[] = []
  for (const i of industries) {
    const s = sectorsOf(i)[0]
    if (!seen.includes(s)) seen.push(s)
  }
  return seen.map((s) => SECTOR_LABEL[s]).join(', ')
}

// ---------------------------------------------------------------------------
// A division's booked numbers

export interface DivisionInput {
  id: string
  b: BizState
  /** The group's ownership of it (weights values). */
  own: number
}

interface Numbers {
  revenue: number
  cogs: number
  /** Wages, rent and upkeep: what a shared back office trims. */
  overhead: number
  /** Net sales minus cost of goods and marketing (what extra demand earns). */
  contrib: number
}

function pos(n: number): number {
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

function numbersOf(b: BizState): Numbers {
  const s = b.last
  if (!s) return { revenue: 0, cogs: 0, overhead: 0, contrib: 0 }
  return {
    revenue: pos(s.revenue),
    cogs: pos(s.cogs),
    overhead: pos(s.wages + s.keyStaff + s.rent + Math.max(0, s.upkeep)),
    contrib: pos(s.netRevenue - s.cogs - s.marketing),
  }
}

// ---------------------------------------------------------------------------
// Synergies and complexity

/** Shared back office: up to this share of overhead saved once the group is big enough. */
export const BACK_OFFICE = 0.04
/** Cross-selling: demand lift from each related sister of at least equal size (less for smaller ones, in proportion), and the cap. */
export const CROSS_SELL = 0.03
export const CROSS_SELL_CAP = 0.08
/** Purchasing power: unit-cost cut from each same-industry sister of at least equal size (less for smaller ones, in proportion), and the cap. */
export const PURCHASING = 0.04
export const PURCHASING_CAP = 0.07
/** Complexity: share of overhead per doubling of the number of divisions (more when unrelated). */
export const COMPLEXITY = 0.012

export interface DivisionSynergy {
  id: string
  /** Overhead saved a year (dollars). */
  backOffice: number
  /** Next year's demand lift (0.03 = +3%) and what it is about worth. */
  crossSell: number
  crossSellValue: number
  /** Next year's unit-cost cut (0.04 = -4%) and what it is about worth. */
  purchasing: number
  purchasingValue: number
  /** What the group's sprawl costs this division a year (dollars). */
  complexity: number
}

export interface SynergyPlan {
  divisions: DivisionSynergy[]
  backOffice: number
  crossSellValue: number
  purchasingValue: number
  complexity: number
  /** Gains minus complexity, a year. */
  net: number
}

/**
 * A year of synergies for these divisions, with the group CEO capturing `capture` (0-1) of what
 * is there to be had. Gains need booked numbers (a division with no booked year adds nothing).
 */
export function synergyPlan(list: DivisionInput[], capture: number): SynergyPlan {
  const c = clampN(capture, 0, 1)
  const nums = list.map((x) => numbersOf(x.b))
  const n = list.length
  const empty: SynergyPlan = { divisions: list.map((x) => ({ id: x.id, backOffice: 0, crossSell: 0, crossSellValue: 0, purchasing: 0, purchasingValue: 0, complexity: 0 })), backOffice: 0, crossSellValue: 0, purchasingValue: 0, complexity: 0, net: 0 }
  if (n < 2) return empty
  // Effective number of divisions by overhead: shell companies share nothing.
  const oSum = nums.reduce((s, x) => s + x.overhead, 0)
  const oSq = nums.reduce((s, x) => s + x.overhead * x.overhead, 0)
  const nEff = oSq > 0 ? (oSum * oSum) / oSq : 1
  const boRate = BACK_OFFICE * (1 - 1 / Math.max(1, nEff)) * c
  const sprawl = Math.log2(n)
  const divisions: DivisionSynergy[] = list.map((x, i) => {
    const me = nums[i]
    let lift = 0
    let cut = 0
    let otherRev = 0
    let unrelatedRev = 0
    list.forEach((y, j) => {
      if (j === i) return
      const them = nums[j]
      const rel = relatedness(x.b.industry, y.b.industry)
      otherRev += them.revenue
      unrelatedRev += them.revenue * (1 - rel)
      // In proportion to the sister's size (up to an equal one): splitting a sister into many
      // shell companies adds nothing but complexity.
      if (rel === 1 && me.cogs > 0) cut += PURCHASING * Math.min(1, them.cogs / me.cogs)
      else if (rel === 0.5 && me.revenue > 0) lift += CROSS_SELL * Math.min(1, them.revenue / me.revenue)
    })
    lift = Math.min(CROSS_SELL_CAP, lift) * c
    cut = Math.min(PURCHASING_CAP, cut) * c
    const unrelated = otherRev > 0 ? unrelatedRev / otherRev : list.filter((y, j) => j !== i && relatedness(x.b.industry, y.b.industry) === 0).length / (n - 1)
    // A capable CEO keeps the sprawl in check (a quarter less at full capture, more when sloppy).
    const complexity = me.overhead * COMPLEXITY * sprawl * (0.4 + unrelated) * (1.25 - 0.5 * c)
    return {
      id: x.id,
      backOffice: Math.round(me.overhead * boRate),
      crossSell: Math.round(lift * 10000) / 10000,
      crossSellValue: Math.round(me.contrib * lift),
      purchasing: Math.round(cut * 10000) / 10000,
      purchasingValue: Math.round(me.cogs * cut),
      complexity: Math.round(pos(complexity)),
    }
  })
  const sum = (k: 'backOffice' | 'crossSellValue' | 'purchasingValue' | 'complexity') => divisions.reduce((s, d) => s + d[k], 0)
  const out = { divisions, backOffice: sum('backOffice'), crossSellValue: sum('crossSellValue'), purchasingValue: sum('purchasingValue'), complexity: sum('complexity'), net: 0 }
  out.net = out.backOffice + out.crossSellValue + out.purchasingValue - out.complexity
  return out
}

// ---------------------------------------------------------------------------
// The group CEO

/** How much of the available synergies a hired CEO of this skill captures (sharper above 75). */
export function captureOfSkill(skill: number): number {
  const s = clampN(skill, 0, 100)
  return s > SMART_SKILL ? clampN(0.75 + 0.25 * ((s - SMART_SKILL) / (100 - SMART_SKILL)), 0, 1) : clampN(0.3 + 0.45 * (s / SMART_SKILL), 0, 0.75)
}

/** How much the player captures chairing the group themselves (smarts; the Business talent helps). */
export function ownerCapture(g: GameState): number {
  return clampN(0.4 + 0.3 * (g.character.stats.smarts / 100) + (hasTalent(g, 'Business') ? 0.15 : 0), 0, 0.9)
}

export function captureOf(g: GameState, core: GroupCore): number {
  return core.ceo === 'manager' && core.manager ? captureOfSkill(core.manager.skill) : ownerCapture(g)
}

/** A year of a group CEO's value: the synergies they would capture, after their pay. */
export function groupCeoValue(list: DivisionInput[], skill: number, salary: number): number {
  return synergyPlan(list, captureOfSkill(skill)).net - Math.max(0, salary)
}

// ---------------------------------------------------------------------------
// The conglomerate discount

/**
 * Value-weighted share of the group's pairs of divisions that have nothing in common (0-1).
 * Related businesses (a shared sector) don't count: investors see the logic in those.
 */
export function unrelatedShare(list: DivisionInput[]): number {
  let all = 0
  let unrelated = 0
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const w = Math.max(1, list[i].own * pos(list[i].b.valuation)) * Math.max(1, list[j].own * pos(list[j].b.valuation))
      all += w
      if (relatedness(list[i].b.industry, list[j].b.industry) === 0) unrelated += w
    }
  }
  return all > 0 ? clampN(unrelated / all, 0, 1) : 0
}

/** Value-weighted performance of the divisions (-1..1: margins and growth, as the boards see it). */
export function groupPerformance(list: DivisionInput[]): number {
  let w = 0
  let p = 0
  for (const x of list) {
    const v = Math.max(1, x.own * pos(x.b.valuation))
    w += v
    p += v * performance(x.b)
  }
  return w > 0 ? clampN(p / w, -1, 1) : 0
}

/**
 * The conglomerate discount investors apply to the operating value of a sprawling group of
 * unrelated businesses: up to 15% (more when the divisions struggle), none for a focused group or
 * one whose results are strong enough to silence the doubters.
 */
export function conglomerateDiscount(list: DivisionInput[]): number {
  if (list.length < 2) return 0
  const u = unrelatedShare(list)
  const sprawl = Math.min(1, (list.length - 1) / 3)
  const perf = groupPerformance(list)
  const d = 0.15 * u * sprawl * (1 - 1.5 * Math.max(0, perf)) + 0.05 * u * Math.max(0, -perf)
  return Math.round(clampN(d, 0, 0.2) * 1000) / 1000
}

/** The discount in dollars on these divisions' operating value. */
export function discountDollars(list: DivisionInput[]): number {
  const ev = list.reduce((s, x) => s + x.own * operatingValue(x.b), 0)
  return Math.round(conglomerateDiscount(list) * ev)
}

// ---------------------------------------------------------------------------
// Deals

function priceLevel(b: BizState): number {
  return clampN(localEcon(b.industry, b.countryId, b.city).level, 0.2, 2.4)
}

/** Bankers' and lawyers' fees for taking a company into (or out of) a group. */
export function dealFee(b: BizState): number {
  const v = Math.max(25_000 * priceLevel(b), 0.012 * pos(b.valuation))
  return Math.round(v)
}

/** Spinning a division off: lawyers, separation and (for a listed group) its own listing. */
export function spinOffFee(b: BizState, listed: boolean): number {
  return Math.round(dealFee(b) * (listed ? 1.5 : 1))
}

/** One-off cost of folding a company into the group (systems, branding, the back office). */
export function integrationCost(b: BizState): number {
  const x = numbersOf(b)
  const v = Math.max(15_000 * priceLevel(b), 0.012 * x.revenue + 0.04 * x.overhead, x.revenue <= 0 ? 0.01 * pos(b.valuation) : 0)
  return Math.round(v)
}

/** What a company's owner holds of it at fair value (after any investors' preference). */
export function ownerFairValue(b: BizState): number {
  const v = pos(b.valuation)
  return b.public ? v * b.share : ownerProceeds(b, v)
}

/** Antitrust: why regulators would block bringing these companies together (null: they won't). */
export function antitrustBlock(g: GameState, list: BizState[]): string | null {
  const byMarket = new Map<string, BizState[]>()
  for (const b of list) {
    const k = `${b.industry}|${marketKey(b)}`
    byMarket.set(k, [...(byMarket.get(k) ?? []), b])
  }
  for (const same of byMarket.values()) {
    if (same.length < 2) continue
    const combined = same.reduce((s, b) => s + marketViewOf(g, b).share, 0)
    const lead = same[0]
    const regime = effectiveRegime(lead.countryId, g.year, marketDef(lead.industry).scope === 'world')
    if (regime.strict >= 0.25 && combined >= mergerLimit(regime)) {
      return `${cap(regime.name)} would block it: together your ${industryDef(lead.industry).label.toLowerCase()} businesses would hold ${shareText(combined)} of the market.`
    }
  }
  return null
}

/**
 * Antitrust on a division's acquisition looks at the whole group: sister divisions selling in the
 * same market count toward the combined share (null: regulators would allow it). Pure.
 */
export function groupAcquireBlock(g: GameState, b: BizState, sisters: BizState[], rivalShare: number): string | null {
  const key = marketKey(b)
  const same = sisters.filter((s) => s.industry === b.industry && marketKey(s) === key)
  if (!same.length) return null
  const combined = Math.min(1, marketViewOf(g, b).share + Math.max(0, rivalShare) + same.reduce((s, x) => s + marketViewOf(g, x).share, 0))
  const regime = effectiveRegime(b.countryId, g.year, marketDef(b.industry).scope === 'world')
  if (regime.strict >= 0.25 && combined >= mergerLimit(regime)) {
    return `${cap(regime.name)} would block it: with your other ${industryDef(b.industry).label.toLowerCase()} businesses, the group would hold ${shareText(combined)} of the market.`
  }
  return null
}

export interface MergeTerms {
  /** The player's share of the group afterwards. */
  share: number
  /** Value the player brings and the group's total, before the deal. */
  playerValue: number
  total: number
  /** Fees per joining company. */
  fees: { id: string; fee: number }[]
  feeTotal: number
}

/**
 * The player's share of the group after `joiners` come in at fair value: every holder gets group
 * shares worth what they held (investors' preferences included), so the player's share is
 * value-weighted. `base` is the existing group (its value and the player's share of it), if any.
 */
export function mergeTerms(base: { value: number; share: number } | null, joiners: { id: string; b: BizState }[]): MergeTerms {
  let total = base ? pos(base.value) : 0
  let mine = base ? pos(base.value) * clampN(base.share, 0, 1) : 0
  for (const j of joiners) {
    total += pos(j.b.valuation)
    mine += ownerFairValue(j.b)
  }
  // Nothing is worth anything yet (brand-new companies): an even split of the stakes.
  const parts = [...(base ? [base.share] : []), ...joiners.map((j) => j.b.share)]
  const fallback = parts.length ? parts.reduce((s, x) => s + x, 0) / parts.length : 1
  const share = total > 0 ? clampN(mine / total, 0.001, 1) : clampN(fallback, 0.001, 1)
  const fees = joiners.map((j) => ({ id: j.id, fee: dealFee(j.b) }))
  return { share: Math.round(share * 1e6) / 1e6, playerValue: Math.round(mine), total: Math.round(total), fees, feeTotal: fees.reduce((s, f) => s + f.fee, 0) }
}

// ---------------------------------------------------------------------------
// What a deal is worth (the boards' merit and the Business talent's hints)

export interface DealValue {
  /** Net synergies a year, after complexity. */
  yearly: number
  /** Change in the conglomerate discount, in dollars (positive: value lost to it). */
  discount: number
  /** One-off fees and integration. */
  oneOff: number
  /** Over DEAL_YEARS: yearly gains, minus the discount and the one-off costs (all shareholders). */
  value: number
}

function inputs(grp: Group): DivisionInput[] {
  return grp.members.map((x) => ({ id: x.a.id, b: x.b, own: x.m.own }))
}

/** What bringing these companies into the group (or forming one, when grp is null) is worth. */
export function joinValue(_g: GameState, grp: Group | null, joiners: { id: string; b: BizState }[], capture: number): DealValue {
  const before = grp ? inputs(grp) : []
  const after = [...before, ...joiners.map((j) => ({ id: j.id, b: j.b, own: 1 }))]
  const yearly = synergyPlan(after, capture).net - (before.length >= 2 ? synergyPlan(before, capture).net : 0)
  // A listed group's discount is priced at the market's mood (what the merger actually books).
  const mood = grp ? moodOf(grp.core) : 1
  const discount = Math.round(mood * (discountDollars(after) - (before.length >= 2 ? discountDollars(before) : 0)))
  const oneOff = joiners.reduce((s, j) => s + dealFee(j.b) + integrationCost(j.b), 0)
  return { yearly: Math.round(yearly), discount, oneOff, value: Math.round(DEAL_YEARS * yearly - discount - oneOff) }
}

/** What spinning a division off is worth: the discount it unlocks, the synergies it loses, the fees. */
export function spinValue(_g: GameState, grp: Group, id: string, capture: number): DealValue {
  const all = inputs(grp)
  const rest = all.filter((x) => x.id !== id)
  const leaving = all.find((x) => x.id === id)
  const yearly = (rest.length >= 2 ? synergyPlan(rest, capture).net : 0) - synergyPlan(all, capture).net
  const discount = Math.round(moodOf(grp.core) * ((rest.length >= 2 ? discountDollars(rest) : 0) - discountDollars(all)))
  const oneOff = leaving ? spinOffFee(leaving.b, !!grp.core.listing) : 0
  return { yearly: Math.round(yearly), discount, oneOff, value: Math.round(DEAL_YEARS * yearly - discount - oneOff) }
}

/** A deal's value as the merit directors weigh (about -3..3: value per dollar of the combined company). */
export function dealMerit(value: number, total: number): number {
  return Math.round(clampN((5 * value) / Math.max(1, total), -3, 3) * 100) / 100
}
