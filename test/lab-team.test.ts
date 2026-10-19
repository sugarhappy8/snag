// The research team (R&D 3.0 task 4): a cap by tier, a fixed pay, a little more R&D odds and slots,
// a three-year minimum before anyone can be let go, payroll booked once and shown on the annual report.
// Fixed seeds; restaurant is low tier (cap 2), brewery mid (4), software high (6).
import { describe, expect, it, vi } from 'vitest'
import * as board from '../src/game/business/board'
import { RD_CREDIT } from '../src/game/business/deeptech-data'
import { bizWorth, ceoSkill, localEcon, staffPower } from '../src/game/business/economy'
import { heavyEligible } from '../src/game/business/heavy-rd'
import { INDUSTRIES } from '../src/game/business/industries'
import { TEAM_CAP, TEAM_FEE_X, TEAM_MIN_YEARS, TEAM_ODDS, TEAM_PAY_X, TEAM_STEP } from '../src/game/business/lab-data'
import { labMenus } from '../src/game/business/lab-menu'
import { opsOffers, opsValue, teamBlock, teamCap, teamFee, teamPay, teamValue } from '../src/game/business/lab-rules'
import { draftLab, readLab, saveLab, teamPower, teamSlots } from '../src/game/business/lab-state'
import { bookLabYear, doHire, doRelease, labCredit, labSpendIn } from '../src/game/business/lab-year'
import { productIdeas } from '../src/game/business/products'
import { bestRdIdea, launchP, rdProjects, rdQuote, rdRange, rdReserve, rdSlots, roundBudget, startRd } from '../src/game/business/rd'
import { maxKeyStaff } from '../src/game/business/staff'
import { readBiz, type BizState } from '../src/game/business/state'
import { clampN, money } from '../src/game/business/util'
import { statementLines } from '../src/game/business/yearly'
import type { Industry } from '../src/game/data/markets'
import type { Asset, GameState, MenuAction, MenuGroup, MenuNode } from '../src/game/types'
import { getCountry } from '../src/game/world'
import { deepFreeze, labGame, noDraw, patchLab } from './lab-kit'
import { allNodes, nextYear } from './market-kit'

const COUNTRIES = [...Object.keys(RD_CREDIT), 'zz']
const TRADES = Object.keys(INDUSTRIES) as Industry[]

/** The money and the stored lab, as text: equal before and after means a refusal changed nothing. */
function snap(g: GameState, a: Asset): string {
  const b = readBiz(g, a)
  return JSON.stringify([b.cash, b.yearCosts, b.yearIncome, b.lab ?? null, b.rd, g.rng])
}

function textOf(g: GameState, n: MenuNode): string {
  if (n.type === 'info') return typeof n.text === 'function' ? n.text(g) : n.text
  if (n.type === 'heading') return n.label
  return [n.label, typeof n.subtitle === 'function' ? n.subtitle(g) : (n.subtitle ?? ''), n.hint?.(g) ?? '', n.disabledReason?.(g) ?? ''].join('\n')
}

/** The dollars a statement line shows (an unsigned number), 0 when the line is not there. */
function shown(lines: { label: string; value: string }[], label: string): number {
  const found = lines.find((l) => l.label === label)
  return found ? Number(found.value.replace(/[^0-9.]/g, '')) : 0
}

/** The Research & Operations screen's rows, read fresh. */
function rows(g: GameState, a: Asset): MenuNode[] {
  return (labMenus(a, readBiz(g, a))[0] as MenuGroup).children(g)
}

function row(g: GameState, a: Asset, key: string): MenuAction {
  return rows(g, a).find((n): n is MenuAction => n.type === 'action' && n.id === `biz.mkt.${key}.${a.id}`)!
}

