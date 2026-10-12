// Franchising for consumer-facing classic companies (cafés, restaurants, gyms, salons, shops...):
// independent franchisees put up the money for new outlets under the company's brand. The company
// earns an upfront fee (net of the training and opening support it gives) and a yearly royalty
// on the franchisees' modeled sales. Both are booked once, through b.cash and b.yearIncome, so the
// yearly simulation counts them in profit (and the valuation) without moving the cash twice.
//
// The limits are the brand, the quality franchisees can copy, and the home market's room: each
// unit sells less as the network nears saturation, and a sloppy network (low quality, a weak
// brand, growing too fast) gets franchisee scandals that hurt the brand.
//
// State: BizState.franchise (plain JSON; readFranchise normalizes anything, old saves have none).
import { formatMoney, log, notice, scriptChoice } from '../core'
import { chance, pick } from '../rng'
import { defineScript } from '../scripts'
import { hasTalent, talentHint } from '../talents'
import type { Asset, ChoiceOption, GameState, Json, MenuAction, MenuGroup, MenuNode } from '../types'
import { getCountry } from '../world'
import { boardAllows } from './board'
import { capexCaption } from './board-menu'
import { bizWorth, fxValue, LASTING_YEARS, localEcon, maxProduction, niceAmount, planFor, refreshValue, startupCost, valuationOf, type Worth } from './economy'
import { manageBlock, noCash } from './gate'
import { industryDef } from './industries'
import { bizOf, findBusiness, readBiz, runsIt, totalOutlets, type BizState } from './state'
import { clampN, markBest, money, plural, rec } from './util'
import { readFranchise, type FranchiseLedger, type FranchiseState } from './franchise-state'

export { franchiseFeesFor, franchiseIncomeFor, franchiseUnits, readFranchise, type FranchiseLedger, type FranchiseState } from './franchise-state'

/** Industries whose customers walk into a branded outlet: the classic franchise trades. */
export const FRANCHISE_INDUSTRIES: readonly string[] = [
  'foodTruck', 'restaurant', 'cafe', 'bakery', 'bar', 'grocery', 'fashion', 'beauty', 'salon', 'gym',
  'autoShop', 'realEstate', 'hotel', 'education', 'petCare', 'homeCare', 'travel',
]

/** Royalty on franchisee sales, and the share of those sales the company spends supporting them. */
export const ROYALTY = 0.06
export const SUPPORT = 0.01
/** Share of the upfront fee spent on training and opening support (booked net). */
export const ONBOARDING = 0.3
/** Franchisees run a little below the company's own outlets on average. */
const FRANCHISEE_SALES = 0.9
/** Most of the home market's outlet room one brand's network (own + franchised) may take. */
const ROOM_SHARE = 0.8
/** Gates to start franchising: proven, profitable and known. */
export const MIN_YEARS = 2
export const MIN_BRAND = 30
export const MIN_QUALITY = 40
/** Years a franchise unit's royalties are counted for in the Business talent's what-ifs. */
const UNIT_YEARS = LASTING_YEARS

export function isFranchiseIndustry(industry: string): boolean {
  return FRANCHISE_INDUSTRIES.includes(industry)
}

function save(b: BizState, st: FranchiseState): void {
  b.franchise = { ...st, ledger: st.ledger.slice(-4).map((x) => ({ ...x })) } as unknown as Json
}

function ledgerOf(st: FranchiseState, year: number): FranchiseLedger {
  let row = st.ledger.find((x) => x.year === year)
  if (!row) {
    row = { year, fees: 0, royalty: 0 }
    st.ledger.push(row)
    st.ledger.sort((x, y) => x.year - y.year)
  }
  return row
}

// ---------------------------------------------------------------------------
// The economics (pure; the menus, the hints and the yearly booking share them)

/** Own outlets in the home market plus franchised ones: what fills the home market's room. */
export function networkSize(b: BizState): number {
  const own = b.outlets.filter((o) => o.countryId === b.countryId).reduce((s, o) => s + o.count, 0)
  return own + readFranchise(b).units
}

