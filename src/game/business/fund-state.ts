// Investment firms 2.0: plain-JSON state, stored in BizState.financeFirm with kind 'fund'.
// readFund is pure and migrates legacy v2 books (finance-firm-state.ts) without money changes:
// retail → Asset Manager, private → Hedge Fund (Asset Manager before 1949), brokerage → Brokerage.
// Client assets (AUM, fund commitments, startup stakes) are never company cash.
import type { Json } from '../types'
import { getCountry } from '../world'
import { financeView } from './finance-firm-state'
import { hedgeBlock, quantBlock } from './fund-model'
import type { BizState } from './state'

export type FundType = 'asset' | 'hedge' | 'vc' | 'broker'
export type FundStyle = 'index' | 'value' | 'growth' | 'global' | 'bonds'
export type HedgeStrategy = 'longShort' | 'macro' | 'quant' | 'event'
export type MacroCall = 'bull' | 'bear' | 'flat'

export const FUND_TYPES: readonly FundType[] = ['asset', 'hedge', 'vc', 'broker']
export const FUND_STYLES: readonly FundStyle[] = ['index', 'value', 'growth', 'global', 'bonds']
export const HEDGE_STRATEGIES: readonly HedgeStrategy[] = ['longShort', 'macro', 'quant', 'event']
export const MACRO_CALLS: readonly MacroCall[] = ['bull', 'bear', 'flat']

/** One booked fiscal year: the fund's net return, the market's, and the peer rank (-1 none). */
export interface YearMark { y: number; r: number; m: number; k: number }

/** A venture fund raised from limited partners (their money, never the firm's cash). */
export interface VcFund {
  n: number
  /** Committed LP capital. */
  size: number
  vintage: number
  /** Uninvested LP capital (80% of the commitment at the start). */
  dry: number
  /** LP capital set aside for management fees (20% of the commitment). */
  reserve: number
  /** Total put into startups. */
  invested: number
  /** Gross exit proceeds (before carry). */
  dist: number
  /** Carried interest paid to the firm so far. */
  carry: number
  /** Management fees paid to the firm so far. */
  fees: number
  /** Wound down: nothing left to invest or manage. */
  done: boolean
}

/** A follow-on round a portfolio company is raising (closes at the next fiscal year). */
export interface RaiseOffer {
  stage: number
  pre: number
  size: number
  year: number
  /** -1 undecided, 0 pass (get diluted), 1 invest pro-rata. */
  take: number
}

export interface Startup {
  id: string
  name: string
  emoji: string
  sector: string
  fund: number
  /** Hidden quality 0-100 (never shown; DD and talent hints read it with noise). */
  q: number
  stage: number
  /** Post-money valuation after the latest round. */
  val: number
  own: number
  cost: number
  born: number
  status: 'live' | 'dead' | 'exit'
  /** Year it died or exited. */
  end: number
  /** Gross proceeds to the fund at exit. */
  got: number
  /** How it ended ('ipo', 'acquired', 'secondary', or a short reason it died). */
  how: string
  round: RaiseOffer | null
  unicorn: boolean
}

/** A regulator case against the owner who committed the crime (`by`: their character id). */
export interface Probe { year: number; crime: string; odds: number; by: string }
/** A Ponzi scheme: the hole between reported and real client assets, and the fees taken since. */
export interface Ponzi { since: number; hole: number; fees: number; by: string }

export interface LastYear {
  fees: number
  ret: number
  market: number
  rank: number
  flow: number
  own: number
  opLoss: number
  trades: number
  carry: number
  news: string[]
}

export interface FundState {
  kind: 'fund'
  v: number
  type: FundType
  lastYear: number
  /** Client assets: AUM (asset/hedge) or custody assets (brokerage). VC uses funds[]. */
  aum: number
  /** 0-1 track record (rank-weighted), drives client flows. */
  rep: number
  /** 0-100 compliance culture (lawsuits, rogue traders, regulators). */
  compliance: number
  // Asset manager
  fee: number
  style: FundStyle
  // Hedge fund
  hwm: number
  mgmt: number
  perf: number
  strategy: HedgeStrategy
  call: MacroCall
  lev: number
  /** Firm capital the owner wants invested alongside clients (a target, funded from free cash). */
  coinvest: number
  algoEdge: number
  algoStart: number
  algoDone: number
  // Brokerage
  accounts: number
  commission: number
  // Venture capital
  funds: VcFund[]
  cos: Startup[]
  actYear: number
  /** Last year a hired CEO completed the post-settlement decision pass. */
  decisionYear: number
  acted: string[]
  dd: string[]
  // Shared one-year levers and story state
  campaign: number
  boost: number
  bonus: number
  probe: Probe | null
  ponzi: Ponzi | null
  eventYear: number
  /** Last calendar year regulators and schemes were checked (once a year). */
  checkYear: number
  last: LastYear
  marks: YearMark[]
}