describe('the cap, the pay and the odds', () => {
  it('the cap follows the tier and a breakthrough company is never offered a team', () => {
    expect(TEAM_CAP).toEqual({ low: 2, mid: 4, high: 6 })
    for (const [industry, cap] of [['restaurant', 2], ['brewery', 4], ['software', 6]] as const) {
      const { g, a, b } = labGame(41, industry)
      expect(teamCap(b), industry).toBe(cap)
      for (let i = 0; i < cap; i++) {
        expect(teamBlock(g, b, 'hire'), `${industry} hire ${i}`).toBeNull()
        expect(doHire(g, a), `${industry} hire ${i}`).toBe(true)
      }
      expect(readLab(b).team, industry).toHaveLength(cap)
      const full = teamBlock(g, b, 'hire')
      expect(full, industry).toMatch(new RegExp(`${cap}`))
      const before = snap(g, a)
      expect(doHire(g, a), industry).toBe(false)
      expect(snap(g, a), industry).toBe(before)
    }
    for (const industry of ['aiLab', 'bank', 'gameStudio'] as const) {
      const { g, a, b } = labGame(41, industry)
      expect(teamCap(b), industry).toBe(0)
      const why = teamBlock(g, b, 'hire')
      expect(why, industry).toMatch(/product companies/)
      expect(teamBlock(g, b, 'release'), industry).toMatch(/product companies/)
      const before = snap(g, a)
      expect(doHire(g, a), industry).toBe(false)
      expect(doRelease(g, a), industry).toBe(false)
      expect(snap(g, a), industry).toBe(before)
    }
  })

  it('pay is fixed per trade, positive and independent of cash and sales [RF4]', () => {
    const { b } = labGame(42, 'restaurant')
    let checked = 0
    for (const industry of TRADES) {
      for (const country of COUNTRIES) {
        b.industry = industry
        b.countryId = country
        b.city = getCountry(country).cities[0]
        if (!heavyEligible(b)) {
          expect(teamCap(b), `${industry} ${country}`).toBe(0)
          continue
        }
        const pay = teamPay(b)
        expect(pay, `${industry} ${country}`).toBe(roundBudget(TEAM_PAY_X * localEcon(industry, country, b.city).wage))
        expect(Number.isFinite(pay) && pay > 0, `${industry} ${country} pay`).toBe(true)
        const fee = teamFee(b)
        expect(Number.isFinite(fee) && fee > 0 && fee <= pay, `${industry} ${country} fee`).toBe(true)
        expect(fee).toBe(Math.round(TEAM_FEE_X * pay))
        const cash = b.cash
        const valuation = b.valuation
        b.cash *= 1000
        b.valuation *= 1000
        if (b.last) b.last.revenue *= 1000
        b.outlets[0].count = 1000
        expect(teamPay(b), `${industry} ${country} pay at 1000x`).toBe(pay)
        expect(teamFee(b)).toBe(fee)
        b.cash = cash
        b.valuation = valuation
        if (b.last) b.last.revenue /= 1000
        b.outlets[0].count = 1
        checked++
      }
    }
    expect(checked).toBeGreaterThan(30 * 40)
  }, 60_000)

  it('hiring costs half a year of pay and releasing the same, in cash and yearCosts', () => {
    const { g, a, b } = labGame(43, 'brewery')
    const pay = teamPay(b)
    const fee = teamFee(b)
    expect(fee).toBe(Math.round(pay / 2))
    const cash = b.cash
    const costs = b.yearCosts
    const income = b.yearIncome
    expect(noDraw(g, () => doHire(g, a))).toBe(true)
    expect(b.cash).toBe(cash - fee)
    expect(b.yearCosts).toBe(costs + fee)
    expect(b.yearIncome).toBe(income)
    expect(readLab(b).team).toEqual([g.year])
    expect(g.log.at(-1)!.entries.at(-1)!.text).toBe(`${a.name} hired a research scientist.`)
    // the work hasn't been paid for yet: the year's pay is booked at the year end, not at the hire
    expect(b.cash).toBe(cash - fee)
    g.year += TEAM_MIN_YEARS
    expect(noDraw(g, () => doRelease(g, a))).toBe(true)
    expect(b.cash).toBe(cash - 2 * fee)
    expect(b.yearCosts).toBe(costs + 2 * fee)
    expect(b.yearIncome).toBe(income)
    expect(readLab(b).team).toEqual([])
    expect(g.log.at(-1)!.entries.at(-1)!.text).toBe(`${a.name} let a research scientist go.`)
  })

  it('odds and slots rise a little', () => {
    const { g, b } = labGame(44, 'restaurant')
    b.quality = 10
    const base = launchP(g, b)
    const slots = rdSlots(b)
    // low enough that the clamp is out of the way, so the team's whole lift shows
    expect(base).toBeGreaterThan(0.1)
    expect(base + TEAM_ODDS * teamPower(6)).toBeLessThan(0.9)
    for (const n of [1, 2, 3, 6]) {
      patchLab(b, (d) => {
        d.team = Array.from({ length: n }, () => g.year)
      })
      expect(launchP(g, b), `${n} scientists`).toBeCloseTo(Math.min(0.9, base + TEAM_ODDS * teamPower(n)), 10)
      expect(rdSlots(b), `${n} scientists`).toBe(slots + Math.min(2, Math.floor(n / 2)))
      expect(teamSlots(n)).toBe(Math.min(2, Math.floor(n / 2)))
    }
    expect(teamPower(6)).toBeCloseTo(2.9412, 3)
    expect([0, 1, 2, 3, 4, 5, 6].map((n) => Math.round(teamPower(n) * 100) / 100)).toEqual([0, 1, 1.7, 2.19, 2.53, 2.77, 2.94])
    expect(TEAM_STEP).toBe(0.7)
    // the odds never pass the old ceiling, however good the company already is
    b.quality = 100
    expect(launchP(g, b)).toBeLessThanOrEqual(0.9)
  })

  it('a company with no lab, and one with a damaged lab, keeps the old odds and slots [RF1]', () => {
    const { g, b } = labGame(45, 'brewery')
    const sites = b.outlets.reduce((s, o) => s + o.count, 0)
    expect('lab' in b).toBe(false)
    // v3.0.0's formula, term by term
    expect(launchP(g, b)).toBe(clampN(0.25 + ceoSkill(g, b) / 250 + b.quality / 300 + 0.1 * staffPower(b, 'quality'), 0.1, 0.9))
    expect(rdSlots(b)).toBe(1 + Math.floor(Math.log2(1 + sites)))
    const plain = launchP(g, b)
    for (const junk of [7, 'x', [], null, { team: 'x' }, { team: [Number.NaN, 'a', -5] }] as unknown[]) {
      const hurt = { ...b, lab: junk } as unknown as BizState
      expect(launchP(g, hurt)).toBe(plain)
      expect(rdSlots(hurt)).toBe(1 + Math.floor(Math.log2(1 + sites)))
    }
    // a thousand scientists read as the six the team can hold
    const huge = { ...b, lab: { v: 1, team: Array.from({ length: 1000 }, () => g.year) } } as unknown as BizState
    expect(readLab(huge).team).toHaveLength(6)
    expect(launchP(g, huge)).toBeLessThanOrEqual(Math.min(0.9, plain + TEAM_ODDS * teamPower(6)) + 1e-12)
    expect(rdSlots(huge)).toBe(1 + Math.floor(Math.log2(1 + sites)) + 2)
    // no lab was made by reading
    expect('lab' in b).toBe(false)
  })
})

