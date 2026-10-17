// Corporate finance leadership. Bank and investment-firm CEOs keep the ordinary Manager lifecycle,
// contracts and governance, but carry a small, save-safe résumé that affects finance work only.
// A profile changes judgment at the margin; it never reveals future markets or guarantees a return.
import { seeded } from '../assets'
import type { GameState, Json } from '../types'
import type { Mandate } from './board-state'
import { readFinanceProfile, type BizState, type FinanceApproach, type FinanceProfile, type FinanceRisk, type FinanceSpecialty, type Manager } from './state'
import { clampN } from './util'

const SPECIALTY_LABEL: Record<FinanceSpecialty, string> = {
  asset: 'Asset management',
  hedge: 'Hedge funds',
  vc: 'Venture capital',
  broker: 'Brokerage',
  bank: 'Banking',
  generalist: 'Financial-services generalist',
}

const APPROACH_LABEL: Record<FinanceApproach, string> = {
  systematic: 'Systematic',
  fundamental: 'Fundamental',
  growth: 'Growth',
  macro: 'Macro',
  event: 'Event-driven',
  client: 'Client-led',
  risk: 'Risk-first',
}

const RISK_LABEL: Record<FinanceRisk, string> = {
  cautious: 'cautious',
  balanced: 'balanced',
  bold: 'bold',
}

function obj(v: Json | undefined): Record<string, Json> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : null
}

/**
 * The specialist background that fits this institution's actual books. Requiring financeFirm is
 * deliberate: conglomerate groupBiz() borrows its lead division's industry but has no finance
 * books, and must keep a generic group CEO.
 */
export function financeTarget(b: Pick<BizState, 'industry' | 'financeFirm' | 'founded'>): FinanceSpecialty | null {
  const book = obj(b.financeFirm)
  if (!book) return null
  if (b.industry === 'bank' || b.industry === 'onlineBank') return 'bank'
  if (b.industry !== 'investmentFirm') return null
  if (book.kind === 'fund') {
    if (book.type === 'asset' || book.type === 'hedge' || book.type === 'vc' || book.type === 'broker') return book.type
    return 'asset'
  }
  // Legacy investment-firm books used retail/private/brokerage before FundState v3. Keep the same
  // era rule as fund-state.migrateLegacy without importing fund-state and creating a model cycle.
  if (book.model === 'brokerage') return 'broker'
  if (book.model === 'retail') return 'asset'
  const last = typeof book.lastYear === 'number' && Number.isFinite(book.lastYear) ? Math.round(book.lastYear) : -1
  const year = last >= 0 ? last + 1 : b.founded
  return year >= 1949 ? 'hedge' : 'asset'
}

export function financeRoleLabel(b: Pick<BizState, 'industry' | 'financeFirm' | 'founded'>): string {
  const target = financeTarget(b)
  if (target === 'bank' && b.industry === 'onlineBank') return 'Online Bank CEO'
  if (target === 'bank') return 'Bank CEO'
  if (target === 'hedge') return 'Hedge Fund CEO'
  if (target === 'vc') return 'Venture Capital CEO'
  if (target === 'broker') return 'Brokerage CEO'
  if (target === 'asset') return 'Asset Management CEO'
  return 'CEO'
}

function approaches(target: FinanceSpecialty): FinanceApproach[] {
  if (target === 'asset') return ['fundamental', 'systematic', 'growth', 'macro', 'risk', 'client']
  if (target === 'hedge') return ['fundamental', 'systematic', 'event', 'risk']
  if (target === 'vc') return ['fundamental', 'growth', 'client', 'risk']
  if (target === 'broker') return ['client', 'systematic', 'growth', 'risk']
  if (target === 'bank') return ['risk', 'client', 'fundamental', 'systematic']
  return ['client', 'risk', 'fundamental', 'systematic']
}

function risks(target: FinanceSpecialty): FinanceRisk[] {
  if (target === 'hedge') return ['balanced', 'bold', 'bold', 'cautious']
  if (target === 'bank') return ['cautious', 'balanced', 'balanced', 'bold']
  return ['cautious', 'balanced', 'balanced', 'bold']
}

function adjacent(target: FinanceSpecialty): FinanceSpecialty {
  if (target === 'asset') return 'hedge'
  if (target === 'hedge') return 'asset'
  if (target === 'vc') return 'hedge'
  if (target === 'broker') return 'bank'
  if (target === 'bank') return 'broker'
  return 'generalist'
}

/** The intentional mix for a finance shortlist: specialists, a generalist, and an adjacent hire. */
export function financeShortlistSpecialty(target: FinanceSpecialty | null, index: number): FinanceSpecialty | null {
  if (!target) return null
  if (index < 2) return target
  if (index === 2) return 'generalist'
  if (index === 3) return adjacent(target)
  return target
}

/** Add one final finance résumé to an otherwise ordinary candidate. Call exactly once. */
export function specializeFinanceCandidate(
  g: GameState,
  b: Pick<BizState, 'industry' | 'financeFirm' | 'founded' | 'countryId' | 'city'>,
  m: Manager,
  specialty: FinanceSpecialty | null = financeTarget(b),
): Manager {
  if (!specialty) return m
  const target = financeTarget(b)
  // A local stream keeps a richer finance shortlist from perturbing the game's shared RNG. The
  // completed profile is still serialized with the candidate and never regenerated after hiring.
  const r = seeded(`finance-ceo|${g.year}|${b.countryId}|${b.city}|${b.founded}|${m.firstName}|${m.lastName}|${m.skill}|${specialty}`)
  const approach = r.pick(approaches(specialty))
  const risk = r.pick(risks(specialty))
  const record = Math.round(clampN(m.skill * .64 + 12 + Math.floor(r.next() * 25) + (specialty === target ? 3 : 0), 20, 99))
  return { ...m, finance: { specialty, approach, risk, record } }
}

