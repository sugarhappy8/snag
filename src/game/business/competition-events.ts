// Competition events: a giant tries to buy you, a rival copies your product, a price war, a
// scandal at a rival, a well-funded newcomer, and antitrust cases against dominant companies
// (fines, settlements, court fights and forced break-ups, by country and era). Every choice gets
// the Business talent's purple hint from the same odds and amounts its resolver uses.
import { seeded } from '../assets'
import { addHidden, count, formatMoney, log, notice, scriptChoice } from '../core'
import { chance, pick, rand } from '../rng'
import { defineScript } from '../scripts'
import { hasTalent } from '../talents'
import type { Asset, ChoiceOption, GameState, Json } from '../types'
import { getCountry } from '../world'
import { dominanceFrom, marketStateOf } from './competition-core'
import { effectiveRegime, marketDef, mergerLimit, type Regime } from './competition-data'
import { familyId } from './competition-roster'
import { antitrustOf, edgeValue, marketOfBiz, marketOwner, marketViewOf, saveMarket, shareText } from './competition'
import { scaledCost } from './competition-moves'
import { techOf } from './deeptech-core'
import { hasSupplyChain, SUPPLY_HIT, SUPPLY_SHIELDED } from './market-reach'
import { placeName } from './market-places'
import { isDeepTech } from './deeptech-state'
import { bizWorth, fxValue, localEcon, staffPower, type Worth } from './economy'
import { sellBusiness } from './exit'
import { industryDef } from './industries'
import { bizOf, findBusiness, totalOutlets, type BizState } from './state'
import { cap, clampN, markBest, money, num, pct, promisePrice, rec, round2, str } from './util'

interface Ctx {
  a: Asset
  b: BizState
  d: Record<string, Json>
}

function ctxOf(g: GameState, data: Json | undefined): Ctx | null {
  const d = rec(data)
  const a = findBusiness(g, str(d?.assetId))
  if (!a || !d) return null
  return { a, b: bizOf(g, a), d }
}

function tell(g: GameState, title: string, text: string, emoji: string, tone: 'good' | 'bad' | 'neutral' = 'neutral'): void {
  notice(g, title, text, { emoji, tone })
}

/** Pay from company cash as a cost of the year (it may go negative; the year-end review deals with that). */
function pay(b: BizState, amount: number): number {
  const n = Math.max(0, Math.round(amount))
  b.cash -= n
  b.yearCosts += n
  return n
}

/** Scores per choice (empty without the talent: no work for nothing). */
function scored(g: GameState, b: BizState, build: (w: Worth) => Record<string, number>): (id: string) => number | null {
  if (!hasTalent(g, 'Business')) return () => null
  const table = build(bizWorth(g, b))
  return (id) => (id in table && Number.isFinite(table[id]) ? table[id] : null)
}

function setEdge(b: BizState, mult: number, until: number, year: number): void {
  const st = marketOfBiz(b)
  st.edge = clampN((st.edgeUntil >= year ? st.edge : 1) * mult, 0.3, 3)
  st.edgeUntil = Math.max(st.edgeUntil >= year ? st.edgeUntil : 0, until)
  saveMarket(b, st)
}

function modRival(b: BizState, id: string, mult: number, until: number): void {
  const st = marketOfBiz(b)
  const cur = st.mods[id]
  st.mods[id] = { mult: clampN((cur && cur.until >= until - 2 ? cur.mult : 1) * mult, 0.1, 5), until: Math.max(until, cur?.until ?? 0) }
  saveMarket(b, st)
}

// ---------------------------------------------------------------------------
// A giant comes knocking

/** Chance a counteroffer 20% higher is accepted. */
const BID_COUNTER = 0.45

/** Chance regulators block a takeover by a rival that would leave it with `combined` of the market. */
export function takeoverBlockP(r: Regime, combined: number): number {
  return combined >= mergerLimit(r) ? clampN(r.strict * 0.9, 0, 0.9) : 0
}

const BID = defineScript('business.comp.bid', (g, choice, data) => {
  const x = ctxOf(g, data)
  if (!x) return
  const { a, b, d } = x
  const offer = num(d.offer)
  const name = str(d.rival, 'a rival')
  const blockP = num(d.blockP)
  const regulator = str(d.regulator, 'the regulators')
  if (choice === 'decline') {
    tell(g, 'Not for Sale', `You told ${name} that ${a.name} is not for sale. They said they would keep an eye on the market.`, '\u{1F645}')
    // Spurned giants compete harder for a while.
    modRival(b, str(d.rivalId), 1.08, g.year + 1)
    return
  }
  const price = choice === 'counter' ? Math.round(offer * 1.2) : offer
  if (choice === 'counter' && !chance(g, BID_COUNTER)) {
    tell(g, 'They Walked', `${name} passed on your counteroffer and walked away.`, '\u{1F6B6}')
    return
  }
  if (chance(g, blockP)) {
    const fee = Math.round(price * 0.03)
    b.cash += fee
    // One-off income like any settlement: on the year's statement and taxed with it.
    b.yearIncome += fee
    log(g, `Regulators blocked ${name}'s takeover of ${a.name}.`, 'neutral')
    tell(g, 'Deal Blocked!', `${cap(regulator)} blocked ${name}'s takeover of ${a.name}: together you'd have had too much of the market. ${name} paid ${formatMoney(fee)} in break-up fees into ${a.name}'s account. You're still the boss.`, '\u{1F6AB}')
    return
  }
  sellBusiness(g, a, b, price, name)
})

