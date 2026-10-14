// The advisor's findings (advisors/review.ts): six facts read from the state, none a forecast. They are
// pure (no writes, no g.rng), sorted by weight, and the advisor's skill decides how many are shown.
import { describe, expect, it } from 'vitest'
import { findings, shownCount, shownFindings, type Finding } from '../src/game/advisors/review'
import { payoutCash, runningCosts } from '../src/game/business/board-vote'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { readBiz } from '../src/game/business/state'
import { coinTargets, listedTargets, stockTargets } from '../src/game/computer/money-stocks'
import { formatMoney, netWorth } from '../src/game/core'
import { economyOf } from '../src/game/economy'
import { typicalIncome } from '../src/game/events/wealth-core'
import { buySecurity, investmentHoldings, investmentListing, liveDepositRate } from '../src/game/investments'
import type { Asset, GameState, Loan, LoanKind } from '../src/game/types'
import { getCountry } from '../src/game/world'
import { client, coinHolding, madeUpStock, officeJob, own, warp } from './advisors-kit'
import { deepFreeze } from './fuzz-kit'

type Id = Finding['id']

const ids = (list: Finding[]): Id[] => list.map((f) => f.id)
const find = (g: GameState, id: Id, managed = false): Finding | undefined => findings(g, managed).find((f) => f.id === id)

/** A mayor with a lot of cash and no holdings. */
function mayor(seed = 11, money = 20_000_000): GameState {
  const g = client(seed, { money })
  officeJob(g, 'mayor')
  return g
}

/** A made-up company that the exchange lists in every one of `years` (the clock is put back afterwards). */
function stableStock(g: GameState, years: number[], skip = 0): { secId: string; name: string } {
  const now = g.year
  let common = null as Set<string> | null
  for (const y of years) {
    warp(g, y)
    const here = new Set(stockTargets(g).map((t) => t.secId))
    common = common ? new Set([...common].filter((s) => here.has(s))) : here
  }
  warp(g, now)
  const t = stockTargets(g).filter((x) => common!.has(x.secId))[skip]
  if (!t) throw new Error('no made-up company is listed in every one of those years')
  return { secId: t.secId, name: t.name }
}

/** Buy in `year`, then put the clock back where it was. */
function boughtIn(g: GameState, year: number, secId: string, dollars: number): void {
  const now = g.year
  warp(g, year)
  expect(buySecurity(g, secId, dollars)).toBe(true)
  warp(g, now)
}

function held(g: GameState, secId: string): Asset {
  const a = investmentHoldings(g).find((x) => x.details.secId === secId)
  if (!a) throw new Error(`not holding ${secId}`)
  return a
}

function loan(g: GameState, kind: LoanKind, rate: number, balance: number): Loan {
  const l: Loan = { id: `loan-${g.character.loans.length}`, kind, lender: 'First Bank', balance, yearlyPayment: Math.round(balance / 10), rate }
  g.character.loans.push(l)
  return l
}

interface CompanyOpts { name?: string; cash?: number; share?: number; value?: number; group?: boolean }

/** A restaurant the player owns `share` of, holding `cash`, with a marked value of `value`. */
function company(g: GameState, o: CompanyOpts = {}): Asset {
  const city = getCountry(g.character.countryId).cities[0]
  const b = newBiz(g, 'restaurant', g.character.countryId, city, { cash: o.cash ?? 0, share: o.share ?? 1 })
  const a = createBusinessAsset(g, o.name ?? 'Corner Kitchen', b, 100_000)
  if (o.group) a.details.group = { id: 'grp-1' }
  a.value = o.value ?? 0
  g.assets.push(a)
  return a
}

/** Cash that leaves `extra` past 18 months of costs once a payout is taken. */
function richCash(g: GameState, a: Asset, extra: number): number {
  return Math.ceil(1.5 * runningCosts(readBiz(g, a))) + extra
}

function house(g: GameState, value: number): void {
  g.assets.push({ id: `h-${g.assets.length}`, kind: 'house', name: 'House', emoji: '', purchasePrice: value, value, condition: 100, purchasedAge: 30, upkeep: 0, details: {} })
}

