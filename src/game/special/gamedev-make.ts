// Game Industry › Make Games: everything the player builds on their own computer. Kids start
// with Scratch games, mods and game jams; from 12 you can develop a real game: pick a scope
// (small indie or a bigger indie with freelancers), genre, platform and engine, work on it
// over the years, build hype, crowdfund it, sign with a publisher or self-publish, try early
// access, then launch to critics and players. Released games keep selling (a long tail), get
// patches, DLC, discounts and sequels; a hit becomes a franchise.
//
// State: the profile's projects (in development) and games (released credits), see
// gamedev-state.ts. Money: your own games pay you taxable income; launch-week sales are paid
// (and taxed) right away, the rest of the year's sales arrive with the yearly tick.
import { computerBlock, earnNow, firstReason, useComputer } from '../computer/dev-common'
import { practice } from '../computer/dev-learn'
import { buildProject, PROJECT_KINDS } from '../computer/dev-projects'
import { localFee, niceAmount, onlinePrice, wealthOf } from '../computer/dev-state'
import { bestLanguageFor, codingSkill } from '../computer/skills'
import { addHidden, addStat, count, earnIncome, log, remember, scriptChoice, scriptInput, useYearAction, yearActionsUsed } from '../core'
import { pick, rand, randFloat, randInt, shuffle } from '../rng'
import { pickLine, pickSite } from '../text/pick'
import { defineScript } from '../scripts'
import { hasTalent, talentHint } from '../talents'
import type { ChoiceOption, GameState, Json, MenuAction, MenuGroup, MenuNode } from '../types'
import { addFame, blocked, money, say, tell } from './common'
import {
  addGamerFame,
  backerCap,
  copiesLabel,
  engineRoyalty,
  firstYearCopies,
  genreSkill,
  genreTrend,
  hotGenres,
  homeReach,
  industryYear,
  luckRoll,
  netPerCopy,
  nextTail,
  priceOf,
  qualityFactor,
  reviewScores,
  sequelTitle,
  gameTitle,
  freelancerCost,
  trainArt,
  trainDesign,
  trendLabel,
} from './gamedev-core'
import {
  AWARDS,
  CRITIC_SITE,
  engineDef,
  GENRES,
  genreDef,
  isEngine,
  isGenre,
  isPlatform,
  isScope,
  JAM_THEMES,
  platformDef,
  PUBLISHERS,
  SCOPES,
  scopeDef,
  enginesIn,
  gamedevFeatureOpen,
  genresIn,
  platformLabel,
  platformOpen,
  platformsIn,
  scopeOpen,
  storeIn,
  type EngineId,
  type GenreId,
  type PlatformId,
  type ScopeId,
} from './gamedev-data'
import { artSkill, clampN, designSkill, gdMut, gdView, nextId, playerLabel, tidy, whole, type GdCredit, type GdProfile, type GdProject } from './gamedev-state'
import { totalFollowers } from './social'
import { eraOpen, ONLINE_COURSE_GATE, VIDEO_GATE } from '../computer/era'
import { hasTech } from '../history/timeline'

const MAX_WORK = 3
/** Highest quality a solo project can be polished to before launch (launch-day luck can still beat it). */
const SOLO_POLISH = 93

function obj(v: Json | undefined): Record<string, Json> {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
}

function s(v: Json | undefined, d = ''): string {
  return typeof v === 'string' ? v : d
}

function n(v: Json | undefined, d = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : d
}

function an(noun: string): string {
  return `${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`
}

