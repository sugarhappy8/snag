// Game studios: a 'gameStudio' business earns from game releases instead of the generic
// price-and-production model. Everything else (cash, debt, key staff, managers, offices,
// valuation, selling, IPO, inheritance, bankruptcy) is the normal business system.
//
// The yearly loop (business/yearly.ts) calls simulateStudioYear() for studios instead of
// simulateYear(): developers push the pipeline forward (team size, crunch policy, craft and
// key staff decide speed and quality), finished games launch to critics and players, the
// back catalog sells its long tail, and the statement is built from receipts, salaries,
// production, marketing and rent. One simulation per studio per year, no double counting.
// Players greenlight games (scope, genre, platform, engine), staff them, crowdfund, sign
// publishers, try early access, ship DLC and sequels; big publishers try to buy hit studios.
import { seeded } from '../assets'
import { readVenture } from '../computer/dev-state'
import { addHidden, addStat, count, formatMoney, log, notice, remember, scriptChoice, scriptInput, useYearAction, yearActionsUsed } from '../core'
import { corporateTax, marketOf } from '../data/markets'
import { chance, pick, randFloat, randInt, shuffle } from '../rng'
import { defineScript } from '../scripts'
import { hire } from '../special/common'
import { salaryFor } from '../special/gamedev-career'
import { addGamerFame, backerCap, copiesLabel, engineRoyalty, fam, firstYearCopies, gameTitle, genreSkill, genreTrend, homeReach, hotGenres, industryYear, netPerCopy, nextTail, priceOf, qualityFactor, reviewScores, sequelTitle, tailKeep, trendLabel } from '../special/gamedev-core'
import {
  CRITIC_SITE,
  ENGINES,
  engineDef,
  GENRES,
  genreDef,
  GIANTS,
  isEngine,
  isGenre,
  isPlatform,
  isScope,
  PLATFORM_HOLDERS,
  PLATFORMS,
  platformDef,
  PUBLISHERS,
  SCOPES,
  scopeDef,
  type EngineId,
  type GenreId,
  type PlatformId,
  type ScopeId,
} from '../special/gamedev-data'
import { artSkill, designSkill, GAME_JOB, gdMut, gdView, nextId, playerLabel, tidy } from '../special/gamedev-state'
import { codingSkill } from '../computer/skills'
import { hasTalent, talentHint } from '../talents'
import type { Asset, ChoiceOption, GameState, Json, MenuAction, MenuGroup, MenuNode } from '../types'
import { getCountry } from '../world'
import { becomeCeo, installManager, managerCandidate } from './career'
import { bizWorth, ceoSkill, equipmentValue, fxValue, insurancePremiumFor, licencePremium, localEcon, managerCost, refreshValue, staffPower, startupCost, TALENT_DEMAND, talentCeo, valuationOf, type YearResult } from './economy'
import { sellBusiness } from './exit'
import { severanceMonths } from './flavor'
import { createBusinessAsset, newBiz } from './founding'
import { foundBlock, manageBlock, noCash, tooBusy } from './gate'
import { industryDef } from './industries'
import { bizOf, findBusiness, readBiz, runsIt, totalOutlets, type BizState, type Statement } from './state'
import { assignedDevs, devGames, normalizeStudio, studioLine, trimStudioGames, type StudioGame, type StudioPolicy, type StudioState } from './gamestudio-state'
import { clampN, dollars, markBest, money, pct, round2, toJson } from './util'

export const DEVS_PER_OFFICE = 120

export function isStudio(b: { industry: string }): boolean {
  return b.industry === 'gameStudio'
}

/** Read-modify-write helpers for Asset.details.studio. */
export function studioOf(a: Asset): StudioState {
  return normalizeStudio(a.details.studio)
}

export function saveStudio(a: Asset, st: StudioState): void {
  st.games = trimStudioGames(st.games)
  a.details.studio = toJson(st)
}

function whole(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0
}

function an(noun: string): string {
  return `${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`
}

/** Most developers the studio's offices can seat. */
export function maxDevs(b: BizState): number {
  return Math.max(DEVS_PER_OFFICE, totalOutlets(b) * DEVS_PER_OFFICE)
}

/** A developer's yearly cost here (the local going wage times the pay policy). */
export function devCost(b: BizState): number {
  return Math.round(localEcon('gameStudio', b.countryId, b.city).wage * b.wageLevel)
}

/** How global prices land here: production and ads cost less in cheaper countries, but not proportionally. */
function costScale(countryId: string): number {
  return 0.55 + 0.45 * Math.min(1.1, getCountry(countryId).wealth ?? 1)
}

/** Old saves and bought studios: turn their trading history into a back catalog once. */
function ensureCatalog(g: GameState, b: BizState, st: StudioState, year = g.year): void {
  if (st.games.length || !b.history.length) return
  const last = b.history[b.history.length - 1]
  const copies = whole(last.units)
  if (copies <= 0) return
  const price = clampN(b.price > 0 ? b.price : 20, 5, 70)
  const genre = pick(g, GENRES)
  st.seq += 1
  st.games.push({
    id: `sg${st.seq}`,
    title: `${genre.label} Classics Collection`,
    genre: genre.id,
    platform: 'pc',
    scope: 'indie',
    engine: 'cobalt',
    stage: 'live',
    progress: 100,
    quality: b.quality,
    team: 0,
    bugs: 0,
    hype: 0,
    started: Math.max(b.founded, last.year - 2),
    released: Math.min(last.year, year - 1),
    critic: Math.round(clampN(b.quality, 30, 90)),
    players: Math.round(clampN(b.quality, 30, 90)),
    copies,
    tail: whole(copies * 0.6),
    price,
    gross: whole(last.revenue),
    dlcs: 0,
    lastDlc: 0,
    franchise: '',
    sequelOf: '',
    publisher: '',
    recoup: 0,
    advance: 0,
    advanceGot: 0,
    exclusiveFee: 0,
    devShare: 1,
    exclusive: '',
    backers: 0,
    raised: 0,
    eaCopies: 0,
    eaTail: 0,
    crunch: 0,
    spent: 0,
    awards: [],
  })
}

// ---------------------------------------------------------------------------
// The yearly simulation

interface Sale {
  game: StudioGame
  copies: number
  price: number
}

/**
 * One fiscal year for a game studio: development, launches, back-catalog sales, costs, tax,
 * cash. Returns the same YearResult as economy.simulateYear so the rest of the business loop
 * (evolve, valuation, owner pay, cash crunches, events) works unchanged.
 */
export function simulateStudioYear(g: GameState, a: Asset, b: BizState, year: number, ownerDraw: number): YearResult {
  const st = studioOf(a)
  ensureCatalog(g, b, st, year)
  const m = marketOf(b.countryId)
  const iy = industryYear(g, year)
  const speed = st.policy === 'crunch' ? 1.25 : st.policy === 'relaxed' ? 0.85 : 1
  const ops = 1 + 0.08 * staffPower(b, 'ops')
  const open = (1 - b.capacityLoss) * b.openFraction
  const runs = runsIt(g, a) && !g.character.prison && g.character.alive
  // A CEO who isn't a game maker delegates; a great one at the top lifts every game. In a
  // small studio the founder is the lead developer, in a big one just one voice of many.
  const founder = runs ? { code: codingSkill(g), art: artSkill(g), design: designSkill(g) } : null
  const voice = runs ? 0.12 + 0.33 / (1 + b.employees / 6) : 0.12
  const qStaff = staffPower(b, 'quality')
  const wage = devCost(b)
  const scale = costScale(b.countryId)
  const sales: Sale[] = []
  const notes: string[] = []
  let production = 0
  let certs = 0
  let launchMarketing = 0
  let milestones = 0

  // 1) Development.
  const dev = devGames(st)
  const want = dev.reduce((s, x) => s + x.team, 0)
  const share = want > b.employees && want > 0 ? b.employees / want : 1
  for (const x of dev) {
    const sc = scopeDef(x.scope)
    const eng = engineDef(x.engine)
    const team = x.team * share
    const ratio = clampN(team / sc.team, 0, 3)
    const before = x.progress
    x.progress = clampN(x.progress + (100 / Math.max(1, sc.years)) * Math.pow(ratio, 0.8) * speed * ops * open * eng.speed * randFloat(g, 0.85, 1.15), 0, 100)
    const target = clampN(
      60 +
        (b.quality - 50) * 0.4 +
        qStaff * 6 +
        ((founder ? Math.max(45, genreSkill(x.genre, founder.code, founder.art, founder.design)) : (b.manager?.skill ?? 50)) - 50) * voice +
        (b.morale - 60) * 0.1 +
        (sc.index >= 3 ? eng.bigBonus : eng.bonus) -
        sc.difficulty * (ratio < 0.6 ? 1.2 : 0.4) +
        Math.min(6, (ratio - 1) * 4) +
        (st.policy === 'relaxed' ? 3 : st.policy === 'crunch' ? -4 : 0) +
        (x.stage === 'ea' ? 4 : 0),
      5,
      98,
    )
    // The game takes shape as it gets built: quality moves toward what this team can make.
    if (ratio > 0) x.quality = clampN(x.quality + (target - x.quality) * clampN((x.progress - before) / 70, 0.2, 0.9), 0, 100)
    x.bugs = clampN(x.bugs + (st.policy === 'crunch' ? 10 : st.policy === 'relaxed' ? -6 : -2), 0, 100)
    if (st.policy === 'crunch' && ratio > 0) x.crunch += 1
    const prod = sc.extraUsd * Math.min(1.5, ratio) * scale * open
    production += prod
    x.spent = whole(x.spent + team * wage + prod)
    x.hype = clampN(x.hype * 0.9, 0, 100)
    // Publishers pay the rest of the advance in milestones as the game gets built.
    if (x.publisher && x.advance > x.advanceGot && x.progress < 100) {
      const left = x.advance - x.advanceGot
      const milestone = whole(left * clampN((x.progress - before) / Math.max(1, 100 - before), 0, 1) * 0.8)
      x.advanceGot += milestone
      milestones += milestone
    }
    // Early access keeps selling while development continues.
    if (x.stage === 'ea' && x.eaTail > 0) {
      const copies = whole(x.eaTail * iy.mult * randFloat(g, 0.85, 1.15))
      x.eaCopies = whole(x.eaCopies + copies)
      x.eaTail = whole(copies * 0.55)
      sales.push({ game: x, copies, price: priceOf(x.scope, x.platform) * 0.8 })
    }
  }

  // 2) Launches. A business-talented founder-CEO sells a little better (TALENT_DEMAND).
  const knack = talentCeo(g, b) ? TALENT_DEMAND : 1
  const fame = runs ? gdView(g).gamerFame : 0
  const countries = new Set(b.outlets.map((o) => o.countryId)).size
  for (const x of dev) {
    if (x.progress < 100) continue
    const sc = scopeDef(x.scope)
    const finalQ = clampN(x.quality - x.bugs * 0.12 + randInt(g, -4, 4), 3, 99)
    const prev = x.sequelOf ? st.games.find((y) => y.id === x.sequelOf) : undefined
    const fans = prev ? clampN((prev.players - 60) / 30, -1, 1) : 0
    const r = reviewScores(g, finalQ, { bugs: x.bugs, hype: x.hype, fans })
    const sequels = x.franchise ? st.games.filter((y) => y.franchise === x.franchise && y.stage === 'live').length : 0
    const franchise = prev ? clampN(Math.min(1, prev.copies / Math.max(1, scopeDef(prev.scope).potential * 0.3)) * (prev.players / 100) * Math.pow(0.85, Math.max(0, sequels - 1)), 0, 1) : 0
    const marketing = x.publisher ? 1.3 : clampN((0.55 + 0.3 * b.marketingLevel) * (0.75 + b.brand / 200), 0.4, 1.6)
    const reach = homeReach(b.countryId) * (x.publisher ? 1.2 : 0.95) * (1 + Math.min(0.3, (countries - 1) * 0.08))
    const copies = whole(
      firstYearCopies(g, {
        scope: x.scope,
        genre: x.genre,
        platform: x.platform,
        quality: (r.critic + r.players) / 2,
        hype: x.hype,
        marketing,
        reach,
        fame: Math.max(fame, b.brand / 2),
        franchise,
        presold: x.backers + x.eaCopies,
        exclusive: !!x.exclusive,
        year,
      }) *
        (1 + b.campaignBoost) *
        b.demandShock *
        (1 - b.pressure) *
        knack,
    )
    // The last milestone comes with the launch, if the publisher thinks it's any good.
    if (x.publisher && x.advance > x.advanceGot && r.critic >= 50) {
      milestones += x.advance - x.advanceGot
      x.advanceGot = x.advance
    }
    x.stage = 'live'
    x.progress = 100
    x.released = year
    x.critic = r.critic
    x.players = r.players
    x.price = priceOf(x.scope, x.platform)
    x.copies = whole(x.copies + copies + x.backers + x.eaCopies)
    x.tail = nextTail(copies, r.players, x.scope)
    x.eaTail = 0
    x.team = 0
    if (!x.publisher) launchMarketing += sc.marketingUsd * b.marketingLevel * scale
    certs += platformDef(x.platform).certUsd * scale
    sales.push({ game: x, copies, price: x.price })
    if (r.critic >= 85) {
      st.hits += 1
      b.brand = clampN(b.brand + 6, 0, 100)
      b.morale = clampN(b.morale + 6, 0, 100)
    } else if (r.critic < 50) {
      st.flops += 1
      b.brand = clampN(b.brand - 6, 0, 100)
      b.morale = clampN(b.morale - 6, 0, 100)
    }
    notes.push(`"${x.title}" launched: ${CRITIC_SITE} ${r.critic}, players ${r.players}, ${copiesLabel(copies)} in its first year`)
    creditOwner(g, a, x, copies, runs)
  }

  // 3) The back catalog.
  for (const x of st.games) {
    if (x.stage !== 'live' || x.released >= year || x.tail <= 0) continue
    const copies = whole(x.tail * iy.mult * (1 + b.campaignBoost * 0.5) * b.demandShock * (1 - b.pressure) * knack * randFloat(g, 0.85, 1.15))
    x.copies = whole(x.copies + copies)
    x.tail = nextTail(copies, x.players, x.scope)
    if (copies > 0) sales.push({ game: x, copies, price: x.price })
  }

  // 4) Money in: stores keep 30%, engines take royalties, publishers recoup first.
  let revenue = 0
  let storeFees = 0
  let royalties = 0
  let copiesTotal = 0
  let priced = 0
  for (const s of sales) {
    const x = s.game
    const gross = s.copies * s.price * 0.78
    const net = s.copies * netPerCopy(s.price)
    const royalty = engineRoyalty(engineDef(x.engine).royalty, x.gross, net)
    x.gross = whole(x.gross + net)
    copiesTotal += s.copies
    priced += s.copies * s.price
    if (x.publisher) {
      let rest = Math.max(0, net - royalty)
      const recoup = Math.min(x.recoup, rest)
      x.recoup = whole(x.recoup - recoup)
      rest -= recoup
      revenue += rest * x.devShare
    } else {
      revenue += gross
      storeFees += gross - net
      royalties += royalty
    }
  }

  revenue += milestones

  // 5) Money out.
  const finance = 1 - 0.025 * staffPower(b, 'finance')
  const ceoEff = 1.05 - ceoSkill(g, b) / 1000
  const wages = b.employees * wage * b.openFraction * licencePremium(g, b)
  let rent = 0
  for (const o of b.outlets) rent += o.count * localEcon('gameStudio', o.countryId, o.city).rent
  const upkeep = equipmentValue(b) * industryDef('gameStudio').maint
  const insurance = b.insured ? insurancePremiumFor(b) : 0
  const keyStaff = b.staff.reduce((s, x) => s + x.salary, 0) + managerCost(b)
  const community = revenue * 0.02 * b.marketingLevel
  const marketing = launchMarketing + community
  const cogs = storeFees + royalties + production + certs
  const overhead = (wages + rent + upkeep) * finance * ceoEff
  const interest = b.debt * b.debtRate
  const pbt0 = revenue - cogs - overhead - keyStaff - marketing - interest - insurance - b.yearCosts + b.yearIncome
  const ownerPay = Math.round(clampN(ownerDraw, 0, Math.max(0, b.cash + pbt0)))
  const pbt = pbt0 - ownerPay
  const corpTax = pbt > 0 ? corporateTax(b.countryId, pbt) : 0
  const net = pbt - corpTax
  // One-off costs and income booked during the year already moved the company's cash.
  b.cash = dollars(b.cash + net + b.yearCosts - b.yearIncome)
  let cashErosion = 0
  if (b.cash > 0) {
    const real = clampN((m.inflation - m.interestRate) * 0.35, 0, 0.4)
    cashErosion = Math.round(b.cash * real)
    b.cash -= cashErosion
  }
  b.inventory = 0
  const idle = devGames(st).length === 0 && b.employees > 0
  if (st.policy === 'crunch' && dev.length) st.crunchYears += 1
  st.report = { year, releases: notes, copies: whole(copiesTotal), revenue: dollars(revenue), idle }
  saveStudio(a, st)
  const stmt: Statement = {
    year,
    demand: whole(copiesTotal),
    sold: whole(copiesTotal),
    produced: whole(copiesTotal),
    spoiled: 0,
    price: copiesTotal > 0 ? round2(priced / copiesTotal) : 0,
    revenue: dollars(revenue),
    salesTax: 0,
    netRevenue: dollars(revenue),
    cogs: dollars(cogs),
    wages: dollars(wages * finance * ceoEff),
    keyStaff: dollars(keyStaff),
    rent: dollars(rent * finance * ceoEff),
    marketing: dollars(marketing),
    interest: dollars(interest),
    upkeep: dollars(upkeep * finance * ceoEff + insurance),
    other: dollars(b.yearCosts),
    otherIncome: dollars(b.yearIncome),
    ownerPay,
    pbt: dollars(pbt),
    corpTax: dollars(corpTax),
    net: dollars(net),
    cashErosion,
    cycle: 1,
    openFraction: b.openFraction,
    employees: b.employees,
  }
  b.last = stmt
  return { stmt, inventoryEnd: 0, wantedStaff: b.employees, unpaidSalary: Math.max(0, Math.round(ownerDraw) - ownerPay) }
}

