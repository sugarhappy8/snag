// R3-G11 (H.11): the one door to the hint lens (rule c of the layer ratchet: a domain imports this file and nothing else of
// the folder). Importing it loads the lens, which binds the port talents.hintLens.
//
//   lensHint(g, id, text)    the text of a purple hint as the talent reads it (Exact: the text; Realistic: the figures after
//                            "about" fogged, and a percent that says it is a chance, honest and stable)
//   hintPct(p), hintLead()   what a hint site writes for a chance its words cannot mark (an emoji list): "12%" in Exact, "about 12%" in
//                            Realistic, which the lens reads once
//   rankNoise(g, key, v)     the value markBest ranks an option by (Exact: v; Realistic: the talent's reading of v)
//   maskFigures(text)        the text with every figure replaced by '#': the words of a hint or a label, for a key that must not
//                            change when a number does
export { hintLead, hintPct, lensHint, maskFigures, rankNoise } from './lens'
