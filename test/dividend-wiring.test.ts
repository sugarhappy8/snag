// The yearly dividend at year end (auto-dividends task 3): the call in the company loop, the one popup
// and the life-log lines, the hired CEO that stops paying on top, and the cases that must stay quiet
// (no rule, a damaged rule, a division, a game from before the feature). Fixtures come from
// own-listing-kit; a year is run the way own-listing-story.test.ts runs one.
import { describe, expect, it } from 'vitest'
import '../src/game/business'
import { YEARLY_HOOKS } from '../src/game/aging'
import { smartManagerTurn } from '../src/game/business/board-ceo'
import { boardOf, boardView } from '../src/game/business/board-state'
import { payoutCash, reserveDollars } from '../src/game/business/board-vote'
import { becomeCeo, askingSalary, stepDown } from '../src/game/business/career'
import { dividendFloor, dividendLog, queueDividends, type DividendPaid, type DividendResult } from '../src/game/business/dividend-year'
import type { DividendPolicy } from '../src/game/business/dividend-policy'
import { bestPlan, refreshValue, valuationOf } from '../src/game/business/economy'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { bizOf, businessAssets, type BizState, type Manager } from '../src/game/business/state'
import { money, num, pct } from '../src/game/business/util'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import type { Industry } from '../src/game/data/markets'
import { formatPrice } from '../src/game/core'
import { yearlyFinance } from '../src/game/finance'
import { createNewLife } from '../src/game/life'
import { applyFallback } from '../src/game/offline'
import { runScript } from '../src/game/scripts'
import type { Asset, GameState, NoticeModal } from '../src/game/types'
import { getCountry } from '../src/game/world'
import { founder, listedGroup, privateCompany } from './own-listing-kit'

const CASH: DividendPolicy = { mode: 'cash', pct: 0.5, keep: 3 }
const PROFIT: DividendPolicy = { mode: 'profit', pct: 0.5, keep: 3 }

/** One year, as the age-up runs it: the year turns over and the company books the one before. */
function year(g: GameState): void {
  g.year += 1
  g.character.age += 1
  g.yearActions = {}
  g.queue = []
  yearlyBusinessImpl(g)
}

function lines(g: GameState): string[] {
  return g.log.flatMap((y) => y.entries.map((e) => e.text))
}

function dividendNotices(g: GameState): NoticeModal[] {
  return g.queue.filter((m): m is NoticeModal => m.kind === 'notice' && m.title === 'Dividends')
}

/** A private company that plans its year (a small profit) and holds `cash`, so the rule has room to pay. */
function funded(g: GameState, name = 'Quiet Co', cash = 500e6): { a: Asset; b: BizState } {
  const { a, b } = privateCompany(g, 'us', name)
  const plan = bestPlan(g, b)
  b.price = plan.price
  b.production = plan.production
  b.cash = cash
  b.debt = 0
  b.ownerSalary = 0
  b.valuation = valuationOf(b)
  refreshValue(a, b)
  return { a, b }
}

