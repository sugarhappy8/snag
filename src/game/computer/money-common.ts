// Shared helpers for the risky side of the home computer (computer/money*.ts): the saved state,
// local regulators and brokers, how hard the authorities look, parents finding out, and small
// number utilities. Everything stored lives in g.flags.computerMoney as plain JSON.
import { seeded } from '../assets'
import { canUseComputer } from '../computer'
import { addLoan, offeredRate } from '../finance'
import { addMoney, addRelationship, addStat, count, formatMoney, log, parents, relationLabel } from '../core'
import { marketOf } from '../data/markets'
import { moneyScale } from '../prison'
import { rand, randInt } from '../rng'
import type { GameState, Json, Person } from '../types'
import { getCountry, randomFirstName, randomLastName } from '../world'

// ---------------------------------------------------------------------------
// Tiny utilities

export function isRecord(v: Json | undefined): v is { [key: string]: Json } {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function num(v: Json | undefined, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

export function str(v: Json | undefined, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

export function clampNum(n: number, lo: number, hi: number): number {
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo
}

/** Whole dollars, never NaN or negative. */
export function dollars(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0
}

/** Signed percentage, e.g. '+12.3%'. */
export function pct(x: number, digits = 1): string {
  const v = Number.isFinite(x) ? x * 100 : 0
  const s = Math.abs(v).toFixed(Math.abs(v) >= 100 ? 0 : digits)
  if (Number(s) === 0) return '0%'
  return `${v < 0 ? '-' : '+'}${s}%`
}

export function absPct(x: number, digits = 0): string {
  return pct(Math.abs(x), digits).replace('+', '')
}

export function years(n: number): string {
  return `${n} year${n === 1 ? '' : 's'}`
}

export function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

/** Roughly standard-normal draw from the game's RNG (sum of six uniforms). */
export function normal(g: GameState): number {
  let s = 0
  for (let i = 0; i < 6; i++) s += rand(g)
  return (s - 3) * Math.SQRT2
}

/** Local money scale (same as the crime module's): poorer countries, smaller sums. */
export function scale(g: GameState): number {
  return moneyScale(g)
}

/** A sum in US dollars scaled to the local economy and rounded nicely. */
export function local(g: GameState, usd: number): number {
  const v = usd * scale(g)
  if (v >= 10_000) return Math.round(v / 100) * 100
  if (v >= 1_000) return Math.round(v / 10) * 10
  return Math.max(1, Math.round(v))
}

// ---------------------------------------------------------------------------
// Who can do anything here

/** Alive, free, and with a working, unconfiscated computer. */
export function canAct(g: GameState): boolean {
  const c = g.character
  return c.alive && !c.prison && canUseComputer(g)
}

/** Why the player can't do a computer money activity (null = can). */
export function blockReason(g: GameState, minAge: number): string | null {
  const c = g.character
  if (!c.alive) return 'You are dead.'
  if (c.prison) return "There's no Wi-Fi in a prison cell."
  if (c.age < minAge) return `You must be at least ${minAge} to do that.`
  return null
}

/** Countries where crypto trading is banned outright (same list as Investments). */
const CRYPTO_BANNED = new Set(['cn', 'dz', 'eg', 'np', 'bd', 'af', 'iq', 'qa'])

export function cryptoBanned(countryId: string): boolean {
  return CRYPTO_BANNED.has(countryId)
}

// ---------------------------------------------------------------------------
// The saved state (g.flags.computerMoney)

export const STATE_KEY = 'computerMoney'

export type OptionMode = 'real' | 'paper' | 'parent'
export type OptionDir = 'call' | 'put'
export type OptionStrike = 'atm' | 'otm' | 'lotto'

/** An index option that settles at the next age-up. */
export interface OptionPos {
  id: string
  mode: OptionMode
  side: 'buy' | 'sell'
  dir: OptionDir
  strike: OptionStrike
  /** Strike as a return the index must beat, e.g. 0.09 = needs a 9% move your way. */
  k: number
  /** Dollars of index exposure (notional). */
  units: number
  /** Premium paid (buy) or collected (sell), fees excluded. */
  premium: number
  /** Calendar year it was opened; it settles on the index move of year + 1. */
  year: number
  /** Exchange key (invest/engine.ts) and display name of its index. */
  exKey: string
  index: string
  countryId: string
  /** Parent whose account was "borrowed" (mode 'parent'). */
  parentId: string
}

/** A meme coin the player launched. */
export interface CoinRecord {
  name: string
  ticker: string
  age: number
  outcome: 'dumped' | 'rugged' | 'dumpedOn'
  /** What the player walked away with. */
  take: number
  exposed: boolean
  countryId: string
}

/** A regulator quietly building a case about a coin, due at a later age. */
export interface Probe {
  id: string
  kind: 'dump' | 'rug'
  ticker: string
  take: number
  dueAge: number
  startAge: number
  countryId: string
  evidence: number
  /** Known publicly (sleuths exposed you): the AI context may mention it. */
  publicCase: boolean
  /** Index of the criminal-record entry (rug pulls), -1 when none. */
  recordIndex: number
}

export interface MoneyState {
  /** Options trading skill 0-100. */
  skill: number
  /** Brokerage name once an adult opened an account ('' = none). */
  broker: string
  /** Lifetime realized options P&L with real money. */
  pnl: number
  paperPnl: number
  /** Virtual paper-trading cash. */
  paperCash: number
  /** Realized trading losses not yet offset against gains (tax). */
  lossCarry: number
  /** Real-money trades made. */
  trades: number
  positions: OptionPos[]
  coins: CoinRecord[]
  probes: Probe[]
  /** P&L from aping into other people's coins. */
  apePnl: number
  apes: number
  /** Scam heat 0-100: cools every year. */
  heat: number
  scams: number
  scamTake: number
  /** Times each scam type was run (diminishing returns). */
  scamKinds: Record<string, number>
  /** Platform bans collected. */
  bans: number
  /** Criminal-record indexes of scams (so a catch-up arrests for the right crime). */
  scamRecords: number[]
}

export const PAPER_START = 10_000

function fresh(): MoneyState {
  return {
    skill: 0,
    broker: '',
    pnl: 0,
    paperPnl: 0,
    paperCash: PAPER_START,
    lossCarry: 0,
    trades: 0,
    positions: [],
    coins: [],
    probes: [],
    apePnl: 0,
    apes: 0,
    heat: 0,
    scams: 0,
    scamTake: 0,
    scamKinds: {},
    bans: 0,
    scamRecords: [],
  }
}

const DIRS = ['call', 'put']
const STRIKES = ['atm', 'otm', 'lotto']
const MODES = ['real', 'paper', 'parent']

function validPos(v: Json): boolean {
  if (!isRecord(v)) return false
  return (
    typeof v.id === 'string' &&
    MODES.includes(str(v.mode)) &&
    (v.side === 'buy' || v.side === 'sell') &&
    DIRS.includes(str(v.dir)) &&
    STRIKES.includes(str(v.strike)) &&
    num(v.units, -1) >= 0 &&
    num(v.premium, -1) >= 0 &&
    Number.isFinite(num(v.k, NaN)) &&
    Number.isFinite(num(v.year, NaN)) &&
    typeof v.exKey === 'string'
  )
}

function validCoin(v: Json): boolean {
  return isRecord(v) && typeof v.ticker === 'string' && typeof v.name === 'string' && ['dumped', 'rugged', 'dumpedOn'].includes(str(v.outcome))
}

function validProbe(v: Json): boolean {
  return isRecord(v) && typeof v.id === 'string' && (v.kind === 'dump' || v.kind === 'rug') && Number.isFinite(num(v.dueAge, NaN)) && typeof v.countryId === 'string'
}

/** Fix one record's fields in place (old saves, hand-edited saves). */
function repair(o: { [key: string]: Json }): void {
  const d = fresh() as unknown as { [key: string]: Json }
  for (const key of ['skill', 'pnl', 'paperPnl', 'paperCash', 'lossCarry', 'trades', 'apePnl', 'apes', 'heat', 'scams', 'scamTake', 'bans']) {
    if (typeof o[key] !== 'number' || !Number.isFinite(o[key] as number)) o[key] = d[key]
  }
  o.skill = clampNum(num(o.skill), 0, 100)
  o.heat = clampNum(num(o.heat), 0, 100)
  o.lossCarry = Math.max(0, num(o.lossCarry))
  if (typeof o.broker !== 'string') o.broker = ''
  if (!isRecord(o.scamKinds)) o.scamKinds = {}
  const kinds = o.scamKinds as { [key: string]: Json }
  for (const k of Object.keys(kinds)) if (typeof kinds[k] !== 'number' || !Number.isFinite(kinds[k] as number)) delete kinds[k]
  const validIndex = (v: Json): boolean => typeof v === 'number' && Number.isInteger(v) && v >= 0
  for (const [key, ok] of [['positions', validPos], ['coins', validCoin], ['probes', validProbe], ['scamRecords', validIndex]] as const) {
    const arr = o[key]
    if (!Array.isArray(arr)) o[key] = []
    else if (!arr.every(ok)) o[key] = arr.filter(ok)
  }
}

/**
 * The mutable state, created on first use and repaired in place (so repeated calls return the
 * same object). Use only where mutating g is allowed (menu runs, scripts, yearly hooks).
 */
export function moneyState(g: GameState): MoneyState {
  let raw = g.flags[STATE_KEY]
  if (!isRecord(raw)) {
    raw = fresh() as unknown as Json
    g.flags[STATE_KEY] = raw
  }
  repair(raw as { [key: string]: Json })
  return raw as unknown as MoneyState
}

/** A read-only snapshot for menus and summaries (never writes to g). */
export function readState(g: GameState): MoneyState {
  const raw = g.flags[STATE_KEY]
  if (!isRecord(raw)) return fresh()
  const copy = JSON.parse(JSON.stringify(raw)) as { [key: string]: Json }
  repair(copy)
  return copy as unknown as MoneyState
}

// ---------------------------------------------------------------------------
// Local institutions

/** Securities regulators by country (real public institutions); generic elsewhere. */
const REGULATORS: Record<string, string> = {
  us: 'the SEC',
  ca: 'the provincial securities commission',
  mx: 'the CNBV',
  br: 'the CVM',
  ar: 'the CNV',
  cl: 'the CMF',
  co: 'the Financial Superintendence',
  pe: 'the SMV',
  gb: 'the FCA',
  ie: 'the Central Bank of Ireland',
  de: 'BaFin',
  at: 'the FMA',
  ch: 'FINMA',
  fr: 'the AMF',
  be: 'the FSMA',
  nl: 'the AFM',
  it: 'CONSOB',
  es: 'the CNMV',
  pt: 'the CMVM',
  gr: 'the Hellenic Capital Market Commission',
  se: 'Finansinspektionen',
  no: 'Finanstilsynet',
  dk: 'Finanstilsynet',
  fi: 'the FIN-FSA',
  pl: 'the KNF',
  au: 'ASIC',
  nz: 'the FMA',
  in: 'SEBI',
  id: 'OJK',
  jp: 'the FSA',
  kr: 'the FSC',
  cn: 'the CSRC',
  hk: 'the SFC',
  sg: 'the MAS',
  my: 'the Securities Commission',
  th: 'the Thai SEC',
  ph: 'the Philippine SEC',
  vn: 'the State Securities Commission',
  tw: 'the FSC',
  pk: 'the SECP',
  za: 'the FSCA',
  ng: 'the Nigerian SEC',
  ke: 'the Capital Markets Authority',
  eg: 'the FRA',
  ma: 'the AMMC',
  ae: 'the SCA',
  sa: 'the Capital Market Authority',
  tr: 'the Capital Markets Board',
  il: 'the Israel Securities Authority',
}

/** e.g. 'the SEC', 'BaFin', "Kenya's financial regulator" (lowercase 'the'; use cap() to start a sentence). */
export function regulator(countryId: string): string {
  const known = REGULATORS[countryId]
  if (known) return known
  const n = getCountry(countryId).name
  const the = /^(United|Netherlands|Philippines|Bahamas|Czech|Dominican|Central African|Democratic|Republic|Maldives|Gambia|Solomon|Marshall)/.test(n) ? 'the ' : ''
  return `${the}${n}${n.endsWith('s') ? "'" : "'s"} financial regulator`
}

/** The police unit that chases online fraud (kept generic: every country has one). */
export function cyberUnit(countryId: string): string {
  return countryId === 'us' ? 'federal cybercrime agents' : 'the police cybercrime unit'
}

/**
 * How hard the authorities chase financial crime here, 0-1: strongest where corruption is low
 * (Denmark ~0.85, the US ~0.68, Venezuela ~0.31).
 */
export function enforcement(countryId: string): number {
  const c = marketOf(countryId).corruption
  const corr = Number.isFinite(c) ? clampNum(c, 0, 100) : 50
  return Math.round((0.22 + 0.7 * (1 - corr / 100)) * 1000) / 1000
}

const BROKER_SUFFIX = ['Securities', 'Direct', 'Invest', 'Trade', 'Brokerage', 'Markets']
const BROKER_FALLBACK = ['Summit', 'Harbor', 'Pioneer', 'Keystone', 'Meridian', 'Lighthouse']

/** A local-sounding online broker for a country (deterministic, invented). */
export function brokerName(countryId: string): string {
  const r = seeded(`broker|${countryId}`)
  const words = marketOf(countryId).nameWords.filter((w) => /^[A-Za-z][A-Za-z' -]{1,14}$/.test(w))
  const word = words.length ? r.pick(words) : r.pick(BROKER_FALLBACK)
  return `${word} ${r.pick(BROKER_SUFFIX)}`
}

// ---------------------------------------------------------------------------
// People

/** A fictional stranger: "Doris Kamau, 81". */
export function stranger(g: GameState, minAge = 20, maxAge = 85): { first: string; full: string; age: number; he: string; his: string } {
  const female = rand(g) < 0.5
  const cid = g.character.countryId
  const first = randomFirstName(g, cid, female ? 'female' : 'male')
  const last = randomLastName(g, cid)
  return { first, full: `${first} ${last}`, age: randInt(g, minAge, maxAge), he: female ? 'she' : 'he', his: female ? 'her' : 'his' }
}

/** The parent with the fattest bank account (for "borrowing" their brokerage login). */
export function richestParent(g: GameState): Person | undefined {
  return [...parents(g)].sort((a, b) => b.money - a.money)[0]
}

/**
 * Parents find out what a minor has been up to on the computer: grounded, relationship hit,
 * and the computer confiscated (g.flags.computerLockedUntil) for `lockYears` (never past 18).
 * `what` must read in both persons ("running online scams", not "...your..."): it goes into the
 * popup ("found out you were ...") and the log ("found out I was ..."). Returns the popup
 * sentence ('' for adults).
 */
export function parentsCatch(g: GameState, what: string, lockYears: number, relHit: number): string {
  const c = g.character
  if (c.age >= 18) return ''
  const ps = parents(g)
  const until = Math.max(c.age + 1, Math.min(18, c.age + Math.max(1, Math.round(lockYears))))
  const prev = num(g.flags.computerLockedUntil)
  g.flags.computerLockedUntil = prev > until ? prev : until
  const who = ps.length === 1 ? `Your ${relationLabel(ps[0]).toLowerCase()}` : ps.length ? 'Your parents' : 'Your guardian'
  g.flags.computerLockedBy = who
  for (const p of ps) addRelationship(p, -randInt(g, relHit, relHit + 8))
  addStat(g, 'happiness', -randInt(g, 4, 9))
  count(g, 'computerConfiscated')
  log(g, `${who.replace(/^Your/, 'My')} found out I was ${what}. I was grounded and lost my computer.`, 'bad')
  const back = num(g.flags.computerLockedUntil, until)
  return `${who} found out you were ${what}. You're grounded, and your computer is locked away until you're ${back}.`
}

/**
 * A minor's arrest reaches the parents too: grounded, computer confiscated. Returns the sentence
 * to fold into the arrest popup ('' for adults). Call it before arrestPlayer.
 */
export function minorBusted(g: GameState, what: string): string {
  return g.character.age < 18 ? parentsCatch(g, what, 2, 12) : ''
}

/** The police take the computer as evidence; it comes back after `years` birthdays. Returns that age. */
export function seizeComputer(g: GameState, years = 1): number {
  const until = g.character.age + Math.max(1, Math.round(years))
  if (num(g.flags.computerLockedUntil) < until) {
    g.flags.computerLockedUntil = until
    g.flags.computerLockedBy = 'The police'
  }
  return num(g.flags.computerLockedUntil, until)
}

// ---------------------------------------------------------------------------
// Paying what you owe

/**
 * Pay a bill from cash; whatever can't be covered becomes a personal loan from `lender`
 * (adults) or is simply waived for minors. Returns the part that went on a loan.
 */
export function payOrBorrow(g: GameState, amount: number, lender: string): number {
  const due = dollars(amount)
  if (due <= 0) return 0
  const cash = Math.max(0, g.character.money)
  const paid = Math.min(cash, due)
  if (paid > 0) addMoney(g, -paid)
  const rest = due - paid
  if (rest <= 0 || g.character.age < 18) return 0
  addLoan(g, { kind: 'personal', lender, principal: rest, rate: offeredRate(g, 'personal'), years: 5 })
  return rest
}

/** "$1,200" with a loan note when part of it was financed. */
export function paidText(amount: number, financed: number, lender: string): string {
  return financed > 0 ? `${formatMoney(amount)} (${formatMoney(financed)} of it on a payment plan with ${lender})` : formatMoney(amount)
}

// ---------------------------------------------------------------------------
// Family market seed (same as the Investments menu, so options settle on the moves it shows)

export function fam(g: GameState): string {
  return (g.lifeId || 'life').replace(/-g\d+$/, '')
}

export function anchor(g: GameState): number {
  const first = g.ancestors?.[0]?.bornYear
  const own = g.year - g.character.age
  const a = typeof first === 'number' && Number.isFinite(first) ? Math.min(first, own) : own
  return Number.isFinite(a) ? a : g.year
}

// ---------------------------------------------------------------------------
// Yearly news: each part offers candidates, the hook shows at most one popup.

export interface News {
  /** Higher wins the year's single popup. */
  priority: number
  /** Show it as the popup (may start an arrest). */
  popup: (g: GameState) => void
  /** It lost the popup slot: log it quietly or postpone it. */
  quiet: (g: GameState) => void
}
