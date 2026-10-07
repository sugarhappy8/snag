// Options trading from the home computer: calls and puts on the local stock index that settle
// at the next age-up (on the same seeded index move the Investments menu uses), "0DTE YOLO"
// trades that settle on the spot, and selling options on margin. Adults trade with a local
// online broker; teens paper-trade (fake money, real skill) or "borrow" a parent's login.
//
// Options are priced off the real distribution of the index's yearly moves plus a market-maker
// markup, so every trade has a negative expected value: skill shaves the markup, never past
// zero. Max loss when buying is the premium; selling options can blow up into margin debt.
import { addHidden, addMoney, addRelationship, addStat, count, earnIncome, formatMoney, getPerson, log, notice, relationLabel, remember, scriptChoice, scriptInput, shortMoney, useYearAction } from '../core'
import { taxAdditionalIncome } from '../finance'
import { GAMBLING_ADDICTION } from '../gambling'
import { exchangeByKey, exchangeInfo, indexMove, type ExInfo } from '../invest/engine'
import { PRESENT_YEAR } from '../history/timeline'
import { marketInstinct, type Instinct } from '../invest/instinct'
import { indexShockFactor } from '../invest/shocks'
import { chance, pick, randInt, uid } from '../rng'
import { defineScript } from '../scripts'
import { HINT_EMOJI, talentHint } from '../talents'
import { stockBetsMenu } from './money-stocks'
import { addScreenTime } from './skills'
import { eraOpen, ZERO_DTE_GATE } from './era'
import type { ChoiceOption, GameState, Json, MenuGroup, MenuNode, Person } from '../types'
import {
  absPct,
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
  normal,
  noteSharp,
  PAPER_START,
  parentsCatch,
  payOrBorrow,
  pct,
  readState,
  richestParent,
  sharpSpread,
  str,
  type MoneyState,
  type News,
  type OptionDir,
  type OptionMode,
  type OptionPos,
  type OptionStrike,
} from './money-common'

export const OPTIONS_MIN_AGE = 13
export const MAX_POSITIONS = 8
const LOTTO_CAP = 100
/** E[max(0, Z)] for the game's six-uniform normal (a hair under the true 0.399). */
const HALF_MEAN_ABS = 0.39

// ---------------------------------------------------------------------------
// Pricing

const SAMPLES = 16_000
const sampleCache = new Map<string, number[]>()

/** Many draws of this exchange's yearly index move (same engine, unrelated seeds). */
function moveSamples(info: ExInfo): number[] {
  let xs = sampleCache.get(info.key)
  if (!xs) {
    xs = []
    // Sample the procedural distribution. Historical years are fixed outcomes, not random
    // draws, and mixing them in can underprice calls or make selling puts a money exploit.
    for (let i = 0; i < SAMPLES; i++) xs.push(indexMove(`optpx${i}`, info, PRESENT_YEAR + (i % 97)).ret)
    sampleCache.set(info.key, xs)
  }
  return xs
}

const sortedCache = new Map<string, number[]>()

/** The moves in the option's favor (up for calls, down for puts), smallest first. */
function sortedGains(info: ExInfo, dir: OptionDir): number[] {
  const key = `${info.key}|${dir}`
  let xs = sortedCache.get(key)
  if (!xs) {
    const sgn = dir === 'call' ? 1 : -1
    xs = moveSamples(info)
      .map((r) => sgn * r)
      .sort((a, b) => a - b)
    sortedCache.set(key, xs)
  }
  return xs
}

const fairCache = new Map<string, number>()

/** Fair value per $1 of exposure: the average payoff over the index's real move distribution. */
export function fairValue(info: ExInfo, dir: OptionDir, k: number): number {
  const key = `${info.key}|${dir}|${k}`
  const hit = fairCache.get(key)
  if (hit !== undefined) return hit
  const sgn = dir === 'call' ? 1 : -1
  const xs = moveSamples(info)
  let sum = 0
  for (const r of xs) sum += Math.max(0, sgn * r - k)
  const v = Math.max(0.001, sum / xs.length)
  fairCache.set(key, v)
  return v
}

/** Share of years a strike must still finish in the money (no option that can never pay). */
const MIN_ITM: Record<OptionStrike, number> = { atm: 1, otm: 0.2, lotto: 0.05 }

/**
 * Strike as the move the index must beat: half a year's volatility out of the money, a year and
 * a half for lottery tickets, but never so far out that it pays in fewer than 1 year in 5 (out of
 * the money) or 1 in 20 (lottery). A wild market can't fall 90%, so its puts stay reachable.
 */
export function strikeOffset(info: ExInfo, dir: OptionDir, strike: OptionStrike): number {
  if (strike === 'atm') return 0
  const v = clampNum(info.ex.volatility, 0.05, 0.8)
  const want = strike === 'otm' ? v * 0.5 : v * 1.5
  const xs = sortedGains(info, dir)
  const reach = xs[Math.min(xs.length - 1, Math.floor(xs.length * (1 - MIN_ITM[strike])))]
  return Math.round(clampNum(Math.min(want, Number.isFinite(reach) ? reach : want), 0.01, 0.85) * 1000) / 1000
}

/** The market maker's cut: wide on lottery tickets, a bit narrower for skilled traders. */
export function markup(skill: number, strike: OptionStrike): number {
  const s = clampNum(skill, 0, 100)
  return Math.max(0.07, 0.15 - s * 0.0008) + (strike === 'lotto' ? 0.12 : strike === 'otm' ? 0.03 : 0)
}

/**
 * What $1 of exposure costs to buy (or pays when sold). `extra` is the wider spread brokers
 * charge a trader they've flagged as sharp (money-common sharpSpread).
 */
export function optionPrice(info: ExInfo, dir: OptionDir, strike: OptionStrike, skill: number, side: 'buy' | 'sell', extra = 0): number {
  const fair = fairValue(info, dir, strikeOffset(info, dir, strike))
  const m = markup(skill, strike) + Math.max(0, Number.isFinite(extra) ? extra : 0)
  return side === 'buy' ? fair * (1 + m) : fair / (1 + m)
}

/** The sharp-trader spread that applies to a flow (only your own real-money account gets flagged). */
function spreadFor(st: MoneyState, f: { mode: OptionMode }): number {
  return f.mode === 'real' ? sharpSpread(st) : 0
}

// ---------------------------------------------------------------------------
// The Investing talent: the gut's feeling about next year's index (invest/instinct.ts). The same
// once-a-year feeling as the Investments menu: about four times in five right, never certain,
// and trades stay capped per year, so a wrong call still costs the whole premium.

function instinct(g: GameState): Instinct | null {
  return marketInstinct(g, !cryptoBanned(g.character.countryId))
}

