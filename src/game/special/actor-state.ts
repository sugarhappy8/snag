// Actor 2.0 state: one optional, owner-stamped, versioned record at special.actor.sim (version 1, start
// standing 20), built on the career kit. Every reader tolerates junk and returns capped, finite values.
// `migrate[0]` lifts the legacy special.actor profile and the job's project in memory (pure: a view of a
// legacy life is byte-identical) and never writes the legacy flag, so a rollback still reads it.
// `adoptLegacy` is the one place the sim takes the project over. Imports from actor.ts are used inside
// function bodies only; actor.ts imports this file for the Role type only.
import type { GameState, Job } from '../types'
import { actorJob, viewActor } from './actor'
import { BUDGETS, INDUSTRIES, TYPE_IDS, TYPE_OF, industryAt, type BudgetId, type IndustryId, type TypeId } from './actor-data'
import { arr, cap, defineCareerState, flt, int, rec, txt, type CareerBase, type CareerStore, type Raw } from './kit/state'

export type Role = 'Extra' | 'Supporting' | 'Lead'

export interface Terms { fee: number; points: number; exclusive: boolean }
export interface Rep { personId: string; name: string; firm: string; quality: number; cut: number; loyalty: number; since: number }
export interface Press { firm: string; quality: number; since: number }
export interface Proj {
  id: string
  title: string
  kind: 'film' | 'tv'
  genre: string
  type: TypeId
  role: Role
  studio: string
  studioId: string
  industry: IndustryId
  budget: BudgetId
  terms: Terms
  stage: 'offer' | 'shoot' | 'post'
  developed: number
  buzz: number
  campaign: number
  season: number
  director: number
  costars: string[]
  window: 'normal' | 'awards' | 'dodge'
  quality: number
  since: number
  lastYear: number
}
export interface Credit {
  id: string
  title: string
  kind: 'film' | 'tv'
  role: Role
  genre: string
  type: TypeId
  industry: IndustryId
  studio: string
  year: number
  age: number
  pay: number
  quality: number
  popularity: number
  gross: number
  backend: number
  seasons: number
  verdict: string
  residual: number
  trust: boolean
}
export interface ActorExtra {
  migrated: boolean
  rep: number
  noms: number
  dry: number
  scandal: number
  layLow: number
  studioFrom: number
  type: Record<TypeId, number>
  team: { agent: Rep | null; manager: Rep | null; press: Press | null }
  pipeline: Proj[]
  credits: Credit[]
  awards: string[]
  totals: { gross: number; net: number; cuts: number; spent: number }
}
export type ActorState = CareerBase & ActorExtra

/** Caps: four projects (post counts), 64 credits, 40 awards. */
const CAPS = { pipeline: 4, credits: 64, awards: 40, costars: 8 } as const
const MONEY_MAX = 1e12
const TOTAL_MAX = 1e13
const ID_MAX = 24
const BRAND_ID_MAX = 40
const TITLE_MAX = 48
const GENRE_MAX = 30
const NAME_MAX = 40
const FIRM_MAX = 60
const STUDIO_MAX = 60
const VERDICT_MAX = 40
const AWARD_MAX = 120
/** The id of the project lifted from the legacy job, so adoption can refresh it and nothing else. */
const LEGACY_PROJECT = 'lp1'

const INDUSTRY_KEYS = Object.keys(INDUSTRIES) as IndustryId[]
const BUDGET_KEYS = Object.keys(BUDGETS) as BudgetId[]

const roleKey = (v: unknown): Role => (v === 'Lead' || v === 'Supporting' ? v : 'Extra')
const kindKey = (v: unknown): 'film' | 'tv' => (v === 'tv' ? 'tv' : 'film')
const industryKey = (v: unknown, fallback: IndustryId): IndustryId => (typeof v === 'string' && (INDUSTRY_KEYS as string[]).includes(v) ? (v as IndustryId) : fallback)
const budgetKey = (v: unknown, kind: 'film' | 'tv'): BudgetId =>
  typeof v === 'string' && (BUDGET_KEYS as string[]).includes(v) && BUDGETS[v as BudgetId].kind === kind ? (v as BudgetId) : kind === 'film' ? 'indie' : 'cable'
const typeKey = (v: unknown, genre: string): TypeId => (typeof v === 'string' && (TYPE_IDS as readonly string[]).includes(v) ? (v as TypeId) : (TYPE_OF[genre] ?? 'drama'))
const stageKey = (v: unknown): Proj['stage'] => (v === 'offer' || v === 'post' ? v : 'shoot')
const windowKey = (v: unknown): Proj['window'] => (v === 'awards' || v === 'dodge' ? v : 'normal')

function strings(v: unknown, max: number, len: number): string[] {
  const out: string[] = []
  for (const x of cap(arr(v), max * 4)) {
    const s = typeof x === 'string' ? txt(x, len) : ''
    if (s) out.push(s)
  }
  return cap(out, max)
}

