import { seeded } from '../assets'
import { addMoney, log, moneyWith, notice, useYearAction, yearActionsUsed } from '../core'
import type { Asset, GameState, MenuNode } from '../types'
import { boardAllows, ownerControls } from './board'
import { payableCash, runningCosts } from './board-vote'
import { groupIdOf } from './conglomerate-state'
import { refreshValue, valuationOf } from './economy'
import { manageBlock } from './gate'
import { bizOf, diluteBusinessEquity, executiveEquity, findBusiness, readBiz, type BizState } from './state'
import { clampN, money, pct, runwayText } from './util'
import { classFactor, clampFounders, scaleFounders } from './share-classes'
import { DEFAULT_SHARES, MAX_SHARES, MIN_SHARES, retailVerdict, shareCountOf, shareCountText } from './share-structure'

export function rescuePosition(b: BizState) {
  const burn = Math.max(0, -(b.last?.net ?? 0))
  const annual = Math.max(1, runningCosts(b))
  return { burn, annual, runway: Math.max(0, b.cash) / Math.max(1, burn || annual),
    need: Math.max(0, (burn || annual) * .5 - b.cash) }
}
export type EquityTransaction = 'secondary' | 'subscribe' | 'buyback'
/** The year-action key every ownership move shares: Capital & Ownership's three, and a buy from the Stocks row (own-trade.ts). */
export function equityYearKey(assetId: string): string {
  return `equity.${assetId}`
}
export function equityQuote(g: GameState, a: Asset, b: BizState, kind: EquityTransaction, amount: number) {
  // The market's value of the structure: fewer votes sell for less (share-classes.ts), so the price does not jump back.
  const value = Math.max(1, b.valuation, valuationOf(b) * classFactor(b))
  const outside = Math.max(0, 1 - b.share - executiveEquity(b) - (b.familyShares ?? []).reduce((s, x) => s + x.share, 0))
  const willing = b.public || seeded(`share-offer|${a.id}|${g.year}`).chance(.65)
  const available = willing ? Math.min(.15, outside) : 0
  const price = value * (b.public ? 1.03 : 1.15)
  const units = clampN(amount / price, 0, available)
  const share = kind === 'subscribe' ? (b.share * value + amount) / (value + amount) : kind === 'secondary' ? b.share + units : b.share / Math.max(.001, 1 - units)
  const max = kind === 'subscribe' ? Math.max(0, g.character.money) : Math.min(available * price, kind === 'secondary' ? Math.max(0, g.character.money) : Math.max(0, payableCash(a, b) - rescuePosition(b).annual / 2))
  return { value, price, available, units, share: clampN(share, 0, 1), max }
}
function block(g: GameState, a: Asset, b: BizState, kind: EquityTransaction): string | null {
  return manageBlock(g, a) ?? (groupIdOf(b) ? 'The group owns this division. Move money through the group treasury, or use Invest My Own Money.' :
    !ownerControls(g, a) ? 'You need control of the board for this.' :
    yearActionsUsed(g, equityYearKey(a.id)) ? 'One of these a year per company.' :
    kind !== 'subscribe' && equityQuote(g, a, b, kind, 0).available <= 0 ? "No outside investors want to sell this year (the CEO's shares don't count)." : null)
}
export function transactEquity(g: GameState, id: string, kind: EquityTransaction, amount: number): boolean {
  const a = findBusiness(g, id)
  if (!a || !Number.isFinite(amount) || amount < 1 || !['secondary', 'subscribe', 'buyback'].includes(kind)) return false
  amount = Math.round(amount)
  const b = bizOf(g, a)
  const why = block(g, a, b, kind), q = equityQuote(g, a, b, kind, amount)
  if (why || amount > q.max + .001) { notice(g, 'Ownership', why ?? 'Not enough money, or not enough shares for sale.'); return false }
  if (!boardAllows(g, a, b, { kind: kind === 'buyback' ? 'dividend' : 'merge', by: 'owner', amount, merit: kind === 'subscribe' && b.cash < 0 ? 1 : 0, label: `${kind}: ${money(amount)}` })) return false
  if (!useYearAction(g, equityYearKey(a.id), 1)) return false
  // Every move below changes the owner's stake with ordinary shares: the founders' class is no more than what is held now.
  // (A private company's record is only the plan for its IPO; listing sets it again.)
  if (b.public) clampFounders(b)
  if (kind === 'subscribe') {
    addMoney(g, -amount); b.cash += amount; b.invested += amount
    const retain = q.value / (q.value + amount)
    diluteBusinessEquity(b, retain)
    if (b.public) b.sharesOut /= retain
    else if (b.shareCount) b.shareCount = Math.round(clampN(b.shareCount / retain, MIN_SHARES, MAX_SHARES))
    b.valuation = q.value + amount
  } else if (kind === 'secondary') {
    addMoney(g, -amount); b.invested += amount
    b.pref = (b.pref ?? 0) * (1 - q.units / Math.max(.0001, 1 - b.share))
    // Payment leaves to the selling investors; the company receives nothing.
  } else {
    b.cash -= amount
    b.executiveEquity = executiveEquity(b) / (1 - q.units)
    for (const holder of b.familyShares ?? []) holder.share /= 1 - q.units
    if (b.manager?.equity) b.manager.equity /= 1 - q.units
    scaleFounders(b, 1 / (1 - q.units))
    if (b.public) b.sharesOut *= 1 - q.units
    else if (b.shareCount) b.shareCount = Math.round(clampN(b.shareCount * (1 - q.units), MIN_SHARES, MAX_SHARES))
    b.pref = (b.pref ?? 0) * (1 - q.units / Math.max(.0001, 1 - b.share))
    b.valuation = Math.max(0, q.value - amount)
  }
  b.share = q.share
  if (b.public && b.sharesOut > 0) b.sharePrice = b.valuation / b.sharesOut
  refreshValue(a, b)
  log(g, `${a.name}: ${kind === 'subscribe' ? 'I put more of my own money into the company' : kind === 'secondary' ? 'I bought out some of the investors' : 'the company bought back investor shares'} for ${money(amount)}. I own ${pct(b.share, 2)}.`)
  notice(g, 'Ownership Updated', `You own ${pct(b.share, 2)}. Company cash: ${money(b.cash)}. ${kind === 'secondary' ? 'The investors got the money; the company got none.' : kind === 'subscribe' ? "The money is company cash now (not sales), and the other owners' slices shrank." : 'Company cash paid the investors.'}`)
  return true
}