/** Outlets the home market supports for one brand (own + franchised). */
export function networkRoom(b: BizState): number {
  const e = localEcon(b.industry, b.countryId, b.city)
  return Math.max(2, Math.floor(e.saturation * ROOM_SHARE))
}

/** How much a crowded network eats into each unit's sales (1: plenty of room). */
export function saturationFactor(network: number, room: number): number {
  return 1 / (1 + Math.pow(Math.max(0, network) / Math.max(1, room / ROOM_SHARE), 1.5))
}

/** The company's own recent net sales per outlet (sales tax taken out), averaged over up to 3 years. */
function ownSalesPerOutlet(b: BizState): number {
  const e = localEcon(b.industry, b.countryId, b.city)
  const h = b.history.slice(-3).filter((r) => r.revenue > 0)
  if (!h.length) return 0
  const avg = h.reduce((t, r) => t + r.revenue / Math.max(1, r.outlets), 0) / h.length
  return Math.max(0, avg / (1 + e.taxRate))
}

/** Modeled yearly sales of one franchised outlet with a network of `network` outlets. */
export function unitSales(b: BizState, network = networkSize(b)): number {
  // One franchised outlet can't sell more than one site's capacity (capacity lines stay at home).
  const e = localEcon(b.industry, b.countryId, b.city)
  const site = (e.capacity * e.goingPrice) / (1 + e.taxRate)
  return Math.min(ownSalesPerOutlet(b), site) * FRANCHISEE_SALES * saturationFactor(network, networkRoom(b))
}

/** Net royalty one franchised outlet pays a year (royalty minus the support it gets). */
export function unitRoyalty(b: BizState, network = networkSize(b)): number {
  return unitSales(b, network) * (ROYALTY - SUPPORT)
}

/** The upfront fee a franchisee pays (gross), set by the outlet's cost and the brand. */
export function franchiseFee(b: BizState): number {
  const e = localEcon(b.industry, b.countryId, b.city)
  const fee = e.capital * 0.08 * (0.7 + b.brand / 150)
  return niceAmount(clampN(fee, 1_500 * e.level, 120_000 * Math.max(0.3, e.level)))
}

/** What the company keeps of the fee after training and opening support. */
export function netFee(b: BizState): number {
  return Math.round(franchiseFee(b) * (1 - ONBOARDING))
}

/** Why this company can't sell franchises now (null: it can). Pure. */
export function franchiseBlock(b: BizState): string | null {
  if (!isFranchiseIndustry(b.industry)) return `${industryDef(b.industry).label}s don't franchise.`
  const booked = b.history.length
  if (booked < MIN_YEARS) return `Franchisees buy proven concepts: show ${MIN_YEARS} years of results first.`
  if (!b.last || b.last.net <= 0) return 'Franchisees buy proven concepts: you need a profitable year first.'
  if (b.brand < MIN_BRAND) return `Nobody wants to buy an unknown brand: brand ${b.brand}% (needs ${MIN_BRAND}%).`
  if (b.quality < MIN_QUALITY) return `Franchisees can't copy a concept this shaky: quality ${b.quality}% (needs ${MIN_QUALITY}%).`
  if (ownSalesPerOutlet(b) <= 0) return 'No sales record for franchisees to copy yet.'
  return null
}

/** 0-1.5: how keen would-be franchisees are (brand and quality). */
export function franchiseInterest(b: BizState): number {
  return clampN((b.brand - 20) / 60, 0, 1.3) * clampN((b.quality - 30) / 50, 0, 1.2)
}

/** Franchises sold this calendar year so far. */
export function soldThisYear(g: GameState, b: BizState): number {
  const st = readFranchise(b)
  return st.addedYear === g.year ? st.added : 0
}

/** How many franchises would-be franchisees will still buy this year (0 when blocked). */
export function maxSellable(g: GameState, b: BizState): number {
  if (franchiseBlock(b)) return 0
  const network = networkSize(b)
  const sold = soldThisYear(g, b)
  // Once the concept qualifies there is always someone keen; a strong brand draws crowds. The
  // crowd is set by the network the year started with: this year's own sales don't draw more
  // buyers this year (or selling one at a time would beat selling them all at once).
  const prospects = 1 + Math.floor(franchiseInterest(b) * (4 + 0.3 * Math.max(0, network - sold)))
  const room = Math.max(0, networkRoom(b) - network)
  return Math.max(0, Math.min(room, prospects - sold))
}

