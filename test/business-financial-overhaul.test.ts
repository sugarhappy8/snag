import { describe, expect, it } from 'vitest'
import { makeTestGame } from './helpers'
import { createBusinessAsset, newBiz, startFounding } from '../src/game/business/founding'
import { simulateFinanceYear } from '../src/game/business/finance-firm'
import { loanTotal, readBank, reserveRequirement, saveBank } from '../src/game/business/bank-state'
import { brokerEra, quantBlock } from '../src/game/business/fund-model'
import { bizOf, diluteBusinessEquity, executiveEquity, readBiz, type Statement } from '../src/game/business/state'
import { grantCeoEquity } from '../src/game/business/executive'
import { equityQuote, transactEquity } from '../src/game/business/rescue'
import { formGroup } from '../src/game/business/conglomerate-actions'
import { groupsOf } from '../src/game/business/conglomerate-state'
import { internalRevenue, prepareInternalServices, settleInternalServices, toggleService } from '../src/game/business/group-services'
import { runScript } from '../src/game/scripts'
import { startupCost, valuationOf } from '../src/game/business/economy'
import type { Industry } from '../src/game/data/markets'

function company(industry: Industry = 'bank') {
  const g = makeTestGame(32, { age: 35, money: 100_000_000 })
  const a = createBusinessAsset(g, 'Test company', newBiz(g, industry, 'us', 'Chicago', { cash: 8_000_000, founded: 2020 }), 8_000_000)
  g.assets.push(a)
  const b = bizOf(g, a); b.valuation = valuationOf(b)
  return { g, a, b }
}

describe('financial institution management', () => {
  it('keeps required reserves and balanced books through bad years, even thinly capitalized on borrowed money', () => {
    let flagged = 0, liquid = 0
    for (const cash of [200_000, 2_000_000, 8_000_000]) {
      const { g, b } = company(); b.cash = cash; b.debt = cash * .8
      const book = readBank(b); book.appetite = 'highYield'; book.loanGap = .05; saveBank(b, book)
      for (let year = 2026; year < 2029; year++) {
        simulateFinanceYear(g, b, year, 0)
        b.yearCosts = 0; b.yearIncome = 0
        const after = readBank(b), last = after.last!
        expect(loanTotal(after) + after.badNet + after.reserves + after.bonds).toBeCloseTo(after.deposits + after.advance, 0)
        // Lending never eats into the required cash reserves (a run can drain them; savers come first).
        if (!last.runWithdrawals) { liquid++; expect(after.reserves).toBeGreaterThanOrEqual(after.deposits * reserveRequirement('us', year) - 1) }
        // Capital is the shareholders' money: borrowed cash leaves the bank below the minimum, and regulators act.
        if (last.ratio < last.minRatio) { flagged++; expect(after.strikes).toBeGreaterThan(0); expect(last.regulator).toMatch(/Regulators/) }
        if (after.run) { after.run = null; saveBank(b, after) }
      }
    }
    expect(flagged).toBeGreaterThan(0)
    expect(liquid).toBeGreaterThan(0)
  })
  it('has country-sensitive financial eras, with no computer trading in 1920', () => {
    expect(quantBlock('us', 1920)).toBeTruthy()
    expect(quantBlock('us', 1990)).toBeNull()
    expect(quantBlock('ng', 1990)).toBeTruthy()
    expect(quantBlock('ng', 2026)).toBeNull()
    expect(brokerEra('us', 1920).electronic).toBe(false)
    expect(brokerEra('us', 2026).electronic).toBe(true)
  })
})

