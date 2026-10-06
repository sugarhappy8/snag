// School and university: the life-sim school system (preschool -> elementary ->
// middle -> high school), dropping out / expulsion / GED, community college,
// university (majors, tuition, Greek life), graduate & professional schools, plus the
// school section of the Occupation menu (study, skip, clubs, cliques, faculty, prom).
//
// Everything the player reads is local (data/locales.ts): an Indonesian kid starts at
// "SD Negeri 3 Menteng", sits the UTBK and goes to prom night; an American one starts at
// "Lincoln Elementary School", takes the SATs and goes to prom. Internal level ids
// ('elementary' | 'middle' | 'high' ...) never change.
import {
  addHidden,
  addRelationship,
  addStat,
  attractedTo,
  clamp,
  count,
  currentPartner,
  endJob,
  formatMoney,
  fullName,
  getPerson,
  log,
  notice,
  parents,
  pronouns,
  queueAi,
  remember,
  scriptChoice,
  spend,
  useYearAction,
  yearActionsUsed,
} from './core'
import {
  TIER_EMOJI,
  TIER_GRADE_EDGE,
  appToJson,
  archiveSchoolCv,
  catchEmbellishment,
  caughtLine,
  caughtLying,
  cvEntries,
  cvScore,
  graduateTarget,
  rankLabel,
  rankOf,
  rankShort,
  readApp,
  schoolCount,
  schoolRank,
  seededStream,
  universityTarget,
  type SchoolRank,
  type SchoolTier,
} from './cv'
import { GRAD_ELIGIBILITY, MAJOR_EMOJI, MAJORS, type EduReq, type GradKey } from './data/jobs'
import {
  fillLocal,
  hasLocaleData,
  hasSnow,
  locale,
  localeOf,
  localPreschoolName,
  localSchoolName,
  localTerm,
  localUniversityName,
  type SchoolLevel as LocaleLevel,
} from './data/locales'
import { createPerson, notePerson } from './people'
import { bell, chance, pick, randInt, shuffle, uid } from './rng'
import { defineScript } from './scripts'
import { hasTalent, talentHint, talentMult, type TalentId } from './talents'
import { getCountry, randomLastName } from './world'
import type {
  ChoiceOption,
  Degree,
  DegreeKind,
  Enrollment,
  Funding,
  GameState,
  Gender,
  GradProgram,
  InterviewQuestion,
  Json,
  MenuAction,
  MenuGroup,
  MenuNode,
  Person,
  SchoolLevel,
  ScreeningApp,
} from './types'

// ---------------------------------------------------------------------------
// School systems by country

type K12Level = 'elementary' | 'middle' | 'high'

interface LevelSpec {
  level: K12Level
  years: number
  name: string
}

export interface SchoolSystem {
  startAge: number
  levels: LevelSpec[]
  dropOutAge: number
  principal: string
  prom: boolean
  greek: boolean
  /** How grade levels are labelled: US (K, 1st... Freshman), 'year' (Year 7) or 'grade' (Grade 7). */
  gradeStyle: 'us' | 'year' | 'grade'
}

const L = (level: K12Level, years: number, name: string): LevelSpec => ({ level, years, name })

const US_SYSTEM: SchoolSystem = {
  startAge: 5,
  levels: [L('elementary', 6, 'Elementary School'), L('middle', 3, 'Middle School'), L('high', 4, 'High School')],
  dropOutAge: 16,
  principal: 'Principal',
  prom: true,
  greek: true,
  gradeStyle: 'us',
}

const DEFAULT_SYSTEM: SchoolSystem = {
  startAge: 6,
  levels: [L('elementary', 6, 'Primary School'), L('middle', 3, 'Middle School'), L('high', 3, 'High School')],
  dropOutAge: 16,
  principal: 'Principal',
  prom: false,
  greek: false,
  gradeStyle: 'grade',
}

const SYSTEMS: Record<string, SchoolSystem> = {
  us: US_SYSTEM,
  ca: { ...US_SYSTEM },
  gb: { startAge: 5, levels: [L('elementary', 6, 'Primary School'), L('high', 7, 'Secondary School')], dropOutAge: 16, principal: 'Headteacher', prom: true, greek: false, gradeStyle: 'year' },
  ie: { startAge: 5, levels: [L('elementary', 7, 'Primary School'), L('high', 6, 'Secondary School')], dropOutAge: 16, principal: 'Principal', prom: false, greek: false, gradeStyle: 'year' },
  au: { startAge: 5, levels: [L('elementary', 7, 'Primary School'), L('high', 6, 'Secondary School')], dropOutAge: 17, principal: 'Principal', prom: true, greek: false, gradeStyle: 'year' },
  nz: { startAge: 5, levels: [L('elementary', 8, 'Primary School'), L('high', 5, 'Secondary School')], dropOutAge: 16, principal: 'Principal', prom: true, greek: false, gradeStyle: 'year' },
  fr: { startAge: 6, levels: [L('elementary', 5, 'Primary School'), L('middle', 4, 'Collège'), L('high', 3, 'Lycée')], dropOutAge: 16, principal: 'Principal', prom: false, greek: false, gradeStyle: 'grade' },
  de: { startAge: 6, levels: [L('elementary', 4, 'Primary School'), L('middle', 6, 'Secondary School'), L('high', 3, 'Gymnasium')], dropOutAge: 16, principal: 'Headmaster', prom: false, greek: false, gradeStyle: 'grade' },
  es: { startAge: 6, levels: [L('elementary', 6, 'Primary School'), L('middle', 4, 'Secondary School'), L('high', 2, 'Bachillerato')], dropOutAge: 16, principal: 'Principal', prom: false, greek: false, gradeStyle: 'grade' },
  it: { startAge: 6, levels: [L('elementary', 5, 'Primary School'), L('middle', 3, 'Middle School'), L('high', 5, 'High School')], dropOutAge: 16, principal: 'Principal', prom: false, greek: false, gradeStyle: 'grade' },
  jp: { startAge: 6, levels: [L('elementary', 6, 'Elementary School'), L('middle', 3, 'Junior High School'), L('high', 3, 'High School')], dropOutAge: 15, principal: 'Principal', prom: false, greek: false, gradeStyle: 'grade' },
  kr: { startAge: 6, levels: [L('elementary', 6, 'Elementary School'), L('middle', 3, 'Middle School'), L('high', 3, 'High School')], dropOutAge: 15, principal: 'Principal', prom: false, greek: false, gradeStyle: 'grade' },
  cn: { startAge: 6, levels: [L('elementary', 6, 'Primary School'), L('middle', 3, 'Junior Middle School'), L('high', 3, 'Senior Middle School')], dropOutAge: 15, principal: 'Principal', prom: false, greek: false, gradeStyle: 'grade' },
  mx: { startAge: 6, levels: [L('elementary', 6, 'Primary School'), L('middle', 3, 'Secondary School'), L('high', 3, 'Preparatory School')], dropOutAge: 15, principal: 'Principal', prom: false, greek: false, gradeStyle: 'grade' },
  br: { startAge: 6, levels: [L('elementary', 5, 'Primary School'), L('middle', 4, 'Middle School'), L('high', 3, 'High School')], dropOutAge: 16, principal: 'Principal', prom: false, greek: false, gradeStyle: 'grade' },
  in: { startAge: 6, levels: [L('elementary', 5, 'Primary School'), L('middle', 3, 'Middle School'), L('high', 4, 'Secondary School')], dropOutAge: 14, principal: 'Principal', prom: false, greek: false, gradeStyle: 'grade' },
  ru: { startAge: 7, levels: [L('elementary', 4, 'Primary School'), L('middle', 5, 'Basic School'), L('high', 2, 'Secondary School')], dropOutAge: 15, principal: 'Principal', prom: false, greek: false, gradeStyle: 'grade' },
  za: { startAge: 6, levels: [L('elementary', 7, 'Primary School'), L('high', 5, 'High School')], dropOutAge: 15, principal: 'Principal', prom: true, greek: false, gradeStyle: 'grade' },
  ng: { startAge: 6, levels: [L('elementary', 6, 'Primary School'), L('middle', 3, 'Junior Secondary School'), L('high', 3, 'Senior Secondary School')], dropOutAge: 15, principal: 'Principal', prom: false, greek: false, gradeStyle: 'grade' },
  ph: { startAge: 6, levels: [L('elementary', 6, 'Elementary School'), L('middle', 4, 'Junior High School'), L('high', 2, 'Senior High School')], dropOutAge: 16, principal: 'Principal', prom: true, greek: false, gradeStyle: 'grade' },
}

export function schoolSystem(countryId: string): SchoolSystem {
  return SYSTEMS[countryId] ?? DEFAULT_SYSTEM
}

function systemFor(g: GameState): SchoolSystem {
  return schoolSystem(g.character.countryId)
}

/** Age at which a character finishes high school in their country. */
export function graduationAge(sys: SchoolSystem): number {
  return sys.startAge + sys.levels.reduce((s, l) => s + l.years, 0)
}

/** Which K-12 level (and 1-based year in it) a child of this age belongs in. */
function levelForAge(sys: SchoolSystem, age: number): { spec: LevelSpec; year: number } | null {
  let offset = age - sys.startAge
  if (offset < 0) return null
  for (const spec of sys.levels) {
    if (offset < spec.years) return { spec, year: offset + 1 }
    offset -= spec.years
  }
  return null
}

function levelSpec(sys: SchoolSystem, level: SchoolLevel): LevelSpec | undefined {
  return sys.levels.find((l) => l.level === level)
}

const K12: SchoolLevel[] = ['elementary', 'middle', 'high']
const POST_SECONDARY: SchoolLevel[] = ['community', 'university', 'graduate']

function isK12(level: SchoolLevel): boolean {
  return K12.includes(level)
}

// ---------------------------------------------------------------------------
// Local words: what school is called where the player lives

function isUS(g: GameState): boolean {
  return g.character.countryId === 'us'
}

/** "senior high" → "Senior High", "collège" → "Collège" (leaves "MAVO" and "Gymnasium" alone). */
function titleCase(s: string): string {
  return s.replace(/(^|[\s-])(\p{Ll})/gu, (_m, pre: string, ch: string) => pre + ch.toUpperCase())
}

function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

/** Which locale stage a K-12 level is in this country's system. */
function localeLevel(sys: SchoolSystem, level: K12Level): LocaleLevel {
  if (level === 'elementary') return 'primary'
  if (level === 'middle') return 'middle'
  // One long secondary stage (UK, Ireland, Australia): it's the locale's first secondary school,
  // not its sixth form / senior cycle.
  const high = levelSpec(sys, 'high')
  if (!levelSpec(sys, 'middle') && high && high.years >= 6) return 'middle'
  return 'high'
}

/** What a stage is called here, for sentences: 'high school', 'senior high', 'sixth form', 'college'... */
export function stageTerm(g: GameState, level: SchoolLevel): string {
  const cid = g.character.countryId
  switch (level) {
    case 'preschool':
      return 'preschool'
    case 'university':
      return localTerm(g, 'university')
    case 'graduate':
      return 'graduate school'
    case 'community':
      return college(g).term
    default: {
      const sys = systemFor(g)
      if (!hasLocaleData(cid) && SYSTEMS[cid]) return (levelSpec(sys, level)?.name ?? 'school').toLowerCase()
      return localTerm(g, localeLevel(sys, level as K12Level)) || 'school'
    }
  }
}

/** The same, for titles and labels: 'High School', 'Senior High', 'Sixth Form'. */
export function stageTitle(g: GameState, level: SchoolLevel): string {
  return titleCase(stageTerm(g, level))
}

/** The school-leaving / entrance exam: 'the SATs', 'the gaokao', 'A-levels'. */
function finalExam(g: GameState): string {
  return localTerm(g, 'finalExam') || 'the final exams'
}

/** Where 'valedictorian' and 'summa cum laude' are things people say. */
const VALEDICTORIAN_COUNTRIES = new Set(['us', 'ca', 'ph'])
/** Where parents joke about still paying off their own student loans. */
const STUDENT_LOAN_COUNTRIES = new Set(['us', 'ca', 'gb', 'au', 'nz'])

/** Community college in the US, vocational college / polytechnic everywhere else. */
function college(g: GameState): { label: string; term: string; degree: string; degreeText: string; name: () => string } {
  if (isUS(g)) {
    return {
      label: 'Community College',
      term: 'community college',
      degree: "Associate's Degree",
      degreeText: "an associate's degree",
      name: () => `${g.character.city} Community College`,
    }
  }
  return {
    label: 'Vocational College',
    term: 'vocational college',
    degree: 'Vocational Diploma',
    degreeText: 'a vocational diploma',
    name: () => fillLocal(g, pick(g, ['{city} Vocational College', '{city} Polytechnic', '{place} Technical College'])),
  }
}

/** The GED in the US and Canada; a school-leaving equivalency exam elsewhere. */
function equivalency(g: GameState): { title: string; exam: string; short: string; degree: string; center: string; menu: string } {
  if (g.character.countryId === 'us' || g.character.countryId === 'ca') {
    return { title: 'GED', exam: 'the GED exam', short: 'GED', degree: 'GED', center: 'GED Testing Center', menu: 'Get Your GED' }
  }
  return {
    title: 'Equivalency Exam',
    exam: 'the school equivalency exam',
    short: 'equivalency certificate',
    degree: 'School Equivalency Certificate',
    center: 'National Examinations Board',
    menu: 'Take the Equivalency Exam',
  }
}

/** The end-of-school dance (or party, ball, gala...) and whether you take a date to it. */
function schoolDance(g: GameState): { the: string; title: string; prom: boolean; datable: boolean } {
  const term = localTerm(g, 'schoolDance') || 'the graduation party'
  const prom = /\bprom\b/i.test(term)
  // Ceremonies, festivals, trips and prize-givings aren't something you ask a date to.
  const datable = prom || !/ceremony|festival|trip|prize|program|graduation$|rag day/i.test(term)
  return { the: term, title: titleCase(term.replace(/^the /i, '')), prom, datable }
}

/** Pick a line, avoiding the last `memory` picks remembered under g.flags[key] (so lines don't repeat). */
function pickFresh(g: GameState, key: string, list: string[], memory = 2): string {
  const raw = g.flags[key]
  const recent = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
  const fresh = list.filter((x) => !recent.includes(x))
  const choice = pick(g, fresh.length ? fresh : list)
  g.flags[key] = [...recent.filter((x) => x !== choice), choice].slice(-memory)
  return choice
}

// ---------------------------------------------------------------------------
// Graduate programs and tuition

interface ProgramInfo {
  label: string
  suffix: string
  emoji: string
  kind: DegreeKind
  program: GradProgram
  years: number
  tuition: number
  minSmarts: number
  degreeName: (major: string) => string
  blurb: string
}

export const PROGRAMS: Record<GradKey, ProgramInfo> = {
  business: { label: 'Business School', suffix: 'School of Business', emoji: '\u{1F4BC}', kind: 'mba', program: 'business', years: 2, tuition: 58000, minSmarts: 50, degreeName: () => 'Master of Business Administration (MBA)', blurb: 'Become a big-shot executive.' },
  dental: { label: 'Dental School', suffix: 'School of Dentistry', emoji: '\u{1F9B7}', kind: 'dds', program: 'dental', years: 4, tuition: 58000, minSmarts: 60, degreeName: () => 'Doctor of Dental Surgery (DDS)', blurb: 'Spend your days staring into strangers’ mouths.' },
  law: { label: 'Law School', suffix: 'School of Law', emoji: '\u{2696}\u{FE0F}', kind: 'jd', program: 'law', years: 3, tuition: 52000, minSmarts: 55, degreeName: () => 'Juris Doctor (JD)', blurb: 'Objection! Become a lawyer.' },
  medical: { label: 'Medical School', suffix: 'School of Medicine', emoji: '\u{1FA7A}', kind: 'md', program: 'medical', years: 4, tuition: 62000, minSmarts: 68, degreeName: () => 'Doctor of Medicine (MD)', blurb: 'The hardest school to get into.' },
  nursing: { label: 'Nursing School', suffix: 'School of Nursing', emoji: '\u{1F3E5}', kind: 'nursing', program: 'nursing', years: 2, tuition: 32000, minSmarts: 45, degreeName: () => 'Master of Science in Nursing', blurb: 'Become a nurse.' },
  pharmacy: { label: 'Pharmacy School', suffix: 'School of Pharmacy', emoji: '\u{1F48A}', kind: 'pharmd', program: 'pharmacy', years: 4, tuition: 44000, minSmarts: 48, degreeName: () => 'Doctor of Pharmacy (PharmD)', blurb: 'Count pills for a living.' },
  veterinary: { label: 'Veterinary School', suffix: 'School of Veterinary Medicine', emoji: '\u{1F43E}', kind: 'dvm', program: 'veterinary', years: 4, tuition: 48000, minSmarts: 58, degreeName: () => 'Doctor of Veterinary Medicine (DVM)', blurb: 'Doctor to the furry and the scaly.' },
  master: { label: 'Graduate School', suffix: 'Graduate School', emoji: '\u{1F4DA}', kind: 'master', program: 'phd', years: 2, tuition: 30000, minSmarts: 40, degreeName: (m) => `Master's in ${m}`, blurb: 'Two more years of essays. Earn a master’s degree.' },
  phd: { label: 'PhD Program', suffix: 'Graduate School', emoji: '\u{1F9D1}\u{200D}\u{1F393}', kind: 'doctorate', program: 'phd', years: 4, tuition: 22000, minSmarts: 62, degreeName: (m) => `PhD in ${m}`, blurb: 'Become an actual doctor of philosophy.' },
}

const GRAD_ORDER: GradKey[] = ['business', 'dental', 'law', 'medical', 'nursing', 'pharmacy', 'veterinary', 'master', 'phd']

const UNIVERSITY_TUITION = 26000
const UNIVERSITY_YEARS = 4
const COMMUNITY_YEARS = 2

function wealthScale(g: GameState): number {
  return Math.max(0.3, getCountry(g.character.countryId).wealth)
}

function roundMoney(n: number): number {
  return Math.round(n / 100) * 100
}

// ---------------------------------------------------------------------------
// Enrollment data helpers (Enrollment.data is free-form JSON)

/** A club membership. `name`/`kind` are stored too so the CV (cv.ts) can read them. */
type ClubRec = { id: string; perf: number; years: number; role: string; name?: string; kind?: string }

function num(v: Json | undefined, dflt: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : dflt
}

function str(v: Json | undefined, dflt = ''): string {
  return typeof v === 'string' ? v : dflt
}

function schoolId(cur: Enrollment): string {
  return str(cur.data.schoolId, cur.school)
}

function popularity(cur: Enrollment): number {
  return num(cur.data.popularity, 40)
}

function addPopularity(cur: Enrollment, delta: number): void {
  cur.data.popularity = Math.round(clamp(popularity(cur) + delta))
}

function addGrades(cur: Enrollment, delta: number): void {
  cur.grades = Math.round(clamp(cur.grades + delta))
}

function clubsOf(cur: Enrollment): ClubRec[] {
  const raw = cur.data.clubs
  if (!Array.isArray(raw)) return []
  const out: ClubRec[] = []
  for (const r of raw) {
    if (r && typeof r === 'object' && !Array.isArray(r) && typeof r.id === 'string') {
      const rec: ClubRec = { id: r.id, perf: num(r.perf, 50), years: num(r.years, 0), role: str(r.role) }
      if (typeof r.name === 'string') rec.name = r.name
      if (typeof r.kind === 'string') rec.kind = r.kind
      out.push(rec)
    }
  }
  return out
}

function setClubs(cur: Enrollment, clubs: ClubRec[]): void {
  cur.data.clubs = clubs.map((c) => ({ ...c }))
}

function cliqueOf(cur: Enrollment): string | null {
  const v = cur.data.clique
  return typeof v === 'string' && v ? v : null
}

function current(g: GameState): Enrollment | null {
  return g.character.education.current
}

// ---------------------------------------------------------------------------
// Grades

