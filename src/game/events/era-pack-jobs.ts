// Which kind of work a life is doing, for the era packs: the popup about a hand caught in a machine
// only makes sense on a factory floor, a building site or a farm, not at a desk.
import { getJobDef, type Industry } from '../data/jobs'
import { earlyJobDef } from '../history/events-jobs'
import type { GameState } from '../types'

const MANUAL: ReadonlySet<Industry> = new Set<Industry>(['factory', 'trades', 'farm', 'fishery', 'trucking', 'smallbiz', 'municipal'])

/** The player's full-time job is manual work (industry or a trade). */
export function jobIsManual(g: GameState): boolean {
  const job = g.character.job
  if (!job || job.category !== 'fulltime') return false
  const def = getJobDef(job.defId) ?? earlyJobDef(job.defId)
  return !!def && MANUAL.has(def.industry)
}

/** The player has a full-time job that is office or shop work. */
export function jobIsDesk(g: GameState): boolean {
  const job = g.character.job
  if (!job || job.category !== 'fulltime') return false
  const def = getJobDef(job.defId) ?? earlyJobDef(job.defId)
  return !!def && !MANUAL.has(def.industry)
}
