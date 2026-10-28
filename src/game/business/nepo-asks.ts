// "Mom, can I work at the company?" Kids from 14 (a summer job) and 18 (a real role) bring the idea,
// by temperament and ambition; so do adult children, siblings, a spouse, and now and then an
// in-law or a cousin. At most one popup a year, bundling everyone who asked; the answer shapes what
// follows (nepo-actions.ts): hire at the bottom, give them the job they want, make one up, groom a
// successor, put them through the normal process, or say no (they resent it, or earn their own way).
import { addHidden, addRelationship, log, notice, scriptChoice } from '../core'
import { addEntitlement, entitlement, isDescendant } from '../events/wealth-core'
import { randomOccupation, notePerson } from '../people'
import { chance, pick } from '../rng'
import { defineScript } from '../scripts'
import { hasTalent, talentHint } from '../talents'
import { npcLife } from '../npc-state'
import type { Asset, ChoiceOption, GameState, Json, Person } from '../types'
import { passOdds, needsVote } from './board'
import { readJob, readPast } from './nepo-job'
import { driveOf, outlookFor, outlookText } from './nepo-model'
import { materialize, pseudoId, planHire, planProposal, hireRelative, rollOutsider, CUSHY_PAY_MULT, type HireOpts, type Outsider } from './nepo-actions'
import { familyOf, hireBlock, isRelative, kinWord, readFamily } from './nepo-state'
import { popupRoom, useChoicePopup } from './nepo-year'
import { bizOf, businessAssets, findBusiness, stakeValue, type BizState } from './state'
import { clampN, money, num, rec, str } from './util'

// ---------------------------------------------------------------------------
// Who asks

/** One person asking: somebody in the contact list, or an in-law / cousin who is not (yet). */
export interface Asker {
  pid?: string
  out?: Outsider
  /** The rank they want (0 intern ... 4 VP). */
  want: number
}

function outToJson(o: Outsider): Json {
  return { firstName: o.firstName, lastName: o.lastName, gender: o.gender, age: o.age, kin: o.kin, smarts: o.smarts, traits: o.traits, entitlement: o.entitlement }
}

function outFromJson(v: Json | undefined): Outsider | null {
  const d = rec(v)
  if (!d || !str(d.firstName)) return null
  return {
    firstName: str(d.firstName),
    lastName: str(d.lastName),
    gender: d.gender === 'female' ? 'female' : 'male',
    age: Math.round(clampN(num(d.age, 30), 14, 90)),
    kin: str(d.kin, 'cousin'),
    smarts: clampN(num(d.smarts, 50), 0, 100),
    traits: Array.isArray(d.traits) ? d.traits.filter((t): t is string => typeof t === 'string').slice(0, 3) : [],
    entitlement: clampN(num(d.entitlement), 0, 100),
  }
}

function askerToJson(a: Asker): Json {
  return { ...(a.pid ? { pid: a.pid } : {}), ...(a.out ? { out: outToJson(a.out) } : {}), want: a.want }
}

function askerFromJson(v: Json): Asker | null {
  const d = rec(v)
  if (!d) return null
  const out = outFromJson(d.out)
  const pid = str(d.pid)
  if (!pid && !out) return null
  return { ...(pid ? { pid } : {}), ...(out ? { out } : {}), want: Math.round(clampN(num(d.want), 0, 4)) }
}

/** A stand-in Person for an outsider: only used to read the competence model, never stored. */
function pseudo(o: Outsider): Person {
  return {
    id: pseudoId(o),
    firstName: o.firstName,
    lastName: o.lastName,
    gender: o.gender,
    age: o.age,
    alive: true,
    relation: 'coworker',
    relationship: 65,
    stats: { happiness: 60, health: 80, smarts: o.smarts, looks: 50 },
    money: 0,
    occupation: 'Unemployed',
    traits: o.traits,
    yearsKnown: 0,
    livesWithPlayer: false,
    notes: [],
    data: { kin: o.kin, ...(o.entitlement > 0 ? { entitlement: o.entitlement } : {}) },
  }
}

/** The person (or stand-in) behind an asker, if they are still around. */
function viewOf(g: GameState, k: Asker): Person | null {
  if (k.pid) {
    const p = g.people.find((x) => x.id === k.pid)
    return p && p.alive ? p : null
  }
  return k.out ? pseudo(k.out) : null
}