/** The owner's name goes in the credits (and gamers notice a hit). */
function creditOwner(g: GameState, a: Asset, x: StudioGame, copies: number, runs: boolean): void {
  if (!g.character.alive) return
  const p = gdMut(g)
  p.games.push({
    id: nextId(p, 'gc'),
    title: x.title,
    genre: x.genre,
    platform: x.platform,
    scope: x.scope,
    engine: x.engine,
    role: runs ? 'Studio Founder & CEO' : 'Executive Producer',
    studio: a.name,
    own: false,
    free: false,
    year: x.released,
    age: g.character.age,
    critic: x.critic,
    players: x.players,
    copies,
    tail: 0,
    price: x.price,
    gross: 0,
    earned: 0,
    dlcs: 0,
    lastDlc: 0,
    patched: 0,
    franchise: x.franchise,
    publisher: x.publisher,
    recoup: 0,
    devShare: 0,
    awards: [],
  })
  const gain = Math.round((runs ? 1.4 : 0.6) * Math.max(0, (x.critic - 55) / 8) * (0.4 + Math.log10(1 + copies) / 7))
  addGamerFame(p, gain)
  tidy(p)
  count(g, 'gamesShipped')
}

/** After evolve(): crunch grinds morale down, a relaxed studio is a happier one. */
export function afterStudioYear(a: Asset, b: BizState): void {
  const st = studioOf(a)
  if (st.policy === 'crunch' && devGames(st).length) b.morale = clampN(b.morale - 9, 0, 100)
  else if (st.policy === 'relaxed') b.morale = clampN(b.morale + 4, 0, 100)
  if (st.report?.idle) b.morale = clampN(b.morale - 5, 0, 100)
  refreshValue(a, b)
}

/** A general manager keeps the pipeline full. */
export function studioManagerTurn(g: GameState, a: Asset, b: BizState): void {
  const st = studioOf(a)
  if (devGames(st).length > 0 || b.employees < 1) return
  const scope = [...SCOPES].reverse().find((s) => s.id !== 'jam' && s.minTeam <= b.employees && (s.id !== 'aaa' || b.cash > 0)) ?? SCOPES[1]
  const best = st.games.filter((x) => x.stage === 'live' && x.critic >= 75).sort((x, y) => y.copies - x.copies)[0]
  const genre = best && chance(g, 0.5) ? best.genre : hotGenres(g)[0].id
  const platform: PlatformId = scope.index >= 4 ? 'multi' : scope.index >= 3 ? 'console' : 'pc'
  const engine: EngineId = scope.index >= 3 ? 'titan' : 'cobalt'
  const sequel = best && best.genre === genre
  const title = sequel ? sequelTitle(best.franchise || best.title, st.games.filter((x) => x.franchise === (best.franchise || best.title)).length + 1) : gameTitle(g, genre, new Set(st.games.map((x) => x.title)))
  addGame(st, g, { scope: scope.id, genre, platform, engine, title, team: Math.min(b.employees, Math.max(1, Math.round(scope.team * 1.2))), franchise: sequel ? best.franchise || best.title : '', sequelOf: sequel ? best.id : '' })
  saveStudio(a, st)
  log(g, `${a.name}'s manager greenlit "${title}".`, 'neutral')
}

interface NewGame {
  scope: ScopeId
  genre: GenreId
  platform: PlatformId
  engine: EngineId
  title: string
  team: number
  franchise: string
  sequelOf: string
}

function addGame(st: StudioState, g: GameState, n: NewGame): StudioGame {
  st.seq += 1
  const x: StudioGame = {
    id: `sg${st.seq}`,
    title: n.title,
    genre: n.genre,
    platform: n.platform,
    scope: n.scope,
    engine: n.engine,
    stage: 'dev',
    progress: 0,
    quality: 45,
    team: Math.max(1, whole(n.team)),
    bugs: 0,
    hype: n.sequelOf ? 25 : 5,
    started: g.year,
    released: 0,
    critic: 0,
    players: 0,
    copies: 0,
    tail: 0,
    price: priceOf(n.scope, n.platform),
    gross: 0,
    dlcs: 0,
    lastDlc: 0,
    franchise: n.franchise,
    sequelOf: n.sequelOf,
    publisher: '',
    recoup: 0,
    advance: 0,
    advanceGot: 0,
    exclusiveFee: 0,
    devShare: 1,
    exclusive: '',
    backers: 0,
    raised: 0,
    eaCopies: 0,
    eaTail: 0,
    crunch: 0,
    spent: 0,
    awards: [],
  }
  st.games.push(x)
  return x
}

// ---------------------------------------------------------------------------
// The yearly report

const IDLE_SCRIPT = defineScript('gamestudio.idle', (g, choice, data) => {
  const d = data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  const a = findBusiness(g, typeof d.assetId === 'string' ? d.assetId : undefined)
  if (!a || manageBlock(g, a)) return
  if (choice === 'auto') {
    const b = bizOf(g, a)
    studioManagerTurn(g, a, b)
    const st = studioOf(a)
    const x = devGames(st)[0]
    if (x) notice(g, 'Greenlit', `Your leads pitched "${x.title}", ${an(genreDef(x.genre).noun)} (${scopeDef(x.scope).label}). You said yes. ${x.team} developers are on it.`, { emoji: '\u{1F7E2}', tone: 'good' })
    return
  }
  if (choice === 'mine') startGreenlight(g, a.id)
})

/** The studio's yearly summary popup (instead of the price-and-production Annual Report). */
export function queueStudioReport(g: GameState, a: Asset, b: BizState): void {
  const st = studioOf(a)
  const s = b.last
  const r = st.report
  const lines: string[] = []
  if (r && r.releases.length) lines.push(...r.releases.map((x) => `\u{1F680} ${x}.`))
  if (s) {
    lines.push(`\u{1F4B5} ${s.year}: ${copiesLabel(r?.copies ?? s.sold)} sold, ${money(s.revenue)} in sales, ${s.net >= 0 ? `${money(s.net)} profit` : `${money(-s.net)} loss`}.`)
    lines.push(`\u{1F465} ${b.employees} developers · morale ${b.morale}% · ${policyLabel(st.policy)}.`)
  }
  const dev = devGames(st)
  if (dev.length) lines.push(`\u{1F6E0}\u{FE0F} In development: ${dev.map((x) => `"${x.title}" (${Math.round(x.progress)}%)`).join(', ')}.`)
  lines.push(`\u{1F3F7}\u{FE0F} Valuation ${money(b.valuation)} · cash ${money(b.cash)}.`)
  if (r?.idle || (!dev.length && b.employees > 0)) {
    const choices: ChoiceOption[] = [
      { id: 'mine', label: 'Pitch my own game', emoji: '\u{1F4A1}' },
      { id: 'auto', label: "Let the leads pick (they'll go for what's hot)", emoji: '\u{1F465}' },
      { id: 'later', label: 'Later', emoji: '\u{23F3}' },
    ]
    if (hasTalent(g, 'Business')) {
      const best = bestPitch(g, a, b, st, {})
      const leads = leadsPitch(g, a, b, st)
      const w = bizWorth(g, b)
      const funded = (best ? best.short <= 0 : false) || leads.short <= 0
      // Waiting a year: idle developers sulk (-5 morale) and the next game ships a year later.
      // (When no game can be funded to launch, waiting doesn't stop the payroll either.)
      const later = funded ? fxValue(g, b, w, { morale: -5 }) - Math.max(0, best?.perYear ?? 0) : null
      markBest(g, choices, (id) => (id === 'mine' ? (best ? pitchRank(best, best.value, funded) : null) : id === 'auto' ? pitchRank(leads, leads.value, funded) : later), (id) =>
        id === 'mine' && best ? `Best move: pitch ${pitchName(best)}${fundingNote(best)}` : id === 'auto' ? `Best move: the leads will pick about as well as you would${fundingNote(leads)}` : undefined,
      )
    }
    scriptChoice(g, IDLE_SCRIPT, `${a.name}: Studio Report`, `${lines.join('\n')}\n\nYour developers have nothing to work on and are playing ping-pong on the company's dime. Greenlight something?`, choices, { emoji: '\u{1F3AE}', data: { assetId: a.id } })
    return
  }
  notice(g, `${a.name}: Studio Report`, lines.join('\n'), { emoji: '\u{1F3AE}', tone: s && s.net >= 0 ? 'good' : 'neutral' })
}

function policyLabel(p: StudioPolicy): string {
  return p === 'crunch' ? 'crunch mode' : p === 'relaxed' ? 'relaxed hours' : 'normal hours'
}

// ---------------------------------------------------------------------------
// The Business talent: what a game is likely to earn (purple hints for greenlighting, publisher
// deals and studio events). Estimates follow the simulation above step by step (team, speed,
// quality target, launch copies, the long tail, store cuts, royalties) with luck and the
// unknown future of genre trends averaged out. Nothing here touches g.rng.

interface Pitch {
  scope: ScopeId
  genre: GenreId
  platform: PlatformId
  engine: EngineId
}

interface PitchOut {
  /** Lifetime receipts minus production, launch marketing, certification and royalties. */
  value: number
  /** Value per year of development (what the team's time earns). */
  perYear: number
  years: number
  quality: number
  /**
   * Cash the studio would run short of before the game's launch money comes in (0: its cash
   * carries the game to launch). A great game the studio can't fund ends in a cash crunch.
   */
  short: number
}

const luckCache = new Map<string, number>()

/** The average of luckRoll for a scope, heavy tail included (a fixed grid over its three dice). */
function meanLuck(scope: ScopeId): number {
  const hit = luckCache.get(scope)
  if (hit !== undefined) return hit
  const [median, spread] = scopeDef(scope).luck
  const K = 10
  let sum = 0
  for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) for (let k = 0; k < K; k++) sum += clampN(median * Math.exp(spread * (((i + j + k + 1.5) / K - 1.5) / 0.5)), 0.02, 9)
  const v = sum / (K * K * K)
  luckCache.set(scope, v)
  return v
}

/** A genre's fashion shock in a year (gamedev-core genreTrend's seeded draw). */
function genreShock(g: GameState, genre: GenreId, year: number): number {
  const s = seeded(`${fam(g)}|genre|${genre}|${year}`)
  return (s.next() + s.next() + s.next() - 1.5) * 2
}

/** Expected genre trend in a launch year: this year's fashion is known, later years' are not. */
function trendAt(g: GameState, genre: GenreId, year: number): number {
  const vol = genre === 'battleRoyale' ? 0.32 : 0.22
  const nodes: [number, number][] = [
    [-Math.sqrt(3), 1 / 6],
    [0, 2 / 3],
    [Math.sqrt(3), 1 / 6],
  ]
  const now: [number, number][] = year <= g.year ? [[genreShock(g, genre, year), 1]] : nodes
  const before: [number, number][] = year - 1 <= g.year ? [[genreShock(g, genre, year - 1), 1]] : nodes
  let v = 0
  for (const [za, wa] of now) for (const [zb, wb] of before) v += wa * wb * clampN(Math.exp(vol * (0.65 * za + 0.35 * zb)), 0.6, 1.6)
  return v
}

