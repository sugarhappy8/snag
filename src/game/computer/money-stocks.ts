// Single-stock options and coin bets from the home computer: calls and puts on one company listed
// on your local exchange, and 2x shorts or plain (unleveraged) longs on a cryptocurrency. They
// settle at the next age-up on that security's real move (the same prices the Investments menu
// shows), market shocks included: if the government bans a company, its puts really pay.
//
// Options are priced off the company's own distribution of yearly moves (beta to the market,
// company-specific swings, scandals, surges and bankruptcy) plus the market maker's markup, so a
// fair bet always loses a little on average. Inside knowledge is another matter, which is why
// politicians also get a "crony" route (special/politics.ts): a friend's account, cash back,
// minus the friend's cut, and a paper trail the regulator may or may not follow.
import { addMoney, count, formatMoney, log, moneyWith, notice, scriptChoice, scriptInput, shortMoney, useYearAction, yearActionsUsed } from '../core'
import { coinDef, companyDef, cryptoYear, exchangeByKey, exchangeInfo, exchangeYear, indexMove, SECTORS, type ExInfo, type SecurityDef } from '../invest/engine'
import { gutLikes, listPicks, marketInstinct } from '../invest/instinct'
import { shockFactor } from '../invest/shocks'
import { seeded, type SRng } from '../assets'
import { chance, pick, uid } from '../rng'
import { defineScript } from '../scripts'
import { talentHint } from '../talents'
import type { ChoiceOption, GameState, Json, MenuAction, MenuGroup, MenuNode } from '../types'
import {
  absPct,
  anchor,
  blockReason,
  brokerName,
  canAct,
  clampNum,
  cryptoBanned,
  dollars,
  fam,
  isRecord,
  local,
  moneyState,
  noteSharp,
  num,
  payOrBorrow,
  readState,
  sharpSpread,
  str,
  type BetResult,
  type MoneyState,
  type News,
  type StockBet,
} from './money-common'
import { bankGain, markup, maybeTradingAddiction } from './money-options'
import { addScreenTime } from './skills'
import { CRYPTO_GATE, eraOpen } from './era'

export const MAX_BETS = 6
export const BETS_PER_YEAR = 3
const LIMIT_KEY = 'computer.stock.trade'
/** Calls pay at most this multiple of the premium (market makers hedge the tails). */
const CALL_CAP = 50
/** Coin shorts are 2x: $1 of cash moves $2 of coins. */
export const COIN_LEVERAGE = 2
/**
 * Coin longs are not leveraged: coins already rise a lot on average (and crash often), so a
 * leveraged long you can't lose more than your stake on would be a free-money machine. A long
 * is the coin itself, minus the fee.
 */
export const LONG_LEVERAGE = 1
/** Yearly borrowing / funding fee on a coin bet's notional. */
const COIN_FEE = 0.06
/** A coin that more than quadruples forces the short closed (the broker buys you back in). */
const SHORT_SQUEEZE = 3
const LOG_KEEP = 20

// ---------------------------------------------------------------------------
// What you can bet on

export interface BetTarget {
  asset: 'stock' | 'coin'
  secId: string
  exKey: string
  slot: number
  name: string
  symbol: string
  emoji: string
  /** Today's price, market shocks included. */
  price: number
  /** Typical yearly swing, for the menus. */
  vol: number
  sector: string
}

function info(g: GameState): ExInfo {
  return exchangeInfo(g.character.countryId)
}

/** The companies listed on the local exchange, at today's (shocked) prices. */
export function stockTargets(g: GameState): BetTarget[] {
  const inf = info(g)
  const ey = exchangeYear(fam(g), anchor(g), inf, g.year)
  return ey.stocks.map((s) => {
    const def = companyDef(inf, s.slot, s.gen)
    const sector = def.sector === 'penny' ? 'Penny stock' : SECTORS[def.sector].label
    return {
      asset: 'stock' as const,
      secId: def.id,
      exKey: inf.key,
      slot: s.slot,
      name: def.name,
      symbol: def.symbol,
      emoji: def.sector === 'penny' ? '\u{1F39F}\u{FE0F}' : SECTORS[def.sector].emoji,
      price: Math.max(0.01, s.price * shockFactor(g, def.id, g.year)),
      vol: stockVol(inf, def),
      sector,
    }
  })
}