function kinOf(p: Person): string {
  return kinWord(p)
}

/** The rank a person asks for, from age, ambition and how entitled they are. */
export function wantedRank(p: Person): number {
  if (p.age < 18) return 0
  const ent = entitlement(p)
  let r = p.age < 22 ? 0 : p.age < 30 ? 1 : 2
  if (p.traits.includes('ambitious')) r += 1
  if (p.traits.includes('lazy')) r -= 0
  if (ent >= 50) r += 1
  if (ent >= 75) r += 1
  const cap = p.age < 19 ? 1 : p.age < 22 ? 2 : p.age < 26 ? 3 : 4
  return Math.round(clampN(r, 0, cap))
}

/** Where a person would start if the answer is "start at the bottom". */
export function entryRank(p: Person): number {
  if (p.age < 22) return 0
  return outlookFor(p, 1).fit >= -4 ? 1 : 0
}

function trait(p: Person, ...ts: string[]): boolean {
  return p.traits.some((t) => ts.includes(t))
}

/** The chance this person brings it up this year (pure). */
export function askOdds(g: GameState, b: BizState, p: Person): number {
  if (hireBlock(g, b, p) !== null || readJob(p)) return 0
  let base = 0
  switch (p.relation) {
    case 'child':
    case 'stepchild':
      base = p.age < 14 ? 0 : p.age < 18 ? 0.1 : p.age < 25 ? 0.22 : p.age < 36 ? 0.12 : p.age < 51 ? 0.05 : 0.02
      break
    case 'grandchild':
      base = p.age >= 16 ? 0.08 : 0
      break
    case 'sibling':
    case 'halfSibling':
    case 'stepsibling':
      base = p.age >= 18 && p.age <= 60 ? 0.03 : 0
      break
    case 'spouse':
      base = p.age >= 18 && p.age <= 65 ? 0.04 : 0
      break
    case 'fiance':
    case 'partner':
    case 'friend':
    case 'bestFriend':
      base = 0.02
      break
    case 'parent':
    case 'stepparent':
      base = p.age <= 72 ? 0.01 : 0
      break
    case 'coworker':
      base = isRelative(p) ? 0.02 : 0
      break
    default:
      base = 0
  }
  if (base <= 0) return 0
  const life = npcLife(p)
  if (life && p.data.npcRecruitmentYear === g.year && p.relationship >= 55 && !p.data.npcCompany) {
    const technical = ['software', 'aiLab', 'robotics', 'semiconductor', 'manufacturing', 'biotech', 'quantum', 'cybersecurity', 'fusion', 'neurotech', 'drones', 'carbonCapture'].includes(b.industry)
    const relevant = ['Business', 'Law', 'Marketing'].includes(life.field) || (technical && ['Engineering','Mathematics','Computer Science','Medicine'].includes(life.field)) || (['investmentFirm','bank','onlineBank'].includes(b.industry) && ['Finance','Mathematics','Computer Science'].includes(life.field))
    if (relevant) base = Math.max(base, .4)
  }
  let m = 1
  if (trait(p, 'ambitious')) m *= 1.8
  if (trait(p, 'lazy')) m *= 0.35
  if (trait(p, 'rebellious')) m *= 0.7
  if (trait(p, 'outgoing')) m *= 1.2
  if (trait(p, 'shy')) m *= 0.8
  if (entitlement(p) >= 60) m *= 1.5
  if (p.relationship < 30) m *= 0.4
  if (typeof p.data.nepoSelfMade === 'number') m *= 0.1
  const no = rec(p.data.nepoNo)
  if (no && g.year - num(no.y) <= 3) m *= 0.3
  const past = readPast(p)
  if (past && past.how === 'fired' && g.year - past.year <= 5) m *= 0.1
  if (typeof p.data.nepoGrudge === 'number' && g.year - p.data.nepoGrudge <= 5) m *= 0.1
  const profit = (b.last?.net ?? 0) > 0
  m *= profit ? 1.3 : 0.6
  m *= 0.5 + b.share / 2
  return clampN(base * m, 0, 0.6)
}

const OUTSIDER_ODDS = 0.02

