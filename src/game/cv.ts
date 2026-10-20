// The CV (résumé): what you've done, how good it looks, and who wants to read it.
//
// A CV is a list of entries. Some are explicit and stored on the character (`Character.cv`:
// projects, volunteering, courses, competitions, languages, internships, leadership roles,
// embellished lines, and school activities archived when you leave a school). The rest are
// derived from state on the fly: degrees and schools (with their national rank), the clubs,
// teams and roles of your current school, honor roll / valedictorian / exam scores, jobs,
// special careers, businesses, charity, fame, social media and licenses.
//
// cvScore(g, target) rates a CV 0-100 for a university, a graduate program or a job; university
// admissions (education.ts) and job screening (careers.ts, offlineScreen for the queued
// 'screenApplication' task) use it.
//
// Also here: deterministic national school rankings (every school, from preschool to graduate
// school, is "#37 of 4,100 secondary schools in Indonesia"), the job market per country and year
// (business cycle + industry demand + local conditions), and the "Your CV" menu.
//
// This module must not import education.ts or careers.ts (they import it).
import { eraPick } from './events/era'
import { hasTech } from './history/timeline'
import { cycleLabel, cycleOf } from './business/economy'
import { ceoJob } from './business/state'
import { devCvEntries } from './computer/dev-cv'
import { codingSkill } from './computer/skills'
import { addHidden, addStat, clamp, count, earnIncome, formatMoney, log, notice, parents, remember, spend, useYearAction, yearActionsUsed } from './core'
import { ALL_JOBS, INDUSTRY_MARKET, INDUSTRY_TAGS, MAJOR_TAGS, PROGRAM_TAGS, type GradKey, type Industry as JobIndustry, type JobDef } from './data/jobs'
import { fillLocal, localeOf, localTerm } from './data/locales'
import { industryDemand, marketOf } from './data/markets'
import { economyOf, industryConditions } from './economy'
import { chance, nextRandom, pick, randInt, uid } from './rng'
import { masterFirstTime } from './mastery'
import { realFollowers } from './followers'
import { formatDef } from './special/author-data'
import { authorView } from './special/author-state'
import { hasMainCharacter, hasTalent, isTalentId, shownTalents, talentHint, type TalentId } from './talents'
import { getCountry } from './world'
import type {
  Asset,
  CareerRecord,
  CvEntry,
  CvKind,
  DegreeKind,
  Enrollment,
  GameState,
  Json,
  MenuAction,
  MenuGroup,
  MenuNode,
  SchoolLevel,
  ScreeningApp,
  ScreeningDecision,
} from './types'

// ---------------------------------------------------------------------------
// Small helpers

/** The titles becomeCeo writes: the player running a company they founded or own. */
const CEO_TITLE = /^(?:Founder|Owner) & CEO$/

function num(v: Json | undefined, dflt: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : dflt
}

function str(v: Json | undefined, dflt = ''): string {
  return typeof v === 'string' ? v : dflt
}

function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

function titleCase(s: string): string {
  return s.replace(/(^|[\s-])(\p{Ll})/gu, (_m, pre: string, ch: string) => pre + ch.toUpperCase())
}