/** The coins on the crypto market, at today's (shocked) prices. */
export function coinTargets(g: GameState): BetTarget[] {
  const cy = cryptoYear(fam(g), anchor(g), g.year)
  return cy.coins.map((c) => {
    const def = coinDef(c.slot, c.gen)
    return {
      asset: 'coin' as const,
      secId: def.id,
      exKey: 'crypto',
      slot: c.slot,
      name: def.name,
      symbol: def.symbol,
      emoji: def.stable ? '\u{1F4B5}' : '\u{1FA99}',
      price: Math.max(0.000001, c.price * shockFactor(g, def.id, g.year)),
      vol: def.stable ? 0 : Math.min(2, Math.sqrt((def.beta * 0.5) ** 2 + def.idio ** 2)),
      sector: def.stable ? 'Stablecoin' : 'Cryptocurrency',
    }
  })
}

/** '$45,210', '$8.17', '$0.031'. */
export function priceLabel(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return formatMoney(0)
  if (p >= 1_000) return formatMoney(p)
  if (p >= 1) return moneyWith(p, (x) => x.toFixed(2))
  return moneyWith(p, (x) => x.toPrecision(2))
}

export function findTarget(g: GameState, secId: string): BetTarget | undefined {
  return [...stockTargets(g), ...coinTargets(g)].find((t) => t.secId === secId)
}

// ---------------------------------------------------------------------------
// Pricing single-stock options

function exDrift(inf: ExInfo): number {
  return clampNum(inf.ex.drift, -0.05, 0.3)
}

function stockVol(inf: ExInfo, def: SecurityDef): number {
  const v = clampNum(inf.ex.volatility, 0.05, 0.8)
  return Math.sqrt((def.beta * v * 0.85) ** 2 + def.idio ** 2)
}

function srngNormal(r: SRng): number {
  let s = 0
  for (let i = 0; i < 6; i++) s += r.next()
  return (s - 3) * Math.SQRT2
}

const SAMPLES = 3000
const indexCache = new Map<string, number[]>()

/** Many draws of the exchange's yearly log move (same engine, unrelated seeds). */
function indexLogSamples(inf: ExInfo): number[] {
  let xs = indexCache.get(inf.key)
  if (!xs) {
    xs = []
    for (let i = 0; i < SAMPLES; i++) xs.push(indexMove(`optpx${i}`, inf, 2000 + (i % 97)).logRet)
    indexCache.set(inf.key, xs)
  }
  return xs
}

const BANKRUPT = [0, 0.001, 0.002, 0.004, 0.008, 0.015]
const stockCache = new Map<string, number[]>()

/** Draws of one company's yearly price move, the way the market engine moves it. */
function stockSamples(inf: ExInfo, def: SecurityDef): number[] {
  const key = `${inf.key}|${def.id}`
  let xs = stockCache.get(key)
  if (xs) return xs
  xs = []
  const r = seeded(`stkpx|${key}`)
  const drift = exDrift(inf)
  const idx = indexLogSamples(inf)
  for (let i = 0; i < SAMPLES; i++) {
    const z = srngNormal(r)
    const uBank = r.next()
    const uJump = r.next()
    const uSize = r.next()
    if (uBank < (BANKRUPT[def.risk] ?? 0.004)) {
      xs.push(-1)
      continue
    }
    let lt = Math.log(1 + drift + def.tilt) + def.beta * (idx[i] - Math.log(1 + drift)) + def.idio * z
    if (uJump < 0.02) lt += Math.log(0.45 + 0.3 * uSize)
    else if (uJump > 0.98) lt += Math.log(1.3 + 0.5 * uSize)
    xs.push(Math.exp(clampNum(lt - Math.log(1 + def.dy), -12, 6)) - 1)
  }
  stockCache.set(key, xs)
  if (stockCache.size > 64) stockCache.delete(stockCache.keys().next().value as string)
  return xs
}

/** How far the stock must move before an out-of-the-money option pays (half a year's swing). */
export function stockStrike(inf: ExInfo, def: SecurityDef, strike: 'atm' | 'otm'): number {
  if (strike === 'atm') return 0
  return Math.round(clampNum(stockVol(inf, def) * 0.5, 0.05, 0.4) * 1000) / 1000
}