/** 'climbs' / 'has a rough year' / null when the gut has no feeling about the index. */
function indexFeeling(inst: Instinct | null): 'up' | 'down' | null {
  if (!inst) return null
  if (inst.gloomy || inst.market === 'down') return 'down'
  return inst.market === 'up' ? 'up' : null
}

function instinctRow(g: GameState): MenuNode | null {
  const inst = instinct(g)
  if (!inst) return null
  const feel = indexFeeling(inst)
  const text =
    feel === 'up'
      ? `Market instinct: your gut says the ${inst.index} climbs in ${inst.year}.`
      : feel === 'down'
        ? `Market instinct: your gut says the ${inst.index} has a rough ${inst.year}.`
        : `Market instinct: your gut has no clear feeling about the ${inst.index} in ${inst.year}.`
  return { type: 'info', id: 'computer.options.instinct', emoji: HINT_EMOJI, text: `${text} Gut feelings, not guarantees.` }
}

/** Purple hint on the direction the gut favors (buying: that way; selling: against the other way). */
function hintDirection(g: GameState, choices: ChoiceOption[], side: 'buy' | 'sell', index: string): void {
  const inst = instinct(g)
  const feel = indexFeeling(inst)
  if (!inst || !feel) return
  const id = side === 'buy' ? (feel === 'up' ? 'call' : 'put') : feel === 'up' ? 'put' : 'call'
  const c = choices.find((x) => x.id === id)
  if (c) c.hint = talentHint(g, 'Investing', feel === 'up' ? `Your gut says the ${index} climbs in ${inst.year}` : `Your gut says the ${index} has a rough ${inst.year}`)
}

/** Payout of a position given the index move (buy side, capped at 100x premium). */
export function positionPayoff(pos: OptionPos, ret: number): number {
  const sgn = pos.dir === 'call' ? 1 : -1
  const raw = pos.units * Math.max(0, sgn * (Number.isFinite(ret) ? ret : 0) - pos.k)
  return pos.side === 'buy' ? dollars(Math.min(raw, pos.premium * LOTTO_CAP)) : dollars(raw)
}

/**
 * The index move a position settles on (the year after it was opened), including any market
 * shock since it was opened (a ban on a listed company drags the whole index down).
 */
export function settleMove(g: GameState, pos: OptionPos): number {
  const info = exchangeByKey(pos.exKey) ?? exchangeInfo(pos.countryId || g.character.countryId)
  const ret = indexMove(fam(g), info, pos.year + 1).ret
  const open = typeof pos.fx === 'number' && Number.isFinite(pos.fx) && pos.fx > 0 ? pos.fx : indexShockFactor(g, info.key, pos.year)
  const now = indexShockFactor(g, info.key, pos.year + 1)
  return now === open ? ret : Math.max(-1, (1 + ret) * (now / open) - 1)
}

// ---------------------------------------------------------------------------
// Small helpers

function info(g: GameState): ExInfo {
  return exchangeInfo(g.character.countryId)
}

function dirWord(dir: OptionDir): string {
  return dir === 'call' ? 'calls' : 'puts'
}

function strikeLabel(inf: ExInfo, dir: OptionDir, strike: OptionStrike): string {
  const k = strikeOffset(inf, dir, strike)
  const need = dir === 'call' ? `a rise of more than ${absPct(k, 0)}` : `a drop of more than ${absPct(k, 0)}`
  if (strike === 'atm') return `At the money (any move ${dir === 'call' ? 'up' : 'down'} pays)`
  if (strike === 'otm') return `Out of the money (needs ${need})`
  return `Lottery ticket (needs ${need})`
}

function minTrade(g: GameState): number {
  return Math.max(10, local(g, 20))
}

/** Biggest premium a single trade may risk (brokers have position limits too). */
function maxPremium(g: GameState): number {
  return Math.max(minTrade(g), local(g, 2_000_000))
}

function fee(premium: number): number {
  return premium > 0 ? Math.max(1, Math.round(premium * 0.01)) : 0
}

function openCount(st: MoneyState): number {
  return st.positions.length
}

function gainSkill(st: MoneyState, lo: number, hi: number, g: GameState): void {
  st.skill = clampNum(st.skill + randInt(g, lo, hi) * (st.skill > 70 ? 0.5 : 1), 0, 100)
}

/**
 * Bank a realized trading gain (real money): offset carried losses, credit the cash and book the
 * taxable part as income. `now` = taxed on the spot (menu trades); otherwise yearlyFinance taxes it
 * later this age-up. `cashIn` is the money that actually arrives (0 when it was credited earlier).
 * Returns the tax paid now.
 */
export function bankGain(g: GameState, st: MoneyState, gain: number, cashIn: number, now: boolean): number {
  const cash = dollars(cashIn)
  const gn = Number.isFinite(gain) ? Math.round(gain) : 0
  if (gn <= 0) {
    st.lossCarry = dollars(st.lossCarry - gn)
    if (cash > 0) addMoney(g, cash)
    return 0
  }
  const offset = Math.min(st.lossCarry, gn)
  st.lossCarry = dollars(st.lossCarry - offset)
  const taxable = gn - offset
  // earnIncome adds the money too, so credit only the rest of the cash here.
  addMoney(g, cash - taxable)
  earnIncome(g, taxable)
  return now && taxable > 0 ? taxAdditionalIncome(g, taxable) : 0
}

/** Options are gambling in a nicer font: real-money trades can hook you like the casino does. */
export function maybeTradingAddiction(g: GameState, stake: number, moneyBefore: number): void {
  const c = g.character
  const existing = c.conditions.find((x) => x.name === GAMBLING_ADDICTION)
  if (existing) {
    existing.severity = Math.min(80, existing.severity + 1)
    return
  }
  const share = Math.min(1, stake / Math.max(100, moneyBefore))
  const freq = (g.yearActions['computer.opt.trade'] ?? 0) + (g.yearActions['computer.opt.yolo'] ?? 0)
  let p = 0.008 + 0.05 * share + 0.004 * freq
  p *= Math.max(0.3, 1.3 - c.hidden.willpower / 100)
  if (!chance(g, Math.min(0.12, p))) return
  c.conditions.push({ id: uid(g, 'c'), name: GAMBLING_ADDICTION, kind: 'addiction', severity: randInt(g, 20, 35), yearsHad: 0, curable: true, diagnosed: true, age: c.age })
  addHidden(g, 'willpower', -5)
  log(g, 'I got hooked on trading options. It turns out it is just gambling with charts.', 'bad')
  remember(g, 'Developed a gambling addiction from trading options.')
  notice(
    g,
    'Hooked',
    pick(g, [
      'You check option prices in the shower. You check them at funerals. You have developed a gambling addiction; the casino just happens to be your brokerage app.',
      'You told yourself it was "investing." Your heart rate says otherwise. You have developed a gambling addiction.',
      'You now refer to your savings as "dry powder." You have developed a gambling addiction.',
    ]),
    { emoji: '\u{1F3B0}', tone: 'bad' },
  )
}