function between(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Deterministic random stream for derived data (rankings, listings): never touches g.rng. */
export function seededStream(key: string): () => number {
  let state = hashString(key) | 0
  return () => {
    const [v, next] = nextRandom(state)
    state = next
    return v
  }
}

/** One deterministic number in [0, 1) for a key. */
function unit(key: string): number {
  const r = seededStream(key)
  r()
  return r()
}

/** 4,137 → 4,100; 86 → 86. */
function niceCount(n: number): number {
  const v = Math.round(n)
  if (v < 100) return v
  const mag = 10 ** (Math.floor(Math.log10(v)) - 1)
  return Math.round(v / mag) * mag
}

function wealth(g: GameState): number {
  return Math.max(0.3, getCountry(g.character.countryId).wealth)
}

function countryWithThe(countryId: string): string {
  const name = getCountry(countryId).name
  return /^(United|Netherlands|Philippines|Bahamas|Czech|Dominican|Central African|Gambia|Maldives|Comoros|Solomon|Marshall|Seychelles|Ivory)/.test(name) ? `the ${name}` : name
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

// ---------------------------------------------------------------------------
// National school rankings

export type SchoolTier = 'Elite' | 'Top' | 'Good' | 'Average' | 'Struggling'

export const TIERS: SchoolTier[] = ['Elite', 'Top', 'Good', 'Average', 'Struggling']

export const TIER_EMOJI: Record<SchoolTier, string> = {
  Elite: '\u{1F451}',
  Top: '\u{1F31F}',
  Good: '\u{1F44D}',
  Average: '\u{1F3EB}',
  Struggling: '\u{1F940}',
}

/** Prestige bonus a school's tier gives a CV entry. */
const TIER_BOOST: Record<SchoolTier, number> = { Elite: 2, Top: 1, Good: 0, Average: 0, Struggling: -1 }

/** Yearly grade edge (education.ts) from better teachers and pushier classmates. */
export const TIER_GRADE_EDGE: Record<SchoolTier, number> = { Elite: 6, Top: 4, Good: 2, Average: 0, Struggling: -3 }

export interface SchoolRank {
  rank: number
  total: number
  tier: SchoolTier
  /** 0 (best) .. 1 (worst). */
  pct: number
  level: SchoolLevel
  countryId: string
}

/** Schools per million people, and a floor for tiny countries. */
const DENSITY: Record<SchoolLevel, [number, number]> = {
  preschool: [260, 4],
  elementary: [240, 4],
  middle: [110, 3],
  high: [90, 3],
  community: [3.5, 1],
  university: [8, 2],
  graduate: [4, 1],
}

/** How many schools of a level a country has (from its population). */
export function schoolCount(countryId: string, level: SchoolLevel): number {
  const pop = Math.max(0.05, marketOf(countryId).populationM)
  const [per, min] = DENSITY[level]
  return Math.max(min, niceCount(pop * per))
}

function tierFor(rank: number, total: number): SchoolTier {
  if (rank <= Math.max(1, Math.round(total * 0.02))) return 'Elite'
  if (rank <= Math.max(2, Math.round(total * 0.12))) return 'Top'
  if (rank <= Math.max(3, Math.round(total * 0.4))) return 'Good'
  if (rank <= Math.round(total * 0.8)) return 'Average'
  return 'Struggling'
}

/** Real, fixed names in the locale data (no {placeholders}) are the famous ones: they rank at the top. */
function fixedNames(countryId: string, level: SchoolLevel): string[] {
  const loc = localeOf(countryId)
  const list =
    level === 'university'
      ? loc.universityNames
      : level === 'elementary'
        ? loc.schoolNames.primary
        : level === 'middle'
          ? loc.schoolNames.middle
          : level === 'high'
            ? loc.schoolNames.high
            : level === 'preschool'
              ? (loc.schoolNames.preschool ?? [])
              : []
  return list.filter((n) => !n.includes('{'))
}

/**
 * Universities named after the country's biggest cities ("University of Tokyo", "Osaka University")
 * and national universities are the flagships; universities of applied sciences and small colleges
 * rarely top the national rankings.
 */
function universityPct(countryId: string, name: string, h: number): number {
  const cities = getCountry(countryId).cities.slice(0, 4)
  const flagship = cities.some((city) => name === `University of ${city}` || name === `${city} University` || name === `${city} National University`)
  if (flagship) return h * 0.06
  if (/National University|Universit(y|é|ad|ade|à|ät|as) Nacional|Nasional/i.test(name)) return h * 0.35
  if (/Institute of Technology|University of Technology|Technical University|Science and Technology/i.test(name)) return h * 0.6
  if (/Applied Sciences|Community|Polytechnic$|College$|Normal University/i.test(name)) return 0.3 + h * 0.7
  return h
}

const GRAD_SUFFIX = / (School of [\w ]+|Graduate School|College of [\w ]+|PhD Program)$/

/**
 * A school's national rank: deterministic from the country, the level and the school's name, so
 * the same school always has the same rank ("#37 of 4,100 secondary schools in Indonesia").
 */
export function schoolRank(countryId: string, level: SchoolLevel, school: string): SchoolRank {
  const total = schoolCount(countryId, level)
  const h = unit(`rank|${countryId}|${level}|${school}`)
  let rank: number
  if (level === 'graduate') {
    // A graduate school is about as good as the university it belongs to.
    const base = school.replace(GRAD_SUFFIX, '')
    const uni = schoolRank(countryId, 'university', base)
    rank = 1 + Math.floor(between(uni.pct * (0.6 + 0.8 * h), 0, 0.9999) * total)
  } else {
    const fixed = fixedNames(countryId, level)
    const span = fixed.length * (total > 40 ? 2 : 1)
    const idx = fixed.indexOf(school)
    if (idx >= 0) rank = 1 + idx * (total > 40 ? 2 : 1) + (total > 40 && h < 0.5 ? 1 : 0)
    else {
      const pct = level === 'university' ? universityPct(countryId, school, h) : h
      rank = 1 + Math.floor(pct * total)
      if (rank <= span && total > span) rank = span + 1 + Math.floor(pct * (total - span))
    }
  }
  rank = between(rank, 1, total)
  return { rank, total, tier: tierFor(rank, total), pct: (rank - 0.5) / total, level, countryId }
}

/** What schools of a level are called in rank labels. */
export function rankNoun(countryId: string, level: SchoolLevel): string {
  const us = countryId === 'us'
  switch (level) {
    case 'preschool':
      return 'preschools'
    case 'elementary':
      return us ? 'elementary schools' : 'primary schools'
    case 'middle':
      return 'middle schools'
    case 'high':
      return us ? 'high schools' : 'secondary schools'
    case 'community':
      return us ? 'community colleges' : 'vocational colleges'
    case 'university':
      return us ? 'colleges and universities' : 'universities'
    case 'graduate':
      return 'graduate schools'
  }
}

/** '#37 of 4,100 secondary schools in Indonesia'. */
export function rankLabel(r: SchoolRank): string {
  return `#${r.rank.toLocaleString('en-US')} of ${r.total.toLocaleString('en-US')} ${rankNoun(r.countryId, r.level)} in ${countryWithThe(r.countryId)}`
}

/** '#37 • Top'. */
export function rankShort(r: SchoolRank): string {
  return `#${r.rank.toLocaleString('en-US')} • ${r.tier}`
}

/** The rank of a school in the player's country. */
export function rankOf(g: GameState, level: SchoolLevel, school: string): SchoolRank {
  return schoolRank(g.character.countryId, level, school)
}

/** The current school's rank (null when not enrolled). */
export function currentSchoolRank(g: GameState): SchoolRank | null {
  const cur = g.character.education.current
  return cur ? rankOf(g, cur.level, cur.school) : null
}

// ---------------------------------------------------------------------------
// The job market (per country and year; deterministic, safe to call from menus)

export interface JobMarket {
  /** 0 (brutal) .. 100 (hot). */
  score: number
  label: 'hot' | 'strong' | 'decent' | 'tough' | 'brutal'
  applicants: number
  cycle: number
  /** Demand for the job's industry here (1 = typical). */
  demand: number
  line: string
}

export function jobMarket(g: GameState, industry?: JobIndustry, countryId = g.character.countryId): JobMarket {
  const m = marketOf(countryId)
  const cyc = cycleOf(g, countryId, g.year)
  // Structural: red tape and corruption keep formal jobs scarce; some labor markets are just tight.
  const structural = (m.easeOfBusiness - 60) * 0.25 - (m.corruption - 40) * 0.12 + (unit(`labor|${countryId}`) - 0.5) * 16
  const mi = industry ? INDUSTRY_MARKET[industry] : undefined
  const e = economyOf(g, countryId)
  const demand = mi ? industryDemand(countryId, mi) * industryConditions(g, mi, countryId).demand : e.spending
  const industryTerm = mi ? between((demand - 1) * 25, -15, 15) : 0
  const score = Math.round(between(50 + (cyc - 1) * 150 + structural + industryTerm - (e.unemployment - .055) * 180, 4, 96))
  const label: JobMarket['label'] = score >= 72 ? 'hot' : score >= 58 ? 'strong' : score >= 43 ? 'decent' : score >= 28 ? 'tough' : 'brutal'
  const applicants = Math.max(3, niceCount(25 * 2 ** ((50 - score) / 12)))
  const where = cap(countryWithThe(countryId))
  const field = mi && demand >= 1.3 ? ' • this field is hiring' : mi && demand <= 0.75 ? ' • this field is shrinking here' : ''
  const state = cycleLabel(cyc)
  const economy = state === 'in recession' ? 'is in a slump' : state === 'steady' ? 'is holding steady' : `is ${state}`
  const line = `Job market: ${label} — ${where} ${economy}; ~${applicants.toLocaleString('en-US')} applicants per opening${field}`
  return { score, label, applicants, cycle: cyc, demand, line }
}

// ---------------------------------------------------------------------------
// CV entries

export const KIND_META: Record<CvKind, { label: string; emoji: string }> = {
  education: { label: 'Education', emoji: '\u{1F393}' },
  experience: { label: 'Experience', emoji: '\u{1F4BC}' },
  leadership: { label: 'Leadership', emoji: '\u{1F9ED}' },
  activity: { label: 'Activities', emoji: '\u{1F3C5}' },
  volunteering: { label: 'Volunteering', emoji: '\u{1F91D}' },
  project: { label: 'Projects', emoji: '\u{1F6E0}\u{FE0F}' },
  award: { label: 'Awards', emoji: '\u{1F3C6}' },
  certification: { label: 'Certifications', emoji: '\u{1F4DC}' },
  skill: { label: 'Skills & Languages', emoji: '\u{1F9E0}' },
}

export const CV_KINDS: CvKind[] = ['education', 'experience', 'leadership', 'activity', 'volunteering', 'project', 'award', 'certification', 'skill']

const KIND_SET = new Set<string>(CV_KINDS)

/** Stored entries, validated (old saves have none; hand-edited saves may have junk). */
function storedEntries(g: GameState): CvEntry[] {
  const raw = (g.character as { cv?: unknown }).cv
  if (!Array.isArray(raw)) return []
  const out: CvEntry[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const e = r as Partial<CvEntry>
    if (typeof e.title !== 'string' || !e.title || typeof e.kind !== 'string' || !KIND_SET.has(e.kind)) continue
    out.push({
      id: typeof e.id === 'string' ? e.id : `cv:${out.length}`,
      kind: e.kind,
      title: e.title,
      org: typeof e.org === 'string' ? e.org : '',
      startAge: typeof e.startAge === 'number' ? e.startAge : g.character.age,
      ...(typeof e.endAge === 'number' ? { endAge: e.endAge } : {}),
      detail: typeof e.detail === 'string' ? e.detail : '',
      strength: between(Math.round(typeof e.strength === 'number' ? e.strength : 3), 1, 10),
      embellished: e.embellished === true,
      ...(Array.isArray(e.tags) ? { tags: e.tags.filter((t): t is string => typeof t === 'string') } : {}),
      ...(typeof e.source === 'string' ? { source: e.source } : {}),
    })
  }
  return out
}

/** The character's own CV list, created on first write. */
function cvStore(g: GameState): CvEntry[] {
  const c = g.character
  if (!Array.isArray(c.cv)) c.cv = []
  return c.cv
}

export type NewCvEntry = Omit<CvEntry, 'id' | 'embellished' | 'strength'> & { embellished?: boolean; strength: number }

/** Add an explicit entry to the CV. */
export function addCvEntry(g: GameState, e: NewCvEntry): CvEntry {
  const entry: CvEntry = {
    id: uid(g, 'cv'),
    kind: e.kind,
    title: e.title,
    org: e.org,
    startAge: e.startAge,
    detail: e.detail,
    strength: between(Math.round(e.strength), 1, 10),
    embellished: e.embellished === true,
  }
  if (typeof e.endAge === 'number') entry.endAge = e.endAge
  if (e.tags && e.tags.length) entry.tags = [...e.tags]
  if (e.source) entry.source = e.source
  cvStore(g).push(entry)
  return entry
}

function findStored(g: GameState, pred: (e: CvEntry) => boolean): CvEntry | undefined {
  return Array.isArray(g.character.cv) ? g.character.cv.find(pred) : undefined
}

const DEGREE_STRENGTH: Record<DegreeKind, number> = {
  ged: 1,
  highschool: 2,
  associate: 3,
  bachelor: 5,
  nursing: 6,
  master: 6,
  mba: 7,
  jd: 7,
  pharmd: 7,
  dds: 7,
  dvm: 7,
  md: 8,
  doctorate: 8,
}

const DEGREE_TAGS: Partial<Record<DegreeKind, string[]>> = {
  jd: ['law', 'government'],
  md: ['health', 'science'],
  dds: ['health', 'science'],
  dvm: ['animals', 'health', 'science'],
  pharmd: ['health', 'science'],
  nursing: ['health', 'service'],
  mba: ['business', 'finance'],
  doctorate: ['academic', 'science'],
}

function degreeLevel(kind: DegreeKind): SchoolLevel | null {
  if (kind === 'ged') return null
  if (kind === 'highschool') return 'high'
  if (kind === 'associate') return 'community'
  if (kind === 'bachelor') return 'university'
  return 'graduate'
}

function levelWord(countryId: string, level: SchoolLevel): string {
  const us = countryId === 'us'
  switch (level) {
    case 'preschool':
      return 'Preschool'
    case 'elementary':
      return us ? 'Elementary school' : 'Primary school'
    case 'middle':
      return 'Middle school'
    case 'high':
      return us ? 'High school' : 'Secondary school'
    case 'community':
      return us ? 'Community college' : 'Vocational college'
    case 'university':
      return 'University'
    case 'graduate':
      return 'Graduate school'
  }
}

/** Topic tags a club or activity name suggests. */
function tagsForName(name: string, kind?: string): string[] {
  const tags = new Set<string>()
  if (kind === 'sport') tags.add('sports')
  if (kind === 'music') tags.add('music').add('arts')
  if (kind === 'arts') tags.add('arts')
  if (kind === 'academic') tags.add('academic')
  if (kind === 'service') tags.add('service')
  const n = name.toLowerCase()
  if (/robot|coding|computer|tech|video game|esports|programming/.test(n)) tags.add('tech')
  if (/debate|model un|mock trial|politic|student council/.test(n)) tags.add('law').add('government')
  if (/journal|newspaper|yearbook|broadcast|film|photo/.test(n)) tags.add('media').add('writing')
  if (/math|science|olympiad|decathlon|chemistry|physics|biology|astronomy/.test(n)) tags.add('science')
  if (/business|deca|fbla|invest|entrepreneur|economics/.test(n)) tags.add('business')
  if (/first aid|red cross|health|medical/.test(n)) tags.add('health')
  if (/animal/.test(n)) tags.add('animals')
  if (/language|spanish|french|german|latin|sign language|chinese|japanese/.test(n)) tags.add('language')
  if (/writing|poetry|literature|book/.test(n)) tags.add('writing')
  if (/drama|theat|art|dance|choir|band|orchestra/.test(n)) tags.add('arts')
  return [...tags]
}

function humanize(id: string): string {
  const raw = id.startsWith('local:') ? `${id.slice(6)} team` : id.replace(/_/g, ' ')
  return titleCase(raw)
}

interface ClubData {
  id: string
  name: string
  kind: string
  perf: number
  years: number
  role: string
}

/** Club records of an enrollment (education.ts stores name/kind with each one). */
export function enrollmentClubs(cur: Enrollment): ClubData[] {
  const raw = cur.data.clubs
  if (!Array.isArray(raw)) return []
  const out: ClubData[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object' || Array.isArray(r) || typeof r.id !== 'string') continue
    const name = str(r.name) || humanize(r.id)
    const kind = str(r.kind) || (/team$/i.test(name) ? 'sport' : '')
    out.push({ id: r.id, name, kind, perf: num(r.perf, 50), years: num(r.years, 0), role: str(r.role) })
  }
  return out
}

function clubEntry(club: ClubData, school: string, age: number, endAge: number | undefined, idPrefix: string): CvEntry {
  const years = Math.max(0, Math.round(club.years))
  const strength = between(Math.round(2 + Math.min(years, 4) * 0.6 + club.perf / 35 + (club.role ? 2 : 0)), 1, 9)
  const e: CvEntry = {
    id: `${idPrefix}:${club.id}`,
    kind: club.role ? 'leadership' : 'activity',
    title: club.role ? `${titleCase(club.role)}, ${club.name}` : club.name,
    org: school,
    startAge: Math.max(0, (endAge ?? age) - Math.max(1, years)),
    detail: `${years <= 1 ? 'about a year' : `${years} years`} • performance ${Math.round(club.perf)}%`,
    strength,
    embellished: false,
    tags: tagsForName(club.name, club.kind),
  }
  if (endAge !== undefined) e.endAge = endAge
  return e
}

function examEntry(g: GameState, age: number): CvEntry | null {
  const score = g.flags.examScore
  if (typeof score !== 'number' || score < 70) return null
  const us = g.character.countryId === 'us'
  const exam = (localTerm(g, 'finalExam') || 'the national exams').replace(/^the /i, '')
  const sat = Math.max(400, Math.min(1600, Math.round((400 + score * 12) / 10) * 10))
  return {
    id: 'd:exam',
    kind: 'award',
    title: us ? `SAT score: ${sat}` : `${titleCase(exam)}: ${Math.round(score)}/100`,
    org: '',
    startAge: age,
    endAge: age,
    detail: score >= 90 ? 'Top of the country' : score >= 80 ? 'Excellent result' : 'Strong result',
    strength: between(Math.round(3 + (score - 70) / 6), 3, 8),
    embellished: false,
    tags: ['academic'],
  }
}

// Job titles → industry (for tags on past jobs).
let titleIndex: Map<string, JobIndustry> | null = null
function industryForTitle(title: string): JobIndustry | undefined {
  if (!titleIndex) {
    titleIndex = new Map()
    for (const d of ALL_JOBS) for (const r of d.ladder) if (!titleIndex.has(r.title)) titleIndex.set(r.title, d.industry)
  }
  return titleIndex.get(title)
}

function experienceStrength(g: GameState, years: number, salary: number): number {
  const rel = salary / (45_000 * wealth(g))
  const pay = rel >= 2 ? 2 : rel >= 1 ? 1 : rel < 0.4 ? -1 : 0
  return between(Math.round(2 + Math.min(years, 8) * 0.6 + pay), 1, 9)
}

const LICENSE_ENTRIES: Record<string, [string, number, string[]]> = {
  driver: ["Driver's license", 1, ['trades']],
  pilot: ["Pilot's license", 5, ['trades']],
  boating: ['Boating license', 1, ['trades']],
  firearm: ['Firearm license', 1, []],
  law: ['Admitted to the bar', 6, ['law']],
  medical: ['Medical license', 6, ['health']],
}

const TALENT_TAGS: Record<string, string[]> = {
  Music: ['music', 'arts'],
  Athletics: ['sports'],
  Acting: ['arts', 'media'],
  Art: ['arts'],
  Writing: ['writing', 'media'],
  Comedy: ['arts', 'media'],
  Academics: ['academic', 'science'],
  Modeling: ['beauty', 'media'],
  Cooking: ['hospitality'],
  Programming: ['tech'],
  Business: ['business', 'finance'],
  Investing: ['finance', 'business'],
  Leadership: ['government', 'business'],
  Gaming: ['tech', 'arts'],
}

/** What a special career says about you on a CV (a former head of government reads as government, not showbiz). */
function specialTags(defId: string): string[] {
  const id = defId.toLowerCase()
  if (id === 'politician') return ['government', 'law', 'service']
  if (id === 'astronaut') return ['science', 'tech']
  if (id === 'musician') return ['music', 'arts', 'media']
  if (id === 'author') return ['writing', 'arts', 'media']
  if (id === 'model') return ['beauty', 'media']
  if (id === 'hustler') return ['business']
  if (/game|studio/.test(id)) return ['tech', 'arts']
  if (id === 'sports.esports') return ['sports', 'tech']
  if (/athlete|sport|fight|mma|box|wrestl|player/.test(id)) return ['sports']
  return ['arts', 'media']
}

/** Entries computed from the rest of the game state. */
function derivedEntries(g: GameState): CvEntry[] {
  const c = g.character
  const out: CvEntry[] = []
  const cid = c.countryId
  // Degrees, with the school's national rank.
  c.education.degrees.forEach((d, i) => {
    const level = degreeLevel(d.kind)
    const r = level ? schoolRank(cid, level, d.school) : null
    const boost = r ? TIER_BOOST[r.tier] : 0
    const tags = [...(d.major ? (MAJOR_TAGS[d.major] ?? []) : []), ...(DEGREE_TAGS[d.kind] ?? [])]
    out.push({
      id: `d:degree:${i}`,
      kind: 'education',
      title: d.name,
      org: d.school,
      startAge: d.age,
      endAge: d.age,
      detail: [r ? rankLabel(r) : '', d.honors ? 'with honors' : ''].filter(Boolean).join(' • '),
      strength: between((DEGREE_STRENGTH[d.kind] ?? 3) + boost + (d.honors ? 1 : 0), 1, 10),
      embellished: false,
      tags: [...new Set(tags)],
    })
  })
  // Where you study now, plus its clubs, teams, roles and honor roll.
  const cur = c.education.current
  if (cur && cur.level !== 'preschool') {
    const r = schoolRank(cid, cur.level, cur.school)
    const base: Record<SchoolLevel, number> = { preschool: 0, elementary: 1, middle: 1, high: 2, community: 2, university: 4, graduate: 5 }
    const major = cur.major ? `, ${cur.major}` : ''
    out.push({
      id: 'd:school',
      kind: 'education',
      title: `${levelWord(cid, cur.level)} student${major}`,
      org: cur.school,
      startAge: Math.max(0, c.age - cur.year + 1),
      detail: `${rankLabel(r)} • grades ${Math.round(cur.grades)}%`,
      strength: between(base[cur.level] + TIER_BOOST[r.tier], 1, 8),
      embellished: false,
      tags: cur.major ? (MAJOR_TAGS[cur.major] ?? []) : ['academic'],
    })
    for (const club of enrollmentClubs(cur)) out.push(clubEntry(club, cur.school, c.age, undefined, 'd:club'))
    const greek = str(cur.data.greek)
    if (greek) out.push({ id: 'd:greek', kind: 'activity', title: `Member, ${greek}`, org: cur.school, startAge: c.age, detail: 'Greek life', strength: 2, embellished: false, tags: ['business'] })
    const clique = str(cur.data.clique as Json)
    if (clique) {
      const name = str(cur.data.cliqueName) || humanize(clique)
      out.push({ id: 'd:clique', kind: 'activity', title: `Member of the ${name}`, org: cur.school, startAge: c.age, detail: 'Social standing (recruiters are unmoved)', strength: 1, embellished: false })
    }
    if (cur.grades >= 90 && cur.level !== 'elementary') {
      out.push({ id: 'd:honor', kind: 'award', title: 'Honor Roll', org: cur.school, startAge: c.age, detail: `Grades ${Math.round(cur.grades)}%`, strength: cur.grades >= 96 ? 5 : 4, embellished: false, tags: ['academic'] })
    }
  }
  const hsDegree = c.education.degrees.find((d) => d.kind === 'highschool')
  const valedictorian = str(g.flags.valedictorian as Json)
  if (valedictorian) {
    const word = ['us', 'ca', 'ph'].includes(cid) ? 'Valedictorian' : 'Top of the Class'
    out.push({ id: 'd:valedictorian', kind: 'award', title: word, org: valedictorian, startAge: hsDegree?.age ?? c.age, endAge: hsDegree?.age ?? c.age, detail: 'Highest grades in the graduating class', strength: 7, embellished: false, tags: ['academic'] })
  }
  const exam = examEntry(g, hsDegree?.age ?? c.age)
  if (exam) out.push(exam)
  // A company you still own is one row, below, whatever stints you had running it: its CEO rows in
  // the job history (and the CEO job you hold now) fold into that row instead of listing it twice.
  const businesses = g.assets.filter((a) => a.kind === 'business')
  const ownedBy = (r: CareerRecord): Asset | undefined => {
    if (typeof r.assetId === 'string') return businesses.find((a) => a.id === r.assetId)
    // A save from before the row named its company: a founder or owner row for a company of that name.
    return CEO_TITLE.test(r.title) ? businesses.find((a) => a.name === r.company && a.purchasedAge <= r.startAge) : undefined
  }
  const ceoYears = new Map<string, number>()
  // Work history (one entry per employer), then current jobs.
  const byCompany = new Map<string, { company: string; title: string; start: number; end: number; salary: number }>()
  for (const r of c.careerHistory) {
    const owned = ownedBy(r)
    if (owned) {
      ceoYears.set(owned.id, (ceoYears.get(owned.id) ?? 0) + Math.max(0, r.endAge - r.startAge))
      continue
    }
    // Two companies with one name stay two rows when the record says which company it was.
    const key = typeof r.assetId === 'string' ? `#${r.assetId}` : r.company
    const prev = byCompany.get(key)
    if (prev) byCompany.set(key, { company: r.company, title: r.endAge >= prev.end ? r.title : prev.title, start: Math.min(prev.start, r.startAge), end: Math.max(prev.end, r.endAge), salary: Math.max(prev.salary, r.salary) })
    else byCompany.set(key, { company: r.company, title: r.title, start: r.startAge, end: r.endAge, salary: r.salary })
  }
  let i = 0
  for (const r of byCompany.values()) {
    const ind = industryForTitle(r.title)
    const years = Math.max(0, r.end - r.start)
    out.push({
      id: `d:job:${i++}`,
      kind: 'experience',
      title: r.title,
      org: r.company,
      startAge: r.start,
      endAge: r.end,
      detail: years <= 1 ? 'under a year' : `${years} years`,
      strength: experienceStrength(g, Math.max(0.5, years), r.salary),
      embellished: false,
      tags: ind ? INDUSTRY_TAGS[ind] : [],
    })
  }
  for (const slot of ['job', 'partTimeJob'] as const) {
    const j = c[slot]
    if (!j) continue
    const running = ceoJob(g) === j ? businesses.find((a) => a.id === j.data.assetId) : undefined
    if (running) {
      ceoYears.set(running.id, (ceoYears.get(running.id) ?? 0) + Math.max(0, j.yearsAtCompany))
      continue
    }
    const ind = industryForTitle(j.title)
    const tags = j.category === 'military' ? ['service', 'government', 'sports'] : j.category === 'special' ? specialTags(j.defId) : ind ? INDUSTRY_TAGS[ind] : []
    out.push({
      id: `d:${slot}`,
      kind: 'experience',
      title: j.title,
      org: j.company,
      startAge: Math.max(0, c.age - j.yearsAtCompany),
      detail: `${j.yearsAtCompany <= 1 ? 'started recently' : `${j.yearsAtCompany} years so far`}${j.performance >= 85 ? ' • top performer' : ''}`,
      strength: between(experienceStrength(g, Math.max(0.5, j.yearsAtCompany), j.salary) + (j.performance >= 85 ? 1 : 0) + (j.category === 'special' ? 1 : 0), 1, 10),
      embellished: false,
      tags,
    })
  }
  // Businesses you own.
  businesses.forEach((a, k) => {
    const acquired = a.details.acquired === true
    const employees = num(a.details.employees, 0)
    const ran = Math.round(ceoYears.get(a.id) ?? 0)
    out.push({
      id: `d:biz:${k}`,
      kind: 'experience',
      title: acquired ? 'Owner' : 'Founder & CEO',
      org: a.name,
      startAge: a.purchasedAge,
      detail: [employees > 0 ? plural(employees, 'employee') : 'Running the whole show', ran >= 1 ? `${plural(ran, 'year')} as CEO` : ''].filter(Boolean).join(' • '),
      strength: between(6 + (employees >= 10 ? 1 : 0) + (a.value >= 1_000_000 ? 1 : 0), 1, 9),
      embellished: false,
      tags: ['business'],
    })
  })
  const founded = g.counters.businessesFounded ?? 0
  if (founded > businesses.length && founded >= 2) {
    out.push({ id: 'd:serial', kind: 'experience', title: 'Serial entrepreneur', org: '', startAge: c.age, detail: `${founded} companies founded`, strength: 5, embellished: false, tags: ['business'] })
  }
  // Charity, fame, social media.
  const donated = g.counters.donated ?? 0
  const moneyDonated = g.counters.moneyDonated ?? 0
  if (moneyDonated >= 100_000) {
    out.push({ id: 'd:philanthropy', kind: 'award', title: 'Philanthropist', org: '', startAge: c.age, detail: `${formatMoney(moneyDonated)} given to charity`, strength: 6, embellished: false, tags: ['service'] })
  } else if (donated >= 3) {
    out.push({ id: 'd:donor', kind: 'volunteering', title: 'Regular charity donor', org: '', startAge: c.age, detail: `${donated} donations`, strength: 2, embellished: false, tags: ['service'] })
  }
  if (c.hidden.fame >= 50) {
    out.push({ id: 'd:fame', kind: 'award', title: 'Public figure', org: '', startAge: c.age, detail: `Fame ${c.hidden.fame}%`, strength: between(Math.round(c.hidden.fame / 12), 4, 9), embellished: false, tags: ['media'] })
  }
  // Bought followers don't count: the CV shows the audience that is actually there.
  const f = realFollowers(c.social)
  if (c.social && f >= 10_000) {
    out.push({
      id: 'd:social',
      kind: 'project',
      title: `Content creator on ${c.social.platform}`,
      org: `@${c.social.handle}`,
      startAge: c.age,
      detail: `${f.toLocaleString('en-US')} followers${c.social.verified ? ' • verified' : ''}`,
      strength: between(Math.round((Math.log10(f) - 3) * 2.5), 2, 9),
      embellished: false,
      tags: ['media'],
    })
  }
  const albums = g.counters.albums ?? 0
  if (albums > 0) out.push({ id: 'd:albums', kind: 'project', title: `Released ${plural(albums, 'album')}`, org: '', startAge: c.age, detail: 'Music career', strength: between(4 + albums, 5, 9), embellished: false, tags: ['music', 'arts'] })
  // Real publications, not generic counters or unfinished manuscripts. This profile
  // reader is owner-scoped and pure, so browsing a CV cannot create a career or reroll it.
  for (const work of authorView(g).works) {
    if (!['serial', 'published', 'ended'].includes(work.stage) || work.released <= 0 || work.released > g.year) continue
    const format = formatDef(work.format)
    const startAge = Math.max(0, c.age - (g.year - work.released))
    const reach = Math.max(work.copies, work.readers)
    out.push({
      id: `d:author:${work.id}`,
      kind: 'project',
      title: `Published "${work.title}"`,
      org: work.publisher || 'Self-published',
      startAge,
      ...(work.stage !== 'serial' ? { endAge: startAge } : {}),
      detail: `${format.label} • ${format.serial ? `${plural(work.chapters, 'chapter')} • ${work.readers.toLocaleString('en-US')} readers` : `${work.copies.toLocaleString('en-US')} copies sold`} • quality ${Math.round(work.quality)}/100`,
      strength: between(Math.round(3 + work.quality / 35 + Math.log10(1 + reach) * 0.55), 3, 9),
      embellished: false,
      tags: ['writing', 'arts', 'media'],
    })
  }
  // Licenses and talent.
  for (const lic of c.licenses) {
    const [title, strength, tags] = LICENSE_ENTRIES[lic] ?? [`${titleCase(lic)} license`, 1, []]
    out.push({ id: `d:license:${lic}`, kind: 'certification', title, org: '', startAge: c.age, detail: '', strength, embellished: false, tags })
  }
  // Talents: picked before birth (or inherited) and the one discovered as a kid. Crime stays off the record.
  const picked = Array.isArray(c.talents) ? c.talents : []
  for (const t of shownTalents(g)) {
    if (t === 'Crime') continue
    const born = picked.includes(t)
    const main = t === 'MainCharacter'
    out.push({
      id: born ? `d:talent:${t}` : 'd:talent',
      kind: 'skill',
      title: main ? 'Natural talent: Main Character Syndrome' : `Natural talent: ${t}`,
      org: '',
      startAge: c.age,
      detail: main ? 'Good at everything, somehow' : born ? 'A gift since birth' : 'Discovered as a kid',
      strength: main ? 5 : 3,
      embellished: false,
      tags: main ? [...new Set(Object.values(TALENT_TAGS).flat())] : (TALENT_TAGS[t] ?? []),
    })
  }
  // The home computer: coding skill, shipped projects, ventures, freelance work, contests.
  out.push(...devCvEntries(g))
  return out
}

/** Every CV entry (stored + derived), strongest and most recent first. */
export function cvEntries(g: GameState): CvEntry[] {
  const age = g.character.age
  const all = [...storedEntries(g), ...derivedEntries(g)]
  return all.sort((a, b) => b.strength - a.strength || (b.endAge ?? age) - (a.endAge ?? age))
}

export function embellishedEntries(g: GameState): CvEntry[] {
  return storedEntries(g).filter((e) => e.embellished)
}

/** 'age 15–17', 'since age 16', 'age 16'. */
export function agesLabel(e: CvEntry): string {
  if (e.endAge === undefined) return `since age ${e.startAge}`
  return e.endAge === e.startAge ? `age ${e.startAge}` : `age ${e.startAge}–${e.endAge}`
}

export function strengthStars(n: number): string {
  const full = between(Math.ceil(n / 2), 1, 5)
  return `${'★'.repeat(full)}${'☆'.repeat(5 - full)}`
}

// ---------------------------------------------------------------------------
// Scoring

export interface CvTarget {
  kind: 'university' | 'graduate' | 'job'
  /** Topic tags the reader cares about. */
  tags?: string[]
  /** Job education requirement (data/jobs EduReq). */
  edu?: string
  /** Entry-level / part-time job: school activities still count. */
  entry?: boolean
}

export interface CvScore {
  score: number
  /** Short breakdown: biggest boosts and gaps. */
  lines: string[]
}

const WEIGHTS: Record<CvTarget['kind'], Record<CvKind, number>> = {
  university: { education: 0.6, experience: 0.5, activity: 1.0, leadership: 1.3, volunteering: 1.1, project: 1.1, award: 1.2, certification: 0.6, skill: 0.7 },
  graduate: { education: 1.0, experience: 0.8, activity: 0.4, leadership: 0.9, volunteering: 0.8, project: 1.0, award: 1.1, certification: 0.7, skill: 0.6 },
  job: { education: 1.0, experience: 1.3, activity: 0.3, leadership: 0.8, volunteering: 0.5, project: 0.9, award: 0.8, certification: 0.9, skill: 0.7 },
}

function entryPoints(g: GameState, e: CvEntry, target: CvTarget): number {
  const age = g.character.age
  let w = WEIGHTS[target.kind][e.kind]
  if (target.kind === 'job' && target.entry && (e.kind === 'activity' || e.kind === 'volunteering')) w *= 2
  // Relevance.
  const want = target.tags ?? []
  if (want.length && e.tags && e.tags.length) w *= e.tags.some((t) => want.includes(t)) ? 1.6 : 0.8
  // Old news.
  const ended = e.endAge ?? age
  if (target.kind !== 'university' && age - ended > 8) w *= 0.6
  if (target.kind !== 'university' && age > 26 && (e.kind === 'activity' || e.source === 'school') && ended <= 22) w *= 0.4
  // A high-school diploma is nothing special once you have a degree.
  if (e.id.startsWith('d:degree') && e.title && target.kind !== 'university' && g.character.education.degrees.length > 1 && e.strength <= 2) w *= 0.3
  return e.strength * w
}

/** CV strength 0-100 from a list of entries (the sum of their points, with diminishing returns). */
function strengthOf(g: GameState, entries: CvEntry[], target: CvTarget): number {
  const sum = entries.reduce((s, e) => s + entryPoints(g, e, target), 0)
  const k = target.kind === 'university' ? 28 : 30
  return Math.round(100 * (1 - Math.exp(-sum / k)))
}

/** How strong the CV is for a target, 0-100, with a short breakdown. */
export function cvScore(g: GameState, target: CvTarget): CvScore {
  const entries = cvEntries(g)
  const scored = entries.map((e) => ({ e, pts: entryPoints(g, e, target) })).sort((a, b) => b.pts - a.pts)
  const score = strengthOf(g, entries, target)
  const lines = scored
    .filter((x) => x.pts >= 1)
    .slice(0, 3)
    .map((x) => `${x.e.title}${x.e.org ? ` (${x.e.org})` : ''} +${Math.round(x.pts)}`)
  const has = (kinds: CvKind[]) => entries.some((e) => kinds.includes(e.kind))
  if (target.kind === 'university') {
    if (!has(['activity', 'leadership'])) lines.push('Gap: no clubs, teams or leadership')
    if (!has(['volunteering'])) lines.push('Gap: no volunteering')
    if (!has(['project', 'award'])) lines.push('Gap: no projects or awards')
  } else if (target.kind === 'job') {
    if (!has(['experience'])) lines.push('Gap: no work experience')
    if (target.tags?.length && !entries.some((e) => e.tags?.some((t) => target.tags!.includes(t)))) lines.push('Gap: nothing relevant to this field')
  } else if (!has(['project', 'award', 'experience'])) {
    lines.push('Gap: no research, projects or experience')
  }
  return { score, lines }
}

export function universityTarget(major?: string): CvTarget {
  return { kind: 'university', tags: major ? (MAJOR_TAGS[major] ?? []) : [] }
}

export function graduateTarget(program: GradKey): CvTarget {
  return { kind: 'graduate', tags: PROGRAM_TAGS[program] ?? [] }
}

export function jobTarget(def: Pick<JobDef, 'industry' | 'edu' | 'category' | 'majors'>): CvTarget {
  const tags = new Set(INDUSTRY_TAGS[def.industry] ?? [])
  for (const m of def.majors ?? []) for (const t of MAJOR_TAGS[m] ?? []) tags.add(t)
  return { kind: 'job', tags: [...tags], edu: def.edu, entry: def.edu === 'none' || def.category === 'parttime' }
}

/** A typical white-collar job (shown as the generic CV strength). */
const GENERIC_JOB: CvTarget = { kind: 'job', tags: [], edu: 'bachelor' }

/** Offline odds that a recruiter invites you to interview. */
export function jobScreenChance(def: Pick<JobDef, 'edu' | 'category'>, fit: number, market: JobMarket): number {
  let p = 0.2 + (fit / 100) * 0.75 + (market.score - 50) / 120
  if (def.category === 'parttime') p += 0.45
  else if (def.edu === 'none') p += 0.25
  else if (def.edu === 'highschool') p += 0.12
  return between(p, 0.04, 0.97)
}

// ---------------------------------------------------------------------------
// Job fit: how well this CV matches one particular job (the recruiter and the job listings)
//
// cvScore says how strong a CV is in general; jobFit says how well it reads to the hiring
// manager of one job: the CV's strength for that job, how much of it is relevant to the field,
// the right degree (major, level, school rank), years in the field, coding skill for tech jobs,
// certifications and the local market for that industry. Deterministic and read-only.

/** Education levels on one scale, for a job's requirement and for the player's degrees. */
const REQ_LEVEL: Record<string, number> = { none: 0, highschool: 1, community: 2, bachelor: 3, graduate: 4, business: 5, law: 5, medical: 5, dental: 5, nursing: 5, pharmacy: 5, veterinary: 5 }
const DEGREE_RANK: Record<DegreeKind, number> = { ged: 1, highschool: 1, associate: 2, bachelor: 3, master: 4, doctorate: 4, nursing: 5, mba: 5, jd: 5, md: 5, dds: 5, pharmd: 5, dvm: 5 }
/** The degree a professional requirement asks for, and how a recruiter says it. */
const PRO_DEGREE: Record<string, [DegreeKind, string]> = {
  business: ['mba', 'MBA'],
  law: ['jd', 'law degree'],
  medical: ['md', 'medical degree'],
  dental: ['dds', 'dental degree'],
  nursing: ['nursing', 'nursing degree'],
  pharmacy: ['pharmd', 'pharmacy degree'],
  veterinary: ['dvm', 'veterinary degree'],
}
const TIER_FIT: Record<SchoolTier, number> = { Elite: 6, Top: 4, Good: 1, Average: 0, Struggling: -3 }

/** How a recruiter names a field, from CV tags. */
const TAG_WORDS: Record<string, string> = {
  tech: 'tech',
  science: 'science',
  academic: 'academia',
  arts: 'the arts',
  music: 'music',
  media: 'media',
  writing: 'writing',
  business: 'business',
  finance: 'finance',
  law: 'law',
  health: 'healthcare',
  service: 'public service',
  sports: 'sports',
  education: 'education',
  trades: 'the trades',
  hospitality: 'hospitality',
  beauty: 'beauty',
  animals: 'animal care',
  government: 'government',
  language: 'languages',
}

export function fieldWord(tag: string | undefined): string {
  return (tag && TAG_WORDS[tag]) || 'this field'
}

/** The field a job belongs to, in a recruiter's words ('tech', 'healthcare'...). */
export function jobFieldWord(def: Pick<JobDef, 'industry'>): string {
  return fieldWord(INDUSTRY_TAGS[def.industry]?.[0])
}

/** Everything about the CV that job fit needs, computed once for many jobs. */
export interface FitContext {
  entries: CvEntry[]
  /** Years worked per job industry (past and current regular jobs). */
  years: Partial<Record<JobIndustry, number>>
  totalYears: number
  coding: number
  /** Highest education on the REQ_LEVEL scale. */
  eduLevel: number
  bachelorMajors: string[]
  degreeKinds: DegreeKind[]
  /** Best school tier among university and graduate degrees ('' = none). */
  bestTier: SchoolTier | ''
  /** The CV's strongest fields (tags), best first. */
  fields: string[]
}

export function fitContext(g: GameState): FitContext {
  const c = g.character
  const entries = cvEntries(g)
  const years: Partial<Record<JobIndustry, number>> = {}
  let totalYears = 0
  const add = (title: string, y: number, known?: JobIndustry) => {
    const yrs = Math.max(0, Number.isFinite(y) ? y : 0)
    totalYears += yrs
    const ind = known ?? industryForTitle(title)
    if (ind) years[ind] = (years[ind] ?? 0) + yrs
  }
  for (const r of c.careerHistory) add(r.title, r.endAge - r.startAge)
  for (const slot of ['job', 'partTimeJob'] as const) {
    const j = c[slot]
    if (!j || (j.category !== 'fulltime' && j.category !== 'parttime')) continue
    const known = typeof j.data.industry === 'string' && j.data.industry in INDUSTRY_TAGS ? (j.data.industry as JobIndustry) : undefined
    add(j.title, j.yearsAtCompany, known)
  }
  let eduLevel = 0
  let bestTier: SchoolTier | '' = ''
  for (const d of c.education.degrees) {
    eduLevel = Math.max(eduLevel, DEGREE_RANK[d.kind] ?? 0)
    const level = degreeLevel(d.kind)
    if (level !== 'university' && level !== 'graduate') continue
    const tier = schoolRank(c.countryId, level, d.school).tier
    if (!bestTier || TIER_FIT[tier] > TIER_FIT[bestTier]) bestTier = tier
  }
  return {
    entries,
    years,
    totalYears,
    coding: codingSkill(g),
    eduLevel,
    bachelorMajors: c.education.degrees.filter((d) => d.kind === 'bachelor' && d.major).map((d) => d.major as string),
    degreeKinds: c.education.degrees.map((d) => d.kind),
    bestTier,
    fields: fieldsOf(entries),
  }
}

function fieldsOf(entries: CvEntry[]): string[] {
  const weight = new Map<string, number>()
  for (const e of entries) for (const t of e.tags ?? []) weight.set(t, (weight.get(t) ?? 0) + e.strength)
  return [...weight].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t)
}

/** The CV's strongest fields in a recruiter's words ('tech', 'finance'...), best first. */
export function cvFields(g: GameState, max = 2): string[] {
  return fieldsOf(cvEntries(g))
    .slice(0, max)
    .map((t) => fieldWord(t))
}

export interface JobFit {
  /** 0-100: how well the CV matches this job. */
  fit: number
  /** Selling points, best first ('Degree in Computer Science', '4 years in tech'...). */
  strengths: string[]
  /** What holds the application back (CV gaps, not hard requirements). */
  gaps: string[]
  /** 0-1: how much of the CV is about this job's field. */
  relevance: number
}

/** How well the CV fits one job (pass a FitContext when scoring many jobs at once). */
export function jobFit(g: GameState, def: JobDef, ctx: FitContext = fitContext(g), market: JobMarket = jobMarket(g, def.industry)): JobFit {
  const target = jobTarget(def)
  const want = target.tags ?? []
  const field = jobFieldWord(def)
  const strengths: [string, number][] = []
  const gaps: string[] = []
  const fulltime = def.category === 'fulltime'

  // 1. The CV's overall strength for this job.
  const strength = strengthOf(g, ctx.entries, target)
  let fit = strength * 0.3

  // 2. How much of it is relevant to the field.
  let relPts = 0
  let best: CvEntry | undefined
  let bestPts = 0
  for (const e of ctx.entries) {
    if (!e.tags?.some((t) => want.includes(t))) continue
    // Degrees count for relevance too, but they mostly score below (major, level, school).
    const pts = entryPoints(g, e, target) * (e.kind === 'education' ? 0.5 : 1)
    relPts += pts
    if (e.kind === 'education') continue
    if (pts > bestPts) {
      bestPts = pts
      best = e
    }
  }
  const relevance = 1 - Math.exp(-relPts / 14)
  fit += relevance * 26
  const relatedDegree = ctx.bachelorMajors.some((m) => def.majors?.includes(m) || (MAJOR_TAGS[m] ?? []).some((t) => want.includes(t)))
  if (best && bestPts >= 4) strengths.push([`"${best.title}"${best.org && best.kind !== 'skill' ? ` (${best.org})` : ''}`, bestPts])
  else if (want.length && fulltime && relPts < 1 && !relatedDegree) gaps.push(`Nothing on your CV shows an interest in ${field}`)

  // 3. The right degree, at the right level, from a good school.
  const req = REQ_LEVEL[def.edu] ?? 0
  const pro = PRO_DEGREE[def.edu]
  if (pro) {
    if (ctx.degreeKinds.includes(pro[0])) {
      fit += 28
      strengths.push([`Your ${pro[1]}`, 28])
    }
  } else if (req >= 3) {
    const exact = ctx.bachelorMajors.find((m) => def.majors?.includes(m))
    const related = ctx.bachelorMajors.find((m) => (MAJOR_TAGS[m] ?? []).some((t) => want.includes(t)))
    if (exact) {
      fit += 22
      strengths.push([`Degree in ${exact}`, 22])
    } else if (related) {
      fit += 12
      strengths.push([`Related degree (${related})`, 12])
    } else if (ctx.eduLevel >= req) {
      fit += def.majors?.length ? 3 : 7
      if (ctx.bachelorMajors.length && def.majors?.length) gaps.push(`Your degree (${ctx.bachelorMajors[0]}) isn't in ${field}`)
    }
    if (ctx.eduLevel > req) fit += 4
  } else if (ctx.eduLevel >= req) {
    fit += 4
  }
  const overqualified = req <= 1 && fulltime && ctx.eduLevel >= 3
  if (overqualified) gaps.push("Overqualified: they worry you'll quit the moment something better comes along")
  if (req >= 3 && ctx.bestTier) {
    fit += TIER_FIT[ctx.bestTier]
    if (ctx.bestTier === 'Elite' || ctx.bestTier === 'Top') strengths.push([`${ctx.bestTier}-ranked school`, TIER_FIT[ctx.bestTier]])
    else if (ctx.bestTier === 'Struggling') gaps.push('Your school is ranked near the bottom')
  }

  // 4. Years in the field (or close to it).
  let sameYears = 0
  let relatedYears = 0
  for (const [ind, y] of Object.entries(ctx.years) as [JobIndustry, number][]) {
    if (ind === def.industry) sameYears += y
    else if ((INDUSTRY_TAGS[ind] ?? []).some((t) => want.includes(t))) relatedYears += y
  }
  const fieldYears = Math.round((sameYears + relatedYears * 0.6) * 10) / 10
  const expPts = Math.min(16, fieldYears * 2.5) + Math.min(5, ctx.totalYears * 0.4)
  fit += expPts
  const years = (n: number) => `${Math.round(n)} year${Math.round(n) === 1 ? '' : 's'}`
  if (sameYears >= 1) strengths.push([`${years(sameYears)} in ${field}`, Math.min(16, fieldYears * 2.5)])
  else if (fieldYears >= 1) strengths.push([`${years(relatedYears)} of related experience`, Math.min(16, fieldYears * 2.5)])
  else if (fulltime && req >= 1) gaps.push(ctx.totalYears >= 1 ? `No experience in ${field} yet` : 'No work experience yet')
  if (def.experience && ctx.totalYears >= def.experience) strengths.push([`${Math.round(ctx.totalYears)} years of work experience`, 3])

  // 5. Coding skill for tech jobs (self-taught developers count).
  if (want.includes('tech')) {
    const pts = between((ctx.coding - 25) / 4, 0, 14)
    fit += pts
    if (ctx.coding >= 50) strengths.push([`Coding skill ${ctx.coding}/100`, pts])
    else if (def.industry === 'tech' && ctx.coding < 30) gaps.push('Thin coding skills (practice on the computer at home)')
  }

  // 6. Certifications and skills in the field.
  let certs = 0
  for (const e of ctx.entries) {
    if ((e.kind === 'certification' || (e.kind === 'skill' && !e.id.startsWith('d:dev:'))) && e.tags?.some((t) => want.includes(t))) certs++
  }
  if (certs > 0) {
    fit += Math.min(9, certs * 3)
    strengths.push([certs === 1 ? 'A relevant certificate' : `${certs} relevant certificates`, Math.min(9, certs * 3)])
  }

  // 7. The local market for this industry.
  fit += (market.score - 50) * 0.06 + between((market.demand - 1) * 6, -3, 3)

  // A strong CV still counts when little of it is about this field, especially for entry-level
  // work where the manager mostly wants someone who shows up (the floor is the CV's strength for
  // this job, the number applications were screened on before job fit existed).
  fit = Math.max(fit, strength * (target.entry ? 0.95 : 0.8))
  if (overqualified) fit -= 12

  return {
    fit: Math.round(between(fit, 2, 98)),
    strengths: strengths.sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 3),
    gaps: gaps.slice(0, 3),
    relevance,
  }
}
// ---------------------------------------------------------------------------
// Screening (offline decision, background checks, plain-JSON app data)

