// Shared helpers every game module uses: stats, money, log, modals, people lookups.
import { chance, uid } from './rng'
import type {
  AiTask,
  CareerRecord,
  Character,
  ChoiceOption,
  GameState,
  Gender,
  HiddenKey,
  InputModal,
  Json,
  LifeStage,
  MinigameKind,
  NoticeAi,
  Person,
  RelationKind,
  StatKey,
  Tone,
} from './types'

export const GAME_VERSION = 1

export function clamp(n: number, lo = 0, hi = 100): number {
  if (Number.isNaN(n)) return lo
  return Math.max(lo, Math.min(hi, n))
}

// ---------------------------------------------------------------------------
// Stats

export function addStat(g: GameState, key: StatKey, delta: number): void {
  const c = g.character
  c.stats[key] = Math.round(clamp(c.stats[key] + delta))
}

export function addHidden(g: GameState, key: HiddenKey, delta: number): void {
  const c = g.character
  c.hidden[key] = Math.round(clamp(c.hidden[key] + delta))
}

export function addPersonStat(p: Person, key: StatKey, delta: number): void {
  p.stats[key] = Math.round(clamp(p.stats[key] + delta))
}

export function addRelationship(p: Person, delta: number): void {
  p.relationship = Math.round(clamp(p.relationship + delta))
}

// ---------------------------------------------------------------------------
// Money

export function addMoney(g: GameState, delta: number): void {
  g.character.money = Math.round(g.character.money + delta)
}

/** Spend if affordable; returns false (and spends nothing) otherwise. */
export function spend(g: GameState, amount: number): boolean {
  if (amount <= 0) return true
  if (g.character.money < amount) return false
  g.character.money = Math.round(g.character.money - amount)
  return true
}

/**
 * Taxable income (salary, pension, royalties...). Adds the money and accumulates
 * g.flags.taxableIncome, which yearlyFinance taxes at the end of the yearly hooks.
 */
export function earnIncome(g: GameState, amount: number): void {
  if (amount <= 0) return
  addMoney(g, amount)
  const prev = typeof g.flags.taxableIncome === 'number' ? g.flags.taxableIncome : 0
  g.flags.taxableIncome = Math.round(prev + amount)
}

export function canAfford(g: GameState, amount: number): boolean {
  return g.character.money >= amount
}

// ---------------------------------------------------------------------------
// Money display
//
// The engine keeps every amount in constant PRESENT_YEAR US dollars (history/timeline.ts). What
// the player sees can be the local currency and/or the prices of the year being lived ("a 1980
// salary of $10K"). formatMoney/shortMoney (and every module's money() helper, which must call
// them) go through the registered converter; the default shows plain US dollars, so tests and
// old code behave exactly as before. The UI binds the live game (bindMoneyContext) and the
// player's settings (setMoneyDisplay); data/currencies.ts registers the real converter.

export type MoneyMode = 'usd' | 'local'

export interface MoneyDisplay {
  /** 'local': the currency of the country the character lives in; 'usd': US dollars. */
  mode: MoneyMode
  /** True: prices as they were in the year being lived (1980 money); false: today's money. */
  nominal: boolean
}

/** An internal amount as the player should see it. */
export interface ShownMoney {
  /** The amount in display units (already converted). */
  amount: number
  /** e.g. '$', '¥', 'Rp', 'R$', '₦', 'CHF'. */
  symbol: string
  /** ISO code, e.g. 'USD', 'JPY'. */
  code: string
  /** True when the symbol goes after the number ('100 kr'). */
  suffix?: boolean
}

export interface MoneyContext {
  countryId: string
  year: number
}

export type MoneyConverter = (n: number, ctx: MoneyContext | null, display: MoneyDisplay) => ShownMoney

let moneyDisplaySetting: MoneyDisplay = { mode: 'usd', nominal: false }
let moneyContext: () => MoneyContext | null = () => null
let converter: MoneyConverter = (n) => ({ amount: n, symbol: '$', code: 'USD' })

/** The player's display choice (Settings). */
export function setMoneyDisplay(d: Partial<MoneyDisplay>): void {
  moneyDisplaySetting = { ...moneyDisplaySetting, ...d }
}

export function moneyDisplay(): MoneyDisplay {
  return moneyDisplaySetting
}

/** Which life money is shown for (its country and year); null = plain US dollars. */
export function bindMoneyContext(g: GameState | null): void {
  moneyContext = g ? () => ({ countryId: g.character.countryId, year: g.year }) : () => null
}

export function currentMoneyContext(): MoneyContext | null {
  return moneyContext()
}

/** data/currencies.ts installs the real converter (local currency + year prices). */
export function registerMoneyConverter(fn: MoneyConverter): void {
  converter = fn
}

/** An internal amount converted for display with the current settings and context. */
export function showMoney(n: number): ShownMoney {
  return converter(n, moneyContext(), moneyDisplaySetting)
}

