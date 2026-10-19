// Model 2.0 state: one optional, owner-stamped, versioned record at special.model.sim (version 1, start
// standing 20), built on the career kit. Every reader tolerates junk and returns capped, finite values.
// `migrate[0]` lifts the legacy special.model profile and the model job in memory (pure: a view of a legacy
// life is byte-identical) and never writes the legacy flag or Job.data. The contract stays in Job.data.contract,
// validated by the appointment id, so it dies with the job. Imports from model.ts are used inside function
// bodies only; model.ts imports nothing from this file.
import type { GameState, Job } from '../types'
import { AGENCIES, modelJob, viewModel } from './model'
import { commissionFor } from './model-core'
import { FOCUSES, KIND_IDS, SEASONS, SEASON_CAP } from './model-data'
import { appointmentId, arr, cap, defineCareerState, flt, int, rec, txt, type CareerBase, type CareerStore, type Raw } from './kit/state'
import type { CareerCtx } from './kit/year'

export type Focus = 'runway' | 'editorial' | 'commercial'
export type Kind = 'catalogue' | 'commercial' | 'digital' | 'editorial' | 'cover' | 'runway' | 'couture' | 'campaign' | 'face'
export type Season = 'couture' | 'aw' | 'ss' | 'year'

/** One casting on the Season Board. `minTitle` doubles as the client's brand tier (0 budget to 4 ultra). `terms` is snapshotted at cast. */
export interface MdOffer {
  id: string
  kind: Kind
  season: Season
  circuit: string
  brand: string
  house: string
  fee: number
  days: number
  minLook: number
  minTitle: number
  abroad: boolean
  window: number
  rivals: string[]
  status: 'open' | 'booked' | 'lost' | 'passed' | 'paid'
  terms: { agency: string; commission: number; mother: number } | null
}
/** The agency contract kept in Job.data.contract. Commission and mother are percents. */
export interface MdContract {
  appointmentId: string
  agency: string
  tier: number
  commission: number
  guarantee: boolean
  exclusive: boolean
  since: number
  until: number
  advance: number
  unrecouped: number
  bookerId: string
  bookerName: string
}
/** One paid booking: gross = agency + mother + recoup + net exactly. */
export interface MdRow { year: number; src: string; gross: number; agency: number; mother: number; recoup: number; net: number }
/** An exclusivity window on a brand category, inclusive of `until`. */
export interface MdWindow { brand: string; category: string; until: number }
export interface MdProtege { id: string; name: string; born: number; look: number; book: number; signed: number }
export interface ModelExtra {
  focus: Focus
  focusYear: number
  restYear: number
  planYear: number
  book: number
  buzz: number
  rep: number
  strain: number
  mood: number
  mother: { agency: string; booker: string; since: number; overrideUntil: number } | null
  /** The retainer the legacy hook pays next tick. */
  floor: number
  board: { year: number; items: MdOffer[] }
  windows: MdWindow[]
  photographers: string[]
  agencies: { name: string; from: number; to: number }[]
  ledger: MdRow[]
  /** Lifetime totals. `peak` is the best (lowest) ranking so far, 0 for none. */
  life: { gross: number; net: number; agency: number; mother: number; recoup: number; booked: number; faces: number; shows: number; peak: number; peakYear: number }
  proteges: MdProtege[]
  exit: '' | 'photographer' | 'label' | 'agent'
  likeness: number
  announced: string[]
}
export type ModelState = CareerBase & ModelExtra

/** Caps: board 8, windows 8, photographers 8, agencies 8, ledger 24, proteges 2, announced 8. */
const CAPS = { board: 8, windows: 8, photographers: 8, agencies: 8, ledger: 24, proteges: 2, announced: 8, rivals: 2 } as const
const OFFER_FEE_MAX = 2_000_000
/** Paid gross a year, and so the most a ledger row can hold. */
const YEAR_GROSS_MAX = 6_000_000
const TOTAL_MAX = 1e13
const COUNT_MAX = 1e6
const FLOOR_MAX = 1e9
const LIKENESS_MAX = 150_000
const ADVANCE_MAX = 1e6
const ID_MAX = 24
const KEY_MAX = 60
const NAME_MAX = 40
const TEXT_MAX = 60
const YEAR_MAX = 9999

const STATUSES: readonly MdOffer['status'][] = ['open', 'booked', 'lost', 'passed', 'paid']
const EXITS: readonly ModelExtra['exit'][] = ['', 'photographer', 'label', 'agent']

