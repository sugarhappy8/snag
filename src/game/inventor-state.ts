// Research belongs to its creator; finished IP is a separately transferable asset.
import type { Asset, GameState, Json } from './types'
import { ownerKey, peek } from './special/common'
import { INVENTION_TIERS, isInventionTier, isResearchKind, type InventionTier, type PatentProtection } from './business/inventions'
import { isInventionField, inventionTopic, type InventionField } from './inventor-data'

export type ResearchApproach = 'practical' | 'balanced' | 'frontier'
export type ResearchPace = 'balanced' | 'intensive' | 'rest'
export interface PersonalResearch {
  id: string; topic: string; name: string; kind: InventionTier; started: number; progress: number; years: number; budget: number; country: string
  approach?: ResearchApproach; engineering?: number; validation?: number; experimentYear?: number
  model?: 'career' | 'legacy'; pace?: ResearchPace; revision?: boolean; attempts?: number; setbacks?: number
  personalCost?: number; grant?: number; collaborator?: string; notes?: string
  sponsorId?: string; companyCost?: number
}
export interface InventorWork { id: string; name: string; topic: string; year: number; units: number; royalties: number; recognition: number; contributors: string }
export type InventorEventKind = 'mentor' | 'conference' | 'consulting' | 'credit' | 'promoter'
export interface InventorEvent { kind: InventorEventKind; token: string; year: number; field: InventionField }
export interface InventorProfile {
  v: number; studies: { topic: string; points: number; year: number }[]; project: PersonalResearch | null; lastYear: number
  expertise: Partial<Record<InventionField, number>>; reputation: number; strain: number; setbacks: number
  work: InventorWork[]; journal: string[]; grant: { topic: string; amount: number; expires: number } | null
  lastCareerYear: number; event: InventorEvent | null
}
export interface InventionIp {
  v: number; topic: string; field: InventionField; kind: InventionTier; created: number; country: string; budget: number
  unitPrice: number; unitCost: number; potential: number; protections: PatentProtection[]; marketFit?: number; reliability?: number
  evidenceBased?: boolean; inventor?: string; contributors?: string
  closedLoop?: boolean
}
const rec = (v: unknown): Record<string, Json> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, Json> : {}
const number = (v: unknown, fallback = 0, max = 1e15): number => typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, v)) : fallback
const year = (v: unknown, fallback = -1): number => typeof v === 'number' && Number.isFinite(v) ? Math.floor(Math.min(100000, Math.max(-1, v))) : fallback
const text = (v: unknown, max = 160): string => typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max) : ''