describe('funding and rescue accounting', () => {
  it('keeps dismissed executives vested and excludes their shares from buybacks', () => {
    const {g,a,b} = company('cafe')
    b.ceo='manager'; b.manager={firstName:'Ada',lastName:'Lee',gender:'female',skill:95,salary:100000,since:2020}
    expect(grantCeoEquity(g,a.id)).toBe(true)
    const live=bizOf(g,a); live.manager=null; live.public=true
    expect(executiveEquity(live)).toBeCloseTo(.1)
    expect(equityQuote(g,a,live,'secondary',1000).available).toBeCloseTo(0)
    diluteBusinessEquity(live,.8);live.share*=.8
    expect(executiveEquity(readBiz(g,a))).toBeCloseTo(.08)
    expect(equityQuote(g,a,live,'secondary',1000).available).toBeGreaterThan(0)
  })
  it('new equity increases cash and dilutes other shares without recording revenue', () => {
    const {g,a,b} = company('cafe'); b.share = .8; b.manager = {firstName:'A',lastName:'B',gender:'male',skill:95,salary:100000,since:2020,equity:.1}
    const cash = b.cash, personal = g.character.money, q = equityQuote(g,a,b,'subscribe',100000)
    expect(transactEquity(g,a.id,'subscribe',100000)).toBe(true)
    const live = readBiz(g,a)
    expect(live.cash).toBe(cash + 100000); expect(g.character.money).toBe(personal - 100000)
    expect(live.share).toBeCloseTo(q.share,5); expect(live.manager!.equity).toBeLessThan(.1)
    expect(live.yearIncome).toBe(0); expect(live.yearCosts).toBe(0)
    const state = JSON.stringify(g); transactEquity(g,a.id,'subscribe',100000); expect(readBiz(g,a).cash).toBe(cash+100000); expect(state).not.toBe('')
  })
  it('secondary purchases pay sellers, while corporate buybacks spend company cash', () => {
    for (const kind of ['secondary','buyback'] as const) {
      const {g,a,b} = company('cafe'); b.public = true; b.share = .7; b.sharesOut = 1000000
      const personal = g.character.money, cash = b.cash
      expect(transactEquity(g,a.id,kind,10000)).toBe(true)
      const live = readBiz(g,a)
      expect(live.cash).toBe(cash - (kind === 'buyback' ? 10000 : 0))
      expect(g.character.money).toBe(personal - (kind === 'secondary' ? 10000 : 0))
      expect(live.share).toBeGreaterThan(.7); expect(live.yearCosts).toBe(0)
    }
  })
  it('rejects invalid amounts and stale or missing business actions', () => {
    const {g,a} = company('cafe'), before = JSON.stringify(g)
    for (const amount of [-1,0,Infinity,NaN]) expect(transactEquity(g,a.id,'subscribe',amount)).toBe(false)
    expect(JSON.stringify(g)).toBe(before)
    g.assets = []; expect(transactEquity(g,a.id,'subscribe',100)).toBe(false)
  })
  it.each(['savings','investors'] as const)('starts with selected extra capital under %s funding', route => {
    const {g} = company('cafe'); g.assets = []; g.character.job = null
    startFounding(g,'cafe')
    let selected = 0, minimum = 0
    for (let step=0; g.queue.length && step<30; step++) {
      const m = g.queue.shift()!
      if (m.kind === 'input') {
        let input = m.defaultValue ?? 'Testing'
        if (m.scriptId === 'business.found.capital') { minimum = m.min!; selected = minimum + 1_000_000; input = String(selected) }
        runScript(g,m.scriptId,input,m.data,m)
      } else if (m.kind === 'choice' && m.source === 'script') {
        const id = m.scriptId === 'business.found.funding' ? route : m.choices.find(c => c.id === 'refuse')?.id ?? m.choices[0].id
        runScript(g,m.scriptId!,id,m.data,m)
      }
    }
    const a = g.assets.find(a => a.kind === 'business')!
    expect(a).toBeTruthy(); const b = readBiz(g,a)
    expect(b.cash).toBe(Math.round(selected - minimum * .8))
    expect(b.share).toBe(route === 'savings' ? 1 : b.share)
    if (route === 'investors') expect(b.share).toBeLessThan(1)
    expect(startupCost('cafe','us',b.city).capital).toBe(minimum)
  })
})

describe('capacity-limited group contracts', () => {
  function group() {
    const {g,a} = company('marketing')
    const q = createBusinessAsset(g,'Customer',newBiz(g,'restaurant','us','Chicago',{cash:5_000_000,founded:2020}),5_000_000); g.assets.push(q)
    for (const aa of [a,q]) {
      const b = bizOf(g,aa); b.valuation = valuationOf(b)
      b.last = {year:2026,revenue:1_000_000,netRevenue:1_000_000,cogs:200000,wages:100000,keyStaff:0,rent:30000,upkeep:10000,marketing:200000,pbt:460000,corpTax:100000,net:360000,otherIncome:0} as Statement
    }
    expect(formGroup(g,[a.id,q.id],'Test Group')).toBe(true)
    const id = groupsOf(g)[0].core.id
    return {g,a,q,id}
  }
  it('books internal invoices once and exposes their consolidation elimination', () => {
    const {g,a,q,id} = group()
    expect(toggleService(g,id,a.id,q.id)).toBe(true)
    const provider = readBiz(g,a).cash, buyer = readBiz(g,q).cash
    settleInternalServices(g,2026)
    expect(internalRevenue(g,id,2026)).toBeGreaterThan(0)
    expect(readBiz(g,a).cash).toBe(provider) // at-cost invoice and delivery cost offset
    expect(readBiz(g,q).cash).toBeGreaterThan(buyer)
    const after = JSON.stringify(g); settleInternalServices(g,2026); expect(JSON.stringify(g)).toBe(after)
  })
  it('reserves capacity once and cannot sign cross-group contracts', () => {
    const {g,a,q,id} = group(); expect(toggleService(g,id,a.id,q.id)).toBe(true)
    prepareInternalServices(g,2027)
    expect(readBiz(g,a).capacityLoss).toBeCloseTo(.2)
    prepareInternalServices(g,2027); expect(readBiz(g,a).capacityLoss).toBeCloseTo(.2)
    expect(toggleService(g,'missing',a.id,q.id)).toBe(false)
    expect(toggleService(g,id,q.id,a.id)).toBe(false)
    expect(toggleService(g,id,a.id,q.id)).toBe(true)
  })
})