// ---------------------------------------------------------------------------
// Trade flows: direction → strike → size

const DIR_SCRIPT = 'computer.money.opt.dir'
const STRIKE_SCRIPT = 'computer.money.opt.strike'
const SIZE_SCRIPT = 'computer.money.opt.size'
const YOLO_DIR_SCRIPT = 'computer.money.yolo.dir'
const YOLO_SIZE_SCRIPT = 'computer.money.yolo.size'

interface Flow {
  mode: OptionMode
  side: 'buy' | 'sell'
  dir?: OptionDir
  strike?: OptionStrike
  parentId?: string
}

function asFlow(data: Json | undefined): Flow | null {
  if (!isRecord(data)) return null
  const mode = str(data.mode) as OptionMode
  if (mode !== 'real' && mode !== 'paper' && mode !== 'parent') return null
  const side = data.side === 'sell' ? 'sell' : 'buy'
  const dir = data.dir === 'call' || data.dir === 'put' ? data.dir : undefined
  const strike = data.strike === 'atm' || data.strike === 'otm' || data.strike === 'lotto' ? data.strike : undefined
  return { mode, side, dir, strike, parentId: str(data.parentId) || undefined }
}

function flowJson(f: Flow): Json {
  const o: { [key: string]: Json } = { mode: f.mode, side: f.side }
  if (f.dir) o.dir = f.dir
  if (f.strike) o.strike = f.strike
  if (f.parentId) o.parentId = f.parentId
  return o
}

/** Can this flow still trade (alive, free, computer, parent still there...)? */
function flowOk(g: GameState, f: Flow): boolean {
  if (!canAct(g)) return false
  const c = g.character
  if (f.mode === 'real') return c.age >= 18 && !!moneyState(g).broker
  if (f.mode === 'parent') {
    const p = getPerson(g, f.parentId)
    return c.age < 18 && !!p && p.alive
  }
  return c.age >= OPTIONS_MIN_AGE
}

/**
 * The most a teen dares to move in a parent's account per trade: a slice of it, and never more
 * than a kid-sized sum (anything bigger shows up on the statement the same day).
 */
function parentStakeCap(g: GameState, p: Person): number {
  return Math.min(Math.round(dollars(p.money) * 0.15), local(g, 1_500))
}

/** Cash available to this flow (virtual for paper, the parent's for 'parent'). */
function purse(g: GameState, st: MoneyState, f: Flow): number {
  if (f.mode === 'paper') return dollars(st.paperCash)
  if (f.mode === 'parent') {
    const p = getPerson(g, f.parentId)
    return p ? parentStakeCap(g, p) : 0
  }
  return dollars(g.character.money)
}

function whose(g: GameState, f: Flow): string {
  if (f.mode === 'paper') return 'paper'
  if (f.mode === 'parent') {
    const p = getPerson(g, f.parentId)
    return p ? `your ${relationLabel(p).toLowerCase()}'s` : 'the borrowed'
  }
  return 'your'
}

function startIndexTrade(g: GameState, f: Flow): void {
  const inf = info(g)
  const st = moneyState(g)
  if (openCount(st) >= MAX_POSITIONS) {
    notice(g, 'Too Many Positions', `You already have ${MAX_POSITIONS} open option positions. Even your broker's risk department sent a worried emoji. Wait for them to settle at the end of the year.`, { emoji: '\u{1F4CB}' })
    return
  }
  const sell = f.side === 'sell'
  const text = sell
    ? `Selling options means earning a premium if the ${inf.ex.index} stays calm, and paying up if it moves hard against you. Which do you want to sell?`
    : `The ${inf.ex.index} settles your trade at the end of the year. Which way is it going?`
  const choices: ChoiceOption[] = sell
    ? [
        { id: 'put', label: `Sell puts (bet it won't crash)`, emoji: '\u{1F6E1}\u{FE0F}' },
        { id: 'call', label: `Sell calls (bet it won't rocket)`, emoji: '\u{1F9CA}' },
        { id: 'cancel', label: 'Never mind', emoji: '\u{1F645}' },
      ]
    : [
        { id: 'call', label: `Calls: the ${inf.ex.index} goes up`, emoji: '\u{1F4C8}' },
        { id: 'put', label: `Puts: the ${inf.ex.index} goes down`, emoji: '\u{1F4C9}' },
        { id: 'cancel', label: 'Never mind', emoji: '\u{1F645}' },
      ]
  hintDirection(g, choices, sell ? 'sell' : 'buy', inf.ex.index)
  scriptChoice(g, DIR_SCRIPT, sell ? 'Sell Options' : f.mode === 'paper' ? 'Paper Trade' : 'Buy Options', text, choices, { emoji: sell ? '\u{1F9FE}' : '\u{1F4CA}', data: flowJson(f) })
}

defineScript(DIR_SCRIPT, (g, choice, data) => {
  const f = asFlow(data)
  if (!f || choice === 'cancel' || (choice !== 'call' && choice !== 'put') || !flowOk(g, f)) return
  f.dir = choice
  const inf = info(g)
  const strikes: OptionStrike[] = ['atm', 'otm', 'lotto']
  const st = moneyState(g)
  const extra = spreadFor(st, f)
  const lines = strikes.map((s) => {
    const price = optionPrice(inf, choice, s, st.skill, f.side, extra)
    return f.side === 'buy'
      ? `${strikeLabel(inf, choice, s)}: every ${formatMoney(1)} of premium controls about ${shortMoney(1 / price)} of the index.`
      : `${strikeLabel(inf, choice, s)}: you collect about ${formatMoney(price * 1000)} for every ${formatMoney(1_000)} you put on the hook.`
  })
  scriptChoice(
    g,
    STRIKE_SCRIPT,
    'Pick a Strike',
    `${f.side === 'buy' ? 'Cheaper options need a bigger move to pay off.' : 'Further out = smaller premium, but a crash still hurts.'}${extra > 0 ? ` ${st.broker || 'Your broker'} has flagged you as a sharp trader, so its market makers quote you ${Math.round(extra * 100)}% worse prices than usual.` : ''}\n\n${lines.join('\n')}`,
    [
      ...strikes.map((s) => ({ id: s, label: strikeLabel(inf, choice, s), emoji: s === 'atm' ? '\u{1F3AF}' : s === 'otm' ? '\u{1F3B2}' : '\u{1F39F}\u{FE0F}' })),
      { id: 'cancel', label: 'Never mind', emoji: '\u{1F645}' },
    ],
    { emoji: '\u{1F3AF}', data: flowJson(f) },
  )
})