/** Fair value per $1 of exposure: the average payoff over the company's real move distribution. */
export function stockFairValue(inf: ExInfo, def: SecurityDef, dir: 'call' | 'put', k: number): number {
  const xs = stockSamples(inf, def)
  let sum = 0
  for (const r of xs) sum += dir === 'call' ? Math.min(Math.max(0, r - k), CALL_CAP) : Math.max(0, -r - k)
  return Math.max(0.002, sum / xs.length)
}

/**
 * What $1 of exposure costs: fair value plus the market maker's markup (single stocks are pricier),
 * plus `extra` for a trader flagged as sharp (money-common sharpSpread).
 */
export function stockOptionPrice(inf: ExInfo, def: SecurityDef, dir: 'call' | 'put', strike: 'atm' | 'otm', skill: number, extra = 0): number {
  return stockFairValue(inf, def, dir, stockStrike(inf, def, strike)) * (1 + markup(skill, strike) + 0.03 + Math.max(0, Number.isFinite(extra) ? extra : 0))
}

// ---------------------------------------------------------------------------
// The Investing talent: the gut's once-a-year feeling (invest/instinct.ts) on these targets.

function gutHint(g: GameState, secId: string): string | null {
  const inst = marketInstinct(g, !cryptoBanned(g.character.countryId))
  return inst && gutLikes(inst, secId) ? talentHint(g, 'Investing', `Your gut says this one rises in ${inst.year}`) : null
}

// ---------------------------------------------------------------------------
// Settlement

function exOf(bet: StockBet): ExInfo {
  return exchangeByKey(bet.exKey) ?? exchangeInfo(bet.countryId || 'us')
}

/** The price a bet settles at: the security at the end of the year after it was placed. */
export function settlePrice(g: GameState, bet: StockBet): number {
  const year = bet.year + 1
  if (bet.asset === 'coin') {
    const c = cryptoYear(fam(g), anchor(g), year).coins[bet.slot]
    if (!c) return bet.openPrice
    if (c.id === bet.secId) return Math.max(0, c.price * shockFactor(g, bet.secId, year))
    if (c.ended && c.ended.id === bet.secId) return 0
    return bet.openPrice
  }
  const s = exchangeYear(fam(g), anchor(g), exOf(bet), year).stocks[bet.slot]
  if (!s) return bet.openPrice
  // Undo this year's split so the price compares with the one paid.
  if (s.id === bet.secId) return Math.max(0, s.price * (s.ratio ?? 1) * shockFactor(g, bet.secId, year))
  // Bought out: the takeover premium is paid on the (shocked) market price.
  if (s.ended && s.ended.id === bet.secId) return s.ended.kind === 'bankrupt' ? 0 : Math.max(0, s.ended.perUnit * shockFactor(g, bet.secId, year))
  return bet.openPrice
}

/** A coin's "staking" yield: short sellers owe it to whoever lent them the coins. */
function coinYield(secId: string): number {
  const m = /^crypto#c(\d+)g(\d+)$/.exec(secId)
  if (!m) return 0
  const y = coinDef(Number(m[1]), Number(m[2])).yield
  return Number.isFinite(y) ? Math.max(0, y) : 0
}

/** What comes back to the account at settlement (negative = a short that owes money). */
export function betPayoff(bet: StockBet, price: number): number {
  const open = bet.openPrice > 0 ? bet.openPrice : 1
  const ret = Number.isFinite(price) ? price / open - 1 : 0
  switch (bet.kind) {
    case 'call':
      return dollars(Math.min(bet.units * Math.max(0, ret - bet.k), bet.premium * CALL_CAP))
    case 'put':
      return dollars(bet.units * Math.max(0, -ret - bet.k))
    case 'long':
      return dollars(bet.premium + bet.units * ret - bet.units * COIN_FEE)
    case 'short': {
      const r = Math.min(ret, SHORT_SQUEEZE)
      const v = bet.premium - bet.units * r - bet.units * (COIN_FEE + coinYield(bet.secId))
      return Number.isFinite(v) ? Math.round(v) : 0
    }
  }
}

function remember(st: MoneyState, r: BetResult): void {
  st.betLog.push(r)
  if (st.betLog.length > LOG_KEEP) st.betLog.splice(0, st.betLog.length - LOG_KEEP)
}

interface BetTotals {
  own: number
  crony: number
  margin: number
  vanished: string[]
  lines: string[]
  big: boolean
}

