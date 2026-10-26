// The world's own ceilings (R2, K.6). Every list a shard keeps is cut to one of these when it is read, so a save can never grow
// the world past them, however it got there. A cap is a number someone can change in one place, with a test that names it.

/** Level-of-detail caps: how many rows of each kind the world keeps at full detail (world/lod.ts). */
export const LOD_CAPS = { people: 400, intimate: 80, firms: 60, fullFirms: 20, homes: 150, jobs: 600 } as const

/** Most rows the holdings shard keeps (owner, asset, share). */
export const HOLDING_ROWS_CAP = 1_200

/**
 * Nodes of g.world after normalization (world/state.ts normalizeWorld): past this, whole shards are dropped in the fixed order of
 * WORLD_DROP_FIRST and WORLD_KEEP_LAST below. R4-P2 raised it from 40,000 to 80,000 (cross-check X47).
 *
 * The arithmetic, by the caps in code, with every list at its cap at once (a worst case, not a life):
 *
 *   the shards of v5.2.0 (ledger, holdings, the three indexes, lod, facts, frontier)   about 19,000
 *   met    400 records x 22 nodes + 200 tombstones x 8 + the map root                    10,401
 *   edges  9,600 base + 1,200 memory arrays + 4,000 memories + 1,920 reserved + 300      about 17,000
 *   the secrets (40 x 14, they live in the edges map) and social                           about 580
 *                                                                                         ---------
 *   the end of R4                                                                         about 47,000
 *   + R5 6,000 + R6 6,000 (WORLD_ALLOTMENT)                                               about 59,000
 *
 * The old cap of 40,000 was passed by R4 alone, and the largest shard is `edges`: every debt and memory would have gone with it. At
 * 80,000 the end of R6 still leaves a quarter of the cap free, and the budget meter (WORLD_BUDGET in world/budget.ts, 55,000 nodes
 * and 800,000 bytes) warns long before the cap is near. A release that needs more raises the cap and its row in the allotment in one
 * commit, with the arithmetic here.
 */
export const WORLD_NODE_CAP = 80_000

/**
 * What each release may add to the world, in nodes, worst case (R4-P2, X47). R4 is met, edges, secrets and social (about 28,000 by
 * the caps; 29,000 with the room for the heirs' `Person.data` keys); R5 and R6 add their own on top. The sum with the shards of v5.2.0
 * (about 19,000) stays under WORLD_NODE_CAP, and test/world-budget.test.ts pins it with `met` and `edges` at their caps.
 */
export const WORLD_ALLOTMENT = { r4: 29_000, r5: 6_000, r6: 6_000 } as const

/**
 * Over WORLD_NODE_CAP the shards go in a fixed order, and normalizeWorld stops as soon as the world fits. First these: the indexes
 * and the news. The next world step rebuilds `people`, `firms` and `homes` from the records they list, `lod` is a counter, `facts` is
 * a short history and `frontier` is bounded by its own reader; losing one costs a year of detail and no money.
 */
export const WORLD_DROP_FIRST: readonly string[] = Object.freeze(['facts', 'frontier', 'lod', 'people', 'firms', 'homes'])

/**
 * Never dropped while any other shard can go: the books (`ledger`), who owns what (`holdings`), who the player has met (`met`), what
 * people owe and remember (`edges`) and the stamp of a social life (`social`). Every other shard, one of a later release included,
 * goes between the two lists. Inside a class the largest goes first, ties by name.
 */
export const WORLD_KEEP_LAST: readonly string[] = Object.freeze(['ledger', 'holdings', 'met', 'edges', 'social'])

/** A pooled row that nobody has touched for this many years is folded back into its pool. */
export const DEMOTE_AFTER_YEARS = 5

/**
 * The frontier's ceilings (R3-F1, world/frontier.ts): a field is at most 12 years ahead of the calendar path and gains at most 2 of
 * them in a year, in all; it holds at most 18 points of public research, and one disclosure adds at most 6; a market keeps 6 rows, a
 * field 4 markets, and there are room for 32 fields (20 today). An older row folds into the field's `fold`, so no lead is lost.
 */
export const FRONTIER_CAPS = { leadYears: 12, yearYears: 2, spillPoints: 18, spillPerDisclosure: 6, rowsPerMarket: 6, marketsPerField: 4, fields: 32 } as const

/**
 * The edge model's ceilings (R4-E6a, world/edges.ts). The edges map keeps at most 1,200 edges and 40 secrets; an edge keeps 8 memories
 * and the whole map 4,000; at most 120 edges hold the dialogue store (`n`, `d`), 12 hold a feud rung (`q`) and 40 a debt (`dv`); a
 * secret has 6 holders. Over a cap the normalizer cuts by salience (the most salient kept, an edge that is bound last to go), so a
 * save can never hold more, however it got there.
 *
 * The worst case in nodes, every cap reached at once and a link kind and a call-in stamp on every edge: 1 + 9,600 (an edge and its seven
 * numbers) + 2,400 (`k`, `c`) + 1,200 (memory arrays) + 4,000 (memories) + 1,920 (`n`, `d`) + 288 (`q`, `dv`) = 19,409 nodes, plus 520
 * for 40 full secrets. The allotment of about 17,000 in the comment above leaves `k` and `c` out; test/world-edges.test.ts counts the
 * map and pins both figures. The slice of E6b (`world.edges`, 24,000 nodes) and the world cap hold the larger one.
 */
export const EDGE_CAPS = { edges: 1200, memPerEdge: 8, memTotal: 4000, talkEdges: 120, feuds: 12, debts: 40, secrets: 40, holders: 6 } as const