export function gradeLetter(grades: number): string {
  const bands: [number, string][] = [
    [97, 'A+'],
    [93, 'A'],
    [90, 'A-'],
    [87, 'B+'],
    [83, 'B'],
    [80, 'B-'],
    [77, 'C+'],
    [73, 'C'],
    [70, 'C-'],
    [67, 'D+'],
    [63, 'D'],
    [60, 'D-'],
  ]
  for (const [min, letter] of bands) if (grades >= min) return letter
  return 'F'
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

const CLASS_YEARS = ['Freshman', 'Sophomore', 'Junior', 'Senior']

/** "3rd Grade", "Junior", "Year 9", "Year 2 of 4"... */
export function gradeLevelLabel(g: GameState, cur: Enrollment = current(g)!): string {
  if (!cur) return ''
  if (cur.level === 'preschool') return 'Preschool'
  const sys = systemFor(g)
  // Freshman/Sophomore/Junior/Senior is American; everyone else is just in Year 2.
  if (cur.level === 'university') return sys.gradeStyle === 'us' && cur.totalYears === 4 && cur.year <= 4 ? CLASS_YEARS[cur.year - 1] : `Year ${cur.year}`
  if (cur.level === 'community' || cur.level === 'graduate') return `Year ${cur.year} of ${cur.totalYears}`
  let before = 0
  for (const spec of sys.levels) {
    if (spec.level === cur.level) break
    before += spec.years
  }
  const idx = before + cur.year // 1-based count of school years so far
  if (sys.gradeStyle === 'us') {
    if (cur.level === 'high' && cur.totalYears === 4) return CLASS_YEARS[Math.min(3, cur.year - 1)]
    const grade = sys.startAge === 5 ? idx - 1 : idx
    return grade <= 0 ? 'Kindergarten' : `${ordinal(grade)} Grade`
  }
  if (sys.gradeStyle === 'year') return `Year ${idx}`
  return `Grade ${idx}`
}

// ---------------------------------------------------------------------------
// Degrees

const DEGREE_RANK: Record<DegreeKind, number> = {
  ged: 1,
  highschool: 1.1,
  associate: 2,
  bachelor: 3,
  nursing: 4,
  master: 4,
  mba: 4.2,
  pharmd: 5,
  dvm: 5,
  dds: 5,
  jd: 5,
  md: 5.2,
  doctorate: 5.1,
}

export function hasDegree(g: GameState, kind: DegreeKind, major?: string): boolean {
  return g.character.education.degrees.some((d) => d.kind === kind && (!major || d.major === major))
}

/** High school diploma or GED (or anything higher). */
export function hasHighSchool(g: GameState): boolean {
  return g.character.education.degrees.length > 0
}

export function bachelorMajors(g: GameState): string[] {
  return g.character.education.degrees.filter((d) => d.kind === 'bachelor' && d.major).map((d) => d.major as string)
}

const GRAD_REQ_KIND: Partial<Record<EduReq, DegreeKind>> = {
  business: 'mba',
  law: 'jd',
  medical: 'md',
  dental: 'dds',
  nursing: 'nursing',
  pharmacy: 'pharmd',
  veterinary: 'dvm',
}

/** Does the player meet a job's education requirement (majors = qualifying bachelor's majors)? */
export function meetsEducation(g: GameState, req: EduReq, majors?: string[]): boolean {
  const degrees = g.character.education.degrees
  const majorOk = !majors || majors.length === 0 || bachelorMajors(g).some((m) => majors.includes(m))
  switch (req) {
    case 'none':
      return true
    case 'highschool':
      return degrees.length > 0
    case 'community':
      return degrees.some((d) => DEGREE_RANK[d.kind] >= 2)
    case 'bachelor':
      return hasDegree(g, 'bachelor') && majorOk
    case 'graduate':
      return (hasDegree(g, 'master') || hasDegree(g, 'doctorate')) && majorOk
    default: {
      const kind = GRAD_REQ_KIND[req]
      return kind ? hasDegree(g, kind) : false
    }
  }
}

/**
 * Human description of an education requirement, e.g. "University (Accounting or Finance)".
 * Pass `g` to use the player's local names ("Senior High / equivalency certificate", "Vocational College").
 */
export function educationRequirementLabel(req: EduReq, majors?: string[], g?: GameState): string {
  const m = majors && majors.length ? ` (${majors.length > 3 ? `${majors.slice(0, 3).join(', ')}...` : majors.join(' or ')})` : ''
  switch (req) {
    case 'none':
      return 'None'
    case 'highschool':
      return g ? `${stageTitle(g, 'high')} / ${equivalency(g).short}` : 'High School / GED'
    case 'community':
      return g ? college(g).label : 'Community College'
    case 'bachelor':
      return `University${m}`
    case 'graduate':
      return `Graduate School${m}`
    default:
      return PROGRAMS[req as GradKey]?.label ?? 'Graduate School'
  }
}

export function highestEducationLabel(g: GameState): string {
  const ed = g.character.education
  let best: Degree | null = null
  for (const d of ed.degrees) {
    if (!best || DEGREE_RANK[d.kind] >= DEGREE_RANK[best.kind]) best = d
  }
  if (best) return best.name
  if (ed.completed.includes('middle')) return stageTitle(g, 'middle')
  if (ed.completed.includes('elementary')) return stageTitle(g, 'elementary')
  if (ed.current && ed.current.level !== 'preschool') return `Some ${stageTitle(g, ed.current.level)}`
  return 'None'
}

function addDegree(g: GameState, kind: DegreeKind, name: string, school: string, opts: { major?: string; honors?: boolean } = {}): Degree {
  const deg: Degree = { kind, name, school, age: g.character.age }
  if (opts.major) deg.major = opts.major
  if (opts.honors) deg.honors = true
  g.character.education.degrees.push(deg)
  count(g, 'degrees')
  return deg
}

// ---------------------------------------------------------------------------
// School names

// New schools are named the local way (data/locales.ts): "Lincoln Elementary School" in the US,
// "SD Negeri 3 Menteng" in Indonesia, "Escuela Primaria Benito Juárez" in Mexico. Names already
// stored in a save (Enrollment.school, Degree.school) are kept as they are.
//
// Every school has a national rank (cv.ts schoolRank: deterministic from country + name). Which
// school a kid ends up at depends on the family: richer families and the capital get better
// schools, so a few candidate names are drawn and the one whose rank fits the family is kept.
const PRESCHOOLS = ['Little Sprouts Preschool', 'Tiny Tots Preschool', 'Sunshine Preschool', 'Rainbow Kids Preschool', 'Busy Bees Preschool', 'Happy Hearts Preschool', 'Giggles & Wiggles Preschool', 'Little Acorns Nursery']

/** How well-off and well-placed the family is: 0 (struggling) .. 1 (rich, in the capital). */
export function familyStanding(g: GameState): number {
  const c = g.character
  const ps = parents(g)
  const money = ps.length ? ps.reduce((s, p) => s + Math.max(0, p.money), 0) : Math.max(0, c.money)
  const ratio = money / (150_000 * wealthScale(g))
  let standing = ps.length || c.money > 0 ? ratio / (ratio + 1) : 0.3
  if (getCountry(c.countryId).cities[0] === c.city) standing += 0.08
  return Math.min(1, Math.max(0, standing))
}

/** The rank percentile (0 = best) a family like this usually lands. */
function targetPct(g: GameState): number {
  return Math.min(0.99, Math.max(0.01, 0.85 - 0.75 * familyStanding(g) + bell(g, -20, 20) / 100))
}

/** Draw a few names and keep the one whose national rank is closest to `target`. */
function rankedName(g: GameState, level: SchoolLevel, gen: () => string, target: number, avoid?: string, tries = 5): string {
  let best = ''
  let bestD = Infinity
  for (let i = 0; i < tries || !best; i++) {
    const name = gen()
    if (name === avoid && i < tries + 6) continue
    const d = Math.abs(rankOf(g, level, name).pct - target)
    if (d < bestD) {
      best = name
      bestD = d
    }
  }
  return best
}

/** Preschool: cute English names in the US, the local style everywhere else (data/locales). */
function preschoolName(g: GameState): string {
  return rankedName(g, 'preschool', () => (isUS(g) ? pick(g, PRESCHOOLS) : localPreschoolName(g)), targetPct(g))
}

function k12SchoolName(g: GameState, level: K12Level, avoid?: string): string {
  const stage = localeLevel(systemFor(g), level)
  return rankedName(g, level, () => localSchoolName(g, stage), targetPct(g), avoid)
}

function universityName(g: GameState): string {
  return localUniversityName(g)
}

function lastUniversity(g: GameState): string | null {
  const degs = g.character.education.degrees.filter((d) => d.kind === 'bachelor')
  return degs.length ? degs[degs.length - 1].school : null
}

// ---------------------------------------------------------------------------
// Classmates & teachers

const SUBJECTS = ['Math', 'English', 'Science', 'History', 'Art', 'Music', 'Physical Education', 'Spanish', 'French', 'Geography', 'Computer Science', 'Drama', 'Health']
const HIGH_SUBJECTS = ['Algebra', 'Chemistry', 'Biology', 'Physics', 'English Literature', 'World History', 'Calculus', 'Economics', 'Psychology', 'Art', 'Music', 'Physical Education', 'Spanish', 'French', 'Computer Science']

function teacherTitle(p: Person): string {
  return `${p.gender === 'male' ? 'Mr.' : 'Ms.'} ${p.lastName}`
}

function createClassmates(g: GameState, cur: Enrollment, n: number): void {
  const c = g.character
  const id = schoolId(cur)
  for (let i = 0; i < n; i++) {
    const age = Math.max(3, c.age + randInt(g, -1, 1))
    const data: Record<string, Json> = {}
    if (cur.level !== 'preschool' && cur.level !== 'elementary' && chance(g, 0.45)) data.clique = pick(g, CLIQUES).id
    createPerson(g, {
      relation: 'classmate',
      age,
      contextId: id,
      relationship: randInt(g, 25, 60),
      occupation: cur.level === 'university' || cur.level === 'community' || cur.level === 'graduate' ? 'University Student' : 'Student',
      data,
    })
  }
}

function createTeacher(g: GameState, cur: Enrollment): Person {
  let subject: string
  let occupation: string
  if (cur.level === 'preschool') {
    subject = 'Preschool'
    occupation = 'Preschool Teacher'
  } else if (cur.level === 'university' || cur.level === 'community' || cur.level === 'graduate') {
    subject = cur.major && chance(g, 0.6) ? cur.major : pick(g, MAJORS)
    occupation = `${subject} Professor`
  } else {
    subject = pick(g, cur.level === 'high' ? HIGH_SUBJECTS : SUBJECTS)
    occupation = `${subject} Teacher`
  }
  return createPerson(g, {
    relation: 'teacher',
    age: randInt(g, 26, 64),
    contextId: schoolId(cur),
    relationship: randInt(g, 35, 65),
    occupation,
    data: { subject },
  })
}

function staffSchool(g: GameState, cur: Enrollment): void {
  const small = cur.level === 'preschool'
  createClassmates(g, cur, small ? 2 : randInt(g, 3, 5))
  const teachers = small ? 1 : randInt(g, 1, 2)
  for (let i = 0; i < teachers; i++) createTeacher(g, cur)
}

function schoolPeople(g: GameState, cur: Enrollment, relation: 'classmate' | 'teacher'): Person[] {
  const id = schoolId(cur)
  return g.people.filter((p) => p.alive && p.relation === relation && p.contextId === id)
}

function removeSchoolPeople(g: GameState, id: string): void {
  g.people = g.people.filter((p) => !(p.contextId === id && (p.relation === 'classmate' || p.relation === 'teacher')))
}

// ---------------------------------------------------------------------------
// Enrolling and leaving

interface EnrollOpts {
  school?: string
  year?: number
  totalYears?: number
  grades?: number
  major?: string
  program?: GradProgram
  track?: GradKey
  funding?: Funding
  loanId?: string
  quiet?: boolean
  /** Don't reuse this school name (expelled kids get a different school). */
  avoidName?: string
}

function enrollIn(g: GameState, level: SchoolLevel, opts: EnrollOpts = {}): Enrollment {
  const c = g.character
  const sys = systemFor(g)
  let school = opts.school
  let totalYears = opts.totalYears ?? 1
  if (!school) {
    if (level === 'preschool') school = preschoolName(g)
    else if (isK12(level)) school = k12SchoolName(g, level as K12Level, opts.avoidName)
    else if (level === 'community') school = rankedName(g, 'community', college(g).name, targetPct(g))
    else if (level === 'university') school = universityName(g)
    else {
      const base = lastUniversity(g) ?? universityName(g)
      school = `${base} ${opts.track ? PROGRAMS[opts.track].suffix : 'Graduate School'}`
    }
  }
  if (opts.totalYears === undefined) {
    if (isK12(level)) totalYears = levelSpec(sys, level)?.years ?? 3
    else if (level === 'community') totalYears = COMMUNITY_YEARS
    else if (level === 'university') totalYears = UNIVERSITY_YEARS
    else if (level === 'graduate' && opts.track) totalYears = PROGRAMS[opts.track].years
  }
  const startGrades = opts.grades ?? clamp(Math.round(c.stats.smarts * 0.5 + randInt(g, 35, 55)))
  const cur: Enrollment = {
    level,
    school,
    year: opts.year ?? 1,
    totalYears,
    grades: startGrades,
    data: {
      schoolId: uid(g, 'school'),
      popularity: Math.round(clamp(c.stats.looks * 0.45 + randInt(g, 5, 35))),
      clubs: [],
      clique: null,
      warnings: 0,
      principal: `${chance(g, 0.5) ? 'Mr.' : 'Ms.'} ${randomLastName(g, c.countryId)}`,
      strictness: randInt(g, 20, 80),
    },
  }
  if (opts.major) cur.major = opts.major
  if (opts.program) cur.program = opts.program
  if (opts.funding) cur.funding = opts.funding
  if (opts.track) cur.data.track = opts.track
  if (opts.loanId) cur.data.loanId = opts.loanId
  c.education.current = cur
  staffSchool(g, cur)
  if (!opts.quiet) {
    const what = level === 'university' && cur.major ? `${cur.school} to study ${cur.major}` : cur.school
    log(g, pick(g, [`I started attending ${what}.`, `I enrolled at ${what}.`, `My first day at ${what} began.`]), 'neutral')
  }
  return cur
}

/** Close a student loan's grace period: repayments start once you leave school. */
function finalizeStudentLoan(g: GameState, cur: Enrollment): void {
  const loanId = str(cur.data.loanId)
  if (!loanId) return
  const loan = g.character.loans.find((l) => l.id === loanId)
  if (!loan) return
  loan.yearlyPayment = Math.max(500, Math.round(loan.balance / 10))
}

/** Leave the current school (graduated, dropped out, expelled...). */
function leaveSchool(g: GameState, why: 'graduated' | 'dropped' | 'expelled' | 'prison' | 'transfer'): void {
  const c = g.character
  const cur = c.education.current
  if (!cur) return
  finalizeStudentLoan(g, cur)
  // Clubs, roles and honor roll stay on your CV after you leave.
  archiveSchoolCv(g, cur)
  removeSchoolPeople(g, schoolId(cur))
  c.education.current = null
  // Remember how well you did (university admissions and scholarships look at it).
  if (cur.level !== 'preschool') g.flags.lastGrades = cur.grades
  // Campus jobs end with your student status.
  const pt = c.partTimeJob
  if (pt && pt.data.studentOnly === true && POST_SECONDARY.includes(cur.level)) {
    endJob(g, 'partTimeJob', why === 'graduated' ? 'graduated' : 'quit')
    log(g, `I gave up my campus job as ${pt.title}.`, 'neutral')
  }
}

function quitJobForSchool(g: GameState): void {
  const job = g.character.job
  if (job && job.category === 'fulltime') {
    endJob(g, 'job', 'quit')
    log(g, `I quit my job as ${job.title} to go back to school.`, 'neutral')
  }
}

// ---------------------------------------------------------------------------
// Warnings, the principal's office and expulsion

function officeTitle(g: GameState, cur: Enrollment): string {
  return isK12(cur.level) ? `${systemFor(g).principal}'s Office` : "Dean's Office"
}

function principalTitle(g: GameState, cur: Enrollment): string {
  if (!isK12(cur.level)) return 'the dean'
  return `${systemFor(g).principal} ${str(cur.data.principal, 'Smith').replace(/^(Mr\.|Ms\.) /, '')}`
}

/** A trip to the principal's office. Three strikes and you're out. */
export function schoolWarning(g: GameState, reason: string): void {
  const cur = current(g)
  if (!cur || cur.level === 'preschool') return
  const warnings = num(cur.data.warnings, 0) + 1
  cur.data.warnings = warnings
  const who = principalTitle(g, cur)
  if (warnings >= 3) {
    expel(g, reason)
    return
  }
  const last = warnings === 2 ? ' This is your final warning.' : ''
  notice(g, officeTitle(g, cur), `You were sent to ${who}'s office for ${reason}.${last}`, { emoji: '\u{1F6A8}', tone: 'bad' })
  log(g, `I was sent to ${who}'s office for ${reason}.`, 'bad')
}

function expel(g: GameState, reason: string): void {
  const c = g.character
  const cur = c.education.current
  if (!cur) return
  const sys = systemFor(g)
  c.education.expelled += 1
  count(g, 'expelled')
  addStat(g, 'happiness', -15)
  remember(g, `Expelled from ${cur.school} for ${reason}.`)
  for (const p of parents(g)) addRelationship(p, -15)
  if (isK12(cur.level) && c.age < sys.dropOutAge) {
    // Too young to be out of school: your parents find you a new one.
    const old = cur.school
    const { level, year, totalYears, grades } = cur
    leaveSchool(g, 'expelled')
    const fresh = enrollIn(g, level, { year, totalYears, grades: Math.max(0, grades - 5), quiet: true, avoidName: old })
    notice(g, 'Expelled!', `You were expelled from ${old} for ${reason}. Your parents grumbled the whole drive to your new school, ${fresh.school}.`, { emoji: '\u{1F6AB}', tone: 'bad' })
    log(g, `I was expelled from ${old} and transferred to ${fresh.school}.`, 'bad')
    return
  }
  const old = cur.school
  c.education.droppedOut.push(cur.level)
  leaveSchool(g, 'expelled')
  const tail = isK12(cur.level) ? ` You can still get your ${equivalency(g).short} from the Education menu.` : ''
  notice(g, 'Expelled!', `You were expelled from ${old} for ${reason}.${tail}`, { emoji: '\u{1F6AB}', tone: 'bad' })
  log(g, `I was expelled from ${old}.`, 'bad')
}

// ---------------------------------------------------------------------------
// Clubs, sports teams and cliques

type ClubKind = 'sport' | 'music' | 'arts' | 'academic' | 'hobby' | 'service'

interface ClubDef {
  id: string
  name: string
  emoji: string
  kind: ClubKind
  tryout?: boolean
  minGrades?: number
  minPopularity?: number
}

const C = (id: string, name: string, emoji: string, kind: ClubKind, extra: Partial<ClubDef> = {}): ClubDef => ({ id, name, emoji, kind, ...extra })

export const CLUBS: ClubDef[] = [
  // Sports
  C('badminton', 'Badminton Team', '\u{1F3F8}', 'sport', { tryout: true }),
  C('baseball', 'Baseball Team', '\u{26BE}', 'sport', { tryout: true }),
  C('basketball', 'Basketball Team', '\u{1F3C0}', 'sport', { tryout: true }),
  C('cheerleading', 'Cheerleading Team', '\u{1F4E3}', 'sport', { tryout: true }),
  C('cricket', 'Cricket Team', '\u{1F3CF}', 'sport', { tryout: true }),
  C('cross_country', 'Cross Country Team', '\u{1F3BD}', 'sport', { tryout: true }),
  C('curling', 'Curling Team', '\u{1F94C}', 'sport', { tryout: true }),
  C('diving', 'Diving Team', '\u{1F4A6}', 'sport', { tryout: true }),
  C('field_hockey', 'Field Hockey Team', '\u{1F3D1}', 'sport', { tryout: true }),
  C('football', 'Football Team', '\u{1F3C8}', 'sport', { tryout: true }),
  C('golf', 'Golf Team', '\u{26F3}', 'sport', { tryout: true }),
  C('gymnastics', 'Gymnastics Team', '\u{1F938}', 'sport', { tryout: true }),
  C('ice_hockey', 'Ice Hockey Team', '\u{1F3D2}', 'sport', { tryout: true }),
  C('lacrosse', 'Lacrosse Team', '\u{1F94D}', 'sport', { tryout: true }),
  C('rugby', 'Rugby Team', '\u{1F3C9}', 'sport', { tryout: true }),
  C('soccer', 'Soccer Team', '\u{26BD}', 'sport', { tryout: true }),
  C('softball', 'Softball Team', '\u{1F94E}', 'sport', { tryout: true }),
  C('swim', 'Swim Team', '\u{1F3CA}', 'sport', { tryout: true }),
  C('table_tennis', 'Table Tennis Team', '\u{1F3D3}', 'sport', { tryout: true }),
  C('tennis', 'Tennis Team', '\u{1F3BE}', 'sport', { tryout: true }),
  C('track', 'Track Team', '\u{1F947}', 'sport', { tryout: true }),
  C('volleyball', 'Volleyball Team', '\u{1F3D0}', 'sport', { tryout: true }),
  C('water_polo', 'Water Polo Team', '\u{1F93D}', 'sport', { tryout: true }),
  C('wrestling', 'Wrestling Team', '\u{1F93C}', 'sport', { tryout: true }),
  C('goat_grabbing', 'Goat Grabbing Team', '\u{1F410}', 'sport', { tryout: true }),
  C('boxing', 'Boxing Club', '\u{1F94A}', 'sport'),
  C('fencing', 'Fencing Club', '\u{1F93A}', 'sport'),
  C('archery', 'Archery Club', '\u{1F3F9}', 'sport'),
  C('rock_climbing', 'Rock Climbing Club', '\u{1F9D7}', 'sport'),
  C('rowing', 'Rowing Club', '\u{1F6A3}', 'sport'),
  C('weightlifting', 'Weightlifting Club', '\u{1F3CB}\u{FE0F}', 'sport'),
  C('ultimate', 'Ultimate Frisbee Club', '\u{1F94F}', 'sport'),
  C('equestrian', 'Equestrian Club', '\u{1F3C7}', 'sport'),
  C('yoga', 'Yoga Club', '\u{1F9D8}', 'sport'),
  // Music
  C('choir', 'Choir', '\u{1F3B6}', 'music'),
  C('concert_band', 'Concert Band', '\u{1F3BA}', 'music'),
  C('jazz_band', 'Jazz Band', '\u{1F3B7}', 'music', { tryout: true }),
  C('marching_band', 'Marching Band', '\u{1F941}', 'music'),
  C('orchestra', 'Orchestra', '\u{1F3BB}', 'music', { tryout: true }),
  C('glee', 'Glee Club', '\u{1F3A4}', 'music', { tryout: true }),
  // Arts
  C('art', 'Art Club', '\u{1F3A8}', 'arts'),
  C('drama', 'Drama Club', '\u{1F3AD}', 'arts', { tryout: true }),
  C('improv', 'Improv Club', '\u{1F92A}', 'arts'),
  C('creative_writing', 'Creative Writing Club', '\u{2328}\u{FE0F}', 'arts'),
  C('poetry', 'Poetry Club', '\u{1F4DD}', 'arts'),
  C('pottery', 'Pottery Club', '\u{1F3FA}', 'arts'),
  C('photography', 'Photography Club', '\u{1F4F7}', 'arts'),
  C('film', 'Film Club', '\u{1F3A5}', 'arts'),
  C('dance', 'Dance Club', '\u{1F483}', 'arts'),
  C('fashion', 'Fashion Club', '\u{1F457}', 'arts'),
  C('makeup', 'Makeup Artists Club', '\u{1F484}', 'arts'),
  // Academic
  C('decathlon', 'Academic Decathlon Club', '\u{1F9E0}', 'academic', { tryout: true, minGrades: 75 }),
  C('honor_society', 'Honor Society', '\u{1F393}', 'academic', { minGrades: 85 }),
  C('chess', 'Chess Club', '\u{265F}\u{FE0F}', 'academic'),
  C('math', 'Math Club', '\u{2797}', 'academic'),
  C('science', 'Science Club', '\u{1F9EC}', 'academic'),
  C('robotics', 'Robotics Club', '\u{1F916}', 'academic'),
  C('computer_science', 'Computer Science Club', '\u{1F5A5}\u{FE0F}', 'academic'),
  C('book', 'Book Club', '\u{1F4DA}', 'academic'),
  C('debate', 'Speech & Debate', '\u{1F4AC}', 'academic', { tryout: true }),
  C('languages', 'Foreign Language Club', '\u{1F5E3}\u{FE0F}', 'academic'),
  C('history', 'History Club', '\u{1F5FA}\u{FE0F}', 'academic'),
  C('astronomy', 'Astronomy Club', '\u{1F52D}', 'academic'),
  C('business', 'Business Club', '\u{1F4CA}', 'academic'),
  C('investing', 'Investing Club', '\u{1F3E6}', 'academic'),
  C('web_design', 'Web Design Club', '\u{1F4BB}', 'academic'),
  // Hobbies
  C('anime', 'Anime Club', '\u{1F38E}', 'hobby'),
  C('cosplay', 'Cosplay Club', '\u{1F9D9}', 'hobby'),
  C('dnd', 'Dungeons & Dragons Club', '\u{1F432}', 'hobby'),
  C('video_games', 'Video Games Club', '\u{1F3AE}', 'hobby'),
  C('board_games', 'Board Games Club', '\u{1F3B2}', 'hobby'),
  C('skateboarding', 'Skateboarding Club', '\u{1F6F9}', 'hobby'),
  C('magic', 'Magic Club', '\u{1F3A9}', 'hobby'),
  C('juggling', 'Juggling Club', '\u{1F939}', 'hobby'),
  C('cooking', 'Cooking Club', '\u{1F958}', 'hobby'),
  C('baking', 'Baking Club', '\u{1F36A}', 'hobby'),
  C('agriculture', 'Agriculture Club', '\u{1F411}', 'hobby'),
  C('outdoors', 'Outdoors Club', '\u{1F3DE}\u{FE0F}', 'hobby'),
  C('fishing', 'Fishing Club', '\u{1F3A3}', 'hobby'),
  C('automotive', 'Automotive Club', '\u{1F697}', 'hobby'),
  C('knitting', 'Knitting Club', '\u{1F9F6}', 'hobby'),
  // Service & student life
  C('student_council', 'Student Council', '\u{1F5F3}\u{FE0F}', 'service', { minPopularity: 60 }),
  C('key_club', 'Key Club', '\u{1F511}', 'service'),
  C('yearbook', 'Yearbook Club', '\u{1F4D4}', 'service'),
  C('journalism', 'Journalism Club', '\u{1F4F0}', 'service'),
  C('broadcasting', 'Broadcasting Club', '\u{1F399}\u{FE0F}', 'service'),
  C('environment', 'Environment Club', '\u{1F333}', 'service'),
  C('recycling', 'Recycling Club', '\u{267B}\u{FE0F}', 'service'),
  C('animal_rights', 'Animal Rights Club', '\u{1F436}', 'service'),
  C('habitat', 'Habitat Builders Club', '\u{1F3E1}', 'service'),
  C('red_cross', 'First Aid Club', '\u{1FA79}', 'service'),
  C('tutoring', 'Tutoring Club', '\u{1F9D1}\u{200D}\u{1F3EB}', 'service'),
  C('sign_language', 'Sign Language Club', '\u{1F91F}', 'service'),
  C('religious', 'Religious Club', '\u{1F64F}', 'service'),
  C('military', 'Military Club', '\u{1F396}\u{FE0F}', 'service'),
]

const CLUB_INDEX: Record<string, ClubDef> = Object.fromEntries(CLUBS.map((c) => [c.id, c]))

const CLUB_TALENTS: Record<string, TalentId> = {
  drama: 'Acting',
  film: 'Acting',
  improv: 'Comedy',
  creative_writing: 'Writing',
  poetry: 'Writing',
  journalism: 'Writing',
  yearbook: 'Writing',
  art: 'Art',
  pottery: 'Art',
  photography: 'Art',
  fashion: 'Modeling',
  makeup: 'Modeling',
  dance: 'Athletics',
  computer_science: 'Programming',
  web_design: 'Programming',
  robotics: 'Programming',
  business: 'Business',
  investing: 'Investing',
  debate: 'Leadership',
  student_council: 'Leadership',
  video_games: 'Gaming',
  cooking: 'Cooking',
  baking: 'Cooking',
  broadcasting: 'Comedy',
}

/** The special talent that gives you an edge in a school club or team (null if none does). */
function clubTalent(def: ClubDef): TalentId | null {
  const byId = CLUB_TALENTS[def.id]
  if (byId) return byId
  if (def.kind === 'sport') return 'Athletics'
  if (def.kind === 'music') return 'Music'
  if (def.kind === 'academic') return 'Academics'
  return null
}

function clubGifted(g: GameState, def: ClubDef): boolean {
  const t = clubTalent(def)
  return !!t && hasTalent(g, t)
}

// Local sports ------------------------------------------------------------------
// The sports a country actually plays (locale.sports) come first in the Sports list, under their
// local names ("Football Team" in Britain means soccer). Local sports with no club of their own
// (sepak takraw, kabaddi, hurling, handball...) get one: id 'local:<sport>', stored like any club.

const LOCAL_CLUB = 'local:'

/** Locale sport word → existing club id. 'football' and 'hockey' depend on the country (see sportClubId). */
const SPORT_CLUBS: Record<string, string> = {
  soccer: 'soccer',
  basketball: 'basketball',
  volleyball: 'volleyball',
  tennis: 'tennis',
  cricket: 'cricket',
  boxing: 'boxing',
  rugby: 'rugby',
  'rugby league': 'rugby',
  'rugby sevens': 'rugby',
  baseball: 'baseball',
  badminton: 'badminton',
  'ice hockey': 'ice_hockey',
  'field hockey': 'field_hockey',
  wrestling: 'wrestling',
  'lucha libre': 'wrestling',
  athletics: 'track',
  track: 'track',
  'long-distance running': 'cross_country',
  'table tennis': 'table_tennis',
  'water polo': 'water_polo',
  swimming: 'swim',
  weightlifting: 'weightlifting',
  softball: 'softball',
  golf: 'golf',
  gymnastics: 'gymnastics',
  fencing: 'fencing',
  archery: 'archery',
  curling: 'curling',
  lacrosse: 'lacrosse',
  buzkashi: 'goat_grabbing',
  kokpar: 'goat_grabbing',
}

/** Popular, but not something a school has a team for. */
const NOT_SCHOOL_SPORTS = new Set(['horse racing', 'speedway', 'rodeo', 'darts', 'billiards'])

const MARTIAL_ARTS = /judo|taekwondo|karate|kendo|muay thai|jiu-jitsu|pencak silat|sumo|kung fu|wushu/i

const LOCAL_SPORT_EMOJI: [RegExp, string][] = [
  [/handball/, '\u{1F93E}'],
  [/futsal|gaelic/, '\u{26BD}'],
  [/aussie rules/, '\u{1F3C9}'],
  [/hurling|floorball|bandy|roller hockey/, '\u{1F3D1}'],
  [/cycling/, '\u{1F6B4}'],
  [/mountain biking/, '\u{1F6B5}'],
  [/surf/, '\u{1F3C4}'],
  [/ski|biathlon/, '\u{26F7}\u{FE0F}'],
  [/skating/, '\u{26F8}\u{FE0F}'],
  [/sailing/, '\u{26F5}'],
  [/kayak/, '\u{1F6F6}'],
  [/dragon boat/, '\u{1F6A3}'],
  [/kabaddi|sumo/, '\u{1F93C}'],
  [MARTIAL_ARTS, '\u{1F94B}'],
  [/takraw|ecuavolley|netball/, '\u{1F3D0}'],
  [/korfball/, '\u{1F3C0}'],
  [/pesäpallo/, '\u{26BE}'],
  [/kirikiti/, '\u{1F3CF}'],
  [/padel|squash|beach tennis/, '\u{1F3BE}'],
  [/matkot|pickleball/, '\u{1F3D3}'],
  [/shuttlecock/, '\u{1F3F8}'],
]

function localSportClub(sport: string): ClubDef {
  const emoji = LOCAL_SPORT_EMOJI.find(([re]) => re.test(sport.toLowerCase()))?.[1] ?? '\u{1F3C5}'
  const martial = MARTIAL_ARTS.test(sport)
  return { id: LOCAL_CLUB + sport, name: `${titleCase(sport)} ${martial ? 'Club' : 'Team'}`, emoji, kind: 'sport', tryout: !martial }
}

/** The club for a locale sport word, or null if it needs a local club. */
function sportClubId(g: GameState, sport: string): string | null {
  const s = sport.toLowerCase()
  // 'football' is American football in the US and soccer everywhere else; 'hockey' is ice hockey
  // where the locale doesn't say (the US and Canada).
  if (s === 'football') return isUS(g) || g.character.countryId === 'ca' ? 'football' : 'soccer'
  if (s === 'hockey') return 'ice_hockey'
  return SPORT_CLUBS[s] ?? null
}

/** Club ids for the sports this country plays, most popular first. */
function localSportClubIds(g: GameState): string[] {
  const out: string[] = []
  for (const sport of locale(g).sports) {
    if (NOT_SCHOOL_SPORTS.has(sport.toLowerCase())) continue
    const id = sportClubId(g, sport) ?? LOCAL_CLUB + sport
    if (!out.includes(id)) out.push(id)
  }
  return out
}

/** Clubs that only make sense in a few countries. */
const CLUB_ONLY: Record<string, string[]> = {
  key_club: ['us', 'ca'],
  lacrosse: ['us', 'ca'],
}

/** The club's name where the player lives ("Football Team" for soccer in most of the world). */
function localClubName(g: GameState, def: ClubDef): string {
  const cid = g.character.countryId
  const usStyle = cid === 'us' || cid === 'ca'
  switch (def.id) {
    case 'soccer':
      return !usStyle && locale(g).sports.some((s) => s.toLowerCase() === 'football') ? 'Football Team' : def.name
    case 'football':
      return usStyle ? def.name : 'American Football Team'
    case 'decathlon':
      return usStyle ? def.name : 'Academic Olympiad Team'
    case 'honor_society':
      return usStyle || cid === 'ph' ? def.name : 'Top Students Society'
    default:
      return def.name
  }
}

/** A club by id, with its local name when `g` is given. Handles 'local:<sport>' clubs. */
function clubDef(id: string, g?: GameState): ClubDef | undefined {
  const base = id.startsWith(LOCAL_CLUB) ? localSportClub(id.slice(LOCAL_CLUB.length)) : CLUB_INDEX[id]
  if (!base || !g) return base
  return { ...base, name: localClubName(g, base) }
}

/** Every club a student here can join: local sports first, then everything that fits the country. */
function localClubs(g: GameState): ClubDef[] {
  const cid = g.character.countryId
  const local = localSportClubIds(g)
  const snow = hasSnow(g)
  const out: ClubDef[] = []
  for (const id of local) {
    const def = clubDef(id, g)
    if (def) out.push(def)
  }
  for (const base of CLUBS) {
    if (local.includes(base.id)) continue
    const only = CLUB_ONLY[base.id]
    if (only && !only.includes(cid)) continue
    // No curling or ice hockey team in the tropics.
    if ((base.id === 'curling' || base.id === 'ice_hockey') && !snow) continue
    out.push(clubDef(base.id, g) ?? base)
  }
  return out
}

const MAX_CLUBS = 3

interface CliqueCtx {
  g: GameState
  cur: Enrollment
  clubs: ClubDef[]
  memberships: ClubRec[]
}

interface CliqueDef {
  id: string
  name: string
  emoji: string
  blurb: string
  gender?: Gender
  /** Rejection from these hurts your popularity. */
  elite?: boolean
  /** Popularity change when you get in. */
  boost: number
  fits: (x: CliqueCtx) => boolean
}

const hasClub = (x: CliqueCtx, ids: string[]) => x.clubs.some((c) => ids.includes(c.id))
const hasKind = (x: CliqueCtx, kind: ClubKind) => x.clubs.some((c) => c.kind === kind)

export const CLIQUES: CliqueDef[] = [
  { id: 'artsy', name: 'Artsy Kids', emoji: '\u{1F5BC}\u{FE0F}', blurb: 'You must be artistically inclined to join this creative clique.', boost: 3, fits: (x) => hasClub(x, ['art', 'creative_writing', 'poetry', 'pottery', 'photography', 'film', 'fashion']) },
  { id: 'band', name: 'Band Geeks', emoji: '\u{1F3BA}', blurb: 'You must enjoy blowing on or plucking instruments to join this clique.', boost: 2, fits: (x) => hasClub(x, ['concert_band', 'jazz_band', 'orchestra', 'marching_band']) },
  { id: 'brainy', name: 'Brainy Kids', emoji: '\u{1F9E0}', blurb: 'You must have high smarts and grades to join this clique.', boost: 3, fits: (x) => x.g.character.stats.smarts >= 75 && x.cur.grades >= 80 && popularity(x.cur) < 80 },
  { id: 'drama', name: 'Drama Kids', emoji: '\u{1F3AD}', blurb: 'You must be obsessed with Broadway musicals and aspire to do theatre to join this clique.', boost: 3, fits: (x) => hasClub(x, ['drama', 'improv', 'glee']) },
  { id: 'gamers', name: 'Gamers', emoji: '\u{1F3AE}', blurb: 'You must be obsessed with gaming and gamer culture to join this clique.', boost: 1, fits: (x) => hasClub(x, ['video_games', 'board_games', 'dnd']) },
  { id: 'goths', name: 'Goths', emoji: '\u{1F5A4}', blurb: 'You must enjoy dark attire and makeup to join this post-punk clique.', boost: 0, fits: (x) => x.g.character.stats.happiness < 55 && popularity(x.cur) < 55 },
  { id: 'hipsters', name: 'Hipsters', emoji: '\u{1F192}', blurb: 'You must flaunt varied non-mainstream sensibilities to join this clique.', boost: 4, fits: (x) => popularity(x.cur) >= 30 },
  { id: 'jocks', name: 'Jocks', emoji: '\u{1F4AA}', blurb: 'You must be an athlete with little interest in intellectual culture to join this clique.', gender: 'male', elite: true, boost: 10, fits: (x) => x.memberships.some((m) => clubDef(m.id)?.kind === 'sport' && m.perf >= 50) },
  { id: 'loners', name: 'Loners', emoji: '\u{1F6B6}', blurb: 'You must be disliked and unhappy to join this very lonely clique.', boost: -4, fits: (x) => x.g.character.stats.happiness < 45 && popularity(x.cur) < 35 },
  { id: 'mean', name: 'Mean Girls', emoji: '\u{1F64E}\u{200D}\u{2640}\u{FE0F}', blurb: 'You must engage in gossip and crave popularity to join this elite clique.', gender: 'female', elite: true, boost: 12, fits: (x) => popularity(x.cur) >= 75 && x.g.character.stats.looks >= 55 },
  { id: 'nerds', name: 'Nerds', emoji: '\u{1F913}', blurb: 'You must be seen as overly intellectual or introverted to join this clique.', boost: -2, fits: (x) => popularity(x.cur) < 55 && hasKind(x, 'academic') },
  { id: 'normals', name: 'Normals', emoji: '\u{1F642}', blurb: 'You must be devoid of abnormalities to join this extremely average clique.', boost: 2, fits: (x) => x.cur.grades >= 40 && x.cur.grades <= 85 && popularity(x.cur) >= 25 && popularity(x.cur) <= 75 },
  { id: 'popular', name: 'Popular Kids', emoji: '\u{1F60E}', blurb: 'You must be among the most popular kids in school to join this clique.', elite: true, boost: 15, fits: (x) => popularity(x.cur) >= 75 && x.g.character.stats.looks >= 55 },
  { id: 'skaters', name: 'Skaters', emoji: '\u{1F6F9}', blurb: 'You must dedicate your life to skating to join this rebellious clique.', boost: 4, fits: (x) => hasClub(x, ['skateboarding']) },
  { id: 'floaters', name: 'Social Floaters', emoji: '\u{1F388}', blurb: 'You must demonstrate an uncanny ability to slip in with different groups to join this clique.', boost: 6, fits: (x) => popularity(x.cur) >= 60 },
  { id: 'talented', name: 'Talented Kids', emoji: '\u{1F4AF}', blurb: 'You must be multi-talented to join this special clique.', boost: 8, fits: (x) => popularity(x.cur) >= 55 && x.cur.grades >= 70 && hasKind(x, 'sport') && (hasKind(x, 'music') || hasKind(x, 'arts')) },
  { id: 'troublemakers', name: 'Troublemakers', emoji: '\u{1F63C}', blurb: 'You must frequently get up to trouble in school to join this dubious clique.', boost: 5, fits: (x) => num(x.cur.data.warnings, 0) >= 1 || x.g.character.hidden.craziness >= 55 || yearActionsUsed(x.g, 'skipSchool') >= 2 },
  { id: 'weebs', name: 'Weebs', emoji: '\u{1F38E}', blurb: 'You must be obsessed with Japanese culture to join this strange clique.', boost: 0, fits: (x) => hasClub(x, ['anime', 'cosplay', 'dnd']) },
]

function cliqueDef(id: string | null, g?: GameState): CliqueDef | undefined {
  const def = id ? CLIQUES.find((c) => c.id === id) : undefined
  if (!def || !g || isUS(g)) return def
  if (def.id === 'drama') return { ...def, blurb: 'You must be obsessed with musicals and aspire to a life on the stage to join this clique.' }
  // Being into Japanese culture isn't a clique in Japan.
  if (def.id === 'weebs' && g.character.countryId === 'jp') return { ...def, name: 'Otaku', blurb: 'You must be obsessed with anime, manga and idol groups to join this clique.' }
  return def
}

function cliqueCtx(g: GameState, cur: Enrollment): CliqueCtx {
  const memberships = clubsOf(cur)
  return { g, cur, memberships, clubs: memberships.map((m) => clubDef(m.id)).filter((c): c is ClubDef => !!c) }
}

function canHaveActivities(cur: Enrollment): boolean {
  return cur.level === 'middle' || cur.level === 'high' || cur.level === 'university' || cur.level === 'community'
}

// ---------------------------------------------------------------------------
// Yearly hook

export function yearlyEducation(g: GameState): void {
  const c = g.character
  if (!c.alive) return
  const ed = c.education
  const sys = systemFor(g)

  if (c.prison) {
    const cur = ed.current
    if (cur) {
      if (cur.level !== 'preschool' && c.age >= sys.dropOutAge) ed.droppedOut.push(cur.level)
      log(g, `Being locked up meant I could no longer attend ${cur.school}.`, 'bad')
      leaveSchool(g, 'prison')
    }
    return
  }

  if (ed.current) {
    advanceSchoolYear(g, sys)
    return
  }

  // Preschool (optional) and compulsory schooling.
  if (c.age === 3 && sys.startAge - 3 >= 2 && chance(g, 0.55)) {
    const cur = enrollIn(g, 'preschool', { totalYears: sys.startAge - 3 })
    log(g, `My parents enrolled me at ${cur.school}.`, 'neutral')
    return
  }
  catchUpEnrollment(g, sys)
}

/** Enroll a school-age child who isn't in school (new life, released from juvie, moved country...). */
function catchUpEnrollment(g: GameState, sys: SchoolSystem): void {
  const c = g.character
  const ed = c.education
  if (ed.current || hasHighSchool(g) || ed.completed.includes('high')) return
  if (c.age < sys.startAge || c.age >= graduationAge(sys)) return
  const leftK12 = ed.droppedOut.some((l) => isK12(l))
  if (leftK12 && c.age >= sys.dropOutAge) return
  const slot = levelForAge(sys, c.age)
  if (!slot) return
  const cur = enrollIn(g, slot.spec.level, { year: slot.year, totalYears: slot.spec.years, quiet: true })
  if (slot.spec.level === 'elementary' && slot.year === 1) {
    log(g, pick(g, [`I started ${cur.school}. Backpack: on. Fear: maximum.`, `I started my first day at ${cur.school}.`, `It was my first day of school at ${cur.school}.`]), 'good')
  } else {
    log(g, `I started attending ${cur.school} (${gradeLevelLabel(g, cur)}).`, 'neutral')
  }
}

function advanceSchoolYear(g: GameState, sys: SchoolSystem): void {
  const c = g.character
  const cur = c.education.current
  if (!cur) return
  updateGrades(g, cur)
  updateSocial(g, cur)
  cur.year += 1
  if (cur.year > cur.totalYears) {
    finishLevel(g, sys, cur)
    return
  }
  chargeTuition(g, cur)
  refreshStaff(g, cur)
  yearlySchoolEvents(g, cur)
}

function updateGrades(g: GameState, cur: Enrollment): void {
  if (cur.level === 'preschool') return
  const c = g.character
  // Smarts 30 → D-, 50 → C-, 70 → B-, 90 → A-. (0.75x+15 left most average kids with an F.)
  let target = c.stats.smarts * 0.5 + 45
  const clique = cliqueOf(cur)
  if (clique === 'brainy' || clique === 'nerds') target += 6
  if (clique === 'troublemakers' || clique === 'popular') target -= 5
  if (c.partTimeJob) target -= 4
  if (c.stats.happiness < 25) target -= 6
  // Academics talent: school just clicks.
  if (hasTalent(g, 'Academics')) target += 8
  // Better schools push you harder (and the kids next to you study more).
  const tier = rankOf(g, cur.level, cur.school).tier
  target += TIER_GRADE_EDGE[tier]
  target = clamp(target)
  addGrades(cur, (target - cur.grades) * 0.35 + randInt(g, -6, 6))
  // Studying keeps your brain in shape.
  if (cur.grades >= 85 && chance(g, hasTalent(g, 'Academics') ? 0.6 : 0.35)) addStat(g, 'smarts', 1)
  if ((tier === 'Elite' && chance(g, 0.35)) || (tier === 'Top' && chance(g, 0.2))) addStat(g, 'smarts', 1)
}

function updateSocial(g: GameState, cur: Enrollment): void {
  if (cur.level === 'preschool') return
  const c = g.character
  let target = c.stats.looks * 0.45 + c.stats.happiness * 0.15 + 15
  const clique = cliqueDef(cliqueOf(cur))
  if (clique) target += clique.boost
  const memberships = clubsOf(cur)
  if (memberships.some((m) => clubDef(m.id)?.kind === 'sport')) target += 8
  if (memberships.some((m) => m.role)) target += 5
  addPopularity(cur, (clamp(target) - popularity(cur)) * 0.2 + randInt(g, -4, 4))

  // Clubs: performance drifts, members can be cut, standouts get leadership roles.
  const kept: ClubRec[] = []
  for (const m of memberships) {
    const def = clubDef(m.id, g)
    if (!def) continue
    m.years += 1
    m.name = def.name
    m.kind = def.kind
    const athletic = (def.kind === 'sport' ? (c.hidden.athleticism - 50) / 10 : (c.stats.smarts - 50) / 15) + (clubGifted(g, def) ? 4 : 0)
    m.perf = Math.round(clamp(m.perf + athletic + randInt(g, -7, 7)))
    if (def.kind === 'sport') {
      addHidden(g, 'athleticism', randInt(g, 0, 2))
      addStat(g, 'health', 1)
    }
    if ((def.tryout && cur.grades < 35) || m.perf < 12) {
      const coach = def.kind === 'sport' ? 'coach' : 'club sponsor'
      const why = cur.grades < 35 ? 'your grades are too low to stay eligible' : 'you just weren’t pulling your weight'
      notice(g, def.name, `The ${coach} kicked you off the ${def.name} because ${why}.`, { emoji: def.emoji, tone: 'bad' })
      log(g, `I was kicked off the ${def.name}.`, 'bad')
      addPopularity(cur, -4)
      continue
    }
    kept.push(m)
  }
  setClubs(cur, kept)
}

function chargeTuition(g: GameState, cur: Enrollment): void {
  const tuition = num(cur.data.tuition, 0)
  if (tuition <= 0) return
  if (cur.funding === 'loans') {
    const loan = g.character.loans.find((l) => l.id === str(cur.data.loanId))
    if (loan) loan.balance = Math.round(loan.balance + tuition)
    else createStudentLoan(g, cur, tuition)
  } else if (cur.funding === 'parents') {
    billParents(g, tuition)
  }
}

function refreshStaff(g: GameState, cur: Enrollment): void {
  const classmates = schoolPeople(g, cur, 'classmate')
  if (classmates.length < 3) createClassmates(g, cur, randInt(g, 1, 2))
  else if (classmates.length < 7 && chance(g, 0.3)) createClassmates(g, cur, 1)
  // K-12 students get new teachers as they move up a grade.
  if (isK12(cur.level)) {
    const teachers = schoolPeople(g, cur, 'teacher')
    if (teachers.length > 0 && chance(g, 0.5)) {
      const leaving = pick(g, teachers)
      g.people = g.people.filter((p) => p.id !== leaving.id)
    }
    if (schoolPeople(g, cur, 'teacher').length < 2) createTeacher(g, cur)
  } else if (schoolPeople(g, cur, 'teacher').length === 0) {
    createTeacher(g, cur)
  }
}

const REPORT_COMMENTS: Record<'great' | 'good' | 'ok' | 'bad', string[]> = {
  great: ['A joy to have in class.', 'Brilliant work all year. Keep it up!', 'Sets the curve, and everyone hates it.', 'Could teach this class, honestly.'],
  good: ['Solid effort, consistently good work.', 'Participates well and turns work in on time.', 'A pleasure, when not talking to friends.', 'Shows real promise.'],
  ok: ['Capable of much more.', 'Needs to spend less time staring out the window.', 'Has potential, if only homework existed in their universe.', 'Average. Gloriously, aggressively average.'],
  bad: ['Please schedule a parent-teacher conference.', 'Has turned in more excuses than assignments.', 'I have run out of red ink.', 'Was physically present. Mostly.'],
}

const TROUBLE_REASONS = ['setting off a stink bomb', 'starting a food fight', 'graffiti in the bathroom', 'pulling the fire alarm', 'releasing a frog in the staff room', 'selling the answers to a test']

/** Club leadership offers you turned down don't come back for a few years. */
const ROLE_OFFER_COOLDOWN = 3

// School moments --------------------------------------------------------------
// One-line memories of school life, in the player's own country: snow days only where it snows,
// school trips to local landmarks, the local lunch. Each line waits years before it can come back.

interface SchoolMoment {
  id: string
  when: (g: GameState, cur: Enrollment) => boolean
  lines: (g: GameState, cur: Enrollment) => string[]
  tone?: 'good' | 'bad' | 'neutral'
}

const MOMENT_COOLDOWN = 5
const isPost = (cur: Enrollment) => cur.level === 'university' || cur.level === 'community' || cur.level === 'graduate'

const SCHOOL_MOMENTS: SchoolMoment[] = [
  {
    id: 'snowDay',
    when: (g, cur) => isK12(cur.level) && hasSnow(g),
    lines: () => [
      'School was canceled for a snow day. I built a snowman that looked suspiciously like my teacher.',
      'We got two snow days in a row. I spent both of them sledding and neither of them doing homework.',
      'A blizzard shut the school down for a day. I celebrated by doing absolutely nothing.',
    ],
    tone: 'good',
  },
  {
    id: 'rainDay',
    when: (g, cur) => isK12(cur.level) && !hasSnow(g) && locale(g).climate === 'tropical',
    lines: () => [
      'A tropical downpour flooded the road to school and class was canceled. Best. Day. Ever.',
      'The rainy season turned our schoolyard into a lake. Recess was a swimming lesson.',
    ],
    tone: 'good',
  },
  {
    id: 'heatDay',
    when: (g, cur) => isK12(cur.level) && locale(g).climate === 'arid',
    lines: () => ['It got so hot that school let out early. I spent the afternoon lying in front of a fan.', 'A heatwave melted the crayons in our classroom. And my will to learn.'],
  },
  {
    id: 'trip',
    when: (_g, cur) => isK12(cur.level),
    lines: (g) => {
      const trip = isUS(g) ? 'field trip' : 'school trip'
      return [`My class went on a ${trip} to {landmark}. Somebody threw up on the bus.`, `Our ${trip} to {landmark} was the best day of the year, mostly because there was no math.`, `I got separated from my class on a ${trip} to {landmark} and had the best hour of my life.`]
    },
    tone: 'good',
  },
  {
    id: 'lunch',
    when: (_g, cur) => isK12(cur.level),
    lines: (g) => {
      const where = isUS(g) ? 'cafeteria' : 'school canteen'
      return [`The ${where} served {food} every Friday. I have opinions.`, "I traded my lunch for a classmate's {food}. Best deal I ever made.", `I got caught sneaking {food} into class. The smell gave me away.`]
    },
  },
  {
    id: 'team',
    when: (_g, cur) => cur.level === 'middle' || cur.level === 'high',
    lines: () => ["Our school's {sport} team made it to the regional finals. I cheered until I lost my voice.", "Our school's {sport} team lost every single game this year. We were famous for it."],
  },
  {
    id: 'examTalk',
    when: (_g, cur) => cur.level === 'high' && cur.year >= cur.totalYears - 1,
    lines: (g) => [`Everyone at school talked about nothing but ${finalExam(g)}. I started having nightmares about it.`, `My parents brought up ${finalExam(g)} at every single meal.`],
  },
  {
    id: 'campusFood',
    when: (_g, cur) => isPost(cur),
    lines: () => ['I survived a whole semester on instant noodles and stubbornness.', 'I learned to cook exactly one dish. I ate it every day for a year.'],
  },
  {
    id: 'campusLife',
    when: (_g, cur) => isPost(cur),
    lines: (g) => [`I fell asleep in a lecture and woke up to the whole class staring at me.`, `My roommate and I stayed up all night arguing about ${g.character.education.current?.major ?? 'the meaning of life'}.`],
  },
]

function schoolMoment(g: GameState, cur: Enrollment): void {
  if (!chance(g, 0.4)) return
  const raw = g.flags['edu.moments']
  const seen: Record<string, Json> = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const age = g.character.age
  const ready = SCHOOL_MOMENTS.filter((m) => {
    const last = seen[m.id]
    return m.when(g, cur) && !(typeof last === 'number' && age - last < MOMENT_COOLDOWN && age >= last)
  })
  if (!ready.length) return
  const m = pick(g, ready)
  const text = fillLocal(g, pickFresh(g, `edu.moment.${m.id}`, m.lines(g, cur)))
  if (/\{\w+\}/.test(text)) return // a locale without that kind of word: skip it rather than show a {token}
  g.flags['edu.moments'] = { ...seen, [m.id]: age }
  log(g, text, m.tone ?? 'neutral')
}

function yearlySchoolEvents(g: GameState, cur: Enrollment): void {
  if (cur.level === 'preschool') return
  if (isK12(cur.level) && chance(g, 0.3)) {
    const band = cur.grades >= 88 ? 'great' : cur.grades >= 75 ? 'good' : cur.grades >= 60 ? 'ok' : 'bad'
    const teacher = schoolPeople(g, cur, 'teacher')[0]
    const signer = teacher ? teacherTitle(teacher) : 'Your teacher'
    notice(
      g,
      'Report Card',
      `Your report card from ${cur.school} came in. Overall grade: ${gradeLetter(cur.grades)}.\n\n${signer} wrote: "${pickFresh(g, 'edu.reportComments', REPORT_COMMENTS[band], 3)}"`,
      { emoji: band === 'bad' ? '\u{1F4C9}' : '\u{1F4DD}', tone: band === 'bad' ? 'bad' : band === 'great' ? 'good' : 'neutral' },
    )
    const ps = parents(g)
    if (band === 'great') for (const p of ps) addRelationship(p, 3)
    if (band === 'bad') for (const p of ps) addRelationship(p, -4)
  }
  // Troublemakers get into trouble (a different kind each time).
  if (cliqueOf(cur) === 'troublemakers' && chance(g, 0.25)) {
    schoolWarning(g, pickFresh(g, 'edu.troubleReasons', TROUBLE_REASONS, 3))
  }
  // Leadership offers for standout members (unless you just got expelled).
  if (current(g) !== cur) return
  schoolMoment(g, cur)
  const clubs = clubsOf(cur)
  const offersRaw = cur.data.roleOffers
  const offers: Record<string, Json> = offersRaw && typeof offersRaw === 'object' && !Array.isArray(offersRaw) ? offersRaw : {}
  const age = g.character.age
  const star = clubs.find((m) => {
    const last = offers[m.id]
    return !m.role && m.perf >= 80 && m.years >= 1 && !(typeof last === 'number' && age - last < ROLE_OFFER_COOLDOWN && age >= last)
  })
  if (star && chance(g, 0.35)) {
    const def = clubDef(star.id, g)
    if (def) {
      cur.data.roleOffers = { ...offers, [star.id]: age }
      const role = def.kind === 'sport' ? 'team captain' : 'club president'
      scriptChoice(
        g,
        CLUB_ROLE,
        def.name,
        `Your fellow ${def.kind === 'sport' ? 'teammates' : 'members'} in the ${def.name} at ${cur.school} want you to become ${role}. What will you do?`,
        [
          { id: 'accept', label: `Become ${role}`, emoji: '\u{1F451}' },
          { id: 'decline', label: 'Turn it down', emoji: '\u{1F645}' },
        ],
        { emoji: def.emoji, data: { club: def.id, role } },
      )
    }
  }
  // A small chance of being picked on at high school if you're unpopular is handled by the event library;
  // here we only nudge happiness by social standing.
  const pop = popularity(cur)
  if (pop >= 80) addStat(g, 'happiness', 2)
  else if (pop <= 15) addStat(g, 'happiness', -2)
}

// ---------------------------------------------------------------------------
// Finishing a level

function finishLevel(g: GameState, sys: SchoolSystem, cur: Enrollment): void {
  const c = g.character
  const ed = c.education
  cur.year = cur.totalYears
  const grades = cur.grades
  const prevClubs = clubsOf(cur)

  if (cur.level === 'preschool') {
    leaveSchool(g, 'graduated')
    const first = sys.levels[0]
    const next = enrollIn(g, first.level, { totalYears: first.years, quiet: true })
    log(g, pick(g, [`I graduated from preschool and started ${next.school}.`, `Goodbye nap time, hello ${next.school}.`]), 'good')
    return
  }

  if (cur.level === 'elementary' || cur.level === 'middle') {
    ed.completed.push(cur.level)
    const order = K12.indexOf(cur.level)
    const nextSpec = sys.levels.find((l) => K12.indexOf(l.level) > order)
    const old = cur.school
    leaveSchool(g, 'graduated')
    if (!nextSpec) return
    const next = enrollIn(g, nextSpec.level, { totalYears: nextSpec.years, grades, quiet: true })
    log(g, `I finished ${old} and started ${next.school}.`, 'good')
    maybeClubInvite(g, next)
    // Strong students in countries with selective schools get to try for one.
    if (next.level === 'high' && grades >= 65 && selectiveExamOpen(g)) offerSelectiveExam(g)
    return
  }

  if (cur.level === 'high') {
    ed.completed.push('high')
    const honors = grades >= 90
    const valedictorian = grades >= 96 && chance(g, 0.5)
    const valedictorianWord = VALEDICTORIAN_COUNTRIES.has(c.countryId)
    if (valedictorian) g.flags.valedictorian = cur.school
    sitFinalExam(g, cur)
    addDegree(g, 'highschool', `${stageTitle(g, 'high')} Diploma`, cur.school, { honors })
    const school = cur.school
    leaveSchool(g, 'graduated')
    addStat(g, 'happiness', 8)
    for (const p of parents(g)) addRelationship(p, 5)
    remember(g, `Graduated from ${school}${valedictorian ? (valedictorianWord ? ' as valedictorian' : ' at the top of the class') : honors ? ' with honors' : ''}.`)
    log(g, `I graduated from ${school}${honors ? ' with honors' : ''}.`, 'good')
    const extra = valedictorian
      ? valedictorianWord
        ? ' You were named valedictorian and gave a speech that only made two people cry (in a good way).'
        : ' You finished top of your class and gave a speech that only made two people cry (in a good way).'
      : honors
        ? ' You graduated with honors!'
        : grades < 60
          ? ' Somehow. Your diploma might as well say "barely".'
          : ''
    notice(g, 'Graduation', `${pick(g, [`You graduated from ${school}!`, `Caps in the air! You've graduated from ${school}.`, `You walked across the stage and collected your diploma from ${school}.`])}${extra}`, {
      emoji: '\u{1F393}',
      tone: 'good',
      ai: { when: 'full', facts: `The player graduated from ${school}${honors ? ' with honors' : ''}.` },
    })
    // Athletic scholarship for star athletes (a big American thing; rarer elsewhere).
    // Athletics talent: college scouts notice you sooner.
    const gifted = hasTalent(g, 'Athletics')
    const athlete = prevClubs.find((m) => clubDef(m.id)?.kind === 'sport' && clubDef(m.id)?.tryout && m.perf >= (gifted ? 62 : 70))
    const athletic = athlete && c.hidden.athleticism >= (gifted ? 45 : 50) && chance(g, (isUS(g) ? 0.65 : 0.35) + (gifted ? 0.15 : 0)) ? clubDef(athlete.id, g)?.name ?? null : null
    offerAfterHighSchool(g, athletic)
    return
  }

  if (cur.level === 'community') {
    ed.completed.push('community')
    const cc = college(g)
    addDegree(g, 'associate', cc.degree, cur.school, { honors: grades >= 90 })
    const school = cur.school
    leaveSchool(g, 'graduated')
    addStat(g, 'happiness', 5)
    log(g, `I graduated from ${school} with ${cc.degreeText}.`, 'good')
    remember(g, `Earned ${cc.degreeText} from ${school}.`)
    scriptChoice(
      g,
      AFTER_COMMUNITY,
      'Graduation',
      `You graduated from ${school} with ${cc.degreeText}! What's next?`,
      [
        { id: 'university', label: 'Transfer to a university', emoji: '\u{1F3DB}\u{FE0F}' },
        { id: 'work', label: 'Get a job', emoji: '\u{1F4BC}' },
        { id: 'break', label: 'Take a break', emoji: '\u{1F334}' },
      ],
      { emoji: '\u{1F393}' },
    )
    return
  }

  if (cur.level === 'university') {
    ed.completed.push('university')
    const major = cur.major ?? 'General Studies'
    const honors = grades >= 90
    const greek = str(cur.data.greek)
    addDegree(g, 'bachelor', `Bachelor's in ${major}`, cur.school, { major, honors })
    const school = cur.school
    leaveSchool(g, 'graduated')
    addStat(g, 'happiness', 10)
    addStat(g, 'smarts', randInt(g, 2, 5))
    for (const p of parents(g)) addRelationship(p, 6)
    remember(g, `Earned a bachelor's degree in ${major} from ${school}${honors ? ' with honors' : ''}.`)
    log(g, `I graduated from ${school} with a degree in ${major}${honors ? (VALEDICTORIAN_COUNTRIES.has(c.countryId) ? ' (summa cum laude)' : ' (with distinction)') : ''}.`, 'good')
    const greekLine = greek ? ` Your ${greek} brothers and sisters threw a party you will never remember.` : ''
    notice(g, 'Graduation', `${pick(g, [`You graduated from ${school} with a bachelor's degree in ${major}!`, `Congratulations! You earned your bachelor's degree in ${major} from ${school}.`])}${honors ? ' You graduated with honors!' : ''}${greekLine}`, {
      emoji: '\u{1F393}',
      tone: 'good',
      ai: { when: 'full', facts: `The player earned a bachelor's degree in ${major} from ${school}${honors ? ' with honors' : ''}.` },
    })
    const options = GRAD_ORDER.filter((k) => GRAD_ELIGIBILITY[k].includes(major))
    if (options.length > 0) {
      const choices: ChoiceOption[] = options.slice(0, 5).map((k) => ({ id: k, label: `Apply to ${PROGRAMS[k].label}`, emoji: PROGRAMS[k].emoji }))
      choices.push({ id: 'work', label: 'Enter the workforce', emoji: '\u{1F4BC}' })
      scriptChoice(g, AFTER_UNIVERSITY, "What's Next?", `Now that you have a degree in ${major}, what's next?`, choices, { emoji: '\u{1F914}' })
    }
    return
  }

  if (cur.level === 'graduate') {
    const track = (str(cur.data.track) || 'master') as GradKey
    const info = PROGRAMS[track] ?? PROGRAMS.master
    const major = cur.major ?? 'General Studies'
    ed.completed.push('graduate')
    addDegree(g, info.kind, info.degreeName(major), cur.school, { major: cur.major, honors: grades >= 90 })
    if (track === 'law' && !c.licenses.includes('law')) c.licenses.push('law')
    if (track === 'medical' && !c.licenses.includes('medical')) c.licenses.push('medical')
    const school = cur.school
    leaveSchool(g, 'graduated')
    addStat(g, 'happiness', 10)
    addStat(g, 'smarts', randInt(g, 2, 6))
    for (const p of parents(g)) addRelationship(p, 6)
    const doctor = ['md', 'dds', 'dvm', 'pharmd', 'doctorate'].includes(info.kind)
    remember(g, `Graduated from ${school} with a ${info.degreeName(major)}.`)
    log(g, `I graduated from ${school}.`, 'good')
    notice(
      g,
      'Graduation',
      `You graduated from ${school} and earned your ${info.degreeName(major)}!${doctor ? ` You can now insist people call you "Dr. ${c.lastName}".` : ''}`,
      { emoji: '\u{1F393}', tone: 'good', ai: { when: 'full', facts: `The player graduated from ${school} with a ${info.degreeName(major)}.` } },
    )
  }
}