/** Settle every bet placed in an earlier year. Returns the news it wants to tell. */
export function settleBets(g: GameState, st: MoneyState): News | null {
  const due = st.bets.filter((b) => b.year < g.year)
  if (!due.length) return null
  st.bets = st.bets.filter((b) => b.year >= g.year)
  const t: BetTotals = { own: 0, crony: 0, margin: 0, vanished: [], lines: [], big: false }
  let staked = 0
  for (const bet of due) {
    const price = settlePrice(g, bet)
    const pay = betPayoff(bet, price)
    const move = `${bet.name} ${price >= bet.openPrice ? 'rose' : 'fell'} ${absPct(price / (bet.openPrice || 1) - 1, 0)}`
    if (bet.via === 'crony') {
      // Off the books: the crony hands back cash, keeping a cut of any profit. Or keeps it all.
      let back = Math.max(0, pay)
      const profit = back - bet.premium
      if (profit > 0) back = bet.premium + Math.round(profit * (1 - clampNum(bet.cut, 0, 0.9)))
      if (profit > 0 && chance(g, 0.05)) {
        t.vanished.push(`${bet.crony} cashed out your ${bet.symbol} bet, stopped answering calls and moved somewhere without an extradition treaty. You can't exactly report it.`)
        back = 0
      } else if (pay < 0) {
        const owed = -pay
        const financed = payOrBorrow(g, owed, `${bet.crony} (an insistent friend)`)
        t.lines.push(`${bet.crony} lost more than you put up on ${bet.symbol} and made you cover ${formatMoney(owed)}${financed ? `, ${formatMoney(financed)} of it on a payment plan` : ''}.`)
      }
      if (back > 0) addMoney(g, back)
      const net = back - bet.premium - (pay < 0 ? -pay : 0)
      t.crony += net
      if (net >= local(g, 10_000)) t.big = true
      remember(st, { id: bet.id, secId: bet.secId, name: bet.name, year: bet.year, via: 'crony', net, caseId: bet.caseId })
      t.lines.push(`${move}: ${bet.crony}'s ${bet.kind} on ${bet.symbol} ${net >= 0 ? `brought you ${formatMoney(net)} in cash` : `lost you ${formatMoney(-net)}`}.`)
      continue
    }
    const net = pay - bet.premium
    staked += bet.premium
    if (pay >= 0) bankGain(g, st, net, pay, false)
    else {
      // A short that owes more than the cash put up: the whole stake plus the bill is a loss.
      st.lossCarry = dollars(st.lossCarry + bet.premium - pay)
      const financed = payOrBorrow(g, -pay, `${st.broker || brokerName(g.character.countryId)} margin desk`)
      if (financed > 0) {
        t.margin += financed
        count(g, 'marginCalls')
      }
    }
    st.pnl = Math.round(st.pnl + net)
    t.own += net
    if (net >= local(g, 10_000) && pay >= bet.premium * 3) t.big = true
    remember(st, { id: bet.id, secId: bet.secId, name: bet.name, year: bet.year, via: 'own', net, caseId: bet.caseId })
    t.lines.push(`${move}: your ${bet.kind === 'short' ? 'short' : bet.kind === 'long' ? 'long bet' : `${bet.kind}s`} on ${bet.symbol} ${net >= 0 ? `made ${formatMoney(net)}` : `lost ${formatMoney(-net)}`}.`)
  }
  noteSharp(st, staked, staked + t.own)
  const total = t.own + t.crony
  const notable = t.big || t.margin > 0 || t.vanished.length > 0 || Math.abs(total) >= local(g, 5_000)
  const logLine = total >= 0 ? `My single-stock and coin bets made ${formatMoney(total)} this year.` : `My single-stock and coin bets lost ${formatMoney(-total)} this year.`
  return {
    priority: t.vanished.length ? 65 : t.margin > 0 ? 70 : t.big ? 58 : notable ? 42 : 6,
    popup: (gg) => {
      log(gg, logLine, total >= 0 ? 'good' : 'bad')
      if (!notable) return
      const margin = t.margin > 0 ? `\n\nA short blew up and ${formatMoney(t.margin)} became a margin loan.` : ''
      const gone = t.vanished.length ? `\n\n${t.vanished.join('\n')}` : ''
      notice(gg, t.vanished.length ? 'Double-Crossed' : total >= 0 ? 'Bets Settled' : 'Bets Went Bust', `${t.lines.join('\n')}${margin}${gone}`, { emoji: total >= 0 ? '\u{1F4B0}' : '\u{1F4C9}', tone: total >= 0 && !t.vanished.length && t.margin === 0 ? 'good' : 'bad' })
    },
    quiet: (gg) => log(gg, logLine, total >= 0 ? 'good' : 'bad'),
  }
}

