// The module life.debts (R4-L7, A.K8 b, X42, C14): the yearly service of the divorce debts, in the aging seam, money phase, order 75. It runs after
// wealth (70), where the year's income, tax and the family's money have been booked, and before familyUse (80), so a payment is a fifth of the cash
// the player really has at that point of the year. The step is serveDivorceDebts (src/game/divorce-debt.ts): idempotent by the ledger token of the
// year, a no-op on a life the social stamp does not mark, no draw from g.rng. E10b's pass inside `society.acts` serves the loans (kind 0) and this
// one the divorce debts (kind 1), so the two never touch the same debt (X24).
//
// It declares no fact kind and has no pace family. The module id is the entry id the group tables use (hubs/year-plan.ts,
// ui/components/logModel.ts): group people.
//
// This file is layer 4 (assembly) like the rest of modules/; the ModuleDef declares layer 3, the layer of the code it runs.
import { serveDivorceDebts } from '../divorce-debt'
import type { ModuleDef } from '../kernel/registry'

export const debtsModule: ModuleDef = {
  id: 'life.debts',
  layer: 3,
  yearly: [{ seam: 'aging', phase: 'money', order: 75, run: serveDivorceDebts }],
}
