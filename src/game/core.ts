// Shared helpers every game module uses: stats, money, log, modals, people lookups.
import { bookPlayer, roomFor, tokenSeen, type Why } from './kernel/ledger'
import { applyRelationship, assignRelationship, notifyMirror, type RelKind } from './kernel/relations'
import { noticeWeightFor, noticeWeightOf } from './notice-weights'
import { chance, uid } from './rng'
import type {
  AiTask,
  CareerRecord,
  Character,
  ChoiceOption,
  GameState,
  Gender,
  HiddenKey,
  InputModal,
  Json,
  LifeStage,
  LogEntry,
  LogWeight,
  MinigameKind,
  Person,
  RelationKind,
  StatKey,
  Tone,
} from './types'

/** Frozen: it marks the save family, so an older build still recognises a newer save's shell. */
export const GAME_VERSION = 1
/**
 * Which shape of save the game writes (GameState.schemaVersion). Changing the shape of the saved
 * state bumps it and adds a step to the chain in save-schema.ts. 3 from v5.0.0: versioned slices
 * and chunks (save-slices.ts); a build that only knows 2 files such a save as `newer` and keeps it.
 */
export const SAVE_SCHEMA = 3

export function clamp(n: number, lo = 0, hi = 100): number {
  if (Number.isNaN(n)) return lo
  return Math.max(lo, Math.min(hi, n))
}

// ---------------------------------------------------------------------------
// Stats

export function addStat(g: GameState, key: StatKey, delta: number): void {
  const c = g.character
  if (!Number.isFinite(c.stats[key]) || !Number.isFinite(delta)) return
  c.stats[key] = Math.round(clamp(c.stats[key] + delta))
}

export function addHidden(g: GameState, key: HiddenKey, delta: number): void {
  const c = g.character
  if (!Number.isFinite(c.hidden[key]) || !Number.isFinite(delta)) return
  c.hidden[key] = Math.round(clamp(c.hidden[key] + delta))
}

export function addPersonStat(p: Person, key: StatKey, delta: number): void {
  if (!Number.isFinite(p.stats[key]) || !Number.isFinite(delta)) return
  p.stats[key] = Math.round(clamp(p.stats[key] + delta))
}

/**
 * The one way to move a relationship by an amount. The body is the v5.2.0 expression (kernel/relations.ts applyRelationship: nothing for a
 * non-finite relationship or delta, else Math.round(clamp(p.relationship + delta))); what it changed goes to the mirror hook, which is
 * unbound until R4-E7 (a stamped life only). `kind` is `decay` for the yearly drift; the default is the sign of the delta.
 */
export function addRelationship(g: GameState, p: Person, delta: number, kind?: RelKind): void {
  const change = applyRelationship(p, delta, kind)
  if (change !== null) notifyMirror(g, p, change)
}

/**
 * The one way to set a relationship to a value: the old raw write `p.relationship = value`, verbatim (no clamp, no rounding), so a
 * call site passes its old right-hand side unchanged and a randInt inside it draws in the same place.
 */
export function setRelationship(g: GameState, p: Person, value: number, kind?: RelKind): void {
  notifyMirror(g, p, assignRelationship(p, value, kind))
}

// ---------------------------------------------------------------------------
// Money

/** The token a money call carries, or undefined. A call's `why` may be a reason, an object, or junk (a saved or computed value). */
function tokenOf(why: Why | undefined): string | undefined {
  if (why === null || typeof why !== 'object') return undefined
  const t: unknown = why.token
  return typeof t === 'string' && t.length > 0 ? t : undefined
}

/** A plain zero for a change that rounded away (Math.round(-0.4) is -0, and `toBe(0)` and JSON tell them apart). */
const plain = (n: number): number => (n === 0 ? 0 : n)

// The three primitives below keep their old validation and rounding exactly; what is new is the second argument. Every call that
// moves cash books the same whole dollars in the ledger (kernel/ledger.ts) under `why`: a reason from the table (kernel/reasons.ts),
// or an object that names the counterparty, the country or a token. A call with no `why` books as `unreasoned`, which the ratchet
// counts (test/money-ratchet.test.ts), so a migration batch gives each site its reason. A receipt whose payer is a capped mint
// (the lending mint) is clipped to the mint's room and the cash takes only what the ledger booked; nothing else ever clips.
// A call with a token that was already booked this year changes nothing, so a replayed year pays nothing twice.

/** Adds money (a negative delta takes it). Returns the change applied: the delta rounded, 0 when it was refused or clipped away. */
export function addMoney(g: GameState, delta: number, why?: Why): number {
  const before = g.character.money
  if (!Number.isFinite(before) || !Number.isFinite(delta) || !Number.isFinite(before + delta)) return 0
  const token = tokenOf(why)
  if (token !== undefined && tokenSeen(g, token)) return 0
  // The books carry the cash rounded to whole dollars (erodeCash leaves a fraction behind), so a change is booked against Math.round(before):
  // the booking then lands the books exactly on the new whole-dollar cash, even when the fraction is an exact half dollar.
  const want = Math.round(before + delta) - Math.round(before)
  const after = Math.round(before + (delta > 0 ? Math.min(delta, roomFor(g, why)) : delta))
  g.character.money = after
  // The books get the whole amount: a mint clips it to the same room the cash was clipped to, and logs the cap row.
  bookPlayer(g, why, want)
  return plain(after - before)
}