/**
 * Yearly chance a franchisee scandal breaks: likelier with low quality and a weak brand, and when
 * the network grows faster than the company can train people. 0 with fewer than one unit.
 */
export function scandalP(b: BizState, units: number, recent: number): number {
  if (units <= 0) return 0
  const growth = Math.max(0, recent) / Math.max(1, units)
  const p = 0.02 + Math.max(0, 55 - b.quality) / 90 + Math.max(0, 40 - b.brand) / 150 + growth * 0.15
  return clampN(p, 0, 0.45) * Math.min(1, units / 4)
}

/** Share of franchisees that give up each year (weak brands and crowded markets lose more). */
export function closeRate(b: BizState, network = networkSize(b)): number {
  const crowd = Math.max(0, network / Math.max(1, networkRoom(b)) - 0.8)
  return clampN(0.02 + Math.max(0, 50 - b.quality) / 600 + Math.max(0, 40 - b.brand) / 600 + crowd * 0.2, 0.01, 0.3)
}

/** Brand cost of one scandal, in brand points (the popup's middle road). */
const SCANDAL_BRAND = 4

export interface FranchiseQuote {
  n: number
  /** Net fees booked now. */
  fees: number
  /** Net royalties a year from all units once they trade a full year. */
  royaltyYear: number
  /** The same for just the new units (at the bigger network). */
  royaltyAdded: number
  /** Network and room after the sale. */
  network: number
  room: number
  /** Yearly scandal odds after the sale. */
  scandal: number
}

/** What selling `n` franchises now brings (pure; the slider preview, the hint and the sale share it). */
export function franchiseQuote(g: GameState, b: BizState, n: number): FranchiseQuote {
  const st = readFranchise(b)
  const k = Math.max(0, Math.round(n))
  const network = networkSize(b) + k
  const per = unitRoyalty(b, network)
  return {
    n: k,
    fees: netFee(b) * k,
    royaltyYear: (st.units + k) * per,
    royaltyAdded: k * per,
    network,
    room: networkRoom(b),
    scandal: scandalP(b, st.units + k, soldThisYear(g, b) + k),
  }
}

/**
 * The Business talent's value of selling `n` franchises: the fees now, the new units' royalties for
 * a few years, what the bigger network does to the old units' royalties, minus the extra scandal
 * risk priced at the brand it costs. The same functions the sale and the yearly booking use.
 */
export function franchiseValue(g: GameState, b: BizState, n: number, w: Worth = bizWorth(g, b)): number {
  if (n <= 0) return 0
  const st = readFranchise(b)
  const before = franchiseQuote(g, b, 0)
  const after = franchiseQuote(g, b, n)
  const oldUnits = st.units * (unitRoyalty(b, after.network) - unitRoyalty(b, before.network))
  const risk = (after.scandal - before.scandal) * UNIT_YEARS * -fxValue(g, b, w, { brand: -SCANDAL_BRAND })
  const v = after.fees + (after.royaltyAdded + oldUnits) * UNIT_YEARS - risk
  return Number.isFinite(v) ? v : 0
}

/** The number to sell this year with the best value (null: none pays). Pure, no RNG. */
export function bestFranchiseCount(g: GameState, b: BizState): { n: number; value: number } | null {
  const max = maxSellable(g, b)
  if (max <= 0) return null
  const w = bizWorth(g, b)
  const tries = [...new Set([1, 2, 3, 5, 8, 12, 20, 30, 50, 80, 120, 200, 300, 500, max].filter((x) => x >= 1 && x <= max))]
  let best: { n: number; value: number } | null = null
  for (const n of tries) {
    const value = franchiseValue(g, b, n, w)
    if (value > 0 && (!best || value > best.value)) best = { n, value }
  }
  return best
}