/**
 * The school-leaving / entrance exam at the end of high school: the SATs in the US, the gaokao in
 * China, the Abitur in Germany... The score (0-100) helps university admissions.
 */
function sitFinalExam(g: GameState, cur: Enrollment): void {
  const c = g.character
  const prepped = Math.min(6, num(cur.data.examPrep, 0)) * 1.5
  const score = Math.round(clamp(c.stats.smarts * 0.55 + cur.grades * 0.35 + prepped + (hasTalent(g, 'Academics') ? 8 : 0) + randInt(g, -12, 12)))
  g.flags.examScore = score
  const exam = finalExam(g)
  const tone = score >= 65 ? 'good' : score >= 45 ? 'neutral' : 'bad'
  if (isUS(g)) {
    const sat = Math.max(400, Math.min(1600, Math.round((400 + score * 12) / 10) * 10))
    log(g, `I took ${exam} and scored ${sat}.${sat >= 1500 ? ' My parents framed the printout.' : sat < 800 ? ' I blame the pencil.' : ''}`, tone)
    return
  }
  const line =
    score >= 85
      ? pick(g, [`I aced ${exam}. My parents told every relative we have.`, `I aced ${exam}.`])
      : score >= 65
        ? `I did well on ${exam}.`
        : score >= 45
          ? pick(g, [`I scraped through ${exam}.`, `I passed ${exam}. Barely, but a pass is a pass.`])
          : pick(g, [`I bombed ${exam}.`, `I froze during ${exam} and bombed it.`])
  log(g, line, tone)
}

