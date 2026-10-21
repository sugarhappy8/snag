// Opening a place on a sheet (G.9, R1-N7), for the code that lives outside the palette zone: the game screen opens what the
// palette picked and what an inbox link names. Both come as a place (a tab and the ids of the groups below its root), and
// both are resolved against the latest state, the way the "Back to" chip is, so a group that has gone trims the spot to its
// deepest ancestor that is still there. It is kept out of place.ts so that file stays free of modules that import React.
import { personIdOf } from '../../game/hubs/people'
import type { GameState } from '../../game/types'
import { resolveReturnPoint, type ResolvedReturn } from '../components/ReturnChip'
import type { ReturnPoint } from '../store'
import { parsePlaceKey, type PlaceRef } from './place'

/** A place with the person split off: on Relationships the first group id is `person.<id>`, a sheet opens on the person. */
export type OpenablePlace = PlaceRef & { personId?: string }

/**
 * Where a sheet opens for this place right now: the same resolution as the chip (resolveReturnPoint on a made-up return point
 * for this life, age and year). A path that has vanished trims to its deepest valid ancestor, and a person who has left to the
 * Relationships list. No scroll offsets, so the sheet starts at the top. Pure; it reads the state and changes nothing.
 */
export function placeToReopen(g: GameState, p: OpenablePlace): ResolvedReturn {
  const point: ReturnPoint = {
    sheet: p.tab,
    path: [...p.path],
    scrolls: [],
    lifeId: g.lifeId,
    age: g.character.age,
    year: g.year,
  }
  if (p.personId) point.personId = p.personId
  return resolveReturnPoint(g, point)
}

/** The place an inbox link names, or null when the link is not a place (see parsePlaceKey). A leading `person.<id>` becomes the person. */
export function placeOfLink(link: string): OpenablePlace | null {
  const ref = parsePlaceKey(link)
  if (ref === null) return null
  if (ref.tab === 'relationships' && ref.path.length > 0) {
    const person = personIdOf(ref.path[0]!)
    if (person !== null) return { ...ref, path: ref.path.slice(1), personId: person }
  }
  return ref
}
