// The game-making math shared by solo projects, studio jobs and owned game studios:
// genre trends and the industry cycle (seeded per year, so everyone in a world agrees which
// genre is hot and when the industry is laying people off), review scores, the launch-year
// audience with its heavy-tailed luck, store receipts per copy and the long tail of sales.
// Games are a global product: prices are global, reach depends on how connected the home
// market is, and costs (salaries, contractors) are local.
import { seeded } from '../assets'
import { sizeRatio } from '../business/competition-data'
import { localPay } from '../data/local-pay'
import { contractorCost } from '../computer/dev-state'
import { fillLocal } from '../data/locales'
import { industryDemand, marketOf } from '../data/markets'
import { worldYear } from '../invest/engine'
import { liftSkill } from '../mastery'
import { pick, rand, randInt } from '../rng'
import type { GameState } from '../types'
import { talentMult } from '../talents'
import { genreDef, GENRES, genresIn, NET_PER_PRICE, platformDef, scopeDef, type GenreDef, type GenreId, type PlatformId, type ScopeId } from './gamedev-data'
import { clampN, whole, type GdProfile } from './gamedev-state'

// ---------------------------------------------------------------------------
// The world's game industry, year by year

/** The family key shared by every generation of this world (like the investment engine's). */
export function fam(g: GameState): string {
  return (g.lifeId || 'life').replace(/-g\d+$/, '')
}

function normal(s: { next: () => number }): number {
  return (s.next() + s.next() + s.next() - 1.5) * 2
}

export interface IndustryYear {
  z: number
  mood: 'boom' | 'steady' | 'downturn'
  /** Sales multiplier for the year. */
  mult: number
}

/** The games industry in a calendar year: boom years, normal years and layoff waves. */
export function industryYear(g: GameState, year = g.year): IndustryYear {
  const s = seeded(`${fam(g)}|gamesIndustry|${year}`)
  let z = 0.7 * normal(s) + 0.3 * normal(seeded(`${fam(g)}|gamesIndustry|${year - 1}`))
  const w = worldYear(fam(g), year)
  if (w.crash) z -= 1.1
  if (w.boom) z += 0.5
  const mood = z < -0.85 ? 'downturn' : z > 1 ? 'boom' : 'steady'
  return { z, mood, mult: clampN(1 + 0.09 * z, 0.78, 1.22) }
}

/** How hot a genre is in a year (0.6-1.6): genres come in and out of fashion. */
export function genreTrend(g: GameState, genre: GenreId, year = g.year): number {
  const now = normal(seeded(`${fam(g)}|genre|${genre}|${year}`))
  const before = normal(seeded(`${fam(g)}|genre|${genre}|${year - 1}`))
  const vol = genre === 'battleRoyale' ? 0.32 : 0.22
  return clampN(Math.exp(vol * (0.65 * now + 0.35 * before)), 0.6, 1.6)
}

/** The two hottest genres this year. */
export function hotGenres(g: GameState, year = g.year): GenreDef[] {
  return eraGenres(year).sort((a, b) => genreTrend(g, b.id, year) - genreTrend(g, a.id, year)).slice(0, 2)
}

export function coldGenre(g: GameState, year = g.year): GenreDef {
  return eraGenres(year).sort((a, b) => genreTrend(g, a.id, year) - genreTrend(g, b.id, year))[0]
}

/** Genres that exist in that year (all of them when the list would be too short to trend). */
function eraGenres(year: number): GenreDef[] {
  const list = genresIn(year)
  return list.length >= 2 ? list : [...GENRES]
}

export function trendLabel(t: number): string {
  if (t >= 1.3) return 'red hot'
  if (t >= 1.1) return 'popular'
  if (t > 0.9) return 'steady'
  if (t > 0.75) return 'cooling off'
  return 'out of fashion'
}

// ---------------------------------------------------------------------------
// Quality and reviews