function offerAfterHighSchool(g: GameState, athletic: string | null): void {
  const c = g.character
  const free = getCountry(c.countryId).freeUniversity
  const uni = localTerm(g, 'university') || 'university'
  const choices: ChoiceOption[] = []
  if (athletic) choices.push({ id: 'athletic', label: free ? 'Join the university team' : isUS(g) ? 'Accept the athletic scholarship' : 'Accept the sports scholarship', emoji: '\u{1F3C5}' })
  choices.push({ id: 'university', label: free ? 'Go to university (free!)' : 'Go to university', emoji: '\u{1F3DB}\u{FE0F}' })
  choices.push({ id: 'community', label: `Go to ${college(g).term}`, emoji: '\u{1F3EB}' })
  choices.push({ id: 'work', label: 'Get a job', emoji: '\u{1F4BC}' })
  choices.push({ id: 'gap', label: 'Take a gap year', emoji: '\u{1F392}' })
  const after = stageTerm(g, 'high')
  const intro = !athletic
    ? 'What will you do now that you have your diploma?'
    : isUS(g)
      ? `A ${uni} recruiter saw you play for the ${athletic} and is offering you a full athletic scholarship! What will you do after ${after}?`
      : free
        ? `A university coach saw you play for the ${athletic} and wants you on the team. Tuition is free in ${getCountry(c.countryId).name} anyway, so it's mostly about the free tracksuit. What will you do after ${after}?`
        : `A university sports scout saw you play for the ${athletic} and is offering you a sports scholarship! What will you do after ${after}?`
  scriptChoice(g, AFTER_HIGH_SCHOOL, 'The Future', intro, choices, { emoji: '\u{1F914}', data: { athletic } })
}

function maybeClubInvite(g: GameState, cur: Enrollment): void {
  if (!canHaveActivities(cur) || !chance(g, 0.4)) return
  const options = localClubs(g).filter((c) => !c.tryout && !c.minGrades && !c.minPopularity)
  const club = pick(g, options)
  scriptChoice(
    g,
    CLUB_INVITE,
    'Extracurricular Activity',
    `Some kids starting ${cur.school} with you are encouraging you to join the ${club.name} with them. What will you do?`,
    [
      { id: 'join', label: 'Join the club with them', emoji: club.emoji },
      { id: 'no', label: "I'm not interested in that", emoji: '\u{1F645}' },
    ],
    { emoji: club.emoji, data: { club: club.id } },
  )
}

// ---------------------------------------------------------------------------
// Selective secondary schools (entrance exams)

/** Countries known for selective secondary schools, and what the entrance exam is called. */
const SELECTIVE_EXAMS: Record<string, string> = {
  gb: 'the 11-plus',
  sg: 'the PSLE',
  jp: 'the high school entrance exams',
  kr: 'the special-purpose high school exam',
  cn: 'the zhongkao',
  tw: 'the high school entrance exam',
  hk: 'the secondary school entrance test',
  in: 'the Navodaya entrance exam',
  ru: 'the lyceum entrance exam',
  ua: 'the lyceum entrance exam',
  fr: 'the lycée entrance test',
  de: 'the Gymnasium entrance test',
  nl: 'the Cito test',
  pl: 'the high school entrance exam',
  hu: 'the secondary school entrance exam',
  cz: 'the entrance exam',
  ro: 'the national evaluation exam',
  tr: 'the LGS',
  vn: 'the 10th-grade entrance exam',
  id: 'the selection test for a top SMA',
  th: 'the high school entrance exam',
  ph: 'the science high school entrance exam',
  my: 'the boarding school entrance exam',
  au: 'the selective schools test',
  us: 'the magnet school exam',
  mx: 'the COMIPEMS exam',
  br: 'the vestibulinho',
  ng: 'the Unity Schools entrance exam',
  ke: 'the national school selection',
  eg: 'the entrance exam',
  ir: 'the gifted schools exam',
  il: 'the entrance exam',
}

function selectiveExamName(g: GameState): string {
  return SELECTIVE_EXAMS[g.character.countryId] ?? 'the entrance exam'
}

/** The "Sit the entrance exam" action: first year of secondary school, once, not already at a top school. */
function selectiveExamOpen(g: GameState): boolean {
  const cur = current(g)
  if (!cur || cur.level !== 'high' || cur.year !== 1 || !(g.character.countryId in SELECTIVE_EXAMS)) return false
  if (g.flags.selectiveExamTaken === true) return false
  const tier = rankOf(g, 'high', cur.school).tier
  return tier !== 'Elite' && tier !== 'Top'
}

/** Offer the selective school's entrance exam (popup). */
function offerSelectiveExam(g: GameState): void {
  const cur = current(g)
  if (!cur || !selectiveExamOpen(g)) return
  const stage = localeLevel(systemFor(g), 'high')
  const name = rankedName(g, 'high', () => localSchoolName(g, stage), 0, cur.school, 30)
  const r = rankOf(g, 'high', name)
  const exam = selectiveExamName(g)
  scriptChoice(
    g,
    SELECTIVE_EXAM,
    'Selective School',
    `Your teachers think you could get into ${name} (${rankLabel(r)}). You'd have to pass ${exam} first. Will you sit it?`,
    [
      { id: 'sit', label: `Sit ${exam}`, emoji: '\u{1F4DD}' },
      { id: 'stay', label: `Stay at ${cur.school}`, emoji: '\u{1F3EB}' },
    ],
    { emoji: TIER_EMOJI[r.tier], data: { school: name } },
  )
}

const SELECTIVE_EXAM = defineScript('school.selectiveExam', (g, choice, data) => {
  const c = g.character
  const cur = current(g)
  if (!c.alive || !cur || cur.level !== 'high') return
  const school = data && typeof data === 'object' && !Array.isArray(data) && typeof data.school === 'string' ? data.school : ''
  if (!school || choice !== 'sit') {
    log(g, `I decided to stay at ${cur.school}.`, 'neutral')
    return
  }
  if (g.flags.selectiveExamTaken === true) return
  g.flags.selectiveExamTaken = true
  const r = rankOf(g, 'high', school)
  const exam = selectiveExamName(g)
  const prep = Math.min(6, num(cur.data.examPrep, 0)) * 1.5
  const score = c.stats.smarts * 0.55 + cur.grades * 0.35 + prep + randInt(g, -12, 12)
  const bar = r.tier === 'Elite' ? 74 : r.tier === 'Top' ? 66 : 58
  if (score < bar) {
    addStat(g, 'happiness', -randInt(g, 3, 7))
    log(g, `I didn't pass ${exam}.`, 'bad')
    notice(g, 'Not This Time', pick(g, [`You didn't make the cut for ${school}. ${cur.school} is fine. Probably.`, `You froze on the logic puzzles in ${exam}. ${school} will have to manage without you.`]), { emoji: '\u{1F4DD}', tone: 'bad' })
    return
  }
  const { level, year, totalYears, grades } = cur
  leaveSchool(g, 'transfer')
  enrollIn(g, level, { school, year, totalYears, grades: Math.max(0, grades - 3), quiet: true })
  addStat(g, 'happiness', randInt(g, 5, 10))
  for (const p of parents(g)) addRelationship(p, 5)
  remember(g, `Passed ${exam} and got into ${school}.`)
  log(g, `I passed ${exam} and moved to ${school}.`, 'good')
  notice(g, 'You Got In!', `You passed ${exam} and earned a place at ${school} — ${rankLabel(r)}. Your parents told everyone, including the mail carrier.`, { emoji: TIER_EMOJI[r.tier], tone: 'good' })
})

// ---------------------------------------------------------------------------
// Applying to schools

function inFullTimeWork(g: GameState): boolean {
  const job = g.character.job
  return !!job && job.category === 'fulltime'
}

function quitJobConfirm(g: GameState): string | null {
  const job = g.character.job
  if (!job || !inFullTimeWork(g)) return null
  return `Going back to school full-time means quitting your job as ${job.title} at ${job.company}. Continue?`
}

function postSecondaryBlocker(g: GameState): string | null {
  const c = g.character
  if (!c.alive) return 'You are dead.'
  if (c.prison) return "You can't apply to school from prison."
  if (c.education.current) return `You're already enrolled at ${c.education.current.school}.`
  if (!hasHighSchool(g)) return `You need ${isUS(g) ? 'a high school diploma or GED' : `to finish ${stageTerm(g, 'high')} (or pass ${equivalency(g).exam})`} first.`
  if (c.job && c.job.category === 'military') return "You can't go back to school while you're serving in the military."
  return null
}

function enrollCommunityCollege(g: GameState): void {
  const cc = college(g)
  const block = postSecondaryBlocker(g)
  if (block) {
    notice(g, cc.label, block, { emoji: '\u{1F3EB}' })
    return
  }
  if (hasDegree(g, 'associate')) {
    notice(g, cc.label, `You've already graduated from ${cc.term}.`, { emoji: '\u{1F3EB}' })
    return
  }
  quitJobForSchool(g)
  const cur = enrollIn(g, 'community', { funding: 'free' })
  notice(g, cc.label, pick(g, [`You enrolled at ${cur.school}. It's free, and the parking lot is huge.`, `${cur.school} accepted you, because ${cur.school} accepts everybody. Welcome!`]), {
    emoji: '\u{1F3EB}',
    tone: 'good',
  })
}

// ---------------------------------------------------------------------------
// Universities: national rankings, selectivity and admissions
//
// The player picks from 5-8 real-feeling universities in their country (the famous fixed names in
// the locale data first, then local-style names), each with a national rank, a tier, an admit rate
// and tuition. Acceptance depends on smarts, grades, the final exam, the high school's rank and
// the CV (clubs, leadership, volunteering, projects and awards really matter). Selective schools
// (Elite / Top) screen the CV first — the AI director decides when it's on — and then hold an
// admissions interview.

export interface UniversityOption {
  name: string
  rank: SchoolRank
  /** Yearly tuition in dollars (0 = free). */
  tuition: number
  /** Share of applicants admitted (display). */
  admitRate: number
  /** Selective schools screen your CV and interview you. */
  selective: boolean
}

const TIER_TUITION: Record<SchoolTier, number> = { Elite: 1.8, Top: 1.4, Good: 1.0, Average: 0.85, Struggling: 0.7 }
const TIER_ADMIT_RATE: Record<SchoolTier, number> = { Elite: 0.07, Top: 0.22, Good: 0.5, Average: 0.75, Struggling: 0.92 }
/** The applicant merit a school of this tier is looking for. */
const TIER_BAR: Record<SchoolTier, number> = { Elite: 80, Top: 68, Good: 50, Average: 38, Struggling: 24 }

