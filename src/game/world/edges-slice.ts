// The save slice of the edge map (R4-E6b, D.3): where g.world.edges lives in a save. The second entity slice of the game, declared the
// way the first one is (world/met-slice.ts, docs/SAVE.md "An entity record") and the first one a played life writes.
//
// Every other world shard is a derived row of the `world` chunk (kernel/slices.ts sliceOf): the chunk is written again, whole, when any
// one of them changes, about 520 KB after fifty years. The edge map changes on a tap (a relationship moves, a favor is asked, a memory
// is made), so it is declared here as a slice of the chunk `entities`: the codec cuts it into eight records `e.edge.<n>` by a hash of
// the key (save-codec.ts partition and shardOf), and a tap that changes one edge writes that one chunk and the head, and never the world
// chunk. A declared row beats the derived one (sliceOf reads the table first), and the world root keeps its shape 'subkeys'.
//
// The row says what the codec needs and no more:
//
//   key          'world.edges', a sub-slice of the world root, whose placeholder `~world.edges` stays in the head
//   chunk        'entities', in `shards: 8` records of the kind `edge` (`e.edge.0` to `e.edge.7`; with the Met store's eight, 16 of the 96)
//   write        'replace': putEdge (world/edge-write.ts) builds a new root and keeps every untouched entry by identity, so the codec
//                caches the text of a shard by its entries and a tap stringifies one shard. A draft shares the frozen root (save-clone.ts)
//   normalize    normalizeEdges, the same total reader the shard registers with the world: a chunk that gets through the codec's own
//                checks (caps, depth, finite numbers, every key in the shard its hash names) is cut into ranges and caps here, once
//   caps         24,000 nodes and 420,000 characters for all eight records together. The worst case the model can reach is 19,929 nodes
//                (1,200 edges with a link kind and a call-in each, 4,000 memories, the dialogue store on 120 edges, 12 feuds, 40 debts and
//                40 secrets of 6 holders) and about 310,000 characters with 79-character keys and numbers to hundredths (95-character
//                keys add about 19,000). A group past either cap is a lost chunk, `size`, and the other shards still load
//
// The 40 secrets (`secret:<n>`, written by R4-E11) live in the same map, so they share its chunks and its caps.
//
// Keys must ascend in plain code-unit order for the codec to cut the shard (a map that does not rides whole in the world chunk and
// `stats.unsortedEntities` names it): normalizeEdges and putEdge both return them so, and test/world-edge-slice.test.ts asserts it on
// the real map. A `pack: 'shapes'` is not allowed on an entity row (kernel/slices.ts): a shard must stay a record of its own keys.
//
// No `migrate`: version 1 is the first shape. A saved game that has no `edges` key (every save before v5.3.0, and any life the social
// stamp has not touched) has no chunk either. Importing this file declares the row; save-slices.ts imports it beside the Met store's.
import { defineSlice } from '../kernel/slices'
import { normalizeEdges } from './edges'

/** The slice key of the shard. */
export const EDGES_SLICE = 'world.edges'

defineSlice({
  key: EDGES_SLICE,
  version: 1,
  chunk: 'entities',
  entities: { kind: 'edge', shards: 8 },
  caps: { nodes: 24_000, chars: 420_000 },
  normalize: (raw) => normalizeEdges(raw),
  write: 'replace',
})