function readTerms(v: unknown): Terms {
  const r = rec(v)
  return { fee: int(r.fee, 0, 0, MONEY_MAX), points: flt(r.points, 0, 0, 0.12), exclusive: r.exclusive === true }
}

function readProj(v: unknown, g: GameState): Proj | null {
  const r = rec(v)
  const id = txt(r.id, ID_MAX)
  if (!id) return null
  const kind = kindKey(r.kind)
  const genre = txt(r.genre, GENRE_MAX) || 'Drama'
  return {
    id,
    title: txt(r.title, TITLE_MAX) || 'Untitled',
    kind,
    genre,
    type: typeKey(r.type, genre),
    role: roleKey(r.role),
    studio: txt(r.studio, STUDIO_MAX) || 'Independent Studio',
    studioId: txt(r.studioId, BRAND_ID_MAX),
    industry: industryKey(r.industry, industryAt(g.character.countryId, g.year)),
    budget: budgetKey(r.budget, kind),
    terms: readTerms(r.terms),
    stage: stageKey(r.stage),
    developed: int(r.developed, 0, 0, 100),
    buzz: int(r.buzz, 0, 0, 100),
    campaign: int(r.campaign, 0, 0, 30),
    season: int(r.season, 1, 1, 9),
    director: int(r.director, 65, 40, 90),
    costars: strings(r.costars, CAPS.costars, ID_MAX),
    window: windowKey(r.window),
    quality: int(r.quality, 0, 0, 100),
    since: int(r.since, 0, 0, 9999),
    lastYear: int(r.lastYear, 0, 0, 9999),
  }
}

function readCredit(v: unknown, g: GameState): Credit | null {
  const r = rec(v)
  const id = txt(r.id, ID_MAX)
  if (!id) return null
  const genre = txt(r.genre, GENRE_MAX) || 'Drama'
  const year = int(r.year, 0, 0, 9999)
  return {
    id,
    title: txt(r.title, TITLE_MAX) || 'Untitled',
    kind: kindKey(r.kind),
    role: roleKey(r.role),
    genre,
    type: typeKey(r.type, genre),
    industry: industryKey(r.industry, industryAt(g.character.countryId, year || g.year)),
    studio: txt(r.studio, STUDIO_MAX),
    year,
    age: int(r.age, 0, 0, 300),
    pay: int(r.pay, 0, 0, MONEY_MAX),
    quality: int(r.quality, 0, 0, 100),
    popularity: int(r.popularity, 0, 0, 100),
    gross: int(r.gross, 0, 0, TOTAL_MAX),
    backend: int(r.backend, 0, 0, MONEY_MAX),
    seasons: int(r.seasons, 1, 1, 99),
    verdict: txt(r.verdict, VERDICT_MAX) || 'released',
    residual: int(r.residual, 0, 0, MONEY_MAX),
    trust: r.trust === true,
  }
}

/** Reads a list through `one`, keeping the first row of each id, then the newest `max`. */
function readList<T extends { id: string }>(v: unknown, max: number, one: (x: unknown) => T | null): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const x of cap(arr(v), max * 2)) {
    const row = one(x)
    if (!row || seen.has(row.id)) continue
    seen.add(row.id)
    out.push(row)
  }
  return cap(out, max)
}

function readRep(v: unknown, who: string): Rep | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const r = v as Raw
  return {
    personId: txt(r.personId, ID_MAX),
    name: txt(r.name, NAME_MAX) || who,
    firm: txt(r.firm, FIRM_MAX) || 'Independent',
    quality: int(r.quality, 50, 20, 95),
    cut: flt(r.cut, 0.1, 0.05, 0.2),
    loyalty: int(r.loyalty, 55, 0, 100),
    since: int(r.since, 0, 0, 9999),
  }
}

function readPress(v: unknown): Press | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const r = v as Raw
  return { firm: txt(r.firm, FIRM_MAX) || 'Independent', quality: int(r.quality, 50, 30, 90), since: int(r.since, 0, 0, 9999) }
}

function readTypes(v: unknown): Record<TypeId, number> {
  const r = rec(v)
  return { action: int(r.action, 0, 0, 100), comedy: int(r.comedy, 0, 0, 100), drama: int(r.drama, 0, 0, 100), genre: int(r.genre, 0, 0, 100), romance: int(r.romance, 0, 0, 100) }
}