defineScript(STRIKE_SCRIPT, (g, choice, data) => {
  const f = asFlow(data)
  if (!f || !f.dir || choice === 'cancel' || !['atm', 'otm', 'lotto'].includes(choice) || !flowOk(g, f)) return
  f.strike = choice as OptionStrike
  const st = moneyState(g)
  const lo = minTrade(g)
  if (f.side === 'sell') {
    // Brokers want 20% of the exposure as collateral.
    const max = Math.min(dollars(f.mode === 'paper' ? st.paperCash : g.character.money) * 5, local(g, 20_000_000))
    if (max < lo * 10) {
      notice(g, 'Not Enough Collateral', `${f.mode === 'paper' ? 'Your paper account' : 'Your broker'} wants at least ${formatMoney(Math.ceil((lo * 10) / 5))} of collateral before you can sell options.`, { emoji: '\u{1F6AB}' })
      return
    }
    scriptInput(g, {
      title: 'How Much Exposure?',
      emoji: '\u{1F9FE}',
      text:
        f.mode === 'paper'
          ? `How much of the index (in pretend money) do you want to be on the hook for? You can go up to ${formatMoney(max)} (5x your paper cash). The premium is yours at the end of the year if the index behaves; a big move against you eats it and then some.`
          : `How much of the index do you want to be on the hook for? You can go up to ${formatMoney(max)} (5x your cash). Your broker holds the premium as collateral until the options expire at the end of the year. A big move against you is paid out of the premium, then your pocket, then a margin loan.`,
      input: 'number',
      money: true,
      min: lo * 10,
      max,
      defaultValue: String(Math.max(lo * 10, Math.round(max / 10))),
      scriptId: SIZE_SCRIPT,
      data: flowJson(f),
    })
    return
  }
  const cash = purse(g, st, f)
  const max = Math.min(Math.floor(cash / 1.01), maxPremium(g))
  if (max < lo) {
    notice(g, 'Not Enough Money', `You need at least ${formatMoney(lo + fee(lo))} in ${whose(g, f)} account to buy options.`, { emoji: '\u{1F4B8}' })
    return
  }
  scriptInput(g, {
    title: 'Position Size',
    emoji: '\u{1F4B5}',
    text: `How much premium will you spend on ${dirWord(f.dir)}? The most you can lose is what you put in (plus a 1% commission). ${f.mode === 'paper' ? `Paper balance: ${formatMoney(st.paperCash)}.` : `Available: ${formatMoney(max)}.`}`,
    input: 'number',
    money: true,
    min: lo,
    max,
    defaultValue: String(Math.max(lo, Math.round(max / 10))),
    scriptId: SIZE_SCRIPT,
    data: flowJson(f),
  })
})

function parseAmount(v: string, lo: number, hi: number): number | null {
  const n = Number(String(v).replace(/[^0-9.]/g, ''))
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(clampNum(n, lo, hi))
}

defineScript(SIZE_SCRIPT, (g, value, data) => {
  const f = asFlow(data)
  if (!f || !f.dir || !f.strike || !flowOk(g, f)) return
  const st = moneyState(g)
  if (openCount(st) >= MAX_POSITIONS) return
  const inf = info(g)
  const lo = minTrade(g)
  const k = strikeOffset(inf, f.dir, f.strike)
  if (f.side === 'sell') {
    const max = Math.min(dollars(f.mode === 'paper' ? st.paperCash : g.character.money) * 5, local(g, 20_000_000))
    const units = parseAmount(value, lo * 10, Math.max(lo * 10, max))
    if (!units || max < lo * 10) return
    if (f.mode === 'real' && !useYearAction(g, 'computer.opt.trade', 4)) return tooMuch(g)
    if (f.mode === 'paper' && !useYearAction(g, 'computer.opt.paper', 5)) return tooMuch(g)
    const premium = dollars(units * optionPrice(inf, f.dir, f.strike, st.skill, 'sell', spreadFor(st, f)))
    const cost = f.mode === 'paper' ? 0 : Math.min(fee(premium), dollars(g.character.money))
    // The broker holds the premium as collateral until expiry: it nets out at settlement, so it
    // can't be spent (or left to heirs) before the options are paid for.
    if (f.mode !== 'paper') {
      addMoney(g, -cost)
      st.trades += 1
      count(g, 'optionTrades')
    }
    addScreenTime(g, 1)
    st.positions.push({ id: uid(g, 'opt'), mode: f.mode, side: 'sell', dir: f.dir, strike: f.strike, k, units, premium, year: g.year, exKey: inf.key, index: inf.ex.index, countryId: g.character.countryId, parentId: '', fx: indexShockFactor(g, inf.key, g.year) })
    gainSkill(st, f.mode === 'paper' ? 2 : 1, f.mode === 'paper' ? 4 : 3, g)
    log(g, `I sold ${formatMoney(units)} worth of ${f.dir} options on the ${inf.ex.index}${f.mode === 'paper' ? ' (paper trading)' : ''} for a ${formatMoney(premium)} premium.`)
    notice(
      g,
      'Options Sold',
      `You sold ${dirWord(f.dir)} on ${formatMoney(units)} of the ${inf.ex.index} for a ${formatMoney(premium)} premium${f.mode === 'paper' ? ' in paper money' : `, held by your broker until they expire at the end of the year${cost ? ` (plus a ${formatMoney(cost)} commission, paid now)` : ''}`}. If the index ${f.dir === 'put' ? `falls more than ${absPct(k, 0)}` : `rises more than ${absPct(k, 0)}`} this year, you pay the difference. Traders call this "picking up pennies in front of a steamroller."`,
      { emoji: '\u{1F9FE}' },
    )
    return
  }
  const cash = purse(g, st, f)
  const max = Math.min(Math.floor(cash / 1.01), maxPremium(g))
  const premium = parseAmount(value, lo, Math.max(lo, max))
  if (!premium || max < lo) return
  const limitKey = f.mode === 'paper' ? 'computer.opt.paper' : 'computer.opt.trade'
  if (!useYearAction(g, limitKey, f.mode === 'paper' ? 5 : 4)) return tooMuch(g)
  const units = dollars(premium / optionPrice(inf, f.dir, f.strike, st.skill, 'buy', spreadFor(st, f)))
  const cost = f.mode === 'paper' ? 0 : fee(premium)
  let parent: Person | undefined
  if (f.mode === 'paper') st.paperCash = dollars(st.paperCash - premium)
  else if (f.mode === 'parent') {
    parent = getPerson(g, f.parentId)
    if (!parent) return
    parent.money = Math.round(parent.money - premium - cost)
    count(g, 'optionTrades')
  } else {
    const before = g.character.money
    addMoney(g, -(premium + cost))
    st.trades += 1
    count(g, 'optionTrades')
    maybeTradingAddiction(g, premium, before)
  }
  addScreenTime(g, 1)
  st.positions.push({ id: uid(g, 'opt'), mode: f.mode, side: 'buy', dir: f.dir, strike: f.strike, k, units, premium, year: g.year, exKey: inf.key, index: inf.ex.index, countryId: g.character.countryId, parentId: parent?.id ?? '', fx: indexShockFactor(g, inf.key, g.year) })
  gainSkill(st, f.mode === 'paper' ? 2 : 1, f.mode === 'paper' ? 4 : 3, g)
  const lev = premium > 0 ? units / premium : 0
  const where = f.mode === 'paper' ? ' with paper money' : f.mode === 'parent' && parent ? ` from ${parent.firstName}'s brokerage account` : ''
  log(g, `I bought ${formatMoney(premium)} of ${f.dir} options on the ${inf.ex.index}${where}.`)
  notice(
    g,
    'Position Opened',
    `You bought ${formatMoney(premium)} of ${f.strike === 'lotto' ? 'lottery-ticket ' : f.strike === 'otm' ? 'out-of-the-money ' : ''}${dirWord(f.dir)} on the ${inf.ex.index}${where} (about ${lev >= 10 ? Math.round(lev) : lev.toFixed(1)}x leverage). They settle when the year ends. ${pick(g, ['Now you just have to refresh the chart 400 times a day.', 'You whispered "to the moon" at your screen. Your screen did not respond.', 'Your stomach is already doing its own price action.'])}${f.mode === 'parent' ? ' You cleared the browser history, just in case.' : ''}`,
    { emoji: f.dir === 'call' ? '\u{1F4C8}' : '\u{1F4C9}' },
  )
})

