// Combat sports: MMA (the Hexagon Fighting Championship), boxing (four sanctioning bodies and
// undisputed glory), kickboxing (Valor Kickboxing) and Muay Thai (the Thai stadium circuit).
//
// Path: join a gym → amateur bouts → sign with a regional promotion → get called up to the big
// league → climb the rankings → title shots, belts, defenses, rivalries, pay-per-view → retire
// (and maybe come back). Fight night is a string of choices, round by round: strike, grapple,
// go for a submission, defend, or trash-talk. Fights end by KO, TKO, submission or the judges.
//
// Skills and records live in the persistent fighter profile ('special.sports.fight'); a pro
// career is a Job (defId 'sports.fighter').
import { addHidden, addStat, count, earnIncome, log, scriptChoice, useYearAction, yearActionsUsed } from '../core'
import { killCharacter } from '../death'
import { common } from '../events/era'
import { bell, chance, pick, rand, randInt } from '../rng'
import { defineScript } from '../scripts'
import { ageCeiling, bodyCeiling, masterFirstTime, masteryCap } from '../mastery'
import { hasMainCharacter, hasTalent, talentMult } from '../talents'
import type { GameState, Gender, Job, Json, MenuAction, MenuGroup, MenuNode } from '../types'
import { getCountry } from '../world'
import { addFame, blocked, fameToward, hire, leave, money, myJob, ownerKey, peek, prof, quitNote, say, short, syncTenure, tell, view } from './common'
import {
  addBuzz,
  addHeadTrauma,
  healInjury,
  honor,
  injure,
  localFee,
  nickname,
  payFee,
  payerNote,
  popularTag,
  recordCareer,
  scandal,
  sportsBan,
  sportsGate,
  theName,
  tidy,
  trainGain,
  wealth,
  worldAthlete,
} from './sports-core'

// ---------------------------------------------------------------------------
// Disciplines

export type DiscId = 'mma' | 'boxing' | 'kickboxing' | 'muaythai'
type Move = 'strike' | 'power' | 'grapple' | 'sub' | 'body' | 'defend' | 'taunt'
type Style = 'striker' | 'wrestler' | 'bjj' | 'brawler' | 'balanced' | 'boxer' | 'counter'

interface Discipline {
  id: DiscId
  name: string
  emoji: string
  locale: RegExp
  fighter: string
  major: string
  majorShort: string
  rounds: [number, number]
  /** Boxing: each choice covers a block of rounds. */
  blocks: [number, number] | null
  moves: { id: Move; label: string; emoji: string }[]
  styles: Style[]
  maxFights: number
  purse: { regional: number; regionalCap: number; major: number; perWin: number; perRank: number; champ: number; champStep: number; cap: number }
  ppv: number
  perfBonus: number
  /** Finishing power per choice (boxing choices cover several rounds). */
  finish: number
  weights: { s: number; g: number; c: number; h: number; iq: number }
  classes: { male: string[]; female: string[] }
}

const MMA_M = ['Flyweight', 'Bantamweight', 'Featherweight', 'Lightweight', 'Welterweight', 'Middleweight', 'Light Heavyweight', 'Heavyweight']
const MMA_F = ['Strawweight', 'Flyweight', 'Bantamweight', 'Featherweight']
const BOX_M = ['Flyweight', 'Bantamweight', 'Featherweight', 'Lightweight', 'Welterweight', 'Middleweight', 'Light Heavyweight', 'Cruiserweight', 'Heavyweight']
const BOX_F = ['Flyweight', 'Bantamweight', 'Featherweight', 'Lightweight', 'Welterweight', 'Middleweight']

export const DISCIPLINES: Discipline[] = [
  {
    id: 'mma',
    name: 'MMA',
    emoji: '\u{1F94A}',
    locale: /mma|mixed martial|jiu-jitsu|vale tudo/i,
    fighter: 'MMA Fighter',
    major: 'Hexagon Fighting Championship',
    majorShort: 'HFC',
    rounds: [3, 5],
    blocks: null,
    moves: [
      { id: 'strike', label: 'Strike', emoji: '\u{1F44A}' },
      { id: 'grapple', label: 'Take it to the ground', emoji: '\u{1F93C}' },
      { id: 'sub', label: 'Go for a submission', emoji: '\u{1F40D}' },
      { id: 'defend', label: 'Defend and counter', emoji: '\u{1F6E1}\u{FE0F}' },
      { id: 'taunt', label: 'Trash-talk and showboat', emoji: '\u{1F5E3}\u{FE0F}' },
    ],
    styles: ['striker', 'wrestler', 'bjj', 'brawler', 'balanced'],
    maxFights: 3,
    purse: { regional: 1_500, regionalCap: 15_000, major: 12_000, perWin: 4_000, perRank: 9_000, champ: 350_000, champStep: 100_000, cap: 1_500_000 },
    ppv: 1.2,
    perfBonus: 50_000,
    finish: 1,
    weights: { s: 0.3, g: 0.3, c: 0.2, h: 0.1, iq: 0.1 },
    classes: { male: MMA_M, female: MMA_F },
  },
  {
    id: 'boxing',
    name: 'Boxing',
    emoji: '\u{1F94A}',
    locale: /boxing/i,
    fighter: 'Boxer',
    major: 'World Championship Boxing',
    majorShort: 'world-level boxing',
    rounds: [3, 4],
    blocks: [10, 12],
    moves: [
      { id: 'strike', label: 'Jab and move', emoji: '\u{1F44A}' },
      { id: 'power', label: 'Load up on power shots', emoji: '\u{1F4A5}' },
      { id: 'body', label: 'Go to the body', emoji: '\u{1F3AF}' },
      { id: 'defend', label: 'Shell up and counter', emoji: '\u{1F6E1}\u{FE0F}' },
      { id: 'taunt', label: 'Drop your hands and taunt', emoji: '\u{1F5E3}\u{FE0F}' },
    ],
    styles: ['boxer', 'brawler', 'counter', 'balanced'],
    maxFights: 3,
    purse: { regional: 2_000, regionalCap: 25_000, major: 40_000, perWin: 15_000, perRank: 30_000, champ: 1_500_000, champStep: 600_000, cap: 8_000_000 },
    ppv: 5,
    perfBonus: 0,
    finish: 1.5,
    weights: { s: 0.55, g: 0, c: 0.2, h: 0.15, iq: 0.1 },
    classes: { male: BOX_M, female: BOX_F },
  },
  {
    id: 'kickboxing',
    name: 'Kickboxing',
    emoji: '\u{1F9B5}',
    locale: /kickboxing|karate|taekwondo/i,
    fighter: 'Kickboxer',
    major: 'Valor Kickboxing',
    majorShort: 'Valor',
    rounds: [3, 5],
    blocks: null,
    moves: [
      { id: 'strike', label: 'Throw combinations', emoji: '\u{1F44A}' },
      { id: 'power', label: 'Go for the head kick', emoji: '\u{1F9B5}' },
      { id: 'body', label: 'Chop the legs', emoji: '\u{1FA93}' },
      { id: 'defend', label: 'Check kicks and counter', emoji: '\u{1F6E1}\u{FE0F}' },
      { id: 'taunt', label: 'Showboat for the crowd', emoji: '\u{1F5E3}\u{FE0F}' },
    ],
    styles: ['striker', 'brawler', 'counter', 'balanced'],
    maxFights: 4,
    purse: { regional: 1_000, regionalCap: 8_000, major: 10_000, perWin: 3_000, perRank: 4_000, champ: 150_000, champStep: 50_000, cap: 500_000 },
    ppv: 0,
    perfBonus: 10_000,
    finish: 1,
    weights: { s: 0.5, g: 0.05, c: 0.2, h: 0.15, iq: 0.1 },
    classes: { male: MMA_M, female: MMA_F },
  },
  {
    id: 'muaythai',
    name: 'Muay Thai',
    emoji: '\u{1F1F9}\u{1F1ED}',
    locale: /muay thai/i,
    fighter: 'Nak Muay',
    major: 'Siam Grand Stadium',
    majorShort: 'the stadiums',
    rounds: [5, 5],
    blocks: null,
    moves: [
      { id: 'strike', label: 'Teeps and body kicks', emoji: '\u{1F9B5}' },
      { id: 'power', label: 'Throw elbows', emoji: '\u{1F4AA}' },
      { id: 'body', label: 'Clinch and knee', emoji: '\u{1F93C}' },
      { id: 'defend', label: 'Block and counter', emoji: '\u{1F6E1}\u{FE0F}' },
      { id: 'taunt', label: 'Dance for the gamblers', emoji: '\u{1F5E3}\u{FE0F}' },
    ],
    styles: ['striker', 'brawler', 'counter', 'balanced'],
    maxFights: 6,
    purse: { regional: 400, regionalCap: 4_000, major: 5_000, perWin: 1_500, perRank: 2_500, champ: 60_000, champStep: 20_000, cap: 300_000 },
    ppv: 0,
    perfBonus: 2_000,
    finish: 0.45,
    weights: { s: 0.5, g: 0.05, c: 0.2, h: 0.15, iq: 0.1 },
    classes: { male: MMA_M, female: MMA_F },
  },
]

export function discipline(id: string | null | undefined): Discipline {
  return DISCIPLINES.find((d) => d.id === id) ?? DISCIPLINES[0]
}

const BOX_BODIES: [string, string][] = [
  ['GBF', 'Global Boxing Federation'],
  ['WPA', 'World Pugilism Association'],
  ['IPC', 'International Prizefighting Council'],
  ['UBO', 'Universal Boxing Organization'],
]

function classList(d: Discipline, gender: Gender): string[] {
  return gender === 'female' ? d.classes.female : d.classes.male
}

function beltName(g: GameState, d: Discipline, cls: string, body?: string): string {
  if (d.id === 'boxing') return `${body ?? 'GBF'} ${cls} title`
  if (d.id === 'mma') return `HFC ${cls} Championship`
  if (d.id === 'kickboxing') return `Valor ${cls} World Championship`
  return `${majorName(g, d)} ${cls} title`
}

/** The regional promotion or circuit (a proper name: use theName() inside sentences). */
function regionalName(g: GameState, d: Discipline): string {
  const c = getCountry(g.character.countryId)
  if (d.id === 'muaythai' && c.id === 'th') return 'Bangkok Stadium Circuit'
  if (d.id === 'boxing') return `${c.demonym} Boxing Circuit`
  if (d.id === 'kickboxing') return `${c.demonym} Kickboxing League`
  if (d.id === 'muaythai') return `${c.demonym} Muay Thai League`
  return `${c.demonym} Fight Series`
}

function majorName(g: GameState, d: Discipline): string {
  if (d.id === 'muaythai' && g.character.countryId !== 'th') return 'Muay Thai World Series'
  return d.major
}

// ---------------------------------------------------------------------------
// State

interface FightRec {
  w: number
  l: number
  d: number
  nc: number
  ko: number
  sub: number
  dec: number
  koLosses: number
}

interface Rival {
  name: string
  flag: string
  nick: string
  disc: DiscId
  rating: number
  style: Style
  beatYou: number
  youBeat: number
  heat: number
}

interface FProfile {
  striking: number
  grappling: number
  cardio: number
  chin: number
  iq: number
  natural: number
  gym: string
  gymTier: number
  gymFee: number
  amateur: Record<string, FightRec>
  pro: Record<string, FightRec>
  belts: string[]
  hype: number
  rivals: Rival[]
  peakRank: number | null
  retiredAge: number | null
  startAge: number
  earnings: number
  doping: boolean
  trained: string[]
  lastFightAge: number
}

interface Opp {
  name: string
  nick: string
  flag: string
  style: Style
  rating: number
  s: number
  g: number
  c: number
  chin: number
  iq: number
  w: number
  l: number
  d: number
  rank: number | null
  champ: boolean
  rival: boolean
  belt: string
}

interface FJob {
  disc: DiscId
  tier: 'regional' | 'major'
  promotion: string
  cls: number
  rank: number | null
  regionalChamp: boolean
  belts: string[]
  defenses: number
  champ: Opp | null
  fightsLeft: number
  streak: number
  promoWins: number
  injured: number
  earned: number
}

const emptyRec = (): FightRec => ({ w: 0, l: 0, d: 0, nc: 0, ko: 0, sub: 0, dec: 0, koLosses: 0 })

function initFighter(g: GameState): FProfile {
  const c = g.character
  const base = c.hidden.athleticism * 0.35 + 10 + (hasTalent(g, 'Athletics') ? 6 : 0)
  const arts = flagBelts(g)
  return {
    striking: clampN(base + arts.strike + randInt(g, 0, 8)),
    grappling: clampN(base + arts.grapple + randInt(g, 0, 8)),
    cardio: clampN(c.hidden.athleticism * 0.5 + 15 + randInt(g, 0, 10)),
    chin: randInt(g, 45, 90),
    iq: clampN(15 + c.stats.smarts * 0.15 + randInt(g, 0, 10)),
    natural: c.gender === 'female' ? Math.round(bell(g, 0, 3)) : Math.round(bell(g, 1, 7)),
    gym: '',
    gymTier: 0,
    gymFee: 0,
    amateur: {},
    pro: {},
    belts: [],
    hype: 5,
    rivals: [],
    peakRank: null,
    retiredAge: null,
    startAge: c.age,
    earnings: 0,
    doping: false,
    trained: [],
    lastFightAge: -1,
  }
}

function clampN(n: number): number {
  return Number.isFinite(n) ? Math.max(1, Math.min(100, Math.round(n))) : 1
}

function fightNum(value: unknown, fallback = 0, lo = 0, hi = 1e12): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(lo, Math.min(hi, Math.round(value))) : fallback
}

function fightText(value: unknown, fallback = '', max = 120): string {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max) || fallback : fallback
}

function fightStringList(input: unknown, max = 256): string[] {
  return Array.isArray(input)
    ? [...new Set(input.filter((x): x is string => typeof x === 'string').map((x) => fightText(x)).filter(Boolean))].slice(-max)
    : []
}