// ---------------------------------------------------------------------------
// Placing a bet (menus here, and the crony route in special/politics.ts)

export interface BetSpec {
  via: 'own' | 'crony'
  secId: string
  kind: StockBet['kind']
  strike?: 'atm' | 'otm'
  /** Cash put down (premium for options, margin for coins). */
  stake: number
  crony?: string
  cut?: number
}

export function minBet(g: GameState): number {
  return Math.max(10, local(g, 50))
}

/** The most one bet may risk (brokers and cronies both get nervous above this). */
export function maxBet(g: GameState): number {
  return Math.max(minBet(g), local(g, 2_000_000))
}

/** Open a bet now, paying for it from cash. Returns null (and explains) when it can't. */
export function placeBet(g: GameState, spec: BetSpec): StockBet | null {
  const t = findTarget(g, spec.secId)
  if (!t) {
    notice(g, 'Order Rejected', 'That security is no longer trading.', { emoji: '\u{1F6AB}' })
    return null
  }
  const coin = t.asset === 'coin'
  if (coin !== (spec.kind === 'short' || spec.kind === 'long')) return null
  if (coin && cryptoBanned(g.character.countryId)) {
    notice(g, 'Order Rejected', 'Crypto trading is banned here.', { emoji: '\u{1F6AB}' })
    return null
  }
  const st = moneyState(g)
  if (st.bets.length >= MAX_BETS) {
    notice(g, 'Too Many Bets', `You already have ${MAX_BETS} open single-stock and coin bets. Wait for them to settle at the end of the year.`, { emoji: '\u{1F4CB}' })
    return null
  }
  const stake = Math.floor(Number.isFinite(spec.stake) ? spec.stake : 0)
  const own = spec.via === 'own'
  const fee = own ? Math.max(1, Math.round(stake * 0.01)) : 0
  if (stake < minBet(g) || stake > maxBet(g)) {
    notice(g, 'Order Rejected', `Bets must be between ${formatMoney(minBet(g))} and ${formatMoney(maxBet(g))}.`, { emoji: '\u{1F6AB}' })
    return null
  }
  if (g.character.money < stake + fee) {
    notice(g, 'Not Enough Money', `You need ${formatMoney(stake + fee)} in the bank for that.`, { emoji: '\u{1F4B8}' })
    return null
  }
  let units: number
  let k = 0
  if (coin) units = stake * (spec.kind === 'short' ? COIN_LEVERAGE : LONG_LEVERAGE)
  else {
    const inf = exchangeByKey(t.exKey) ?? info(g)
    const m = /s(\d+)g(\d+)$/.exec(t.secId)
    const def = companyDef(inf, t.slot, m ? Number(m[2]) : 0)
    const dir = spec.kind === 'put' ? 'put' : 'call'
    const strike = spec.strike === 'otm' ? 'otm' : 'atm'
    k = stockStrike(inf, def, strike)
    // Cronies trade on their own accounts; only your own broker knows your streak.
    units = dollars(stake / stockOptionPrice(inf, def, dir, strike, st.skill, own ? sharpSpread(st) : 0))
  }
  const before = g.character.money
  addMoney(g, -(stake + fee))
  const bet: StockBet = {
    id: uid(g, 'bet'),
    via: spec.via,
    asset: t.asset,
    kind: spec.kind,
    k,
    secId: t.secId,
    exKey: t.exKey,
    slot: t.slot,
    name: t.name,
    symbol: t.symbol,
    units,
    premium: stake,
    openPrice: t.price,
    year: g.year,
    countryId: g.character.countryId,
    crony: own ? '' : str(spec.crony as Json, 'a friend'),
    cut: own ? 0 : clampNum(num(spec.cut as Json, 0.25), 0, 0.9),
    caseId: '',
  }
  st.bets.push(bet)
  if (own) {
    st.trades += 1
    count(g, 'optionTrades')
    maybeTradingAddiction(g, stake, before)
  }
  return bet
}

