// Inventor 2.0 — The Workshop. Everyone can tinker from age 8; the Inventor talent (or Main
// Character Syndrome) makes you a genius. See docs/INVENTOR-CAREER.md.
export { ALL_IDEAS, CATEGORIES, HISTORY, IDEAS, catalogIdea, type Category, type IdeaDef } from './catalog'
export { readWorkshop, mutWorkshop, inventions, findInvention, candidates, isGenius } from './notebook'
export { readInv, migrateLegacy, legacyPatents, needsMigration } from './migrate'
export { legacyInventionCapital, legacyInventionStock } from './legacy-capital'
export { brainstorm, buildOdds, buildWhy, resolveBuild, startBuild } from './build'
export { acceptOffer, filePatent, giveAway, license, makeInCompany, pitch, runCrowd, sellStream, shopRights } from './launch'
export { yearlyWorkshop, settleInventions } from './yearly'
export { workshopMenu, inventionNodes, inventionSubtitle } from './menu'
export { rankOf, type Inv, type Workshop } from './state'