function seededPick<T>(r: () => number, list: readonly T[]): T {
  return list[Math.floor(r() * list.length) % list.length]
}

/** Fill a university name pattern with a deterministic stream (menus must not touch g.rng). */
function fillSeeded(template: string, r: () => number, countryId: string): string {
  const loc = localeOf(countryId)
  const country = getCountry(countryId)
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
    if (key === 'city') return seededPick(r, country.cities.slice(0, 8))
    if (key === 'place') return loc.placeWords.length ? seededPick(r, loc.placeWords) : whole
    if (key === 'honoree') return loc.honorees.length ? seededPick(r, loc.honorees) : whole
    if (key === 'country') return country.name
    if (key === 'n') return String(1 + Math.floor(r() * 12))
    return whole
  })
}

function universityTuition(g: GameState, tier: SchoolTier): number {
  if (getCountry(g.character.countryId).freeUniversity) return 0
  return roundMoney(UNIVERSITY_TUITION * wealthScale(g) * TIER_TUITION[tier])
}

/** The universities you can apply to in your country, best first (stable for a life + country). */
export function universityOptions(g: GameState): UniversityOption[] {
  const cid = g.character.countryId
  const r = seededStream(`unis|${g.lifeId}|${cid}`)
  const total = schoolCount(cid, 'university')
  const want = Math.min(total, 6 + Math.floor(r() * 3))
  const patterns = localeOf(cid).universityNames
  const fixed = patterns.filter((p) => !p.includes('{'))
  const templates = patterns.filter((p) => p.includes('{'))
  if (templates.length < 2) {
    // Only famous names in the data: make more like them in other cities ("Universidade de {city}").
    const cities = getCountry(cid).cities
    for (const f of fixed) for (const city of cities) if (f.includes(city)) templates.push(f.replace(city, '{city}'))
    if (templates.length < 2) templates.push('University of {city}', '{city} State University')
  }
  const names = fixed.slice(0, Math.min(4, want))
  // Local-style names, spread across the national ranking.
  const pool: string[] = []
  for (let i = 0; i < 40 && templates.length; i++) {
    const name = fillSeeded(seededPick(r, templates), r, cid)
    if (!name.includes('{') && !names.includes(name) && !pool.includes(name)) pool.push(name)
  }
  pool.sort((a, b) => schoolRank(cid, 'university', a).rank - schoolRank(cid, 'university', b).rank)
  // No famous names: the best local one is the flagship.
  if (!names.length && pool.length) names.push(pool.shift()!)
  const need = want - names.length
  if (need > 0 && pool.length) {
    // The rest spread over the ranking (quantiles), so there's a reach, a target and a safety.
    for (let k = 0; k < need && k < pool.length; k++) {
      const name = pool[Math.min(pool.length - 1, Math.floor(((k + 0.5) * pool.length) / need))]
      if (!names.includes(name)) names.push(name)
    }
    for (const name of pool) if (names.length < want && !names.includes(name)) names.push(name)
  }
  for (let i = 0; names.length < want && fixed.length > names.length && i < fixed.length; i++) if (!names.includes(fixed[i])) names.push(fixed[i])
  if (!names.length) names.push(fillSeeded('University of {city}', r, cid))
  return names
    .map((name) => {
      const rank = schoolRank(cid, 'university', name)
      return { name, rank, tuition: universityTuition(g, rank.tier), admitRate: TIER_ADMIT_RATE[rank.tier], selective: rank.tier === 'Elite' || rank.tier === 'Top' }
    })
    .sort((a, b) => a.rank.rank - b.rank.rank)
}

/** Where you went to (or go to) high school, and its tier. */
function highSchoolTier(g: GameState): SchoolTier | null {
  const cur = current(g)
  if (cur && cur.level === 'high') return rankOf(g, 'high', cur.school).tier
  const hs = g.character.education.degrees.find((d) => d.kind === 'highschool')
  return hs ? rankOf(g, 'high', hs.school).tier : null
}

function lastGradesOf(g: GameState): number {
  const cur = current(g)
  if (cur && cur.level === 'high') return cur.grades
  return num(g.flags.lastGrades as Json, 70)
}

/** How strong an undergraduate applicant you are (roughly 0-100), and your CV fit. */
export function applicantMerit(g: GameState, major?: string): { merit: number; fit: number } {
  const c = g.character
  const grades = lastGradesOf(g)
  const exam = g.flags.examScore
  const examPart = typeof exam === 'number' ? exam : grades * 0.9
  const fit = cvScore(g, universityTarget(major)).score
  const hs = highSchoolTier(g)
  // Academics talent: glowing teacher references and a personal essay that writes itself.
  const merit = c.stats.smarts * 0.3 + grades * 0.25 + examPart * 0.15 + fit * 0.3 + (hs ? TIER_GRADE_EDGE[hs] * 0.8 : 0) + (hasTalent(g, 'Academics') ? 6 : 0)
  return { merit, fit }
}

/** Your odds of getting into a university (pure: safe for menus). */
export function admissionChance(g: GameState, opt: UniversityOption, major?: string): number {
  const { merit } = applicantMerit(g, major)
  return clamp(1 / (1 + Math.exp(-(merit - TIER_BAR[opt.rank.tier]) / 6)), 0.02, 0.97)
}

function oddsLabel(p: number): string {
  return p >= 0.85 ? 'Safety' : p >= 0.6 ? 'Likely' : p >= 0.35 ? 'Target' : p >= 0.12 ? 'Reach' : 'Long shot'
}

function percent(p: number): string {
  return `${Math.max(1, Math.round(p * 100))}%`
}

function tuitionLabel(tuition: number): string {
  return tuition > 0 ? `${formatMoney(tuition)}/yr` : 'Tuition-free'
}

/** A middle-of-the-road school (when no particular university was chosen). */
function defaultUniversity(g: GameState): UniversityOption {
  const options = universityOptions(g)
  return options.find((o) => o.rank.tier === 'Good') ?? [...options].sort((a, b) => Math.abs(a.rank.pct - 0.25) - Math.abs(b.rank.pct - 0.25))[0]
}

/** The program that recruits a star athlete: a good, not elite, school. */
function recruitingUniversity(g: GameState): UniversityOption {
  const options = universityOptions(g)
  return options.find((o) => o.rank.tier === 'Top') ?? options.find((o) => o.rank.tier === 'Good') ?? options[0]
}

/** Apply to university with a chosen major (and, optionally, a chosen university). */
export function applyToUniversity(g: GameState, major: string, opts: { athletic?: boolean; school?: string } = {}): void {
  const c = g.character
  const block = postSecondaryBlocker(g)
  if (block) {
    notice(g, 'University', block, { emoji: '\u{1F3DB}\u{FE0F}' })
    return
  }
  if (hasDegree(g, 'bachelor', major)) {
    notice(g, 'University', `You already have a bachelor's degree in ${major}.`, { emoji: '\u{1F3DB}\u{FE0F}' })
    return
  }
  const free = getCountry(c.countryId).freeUniversity
  const options = universityOptions(g)
  const picked = opts.school ? options.find((o) => o.name === opts.school) : undefined
  if (opts.athletic) {
    const school = (picked ?? recruitingUniversity(g)).name
    quitJobForSchool(g)
    if (free) {
      enrollIn(g, 'university', { school, major, funding: 'free' })
      notice(g, 'Recruited!', `You joined ${school}'s team and will major in ${major}. Tuition is free anyway, so your reward is a team tracksuit and 6 a.m. practices.`, { emoji: '\u{1F3C5}', tone: 'good' })
      remember(g, `Was recruited onto the sports team at ${school}.`)
      return
    }
    enrollIn(g, 'university', { school, major, funding: 'scholarship' })
    const kind = isUS(g) ? 'an athletic' : 'a sports'
    notice(g, 'Full Ride!', `You accepted ${kind} scholarship to ${school} and will major in ${major}. Free tuition, as long as you keep showing up to practice.`, { emoji: '\u{1F3C5}', tone: 'good' })
    remember(g, `Went to ${school} on ${kind} scholarship.`)
    return
  }
  if (!useYearAction(g, 'applyUniversity', 3)) {
    notice(g, 'University', "You've already sent out all your applications this year. Try again next year.", { emoji: '\u{1F4EE}' })
    return
  }
  const opt = picked ?? defaultUniversity(g)
  const p = admissionChance(g, opt, major)
  const { fit } = applicantMerit(g, major)
  const tuition = picked ? opt.tuition : free ? 0 : roundMoney(UNIVERSITY_TUITION * wealthScale(g) * TIER_TUITION[opt.rank.tier])
  const app: ScreeningApp = { kind: 'university', org: opt.name, major, rankLabel: rankLabel(opt.rank), tier: opt.rank.tier, tuition, years: UNIVERSITY_YEARS, fit, chance: p, admit: 1 }
  if (picked && opt.selective) {
    // Selective schools read the CV first (the AI director when it's on), then interview.
    const invite = clamp(p * 1.6 + 0.05, 0.03, 0.95)
    app.chance = invite
    app.admit = clamp(p / invite, 0.05, 0.95)
    log(g, `I applied to ${opt.name} to study ${major}.`, 'neutral')
    queueAi(g, { type: 'screenApplication', app })
    return
  }
  if (!chance(g, p)) {
    rejectAdmission(g, app, offlineRejection(g, app))
    return
  }
  acceptAdmission(g, app)
}

function offlineRejection(g: GameState, app: ScreeningApp): string {
  if (app.fit < 30 && chance(g, 0.6)) return pick(g, ['The committee wanted to see more clubs, leadership, volunteering or projects on your CV.', 'Your grades were fine, but your CV said "spent four years on the couch."'])
  if (app.kind === 'university') return pick(g, [`They admit about ${percent(TIER_ADMIT_RATE[(app.tier as SchoolTier) ?? 'Good'] ?? 0.5)} of applicants, and this year you weren't one of them.`, `Maybe try ${college(g).term} first and apply again later.`, 'Your essay about your goldfish did not land.'])
  return pick(g, ['They said they had "an unusually competitive applicant pool this year." Translation: no.', 'Hitting the books (and filling out your CV) might help next time.'])
}

/** A rejection letter (with the screener's reason when there is one). */
export function rejectAdmission(g: GameState, app: ScreeningApp, reason: string): void {
  addStat(g, 'happiness', -8)
  log(g, `I was rejected by ${app.org}.`, 'bad')
  const opener = pick(g, [`${app.org} rejected your application.`, `"We regret to inform you..." ${app.org} has rejected your application.`, `${app.org} turned you down. Their letter was very polite about it, which somehow made it worse.`])
  notice(g, 'Rejected', `${opener}${reason ? ` ${reason}` : ''}`, { emoji: '\u{1F4E8}', tone: 'bad' })
}

/** Accepted: enroll (free) or ask how to pay. */
export function acceptAdmission(g: GameState, app: ScreeningApp): void {
  const c = g.character
  if (!c.alive || c.prison) return
  if (c.education.current) {
    notice(g, 'Accepted!', `${app.org} accepted you too, but you're already enrolled at ${c.education.current.school}. You framed the letter anyway.`, { emoji: '\u{1F389}', tone: 'good' })
    return
  }
  const where = app.rankLabel ? ` (${app.rankLabel})` : ''
  if (app.kind === 'graduate') {
    const key = (app.program && app.program in PROGRAMS ? app.program : 'master') as GradKey
    const info = PROGRAMS[key]
    const major = app.major ?? 'General Studies'
    if (gradSchoolFree(g, key)) {
      quitJobForSchool(g)
      enrollIn(g, 'graduate', { school: app.org, major, funding: 'free', track: key, program: info.program, totalYears: info.years })
      notice(g, 'Accepted!', `You were accepted to ${app.org}${where}! Tuition is free in ${getCountry(c.countryId).name}, so the only thing you'll be paying with is your sleep.`, { emoji: '\u{1F389}', tone: 'good' })
      return
    }
    askTuition(g, { level: 'graduate', school: app.org, major, tuition: app.tuition ?? roundMoney(info.tuition * wealthScale(g)), years: info.years, tried: [], track: key })
    return
  }
  const major = app.major ?? 'General Studies'
  if (getCountry(c.countryId).freeUniversity || (app.tuition ?? 0) <= 0) {
    quitJobForSchool(g)
    enrollIn(g, 'university', { school: app.org, major, funding: 'free' })
    remember(g, `Got into ${app.org}.`)
    notice(g, 'Accepted!', `You were accepted to ${app.org}${where} to study ${major}. University is free in ${getCountry(c.countryId).name}, so your wallet can relax.`, { emoji: '\u{1F389}', tone: 'good' })
    return
  }
  remember(g, `Got into ${app.org}.`)
  askTuition(g, { level: 'university', school: app.org, major, tuition: app.tuition ?? roundMoney(UNIVERSITY_TUITION * wealthScale(g)), years: app.years ?? UNIVERSITY_YEARS, tried: [] })
}

// Admissions interviews -----------------------------------------------------

const ADMISSIONS_QUESTIONS: { q: string; a: [string, number][] }[] = [
  { q: 'Why do you want to study {major} here?', a: [["Your professors' research genuinely excites me", 90], ["I've wanted to since I was a kid, and this is the best place for it", 85], ['It seemed like the logical next step', 50], ['The campus looked nice on the website', 30], ['My parents said so', 15], ['I heard the parties are legendary', 5]] },
  { q: 'Tell us about a time you failed.', a: [['I failed a test, changed how I studied and aced the next one', 85], ["I didn't make a team, so I trained all year and made it the next", 80], ['I once failed to set an alarm. For a whole week', 30], ['Can I get back to you on that?', 15], ["I don't really fail", 10]] },
  { q: 'What would your teachers say about you?', a: [["That I'm the first to help a classmate", 85], ['That I ask a lot of good questions', 80], ['That I always turn things in on time', 65], ["That I'm \"a lot\"", 30], ['Probably nothing printable', 5]] },
  { q: "What's the last book you read?", a: [["A novel I couldn't put down, and here's why...", 85], ['A history of the printing press. It was riveting', 75], ["I'm more of an audiobook person", 50], ['The terms and conditions. All of them', 30], ['Does the cafeteria menu count?', 10]] },
  { q: 'Where do you see yourself in ten years?', a: [['Using what I learn here to solve real problems', 85], ['Back here, as a professor', 70], ['Running my own company', 65], ['Rich', 15], ['On a beach, ideally', 10]] },
  { q: 'What do you do in your free time?', a: [['I volunteer and work on my own projects', 85], ['I read and go to museums', 75], ['I train with my team', 75], ['Sleep, competitively', 15], ['Scroll. Mostly scroll', 10]] },
  { q: 'Why should we pick you over thousands of other applicants?', a: [["I'll make the most of every opportunity here", 85], ["I bring a perspective your campus doesn't have yet", 85], ['Because I really, really want it', 35], ["You shouldn't, but you will", 20], ['My uncle donated a bench', 10]] },
]

const PROFESSIONS: Record<string, string> = { law: 'lawyer', medical: 'doctor', business: 'business leader', dental: 'dentist', veterinary: 'vet', nursing: 'nurse', pharmacy: 'pharmacist' }

/** Offline admissions question (sometimes about your own CV). */
function fallbackAdmissionsQuestion(g: GameState, app: ScreeningApp): InterviewQuestion {
  const top = cvEntries(g).find((e) => e.kind !== 'education' && e.kind !== 'experience' && e.strength >= 3)
  if (top && chance(g, 0.4)) {
    return {
      question: `I see "${top.title}" on your application. Tell me about it.`,
      answers: shuffle(g, [
        { label: 'Talk about what it taught me about working with people', score: 85 },
        { label: "Admit it was mostly my friend's idea", score: 35 },
        { label: "Call it the best thing anyone's ever done, probably", score: 25 },
        { label: 'Explain it for nine straight minutes', score: 15 },
      ]),
    }
  }
  const profession = app.program ? PROFESSIONS[app.program] : undefined
  if (profession && chance(g, 0.5)) {
    return {
      question: `Why do you want to be a ${profession}?`,
      answers: shuffle(g, [
        { label: `I've seen how much good a great ${profession} can do`, score: 85 },
        { label: 'My research and volunteer work convinced me', score: 85 },
        { label: 'My family expects it', score: 35 },
        { label: 'I watched a lot of TV dramas about it', score: 20 },
        { label: 'The salary, mostly', score: 15 },
      ]).slice(0, 4),
    }
  }
  const last = num(g.flags.lastAdmissionsQ as Json, -1)
  let idx = randInt(g, 0, ADMISSIONS_QUESTIONS.length - 1)
  if (idx === last) idx = (idx + 1) % ADMISSIONS_QUESTIONS.length
  g.flags.lastAdmissionsQ = idx
  const def = ADMISSIONS_QUESTIONS[idx]
  let answers = shuffle(g, def.a).slice(0, 4)
  if (!answers.some(([, s]) => s >= 70)) {
    answers[0] = [...def.a].sort((x, y) => y[1] - x[1])[0]
    answers = shuffle(g, answers)
  }
  const field = app.major ?? (app.program && app.program in PROGRAMS ? PROGRAMS[app.program as GradKey].label.toLowerCase() : 'this')
  return { question: def.q.replace('{major}', field), answers: answers.map(([label, score]) => ({ label, score })) }
}

function cleanQuestion(q: InterviewQuestion | undefined): InterviewQuestion | null {
  if (!q || typeof q.question !== 'string' || q.question.trim().length < 8 || !Array.isArray(q.answers)) return null
  const answers = q.answers
    .filter((a) => a && typeof a.label === 'string' && a.label.trim())
    .slice(0, 4)
    .map((a) => ({ label: a.label.trim().slice(0, 120), score: Math.round(clamp(typeof a.score === 'number' && Number.isFinite(a.score) ? a.score : 50)) }))
  return answers.length >= 2 ? { question: q.question.trim().slice(0, 300), answers } : null
}

/** The admissions interview after a CV screening invite (question from the AI or the offline pool). */
export function presentAdmissionsInterview(g: GameState, app: ScreeningApp, q?: InterviewQuestion): void {
  const c = g.character
  if (!c.alive || c.prison) return
  const safe = cleanQuestion(q) ?? fallbackAdmissionsQuestion(g, app)
  const who = `${pick(g, ['Professor', 'Dr.', 'Dean'])} ${randomLastName(g, c.countryId)}`
  const intro = pick(g, [
    `${app.org} liked your application and invited you to an admissions interview. ${who} peered at you over a pair of reading glasses.`,
    `You made the shortlist at ${app.org}! ${who} from the admissions committee shook your hand and got straight to it.`,
    `Your CV got you an interview at ${app.org}. ${who} opened your file, read for a long, terrifying moment, and looked up.`,
  ])
  scriptChoice(
    g,
    ADMISSIONS_INTERVIEW,
    'Admissions Interview',
    `${intro}\n\n"${safe.question}"`,
    safe.answers.map((a, i) => ({ id: String(i), label: a.label })),
    { emoji: '\u{1F393}', data: { app: appToJson(app), scores: safe.answers.map((a) => a.score), interviewer: who } },
  )
}

const ADMISSIONS_INTERVIEW = defineScript('school.admissionsInterview', (g, choice, data) => {
  const c = g.character
  if (!c.alive || c.prison || !data || typeof data !== 'object' || Array.isArray(data)) return
  const app = readApp(data.app)
  if (!app) return
  const scores = Array.isArray(data.scores) ? data.scores : []
  const raw = scores[Number(choice)]
  const score = typeof raw === 'number' ? raw : 50
  const who = str(data.interviewer, 'The interviewer')
  // A sharp interviewer can tell when a CV line is made up.
  const fake = catchEmbellishment(g, 0.1)
  if (fake) {
    caughtLying(g, fake)
    rejectAdmission(g, app, `${who} asked a few follow-up questions about "${fake.title}". You had no answers.`)
    return
  }
  const p = clamp((app.admit ?? 0.5) + (score - 60) / 120, 0.03, 0.97)
  if (chance(g, p)) {
    log(g, `I aced my admissions interview at ${app.org}.`, 'good')
    acceptAdmission(g, app)
    return
  }
  const why = score >= 70 ? `${who} said it was "a very close call."` : score >= 40 ? `${who} wrote something short in your file and closed it.` : `${who} is still telling colleagues about your answer.`
  rejectAdmission(g, app, why)
})

/** Called by the screener (careers.applyScreening) when a school passes on your application. */
export function screenedOut(g: GameState, app: ScreeningApp, reason: string): void {
  rejectAdmission(g, app, reason || offlineRejection(g, app))
}

/** Background checks at selective schools catch padded CVs before any interview. */
export function admissionsBackgroundCheck(g: GameState, app: ScreeningApp): boolean {
  const rate = app.tier === 'Elite' ? 0.22 : app.tier === 'Top' ? 0.16 : 0.1
  const fake = catchEmbellishment(g, rate)
  if (!fake) return false
  caughtLying(g, fake)
  rejectAdmission(g, app, caughtLine(g, fake))
  return true
}

function bachelorFor(g: GameState, key: GradKey): string | null {
  const eligible = GRAD_ELIGIBILITY[key]
  const majors = bachelorMajors(g)
  return majors.find((m) => eligible.includes(m)) ?? null
}

/** Graduate programs that read your CV and interview you. */
const INTERVIEW_PROGRAMS = new Set<GradKey>(['medical', 'law', 'business', 'dental', 'veterinary'])

/** Your odds of getting into a graduate program (pure). */
export function graduateChance(g: GameState, key: GradKey, school?: string): number {
  const c = g.character
  const info = PROGRAMS[key]
  const grades = num(g.flags.lastGrades as Json, 70)
  const fit = cvScore(g, graduateTarget(key)).score
  const honors = c.education.degrees.some((d) => d.kind === 'bachelor' && d.honors) ? 8 : 0
  const uni = lastUniversity(g)
  const tierEdge = uni ? TIER_GRADE_EDGE[rankOf(g, 'university', uni).tier] * 0.8 : 0
  const merit = c.stats.smarts * 0.45 + grades * 0.25 + fit * 0.3 + honors + tierEdge + (hasTalent(g, 'Academics') ? 6 : 0)
  const bar = 30 + info.minSmarts * 0.55 + (school ? TIER_GRADE_EDGE[rankOf(g, 'graduate', school).tier] * 0.6 : 0)
  return clamp(1 / (1 + Math.exp(-(merit - bar) / 6)), 0.04, 0.95)
}

/** Apply to a graduate / professional program. */
export function applyToGraduateSchool(g: GameState, key: GradKey): void {
  const info = PROGRAMS[key]
  const block = postSecondaryBlocker(g)
  if (block) {
    notice(g, info.label, block, { emoji: info.emoji })
    return
  }
  if (!hasDegree(g, 'bachelor')) {
    notice(g, info.label, `You need a bachelor's degree before applying to ${info.label.toLowerCase()}.`, { emoji: info.emoji })
    return
  }
  if (hasDegree(g, info.kind) && key !== 'master' && key !== 'phd') {
    notice(g, info.label, `You already graduated from ${info.label.toLowerCase()}.`, { emoji: info.emoji })
    return
  }
  const major = bachelorFor(g, key)
  const base = lastUniversity(g) ?? universityName(g)
  const school = `${base} ${info.suffix}`
  if (!useYearAction(g, `applyGrad:${key}`, 1)) {
    notice(g, info.label, `You've already applied to ${info.label.toLowerCase()} this year.`, { emoji: info.emoji })
    return
  }
  if (!major) {
    addStat(g, 'happiness', -5)
    log(g, `I was rejected by ${school}.`, 'bad')
    notice(g, 'Rejected', `${school} rejected you because your major doesn't qualify you for ${info.label.toLowerCase()}. Accepted majors: ${GRAD_ELIGIBILITY[key].join(', ')}.`, { emoji: '\u{1F4E8}', tone: 'bad' })
    return
  }
  const p = graduateChance(g, key, school)
  const rank = rankOf(g, 'graduate', school)
  const app: ScreeningApp = {
    kind: 'graduate',
    org: school,
    major,
    program: key,
    rankLabel: rankLabel(rank),
    tier: rank.tier,
    tuition: gradSchoolFree(g, key) ? 0 : roundMoney(info.tuition * wealthScale(g)),
    years: info.years,
    fit: cvScore(g, graduateTarget(key)).score,
    chance: p,
    admit: 1,
  }
  if (INTERVIEW_PROGRAMS.has(key)) {
    const invite = clamp(p * 1.5 + 0.05, 0.03, 0.95)
    app.chance = invite
    app.admit = clamp(p / invite, 0.05, 0.95)
    log(g, `I applied to ${school}.`, 'neutral')
    queueAi(g, { type: 'screenApplication', app })
    return
  }
  if (!chance(g, p)) {
    rejectAdmission(g, app, offlineRejection(g, app))
    return
  }
  acceptAdmission(g, app)
}