/** How hard they look at your CV for lies. */
export function screeningThoroughness(app: ScreeningApp): number {
  if (app.kind === 'job') {
    const ind = app.job ? industryForJobDef(app.job.defId) : undefined
    const strict = ind && ['finance', 'bank', 'law', 'hospital', 'medical', 'police', 'municipal', 'university', 'science'].includes(ind)
    return strict ? 0.24 : 0.14
  }
  return app.tier === 'Elite' ? 0.22 : app.tier === 'Top' ? 0.16 : 0.1
}

function industryForJobDef(defId: string): JobIndustry | undefined {
  return ALL_JOBS.find((d) => d.id === defId)?.industry
}

/** Roll to catch one embellished entry (each fake line is checked separately). */
export function catchEmbellishment(g: GameState, rate: number): CvEntry | null {
  for (const e of embellishedEntries(g)) {
    if (chance(g, rate)) return e
  }
  return null
}

/** The consequences of being caught padding your CV (karma, happiness, a counter). */
export function caughtLying(g: GameState, e: CvEntry): void {
  addHidden(g, 'karma', -3)
  addStat(g, 'happiness', -5)
  count(g, 'cvCaught')
  g.flags.cvCaughtAge = g.character.age
  remember(g, `Caught lying on my CV ("${e.title}").`)
}

