// Who holds which office, and what that office can do in Politics 2.0. The political systems
// (titles, parliamentary or presidential, regional heads) moved here from special/politics.ts so
// the nation/ modules never import the career module: politics.ts imports from here and registers
// the few career actions (leaving office, insider bets) the nation modules need.
import { clamp100 } from '../special/common'
import type { GameState, Job } from '../types'
import { getCountry } from '../world'
import { PARTY_STANCE, type Scope } from './data'

// ---------------------------------------------------------------------------
// Political systems: who runs things here.
//
// The ladder is the same everywhere (four rungs), but the rungs follow the country: a school
// board, Governor and President in the US; a city council, Member of Parliament and Prime
// Minister in Britain; a Minister-President and a Chancellor in Germany; a Chief Minister in
// India; a Taoiseach in Ireland. Monarchies elect prime ministers, never kings.

export const PM_COUNTRIES = [
  'gb', 'jp', 'in', 'ca', 'au', 'nz', 'it', 'es', 'nl', 'se', 'no', 'dk', 'be', 'il', 'gr', 'pt', 'pl',
  'hu', 'cz', 'sk', 'hr', 'ee', 'fi', 'ro', 'bd', 'np', 'pk', 'iq', 'lb', 'sg', 'my', 'th', 'jm', 'bs', 'bz',
  'pg', 'ws', 'aw', 'ge', 'mn', 'rs',
]

export const LEADER_TITLES: Record<string, string> = {
  de: 'Chancellor',
  at: 'Chancellor',
  ie: 'Taoiseach',
  ad: 'Head of Government',
  mc: 'Minister of State',
  ch: 'President of the Confederation',
}

export function leaderTitle(g: GameState): string {
  const id = g.character.countryId
  if (LEADER_TITLES[id]) return LEADER_TITLES[id]
  if (PM_COUNTRIES.includes(id)) return 'Prime Minister'
  return getCountry(id).monarchy ? 'Prime Minister' : 'President'
}

/** Heads of government who answer to parliament (no-confidence votes instead of impeachment). */
export function parliamentary(g: GameState): boolean {
  const t = leaderTitle(g)
  return t !== 'President'
}

/** Countries with an elected head of each state/province, and what that office is called. */
export const REGIONAL_HEADS: Record<string, { title: string; unit: string }> = {
  us: { title: 'Governor', unit: 'state' },
  mx: { title: 'Governor', unit: 'state' },
  br: { title: 'Governor', unit: 'state' },
  ar: { title: 'Governor', unit: 'province' },
  ng: { title: 'Governor', unit: 'state' },
  id: { title: 'Governor', unit: 'province' },
  jp: { title: 'Governor', unit: 'prefecture' },
  co: { title: 'Governor', unit: 'department' },
  ve: { title: 'Governor', unit: 'state' },
  pe: { title: 'Regional Governor', unit: 'region' },
  bo: { title: 'Governor', unit: 'department' },
  py: { title: 'Governor', unit: 'department' },
  cl: { title: 'Regional Governor', unit: 'region' },
  ke: { title: 'Governor', unit: 'county' },
  ru: { title: 'Governor', unit: 'region' },
  ca: { title: 'Premier', unit: 'province' },
  au: { title: 'Premier', unit: 'state' },
  de: { title: 'Minister-President', unit: 'state' },
  at: { title: 'Governor', unit: 'state' },
  in: { title: 'Chief Minister', unit: 'state' },
  pk: { title: 'Chief Minister', unit: 'province' },
}

