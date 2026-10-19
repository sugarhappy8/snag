// Care, Education and Personal Services, state and math (clinic, education, gym, salon, petCare,
// homeCare, autoShop): the yearly rule of the client base. Loyalty is a stock that repairs slowly,
// accreditation a stock that moves toward a target; recurring plans, the payer mix and the intake
// cap turn them into the generic channels (demand, capacity) and a few costs. Pure: no g.rng, no
// state writes. The levers, events and copy are in sector-care-play.ts, which registers CARE_MODEL
// and adds CARE_NOTE_COPY to its copy table.
import type { Asset, GameState } from '../types'
import { staffPower } from './economy'
import { CARE, SECTOR_ROLES, type CareRow } from './sector-data'
import { historyFactor, readYear, roleSkill, sectorHistoryLine, sectorText, seasonIndex, type CopyTable, type FxMode, type SectorCtx, type SectorFx } from './sector-kit'
import { blankRecord, type CareState } from './sector-state'
import type { BizState } from './state'
import { clampN, pct, round2, units } from './util'

/** The yearly accreditation line, written only when the tier moves (the play file adds this table to its own). */
export const CARE_NOTE_COPY: CopyTable = {
  'care.acc.up.log': '${name} is accredited again.',
  'care.acc.top.log': '${name} reached the top tier.',
  'care.acc.down.log': '${name} dropped out of the top tier.',
  'care.acc.low.log': '${name} fell to a provisional tier.',
}

/** The share of the calm capacity each intake setting lets in: Open, Steady, Protected. */
const INTAKE_CAP = [1, .9, .75] as const
const INTAKE_NAME = ['Intake open.', 'Intake steady at 90%.', 'Intake protected at 75%.'] as const
/** Plans move toward their target by at most this much a year, and members pay this much less. */
const PLAN_STEP = .10
const PLAN_DISCOUNT = .06
const PLAN_MAX = .6
const PROVISIONAL_BELOW = 50
const HIGH_FROM = 80

export function careRow(industry: string): CareRow | null {
  return Object.prototype.hasOwnProperty.call(CARE, industry) ? CARE[industry as keyof typeof CARE] : null
}

/** Below 50 provisional, 50 to 79.9 standard, 80 and above high. */
export function accTier(acc: number): 'provisional' | 'standard' | 'high' {
  return acc >= HIGH_FROM ? 'high' : acc >= PROVISIONAL_BELOW ? 'standard' : 'provisional'
}

function roleOf(industry: string): { title: string; focus: string } | null {
  return Object.prototype.hasOwnProperty.call(SECTOR_ROLES, industry) ? SECTOR_ROLES[industry] : null
}

/** What the trade's extra key role moves: quality-focus roles move accreditation, sales-focus roles the retention target. */
export function careRoleMoves(b: Pick<BizState, 'industry'>): 'acc' | 'ret' {
  return roleOf(b.industry)?.focus === 'sales' ? 'ret' : 'acc'
}

/** An accreditation program: a floor by price level, else .6% of a normal year's sales. */
export function accProgramCost(_b: BizState, cx: SectorCtx): number {
  return Math.round(Math.max(2000 * cx.level, .006 * cx.base))
}

/** The clients on the desk: last year's visits over the visits a client makes (display only). */
export function clientsOf(b: BizState, row: CareRow): number {
  const sold = b.last?.sold ?? 0
  return Number.isFinite(sold) ? Math.max(0, Math.round(sold / row.visits)) : 0
}

/** The neutral point: the trade's own retention, no plans, no payers, accreditation 62 at quality 50, intake open. */
export function careSeed(_g: GameState, _a: Asset, b: BizState, since: number): CareState {
  const blank = blankRecord('care', since)
  if (blank.family !== 'care') throw new Error('blankRecord gave another family')
  const row = careRow(b.industry)
  return { ...blank, since, lastYear: since, loyal: row ? row.r0 : blank.loyal, acc: clampN(62 + .3 * (b.quality - 50), 30, 90) }
}

function tierNote(a: Asset, was: ReturnType<typeof accTier>, now: ReturnType<typeof accTier>): SectorFx['note'] {
  if (was === now) return null
  const rank = { provisional: 0, standard: 1, high: 2 }
  const up = rank[now] > rank[was]
  const key = now === 'high' ? 'care.acc.top.log' : now === 'provisional' ? 'care.acc.low.log' : up ? 'care.acc.up.log' : 'care.acc.down.log'
  return { text: sectorText(CARE_NOTE_COPY, key, { name: a.name }), tone: up ? 'good' : 'bad' }
}