/** Where university is free, so is graduate and professional school (MBAs still cost a fortune). */
function gradSchoolFree(g: GameState, key: GradKey): boolean {
  return key !== 'business' && getCountry(g.character.countryId).freeUniversity
}

// ---------------------------------------------------------------------------
// Paying for school

interface TuitionAsk {
  level: 'university' | 'graduate'
  school: string
  major: string
  tuition: number
  years: number
  tried: string[]
  track?: GradKey
}

function tuitionData(a: TuitionAsk): Json {
  const out: Record<string, Json> = { level: a.level, school: a.school, major: a.major, tuition: a.tuition, years: a.years, tried: [...a.tried] }
  if (a.track) out.track = a.track
  return out
}

function readTuition(data: Json | undefined): TuitionAsk | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const level = data.level === 'graduate' ? 'graduate' : data.level === 'university' ? 'university' : null
  if (!level || typeof data.school !== 'string' || typeof data.major !== 'string') return null
  const tried = Array.isArray(data.tried) ? data.tried.filter((t): t is string => typeof t === 'string') : []
  const track = typeof data.track === 'string' && data.track in PROGRAMS ? (data.track as GradKey) : undefined
  return { level, school: data.school, major: data.major, tuition: num(data.tuition, 0), years: num(data.years, 4), tried, track }
}

/** Odds of a full academic scholarship (pure: safe for hints). Academics talent lowers the bar. */
function scholarshipOdds(g: GameState): number {
  const grades = num(g.flags.lastGrades as Json, 70)
  const smarts = g.character.stats.smarts
  const gifted = hasTalent(g, 'Academics')
  const edge = gifted ? 8 : 0
  if (smarts + edge < 70 || grades + edge < 75) return gifted ? 0.1 : 0.04
  return Math.min(0.9, clamp((smarts + grades + edge * 2 - 145) / 55 + 0.3, 0.2, 0.9) + (gifted ? 0.1 : 0))
}

function askTuition(g: GameState, a: TuitionAsk): void {
  const total = a.tuition * a.years
  const choices: ChoiceOption[] = []
  if (parents(g).length > 0 && !a.tried.includes('parents')) choices.push({ id: 'parents', label: 'Ask my parents to pay', emoji: '\u{1F46A}' })
  if (!a.tried.includes('scholarship')) {
    const odds = scholarshipOdds(g)
    const hint = talentHint(g, 'Academics', odds >= 0.5 ? `Your record should win this (about ${Math.round(odds * 100)}%).` : `A long shot this time (about ${Math.round(odds * 100)}%).`)
    choices.push({ id: 'scholarship', label: 'Apply for a scholarship', emoji: '\u{1F3C6}', ...(hint ? { hint } : {}) })
  }
  choices.push({ id: 'loans', label: 'Take out student loans', emoji: '\u{1F3E6}' })
  if (g.character.money >= total) choices.push({ id: 'cash', label: `Pay cash (${formatMoney(total)})`, emoji: '\u{1F4B5}' })
  choices.push({ id: 'cancel', label: 'Never mind', emoji: '\u{274C}' })
  const what = a.level === 'graduate' && a.track ? PROGRAMS[a.track].label.toLowerCase() : `a degree in ${a.major}`
  const text = a.tried.length
    ? `How else will you pay for ${what} at ${a.school}? Tuition is ${formatMoney(a.tuition)} per year for ${a.years} years.`
    : `Congratulations! You were accepted to ${a.school}. Tuition for ${what} is ${formatMoney(a.tuition)} per year for ${a.years} years. How will you pay for it?`
  scriptChoice(g, TUITION, a.tried.length ? 'Tuition' : 'Accepted!', text, choices, { emoji: a.tried.length ? '\u{1F4B8}' : '\u{1F389}', data: tuitionData(a) })
}

function createStudentLoan(g: GameState, cur: Enrollment, amount: number): void {
  const id = uid(g, 'loan')
  g.character.loans.push({
    id,
    kind: 'student',
    lender: pick(g, isUS(g) ? ['National Student Loan Fund', 'Scholar Credit Union', 'EduLend Financial', 'Campus Federal Loans'] : ['National Student Loan Fund', 'Scholar Credit Union', 'EduLend Financial', `${getCountry(g.character.countryId).name} Education Bank`]),
    balance: Math.round(amount),
    yearlyPayment: 0,
    rate: 0.05,
  })
  cur.data.loanId = id
}

/** Parents chip in from their own savings, as much as they can. */
function billParents(g: GameState, amount: number): void {
  const ps = parents(g)
  if (ps.length === 0) return
  let remaining = amount
  for (const p of ps) {
    const share = Math.min(p.money, Math.ceil(remaining / ps.length))
    p.money = Math.max(0, Math.round(p.money - share))
    remaining -= share
  }
}

function finishEnrollment(g: GameState, a: TuitionAsk, funding: Funding): Enrollment {
  quitJobForSchool(g)
  const cur =
    a.level === 'university'
      ? enrollIn(g, 'university', { school: a.school, major: a.major, funding })
      : enrollIn(g, 'graduate', { school: a.school, major: a.major, funding, track: a.track, program: a.track ? PROGRAMS[a.track].program : 'phd', totalYears: a.years })
  cur.data.tuition = funding === 'loans' || funding === 'parents' ? a.tuition : 0
  return cur
}

const TUITION = defineScript('school.tuition', (g, choice, data) => {
  const c = g.character
  const a = readTuition(data)
  if (!a || !c.alive) return
  if (c.education.current) {
    notice(g, 'Tuition', `You're already enrolled at ${c.education.current.school}.`, { emoji: '\u{1F3EB}' })
    return
  }
  const total = a.tuition * a.years
  switch (choice) {
    case 'parents': {
      const ps = parents(g)
      const wealth = ps.reduce((s, p) => s + p.money, 0)
      const rel = ps.length ? ps.reduce((s, p) => s + p.relationship, 0) / ps.length : 0
      const afford = wealth >= total * 0.6
      const p = afford ? 0.2 + rel / 125 : 0.03 + rel / 1000
      const parent = ps.length ? pick(g, ps) : null
      const word = parent ? (parent.gender === 'male' ? 'dad' : 'mom') : 'parents'
      if (parent && chance(g, p)) {
        billParents(g, a.tuition)
        finishEnrollment(g, a, 'parents')
        addRelationship(parent, 3)
        notice(g, 'Tuition', pick(g, [`Your ${word} agreed to pay your tuition at ${a.school}! They also reminded you about it at dinner. Twice.`, `Your parents are paying for ${a.school}. They're proud of you, and also quietly crying over their savings account.`]), {
          emoji: '\u{1F46A}',
          tone: 'good',
        })
        log(g, `My parents agreed to pay for my tuition at ${a.school}.`, 'good')
        return
      }
      if (parent) addRelationship(parent, -2)
      const refusals = [`Your ${word} said they can't afford to pay for ${a.school}.`, `Your ${word} told you it's time to learn about "financial independence."`]
      refusals.push(STUDENT_LOAN_COUNTRIES.has(c.countryId) ? `Your ${word} laughed and said they're still paying off their own student loans.` : `Your ${word} laughed and asked if you think money grows on trees.`)
      notice(g, 'Tuition', pick(g, refusals), { emoji: '\u{1F62C}', tone: 'bad' })
      askTuition(g, { ...a, tried: [...a.tried, 'parents'] })
      return
    }
    case 'scholarship': {
      const p = scholarshipOdds(g)
      if (chance(g, p)) {
        finishEnrollment(g, a, 'scholarship')
        notice(g, 'Scholarship', `You were awarded a full academic scholarship to ${a.school}! Brains pay off.`, { emoji: '\u{1F3C6}', tone: 'good' })
        log(g, `I won a full scholarship to ${a.school}.`, 'good')
        remember(g, `Won a full scholarship to ${a.school}.`)
        return
      }
      notice(g, 'Scholarship', pick(g, [`Your scholarship application was denied. The committee wanted someone with better grades.`, `You didn't get the scholarship. It went to a kid who cured a disease in their garage.`]), { emoji: '\u{1F4C4}', tone: 'bad' })
      askTuition(g, { ...a, tried: [...a.tried, 'scholarship'] })
      return
    }
    case 'loans': {
      const cur = finishEnrollment(g, a, 'loans')
      createStudentLoan(g, cur, a.tuition)
      notice(g, 'Student Loans', `You took out student loans to attend ${a.school}. Your future self will be paying ${formatMoney(a.tuition)} a year back, plus interest.`, { emoji: '\u{1F3E6}' })
      log(g, `I took out student loans to attend ${a.school}.`, 'neutral')
      return
    }
    case 'cash': {
      if (!spend(g, total)) {
        notice(g, 'Tuition', `You can't afford the ${formatMoney(total)} tuition.`, { emoji: '\u{1F4B8}', tone: 'bad' })
        askTuition(g, { ...a, tried: [...a.tried] })
        return
      }
      finishEnrollment(g, a, 'cash')
      notice(g, 'Tuition', `You paid ${formatMoney(total)} in cash for your education at ${a.school}. Debt-free and proud of it.`, { emoji: '\u{1F4B5}', tone: 'good' })
      log(g, `I paid my way through ${a.school} in cash.`, 'good')
      return
    }
    default:
      log(g, `I decided not to attend ${a.school} after all.`, 'neutral')
  }
})

// ---------------------------------------------------------------------------
// Post-graduation choices

function majorChoices(g: GameState, n: number): ChoiceOption[] {
  return shuffle(g, MAJORS)
    .slice(0, n)
    .sort()
    .map((m) => ({ id: m, label: m, emoji: MAJOR_EMOJI[m] }))
}

function askMajor(g: GameState, athletic: boolean): void {
  const choices = majorChoices(g, 8)
  choices.push({ id: '__later', label: 'Decide later (Occupation → Education)', emoji: '\u{23F3}' })
  const sportsText = getCountry(g.character.countryId).freeUniversity
    ? 'What will you major in between practices?'
    : `What will you major in on your ${isUS(g) ? 'athletic' : 'sports'} scholarship?`
  scriptChoice(g, PICK_MAJOR, 'Choose a Major', athletic ? sportsText : 'Which major will you apply for? (These majors are being offered this year.)', choices, {
    emoji: '\u{1F4DA}',
    data: { athletic },
  })
}

const AFTER_HIGH_SCHOOL = defineScript('school.afterHighSchool', (g, choice, data) => {
  if (!g.character.alive) return
  const athletic = data && typeof data === 'object' && !Array.isArray(data) && typeof data.athletic === 'string'
  switch (choice) {
    case 'athletic':
      if (athletic) askMajor(g, true)
      return
    case 'university':
      askMajor(g, false)
      return
    case 'community':
      enrollCommunityCollege(g)
      return
    case 'work':
      log(g, `I decided to skip ${localTerm(g, 'university') || 'university'} and start working.`, 'neutral')
      notice(g, 'The Real World', 'Welcome to the workforce! Check Occupation → Jobs for openings.', { emoji: '\u{1F4BC}' })
      return
    default:
      addStat(g, 'happiness', 5)
      log(g, pick(g, ['I decided to take a gap year to find myself.', 'I took a gap year. Mostly I found the couch.']), 'neutral')
  }
})

const PICK_MAJOR = defineScript('school.pickMajor', (g, choice, data) => {
  if (!g.character.alive || choice === '__later') {
    if (choice === '__later') log(g, `I put off choosing a ${localTerm(g, 'university') || 'university'} major.`, 'neutral')
    return
  }
  if (!(MAJORS as readonly string[]).includes(choice)) return
  const athletic = !!data && typeof data === 'object' && !Array.isArray(data) && data.athletic === true
  if (athletic) {
    applyToUniversity(g, choice, { athletic })
    return
  }
  askUniversity(g, choice)
})

/** Which university to apply to (rank, your odds and tuition on each button). */
function askUniversity(g: GameState, major: string): void {
  const options = universityOptions(g)
  const choices: ChoiceOption[] = options.map((o) => ({
    id: o.name,
    label: `${o.name} — ${rankShort(o.rank)} • ${oddsLabel(admissionChance(g, o, major))} • ${tuitionLabel(o.tuition)}`,
    emoji: TIER_EMOJI[o.rank.tier],
  }))
  choices.push({ id: '__cancel', label: 'Never mind', emoji: '\u{274C}' })
  const cv = cvScore(g, universityTarget(major)).score
  scriptChoice(
    g,
    PICK_UNIVERSITY,
    'Choose a University',
    `Where will you apply to study ${major}? Elite and Top universities read your CV first and may invite you to an admissions interview. Your CV strength for admissions: ${cv}/100.`,
    choices,
    { emoji: '\u{1F3DB}\u{FE0F}', data: { major } },
  )
}

const PICK_UNIVERSITY = defineScript('school.pickUniversity', (g, choice, data) => {
  if (!g.character.alive) return
  const major = data && typeof data === 'object' && !Array.isArray(data) && typeof data.major === 'string' ? data.major : ''
  if (!major || choice === '__cancel') {
    log(g, `I decided not to apply to ${localTerm(g, 'university') || 'university'} this year.`, 'neutral')
    return
  }
  applyToUniversity(g, major, { school: choice })
})

const AFTER_COMMUNITY = defineScript('school.afterCommunity', (g, choice) => {
  if (!g.character.alive) return
  const cc = college(g)
  if (choice === 'university') askMajor(g, false)
  else if (choice === 'work') notice(g, 'The Real World', `Time to put that ${cc.degree.toLowerCase().replace("associate's", 'associate’s')} to work! Check Occupation → Jobs.`, { emoji: '\u{1F4BC}' })
  else log(g, `I took some time off after ${cc.term}.`, 'neutral')
})

const AFTER_UNIVERSITY = defineScript('school.afterUniversity', (g, choice) => {
  if (!g.character.alive) return
  if (choice in PROGRAMS) {
    applyToGraduateSchool(g, choice as GradKey)
    return
  }
  log(g, `I decided to enter the workforce after ${localTerm(g, 'university') || 'university'}.`, 'neutral')
})

const CLUB_INVITE = defineScript('school.clubInvite', (g, choice, data) => {
  const cur = current(g)
  if (!cur || !g.character.alive) return
  const id = data && typeof data === 'object' && !Array.isArray(data) && typeof data.club === 'string' ? data.club : ''
  const def = clubDef(id, g)
  if (!def) return
  if (choice === 'join') {
    joinClubNow(g, cur, def)
  } else {
    log(g, `I thought about joining the ${def.name} at ${cur.school} but decided against it.`, 'neutral')
  }
})

const CLUB_ROLE = defineScript('school.clubRole', (g, choice, data) => {
  const cur = current(g)
  if (!cur || !g.character.alive || !data || typeof data !== 'object' || Array.isArray(data)) return
  const id = typeof data.club === 'string' ? data.club : ''
  const role = typeof data.role === 'string' ? data.role : 'leader'
  const def = clubDef(id, g)
  const clubs = clubsOf(cur)
  const m = clubs.find((x) => x.id === id)
  if (!def || !m) return
  if (choice === 'accept') {
    m.role = role
    setClubs(cur, clubs)
    addPopularity(cur, 6)
    addStat(g, 'happiness', 5)
    log(g, `I became ${role} of the ${def.name} at ${cur.school}.`, 'good')
  } else {
    log(g, `I turned down the chance to become ${role} of the ${def.name}.`, 'neutral')
  }
})

// ---------------------------------------------------------------------------
// In-school actions

function schoolLabel(cur: Enrollment): string {
  return cur.level === 'university' || cur.level === 'community' || cur.level === 'graduate' ? 'class' : 'school'
}

function studyHarder(g: GameState): void {
  const cur = current(g)
  if (!cur) return
  if (!useYearAction(g, 'study', 3)) {
    notice(g, 'Study Harder', pick(g, ["You're burnt out from studying. Your brain needs the rest of the year off.", 'You tried to study again but fell asleep on your textbook. Give it a rest until next year.']), { emoji: '\u{1F634}' })
    return
  }
  // Academics talent: an hour of your studying is worth an afternoon of anyone else's.
  const gain = Math.round((cur.grades >= 90 ? randInt(g, 1, 3) : randInt(g, 3, 8)) * talentMult(g, 'Academics', 1.5))
  addGrades(cur, gain)
  if (chance(g, hasTalent(g, 'Academics') ? 0.65 : 0.4)) addStat(g, 'smarts', randInt(g, 1, 2))
  addStat(g, 'happiness', -1)
  count(g, 'studied')
  // The last two years of high school are all about the big exam.
  if (cur.level === 'high' && cur.year >= cur.totalYears - 1) {
    cur.data.examPrep = num(cur.data.examPrep, 0) + 1
    const exam = finalExam(g)
    log(g, pick(g, [`I crammed for ${exam}.`, `I spent the weekend doing practice tests for ${exam}.`, `I studied for ${exam} until my eyes crossed.`]), 'neutral')
    notice(
      g,
      'Study Harder',
      pick(g, [`You crammed for ${exam} and buried your nose in your textbooks. Your grades are now a ${gradeLetter(cur.grades)}.`, `You did practice tests for ${exam} until you dreamed in multiple choice. Current grade: ${gradeLetter(cur.grades)}.`]),
      { emoji: '\u{1F4DA}', tone: 'good' },
    )
    return
  }
  log(g, pick(g, ['I studied harder at school.', 'I hit the books hard.', 'I spent the weekend studying.', 'I pulled an all-nighter studying.']), 'neutral')
  notice(
    g,
    'Study Harder',
    pick(g, [
      `You studied harder at ${cur.school}. Your grades are now a ${gradeLetter(cur.grades)}.`,
      `You buried your nose in your textbooks and came up for air with a ${gradeLetter(cur.grades)} average.`,
      `You made flashcards for your flashcards. Your grades rose to a ${gradeLetter(cur.grades)}.`,
      `You studied until your eyes crossed. Current grade: ${gradeLetter(cur.grades)}.`,
    ]),
    { emoji: '\u{1F4DA}', tone: 'good' },
  )
}

const SKIP_ACTIVITIES = ['went to the arcade', 'watched cartoons all day', 'hung out at the mall', 'slept until noon', 'went to the beach', 'played video games for nine hours straight', 'went to the movies', 'wandered around downtown']
/** Everywhere else: the local hangouts and date spots instead of the American mall. */
const LOCAL_SKIP_ACTIVITIES = ['went to the arcade', 'watched cartoons all day', 'hung out at {hangout}', 'slept until noon', 'went to {dateSpot}', 'played video games for nine hours straight', 'went to the cinema', 'wandered around {city}']

function skipActivity(g: GameState): string {
  if (isUS(g)) return pick(g, SKIP_ACTIVITIES)
  const text = fillLocal(g, pick(g, LOCAL_SKIP_ACTIVITIES))
  return /\{\w+\}/.test(text) ? 'slept until noon' : text
}

function skipSchool(g: GameState): void {
  const cur = current(g)
  if (!cur) return
  const what = schoolLabel(cur)
  if (!useYearAction(g, 'skipSchool', 3)) {
    notice(g, `Skip ${what === 'class' ? 'Class' : 'School'}`, "You've skipped so much this year that even you feel guilty. Maybe show up for a bit.", { emoji: '\u{1F648}' })
    return
  }
  count(g, 'skippedSchool')
  addGrades(cur, -randInt(g, 2, 6))
  const activity = skipActivity(g)
  const strict = num(cur.data.strictness, 50) / 100
  const caughtChance = isK12(cur.level) ? 0.15 + strict * 0.35 : 0.05
  if (chance(g, caughtChance)) {
    for (const p of parents(g)) addRelationship(p, -5)
    addStat(g, 'happiness', -4)
    if (isK12(cur.level)) {
      log(g, `I got caught skipping school.`, 'bad')
      notice(g, 'Busted!', `You skipped school and ${activity}, but the school called your parents. They are not thrilled.`, { emoji: '\u{1F6A8}', tone: 'bad' })
      schoolWarning(g, 'skipping school')
    } else {
      log(g, 'I skipped class and my professor noticed.', 'bad')
      notice(g, 'Busted!', `You skipped class and ${activity}. Your professor noticed and docked your participation grade.`, { emoji: '\u{1F6A8}', tone: 'bad' })
      addGrades(cur, -4)
    }
    return
  }
  addStat(g, 'happiness', randInt(g, 3, 7))
  log(g, `I skipped ${what} and ${activity}.`, 'neutral')
  notice(g, `Skip ${what === 'class' ? 'Class' : 'School'}`, pick(g, [`You skipped ${what} and ${activity}. Nobody noticed!`, `You ditched ${what} and ${activity}. Totally worth it.`, `You played hooky and ${activity}. Your grades, however, noticed.`]), {
    emoji: '\u{1F3D6}\u{FE0F}',
  })
}

function dropOut(g: GameState): void {
  const c = g.character
  const cur = current(g)
  if (!cur) return
  if (isK12(cur.level) && c.age < 18 && parents(g).length > 0 && chance(g, 0.35)) {
    const p = pick(g, parents(g))
    addRelationship(p, -5)
    notice(g, 'Drop Out', `Your ${p.gender === 'male' ? 'father' : 'mother'} found out and absolutely refused to let you drop out of ${cur.school}.`, { emoji: '\u{1F620}', tone: 'bad' })
    log(g, 'My parents refused to let me drop out of school.', 'bad')
    return
  }
  const school = cur.school
  c.education.droppedOut.push(cur.level)
  const k12 = isK12(cur.level)
  leaveSchool(g, 'dropped')
  for (const p of parents(g)) addRelationship(p, k12 ? -12 : -6)
  addStat(g, 'happiness', k12 ? 4 : -2)
  remember(g, `Dropped out of ${school}.`)
  log(g, `I dropped out of ${school}.`, 'bad')
  notice(g, 'Dropped Out', k12 ? `You dropped out of ${school}. You can always get your ${equivalency(g).short} later from the Education menu.` : `You dropped out of ${school}. Plenty of billionaires did that too. Plenty of non-billionaires as well.`, {
    emoji: '\u{1F6AA}',
    tone: 'bad',
  })
}

function joinClubNow(g: GameState, cur: Enrollment, def: ClubDef): void {
  const clubs = clubsOf(cur)
  if (clubs.some((m) => m.id === def.id)) return
  if (clubs.length >= MAX_CLUBS) {
    notice(g, def.name, `You don't have time for more than ${MAX_CLUBS} activities. Quit one first.`, { emoji: def.emoji })
    return
  }
  clubs.push({ id: def.id, perf: randInt(g, 35, 60), years: 0, role: '', name: def.name, kind: def.kind })
  setClubs(cur, clubs)
  addStat(g, 'happiness', 3)
  addPopularity(cur, def.kind === 'sport' ? 4 : 1)
  count(g, 'clubs')
  log(g, `I joined the ${def.name} at ${cur.school}.`, 'good')
}

function tryJoinClub(g: GameState, def: ClubDef): void {
  const c = g.character
  const cur = current(g)
  if (!cur) return
  const clubs = clubsOf(cur)
  if (clubs.some((m) => m.id === def.id)) return
  if (clubs.length >= MAX_CLUBS) {
    notice(g, def.name, `You're already in ${MAX_CLUBS} activities. You'd have to quit one to have time for the ${def.name}.`, { emoji: def.emoji })
    return
  }
  if (!useYearAction(g, `club:${def.id}`, 2)) {
    notice(g, def.name, pick(g, [`The ${def.kind === 'sport' ? 'coach' : 'sponsor'} told you to get lost.`, `The ${def.kind === 'sport' ? 'coach' : 'sponsor'} already said no. Twice. Take the hint.`]), { emoji: def.emoji, tone: 'bad' })
    return
  }
  // Leadership talent: you can win a school election without being the most popular kid.
  if (def.minPopularity && popularity(cur) < def.minPopularity - (hasTalent(g, 'Leadership') ? 15 : 0)) {
    addStat(g, 'happiness', -4)
    notice(g, def.name, `You ran for a spot on the ${def.name} but lost in a landslide. Maybe work on your popularity first.`, { emoji: def.emoji, tone: 'bad' })
    log(g, `I ran for ${def.name} and lost.`, 'bad')
    return
  }
  if ((def.minGrades && cur.grades < def.minGrades) || (def.tryout && cur.grades < 40)) {
    notice(g, def.name, `The ${def.kind === 'sport' ? 'coach' : 'sponsor'} wouldn't even let you try out with grades like yours.`, { emoji: def.emoji, tone: 'bad' })
    return
  }
  if (def.tryout) {
    let skill: number
    if (def.kind === 'sport') skill = c.hidden.athleticism * 0.7 + c.stats.health * 0.2 + randInt(g, 0, 30)
    else if (def.kind === 'academic') skill = c.stats.smarts * 0.8 + randInt(g, 0, 30)
    else skill = c.stats.looks * 0.2 + c.stats.smarts * 0.3 + c.hidden.craziness * 0.1 + randInt(g, 10, 50)
    if (clubGifted(g, def)) skill += 12
    if (skill < 55) {
      addStat(g, 'happiness', -5)
      log(g, `I tried out for the ${def.name} but didn't make it.`, 'bad')
      notice(
        g,
        def.name,
        pick(g, [
          `You tried out for the ${def.name} but didn't make the cut.`,
          `You gave the ${def.name} tryouts everything you had. It wasn't enough.`,
          `The ${def.name} tryout list went up. Your name was not on it.`,
        ]),
        { emoji: def.emoji, tone: 'bad' },
      )
      return
    }
  }
  joinClubNow(g, cur, def)
  notice(g, def.name, def.tryout ? `You made the ${def.name}!` : `You joined the ${def.name}!`, { emoji: def.emoji, tone: 'good' })
}