/** Elsewhere the middle rung is a seat in the national legislature. */
export const LEGISLATORS: Record<string, { title: string; house: string }> = {
  gb: { title: 'Member of Parliament', house: 'the House of Commons' },
  fr: { title: 'Member of the National Assembly', house: 'the National Assembly' },
  it: { title: 'Member of the Chamber of Deputies', house: 'the Chamber of Deputies' },
  es: { title: 'Member of the Congress of Deputies', house: 'the Congress of Deputies' },
  nl: { title: 'Member of the House of Representatives', house: 'the House of Representatives' },
  be: { title: 'Member of the Chamber of Representatives', house: 'the Chamber of Representatives' },
  se: { title: 'Member of the Riksdag', house: 'the Riksdag' },
  no: { title: 'Member of the Storting', house: 'the Storting' },
  dk: { title: 'Member of the Folketing', house: 'the Folketing' },
  fi: { title: 'Member of the Eduskunta', house: 'the Eduskunta' },
  ie: { title: 'Member of the Dáil', house: 'Dáil Éireann' },
  il: { title: 'Member of the Knesset', house: 'the Knesset' },
  pl: { title: 'Member of the Sejm', house: 'the Sejm' },
  pt: { title: 'Member of the Assembly of the Republic', house: 'the Assembly of the Republic' },
  gr: { title: 'Member of the Hellenic Parliament', house: 'the Hellenic Parliament' },
  ch: { title: 'National Councillor', house: 'the National Council' },
  kr: { title: 'Member of the National Assembly', house: 'the National Assembly' },
  ph: { title: 'Representative', house: 'the House of Representatives' },
  tw: { title: 'Legislator', house: 'the Legislative Yuan' },
  tr: { title: 'Member of the Grand National Assembly', house: 'the Grand National Assembly' },
  ua: { title: 'Member of the Verkhovna Rada', house: 'the Verkhovna Rada' },
  eg: { title: 'Member of the House of Representatives', house: 'the House of Representatives' },
  za: { title: 'Member of Parliament', house: 'the National Assembly' },
  hu: { title: 'Member of the National Assembly', house: 'the National Assembly' },
  cz: { title: 'Member of the Chamber of Deputies', house: 'the Chamber of Deputies' },
  ro: { title: 'Member of the Chamber of Deputies', house: 'the Chamber of Deputies' },
}

export function regional(g: GameState): { title: string; unit: string } | null {
  return REGIONAL_HEADS[g.character.countryId] ?? null
}

export function legislator(g: GameState): { title: string; house: string } {
  return LEGISLATORS[g.character.countryId] ?? { title: 'Member of Parliament', house: 'Parliament' }
}
// ---------------------------------------------------------------------------
// The office the player holds

export type OfficeId = 'school' | 'mayor' | 'governor' | 'leader'
export type Portfolio = 'finance' | 'trade' | 'interior' | ''
export const PORTFOLIOS: Exclude<Portfolio, ''>[] = ['finance', 'trade', 'interior']
export const PORTFOLIO_TITLE: Record<Exclude<Portfolio, ''>, string> = { finance: 'Finance Minister', trade: 'Trade Minister', interior: 'Interior Minister' }
const RANK: Record<OfficeId, number> = { school: 0, mayor: 1, governor: 2, leader: 3 }

export interface OfficeView {
  office: OfficeId
  rank: number
  title: string
  place: string
  party: string
  approval: number
  termLeft: number
  terms: number
  /** A regional head (governor, premier, chief minister). */
  regionalHead: boolean
  /** A member of the national legislature (the middle rung where there are no regional heads). */
  legislator: boolean
  portfolio: Portfolio
  leader: boolean
  /** The head of government is a directly elected president (vetoes, executive orders). */
  presidential: boolean
}

export function politicianJobOf(g: GameState): Job | null {
  const j = g.character.job
  return j && j.defId === 'politician' ? j : null
}

/** The player's office, read straight from the politician job (no writes; safe in menus). */
export function officeView(g: GameState): OfficeView | null {
  const job = politicianJobOf(g)
  if (!job || !g.character.alive) return null
  const d = job.data && typeof job.data === 'object' && !Array.isArray(job.data) ? job.data as Record<string, unknown> : {}
  const office: OfficeId = d.office === 'mayor' || d.office === 'governor' || d.office === 'leader' ? d.office : 'school'
  const n = (v: unknown, f: number) => (typeof v === 'number' && Number.isFinite(v) ? v : f)
  const regionalHead = office === 'governor' && !!regional(g)
  const portfolio: Portfolio = office === 'governor' && (d.portfolio === 'finance' || d.portfolio === 'trade' || d.portfolio === 'interior') ? d.portfolio : ''
  return {
    office, rank: RANK[office], title: job.title, place: job.company, party: typeof d.party === 'string' && PARTY_STANCE[d.party] ? d.party : 'independent',
    approval: clamp100(n(d.approval, n(job.performance, 60))), termLeft: Math.max(0, Math.round(n(d.termLeft, 4))), terms: Math.max(1, Math.round(n(d.terms, 1))),
    regionalHead, legislator: office === 'governor' && !regionalHead, portfolio, leader: office === 'leader', presidential: leaderTitle(g) === 'President',
  }
}

