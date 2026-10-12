// Workshop state: the notebook, skill and reputation in g.flags['workshop'] (stamped with the
// owner, so an heir starts a fresh notebook), and each patented or launched invention as an
// Asset (kind 'invention', details.inv2) that shows in Assets, counts in net worth and is
// inherited. Readers are pure and bounded; old saves are read through migrate.ts.
import { ownerKey, ownerMatches } from '../special/common'
import type { Asset, GameState, Json } from '../types'
import { CATEGORIES, catalogIdea, isCategory, type Category, type IdeaDef, type Level } from './catalog'

export const FLAG = 'workshop'
export const NOTEBOOK_MAX = 12

/** A non-catalog idea (old saves: research projects and company products keep their names). */
export interface CustomIdea { name: string; emoji: string; blurb: string; cat: Category; d: Level; a: Level }

export interface NoteIdea {
  /** Catalog id, or 'legacy-…' with `custom`. */
  id: string
  /** Year it went into the notebook. */
  got: number
  /** Best prototype quality so far (0 = never built). */
  q: number
  builds: number
  custom?: CustomIdea
  /** Year the rights were last shopped around / pitched / crowdfunded (one try a year). */
  shopped?: number
  pitched?: number
  crowd?: number
}

export interface MadeEntry { id: string; name: string; emoji: string; route: string; year: number; first?: boolean }

export interface Workshop {
  v: 1
  owner: string
  skill: number
  rep: number
  ideas: NoteIdea[]
  builds: number
  launches: number
  /** Lifetime personal earnings from inventions (all routes, before tax). */
  earned: number
  kabooms: number
  made: MadeEntry[]
  /** Once-each events: key → year it happened. */
  events: Record<string, number>
  /** Last year the yearly sparks ran. */
  last: number
}

export type Route = 'license' | 'pitch' | 'crowd' | 'company' | 'open'
export type PatentScope = 'home' | 'world'
export interface Patent { scope: PatentScope; country: string; filed: number; expires: number }

export interface Inv {
  v: 1
  idea: string
  custom?: CustomIdea
  q: number
  builds: number
  patent: Patent | null
  stage: 'patented' | 'launched'
  route: Route | null
  /** Personal share of each sale's price (royalty, or margin net of an investor's cut). */
  rate: number
  /** Company margin for 'company'. */
  margin: number
  company: string
  maker: string
  launched: number
  peak: number
  price: number
  rise: number
  plateau: number
  decay: number
  /** Lasting sales multiplier from events (knockoffs, scandals, investors' networks). */
  hit: number
  /** Calendar year whose sales are doubled (a viral moment). */
  boost: number
  units: number
  earned: number
  companyEarned: number
  /** Last fiscal year settled. */
  last: number
  lastUnits: number
  lastIncome: number
  history: boolean
  done: string[]
  inventor: string
  country: string
  /** Old saves: the asset's value before the Workshop (a floor while unlaunched). */
  legacyValue: number
  shopped: number
  pitched: number
  crowd: number
}

// ---------------------------------------------------------------------------
// Bounded readers

export const rec = (v: unknown): Record<string, Json> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, Json>) : {})
export const fin = (v: unknown, fallback = 0, min = 0, max = 1e15): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback)
export const year = (v: unknown, fallback: number): number => Math.round(fin(v, fallback, -1, 100_000))
export const text = (v: unknown, max = 80): string => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max) : '')
const level = (v: unknown, fallback: Level): Level => Math.max(1, Math.min(5, Math.round(fin(v, fallback, 1, 5)))) as Level

export function readCustom(v: unknown): CustomIdea | undefined {
  const d = rec(v)
  const name = text(d.name)
  if (!name || !isCategory(d.cat)) return undefined
  return { name, emoji: text(d.emoji, 16) || '\u{1F4A1}', blurb: text(d.blurb, 160) || 'An idea from your old notebook.', cat: d.cat, d: level(d.d, 2), a: level(d.a, 3) }
}

/** The idea behind a notebook entry or an invention: catalog data or the custom record. */
export function ideaDef(id: string, custom?: CustomIdea): IdeaDef | null {
  const found = catalogIdea(id)
  if (found) return found
  if (!custom) return null
  return { id, name: custom.name, emoji: custom.emoji, blurb: custom.blurb, cat: custom.cat, d: custom.d, a: custom.a, from: 0 }
}

