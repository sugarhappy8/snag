// The Profit and Loss builders (R1 charts, G.1): one settled statement becomes a waterfall from the sales after tax down
// to the net profit, a short version with the five biggest rows, and the "why profit changed" bridge between two years.
// Pure: they read a company's books and write nothing, draw no random number and look at no year after the statement's.
//
// The rows follow the 12 lines of economic-report.ts and the splits statementLines (yearly.ts) makes. This file makes
// the same splits with the same primitives and does not import yearly.ts, which sits in the big import cycle.
//
// Every value is a whole dollar. The rows are rounded first and the gaps are taken from the rounded values, so the first
// total plus every delta is the last total exactly. The only residual is a labelled Rounding row.
import { economicReportOf, type EconomicReport } from '../business/economic-report'
import { franchiseIncomeFor } from '../business/franchise-state'
import { labPayrollIn, labSplit } from '../business/lab-state'
import { LAB_STATEMENT } from '../business/lab-text'
import type { BizState, Statement } from '../business/state'
import type { GameState } from '../types'
import { deltaLabel, fit, moneyLabel, whole } from './money'
import { reveal } from './reveal'
import { SPEC_LIMITS, type ChartMark, type ChartSpec, type ChartStep } from './spec'

const L = {
  sales: 'Sales after tax',
  cogs: 'Materials and direct costs',
  wages: 'Wages',
  keyStaff: 'Key staff and managers',
  rent: 'Premises',
  marketing: 'Marketing',
  interest: 'Debt interest',
  upkeep: 'Upkeep and investments',
  oneOff: 'One-off costs',
  research: LAB_STATEMENT.payroll,
  otherIncome: 'Other income',
  franchise: 'Franchise fees and royalties',
  credit: LAB_STATEMENT.credit,
  royalty: LAB_STATEMENT.royalty,
  ownerPay: 'Your salary',
  rounding: 'Rounding',
  adjustments: 'Other adjustments',
  pbt: 'Profit before tax',
  tax: 'Corporate tax',
  net: 'Net profit',
  rest: 'Everything else',
} as const

/** Every row label a Profit and Loss can carry, each at most 40 characters. The lab's three come from lab-text.ts. */
export const PL_LABELS: Readonly<Record<string, string>> = Object.freeze({ ...L })

/** The most one statement value or bridge amount may be: fewer than 32 of them can never reach the spec's magnitude limit. */
const BOUND = SPEC_LIMITS.magnitude / 32
/** The most rows the summary shows besides its totals. */
const SUMMARY_ROWS = 5
const STATEMENT_NUMBERS = ['year', 'netRevenue', 'cogs', 'wages', 'keyStaff', 'rent', 'marketing', 'interest', 'upkeep', 'other', 'otherIncome', 'ownerPay', 'pbt', 'corpTax', 'net'] as const

/** True when every number the builders read is finite and small enough for a spec to carry. */
function sane(s: Statement): boolean {
  for (const k of STATEMENT_NUMBERS) {
    const v = s[k]
    if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > BOUND) return false
  }
  return true
}

/** The statement cut into whole-dollar rows. `gap` and `gap2` are what rounding left over, taken from the rounded rows. */
interface Parts {
  sales: number
  /** The cost and income rows, in statement order, each non-zero. */
  ops: ChartStep[]
  /** Profit before tax minus (sales plus the rows). */
  gap: number
  pbt: number
  /** Corporate tax as a delta (negative when tax was paid). */
  tax: number
  /** Net profit minus (profit before tax plus the tax delta). */
  gap2: number
  net: number
  /** A gap larger than this is not rounding: the larger of $5 and 0.001% of the sales. */
  limit: number
}

function partsOf(b: BizState, s: Statement): Parts {
  const crew = Math.min(labPayrollIn(b, s.year), Math.max(0, s.other))
  const franchised = Math.min(franchiseIncomeFor(b, s.year), Math.max(0, s.otherIncome))
  const lab = labSplit(b, s, franchised)
  const lines: [string, number][] = [
    [L.cogs, -s.cogs],
    [L.wages, -s.wages],
    [L.keyStaff, -s.keyStaff],
    [L.rent, -s.rent],
    [L.marketing, -s.marketing],
    [L.interest, -s.interest],
    [L.upkeep, -s.upkeep],
    [L.oneOff, -(s.other - crew)],
    [L.research, -crew],
    [L.otherIncome, s.otherIncome - franchised - lab.grants - lab.royalty],
    [L.franchise, franchised],
    [L.credit, lab.grants],
    [L.royalty, lab.royalty],
    [L.ownerPay, -s.ownerPay],
  ]
  const sales = whole(s.netRevenue)
  const ops: ChartStep[] = []
  let running = sales
  for (const [label, v] of lines) {
    const value = whole(v)
    if (value === 0) continue
    ops.push({ label, value, kind: 'delta' })
    running += value
  }
  const pbt = whole(s.pbt)
  const tax = whole(-s.corpTax)
  const net = whole(s.net)
  const limit = Math.max(5, Math.abs(s.netRevenue) * 1e-5)
  return { sales, ops, gap: pbt - running, pbt, tax, gap2: net - (pbt + tax), net, limit }
}

