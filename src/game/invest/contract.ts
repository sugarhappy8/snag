// What the rest of the game may ask of the market code without importing it (R3-H8, K.2a rule c).
//
// The Financial News (investments.ts, a root file of the `life` domain) shows one analyst line that reads the market's present
// signals. A direct import of invest/signals.ts would be a new cross-domain edge, and the layer baseline only shrinks, so the
// news reaches it through this door: a re-export, with no code of its own.
export { marketRead, marketSignals, type MarketSignal, type SignalKind } from './signals'