function pickOf<T extends string>(v: unknown, all: readonly T[], d: T): T {
  return typeof v === 'string' && (all as readonly string[]).includes(v) ? (v as T) : d
}

/** One decimal, clamped: the meters are fractional, and rounding keeps a re-read stable. */
function dec(v: unknown, d: number, lo: number, hi: number): number {
  return Math.round(flt(v, d, lo, hi) * 10) / 10
}

function strings(v: unknown, max: number, len: number): string[] {
  const out: string[] = []
  for (const x of cap(arr(v), max * 4)) {
    const s = typeof x === 'string' ? txt(x, len) : ''
    if (s) out.push(s)
  }
  return cap(out, max)
}

const isObject = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v)

function readTerms(v: unknown): MdOffer['terms'] {
  if (!isObject(v)) return null
  return { agency: txt(v.agency, TEXT_MAX), commission: int(v.commission, 20, 12, 30), mother: int(v.mother, 0, 0, 30) }
}

function readOffer(v: unknown): MdOffer | null {
  const r = rec(v)
  const id = txt(r.id, ID_MAX)
  if (!id) return null
  return {
    id,
    kind: pickOf(r.kind, KIND_IDS, 'catalogue'),
    season: pickOf(r.season, SEASONS, 'year'),
    circuit: txt(r.circuit, TEXT_MAX),
    brand: txt(r.brand, TEXT_MAX),
    house: txt(r.house, TEXT_MAX),
    fee: int(r.fee, 0, 0, OFFER_FEE_MAX),
    days: int(r.days, 1, 0, SEASON_CAP.year),
    minLook: int(r.minLook, 0, 0, 100),
    minTitle: int(r.minTitle, 0, 0, 4),
    abroad: r.abroad === true,
    window: int(r.window, 0, 0, YEAR_MAX),
    rivals: strings(r.rivals, CAPS.rivals, KEY_MAX),
    status: pickOf(r.status, STATUSES, 'open'),
    terms: readTerms(r.terms),
  }
}

function readWindow(v: unknown): MdWindow | null {
  const r = rec(v)
  const brand = txt(r.brand, TEXT_MAX)
  if (!brand) return null
  return { brand, category: txt(r.category, TEXT_MAX), until: int(r.until, 0, 0, YEAR_MAX) }
}

function readRow(v: unknown): MdRow | null {
  const r = rec(v)
  if (typeof r.year !== 'number' || !Number.isFinite(r.year)) return null
  return {
    year: int(r.year, 0, 0, YEAR_MAX),
    src: txt(r.src, TEXT_MAX),
    gross: int(r.gross, 0, 0, YEAR_GROSS_MAX),
    agency: int(r.agency, 0, 0, YEAR_GROSS_MAX),
    mother: int(r.mother, 0, 0, YEAR_GROSS_MAX),
    recoup: int(r.recoup, 0, 0, YEAR_GROSS_MAX),
    net: int(r.net, 0, 0, YEAR_GROSS_MAX),
  }
}

function readAgencyRow(v: unknown): ModelExtra['agencies'][number] | null {
  const r = rec(v)
  const name = txt(r.name, TEXT_MAX)
  if (!name) return null
  return { name, from: int(r.from, 0, 0, YEAR_MAX), to: int(r.to, 0, 0, YEAR_MAX) }
}

function readProtege(v: unknown): MdProtege | null {
  const r = rec(v)
  const id = txt(r.id, ID_MAX)
  if (!id) return null
  return { id, name: txt(r.name, NAME_MAX), born: int(r.born, 0, 0, YEAR_MAX), look: int(r.look, 0, 0, 100), book: int(r.book, 0, 0, 100), signed: int(r.signed, 0, 0, YEAR_MAX) }
}

/** The newest `max` rows that read, keeping the first row of each id when rows carry one. */
function readList<T>(v: unknown, max: number, one: (x: unknown) => T | null, idOf?: (x: T) => string): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const x of cap(arr(v), max * 2)) {
    const row = one(x)
    if (row === null) continue
    if (idOf) {
      const id = idOf(row)
      if (seen.has(id)) continue
      seen.add(id)
    }
    out.push(row)
  }
  return cap(out, max)
}

function readMother(v: unknown): ModelExtra['mother'] {
  if (!isObject(v)) return null
  const agency = txt(v.agency, TEXT_MAX)
  if (!agency) return null
  return { agency, booker: txt(v.booker, NAME_MAX), since: int(v.since, 0, 0, YEAR_MAX), overrideUntil: int(v.overrideUntil, 0, 0, YEAR_MAX) }
}