function normalizedFight(g: GameState, value: unknown): FProfile {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Partial<FProfile> : {}
  const records = (input: unknown): Record<string, FightRec> => {
    const out: Record<string, FightRec> = {}
    if (!input || typeof input !== 'object' || Array.isArray(input)) return out
    for (const d of DISCIPLINES) {
      const value = (input as Record<string, unknown>)[d.id]
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue
      const r = value as Partial<FightRec>
      out[d.id] = { w: fightNum(r.w, 0, 0, 1e6), l: fightNum(r.l, 0, 0, 1e6), d: fightNum(r.d, 0, 0, 1e6), nc: fightNum(r.nc, 0, 0, 1e6), ko: fightNum(r.ko, 0, 0, 1e6), sub: fightNum(r.sub, 0, 0, 1e6), dec: fightNum(r.dec, 0, 0, 1e6), koLosses: fightNum(r.koLosses, 0, 0, 1e6) }
    }
    return out
  }
  const styles: Style[] = ['striker', 'wrestler', 'bjj', 'brawler', 'balanced', 'boxer', 'counter']
  const rivals: Rival[] = []
  if (Array.isArray(raw.rivals)) for (const value of raw.rivals.slice(-32)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const r = value as Partial<Rival>
    rivals.push({
      name: fightText(r.name, 'Unknown Fighter', 80), flag: fightText(r.flag, '🥊', 16), nick: fightText(r.nick, '', 80),
      disc: DISCIPLINES.some((d) => d.id === r.disc) ? r.disc as DiscId : 'mma', rating: fightNum(r.rating, 1, 1, 100),
      style: styles.includes(r.style as Style) ? r.style as Style : 'balanced', beatYou: fightNum(r.beatYou, 0, 0, 1e6),
      youBeat: fightNum(r.youBeat, 0, 0, 1e6), heat: fightNum(r.heat, 0, 0, 100),
    })
  }
  return {
    striking: fightNum(raw.striking, 1, 1, 100), grappling: fightNum(raw.grappling, 1, 1, 100), cardio: fightNum(raw.cardio, 1, 1, 100),
    chin: fightNum(raw.chin, 1, 1, 100), iq: fightNum(raw.iq, 1, 1, 100), natural: fightNum(raw.natural, 0, 0, 32),
    gym: fightText(raw.gym), gymTier: fightNum(raw.gymTier, 0, 0, 10), gymFee: fightNum(raw.gymFee),
    amateur: records(raw.amateur), pro: records(raw.pro), belts: fightStringList(raw.belts), hype: fightNum(raw.hype, 0, 0, 100), rivals,
    peakRank: typeof raw.peakRank === 'number' && Number.isFinite(raw.peakRank) ? fightNum(raw.peakRank, 0, 0, 100) : null,
    retiredAge: typeof raw.retiredAge === 'number' && Number.isFinite(raw.retiredAge) ? fightNum(raw.retiredAge, 0, 0, 10_000) : null,
    startAge: fightNum(raw.startAge, fightNum(g.character.age, 0, 0, 10_000), 0, 10_000), earnings: fightNum(raw.earnings),
    doping: raw.doping === true, trained: fightStringList(raw.trained, 32), lastFightAge: fightNum(raw.lastFightAge, -1, -1, 10_000),
  }
}

/** Martial arts belts (Activities › Mind & Body) give fighters a head start. */
function flagBelts(g: GameState): { strike: number; grapple: number } {
  const rec = g.flags.martialArts
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return { strike: 0, grapple: 0 }
  const belt = (id: string) => {
    const v = (rec as Record<string, Json>)[id]
    return v && typeof v === 'object' && !Array.isArray(v) && typeof v.belt === 'number' ? v.belt : 0
  }
  return { strike: Math.min(20, belt('karate') * 2 + belt('taekwondo') * 2 + belt('kungfu') * 2), grapple: Math.min(25, belt('jiujitsu') * 5 + belt('judo') * 3) }
}

function fighter(g: GameState): FProfile {
  const p = prof(g, 'sports.fight', initFighter)
  Object.assign(p, normalizedFight(g, p))
  // Main Character Syndrome: the first time you fight or spar, your skills are at the body's ceiling
  // for the age (and follow it down later). Chin, the gym, the opponent and the judges stay as they were.
  if (hasMainCharacter(g)) {
    masterFirstTime(g, 'fight.ring', 'martial', 'combat sports')
    const top = bodyCeiling(g, { peakEnd: 32 })
    p.striking = top
    p.grappling = top
    p.cardio = top
    p.iq = ageCeiling(g.character.age, { from: 10, full: 20, floor: 30 })
  }
  return p
}

function viewFighter(g: GameState): FProfile | null {
  const p = peek<FProfile>(g, 'sports.fight')
  return p ? normalizedFight(g, p) : null
}

function recOf(p: FProfile, disc: DiscId, amateur: boolean): FightRec {
  const book = amateur ? p.amateur : p.pro
  if (!book[disc]) book[disc] = emptyRec()
  return book[disc]
}

export function fighterJob(g: GameState): Job | null {
  return myJob(g, 'sports.fighter')
}

/** The pro fighter's job record, normalized, without touching the job: safe in menus (renders are pure). */
function fjView(job: Job): FJob {
  const raw = job.data && typeof job.data === 'object' && !Array.isArray(job.data) ? job.data as unknown as Partial<FJob> : {}
  const disc = DISCIPLINES.some((d) => d.id === raw.disc) ? raw.disc as DiscId : 'mma'
  const rank = typeof raw.rank === 'number' && Number.isFinite(raw.rank) && raw.rank >= 0 && raw.rank <= 15 ? Math.round(raw.rank) : null
  const styles: Style[] = ['striker', 'wrestler', 'bjj', 'brawler', 'balanced', 'boxer', 'counter']
  let champ: Opp | null = null
  if (raw.champ && typeof raw.champ === 'object' && !Array.isArray(raw.champ) && typeof raw.champ.name === 'string' && raw.champ.name.trim()) {
    const c = raw.champ as Partial<Opp>
    const rating = fightNum(c.rating, 60, 1, 100)
    champ = {
      name: fightText(c.name, 'Unknown Fighter', 80), nick: fightText(c.nick, '', 80), flag: fightText(c.flag, '🥊', 16),
      style: styles.includes(c.style as Style) ? c.style as Style : 'balanced', rating,
      s: fightNum(c.s, rating, 1, 100), g: fightNum(c.g, rating, 1, 100), c: fightNum(c.c, rating, 1, 100),
      chin: fightNum(c.chin, rating, 1, 100), iq: fightNum(c.iq, rating, 1, 100),
      w: fightNum(c.w, 0, 0, 1e6), l: fightNum(c.l, 0, 0, 1e6), d: fightNum(c.d, 0, 0, 1e6),
      rank: typeof c.rank === 'number' && Number.isFinite(c.rank) && c.rank >= 0 && c.rank <= 15 ? Math.round(c.rank) : null,
      champ: c.champ === true, rival: c.rival === true, belt: fightText(c.belt, '', 120),
    }
  }
  const normalized: FJob = {
    disc,
    tier: raw.tier === 'major' ? 'major' : 'regional',
    promotion: fightText(raw.promotion, fightText(job.company, 'Regional Circuit', 120), 120),
    cls: fightNum(raw.cls, 0, 0, 100),
    rank,
    regionalChamp: raw.regionalChamp === true,
    belts: fightStringList(raw.belts, 16),
    defenses: fightNum(raw.defenses, 0, 0, 1e6),
    champ,
    fightsLeft: fightNum(raw.fightsLeft, 0, 0, 1e6),
    streak: fightNum(raw.streak, 0, -1e6, 1e6),
    promoWins: fightNum(raw.promoWins, 0, 0, 1e6),
    injured: fightNum(raw.injured, 0, 0, 1e6),
    earned: fightNum(raw.earned, 0, 0, 1e12),
  }
  return normalized
}

/** The pro fighter's job record, normalized in place so actions and hooks can update it. */
function fj(job: Job): FJob {
  const normalized = fjView(job)
  if (!job.data || typeof job.data !== 'object' || Array.isArray(job.data)) job.data = {}
  Object.assign(job.data, normalized)
  return view<FJob>(job.data)
}

function rating(p: FProfile, d: Discipline): number {
  const w = d.weights
  return Math.round(p.striking * w.s + p.grappling * w.g + p.cardio * w.c + p.chin * w.h + p.iq * w.iq)
}

/** A fighter's level for a discipline (0-100), with doping and talent. */
function level(g: GameState, p: FProfile, d: Discipline): number {
  let r = rating(p, d)
  if (hasTalent(g, 'Athletics')) r += 5
  if (p.doping) r += 5
  // Main Character Syndrome: technique is instant, the level against the field takes years of fights.
  return Math.max(1, Math.min(99, masteryCap(g, 'fight.ring'), r))
}

function fmt(r: FightRec): string {
  return `${r.w}-${r.l}${r.d ? `-${r.d}` : ''}${r.nc ? ` (${r.nc} NC)` : ''}`
}

function rankText(job: Job): string {
  const d = fjView(job)
  if (d.tier === 'regional') return d.regionalChamp ? 'regional champion' : 'regional circuit'
  if (d.rank === 0) return 'CHAMPION'
  return d.rank === null ? 'unranked' : `ranked #${d.rank}`
}

// ---------------------------------------------------------------------------
// Opponents

const STYLE_SKEW: Record<Style, { s: number; g: number; c: number }> = {
  striker: { s: 8, g: -8, c: 0 },
  wrestler: { s: -6, g: 10, c: 4 },
  bjj: { s: -10, g: 14, c: 0 },
  brawler: { s: 6, g: -6, c: -8 },
  balanced: { s: 0, g: 0, c: 0 },
  boxer: { s: 6, g: 0, c: 4 },
  counter: { s: 4, g: 0, c: 0 },
}

const STYLE_LABEL: Record<Style, string> = {
  striker: 'striker',
  wrestler: 'wrestler',
  bjj: 'jiu-jitsu ace',
  brawler: 'brawler',
  balanced: 'well-rounded',
  boxer: 'slick boxer',
  counter: 'counter-puncher',
}

function makeOpp(g: GameState, d: Discipline, lvl: number, opts: { rank?: number | null; champ?: boolean; home?: number; belt?: string; record?: 'amateur' | 'regional' | 'major' } = {}): Opp {
  const who = worldAthlete(g, g.character.gender, opts.home ?? 0.3)
  const style = pick(g, d.styles)
  const sk = STYLE_SKEW[style]
  const r = clampN(lvl + bell(g, -4, 4))
  const kind = opts.record ?? 'major'
  const w = kind === 'amateur' ? randInt(g, 0, 6) : kind === 'regional' ? randInt(g, 2, 11) : randInt(g, 10, 24) + (opts.champ ? 4 : 0)
  const l = kind === 'amateur' ? randInt(g, 0, 4) : kind === 'regional' ? randInt(g, 0, 5) : randInt(g, opts.champ ? 0 : 1, opts.champ ? 3 : 7)
  // Attributes that average out (with the discipline's weights) to the target level.
  const w8 = d.weights
  const chin = randInt(g, 45, 92)
  let s0 = r + sk.s + bell(g, -5, 5)
  let g0 = w8.g > 0.1 ? r + sk.g + bell(g, -5, 5) : r * 0.4
  const c0 = r + sk.c + bell(g, -6, 6)
  const iq0 = r * 0.8 + bell(g, -6, 6)
  const actual = s0 * w8.s + g0 * w8.g + c0 * w8.c + chin * w8.h + iq0 * w8.iq
  const adj = (r - actual) / (w8.s + (w8.g > 0.1 ? w8.g : 0))
  s0 += adj
  if (w8.g > 0.1) g0 += adj
  return {
    name: who.name,
    nick: chance(g, kind === 'amateur' ? 0.15 : 0.5) ? nickname(g) : '',
    flag: who.flag,
    style,
    rating: r,
    s: clampN(s0),
    g: clampN(g0),
    c: clampN(c0),
    chin,
    iq: clampN(iq0),
    w,
    l,
    d: chance(g, 0.2) ? randInt(g, 1, 2) : 0,
    rank: opts.rank ?? null,
    champ: !!opts.champ,
    rival: false,
    belt: opts.belt ?? '',
  }
}

function oppName(o: Opp): string {
  if (!o.nick) return `${o.flag} ${o.name}`
  const parts = o.name.split(' ')
  return parts.length > 1 ? `${o.flag} ${parts[0]} "${o.nick}" ${parts.slice(1).join(' ')}` : `${o.flag} ${o.name} "${o.nick}"`
}

function oppLine(o: Opp): string {
  return `${oppName(o)} (${o.w}-${o.l}${o.d ? `-${o.d}` : ''}, ${STYLE_LABEL[o.style]}${o.champ ? ', champion' : o.rank ? `, #${o.rank}` : ''})`
}

function rankLevel(rank: number | null): number {
  if (rank === 0) return 90
  if (rank === null) return 64
  return 88 - rank * 1.4
}

// ---------------------------------------------------------------------------
// Offers (who you fight)

type OfferKind = 'amateur' | 'regular' | 'regionalTitle' | 'title' | 'defense' | 'unify' | 'rival'

interface Offer {
  kind: OfferKind
  opp: Opp
  show: number
  win: number
  main: boolean
  rounds: number
  belt: string
}

function purseFor(g: GameState, d: Discipline, job: Job | null, kind: OfferKind, opp: Opp): { show: number; win: number } {
  if (!job || kind === 'amateur') return { show: 0, win: 0 }
  const j = fjView(job)
  const p = d.purse
  if (j.tier === 'regional') {
    const show = tidy(Math.min(p.regionalCap, (p.regional + j.promoWins * p.regional * 0.35) * Math.max(0.3, wealth(g)) * (kind === 'regionalTitle' ? 2 : 1)))
    return { show, win: show }
  }
  if (j.rank === 0) {
    const show = tidy(Math.min(p.cap, p.champ + j.defenses * p.champStep))
    return { show, win: 0 }
  }
  let show = p.major + j.promoWins * p.perWin + (j.rank ? (16 - j.rank) * p.perRank : 0)
  if (kind === 'title' || kind === 'unify') show = Math.max(show * 2, p.champ * 0.35)
  if (kind === 'rival') show *= 1.4
  if (opp.champ) show = Math.max(show, p.champ * 0.3)
  show = tidy(Math.min(p.cap, show))
  return { show, win: kind === 'title' || kind === 'unify' ? 0 : show }
}