describe('hiring and letting go', () => {
  it('release before 3 years of service is refused and the longest-serving scientist goes after it [RF3]', () => {
    const { g, a, b } = labGame(46, 'brewery')
    expect(teamBlock(g, b, 'release')).toMatch(/no scientist/i)
    const nobody = snap(g, a)
    expect(doRelease(g, a)).toBe(false)
    expect(snap(g, a)).toBe(nobody)
    const first = g.year - 1
    patchLab(b, (d) => {
      d.team = [g.year, first]
    })
    expect(readLab(b).team).toEqual([first, g.year])
    // the longest-serving one is the one that counts: 1 year in
    expect(teamBlock(g, b, 'release')).toMatch(new RegExp(String(first + TEAM_MIN_YEARS)))
    const before = snap(g, a)
    expect(doRelease(g, a)).toBe(false)
    expect(snap(g, a)).toBe(before)
    // cash comes before the service rule
    const need = teamFee(b) + rdReserve(b)
    b.cash = need - 1
    expect(teamBlock(g, b, 'release')).toMatch(/short/)
    b.cash = need
    expect(teamBlock(g, b, 'release')).toMatch(new RegExp(String(first + TEAM_MIN_YEARS)))
    // three years after the first hire, it can go, and the oldest hire is the one that leaves
    g.year = first + TEAM_MIN_YEARS
    b.cash = need
    expect(teamBlock(g, b, 'release')).toBeNull()
    b.cash = need - 1
    expect(doRelease(g, a)).toBe(false)
    b.cash = need
    expect(doRelease(g, a)).toBe(true)
    expect(readLab(b).team).toEqual([first + TEAM_MIN_YEARS - 2])
    // a hire year from the future is damage, not a wait
    patchLab(b, (d) => {
      d.team = [g.year + 50]
    })
    b.cash = need
    expect(teamBlock(g, b, 'release')).toBeNull()
  })

  it('a started project keeps its odds', () => {
    const { g, a, b } = labGame(47, 'brewery')
    b.quality = 10
    const idea = productIdeas(g, b, 1)[0]
    const budget = rdRange(b, idea).normal
    const fee = teamFee(b)
    const cash = b.cash
    const none = rdQuote(g, b, idea, budget).odds
    expect(doHire(g, a)).toBe(true)
    expect(doHire(g, a)).toBe(true)
    expect(rdQuote(g, b, idea, budget).odds).toBeGreaterThan(none)
    const project = startRd(g, a, b, idea, budget)!
    const stored = project.odds
    expect(stored).toBe(Math.round(rdQuote(g, b, idea, budget).odds * 1000) / 1000)
    expect(stored).toBeGreaterThan(none)
    // let both go after the minimum: the running project keeps the odds it started with and the fees were charged twice
    g.year += TEAM_MIN_YEARS
    expect(doRelease(g, a)).toBe(true)
    expect(doRelease(g, a)).toBe(true)
    expect(rdProjects(b)[0].odds).toBe(stored)
    expect(b.cash).toBe(cash - 4 * fee - budget)
  })

  it('a scientist is not key staff', () => {
    const { g, a, b } = labGame(48, 'brewery')
    const staff = JSON.stringify(b.staff)
    const keys = maxKeyStaff(b)
    const power = staffPower(b, 'quality')
    expect(doHire(g, a)).toBe(true)
    expect(doHire(g, a)).toBe(true)
    expect(JSON.stringify(b.staff)).toBe(staff)
    expect(maxKeyStaff(b)).toBe(keys)
    expect(staffPower(b, 'quality')).toBe(power)
  })

  it('doHire and doRelease refuse without the right to [RF3]', () => {
    const { g, a, b } = labGame(49, 'restaurant', { country: 'ca' })
    const before = snap(g, a)
    const refused = (what: string) => {
      expect(doHire(g, a), what).toBe(false)
      expect(snap(g, a), what).toBe(before)
    }
    g.character.prison = { name: 'State Pen', security: 'medium', crime: 'Burglary', sentenceYears: 4, yearsServed: 1, respect: 50, appealed: false, escapeAttempts: 0 }
    refused('prison')
    g.character.prison = null
    g.character.age = 17
    refused('age 17')
    g.character.age = 31
    a.details.share = 0
    refused('no stake')
    delete a.details.share
    expect(doHire(g, { ...a, id: 'not-mine' })).toBe(false)
    expect(snap(g, a)).toBe(before)
    // cash short by one dollar: nothing charged, nothing drawn; then exactly enough
    const need = teamFee(b) + teamPay(b) + rdReserve(b)
    b.cash = need - 1
    const short = snap(g, a)
    expect(teamBlock(g, b, 'hire')).toMatch(/short/)
    expect(doHire(g, a)).toBe(false)
    expect(snap(g, a)).toBe(short)
    b.cash = need
    expect(doHire(g, a)).toBe(true)
    // a company the player no longer owns
    const kept = snap(g, a)
    g.assets = g.assets.filter((x) => x !== a)
    expect(doHire(g, a)).toBe(false)
    expect(doRelease(g, a)).toBe(false)
    expect(snap(g, a)).toBe(kept)
  })

  it('doHire and doRelease ask the board [RF3]', () => {
    const { g, a, b } = labGame(50, 'brewery', { country: 'ca' })
    const fee = teamFee(b)
    const pay = teamPay(b)
    const worth = teamValue(g, b)
    const spy = vi.spyOn(board, 'boardAllows').mockReturnValue(false)
    try {
      const before = snap(g, a)
      expect(doHire(g, a)).toBe(false)
      expect(snap(g, a)).toBe(before)
      expect(spy).toHaveBeenCalledTimes(1)
      const [, asked, askedBiz, proposal] = spy.mock.calls[0]
      expect(asked.id).toBe(a.id)
      expect(askedBiz).toBeTruthy()
      expect(proposal).toMatchObject({ kind: 'capex', by: 'owner', amount: fee + pay, label: 'Hire a research scientist' })
      expect(proposal.gain).toBeCloseTo(Math.max(0, worth.gain / 5), 6)
      spy.mockReturnValue(true)
      expect(doHire(g, a)).toBe(true)
      expect(readLab(b).team).toEqual([g.year])
      // a release spends the fee and gains nothing
      g.year += TEAM_MIN_YEARS
      spy.mockClear()
      spy.mockReturnValue(false)
      const held = snap(g, a)
      expect(doRelease(g, a)).toBe(false)
      expect(snap(g, a)).toBe(held)
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0][3]).toMatchObject({ kind: 'capex', by: 'owner', amount: fee, gain: 0 })
      spy.mockReturnValue(true)
      expect(doRelease(g, a)).toBe(true)
      expect(readLab(b).team).toEqual([])
    } finally {
      spy.mockRestore()
    }
  })
})

