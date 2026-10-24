// The "+ Age" button. Advances one year and runs every subsystem's yearly hook in
// a fixed order, then queues this year's flavor lines and random event from the event
// library (a 'yearEvents' task the store resolves right away, see offline.ts).
//
// The hooks are modules (src/game/modules/yearly-aging.ts), run in the order the kernel registry sorts them into
// (kernel/registry.ts YEARLY_PHASES, then each entry's order). `import './modules'` is what guarantees they are registered before
// the first year runs: this file is the entry that loads them.
import { yearlyEntries } from './kernel/registry'
import './modules'
import { erodeCash } from './cash'
import { bindMoneyContext, currentLogYear, formatMoney, log, queueAi, sourceOf, withQueueSource } from './core'
import { economyOf, ensureEconomy, yearlyEconomy } from './economy'
import { sayInflationLoss, settleIncomeTax } from './finance'
import { checkDeath } from './health'
import { writeLifeRow } from './life-series'
import type { GameState } from './types'

export function canAgeUp(g: GameState): boolean {
  return g.character.alive && g.queue.length === 0
}

export function ageUp(g: GameState): void {
  const c = g.character
  if (!c.alive) return
  bindMoneyContext(g)
  // Manual dividends/bonuses arrive after the yearly finance hook. Settle them
  // before discarding the old year's income; already-paid tax is credited.
  const closingTax = settleIncomeTax(g)
  if (closingTax > 0) log(g, `I paid ${formatMoney(closingTax)} in remaining income tax for the year.`)
  // Cash is fixed in local nominal units, unlike wages and real assets. The engine
  // stores purchasing power: erode the opening balance before any new-year income
  // arrives, using the same inflation as the currency display. A redenomination
  // changes display units only and must never be counted as inflation or income.
  ensureEconomy(g)
  c.age += 1
  g.year += 1
  g.yearActions = {}
  g.flags.taxableIncome = 0
  g.flags.taxesPaid = 0
  currentLogYear(g)

  // The economic year boundary precedes every income-producing hook, including history.
  // New-year earnings must not be eroded as though held since the previous birthday.
  yearlyEconomy(g)
  // Shown in today's prices or in dollars the bank visibly shrinks by the year's inflation (billions, for a rich life): finance.ts says so.
  sayInflationLoss(g, -erodeCash(g, economyOf(g).inflation))

  // The life series keeps one row for each age lived, the year of death included (src/game/life-series.ts).
  // Each hook runs under its name, so the lines and popups it makes carry it as `s` (core.ts withLogSource, R3 E.D1).
  for (const e of yearlyEntries('aging')) {
    withQueueSource(g, sourceOf(e.id), () => e.run(g))
    if (!c.alive) {
      writeLifeRow(g)
      return
    }
  }
  checkDeath(g)
  if (!c.alive) {
    writeLifeRow(g)
    return
  }
  writeLifeRow(g)

  // Flavor lines + a random event from the event library (resolved by offline.ts).
  queueAi(g, { type: 'yearEvents' })
}
