// Fictional criminal-economy simulation. Lots, staff and risk are deliberately abstract;
// no real substances, production methods, concealment procedures or practical advice.
import { addHidden, formatMoney, log, netWorth, notice, spend, useYearAction, yearActionsUsed } from './core'
import { arrestPlayer } from './crime'
import { chance, randInt } from './rng'
import { ownerKey, peek, stableRoll } from './special/common'
import { bizOf, businessAssets, readBiz } from './business/state'
import { refreshValue, valuationOf } from './business/economy'
import { isFinanceFirm } from './business/finance-firm-state'
import type { GameState, Json, MenuGroup, MenuNode } from './types'

type Segment = 'street' | 'private'
type Role = 'operations' | 'distribution' | 'controller'
interface Crew { role: Role; skill: number; salary: number }
export interface UnderworldState {
  v: number; dirtyCash: number; heat: number; inventory: number; premiumInventory: number;
  name: string; founded: number; scale: number; segment: Segment; crew: Crew[];
  lastYear: number; lastRevenue: number; lastCosts: number; ledger: string[];
}
const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
const finite = (v: unknown, fallback = 0, max = 1e12): number => typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : fallback
const roles: Role[] = ['operations', 'distribution', 'controller']
// A manually traded "lot" is one quote unit. An established enterprise moves batches of those
// units: regular lots are smaller and turn over faster; premium lots tie up much more capital.
// These multipliers let skilled staff earn back payroll at useful scale without changing the
// manual market's buy/sell spread.
const annualBatch: Record<Segment, number> = { street: 20, private: 5 }
function readCrew(value: unknown): Crew[] {
  if (!Array.isArray(value)) return []
  const out: Crew[] = []
  for (const raw of value) {
    const c = object(raw)
    if (!roles.includes(c.role as Role) || out.some(other => other.role === c.role)) continue
    out.push({ role: c.role as Role, skill: finite(c.skill, 30, 100), salary: finite(c.salary, 30_000, 150_000) })
    if (out.length === 3) break
  }
  return out
}
export function underworldView(g: GameState): UnderworldState {
  const p = object(peek(g, 'underworld'))
  const rawLastYear = typeof p.lastYear === 'number' && Number.isFinite(p.lastYear) ? Math.round(p.lastYear) : -1
  return { v: 1, dirtyCash: finite(p.dirtyCash), heat: finite(p.heat, 0, 100), inventory: Math.floor(finite(p.inventory, 0, 1e6)), premiumInventory: Math.floor(finite(p.premiumInventory, 0, 1e6)),
    name: typeof p.name === 'string' ? p.name.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60) : '', founded: Math.round(finite(p.founded, g.year, g.year)), scale: Math.max(1, Math.floor(finite(p.scale, 1, 10))), segment: p.segment === 'private' ? 'private' : 'street',
    crew: readCrew(p.crew),
    lastYear: Math.max(-1, Math.min(g.year - 1, rawLastYear)),
    lastRevenue: finite(p.lastRevenue), lastCosts: finite(p.lastCosts), ledger: Array.isArray(p.ledger) ? p.ledger.filter((s): s is string => typeof s === 'string').slice(-8).map(s => s.slice(0, 180)) : [] }
}
function save(g: GameState, p: UnderworldState): void { g.flags['special.underworld'] = { ...p, owner: ownerKey(g) } as unknown as Json }
function record(p: UnderworldState, line: string): void { p.ledger = [...p.ledger, line].slice(-8) }
function block(g: GameState): string | null { return !g.character.alive ? 'You are no longer alive.' : g.character.age < 18 ? 'Adults only.' : g.character.prison ? 'Unavailable while imprisoned.' : null }
function privateBlock(g: GameState): string | null { return netWorth(g) < 5_000_000 ? `The ultra-rich market requires net worth of at least ${formatMoney(5_000_000)}.` : null }
/** Stable quotes; selling always receives less than buying in the same year. */
export function undergroundQuote(g: GameState, segment: Segment): { buy: number; sell: number } {
  const base = segment === 'private' ? 12_000 : 1_000
  const market = .75 + stableRoll(g, `underworld.quote.${segment}`) * .5
  return { buy: Math.round(base * market), sell: Math.round(base * market * .7) }
}
export function tradeUnderground(g: GameState, segment: Segment, buy: boolean): boolean {
  if (block(g) || !['street', 'private'].includes(segment) || (segment === 'private' && privateBlock(g)) || yearActionsUsed(g, 'underworld.trade') >= 6) return false
  const p = underworldView(g), quote = undergroundQuote(g, segment), key = segment === 'private' ? 'premiumInventory' : 'inventory'
  if (buy && p.dirtyCash < quote.buy && g.character.money < quote.buy) return false
  if (!buy && p[key] <= 0) return false
  if (!useYearAction(g, 'underworld.trade', 6)) return false
  if (buy) {
    if (p.dirtyCash >= quote.buy) p.dirtyCash -= quote.buy
    else if (!spend(g, quote.buy)) return false
    p[key] += 1
  } else { p[key] -= 1; p.dirtyCash += quote.sell }
  p.heat = Math.min(100, p.heat + (segment === 'private' ? 5 : 3))
  addHidden(g, 'karma', -2)
  save(g, p)
  notice(g, 'Fictional Drug Market', `${buy ? 'Bought' : 'Sold'} one abstract ${segment === 'private' ? 'Aurora' : 'Nightglass'} lot for ${formatMoney(buy ? quote.buy : quote.sell)}. Receipts remain unlaundered; they are not personal bank money. Heat ${Math.round(p.heat)}/100.`, { emoji: '🌑' })
  return true
}
export function foundUnderground(g: GameState, name: string): boolean {
  const clean = name.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60)
  if (block(g) || !clean || underworldView(g).name || g.character.money < 50_000 || !spend(g, 50_000)) return false
  const p = underworldView(g)
  p.name = clean; p.founded = g.year; p.dirtyCash += 50_000; p.scale = 1
  record(p, `${g.year}: founded with ${formatMoney(50_000)} of your own money.`)
  save(g, p)
  notice(g, 'Underground Enterprise', `${clean} is a fictional criminal enterprise. Its treasury is separate from your bank. Hire a crew, choose a market, and age up to resolve abstract production, sales, wages and enforcement. Money can be lost or seized.`, { emoji: '🌑' })
  return true
}
export function hireUnderworldCrew(g: GameState, role: Role): boolean {
  const p = underworldView(g)
  if (block(g) || !p.name || !roles.includes(role) || p.crew.some(c => c.role === role) || p.dirtyCash < 5_000 || yearActionsUsed(g, 'underworld.hire') >= 3) return false
  if (!useYearAction(g, 'underworld.hire', 3)) return false
  const skill = randInt(g, 45, 90), salary = 12_000 + skill * 300
  p.dirtyCash -= 5_000; p.crew.push({ role, skill, salary }); save(g, p)
  notice(g, 'Crew Hired', `${role}: skill ${skill}/100, annual pay ${formatMoney(salary)}, recruiting cost ${formatMoney(5_000)}. Staff quality affects production, demand and risk, never guarantees safety.`, { emoji: '👤' })
  return true
}
export function fundUnderground(g: GameState, amount: number): boolean {
  const p = underworldView(g)
  const whole = Math.round(amount)
  if (block(g) || !p.name || !Number.isFinite(amount) || whole < 1 || whole > 1e9 || !spend(g, whole)) return false
  p.dirtyCash = Math.min(1e12, p.dirtyCash + whole); save(g, p); return true
}