/** A rounding row: 'Rounding' while it is small, 'Other adjustments' once it is more than rounding could explain. */
function gapStep(value: number, limit: number): ChartStep {
  return { label: Math.abs(value) > limit ? L.adjustments : L.rounding, value, kind: 'delta' }
}

function fullSteps(p: Parts): ChartStep[] {
  const steps: ChartStep[] = [{ label: L.sales, value: p.sales, kind: 'total' }, ...p.ops.map((x) => ({ ...x }))]
  if (p.gap !== 0) steps.push(gapStep(p.gap, p.limit))
  steps.push({ label: L.pbt, value: p.pbt, kind: 'total' })
  if (p.tax !== 0) steps.push({ label: L.tax, value: p.tax, kind: 'delta' })
  if (p.gap2 !== 0) steps.push(gapStep(p.gap2, p.limit))
  steps.push({ label: L.net, value: p.net, kind: 'total' })
  return steps
}

/**
 * The waterfall rows of one statement: a total of the sales after tax, a delta for each cost or income line the company
 * has (a line of nothing is left out), the profit before tax, the corporate tax and the net profit. Whole dollars; the
 * first total plus every delta is the last total, exactly. Each cost's share of the first total is
 * abs(value) / first total. A value that is not a finite number reads as 0.
 */
export function plSteps(b: BizState, s: Statement): ChartStep[] {
  return fullSteps(partsOf(b, s))
}

/** 'Net profit $1.2M on $9.6M of sales after tax, up $310K.' The change comes from the books' own bridge, when there is one. */
function plText(g: GameState, b: BizState, p: Parts): string {
  const report = economicReportOf(b)
  const head = `Net ${p.net < 0 ? 'loss' : 'profit'} ${moneyLabel(g, Math.abs(p.net))} on ${moneyLabel(g, p.sales)} of sales after tax`
  return fit(`${head}${report ? `, ${deltaLabel(g, report.delta)}` : ''}.`)
}

/** The owner's bonus is inside the one-off costs (or, when the research crew took all of those, the Research team row). */
function bonusMarks(g: GameState, b: BizState, s: Statement, steps: ChartStep[]): ChartMark[] {
  const row = Array.isArray(b.history) ? b.history.find((h) => h && h.year === s.year) : undefined
  const draws = row?.draws
  if (typeof draws !== 'number' || !Number.isFinite(draws) || whole(draws) <= 0) return []
  let at = steps.findIndex((x) => x.label === L.oneOff)
  if (at < 0) at = steps.findIndex((x) => x.label === L.research)
  if (at < 0) return []
  return [{ at, label: fit(`Includes your ${moneyLabel(g, whole(draws))} bonus`, SPEC_LIMITS.label) }]
}

/**
 * Where the year's sales went, line by line: the full Profit and Loss waterfall. Null when the company has no settled
 * statement or a value in it is not a finite number of a sensible size.
 */
export function plSpec(g: GameState, b: BizState): ChartSpec | null {
  const s = b.last
  if (!s || !sane(s)) return null
  const p = partsOf(b, s)
  const steps = fullSteps(p)
  const marks = bonusMarks(g, b, s, steps)
  return reveal({
    v: 1,
    kind: 'waterfall',
    title: `Where the sales went, ${s.year}`,
    unit: 'money',
    x: [],
    series: [],
    steps,
    ...(marks.length > 0 ? { marks } : {}),
    summary: plText(g, b, p),
  })
}

/**
 * The same walk with the five biggest rows and one Everything else for the rest (its sign kept, left out at nothing).
 * The gap that rounding leaves goes into Everything else, or, when every row is shown, into a Rounding row of its own.
 * The tax row takes the second gap, so the summary never has more than 10 steps and still sums exactly.
 */
