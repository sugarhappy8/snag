// The Stocks row and the company screen for what you own that trades on an exchange: your listed
// companies, and your listed groups (view only). The rows come from ownListings, the trades from
// own-trade.ts, and this file only lays them out. It registers itself with investments.ts through
// registerOwnListings, so the engine file imports nothing from business/.
//
// Every row, screen and preview here is a pure read of the game state: it never writes to it and
// never touches g.rng, so the menus can be rebuilt as often as the app likes.
import { formatMoney, formatPrice } from '../core'
import { registerOwnListings, type OwnStockRow } from '../investments'
import type { Asset, GameState, MenuAction, MenuGroup, MenuInfo, MenuNode } from '../types'
import { groupById } from './conglomerate-state'
import { readDividend } from './dividend-policy'
import { capitalGainsRate } from './exit'
import { ownListings, rawStake, TIER_LABEL, type OwnListing } from './own-listing'
import { BUY_PREMIUM, buyLimit, buyOwnShares, buyPreview, buyQuote, sellLimit, sellNote, sellOwnShares, sharesText } from './own-trade'
import { bizOf, findBusiness, readBiz, type BizState } from './state'
import { money, pct } from './util'

const EMOJI = '🏢'

/** A stake at or under this is nothing: the yearly cleanup takes the company off your hands (own-listing.ts). */
const OWNED = 1e-6

/** A change since the IPO past this many times over (either way) is a bad record, not news. */
const SANE_RATIO = 1e6

function fin(x: number): number {
  return Number.isFinite(x) ? x : 0
}

function labelOf(l: OwnListing): string {
  return l.ticker ? `${l.name} (${l.ticker})` : l.name
}

function rowId(l: OwnListing): string {
  return l.kind === 'group' ? `inv-own-g-${l.id}` : `inv-own-${l.id}`
}

/** The company and the record an action will see: the live one, with the stake exactly as stored. */
function liveView(g: GameState, id: string): { a: Asset; b: BizState } | null {
  const a = findBusiness(g, id)
  return a ? { a, b: { ...readBiz(g, a), share: rawStake(g, a) } } : null
}

/** Whether you still hold part of something that no longer shows as a listing. */
function stillHeld(g: GameState, l: OwnListing): boolean {
  if (l.kind === 'group') {
    const grp = groupById(g, l.id)
    return !!grp && grp.core.share > 0
  }
  const a = findBusiness(g, l.id)
  return !!a && rawStake(g, a) > OWNED
}

/** " · up 12% since the IPO", " · level with the IPO" under half a percent, or nothing when there is no offer price. */
function sinceIpo(price: number, ipoPrice: number | null): string {
  if (typeof ipoPrice !== 'number' || !Number.isFinite(ipoPrice) || !(ipoPrice > 0) || !(price > 0)) return ''
  const ratio = price / ipoPrice
  if (!Number.isFinite(ratio) || ratio > SANE_RATIO || ratio < 1 / SANE_RATIO) return ''
  const change = pct(Math.abs(ratio - 1))
  return change === '0%' ? ' · level with the IPO' : ` · ${ratio >= 1 ? 'up' : 'down'} ${change} since the IPO`
}

/** "Last dividend: $0.42 a share for 2026, 0.9% of the price." The yield is left out when the price makes it meaningless. */
function lastDividend(last: { year: number; perShare: number }, price: number): string {
  const ratio = price > 0 ? last.perShare / price : Number.NaN
  const yieldNote = Number.isFinite(ratio) && ratio <= SANE_RATIO ? `, ${pct(ratio, 1)} of the price` : ''
  return `Last dividend: ${formatPrice(last.perShare)} a share for ${last.year}${yieldNote}.`
}

/** The slider's range for a buy: from one share to the most the cash and the float allow. All finite. */
function buyBounds(g: GameState, a: Asset, b: BizState): { min: number; max: number; def: number; basePrice: number; maxFraction: number } {
  const q = buyQuote(g, a, b, 0)
  const min = Math.max(1, Math.ceil(fin(q.basePrice)))
  const max = Math.max(min, Math.floor(Math.min(fin(g.character.money), fin(q.maxDollars))))
  return { min, max, def: Math.max(min, Math.floor(max / 2)), basePrice: q.basePrice, maxFraction: q.maxFraction }
}

function buyAction(g: GameState, id: string, a: Asset, b: BizState): MenuAction {
  const { min, max, def, basePrice, maxFraction } = buyBounds(g, a, b)
  return {
    type: 'action',
    id: `inv-own-buy-${id}`,
    label: 'Buy Shares',
    emoji: '💵',
    subtitle: `At least ${formatPrice(basePrice)} a share · up to ${pct(maxFraction)} of the company`,
    disabledReason: (gg) => {
      const v = liveView(gg, id)
      return v ? buyLimit(gg, v.a, v.b) : 'You no longer own this.'
    },
    input: {
      kind: 'slider',
      money: true,
      label: `How much? You have ${formatMoney(fin(g.character.money))}.`,
      min,
      max,
      defaultValue: () => String(def),
      roundDefault: true,
      preview: (gg, dollars) => {
        const v = liveView(gg, id)
        return v ? buyPreview(gg, v.a, v.b, dollars) : ''
      },
    },
    run: (gg, input) => {
      const live = findBusiness(gg, id)
      if (live) buyOwnShares(gg, live, bizOf(gg, live), Number(input))
    },
    stayOpen: true,
  }
}

