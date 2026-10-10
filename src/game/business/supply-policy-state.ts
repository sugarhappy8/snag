import type { BizState, Supplier } from './state'
import type { Json } from '../types'
import { clampN, num, rec } from './util'

export interface InputContract { from: number; until: number; price: number; quantity: number; supplier: Supplier }
export interface SupplyPolicy {
  target: number
  training: number; trainingYear: number
  automation: number; automationYear: number
  contract?: InputContract
  /** A CEO's cash-backed reserve-stock commitment; no restriction on ordinary production inputs. */
  procurement?: { year: number; limit: number }
}
export const supplierGrade = (s: Supplier): number => s === 'budget' ? .86 : s === 'premium' ? 1.18 : 1
export function readSupplyPolicy(b: Pick<BizState, 'supply'>): SupplyPolicy {
  const raw = rec(b.supply), p = raw?.v === 1 ? rec(raw.policy) : null, c = rec(p?.contract), budget = rec(p?.procurement)
  const from = Math.floor(clampN(num(c?.from), 0, 100000)), until = Math.floor(clampN(num(c?.until), from, Math.min(100000, from + 2)))
  const contract: InputContract | undefined = c && num(c.price) > 0 && num(c.quantity) > 0 ? {
    from, until, price: clampN(num(c.price), 0, 1e12), quantity: Math.floor(clampN(num(c.quantity), 0, 1e12)),
    supplier: c.supplier === 'budget' || c.supplier === 'premium' ? c.supplier : 'standard',
  } : undefined
  return { target: clampN(num(p?.target, .12), 0, .5), training: clampN(num(p?.training), 0, .8), trainingYear: Math.floor(clampN(num(p?.trainingYear), 0, 100000)),
    automation: clampN(num(p?.automation), 0, .35), automationYear: Math.floor(clampN(num(p?.automationYear), 0, 100000)),
    ...(contract ? { contract } : {}), ...(budget ? { procurement: { year: Math.floor(clampN(num(budget.year), 0, 100000)), limit: clampN(num(budget.limit), 0, 1e24) } } : {}) }
}
export function saveSupplyPolicy(b: BizState, policy: SupplyPolicy): void {
  const raw = rec(b.supply)
  // Services can retain training policy but never acquire raw units or book value.
  b.supply = { ...(raw?.v === 1 ? raw : { v: 1, stock: 0, bookValue: 0, lastYear: -1 }), policy: { ...policy } } as unknown as Json
}
export function withSupplyPolicy(b: BizState, policy: SupplyPolicy): BizState {
  const next = { ...b }; saveSupplyPolicy(next, policy); return next
}
export function effectiveTraining(p: SupplyPolicy, year: number): number { return year < p.trainingYear ? 0 : p.training * Math.pow(.9, Math.max(0, year - p.trainingYear)) }
export function effectiveAutomation(p: SupplyPolicy, year: number): number { return year < p.automationYear ? 0 : p.automation * Math.pow(.97, Math.max(0, year - p.automationYear)) }
export function grantSupplyTraining(b: BizState, year: number, gain: number): void {
  const p = readSupplyPolicy(b); p.training = Math.min(.8, effectiveTraining(p, year) + Math.max(0, gain)); p.trainingYear = year; saveSupplyPolicy(b, p)
}
export function grantSupplyAutomation(b: BizState, year: number, gain: number): void {
  const p = readSupplyPolicy(b); p.automation = Math.min(.35, effectiveAutomation(p, year) + Math.max(0, gain)); p.automationYear = year; saveSupplyPolicy(b, p)
}