const CAUGHT_LINES = [
  'A background check found that "{title}" never happened. They were not amused.',
  'They called {org} to verify "{title}". {org} had never heard of you.',
  'Someone on the panel actually knew about "{title}". It was not you.',
  '@internet They googled "{title}". The only result was your CV.',
]

/** Why you were caught (for the rejection popup). */
export function caughtLine(g: GameState, e: CvEntry): string {
  return eraPick(g, CAUGHT_LINES)
    .replace(/\{title\}/g, e.title)
    .replace(/\{org\}/g, e.org || 'the organizer')
}

function bestEntry(g: GameState, app: ScreeningApp): CvEntry | undefined {
  const target: CvTarget = app.kind === 'job' ? { kind: 'job' } : { kind: app.kind }
  return cvEntries(g)
    .filter((e) => !e.id.startsWith('d:school') && e.kind !== 'education')
    .sort((a, b) => entryPoints(g, b, target) - entryPoints(g, a, target))[0]
}

/** Offline screening reason, in the second person. */
export function screeningReason(g: GameState, app: ScreeningApp, invite: boolean): string {
  const best = bestEntry(g, app)
  if (invite) {
    if (best) return pick(g, [`Your "${best.title}" caught their eye.`, `They liked what they saw — especially "${best.title}".`, `Someone circled "${best.title}" on your CV in red pen. In a good way.`])
    return pick(g, ['Your CV was short, but your cover letter was charming.', 'They had a slot to fill and your name sounded nice.'])
  }
  if (app.kind === 'job') {
    const market = app.market ?? ''
    const crowded = /~([\d,]+) applicants/.exec(market)
    const n = crowded ? Number(crowded[1].replace(/,/g, '')) : 0
    if (n >= 60 && chance(g, 0.6)) return `With ~${n.toLocaleString('en-US')} applicants per opening, your CV didn't make the shortlist.`
    if (app.fit < 30) return pick(g, ["Your CV didn't show enough relevant experience.", hasTech(g, 'internet') ? 'Their applicant-tracking robot rejected you in 0.4 seconds.' : 'The clerk put your application at the bottom of the pile.', 'Your CV was mostly white space and optimism.'])
    return pick(g, ['They went with someone with more relevant experience.', 'A stronger candidate applied about five minutes before you did.', 'They "decided to move forward with other candidates." Ouch.'])
  }
  if (app.fit < 30) return pick(g, ['The committee wanted to see more clubs, leadership, volunteering or projects.', 'Your grades were fine, but your CV said "spent four years on the couch."'])
  const selective = app.tier === 'Elite' || app.tier === 'Top'
  if (selective) return `Your application was solid, but ${app.org} turns away the vast majority of applicants.`
  return pick(g, ["The committee didn't think you were the right fit this year.", 'Your essay about your goldfish did not land.'])
}

/** The offline screener: roll the app's chance and explain. */
export function offlineScreen(g: GameState, app: ScreeningApp): ScreeningDecision {
  const invite = chance(g, between(app.chance, 0, 1))
  return { invite, reason: screeningReason(g, app, invite) }
}

export function appToJson(app: ScreeningApp): Json {
  const out: Record<string, Json> = { kind: app.kind, org: app.org, fit: app.fit, chance: app.chance }
  if (app.job) out.job = { defId: app.job.defId, title: app.job.title, company: app.job.company, salary: app.job.salary, category: app.job.category }
  if (app.major !== undefined) out.major = app.major
  if (app.program !== undefined) out.program = app.program
  if (app.rankLabel !== undefined) out.rankLabel = app.rankLabel
  if (app.tier !== undefined) out.tier = app.tier
  if (app.tuition !== undefined) out.tuition = app.tuition
  if (app.years !== undefined) out.years = app.years
  if (app.admit !== undefined) out.admit = app.admit
  if (app.market !== undefined) out.market = app.market
  return out
}

export function readApp(v: Json | undefined): ScreeningApp | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const kind = v.kind === 'job' || v.kind === 'university' || v.kind === 'graduate' ? v.kind : null
  if (!kind || typeof v.org !== 'string') return null
  const app: ScreeningApp = { kind, org: v.org, fit: num(v.fit, 0), chance: num(v.chance, 0.5) }
  const j = v.job
  if (j && typeof j === 'object' && !Array.isArray(j) && typeof j.defId === 'string' && typeof j.title === 'string' && typeof j.company === 'string') {
    const cat = j.category === 'parttime' || j.category === 'special' || j.category === 'military' || j.category === 'freelance' ? j.category : 'fulltime'
    app.job = { defId: j.defId, title: j.title, company: j.company, salary: num(j.salary, 0), category: cat }
  }
  if (typeof v.major === 'string') app.major = v.major
  if (typeof v.program === 'string') app.program = v.program
  if (typeof v.rankLabel === 'string') app.rankLabel = v.rankLabel
  if (typeof v.tier === 'string') app.tier = v.tier
  if (typeof v.tuition === 'number') app.tuition = v.tuition
  if (typeof v.years === 'number') app.years = v.years
  if (typeof v.admit === 'number') app.admit = v.admit
  if (typeof v.market === 'string') app.market = v.market
  return app
}

// ---------------------------------------------------------------------------
// Archiving school activities (called by education.ts when you leave a school)

/** Copy a school's clubs, roles, honor roll and Greek life to the CV before the enrollment ends. */
export function archiveSchoolCv(g: GameState, cur: Enrollment): void {
  if (cur.level === 'preschool' || cur.level === 'elementary') return
  const age = g.character.age
  const add = (e: CvEntry) => {
    if (findStored(g, (x) => x.title === e.title && x.org === e.org)) return
    addCvEntry(g, { ...e, source: 'school' })
  }
  for (const club of enrollmentClubs(cur)) {
    if (club.years < 1 && !club.role) continue
    add(clubEntry(club, cur.school, age, age, 'a'))
  }
  if (cur.grades >= 90) add({ id: '', kind: 'award', title: 'Honor Roll', org: cur.school, startAge: age, endAge: age, detail: `Grades ${Math.round(cur.grades)}%`, strength: cur.grades >= 96 ? 5 : 4, embellished: false, tags: ['academic'] })
  const greek = str(cur.data.greek)
  if (greek) add({ id: '', kind: 'activity', title: `Member, ${greek}`, org: cur.school, startAge: Math.max(0, age - cur.year), endAge: age, detail: 'Greek life', strength: 2, embellished: false, tags: ['business'] })
}

// ---------------------------------------------------------------------------
// Building your CV (the "Your CV" menu)

function blocked(g: GameState): string | null {
  if (!g.character.alive) return 'You are dead.'
  if (g.character.prison) return "You can't build your CV from a prison cell."
  return null
}

/** Local cost of supplies (online things cost the same everywhere). */
function localCost(g: GameState, usd: number): number {
  return usd <= 0 ? 0 : Math.max(5, Math.round((usd * wealth(g)) / 5) * 5)
}

/** Pay for something; kids get their parents to chip in. Returns who paid, or null (with a notice). */
function payFor(g: GameState, amount: number, what: string): 'free' | 'self' | string | null {
  if (amount <= 0) return 'free'
  const c = g.character
  if (c.money >= amount && spend(g, amount)) return 'self'
  if (c.age < 18) {
    const ps = parents(g).filter((p) => p.alive && p.money >= amount)
    if (ps.length) {
      const p = pick(g, ps)
      p.money = Math.round(p.money - amount)
      return p.gender === 'male' ? 'your dad' : 'your mom'
    }
  }
  notice(g, "Can't Afford It", `${what} costs ${formatMoney(amount)}, and you have ${formatMoney(Math.max(0, c.money))}.`, { emoji: '\u{1F4B8}', tone: 'bad' })
  return null
}

function paidLine(who: string | null, amount: number): string {
  if (!who || who === 'free') return ''
  if (who === 'self') return ` It cost you ${formatMoney(amount)}.`
  return ` ${cap(who)} paid the ${formatMoney(amount)}, with a speech about money not growing on trees.`
}

function talentBonus(g: GameState, talents: string[]): number {
  return talents.some((t) => isTalentId(t) && hasTalent(g, t)) ? 18 : 0
}

/** A purple menu hint when one of your talents gives a project or competition an edge. */
function talentEdge(g: GameState, talents: string[]): string | null {
  const t = talents.find((id): id is TalentId => isTalentId(id) && hasTalent(g, id))
  return t ? talentHint(g, t, `Your gift for ${t.toLowerCase()} gives you an edge here.`) || null : null
}

/** Time is a cost too: school and work suffer a little. */
function timeCost(g: GameState): void {
  const c = g.character
  const cur = c.education.current
  if (cur && cur.level !== 'preschool' && chance(g, 0.35)) cur.grades = Math.round(clamp(cur.grades - randInt(g, 1, 3)))
  if (c.job && c.job.category === 'fulltime' && chance(g, 0.35)) c.job.performance = Math.round(clamp(c.job.performance - randInt(g, 1, 3)))
}

// Projects ------------------------------------------------------------------

interface ProjectDef {
  id: string
  label: string
  /** First-person log fragment: 'built an app'. */
  done: string
  emoji: string
  minAge: number
  maxAge?: number
  /** Supplies in US dollars (scaled to local prices); 0 = free. */
  cost: number
  online?: boolean
  tags: string[]
  talents: string[]
  /** Base quality 0-100 from stats. */
  base: (g: GameState) => number
  /** Title, org and detail for a project of this quality. */
  make: (g: GameState, q: number) => { title: string; org: string; detail: string }
  flops: string[]
  /** Extra text for a great result. */
  great?: string
}

const APP_NAMES = ['Snackr', 'StudyBuddy', 'PlantPal', 'BudgetBee', 'Hoppr', 'QuietHour', 'Splitzy', 'NapTime', 'Choremate', 'Bussin']
const APP_KINDS = ['budgeting', 'homework-planner', 'plant-watering', 'carpool', 'recipe', 'bus-tracking', 'flashcard', 'habit-tracking']

function popularity(q: number, units: [string, string, string]): string {
  return q >= 88 ? units[0] : q >= 65 ? units[1] : units[2]
}