/**
 * Spend if affordable; returns false (and spends nothing) otherwise. A call whose token was already booked this year spends
 * nothing and returns false.
 */
export function spend(g: GameState, amount: number, why?: Why): boolean {
  if (!Number.isFinite(g.character.money) || !Number.isFinite(amount)) return false
  if (amount <= 0) return true
  if (g.character.money < amount) return false
  const token = tokenOf(why)
  if (token !== undefined && tokenSeen(g, token)) return false
  const before = g.character.money
  g.character.money = Math.round(before - amount)
  bookPlayer(g, why, g.character.money - Math.round(before))
  return true
}

/**
 * Taxable income (salary, pension, royalties...). Adds the money and accumulates
 * g.flags.taxableIncome, which yearlyFinance taxes at the end of the yearly hooks. Returns the change applied (0 when refused).
 */
export function earnIncome(g: GameState, amount: number, why?: Why): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0
  const prev = typeof g.flags.taxableIncome === 'number' && Number.isFinite(g.flags.taxableIncome) ? g.flags.taxableIncome : 0
  const before = g.character.money
  const money = before + amount
  const taxable = prev + amount
  if (!Number.isFinite(before) || !Number.isFinite(money) || !Number.isFinite(taxable)) return 0
  const token = tokenOf(why)
  if (token !== undefined && tokenSeen(g, token)) return 0
  const room = roomFor(g, why)
  const got = Math.min(amount, room)
  g.character.money = Math.round(before + got)
  g.flags.taxableIncome = Math.round(prev + got)
  bookPlayer(g, why, Math.round(money) - Math.round(before))
  return plain(g.character.money - before)
}

export function canAfford(g: GameState, amount: number): boolean {
  return Number.isFinite(g.character.money) && Number.isFinite(amount) && amount >= 0 && g.character.money >= amount
}

// ---------------------------------------------------------------------------
// Money display
//
// The engine keeps every amount in constant PRESENT_YEAR US dollars (history/timeline.ts). What
// the player sees can be the local currency and/or the prices of the year being lived ("a 1980
// salary of $10K"). formatMoney/shortMoney (and every module's money() helper, which must call
// them) go through the registered converter; the default shows plain US dollars, so tests and
// old code behave exactly as before. The UI binds the live game (bindMoneyContext) and the
// player's settings (setMoneyDisplay); data/currencies.ts registers the real converter.
//
// Never format money by hand ('$' + n, toLocaleString): use formatMoney / shortMoney, formatCents
// (unit prices with cents), formatPrice (share and coin quotes) or moneyWith (custom digits).
// Amounts the player types are in display units: mark the input `money: true` (MenuInput or
// InputModal) and the UI converts them back with moneyFromInput before the engine sees them.

export type MoneyMode = 'usd' | 'local'

export interface MoneyDisplay {
  /** 'local': the currency of the country the character lives in; 'usd': US dollars. */
  mode: MoneyMode
  /** True: prices as they were in the year being lived (1980 money); false: today's money. */
  nominal: boolean
}

/** An internal amount as the player should see it. */
export interface ShownMoney {
  /** The amount in display units (already converted). */
  amount: number
  /** e.g. '$', '¥', 'Rp', 'R$', '₦', 'CHF'. */
  symbol: string
  /** ISO code, e.g. 'USD', 'JPY'. */
  code: string
  /** True when the symbol goes after the number ('100 kr'). */
  suffix?: boolean
  /** A space between a symbol in front and the number ('CHF 100', 'Rp 5,000'). */
  space?: boolean
  /** Digits after the decimal point the currency uses (0 for yen, won, rupiah...). Default 2. */
  decimals?: number
  /** The currency's name for prose ('Japanese yen', 'US dollars'). */
  name?: string
  /**
   * True when the amount was converted (another currency, or another year's prices): small
   * amounts then keep their cents ($0.35 in 1925), which whole internal dollars never need.
   */
  converted?: boolean
}

export interface MoneyContext {
  countryId: string
  year: number
  /** Simulated future price level relative to the historical currency baseline. */
  nominalScale?: number
  usdNominalScale?: number
}

export type MoneyConverter = (n: number, ctx: MoneyContext | null, display: MoneyDisplay) => ShownMoney

let moneyDisplaySetting: MoneyDisplay = { mode: 'usd', nominal: false }
let moneyContext: () => MoneyContext | null = () => null
let converter: MoneyConverter = (n) => ({ amount: n, symbol: '$', code: 'USD' })

/** The player's display choice (Settings). */
export function setMoneyDisplay(d: Partial<MoneyDisplay>): void {
  moneyDisplaySetting = { ...moneyDisplaySetting, ...d }
}

export function moneyDisplay(): MoneyDisplay {
  return moneyDisplaySetting
}

/** Which life money is shown for (its country and year); null = plain US dollars. */
export function bindMoneyContext(g: GameState | null): void {
  moneyContext = g ? () => moneyContextOf(g) : () => null
}

export function currentMoneyContext(): MoneyContext | null {
  return moneyContext()
}

/** Run `fn` with money shown for `ctx` (e.g. a settings preview), then restore the bound life. */
export function withMoneyContext<T>(ctx: MoneyContext | null, fn: () => T): T {
  const saved = moneyContext
  moneyContext = () => ctx
  try {
    return fn()
  } finally {
    moneyContext = saved
  }
}