/** Open bets on one security (read-only). */
export function openBetsOn(g: GameState, secId: string): StockBet[] {
  return readState(g).bets.filter((b) => b.secId === secId)
}

/** Tag open bets as riding on the player's own announcement (an insider-trading case). */
export function tagBets(g: GameState, ids: string[], caseId: string): void {
  if (!ids.length) return
  for (const b of moneyState(g).bets) if (ids.includes(b.id)) b.caseId = caseId
}

/** The regulator freezes the open bets of a case: the money is gone. Returns the stakes lost. */
export function freezeBets(g: GameState, caseId: string): number {
  if (!isRecord(g.flags.computerMoney)) return 0
  const st = moneyState(g)
  const frozen = st.bets.filter((b) => b.caseId === caseId)
  st.bets = st.bets.filter((b) => b.caseId !== caseId)
  return frozen.reduce((s, b) => s + b.premium, 0)
}

/** What a case's settled bets made the player (after cronies' cuts). */
export function caseProfit(g: GameState, caseId: string): number {
  return readState(g)
    .betLog.filter((r) => r.caseId === caseId)
    .reduce((s, r) => s + r.net, 0)
}

// ---------------------------------------------------------------------------
// Menus (Activities › Computer › Options Trading › Single Stocks & Coins)

const DIR_SCRIPT = 'computer.money.stock.dir'
const STRIKE_SCRIPT = 'computer.money.stock.strike'
const SIZE_SCRIPT = 'computer.money.stock.size'

function tradeBlock(g: GameState): string | null {
  const b = blockReason(g, 18)
  if (b) return b
  const st = readState(g)
  if (!st.broker) return 'Open a brokerage account first.'
  if (st.bets.length >= MAX_BETS) return `You have ${MAX_BETS} open bets. Wait for them to settle.`
  if (yearActionsUsed(g, LIMIT_KEY) >= BETS_PER_YEAR) return `You've placed ${BETS_PER_YEAR} single-stock and coin bets this year. Your broker suggested "a walk outside."`
  return null
}

function tooMany(g: GameState): void {
  notice(g, 'Market Closed', `You've placed ${BETS_PER_YEAR} single-stock and coin bets this year. Your broker has started sending you articles about index funds.`, { emoji: '\u{1F6D1}' })
}

function sizeText(g: GameState): string {
  const max = Math.min(maxBet(g), Math.floor(Math.max(0, g.character.money) / 1.01))
  return `You can put down ${formatMoney(minBet(g))} to ${formatMoney(Math.max(minBet(g), max))} (plus a 1% commission).`
}

defineScript(DIR_SCRIPT, (g, choice, data) => {
  if (!isRecord(data) || choice === 'cancel' || !canAct(g) || tradeBlock(g)) return
  const t = findTarget(g, str(data.secId))
  if (!t) return
  if (t.asset === 'coin') {
    if (choice !== 'short' && choice !== 'long') return
    askSize(g, t, choice, 'atm')
    return
  }
  if (choice !== 'call' && choice !== 'put') return
  const inf = exchangeByKey(t.exKey) ?? info(g)
  const m = /s(\d+)g(\d+)$/.exec(t.secId)
  const def = companyDef(inf, t.slot, m ? Number(m[2]) : 0)
  const st = readState(g)
  const otm = stockStrike(inf, def, 'otm')
  const lines = (['atm', 'otm'] as const).map((s) => `${s === 'atm' ? 'At the money' : `Out of the money (needs ${choice === 'call' ? 'a rise' : 'a drop'} of more than ${absPct(otm, 0)})`}: ${formatMoney(1)} controls about ${shortMoney(1 / stockOptionPrice(inf, def, choice, s, st.skill, sharpSpread(st)))} of ${t.symbol}.`)
  scriptChoice(g, STRIKE_SCRIPT, 'Pick a Strike', `${t.name} (${t.symbol}) trades at ${priceLabel(t.price)}. Cheaper options need a bigger move to pay off.\n\n${lines.join('\n')}`, [
    { id: 'atm', label: 'At the money', emoji: '\u{1F3AF}' },
    { id: 'otm', label: 'Out of the money', emoji: '\u{1F3B2}' },
    { id: 'cancel', label: 'Never mind', emoji: '\u{1F645}' },
  ], { emoji: '\u{1F3AF}', data: { secId: t.secId, kind: choice } })
})

