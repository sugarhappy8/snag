// A seeded "probe life": an adult founder who owns a few companies and is then aged through the real
// yearly loop. The save-safety work builds its big, busy saves from this one helper (the size probe
// in scripts/save-size.ts, the v2.4.0 fixture, the size test), and the same options always give the
// same life, so the numbers can be compared before and after a change.
//
// No vitest imports here: the same helper runs under vitest and as a bundled node script.
import { ageUp } from '../src/game/aging'
import { installManager, managerCandidate } from '../src/game/business/career'
import { bestPlan } from '../src/game/business/economy'
import { createBusinessAsset, industryProblem, newBiz } from '../src/game/business/founding'
import { bizOf } from '../src/game/business/state'
import { bindMoneyContext } from '../src/game/core'
import { INDUSTRY_IDS } from '../src/game/data/markets'
import { createNewLife } from '../src/game/life'
import type { GameState } from '../src/game/types'

export interface ProbeOptions {
  seed: number
  /** Calendar year of birth (createNewLife's `year`). The founder is made an adult at 30, in birthYear + 30. */
  birthYear: number
  /** Companies owned at 30: distinct industries in INDUSTRY_IDS order, skipping the ones the founder can't run here. */
  businesses: number
  /** Years lived from 30 on, each one through ageUp. The founder may die sooner. */
  years: number
  /**
   * A measurement aid, not a faithful life (default false). The founder never sees a doctor, so few reach
   * 100; with this set, health is put back to 100 and conditions are cleared before every year, and
   * nothing else changes.
   */
  keepAlive?: boolean
  /** Called with 0 before the first year, then 1, 2, ... after each ageUp. Read-only: it must not change the life. */
  onYear?: (g: GameState, yearsPlayed: number) => void
  /**
   * A measurement aid for the 100x ceiling probe (default 1): multiplies the founder's money (5,000,000) and the cash each
   * company starts with (3,000,000), so a life can be run with a hundred times the inputs. A finite number above zero.
   */
  scale?: number
}

export function probeLife(opts: ProbeOptions): GameState {
  const scale = opts.scale ?? 1
  if (!Number.isFinite(scale) || scale <= 0) throw new Error(`probeLife: scale must be a finite number above zero, got ${String(scale)}`)
  const g = createNewLife({ seed: opts.seed, year: opts.birthYear })
  // Grow up instantly, as fuzzBusiness does: an adult with money, smarts and a licence. The calendar
  // moves with the character, because createNewLife's year is the birth year.
  g.queue = []
  g.character.age = 30
  g.year = opts.birthYear + 30
  g.character.money = 5e6 * scale
  g.character.stats.smarts = 75
  g.character.licenses = ['driver']
  bindMoneyContext(g)

  // Companies the way the asset-hooks tests add them: a funded, staffed business with a hired
  // manager and the optimizer's price and production.
  const { countryId, city } = g.character
  let founded = 0
  for (const industry of INDUSTRY_IDS) {
    if (founded === opts.businesses) break
    if (industryProblem(g, industry) !== null) continue
    const opened = g.year - 6
    const b0 = newBiz(g, industry, countryId, city, { cash: 3_000_000 * scale, founded: opened, outlets: [{ countryId, city, count: 6, opened }] })
    const a = createBusinessAsset(g, `Probe ${industry}`, b0, 200_000)
    g.assets.push(a)
    const b = bizOf(g, a)
    installManager(g, b, managerCandidate(g, b, 70))
    const plan = bestPlan(g, b)
    b.price = plan.price
    b.production = plan.production
    founded++
  }
  if (founded < opts.businesses) throw new Error(`probeLife: only ${founded} of ${opts.businesses} industries are open to a founder in ${countryId} in ${g.year}`)

  opts.onYear?.(g, 0)
  for (let y = 0; y < opts.years; y++) {
    g.queue = []
    if (opts.keepAlive) {
      g.character.stats.health = 100
      g.character.conditions = []
    }
    ageUp(g)
    opts.onYear?.(g, y + 1)
  }
  return g
}
