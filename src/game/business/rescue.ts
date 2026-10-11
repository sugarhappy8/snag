import { seeded } from '../assets'
import { addMoney, log, notice, useYearAction, yearActionsUsed } from '../core'
import type { Asset, GameState, MenuNode } from '../types'
import { boardAllows, ownerControls } from './board'
import { payableCash, runningCosts } from './board-vote'
import { groupIdOf } from './conglomerate-state'
import { refreshValue, valuationOf } from './economy'
import { manageBlock } from './gate'
import { bizOf, diluteBusinessEquity, executiveEquity, findBusiness, readBiz, type BizState } from './state'
import { clampN, money, pct } from './util'

export function rescuePosition(b: BizState) {
  const burn = Math.max(0, -(b.last?.net ?? 0))
  const annual = Math.max(1, runningCosts(b))
  return { burn, annual, runway: Math.max(0, b.cash) / Math.max(1, burn || annual),
    need: Math.max(0, (burn || annual) * .5 - b.cash) }
}
export type EquityTransaction = 'secondary' | 'subscribe' | 'buyback'
export function equityQuote(g: GameState, a: Asset, b: BizState, kind: EquityTransaction, amount: number) {
  const value = Math.max(1, b.valuation, valuationOf(b))
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
  return manageBlock(g, a) ?? (groupIdOf(b) ? 'Division ownership is controlled by the parent. Use group treasury transfers or inject capital without changing ownership.' :
    !ownerControls(g, a) ? 'You need board control to negotiate this transaction.' :
    yearActionsUsed(g, `equity.${a.id}`) ? 'One ownership transaction per company per year.' :
    kind !== 'subscribe' && equityQuote(g, a, b, kind, 0).available <= 0 ? 'No outside shareholders are offering shares this year. CEO shares are excluded.' : null)
}
export function transactEquity(g: GameState, id: string, kind: EquityTransaction, amount: number): boolean {
  const a = findBusiness(g, id)
  if (!a || !Number.isFinite(amount) || amount < 1 || !['secondary', 'subscribe', 'buyback'].includes(kind)) return false
  amount = Math.round(amount)
  const b = bizOf(g, a)
  const why = block(g, a, b, kind), q = equityQuote(g, a, b, kind, amount)
  if (why || amount > q.max + .001) { notice(g, 'Ownership Transaction', why ?? 'Insufficient available funds or shares.'); return false }
  if (!boardAllows(g, a, b, { kind: kind === 'buyback' ? 'dividend' : 'merge', by: 'owner', amount, merit: kind === 'subscribe' && b.cash < 0 ? 1 : 0, label: `${kind}: ${money(amount)}` })) return false
  if (!useYearAction(g, `equity.${a.id}`, 1)) return false
  if (kind === 'subscribe') {
    addMoney(g, -amount); b.cash += amount; b.invested += amount
    const retain = q.value / (q.value + amount)
    diluteBusinessEquity(b, retain)
    if (b.public) b.sharesOut /= retain
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
    if (b.public) b.sharesOut *= 1 - q.units
    b.pref = (b.pref ?? 0) * (1 - q.units / Math.max(.0001, 1 - b.share))
    b.valuation = Math.max(0, q.value - amount)
  }
  b.share = q.share
  if (b.public && b.sharesOut > 0) b.sharePrice = b.valuation / b.sharesOut
  refreshValue(a, b)
  log(g, `${a.name}: ${kind === 'subscribe' ? 'I subscribed to new equity' : kind === 'secondary' ? 'I bought existing investor shares' : 'the company repurchased outside shares'} for ${money(amount)}. My ownership is ${pct(b.share, 2)}.`)
  notice(g, 'Ownership Updated', `${pct(b.share, 2)} owned. Company cash ${money(b.cash)}. ${kind === 'secondary' ? 'The seller received the payment; no cash entered the business.' : kind === 'subscribe' ? 'Cash entered the business; other holdings were diluted. This is financing, not revenue.' : 'Company cash paid the sellers. This is not a rescue or an operating expense.'}`)
  return true
}

export function rescueNodes(g: GameState, a: Asset): MenuNode[] {
  const b = readBiz(g, a), pos = rescuePosition(b)
  const rows: MenuNode[] = [{ type: 'info', id: `rescue.${a.id}.position`, emoji: '🛟', text: `Cash ${money(b.cash)} · debt ${money(b.debt)} · annual loss ${money(pos.burn)} · ${pos.runway.toFixed(1)} years ${pos.burn ? 'at current burn' : 'base-cost buffer'}. Stabilization target ${money(pos.need)} (six months). Capital does not fix weak demand. Use loans, staffing/pay policy and site closures below to restructure.` }]
  for (const kind of ['secondary', 'subscribe', 'buyback'] as const) {
    const label = kind === 'secondary' ? 'Buy Existing Investor Shares' : kind === 'subscribe' ? 'Subscribe to New Equity' : 'Company-Funded Share Buyback'
    const q = equityQuote(g, a, b, kind, 0)
    rows.push({ type: 'action', id: `rescue.${a.id}.${kind}`, label, emoji: '📊', disabledReason: gg => { const aa = findBusiness(gg, a.id); return aa ? block(gg, aa, readBiz(gg, aa), kind) ?? (equityQuote(gg, aa, readBiz(gg, aa), kind, 0).max < 1 ? 'No funds or eligible shares available.' : null) : 'Company unavailable.' },
      input: { kind: 'slider', money: true, label: 'Transaction amount', min: 1, max: Math.max(1, Math.floor(q.max)), defaultValue: () => String(Math.max(1, Math.floor(Math.min(q.max, pos.need || 10000)))),
        preview: (gg, n) => { const aa = findBusiness(gg, a.id); if (!aa) return 'Company unavailable.'; const bb = readBiz(gg, aa), quote = equityQuote(gg, aa, bb, kind, n); return `Ownership ${pct(bb.share, 2)} → ${pct(quote.share, 2)} · personal cash ${money(gg.character.money - (kind === 'buyback' ? 0 : n))} · company cash ${money(bb.cash + (kind === 'subscribe' ? n : kind === 'buyback' ? -n : 0))}. ${kind === 'secondary' ? 'Money goes to the seller.' : kind === 'subscribe' ? 'Existing shareholders are diluted at current valuation.' : 'Spends surplus company cash; no rescue benefit.'}` } }, run: (gg, input) => { transactEquity(gg, a.id, kind, Number(input)) } })
  }
  return rows
}