function cap(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Why the player can't work on games at the computer right now. */
export function makeBlock(g: GameState, minAge = 0): string | null {
  return firstReason(eraMakeBlock(g), computerBlock(g), g.character.age < minAge ? `You must be at least ${minAge}.` : null)
}

/** Before home consoles and computers, nobody makes games at home. */
function eraMakeBlock(g: GameState): string | null {
  if (platformsIn(g.year).length === 0 || !hasTech(g, 'videoGameConsole')) return `It's ${g.year}. Nobody around here makes games at home yet.`
  return null
}

/** Max games in development at once (teens can juggle one). */
export function maxProjects(g: GameState): number {
  return g.character.age < 16 ? 1 : 2
}

// ---------------------------------------------------------------------------
// Development math

/**
 * Progress (percentage points) one work session adds. A year's three sessions are about a
 * person-year of evenings and weekends: a small game takes a decent coder about a year, an
 * indie game (a team of five for two years) takes years solo, and freelancers you direct
 * stretch each session further without turning one person into a studio.
 */
export function sessionRate(g: GameState, pr: GdProject): number {
  const sc = scopeDef(pr.scope)
  const e = engineDef(pr.engine)
  const skill = codingSkill(g)
  const engineFit = skill >= e.minSkill ? 1 : 0.7
  const speed = e.speed * engineFit * (0.6 + skill / 125)
  const crew = Math.max(1, sc.team / (1 + pr.contractors * 0.3))
  return clampN((30 / (Math.max(0.5, sc.years) * crew)) * speed, 1, 60)
}

/** Progress each freelancer adds over a year on their own (on top of your sessions). */
export function freelancerProgress(pr: GdProject): number {
  return pr.contractors * (scopeDef(pr.scope).id === 'indie' ? 2.5 : 10)
}

/**
 * Back-to-back launches split your fans' attention and the store's front page: the second
 * release in a calendar year sells two-thirds as well, the third half as well, and so on.
 */
export function releaseFatigue(p: GdProfile, year: number): number {
  const sameYear = p.games.filter((x) => x.own && !x.free && x.year === year).length
  return 1 / (1 + 0.5 * sameYear)
}

/** The best this game can turn out with the people working on it. */
export function qualityCap(g: GameState, pr: GdProject, p: GdProfile = gdView(g)): number {
  const code = codingSkill(g)
  let art = artSkill(g, p)
  const design = designSkill(g, p)
  if (pr.contractors > 0) art = Math.max(art, 50 + pr.contractors * 6)
  const e = engineDef(pr.engine)
  const sc = scopeDef(pr.scope)
  const engineBonus = sc.index >= 3 ? e.bigBonus : e.bonus
  const homebrew = pr.engine === 'homebrew' ? (code - 60) / 4 : 0
  const ea = pr.earlyAccess ? 5 : 0
  // Gaming talent: you can feel when a level is fun, so you polish the right things.
  const gamer = hasTalent(g, 'Gaming') ? 6 : 0
  // A one-person team (plus a few freelancers) can only polish so far: studios reach higher.
  return clampN(genreSkill(pr.genre, code, art, design) + 10 - sc.difficulty + engineBonus + homebrew + ea + gamer + pr.contractors * 2, 5, SOLO_POLISH)
}

/** Dev kits, certification and age ratings for a platform (mostly global prices). */
export function certCost(g: GameState, platform: PlatformId): number {
  const usd = platformDef(platform).certUsd
  return usd > 0 ? niceAmount(usd * (0.75 + 0.25 * Math.min(1.2, wealthOf(g.character.countryId)))) : 0
}

function projectById(p: GdProfile, id: string): GdProject | undefined {
  return p.projects.find((x) => x.id === id)
}

function ownGame(p: GdProfile, id: string): GdCredit | undefined {
  return p.games.find((x) => x.id === id && x.own)
}

/**
 * Split store receipts: the engine's royalty first, then the publisher earns back its advance,
 * then you get your share. Updates the credit's lifetime numbers. Returns what reaches you.
 */
export function settleReceipts(credit: GdCredit, receipts: number): number {
  const r = whole(receipts)
  if (r <= 0) return 0
  const royalty = engineRoyalty(engineDef(credit.engine).royalty, credit.gross, r)
  let rest = Math.max(0, r - royalty)
  let toYou = rest
  if (credit.publisher) {
    const recoup = Math.min(credit.recoup, rest)
    credit.recoup = whole(credit.recoup - recoup)
    rest -= recoup
    toYou = whole(rest * credit.devShare)
  }
  credit.gross = whole(credit.gross + r)
  credit.earned = whole(credit.earned + toYou)
  return whole(toYou)
}

// ---------------------------------------------------------------------------
// Starting a game: scope → genre → platform → engine → name

interface Draft {
  scope: ScopeId
  genre: GenreId
  platform: PlatformId
  engine: EngineId
  franchise: string
  sequelOf: string
  title: string
}

function readDraft(v: Json | undefined): Draft {
  const d = obj(v)
  return {
    scope: isScope(d.scope) ? d.scope : 'small',
    genre: isGenre(d.genre) ? d.genre : GENRES[0].id,
    platform: isPlatform(d.platform) ? d.platform : 'pc',
    engine: isEngine(d.engine) ? d.engine : 'cobalt',
    franchise: s(d.franchise),
    sequelOf: s(d.sequelOf),
    title: s(d.title),
  }
}

function draftJson(d: Draft): Json {
  return JSON.parse(JSON.stringify(d)) as Json
}

function startBlock(g: GameState): string | null {
  const p = gdView(g)
  return firstReason(makeBlock(g, 12), p.projects.length >= maxProjects(g) ? `You're already developing ${p.projects.length === 1 ? 'a game' : `${p.projects.length} games`}. Finish (or shelve) one first.` : null)
}

/** Open the "develop a game" flow (optionally as a sequel). */
export function startGame(g: GameState, preset: Partial<Draft> = {}): void {
  const reason = startBlock(g)
  if (reason) return tell(g, 'Develop a Game', reason, '\u{1F3AE}')
  const skill = codingSkill(g)
  const choices: ChoiceOption[] = SCOPES.filter((x) => (x.id === 'small' || x.id === 'indie') && scopeOpen(x.id, g.year)).map((x) => ({
    id: x.id,
    label: `${x.label}: ${x.id === 'small' ? 'about a year solo' : 'many years solo, two or three with freelancers'}`,
    emoji: x.emoji,
  }))
  choices.push({ id: 'cancel', label: 'Never mind', emoji: '\u{2716}\u{FE0F}' })
  const draft: Draft = { scope: 'small', genre: preset.genre ?? GENRES[0].id, platform: 'pc', engine: 'cobalt', franchise: preset.franchise ?? '', sequelOf: preset.sequelOf ?? '', title: preset.title ?? '' }
  scriptChoice(
    g,
    SCOPE_SCRIPT,
    preset.sequelOf ? `Sequel to ${preset.franchise || 'Your Game'}` : 'Develop a Game',
    `How big is this game? Your coding skill is ${skill}/100. AA and AAA games need a whole studio (start one at 18).`,
    choices,
    { emoji: '\u{1F3AE}', data: draftJson(draft) },
  )
}

const SCOPE_SCRIPT = defineScript('gamedev.make.scope', (g, choice, data) => {
  if (choice === 'cancel' || startBlock(g)) return
  const d = readDraft(data)
  d.scope = isScope(choice) ? choice : 'small'
  if (d.sequelOf) return askPlatform(g, d)
  const hot = new Set(hotGenres(g).map((x) => x.id))
  // Both hot genres are always on the list, plus four others.
  const options = shuffle(g, [...hotGenres(g), ...shuffle(g, genresIn(g.year).filter((x) => !hot.has(x.id))).slice(0, 4)])
  // Gaming talent: you can feel where players are heading. Games ship later (a small game next
  // year, an indie in two), so the trend in the year you ship matters more than today's. (Only
  // shown if one of these will really be riding high then.)
  const ahead = Math.max(1, scopeDef(d.scope).years)
  const shipYear = g.year + ahead
  const next = options.reduce((a, b) => (genreTrend(g, b.id, shipYear) > genreTrend(g, a.id, shipYear) ? b : a))
  const nextHint =
    genreTrend(g, next.id, shipYear) >= 1.1
      ? talentHint(g, 'Gaming', ahead === 1 ? 'Players will be all over this genre next year, right about when you ship.' : `Players will be all over this genre in ${ahead} years, about when a game this size could be ready.`)
      : ''
  scriptChoice(
    g,
    GENRE_SCRIPT,
    'Pick a Genre',
    `What kind of game? ${hotGenres(g)
      .map((x) => x.label)
      .join(' and ')} games are hot right now.`,
    [
      ...options.map((x) => ({
        id: x.id,
        label: `${x.label}${hot.has(x.id) ? ' (hot!)' : genreTrend(g, x.id) < 0.8 ? ' (out of fashion)' : ''}`,
        emoji: x.emoji,
        ...(nextHint && x.id === next.id ? { hint: nextHint } : {}),
      })),
      { id: 'cancel', label: 'Never mind', emoji: '\u{2716}\u{FE0F}' },
    ],
    { emoji: '\u{1F3AE}', data: draftJson(d) },
  )
})

const GENRE_SCRIPT = defineScript('gamedev.make.genre', (g, choice, data) => {
  if (choice === 'cancel' || startBlock(g)) return
  const d = readDraft(data)
  if (!isGenre(choice)) return
  d.genre = choice
  askPlatform(g, d)
})

function askPlatform(g: GameState, d: Draft): void {
  const sc = scopeDef(d.scope)
  const options = platformsIn(g.year).filter((x) => x.minScope <= sc.index)
  if (options.length === 0) return tell(g, 'Pick a Platform', `No platform takes a game that size in ${g.year}. Try something smaller.`, '\u{1F579}\u{FE0F}')
  scriptChoice(
    g,
    PLATFORM_SCRIPT,
    'Pick a Platform',
    `Where will "${genreDef(d.genre).label}" players find it?`,
    [
      ...options.map((x) => {
        const cert = certCost(g, x.id)
        return { id: x.id, label: `${platformLabel(x.id, g.year)}${cert > 0 ? ` (${money(cert)} in dev kits & certification)` : ''}`, emoji: x.emoji }
      }),
      { id: 'cancel', label: 'Never mind', emoji: '\u{2716}\u{FE0F}' },
    ],
    { emoji: '\u{1F579}\u{FE0F}', data: draftJson(d) },
  )
}

const PLATFORM_SCRIPT = defineScript('gamedev.make.platform', (g, choice, data) => {
  if (choice === 'cancel' || startBlock(g)) return
  const d = readDraft(data)
  if (!isPlatform(choice) || !platformOpen(choice, g.year)) return
  d.platform = choice
  const sc = scopeDef(d.scope)
  const skill = codingSkill(g)
  const engines = enginesIn(g.year).filter((e) => e.maxScope >= sc.index && (e.id !== 'blocks' || g.character.age < 16))
  scriptChoice(
    g,
    ENGINE_SCRIPT,
    'Pick an Engine',
    `Your coding skill is ${skill}/100. A harder engine slows you down until you're good enough for it.`,
    [
      ...engines.map((e) => ({ id: e.id, label: `${e.label}${skill < e.minSkill ? ` (needs skill ${e.minSkill} to use well)` : ''}`, emoji: e.emoji })),
      { id: 'cancel', label: 'Never mind', emoji: '\u{2716}\u{FE0F}' },
    ],
    { emoji: '\u{2699}\u{FE0F}', data: draftJson(d) },
  )
})

const ENGINE_SCRIPT = defineScript('gamedev.make.engine', (g, choice, data) => {
  if (choice === 'cancel' || startBlock(g)) return
  const d = readDraft(data)
  if (!isEngine(choice)) return
  d.engine = choice
  const p = gdView(g)
  const used = new Set(p.games.map((x) => x.title).concat(p.projects.map((x) => x.title)))
  const suggestion = d.sequelOf ? d.title || sequelTitle(d.franchise, 2) : gameTitle(g, d.genre, used)
  scriptInput(g, {
    title: 'Name Your Game',
    emoji: genreDef(d.genre).emoji,
    text: `What's it called? ${cap(an(genreDef(d.genre).noun))} for ${platformLabel(d.platform, g.year)}, made in ${engineDef(d.engine).label}.`,
    input: 'text',
    placeholder: 'Title',
    defaultValue: suggestion,
    scriptId: NAME_SCRIPT,
    data: draftJson(d),
  })
})

function cleanTitle(input: string): string {
  return String(input ?? '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48)
}

const NAME_SCRIPT = defineScript('gamedev.make.name', (g, input, data) => {
  if (startBlock(g)) return
  const d = readDraft(data)
  const p = gdMut(g)
  const used = new Set(p.games.map((x) => x.title).concat(p.projects.map((x) => x.title)))
  const title = cleanTitle(input) || (d.sequelOf ? d.title || sequelTitle(d.franchise, 2) : gameTitle(g, d.genre, used))
  const pr: GdProject = {
    id: nextId(p, 'gp'),
    title,
    genre: d.genre,
    platform: d.platform,
    scope: d.scope,
    engine: d.engine,
    progress: 0,
    quality: 30,
    bugs: 0,
    hype: d.sequelOf ? 25 : 0,
    contractors: 0,
    contractorsPaid: 0,
    budget: 0,
    spent: 0,
    backers: 0,
    raised: 0,
    earlyAccess: false,
    eaCopies: 0,
    eaTail: 0,
    eaYears: 0,
    publisher: '',
    advance: 0,
    advanceDue: 0,
    recoup: 0,
    devShare: 1,
    franchise: d.franchise,
    sequelOf: d.sequelOf,
    started: g.year,
    lastWorked: g.year,
    crunches: 0,
  }
  p.projects.push(pr)
  tidy(p)
  count(g, 'gamesStarted')
  log(g, `I started developing "${title}", ${an(genreDef(d.genre).noun)}.`, 'good')
  say(
    g,
    'New Project',
    `You opened a fresh project folder for "${title}" and named the first file "final_FINAL_v2". Work on it from Game Industry › Make Games. ${scopeDef(d.scope).id === 'indie' ? 'An indie game this size goes much faster with a freelancer or two.' : 'A small game like this takes about a year of evenings.'}`,
    genreDef(d.genre).emoji,
    'good',
  )
})

// ---------------------------------------------------------------------------
// Working on a game

/** One work session on a project. */
export function workOnGame(g: GameState, id: string, crunch = false): void {
  const reason = makeBlock(g)
  if (reason) return tell(g, 'Work on Your Game', reason, '\u{1F3AE}')
  const p = gdMut(g)
  const pr = projectById(p, id)
  if (!pr) return
  if (crunch) {
    // One crunch a year in total, however many projects you juggle (or start fresh to dodge it).
    if (!useYearAction(g, 'gamedev.crunch', 1)) return tell(g, 'Crunch', 'You already crunched this year. Your body filed a complaint.', '\u{1F35C}')
  } else if (!useYearAction(g, 'gamedev.work', MAX_WORK)) {
    return tell(g, 'Work on Your Game', `You've already had ${MAX_WORK} long dev sessions this year. Even passion projects need sleep.`, '\u{1F634}')
  }
  useComputer(g, crunch ? 3 : 2)
  const cap = qualityCap(g, pr, p)
  const before = pr.progress
  const polishing = pr.progress >= 100
  const rate = sessionRate(g, pr) * randFloat(g, 0.8, 1.2) * (crunch ? 1.7 : 1)
  pr.progress = clampN(pr.progress + rate, 0, 100)
  if (cap > pr.quality) pr.quality = clampN(pr.quality + (cap - pr.quality) * (polishing ? 0.35 : 0.5), 0, 100)
  if (polishing) pr.bugs = clampN(pr.bugs - randInt(g, 8, 14), 0, 100)
  if (pr.engine === 'homebrew') pr.bugs = clampN(pr.bugs + randInt(g, 1, 4), 0, 100)
  pr.lastWorked = g.year
  // Making games trains every skill a little.
  const mix = genreDef(pr.genre).mix
  practice(g, 1 + Math.round(mix[0] * 3), bestLanguageFor(g, 'games')?.id ?? null, 1)
  trainDesign(g, p, 1 + mix[2] * 3)
  trainArt(g, p, 1 + mix[1] * 3)
  if (crunch) {
    pr.crunches += 1
    pr.bugs = clampN(pr.bugs + randInt(g, 8, 14), 0, 100)
    addStat(g, 'health', -randInt(g, 2, 5))
    addStat(g, 'happiness', -randInt(g, 2, 4))
    p.burnout = Math.round(clampN(p.burnout + 15, 0, 100))
  } else {
    addStat(g, 'happiness', randInt(g, 1, 3))
  }
  const done = pr.progress >= 100 && before < 100
  log(g, `I worked on "${pr.title}" (${Math.round(pr.progress)}% done).`, 'good')
  const line = polishing
    ? pickLine(g, ['You fixed the bug where the hat floats away.', 'You polished the menus until they sparkled.', 'You tuned the difficulty curve. It is now a curve, not a cliff.'])
    : crunch
      ? pickLine(g, ['You coded for three days straight on energy drinks and spite.', 'You crunched all weekend. The code is held together by hope.'])
      : pickSite(g, [`You built the ${pickLine(g, ['boss fight', 'inventory', 'save system', 'main menu', 'first level', 'music player'])}.`, 'You spent the evening on one jump animation. It is a perfect jump.', 'You fixed one bug and made two new ones. Classic.'], 0x0b43cd4f)
  say(
    g,
    crunch ? 'Crunch Session' : polishing ? 'Polishing' : 'Dev Session',
    `${line}${done ? ` "${pr.title}" is feature-complete! Release it, or keep polishing.` : ''}\n\nProgress ${Math.round(pr.progress)}% · quality ${Math.round(pr.quality)}/100${pr.bugs >= 15 ? ` · bugs ${Math.round(pr.bugs)}` : ''}`,
    genreDef(pr.genre).emoji,
    'good',
  )
}

function devlog(g: GameState, id: string, paid: boolean): void {
  const reason = paid ? blocked(g) : makeBlock(g)
  if (reason) return tell(g, 'Marketing', reason, '\u{1F4E3}')
  const p = gdMut(g)
  const pr = projectById(p, id)
  if (!pr) return
  if (!useYearAction(g, `gamedev.${paid ? 'trailer' : 'devlog'}.${id}`, 1)) return tell(g, 'Marketing', paid ? 'You already cut a trailer this year.' : 'You already posted a devlog this year.', '\u{1F4E3}')
  const cost = paid ? localFee(g, scopeDef(pr.scope).id === 'indie' ? 5_000 : 1_200) : 0
  if (cost > 0) {
    const fromBudget = Math.min(pr.budget, cost)
    if (g.character.money < cost - fromBudget) return tell(g, "Can't Afford It", `A proper trailer costs ${money(cost)}.`, '\u{1F4B8}')
    pr.budget -= fromBudget
    g.character.money -= cost - fromBudget
    pr.spent += cost - fromBudget
  } else {
    useComputer(g, 1)
  }
  const boost = Math.round((paid ? randInt(g, 14, 24) : randInt(g, 4, 9)) * (1 + p.gamerFame / 100) * (pr.quality >= 60 ? 1.15 : 0.85))
  pr.hype = clampN(pr.hype + boost, 0, 100)
  say(
    g,
    paid ? 'Trailer Drop' : 'Devlog Posted',
    paid
      ? `You cut a trailer for "${pr.title}" with dramatic music and a release window you will probably miss. ${pickLine(g, ['The comments were mostly "wishlisted!"', 'Someone made a reaction video. Your mom watched it twice.', 'A big streamer said "huh, neat."'])} Hype ${Math.round(pr.hype)}/100. (${money(cost)}${pr.budget > 0 ? ', partly from the project budget' : ''}.)`
      : `You posted a devlog about "${pr.title}" showing ${pickLine(g, ['a GIF of a frog doing a backflip', 'your messy level editor', 'the bug where every character is a chair'])}. ${pickLine(g, ['A few hundred people liked it.', 'One comment: "this is my most anticipated game." It was your cousin.', 'It got shared by a small game newsletter!'])} Hype ${Math.round(pr.hype)}/100.`,
    paid ? '\u{1F3AC}' : '\u{1F4DD}',
    'good',
  )
}

function contractor(g: GameState, id: string, delta: number): void {
  const reason = blocked(g)
  if (reason) return tell(g, 'Freelancers', reason, '\u{1F3A8}')
  const p = gdMut(g)
  const pr = projectById(p, id)
  if (!pr) return
  const next = Math.round(clampN(pr.contractors + delta, 0, 3))
  if (next === pr.contractors) return tell(g, 'Freelancers', delta > 0 ? 'Three freelancers is all you can manage over chat.' : 'Nobody left to let go.', '\u{1F3A8}')
  const cost = freelancerCost(g.character.countryId)
  // Contracts are a year at a time, paid up front: letting someone go doesn't refund the year,
  // and filling a seat you already paid for this year costs nothing extra.
  let charged = 0
  if (delta > 0 && next > pr.contractorsPaid) {
    if (g.character.money + pr.budget < cost) return tell(g, "Can't Afford It", `A freelance artist or composer costs about ${money(cost)} a year, paid up front. You have ${money(Math.max(0, g.character.money))}${pr.budget > 0 ? ` plus ${money(pr.budget)} in the project budget` : ''}.`, '\u{1F4B8}')
    const fromBudget = Math.min(pr.budget, cost)
    pr.budget -= fromBudget
    g.character.money -= cost - fromBudget
    pr.spent += cost - fromBudget
    pr.contractorsPaid = next
    charged = cost
  }
  pr.contractors = next
  say(
    g,
    delta > 0 ? 'Freelancer Hired' : 'Freelancer Let Go',
    delta > 0
      ? `You hired ${pickLine(g, ['a pixel artist who only communicates in GIFs', 'a composer who sends 4 AM voice memos', 'a 3D artist who is very particular about polygons', 'a sound designer who recorded a cabbage for the punch sounds'])} for "${pr.title}" (${charged > 0 ? `${money(charged)} for the year, paid up front` : "a seat you'd already paid for this year"}). Team: you + ${pr.contractors}.`
      : `You let a freelancer go. This year's fee is already spent. Team: you + ${pr.contractors}.`,
    '\u{1F3A8}',
  )
}

// ---------------------------------------------------------------------------
// Crowdfunding

function crowdBlock(g: GameState, pr: GdProject): string | null {
  return firstReason(blocked(g, 18), pr.raised > 0 ? 'You already crowdfunded this game.' : null, pr.progress < 10 ? 'Make some progress first: backers want to see something.' : null, pr.earlyAccess ? 'It is already in early access.' : null)
}

const CROWD_SCRIPT = defineScript('gamedev.make.crowdfund', (g, choice, data) => {
  if (choice === 'cancel') return
  const d = obj(data)
  const p = gdMut(g)
  const pr = projectById(p, s(d.id))
  if (!pr || crowdBlock(g, pr)) return
  const price = Math.max(5, priceOf(pr.scope, pr.platform))
  const goal = choice === 'big' ? niceAmount(price * 1_500) : niceAmount(price * 250)
  const followers = totalFollowers(g)
  const interest = (150 + pr.hype * 30 + p.gamerFame * 250 + followers * 0.004) * Math.pow(clampN(pr.quality, 10, 100) / 55, 1.5) * genreTrend(g, pr.genre) * randFloat(g, 0.4, 1.6)
  // Fans can only back what they'd buy: a slice of the game's realistic audience.
  const cap = backerCap(g, { scope: pr.scope, genre: pr.genre, platform: pr.platform, quality: Math.max(pr.quality, qualityCap(g, pr, p) * 0.8), hype: pr.hype, fame: p.gamerFame, reach: homeReach(g.character.countryId) })
  const backers = whole(Math.min(interest, cap * randFloat(g, 0.7, 1.1)))
  const pledge = price * 1.5 + 5
  const raised = whole(backers * pledge * 0.9)
  if (raised < goal) {
    pr.raised = 1
    addStat(g, 'happiness', -4)
    log(g, `My crowdfunding campaign for "${pr.title}" failed.`, 'bad')
    return say(g, 'Campaign Failed', `"${pr.title}" raised ${money(raised)} of its ${money(goal)} goal. It's all or nothing, so you got nothing. ${pickLine(g, ['Your pitch video had 400 views, 380 of them yours.', 'The top comment was "is this a scam?" It was not, but thanks.'])}`, '\u{1F4C9}', 'bad')
  }
  pr.raised = raised
  pr.backers = backers
  pr.budget += raised
  pr.hype = clampN(pr.hype + 15, 0, 100)
  addGamerFame(p, raised >= goal * 3 ? 3 : 1)
  count(g, 'crowdfunded')
  log(g, `"${pr.title}" raised ${money(raised)} from ${backers.toLocaleString('en-US')} backers!`, 'good')
  remember(g, `Crowdfunded "${pr.title}": ${money(raised)} from ${backers.toLocaleString('en-US')} backers.`)
  say(
    g,
    'Funded!',
    `"${pr.title}" raised ${money(raised)} from ${backers.toLocaleString('en-US')} backers (goal: ${money(goal)}). The money sits in the project budget for freelancers and marketing; whatever's left when you ship is yours. The backers already own the game, and they will be checking in. Often.`,
    '\u{1F4B8}',
    'good',
  )
})

function crowdfund(g: GameState, id: string): void {
  const p = gdView(g)
  const pr = projectById(p, id)
  if (!pr) return
  const reason = crowdBlock(g, pr)
  if (reason) return tell(g, 'Crowdfunding', reason, '\u{1F4B8}')
  const price = Math.max(5, priceOf(pr.scope, pr.platform))
  scriptChoice(g, CROWD_SCRIPT, `Crowdfund "${pr.title}"`, `Pick a goal. Crowdfunding is all or nothing: miss the goal and you get nothing. Hype ${Math.round(pr.hype)}/100 · gamer fame ${p.gamerFame}.`, [
    { id: 'small', label: `Modest goal (${money(niceAmount(price * 250))})`, emoji: '\u{1F331}' },
    { id: 'big', label: `Ambitious goal (${money(niceAmount(price * 1_500))})`, emoji: '\u{1F680}' },
    { id: 'cancel', label: 'Never mind', emoji: '\u{2716}\u{FE0F}' },
  ], { emoji: '\u{1F4B8}', data: { id } })
}

// ---------------------------------------------------------------------------
// Publishers

interface Offer {
  publisher: string
  advance: number
  devShare: number
}

/** How publishers rate your track record: games that earned back their advance vs ones that didn't. */
function publisherTrust(g: GameState, p: GdProfile): number {
  let good = 0
  let bad = 0
  for (const x of p.games) {
    if (!x.publisher) continue
    if (x.recoup <= 0) good++
    else if (g.year - x.year >= 2) bad++
  }
  bad += g.counters.gamedevShelvedSigned ?? 0
  return clampN(1 + good * 0.15 - bad * 0.3, 0.3, 1.6)
}

export function publisherOffers(g: GameState, pr: GdProject, p: GdProfile): Offer[] {
  const sc = scopeDef(pr.scope)
  const price = priceOf(pr.scope, pr.platform)
  const q = Math.max(pr.quality, qualityCap(g, pr, p) * 0.85)
  const est = sc.potential * platformDef(pr.platform).audience * genreDef(pr.genre).appeal * genreTrend(g, pr.genre) * qualityFactor(q) * sc.luck[0] * homeReach(g.character.countryId) * 1.15
  const value = est * netPerCopy(price)
  const trust = publisherTrust(g, p)
  const cap = sc.id === 'indie' ? 600_000 : 30_000
  const base = clampN(value * trust, 0, cap)
  const names = shuffle(g, PUBLISHERS)
  const offers: Offer[] = [
    { publisher: names[0], advance: niceAmount(base * randFloat(g, 0.35, 0.5)), devShare: Math.round(randFloat(g, 0.45, 0.55) * 100) / 100 },
    { publisher: names[1], advance: niceAmount(base * randFloat(g, 0.15, 0.25)), devShare: Math.round(randFloat(g, 0.62, 0.72) * 100) / 100 },
  ]
  return offers.filter((o) => o.advance >= localFee(g, 1_000))
}

function publisherBlock(g: GameState, pr: GdProject): string | null {
  return firstReason(blocked(g, 18), pr.publisher ? `${pr.publisher} already publishes it.` : null, pr.progress < 20 ? 'Publishers want a playable demo first (20% progress).' : null, pr.quality < 40 ? 'The demo is too rough to pitch. Polish it first.' : null)
}

const PUB_SCRIPT = defineScript('gamedev.make.publisher', (g, choice, data) => {
  if (choice === 'self') return
  const d = obj(data)
  const p = gdMut(g)
  const pr = projectById(p, s(d.id))
  if (!pr || publisherBlock(g, pr)) return
  const offers = Array.isArray(d.offers) ? d.offers.map(obj) : []
  const o = offers[Number(choice.replace('o', ''))]
  if (!o) return
  const advance = whole(n(o.advance))
  const share = clampN(n(o.devShare, 0.5), 0.3, 0.8)
  const name = s(o.publisher, PUBLISHERS[0])
  const marketing = niceAmount(scopeDef(pr.scope).marketingUsd * 1.2)
  pr.publisher = name
  pr.advance = advance
  pr.devShare = share
  pr.recoup = advance + marketing
  pr.budget += Math.round(advance / 2)
  pr.advanceDue = advance - Math.round(advance / 2)
  pr.hype = clampN(pr.hype + 15, 0, 100)
  log(g, `I signed "${pr.title}" with ${name}.`, 'good')
  remember(g, `Signed a publishing deal with ${name} for "${pr.title}".`)
  say(
    g,
    'Deal Signed',
    `${name} will publish "${pr.title}". They paid ${money(Math.round(advance / 2))} into the project budget now and owe ${money(pr.advanceDue)} more when it ships (if it's any good). They'll spend about ${money(marketing)} on marketing and earn all of that back, plus the advance, before you see a cent of royalties; after that you get ${Math.round(share * 100)}%.`,
    '\u{1F91D}',
    'good',
  )
})

function pitchPublishers(g: GameState, id: string): void {
  const p = gdView(g)
  const pr = projectById(p, id)
  if (!pr) return
  const reason = publisherBlock(g, pr)
  if (reason) return tell(g, 'Publishers', reason, '\u{1F91D}')
  if (!useYearAction(g, `gamedev.pitch.${id}`, 1)) return tell(g, 'Publishers', 'You already pitched this game to publishers this year.', '\u{1F91D}')
  const offers = publisherOffers(g, pr, p)
  if (!offers.length) {
    return say(g, 'Publishers Passed', `You pitched "${pr.title}" to every publisher with an email address. ${pickLine(g, ['"Not for us at this time."', 'One replied "lol". Then unsent it.', 'They loved the art but "the market for this is tricky."'])} Maybe self-publish, or come back with a better demo.`, '\u{1F4E7}', 'bad')
  }
  scriptChoice(
    g,
    PUB_SCRIPT,
    'Publisher Offers',
    `${offers.length === 1 ? 'A publisher wants' : 'Publishers want'} "${pr.title}". Advances are paid half now, half on release, and earned back from sales before royalties start.`,
    [
      ...offers.map((o, i) => ({ id: `o${i}`, label: `${o.publisher}: ${money(o.advance)} advance, ${Math.round(o.devShare * 100)}% royalties after`, emoji: '\u{1F4BC}' })),
      { id: 'self', label: 'Stay independent (self-publish)', emoji: '\u{1F3E0}' },
    ],
    { emoji: '\u{1F91D}', data: { id, offers: JSON.parse(JSON.stringify(offers)) as Json } },
  )
}

// ---------------------------------------------------------------------------
// Early access and release

function eaBlock(g: GameState, pr: GdProject): string | null {
  return firstReason(makeBlock(g, 13), pr.earlyAccess ? 'It is already in early access.' : null, pr.progress < 50 ? 'Early access needs a playable game (50% progress).' : null, pr.progress >= 100 ? 'It is finished: just release it.' : null, pr.platform !== 'pc' && pr.platform !== 'vr' ? 'Early access is a PC thing.' : null)
}

function earlyAccess(g: GameState, id: string): void {
  const p = gdMut(g)
  const pr = projectById(p, id)
  if (!pr) return
  const reason = eaBlock(g, pr)
  if (reason) return tell(g, 'Early Access', reason, '\u{1F6A7}')
  const price = priceOf(pr.scope, pr.platform) * 0.8
  const copies = whole(
    firstYearCopies(g, {
      scope: pr.scope,
      genre: pr.genre,
      platform: pr.platform,
      quality: pr.quality * 0.9,
      hype: pr.hype,
      marketing: pr.publisher ? 1.1 : 0.55,
      reach: homeReach(g.character.countryId) * (pr.publisher ? 1.1 : 0.75),
      fame: p.gamerFame,
      franchise: 0,
      presold: pr.backers,
    }) * 0.35,
  )
  const launch = whole(copies * 0.25)
  pr.earlyAccess = true
  pr.eaCopies = launch
  pr.eaTail = whole(copies - launch)
  pr.hype = clampN(pr.hype + 8, 0, 100)
  const receipts = whole(launch * netPerCopy(price))
  const toYou = eaPayout(pr, receipts)
  const tax = toYou > 0 ? earnNow(g, toYou) : 0
  log(g, `I launched "${pr.title}" in early access.`, 'good')
  say(
    g,
    'Early Access',
    `"${pr.title}" is in early access on ${storeIn(g.year)}! ${copiesLabel(launch)} in the first weeks${toYou > 0 ? `, ${money(toYou)} to you${tax > 0 ? ` (${money(tax)} in tax)` : ''}` : pr.publisher ? ' (the publisher is still earning back its advance)' : ''}. Players will tell you exactly what's wrong with it, in caps lock. Their feedback makes the final game better.`,
    '\u{1F6A7}',
    'good',
  )
}

/** Early-access receipts: the publisher recoups first. */
function eaPayout(pr: GdProject, receipts: number): number {
  if (receipts <= 0) return 0
  if (!pr.publisher) return whole(receipts)
  const recoup = Math.min(pr.recoup, receipts)
  pr.recoup = whole(pr.recoup - recoup)
  return whole((receipts - recoup) * pr.devShare)
}

function releaseBlock(g: GameState, pr: GdProject): string | null {
  return firstReason(makeBlock(g), pr.progress < 75 ? `It's only ${Math.round(pr.progress)}% done. Even "release now, patch later" has limits.` : null)
}

/** Ship a game: reviews, launch-week sales, the credit. Returns the credit (or null). */
export function releaseGame(g: GameState, id: string): GdCredit | null {
  const p = gdMut(g)
  const pr = projectById(p, id)
  if (!pr) return null
  const reason = releaseBlock(g, pr)
  if (reason) {
    tell(g, 'Release', reason, '\u{1F680}')
    return null
  }
  const c = g.character
  const cert = certCost(g, pr.platform)
  if (cert > 0) {
    const fromBudget = Math.min(pr.budget, cert)
    if (c.money < cert - fromBudget) {
      tell(g, 'Certification', `Shipping on ${platformLabel(pr.platform, g.year)} costs ${money(cert)} for dev kits, certification and age ratings. You have ${money(Math.max(0, c.money))}${pr.budget > 0 ? ` plus ${money(pr.budget)} in the budget` : ''}.`, '\u{1F4B8}')
      return null
    }
    pr.budget -= fromBudget
    c.money -= cert - fromBudget
    pr.spent += cert - fromBudget
  }
  const unfinished = Math.max(0, 100 - pr.progress)
  const bugs = clampN(pr.bugs + unfinished * 1.5, 0, 100)
  // Whether the fun really came together is only clear at launch, however good the team is.
  const execution = (rand(g) + rand(g) + rand(g) - 1.5) * 12
  const finalQ = clampN(pr.quality - bugs * 0.12 - unfinished * 0.3 + execution, 3, 99)
  const prev = pr.sequelOf ? p.games.find((x) => x.id === pr.sequelOf) : undefined
  const sequels = pr.franchise ? p.games.filter((x) => x.franchise === pr.franchise && x.own).length : 0
  const fans = prev ? clampN((prev.players - 60) / 30, -1, 1) : 0
  const r = reviewScores(g, finalQ, { bugs, hype: pr.hype, fans })
  const franchise = prev ? clampN(Math.min(1, prev.copies / Math.max(1, scopeDef(prev.scope).potential * 0.3)) * (prev.players / 100) * Math.pow(0.85, Math.max(0, sequels - 1)), 0, 1) : 0
  const price = priceOf(pr.scope, pr.platform)
  const firstYear0 = firstYearCopies(g, {
    scope: pr.scope,
    genre: pr.genre,
    platform: pr.platform,
    quality: (r.critic + r.players) / 2,
    hype: pr.hype,
    // Indie labels have indie marketing budgets (the big publishers sign studios, not solo devs).
    marketing: pr.publisher ? 1.1 : 0.55 + Math.min(0.45, pr.hype / 200),
    reach: homeReach(c.countryId) * (pr.publisher ? 1.05 : 0.75),
    fame: p.gamerFame,
    franchise,
    presold: pr.backers + pr.eaCopies,
  })
  const fatigue = releaseFatigue(p, g.year)
  const firstYear = whole(firstYear0 * fatigue)
  const launch = whole(firstYear * 0.2)
  const credit: GdCredit = {
    id: nextId(p, 'gc'),
    title: pr.title,
    genre: pr.genre,
    platform: pr.platform,
    scope: pr.scope,
    engine: pr.engine,
    role: pr.contractors > 0 ? 'Creator & Lead Developer' : 'Solo Developer',
    studio: pr.publisher ? `Published by ${pr.publisher}` : 'Self-published',
    own: true,
    free: false,
    year: g.year,
    age: c.age,
    critic: r.critic,
    players: r.players,
    copies: launch + pr.backers + pr.eaCopies,
    tail: whole(firstYear - launch),
    price,
    gross: 0,
    earned: 0,
    dlcs: 0,
    lastDlc: 0,
    patched: 0,
    franchise: pr.franchise || (r.critic >= 75 ? pr.title : ''),
    publisher: pr.publisher,
    recoup: pr.recoup,
    devShare: pr.publisher ? pr.devShare : 1,
    awards: [],
  }
  const receipts = whole(launch * netPerCopy(price))
  let pay = settleReceipts(credit, receipts)
  // Whatever is left in the budget (crowdfunding, advances) is yours now; the final milestone
  // payment only comes if the publisher thinks the game is any good.
  const leftover = whole(pr.budget)
  const milestone = pr.advanceDue > 0 && r.critic >= 50 ? pr.advanceDue : 0
  pay += leftover + milestone
  const tax = pay > 0 ? earnNow(g, pay) : 0
  p.projects = p.projects.filter((x) => x.id !== pr.id)
  p.games.push(credit)
  // Fame: a hit makes your name.
  // Bigger games make bigger names, and the last steps to household-name status are the hardest.
  const fameGain = Math.round(Math.max(0, (r.critic - 55) / 6) * (0.5 + Math.log10(1 + firstYear) / 6) * (pr.scope === 'indie' ? 1 : 0.6) * Math.max(0.2, 1 - p.gamerFame / 125))
  addGamerFame(p, fameGain)
  if (fameGain >= 6) addFame(g, Math.round(fameGain / 3))
  trainDesign(g, p, 3)
  tidy(p)
  count(g, 'gamesShipped')
  count(g, 'gamesReleased')
  addStat(g, 'happiness', r.critic >= 80 ? 12 : r.critic >= 60 ? 6 : -3)
  log(g, `I released "${credit.title}": ${r.critic} from critics, "${playerLabel(r.players)}" from players.`, r.critic >= 60 ? 'good' : 'bad')
  remember(g, `Released "${credit.title}" (${genreDef(credit.genre).label}); critics ${r.critic}, players ${r.players}.`)
  const verdict =
    r.critic >= 90
      ? `Critics are calling it a masterpiece.`
      : r.critic >= 80
        ? `Critics love it.`
        : r.critic >= 65
          ? `Reviews are solid.`
          : r.critic >= 45
            ? `Reviews are mixed.`
            : pickLine(g, ['Critics were brutal. One review was just the word "why."', 'It is being called "a war crime against fun."'])
  const extra = [
    fatigue < 1 ? 'Your last release is still on the front page, so this one got less attention than it deserved.' : '',
    c.age < 18 ? pickLine(g, ["Your parents set up the store account and now introduce you as \"our little CEO.\"", 'The store account is in your mom\'s name. She has already read every review out loud at dinner.']) : '',
    leftover > 0 ? `${money(leftover)} left in the project budget is yours.` : '',
    milestone > 0 ? `${pr.publisher} paid the final ${money(milestone)} of your advance.` : pr.advanceDue > 0 ? `${pr.publisher} withheld the final ${money(pr.advanceDue)} milestone payment over the quality.` : '',
    tax > 0 ? `${money(tax)} went to taxes.` : '',
  ]
    .filter(Boolean)
    .join(' ')
  say(
    g,
    'Launch Day!',
    `"${credit.title}" is out on ${platformLabel(credit.platform, g.year)}! ${verdict} ${CRITIC_SITE} score ${r.critic}; players say "${playerLabel(r.players)}". ${copiesLabel(launch)} sold in launch week${pr.backers ? ` (plus ${pr.backers.toLocaleString('en-US')} backers)` : ''}; expect about ${copiesLabel(credit.tail)} more this year.${pay > 0 ? ` You made ${money(pay)}.` : ''} ${extra}`.trim(),
    '\u{1F680}',
    r.critic >= 60 ? 'good' : 'bad',
  )
  return credit
}

function shelve(g: GameState, id: string): void {
  const p = gdMut(g)
  const pr = projectById(p, id)
  if (!pr) return
  p.projects = p.projects.filter((x) => x.id !== id)
  let text = `You shelved "${pr.title}" at ${Math.round(pr.progress)}%. The folder now lives in "old stuff/do not open".`
  if (pr.raised > 1) {
    addGamerFame(p, -8)
    addHidden(g, 'karma', -6)
    text += ` ${pr.backers.toLocaleString('en-US')} backers did not take it well. The comments section is a war zone, and the ${money(pr.budget)} left in the budget went back to them as partial refunds.`
  }
  if (pr.publisher) {
    count(g, 'gamedevShelvedSigned')
    text += ` ${pr.publisher} wrote off its advance and won't forget it.`
  }
  log(g, `I shelved my game "${pr.title}".`, 'neutral')
  say(g, 'Shelved', text, '\u{1F5C4}\u{FE0F}', pr.raised > 1 ? 'bad' : 'neutral')
}

// ---------------------------------------------------------------------------
// Released games: patches, DLC, discounts, sequels

function patchGame(g: GameState, id: string): void {
  const reason = makeBlock(g)
  if (reason) return tell(g, 'Patch', reason, '\u{1FA79}')
  const p = gdMut(g)
  const x = ownGame(p, id)
  if (!x) return
  if (x.patched === g.year || !useYearAction(g, `gamedev.patch.${id}`, 1)) return tell(g, 'Patch', 'You already patched it this year.', '\u{1FA79}')
  if (!useYearAction(g, 'gamedev.work', MAX_WORK)) return tell(g, 'Patch', `You've already had ${MAX_WORK} long dev sessions this year.`, '\u{1F634}')
  useComputer(g, 1)
  x.patched = g.year
  const room = Math.max(0, x.critic + 12 - x.players)
  const up = Math.min(room, randInt(g, 3, 8))
  x.players = Math.round(clampN(x.players + up, 0, 99))
  if (x.tail > 0) x.tail = whole(x.tail * 1.08)
  say(g, 'Patch Released', `You shipped patch 1.0.${randInt(g, 2, 9)} for "${x.title}": ${pickLine(g, ['fixed the floating hat', 'the final boss no longer clips into the ceiling', 'you can now actually pet the dog', 'saves no longer delete themselves on Tuesdays'])}. ${up > 0 ? `Player rating up to ${x.players} ("${playerLabel(x.players)}").` : 'Players appreciated it, but it is about as good as it gets.'}`, '\u{1FA79}', 'good')
}

function releaseDlc(g: GameState, id: string): void {
  const reason = makeBlock(g)
  if (reason) return tell(g, 'DLC', reason, '\u{1F381}')
  const p = gdMut(g)
  const x = ownGame(p, id)
  if (!x) return
  if (x.year >= g.year) return tell(g, 'DLC', 'Give the base game a year before selling more of it.', '\u{1F381}')
  if (x.dlcs >= 6) return tell(g, 'DLC', 'Six expansions. The fans are begging for a sequel instead.', '\u{1F381}')
  if (x.lastDlc === g.year || !useYearAction(g, `gamedev.dlc.${id}`, 1)) return tell(g, 'DLC', 'One expansion a year.', '\u{1F381}')
  if (!useYearAction(g, 'gamedev.work', MAX_WORK)) return tell(g, 'DLC', `You've already had ${MAX_WORK} long dev sessions this year.`, '\u{1F634}')
  useComputer(g, 2)
  const skill = genreSkill(x.genre, codingSkill(g), artSkill(g, p), designSkill(g, p))
  const q = clampN((skill + x.critic) / 2 + randInt(g, -12, 12), 0, 100)
  x.lastDlc = g.year
  if (q < 40) {
    x.players = Math.round(clampN(x.players - 4, 0, 99))
    return say(g, 'DLC Flopped', `The "${pickLine(g, ['Horse Armor', 'Fishing', 'Season Pass', 'Hat Pack'])}" expansion for "${x.title}" was called "a cash grab" in ${randInt(g, 3, 40)} languages. Player rating down to ${x.players}.`, '\u{1F41F}', 'bad')
  }
  x.dlcs += 1
  const extra = whole(x.copies * 0.12 * (qualityFactor(q) / qualityFactor(70)) * Math.pow(0.75, x.dlcs - 1))
  x.tail = whole(x.tail + Math.min(extra, x.copies * 0.3) * 0.5)
  x.players = Math.round(clampN(x.players + randInt(g, 0, 3), 0, 99))
  trainDesign(g, p, 2)
  log(g, `I released an expansion for "${x.title}".`, 'good')
  say(g, 'Expansion Out', `"${x.title}: ${pickLine(g, ['The Lost Isles', 'Beyond the Rift', 'Return of the Goblin', 'Winter Tales', 'Into the Deep'])}" is out. Reviews: "${playerLabel(q)}". Sales should pick up this year.`, '\u{1F381}', 'good')
}

function runSale(g: GameState, id: string): void {
  const reason = blocked(g)
  if (reason) return tell(g, 'Sale', reason, '\u{1F3F7}\u{FE0F}')
  const p = gdMut(g)
  const x = ownGame(p, id)
  if (!x || x.price <= 0 || x.tail <= 0) return
  if (!useYearAction(g, `gamedev.sale.${id}`, 1)) return tell(g, 'Sale', 'One big sale a year, or nobody pays full price ever again.', '\u{1F3F7}\u{FE0F}')
  const copies = whole(x.tail * randFloat(g, 0.25, 0.4))
  const receipts = whole(copies * netPerCopy(x.price * 0.5))
  x.tail = whole(x.tail * 0.88)
  x.copies = whole(x.copies + copies)
  const pay = settleReceipts(x, receipts)
  const tax = pay > 0 ? earnNow(g, pay) : 0
  say(g, '50% Off!', `"${x.title}" was half price for a week and sold ${copiesLabel(copies)}.${pay > 0 ? ` ${money(pay)} to you${tax > 0 ? ` (${money(tax)} in tax)` : ''}.` : x.publisher ? ` ${x.publisher} kept it toward the advance.` : ''} Some people who would have paid full price waited for it, of course.`, '\u{1F3F7}\u{FE0F}', 'good')
}

// ---------------------------------------------------------------------------
// Game jams and hobby projects

/** A weekend game jam: free to enter, great for skills and the portfolio. */
export function gameJam(g: GameState): void {
  const reason = makeBlock(g, 10)
  if (reason) return tell(g, 'Game Jam', reason, '\u{1F355}')
  if (!useYearAction(g, 'gamedev.jam', 2)) return tell(g, 'Game Jam', 'Two jams a year is plenty. Your sleep schedule is already a crime scene.', '\u{1F355}')
  useComputer(g, 2)
  const p = gdMut(g)
  const c = g.character
  const theme = pick(g, JAM_THEMES)
  const genre = pick(g, GENRES)
  const engine: EngineId = codingSkill(g) < 25 && c.age < 16 ? 'blocks' : 'cobalt'
  const skill = genreSkill(genre.id, codingSkill(g), artSkill(g, p), designSkill(g, p))
  const q = Math.round(clampN(skill + 14 + engineDef(engine).bonus + (hasTalent(g, 'Gaming') ? 6 : 0) + randInt(g, -15, 15), 3, 99))
  const entrants = randInt(g, 300, 4_000)
  const pct = clampN(1 - qualityFactor(q) / 2 - randFloat(g, -0.08, 0.08), 0.001, 0.99)
  const rank = Math.max(1, Math.round(entrants * pct))
  const used = new Set(p.games.map((x) => x.title))
  const title = gameTitle(g, genre.id, used)
  const plays = whole(400 * qualityFactor(q) * luckRoll(g, 'jam') * 10 + randInt(g, 5, 60))
  p.jams += 1
  p.games.push({
    id: nextId(p, 'gc'),
    title,
    genre: genre.id,
    platform: 'pc',
    scope: 'jam',
    engine,
    role: 'Jam Entry',
    studio: 'Midnight Pizza Jam',
    own: true,
    free: true,
    year: g.year,
    age: c.age,
    critic: q,
    players: Math.round(clampN(q + randInt(g, -8, 8), 1, 99)),
    copies: plays,
    tail: 0,
    price: 0,
    gross: 0,
    earned: 0,
    dlcs: 0,
    lastDlc: 0,
    patched: 0,
    franchise: '',
    publisher: '',
    recoup: 0,
    devShare: 1,
    awards: [],
  })
  practice(g, 2, bestLanguageFor(g, 'games')?.id ?? null, 1)
  trainDesign(g, p, 3)
  trainArt(g, p, 2)
  addStat(g, 'happiness', randInt(g, 2, 5))
  let award = ''
  if (rank <= 3) {
    award = `${AWARDS.jam.replace('gold', rank === 1 ? 'gold' : rank === 2 ? 'silver' : 'bronze')} for "${title}" (age ${c.age})`
    p.awards.push(award)
    addGamerFame(p, rank === 1 ? 3 : 2)
    remember(g, `Placed #${rank} of ${entrants.toLocaleString('en-US')} at a game jam with "${title}".`)
  } else if (rank <= 20) addGamerFame(p, 1)
  tidy(p)
  log(g, `I made "${title}" in 48 hours for a game jam (theme: "${theme}") and placed #${rank} of ${entrants.toLocaleString('en-US')}.`, rank <= 50 ? 'good' : 'neutral')
  say(
    g,
    'Game Jam',
    `Theme: "${theme}". You made "${title}", ${an(genre.noun)}, in 48 hours on pizza and adrenaline. It placed #${rank} of ${entrants.toLocaleString('en-US')} entries${rank <= 3 ? ` and won a ${rank === 1 ? 'gold' : rank === 2 ? 'silver' : 'bronze'} medal!` : rank <= 50 ? '. Not bad at all!' : '. The important thing is you finished. Most people don\'t.'} ${copiesLabel(plays, true)} so far.`,
    '\u{1F355}',
    rank <= 50 ? 'good' : 'neutral',
  )
}

function study(g: GameState, kind: 'videos' | 'course' | 'draw' | 'artClass'): void {
  const minAge = kind === 'course' ? 13 : kind === 'artClass' ? 10 : kind === 'videos' ? 8 : 6
  const reason = blocked(g, minAge)
  if (reason) return tell(g, 'Learn', reason, '\u{1F4DA}')
  const key = kind === 'videos' || kind === 'course' ? `gamedev.study.${kind}` : `gamedev.art.${kind}`
  if (!useYearAction(g, key, kind === 'videos' || kind === 'draw' ? 2 : 1)) return tell(g, 'Learn', 'You already did that as much as you can this year.', '\u{1F4DA}')
  const p = gdMut(g)
  const cost = kind === 'course' ? onlinePrice(g, 300) : kind === 'artClass' ? localFee(g, 400) : 0
  if (cost > 0) {
    if (g.character.money < cost) return tell(g, "Can't Afford It", `That costs ${money(cost)}. You have ${money(Math.max(0, g.character.money))}.`, '\u{1F4B8}')
    g.character.money -= cost
  }
  let gain = 0
  let text = ''
  if (kind === 'videos') {
    gain = trainDesign(g, p, 3)
    text = eraOpen(g, VIDEO_GATE)
      ? `You watched ${randInt(g, 6, 30)} hours of video essays about why old games felt good. You now say "game feel" in conversations.`
      : `You read ${randInt(g, 3, 12)} back issues of game magazines and took notes on every review. You now say "playability" in conversations.`
  } else if (kind === 'course') {
    gain = trainDesign(g, p, 7)
    trainArt(g, p, 1)
    text = `You finished ${eraOpen(g, ONLINE_COURSE_GATE) ? 'an online' : 'a night-school'} game design course (${money(cost)}). Final project: a board game about tax fraud. You got an A.`
  } else if (kind === 'draw') {
    gain = trainArt(g, p, 3)
    text = pickLine(g, ['You drew 200 hands. Three of them look like hands.', 'You practiced pixel art: a sword, a slime, and a very determined potato.', 'You filled a sketchbook with goblins.'])
  } else {
    gain = trainArt(g, p, 7)
    text = `You took an art class (${money(cost)}). The teacher said your perspective is "brave."`
  }
  const which = kind === 'videos' || kind === 'course' ? `Game design ${designSkill(g, p)}` : `Art ${artSkill(g, p)}`
  say(g, 'Practice', `${text}\n\n${which}/100${gain > 0 ? ` (+${gain})` : ' (you\'ve hit your limit for now)'}`, kind === 'draw' || kind === 'artClass' ? '\u{1F3A8}' : '\u{1F4DA}', 'good')
}

function streamDev(g: GameState): void {
  const reason = makeBlock(g, 13)
  if (reason) return tell(g, 'Stream', reason, '\u{1F3A5}')
  if (!useYearAction(g, 'gamedev.stream', 1)) return tell(g, 'Stream', 'You already streamed your dev work this year.', '\u{1F3A5}')
  useComputer(g, 1)
  const p = gdMut(g)
  const followers = totalFollowers(g)
  const gain = addGamerFame(p, randInt(g, 0, 2) + (followers >= 100_000 ? 2 : followers >= 5_000 ? 1 : 0))
  for (const pr of p.projects) pr.hype = clampN(pr.hype + 6, 0, 100)
  const viewers = Math.max(1, Math.round((3 + p.gamerFame * 20 + followers * 0.01) * randFloat(g, 0.5, 1.5)))
  say(g, 'Live Dev Stream', `You streamed yourself making a game. Peak viewers: ${viewers.toLocaleString('en-US')}. ${pickSite(g, ['Chat named a bug after you.', `Someone donated ${money(5)} to make you add a hat to the boss. You did.`, 'Chat watched you debug for two hours and cheered when it worked.'], 0xbd566ce5)}${gain > 0 ? ' More gamers know your name now.' : ''}`, '\u{1F3A5}', 'good')
}

// ---------------------------------------------------------------------------
// Yearly

export interface MakeYear {
  sold: number
  paid: number
}

/** Yearly: your games' sales, freelancers working (and getting paid), early access, backers. */
export function yearlyMakeGames(g: GameState): MakeYear {
  const out: MakeYear = { sold: 0, paid: 0 }
  const c = g.character
  const p = gdMut(g)
  const mood = industryYear(g).mult
  // Released games sell (royalties keep coming, even from prison).
  for (const x of p.games) {
    if (!x.own || x.tail <= 0) continue
    const copies = whole(x.tail * mood * randFloat(g, 0.85, 1.15))
    x.copies = whole(x.copies + copies)
    x.tail = nextTail(copies, x.players, x.scope)
    if (x.free || x.price <= 0) continue
    out.sold += copies
    out.paid += settleReceipts(x, whole(copies * netPerCopy(x.price)))
  }
  // Games in development.
  for (const pr of [...p.projects]) {
    if (c.prison) {
      if (pr.contractors > 0) {
        pr.contractors = 0
        log(g, `The freelancers on "${pr.title}" stopped working when I went to prison.`, 'bad')
      }
      continue
    }
    if (pr.contractors > 0) {
      // The year's work they were paid for.
      pr.progress = clampN(pr.progress + freelancerProgress(pr) * randFloat(g, 0.8, 1.2), 0, 100)
      const cap = qualityCap(g, pr, p)
      if (cap > pr.quality) pr.quality = clampN(pr.quality + (cap - pr.quality) * 0.15 * pr.contractors, 0, 100)
      // Contracts renew for the new year, paid up front (project budget first): keep whoever you can pay.
      const each = freelancerCost(c.countryId)
      const keep = each > 0 ? Math.min(pr.contractors, Math.floor((pr.budget + Math.max(0, c.money)) / each)) : pr.contractors
      const due = keep * each
      const fromBudget = Math.min(pr.budget, due)
      pr.budget -= fromBudget
      c.money -= due - fromBudget
      pr.spent += due - fromBudget
      if (keep < pr.contractors) log(g, `I couldn't afford to renew ${pr.contractors - keep === 1 ? 'a freelancer' : `${pr.contractors - keep} freelancers`} on "${pr.title}", so they moved on.`, 'bad')
      pr.contractors = keep
    }
    pr.contractorsPaid = pr.contractors
    if (pr.earlyAccess && pr.eaTail > 0) {
      const copies = whole(pr.eaTail * mood * randFloat(g, 0.85, 1.15))
      pr.eaCopies = whole(pr.eaCopies + copies)
      pr.eaTail = whole(copies * 0.55)
      pr.eaYears += 1
      out.sold += copies
      out.paid += eaPayout(pr, whole(copies * netPerCopy(priceOf(pr.scope, pr.platform) * 0.8)))
    }
    // Hype fades unless you keep feeding it (devlogs, trailers, streams).
    pr.hype = clampN(pr.hype * 0.85, 0, 100)
    // Backers expect delivery.
    const overdue = g.year - pr.started - (scopeDef(pr.scope).years + 2)
    if (pr.raised > 1 && overdue > 0) {
      pr.hype = clampN(pr.hype - 10, 0, 100)
      addGamerFame(p, -2)
      log(g, `Backers of "${pr.title}" are furious it still isn't out.`, 'bad')
    }
    if (g.year - pr.lastWorked >= 7 && pr.contractors === 0 && !pr.earlyAccess) {
      p.projects = p.projects.filter((x) => x.id !== pr.id)
      if (pr.publisher) count(g, 'gamedevShelvedSigned')
      log(g, `I finally admitted "${pr.title}" will never be finished.`, 'neutral')
    }
  }
  tidy(p)
  if (out.paid > 0) {
    earnIncome(g, out.paid)
    count(g, 'gameRoyalties', out.paid)
    log(g, `My games sold ${copiesLabel(out.sold)} this year and made me ${money(out.paid)}.`, 'good')
  } else if (out.sold > 0) {
    log(g, `My games sold ${copiesLabel(out.sold)} this year (the publisher is still earning back its advance).`, 'neutral')
  }
  return out
}

// ---------------------------------------------------------------------------
// Menus

function projectNode(pr: GdProject): MenuGroup {
  const id = pr.id
  const live = (gg: GameState) => gdView(gg).projects.find((x) => x.id === id)
  return {
    type: 'menu',
    id: `gamedev.project.${id}`,
    label: pr.title,
    emoji: genreDef(pr.genre).emoji,
    subtitle: `${scopeDef(pr.scope).label} ${genreDef(pr.genre).label} · ${Math.round(pr.progress)}%${pr.earlyAccess ? ' · early access' : ''}${pr.publisher ? ` · ${pr.publisher}` : ''}`,
    header: (gg) => {
      const cur = live(gg)
      if (!cur) return 'This project is gone.'
      const cap = qualityCap(gg, cur)
      return [
        `${genreDef(cur.genre).emoji} "${cur.title}": ${an(genreDef(cur.genre).noun)} for ${platformLabel(cur.platform, gg.year)}, made in ${engineDef(cur.engine).label}.`,
        `Progress ${Math.round(cur.progress)}% · quality ${Math.round(cur.quality)} (your team could reach ~${Math.round(cap)}) · hype ${Math.round(cur.hype)}${cur.bugs >= 10 ? ` · bugs ${Math.round(cur.bugs)}` : ''}`,
        `${cur.contractors ? `Freelancers: ${cur.contractors} (${money(cur.contractors * freelancerCost(gg.character.countryId))}/yr)` : 'Just you.'}${cur.budget > 0 ? ` Budget: ${money(cur.budget)}.` : ''}${cur.backers ? ` Backers: ${cur.backers.toLocaleString('en-US')}.` : ''}${cur.publisher ? ` Publisher: ${cur.publisher}.` : ''}`,
        `${genreDef(cur.genre).label} games are ${trendLabel(genreTrend(gg, cur.genre))} this year.`,
      ].join('\n')
    },
    children: (gg) => {
      const cur = live(gg)
      if (!cur) return [{ type: 'info', id: `gamedev.project.${id}.gone`, text: 'This project is gone.' }]
      const nodes: MenuNode[] = [
        {
          type: 'action',
          id: `gamedev.project.${id}.work`,
          label: cur.progress >= 100 ? 'Polish It' : 'Work on It',
          emoji: '\u{1F468}\u{200D}\u{1F4BB}',
          subtitle: (x) => `${yearActionsUsed(x, 'gamedev.work')}/${MAX_WORK} dev sessions this year · ~${Math.round(sessionRate(x, cur))}% per session`,
          disabledReason: (x) => makeBlock(x) ?? (yearActionsUsed(x, 'gamedev.work') >= MAX_WORK ? 'You are out of dev sessions this year.' : null),
          run: (x) => workOnGame(x, id),
        },
        {
          type: 'action',
          id: `gamedev.project.${id}.crunch`,
          label: 'Crunch on It',
          emoji: '\u{1F35C}',
          subtitle: 'Once a year · big progress; costs health, adds bugs',
          visible: () => cur.progress < 100,
          disabledReason: (x) => makeBlock(x) ?? (yearActionsUsed(x, 'gamedev.crunch') >= 1 ? 'You already crunched this year.' : null),
          run: (x) => workOnGame(x, id, true),
        },
        {
          type: 'action',
          id: `gamedev.project.${id}.release`,
          label: cur.progress >= 100 ? 'Release It' : 'Release It Unfinished',
          emoji: '\u{1F680}',
          subtitle: cur.progress >= 100 ? 'Ship it to critics and players' : 'Release now, patch later (more bugs, worse reviews)',
          disabledReason: (x) => releaseBlock(x, cur),
          confirm: () => (cur.progress >= 100 ? `Release "${cur.title}"?` : `"${cur.title}" is only ${Math.round(cur.progress)}% done. Release it anyway?`),
          run: (x) => {
            releaseGame(x, id)
          },
        },
        { type: 'heading', id: `gamedev.project.${id}.h.money`, label: 'Team, Hype & Money' },
        {
          type: 'action',
          id: `gamedev.project.${id}.hire`,
          label: 'Hire a Freelancer',
          emoji: '\u{1F3A8}',
          subtitle: (x) => `${money(freelancerCost(x.character.countryId))}/yr, paid up front · art, music, speed · ${cur.contractors}/3`,
          disabledReason: (x) => blocked(x) ?? (cur.contractors >= 3 ? 'Three is the most you can manage.' : null),
          run: (x) => contractor(x, id, 1),
        },
        ...(cur.contractors > 0 ? [{ type: 'action', id: `gamedev.project.${id}.fire`, label: 'Let a Freelancer Go', emoji: '\u{1F44B}', disabledReason: (x: GameState) => blocked(x), run: (x: GameState) => contractor(x, id, -1) } as MenuAction] : []),
        {
          type: 'action',
          id: `gamedev.project.${id}.devlog`,
          visible: (x) => gamedevFeatureOpen('devlog', x.year),
          label: 'Post a Devlog',
          emoji: '\u{1F4DD}',
          subtitle: 'Free · a little hype',
          disabledReason: (x) => makeBlock(x) ?? (yearActionsUsed(x, `gamedev.devlog.${id}`) >= 1 ? 'Once a year.' : null),
          run: (x) => devlog(x, id, false),
        },
        {
          type: 'action',
          id: `gamedev.project.${id}.trailer`,
          label: 'Cut a Trailer',
          emoji: '\u{1F3AC}',
          subtitle: (x) => `${money(localFee(x, scopeDef(cur.scope).id === 'indie' ? 5_000 : 1_200))} · lots of hype`,
          disabledReason: (x) => blocked(x) ?? (yearActionsUsed(x, `gamedev.trailer.${id}`) >= 1 ? 'Once a year.' : null),
          run: (x) => devlog(x, id, true),
        },
        {
          type: 'action',
          id: `gamedev.project.${id}.crowd`,
          label: 'Crowdfund It',
          emoji: '\u{1F4B8}',
          subtitle: 'All or nothing; backers expect delivery',
          visible: (x) => x.character.age >= 16 && gamedevFeatureOpen('crowdfund', x.year),
          disabledReason: (x) => crowdBlock(x, cur),
          run: (x) => crowdfund(x, id),
        },
        {
          type: 'action',
          id: `gamedev.project.${id}.publisher`,
          label: 'Pitch to Publishers',
          emoji: '\u{1F91D}',
          subtitle: 'An advance and marketing, for a cut of sales',
          visible: (x) => x.character.age >= 16,
          disabledReason: (x) => publisherBlock(x, cur) ?? (yearActionsUsed(x, `gamedev.pitch.${id}`) >= 1 ? 'Once a year per game.' : null),
          run: (x) => pitchPublishers(x, id),
        },
        {
          type: 'action',
          id: `gamedev.project.${id}.ea`,
          label: 'Launch in Early Access',
          emoji: '\u{1F6A7}',
          subtitle: 'Sell it unfinished; feedback improves it',
          visible: (x) => !cur.earlyAccess && (cur.platform === 'pc' || cur.platform === 'vr') && gamedevFeatureOpen('earlyAccess', x.year),
          disabledReason: (x) => eaBlock(x, cur),
          run: (x) => earlyAccess(x, id),
        },
        {
          type: 'action',
          id: `gamedev.project.${id}.shelve`,
          label: 'Shelve It',
          emoji: '\u{1F5C4}\u{FE0F}',
          confirm: () => `Shelve "${cur.title}" for good?${cur.raised > 1 ? ' Your backers will be furious.' : ''}`,
          disabledReason: (x) => blocked(x),
          run: (x) => shelve(x, id),
        },
      ]
      return nodes
    },
  }
}

/** One released game of your own: numbers and actions. */
export function ownGameNode(x: GdCredit): MenuGroup {
  const id = x.id
  const live = (gg: GameState) => gdView(gg).games.find((y) => y.id === id)
  return {
    type: 'menu',
    id: `gamedev.game.${id}`,
    label: x.title,
    emoji: genreDef(x.genre).emoji,
    subtitle: `${x.year} · critics ${x.critic} · ${copiesLabel(x.copies, x.free)}${x.earned > 0 ? ` · ${money(x.earned)} earned` : ''}`,
    header: (gg) => {
      const cur = live(gg)
      if (!cur) return 'Gone.'
      return [
        `${genreDef(cur.genre).emoji} "${cur.title}" (${cur.year}): ${scopeDef(cur.scope).label} ${genreDef(cur.genre).label} on ${platformLabel(cur.platform, cur.year)}.`,
        `${CRITIC_SITE} ${cur.critic} · players ${cur.players} ("${playerLabel(cur.players)}") · ${copiesLabel(cur.copies, cur.free)}${cur.dlcs ? ` · ${cur.dlcs} DLC` : ''}`,
        cur.free ? 'A free jam game: no sales, all glory.' : `Earned you ${money(cur.earned)} so far${cur.tail > 0 ? ` · still selling (~${copiesLabel(cur.tail)} next year)` : ' · done selling'}.`,
        cur.publisher ? `Published by ${cur.publisher}${cur.recoup > 0 ? ` (still earning back ${money(cur.recoup)} before royalties)` : ` · you get ${Math.round(cur.devShare * 100)}%`}.` : '',
        cur.awards.length ? `\u{1F3C6} ${cur.awards.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    },
    children: (gg) => {
      const cur = live(gg)
      if (!cur || cur.free) return [{ type: 'info', id: `gamedev.game.${id}.free`, emoji: '\u{1F355}', text: 'Jam games are free and live forever on the jam page.' }]
      return [
        {
          type: 'action',
          id: `gamedev.game.${id}.patch`,
          label: 'Ship a Patch',
          emoji: '\u{1FA79}',
          subtitle: 'Fix bugs, win back players · uses a dev session',
          visible: (y) => gamedevFeatureOpen('patch', y.year),
          disabledReason: (y) => makeBlock(y) ?? (cur.patched === y.year ? 'Already patched this year.' : null),
          run: (y) => patchGame(y, id),
        },
        {
          type: 'action',
          id: `gamedev.game.${id}.dlc`,
          label: 'Release an Expansion',
          emoji: '\u{1F381}',
          subtitle: `New content, new sales · ${cur.dlcs}/6 so far`,
          disabledReason: (y) => makeBlock(y) ?? (cur.year >= y.year ? 'Wait a year after launch.' : cur.lastDlc === y.year ? 'One a year.' : null),
          run: (y) => releaseDlc(y, id),
        },
        {
          type: 'action',
          id: `gamedev.game.${id}.sale`,
          label: 'Run a 50% Sale',
          emoji: '\u{1F3F7}\u{FE0F}',
          subtitle: 'Cash now, a bit less later',
          visible: (y) => cur.tail > 0 && cur.price > 0 && gamedevFeatureOpen('sale', y.year),
          disabledReason: (y) => blocked(y) ?? (yearActionsUsed(y, `gamedev.sale.${id}`) >= 1 ? 'Once a year.' : null),
          run: (y) => runSale(y, id),
        },
        {
          type: 'action',
          id: `gamedev.game.${id}.sequel`,
          label: 'Make a Sequel',
          emoji: '\u{1F501}',
          subtitle: cur.critic >= 50 ? 'Build on what worked' : 'Nobody asked for one',
          disabledReason: (y) => startBlock(y) ?? (cur.critic < 50 ? 'It flopped. Nobody wants a sequel.' : null),
          run: (y) => {
            const pp = gdView(y)
            const franchise = cur.franchise || cur.title
            const nth = pp.games.filter((z) => z.own && (z.franchise === franchise || z.title === franchise)).length + 1
            startGame(y, { genre: cur.genre, franchise, sequelOf: cur.id, title: sequelTitle(franchise, Math.max(2, nth)) })
          },
        },
      ]
    },
  }
}

/** Game Industry › Make Games. */
export const makeGamesMenu: MenuGroup = {
  type: 'menu',
  id: 'gamedev.make',
  label: 'Make Games',
  emoji: '\u{1F579}\u{FE0F}',
  subtitle: (g) => {
    const p = gdView(g)
    return p.projects.length ? `${p.projects.length} in development · ${yearActionsUsed(g, 'gamedev.work')}/${MAX_WORK} dev sessions` : 'Jams, hobby games and real releases'
  },
  visible: (g) => g.character.age >= 6,
  disabledReason: (g) => blocked(g),
  header: (g) => {
    const p = gdView(g)
    const hot = hotGenres(g)
      .map((x) => x.label)
      .join(' and ')
    const comp = computerBlock(g)
    return `Coding ${codingSkill(g)} · design ${designSkill(g, p)} · art ${artSkill(g, p)} · gamer fame ${p.gamerFame}\n${comp ? `${comp} You need a working computer to make games.` : `Hot genres this year: ${hot}.`}`
  },
  children: (g) => {
    const c = g.character
    const p = gdView(g)
    const nodes: MenuNode[] = []
    if (p.projects.length) {
      nodes.push({ type: 'heading', id: 'gamedev.make.h.dev', label: 'In Development' })
      for (const pr of p.projects) nodes.push(projectNode(pr))
    }
    nodes.push({ type: 'heading', id: 'gamedev.make.h.new', label: 'Start Something' })
    nodes.push({
      type: 'action',
      id: 'gamedev.make.new',
      label: 'Develop a Game',
      emoji: '\u{1F3AE}',
      subtitle: (gg) => `Small or indie · ${gdView(gg).projects.length}/${maxProjects(gg)} at a time · age 12+`,
      visible: (gg) => gg.character.age >= 12,
      disabledReason: startBlock,
      run: (gg) => startGame(gg),
    })
    nodes.push({
      type: 'action',
      id: 'gamedev.make.jam',
      label: 'Enter a Game Jam',
      emoji: '\u{1F355}',
      subtitle: (gg) => `Make a game in 48 hours · ${yearActionsUsed(gg, 'gamedev.jam')}/2 this year`,
      visible: (gg) => gg.character.age >= 10 && scopeOpen('jam', gg.year),
      disabledReason: (gg) => makeBlock(gg, 10) ?? (yearActionsUsed(gg, 'gamedev.jam') >= 2 ? 'Two jams a year.' : null),
      run: gameJam,
    })
    for (const kindId of ['scratch', 'mod']) {
      const kind = PROJECT_KINDS.find((k) => k.id === kindId)
      if (!kind) continue
      nodes.push({
        type: 'action',
        id: `gamedev.make.${kind.id}`,
        label: kind.id === 'scratch' ? 'Make a Scratch Game' : 'Make a Game Mod',
        emoji: kind.emoji,
        subtitle: `Coding skill ${kind.minSkill}+ · shares the computer's 2 projects a year`,
        visible: (gg) => gg.character.age >= kind.minAge && (kind.maxAge === undefined || gg.character.age <= kind.maxAge) && eraOpen(gg, kind.era),
        disabledReason: (gg) => makeBlock(gg) ?? (codingSkill(gg) < kind.minSkill ? `You need coding skill ${kind.minSkill} (you have ${codingSkill(gg)}).` : null),
        run: (gg) => buildProject(gg, kind),
      })
    }
    nodes.push({ type: 'heading', id: 'gamedev.make.h.learn', label: 'Get Better' })
    nodes.push(
      { type: 'action', id: 'gamedev.learn.videos', label: eraOpen(g, VIDEO_GATE) ? 'Watch Game Design Videos' : 'Read Game Magazines', emoji: eraOpen(g, VIDEO_GATE) ? '\u{1F4FA}' : '\u{1F4F0}', subtitle: 'Free · game design skill', visible: (gg) => gg.character.age >= 8, disabledReason: (gg) => blocked(gg, 8), run: (gg) => study(gg, 'videos') },
      { type: 'action', id: 'gamedev.learn.course', label: 'Take a Game Design Course', emoji: '\u{1F393}', subtitle: (gg) => `${money(onlinePrice(gg, 300))} ${eraOpen(gg, ONLINE_COURSE_GATE) ? 'online' : 'night school'} · big design boost`, visible: (gg) => gg.character.age >= 13, disabledReason: (gg) => blocked(gg, 13), run: (gg) => study(gg, 'course') },
      { type: 'action', id: 'gamedev.learn.draw', label: 'Practice Drawing', emoji: '\u{270F}\u{FE0F}', subtitle: 'Free · art skill', disabledReason: (gg) => blocked(gg, 6), run: (gg) => study(gg, 'draw') },
      { type: 'action', id: 'gamedev.learn.art', label: 'Take an Art Class', emoji: '\u{1F3A8}', subtitle: (gg) => `${money(localFee(gg, 400))} · big art boost`, visible: (gg) => gg.character.age >= 10, disabledReason: (gg) => blocked(gg, 10), run: (gg) => study(gg, 'artClass') },
      { type: 'action', id: 'gamedev.learn.stream', label: 'Stream Your Dev Work', emoji: '\u{1F3A5}', subtitle: 'Gamer fame and hype', visible: (gg) => gg.character.age >= 13 && gamedevFeatureOpen('stream', gg.year), disabledReason: (gg) => makeBlock(gg, 13) ?? (yearActionsUsed(gg, 'gamedev.stream') >= 1 ? 'Once a year.' : null), run: streamDev },
    )
    if (c.age < 12) {
      const modern = scopeOpen('jam', g.year)
      nodes.push({ type: 'info', id: 'gamedev.make.kid', emoji: '\u{1F9D2}', text: modern ? 'Real game projects unlock at 12. Jams at 10. Until then: Scratch, mods, drawing and a LOT of playing.' : 'Real game projects unlock at 12. Until then: type-in games from magazines, drawing and a LOT of playing.' })
    }
    return nodes
  },
}

export const makeInternals = { SCOPE_SCRIPT, GENRE_SCRIPT, PLATFORM_SCRIPT, ENGINE_SCRIPT, NAME_SCRIPT, CROWD_SCRIPT, PUB_SCRIPT, devlog, contractor, crowdfund, pitchPublishers, earlyAccess, shelve, patchGame, releaseDlc, runSale, study, streamDev, eaPayout }