export const FUND_VERSION = 4
/** Stored resolved startups. */
export const MAX_RESOLVED_STARTUPS = 60
/**
 * Stored live startups. A firm backs about six a year (three to five pitches and a hype deal) and sells each
 * after twelve years, so honest play peaks near seventy; this bounds a damaged save, not play.
 */
export const MAX_LIVE_STARTUPS = 200
/** Stored venture funds (a new one every few years: forty is two centuries of raising). */
export const MAX_VC_FUNDS = 40

const n = (v: Json | undefined, fallback: number, lo = -1e15, hi = 1e15): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback
const s = (v: Json | undefined, fallback = ''): string => typeof v === 'string' ? v.slice(0, 160) : fallback
const obj = (v: Json | undefined): Record<string, Json> | null => v && typeof v === 'object' && !Array.isArray(v) ? v : null
const list = (v: Json | undefined): Json[] => Array.isArray(v) ? v : []
const pick = <T extends string>(v: Json | undefined, ok: readonly T[], fallback: T): T => typeof v === 'string' && (ok as readonly string[]).includes(v) ? v as T : fallback

/** The founder network's starting client book (scaled like the legacy pool). */
export function startingClients(countryId: string, type: FundType): number {
  const w = Math.max(.15, Math.min(2, getCountry(countryId).wealth ?? 1))
  return Math.round((type === 'asset' ? 50_000_000 : 25_000_000) * w)
}

function emptyLast(): LastYear {
  return { fees: 0, ret: 0, market: 0, rank: -1, flow: 0, own: 0, opLoss: 0, trades: 0, carry: 0, news: [] }
}

function base(type: FundType, countryId: string): FundState {
  const clients = type === 'vc' ? 0 : startingClients(countryId, type)
  return {
    kind: 'fund', v: FUND_VERSION, type, lastYear: -1, aum: clients, rep: .5, compliance: 50,
    fee: .0085, style: 'value',
    hwm: clients, mgmt: .02, perf: .2, strategy: 'longShort', call: 'flat', lev: 1, coinvest: 0,
    algoEdge: 0, algoStart: 0, algoDone: 0,
    accounts: Math.round(3000 * Math.max(.3, Math.min(1.5, getCountry(countryId).wealth ?? 1))), commission: .005,
    funds: [], cos: [], actYear: 0, decisionYear: 0, acted: [], dd: [],
    campaign: 0, boost: 0, bonus: 0, probe: null, ponzi: null, eventYear: 0, checkYear: 0, last: emptyLast(), marks: [],
  }
}

/** A brand-new firm of this type (no money is created: clients' money stays theirs). */
export function newFundState(type: FundType, countryId: string): FundState {
  return base(type, countryId)
}

function readVcFund(x: Record<string, Json>): VcFund | null {
  const size = n(x.size, 0, 0)
  if (!(size > 0)) return null
  return { n: Math.max(1, Math.round(n(x.n, 1, 1, 99))), size, vintage: Math.round(n(x.vintage, 0, -1e5, 1e5)),
    dry: n(x.dry, 0, 0, size), reserve: n(x.reserve, 0, 0, size), invested: n(x.invested, 0, 0), dist: n(x.dist, 0, 0),
    carry: n(x.carry, 0, 0), fees: n(x.fees, 0, 0), done: x.done === true }
}

function readOffer(v: Json | undefined): RaiseOffer | null {
  const x = obj(v)
  if (!x) return null
  const pre = n(x.pre, 0, 0), size = n(x.size, 0, 0)
  if (!(pre > 0) || !(size > 0)) return null
  return { stage: Math.round(n(x.stage, 1, 0, 6)), pre, size, year: Math.round(n(x.year, 0, -1e5, 1e5)), take: Math.round(n(x.take, -1, -1, 1)) }
}