function practiceClub(g: GameState, id: string): void {
  const cur = current(g)
  const def = clubDef(id, g)
  if (!cur || !def) return
  const clubs = clubsOf(cur)
  const m = clubs.find((x) => x.id === id)
  if (!m) return
  if (!useYearAction(g, `practice:${id}`, 2)) {
    notice(g, def.name, "You've already practiced as much as you can this year.", { emoji: def.emoji })
    return
  }
  m.perf = Math.round(clamp(m.perf + randInt(g, 4, 10) * (clubGifted(g, def) ? 1.5 : 1)))
  setClubs(cur, clubs)
  if (def.kind === 'sport') {
    addHidden(g, 'athleticism', Math.round(randInt(g, 1, 3) * talentMult(g, 'Athletics', 1.5)))
    addStat(g, 'health', 1)
  } else if (def.kind === 'academic') {
    if (chance(g, 0.4)) addStat(g, 'smarts', 1)
  }
  const verb = def.kind === 'sport' ? 'practiced harder with' : 'put extra effort into'
  log(g, `I ${verb} the ${def.name}.`, 'neutral')
  notice(g, def.name, `You ${verb} the ${def.name}. Your performance is now ${m.perf}%.`, { emoji: def.emoji })
}

function quitClub(g: GameState, id: string): void {
  const cur = current(g)
  const def = clubDef(id, g)
  if (!cur || !def) return
  setClubs(
    cur,
    clubsOf(cur).filter((m) => m.id !== id),
  )
  log(g, `I quit the ${def.name}.`, 'neutral')
  notice(g, def.name, `You quit the ${def.name}.`, { emoji: def.emoji })
}

function tryJoinClique(g: GameState, def: CliqueDef): void {
  const cur = current(g)
  if (!cur) return
  if (cliqueOf(cur) === def.id) return
  if (!useYearAction(g, 'clique', 3)) {
    notice(g, 'Cliques', "You've tried to join enough cliques this year. People are starting to talk.", { emoji: '\u{1F465}' })
    return
  }
  const fits = def.fits(cliqueCtx(g, cur))
  const accepted = chance(g, fits ? 0.85 : 0.07)
  const leader = randomLastNameSafe(g)
  if (!accepted) {
    addStat(g, 'happiness', -randInt(g, 8, 15))
    if (def.elite) addPopularity(cur, -randInt(g, 8, 14))
    log(g, `The ${def.name} rejected me.`, 'bad')
    notice(
      g,
      def.name,
      pick(g, [
        `The leader of the ${def.name} looked you up and down and said "Ew, no."`,
        `${leader} from the ${def.name} said there's no room for you. There was clearly room.`,
        `The ${def.name} told you that you're not ${def.name.toLowerCase()} material.`,
        `You asked to join the ${def.name}. They laughed until they realized you were serious, then laughed harder.`,
      ]),
      { emoji: def.emoji, tone: 'bad' },
    )
    return
  }
  const old = cliqueDef(cliqueOf(cur), g)
  if (old) adjustCliqueMates(g, cur, old.id, -5)
  cur.data.clique = def.id
  cur.data.cliqueName = def.name
  addPopularity(cur, def.boost)
  addStat(g, 'happiness', 6)
  adjustCliqueMates(g, cur, def.id, 10)
  count(g, 'cliques')
  log(g, `I joined the ${def.name} at ${cur.school}.`, 'good')
  notice(g, def.name, `You're now one of the ${def.name}!${old ? ` The ${old.name} will have to carry on without you.` : ''}`, { emoji: def.emoji, tone: 'good' })
}

function randomLastNameSafe(g: GameState): string {
  return randomLastName(g, g.character.countryId)
}

function adjustCliqueMates(g: GameState, cur: Enrollment, cliqueId: string, delta: number): void {
  for (const p of schoolPeople(g, cur, 'classmate')) if (p.data.clique === cliqueId) addRelationship(p, delta)
}

function leaveClique(g: GameState): void {
  const cur = current(g)
  const def = cliqueDef(cur ? cliqueOf(cur) : null, g)
  if (!cur || !def) return
  adjustCliqueMates(g, cur, def.id, -5)
  cur.data.clique = null
  addPopularity(cur, def.elite ? -6 : -2)
  log(g, `I left the ${def.name}.`, 'neutral')
  notice(g, def.name, `You left the ${def.name}. They pretended not to care.`, { emoji: def.emoji })
}

// Faculty -----------------------------------------------------------------

function teacherAction(g: GameState, personId: string, kind: 'help' | 'compliment' | 'gift' | 'insult' | 'report'): void {
  const cur = current(g)
  const t = getPerson(g, personId)
  if (!cur || !t || !t.alive || t.relation !== 'teacher') return
  const name = teacherTitle(t)
  const pr = pronouns(t.gender)
  const limits = { help: 2, compliment: 2, gift: 1, insult: 2, report: 1 }
  if (!useYearAction(g, `teacher:${t.id}:${kind}`, limits[kind])) {
    notice(g, name, `${pr.He} has had enough of you for one year.`, { emoji: '\u{1F9D1}\u{200D}\u{1F3EB}' })
    return
  }
  switch (kind) {
    case 'help': {
      if (t.relationship < 25 && chance(g, 0.5)) {
        notice(g, name, `You asked ${name} for help after class. ${pr.He} said office hours are "by appointment only" and walked away.`, { emoji: '\u{1F644}' })
        return
      }
      addGrades(cur, randInt(g, 2, 6))
      addRelationship(t, randInt(g, 2, 6))
      if (chance(g, 0.3)) addStat(g, 'smarts', 1)
      notePerson(t, 'Asked for extra help in class.')
      log(g, `I asked ${name} for extra help.`, 'good')
      notice(g, name, pick(g, [`${name} stayed after class to help you. It actually made sense this time!`, `${name} explained it three different ways until it finally clicked.`]), {
        emoji: '\u{1F4A1}',
        tone: 'good',
        ai: { when: 'full', facts: `${name}, the player's ${t.occupation}, helped them study. Grades improved.`, personId: t.id },
      })
      return
    }
    case 'compliment': {
      addRelationship(t, randInt(g, 3, 8))
      log(g, `I complimented ${name}.`, 'neutral')
      notice(g, name, pick(g, [`You told ${name} that ${pr.his} class is your favorite. ${pr.He} pretended not to be flattered.`, `You complimented ${name}'s tie. ${pr.He} has worn it every day since.`, `You told ${name} ${pr.he} is a great teacher. ${pr.He} blushed and gave the class a pop quiz anyway.`]), {
        emoji: '\u{1F60A}',
      })
      return
    }
    case 'gift': {
      // An apple for the teacher is an American thing; elsewhere it's chocolates, flowers or a card.
      const apple = isUS(g) && isK12(cur.level)
      const gift = apple ? 'an apple' : pick(g, ['a box of chocolates', 'a bunch of flowers', 'a handmade card'])
      if (chance(g, 0.15)) {
        addRelationship(t, -5)
        notice(g, name, `You left ${gift} on ${name}'s desk. ${pr.He} returned it, explaining that ${pr.he} can't accept gifts from students.`, { emoji: apple ? '\u{1F34E}' : '\u{1F381}' })
        if (num(cur.data.strictness, 50) > 70) schoolWarning(g, 'trying to bribe a teacher')
        return
      }
      addRelationship(t, randInt(g, 6, 12))
      if (chance(g, 0.3)) addGrades(cur, 2)
      log(g, apple ? `I gave ${name} a shiny apple.` : `I gave ${name} ${gift}.`, 'good')
      notice(g, name, pick(g, [apple ? `You gave ${name} a shiny red apple. Classic. ${pr.He} loved it.` : `You gave ${name} ${gift}. ${pr.He} pretended it wasn't necessary and kept it anyway.`, `You gave ${name} a coffee mug that says "World's Okayest Teacher." ${pr.He} laughed for a full minute.`]), { emoji: apple ? '\u{1F34E}' : '\u{1F381}', tone: 'good' })
      return
    }
    case 'insult': {
      addRelationship(t, -randInt(g, 10, 20))
      addHidden(g, 'karma', -2)
      count(g, 'insults')
      log(g, `I insulted ${name}.`, 'bad')
      notice(g, name, pick(g, [`You told ${name} that ${pr.his} lectures are a cure for insomnia.`, `You called ${name} a dinosaur in front of the whole class.`, `You told ${name} you'd learn more from ${isUS(g) ? 'a fortune cookie' : 'a horoscope'}.`]), { emoji: '\u{1F620}', tone: 'bad' })
      if (chance(g, 0.4 + num(cur.data.strictness, 50) / 200)) schoolWarning(g, 'disrespecting a teacher')
      return
    }
    case 'report': {
      const who = principalTitle(g, cur)
      if (chance(g, 0.4)) {
        addRelationship(t, -25)
        notePerson(t, `Was reported to the ${isK12(cur.level) ? systemFor(g).principal.toLowerCase() : 'dean'} by the player.`)
        log(g, `I complained to ${who} about ${name}, who got reprimanded.`, 'neutral')
        notice(g, officeTitle(g, cur), `You complained to ${who} about ${name}. ${pr.He} got a stern talking-to. ${pr.His} glare at you the next day could melt steel.`, { emoji: '\u{1F4CB}' })
      } else {
        addRelationship(t, -10)
        notice(g, officeTitle(g, cur), `You complained to ${who} about ${name}. ${who} nodded politely and did absolutely nothing.`, { emoji: '\u{1F4CB}' })
      }
      return
    }
  }
}

function principalAction(g: GameState, kind: 'complain' | 'compliment' | 'insult'): void {
  const cur = current(g)
  if (!cur) return
  const who = principalTitle(g, cur)
  if (!useYearAction(g, `principal:${kind}`, 2)) {
    notice(g, who, `${who}'s secretary says ${who} is "in a meeting." For the rest of the year.`, { emoji: '\u{1F3EB}' })
    return
  }
  switch (kind) {
    case 'complain': {
      const topic = pick(g, [isUS(g) ? 'the cafeteria food' : 'the canteen food', 'the broken vending machine', 'the dress code', 'the amount of homework', 'the bathrooms', hasSnow(g) && !isUS(g) ? 'the broken heating' : 'the lack of air conditioning'])
      if (chance(g, 0.25)) {
        addStat(g, 'happiness', 5)
        addPopularity(cur, 3)
        log(g, `I complained to ${who} about ${topic} and something actually changed.`, 'good')
        notice(g, who, `You complained to ${who} about ${topic}. Miraculously, something actually changed! Your classmates think you're a hero.`, { emoji: '\u{1F4E3}', tone: 'good' })
      } else {
        log(g, `I complained to ${who} about ${topic}.`, 'neutral')
        notice(g, who, `You complained to ${who} about ${topic}. ${who} promised to "form a committee."`, { emoji: '\u{1F4E3}' })
      }
      return
    }
    case 'compliment': {
      cur.data.strictness = Math.max(0, num(cur.data.strictness, 50) - randInt(g, 2, 6))
      log(g, `I sucked up to ${who}.`, 'neutral')
      notice(g, who, `You told ${who} that the school has never been better run. ${who} seems to like you a little more now.`, { emoji: '\u{1F607}' })
      return
    }
    case 'insult': {
      addHidden(g, 'karma', -3)
      count(g, 'insults')
      addPopularity(cur, chance(g, 0.5) ? 4 : -2)
      log(g, `I insulted ${who} to their face.`, 'bad')
      schoolWarning(g, `insulting ${who}`)
      return
    }
  }
}

function visitNurse(g: GameState): void {
  const c = g.character
  const cur = current(g)
  if (!cur) return
  if (!useYearAction(g, 'nurse', 3)) {
    notice(g, 'School Nurse', 'The nurse took one look at you and said "Not again." Back to class.', { emoji: '\u{1FA7A}' })
    return
  }
  if (c.stats.health < 50 || c.conditions.length > 0) {
    addStat(g, 'health', randInt(g, 1, 4))
    log(g, 'I visited the school nurse.', 'neutral')
    notice(g, 'School Nurse', pick(g, ['The school nurse gave you an ice pack and a juice box. You feel a bit better.', 'The nurse took your temperature and sent you home to rest.']), { emoji: '\u{1FA7A}', tone: 'good' })
    return
  }
  if (chance(g, 0.5)) {
    addStat(g, 'happiness', 4)
    log(g, 'I faked being sick and got sent home from school.', 'neutral')
    notice(g, 'School Nurse', 'You faked a stomachache and the nurse sent you home. Award-worthy performance.', { emoji: '\u{1F912}' })
    return
  }
  log(g, 'The school nurse saw right through my fake illness.', 'neutral')
  notice(g, 'School Nurse', 'The nurse saw right through your fake cough and sent you back to class.', { emoji: '\u{1F928}' })
  if (yearActionsUsed(g, 'nurse') >= 3 && chance(g, 0.5)) schoolWarning(g, 'faking illness to skip class')
}

// Prom ----------------------------------------------------------------------

function promCandidates(g: GameState, cur: Enrollment): Person[] {
  const c = g.character
  return schoolPeople(g, cur, 'classmate').filter((p) => p.age >= 14 && attractedTo(c, p.gender))
}

function goToProm(g: GameState): void {
  const cur = current(g)
  if (!cur) return
  const dance = schoolDance(g)
  if (!useYearAction(g, 'prom', 1)) {
    notice(g, dance.title, `${cap(dance.the)} only happens once a year. You already had your night.`, { emoji: '\u{1FA69}' })
    return
  }
  const choices: ChoiceOption[] = []
  const partner = currentPartner(g)
  if (partner) choices.push({ id: `p:${partner.id}`, label: `Go with ${partner.firstName}`, emoji: '\u{1F491}' })
  for (const p of shuffle(g, promCandidates(g, cur)).slice(0, 3)) {
    if (partner && p.id === partner.id) continue
    choices.push({ id: `p:${p.id}`, label: `Ask ${fullName(p)}`, emoji: '\u{1F339}' })
  }
  choices.push({ id: 'solo', label: 'Go by myself', emoji: '\u{1F57A}' })
  choices.push({ id: 'skip', label: 'School dances are not for me', emoji: '\u{1F6CB}\u{FE0F}' })
  scriptChoice(g, PROM, dance.title, `It's time for ${dance.the} at ${cur.school}! Who will you go with?`, choices, { emoji: '\u{1FA69}' })
}

const PROM = defineScript('school.prom', (g, choice) => {
  const c = g.character
  const cur = current(g)
  if (!cur || !c.alive) return
  const dance = schoolDance(g)
  if (choice === 'skip') {
    log(g, `I decided not to go to ${dance.the}.`, 'neutral')
    return
  }
  let date: Person | undefined
  if (choice.startsWith('p:')) {
    const p = getPerson(g, choice.slice(2))
    if (p && p.alive) {
      const isPartner = currentPartner(g)?.id === p.id
      const odds = isPartner ? 0.95 : clamp(0.2 + (c.stats.looks - 50) / 120 + (popularity(cur) - 50) / 150 + p.relationship / 250, 0.05, 0.9)
      if (chance(g, odds)) {
        date = p
        addRelationship(p, randInt(g, 5, 12))
        notePerson(p, `Went to ${dance.the} with the player.`)
      } else {
        addRelationship(p, -5)
        addStat(g, 'happiness', -8)
        log(g, `${fullName(p)} turned down my invitation to ${dance.the}.`, 'bad')
        notice(g, dance.title, pick(g, [`${p.firstName} said no. Ouch. You went to ${dance.the} by yourself.`, `${p.firstName} already had a date. You went alone and danced like nobody was watching (nobody was).`]), { emoji: '\u{1F494}', tone: 'bad' })
      }
    }
  }
  addStat(g, 'happiness', randInt(g, 5, 12))
  const pop = popularity(cur)
  const crowned = chance(g, clamp((pop - 55) / 80 + (c.stats.looks - 60) / 200, 0, 0.6))
  const title = `${dance.prom ? 'Prom' : dance.title} ${c.gender === 'male' ? 'King' : 'Queen'}`
  if (date) log(g, `I went to ${dance.the} with ${fullName(date)}.`, 'good')
  else if (choice === 'solo') log(g, `I went to ${dance.the} by myself.`, 'neutral')
  if (crowned && dance.prom) {
    addPopularity(cur, 8)
    addStat(g, 'happiness', 8)
    remember(g, `Was crowned ${title} at ${cur.school}.`)
    log(g, `I was crowned ${title}!`, 'good')
    notice(g, title, `You were crowned ${title} at ${cur.school}! The plastic crown is going straight on your mantel.`, { emoji: '\u{1F451}', tone: 'good' })
  } else if (date) {
    notice(g, dance.title, pick(g, [`You went to ${dance.the} with ${date.firstName} and danced the night away.`, `You and ${date.firstName} took awkward photos, ate tiny sandwiches and had a great night.`]), { emoji: '\u{1FA69}', tone: 'good' })
  } else if (choice === 'solo') {
    notice(g, dance.title, pick(g, [`You went to ${dance.the} by yourself and had more fun than most of the couples.`, `You went to ${dance.the} solo and owned the dance floor.`]), { emoji: '\u{1F57A}' })
  }
})

// Greek life ----------------------------------------------------------------

const GREEK_HOUSES_M = ['Alpha Kappa Lambda', 'Sigma Omega Rho', 'Delta Psi Zeta', 'Tau Kappa Xi', 'Phi Lambda Rho', 'Omega Theta Nu']
const GREEK_HOUSES_F = ['Kappa Rho Eta', 'Delta Zeta Nu', 'Alpha Sigma Iota', 'Gamma Pi Mu', 'Theta Xi Lambda', 'Zeta Epsilon Psi']

const GREEK_QUIZ: { q: string; right: string; wrong: string[] }[] = [
  { q: 'Who is the Greek god of the sea?', right: 'Poseidon', wrong: ['Hades', 'Apollo', 'Hermes'] },
  { q: 'Who is the king of the Greek gods?', right: 'Zeus', wrong: ['Ares', 'Kronos', 'Dionysus'] },
  { q: 'Who is the goddess of wisdom?', right: 'Athena', wrong: ['Aphrodite', 'Hera', 'Artemis'] },
  { q: 'Which hero had a famously weak heel?', right: 'Achilles', wrong: ['Hercules', 'Perseus', 'Odysseus'] },
  { q: 'Who flew too close to the sun?', right: 'Icarus', wrong: ['Daedalus', 'Narcissus', 'Pegasus'] },
  { q: 'Who is the messenger of the gods?', right: 'Hermes', wrong: ['Apollo', 'Hephaestus', 'Eros'] },
  { q: 'Whose hair was made of snakes?', right: 'Medusa', wrong: ['Persephone', 'Athena', 'Gaia'] },
  { q: 'Who is the god of wine and parties?', right: 'Dionysus', wrong: ['Ares', 'Poseidon', 'Hermes'] },
  { q: 'Who stole fire from the gods and gave it to humanity?', right: 'Prometheus', wrong: ['Atlas', 'Hercules', 'Theseus'] },
  { q: 'What lived at the center of the Labyrinth?', right: 'The Minotaur', wrong: ['The Hydra', 'The Cyclops', 'The Kraken'] },
  { q: 'Who is the god of the underworld?', right: 'Hades', wrong: ['Zeus', 'Ares', 'Kronos'] },
  { q: 'Who is the goddess of love?', right: 'Aphrodite', wrong: ['Demeter', 'Hestia', 'Athena'] },
  { q: 'Who opened the jar that released all the evils into the world?', right: 'Pandora', wrong: ['Helen', 'Penelope', 'Medea'] },
  { q: 'Who is the god of war?', right: 'Ares', wrong: ['Apollo', 'Hermes', 'Hephaestus'] },
]

function rushGreek(g: GameState): void {
  const c = g.character
  const cur = current(g)
  if (!cur) return
  const kind = c.gender === 'male' ? 'fraternity' : 'sorority'
  if (!useYearAction(g, 'greek', 1)) {
    notice(g, 'Greek Life', `Rush week is over. You'll have to wait until next year to rush a ${kind}.`, { emoji: '\u{1F3DB}\u{FE0F}' })
    return
  }
  const house = pick(g, c.gender === 'male' ? GREEK_HOUSES_M : GREEK_HOUSES_F)
  const p = clamp(0.3 + (c.stats.looks - 50) / 150 + (popularity(cur) - 50) / 150, 0.1, 0.85)
  if (!chance(g, p)) {
    addStat(g, 'happiness', -randInt(g, 10, 18))
    log(g, `I tried to rush ${house} but they told me to get lost.`, 'bad')
    notice(g, house, pick(g, [`You tried to rush ${house}, but the members told you to get lost.`, `The ${house} members took one look at you and closed the door.`]), { emoji: '\u{1F6AA}', tone: 'bad' })
    return
  }
  const quiz = pick(g, GREEK_QUIZ)
  const answers = shuffle(g, [quiz.right, ...quiz.wrong])
  scriptChoice(g, GREEK_QUIZ_SCRIPT, house, `The members of ${house} are considering you! To join, answer one question.\n\n"${quiz.q}"`, answers.map((a) => ({ id: a, label: a })), {
    emoji: '\u{1F3DB}\u{FE0F}',
    data: { house, right: quiz.right },
  })
}

const GREEK_QUIZ_SCRIPT = defineScript('school.greekQuiz', (g, choice, data) => {
  const cur = current(g)
  if (!cur || !g.character.alive || !data || typeof data !== 'object' || Array.isArray(data)) return
  const house = typeof data.house === 'string' ? data.house : 'the house'
  if (choice === data.right) {
    cur.data.greek = house
    g.flags.greek = house
    addPopularity(cur, 15)
    addStat(g, 'happiness', 10)
    remember(g, `Joined ${house} at ${cur.school}.`)
    log(g, `I joined ${house}!`, 'good')
    notice(g, house, `Correct! Welcome to ${house}. You'll never pay for a red plastic cup again.`, { emoji: '\u{1F389}', tone: 'good' })
  } else {
    addStat(g, 'happiness', -10)
    log(g, `I failed the ${house} entrance quiz.`, 'bad')
    notice(g, house, `Wrong! The answer was ${String(data.right)}. The members of ${house} politely showed you the door.`, { emoji: '\u{274C}', tone: 'bad' })
  }
})

// GED -------------------------------------------------------------------------

function gedCost(g: GameState): number {
  return roundMoney(1200 * wealthScale(g))
}

function takeGed(g: GameState): void {
  const c = g.character
  if (hasHighSchool(g)) return
  const cost = gedCost(g)
  if (!useYearAction(g, 'ged', 1)) {
    notice(g, 'GED', "You can only take the GED exam once a year. Study up and try again next year.", { emoji: '\u{1F4DD}' })
    return
  }
  if (!spend(g, cost)) {
    g.yearActions.ged = 0
    notice(g, 'GED', `You can't afford the ${formatMoney(cost)} GED exam fee.`, { emoji: '\u{1F4B8}', tone: 'bad' })
    return
  }
  const p = clamp(0.15 + c.stats.smarts / 100, 0.15, 0.97)
  if (chance(g, p)) {
    addDegree(g, 'ged', 'GED', 'GED Testing Center')
    addStat(g, 'happiness', 8)
    remember(g, 'Earned a GED.')
    log(g, 'I passed the GED exam!', 'good')
    notice(g, 'GED', pick(g, ['You passed the GED exam! Doors that were closed just opened a crack.', 'You aced the GED. Take that, high school!']), { emoji: '\u{1F4DC}', tone: 'good' })
  } else {
    addStat(g, 'happiness', -6)
    log(g, 'I failed the GED exam.', 'bad')
    notice(g, 'GED', pick(g, ['You failed the GED exam. Hit the books and try again next year.', 'You froze during the math section and failed the GED.']), { emoji: '\u{1F4DD}', tone: 'bad' })
  }
}