function outsiderKin(g: GameState): { kin: string; gender: 'male' | 'female'; last?: string }[] {
  const out: { kin: string; gender: 'male' | 'female'; last?: string }[] = [
    { kin: 'cousin', gender: 'male' },
    { kin: 'cousin', gender: 'female' },
  ]
  const sp = g.people.find((p) => p.alive && p.relation === 'spouse')
  if (sp) {
    out.push({ kin: 'brother-in-law', gender: 'male', last: sp.lastName }, { kin: 'sister-in-law', gender: 'female', last: sp.lastName })
  }
  return out
}

/** Everyone who asks this year (a few at most), in the order the popup lists them. Uses g's RNG. */
export function rollAskers(g: GameState, b: BizState): Asker[] {
  const out: Asker[] = []
  for (const p of g.people) {
    if (!p.alive || p.relation === 'pet') continue
    const odds = askOdds(g, b, p)
    if (odds > 0 && chance(g, odds)) out.push({ pid: p.id, want: wantedRank(p) })
  }
  // A married child's husband or wife.
  for (const p of g.people) {
    if (!p.alive || (p.relation !== 'child' && p.relation !== 'stepchild') || p.data.married !== true || typeof p.data.spouseName !== 'string' || p.age < 22) continue
    if (hireBlock(g, b, p) !== null) continue
    if (chance(g, 0.01 * (b.share + 0.5))) {
      const [first, ...rest] = p.data.spouseName.split(' ')
      const gender = p.gender === 'male' ? 'female' : 'male'
      const o: Outsider = { ...rollOutsider(g, b, gender === 'male' ? 'son-in-law' : 'daughter-in-law', gender, rest.join(' ') || p.lastName), firstName: first }
      out.push({ out: o, want: 1 })
      break
    }
  }
  if (out.length < 3 && chance(g, OUTSIDER_ODDS * (0.5 + b.share / 2))) {
    const k = pick(g, outsiderKin(g))
    const o = rollOutsider(g, b, k.kin, k.gender, k.last)
    out.push({ out: o, want: 1 })
  }
  // Closest family first; three at most.
  const order = (k: Asker): number => {
    const p = k.pid ? g.people.find((x) => x.id === k.pid) : null
    if (!p) return 9
    return isDescendant(p) ? 0 : p.relation === 'spouse' ? 1 : 2
  }
  return out.sort((x, y) => order(x) - order(y)).slice(0, 3)
}

// ---------------------------------------------------------------------------
// The popup

function parentWord(g: GameState): string {
  const male = g.character.gender === 'male'
  return g.year < 1950 ? (male ? 'Father' : 'Mother') : male ? 'Dad' : 'Mom'
}

const KID_MINOR = [
  (co: string, par: string) => `"${par}, can I work at ${co} this summer? I'll do anything. Even the filing."`,
  (co: string, par: string) => `"Everyone has a summer job, ${par}. Mine could be at ${co}. It would be so much easier than finding one."`,
  (co: string, par: string) => `"${par}, I want to see what you actually do all day at ${co}. Also I need money."`,
]
const KID_MODEST = [
  (co: string, par: string) => `"${par}, can I work at ${co}? I'd like to learn the business from the ground up."`,
  (co: string, par: string) => `"I'm done with applications, ${par}. Can I just start at ${co}? I'll work hard, I promise."`,
]
const KID_BOLD = [
  (co: string, par: string) => `"Honestly, ${par}, I could run ${co} better than half the people there. Just give me the title and watch."`,
  (_co: string, par: string) => `"It's going to be mine someday anyway, ${par}. Why wait? A vice president's desk would be fine."`,
]
const OTHER = [
  (_co: string) => `"Family helps family. You have a company. I need a job. See where I'm going with this?"`,
  (co: string) => `"I hear ${co} is hiring. And I hear you know the owner."`,
]
const SPOUSE = [
  (_co: string) => `"I could help at the company. I'm bored, and nobody there will tell you the truth like I will."`,
  (_co: string) => `"Let me in on the family business. Besides, who better to keep an eye on it?"`,
]