/** The home cities a bought-back outlet can land in (buyBackFranchises spreads them over these). */
function buyBackCities(b: BizState): string[] {
  const cities = getCountry(b.countryId).cities.slice(0, 10)
  return cities.length ? cities : [b.city]
}

/**
 * What buying one franchised outlet back costs: the franchisee's fit-out at what opening one costs
 * (in the dearest city it could land in), the fee they paid, and a couple of years of their profit.
 * So buying back is never a cheaper way to open an outlet than opening it yourself, and selling a
 * franchise only to buy it back always loses money. Rounded up, never down.
 */
export function buyBackPrice(b: BizState): number {
  const fitOut = Math.max(...buyBackCities(b).map((city) => startupCost(b.industry, b.countryId, city).capital))
  const n = fitOut + franchiseFee(b) + unitSales(b) * 0.1 * 2.5
  if (!Number.isFinite(n) || n <= 0) return 0
  const mag = Math.pow(10, Math.max(0, Math.floor(Math.log10(n)) - 1))
  return Math.ceil(n / mag) * mag
}

// ---------------------------------------------------------------------------
// Actions (they re-check everything; menus only read)

/**
 * Sell `n` franchises at the going fee (or `feeOverride` gross per unit, from a pitch). Books the
 * net fees once (cash and yearIncome). Returns how many were sold.
 */
export function sellFranchises(g: GameState, a: Asset, b: BizState, n: number, feeOverride?: number): number {
  const k = Math.min(Math.max(0, Math.round(n)), maxSellable(g, b))
  if (k <= 0) return 0
  const st = readFranchise(b)
  const gross = feeOverride !== undefined && feeOverride > 0 ? Math.round(feeOverride) : franchiseFee(b)
  const net = Math.round(gross * (1 - ONBOARDING)) * k
  if (st.addedYear !== g.year) {
    st.added = 0
    st.addedYear = g.year
  }
  st.added += k
  st.units += k
  if (!st.since) st.since = g.year
  st.lifetime += net
  ledgerOf(st, g.year).fees += net
  save(b, st)
  b.cash += net
  b.yearIncome += net
  b.valuation = valuationOf(b)
  refreshValue(a, b)
  return k
}

/** Buy back `n` franchised outlets: they become company outlets spread over the home market's cities. */
export function buyBackFranchises(g: GameState, a: Asset, b: BizState, n: number): number {
  const st = readFranchise(b)
  const k = Math.min(Math.max(0, Math.round(n)), st.units)
  if (k <= 0) return 0
  const cost = buyBackPrice(b) * k
  if (b.cash < cost) return 0
  // Buying outlets is capital spending (like opening them), not an expense of the year.
  b.cash -= cost
  // `added` stays: the franchises sold this year still count against this year's buyers (buying
  // them back must not make room to sell the same slots again).
  st.units -= k
  save(b, st)
  const cities = buyBackCities(b)
  const here = (city: string) => b.outlets.find((o) => o.countryId === b.countryId && o.city === city)?.count ?? 0
  for (let i = 0; i < k; i++) {
    const city = [...cities].sort((x, y) => here(x) - here(y) || cities.indexOf(x) - cities.indexOf(y))[0] ?? b.city
    const o = b.outlets.find((x) => x.countryId === b.countryId && x.city === city)
    if (o) o.count += 1
    else b.outlets.push({ countryId: b.countryId, city, count: 1, opened: g.year })
  }
  b.production = Math.min(maxProduction(g, b), Math.round(b.production + planFor(g, b, g.year, { calm: true }).demand * (k / Math.max(1, totalOutlets(b)))))
  b.valuation = valuationOf(b)
  refreshValue(a, b)
  return k
}

// ---------------------------------------------------------------------------
// The year: royalties, churn, reach and scandals (yearly.ts, before the fiscal year is simulated)

/**
 * Book one fiscal year of royalties for this company (once per fiscal year), let some franchisees
 * close, and maybe break a franchisee scandal. Called before the year is simulated, so the net
 * royalties land in that year's statement through yearIncome (cash moves once, here).
 */