function presentBid(g: GameState, a: Asset, b: BizState): void {
  const v = marketViewOf(g, b)
  const top = v.rivals.find((r) => !r.legacy)
  if (!top) return
  const threat = v.history.length >= 2 ? clampN(v.share / Math.max(0.0005, v.history[v.history.length - 2].share) - 1, 0, 1) : 0
  const offer = Math.round(Math.max(b.valuation, 10_000) * (1.3 + rand(g) * 0.5 + threat * 0.4))
  const regime = effectiveRegime(top.hq, g.year, true)
  const blockP = takeoverBlockP(regime, v.share + top.share)
  const choices: ChoiceOption[] = [
    { id: 'accept', label: 'Sell to them', emoji: '\u{1F91D}' },
    { id: 'counter', label: 'Counter 20% higher', emoji: '\u{1F4C8}' },
    { id: 'decline', label: 'Not for sale', emoji: '\u{1F645}' },
  ]
  const over = (price: number) => (price - b.valuation) * b.share
  const fee = (price: number) => price * 0.03 * b.share
  markBest(
    g,
    choices,
    scored(g, b, () => ({
      accept: (1 - blockP) * over(offer) + blockP * fee(offer),
      counter: BID_COUNTER * ((1 - blockP) * over(offer * 1.2) + blockP * fee(offer * 1.2)),
      decline: 0,
    })),
    (id) =>
      id === 'decline'
        ? `Best move: ${a.name} is worth more to you than they're offering`
        : blockP > 0.3
          ? `Best move: even if regulators block it (about ${pct(blockP)} likely), the break-up fee is yours`
          : id === 'accept'
            ? `Best move: ${pct(offer / Math.max(1, b.valuation) - 1)} over what it's worth`
            : 'Best move: they want you badly; a 20% higher counter is worth the risk',
  )
  scriptChoice(
    g,
    BID,
    'A Giant Comes Knocking',
    `${top.name}, the biggest name in ${v.noun} with ${shareText(top.share)} of the market, wants to buy ${a.name} for ${formatMoney(offer)}${b.share < 1 ? ` (your ${pct(b.share)} would be ${money(offer * b.share)})` : ''}. Your accountant values it at about ${money(b.valuation)}.${blockP > 0 ? ` Regulators may not let ${top.name} get that big.` : ''}`,
    choices,
    { emoji: '\u{1F988}', data: { assetId: a.id, offer, rival: top.name, rivalId: top.id, blockP, regulator: regime.name } },
  )
}

// ---------------------------------------------------------------------------
// Copycat

export function suitWinP(b: BizState): number {
  return clampN(0.35 + b.brand / 250 + 0.08 * staffPower(b, 'finance'), 0.2, 0.8)
}

function suitCost(b: BizState): number {
  return scaledCost(b, 15_000, 0.01)
}

function innovateCost(b: BizState): number {
  return scaledCost(b, 25_000, 0.02)
}

const COPYCAT = defineScript('business.comp.copycat', (g, choice, data) => {
  const x = ctxOf(g, data)
  if (!x) return
  const { a, b, d } = x
  const name = str(d.rival, 'a rival')
  const id = str(d.rivalId)
  const product = str(d.product, 'your product')
  if (choice === 'sue') {
    const cost = pay(b, suitCost(b))
    if (chance(g, suitWinP(b))) {
      const damages = Math.round(cost * 1.5)
      b.cash += damages
      b.yearIncome += damages
      modRival(b, id, 0.75, g.year + 1)
      log(g, `${a.name} won a copycat lawsuit against ${name}.`, 'good')
      tell(g, 'Case Won!', `The court agreed ${name}'s "${product}" was a shameless copy. They pulled it, paid ${formatMoney(damages)} in damages, and their reputation took a beating. Legal fees: ${formatMoney(cost)}.`, '\u{2696}\u{FE0F}', 'good')
    } else {
      setEdge(b, 0.93, g.year + 1, g.year)
      tell(g, 'Case Lost', `The judge decided you can't own an idea, just its exact wording. ${name} keeps selling its knockoff of ${product}; you're out ${formatMoney(cost)} in legal fees.`, '\u{2696}\u{FE0F}', 'bad')
    }
    return
  }
  if (choice === 'innovate') {
    const cost = pay(b, innovateCost(b))
    b.quality = clampN(b.quality + 5, 0, 100)
    setEdge(b, 1.06, g.year + 1, g.year)
    tell(g, 'Out-Innovated', `You spent ${formatMoney(cost)} shipping the next version of ${product} before ${name} could get its rival product off the ground. Quality is up to ${b.quality}%.`, '\u{1F680}', 'good')
    return
  }
  if (choice === 'market') {
    const cost = pay(b, marketCost(b))
    b.brand = clampN(b.brand + 4, 0, 100)
    setEdge(b, 1.04, g.year + 1, g.year)
    tell(g, 'Out-Marketed', `You spent ${formatMoney(cost)} reminding everyone why ${product} came first. Brand is up to ${b.brand}%, and ${name}'s launch got a lot less attention than it hoped for.`, '\u{1F4E3}', 'good')
    return
  }
  setEdge(b, 0.9, g.year + 1, g.year)
  const p = b.products.find((y) => y.name === product)
  if (p) p.boost = round2(p.boost * 0.6)
  tell(g, 'Letting It Slide', `You let ${name}'s rival product slide. Some of your customers did too: straight to them.`, '\u{1F937}', 'bad')
})

function marketCost(b: BizState): number {
  return scaledCost(b, 25_000, 0.02)
}

