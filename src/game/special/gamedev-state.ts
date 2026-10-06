// Plain-JSON state for the Game Industry. The player's game-making life (skills, games in
// development, released games and credits, awards, burnout, gamer fame) lives in the per-
// character profile g.flags['special.gamedev'] (see special/common.ts prof/peek), so a child
// who takes over a family never inherits a parent's credits. A studio job lives in Job.data.
// Every reader validates and fills defaults: old saves and hand-edited saves keep working.
//
// Light on imports on purpose: computer/dev-cv.ts (and through it cv.ts and careers.ts) read
// this file.
import { devState, readVenture } from '../computer/dev-state'
import type { Asset, GameState, Job, Json } from '../types'
import { peek, prof } from './common'
import { ENGINES, GENRES, isEngine, isGenre, isPlatform, isScope, type EngineId, type GenreId, type PlatformId, type ScopeId, type Tier, type Track } from './gamedev-data'

/** Job.defId of a studio job (category 'special'). */
export const GAME_JOB = 'game_dev'

// ---------------------------------------------------------------------------
// Types

/** A released game the player made or worked on. */
export interface GdCredit {
  id: string
  title: string
  genre: GenreId
  platform: PlatformId
  scope: ScopeId
  engine: EngineId
  /** 'Solo Developer', 'Junior Artist', 'Creative Director'... */
  role: string
  /** Studio (or 'Self-published'). */
  studio: string
  /** The player's own game: its sales pay the player. */
  own: boolean
  /** Free game (jams). */
  free: boolean
  /** Calendar year of release. */
  year: number
  age: number
  /** Critic score 0-100. */
  critic: number
  /** Player score 0-100. */
  players: number
  /** Copies sold (or plays, for free games) so far. */
  copies: number
  /** Copies expected next year (own games; 0 = done selling). */
  tail: number
  /** US price of a copy at launch. */
  price: number
  /** Lifetime net receipts from stores (after their cut). */
  gross: number
  /** Lifetime money that reached the player. */
  earned: number
  dlcs: number
  lastDlc: number
  patched: number
  /** Franchise name ('' for a one-off). */
  franchise: string
  /** Publisher ('' when self-published). */
  publisher: string
  /** Advance the publisher still has to earn back before royalties flow. */
  recoup: number
  /** Your share of receipts once the advance is recouped (1 = self-published). */
  devShare: number
  awards: string[]
}

/** A game the player is developing on their own (or with contractors). */
export interface GdProject {
  id: string
  title: string
  genre: GenreId
  platform: PlatformId
  scope: ScopeId
  engine: EngineId
  /** 0-100; ships at 100. */
  progress: number
  /** Polish so far, 0-100. */
  quality: number
  /** 0-100: rushed work leaves bugs. */
  bugs: number
  /** 0-100: trailers, devlogs, crowdfunding buzz. */
  hype: number
  /** Freelance artists/composers on the project (0-3). */
  contractors: number
  /** Freelancer seats already paid for this year (contracts are paid a year up front). */
  contractorsPaid: number
  /** Money held for the project (crowdfunding, publisher advances). */
  budget: number
  /** Your own money put in. */
  spent: number
  backers: number
  raised: number
  earlyAccess: boolean
  /** Early-access copies sold so far. */
  eaCopies: number
  /** Early-access copies expected next year. */
  eaTail: number
  eaYears: number
  publisher: string
  advance: number
  /** Advance still to be paid on release. */
  advanceDue: number
  /** Advance and marketing the publisher still has to earn back. */
  recoup: number
  devShare: number
  franchise: string
  sequelOf: string
  started: number
  lastWorked: number
  crunches: number
}

export interface GdProfile {
  /** Game design skill 0-100 (grows by making games, jobs and courses). */
  design: number
  /** Art skill 0-100. */
  art: number
  /** 0-100: crunch and long hours. */
  burnout: number
  /** 0-100: how well gamers know your name. */
  gamerFame: number
  /** Years worked at studios. */
  industryYears: number
  projects: GdProject[]
  games: GdCredit[]
  /** Award lines for the trophy shelf. */
  awards: string[]
  /** Studios worked for. */
  studios: string[]
  layoffs: number
  jams: number
  crunchYears: number
  /** Venture asset ids already offered a studio upgrade. */
  offered: string[]
  awardYear: number
  /** Next id counter for credits and projects. */
  seq: number
}

const MAX_GAMES = 40
const MAX_PROJECTS = 3
const MAX_AWARDS = 30

// ---------------------------------------------------------------------------
// Readers

function obj(v: Json | undefined): Record<string, Json> {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
}

function arr(v: Json | undefined): Json[] {
  return Array.isArray(v) ? v : []
}

