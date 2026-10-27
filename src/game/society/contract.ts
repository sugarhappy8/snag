// The society domain's one door (R4-E9, X26, C39). Another domain reaches society/ only through this file: an import of a contract file
// is not counted by the domain rule (test/layers-domains.test.ts), so events/, business/ and shops/ call the family-act budget from here.
// Every task that adds a society function adds its own export line below, in sorted order (cross-check section 2):
//
//   E9    useFamilyAct, familyLive, familyRoom   the budget (society/budget.ts), and liveFeuds, openDebts (world/edges.ts, E6a's counts)
//   E10a  socialNodes, runAct                    E10b  debtsOf, serviceDebt, DEBT_KIND, debtToken (society/debt.ts)
//   E11   betray, reconcileOdds                  E14   isBound (world/edge-bound.ts, layer 2: the edge held by its own fields or by a person, C4)
//
// This file imports nothing from events/ or business/. See docs/ARCHITECTURE.md ("Society") and docs/SOCIAL.md.
export { runAct } from './acts'
export type { ActCtx, ActPart, ActPatch, ActSide, MoneyLine, SocialAct } from './acts'
export { familyLive, familyRoom, useFamilyAct } from './budget'
export type { FamilySource } from './budget'
export { socialNodes } from './menu'
export { DEBT_KIND, debtToken, debtsOf, serviceDebt } from './debt'
export type { DebtRow, DebtTokenKind } from './debt'
export { liveFeuds, openDebts } from '../world/edges'
export { isBound } from '../world/edge-bound'