/** Display units per internal dollar right now (1 in plain USD mode); for money input fields. */
export function moneyScale(): number {
  const one = showMoney(1_000_000).amount / 1_000_000
  return Number.isFinite(one) && one > 0 ? one : 1
}

/** A number the player typed in display units, back to internal dollars. */
export function moneyFromInput(displayAmount: number): number {
  return displayAmount / moneyScale()
}

function joinMoney(sign: string, digits: string, m: ShownMoney): string {
  if (m.suffix) return `${sign}${digits} ${m.symbol}`
  return `${sign}${m.symbol}${digits}`
}

export function formatMoney(n: number): string {
  const m = showMoney(n)
  const sign = m.amount < 0 ? '-' : ''
  return joinMoney(sign, Math.abs(Math.round(m.amount)).toLocaleString('en-US'), m)
}

/** Compact money: $1.2M, $45K (thousands, millions, billions, trillions). */
export function shortMoney(n: number): string {
  const m = showMoney(n)
  const a = Math.abs(m.amount)
  const sign = m.amount < 0 ? '-' : ''
  if (a >= 1e12) return joinMoney(sign, `${(a / 1e12).toFixed(a >= 1e13 ? 0 : 1)}T`, m)
  if (a >= 1e9) return joinMoney(sign, `${(a / 1e9).toFixed(a >= 1e10 ? 0 : 1)}B`, m)
  if (a >= 1e6) return joinMoney(sign, `${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`, m)
  if (a >= 1e4) return joinMoney(sign, `${Math.round(a / 1e3)}K`, m)
  return formatMoney(n)
}

/** Cash + asset equity - debts. */
export function netWorth(g: GameState): number {
  const assets = g.assets.reduce((sum, a) => sum + a.value - (a.mortgage?.balance ?? 0), 0)
  const loans = g.character.loans.reduce((sum, l) => sum + l.balance, 0)
  return Math.round(g.character.money + assets - loans)
}

// ---------------------------------------------------------------------------
// Life log

/** Current (latest) log year, creating it if needed. */
export function currentLogYear(g: GameState) {
  let year = g.log[g.log.length - 1]
  if (!year || year.age !== g.character.age) {
    year = { age: g.character.age, year: g.year, entries: [] }
    g.log.push(year)
  }
  return year
}

/** Add a first-person line to this year's life log, e.g. "I adopted a dog named Max." */
export function log(g: GameState, text: string, tone: Tone = 'neutral'): void {
  const t = text.trim()
  if (!t) return
  currentLogYear(g).entries.push({ id: uid(g, 'l'), text: t, tone })
}

/** Remember a notable event for the AI's long-term context (kept short). */
export function remember(g: GameState, text: string): void {
  const t = text.trim()
  if (!t) return
  const mems = g.character.memories
  mems.push(`Age ${g.character.age}: ${t}`)
  if (mems.length > 60) mems.splice(0, mems.length - 60)
}

export function count(g: GameState, key: string, by = 1): void {
  g.counters[key] = (g.counters[key] ?? 0) + by
}

export function counter(g: GameState, key: string): number {
  return g.counters[key] ?? 0
}

/**
 * Per-year usage limiter. Returns true and records a use if under `max` uses this year,
 * else false. Typical use: `if (!useYearAction(g, 'gym', 3)) return tooTired(g)`.
 */
export function useYearAction(g: GameState, key: string, max: number): boolean {
  const used = g.yearActions[key] ?? 0
  if (used >= max) return false
  g.yearActions[key] = used + 1
  return true
}

export function yearActionsUsed(g: GameState, key: string): number {
  return g.yearActions[key] ?? 0
}

// ---------------------------------------------------------------------------
// Modals

export interface NoticeOptions {
  emoji?: string
  tone?: Tone
  ai?: NoticeAi
}

/** Show a popup with an OK button. */
export function notice(g: GameState, title: string, text: string, opts: NoticeOptions = {}): void {
  g.queue.push({ kind: 'notice', id: uid(g, 'm'), title, text, emoji: opts.emoji, tone: opts.tone, ai: opts.ai })
}

/** Show a popup with choices resolved by a registered script (see scripts.ts). */
export function scriptChoice(
  g: GameState,
  scriptId: string,
  title: string,
  text: string,
  choices: ChoiceOption[],
  opts: { emoji?: string; data?: Json; personId?: string } = {},
): void {
  g.queue.push({
    kind: 'choice',
    id: uid(g, 'm'),
    title,
    text,
    choices,
    source: 'script',
    scriptId,
    emoji: opts.emoji,
    data: opts.data,
    personId: opts.personId,
  })
}

export function scriptInput(g: GameState, modal: Omit<InputModal, 'kind' | 'id'>): void {
  g.queue.push({ kind: 'input', id: uid(g, 'm'), ...modal })
}