function tooMuch(g: GameState): void {
  notice(g, 'Market Closed', pick(g, ["You've traded enough this year. Your broker's app now opens with a meditation prompt.", 'Your eyes are twitching from staring at candlestick charts. Take a break until next year.', "You've hit your trading limit for the year. The market will still be there next year. Probably."]), { emoji: '\u{1F6D1}' })
}

// ---------------------------------------------------------------------------
// 0DTE YOLO: options that expire today

function startYolo(g: GameState, f: Flow): void {
  const inf = info(g)
  scriptChoice(
    g,
    YOLO_DIR_SCRIPT,
    '0DTE YOLO',
    `These ${inf.ex.index} options expire at today's close. By dinner you'll be up big or holding a very expensive lesson. Which way?`,
    [
      { id: 'call', label: 'Calls (up by the close)', emoji: '\u{1F680}' },
      { id: 'put', label: 'Puts (down by the close)', emoji: '\u{1F43B}' },
      { id: 'cancel', label: 'Never mind', emoji: '\u{1F645}' },
    ],
    { emoji: '\u{1F3B2}', data: flowJson(f) },
  )
}

defineScript(YOLO_DIR_SCRIPT, (g, choice, data) => {
  const f = asFlow(data)
  if (!f || (choice !== 'call' && choice !== 'put') || !flowOk(g, f)) return
  f.dir = choice
  const st = moneyState(g)
  const lo = minTrade(g)
  const max = Math.min(Math.floor(purse(g, st, f) / 1.01), maxPremium(g))
  if (max < lo) {
    notice(g, 'Not Enough Money', `You need at least ${formatMoney(lo + fee(lo))} to YOLO. Even recklessness has a minimum.`, { emoji: '\u{1F4B8}' })
    return
  }
  scriptInput(g, {
    title: 'How Much Are You Risking?',
    emoji: '\u{1F3B2}',
    text: `Most 0DTE options expire worthless. ${f.mode === 'paper' ? `Paper balance: ${formatMoney(st.paperCash)}.` : `You can risk up to ${formatMoney(max)}.`}`,
    input: 'number',
    money: true,
    min: lo,
    max,
    defaultValue: String(Math.max(lo, Math.round(max / 20))),
    scriptId: YOLO_SIZE_SCRIPT,
    data: flowJson(f),
  })
})

/** Payout multiple of a 0DTE option for an intraday move z (in standard deviations). */
export function yoloMultiple(dir: OptionDir, z: number, skill: number): number {
  const m = Math.max(0.1, 0.2 - clampNum(skill, 0, 100) * 0.001)
  const sgn = dir === 'call' ? 1 : -1
  return Math.min(10, Math.max(0, sgn * z) / (HALF_MEAN_ABS * (1 + m)))
}

defineScript(YOLO_SIZE_SCRIPT, (g, value, data) => {
  const f = asFlow(data)
  if (!f || !f.dir || !flowOk(g, f)) return
  const st = moneyState(g)
  const lo = minTrade(g)
  const max = Math.min(Math.floor(purse(g, st, f) / 1.01), maxPremium(g))
  const premium = parseAmount(value, lo, Math.max(lo, max))
  if (!premium || max < lo) return
  if (!useYearAction(g, f.mode === 'paper' ? 'computer.opt.paper' : 'computer.opt.yolo', f.mode === 'paper' ? 5 : 3)) return tooMuch(g)
  const inf = info(g)
  addScreenTime(g, 1)
  const z = normal(g)
  const mult = yoloMultiple(f.dir, z, st.skill)
  const payout = dollars(premium * mult)
  const net = payout - premium
  const cost = f.mode === 'paper' ? 0 : fee(premium)
  const move = z * (clampNum(inf.ex.volatility, 0.05, 0.8) / 16)
  gainSkill(st, f.mode === 'paper' ? 2 : 1, f.mode === 'paper' ? 3 : 2, g)
  let tax = 0
  let parentLine = ''
  if (f.mode === 'paper') {
    st.paperCash = dollars(st.paperCash + net)
    st.paperPnl = Math.round(st.paperPnl + net)
  } else if (f.mode === 'parent') {
    const p = getPerson(g, f.parentId)
    if (!p) return
    count(g, 'optionTrades')
    parentLine = parentTrade(g, st, p, premium, cost, payout, true)
  } else {
    const before = g.character.money
    addMoney(g, -(premium + cost))
    st.trades += 1
    st.pnl = Math.round(st.pnl + net - cost)
    count(g, 'optionTrades')
    tax = bankGain(g, st, net - cost, payout, true)
    maybeTradingAddiction(g, premium, before)
  }
  const day = `The ${inf.ex.index} closed ${pct(move, 2)} today.`
  const paper = f.mode === 'paper' ? ' (in paper money)' : f.mode === 'parent' ? ' (in the borrowed account)' : ''
  let title: string
  let text: string
  if (payout <= 0) {
    title = 'Expired Worthless'
    text = `${day} Your ${formatMoney(premium)} of 0DTE ${dirWord(f.dir)} expired worthless${paper}. ${pick(g, ['You stared at the screen until it went dark. So did your soul.', 'You posted a screenshot of the loss for internet points. You got three.', 'The market maker who sold them to you is having a lovely evening.'])}`
  } else if (net < 0) {
    title = 'Bled Out'
    text = `${day} Your ${dirWord(f.dir)} clawed back ${formatMoney(payout)} of your ${formatMoney(premium)}${paper}. A loss, but a dignified one.`
  } else if (mult >= 3) {
    title = 'Printed!'
    text = `${day} Your ${formatMoney(premium)} of ${dirWord(f.dir)} turned into ${formatMoney(payout)}${paper}! You did a lap around the house. ${pick(g, ['You are now insufferable at parties.', 'You briefly considered quitting everything to do this full time. Briefly.', 'Somewhere, a market maker sighed.'])}`
  } else {
    title = 'Green Day'
    text = `${day} Your ${dirWord(f.dir)} paid ${formatMoney(payout)} on ${formatMoney(premium)}${paper}. A win's a win.`
  }
  if (tax > 0) text += ` (${formatMoney(tax)} went to taxes.)`
  if (parentLine) text += `\n\n${parentLine}`
  log(g, payout > premium ? `I made ${formatMoney(net)} on a same-day options trade${paper}.` : `I lost ${formatMoney(premium - payout)} on a same-day options trade${paper}.`, payout > premium ? 'good' : 'bad')
  notice(g, title, text, { emoji: payout > premium ? '\u{1F4B0}' : '\u{1F4A5}', tone: payout > premium ? 'good' : 'bad' })
})