defineScript(STRIKE_SCRIPT, (g, choice, data) => {
  if (!isRecord(data) || choice === 'cancel' || (choice !== 'atm' && choice !== 'otm') || !canAct(g) || tradeBlock(g)) return
  const t = findTarget(g, str(data.secId))
  const kind = str(data.kind)
  if (!t || (kind !== 'call' && kind !== 'put')) return
  askSize(g, t, kind, choice)
})

function askSize(g: GameState, t: BetTarget, kind: StockBet['kind'], strike: 'atm' | 'otm'): void {
  const lo = minBet(g)
  const hi = Math.max(lo, Math.min(maxBet(g), Math.floor(Math.max(0, g.character.money) / 1.01)))
  if (g.character.money < lo * 1.01) {
    notice(g, 'Not Enough Money', `You need at least ${formatMoney(Math.ceil(lo * 1.01))} for that.`, { emoji: '\u{1F4B8}' })
    return
  }
  const what =
    kind === 'short'
      ? `A 2x short pays when ${t.symbol} falls and costs you double when it rises (plus a ${Math.round((COIN_FEE + coinYield(t.secId)) * 100)}% borrowing fee). If it more than quadruples, your broker closes it and sends you the bill.`
      : kind === 'long'
        ? `A long rides ${t.symbol}'s move for a year, minus a ${Math.round(COIN_FEE * 100)}% fee. No leverage: your broker has seen how these coins end. If it goes to zero, so does your stake.`
        : `The most you can lose is what you put in. They settle at the end of the year on ${t.symbol}'s real price.`
  scriptInput(g, {
    title: 'How Much?',
    emoji: '\u{1F4B5}',
    text: `${what} ${sizeText(g)}`,
    input: 'number',
    money: true,
    min: lo,
    max: hi,
    defaultValue: String(Math.max(lo, Math.round(hi / 10))),
    scriptId: SIZE_SCRIPT,
    data: { secId: t.secId, kind, strike },
  })
}

defineScript(SIZE_SCRIPT, (g, value, data) => {
  if (!isRecord(data) || !canAct(g) || tradeBlock(g)) return
  const kind = str(data.kind) as StockBet['kind']
  if (!['call', 'put', 'short', 'long'].includes(kind)) return
  const n = Number(String(value).replace(/[^0-9.]/g, ''))
  if (!Number.isFinite(n) || n <= 0) return
  const stake = Math.round(clampNum(n, minBet(g), Math.max(minBet(g), Math.min(maxBet(g), Math.floor(Math.max(0, g.character.money) / 1.01)))))
  if (!useYearAction(g, LIMIT_KEY, BETS_PER_YEAR)) return tooMany(g)
  const bet = placeBet(g, { via: 'own', secId: str(data.secId), kind, strike: data.strike === 'otm' ? 'otm' : 'atm', stake })
  if (!bet) return
  addScreenTime(g, 1)
  const lev = bet.premium > 0 ? bet.units / bet.premium : 0
  const what = kind === 'short' ? `a 2x short on ${bet.name}` : kind === 'long' ? `a long bet on ${bet.name}` : `${kind}s on ${bet.name}`
  log(g, `I put ${formatMoney(bet.premium)} into ${what}.`)
  notice(
    g,
    'Bet Placed',
    `You put ${formatMoney(bet.premium)} into ${what} (${bet.symbol}${bet.asset === 'stock' ? `, about ${lev >= 10 ? Math.round(lev) : lev.toFixed(1)}x leverage` : ''}). It settles when the year ends. ${pick(g, ['Your heart rate is now a technical indicator.', 'You set a price alert, then twelve more.', 'You told nobody. Wise.'])}`,
    { emoji: kind === 'put' || kind === 'short' ? '\u{1F4C9}' : '\u{1F4C8}' },
  )
})

function betLabel(b: StockBet): string {
  const what = b.kind === 'short' ? '2x short' : b.kind === 'long' ? 'long' : `${b.kind}s${b.k > 0 ? ' (out of the money)' : ''}`
  return `${what} on ${b.symbol}, ${formatMoney(b.premium)}${b.via === 'crony' ? ` via ${b.crony}` : ''}`
}

