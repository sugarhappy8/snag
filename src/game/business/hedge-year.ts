// The hedge funds' year end and their passing on. Every birthday each Personal and Family fund settles
// who holds what, books the year's return on the pool, cools relatives after a bad year and lets a
// Macro call lapse; one popup then lists the funds and the companies' cash at work. When the player
// dies, a family fund the heir does not keep is wound up and the relatives are paid first.
// Nothing here reads or advances g.rng: noise comes from hedgeRng, and the popup's id is the year's,
// so it takes nothing from the id counter.
import { addRelationship, log } from '../core'
import type { Asset, GameState, Tone } from '../types'
import { cashOutFamilyHolders } from './dynasty-ownership'
import { signedPlain } from './fund-text'
import type { HedgeStrategy, MacroCall } from './fund-state'
import { fundsOf, saveFund, settleHolders } from './hedge-fund'
import { hedgeRng, leadOf, skillOf, strategyBlock, vehicleYear } from './hedge-model'
import { readCompanyHedge, readHedge, unitsValue, type HedgeFund } from './hedge-record'
import { clampN, money, pct } from './util'

const EMOJI = '🦈'
/** The largest pool a fund can grow to in one year. */
const MONEY_MAX = 1e15
/** A year at or below this cools every relative in the fund. */
const COOLING_AT = -0.15
/** How much a relative cools. */
const COOLING_BY = 3
/** The most marks a fund keeps. */
const MARKS_KEPT = 12

/** True when the game holds a hedge fund record or a company has a cash-at-work record. */
function holdsAny(g: GameState): boolean {
  return g.assets.some((a) => (a.kind === 'investment' && a.details.type === 'hedge') || (a.kind === 'business' && a.details.hedge !== undefined))
}

/**
 * The terms a fund runs its year on: what the owner set, except that a Macro call (an official can't
 * make one) or a Quant strategy that isn't possible this year falls back to Long/Short.
 */
function termsOf(g: GameState, f: HedgeFund): { strategy: HedgeStrategy; call: MacroCall; lev: number } {
  if (strategyBlock(g, f.countryId, f.strategy)) return { strategy: 'longShort', call: 'flat', lev: 1 }
  const macro = f.strategy === 'macro'
  return { strategy: f.strategy, call: macro ? f.call : 'flat', lev: macro ? f.lev : 1 }
}

/** What a fund's year did for the player: the popup block and the dollar result. */
interface Booked {
  block: string
  result: number
}

/** Settles, books and saves one fund's year. Returns the popup block, or null when the fund is gone. */
function bookFund(g: GameState, a: Asset, f: HedgeFund): Booked | null {
  for (const line of settleHolders(g, f, a.name)) log(g, line, 'neutral')
  if (!(f.nav >= 1)) {
    g.assets = g.assets.filter((x) => x.id !== a.id)
    log(g, `The ${a.name} is gone.`, 'neutral')
    return null
  }
  const stake = unitsValue(f, f.mine)
  const t = termsOf(g, f)
  const y = vehicleYear(g, { countryId: f.countryId, strategy: t.strategy, call: t.call, lev: t.lev, nav: f.nav, skill: skillOf(leadOf(g, f.founded)), year: g.year }, hedgeRng(g, a.id, g.year))
  f.nav = clampN(f.nav * (1 + y.net), 0, MONEY_MAX)
  f.lastYear = g.year
  f.last = { year: g.year, gross: y.gross, net: y.net, market: y.market }
  f.marks = [...f.marks, { y: g.year, r: y.net, m: y.market }].slice(-MARKS_KEPT)
  const lapsed = f.strategy === 'macro'
  if (lapsed) Object.assign(f, { strategy: 'longShort', call: 'flat', lev: 1 })
  if (y.net <= COOLING_AT) {
    const living = f.holders.map((h) => g.people.find((p) => p.id === h.id && p.alive)).filter((p) => p !== undefined)
    for (const p of living) addRelationship(p, -COOLING_BY)
    if (living.length) log(g, `Relatives in the ${a.name} lost money.`, 'bad')
  }
  saveFund(a, f)
  log(g, `My ${a.name} ${y.net >= 0 ? 'rose' : 'fell'} ${pct(Math.abs(y.net), 1)} this year.`, y.net >= 0 ? 'good' : 'bad')
  const block = `${a.name}: ${signedPlain(y.net)} (market ${signedPlain(y.market)}). Your share is ${money(a.value)}.${lapsed ? ' Macro goes back to Long/Short.' : ''}`
  return { block, result: stake * y.net }
}