export function bookFranchiseYear(g: GameState, a: Asset, b: BizState, fiscal: number): void {
  if (!b.franchise) return
  const st = readFranchise(b)
  if (st.units <= 0 || st.booked >= fiscal) {
    if (st.booked < fiscal) {
      st.booked = fiscal
      save(b, st)
    }
    return
  }
  const fresh = st.addedYear === fiscal ? Math.min(st.added, st.units) : 0
  const trading = st.units - fresh * 0.5
  const royalty = Math.max(0, Math.round(trading * unitRoyalty(b)))
  st.booked = fiscal
  if (royalty > 0) {
    b.cash += royalty
    b.yearIncome += royalty
    st.lifetime += royalty
    ledgerOf(st, fiscal).royalty += royalty
  }
  // Some franchisees give up every year (exactly: fractions carry over, no dice).
  const leaving = st.units * closeRate(b) + st.carry
  const closed = Math.min(st.units, Math.floor(leaving))
  st.carry = clampN(leaving - closed, 0, 0.999)
  st.units -= closed
  // A big network is free advertising.
  b.brand = clampN(b.brand + Math.round(Math.min(2, Math.log10(1 + st.units) * 0.6)), 0, 100)
  const p = scandalP(b, st.units, fresh)
  // At most one scandal a year, and never two years running.
  const scandal = st.units > 0 && st.lastScandal < fiscal - 1 && chance(g, p)
  if (scandal) {
    st.lastScandal = fiscal
    st.scandals += 1
  }
  save(b, st)
  if (closed > 0) log(g, `${plural(closed, 'franchisee')} of ${a.name} closed up shop.`, 'neutral')
  if (scandal) presentScandal(g, a, b)
}

// ---------------------------------------------------------------------------
// Franchisee scandal

const SCANDAL_WHAT: Record<string, string[]> = {
  food: ['was caught serving food weeks past its date', 'was filmed swapping your recipe for something much cheaper', 'failed a health inspection in spectacular fashion'],
  default: ['was caught overcharging customers', 'treated a customer so rudely it made the papers', 'was running a shabby, half-broken copy of your outlets'],
}

/** A deny that the press sees through. */
const DENY_EXPOSED = 0.35

function retrainCost(b: BizState): number {
  const st = readFranchise(b)
  return Math.round(Math.max(netFee(b) * 0.5, franchiseFee(b) * 0.04 * st.units))
}

function scandalBranches(b: BizState): Record<string, { p: number; fx: { cash?: number; brand?: number; demandTo?: number; value?: number } }[]> {
  return {
    cut: [{ p: 1, fx: { brand: -2, value: -unitRoyalty(b) * UNIT_YEARS } }],
    fix: [{ p: 1, fx: { cash: -retrainCost(b), brand: -1 } }],
    deny: [
      { p: 1, fx: { brand: -SCANDAL_BRAND } },
      { p: DENY_EXPOSED, fx: { brand: -6, demandTo: 0.95 } },
    ],
  }
}

const SCANDAL = defineScript('business.franchise.scandal', (g, choice, data) => {
  const a = findBusiness(g, typeof rec(data)?.assetId === 'string' ? (rec(data)!.assetId as string) : '')
  if (!a) return
  resolveScandal(g, a, bizOf(g, a), choice, true)
})

