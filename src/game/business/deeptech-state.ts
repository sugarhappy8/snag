// Plain-JSON state of a deep-tech company (semiconductors, AI, robotics, biotech, space, EVs,
// quantum, cybersecurity, fusion, neurotech, drones, carbon removal): R&D programs, tech level, funding rounds and the like live in
// Asset.details.tech, next to the normal BizState. Light on imports on purpose: economy.ts reads
// deepTechValue() for the valuation and exit.ts reads deepTechIpoThreshold().
//
// Money that investors (and grant agencies) put in sits in `venture`, a restricted R&D account
// outside the company's cash: it pays for R&D, compute, trials and payroll, but it is never paid
// out to the owner (no dividends, no liquidation, no sale proceeds). That is how real preferred
// stock and grant terms work, and it keeps funding rounds from becoming a money pump.
//
// The investors' 1x liquidation preference is `raised`, and the deep-tech valuation already nets
// it out (deeptech-core refreshTechValue), so the owner's stake value and sale proceeds are what
// is left after investors are paid back. BizState.pref therefore stays 0 for deep-tech companies
// (setting it too would charge the preference twice in exit.ts).
import { DEEP_TECH_IDS, type Industry } from '../data/markets'
import type { Json } from '../types'
import { clampN, money, num, rec, str } from './util'

export type DeepTechIndustry = (typeof DEEP_TECH_IDS)[number]

export function isDeepTechIndustry(id: string): id is DeepTechIndustry {
  return (DEEP_TECH_IDS as readonly string[]).includes(id)
}

/** True for a deep-tech company (by its BizState-like `industry` field). */
export function isDeepTech(b: { industry: Industry | string }): boolean {
  return isDeepTechIndustry(b.industry)
}

// ---------------------------------------------------------------------------
// Types

/** Bumped whenever TechState gains fields, so techOf() re-normalizes states saved before. */
export const TECH_VERSION = 3
export const MAX_TECH_SEQUENCE = 999_999_999

/** Funding stages: index = TechState.series. */
export const SERIES = ['Bootstrapped', 'Seed', 'Series A', 'Series B', 'Series C', 'Series D', 'Series E'] as const
export const MAX_SERIES = SERIES.length - 1

export type Pace = 'lean' | 'steady' | 'blitz'

/** One running R&D program (multi-year, paid every year from the R&D budget). */
export interface TechProgram {
  /** Program definition id (deeptech-data.ts), e.g. 'node', 'train', 'trial'. */
  id: string
  /** Unique instance key, e.g. 'trial:d3' or 'train:4'. */
  key: string
  name: string
  emoji: string
  /** Years of work needed at a steady pace. */
  years: number
  /** Years of work done so far. */
  progress: number
  /** Local dollars a year at a steady pace (fixed when it started). */
  cost: number
  /** Base odds of success when it finishes (0-1, fixed when it started). */
  odds: number
  started: number
  /** Dollars spent on it so far. */
  spent: number
  /** What it works on (a drug id for clinical trials), '' for none. */
  target: string
}

export interface RoundRec {
  /** Index into SERIES. */
  series: number
  year: number
  raised: number
  pre: number
  /** Share of the company sold, 0-1. */
  equity: number
  investor: string
  down: boolean
}

export interface GrantRec {
  id: string
  year: number
  amount: number
  /** Paid back so far (a program it funded was cancelled before the money was spent). */
  repaid?: number
}

/** A drug candidate (biotech). phase: 0 preclinical, 1-3 trials, 4 under review, 5 approved. */
export interface Drug {
  id: string
  name: string
  area: string
  phase: number
  /** 0-100: how good the molecule looks (raises trial odds). */
  quality: number
  /** Peak yearly sales potential in "market units" (1 = one strong product line). */
  peak: number
  /** Year the patent was filed (protection runs 20 years). */
  filed: number
  approved: number
  /** Share of sales the company keeps: 1 when it sells the drug itself, ~0.15 when licensed out. */
  royalty: number
  /** Who licensed it ('' when the company owns it outright). */
  partner: string
  failed: boolean
}

/** A trained AI model generation. */
export interface AiModel {
  gen: number
  name: string
  /** Benchmark score, 0-100 (the frontier keeps rising every year). */
  score: number
  open: boolean
  year: number
}