describe('the yearly dividend at year end', () => {
  it('pays a cash rule at year end, taxes it and says so', () => {
    const g = founder()
    const { a, b } = funded(g)
    b.dividend = { ...CASH }
    const money0 = g.character.money
    const taxable0 = num(g.flags.taxableIncome)
    year(g)
    const cur = bizOf(g, a)
    const last = cur.dividend?.last
    expect(last).toBeDefined()
    if (!last) return
    expect(last.year).toBe(g.year - 1)
    expect(last.mine).toBeGreaterThan(0)
    expect(g.character.money - money0).toBe(last.mine)
    expect(num(g.flags.taxableIncome) - taxable0).toBeGreaterThanOrEqual(last.mine)
    expect(cur.cash).toBeGreaterThanOrEqual(dividendFloor(g, a, cur, 3) - 1)
    // One life-log line for the company, one popup for the year.
    expect(lines(g).filter((t) => /paid me .* in dividends\./.test(t))).toHaveLength(1)
    const popups = dividendNotices(g)
    expect(popups).toHaveLength(1)
    expect(popups[0].id).toBe(`div-${g.generation}-${g.year}`)
    expect(popups[0].text).toContain(a.name)
    expect(popups[0].text).toContain('Income tax takes about')
    // The finance hook runs after the business hook in the same age-up, and taxes it.
    const taxes0 = num(g.flags.taxesPaid)
    yearlyFinance(g)
    expect(num(g.flags.taxesPaid)).toBeGreaterThan(taxes0)
  })

  it('a profit rule pays its share of the booked profit', () => {
    const g = founder()
    const { a, b } = funded(g)
    b.dividend = { ...PROFIT }
    year(g)
    const cur = bizOf(g, a)
    const net = cur.last?.net ?? 0
    expect(net).toBeGreaterThan(0)
    const last = cur.dividend?.last
    expect(last).toBeDefined()
    if (!last) return
    const floor = dividendFloor(g, a, cur, 3)
    // The cash and loans just before the payment: what is left now, plus what went out.
    const spare = Math.max(0, payoutCash(a, cur) + last.paid - floor)
    expect(last.paid).toBe(Math.min(Math.round(0.5 * Math.max(0, net)), spare))
    expect(last.paid).toBeGreaterThan(0)
  })

  it('two companies, one popup', () => {
    const g = founder()
    const one = funded(g, 'First Co')
    const two = funded(g, 'Second Co')
    one.b.dividend = { ...CASH }
    two.b.dividend = { ...CASH }
    year(g)
    expect(bizOf(g, one.a).dividend?.last?.year).toBe(g.year - 1)
    expect(bizOf(g, two.a).dividend?.last?.year).toBe(g.year - 1)
    const popups = dividendNotices(g)
    expect(popups).toHaveLength(1)
    expect(popups[0].text).toContain('First Co')
    expect(popups[0].text).toContain('Second Co')
    expect(lines(g).filter((t) => /paid me .* in dividends\./.test(t))).toHaveLength(2)
  })

  it('a losing year pays nothing and says why', () => {
    const g = founder()
    const { a, b } = funded(g)
    b.dividend = { ...PROFIT }
    b.price = 0.01
    const money0 = g.character.money
    year(g)
    const cur = bizOf(g, a)
    expect(cur.last?.net ?? 0).toBeLessThan(0)
    expect(dividendNotices(g)).toHaveLength(0)
    expect(g.character.money).toBe(money0)
    expect(lines(g).filter((t) => /paid no dividend\. It made no profit\./.test(t))).toHaveLength(1)
    expect(cur.dividend).toEqual(PROFIT)
    expect(cur.dividend?.last).toBeUndefined()
  })

  it('debt comes first', () => {
    const g = founder()
    const { a, b } = funded(g)
    b.dividend = { ...CASH }
    b.debt = b.cash + 1e6
    const money0 = g.character.money
    year(g)
    const cur = bizOf(g, a)
    expect(cur.dividend?.last).toBeUndefined()
    expect(g.character.money).toBe(money0)
    expect(dividendNotices(g)).toHaveLength(0)
    const said = lines(g).filter((t) => /paid no dividend\./.test(t))
    expect(said).toHaveLength(1)
    expect(said[0].endsWith('Its loans come first.')).toBe(true)
  })

  it('the floor stays', () => {
    const g = founder()
    // Two years of running costs is more than it holds.
    const { a, b } = funded(g, 'Quiet Co', 2_000_000)
    b.dividend = { mode: 'cash', pct: 1, keep: 24 }
    const money0 = g.character.money
    year(g)
    const cur = bizOf(g, a)
    expect(cur.cash).toBeGreaterThan(0)
    expect(cur.dividend?.last).toBeUndefined()
    expect(g.character.money).toBe(money0)
    const said = lines(g).filter((t) => /paid no dividend\./.test(t))
    expect(said).toHaveLength(1)
    expect(said[0].endsWith('Its cash is at the floor.')).toBe(true)
  })

  it('once a year', () => {
    const g = founder()
    const { a, b } = funded(g)
    b.dividend = { ...CASH }
    year(g)
    const first = bizOf(g, a).dividend?.last
    expect(first?.year).toBe(g.year - 1)
    const after = JSON.stringify(g)
    const money0 = g.character.money
    yearlyBusinessImpl(g)
    expect(JSON.stringify(g)).toBe(after)
    expect(g.character.money).toBe(money0)
    expect(bizOf(g, a).dividend?.last).toEqual(first)
    expect(dividendNotices(g)).toHaveLength(1)
  })

  it('a board never votes', () => {
    const g = founder()
    const { a, b } = funded(g)
    b.share = 0.6
    refreshValue(a, b)
    b.dividend = { ...CASH }
    const votes = boardOf(b).votes.length
    year(g)
    const cur = bizOf(g, a)
    expect(boardOf(cur).votes.length).toBe(votes)
    expect(cur.dividend?.last).toBeDefined()
    expect(cur.cash).toBeGreaterThanOrEqual(reserveDollars(cur, boardView(g, a, cur)) - 1)
    expect(dividendNotices(g)).toHaveLength(1)
  })

  it('a division is skipped', () => {
    const g = founder()
    const { members } = listedGroup(g, 'us', 0.7)
    for (const m of members) {
      const b = bizOf(g, m)
      b.cash = 500e6
      b.dividend = { ...CASH }
    }
    year(g)
    for (const m of members) expect(bizOf(g, m).dividend?.last).toBeUndefined()
    expect(dividendNotices(g)).toHaveLength(0)
    expect(lines(g).some((t) => /paid me .* in dividends|paid no dividend/.test(t))).toBe(false)
  })

  it('prison and a young heir still get paid', () => {
    {
      const g = founder()
      const { a, b } = funded(g)
      b.dividend = { ...CASH }
      g.character.prison = { name: 'State Pen', security: 'medium', crime: 'Theft', sentenceYears: 2, yearsServed: 0, respect: 20, appealed: false, escapeAttempts: 0 }
      const money0 = g.character.money
      year(g)
      const last = bizOf(g, a).dividend?.last
      expect(last).toBeDefined()
      expect(g.character.money - money0).toBe(last?.mine)
    }
    {
      const g = founder()
      const { a, b } = funded(g)
      b.dividend = { ...CASH }
      g.character.age = 16
      const money0 = g.character.money
      year(g)
      const last = bizOf(g, a).dividend?.last
      expect(last).toBeDefined()
      expect(g.character.money - money0).toBe(last?.mine)
    }
  })

  it('a hostile rule is no rule', () => {
    const g = founder()
    const { a, b } = funded(g)
    b.dividend = { mode: 'weird' } as never
    const money0 = g.character.money
    expect(() => year(g)).not.toThrow()
    expect(g.character.money).toBe(money0)
    expect(dividendNotices(g)).toHaveLength(0)
    expect(lines(g).some((t) => /paid me .* in dividends|paid no dividend/.test(t))).toBe(false)
    expect(bizOf(g, a).cash).toBeGreaterThan(0)
  })

  it('a game with no rule gains nothing', () => {
    const never = founder()
    funded(never)
    const removed = founder()
    const r = funded(removed)
    r.b.dividend = { ...CASH, last: { year: 2020, paid: 1, mine: 1, perShare: 0 } }
    delete r.b.dividend
    for (const g of [never, removed]) {
      year(g)
      expect(dividendNotices(g)).toHaveLength(0)
      expect(lines(g).some((t) => /dividend/i.test(t))).toBe(false)
      for (const asset of businessAssets(g)) expect('dividend' in bizOf(g, asset)).toBe(false)
    }
    expect(JSON.stringify(removed)).toBe(JSON.stringify(never))
  })

  it('taxes arrive in the same age-up', () => {
    const names = YEARLY_HOOKS.map(([n]) => n)
    expect(names.indexOf('business')).toBeGreaterThanOrEqual(0)
    expect(names.indexOf('business')).toBeLessThan(names.indexOf('finance'))
  })
})