const PROJECTS: ProjectDef[] = [
  {
    id: 'app',
    done: 'built an app',
    label: 'Build an App',
    emoji: '\u{1F4F1}',
    minAge: 12,
    cost: 0,
    online: true,
    tags: ['tech'],
    talents: ['Programming'],
    base: (g) => g.character.stats.smarts * 0.6 + g.character.hidden.discipline * 0.4,
    make: (g, q) => ({
      title: `Built "${pick(g, APP_NAMES)}", a ${pick(g, APP_KINDS)} app`,
      org: 'Personal project',
      detail: popularity(q, ['50,000+ downloads and a write-up on a tech blog', `${randInt(g, 900, 9000).toLocaleString('en-US')} downloads`, `${randInt(g, 12, 80)} downloads (mostly relatives)`]),
    }),
    flops: ['Your app crashed every time someone opened it. Including you.', 'You spent four months picking a font and never wrote a line of code.'],
    great: 'A tech blog called it "weirdly useful."',
  },
  {
    id: 'research',
    done: 'wrote a research paper',
    label: 'Write a Research Paper',
    emoji: '\u{1F52C}',
    minAge: 14,
    cost: 0,
    tags: ['science', 'academic'],
    talents: ['Academics'],
    base: (g) => g.character.stats.smarts * 0.8 + g.character.hidden.discipline * 0.2,
    make: (g, q) => ({
      title: `Research paper: ${pick(g, ['the effect of music on plant growth', 'sleep and test scores', g.year >= 2004 ? 'microplastics in tap water' : 'particles in tap water', 'why cats knock things over', 'traffic patterns in ' + g.character.city, 'the economics of school lunches'])}`,
      org: g.character.education.current?.school ?? 'Independent research',
      detail: popularity(q, [g.character.age >= 22 ? 'Published in a peer-reviewed journal' : 'Published in a national student journal', 'Presented at a student conference', 'Read by your teacher (and, reluctantly, your mom)']),
    }),
    flops: ['Your "research" turned out to be one encyclopedia article and a lot of confidence.', 'Your data got eaten by the dog. Literally: it was on paper.'],
    great: 'A real scientist emailed you about it.',
  },
  {
    id: 'portfolio',
    done: 'put together an art portfolio',
    label: 'Build an Art Portfolio',
    emoji: '\u{1F3A8}',
    minAge: 12,
    cost: 150,
    tags: ['arts'],
    talents: ['Art'],
    base: (g) => 35 + g.character.hidden.discipline * 0.3 + g.character.stats.smarts * 0.15,
    make: (g, q) => ({
      title: `Art portfolio: ${pick(g, ['portraits of strangers', 'ink drawings of ' + g.character.city, 'watercolor landscapes', 'surreal self-portraits', 'comic strips about school'])}`,
      org: 'Personal portfolio',
      detail: popularity(q, ['Exhibited at a local gallery', 'Twelve finished pieces', 'Five pieces and a lot of eraser crumbs']),
    }),
    flops: ['Everything you painted came out looking like a sad potato.', 'You spilled water on the whole portfolio the night before you finished.'],
    great: 'A gallery owner asked if any pieces were for sale.',
  },
  {
    id: 'film',
    done: 'made a short film',
    label: 'Make a Short Film',
    emoji: '\u{1F3AC}',
    minAge: 13,
    cost: 400,
    tags: ['arts', 'media'],
    talents: ['Acting', 'Comedy', 'Writing'],
    base: (g) => 25 + g.character.stats.smarts * 0.3 + g.character.hidden.discipline * 0.25 + g.character.stats.looks * 0.1,
    make: (g, q) => ({
      title: `Short film: "${pick(g, ['The Last Bus', 'Leftovers', 'Static', hasTech(g, 'internet') && g.year >= 2000 ? 'Grandma vs. the Wi-Fi' : 'Grandma vs. the Postman', 'Night Shift', 'Paper Planes'])}"`,
      org: 'Writer & director',
      detail: popularity(q, [fillLocal(g, 'Screened at the {city} Film Festival'), hasTech(g, 'videoSharing') ? `${randInt(g, 2, 40)}K views online` : `${randInt(g, 2, 40)} screenings at local clubs`, 'Watched by the cast, twice']),
    }),
    flops: ['Your lead actor quit halfway through filming to go to a birthday party.', 'You forgot to press record. For the whole shoot.'],
    great: 'It won the audience award.',
  },
  {
    id: 'sciencefair',
    done: 'entered the science fair',
    label: 'Science Fair Project',
    emoji: '\u{1F9EA}',
    minAge: 12,
    maxAge: 18,
    cost: 60,
    tags: ['science'],
    talents: ['Academics'],
    base: (g) => g.character.stats.smarts * 0.7 + g.character.hidden.discipline * 0.3,
    make: (g, q) => ({
      title: `Science fair: ${pick(g, [hasTech(g, 'mobilePhone') ? 'a potato battery that charges a phone' : 'a potato battery that lights a bulb', 'testing which soda dissolves a tooth fastest', 'a homemade water filter', 'a solar oven', 'teaching mold to grow in shapes'])}`,
      org: g.character.education.current?.school ?? 'Regional science fair',
      detail: popularity(q, ['1st place, regional science fair', 'Honorable mention', 'Participation ribbon']),
    }),
    flops: ['Your volcano erupted early, on the judge.', 'Your baking-soda experiment was disqualified for "excessive foam."'],
    great: 'You took first place at the regional science fair!',
  },
  {
    id: 'opensource',
    done: 'contributed to an open-source project',
    label: 'Contribute to Open Source',
    emoji: '\u{1F4BB}',
    minAge: 14,
    cost: 0,
    online: true,
    tags: ['tech'],
    talents: ['Programming'],
    base: (g) => g.character.stats.smarts * 0.7 + g.character.hidden.discipline * 0.3,
    make: (g, q) => ({
      title: `Open-source contributor to ${pick(g, ['a popular web framework', hasTech(g, 'smartphone') ? 'a map app' : 'a mapping tool', 'a game engine', 'a translation tool', 'a privacy browser extension'])}`,
      org: 'Open source',
      detail: popularity(q, ['Became a core maintainer', `${randInt(g, 5, 30)} merged pull requests`, 'One merged typo fix']),
    }),
    flops: ['Your pull request was rejected with a single word: "no."', 'You broke the build for 40,000 people. They know your username now.'],
  },
  {
    id: 'channel',
    done: 'started a channel',
    label: 'Start a Blog or Channel',
    emoji: '\u{1F4F9}',
    minAge: 12,
    cost: 0,
    online: true,
    tags: ['media', 'writing'],
    talents: ['Comedy', 'Writing', 'Modeling', 'Music', 'Gaming'],
    base: (g) => 25 + g.character.stats.looks * 0.25 + g.character.stats.smarts * 0.2 + g.character.hidden.craziness * 0.2,
    make: (g, q) => ({
      title: `Started a ${pick(g, ['cooking', 'study-tips', 'gaming', 'book review', 'local history', 'sneaker'])} ${pick(g, ['channel', 'blog', 'podcast'])}`,
      org: 'Creator',
      detail: popularity(q, [`${randInt(g, 20, 90)}K subscribers`, `${randInt(g, 300, 5000).toLocaleString('en-US')} subscribers`, `${randInt(g, 3, 40)} subscribers, two of them bots`]),
    }),
    flops: ['Your first video got one view. You watched it to check the audio.', 'Your channel was flagged for using a song you hummed yourself.'],
    great: 'One of your posts went viral!',
  },
  {
    id: 'community',
    done: 'organized a community project',
    label: 'Organize a Community Project',
    emoji: '\u{1F3D8}\u{FE0F}',
    minAge: 13,
    cost: 100,
    tags: ['service'],
    talents: ['Leadership'],
    base: (g) => 20 + g.character.hidden.discipline * 0.35 + g.character.stats.smarts * 0.2 + g.character.hidden.karma * 0.2,
    make: (g, q) => ({
      title: fillLocal(g, pick(g, ['Organized a cleanup at {hangout}', 'Started a book swap in {city}', 'Ran a {holiday} food drive', 'Painted a mural near {hangout}', 'Set up free study sessions in {place}'])),
      org: g.character.city,
      detail: popularity(q, ['Covered by the local news', `${randInt(g, 30, 200)} people took part`, `${randInt(g, 2, 6)} people showed up (one was your mom)`]),
    }),
    flops: ['It rained, nobody came, and the permit cost more than the snacks.', 'The neighborhood association shut it down over "noise." There was no noise.'],
    great: 'The mayor showed up for a photo.',
  },
  {
    id: 'robotics',
    done: 'built a robot',
    label: 'Build a Robot',
    emoji: '\u{1F916}',
    minAge: 12,
    maxAge: 24,
    cost: 300,
    tags: ['tech', 'science'],
    talents: ['Programming'],
    base: (g) => g.character.stats.smarts * 0.65 + g.character.hidden.discipline * 0.35,
    make: (g, q) => ({
      title: `Built a ${pick(g, ['line-following', 'trash-sorting', 'plant-watering', 'sumo-wrestling', 'stair-climbing'])} robot`,
      org: 'Robotics project',
      detail: popularity(q, ['Regional robotics champion', 'Made it to the regional finals', 'It mostly spun in circles']),
    }),
    flops: ['Your robot caught fire. Briefly, but memorably.', 'Your robot achieved sentience and immediately fell down the stairs.'],
  },
  {
    id: 'businessplan',
    done: 'wrote a business plan',
    label: 'Write a Business Plan',
    emoji: '\u{1F4C8}',
    minAge: 15,
    cost: 0,
    tags: ['business'],
    talents: ['Business', 'Investing'],
    base: (g) => g.character.stats.smarts * 0.55 + g.character.hidden.discipline * 0.25 + g.character.hidden.willpower * 0.2,
    make: (g, q) => ({
      title: `Business plan: ${pick(g, [hasTech(g, 'smartphone') ? 'a dog-walking app' : 'a dog-walking service', 'subscription socks', 'a late-night study café', g.year >= 2015 ? 'electric scooter repair' : 'bicycle repair', 'meal-prep for students'])}`,
      org: 'Personal project',
      detail: popularity(q, ['Shortlisted by a startup incubator', hasTech(g, 'homeComputer') ? 'Forty pages with real spreadsheets' : 'Forty pages with real accounts', 'A napkin, but a detailed one']),
    }),
    flops: ['Your financial projections assumed every human on Earth would buy one.', 'You realized halfway through that your idea already exists. And is free.'],
  },
  {
    id: 'book',
    done: 'wrote a book',
    label: 'Write a Book',
    emoji: '\u{1F4DA}',
    minAge: 14,
    cost: 0,
    tags: ['writing', 'arts'],
    talents: ['Writing'],
    base: (g) => 25 + g.character.stats.smarts * 0.35 + g.character.hidden.discipline * 0.3,
    make: (g, q) => ({
      title: `Wrote "${pick(g, ['The Quiet Year', 'Salt and Static', 'Everybody Lies at Dinner', 'Small Gods of ' + g.character.city, 'The Lunch Line'])}"`,
      org: 'Author',
      detail: popularity(q, ['Picked up by a small publisher', `Self-published, ${randInt(g, 300, 3000).toLocaleString('en-US')} copies sold`, 'Read by three friends, one of whom finished it']),
    }),
    flops: ['You wrote the first sentence 200 times and then took a nap.', '@homeComputer,1990 Your laptop died and took chapter one through nine with it.'],
  },
  {
    id: 'music',
    done: 'recorded an EP',
    label: 'Record an EP',
    emoji: '\u{1F3B5}',
    minAge: 13,
    cost: 300,
    tags: ['music', 'arts'],
    talents: ['Music'],
    base: (g) => 25 + g.character.hidden.discipline * 0.35 + g.character.stats.smarts * 0.15 + g.character.stats.looks * 0.1,
    make: (g, q) => ({
      title: `Recorded the EP "${pick(g, ['Bedroom Tapes', 'Late Bus Home', 'Static Hearts', 'Neighbors Complained', 'Lo-Fi Homework'])}"`,
      org: 'Independent musician',
      detail: popularity(q, [hasTech(g, 'radio') ? 'Played on local radio' : 'Played at local music halls', hasTech(g, 'streaming') ? `${randInt(g, 2, 50)}K streams` : `${randInt(g, 2, 50)} local performances`, hasTech(g, 'streaming') ? `${randInt(g, 8, 90)} streams` : `${randInt(g, 8, 90)} listeners`]),
    }),
    flops: ['The neighbors called the police twice during recording.', 'You recorded the whole EP with the microphone unplugged.'],
  },
]

function projectAvailable(g: GameState, def: ProjectDef): boolean {
  if (def.id === 'app') return hasTech(g, 'smartphone') && hasTech(g, 'internet')
  if (def.id === 'opensource') return hasTech(g, 'internet')
  if (def.id === 'channel') return hasTech(g, 'videoSharing')
  if (def.id === 'robotics') return hasTech(g, 'homeComputer')
  return true
}

function doProject(g: GameState, def: ProjectDef): void {
  const c = g.character
  if (blocked(g) || !projectAvailable(g, def)) return
  if (!useYearAction(g, 'cv.project', 2)) {
    notice(g, 'Projects', "You've already started two projects this year. Even geniuses need to sleep.", { emoji: def.emoji })
    return
  }
  const cost = def.online ? def.cost : localCost(g, def.cost)
  const who = payFor(g, cost, `The ${def.label.toLowerCase()} project`)
  if (!who) {
    g.yearActions['cv.project'] = Math.max(0, (g.yearActions['cv.project'] ?? 1) - 1)
    return
  }
  timeCost(g)
  addStat(g, 'happiness', -randInt(g, 0, 2))
  const q = Math.round(def.base(g) + talentBonus(g, def.talents) + randInt(g, -25, 25))
  count(g, 'cvProjects')
  if (q < 35) {
    addStat(g, 'happiness', -randInt(g, 2, 5))
    log(g, `I tried to ${def.label.toLowerCase()}. It flopped.`, 'bad')
    notice(g, 'It Flopped', `${eraPick(g, def.flops)}${paidLine(who, cost)} Nothing to put on your CV this time.`, { emoji: def.emoji, tone: 'bad' })
    return
  }
  const made = def.make(g, q)
  const strength = between(Math.round(q / 11), 2, 9)
  addCvEntry(g, { kind: 'project', title: made.title, org: made.org, startAge: c.age, endAge: c.age, detail: made.detail, strength, tags: def.tags, source: 'built' })
  addStat(g, 'happiness', randInt(g, 2, 6))
  addStat(g, 'smarts', q >= 70 ? randInt(g, 1, 2) : 0)
  addHidden(g, 'discipline', 1)
  let extra = ''
  if (q >= 88) {
    if (def.great) extra = ` ${def.id === 'research' && !hasTech(g, 'internet') ? 'A real scientist wrote to you about it.' : def.great}`
    if (def.id === 'channel') addHidden(g, 'fame', randInt(g, 1, 4))
    if (def.id === 'sciencefair' || def.id === 'robotics') {
      addCvEntry(g, { kind: 'award', title: def.id === 'robotics' ? 'Regional Robotics Champion' : '1st Place, Regional Science Fair', org: '', startAge: c.age, endAge: c.age, detail: 'Beat every other team in the region', strength: 6, tags: def.tags, source: 'built' })
    }
    remember(g, `${made.title} (${made.detail}).`)
  }
  log(g, `I ${def.done} (${made.detail.charAt(0).toLowerCase()}${made.detail.slice(1)}).`, 'good')
  const verdict = q >= 88 ? 'It was a hit!' : q >= 65 ? 'It turned out well.' : 'It turned out... fine. Fine counts.'
  notice(g, def.label, `${verdict} ${made.title} — ${made.detail}.${extra}${paidLine(who, cost)}\n\nAdded to your CV (strength ${strength}/10).`, { emoji: def.emoji, tone: 'good' })
}

// Volunteering --------------------------------------------------------------

interface VolunteerDef {
  id: string
  label: string
  emoji: string
  minAge: number
  org: string
  tags: string[]
  good: string[]
  bad: string[]
}