describe('payroll', () => {
  it('is booked once and shown, and is no credit spend', () => {
    const { g, a, b } = labGame(51, 'restaurant', { country: 'ca' })
    expect(doHire(g, a)).toBe(true)
    expect(doHire(g, a)).toBe(true)
    const pay = teamPay(b)
    const fiscal = g.year
    expect(labSpendIn(b, fiscal)).toBe(0)
    expect(labCredit(b.countryId, labSpendIn(b, fiscal))).toBe(0)
    g.year += 1
    const cash = b.cash
    const costs = b.yearCosts
    const income = b.yearIncome
    const rng = g.rng
    bookLabYear(g, a, b, fiscal)
    expect(b.cash).toBe(cash - 2 * pay)
    expect(b.yearCosts).toBe(costs + 2 * pay)
    expect(b.yearIncome).toBe(income)
    const lab = readLab(b)
    expect(lab.ledger).toEqual([{ year: fiscal, credit: 0, grant: 0, royalty: 0, payroll: 2 * pay }])
    expect(lab.booked).toBe(fiscal)
    // replayed: nothing moves and nothing is drawn [RF2]
    const json = JSON.stringify(b)
    bookLabYear(g, a, b, fiscal)
    expect(JSON.stringify(b)).toBe(json)
    expect(b.cash).toBe(cash - 2 * pay)
    expect(g.rng).toBe(rng)
    // the next year is paid again, and a team of none pays nothing and makes no row
    g.year += 1
    bookLabYear(g, a, b, fiscal + 1)
    expect(b.cash).toBe(cash - 4 * pay)
    expect(readLab(b).ledger.map((r) => r.payroll)).toEqual([2 * pay, 2 * pay])
  })

  it('shows on the annual report through the real year end', () => {
    const { g, a, b } = labGame(52, 'restaurant', { country: 'ca' })
    expect(doHire(g, a)).toBe(true)
    const pay = teamPay(b)
    const fiscal = g.year
    nextYear(g)
    const s = b.last!
    expect(s.year).toBe(fiscal)
    const row = readLab(b).ledger.find((r) => r.year === fiscal)!
    expect(row.payroll).toBe(pay)
    const lines = statementLines(b, s)
    // a cost line prints with a minus sign: the dollars are what counts
    expect(shown(lines, 'Research team')).toBe(pay)
    // the lab's pay leaves "One-off costs": together the two lines are every dollar of other costs
    expect(shown(lines, 'One-off costs') + shown(lines, 'Research team')).toBe(s.other)
  })
})