function buildOffers(g: GameState, d: Discipline, job: Job | null, amateur: boolean): Offer[] {
  const p = fighter(g)
  const me = level(g, p, d)
  const out: Offer[] = []
  const mk = (kind: OfferKind, opp: Opp, main: boolean, belt = ''): Offer => {
    const { show, win } = purseFor(g, d, job, kind, opp)
    const titleFight = kind === 'title' || kind === 'defense' || kind === 'unify'
    const rounds = d.rounds[titleFight || (main && d.id === 'mma' && kind === 'rival') ? 1 : 0]
    return { kind, opp, show, win, main, rounds, belt }
  }
  if (amateur || !job) {
    out.push(mk('amateur', makeOpp(g, d, me + randInt(g, -8, -2), { home: 0.9, record: 'amateur' }), false))
    out.push(mk('amateur', makeOpp(g, d, me + randInt(g, -2, 5), { home: 0.9, record: 'amateur' }), false))
    return out
  }
  const j = fj(job)
  const cls = classList(d, g.character.gender)[Math.min(j.cls, classList(d, g.character.gender).length - 1)]
  if (j.tier === 'regional') {
    out.push(mk('regular', makeOpp(g, d, Math.min(70, me + randInt(g, -8, 0)), { home: 0.8, record: 'regional' }), false))
    out.push(mk('regular', makeOpp(g, d, Math.min(74, me + randInt(g, 0, 8)), { home: 0.8, record: 'regional' }), false))
    if (!j.regionalChamp && j.promoWins >= 3) out.push(mk('regionalTitle', makeOpp(g, d, Math.min(72, me + randInt(g, 0, 6)), { home: 0.9, record: 'regional', champ: true }), true))
  } else {
    if (j.rank === 0) {
      out.push(mk('defense', makeOpp(g, d, rankLevel(1), { rank: 1, record: 'major' }), true, j.belts.join(' & ')))
      out.push(mk('defense', makeOpp(g, d, rankLevel(randInt(g, 2, 4)), { rank: randInt(g, 2, 4), record: 'major' }), true, j.belts.join(' & ')))
      if (d.id === 'boxing' && j.belts.length < BOX_BODIES.length) {
        const body = BOX_BODIES.find(([b]) => !j.belts.some((x) => x.startsWith(b)))
        if (body) out.push(mk('unify', makeOpp(g, d, rankLevel(0) - 2, { champ: true, belt: beltName(g, d, cls, body[0]), record: 'major' }), true, beltName(g, d, cls, body[0])))
      }
    } else {
      const r = j.rank
      const nearRank = r === null ? null : Math.min(15, r + randInt(g, 0, 3))
      out.push(mk('regular', makeOpp(g, d, nearRank === null ? 62 + randInt(g, -4, 4) : rankLevel(nearRank), { rank: nearRank, home: 0.15 }), false))
      const up = r === null ? randInt(g, 12, 15) : Math.max(1, r - randInt(g, 2, 5))
      if (r === null ? j.promoWins >= 1 : r > 1) out.push(mk('regular', makeOpp(g, d, rankLevel(up), { rank: up, home: 0.15 }), true))
      const shot = r !== null && ((r <= 3 && j.streak >= 2) || r === 1 || (r <= 6 && p.hype >= 75) || (r <= 8 && j.streak >= 5))
      if (shot) {
        if (!j.champ) j.champ = makeOpp(g, d, rankLevel(0), { champ: true, record: 'major', belt: beltName(g, d, cls, BOX_BODIES[randInt(g, 0, 3)][0]) })
        const champ = j.champ
        out.push(mk('title', champ, true, champ.belt || beltName(g, d, cls)))
      }
    }
  }
  const rival = p.rivals.find((x) => x.disc === d.id && x.heat >= 15)
  if (rival && !amateur) {
    // Rivals keep their own level (they improve a little), within what the circuit allows.
    const cap = j.tier === 'major' ? 92 : 74
    const lvl = Math.max(30, Math.min(cap, rival.rating + randInt(g, -2, 3)))
    const opp = makeOpp(g, d, lvl, { rank: j.tier === 'major' && j.rank !== 0 ? Math.max(1, (j.rank ?? 12) - 1) : null })
    opp.name = rival.name
    opp.flag = rival.flag
    opp.nick = rival.nick
    opp.style = rival.style
    opp.rival = true
    out.push(mk('rival', opp, true))
  }
  return out
}

/**
 * The matchmaker's card stays the same until you fight (or the year turns), so backing out of
 * the offers and reopening them can't reroll your way to a softer opponent.
 */
function fightCard(g: GameState, d: Discipline, job: Job | null, amateur: boolean): Offer[] {
  const key = 'special.sports.fight.card'
  const used = yearActionsUsed(g, amateur ? 'sports.fight.amBouts' : 'sports.fight.bouts')
  const j = job ? fj(job) : null
  // A new card also comes when what you're owed changes (a title shot from hype, a grudge match).
  const p = viewFighter(g)
  const hot = (p?.hype ?? 0) >= 75
  const grudge = !!p?.rivals.some((x) => x.disc === d.id && x.heat >= 15)
  const tag = [ownerKey(g), g.character.age, d.id, amateur ? 'am' : 'pro', used, j ? `${j.tier}.${j.rank}.${j.cls}.${j.streak}.${j.belts.length}` : '', hot, grudge].join('|')
  const v = g.flags[key]
  // Copies, so the popup's data never aliases the stored card.
  const copy = (o: Offer[]): Offer[] => JSON.parse(JSON.stringify(o)) as Offer[]
  if (v && typeof v === 'object' && !Array.isArray(v) && v.tag === tag && Array.isArray(v.offers) && v.offers.length) return copy(v.offers as unknown as Offer[])
  const offers = buildOffers(g, d, job, amateur)
  g.flags[key] = { tag, offers: copy(offers) } as unknown as Json
  return offers
}

// ---------------------------------------------------------------------------
// Fight night

interface Side {
  hp: number
  st: number
  top: boolean
  reckless: boolean
}

interface FightState {
  disc: DiscId
  amateur: boolean
  offer: Offer
  round: number
  z: number
  missedWeight: boolean
  you: Side
  them: Side
  margins: number[]
  hype: number
  story: string
}

interface Stats {
  s: number
  g: number
  c: number
  chin: number
  iq: number
}

function youStats(g: GameState, p: FProfile): Stats {
  const boost = p.doping ? 5 : 0
  const cap = masteryCap(g, 'fight.ring')
  return { s: Math.min(p.striking, cap) + boost, g: Math.min(p.grappling, cap) + boost, c: Math.min(p.cardio, cap) + boost, chin: p.chin, iq: Math.min(p.iq, cap) }
}

function oppStats(o: Opp): Stats {
  return { s: o.s, g: o.g, c: o.c, chin: o.chin, iq: o.iq }
}

interface Exchange {
  pts: number
  dmg: number
  drain: number
  finish: number
  kind: 'KO' | 'TKO' | 'SUB' | null
  selfStam: number
  top: boolean
  counterBonus: number
}

function fatigue(st: number): number {
  return 0.55 + 0.45 * Math.max(0, Math.min(100, st)) / 100
}

function exchange(g: GameState, a: Stats, as: Side, m: Move, b: Stats, bs: Side, o: Move, z: number, cardio: number, fm: number): Exchange {
  const fA = fatigue(as.st)
  const fB = fatigue(bs.st)
  const noise = bell(g, -14, 14)
  const out: Exchange = { pts: 0, dmg: 0, drain: 0, finish: 0, kind: null, selfStam: 7, top: false, counterBonus: 0 }
  const bDefStrike = b.s * 0.5 * fB + b.iq * 0.15 + (o === 'defend' ? 12 : 0) - (o === 'taunt' ? 8 : 0) - (bs.reckless ? 8 : 0)
  // A good chin and fresh legs keep you upright; accumulated damage doesn't.
  const chinF = Math.max(0.35, 1.15 - b.chin / 150) * (0.8 + bs.hp / 200)
  switch (m) {
    case 'strike': {
      const edge = a.s * fA + z * 0.5 + noise - bDefStrike
      out.pts = Math.max(0, edge)
      out.dmg = Math.max(0, edge) * 0.5
      out.finish = Math.max(0, (edge - 5) / 50 + bs.hp / 150) * chinF
      out.kind = 'KO'
      break
    }
    case 'power': {
      const edge = a.s * fA * 1.1 + z * 0.6 + noise * 1.4 - bDefStrike - (o === 'defend' ? 6 : 0)
      out.pts = Math.max(0, edge) * 0.8
      out.dmg = Math.max(0, edge) * 0.65
      out.finish = Math.max(0, edge / 40 + bs.hp / 120) * chinF
      out.kind = 'KO'
      out.selfStam = 10
      if (edge < -5) out.counterBonus = 10
      break
    }
    case 'body': {
      const edge = a.s * fA + noise - (b.s * 0.45 * fB + (o === 'defend' ? 10 : 0))
      out.pts = Math.max(0, edge) * 0.8
      out.dmg = Math.max(0, edge) * 0.35
      out.drain = Math.max(0, edge) * 0.5 + 4
      out.finish = edge > 15 ? (0.02 + bs.hp / 400 + (bs.st < 35 ? 0.06 : 0)) * chinF : 0
      out.kind = 'TKO'
      break
    }
    case 'grapple': {
      const edge = a.g * fA + z + noise - (b.g * 0.6 * fB + (o === 'defend' ? 10 : 0) + (o === 'grapple' ? b.g * 0.1 : 0) - (bs.reckless ? 6 : 0))
      out.pts = Math.max(0, edge) + (edge > 0 ? 6 : 0)
      out.dmg = Math.max(0, edge) * 0.3
      out.drain = edge > 0 ? 6 : 0
      out.finish = Math.max(0, (edge - 15) / 100 + bs.hp / 250) * chinF
      out.kind = 'TKO'
      out.selfStam = 9
      out.top = edge > 0
      break
    }
    case 'sub': {
      const edge = a.g * 1.05 * fA + (as.top ? 10 : 0) + noise - (b.g * 0.7 * fB + (o === 'defend' ? 10 : 0))
      out.pts = Math.max(0, edge) * 0.7
      out.dmg = Math.max(0, edge) * 0.1
      out.finish = edge > 4 ? (edge - 4) / 45 + (bs.st < 40 ? 0.08 : 0) : 0
      out.kind = 'SUB'
      out.selfStam = 11
      if (edge < -8) out.counterBonus = 8
      break
    }
    case 'defend': {
      const edge = ((a.s + a.g) / 2) * 0.4 * fA + noise * 0.5 - b.s * 0.25 * fB
      out.pts = Math.max(0, edge) * 0.5 + 3
      out.dmg = Math.max(0, edge) * 0.15
      out.selfStam = -12
      break
    }
    case 'taunt': {
      out.pts = 0
      out.selfStam = 2
      break
    }
  }
  out.finish = Math.max(0, Math.min(0.55, out.finish * fm))
  out.selfStam = Math.round(out.selfStam * (1.4 - cardio / 120))
  return out
}

const STYLE_MOVES: Record<Style, [Move, number][]> = {
  striker: [['strike', 50], ['power', 10], ['defend', 20], ['grapple', 8], ['sub', 4], ['taunt', 8]],
  wrestler: [['grapple', 50], ['strike', 22], ['defend', 15], ['sub', 13]],
  bjj: [['sub', 35], ['grapple', 35], ['strike', 15], ['defend', 15]],
  brawler: [['strike', 45], ['power', 25], ['taunt', 15], ['defend', 5], ['grapple', 10]],
  balanced: [['strike', 32], ['grapple', 22], ['sub', 13], ['defend', 20], ['power', 8], ['taunt', 5]],
  boxer: [['strike', 50], ['body', 20], ['defend', 20], ['power', 10]],
  counter: [['defend', 40], ['strike', 30], ['power', 15], ['body', 15]],
}

function oppMove(g: GameState, d: Discipline, o: Opp, st: FightState): Move {
  const allowed = new Set(d.moves.map((m) => m.id))
  let list = STYLE_MOVES[o.style].filter(([m]) => allowed.has(m))
  if (!list.length) list = [['strike', 1]]
  // Tired fighters defend more; fighters ahead late coast.
  const tired = st.them.st < 40
  const total = list.reduce((a, [, w]) => a + w, 0)
  let r = rand(g) * (total + (tired ? 30 : 0))
  if (r >= total) return 'defend'
  for (const [m, w] of list) {
    r -= w
    if (r < 0) return m
  }
  return list[0][0]
}

const SUBS = ['rear-naked choke', 'armbar', 'triangle choke', 'guillotine choke', 'kimura', 'heel hook', "d'arce choke", 'arm-triangle choke']
const KO_SHOTS: Record<DiscId, string[]> = {
  mma: ['a left hook', 'a head kick', 'a flying knee', 'a spinning back fist', 'an overhand right', 'a short uppercut'],
  boxing: ['a left hook', 'a straight right', 'an uppercut', 'a body shot that folded them in half', 'a counter right hand'],
  kickboxing: ['a head kick', 'a spinning back kick', 'a knee to the chin', 'a left hook', 'a jumping switch kick'],
  muaythai: ['a spinning elbow', 'a knee in the clinch', 'a head kick', 'a sharp elbow that opened a cut', 'a teep that sent them through the ropes'],
}

function roundLabel(st: FightState, d: Discipline, idx: number): string {
  if (!d.blocks) return `Round ${idx + 1}`
  const total = st.offer.rounds === d.rounds[1] ? d.blocks[1] : st.amateur ? 3 : d.blocks[0]
  const per = Math.ceil(total / st.offer.rounds)
  const from = idx * per + 1
  const to = Math.min(total, from + per - 1)
  return from === to ? `Round ${from}` : `Rounds ${from}-${to}`
}