export function num(v: Json | undefined, dflt = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : dflt
}

export function str(v: Json | undefined, dflt = ''): string {
  return typeof v === 'string' ? v : dflt
}

export function clampN(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo
  return Math.max(lo, Math.min(hi, n))
}

/** A finite, non-negative whole number. */
export function whole(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0
}

function genreOf(v: Json | undefined): GenreId {
  return isGenre(v) ? v : GENRES[0].id
}

function platformOf(v: Json | undefined): PlatformId {
  return isPlatform(v) ? v : 'pc'
}

function scopeOf(v: Json | undefined): ScopeId {
  return isScope(v) ? v : 'small'
}

function engineOf(v: Json | undefined): EngineId {
  return isEngine(v) ? v : ENGINES[1].id
}

function strings(v: Json | undefined, max = 20): string[] {
  return arr(v)
    .filter((x): x is string => typeof x === 'string' && x.trim() !== '')
    .slice(-max)
}

export function readCredit(v: Json, i: number): GdCredit | null {
  const o = obj(v)
  const title = str(o.title).trim()
  if (!title) return null
  return {
    id: str(o.id, `gc${i}`),
    title: title.slice(0, 60),
    genre: genreOf(o.genre),
    platform: platformOf(o.platform),
    scope: scopeOf(o.scope),
    engine: engineOf(o.engine),
    role: str(o.role, 'Developer').slice(0, 40),
    studio: str(o.studio, 'Self-published').slice(0, 60),
    own: o.own === true,
    free: o.free === true,
    year: num(o.year),
    age: num(o.age),
    critic: Math.round(clampN(num(o.critic, 60), 0, 100)),
    players: Math.round(clampN(num(o.players, 60), 0, 100)),
    copies: whole(num(o.copies)),
    tail: whole(num(o.tail)),
    price: clampN(num(o.price), 0, 200),
    gross: whole(num(o.gross)),
    earned: whole(num(o.earned)),
    dlcs: whole(clampN(num(o.dlcs), 0, 20)),
    lastDlc: num(o.lastDlc),
    patched: num(o.patched),
    franchise: str(o.franchise).slice(0, 60),
    publisher: str(o.publisher).slice(0, 60),
    recoup: whole(num(o.recoup)),
    devShare: clampN(num(o.devShare, 1), 0, 1),
    awards: strings(o.awards, 8),
  }
}

export function readProject(v: Json, i: number): GdProject | null {
  const o = obj(v)
  const title = str(o.title).trim()
  if (!title) return null
  return {
    id: str(o.id, `gp${i}`),
    title: title.slice(0, 60),
    genre: genreOf(o.genre),
    platform: platformOf(o.platform),
    scope: scopeOf(o.scope),
    engine: engineOf(o.engine),
    progress: clampN(num(o.progress), 0, 100),
    quality: clampN(num(o.quality, 20), 0, 100),
    bugs: clampN(num(o.bugs), 0, 100),
    hype: clampN(num(o.hype), 0, 100),
    contractors: Math.round(clampN(num(o.contractors), 0, 3)),
    contractorsPaid: Math.round(clampN(num(o.contractorsPaid, num(o.contractors)), 0, 3)),
    budget: whole(num(o.budget)),
    spent: whole(num(o.spent)),
    backers: whole(num(o.backers)),
    raised: whole(num(o.raised)),
    earlyAccess: o.earlyAccess === true,
    eaCopies: whole(num(o.eaCopies)),
    eaTail: whole(num(o.eaTail)),
    eaYears: whole(num(o.eaYears)),
    publisher: str(o.publisher).slice(0, 60),
    advance: whole(num(o.advance)),
    advanceDue: whole(num(o.advanceDue)),
    recoup: whole(num(o.recoup)),
    devShare: clampN(num(o.devShare, 1), 0, 1),
    franchise: str(o.franchise).slice(0, 60),
    sequelOf: str(o.sequelOf),
    started: num(o.started),
    lastWorked: num(o.lastWorked, -1),
    crunches: whole(num(o.crunches)),
  }
}

/** A complete profile from whatever is stored (never throws, always finite). */
export function normalizeProfile(raw: Json | undefined): GdProfile {
  const o = obj(raw)
  const games = arr(o.games)
    .map(readCredit)
    .filter((x): x is GdCredit => !!x)
  return {
    design: Math.round(clampN(num(o.design), 0, 100)),
    art: Math.round(clampN(num(o.art), 0, 100)),
    burnout: Math.round(clampN(num(o.burnout), 0, 100)),
    gamerFame: Math.round(clampN(num(o.gamerFame), 0, 100)),
    industryYears: whole(num(o.industryYears)),
    projects: arr(o.projects)
      .map(readProject)
      .filter((x): x is GdProject => !!x)
      .slice(0, MAX_PROJECTS),
    games: trimGames(games),
    awards: strings(o.awards, MAX_AWARDS),
    studios: strings(o.studios, 12),
    layoffs: whole(num(o.layoffs)),
    jams: whole(num(o.jams)),
    crunchYears: whole(num(o.crunchYears)),
    offered: strings(o.offered, 12),
    awardYear: num(o.awardYear),
    seq: whole(num(o.seq)),
  }
}