export function rescueNodes(g: GameState, a: Asset): MenuNode[] {
  const b = readBiz(g, a), pos = rescuePosition(b)
  // No "add $0": once cash covers six months, say so.
  const target = pos.need > 0 ? `To be safe, add ${money(pos.need)} so cash covers six months.` : 'Cash already covers six months of costs.'
  const flow = pos.burn ? `losing ${money(pos.burn)} a year, so cash lasts ${runwayText(pos.runway)}` : `cash covers ${runwayText(pos.runway)} of running costs`
  const rows: MenuNode[] = [{ type: 'info', id: `rescue.${a.id}.position`, emoji: '🛟', text: `Cash ${money(b.cash)} · debt ${money(b.debt)} · ${flow}. ${target} More money buys time, not customers: loans, staff and pay, and closing sites are the other fixes.` }]
  const LABELS: Record<EquityTransaction, [string, string]> = {
    secondary: ['Buy Out Investors', 'Buy shares from outside investors; they get the money, the company gets none'],
    subscribe: ['Put In More Money', "Your money goes into the company for new shares; other owners' slices shrink"],
    buyback: ['Company Buys Back Shares', 'Spare company cash buys out investors, so your slice grows'],
  }
  for (const kind of ['secondary', 'subscribe', 'buyback'] as const) {
    const [label, subtitle] = LABELS[kind]
    const q = equityQuote(g, a, b, kind, 0)
    rows.push({ type: 'action', id: `rescue.${a.id}.${kind}`, label, subtitle, emoji: '📊', disabledReason: gg => { const aa = findBusiness(gg, a.id); return aa ? block(gg, aa, readBiz(gg, aa), kind) ?? (equityQuote(gg, aa, readBiz(gg, aa), kind, 0).max < 1 ? 'Not enough money, or no shares for sale.' : null) : 'Company unavailable.' },
      input: { kind: 'slider', money: true, label: 'Amount', min: 1, max: Math.max(1, Math.floor(q.max)), defaultValue: () => String(Math.max(1, Math.floor(Math.min(q.max, pos.need || 10000)))),
        preview: (gg, n) => { const aa = findBusiness(gg, a.id); if (!aa) return 'Company unavailable.'; const bb = readBiz(gg, aa), quote = equityQuote(gg, aa, bb, kind, n); return `You'd own ${pct(bb.share, 2)} → ${pct(quote.share, 2)} · your cash ${money(gg.character.money - (kind === 'buyback' ? 0 : n))} · company cash ${money(bb.cash + (kind === 'subscribe' ? n : kind === 'buyback' ? -n : 0))}. ${kind === 'secondary' ? 'The investors get the money.' : kind === 'subscribe' ? "Priced at today's company value." : "Uses spare company cash; it won't help a struggling company."}` } }, run: (gg, input) => { transactEquity(gg, a.id, kind, Number(input)) } })
  }
  rows.push(shareCountNode(a))
  return rows
}