/** Set the bank balance so that `a` is `share` of net worth. */
function shareOfNetWorth(g: GameState, a: Asset, share: number): void {
  g.character.money = Math.round(a.value / share - a.value)
}

describe('insider: the made-up pick of an office holder', () => {
  it('flags a fresh made-up stock for a mayor, with the company and the title', () => {
    const g = mayor()
    const s = madeUpStock(g)
    own(g, 'stock', 300_000)
    const f = find(g, 'insider')
    expect(f).toBeDefined()
    expect(f!.weight).toBe(95)
    expect(f!.text).toContain(s.name)
    expect(f!.text).toContain('Mayor')
    expect(f!.text).toContain('insider timing')
  })

  it('counts a purchase from this year or last year and nothing older', () => {
    for (const [back, flagged] of [[0, true], [1, true], [2, false], [6, false]] as const) {
      const g = mayor()
      const now = g.year
      const s = stableStock(g, [now - back, now])
      boughtIn(g, now - back, s.secId, 300_000)
      expect(ids(findings(g, false)).includes('insider'), `${back} years back`).toBe(flagged)
    }
  })

  it('does not flag a real company, an index fund, a holding with no office or a school office', () => {
    const g = mayor()
    const real = listedTargets(g).find((t) => t.real)!
    expect(buySecurity(g, real.secId, 300_000)).toBe(true)
    own(g, 'index', 300_000)
    expect(ids(findings(g, false))).not.toContain('insider')

    // Positive control: the same game with a made-up pick does flag.
    own(g, 'stock', 300_000)
    expect(ids(findings(g, false))).toContain('insider')

    const none = structuredClone(g)
    none.character.job = null
    expect(ids(findings(none, false))).not.toContain('insider')

    const school = structuredClone(g)
    school.character.job!.data!.office = 'school'
    expect(ids(findings(school, false))).not.toContain('insider')
  })

  it('does not flag a penny stock', () => {
    const g = mayor()
    const row = investmentListing(g).find((r) => r.type === 'penny')
    if (!row) throw new Error('no penny stock is listed')
    expect(stockTargets(g).some((t) => t.secId === row.secId)).toBe(false)
    expect(buySecurity(g, row.secId, 50_000)).toBe(true)
    expect(held(g, row.secId).details.type).toBe('penny')
    expect(ids(findings(g, false))).not.toContain('insider')
  })

  it('needs rank 2 for coins: a mayor is clear, a governor is flagged', () => {
    const m = mayor()
    const coin = coinHolding(m, 5_000)
    expect(coinTargets(m).some((t) => t.secId === coin.details.secId)).toBe(true)
    expect(ids(findings(m, false))).not.toContain('insider')

    const gov = client(11, { money: 20_000_000 })
    officeJob(gov, 'governor')
    const c2 = coinHolding(gov, 5_000)
    const f = find(gov, 'insider')
    expect(f).toBeDefined()
    expect(f!.text).toContain('Governor')
    expect(f!.text).toContain(String(c2.name))
  })

  it('has no coin to hold before coins exist', () => {
    const g = client(11, { year: 1995, money: 20_000_000 })
    officeJob(g, 'governor')
    expect(() => coinHolding(g, 5_000)).toThrow()
    expect(ids(findings(g, false))).not.toContain('insider')
  })

  it('names one pick, two picks and many picks, largest first', () => {
    const g = mayor()
    const [a, b, c] = [0, 1, 2].map((i) => stableStock(g, [g.year], i))
    boughtIn(g, g.year, a.secId, 200_000)
    expect(find(g, 'insider')!.text).toMatch(/move .*, and you bought it in the last two years/)
    boughtIn(g, g.year, b.secId, 900_000)
    const two = find(g, 'insider')!.text
    expect(two).toContain(`${b.name} and ${a.name}`)
    expect(two).toContain('you bought them in the last two years')
    boughtIn(g, g.year, c.secId, 500_000)
    const three = find(g, 'insider')!.text
    expect(three).toContain(`move ${b.name} and 2 others,`)
    expect(three).not.toContain(a.name)
  })

  it('ignores a holding whose company is no longer listed', () => {
    const g = mayor()
    const s = madeUpStock(g)
    own(g, 'stock', 300_000)
    expect(ids(findings(g, false))).toContain('insider')
    held(g, s.secId).details.secId = 'NYSE:Nowhere#s99g99'
    expect(ids(findings(g, false))).not.toContain('insider')
  })
})