function readNote(v: unknown, fallbackYear: number): NoteIdea | null {
  const d = rec(v)
  const id = text(d.id, 80)
  const custom = readCustom(d.custom)
  if (!id || !ideaDef(id, custom)) return null
  return {
    id, got: year(d.got, fallbackYear), q: fin(d.q, 0, 0, 100), builds: Math.floor(fin(d.builds, 0, 0, 10_000)),
    ...(custom ? { custom } : {}),
    ...(typeof d.shopped === 'number' ? { shopped: year(d.shopped, -1) } : {}),
    ...(typeof d.pitched === 'number' ? { pitched: year(d.pitched, -1) } : {}),
    ...(typeof d.crowd === 'number' ? { crowd: year(d.crowd, -1) } : {}),
  }
}

export function emptyWorkshop(g: GameState): Workshop {
  return { v: 1, owner: ownerKey(g), skill: 0, rep: 0, ideas: [], builds: 0, launches: 0, earned: 0, kabooms: 0, made: [], events: {}, last: -1 }
}

/** Normalize a stored workshop record (no owner check). */
export function normalizeWorkshop(g: GameState, raw: unknown): Workshop {
  const d = rec(raw)
  const seen = new Set<string>()
  const ideas: NoteIdea[] = []
  for (const row of Array.isArray(d.ideas) ? d.ideas : []) {
    const n = readNote(row, g.year)
    if (!n || seen.has(n.id) || ideas.length >= NOTEBOOK_MAX) continue
    seen.add(n.id)
    ideas.push(n)
  }
  const events: Record<string, number> = {}
  for (const [k, v] of Object.entries(rec(d.events)).slice(0, 200)) if (typeof v === 'number' && Number.isFinite(v)) events[text(k, 60)] = Math.round(v)
  const made: MadeEntry[] = (Array.isArray(d.made) ? d.made : []).map(rec).filter((m) => text(m.id) && text(m.name)).slice(-60).map((m) => ({
    id: text(m.id), name: text(m.name), emoji: text(m.emoji, 16) || '\u{1F4A1}', route: text(m.route, 20), year: year(m.year, g.year), ...(m.first === true ? { first: true } : {}),
  }))
  return {
    v: 1, owner: typeof d.owner === 'string' ? d.owner : ownerKey(g),
    skill: fin(d.skill, 0, 0, 100), rep: fin(d.rep, 0, 0, 100), ideas,
    builds: Math.floor(fin(d.builds, 0, 0, 1e6)), launches: Math.floor(fin(d.launches, 0, 0, 1e6)), earned: fin(d.earned), kabooms: Math.floor(fin(d.kabooms, 0, 0, 1e6)),
    made, events, last: year(d.last, -1),
  }
}

// ---------------------------------------------------------------------------
// Invention assets

export function isInventionAsset(a: Asset): boolean {
  return a.kind === 'invention'
}

