// The CI matrix for the careers: every registered career, steady and reckless, two seeds, ten years, through
// the real yearly loop (see test/career-kit.ts). Each career task adds its setup to CAREER_SETUPS and its
// sim to CAREER_SIMS; the first test keeps the two lists in step. With none registered the matrix is empty.
import { describe, expect, it } from 'vitest'
import { typicalIncome } from '../src/game/events/wealth-core'
import { CAREER_SIMS } from '../src/game/special/kit/careers'
import { assertCareersClean, CAREER_SETUPS, drainCareer, newCareerGame, nextYear, playCareer, type CareerId } from './career-kit'

const SEEDS = [11, 12] as const
const YEARS = 10
const TIMEOUT = 180_000

/** Bookkeeping the kit writes in every settled year whatever the career did: the settle marker and the crisis cool-downs. */
const KIT_BOOKKEEPING = ['rows', 'years', 'settledYear', 'settledAge', 'cool']

it('has a setup for every registered sim', () => {
  expect(Object.keys(CAREER_SETUPS).sort()).toEqual(CAREER_SIMS.map((s) => s.id).sort())
})

for (const id of Object.keys(CAREER_SETUPS) as CareerId[]) {
  describe(`${id} balance`, () => {
    for (const strategy of ['steady', 'reckless'] as const) {
      for (const seed of SEEDS) {
        it(
          `${strategy} seed ${seed} plays ${YEARS} clean years`,
          () => {
            const r = playCareer(id, strategy, YEARS, seed)
            assertCareersClean([r])
            if (strategy === 'steady') {
              expect(r.standingEnd).toBeGreaterThan(5)
              if (r.ended === 'fired') expect(r.years).toBeGreaterThanOrEqual(3) // never fired before year 3
            } else {
              const typical = typicalIncome(newCareerGame(id, seed))
              expect(r.income / Math.max(1, r.years)).toBeLessThan(60 * typical)
            }
          },
          TIMEOUT,
        )
      }
    }

    it(
      'idle leaves the sim record as it was, except the rows, the years, the kit bookkeeping and the calendar the sim keeps itself',
      () => {
        const setup = CAREER_SETUPS[id]!
        const g = newCareerGame(id, SEEDS[0])
        const record = (): unknown => {
          const raw = g.flags[`special.${setup.stateKey}`]
          if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
          const copy: Record<string, unknown> = { ...raw }
          for (const key of [...KIT_BOOKKEEPING, ...(setup.idleMoves ?? [])]) delete copy[key]
          return JSON.parse(JSON.stringify(copy))
        }
        // The first year creates the record. Idle takes no menu action and answers no popup (the queue is simply dropped).
        nextYear(g)
        g.queue = []
        const first = record()
        // A career whose setup has no sim record would compare null to null and pass for nothing.
        expect(first, `${id} has a sim record after its first year`).not.toBeNull()
        let years = 0
        for (let i = 0; i < 5 && g.character.alive && g.character.job?.defId === setup.defId; i++) {
          nextYear(g)
          g.queue = []
          years++
        }
        expect(years, `${id} idles for the five years`).toBe(5)
        expect(record()).toEqual(first)
        drainCareer(g, 'idle', [], []) // an empty queue: nothing to answer
      },
      TIMEOUT,
    )
  })
}
