// Career kit, registry: the careers that run on the kit, one entry each, in alphabetical order. special.ts
// runs `yearlyCareerSims` once a year, after the legacy hooks have booked their year. A new career adds
// one import and one entry here; the kit imports no career file, so `CAREER_SIMS` is filled by the
// careers' own tasks.
import type { GameState } from '../../types'
import { actorSim } from '../actor-sim'
import { astronautSim } from '../astronaut-sim'
import { musicSim } from '../music-sim'

export interface CareerSim {
  id: string
  /** The record's store key, `<id>.sim`: the flag is `special.<key>`. */
  key: string
  /** A settleYear hook: a pure no-op without the job and a record. */
  yearly: (g: GameState) => void
}

export const CAREER_SIMS: readonly CareerSim[] = [actorSim, astronautSim, musicSim]

/** Runs each sim in order, stopping as soon as the character is dead. */
export function yearlyCareerSims(g: GameState, sims: readonly CareerSim[] = CAREER_SIMS): void {
  for (const sim of sims) {
    if (!g.character.alive) return
    sim.yearly(g)
  }
}