function moveLine(g: GameState, m: Move, gained: number, d: Discipline): string {
  const good = gained > 8
  switch (m) {
    case 'strike':
      return good ? pick(g, ['You found your range and landed clean combinations.', 'Your jab kept snapping their head back.', 'You beat them to the punch all round.']) : pick(g, ['You threw a lot but they slipped most of it.', 'Your strikes kept hitting gloves and elbows.'])
    case 'power':
      return good ? pick(g, ['You loaded up and something heavy landed.', 'Every power shot made the crowd gasp.']) : pick(g, ['You swung for the fences and mostly hit air.', 'You loaded up and they saw it coming from the parking lot.'])
    case 'body':
      return good ? (d.id === 'kickboxing' ? 'Your leg kicks turned their thigh purple.' : d.id === 'muaythai' ? 'You dragged them into the clinch and drove knees into their ribs.' : 'You dug to the body and heard them wheeze.') : 'They blocked most of your body work.'
    case 'grapple':
      return good ? pick(g, ['You took them down and rained ground-and-pound from the top.', 'You hit a slick takedown and controlled them against the cage.']) : pick(g, ['They stuffed your takedown attempts.', 'You shot in and ate a knee for your trouble.'])
    case 'sub':
      return good ? pick(g, ['You hunted chokes and nearly got one.', 'You locked up an armbar and they barely escaped.']) : pick(g, ['You pulled guard and immediately regretted it.', 'Your submission attempt went nowhere and they ended up on top.'])
    case 'defend':
      return good ? 'You stayed patient, made them miss and countered.' : 'You covered up and caught your breath.'
    case 'taunt':
      return pick(g, ['You stuck your chin out and waved them in. The crowd lost its mind.', 'You did a little dance mid-round. The commentators were apoplectic.', 'You talked trash the whole round. The referee told you to shut up.'])
  }
}

const roundScript = defineScript('sports.fight.round', (g, choice, data) => {
  const st = data as unknown as FightState
  if (!st || !st.offer) return
  const d = discipline(st.disc)
  const p = fighter(g)
  const move = (d.moves.some((m) => m.id === choice) ? choice : 'strike') as Move
  const me = youStats(g, p)
  const op = oppStats(st.offer.opp)
  const theirMove = oppMove(g, d, st.offer.opp, st)
  const mine = exchange(g, me, st.you, move, op, st.them, theirMove, st.z, me.c, d.finish)
  const theirs = exchange(g, op, st.them, theirMove, me, st.you, move, -st.z, op.c, d.finish)
  // A successful takedown smothers the other fighter's strikes (and vice versa).
  const STRIKES: Move[] = ['strike', 'power', 'body']
  if (mine.top && STRIKES.includes(theirMove)) {
    theirs.pts *= 0.5
    theirs.dmg *= 0.5
    theirs.finish *= 0.4
  }
  if (theirs.top && STRIKES.includes(move)) {
    mine.pts *= 0.5
    mine.dmg *= 0.5
    mine.finish *= 0.4
  }
  theirs.pts += mine.counterBonus
  theirs.dmg += mine.counterBonus * 0.5
  mine.pts += theirs.counterBonus
  mine.dmg += theirs.counterBonus * 0.5
  let lines = moveLine(g, move, mine.pts - theirs.pts, d)
  if (move === 'taunt') {
    st.hype = Math.min(100, st.hype + 6)
    p.hype = Math.min(100, p.hype + 3)
    if (chance(g, 0.45)) {
      st.them.reckless = true
      lines += ' It worked: they started swinging wild.'
    }
    if (chance(g, 0.3)) {
      theirs.pts += 10
      theirs.dmg += 10
      theirs.finish = Math.min(0.5, theirs.finish + 0.06)
      lines += ' It also cost you a clean shot to the face.'
    }
  } else st.them.reckless = st.them.reckless && chance(g, 0.5)
  // Apply damage and stamina.
  st.them.hp += mine.dmg
  st.you.hp += theirs.dmg
  st.them.st = Math.max(5, Math.min(100, st.them.st - theirs.selfStam - mine.drain))
  st.you.st = Math.max(5, Math.min(100, st.you.st - mine.selfStam - theirs.drain))
  st.you.top = mine.top && !theirs.top
  st.them.top = theirs.top && !mine.top
  st.margins.push(Math.round(mine.pts - theirs.pts))
  const label = roundLabel(st, d, st.round)
  // Finishes: the bigger edge goes first.
  const order: ['you' | 'them', Exchange][] = mine.pts >= theirs.pts ? [['you', mine], ['them', theirs]] : [['them', theirs], ['you', mine]]
  for (const [who, ex] of order) {
    if (ex.finish > 0 && ex.kind && chance(g, ex.finish)) {
      const method = ex.kind === 'SUB' ? 'SUB' : ex.kind === 'TKO' || (who === 'you' ? st.them.hp : st.you.hp) > 45 ? (chance(g, 0.5) ? 'TKO' : 'KO') : 'KO'
      const detail = method === 'SUB' ? pick(g, SUBS) : pick(g, KO_SHOTS[d.id])
      return endFight(g, st, who === 'you' ? 'win' : 'loss', method, detail, `${label}: ${lines}`)
    }
  }
  st.round += 1
  if (st.round >= st.offer.rounds) return endFight(g, st, 'decision', 'DEC', '', `${label}: ${lines}`)
  const verdict = st.margins[st.margins.length - 1] > 6 ? 'You clearly won that one.' : st.margins[st.margins.length - 1] < -6 ? 'That one went to them.' : 'Close round. Could go either way.'
  const gas = st.you.st < 35 ? ' Your gas tank is running on fumes.' : st.you.hp > 50 ? " You're hurt." : ''
  queueRound(g, st, `${label}: ${lines} ${verdict}${gas}`)
})

function queueRound(g: GameState, st: FightState, intro: string): void {
  const d = discipline(st.disc)
  const label = roundLabel(st, d, st.round)
  const corner = st.round === st.offer.rounds - 1 ? ' Last round. Your corner is screaming.' : ''
  scriptChoice(g, roundScript, label, `${intro}${intro ? '\n\n' : ''}${label} vs ${oppName(st.offer.opp)}.${corner} What's your game plan?`, d.moves.map((m) => ({ id: m.id, label: m.label, emoji: m.emoji })), { emoji: d.emoji, data: st as unknown as Json })
}

function judge(g: GameState, margins: number[], d: Discipline, st: FightState): { cards: [number, number][]; you: number; them: number } {
  const cards: [number, number][] = []
  let you = 0
  let them = 0
  const total = d.blocks ? (st.offer.rounds === d.rounds[1] ? d.blocks[1] : st.amateur ? 3 : d.blocks[0]) : margins.length
  const per = d.blocks ? total / margins.length : 1
  for (let j = 0; j < 3; j++) {
    let a = 0
    let b = 0
    for (const m of margins) {
      for (let k = 0; k < per; k++) {
        const diff = m + bell(g, -8, 8)
        if (Math.abs(diff) < 2 && chance(g, 0.3)) {
          a += 10
          b += 10
        } else if (diff >= 0) {
          a += 10
          b += diff > 38 ? 8 : 9
        } else {
          b += 10
          a += diff < -38 ? 8 : 9
        }
      }
    }
    a = Math.round(a)
    b = Math.round(b)
    cards.push([a, b])
    if (a > b) you += 1
    else if (b > a) them += 1
  }
  return { cards, you, them }
}

// ---------------------------------------------------------------------------
// Results

function rivalFor(p: FProfile, name: string): Rival | undefined {
  return p.rivals.find((r) => r.name === name)
}

function addRival(p: FProfile, o: Opp, disc: DiscId, heat: number): void {
  const r = rivalFor(p, o.name)
  if (r) {
    r.heat = Math.min(100, r.heat + heat)
    r.rating = o.rating
    return
  }
  p.rivals.push({ name: o.name, flag: o.flag, nick: o.nick, disc, rating: o.rating, style: o.style, beatYou: 0, youBeat: 0, heat })
  if (p.rivals.length > 5) p.rivals.sort((a, b) => b.heat - a.heat).splice(5)
}

function endFight(g: GameState, st: FightState, result: 'win' | 'loss' | 'decision', method: 'KO' | 'TKO' | 'SUB' | 'DEC', detail: string, lastRound: string): void {
  const d = discipline(st.disc)
  const p = fighter(g)
  const job = st.amateur ? null : fighterJob(g)
  const o = st.offer.opp
  let outcome: 'win' | 'loss' | 'draw' = result === 'decision' ? 'draw' : result
  let methodText = ''
  if (result === 'decision') {
    const j = judge(g, st.margins, d, st)
    const cards = j.cards.map(([a, b]) => `${a}-${b}`).join(', ')
    if (j.you >= 2) {
      outcome = 'win'
      methodText = `${j.you === 3 ? 'unanimous' : j.them === 1 ? 'split' : 'majority'} decision (${cards})`
    } else if (j.them >= 2) {
      outcome = 'loss'
      methodText = `${j.them === 3 ? 'unanimous' : j.you === 1 ? 'split' : 'majority'} decision (${cards})`
    } else {
      outcome = 'draw'
      methodText = `a draw (${cards})`
    }
  } else methodText = method === 'SUB' ? `submission (${detail})` : `${method} (${detail})`
  const roundTxt = roundLabel(st, d, Math.min(st.round, st.offer.rounds - 1))

  // Records.
  const rec = recOf(p, d.id, st.amateur)
  p.lastFightAge = g.character.age
  count(g, 'fights')
  if (outcome === 'win') {
    rec.w += 1
    if (method === 'SUB') rec.sub += 1
    else if (method === 'KO' || method === 'TKO') rec.ko += 1
    else rec.dec += 1
    if (method === 'KO' || method === 'TKO') count(g, 'knockouts')
  } else if (outcome === 'loss') {
    rec.l += 1
    if (method === 'KO' || method === 'TKO') rec.koLosses += 1
  } else rec.d += 1
  p.iq = clampN(p.iq + randInt(g, 1, 2))

  // Health: damage taken, knockouts, cuts.
  const taken = st.you.hp
  addHeadTrauma(g, Math.min(2.5, taken / 40) + (outcome === 'loss' && method === 'KO' ? 6 : outcome === 'loss' && method === 'TKO' ? 3 : 0), outcome === 'loss' && (method === 'KO' || method === 'TKO'))
  addStat(g, 'health', -Math.round(Math.min(15, taken / 8)))
  if (outcome === 'loss' && method === 'KO') {
    p.chin = clampN(p.chin - randInt(g, 4, 9))
    // Medical suspension: no more fights (amateur or pro) this year.
    g.yearActions['sports.fight.bouts'] = 99
    g.yearActions['sports.fight.amBouts'] = 99
  }
  let injuryText = ''
  if (chance(g, 0.07 + taken / 400)) {
    const inj = pick(g, d.id === 'mma' ? ['Broken Hand', 'Torn ACL', 'Orbital Fracture', 'Broken Nose', 'Dislocated Elbow'] : ['Broken Hand', 'Orbital Fracture', 'Broken Nose', 'Cut Above the Eye', 'Cracked Ribs'])
    injure(g, inj, randInt(g, 10, 25))
    if (job) fj(job).injured = 1
    injuryText = ` You left with a ${inj.toLowerCase()}.`
  }

  // Money.
  let paid = 0
  let bonusText = ''
  if (job) {
    const jd0 = fj(job)
    paid = st.offer.show + (outcome === 'win' ? st.offer.win : 0)
    if (st.missedWeight) {
      const fine = tidy(paid * 0.2)
      paid -= fine
      bonusText += ` You forfeited ${short(fine)} for missing weight.`
    }
    if (jd0.tier === 'major' && d.perfBonus && outcome === 'win' && method !== 'DEC') {
      paid += d.perfBonus
      bonusText += ` Performance of the Night bonus: ${short(d.perfBonus)}.`
    } else if (jd0.tier === 'major' && d.perfBonus && st.you.hp > 40 && st.them.hp > 40 && method === 'DEC') {
      paid += d.perfBonus
      bonusText += ` Fight of the Night bonus: ${short(d.perfBonus)}.`
    }
    const titleFight = st.offer.kind === 'title' || st.offer.kind === 'defense' || st.offer.kind === 'unify'
    if (d.ppv && jd0.tier === 'major' && (titleFight || st.offer.kind === 'rival' || jd0.rank === 0)) {
      const fame = g.character.hidden.fame
      // Hype sells a fight; real fame sells it more.
      let buys = 80_000 + st.hype * 1_500 + fame * fame * 50
      if (o.rival) buys *= 1.4
      if (d.id === 'boxing' && jd0.belts.length >= 3) buys *= 1.3
      const share = jd0.rank === 0 || outcome === 'win' ? d.ppv : d.ppv * 0.3
      const ppv = tidy(Math.min(d.id === 'boxing' ? 40_000_000 : 10_000_000, Math.max(0, buys - 100_000) * share))
      if (ppv > 0) {
        paid += ppv
        bonusText += ` Pay-per-view: ${Math.round(buys / 1000).toLocaleString('en-US')}K buys, your cut ${short(ppv)}.`
      }
    }
    paid = tidy(paid)
    if (paid > 0) {
      earnIncome(g, paid)
      jd0.earned += paid
      p.earnings += paid
    }
  }

  // Rankings, belts, promotion.
  let rankText2 = ''
  if (job) rankText2 = afterResult(g, d, job, p, st, outcome)
  else if (outcome === 'win') addHidden(g, 'athleticism', 1)

  // Rivalries.
  const rv = rivalFor(p, o.name)
  if (outcome === 'loss' && !st.amateur) {
    addRival(p, o, d.id, 30)
    const r = rivalFor(p, o.name)
    if (r) r.beatYou += 1
  } else if (outcome === 'win' && rv) {
    rv.youBeat += 1
    rv.heat = Math.max(0, rv.heat - 35)
    if (rv.heat < 15) rankText2 += ` Your rivalry with ${rv.name} feels settled. For now.`
  }

  // Doping control (pros at the big show get tested more).
  let tested = ''
  if (job && chance(g, fj(job).tier === 'major' ? 0.4 : 0.12)) {
    if (p.doping) {
      const wasWin = outcome === 'win'
      if (wasWin) {
        rec.w -= 1
        rec.nc += 1
      }
      sportsBan(g, 2, 'a failed fight-night drug test')
      p.doping = false
      log(g, 'I failed a post-fight drug test and was suspended for two years.', 'bad')
      leave(g, 'fired')
      say(g, 'Failed Drug Test', `The Clean Combat Agency's post-fight test came back positive.${wasWin ? ' Your win was overturned to a no contest.' : ''} You were suspended for two years and your contract was terminated.`, '\u{1F9EA}', 'bad')
      return
    }
    tested = ' You passed the post-fight drug test.'
  }

  // Fame & hype.
  // Fame: wins on the big stage get you noticed; yearlyFighter keeps it in line with your status.
  if (outcome === 'win' && job && fj(job).tier === 'major') addFame(g, st.offer.main ? 2 : 1)
  else if (outcome === 'win' && job && chance(g, 0.35)) addFame(g, 1)
  p.hype = Math.max(0, Math.min(100, p.hype + (outcome === 'win' ? (method !== 'DEC' ? 10 : 5) : -12)))
  if (outcome === 'win' && !st.amateur) addBuzz(g, st.offer.main ? 8 : 3)
  addStat(g, 'happiness', outcome === 'win' ? 12 : outcome === 'loss' ? -10 : 0)

  // Rare tragedy: a brutal knockout with a battered brain.
  const brain = peek<{ headTrauma: number }>(g, 'sports')?.headTrauma ?? 0
  if (outcome === 'loss' && method === 'KO' && brain >= 60 && st.you.hp > 70 && chance(g, 0.02)) {
    log(g, `I was knocked out by ${o.name} and never woke up.`, 'bad')
    killCharacter(g, 'Brain Injury Sustained in a Fight')
    return
  }

  const recLine = `${st.amateur ? 'Amateur record' : 'Pro record'}: ${fmt(rec)}.`
  const head = outcome === 'win' ? 'Victory!' : outcome === 'loss' ? 'Defeat' : 'Draw'
  const how = outcome === 'win' ? `You beat ${oppName(o)} by ${methodText}` : outcome === 'loss' ? `${oppName(o)} beat you by ${methodText}` : `You and ${oppName(o)} fought to ${methodText}`
  const when = method === 'DEC' ? '' : ` in ${roundTxt.toLowerCase()}`
  const payLine = paid > 0 ? ` Payday: ${short(paid)}.` : ''
  log(g, outcome === 'win' ? `I beat ${o.name} by ${method === 'DEC' ? 'decision' : method === 'SUB' ? 'submission' : method}.` : outcome === 'loss' ? `I lost to ${o.name} by ${method === 'DEC' ? 'decision' : method === 'SUB' ? 'submission' : method}.` : `I fought ${o.name} to a draw.`, outcome === 'win' ? 'good' : outcome === 'loss' ? 'bad' : 'neutral')
  say(g, head, `${lastRound}\n\n${how}${when}.${payLine}${bonusText} ${recLine}${rankText2}${injuryText}${tested}`, outcome === 'win' ? '\u{1F3C6}' : outcome === 'loss' ? '\u{1F915}' : d.emoji, outcome === 'win' ? 'good' : outcome === 'loss' ? 'bad' : 'neutral')

  // Post-fight: the microphone is yours.
  if (job && outcome === 'win' && fj(job).tier === 'major' && fj(job).rank !== 0 && chance(g, 0.6)) {
    scriptChoice(
      g,
      calloutScript,
      'Post-Fight Interview',
      'The commentator shoves a microphone in your face. The arena is waiting.',
      [
        { id: 'champ', label: 'Call out the champion', emoji: '\u{1F451}' },
        { id: 'rival', label: 'Call out a rival', emoji: '\u{1F620}' },
        { id: 'thanks', label: 'Thank your team and your mom', emoji: '\u{1F64F}' },
      ],
      { emoji: '\u{1F3A4}' },
    )
  }
}

