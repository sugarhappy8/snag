// The yearly hooks of ageUp (R2, K.3 e): one module each, registered with the kernel in the phase and order the old list ran them in.
//
// Until R2 the hooks were an array in aging.ts (YEARLY_HOOKS), and a new subsystem had to edit that array. Now each is a ModuleDef
// with one yearly entry in the `aging` seam, and ageUp walks yearlyEntries('aging'). The sort is (phase, order, module id) from
// kernel/registry.ts YEARLY_PHASES, so the order below is the order the game has always run them in (test/kernel-parity.test.ts holds
// that line against a fixture recorded before this file existed), and a track adds a hook by adding a line here or in its own module
// file, between two of these by choosing an order between theirs. Orders are multiples of 10 for that reason.
//
// Each id is `yearly.<name>`, the name the old list used. Each module has exactly one entry in the seam, so the entry id is the module id.
//
// This file is layer L4 (assembly) and in no import cycle: nothing below L4 imports src/game/modules, so reading the hook functions
// here, at load, is safe (the eager-read scan exempts such a file). aging.ts imports it for the effect and for nothing else.
// The imports keep the order aging.ts had them in, so the modules load in the order they always did (test/hub-entry.test.ts).
import { yearlyNation } from '../nation/yearly'
import { yearlyAssets } from '../assets'
import { yearlyBusiness } from '../business'
import { landRivalWaves } from '../business/tech-waves'
import { yearlyCareer } from '../careers'
import { yearlyProfessions } from '../professions'
import { yearlyDevelopment } from '../development'
import { yearlySharedProjects } from '../activities/shared-projects'
import { yearlyGivingFund } from '../activities/giving-fund'
import { yearlyComputer } from '../computer'
import { yearlyCrime } from '../crime'
import { yearlyEducation } from '../education'
import { yearlyWealth } from '../events/wealth'
import { yearlyWillFeuds } from '../events/will-feud'
import { yearlyNepo } from '../business/nepo'
import { yearlyFamilyUse } from '../shops/luxury-family'
import { yearlyFinance } from '../finance'
import { yearlyHealth } from '../health'
import { yearlyHousehold } from '../household'
import { yearlyHistory } from '../history'
import { yearlyDigest } from '../history/digest'
import { yearlyImmigration } from '../immigration'
import { yearlyWorkshop } from '../workshop/yearly'
import { yearlyUnderworld } from '../underworld'
import { yearlyAdvisors } from '../advisors/year'
import { yearlyCorruption } from '../special/corruption'
import { yearlyHedge } from '../business/hedge-year'
import { yearlyInvestments } from '../investments'
import { yearlyMilestones } from '../life'
import { yearlyRelationships } from '../relationships'
import { yearlyBackground } from '../birth-background'
import { yearlyRoyalty } from '../royalty'
import { refreshRoyalCareers } from '../npc-lives'
import { yearlyShops } from '../shops'
import { yearlySpecial } from '../special'
import type { ModuleDef } from '../kernel/registry'
import type { GameState } from '../types'
import { yearlyWorld } from '../world/yearly'

/** One yearly hook as a module: id `yearly.<name>`, one entry in the aging seam. Each hook must be a no-op when it doesn't apply. */
const hook = (name: string, phase: string, order: number, run: (g: GameState) => void): ModuleDef => ({
  id: `yearly.${name}`,
  layer: 3,
  yearly: [{ seam: 'aging', phase, order, run }],
})

/** The hooks in run order, phase by phase (the table in the R2 Kernel plan, section 2). Exported sorted by id, as MODULES must be. */
const IN_RUN_ORDER: readonly ModuleDef[] = [
  // life
  hook('history', 'life', 10, yearlyHistory),
  hook('digest', 'life', 20, yearlyDigest),
  hook('household', 'life', 30, yearlyHousehold),
  hook('relationships', 'life', 40, yearlyRelationships),
  hook('sharedProjects', 'life', 50, yearlySharedProjects),
  hook('givingFund', 'life', 60, yearlyGivingFund),
  hook('background', 'life', 70, yearlyBackground),
  hook('royalty', 'life', 80, yearlyRoyalty),
  // Royal blood can arrive mid-year (a sibling born after the NPC pass, a child
  // titled by yearlyRoyalty): give them their court life now, as a reload would.
  hook('royalCareers', 'life', 90, (g) => refreshRoyalCareers(g)),
  hook('health', 'life', 100, yearlyHealth),
  hook('education', 'life', 110, yearlyEducation),
  hook('professions', 'life', 120, yearlyProfessions),
  // careers
  hook('career', 'careers', 10, yearlyCareer),
  hook('special', 'careers', 20, yearlySpecial),
  // government. Politics 2.0 (nation/): laws' upkeep, personal taxes under them, the State of the Nation,
  // crises and consequences. After the careers (approval and elections), before the business year.
  hook('nation', 'government', 10, yearlyNation),
  // firms. Inventions settle last year's sales before 'business' books the fiscal year (company
  // margins go into b.cash + b.yearIncome) and before 'finance' taxes personal royalties.
  hook('workshop', 'firms', 10, yearlyWorkshop),
  hook('corruption', 'firms', 20, yearlyCorruption),
  hook('business', 'firms', 30, yearlyBusiness),
  // Rival breakthroughs land after the business year, only for years after the present one (business/tech-waves.ts).
  hook('techWaves', 'firms', 40, landRivalWaves),
  // money
  hook('development', 'money', 10, yearlyDevelopment),
  hook('investments', 'money', 20, yearlyInvestments),
  // Personal and Family hedge funds book their year and queue one popup (business/hedge-year.ts).
  hook('hedge', 'money', 30, yearlyHedge),
  hook('shops', 'money', 40, yearlyShops),
  hook('computer', 'money', 50, yearlyComputer),
  hook('finance', 'money', 60, yearlyFinance),
  hook('wealth', 'money', 70, yearlyWealth),
  hook('familyUse', 'money', 80, yearlyFamilyUse),
  hook('nepo', 'money', 90, yearlyNepo),
  hook('willFeuds', 'money', 100, yearlyWillFeuds),
  // assets
  hook('immigration', 'assets', 10, yearlyImmigration),
  hook('assets', 'assets', 20, yearlyAssets),
  hook('crime', 'assets', 30, yearlyCrime),
  hook('underworld', 'assets', 40, yearlyUnderworld),
  // advisors. The money team bills and trades last, so its cash is what is left after rent, tax and upkeep.
  hook('advisors', 'advisors', 10, yearlyAdvisors),
  // close
  hook('milestones', 'close', 10, yearlyMilestones),
  // settle. The world indexes what the year closed on, last: nothing after it books money or changes a record (world/yearly.ts).
  hook('world', 'settle', 10, yearlyWorld),
]

export const YEARLY_AGING: readonly ModuleDef[] = [...IN_RUN_ORDER].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
