// The module life.kin (R4-L4, D.5 c, X42, C14): the yearly step of the kin records, in the aging seam, life phase, order 37. It runs after
// effort.you (35) and before relationships (40), so a wedding or a baby of this year's familyLifeCycle is looked at next year, and a death
// the family records hold is settled before relationships counts its own. The step is syncKin (src/game/kin.ts): idempotent by the anchors'
// kinY, a no-op on a life the social stamp does not mark, no draw from g.rng. The society phase stays empty and 45 stays free (X2).
//
// Facts it may say: life.wed, life.birth and life.death, at most 8 a year in all (the counter g.yearActions['life.facts'] is shared with
// the estate step of R4-L5). The module id is the entry id the group tables use (hubs/year-plan.ts, ui/components/logModel.ts): group people.
//
// This file is layer 4 (assembly) like the rest of modules/; the ModuleDef declares layer 3, the layer of the code it runs.
import type { ModuleDef } from '../kernel/registry'
import { syncKin } from '../kin'

export const kinModule: ModuleDef = {
  id: 'life.kin',
  layer: 3,
  facts: ['life.wed', 'life.birth', 'life.death'],
  yearly: [{ seam: 'aging', phase: 'life', order: 37, run: syncKin }],
}