/**
 * Money moves for a trade in a parent's account: the parent eats losses; the teen skims any
 * profit only if nobody notices (a parent who notices keeps the winnings and makes the teen repay
 * what was lost). Returns a sentence when the parent notices ('' otherwise).
 */
function parentTrade(g: GameState, st: MoneyState, p: Person, premium: number, cost: number, payout: number, payNow: boolean): string {
  if (payNow) p.money = Math.round(p.money - premium - cost)
  const profit = Math.max(0, payout - premium)
  const parentLoss = Math.max(0, premium + cost - payout)
  const noticeP = profit > 0 ? 0.25 : clampNum(0.2 + (0.6 * parentLoss) / Math.max(500, p.money * 0.05), 0.2, 0.9)
  if (!chance(g, noticeP)) {
    p.money = Math.round(p.money + Math.min(payout, premium))
    if (profit > 0) {
      bankGain(g, st, profit, profit, payNow)
      addHidden(g, 'karma', -2)
      log(g, `I made ${formatMoney(profit)} trading options in my ${relationLabel(p).toLowerCase()}'s account and quietly moved it to mine.`, 'good')
    }
    return ''
  }
  // Caught: everything the trade paid stays in the parent's account.
  p.money = Math.round(p.money + payout)
  return parentFindsTrades(g, p, parentLoss, profit)
}

function parentFindsTrades(g: GameState, p: Person, loss: number, profit: number): string {
  const rel = relationLabel(p).toLowerCase()
  const his = p.gender === 'male' ? 'his' : 'her'
  addRelationship(p, -randInt(g, 10, 20))
  let repay = ''
  if (loss > 0) {
    const paid = Math.min(dollars(g.character.money), dollars(loss))
    if (paid > 0) {
      addMoney(g, -paid)
      p.money = Math.round(p.money + paid)
      repay = ` You had to pay back ${formatMoney(paid)} of the ${formatMoney(loss)} you lost.`
    } else repay = ` You couldn't pay back a cent of the ${formatMoney(loss)}, so you'll be doing chores until you're thirty.`
  }
  const grounded = parentsCatch(g, 'trading options with a borrowed login', loss > 0 ? 2 : 1, 6)
  count(g, 'caughtTrading')
  const opener =
    loss > 0
      ? `Your ${rel} ${p.firstName} opened ${his} brokerage statement and found ${formatMoney(loss)} missing and a dozen trades labeled "YOLO."`
      : `Your ${rel} ${p.firstName} noticed ${formatMoney(profit)} of winning option trades ${p.gender === 'male' ? 'he' : 'she'} definitely never made. ${p.gender === 'male' ? 'He' : 'She'} kept the winnings in ${his} account, "for your college fund."`
  return `${opener}${repay} ${grounded}`.trim()
}

// ---------------------------------------------------------------------------
// Settlement at age-up

interface SettleTotals {
  realNet: number
  paperNet: number
  parentNet: number
  margin: number
  lines: string[]
  popupText: string[]
  bigWin: boolean
}

