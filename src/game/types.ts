// Core data model for AnotherLife. Everything in GameState must be plain JSON
// (it is saved to localStorage), so no functions, Maps, Sets or class instances.

export type Gender = 'male' | 'female'
export type Sexuality = 'straight' | 'gay' | 'bisexual'

/** The four visible stat bars, 0-100. */
export type StatKey = 'happiness' | 'health' | 'smarts' | 'looks'
export const STAT_KEYS: StatKey[] = ['happiness', 'health', 'smarts', 'looks']

/** Hidden attributes, 0-100 (fame/notoriety too). Shown only in the profile view. */
export type HiddenKey =
  | 'karma'
  | 'craziness'
  | 'willpower'
  | 'discipline'
  | 'athleticism'
  | 'fertility'
  | 'fame'
  | 'notoriety'
  | 'religiousness'
export const HIDDEN_KEYS: HiddenKey[] = [
  'karma',
  'craziness',
  'willpower',
  'discipline',
  'athleticism',
  'fertility',
  'fame',
  'notoriety',
  'religiousness',
]

export type LifeStage = 'baby' | 'toddler' | 'child' | 'teen' | 'adult' | 'elder'

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

// ---------------------------------------------------------------------------
// Education

export type SchoolLevel =
  | 'preschool'
  | 'elementary'
  | 'middle'
  | 'high'
  | 'community'
  | 'university'
  | 'graduate'

/** Graduate programs (graduate school level). */
export type GradProgram = 'law' | 'medical' | 'business' | 'dental' | 'nursing' | 'pharmacy' | 'veterinary' | 'phd'

export type Funding = 'parents' | 'scholarship' | 'loans' | 'cash' | 'free'

export interface Enrollment {
  level: SchoolLevel
  school: string
  /** 1-based year within this level. */
  year: number
  totalYears: number
  /** Academic performance 0-100 (grades). */
  grades: number
  major?: string
  program?: GradProgram
  funding?: Funding
  /** Free-form per-enrollment data (clubs, clique, sports team, popularity, sorority...). */
  data: Record<string, Json>
}

export type DegreeKind = 'highschool' | 'associate' | 'bachelor' | 'master' | 'doctorate' | 'jd' | 'md' | 'mba' | 'dds' | 'pharmd' | 'dvm' | 'nursing' | 'ged'

export interface Degree {
  kind: DegreeKind
  /** Display name, e.g. "Bachelor's in Computer Science". */
  name: string
  major?: string
  school: string
  age: number
  honors?: boolean
}

export interface Education {
  current: Enrollment | null
  degrees: Degree[]
  /** Levels finished, e.g. ['elementary', 'middle', 'high']. */
  completed: SchoolLevel[]
  droppedOut: SchoolLevel[]
  expelled: number
}

// ---------------------------------------------------------------------------
// Careers

export type JobCategory = 'fulltime' | 'parttime' | 'freelance' | 'special' | 'military'

export interface Job {
  /** Id of the job definition in the jobs data (or special career id). */
  defId: string
  title: string
  company: string
  category: JobCategory
  /** Yearly salary in dollars (special careers may vary year to year). */
  salary: number
  /** Index on the promotion ladder. */
  level: number
  /** Job performance 0-100. */
  performance: number
  yearsInRole: number
  yearsAtCompany: number
  bossId?: string
  /** Free-form career data (fans, albums, rank, deployments, team, approval rating...). */
  data: Record<string, Json>
}

export interface CareerRecord {
  title: string
  company: string
  startAge: number
  endAge: number
  reason: 'quit' | 'fired' | 'retired' | 'laid off' | 'graduated' | 'promoted' | 'died' | 'prison' | 'other'
  salary: number
}

// ---------------------------------------------------------------------------
// Health, crime, money

export type ConditionKind = 'disease' | 'injury' | 'addiction' | 'mental' | 'std'

export interface Condition {
  id: string
  name: string
  kind: ConditionKind
  /** 1-100: how badly it hurts health each year. */
  severity: number
  yearsHad: number
  curable: boolean
  /** True once diagnosed (shown in profile). Undiagnosed ones still hurt. */
  diagnosed: boolean
  /** Contracted at this age. */
  age: number
}

export interface CrimeRecord {
  crime: string
  age: number
  caught: boolean
  convicted: boolean
  sentenceYears?: number
}

