import { describe, expect, it } from 'vitest'
import { budgetPlan, finalizeDebt, GOVERNMENT_DEBT_CAP, initialBudget, normalizeBudget, type GovernmentBudget, type GovernmentPolicies } from '../src/game/economy/government'
import { initialCountry } from '../src/game/economy/model'
import { COUNTRIES } from '../src/game/world'

const none:GovernmentPolicies={investment:0,education:0,health:0,taxCut:0,taxRise:0,regulation:0}
function balanced(b:GovernmentBudget):void{
  expect(b.spending).toBeCloseTo(b.education+b.health+b.infrastructure+b.transfers+b.other+b.interest,6)
  expect(b.deficit).toBeCloseTo(b.spending-b.revenue,6)
  expect(b.revenue+b.borrowing).toBeCloseTo(b.spending+b.repayment+b.surplusSaved,6)
  for(const [key,value] of Object.entries(b))if(typeof value==='number')expect(Number.isFinite(value),key).toBe(true)
}

describe('World Simulation 2.0: funded public budgets',()=>{
  it('exposes explicit baseline revenue, programmes, debt service and balanced financing in every country',()=>{
    for(const {id} of COUNTRIES){
      const b=initialBudget(id,2030,.6)
      balanced(b)
      expect(b.closingDebt).toBe(.6)
      expect(b.revenue).toBeGreaterThan(0)
      expect(b.education).toBeGreaterThan(0)
      expect(b.health).toBeGreaterThan(0)
      expect(b.infrastructure).toBeGreaterThan(0)
      expect(JSON.stringify(normalizeBudget(JSON.parse(JSON.stringify(b)),id,2030,.6))).toBe(JSON.stringify(b))
    }
  })

  it('funds education and infrastructure through explicit expenditure and borrowing, with interest charged once',()=>{
    const old=initialCountry('us',2030),ordinary=budgetPlan(old,'us',none)
    const policy=budgetPlan(old,'us',{...none,education:1,investment:1})
    expect(policy.ledger.education).toBeGreaterThan(ordinary.ledger.education)
    expect(policy.ledger.infrastructure).toBeGreaterThan(ordinary.ledger.infrastructure)
    expect(policy.funded.education).toBe(1)
    expect(policy.funded.investment).toBe(1)
    expect(policy.fiscal).toBeGreaterThan(ordinary.fiscal)
    const funded=finalizeDebt(policy,old.governmentDebt,.02),control=finalizeDebt(ordinary,old.governmentDebt,.02)
    balanced(funded);balanced(control)
    expect(funded.closingDebt).toBeGreaterThan(control.closingDebt)
    expect(funded.closingDebt).toBeCloseTo((old.governmentDebt+funded.borrowing-funded.repayment-funded.debtAdjustment)/1.02,6)
    // Interest is already inside spending; adding it again would violate this identity.
    expect(funded.closingDebt).toBeCloseTo((old.governmentDebt+funded.deficit)/1.02,6)
  })

  it('weak employment and spending shrink receipts and increase actual support costs',()=>{
    const old=initialCountry('us',2030),crisis=structuredClone(old)
    crisis.unemployment=.2;crisis.spending=.65;crisis.outputGap=-.2;crisis.defaults=.12
    const base=budgetPlan(old,'us',none),bad=budgetPlan(crisis,'us',none)
    expect(bad.ledger.revenue).toBeLessThan(base.ledger.revenue)
    expect(bad.ledger.transfers).toBeGreaterThan(base.ledger.transfers)
    expect(bad.ledger.deficit).toBeGreaterThan(base.ledger.deficit)
    balanced(bad.ledger)
  })

  it('tax policy changes revenue once without treating a lower tax take as free programme funding',()=>{
    const old=initialCountry('us',2030),normal=budgetPlan(old,'us',none)
    const cut=budgetPlan(old,'us',{...none,taxCut:1}),rise=budgetPlan(old,'us',{...none,taxRise:1})
    expect(cut.ledger.revenue).toBeCloseTo(normal.ledger.revenue-.014,5)
    expect(rise.ledger.revenue).toBeCloseTo(normal.ledger.revenue+.014,5)
    expect(finalizeDebt(cut,.6,.02).closingDebt).toBeGreaterThan(finalizeDebt(rise,.6,.02).closingDebt)
    balanced(cut.ledger);balanced(rise.ledger)
  })

  it('debt and credit limits reduce paid programmes and their funded policy effects together',()=>{
    const old=initialCountry('us',2030),tight=structuredClone(old)
    tight.governmentDebt=2.45;tight.credit=.3;tight.rate=.18
    const policy={...none,education:1.5,health:1.5,investment:1.5}
    const normal=budgetPlan(old,'us',policy),limited=budgetPlan(tight,'us',policy)
    expect(limited.ledger.funding).toBeLessThan(normal.ledger.funding)
    expect(limited.ledger.unfunded).toBeGreaterThan(0)
    expect(limited.funded.education).toBeLessThan(normal.funded.education)
    expect(limited.ledger.education).toBeLessThan(normal.ledger.education)
    expect(limited.ledger.borrowing).toBe(0)
    const result=finalizeDebt(limited,tight.governmentDebt,.01)
    balanced(result)
    expect(result.closingDebt).toBeLessThanOrEqual(GOVERNMENT_DEBT_CAP)
  })

  it('unexpected contraction records any necessary debt restructuring instead of silently deleting it',()=>{
    const old=initialCountry('us',2030)
    old.governmentDebt=2.5;old.growth=.08
    const plan=budgetPlan(old,'us',none),result=finalizeDebt(plan,old.governmentDebt,-.18)
    expect(result.debtAdjustment).toBeGreaterThan(0)
    expect(result.closingDebt).toBe(GOVERNMENT_DEBT_CAP)
    expect(result.closingDebt).toBeCloseTo((old.governmentDebt+result.borrowing-result.repayment-result.debtAdjustment)/.82,6)
    balanced(result)
  })

  it('fully repays small debts and saves any remaining surplus without phantom minimum debt',()=>{
    const old=initialCountry('us',2030)
    old.governmentDebt=.002;old.rate=0
    const plan=budgetPlan(old,'us',none),result=finalizeDebt(plan,old.governmentDebt,.1)
    expect(result.deficit).toBeLessThan(-.002)
    expect(result.repayment).toBe(.002)
    expect(result.surplusSaved).toBeGreaterThan(0)
    expect(result.closingDebt).toBe(0)
    expect(result.closingDebt).toBeCloseTo((old.governmentDebt+result.borrowing-result.repayment-result.debtAdjustment)/1.1,6)
    balanced(result)
    old.governmentDebt=0
    const noDebt=finalizeDebt(budgetPlan(old,'us',none),0,.1)
    expect(noDebt.repayment).toBe(0)
    expect(noDebt.closingDebt).toBe(0)
    expect(initialBudget('us',2030,0).repayment).toBe(0)
    expect(initialBudget('us',2030,0).closingDebt).toBe(0)
    balanced(noDebt)
  })

  it('all finalized country ledgers preserve canonical fields, six-decimal values and positive zero through reload',()=>{
    for(const {id} of COUNTRIES){
      const old=initialCountry(id,2030)
      for(const debt of [0,.002,.6,2.5]){
        old.governmentDebt=debt
        const plan=budgetPlan(old,id,{...none,education:1,health:.5,investment:.3})
        const b=finalizeDebt(plan,debt,.027)
        const normalized=normalizeBudget(JSON.parse(JSON.stringify(b)),id,2031,b.closingDebt)
        expect(normalized).toEqual(b)
        expect(JSON.stringify(normalized)).toBe(JSON.stringify(b))
        for(const value of Object.values(b))if(typeof value==='number'){
          expect(Object.is(value,-0)).toBe(false)
          expect(value).toBeCloseTo(Math.round(value*1e6)/1e6,10)
        }
        expect(Object.is(plan.fiscal,-0)).toBe(false)
        expect(b.closingDebt).toBeCloseTo((debt+b.borrowing-b.repayment-b.debtAdjustment)/1.027,5)
        balanced(b)
      }
    }
  })

  it('uses authoritative country debt when imported descriptive metadata disagrees',()=>{
    const b=initialBudget('us',2030,.6)
    b.closingDebt=2.5
    expect(normalizeBudget(b,'us',2030,.6).closingDebt).toBe(.6)
    expect(normalizeBudget(b,'us',2030,0).closingDebt).toBe(0)
  })

  it('plans and finalizes from immutable state and normalizes finalized ledgers byte-for-byte',()=>{
    const old=initialCountry('kr',2030)
    Object.freeze(old)
    const policy=Object.freeze({...none,education:1,regulation:1})
    const before=JSON.stringify(old),plan=budgetPlan(old,'kr',policy)
    const a=finalizeDebt(plan,old.governmentDebt,.02),b=finalizeDebt(plan,old.governmentDebt,.02)
    expect(b).toEqual(a)
    expect(JSON.stringify(old)).toBe(before)
    expect(JSON.stringify(normalizeBudget(JSON.parse(JSON.stringify(a)),'kr',2031,a.closingDebt))).toBe(JSON.stringify(a))
    expect(plan.ledger.closingDebt).toBe(old.governmentDebt)
  })
})
