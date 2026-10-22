// R3-H2 (H.1): the one door to the knowledge domain (rule c of the layer ratchet: another domain, a menu of the Fog track or the
// UI imports this file and nothing else of the folder). It grows with the track: H2 puts the estimate core and the mode helpers
// here, H3 the record (what the player researched, in flags.know); the sources and the Look closer rows follow with H4 and H5.
//
// A screen calls it like this:
//   const est = know(g, `mkt:${industry}:${country}:size`, trueSize)
//   text: est.exact ? oldText : `Market size: ${est.words}`
// and tests flip the mode for one call with withInfoMode (never setInfoMode: the suite override beats the player's setting).
export type { Estimate, EstimateOpts, Ladder, StoredRow, Unit } from './types'
export { BAND_Z, SD_MIN, agedSd, estimate, know, mergeReadings, readValue } from './estimate'
export { infoMode, isExact, setInfoOverride, withInfoMode } from './mode'
export type { InfoMode } from './mode'
export { KNOW_FLAG, KNOW_LIMITS, forget, learn, readKnow, storedEstimates, widen } from './record'
export type { KnowRec } from './record'
