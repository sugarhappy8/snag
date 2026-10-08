// Era life: what an ordinary year felt like in a given decade and country, beyond the world
// headlines (history/events*.ts) and the tech gates (history/timeline.ts). Era packs add
//   - flavor lines for the life log ("I spent the summer at the drive-in", "my pager buzzed in the
//     middle of maths"),
//   - random-event popups that only make sense then (a polio scare, a fall-out shelter drill, the
//     Walkman craze, dial-up screeching, the dot-com layoffs, a school shooting-free ordinary
//     lockdown drill...), written with real brands and real cultural touchstones where they help,
//   - era-specific rules of daily life (what a teen did on a Saturday night, how people dated,
//     what a first job paid, what school discipline looked like), told with tact.
// Packs live in events/era-pack-*.ts, one file per span of years, each exporting an EraPack.
// events.ts adds every pack's events to EVENT_LIBRARY, and events/flavor.ts mixes every pack's
// lines into the pools for the years and countries it covers (weight is the pack's strength).
import type { GameState } from '../types'
import type { EventDef } from './helpers'
import { ERA_PACK_1900 } from './era-pack-1900'
import { ERA_PACK_1946 } from './era-pack-1946'
import { ERA_PACK_1980 } from './era-pack-1980'
import { ERA_PACK_2000 } from './era-pack-2000'

export interface EraFlavorPool {
  key: string
  /** Lines with the usual tokens and @-gates (see events/era.ts and events/flavor.ts). */
  lines: readonly string[]
  /** Relative strength among the year's pools (the generic pools are 3-10). */
  weight: number
  /** Inclusive year range this pool applies to (the pack's span by default). */
  from?: number
  to?: number
  /** Ages it applies to. */
  minAge?: number
  maxAge?: number
  /** Extra gate (country, wealth, etc.). */
  when?: (g: GameState) => boolean
}

export interface EraPack {
  /** Span the pack covers (inclusive). */
  from: number
  to: number
  /** Log lines. */
  flavor: EraFlavorPool[]
  /** Popup events (ids must be unique and start with 'era.'). Gate by year with `when`. */
  events: EventDef[]
}

export const ERA_PACKS: readonly EraPack[] = [ERA_PACK_1900, ERA_PACK_1946, ERA_PACK_1980, ERA_PACK_2000]

/** Every era pack's popup events (events.ts adds these to EVENT_LIBRARY). */
export const ERA_LIFE_EVENTS: EventDef[] = ERA_PACKS.flatMap((p) => p.events)

/** Flavor pools that apply to this life right now (events/flavor.ts mixes them into poolsFor). */
export function eraFlavorPools(g: GameState): { key: string; lines: readonly string[]; weight: number }[] {
  const age = g.character.age
  const out: { key: string; lines: readonly string[]; weight: number }[] = []
  for (const pack of ERA_PACKS) {
    if (g.year < pack.from || g.year > pack.to) continue
    for (const p of pack.flavor) {
      if (g.year < (p.from ?? pack.from) || g.year > (p.to ?? pack.to)) continue
      if (p.minAge !== undefined && age < p.minAge) continue
      if (p.maxAge !== undefined && age > p.maxAge) continue
      if (p.when && !p.when(g)) continue
      out.push({ key: `era:${p.key}`, lines: p.lines, weight: p.weight })
    }
  }
  return out
}