/**
 * The yearly hook (aging.ts, right after investments): books every Personal and Family fund once a
 * birthday and queues one popup for the funds and the companies' cash at work. Returns at once when
 * the player is gone or there is no fund and no company record.
 */
export function yearlyHedge(g: GameState): void {
  if (!g.character.alive || !holdsAny(g)) return
  const blocks: string[] = []
  let result = 0
  for (const { a, f } of fundsOf(g)) {
    // Booked this year already. A marker from the future (a damaged save) must not freeze the fund for good.
    if (f.lastYear === g.year) continue
    const booked = bookFund(g, a, f)
    if (!booked) continue
    blocks.push(booked.block)
    result += booked.result
  }
  for (const a of g.assets) {
    if (a.kind !== 'business') continue
    const last = readCompanyHedge(a.details.hedge)?.last
    if (!last || last.year !== g.year - 1 || !(last.work > 0)) continue
    blocks.push(`${a.name}: ${money(last.work)} at work, ${last.pnl >= 0 ? '+' : '-'}${money(Math.abs(last.pnl))}.`)
    result += last.pnl
  }
  if (!blocks.length) return
  const id = `hedge-${g.generation}-${g.year}`
  if (g.queue.some((m) => m.kind === 'notice' && m.id === id)) return
  const tone: Tone = result >= 0 ? 'good' : 'bad'
  g.queue.push({ kind: 'notice', id, title: 'Hedge Funds', emoji: EMOJI, text: blocks.join('\n'), tone })
}

// ---------------------------------------------------------------------------
// When you die

/**
 * Before an estate divides: every family fund settles who holds what, so a relative who died before
 * the player passes their part on first and the player's part of it joins the player's units, which
 * are in the estate. The unit price never changes. A game with no fund is left alone.
 */
export function settleFundsAtDeath(n: GameState): void {
  for (const { a, f } of fundsOf(n)) {
    if (!f.holders.length) continue
    for (const line of settleHolders(n, f, a.name)) log(n, line, 'neutral')
    saveFund(a, f)
  }
}

/**
 * The ids of the relatives in the family funds the heir keeps. The heir's contacts are rebuilt from the
 * heir's point of view, and a relative who is not in it would otherwise drop out of the game with their
 * units still in the fund; the caller keeps these as contacts, as the family's company co-owners are.
 */
export function keptFundHolders(kept: readonly Asset[]): string[] {
  const ids = new Set<string>()
  for (const a of kept) {
    if (a.kind !== 'investment' || a.details.type !== 'hedge') continue
    for (const h of readHedge(a.details.hf)?.holders ?? []) ids.add(h.id)
  }
  return [...ids]
}

/**
 * Pays the relatives of every family fund the heir does not keep, in cash, at the going price, before
 * the heir's money is built. Your own units are already in the estate through the asset's value, so
 * only the holders are paid. Returns one estate line per fund wound up. Assets that are not funds are
 * ignored.
 */
export function payOutDroppedFunds(n: GameState, dropped: readonly Asset[]): string[] {
  const out: string[] = []
  for (const a of dropped) {
    if (a.kind !== 'investment' || a.details.type !== 'hedge') continue
    const f = readHedge(a.details.hf)
    if (!f || !f.holders.length || !(f.units > 0)) continue
    const before = n.character.money + n.people.reduce((sum, p) => sum + p.money, 0)
    cashOutFamilyHolders(n, f.holders.map((h) => ({ id: h.id, share: h.units / f.units })), f.nav, 'the family fund')
    // What reached someone, which is all of it except a slice that has no one to go to.
    const paid = n.character.money + n.people.reduce((sum, p) => sum + p.money, 0) - before
    if (paid >= 1) out.push(`The ${a.name} was wound up. Relatives got ${money(paid)}.`)
  }
  return out
}
