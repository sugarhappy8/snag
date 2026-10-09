// Personal research is owner-scoped; finished IP is an inheritable Asset.
import type { Asset, GameState, Json } from './types'
import { ownerKey, peek, prof } from './special/common'
import { INVENTION_TIERS, isInventionTier, isResearchKind, type InventionTier, type PatentProtection } from './business/inventions'
import { isInventionField, inventionTopic, type InventionField } from './inventor-data'

export interface PersonalResearch { id: string; topic: string; name: string; kind: InventionTier; started: number; progress: number; years: number; budget: number; country: string }
export interface InventorProfile { v: number; studies: { topic: string; points: number; year: number }[]; project: PersonalResearch | null; lastYear: number }
export interface InventionIp { v: number; topic: string; field: InventionField; kind: InventionTier; created: number; country: string; budget: number; unitPrice: number; unitCost: number; potential: number; protections: PatentProtection[] }
const rec = (v: Json | undefined): Record<string, Json> => v && typeof v === 'object' && !Array.isArray(v) ? v : {}
const number = (v: Json | undefined, fallback = 0, max = 1e15): number => typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, v)) : fallback

export function inventorView(g: GameState): InventorProfile {
  const raw = peek<Record<string, Json>>(g, 'inventor') ?? {}
  const project = rec(raw.project)
  const kind = isResearchKind(project.kind) && isInventionTier(project.kind) ? project.kind : null
  return { v: 1, studies: (Array.isArray(raw.studies) ? raw.studies : []).map(rec).filter(row => typeof row.topic === 'string' && !!inventionTopic(row.topic)).map(row => ({ topic: String(row.topic), points: number(row.points, 0, 10), year: number(row.year) })),
    project: kind && typeof project.id === 'string' && typeof project.name === 'string' && typeof project.topic === 'string' && inventionTopic(project.topic)
      ? { id: project.id, name: project.name.slice(0, 80), topic: project.topic, kind, started: number(project.started), progress: number(project.progress, 0, 5), years: INVENTION_TIERS[kind].years, budget: number(project.budget), country: typeof project.country === 'string' ? project.country : g.character.countryId } : null,
    lastYear: typeof raw.lastYear === 'number' && Number.isFinite(raw.lastYear) ? raw.lastYear : -1 }
}
export function saveInventor(g: GameState, profile: InventorProfile): void { g.flags['special.inventor'] = { ...profile, owner: ownerKey(g) } as unknown as Json }
export function inventorMut(g: GameState): InventorProfile {
  prof(g, 'inventor', () => ({ v: 1, studies: [], project: null, lastYear: -1 }))
  const profile = inventorView(g)
  saveInventor(g, profile)
  return profile
}
export function personalInventions(g: GameState): Asset[] { return g.assets.filter(a => a.kind === 'invention' && !!readInventionIp(a)) }
export function readInventionIp(a: Asset): InventionIp | null {
  const d = rec(a.details.inventorIp)
  if (!isInventionField(d.field) || !isResearchKind(d.kind) || !isInventionTier(d.kind)) return null
  return { v: 1, topic: typeof d.topic === 'string' ? d.topic : '', field: d.field, kind: d.kind, created: number(d.created), country: typeof d.country === 'string' ? d.country : 'us', budget: number(d.budget), unitPrice: number(d.unitPrice, 1), unitCost: number(d.unitCost, 1), potential: number(d.potential, 0, 1e9), protections: (Array.isArray(d.protections) ? d.protections : []).map(rec).filter(row => typeof row.country === 'string').map(row => ({ country: String(row.country), filed: number(row.filed), expires: number(row.expires) })) }
}
