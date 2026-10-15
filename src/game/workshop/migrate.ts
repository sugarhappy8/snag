// Old saves → the Workshop. Pure readers derive the new view from old data (menus may call
// them); migrateLegacy writes the result once (yearly hook, or the first Workshop action).
// Never grants money: active research becomes a notebook idea (no refund), personal IP
// becomes a patented invention, and company products/research/patents keep selling as
// "made in my company" inventions with a bounded sales curve. Factory and stock book values
// stay on the company's books (legacy-capital.ts). Nothing here throws on damaged data.
import { notice } from '../core'
import { ownerKey, ownerMatches } from '../special/common'
import { defineScript } from '../scripts'
import type { Asset, GameState, Json } from '../types'
import { bizOf, businessAssets, readBiz } from '../business/state'
import { CATEGORIES, type Category, type Level } from './catalog'
import { COMPANY_MARGIN, expectedPeak, inventionValue, priceOf } from './market'
import { FLAG, blankInv, emptyWorkshop, fin, ideaDef, normalizeWorkshop, readInvRaw, rec, saveInv, text, year, type CustomIdea, type Inv, type Patent, type Workshop } from './state'

type Field = 'energy' | 'materials' | 'computing' | 'health' | 'food' | 'transport' | 'consumer' | 'finance'
type Tier = 'small' | 'middle' | 'big' | 'generational'
const FIELD_CAT: Record<Field, Category> = { energy: 'energy', materials: 'home', computing: 'computing', health: 'health', food: 'food', transport: 'transport', consumer: 'gadget', finance: 'computing' }
const TIER_D: Record<Tier, Level> = { small: 2, middle: 3, big: 4, generational: 5 }
/** The old research topics (id → field, tier), enough to place an old project in the new notebook. */
const OLD_TOPICS: Record<string, [Field, Tier]> = {
  'private-risk-model': ['finance', 'small'], 'private-execution': ['finance', 'middle'], 'private-market-model': ['finance', 'big'], 'private-capital-engine': ['finance', 'generational'],
  'quick-fastener': ['materials', 'small'], 'drip-irrigation': ['food', 'small'], 'assistive-grip': ['health', 'small'], 'safer-brake': ['transport', 'middle'],
  'thermal-insulation': ['materials', 'middle'], 'heat-pump': ['energy', 'middle'], 'heat-recovery': ['energy', 'small'], 'solar-film': ['energy', 'middle'],
  'solid-battery': ['energy', 'big'], 'cold-fusion': ['energy', 'generational'], 'smart-coating': ['materials', 'small'], 'repair-polymer': ['materials', 'middle'],
  'carbon-fabric': ['materials', 'big'], 'matter-fabricator': ['materials', 'generational'], 'adaptive-chip': ['computing', 'small'], 'optical-link': ['computing', 'middle'],
  'quantum-interface': ['computing', 'big'], 'cognitive-substrate': ['computing', 'generational'], 'diagnostic-patch': ['health', 'small'], 'precision-capsule': ['health', 'middle'],
  'organ-scaffold': ['health', 'big'], 'tissue-platform': ['health', 'generational'], 'freshness-sensor': ['food', 'small'], 'nutrient-cultivator': ['food', 'middle'],
  'climate-crop': ['food', 'big'], 'nutrition-synth': ['food', 'generational'], 'routing-sensor': ['transport', 'small'], 'autonomous-controller': ['transport', 'middle'],
  'light-propulsion': ['transport', 'big'], 'inertial-drive': ['transport', 'generational'], 'water-filter': ['consumer', 'small'], 'adaptive-cloth': ['consumer', 'middle'],
  'home-recycler': ['consumer', 'big'], 'personal-climate': ['consumer', 'generational'],
}
const FIELDS = Object.keys(FIELD_CAT) as Field[]
const isField = (v: unknown): v is Field => typeof v === 'string' && (FIELDS as string[]).includes(v)
const isTier = (v: unknown): v is Tier => v === 'small' || v === 'middle' || v === 'big' || v === 'generational'
/** Legacy company research kinds ('early'/'frontier') map onto the tiers. */
const tierOf = (v: unknown): Tier | null => (isTier(v) ? v : v === 'early' ? 'big' : v === 'frontier' ? 'generational' : null)
const safeId = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60) || 'x'
const OLD_FLAG = 'special.inventor'

