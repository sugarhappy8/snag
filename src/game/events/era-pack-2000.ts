// Era pack: 2000-2026 (see events/era-life.ts). Owned by the late-era builder.
// The flavor pools live in era-pack-2000-*.ts by age band, the popups in era-pack-2000-events*.ts.
import { ownerPools } from './era-late-kit'
import type { EraFlavorPool, EraPack } from './era-life'
import { ADULT_LOCAL_POOLS_2000, ADULT_POOLS_2000 } from './era-pack-2000-adult'
import { CHILD_LOCAL_POOLS_2000, CHILD_POOLS_2000 } from './era-pack-2000-child'
import { EVENTS_2000_CULTURE } from './era-pack-2000-events'
import { EVENTS_2000_LIFE } from './era-pack-2000-events-life'
import { TEEN_LOCAL_POOLS_2000, TEEN_POOLS_2000 } from './era-pack-2000-teen'

/** The same pool with its weight scaled (generic year pools weigh 3-10, so the decade stays a flavor, not a flood). */
const boost = (k: number) => (p: EraFlavorPool): EraFlavorPool => ({ ...p, weight: Math.round(p.weight * k * 10) / 10 })

export const ERA_PACK_2000: EraPack = {
  from: 2000,
  to: 2026,
  flavor: ownerPools([
    ...[...CHILD_POOLS_2000, ...TEEN_POOLS_2000, ...ADULT_POOLS_2000].map(boost(1.5)),
    // Where you lived colors the decade more than anything: local pools weigh double.
    ...[...CHILD_LOCAL_POOLS_2000, ...TEEN_LOCAL_POOLS_2000, ...ADULT_LOCAL_POOLS_2000].map(boost(2.2)),
  ]),
  events: [...EVENTS_2000_CULTURE, ...EVENTS_2000_LIFE],
}