const VOLUNTEERING: VolunteerDef[] = [
  { id: 'foodbank', label: 'Food Bank', emoji: '\u{1F96B}', minAge: 12, org: '{city} Food Bank', tags: ['service', 'hospitality'], good: ['You packed 600 meals and only dropped one can of beans on your foot.', 'A regular told you you have a kind face. You do.'], bad: ['You spent eight hours sorting expired yogurt. The smell will follow you to your grave.'] },
  { id: 'shelter', label: 'Animal Shelter', emoji: '\u{1F436}', minAge: 12, org: '{city} Animal Shelter', tags: ['animals', 'service'], good: ['A three-legged dog chose you as its person for the day.', 'You helped a very old cat get adopted. Everyone cried.'], bad: ['A goose bit you. Nobody knows why there was a goose.'] },
  { id: 'hospital', label: 'Hospital Volunteer', emoji: '\u{1F3E5}', minAge: 15, org: '{city} General Hospital', tags: ['health', 'service'], good: ['You pushed wheelchairs, delivered flowers and learned where they hide the good pudding.', 'A patient taught you to play chess. Badly, but enthusiastically.'], bad: ['You got lost in the basement for two hours and found the morgue. Accidentally.'] },
  { id: 'tutoring', label: 'Tutor Kids', emoji: '\u{1F4DA}', minAge: 13, org: '{place} Community Center', tags: ['education', 'service'], good: ['A kid finally understood long division. You felt like a wizard.', 'Your students made you a thank-you card. It was mostly glitter.'], bad: ['A nine-year-old corrected your math. They were right.'] },
  { id: 'cleanup', label: 'Environmental Cleanup', emoji: '\u{1F333}', minAge: 12, org: 'Clean-up crew at {landmark}', tags: ['service', 'science'], good: ['You hauled out 40 bags of trash and one surprisingly nice chair.', 'You planted twenty trees. Future you thanks you.'], bad: ['You got the worst sunburn of your life.'] },
  { id: 'elder', label: 'Elder Care Home', emoji: '\u{1F475}', minAge: 13, org: '{place} Senior Home', tags: ['health', 'service'], good: ['You lost at bingo to a 94-year-old who trash-talked the whole time.', 'A resident told you about her first love. It was a lot.'], bad: ['Someone mistook you for their nephew and wrote you out of their will.'] },
  { id: 'festival', label: 'Festival Volunteer', emoji: '\u{1F389}', minAge: 14, org: '{holiday} celebrations in {city}', tags: ['service', 'hospitality'], good: ['You directed crowds, handed out water and got free food all day.', 'You helped a lost kid find their parents and became a local hero for ten minutes.'], bad: ['You were assigned to the portable toilets. All day.'] },
  { id: 'refugee', label: 'Refugee Aid Center', emoji: '\u{1F91D}', minAge: 15, org: '{city} Refugee Aid Center', tags: ['service', 'language'], good: ['You helped a family fill out forms and they invited you to dinner.', 'You taught basic phrases and learned three new ones yourself.'], bad: ['The paperwork was so confusing you needed a volunteer yourself.'] },
  { id: 'disaster', label: 'Disaster Relief', emoji: '\u{26D1}\u{FE0F}', minAge: 16, org: 'Disaster relief in {city}', tags: ['service', 'health'], good: ['You filled sandbags for twelve hours straight. Your arms filed a complaint.', 'You helped rebuild a roof. It is, miraculously, still standing.'], bad: ['You twisted your ankle on the first day and spent the rest handing out clipboards.'] },
]

function volunteer(g: GameState, def: VolunteerDef): void {
  const c = g.character
  if (blocked(g)) return
  if (!useYearAction(g, 'cv.volunteer', 2)) {
    notice(g, 'Volunteering', "You've already volunteered twice this year. Save some good deeds for next year.", { emoji: def.emoji })
    return
  }
  timeCost(g)
  count(g, 'volunteered')
  addHidden(g, 'karma', randInt(g, 2, 4))
  const good = chance(g, 0.8)
  addStat(g, 'happiness', good ? randInt(g, 2, 5) : -randInt(g, 1, 3))
  if (!good && def.id === 'disaster') addStat(g, 'health', -randInt(g, 2, 5))
  const source = `volunteer:${def.id}`
  let entry = findStored(g, (e) => e.source === source)
  if (entry) {
    entry.endAge = c.age
    const years = c.age - entry.startAge + 1
    entry.detail = `${years <= 1 ? 'This year' : `${years} years`} • ${(num(entry.strength, 2) + 1) * 15}+ hours`
    entry.strength = between(entry.strength + 1, 1, 7)
  } else {
    entry = addCvEntry(g, { kind: 'volunteering', title: `Volunteer, ${def.label}`, org: fillLocal(g, def.org), startAge: c.age, endAge: c.age, detail: `${randInt(g, 20, 40)} hours`, strength: 2, tags: def.tags, source })
  }
  log(g, `I volunteered at ${entry.org}.`, 'good')
  notice(g, 'Volunteering', `You volunteered at ${entry.org}. ${pick(g, good ? def.good : def.bad)}\n\nCV: ${entry.title} (strength ${entry.strength}/10).`, { emoji: def.emoji, tone: good ? 'good' : 'neutral' })
}

// Courses -------------------------------------------------------------------

interface CourseDef {
  id: string
  label: string
  emoji: string
  minAge: number
  /** US dollars (online: same price everywhere). */
  cost: number
  difficulty: number
  tags: string[]
}

const COURSES: CourseDef[] = [
  { id: 'programming', label: 'Intro to Programming', emoji: '\u{1F4BB}', minAge: 12, cost: 0, difficulty: 40, tags: ['tech'] },
  { id: 'firstaid', label: 'First Aid & CPR', emoji: '\u{1FA79}', minAge: 12, cost: 80, difficulty: 25, tags: ['health', 'service'] },
  { id: 'design', label: 'Graphic Design', emoji: '\u{1F3A8}', minAge: 13, cost: 150, difficulty: 40, tags: ['arts', 'tech'] },
  { id: 'spreadsheets', label: 'Spreadsheet Wizardry', emoji: '\u{1F4C8}', minAge: 14, cost: 50, difficulty: 30, tags: ['business', 'finance'] },
  { id: 'marketing', label: 'Digital Marketing', emoji: '\u{1F4E3}', minAge: 15, cost: 150, difficulty: 40, tags: ['business', 'media'] },
  { id: 'hygiene', label: 'Food Hygiene Certificate', emoji: '\u{1F373}', minAge: 15, cost: 60, difficulty: 20, tags: ['hospitality'] },
  { id: 'data', label: 'Data Science Certificate', emoji: '\u{1F4CA}', minAge: 16, cost: 300, difficulty: 60, tags: ['tech', 'science'] },
  { id: 'accounting', label: 'Bookkeeping & Accounting', emoji: '\u{1F9EE}', minAge: 16, cost: 200, difficulty: 50, tags: ['finance', 'business'] },
  { id: 'safety', label: 'Workplace Safety Certificate', emoji: '\u{1F9BA}', minAge: 16, cost: 100, difficulty: 25, tags: ['trades'] },
  { id: 'cloud', label: 'Cloud Computing Certification', emoji: '\u{2601}\u{FE0F}', minAge: 17, cost: 400, difficulty: 65, tags: ['tech'] },
  { id: 'tefl', label: 'Teaching English (TEFL)', emoji: '\u{1F34E}', minAge: 18, cost: 250, difficulty: 40, tags: ['education', 'language'] },
  { id: 'pm', label: 'Project Management Certification', emoji: '\u{1F4CB}', minAge: 20, cost: 600, difficulty: 60, tags: ['business'] },
]

const COURSE_FAILS = [
  'You watched two of the forty videos at 2x speed and called it a day.',
  'You fell asleep during the final exam. The proctor let you.',
  'You failed the final by one point. You will think about that point forever.',
]

function takeCourse(g: GameState, def: CourseDef): void {
  const c = g.character
  if (blocked(g)) return
  const title = `Certificate: ${def.label}`
  if (findStored(g, (e) => e.title === title)) {
    notice(g, def.label, 'You already have this certificate. Framing it twice does not count.', { emoji: def.emoji })
    return
  }
  if (!useYearAction(g, 'cv.course', 2)) {
    notice(g, 'Courses', "You've taken two courses this year. Your brain is full.", { emoji: def.emoji })
    return
  }
  const who = payFor(g, def.cost, def.label)
  if (!who) {
    g.yearActions['cv.course'] = Math.max(0, (g.yearActions['cv.course'] ?? 1) - 1)
    return
  }
  timeCost(g)
  const p = between((c.stats.smarts * 0.6 + c.hidden.discipline * 0.4 - def.difficulty) / 40 + 0.6, 0.12, 0.96)
  if (!chance(g, p)) {
    addStat(g, 'happiness', -randInt(g, 1, 4))
    log(g, `I failed the ${def.label} course.`, 'bad')
    notice(g, 'Course Failed', `${pick(g, COURSE_FAILS)}${paidLine(who, def.cost)}`, { emoji: def.emoji, tone: 'bad' })
    return
  }
  const strength = between(1 + Math.round(def.difficulty / 15) + (chance(g, 0.3) ? 1 : 0), 2, 6)
  addCvEntry(g, { kind: 'certification', title, org: def.cost > 0 ? 'Online academy' : 'Free online course', startAge: c.age, endAge: c.age, detail: def.difficulty >= 55 ? 'Passed a proctored exam' : 'Completed with a passing grade', strength, tags: def.tags, source: 'built' })
  addStat(g, 'smarts', randInt(g, 1, 3))
  count(g, 'cvCourses')
  log(g, `I earned a certificate in ${def.label}.`, 'good')
  notice(g, 'Certified!', `You passed ${def.label}!${paidLine(who, def.cost)}\n\nAdded to your CV (strength ${strength}/10).`, { emoji: def.emoji, tone: 'good' })
}

// Competitions --------------------------------------------------------------

interface CompetitionDef {
  id: string
  label: string
  emoji: string
  minAge: number
  maxAge?: number
  fee: number
  tags: string[]
  talents: string[]
  name: (g: GameState) => string
  skill: (g: GameState) => number
}

const COMPETITIONS: CompetitionDef[] = [
  { id: 'math', label: 'Math Olympiad', emoji: '\u{1F9EE}', minAge: 12, maxAge: 19, fee: 0, tags: ['science', 'academic'], talents: ['Academics'], name: (g) => `the ${getCountry(g.character.countryId).name} Mathematical Olympiad`, skill: (g) => g.character.stats.smarts },
  { id: 'science', label: 'Science Olympiad', emoji: '\u{1F52D}', minAge: 12, maxAge: 19, fee: 0, tags: ['science'], talents: ['Academics'], name: (g) => `the ${getCountry(g.character.countryId).name} Science Olympiad`, skill: (g) => g.character.stats.smarts * 0.9 + g.character.hidden.discipline * 0.1 },
  { id: 'spelling', label: 'Spelling Bee', emoji: '\u{1F41D}', minAge: 12, maxAge: 15, fee: 0, tags: ['academic', 'language'], talents: ['Academics', 'Writing'], name: (g) => `the ${g.character.city} Spelling Bee`, skill: (g) => g.character.stats.smarts * 0.85 + g.character.hidden.discipline * 0.15 },
  { id: 'debate', label: 'Debate Tournament', emoji: '\u{1F3A4}', minAge: 12, fee: 20, tags: ['law', 'government', 'writing'], talents: ['Comedy', 'Acting', 'Leadership'], name: (g) => (g.character.age <= 19 ? `the ${getCountry(g.character.countryId).name} Schools Debating Championship` : `the ${g.character.city} Open Debate`), skill: (g) => g.character.stats.smarts * 0.6 + g.character.stats.looks * 0.15 + g.character.hidden.willpower * 0.25 },
  { id: 'essay', label: 'Essay Contest', emoji: '\u{270D}\u{FE0F}', minAge: 12, fee: 0, tags: ['writing'], talents: ['Writing'], name: (g) => `the ${getCountry(g.character.countryId).name} Young Writers Prize`, skill: (g) => g.character.stats.smarts * 0.75 + g.character.hidden.discipline * 0.25 },
  { id: 'art', label: 'Art Contest', emoji: '\u{1F3A8}', minAge: 12, fee: 20, tags: ['arts'], talents: ['Art'], name: (g) => `the ${g.character.city} Young Artists Contest`, skill: (g) => 35 + g.character.hidden.discipline * 0.3 + g.character.stats.smarts * 0.1 },
  { id: 'music', label: 'Music Competition', emoji: '\u{1F3BB}', minAge: 12, fee: 30, tags: ['music', 'arts'], talents: ['Music'], name: (g) => `the ${getCountry(g.character.countryId).name} Young Musicians Competition`, skill: (g) => 35 + g.character.hidden.discipline * 0.35 },
  { id: 'robotics', label: 'Robotics Competition', emoji: '\u{1F916}', minAge: 12, maxAge: 24, fee: 50, tags: ['tech', 'science'], talents: ['Programming'], name: (g) => `the ${getCountry(g.character.countryId).name} Robotics Challenge`, skill: (g) => g.character.stats.smarts * 0.7 + g.character.hidden.discipline * 0.3 },
  { id: 'hackathon', label: 'Hackathon', emoji: '\u{1F4BB}', minAge: 14, fee: 0, tags: ['tech'], talents: ['Programming'], name: (g) => `the ${g.character.city} Hackathon`, skill: (g) => g.character.stats.smarts * 0.7 + g.character.hidden.discipline * 0.3 },
  { id: 'pitch', label: 'Startup Pitch Competition', emoji: '\u{1F4A1}', minAge: 16, fee: 50, tags: ['business'], talents: ['Business', 'Comedy', 'Acting'], name: (g) => `the ${g.character.city} Startup Pitch Night`, skill: (g) => g.character.stats.smarts * 0.5 + g.character.stats.looks * 0.25 + g.character.hidden.willpower * 0.25 },
]

const PLACE_LINES: Record<string, string[]> = {
  none: ['You placed {n}th out of {m}. The last place guy didn\'t show up.', 'You made it to the second round, then blanked on everything you have ever known.', 'You were eliminated in round one. You blame the microphone.'],
}

function enterCompetition(g: GameState, def: CompetitionDef): void {
  const c = g.character
  if (blocked(g)) return
  if (!useYearAction(g, 'cv.competition', 2)) {
    notice(g, 'Competitions', "You've already entered two competitions this year. Leave some trophies for the rest of us.", { emoji: def.emoji })
    return
  }
  const fee = localCost(g, def.fee)
  const who = payFor(g, fee, `The entry fee for the ${def.label.toLowerCase()}`)
  if (!who) {
    g.yearActions['cv.competition'] = Math.max(0, (g.yearActions['cv.competition'] ?? 1) - 1)
    return
  }
  timeCost(g)
  const name = def.name(g)
  const score = def.skill(g) + talentBonus(g, def.talents) + randInt(g, -30, 30)
  count(g, 'competitions')
  const place = score >= 108 ? 'national' : score >= 94 ? 'first' : score >= 82 ? 'second' : score >= 72 ? 'third' : score >= 60 ? 'finalist' : 'none'
  if (place === 'none') {
    addStat(g, 'happiness', -randInt(g, 2, 5))
    const m = randInt(g, 30, 200)
    log(g, `I competed in ${name} and didn't place.`, 'bad')
    notice(g, def.label, `${pick(g, PLACE_LINES.none).replace('{n}', String(m - 1)).replace('{m}', String(m))}${paidLine(who, fee)}`, { emoji: def.emoji, tone: 'bad' })
    return
  }
  const meta: Record<string, [string, number, number]> = {
    national: ['National Champion', 9, 1500],
    first: ['1st Place', 7, 400],
    second: ['2nd Place', 6, 150],
    third: ['3rd Place', 5, 0],
    finalist: ['Finalist', 3, 0],
  }
  const [title, strength, prizeUsd] = meta[place]
  const prize = prizeUsd > 0 ? localCost(g, prizeUsd) : 0
  if (prize > 0) earnIncome(g, prize)
  addCvEntry(g, { kind: 'award', title: `${title}, ${def.label}`, org: name.replace(/^the /, ''), startAge: c.age, endAge: c.age, detail: place === 'national' ? 'Best in the country' : place === 'finalist' ? 'Made the final round' : 'Podium finish', strength, tags: def.tags, source: 'built' })
  addStat(g, 'happiness', randInt(g, 3, 8))
  if (place === 'national' || place === 'first') {
    addHidden(g, 'fame', place === 'national' ? randInt(g, 2, 5) : 1)
    remember(g, `Won ${title.toLowerCase()} at ${name}.`)
  }
  log(g, `I ${place === 'finalist' ? 'made the final of' : `took ${title.toLowerCase()} at`} ${name}.`, 'good')
  const hype = place === 'national' ? 'You are the best in the country! Your parents bought a trophy cabinet.' : place === 'first' ? 'You won! The trophy is ugly and you love it.' : place === 'finalist' ? 'You made the final. Not a medal, but very CV-able.' : `You placed ${title.toLowerCase()}!`
  notice(g, def.label, `You competed in ${name}. ${hype}${prize > 0 ? ` Prize money: ${formatMoney(prize)}.` : ''}${paidLine(who, fee)}\n\nAdded to your CV (strength ${strength}/10).`, { emoji: '\u{1F3C6}', tone: 'good' })
}

// Languages -----------------------------------------------------------------

const LANGUAGES = ['English', 'Spanish', 'French', 'Mandarin', 'Arabic', 'Hindi', 'Portuguese', 'Japanese', 'German', 'Korean', 'Russian', 'Italian', 'Indonesian', 'Swahili', 'Turkish']
const LANGUAGE_LEVELS = ['Beginner', 'Elementary', 'Conversational', 'Fluent']
const LANGUAGE_STRENGTH = [2, 3, 4, 6]

