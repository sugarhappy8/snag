// Era pack: 1946-1979 (see events/era-life.ts). Owned by the era builder for this span.
//
// The postwar rebuild, the baby boom and the first televisions, rock 'n' roll, the Cold War, the
// space race, the sixties, the oil shock and the seventies, as an ordinary life felt them and as
// they looked from Europe, Japan, India, China, Africa, Latin America and Indonesia: flavor lines
// for the log by age and place (era-pack-1946-kids.ts, era-pack-1946-adults.ts) and popup events
// with real trade-offs (era-pack-1946-kidevents.ts, era-pack-1946-adultevents.ts).
import type { EraPack } from './era-life'
import { familyAware } from './era-pack-where'
import { ADULTS_1946 } from './era-pack-1946-adults'
import { ADULT_EVENTS_1946 } from './era-pack-1946-adultevents'
import { KIDS_1946 } from './era-pack-1946-kids'
import { KID_EVENTS_1946 } from './era-pack-1946-kidevents'
import { WORLD_EVENTS_1946 } from './era-pack-1946-worldevents'

export const ERA_PACK_1946: EraPack = {
  from: 1946,
  to: 1979,
  flavor: familyAware([...KIDS_1946, ...ADULTS_1946]),
  events: [...KID_EVENTS_1946, ...ADULT_EVENTS_1946, ...WORLD_EVENTS_1946],
}