function sellAction(id: string, stake: number, sharesOut: number): MenuAction {
  return {
    type: 'action',
    id: `inv-own-sell-${id}`,
    label: 'Sell Shares',
    emoji: '💸',
    subtitle: `Two sales a year · ${sharesText(stake * sharesOut)}`,
    disabledReason: (gg) => {
      const v = liveView(gg, id)
      return v ? sellLimit(gg, v.a, v.b) : 'You no longer own this.'
    },
    input: {
      kind: 'slider',
      label: 'Percent of your shares to sell',
      min: 1,
      max: 100,
      step: 1,
      unit: '%',
      defaultValue: () => '10',
      preview: (gg, percent) => {
        const v = liveView(gg, id)
        return v ? sellNote(gg, v.a, v.b, percent / 100) : ''
      },
    },
    run: (gg, input) => {
      sellOwnShares(gg, id, Number(input) / 100)
    },
    stayOpen: true,
  }
}

/**
 * What the screen shows. It starts from a fresh read every time: both actions keep the screen open,
 * so a node held across a trade must show the stake after it, never the one it was built with.
 */
function screen(g: GameState, l: OwnListing): MenuNode[] {
  const cur = ownListings(g).find((x) => x.kind === l.kind && x.id === l.id)
  if (!cur) return [{ type: 'info', id: 'gone', text: stillHeld(g, l) ? "It isn't listed any more." : 'You no longer own this.' }]
  const group = cur.kind === 'group'
  const view = group ? null : liveView(g, cur.id)
  const texts: string[] = [
    `Market cap: ${money(cur.marketCap)} · ${TIER_LABEL[cur.tier]}`,
    `Price: ${formatPrice(cur.price)}${sinceIpo(cur.price, cur.ipoPrice)}`,
    group ? `Your stake: ${pct(cur.stake, 1)} of the group, worth ${money(cur.stakeValue)}` : `Your stake: ${sharesText(cur.stake * cur.sharesOut)}, ${pct(cur.stake, 1)}, worth ${money(cur.stakeValue)}`,
    `Outside shareholders: ${pct(cur.outside, 1)}${cur.family > 0 ? ` · relatives ${pct(cur.family, 1)}` : ''}${cur.executives > 0 ? ` · executives ${pct(cur.executives, 1)}` : ''}`,
    `Listed on the ${cur.exName} (${cur.exCode}) since ${cur.ipoYear}.`,
  ]
  if (group) texts.push("Trade its shares from the group's screen under Businesses.")
  else {
    const last = view ? readDividend(view.b.dividend)?.last : undefined
    if (last && last.perShare > 0) texts.push(lastDividend(last, cur.price))
    texts.push(`At 50% or more you control the board. You hold ${pct(cur.stake, 1)}.`)
    texts.push(`Buying costs at least ${pct(BUY_PREMIUM)} over the market price, more for big orders. Selling pays ${pct(capitalGainsRate(g))} tax on the gain.`)
  }
  const nodes: MenuNode[] = texts.map((text, n): MenuInfo => ({ type: 'info', id: `${rowId(cur)}-i${n}`, text }))
  if (view) {
    nodes.push({ type: 'heading', id: `${rowId(cur)}-h`, label: 'Trade' })
    nodes.push(buyAction(g, cur.id, view.a, view.b), sellAction(cur.id, cur.stake, cur.sharesOut))
  }
  return nodes
}

/** The Stocks row for one listing, and the company screen behind it. A group's screen has no actions. */
export function ownListingNode(l: OwnListing): MenuGroup {
  const label = labelOf(l)
  return {
    type: 'menu',
    id: rowId(l),
    label,
    emoji: EMOJI,
    subtitle: `${formatPrice(l.price)} · ${TIER_LABEL[l.tier]} · yours ${pct(l.stake, l.stake < 0.1 ? 1 : 0)} · ${l.exCode}`,
    header: () => `${EMOJI} ${label}`,
    children: (g) => screen(g, l),
  }
}

/** Everything you own that trades, as rows for the Stocks list: where it trades, its size, and the row. */
export function ownStockRows(g: GameState): OwnStockRow[] {
  return ownListings(g).map((l) => ({ exKey: l.exKey, size: TIER_LABEL[l.tier], node: ownListingNode(l) }))
}

registerOwnListings(ownStockRows)