// ---------------------------------------------------------------------------
// Menu nodes

function aliveFree(g: GameState): string | null {
  if (!g.character.alive) return 'You are dead.'
  if (g.character.prison) return "You're in prison."
  return null
}

function studyAction(): MenuAction {
  return {
    type: 'action',
    id: 'school.study',
    label: 'Study Harder',
    emoji: '\u{1F4D6}',
    subtitle: 'Improve your grades',
    disabledReason: aliveFree,
    run: studyHarder,
  }
}

function clubsMenu(cur: Enrollment): MenuGroup {
  const joined = clubsOf(cur)
  return {
    type: 'menu',
    id: 'school.clubs',
    label: 'Extracurricular Activities',
    emoji: '\u{1F3C5}',
    subtitle: joined.length ? joined.map((m) => clubDef(m.id)?.name ?? m.id).join(', ') : 'Clubs and sports teams',
    header: () => `You can be in up to ${MAX_CLUBS} activities at once. Teams and some clubs require a tryout.`,
    children: (gg) => {
      const cu = current(gg)
      if (!cu) return []
      const mine = clubsOf(cu)
      const nodes: MenuNode[] = []
      if (mine.length) {
        nodes.push({ type: 'heading', id: 'clubs.mine', label: 'My Activities' })
        for (const m of mine) {
          const def = clubDef(m.id)
          if (!def) continue
          nodes.push({
            type: 'menu',
            id: `clubs.mine.${def.id}`,
            label: def.name,
            emoji: def.emoji,
            subtitle: `${m.role ? `${m.role[0].toUpperCase()}${m.role.slice(1)} • ` : ''}Performance ${m.perf}%`,
            children: () => [
              { type: 'info', id: `clubs.${def.id}.info`, text: `${m.role ? `You are ${m.role}. ` : ''}Performance: ${m.perf}% • ${m.years} year${m.years === 1 ? '' : 's'} on the ${def.kind === 'sport' ? 'team' : 'club'}.`, emoji: def.emoji },
              { type: 'action', id: `clubs.${def.id}.practice`, label: def.kind === 'sport' ? 'Practice Harder' : 'Put In More Effort', emoji: '\u{1F4AA}', disabledReason: aliveFree, run: (x) => practiceClub(x, def.id) },
              { type: 'action', id: `clubs.${def.id}.quit`, label: `Quit the ${def.name}`, emoji: '\u{1F6AA}', confirm: () => `Quit the ${def.name}?`, disabledReason: aliveFree, run: (x) => quitClub(x, def.id) },
            ],
          })
        }
      }
      const groups: [ClubKind, string][] = [
        ['sport', 'Sports'],
        ['music', 'Music'],
        ['arts', 'Arts'],
        ['academic', 'Academic'],
        ['hobby', 'Hobbies'],
        ['service', 'Service & Student Life'],
      ]
      for (const [kind, title] of groups) {
        const list = CLUBS.filter((c) => c.kind === kind && !mine.some((m) => m.id === c.id))
        if (!list.length) continue
        nodes.push({ type: 'heading', id: `clubs.h.${kind}`, label: title })
        for (const def of list) {
          nodes.push({
            type: 'action',
            id: `clubs.join.${def.id}`,
            label: def.name,
            emoji: def.emoji,
            subtitle: def.minPopularity ? 'Requires an election' : def.tryout ? 'Tryout required' : def.minGrades ? `Requires good grades` : 'Open to all',
            hint: (x) => {
              const t = clubTalent(def)
              if (!t || !(def.tryout || def.minPopularity)) return null
              return talentHint(x, t, def.minPopularity ? 'Born to campaign: your talent gives you a real edge in this election.' : 'Your talent gives you a real edge at the tryout.') || null
            },
            disabledReason: (x) => aliveFree(x) ?? (clubsOf(current(x) ?? cu).length >= MAX_CLUBS ? `You're already in ${MAX_CLUBS} activities.` : null),
            run: (x) => tryJoinClub(x, def),
          })
        }
      }
      return nodes
    },
  }
}

function cliquesMenu(cur: Enrollment): MenuGroup {
  const mine = cliqueDef(cliqueOf(cur))
  return {
    type: 'menu',
    id: 'school.cliques',
    label: 'Cliques',
    emoji: '\u{1F465}',
    subtitle: mine ? `Member of the ${mine.name}` : 'Find your people',
    header: () => 'You can only belong to one clique at a time. Some are very picky.',
    children: (g) => {
      const cu = current(g)
      if (!cu) return []
      const nodes: MenuNode[] = []
      const mineNow = cliqueDef(cliqueOf(cu))
      if (mineNow) {
        nodes.push({ type: 'info', id: 'cliques.mine', text: `You're one of the ${mineNow.name}.`, emoji: mineNow.emoji })
        nodes.push({ type: 'action', id: 'cliques.leave', label: `Leave the ${mineNow.name}`, emoji: '\u{1F6AA}', confirm: () => `Leave the ${mineNow.name}?`, disabledReason: aliveFree, run: leaveClique })
      }
      for (const def of CLIQUES) {
        if (def.gender && def.gender !== g.character.gender) continue
        if (mineNow && def.id === mineNow.id) continue
        nodes.push({ type: 'action', id: `cliques.join.${def.id}`, label: def.name, emoji: def.emoji, subtitle: def.blurb, disabledReason: aliveFree, run: (x) => tryJoinClique(x, def) })
      }
      return nodes
    },
  }
}

function facultyMenu(cur: Enrollment): MenuGroup {
  const k12 = isK12(cur.level)
  return {
    type: 'menu',
    id: 'school.faculty',
    label: k12 ? 'Faculty' : 'Professors & Staff',
    emoji: '\u{1F9D1}\u{200D}\u{1F3EB}',
    subtitle: k12 ? 'Teachers, principal and nurse' : 'Professors and the dean',
    children: (gg) => {
      const cu = current(gg)
      if (!cu) return []
      const nodes: MenuNode[] = []
      const teachers = schoolPeople(gg, cu, 'teacher')
      nodes.push({ type: 'heading', id: 'faculty.h.teachers', label: k12 ? 'Teachers' : 'Professors' })
      if (!teachers.length) nodes.push({ type: 'info', id: 'faculty.none', text: 'You haven’t gotten to know any of your teachers yet.' })
      for (const t of teachers) {
        const name = k12 ? teacherTitle(t) : `Professor ${t.lastName}`
        nodes.push({
          type: 'menu',
          id: `faculty.t.${t.id}`,
          label: name,
          emoji: t.gender === 'male' ? '\u{1F468}\u{200D}\u{1F3EB}' : '\u{1F469}\u{200D}\u{1F3EB}',
          subtitle: `${t.occupation} • Relationship ${t.relationship}%`,
          children: () => [
            { type: 'action', id: `faculty.t.${t.id}.help`, label: 'Ask for Help', emoji: '\u{1F64B}', subtitle: 'Get extra help with schoolwork', disabledReason: aliveFree, run: (x) => teacherAction(x, t.id, 'help') },
            { type: 'action', id: `faculty.t.${t.id}.compliment`, label: 'Compliment', emoji: '\u{1F60A}', disabledReason: aliveFree, run: (x) => teacherAction(x, t.id, 'compliment') },
            { type: 'action', id: `faculty.t.${t.id}.gift`, label: k12 ? 'Give an Apple' : 'Give a Gift', emoji: '\u{1F34E}', disabledReason: aliveFree, run: (x) => teacherAction(x, t.id, 'gift') },
            { type: 'action', id: `faculty.t.${t.id}.insult`, label: 'Insult', emoji: '\u{1F620}', disabledReason: aliveFree, run: (x) => teacherAction(x, t.id, 'insult') },
            { type: 'action', id: `faculty.t.${t.id}.report`, label: k12 ? 'Report to the Principal' : 'Report to the Dean', emoji: '\u{1F4CB}', disabledReason: aliveFree, run: (x) => teacherAction(x, t.id, 'report') },
          ],
        })
      }
      const who = principalTitle(gg, cu)
      nodes.push({ type: 'heading', id: 'faculty.h.admin', label: k12 ? systemFor(gg).principal : 'Dean' })
      nodes.push({
        type: 'menu',
        id: 'faculty.principal',
        label: k12 ? who : 'The Dean',
        emoji: '\u{1F9D3}',
        subtitle: `Strictness ${num(cu.data.strictness, 50)}%`,
        children: () => [
          { type: 'action', id: 'faculty.principal.complain', label: 'Complain', emoji: '\u{1F4E3}', subtitle: 'Cafeteria food, dress code...', disabledReason: aliveFree, run: (x) => principalAction(x, 'complain') },
          { type: 'action', id: 'faculty.principal.compliment', label: 'Suck Up', emoji: '\u{1F607}', disabledReason: aliveFree, run: (x) => principalAction(x, 'compliment') },
          { type: 'action', id: 'faculty.principal.insult', label: 'Insult', emoji: '\u{1F595}', confirm: () => 'Insulting the principal will land you in the office. Do it anyway?', disabledReason: aliveFree, run: (x) => principalAction(x, 'insult') },
        ],
      })
      if (k12) {
        nodes.push({ type: 'action', id: 'faculty.nurse', label: 'Visit the School Nurse', emoji: '\u{1FA7A}', subtitle: 'Feeling sick? (Or "sick"?)', disabledReason: aliveFree, run: visitNurse })
      }
      return nodes
    },
  }
}

function classmatesMenu(): MenuGroup {
  return {
    type: 'menu',
    id: 'school.classmates',
    label: 'Classmates',
    emoji: '\u{1F9D1}\u{200D}\u{1F91D}\u{200D}\u{1F9D1}',
    subtitle: 'People in your class',
    children: (g) => {
      const cu = current(g)
      if (!cu) return []
      const list = schoolPeople(g, cu, 'classmate')
      const nodes: MenuNode[] = [{ type: 'info', id: 'classmates.hint', text: 'Interact with classmates from the Relationships tab: befriend them, ask them out, or mess with them.', emoji: '\u{1F4A1}' }]
      if (!list.length) nodes.push({ type: 'info', id: 'classmates.none', text: "You don't know anyone in your class yet." })
      for (const p of list) {
        const clique = cliqueDef(typeof p.data.clique === 'string' ? p.data.clique : null, g)
        nodes.push({ type: 'info', id: `classmates.${p.id}`, text: `${fullName(p)} (${p.age})${clique ? ` • ${clique.name}` : ''} • Relationship ${p.relationship}%`, emoji: p.gender === 'male' ? '\u{1F466}' : '\u{1F467}' })
      }
      return nodes
    },
  }
}

function schoolGroup(g: GameState, cur: Enrollment): MenuGroup {
  const sys = systemFor(g)
  const level = cur.level
  const k12 = isK12(level)
  const emoji = level === 'preschool' ? '\u{1F9F8}' : k12 ? '\u{1F3EB}' : '\u{1F393}'
  const rank = rankOf(g, level, cur.school)
  const sub = level === 'preschool' ? `Preschool • ${rankShort(rank)}` : `${gradeLevelLabel(g, cur)} • Grades: ${gradeLetter(cur.grades)} • ${rankShort(rank)}`
  return {
    type: 'menu',
    id: 'school.current',
    label: cur.school,
    emoji,
    subtitle: sub,
    header: (gg) => {
      const cu = current(gg)
      if (!cu) return ''
      const r = rankOf(gg, cu.level, cu.school)
      if (cu.level === 'preschool') return `${cu.school}\n${rankLabel(r)} • ${r.tier}\nFinger painting, snack time and naps. Life is good.`
      const left = cu.totalYears - cu.year
      const lines = [`${rankLabel(r)} • ${r.tier}`, `${gradeLevelLabel(gg, cu)} • Year ${cu.year} of ${cu.totalYears} (${left === 0 ? 'final year' : `${left} to go`})`]
      if (cu.major) lines.push(`Major: ${cu.major}`)
      const track = str(cu.data.track)
      if (track && track in PROGRAMS) lines.push(`Program: ${PROGRAMS[track as GradKey].label}`)
      return lines.join('\n')
    },
    children: (gg) => {
      const cu = current(gg)
      if (!cu) return []
      if (cu.level === 'preschool') {
        return [
          { type: 'info', id: 'preschool.info', text: `You attend ${cu.school}. Big kid school starts at age ${sys.startAge}.`, emoji: '\u{1F9F8}' },
          classmatesMenu(),
        ]
      }
      const r = rankOf(gg, cu.level, cu.school)
      const nodes: MenuNode[] = [
        { type: 'info', id: 'school.rank', text: `${rankLabel(r)} • ${r.tier}${TIER_GRADE_EDGE[r.tier] > 0 ? ' (good teachers lift your grades)' : TIER_GRADE_EDGE[r.tier] < 0 ? ' (you\'ll have to push yourself)' : ''}`, emoji: TIER_EMOJI[r.tier] },
        { type: 'info', id: 'school.grades', text: `Grades: ${gradeLetter(cu.grades)} (${cu.grades}%)`, emoji: '\u{1F4DD}' },
        { type: 'info', id: 'school.popularity', text: `Popularity: ${popularity(cu)}%`, emoji: '\u{2B50}' },
      ]
      const warnings = num(cu.data.warnings, 0)
      if (warnings > 0) nodes.push({ type: 'info', id: 'school.warnings', text: `Trips to the ${isK12(cu.level) ? "principal's" : "dean's"} office: ${warnings} of 3`, emoji: '\u{1F6A8}' })
      const greek = str(cu.data.greek)
      if (greek) nodes.push({ type: 'info', id: 'school.greek', text: `Member of ${greek}`, emoji: '\u{1F3DB}\u{FE0F}' })
      if (cu.funding) {
        const label: Record<Funding, string> = { parents: 'Paid by your parents', scholarship: 'Scholarship', loans: 'Student loans', cash: 'Paid in cash', free: 'Free tuition' }
        if (!isK12(cu.level)) nodes.push({ type: 'info', id: 'school.funding', text: `Tuition: ${label[cu.funding]}`, emoji: '\u{1F4B0}' })
      }
      nodes.push(studyAction())
      if (selectiveExamOpen(gg)) {
        nodes.push({ type: 'action', id: 'school.selective', label: `Sit ${selectiveExamName(gg)}`, emoji: '\u{1F4DD}', subtitle: 'Try for a place at a selective school', disabledReason: aliveFree, run: offerSelectiveExam })
      }
      nodes.push(classmatesMenu())
      if (canHaveActivities(cu)) {
        nodes.push(cliquesMenu(cu))
        nodes.push(clubsMenu(cu))
      }
      nodes.push(facultyMenu(cu))
      const dance = schoolDance(gg)
      if (cu.level === 'high' && (sys.prom || dance.datable) && cu.year >= cu.totalYears - 1) {
        nodes.push({ type: 'action', id: 'school.prom', label: dance.title, emoji: '\u{1FA69}', subtitle: 'The big end-of-school night', disabledReason: aliveFree, run: goToProm })
      }
      if (cu.level === 'university' && sys.greek && !str(cu.data.greek)) {
        const kind = gg.character.gender === 'male' ? 'Fraternity' : 'Sorority'
        nodes.push({ type: 'action', id: 'school.greek.rush', label: `Rush a ${kind}`, emoji: '\u{1F3DB}\u{FE0F}', subtitle: 'Join Greek life', disabledReason: aliveFree, run: rushGreek })
      }
      nodes.push({
        type: 'action',
        id: 'school.skip',
        label: isK12(cu.level) ? 'Skip School' : 'Skip Class',
        emoji: '\u{1F3D6}\u{FE0F}',
        subtitle: 'Live a little (grades may suffer)',
        disabledReason: aliveFree,
        run: skipSchool,
      })
      nodes.push({
        type: 'action',
        id: 'school.dropout',
        label: 'Drop Out',
        emoji: '\u{1F6AA}',
        disabledReason: (x) => {
          const reason = aliveFree(x)
          if (reason) return reason
          const now = current(x)
          if (now && isK12(now.level) && x.character.age < systemFor(x).dropOutAge) return `You can't drop out until you're ${systemFor(x).dropOutAge}.`
          return null
        },
        confirm: (x) => `Are you sure you want to drop out of ${current(x)?.school ?? 'school'}?`,
        run: dropOut,
      })
      return nodes
    },
  }
}

function universityGroup(o: UniversityOption, i: number): MenuGroup {
  return {
    type: 'menu',
    id: `edu.uni.${i}`,
    label: o.name,
    emoji: TIER_EMOJI[o.rank.tier],
    subtitle: (g) => `${rankShort(o.rank)} • admits ~${percent(o.admitRate)} • ${tuitionLabel(o.tuition)} • You: ${oddsLabel(admissionChance(g, o))}`,
    disabledReason: (g) => postSecondaryBlocker(g),
    header: (g) => {
      const { fit } = applicantMerit(g)
      return [
        `${o.name}\n${rankLabel(o.rank)} • ${o.rank.tier}`,
        o.selective ? 'Selective: your CV is screened first, then an admissions interview.' : 'Admission is based on your grades, exam results and CV.',
        `Tuition: ${tuitionLabel(o.tuition)} • Admits ~${percent(o.admitRate)} of applicants`,
        `Your odds: ${oddsLabel(admissionChance(g, o))} (CV strength ${fit}/100) • Pick a major to apply.`,
      ].join('\n')
    },
    children: () =>
      MAJORS.map(
        (m): MenuAction => ({
          type: 'action',
          id: `edu.uni.${i}.${m}`,
          label: m,
          emoji: MAJOR_EMOJI[m] ?? '\u{1F4D8}',
          subtitle: (g) => (hasDegree(g, 'bachelor', m) ? 'Already earned' : gradPathsFor(m)),
          disabledReason: (g) => postSecondaryBlocker(g) ?? (hasDegree(g, 'bachelor', m) ? `You already have a degree in ${m}.` : null),
          confirm: quitJobConfirm,
          run: (g) => applyToUniversity(g, m, { school: o.name }),
        }),
      ),
  }
}

function universityMenu(): MenuGroup {
  return {
    type: 'menu',
    id: 'edu.university',
    label: 'University',
    emoji: '\u{1F3DB}\u{FE0F}',
    subtitle: (g) => {
      const opts = universityOptions(g)
      if (getCountry(g.character.countryId).freeUniversity) return `${opts.length} universities • Four years • Tuition-free`
      const cheapest = Math.min(...opts.map((o) => o.tuition))
      return `${opts.length} universities • Four years • from ${formatMoney(cheapest)}/yr`
    },
    disabledReason: (g) => postSecondaryBlocker(g),
    header: (g) =>
      `Pick a university, then a major. Better-ranked universities are harder to get into: grades, ${finalExam(g)}, your ${stageTerm(g, 'high')}'s rank and your CV (clubs, leadership, volunteering, projects, awards) all count.\nYour CV strength for admissions: ${cvScore(g, universityTarget()).score}/100 • Applications this year: ${yearActionsUsed(g, 'applyUniversity')}/3`,
    children: (g) => universityOptions(g).map((o, i) => universityGroup(o, i)),
  }
}

function gradPathsFor(major: string): string {
  const paths = GRAD_ORDER.filter((k) => k !== 'phd' && GRAD_ELIGIBILITY[k].includes(major)).map((k) => PROGRAMS[k].label.replace(' School', ''))
  return paths.length ? `Leads to: ${paths.join(', ')}` : 'No graduate school options'
}

function graduateMenu(): MenuGroup {
  return {
    type: 'menu',
    id: 'edu.graduate',
    label: 'Graduate School',
    emoji: '\u{1F393}',
    subtitle: 'Law, medicine, business and more',
    disabledReason: (g) => postSecondaryBlocker(g) ?? (hasDegree(g, 'bachelor') ? null : "You need a bachelor's degree first."),
    header: (g) => {
      const uni = lastUniversity(g)
      const where = uni ? `\nYou'd apply to ${uni}'s programs (${rankShort(rankOf(g, 'university', uni))}).` : ''
      return `Programs only accept certain majors. Medical school is the hardest to get into; medicine, law, business, dentistry and veterinary schools read your CV and interview you.${where}`
    },
    children: () =>
      GRAD_ORDER.map((key): MenuAction => {
        const info = PROGRAMS[key]
        return {
          type: 'action',
          id: `edu.grad.${key}`,
          label: info.label,
          emoji: info.emoji,
          subtitle: (g) => `${info.years} years • ${formatMoney(roundMoney(info.tuition * wealthScale(g)))}/yr • ${key === 'master' || key === 'phd' ? 'Most majors' : GRAD_ELIGIBILITY[key].join(', ')}`,
          disabledReason: (g) => postSecondaryBlocker(g) ?? (hasDegree(g, 'bachelor') ? null : "You need a bachelor's degree first."),
          confirm: quitJobConfirm,
          run: (g) => applyToGraduateSchool(g, key),
        }
      }),
  }
}

function educationGroup(): MenuGroup {
  return {
    type: 'menu',
    id: 'edu.menu',
    label: 'Education',
    emoji: '\u{1F393}',
    subtitle: (x) => `Highest: ${highestEducationLabel(x)}`,
    children: (gg) => {
      const nodes: MenuNode[] = [{ type: 'info', id: 'edu.highest', text: `Highest education: ${highestEducationLabel(gg)}`, emoji: '\u{1F4DC}' }]
      const sys = systemFor(gg)
      if (!hasHighSchool(gg)) {
        nodes.push({
          type: 'action',
          id: 'edu.ged',
          label: 'Get Your GED',
          emoji: '\u{1F4DD}',
          subtitle: `Exam fee ${formatMoney(gedCost(gg))} • Pass chance depends on your smarts`,
          visible: (x) => x.character.age >= sys.dropOutAge,
          disabledReason: (x) => aliveFree(x) ?? (x.character.education.current ? "You're still enrolled in school." : null),
          run: takeGed,
        })
      }
      nodes.push({
        type: 'action',
        id: 'edu.community',
        label: 'Community College',
        emoji: '\u{1F3EB}',
        subtitle: hasDegree(gg, 'associate') ? 'Already graduated' : 'Two years • Free • Always accepts',
        disabledReason: (x) => postSecondaryBlocker(x) ?? (hasDegree(x, 'associate') ? "You've already graduated from community college." : null),
        confirm: quitJobConfirm,
        run: enrollCommunityCollege,
      })
      nodes.push(universityMenu())
      nodes.push(graduateMenu())
      if (gg.character.education.degrees.length) {
        nodes.push({ type: 'heading', id: 'edu.h.degrees', label: 'My Degrees' })
        gg.character.education.degrees.forEach((d, i) => {
          const lvl: SchoolLevel | null = d.kind === 'ged' ? null : d.kind === 'highschool' ? 'high' : d.kind === 'associate' ? 'community' : d.kind === 'bachelor' ? 'university' : 'graduate'
          const r = lvl ? ` • ${rankShort(rankOf(gg, lvl, d.school))}` : ''
          nodes.push({ type: 'info', id: `edu.degree.${i}`, text: `${d.name} • ${d.school}${r}${d.honors ? ' • Honors' : ''}`, emoji: '\u{1F4DC}' })
        })
      }
      return nodes
    },
  }
}

/** School / university section of the Occupation menu. */
export function educationMenuNodes(g: GameState): MenuNode[] {
  const c = g.character
  if (!c.alive || c.prison) return []
  const cur = c.education.current
  if (cur) return [schoolGroup(g, cur)]
  if (c.age < 5) return []
  const sys = systemFor(g)
  const done = hasHighSchool(g) || c.age >= sys.dropOutAge || c.age >= 18
  if (!done) {
    return [{ type: 'info', id: 'edu.notEnrolled', text: "You're not enrolled in school right now. You'll be back in class next year.", emoji: '\u{1F3EB}' }]
  }
  return [educationGroup()]
}

/** Exposed for tests and other modules. */
export const educationInternals = {
  enrollIn,
  leaveSchool,
  expel,
  levelForAge,
  CLUBS,
  CLIQUES,
}

export function isStudent(g: GameState, levels: SchoolLevel[] = POST_SECONDARY): boolean {
  const cur = g.character.education.current
  return !!cur && levels.includes(cur.level)
}