function readStartup(x: Record<string, Json>): Startup | null {
  const id = s(x.id)
  if (!id) return null
  return { id, name: s(x.name, 'Startup'), emoji: s(x.emoji, '🚀'), sector: s(x.sector, 'tech'), fund: Math.round(n(x.fund, 1, 1, 99)),
    q: n(x.q, 40, 0, 100), stage: Math.round(n(x.stage, 0, 0, 6)), val: n(x.val, 1, 0), own: n(x.own, 0, 0, 1), cost: n(x.cost, 0, 0),
    born: Math.round(n(x.born, 0, -1e5, 1e5)), status: pick(x.status, ['live', 'dead', 'exit'] as const, 'live'),
    end: Math.round(n(x.end, 0, -1e5, 1e5)), got: n(x.got, 0, 0), how: s(x.how), round: readOffer(x.round), unicorn: x.unicorn === true }
}

function readLast(v: Json | undefined): LastYear {
  const x = obj(v)
  if (!x) return emptyLast()
  return { fees: n(x.fees, 0), ret: n(x.ret, 0, -1, 1000), market: n(x.market, 0, -1, 20), rank: n(x.rank, -1, -1, 1), flow: n(x.flow, 0),
    own: n(x.own, 0), opLoss: n(x.opLoss, 0, 0), trades: n(x.trades, 0, 0), carry: n(x.carry, 0, 0),
    news: list(x.news).filter((t): t is string => typeof t === 'string').slice(0, 8).map(t => t.slice(0, 200)) }
}

/** Normalize a stored fund record (any damage becomes a safe default, never extra money). */
function readNew(x: Record<string, Json>, countryId: string): FundState {
  const type = pick(x.type, FUND_TYPES, 'asset')
  const d = base(type, countryId)
  const aum = n(x.aum, d.aum, 0)
  const cos = list(x.cos).map(c => obj(c)).filter((c): c is Record<string, Json> => !!c).map(readStartup).filter((c): c is Startup => !!c)
  const seen = new Set<string>()
  const unique = cos.filter(c => !seen.has(c.id) && !!seen.add(c.id))
  // Live ones are kept (the latest MAX_LIVE_STARTUPS, since the book appends); only a damaged record has more.
  const live = unique.filter(c => c.status === 'live').slice(-MAX_LIVE_STARTUPS), done = unique.filter(c => c.status !== 'live').slice(-MAX_RESOLVED_STARTUPS)
  const funds = list(x.funds).map(f => obj(f)).filter((f): f is Record<string, Json> => !!f).map(readVcFund).filter((f): f is VcFund => !!f).slice(-MAX_VC_FUNDS)
  const probe = obj(x.probe), ponzi = obj(x.ponzi)
  return {
    kind: 'fund', v: FUND_VERSION, type, lastYear: Math.round(n(x.lastYear, -1, -1, 1e5)), aum, rep: n(x.rep, .5, 0, 1), compliance: n(x.compliance, 50, 0, 100),
    fee: n(x.fee, d.fee, .0005, .025), style: pick(x.style, FUND_STYLES, 'value'),
    hwm: n(x.hwm, aum, 0), mgmt: n(x.mgmt, .02, 0, .03), perf: n(x.perf, .2, 0, .4), strategy: pick(x.strategy, HEDGE_STRATEGIES, 'longShort'),
    call: pick(x.call, MACRO_CALLS, 'flat'), lev: n(x.lev, 1, 1, 3), coinvest: n(x.coinvest, 0, 0),
    algoEdge: n(x.algoEdge, 0, 0, .08), algoStart: Math.round(n(x.algoStart, 0, 0, 1e5)), algoDone: Math.round(n(x.algoDone, 0, 0, 1e5)),
    accounts: Math.round(n(x.accounts, d.accounts, 0, 1e10)), commission: n(x.commission, d.commission, 0, .03),
    funds, cos: [...done, ...live], actYear: Math.round(n(x.actYear, 0, 0, 1e5)), decisionYear: Math.round(n(x.decisionYear, 0, 0, 1e5)),
    acted: list(x.acted).filter((t): t is string => typeof t === 'string').slice(-30), dd: list(x.dd).filter((t): t is string => typeof t === 'string').slice(-30),
    campaign: Math.round(n(x.campaign, 0, 0, 1e5)), boost: n(x.boost, 0, 0, .3), bonus: n(x.bonus, 0, -.5, .2),
    probe: probe ? { year: Math.round(n(probe.year, 0, 0, 1e5)), crime: s(probe.crime, 'Securities Fraud'), odds: n(probe.odds, .3, 0, 1), by: s(probe.by) } : null,
    ponzi: ponzi ? { since: Math.round(n(ponzi.since, 0, 0, 1e5)), hole: n(ponzi.hole, 0, 0), fees: n(ponzi.fees, 0, 0), by: s(ponzi.by) } : null,
    eventYear: Math.round(n(x.eventYear, 0, 0, 1e5)), checkYear: Math.round(n(x.checkYear, 0, 0, 1e5)), last: readLast(x.last),
    marks: list(x.marks).map(m => obj(m)).filter((m): m is Record<string, Json> => !!m)
      .map(m => ({ y: Math.round(n(m.y, 0, -1e5, 1e5)), r: n(m.r, 0, -1, 1000), m: n(m.m, 0, -1, 20), k: n(m.k, -1, -1, 1) })).slice(-12),
  }
}

