import { firmCash } from '../cash'
import { formatMoney, notice, useYearAction, yearActionsUsed } from '../core'
import { randInt } from '../rng'
import type { Asset, GameState, MenuNode } from '../types'
import { techPlan, techView } from './deeptech-core'
import { isDeepTech } from './deeptech-state'
import { costFactor, equipmentValue, localEcon, planFor } from './economy'
import { manageBlock } from './gate'
import { bizOf, findBusiness, readBiz, type BizState } from './state'
import { readSupply, supplyProfile } from './supply'
import { effectiveAutomation, effectiveTraining, grantSupplyAutomation, grantSupplyTraining, readSupplyPolicy, saveSupplyPolicy, type InputContract } from './supply-policy-state'
import { clampN, money, pct } from './util'

export const repeatProgramGain = (k: number): number => 1 / (1 + .5 * Math.max(0, k))
export function equipmentUpgradeCost(b: BizState, k: number): number { return Math.round(equipmentValue(b) * .12 * (1 + .5 * Math.max(0, k))) }
export function staffTrainingCost(b: BizState, k: number): number { return Math.round(Math.max(1, b.employees) * 450 * localEcon(b.industry, b.countryId, b.city).level * (1 + .5 * Math.max(0, k))) }

/** The same already-paid Quality actions, reused by manual management and CEOs. */
export function purchaseTraining(g: GameState, a: Asset, b: BizState): number {
  const k = yearActionsUsed(g, `biz.training.${a.id}`), cost = staffTrainingCost(b, k)
  if (!(cost > 0) || b.cash < cost) return 0
  useYearAction(g, `biz.training.${a.id}`, Number.MAX_SAFE_INTEGER)
  firmCash(g, b, -cost, 'inputs', a.id); b.yearCosts += cost
  const gain = repeatProgramGain(k)
  b.quality = clampN(b.quality + Math.max(1, Math.round(randInt(g, 3, 6) * gain)), 0, 100)
  b.morale = clampN(b.morale + Math.max(0, Math.round(randInt(g, 2, 5) * gain)), 0, 100)
  grantSupplyTraining(b, g.year, .2 * gain)
  return cost
}
export function purchaseEquipmentUpgrade(g: GameState, a: Asset, b: BizState): number {
  const k = yearActionsUsed(g, `biz.upgrade.${a.id}`), cost = equipmentUpgradeCost(b, k)
  if (!(cost > 0) || b.cash < cost) return 0
  useYearAction(g, `biz.upgrade.${a.id}`, Number.MAX_SAFE_INTEGER)
  firmCash(g, b, -cost, 'capex', a.id); b.yearCosts += cost
  const gain = repeatProgramGain(k)
  b.quality = clampN(b.quality + Math.max(1, Math.round(randInt(g, 6, 11) * gain)), 0, 100)
  grantSupplyAutomation(b, g.year, .08 * gain)
  return cost
}

export interface InputContractQuote { contract: InputContract; fee: number; spotPrice: number }
export function inputContractQuote(g: GameState, b: BizState, year = g.year): InputContractQuote | null {
  const profile = supplyProfile(b.industry)
  if (!profile) return null
  const p = readSupplyPolicy(b)
  if (p.contract && p.contract.from <= year && p.contract.until >= year) return null
  const plan = isDeepTech(b) ? techPlan(g, b, techView(b), year, { noise: 1 }) : planFor(g, b, year, { noise: 1 })
  const capacity = 'equipmentCapacity' in plan ? plan.equipmentCapacity : plan.capacity
  const spotPrice = Math.min(1e12, Math.max(0, plan.unitCost * (isDeepTech(b) ? 1 : costFactor(b)))) * profile.materialShare
  const quantity = Math.floor(Math.min(1e12, Math.max(0, capacity * .8)))
  if (!(spotPrice > 0) || !(quantity > 0)) return null
  return { contract: { from: year, until: Math.min(100000, year + 2), price: Math.min(1e12, spotPrice * 1.03), quantity, supplier: b.supplier },
    fee: Math.max(1, Math.round(quantity * spotPrice * .04)), spotPrice }
}
/** Low-level paid transaction; callers enforce authority and any board cash reserve. */
export function purchaseInputContract(g: GameState, a: Asset, b: BizState, quote: InputContractQuote): boolean {
  if (!(quote.fee > 0) || !Number.isFinite(quote.fee) || b.cash < quote.fee) return false
  const p = readSupplyPolicy(b)
  if (p.contract && p.contract.until >= quote.contract.from) return false
  firmCash(g, b, -quote.fee, 'inputs', a.id); b.yearCosts += quote.fee
  p.contract = { ...quote.contract }; saveSupplyPolicy(b, p)
  return true
}
export function setSupplyTarget(g: GameState, assetId: string, target: number): boolean {
  const a = findBusiness(g, assetId)
  if (!a || manageBlock(g, a) || !Number.isFinite(target) || target < 0 || target > .5) return false
  const b = bizOf(g, a)
  if (!supplyProfile(b.industry)) return false
  const p = readSupplyPolicy(b); p.target = target; delete p.procurement; saveSupplyPolicy(b, p)
  return true
}
export function signInputContract(g: GameState, assetId: string): boolean {
  const a = findBusiness(g, assetId)
  if (!a || manageBlock(g, a)) return false
  const b = bizOf(g, a), quote = inputContractQuote(g, b)
  return !!quote && purchaseInputContract(g, a, b, quote)
}

