import { describe, expect, it } from 'vitest'
import { makeTestGame } from './helpers'
import { assetsMenu } from '../src/game/assets'
import { relocateAfterLosingHome } from '../src/game/finance'
import { ownsHome } from '../src/game/events/helpers'
import { releaseFromPrison, sendToPrison } from '../src/game/prison'
import { hireRentalManager, landlordView, listRental, rentalMarket, setRentalRent, signCommercialLease, yearlyLandlord } from '../src/game/landlord'
import { createPerson } from '../src/game/people'
import { sharedProjects, sharedProjectsMenu, workSharedProject } from '../src/game/activities/shared-projects'
import { establishGivingFund } from '../src/game/activities/giving-fund'
import { commissionDevelopment, developmentOf, startDevelopment } from '../src/game/development'
import { startMusicMaster } from '../src/game/special/music-rights'
import { setInstrumentSkill } from '../src/game/special/common'
import { eraIdentity, exchangeInfo, pennyDef } from '../src/game/invest/engine'
import { eraPennyKind } from '../src/game/invest/era'
import { techAdoption } from '../src/game/history/timeline'
import { runScript } from '../src/game/scripts'
import type { Asset, GameState, Json } from '../src/game/types'

function premises() {
  const g = makeTestGame(17, { age: 35, money: 1000000 })
  g.character.residence = { status: 'homeless' }; g.people = []
  const a: Asset = { id: 'premises', name: 'Commercial building', kind: 'house', emoji: '🏢', value: 300000, purchasePrice: 300000, purchasedAge: 35, condition: 95, upkeep: 4000, details: { commercial: true, countryId: 'us', sqft: 1800 } }
  g.assets.push(a); return { g, a }
}
const insufficient = (g: GameState) => g.queue.some(m => m.kind === 'notice' && m.title === 'Insufficient Funds')

describe('gameplay integration regressions', () => {
  it('keeps commercial renewals on five-year rather than residential terms', () => {
    const { g, a } = premises()
    expect(signCommercialLease(g, a.id, 'office')).toBe(true)
    g.year += 5; setRentalRent(g, a.id, rentalMarket(a))
    expect(landlordView(a).leaseUntil).toBe(g.year + 5)
  })
  it('requires a paid fit-out even when a manager advertises an empty commercial shell', () => {
    const { g, a } = premises()
    hireRentalManager(g, a.id, 90); listRental(g, a.id)
    expect(landlordView(a).listed).toBe(false)
    const p = landlordView(a); p.listed = true; a.details.landlord = p as unknown as Json
    for (let i = 0; i < 5; i++) { g.year++; yearlyLandlord(g) }
    expect(a.rentedOutFor).toBeUndefined(); expect(landlordView(a).lastGross).toBe(0)
  })
  it('does not offer household activities or accept stale residential applicants for commercial space', () => {
    const { g, a } = premises(), menu = assetsMenu.children(g).find(n => n.id === `asset-${a.id}`)
    expect(menu?.type).toBe('menu')
    if (menu?.type !== 'menu') throw new Error('Missing property menu')
    const ids = menu.children(g).map(n => n.id)
    expect(ids.some(id => /^(movein|party|rentout|amenities|exorcise)-/.test(id))).toBe(false)
    runScript(g, 'assets.rentLevel', 'market', { assetId: a.id, market: 1000 }, { kind: 'choice', id: 'stale-level', title: 'Rent', text: '', source: 'script', scriptId: 'assets.rentLevel', choices: [{ id: 'market', label: 'Market' }] })
    runScript(g, 'assets.rentApplicant', 'app0', { assetId: a.id, monthly: 1000, applicants: [{ name: 'Household', risk: .1, trait: 'quiet', score: 700 }] }, { kind: 'choice', id: 'stale-applicant', title: 'Tenant', text: '', source: 'script', scriptId: 'assets.rentApplicant', choices: [{ id: 'app0', label: 'Household' }] })
    expect(a.rentedOutFor).toBeUndefined(); expect(g.queue).toEqual([])
  })
  it('never moves the player into commercial space after losing a home or leaving prison', () => {
    const { g } = premises()
    expect(ownsHome(g)).toBe(false)
    relocateAfterLosingHome(g); expect(g.character.residence.status).toBe('homeless')
    sendToPrison(g, 'Test offence', 1, { quiet: true }); releaseFromPrison(g, 'served')
    expect(g.character.residence.status).toBe('homeless')
  })
  it('explains an unaffordable shared session without charging either participant', () => {
    const g = makeTestGame(23, { age: 35, money: 0 })
    const p = createPerson(g, { relation: 'parent', age: 60, livesWithPlayer: true }); p.relationship = 90; p.money = 0
    g.flags.sharedProjects = [{ id: 'project', kind: 'familyHistory', person: p.id, year: g.year, progress: 0, effort: false, lastYear: g.year, spent: 0, completed: false, note: '' }]
    expect(workSharedProject(g, 'project')).toBe(false)
    expect(insufficient(g)).toBe(true); expect(g.character.money).toBe(0); expect(p.money).toBe(0)
    expect(sharedProjects(g)[0].effort).toBe(false); expect(sharedProjects(g)[0].spent).toBe(0)
    const menu = sharedProjectsMenu.children(g).find(n => n.id === 'shared.project')
    if (menu?.type !== 'menu') throw new Error('Missing shared project')
    const action = menu.children(g).find(n => n.id === 'shared.work.project')
    expect(action?.type === 'action' && action.disabledReason?.(g)).toMatch(/available cash/)
  })
  it('shows insufficient-funds notices for new funded projects and does not consume their annual slots', () => {
    for (const action of [
      (g: GameState) => establishGivingFund(g, 10000),
      (g: GameState) => startDevelopment(g, 'residential'),
      (g: GameState) => startMusicMaster(g, 'No funds'),
    ]) {
      const g = makeTestGame(25, { age: 35, money: 0 }); setInstrumentSkill(g, 'Voice', 80)
      expect(action(g)).toBeFalsy(); expect(insufficient(g)).toBe(true)
      expect(g.character.money).toBe(0); expect(g.assets).toEqual([]); expect(g.yearActions['music.master.start']).toBeUndefined()
    }
  })
  it('can pay commissioning entirely from reserved cash even if the personal balance is negative', () => {
    const g = makeTestGame(29, { age: 35, money: 1000000 }), a = startDevelopment(g, 'residential')!, d = developmentOf(a)!
    d.stage = 'commission'; d.progress = 100; d.escrow = Math.round(d.base * .01)
    a.details.development = d as unknown as Json; g.character.money = -100
    expect(commissionDevelopment(g, a.id)).toBe(true); expect(g.character.money).toBe(-100)
  })
  it('keeps fictional internet penny-stock names behind their local technology gate', () => {
    expect(techAdoption('eg', 'internet', 1996)).toBeLessThan(.02)
    const def = pennyDef(exchangeInfo('eg'), 1, 0)
    expect(eraIdentity(def, 1996).name).not.toMatch(/internet|online|dot-com/i)
    expect(eraIdentity(def, 2007).name).toMatch(/internet/i)
    expect(eraPennyKind(1996, 2, 'eg')?.as).toBe('telecom')
    expect(eraPennyKind(1996, 2, 'us')?.noun).toBe('Internet Telephony')
  })
})
