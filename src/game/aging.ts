// The "+ Age" button. Advances one year and runs every subsystem's yearly hook in
// a fixed order, then queues this year's flavor lines and random event from the event
// library (a 'yearEvents' task the store resolves right away, see offline.ts).
import { yearlyAssets } from './assets'
import { yearlyBusiness } from './business'
import { yearlyCareer } from './careers'
import { yearlyComputer } from './computer'
import { bindMoneyContext, currentLogYear, queueAi } from './core'
import { yearlyCrime } from './crime'
import { yearlyEducation } from './education'
import { yearlyWealth } from './events/wealth'
import { yearlyWillFeuds } from './events/will-feud'
import { yearlyNepo } from './business/nepo'
import { yearlyFamilyUse } from './shops/luxury-family'
import { yearlyFinance } from './finance'
import { checkDeath, yearlyHealth } from './health'
import { yearlyHistory } from './history'
import { yearlyImmigration } from './immigration'
import { yearlyInvestments } from './investments'
import { yearlyMilestones } from './life'
import { yearlyRelationships } from './relationships'
import { yearlyShops } from './shops'
import { yearlySpecial } from './special'
import type { GameState } from './types'

/** Ordered yearly hooks. Each one must be a no-op when it doesn't apply. */
export const YEARLY_HOOKS: [string, (g: GameState) => void][] = [
  ['history', yearlyHistory],
  ['relationships', yearlyRelationships],
  ['health', yearlyHealth],
  ['education', yearlyEducation],
  ['career', yearlyCareer],
  ['special', yearlySpecial],
  ['business', yearlyBusiness],
  ['investments', yearlyInvestments],
  ['shops', yearlyShops],
  ['computer', yearlyComputer],
  ['finance', yearlyFinance],
  ['wealth', yearlyWealth],
  ['familyUse', yearlyFamilyUse],
  ['nepo', yearlyNepo],
  ['willFeuds', yearlyWillFeuds],
  ['immigration', yearlyImmigration],
  ['assets', yearlyAssets],
  ['crime', yearlyCrime],
  ['milestones', yearlyMilestones],
]

export function canAgeUp(g: GameState): boolean {
  return g.character.alive && g.queue.length === 0
}

export function ageUp(g: GameState): void {
  const c = g.character
  if (!c.alive) return
  bindMoneyContext(g)
  c.age += 1
  g.year += 1
  g.yearActions = {}
  g.flags.taxableIncome = 0
  currentLogYear(g)

  for (const [, hook] of YEARLY_HOOKS) {
    hook(g)
    if (!c.alive) return
  }
  checkDeath(g)
  if (!c.alive) return

  // Flavor lines + a random event from the event library (resolved by offline.ts).
  queueAi(g, { type: 'yearEvents' })
}