/** Settle every position opened in an earlier year. Returns the news it wants to tell. */
export function settleOptions(g: GameState, st: MoneyState): News | null {
  const due = st.positions.filter((p) => p.year < g.year)
  if (!due.length) return null
  st.positions = st.positions.filter((p) => p.year >= g.year)
  const t: SettleTotals = { realNet: 0, paperNet: 0, parentNet: 0, margin: 0, lines: [], popupText: [], bigWin: false }
  const moves = new Map<string, number>()
  let staked = 0
  for (const pos of due) {
    const ret = settleMove(g, pos)
    moves.set(pos.index, ret)
    const pay = positionPayoff(pos, ret)
    if (pos.mode === 'paper') {
      const net = pos.side === 'buy' ? pay - pos.premium : pos.premium - pay
      st.paperCash = dollars(st.paperCash + (pos.side === 'buy' ? pay : net))
      st.paperPnl = Math.round(st.paperPnl + net)
      t.paperNet += net
      continue
    }
    if (pos.mode === 'parent') {
      const p = getPerson(g, pos.parentId)
      if (!p || !p.alive) {
        // The account was frozen with the estate: whatever it paid went there, not to you.
        t.parentNet += pay - pos.premium
        continue
      }
      const caught = parentTrade(g, st, p, pos.premium, 0, pay, false)
      t.parentNet += pay - pos.premium
      if (caught) t.popupText.push(caught)
      continue
    }
    staked += pos.premium
    if (pos.side === 'buy') {
      const net = pay - pos.premium
      bankGain(g, st, net, pay, false)
      st.pnl = Math.round(st.pnl + net)
      t.realNet += net
      if (pay >= pos.premium * 5 && net >= local(g, 1_000)) t.bigWin = true
    } else {
      // The held premium pays the bill first; the rest comes from cash, then a margin loan.
      const net = pos.premium - pay
      if (net >= 0) bankGain(g, st, net, net, false)
      else {
        st.lossCarry = dollars(st.lossCarry - net)
        const financed = payOrBorrow(g, -net, `${st.broker || brokerName(g.character.countryId)} margin desk`)
        if (financed > 0) {
          t.margin += financed
          count(g, 'marginCalls')
        }
      }
      st.pnl = Math.round(st.pnl + net)
      t.realNet += net
    }
  }
  // A good year on your own account makes the market makers wary (wider spreads next time).
  noteSharp(st, staked, staked + t.realNet)
  const moveText = [...moves].map(([idx, r]) => `The ${idx} ${r >= 0 ? 'rose' : 'fell'} ${absPct(r, 1)}`).join('; ')
  const parts: string[] = []
  if (t.realNet !== 0 || due.some((p) => p.mode === 'real')) parts.push(`your options ${t.realNet >= 0 ? `made ${formatMoney(t.realNet)}` : `lost ${formatMoney(-t.realNet)}`}`)
  if (due.some((p) => p.mode === 'parent')) parts.push(`the trades in your parent's account ${t.parentNet >= 0 ? `made ${formatMoney(t.parentNet)}` : `lost ${formatMoney(-t.parentNet)}`}`)
  if (due.some((p) => p.mode === 'paper')) parts.push(`your paper trades ${t.paperNet >= 0 ? `made ${formatMoney(t.paperNet)}` : `lost ${formatMoney(-t.paperNet)}`} of pretend money`)
  const summary = `${moveText}. This year ${parts.join(', ')}.`
  const marginText = t.margin > 0 ? ` The options you sold blew up: you couldn't cover the bill, so ${formatMoney(t.margin)} became a margin loan you'll be paying off for years.` : ''
  const logLine = t.margin > 0 ? `My short options blew up and left me with ${formatMoney(t.margin)} of margin debt.` : `${moveText}: my options ${t.realNet + t.parentNet + t.paperNet >= 0 ? 'came out ahead' : 'lost money'}.`
  const notable = t.margin > 0 || t.popupText.length > 0 || t.bigWin || Math.abs(t.realNet) >= local(g, 2_000)
  if (t.realNet !== 0) addStat(g, 'happiness', t.realNet > 0 ? randInt(g, 2, 6) : -randInt(g, 2, 6))
  return {
    priority: t.popupText.length ? 60 : t.margin > 0 ? 70 : notable ? 40 : 5,
    popup: (gg) => {
      log(gg, logLine, t.realNet + t.parentNet < 0 ? 'bad' : 'good')
      if (!notable) return
      const title = t.margin > 0 ? 'Margin Call' : t.popupText.length ? 'Busted Trading' : t.realNet >= 0 ? 'Options Settled' : 'Options Expired'
      const extra = t.popupText.length ? `\n\n${t.popupText.join('\n\n')}` : ''
      notice(gg, title, `${summary}${marginText}${extra}`, { emoji: t.margin > 0 ? '\u{1F4E2}' : t.realNet >= 0 ? '\u{1F4C8}' : '\u{1F4C9}', tone: t.realNet + t.parentNet >= 0 && t.margin === 0 ? 'good' : 'bad' })
    },
    quiet: (gg) => log(gg, logLine, t.realNet + t.parentNet < 0 ? 'bad' : 'good'),
  }
}

/** Addicted traders keep feeding the machine (log only). */
export function compulsiveTrading(g: GameState, st: MoneyState): void {
  const c = g.character
  if (c.prison || !st.broker || st.trades <= 0 || c.money < local(g, 500)) return
  if (!c.conditions.some((x) => x.name === GAMBLING_ADDICTION) || !chance(g, 0.35)) return
  const lost = dollars(c.money * (0.03 + randInt(g, 0, 9) / 100))
  if (lost <= 0) return
  addMoney(g, -lost)
  st.pnl = Math.round(st.pnl - lost)
  st.lossCarry = dollars(st.lossCarry + lost)
  log(g, pick(g, [`I lost ${formatMoney(lost)} revenge-trading options at 3 a.m.`, `I promised myself I'd stop trading. Then I lost ${formatMoney(lost)} on "one last play."`, `My trading habit ate ${formatMoney(lost)} this year.`]), 'bad')
}

// ---------------------------------------------------------------------------
// Menu

function parentForTrading(g: GameState): Person | undefined {
  const p = richestParent(g)
  return p && p.alive && p.money >= local(g, 2_000) ? p : undefined
}

function positionsText(st: MoneyState): string {
  if (!st.positions.length) return 'No open positions.'
  return st.positions
    .map((p) => `${p.side === 'sell' ? 'Short' : 'Long'} ${p.dir}s on the ${p.index} (${p.strike === 'atm' ? 'at the money' : p.strike === 'otm' ? 'out of the money' : 'lottery ticket'}, ${formatMoney(p.side === 'buy' ? p.premium : p.units)}${p.mode === 'paper' ? ', paper' : p.mode === 'parent' ? ", parent's account" : ''})`)
    .join('\n')
}

function adultReal(g: GameState): string | null {
  return blockReason(g, 18) ?? (readState(g).broker ? null : 'Open a brokerage account first.')
}