/** Keep the credits list bounded: old free jams and finished low-impact credits go first. */
function trimGames(games: GdCredit[]): GdCredit[] {
  if (games.length <= MAX_GAMES) return games
  const keep = [...games]
  while (keep.length > MAX_GAMES) {
    let worst = -1
    let worstScore = Infinity
    keep.forEach((x, i) => {
      if (x.tail > 0) return
      const score = (x.free ? 0 : 50) + x.critic + Math.log10(1 + x.copies) * 5 + x.awards.length * 30
      if (score < worstScore) {
        worstScore = score
        worst = i
      }
    })
    keep.splice(worst >= 0 ? worst : 0, 1)
  }
  return keep
}

function initProfile(): GdProfile {
  return normalizeProfile(undefined)
}

/** Read-only profile (a normalized copy; safe in menu code). Null when the player never started. */
export function gdPeek(g: GameState): GdProfile | null {
  const p = peek<Json>(g, 'gamedev')
  return p ? normalizeProfile(p) : null
}

/** Read-only profile, or an empty one. */
export function gdView(g: GameState): GdProfile {
  return gdPeek(g) ?? initProfile()
}

/**
 * Mutable profile (normalized in place; mutations write through to g.flags). Only call from
 * actions, scripts and yearly hooks.
 */
export function gdMut(g: GameState): GdProfile {
  const raw = prof<Record<string, Json>>(g, 'gamedev', () => initProfile() as unknown as Record<string, Json>)
  const n = normalizeProfile(raw as unknown as Json)
  Object.assign(raw, n as unknown as Record<string, Json>)
  return raw as unknown as GdProfile
}

/** Trim lists after a change (call before leaving an action that grew them). */
export function tidy(p: GdProfile): void {
  p.games = trimGames(p.games)
  p.projects = p.projects.slice(0, MAX_PROJECTS)
  p.awards = p.awards.slice(-MAX_AWARDS)
  p.studios = p.studios.slice(-12)
  p.offered = p.offered.slice(-12)
}

export function nextId(p: GdProfile, prefix: string): string {
  p.seq += 1
  return `${prefix}${p.seq}`
}

// ---------------------------------------------------------------------------
// The studio job (Job.data)

export interface GdJobProject {
  title: string
  genre: GenreId
  scope: ScopeId
  platform: PlatformId
  /** 0-100. */
  progress: number
  /** Quality so far (studio craft + the team's work). */
  quality: number
  /** Years of crunch on this project. */
  crunch: number
  started: number
}

export interface GdJobData {
  studio: string
  tier: Tier
  track: Track
  /** Studio craft: base game quality, 0-100. */
  craft: number
  hq: string
  city: string
  proj: GdJobProject | null
  /** Year you last asked for a raise. */
  raiseYear: number
  /** Work-hard sessions this year (performance). */
  effort: number
  /** Year of the last layoff scare. */
  scare: number
  /** Year you last crunched for the studio (burnout keeps climbing the year after). */
  crunchYear: number
}

const TIERS: Tier[] = ['indie', 'mid', 'aaa']
const TRACK_SET = new Set<string>(['qa', 'code', 'art', 'design'])

export function isGameJob(job: Job | null | undefined): job is Job {
  return !!job && job.defId === GAME_JOB && job.category === 'special'
}

/** The player's studio job, if any. */
export function gameJob(g: GameState): Job | null {
  const j = g.character.job
  return isGameJob(j) ? j : null
}

function readJobProject(v: Json | undefined): GdJobProject | null {
  const o = obj(v)
  const title = str(o.title)
  if (!title) return null
  return {
    title,
    genre: genreOf(o.genre),
    scope: scopeOf(o.scope),
    platform: platformOf(o.platform),
    progress: clampN(num(o.progress), 0, 100),
    quality: clampN(num(o.quality, 60), 0, 100),
    crunch: whole(num(o.crunch)),
    started: num(o.started),
  }
}