export function supplyPolicyNodes(g: GameState, a: Asset): MenuNode[] {
  const b = readBiz(g, a), p = readSupplyPolicy(b), profile = supplyProfile(b.industry)
  const rows: MenuNode[] = [{ type: 'info', id: `biz.resilience.skills.${a.id}`, emoji: '🛠️', text: `Durable qualification training ${pct(effectiveTraining(p, g.year))}; automation ${pct(effectiveAutomation(p, g.year))}. Existing training and equipment upgrades improve these gradually. Training cannot fix a lack of workers or materials; equipment cannot create inputs. Both effects age over time.` }]
  if (!profile) return rows
  const stock = readSupply(b), quote = inputContractQuote(g, b)
  rows.unshift({ type: 'heading', id: `biz.resilience.h.${a.id}`, label: 'Supply resilience' },
    { type: 'info', id: `biz.resilience.stock.${a.id}`, emoji: '📦', text: `${profile.label}: ${Math.floor(stock.stock).toLocaleString()} input baskets, ${money(stock.bookValue)} paid cost. Target ${pct(p.target)} of annual output; storage and spoilage still cost money.` })
  rows.push({ type: 'action', id: `biz.resilience.target.${a.id}`, label: 'Strategic Input Stock Target', emoji: '📦',
    disabledReason: gg => manageBlock(gg, findBusiness(gg, a.id) ?? a),
    input: { kind: 'slider', label: 'Annual production held as input reserve', min: 0, max: 50, step: 1, unit: '%',
      defaultValue: gg => String(readSupplyPolicy(readBiz(gg, findBusiness(gg, a.id) ?? a)).target * 100),
      preview: (_gg, v) => `${v}% target, not an immediate purchase. Actual purchases require deliveries and at most 20% of spare opening cash after production inputs. More stock ties up cash and can spoil.` },
    run: (gg, input) => { if (setSupplyTarget(gg, a.id, Number(input) / 100)) notice(gg, 'Input Reserve Target', 'The next fiscal settlement will buy only what deliveries, warehouse space and company cash can fund. Changing the target creates no stock or income.', { emoji: '📦' }) } })
  if (p.contract && p.contract.until >= g.year) rows.push({ type: 'info', id: `biz.resilience.contract.${a.id}`, emoji: '📄', text: `Fixed-input agreement through ${p.contract.until}: up to ${Math.floor(p.contract.quantity).toLocaleString()} baskets/year at ${money(p.contract.price)} each for ${p.contract.supplier}-grade inputs. Other grades adjust proportionally. Extra purchases are at spot prices. You can overpay if spot prices fall; shortages still apply.` })
  else rows.push({ type: 'action', id: `biz.resilience.sign.${a.id}`, label: 'Fix Input Prices for Three Years', emoji: '📄',
    subtitle: quote ? `${money(quote.fee)} upfront; 80% of current equipment capacity covered` : 'No qualifying physical input purchases',
    disabledReason: gg => { const aa = findBusiness(gg, a.id); if (!aa) return 'Company no longer available.'; const block = manageBlock(gg, aa); if (block) return block; const bb = readBiz(gg, aa), q = inputContractQuote(gg, bb); return !q ? 'No new agreement is available.' : bb.cash < q.fee ? 'Not enough company cash for the fee.' : null },
    confirm: gg => { const aa = findBusiness(gg, a.id); const q = aa ? inputContractQuote(gg, readBiz(gg, aa)) : null; return q ? `Pay ${formatMoney(q.fee)} now to fix up to ${q.contract.quantity.toLocaleString()} input baskets each year through ${q.contract.until} at a 3% premium to today's price? Falling spot prices can make this more expensive. It guarantees a price, not delivery.` : null },
    run: gg => { if (signInputContract(gg, a.id)) notice(gg, 'Fixed-Input Agreement Signed', 'The fee was paid and expensed once. Delivered inputs within the annual volume use the fixed price; extra volume stays at spot. The agreement cannot repair a domestic shutdown or remove workforce limits.', { emoji: '📄' }) } })
  return rows
}