describe('loan', () => {
  it('flags a loan 3 points over savings while cash covers it', () => {
    const g = client(11, { money: 5_000_000 })
    const sr = liveDepositRate(g, 'us', 'savings')
    loan(g, 'personal', sr + 0.06, 200_000)
    const f = find(g, 'loan')
    expect(f).toBeDefined()
    expect(f!.weight).toBe(70)
    expect(f!.text).toContain('personal loan')
    expect(f!.text).toContain(formatMoney(200_000))
    expect(f!.text).toContain(formatMoney(g.character.money))
  })

  it('is absent when the loan is cheap, the cash is short, or the balance is small', () => {
    const sr = liveDepositRate(client(11), 'us', 'savings')
    const cheap = client(11)
    loan(cheap, 'personal', sr + 0.02, 200_000)
    expect(ids(findings(cheap, false))).not.toContain('loan')

    const short = client(11, { money: 150_000 })
    loan(short, 'personal', sr + 0.06, 200_000)
    expect(ids(findings(short, false))).not.toContain('loan')

    const small = client(11)
    loan(small, 'personal', sr + 0.06, 2 * typicalIncome(small) - 1)
    expect(ids(findings(small, false))).not.toContain('loan')

    const edge = client(11)
    loan(edge, 'personal', sr + 0.06, 2 * typicalIncome(edge))
    expect(ids(findings(edge, false))).toContain('loan')
  })

  it('names the loan with the highest rate', () => {
    const g = client(11)
    const sr = liveDepositRate(g, 'us', 'savings')
    loan(g, 'student', sr + 0.05, 300_000)
    loan(g, 'car', sr + 0.09, 150_000)
    loan(g, 'business', sr + 0.07, 400_000)
    const f = find(g, 'loan')!
    expect(f.text).toContain('car loan')
    expect(f.text).toContain(formatMoney(150_000))
  })

  it('skips a loan whose numbers are junk', () => {
    const g = client(11)
    const sr = liveDepositRate(g, 'us', 'savings')
    const bad = loan(g, 'car', sr + 0.2, Number.NaN)
    bad.rate = Number.NaN
    loan(g, 'personal', Number.POSITIVE_INFINITY, 300_000)
    loan(g, 'student', sr + 0.05, 300_000)
    const f = find(g, 'loan')!
    expect(f.text).toContain('student loan')
  })
})

