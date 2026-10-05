// Activities menu entries owned by the activities module (see docs/ARCHITECTURE.md).
// The implementations live in ./activities/*.ts; this file only assembles the exports
// that menus.ts arranges into the Activities screen.
import { charityMenu } from './activities/charity'
import { emigrateMenu } from './activities/emigrate'
import { identityMenu } from './activities/identity'
import { lawsuitMenu } from './activities/lawsuit'
import { licensesMenu } from './activities/licenses'
import { mindBodyMenu } from './activities/mindBody'
import { prayMenu, surrenderAction, sweepstakesAction } from './activities/misc'
import { moviesMenu, zooMenu } from './activities/movies'
import { nightlifeMenu } from './activities/nightlife'
import { rehabMenu } from './activities/rehab'
import { salonMenu } from './activities/salon'
import { plasticSurgeryMenu } from './activities/surgery'
import { vacationMenu } from './activities/vacation'
import { willMenu } from './activities/will'
import type { MenuNode } from './types'

export { emigrateMenu, licensesMenu, mindBodyMenu, moviesMenu, nightlifeMenu, vacationMenu }

/**
 * The remaining top-level Activities entries (menus.ts sorts everything by label):
 * Charity, Identity, Lawsuit, Plastic Surgery, Pray, Rehab, Salon & Spa, Surrender
 * (only while wanted), Sweepstakes, Will & Testament and the Zoo.
 */
export const miscActivities: MenuNode[] = [
  charityMenu,
  identityMenu,
  lawsuitMenu,
  plasticSurgeryMenu,
  prayMenu,
  rehabMenu,
  salonMenu,
  surrenderAction,
  sweepstakesAction,
  willMenu,
  zooMenu,
]
