// The registration hub for the world's own shards (R2). A shard names itself and gives the reader that makes its saved form safe;
// a shard that is not registered is dropped by normalizeWorld. Each later shard task appends one line here.
//
// The hub lives apart from world/state.ts on purpose: every shard module imports state.ts, so state.ts importing a shard module
// would be a two-module cycle. A test or module that calls normalizeWorld or worldShard imports this file for its effect.
import { normalizeLedger } from '../kernel/ledger'
import { registerShard } from './state'

registerShard('ledger', { normalize: (raw) => normalizeLedger(raw) })