describe('the dividend report', () => {
  const paid: DividendPaid = { assetId: 'a1', name: 'Acme', paid: 2_000_000, mine: 1_200_000, family: 200_000, rest: 600_000, tax: 400_000, share: 0.6, perShare: 0.02, price: 49.8 }

  it('logs one line per company', () => {
    const g = founder()
    dividendLog(g, { kind: 'paid', paid })
    dividendLog(g, { kind: 'skipped', name: 'Beta', why: 'Its loans come first.' })
    const entries = g.log.flatMap((y) => y.entries)
    expect(entries.map((e) => e.text)).toEqual([`Acme paid me ${money(1_200_000)} in dividends.`, 'Beta paid no dividend. Its loans come first.'])
    expect(entries.map((e) => e.tone)).toEqual(['good', 'neutral'])
  })

  it('writes one block per company, joined by a blank line', () => {
    const g = founder()
    g.queue = []
    const ids = g.nextId
    const list: DividendResult[] = [{ kind: 'paid', paid }, { kind: 'skipped', name: 'Beta', why: 'It made no profit.' }]
    queueDividends(g, list)
    expect(g.queue).toHaveLength(1)
    const m = g.queue[0]
    expect(m.kind).toBe('notice')
    if (m.kind !== 'notice') return
    expect(m).toMatchObject({ id: `div-${g.generation}-${g.year}`, title: 'Dividends', emoji: '\u{1F4E4}', tone: 'good' })
    const first = `Acme: ${money(2_000_000)} paid, ${formatPrice(0.02)} a share. Your ${pct(0.6)} is ${money(1_200_000)}. Income tax takes about ${money(400_000)}. Your relatives got ${money(200_000)}. Other shareholders got ${money(600_000)}.`
    expect(m.text).toBe(`${first}\n\nBeta: no dividend. It made no profit.`)
    // The popup takes no id from the counter.
    expect(g.nextId).toBe(ids)
  })

  it('leaves out what is zero, and says "You got" for a whole stake', () => {
    const g = founder()
    g.queue = []
    queueDividends(g, [{ kind: 'paid', paid: { ...paid, share: 1, perShare: 0, tax: 0, family: 0, rest: 0, mine: 2_000_000 } }])
    const m = g.queue[0]
    if (m?.kind !== 'notice') throw new Error('no popup')
    expect(m.text).toBe(`Acme: ${money(2_000_000)} paid. You got ${money(2_000_000)}.`)
    // Part of a dollar to others is not worth a sentence.
    g.queue = []
    queueDividends(g, [{ kind: 'paid', paid: { ...paid, family: 0, rest: 0.4, tax: 0, perShare: 0 } }])
    const n = g.queue[0]
    if (n?.kind !== 'notice') throw new Error('no popup')
    expect(n.text).not.toContain('Other shareholders')
    expect(n.text).not.toContain('relatives')
    expect(n.text).not.toContain('a share')
  })

  it('queues nothing unless a company paid', () => {
    const g = founder()
    g.queue = []
    queueDividends(g, [])
    queueDividends(g, [{ kind: 'skipped', name: 'Beta', why: 'It has no spare cash.' }])
    expect(g.queue).toHaveLength(0)
  })
})