function resolveScandal(g: GameState, a: Asset, b: BizState, choice: string, tell: boolean): void {
  const st = readFranchise(b)
  if (choice === 'cut') {
    if (st.units > 0) st.units -= 1
    save(b, st)
    b.brand = clampN(b.brand - 2, 0, 100)
    log(g, `${a.name} terminated a franchisee after a scandal.`, 'neutral')
    if (tell) notice(g, 'Contract Terminated', `You pulled the franchise and had the sign taken down by Friday. The story died with it. ${a.name} now has ${plural(st.units, 'franchised outlet')}.`, { emoji: '\u{2702}\u{FE0F}' })
    return
  }
  if (choice === 'fix') {
    const cost = retrainCost(b)
    b.cash -= cost
    b.yearCosts += cost
    b.brand = clampN(b.brand - 1, 0, 100)
    log(g, `${a.name} retrained its franchisees after a scandal.`, 'neutral')
    if (tell) notice(g, 'Back to Training', `You sent inspectors to every franchisee and put the whole network through retraining (${formatMoney(cost)}). A public apology and a fresh start: the damage stayed small.`, { emoji: '\u{1F393}' })
    return
  }
  b.brand = clampN(b.brand - SCANDAL_BRAND, 0, 100)
  if (chance(g, DENY_EXPOSED)) {
    b.brand = clampN(b.brand - 6, 0, 100)
    b.demandShock = Math.min(b.demandShock, 0.95)
    log(g, `A franchisee scandal at ${a.name} got worse when we denied it.`, 'bad')
    if (tell) notice(g, 'It Got Worse', `Reporters found two more franchisees doing the same thing. "Isolated incident" is now a running joke, and customers are staying away. Brand down to ${b.brand}%.`, { emoji: '\u{1F4F0}', tone: 'bad' })
    return
  }
  if (tell) notice(g, 'Blew Over', `You called it an isolated incident and the story faded, mostly. Brand down to ${b.brand}%.`, { emoji: '\u{1F937}' })
}

function presentScandal(g: GameState, a: Asset, b: BizState): void {
  const def = industryDef(b.industry)
  const city = pick(g, getCountry(b.countryId).cities.slice(0, 10).filter((c) => c !== b.city).concat(b.city))
  const what = pick(g, def.food ? SCANDAL_WHAT.food : SCANDAL_WHAT.default)
  // A hired CEO (or the board while you're away) deals with it without asking.
  if (!runsIt(g, a) || g.character.prison) {
    const choice = b.cash >= retrainCost(b) ? 'fix' : 'cut'
    resolveScandal(g, a, b, choice, false)
    return
  }
  const choices: ChoiceOption[] = [
    { id: 'cut', label: 'Terminate their franchise', emoji: '\u{2702}\u{FE0F}' },
    { id: 'fix', label: `Retrain the whole network (${money(retrainCost(b))})`, emoji: '\u{1F393}' },
    { id: 'deny', label: 'Call it an isolated incident', emoji: '\u{1F937}' },
  ]
  if (hasTalent(g, 'Business')) {
    const w = bizWorth(g, b)
    const table = scandalBranches(b)
    markBest(g, choices, (id) => (table[id] ? table[id].reduce((t, x) => t + x.p * fxValue(g, b, w, x.fx), 0) : null), (id) =>
      id === 'deny' ? `Best move by the numbers: about ${Math.round((1 - DENY_EXPOSED) * 100)}% chance it blows over` : undefined,
    )
  }
  scriptChoice(g, SCANDAL, 'Franchisee Scandal', `The ${a.name} franchisee in ${city} ${what}. Customers don't know who owns which outlet: to them it's all ${a.name}.`, choices, {
    emoji: '\u{1F4F0}',
    data: { assetId: a.id },
  })
}

/** For tests: the scandal popup and its resolver. */
export const franchiseInternals = { presentScandal, resolveScandal, retrainCost, scandalBranches, DENY_EXPOSED }

// ---------------------------------------------------------------------------
// The Franchising menu

function hinting(g: GameState, a: Asset): boolean {
  return hasTalent(g, 'Business') && !manageBlock(g, a)
}

function live(g: GameState, a: Asset): Asset {
  return findBusiness(g, a.id) ?? a
}

