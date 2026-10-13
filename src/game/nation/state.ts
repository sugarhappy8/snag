// Politics 2.0 state. Two plain-JSON records:
//   g.flags['nation.policy']  the world: every country's laws, taxes, tariffs, institutions and
//                              legislature. Survives heirs; laws stay until someone repeals them.
//   g.flags['nation.me']      the character: political capital, legitimacy, fear, the slush fund,
//                              offshore money, case files and rivals. Owner-stamped: heirs start clean.
// Readers normalize anything missing or damaged and never write. Writers always replace the root
// object so pure caches keyed on it (effects.ts) stay valid.
import type { GameState, Json } from '../types'
import { COUNTRIES } from '../world'
import { ownerKey, ownerMatches } from '../special/common'
import {
  BUDGET_LINES, BUDGET_MAX, BUDGET_MIN, LEGAL_IDS, NEW_TAX_IDS, PARTY_IDS, STATE_SECTORS, TARIFF_MAX, TAX_IDS, TAXES, TRADE_INPUT_IDS,
  type BudgetLine, type LegalId, type NewTaxId, type TariffInput, type TaxId, type TradeInput,
} from './data'
import type { Sector } from '../economy/model'

export const POLICY_KEY = 'nation.policy'
export const ME_KEY = 'nation.me'

export interface Layer {
  taxes: Partial<Record<TaxId, number>>
  budget: Partial<Record<BudgetLine, number>>
  /** Minimum-wage pressure in % (+20 = a 20% higher minimum). */
  minWage: number
  /** Where a regional or city layer applies (the region/city the official ran). */
  place: string
}
export interface NewTax { level: number; industry: string }
export interface TariffRule { input: TariffInput; partner: string; add: number }
export interface Retaliation { from: string; input: TariffInput; add: number; until: number }
export interface Shock {
  id: string; label: string; until: number
  growth: number; inflation: number; unemployment: number; confidence: number
  sector: Sector | ''; demand: number
  /** One-off public spending in the next economic year, share of GDP (aid, bailouts, stimulus). */
  spend?: number
}
export interface Institutions {
  /** 0-1: share of judges appointed for loyalty. */
  courtPacked: number
  /** 0-1: share of the media you control. */
  mediaControl: number
  /** Extra terms allowed beyond the normal limit (99 = no limit). */
  extraTerms: number
  /** Emergency powers last until this year (inclusive); 0 = none. */
  emergencyUntil: number
  /** Elections postponed until this year; 0 = on schedule. */
  postponedUntil: number
  /** Seat bonus at the next election from redrawn districts (0-0.08). */
  gerrymander: number
  regime: 'democracy' | 'hybrid' | 'authoritarian'
}
export interface Legislature {
  seats: Record<string, number>
  /** Parties in government (the head of government's party first). */
  gov: string[]
  /** Year the seats were last set. */
  year: number
  /** NPC head of government's party when the player isn't in charge. */
  leaderParty: string
}
export interface ReportRow { year: number; growth: number; unemployment: number; inflation: number; debt: number; deficit: number; approval: number; rating: string }
export interface CountryPolicy {
  v: 1
  country: string
  national: Layer
  regional: Layer
  city: Layer
  newTaxes: Partial<Record<NewTaxId, NewTax>>
  /** Corporate tax relief by industry, levels 1-3. */
  breaks: Record<string, number>
  labor: number
  environment: number
  dereg: Partial<Record<Sector, number>>
  nationalized: Partial<Record<Sector, number>>
  /** 1 legal / -1 banned / absent = the country's own rule. */
  legal: Partial<Record<LegalId, number>>
  tariffs: TariffRule[]
  deals: Record<string, number>
  sanctions: Record<string, number>
  exportBans: Partial<Record<TradeInput, number>>
  retaliation: Retaliation[]
  /** Year each measure took effect: 'tax.income', 'budget.military', 'tariff.energy.cn'... */
  since: Record<string, number>
  institutions: Institutions
  legislature: Legislature
  shocks: Shock[]
  /** Debt written off at the next economic year (a default), share of GDP. */
  writeDown: number
  /** Public money lost to graft, share of GDP (decays yearly; wastes services and growth). */
  graft: number
  /** Extra government interest from a poor rating, set each year. */
  rating: string
  ratingYear: number
  reports: ReportRow[]
}
export interface PolicyState { v: 1; countries: Record<string, CountryPolicy> }