function presentCopycat(g: GameState, a: Asset, b: BizState): void {
  const v = marketViewOf(g, b)
  const pool = v.rivals.filter((r) => !r.legacy).slice(0, 5)
  if (!pool.length || !b.products.length) return
  const r = pick(g, pool)
  const product = [...b.products].sort((x, y) => y.launched - x.launched)[0].name
  // Only a fictional challenger can be a "copycat" you could take to court; a real company's
  // launch is simply competition.
  const lawsuit = !r.real
  const choices: ChoiceOption[] = [
    ...(lawsuit ? [{ id: 'sue', label: `Sue them (~${money(suitCost(b))})`, emoji: '\u{2696}\u{FE0F}' }] : []),
    { id: 'innovate', label: `Out-innovate them (~${money(innovateCost(b))})`, emoji: '\u{1F680}' },
    ...(lawsuit ? [] : [{ id: 'market', label: `Out-market them (~${money(marketCost(b))})`, emoji: '\u{1F4E3}' }]),
    { id: 'ignore', label: 'Let it go', emoji: '\u{1F937}' },
  ]
  markBest(
    g,
    choices,
    scored(g, b, (w) => {
      const p = suitWinP(b)
      const relief = 1 / Math.max(0.5, 1 - r.share * 0.25)
      return {
        ...(lawsuit ? { sue: -suitCost(b) + p * (suitCost(b) * 1.5 + edgeValue(g, b, w, relief, 2)) + (1 - p) * edgeValue(g, b, w, 0.93, 2) } : {}),
        innovate: fxValue(g, b, w, { cash: -innovateCost(b), quality: 5 }) + edgeValue(g, b, w, 1.06, 2),
        ...(lawsuit ? {} : { market: fxValue(g, b, w, { cash: -marketCost(b), brand: 4 }) + edgeValue(g, b, w, 1.04, 2) }),
        // Letting it slide also takes 40% of the line's pull for the rest of its life.
        ignore: edgeValue(g, b, w, 0.9, 2) - w.contrib * (b.products.find((p) => p.name === product)?.boost ?? 0) * 0.4 * 2.5,
      }
    }),
    (id) => (id === 'sue' ? `Best move: about ${pct(suitWinP(b))} odds in court, and a win hurts them for years` : undefined),
  )
  scriptChoice(
    g,
    COPYCAT,
    lawsuit ? 'Copycat!' : 'A Rival Launch',
    lawsuit
      ? `${r.name} (${placeName(r.hq)}) just launched a suspiciously familiar version of your ${product}. Same features, same colors, 20% cheaper, and a press release calling it "revolutionary".`
      : `${r.name} (${placeName(r.hq)}) just launched a rival to your ${product}: similar features, 20% cheaper, and a big marketing push behind it. Customers are noticing.`,
    choices,
    { emoji: '\u{1F4CB}', data: { assetId: a.id, rival: r.name, rivalId: r.id, product } },
  )
}

// ---------------------------------------------------------------------------
// Price war

function differentiateCost(b: BizState): number {
  return scaledCost(b, 25_000, 0.02)
}

const PRICE_WAR = defineScript('business.comp.priceWar', (g, choice, data) => {
  const x = ctxOf(g, data)
  if (!x) return
  const { a, b, d } = x
  const name = str(d.rival, 'a rival')
  if (choice === 'match') {
    b.price = round2(Math.max(0.01, b.price * 0.85))
    promisePrice(g, a.id, b.price)
    tell(g, 'Price War', `You matched ${name} and cut prices 15%. Customers are delighted; both CFOs are not. You promised to hold the new price for the rest of the year.`, '\u{2694}\u{FE0F}')
    return
  }
  if (choice === 'differentiate') {
    const cost = pay(b, differentiateCost(b))
    b.brand = clampN(b.brand + 6, 0, 100)
    setEdge(b, 0.93, g.year, g.year)
    tell(g, 'Worth Every Penny', `Instead of cutting prices you spent ${formatMoney(cost)} telling the world why ${a.name} is worth paying for. Brand is up to ${b.brand}%. The bargain hunters left anyway.`, '\u{2728}')
    return
  }
  setEdge(b, 0.8, g.year, g.year)
  tell(g, 'Waiting It Out', `You held your prices and waited for the discount season to pass. This year a lot of your customers went bargain hunting with ${name}.`, '\u{231B}', 'bad')
})

function presentPriceWar(g: GameState, a: Asset, b: BizState): void {
  const v = marketViewOf(g, b)
  const r = v.rivals.find((x) => !x.legacy)
  if (!r) return
  const choices: ChoiceOption[] = [
    { id: 'match', label: 'Match their prices', emoji: '\u{2694}\u{FE0F}' },
    { id: 'differentiate', label: `Out-brand them (~${money(differentiateCost(b))})`, emoji: '\u{2728}' },
    { id: 'wait', label: 'Hold your prices', emoji: '\u{231B}' },
  ]
  markBest(
    g,
    choices,
    scored(g, b, (w) => ({
      match: fxValue(g, b, w, { priceCut: 0.15 }),
      differentiate: fxValue(g, b, w, { cash: -differentiateCost(b), brand: 6 }) + edgeValue(g, b, w, 0.93, 1),
      wait: edgeValue(g, b, w, 0.8, 1),
    })),
  )
  scriptChoice(
    g,
    PRICE_WAR,
    'Price War!',
    `${r.name}, with ${shareText(r.share)} of the ${v.noun} market, cut its prices by a fifth to win share. Analysts expect the whole market to feel it, and ${a.name} sells in the same aisles.`,
    choices,
    { emoji: '\u{1F4C9}', data: { assetId: a.id, rival: r.name } },
  )
}