function custom(name: string, field: Field, tier: Tier, appeal: Level, blurb: string): CustomIdea {
  const cat = FIELD_CAT[field]
  return { name: text(name) || 'Old invention', emoji: CATEGORIES[cat].emoji, blurb, cat, d: TIER_D[tier], a: appeal }
}
function appealFromFit(fit: number): Level {
  return fit >= 1.2 ? 4 : fit >= 0.65 ? 3 : 2
}
function qualityFrom(reliability: number, fit: number): number {
  return Math.round(Math.max(40, Math.min(95, 45 + ((reliability - 0.45) / 0.8) * 25 + Math.min(1.6, fit) * 12)))
}
function readProtections(v: unknown): { country: string; filed: number; expires: number }[] {
  const out = new Map<string, { country: string; filed: number; expires: number }>()
  for (const row of Array.isArray(v) ? v : []) {
    const r = rec(row)
    const country = text(r.country, 8)
    const filed = Math.round(fin(r.filed, 0, 0, 100_000))
    const expires = Math.round(fin(r.expires, 0, 0, 100_000))
    if (country && expires > filed) out.set(country, { country, filed, expires })
  }
  return [...out.values()]
}
function patentFrom(protections: { country: string; filed: number; expires: number }[], home: string): Patent | null {
  if (!protections.length) return null
  const main = protections.find((p) => p.country === home) ?? protections[0]
  return { scope: protections.length >= 5 ? 'world' : 'home', country: main.country, filed: Math.min(...protections.map((p) => p.filed)), expires: main.expires }
}

// ---------------------------------------------------------------------------
// The old Inventor profile

interface OldProfile { skill: number; rep: number; project: { key: string; idea: CustomIdea; q: number } | null; made: { id: string; name: string; year: number }[] }

/** The old 'special.inventor' profile of the current character, or null. Pure. */
export function legacyProfile(g: GameState): OldProfile | null {
  const raw = rec(g.flags[OLD_FLAG])
  if (!Object.keys(raw).length || !ownerMatches(g, raw.owner)) return null
  const expertise = Object.values(rec(raw.expertise)).map((v) => fin(v, 0, 0, 100))
  const studies = (Array.isArray(raw.studies) ? raw.studies : []).map(rec).map((s) => fin(s.points, 0, 0, 10))
  const skill = Math.round(Math.max(0, ...expertise, ...studies.map((p) => p * 3)))
  const p = rec(raw.project)
  const topic = OLD_TOPICS[text(p.topic)]
  const tier = tierOf(p.kind) ?? topic?.[1] ?? null
  let project: OldProfile['project'] = null
  if (topic && tier && text(p.id)) {
    const years = Math.max(1, fin(p.years, 1, 1, 30))
    const progress = fin(p.progress, 0, 0, 30)
    const q = Math.round(Math.max(5, Math.min(90, 0.5 * fin(p.engineering, 30, 0, 100) + 0.3 * fin(p.validation, 20, 0, 100) + (20 * progress) / years)))
    project = { key: `legacy-${safeId(text(p.id))}`, idea: custom(text(p.name) || text(p.topic), topic[0], tier, 3, 'A project from your old research lab.'), q }
  }
  const made = (Array.isArray(raw.work) ? raw.work : []).map(rec).filter((w) => text(w.id) && text(w.name)).slice(-30).map((w) => ({ id: text(w.id), name: text(w.name), year: year(w.year, g.year) }))
  return { skill: Math.min(100, skill), rep: fin(raw.reputation, 0, 0, 100), project, made }
}

/** The new workshop an old profile becomes. Pure. */
export function workshopFromLegacy(g: GameState, old: OldProfile): Workshop {
  const ws = emptyWorkshop(g)
  ws.skill = old.skill
  ws.rep = old.rep
  if (old.project) ws.ideas.push({ id: old.project.key, got: g.year, q: old.project.q, builds: 1, custom: old.project.idea })
  ws.made = old.made.map((m) => ({ id: `legacy-${safeId(m.id)}`, name: m.name, emoji: '\u{1F4A1}', route: 'legacy', year: m.year }))
  return ws
}

// ---------------------------------------------------------------------------
// Old personal invention IP (Asset.details.inventorIp)

const LICENCE_RATE: Record<string, number> = { specialist: 0.12, industrial: 0.08, distribution: 0.05 }

/** A raw old company product row and the company it belongs to. */
interface OldProduct { company: Asset; row: Record<string, Json> }
function oldProducts(g: GameState): OldProduct[] {
  const out: OldProduct[] = []
  for (const a of businessAssets(g)) {
    const rows = a.details.inventionProducts
    if (!Array.isArray(rows)) continue
    for (const r of rows) {
      const row = rec(r)
      if (text(row.id) && row.ws2 !== 1) out.push({ company: a, row })
    }
  }
  return out
}

