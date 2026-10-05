// Who runs the company: the owner as CEO (a special-category Job) or a hired general manager.
import { count, endJob, log } from '../core'
import { marketOf } from '../data/markets'
import { randInt } from '../rng'
import type { Asset, GameState, Job } from '../types'
import { randomFirstName, randomLastName } from '../world'
import { localEcon, niceAmount } from './economy'
import { ceoJob, OWNER_JOB, readBiz, totalOutlets, type BizState, type Manager } from './state'
import { clampN } from './util'

/** A sensible yearly salary for whoever runs a company of this size in its market. */
export function ceoPayNorm(b: BizState): number {
  const e = localEcon(b.industry, b.countryId, b.city)
  const base = Math.max(e.wage * 1.6, e.m.minWage * 2, 12_000)
  const revenue = b.last?.revenue ?? 0
  const size = 1 + Math.log10(1 + totalOutlets(b)) + Math.max(0, Math.log10(Math.max(1, revenue) / 1e6))
  return niceAmount(clampN(base * size, 8_000, 25_000_000))
}

/** The most the board (or the tax office) will let you pay yourself. */
export function maxOwnerSalary(b: BizState): number {
  const norm = ceoPayNorm(b)
  const revenue = Math.max(0, b.last?.revenue ?? 0)
  return Math.round(clampN(Math.max(norm * 3, revenue * 0.15), 20_000, 50_000_000))
}

export function managerName(m: Manager): string {
  return `${m.firstName} ${m.lastName}`
}

/** A general-manager candidate for this company (skill varies; better ones cost more). */
export function managerCandidate(g: GameState, b: BizState, skill?: number): Manager {
  const gender = randInt(g, 0, 1) === 0 ? 'male' : 'female'
  const s = skill ?? randInt(g, 40, 85)
  return {
    firstName: randomFirstName(g, b.countryId, gender),
    lastName: randomLastName(g, b.countryId),
    gender,
    skill: s,
    salary: niceAmount(ceoPayNorm(b) * (0.6 + s / 100)),
    since: g.year,
  }
}

/** Put a manager in charge (the owner keeps the shares). */
export function installManager(g: GameState, b: BizState, m?: Manager): Manager {
  const mgr = m ?? managerCandidate(g, b, randInt(g, 45, 70))
  b.ceo = 'manager'
  b.manager = { ...mgr, since: g.year }
  return b.manager
}

/**
 * Make the player CEO of this business, quitting whatever main job they had (another business
 * they ran gets a general manager). Returns the title of the job they quit, if any.
 */
export function becomeCeo(g: GameState, a: Asset, b: BizState, title = 'Founder & CEO'): string | null {
  const c = g.character
  let quit: string | null = null
  if (c.job && !(c.job.defId === OWNER_JOB && c.job.data.assetId === a.id)) {
    const prev = c.job
    if (prev.defId === OWNER_JOB) {
      const other = g.assets.find((x) => x.id === prev.data.assetId)
      if (other && other.kind === 'business') {
        const ob = other.details as unknown as BizState
        if (ob && typeof ob === 'object') installManager(g, ob)
      }
    }
    quit = prev.title
    endJob(g, 'job', 'quit')
  }
  b.ceo = 'owner'
  b.manager = null
  if (!b.ownerSalary) b.ownerSalary = Math.min(ceoPayNorm(b), maxOwnerSalary(b))
  const job: Job = {
    defId: OWNER_JOB,
    title,
    company: a.name,
    category: 'special',
    salary: b.ownerSalary,
    level: 0,
    performance: 60,
    yearsInRole: 0,
    yearsAtCompany: 0,
    data: { assetId: a.id, startAge: c.age, roleStartAge: c.age },
  }
  c.job = job
  count(g, 'jobs')
  return quit
}

/** Step down as CEO (the company keeps running under a manager). */
export function stepDown(g: GameState, a: Asset, b: BizState, m?: Manager): Manager {
  const mgr = installManager(g, b, m)
  if (ceoJob(g, a.id)) endJob(g, 'job', 'quit')
  return mgr
}

/**
 * Keep the CEO job and the businesses consistent: a business whose owner no longer works there
 * (prison, a new job, inheritance) gets a manager; a CEO job whose company is gone ends.
 */
export function syncCeo(g: GameState): void {
  const c = g.character
  const job = ceoJob(g)
  if (job) {
    const a = g.assets.find((x) => x.id === job.data.assetId && x.kind === 'business')
    if (!a) {
      endJob(g, 'job', 'other')
      log(g, `I'm no longer running ${job.company}: it isn't mine anymore.`, 'bad')
    } else {
      job.company = a.name
    }
  }
  for (const a of g.assets) {
    if (a.kind !== 'business' || a.details.ceo === 'manager') continue
    if (ceoJob(g, a.id)) continue
    const b = readBiz(g, a)
    const d = a.details as unknown as BizState
    const mgr = managerCandidate(g, b, randInt(g, 45, 70))
    d.ceo = 'manager'
    d.manager = { ...mgr, since: g.year }
    const who = `${mgr.firstName} ${mgr.lastName}`
    if (c.prison) log(g, `With me behind bars, ${a.name} hired ${who} as interim general manager.`, 'neutral')
    else log(g, `${who} took over day-to-day management of ${a.name}.`, 'neutral')
  }
}

/** Short note on what the local labor market means for hiring a manager. */
export function managerMarketNote(b: BizState): string {
  const m = marketOf(b.countryId)
  return m.laborCost >= 1.2 ? 'Executives here are expensive.' : m.laborCost <= 0.3 ? 'Experienced managers are affordable here.' : ''
}