/** Developers a new game would get (the greenlight's own rule). */
function pitchTeam(b: BizState, st: StudioState, scope: ScopeId): number {
  const sc = scopeDef(scope)
  const free = b.employees - assignedDevs(st)
  return Math.max(1, Math.min(sc.team, free > 0 ? free : Math.max(1, Math.round(b.employees / (devGames(st).length + 1)))))
}

/** Where a game's quality settles with this team (the same target the yearly sim moves toward). */
function qualityTarget(g: GameState, a: Asset, b: BizState, st: StudioState, genre: GenreId, scope: ScopeId, engine: EngineId, ratio: number, ea = false): number {
  const sc = scopeDef(scope)
  const eng = engineDef(engine)
  const runs = runsIt(g, a) && !g.character.prison && g.character.alive
  const lead = runs ? Math.max(45, genreSkill(genre, codingSkill(g), artSkill(g), designSkill(g))) : (b.manager?.skill ?? 50)
  const voice = runs ? 0.12 + 0.33 / (1 + b.employees / 6) : 0.12
  return clampN(
    60 +
      (b.quality - 50) * 0.4 +
      staffPower(b, 'quality') * 6 +
      (lead - 50) * voice +
      (b.morale - 60) * 0.1 +
      (sc.index >= 3 ? eng.bigBonus : eng.bonus) -
      sc.difficulty * (ratio < 0.6 ? 1.2 : 0.4) +
      Math.min(6, (ratio - 1) * 4) +
      (st.policy === 'relaxed' ? 3 : st.policy === 'crunch' ? -4 : 0) +
      (ea ? 4 : 0),
    5,
    98,
  )
}

interface LaunchGuess {
  quality: number
  hype: number
  /** Years until launch. */
  years: number
  publisher: boolean
  exclusive?: boolean
  franchise?: number
}

/** Expected lifetime receipts of a game at launch (store cut and the long tail included). */
function receiptsOf(g: GameState, b: BizState, x: Pitch, l: LaunchGuess): number {
  const sc = scopeDef(x.scope)
  const runs = b.ceo !== 'manager' && g.character.alive && !g.character.prison
  const countries = new Set(b.outlets.map((o) => o.countryId)).size
  const marketing = l.publisher ? 1.3 : clampN((0.55 + 0.3 * b.marketingLevel) * (0.75 + b.brand / 200), 0.4, 1.6)
  const reach = homeReach(b.countryId) * (l.publisher ? 1.2 : 0.95) * (1 + Math.min(0.3, (countries - 1) * 0.08))
  const fame = Math.max(runs ? gdView(g).gamerFame : 0, b.brand / 2)
  const knack = talentCeo(g, b) ? TALENT_DEMAND : 1
  const copies =
    sc.potential *
    platformDef(x.platform).audience *
    (l.exclusive ? 0.6 : 1) *
    genreDef(x.genre).appeal *
    trendAt(g, x.genre, g.year + Math.max(1, Math.round(l.years))) *
    qualityFactor(l.quality) *
    (1 + (clampN(l.hype, 0, 100) / 100) * 0.8) *
    clampN(marketing, 0.3, 2) *
    clampN(reach, 0.2, 1.6) *
    (1 + clampN(fame, 0, 100) / 150) *
    (1 + 0.7 * clampN(l.franchise ?? 0, 0, 1)) *
    meanLuck(x.scope) *
    knack
  const keep = tailKeep(l.quality, x.scope)
  return (copies * netPerCopy(priceOf(x.scope, x.platform))) / Math.max(0.3, 1 - keep)
}

/** Royalty an engine takes on a game's lifetime receipts past the first $1M. */
function royaltyOf(engine: EngineId, receipts: number): number {
  return engineDef(engine).royalty * Math.max(0, receipts - 1_000_000)
}

/**
 * A year of the studio's running costs whatever it makes next (developers, rent, upkeep, key
 * staff, games already in production, interest), minus what its back catalog should bring in:
 * the same items simulateStudioYear books.
 */
function studioBurn(g: GameState, b: BizState, st: StudioState): number {
  let rent = 0
  for (const o of b.outlets) rent += o.count * localEcon('gameStudio', o.countryId, o.city).rent
  const overhead = (b.employees * devCost(b) * licencePremium(g, b) + rent + equipmentValue(b) * industryDef('gameStudio').maint) * (1 - 0.025 * staffPower(b, 'finance')) * (1.05 - ceoSkill(g, b) / 1000)
  const fixed = overhead + b.staff.reduce((t, x) => t + x.salary, 0) + managerCost(b) + (b.insured ? insurancePremiumFor(b) : 0) + b.debt * b.debtRate
  const scale = costScale(b.countryId)
  let inProduction = 0
  for (const x of devGames(st)) {
    const sc = scopeDef(x.scope)
    inProduction += sc.extraUsd * Math.min(1.5, clampN(x.team / sc.team, 0, 3)) * scale
  }
  let catalog = 0
  for (const x of st.games) if (x.stage === 'live' && x.tail > 0) catalog += x.tail * netPerCopy(x.price) * (x.publisher ? x.devShare * (x.recoup > 0 ? 0.6 : 1) : 1)
  const burn = fixed + inProduction - catalog
  return Number.isFinite(burn) ? burn : 0
}

/** What greenlighting this game would earn (developers are paid either way, so not counted). */
function pitchValue(g: GameState, a: Asset, b: BizState, st: StudioState, x: Pitch, franchise = 0, burn = studioBurn(g, b, st)): PitchOut {
  const sc = scopeDef(x.scope)
  const eng = engineDef(x.engine)
  const team = pitchTeam(b, st, x.scope)
  const ratio = clampN(team / sc.team, 0.05, 3)
  const speed = (st.policy === 'crunch' ? 1.25 : st.policy === 'relaxed' ? 0.85 : 1) * (1 + 0.08 * staffPower(b, 'ops')) * eng.speed
  const perYear = (100 / Math.max(1, sc.years)) * Math.pow(ratio, 0.8) * speed
  const years = Math.max(1, Math.ceil(100 / Math.max(1, perYear) - 0.05))
  const target = qualityTarget(g, a, b, st, x.genre, x.scope, x.engine, ratio)
  const bugs = Math.max(0, years * (st.policy === 'crunch' ? 10 : st.policy === 'relaxed' ? -6 : -2))
  const quality = clampN(target - (target - 45) * (years <= 1 ? 0.15 : 0.05) - bugs * 0.12, 3, 99)
  const hype = (franchise > 0 ? 25 : 5) * Math.pow(0.9, years)
  const scale = costScale(b.countryId)
  const receipts = receiptsOf(g, b, x, { quality, hype, years, publisher: false, franchise })
  const extra = sc.extraUsd * Math.min(1.5, ratio) * scale
  const launch = sc.marketingUsd * b.marketingLevel * scale + platformDef(x.platform).certUsd * scale
  const costs = extra * years + launch
  const value = receipts - royaltyOf(x.engine, receipts) - costs
  // Cash needed until launch: every development year's costs, then the launch year's costs
  // less its first year of sales (receiptsOf spreads a game's sales over its tail).
  const firstYear = receipts * Math.max(0.3, 1 - tailKeep(quality, x.scope))
  const need = (years - 1) * Math.max(0, burn + extra) + Math.max(0, burn + extra + launch - firstYear)
  const short = Math.max(0, Math.round(need - Math.max(0, b.cash)))
  return { value, perYear: value / years, years, quality, short: Number.isFinite(short) ? short : 0 }
}

/**
 * How a pitch ranks against the others on the table: when the studio's cash can carry some of
 * them to launch, those (by `metric`) and nothing else; when it can't carry any, the smallest
 * shortfall (the game that gets money coming in soonest).
 */
function pitchRank(p: PitchOut, metric: number, anyFunded: boolean): number {
  if (anyFunded) return p.short > 0 ? -1e15 : metric
  return -p.short + clampN(metric, -1e6, 1e6) * 1e-9
}

/** 'an AA role-playing game for Every Platform'. */
function pitchName(p: Pitch): string {
  return `${an(`${scopeDef(p.scope).label} ${genreDef(p.genre).noun}`)} for ${platformDef(p.platform).label}`
}

/** Franchise pull of a sequel (the launch formula's own measure of the original's success). */
function franchisePull(st: StudioState, sequelOf: string): number {
  const prev = st.games.find((y) => y.id === sequelOf)
  if (!prev) return 0
  const franchise = prev.franchise || prev.title
  const sequels = st.games.filter((y) => y.franchise === franchise && y.stage === 'live').length
  return clampN(Math.min(1, prev.copies / Math.max(1, scopeDef(prev.scope).potential * 0.3)) * (prev.players / 100) * Math.pow(0.85, Math.max(0, sequels - 1)), 0, 1)
}

function scopeOk(b: BizState, scope: ScopeId): boolean {
  return scope !== 'jam' && scopeDef(scope).minTeam <= b.employees
}

function platformsFor(scope: ScopeId): PlatformId[] {
  return PLATFORMS.filter((p) => p.minScope <= scopeDef(scope).index).map((p) => p.id)
}

function enginesFor(scope: ScopeId): EngineId[] {
  return ENGINES.filter((e) => e.id !== 'blocks' && e.maxScope >= scopeDef(scope).index).map((e) => e.id)
}

/** The best game to make next given what's already decided (ranked by profit per year of work). */
function bestPitch(g: GameState, a: Asset, b: BizState, st: StudioState, fixed: Partial<Pitch>, franchise = 0): (Pitch & PitchOut) | null {
  const burn = studioBurn(g, b, st)
  const all: (Pitch & PitchOut)[] = []
  const scopes = fixed.scope ? [fixed.scope] : SCOPES.map((x) => x.id).filter((x) => scopeOk(b, x))
  for (const scope of scopes) {
    const genres = fixed.genre ? [fixed.genre] : GENRES.map((x) => x.id)
    const platforms = fixed.platform ? [fixed.platform] : platformsFor(scope)
    const engines = fixed.engine ? [fixed.engine] : enginesFor(scope)
    for (const genre of genres)
      for (const platform of platforms)
        for (const engine of engines) all.push({ scope, genre, platform, engine, ...pitchValue(g, a, b, st, { scope, genre, platform, engine }, franchise, burn) })
  }
  const funded = all.some((x) => x.short <= 0)
  let best: (Pitch & PitchOut) | null = null
  for (const x of all) if (!best || pitchRank(x, x.perYear, funded) > pitchRank(best, best.perYear, funded)) best = x
  return best
}

/**
 * How long the studio's cash lasts at its current burn (months, rounded) and how many of its
 * developers sit idle (on no game). Null without the talent, or when nothing is burning.
 */
function teamRunway(g: GameState, a: Asset): { months: number; idle: number } | null {
  const found = findBusiness(g, a.id)
  if (!found || !hasTalent(g, 'Business') || manageBlock(g, found)) return null
  const b = readBiz(g, found)
  const st = studioOf(found)
  const burn = studioBurn(g, b, st)
  if (!(burn > 0)) return null
  return { months: Math.max(0, Math.floor((Math.max(0, b.cash) / burn) * 12)), idle: Math.max(0, b.employees - assignedDevs(st)) }
}

function monthsOf(m: number): string {
  return m < 1 ? 'less than a month' : `about ${m} month${m === 1 ? '' : 's'}`
}

/** Why a pitch is the best one, or the warning that comes with it when the studio can't fund any. */
function fundingNote(p: PitchOut): string {
  return p.short > 0 ? ` (even so, the studio runs about ${money(p.short)} short before launch: line up a publisher or more cash)` : ''
}

const pitchCache = new Map<string, (Pitch & PitchOut) | null>()

/** bestPitch for the company screen, cached per studio state and year. */
function cachedPitch(g: GameState, a: Asset): (Pitch & PitchOut) | null {
  const key = `${g.lifeId}|${g.character.id}|${a.id}|${g.year}|${g.character.age}|${JSON.stringify(a.details)}`
  if (pitchCache.has(key)) return pitchCache.get(key) ?? null
  const b = readBiz(g, a)
  const v = bestPitch(g, a, b, studioOf(a), {})
  pitchCache.set(key, v)
  if (pitchCache.size > 24) {
    const first = pitchCache.keys().next().value
    if (first !== undefined) pitchCache.delete(first)
  }
  return v
}

/**
 * Self-publishing vs a publisher deal for a game in development: the deal pays its advance
 * (the last part only if critics like it) and a share after it earns back the advance and its
 * marketing; self-publishing keeps everything but pays for its own launch.
 */
function publishValues(g: GameState, a: Asset, b: BizState, st: StudioState, x: StudioGame, advance: number, devShare: number): { self: number; sign: number } {
  const sc = scopeDef(x.scope)
  const team = Math.max(1, x.team)
  const ratio = clampN(team / sc.team, 0.05, 3)
  const speed = (st.policy === 'crunch' ? 1.25 : st.policy === 'relaxed' ? 0.85 : 1) * (1 + 0.08 * staffPower(b, 'ops')) * engineDef(x.engine).speed
  const perYear = (100 / Math.max(1, sc.years)) * Math.pow(ratio, 0.8) * speed
  const years = Math.max(1, Math.ceil((100 - x.progress) / Math.max(1, perYear) - 0.05))
  const target = qualityTarget(g, a, b, st, x.genre, x.scope, x.engine, ratio, x.stage === 'ea')
  const quality = clampN(x.quality + (target - x.quality) * 0.7 - x.bugs * 0.12, 3, 99)
  const pitch: Pitch = { scope: x.scope, genre: x.genre, platform: x.platform, engine: x.engine }
  const franchise = x.sequelOf ? franchisePull(st, x.sequelOf) : 0
  const scale = costScale(b.countryId)
  const self = receiptsOf(g, b, pitch, { quality, hype: x.hype * Math.pow(0.9, years), years, publisher: false, exclusive: !!x.exclusive, franchise })
  const pub = receiptsOf(g, b, pitch, { quality, hype: clampN(x.hype + 15, 0, 100) * Math.pow(0.9, years), years, publisher: true, exclusive: !!x.exclusive, franchise })
  const paid = advance * (quality >= 55 ? 1 : 0.8)
  return {
    self: self - royaltyOf(x.engine, self) - sc.marketingUsd * b.marketingLevel * scale,
    sign: paid + devShare * Math.max(0, pub - royaltyOf(x.engine, pub) - (advance + sc.marketingUsd)),
  }
}