/** The Workshop record an old personal invention asset becomes (pure; null when none). */
export function legacyInv(g: GameState, a: Asset): Inv | null {
  if (a.kind !== 'invention' || a.details.inv2) return null
  const ip = rec(a.details.inventorIp)
  const field = isField(ip.field) ? ip.field : null
  const tier = tierOf(ip.kind)
  if (!field || !tier) return null
  const closed = field === 'finance' || ip.closedLoop === true
  const fit = fin(ip.marketFit, 1, 0.1, 2)
  const idea = custom(a.name, field, tier, appealFromFit(fit), closed ? 'A confidential model from your old lab.' : 'An invention from your old research lab.')
  const country = text(ip.country, 8) || g.character.countryId
  const patent = closed ? null : patentFrom(readProtections(ip.protections), country)
  const q = qualityFrom(fin(ip.reliability, 1, 0.3, 1.3), fit)
  const def = ideaDef(`legacy-${safeId(a.id)}`, idea)!
  const inv = blankInv(def, { custom: idea, q, builds: 1, patent, country, price: priceOf(def), inventor: text(ip.inventor, 120) })
  inv.legacyValue = Math.max(0, fin(a.value))
  // A company that licensed it keeps making it; outside manufacturing licences keep paying royalties.
  const licensed = oldProducts(g).find((p) => text(p.row.ipId) === a.id && p.row.rights === 'license' && fin(p.row.expires, 0, 0, 100_000) > g.year - 1)
  const contracts = (Array.isArray(a.details.inventionLicenses) ? a.details.inventionLicenses : []).map(rec)
    .filter((c) => typeof c.partner === 'string' && Object.hasOwn(LICENCE_RATE, c.partner) && fin(c.expires, 0, 0, 100_000) > g.year - 1)
  const started = licensed ? Math.round(fin(licensed.row.started, g.year, 1800, g.year))
    : contracts.length ? Math.min(...contracts.map((c) => Math.round(fin(c.started, g.year, 1800, g.year)))) : -1
  if (!closed && started > 0) {
    inv.stage = 'launched'
    inv.launched = started
    inv.peak = Math.round(expectedPeak(def, q, idea.a, patent?.scope ?? null, country, started, false))
    if (licensed) {
      inv.route = 'company'
      inv.company = licensed.company.id
      inv.maker = licensed.company.name
      inv.margin = COMPANY_MARGIN
      inv.last = Math.round(fin(licensed.row.lastYear, started - 1, -1, 100_000))
    } else {
      inv.route = 'license'
      inv.rate = Math.round((contracts.reduce((s, c) => s + LICENCE_RATE[String(c.partner)], 0) / contracts.length) * 1000) / 1000
      inv.maker = 'Licensed manufacturers'
      inv.last = Math.max(started - 1, ...contracts.map((c) => Math.round(fin(c.lastYear, started - 1, -1, 100_000))))
    }
  }
  return inv
}

/** An invention asset's record, new or old format. Pure: safe in menus. */
export function readInv(g: GameState, a: Asset): Inv | null {
  if (a.kind !== 'invention') return null
  return readInvRaw(a) ?? legacyInv(g, a)
}

// ---------------------------------------------------------------------------
// Old company inventions: products, research and patents

export interface LegacyPatent { id?: string; name: string; kind: string; launched: number; expires: number; protections?: { country: string; filed: number; expires: number }[] }

/** Old company patents (BizState.expansion.patents), normalized like the old reader: the last copy of an id wins. Pure. */
export function legacyPatents(b: { expansion?: Json }): LegacyPatent[] {
  const rows = (Array.isArray(rec(b.expansion).patents) ? (rec(b.expansion).patents as Json[]) : []).map(rec)
  const byKey = new Map<string, LegacyPatent>()
  for (const x of rows) {
    const name = text(x.name, 120)
    if (!name || !tierOf(x.kind)) continue
    const protections = readProtections(x.protections)
    const p: LegacyPatent = { ...(typeof x.id === 'string' ? { id: x.id } : {}), name, kind: String(x.kind), launched: Math.round(fin(x.launched, 0, 0, 100_000)), expires: Math.round(fin(x.expires, 0, 0, 100_000)), ...(protections.length ? { protections } : {}) }
    const key = p.id ? `id:${p.id}` : `legacy:${p.kind}:${p.name}`
    byKey.delete(key)
    byKey.set(key, p)
  }
  return [...byKey.values()]
}