export function plSummarySpec(g: GameState, b: BizState): ChartSpec | null {
  const s = b.last
  if (!s || !sane(s)) return null
  const p = partsOf(b, s)
  const biggest = p.ops
    .map((x, i) => ({ i, size: Math.abs(x.value) }))
    .sort((a, c) => c.size - a.size || a.i - c.i)
    .slice(0, SUMMARY_ROWS)
  const shown = new Set(biggest.map((x) => x.i))
  const steps: ChartStep[] = [{ label: L.sales, value: p.sales, kind: 'total' }]
  for (let i = 0; i < p.ops.length; i++) if (shown.has(i)) steps.push({ ...p.ops[i]! })
  const hidden = p.ops.filter((_, i) => !shown.has(i))
  if (hidden.length > 0) {
    const rest = hidden.reduce((t, x) => t + x.value, 0) + p.gap
    if (rest !== 0) steps.push({ label: L.rest, value: rest, kind: 'delta' })
  } else if (p.gap !== 0) steps.push(gapStep(p.gap, p.limit))
  steps.push({ label: L.pbt, value: p.pbt, kind: 'total' })
  const closing = p.net - p.pbt
  if (closing !== 0) steps.push(p.tax !== 0 ? { label: L.tax, value: closing, kind: 'delta' } : gapStep(closing, p.limit))
  steps.push({ label: L.net, value: p.net, kind: 'total' })
  return reveal({ v: 1, kind: 'waterfall', title: 'Where the sales went', unit: 'money', x: [], series: [], steps, summary: plText(g, b, p) })
}

/** A driver label the spec will accept: control characters become spaces, runs of space shrink to one, at most 40 characters. */
function cleanLabel(label: string): string {
  let out = ''
  for (let i = 0; i < label.length; i++) {
    const c = label.charCodeAt(i)
    out += c < 32 || c === 127 ? ' ' : label.charAt(i)
  }
  const t = out.replace(/\s+/g, ' ').trim().slice(0, SPEC_LIMITS.label).trim()
  return t.length > 0 ? t : L.adjustments
}

/** 'materials and direct costs' for mid-sentence use; a label that starts with an acronym is left alone. */
function lowerFirst(t: string): string {
  return /^[A-Z][a-z]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t
}

function verdictOf(g: GameState, r: EconomicReport): string {
  if (!Number.isFinite(r.delta) || Math.abs(r.delta) < 0.5) return `Net profit was unchanged from ${r.previousYear}.`
  return `Net profit ${r.delta > 0 ? 'rose' : 'fell'} ${moneyLabel(g, Math.abs(r.delta))} from ${r.previousYear}.`
}

/**
 * Why the net profit moved since last year: the books' own bridge (economic-report.ts) as a waterfall, from last year's
 * net profit through one delta for each driver to this year's. The amounts are the report's, not rounded again, so the
 * steps sum to within a cent. Null when the company has no bridge (its first year, or a report that does not add up).
 */
export function bridgeSpec(g: GameState, b: BizState): ChartSpec | null {
  const r = economicReportOf(b)
  if (!r || r.drivers.length === 0) return null
  const amounts = [r.previousNet, r.net, ...r.drivers.map((d) => d.amount)]
  if (!amounts.every((v) => Number.isFinite(v) && Math.abs(v) <= BOUND)) return null
  const steps: ChartStep[] = [
    { label: `Net profit ${r.previousYear}`, value: r.previousNet + 0, kind: 'total' },
    ...r.drivers.map((d) => ({ label: cleanLabel(d.label), value: d.amount + 0, kind: 'delta' as const })),
    { label: `Net profit ${r.year}`, value: r.net + 0, kind: 'total' },
  ]
  const top = r.drivers.reduce((best, d) => (Math.abs(d.amount) > Math.abs(best.amount) ? d : best), r.drivers[0]!)
  const lead = verdictOf(g, r)
  const summary = top.amount === 0 ? lead : `${lead} The biggest driver was ${lowerFirst(cleanLabel(top.label))}, ${top.amount > 0 ? 'adding' : 'costing'} ${moneyLabel(g, Math.abs(top.amount))}.`
  return reveal({ v: 1, kind: 'waterfall', title: 'Why profit changed', unit: 'money', x: [], series: [], steps, summary: fit(summary) })
}

/** One line on the year: 'Net profit rose $310K from 2030.' or, with no earlier year to compare, 'First full year on the books.' */
export function profitVerdict(g: GameState, b: BizState): string {
  const r = economicReportOf(b)
  return fit(r ? verdictOf(g, r) : 'First full year on the books.')
}