export interface Prison {
  name: string
  security: 'minimum' | 'medium' | 'maximum'
  crime: string
  sentenceYears: number
  yearsServed: number
  /** Respect among inmates 0-100 (riots, fights, gangs). */
  respect: number
  appealed: boolean
  escapeAttempts: number
  gang?: string
  /** True for life sentences / death row. */
  life?: boolean
  deathRow?: boolean
}

export type LoanKind = 'student' | 'personal' | 'car' | 'business'

export interface Loan {
  id: string
  kind: LoanKind
  lender: string
  balance: number
  yearlyPayment: number
  /** Annual interest rate as a fraction, e.g. 0.05 */
  rate: number
}

export type HomeStatus = 'parents' | 'owned' | 'renting' | 'homeless' | 'dorm' | 'prison' | 'military' | 'partner'

export interface Residence {
  status: HomeStatus
  /** Asset id when status === 'owned'. */
  assetId?: string
  /** Yearly rent when renting. */
  rent?: number
  description?: string
}

export interface SocialMedia {
  platform: string
  handle: string
  followers: number
  verified: boolean
  monetized: boolean
}

// ---------------------------------------------------------------------------
// The player character

export interface Avatar {
  /** 0-5, mapped to emoji skin-tone modifiers (0 = default yellow). */
  skinTone: number
  hair: 'black' | 'brown' | 'blonde' | 'red' | 'gray'
  eyes: 'brown' | 'blue' | 'green' | 'hazel' | 'gray'
}

export interface Character {
  id: string
  firstName: string
  lastName: string
  gender: Gender
  sexuality: Sexuality
  birthday: { month: number; day: number }
  zodiac: string
  countryId: string
  city: string
  /** Birth country (countryId may change after emigrating). */
  birthCountryId: string
  age: number
  alive: boolean
  causeOfDeath?: string
  stats: Record<StatKey, number>
  hidden: Record<HiddenKey, number>
  /** Bank balance in dollars. May go negative only through debts. */
  money: number
  avatar: Avatar
  education: Education
  /** Main job (full-time, special career or military). */
  job: Job | null
  /** A part-time job can be held alongside school or a full-time job. */
  partTimeJob: Job | null
  careerHistory: CareerRecord[]
  retired: boolean
  /** Yearly pension once retired. */
  pension: number
  conditions: Condition[]
  /** e.g. 'driver', 'boating', 'pilot', 'firearm', 'medical', 'law' */
  licenses: string[]
  criminalRecord: CrimeRecord[]
  prison: Prison | null
  wantedLevel: number
  residence: Residence
  loans: Loan[]
  social: SocialMedia | null
  /** A talent revealed in childhood (e.g. 'Singing', 'Athletics'), if any. */
  talent: string | null
  /** Short notable life events, oldest first, used as long-term memory for the AI. */
  memories: string[]
  /** Person ids named in the will; empty = split among children. */
  willBeneficiaries: string[]
  religion: string | null
  /**
   * Explicit CV / résumé entries: projects, volunteering, courses, awards, internships, embellished
   * lines and school activities archived when leaving a school (see cv.ts). Optional: old saves
   * have none; entries derived from degrees, jobs and businesses are computed on the fly.
   */
  cv?: CvEntry[]
}

// ---------------------------------------------------------------------------
// CV / résumé (cv.ts)

export type CvKind = 'education' | 'experience' | 'activity' | 'volunteering' | 'project' | 'award' | 'certification' | 'skill' | 'leadership'

export interface CvEntry {
  id: string
  kind: CvKind
  /** e.g. 'Built a budgeting app', 'Captain, Basketball Team', 'Volunteer'. */
  title: string
  /** Organization / school / place, '' when none. */
  org: string
  startAge: number
  /** Age it ended; absent while ongoing. */
  endAge?: number
  /** Short detail line ('#37 of 4,100 secondary schools in Indonesia', '2,000 downloads'...). */
  detail: string
  /** 1-10: how impressive it reads. */
  strength: number
  /** A made-up or inflated line. Background checks and interviews can catch it. */
  embellished: boolean
  /** Topic tags for relevance: 'tech', 'science', 'arts', 'business', 'health', 'service', 'sports'... */
  tags?: string[]
  /** 'built' (CV menu), 'school' (archived school activity), 'fake' (embellished)... */
  source?: string
}