function askLine(g: GameState, k: Asker, p: Person, co: string): string {
  const life = npcLife(p)
  if (life && p.data.npcRecruitmentYear === g.year && life.achievements.length) return `"I just completed my ${life.achievements.at(-1)}. Could I put that training to work at ${co}? I would like a relevant role and competitive pay."`
  const par = parentWord(g)
  const pickLine = <T,>(xs: readonly T[]): T => xs[(p.id.length + g.year + p.age) % xs.length]
  if (k.out) return pickLine(OTHER)(co)
  if (p.relation === 'spouse' || p.relation === 'fiance') return pickLine(SPOUSE)(co)
  if (p.relation === 'child' || p.relation === 'stepchild' || p.relation === 'grandchild') {
    if (p.age < 18) return pickLine(KID_MINOR)(co, par)
    return k.want >= 3 || entitlement(p) >= 60 ? pickLine(KID_BOLD)(co, par) : pickLine(KID_MODEST)(co, par)
  }
  return pickLine(OTHER)(co)
}

function nameLine(p: Person): string {
  const kin = typeof p.data.kin === 'string' && p.data.kin ? p.data.kin : kinOf(p)
  return `Your ${kin} ${p.firstName} (${p.age})`
}

/** The honest "how would it go" hint for the Business talent. */
function fitHint(g: GameState, p: Person, rank: number, kind: 'real' | 'cushy'): string | undefined {
  if (!hasTalent(g, 'Business')) return undefined
  const o = outlookFor(p, rank, kind)
  return talentHint(g, 'Business', outlookText(o, rank, kind)) || undefined
}

function boardHint(g: GameState, a: Asset, b: BizState, p: Person, opts: HireOpts): string {
  const plan = planHire(g, b, p, opts)
  const proposal = planProposal(p, plan)
  if (!needsVote(g, a, b, proposal)) return ''
  return ` The board votes on it (about ${Math.round(passOdds(g, a, b, proposal) * 100)}% to pass).`
}

const SCRIPT = 'nepo.ask'

function present(g: GameState, a: Asset, b: BizState, askers: Asker[]): void {
  const co = a.name
  const people = askers.map((k) => ({ k, p: viewOf(g, k) })).filter((x): x is { k: Asker; p: Person } => x.p !== null)
  if (people.length === 0) return
  const data = { assetId: a.id, askers: people.map((x) => askerToJson(x.k)) }
  const choices: ChoiceOption[] = []
  if (people.length === 1) {
    const { k, p } = people[0]
    const entry = entryRank(p)
    const entryPlan = planHire(g, b, p, { rank: entry })
    choices.push({ id: 'entry', label: `Hire as ${entryPlan.title} (${money(entryPlan.pay)}/yr${entryPlan.part ? ', summer pay' : ''})`, emoji: '\u{1F9D1}\u{200D}\u{1F4BC}', hint: fitHint(g, p, entry, 'real') })
    if (k.want > entry) {
      const plan = planHire(g, b, p, { rank: k.want })
      choices.push({ id: 'asked', label: `Give them the job they want: ${plan.title} (${money(plan.pay)}/yr)`, emoji: '\u{1F4C8}', hint: hasTalent(g, 'Business') ? talentHint(g, 'Business', `${outlookText(outlookFor(p, k.want), k.want, 'real')}.${boardHint(g, a, b, p, { rank: k.want })}`) : undefined })
    }
    if (p.age >= 18 && (k.want >= 2 || entitlement(p) >= 50)) {
      const plan = planHire(g, b, p, { rank: 3, kind: 'cushy' })
      choices.push({ id: 'cushy', label: `Make up a job: ${plan.title} (${money(plan.pay)}/yr)`, emoji: '\u{1F6CB}\u{FE0F}', hint: hasTalent(g, 'Business') ? talentHint(g, 'Business', `${outlookText(outlookFor(p, 3, 'cushy'), 3, 'cushy')} (${CUSHY_PAY_MULT}x the going rate for a director).${boardHint(g, a, b, p, { rank: 3, kind: 'cushy' })}`) : undefined })
    }
    if ((p.relation === 'child' || p.relation === 'stepchild' || p.relation === 'grandchild') && p.age >= 21) {
      const r = Math.max(1, Math.min(2, entry + 1))
      const plan = planHire(g, b, p, { rank: r })
      choices.push({ id: 'groom', label: `Hire and groom as your successor: ${plan.title} (${money(plan.pay)}/yr)`, emoji: '\u{1F451}', hint: fitHint(g, p, r, 'real') })
    }
    choices.push({ id: 'no', label: `Tell ${p.gender === 'male' ? 'him' : 'her'} to earn it elsewhere`, emoji: '\u{1F645}', hint: hasTalent(g, 'Business') ? talentHint(g, 'Business', noHint(p)) : undefined })
  } else {
    const fits = people.filter(({ p }) => outlookFor(p, entryRank(p)).fit >= 0).length
    choices.push({ id: 'entryAll', label: 'Hire all of them at the bottom', emoji: '\u{1F9D1}\u{200D}\u{1F4BC}' })
    choices.push({ id: 'process', label: 'Put them through the normal hiring process', emoji: '\u{1F4DD}', hint: hasTalent(g, 'Business') ? talentHint(g, 'Business', `${fits} of ${people.length} would clear the bar for an entry-level job`) : undefined })
    if (people.some(({ k, p }) => k.want > entryRank(p))) choices.push({ id: 'askedAll', label: 'Give each the job they asked for', emoji: '\u{1F4C8}' })
    choices.push({ id: 'oneByOne', label: 'Decide one at a time', emoji: '\u{1F5C2}\u{FE0F}' })
    choices.push({ id: 'noAll', label: 'Say no to all of them', emoji: '\u{1F645}' })
  }
  const lines = people.map(({ k, p }) => `${nameLine(p)} ${people.length > 1 ? 'asks' : 'asked'} about a job at ${co}: ${askLine(g, k, p, co)}`)
  const first = people[0].p
  const title = people.length > 1 ? 'The Family Wants In' : first.age < 18 ? 'Summer Job?' : 'Can I Work for You?'
  scriptChoice(g, SCRIPT, title, lines.join('\n\n'), choices, { emoji: '\u{1F454}', data: data as Json, personId: people.length === 1 && people[0].k.pid ? people[0].k.pid : undefined })
}