// ---------------------------------------------------------------------------
// Scandal at a rival

function pounceCost(b: BizState): number {
  return scaledCost(b, 20_000, 0.015)
}

function poachCost(b: BizState): number {
  return scaledCost(b, 30_000, 0.01)
}

const SCANDALS = [
  'a data breach that leaked millions of customer records',
  'a CEO caught expensing a yacht as "team building"',
  'a product recall after units started smoking in customers’ homes',
  'a leaked memo calling its own customers "walking wallets"',
  'an accounting "irregularity" with a lot of zeros',
]

const SCANDAL = defineScript('business.comp.scandal', (g, choice, data) => {
  const x = ctxOf(g, data)
  if (!x) return
  const { a, b, d } = x
  const name = str(d.rival, 'a rival')
  if (choice === 'pounce') {
    const cost = pay(b, pounceCost(b))
    setEdge(b, 1.15, g.year + 1, g.year)
    b.brand = clampN(b.brand + 2, 0, 100)
    tell(g, 'Pounce!', `Your ${formatMoney(cost)} campaign ("${a.name}: we'd never") ran everywhere ${name}'s customers were looking for a way out. Plenty found one.`, '\u{1F406}', 'good')
    return
  }
  if (choice === 'poach') {
    const cost = pay(b, poachCost(b))
    if (isDeepTech(b)) {
      const t = techOf(b)
      t.level = clampN(t.level + 4, 0, 100)
    }
    b.quality = clampN(b.quality + 5, 0, 100)
    b.morale = clampN(b.morale + 3, 0, 100)
    tell(g, 'Lifeboats Welcome', `${name}'s best people were updating their résumés before the headlines dried. ${formatMoney(cost)} in signing bonuses brought a dozen of them to ${a.name}. Quality is up to ${b.quality}%.`, '\u{1F6A3}', 'good')
    return
  }
  b.brand = clampN(b.brand + 4, 0, 100)
  addHidden(g, 'karma', 3)
  tell(g, 'Taking the High Road', `You told reporters you "wish everyone at ${name} the best". It made you look good: brand up to ${b.brand}%.`, '\u{1F607}', 'good')
})

/** Scandals are only ever about fictional companies: real ones are never accused of anything here. */
function fictionalPool(v: ReturnType<typeof marketViewOf>): ReturnType<typeof marketViewOf>['rivals'] {
  return v.rivals.filter((r) => !r.legacy && !r.real).slice(0, 4)
}

function presentScandal(g: GameState, a: Asset, b: BizState): void {
  const v = marketViewOf(g, b)
  const pool = fictionalPool(v)
  if (!pool.length) return
  const r = pick(g, pool)
  // Customers flee the rival whatever you do.
  modRival(b, r.id, 0.7, g.year + 1)
  const what = pick(g, SCANDALS)
  const choices: ChoiceOption[] = [
    { id: 'pounce', label: `Pounce on their customers (~${money(pounceCost(b))})`, emoji: '\u{1F406}' },
    { id: 'poach', label: `Hire their best people (~${money(poachCost(b))})`, emoji: '\u{1F6A3}' },
    { id: 'classy', label: 'Stay classy', emoji: '\u{1F607}' },
  ]
  markBest(
    g,
    choices,
    scored(g, b, (w) => ({
      pounce: fxValue(g, b, w, { cash: -pounceCost(b), brand: 2 }) + edgeValue(g, b, w, 1.15, 2),
      poach: fxValue(g, b, w, { cash: -poachCost(b), quality: 5, morale: 3 }),
      classy: fxValue(g, b, w, { brand: 4, karma: 3 }),
    })),
  )
  scriptChoice(
    g,
    SCANDAL,
    `Scandal at ${r.name}`,
    `Your rival ${r.name} is drowning in headlines over ${what}. Its customers are angry and its staff are polishing their résumés. Whatever you do, some of them are coming your way.`,
    choices,
    { emoji: '\u{1F4F0}', data: { assetId: a.id, rival: r.name, rivalId: r.id } },
  )
}

// ---------------------------------------------------------------------------
// A rival makes a big, perfectly ordinary move

const RIVAL_MOVES: { text: (home: boolean) => string; from?: number }[] = [
  { text: () => 'opened a wave of splashy flagship locations' },
  { text: () => 'launched a fresh product line aimed straight at your customers' },
  { text: (home) => (home ? 'announced a big expansion across the whole country' : 'announced a big push into your home market') },
  { text: () => 'kicked off a huge promotional season' },
  { text: () => 'signed a distribution partnership that puts it on a lot more shelves', from: 1950 },
  { text: () => 'rolled out a loyalty program with real rewards', from: 1980 },
]

function surgeCost(b: BizState): number {
  return scaledCost(b, 25_000, 0.02)
}

const RIVAL_MOVE = defineScript('business.comp.rivalMove', (g, choice, data) => {
  const x = ctxOf(g, data)
  if (!x) return
  const { a, b, d } = x
  const name = str(d.rival, 'a rival')
  if (choice === 'promote') {
    const cost = pay(b, surgeCost(b))
    setEdge(b, 1.06, g.year + 1, g.year)
    b.brand = clampN(b.brand + 2, 0, 100)
    tell(g, 'Counter-Programming', `You spent ${formatMoney(cost)} on a promotion of your own the week ${name} made its move. Customers stayed put, mostly.`, '\u{1F4E3}', 'good')
    return
  }
  if (choice === 'match') {
    b.price = round2(Math.max(0.01, b.price * 0.92))
    promisePrice(g, a.id, b.price)
    tell(g, 'Matching the Market', `You trimmed prices 8% and promised to hold them for the year. ${name} brought the customers in; you kept most of them.`, '\u{1F3F7}\u{FE0F}')
    return
  }
  setEdge(b, 0.95, g.year, g.year)
  tell(g, 'Business as Usual', `You carried on as normal while ${name} soaked up the attention. A few customers went to see what the fuss was about.`, '\u{1F937}', 'bad')
})