export interface CaseFile {
  id: string
  kind: string
  label: string
  year: number
  /** 0-1: how provable it is. */
  evidence: number
  /** Dirty money involved. */
  amount: number
  status: 'open' | 'closed'
  country: string
}
export interface Rival {
  id: string
  name: string
  role: 'opposition' | 'party' | 'lobbyist' | 'oligarch'
  party: string
  /** 0-100. */
  strength: number
  goal: string
  /** -100 hostile .. +100 ally. */
  mood: number
  status: 'active' | 'jailed' | 'exiled' | 'coopted' | 'gone'
  since: number
}
export interface Me {
  v: 1
  owner: string
  capital: number
  legitimacy: number
  fear: number
  /** Loyalty of the security forces, 0-100. */
  loyalty: number
  /** Scrutiny on your schemes, 0-100 (cools yearly). */
  heat: number
  /** Unlaundered money (not bank money, not net worth). */
  dirty: number
  /** Money hidden abroad (not bank money). */
  offshore: number
  /** Lifetime totals, for the record and the balance tests. */
  taken: number
  laundered: number
  seized: number
  cases: CaseFile[]
  rivals: Rival[]
  blindTrust: boolean
  /** Year-keyed cooldowns for asks, crises and offers. */
  cool: Record<string, number>
  /** Approval by voter group from last year's report (display only). */
  groups: Record<string, number>
  exile: string
  ledger: string[]
  stats: Record<string, number>
}

// ---------------------------------------------------------------------------
// Normalization helpers

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {})
export const finite = (v: unknown, fallback: number, lo: number, hi: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback)
const text = (v: unknown, fallback = '', max = 80): string => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max) || fallback : fallback)
const year = (v: unknown, fallback = 0): number => Math.round(finite(v, fallback, -10_000, 100_000))
const validCountry = new Set(COUNTRIES.map(c => c.id))

function layer(v: unknown, scope: 'national' | 'regional' | 'city'): Layer {
  const r = rec(v), taxes: Layer['taxes'] = {}, budget: Layer['budget'] = {}
  const t = rec(r.taxes), b = rec(r.budget)
  for (const id of TAX_IDS) {
    if (!TAXES[id].scopes.includes(scope)) continue
    const n = finite(t[id], 0, TAXES[id].min, TAXES[id].max)
    if (n) taxes[id] = Math.round(n * 100) / 100
  }
  for (const id of BUDGET_LINES) {
    const n = finite(b[id], 1, BUDGET_MIN, BUDGET_MAX)
    if (n !== 1) budget[id] = Math.round(n * 100) / 100
  }
  return { taxes, budget, minWage: Math.round(finite(r.minWage, 0, -100, 100)), place: text(r.place, '', 80) }
}

export function emptyLayer(): Layer { return { taxes: {}, budget: {}, minWage: 0, place: '' } }

export function defaultInstitutions(): Institutions {
  return { courtPacked: 0, mediaControl: 0, extraTerms: 0, emergencyUntil: 0, postponedUntil: 0, gerrymander: 0, regime: 'democracy' }
}

export function emptyPolicy(country: string): CountryPolicy {
  return {
    v: 1, country, national: emptyLayer(), regional: emptyLayer(), city: emptyLayer(), newTaxes: {}, breaks: {}, labor: 0, environment: 0,
    dereg: {}, nationalized: {}, legal: {}, tariffs: [], deals: {}, sanctions: {}, exportBans: {}, retaliation: [], since: {},
    institutions: defaultInstitutions(), legislature: { seats: {}, gov: [], year: 0, leaderParty: '' }, shocks: [], writeDown: 0, graft: 0, rating: '', ratingYear: 0, reports: [],
  }
}

function seats(v: unknown): Record<string, number> {
  const r = rec(v), out: Record<string, number> = {}
  let total = 0
  for (const id of PARTY_IDS) {
    const n = finite(r[id], 0, 0, 1)
    if (n > 0) { out[id] = n; total += n }
  }
  if (!(total > 0)) return {}
  for (const id of Object.keys(out)) out[id] = Math.round(out[id] / total * 10_000) / 10_000
  return out
}