function targetAction(t: BetTarget): MenuAction {
  const coin = t.asset === 'coin'
  return {
    type: 'action',
    id: `computer.stockbets.${t.secId}`,
    label: `${t.name} (${t.symbol})`,
    emoji: t.emoji,
    subtitle: `${priceLabel(t.price)} · ${t.sector}${t.vol > 0 ? ` · swings ~${absPct(t.vol, 0)} a year` : ''}`,
    hint: (g) => gutHint(g, t.secId),
    disabledReason: (g) => tradeBlock(g) ?? (coin && cryptoBanned(g.character.countryId) ? 'Crypto trading is banned here.' : null),
    run: (g) => {
      if (!canAct(g) || tradeBlock(g)) return
      const choices: ChoiceOption[] = coin
        ? [
            { id: 'short', label: 'Short it (2x): it crashes', emoji: '\u{1F4C9}' },
            { id: 'long', label: 'Go long: it moons', emoji: '\u{1F680}' },
            { id: 'cancel', label: 'Never mind', emoji: '\u{1F645}' },
          ]
        : [
            { id: 'call', label: 'Buy calls: it goes up', emoji: '\u{1F4C8}' },
            { id: 'put', label: 'Buy puts: it goes down', emoji: '\u{1F4C9}' },
            { id: 'cancel', label: 'Never mind', emoji: '\u{1F645}' },
          ]
      const hint = gutHint(g, t.secId)
      const up = choices.find((c) => c.id === (coin ? 'long' : 'call'))
      if (hint && up) up.hint = hint
      scriptChoice(
        g,
        DIR_SCRIPT,
        `${t.name} (${t.symbol})`,
        coin ? `${t.name} trades at ${priceLabel(t.price)}. Which way is it going by the end of the year?` : `${t.name} (${t.symbol}) trades at ${priceLabel(t.price)}. Calls pay if it rises, puts if it falls.`,
        choices,
        { emoji: t.emoji, data: { secId: t.secId } },
      )
    },
  }
}

/** Coins can be shorted here this year (crypto exists and isn't banned). */
function coinsHere(g: GameState): boolean {
  return !cryptoBanned(g.character.countryId) && eraOpen(g, CRYPTO_GATE)
}

export function stockBetsMenu(): MenuGroup {
  return {
    type: 'menu',
    id: 'computer.stockbets',
    label: 'Single Stocks & Coins',
    emoji: '\u{1F3AF}',
    subtitle: (g) => `Puts and calls on one company${coinsHere(g) ? ', coin shorts' : ''} · ${readState(g).bets.length} open`,
    visible: (g) => g.character.alive && g.character.age >= 18,
    disabledReason: (g) => blockReason(g, 18) ?? (readState(g).broker ? null : 'Open a brokerage account first.'),
    hint: (g) => {
      const inst = marketInstinct(g, !cryptoBanned(g.character.countryId))
      const mine = inst ? inst.picks.filter((p) => p.kind === 'stock' || p.kind === 'crypto') : []
      return inst && mine.length ? talentHint(g, 'Investing', `Your gut likes ${listPicks(mine)} for ${inst.year}`) : null
    },
    header: (g) => {
      const inf = info(g)
      return `Bet on one company on the ${inf.ex.code}${coinsHere(g) ? ', or on one coin' : ''}. Everything settles when the year ends on the real price, news included. ${BETS_PER_YEAR - Math.min(BETS_PER_YEAR, yearActionsUsed(g, LIMIT_KEY))} of ${BETS_PER_YEAR} bets left this year.`
    },
    children: (g) => {
      const st = readState(g)
      const nodes: MenuNode[] = [
        { type: 'info', id: 'computer.stockbets.open', emoji: '\u{1F9FE}', text: st.bets.length ? `Open bets:\n${st.bets.map(betLabel).join('\n')}` : 'No open bets.' },
        { type: 'heading', id: 'computer.stockbets.h.stocks', label: `Stocks on the ${info(g).ex.code}` },
        ...stockTargets(g).map(targetAction),
      ]
      if (coinsHere(g)) {
        nodes.push({ type: 'heading', id: 'computer.stockbets.h.coins', label: 'Coins' })
        nodes.push(...coinTargets(g).map(targetAction))
      }
      return nodes
    },
  }
}