function afterResult(g: GameState, d: Discipline, job: Job, p: FProfile, st: FightState, outcome: 'win' | 'loss' | 'draw'): string {
  const j = fj(job)
  const o = st.offer.opp
  const cls = classList(d, g.character.gender)[Math.min(j.cls, classList(d, g.character.gender).length - 1)]
  let text = ''
  if (j.fightsLeft > 0) j.fightsLeft -= 1
  if (outcome === 'win') {
    j.streak = Math.max(1, j.streak + 1)
    j.promoWins += 1
  } else if (outcome === 'loss') j.streak = Math.min(-1, j.streak - 1)
  if (j.tier === 'regional') {
    if (st.offer.kind === 'regionalTitle' && outcome === 'win') {
      j.regionalChamp = true
      p.belts.push(`${regionalName(g, d)} ${cls} champion (${g.year})`)
      honor(g, `Won ${theName(regionalName(g, d))} ${cls} title.`)
      text += ` You're ${theName(regionalName(g, d))} ${cls} champion!`
    } else if (j.regionalChamp && outcome === 'loss' && st.offer.main) {
      j.regionalChamp = false
      text += ' You lost your regional title.'
    }
    if (outcome === 'win' && (j.regionalChamp || (j.promoWins >= 4 && j.streak >= 3)) && chance(g, 0.65)) {
      scriptChoice(
        g,
        callupScript,
        majorName(g, d),
        `${majorName(g, d)} saw your last fight. They're offering you a ${d.id === 'boxing' ? 'promotional deal with world-level fights' : '4-fight contract'}. This is the big leagues.`,
        [
          { id: 'sign', label: 'Sign it', emoji: '\u{270D}\u{FE0F}' },
          { id: 'wait', label: 'Stay regional a bit longer', emoji: '\u{1F914}' },
        ],
        { emoji: d.emoji },
      )
    }
    return text
  }
  const titleOnLine = st.offer.kind === 'title' || st.offer.kind === 'defense' || st.offer.kind === 'unify'
  if (outcome === 'win') {
    if (st.offer.kind === 'title' || (st.offer.kind === 'unify' && j.rank === 0)) {
      const belt = st.offer.belt || beltName(g, d, cls)
      if (!j.belts.includes(belt)) j.belts.push(belt)
      j.rank = 0
      j.defenses = 0
      j.champ = null
      count(g, 'championships')
      addFame(g, 6)
      addBuzz(g, 25)
      p.belts.push(`${belt} (${g.year})`)
      honor(g, `Won ${theName(belt)}.`, `${d.id === 'boxing' ? 'World boxing champion' : `${majorName(g, d)} champion`}`, majorName(g, d), 9)
      text += ` AND NEW ${belt.toUpperCase()}!`
      if (d.id === 'boxing' && j.belts.length >= BOX_BODIES.length) {
        text += ' You are the UNDISPUTED champion of the world.'
        honor(g, `Became undisputed ${cls} champion of the world.`, `Undisputed ${cls} boxing champion`, 'Boxing', 10)
        addFame(g, 5)
      }
    } else if (st.offer.kind === 'defense') {
      j.defenses += 1
      text += ` Successful title defense #${j.defenses}.`
      addFame(g, 1)
    } else if (o.rank !== null && j.rank !== 0) {
      // Beat someone ranked above you and you take their spot; beat someone below and you
      // climb a little (faster on a win streak).
      const from = j.rank ?? 16
      j.rank = o.rank < from ? o.rank : Math.max(1, from - 1 - (j.streak >= 3 ? 1 : 0))
      text += ` You're now ranked #${j.rank} in the ${cls} division.`
    } else if (j.rank !== 0) {
      if (j.rank === null) {
        if (j.promoWins >= 3 && j.streak >= 2) {
          j.rank = 15 - randInt(g, 0, 2)
          text += ` You cracked the rankings at #${j.rank}.`
        }
      } else {
        j.rank = Math.max(1, j.rank - 1 - (j.streak >= 3 ? 1 : 0))
        text += ` You moved up to #${j.rank}.`
      }
    }
  } else if (outcome === 'loss') {
    if (titleOnLine && j.rank === 0) {
      const lost = j.belts.join(' and ')
      j.belts = []
      j.rank = randInt(g, 1, 3)
      j.defenses = 0
      j.champ = { ...o, champ: true, rank: null, belt: lost }
      text += ` You lost the ${lost}.`
      addFame(g, -2)
    } else if (st.offer.kind === 'unify') {
      text += ' You came up short in the unification bout.'
    } else if (j.rank !== null && j.rank !== 0) {
      j.rank = j.rank + randInt(g, 2, 4)
      if (j.rank > 15) {
        j.rank = null
        text += ' You dropped out of the rankings.'
      } else text += ` You slipped to #${j.rank}.`
    }
    if (st.offer.kind === 'title' && j.champ) j.champ = { ...j.champ, w: j.champ.w + 1 }
  }
  if (j.rank !== null && j.rank > 0 && (p.peakRank === null || j.rank < p.peakRank)) p.peakRank = j.rank
  if (j.rank === 0) p.peakRank = 0
  // Three losses in a row and unranked: released.
  if (j.streak <= -3 && (j.rank === null || j.rank > 12)) {
    j.tier = 'regional'
    j.promotion = regionalName(g, d)
    j.rank = null
    j.belts = []
    j.promoWins = 0
    job.company = j.promotion
    log(g, `${majorName(g, d)} released me after three straight losses.`, 'bad')
    text += ` ${majorName(g, d)} released you after three straight losses. Back to ${theName(regionalName(g, d))}.`
  }
  return text
}

const calloutScript = defineScript('sports.fight.callout', (g, choice) => {
  const p = fighter(g)
  const job = fighterJob(g)
  if (!job) return
  const j = fj(job)
  if (choice === 'champ') {
    p.hype = Math.min(100, p.hype + 12)
    addFame(g, 1)
    log(g, 'I called out the champion after my fight.')
    return say(g, 'Callout', `"I'm coming for that belt!" The champion posted a laughing emoji. ${j.rank !== null && j.rank <= 6 ? 'The fans are demanding the fight.' : 'The fans laughed too, honestly.'}`, '\u{1F451}')
  }
  if (choice === 'rival') {
    const r = p.rivals[0]
    p.hype = Math.min(100, p.hype + 8)
    if (r) {
      r.heat = Math.min(100, r.heat + 20)
      return say(g, 'Callout', `You called out ${r.name} and said something about their mother. ${r.name} replied with a video of themselves sharpening a knife. Kidding. Mostly.`, '\u{1F620}')
    }
    return say(g, 'Callout', 'You called out "anyone in the top ten". Nobody volunteered. The crowd booed them, not you.', '\u{1F620}')
  }
  addHidden(g, 'karma', 2)
  say(g, 'Post-Fight Interview', 'You thanked your coaches, your training partners, and your mom. Your mom cried. The commentator cried. You cried.', '\u{1F64F}', 'good')
})

const callupScript = defineScript('sports.fight.callup', (g, choice) => {
  const job = fighterJob(g)
  if (!job || choice !== 'sign') return
  const d = discipline(fj(job).disc)
  const j = fj(job)
  j.tier = 'major'
  j.promotion = majorName(g, d)
  j.rank = null
  j.promoWins = 0
  j.fightsLeft = 4
  j.streak = Math.max(0, j.streak)
  job.company = j.promotion
  job.title = d.id === 'boxing' ? 'Professional Boxer' : d.id === 'mma' ? 'HFC Fighter' : d.id === 'kickboxing' ? 'Valor Kickboxer' : 'Stadium Nak Muay'
  addFame(g, 5)
  addBuzz(g, 10)
  log(g, `I signed with ${j.promotion}.`, 'good')
  honor(g, `Signed with ${j.promotion}.`)
  say(g, 'The Big Leagues', `You signed with ${j.promotion}. Bigger arenas, bigger purses, and opponents who've seen you coming on video.`, d.emoji, 'good')
})

// ---------------------------------------------------------------------------
// Pre-fight: picking an opponent, cutting weight, the press conference

interface PickData {
  disc: DiscId
  amateur: boolean
  offers: Offer[]
}

const CUT_CHOICES = [
  { id: 'smart', label: 'Cut with a nutritionist', emoji: '\u{1F957}' },
  { id: 'sauna', label: 'Old-school sauna cut', emoji: '\u{1F9D6}' },
  { id: 'extreme', label: 'Extreme cut (hot baths, sauna suit)', emoji: '\u{1F525}' },
]

interface PreData {
  disc: DiscId
  amateur: boolean
  offer: Offer
  z: number
  stamina: number
  missed: boolean
}

const pickScript = defineScript('sports.fight.pick', (g, choice, data) => {
  const pd = data as unknown as PickData
  if (!pd || choice === 'cancel') return
  const offer = pd.offers[Number(choice)]
  if (!offer) return
  const d = discipline(pd.disc)
  const p = fighter(g)
  if (!useYearAction(g, pd.amateur ? 'sports.fight.amBouts' : 'sports.fight.bouts', pd.amateur ? 4 : d.maxFights)) return tell(g, 'Fight', 'Your coach says your body needs a break. No more fights this year.', '\u{1F915}')
  const job = fighterJob(g)
  const cls = job ? fj(job).cls : p.natural
  const diff = p.natural - cls
  const base: PreData = { disc: pd.disc, amateur: pd.amateur, offer, z: diff < 0 ? diff * 5 : 0, stamina: 100, missed: false }
  if (diff > 0 && !pd.amateur) {
    scriptChoice(g, cutScript, 'Weight Cut', `You walk around ${diff === 1 ? 'one division' : `${diff} divisions`} above your fighting weight. How do you make weight?`, CUT_CHOICES, { emoji: '\u{2696}\u{FE0F}', data: base as unknown as Json })
    return
  }
  preFight(g, base)
})

