// Actor 2.0 sim: the yearly entry the kit runs after the legacy hook has booked its year. The kit's
// settleYear owns the marker, the ranking, the report row and the popup budget; `run` is the year itself.
import { actorJob, masterActing } from './actor'
import { closeYear, stepAwards, stepDry, stepOrphans, stepResiduals, stepWrap } from './actor-pipeline'
import { actorStore, adoptLegacy, type ActorState } from './actor-state'
import { stepTeam } from './actor-team'
import { ACTOR_SPEC, starPower } from './actor-world'
import { syncTenure } from './common'
import type { CareerSim } from './kit/careers'
import { settleYear, type CareerCtx } from './kit/year'

function run(c: CareerCtx<ActorState>, live: boolean): string | void {
  const { g, s } = c
  // The legacy hook already settled this year for a life that hasn't been taken over: adopt it and stop.
  if (!s.migrated) {
    adoptLegacy(g, s)
    s.standing = starPower(g, s)
    return
  }
  // Once the job is gone only what is already earned pays out: residuals, as the legacy hook did for a
  // retired actor, and a film already in post. Unfinished shoots go with the job.
  const job = actorJob(g)
  if (!live || !job) {
    stepResiduals(c)
    stepOrphans(c)
    return
  }
  masterActing(g)
  syncTenure(g, job)
  stepResiduals(c)
  stepTeam(c)
  stepWrap(c)
  stepDry(c)
  stepAwards(c)
  return closeYear(c)
}

export const actorSim: CareerSim = {
  id: 'actor',
  key: 'actor.sim',
  yearly: settleYear({
    career: 'actor',
    store: actorStore,
    incomeLabel: 'Residuals',
    active: (g) => !!actorJob(g),
    run,
    peers: { spec: ACTOR_SPEC, score: starPower },
  }),
}
