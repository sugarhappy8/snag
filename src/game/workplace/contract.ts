// What the rest of the game may ask of the ordinary job market without importing it (R2-K6, K.2a rule c).
//
// A few careers end in a normal job: a model who turns photographer is hired the way anyone is, with a company name, an era's pay shape,
// the same entry requirements and the same hiring. Those four live in careers.ts, which imports every special career, so a special
// career that imported them back closed an import cycle. The port is the market seen from a career: careers.ts binds it when it loads.
// Types only, so this file imports nothing at run time but the kernel's port facility.
import { definePort } from '../kernel/ports'
import type { Industry, JobDef } from '../data/jobs'
import type { GameState, InterviewJob, Job } from '../types'

/** The four things a career that ends in an ordinary job needs from the job market. */
export interface OrdinaryJobs {
  /** A made-up employer for this industry in this life's era, drawn from `r`. */
  companyName(g: GameState, industry: Industry, r: () => number): string
  /** How an era scales an industry's pay (1 is today). */
  eraPayShape(year: number, industry: Industry): number
  /** Why you can't take this job yet (education, experience, the era), or null. Pure. */
  jobRequirementProblem(g: GameState, def: JobDef): string | null
  /** Give the player this job, quitting any job in the same slot, and staff it with a boss and coworkers. */
  hireForJob(g: GameState, job: InterviewJob): Job
}

/** The ordinary job market, for careers that end in a normal job. Bound by careers.ts. Unbound: null, and the caller declines. */
export const ordinaryJobs = definePort('workplace.ordinaryJobs', (): OrdinaryJobs | null => null)