const cutScript = defineScript('sports.fight.cut', (g, choice, data) => {
  const pre = data as unknown as PreData
  if (!pre) return
  const p = fighter(g)
  const job = fighterJob(g)
  const diff = Math.max(1, p.natural - (job ? fj(job).cls : p.natural))
  let miss = 0.04 * diff
  let z = 4 * diff
  let text = ''
  if (choice === 'smart') {
    const fee = localFee(g, 1_500)
    if (payFee(g, fee)) text = `Your nutritionist (${short(fee)}) had you eating boiled chicken and ice cubes for a month.`
    else {
      miss = 0.09 * diff
      text = "You couldn't afford a nutritionist, so you did it yourself. Badly."
    }
  } else if (choice === 'sauna') {
    miss = 0.09 * diff
    z += 1
    pre.stamina = 92
    text = 'You sat in the sauna until you saw your ancestors.'
  } else {
    miss = 0.16 * diff
    z += 3
    pre.stamina = 85
    addStat(g, 'health', -4)
    text = 'You sweated out water you did not know you had. Your lips cracked. Your vision got interesting.'
    if (chance(g, 0.03 * diff)) {
      addStat(g, 'health', -10)
      log(g, 'I was hospitalized during an extreme weight cut and the fight was cancelled.', 'bad')
      return say(g, 'Fight Cancelled', `${text} Then you collapsed and woke up in the hospital with an IV in your arm. The fight is off.`, '\u{1F3E5}', 'bad')
    }
  }
  pre.z = z
  if (chance(g, miss)) {
    pre.missed = true
    text += ' You missed weight by a pound and a half. The fight goes ahead, but part of your purse goes to your opponent.'
  } else text += ' You made weight on the dot.'
  log(g, pre.missed ? 'I missed weight.' : 'I made weight.')
  say(g, 'Weigh-Ins', text, '\u{2696}\u{FE0F}', pre.missed ? 'bad' : 'neutral')
  preFight(g, pre)
})

const presserScript = defineScript('sports.fight.presser', (g, choice, data) => {
  const pre = data as unknown as PreData
  if (!pre) return
  const p = fighter(g)
  const o = pre.offer.opp
  let text = ''
  if (choice === 'trash') {
    p.hype = Math.min(100, p.hype + 12)
    addRival(p, o, pre.disc, 15)
    text = pick(g, [`You told ${o.name} their fighting style is "a cry for help". The clip did a million views.`, `You read ${o.name}'s record out loud like a grocery list. The room exploded.`, `You called ${o.name} a "participation trophy with legs". Even their coach laughed.`])
  } else if (choice === 'shove') {
    p.hype = Math.min(100, p.hype + 20)
    addRival(p, o, pre.disc, 25)
    addHidden(g, 'notoriety', 3)
    scandal(g, 'a press-conference brawl')
    const fine = tidy(pre.offer.show * 0.1)
    if (fine > 0) {
      pre.offer.show = Math.max(0, pre.offer.show - fine)
      text = `You flipped the table and shoved ${o.name}. Security pulled you apart. The commission fined you ${short(fine)}. Ticket sales doubled.`
    } else text = `You flipped the table and shoved ${o.name}. Security pulled you apart. Ticket sales doubled.`
  } else if (choice === 'respect') {
    addHidden(g, 'karma', 2)
    p.hype = Math.min(100, p.hype + 2)
    text = `You said you respect ${o.name} and it'll be an honor to share the ${pre.disc === 'mma' ? 'cage' : 'ring'}. The press called it "refreshing". The promoter called it "boring".`
  } else {
    text = 'You wore sunglasses indoors and answered every question with "we\'ll see". Mysterious.'
  }
  say(g, 'Press Conference', text, '\u{1F3A4}')
  startFight(g, pre)
})

function preFight(g: GameState, pre: PreData): void {
  if (pre.offer.main && !pre.amateur) {
    scriptChoice(
      g,
      presserScript,
      'Press Conference',
      `Fight week. ${oppName(pre.offer.opp)} is sitting three feet away, staring at you.`,
      [
        { id: 'trash', label: 'Talk trash', emoji: '\u{1F5E3}\u{FE0F}' },
        { id: 'shove', label: 'Flip the table', emoji: '\u{1F4A2}' },
        { id: 'respect', label: 'Show respect', emoji: '\u{1F91D}' },
        { id: 'silent', label: 'Stay mysterious', emoji: '\u{1F576}\u{FE0F}' },
      ],
      { emoji: '\u{1F3A4}', data: pre as unknown as Json },
    )
    return
  }
  startFight(g, pre)
}

function startFight(g: GameState, pre: PreData): void {
  const d = discipline(pre.disc)
  const p = fighter(g)
  const st: FightState = {
    disc: pre.disc,
    amateur: pre.amateur,
    offer: pre.offer,
    round: 0,
    z: pre.z,
    missedWeight: pre.missed,
    you: { hp: 0, st: pre.stamina, top: false, reckless: false },
    them: { hp: 0, st: 100, top: false, reckless: false },
    margins: [],
    hype: p.hype,
    story: '',
  }
  if (pre.offer.opp.rival) st.hype = Math.min(100, st.hype + 15)
  const venue = pre.amateur ? 'a community center gym with folding chairs' : fighterJob(g) && fj(fighterJob(g)!).tier === 'major' ? (d.id === 'boxing' ? 'a sold-out arena' : `the ${majorName(g, d)} arena`) : 'a packed regional event'
  const stakes = pre.offer.kind === 'title' || pre.offer.kind === 'unify' ? ` The ${pre.offer.belt} is on the line.` : pre.offer.kind === 'defense' ? ' You are defending your title.' : pre.offer.kind === 'regionalTitle' ? ' The regional title is on the line.' : ''
  queueRound(g, st, `Fight night at ${venue}. You vs ${oppLine(pre.offer.opp)}.${stakes}`)
}

function fightAction(id: string, disc: DiscId, amateur: boolean): MenuAction {
  const d = discipline(disc)
  return {
    type: 'action',
    id,
    label: amateur ? 'Amateur Bout' : 'Fight',
    emoji: d.emoji,
    subtitle: amateur ? `Unpaid fights to build a record (${d.name})` : (g) => {
      const used = yearActionsUsed(g, 'sports.fight.bouts')
      return `Pick your next opponent (${Math.max(0, d.maxFights - used)} fight${d.maxFights - used === 1 ? '' : 's'} left this year)`
    },
    disabledReason: (g) => {
      const gate = sportsGate(g, amateur ? 16 : 18)
      if (gate) return gate
      if (g.character.stats.health < 25) return "You're in no shape to fight. See a doctor."
      const job = fighterJob(g)
      if (!amateur && (!job || fjView(job).disc !== disc)) return 'You are not a pro in this sport.'
      if (job && fjView(job).injured > 0) return "You're injured."
      if (amateur && job) return "You're a pro now. Amateur bouts are behind you."
      if (amateur && g.character.age > 40) return 'Amateur commissions stop licensing fighters over 40. Your knees agree with them.'
      const used = yearActionsUsed(g, amateur ? 'sports.fight.amBouts' : 'sports.fight.bouts')
      if (used >= 99) return "You're on medical suspension after that knockout. No more fights this year."
      if (used >= (amateur ? 4 : d.maxFights)) return 'Your coach says your body needs a break. No more fights this year.'
      return null
    },
    run: (g) => {
      const job = amateur ? null : fighterJob(g)
      const used = yearActionsUsed(g, amateur ? 'sports.fight.amBouts' : 'sports.fight.bouts')
      if (used >= (amateur ? 4 : d.maxFights)) return tell(g, 'Fight', used >= 99 ? "You're on medical suspension after that knockout. No more fights this year." : 'Your coach says your body needs a break. No more fights this year.', '\u{1F915}')
      const p = fighter(g)
      if (!p.gym && amateur) log(g, 'I signed up for an amateur bout without a proper gym behind me.')
      const offers = fightCard(g, d, job, amateur)
      const kindLabel: Record<OfferKind, string> = { amateur: '', regular: '', regionalTitle: 'TITLE · ', title: 'TITLE SHOT · ', defense: 'TITLE DEFENSE · ', unify: 'UNIFICATION · ', rival: 'GRUDGE MATCH · ' }
      scriptChoice(
        g,
        pickScript,
        amateur ? 'Amateur Bout' : 'Fight Offers',
        amateur ? `Who do you want to fight? Your level: ${level(g, p, d)}/100.` : `Your matchmaker has offers. Your level: ${level(g, p, d)}/100, ${rankText(job!)}.`,
        [
          ...offers.map((o, i) => ({ id: String(i), label: `${kindLabel[o.kind]}${oppLine(o.opp)}${o.show ? ` · ${short(o.show)}${o.win ? ` + ${short(o.win)} to win` : ''}` : ''}`, emoji: o.main ? '\u{2B50}' : d.emoji })),
          { id: 'cancel', label: 'Not now', emoji: '\u{274C}' },
        ],
        { emoji: d.emoji, data: { disc, amateur, offers } as unknown as Json },
      )
    },
  }
}

// ---------------------------------------------------------------------------
// Training, gyms, weight classes

interface GymOption {
  name: string
  tier: number
  fee: number
}

function gymOptions(g: GameState, d: Discipline): GymOption[] {
  const city = g.character.city
  const p = viewFighter(g)
  const proRec = p?.pro[d.id]
  const elite = d.id === 'boxing' ? 'Iron Fist Boxing Camp' : d.id === 'muaythai' ? 'Siam Tiger Camp' : d.id === 'kickboxing' ? 'Golden Shin Kickboxing' : 'Altitude Fight Lab'
  const opts: GymOption[] = [
    { name: d.id === 'boxing' ? `${city} Boxing Club` : d.id === 'muaythai' ? `${city} Muay Thai` : d.id === 'mma' ? `${city} Strip-Mall MMA` : `${city} Kickboxing Club`, tier: 1, fee: localFee(g, 900) },
    { name: d.id === 'boxing' ? `${city} Boxing Academy` : `${city} Combat Academy`, tier: 2, fee: localFee(g, 3_500) },
  ]
  if (proRec && proRec.w >= 3) opts.push({ name: elite, tier: 3, fee: tidy(22_000) })
  return opts
}

const gymScript = defineScript('sports.fight.gym', (g, choice, data) => {
  if (choice === 'cancel') return
  const opts = data as unknown as GymOption[]
  const o = opts?.[Number(choice)]
  if (!o) return
  const paid = payFee(g, o.fee)
  if (!paid) return tell(g, 'Gym', `The membership at ${o.name} costs ${money(o.fee)} a year. You can't afford it.`, '\u{1F4B8}')
  const p = fighter(g)
  p.gym = o.name
  p.gymTier = o.tier
  p.gymFee = o.fee
  log(g, `I joined ${o.name}.`, 'good')
  say(g, 'New Gym', `You joined ${o.name} (${short(o.fee)} a year).${payerNote(paid)} ${o.tier === 3 ? 'Half the champions in the world train here. The other half are scared of it.' : o.tier === 2 ? 'Real coaches, real sparring partners, real mats.' : 'The mats smell like feet, but the coach used to fight.'}`, '\u{1F3CB}\u{FE0F}', 'good')
})

const TRAIN = [
  { id: 'striking', label: 'Striking', emoji: '\u{1F44A}' },
  { id: 'grappling', label: 'Grappling', emoji: '\u{1F93C}' },
  { id: 'cardio', label: 'Cardio', emoji: '\u{1F3C3}' },
  { id: 'sparring', label: 'Hard sparring', emoji: '\u{1F94A}' },
]

const trainScript = defineScript('sports.fight.train', (g, choice, data) => {
  if (choice === 'cancel') return
  const disc = String((data as { disc?: string } | undefined)?.disc ?? 'mma')
  const d = discipline(disc)
  if (!TRAIN.some((t) => t.id === choice)) return
  if (choice === 'grappling' && d.weights.g === 0) return
  if (!useYearAction(g, `sports.fight.train.${choice}`, 1)) return tell(g, 'Training', 'You already did that this year. Your coach wants you alive for fight night.', '\u{1F971}')
  const p = fighter(g)
  const mult = [0.7, 1, 1.2, 1.45][p.gymTier] ?? 0.7
  const age = g.character.age
  const ageMult = age < 24 ? 1.15 : age > 33 ? 0.6 : 1
  let text = ''
  if (choice === 'sparring') {
    p.iq = clampN(p.iq + trainGain(g, p.iq, 2, 5, mult))
    p.striking = clampN(p.striking + trainGain(g, p.striking, 1, 3, mult * ageMult))
    addHeadTrauma(g, 1)
    if (chance(g, 0.08)) {
      injure(g, 'Concussion', 12)
      addHeadTrauma(g, 3, true)
      text = ' Your training partner caught you with a knee. You saw stars. A lot of them.'
    }
    text = `You sparred hard rounds and learned some lessons the painful way. Fight IQ: ${p.iq}%.${text}`
  } else {
    const key = choice as 'striking' | 'grappling' | 'cardio'
    p[key] = clampN(p[key] + trainGain(g, p[key], 3, 7, mult * ageMult * talentMult(g, 'Athletics', 1.5)))
    text = `${pick(g, choice === 'cardio' ? ['Hill sprints, assault bike, more hill sprints.', 'You ran until your legs filed a formal complaint.'] : choice === 'grappling' ? ['Hours of rolling. You tapped thirty times and learned thirty things.', 'Takedown drills until the mat burns had mat burns.'] : ['Pad work until your coach’s arms gave out.', 'Bag work, mitt work, and one very confused heavy bag.'])} ${TRAIN.find((t) => t.id === choice)?.label}: ${p[key]}%.`
  }
  if (!p.trained.includes(choice)) p.trained.push(choice)
  addStat(g, 'health', 1)
  addHidden(g, 'athleticism', 1)
  log(g, `I trained ${choice === 'sparring' ? 'sparring' : choice} at ${p.gym || 'home'}.`)
  say(g, 'Training Camp', text, '\u{1F4AA}', 'good')
})