describe('concentration', () => {
  it('flags a holding at half of net worth with weight 80, and not one at 39%', () => {
    const g = client(11)
    const a = own(g, 'stock', 2_000_000)
    shareOfNetWorth(g, a, 0.5)
    const f = find(g, 'concentration')
    expect(f).toBeDefined()
    expect(f!.weight).toBe(80)
    expect(f!.text).toBe(`${a.name} is 50% of your net worth.`)

    shareOfNetWorth(g, a, 0.39)
    expect(ids(findings(g, false))).not.toContain('concentration')
    shareOfNetWorth(g, a, 0.41)
    expect(find(g, 'concentration')!.weight).toBe(Math.round(60 + 40 * (a.value / netWorth(g))))
  })

  it('needs the holding to be worth 5 years of typical income', () => {
    const g = client(11)
    const small = own(g, 'stock', 5 * typicalIncome(g) - 20_000)
    g.character.money = Math.round(small.value)
    expect(small.value).toBeLessThan(5 * typicalIncome(g))
    expect(ids(findings(g, false))).not.toContain('concentration')
  })

  it('does not count a house, an index fund, savings or a bond', () => {
    const g = client(11, { money: 100_000 })
    house(g, 10_000_000)
    expect(ids(findings(g, false))).not.toContain('concentration')
    const h = client(11, { money: 100_000_000 })
    own(h, 'index', 40_000_000)
    own(h, 'bond', 20_000_000)
    own(h, 'savings', 10_000_000)
    expect(netWorth(h)).toBeGreaterThan(0)
    expect(ids(findings(h, false))).not.toContain('concentration')
  })

  it('counts a company the player owns, by its own id', () => {
    const g = client(11, { money: 1_000_000 })
    company(g, { name: 'Corner Kitchen', value: 1_000_000 })
    const f = find(g, 'concentration')!
    expect(f.text).toBe('Corner Kitchen is 50% of your net worth.')
    expect(f.weight).toBe(80)
    // A second, smaller company does not add to the first.
    company(g, { name: 'Side Hustle', value: 100_000 })
    expect(find(g, 'concentration')!.text).toContain('Corner Kitchen')
  })

  it('adds up two lines of one security and groups them under one name', () => {
    const g = client(11)
    const a = own(g, 'stock', 1_000_000)
    const twin = structuredClone(a)
    twin.id = 'twin-line'
    g.assets.push(twin)
    // Each line alone is 30% of net worth; together they are 60%.
    g.character.money = Math.round((2 * a.value) / 0.6 - 2 * a.value)
    const f = find(g, 'concentration')!
    expect(f).toBeDefined()
    expect(f.text).toBe(`${a.name} is 60% of your net worth.`)
    expect(f.weight).toBe(84)
  })

  it('never shows a share above 100% when debt makes the holding bigger than net worth', () => {
    const g = client(11)
    const a = own(g, 'stock', 2_000_000)
    g.character.money = 0
    loan(g, 'personal', 0.05, Math.round(a.value) - 100_000)
    expect(a.value / netWorth(g)).toBeGreaterThan(5)
    const f = find(g, 'concentration')!
    expect(f.text).toBe(`${a.name} is 100% of your net worth.`)
    expect(f.weight).toBe(100)
  })

  it('stays quiet when net worth is not positive', () => {
    const g = client(11)
    const a = own(g, 'stock', 2_000_000)
    g.character.money = 0
    loan(g, 'personal', 0.05, Math.round(a.value) + 500_000)
    expect(netWorth(g)).toBeLessThan(0)
    expect(ids(findings(g, false))).not.toContain('concentration')
  })
})

describe('company-cash', () => {
  it('flags a company holding far more than 18 months of costs, with the player stake', () => {
    const g = client(11)
    const a = company(g, { name: 'Corner Kitchen', share: 0.6, cash: 0 })
    a.details.cash = richCash(g, a, 1_000_000)
    const b = readBiz(g, a)
    const idle = payoutCash(a, b) - Math.round(1.5 * runningCosts(b))
    expect(idle).toBeGreaterThanOrEqual(2 * typicalIncome(g))
    const f = find(g, 'company-cash')
    expect(f).toBeDefined()
    expect(f!.weight).toBe(50)
    expect(f!.text).toBe(
      `Corner Kitchen holds ${formatMoney(idle)} past 18 months of costs. Your 60% is ${formatMoney(idle * 0.6)} before tax. Pay a Dividend is under Money.`,
    )
  })

  it('points a sole owner at the row that exists for them', () => {
    const g = client(11)
    const a = company(g, { share: 1 })
    a.details.cash = richCash(g, a, 1_000_000)
    expect(find(g, 'company-cash')!.text).toContain('Withdraw Profits is under Money.')
    expect(find(g, 'company-cash')!.text).not.toContain('Pay a Dividend')
  })

  it('skips a group member, a stake under 5% and a company with little spare cash', () => {
    const g = client(11)
    const member = company(g, { name: 'Group Co', share: 0.6, group: true })
    member.details.cash = richCash(g, member, 5_000_000)
    expect(ids(findings(g, false))).not.toContain('company-cash')

    const small = company(g, { name: 'Tiny Stake', share: 0.04 })
    small.details.cash = richCash(g, small, 5_000_000)
    expect(ids(findings(g, false))).not.toContain('company-cash')

    const lean = company(g, { name: 'Lean Co', share: 0.6 })
    lean.details.cash = richCash(g, lean, 2 * typicalIncome(g) - 5_000)
    expect(ids(findings(g, false))).not.toContain('company-cash')
    lean.details.cash = richCash(g, lean, 2 * typicalIncome(g) + 5_000)
    expect(find(g, 'company-cash')!.text).toContain('Lean Co')
  })

  it('names the company with the most idle cash', () => {
    const g = client(11)
    const a = company(g, { name: 'First Co', share: 0.6 })
    const b = company(g, { name: 'Second Co', share: 0.6 })
    const c = company(g, { name: 'Third Co', share: 0.6 })
    a.details.cash = richCash(g, a, 1_000_000)
    b.details.cash = richCash(g, b, 3_000_000)
    c.details.cash = richCash(g, c, 2_000_000)
    expect(find(g, 'company-cash')!.text).toContain('Second Co')
  })
})