/** Normalized copy of a studio job's data. */
export function readJobData(job: Job): GdJobData {
  const d = job.data ?? {}
  const tier = TIERS.includes(str(d.tier) as Tier) ? (str(d.tier) as Tier) : 'mid'
  return {
    studio: str(d.studio, job.company || 'a game studio'),
    tier,
    track: TRACK_SET.has(str(d.track)) ? (str(d.track) as Track) : 'qa',
    craft: clampN(num(d.craft, 62), 0, 100),
    hq: str(d.hq),
    city: str(d.city),
    proj: readJobProject(d.proj),
    raiseYear: num(d.raiseYear),
    effort: whole(num(d.effort)),
    scare: num(d.scare),
    crunchYear: num(d.crunchYear),
  }
}

/** Write normalized job data back onto the job (keeps the other keys, e.g. startAge). */
export function writeJobData(job: Job, d: GdJobData): void {
  job.data = { ...job.data, ...(JSON.parse(JSON.stringify(d)) as Record<string, Json>) }
}

// ---------------------------------------------------------------------------
// Skills and portfolio (shared by the career, the CV and the studio)

const TECH_MAJORS = ['Computer Science', 'Information Systems', 'Mathematics', 'Engineering', 'Physics']
const ART_MAJORS = ['Graphic Design', 'Art History', 'Architecture']

function majors(g: GameState): string[] {
  return g.character.education.degrees.filter((d) => d.major).map((d) => d.major as string)
}

export function hasTechDegree(g: GameState): boolean {
  return majors(g).some((m) => TECH_MAJORS.includes(m))
}

export function hasArtDegree(g: GameState): boolean {
  return majors(g).some((m) => ART_MAJORS.includes(m))
}

/** Art skill: practice, plus a head start from an art talent or degree. */
export function artSkill(g: GameState, p: GdProfile = gdView(g)): number {
  const c = g.character
  const bonus = (c.talent === 'Art' ? 15 : 0) + (majors(g).includes('Graphic Design') ? 15 : hasArtDegree(g) ? 8 : 0)
  return Math.round(clampN(p.art + bonus, 0, 100))
}

/** Game design skill: practice and shipped games, plus a little from writing talent and smarts. */
export function designSkill(g: GameState, p: GdProfile = gdView(g)): number {
  const c = g.character
  const bonus = (c.talent === 'Writing' ? 6 : 0) + Math.max(0, (c.stats.smarts - 60) / 8)
  return Math.round(clampN(p.design + bonus, 0, 100))
}

/** Game ventures from the home computer (kind 'venture', type 'game'). */
export function gameVentures(g: GameState): Asset[] {
  return g.assets.filter((a) => a.kind === 'venture' && a.details?.type === 'game')
}

export interface Portfolio {
  /** Released games beyond jams (credits, old hobby games, live game ventures). */
  shipped: number
  jams: number
  /** Best critic score. */
  best: number
  /** Shipped credits as a lead or above. */
  lead: number
}

const LEAD_ROLES = /Lead|Director|Head|Solo|Founder|Creator/

/** What a studio sees on your games portfolio. */
export function gamePortfolio(g: GameState, p: GdProfile = gdView(g)): Portfolio {
  let shipped = 0
  let jams = p.jams
  let best = 0
  let lead = 0
  for (const x of p.games) {
    if (x.scope === 'jam') {
      best = Math.max(best, Math.min(x.critic, 70))
      continue
    }
    shipped++
    best = Math.max(best, x.critic)
    if (LEAD_ROLES.test(x.role)) lead++
  }
  // Hobby games and mods from the home computer (old saves and kids' projects).
  for (const x of devState(g).projects) {
    if (x.kind === 'game' && x.q >= 40) {
      shipped++
      best = Math.max(best, x.q)
      lead++
    } else if ((x.kind === 'scratch' || x.kind === 'mod') && x.q >= 40) {
      jams++
      best = Math.max(best, Math.min(x.q, 65))
    }
  }
  for (const a of gameVentures(g)) {
    const v = readVenture(g, a)
    if (v.stage !== 'live') continue
    shipped++
    lead++
    best = Math.max(best, v.quality)
  }
  return { shipped, jams, best: Math.round(best), lead }
}

/** "Overwhelmingly Positive"... for a player score. */
export function playerLabel(score: number): string {
  if (score >= 90) return 'Overwhelmingly Positive'
  if (score >= 78) return 'Very Positive'
  if (score >= 65) return 'Mostly Positive'
  if (score >= 48) return 'Mixed'
  if (score >= 32) return 'Mostly Negative'
  return 'Overwhelmingly Negative'
}

/** "Universal acclaim"... for a critic score. */
export function criticLabel(score: number): string {
  if (score >= 90) return 'universal acclaim'
  if (score >= 80) return 'great reviews'
  if (score >= 70) return 'good reviews'
  if (score >= 55) return 'mixed reviews'
  if (score >= 40) return 'bad reviews'
  return 'a critical mauling'
}
