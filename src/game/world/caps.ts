// The world's own ceilings (R2, K.6). Every list a shard keeps is cut to one of these when it is read, so a save can never grow
// the world past them, however it got there. A cap is a number someone can change in one place, with a test that names it.

/** Level-of-detail caps: how many rows of each kind the world keeps at full detail (world/lod.ts). */
export const LOD_CAPS = { people: 400, intimate: 80, firms: 60, fullFirms: 20, homes: 150, jobs: 600 } as const

/** Most rows the holdings shard keeps (owner, asset, share). */
export const HOLDING_ROWS_CAP = 1_200

/** Nodes of g.world after normalization: past this a shard is dropped, the largest first (world/state.ts). */
export const WORLD_NODE_CAP = 40_000

/** A pooled row that nobody has touched for this many years is folded back into its pool. */
export const DEMOTE_AFTER_YEARS = 5

/**
 * The frontier's ceilings (R3-F1, world/frontier.ts): a field is at most 12 years ahead of the calendar path and gains at most 2 of
 * them in a year, in all; it holds at most 18 points of public research, and one disclosure adds at most 6; a market keeps 6 rows, a
 * field 4 markets, and there are room for 32 fields (20 today). An older row folds into the field's `fold`, so no lead is lost.
 */
export const FRONTIER_CAPS = { leadYears: 12, yearYears: 2, spillPoints: 18, spillPerDisclosure: 6, rowsPerMarket: 6, marketsPerField: 4, fields: 32 } as const
