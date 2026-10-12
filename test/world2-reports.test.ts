import { describe, expect, it } from 'vitest'
import { makeTestGame } from './helpers'
import { economyOf, economyState, ensureEconomy, SECTORS, yearlyEconomy } from '../src/game/economy'
import { economyMenu } from '../src/game/economy/menu'
import { COHORTS } from '../src/game/economy/cohorts'
import { TRADE_INPUTS } from '../src/game/economy/trade'
import { getCountry } from '../src/game/world'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { bookYear, planFor, simulateYear } from '../src/game/business/economy'
import { economicReportDetails, economicReportMenu, economicReportOf, economicReportSummary, recordEconomicReport } from '../src/game/business/economic-report'
import { formGroup } from '../src/game/business/conglomerate-actions'
import { groupsOf } from '../src/game/business/conglomerate-state'
import { internalRevenue, toggleService } from '../src/game/business/group-services'
import { businessView } from '../src/game/business/manage'
import { readBiz, type BizState, type Statement } from '../src/game/business/state'
import { reportData, yearlyBusinessImpl } from '../src/game/business/yearly'
import type { GameState, MenuNode } from '../src/game/types'
import type { Industry } from '../src/game/data/markets'

function company() {
  const g=makeTestGame(741,{age:40,money:1e8})
  g.year=2030
  ensureEconomy(g)
  const b=newBiz(g,'manufacturing','us','Chicago',{cash:1e8,founded:2020,production:100000,quality:70,brand:70})
  const a=createBusinessAsset(g,'Report Components',b,1e6)
  g.assets.push(a)
  return {g,a,b:a.details as unknown as BizState}
}

function settled() {
  const x=company(),previous={...simulateYear(x.g,x.b,2030,0,1).stmt}
  x.g.year=2031
  yearlyEconomy(x.g)
  x.b.price*=.95;x.b.debt=500000;x.b.debtRate=.1;x.b.yearCosts=34567;x.b.yearIncome=789
  const current=simulateYear(x.g,x.b,2031,0,1).stmt
  recordEconomicReport(x.b,previous,current)
  return {...x,previous,current}
}

function visit(g:GameState,nodes:MenuNode[]):MenuNode[] {
  const out:MenuNode[]=[]
  for(const n of nodes){
    out.push(n)
    if('subtitle' in n&&typeof n.subtitle==='function')n.subtitle(g)
    if('header' in n)n.header?.(g)
    if('disabledReason' in n)n.disabledReason?.(g)
    if('confirm' in n)n.confirm?.(g)
    if(n.type==='menu')out.push(...visit(g,n.children(g)))
  }
  return out
}
const percent=(n:number)=>`${(n*100).toFixed(1)}%`
function displayed(g:GameState):Record<string,string>{
  return Object.fromEntries(visit(g,[economyMenu]).flatMap(n=>n.type==='info'?[[n.id,typeof n.text==='function'?n.text(g):n.text]]:[]))
}