/** What saying no does, for the Business hint: honest odds of the self-made path. */
function noHint(p: Person): string {
  const odds = Math.round(selfMadeOdds(p) * 100)
  return `Saying no: about ${odds}% they go and make it on their own (and come back stronger); otherwise they sulk`
}

/** The chance a refused relative goes and earns it elsewhere. */
export function selfMadeOdds(p: Person): number {
  return clampN(0.25 + driveOf(p) / 220 + (trait(p, 'ambitious') ? 0.12 : 0) - entitlement(p) / 250, 0.05, 0.75)
}

// ---------------------------------------------------------------------------
// The answers

type How = 'entry' | 'asked' | 'cushy' | 'groom' | 'no' | 'fair'

function personFor(g: GameState, b: BizState, k: Asker, willHire: boolean): Person | null {
  if (k.pid) return viewOf(g, k)
  if (!k.out) return null
  return willHire ? materialize(g, b, k.out) : pseudo(k.out)
}

/** Refuse (or fairly decline): the relationship, the grudge, the chance they go and earn it. Returns a sentence. */
function decline(g: GameState, a: Asset, b: BizState, k: Asker, fair: boolean): string {
  const p = viewOf(g, k)
  if (!p) return ''
  if (!k.pid) return `${p.firstName} muttered something about family loyalty and left.`
  const real = g.people.find((x) => x.id === k.pid)
  if (!real) return ''
  const no = rec(real.data.nepoNo)
  real.data.nepoNo = { y: g.year, n: Math.round(num(no?.n)) + 1 }
  const he = real.gender === 'male' ? 'He' : 'She'
  if (chance(g, selfMadeOdds(real))) {
    real.data.nepoSelfMade = g.year
    addEntitlement(real, -8)
    real.stats.smarts = clampN(real.stats.smarts + 2, 0, 100)
    addRelationship(g, real, fair ? 4 : 2)
    if (real.age >= 18 && !/\bat\b/.test(real.occupation)) real.occupation = randomOccupation(g, Math.max(23, real.age))
    notePerson(real, `Turned down for a job at ${a.name}; earned ${real.gender === 'male' ? 'his' : 'her'} own way instead.`)
    log(g, `${real.firstName} found ${real.gender === 'male' ? 'his' : 'her'} own way after I said no.`, 'good')
    return `${he} found something on ${real.gender === 'male' ? 'his' : 'her'} own, and respects you for it.`
  }
  const ent = entitlement(real)
  addRelationship(g, real, -Math.round((fair ? 3 : 6 + ent / 8) + (trait(real, 'ambitious') ? 3 : 0)))
  if (ent >= 50 || !fair) real.data.nepoGrudge = g.year
  void b
  return fair ? `${he} took it fairly well.` : `${he} took it badly.`
}