/** What the leads would greenlight (studioManagerTurn's rule: half the time a sequel to a hit). */
function leadsPitch(g: GameState, a: Asset, b: BizState, st: StudioState): PitchOut {
  const scope = [...SCOPES].reverse().find((s) => s.id !== 'jam' && s.minTeam <= b.employees && (s.id !== 'aaa' || b.cash > 0)) ?? SCOPES[1]
  const platform: PlatformId = scope.index >= 4 ? 'multi' : scope.index >= 3 ? 'console' : 'pc'
  const engine: EngineId = scope.index >= 3 ? 'titan' : 'cobalt'
  const best = st.games.filter((x) => x.stage === 'live' && x.critic >= 75).sort((x, y) => y.copies - x.copies)[0]
  const hot = pitchValue(g, a, b, st, { scope: scope.id, genre: hotGenres(g)[0].id, platform, engine })
  if (!best) return hot
  const sequel = pitchValue(g, a, b, st, { scope: scope.id, genre: best.genre, platform, engine }, franchisePull(st, best.id))
  const avg = (k: keyof PitchOut) => 0.5 * hot[k] + 0.5 * sequel[k]
  return { value: avg('value'), perYear: avg('perYear'), years: avg('years'), quality: avg('quality'), short: avg('short') }
}

/** Lifetime receipts still to come from a released game (its share after any publisher). */
function tailValue(x: StudioGame, players = x.players, tail = x.tail): number {
  const share = x.publisher ? x.devShare * (x.recoup > 0 ? 0.6 : 1) : 1
  return (tail * netPerCopy(x.price) * share) / Math.max(0.3, 1 - tailKeep(players, x.scope))
}

// ---------------------------------------------------------------------------
// Studio events (game-specific; the generic business events still happen too)

const EVENT = defineScript('gamestudio.event', (g, choice, data) => {
  const d = data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  const a = findBusiness(g, typeof d.assetId === 'string' ? d.assetId : undefined)
  if (!a || !g.character.alive) return
  const b = bizOf(g, a)
  const st = studioOf(a)
  const ev = typeof d.ev === 'string' ? d.ev : ''
  const x = st.games.find((y) => y.id === d.gameId)
  const amount = typeof d.amount === 'number' && Number.isFinite(d.amount) ? Math.max(0, Math.round(d.amount)) : 0
  const who = typeof d.who === 'string' ? d.who : 'a big publisher'
  switch (ev) {
    case 'bid': {
      if (choice === 'decline') {
        st.declined += 1
        saveStudio(a, st)
        log(g, `I turned down ${who}'s offer for ${a.name}.`, 'neutral')
        notice(g, 'Not for Sale', `You told ${who} that ${a.name} is not for sale. Your developers cheered. Your accountant quietly wept.`, { emoji: '\u{1F645}' })
        return
      }
      if (b.public) return
      sellBusiness(g, a, b, amount, who)
      if (choice === 'stay' && g.character.alive && !g.character.prison) {
        hire(g, { defId: GAME_JOB, title: 'Studio Head', company: a.name, salary: salaryFor(g, 6, 'aaa'), level: 6, performance: 70, data: { studio: a.name, tier: 'aaa', track: 'design', craft: Math.round(clampN(b.quality + 10, 50, 90)), hq: b.countryId, city: b.city, proj: null, raiseYear: 0, effort: 0, scare: 0 } })
        log(g, `I stayed on as Studio Head of ${a.name} under ${who}.`, 'good')
        notice(g, 'Studio Head', `You stayed on to run ${a.name} as a ${who} studio. Same desk, same team, a parent company that sends a lot of slide decks. Salary: ${formatMoney(g.character.job?.salary ?? 0)} a year.`, { emoji: '\u{1F454}', tone: 'good' })
      }
      return
    }
    case 'exclusive': {
      if (!x || x.stage === 'live') return
      if (choice === 'accept') {
        x.exclusive = who
        x.exclusiveFee = amount
        x.platform = 'console'
        x.hype = clampN(x.hype + 15, 0, 100)
        b.cash += amount
        b.yearIncome += amount
        saveStudio(a, st)
        log(g, `${who} paid ${a.name} ${money(amount)} to keep "${x.title}" exclusive.`, 'good')
        notice(g, 'Exclusive Deal', `${who} paid ${formatMoney(amount)} to keep "${x.title}" off every other platform. Fans of other consoles have opinions, mostly in all caps.`, { emoji: '\u{1F91D}', tone: 'good' })
      } else {
        notice(g, 'Multiplatform', `You turned down ${who}. "${x.title}" will launch everywhere you planned.`, { emoji: '\u{1F310}' })
      }
      return
    }
    case 'leak': {
      if (!x) return
      if (choice === 'embrace') {
        x.hype = clampN(x.hype + 18, 0, 100)
        b.brand = clampN(b.brand + 2, 0, 100)
        notice(g, 'Leaked!', `You posted "well, that's awkward" with a winking emoji and released the official trailer early. Hype for "${x.title}" went through the roof.`, { emoji: '\u{1F648}', tone: 'good' })
      } else if (choice === 'lawyers') {
        const cost = Math.round(devCost(b) * 0.6)
        b.cash -= cost
        b.yearCosts += cost
        b.morale = clampN(b.morale - 3, 0, 100)
        notice(g, 'Takedowns', `Your lawyers sent ${randInt(g, 200, 4_000)} takedown notices (${formatMoney(cost)}). The internet now shares the leak out of spite.`, { emoji: '\u{2696}\u{FE0F}', tone: 'bad' })
      } else {
        x.hype = clampN(x.hype + 6, 0, 100)
        b.morale = clampN(b.morale - 4, 0, 100)
        notice(g, 'Leak', `You said nothing. The leak was half fake anyway. The team is upset someone on the inside did it.`, { emoji: '\u{1F910}' })
      }
      saveStudio(a, st)
      return
    }
    case 'bomb': {
      if (!x) return
      if (choice === 'patch') {
        const cost = Math.round(devCost(b) * 2)
        b.cash -= cost
        b.yearCosts += cost
        x.players = Math.round(clampN(x.players + randInt(g, 3, 7), 0, 99))
        notice(g, 'Hotfix', `Your team shipped a hotfix in a week (${formatMoney(cost)}). Players calmed down; "${x.title}" is back to "${playerLabel(x.players)}".`, { emoji: '\u{1FA79}', tone: 'good' })
      } else if (choice === 'statement') {
        x.players = Math.round(clampN(x.players - randInt(g, 0, 3), 0, 99))
        notice(g, 'Statement', `You posted a heartfelt statement. Half the comments called it "corporate", the other half "based". Score: "${playerLabel(x.players)}".`, { emoji: '\u{1F4DD}' })
      } else {
        x.players = Math.round(clampN(x.players - randInt(g, 4, 9), 0, 99))
        x.tail = whole(x.tail * 0.85)
        notice(g, 'Ignored', `You ignored the review bomb. It did not ignore you: "${x.title}" sank to "${playerLabel(x.players)}".`, { emoji: '\u{1F4A3}', tone: 'bad' })
      }
      saveStudio(a, st)
      return
    }
    case 'expose': {
      if (choice === 'change') {
        st.policy = 'normal'
        b.morale = clampN(b.morale + 8, 0, 100)
        b.brand = clampN(b.brand - 2, 0, 100)
        notice(g, 'No More Crunch', `You ended mandatory overtime and apologized publicly. The team bought you a cake that says "THANK YOU (finally)".`, { emoji: '\u{1F370}', tone: 'good' })
      } else if (choice === 'deny') {
        addHidden(g, 'karma', -6)
        b.brand = clampN(b.brand - 8, 0, 100)
        b.morale = clampN(b.morale - 8, 0, 100)
        notice(g, 'Denied', `You called the article "inaccurate". Thirty employees posted their timesheets the next day. Brand down to ${b.brand}%.`, { emoji: '\u{1F4F0}', tone: 'bad' })
      } else {
        b.brand = clampN(b.brand - 4, 0, 100)
        notice(g, 'Apology', `You apologized and promised "a better culture going forward." Nothing else changed. Everyone noticed.`, { emoji: '\u{1F64F}' })
      }
      saveStudio(a, st)
      return
    }
    case 'streamer': {
      if (!x) return
      if (choice === 'sponsor') {
        const cost = Math.round(devCost(b) * 0.5)
        b.cash -= cost
        b.yearCosts += cost
        x.tail = whole(x.tail * 1.6)
        notice(g, 'Sponsored', `You sponsored the streamer's next three sessions (${formatMoney(cost)}). "${x.title}" sales are climbing again.`, { emoji: '\u{1F3A5}', tone: 'good' })
      } else {
        x.tail = whole(x.tail * 1.25)
        notice(g, 'Free Publicity', `You sent a thank-you note and a plushie. Sales of "${x.title}" picked up anyway.`, { emoji: '\u{1F9F8}', tone: 'good' })
      }
      saveStudio(a, st)
      return
    }
  }
})

type StudioEv = 'bid' | 'exclusive' | 'leak' | 'bomb' | 'expose' | 'streamer'

function acquirer(g: GameState, b: BizState): string {
  const foreign = GIANTS.filter((x) => x.hq !== b.countryId)
  return pick(g, foreign.length && chance(g, 0.7) ? foreign : GIANTS).name
}