/** Normalize an asset's Workshop record, or null when it has none (old formats: see migrate.ts). */
export function readInvRaw(a: Asset): Inv | null {
  const d = rec(a.details.inv2)
  if (!Object.keys(d).length) return null
  const id = text(d.idea, 80)
  const custom = readCustom(d.custom) ?? (catalogIdea(id) ? undefined : { name: text(a.name) || 'Invention', emoji: text(a.emoji, 16) || '\u{1F4A1}', blurb: 'One of your inventions.', cat: 'gadget' as Category, d: 2 as Level, a: 3 as Level })
  const p = rec(d.patent)
  const patent: Patent | null = (p.scope === 'home' || p.scope === 'world') && text(p.country, 8)
    ? { scope: p.scope, country: text(p.country, 8), filed: year(p.filed, 0), expires: year(p.expires, 0) } : null
  const route: Route | null = ['license', 'pitch', 'crowd', 'company', 'open'].includes(String(d.route)) ? (d.route as Route) : null
  const launched = d.stage === 'launched' && route !== null
  const def = ideaDef(id || 'legacy', custom)
  const cat = CATEGORIES[def?.cat ?? 'gadget']
  return {
    v: 1, idea: id || 'legacy', ...(custom ? { custom } : {}), q: fin(d.q, 40, 0, 100), builds: Math.floor(fin(d.builds, 0, 0, 1e4)), patent,
    stage: launched ? 'launched' : 'patented', route: launched ? route : null,
    rate: fin(d.rate, 0, 0, 0.6), margin: fin(d.margin, 0, 0, 0.6), company: text(d.company, 80), maker: text(d.maker, 80),
    launched: year(d.launched, -1), peak: fin(d.peak, 0, 0, 1e9), price: fin(d.price, 0, 0, 1e7),
    rise: Math.round(fin(d.rise, cat.rise, 1, 6)), plateau: Math.round(fin(d.plateau, cat.plateau, 0, 6)), decay: fin(d.decay, cat.decay, 0.3, 0.95),
    hit: fin(d.hit, 1, 0.05, 3), boost: year(d.boost, -1), units: fin(d.units), earned: fin(d.earned), companyEarned: fin(d.companyEarned),
    last: year(d.last, -1), lastUnits: fin(d.lastUnits), lastIncome: fin(d.lastIncome),
    history: d.history === true, done: (Array.isArray(d.done) ? d.done : []).filter((x): x is string => typeof x === 'string').slice(0, 40),
    inventor: text(d.inventor, 120), country: text(d.country, 8) || 'us', legacyValue: fin(d.legacyValue),
    shopped: year(d.shopped, -1), pitched: year(d.pitched, -1), crowd: year(d.crowd, -1),
  }
}

/** A fresh, patented-or-not, unlaunched invention record. */
export function blankInv(def: IdeaDef, opts: { custom?: CustomIdea; q: number; builds?: number; patent: Patent | null; country: string; price: number; inventor?: string; history?: boolean }): Inv {
  const cat = CATEGORIES[def.cat]
  return {
    v: 1, idea: def.id, ...(opts.custom ? { custom: opts.custom } : {}), q: Math.max(0, Math.min(100, opts.q)), builds: opts.builds ?? 0, patent: opts.patent,
    stage: 'patented', route: null, rate: 0, margin: 0, company: '', maker: '', launched: -1, peak: 0, price: opts.price,
    rise: cat.rise, plateau: cat.plateau, decay: cat.decay, hit: 1, boost: -1, units: 0, earned: 0, companyEarned: 0, last: -1, lastUnits: 0, lastIncome: 0,
    history: opts.history === true, done: [], inventor: opts.inventor ?? '', country: opts.country, legacyValue: 0, shopped: -1, pitched: -1, crowd: -1,
  }
}

export function saveInv(a: Asset, inv: Inv): void {
  a.details.inv2 = inv as unknown as Json
}

/** The idea behind a notebook entry. */
export function noteDef(n: Pick<NoteIdea, 'id' | 'custom'>): IdeaDef {
  return invDef({ idea: n.id, custom: n.custom })
}

export function invDef(inv: Pick<Inv, 'idea' | 'custom'>): IdeaDef {
  return ideaDef(inv.idea, inv.custom) ?? { id: inv.idea, name: 'Invention', emoji: '\u{1F4A1}', blurb: 'One of your inventions.', cat: 'gadget', d: 2, a: 3, from: 0 }
}

// ---------------------------------------------------------------------------
// Reputation ranks

export const RANKS: readonly { at: number; name: string; emoji: string }[] = [
  { at: 0, name: 'Tinkerer', emoji: '\u{1F527}' },
  { at: 15, name: 'Garage Inventor', emoji: '\u{1F6E0}\u{FE0F}' },
  { at: 35, name: 'Patent Holder', emoji: '\u{1F4DC}' },
  { at: 60, name: 'Renowned Inventor', emoji: '\u{1F3C5}' },
  { at: 85, name: 'Legendary Inventor', emoji: '\u{1F3C6}' },
]

export function rankOf(rep: number): { at: number; name: string; emoji: string } {
  let r = RANKS[0]
  for (const x of RANKS) if (rep >= x.at) r = x
  return r
}

export function ownsWorkshop(g: GameState, raw: unknown): boolean {
  return ownerMatches(g, rec(raw).owner)
}