function readLife(v: unknown): ModelExtra['life'] {
  const r = rec(v)
  return {
    gross: int(r.gross, 0, 0, TOTAL_MAX),
    net: int(r.net, 0, 0, TOTAL_MAX),
    agency: int(r.agency, 0, 0, TOTAL_MAX),
    mother: int(r.mother, 0, 0, TOTAL_MAX),
    recoup: int(r.recoup, 0, 0, TOTAL_MAX),
    booked: int(r.booked, 0, 0, COUNT_MAX),
    faces: int(r.faces, 0, 0, COUNT_MAX),
    shows: int(r.shows, 0, 0, COUNT_MAX),
    peak: int(r.peak, 0, 0, 1000),
    peakYear: int(r.peakYear, 0, 0, YEAR_MAX),
  }
}

function normalizeExtra(raw: Raw): ModelExtra {
  const board = rec(raw.board)
  return {
    focus: pickOf(raw.focus, FOCUSES, 'editorial'),
    focusYear: int(raw.focusYear, 0, 0, YEAR_MAX),
    restYear: int(raw.restYear, 0, 0, YEAR_MAX),
    planYear: int(raw.planYear, 0, 0, YEAR_MAX),
    book: dec(raw.book, 0, 0, 100),
    buzz: dec(raw.buzz, 0, 0, 100),
    rep: dec(raw.rep, 50, 0, 100),
    strain: dec(raw.strain, 10, 0, 100),
    mood: dec(raw.mood, 60, 0, 100),
    mother: readMother(raw.mother),
    floor: int(raw.floor, 0, 0, FLOOR_MAX),
    board: { year: int(board.year, 0, 0, YEAR_MAX), items: readList(board.items, CAPS.board, readOffer, (o) => o.id) },
    windows: readList(raw.windows, CAPS.windows, readWindow),
    photographers: strings(raw.photographers, CAPS.photographers, NAME_MAX),
    agencies: readList(raw.agencies, CAPS.agencies, readAgencyRow),
    ledger: readList(raw.ledger, CAPS.ledger, readRow),
    life: readLife(raw.life),
    proteges: readList(raw.proteges, CAPS.proteges, readProtege, (p) => p.id),
    exit: pickOf(raw.exit, EXITS, ''),
    likeness: int(raw.likeness, 0, 0, LIKENESS_MAX),
    announced: strings(raw.announced, CAPS.announced, NAME_MAX),
  }
}

// ---------------------------------------------------------------------------
// The legacy profile

/**
 * v0 to v1: book = round(headshot x 0.35 + min(30, gigs x 1.5)) from the legacy special.model profile; reputation
 * 50, strain 10, mood 60; runway at age 25 or under with looks 70 or more, else editorial; the mother agency is
 * the agency of the model job, and the floor is its retainer. Reads only; never writes the legacy flag or Job.data.
 */
function migrateLegacy(raw: Raw, g: GameState): Raw {
  const p = viewModel(g)
  const job = modelJob(g)
  const c = g.character
  const young = Number.isFinite(c.age) && c.age <= 25
  const looks = Number.isFinite(c.stats.looks) ? c.stats.looks : 0
  const out: Raw = {
    ...raw,
    book: Math.round(p.headshot * 0.35 + Math.min(30, p.gigs * 1.5)),
    rep: 50,
    strain: 10,
    mood: 60,
    focus: young && looks >= 70 ? 'runway' : 'editorial',
  }
  if (job) {
    out.mother = { agency: job.company, booker: '', since: int(g.year - int(job.yearsAtCompany, 0, 0, 200), 0, 0, YEAR_MAX), overrideUntil: 0 }
    out.floor = job.salary
  }
  return out
}

export const modelStore: CareerStore<ModelState> = defineCareerState<ModelExtra>({
  key: 'model.sim',
  version: 1,
  start: 20,
  migrate: [migrateLegacy],
  extra: normalizeExtra,
})

// ---------------------------------------------------------------------------
// The contract

/** The appointment id the contract is stamped with: the job's own, else one derived from fields that last the job's life. */
export function contractKey(job: Job): string {
  return appointmentId(job) || txt(`${job.defId}:${job.company}:${int(rec(job.data).startAge, 0, 0, 300)}`, KEY_MAX)
}