// --- a hired CEO ------------------------------------------------------------------------------

/** Answer every popup with its first choice (inputs: their default). */
function drain(g: GameState): void {
  for (let guard = 0; g.queue.length && guard < 400; guard++) {
    const m = g.queue.shift()!
    const before = g.queue.length
    if (m.kind === 'choice') {
      const ch = m.choices[0]
      if (m.source === 'script') runScript(g, m.scriptId!, ch.id, m.data, m)
      else applyFallback(g, { type: 'resolveChoice', event: m, choiceId: ch.id })
    } else if (m.kind === 'input') runScript(g, m.scriptId, m.defaultValue || String(m.min ?? 1), m.data, m)
    else if (m.kind === 'minigame') runScript(g, m.scriptId, 'skip', m.data, m)
    else if (m.kind === 'aiTask') applyFallback(g, m.task)
    const added = g.queue.splice(before)
    g.queue.unshift(...added)
  }
}

function manager(b: BizState, skill: number, year0: number): Manager {
  return { firstName: 'Pat', lastName: 'Lee', gender: 'female', skill, salary: askingSalary(b, skill), since: year0, style: 'steady', integrity: 100 }
}

/** A six-site company that has just been handed to a hired CEO of this skill (as test/ceo.test.ts builds it). */
function managed(seed: number, skill: number, industry: Industry = 'restaurant', countryId = 'us', opts: { cash?: number; outlets?: number } = {}): { g: GameState; a: Asset } {
  const g = createNewLife({ seed, year: 1990, countryId })
  g.queue = []
  const c = g.character
  c.age = 36
  g.year = 2026
  c.money = 1_000_000
  c.talent = null
  c.talents = []
  const city = getCountry(countryId).cities[0]
  const b0 = newBiz(g, industry, countryId, city, { cash: opts.cash ?? 1_500_000, founded: 2020, outlets: [{ countryId, city, count: opts.outlets ?? 6, opened: 2020 }] })
  const a = createBusinessAsset(g, 'Test Co', b0, 100_000)
  g.assets.push(a)
  becomeCeo(g, a, b0)
  const b = bizOf(g, a)
  const p = bestPlan(g, b)
  b.price = p.price
  b.production = p.production
  stepDown(g, a, b, manager(b, skill, g.year))
  g.queue = []
  return { g, a }
}