function companyInvention(g: GameState, company: Asset, key: string, name: string, field: Field, tier: Tier, appeal: Level, q: number, started: number, last: number, patent: Patent | null): Asset {
  const idea = custom(name, field, tier, appeal, `Made by ${company.name}.`)
  const def = ideaDef(`legacy-${safeId(key)}`, idea)!
  const b = readBiz(g, company)
  const launched = Math.max(1800, started)
  const inv = blankInv(def, { custom: idea, q, builds: 1, patent, country: b.countryId, price: priceOf(def) })
  Object.assign(inv, {
    stage: 'launched', route: 'company', margin: COMPANY_MARGIN, company: company.id, maker: company.name, launched,
    peak: Math.round(expectedPeak(def, q, appeal, patent?.scope ?? null, b.countryId, launched, false)), last: Math.max(launched - 1, last),
  })
  const a: Asset = { id: `inv-${safeId(company.id)}-${safeId(key)}`.slice(0, 120), kind: 'invention', name: idea.name, emoji: idea.emoji, purchasePrice: 0, value: 0, condition: 100, purchasedAge: g.character.age, upkeep: 0, details: {} }
  saveInv(a, inv)
  return a
}

/** Field of an old company: the product's own field when known, else from the industry. */
export function fieldFor(industry: string, raw: unknown): Field {
  if (isField(raw) && raw !== 'finance') return raw
  return /energy|solar|battery|fusion|carbonCapture/.test(industry) ? 'energy' : /biotech|pharma|clinic|neurotech/.test(industry) ? 'health'
    : /software|semiconductor|aiLab|quantum|robotics|gameStudio|cybersecurity/.test(industry) ? 'computing'
      : /farm|food|restaurant|cafe|bakery|grocery/.test(industry) ? 'food' : /logistics|autoShop|electricVehicles|spaceTech|drones/.test(industry) ? 'transport' : 'materials'
}

/** True when anything old is still waiting to be migrated. Pure and cheap. */
export function needsMigration(g: GameState): boolean {
  if (g.flags[OLD_FLAG] !== undefined || g.flags.inventionImpact !== undefined) return true
  for (const a of g.assets) {
    if (a.kind === 'invention' && !a.details.inv2) return true
    if (a.kind !== 'business') continue
    if (Array.isArray(a.details.inventionProducts) && a.details.inventionProducts.some((r) => rec(r).ws2 !== 1)) return true
    if (typeof a.details.inventionStaff === 'number' && a.details.inventionStaff > 0) return true
    const x = rec(a.details.expansion)
    if (x.research || (Array.isArray(x.patents) && x.patents.length)) return true
  }
  return false
}

/**
 * Write the migration once. `settled` is the last fiscal year already paid out under the old
 * rules when a row does not say (the yearly hook passes g.year - 2, an action g.year - 1).
 */
