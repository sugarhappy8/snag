// The save slice of the Met shard (R4-S5, D.1 d): where g.world.met lives in a save. The first entity slice of the game.
//
// Every other world shard is a derived row of the `world` chunk (kernel/slices.ts sliceOf): the chunk is written again, whole, when any
// one of them changes, about 520 KB after fifty years. The Met shard changes on a tap (a person met, seen again, owed), so it is
// declared here as a slice of the chunk `entities`: the codec cuts it into eight records `e.met.<n>` by a hash of the sid (save-codec.ts
// partition and shardOf), and a tap that touches one person writes that one chunk and the head, and never the world chunk. A declared
// row beats the derived one (sliceOf reads the table first), and the world root keeps its shape 'subkeys', so nothing else about the
// world moves.
//
// The row says what the codec needs and no more:
//
//   key          'world.met', a sub-slice of the world root, whose placeholder `~world.met` stays in the head
//   chunk        'entities', in `shards: 8` records of the kind `met` (`e.met.0` to `e.met.7`; the grammar of a chunk name allows two digits)
//   write        'replace': writeMet (world/met.ts) builds a new root and keeps every untouched record by identity, so the codec caches the
//                text of a shard by its entries and a tap stringifies one shard. A draft shares the frozen root (save-clone.ts)
//   normalize    normalizeMet, the same total reader the shard registers with the world: a chunk that gets through the codec's own checks
//                (caps, depth, finite numbers, every key in the shard its hash names) is cut into ranges and caps here, once
//   caps         12,000 nodes and 300,000 characters for all eight records together: the shard's worst case is 10,401 nodes (400 records
//                of 22, 200 tombstones of 8 and the root) and about 90,000 characters. A group past either is a lost chunk, `size`
//
// Keys must ascend in plain code-unit order for the codec to cut the shard (a shard that does not rides whole in the world chunk and
// `stats.unsortedEntities` names it): normalizeMet and writeMet both return them so, and test/world-met-save.test.ts asserts it on the
// real shard. A `pack: 'shapes'` is not allowed on an entity row (kernel/slices.ts): a shard must stay a record of its own keys.
//
// No `migrate`: version 1 is the first shape. A saved game that has no `met` key (every save before v5.3.0, and any life the social
// flag has not stamped) has no chunk either. Importing this file declares the row; save-slices.ts imports it beside the economy's.
// E6b declares `world.edges` the same way in its own file and copies this row's shape (docs/SAVE.md, "An entity record").
import { defineSlice } from '../kernel/slices'
import { normalizeMet } from './met'

/** The slice key of the shard. */
export const MET_SLICE = 'world.met'

defineSlice({
  key: MET_SLICE,
  version: 1,
  chunk: 'entities',
  entities: { kind: 'met', shards: 8 },
  caps: { nodes: 12_000, chars: 300_000 },
  normalize: (raw) => normalizeMet(raw),
  write: 'replace',
})
