// Activities menu entries owned by the activities module (see docs/ARCHITECTURE.md).
// The implementations live in ./activities/*.ts; this file only assembles the exports
// that menus.ts arranges into the Activities screen.
import { charityMenu } from './activities/charity'
import { emigrateMenu } from './activities/emigrate'
import { identityMenu } from './activities/identity'
import { lawsuitMenu } from './activities/lawsuit'
import { licensesMenu } from './activities/licenses'
import { mindBodyMenu } from './activities/mindBody'
import { prayMenu, surrenderAction, surrenderLifeAction, sweepstakesAction } from './activities/misc'
import { moviesMenu, zooMenu } from './activities/movies'
import { nightlifeMenu } from './activities/nightlife'
import { pastimesMenu } from './activities/pastimes'
import { rehabMenu } from './activities/rehab'
import { salonMenu } from './activities/salon'
import { plasticSurgeryMenu } from './activities/surgery'
import { vacationMenu } from './activities/vacation'
import { willMenu } from './activities/will'
import type { MenuNode } from './types'

export { emigrateMenu, licensesMenu, mindBodyMenu, moviesMenu, nightlifeMenu, vacationMenu }

/** "Surrender": end this life. menus.ts pins it to the very bottom of Activities. */
export { surrenderLifeAction }

/**
 * The remaining top-level Activities entries (menus.ts sorts everything by label):
 * Charity, Hang Out, Identity, Lawsuit, Plastic Surgery, Pray, Rehab, Salon & Spa, Sweepstakes,
 * Turn Yourself In (only while wanted), Will & Testament and the Zoo.
 */
export const miscActivities: MenuNode[] = [
  charityMenu,
  identityMenu,
  lawsuitMenu,
  pastimesMenu,
  plasticSurgeryMenu,
  prayMenu,
  rehabMenu,
  salonMenu,
  surrenderAction,
  sweepstakesAction,
  willMenu,
  zooMenu,
]
