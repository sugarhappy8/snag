// R3-G7 (H.6): the one door to the odds helper (rule c of the layer ratchet: another domain imports this file and nothing else of
// the folder). A screen prints a chance like this:
//
//   const key = oddsKey(asset.id, 'capex')
//   text: `needs the board (${oddsRead(g, key, passOdds(...))} to pass)`
//
// Importing it also binds the reveal policy the research lines read (effort/hooks.ts), so any screen that shows odds has the
// rule in force.
export {
  RESEARCH_ODDS,
  chanceRead,
  evidenceRead,
  evidenceWord,
  exactOddsText,
  hasOddsRead,
  oddsKey,
  oddsLean,
  oddsLook,
  oddsPolicy,
  oddsRead,
  oddsShown,
  oddsView,
  oddsWord,
  registerOddsOwner,
} from './odds'
export type { EvidenceWord, OddsOwner, OddsView, OddsWord } from './odds'