export function minigame(g: GameState, game: MinigameKind, title: string, scriptId: string, data: Json = {}): void {
  g.queue.push({ kind: 'minigame', id: uid(g, 'm'), game, title, scriptId, data })
}

export function queueAi(g: GameState, task: AiTask): void {
  g.queue.push({ kind: 'aiTask', id: uid(g, 'm'), task })
}

// ---------------------------------------------------------------------------
// Character helpers

export function fullName(p: { firstName: string; lastName: string }): string {
  return `${p.firstName} ${p.lastName}`.trim()
}

export function lifeStage(age: number): LifeStage {
  if (age < 2) return 'baby'
  if (age < 5) return 'toddler'
  if (age < 13) return 'child'
  if (age < 18) return 'teen'
  if (age < 65) return 'adult'
  return 'elder'
}

export function isAdult(g: GameState): boolean {
  return g.character.age >= 18
}

export function inPrison(g: GameState): boolean {
  return g.character.prison !== null
}

export function inSchool(g: GameState): boolean {
  return g.character.education.current !== null
}

export function hasLicense(g: GameState, license: string): boolean {
  return g.character.licenses.includes(license)
}

export function pronouns(gender: Gender) {
  return gender === 'male'
    ? { he: 'he', him: 'him', his: 'his', He: 'He', His: 'His', man: 'man', boy: 'boy' }
    : { he: 'she', him: 'her', his: 'her', He: 'She', His: 'Her', man: 'woman', boy: 'girl' }
}

const SKIN_TONES = ['', '\u{1F3FB}', '\u{1F3FC}', '\u{1F3FD}', '\u{1F3FE}', '\u{1F3FF}']

/** Emoji avatar by gender, age and skin tone. */
export function avatarEmoji(gender: Gender, age: number, skinTone = 0, alive = true): string {
  if (!alive) return '\u{1FAA6}'
  const tone = SKIN_TONES[skinTone] ?? ''
  let base: string
  if (age < 2) base = '\u{1F476}'
  else if (age < 13) base = gender === 'male' ? '\u{1F466}' : '\u{1F467}'
  else if (age < 18) base = '\u{1F9D1}'
  else if (age < 65) base = gender === 'male' ? '\u{1F468}' : '\u{1F469}'
  else base = gender === 'male' ? '\u{1F474}' : '\u{1F475}'
  return base + tone
}

export function characterAvatar(c: Character): string {
  return avatarEmoji(c.gender, c.age, c.avatar.skinTone, c.alive)
}

/** What the header shows under the name: job title, school, "Retired", "Prisoner"... */
export function roleLabel(g: GameState): string {
  const c = g.character
  if (!c.alive) return 'Deceased'
  if (c.prison) return 'Prisoner'
  if (c.job) return c.job.title
  const cur = c.education.current
  if (cur) {
    if (cur.level === 'university' || cur.level === 'community') return 'University Student'
    if (cur.level === 'graduate') return 'Graduate Student'
    if (cur.level === 'preschool') return 'Preschooler'
    return 'Student'
  }
  if (c.partTimeJob) return c.partTimeJob.title
  if (c.retired) return 'Retired'
  if (c.age < 5) return lifeStage(c.age) === 'baby' ? 'Infant' : 'Toddler'
  if (c.age < 18) return 'Kid'
  return 'Unemployed'
}

/** End the main or part-time job, recording it in the career history. */
export function endJob(g: GameState, which: 'job' | 'partTimeJob', reason: CareerRecord['reason']): void {
  const c = g.character
  const job = c[which]
  if (!job) return
  c.careerHistory.push({
    title: job.title,
    company: job.company,
    startAge: c.age - job.yearsAtCompany,
    endAge: c.age,
    reason,
    salary: job.salary,
  })
  c[which] = null
  // Coworkers and boss from that job leave your contacts unless you befriended them.
  g.people = g.people.filter((p) => !(p.contextId === job.company && (p.relation === 'coworker' || p.relation === 'boss')))
}

// ---------------------------------------------------------------------------
// People

export function getPerson(g: GameState, id: string | undefined): Person | undefined {
  if (!id) return undefined
  return g.people.find((p) => p.id === id)
}

export function peopleBy(g: GameState, relations: RelationKind[], aliveOnly = true): Person[] {
  return g.people.filter((p) => relations.includes(p.relation) && (!aliveOnly || p.alive))
}

export function livingPeople(g: GameState): Person[] {
  return g.people.filter((p) => p.alive)
}

/** Current romantic partner (partner, fiance or spouse), if any. */
export function currentPartner(g: GameState): Person | undefined {
  return g.people.find((p) => p.alive && (p.relation === 'spouse' || p.relation === 'fiance' || p.relation === 'partner'))
}