/** Weighted skill for a genre from code, art and design (each 0-100). */
export function genreSkill(genre: GenreId, code: number, art: number, design: number): number {
  const [wc, wa, wd] = genreDef(genre).mix
  return clampN(code * wc + art * wa + design * wd, 0, 100)
}

/** How much a quality level sells: steep at the top, brutal at the bottom. */
export function qualityFactor(q: number): number {
  return 2 * Math.pow(clampN(q, 0, 100) / 100, 4)
}

export interface Reviews {
  critic: number
  players: number
}

/**
 * Critic and player scores for a finished game. Players punish bugs, broken promises (hype
 * far above the real quality) and unfair prices; they forgive a lot in a franchise they love.
 */
export function reviewScores(g: GameState, quality: number, opts: { bugs?: number; hype?: number; fans?: number; greedy?: boolean } = {}): Reviews {
  const q = clampN(quality, 0, 100)
  const critic = Math.round(clampN(q + randInt(g, -6, 6), 1, 99))
  const overhype = Math.max(0, (opts.hype ?? 0) - q) * 0.18
  const bugs = (opts.bugs ?? 0) * 0.28
  const fans = (opts.fans ?? 0) * 6
  const greed = opts.greedy ? 8 : 0
  const players = Math.round(clampN(q + randInt(g, -10, 10) - overhype - bugs + fans - greed, 1, 99))
  return { critic, players }
}

// ---------------------------------------------------------------------------
// Sales

/** Heavy-tailed luck: most games find a small audience, a few explode. */
export function luckRoll(g: GameState, scope: ScopeId): number {
  const [median, spread] = scopeDef(scope).luck
  const z = (rand(g) + rand(g) + rand(g) - 1.5) / 0.5
  return clampN(median * Math.exp(spread * z), 0.02, 9)
}

/** US price of a copy for a scope on a platform (jams are free). */
export function priceOf(scope: ScopeId, platform: PlatformId): number {
  const s = scopeDef(scope)
  if (s.price <= 0) return 0
  return Math.round(s.price * platformDef(platform).priceMult * 100) / 100
}

/** Money a studio actually receives per copy: after the store's 30% and the average discount. */
export function netPerCopy(price: number): number {
  return Math.max(0, price * NET_PER_PRICE)
}

/** How well a game made here reaches the world (language, press, connections): 0.6-1.05. */
export function homeReach(countryId: string): number {
  const m = marketOf(countryId)
  const gdp = Math.max(300, Number.isFinite(m.gdpPerCapita) ? m.gdpPerCapita : 20_000)
  const access = 0.35 + 0.65 * Math.sqrt(Math.min(1, gdp / 50_000))
  const scene = clampN(industryDemand(countryId, 'gameStudio'), 0.2, 2.5)
  return clampN((0.55 + 0.45 * access) * (0.92 + 0.06 * Math.min(2, scene)), 0.45, 1.05)
}

export interface LaunchInput {
  scope: ScopeId
  genre: GenreId
  platform: PlatformId
  /** Final quality 0-100. */
  quality: number
  /** 0-100. */
  hype: number
  /** Marketing muscle: 0.5 (none) ... 1.6 (huge campaign). */
  marketing: number
  /** Reach of whoever publishes it (homeReach × publisher/visibility). */
  reach: number
  /** Gamer fame of the creator 0-100. */
  fame: number
  /** Franchise pull 0-1 (sequel to a hit). */
  franchise: number
  /** Copies already sold (backers, early access). */
  presold: number
  /** Platform exclusive (one console only). */
  exclusive?: boolean
  /** Calendar year of the launch (default: this year). */
  year?: number
}

