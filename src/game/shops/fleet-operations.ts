import { addMoney, count, earnIncome, formatMoney, log, notice, spend } from '../core'
import { gate, payForAction } from '../activities/common'
import { economyOf } from '../economy'
import { isIndustryLegal } from '../data/markets'
import { chance, randFloat } from '../rng'
import type { Asset, GameState, Json, MenuGroup } from '../types'

export interface CharterOperation { v: 1; weeks: number; price: number; insured: boolean; lastYear: number; gross: number; expenses: number; net: number; booked: number }
const finite = (x: unknown, fallback: number, lo: number, hi: number) => typeof x === 'number' && Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : fallback
export function charterOf(a: Asset): CharterOperation {
  const raw = a.details.charterOperation, x = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  return { v: 1, weeks: Math.floor(finite(x.weeks, 10, 0, 20)), price: finite(x.price, 1, .5, 2), insured: x.insured !== false,
    lastYear: finite(x.lastYear, -1, -1, 100000), gross: finite(x.gross, 0, 0, 1e15), expenses: finite(x.expenses, 0, 0, 1e15), net: finite(x.net, 0, -1e15, 1e15), booked: finite(x.booked, 0, 0, 20) }
}
const save = (a: Asset, p: CharterOperation) => { a.details.charterOperation = p as unknown as Json }
function eligible(g: GameState, a: Asset): boolean { return ['boat', 'aircraft'].includes(a.kind) && isIndustryLegal(typeof a.details.countryId === 'string' ? a.details.countryId : g.character.countryId, 'travel') }
export function configureCharter(g: GameState, id: string, setting: 'weeks' | 'price' | 'insured' | 'enabled', value: number): boolean {
  const a = g.assets.find(a => a.id === id)
  if (!a || gate(g, { minAge: 18 }) || !eligible(g, a) || !Number.isFinite(value)) return false
  const p = charterOf(a)
  if (setting === 'weeks' && Number.isInteger(value) && value >= 0 && value <= 20) p.weeks = value
  else if (setting === 'price' && value >= .5 && value <= 2) p.price = value
  else if (setting === 'insured' && [0, 1].includes(value)) p.insured = !!value
  else if (setting === 'enabled' && [0, 1].includes(value)) {
    if (value && a.condition < 50) return false
    if (value && a.details.chartered !== true && !payForAction(g, Math.max(250, a.value * .001))) return false
    a.details.chartered = !!value
  } else return false
  save(a, p)
  notice(g, 'Charter Operations', `Availability ${p.weeks} weeks · asking rate ${Math.round(p.price * 100)}% of market · ${p.insured ? 'commercial incident cover' : 'uninsured incidents'}. A licensed charter operator supplies crew. Operating cash is required before bookings; ordinary upkeep remains separate.`, { emoji: '🧾' })
  return true
}
export function settleCharter(g: GameState, a: Asset): void {
  if (!g.character.alive || a.details.chartered !== true || !eligible(g, a)) return
  const p = charterOf(a)
  if (p.lastYear >= g.year) return
  p.lastYear = g.year; p.gross = 0; p.expenses = 0; p.net = 0; p.booked = 0
  if (a.condition < 40 || p.weeks === 0) { save(a, p); return }
  const e = economyOf(g, typeof a.details.countryId === 'string' ? a.details.countryId : g.character.countryId)
  const demand = Math.min(1, Math.max(.02, .7 * e.sectors.leisure.demand * e.confidence * (a.condition / 100) / p.price ** 1.8))
  const weeks = Math.min(p.weeks, Math.floor(p.weeks * demand * randFloat(g, .7, 1.3)))
  const weekly = a.value * (a.kind === 'aircraft' ? .004 : .008), gross = Math.round(weekly * p.price * weeks)
  const luxuryCrew = a.details.luxury === 'jet' || a.details.luxury === 'megayacht'
  const operating = Math.round(weekly * weeks * .35 * e.sectors.energy.costs + a.value * (luxuryCrew ? .001 : .003) + (p.insured ? a.value * .002 : 0))
  if (g.character.money < operating) { save(a, p); log(g, `I paused charters of ${a.name}: operating cash was insufficient.`, 'bad'); return }
  spend(g, operating, 'purchase')
  const commission = Math.round(gross * .2), incident = weeks > 0 && chance(g, .025 + (100 - a.condition) / 1000)
  const repair = incident ? Math.round(a.value * .015 * (p.insured ? .2 : 1)) : 0
  // Crew/fuel are paid up front; fees and insured excess are settled from receipts.
  addMoney(g, gross - commission - repair, 'sales')
  p.gross = gross; p.expenses = operating + commission + repair; p.net = gross - p.expenses; p.booked = weeks
  // The pair makes the net taxable without moving it: two rows that cancel in the player's cash.
  if (p.net > 0) { addMoney(g, -p.net, 'purchase'); earnIncome(g, p.net, 'royalty') }
  a.condition = Math.max(0, a.condition - weeks * .2 - (incident ? 7 : 0))
  count(g, 'charterIncome', Math.max(0, p.net)); save(a, p)
  log(g, `${a.name}: ${weeks} charter weeks, ${formatMoney(gross)} gross, ${formatMoney(p.expenses)} operating costs, ${formatMoney(p.net)} net before ordinary upkeep.${incident ? ' An incident required repairs.' : ''}`, p.net > 0 ? 'good' : 'bad')
}
export function charterMenu(a: Asset): MenuGroup {
  return { type: 'menu', id: `charter.operations.${a.id}`, label: 'Charter Operations', emoji: '🧾', disabledReason: g => gate(g, { minAge: 18 }) ?? (eligible(g, a) ? null : 'Commercial travel operations are restricted here.'),
    children: g => {
      const live = g.assets.find(x => x.id === a.id)
      if (!live) return []
      const p = charterOf(live)
      return [
        { type: 'info', id: `charter.statement.${a.id}`, text: `${live.details.chartered ? 'Listed' : 'Not listed'} · ${p.weeks} available weeks · ${Math.round(p.price * 100)}% asking rate\nLast year: ${p.booked} booked weeks · Gross ${formatMoney(p.gross)} · Costs ${formatMoney(p.expenses)} · Net ${formatMoney(p.net)}\nCrew, fuel, agency fees and commercial cover are included here. Base upkeep, mortgage and personal trips remain separate. Higher asking prices reduce demand.` },
        { type: 'action', id: `charter.enabled.${a.id}`, label: live.details.chartered ? 'Pause Charters' : 'Hire Licensed Charter Operator', emoji: '🧑‍✈️', subtitle: live.details.chartered ? 'No new bookings until restarted' : `Registration ${formatMoney(Math.max(250, a.value * .001))}; condition 50+ required`, run: gg => { const aa = gg.assets.find(x => x.id === a.id); if (aa) configureCharter(gg, a.id, 'enabled', aa.details.chartered ? 0 : 1) } },
        { type: 'action', id: `charter.weeks.${a.id}`, label: 'Annual Charter Availability', emoji: '📅', input: { kind: 'slider', label: 'Weeks per year', min: 0, max: 20, defaultValue: () => String(p.weeks) }, run: (gg, v) => { configureCharter(gg, a.id, 'weeks', Number(v)) } },
        { type: 'action', id: `charter.price.${a.id}`, label: 'Asking Rate', emoji: '💵', input: { kind: 'slider', label: 'Percent of market rate', min: 50, max: 200, unit: '%', defaultValue: () => String(Math.round(p.price * 100)) }, run: (gg, v) => { configureCharter(gg, a.id, 'price', Number(v) / 100) } },
        { type: 'action', id: `charter.insured.${a.id}`, label: p.insured ? 'Cancel Commercial Incident Cover' : 'Buy Commercial Incident Cover', emoji: '🛡️', subtitle: '0.2% of value per operating year; pays 80% of charter incident repair cost', run: gg => { const aa = gg.assets.find(x => x.id === a.id); if (aa) configureCharter(gg, a.id, 'insured', charterOf(aa).insured ? 0 : 1) } },
      ]
    },
  }
}