/** Always sanitize optional profile state, including current-version objects bizOf need not rewrite. */
export function financeProfileOf(m: Manager | null | undefined): FinanceProfile | undefined {
  return readFinanceProfile(m?.finance as unknown as Json | undefined)
}

/** Preserve a displayed résumé; add one only for a profileless appointment to a real finance firm. */
export function ensureFinanceCandidate(
  g: GameState,
  b: Pick<BizState, 'industry' | 'financeFirm' | 'founded' | 'countryId' | 'city'>,
  m: Manager,
): Manager {
  return financeTarget(b) && !financeProfileOf(m) ? specializeFinanceCandidate(g, b, m) : m
}

function related(a: FinanceSpecialty, b: FinanceSpecialty): boolean {
  return adjacent(a) === b || adjacent(b) === a
}

/** Effective finance skill; a missing profile preserves the old raw-skill behavior exactly. */
export function financeLeadershipSkill(b: Pick<BizState, 'industry' | 'financeFirm' | 'founded'>, m: Manager | null | undefined): number {
  if (!m) return 40
  const base = clampN(m.skill, 0, 100)
  const target = financeTarget(b)
  const p = financeProfileOf(m)
  if (!target || !p) return base
  const specialty = p.specialty === target ? 5 : p.specialty === 'generalist' ? 0 : related(p.specialty, target) ? -1 : -5
  const record = (p.record - 50) * .06
  return clampN(base + specialty + record, 0, 100)
}

function approachFit(target: FinanceSpecialty, approach: FinanceApproach, mandate: Mandate): number {
  let fit = 0
  if (target === 'asset' && ['fundamental', 'systematic', 'client'].includes(approach)) fit += 2
  else if (target === 'hedge' && ['event', 'systematic', 'fundamental'].includes(approach)) fit += 2
  else if (target === 'vc' && ['growth', 'fundamental', 'client'].includes(approach)) fit += 2
  else if (target === 'broker' && ['client', 'systematic'].includes(approach)) fit += 2
  else if (target === 'bank' && ['risk', 'client', 'fundamental'].includes(approach)) fit += 2
  if (mandate === 'growth' && (approach === 'growth' || approach === 'client')) fit += 3
  if (mandate === 'profit' && (approach === 'fundamental' || approach === 'systematic' || approach === 'event')) fit += 3
  if (mandate === 'cash' && (approach === 'risk' || approach === 'client')) fit += 3
  if (mandate === 'balanced' && (approach === 'risk' || approach === 'fundamental')) fit += 2
  return fit
}

function riskFit(risk: FinanceRisk, mandate: Mandate): number {
  if (mandate === 'growth') return risk === 'bold' ? 3 : risk === 'balanced' ? 1 : -2
  if (mandate === 'cash') return risk === 'cautious' ? 3 : risk === 'balanced' ? 1 : -2
  if (mandate === 'profit') return risk === 'balanced' ? 2 : risk === 'bold' ? 0 : 1
  return risk === 'balanced' ? 3 : 0
}

/** This slice wires résumé posture into the asset- and hedge-fund decision models. */
export function financeMandateAware(b: Pick<BizState, 'industry' | 'financeFirm' | 'founded'>): boolean {
  const target = financeTarget(b)
  return target === 'asset' || target === 'hedge'
}

/** Visible résumé-to-mandate fit. Hidden integrity and compensation stay in the final hiring score. */
export function financeMandateFit(b: BizState, m: Manager, mandate: Mandate): number {
  const target = financeTarget(b)
  const p = financeProfileOf(m)
  return target && p && financeMandateAware(b) ? approachFit(target, p.approach, mandate) + riskFit(p.risk, mandate) : 0
}

export function financeMandateFitLabel(b: BizState, m: Manager, mandate: Mandate): string {
  const fit = financeMandateFit(b, m, mandate)
  return fit >= 6 ? 'excellent' : fit >= 4 ? 'strong' : fit >= 1 ? 'mixed' : 'weak'
}

/** Salary-aware, unitless hiring merit. It is never presented as a dollar forecast. */
export function financeCandidateScore(b: BizState, m: Manager, mandate: Mandate, normalPay: number): number {
  const fit = financeMandateFit(b, m, mandate)
  const integrity = (clampN(typeof m.integrity === 'number' ? m.integrity : 70, 0, 100) - 50) * .04
  const pay = Math.max(0, m.salary / Math.max(1, normalPay) - 1) * 6
  return financeLeadershipSkill(b, m) + fit + integrity - pay
}

export function financeProfileSummary(m: Manager | null | undefined): string {
  const p = financeProfileOf(m)
  if (!p) return 'No specialist finance record'
  return `${SPECIALTY_LABEL[p.specialty]} · ${APPROACH_LABEL[p.approach]} · ${RISK_LABEL[p.risk]} risk · career record ${p.record}/100`
}

export function financeSpecialtyLabel(m: Manager | null | undefined): string {
  const p = financeProfileOf(m)
  return p ? SPECIALTY_LABEL[p.specialty] : 'No finance specialty'
}

export function financeProfileShort(m: Manager | null | undefined): string {
  const p = financeProfileOf(m)
  if (!p) return 'No finance specialty'
  return `${SPECIALTY_LABEL[p.specialty]} · ${APPROACH_LABEL[p.approach]} · ${p.record}/100`
}