function trainAction(id: string, disc: DiscId, minAge: number): MenuAction {
  const d = discipline(disc)
  return {
    type: 'action',
    id,
    label: 'Train',
    emoji: '\u{1F4AA}',
    subtitle: (g) => {
      const p = viewFighter(g)
      return p ? `Striking ${p.striking} · Grappling ${p.grappling} · Cardio ${p.cardio}${p.gym ? ` · ${p.gym}` : ' · no gym'}` : 'Striking, grappling, cardio, sparring'
    },
    disabledReason: (g) => sportsGate(g, minAge),
    run: (g) => {
      const p = fighter(g)
      scriptChoice(
        g,
        trainScript,
        'Training',
        `${p.gym ? `At ${p.gym}.` : 'No gym, so you\'re training from videos in your garage (slower gains).'} What do you work on?`,
        [...TRAIN.filter((t) => t.id !== 'grappling' || d.weights.g > 0).map((t) => ({ id: t.id, label: `${t.label}${yearActionsUsed(g, `sports.fight.train.${t.id}`) ? ' · done' : ''}`, emoji: t.emoji })), { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' }],
        { emoji: '\u{1F4AA}', data: { disc } },
      )
    },
  }
}

function gymAction(id: string, disc: DiscId): MenuAction {
  const d = discipline(disc)
  return {
    type: 'action',
    id,
    label: 'Join a Gym',
    emoji: '\u{1F3CB}\u{FE0F}',
    subtitle: (g) => viewFighter(g)?.gym || 'Coaches and training partners make you better faster',
    disabledReason: (g) => blocked(g, 14),
    run: (g) => {
      const opts = gymOptions(g, d)
      scriptChoice(g, gymScript, 'Choose a Gym', 'Membership is billed yearly.', [...opts.map((o, i) => ({ id: String(i), label: `${o.name} · ${short(o.fee)}/yr`, emoji: o.tier === 3 ? '\u{1F451}' : '\u{1F3CB}\u{FE0F}' })), { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' }], { emoji: '\u{1F3CB}\u{FE0F}', data: opts as unknown as Json })
    },
  }
}

const classScript = defineScript('sports.fight.class', (g, choice) => {
  const job = fighterJob(g)
  if (!job || choice === 'cancel') return
  const j = fj(job)
  const d = discipline(j.disc)
  const list = classList(d, g.character.gender)
  const idx = Number(choice)
  if (!Number.isInteger(idx) || idx < 0 || idx >= list.length || idx === j.cls) return
  const wasChamp = j.rank === 0
  j.cls = idx
  j.rank = j.tier === 'major' ? (wasChamp ? randInt(g, 3, 6) : null) : null
  j.belts = []
  j.champ = null
  j.regionalChamp = false
  j.defenses = 0
  log(g, `I moved to ${list[idx].toLowerCase()}.`)
  say(g, 'New Division', `You moved to ${list[idx]}.${wasChamp ? ' You vacated your title to chase a second belt.' : ''} ${idx < fighter(g).natural ? 'Get used to the sauna.' : idx > fighter(g).natural ? "You'll be the smaller fighter in there." : "It's your natural weight."}`, d.emoji)
})

const dopeAction: MenuAction = {
  type: 'action',
  id: 'sports.fight.dope',
  label: 'Performance Enhancers',
  emoji: '\u{1F489}',
  subtitle: 'Faster recovery, harder punches, failed tests',
  visible: (g) => !!fighterJob(g) && !viewFighter(g)?.doping,
  disabledReason: (g) => sportsGate(g, 0),
  confirm: () => 'The Clean Combat Agency tests constantly. A positive test means a two-year suspension. Do it anyway?',
  run: (g) => {
    const p = fighter(g)
    p.doping = true
    addHidden(g, 'karma', -5)
    addStat(g, 'health', -3)
    log(g, 'I started using performance enhancers.', 'bad')
    say(g, 'Performance Enhancers', 'A guy in your gym parking lot sold you something he called "horse vitamins". You recover overnight now. Your skin is a new color.', '\u{1F489}', 'bad')
  },
}

const rehabAction: MenuAction = {
  type: 'action',
  id: 'sports.fight.rehab',
  label: 'Rehab',
  emoji: '\u{1FA7A}',
  subtitle: 'Heal up before your next fight',
  visible: (g) => {
    const j = fighterJob(g)
    return !!j && fjView(j).injured > 0
  },
  disabledReason: (g) => sportsGate(g, 0),
  run: (g) => {
    const job = fighterJob(g)
    if (!job) return
    if (!useYearAction(g, 'sports.fight.rehab', 1)) return tell(g, 'Rehab', "You've done all the rehab you can this year.", '\u{1FA7A}')
    if (chance(g, 0.55)) {
      fj(job).injured = 0
      for (const n of ['Broken Hand', 'Torn ACL', 'Orbital Fracture', 'Broken Nose', 'Dislocated Elbow', 'Cut Above the Eye', 'Cracked Ribs']) healInjury(g, n)
      return say(g, 'Rehab', 'You healed up faster than the doctors expected. Cleared to fight.', '\u{1FA7A}', 'good')
    }
    say(g, 'Rehab', 'Your doctor says you need more time. No fighting until next year.', '\u{1FA7A}', 'bad')
  },
}

const calloutAction: MenuAction = {
  type: 'action',
  id: 'sports.fight.socialCallout',
  label: 'Call Someone Out',
  emoji: '\u{1F4E3}',
  subtitle: (g) => (common(g, 'socialMedia') && common(g, 'smartphone') ? 'Talk trash online to build hype (once a year)' : 'Talk trash to the press to build hype (once a year)'),
  disabledReason: (g) => sportsGate(g, 0),
  run: (g) => {
    const online = common(g, 'socialMedia') && common(g, 'smartphone')
    if (!useYearAction(g, 'sports.fight.socialCallout', 1)) return tell(g, 'Call Out', online ? 'Your manager took your phone away for the rest of the year.' : 'Your manager told the press you had no comment for the rest of the year.', '\u{1F4F5}')
    scriptChoice(
      g,
      socialCalloutScript,
      'Call Someone Out',
      online ? 'You open your phone. Who are you going after?' : 'A reporter holds a microphone under your chin. Who are you going after?',
      [
        { id: 'champ', label: 'The champion', emoji: '\u{1F451}' },
        { id: 'rival', label: 'Your biggest rival', emoji: '\u{1F620}' },
        { id: 'boss', label: "The promotion's president", emoji: '\u{1F454}' },
      ],
      { emoji: '\u{1F4E3}' },
    )
  },
}

const socialCalloutScript = defineScript('sports.fight.social', (g, choice) => {
  const online = common(g, 'socialMedia') && common(g, 'smartphone')
  const p = fighter(g)
  const job = fighterJob(g)
  if (!job) return
  if (choice === 'boss') {
    if (chance(g, 0.25)) {
      const j = fj(job)
      j.fightsLeft = 0
      p.hype = Math.max(0, p.hype - 10)
      return say(g, 'Bad Idea', "You called the promotion's president a \"cheap bald penguin\". He called your manager. Your next fight is on a card that starts at 2 p.m. on a Tuesday.", '\u{1F454}', 'bad')
    }
    p.hype = Math.min(100, p.hype + 15)
    addFame(g, 2)
    return say(g, online ? 'Viral' : 'Headlines', 'You roasted the promotion’s president for underpaying fighters. Fans loved it. He pretended not to notice, then gave you a main event.', '\u{1F4E3}', 'good')
  }
  p.hype = Math.min(100, p.hype + 10)
  addFame(g, 1)
  if (choice === 'rival' && p.rivals[0]) {
    p.rivals[0].heat = Math.min(100, p.rivals[0].heat + 20)
    return say(g, 'Call Out', online ? `You posted an edited photo of ${p.rivals[0].name} as a crying baby. It has two million likes. They want to fight you yesterday.` : `You told a reporter that ${p.rivals[0].name} fights like a crying baby. The quote ran on every sports page. They want to fight you yesterday.`, '\u{1F4E3}')
  }
  say(g, 'Call Out', `You challenged the champion ${online ? 'on every platform' : 'in every newspaper in town'}. ${fj(job).rank !== null && fj(job).rank! <= 5 ? 'The promotion is listening.' : 'People asked who you were. Rude, but fair.'}`, '\u{1F4E3}')
})

// ---------------------------------------------------------------------------
// Turning pro, retiring, comebacks

const proScript = defineScript('sports.fight.turnPro', (g, choice, data) => {
  if (choice === 'cancel') return
  const disc = String((data as { disc?: string } | undefined)?.disc ?? 'mma') as DiscId
  const d = discipline(disc)
  const p = fighter(g)
  const list = classList(d, g.character.gender)
  const idx = Math.max(0, Math.min(list.length - 1, Number(choice)))
  const promotion = regionalName(g, d)
  const { quit } = hire(g, {
    defId: 'sports.fighter',
    title: `Professional ${d.fighter}`,
    company: promotion,
    salary: 0,
    data: { disc: d.id, tier: 'regional', promotion, cls: idx, rank: null, regionalChamp: false, belts: [], defenses: 0, champ: null, fightsLeft: 0, streak: 0, promoWins: 0, injured: 0, earned: 0 },
  })
  if (p.retiredAge !== null) log(g, `I came out of retirement to fight again.`, 'event')
  p.retiredAge = null
  if (!(p.pro[d.id]?.w || p.pro[d.id]?.l)) p.startAge = g.character.age
  addStat(g, 'happiness', 8)
  log(g, `I turned pro as a ${d.fighter.toLowerCase()} at ${list[idx].toLowerCase()}.`, 'good')
  say(g, 'Turned Pro', `You signed with ${promotion} as a ${list[idx].toLowerCase()}. ${idx < p.natural ? `You'll be cutting weight (you walk around at ${list[Math.min(p.natural, list.length - 1)].toLowerCase()}).` : idx > p.natural ? "You'll be giving up size." : "It's your natural weight."}${quitNote(quit)}`, d.emoji, 'good')
})

export function turnProReason(g: GameState, disc: DiscId): string | null {
  if (disc === 'mma' && g.year < 1993) return 'This combat sport is not organized professionally yet.'
  const gate = sportsGate(g, 18)
  if (gate) return gate
  const job = fighterJob(g)
  if (job && fjView(job).disc === disc) return `You're already a pro ${discipline(disc).fighter.toLowerCase()}.`
  const p = viewFighter(g)
  const am = p?.amateur[disc]
  const pro = p?.pro[disc]
  // Pros are retired by force at 48 (see yearlyFighter), so nobody gets licensed that late.
  if (g.character.age >= 48) return 'No athletic commission will license you at your age. Your mom is relieved.'
  if (g.character.age > 45 && !pro) return 'No commission will license a first-time pro fighter over 45. Your mom is relieved.'
  if (!pro && (!am || am.w + am.l + am.d < 3) && g.character.hidden.athleticism < 75) return 'Promoters want to see at least 3 amateur fights first (or freakish athleticism).'
  return null
}

function turnProAction(id: string, disc: DiscId): MenuAction {
  const d = discipline(disc)
  return {
    type: 'action',
    id,
    label: 'Turn Pro',
    emoji: '\u{1F31F}',
    subtitle: (g) => {
      const p = viewFighter(g)
      return p?.pro[disc] && p.retiredAge !== null ? 'Come out of retirement' : `Sign with ${regionalName(g, d)}`
    },
    disabledReason: (g) => turnProReason(g, disc),
    confirm: (g) => (g.character.job ? `Fighting full-time means quitting your job as ${g.character.job.title}. Continue?` : null),
    run: (g) => {
      const p = fighter(g)
      const list = classList(d, g.character.gender)
      const nat = Math.min(p.natural, list.length - 1)
      scriptChoice(
        g,
        proScript,
        'Weight Class',
        `You walk around at ${list[nat].toLowerCase()} size. Fighting lower means cutting weight (bigger on fight night, risky weigh-ins); fighting higher means giving up size.`,
        [...list.map((c, i) => ({ id: String(i), label: `${c}${i === nat ? ' (natural)' : i < nat ? ' (cut)' : ' (move up)'}`, emoji: '\u{2696}\u{FE0F}' })).filter((_, i) => Math.abs(i - nat) <= 2), { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' }],
        { emoji: d.emoji, data: { disc } },
      )
    },
  }
}

function retireFighter(g: GameState, forced: boolean): void {
  const job = fighterJob(g)
  if (!job) return
  const j = fj(job)
  const d = discipline(j.disc)
  const p = fighter(g)
  const rec = recOf(p, d.id, false)
  p.retiredAge = g.character.age
  // Held a world title at some point (peakRank 0 = champion).
  const champ = p.peakRank === 0
  const legacy = Math.min(100, rec.w * 2 + (champ ? 35 : 0) + p.belts.length * 6 + (p.peakRank !== null ? Math.max(0, 20 - p.peakRank) : 0))
  recordCareer(g, { sport: d.name, kind: 'combat', from: p.startAge, best: champ ? 'world champion' : p.peakRank ? `ranked #${p.peakRank}` : `${fmt(rec)} record`, legacy })
  leave(g, 'retired')
  log(g, `I retired from ${d.name.toLowerCase()} with a ${fmt(rec)} record.`, 'event')
  say(g, 'Retired', `${forced ? 'Your body made the call. ' : ''}You hung up your gloves with a pro record of ${fmt(rec)} (${rec.ko} KO${rec.ko === 1 ? '' : 's'}, ${rec.sub} submission${rec.sub === 1 ? '' : 's'}).${p.belts.length ? ` Titles: ${p.belts.slice(-3).join('; ')}.` : ''} Career earnings: ${short(p.earnings)}.`, '\u{1F3C5}', 'good')
}

function recordMenu(id: string): MenuGroup {
  return {
    type: 'menu',
    id,
    label: 'Record & Rankings',
    emoji: '\u{1F4CB}',
    subtitle: (g) => {
      const job = fighterJob(g)
      const p = viewFighter(g)
      if (!p) return 'No fights yet'
      const disc = job ? fjView(job).disc : 'mma'
      const r = p.pro[disc] ?? p.amateur[disc]
      return r ? `${fmt(r)}${job ? ` · ${rankText(job)}` : ''}` : 'No fights yet'
    },
    children: (g): MenuNode[] => {
      const p = viewFighter(g)
      if (!p) return [{ type: 'info', id: `${id}.none`, text: 'No fights yet.', emoji: '\u{1F94A}' }]
      const nodes: MenuNode[] = []
      for (const d of DISCIPLINES) {
        const am = p.amateur[d.id]
        const pr = p.pro[d.id]
        if (am) nodes.push({ type: 'info', id: `${id}.am.${d.id}`, emoji: d.emoji, text: `${d.name} amateur: ${fmt(am)}` })
        if (pr) nodes.push({ type: 'info', id: `${id}.pro.${d.id}`, emoji: d.emoji, text: `${d.name} pro: ${fmt(pr)} · ${pr.ko} KO/TKO · ${pr.sub} sub · ${pr.dec} dec · lost ${pr.koLosses} by KO` })
      }
      nodes.push({ type: 'info', id: `${id}.attrs`, emoji: '\u{1F4AA}', text: `Striking ${p.striking} · Grappling ${p.grappling} · Cardio ${p.cardio} · Chin ${p.chin} · Fight IQ ${p.iq}` })
      nodes.push({ type: 'info', id: `${id}.hype`, emoji: '\u{1F525}', text: `Hype ${p.hype}% · Career earnings ${short(p.earnings)}${p.peakRank !== null ? ` · peak ${p.peakRank === 0 ? 'champion' : `#${p.peakRank}`}` : ''}` })
      const job = fighterJob(g)
      if (job) {
        const j = fjView(job)
        const d = discipline(j.disc)
        const cls = classList(d, g.character.gender)[Math.min(j.cls, classList(d, g.character.gender).length - 1)]
        nodes.push({ type: 'info', id: `${id}.div`, emoji: '\u{1F3C6}', text: `${j.promotion} · ${cls} · ${rankText(job)}${j.belts.length ? ` · holds ${j.belts.join(', ')}` : ''}${j.champ && j.rank !== 0 ? ` · champion: ${j.champ.name}` : ''}` })
      }
      p.belts.slice(-6).forEach((b, i) => nodes.push({ type: 'info', id: `${id}.belt${i}`, emoji: '\u{1F947}', text: b }))
      p.rivals.slice(0, 5).forEach((r, i) => nodes.push({ type: 'info', id: `${id}.rv${i}`, emoji: '\u{1F620}', text: `Rival: ${r.flag} ${r.name}${r.nick ? ` "${r.nick}"` : ''} · you ${r.youBeat}-${r.beatYou} · heat ${r.heat}%` }))
      return nodes
    },
  }
}

export function fighterJobNodes(g: GameState): MenuNode[] {
  const job = fighterJob(g)
  if (!job) return []
  const j = fjView(job)
  const d = discipline(j.disc)
  const p = viewFighter(g)
  const list = classList(d, g.character.gender)
  const cls = list[Math.min(j.cls, list.length - 1)]
  const rec = p?.pro[d.id]
  return [
    { type: 'info', id: 'sports.fight.status', emoji: d.emoji, text: `${job.title} · ${j.promotion} · ${cls} · ${rankText(job)} · ${rec ? fmt(rec) : '0-0'}${j.injured > 0 ? ' · INJURED' : ''}` },
    fightAction('sports.fight.go', d.id, false),
    trainAction('sports.fight.trainPro', d.id, 0),
    gymAction('sports.fight.gymPro', d.id),
    calloutAction,
    {
      type: 'action',
      id: 'sports.fight.changeClass',
      label: 'Change Weight Class',
      emoji: '\u{2696}\u{FE0F}',
      subtitle: cls,
      disabledReason: (gg) => sportsGate(gg, 0),
      run: (gg) => {
        const nat = Math.min(fighter(gg).natural, list.length - 1)
        scriptChoice(gg, classScript, 'Weight Class', `You walk around at ${list[nat].toLowerCase()}. Changing divisions resets your ranking${j.rank === 0 ? ' and vacates your title' : ''}.`, [...list.map((c, i) => ({ id: String(i), label: `${c}${i === nat ? ' (natural)' : ''}${i === j.cls ? ' · current' : ''}`, emoji: '\u{2696}\u{FE0F}' })).filter((_, i) => Math.abs(i - nat) <= 2), { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' }], { emoji: '\u{2696}\u{FE0F}' })
      },
    },
    rehabAction,
    recordMenu('sports.fight.record'),
    dopeAction,
    {
      type: 'action',
      id: 'sports.fight.retire',
      label: 'Retire',
      emoji: '\u{1F3D6}\u{FE0F}',
      subtitle: 'Hang up the gloves',
      confirm: () => 'Retire from fighting?',
      run: (gg) => retireFighter(gg, false),
    },
  ]
}

/** Sports › Combat Sports › <discipline> */
export function disciplineMenu(disc: DiscId): MenuGroup {
  const d = discipline(disc)
  return {
    type: 'menu',
    id: `sports.${disc}`,
    visible: (g) => disc !== 'mma' || g.year >= 1993,
    label: d.name,
    emoji: d.emoji,
    subtitle: (g) => {
      const job = fighterJob(g)
      if (job && fjView(job).disc === disc) return `Pro · ${rankText(job)}`
      const p = viewFighter(g)
      const r = p?.pro[disc] ?? p?.amateur[disc]
      if (r) return `${p?.pro[disc] ? 'Pro' : 'Amateur'} record ${fmt(r)}`
      return popularTag(g, d.locale) || (disc === 'mma' ? `Amateur → regional → the ${d.majorShort}` : disc === 'boxing' ? 'Four belts. One undisputed champion.' : disc === 'muaythai' ? 'The art of eight limbs' : majorName(g, d))
    },
    header: (g) => {
      const p = viewFighter(g)
      const lvl = p ? ` Your level: ${level(g, p, d)}/100.` : ''
      const where = disc === 'muaythai' && g.character.countryId !== 'th' ? ' The best stadiums are in Thailand; the World Series tours everywhere.' : ''
      return `${d.id === 'mma' ? `Join a gym, fight amateur, sign with ${regionalName(g, d)}, then get called up to the ${d.major} (the Hexagon).` : `Build an amateur record, turn pro on ${theName(regionalName(g, d))}, then fight for ${d.id === 'boxing' ? 'the GBF, WPA, IPC and UBO belts' : `${majorName(g, d)} gold`}.`} Amateur bouts from 16, pro at 18.${where}${lvl}`
    },
    children: (g): MenuNode[] => {
      const job = fighterJob(g)
      if (job && fjView(job).disc === disc) return [{ type: 'info', id: `sports.${disc}.pro`, emoji: d.emoji, text: "You're a pro fighter. Manage your career from Occupation › My Work." }, recordMenu(`sports.${disc}.record`)]
      const nodes: MenuNode[] = [gymAction(`sports.${disc}.gym`, disc), trainAction(`sports.${disc}.train`, disc, 14), fightAction(`sports.${disc}.amateur`, disc, true), turnProAction(`sports.${disc}.turnPro`, disc)]
      if (viewFighter(g)) nodes.push(recordMenu(`sports.${disc}.record`))
      return nodes
    },
  }
}

// ---------------------------------------------------------------------------
// Yearly

const retireAskScript = defineScript('sports.fight.retireAsk', (g, choice) => {
  if (choice === 'retire') retireFighter(g, false)
  else log(g, 'I told everyone I have "a few more fights left in me".')
})

const renewScript = defineScript('sports.fight.renew', (g, choice) => {
  const job = fighterJob(g)
  if (!job) return
  const j = fj(job)
  if (choice === 'sign') {
    j.fightsLeft = 4
    log(g, `I signed a new contract with ${j.promotion}.`, 'good')
    return
  }
  if (choice === 'retire') return retireFighter(g, false)
  // Free agency: a bluff about a rival promotion's offer. Stars get paid; nobodies get called out.
  j.fightsLeft = 4
  const odds = j.rank === 0 ? 0.85 : j.rank !== null && j.rank <= 5 ? 0.7 : j.rank !== null ? 0.55 : 0.35
  if (!chance(g, odds)) {
    const p = fighter(g)
    p.hype = Math.max(0, p.hype - 8)
    log(g, `${j.promotion} called my free-agency bluff, so I re-signed for the same money.`, 'bad')
    return say(g, 'Bluff Called', `Your manager leaked a "huge offer" from a rival promotion. ${j.promotion} told you to take it. There was no offer. You re-signed for the same money, and the president now introduces you as "the one with the imaginary suitor".`, '\u{1F921}', 'bad')
  }
  j.promoWins += 2
  const bonus = tidy(discipline(j.disc).purse.major * 3 * Math.max(1, 16 - (j.rank ?? 15)) / 4)
  earnIncome(g, bonus)
  log(g, `I used free agency to squeeze a ${short(bonus)} signing bonus out of ${j.promotion}.`, 'good')
  say(g, 'Free Agency', `Your manager leaked a fake offer from a rival promotion. ${j.promotion} panicked and paid you a ${short(bonus)} signing bonus to stay.`, '\u{1F4B0}', 'good')
})

export function yearlyFighter(g: GameState): void {
  const c = g.character
  // Menus only read a pro's job record (fjView); a damaged one is repaired here, once a year.
  const pro = fighterJob(g)
  if (pro) fj(pro)
  const prof0 = viewFighter(g)
  if (!prof0 || !c.alive || c.prison) return
  const p = fighter(g)
  // Gym fees.
  if (p.gym && p.gymFee > 0) {
    if (!payFee(g, p.gymFee)) {
      log(g, `I couldn't pay my membership at ${p.gym}, so they kicked me out.`, 'bad')
      p.gym = ''
      p.gymTier = 0
      p.gymFee = 0
    }
  }
  // Bodies: young fighters grow, old ones fade; skills you skip slip.
  const age = c.age
  for (const k of ['striking', 'grappling', 'cardio'] as const) {
    let delta = age < 25 ? randInt(g, 0, 2) : 0
    if (age > 32) delta -= randInt(g, 1, 2) + Math.floor((age - 32) / 4)
    else if (!p.trained.includes(k) && p.lastFightAge >= age - 2) delta -= randInt(g, 0, 1)
    p[k] = clampN(p[k] + delta)
  }
  if (age > 33) p.chin = clampN(p.chin - randInt(g, 0, 2))
  p.trained = []
  p.doping = false
  p.hype = Math.max(0, Math.round(p.hype * 0.7))
  const job = fighterJob(g)
  if (!job) return
  syncTenure(g, job)
  const j = fj(job)
  const d = discipline(j.disc)
  if (j.injured > 0) j.injured -= 1
  // Fame follows status: champions are household names, regional fighters are local heroes.
  const star = d.id === 'boxing' ? 1 : d.id === 'mma' ? 0.95 : d.id === 'kickboxing' ? 0.6 : 0.5
  const status = j.tier === 'regional' ? (j.regionalChamp ? 14 : 8) : j.rank === 0 ? (j.belts.length >= 4 ? 92 : 78) : j.rank !== null && j.rank <= 5 ? 55 : j.rank !== null ? 40 : 25
  fameToward(g, status * star, 6)
  job.salary = tidy(j.earned)
  if (j.earned > 0) log(g, `I made ${short(j.earned)} fighting this year.`, 'good')
  j.earned = 0
  // Inactivity.
  if (p.lastFightAge < age - 1) {
    if (j.rank === 0 && p.lastFightAge < age - 2) {
      log(g, `I was stripped of my title for inactivity.`, 'bad')
      say(g, 'Stripped', `You haven't defended your ${j.belts.join(' and ')} in two years. ${j.promotion} stripped you of the title.`, '\u{1F6AB}', 'bad')
      j.belts = []
      j.rank = randInt(g, 2, 5)
    } else if (j.rank !== null && j.rank > 0) {
      j.rank = j.rank + 2 > 15 ? null : j.rank + 2
    }
    if (j.tier === 'major' && p.lastFightAge < age - 2) {
      j.tier = 'regional'
      j.promotion = regionalName(g, d)
      job.company = j.promotion
      j.rank = null
      log(g, `${majorName(g, d)} released me for inactivity.`, 'bad')
    }
  } else if (j.rank !== null && j.rank > 1 && chance(g, 0.3)) j.rank += chance(g, 0.5) ? 1 : -1
  if (age >= 48 || (age >= 40 && level(g, p, d) < 35)) {
    retireFighter(g, true)
    return
  }
  // Contract.
  if (j.tier === 'major' && j.fightsLeft <= 0) {
    scriptChoice(
      g,
      renewScript,
      'Contract Up',
      `Your ${j.promotion} contract is finished. ${j.rank === 0 ? 'Champions get paid. Your manager smells money.' : 'They want to keep you.'}`,
      [
        { id: 'sign', label: 'Re-sign for 4 more fights', emoji: '\u{270D}\u{FE0F}' },
        { id: 'free', label: 'Test free agency', emoji: '\u{1F4B0}' },
        { id: 'retire', label: 'Retire', emoji: '\u{1F3D6}\u{FE0F}' },
      ],
      { emoji: d.emoji },
    )
    return
  }
  if (age >= 37 && chance(g, 0.5)) {
    const rec = p.pro[d.id]
    scriptChoice(
      g,
      retireAskScript,
      'One More Fight?',
      `You're ${age}${rec ? ` with a ${fmt(rec)} record` : ''}. Your knees crack when you stand up and you forgot your PIN twice this month. Retire?`,
      [
        { id: 'retire', label: 'Retire', emoji: '\u{1F3D6}\u{FE0F}' },
        { id: 'keep', label: 'Keep fighting', emoji: '\u{1F94A}' },
      ],
      { emoji: d.emoji },
    )
  }
}

/** For the Olympics: amateur boxers who never turned pro. */
export function amateurBoxer(g: GameState): { rating: number; record: string } | null {
  const p = viewFighter(g)
  if (!p || fighterJob(g)) return null
  const am = p.amateur.boxing
  if (!am || am.w < 5 || p.pro.boxing) return null
  return { rating: level(g, p, discipline('boxing')), record: fmt(am) }
}

/** Youth programs seed fighters' skills (boxing clubs, kids' MMA). */
export function youthFightTrain(g: GameState, boost: number): void {
  const p = fighter(g)
  p.striking = clampN(p.striking + trainGain(g, p.striking, 1, 4, boost))
  p.cardio = clampN(p.cardio + trainGain(g, p.cardio, 1, 3, boost))
}

/** A youth-club bout (boxing club, kids' MMA, Muay Thai camp) on the amateur record. */
export function recordYouthBout(g: GameState, disc: DiscId, won: boolean): string {
  const p = fighter(g)
  const rec = recOf(p, disc, true)
  if (won) rec.w += 1
  else rec.l += 1
  p.lastFightAge = g.character.age
  return fmt(rec)
}
export const fightInternals = { exchange, judge, makeOpp, buildOffers }