function presentRivalMove(g: GameState, a: Asset, b: BizState): void {
  const v = marketViewOf(g, b)
  const pool = v.rivals.filter((r) => !r.legacy).slice(0, 5)
  if (!pool.length) return
  const r = pick(g, pool)
  const moves = RIVAL_MOVES.filter((m) => (m.from ?? 0) <= g.year)
  const what = pick(g, moves).text(r.hq === b.countryId)
  // Its customers come from everyone in the market: it gets stronger for a year whatever you do.
  modRival(b, r.id, 1.08, g.year + 1)
  const canMatch = b.price > 0 && b.industry !== 'gameStudio'
  const choices: ChoiceOption[] = [
    { id: 'promote', label: `Counter with a promotion (~${money(surgeCost(b))})`, emoji: '\u{1F4E3}' },
    ...(canMatch ? [{ id: 'match', label: 'Trim prices 8%', emoji: '\u{1F3F7}\u{FE0F}' }] : []),
    { id: 'ignore', label: 'Carry on as usual', emoji: '\u{1F937}' },
  ]
  markBest(
    g,
    choices,
    scored(g, b, (w) => ({
      promote: fxValue(g, b, w, { cash: -surgeCost(b), brand: 2 }) + edgeValue(g, b, w, 1.06, 2),
      ...(canMatch ? { match: fxValue(g, b, w, { priceCut: 0.08 }) } : {}),
      ignore: edgeValue(g, b, w, 0.95, 1),
    })),
  )
  scriptChoice(
    g,
    RIVAL_MOVE,
    `${r.name} Makes a Move`,
    `${r.name} (${placeName(r.hq)}), ${r.share >= 0.05 ? `with ${shareText(r.share)} of the ${v.noun} market,` : 'a competitor,'} just ${what}. Expect it to win customers from everyone in the market, ${a.name} included.`,
    choices,
    { emoji: '\u{1F3C1}', data: { assetId: a.id, rival: r.name, rivalId: r.id } },
  )
}

// ---------------------------------------------------------------------------
// A supply-chain disruption

const DISRUPTIONS: { text: string; from?: number }[] = [
  { text: 'a shipping crunch left containers stuck at the ports', from: 1956 },
  { text: 'a shortage of a key component held up deliveries' },
  { text: 'new export controls on a key technology held up suppliers', from: 1949 },
  { text: 'a surprise round of tariffs hit your suppliers', from: 1900 },
  { text: 'a fire at a major supplier\u2019s plant held up shipments' },
]

function presentSupplyShock(g: GameState, a: Asset, b: BizState): void {
  const st = marketOfBiz(b)
  const shielded = st.supplyUntil >= g.year
  const options = DISRUPTIONS.filter((d) => (d.from ?? 0) <= g.year)
  const what = pick(g, options).text
  setEdge(b, shielded ? SUPPLY_SHIELDED : SUPPLY_HIT, g.year, g.year)
  b.costShock = Math.max(b.costShock, shielded ? 1.02 : 1.08)
  tell(
    g,
    'Supply Chain Disruption',
    shielded
      ? `${cap(what)}. Because ${a.name} spread its suppliers and routes around the world, the damage was a scratch: a few late deliveries and a slightly higher bill.`
      : `${cap(what)}. ${a.name} depends on a handful of suppliers and one route, so customers waited and costs rose. Diversifying your supply chain (Market & Competition, Strategy) would have cushioned it.`,
    '\u{1F6A2}',
    shielded ? 'neutral' : 'bad',
  )
}

// ---------------------------------------------------------------------------
// A well-funded newcomer

function newcomerPrice(b: BizState): number {
  return scaledCost(b, 120_000, 0.05)
}

function outspendCost(b: BizState): number {
  return scaledCost(b, 30_000, 0.02)
}

const NEWCOMER = defineScript('business.comp.newcomer', (g, choice, data) => {
  const x = ctxOf(g, data)
  if (!x) return
  const { a, b, d } = x
  const name = str(d.rival, 'the newcomer')
  const id = str(d.rivalId)
  if (choice === 'buy') {
    const price = newcomerPrice(b)
    if (b.cash < price) {
      tell(g, 'Not Enough Cash', `${a.name} couldn't scrape together ${formatMoney(price)} in time. ${name} took the investors' money instead.`, '\u{1F4B8}', 'bad')
      return
    }
    b.cash -= price
    const st = marketOfBiz(b)
    st.gone = [...st.gone, id].slice(-60)
    saveMarket(b, st)
    count(g, 'acquisitions')
    log(g, `${a.name} bought the startup ${name} before it could grow up.`, 'neutral')
    tell(g, 'Bought in the Crib', `${a.name} paid ${formatMoney(price)} for ${name} before it shipped a thing. Its founders got rich, its product got "sunset", and your market got quieter.`, '\u{1F37C}', 'good')
    return
  }
  if (choice === 'outspend') {
    const cost = pay(b, outspendCost(b))
    setEdge(b, 1.1, g.year + 1, g.year)
    b.brand = clampN(b.brand + 3, 0, 100)
    tell(g, 'Shock and Awe', `You spent ${formatMoney(cost)} making sure nobody even heard ${name}'s launch over yours.`, '\u{1F4E2}', 'good')
    return
  }
  tell(g, 'Let Them Try', `You ignored ${name}. Their billboards say "${a.name}, but better". We'll see.`, '\u{1F937}')
})

