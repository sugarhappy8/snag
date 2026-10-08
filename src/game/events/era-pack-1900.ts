// Era pack: 1900-1945 (see events/era-life.ts). Owned by the era builder for this span.
//
// The decades of horse and cart, the first motor cars, the Great War, the Roaring Twenties, the
// Depression and the Second World War, as an ordinary life felt them: flavor lines for the log by
// age and place (era-pack-1900-kids.ts, era-pack-1900-adults.ts) and popup events with real
// trade-offs (era-pack-1900-kidevents.ts, era-pack-1900-adultevents.ts, and
// era-pack-1900-worldevents.ts for lives outside the industrial West).
import type { EraPack } from './era-life'
import { familyAware } from './era-pack-where'
import { ADULTS_1900 } from './era-pack-1900-adults'
import { ADULT_EVENTS_1900 } from './era-pack-1900-adultevents'
import { KIDS_1900 } from './era-pack-1900-kids'
import { KID_EVENTS_1900 } from './era-pack-1900-kidevents'
import { WORLD_EVENTS_1900 } from './era-pack-1900-worldevents'

export const ERA_PACK_1900: EraPack = {
  from: 1900,
  to: 1945,
  flavor: familyAware([...KIDS_1900, ...ADULTS_1900]),
  events: [...KID_EVENTS_1900, ...ADULT_EVENTS_1900, ...WORLD_EVENTS_1900],
}
