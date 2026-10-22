// What the rest of the game may ask of the market code without importing it (R3-H8 and R3-G9, K.2a rule c).
//
// The Financial News (investments.ts, a root file of the `life` domain) shows one analyst line that reads the market's present
// signals. A direct import of invest/signals.ts would be a new cross-domain edge, and the layer baseline only shrinks, so the
// news reaches it through this door: a re-export, with no code of its own.
//
// R3-G9 (H.8): the same door carries the investing domain's fog (rule c of the layer ratchet). A screen that shows how much a stock,
// a penny stock or a coin swings imports this file and nothing else of invest/swing.ts: investments.ts for a security's own screen,
// and computer/money-stocks.ts for the single-stock bets list.
export { marketRead, marketSignals, type MarketSignal, type SignalKind } from './signals'
export { SWING_WORDS, analystNote, coinVolOf, secTag, stockVolOf, swingKey, swingLook, swingRead, swingRow, swingTruth, swingWord } from './swing'
export type { Fogged, SwingWord } from './swing'