function sellAction(a: Asset, b0: BizState, g0: GameState): MenuAction {
  const def = industryDef(b0.industry)
  const max = Math.max(1, maxSellable(g0, b0))
  return {
    type: 'action',
    id: `biz.franchise.sell.${a.id}`,
    label: 'Sell Franchises',
    emoji: '\u{270D}\u{FE0F}',
    subtitle: (g) => {
      const b = readBiz(g, live(g, a))
      const m = maxSellable(g, b)
      return m > 0 ? `${money(franchiseFee(b))} fee each · up to ${plural(m, 'buyer')} this year` : (franchiseBlock(b) ?? 'No more buyers this year')
    },
    hint: (g) => {
      const cur = live(g, a)
      if (!hinting(g, cur)) return null
      const best = bestFranchiseCount(g, readBiz(g, cur))
      return best ? talentHint(g, 'Business', `Best this year: sell about ${best.n} (worth about ${money(best.value)} over the next few years, scandal risk included)`) : null
    },
    disabledReason: (g) => {
      const cur = live(g, a)
      const block = manageBlock(g, cur)
      if (block) return block
      const b = readBiz(g, cur)
      return franchiseBlock(b) ?? (maxSellable(g, b) < 1 ? (networkSize(b) >= networkRoom(b) ? `${getCountry(b.countryId).name} has no room for more ${def.sitePlural}.` : 'No more would-be franchisees this year. A better brand brings more.') : null)
    },
    input: {
      kind: 'slider',
      label: `How many franchises to sell this year?`,
      min: 1,
      max,
      defaultValue: () => '1',
      preview: (g, v) => {
        const b = readBiz(g, live(g, a))
        const q = franchiseQuote(g, b, Math.max(1, Math.round(v)))
        return `${money(q.fees)} in fees now (after training) · about ${money(q.royaltyAdded)} a year in royalties · network ${q.network}/${q.room} · scandal risk ${Math.round(q.scandal * 100)}% a year`
      },
    },
    run: (g, input) => {
      const cur = findBusiness(g, a.id)
      if (!cur || manageBlock(g, cur)) return
      const b = bizOf(g, cur)
      if (franchiseBlock(b)) return
      const k = sellFranchises(g, cur, b, Math.round(Number(input) || 1))
      if (k <= 0) return
      const st = readFranchise(b)
      log(g, `${cur.name} sold ${plural(k, 'franchise')}.`, 'good')
      notice(g, 'Franchises Sold', `${plural(k, 'new franchisee')} signed up to open ${k === 1 ? `a ${cur.name}` : `${cur.name} ${def.sitePlural}`} with their own money. After training and opening support you keep ${formatMoney(netFee(b) * k)} in fees, plus ${Math.round(ROYALTY * 100)}% of their sales every year. Network: ${plural(st.units, 'franchised outlet')}.`, { emoji: '\u{1F91D}', tone: 'good' })
    },
  }
}

function buyBackAction(a: Asset, b0: BizState): MenuAction {
  const st0 = readFranchise(b0)
  const price0 = buyBackPrice(b0)
  const max = Math.max(1, Math.min(st0.units, price0 > 0 ? Math.floor(Math.max(0, b0.cash) / price0) : 0))
  return {
    type: 'action',
    id: `biz.franchise.buyBack.${a.id}`,
    label: 'Buy Back Franchises',
    emoji: '\u{1F504}',
    subtitle: (g) => `${money(buyBackPrice(readBiz(g, live(g, a))))} each · they become your own outlets`,
    disabledReason: (g) => {
      const cur = live(g, a)
      const block = manageBlock(g, cur)
      if (block) return block
      const b = readBiz(g, cur)
      if (readFranchise(b).units < 1) return 'You have no franchised outlets.'
      return b.cash < buyBackPrice(b) ? `Not enough company cash: buying one back costs ${money(buyBackPrice(b))}.` : null
    },
    input: {
      kind: 'slider',
      label: 'How many to buy back?',
      min: 1,
      max,
      defaultValue: () => '1',
      preview: (g, v) => {
        const cur = live(g, a)
        const b = readBiz(g, cur)
        const k = Math.max(1, Math.round(v))
        const cost = buyBackPrice(b) * k
        return `${money(cost)} from company cash · loses about ${money(unitRoyalty(b) * k)} a year in royalties · you keep their whole profit instead${capexCaption(g, cur, b, cost, 0)}`
      },
    },
    run: (g, input) => {
      const cur = findBusiness(g, a.id)
      if (!cur || manageBlock(g, cur)) return
      const b = bizOf(g, cur)
      const st = readFranchise(b)
      const k = Math.min(st.units, Math.max(1, Math.round(Number(input) || 1)))
      const cost = buyBackPrice(b) * k
      if (b.cash < cost) return noCash(g, cur, cost, `buying back ${plural(k, 'franchise')}`)
      if (!boardAllows(g, cur, b, { kind: 'capex', by: 'owner', amount: cost, gain: 0, label: `Buy back ${plural(k, 'franchised outlet')} for ${money(cost)}` })) return
      const done = buyBackFranchises(g, cur, b, k)
      if (done <= 0) return
      const def = industryDef(b.industry)
      log(g, `${cur.name} bought back ${plural(done, 'franchised outlet')}.`, 'neutral')
      notice(g, 'Bought Back', `${cur.name} bought out ${plural(done, 'franchisee')} for ${formatMoney(cost)}. They are company ${def.sitePlural} now: you keep their whole profit and pay their costs.`, { emoji: '\u{1F504}' })
    },
  }
}