/** The money context of a life (its country and year), without binding it. */
export function moneyContextOf(g: GameState): MoneyContext {
  const raw = g.flags.worldEconomy as { countries?: Record<string, { year?: number; priceScale?: number }> } | undefined
  const e = raw?.countries?.[g.character.countryId]
  const scale = e?.year === g.year && typeof e.priceScale === 'number' && Number.isFinite(e.priceScale) && e.priceScale > 0 ? e.priceScale : 1
  const us = raw?.countries?.us
  const usdScale = us?.year === g.year && typeof us.priceScale === 'number' && Number.isFinite(us.priceScale) && us.priceScale > 0 ? us.priceScale : 1
  return { countryId: g.character.countryId, year: g.year, ...(scale !== 1 ? { nominalScale: scale } : {}), ...(usdScale !== 1 ? { usdNominalScale: usdScale } : {}) }
}

/** data/currencies.ts installs the real converter (local currency + year prices). */
export function registerMoneyConverter(fn: MoneyConverter): void {
  converter = fn
}

/** An internal amount converted for display with the current settings and context. */
export function showMoney(n: number): ShownMoney {
  return converter(n, moneyContext(), moneyDisplaySetting)
}

/** showMoney for a given life's country and year instead of the bound one. */
export function showMoneyIn(n: number, ctx: MoneyContext | null): ShownMoney {
  return converter(n, ctx, moneyDisplaySetting)
}

function scaleOf(m: ShownMoney, n: number): number {
  const one = m.amount / n
  return Number.isFinite(one) && one > 0 ? one : 1
}

/** Display units per internal dollar right now (1 in plain USD mode); for money input fields. */
export function moneyScale(): number {
  return scaleOf(showMoney(1_000_000), 1_000_000)
}

/** Display units per internal dollar for a given life. */
export function moneyScaleFor(ctx: MoneyContext | null): number {
  return scaleOf(showMoneyIn(1_000_000, ctx), 1_000_000)
}

/** A number the player gave in display units, back to internal dollars. */
export function moneyFromInput(displayAmount: number, ctx?: MoneyContext | null): number {
  if (!Number.isFinite(displayAmount)) return 0
  return displayAmount / (ctx === undefined ? moneyScale() : moneyScaleFor(ctx))
}

/** An internal amount in display units (for prefilled money inputs and sliders). */
export function moneyToInput(n: number): number {
  return Number.isFinite(n) ? n * moneyScale() : 0
}

function joinMoney(sign: string, digits: string, m: ShownMoney): string {
  if (m.suffix) return `${sign}${digits} ${m.symbol}`
  return `${sign}${m.symbol}${m.space ? ' ' : ''}${digits}`
}

function decimalsOf(m: ShownMoney): number {
  return m.decimals ?? 2
}

/** Amounts this big (hyperinflation) are always written the compact way. */
const HUGE = 1e15

export function formatMoney(n: number): string {
  const m = showMoney(n)
  if (!Number.isFinite(m.amount)) return joinMoney('', '0', m)
  const a = Math.abs(m.amount)
  if (a >= HUGE) return compactMoney(m)
  const sign = m.amount < 0 ? '-' : ''
  // Converted small amounts keep their cents: a 1925 movie ticket was $0.35, not $0.
  if (m.converted && a < 10 && decimalsOf(m) > 0) {
    const cents = Math.round(a * 100)
    if (cents % 100 !== 0) return joinMoney(sign, (cents / 100).toFixed(2), m)
  }
  return joinMoney(sign, Math.abs(Math.round(m.amount)).toLocaleString('en-US'), m)
}

// Past a trillion only hyperinflations get here (Weimar 1923, Hungary 1946, Zimbabwe 2008), so
// the units are spelled out: '2.5 quadrillion ℳ' reads better than '2.5Qa ℳ'.
const BIG_UNITS: readonly [number, string][] = [
  [1e30, ' nonillion'],
  [1e27, ' octillion'],
  [1e24, ' septillion'],
  [1e21, ' sextillion'],
  [1e18, ' quintillion'],
  [1e15, ' quadrillion'],
  [1e12, 'T'],
  [1e9, 'B'],
  [1e6, 'M'],
]

function compactMoney(m: ShownMoney): string {
  const a = Math.abs(m.amount)
  const sign = m.amount < 0 ? '-' : ''
  if (a >= 1e33) {
    const k = a / 1e30
    return joinMoney(sign, `${k < 1e15 ? Math.round(k).toLocaleString('en-US') : k.toExponential(1).replace('e+', 'e')} nonillion`, m)
  }
  for (const [v, s] of BIG_UNITS) {
    if (a >= v) return joinMoney(sign, `${(a / v).toFixed(a >= v * 10 ? 0 : 1)}${s}`, m)
  }
  return joinMoney(sign, `${Math.round(a / 1e3)}K`, m)
}

/** Compact money: $1.2M, $45K (thousands, millions, billions, trillions, then quadrillions...). */
export function shortMoney(n: number): string {
  const m = showMoney(n)
  if (!Number.isFinite(m.amount)) return joinMoney('', '0', m)
  if (Math.abs(m.amount) >= 1e4) return compactMoney(m)
  return formatMoney(n)
}

// Narrow tiles keep the short units all the way up: '$16Qa' fits where '$16 quadrillion' doesn't.
const TINY_UNITS: readonly [number, string][] = [
  [1e30, 'No'],
  [1e27, 'Oc'],
  [1e24, 'Sp'],
  [1e21, 'Sx'],
  [1e18, 'Qi'],
  [1e15, 'Qa'],
  [1e12, 'T'],
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'K'],
]

