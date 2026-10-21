// The text kit (E.T1): pick that remembers, hashed presentation picks, the memory in g.flags.textMem and the pool registry.
export { fnv1a, hpick, hunit, mix32, poolHash } from './hash'
export { TEXT_MEM_LIMITS, familyStats, noteFamily, readTextMem, recallPool, rememberPool, ringRead, ringWrite, writableTextMem } from './memory'
export type { PoolRecall, TextMem } from './memory'
export { candidateIndexes, pickLine } from './pick'
export { STATE_LIMITS, bandBy, fillSlots, logBand, stateLine, stateLineWith } from './state'
export { defineLines, linesId, registeredLines } from './registry'
