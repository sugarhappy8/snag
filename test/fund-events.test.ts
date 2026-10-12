// Investment Firms 2.0: story events with choices, regulators, the Ponzi temptation.
import { describe, expect, it } from 'vitest'
import { simulateFundYear } from '../src/game/business/fund'
import { comeClean, eventIds, fundYearlyChecks, maybeFundEvent, presentFundEvent } from '../src/game/business/fund-events'
import { readFund, saveFund, type FundState, type FundType } from '../src/game/business/fund-state'
import { bizOf, findBusiness, readBiz } from '../src/game/business/state'
import { runScript } from '../src/game/scripts'
import type { ChoiceModal, GameState } from '../src/game/types'
import type { KeyStaff } from '../src/game/business/state'
import { ageBusinessYear, firm } from './fund-fixtures'
import { becomeCeo } from '../src/game/business/career'
import { anachronismsIn } from '../src/game/events/era'

function star(): KeyStaff {
  return { id: 'star1', firstName: 'Rita', lastName: 'Vance', gender: 'female', age: 41, role: 'Portfolio Manager', focus: 'finance', skill: 88, salary: 200_000, trait: 'loyal', morale: 80, years: 5 }
}

/** A firm set up so that every event's conditions hold. */
function stage(type: FundType) {
  const x = firm(type, { year: 2009, cash: 5_000_000 })
  const b = bizOf(x.g, x.a)
  b.staff = [star()]
  const f = readFund(b)
  f.aum = Math.max(f.aum, 200e6); f.hwm = f.aum; f.rep = .6; f.compliance = 40
  f.lastYear = 2008
  f.last = { ...f.last, market: -.35, ret: -.2, opLoss: 10_000 }
  if (type === 'vc') {
    const fund = f.funds[0]
    fund.dry -= 1e6; fund.invested += 1e6
    f.cos.push({ id: 'c1', name: 'Zapzone', emoji: '🌐', sector: 'Internet', fund: 1, q: 60, stage: 1, val: 10e6, own: .1, cost: 1e6, born: 2005, status: 'live', end: 0, got: 0, how: '', round: null, unicorn: false })
  }
  saveFund(b, f)
  x.g.queue = []
  return { ...x, b }
}

function lastChoice(g: GameState): ChoiceModal {
  const m = [...g.queue].reverse().find(q => q.kind === 'choice')
  if (!m || m.kind !== 'choice') throw new Error('no choice popup')
  return m
}