/** Maybe queue one game-studio event (returns true when one was queued). */
export function maybeStudioEvent(g: GameState, a: Asset, b: BizState, year: number, managed: boolean): boolean {
  if (g.character.prison || !g.character.alive || b.founded >= year) return false
  if (!chance(g, managed ? 0.2 : 0.35)) return false
  const st = studioOf(a)
  const options: [StudioEv, number, StudioGame | undefined][] = []
  const dev = devGames(st)
  const live = st.games.filter((x) => x.stage === 'live' && x.released >= year - 2)
  const recentHit = live.some((x) => x.critic >= 82)
  if (!b.public && b.valuation > 0 && (recentHit || b.brand >= 60) && st.declined < 4) options.push(['bid', recentHit ? 1.2 : 0.5, undefined])
  const big = dev.find((x) => scopeDef(x.scope).index >= 2 && !x.exclusive && x.progress >= 30 && (x.platform === 'console' || x.platform === 'multi'))
  if (big) options.push(['exclusive', 0.8, big])
  const hyped = dev.find((x) => x.progress >= 40)
  if (hyped) options.push(['leak', 0.6, hyped])
  if (live.length) options.push(['bomb', 0.5, pick(g, live)], ['streamer', 0.7, pick(g, live)])
  if (st.policy === 'crunch' && dev.length) options.push(['expose', 0.4 + st.crunchYears * 0.25, undefined])
  if (!options.length) return false
  const total = options.reduce((s, o) => s + o[1], 0)
  let roll = randFloat(g, 0, total)
  let pickd = options[0]
  for (const o of options) {
    roll -= o[1]
    if (roll <= 0) {
      pickd = o
      break
    }
  }
  const [ev, , x] = pickd
  b.lastEvent = year
  const base = { assetId: a.id, ev, gameId: x?.id ?? '' }
  switch (ev) {
    case 'bid': {
      const who = acquirer(g, b)
      const amount = Math.round(Math.max(b.valuation, 50_000) * randFloat(g, recentHit ? 1.3 : 1.1, recentHit ? 1.8 : 1.4))
      const stake = b.share < 1 ? ` (your ${pct(b.share)}: ${money(amount * b.share)})` : ''
      const choices: ChoiceOption[] = [
        { id: 'sell', label: 'Sell and walk away', emoji: '\u{1F4B0}' },
        { id: 'stay', label: 'Sell, but stay on as Studio Head', emoji: '\u{1F454}' },
        { id: 'decline', label: 'Not for sale', emoji: '\u{1F645}' },
      ]
      if (hasTalent(g, 'Business')) {
        // The sale is worth what it beats the studio's value by; staying on adds a Studio Head
        // salary in place of whatever job you'd give up (counted for two years).
        const sale = (amount - b.valuation) * b.share
        const job = g.character.job
        const current = job && !(runsIt(g, a) && job.data.assetId === a.id) ? job.salary : 0
        const head = (salaryFor(g, 6, 'aaa') - current) * 2
        markBest(g, choices, (id) => (id === 'sell' ? sale : id === 'stay' ? sale + head : 0), (id) =>
          id === 'decline' ? 'Best move: the studio is worth more than they are offering' : id === 'stay' ? 'Best move: take the money and the Studio Head salary' : 'Best move: take the money and run',
        )
      }
      scriptChoice(g, EVENT, 'Acquisition Offer', `${who} wants to buy ${a.name} for ${formatMoney(amount)}${stake}. Valuation: ${money(b.valuation)}. They promise "nothing will change." Something always changes.`, choices, { emoji: '\u{1F3F0}', data: { ...base, amount, who } })
      return true
    }
    case 'exclusive': {
      if (!x) return false
      const holder = pick(g, PLATFORM_HOLDERS)
      const sc = scopeDef(x.scope)
      const amount = Math.round(sc.potential * qualityFactor(Math.max(50, x.quality)) * 0.35 * netPerCopy(priceOf(x.scope, x.platform)) * 0.3)
      if (amount <= 0) return false
      const choices: ChoiceOption[] = [
        { id: 'accept', label: `Take the ${money(amount)}`, emoji: '\u{1F91D}' },
        { id: 'decline', label: 'Stay multiplatform', emoji: '\u{1F310}' },
      ]
      if (hasTalent(g, 'Business')) {
        // An exclusive launches on one console only (60% of the audience) with 15 more hype.
        const now = publishValues(g, a, b, st, x, 0, 0).self
        const excl = publishValues(g, a, b, st, { ...x, platform: 'console', exclusive: holder.name, hype: clampN(x.hype + 15, 0, 100) }, 0, 0).self
        const certs = (platformDef(x.platform).certUsd - platformDef('console').certUsd) * costScale(b.countryId)
        markBest(g, choices, (id) => (id === 'accept' ? amount + excl - now + certs : 0), (id) => (id === 'accept' ? 'Best move: the check beats the sales you give up' : 'Best move: the lost players are worth more than the check'))
      }
      scriptChoice(g, EVENT, 'Exclusivity Offer', `${holder.name} will pay ${formatMoney(amount)} if "${x.title}" launches only on ${holder.console}. Fewer players, guaranteed money, and their marketing team behind it.`, choices, { emoji: '\u{1F579}\u{FE0F}', data: { ...base, amount, who: holder.name } })
      return true
    }
    case 'leak': {
      if (!x) return false
      const choices: ChoiceOption[] = [
        { id: 'embrace', label: 'Lean into it', emoji: '\u{1F648}' },
        { id: 'lawyers', label: 'Send the lawyers', emoji: '\u{2696}\u{FE0F}' },
        { id: 'quiet', label: 'Say nothing', emoji: '\u{1F910}' },
      ]
      if (hasTalent(g, 'Business')) {
        const w = bizWorth(g, b)
        const base0 = publishValues(g, a, b, st, x, 0, 0).self
        const hype = (dh: number) => publishValues(g, a, b, st, { ...x, hype: clampN(x.hype + dh, 0, 100) }, 0, 0).self - base0
        markBest(g, choices, (id) => (id === 'embrace' ? hype(18) + fxValue(g, b, w, { brand: 2 }) : id === 'lawyers' ? fxValue(g, b, w, { cash: -Math.round(devCost(b) * 0.6), morale: -3 }) : hype(6) + fxValue(g, b, w, { morale: -4 })), (id) =>
          id === 'embrace' ? 'Best move: free hype is still hype' : undefined,
        )
      }
      scriptChoice(g, EVENT, 'Leaked Build', `An early build of "${x.title}" leaked online. People are streaming it. Someone already found the placeholder boss: a gray cube labeled "BOSS TODO".`, choices, { emoji: '\u{1F4E1}', data: base })
      return true
    }
    case 'bomb': {
      if (!x) return false
      const choices: ChoiceOption[] = [
        { id: 'patch', label: 'Ship a hotfix', emoji: '\u{1FA79}' },
        { id: 'statement', label: 'Post a statement', emoji: '\u{1F4DD}' },
        { id: 'ignore', label: 'Ignore it', emoji: '\u{1F648}' },
      ]
      if (hasTalent(g, 'Business')) {
        // Player scores decide how long a game keeps selling: a hotfix wins 3-7 points back,
        // a statement loses 0-3, ignoring it loses 4-9 and 15% of next year's buyers.
        const now = tailValue(x)
        const at = (dp: number, tail = x.tail) => tailValue(x, clampN(x.players + dp, 0, 99), tail) - now
        markBest(g, choices, (id) => (id === 'patch' ? at(5) - Math.round(devCost(b) * 2) : id === 'statement' ? at(-1.5) : at(-6.5, whole(x.tail * 0.85))), (id) =>
          id === 'patch' ? 'Best move: the fix pays for itself in sales' : id === 'statement' ? 'Best move: a hotfix would cost more than it wins back' : undefined,
        )
      }
      scriptChoice(g, EVENT, 'Review Bomb', `"${x.title}" is getting review-bombed because ${pick(g, ['a hat costs real money now', 'one character got a new haircut', 'the new patch moved the jump button', 'a developer said they prefer cats'])}. ${randInt(g, 2, 40)},000 one-star reviews in a weekend.`, choices, { emoji: '\u{1F4A3}', data: base })
      return true
    }
    case 'expose': {
      const choices: ChoiceOption[] = [
        { id: 'change', label: 'End mandatory crunch', emoji: '\u{1F370}' },
        { id: 'apologize', label: 'Apologize, change nothing', emoji: '\u{1F64F}' },
        { id: 'deny', label: 'Deny everything', emoji: '\u{1F645}' },
      ]
      if (hasTalent(g, 'Business')) {
        // Ending crunch: +8 morale now and no -9 next year, fewer bugs, but 25% slower work.
        const w = bizWorth(g, b)
        markBest(g, choices, (id) => (id === 'change' ? fxValue(g, b, w, { morale: 17, brand: -2 }) - 0.25 * 0.4 * w.contrib : id === 'apologize' ? fxValue(g, b, w, { brand: -4 }) : fxValue(g, b, w, { karma: -6, brand: -8, morale: -8 })), (id) =>
          id === 'change' ? 'Best move: a rested team ships better games' : undefined,
        )
      }
      scriptChoice(g, EVENT, 'Crunch Exposé', `A games journalist published "Inside ${a.name}'s Crunch Culture", with anonymous quotes about 90-hour weeks and a ${pick(g, ['nap pod nobody is allowed to use', 'mandatory weekend "fun day"', 'pizza budget bigger than the QA budget'])}.`, choices, { emoji: '\u{1F4F0}', data: base })
      return true
    }
    case 'streamer': {
      if (!x) return false
      const choices: ChoiceOption[] = [
        { id: 'sponsor', label: 'Sponsor more streams', emoji: '\u{1F3A5}' },
        { id: 'thank', label: 'Send a thank-you plushie', emoji: '\u{1F9F8}' },
      ]
      if (hasTalent(g, 'Business')) {
        const now = tailValue(x)
        markBest(g, choices, (id) => (id === 'sponsor' ? tailValue(x, x.players, whole(x.tail * 1.6)) - now - Math.round(devCost(b) * 0.5) : tailValue(x, x.players, whole(x.tail * 1.25)) - now), (id) =>
          id === 'sponsor' ? 'Best move: the extra buyers are worth more than the sponsorship' : 'Best move: the free buzz is enough',
        )
      }
      scriptChoice(g, EVENT, 'Streamer Spotlight', `A huge streamer played "${x.title}" for nine hours straight and called it "${pick(g, ['the best game nobody is talking about', 'my new obsession', 'the reason I have not slept'])}". Clips are everywhere.`, choices, { emoji: '\u{1F3A5}', data: base })
      return true
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// Greenlighting a game: scope → genre → platform → engine → name

interface GlDraft {
  assetId: string
  scope: ScopeId
  genre: GenreId
  platform: PlatformId
  engine: EngineId
  franchise: string
  sequelOf: string
  title: string
}

function readGl(v: Json | undefined): GlDraft {
  const d = v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  return {
    assetId: typeof d.assetId === 'string' ? d.assetId : '',
    scope: isScope(d.scope) ? d.scope : 'small',
    genre: isGenre(d.genre) ? d.genre : GENRES[0].id,
    platform: isPlatform(d.platform) ? d.platform : 'pc',
    engine: isEngine(d.engine) ? d.engine : 'cobalt',
    franchise: typeof d.franchise === 'string' ? d.franchise : '',
    sequelOf: typeof d.sequelOf === 'string' ? d.sequelOf : '',
    title: typeof d.title === 'string' ? d.title : '',
  }
}

function glJson(d: GlDraft): Json {
  return toJson(d)
}

const MAX_PIPELINE = 4

function greenlightBlock(g: GameState, a: Asset): string | null {
  const block = manageBlock(g, a)
  if (block) return block
  const st = studioOf(a)
  if (devGames(st).length >= MAX_PIPELINE) return `${a.name} already has ${MAX_PIPELINE} games in development.`
  if (readBiz(g, a).employees < 1) return 'Hire some developers first.'
  return null
}

/** Open the greenlight flow for a studio (optionally a sequel). */
export function startGreenlight(g: GameState, assetId: string, preset: Partial<GlDraft> = {}): void {
  const a = findBusiness(g, assetId)
  if (!a) return
  const reason = greenlightBlock(g, a)
  if (reason) {
    notice(g, 'Greenlight', reason, { emoji: '\u{1F6A6}' })
    return
  }
  const b = readBiz(g, a)
  const st = studioOf(a)
  const free = Math.max(0, b.employees - assignedDevs(st))
  const options = SCOPES.filter((s) => s.id !== 'jam')
  const choices: ChoiceOption[] = [
    ...options.map((s) => ({
      id: s.id,
      label: `${s.label}: ~${s.team} dev${s.team === 1 ? '' : 's'} for ${s.years} year${s.years === 1 ? '' : 's'}${b.employees < s.minTeam ? ` (needs ${s.minTeam}+ devs)` : ''}`,
      emoji: s.emoji,
    })),
    { id: 'cancel', label: 'Never mind', emoji: '\u{2716}\u{FE0F}' },
  ]
  if (hasTalent(g, 'Business')) {
    const franchise = preset.sequelOf ? franchisePull(st, preset.sequelOf) : 0
    const fixed: Partial<Pitch> = preset.genre && preset.sequelOf ? { genre: preset.genre } : {}
    const per = new Map(options.filter((s) => scopeOk(b, s.id)).map((s) => [s.id as string, bestPitch(g, a, b, st, { ...fixed, scope: s.id }, franchise)]))
    const funded = [...per.values()].some((p) => !!p && p.short <= 0)
    // Holding off only beats a game the studio can pay for; it doesn't stop the payroll.
    markBest(g, choices, (id) => {
      if (id === 'cancel') return funded ? 0 : null
      const p = per.get(id)
      return p ? pitchRank(p, p.perYear, funded) : null
    }, (id) => {
      const p = per.get(id)
      return id === 'cancel' ? 'Best move: no game this team can make right now would pay back' : p ? `Best size for this team and its cash: it should earn about ${money(p.perYear)} for every year it takes to make${fundingNote(p)}` : undefined
    })
  }
  scriptChoice(
    g,
    GL_SCOPE,
    preset.sequelOf ? `Sequel: ${preset.franchise || 'Untitled'}` : 'Greenlight a Game',
    `${a.name} has ${b.employees} developers (${free} free). How big is the next game?`,
    choices,
    { emoji: '\u{1F6A6}', data: glJson({ assetId, scope: 'small', genre: preset.genre ?? GENRES[0].id, platform: 'pc', engine: 'cobalt', franchise: preset.franchise ?? '', sequelOf: preset.sequelOf ?? '', title: preset.title ?? '' }) },
  )
}

const GL_SCOPE = defineScript('gamestudio.gl.scope', (g, choice, data) => {
  if (choice === 'cancel') return
  const d = readGl(data)
  const a = findBusiness(g, d.assetId)
  if (!a || greenlightBlock(g, a) || !isScope(choice)) return
  const sc = scopeDef(choice)
  if (readBiz(g, a).employees < sc.minTeam) {
    notice(g, 'Too Small', `${sc.label} games need at least ${sc.minTeam} developers. ${a.name} has ${readBiz(g, a).employees}. Hire more first.`, { emoji: '\u{1F6A6}' })
    return
  }
  d.scope = choice
  if (d.sequelOf) return glPlatform(g, d)
  const hot = new Set(hotGenres(g).map((x) => x.id))
  // Both hot genres are always on the list, plus four others.
  const options = shuffle(g, [...hotGenres(g), ...shuffle(g, GENRES.filter((x) => !hot.has(x.id))).slice(0, 4)])
  const choices: ChoiceOption[] = [...options.map((x) => ({ id: x.id, label: `${x.label}${hot.has(x.id) ? ' (hot!)' : ''}`, emoji: x.emoji })), { id: 'cancel', label: 'Never mind', emoji: '\u{2716}\u{FE0F}' }]
  if (hasTalent(g, 'Business')) {
    const b = readBiz(g, a)
    const st = studioOf(a)
    const per = new Map(options.map((x) => [x.id as string, bestPitch(g, a, b, st, { scope: d.scope, genre: x.id })]))
    const funded = [...per.values()].some((p) => !!p && p.short <= 0)
    markBest(g, choices, (id) => {
      const p = per.get(id)
      return p ? pitchRank(p, p.value, funded) : null
    }, (id) => {
      const p = per.get(id)
      const years = p?.years ?? 1
      return `Best genre for this one: the biggest audience for your team when it launches${years > 1 ? ` in ${years} years` : ''}${p ? fundingNote(p) : ''}`
    })
  }
  scriptChoice(g, GL_GENRE, 'Pick a Genre', `What will it be? ${[...hot].map((x) => genreDef(x).label).join(' and ')} games are hot right now.`, choices, { emoji: '\u{1F3AE}', data: glJson(d) })
})

const GL_GENRE = defineScript('gamestudio.gl.genre', (g, choice, data) => {
  if (choice === 'cancel' || !isGenre(choice)) return
  const d = readGl(data)
  const a = findBusiness(g, d.assetId)
  if (!a || greenlightBlock(g, a)) return
  d.genre = choice
  glPlatform(g, d)
})

function glPlatform(g: GameState, d: GlDraft): void {
  const sc = scopeDef(d.scope)
  const scale = costScale(g.character.countryId)
  const choices: ChoiceOption[] = [
    ...PLATFORMS.filter((p) => p.minScope <= sc.index).map((p) => ({ id: p.id, label: `${p.label}${p.certUsd > 0 ? ` (${money(p.certUsd * scale)} dev kits & certification)` : ''}`, emoji: p.emoji })),
    { id: 'cancel', label: 'Never mind', emoji: '\u{2716}\u{FE0F}' },
  ]
  const a = findBusiness(g, d.assetId)
  if (a && hasTalent(g, 'Business')) {
    const b = readBiz(g, a)
    const st = studioOf(a)
    const franchise = d.sequelOf ? franchisePull(st, d.sequelOf) : 0
    const per = new Map(choices.filter((c) => isPlatform(c.id)).map((c) => [c.id, bestPitch(g, a, b, st, { scope: d.scope, genre: d.genre, platform: c.id as PlatformId }, franchise)]))
    const funded = [...per.values()].some((p) => !!p && p.short <= 0)
    markBest(g, choices, (id) => {
      const p = per.get(id)
      return p ? pitchRank(p, p.value, funded) : null
    }, (id) => {
      const p = per.get(id)
      return `Best platform: about ${money(Math.max(0, p?.value ?? 0))} after store cuts, dev kits and launch costs${p ? fundingNote(p) : ''}`
    })
  }
  scriptChoice(g, GL_PLATFORM, 'Pick a Platform', `Where will it launch?`, choices, { emoji: '\u{1F579}\u{FE0F}', data: glJson(d) })
}

const GL_PLATFORM = defineScript('gamestudio.gl.platform', (g, choice, data) => {
  if (choice === 'cancel' || !isPlatform(choice)) return
  const d = readGl(data)
  const a = findBusiness(g, d.assetId)
  if (!a || greenlightBlock(g, a)) return
  d.platform = choice
  const sc = scopeDef(d.scope)
  const choices: ChoiceOption[] = [
    ...ENGINES.filter((e) => e.id !== 'blocks' && e.maxScope >= sc.index).map((e) => ({ id: e.id, label: `${e.label}: ${e.note}`, emoji: e.emoji })),
    { id: 'cancel', label: 'Never mind', emoji: '\u{2716}\u{FE0F}' },
  ]
  if (hasTalent(g, 'Business')) {
    const b = readBiz(g, a)
    const st = studioOf(a)
    const franchise = d.sequelOf ? franchisePull(st, d.sequelOf) : 0
    const burn = studioBurn(g, b, st)
    const per = new Map(choices.filter((c) => isEngine(c.id)).map((c) => [c.id, pitchValue(g, a, b, st, { scope: d.scope, genre: d.genre, platform: choice, engine: c.id as EngineId }, franchise, burn)]))
    const funded = [...per.values()].some((p) => p.short <= 0)
    markBest(g, choices, (id) => {
      const p = per.get(id)
      return p ? pitchRank(p, p.perYear, funded) : null
    }, (id) => {
      const p = per.get(id)
      return p ? `Best engine for this game: about ${p.years === 1 ? 'a year' : `${p.years} years`} of work and quality around ${Math.round(p.quality)}${fundingNote(p)}` : undefined
    })
  }
  scriptChoice(g, GL_ENGINE, 'Pick an Engine', 'Which engine will the team use?', choices, { emoji: '\u{2699}\u{FE0F}', data: glJson(d) })
})

const GL_ENGINE = defineScript('gamestudio.gl.engine', (g, choice, data) => {
  if (choice === 'cancel' || !isEngine(choice)) return
  const d = readGl(data)
  const a = findBusiness(g, d.assetId)
  if (!a || greenlightBlock(g, a)) return
  d.engine = choice
  const st = studioOf(a)
  const suggestion = d.title || (d.sequelOf ? sequelTitle(d.franchise, 2) : gameTitle(g, d.genre, new Set(st.games.map((x) => x.title))))
  scriptInput(g, {
    title: 'Name the Game',
    emoji: genreDef(d.genre).emoji,
    text: `${scopeDef(d.scope).label} ${genreDef(d.genre).label.toLowerCase()} for ${platformDef(d.platform).label}, built in ${engineDef(d.engine).label}. Working title?`,
    input: 'text',
    placeholder: 'Title',
    defaultValue: suggestion,
    scriptId: GL_NAME,
    data: glJson(d),
  })
})

const GL_NAME = defineScript('gamestudio.gl.name', (g, input, data) => {
  const d = readGl(data)
  const a = findBusiness(g, d.assetId)
  if (!a || greenlightBlock(g, a)) return
  const b = bizOf(g, a)
  const st = studioOf(a)
  const title =
    String(input ?? '')
      .replace(/[\u0000-\u001f<>]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 48) || (d.sequelOf ? sequelTitle(d.franchise, 2) : gameTitle(g, d.genre, new Set(st.games.map((x) => x.title))))
  const sc = scopeDef(d.scope)
  const free = b.employees - assignedDevs(st)
  const team = Math.max(1, Math.min(sc.team, free > 0 ? free : Math.max(1, Math.round(b.employees / (devGames(st).length + 1)))))
  const x = addGame(st, g, { scope: d.scope, genre: d.genre, platform: d.platform, engine: d.engine, title, team, franchise: d.franchise, sequelOf: d.sequelOf })
  saveStudio(a, st)
  count(g, 'studioGreenlights')
  log(g, `${a.name} greenlit "${title}".`, 'good')
  const years = Math.max(1, Math.round(sc.years / Math.pow(clampN(x.team / sc.team, 0.05, 3), 0.8)))
  notice(g, 'Greenlit!', `"${x.title}" is in production at ${a.name}: ${an(genreDef(x.genre).noun)} with ${x.team} developer${x.team === 1 ? '' : 's'}${free <= 0 ? ' (shared with your other projects)' : ''}. At this size it should take about ${years === 1 ? 'a year' : `${years} years`}.`, { emoji: '\u{1F7E2}', tone: 'good' })
})

// ---------------------------------------------------------------------------
// Studio actions

type StudioRun = (g: GameState, a: Asset, b: BizState, st: StudioState, input?: string) => void

function studioAct(a: Asset, key: string, label: string, emoji: string, opts: { subtitle?: string | ((g: GameState) => string); hint?: (g: GameState) => string | null; disabled?: (g: GameState) => string | null; confirm?: (g: GameState) => string | null; input?: MenuAction['input']; run: StudioRun }): MenuAction {
  return {
    type: 'action',
    id: `studio.${key}.${a.id}`,
    label,
    emoji,
    subtitle: opts.subtitle,
    ...(opts.hint ? { hint: opts.hint } : {}),
    disabledReason: (g) => manageBlock(g, a) ?? (opts.disabled ? opts.disabled(g) : null),
    confirm: opts.confirm,
    input: opts.input,
    run: (g, input) => {
      const cur = findBusiness(g, a.id)
      if (!cur || manageBlock(g, cur)) return
      const b = bizOf(g, cur)
      const st = studioOf(cur)
      opts.run(g, cur, b, st, input)
    },
  }
}

function amountOf(input: string | undefined, max: number): number {
  const n = Math.round(Number(String(input ?? '').replace(/[^0-9.]/g, '')))
  return Number.isFinite(n) ? Math.max(0, Math.min(Math.max(0, max), n)) : 0
}

function hireDevs(g: GameState, a: Asset, b: BizState, n: number): void {
  const room = maxDevs(b) - b.employees
  const count0 = Math.min(n, room)
  if (count0 <= 0) return notice(g, 'Full House', `${a.name}'s offices are full (${maxDevs(b)} desks). Open another studio office to grow.`, { emoji: '\u{1F3E2}' })
  const fee = Math.round(count0 * devCost(b) * 0.08)
  if (b.cash < fee) return noCash(g, a, fee, 'recruiting')
  b.cash -= fee
  b.yearCosts += fee
  b.employees += count0
  notice(g, 'Hiring Spree', `${a.name} hired ${count0} developer${count0 === 1 ? '' : 's'} (recruiters: ${formatMoney(fee)}). Each costs about ${formatMoney(devCost(b))} a year. Team: ${b.employees}.`, { emoji: '\u{1F465}', tone: 'good' })
}

function layOff(g: GameState, a: Asset, b: BizState, st: StudioState, n: number): void {
  const cut = Math.min(n, Math.max(0, b.employees - 1))
  if (cut <= 0) return notice(g, 'Layoffs', 'There is nobody left to lay off except you.', { emoji: '\u{1F4E6}' })
  const sev = Math.round((cut * devCost(b) * clampN(severanceMonths(b.countryId), 0, 12)) / 12)
  b.cash -= sev
  b.yearCosts += sev
  b.employees -= cut
  b.morale = clampN(b.morale - Math.min(20, 4 + Math.round((cut / Math.max(1, b.employees + cut)) * 40)), 0, 100)
  b.brand = clampN(b.brand - (cut >= 10 ? 3 : 1), 0, 100)
  // Teams shrink with the studio.
  const assigned = assignedDevs(st)
  if (assigned > b.employees) for (const x of devGames(st)) x.team = Math.max(1, Math.round((x.team * b.employees) / assigned))
  saveStudio(a, st)
  log(g, `${a.name} laid off ${cut} developer${cut === 1 ? '' : 's'}.`, 'bad')
  notice(g, 'Layoffs', `${a.name} laid off ${cut} developer${cut === 1 ? '' : 's'}${sev > 0 ? ` (${formatMoney(sev)} in severance)` : ''}. The remaining ${b.employees} are updating their CVs "just in case".`, { emoji: '\u{1F4E6}', tone: 'bad' })
}

function devGameNode(a: Asset, x0: StudioGame): MenuGroup {
  const gid = x0.id
  const cur = (g: GameState) => {
    const found = findBusiness(g, a.id)
    return found ? studioOf(found).games.find((y) => y.id === gid && y.stage !== 'live') : undefined
  }
  const once = (key: string) => `studio.${key}.${a.id}.${gid}`
  return {
    type: 'menu',
    id: `studio.game.${a.id}.${gid}`,
    label: x0.title,
    emoji: genreDef(x0.genre).emoji,
    subtitle: `${scopeDef(x0.scope).label} · ${Math.round(x0.progress)}% · ${x0.team} devs${x0.stage === 'ea' ? ' · early access' : ''}${x0.publisher ? ` · ${x0.publisher}` : ''}`,
    header: (g) => {
      const x = cur(g)
      if (!x) return 'This game is no longer in development.'
      return [
        `${genreDef(x.genre).emoji} "${x.title}": ${scopeDef(x.scope).label} ${genreDef(x.genre).label.toLowerCase()} for ${platformDef(x.platform).label}${x.exclusive ? ` (exclusive to ${x.exclusive})` : ''}, ${engineDef(x.engine).label}.`,
        `Progress ${Math.round(x.progress)}% · quality so far ${Math.round(x.quality)} · hype ${Math.round(x.hype)}${x.bugs >= 10 ? ` · bugs ${Math.round(x.bugs)}` : ''} · ${x.team} developers · ${money(x.spent)} spent`,
        `${genreDef(x.genre).label} games are ${trendLabel(genreTrend(g, x.genre))} this year.${x.publisher ? ` Published by ${x.publisher} (recouping ${money(x.recoup)}, then ${Math.round(x.devShare * 100)}% to you).` : ''}${x.backers ? ` ${x.backers.toLocaleString('en-US')} backers are waiting.` : ''}`,
      ].join('\n')
    },
    children: (g) => {
      const x = cur(g)
      if (!x) return [{ type: 'info', id: `studio.game.${a.id}.${gid}.gone`, text: 'This game is no longer in development.' }]
      const sc = scopeDef(x.scope)
      const nodes: MenuNode[] = [
        studioAct(a, `team.${gid}`, 'Set Team Size', '\u{1F465}', {
          subtitle: (gg) => `${x.team} assigned · ${readBiz(gg, a).employees} developers in the studio`,
          input: { kind: 'number', label: 'Developers on this game', min: 1, max: Math.max(1, readBiz(g, a).employees), defaultValue: () => String(Math.max(1, Math.min(readBiz(g, a).employees, sc.team))) },
          run: (gg, aa, bb, st, input) => {
            const y = st.games.find((z) => z.id === gid)
            if (!y) return
            y.team = Math.max(1, amountOf(input, bb.employees))
            saveStudio(aa, st)
            notice(gg, 'Team Set', `${y.team} developers are now on "${y.title}". The ideal team for ${an(sc.label)} game is about ${sc.team}.`, { emoji: '\u{1F465}' })
          },
        }),
        studioAct(a, `hype.${gid}`, 'Marketing Push', '\u{1F3AC}', {
          subtitle: (gg) => `${money(sc.marketingUsd * 0.12 * costScale(readBiz(gg, a).countryId))} · trailer and showcase slot`,
          disabled: (gg) => (yearActionsUsed(gg, once('hype')) >= 1 ? 'Once a year per game.' : null),
          run: (gg, aa, bb, st) => {
            const y = st.games.find((z) => z.id === gid)
            if (!y) return
            if (!useYearAction(gg, once('hype'), 1)) return tooBusy(gg, 'run a marketing push for this game')
            const cost = Math.round(sc.marketingUsd * 0.12 * costScale(bb.countryId))
            if (bb.cash < cost) return noCash(gg, aa, cost, 'the trailer')
            bb.cash -= cost
            bb.yearCosts += cost
            y.hype = clampN(y.hype + randInt(gg, 15, 25) * (0.8 + bb.brand / 200), 0, 100)
            saveStudio(aa, st)
            notice(gg, 'Trailer Drop', `"${y.title}" got a trailer and a slot in a big online showcase (${formatMoney(cost)}). ${pick(gg, ['The comments say "TAKE MY MONEY".', 'It trended for six hours.', 'A famous streamer reacted with a single tear.'])} Hype ${Math.round(y.hype)}/100.`, { emoji: '\u{1F3AC}', tone: 'good' })
          },
        }),
      ]
      if (sc.index <= 2 && !x.raised && x.stage === 'dev') {
        nodes.push(
          studioAct(a, `crowd.${gid}`, 'Crowdfund It', '\u{1F4B8}', {
            subtitle: 'All or nothing; backers already own it at launch',
            disabled: () => (x.progress < 10 ? 'Make some progress first.' : null),
            run: (gg, aa, bb, st) => {
              const y = st.games.find((z) => z.id === gid)
              if (!y || y.raised) return
              const fans = gdView(gg).gamerFame
              const interest = (300 + y.hype * 60 + bb.brand * 80 + fans * 250) * Math.pow(clampN(y.quality, 10, 100) / 55, 1.5) * genreTrend(gg, y.genre) * randFloat(gg, 0.4, 1.6)
              // Backers are a slice of the people who would buy the game, never more.
              const cap = backerCap(gg, { scope: y.scope, genre: y.genre, platform: y.platform, quality: Math.max(y.quality, 60), hype: y.hype, fame: Math.max(fans, bb.brand / 2), reach: homeReach(bb.countryId) })
              const backers = whole(Math.min(interest, cap * randFloat(gg, 0.7, 1.1)))
              const raised = whole(backers * (priceOf(y.scope, y.platform) * 1.5 + 5) * 0.9)
              const goal = Math.round(scopeDef(y.scope).extraUsd * 2 + devCost(bb) * 2)
              y.raised = 1
              if (raised < goal) {
                saveStudio(aa, st)
                notice(gg, 'Campaign Failed', `"${y.title}" raised ${formatMoney(raised)} of its ${formatMoney(goal)} goal, so it got nothing. All or nothing is a harsh mistress.`, { emoji: '\u{1F4C9}', tone: 'bad' })
                return
              }
              y.raised = raised
              y.backers = backers
              y.hype = clampN(y.hype + 15, 0, 100)
              bb.cash += raised
              bb.yearIncome += raised
              saveStudio(aa, st)
              log(gg, `${aa.name} crowdfunded "${y.title}": ${money(raised)}.`, 'good')
              notice(gg, 'Funded!', `"${y.title}" raised ${formatMoney(raised)} from ${backers.toLocaleString('en-US')} backers (goal ${formatMoney(goal)}). The money is in the company account. The backers own the game at launch, so they won't buy it twice.`, { emoji: '\u{1F4B8}', tone: 'good' })
            },
          }),
        )
      }
      if (!x.publisher) {
        nodes.push(
          studioAct(a, `pub.${gid}`, 'Sign with a Publisher', '\u{1F91D}', {
            hint: (gg) => {
              const found = findBusiness(gg, a.id)
              if (!found || !hasTalent(gg, 'Business') || manageBlock(gg, found)) return null
              const st = studioOf(found)
              const y = st.games.find((z) => z.id === gid && z.stage !== 'live')
              if (!y || y.progress < 15) return null
              const bb = readBiz(gg, found)
              // A typical offer: the middle of the advance range and a 50% share.
              const s2 = scopeDef(y.scope)
              const est = s2.potential * platformDef(y.platform).audience * genreDef(y.genre).appeal * genreTrend(gg, y.genre) * qualityFactor(Math.max(y.quality, 55)) * s2.luck[0] * homeReach(bb.countryId)
              const advance = Math.round(clampN(est * netPerCopy(priceOf(y.scope, y.platform)) * 0.375 * (0.8 + bb.brand / 250), 0, s2.marketingUsd * 2 + s2.extraUsd * s2.years))
              if (advance < devCost(bb)) return talentHint(gg, 'Business', "Publishers won't bite yet: polish it first")
              const v = publishValues(gg, found, bb, st, y, advance, 0.5)
              return talentHint(gg, 'Business', v.sign > v.self ? `Worth pitching: a typical deal beats self-publishing by about ${money(v.sign - v.self)}` : `Self-publish this one: a typical deal would cost you about ${money(v.self - v.sign)}`)
            },
            subtitle: 'Cash now and marketing muscle, for a cut of sales',
            disabled: (gg) => (x.progress < 15 ? 'Publishers want a vertical slice first (15%).' : yearActionsUsed(gg, once('pub')) >= 1 ? 'You already pitched it this year.' : null),
            run: (gg, aa, bb, st) => {
              if (!useYearAction(gg, once('pub'), 1)) return tooBusy(gg, 'pitched this game to publishers')
              const y = st.games.find((z) => z.id === gid)
              if (!y) return
              const s2 = scopeDef(y.scope)
              const est = s2.potential * platformDef(y.platform).audience * genreDef(y.genre).appeal * genreTrend(gg, y.genre) * qualityFactor(Math.max(y.quality, 55)) * s2.luck[0] * homeReach(bb.countryId)
              const advance = Math.round(clampN(est * netPerCopy(priceOf(y.scope, y.platform)) * randFloat(gg, 0.3, 0.45) * (0.8 + bb.brand / 250), 0, s2.marketingUsd * 2 + s2.extraUsd * s2.years))
              if (advance < devCost(bb)) {
                notice(gg, 'Publishers Passed', `Publishers watched the "${y.title}" demo and said it "isn't a fit for our portfolio right now." Polish it and try next year.`, { emoji: '\u{1F4E7}', tone: 'bad' })
                return
              }
              const pubName = pick(gg, s2.index >= 3 ? GIANTS.map((z) => z.name) : PUBLISHERS)
              const devShare = Math.round(randFloat(gg, 0.4, 0.6) * 100) / 100
              const choices: ChoiceOption[] = [
                { id: 'sign', label: `Sign (${money(advance)} advance)`, emoji: '\u{1F91D}' },
                { id: 'self', label: 'Self-publish', emoji: '\u{1F3E0}' },
              ]
              if (hasTalent(gg, 'Business')) {
                const v = publishValues(gg, aa, bb, st, y, advance, devShare)
                markBest(gg, choices, (id) => (id === 'sign' ? v.sign : v.self), (id, margin) =>
                  id === 'sign' ? `Best move: the deal should beat self-publishing by about ${money(margin)}` : `Best move: you'd keep about ${money(margin)} more by publishing it yourself`,
                )
              }
              scriptChoice(gg, PUB, 'Publishing Offer', `${pubName} offers a ${formatMoney(advance)} advance for "${y.title}" (a quarter now, the rest in milestones) and will market it worldwide. They earn back the advance and their marketing from sales first; after that ${a.name} gets ${Math.round(devShare * 100)}%.`, choices, { emoji: '\u{1F91D}', data: { assetId: aa.id, gameId: gid, advance, devShare, publisher: pubName } })
            },
          }),
        )
      }
      if (sc.index <= 2 && x.stage === 'dev' && (x.platform === 'pc' || x.platform === 'vr')) {
        nodes.push(
          studioAct(a, `ea.${gid}`, 'Launch in Early Access', '\u{1F6A7}', {
            subtitle: 'Sell it while you finish it',
            disabled: () => (x.progress < 50 ? 'Needs to be at least 50% done.' : null),
            run: (gg, aa, bb, st) => {
              const y = st.games.find((z) => z.id === gid)
              if (!y || y.stage !== 'dev') return
              const est = firstYearCopies(gg, { scope: y.scope, genre: y.genre, platform: y.platform, quality: y.quality * 0.9, hype: y.hype, marketing: 0.8, reach: homeReach(bb.countryId), fame: bb.brand / 2, franchise: 0, presold: y.backers })
              y.stage = 'ea'
              y.eaTail = whole(est * 0.35)
              y.hype = clampN(y.hype + 8, 0, 100)
              saveStudio(aa, st)
              log(gg, `${aa.name} launched "${y.title}" in early access.`, 'good')
              notice(gg, 'Early Access', `"${y.title}" is in early access. Expect around ${copiesLabel(y.eaTail)} this year, plus a firehose of feedback that will make the full release better.`, { emoji: '\u{1F6A7}', tone: 'good' })
            },
          }),
        )
      }
      nodes.push(
        studioAct(a, `cancel.${gid}`, 'Cancel It', '\u{1F5D1}\u{FE0F}', {
          confirm: () => `Cancel "${x.title}"? ${money(x.spent)} of work goes in the bin${x.advanceGot + x.exclusiveFee + (x.raised > 1 ? x.raised : 0) > 0 ? `, and ${money(x.advanceGot + x.exclusiveFee + (x.raised > 1 ? x.raised : 0))} in advances, fees and pledges must be paid back` : ''}.`,
          run: (gg, aa, bb, st) => {
            const y = st.games.find((z) => z.id === gid)
            if (!y) return
            st.games = st.games.filter((z) => z.id !== gid)
            bb.morale = clampN(bb.morale - 8, 0, 100)
            // Money taken for a game that will never ship goes back: refunds, advances, exclusivity fees.
            const refunds = (y.raised > 1 ? y.raised : 0) + y.advanceGot + y.exclusiveFee
            if (refunds > 0) {
              bb.cash -= refunds
              bb.yearCosts += refunds
            }
            if (y.raised > 1) {
              bb.brand = clampN(bb.brand - 10, 0, 100)
              addHidden(gg, 'karma', -5)
            }
            saveStudio(aa, st)
            log(gg, `${aa.name} cancelled "${y.title}".`, 'bad')
            const owed = [
              y.raised > 1 ? `${y.backers.toLocaleString('en-US')} backers are furious and got ${formatMoney(y.raised)} in refunds.` : '',
              y.advanceGot > 0 ? `${y.publisher} invoked the cancellation clause and took back its ${formatMoney(y.advanceGot)} advance.` : '',
              y.exclusiveFee > 0 ? `${y.exclusive} wants its ${formatMoney(y.exclusiveFee)} exclusivity fee back, and got it.` : '',
            ]
              .filter(Boolean)
              .join(' ')
            notice(gg, 'Cancelled', `You cancelled "${y.title}". The team held a small funeral for the prototype.${owed ? ` ${owed}` : ''}`, { emoji: '\u{1F5D1}\u{FE0F}', tone: 'bad' })
          },
        }),
      )
      return nodes
    },
  }
}

const PUB = defineScript('gamestudio.publisher', (g, choice, data) => {
  if (choice !== 'sign') return
  const d = data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  const a = findBusiness(g, typeof d.assetId === 'string' ? d.assetId : undefined)
  if (!a || manageBlock(g, a)) return
  const b = bizOf(g, a)
  const st = studioOf(a)
  const x = st.games.find((y) => y.id === d.gameId)
  if (!x || x.publisher || x.stage === 'live') return
  const advance = typeof d.advance === 'number' && Number.isFinite(d.advance) ? Math.max(0, Math.round(d.advance)) : 0
  const upfront = Math.round(advance * 0.25)
  x.publisher = typeof d.publisher === 'string' ? d.publisher : PUBLISHERS[0]
  x.devShare = typeof d.devShare === 'number' && Number.isFinite(d.devShare) ? clampN(d.devShare, 0.3, 0.8) : 0.5
  x.recoup = whole(advance + scopeDef(x.scope).marketingUsd)
  x.advance = advance
  x.advanceGot = upfront
  x.hype = clampN(x.hype + 15, 0, 100)
  b.cash += upfront
  b.yearIncome += upfront
  saveStudio(a, st)
  log(g, `${a.name} signed "${x.title}" with ${x.publisher}.`, 'good')
  notice(g, 'Deal Signed', `${x.publisher} signed "${x.title}" for a ${formatMoney(advance)} advance: ${formatMoney(upfront)} now, the rest in milestones as the game gets built and at launch. They handle marketing, and royalties start once they've earned back ${formatMoney(x.recoup)}. Cancel the game and they'll want their money back.`, { emoji: '\u{1F91D}', tone: 'good' })
})

function liveGameNode(a: Asset, x0: StudioGame): MenuGroup {
  const gid = x0.id
  const cur = (g: GameState) => {
    const found = findBusiness(g, a.id)
    return found ? studioOf(found).games.find((y) => y.id === gid && y.stage === 'live') : undefined
  }
  const once = (key: string) => `studio.${key}.${a.id}.${gid}`
  return {
    type: 'menu',
    id: `studio.live.${a.id}.${gid}`,
    label: x0.title,
    emoji: genreDef(x0.genre).emoji,
    subtitle: `${x0.released} · ${CRITIC_SITE} ${x0.critic} · ${copiesLabel(x0.copies)}`,
    header: (g) => {
      const x = cur(g)
      if (!x) return 'Gone.'
      return [
        `${genreDef(x.genre).emoji} "${x.title}" (${x.released}): ${scopeDef(x.scope).label} ${genreDef(x.genre).label.toLowerCase()} on ${platformDef(x.platform).label}.`,
        `${CRITIC_SITE} ${x.critic} · players ${x.players} ("${playerLabel(x.players)}") · ${copiesLabel(x.copies)} sold${x.dlcs ? ` · ${x.dlcs} DLC` : ''}`,
        x.tail > 0 ? `Still selling: about ${copiesLabel(x.tail)} expected next year.` : 'It has stopped selling.',
        x.publisher ? `Published by ${x.publisher}${x.recoup > 0 ? ` (still recouping ${money(x.recoup)})` : ''}.` : '',
      ]
        .filter(Boolean)
        .join('\n')
    },
    children: (g) => {
      const x = cur(g)
      if (!x) return []
      const sc = scopeDef(x.scope)
      return [
        studioAct(a, `dlc.${gid}`, 'Release DLC', '\u{1F381}', {
          subtitle: (gg) => `${money(sc.extraUsd * 0.6 * costScale(readBiz(gg, a).countryId) + devCost(readBiz(gg, a)) * Math.max(1, sc.team * 0.15) * 0.5)} · ${x.dlcs}/8`,
          disabled: (gg) => (x.released >= gg.year ? 'Give it a year first.' : x.dlcs >= 8 ? 'Eight DLCs. Time for a sequel.' : yearActionsUsed(gg, once('dlc')) >= 1 ? 'One DLC a year.' : null),
          run: (gg, aa, bb, st) => {
            const y = st.games.find((z) => z.id === gid)
            if (!y) return
            if (!useYearAction(gg, once('dlc'), 1)) return tooBusy(gg, 'released DLC for this game')
            const cost = Math.round(sc.extraUsd * 0.6 * costScale(bb.countryId) + devCost(bb) * Math.max(1, sc.team * 0.15) * 0.5)
            if (bb.cash < cost) return noCash(gg, aa, cost, 'the DLC')
            bb.cash -= cost
            bb.yearCosts += cost
            const q = clampN(bb.quality * 0.5 + y.critic * 0.4 + staffPower(bb, 'quality') * 5 + randInt(gg, -10, 10), 0, 100)
            y.lastDlc = gg.year
            if (q < 45) {
              y.players = Math.round(clampN(y.players - 5, 0, 99))
              saveStudio(aa, st)
              notice(gg, 'DLC Flopped', `The "${y.title}" DLC was called "a cash grab" in every language. Player score down to ${y.players}.`, { emoji: '\u{1F41F}', tone: 'bad' })
              return
            }
            y.dlcs += 1
            y.tail = whole(y.tail + Math.min(y.copies * 0.25, y.copies * 0.1 * (qualityFactor(q) / qualityFactor(70)) * Math.pow(0.8, y.dlcs - 1)) * 0.5)
            y.players = Math.round(clampN(y.players + randInt(gg, 0, 3), 0, 99))
            saveStudio(aa, st)
            log(gg, `${aa.name} released DLC for "${y.title}".`, 'good')
            notice(gg, 'DLC Out', `"${y.title}: ${pick(gg, ['The Frozen North', 'Blood & Brine', 'The Lost Archive', 'Cosmic Edition', 'Heart of the Swamp'])}" is out (${formatMoney(cost)}). Reviews: "${playerLabel(q)}".`, { emoji: '\u{1F381}', tone: 'good' })
          },
        }),
        studioAct(a, `patch.${gid}`, 'Ship a Big Patch', '\u{1FA79}', {
          subtitle: (gg) => `${money(devCost(readBiz(gg, a)) * 1.5)} · win players back`,
          disabled: (gg) => (yearActionsUsed(gg, once('patch')) >= 1 ? 'Once a year.' : x.players >= x.critic + 12 ? 'Players already love it as much as they will.' : null),
          run: (gg, aa, bb, st) => {
            const y = st.games.find((z) => z.id === gid)
            if (!y) return
            if (!useYearAction(gg, once('patch'), 1)) return tooBusy(gg, 'patched this game')
            const cost = Math.round(devCost(bb) * 1.5)
            if (bb.cash < cost) return noCash(gg, aa, cost, 'the patch')
            bb.cash -= cost
            bb.yearCosts += cost
            const up = Math.min(Math.max(0, y.critic + 12 - y.players), randInt(gg, 3, 8))
            y.players = Math.round(clampN(y.players + up, 0, 99))
            y.tail = whole(y.tail * 1.08)
            saveStudio(aa, st)
            notice(gg, 'Patched', `Patch notes for "${y.title}" ran 40 pages. Player score up to ${y.players} ("${playerLabel(y.players)}").`, { emoji: '\u{1FA79}', tone: 'good' })
          },
        }),
        studioAct(a, `sequel.${gid}`, 'Greenlight a Sequel', '\u{1F501}', {
          subtitle: x.critic >= 50 ? 'Franchise time' : 'Nobody asked for one',
          disabled: (gg) => greenlightBlock(gg, a) ?? (x.critic < 50 ? 'It flopped. Nobody wants a sequel.' : null),
          run: (gg, aa, _bb, st) => {
            const y = st.games.find((z) => z.id === gid)
            if (!y) return
            const franchise = y.franchise || y.title
            const nth = st.games.filter((z) => z.franchise === franchise || z.title === franchise).length + 1
            if (!y.franchise) {
              y.franchise = franchise
              saveStudio(aa, st)
            }
            startGreenlight(gg, aa.id, { genre: y.genre, franchise, sequelOf: y.id, title: sequelTitle(franchise, Math.max(2, nth)) })
          },
        }),
      ]
    },
  }
}

/**
 * Money a studio holds for games still in development that it would owe back if they were
 * cancelled (publisher advances, exclusivity fees, crowdfunding pledges). It funds the work;
 * it can't be paid out to the owner.
 */
export function earmarkedCash(a: Asset): number {
  if (a.kind !== 'business' || a.details?.industry !== 'gameStudio') return 0
  return devGames(studioOf(a)).reduce((sum, x) => sum + x.advanceGot + x.exclusiveFee + (x.raised > 1 ? x.raised : 0), 0)
}

/** Info line for the business screen. */
export function studioInfo(g: GameState, a: Asset): string {
  const st = studioOf(a)
  const b = readBiz(g, a)
  return `${studioLine(st)} · ${b.employees} developers (${assignedDevs(st)} assigned) · ${policyLabel(st.policy)}`
}

/** The game-specific part of a studio's management screen. */
export function studioNodes(g: GameState, a: Asset): MenuNode[] {
  const st = studioOf(a)
  const b = readBiz(g, a)
  const nodes: MenuNode[] = []
  nodes.push({
    type: 'action',
    id: `studio.greenlight.${a.id}`,
    label: 'Greenlight a Game',
    emoji: '\u{1F6A6}',
    subtitle: `${devGames(st).length}/${MAX_PIPELINE} in development · hot: ${hotGenres(g)
      .map((x) => x.label)
      .join(', ')}`,
    disabledReason: (gg) => greenlightBlock(gg, a),
    hint: (gg) => {
      const found = findBusiness(gg, a.id)
      if (!found || !hasTalent(gg, 'Business') || greenlightBlock(gg, found)) return null
      const p = cachedPitch(gg, found)
      if (!p) return null
      return talentHint(gg, 'Business', p.value > 0 ? `Next game: ${pitchName(p)} looks best${fundingNote(p)}` : 'Nothing this team can make right now would pay back')
    },
    run: (gg) => startGreenlight(gg, a.id),
  })
  const dev = devGames(st)
  if (dev.length) {
    nodes.push({ type: 'heading', id: `studio.devH.${a.id}`, label: 'In Development' })
    for (const x of dev) nodes.push(devGameNode(a, x))
  }
  const live = st.games.filter((x) => x.stage === 'live').sort((x, y) => y.released - x.released)
  if (live.length) {
    nodes.push({
      type: 'menu',
      id: `studio.catalog.${a.id}`,
      label: 'Released Games',
      emoji: '\u{1F4DA}',
      subtitle: `${live.length} game${live.length === 1 ? '' : 's'} · ${copiesLabel(live.reduce((s, x) => s + x.copies, 0))} sold`,
      children: () => live.map((x) => liveGameNode(a, x)),
    })
  }
  nodes.push({
    type: 'menu',
    id: `studio.team.${a.id}`,
    label: 'Developers & Crunch',
    emoji: '\u{1F465}',
    subtitle: `${b.employees} developers · ${policyLabel(st.policy)} · morale ${b.morale}%`,
    disabledReason: (gg) => manageBlock(gg, a),
    header: (gg) => {
      const bb = readBiz(gg, a)
      return `Each developer costs about ${money(devCost(bb))} a year in ${getCountry(bb.countryId).name}. Offices seat ${maxDevs(bb)}. Crunch ships games faster but grinds morale down and adds bugs; relaxed hours make better games, slower.`
    },
    children: (gg) => {
      const bb = readBiz(gg, a)
      const found = findBusiness(gg, a.id)
      const cur = found ? studioOf(found) : normalizeStudio(undefined)
      const rows: MenuNode[] = [
        studioAct(a, 'hire', 'Hire Developers', '\u{1F4E5}', {
          hint: (x) => {
            const r = teamRunway(x, a)
            return r && r.months < 12 ? talentHint(x, 'Business', `Hold off: the studio's cash covers only ${monthsOf(r.months)} of the team you already have`) : null
          },
          subtitle: `${money(devCost(bb))}/yr each · ${bb.employees}/${maxDevs(bb)}`,
          input: { kind: 'number', label: 'How many?', min: 1, max: Math.max(1, maxDevs(bb) - bb.employees), defaultValue: () => '5' },
          disabled: () => (bb.employees >= maxDevs(bb) ? 'The offices are full.' : null),
          run: (x, aa, b2, _st, input) => hireDevs(x, aa, b2, amountOf(input, maxDevs(b2) - b2.employees)),
        }),
        studioAct(a, 'layoff', 'Lay Off Developers', '\u{1F4E6}', {
          hint: (x) => {
            const r = teamRunway(x, a)
            return r && r.months < 12 && r.idle > 0
              ? talentHint(x, 'Business', `Let the ${r.idle} idle developer${r.idle === 1 ? '' : 's'} go: the cash covers only ${monthsOf(r.months)} of payroll, and severance is cheaper than a cash crunch`)
              : null
          },
          subtitle: `Severance: ${severanceMonths(bb.countryId)} months' pay`,
          input: { kind: 'number', label: 'How many?', min: 1, max: Math.max(1, bb.employees - 1), defaultValue: () => '1' },
          disabled: () => (bb.employees <= 1 ? 'Nobody left to lay off.' : null),
          run: (x, aa, b2, st2, input) => layOff(x, aa, b2, st2, amountOf(input, b2.employees - 1)),
        }),
        { type: 'heading', id: `studio.policyH.${a.id}`, label: 'Working hours' },
      ]
      for (const p of ['relaxed', 'normal', 'crunch'] as StudioPolicy[]) {
        rows.push(
          studioAct(a, `policy.${p}`, `${p === 'relaxed' ? 'Relaxed Hours' : p === 'crunch' ? 'Crunch Mode' : 'Normal Hours'}${cur.policy === p ? ' (current)' : ''}`, p === 'relaxed' ? '\u{1F33F}' : p === 'crunch' ? '\u{1F35C}' : '\u{1F552}', {
            subtitle: p === 'relaxed' ? 'Slower, better games, happy team' : p === 'crunch' ? '25% faster, buggier, miserable team' : 'The usual',
            disabled: () => (cur.policy === p ? 'Already the policy.' : null),
            run: (x, aa, _b2, st2) => {
              st2.policy = p
              saveStudio(aa, st2)
              notice(x, 'Working Hours', p === 'crunch' ? `${aa.name} is in crunch mode. Free dinners, no weekends, a lot of quiet crying in the stairwell.` : p === 'relaxed' ? `${aa.name} switched to relaxed hours. Someone brought a dog to work. Productivity dipped; happiness soared.` : `${aa.name} is back to normal hours.`, { emoji: p === 'crunch' ? '\u{1F35C}' : '\u{1F552}' })
            },
          }),
        )
      }
      return rows
    },
  })
  return nodes
}

// ---------------------------------------------------------------------------
// Founding a studio from a teenage indie game venture

/** Why an indie game venture can't become a studio right now (null = it can). */
export function ventureStudioBlock(g: GameState, va: Asset): string | null {
  const block = foundBlock(g)
  if (block) return block
  if (va.kind !== 'venture' || va.details?.type !== 'game') return 'Only an indie game venture can grow into a studio.'
  const v = readVenture(g, va)
  if (v.stage !== 'live') return 'Launch the game first.'
  const fee = studioRegistrationFee(g)
  if (g.character.money + v.cash < fee) return `Registering a company costs ${formatMoney(fee)}.`
  return null
}

export function studioRegistrationFee(g: GameState): number {
  const c = g.character
  const city = getCountry(c.countryId).cities.includes(c.city) ? c.city : getCountry(c.countryId).cities[0]
  const cost = startupCost('gameStudio', c.countryId, city)
  return Math.round(cost.fee + cost.permits)
}

function ventureGenre(idea: string): GenreId {
  const t = idea.toLowerCase()
  if (/farm|cozy/.test(t)) return 'cozy'
  if (/roguelike/.test(t)) return 'roguelike'
  if (/horror/.test(t)) return 'horror'
  if (/puzzle|tax/.test(t)) return 'puzzle'
  if (/racing|cart/.test(t)) return 'racing'
  if (/strategy|stand/.test(t)) return 'strategy'
  if (/soulslike|cat/.test(t)) return 'rpg'
  return 'platformer'
}

const GROW = defineScript('gamestudio.grow', (g, choice, data) => {
  if (choice === 'no') return
  const d = data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  const va = g.assets.find((x) => x.id === d.assetId)
  if (!va) return
  growVentureIntoStudio(g, va, choice === 'manager' ? 'manager' : 'me')
})

/** Ask whether to grow an indie game venture into a studio (who runs it?). */
export function offerStudioGrowth(g: GameState, va: Asset, intro = ''): void {
  const reason = ventureStudioBlock(g, va)
  if (reason) {
    notice(g, 'Game Studio', reason, { emoji: '\u{1F3AE}' })
    return
  }
  const job = g.character.job
  scriptChoice(
    g,
    GROW,
    'Become a Real Studio?',
    `${intro}${intro ? ' ' : ''}Turn ${va.name} into a registered game studio: a real company with developers, offices, a pipeline of games and a valuation (registration about ${formatMoney(studioRegistrationFee(g))}). Its game, cash and investors come along.`,
    [
      { id: 'me', label: job ? `Run it myself (quit my job as ${job.title})` : 'Run it myself', emoji: '\u{1F454}' },
      { id: 'manager', label: 'Hire a manager to run it', emoji: '\u{1F9D1}\u{200D}\u{1F4BC}' },
      { id: 'no', label: 'Keep it an indie venture', emoji: '\u{1F3E0}' },
    ],
    { emoji: '\u{1F3AE}', data: { assetId: va.id } },
  )
}

/** Convert an indie game venture into a game studio business. Returns the new asset. */
export function growVentureIntoStudio(g: GameState, va: Asset, runner: 'me' | 'manager'): Asset | null {
  const reason = ventureStudioBlock(g, va)
  if (reason) {
    notice(g, 'Game Studio', reason, { emoji: '\u{1F3AE}' })
    return null
  }
  const c = g.character
  const v = readVenture(g, va)
  const fee = studioRegistrationFee(g)
  const fromCash = Math.min(v.cash, fee)
  const fromYou = fee - fromCash
  c.money = Math.round(c.money - fromYou)
  const country = getCountry(c.countryId)
  const city = country.cities.includes(c.city) ? c.city : country.cities[0]
  const price = [4.99, 14.99, 24.99][clampN(Math.round(v.tier), 0, 2)]
  const b = newBiz(g, 'gameStudio', c.countryId, city, {
    share: clampN(v.stake, 0.01, 1),
    invested: whole(v.invested + fromYou),
    cash: whole(v.cash - fromCash),
    employees: Math.max(1, Math.min(6, 1 + v.contractors)),
    quality: Math.round(clampN(v.quality, 30, 80)),
    brand: Math.round(clampN(15 + v.hype / 3 + c.hidden.fame / 4, 5, 60)),
    morale: 75,
  })
  const st = normalizeStudio(undefined)
  st.seq = 1
  st.games.push({
    id: 'sg1',
    title: va.name,
    genre: ventureGenre(v.idea),
    platform: 'pc',
    scope: v.users >= 50_000 ? 'indie' : 'small',
    engine: 'cobalt',
    stage: 'live',
    progress: 100,
    quality: v.quality,
    team: 0,
    bugs: 0,
    hype: v.hype,
    started: v.founded,
    released: v.launchYear || v.founded,
    critic: Math.round(v.quality),
    players: Math.round(v.quality),
    copies: whole(v.users),
    tail: whole(v.tail),
    price,
    gross: whole(v.revenue),
    dlcs: 0,
    lastDlc: 0,
    franchise: '',
    sequelOf: '',
    publisher: '',
    recoup: 0,
    advance: 0,
    advanceGot: 0,
    exclusiveFee: 0,
    devShare: 1,
    exclusive: '',
    backers: 0,
    raised: 0,
    eaCopies: 0,
    eaTail: 0,
    crunch: 0,
    spent: 0,
    awards: [],
  })
  b.studio = toJson(st)
  const a = createBusinessAsset(g, va.name, b, whole(v.invested + fromYou))
  a.purchasedAge = va.purchasedAge
  g.assets = g.assets.filter((x) => x.id !== va.id)
  g.assets.push(a)
  b.valuation = Math.max(valuationOf(b), v.valuation)
  refreshValue(a, b)
  const p = gdMut(g)
  if (!p.offered.includes(va.id)) p.offered.push(va.id)
  tidy(p)
  count(g, 'businessesFounded')
  count(g, 'studiosFounded')
  let quit: string | null = null
  if (runner === 'me') quit = becomeCeo(g, a, b, 'Founder & CEO')
  else installManager(g, b, managerCandidate(g, b))
  addStat(g, 'happiness', 10)
  log(g, `I turned ${va.name} into a real game studio.`, 'good')
  remember(g, `Turned the indie game ${va.name} into a registered game studio in ${city}.`)
  const run = runner === 'me' ? ` You're the Founder & CEO${quit ? `, and you quit your job as ${quit}` : ''}.` : ` ${b.manager ? `${b.manager.firstName} ${b.manager.lastName}` : 'A general manager'} runs it day to day.`
  notice(g, 'Studio Founded!', `${va.name} is now a registered game studio in ${city} with ${b.employees} developer${b.employees === 1 ? '' : 's'}. Its game keeps selling under the company, and the next one is up to you: greenlight it from the company screen.${fromYou > 0 ? ` Registration cost you ${formatMoney(fromYou)}.` : ''}${run}`, { emoji: '\u{1F3AE}', tone: 'good', ai: { when: 'full', facts: `${va.name} became a game studio in ${city}.` } })
  return a
}

/** Studios the player owns (Game Industry lists them). */
export function studioAssets(g: GameState): Asset[] {
  return g.assets.filter((a) => a.kind === 'business' && a.details?.industry === 'gameStudio')
}

/** One-line summary for the AI context. */
export function studioSummary(g: GameState, a: Asset): string {
  const st = studioOf(a)
  const b = readBiz(g, a)
  const dev = devGames(st)
  const live = st.games.filter((x) => x.stage === 'live')
  const best = [...live].sort((x, y) => y.critic - x.critic)[0]
  return `${a.name} (game studio, ${b.employees} devs, ${dev.length} in development${best ? `, best game "${best.title}" ${best.critic}` : ''}${b.public ? ', publicly traded' : ''}; ${runsIt(g, a) ? 'CEO' : 'owner'})`
}

export const studioInternals = { EVENT, IDLE_SCRIPT, GL_SCOPE, GL_GENRE, GL_PLATFORM, GL_ENGINE, GL_NAME, PUB, GROW, hireDevs, layOff, addGame, ensureCatalog }