function readContractRow(r: Raw, id: string): MdContract {
  const advance = int(r.advance, 0, 0, ADVANCE_MAX)
  const since = int(r.since, 0, 0, YEAR_MAX)
  return {
    appointmentId: id,
    agency: txt(r.agency, TEXT_MAX),
    tier: int(r.tier, 0, 0, 3),
    commission: int(r.commission, 20, 12, 30),
    guarantee: r.guarantee === true,
    exclusive: r.exclusive === true,
    since,
    until: Math.max(since, int(r.until, since, 0, YEAR_MAX)),
    advance,
    unrecouped: Math.min(advance, int(r.unrecouped, 0, 0, ADVANCE_MAX)),
    bookerId: txt(r.bookerId, ID_MAX),
    bookerName: txt(r.bookerName, NAME_MAX),
  }
}

/** The contract of a job that has none stored: a Guarantee, exclusive, commission base + 3, two years from `g.year`. */
function legacyContract(g: GameState, job: Job, id: string): MdContract {
  const d = rec(job.data)
  const row = AGENCIES.findIndex((a) => a.name === job.company)
  const tier = typeof d.tier === 'number' && Number.isFinite(d.tier) ? int(d.tier, 0, 0, 3) : Math.max(0, row)
  return {
    appointmentId: id,
    agency: txt(job.company, TEXT_MAX),
    tier,
    commission: commissionFor(tier, 0, true),
    guarantee: true,
    exclusive: true,
    since: int(g.year - int(job.yearsAtCompany, 0, 0, 200), 0, 0, YEAR_MAX),
    until: int(g.year + 2, 0, 0, YEAR_MAX),
    advance: 0,
    unrecouped: 0,
    bookerId: '',
    bookerName: '',
  }
}

/**
 * The model job's contract, validated by the appointment id (a contract of another job reads as none). A job with
 * no stored contract is a legacy job: with `g` it reads as the contract built from the Job (a Guarantee, commission
 * base + 3, two years from this year); without `g` there is no year to build from and it reads null. Pure.
 */
export function readContract(job: Job | null, g?: GameState): MdContract | null {
  if (!job || job.defId !== 'model') return null
  const id = contractKey(job)
  const stored = rec(job.data).contract
  if (isObject(stored)) {
    const sid = typeof stored.appointmentId === 'string' ? txt(stored.appointmentId, KEY_MAX) : ''
    return sid && sid === id ? readContractRow(stored, id) : null
  }
  return g ? legacyContract(g, job, id) : null
}

// ---------------------------------------------------------------------------
// Money

function part(v: unknown, room: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 0
  return Math.max(0, Math.min(n, room))
}

/**
 * The one way a model fee reaches the wallet: `amount` is the gross fee, `parts` the dollars the agency, the
 * mother agency and the advance take. Pays the net through `c.earn`, books one ledger row (24 kept) and adds to
 * the life totals; gross = agency + mother + recoup + net exactly, and a year's paid gross stops at 6,000,000.
 * Returns the net paid (0 for a bad amount, an empty source or a full year). Actions and settle bodies only.
 */
export function payOut(c: CareerCtx<ModelState>, src: string, amount: number, parts: { agency: number; mother: number; recoup: number }): number {
  const label = txt(src, TEXT_MAX)
  if (!label || !Number.isFinite(amount) || amount < 1) return 0
  const s = c.s
  const used = s.ledger.reduce((n, r) => (r.year === c.year ? n + r.gross : n), 0)
  const gross = Math.min(Math.round(amount), Math.max(0, YEAR_GROSS_MAX - used))
  if (gross < 1) return 0
  const agency = part(parts.agency, gross)
  const mother = part(parts.mother, gross - agency)
  const recoup = part(parts.recoup, gross - agency - mother)
  const net = gross - agency - mother - recoup
  const paid = c.earn(label, net)
  s.ledger.push({ year: c.year, src: label, gross, agency, mother, recoup, net })
  if (s.ledger.length > CAPS.ledger) s.ledger.splice(0, s.ledger.length - CAPS.ledger)
  const t = s.life
  t.gross = Math.min(TOTAL_MAX, t.gross + gross)
  t.net = Math.min(TOTAL_MAX, t.net + paid)
  t.agency = Math.min(TOTAL_MAX, t.agency + agency)
  t.mother = Math.min(TOTAL_MAX, t.mother + mother)
  t.recoup = Math.min(TOTAL_MAX, t.recoup + recoup)
  return paid
}
