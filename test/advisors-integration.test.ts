// How the money team fits the rest of the engine, across countries and eras (the integration check of plan
// task 7): the manager's year never creates net worth, keeps to one statement and no order popups, and a
// politician with a manager has no insider case whatever the office or the era. Every step drives the real code.
import { afterEach, describe, expect, it } from 'vitest'
import { shownFindings } from '../src/game/advisors/review'
import { hire, managerRate, offersFor, readTeam, type ManagerHire } from '../src/game/advisors/team'
import { yearlyAdvisors } from '../src/game/advisors/year'
import { ageUp } from '../src/game/aging'
import { bindMoneyContext, netWorth } from '../src/game/core'
import { investmentHoldings } from '../src/game/investments'
import { officeHooks } from '../src/game/nation/office'
// Loading the politics module registers the office hooks (policyMove and policyWarning). Without it they are no-ops.
import '../src/game/special'
import type { GameState, NoticeModal } from '../src/game/types'
import { client, officeJob, own, withTeam } from './advisors-kit'

afterEach(() => bindMoneyContext(null))

const MONEY_TYPES = ['bond', 'index', 'savings']

describe("the manager's year against the rest of the engine", () => {
  const places: [string, number][] = [['us', 1925], ['gb', 1960], ['jp', 1995], ['br', 2026], ['in', 2060]]
  for (const [country, year] of places) {
    for (const skill of [25, 95]) {
      it(`${country} ${year}, skill ${skill}: costs money, never makes any, and makes one statement`, () => {
        const g = client(5, { countryId: country, year, money: 4_000_000 })
        own(g, 'index', 700_000)
        own(g, 'bond', 400_000)
        own(g, 'savings', 300_000)
        const manager: ManagerHire = { name: 'Dana Reyes', skill, since: year - 1, claimed: skill, honest: true, rate: managerRate(skill), skimmed: 0 }
        withTeam(g, { manager, mandate: { stocks: 60, reserve: 300_000, limit: 100 } })
        g.queue = []
        const before = netWorth(g)
        yearlyAdvisors(g)
        const statement = readTeam(g)?.last
        expect(statement?.year).toBe(g.year)
        expect(statement?.moved).toBeGreaterThan(0)

        // Net worth falls by the bill and the slippage, plus the broker's fees and tax on what moved, and never rises.
        const fall = before - netWorth(g)
        expect(fall).toBeGreaterThanOrEqual((statement?.billed ?? 0) + (statement?.costs ?? 0) - 2)
        expect(fall).toBeLessThanOrEqual((statement?.billed ?? 0) + (statement?.costs ?? 0) + 0.05 * (statement?.moved ?? 0) + 2)

        const popups = g.queue.filter((m): m is NoticeModal => m.kind === 'notice')
        expect(popups.filter((m) => m.title === 'Year-End Statement')).toHaveLength(1)
        expect(popups.filter((m) => m.title === 'Order Filled' || m.title === 'Order Rejected')).toHaveLength(0)
        for (const a of investmentHoldings(g)) expect(MONEY_TYPES).toContain(String(a.details.type))
      })
    }
  }
})

describe('a politician with a manager, across offices and eras', () => {
  const KEYS = ['energy', 'industry', 'technology', 'finance', 'logistics', 'care', 'housing', 'bank', 'software', 'ecommerce', 'casino', 'hotel']
  const places: [string, number, 'mayor' | 'governor' | 'leader'][] = [['us', 1925, 'mayor'], ['gb', 1975, 'leader'], ['jp', 1990, 'governor'], ['br', 2010, 'mayor']]

  function insiderCases(g: GameState): unknown[] {
    const p = g.flags['special.politics'] as unknown as { abuse?: { cases: unknown[] } } | undefined
    return p?.abuse?.cases ?? []
  }

  for (const [country, year, office] of places) {
    it(`${country} ${year}, ${office}: four years through ageUp and no law starts a case`, () => {
      const g = client(41, { countryId: country, year, money: 40_000_000 })
      officeJob(g, office)
      own(g, 'index', 3_000_000)
      own(g, 'savings', 1_000_000)
      own(g, 'bond', 1_000_000)
      g.queue = []
      expect(hire(g, 'advisor', 0)).toBe(true)
      const honest = offersFor(g, 'manager').find((o) => o.honest)
      if (!honest) throw new Error('all three manager offers are crooks')
      expect(hire(g, 'manager', honest.slot)).toBe(true)

      for (let i = 0; i < 4; i++) {
        g.queue = []
        // A term can end in ageUp; the point of the test is the office, so it is put back each year.
        officeJob(g, office)
        ageUp(g)
      }
      officeJob(g, office)
      expect(readTeam(g)?.manager).toBeDefined()
      for (const a of investmentHoldings(g)) expect(MONEY_TYPES).toContain(String(a.details.type))

      const hooks = officeHooks()
      for (const key of KEYS) for (const bullish of [true, false]) expect(hooks.policyWarning(g, key, bullish, 'Test law')).toBe('')
      for (const key of KEYS) for (const bullish of [true, false]) hooks.policyMove(g, key, bullish, 'Test law')
      expect(insiderCases(g)).toHaveLength(0)
      expect(shownFindings(g, 99, true).shown.map((f) => f.id)).not.toContain('insider')
    })
  }
})