/** The narrowest money text, for small tiles: '$45K', '$2.5M', '$16Qa' (shortMoney below 10,000). */
export function tinyMoney(n: number): string {
  const m = showMoney(n)
  if (!Number.isFinite(m.amount)) return joinMoney('', '0', m)
  const a = Math.abs(m.amount)
  if (a < 1e4) return formatMoney(n)
  const sign = m.amount < 0 ? '-' : ''
  if (a >= 1e33) return joinMoney(sign, a.toExponential(1).replace('e+', 'e'), m)
  for (const [v, s] of TINY_UNITS) {
    if (a >= v) return joinMoney(sign, `${(a / v).toFixed(a >= v * 10 ? 0 : 1)}${s}`, m)
  }
  return formatMoney(n)
}

// The ticks of one axis are written together: shortMoney gives a decimal under ten units and none from ten
// ('$5.0M' beside '$10M'), which is right for one number and wrong for a column of them.
const AXIS_UNITS: readonly [number, string][] = [
  [1e12, 'T'],
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'K'],
]

/** '5.0' -> '5', '2.50' -> '2.5', '12' stays. */
function noTrailingZeros(s: string): string {
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s
}

/** True when `x` is a whole number of tenths or hundredths, as far as `decimals` digits go (the converter leaves float dust). */
function exactAt(x: number, decimals: number): boolean {
  return Math.abs(x - Number(x.toFixed(decimals))) <= 1e-6 * Math.max(1, x)
}

/**
 * The labels of one money axis, in tick order, written together: the compact units of shortMoney ($5M, $10M, $2.5M), no
 * trailing '.0', and one decimal (two at most) only when some tick needs it to be what it says, so '$10.5M' never reads
 * '$11M' beside another '$11M'. An axis that stays under ten thousand writes the plain figures ($2,000, $4,000); from ten
 * thousand up every tick of a thousand or more is counted in K, M, B or T, so '$5,000' never sits beside '$10K'.
 */
export function axisMoney(ticks: readonly number[]): string[] {
  const ns = ticks.map((n) => (Number.isFinite(n) ? n : 0))
  const shown = ns.map((n) => showMoney(n))
  const amounts = shown.map((m) => (Number.isFinite(m.amount) ? Math.abs(m.amount) : 0))
  if (amounts.every((a) => a < 1e4)) return ns.map((n) => formatMoney(n))
  const unitOf = (a: number): number => AXIS_UNITS.findIndex(([v]) => a >= v)
  let decimals = 0
  amounts.forEach((a) => {
    const k = unitOf(a)
    if (a >= HUGE || k < 0) return
    while (decimals < 2 && !exactAt(a / AXIS_UNITS[k]![0], decimals)) decimals++
  })
  return shown.map((m, i) => {
    const a = amounts[i]!
    if (a >= HUGE) return compactMoney(m)
    let k = unitOf(a)
    if (k < 0) return formatMoney(ns[i]!)
    const sign = m.amount < 0 ? '-' : ''
    let text = noTrailingZeros((a / AXIS_UNITS[k]![0]).toFixed(decimals))
    // 999,999 rounds to '1000K' in thousands, so it moves up a unit and reads '1M'.
    while (Number(text) >= 1000 && k > 0) {
      k--
      text = noTrailingZeros((a / AXIS_UNITS[k]![0]).toFixed(decimals))
    }
    if (Number(text) >= 1000) return compactMoney(m)
    return joinMoney(sign, `${text}${AXIS_UNITS[k]![1]}`, m)
  })
}

/**
 * Money with the digits written by the caller, e.g. moneyWith(p, (a) => a.toFixed(2)) → '$8.17'.
 * `digits` gets the absolute display amount; the sign and the currency symbol are added here.
 * Currencies without cents (yen, won...) and converted amounts of 1,000 or more are written as
 * whole numbers instead.
 */
export function moneyWith(n: number, digits: (amount: number) => string): string {
  const m = showMoney(n)
  if (!Number.isFinite(m.amount)) return joinMoney('', '0', m)
  const a = Math.abs(m.amount)
  if (a >= HUGE) return compactMoney(m)
  if (m.converted && (a >= 1_000 || (decimalsOf(m) === 0 && a >= 1))) return formatMoney(n)
  return joinMoney(m.amount < 0 ? '-' : '', digits(a), m)
}

/** Unit prices with cents below 100: '$3.50', '€2.95', '¥480', and whole above: '$1,250'. */
export function formatCents(n: number): string {
  const m = showMoney(n)
  if (!Number.isFinite(m.amount)) return joinMoney('', '0', m)
  const a = Math.abs(m.amount)
  if (a >= 100 || decimalsOf(m) === 0) return formatMoney(n)
  return joinMoney(m.amount < 0 ? '-' : '', a.toFixed(2), m)
}

/** Share, fund and coin quotes: '$45,210', '$8.17', '$0.031', '$0.00042'. */
export function formatPrice(n: number): string {
  const m = showMoney(n)
  const a = m.amount
  if (!Number.isFinite(a) || a <= 0) return joinMoney('', '0', m)
  if (a >= 1_000) return formatMoney(n)
  if (a >= 1) return joinMoney('', decimalsOf(m) === 0 ? Math.round(a).toLocaleString('en-US') : a.toFixed(2), m)
  if (a >= 0.01) return joinMoney('', a.toFixed(3), m)
  return joinMoney('', a.toPrecision(2), m)
}