/** What a CV is screened for. Plain JSON: it travels inside AI tasks and script data. */
export interface ScreeningApp {
  kind: 'job' | 'university' | 'graduate'
  /** The job (kind 'job'); the regular interview flow continues with it. */
  job?: InterviewJob
  /** University / graduate school / company name. */
  org: string
  /** University major. */
  major?: string
  /** Graduate program key ('law', 'medical', 'business'...). */
  program?: string
  /** e.g. '#12 of 340 universities in Kenya'. */
  rankLabel?: string
  /** 'Elite' | 'Top' | 'Good' | 'Average' | 'Struggling'. */
  tier?: string
  /** Yearly tuition in dollars (0 = free). */
  tuition?: number
  years?: number
  /** CV fit for this target, 0-100 (cvScore). */
  fit: number
  /** Offline odds of being invited to interview, 0-1. */
  chance: number
  /** Odds of acceptance once interviewed (schools), 0-1. */
  admit?: number
  /** One-line job market read (jobs). */
  market?: string
}

/** The screener's call: interview or not, and why (shown on rejection). */
export interface ScreeningDecision {
  invite: boolean
  reason: string
  /** Admissions interview question (schools; AI-written, optional). */
  question?: InterviewQuestion
}

// ---------------------------------------------------------------------------
// Other people (family, friends, partners, pets, coworkers ...)

export type RelationKind =
  | 'parent'
  | 'stepparent'
  | 'sibling'
  | 'halfSibling'
  | 'stepsibling'
  | 'grandparent'
  | 'child'
  | 'stepchild'
  | 'grandchild'
  | 'friend'
  | 'bestFriend'
  | 'enemy'
  | 'classmate'
  | 'teacher'
  | 'coworker'
  | 'boss'
  | 'partner'
  | 'fiance'
  | 'spouse'
  | 'ex'
  | 'exSpouse'
  | 'lover'
  | 'cellmate'
  | 'pet'

export interface Person {
  id: string
  firstName: string
  lastName: string
  gender: Gender
  age: number
  alive: boolean
  causeOfDeath?: string
  relation: RelationKind
  /** Relationship bar with the player, 0-100. */
  relationship: number
  stats: Record<StatKey, number>
  /** Rough personal wealth in dollars. */
  money: number
  /** Job title or status, e.g. "Plumber", "Student", "Retired", "Unemployed". */
  occupation: string
  /** Personality descriptors (feed the AI): e.g. ['generous', 'hot-headed']. */
  traits: string[]
  /** For pets: 'Dog', 'Cat', 'Horse'... */
  species?: string
  breed?: string
  /** For children: id of the other parent (may be absent for adopted / unknown). */
  otherParentId?: string
  biological?: boolean
  /** School / company / prison id this person is attached to (classmates, coworkers, cellmates). */
  contextId?: string
  /** Partner pregnancy: due next age-up. */
  pregnant?: boolean
  /** Years the player has known this person. */
  yearsKnown: number
  livesWithPlayer: boolean
  /** Short notes about shared history with this person (AI memory). */
  notes: string[]
  /** Free-form data (e.g. 'metAt', 'engagementRing', 'cheating'). */
  data: Record<string, Json>
}

// ---------------------------------------------------------------------------
// Assets

export type AssetKind =
  | 'house'
  | 'car'
  | 'boat'
  | 'aircraft'
  | 'jewelry'
  | 'instrument'
  | 'collectible'
  | 'business'
  /** A holding in the Investments menu (stock, bond, fund, crypto...). value = current market value. */
  | 'investment'
  /** A recurring membership or subscription: value 0, upkeep = the yearly fee. */
  | 'membership'
  /** An online venture run from the home computer (a SaaS, an app, an online store...). value = owner's stake. */
  | 'venture'
  | 'other'

export interface Mortgage {
  lender: string
  balance: number
  yearlyPayment: number
  yearsLeft: number
  rate: number
}

export interface Asset {
  id: string
  kind: AssetKind
  name: string
  emoji: string
  purchasePrice: number
  /** Current market value. */
  value: number
  /** 0-100 condition. */
  condition: number
  purchasedAge: number
  mortgage?: Mortgage
  /** Yearly upkeep (maintenance, insurance, property tax...). */
  upkeep: number
  /** Kind-specific details, e.g. beds/baths/city for houses, make/model for cars. */
  details: Record<string, Json>
  /** Rented out to a tenant for this yearly rent. */
  rentedOutFor?: number
}

// ---------------------------------------------------------------------------
// The life log (main feed)

export type Tone = 'good' | 'bad' | 'neutral' | 'event' | 'ai'

export interface LogEntry {
  id: string
  text: string
  tone: Tone
}