/** A government or anchor-customer contract: yearly revenue for a few years. */
export interface TechContract {
  name: string
  perYear: number
  years: number
}

/** The deep-tech part of last year's books (the rest is the normal Statement). */
export interface TechYear {
  year: number
  rd: number
  compute: number
  side: number
  grants: number
  credit: number
  fromVenture: number
  /** One-off income booked this year (licensing upfronts, celebrity seats, broker sales...). */
  oneOff: number
  notes: string[]
}

export interface TechState {
  v: number
  /** 0-100 relative to the world's state of the art (70 ≈ as good as anyone). */
  level: number
  /** Commercial readiness on the industry's ladder (deeptech-data.ts STAGES). */
  stage: number
  /** 0-100: buzz with investors, press and customers (decays every year). */
  hype: number
  pace: Pace
  programs: TechProgram[]
  /** Completed program ids (repeatable programs appear once per completion). */
  done: string[]
  fails: number
  /** Index into SERIES: the last round raised. */
  series: number
  rounds: RoundRec[]
  lastRoundYear: number
  /** Restricted R&D account: investor and grant money (never paid out to the owner). */
  venture: number
  /** Total equity investors put in (their liquidation preference). */
  raised: number
  grants: GrantRec[]
  /** Big capital projects in service (fabs, gigafactories, GPU clusters, production lines...). */
  plant: number
  /** Book value of that plant (depreciates). */
  plantBook: number
  /** Book value of patents and know-how from R&D (depreciates). */
  ipBook: number
  /** Price premium from R&D (0 - 1). */
  premium: number
  /** Unit-cost reduction from R&D (0 - 0.6). */
  costCut: number
  /** Demand boost from R&D and deals (0 - 1.5). */
  boost: number
  /** 0-100: how impatient the board is. */
  pressure: number
  /** Years in a row without a milestone. */
  stuck: number
  /** Technical co-founder's name ('' for none). */
  cofounder: string
  /** Semiconductors: process node index (deeptech-data NODES). */
  node: number
  /** Semiconductors: manufacturing yield, 0.3 - 0.97. */
  yieldRate: number
  /** AI: GPU clusters rented from a cloud provider. */
  rented: number
  models: AiModel[]
  /** 0-100: safety culture (AI, robotics, EVs, biotech): fewer incidents and recalls. */
  safety: number
  drugs: Drug[]
  /** Space: test flights flown, successes and explosions. */
  tests: number
  wins: number
  booms: number
  /** Space: satellite constellation batches in orbit. */
  sats: number
  /** EVs: self-driving level 0-3. */
  autonomy: number
  /** Quantum: physical and error-corrected logical qubits. */
  qubits: number
  logical: number
  contract: TechContract | null
  /** Anchor-customer supply deal (semiconductors/robotics/EVs). */
  deal: TechContract | null
  /**
   * Cached deep-tech adjustment to the company's valuation (deepTechValue), refreshed by the
   * deep-tech code: what turns valuationOf's profit-based number into the deep-tech valuation.
   * Negative when one-off income inflated the profit-based number.
   */
  value: number
  last: TechYear | null
  /** This year's grants (P&L income; the cash went into `venture`). */
  yearGrant: number
  /** This year's one-off deep-tech costs paid from `venture` (P&L cost). */
  yearSpent: number
  /** This year's one-off income so far (paid into company cash). */
  oneOff: number
  /** One-off income of recent fiscal years (left out of the earnings investors pay a multiple for). */
  oneOffs: { year: number; amount: number }[]
  /** Next id for drugs and models. */
  seq: number
}

/** Claim a finite unused drug-candidate id, wrapping safely after a malformed extreme save. */
export function nextDrugId(t: TechState): `d${number}` {
  const used = new Set(t.drugs.map((drug) => drug.id))
  let seq = Number.isSafeInteger(t.seq) && t.seq >= 0 && t.seq <= MAX_TECH_SEQUENCE ? t.seq : 0
  for (let i = 0; i <= t.drugs.length; i++) {
    seq = seq >= MAX_TECH_SEQUENCE ? 1 : seq + 1
    const id = `d${seq}` as const
    if (!used.has(id)) {
      t.seq = seq
      return id
    }
  }
  // Drug catalogs are capped at 12 entries, so a free id must exist in this range.
  t.seq = 1
  return 'd1'
}

// ---------------------------------------------------------------------------
// Reading (never writes)