describe('idle-cash', () => {
  it('flags cash at 10 years of income and a tenth of net worth, and says what it earns', () => {
    const g = client(11, { money: 10 * typicalIncome(client(11)) })
    const f = find(g, 'idle-cash')
    expect(f).toBeDefined()
    expect(f!.weight).toBe(40)
    expect(f!.text).toContain(formatMoney(g.character.money))
    expect(f!.text).toMatch(/^\$[\d,]+ sits in your bank account\. Savings pay [\d.]+% and prices rise [\d.]+% a year\.$/)
  })

  it('is hidden while a manager is hired and below the floor', () => {
    const g = client(11, { money: 5_000_000 })
    expect(ids(findings(g, false))).toContain('idle-cash')
    expect(ids(findings(g, true))).not.toContain('idle-cash')

    const poor = client(11, { money: 10 * typicalIncome(client(11)) - 1 })
    expect(ids(findings(poor, false))).not.toContain('idle-cash')
  })

  it('needs cash to be a tenth of net worth', () => {
    const g = client(11, { money: 50_000_000 })
    own(g, 'index', 40_000_000)
    expect(g.character.money / netWorth(g)).toBeGreaterThan(0.1)
    expect(ids(findings(g, false))).toContain('idle-cash')
    g.character.money = 4_000_000
    expect(g.character.money).toBeGreaterThan(10 * typicalIncome(g))
    expect(g.character.money / netWorth(g)).toBeLessThan(0.1)
    expect(ids(findings(g, false))).not.toContain('idle-cash')
  })

  it('says prices fall in a year of falling prices', () => {
    let year = 0
    for (let y = 1921; y <= 1939 && !year; y++) if (economyOf(client(11, { year: y })).inflation < 0) year = y
    expect(year).toBeGreaterThan(0)
    const g = client(11, { year, money: 5_000_000 })
    const text = find(g, 'idle-cash')!.text
    expect(text).toMatch(/prices fall [\d.]+% a year\.$/)
    expect(text).not.toContain('-')
  })
})

describe('losses', () => {
  it('flags a carried loss of a year of income and more', () => {
    const g = client(11)
    const T = typicalIncome(g)
    g.flags.investLossCarry = T
    const f = find(g, 'losses')
    expect(f).toBeDefined()
    expect(f!.weight).toBe(30)
    expect(f!.text).toBe(`You carry ${formatMoney(T)} of investment losses. Gains up to that size owe no tax.`)
    g.flags.investLossCarry = T - 1
    expect(ids(findings(g, false))).not.toContain('losses')
  })

  it('reads junk as no loss', () => {
    for (const junk of ['x', null, Number.NaN, -5, [], { a: 1 }]) {
      const g = client(11)
      g.flags.investLossCarry = junk as never
      expect(ids(findings(g, false))).not.toContain('losses')
    }
  })
})

/** Every finding at once: a mayor with a fresh pick that is half of a 10M net worth, a loan, an idle company, cash and losses. */
function everything(): GameState {
  const g = mayor(11, 12_000_000)
  const pick = own(g, 'stock', 5_000_000)
  loan(g, 'personal', liveDepositRate(g, 'us', 'savings') + 0.07, 1_000_000)
  const co = company(g, { name: 'Corner Kitchen', share: 0.6 })
  co.details.cash = richCash(g, co, 1_000_000)
  g.flags.investLossCarry = typicalIncome(g)
  expect(pick.value / netWorth(g)).toBeGreaterThan(0.4)
  return g
}

