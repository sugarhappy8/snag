// Plain-JSON state of a deep-tech company (semiconductors, AI, robotics, biotech, space, EVs,
// quantum, cybersecurity): R&D programs, tech level, funding rounds and the like live in
// Asset.details.tech, next to the normal BizState. Light on imports on purpose: economy.ts reads
// deepTechValue() for the valuation and exit.ts reads deepTechIpoThreshold().
// CONTRACT STUB: the deep-tech builder owns this file and fills it in.
import { DEEP_TECH_IDS, type Industry } from '../data/markets'
import type { Json } from '../types'

export type DeepTechIndustry = (typeof DEEP_TECH_IDS)[number]

export function isDeepTechIndustry(id: string): id is DeepTechIndustry {
  return (DEEP_TECH_IDS as readonly string[]).includes(id)
}

/** True for a deep-tech company (by its BizState-like `industry` field). */
export function isDeepTech(b: { industry: Industry | string }): boolean {
  return isDeepTechIndustry(b.industry)
}

/** Extra company value from IP, patents and the R&D pipeline (added to valuationOf). */
export function deepTechValue(_tech: Json | undefined): number {
  return 0
}

/** Yearly profit an exchange wants before listing a deep-tech company, or null for the default. */
export function deepTechIpoThreshold(_b: { industry: string; tech?: Json }): number | null {
  return null
}