/** First-year copies (or plays, for free games). Always finite and >= 0. */
export function firstYearCopies(g: GameState, x: LaunchInput): number {
  const s = scopeDef(x.scope)
  const p = platformDef(x.platform)
  const genre = genreDef(x.genre)
  const potential =
    s.potential *
    p.audience *
    (x.exclusive ? 0.6 : 1) *
    genre.appeal *
    genreTrend(g, x.genre, x.year ?? g.year) *
    qualityFactor(x.quality) *
    (1 + (clampN(x.hype, 0, 100) / 100) * 0.8) *
    clampN(x.marketing, 0.3, 2) *
    clampN(x.reach, 0.2, 1.6) *
    (1 + clampN(x.fame, 0, 100) / 150) *
    (1 + 0.7 * clampN(x.franchise, 0, 1)) *
    industryYear(g, x.year ?? g.year).mult *
    luckRoll(g, x.scope)
  return whole(Math.max(0, potential - x.presold * 0.85))
}

export interface MarketInput {
  scope: ScopeId
  genre: GenreId
  platform: PlatformId
  /** Promised quality 0-100. */
  quality: number
  hype: number
  fame: number
  reach: number
}

/**
 * First-year copies a game like this sells with ordinary luck: what backers and publishers
 * size it by. Crowdfunding backers are a slice of this audience, never more than it.
 */
export function expectedCopies(g: GameState, x: MarketInput): number {
  const s = scopeDef(x.scope)
  const v =
    s.potential *
    platformDef(x.platform).audience *
    genreDef(x.genre).appeal *
    genreTrend(g, x.genre) *
    qualityFactor(x.quality) *
    (1 + (clampN(x.hype, 0, 100) / 100) * 0.8) *
    clampN(x.reach, 0.2, 1.6) *
    (1 + clampN(x.fame, 0, 100) / 150) *
    s.luck[0]
  return whole(v)
}

/** Most backers a campaign can find: about a third of the game's expected first-year audience. */
export function backerCap(g: GameState, x: MarketInput): number {
  return whole(50 + expectedCopies(g, x) * 0.3)
}

/** People who play video games, worldwide, today. */
const GAMERS_TODAY = 3_400_000_000
/** The most of them one title ever sells to (the best sellers in history sit near 8%). */
const TITLE_SHARE = 0.08
/** The most of them one publisher, or a whole group of studios, sells a copy to in a year. */
const PUBLISHER_SHARE = 0.1

/** Everyone playing in a year: today's count on the games market's own era curve (a few million in 1975, over a billion by 2008). */
export function gamersIn(year: number): number {
  return Math.max(1_000_000, Math.round(GAMERS_TODAY * sizeRatio('gameStudio', year)))
}

/** Most copies one title can ever sell, in total, in a year's world. */
export function titleCopiesCap(year: number): number {
  return Math.round(gamersIn(year) * TITLE_SHARE)
}

/** Most copies one publisher, or every studio one owner holds together, can sell in a year. */
export function publisherCopiesCap(year: number): number {
  return Math.round(gamersIn(year) * PUBLISHER_SHARE)
}

/** Share of this year's buyers who still show up next year. */
export function tailKeep(players: number, scope: ScopeId): number {
  const base = 0.2 + 0.4 * Math.pow(clampN(players, 0, 100) / 100, 1.5)
  return clampN(base + (scope === 'aaa' ? -0.04 : 0), 0.12, 0.6)
}

/** Next year's tail after this year's copies. */
export function nextTail(copies: number, players: number, scope: ScopeId): number {
  const t = copies * tailKeep(players, scope)
  return t < 20 ? 0 : whole(t)
}

/** Engine royalty on receipts past the first $1M a game grossed. */
export function engineRoyalty(rate: number, grossBefore: number, grossThisYear: number): number {
  if (!(rate > 0) || grossThisYear <= 0) return 0
  const over = Math.max(0, grossBefore + grossThisYear - Math.max(1_000_000, grossBefore))
  return whole(over * rate)
}

