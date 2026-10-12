import { describe, expect, it } from 'vitest'
import { makeTestGame } from './helpers'
import { cancelDevelopment, commissionDevelopment, contractDevelopment, developmentMenu, developmentNodes, developmentOf, financeDevelopment, fundDevelopment, permitDevelopment, startDevelopment, yearlyDevelopment } from '../src/game/development'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { readBiz } from '../src/game/business/state'
import { signCommercialLease, yearlyLandlord, landlordView } from '../src/game/landlord'
import { charterOf, configureCharter, settleCharter } from '../src/game/shops/fleet-operations'
import type { Asset } from '../src/game/types'

function adult(seed = 8) { return makeTestGame(seed, { age: 35, money: 10000000 }) }
function build(kind: 'residential' | 'commercial') {
  const g = adult(), a = startDevelopment(g, kind)!, d = developmentOf(a)!
  expect(a.kind).toBe('other'); expect(commissionDevelopment(g, a.id)).toBe(false)
  expect(permitDevelopment(g, a.id)).toBe(true); expect(contractDevelopment(g, a.id, 'bonded')).toBe(true)
  expect(fundDevelopment(g, a.id, d.base * 2)).toBe(true)
  const opening = g.year
  for (let y = 0; y < 20 && developmentOf(a)?.stage !== 'commission'; y++) { g.year++; yearlyDevelopment(g) }
  expect(g.year - opening).toBeGreaterThanOrEqual(kind === 'residential' ? 2 : 4)
  const clone = JSON.parse(JSON.stringify(g)); expect(commissionDevelopment(g, a.id)).toBe(true); expect(commissionDevelopment(clone, a.id)).toBe(true)
  expect(g).toEqual(clone); expect(commissionDevelopment(g, a.id)).toBe(false)
  expect(a.kind).toBe('house'); expect(a.details.development).toBeUndefined(); return { g, a }
}
describe('development projects', () => {
  it.each(['residential', 'commercial'] as const)('builds a %s with costs and no premature income', kind => { build(kind) })
  it('pauses without cash, rejects malformed requests and is pure in menus', () => {
    const g = adult(), a = startDevelopment(g, 'residential')!
    permitDevelopment(g, a.id); contractDevelopment(g, a.id, 'economy'); g.year++; yearlyDevelopment(g)
    expect(developmentOf(a)?.progress).toBe(0)
    const before = JSON.stringify(g); developmentMenu.children(g); developmentNodes(g, a); expect(JSON.stringify(g)).toBe(before)
    expect(startDevelopment(g, 'residential', NaN)).toBeNull(); expect(fundDevelopment(g, a.id, Infinity)).toBe(false)
    g.character.money = 0; expect(fundDevelopment(g, a.id, 100)).toBe(false)
    a.details.development = { kind: 'broken' }; expect(developmentOf(a)).toBeNull()
  })
  it('adds productive company capacity exactly once and removes the site claim', () => {
    const g = adult(), b = newBiz(g, 'manufacturing', 'us', 'Chicago', { share: 1 }), company = createBusinessAsset(g, 'Works', b, 100000)
    g.assets.push(company)
    const a = startDevelopment(g, 'industrial', 2, company.id)!, d = developmentOf(a)!
    expect(a).toBeTruthy(); fundDevelopment(g, a.id, d.base * 2); permitDevelopment(g, a.id); contractDevelopment(g, a.id, 'bonded')
    expect(readBiz(g, company).lines ?? 0).toBe(0)
    for (let y = 0; y < 20 && developmentOf(a)?.stage !== 'commission'; y++) { g.year++; yearlyDevelopment(g) }
    expect(commissionDevelopment(g, a.id)).toBe(true); expect(readBiz(g, company).lines).toBe(2); expect(g.assets).not.toContain(a)
    expect(commissionDevelopment(g, a.id)).toBe(false)
  })
  it('finances through secured debt and repays it when the unfinished property is sold', () => {
    const g = adult(), a = startDevelopment(g, 'residential')!
    expect(financeDevelopment(g, a.id)).toBe(true); expect(a.mortgage?.balance).toBeGreaterThan(0)
    expect(financeDevelopment(g, a.id)).toBe(false)
    // The loan's reserve is unspent: it comes back in full; the site sells 15% below its value.
    const reserve = developmentOf(a)!.escrow
    const cash = g.character.money, proceeds = reserve + Math.round((a.value - reserve) * .85) - a.mortgage!.balance
    expect(cancelDevelopment(g, a.id)).toBe(true); expect(g.character.money).toBe(cash + proceeds)
  })
  it('returns unspent reserves in full on cancellation, as the funding notice promises', () => {
    const g = adult(), a = startDevelopment(g, 'residential')!, d = developmentOf(a)!
    expect(fundDevelopment(g, a.id, d.base)).toBe(true)
    expect(g.queue.some(m => m.kind === 'notice' && m.text.includes('Unspent funds are returned on commissioning or cancellation'))).toBe(true)
    const reserve = developmentOf(a)!.escrow, site = a.value - reserve, cash = g.character.money
    expect(reserve).toBe(d.base)
    expect(cancelDevelopment(g, a.id)).toBe(true)
    // Only the site and work in place take the 15% distressed discount.
    expect(g.character.money).toBe(cash + reserve + Math.round(site * .85))
  })
  it('leases completed commercial space through the existing landlord statement once', () => {
    const { g, a } = build('commercial')
    expect(signCommercialLease(g, a.id, 'workshop')).toBe(true)
    expect(signCommercialLease(g, a.id, 'office')).toBe(false)
    expect(landlordView(a).leaseUntil).toBe(g.year + 5)
    g.year++; yearlyLandlord(g); const balance = g.character.money
    expect(landlordView(a).lastGross).toBeGreaterThan(0); yearlyLandlord(g); expect(g.character.money).toBe(balance)
  })
})
describe('productive fleet', () => {
  function boat() { const g = adult(), a: Asset = { id: 'boat', kind: 'boat', name: 'Test launch', emoji: '⛵', purchasePrice: 100000, value: 100000, condition: 90, purchasedAge: 35, upkeep: 3000, details: {} }; g.assets.push(a); return { g, a } }
  it('uses licensed operations, finite capacity and one net income ledger', () => {
    const { g, a } = boat(); const cash = g.character.money
    expect(configureCharter(g, a.id, 'enabled', 1)).toBe(true); expect(g.character.money).toBe(cash - 250)
    expect(configureCharter(g, a.id, 'weeks', 21)).toBe(false)
    const start = g.character.money, clone = JSON.parse(JSON.stringify(g))
    settleCharter(g, a); settleCharter(clone, clone.assets[0]); expect(g).toEqual(clone)
    const p = charterOf(a); expect(p.booked).toBeLessThanOrEqual(10); expect(p.expenses).toBeGreaterThan(0)
    expect(g.character.money).toBe(start + p.net); expect(g.flags.taxableIncome).toBe(Math.max(0, p.net))
    const balance = g.character.money; settleCharter(g, a); expect(g.character.money).toBe(balance)
  })
  it('does not operate without cash or safe condition', () => {
    const { g, a } = boat(); a.condition = 30; expect(configureCharter(g, a.id, 'enabled', 1)).toBe(false)
    a.condition = 90; configureCharter(g, a.id, 'enabled', 1); g.character.money = 0; settleCharter(g, a)
    expect(g.character.money).toBe(0); expect(charterOf(a).booked).toBe(0)
  })
})