function presentNewcomer(g: GameState, a: Asset, b: BizState): void {
  const st = marketStateOf(b)
  const x = st?.extra.filter((e) => e.origin === 'entrant' && e.founded >= g.year - 1 && !st.gone.includes(e.id)).slice(-1)[0]
  if (!st || !x) return
  const regime = effectiveRegime(b.countryId, g.year, marketDef(b.industry).scope === 'world')
  const blocked = regime.strict >= 0.25 && st.share >= mergerLimit(regime)
  const choices: ChoiceOption[] = [
    ...(blocked ? [] : [{ id: 'buy', label: `Buy them out early (${money(newcomerPrice(b))})`, emoji: '\u{1F37C}' }]),
    { id: 'outspend', label: `Drown out their launch (~${money(outspendCost(b))})`, emoji: '\u{1F4E2}' },
    { id: 'ignore', label: 'Ignore them', emoji: '\u{1F937}' },
  ]
  markBest(
    g,
    choices,
    scored(g, b, (w) => {
      // The newcomer's future pull, as an edge it would take from you for a few years.
      const threat = 1 / (1 + Math.min(0.5, x.pot * 0.05 * (1 + st.share)))
      return {
        ...(blocked ? {} : { buy: -newcomerPrice(b) - edgeValue(g, b, w, threat, 4) }),
        outspend: fxValue(g, b, w, { cash: -outspendCost(b), brand: 3 }) + edgeValue(g, b, w, 1.1, 2) + edgeValue(g, b, w, threat, 4),
        ignore: edgeValue(g, b, w, threat, 4),
      }
    }),
  )
  scriptChoice(
    g,
    NEWCOMER,
    'New Kid on the Block',
    `${x.name}, a startup from ${getCountry(x.hq).name} flush with investors' money, is launching straight at ${a.name}'s customers. Their pitch deck literally has your logo on it with a red X.${blocked ? ` (Buying them is off the table: ${regime.name} would never allow it at your size.)` : ''}`,
    choices,
    { emoji: '\u{1F476}', data: { assetId: a.id, rival: x.name, rivalId: x.id } },
  )
}

// ---------------------------------------------------------------------------
// The event table (merged into events.ts EVENTS)

export interface CompetitionEvent {
  id: string
  weight: (g: GameState, b: BizState) => number
  present: (g: GameState, a: Asset, b: BizState) => void
}

/** Tradable industries fight over the world; studios have their own events. */
function worldly(b: BizState): boolean {
  return marketDef(b.industry).scope === 'world' && b.industry !== 'gameStudio'
}

function booked(b: BizState): boolean {
  const st = marketStateOf(b)
  return !!st && st.year > 0
}

export const COMPETITION_EVENTS: CompetitionEvent[] = [
  {
    id: 'giantBid',
    weight: (g, b) => {
      if (!worldly(b) || b.public || !booked(b) || b.valuation <= 0) return 0
      const v = marketViewOf(g, b)
      const top = v.rivals.find((r) => !r.legacy)
      return top && top.share > v.share && v.share >= 0.005 ? 0.3 : 0
    },
    present: presentBid,
  },
  // A hot new product invites copies; a price offensive or a fast-growing share invites a price war.
  { id: 'copycat', weight: (g, b) => (worldly(b) && booked(b) && b.products.length > 0 && marketViewOf(g, b).rivals.length > 0 ? (b.products.some((p) => p.launched >= g.year - 1) ? 0.7 : 0.35) : 0), present: presentCopycat },
  {
    id: 'rivalPriceWar',
    weight: (g, b) => {
      if (!worldly(b) || !booked(b) || !(b.price > 0) || !marketViewOf(g, b).rivals.some((r) => !r.legacy)) return 0
      const st = marketStateOf(b)
      const h = st?.history ?? []
      const surging = h.length >= 2 && h[h.length - 1].share > h[h.length - 2].share * 1.5 && h[h.length - 1].share > 0.02
      return (st && st.lastMove >= g.year - 1) || surging ? 0.7 : 0.3
    },
    present: presentPriceWar,
  },
  { id: 'rivalScandal', weight: (g, b) => (booked(b) && fictionalPool(marketViewOf(g, b)).length > 0 ? (worldly(b) ? 0.3 : 0.08) : 0), present: presentScandal },
  { id: 'rivalMove', weight: (g, b) => (booked(b) && marketViewOf(g, b).rivals.some((r) => !r.legacy) ? (worldly(b) ? 0.4 : 0.2) : 0), present: presentRivalMove },
  { id: 'supplyShock', weight: (_g, b) => (booked(b) && hasSupplyChain(b.industry) && b.industry !== 'gameStudio' ? 0.2 : 0), present: presentSupplyShock },
  {
    id: 'newcomer',
    weight: (g, b) => {
      const st = marketStateOf(b)
      return st && st.extra.some((e) => e.origin === 'entrant' && e.founded >= g.year - 1 && !st.gone.includes(e.id)) ? 0.6 : 0
    },
    present: presentNewcomer,
  },
]

/** For tests: present one competition event. */
export function presentCompetitionEvent(g: GameState, a: Asset, b: BizState, id: string): boolean {
  const ev = COMPETITION_EVENTS.find((e) => e.id === id)
  if (!ev) return false
  ev.present(g, a, b)
  return true
}

