// Founding a deep-tech company: who has the background to start one (or needs a technical
// co-founder or a hired expert), the seed round on offer in this market, the starting state of
// the lab, and the Business talent's pick of the best industries to start in.
import { count } from '../core'
import { INDUSTRY_IDS, isIndustryLegal, marketOf, type Industry } from '../data/markets'
import { bell, chance, rand, uid } from '../rng'
import { hasTalent } from '../talents'
import type { GameState } from '../types'
import { getCountry, randomFirstName, randomLastName } from '../world'
import { localEcon, localPay } from './economy'
import { DEEP_TECH, DRUG_AREAS, drugName, vcDepth } from './deeptech-data'
import { ecosystem, founderSkill, hasBackground, rdScale } from './deeptech-core'
import { isDeepTechIndustry, readTech, type DeepTechIndustry, type TechState } from './deeptech-state'
import { industryDef } from './industries'
import { type BizState, type KeyStaff } from './state'
import { clampN, toJson } from './util'

export { hasBackground } from './deeptech-core'

/** Share of the lab a founder must put in (banks lend the rest if they approve). */
export const DEEP_TECH_OWN_SHARE = 0.25

/** What a deep-tech founder needs, for menus: '' when the player qualifies. */
export function backgroundNote(g: GameState, ind: DeepTechIndustry): string {
  if (hasBackground(g, ind)) return ''
  return `needs ${DEEP_TECH[ind].req.text}, a technical co-founder or a hired ${DEEP_TECH[ind].expert.toLowerCase()}`
}

/** Equity a technical co-founder takes. */
export const COFOUNDER_EQUITY = 0.15

/** Yearly salary of the expert you hire instead of a co-founder. */
export function expertSalary(ind: DeepTechIndustry, countryId: string): number {
  const role = industryDef(ind).roles.find((r) => r.title === DEEP_TECH[ind].expert) ?? industryDef(ind).roles[0]
  return Math.round(localPay(countryId, role.pay) / 1000) * 1000
}

export interface SeedOffer {
  amount: number
  equity: number
  investor: string
}

/** The seed round investors offer a new company here (uses the engine RNG). */
export function seedOffer(g: GameState, ind: DeepTechIndustry, countryId: string, investor: string, background: boolean): SeedOffer {
  const m = marketOf(countryId)
  const depth = vcDepth(countryId, m.gdpPerCapita, m.easeOfBusiness)
  const skill = founderSkill(g, ind)
  const track = Math.min(0.06, (g.counters.businessesSold ?? 0) * 0.02 + (g.counters.businessIpos ?? 0) * 0.03)
  const fit = clampN(0.8 + skill / 250 + (background ? 0.1 : 0) + g.character.hidden.fame / 500, 0.7, 1.35)
  const amount = Math.round((DEEP_TECH[ind].rounds[1] * (0.5 + 0.5 * depth) * Math.pow(rdScale(countryId), 0.7) * fit * (0.9 + rand(g) * 0.2)) / 10_000) * 10_000
  const equity = clampN(0.24 - (fit - 1) * 0.15 - track + (1 - depth) * 0.04, 0.12, 0.32)
  return { amount: Math.max(50_000, amount), equity: Math.round(equity * 100) / 100, investor }
}

/** A hired expert (key staff, quality focus) for a founder without the background. */
export function expertHire(g: GameState, b: BizState): KeyStaff {
  const ind = b.industry as DeepTechIndustry
  const gender = chance(g, 0.5) ? 'male' : 'female'
  return {
    id: uid(g, 'ks'),
    firstName: randomFirstName(g, b.countryId, gender),
    lastName: randomLastName(g, b.countryId),
    gender,
    age: 38 + Math.round(rand(g) * 15),
    role: DEEP_TECH[ind].expert,
    focus: 'quality',
    skill: clampN(bell(g, 72, 94), 60, 98),
    salary: expertSalary(ind, b.countryId),
    trait: 'steady',
    morale: 75,
    years: 0,
  }
}

/** A technical co-founder's name. */
export function cofounderName(g: GameState, countryId: string): string {
  const gender = chance(g, 0.5) ? 'male' : 'female'
  return `${randomFirstName(g, countryId, gender)} ${randomLastName(g, countryId)}`
}