function answerOne(g: GameState, a: Asset, b: BizState, k: Asker, how: How): string {
  if (how === 'no' || how === 'fair') return decline(g, a, b, k, how === 'fair')
  const peek = viewOf(g, k)
  if (!peek) return ''
  const entry = entryRank(peek)
  const opts: HireOpts =
    how === 'entry' ? { rank: entry } : how === 'asked' ? { rank: k.want } : how === 'cushy' ? { rank: 3, kind: 'cushy' } : { rank: Math.max(1, Math.min(2, entry + 1)), groom: true }
  const p = personFor(g, b, k, true)
  if (!p) return ''
  const r = hireRelative(g, a, b, p, opts, { quiet: true, asked: how !== 'entry' })
  if (!r.ok) {
    // An outsider who was never hired disappears again.
    if (!k.pid) g.people = g.people.filter((x) => x.id !== p.id)
    return r.voted ? `${p.firstName} did not get the job: the board said no.` : r.reason ? `${p.firstName} did not get the job: ${r.reason}` : ''
  }
  const plan = planHire(g, b, p, opts)
  void plan
  const j = readJob(p)
  return `${p.firstName} is in: ${j?.title ?? 'a new job'} at ${money(j?.pay ?? 0)} a year.`
}

defineScript(SCRIPT, (g, choice, data) => {
  const d = rec(data)
  const a = findBusiness(g, str(d?.assetId))
  if (!a || !d) return
  const b = bizOf(g, a)
  const askers = (Array.isArray(d.askers) ? d.askers : []).map(askerFromJson).filter((x): x is Asker => x !== null)
  if (askers.length === 0) return
  if (g.character.age < 18 || g.character.prison) return
  if (choice === 'oneByOne') {
    for (const k of askers) present(g, a, b, [k])
    return
  }
  const lines: string[] = []
  if (askers.length === 1) {
    const how: How = choice === 'asked' || choice === 'cushy' || choice === 'groom' || choice === 'no' ? choice : 'entry'
    const line = answerOne(g, a, b, askers[0], how)
    if (line) lines.push(line)
  } else if (choice === 'noAll') {
    for (const k of askers) lines.push(`${answerOne(g, a, b, k, 'no')}`)
  } else if (choice === 'process') {
    for (const k of askers) {
      const p = viewOf(g, k)
      if (!p) continue
      const ok = outlookFor(p, entryRank(p)).fit >= 0
      lines.push(`${p.firstName}: ${answerOne(g, a, b, k, ok ? 'entry' : 'fair')}`)
    }
  } else {
    const how: How = choice === 'askedAll' ? 'asked' : 'entry'
    for (const k of askers) lines.push(answerOne(g, a, b, k, how))
  }
  const text = lines.filter(Boolean).join(' ')
  const fam = familyOf(b)
  fam.askYear = g.year
  if (text) notice(g, 'The Family Business', text, { emoji: '\u{1F454}' })
  if (choice === 'no' || choice === 'noAll') addHidden(g, 'karma', 0)
})

// ---------------------------------------------------------------------------
// Yearly

/** Asks for the year: at most one popup, for the company where the player has the biggest stake. */
export function askRound(g: GameState): void {
  const c = g.character
  if (!c.alive || c.age < 18 || c.prison || !popupRoom(g)) return
  const list = businessAssets(g)
    .map((a) => ({ a, b: bizOf(g, a) }))
    .filter(({ b }) => b.founded < g.year && b.share >= 0.2)
    .sort((x, y) => stakeValue(y.b) - stakeValue(x.b))
  const top = list[0]
  if (!top) return
  const fam = readFamily(top.b.family)
  if (g.year - fam.askYear < 2) return
  const askers = rollAskers(g, top.b)
  if (askers.length === 0) return
  if (!useChoicePopup(g)) return
  familyOf(top.b).askYear = g.year
  for (const k of askers) {
    if (k.pid) {
      const p = g.people.find((x) => x.id === k.pid)
      if (p) p.data.nepoAsk = g.year
    }
  }
  present(g, top.a, top.b, askers)
}

/** Show the ask popup for these askers (the yearly roll uses it; tests drive it directly). */
export { present as presentAsk }
