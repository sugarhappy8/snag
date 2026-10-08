// Invention tiers and territorial patent rules. Fees and enforcement are gameplay
// estimates from national market profiles, not a schedule of real government charges.
import { seeded } from '../assets'
import { marketOf } from '../data/markets'
import type { BizState } from './state'
import { industryDef } from './industries'

export const INVENTION_TIERS = {
  small: { label: 'Small', years: 0, odds: 1, minimum: 5_000, revenueShare: .01, demand: [.08, .12], efficiency: [.005, .01] },
  middle: { label: 'Middle', years: 1, odds: .95, minimum: 50_000, revenueShare: .05, demand: [.25, .4], efficiency: [.015, .03] },
  big: { label: 'Big', years: 3, odds: .85, minimum: 500_000, revenueShare: .15, demand: [.8, 1.2], efficiency: [.04, .06] },
  generational: { label: 'Generational', years: 5, odds: .70, minimum: 5_000_000, revenueShare: .35, demand: [2.5, 4], efficiency: [.08, .12] },
} as const

export type InventionTier = keyof typeof INVENTION_TIERS
export type ResearchKind = InventionTier | 'early' | 'frontier'
export interface PatentProtection { country: string; filed: number; expires: number }

export function isResearchKind(value: unknown): value is ResearchKind {
  return typeof value === 'string' && (value === 'early' || value === 'frontier' || Object.hasOwn(INVENTION_TIERS, value))
}

export function isInventionTier(value: ResearchKind): value is InventionTier { return value !== 'early' && value !== 'frontier' }

/** Modern utility patents generally run 20 years from filing; rights are territorial.
 * https://www.wipo.int/en/web/patents/faq_patents
 * Historical US grants used 17 years (the game's annual clock rounds the 1995 transition).
 * https://www.uspto.gov/patents/laws/american-inventors-protection-act-1999/patent-term-guarantee-overview
 * Other historical regimes use the modern 20-year baseline as a gameplay approximation.
 * Filing and grant happen together in this game's Inventor Lab. */
export function nationalPatentLaw(country: string, year: number) {
  const market = marketOf(country)
  return {
    term: country === 'us' && year < 1995 ? 17 : 20,
    filingCost: Math.round(1_000 + market.startupFee * .2 + market.gdpPerCapita * .02 + market.startupDays * 20),
    enforcement: .65 + .35 * (1 - market.corruption / 100),
  }
}

// Procedural combinations give every sector a varied pool, including speculative science.
const FAMILIES = {
  energy: ['waste-heat recovery module', 'adaptive grid-storage array', 'solid-state energy lattice', 'stable cold-fusion power cell'],
  health: ['non-invasive diagnostic sensor', 'precision drug-delivery capsule', 'regenerative organ scaffold', 'universal tissue-repair platform'],
  computing: ['low-power adaptive processor', 'autonomous reasoning engine', 'fault-tolerant quantum interface', 'self-organizing cognitive substrate'],
  food: ['freshness-monitoring membrane', 'closed-loop food-production system', 'precision nutrient cultivator', 'molecular nutrition synthesizer'],
  transport: ['predictive routing sensor', 'autonomous transport controller', 'ultralight propulsion system', 'inertial transport drive'],
  general: ['self-calibrating production sensor', 'adaptive manufacturing system', 'self-repairing material platform', 'programmable matter fabricator'],
} as const
const VARIANTS = ['Compact', 'Modular', 'Adaptive', 'High-efficiency', 'Self-balancing', 'Precision', 'Resilient', 'Ultra-light']

/** Read-only candidate catalog: opening/reopening the lab never rolls the dice. */
export function inventionNames(b: BizState, tier: InventionTier): string[] {
  const family = /energy|fusion|battery|solar/.test(b.industry) ? FAMILIES.energy
    : /bio|pharma|clinic|medical/.test(b.industry) ? FAMILIES.health
    : /software|ai|semiconductor|quantum|robot|game|cyber|dataCenter|telecom/.test(b.industry) ? FAMILIES.computing
    : /farm|food|restaurant|cafe|bakery|grocery/.test(b.industry) ? FAMILIES.food
    : /logistic|auto|electricVehicles|aero|space|travel/.test(b.industry) ? FAMILIES.transport : FAMILIES.general
  const index = (Object.keys(INVENTION_TIERS) as InventionTier[]).indexOf(tier)
  return VARIANTS.map(v => `${industryDef(b.industry).label}: ${v.toLowerCase()} ${family[index]}`)
}

/** Each invention has its own annual local demand, independent of menu reads and g.rng. */
export function inventionDemand(id: string, potential: number, country: string, year: number): number {
  return potential * (.9 + .2 * seeded(`${id}|invention-demand|${country}|${year}`).next())
}