/** The currency money is shown in right now, for prose: 'Japanese yen (¥)'. */
export function moneyCurrencyLabel(): string {
  const m = showMoney(1)
  const name = m.name ?? (m.code === 'USD' ? 'US dollars' : m.code)
  return `${name} (${m.symbol})`
}

/** Cash + asset equity - debts. */
export function netWorth(g: GameState): number {
  const assets = g.assets.reduce((sum, a) => sum + a.value - (a.mortgage?.balance ?? 0), 0)
  const loans = g.character.loans.reduce((sum, l) => sum + l.balance, 0)
  return Math.round(g.character.money + assets - loans)
}

// ---------------------------------------------------------------------------
// Life log

/** Current (latest) log year, creating it if needed. */
export function currentLogYear(g: GameState) {
  let year = g.log[g.log.length - 1]
  if (!year || year.age !== g.character.age) {
    year = { age: g.character.age, year: g.year, entries: [] }
    g.log.push(year)
  }
  return year
}

// ---------------------------------------------------------------------------
// Where a line or popup came from (R3, E.D1)
//
// A yearly hook runs under its name (aging.ts), and every log line, notice and choice it makes is stamped with it as `s`. The
// store's year close (E.D2) reads `s` to group, fold and count what a year did. A line or popup made outside a hook (the player's own
// action) has no `s`, and a key that is not set is not written, so those are saved exactly as before.

/** A source name: lower case first letter, then letters, digits and dots; 1 to LOG_SOURCE_MAX characters. */
const LOG_SOURCE = /^[a-z][a-zA-Z0-9.]*$/
export const LOG_SOURCE_MAX = 24
/** The largest money figure a line may carry (`a`), so a damaged save cannot put a huge number on a card. */
export const LOG_AMOUNT_MAX = 1e15

export function validLogSource(s: unknown): s is string {
  return typeof s === 'string' && s.length >= 1 && s.length <= LOG_SOURCE_MAX && LOG_SOURCE.test(s)
}

/** A saved `a`: a whole, finite number with |a| at most 1e15. */
export function validLogAmount(a: unknown): a is number {
  return typeof a === 'number' && Number.isInteger(a) && Math.abs(a) <= LOG_AMOUNT_MAX
}

/** A saved `w`: 0, 1, 2 or 3. */
export function validLogWeight(w: unknown): w is LogWeight {
  return w === 0 || w === 1 || w === 2 || w === 3
}

/** The amount to write for `a`: rounded to a whole number, or undefined when it is not a finite number within the bound. */
function logAmount(a: unknown): number | undefined {
  if (typeof a !== 'number' || !Number.isFinite(a)) return undefined
  const whole = Math.round(a) + 0 // + 0 turns -0 into 0
  return validLogAmount(whole) ? whole : undefined
}

/** The source name of a yearly entry: its id without the `yearly.` the hooks of yearly-aging.ts carry. A module's own id stays whole. */
export function sourceOf(entryId: string): string {
  return entryId.startsWith('yearly.') ? entryId.slice('yearly.'.length) : entryId
}

let logSource: string | undefined

/** The source lines and popups made right now are stamped with, or undefined outside a hook. */
export function currentLogSource(): string | undefined {
  return logSource
}

/**
 * Run `fn` with `name` as the log source: the log lines, notices and choices it makes carry it as `s`. It restores the source it
 * found when `fn` returns or throws, and it nests. A name that is not a valid source (see validLogSource) means no source for the
 * length of `fn`, never a bad one. Synchronous, like withCtx in events/helpers.ts.
 */
export function withLogSource<T>(name: string, fn: () => T): T {
  const before = logSource
  logSource = validLogSource(name) ? name : undefined
  try {
    return fn()
  } finally {
    logSource = before
  }
}

/**
 * withLogSource for a yearly entry, plus one more thing: a few old hooks put their popup straight on g.queue and skip notice()
 * (the dividend, hedge fund and market-event notices). Such a notice or choice that `fn` added and that has no source yet gets
 * `name` too, so every popup a hook makes carries its source.
 */
export function withQueueSource<T>(g: GameState, name: string, fn: () => T): T {
  const before = new Set<unknown>(g.queue)
  const out = withLogSource(name, fn)
  if (validLogSource(name)) {
    for (const m of g.queue) if (!before.has(m) && (m.kind === 'notice' || m.kind === 'choice') && m.s === undefined) m.s = name
  }
  return out
}

/** What a caller may say about a log line beyond its text. */
export interface LogOptions {
  /** The money it is about, in dollars; rounded to a whole number, dropped when not finite or over 1e15. */
  a?: number
  /** How much it matters to the year, 0 to 3; anything else is dropped. */
  w?: LogWeight
}

/**
 * Add a first-person line to this year's life log, e.g. "I adopted a dog named Max."
 * `id` is for a line whose count depends on text (the flavor lines, R2-B2): it takes a text-side id (text/draw.ts textLineId), so
 * how many such lines print never moves g.nextId, which every later id and every hashed pick that reads an id depends on.
 * Inside a yearly hook the line is stamped with the hook's name (`s`). `opts` adds the amount and the weight (R3, E.D1); a key that
 * is not set is not written.
 */