describe('fund events', () => {
  it('presents and resolves every event and every choice without minting money', () => {
    for (const type of ['asset', 'hedge', 'vc', 'broker'] as FundType[]) {
      for (const id of eventIds()) {
        const probe = stage(type)
        if (!presentFundEvent(probe.g, probe.a, id)) continue
        const choices = lastChoice(probe.g).choices.map(c => c.id)
        for (const pickId of choices) {
          const { g, a } = stage(type)
          expect(presentFundEvent(g, a, id)).toBe(true)
          const m = lastChoice(g)
          const personal = g.character.money
          const cash = readBiz(g, a).cash, booked = readBiz(g, a).yearCosts
          g.queue = g.queue.filter(q => q.id !== m.id)
          runScript(g, m.scriptId!, pickId, m.data, m)
          const live = findBusiness(g, a.id)
          if (!live) continue
          const after = readBiz(g, live)
          // Company cash only moves as a booked cost; nothing is ever paid in for free.
          expect(after.cash - cash + (after.yearCosts - booked)).toBe(0)
          expect(after.cash).toBeLessThanOrEqual(cash)
          expect(g.character.money).toBeLessThanOrEqual(personal)
          expect(Number.isFinite(readFund(after).aum)).toBe(true)
        }
      }
    }
  })

  it('writes era-correct popups (reports and every event) from 1925 on', () => {
    const cases: [FundType, number, string][] = [['asset', 1925, 'us'], ['broker', 1925, 'gb'], ['asset', 1955, 'ng'], ['hedge', 1955, 'us'], ['vc', 1950, 'in'], ['broker', 1975, 'br'], ['hedge', 1985, 'jp'], ['vc', 1980, 'us']]
    for (const [type, year, countryId] of cases) {
      const { g, a } = firm(type, { year, countryId, lifeId: `era-${type}-${year}` })
      g.character.job = null
      becomeCeo(g, a, bizOf(g, a)); g.queue = []
      bizOf(g, a).staff = [star()]
      ageBusinessYear(g)
      const live = findBusiness(g, a.id)!
      const f = readFund(bizOf(g, live)); f.last = { ...f.last, market: -.3, ret: -.2, opLoss: 1 }; f.aum = Math.max(f.aum, 1e8); f.compliance = 30; saveFund(bizOf(g, live), f)
      for (const id of eventIds()) presentFundEvent(g, live, id)
      const texts = g.queue.flatMap(m => m.kind === 'notice' ? [m.title, m.text] : m.kind === 'choice' ? [m.title, m.text, ...m.choices.flatMap(c => [c.label, c.hint ?? ''])] : [])
      expect(texts.length).toBeGreaterThan(3)
      for (const text of texts) expect(anachronismsIn(text, g.year, [countryId]), `${year} ${countryId}: ${text}`).toEqual([])
    }
  })

  it('fires at most one fund story a year for the owner', () => {
    const { g, a, b } = stage('asset')
    let fired = 0
    for (let i = 0; i < 20; i++) if (maybeFundEvent(g, a, b)) fired++
    expect(fired).toBeLessThanOrEqual(1)
    expect(readFund(b).eventYear).toBe(fired ? g.year : 0)
  })

  it('turns an insider trade into a regulator case that can end in court', () => {
    const { g, a } = stage('hedge')
    presentFundEvent(g, a, 'tip')
    const m = lastChoice(g)
    runScript(g, m.scriptId!, 'trade', m.data, m)
    let f = readFund(bizOf(g, a))
    expect(f.probe?.crime).toBe('Insider Trading')
    expect(f.bonus).toBeGreaterThan(0)
    // The next year, after the books: the regulator calls (odds forced to certain here).
    const b = bizOf(g, a)
    f.probe!.odds = 1; f.lastYear = g.year; saveFund(b, f)
    g.year++
    g.queue = []
    fundYearlyChecks(g, b, a)
    const call = lastChoice(g)
    expect(call.scriptId).toBe('fund.probe')
    runScript(g, call.scriptId!, 'cooperate', call.data, call)
    f = readFund(bizOf(g, a))
    expect(f.probe).toBeNull()
    expect(g.character.criminalRecord.some(r => /insider/i.test(r.crime))).toBe(true)
  })

  it('a Ponzi scheme fakes returns, grows a hole and ends in collapse and prison', () => {
    const { g, a } = stage('asset')
    presentFundEvent(g, a, 'ponzi')
    const m = lastChoice(g)
    runScript(g, m.scriptId!, 'fake', m.data, m)
    const b = bizOf(g, a)
    const start: FundState = readFund(b)
    expect(start.ponzi).not.toBeNull()
    b.ceo = 'owner'
    simulateFundYear(g, b, 2009, 0)
    const f = readFund(b)
    expect(f.last.ret).toBeGreaterThanOrEqual(.08)
    expect(f.ponzi!.hole).toBeGreaterThanOrEqual(start.ponzi!.hole)
    expect(f.ponzi!.fees).toBeGreaterThan(0)
    // Collapse: the firm is gone and the owner is charged.
    g.year = 2010; g.queue = []
    f.ponzi!.since = 2008; f.last.market = -.5; saveFund(b, f)
    for (let i = 0; i < 30 && !g.queue.some(q => q.kind === 'choice' && q.scriptId === 'fund.ponzi.end'); i++) { const x = readFund(b); x.checkYear = 0; saveFund(b, x); fundYearlyChecks(g, b, a) }
    const end = g.queue.find(q => q.kind === 'choice' && q.scriptId === 'fund.ponzi.end')
    expect(end).toBeTruthy()
    if (end?.kind !== 'choice') return
    g.character.money = 0
    runScript(g, end.scriptId!, 'face', end.data, end)
    expect(findBusiness(g, a.id)).toBeUndefined()
    expect(g.character.criminalRecord.some(r => /securities fraud/i.test(r.crime))).toBe(true)
  })

  it('lets a rich owner quietly plug the hole, at full personal cost', () => {
    const { g, a } = stage('hedge')
    const b = bizOf(g, a), f = readFund(b)
    f.ponzi = { since: 2007, hole: 2_000_000, fees: 500_000, by: g.character.id }; f.checkYear = 0; f.lastYear = g.year - 1; f.last.market = -.6
    saveFund(b, f)
    g.character.money = 3_000_000
    for (let i = 0; i < 30 && !g.queue.some(q => q.kind === 'choice' && q.scriptId === 'fund.ponzi.end'); i++) { const x = readFund(b); x.checkYear = 0; saveFund(b, x); fundYearlyChecks(g, b, a) }
    const end = g.queue.find(q => q.kind === 'choice' && q.scriptId === 'fund.ponzi.end')
    if (end?.kind !== 'choice') throw new Error('no collapse popup')
    runScript(g, end.scriptId!, 'cover', end.data, end)
    expect(g.character.money).toBe(1_000_000)
    expect(readFund(bizOf(g, a)).ponzi).toBeNull()
    expect(findBusiness(g, a.id)).toBeTruthy()
  })

  it('coming clean closes the firm and charges the owner', () => {
    const { g, a } = stage('asset')
    expect(comeClean(g, a.id)).toBe(false)
    const b = bizOf(g, a), f = readFund(b)
    f.ponzi = { since: 2007, hole: 1e6, fees: 0, by: g.character.id }
    saveFund(b, f)
    expect(comeClean(g, a.id)).toBe(true)
    expect(findBusiness(g, a.id)).toBeUndefined()
    expect(g.character.criminalRecord.length).toBeGreaterThan(0)
  })

  it('an heir loses an inherited scheme’s firm but is not charged for a parent’s crimes', () => {
    const { g, a } = stage('hedge')
    const b = bizOf(g, a), f = readFund(b)
    f.probe = { year: 2005, crime: 'Insider Trading', odds: 1, by: 'late-parent' }
    f.ponzi = { since: 2005, hole: 5e6, fees: 1e6, by: 'late-parent' }
    f.checkYear = 0; f.lastYear = g.year - 1; f.last.market = -.6
    saveFund(b, f)
    for (let i = 0; i < 30 && !g.queue.some(q => q.kind === 'choice' && q.scriptId === 'fund.ponzi.end'); i++) { const x = readFund(b); x.checkYear = 0; saveFund(b, x); fundYearlyChecks(g, b, a) }
    expect(readFund(b).probe).toBeNull()
    expect(g.queue.some(q => q.kind === 'choice' && q.scriptId === 'fund.probe')).toBe(false)
    const end = g.queue.find(q => q.kind === 'choice' && q.scriptId === 'fund.ponzi.end')
    if (end?.kind !== 'choice') throw new Error('no collapse popup')
    const money = g.character.money = 100_000
    runScript(g, end.scriptId!, 'face', end.data, end)
    expect(findBusiness(g, a.id)).toBeUndefined()
    expect(g.character.criminalRecord).toHaveLength(0)
    expect(g.character.money).toBe(money)
  })

  it('pays a rogue trader’s losses from company cash, or hides them as a crime', () => {
    const cover = stage('hedge')
    presentFundEvent(cover.g, cover.a, 'rogue')
    let m = lastChoice(cover.g)
    const loss = Number((m.data as Record<string, number>).loss)
    const cash = cover.b.cash
    runScript(cover.g, m.scriptId!, 'cover', m.data, m)
    expect(bizOf(cover.g, cover.a).cash).toBe(cash - loss)
    const hide = stage('hedge')
    const aum = readFund(hide.b).aum
    presentFundEvent(hide.g, hide.a, 'rogue')
    m = lastChoice(hide.g)
    runScript(hide.g, m.scriptId!, 'hide', m.data, m)
    const f = readFund(bizOf(hide.g, hide.a))
    expect(f.aum).toBe(aum - Number((m.data as Record<string, number>).loss))
    expect(f.probe?.crime).toBe('Securities Fraud')
    expect(bizOf(hide.g, hide.a).cash).toBe(hide.b.cash)
  })

  it('a pension mandate adds client money, never company cash', () => {
    let won = 0
    for (let i = 0; i < 12; i++) {
      const { g, a, b } = stage('asset')
      g.rng = 1000 + i
      presentFundEvent(g, a, 'pension')
      const m = lastChoice(g)
      const aum = readFund(b).aum, cash = b.cash
      runScript(g, m.scriptId!, 'cheap', m.data, m)
      const after = bizOf(g, a), f = readFund(after)
      expect(after.cash).toBe(cash)
      if (f.aum > aum) { won++; expect(f.aum - aum).toBe(Number((m.data as Record<string, number>).mandate)) }
    }
    expect(won).toBeGreaterThan(0)
  })
})