/** Pure, bounded reader. Existing paid projects retain their original guaranteed timeline. */
export function inventorView(g: GameState): InventorProfile {
  const raw = peek<Record<string, Json>>(g, 'inventor') ?? {}, project = rec(raw.project)
  const topic = inventionTopic(text(project.topic)), kind = isResearchKind(project.kind) && isInventionTier(project.kind) ? project.kind : null
  const seen = new Set<string>(), studies = (Array.isArray(raw.studies) ? raw.studies : []).map(rec).filter(row => {
    const id = text(row.topic); if (!inventionTopic(id) || seen.has(id)) return false; seen.add(id); return true
  }).map(row => ({ topic: text(row.topic), points: number(row.points, 0, 10), year: year(row.year, 0) }))
  const expertise: InventorProfile['expertise'] = {}
  for (const [field, value] of Object.entries(rec(raw.expertise))) if (isInventionField(field)) expertise[field] = number(value, 0, 100)
  // Old study sessions count toward knowledge, but never turn inherited IP into expertise.
  if (raw.v !== 2) for (const s of studies) { const field = inventionTopic(s.topic)!.field; expertise[field] = Math.min(100, (expertise[field] ?? 0) + s.points * 3) }
  const grant = rec(raw.grant), event = rec(raw.event), workIds = new Set<string>()
  return { v: 2, studies, expertise, reputation: number(raw.reputation, 0, 100), strain: number(raw.strain, 0, 100), setbacks: number(raw.setbacks, 0, 100000),
    project: kind && topic && kind === topic.tier && text(project.id) && text(project.name)
      ? { id: text(project.id), name: text(project.name, 80), topic: topic.id, kind, started: year(project.started, g.year), progress: number(project.progress, 0, 30), years: project.model === 'career' ? Math.max(1, number(project.years, 1, 30)) : INVENTION_TIERS[kind].years, budget: number(project.budget), country: text(project.country, 8) || g.character.countryId,
        approach: project.approach === 'practical' || project.approach === 'frontier' ? project.approach : 'balanced', engineering: number(project.engineering, 0, 100), validation: number(project.validation, 0, 100), experimentYear: year(project.experimentYear),
        model: project.model === 'career' ? 'career' : 'legacy', pace: project.pace === 'intensive' || project.pace === 'rest' ? project.pace : 'balanced', revision: project.revision === true, attempts: number(project.attempts, 0, 100000), setbacks: number(project.setbacks, 0, 100000), personalCost: number(project.personalCost, number(project.budget)), grant: number(project.grant), collaborator: text(project.collaborator), notes: text(project.notes, 300), sponsorId: text(project.sponsorId), companyCost: number(project.companyCost) } : null,
    lastYear: year(raw.lastYear), lastCareerYear: year(raw.lastCareerYear),
    work: (Array.isArray(raw.work) ? raw.work : []).map(rec).filter(row => { const id = text(row.id); if (!id || workIds.has(id) || !inventionTopic(text(row.topic))) return false; workIds.add(id); return true }).slice(-100).map(row => ({ id: text(row.id), name: text(row.name, 80), topic: text(row.topic), year: year(row.year, 0), units: number(row.units), royalties: number(row.royalties), recognition: number(row.recognition, 0, 3), contributors: text(row.contributors) })),
    journal: (Array.isArray(raw.journal) ? raw.journal : []).map(line => text(line, 300)).filter(Boolean).slice(-12),
    grant: inventionTopic(text(grant.topic)) && number(grant.amount) > 0 ? { topic: text(grant.topic), amount: number(grant.amount), expires: year(grant.expires, 0) } : null,
    event: ['mentor', 'conference', 'consulting', 'credit', 'promoter'].includes(String(event.kind)) && text(event.token, 300) && isInventionField(event.field) ? { kind: event.kind as InventorEventKind, token: text(event.token, 300), year: year(event.year, 0), field: event.field } : null,
  }
}
export function saveInventor(g: GameState, profile: InventorProfile): void { g.flags['special.inventor'] = { ...profile, owner: ownerKey(g) } as unknown as Json }
export function inventorMut(g: GameState): InventorProfile { const p = inventorView(g); saveInventor(g, p); return p }
export function personalInventions(g: GameState): Asset[] { return g.assets.filter(a => a.kind === 'invention' && !!readInventionIp(a)) }
export function readInventionIp(a: Asset): InventionIp | null {
  const d = rec(a.details.inventorIp)
  if (!isInventionField(d.field) || !isResearchKind(d.kind) || !isInventionTier(d.kind)) return null
  return { v: d.evidenceBased === true ? 3 : 2, topic: text(d.topic), field: d.field, kind: d.kind, created: number(d.created), country: text(d.country, 8) || 'us', budget: number(d.budget), unitPrice: number(d.unitPrice, 1), unitCost: number(d.unitCost, 1), potential: number(d.potential, 0, 1e9), marketFit: number(d.marketFit, 1, 2), reliability: number(d.reliability, 1, 1.3), evidenceBased: d.evidenceBased === true, inventor: text(d.inventor), contributors: text(d.contributors), closedLoop: d.field === 'finance' || d.closedLoop === true, protections: d.field === 'finance' || d.closedLoop === true ? [] : (Array.isArray(d.protections) ? d.protections : []).map(rec).filter(row => typeof row.country === 'string').map(row => ({ country: String(row.country), filed: number(row.filed), expires: number(row.expires) })) }
}