export function spouse(g: GameState): Person | undefined {
  return g.people.find((p) => p.alive && p.relation === 'spouse')
}

export function children(g: GameState, aliveOnly = true): Person[] {
  return peopleBy(g, ['child', 'stepchild'], aliveOnly)
}

export function parents(g: GameState, aliveOnly = true): Person[] {
  return peopleBy(g, ['parent', 'stepparent'], aliveOnly)
}

export function removePerson(g: GameState, id: string): void {
  g.people = g.people.filter((p) => p.id !== id)
}

/** Human label for a relation: "Mother", "Boyfriend", "Best Friend", "Dog"... */
export function relationLabel(p: Person): string {
  const m = p.gender === 'male'
  switch (p.relation) {
    case 'parent':
      return m ? 'Father' : 'Mother'
    case 'stepparent':
      return m ? 'Stepfather' : 'Stepmother'
    case 'sibling':
      return m ? 'Brother' : 'Sister'
    case 'halfSibling':
      return m ? 'Half Brother' : 'Half Sister'
    case 'stepsibling':
      return m ? 'Stepbrother' : 'Stepsister'
    case 'grandparent':
      return m ? 'Grandfather' : 'Grandmother'
    case 'child':
      return m ? 'Son' : 'Daughter'
    case 'stepchild':
      return m ? 'Stepson' : 'Stepdaughter'
    case 'grandchild':
      return m ? 'Grandson' : 'Granddaughter'
    case 'friend':
      return 'Friend'
    case 'bestFriend':
      return 'Best Friend'
    case 'enemy':
      return 'Enemy'
    case 'classmate':
      return 'Classmate'
    case 'teacher':
      return 'Teacher'
    case 'coworker':
      return 'Coworker'
    case 'boss':
      return 'Boss'
    case 'partner':
      return m ? 'Boyfriend' : 'Girlfriend'
    case 'fiance':
      return m ? 'Fiancé' : 'Fiancée'
    case 'spouse':
      return m ? 'Husband' : 'Wife'
    case 'ex':
      return m ? 'Ex-Boyfriend' : 'Ex-Girlfriend'
    case 'exSpouse':
      return m ? 'Ex-Husband' : 'Ex-Wife'
    case 'lover':
      return 'Lover'
    case 'cellmate':
      return 'Cellmate'
    case 'pet':
      return p.species ?? 'Pet'
  }
}

export function personAvatar(p: Person): string {
  if (!p.alive) return '\u{1FAA6}'
  if (p.relation === 'pet') return petEmoji(p.species)
  return avatarEmoji(p.gender, p.age, (p.data.skinTone as number | undefined) ?? 0)
}

export function petEmoji(species: string | undefined): string {
  const map: Record<string, string> = {
    Dog: '\u{1F415}',
    Cat: '\u{1F408}',
    Horse: '\u{1F40E}',
    Rabbit: '\u{1F407}',
    Hamster: '\u{1F439}',
    Parrot: '\u{1F99C}',
    Bird: '\u{1F426}',
    Fish: '\u{1F420}',
    Snake: '\u{1F40D}',
    Lizard: '\u{1F98E}',
    Turtle: '\u{1F422}',
    Pig: '\u{1F416}',
    Goat: '\u{1F410}',
    Ferret: '\u{1F9A6}',
    Monkey: '\u{1F412}',
    Tiger: '\u{1F405}',
    Fox: '\u{1F98A}',
  }
  return (species && map[species]) || '\u{1F43E}'
}

/** Is the player romantically compatible with this gender? */
export function attractedTo(c: Character, gender: Gender): boolean {
  if (c.sexuality === 'bisexual') return true
  if (c.sexuality === 'gay') return c.gender === gender
  return c.gender !== gender
}

/** Gender the player is attracted to (random for bisexual players). */
export function preferredGender(g: GameState): Gender {
  const c = g.character
  if (c.sexuality === 'bisexual') return chance(g, 0.5) ? 'male' : 'female'
  if (c.sexuality === 'gay') return c.gender
  return c.gender === 'male' ? 'female' : 'male'
}

/** "a" / "an" for a word. */
export function article(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a'
}

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export function zodiacFor(month: number, day: number): string {
  const signs: [string, number, number][] = [
    ['Capricorn', 1, 19],
    ['Aquarius', 2, 18],
    ['Pisces', 3, 20],
    ['Aries', 4, 19],
    ['Taurus', 5, 20],
    ['Gemini', 6, 20],
    ['Cancer', 7, 22],
    ['Leo', 8, 22],
    ['Virgo', 9, 22],
    ['Libra', 10, 22],
    ['Scorpio', 11, 21],
    ['Sagittarius', 12, 21],
  ]
  for (const [sign, m, d] of signs) {
    if (month === m && day <= d) return sign
  }
  const next = signs[month % 12]
  return next[0]
}