function learnLanguage(g: GameState, language: string): void {
  const c = g.character
  if (blocked(g)) return
  const source = `language:${language}`
  const entry = findStored(g, (e) => e.source === source)
  const level = entry ? Math.max(0, LANGUAGE_LEVELS.findIndex((l) => entry.title.endsWith(`(${l})`))) : -1
  if (level >= LANGUAGE_LEVELS.length - 1) {
    notice(g, language, `You're already fluent in ${language}. Show-off.`, { emoji: '\u{1F5E3}\u{FE0F}' })
    return
  }
  if (!useYearAction(g, 'cv.language', 1)) {
    notice(g, 'Languages', "You've already had your language lessons this year. Practice by ordering food.", { emoji: '\u{1F5E3}\u{FE0F}' })
    return
  }
  const cost = localCost(g, 150)
  const who = payFor(g, cost, `A year of ${language} lessons`)
  if (!who) {
    g.yearActions['cv.language'] = 0
    return
  }
  timeCost(g)
  // Main Character Syndrome: the first lesson in a language is already fluency.
  const main = hasMainCharacter(g)
  if (main) masterFirstTime(g, `language.${language}`, 'language', language, { popup: false })
  const step = main ? LANGUAGE_LEVELS.length : c.stats.smarts >= 70 && chance(g, 0.4) ? 2 : chance(g, 0.85) ? 1 : 0
  if (step === 0) {
    notice(g, language, `You spent a year on ${language} lessons and can now say "the cat is under the table." That's it.${paidLine(who, cost)}`, { emoji: '\u{1F5E3}\u{FE0F}' })
    return
  }
  const next = Math.min(LANGUAGE_LEVELS.length - 1, level + step)
  const title = `${language} (${LANGUAGE_LEVELS[next]})`
  if (entry) {
    entry.title = title
    entry.strength = LANGUAGE_STRENGTH[next]
    entry.endAge = c.age
    entry.detail = `Studied for ${c.age - entry.startAge + 1} years`
  } else {
    addCvEntry(g, { kind: 'skill', title, org: '', startAge: c.age, endAge: c.age, detail: 'Lessons and an app that guilt-trips you daily', strength: LANGUAGE_STRENGTH[next], tags: ['language'], source })
  }
  addStat(g, 'smarts', 1)
  log(g, `My ${language} reached ${LANGUAGE_LEVELS[next].toLowerCase()} level.`, 'good')
  notice(g, language, `Your ${language} is now ${LANGUAGE_LEVELS[next].toLowerCase()}!${next === 3 ? ' You can now argue with strangers in two languages.' : ''}${paidLine(who, cost)}`, { emoji: '\u{1F5E3}\u{FE0F}', tone: 'good' })
}

// Internships ---------------------------------------------------------------

interface InternshipDef {
  id: string
  label: string
  emoji: string
  tags: string[]
  orgs: string[]
  tasks: string[]
}

const INTERNSHIPS: InternshipDef[] = [
  { id: 'tech', label: 'Tech Startup', emoji: '\u{1F4BB}', tags: ['tech'], orgs: ['{word} Labs', '{word}ly', '{city} Code Works'], tasks: ['fixed bugs nobody else wanted to touch', 'wrote tests for code that had none', '@2005 refilled the kombucha tap'] },
  { id: 'finance', label: 'Bank or Finance Firm', emoji: '\u{1F3E6}', tags: ['finance', 'business'], orgs: ['{word} Capital', '{word} & Partners', '{city} Savings Bank'], tasks: ['@homeComputer built spreadsheets until you dreamed in cells', 'balanced accounts until you dreamed in columns', 'fetched coffee for people who manage millions', 'learned what EBITDA means (sort of)'] },
  { id: 'law', label: 'Law Firm', emoji: '\u{2696}\u{FE0F}', tags: ['law', 'writing'], orgs: ['{word}, {word2} & Associates', '{city} Legal Aid'], tasks: ['copied 9,000 pages', 'summarized contracts nobody will read', 'sat in on a real trial'] },
  { id: 'media', label: 'Newspaper or TV Station', emoji: '\u{1F4F0}', tags: ['media', 'writing'], orgs: ['The {city} Daily', '{city} Morning News', '{word} Media'], tasks: ['wrote three articles that actually ran', 'fact-checked a horoscope', 'held a boom mic until your arms shook'] },
  { id: 'health', label: 'Hospital or Clinic', emoji: '\u{1F3E5}', tags: ['health', 'science'], orgs: ['{city} General Hospital', '{word} Health Clinic'], tasks: ['shadowed doctors on their rounds', 'organized a supply closet nobody had touched in decades', 'learned to sleep standing up'] },
  { id: 'government', label: 'Government Office', emoji: '\u{1F3DB}\u{FE0F}', tags: ['government', 'law'], orgs: ['Ministry of {ministry}', '{city} City Hall'], tasks: ['stamped forms in triplicate', 'answered questions from very angry citizens', 'wrote a speech someone else got credit for'] },
  { id: 'ngo', label: 'Charity or NGO', emoji: '\u{1F30D}', tags: ['service'], orgs: ['{word} Foundation', '{city} Community Trust'], tasks: ['organized a fundraiser', 'wrote grant applications', 'carried boxes of donations up four flights of stairs'] },
  { id: 'lab', label: 'Research Lab', emoji: '\u{1F9EA}', tags: ['science', 'academic'], orgs: ['{word} Research Institute', '{city} University Lab'], tasks: ['washed approximately one million test tubes', 'ran an experiment that worked on the fourth try', 'named a lab mouse after yourself'] },
  { id: 'design', label: 'Design Studio', emoji: '\u{1F58C}\u{FE0F}', tags: ['arts', 'media'], orgs: ['Studio {word}', '{word} Creative'], tasks: ['designed a logo the client hated', 'made 40 versions of the same poster', 'picked fonts for a living'] },
  { id: 'hotel', label: 'Hotel or Restaurant', emoji: '\u{1F3E8}', tags: ['hospitality'], orgs: ['Grand {word} Hotel', '{city} Bistro'], tasks: ['worked the front desk during a wedding', 'folded 2,000 napkins into swans', 'survived a brunch rush'] },
]

const MINISTRIES = ['Education', 'Finance', 'Health', 'Culture', 'Transport', 'Tourism', 'Labor']

function orgName(g: GameState, template: string): string {
  const words = marketOf(g.character.countryId).nameWords
  const loc = localeOf(g.character.countryId)
  const pool = words.length ? words : loc.placeWords.length ? loc.placeWords : ['Summit', 'Harbor', 'Crest']
  return fillLocal(
    g,
    template
      .replace('{word2}', pick(g, pool))
      .replace('{word}', pick(g, pool))
      .replace('{ministry}', pick(g, MINISTRIES)),
  )
}

function internshipLabel(g: GameState, def: InternshipDef): string {
  return def.id === 'media' && !hasTech(g, 'tv') ? 'Newspaper' : def.label
}

function doInternship(g: GameState, def: InternshipDef): void {
  const c = g.character
  if (blocked(g)) return
  if (!useYearAction(g, 'cv.internship', 1)) {
    notice(g, 'Internships', "You've already done an internship this year. One unpaid summer is enough.", { emoji: def.emoji })
    return
  }
  const org = orgName(g, pick(g, def.orgs))
  const fit = cvScore(g, { kind: 'job', tags: def.tags, entry: true }).score
  const market = jobMarket(g)
  const student = !!c.education.current && ['high', 'community', 'university', 'graduate'].includes(c.education.current.level)
  const p = between(0.2 + fit / 110 + (market.score - 50) / 150 + (student ? 0.15 : 0), 0.05, 0.92)
  if (!chance(g, p)) {
    addStat(g, 'happiness', -randInt(g, 1, 4))
    log(g, `${org} turned down my internship application.`, 'bad')
    const why = fit < 25 ? 'They wanted someone with more on their CV. For an internship. The irony was not lost on you.' : `They had ~${market.applicants} applicants for two spots.`
    notice(g, 'No Internship', `${org} turned you down. ${why}`, { emoji: def.emoji, tone: 'bad' })
    return
  }
  timeCost(g)
  const paid = chance(g, between(0.15 + wealth(g) * 0.35, 0.15, 0.6))
  const pay = paid ? Math.round(randInt(g, 1500, 6000) * wealth(g)) : 0
  if (pay > 0) earnIncome(g, pay)
  const prestige = chance(g, 0.15 + fit / 400)
  const strength = between(4 + (prestige ? 1 : 0) + (fit >= 60 ? 1 : 0), 3, 7)
  addCvEntry(g, { kind: 'experience', title: `Intern, ${internshipLabel(g, def)}`, org, startAge: c.age, endAge: c.age, detail: `${eraPick(g, def.tasks)}${paid ? '' : ' • unpaid'}`, strength, tags: def.tags, source: 'built' })
  count(g, 'internships')
  addStat(g, 'happiness', paid ? randInt(g, 1, 4) : -randInt(g, 0, 2))
  log(g, `I did ${paid ? 'a paid' : 'an unpaid'} internship at ${org}.`, 'good')
  const payLine = paid ? ` They even paid you ${formatMoney(pay)}.` : ' It was unpaid. You were paid in "experience" and free pens.'
  notice(g, 'Internship', `You spent the summer interning at ${org}. You ${eraPick(g, def.tasks)}.${payLine}\n\nAdded to your CV (strength ${strength}/10).`, { emoji: def.emoji, tone: 'good' })
}

// Leadership ----------------------------------------------------------------

function clubLeadership(g: GameState, clubId: string): void {
  const c = g.character
  const cur = c.education.current
  if (blocked(g) || !cur) return
  const raw = Array.isArray(cur.data.clubs) ? cur.data.clubs : []
  const rec = raw.find((r): r is { [key: string]: Json } => !!r && typeof r === 'object' && !Array.isArray(r) && r.id === clubId)
  const club = enrollmentClubs(cur).find((x) => x.id === clubId)
  if (!rec || !club) return
  if (club.role) {
    notice(g, club.name, `You're already ${club.role} of the ${club.name}.`, { emoji: '\u{1F451}' })
    return
  }
  if (!useYearAction(g, 'cv.leadership', 1)) {
    notice(g, 'Leadership', "You've already campaigned for one role this year. Nobody likes a career politician.", { emoji: '\u{1F5F3}\u{FE0F}' })
    return
  }
  const sport = club.kind === 'sport'
  const role = club.id === 'student_council' ? 'student council president' : sport ? 'team captain' : 'club president'
  const pop = num(cur.data.popularity, 40)
  const p = between((club.perf * 0.45 + pop * 0.3 + Math.min(club.years, 3) * 8 + c.hidden.willpower * 0.15 - 40) / 60, 0.08, 0.85)
  if (!chance(g, p)) {
    addStat(g, 'happiness', -randInt(g, 2, 5))
    const rival = pick(g, ['a kid whose parents bought everyone pizza', 'someone who promised longer lunch breaks', 'a senior with a very good haircut', 'the coach\'s nephew'])
    log(g, `I lost the race for ${role} of the ${club.name}.`, 'bad')
    notice(g, 'Lost the Vote', `You ran for ${role} of the ${club.name} and lost to ${rival}.`, { emoji: '\u{1F5F3}\u{FE0F}', tone: 'bad' })
    return
  }
  rec.role = role
  cur.data.popularity = Math.round(clamp(pop + 5))
  addStat(g, 'happiness', randInt(g, 4, 8))
  log(g, `I became ${role} of the ${club.name} at ${cur.school}.`, 'good')
  notice(g, 'Elected!', `You're the new ${role} of the ${club.name}! ${sport ? 'You now get to yell "let\'s go" with authority.' : 'Your first act: a mandatory snack budget.'}\n\nLeadership roles are gold on a CV.`, { emoji: '\u{1F451}', tone: 'good' })
}

function volunteerLeadership(g: GameState, entryId: string): void {
  const c = g.character
  if (blocked(g)) return
  const entry = findStored(g, (e) => e.id === entryId)
  if (!entry) return
  if (!useYearAction(g, 'cv.leadership', 1)) {
    notice(g, 'Leadership', "You've already stepped up once this year.", { emoji: '\u{1F9ED}' })
    return
  }
  const title = `Volunteer Coordinator, ${entry.org}`
  if (findStored(g, (e) => e.title === title)) {
    notice(g, 'Leadership', `You already coordinate the volunteers at ${entry.org}.`, { emoji: '\u{1F9ED}' })
    return
  }
  const p = between(0.35 + c.hidden.discipline / 200 + entry.strength / 20, 0.2, 0.9)
  if (!chance(g, p)) {
    notice(g, 'Not This Time', `${entry.org} gave the coordinator role to someone who has been there for decades.`, { emoji: '\u{1F9ED}' })
    return
  }
  addCvEntry(g, { kind: 'leadership', title, org: entry.org, startAge: c.age, detail: hasTech(g, 'smartphone') ? 'Runs the schedule, the group chat and the snack table' : 'Runs the schedule, the noticeboard and the snack table', strength: 5, tags: entry.tags ?? ['service'], source: 'built' })
  addHidden(g, 'karma', 2)
  log(g, `I became volunteer coordinator at ${entry.org}.`, 'good')
  notice(g, 'Volunteer Coordinator', `You now coordinate the volunteers at ${entry.org}. Power has never been this unpaid.`, { emoji: '\u{1F9ED}', tone: 'good' })
}

function workLeadership(g: GameState): void {
  const c = g.character
  const job = c.job
  if (blocked(g) || !job) return
  if (!useYearAction(g, 'cv.leadership', 1)) {
    notice(g, 'Leadership', "You've already stepped up once this year.", { emoji: '\u{1F9ED}' })
    return
  }
  const p = between(job.performance / 110 + c.hidden.willpower / 400, 0.1, 0.9)
  const project = pick(g, ['the office move', 'the new client launch', hasTech(g, 'internet') ? 'the website redesign' : 'the catalog redesign', 'the holiday party (it was a big deal)', 'a cost-cutting review', 'onboarding the interns'])
  if (!chance(g, p)) {
    job.performance = Math.round(clamp(job.performance - 3))
    notice(g, 'Not Picked', `Your boss gave ${project} to someone else. They said you should "keep showing initiative," which means no.`, { emoji: '\u{1F9ED}' })
    return
  }
  job.performance = Math.round(clamp(job.performance + 4))
  addCvEntry(g, { kind: 'leadership', title: `Led ${project}`, org: job.company, startAge: c.age, endAge: c.age, detail: `As ${job.title}`, strength: 5, tags: [], source: 'built' })
  log(g, `I led ${project} at ${job.company}.`, 'good')
  notice(g, 'Project Lead', `You led ${project} at ${job.company}, and it went well! Your boss noticed.`, { emoji: '\u{1F9ED}', tone: 'good' })
}

// Embellishment ---------------------------------------------------------------

interface FakeDef {
  id: string
  label: string
  emoji: string
  minAge: number
  needsJob?: boolean
  make: (g: GameState) => { kind: CvKind; title: string; org: string; detail: string; strength: number; tags: string[] }
}

const FAKES: FakeDef[] = [
  { id: 'award', label: 'Invent an Award', emoji: '\u{1F3C6}', minAge: 12, make: (g) => ({ kind: 'award', title: `Winner, ${getCountry(g.character.countryId).name} Young ${pick(g, ['Innovator', 'Leader', 'Scientist', 'Entrepreneur'])} Award`, org: `${getCountry(g.character.countryId).name} Youth Foundation`, detail: 'Very prestigious. Look it up. (Please don\'t look it up.)', strength: 7, tags: ['academic'] }) },
  { id: 'title', label: 'Inflate a Job Title', emoji: '\u{1F4BC}', minAge: 16, needsJob: true, make: (g) => {
    const c = g.character
    const last = c.job ?? c.partTimeJob
    const hist = c.careerHistory[c.careerHistory.length - 1]
    const org = last?.company ?? hist?.company ?? 'a company you worked at'
    return { kind: 'experience', title: `Head of ${pick(g, ['Strategy', 'Operations', 'Customer Experience', 'Innovation', 'Growth'])}`, org, detail: '(Actual title: the person who restocked the printer)', strength: 6, tags: ['business'] }
  } },
  { id: 'language', label: 'Claim Fluency in a Language', emoji: '\u{1F5E3}\u{FE0F}', minAge: 12, make: (g) => ({ kind: 'skill', title: `${pick(g, ['Japanese', 'Mandarin', 'German', 'French', 'Arabic', 'Russian'])} (Fluent)`, org: '', detail: 'You know how to say "hello" and "where is the bathroom"', strength: 5, tags: ['language'] }) },
  { id: 'internship', label: 'Invent an Internship', emoji: '\u{1F3E2}', minAge: 15, make: (g) => ({ kind: 'experience', title: 'Summer Intern', org: pick(g, ['a "top-secret" tech company', 'the United Nations (allegedly)', 'NASA, kind of', 'a hedge fund in Geneva']), detail: 'Responsibilities: classified', strength: 5, tags: ['business', 'tech'] }) },
  { id: 'president', label: 'Claim You Were Club President', emoji: '\u{1F451}', minAge: 13, make: (g) => ({ kind: 'leadership', title: `President, ${pick(g, ['Debate Society', 'Model UN', 'Robotics Club', 'Student Council', 'Entrepreneurship Club'])}`, org: g.character.education.current?.school ?? 'your old school', detail: 'Led a team of 40 (there were 4)', strength: 5, tags: ['government'] }) },
]

