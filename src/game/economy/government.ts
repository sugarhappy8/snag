// Aggregate GDP-share budgets, not a treasury wallet or a second tax collector.
// Concrete household/company taxes remain with their existing settlement functions.
import { marketOf } from '../data/markets'
import { getCountry } from '../world'
import type { CountryEconomy } from './model'

export interface GovernmentBudget {
  v: 1; year: number
  revenue: number; education: number; health: number; infrastructure: number; transfers: number; other: number
  interest: number; spending: number; deficit: number
  borrowing: number; repayment: number; surplusSaved: number; unfunded: number
  /** Explicit aggregate debt restructuring, not hidden write-offs or player income. */
  debtAdjustment: number; closingDebt: number; funding: number
}
export interface GovernmentPolicies { investment: number; education: number; health: number; taxCut: number; taxRise: number; regulation: number }
export interface BudgetPlan {
  ledger: GovernmentBudget
  /** Bounded demand impulse relative to ordinary primary spending/revenue. */
  fiscal: number
  funded: Pick<GovernmentPolicies, 'investment' | 'education' | 'health' | 'regulation'>
}
const clamp = (n: number, lo: number, hi: number) => Number.isFinite(n) ? Math.max(lo, Math.min(hi,n)) : lo
const round = (n: number) => Math.round(n * 1e6) / 1e6 || 0
const rec = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
const num = (v: unknown, fallback: number, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) ? clamp(v,lo,hi) : fallback
export const GOVERNMENT_DEBT_CAP = 2.5
export const GOVERNMENT_DEBT_FLOOR = 0
const PRIMARY = ['education','health','infrastructure','transfers','other'] as const
const zeroPolicy: GovernmentPolicies = { investment:0,education:0,health:0,taxCut:0,taxRise:0,regulation:0 }

/** A country-profile approximation of tax plus other public revenue, not reported
 * national accounts. Resource income/fees are part of the base even in tax-free states. */
function baseline(country: string) {
  const m=marketOf(country), revenue=clamp(.17+m.salesTax*.28+m.corporateTax*.16+getCountry(country).wealth*.025,.17,.4)
  // The existing economy already reserved 1.2% of GDP for primary debt repayment.
  // Make that surplus explicit instead of subtracting it again after interest.
  const primary=revenue-.012
  return { revenue, education:primary*.15, health:primary*.2, infrastructure:primary*.13, transfers:primary*.25, other:primary*.27 }
}

export function compactBudget(b: GovernmentBudget): GovernmentBudget {
  for(const key of ['revenue',...PRIMARY,'interest','unfunded','debtAdjustment','closingDebt','funding'] as const)b[key]=round(b[key])
  b.spending=round(PRIMARY.reduce((sum,key)=>sum+b[key],0)+b.interest)
  b.deficit=round(b.spending-b.revenue)
  b.borrowing=round(Math.max(0,b.deficit))
  b.repayment=round(clamp(b.repayment,0,Math.max(0,-b.deficit)))
  b.surplusSaved=round(Math.max(0,-b.deficit-b.repayment))
  return b
}

/** Descriptive opening metadata only. No prior-year government or player payments run. */
export function initialBudget(country: string, year: number, debt=.6): GovernmentBudget {
  const b=baseline(country), interest=clamp(marketOf(country).interestRate,0,.12)*clamp(debt,GOVERNMENT_DEBT_FLOOR,GOVERNMENT_DEBT_CAP)*.35
  const spending=PRIMARY.reduce((sum,key)=>sum+b[key],0)+interest, deficit=spending-b.revenue
  return compactBudget({v:1,year,...b,interest,spending,deficit,borrowing:Math.max(0,deficit),repayment:Math.min(Math.max(0,debt),Math.max(0,-deficit)),surplusSaved:0,unfunded:0,debtAdjustment:0,closingDebt:clamp(debt,GOVERNMENT_DEBT_FLOOR,GOVERNMENT_DEBT_CAP),funding:1})
}

/** Missing/damaged old-save metadata never backdates taxes, expenses or borrowing. */
export function normalizeBudget(value: unknown,country: string,year: number,debt=.6): GovernmentBudget {
  const r=rec(value), b=initialBudget(country,year,debt)
  if(r.v!==1)return b
  for(const key of ['revenue',...PRIMARY,'interest'] as const)b[key]=num(r[key],b[key],0,1)
  b.repayment=num(r.repayment,b.repayment,0,2.5)
  b.unfunded=num(r.unfunded,0,0,1)
  b.debtAdjustment=num(r.debtAdjustment,0,0,5)
  // Country debt is authoritative. A stale or damaged duplicate ledger cannot
  // show a different obligation than the balance used by the next settlement.
  b.closingDebt=clamp(debt,GOVERNMENT_DEBT_FLOOR,GOVERNMENT_DEBT_CAP)
  b.funding=num(r.funding,1,0,1)
  return compactBudget(b)
}