describe('what a scientist is worth', () => {
  it('teamValue and the row come from the same numbers, and draw nothing', () => {
    const { g, a, b } = labGame(53, 'brewery', { outlets: 12 })
    const w = bizWorth(g, b)
    const room = Math.max(0, b.cash - rdReserve(b))
    const ideas = productIdeas(g, b, 4)
    const bests = (x: BizState) => ({ ordinary: bestRdIdea(g, x, ideas, room, w)?.value ?? 0, ops: Math.max(0, ...opsOffers(g, x).map((p) => opsValue(g, x, p.id, w))) })
    const now = bests(b)
    const more = { ...b } as BizState
    patchLab(more, (d) => {
      d.team.push(g.year)
    })
    const next = bests(more)
    const value = teamValue(g, b, w)
    expect(value.pay).toBe(teamPay(b))
    expect(value.gain).toBeCloseTo(next.ordinary - now.ordinary + (next.ops - now.ops), 6)
    expect(value.value).toBeCloseTo(value.gain - value.pay, 6)
    expect(Number.isFinite(value.gain)).toBe(true)
    // it reads, never writes: no draw and no change, and the same answer again
    const json = JSON.stringify(b)
    expect(noDraw(g, () => teamValue(g, b))).toBe(true)
    expect(JSON.stringify(b)).toBe(json)
    expect(teamValue(g, b).gain).toBeCloseTo(value.gain, 6)
    // the team's own row shows the odds and slots the next numbers come from
    const info = rows(g, a).find((n) => n.id === `biz.labTeam.${a.id}`)!
    expect(textOf(g, info)).toBe(`0 of 4 scientists at ${money(teamPay(b))} a year each. Odds +0 points and 0 more slots.`)
  })
})