export interface LogYear {
  age: number
  year: number
  entries: LogEntry[]
}

// ---------------------------------------------------------------------------
// Modal queue: popups the player must dismiss/answer, shown in order.

export interface ChoiceOption {
  id: string
  label: string
  emoji?: string
}

/** Optional AI rewrite of a notice's text (see ai/director narrate). */
export interface NoticeAi {
  /** 'balanced' = rewrite whenever AI is on; 'full' = only at the Full narration level. */
  when: 'balanced' | 'full'
  /** Ground-truth facts the rewrite must preserve (outcome, numbers, names). */
  facts: string
  personId?: string
}

export interface NoticeModal {
  kind: 'notice'
  id: string
  title: string
  emoji?: string
  text: string
  tone?: Tone
  ai?: NoticeAi
}

export interface ChoiceModal {
  kind: 'choice'
  id: string
  title: string
  emoji?: string
  text: string
  choices: ChoiceOption[]
  /**
   * 'script': resolved synchronously by the script registry (scriptId).
   * 'ai': resolved by the AI director (resolveChoice task), falling back to a generic outcome.
   */
  source: 'script' | 'ai'
  scriptId?: string
  data?: Json
  personId?: string
}

export type MinigameKind = 'blackjack' | 'horseRace' | 'burglary' | 'prisonEscape' | 'slots' | 'pickpocket' | 'annualReport'

/**
 * Data for the 'annualReport' minigame (business.ts → ui/minigames/AnnualReport.tsx): the yearly
 * report where the owner sets next year's price and production. The component reports
 * JSON.stringify({ price, production } satisfies AnnualReportResult), or 'skip' to keep last year's.
 */
export interface AnnualReportData {
  assetId: string
  businessName: string
  emoji: string
  industryLabel: string
  /** e.g. 'Tokyo, Japan'. */
  location: string
  /** Fiscal year this report covers (calendar year). */
  year: number
  /** Plural unit name: 'meals', 'cups', 'subscriptions', 'barrels'... */
  unitLabel: string
  unitCost: number
  price: number
  minPrice: number
  maxPrice: number
  /** A sensible price for this market (shown as a hint/marker). */
  suggestedPrice: number
  production: number
  maxProduction: number
  /** Units in stock carried over. */
  inventory: number
  /** Expected units the market wants next year at the suggested price (shown as a hint). */
  expectedDemand: number
  /** One-line market read, e.g. 'Coffee culture is booming in Seoul; rents are steep.' */
  marketNote: string
  /** Summary of the year just finished (revenue, costs, taxes, profit...). */
  lines: { label: string; value: string; tone?: 'good' | 'bad' | 'neutral' }[]
}

export interface AnnualReportResult {
  price: number
  production: number
}

export interface MinigameModal {
  kind: 'minigame'
  id: string
  game: MinigameKind
  title: string
  /** Script that receives the minigame result string (e.g. 'win', 'lose', 'escaped', JSON). */
  scriptId: string
  data: Json
}

/** Free-text / number prompt mid-flow (e.g. name your baby). */
export interface InputModal {
  kind: 'input'
  id: string
  title: string
  emoji?: string
  text: string
  input: 'text' | 'number'
  placeholder?: string
  defaultValue?: string
  min?: number
  max?: number
  scriptId: string
  data?: Json
}

/** Work for the AI director; the UI runs it (with a spinner) when it reaches the head of the queue. */
export interface AiTaskModal {
  kind: 'aiTask'
  id: string
  task: AiTask
}

export type ModalItem = NoticeModal | ChoiceModal | MinigameModal | InputModal | AiTaskModal

/** A job-interview question; the answer's score (0-100) drives the hiring chance. */
export interface InterviewQuestion {
  question: string
  answers: { label: string; score: number }[]
}

export interface InterviewJob {
  defId: string
  title: string
  company: string
  salary: number
  category: JobCategory
}

/** Serializable descriptions of AI work. See src/ai/director.ts. */
export type AiTask =
  /** Generate this year's flavor log lines and maybe one interactive event. */
  | { type: 'yearEvents' }
  /** Narrate the outcome + effects of the player's choice on an AI-sourced event. */
  | { type: 'resolveChoice'; event: ChoiceModal; choiceId: string }
  /** "Do anything": the player typed a free-form action. */
  | { type: 'customAction'; text: string }
  /** Generate a job-interview question with scored answers. */
  | { type: 'interview'; job: InterviewJob }
  /** Write the obituary shown on the death screen. */
  | { type: 'obituary' }
  /** Read the CV for a job / university / graduate school and decide on an interview. */
  | { type: 'screenApplication'; app: ScreeningApp }

