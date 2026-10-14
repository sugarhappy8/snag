// The whole money team in one story (advisor and manager, plan task 7): a mayor with a big bank balance hires an
// advisor and a manager, ages five years, and is never an insider suspect through the manager. Every step drives
// the real code of tasks 1 to 6, so this checks how they fit together, not any one of them. The contrast game
// holds a made-up stock bought by hand: the advisor names it, and the same law does start a case on it.
import { describe, expect, it } from 'vitest'
import { shownFindings } from '../src/game/advisors/review'
import { hire, offersFor, readTeam, release, vet } from '../src/game/advisors/team'
import { yearlyAdvisors } from '../src/game/advisors/year'
import { stockTargets, type BetTarget } from '../src/game/computer/money-stocks'
import { yearlyFinance } from '../src/game/finance'
import { companyDef, exchangeInfo } from '../src/game/invest/engine'
import { buySecurity, investmentHoldings, yearlyInvestments } from '../src/game/investments'
import { officeHooks } from '../src/game/nation/office'
// Loading the politics module registers the office hooks (policyMove and policyWarning). Without it they are no-ops.
import '../src/game/special'
import type { GameState, NoticeModal } from '../src/game/types'
import { client, officeJob, own } from './advisors-kit'

const MONEY_TYPES = ['bond', 'index', 'savings']

/** The sectors a law on each of these keys moves (special/politics.ts POLICY_SECTORS, first-level keys). */
const POLICY_SECTORS: Record<string, string[]> = {
  energy: ['oil', 'utilities', 'mining'],
  industry: ['industrials', 'automakers'],
  technology: ['electronics', 'tech', 'telecom'],
  essentials: ['agri'],
  finance: ['banks', 'insurance'],
  logistics: ['shipping', 'airlines'],
  care: ['pharma'],
  housing: ['construction'],
  ecommerce: ['ecommerce'],
}

/** The keys the manager's side is checked on: laws that move the sectors made-up listed companies sit in. */
const KEYS = ['industry', 'ecommerce', 'finance', 'technology'] as const

interface CaseRow {
  id: string
  status: string
  secId: string
  via: string
  cause: string
}

/** The insider cases on record, read the way test/insider-fairness.test.ts does. */
function cases(g: GameState): CaseRow[] {
  const p = g.flags['special.politics'] as unknown as { abuse?: { cases: CaseRow[] } } | undefined
  return p?.abuse?.cases ?? []
}

/** How many laws the politics module has run against listed companies (it counts only the ones that had targets). */
function lawsRun(g: GameState): number {
  const p = g.flags['special.politics'] as unknown as { abuse?: { moves?: number } } | undefined
  return p?.abuse?.moves ?? 0
}

const move = (g: GameState, key: string, bullish: boolean): string => officeHooks().policyMove(g, key, bullish, 'Test law')
const warning = (g: GameState, key: string, bullish: boolean): string => officeHooks().policyWarning(g, key, bullish, 'Test law')

/** The policy key a law moves this company under, from its sector (null when no law moves it). */
function policyKeyOf(g: GameState, secId: string): string | null {
  const m = /s(\d+)g(\d+)$/.exec(secId)
  if (!m) return null
  const sector = companyDef(exchangeInfo(g.character.countryId), Number(m[1]), Number(m[2])).sector
  return Object.keys(POLICY_SECTORS).find((k) => POLICY_SECTORS[k].includes(sector)) ?? null
}

/** The first made-up listed company a law can move, with the key of that law. */
function movable(g: GameState): { target: BetTarget; key: string } {
  for (const target of stockTargets(g)) {
    const key = policyKeyOf(g, target.secId)
    if (key) return { target, key }
  }
  throw new Error('no made-up company a law can move is listed')
}

/** A US mayor with a big bank balance, an index fund and a savings account: enough of a book for a manager to take on. */
function mayor(seed: number): GameState {
  const g = client(seed, { money: 20_000_000 })
  officeJob(g, 'mayor')
  own(g, 'index', 3_000_000)
  own(g, 'savings', 1_000_000)
  g.queue.length = 0
  return g
}

function statements(g: GameState): NoticeModal[] {
  return g.queue.filter((m): m is NoticeModal => m.kind === 'notice' && m.title === 'Year-End Statement')
}