// ---------------------------------------------------------------------------
// Antitrust

function fineFor(b: BizState, r: Regime): number {
  const st = marketStateOf(b)
  const dom = dominanceFrom(Math.max(st?.share ?? 0, st?.base ?? 0))
  const revenue = Math.max(0, b.last?.revenue ?? 0)
  return Math.round(Math.max(scaledCost(b, 25_000, 0.005), revenue * r.fine * (0.4 + 0.6 * dom)))
}

function legalFees(b: BizState): number {
  return scaledCost(b, 40_000, 0.005)
}

export function courtWinP(b: BizState, r: Regime): number {
  return clampN(0.6 - 0.35 * r.strict + 0.04 * staffPower(b, 'finance'), 0.15, 0.75)
}

/** Share of the company a break-up hands to a new rival. */
const DIVEST = 0.2

/** What spinning off a fifth of the company costs the owner (value lost) and brings in (cash). */
function divestTerms(b: BizState): { proceeds: number; lost: number } {
  const operating = Math.max(0, b.valuation - b.cash + b.debt)
  const proceeds = Math.round(operating * DIVEST * 0.6)
  return { proceeds, lost: Math.round(operating * DIVEST * b.share) - Math.round(proceeds * b.share) }
}

/** Spin off part of the company into a new rival (antitrust remedy). */
function divest(g: GameState, a: Asset, b: BizState, forced: boolean): string {
  const st = marketOfBiz(b)
  const t = divestTerms(b)
  const total = totalOutlets(b)
  const cut = total > 1 ? Math.max(1, Math.round(total * DIVEST)) : 0
  if (cut > 0) {
    // Foreign operations go first; the company always keeps at least one location.
    let left = cut
    for (const o of [...b.outlets].sort((x, y) => (x.countryId === b.countryId ? 1 : 0) - (y.countryId === b.countryId ? 1 : 0))) {
      if (left <= 0) break
      const n = Math.max(0, Math.min(left, o.count, totalOutlets(b) - 1))
      o.count -= n
      left -= n
    }
    b.outlets = b.outlets.filter((o) => o.count > 0)
  }
  b.cash += t.proceeds
  const s = seeded(`${familyId(g.lifeId)}|spinoff|${a.id}|${g.year}`)
  const name = `${a.name.replace(/\s+(Inc\.?|Ltd\.?|Co\.?)$/i, '')} ${s.pick(['Spinco', 'Holdings', 'Partners', 'Next', 'Group'])}`
  const roster = st.extra.filter((x) => x.name !== name)
  st.extra = [...roster, { id: `s${g.year}${s.int(10, 99)}`, name, hq: b.countryId, founded: g.year, pot: Math.max(0.5, st.share * DIVEST * 30), ramp: 1, origin: 'spinoff' as const }].slice(-12)
  st.base = clampN(st.base * (1 - DIVEST), 0, 1)
  st.share = clampN(st.share * (1 - DIVEST), 0, 1)
  saveMarket(b, st)
  log(g, `${a.name} ${forced ? 'was forced to spin off' : 'spun off'} part of its business as ${name}.`, 'bad')
  return `${name} now owns a fifth of what was ${a.name}${cut > 0 ? ` (${cut} ${cut === 1 ? industryDef(b.industry).site : industryDef(b.industry).sitePlural})` : ''}; ${a.name} got ${formatMoney(t.proceeds)} for it.`
}

const ANTITRUST = defineScript('business.comp.antitrust', (g, choice, data) => {
  const x = ctxOf(g, data)
  if (!x) return
  const { a, b, d } = x
  const r = effectiveRegime(str(d.hq, b.countryId), g.year, marketDef(b.industry).scope === 'world')
  const fine = num(d.fine, fineFor(b, r))
  const fined = (n: number, remedyUntil = 0) => {
    const s = marketOfBiz(b)
    s.antitrust.fined += n
    if (remedyUntil) s.antitrust.remedyUntil = remedyUntil
    saveMarket(b, s)
  }
  if (choice === 'settle') {
    const paid = pay(b, fine * 0.6)
    // Remedies: prices capped at today's level and rivals get a fair shot for two years.
    fined(paid, g.year + 1)
    promisePrice(g, a.id, b.price)
    setEdge(b, 0.92, g.year + 1, g.year)
    log(g, `${a.name} settled an antitrust case for ${money(paid)}.`, 'bad')
    tell(g, 'Settled', `${a.name} paid ${formatMoney(paid)} and promised to play nice: no price hikes this year, and rivals get access to your customers for two years. ${cap(r.name)} called it "a win for consumers". Your lawyers called it "a win for our invoices".`, '\u{1F4DC}', 'bad')
    return
  }
  if (choice === 'fight') {
    const fees = pay(b, legalFees(b))
    if (chance(g, courtWinP(b, r))) {
      b.brand = clampN(b.brand + 2, 0, 100)
      log(g, `${a.name} beat an antitrust case in court.`, 'good')
      tell(g, 'Case Dismissed!', `After ${formatMoney(fees)} in legal fees, the court ruled that ${a.name} is big because customers like it, not because it cheated. Champagne in the legal department.`, '\u{2696}\u{FE0F}', 'good')
      return
    }
    const paid = pay(b, fine * 1.5)
    fined(paid)
    const split = r.breakUp ? ` ${divest(g, a, b, true)}` : ''
    log(g, `${a.name} lost an antitrust case.`, 'bad')
    tell(g, 'Case Lost', `The court sided with ${r.name}. ${a.name} paid ${formatMoney(paid)} on top of ${formatMoney(fees)} in legal fees.${split || ' The judge stopped short of breaking the company up. This time.'}`, '\u{2696}\u{FE0F}', 'bad')
    return
  }
  if (choice === 'divest') {
    const text = divest(g, a, b, false)
    tell(g, 'Break-Up Agreed', `To make the case go away, you offered to split the company. ${text} ${cap(r.name)} accepted.`, '\u{2702}\u{FE0F}')
    return
  }
  // Lobby: legal, expensive, and only as good as the regulator is pliable.
  const cost = pay(b, legalFees(b) * 0.8)
  addHidden(g, 'karma', -4)
  if (chance(g, lobbyWinP(r))) {
    log(g, `${a.name}'s lobbyists made an antitrust case disappear.`, 'neutral')
    tell(g, 'Case Closed (Quietly)', `${formatMoney(cost)} of lobbying later, ${r.name} decided the case "no longer warranted resources".`, '\u{1F92B}')
    return
  }
  const paid = pay(b, fine * 1.2)
  fined(paid)
  tell(g, 'Lobbying Backfired', `${cap(r.name)} did not appreciate the dinner invitations. ${a.name} paid ${formatMoney(paid)} on top of ${formatMoney(cost)} in lobbying bills.`, '\u{1F4F0}', 'bad')
})