describe('order and coverage', () => {
  it('sorts by weight, then id, and the pinned weights are the ones the tests use', () => {
    const g = everything()
    const list = findings(g, false)
    expect(ids(list)).toEqual(['insider', 'concentration', 'loan', 'company-cash', 'idle-cash', 'losses'])
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1], b = list[i]
      expect(a.weight > b.weight || (a.weight === b.weight && a.id < b.id)).toBe(true)
    }
    expect(list.map((f) => f.weight).filter((_, i) => i !== 1)).toEqual([95, 70, 50, 40, 30])
  })

  it('breaks a weight tie on the id', () => {
    // A fresh pick at 87.5% of net worth is a concentration of weight 95, the same as the insider finding.
    const g = mayor(11, 4_000_000)
    const a = own(g, 'stock', 3_000_000)
    shareOfNetWorth(g, a, 0.875)
    const list = findings(g, true)
    expect(list.map((f) => [f.id, f.weight])).toEqual([['concentration', 95], ['insider', 95]])
  })

  it('shows 2 findings at skill 20 and 30, 3 at 40, 4 at 60, 5 at 80 and 99', () => {
    for (const [skill, n] of [[20, 2], [30, 2], [39, 2], [40, 3], [59, 3], [60, 4], [79, 4], [80, 5], [99, 5]] as const) expect(shownCount(skill), `skill ${skill}`).toBe(n)
  })

  it('reads a junk skill as an average one and clamps the rest', () => {
    expect(shownCount(Number.NaN)).toBe(3)
    expect(shownCount(Number.POSITIVE_INFINITY)).toBe(3)
    expect(shownCount(-50)).toBe(2)
    expect(shownCount(500)).toBe(5)
  })

  it('reports the full count and shows the top n', () => {
    const g = everything()
    const all = findings(g, false)
    expect(all).toHaveLength(6)
    for (const [skill, n] of [[20, 2], [40, 3], [60, 4], [80, 5], [99, 5]] as const) {
      const r = shownFindings(g, skill, false)
      expect(r.total).toBe(6)
      expect(r.shown).toHaveLength(Math.min(6, n))
      expect(r.shown).toEqual(all.slice(0, n))
    }
  })

  it('shows what there is when there is less than n', () => {
    const g = client(11, { money: 1_000 })
    g.flags.investLossCarry = typicalIncome(g)
    const r = shownFindings(g, 99, false)
    expect(r.total).toBe(1)
    expect(r.shown.map((f) => f.id)).toEqual(['losses'])
    expect(shownFindings(client(11, { money: 1_000 }), 99, false)).toEqual({ shown: [], total: 0 })
  })

  it('sends managed through to idle-cash only', () => {
    const g = everything()
    expect(ids(findings(g, true))).toEqual(ids(findings(g, false)).filter((i) => i !== 'idle-cash'))
  })
})