export function normalizePolicy(v: unknown, country: string): CountryPolicy {
  const r = rec(v), out = emptyPolicy(country)
  if (r.v !== 1) return out
  out.national = layer(r.national, 'national')
  out.regional = layer(r.regional, 'regional')
  out.city = layer(r.city, 'city')
  const nt = rec(r.newTaxes)
  for (const id of NEW_TAX_IDS) {
    const row = rec(nt[id]), level = Math.round(finite(row.level, 0, 0, 3))
    if (level > 0) out.newTaxes[id] = { level, industry: text(row.industry, '', 40) }
  }
  for (const [id, n] of Object.entries(rec(r.breaks)).slice(0, 40)) {
    const level = Math.round(finite(n, 0, 0, 3))
    if (level > 0 && /^[a-zA-Z]{2,30}$/.test(id)) out.breaks[id] = level
  }
  out.labor = Math.round(finite(r.labor, 0, -1, 1))
  out.environment = Math.round(finite(r.environment, 0, -1, 1))
  for (const s of STATE_SECTORS) {
    if (finite(rec(r.dereg)[s], 0, 0, 1e5) > 0) out.dereg[s] = year(rec(r.dereg)[s])
    if (finite(rec(r.nationalized)[s], 0, 0, 1e5) > 0) out.nationalized[s] = year(rec(r.nationalized)[s])
  }
  for (const id of LEGAL_IDS) {
    const n = finite(rec(r.legal)[id], 0, -1, 1)
    if (n === 1 || n === -1) out.legal[id] = n
  }
  if (Array.isArray(r.tariffs)) for (const row of r.tariffs.slice(0, 60)) {
    const t = rec(row), input = t.input as TariffInput, partner = text(t.partner, '', 8)
    if (![...TRADE_INPUT_IDS, 'all'].includes(input) || !(partner === 'all' || validCountry.has(partner)) || partner === country) continue
    const add = Math.round(finite(t.add, 0, 0, TARIFF_MAX))
    if (add > 0 && !out.tariffs.some(x => x.input === input && x.partner === partner)) out.tariffs.push({ input, partner, add })
  }
  for (const [key, target] of [['deals', out.deals], ['sanctions', out.sanctions]] as const) {
    for (const [id, y] of Object.entries(rec(r[key])).slice(0, 60)) if (validCountry.has(id) && id !== country) target[id] = year(y)
  }
  for (const id of TRADE_INPUT_IDS) if (finite(rec(r.exportBans)[id], 0, 0, 1e5) > 0) out.exportBans[id] = year(rec(r.exportBans)[id])
  if (Array.isArray(r.retaliation)) for (const row of r.retaliation.slice(0, 60)) {
    const t = rec(row), from = text(t.from, '', 8), input = t.input as TariffInput
    if (!validCountry.has(from) || from === country || ![...TRADE_INPUT_IDS, 'all'].includes(input)) continue
    out.retaliation.push({ from, input, add: Math.round(finite(t.add, 0, 0, TARIFF_MAX)), until: year(t.until) })
  }
  for (const [k, y] of Object.entries(rec(r.since)).slice(0, 300)) if (/^[\w.:-]{1,60}$/.test(k)) out.since[k] = year(y)
  const inst = rec(r.institutions)
  out.institutions = {
    courtPacked: finite(inst.courtPacked, 0, 0, 1), mediaControl: finite(inst.mediaControl, 0, 0, 1),
    extraTerms: Math.round(finite(inst.extraTerms, 0, 0, 99)), emergencyUntil: year(inst.emergencyUntil), postponedUntil: year(inst.postponedUntil),
    gerrymander: finite(inst.gerrymander, 0, 0, .08), regime: inst.regime === 'authoritarian' || inst.regime === 'hybrid' ? inst.regime : 'democracy',
  }
  const leg = rec(r.legislature)
  const gov = Array.isArray(leg.gov) ? [...new Set(leg.gov.filter((p): p is string => typeof p === 'string' && PARTY_IDS.includes(p)))].slice(0, 4) : []
  out.legislature = { seats: seats(leg.seats), gov, year: year(leg.year), leaderParty: PARTY_IDS.includes(String(leg.leaderParty)) ? String(leg.leaderParty) : '' }
  if (Array.isArray(r.shocks)) for (const row of r.shocks.slice(-12)) {
    const s = rec(row), id = text(s.id, '', 60)
    if (!id) continue
    out.shocks.push({ id, label: text(s.label, 'A crisis', 120), until: year(s.until), growth: finite(s.growth, 0, -.08, .05), inflation: finite(s.inflation, 0, -.05, .1),
      unemployment: finite(s.unemployment, 0, -.04, .08), confidence: finite(s.confidence, 0, -.3, .2), sector: (STATE_SECTORS as readonly string[]).includes(String(s.sector)) || ['essentials', 'consumer', 'leisure', 'housing', 'public'].includes(String(s.sector)) ? s.sector as Sector : '', demand: finite(s.demand, 0, -.5, .5), ...(finite(s.spend, 0, 0, .1) > 0 ? { spend: finite(s.spend, 0, 0, .1) } : {}) })
  }
  out.writeDown = finite(r.writeDown, 0, 0, 1.5)
  out.graft = finite(r.graft, 0, 0, .1)
  out.rating = /^(AAA|AA|A|BBB|BB|B|CCC|D)$/.test(String(r.rating)) ? String(r.rating) : ''
  out.ratingYear = year(r.ratingYear)
  if (Array.isArray(r.reports)) for (const row of r.reports.slice(-12)) {
    const p = rec(row)
    out.reports.push({ year: year(p.year), growth: finite(p.growth, 0, -1, 1), unemployment: finite(p.unemployment, 0, 0, 1), inflation: finite(p.inflation, 0, -1, 1e7),
      debt: finite(p.debt, 0, 0, 5), deficit: finite(p.deficit, 0, -1, 1), approval: finite(p.approval, 50, 0, 100), rating: text(p.rating, '', 4) })
  }
  return out
}