function embellish(g: GameState, def: FakeDef): void {
  const c = g.character
  if (blocked(g)) return
  if (def.needsJob && !c.job && !c.partTimeJob && c.careerHistory.length === 0) {
    notice(g, 'Embellish', "You need a job before you can lie about it. That's just the rules.", { emoji: def.emoji })
    return
  }
  if (!useYearAction(g, 'cv.embellish', 1)) {
    notice(g, 'Embellish', "You've already gotten creative with your CV this year. Don't push it.", { emoji: def.emoji })
    return
  }
  const fake = def.make(g)
  if (findStored(g, (e) => e.embellished && e.title === fake.title)) {
    notice(g, 'Embellish', 'That lie is already on your CV.', { emoji: def.emoji })
    return
  }
  addCvEntry(g, { ...fake, startAge: Math.max(12, c.age - randInt(g, 0, 2)), endAge: c.age, embellished: true, source: 'fake' })
  addHidden(g, 'karma', -4)
  count(g, 'cvLies')
  log(g, 'I added a little "creative writing" to my CV.', 'neutral')
  notice(g, 'Embellished', `You added "${fake.title}" to your CV. It looks amazing. It is also not true.\n\nIt will impress recruiters and admissions officers — until a background check or a sharp interviewer catches it. Get caught and you're rejected (or fired).`, { emoji: '\u{1F925}' })
}

function comeClean(g: GameState): void {
  const fakes = embellishedEntries(g)
  if (!fakes.length || blocked(g)) return
  g.character.cv = (g.character.cv ?? []).filter((e) => !e.embellished)
  addHidden(g, 'karma', 3)
  log(g, 'I removed the lies from my CV.', 'good')
  notice(g, 'Came Clean', `You deleted ${plural(fakes.length, 'made-up line')} from your CV. It's shorter now, but it's all true. Your conscience sent a thank-you card.`, { emoji: '\u{1F607}', tone: 'good' })
}

// The menu ------------------------------------------------------------------

function entryRow(e: CvEntry): MenuNode {
  const org = e.org ? ` — ${e.org}` : ''
  const fake = e.embellished ? ' 🤥 embellished' : ''
  return {
    type: 'info',
    id: `cv.entry.${e.id}`,
    emoji: KIND_META[e.kind].emoji,
    text: `${e.title}${org} (${agesLabel(e)})${e.detail ? `\n${e.detail}` : ''}\n${strengthStars(e.strength)} ${e.strength}/10${fake}`,
  }
}

function ageGate(min: number, max?: number) {
  return (g: GameState): string | null => {
    const r = blocked(g)
    if (r) return r
    const age = g.character.age
    if (age < min) return `You must be at least ${min}.`
    if (max !== undefined && age > max) return `This is for ages ${min}-${max}.`
    return null
  }
}

function limitGate(key: string, max: number, what: string) {
  return (g: GameState): string | null => (yearActionsUsed(g, key) >= max ? `You've done ${max === 1 ? 'this' : `${max} ${what}`} this year.` : null)
}

function chain(...fns: ((g: GameState) => string | null)[]) {
  return (g: GameState): string | null => {
    for (const f of fns) {
      const r = f(g)
      if (r) return r
    }
    return null
  }
}

function costLabel(g: GameState, usd: number, online = false): string {
  const cost = online ? usd : localCost(g, usd)
  return cost > 0 ? formatMoney(cost) : 'Free'
}

const projectsMenu: MenuGroup = {
  type: 'menu',
  id: 'cv.projects',
  label: 'Do a Project',
  emoji: '\u{1F6E0}\u{FE0F}',
  subtitle: (g) => hasTech(g, 'smartphone') ? 'Apps, papers, films, portfolios...' : 'Papers, films, portfolios...',
  header: (g) => `Projects take time and sometimes money. Quality depends on your smarts, discipline and talent — and they can flop. Projects this year: ${yearActionsUsed(g, 'cv.project')}/2.`,
  disabledReason: blocked,
  children: (g) =>
    PROJECTS.filter((p) => projectAvailable(g, p) && (p.maxAge === undefined || g.character.age <= p.maxAge)).map(
      (p): MenuAction => ({
        type: 'action',
        id: `cv.project.${p.id}`,
        label: p.label,
        emoji: p.emoji,
        subtitle: (x) => `${costLabel(x, p.cost, p.online)} • Age ${p.minAge}+`,
        hint: (x) => talentEdge(x, p.talents),
        disabledReason: chain(ageGate(p.minAge, p.maxAge), limitGate('cv.project', 2, 'projects')),
        run: (x) => doProject(x, p),
      }),
    ),
}

const volunteerMenu: MenuGroup = {
  type: 'menu',
  id: 'cv.volunteer',
  label: 'Volunteer',
  emoji: '\u{1F91D}',
  subtitle: 'Give your time to a good cause',
  header: (g) => `Volunteering is good karma and great for university applications. Keep going back to the same place to build it up. This year: ${yearActionsUsed(g, 'cv.volunteer')}/2.`,
  disabledReason: blocked,
  children: () =>
    VOLUNTEERING.map(
      (v): MenuAction => ({
        type: 'action',
        id: `cv.volunteer.${v.id}`,
        label: v.label,
        emoji: v.emoji,
        subtitle: (x) => {
          const mine = findStored(x, (e) => e.source === `volunteer:${v.id}`)
          return mine ? `${mine.org} • ${mine.strength}/10 so far` : `Free • Age ${v.minAge}+`
        },
        disabledReason: chain(ageGate(v.minAge), limitGate('cv.volunteer', 2, 'shifts')),
        run: (x) => volunteer(x, v),
      }),
    ),
}

const coursesMenu: MenuGroup = {
  type: 'menu',
  id: 'cv.courses',
  label: 'Take a Course',
  emoji: '\u{1F4DC}',
  subtitle: 'Online courses and certifications',
  header: (g) => `Pass the final to earn a certificate. Courses this year: ${yearActionsUsed(g, 'cv.course')}/2.`,
  disabledReason: blocked,
  children: () =>
    COURSES.map(
      (cdef): MenuAction => ({
        type: 'action',
        id: `cv.course.${cdef.id}`,
        label: cdef.label,
        emoji: cdef.emoji,
        subtitle: (x) => (findStored(x, (e) => e.title === `Certificate: ${cdef.label}`) ? 'Certified ✓' : `${costLabel(x, cdef.cost, true)} • Age ${cdef.minAge}+`),
        disabledReason: chain(ageGate(cdef.minAge), limitGate('cv.course', 2, 'courses')),
        run: (x) => takeCourse(x, cdef),
      }),
    ),
}

const competitionsMenu: MenuGroup = {
  type: 'menu',
  id: 'cv.competitions',
  label: 'Enter a Competition',
  emoji: '\u{1F3C6}',
  subtitle: 'Olympiads, debate, hackathons, contests',
  header: (g) => `Place in the top three and it goes on your CV as an award. Competitions this year: ${yearActionsUsed(g, 'cv.competition')}/2.`,
  disabledReason: blocked,
  children: (g) =>
    COMPETITIONS.filter((cdef) => cdef.maxAge === undefined || g.character.age <= cdef.maxAge).map(
      (cdef): MenuAction => ({
        type: 'action',
        id: `cv.competition.${cdef.id}`,
        label: cdef.label,
        emoji: cdef.emoji,
        subtitle: (x) => `Entry ${costLabel(x, cdef.fee)} • Age ${cdef.minAge}${cdef.maxAge ? `-${cdef.maxAge}` : '+'}`,
        hint: (x) => talentEdge(x, cdef.talents),
        disabledReason: chain(ageGate(cdef.minAge, cdef.maxAge), limitGate('cv.competition', 2, 'competitions')),
        run: (x) => enterCompetition(x, cdef),
      }),
    ),
}

const languagesMenu: MenuGroup = {
  type: 'menu',
  id: 'cv.languages',
  label: 'Learn a Language',
  emoji: '\u{1F5E3}\u{FE0F}',
  subtitle: 'One year of lessons at a time',
  header: (g) => `Lessons cost ${formatMoney(localCost(g, 150))} a year. Beginner → Elementary → Conversational → Fluent.`,
  disabledReason: blocked,
  children: () =>
    LANGUAGES.map(
      (lang): MenuAction => ({
        type: 'action',
        id: `cv.language.${lang}`,
        label: lang,
        emoji: '\u{1F5E3}\u{FE0F}',
        subtitle: (x) => {
          const mine = findStored(x, (e) => e.source === `language:${lang}`)
          return mine ? mine.title.replace(`${lang} `, '') : 'Not started'
        },
        disabledReason: chain(ageGate(12), limitGate('cv.language', 1, 'lessons')),
        run: (x) => learnLanguage(x, lang),
      }),
    ),
}

const internshipsMenu: MenuGroup = {
  type: 'menu',
  id: 'cv.internships',
  label: 'Find an Internship',
  emoji: '\u{1F3E2}',
  subtitle: 'Age 16+ • Often unpaid',
  visible: (g) => g.character.age >= 15,
  disabledReason: chain(ageGate(16), limitGate('cv.internship', 1, 'internships')),
  header: (g) => `Internships want a decent CV (yes, really) and the job market matters. ${jobMarket(g).line}.`,
  children: (g) =>
    INTERNSHIPS.filter((d) => d.id !== 'tech' || hasTech(g, 'homeComputer')).map(
      (d): MenuAction => ({
        type: 'action',
        id: `cv.internship.${d.id}`,
        label: internshipLabel(g, d),
        emoji: d.emoji,
        subtitle: 'One summer • may be unpaid',
        disabledReason: chain(ageGate(16), limitGate('cv.internship', 1, 'internships')),
        run: (x) => doInternship(x, d),
      }),
    ),
}

const leadershipMenu: MenuGroup = {
  type: 'menu',
  id: 'cv.leadership',
  label: 'Take a Leadership Role',
  emoji: '\u{1F9ED}',
  subtitle: 'Captain, president, coordinator, project lead',
  disabledReason: blocked,
  header: () => 'Run for a role in a club or team you belong to, step up where you volunteer, or lead a project at work. One campaign a year.',
  children: (g) => {
    const nodes: MenuNode[] = []
    const cur = g.character.education.current
    const clubs = cur ? enrollmentClubs(cur) : []
    for (const club of clubs) {
      const sport = club.kind === 'sport'
      const role = club.id === 'student_council' ? 'Student Council President' : sport ? 'Team Captain' : 'Club President'
      nodes.push({
        type: 'action',
        id: `cv.lead.club.${club.id}`,
        label: club.role ? `${titleCase(club.role)}, ${club.name}` : `Run for ${role}`,
        emoji: '\u{1F451}',
        subtitle: club.role ? 'You already hold this role' : `${club.name} • performance ${Math.round(club.perf)}%`,
        disabledReason: chain(blocked, () => (club.role ? 'You already lead this one.' : null), limitGate('cv.leadership', 1, 'campaigns')),
        run: (x) => clubLeadership(x, club.id),
      })
    }
    for (const e of storedEntries(g).filter((x) => x.kind === 'volunteering' && x.source?.startsWith('volunteer:'))) {
      nodes.push({
        type: 'action',
        id: `cv.lead.vol.${e.id}`,
        label: 'Become Volunteer Coordinator',
        emoji: '\u{1F91D}',
        subtitle: e.org,
        disabledReason: chain(blocked, limitGate('cv.leadership', 1, 'campaigns'), (x) => (x.character.age < 15 ? 'You must be at least 15.' : e.strength < 3 ? 'Volunteer there a bit longer first.' : null)),
        run: (x) => volunteerLeadership(x, e.id),
      })
    }
    const job = g.character.job
    if (job && job.category === 'fulltime') {
      nodes.push({ type: 'action', id: 'cv.lead.work', label: 'Lead a Project at Work', emoji: '\u{1F4BC}', subtitle: job.company, disabledReason: chain(blocked, limitGate('cv.leadership', 1, 'campaigns')), run: workLeadership })
    }
    if (!nodes.length) nodes.push({ type: 'info', id: 'cv.lead.none', emoji: '\u{1F4A1}', text: 'Join a club or team at school, volunteer somewhere regularly, or get a full-time job to find something to lead.' })
    return nodes
  },
}

const embellishMenu: MenuGroup = {
  type: 'menu',
  id: 'cv.embellish',
  label: 'Embellish Your CV',
  emoji: '\u{1F925}',
  subtitle: (g) => {
    const n = embellishedEntries(g).length
    return n ? `${plural(n, 'lie')} on your CV` : 'Bend the truth (risky)'
  },
  disabledReason: blocked,
  header: () => 'A fake line raises your odds — until a background check or a sharp interviewer catches it. Caught = rejected, or fired later. Bad karma either way.',
  children: (g) => {
    const nodes: MenuNode[] = FAKES.map(
      (f): MenuAction => ({
        type: 'action',
        id: `cv.fake.${f.id}`,
        label: f.label,
        emoji: f.emoji,
        subtitle: 'Karma -4',
        disabledReason: chain(ageGate(f.minAge), limitGate('cv.embellish', 1, 'lies')),
        confirm: () => 'Lie on your CV? Recruiters, admissions offices and employers run background checks.',
        run: (x) => embellish(x, f),
      }),
    )
    if (embellishedEntries(g).length) {
      nodes.push({ type: 'action', id: 'cv.comeClean', label: 'Come Clean', emoji: '\u{1F607}', subtitle: 'Delete every made-up line', disabledReason: blocked, run: comeClean })
    }
    return nodes
  },
}

/** "Your CV" in the Occupation tab (age 12+; view-only in prison). */
export const cvMenu: MenuGroup = {
  type: 'menu',
  id: 'cv.menu',
  label: 'Your CV',
  emoji: '\u{1F4C4}',
  visible: (g) => g.character.alive && g.character.age >= 12,
  subtitle: (g) => {
    const n = cvEntries(g).length
    const target = g.character.age < 19 && !g.character.education.degrees.some((d) => d.kind === 'bachelor') ? universityTarget() : GENERIC_JOB
    return `${n} ${n === 1 ? 'entry' : 'entries'} • strength ${cvScore(g, target).score}/100`
  },
  header: (g) => {
    const uni = cvScore(g, universityTarget())
    const job = cvScore(g, GENERIC_JOB)
    const lines = [`CV strength: ${job.score}/100 for a typical office job • ${uni.score}/100 for university admissions`]
    const tips = uni.lines.filter((l) => l.startsWith('Gap')).slice(0, 2)
    if (g.character.age < 22 && tips.length) lines.push(tips.join(' • '))
    if (g.character.prison) lines.push("You can read your CV in prison, but you can't add to it.")
    return lines.join('\n')
  },
  children: (g) => {
    const entries = cvEntries(g)
    const nodes: MenuNode[] = []
    if (!entries.length) nodes.push({ type: 'info', id: 'cv.empty', emoji: '\u{1F4C4}', text: 'Your CV is a blank page with your name on it. Join clubs, volunteer, do projects and enter competitions to fill it.' })
    for (const kind of CV_KINDS) {
      const list = entries.filter((e) => e.kind === kind)
      if (!list.length) continue
      nodes.push({ type: 'heading', id: `cv.h.${kind}`, label: KIND_META[kind].label })
      for (const e of list.slice(0, 12)) nodes.push(entryRow(e))
    }
    if (!g.character.prison) {
      nodes.push({ type: 'heading', id: 'cv.h.build', label: 'Build Your CV' })
      nodes.push(projectsMenu, volunteerMenu, coursesMenu, competitionsMenu, languagesMenu, internshipsMenu, leadershipMenu, embellishMenu)
    }
    return nodes
  },
}

/** Exposed for tests. */
export const cvInternals = { PROJECTS, VOLUNTEERING, COURSES, COMPETITIONS, FAKES, INTERNSHIPS, doProject, volunteer, takeCourse, enterCompetition, learnLanguage, doInternship, embellish, comeClean, clubLeadership, storedEntries }