describe('the team on the Research & Operations screen', () => {
  it('shows the real numbers, and greys out what cannot run with the reason the rule gives', () => {
    const { g, a, b } = labGame(54, 'brewery', { country: 'ca' })
    const children = rows(g, a)
    const at = children.findIndex((n) => n.type === 'heading' && n.label === 'Research team')
    expect(at).toBeGreaterThan(0)
    expect(children[at + 1].id).toBe(`biz.labTeam.${a.id}`)
    const hire = row(g, a, 'lab.hire')
    const release = row(g, a, 'lab.release')
    expect(hire.label).toBe('Hire a Scientist')
    expect(release.label).toBe('Let a Scientist Go')
    expect(hire.disabledReason?.(g)).toBeNull()
    expect(release.disabledReason?.(g)).toBe(teamBlock(g, b, 'release'))
    expect(release.disabledReason?.(g)).toBeTruthy()
    // the confirm says what it costs now, what it costs a year and how long it holds
    const confirm = hire.confirm?.(g) ?? ''
    expect(confirm).toContain(money(teamFee(b)))
    expect(confirm).toContain(money(teamPay(b)))
    expect(confirm).toContain(`${TEAM_MIN_YEARS} years`)
    const sub = typeof hire.subtitle === 'function' ? hire.subtitle(g) : (hire.subtitle ?? '')
    expect(sub).toContain(money(teamFee(b)))
    expect(sub).toContain(money(teamPay(b)))
    // a tap hires through the same checks, and the row reads the new team
    hire.run(g)
    expect(readLab(b).team).toEqual([g.year])
    const info = (): string => textOf(g, rows(g, a).find((n) => n.id === `biz.labTeam.${a.id}`)!)
    expect(info()).toBe(`1 of 4 scientists at ${money(teamPay(b))} a year each. Odds +3 points and 0 more slots.`)
    row(g, a, 'lab.hire').run(g)
    expect(info()).toBe(`2 of 4 scientists at ${money(teamPay(b))} a year each. Odds +5 points and 1 more slot.`)
    // the release row says the fee and, until the minimum is served, why not
    expect(row(g, a, 'lab.release').confirm?.(g)).toContain(money(teamFee(b)))
    expect(row(g, a, 'lab.release').disabledReason?.(g)).toMatch(new RegExp(String(g.year + TEAM_MIN_YEARS)))
    // a full team: the hire row says so, and a restored menu that taps it anyway changes nothing
    for (let i = 0; i < 2; i++) row(g, a, 'lab.hire').run(g)
    expect(readLab(b).team).toHaveLength(4)
    const full = row(g, a, 'lab.hire')
    expect(full.disabledReason?.(g)).toBe(teamBlock(g, b, 'hire'))
    const json = JSON.stringify(b)
    const rng = g.rng
    full.run(g)
    expect(JSON.stringify(b)).toBe(json)
    expect(g.rng).toBe(rng)
    // three years later the oldest can go, and the row does it
    g.year += TEAM_MIN_YEARS
    expect(row(g, a, 'lab.release').disabledReason?.(g)).toBeNull()
    row(g, a, 'lab.release').run(g)
    expect(readLab(b).team).toHaveLength(3)
  })

  it('is pure: rendering a deep-frozen state with a team changes nothing and draws nothing', () => {
    const { g, a, b } = labGame(55, 'software', { country: 'gb' })
    for (let i = 0; i < 3; i++) expect(doHire(g, a)).toBe(true)
    const rng = g.rng
    const json = JSON.stringify(g)
    const render = (state: GameState, asset: Asset) =>
      allNodes(state, labMenus(asset, readBiz(state, asset)))
        .map((n) => textOf(state, n))
        .join('\n')
    const text = render(g, a)
    expect(text).toContain('3 of 6 scientists')
    expect(g.rng).toBe(rng)
    expect(JSON.stringify(g)).toBe(json)
    const frozen = deepFreeze(structuredClone(g))
    const fa = frozen.assets.find((x) => x.id === a.id)!
    expect(render(frozen, fa)).toBe(text)
    expect(frozen.rng).toBe(rng)
    expect(JSON.stringify(frozen)).toBe(json)
    expect(readLab(b).team).toHaveLength(3)
  })

  it('a team round-trips through the lab state', () => {
    const { g, b } = labGame(56, 'software')
    const d = draftLab(b)
    d.team = [g.year, g.year - 1, g.year - 4]
    saveLab(b, d)
    expect(readLab(b).team).toEqual([g.year - 4, g.year - 1, g.year])
  })
})
