// Durable, plain-JSON engine IP. Kept independent of business actions for save readers.
import { normalizeFx } from '../effort/fx'
import type { Fx } from '../effort/types'
import { engineDef, isEngine, type EngineDef, type EngineId } from '../special/gamedev-data'
import type { Json } from '../types'

export type StudioEngineId = EngineId | `engine${number}`
export type EngineTier = 'indie' | 'professional' | 'flagship'
export type EngineTerms = 'private' | 'subscription' | 'royalty'

export const ENGINE_TIERS = [
  { id: 'indie', label: 'Indie Engine', years: 1, team: 2, minTeam: 2, setup: 25_000, research: 5_000, fee: 3_000, sales: 700_000, reach: 12, maxScope: 2 },
  { id: 'professional', label: 'Professional Engine', years: 2, team: 12, minTeam: 6, setup: 250_000, research: 60_000, fee: 25_000, sales: 5_000_000, reach: 30, maxScope: 4 },
  { id: 'flagship', label: 'Flagship Engine', years: 3, team: 40, minTeam: 20, setup: 2_000_000, research: 500_000, fee: 120_000, sales: 30_000_000, reach: 50, maxScope: 4 },
] as const

export function engineTier(id: string) {
  return ENGINE_TIERS.find((x) => x.id === id) ?? ENGINE_TIERS[0]
}

export interface EngineLicense {
  id: number
  start: number
  /** Last fiscal year covered; terms cannot be changed during the three-year contract. */
  until: number
  terms: Exclude<EngineTerms, 'private'>
  fee: number
  royalty: number
  sales: number
}

export interface StudioEngine {
  id: `engine${number}`
  name: string
  tier: EngineTier
  stage: 'dev' | 'ready' | 'sold'
  progress: number
  quality: number
  team: number
  started: number
  released: number
  spent: number
  terms: EngineTerms
  licenses: EngineLicense[]
  licenseSeq: number
  lastYear: number
  lastRevenue: number
  earned: number
  soldFor: number
  /**
   * The effort record of the build (effort/fx.ts: nine bounded numbers), kept only when it carries something: an engine that was set
   * back under a push, or one that was booked at its end with that record. Missing on old saves and on every engine that never needed one.
   */
  fx?: Fx
}

function record(v: Json | undefined): Record<string, Json> {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
}

function number(v: Json | undefined, fallback = 0, max = 1e15): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : fallback
}

/**
 * An engine's stored effort record: the engine's `normalizeFx` of a record (every number cut to its cap), or nothing. A value that is not
 * a record, and a record that carries nothing (every number at its fresh value: no progress, no setback, no stamp), is damaged or empty
 * and is dropped, never repaired, so an engine that never needed one saves without the key.
 */
function readEngineFx(raw: Json | undefined): Fx | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const fx = normalizeFx(raw)
  const carries = fx.progress !== 0 || fx.quality !== 0 || fx.spent !== 0 || fx.hours !== 0 || fx.setbacks !== 0 || fx.insight !== 0 || fx.fatigue !== 0 || fx.last !== -1
  return carries ? fx : undefined
}

export function isStudioEngineId(v: unknown): v is StudioEngineId {
  return isEngine(v) || (typeof v === 'string' && /^engine[1-9]\d{0,8}$/.test(v))
}

export function normalizeEngines(v: Json | undefined): StudioEngine[] {
  if (!Array.isArray(v)) return []
  const seen = new Set<string>()
  const out: StudioEngine[] = []
  for (const raw of v) {
    const x = record(raw)
    if (typeof x.id !== 'string' || !/^engine[1-9]\d{0,8}$/.test(x.id) || seen.has(x.id) || typeof x.name !== 'string' || !x.name.trim()) continue
    seen.add(x.id)
    const stage = x.stage === 'ready' || x.stage === 'sold' ? x.stage : 'dev'
    const licenses: EngineLicense[] = []
    const ids = new Set<number>()
    for (const rawLicense of Array.isArray(x.licenses) ? x.licenses : []) {
      const l = record(rawLicense)
      const id = Math.round(number(l.id))
      const start = Math.round(number(l.start, 0, 100_000))
      const until = Math.round(number(l.until, 0, 100_000))
      if (!id || ids.has(id) || until < start || until - start > 2 || (l.terms !== 'subscription' && l.terms !== 'royalty')) continue
      ids.add(id)
      licenses.push({ id, start, until, terms: l.terms, fee: Math.round(number(l.fee)), royalty: number(l.royalty, 0, .1), sales: number(l.sales) })
      if (licenses.length >= 200) break
    }
    const fx = readEngineFx(x.fx)
    out.push({
      id: x.id as StudioEngine['id'], name: x.name.trim().slice(0, 48), tier: engineTier(String(x.tier)).id,
      stage, progress: stage === 'dev' ? number(x.progress, 0, 100) : 100, quality: number(x.quality, 50, 100),
      team: stage === 'dev' ? Math.round(number(x.team, 0, 100_000)) : 0,
      started: Math.round(number(x.started, 0, 100_000)), released: Math.round(number(x.released, 0, 100_000)),
      spent: Math.round(number(x.spent)), terms: x.terms === 'subscription' || x.terms === 'royalty' ? x.terms : 'private',
      licenses: stage === 'ready' ? licenses : [], licenseSeq: Math.max(Math.round(number(x.licenseSeq)), ...licenses.map((l) => l.id)),
      lastYear: Math.round(number(x.lastYear, 0, 100_000)), lastRevenue: Math.round(number(x.lastRevenue)),
      earned: Math.round(number(x.earned)), soldFor: Math.round(number(x.soldFor)),
      ...(fx !== undefined ? { fx } : {}),
    })
    if (out.length >= 32) break
  }
  return out
}

/** Sold IP retains its technical definition for games already greenlit with it. */
export function studioEngineDef(engines: StudioEngine[], id: StudioEngineId): Omit<EngineDef, 'id'> & { id: StudioEngineId } {
  if (isEngine(id)) return engineDef(id)
  const x = engines.find((e) => e.id === id && e.stage !== 'dev')
  if (!x) return engineDef('cobalt')
  const tier = engineTier(x.tier)
  return {
    id, label: x.name, emoji: '⚙️', speed: .85 + x.quality / 150,
    bonus: (x.quality - 40) / 8, bigBonus: (x.quality - 40) / 5,
    royalty: 0, minSkill: 0, maxScope: tier.maxScope,
    note: `${tier.label} · quality ${Math.round(x.quality)} · company-owned, no royalties`,
  }
}

export function availableStudioEngines(engines: StudioEngine[], scopeIndex: number): StudioEngineId[] {
  return engines.filter((x) => x.stage === 'ready' && engineTier(x.tier).maxScope >= scopeIndex).map((x) => x.id)
}

/**
 * Engine IP is included in the company's value, never also paid to its owner personally. A buyer
 * pays for the technology at a discount to what it cost to build (tools, R&D and the payroll
 * already spent; better engines recover more of it, never all, since an unproven engine carries
 * the buyer's risk), worn down with age, plus three years of the licensing receipts its contracts
 * transfer. Building and selling never returns more than was spent unless licensees really paid.
 */
export function engineIpValue(x: StudioEngine, year = Math.max(x.released, x.lastYear)): number {
  if (x.stage === 'sold') return 0
  if (x.stage === 'dev') return Math.round(x.spent * .6 * x.progress / 100)
  const age = Math.max(0, year - x.released)
  const recovery = .2 + .6 * x.quality / 100 // At most 80% of the cost, at quality 100.
  return Math.round(x.spent * recovery / (1 + age * .14) + x.lastRevenue * 3)
}