/**
 * Split (or consolidate) a private company's shares: free, nobody's ownership changes, only what
 * one share is worth, and so how retail investors will see the price at an IPO.
 */
export function setShareCount(g: GameState, id: string, n: number): boolean {
  const a = findBusiness(g, id)
  if (!a || !Number.isFinite(n)) return false
  const b = bizOf(g, a)
  if (b.public || manageBlock(g, a) || groupIdOf(b)) return false
  b.shareCount = Math.round(clampN(n, MIN_SHARES, MAX_SHARES))
  log(g, `${a.name} is now split into ${shareCountText(b.shareCount)} shares.`)
  return true
}

function shareCountNode(a: Asset): MenuNode {
  const each = (b: BizState, n: number) => moneyWith(Math.max(1, b.valuation) / Math.max(1, n), (x) => (x >= 100 ? x.toFixed(0) : x >= 1 ? x.toFixed(2) : x.toPrecision(2)))
  return { type: 'action', id: `rescue.${a.id}.shares`, label: 'Share Count', emoji: '\u{1F9FE}',
    subtitle: (gg) => {
      const aa = findBusiness(gg, a.id); if (!aa) return ''
      const b = readBiz(gg, aa)
      if (b.public) return `${shareCountText(b.sharesOut)} shares listed at ${moneyWith(b.sharePrice, (x) => x.toFixed(2))}`
      const n = shareCountOf(b)
      return n ? `${shareCountText(n)} shares · about ${each(b, n)} each today` : 'Not split yet: an IPO would list at about the usual price per share'
    },
    disabledReason: (gg) => {
      const aa = findBusiness(gg, a.id); if (!aa) return 'Company unavailable.'
      const b = readBiz(gg, aa)
      return manageBlock(gg, aa) ?? (b.public ? 'A listed company trades its shares on the exchange; new issues and buybacks change the count.' : groupIdOf(b) ? 'The group lists as a whole: its shares, not this division’s, go to the market.' : null)
    },
    input: { kind: 'slider', label: 'Total shares', min: MIN_SHARES, max: MAX_SHARES,
      defaultValue: (gg) => { const aa = findBusiness(gg, a.id); return String(aa ? shareCountOf(readBiz(gg, aa)) ?? DEFAULT_SHARES : DEFAULT_SHARES) },
      preview: (gg, n) => { const aa = findBusiness(gg, a.id); if (!aa) return 'Company unavailable.'; const b = readBiz(gg, aa), price = Math.max(1, b.valuation) / Math.max(1, n); return `${shareCountText(n)} shares at about ${each(b, n)} each: ${retailVerdict(price)} (if it listed at today's value). Your ownership stays ${pct(b.share, 2)}.` } },
    run: (gg, input) => { setShareCount(gg, a.id, Number(input)) } }
}