function list<T>(v: Json | undefined, read: (x: Record<string, Json>) => T | null, max = 60): T[] {
  if (!Array.isArray(v)) return []
  const out: T[] = []
  // State arrays are chronological. Recover the newest valid bounded records, rather than letting
  // stale or malformed rows at the front crowd current programs and contracts out of a save.
  for (let i = v.length - 1; i >= 0; i--) {
    const x = v[i]
    const r = rec(x)
    if (!r) continue
    const t = read(r)
    if (t) out.unshift(t)
    if (out.length >= max) break
  }
  return out
}

function uniqueLast<T>(rows: T[], key: (row: T) => string): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (let i = rows.length - 1; i >= 0; i--) {
    const k = key(rows[i])
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(rows[i])
  }
  return out.reverse()
}

function readProgram(x: Record<string, Json>): TechProgram | null {
  const id = str(x.id)
  if (!id) return null
  return {
    id,
    key: str(x.key, id),
    name: str(x.name, 'R&D program'),
    emoji: str(x.emoji, '\u{1F52C}'),
    years: clampN(num(x.years, 1), 0.5, 10),
    progress: clampN(num(x.progress), 0, 20),
    cost: Math.max(0, num(x.cost)),
    odds: clampN(num(x.odds, 0.5), 0.02, 0.98),
    started: Math.round(num(x.started)),
    spent: Math.max(0, num(x.spent)),
    target: str(x.target),
  }
}

function readRound(x: Record<string, Json>): RoundRec | null {
  return {
    series: clampN(Math.round(num(x.series, 1)), 0, MAX_SERIES),
    year: Math.round(num(x.year)),
    raised: Math.max(0, num(x.raised)),
    pre: Math.max(0, num(x.pre)),
    equity: clampN(num(x.equity), 0, 0.9),
    investor: str(x.investor, 'investors'),
    down: x.down === true,
  }
}

function readGrant(x: Record<string, Json>): GrantRec | null {
  const id = str(x.id)
  if (!id) return null
  const amount = Math.max(0, num(x.amount))
  const repaid = clampN(num(x.repaid), 0, amount)
  return repaid > 0 ? { id, year: Math.round(num(x.year)), amount, repaid } : { id, year: Math.round(num(x.year)), amount }
}

function readOneOff(x: Record<string, Json>): { year: number; amount: number } | null {
  return typeof x.year === 'number' && Number.isFinite(x.year) ? { year: Math.round(x.year), amount: Math.max(0, num(x.amount)) } : null
}

function readDrug(x: Record<string, Json>): Drug | null {
  const id = str(x.id)
  if (!id) return null
  return {
    id,
    name: str(x.name, 'Candidate'),
    area: str(x.area, 'oncology'),
    phase: clampN(Math.round(num(x.phase)), 0, 5),
    quality: clampN(num(x.quality, 50), 0, 100),
    peak: clampN(num(x.peak, 1), 0, 20),
    filed: Math.round(num(x.filed)),
    approved: Math.round(num(x.approved)),
    royalty: clampN(num(x.royalty, 1), 0, 1),
    partner: str(x.partner),
    failed: x.failed === true,
  }
}

function readModel(x: Record<string, Json>): AiModel | null {
  return {
    gen: Math.max(1, Math.round(num(x.gen, 1))),
    name: str(x.name, 'Model'),
    score: clampN(num(x.score, 40), 0, 100),
    open: x.open === true,
    year: Math.round(num(x.year)),
  }
}

function readContract(v: Json | undefined): TechContract | null {
  const x = rec(v)
  if (!x) return null
  const years = Math.round(num(x.years))
  const perYear = Math.max(0, num(x.perYear))
  if (years <= 0 || perYear <= 0) return null
  return { name: str(x.name, 'a contract'), perYear, years: Math.min(10, years) }
}

function readYear(v: Json | undefined): TechYear | null {
  const x = rec(v)
  if (!x || typeof x.year !== 'number' || !Number.isFinite(x.year)) return null
  return {
    year: Math.round(x.year),
    rd: Math.max(0, num(x.rd)),
    compute: Math.max(0, num(x.compute)),
    side: Math.max(0, num(x.side)),
    grants: Math.max(0, num(x.grants)),
    credit: Math.max(0, num(x.credit)),
    fromVenture: Math.max(0, num(x.fromVenture)),
    oneOff: Math.max(0, num(x.oneOff)),
    notes: Array.isArray(x.notes) ? x.notes.filter((n): n is string => typeof n === 'string').slice(0, 12) : [],
  }
}