describe('text', () => {
  it('is short and plain, even with a 36-character company name', () => {
    const g = everything()
    const name = 'Northern Harbour Freight & Trading'.padEnd(36, 'x').slice(0, 36)
    expect(name).toHaveLength(36)
    const co = g.assets.find((a) => a.kind === 'business')!
    co.name = name
    co.value = 9_000_000
    g.character.money = 3_000_000
    for (const f of findings(g, false)) {
      expect(f.text.length, f.id).toBeLessThanOrEqual(140)
      expect(f.text, f.id).not.toMatch(/\u2014/)
      expect(f.text.trim(), f.id).toBe(f.text)
    }
    // The short sentence keeps the whole name; the long one cuts it, with an ellipsis, and keeps its ending.
    expect(find(g, 'concentration')!.text).toBe(`${name} is ${Math.round((100 * co.value) / netWorth(g))}% of your net worth.`)
    const cash = find(g, 'company-cash')!.text
    expect(cash.startsWith(name.slice(0, 20))).toBe(true)
    expect(cash).toMatch(/\u2026 holds \$[\d,]+ past 18 months of costs\. Your 60% is \$[\d,]+ before tax\. Pay a Dividend is under Money\.$/)
  })

  it('keeps a real title, and stays under 140 characters with the longest one, three picks and large sums', () => {
    const build = (title: string): GameState => {
      const g = client(11, { money: 900_000_000_000_000 })
      officeJob(g, 'governor')
      g.character.job!.title = title
      for (let i = 0; i < 3; i++) boughtIn(g, g.year, stableStock(g, [g.year], i).secId, 1_000_000 + i * 100_000)
      const co = company(g, { name: 'x'.repeat(60), share: 1, value: 700_000_000_000_000 })
      co.details.cash = richCash(g, co, 800_000_000_000_000)
      loan(g, 'business', 0.4, 100_000_000_000_000)
      g.flags.investLossCarry = 400_000_000_000_000
      return g
    }
    for (const title of ['Member of Parliament', 'Member of the Chamber of Representatives']) {
      const g = build(title)
      const list = findings(g, false)
      expect(ids(list), title).toEqual(expect.arrayContaining(['insider', 'concentration', 'company-cash', 'loan', 'losses', 'idle-cash']))
      for (const f of list) {
        expect(f.text.length, `${title} ${f.id}`).toBeLessThanOrEqual(140)
        expect(f.text, f.id).not.toMatch(/\u2014/)
      }
      const t = find(g, 'insider')!.text
      expect(t).toContain('and 2 others, and you bought them in the last two years.')
      if (title.length < 30) expect(t.startsWith(`As ${title} you can move `)).toBe(true)
      else expect(t.startsWith('As an office holder you can move ')).toBe(true)
    }
  })

  it('has no NaN, undefined or Infinity in any text, and every weight is a whole number', () => {
    for (const g of [everything(), client(11), mayor()]) {
      for (const f of findings(g, false)) {
        expect(f.text).not.toMatch(/NaN|undefined|Infinity|\[object/)
        expect(Number.isInteger(f.weight)).toBe(true)
      }
    }
  })
})

describe('purity and hostile state', () => {
  it('reads a deep-frozen game without writing, throwing or drawing', () => {
    const g = everything()
    const before = JSON.stringify(g)
    const rng = g.rng
    deepFreeze(g)
    const a = findings(g, false)
    const b = findings(g, true)
    shownFindings(g, 60, false)
    expect(JSON.stringify(g)).toBe(before)
    expect(g.rng).toBe(rng)
    expect(findings(g, false)).toEqual(a)
    expect(b.length).toBe(a.length - 1)
  })

  it('does not throw on junk assets, loans, offices and flags', () => {
    const g = everything()
    g.assets.push(
      { id: 'j1', kind: 'investment', name: 7 as never, emoji: '', purchasePrice: 0, value: Number.NaN, condition: 0, purchasedAge: 0, upkeep: 0, details: { type: 'stock', secId: 7, units: 'x', boughtYear: null } },
      { id: 'j2', kind: 'business', name: 'Junk', emoji: '', purchasePrice: 0, value: Number.POSITIVE_INFINITY, condition: 0, purchasedAge: 0, upkeep: 0, details: { industry: 'restaurant', cash: 'lots', share: 'half', group: 3 } },
      { id: 'j3', kind: 'investment', name: 'Junk', emoji: '', purchasePrice: 0, value: -5, condition: 0, purchasedAge: 0, upkeep: 0, details: { type: 'crypto', secId: null } },
      { id: 'j4', kind: 'business', name: 'Junk', emoji: '', purchasePrice: 0, value: 5, condition: 0, purchasedAge: 0, upkeep: 0, details: {} },
    )
    g.character.job!.title = 7 as never
    g.character.job!.data = { office: 'mayor', approval: 'x' }
    g.character.loans.push({ id: 'jl', kind: 'x' as never, lender: '', balance: -5, yearlyPayment: 0, rate: 0.5 })
    g.flags.investLossCarry = 'x'
    const list = findings(g, false)
    for (const f of list) {
      expect(f.text).not.toMatch(/NaN|undefined|Infinity|\[object/)
      expect(Number.isFinite(f.weight)).toBe(true)
    }
    expect(JSON.parse(JSON.stringify(list))).toEqual(list)
  })

  it('does not change the game it reads', () => {
    const g = everything()
    const before = JSON.stringify(g)
    findings(g, false)
    shownFindings(g, 99, true)
    expect(JSON.stringify(g)).toBe(before)
  })
})
