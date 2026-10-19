// Silicon 2.0: the chip lines a semiconductor company sells. A pure leaf (no imports at all), so
// deeptech-state.ts can read it to validate the lane ids a save holds.
//
// A lane is a line of the chip business with its own price. Lanes share one abstract unit, one unit
// cost, one capacity pool and one elasticity; what differs is whether the lane exists, what share of
// unit demand it carries, and how exposed it is to the 2024-2027 squeeze.

export type ChipLaneId = 'core' | 'gfx' | 'cpu' | 'mem' | 'accel'

export interface ChipLane {
  id: ChipLaneId
  label: string
  /** The slider label, e.g. 'accelerators'. */
  noun: string
  /** First fiscal year the lane can exist. */
  from: number
  /** Commercial stage it needs (deeptech-data STAGES). */
  stage: number
  /** Fabs it needs (TechState.plant), 0 when none. */
  plant?: number
  /** A finished program it needs. */
  needs?: string
  /** Share of unit demand it carries when open. `core` stores the least it ever keeps; its live weight is 1 minus the open extras. */
  weight: number
  /** How hard the squeeze hits the lane, 0 to 1. */
  shortage: number
}

export const CHIP_LANES: readonly ChipLane[] = [
  { id: 'core', label: 'General chips', noun: 'general chips', from: 0, stage: 1, weight: 0.25, shortage: 0 },
  { id: 'gfx', label: 'Consumer graphics', noun: 'graphics chips', from: 1995, stage: 2, weight: 0.2, shortage: 0.4 },
  { id: 'cpu', label: 'Data-center CPUs', noun: 'server CPUs', from: 2000, stage: 2, weight: 0.15, shortage: 0 },
  { id: 'mem', label: 'Memory', noun: 'memory', from: 1970, stage: 2, plant: 1, weight: 0.15, shortage: 0.5 },
  { id: 'accel', label: 'Data-center accelerators', noun: 'accelerators', from: 2023, stage: 2, needs: 'aiChip', weight: 0.25, shortage: 1 },
]

/** In the squeeze, street prices run this much above list on a lane with `shortage` 1. Moves the reference only, never demand or revenue. */
export const SHORTAGE_MARKUP = 0.12

/** Can this lane exist for a company in a fiscal year? Pure. */
export function laneOpen(lane: ChipLane, t: { stage: number; plant: number; done: readonly string[] }, year: number): boolean {
  return year >= lane.from && t.stage >= lane.stage && t.plant >= (lane.plant ?? 0) && (!lane.needs || t.done.includes(lane.needs))
}

export function laneById(id: string): ChipLane | undefined {
  return CHIP_LANES.find((l) => l.id === id)
}