/** Funding uses the opening debt, tax base and financing conditions. Policies supplied
 * by simulation.ts were enacted before this year; reads do not pass or replay laws. */
export function budgetPlan(old: CountryEconomy,country: string,policies: GovernmentPolicies=zeroPolicy): BudgetPlan {
  const p=Object.fromEntries(Object.entries(zeroPolicy).map(([id])=>[id,clamp(policies[id as keyof GovernmentPolicies],0,1.5)])) as unknown as GovernmentPolicies
  const b=baseline(country)
  const taxChange=(p.taxRise-p.taxCut)*.014
  const revenue=clamp(b.revenue+taxChange+old.outputGap*.09+(old.spending-1)*.025-Math.max(0,old.unemployment-.065)*.1-Math.max(0,old.defaults-.025)*.05,.12,.48)
  const requested={education:b.education+p.education*.012,health:b.health+p.health*.012,infrastructure:b.infrastructure+p.investment*.018,
    transfers:b.transfers+Math.max(0,old.unemployment-.065)*.18+Math.max(0,old.elderly-.17)*.035,
    other:b.other+p.regulation*.001}
  const primary=PRIMARY.reduce((sum,key)=>sum+requested[key],0)
  // Keep the established bounded funding-rate proxy: much public debt is long-dated,
  // so today's policy rate is not charged on every outstanding bond at once.
  const interest=clamp(old.rate,0,.12)*old.governmentDebt*.35
  const planningGrowth=clamp(Math.min(0,old.growth-.04),-.18,0)
  const room=GOVERNMENT_DEBT_CAP*(1+planningGrowth)-old.governmentDebt
  const creditLimit=clamp(.055+(old.credit-1)*.025-Math.max(0,old.governmentDebt-1)*.018,.012,.075)
  const borrowingRoom=Math.max(0,Math.min(creditLimit,room))
  // A debt-heavy government adjusts primary programmes first. Essential debt service
  // remains explicit; an unforeseen closing-year contraction is settled below.
  const requiredRepayment=Math.max(0,-room)
  const consolidation=Math.max(0,old.governmentDebt-1)*.025
  const resources=Math.max(0,revenue+borrowingRoom-interest-requiredRepayment)
  const fundedPrimary=Math.max(0,Math.min(primary-consolidation,resources))
  const funding=primary>0?clamp(fundedPrimary/primary,0,1):1
  const allocated=Object.fromEntries(PRIMARY.map(key=>[key,requested[key]*funding])) as Pick<GovernmentBudget,typeof PRIMARY[number]>
  const spending=fundedPrimary+interest,deficit=spending-revenue
  const ledger=compactBudget({v:1,year:old.year+1,revenue,...allocated,interest,spending,deficit,
    borrowing:Math.max(0,deficit),repayment:Math.max(0,-deficit),surplusSaved:0,unfunded:primary-fundedPrimary,debtAdjustment:0,closingDebt:old.governmentDebt,funding})
  const ordinaryPrimary=b.revenue-.012
  const fiscal=round(clamp((ledger.spending-ledger.interest-ordinaryPrimary)-(ledger.revenue-b.revenue),-.08,.08))
  return {ledger,fiscal,funded:{investment:round(p.investment*funding),education:round(p.education*funding),health:round(p.health*funding),regulation:round(p.regulation*funding)}}
}

/** Close debt exactly once. The model's existing real-GDP growth convention is retained;
 * household inflation, priceScale and currency conversions never touch this ledger.
 * Surpluses beyond the debt floor become a reported public saving flow, not new player
 * cash. An unexpected debt-cap breach is explicitly a restructuring, never erased. */
export function finalizeDebt(plan: BudgetPlan,oldDebt: number,growth: number): GovernmentBudget {
  const b={...plan.ledger},factor=1+clamp(growth,-.2,.16),opening=clamp(oldDebt,GOVERNMENT_DEBT_FLOOR,GOVERNMENT_DEBT_CAP)
  b.repayment=Math.min(Math.max(0,-b.deficit),Math.max(0,opening-GOVERNMENT_DEBT_FLOOR*factor))
  b.surplusSaved=Math.max(0,-b.deficit-b.repayment)
  b.debtAdjustment=Math.max(0,opening+b.borrowing-b.repayment-GOVERNMENT_DEBT_CAP*factor)
  b.closingDebt=clamp((opening+b.borrowing-b.repayment-b.debtAdjustment)/factor,GOVERNMENT_DEBT_FLOOR,GOVERNMENT_DEBT_CAP)
  return compactBudget(b)
}