type FirmBooks = Pick<BizState, 'industry' | 'countryId' | 'financeFirm'> & Partial<Pick<BizState, 'founded'>>

/** Legacy v2 investment-firm books mapped onto the new types: equivalent client books, no new money. */
export function migrateLegacy(b: FirmBooks): FundState {
  const f = financeView(b)
  // The year the old books are read in: the year after the last booked one (or the founding year).
  const year = f.lastYear >= 0 ? f.lastYear + 1 : b.founded ?? Infinity
  // An old "private" firm from before hedge funds existed carries on as a plain asset manager.
  const type: FundType = f.model === 'retail' ? 'asset' : f.model === 'brokerage' ? 'broker' : hedgeBlock(year) ? 'asset' : 'hedge'
  const d = base(type, b.countryId)
  const rep = Math.max(.2, Math.min(.8, f.confidence / 100))
  const out: FundState = { ...d, lastYear: f.lastYear, aum: f.aum, rep, compliance: f.controls,
    last: { ...emptyLast(), fees: f.lastFees, ret: f.lastReturn, trades: f.lastTrades } }
  if (type === 'asset') {
    out.fee = Math.max(.0005, Math.min(.025, f.feeRate))
    out.style = f.strategy === 'aggressive' ? 'growth' : f.strategy === 'cautious' ? 'bonds' : 'value'
  } else if (type === 'hedge') {
    out.hwm = f.highWater
    out.mgmt = Math.max(0, Math.min(.03, f.feeRate))
    out.lev = f.leverage
    out.coinvest = f.tradingCapital
    // The old research edge was a power-fantasy multiplier; it maps to a small, decaying quant edge.
    out.algoEdge = Math.min(.04, f.algoEdge * .04)
    // An edge with no completion date would never fade: date it to the last booked year.
    out.algoDone = f.algoCompleted > 0 || out.algoEdge <= 0 ? f.algoCompleted : Math.max(1, f.lastYear)
    out.algoStart = f.algoResearching ? f.algoStarted : 0
    out.strategy = f.algoEdge > .05 && !quantBlock(b.countryId, year) ? 'quant' : 'longShort'
  } else {
    out.accounts = f.accounts
    out.commission = f.commission
  }
  return out
}

export function isFundRecord(v: Json | undefined): boolean {
  const x = obj(v)
  return !!x && x.kind === 'fund'
}

/** The firm's books (pure: never writes to b). */
export function readFund(b: FirmBooks): FundState {
  const x = obj(b.financeFirm)
  if (x && x.kind === 'fund') return readNew(x, b.countryId)
  return migrateLegacy(b)
}

export function saveFund(b: BizState, f: FundState): void {
  b.financeFirm = readNew(JSON.parse(JSON.stringify(f)) as Record<string, Json>, b.countryId) as unknown as Json
}

/** Every dollar of client money the firm looks after (never company cash). */
export function clientAssets(f: FundState): number {
  if (f.type !== 'vc') return f.aum
  const funds = f.funds.filter(x => !x.done).reduce((t, x) => t + x.dry + x.reserve, 0)
  const stakes = f.cos.filter(c => c.status === 'live').reduce((t, c) => t + c.own * c.val, 0)
  return funds + stakes
}