/** Current, controlled operating companies with genuine immediately-prior-year sales. */
export function launderingFronts(g: GameState) {
  return businessAssets(g).filter(a => {
    const b = readBiz(g, a)
    return b.share > .5 && b.last?.year === g.year - 1 && b.last.revenue > 0 && !isFinanceFirm(b)
  })
}
/** Abstract risky conversion into a controlled operating company's books. Not a real method. */
export function launderUnderworld(g: GameState, assetId: string): boolean {
  if (block(g) || yearActionsUsed(g, 'underworld.launder') >= 1) return false
  // Resolve from the current portfolio on every click. A row captured before a sale, seizure,
  // dilution or year change cannot keep using the old company as a front.
  const a = launderingFronts(g).find(a => a.id === assetId)
  if (!a) return false
  const read = readBiz(g, a)
  if (!read.last) return false
  const p = underworldView(g), amount = Math.floor(Math.min(p.dirtyCash, read.last.revenue * .05, 250_000))
  if (amount < 100 || !useYearAction(g, 'underworld.launder', 1)) return false
  p.dirtyCash -= amount; p.heat = Math.min(100, p.heat + 15)
  const detected = chance(g, .12 + p.heat / 250)
  if (detected) {
    record(p, `${g.year}: ${formatMoney(amount)} seized during a financial investigation.`); save(g, p)
    log(g, `Investigators seized criminal funds linked to ${a.name}.`, 'bad')
    arrestPlayer(g, 'Money Laundering', 3)
  } else {
    const b = bizOf(g, a), recovered = Math.floor(amount * .65)
    b.cash += recovered; b.yearIncome += recovered
    b.valuation = valuationOf(b); refreshValue(a, b)
    record(p, `${g.year}: risky conversion placed ${formatMoney(recovered)} in ${a.name}; remainder lost.`); save(g, p)
    notice(g, 'Criminal Funds Converted', `${formatMoney(recovered)} reached ${a.name}'s corporate treasury. The remaining 35% was lost. This is taxable company income, not personal cash; ordinary corporate withdrawals still apply. Exposure increased.`, { emoji: '⚠️' })
  }
  return true
}
export function yearlyUnderworld(g: GameState): void {
  const stored = peek<Record<string, unknown>>(g, 'underworld')
  if (!stored || !g.character.alive) return
  const p = underworldView(g), fiscal = g.year - 1
  if (p.lastYear >= fiscal) {
    // Persist normalization when a malformed far-future guard was clamped. Otherwise the raw
    // value would be clamped again on every birthday and permanently suppress the enterprise.
    if (stored.lastYear !== p.lastYear) save(g, p)
    return
  }
  p.lastYear = fiscal; p.lastRevenue = 0; p.lastCosts = 0
  if (p.name && p.founded <= fiscal && !g.character.prison) {
    const skill = (role: Role): number => p.crew.find(c => c.role === role)?.skill ?? 15
    const payroll = p.crew.reduce((sum, c) => sum + c.salary, 0)
    const affordablePay = Math.min(p.dirtyCash, payroll)
    p.dirtyCash -= affordablePay; p.lastCosts += affordablePay
    if (affordablePay < payroll) { p.crew = p.crew.filter(() => chance(g, .4)); record(p, `${fiscal}: missed payroll; crew members walked away.`) }
    if (p.segment === 'private' && privateBlock(g)) {
      p.heat = Math.max(0, p.heat - 5)
      record(p, `${fiscal}: the ultra-rich market was inaccessible; premium production and sales paused.`)
      log(g, `${p.name}: the ultra-rich market was inaccessible after your net worth fell below ${formatMoney(5_000_000)}. Premium production and sales paused.`, 'bad')
    } else {
      const premium = p.segment === 'private', unitCost = premium ? 7_000 : 600
      const batch = annualBatch[p.segment]
      const lots = Math.min(Math.floor(p.dirtyCash / unitCost), Math.floor(p.scale * (4 + skill('operations') / 4) * batch))
      const cost = lots * unitCost
      p.dirtyCash -= cost; p.lastCosts += cost
      const key = premium ? 'premiumInventory' : 'inventory'
      p[key] = Math.min(1e6, p[key] + lots)
      const demand = Math.floor(p.scale * (5 + skill('distribution') / 3) * (.6 + stableRoll(g, 'underworld.demand') * .8) * batch)
      const sold = Math.min(p[key], demand), price = undergroundQuote(g, p.segment).sell
      p[key] -= sold; p.lastRevenue = sold * price; p.dirtyCash = Math.min(1e12, p.dirtyCash + p.lastRevenue)
      const volumeHeat = sold / (premium ? 40 : 100)
      p.heat = Math.min(100, p.heat + p.scale * 3 + volumeHeat - skill('controller') / 25)
      record(p, `${fiscal}: ${sold} fictional lots sold; receipts ${formatMoney(p.lastRevenue)}, costs ${formatMoney(p.lastCosts)}.`)
      log(g, `${p.name}: criminal receipts ${formatMoney(p.lastRevenue)}, costs ${formatMoney(p.lastCosts)}; funds remain unlaundered.`, p.lastRevenue >= p.lastCosts ? 'neutral' : 'bad')
    }
  } else p.heat = Math.max(0, p.heat - 8)
  const exposed = !g.character.prison && p.heat > 0 && chance(g, p.heat / 500)
  if (exposed) {
    const seized = Math.round(p.dirtyCash * .6); p.dirtyCash -= seized; p.inventory = 0; p.premiumInventory = 0; p.heat = Math.max(0, p.heat - 20)
    record(p, `${fiscal}: enforcement seized ${formatMoney(seized)} and all inventory.`)
    save(g, p); arrestPlayer(g, 'Drug Trafficking', 3)
  } else { p.heat = Math.max(0, p.heat - 3); save(g, p) }
}