/**
 * One fiscal year of the client base. The stocks are read at the start of the year (the loyalty
 * demand and the accreditation tier) and the moved stocks are written to `next`; plans use their
 * ramped value for the year's cost and retention. The only draw is the season, a hash, and
 * 'expected' sets it to its mean and never reads past g.year.
 */
export function careFx(g: GameState, a: Asset, b: BizState, st: CareState, fiscal: number, mode: FxMode, cx: SectorCtx): SectorFx {
  const row = careRow(b.industry)
  if (!row) return { demand: 1, cost: 1, capLoss: 0, open: 1, income: 0, costs: 0, randIncome: 0, randCosts: 0, next: st, note: null }
  const year = readYear(g, fiscal, mode)
  const role = roleOf(b.industry)
  const skill = role ? roleSkill(b, role.title) : 0
  const moves = careRoleMoves(b)
  const tier = accTier(st.acc)
  const cap = INTAKE_CAP[st.intake]

  // Satisfaction: quality and morale lift it, a crowd above what the trade tolerates lowers it. An intake cap spares the clients the crowd.
  const sat = clampN(.5 + (b.quality - 50) / 160 + (b.morale - 60) / 400 - 1.2 * Math.max(0, Math.min(cx.use, cap) - row.crowd), 0, 1)

  // Plans ramp toward the target; members pay less and stay longer.
  const plans = round2(clampN(st.plans + clampN(st.planTarget - st.plans, -PLAN_STEP, PLAN_STEP), 0, PLAN_MAX))
  const ret = clampN(row.r0 + .25 * plans + .004 * (st.acc - 60) + .30 * (sat - .5) + (moves === 'ret' ? .04 * skill : 0), .35, .93)
  const loyal = clampN(st.loyal + .5 * (ret - st.loyal), .2, 1)
  const loyalty = clampN(1 + .6 * (st.loyal - row.r0), .85, 1.15)

  // Payers bring clients and take a discount; denials fall with finance staff.
  const payer = row.payer
  const share = payer ? st.payer : 0
  const payerUp = payer ? 1 + payer.up * share : 1
  const payerCost = payer
    ? cx.base * share * payerUp * (payer.disc * (st.acc >= HIGH_FROM ? .86 : 1) + payer.deny * (1 - .25 * Math.min(1, staffPower(b, 'finance'))))
    : 0
  const costs = PLAN_DISCOUNT * plans * cx.base + payerCost

  // Accreditation: a provisional tier costs clients and capacity, the top tier brings clients.
  const accTarget = 62 + (moves === 'acc' ? 25 * skill : 0) + (st.program === fiscal ? 20 : 0) + .2 * (b.quality - 50) - (cx.use > .95 ? 6 : 0)
  const acc = clampN(st.acc + .3 * (accTarget - st.acc), 0, 100)
  const tierDemand = tier === 'provisional' ? .93 : tier === 'high' ? 1.04 : 1
  const intakeLoss = st.intake > 0 && cx.use > cap ? (cx.use - cap) / cx.use : 0
  const capLoss = 1 - (1 - intakeLoss) * (1 - (tier === 'provisional' ? .05 : 0))

  const season = mode === 'book' ? 1 + row.amp * (1 - .6 * plans) * seasonIndex(g, a, fiscal, 'wx') : 1
  const demand = loyalty * payerUp * tierDemand * season * historyFactor(g, b, year)

  return {
    demand, cost: 1, capLoss, open: 1, income: 0, costs, randIncome: 0, randCosts: 0,
    next: { ...st, loyal, plans, acc }, note: tierNote(a, tier, accTier(acc)),
  }
}

/** The status lines of the desk (pure). null: no record yet, so the family has nothing to show. */
export function careHeader(g: GameState, b: BizState, st: CareState | null): string[] {
  if (!st) return []
  const row = careRow(b.industry)
  const lines = [`About ${units(row ? clientsOf(b, row) : 0)} clients, ${pct(st.loyal)} come back.`]
  lines.push(`Plans ${pct(st.plans)}${Math.abs(st.planTarget - st.plans) > 1e-9 ? `, target ${pct(st.planTarget)}` : ''}.`)
  const score = Math.round(st.acc)
  const tier = accTier(st.acc)
  lines.push(tier === 'provisional' ? `Provisional, score ${score}.` : tier === 'high' ? `Top tier, score ${score}.` : `Accredited, score ${score}.`)
  if (row?.payer) lines.push(`Payer mix ${pct(st.payer)}.`)
  lines.push(INTAKE_NAME[st.intake])
  const history = sectorHistoryLine(g, b)
  if (history) lines.push(history)
  return lines
}