const policyCache = new WeakMap<object, PolicyState>()
/** The world's policy record (read-only view; never mutate it). */
export function policyState(g: GameState): PolicyState {
  const raw = g.flags[POLICY_KEY]
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return EMPTY_STATE
  const hit = policyCache.get(raw)
  if (hit) return hit
  const countries: Record<string, CountryPolicy> = {}
  for (const [id, row] of Object.entries(rec(rec(raw).countries)).slice(0, 300)) if (validCountry.has(id)) countries[id] = normalizePolicy(row, id)
  const out: PolicyState = { v: 1, countries }
  policyCache.set(raw, out)
  policyCache.set(out, out)
  return out
}
const EMPTY_STATE: PolicyState = { v: 1, countries: {} }

/** One country's laws (read-only); an untouched country gets its defaults. */
export function policyOf(g: GameState, country: string): CountryPolicy {
  return policyState(g).countries[country] ?? emptyPolicy(country)
}
export function hasPolicy(g: GameState, country: string): boolean {
  return !!policyState(g).countries[country]
}

/** Replace one country's record (writers only: actions and yearly hooks). */
export function writePolicy(g: GameState, p: CountryPolicy): void {
  const state = policyState(g)
  const next: PolicyState = { v: 1, countries: { ...state.countries, [p.country]: p } }
  g.flags[POLICY_KEY] = next as unknown as Json
  policyCache.set(next, next)
}

/** A deep, mutable copy of a country's record for an action to edit, then writePolicy(). */
export function editPolicy(g: GameState, country: string): CountryPolicy {
  return JSON.parse(JSON.stringify(policyOf(g, country))) as CountryPolicy
}

// ---------------------------------------------------------------------------
// The character's own record

export function freshMe(g: GameState): Me {
  return { v: 1, owner: ownerKey(g), capital: 30, legitimacy: 70, fear: 10, loyalty: 55, heat: 0, dirty: 0, offshore: 0, taken: 0, laundered: 0, seized: 0, cases: [], rivals: [], blindTrust: false, cool: {}, groups: {}, exile: '', ledger: [], stats: {} }
}