export function migrateLegacy(g: GameState, settled = g.year - 1): boolean {
  if (!needsMigration(g)) return false
  // 1. The Inventor profile → workshop (skill, reputation, the active project as an idea).
  const old = legacyProfile(g)
  if (old) {
    const stored = rec(g.flags[FLAG])
    if (!ownerMatches(g, stored.owner)) g.flags[FLAG] = { ...workshopFromLegacy(g, old), owner: ownerKey(g) } as unknown as Json
    else {
      const ws = normalizeWorkshop(g, stored)
      ws.skill = Math.max(ws.skill, old.skill)
      ws.rep = Math.max(ws.rep, old.rep)
      if (old.project && !ws.ideas.some((i) => i.id === old.project!.key) && ws.ideas.length < 12) ws.ideas.push({ id: old.project.key, got: g.year, q: old.project.q, builds: 1, custom: old.project.idea })
      g.flags[FLAG] = ws as unknown as Json
    }
  }
  delete g.flags[OLD_FLAG]
  delete g.flags.inventionImpact
  const rep = normalizeWorkshop(g, g.flags[FLAG]).rep
  // 2. Personal invention assets.
  const marked = new Set<string>()
  for (const a of g.assets) {
    if (a.kind !== 'invention' || a.details.inv2) continue
    const inv = legacyInv(g, a)
    if (!inv) {
      // Unreadable old IP: keep the asset and its value as a plain, unpatented invention.
      const idea: CustomIdea = { name: text(a.name) || 'Old invention', emoji: '\u{1F4A1}', blurb: 'An invention from an old notebook.', cat: 'gadget', d: 2, a: 3 }
      const def = ideaDef(`legacy-${safeId(a.id)}`, idea)!
      const plain = blankInv(def, { custom: idea, q: 40, builds: 1, patent: null, country: g.character.countryId, price: priceOf(def) })
      plain.legacyValue = Math.max(0, fin(a.value))
      saveInv(a, plain)
      continue
    }
    if (inv.route === 'company') {
      const p = oldProducts(g).find((x) => text(x.row.ipId) === a.id && x.row.rights === 'license')
      if (p) marked.add(`${p.company.id}\u0000${text(p.row.id)}`)
    }
    saveInv(a, inv)
    a.value = inventionValue(g, inv, ideaDef(inv.idea, inv.custom)!, rep)
    delete a.details.inventorIp
    delete a.details.inventionLicenses
  }
  // 3. Company products, research and patents → "made in my company".
  const added: Asset[] = []
  for (const company of businessAssets(g)) {
    const b = bizOf(g, company)
    const x = rec(b.expansion)
    const patents = legacyPatents(b)
    const rows = Array.isArray(b.inventionProducts) ? b.inventionProducts.map(rec) : []
    const productIds = new Set(rows.map((r) => text(r.id)))
    for (const row of rows) {
      if (row.ws2 === 1) continue
      row.ws2 = 1
      const id = text(row.id)
      if (!id || marked.has(`${company.id}\u0000${id}`) || row.rights === 'license') continue
      const tier = tierOf(row.kind)
      if (!tier) continue
      const fit = fin(row.marketFit, 1, 0.1, 2)
      const pat = patents.find((p) => p.id === id)
      const prot = readProtections(row.protections).length ? readProtections(row.protections) : pat?.protections ?? (pat ? [{ country: b.countryId, filed: pat.launched, expires: pat.expires }] : [])
      const started = Math.round(fin(row.started, settled, 1800, 100_000))
      const last = typeof row.lastYear === 'number' && Number.isFinite(row.lastYear) && row.lastYear >= started - 1 ? Math.round(row.lastYear) : Math.max(started - 1, settled)
      added.push(companyInvention(g, company, id, text(row.name, 80) || 'Company invention', fieldFor(b.industry, row.field), tier, appealFromFit(fit), qualityFrom(fin(row.reliability, 1, 0.3, 1.3), fit), started, last, patentFrom(prot, b.countryId)))
    }
    for (const p of patents) {
      if (p.id && productIds.has(p.id)) continue
      const tier = tierOf(p.kind)!
      const prot = p.protections ?? [{ country: b.countryId, filed: p.launched, expires: p.expires }]
      added.push(companyInvention(g, company, p.id ?? safeId(p.name), p.name, fieldFor(b.industry, null), tier, 3, 60, p.launched, Math.max(p.launched - 1, settled), patentFrom(prot, b.countryId)))
    }
    const research = rec(x.research)
    const rtier = tierOf(research.kind)
    if (rtier && text(research.name)) {
      // Already paid for and guaranteed to finish: it launches the year it would have.
      const done = Math.round(fin(research.started, g.year, 1800, 100_000) + fin(research.years, 0, 0, 8))
      added.push(companyInvention(g, company, text(research.id) || `research-${done}`, text(research.name, 80), fieldFor(b.industry, null), rtier, 3, 60, done, Math.max(done - 1, settled), { scope: 'home', country: b.countryId, filed: done, expires: done + 20 }))
    }
    if (Object.keys(x).length) {
      delete x.research
      delete x.patents
      b.expansion = x as unknown as Json
    }
    if (rows.length) b.inventionProducts = rows as unknown as Json
    if ((b.inventionStaff ?? 0) > 0) {
      b.employees = Math.max(0, b.employees - (b.inventionStaff ?? 0))
      b.inventionStaff = 0
    }
    delete b.inventionLicenses
    delete b.inventionLicenseSettlement
  }
  for (const a of added) if (!g.assets.some((y) => y.id === a.id)) g.assets.push(a)
  return true
}

// Old popups still sitting in a saved queue resolve harmlessly.
defineScript('invention.strategicPressure', (g) => {
  notice(g, 'Old News', 'That old strategic request no longer applies. Your invention is safe in your Workshop.', { emoji: '\u{1F4A1}' })
})
defineScript('inventor.personal.start', () => {})
