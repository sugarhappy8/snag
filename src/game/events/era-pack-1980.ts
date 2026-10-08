// Era pack: 1980-1999 (see events/era-life.ts). Owned by the late-era builder.
// The flavor pools live in era-pack-1980-*.ts by age band, the popups in era-pack-1980-events.ts.
import { ownerPools } from './era-late-kit'
import type { EraFlavorPool, EraPack } from './era-life'
import { ADULT_LOCAL_POOLS_1980, ADULT_POOLS_1980 } from './era-pack-1980-adult'
import { CHILD_LOCAL_POOLS_1980, CHILD_POOLS_1980 } from './era-pack-1980-child'
import { EVENTS_1980_YOUTH } from './era-pack-1980-events'
import { EVENTS_1980_LIFE } from './era-pack-1980-events-life'
import { TEEN_LOCAL_POOLS_1980, TEEN_POOLS_1980 } from './era-pack-1980-teen'

/** The same pool with its weight scaled (generic year pools weigh 3-10, so the decade stays a flavor, not a flood). */
const boost = (k: number) => (p: EraFlavorPool): EraFlavorPool => ({ ...p, weight: Math.round(p.weight * k * 10) / 10 })

export const ERA_PACK_1980: EraPack = {
  from: 1980,
  to: 1999,
  flavor: ownerPools([
    ...[...CHILD_POOLS_1980, ...TEEN_POOLS_1980, ...ADULT_POOLS_1980].map(boost(1.5)),
    // Where you lived colors the decade more than anything: local pools weigh double.
    ...[...CHILD_LOCAL_POOLS_1980, ...TEEN_LOCAL_POOLS_1980, ...ADULT_LOCAL_POOLS_1980].map(boost(2.2)),
  ]),
  events: [...EVENTS_1980_YOUTH, ...EVENTS_1980_LIFE],
}