/** Book `n` years of the company (the business loop only), answering every popup. */
function years(g: GameState, n: number): void {
  for (let y = 0; y < n; y++) {
    yearlyBusinessImpl(g)
    drain(g)
    g.year += 1
  }
}

describe('a hired CEO and the rule', () => {
  it('a hired CEO on a cash mandate does not pay on top', () => {
    const { g } = managed(4, 90, 'restaurant', 'us', { cash: 5_000_000 })
    years(g, 2)
    const a0 = businessAssets(g)[0]
    const b0 = bizOf(g, a0)
    boardOf(b0).mandate = 'cash'
    boardOf(b0).limits = { capex: 0.05, reserve: 2, pay: 1.25 }
    const base = JSON.stringify(g)
    const rule: DividendPolicy = { ...CASH }

    // Without a rule the CEO pays as before.
    const plain: GameState = JSON.parse(base)
    const pa = businessAssets(plain)[0]
    const plainMoney = plain.character.money
    smartManagerTurn(plain, pa, bizOf(plain, pa))
    expect(plain.character.money).toBeGreaterThan(plainMoney)

    // With a rule the CEO's own payout returns early and the player's money does not move.
    const ruled: GameState = JSON.parse(base)
    const ra = businessAssets(ruled)[0]
    bizOf(ruled, ra).dividend = { ...rule }
    const ruledMoney = ruled.character.money
    smartManagerTurn(ruled, ra, bizOf(ruled, ra))
    expect(ruled.character.money).toBe(ruledMoney)

    // A whole year: the rule pays once, and the CEO adds nothing (the owner draws no salary here).
    const full: GameState = JSON.parse(base)
    const fa = businessAssets(full)[0]
    bizOf(full, fa).dividend = { ...rule }
    const fullMoney = full.character.money
    yearlyBusinessImpl(full)
    const last = bizOf(full, fa).dividend?.last
    expect(last?.year).toBe(full.year - 1)
    expect(last?.mine).toBeGreaterThan(0)
    expect(full.character.money - fullMoney).toBe(last?.mine)
  })

  it('a damaged rule lets the CEO pay as before, and a rule that has paid keeps them quiet', () => {
    const { g } = managed(4, 90, 'restaurant', 'us', { cash: 5_000_000 })
    years(g, 2)
    const a0 = businessAssets(g)[0]
    const b0 = bizOf(g, a0)
    boardOf(b0).mandate = 'cash'
    boardOf(b0).limits = { capex: 0.05, reserve: 2, pay: 1.25 }
    const base = JSON.stringify(g)

    // A damaged rule reads as no rule, so the CEO's mandate pays.
    const hostile: GameState = JSON.parse(base)
    const ha = businessAssets(hostile)[0]
    bizOf(hostile, ha).dividend = { mode: 'weird' } as never
    const before = hostile.character.money
    smartManagerTurn(hostile, ha, bizOf(hostile, ha))
    expect(hostile.character.money).toBeGreaterThan(before)

    // A rule that has already paid for the year still keeps the CEO from paying a second time.
    const paid: GameState = JSON.parse(base)
    const pa = businessAssets(paid)[0]
    bizOf(paid, pa).dividend = { ...CASH, last: { year: paid.year - 1, paid: 1, mine: 1, perShare: 0 } }
    const had = paid.character.money
    smartManagerTurn(paid, pa, bizOf(paid, pa))
    expect(paid.character.money).toBe(had)
  })
})
