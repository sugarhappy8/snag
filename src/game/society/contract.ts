// The society domain's one door (R4-E9, X26, C39). Another domain reaches society/ only through this file: an import of a contract file
// is not counted by the domain rule (test/layers-domains.test.ts), so events/, business/ and shops/ call the family-act budget from here.
// Every task that adds a society function adds its own export line below, in sorted order (cross-check section 2):
//
//   E9    useFamilyAct, familyLive, familyRoom   the budget (society/budget.ts), and liveFeuds, openDebts (world/edges.ts, E6a's counts)
//   E10a  socialNodes, runAct                    E10b  debtsOf, serviceDebt, DEBT_KIND, debtToken
//   E11   betray, reconcileOdds                  E14   isBound
//
// This file imports nothing from events/ or business/. See docs/ARCHITECTURE.md ("Society") and docs/SOCIAL.md.
export { familyLive, familyRoom, useFamilyAct } from './budget'
export type { FamilySource } from './budget'
export { liveFeuds, openDebts } from '../world/edges'