function marketMenu(segment: Segment): MenuGroup {
  return { type: 'menu', id: `underworld.market.${segment}`, label: segment === 'private' ? 'Ultra-Rich Drug Market' : 'Regular Drug Market', emoji: segment === 'private' ? '🥂' : '🌑',
    disabledReason: g => block(g) ?? (segment === 'private' ? privateBlock(g) : null),
    header: g => { const q = undergroundQuote(g, segment); return `Fictional ${segment === 'private' ? 'Aurora' : 'Nightglass'} lots. Buy ${formatMoney(q.buy)} · sell ${formatMoney(q.sell)}. Quotes change yearly; six shared market trades per year. No consumption or production instructions.` },
    children: g => [true, false].map(buy => ({ type: 'action', id: `underworld.trade.${segment}.${buy ? 'buy' : 'sell'}`, label: `${buy ? 'Buy' : 'Sell'} One Fictional Lot`, emoji: buy ? '📦' : '💵',
      disabledReason: gg => block(gg) ?? (segment === 'private' ? privateBlock(gg) : null) ?? (yearActionsUsed(gg, 'underworld.trade') >= 6 ? 'All six trades used this year.' : buy ? (underworldView(gg).dirtyCash < undergroundQuote(gg, segment).buy && gg.character.money < undergroundQuote(gg, segment).buy ? 'Not enough money.' : null) : underworldView(gg)[segment === 'private' ? 'premiumInventory' : 'inventory'] <= 0 ? 'No inventory.' : null),
      run: gg => { tradeUnderground(gg, segment, buy) }, subtitle: `${buy ? 'Cash paid, heat increases' : 'Proceeds remain unlaundered'} · ${g.year}` })) }
}
export const underworldMenu: MenuGroup = {
  type: 'menu', id: 'underworld', label: 'Drug Markets & Underground Empire', emoji: '🌑', disabledReason: block,
  subtitle: 'Fictional criminal enterprise · separate treasury · enforcement risk',
  header: g => { const p = underworldView(g); return `${p.name || 'No enterprise'} · unlaundered funds ${formatMoney(p.dirtyCash)} · heat ${Math.round(p.heat)}/100\nRegular inventory ${p.inventory}; luxury inventory ${p.premiumInventory}. These funds are not your bank balance. All markets and production are abstract fiction.${p.ledger.length ? `\n${p.ledger.join('\n')}` : ''}` },
  children: g => {
    const p = underworldView(g), nodes: MenuNode[] = [marketMenu('street'), marketMenu('private')]
    if (!p.name) { nodes.push({ type: 'action', id: 'underworld.found', label: 'Start a Drug Empire', emoji: '🏴', subtitle: `${formatMoney(50_000)} startup capital at risk`, input: { kind: 'text', label: 'Enterprise name', placeholder: 'Fictional enterprise name' }, disabledReason: gg => block(gg) ?? (gg.character.money < 50_000 ? 'Not enough startup capital.' : null), confirm: () => 'Start an abstract fictional criminal business? Staff costs, seizures, imprisonment and financial losses are possible.', run: (gg, input) => { foundUnderground(gg, input ?? '') } }); return nodes }
    nodes.push({ type: 'info', id: 'underworld.operation', text: `Scale ${p.scale}/10 · ${p.segment === 'private' ? 'luxury' : 'regular'} market. Last receipts ${formatMoney(p.lastRevenue)}, costs ${formatMoney(p.lastCosts)}. Crew: ${p.crew.map(c => `${c.role} ${c.skill}/100, ${formatMoney(c.salary)}/year`).join('; ') || 'none—low skill and low capacity'}.`, emoji: '📒' },
      { type: 'action', id: 'underworld.fund', label: 'Contribute Operating Capital', emoji: '💵', subtitle: 'Moves your own bank money; never creates income', input: { kind: 'number', money: true, label: 'Contribution', min: 1, max: 1e9 }, run: (gg, input) => { fundUnderground(gg, Number(input)) } })
    for (const role of roles) nodes.push({ type: 'action', id: `underworld.hire.${role}`, label: `Hire ${role}`, emoji: '👤', subtitle: `${formatMoney(5_000)} recruiting + annual wages`, disabledReason: gg => underworldView(gg).crew.some(c => c.role === role) ? 'Position filled.' : underworldView(gg).dirtyCash < 5_000 ? 'Enterprise treasury needs recruiting funds.' : block(gg), run: gg => { hireUnderworldCrew(gg, role) } })
    for (const segment of ['street', 'private'] as const) nodes.push({ type: 'action', id: `underworld.segment.${segment}`, label: `Target the ${segment === 'private' ? 'Ultra-Rich' : 'Regular'} Market`, emoji: '🎯', disabledReason: gg => block(gg) ?? (segment === 'private' ? privateBlock(gg) : null), run: gg => { if (block(gg) || (segment === 'private' && privateBlock(gg))) return; const v = underworldView(gg); v.segment = segment; save(gg, v) } })
    nodes.push({ type: 'action', id: 'underworld.expand', label: 'Expand the Enterprise', emoji: '📈', subtitle: `${formatMoney(30_000)} from enterprise treasury · more capacity and enforcement risk`, disabledReason: gg => block(gg) ?? (underworldView(gg).scale >= 10 ? 'Maximum scale.' : underworldView(gg).dirtyCash < 30_000 ? 'Not enough enterprise funds.' : yearActionsUsed(gg, 'underworld.expand') >= 1 ? 'Already expanded this year.' : null), run: gg => { const v = underworldView(gg); if (block(gg) || v.scale >= 10 || v.dirtyCash < 30_000 || !useYearAction(gg, 'underworld.expand', 1)) return; v.dirtyCash -= 30_000; v.scale++; v.heat = Math.min(100, v.heat + 8); save(gg, v) } })
    nodes.push({ type: 'menu', id: 'underworld.launder', label: 'Money Laundering — Abstract Risk', emoji: '⚠️', subtitle: 'Once/year · controlled operating front · 35% loss · investigation risk', header: () => `A fictional risk/reward choice, not a real laundering method. Requires a majority-owned operating company with genuine prior-year sales. Banks and investment firms are excluded. Limited to 5% of its turnover and ${formatMoney(250_000)} per year; proceeds remain taxable corporate money.`, children: gg => launderingFronts(gg).map(a => ({ type: 'action', id: `underworld.front.${a.id}`, label: a.name, emoji: a.emoji, disabledReason: ggg => block(ggg) ?? (yearActionsUsed(ggg, 'underworld.launder') >= 1 ? 'Already attempted this year.' : underworldView(ggg).dirtyCash < 100 ? 'Not enough unlaundered funds.' : null), confirm: () => 'Risk seizure and imprisonment? Successfully converted funds go into the company, not directly into your bank.', run: ggg => { launderUnderworld(ggg, a.id) } })) })
    nodes.push({ type: 'action', id: 'underworld.close', label: 'Dismantle the Enterprise', emoji: '🚪', subtitle: 'Forfeit treasury and inventory; no guaranteed immunity', confirm: () => 'Forfeit all enterprise funds, staff and inventory? Heat survives and authorities may still investigate.', run: gg => { if (block(gg)) return; const v = underworldView(gg); v.name = ''; v.crew = []; v.dirtyCash = 0; v.inventory = 0; v.premiumInventory = 0; record(v, `${gg.year}: enterprise dismantled; funds forfeited.`); save(gg, v) } })
    return nodes
  },
}