function normalizeExtra(raw: Raw, g: GameState): ActorExtra {
  const team = rec(raw.team)
  const totals = rec(raw.totals)
  return {
    migrated: raw.migrated === true,
    rep: int(raw.rep, 50, 0, 100),
    noms: int(raw.noms, 0, 0, 1e6),
    dry: int(raw.dry, 0, 0, 100),
    scandal: int(raw.scandal, 0, 0, 100),
    layLow: int(raw.layLow, 0, 0, 9999),
    studioFrom: int(raw.studioFrom, 0, 0, 9999),
    type: readTypes(raw.type),
    team: { agent: readRep(team.agent, 'Unknown Agent'), manager: readRep(team.manager, 'Unknown Manager'), press: readPress(team.press) },
    pipeline: readList(raw.pipeline, CAPS.pipeline, (x) => readProj(x, g)),
    credits: readList(raw.credits, CAPS.credits, (x) => readCredit(x, g)),
    awards: strings(raw.awards, CAPS.awards, AWARD_MAX),
    totals: { gross: int(totals.gross, 0, 0, TOTAL_MAX), net: int(totals.net, 0, 0, TOTAL_MAX), cuts: int(totals.cuts, 0, 0, TOTAL_MAX), spent: int(totals.spent, 0, 0, TOTAL_MAX) },
  }
}

/** The job's legacy project as a pipeline entry (shoot stage, fee = pay, points 0, director 65), or null. Pure. */
function liftProject(g: GameState, job: Job | null): Proj | null {
  const raw = rec(job?.data).project
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const p = raw as Raw
  const kind = kindKey(p.kind)
  const genre = txt(p.genre, GENRE_MAX) || 'Drama'
  return {
    id: LEGACY_PROJECT,
    title: txt(p.title, TITLE_MAX) || 'Untitled',
    kind,
    genre,
    type: typeKey(undefined, genre),
    role: roleKey(p.role),
    studio: txt(p.studio, STUDIO_MAX) || 'Independent Studio',
    studioId: '',
    industry: industryAt(g.character.countryId, g.year),
    budget: budgetKey(p.budget, kind),
    terms: { fee: int(p.pay, 0, 0, MONEY_MAX), points: 0, exclusive: false },
    stage: 'shoot',
    developed: int(p.developed, 0, 0, 100),
    buzz: int(p.buzz, 0, 0, 100),
    campaign: 0,
    season: int(p.season, 1, 1, 9),
    director: 65,
    costars: strings(p.costars, CAPS.costars, ID_MAX),
    window: 'normal',
    quality: 0,
    since: int(g.year, 0, 0, 9999),
    // the legacy tick wraps a project once a year, so the sim wraps it from the next tick it runs
    lastYear: int(g.year - 1, 0, 0, 9999),
  }
}

/** v0 to v1: the legacy profile, its credits, agent and the job's project. Reads only; never writes the legacy flag. */
function migrateLegacy(raw: Raw, g: GameState): Raw {
  const legacy = viewActor(g)
  const country = g.character.countryId
  const age = Number.isFinite(g.character.age) ? g.character.age : 0
  const credits = legacy.credits.slice(-CAPS.credits).map((c, i) => {
    const year = int(g.year - (age - c.age), 0, 0, 9999)
    return {
      id: `lc${i + 1}`,
      title: c.title,
      kind: c.kind,
      role: c.role,
      genre: c.genre,
      type: TYPE_OF[c.genre] ?? 'drama',
      industry: industryAt(country, year),
      studio: '',
      year,
      age: c.age,
      pay: c.pay,
      quality: c.quality,
      popularity: c.popularity,
      gross: 0,
      backend: 0,
      seasons: c.seasons,
      verdict: c.verdict,
      residual: c.residual,
      trust: false,
    }
  })
  const agent = legacy.agent ? { personId: '', name: legacy.agent.name, firm: legacy.agent.firm, quality: legacy.agent.quality, cut: legacy.agent.cut, loyalty: 60, since: g.year } : null
  const project = liftProject(g, actorJob(g))
  return {
    ...raw,
    migrated: false,
    rep: legacy.reputation,
    noms: legacy.nominations,
    dry: legacy.dryYears,
    awards: legacy.awards.slice(-CAPS.awards),
    credits,
    team: { agent, manager: null, press: null },
    pipeline: project ? [project] : [],
  }
}

export const actorStore: CareerStore<ActorState> = defineCareerState<ActorExtra>({
  key: 'actor.sim',
  version: 1,
  start: 20,
  migrate: [migrateLegacy],
  extra: normalizeExtra,
})

/**
 * The sim takes over from the legacy hook: first call only. Sets `migrated` and clears Job.data.project
 * (the project already sits in pipeline[0] from the migration). If the legacy hook moved or finished the
 * project since the record was created, the legacy-lifted entry is refreshed or dropped first, so
 * nothing is settled twice. Projects the sim made itself are never touched. Actions and hooks only.
 */
export function adoptLegacy(g: GameState, s: ActorState): void {
  if (s.migrated) return
  s.migrated = true
  const job = actorJob(g)
  const live = liftProject(g, job)
  const mine = s.pipeline.filter((p) => p.id !== LEGACY_PROJECT)
  s.pipeline = (live ? [live, ...mine] : mine).slice(0, CAPS.pipeline)
  if (job) job.data.project = null
}
