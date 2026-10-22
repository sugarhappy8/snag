// R3-G11 (H.11): the one door to the hint lens (rule c of the layer ratchet: business/util.ts and the tests import this file and
// nothing else of the folder). Importing it loads the lens, which binds the port talents.hintLens.
//
//   lensHint(g, id, text)    the text of a purple hint as the talent reads it (Exact: the text; Realistic: the figures after
//                            "about" fogged, honest and stable)
//   rankNoise(g, key, v)     the value markBest ranks an option by (Exact: v; Realistic: the talent's reading of v)
//   maskFigures(text)        the text with every figure replaced by '#': the words of a hint or a label, for a key that must not
//                            change when a number does
export { lensHint, maskFigures, rankNoise } from './lens'