export function lobbyWinP(r: Regime): number {
  return clampN(0.7 * (1 - r.strict) + 0.05, 0.05, 0.75)
}

/** Antitrust choices' expected values for the owner (Business talent). */
function antitrustValues(g: GameState, b: BizState, w: Worth, r: Regime, fine: number): Record<string, number> {
  const t = divestTerms(b)
  const p = courtWinP(b, r)
  const remedy = edgeValue(g, b, w, 0.92, 2) + fxValue(g, b, w, { priceCut: 0.03 })
  const breakUp = r.breakUp ? -t.lost : 0
  return {
    settle: -fine * 0.6 + remedy,
    fight: -legalFees(b) + (1 - p) * (-fine * 1.5 + breakUp),
    ...(r.breakUp ? { divest: -t.lost } : {}),
    lobby: -legalFees(b) * 0.8 + (1 - lobbyWinP(r)) * -fine * 1.2,
  }
}

/**
 * A dominant company may face an antitrust case this year (decided per company and year by the
 * market, not by g.rng). A manager settles; an owner-CEO decides.
 */
export function maybeAntitrust(g: GameState, a: Asset, b: BizState, year: number, managed: boolean): void {
  if (!g.character.alive || !findBusiness(g, a.id)) return
  const st = marketStateOf(b)
  if (!st || st.year !== year) return
  if (st.antitrust.last > 0 && year - st.antitrust.last < 4) return
  const going = localEcon(b.industry, b.countryId, b.city).goingPrice
  const ratio = going > 0 && b.last ? b.last.price / going : 1
  const view = antitrustOf(b, Math.max(st.share, st.base), year, ratio, marketViewOf(g, b).rivals)
  if (view.p <= 0) return
  if (seeded(`${familyId(g.lifeId)}|antitrust|${a.id}|${year}`).next() >= view.p) return
  const r = view.regime
  const fine = fineFor(b, r)
  const s = marketOfBiz(b)
  s.antitrust.last = year
  s.antitrust.cases += 1
  saveMarket(b, s)
  count(g, 'antitrustCases')
  if (managed || g.character.prison) {
    const paid = pay(b, fine * 0.6)
    const s2 = marketOfBiz(b)
    s2.antitrust.fined += paid
    saveMarket(b, s2)
    log(g, `${a.name}'s management settled an antitrust case with ${r.name} for ${money(paid)}.`, 'bad')
    return
  }
  const choices: ChoiceOption[] = [
    { id: 'settle', label: `Settle (~${money(fine * 0.6)} and remedies)`, emoji: '\u{1F4DC}' },
    { id: 'fight', label: `Fight it in court (~${money(legalFees(b))} in fees)`, emoji: '\u{2696}\u{FE0F}' },
    ...(r.breakUp ? [{ id: 'divest', label: 'Offer to spin off part of the company', emoji: '\u{2702}\u{FE0F}' }] : []),
    { id: 'lobby', label: 'Lobby to make it go away', emoji: '\u{1F91D}' },
  ]
  markBest(g, choices, scored(g, b, (w) => antitrustValues(g, b, w, r, fine)), (id) =>
    id === 'fight' ? `Best move: about ${pct(courtWinP(b, r))} odds in court beat paying up` : id === 'lobby' ? `Best move: ${r.name} is pliable (about ${pct(lobbyWinP(r))} it works)` : id === 'divest' ? 'Best move: a clean split costs less than the fine and the fight' : 'Best move: settling is the cheapest way out',
  )
  const v = marketViewOf(g, b)
  scriptChoice(
    g,
    ANTITRUST,
    'Antitrust Investigation',
    `${cap(r.name)} has opened a case against ${a.name}, which controls ${shareText(Math.max(st.share, v.share))} of ${marketOwner(v.place)} ${v.noun} market. They say you're abusing a dominant position${b.last && going > 0 && b.last.price / going > 1.6 ? ' (your prices are "eye-watering", apparently)' : ''}. A fine could run to ${formatMoney(fine)}${r.breakUp ? ', and they can break companies up' : ''}.`,
    choices,
    { emoji: '\u{1F3DB}\u{FE0F}', data: { assetId: a.id, fine, hq: b.countryId } },
  )
}
