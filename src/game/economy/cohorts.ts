// Four aggregate household groups, never additional Person records or spendable money.
import type { CountryEconomy } from './model'

export const COHORTS = ['working', 'middle', 'professional', 'wealthy'] as const
export type CohortId = typeof COHORTS[number]
export const COHORT_LABELS: Record<CohortId, string> = { working: 'Working & low-income households', middle: 'Middle-income households', professional: 'Qualified professionals', wealthy: 'Wealthy households' }
export interface Cohort {
  share: number; employment: number; skill: number; income: number; spending: number
  debt: number; savings: number; retired: number
}
export type Cohorts = Record<CohortId, Cohort>
const clamp = (n: number, lo: number, hi: number) => Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo
const round = (n: number) => Math.round(n * 1e6) / 1e6
const rec = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
const num = (v: unknown, fallback: number, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : fallback
const LEVEL: Record<CohortId, number> = { working: .55, middle: 1, professional: 1.9, wealthy: 5.5 }
const SKILL: Record<CohortId, number> = { working: .72, middle: .96, professional: 1.25, wealthy: 1.4 }
const RISK: Record<CohortId, number> = { working: 1.4, middle: 1, professional: .65, wealthy: .3 }
const CONSUMPTION: Record<CohortId, number> = { working: .92, middle: .78, professional: .65, wealthy: .42 }

export function initialCohorts(skills: number, inequality: number, unemployment: number, elderly: number): Cohorts {
  const working = clamp(.32 + (inequality - .4) * .5 - (skills - .65) * .15, .18, .5)
  const professional = clamp(.2 + (skills - .65) * .18, .12, .28), wealthy = clamp(.05 + (inequality - .4) * .05, .035, .065)
  const shares = { working, middle: 1 - working - professional - wealthy, professional, wealthy }
  const skillScale = COHORTS.reduce((n,id) => n + shares[id] * SKILL[id], 0)
  return compactCohorts(Object.fromEntries(COHORTS.map(id => [id, {
    share: shares[id], employment: clamp(1 - unemployment * RISK[id], .25, .995),
    skill: clamp(skills * SKILL[id] / skillScale, .1, .98), income: LEVEL[id], spending: 1,
    debt: { working: .9, middle: 1.1, professional: .65, wealthy: .3 }[id],
    savings: { working: .08, middle: .7, professional: 2.5, wealthy: 8 }[id],
    retired: clamp(elderly * { working: .9, middle: 1, professional: 1.1, wealthy: 1.15 }[id], .05, .5),
  }])) as Cohorts)
}

export function normalizeCohorts(value: unknown, baseline: Cohorts): Cohorts {
  const raw = rec(value), out = {} as Cohorts
  for (const id of COHORTS) {
    const r = rec(raw[id]), b = baseline[id]
    out[id] = { share: num(r.share,b.share,.005,.95), employment: num(r.employment,b.employment,0,1), skill: num(r.skill,b.skill,.1,1),
      income: num(r.income,b.income,.05,20), spending: num(r.spending,b.spending,.3,1.8), debt: num(r.debt,b.debt,0,4), savings: num(r.savings,b.savings,0,20), retired: num(r.retired,b.retired,.03,.55) }
  }
  return compactCohorts(out)
}

/** Stable share totals and field order are important for shared Time Machine frames. */
export function compactCohorts(cohorts: Cohorts): Cohorts {
  const total = COHORTS.reduce((n,id) => n + cohorts[id].share,0) || 1
  let used = 0
  for (const id of COHORTS) {
    cohorts[id].share = id === 'wealthy' ? round(1-used) : round(cohorts[id].share / total)
    used += cohorts[id].share
    for (const key of Object.keys(cohorts[id]) as (keyof Cohort)[]) cohorts[id][key] = round(cohorts[id][key])
  }
  return cohorts
}

/** Spending is volume relative to each group's normal basket, weighted by that basket. */
export function cohortDemand(cohorts: Cohorts): number {
  let weight = 0, demand = 0
  for (const id of COHORTS) { const w = cohorts[id].share * LEVEL[id] * CONSUMPTION[id]; weight += w; demand += w * cohorts[id].spending }
  return clamp(demand / Math.max(.01,weight),.3,1.8)
}
export function cohortSkills(cohorts: Cohorts): number {
  let weight=0, skills=0
  for (const id of COHORTS) { const w=cohorts[id].share*(1-cohorts[id].retired); weight+=w; skills+=w*cohorts[id].skill }
  return clamp(skills/Math.max(.01,weight),.2,.95)
}
export function householdPressure(e: CountryEconomy): number {
  const a=e.cohorts.working,b=e.cohorts.middle
  return clamp((a.spending*a.share+b.spending*b.share)/Math.max(.01,a.share+b.share),.4,1.6)
}
export function educationAccess(e: CountryEconomy): number {
  return clamp(1+(e.services-1)*.4+(e.mobility-.5)*.35+(e.cohorts.working.skill-.45)*.2,.5,1.4)
}

export interface CohortConditions {
  wages: number; unemployment: number; credit: number; rate: number; taxShift: number
  services: number; mobility: number; education: number; automation: number
}

/** Distribution follows realized macro conditions. Automation reallocates unemployment
 * risk across groups; it does not create a second national job-loss penalty. */
export function advanceCohorts(old: CountryEconomy, c: CohortConditions): Cohorts {
  const out = structuredClone(old.cohorts)
  const up = clamp((c.services-1)*.008+(c.mobility-.5)*.005+c.education*.002,-.002,.006)
  const down = Math.max(0,c.unemployment-.09)*.012
  const first = clamp(up-down,-out.middle.share*.01,out.working.share*.01)
  const second = clamp(up*.65,-out.professional.share*.01,out.middle.share*.008)
  out.working.share-=first; out.middle.share+=first-second; out.professional.share+=second
  compactCohorts(out)
  const vulnerability = { working: .18, middle: .04, professional: -.12, wealthy: -.06 }
  let labor=0,riskTotal=0,shiftTotal=0
  for(const id of COHORTS){const w=out[id].share*(1-out[id].retired);labor+=w;riskTotal+=w*RISK[id];shiftTotal+=w*vulnerability[id]}
  const avgRisk=riskTotal/Math.max(.01,labor),avgShift=shiftTotal/Math.max(.01,labor)
  for(const id of COHORTS){
    const p=old.cohorts[id],n=out[id]
    n.retired=clamp(p.retired*.8+old.elderly*{working:.9,middle:1,professional:1.1,wealthy:1.15}[id]*.2,.03,.55)
    n.employment=clamp(1-c.unemployment*RISK[id]/avgRisk-c.automation*(vulnerability[id]-avgShift),.1,.998)
    n.skill=clamp(p.skill+c.education*(id==='working'?.012:id==='middle'?.009:.005)+(c.services-1)*.004-(p.skill-.65*SKILL[id])*.008,.1,.98)
    const employmentRatio=(.35+.65*n.employment)/(.35+.65*(1-.06*RISK[id]))
    const pensionMix=(1-n.retired+n.retired*.55)/(1-.17*.45)
    const assetIncome=id==='wealthy'?1+clamp(old.growth*.6+old.housingReturn*.1,-.1,.12):1
    const targetIncome=LEVEL[id]*c.wages*employmentRatio*pensionMix*assetIncome*(1-c.taxShift)
    n.income=clamp(p.income*.6+targetIncome*.4,.05,20)
    // These are real cost indices. Nominal inflation/priceScale is never applied again.
    const essentials={working:.55,middle:.35,professional:.22,wealthy:.1}[id]
    const housing={working:.3,middle:.3,professional:.22,wealthy:.1}[id]
    const prices=clamp(old.sectors.essentials.costs*essentials+old.rent*housing+old.sectors.consumer.costs*(1-essentials-housing),.5,2.5)
    const interest=Math.max(0,Math.min(.3,c.rate)-.04)*p.debt*{working:.75,middle:.7,professional:.5,wealthy:.2}[id]
    const resources=n.income/LEVEL[id]-interest
    const buffer=Math.min(.08,p.savings*.03)
    const target=clamp((resources*(.9+old.confidence*.1)+buffer)/prices,.3,1.8)
    n.spending=clamp(p.spending*.55+target*.45,.3,1.8)
    const balance=resources-n.spending*prices*CONSUMPTION[id]
    const deficit=Math.max(0,-balance),draw=Math.min(p.savings,deficit)
    n.savings=clamp(p.savings-draw+Math.max(0,balance)*.2,0,20)
    n.debt=clamp(p.debt+Math.max(0,deficit-draw)*Math.min(1,c.credit)-Math.max(0,balance)*.12,0,4)
  }
  return compactCohorts(out)
}
