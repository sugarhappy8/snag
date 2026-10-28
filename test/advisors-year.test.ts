// The money team's year-end step (advisors/year.ts): the advisor's retainer, the manager's invoice and trades,
// the crook's padding and the catch, and the one statement. It is the only part of the feature that draws from
// g.rng, and only after a manager has been paid.
import { afterEach, describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { poolOf, slipRate, type Mandate } from '../src/game/advisors/mandate'
import { shownFindings } from '../src/game/advisors/review'
import { advisorFee, managerFee, managerRate, readTeam, type Hire, type ManagerHire, type Statement, type Team } from '../src/game/advisors/team'
import { catchOdds, crookedSkim, yearlyAdvisors } from '../src/game/advisors/year'
import { bindMoneyContext, formatMoney, netWorth } from '../src/game/core'
import { investingBlocked } from '../src/game/history/markets'
import { buySecurity, investmentHoldings, investmentListing, managedBook, yearlyInvestments } from '../src/game/investments'
import { yearlyEntries } from '../src/game/kernel/registry'
import { nextRandom } from '../src/game/rng'
import type { Asset, GameState, Json, NoticeModal } from '../src/game/types'
import { client, coinHolding, madeUpStock, own, warp, withTeam } from './advisors-kit'
import { agingNames, withAging } from './kernel-kit'

afterEach(() => bindMoneyContext(null))

// ---------------------------------------------------------------------------
// Fixtures

const ADVISOR: Hire = { name: 'Ada Finch', skill: 70, since: 2025 }
const MANAGER: ManagerHire = { name: 'Dana Reyes', skill: 80, since: 2025, claimed: 80, honest: true, rate: managerRate(80), skimmed: 0 }
const MANDATE: Mandate = { stocks: 60, reserve: 500_000, limit: 100 }

interface Over {
  advisor?: Partial<Hire>
  manager?: Partial<ManagerHire>
  mandate?: Partial<Mandate>
  last?: Statement
  done?: number
}

/** Write a record for the game's character. `{}` for a role hires the default person; leave it out for none. */
function hired(g: GameState, over: Over = {}): void {
  const since = g.year - 1
  const team: Partial<Team> = {}
  if (over.advisor) team.advisor = { ...ADVISOR, since, ...over.advisor }
  if (over.manager) {
    team.manager = { ...MANAGER, since, ...over.manager }
    team.mandate = { ...MANDATE, ...over.mandate }
    if (over.last) team.last = over.last
  }
  if (over.done !== undefined) team.done = over.done
  withTeam(g, team)
}

/** A client with a manager hired, `money` in the bank and nothing invested yet. */
function managed(over: Over = {}, money = 2_000_000, seed = 11): GameState {
  const g = client(seed, { money })
  hired(g, { manager: {}, ...over })
  return g
}

function notices(g: GameState): NoticeModal[] {
  return g.queue.filter((m): m is NoticeModal => m.kind === 'notice')
}

function titled(g: GameState, title: string): NoticeModal[] {
  return notices(g).filter((n) => n.title === title)
}

function logLines(g: GameState): string[] {
  return g.log.flatMap((y) => y.entries.map((e) => e.text))
}

/** The text of the year's statement popup ('' when there was none). */
function statement(g: GameState): string {
  return titled(g, 'Year-End Statement')[0]?.text ?? ''
}

function typesHeld(g: GameState): string[] {
  return [...new Set(investmentHoldings(g).map((a) => String(a.details.type)))].sort()
}

function ofType(g: GameState, type: string): Asset[] {
  return investmentHoldings(g).filter((a) => a.details.type === type)
}

function units(g: GameState, type: string): number {
  return ofType(g, type).reduce((s, a) => s + Number(a.details.units), 0)
}

/** The first seed in 1 to `max` for which `ok` holds. Fails the test when there is none. */
function firstSeed(ok: (seed: number) => boolean, max = 400): number {
  for (let seed = 1; seed <= max; seed++) if (ok(seed)) return seed
  throw new Error(`no seed in 1 to ${max} fits`)
}

/** Run the step on a copy of `g` with the given seed. */
function run(g: GameState, seed: number): GameState {
  const copy = structuredClone(g)
  copy.rng = seed
  yearlyAdvisors(copy)
  return copy
}

const blundered = (g: GameState): boolean => / points (high|low)\./.test(statement(g))
const caught = (g: GameState): boolean => titled(g, 'Missing Money').length > 0
const stillHired = (g: GameState): boolean => readTeam(g)?.manager !== undefined

/** A seed on which the manager does not blunder (the draw comes first, so the book does not matter). */
function calmSeed(g: GameState): number {
  return firstSeed((seed) => !blundered(run(g, seed)))
}

/** The same game on a seed where the manager does not blunder. */
function calm(g: GameState): GameState {
  g.rng = calmSeed(g)
  return g
}

/** How many draws moved the generator from `seed` to `now` (-1 when it is not a few steps from it). */
function draws(seed: number, now: number): number {
  let s = seed
  for (let k = 0; k <= 8; k++) {
    if (s === now) return k
    s = nextRandom(s)[1]
  }
  return -1
}

const MONEY_TYPES = ['bond', 'index', 'savings']

// ---------------------------------------------------------------------------

describe('the hook', () => {
  it('sits after the underworld and before the milestones, so it runs after rent, tax and upkeep', () => {
    const names = agingNames()
    const i = names.indexOf('advisors')
    expect(i).toBeGreaterThan(-1)
    expect(names[i - 1]).toBe('underworld')
    // R4's edge step (world.edges, close phase, order 5) runs between the two: whatever sits there is a close step ahead of the milestones' order 10
    const m = names.indexOf('milestones')
    expect(m).toBeGreaterThan(i)
    expect(names.slice(i + 1, m)).toContain('world.edges')
    for (const e of yearlyEntries('aging').slice(i + 1, m)) {
      expect(e.phase, e.id).toBe('close')
      expect(e.order, e.id).toBeLessThan(10)
    }
    for (const before of ['investments', 'finance', 'assets']) expect(names.indexOf(before)).toBeLessThan(i)
  })

  it('does nothing and draws nothing without a record', () => {
    const g = client(21, { money: 3_000_000 })
    own(g, 'index', 500_000)
    own(g, 'bond', 300_000)
    g.queue.length = 0
    const before = JSON.stringify(g)
    const rng = g.rng
    yearlyAdvisors(g)
    expect(JSON.stringify(g)).toBe(before)
    expect(g.rng).toBe(rng)
  })

  it('leaves a whole year unchanged for a player with no record', () => {
    const make = () => {
      const g = client(22, { money: 3_000_000 })
      own(g, 'index', 500_000)
      own(g, 'bond', 300_000)
      own(g, 'savings', 200_000)
      g.queue.length = 0
      return g
    }
    const withHook = make()
    const without = make()
    ageUp(withHook)
    withAging((es) => es.filter((e) => e.id !== 'yearly.advisors'), () => ageUp(without))
    expect(JSON.stringify(withHook)).toBe(JSON.stringify(without))
  })

  it('runs inside ageUp for a player with a team: one statement, once', () => {
    const g = client(23, { money: 4_000_000 })
    hired(g, { advisor: {}, manager: {} })
    ageUp(g)
    expect(g.character.alive).toBe(true)
    expect(titled(g, 'Year-End Statement')).toHaveLength(1)
    expect(readTeam(g)?.done).toBe(g.year)
    expect(readTeam(g)?.last?.year).toBe(g.year)
  })
})

describe('who is served', () => {
  it('skips the dead, minors, prisoners and a year already done', () => {
    const dead = managed({ advisor: {} })
    dead.character.alive = false
    const minor = client(11, { money: 2_000_000, age: 17 })
    hired(minor, { advisor: {}, manager: {} })
    const prisoner = managed({ advisor: {} })
    prisoner.character.prison = { crime: 'Fraud', yearsTotal: 3, yearsServed: 0, security: 'minimum', respect: 50 } as unknown as GameState['character']['prison']
    const done = managed({ advisor: {}, done: 2026 })
    for (const g of [dead, minor, prisoner, done]) {
      g.queue.length = 0
      const before = JSON.stringify(g)
      const rng = g.rng
      yearlyAdvisors(g)
      expect(JSON.stringify(g)).toBe(before)
      expect(g.rng).toBe(rng)
    }
  })

  it('does nothing a second time in the same year', () => {
    const g = calm(managed({ advisor: {} }))
    yearlyAdvisors(g)
    expect(readTeam(g)?.done).toBe(g.year)
    const before = JSON.stringify(g)
    const rng = g.rng
    yearlyAdvisors(g)
    expect(JSON.stringify(g)).toBe(before)
    expect(g.rng).toBe(rng)
  })

  it('an heir ignores the record', () => {
    const g = managed({ advisor: {} })
    g.character.id = 'someone-else'
    g.queue.length = 0
    const before = JSON.stringify(g)
    yearlyAdvisors(g)
    expect(JSON.stringify(g)).toBe(before)
  })

  it('reads a junk record as no record', () => {
    const records: Json[] = ['x', 7, null, [], {}, { owner: 5 }, { owner: 'player:1986', advisor: 'x', manager: 7 }]
    for (const junk of records) {
      const g = client(11, { money: 2_000_000 })
      g.flags['fin.team'] = junk
      const before = JSON.stringify(g)
      const rng = g.rng
      expect(() => yearlyAdvisors(g)).not.toThrow()
      expect(JSON.stringify(g)).toBe(before)
      expect(g.rng).toBe(rng)
    }
  })

  it('does not throw on a damaged bank balance', () => {
    for (const money of [Number.NaN, Number.POSITIVE_INFINITY, -50_000, 0]) {
      const g = managed({ advisor: {} })
      g.character.money = money
      expect(() => yearlyAdvisors(g)).not.toThrow()
    }
  })
})

describe('the advisor', () => {
  /** An advisor-only client with three findings to report: a dear loan, idle cash and carried losses. */
  function withFindings(): GameState {
    const g = client(31, { money: 5_000_000 })
    g.flags.investLossCarry = 9_000_000
    g.character.loans.push({ id: 'loan-1', kind: 'personal', lender: 'First Bank', balance: 300_000, yearlyPayment: 30_000, rate: 0.09 })
    hired(g, { advisor: {} })
    return g
  }

  it('charges the retainer and reports the top two findings', () => {
    const g = withFindings()
    const fee = advisorFee(g, ADVISOR.skill)
    const before = g.character.money
    yearlyAdvisors(g)
    expect(g.character.money).toBe(before - fee)
    const popups = titled(g, 'Year-End Statement')
    expect(popups).toHaveLength(1)
    expect(notices(g)).toHaveLength(1)
    expect(popups[0].emoji).toBe('💼')
    // The review reads the game as it stands after the step, and writing the record changes nothing it reads.
    const { shown, total } = shownFindings(g, ADVISOR.skill, false)
    expect(total).toBeGreaterThanOrEqual(3)
    expect(shown.length).toBeGreaterThan(2)
    const text = popups[0].text
    expect(text.startsWith(`${ADVISOR.name} charged ${formatMoney(fee)}.`)).toBe(true)
    expect(text).toContain(shown[0].text)
    expect(text).toContain(shown[1].text)
    expect(text).not.toContain(shown[2].text)
    expect(text).toContain('More are in Money Team.')
    expect(text.indexOf(shown[0].text)).toBeLessThan(text.indexOf(shown[1].text))
    expect(logLines(g).filter((l) => l.startsWith('I paid '))).toEqual([`I paid ${formatMoney(fee)} to my money team.`])
  })

  it('says nothing about more when the advisor shows two', () => {
    const g = withFindings()
    hired(g, { advisor: { skill: 20 } })
    yearlyAdvisors(g)
    const text = statement(g)
    expect(text).toContain('charged')
    expect(text).not.toContain('More are in Money Team.')
  })

  it("an advisor who can't be paid leaves", () => {
    const g = client(32, { money: 3_000_000 })
    own(g, 'savings', 2_900_000)
    g.character.money = 0
    hired(g, { advisor: {} })
    g.queue.length = 0
    yearlyAdvisors(g)
    const team = readTeam(g)
    expect(team?.advisor).toBeUndefined()
    expect(team?.advisorEpoch).toBe(1)
    expect(g.character.money).toBe(0)
    expect(logLines(g)).toContain(`${ADVISOR.name} left over an unpaid bill.`)
    expect(g.queue).toHaveLength(0)
    expect(logLines(g).some((l) => l.startsWith('I paid'))).toBe(false)
  })

  it('draws nothing without a manager', () => {
    const g = withFindings()
    const rng = g.rng
    yearlyAdvisors(g)
    expect(g.rng).toBe(rng)
  })
})

describe('the manager at work', () => {
  it('deploys spare cash and keeps the reserve', () => {
    const g = calm(managed({ manager: { skill: 80 }, mandate: { stocks: 60, reserve: 500_000, limit: 100 } }))
    yearlyAdvisors(g)
    const last = readTeam(g)?.last
    expect(last).toBeDefined()
    expect(last!.moved).toBeGreaterThan(0)
    expect(g.character.money).toBeGreaterThanOrEqual(500_000 - Math.round(last!.moved * slipRate(80)))
    for (const t of typesHeld(g)) expect(MONEY_TYPES).toContain(t)
    expect(typesHeld(g)).toContain('index')
    expect(Math.abs(last!.stocks - 60)).toBeLessThanOrEqual(2)
    expect(last!.year).toBe(g.year)
  })

  it('never takes cash under the reserve for a buy', () => {
    const g = calm(managed({ manager: {}, mandate: { reserve: 1_900_000 } }, 2_000_000))
    yearlyAdvisors(g)
    const last = readTeam(g)!.last!
    expect(last.moved).toBeGreaterThan(0)
    expect(last.moved).toBeLessThanOrEqual(100_000)
    expect(g.character.money).toBeGreaterThanOrEqual(1_900_000 - last.costs)
  })

  it('deploying cash costs the bill, the slippage and the broker fee, nothing else', () => {
    const g = calm(managed({ manager: { skill: 80 } }))
    const before = netWorth(g)
    const pool = poolOf(managedBook(g), 500_000)
    yearlyAdvisors(g)
    const last = readTeam(g)!.last!
    const lost = before - netWorth(g)
    expect(last.billed).toBe(managerFee(g, managerRate(80), pool))
    expect(last.pool).toBe(pool)
    expect(lost).toBeGreaterThanOrEqual(last.billed + last.costs - 1)
    expect(lost).toBeLessThanOrEqual(last.billed + last.costs + 0.01 * last.moved)
  })

  it('trades are silent: one popup', () => {
    const g = calm(managed({ manager: {} }))
    yearlyAdvisors(g)
    expect(g.queue).toHaveLength(1)
    expect(g.queue[0]).toMatchObject({ kind: 'notice', title: 'Year-End Statement', emoji: '💼' })
    expect(titled(g, 'Order Filled')).toHaveLength(0)
    expect(statement(g)).toMatch(/^Dana Reyes billed \$[\d,]+ on \$[\d,]+\. They moved \$[\d,]+\. \d+% is in stocks\.$/)
  })

  it('writes the statement into the record, and it survives a save', () => {
    const g = calm(managed({ manager: {} }))
    yearlyAdvisors(g)
    const last = readTeam(g)!.last!
    const again = JSON.parse(JSON.stringify(g)) as GameState
    expect(readTeam(again)?.last).toEqual(last)
    expect(readTeam(again)?.manager?.skimmed).toBe(0)
  })

  it('never touches picks, coins or companies', () => {
    const g = calm(managed({ manager: { skill: 90 }, mandate: { reserve: 300_000 } }, 6_000_000))
    const pick = own(g, 'stock', 300_000)
    expect(pick.details.secId).toBe(madeUpStock(g).secId)
    const coin = coinHolding(g, 100_000)
    const rows = investmentListing(g)
    const reit = rows.find((r) => r.type === 'reit')
    expect(reit).toBeDefined()
    expect(buySecurity(g, reit!.secId, 200_000)).toBe(true)
    const gold = rows.find((r) => r.type === 'gold')
    if (gold) expect(buySecurity(g, gold.secId, 100_000)).toBe(true)
    const NOT_MINE = ['stock', 'penny', 'crypto', 'reit', 'gold']
    const picks = (): { id: string; units: unknown; secId: unknown }[] =>
      investmentHoldings(g)
        .filter((a) => NOT_MINE.includes(String(a.details.type)))
        .map((a) => ({ id: a.id, units: a.details.units, secId: a.details.secId }))
    const snapshot = picks()
    expect(snapshot.length).toBeGreaterThanOrEqual(3)
    expect(snapshot.some((s) => s.id === coin.id)).toBe(true)

    for (let i = 0; i < 5; i++) {
      warp(g, g.year + 1)
      yearlyAdvisors(g)
      expect(picks()).toEqual(snapshot)
      for (const a of investmentHoldings(g)) {
        if (!NOT_MINE.includes(String(a.details.type))) expect(MONEY_TYPES).toContain(String(a.details.type))
      }
      expect(readTeam(g)?.last?.year).toBe(g.year)
    }
    expect(stillHired(g)).toBe(true)
  })

  it('the invoice comes first and an unpaid bill ends the hire', () => {
    const g = client(41, { money: 2_000_000 })
    own(g, 'savings', 1_900_000)
    g.character.money = 0
    hired(g, { manager: {} })
    g.queue.length = 0
    const held = investmentHoldings(g).map((a) => ({ id: a.id, units: a.details.units }))
    const rng = g.rng
    yearlyAdvisors(g)
    const team = readTeam(g)
    expect(team?.manager).toBeUndefined()
    expect(team?.mandate).toBeUndefined()
    expect(team?.last).toBeUndefined()
    expect(team?.managerEpoch).toBe(1)
    expect(investmentHoldings(g).map((a) => ({ id: a.id, units: a.details.units }))).toEqual(held)
    expect(g.character.money).toBe(0)
    expect(logLines(g)).toContain(`${MANAGER.name} left over an unpaid bill.`)
    expect(g.queue).toHaveLength(0)
    expect(g.rng).toBe(rng)
  })

  it('an unpaid manager takes the old statement with them', () => {
    const g = client(42, { money: 2_000_000 })
    own(g, 'savings', 1_900_000)
    g.character.money = 0
    hired(g, { manager: {}, last: { year: 2025, pool: 1_000_000, billed: 10_000, moved: 500_000, costs: 1_000, stocks: 55 } })
    expect(readTeam(g)?.last).toBeDefined()
    yearlyAdvisors(g)
    expect(readTeam(g)?.last).toBeUndefined()
  })

  it("banned investing idles the manager, a shut exchange doesn't", () => {
    let hit: { countryId: string; year: number } | null = null
    for (const countryId of ['cn', 'cu', 'ru', 'ir']) {
      for (let year = 1950; year <= 1990 && !hit; year++) if (investingBlocked(countryId, year)) hit = { countryId, year }
      if (hit) break
    }
    expect(hit).not.toBeNull()
    const g = client(43, { ...hit!, money: 3_000_000 })
    hired(g, { advisor: {}, manager: {} })
    g.queue.length = 0
    const fee = advisorFee(g, ADVISOR.skill)
    const money = g.character.money
    const rng = g.rng
    yearlyAdvisors(g)
    expect(g.character.money).toBe(money - fee)
    expect(investmentHoldings(g)).toHaveLength(0)
    expect(readTeam(g)?.last).toBeUndefined()
    expect(stillHired(g)).toBe(true)
    expect(g.rng).toBe(rng)
    expect(statement(g)).toContain('charged')
    expect(statement(g)).not.toContain('billed')

    const japan = client(44, { countryId: 'jp', year: 1946, money: 3_000_000 })
    hired(japan, { manager: {}, mandate: { reserve: 100_000 } })
    calm(japan)
    expect(managedBook(japan).stocks.buyBlock).toMatch(/closed/)
    yearlyAdvisors(japan)
    expect(readTeam(japan)?.last?.moved).toBeGreaterThan(0)
    expect(ofType(japan, 'index')).toHaveLength(0)
    expect(investmentHoldings(japan).length).toBeGreaterThan(0)
    for (const t of typesHeld(japan)) expect(['bond', 'savings']).toContain(t)
    expect(readTeam(japan)?.last?.stocks).toBe(0)
  })
})

describe('the random draws', () => {
  it('one for the blunder, one more for its direction, one for the catch of a crook who has padded', () => {
    const honest = managed({ manager: { skill: 25 } })
    const crook = managed({ manager: { skill: 25, honest: false } })
    const calmOne = calmSeed(honest)
    const blunderOne = firstSeed((s) => blundered(run(honest, s)))

    expect(draws(calmOne, run(honest, calmOne).rng)).toBe(1)
    expect(draws(blunderOne, run(honest, blunderOne).rng)).toBe(2)
    expect(draws(calmOne, run(crook, calmOne).rng)).toBe(2)
    expect(draws(blunderOne, run(crook, blunderOne).rng)).toBe(3)
  })

  it('none for an unpaid manager, an idle book, an honest-free advisor-only record or a done year', () => {
    const g = client(45, { money: 2_000_000 })
    own(g, 'savings', 1_900_000)
    g.character.money = 0
    hired(g, { manager: {} })
    expect(run(g, 77).rng).toBe(77)

    const advisorOnly = client(46, { money: 5_000_000 })
    hired(advisorOnly, { advisor: {} })
    expect(run(advisorOnly, 77).rng).toBe(77)
  })
})

describe('a blunder', () => {
  it('aims off target, says so, and next year corrects it', () => {
    const g = managed({ manager: { skill: 25, claimed: 60, rate: managerRate(60) }, mandate: { limit: 100 } })
    const bad = firstSeed((s) => blundered(run(g, s)))
    const good = calmSeed(g)
    const off = run(g, bad)
    const on = run(g, good)
    const miss = (x: GameState): number => Math.abs(readTeam(x)!.last!.stocks - 60)

    expect(statement(off)).toMatch(/Dana mixed up your target and aimed 25 points (high|low)\./)
    expect(statement(on)).not.toContain('mixed up')
    expect(miss(off)).toBeGreaterThan(miss(on) + 15)

    // A year later, with no blunder, the normal pass pulls the mix back toward 60. The year's markets are priced
    // first, as the investments hook does before this one.
    const missed = miss(off)
    warp(off, off.year + 1)
    yearlyInvestments(off)
    off.queue.length = 0
    off.rng = good
    yearlyAdvisors(off)
    expect(blundered(off)).toBe(false)
    expect(miss(off)).toBeLessThan(missed - 10)
  })

  it('goes high or low, both by 25 points', () => {
    const g = managed({ manager: { skill: 25 } })
    const dirs = new Set<string>()
    for (let s = 1; s <= 400 && dirs.size < 2; s++) {
      const m = statement(run(g, s)).match(/aimed 25 points (high|low)\./)
      if (m) dirs.add(m[1])
    }
    expect([...dirs].sort()).toEqual(['high', 'low'])
  })
})

describe('skill', () => {
  it('a weak manager slips more than a strong one on the same book', () => {
    const deploy = (skill: number, seed: number): Statement => {
      const g = managed({ manager: { skill, claimed: 60, rate: managerRate(60) } }, 2_000_000, 52)
      return readTeam(run(g, seed))!.last!
    }
    const weakGame = managed({ manager: { skill: 35, claimed: 60, rate: managerRate(60) } }, 2_000_000, 52)
    const seed = calmSeed(weakGame)
    const weak = deploy(35, seed)
    const strong = deploy(90, seed)
    expect(weak.billed).toBe(strong.billed)
    expect(weak.moved).toBeGreaterThan(0)
    expect(strong.moved).toBeGreaterThan(0)
    expect(weak.costs).toBeGreaterThan(strong.costs)
    expect(weak.costs).toBeCloseTo(Math.round(weak.moved * slipRate(35)), -1)
  })

  it('a book 8 points past target is rebalanced by a strong manager and left alone by a weak one', () => {
    const book = (skill: number): GameState => {
      const g = client(51, { money: 3_000_000 })
      own(g, 'index', 1_360_000)
      own(g, 'bond', 400_000)
      own(g, 'savings', 240_000)
      hired(g, { manager: { skill, claimed: 60, rate: managerRate(60) }, mandate: { stocks: 60, reserve: 500_000, limit: 100 } })
      g.character.money = 530_000
      g.queue.length = 0
      return g
    }
    const weak = book(35)
    const strong = book(90)
    const seed = calmSeed(weak)
    const start = units(weak, 'index')
    expect(units(strong, 'index')).toBe(start)
    expect(units(run(weak, seed), 'index')).toBe(start)
    const after = run(strong, seed)
    expect(units(after, 'index')).toBeLessThan(start * 0.95)
    // The sale and the buy it pays for are as silent as any other trade, and the bank keeps its reserve.
    expect(notices(after).map((n) => n.title)).toEqual(['Year-End Statement'])
    expect(after.character.money).toBeGreaterThanOrEqual(500_000 - readTeam(after)!.last!.costs)
    expect(Math.abs(readTeam(after)!.last!.stocks - 60)).toBeLessThanOrEqual(4)
  })
})

describe('a crooked manager', () => {
  const crook = (over: Partial<ManagerHire> = {}, mandate: Partial<Mandate> = {}): GameState => managed({ manager: { honest: false, ...over }, mandate })

  it('pads the bill by 3% of the limit share of the pool', () => {
    const g = crook()
    const pool = poolOf(managedBook(g), 500_000)
    const agreed = managerFee(g, MANAGER.rate, pool)
    const seed = firstSeed((s) => stillHired(run(g, s)))
    const after = run(g, seed)
    const last = readTeam(after)!.last!
    expect(last.pool).toBe(pool)
    expect(last.billed - agreed).toBe(crookedSkim(pool, 100))
    expect(crookedSkim(pool, 100)).toBe(Math.round(0.03 * pool))
    expect(readTeam(after)!.manager!.skimmed).toBe(crookedSkim(pool, 100))

    const small = run(crook({}, { limit: 10 }), seed)
    const padded = readTeam(small)!.last!.billed - agreed
    expect(padded).toBe(crookedSkim(pool, 10))
    expect(Math.abs(padded * 10 - crookedSkim(pool, 100))).toBeLessThanOrEqual(10)
  })

  it('pads again every year it is not caught, and the total grows', () => {
    const totals = (seed: number): number[] | null => {
      const g = crook()
      g.rng = seed
      const out: number[] = []
      for (let i = 0; i < 3; i++) {
        if (i > 0) warp(g, g.year + 1)
        yearlyAdvisors(g)
        const m = readTeam(g)?.manager
        if (!m) return null
        out.push(m.skimmed)
      }
      return out
    }
    const seed = firstSeed((s) => totals(s) !== null)
    const t = totals(seed)!
    expect(t[0]).toBeGreaterThan(0)
    expect(t[1]).toBeGreaterThan(t[0])
    expect(t[2]).toBeGreaterThan(t[1])
  })

  it('cuts the padding to the cash left after the agreed fee, and keeps the hire', () => {
    const g = client(61, { money: 3_000_000 })
    own(g, 'savings', 1_900_000)
    hired(g, { manager: { honest: false }, mandate: { stocks: 0, reserve: 500_000, limit: 100 } })
    g.character.money = 40_000
    const pool = poolOf(managedBook(g), 500_000)
    const agreed = managerFee(g, MANAGER.rate, pool)
    g.character.money = agreed + 5_000
    expect(pool).toBe(poolOf(managedBook(g), 500_000))
    expect(crookedSkim(pool, 100)).toBeGreaterThan(5_000)
    const after = run(g, firstSeed((s) => stillHired(run(g, s))))
    const team = readTeam(after)!
    expect(team.last?.billed).toBe(agreed + 5_000)
    expect(team.manager?.skimmed).toBe(5_000)
    expect(after.character.money).toBe(0)
    expect(team.managerEpoch).toBeUndefined()
  })

  it('takes whole dollars only', () => {
    const g = client(62, { money: 3_000_000 })
    own(g, 'savings', 1_900_000)
    hired(g, { manager: { honest: false }, mandate: { stocks: 0, reserve: 500_000, limit: 100 } })
    g.character.money = 40_000
    const pool = poolOf(managedBook(g), 500_000)
    const agreed = managerFee(g, MANAGER.rate, pool)
    g.character.money = agreed + 5_000.6
    const after = run(g, firstSeed((s) => stillHired(run(g, s))))
    expect(readTeam(after)?.manager?.skimmed).toBe(5_000)
    expect(after.character.money).toBeGreaterThanOrEqual(0)
    expect(after.character.money).toBeLessThanOrEqual(1)
  })

  it('an honest manager pads nothing and is never caught', () => {
    const g = managed({ advisor: { skill: 99 }, manager: {} })
    for (let s = 1; s <= 60; s++) {
      const after = run(g, s)
      expect(readTeam(after)!.manager!.skimmed).toBe(0)
      expect(titled(after, 'Missing Money')).toHaveLength(0)
    }
  })
})

describe('the catch', () => {
  const advised = (): GameState => managed({ advisor: { skill: 90 }, manager: { honest: false, skimmed: 40_000, since: 2024 }, mandate: { limit: 100 } })

  it('pays back 30% of the padding once and lets them go', () => {
    const g = advised()
    const pool = poolOf(managedBook(g), 500_000) - advisorFee(g, 90)
    const seed = firstSeed((s) => caught(run(g, s)))
    const after = run(g, seed)
    const total = 40_000 + crookedSkim(pool, 100)
    const refund = Math.round(0.3 * total)

    const popups = titled(after, 'Missing Money')
    expect(popups).toHaveLength(1)
    expect(popups[0].text).toBe(
      `Your advisor found padded bills from Dana Reyes. ${formatMoney(total)} went missing over 2 years. You got back ${formatMoney(refund)} and let Dana Reyes go.`,
    )
    const team = readTeam(after)!
    expect(team.manager).toBeUndefined()
    expect(team.mandate).toBeUndefined()
    expect(team.last).toBeUndefined()
    expect(team.managerEpoch).toBe(1)
    expect(team.advisor?.name).toBe(ADVISOR.name)
    expect(logLines(after).filter((l) => l === 'I caught Dana Reyes padding the bills.')).toHaveLength(1)
    expect(titled(after, 'Year-End Statement')).toHaveLength(1)
    expect(statement(after)).not.toContain('Dana Reyes billed')

    // A second call in the same year adds nothing.
    const frozen = JSON.stringify(after)
    yearlyAdvisors(after)
    expect(JSON.stringify(after)).toBe(frozen)
    expect(titled(after, 'Missing Money')).toHaveLength(1)
  })

  it('puts the refund in the bank, 30% of all that was padded', () => {
    const small = advised()
    const large = advised()
    hired(large, { advisor: { skill: 90 }, manager: { honest: false, skimmed: 140_000, since: 2024 }, mandate: { limit: 100 } })
    const seed = firstSeed((s) => caught(run(small, s)))
    const a = run(small, seed)
    const b = run(large, seed)
    expect(caught(b)).toBe(true)
    // Everything else about the two years is the same, so the bank differs by the refunds alone.
    const skim = crookedSkim(poolOf(managedBook(small), 500_000) - advisorFee(small, 90), 100)
    expect(b.character.money - a.character.money).toBe(Math.round(0.3 * (140_000 + skim)) - Math.round(0.3 * (40_000 + skim)))
  })

  it("names the bank when there's no advisor, and counts the years since the hire", () => {
    const g = managed({ manager: { honest: false, skimmed: 10_000, since: 2023 }, mandate: { limit: 100 } })
    const text = titled(run(g, firstSeed((s) => caught(run(g, s)))), 'Missing Money')[0].text
    expect(text.startsWith('Your bank found padded bills from Dana Reyes.')).toBe(true)
    expect(text).toContain('over 3 years.')
    const one = managed({ manager: { honest: false, skimmed: 10_000 }, mandate: { limit: 100 } })
    expect(titled(run(one, firstSeed((s) => caught(run(one, s)))), 'Missing Money')[0].text).toContain('over 1 year.')
  })

  it('has the odds it says it has', () => {
    expect(catchOdds(null)).toBe(0.04)
    expect(catchOdds(90)).toBe(0.49)
    expect(catchOdds(0)).toBe(0.04)
    expect(catchOdds(500)).toBe(0.9)
    expect(catchOdds(Number.NaN)).toBe(0.04)
    expect(catchOdds(-500)).toBe(0)
    let withHelp = 0
    let alone = 0
    const g = advised()
    const solo = managed({ manager: { honest: false, skimmed: 40_000, since: 2024 }, mandate: { limit: 100 } })
    for (let s = 1; s <= 400; s++) {
      if (caught(run(g, s))) withHelp++
      if (caught(run(solo, s))) alone++
    }
    expect(withHelp).toBeGreaterThan(alone)
    expect(withHelp / 400).toBeGreaterThan(0.35)
    expect(withHelp / 400).toBeLessThan(0.65)
    expect(alone / 400).toBeLessThan(0.15)
  })
})

describe('pure helpers', () => {
  it('crookedSkim is three percent of the limit share of the pool, zero for bad input', () => {
    expect(crookedSkim(1_000_000, 100)).toBe(30_000)
    expect(crookedSkim(1_000_000, 10)).toBe(3_000)
    expect(crookedSkim(1_000_000, 50)).toBe(15_000)
    expect(crookedSkim(Number.NaN, 50)).toBe(0)
    expect(crookedSkim(Number.POSITIVE_INFINITY, 50)).toBe(0)
    expect(crookedSkim(-1_000, 50)).toBe(0)
    expect(crookedSkim(1_000_000, Number.NaN)).toBe(0)
    expect(crookedSkim(1_000_000, -5)).toBe(0)
    expect(crookedSkim(1_000_000, 500)).toBeLessThanOrEqual(30_000)
    expect(Number.isInteger(crookedSkim(123_457, 35))).toBe(true)
  })
})