export function optionsMenu(): MenuGroup {
  return {
    type: 'menu',
    id: 'computer.options',
    label: 'Options Trading',
    emoji: '\u{1F4C8}',
    subtitle: (g) => {
      const st = readState(g)
      if (g.character.age < 18) return `Paper trading · skill ${Math.round(st.skill)}/100`
      return st.broker ? `${st.broker} · lifetime ${st.pnl >= 0 ? '+' : ''}${shortMoney(st.pnl)}` : `Calls and puts on the ${exchangeInfo(g.character.countryId).ex.index}`
    },
    visible: (g) => g.character.alive && g.character.age >= OPTIONS_MIN_AGE,
    disabledReason: (g) => blockReason(g, OPTIONS_MIN_AGE),
    header: (g) => {
      const inf = exchangeInfo(g.character.countryId)
      return `Bet on the ${inf.ex.index} (${inf.ex.code}). Calls pay when it rises, puts when it falls; index options settle when the year ends. Most options expire worthless.`
    },
    children: (g) => {
      const st = readState(g)
      const c = g.character
      const nodes: MenuNode[] = []
      nodes.push({
        type: 'info',
        id: 'computer.options.status',
        emoji: '\u{1F9EE}',
        text: `Trading skill ${Math.round(st.skill)}/100${st.trades ? ` · real P&L ${st.pnl >= 0 ? '+' : ''}${formatMoney(st.pnl)}` : ''} · paper P&L ${st.paperPnl >= 0 ? '+' : ''}${formatMoney(st.paperPnl)}${st.sharp >= 0.5 ? ` · flagged as a sharp trader (spreads +${Math.round(sharpSpread(st) * 100)}%)` : ''}\n${positionsText(st)}`,
      })
      const gut = instinctRow(g)
      if (gut) nodes.push(gut)
      if (c.age >= 18) {
        if (!st.broker) {
          const name = brokerName(c.countryId)
          nodes.push({
            type: 'action',
            id: 'computer.options.open',
            label: `Open an Account at ${name}`,
            emoji: '\u{1F3E6}',
            subtitle: 'Free to open · 1% commission per trade',
            disabledReason: (gg) => blockReason(gg, 18),
            run: (gg) => {
              if (!canAct(gg) || gg.character.age < 18) return
              const s = moneyState(gg)
              if (s.broker) return
              s.broker = brokerName(gg.character.countryId)
              log(gg, `I opened a brokerage account at ${s.broker}.`)
              notice(gg, 'Account Open', `Welcome to ${s.broker}! You ticked a box saying you "understand the risks of options trading." You did not read it. Nobody does.`, { emoji: '\u{1F3E6}' })
            },
          })
        } else {
          nodes.push(
            {
              type: 'action',
              id: 'computer.options.buy',
              label: 'Buy Index Options',
              emoji: '\u{1F4CA}',
              subtitle: 'Calls or puts, settled at year end',
              disabledReason: adultReal,
              run: (gg) => {
                if (canAct(gg)) startIndexTrade(gg, { mode: 'real', side: 'buy' })
              },
            },
            {
              type: 'action',
              visible: (gg) => eraOpen(gg, ZERO_DTE_GATE),
              id: 'computer.options.yolo',
              label: '0DTE YOLO',
              emoji: '\u{1F3B2}',
              subtitle: 'Options that expire today',
              disabledReason: adultReal,
              run: (gg) => {
                if (canAct(gg)) startYolo(gg, { mode: 'real', side: 'buy' })
              },
            },
            {
              type: 'action',
              id: 'computer.options.sell',
              label: 'Sell Options on Margin',
              emoji: '\u{1F9FE}',
              subtitle: 'Earn a premium, pray all year',
              disabledReason: adultReal,
              run: (gg) => {
                if (canAct(gg)) startIndexTrade(gg, { mode: 'real', side: 'sell' })
              },
            },
            stockBetsMenu(),
          )
        }
      } else {
        const p = parentForTrading(g)
        nodes.push({
          type: 'action',
          id: 'computer.options.parent',
          label: p ? `Borrow ${p.firstName}'s Brokerage Login` : "Borrow a Parent's Brokerage Login",
          emoji: '\u{1F511}',
          subtitle: 'Real money. Not yours.',
          disabledReason: (gg) => blockReason(gg, OPTIONS_MIN_AGE) ?? (parentForTrading(gg) ? null : "Neither of your parents has a brokerage account worth raiding."),
          run: (gg) => {
            const pp = parentForTrading(gg)
            if (!canAct(gg) || !pp || gg.character.age >= 18) return
            scriptChoice(gg, PARENT_SCRIPT, 'Borrowed Login', `${pp.firstName}'s password is on a sticky note under the keyboard. You could trade options with real money from ${pp.gender === 'male' ? 'his' : 'her'} account. What could possibly go wrong?`, [
              { id: 'index', label: 'Buy index options', emoji: '\u{1F4CA}' },
              ...(eraOpen(gg, ZERO_DTE_GATE) ? [{ id: 'yolo', label: '0DTE YOLO', emoji: '\u{1F3B2}' }] : []),
              { id: 'cancel', label: 'Put the sticky note back', emoji: '\u{1F645}' },
            ], { emoji: '\u{1F511}', data: { parentId: pp.id } })
          },
        })
      }
      nodes.push({
        type: 'menu',
        id: 'computer.options.paper',
        label: 'Paper Trading',
        emoji: '\u{1F4DD}',
        subtitle: (gg) => `Fake money: ${formatMoney(readState(gg).paperCash)}`,
        header: () => "Practice with pretend money. Nothing real is at stake, so it's the only kind of trading that can't ruin you.",
        children: () => [
          {
            type: 'action',
            id: 'computer.options.paper.buy',
            label: 'Paper Index Options',
            emoji: '\u{1F4CA}',
            run: (gg) => {
              if (canAct(gg)) startIndexTrade(gg, { mode: 'paper', side: 'buy' })
            },
          },
          {
            type: 'action',
            visible: (gg) => eraOpen(gg, ZERO_DTE_GATE),
            id: 'computer.options.paper.yolo',
            label: 'Paper 0DTE',
            emoji: '\u{1F3B2}',
            run: (gg) => {
              if (canAct(gg)) startYolo(gg, { mode: 'paper', side: 'buy' })
            },
          },
          {
            type: 'action',
            id: 'computer.options.paper.sell',
            label: 'Paper-Sell Options',
            emoji: '\u{1F9FE}',
            run: (gg) => {
              if (canAct(gg)) startIndexTrade(gg, { mode: 'paper', side: 'sell' })
            },
          },
          {
            type: 'action',
            id: 'computer.options.paper.reset',
            label: 'Reset Paper Account',
            emoji: '\u{1F504}',
            subtitle: `Back to ${formatMoney(PAPER_START)} of pretend money`,
            disabledReason: (gg) => (readState(gg).positions.some((p) => p.mode === 'paper') ? 'Wait until your open paper trades settle.' : null),
            run: (gg) => {
              if (!canAct(gg)) return
              const s = moneyState(gg)
              if (s.positions.some((p) => p.mode === 'paper')) return
              s.paperCash = PAPER_START
              notice(gg, 'Fresh Start', `Your paper account is back to ${formatMoney(PAPER_START)}. If only real life had this button.`, { emoji: '\u{1F504}' })
            },
          },
        ],
      })
      return nodes
    },
  }
}

const PARENT_SCRIPT = defineScript('computer.money.opt.parent', (g, choice, data) => {
  if (!isRecord(data) || choice === 'cancel') return
  const p = getPerson(g, str(data.parentId))
  if (!p || !p.alive || g.character.age >= 18 || !canAct(g)) return
  const f: Flow = { mode: 'parent', side: 'buy', parentId: p.id }
  if (choice === 'yolo') startYolo(g, f)
  else startIndexTrade(g, f)
})

/** For the AI summary. */
export function optionsSummary(st: MoneyState): string {
  const parts: string[] = []
  if (st.trades > 0) parts.push(`trades index options (${st.pnl >= 0 ? 'up' : 'down'} ${shortMoney(Math.abs(st.pnl))} lifetime${st.positions.length ? `, ${st.positions.length} open` : ''})`)
  else if (st.paperPnl !== 0 || st.positions.some((p) => p.mode === 'paper')) parts.push(`paper-trades options (skill ${Math.round(st.skill)}/100)`)
  return parts.join('')
}