// ---------------------------------------------------------------------------
// Whole-game state

export interface AncestorSummary {
  generation: number
  name: string
  gender: Gender
  bornYear: number
  diedYear: number
  age: number
  causeOfDeath: string
  netWorth: number
  occupation: string
  ribbon: string | null
}

export interface GameState {
  version: number
  /** Unique id of this life. */
  lifeId: string
  /** Seeded RNG state (see rng.ts). */
  rng: number
  /** Monotonic counter for ids. */
  nextId: number
  /** Current calendar year. */
  year: number
  generation: number
  character: Character
  people: Person[]
  assets: Asset[]
  log: LogYear[]
  queue: ModalItem[]
  /** Previous generations of this family (oldest first). */
  ancestors: AncestorSummary[]
  /** Lifetime counters for ribbons and achievements (e.g. crimes, marriages, gymVisits). */
  counters: Record<string, number>
  /** Per-year action counters (reset every age-up) to limit spamming. */
  yearActions: Record<string, number>
  /** Misc flags. */
  flags: Record<string, Json>
  /** Set when the character dies: the ribbon awarded and the obituary text. */
  ribbon: string | null
  obituary: string | null
}

// ---------------------------------------------------------------------------
// Menus (not stored in state; built from functions of state)

export interface MenuInput {
  kind: 'text' | 'number'
  label: string
  placeholder?: string
  min?: number
  max?: number
  defaultValue?: (g: GameState) => string
}

interface MenuBase {
  id: string
  label: string
  emoji: string
  /** Secondary line under the label (price, requirements, salary...). */
  subtitle?: string | ((g: GameState) => string)
  /** Hide the row entirely when false. */
  visible?: (g: GameState) => boolean
  /** When it returns a string the row is greyed out and tapping shows the reason. */
  disabledReason?: (g: GameState) => string | null
}

export interface MenuAction extends MenuBase {
  type: 'action'
  /** If set and returns text, ask the player to confirm first. */
  confirm?: (g: GameState) => string | null
  /** Ask for a value before running. */
  input?: MenuInput
  /** Mutates the state. Push notices / modals to report results. */
  run: (g: GameState, input?: string) => void
  /** Keep the menu open after running (default false: menu closes and modals show). */
  stayOpen?: boolean
}

export interface MenuGroup extends MenuBase {
  type: 'menu'
  /** Optional text shown at the top of the submenu. */
  header?: (g: GameState) => string
  children: (g: GameState) => MenuNode[]
}

export interface MenuInfo {
  type: 'info'
  id: string
  text: string | ((g: GameState) => string)
  emoji?: string
  visible?: (g: GameState) => boolean
}

/** A section heading inside a menu list. */
export interface MenuHeading {
  type: 'heading'
  id: string
  label: string
  visible?: (g: GameState) => boolean
}

export type MenuNode = MenuAction | MenuGroup | MenuInfo | MenuHeading

/** Handler for script-sourced choice / input / minigame modals. */
export type ScriptHandler = (g: GameState, choice: string, data: Json | undefined, modal: ModalItem) => void

// ---------------------------------------------------------------------------
// Effects vocabulary (used by AI outcomes and scripted events)

export type NewPersonRelation = 'friend' | 'enemy' | 'partner' | 'lover' | 'pet' | 'coworker' | 'classmate'

export interface GameEffects {
  happiness?: number
  health?: number
  smarts?: number
  looks?: number
  karma?: number
  fame?: number
  notoriety?: number
  craziness?: number
  /** Dollars; the engine caps gains/losses relative to wealth. */
  money?: number
  /** Relationship changes by person id. */
  relationships?: { personId: string; delta: number }[]
  /** Someone new enters the player's life. */
  newPerson?: {
    relation: NewPersonRelation
    firstName?: string
    lastName?: string
    gender?: Gender
    age?: number
    species?: string
    trait?: string
  }
  /** Contract an illness / injury by name. */
  condition?: { name: string; kind: ConditionKind; severity: number }
  /** The player is caught for a crime (severity 1-5). */
  arrest?: { crime: string; severity: number }
  /** The player dies (only honored when the engine agrees it is plausible). */
  death?: string
  /** One-line long-term memory for the AI. */
  memory?: string
  /** One-line entry for the life log. */
  log?: string
}