describe('the money team and the insider rule', () => {
  it('a mayor hires a team, ages five years and is never an insider suspect through it', () => {
    // 1. A US mayor with 20,000,000 and a book to manage.
    const g = mayor(11)

    // 2. The first advisor offer, then the first honest manager offer (checked by the advisor), then the hire.
    expect(hire(g, 'advisor', 0)).toBe(true)
    const offer = offersFor(g, 'manager').find((o) => o.honest)
    if (!offer) throw new Error('all three manager offers are crooks')
    expect(vet(g, offer)?.flagged ?? false).toBe(false)
    expect(hire(g, 'manager', offer.slot)).toBe(true)
    const team = readTeam(g)
    expect(team?.advisor).toBeDefined()
    expect(team?.manager?.name).toBe(offer.name)
    expect(team?.manager?.honest).toBe(true)
    const reserve = team?.mandate?.reserve ?? Number.NaN
    expect(reserve).toBeGreaterThan(0)

    // 3. Five years, one quiet statement each, and the bank never dug into for a trade.
    let deployed = 0
    for (let i = 1; i <= 5; i++) {
      g.year += 1
      g.character.age += 1
      g.yearActions = {}
      g.queue = []
      yearlyInvestments(g)
      yearlyFinance(g)
      yearlyAdvisors(g)
      const last = readTeam(g)?.last
      expect(last?.year).toBe(g.year)
      expect(statements(g)).toHaveLength(1)
      expect(g.queue.some((m) => m.kind === 'notice' && m.title === 'Order Filled')).toBe(false)
      expect(g.character.money).toBeGreaterThanOrEqual(reserve - 0.01 * (last?.moved ?? 0))
      deployed += last?.moved ?? 0
    }
    expect(deployed).toBeGreaterThan(0)

    // 4. The manager's holdings are index funds, bonds and savings, nothing else.
    const types = new Set(investmentHoldings(g).map((a) => String(a.details.type)))
    expect(types.size).toBeGreaterThan(0)
    for (const t of types) expect(MONEY_TYPES).toContain(t)

    // 5. The manager's side: no law of the mayor's can open a case, and nothing warns.
    for (const key of KEYS) for (const bullish of [true, false]) expect(warning(g, key, bullish)).toBe('')
    for (const key of KEYS) for (const bullish of [true, false]) move(g, key, bullish)
    expect(lawsRun(g)).toBeGreaterThan(0)
    expect(cases(g)).toHaveLength(0)
    expect(shownFindings(g, 99, true).shown.map((f) => f.id)).not.toContain('insider')

    // 7. Letting the manager go moves the epoch on and brings new faces. The record round trips and an heir sees none.
    const names = offersFor(g, 'manager').map((o) => o.name)
    const epoch = readTeam(g)?.managerEpoch ?? 0
    release(g, 'manager')
    expect(readTeam(g)?.managerEpoch).toBe(epoch + 1)
    expect(readTeam(g)?.manager).toBeUndefined()
    expect(readTeam(g)?.advisor).toBeDefined()
    const fresh = offersFor(g, 'manager').map((o) => o.name)
    expect(fresh.filter((n) => names.includes(n))).toEqual([])
    const copy = JSON.parse(JSON.stringify(g)) as GameState
    expect(readTeam(copy)).toEqual(readTeam(g))
    copy.character.id = 'an-heir'
    expect(readTeam(copy)).toBeNull()
  })

  it('the contrast: a made-up stock bought by hand is the advisor\'s top finding and does start a case', () => {
    // 6. The same mayor, no manager, one made-up stock a law can move, bought this year.
    const g = mayor(11)
    const { target: pick, key } = movable(g)
    expect(buySecurity(g, pick.secId, 2_000_000)).toBe(true)
    expect(investmentHoldings(g).some((a) => a.details.secId === pick.secId)).toBe(true)

    const { shown } = shownFindings(g, 40, false)
    expect(shown[0].id).toBe('insider')
    expect(shown[0].text).toContain(pick.name)

    expect(warning(g, key, true)).toContain(pick.name)
    move(g, key, true)
    expect(cases(g)).toHaveLength(1)
    expect(cases(g)[0]).toMatchObject({ secId: pick.secId, status: 'open', cause: 'policy', via: 'shares' })
  })
})