describe('World Simulation 2.0: settled economic transparency',()=>{
  it('explains the exact realized net-profit change from actual settled statement lines',()=>{
    const x=settled(),r=economicReportOf(x.b)!
    expect(r).not.toBeNull()
    expect(r.year).toBe(x.current.year)
    expect(r.previousYear).toBe(x.previous.year)
    expect(r.previousNet).toBe(x.previous.net)
    expect(r.net).toBe(x.current.net)
    expect(r.delta).toBe(x.current.net-x.previous.net)
    expect(r.drivers.reduce((sum,d)=>sum+d.amount,0)).toBe(r.delta)
    expect(r.drivers.find(d=>d.label==='Debt interest')?.amount).toBe(x.previous.interest-x.current.interest)
    expect(r.drivers.find(d=>d.label==='One-off expenses')?.amount).toBe(x.previous.other-x.current.other)
    expect(r.drivers.length).toBeLessThanOrEqual(13)
    expect(economicReportDetails(x.b)).toHaveLength(r.drivers.length)
  })

  it('sums the change up in its menu row (no production jargon on a bank or fund)',()=>{
    const sub=(x:{g:GameState,a:Parameters<typeof economicReportMenu>[0]})=>{const m=economicReportMenu(x.a);return typeof m.subtitle==='function'?m.subtitle(x.g):String(m.subtitle)}
    expect(sub(company())).toBe('Compares two settled years of accounts')
    const x=settled(),r=economicReportOf(x.b)!
    expect(sub(x)).toMatch(new RegExp(`^Net profit (up|down) .+ on ${r.previousYear}$`))
  })

  it('preserves an exact bridge after independent dollar rounding without classifying cash erosion as profit',()=>{
    const x=company(),previous=simulateYear(x.g,x.b,2030,0,1).stmt
    const current:Statement={...previous,year:2031,netRevenue:previous.netRevenue+101,cogs:previous.cogs+27,wages:previous.wages+13,
      corpTax:previous.corpTax+4,net:previous.net+59,cashErosion:previous.cashErosion+1000000}
    x.b.last=current
    recordEconomicReport(x.b,previous,current)
    const r=economicReportOf(x.b)!
    expect(r.delta).toBe(59)
    expect(r.drivers.reduce((sum,d)=>sum+d.amount,0)).toBe(59)
    expect(r.drivers.find(d=>d.label==='Rounding and statement adjustments')?.amount).toBe(2)
    expect(r.drivers.some(d=>/cash|erosion/i.test(d.label))).toBe(false)
  })

  it('records the real annual hook once, using the previous statement before simulation overwrites it',()=>{
    const x=company(),previous={...simulateYear(x.g,x.b,2030,0,1).stmt}
    x.g.year=2032
    yearlyEconomy(x.g)
    yearlyBusinessImpl(x.g)
    const b=readBiz(x.g,x.a),r=economicReportOf(b)!
    expect(r).not.toBeNull()
    expect(r.previousYear).toBe(2030)
    expect(r.previousNet).toBe(previous.net)
    expect(r.year).toBe(2031)
    expect(r.net).toBe(b.last!.net)
    const report=JSON.stringify(b.economicReport)
    yearlyBusinessImpl(x.g)
    expect(JSON.stringify(readBiz(x.g,x.a).economicReport)).toBe(report)
  })

  it('rebuilds profit attribution from final internal-contract statements and matching recorded history',()=>{
    const g=makeTestGame(818,{age:40,money:1e9})
    g.year=2030;ensureEconomy(g)
    const assets=(['marketing','restaurant'] as const).map((industry,i)=>{
      const b=newBiz(g,industry,'us','Chicago',{cash:1e8,founded:2020,production:1e6,quality:95,brand:95,marketingLevel:i?3:1})
      const a=createBusinessAsset(g,i?'Internal customer':'Internal provider',b,1e7)
      g.assets.push(a)
      const live=a.details as unknown as BizState
      live.valuation=1e7
      simulateYear(g,live,2030,0,1)
      return a
    })
    const previous=assets.map(a=>({...readBiz(g,a).last!}))
    expect(formGroup(g,assets.map(a=>a.id),'Report Group')).toBe(true)
    const group=groupsOf(g)[0].core.id
    expect(toggleService(g,group,assets[0].id,assets[1].id)).toBe(true)
    g.year=2032;yearlyEconomy(g);yearlyBusinessImpl(g)
    expect(internalRevenue(g,group,2031)).toBeGreaterThan(0)
    for(let i=0;i<assets.length;i++){
      const b=readBiz(g,assets[i]),r=economicReportOf(b)!,s=b.last!
      expect(r).not.toBeNull()
      expect(r.previousNet).toBe(previous[i].net)
      expect(r.net).toBe(s.net)
      expect(r.drivers.reduce((sum,d)=>sum+d.amount,0)).toBe(s.net-previous[i].net)
      expect(b.history.find(h=>h.year===2031)?.profit).toBe(s.net)
      expect(r.drivers.find(d=>d.label==='Sales after sales tax')?.amount??0).toBe(Math.round(s.netRevenue-previous[i].netRevenue))
      expect(r.drivers.find(d=>d.label==='Materials and direct costs')?.amount??0).toBe(Math.round(previous[i].cogs-s.cogs))
    }
    const once=assets.map(a=>JSON.stringify(readBiz(g,a).economicReport))
    yearlyBusinessImpl(g)
    expect(assets.map(a=>JSON.stringify(readBiz(g,a).economicReport))).toEqual(once)
  })

  it('does not invent year-on-year attribution for an opening company or a skipped fiscal interval',()=>{
    const x=settled()
    recordEconomicReport(x.b,null,x.current)
    expect(economicReportOf(x.b)).toBeNull()
    expect(x.b.economicReport).toBeUndefined()
    recordEconomicReport(x.b,{...x.previous,year:2028},x.current)
    expect(economicReportOf(x.b)).toBeNull()
  })

  it('rejects stale, incomplete or nonfinite imported bridges and bounds optional detail rows',()=>{
    const x=settled(),good=structuredClone(x.b.economicReport!) as Record<string,unknown>
    for(const patch of [{net:x.current.net+1},{year:2028},{previousYear:2028},{previousNet:Infinity},{previousNet:'0'},{drivers:[{label:'Invalid',amount:Infinity}]},{drivers:[]}]){
      x.b.economicReport={...good,...patch} as never
      expect(economicReportOf(x.b)).toBeNull()
    }
    x.b.economicReport={...good,previousNet:x.current.net-13,drivers:Array.from({length:100},()=>({label:'A'.repeat(200),amount:1}))} as never
    const bounded=economicReportOf(x.b)!
    expect(bounded.drivers).toHaveLength(13)
    expect(bounded.drivers.every(d=>d.label.length===80)).toBe(true)
  })

  it('keeps stored reports, wallet, RNG, stock and economic state untouched by menus and forecasts',()=>{
    const x=settled(),before=JSON.stringify(x.g),report=economicReportOf(x.b)
    for(let i=0;i<3;i++){
      const b=readBiz(x.g,x.a)
      expect(economicReportOf(b)).toEqual(report)
      economicReportSummary(b);economicReportDetails(b)
      visit(x.g,[economicReportMenu(x.a)])
      reportData(x.g,x.a,b)
      const plan=planFor(x.g,b,x.g.year)
      bookYear(x.g,b,x.g.year,plan,b.production,0)
      visit(x.g,[economyMenu])
    }
    expect(JSON.stringify(x.g)).toBe(before)
    const reloaded=JSON.parse(before) as GameState
    expect(economicReportOf(readBiz(reloaded,reloaded.assets[0]))).toEqual(report)
  })

  it('shows realized supply losses from the settled year, never a fresh forecast as historical fact',()=>{
    const x=settled()
    const last={year:2031,requested:100,produced:50,inputShortfall:30,workforceShortfall:20,
      availability:.5,workforce:.8,importedGap:.2,purchased:50,purchaseCost:500,storageCost:10,spoilageCost:5}
    x.b.supply={v:1,stock:0,bookValue:0,lastYear:2031,last}
    expect(economicReportSummary(x.b)).toContain('Missing inputs prevented 30 planned units')
    expect(economicReportSummary(x.b)).toContain('Workforce limits prevented 20 planned units')
    expect(economicReportSummary(x.b)).toContain('already included')
    x.b.supply={v:1,stock:0,bookValue:0,lastYear:2030,last:{...last,year:2030}}
    expect(economicReportSummary(x.b)).not.toContain('Missing inputs prevented')
  })

  it('reading the economy menu for a legacy save never creates annual state or transfers cash',()=>{
    const g=makeTestGame(199,{age:40,money:2000}),before=JSON.stringify(g)
    visit(g,[economyMenu])
    expect(JSON.stringify(g)).toBe(before)
  })

  it('reports actual contract gains and losses as procurement cost, not invented inventory profit',()=>{
    const x=settled()
    const last={year:2031,requested:100,produced:100,inputShortfall:0,workforceShortfall:0,
      availability:1,workforce:1,importedGap:0,purchased:120,purchaseCost:500,storageCost:0,spoilageCost:0,
      target:.2,spotPrice:5,inputPrice:4,contractSaving:100,trainingRecovery:.02,automationRecovery:.03}
    x.b.supply={v:1,stock:20,bookValue:80,lastYear:2031,last}
    expect(economicReportSummary(x.b)).toContain('contract saved')
    expect(economicReportSummary(x.b)).toContain('not immediate profit on stock still held')
    expect(economicReportSummary(x.b)).toContain('training restored 2.0 percentage points')
    expect(economicReportSummary(x.b)).toContain('automation restored 3.0')
    x.b.supply={v:1,stock:20,bookValue:80,lastYear:2031,last:{...last,contractSaving:-100}}
    expect(economicReportSummary(x.b)).toContain('contract cost an extra')
  })

  it('optional economic details display actual persisted supply, trade, households and budget data',()=>{
    const {g}=settled(),e=economyOf(g),rows=displayed(g)
    expect(economyMenu.children(g)).toHaveLength(2)
    for(const s of SECTORS){
      expect(rows[`economy.sector.${s}`]).toContain(`input coverage ${percent(e.sectors[s].availability)}`)
      expect(rows[`economy.sector.${s}`]).toContain(`workforce coverage ${percent(e.sectors[s].workforce)}`)
      expect(rows[`economy.sector.${s}`]).toContain(`Costs ${e.sectors[s].costs.toFixed(2)}×`)
    }
    for(const s of TRADE_INPUTS){
      const t=e.tradeNetwork.inputs[s],text=rows[`economy.trade.${s}`]
      expect(text).toContain(`dependence ${percent(t.dependence)}`)
      expect(text).toContain(`delivery coverage ${percent(t.availability)}`)
      expect(text).toContain(`tariffs ${percent(t.tariff)}`)
      expect(text).toContain('Supplier mix for next year')
      for(const route of t.routes)expect(text).toContain(`${getCountry(route.partner).name} ${percent(route.share)}`)
    }
    for(const id of COHORTS){
      const c=e.cohorts[id],text=rows[`economy.cohort.${id}`]
      expect(text).toContain(`${percent(c.share)} of households`)
      expect(text).toContain(`Income ${c.income.toFixed(2)}× baseline`)
      expect(text).toContain(`consumption ${percent(c.spending)}`)
    }
    expect(rows['economy.budget.0']).toContain(`Revenue ${percent(e.budget.revenue)}, spending ${percent(e.budget.spending)}`)
    expect(rows['economy.budget.1']).toContain(`Interest alone costs ${percent(e.budget.interest)}`)
    expect(rows['economy.budget.2']).toContain(`Public debt ${percent(e.governmentDebt)}`)
    expect(rows['economy.budget.3']).toContain(`${percent(e.budget.funding)} of requested primary programmes were funded`)
    expect(rows['economy.budget.4']).toContain(`credit availability ${e.credit.toFixed(2)}× normal`)
    expect(Object.keys(rows).length).toBeLessThan(80)
  })

  it('company-watch rows use persisted rival outcomes, remain bounded and do not mutate roster order',()=>{
    const {g}=settled(),state=economyState(g)!,before=JSON.stringify(state.rivals),rows=displayed(g)
    const ids=Object.keys(rows).filter(id=>id.startsWith('economy.actor.'))
    expect(ids.length).toBeGreaterThan(0)
    expect(ids.length).toBeLessThanOrEqual(16)
    for(const id of ids){
      const actor=state.rivals.find(r=>`economy.actor.${r.key}`===id)!
      expect(actor).toBeDefined()
      expect(actor.scope==='world'||actor.scope===g.character.countryId).toBe(true)
      expect(rows[id]).toContain(`${actor.outcome}, ${actor.year}`)
      expect(rows[id]).toContain(`Cash ${actor.cash.toFixed(2)} years, debt ${actor.debt.toFixed(2)} years`)
      expect(rows[id]).toContain(actor.cause)
    }
    expect(JSON.stringify(state.rivals)).toBe(before)
  })

  it.each<Industry>(['manufacturing','bank','investmentFirm','gameStudio','semiconductor'])('exposes a pure report entry for %s without adding a second financial model',industry=>{
    const g=makeTestGame(119,{age:40,money:1e9})
    g.year=2031
    const a=createBusinessAsset(g,'Report menu',newBiz(g,industry,'us','Chicago',{cash:1e8,founded:2020}),1e7)
    g.assets.push(a)
    const before=JSON.stringify(g),nodes=businessView(g,a)
    const report=nodes.find(n=>n.id===`biz.economicReport.${a.id}`)
    expect(report?.type).toBe('menu')
    if(report?.type==='menu'){
      const rows=visit(g,[report])
      expect(rows.some(n=>n.type==='info'&&typeof n.text==='string'&&n.text.includes('two consecutive'))).toBe(true)
    }
    expect(JSON.stringify(g)).toBe(before)
  })
})