/** Add to the politician's approval (job data and performance), as the career module does. */
export function adjustApproval(g: GameState, delta: number): number {
  const job = politicianJobOf(g)
  if (!job || !Number.isFinite(delta)) return 0
  if (!job.data || typeof job.data !== 'object' || Array.isArray(job.data)) job.data = {}
  const before = typeof job.data.approval === 'number' && Number.isFinite(job.data.approval) ? job.data.approval : job.performance
  const after = clamp100(before + delta)
  job.data.approval = after
  job.performance = after
  return after - before
}

export function setPortfolio(g: GameState, portfolio: Portfolio): void {
  const job = politicianJobOf(g)
  if (!job) return
  if (!job.data || typeof job.data !== 'object' || Array.isArray(job.data)) job.data = {}
  if (portfolio) job.data.portfolio = portfolio
  else delete job.data.portfolio
}

/** Countries whose head of government is a monarch-appointed or parliamentary premier. */
export function countryName(g: GameState): string {
  return getCountry(g.character.countryId).name
}

// ---------------------------------------------------------------------------
// Powers

export type Area = 'tax' | 'budget' | 'trade' | 'law' | 'regime'
export interface Power {
  scope: Scope
  /** 'decree': an executive order, no vote. 'vote': a legislature or council decides. */
  route: 'decree' | 'vote'
  /** Agenda power: how much the sponsor's position adds to the vote. */
  agenda: number
  /** Who votes: 'legislature' (national seats) or 'council' (a regional or city body). */
  body: 'legislature' | 'council' | 'none'
}

/** What this office can do in an area (null: nothing). Emergency rule turns votes into decrees. */
export function powerFor(v: OfficeView | null, area: Area, decreeRule = false): Power | null {
  if (!v) return null
  if (v.leader) {
    if (area === 'regime') return { scope: 'national', route: 'decree', agenda: .15, body: 'legislature' }
    if (decreeRule) return { scope: 'national', route: 'decree', agenda: .15, body: 'none' }
    if (area === 'trade' && v.presidential) return { scope: 'national', route: 'decree', agenda: .15, body: 'none' }
    return { scope: 'national', route: 'vote', agenda: .15, body: 'legislature' }
  }
  if (v.office === 'governor') {
    if (v.portfolio === 'finance' && (area === 'tax' || area === 'budget')) return { scope: 'national', route: 'vote', agenda: .08, body: 'legislature' }
    if (v.portfolio === 'trade' && area === 'trade') return { scope: 'national', route: 'vote', agenda: .08, body: 'legislature' }
    if (v.portfolio === 'interior' && area === 'law') return { scope: 'national', route: 'vote', agenda: .08, body: 'legislature' }
    if (v.legislator) return area === 'regime' ? null : { scope: 'national', route: 'vote', agenda: -.1, body: 'legislature' }
    if (area === 'tax' || area === 'budget' || area === 'law') return { scope: 'regional', route: 'vote', agenda: .1, body: 'council' }
    return null
  }
  if (v.office === 'mayor' && (area === 'tax' || area === 'budget')) return { scope: 'city', route: 'vote', agenda: .15, body: 'council' }
  return null
}

/** One line on what this office controls (menus). */
export function powerLine(v: OfficeView): string {
  if (v.leader) return 'You run the country: taxes, trade, the budget and the law. Most changes still need votes.'
  if (v.portfolio) return `As ${PORTFOLIO_TITLE[v.portfolio]} you steer ${v.portfolio === 'finance' ? 'taxes and the budget' : v.portfolio === 'trade' ? 'tariffs, deals and sanctions' : 'the law and the police'} for the whole country.`
  if (v.legislator) return 'You can introduce national bills. Without the government behind them they rarely pass.'
  if (v.office === 'governor') return 'You run the region: its income, sales and property taxes, its budget and its minimum wage.'
  if (v.office === 'mayor') return 'You run the city: property tax and the city budget (police, roads and schools).'
  return 'The school board decides local school matters only.'
}

// ---------------------------------------------------------------------------
// Career hooks registered by special/politics.ts

export interface OfficeHooks {
  /** End the player's time in office (closes the record, leaves the job). */
  leaveOffice(g: GameState, reason: 'fired' | 'quit' | 'other', line: string): void
  /** Insider bets on a sector the player's own policy just moved (null when none). */
  policyMove(g: GameState, sector: string, bullish: boolean, label: string): string
}
let hooks: OfficeHooks = {
  leaveOffice: (g) => { g.character.job = null },
  policyMove: () => '',
}
export function registerOfficeHooks(h: OfficeHooks): void { hooks = h }
export function officeHooks(): OfficeHooks { return hooks }