/**
 * The starting deep-tech state of a newly founded company (writes b.tech). A seed round, when
 * taken, has already diluted b.share; its money goes into the R&D account.
 */
export function initTech(g: GameState, b: BizState, opts: { cofounder?: string; expert?: boolean; seed?: SeedOffer | null } = {}): TechState {
  const ind = b.industry as DeepTechIndustry
  const t = readTech(undefined)
  const skill = founderSkill(g, ind)
  t.level = Math.round(clampN(12 + skill / 4 + (opts.cofounder ? 8 : 0) + (opts.expert ? 8 : 0), 10, 45))
  t.hype = Math.round(clampN(10 + g.character.hidden.fame / 5 + (hasTalent(g, 'Business') ? 5 : 0), 0, 60))
  t.safety = 40
  t.cofounder = opts.cofounder ?? ''
  if (opts.seed && opts.seed.amount > 0) {
    const s = opts.seed
    t.series = 1
    t.venture = s.amount
    t.raised = s.amount
    t.lastRoundYear = g.year
    t.rounds = [{ series: 1, year: g.year, raised: s.amount, pre: Math.round((s.amount * (1 - s.equity)) / s.equity), equity: s.equity, investor: s.investor, down: false }]
  }
  // Biotech startups are usually spun out around one promising molecule.
  if (ind === 'biotech') {
    const area = DRUG_AREAS[Math.floor(rand(g) * DRUG_AREAS.length) % DRUG_AREAS.length]
    t.seq = 1
    t.drugs.push({
      id: 'd1',
      name: drugName(area, rand(g), rand(g), rand(g)),
      area: area.id,
      phase: 0,
      quality: Math.round(clampN(35 + skill * 0.3 + (rand(g) - 0.5) * 30, 15, 85)),
      peak: Math.round((area.peak[0] + (area.peak[1] - area.peak[0]) * rand(g)) * 100) / 100,
      filed: g.year,
      approved: 0,
      royalty: 1,
      partner: '',
      failed: false,
    })
  }
  b.tech = toJson(t)
  count(g, 'deepTechFounded')
  return b.tech as unknown as TechState
}

// ---------------------------------------------------------------------------
// The Business talent: the best industries to start in this market

const bestCache = new Map<string, { classic: Industry[]; deep: Industry[] }>()

/** Top classic and deep-tech industries for a market (pure; cached per country and city). */
export function bestIndustries(countryId: string, city: string): { classic: Industry[]; deep: Industry[] } {
  const key = `${countryId}|${city}`
  const hit = bestCache.get(key)
  if (hit) return hit
  const classic: { id: Industry; score: number }[] = []
  const deep: { id: Industry; score: number }[] = []
  for (const id of INDUSTRY_IDS) {
    if (!isIndustryLegal(countryId, id)) continue
    if (isDeepTechIndustry(id)) {
      // Only real hubs get the nod: a market with no deep-tech scene to speak of gets no hint.
      const d = marketOf(countryId).demand[id]
      if (d !== undefined && d >= 1.2) deep.push({ id, score: ecosystem(countryId, id) * d })
      continue
    }
    if (id === 'gameStudio') continue
    const def = industryDef(id)
    const e = localEcon(id, countryId, city)
    const margin = e.baseDemand * (e.goingPrice / (1 + e.taxRate) - e.unitCost)
    const fixed = def.staff * e.wage + e.rent + e.capital * def.maint
    const roi = (margin * 0.85 - fixed) / Math.max(1, e.capital)
    classic.push({ id, score: roi * Math.min(1.6, e.demandMult) })
  }
  const out = {
    classic: classic.sort((a, b) => b.score - a.score).slice(0, 3).map((x) => x.id),
    deep: deep.sort((a, b) => b.score - a.score).slice(0, 2).map((x) => x.id),
  }
  bestCache.set(key, out)
  return out
}

/** The purple hint text for a Start a Business row ('' when it isn't one of the best). */
export function industryHintText(countryId: string, city: string, id: Industry): string {
  const best = bestIndustries(countryId, city)
  const country = getCountry(countryId).name
  if (best.classic.includes(id)) return `One of the best bets in ${country} right now: strong demand and healthy margins for the money.`
  if (best.deep.includes(id)) return `${country} is a hub for this: deep-pocketed investors, the right talent and hungry customers.`
  return ''
}