/** A complete, sane TechState from whatever is stored (missing for old or acquired companies). */
export function readTech(v: Json | undefined): TechState {
  const d = rec(v) ?? {}
  const pace = d.pace === 'lean' || d.pace === 'blitz' ? d.pace : 'steady'
  const programs = uniqueLast(list(d.programs, readProgram, 60), x => x.key).slice(-8)
  const rounds = uniqueLast(list(d.rounds, readRound, 60), x => `${x.series}:${x.year}:${x.raised}:${x.investor}`).slice(-12)
  const grants = uniqueLast(list(d.grants, readGrant, 80), x => `${x.id}:${x.year}`).slice(-40)
  const models = uniqueLast(list(d.models, readModel, 60), x => String(x.gen)).slice(-12)
  const drugs = uniqueLast(list(d.drugs, readDrug, 60), x => x.id).slice(-12)
  const oneOffs = uniqueLast(list(d.oneOffs, readOneOff, 20), x => String(x.year)).slice(-4)
  const drugSeq = drugs.reduce((max, x) => {
    const match = /^d(\d+)$/.exec(x.id)
    if (!match) return max
    const value = Number(match[1])
    return Number.isSafeInteger(value) && value <= MAX_TECH_SEQUENCE ? Math.max(max, value) : max
  }, 0)
  const savedSeq = Math.round(num(d.seq))
  return {
    v: TECH_VERSION,
    level: clampN(num(d.level, 25), 0, 100),
    stage: clampN(Math.round(num(d.stage)), 0, 4),
    hype: clampN(num(d.hype, 15), 0, 100),
    pace,
    programs,
    done: Array.isArray(d.done) ? trimDone(d.done.filter((x): x is string => typeof x === 'string' && !!x)) : [],
    fails: Math.max(0, Math.round(num(d.fails))),
    series: clampN(Math.round(num(d.series)), 0, MAX_SERIES),
    rounds,
    lastRoundYear: Math.round(num(d.lastRoundYear)),
    venture: Math.max(0, num(d.venture)),
    raised: Math.max(0, num(d.raised)),
    grants,
    plant: clampN(num(d.plant), 0, 200),
    plantBook: Math.max(0, num(d.plantBook)),
    ipBook: Math.max(0, num(d.ipBook)),
    premium: clampN(num(d.premium), 0, 1),
    costCut: clampN(num(d.costCut), 0, 0.6),
    boost: clampN(num(d.boost), 0, 1.5),
    pressure: clampN(num(d.pressure), 0, 100),
    stuck: Math.max(0, Math.round(num(d.stuck))),
    cofounder: str(d.cofounder),
    node: clampN(Math.round(num(d.node)), 0, 6),
    yieldRate: clampN(num(d.yieldRate, 0.55), 0.3, 0.97),
    rented: clampN(Math.round(num(d.rented)), 0, 40),
    models,
    safety: clampN(num(d.safety, 40), 0, 100),
    drugs,
    tests: Math.max(0, Math.round(num(d.tests))),
    wins: Math.max(0, Math.round(num(d.wins))),
    booms: Math.max(0, Math.round(num(d.booms))),
    sats: clampN(Math.round(num(d.sats)), 0, 40),
    autonomy: clampN(Math.round(num(d.autonomy)), 0, 3),
    qubits: clampN(Math.round(num(d.qubits, 5)), 1, 1_000_000),
    logical: clampN(Math.round(num(d.logical)), 0, 1000),
    contract: readContract(d.contract),
    deal: readContract(d.deal),
    value: clampN(num(d.value), -MAX_TECH_VALUE, MAX_TECH_VALUE),
    last: readYear(d.last),
    yearGrant: Math.max(0, num(d.yearGrant)),
    yearSpent: Math.max(0, num(d.yearSpent)),
    oneOff: Math.max(0, num(d.oneOff)),
    oneOffs,
    seq: Math.max(drugSeq, Number.isSafeInteger(savedSeq) && savedSeq >= 0 && savedSeq <= MAX_TECH_SEQUENCE ? savedSeq : 0),
  }
}

