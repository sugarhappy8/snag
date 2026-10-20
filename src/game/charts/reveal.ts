// What a chart shows is a question of what the player knows. In R1 they know everything the books say, so this is the
// identity. R3's knowledge system replaces the body (hiding or blurring what the player has not learned yet); every
// builder already passes its spec through here, so nothing else changes then.
import type { ChartSpec } from './spec'

export function reveal<T extends ChartSpec>(spec: T): T {
  return spec
}
