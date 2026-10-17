// Finance-specific CEO résumés. A bank or fund should not hire from the same anonymous pool as a
// café: candidates have an industry background, an investing approach, a risk appetite and a
// visible prior-career record. These fields modify effective leadership modestly; they never grant
// market foresight or guarantee returns.
import { pick, randInt } from '../rng'
import type { GameState, Json } from '../types'
import type { BizState, FinanceApproach, FinanceProfile, FinanceRisk, FinanceSpecialty, Manager } from './state'
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

const RISK_LABEL: Record<FinanceRisk, string> = { cautious: 'cautious', balanced: 'balanced', bold: 'bold' }

function obj(v: Json | undefined): Record<string, Json> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : null
}

/** The specialist background that best fits this institution's current business model. */
export function financeTarget(b: Pick<BizState, 'industry' | 'financeFirm'>): FinanceSpecialty | null {
  if (b.industry === 'bank' || b.industry === 'onlineBank') return 'bank'
  if (b.industry !== 'investmentFirm') return null
  const book = obj(b.financeFirm)
  if (book?.kind === 'fund') {
    if (book.type === 'hedge' || book.type === 'vc' || book.type === 'broker' || book.type === 'asset') return book.type
  }
  // Legacy investment-firm saves used retail/private/brokerage before FundState v3.
  if (book?.model === 'private') return 'hedge'
  if (book?.model === 'brokerage') return 'broker'
  return 'asset'
}

export function financeRoleLabel(b: Pick<BizState, 'industry' | 'financeFirm'>): string {
  const target = financeTarget(b)
  if (target === 'bank') return 'Bank CEO'
  if (target === 'hedge') return 'Hedge Fund CEO'
  if (target === 'vc') return 'Venture Capital CEO'
  if (target === 'broker') return 'Brokerage CEO'
  if (target === 'asset') return 'Asset Management CEO'
  return 'CEO'
}

function approaches(target: FinanceSpecialty): FinanceApproach[] {
  if (target === 'asset') return ['fundamental', 'systematic', 'growth', 'macro', 'risk', 'client']
  if (target === 'hedge') return ['fundamental', 'macro', 'systematic', 'event', 'risk']
  if (target === 'vc') return ['fundamental', 'growth', 'client', 'risk']
  if (target === 'broker') return ['client', 'systematic', 'growth', 'risk']
  if (target === 'bank') return ['risk', 'client', 'fundamental', 'systematic']
  return ['client', 'risk', 'fundamental']
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
  if (target === 'broker') return 'asset'
  if (target === 'bank') return 'broker'
  return 'generalist'
}

function roundedPay(n: number): number {
  const step = n >= 1_000_000 ? 50_000 : n >= 200_000 ? 10_000 : 5_000
  return Math.max(step, Math.round(n / step) * step)
}

/** Add a finance résumé to one otherwise ordinary CEO candidate. */
export function specializeFinanceCandidate(
  g: GameState,
  b: Pick<BizState, 'industry' | 'financeFirm'>,
  m: Manager,
  specialty = financeTarget(b),
  adjustPay = !m.finance,
): Manager {
  if (!specialty) return m
  const exact = specialty === financeTarget(b)
  const approach = pick(g, approaches(specialty))
  const risk = pick(g, risks(specialty))
  const record = Math.round(clampN(m.skill * .62 + randInt(g, 8, 38) + (exact ? 4 : 0), 25, 99))
  const profile: FinanceProfile = { specialty, approach, risk, record }
  // A visible strong résumé costs a little more, but skill remains the main salary driver.
  const premium = adjustPay ? 1 + Math.max(0, record - 70) * .004 : 1
  return { ...m, salary: roundedPay(m.salary * premium), finance: profile }
}

/**
 * Give a finance shortlist meaningful variety while guaranteeing at least two exact specialists.
 * Initial/interim appointments remain exact specialists through managerCandidate().
 */
export function diversifyFinanceShortlist(g: GameState, b: BizState, list: Manager[]): Manager[] {
  const target = financeTarget(b)
  if (!target) return list
  return list.map((m, i) => {
    if (i < 2) return specializeFinanceCandidate(g, b, m, target, false)
    if (i === 2) return specializeFinanceCandidate(g, b, m, 'generalist', false)
    if (i === 3) return specializeFinanceCandidate(g, b, m, adjacent(target), false)
    if (i === list.length - 1 && m.skill >= 85) return specializeFinanceCandidate(g, b, m, target, false)
    return m.finance ? m : specializeFinanceCandidate(g, b, m, target, false)
  })
}

/** Effective skill after a modest résumé fit adjustment; never above 100 or below 10. */
export function financeLeadershipSkill(b: Pick<BizState, 'industry' | 'financeFirm'>, m: Manager | null | undefined): number {
  if (!m) return 40
  const target = financeTarget(b)
  const p = m.finance
  if (!target || !p) return clampN(m.skill, 10, 100)
  const specialty = p.specialty === target ? 6 : p.specialty === 'generalist' ? 0 : -7
  const record = (p.record - 50) * .1
  return clampN(m.skill + specialty + record, 10, 100)
}

/** Salary-aware score used only to rank candidates in the Business-talent hiring hint. */
export function financeCandidateScore(b: BizState, m: Manager, normalPay: number): number {
  const leadership = financeLeadershipSkill(b, m)
  const payPenalty = Math.max(0, m.salary / Math.max(1, normalPay) - .8) * 7
  return leadership - payPenalty
}

export function financeProfileSummary(m: Manager | null | undefined): string {
  const p = m?.finance
  if (!p) return 'Financial-services generalist · balanced risk · no specialist track record'
  return `${SPECIALTY_LABEL[p.specialty]} · ${APPROACH_LABEL[p.approach]} · ${RISK_LABEL[p.risk]} risk · record ${p.record}/100`
}

export function financeProfileShort(m: Manager | null | undefined): string {
  const p = m?.finance
  if (!p) return 'Generalist'
  return `${SPECIALTY_LABEL[p.specialty]} · ${APPROACH_LABEL[p.approach]} · ${p.record}/100 record`
}
