// The "+ Age" button. Advances one year and runs every subsystem's yearly hook in
// a fixed order, then queues this year's flavor lines and random event from the event
// library (a 'yearEvents' task the store resolves right away, see offline.ts).
import { yearlyNation } from './nation/yearly'
import { yearlyAssets } from './assets'
import { yearlyBusiness } from './business'
import { yearlyCareer } from './careers'
import { yearlyProfessions } from './professions'
import { yearlyDevelopment } from './development'
import { yearlySharedProjects } from './activities/shared-projects'
import { yearlyGivingFund } from './activities/giving-fund'
import { yearlyComputer } from './computer'
import { bindMoneyContext, currentLogYear, formatMoney, log, queueAi } from './core'
import { yearlyCrime } from './crime'
import { yearlyEducation } from './education'
import { economyOf, ensureEconomy, yearlyEconomy } from './economy'
import { yearlyWealth } from './events/wealth'
import { yearlyWillFeuds } from './events/will-feud'
import { yearlyNepo } from './business/nepo'
import { yearlyFamilyUse } from './shops/luxury-family'
import { settleIncomeTax, yearlyFinance } from './finance'
import { checkDeath, yearlyHealth } from './health'
import { yearlyHousehold } from './household'
import { yearlyHistory } from './history'
import { yearlyDigest } from './history/digest'
import { yearlyImmigration } from './immigration'
import { yearlyWorkshop } from './workshop/yearly'
import { yearlyUnderworld } from './underworld'
import { yearlyCorruption } from './special/corruption'
import { yearlyInvestments } from './investments'
import { yearlyMilestones } from './life'
import { yearlyRelationships } from './relationships'
import { yearlyBackground } from './birth-background'
import { yearlyRoyalty } from './royalty'
import { refreshRoyalCareers } from './npc-lives'
import { yearlyShops } from './shops'
import { yearlySpecial } from './special'
import type { GameState } from './types'

/** Ordered yearly hooks. Each one must be a no-op when it doesn't apply. */
export const YEARLY_HOOKS: [string, (g: GameState) => void][] = [
  ['history', yearlyHistory],
  ['digest', yearlyDigest],
  ['household', yearlyHousehold],
  ['relationships', yearlyRelationships],
  ['sharedProjects', yearlySharedProjects],
  ['givingFund', yearlyGivingFund],
  ['background', yearlyBackground],
  ['royalty', yearlyRoyalty],
  // Royal blood can arrive mid-year (a sibling born after the NPC pass, a child
  // titled by yearlyRoyalty): give them their court life now, as a reload would.
  ['royalCareers', (g) => refreshRoyalCareers(g)],
  ['health', yearlyHealth],
  ['education', yearlyEducation],
  ['professions', yearlyProfessions],
  ['career', yearlyCareer],
  ['special', yearlySpecial],
  // Politics 2.0 (nation/): laws' upkeep, personal taxes under them, the State of the Nation,
  // crises and consequences. After the careers (approval and elections), before the business year.
  ['nation', yearlyNation],
  // Inventions settle last year's sales before 'business' books the fiscal year (company
  // margins go into b.cash + b.yearIncome) and before 'finance' taxes personal royalties.
  ['workshop', yearlyWorkshop],
  ['corruption', yearlyCorruption],
  ['business', yearlyBusiness],
  ['development', yearlyDevelopment],
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
  ['underworld', yearlyUnderworld],
  ['milestones', yearlyMilestones],
]

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
  c.money /= 1 + economyOf(g).inflation

  for (const [, hook] of YEARLY_HOOKS) {
    hook(g)
    if (!c.alive) return
  }
  checkDeath(g)
  if (!c.alive) return

  // Flavor lines + a random event from the event library (resolved by offline.ts).
  queueAi(g, { type: 'yearEvents' })
}