export function log(g: GameState, text: string, tone: Tone = 'neutral', id?: string, opts?: LogOptions): void {
  const t = text.trim()
  if (!t) return
  const entry: LogEntry = { id: id ?? uid(g, 'l'), text: t, tone }
  if (logSource !== undefined) entry.s = logSource
  const a = logAmount(opts?.a)
  if (a !== undefined) entry.a = a
  if (validLogWeight(opts?.w)) entry.w = opts.w
  currentLogYear(g).entries.push(entry)
}

/** Remember a notable event (the profile's Memories list; kept short). */
export function remember(g: GameState, text: string): void {
  const t = text.trim()
  if (!t) return
  const mems = g.character.memories
  mems.push(`Age ${g.character.age}: ${t}`)
  if (mems.length > 60) mems.splice(0, mems.length - 60)
}

export function count(g: GameState, key: string, by = 1): void {
  if (!Number.isFinite(by)) return
  const current = g.counters[key]
  const next = (typeof current === 'number' && Number.isFinite(current) ? current : 0) + by
  if (Number.isFinite(next)) g.counters[key] = next
}

export function counter(g: GameState, key: string): number {
  const value = g.counters[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/**
 * Per-year usage limiter. Returns true and records a use if under `max` uses this year,
 * else false. Typical use: `if (!useYearAction(g, 'gym', 3)) return tooTired(g)`.
 */
export function useYearAction(g: GameState, key: string, max: number): boolean {
  if (!Number.isFinite(max) || max <= 0) return false
  const current = g.yearActions[key]
  const used = typeof current === 'number' && Number.isFinite(current) && current >= 0 ? Math.floor(current) : 0
  if (used >= max) return false
  g.yearActions[key] = used + 1
  return true
}

export function yearActionsUsed(g: GameState, key: string): number {
  const used = g.yearActions[key]
  return typeof used === 'number' && Number.isFinite(used) && used >= 0 ? Math.floor(used) : 0
}

// ---------------------------------------------------------------------------
// Modals

export interface NoticeOptions {
  emoji?: string
  tone?: Tone
  /** Show the real-world support line under the text (NoticeModal.support). */
  support?: boolean
  /** 'minor' lets the store route the notice to the Quiet Mode inbox (NoticeModal.weight). */
  weight?: 'minor'
  /** Where an inbox row leads (NoticeModal.link). */
  link?: string
  /** The money it is about (NoticeModal.a): rounded to a whole number, dropped when not finite or over 1e15. */
  a?: number
  /** How much it matters to the year (NoticeModal.w). Wins over the weight table for the title. */
  w?: LogWeight
}

/** Show a popup with an OK button. */
export function notice(g: GameState, title: string, text: string, opts: NoticeOptions = {}): void {
  // The support flag, weight and link are written only when set, so every other notice is saved exactly as before.
  // A title in the routine-news table (notice-weights.ts) is minor without every call site opting in.
  const weight = opts.weight ?? noticeWeightFor(title)
  // The source, amount and year weight (R3, E.D1) are written only when set, too. A title in NOTICE_WEIGHTS carries its weight unless the caller names one.
  const a = logAmount(opts.a)
  const w = validLogWeight(opts.w) ? opts.w : noticeWeightOf(title)
  g.queue.push({
    kind: 'notice',
    id: uid(g, 'm'),
    title,
    text,
    emoji: opts.emoji,
    tone: opts.tone,
    ...(opts.support ? { support: true } : {}),
    ...(weight === 'minor' ? { weight: 'minor' as const } : {}),
    ...(opts.link ? { link: opts.link } : {}),
    ...(logSource !== undefined ? { s: logSource } : {}),
    ...(a !== undefined ? { a } : {}),
    ...(w !== undefined ? { w } : {}),
  })
}

/** Show a popup with choices resolved by a registered script (see scripts.ts). */
export function scriptChoice(
  g: GameState,
  scriptId: string,
  title: string,
  text: string,
  choices: ChoiceOption[],
  opts: { emoji?: string; data?: Json; personId?: string } = {},
): void {
  g.queue.push({
    kind: 'choice',
    id: uid(g, 'm'),
    title,
    text,
    choices,
    source: 'script',
    scriptId,
    emoji: opts.emoji,
    data: opts.data,
    personId: opts.personId,
    ...(logSource !== undefined ? { s: logSource } : {}),
  })
}

export function scriptInput(g: GameState, modal: Omit<InputModal, 'kind' | 'id'>): void {
  g.queue.push({ kind: 'input', id: uid(g, 'm'), ...modal })
}

export function minigame(g: GameState, game: MinigameKind, title: string, scriptId: string, data: Json = {}): void {
  g.queue.push({ kind: 'minigame', id: uid(g, 'm'), game, title, scriptId, data })
}

/**
 * Queue a built-in task (this year's events, an interview, application screening, the obituary,
 * "Do Anything"). The store resolves it offline (src/game/offline.ts) as soon as it reaches the
 * head of the queue. The name and the 'aiTask' modal kind are historical: old saves use them.
 */
export function queueAi(g: GameState, task: AiTask): void {
  g.queue.push({ kind: 'aiTask', id: uid(g, 'm'), task })
}

// ---------------------------------------------------------------------------
// Character helpers

export function fullName(p: { firstName: string; lastName: string }): string {
  return `${p.firstName} ${p.lastName}`.trim()
}

export function lifeStage(age: number): LifeStage {
  if (age < 2) return 'baby'
  if (age < 5) return 'toddler'
  if (age < 13) return 'child'
  if (age < 18) return 'teen'
  if (age < 65) return 'adult'
  return 'elder'
}

export function isAdult(g: GameState): boolean {
  return g.character.age >= 18
}

export function inPrison(g: GameState): boolean {
  return g.character.prison !== null
}

export function inSchool(g: GameState): boolean {
  return g.character.education.current !== null
}

export function hasLicense(g: GameState, license: string): boolean {
  return g.character.licenses.includes(license)
}

export function pronouns(gender: Gender) {
  return gender === 'male'
    ? { he: 'he', him: 'him', his: 'his', He: 'He', His: 'His', man: 'man', boy: 'boy' }
    : { he: 'she', him: 'her', his: 'her', He: 'She', His: 'Her', man: 'woman', boy: 'girl' }
}

const SKIN_TONES = ['', '\u{1F3FB}', '\u{1F3FC}', '\u{1F3FD}', '\u{1F3FE}', '\u{1F3FF}']

/** Emoji avatar by gender, age and skin tone. */
export function avatarEmoji(gender: Gender, age: number, skinTone = 0, alive = true): string {
  if (!alive) return '\u{1FAA6}'
  const tone = SKIN_TONES[skinTone] ?? ''
  let base: string
  if (age < 2) base = '\u{1F476}'
  else if (age < 13) base = gender === 'male' ? '\u{1F466}' : '\u{1F467}'
  else if (age < 18) base = '\u{1F9D1}'
  else if (age < 65) base = gender === 'male' ? '\u{1F468}' : '\u{1F469}'
  else base = gender === 'male' ? '\u{1F474}' : '\u{1F475}'
  return base + tone
}

export function characterAvatar(c: Character): string {
  return avatarEmoji(c.gender, c.age, c.avatar.skinTone, c.alive)
}

/** What the header shows under the name: job title, school, "Retired", "Prisoner"... */
export function roleLabel(g: GameState): string {
  const c = g.character
  if (!c.alive) return 'Deceased'
  if (c.prison) return 'Prisoner'
  if (c.job) return c.job.title
  const cur = c.education.current
  if (cur) {
    if (cur.level === 'university' || cur.level === 'community') return 'University Student'
    if (cur.level === 'graduate') return 'Graduate Student'
    if (cur.level === 'preschool') return 'Preschooler'
    return 'Student'
  }
  if (c.partTimeJob) return c.partTimeJob.title
  if (c.retired) return 'Retired'
  if (c.age < 5) return lifeStage(c.age) === 'baby' ? 'Infant' : 'Toddler'
  if (c.age < 18) return 'Kid'
  return 'Unemployed'
}

/** End the main or part-time job, recording it in the career history. */
export function endJob(g: GameState, which: 'job' | 'partTimeJob', reason: CareerRecord['reason']): void {
  const c = g.character
  const job = c[which]
  if (!job) return
  const assetId = job.category === 'special' ? job.data?.assetId : undefined
  c.careerHistory.push({
    title: job.title,
    company: job.company,
    startAge: c.age - job.yearsAtCompany,
    endAge: c.age,
    reason,
    salary: job.salary,
    ...(typeof assetId === 'string' ? { assetId } : {}),
  })
  c[which] = null
  // Coworkers and boss from that job leave your contacts unless you befriended them.
  g.people = g.people.filter((p) => !(p.contextId === job.company && (p.relation === 'coworker' || p.relation === 'boss')))
}

// ---------------------------------------------------------------------------
// People

export function getPerson(g: GameState, id: string | undefined): Person | undefined {
  if (!id) return undefined
  return g.people.find((p) => p.id === id)
}

export function peopleBy(g: GameState, relations: RelationKind[], aliveOnly = true): Person[] {
  return g.people.filter((p) => relations.includes(p.relation) && (!aliveOnly || p.alive))
}

export function livingPeople(g: GameState): Person[] {
  return g.people.filter((p) => p.alive)
}

/** Current romantic partner (partner, fiance or spouse), if any. */
export function currentPartner(g: GameState): Person | undefined {
  return g.people.find((p) => p.alive && (p.relation === 'spouse' || p.relation === 'fiance' || p.relation === 'partner'))
}

export function spouse(g: GameState): Person | undefined {
  return g.people.find((p) => p.alive && p.relation === 'spouse')
}

export function children(g: GameState, aliveOnly = true): Person[] {
  return peopleBy(g, ['child', 'stepchild'], aliveOnly)
}

export function parents(g: GameState, aliveOnly = true): Person[] {
  return peopleBy(g, ['parent', 'stepparent'], aliveOnly)
}

export function removePerson(g: GameState, id: string): void {
  g.people = g.people.filter((p) => p.id !== id)
}

/** What a relative who became a Person is called: lower-case letters, spaces and hyphens, 20 characters at most (`niece`, `sister-in-law`; KIN.md). */
const KIN_WORD = /^[a-z][a-z -]{0,19}$/

/** The kin word of a friend, with its first letter capitalized ("niece" reads "Niece"), or undefined for no word and for a value that is not one (R4-U9, X38). */
function kinWord(p: Person): string | undefined {
  const data: unknown = p.data
  const kin = typeof data === 'object' && data !== null ? (data as Record<string, unknown>).kin : undefined
  return typeof kin === 'string' && KIN_WORD.test(kin) ? kin.charAt(0).toUpperCase() + kin.slice(1) : undefined
}

/** Human label for a relation: "Mother", "Boyfriend", "Best Friend", "Dog"... A friend with a kin word reads as it ("Niece", "Sister-in-law"). */
export function relationLabel(p: Person): string {
  const m = p.gender === 'male'
  switch (p.relation) {
    case 'parent':
      return m ? 'Father' : 'Mother'
    case 'stepparent':
      return m ? 'Stepfather' : 'Stepmother'
    case 'sibling':
      return m ? 'Brother' : 'Sister'
    case 'halfSibling':
      return m ? 'Half Brother' : 'Half Sister'
    case 'stepsibling':
      return m ? 'Stepbrother' : 'Stepsister'
    case 'grandparent':
      return m ? 'Grandfather' : 'Grandmother'
    case 'child':
      return m ? 'Son' : 'Daughter'
    case 'stepchild':
      return m ? 'Stepson' : 'Stepdaughter'
    case 'grandchild':
      return m ? 'Grandson' : 'Granddaughter'
    case 'friend':
      return kinWord(p) ?? 'Friend'
    case 'bestFriend':
      return 'Best Friend'
    case 'enemy':
      return 'Enemy'
    case 'classmate':
      return 'Classmate'
    case 'teacher':
      return 'Teacher'
    case 'coworker':
      return 'Coworker'
    case 'boss':
      return 'Boss'
    case 'partner':
      return m ? 'Boyfriend' : 'Girlfriend'
    case 'fiance':
      return m ? 'Fiancé' : 'Fiancée'
    case 'spouse':
      return m ? 'Husband' : 'Wife'
    case 'ex':
      return m ? 'Ex-Boyfriend' : 'Ex-Girlfriend'
    case 'exSpouse':
      return m ? 'Ex-Husband' : 'Ex-Wife'
    case 'lover':
      return 'Lover'
    case 'cellmate':
      return 'Cellmate'
    case 'pet':
      return p.species ?? 'Pet'
  }
}

export function personAvatar(p: Person): string {
  if (!p.alive) return '\u{1FAA6}'
  if (p.relation === 'pet') return petEmoji(p.species)
  return avatarEmoji(p.gender, p.age, (p.data.skinTone as number | undefined) ?? 0)
}

export function petEmoji(species: string | undefined): string {
  const map: Record<string, string> = {
    Dog: '\u{1F415}',
    Cat: '\u{1F408}',
    Horse: '\u{1F40E}',
    Rabbit: '\u{1F407}',
    Hamster: '\u{1F439}',
    Parrot: '\u{1F99C}',
    Bird: '\u{1F426}',
    Fish: '\u{1F420}',
    Snake: '\u{1F40D}',
    Lizard: '\u{1F98E}',
    Turtle: '\u{1F422}',
    Pig: '\u{1F416}',
    Goat: '\u{1F410}',
    Ferret: '\u{1F9A6}',
    Monkey: '\u{1F412}',
    Tiger: '\u{1F405}',
    Fox: '\u{1F98A}',
  }
  return (species && map[species]) || '\u{1F43E}'
}

/** Is the player romantically compatible with this gender? */
export function attractedTo(c: Character, gender: Gender): boolean {
  if (c.sexuality === 'bisexual') return true
  if (c.sexuality === 'gay') return c.gender === gender
  return c.gender !== gender
}

/** Gender the player is attracted to (random for bisexual players). */
export function preferredGender(g: GameState): Gender {
  const c = g.character
  if (c.sexuality === 'bisexual') return chance(g, 0.5) ? 'male' : 'female'
  if (c.sexuality === 'gay') return c.gender
  return c.gender === 'male' ? 'female' : 'male'
}

/** "a" / "an" for a word. */
export function article(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a'
}

/**
 * A named thing (an injury, a crime, a rank) mid-sentence with the article English wants: 'a
 * broken ankle', 'an assault', 'a torn ACL', 'an orange belt'; plurals and mass nouns go bare
 * ('shin splints', 'bruised ribs', 'road rash', 'knee tendinitis'). Acronyms keep their capitals.
 */
export function aThing(name: string): string {
  const words = name.trim().split(/\s+/)
  const text = words.map((w) => (/^[A-Z0-9]{2,}$/.test(w) || w === 'Achilles' ? w : w.toLowerCase())).join(' ')
  const last = words[words.length - 1] ?? ''
  const bare = /(itis|rash|everything)$/i.test(last) || (/[^su]s$/i.test(last) && last !== 'Achilles')
  return bare ? text : `${article(text)} ${text}`
}

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export function zodiacFor(month: number, day: number): string {
  const signs: [string, number, number][] = [
    ['Capricorn', 1, 19],
    ['Aquarius', 2, 18],
    ['Pisces', 3, 20],
    ['Aries', 4, 19],
    ['Taurus', 5, 20],
    ['Gemini', 6, 20],
    ['Cancer', 7, 22],
    ['Leo', 8, 22],
    ['Virgo', 9, 22],
    ['Libra', 10, 22],
    ['Scorpio', 11, 21],
    ['Sagittarius', 12, 21],
  ]
  for (const [sign, m, d] of signs) {
    if (month === m && day <= d) return sign
  }
  const next = signs[month % 12]
  return next[0]
}