function normalizeMe(g: GameState, v: unknown): Me {
  const r = rec(v), out = freshMe(g)
  out.capital = finite(r.capital, 30, 0, 100)
  out.legitimacy = finite(r.legitimacy, 70, 0, 100)
  out.fear = finite(r.fear, 10, 0, 100)
  out.loyalty = finite(r.loyalty, 55, 0, 100)
  out.heat = finite(r.heat, 0, 0, 100)
  out.dirty = Math.round(finite(r.dirty, 0, 0, 1e13))
  out.offshore = Math.round(finite(r.offshore, 0, 0, 1e13))
  out.taken = Math.round(finite(r.taken, 0, 0, 1e14))
  out.laundered = Math.round(finite(r.laundered, 0, 0, 1e14))
  out.seized = Math.round(finite(r.seized, 0, 0, 1e14))
  if (Array.isArray(r.cases)) for (const row of r.cases.slice(-80)) {
    const c = rec(row), id = text(c.id, '', 60)
    if (!id || out.cases.some(x => x.id === id)) continue
    out.cases.push({ id, kind: text(c.kind, 'graft', 30), label: text(c.label, 'Abuse of office', 140), year: year(c.year), evidence: finite(c.evidence, .3, 0, 1),
      amount: Math.round(finite(c.amount, 0, 0, 1e13)), status: c.status === 'closed' ? 'closed' : 'open', country: validCountry.has(String(c.country)) ? String(c.country) : g.character.countryId })
  }
  if (Array.isArray(r.rivals)) for (const row of r.rivals.slice(0, 8)) {
    const p = rec(row), id = text(p.id, '', 40)
    if (!id) continue
    const role = ['opposition', 'party', 'lobbyist', 'oligarch'].includes(String(p.role)) ? p.role as Rival['role'] : 'opposition'
    const status = ['active', 'jailed', 'exiled', 'coopted', 'gone'].includes(String(p.status)) ? p.status as Rival['status'] : 'active'
    out.rivals.push({ id, name: text(p.name, 'A rival', 60), role, party: PARTY_IDS.includes(String(p.party)) ? String(p.party) : 'independent', strength: finite(p.strength, 50, 0, 100),
      goal: text(p.goal, '', 120), mood: finite(p.mood, -20, -100, 100), status, since: year(p.since) })
  }
  out.blindTrust = r.blindTrust === true
  for (const [k, y] of Object.entries(rec(r.cool)).slice(0, 80)) if (/^[\w.:-]{1,60}$/.test(k)) out.cool[k] = year(y)
  for (const [k, n] of Object.entries(rec(r.groups)).slice(0, 10)) if (/^[a-z]{2,12}$/.test(k)) out.groups[k] = Math.round(finite(n, 50, 0, 100))
  out.exile = validCountry.has(String(r.exile)) ? String(r.exile) : ''
  out.ledger = Array.isArray(r.ledger) ? r.ledger.filter((s): s is string => typeof s === 'string').slice(-12).map(s => s.slice(0, 200)) : []
  for (const [k, n] of Object.entries(rec(r.stats)).slice(0, 40)) if (/^[a-zA-Z]{1,30}$/.test(k)) out.stats[k] = Math.round(finite(n, 0, 0, 1e9))
  return out
}

const meCache = new WeakMap<object, Me>()
/** The character's political record (read-only view). Another generation's record reads as fresh. */
export function meView(g: GameState): Me {
  const raw = g.flags[ME_KEY]
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !ownerMatches(g, (raw as Record<string, unknown>).owner)) return freshMe(g)
  const hit = meCache.get(raw)
  if (hit && hit.owner === ownerKey(g)) return hit
  const out = normalizeMe(g, raw)
  meCache.set(raw, out)
  return out
}
export function hasMe(g: GameState): boolean {
  const raw = g.flags[ME_KEY]
  return !!raw && typeof raw === 'object' && !Array.isArray(raw) && ownerMatches(g, (raw as Record<string, unknown>).owner)
}
/** A mutable copy for actions and hooks; save it with writeMe(). */
export function editMe(g: GameState): Me {
  return JSON.parse(JSON.stringify(meView(g))) as Me
}
export function writeMe(g: GameState, me: Me): void {
  me.owner = ownerKey(g)
  me.ledger = me.ledger.slice(-12)
  me.cases = me.cases.slice(-80)
  const copy = JSON.parse(JSON.stringify(me)) as Me
  g.flags[ME_KEY] = copy as unknown as Json
  meCache.set(copy, copy)
}
export function note(me: Me, line: string): void {
  me.ledger = [...me.ledger, line.slice(0, 200)].slice(-12)
}
export function bumpStat(me: Me, key: string, by = 1): void {
  me.stats[key] = (me.stats[key] ?? 0) + by
}

/** A default's write-down is applied by one economic transition, then cleared. */
export function consumeWriteDowns(g: GameState): void {
  const state = policyState(g)
  for (const p of Object.values(state.countries)) {
    if (p.writeDown > 0) writePolicy(g, { ...p, writeDown: 0 })
  }
}

/** Open a case file: evidence that can surface through journalists, auditors or a trial later. */
export function addCase(g: GameState, me: Me, c: { kind: string; label: string; evidence: number; amount: number }): CaseFile {
  bumpStat(me, 'cases')
  const file: CaseFile = { id: `c${g.year}-${me.stats.cases}`, kind: c.kind.slice(0, 30), label: c.label.slice(0, 140), year: g.year, evidence: Math.max(0, Math.min(1, c.evidence)), amount: Math.max(0, Math.round(c.amount)), status: 'open', country: g.character.countryId }
  me.cases.push(file)
  return file
}