/** "1.2M copies" / "860 copies". */
export function copiesLabel(n: number, free = false): string {
  const v = whole(n)
  const word = free ? (v === 1 ? 'play' : 'plays') : v === 1 ? 'copy' : 'copies'
  if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M ${word}`
  if (v >= 1e4) return `${Math.round(v / 1e3)}K ${word}`
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K ${word}`
  return `${v.toLocaleString('en-US')} ${word}`
}

// ---------------------------------------------------------------------------
// Local costs

/** Local salary for a game-industry role that pays `usPay` in the US. */
export function gamePay(countryId: string, usPay: number): number {
  return Math.max(0, Math.round(localPay(countryId, usPay) / 100) * 100)
}

/** A freelance artist or composer for a year (priced like global freelance work). */
export function freelancerCost(countryId: string): number {
  return contractorCost(countryId, 'game')
}

// ---------------------------------------------------------------------------
// Skills

/** How far a kid can get: 10-year-olds top out around 65, adults at 100. */
export function skillCeiling(age: number): number {
  return clampN(25 + age * 4, 20, 100)
}

/** Practice game design: diminishing returns near the ceiling. Returns the gain. */
export function trainDesign(g: GameState, p: GdProfile, base: number): number {
  // Main Character Syndrome: the first time you design a game is already mastery (to the age ceiling).
  const start = p.design
  p.design = Math.round(clampN(liftSkill(g, 'gamedev.design', 'craft', 'game design', p.design, skillCeiling(g.character.age)), 0, 100))
  const room = Math.max(0, 1 - p.design / 110)
  // Gaming talent: thousands of hours of play turn into design instincts fast.
  const gain = Math.max(0, Math.min(Math.round(base * talentMult(g, 'Gaming', 1.5) * room * (0.8 + rand(g) * 0.5)), skillCeiling(g.character.age) - p.design))
  p.design = Math.round(clampN(p.design + gain, 0, 100))
  return p.design - start
}

/** Practice art (an art talent learns faster). Returns the gain. */
export function trainArt(g: GameState, p: GdProfile, base: number): number {
  // Main Character Syndrome: the first time you make game art is already mastery (to the age ceiling).
  const start = p.art
  p.art = Math.round(clampN(liftSkill(g, 'gamedev.art', 'creative', 'game art', p.art, skillCeiling(g.character.age)), 0, 100))
  const talent = talentMult(g, 'Art', 1.5)
  const room = Math.max(0, 1 - p.art / 110)
  const gain = Math.max(0, Math.min(Math.round(base * talent * room * (0.8 + rand(g) * 0.5)), skillCeiling(g.character.age) - p.art))
  p.art = Math.round(clampN(p.art + gain, 0, 100))
  return p.art - start
}

/** Gamer fame moves (0-100); big moves also nudge general fame. */
export function addGamerFame(p: GdProfile, delta: number): number {
  const before = p.gamerFame
  p.gamerFame = Math.round(clampN(p.gamerFame + delta, 0, 100))
  return p.gamerFame - before
}

// ---------------------------------------------------------------------------
// Titles

/** A fresh title for a genre that the player hasn't used yet. */
export function gameTitle(g: GameState, genre: GenreId, used: Set<string>): string {
  const fill = (t: string) => fillLocal(g, t).replace(/\{\w+\}/g, '').replace(/\s+/g, ' ').trim()
  const fresh = genreDef(genre).titles.map(fill).filter((t) => t && !used.has(t))
  if (fresh.length) return pick(g, fresh)
  const base = fill(pick(g, genreDef(genre).titles)) || 'Untitled Game'
  return `${base}: ${pick(g, ['Remixed', 'Overdrive', 'Deluxe', 'Unleashed', 'Again'])}`
}

/** Sequel title: "Snail Odyssey 2", "Snail Odyssey 3"... */
export function sequelTitle(base: string, n: number): string {
  const root = base.replace(/\s+(\d+|II|III|IV)(:.*)?$/, '').trim() || base
  return `${root} ${n}`
}