/** Franchising (consumer-facing classic companies only; null for everyone else). */
export function franchiseMenu(a: Asset, b0: BizState): MenuGroup | null {
  if (!isFranchiseIndustry(b0.industry)) return null
  return {
    type: 'menu',
    id: `biz.franchise.${a.id}`,
    label: 'Franchising',
    emoji: '\u{1F3EA}',
    subtitle: (g) => {
      const b = readBiz(g, live(g, a))
      const st = readFranchise(b)
      if (st.units > 0) return `${plural(st.units, 'franchised outlet')} · ${money(st.ledger.find((x) => x.year === g.year - 1)?.royalty ?? 0)} royalties last year`
      return franchiseBlock(b) ? 'Not ready yet' : 'Grow without spending your own capital'
    },
    disabledReason: (g) => manageBlock(g, live(g, a)),
    header: () => `Franchisees pay to open outlets under your brand with their own money. You keep the fee (after training costs) and ${Math.round(ROYALTY * 100)}% of their sales, minus ${Math.round(SUPPORT * 100)}% for support. Poor quality invites scandals.`,
    children: (g) => {
      const cur = live(g, a)
      const b = readBiz(g, cur)
      const st = readFranchise(b)
      const def = industryDef(b.industry)
      const last = st.ledger.find((x) => x.year === g.year - 1)
      const nodes: MenuNode[] = []
      nodes.push({
        type: 'info',
        id: `biz.franchise.status.${a.id}`,
        emoji: '\u{1F4CA}',
        text: st.units > 0 || st.since
          ? `${plural(st.units, 'franchised outlet')} · network ${networkSize(b)}/${networkRoom(b)} in ${getCountry(b.countryId).name} · last year ${money((last?.royalty ?? 0) + (last?.fees ?? 0))} · lifetime ${money(st.lifetime)}`
          : `No franchises yet. Each one pays about ${money(netFee(b))} up front and ${money(unitRoyalty(b, networkSize(b) + 1))} a year.`,
      })
      const block = franchiseBlock(b)
      if (block) nodes.push({ type: 'info', id: `biz.franchise.block.${a.id}`, emoji: '\u{1F512}', text: block })
      if (st.units > 0) {
        const p = scandalP(b, st.units, soldThisYear(g, b))
        nodes.push({ type: 'info', id: `biz.franchise.risk.${a.id}`, emoji: p >= 0.2 ? '\u{26A0}\u{FE0F}' : '\u{1F6E1}\u{FE0F}', text: `Scandal risk ${p >= 0.2 ? 'high' : p >= 0.08 ? 'medium' : 'low'} (about ${Math.round(p * 100)}% a year) · about ${Math.round(closeRate(b) * 100)}% of franchisees quit each year. Quality and brand keep both down.` })
      }
      nodes.push(sellAction(a, b, g))
      if (st.units > 0) nodes.push(buyBackAction(a, b))
      if (!st.units && !block) nodes.push({ type: 'info', id: `biz.franchise.how.${a.id}`, emoji: '\u{1F4A1}', text: `Your own ${def.sitePlural} earn more each, but cost you the fit-out. Franchises grow the brand on other people's money.` })
      return nodes
    },
  }
}