/** Most completed-program entries kept (R&D never ends, so the list must not grow forever). */
const DONE_CAP = 1000

/**
 * Keep the completed-program log bounded: the first completion of every program always stays (so
 * once-only programs never look startable again), then the most recent entries up to DONE_CAP.
 */
function trimDone(list: string[]): string[] {
  if (list.length <= DONE_CAP) return list
  const keep = new Array<boolean>(list.length).fill(false)
  const seen = new Set<string>()
  list.forEach((id, i) => {
    if (!seen.has(id)) {
      seen.add(id)
      keep[i] = true
    }
  })
  let room = DONE_CAP - seen.size
  for (let i = list.length - 1; i >= 0 && room > 0; i--) {
    if (!keep[i]) {
      keep[i] = true
      room--
    }
  }
  return list.filter((_, i) => keep[i])
}

/** How many times a program has been completed. */
export function timesDone(t: TechState, id: string): number {
  let n = 0
  for (const x of t.done) if (x === id) n++
  return n
}

// ---------------------------------------------------------------------------
// Valuation and listing (read by economy.ts and exit.ts)

/** Cap on the deep-tech part of a valuation (keeps every number finite and sane). */
export const MAX_TECH_VALUE = 3e12

/**
 * The deep-tech part of a valuation (added to valuationOf): patents, the R&D pipeline, revenue
 * multiples, investor money net of their liquidation preference, minus any one-off income that
 * valuationOf's profit multiple would otherwise capitalize. Can be negative.
 */
export function deepTechValue(tech: Json | undefined): number {
  const v = num(rec(tech)?.value)
  return clampN(v, -MAX_TECH_VALUE, MAX_TECH_VALUE)
}

/** Profit route to a listing for deep tech (exchanges also list on milestones; see below). */
export const DEEP_IPO_PROFIT = 150_000_000
/** Smallest valuation an exchange lists a pre-profit deep-tech company at. */
export const DEEP_IPO_VALUE = 300_000_000

/** Stage on each industry's ladder that counts as commercial proof for a listing. */
export const IPO_STAGE: Record<DeepTechIndustry, number> = {
  semiconductor: 2,
  aiLab: 2,
  robotics: 2,
  biotech: 2,
  spaceTech: 3,
  electricVehicles: 2,
  quantum: 2,
  cybersecurity: 2,
  fusion: 2,
  neurotech: 2,
  drones: 2,
  carbonCapture: 2,
}

interface ListingView {
  industry: string
  tech?: Json
  valuation?: number
  founded?: number
  public?: boolean
  history?: { year: number; profit: number; revenue: number }[]
}

/** Why a pre-profit listing isn't possible yet ('' when it is). */
export function milestoneListingBlock(b: ListingView): string {
  if (!isDeepTechIndustry(b.industry)) return 'Not a deep-tech company.'
  if (b.public) return 'It is already listed.'
  const t = readTech(b.tech)
  const h = b.history ?? []
  const last = h[h.length - 1]
  const revenue = last?.revenue ?? 0
  const value = b.valuation ?? 0
  const years = h.length
  if (t.stage < IPO_STAGE[b.industry]) return 'it needs commercial proof first (a higher stage on the R&D ladder)'
  if (years < 3) return 'exchanges want at least three years of audited accounts'
  if (t.series < 3 && revenue < 50_000_000) return `bankers want a Series B behind you, or ${money(50_000_000)} of yearly sales`
  if (value < DEEP_IPO_VALUE) return `the company must be worth at least ${money(DEEP_IPO_VALUE)}`
  if (last && last.profit < 0 && -last.profit > value * 0.35) return 'losses are too big for public investors (over 35% of the valuation a year)'
  return ''
}

/**
 * Yearly profit an exchange wants before listing a deep-tech company, or null for the default.
 * Deep tech can list on milestones before it earns real profits (like real chip, biotech and
 * space IPOs): when the milestones are met the bar is last year's result itself, so the listing
 * is open; otherwise it takes a big profit.
 */
export function deepTechIpoThreshold(b: { industry: string; tech?: Json }): number | null {
  if (!isDeepTechIndustry(b.industry)) return null
  const view = b as ListingView
  if (milestoneListingBlock(view) === '') {
    const h = view.history ?? []
    const last = h[h.length - 1]
    return Math.min(0, last ? last.profit : 0)
  }
  return DEEP_IPO_PROFIT
}
