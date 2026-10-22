import { underworldMenu } from './underworld'
import { economyOf } from './economy'
import { personCash } from './cash'
// Crime: the Crime activity menu (petty theft to murder), arrests & trials, organized crime,
// and the yearly police work (wanted level, fugitives, stolen cars, audits, prison years).
import {
  addHidden,
  addMoney,
  addPersonStat,
  addRelationship,
  addStat,
  aThing,
  canAfford,
  clamp,
  count,
  counter,
  endJob,
  formatMoney,
  fullName,
  getPerson,
  hasLicense,
  log,
  minigame,
  notice,
  parents,
  pronouns,
  relationLabel,
  remember,
  scriptChoice,
  shortMoney,
  spend,
  useYearAction,
  yearActionsUsed,
} from './core'
import { killCharacter } from './death'
import { notePerson } from './people'
import { addPrisonTime, cleanRefund, convictionRecord, fugitiveInfo, FUGITIVE_FLAG, gotBack, moneyScale, releaseFromPrison, sendToPrison, yearlyPrison } from './prison'
import { addGrievance } from './activities/common'
import { chance, pick, rand, randInt, shuffle, uid } from './rng'
import { pickLine, pickSite } from './text/pick'
import { defineScript } from './scripts'
import { hasTalent, talentHint } from './talents'
import { localStreetName } from './data/locales'
import { cars, common, eraLines, eraOk, eraPick, eraStrip, exists, gateHolds, landline, prohibition, texting, venueExists } from './events/era'
import { COUNTRIES, getCountry, NAME_POOLS, randomCity, randomFirstName, randomLastName, trialBy, type NameRegion, type TrialBy } from './world'
import type {
  ChoiceOption,
  GameState,
  Gender,
  Json,
  MenuAction,
  MenuGroup,
  MenuNode,
  ModalItem,
  NoticeModal,
  Person,
  RelationKind,
  Tone,
} from './types'

// ---------------------------------------------------------------------------
// Shared helpers

function isRecord(v: Json | undefined): v is { [key: string]: Json } {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function str(v: Json | undefined, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function num(v: Json | undefined, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function years(n: number): string {
  return `${n} year${n === 1 ? '' : 's'}`
}

function cash(g: GameState, dollars: number): number {
  return Math.max(0, Math.round(dollars * moneyScale(g)))
}

/** Why the player can't commit crimes right now (dead, locked up, too young). */
function blocked(g: GameState, minAge: number): string | null {
  const c = g.character
  if (!c.alive) return 'You are dead.'
  if (c.prison) return "You can't do that from a prison cell."
  if (c.age < minAge) return `You must be at least ${minAge} years old to do that.`
  return null
}

const ageGate = (minAge: number) => (g: GameState) => blocked(g, minAge)

function canAct(g: GameState): boolean {
  return g.character.alive && !g.character.prison
}

/** Per-year limit with a "lie low" popup. */
function lieLow(g: GameState, key: string, max: number): boolean {
  if (useYearAction(g, key, max)) return true
  notice(
    g,
    'Lie Low',
    pickLine(g, [
      "You've pushed your luck enough this year. Lie low until next year.",
      'Every cop in town has your description this year. Better wait until next year.',
      'Even criminals need a vacation. Try again next year.',
      "Your gut says the heat is on. Give it a year.",
    ]),
    { emoji: '\u{1FAE3}' },
  )
  return false
}

/** Outcome popup. */
function outcome(g: GameState, title: string, text: string, emoji: string, tone: Tone = 'neutral'): void {
  notice(g, title, text, { emoji, tone })
}

/** Severity (1-5) of a named crime, for catch-ups and charges. */
const CRIME_SEVERITY: Record<string, number> = {
  Pickpocketing: 1,
  Shoplifting: 1,
  Larceny: 1,
  'Criminal Mischief': 1,
  'Disorderly Conduct': 1,
  'Reckless Endangerment': 1,
  Piracy: 1,
  'Aggravated Twerking': 1,
  'Breaking and Entering': 1,
  Joyriding: 1,
  Bootlegging: 1,
  Burglary: 2,
  'Grand Theft Auto': 2,
  Embezzlement: 2,
  'Computer Fraud': 2,
  'Identity Theft': 2,
  Assault: 2,
  Extortion: 3,
  'Wire Fraud': 3,
  'Bank Robbery': 3,
  'Armed Robbery': 3,
  'Train Robbery': 3,
  Racketeering: 3,
  'Attempted Murder': 4,
  'Conspiracy to Commit Murder': 4,
  Murder: 5,
  'Contract Killing': 5,
}

export function crimeSeverity(crime: string): number {
  return CRIME_SEVERITY[crime] ?? 2
}

interface CrimeCost {
  /** Karma lost. */
  karma: number
  /** Notoriety gained. */
  notoriety: number
  /** Chance the police start looking for you (+1 wanted level). */
  heat: number
}

/**
 * Crime talent: quick hands, a poker face and an uncanny knack for not getting caught.
 * Scales the chance of getting caught (never to zero).
 */
function caughtMult(g: GameState): number {
  return (hasTalent(g, 'Crime') ? 0.7 : 1) * Math.max(.8, Math.min(1.2, economyOf(g).services))
}

/** Crime talent: extra success odds on a job (as a 0-1 bonus). */
function crimeEdge(g: GameState): number {
  return hasTalent(g, 'Crime') ? 0.1 : 0
}

/** Record a committed crime (uncaught for now). Returns its index in the criminal record. */
function commitCrime(g: GameState, crime: string, cost: CrimeCost): number {
  const c = g.character
  count(g, 'crimes')
  c.criminalRecord.push({ crime, age: c.age, caught: false, convicted: false })
  addHidden(g, 'karma', -Math.abs(cost.karma))
  addHidden(g, 'notoriety', cost.notoriety)
  if (cost.heat > 0 && chance(g, Math.min(1, cost.heat * caughtMult(g)))) c.wantedLevel = clamp(c.wantedLevel + (cost.heat > 1 ? 2 : 1), 0, 5)
  const fam = crimeFamily(g)
  if (fam) fam.standing = clamp(fam.standing + randInt(g, 1, 3))
  return c.criminalRecord.length - 1
}

/** Stolen money lands in your account (untaxed). Crime-family members kick up a cut. */
function pocket(g: GameState, amount: number): number {
  const n = Math.max(0, Math.round(amount))
  if (n <= 0) return 0
  addMoney(g, n, 'crime.take')
  count(g, 'moneyStolen', n)
  const fam = crimeFamily(g)
  if (fam && n >= 1000) {
    const cut = Math.round(n * (fam.rank >= 4 ? 0 : 0.15))
    if (cut > 0) {
      addMoney(g, -cut, 'crime.cost')
      fam.earnings += cut
      fam.standing = clamp(fam.standing + 2)
      log(g, `I kicked up ${formatMoney(cut)} to the ${fam.name}.`, 'neutral')
      return n - cut
    }
  }
  return n
}

/** Lower health without killing the player outright (stats death is handled at age-up). */
function hurt(g: GameState, amount: number): number {
  const h = g.character.stats.health
  const dmg = Math.min(Math.round(amount), Math.max(0, h - 1))
  addStat(g, 'health', -dmg)
  return dmg
}

const FAMILY_RELATIONS: RelationKind[] = [
  'parent',
  'stepparent',
  'sibling',
  'halfSibling',
  'stepsibling',
  'grandparent',
  'child',
  'stepchild',
  'grandchild',
  'spouse',
  'partner',
  'fiance',
]

function isFamily(p: Person): boolean {
  return FAMILY_RELATIONS.includes(p.relation)
}

/** People who can be targeted by crimes (no pets, no cellmates). */
function targetablePeople(g: GameState): Person[] {
  return g.people.filter((p) => p.alive && p.relation !== 'pet' && p.relation !== 'cellmate')
}

function strangerName(g: GameState, gender: Gender): string {
  return `${randomFirstName(g, g.character.countryId, gender)} ${randomLastName(g, g.character.countryId)}`
}

function insertNoticeAt(g: GameState, index: number, title: string, text: string, emoji: string, tone: Tone): void {
  notice(g, title, text, { emoji, tone })
  const m = g.queue.pop() as NoticeModal
  g.queue.splice(Math.min(index, g.queue.length), 0, m)
}

// ---------------------------------------------------------------------------
// Arrest & trial

export interface ArrestOptions {
  /** 0-1: how strong the case is. Red-handed arrests are ~0.8-0.9. */
  evidence?: number
  /** Index of the criminal-record entry this arrest is for. */
  recordIndex?: number
  victimId?: string
  violent?: 'murder' | 'attempted'
  extraCharges?: string[]
  falseAccusation?: boolean
  /** Skip the cooperate / run / bribe popup. */
  noResist?: boolean
  /** Custom first line of the arrest popup. */
  context?: string
  /**
   * Money an investigation took before the trial, held for the player. An acquittal hands it back; a
   * conviction or plea forfeits it (an appeal that overturns the conviction hands it back later).
   * Two arrests that join one trial add their refunds.
   */
  refund?: number
  /** Who prosecuted ("the FCA"), named in the grievance an acquittal files for a later suit. */
  defendant?: string
}

interface LawyerOption {
  id: string
  name: string
  fee: number
  quality: number
  blurb: string
}

interface TrialData {
  crime: string
  charges: string[]
  severity: number
  evidence: number
  records: number[]
  victimId: string | null
  violent: 'murder' | 'attempted' | null
  extraYears: number
  falseAccusation: boolean
  fedsAsked: boolean
  lawyers: LawyerOption[]
  lawyer: LawyerOption | null
  plea: number
  /** Money taken before the trial, to give back on an acquittal. Always a safe number (see asTrial). */
  refund: number
  /** The prosecuting agency, when it has a name (see asTrial). */
  defendant?: string
}

const ARREST_SCRIPT = 'crime.arrest'
const FEDS_SCRIPT = 'crime.trial.feds'
const LAWYER_SCRIPT = 'crime.trial.lawyer'
const PLEA_SCRIPT = 'crime.trial.plea'
const TRIAL_SCRIPTS = new Set([ARREST_SCRIPT, FEDS_SCRIPT, LAWYER_SCRIPT, PLEA_SCRIPT])

const MAX_DEFENDANT = 60

/** A short name that is safe to show: control and format characters and angle brackets stripped; else absent. */
function cleanDefendant(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const s = v
    .replace(/\s+/g, ' ')
    .replace(/[\p{Cc}\p{Cf}<>]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
  const short = Array.from(s).slice(0, MAX_DEFENDANT).join('').trim()
  return short || undefined
}

function asTrial(data: Json | undefined): TrialData | null {
  if (!isRecord(data) || typeof data.crime !== 'string') return null
  // The data may come out of a save: an old one has no refund, a damaged one anything at all.
  data.refund = cleanRefund(data.refund)
  const defendant = cleanDefendant(data.defendant)
  if (defendant) data.defendant = defendant
  else delete data.defendant
  return data as unknown as TrialData
}

function trialJson(t: TrialData): Json {
  return t as unknown as Json
}

function titleCase(s: string): string {
  return s.replace(/\b([a-z])/g, (m) => m.toUpperCase())
}

function chargeList(t: TrialData): string {
  const all = [...new Set([t.crime, ...t.charges])]
  if (all.length === 1) return all[0].toLowerCase()
  return `${all.slice(0, -1).join(', ').toLowerCase()} and ${all[all.length - 1].toLowerCase()}`
}

/** Mark (or create) the criminal-record entry for this arrest. */
function markCaught(g: GameState, crime: string, recordIndex?: number): number {
  const rec = g.character.criminalRecord
  if (recordIndex !== undefined && rec[recordIndex]) {
    rec[recordIndex].caught = true
    return recordIndex
  }
  for (let i = rec.length - 1; i >= 0; i--) {
    if (rec[i].crime === crime && !rec[i].caught) {
      rec[i].caught = true
      return i
    }
  }
  rec.push({ crime, age: g.character.age, caught: true, convicted: false })
  return rec.length - 1
}

function unmarkCaught(g: GameState, t: TrialData): void {
  for (const i of t.records) {
    const r = g.character.criminalRecord[i]
    if (r && !r.convicted) r.caught = false
  }
}

function bribeAmount(g: GameState, severity: number): number {
  return cash(g, [500, 2500, 10000, 50000, 250000][clamp(severity, 1, 5) - 1])
}

/**
 * The police catch the player. Shows the arrest popup (cooperate / run / bribe / insult),
 * then lawyer choice, maybe a plea deal, then the verdict and sentence (prison via sendToPrison).
 * Safe to call at any time (event outcomes, yearly hooks, while already in prison).
 */
export function arrestPlayer(g: GameState, crime: string, severity: number, opts: ArrestOptions = {}): void {
  const c = g.character
  if (!c.alive) return
  const name = titleCase((crime || 'Disorderly Conduct').trim().slice(0, 60)) || 'Disorderly Conduct'
  const sev = clamp(Math.round(Number.isFinite(severity) ? severity : 2), 1, 5)
  const evidence = clamp(opts.evidence ?? 0.65, 0, 1)
  const refund = cleanRefund(opts.refund)
  const defendant = cleanDefendant(opts.defendant)

  // Already behind bars: charged inside, time added, no trial. That is a conviction, so any refund is forfeited.
  if (c.prison) {
    count(g, 'arrests')
    const rec = c.criminalRecord
    let idx = opts.recordIndex !== undefined && rec[opts.recordIndex] ? opts.recordIndex : -1
    if (idx < 0) {
      for (let i = rec.length - 1; i >= 0; i--) {
        if (rec[i].crime === name && !rec[i].caught) {
          idx = i
          break
        }
      }
    }
    const add = Math.max(1, Math.round(sev * (1 + rand(g))))
    // addPrisonTime records the conviction (on the existing record entry when there is one).
    addPrisonTime(g, add, name, idx >= 0 ? idx : undefined)
    const extra = c.prison.life || c.prison.deathRow ? 'Not that it changes much for you.' : `${years(add)} were added to your sentence.`
    notice(g, 'Charged', `You were convicted of ${name.toLowerCase()} while already in prison. ${extra}${courtKept(refund, false)}`, { emoji: '\u{2696}\u{FE0F}', tone: 'bad' })
    return
  }

  // Little kids get a lecture, not a trial.
  if (c.age < 10) {
    for (const p of parents(g)) addRelationship(p, -randInt(g, 3, 8))
    log(g, `The police caught me ${name === 'Disorderly Conduct' ? 'causing trouble' : `doing something I shouldn't (${name.toLowerCase()})`} and drove me home.`, 'bad')
    // No case, no conviction: whatever was held for it comes straight back.
    if (refund > 0) addMoney(g, refund, 'legal')
    notice(g, 'Busted', `A police officer caught you and drove you home. After a long lecture about ${name.toLowerCase()}, your parents grounded you for what feels like forever.${gotBack(refund)}`, {
      emoji: '\u{1F46E}',
      tone: 'bad',
    })
    return
  }

  const idx = markCaught(g, name, opts.recordIndex)

  // Already facing a trial (e.g. two arrests in one popup chain): add the charge to it.
  const pending = g.queue.find((m): m is Extract<ModalItem, { kind: 'choice' }> => m.kind === 'choice' && !!m.scriptId && TRIAL_SCRIPTS.has(m.scriptId))
  const pendingTrial = pending ? asTrial(pending.data) : null
  if (pending && pendingTrial) {
    if (!pendingTrial.charges.includes(name) && pendingTrial.crime !== name) pendingTrial.charges.push(name)
    pendingTrial.severity = Math.max(pendingTrial.severity, sev)
    pendingTrial.evidence = Math.max(pendingTrial.evidence, evidence)
    pendingTrial.records.push(idx)
    pendingTrial.refund = cleanRefund(pendingTrial.refund + refund)
    if (defendant && !pendingTrial.defendant) pendingTrial.defendant = defendant
    if (opts.violent && pendingTrial.violent !== 'murder') pendingTrial.violent = opts.violent
    if (opts.victimId && !pendingTrial.victimId) pendingTrial.victimId = opts.victimId
    pending.data = trialJson(pendingTrial)
    return
  }

  count(g, 'arrests')
  c.wantedLevel = 0
  const trial: TrialData = {
    crime: name,
    charges: [...new Set((opts.extraCharges ?? []).map(titleCase))].filter((x) => x !== name),
    severity: sev,
    evidence,
    records: [idx],
    victimId: opts.victimId ?? null,
    violent: opts.violent ?? null,
    extraYears: 0,
    falseAccusation: !!opts.falseAccusation,
    fedsAsked: false,
    lawyers: [],
    lawyer: null,
    plea: 0,
    refund,
    ...(defendant ? { defendant } : {}),
  }
  log(g, `I was arrested for ${name.toLowerCase()}.`, 'bad')
  if (opts.noResist) {
    toLawyer(g, trial)
    return
  }
  const bribe = bribeAmount(g, sev)
  const intro =
    opts.context ??
    pickSite(g, [
      `The police caught you red-handed. You're under arrest for ${name.toLowerCase()}.`,
      `Sirens! An officer slapped the cuffs on you for ${name.toLowerCase()}.`,
      `"Freeze!" The police have you dead to rights for ${name.toLowerCase()}.`,
    ], 0x46f4682b)
  // Crime talent: you sense the way out (still a gamble).
  const runOdds = runAwayOdds(g)
  const bribeOdds = canAfford(g, bribe) ? bribeOdds0(sev) : 0
  const way = runOdds >= bribeOdds ? 'run' : 'bribe'
  const hint = talentHint(g, 'Crime', `Your best way out (about ${Math.round(Math.max(runOdds, bribeOdds) * 100)}%).`)
  scriptChoice(g, ARREST_SCRIPT, 'Busted!', `${intro} What do you do?`, [
    { id: 'cooperate', label: 'Cooperate', emoji: '\u{1F64C}' },
    { id: 'run', label: 'Run', emoji: '\u{1F3C3}', ...(hint && way === 'run' ? { hint } : {}) },
    { id: 'bribe', label: `Bribe the officer (${formatMoney(bribe)})`, emoji: '\u{1F4B5}', ...(hint && way === 'bribe' ? { hint } : {}) },
    { id: 'insult', label: 'Insult the officer', emoji: '\u{1F595}' },
  ], { emoji: '\u{1F6A8}', data: trialJson(trial) })
}

/** Odds of outrunning the arresting officer. */
function runAwayOdds(g: GameState): number {
  const c = g.character
  return clamp(0.1 + (c.hidden.athleticism - 50) / 500 + (c.age < 30 ? 0.02 : -0.03), 0.04, 0.22) + (hasTalent(g, 'Crime') ? 0.12 : 0)
}

/** Odds that the officer takes the bribe. */
function bribeOdds0(severity: number): number {
  return [0.6, 0.45, 0.25, 0.08, 0.02][severity - 1] ?? 0.1
}

defineScript(ARREST_SCRIPT, (g, choice, data) => {
  const t = asTrial(data)
  const c = g.character
  if (!t || !c.alive || c.prison) return
  if (choice === 'run') {
    const p = runAwayOdds(g)
    if (chance(g, p)) {
      // Fled, not cleared: the case is dropped and any refund with it.
      unmarkCaught(g, t)
      c.wantedLevel = clamp(c.wantedLevel + 2, 0, 5)
      log(g, 'I ran from the police and got away!', 'event')
      outcome(g, 'Got Away!', pickLine(g, ['You juked the officer, hopped a fence and vanished down an alley. The police are still looking for you.', 'You ran like the wind. The officer, sadly for him, ran like a light breeze. You got away, for now.']), '\u{1F3C3}', 'good')
      return
    }
    t.charges.push('Resisting Arrest')
    t.extraYears += 1
    const beaten = chance(g, 0.5)
    const dmg = beaten ? hurt(g, randInt(g, 5, 15)) : 0
    notice(g, 'Tackled', `You made it about ten feet before an officer tackled you.${beaten ? ` They roughed you up on the way to the car. (-${dmg} health)` : ''} Resisting arrest has been added to your charges.`, {
      emoji: '\u{1F93E}',
      tone: 'bad',
    })
    toLawyer(g, t)
    return
  }
  if (choice === 'bribe') {
    const amount = bribeAmount(g, t.severity)
    if (!canAfford(g, amount)) {
      notice(g, 'Empty Pockets', `You reached for your wallet, then remembered you don't have ${formatMoney(amount)}. The officer was not amused.`, { emoji: '\u{1F4B8}', tone: 'bad' })
      toLawyer(g, t)
      return
    }
    const p = bribeOdds0(t.severity)
    if (chance(g, p)) {
      // Bribed, not cleared: the case is dropped and any refund with it.
      spend(g, amount, 'bribe')
      unmarkCaught(g, t)
      log(g, `I bribed a police officer with ${formatMoney(amount)} to let me go.`, 'event')
      outcome(g, 'Bribed', `The officer looked around, pocketed the ${formatMoney(amount)}, and told you to get lost. Nobody saw anything.`, '\u{1F4B5}', 'good')
      return
    }
    if (chance(g, 0.5)) {
      spend(g, amount, 'bribe')
      notice(g, 'Bad Cop', `The officer took your ${formatMoney(amount)}, thanked you, and arrested you anyway.`, { emoji: '\u{1F46E}', tone: 'bad' })
    } else {
      t.charges.push('Bribery')
      t.extraYears += 1
      notice(g, 'Honest Cop', "Of all the cops in the world, you tried to bribe the honest one. Bribery has been added to your charges.", { emoji: '\u{1F46E}', tone: 'bad' })
    }
    toLawyer(g, t)
    return
  }
  if (choice === 'insult') {
    const insult = pickLine(g, ['a donut-eating mall cop reject', 'a traffic cone with a badge', 'a discount action figure', "the reason your hometown's crime rate is so high"])
    const beaten = chance(g, 0.4)
    const dmg = beaten ? hurt(g, randInt(g, 5, 12)) : 0
    if (!t.charges.includes('Disorderly Conduct') && t.crime !== 'Disorderly Conduct') t.charges.push('Disorderly Conduct')
    notice(g, 'Smooth Move', `You called the officer ${insult}.${beaten ? ` They "accidentally" bumped your head on the squad car. (-${dmg} health)` : ''} Disorderly conduct has been added to your charges.`, {
      emoji: '\u{1F92C}',
      tone: 'bad',
    })
    toLawyer(g, t)
    return
  }
  toLawyer(g, t)
})

// ---------------------------------------------------------------------------
// Local justice: juries where juries decide, judges where judges do, the feds only in the US.

/** The free lawyer the court gives you: a public defender in the US, legal aid elsewhere. */
function defenderTitle(g: GameState): string {
  return g.character.countryId === 'us' ? 'Public Defender' : 'Court-Appointed Lawyer'
}

/** Who leans on a mob associate to flip: the feds in the US, organized-crime detectives elsewhere. */
function feds(g: GameState): { agents: string; title: string; informant: string; them: string } {
  return g.character.countryId === 'us'
    ? { agents: 'Federal agents', title: 'Agent', informant: 'federal informant', them: 'the feds' }
    : { agents: 'Organized-crime detectives', title: 'Inspector', informant: 'police informant', them: 'the police' }
}

/** "Felony Escape" is American legalese; elsewhere you just escaped. */
function escapeCharge(g: GameState): string {
  return g.character.countryId === 'us' ? 'Felony Escape' : 'Prison Escape'
}

/** Who reads the verdict: 'The jury', 'The court' (judges with lay judges) or 'The judge'. */
function deciders(by: TrialBy): string {
  return by === 'jury' ? 'The jury' : by === 'lay' ? 'The court' : 'The judge'
}

function guiltyLines(by: TrialBy, charges: string, term: string, where: string): string[] {
  if (by === 'jury') {
    return [
      `The jury found you GUILTY of ${charges}. The judge sentenced you to ${term} at ${where}.`,
      `GUILTY. The judge banged the gavel and sentenced you to ${term} at ${where}.`,
      `After two hours of deliberation, the jury came back: guilty on all counts. You've been sentenced to ${term} at ${where}.`,
    ]
  }
  if (by === 'lay') {
    return [
      `The court found you GUILTY of ${charges}. The presiding judge sentenced you to ${term} at ${where}.`,
      `After two hours of deliberation, the judges and lay judges came back: guilty on all counts. You've been sentenced to ${term} at ${where}.`,
      `GUILTY. Even the lay judge who kept smiling at you voted to convict. You've been sentenced to ${term} at ${where}.`,
    ]
  }
  return [
    `The judge found you GUILTY of ${charges} and sentenced you to ${term} at ${where}.`,
    `GUILTY. The judge didn't even look up from the case file before sentencing you to ${term} at ${where}.`,
    `After a trial that lasted all of one afternoon, the judge found you guilty on all counts. You've been sentenced to ${term} at ${where}.`,
  ]
}

function makeLawyers(g: GameState, sev: number): LawyerOption[] {
  const c = g.character
  const mult = [0.5, 0.8, 1.2, 2, 3][sev - 1] ?? 1
  const lawyerName = () => {
    const gender: Gender = chance(g, 0.5) ? 'male' : 'female'
    return `${randomFirstName(g, c.countryId, gender)} ${randomLastName(g, c.countryId)}`
  }
  return [
    { id: 'pd', name: defenderTitle(g), fee: 0, quality: 0.1, blurb: 'overworked and has 80 other cases' },
    { id: 'cheap', name: lawyerName(), fee: cash(g, randInt(g, 1500, 4000) * mult), quality: 0.28, blurb: 'cheap, eager, and advertises on bus benches' },
    { id: 'mid', name: lawyerName(), fee: cash(g, randInt(g, 8000, 20000) * mult), quality: 0.45, blurb: 'a solid track record' },
    { id: 'top', name: lawyerName(), fee: cash(g, randInt(g, 40000, 90000) * mult), quality: 0.65, blurb: 'the best money can buy' },
  ]
}

function toLawyer(g: GameState, t: TrialData): void {
  const c = g.character
  const fam = crimeFamily(g)
  if (fam && !fam.informant && !t.fedsAsked && c.age >= 18 && t.severity < 5) {
    t.fedsAsked = true
    const agent = strangerName(g, chance(g, 0.5) ? 'male' : 'female')
    const f = feds(g)
    scriptChoice(g, FEDS_SCRIPT, 'A Deal', `${f.agents} pulled you into an interrogation room. They know you're with the ${fam.name}. ${f.title} ${agent} slides a deal across the table: wear a wire and gather evidence on the family, and these charges disappear.`, [
      { id: 'rat', label: 'Become an informant', emoji: '\u{1F400}' },
      { id: 'refuse', label: '"I don\'t know any family."', emoji: '\u{1F910}' },
    ], { emoji: '\u{1F575}\u{FE0F}', data: trialJson(t) })
    return
  }
  t.lawyers = makeLawyers(g, t.severity)
  const lines = t.lawyers.map((l) => (l.fee > 0 ? `${l.name}: ${l.blurb}.` : `A ${defenderTitle(g).toLowerCase()}: ${l.blurb}.`))
  const choices: ChoiceOption[] = t.lawyers.map((l) => ({
    id: l.id,
    label: l.fee > 0 ? `${l.name} (${formatMoney(l.fee)})` : `${defenderTitle(g)} (free)`,
    emoji: l.id === 'top' ? '\u{1F48E}' : l.id === 'mid' ? '\u{1F4BC}' : l.id === 'cheap' ? '\u{1F4C4}' : '\u{1F9D1}\u{200D}\u{2696}\u{FE0F}',
  }))
  const juvie = c.age < 18 ? ' Since you are a minor, your case will go to juvenile court.' : ''
  scriptChoice(g, LAWYER_SCRIPT, 'Lawyer Up', `You've been charged with ${chargeList(t)}.${juvie} Who will represent you?\n\n${lines.join('\n')}`, choices, {
    emoji: '\u{2696}\u{FE0F}',
    data: trialJson(t),
  })
}

defineScript(FEDS_SCRIPT, (g, choice, data) => {
  const t = asTrial(data)
  const c = g.character
  if (!t || !c.alive || c.prison) return
  const fam = crimeFamily(g)
  if (choice === 'rat' && fam) {
    // A deal, like a plea: the charges go away and any refund is forfeited.
    fam.informant = { years: 0, evidence: 0 }
    for (const i of t.records) {
      const r = c.criminalRecord[i]
      if (r) r.convicted = false
    }
    const f = feds(g)
    log(g, `I agreed to become a ${f.informant}.`, 'event')
    remember(g, `Secretly became a ${f.informant} against the ${fam.name}.`)
    outcome(g, 'Wired', `The charges quietly vanished. You now work for ${f.them}. Gather enough evidence on the ${fam.name} within 5 years, and don't get caught. Rats don't retire in this business.`, '\u{1F400}', 'event')
    return
  }
  toLawyer(g, t)
})

defineScript(LAWYER_SCRIPT, (g, choice, data) => {
  const t = asTrial(data)
  const c = g.character
  if (!t || !c.alive || c.prison) return
  const pd = t.lawyers.find((l) => l.id === 'pd') ?? { id: 'pd', name: defenderTitle(g), fee: 0, quality: 0.1, blurb: '' }
  let lawyer = t.lawyers.find((l) => l.id === choice) ?? pd
  if (lawyer.fee > 0) {
    if (!spend(g, lawyer.fee, 'legal')) {
      notice(g, "Can't Afford It", `You can't afford ${lawyer.name}'s ${formatMoney(lawyer.fee)} retainer. The court appointed a ${defenderTitle(g).toLowerCase()} instead.`, { emoji: '\u{1F4B8}', tone: 'bad' })
      lawyer = pd
    } else {
      log(g, `I hired ${lawyer.name} as my lawyer for ${formatMoney(lawyer.fee)}.`, 'neutral')
    }
  }
  t.lawyer = lawyer
  const offerChance = t.violent === 'murder' ? 0.15 : t.severity <= 4 ? 0.35 + lawyer.quality * 0.45 : 0.2
  if (chance(g, offerChance)) {
    const expected = expectedSentence(g, t)
    t.plea = Math.max(1, Math.round(expected * (0.35 + rand(g) * 0.2) * (1 - lawyer.quality * 0.3)))
    const where = c.age < 18 ? ' in juvenile detention' : ''
    const who = lawyer.id === 'pd' ? `Your ${defenderTitle(g).toLowerCase()}` : lawyer.name
    const advice = t.evidence >= 0.7 ? `${who} whispers that you should take it.` : `${who} thinks you can win at trial.`
    // Money held by the investigation: a plea is a conviction, so the court keeps it.
    const held = t.refund > 0 ? ` Pleading guilty means the court keeps the ${formatMoney(t.refund)} taken in your case.` : ''
    scriptChoice(g, PLEA_SCRIPT, 'Plea Deal', `The prosecutor offered you a plea deal: plead guilty to ${t.crime.toLowerCase()} and serve ${years(t.plea)}${where}. ${advice}${held}`, [
      { id: 'accept', label: 'Take the plea deal', emoji: '\u{1F91D}' },
      { id: 'trial', label: 'Go to trial', emoji: '\u{1F3DB}\u{FE0F}' },
    ], { emoji: '\u{1F4DC}', data: trialJson(t) })
    return
  }
  verdict(g, t)
})

defineScript(PLEA_SCRIPT, (g, choice, data) => {
  const t = asTrial(data)
  const c = g.character
  if (!t || !c.alive || c.prison) return
  if (choice === 'accept' && t.plea > 0) {
    convict(g, t, { years: t.plea, life: false, deathRow: false, juvenile: c.age < 18, triedAsAdult: false }, true)
    return
  }
  verdict(g, t)
})

function notGuiltyChance(g: GameState, t: TrialData): number {
  const c = g.character
  const base = [0.5, 0.38, 0.28, 0.2, 0.12][t.severity - 1] ?? 0.3
  const quality = t.lawyer?.quality ?? 0.1
  const priors = c.criminalRecord.filter((r) => r.convicted).length
  const p =
    base +
    quality * 0.7 -
    t.evidence * 0.35 +
    (c.hidden.karma - 50) / 250 +
    (c.stats.smarts - 50) / 400 -
    Math.min(priors, 5) * 0.04 +
    (t.falseAccusation ? 0.25 : 0) +
    (c.age < 18 ? 0.05 : 0)
  return clamp(p, 0.03, 0.92)
}

interface Sentence {
  years: number
  life: boolean
  deathRow: boolean
  juvenile: boolean
  triedAsAdult: boolean
}

/** Typical sentence length (no randomness), used to size plea deals. */
function expectedSentence(g: GameState, t: TrialData): number {
  const mid = t.violent === 'attempted' ? 35 : [1.5, 4, 10, 27, 60][t.severity - 1] ?? 4
  const priors = g.character.criminalRecord.filter((r) => r.convicted).length
  let y = mid * Math.min(4, 2 ** priors) + t.extraYears
  if (g.character.age < 18) y = clamp(Math.ceil(y * 0.25), 1, 6)
  return Math.max(1, Math.round(y))
}

function computeSentence(g: GameState, t: TrialData): Sentence {
  const c = g.character
  const priors = c.criminalRecord.filter((r) => r.convicted).length
  let y: number
  if (t.violent === 'attempted') y = randInt(g, 20, 50)
  else y = [randInt(g, 1, 2), randInt(g, 2, 6), randInt(g, 5, 15), randInt(g, 15, 40), randInt(g, 40, 80)][t.severity - 1] ?? 3
  // Repeat offenders: the sentence doubles with each prior conviction (capped).
  y = y * Math.min(4, 2 ** priors)
  if (t.severity <= 2) y = Math.min(y, 20)
  y += t.extraYears + t.charges.length
  y = Math.round(y * (1 - (t.lawyer?.quality ?? 0.1) * 0.3))
  let life = false
  let deathRow = false
  let juvenile = false
  let triedAsAdult = false
  if (c.age < 18) {
    if (t.severity >= 5 && c.age >= 14 && chance(g, 0.6)) triedAsAdult = true
    else {
      juvenile = true
      y = clamp(Math.ceil(y * 0.25), 1, 6)
    }
  }
  if (t.violent === 'murder' && !juvenile) {
    const murders = Math.max(1, counter(g, 'murders'))
    const country = getCountry(c.countryId)
    if (country.deathPenalty && !triedAsAdult && chance(g, clamp(0.15 + 0.1 * (murders - 1), 0, 0.5))) deathRow = true
    else if (chance(g, clamp(0.3 + 0.15 * (murders - 1), 0, 0.8))) life = true
  }
  return { years: clamp(Math.max(1, y), 1, 99), life, deathRow, juvenile, triedAsAdult }
}

function verdict(g: GameState, t: TrialData): void {
  if (chance(g, notGuiltyChance(g, t))) acquit(g, t)
  else convict(g, t, computeSentence(g, t), false)
}

/**
 * An acquittal that earned a suit files it where the Lawsuit activity looks: a false accusation, or an agency
 * that charged the player and held their money. Returns the sentence that points there, or '' when nothing was
 * filed. A minor can't sue (Lawsuit is 18+), so nothing is filed and nothing is promised.
 */
function acquittalGrievance(g: GameState, t: TrialData, back: number): string {
  if (g.character.age < 18 || (!t.falseAccusation && !t.defendant)) return ''
  const name = t.defendant ?? 'the police department'
  const detail = back > 0 ? 'charged you and took your money before the court cleared you' : t.falseAccusation ? "charged you with a crime you didn't commit" : 'charged you before the court cleared you'
  addGrievance(g, { kind: 'police', name, strength: t.falseAccusation ? 45 : 35, detail })
  return `${t.falseAccusation ? ' You were falsely accused.' : ''} You can sue ${name} under Activities, Lawsuit.`
}

function acquit(g: GameState, t: TrialData): void {
  const c = g.character
  for (const i of t.records) {
    const r = c.criminalRecord[i]
    if (r) r.convicted = false
  }
  // Cleared: whatever the investigation took comes back, once.
  const back = cleanRefund(t.refund)
  if (back > 0) addMoney(g, back, 'legal')
  if (t.violent === 'attempted' && t.victimId) {
    const v = getPerson(g, t.victimId)
    if (v && v.alive) {
      v.relationship = 0
      notePerson(v, 'Knows I tried to kill them, even though I was acquitted.')
    }
  }
  addStat(g, 'happiness', randInt(g, 8, 15))
  log(g, `I was found not guilty of ${chargeList(t)}.`, 'good')
  const who = t.lawyer && t.lawyer.id !== 'pd' ? `${t.lawyer.name} delivered a closing argument for the ages. ` : ''
  const fu = fugitiveInfo(g)
  if (fu) {
    const add = randInt(g, 2, 4)
    c.criminalRecord.push({ crime: escapeCharge(g), age: c.age, caught: true, convicted: true, sentenceYears: add })
    count(g, 'convictions')
    const at = g.queue.length
    sendToPrison(g, fu.crime, fu.yearsLeft >= 99 ? 0 : fu.yearsLeft + add, { security: 'maximum', life: fu.yearsLeft >= 99 && !fu.deathRow, deathRow: fu.deathRow, quiet: true, severity: 4 })
    const where = c.prison?.name ?? 'prison'
    insertNoticeAt(g, at, 'Not Guilty... But', `${who}${deciders(trialBy(c.countryId, t.severity))} found you NOT GUILTY! Unfortunately, the bailiff recognized you as an escaped convict from ${fu.prison}. You were sent straight to ${where}.${gotBack(back)}`, '\u{2696}\u{FE0F}', 'bad')
    return
  }
  const sue = acquittalGrievance(g, t, back)
  outcome(g, 'Not Guilty!', `${who}${deciders(trialBy(c.countryId, t.severity))} found you NOT GUILTY of ${chargeList(t)}! You walked out of the courthouse a free ${c.age < 18 ? 'kid' : 'person'}.${gotBack(back)}${sue}`, '\u{1F389}', 'good')
}

function convict(g: GameState, t: TrialData, s: Sentence, plea: boolean): void {
  const c = g.character
  count(g, 'convictions')
  let total = s.years
  const notes: string[] = []
  const fu = fugitiveInfo(g)
  let life = s.life
  const deathRow = s.deathRow || (fu?.deathRow ?? false)
  if (fu) {
    const add = randInt(g, 2, 4)
    if (fu.yearsLeft >= 99) life = true
    else total += fu.yearsLeft + add
    c.criminalRecord.push({ crime: escapeCharge(g), age: c.age, caught: true, convicted: true, sentenceYears: add })
    notes.push(`Your escape from ${fu.prison} caught up with you too.`)
  }
  const fam = crimeFamily(g)
  if (fam && !s.juvenile && chance(g, 0.4)) {
    const add = randInt(g, 2, 5)
    total += add
    t.charges.push('Racketeering')
    notes.push('Prosecutors tacked on racketeering for your ties to organized crime.')
  }
  total = clamp(total, 1, 99)
  for (const i of t.records) {
    const r = c.criminalRecord[i]
    if (r) {
      r.convicted = true
      r.sentenceYears = life || deathRow ? 99 : total
    }
  }
  // The conviction forfeits what the investigation took. The record remembers it: an appeal that overturns this
  // conviction hands it back (prison.ts markOverturned finds the record the same way).
  const held = cleanRefund(t.refund)
  let appealable = false
  if (held > 0) {
    const rec = convictionRecord(g, t.crime) ?? c.criminalRecord[t.records[0]]
    if (rec) {
      rec.refund = held
      appealable = true
    }
  }
  // Family turns on a convicted killer.
  if (t.violent) {
    for (const p of g.people) {
      if (!p.alive || !isFamily(p)) continue
      p.relationship = t.violent === 'murder' ? 0 : Math.round(p.relationship / 2)
    }
    if (t.victimId) {
      const v = getPerson(g, t.victimId)
      if (v && v.alive) v.relationship = 0
    }
    addHidden(g, 'notoriety', 10)
  }
  addStat(g, 'happiness', -randInt(g, 10, 20))
  const at = g.queue.length
  sendToPrison(g, t.crime, life || deathRow ? 0 : total, {
    life,
    deathRow,
    juvenile: s.juvenile,
    severity: t.severity,
    quiet: true,
  })
  const where = c.prison?.name ?? 'prison'
  const term = deathRow
    ? 'death. You will await execution on death row'
    : life
      ? 'life in prison'
      : `${years(total)} in ${s.juvenile ? 'juvenile detention' : 'prison'}`
  const head = plea
    ? `You pleaded guilty to ${t.crime.toLowerCase()}. The judge accepted the deal and sentenced you to ${term} at ${where}.`
    : pick(g, guiltyLines(trialBy(c.countryId, t.severity), chargeList(t), term, where))
  const adult = s.triedAsAdult ? ' You were tried as an adult.' : ''
  log(g, plea ? `I took a plea deal: ${term.split('.')[0]}.` : `I was found guilty of ${chargeList(t)}.`, 'bad')
  insertNoticeAt(g, at, plea ? 'Plea Accepted' : 'Guilty', `${head}${adult}${notes.length ? ` ${notes.join(' ')}` : ''}${courtKept(held, appealable, deathRow)}`, deathRow ? '\u{26B0}\u{FE0F}' : '\u{2696}\u{FE0F}', 'bad')
}

/**
 * The sentence a conviction adds about money the investigation held, or nothing. `appealable` is true when the
 * amount was written on the conviction record, where a won appeal finds it (prison.ts markOverturned). On death
 * row only an appeal that frees the player returns it: a commuted sentence does not.
 */
function courtKept(held: number, appealable: boolean, deathRow = false): string {
  if (!(held > 0)) return ''
  const back = !appealable ? '' : deathRow ? ' Going free on appeal returns it.' : ' Winning an appeal returns it.'
  return ` The court kept the ${formatMoney(held)} taken in your case.${back}`
}

// ---------------------------------------------------------------------------
// Fencing stolen goods (shared by porch piracy and shoplifting)

const FENCE_SCRIPT = defineScript('crime.loot.fence', (g, choice, data) => {
  if (!canAct(g) || !isRecord(data)) return
  const item = str(data.item, 'the loot')
  const value = num(data.value)
  if (choice === 'pawn' && value > 0) {
    const got = pocket(g, value)
    log(g, `I pawned ${item} for ${formatMoney(got)}.`, 'good')
    outcome(g, 'Pawn Shop', pickSite(g, [
      `The pawn shop owner didn't ask a single question. You walked out ${formatMoney(got)} richer.`,
      `You sold ${item} to a guy behind a pawn shop counter for ${formatMoney(got)}. He winked. You did not wink back.`,
    ], 0x5e427f7c), '\u{1F4B0}', 'good')
    return
  }
  addStat(g, 'happiness', randInt(g, 2, 6))
  log(g, `I kept ${item} for myself.`, 'neutral')
})

function offerFence(g: GameState, item: string, emoji: string, value: number, how: string): void {
  if (value <= 0) return
  scriptChoice(g, FENCE_SCRIPT, 'Loot', `${how} What do you want to do with ${item}?`, [
    { id: 'pawn', label: `Pawn it (${formatMoney(value)})`, emoji: '\u{1F4B0}' },
    { id: 'keep', label: 'Keep it', emoji: emoji },
  ], { emoji, data: { item, value } })
}

// ---------------------------------------------------------------------------
// Pickpocket (age 8+): pick a mark, then the timing minigame

interface PickpocketTarget {
  id: string
  label: string
  emoji: string
  min: number
  max: number
  difficulty: number
}

const PICKPOCKET_TARGETS: PickpocketTarget[] = [
  { id: 'businessman', label: 'A businessperson in a hurry', emoji: '\u{1F4BC}', min: 40, max: 900, difficulty: 0.6 },
  { id: 'granny', label: 'An old lady with a giant purse', emoji: '\u{1F475}', min: 5, max: 300, difficulty: 0.25 },
  { id: 'tourist', label: 'A tourist taking selfies', emoji: '\u{1F933}', min: 20, max: 600, difficulty: 0.35 },
  { id: 'commuter', label: 'A sleeping commuter on the subway', emoji: '\u{1F634}', min: 10, max: 250, difficulty: 0.15 },
  { id: 'busker', label: 'A street performer', emoji: '\u{1F3B8}', min: 3, max: 120, difficulty: 0.3 },
  { id: 'teen', label: 'A teenager glued to their phone', emoji: '\u{1F4F1}', min: 1, max: 80, difficulty: 0.2 },
  { id: 'cop', label: 'An off-duty police officer', emoji: '\u{1F46E}', min: 20, max: 400, difficulty: 0.9 },
  { id: 'jogger', label: 'A jogger stretching in the park', emoji: '\u{1F3C3}', min: 0, max: 60, difficulty: 0.4 },
  { id: 'banker', label: 'A banker leaving a fancy restaurant', emoji: '\u{1F377}', min: 100, max: 2500, difficulty: 0.75 },
  { id: 'wedding', label: 'A tipsy wedding guest', emoji: '\u{1F942}', min: 20, max: 700, difficulty: 0.25 },
]

export interface PickpocketData {
  target: string
  emoji: string
  /** Marker sweeps per second (one sweep = one side to the other). */
  speed: number
  /** Green zone on a 0-1 bar. */
  zoneStart: number
  zoneWidth: number
  targetId: string
}

/** The mark as people looked that year: selfies and phones are recent; before that, cameras, radios and newspapers. */
function markLabel(g: GameState, t: PickpocketTarget): string {
  if (t.id === 'tourist') return common(g, 'smartphone') ? t.label : g.year >= 1925 ? 'A tourist fiddling with a camera' : 'A tourist squinting at a map'
  if (t.id === 'teen') {
    if (common(g, 'smartphone')) return t.label
    if (g.year >= 1980) return 'A teenager with headphones on'
    if (g.year >= 1955) return 'A teenager glued to a transistor radio'
    return 'A newsboy shouting the headlines'
  }
  if (t.id === 'jogger' && g.year < 1965) return 'A gentleman feeding pigeons in the park'
  if (t.id === 'commuter' && g.year < 1905) return 'A sleeping commuter on the streetcar'
  return t.label
}

const PICKPOCKET_RESULT = defineScript('crime.pickpocket.result', (g, result, data) => {
  if (!canAct(g) || !isRecord(data)) return
  const t = PICKPOCKET_TARGETS.find((x) => x.id === str(data.targetId)) ?? PICKPOCKET_TARGETS[0]
  const label = markLabel(g, t)
  const who = label.charAt(0).toLowerCase() + label.slice(1)
  if (result !== 'success' && result !== 'fail') {
    log(g, 'I thought about picking a pocket, but lost my nerve.', 'neutral')
    notice(g, 'Cold Feet', `You lost your nerve and walked right past ${who}.`, { emoji: '\u{1F976}' })
    return
  }
  const idx = commitCrime(g, 'Pickpocketing', { karma: 3, notoriety: 1, heat: result === 'success' ? 0.05 : 0.2 })
  if (result === 'success') {
    count(g, 'pickpockets')
    let amount = cash(g, randInt(g, t.min, t.max))
    const phone = chance(g, 0.12) && common(g, 'mobilePhone')
    if (phone) amount += cash(g, randInt(g, 40, 250))
    if (amount <= 0) {
      log(g, `I pickpocketed ${who}, but the wallet was empty.`, 'neutral')
      outcome(g, 'Empty Wallet', `You lifted the wallet from ${who} without a hitch. Inside: a library card, a coupon for half-off nachos, and zero dollars.`, '\u{1F45B}')
      return
    }
    const got = pocket(g, amount)
    log(g, `I pickpocketed ${who} and got ${formatMoney(got)}.`, 'good')
    outcome(g, 'Sticky Fingers', pickSite(g, [
      `You slipped your hand into ${who}'s pocket and came out with ${formatMoney(amount)}${phone ? ' and a phone you sold on the spot' : ''}.`,
      `Smooth as butter. You lifted ${formatMoney(amount)} from ${who}${phone ? ', plus a phone you flipped for cash' : ''}.`,
      `${label} never felt a thing. You walked away ${formatMoney(amount)} richer${phone ? ' (the phone helped)' : ''}.`,
    ], 0xf983dd15), t.emoji, 'good')
    if (t.id !== 'cop' && chance(g, 0.05 * caughtMult(g))) arrestPlayer(g, 'Pickpocketing', 1, { recordIndex: idx, evidence: 0.6, context: 'An undercover cop saw the whole thing.' })
    return
  }
  // Fail: the mark noticed.
  if (t.id === 'cop' || chance(g, 0.4 * caughtMult(g))) {
    arrestPlayer(g, 'Pickpocketing', 1, {
      recordIndex: idx,
      evidence: 0.75,
      context: t.id === 'cop' ? 'The "mark" flashed a badge. You just tried to pickpocket a police officer.' : `${label} grabbed your wrist and screamed for the police.`,
    })
    return
  }
  if (chance(g, 0.45)) {
    const dmg = hurt(g, randInt(g, 4, 14))
    log(g, `I got beaten up trying to pickpocket ${who}.`, 'bad')
    outcome(g, 'Caught', `${label} caught your hand in their pocket and clobbered you. (-${dmg} health)`, '\u{1F915}', 'bad')
    return
  }
  log(g, `I tried to pickpocket ${who} and had to run for it.`, 'bad')
  outcome(g, 'Caught', `${label} felt your hand and yelled "THIEF!" You sprinted away empty-handed.`, '\u{1F3C3}', 'bad')
})

const PICKPOCKET_PICK = defineScript('crime.pickpocket.pick', (g, choice, data) => {
  const c = g.character
  if (!canAct(g) || !isRecord(data) || choice === 'cancel') return
  const t = PICKPOCKET_TARGETS.find((x) => x.id === choice)
  if (!t) return
  const skill = (c.stats.smarts - 50) / 1000 + (c.hidden.athleticism - 50) / 1000
  const zoneWidth = clamp(0.3 - t.difficulty * 0.2 + skill, 0.08, 0.34)
  const zoneStart = 0.05 + rand(g) * (0.9 - zoneWidth)
  const payload: PickpocketData = {
    target: markLabel(g, t),
    emoji: t.emoji,
    speed: Math.round((0.7 + t.difficulty * 1.1) * 100) / 100,
    zoneStart: Math.round(zoneStart * 1000) / 1000,
    zoneWidth: Math.round(zoneWidth * 1000) / 1000,
    targetId: t.id,
  }
  minigame(g, 'pickpocket', 'Pickpocket', PICKPOCKET_RESULT, payload as unknown as Json)
})

const pickpocketAction: MenuAction = {
  type: 'action',
  id: 'crime.pickpocket',
  label: 'Pickpocket',
  emoji: '\u{1F45B}',
  subtitle: 'Lift a wallet from a stranger',
  disabledReason: ageGate(8),
  run: (g) => {
    if (!canAct(g) || !lieLow(g, 'crime.pickpocket', 5)) return
    const targets = shuffle(g, PICKPOCKET_TARGETS).slice(0, 4)
    scriptChoice(g, PICKPOCKET_PICK, 'Pickpocket', 'You blend into the crowd and scan for a mark. Who will you rob?', [
      ...targets.map((t) => ({ id: t.id, label: markLabel(g, t), emoji: t.emoji })),
      { id: 'cancel', label: 'Never mind', emoji: '\u{1F645}' },
    ], { emoji: '\u{1F45B}', data: { targets: targets.map((t) => t.id) } })
  },
}

// ---------------------------------------------------------------------------
// Porch Pirate (age 8+)

const PORCH_SPOTS = [
  { text: 'a porch with a "Beware of Dog" sign', risk: 0.22 },
  { text: '@2015 a mansion with a doorbell camera', risk: 0.35 },
  { text: '@-2015 a mansion with a butler who never sleeps', risk: 0.35 },
  { text: 'a porch covered in garden gnomes', risk: 0.15 },
  { text: 'an apartment stoop', risk: 0.12 },
  { text: '@-1970 a doorstep with the morning milk delivery', risk: 0.12 },
  { text: 'a house with every light on', risk: 0.25 },
  { text: 'a porch with a rocking chair and a sleeping cat', risk: 0.1 },
  { text: 'a farmhouse at the end of a dirt road', risk: 0.08 },
  { text: "the neighborhood watch captain's porch", risk: 0.45 },
]
const PACKAGE_SIZES = ['small box', 'huge box', 'padded envelope', 'long tube', 'heavy box', 'gift-wrapped package']
/** Parcels by era (tags as in events/era.ts): mail-order goods first, online shopping later. */
const PACKAGE_CONTENTS: { item: string; emoji: string; value: number }[] = [
  { item: '@1950 a box of cat litter', emoji: '\u{1F408}', value: 8 },
  { item: '@1920 a pair of sneakers', emoji: '\u{1F45F}', value: 70 },
  { item: '@smartphone a brand-new smartphone', emoji: '\u{1F4F1}', value: 400 },
  { item: '@1950 a 40-pound bag of dog food', emoji: '\u{1F415}', value: 20 },
  { item: '@videoGameConsole a gaming console', emoji: '\u{1F3AE}', value: 250 },
  { item: '@1920 a toaster', emoji: '\u{1F35E}', value: 15 },
  { item: '@-1960 a mail-order dress from the catalog', emoji: '\u{1F457}', value: 30 },
  { item: '@-1970 a crate of milk bottles', emoji: '\u{1F95B}', value: 4 },
  { item: '@-1980 a set of encyclopedias', emoji: '\u{1F4DA}', value: 60 },
  { item: 'a designer handbag', emoji: '\u{1F45C}', value: 500 },
  { item: 'a box of rocks', emoji: '\u{1FAA8}', value: 0 },
  { item: 'a single sock', emoji: '\u{1F9E6}', value: 0 },
  { item: 'a pair of diamond earrings', emoji: '\u{1F48E}', value: 1200 },
  { item: '@2014 a camera drone', emoji: '\u{1F681}', value: 350 },
  { item: '@1950 a 12-pack of vitamins', emoji: '\u{1F48A}', value: 15 },
  { item: '@1990 a fancy espresso machine', emoji: '\u{2615}', value: 300 },
  { item: 'a stack of romance novels', emoji: '\u{1F4DA}', value: 12 },
  { item: '@2015 a smartwatch', emoji: '\u{231A}', value: 180 },
  { item: '@1980 a life-size cardboard cutout of a celebrity', emoji: '\u{1F5BC}\u{FE0F}', value: 5 },
]

const PORCH_SCRIPT = defineScript('crime.porch.pick', (g, choice, data) => {
  const c = g.character
  if (!canAct(g) || !isRecord(data) || choice === 'cancel') return
  const options = Array.isArray(data.options) ? data.options : []
  const opt = options.find((o) => isRecord(o) && o.id === choice)
  if (!isRecord(opt)) return
  const spot = str(opt.spot, 'a porch')
  const risk = clamp((num(opt.risk, 0.2) - (c.stats.smarts - 50) / 500) * caughtMult(g), 0.03, 0.7)
  const idx = commitCrime(g, 'Larceny', { karma: 3, notoriety: 1, heat: 0.08 })
  if (chance(g, risk)) {
    if (chance(g, 0.5)) {
      log(g, 'I got chased off a porch while stealing a package.', 'bad')
      outcome(g, 'Caught!', pickLine(g, [
        `The homeowner burst out the door with a broom and chased you three blocks.`,
        `A very large dog came around the corner. You dropped the package and ran.`,
      ]), '\u{1F9F9}', 'bad')
      return
    }
    const seen =
      g.year >= 2015 && common(g, 'smartphone')
        ? `Doorbell camera footage of you stealing a package from ${spot} went viral. The police found you in an hour.`
        : `A nosy neighbor watched you take a package from ${spot} and ${landline(g) ? 'called the police' : 'fetched a policeman'}.`
    arrestPlayer(g, 'Larceny', 1, { recordIndex: idx, evidence: 0.8, context: seen })
    return
  }
  count(g, 'porchPirate')
  const fits = PACKAGE_CONTENTS.filter((x) => eraOk(g, x.item)).map((x) => ({ ...x, item: eraStrip(x.item) }))
  const content = pick(g, fits.length ? fits : PACKAGE_CONTENTS.filter((x) => !x.item.startsWith('@')))
  const value = cash(g, content.value * (0.7 + rand(g) * 0.6))
  log(g, `I stole a package from ${spot}. It was ${content.item}.`, 'neutral')
  if (value <= 0) {
    outcome(g, 'Porch Pirate', `You snatched the ${str(opt.size, 'package')} from ${spot} and tore it open around the corner. It was ${content.item}. Crime doesn't always pay.`, content.emoji)
    return
  }
  offerFence(g, content.item, content.emoji, value, `You snatched the ${str(opt.size, 'package')} from ${spot} and tore it open around the corner: ${content.item}!`)
})

const porchAction: MenuAction = {
  type: 'action',
  id: 'crime.porch',
  label: 'Porch Pirate',
  emoji: '\u{1F4E6}',
  subtitle: "Snatch a package off a neighbor's porch",
  disabledReason: ageGate(8),
  run: (g) => {
    if (!canAct(g) || !lieLow(g, 'crime.porch', 5)) return
    const spots = shuffle(g, PORCH_SPOTS.filter((x) => eraOk(g, x.text)).map((x) => ({ ...x, text: eraStrip(x.text) }))).slice(0, 3)
    const options = spots.map((s, i) => ({ id: `p${i}`, spot: s.text, risk: s.risk, size: pickLine(g, PACKAGE_SIZES) }))
    scriptChoice(g, PORCH_SCRIPT, 'Porch Pirate', 'You stroll through the neighborhood. A few packages are sitting unattended. Which one do you take?', [
      ...options.map((o) => ({ id: o.id, label: `A ${o.size} on ${o.spot}`, emoji: '\u{1F4E6}' })),
      { id: 'cancel', label: 'Never mind', emoji: '\u{1F645}' },
    ], { emoji: '\u{1F3F4}\u{200D}\u{2620}\u{FE0F}', data: { options } })
  },
}

// ---------------------------------------------------------------------------
// Shoplift (age 8+): choose a store, then an item; beware of the mall cop

interface Store {
  id: string
  name: string
  emoji: string
  security: number
  /** Items may carry era tags ('@2001 a pair of earbuds'); see events/era.ts. */
  items: [string, number][]
  /** First year this kind of shop exists. */
  since?: number
  /** Era gates (events/era.ts gateHolds, ',' = and): the radio shop needs radios to sell. */
  gate?: string
  /** The older name ('Radio Shop' before electronics stores). */
  oldName?: [number, string]
}

const STORES: Store[] = [
  { id: 'grocery', name: 'Grocery Store', emoji: '\u{1F6D2}', security: 0.1, items: [['a candy bar', 2], ['@1960 a rotisserie chicken', 8], ['a bottle of fancy olive oil', 25], ['a wheel of brie', 18], ['@1950 a family-size bag of chips', 6], ['a jar of caviar', 90], ['@-1960 a tin of sardines', 3]] },
  { id: 'department', name: 'Department Store', emoji: '\u{1F3EC}', security: 0.2, items: [['@1955 a pair of jeans', 60], ['a leather jacket', 250], ['a bottle of perfume', 90], ['@1960 designer sunglasses', 180], ['a silk tie', 45], ['a scented candle', 25], ['@-1960 a pair of kid gloves', 30], ['a felt hat', 40]] },
  {
    id: 'electronics',
    name: 'Electronics Store',
    emoji: '\u{1F4FA}',
    security: 0.3,
    since: 1922,
    gate: '+radio',
    oldName: [1970, 'Radio Shop'],
    items: [
      ['@2001 a pair of earbuds', 150],
      ['@videoGameConsole a video game', 60],
      ['@2015 a smartwatch', 350],
      ['@1995,homeComputer a laptop', 1100],
      ['@mobilePhone a phone charger', 25],
      ['@2014 a drone', 600],
      ['@1955,-1985 a transistor radio', 40],
      ['@-1960 a tabletop radio set', 90],
      ['@1979,-2005 a portable cassette player', 60],
      ['@tv,-1990 a portable television', 200],
      ['a box of light bulbs', 8],
      ['an electric fan', 30],
    ],
  },
  { id: 'jewelry', name: 'Jewelry Store', emoji: '\u{1F48D}', security: 0.45, items: [['a pair of silver earrings', 200], ['a gold bracelet', 1200], ['a diamond ring', 4500], ['a luxury watch', 8000], ['a pearl necklace', 1800]] },
  { id: 'sporting', name: 'Sporting Goods Store', emoji: '\u{26BD}', security: 0.18, items: [['a baseball glove', 60], ['@1970 a pair of running shoes', 130], ['@-1970 a pair of canvas tennis shoes', 30], ['a fishing rod', 90], ['@1990 a yoga mat', 35], ['@1965 a skateboard', 110], ['a leather football', 25]] },
  { id: 'toy', name: 'Toy Store', emoji: '\u{1F9F8}', security: 0.12, items: [['a teddy bear', 25], ['a building block set', 80], ['@1970 a remote-control car', 70], ['@1964 a collectible action figure', 40], ['@1930 a yo-yo', 8], ['@-1960 a box of tin soldiers', 15], ['a spinning top', 4]] },
  { id: 'books', name: 'Bookstore', emoji: '\u{1F4DA}', security: 0.08, items: [['a bestselling novel', 28], ['a cookbook', 35], ['@1935 a comic book', 5], ['a leather-bound journal', 40]] },
  { id: 'pharmacy', name: 'Pharmacy', emoji: '\u{1F48A}', security: 0.15, items: [['a tube of lipstick', 12], ['@1940 a bottle of vitamins', 20], ['@1960 an electric toothbrush', 90], ['a box of bandages', 6], ['@1990 a hair straightener', 70], ['@-1950 a bottle of cough tonic', 4]] },
]

/** The shop's name this year ('Radio Shop' before electronics stores). */
function storeName(g: GameState, store: Store): string {
  return store.oldName && g.year < store.oldName[0] ? store.oldName[1] : store.name
}

/** Store security: a mall cop in North American malls, a store detective before malls, a security guard elsewhere. */
function mallCop(g: GameState): string {
  if (!venueExists(g, 'mall')) return 'store detective'
  return g.character.countryId === 'us' || g.character.countryId === 'ca' ? 'mall cop' : 'security guard'
}

const SHOPLIFT_COP = defineScript('crime.shoplift.cop', (g, choice, data) => {
  const c = g.character
  if (!canAct(g) || !isRecord(data)) return
  const item = str(data.item, 'the item')
  const idx = num(data.recordIndex, -1)
  const recordIndex = idx >= 0 ? idx : undefined
  if (choice === 'cooperate') {
    if (chance(g, c.age < 18 ? 0.6 : 0.45)) {
      log(g, `A ${mallCop(g)} caught me shoplifting ${item} and banned me from the store.`, 'bad')
      outcome(g, 'Banned', `The ${mallCop(g)} took ${item} back, snapped your photo for the Wall of Shame, and banned you from the store for life. No police, though.`, '\u{1F4F8}', 'bad')
      return
    }
    arrestPlayer(g, 'Shoplifting', 1, { recordIndex, evidence: 0.9, noResist: true })
    return
  }
  if (choice === 'assault') {
    count(g, 'fights')
    if (chance(g, clamp(0.25 + (c.hidden.athleticism - 50) / 200, 0.1, 0.6))) {
      addHidden(g, 'karma', -5)
      log(g, `I knocked over a ${mallCop(g)} and escaped with ${item}.`, 'event')
      outcome(g, 'Takedown', `You shoulder-checked the ${mallCop(g)} into a display of throw pillows and ran out with ${item}.`, '\u{1F4A5}', 'good')
      return
    }
    const dmg = hurt(g, randInt(g, 5, 15))
    log(g, `A ${mallCop(g)} body-slammed me after I attacked him.`, 'bad')
    notice(g, 'Bad Idea', `The ${mallCop(g)} had been waiting his whole career for this. He body-slammed you onto the ${g.character.countryId === 'us' && venueExists(g, 'food court') ? 'food court tile' : 'shop floor'}. (-${dmg} health)`, { emoji: '\u{1F93C}', tone: 'bad' })
    arrestPlayer(g, 'Assault', 2, { evidence: 0.9, noResist: true, extraCharges: ['Shoplifting'], recordIndex })
    return
  }
  if (chance(g, clamp(0.4 + (c.hidden.athleticism - 50) / 300 + crimeEdge(g), 0.2, 0.75))) {
    log(g, `I outran a ${mallCop(g)} with ${item}.`, 'event')
    c.wantedLevel = clamp(c.wantedLevel + 1, 0, 5)
    const us = g.character.countryId === 'us'
    outcome(g, 'Escaped', pickSite(g, [`You bolted past the ${mallCop(g)}${us && g.year >= 2003 ? "'s Segway" : ''} and disappeared into the ${us && cars(g) ? 'parking lot' : 'crowd'} with ${item}.`, `The ${mallCop(g)} wheezed to a stop ${g.year >= 1950 ? 'at the escalator' : 'at the door'}. You got away with ${item}.`], 0xbd0cefd9), '\u{1F3C3}', 'good')
    return
  }
  arrestPlayer(g, 'Shoplifting', 1, { recordIndex, evidence: 0.9, noResist: true, extraCharges: ['Resisting Arrest'] })
})

const SHOPLIFT_ITEM = defineScript('crime.shoplift.item', (g, choice, data) => {
  const c = g.character
  if (!canAct(g) || !isRecord(data) || choice === 'cancel') return
  const store = STORES.find((s) => s.id === str(data.store)) ?? STORES[0]
  const items = Array.isArray(data.items) ? data.items : []
  const it = items.find((x) => isRecord(x) && x.id === choice)
  if (!isRecord(it)) return
  const item = str(it.item, 'something')
  const value = num(it.value)
  const risk = clamp((store.security + Math.log10(Math.max(1, value)) / 15 - (c.stats.smarts - 50) / 400) * caughtMult(g), 0.04, 0.8)
  const idx = commitCrime(g, 'Shoplifting', { karma: 2, notoriety: 1, heat: 0.05 })
  if (chance(g, risk)) {
    scriptChoice(g, SHOPLIFT_COP, mallCop(g) === 'mall cop' ? 'Mall Cop!' : 'Security!', `You stuffed ${item} under your shirt and headed for the exit. A ${mallCop(g)} stepped in front of the door. "Not so fast."`, [
      { id: 'cooperate', label: 'Cooperate', emoji: '\u{1F64C}' },
      { id: 'assault', label: `Assault the ${mallCop(g)}`, emoji: '\u{1F44A}' },
      { id: 'run', label: 'Run for it', emoji: '\u{1F3C3}' },
    ], { emoji: '\u{1F46E}', data: { item, recordIndex: idx } })
    return
  }
  count(g, 'shoplifts')
  const shop = storeName(g, store).toLowerCase()
  log(g, `I shoplifted ${item} from a ${shop}.`, 'neutral')
  const pawn = Math.max(1, Math.round(value * 0.4))
  offerFence(g, item, store.emoji, pawn, `You walked out of the ${shop} with ${item} and nobody batted an eye.`)
})

function shopliftStore(g0: GameState, store: Store): MenuAction {
  return {
    type: 'action',
    id: `crime.shoplift.${store.id}`,
    label: storeName(g0, store),
    emoji: store.emoji,
    subtitle: store.security >= 0.3 ? 'Tight security' : store.security >= 0.18 ? 'Some security' : 'Barely any security',
    disabledReason: ageGate(8),
    run: (g) => {
      if (!canAct(g) || !lieLow(g, 'crime.shoplift', 5)) return
      const fits = store.items.filter(([item]) => eraOk(g, item)).map(([item, base]): [string, number] => [eraStrip(item), base])
      const picks = shuffle(g, fits).slice(0, 3)
      const items = picks.map(([item, base], i) => ({ id: `i${i}`, item, value: cash(g, base * (0.8 + rand(g) * 0.4)) }))
      const name = storeName(g, store)
      scriptChoice(g, SHOPLIFT_ITEM, name, `You wander the aisles of the ${name.toLowerCase()}, trying to look casual. What will you swipe?`, [
        ...items.map((x) => ({ id: x.id, label: `${titleCase(x.item.replace(/^(a|an) /, ''))} (${formatMoney(x.value)})`, emoji: store.emoji })),
        { id: 'cancel', label: 'Leave', emoji: '\u{1F6B6}' },
      ], { emoji: store.emoji, data: { store: store.id, items } })
    },
  }
}

const shopliftMenu: MenuGroup = {
  type: 'menu',
  id: 'crime.shoplift',
  label: 'Shoplift',
  emoji: '\u{1F6CD}\u{FE0F}',
  subtitle: 'Five-finger discount',
  disabledReason: ageGate(8),
  header: (g) => `Pick a store. Pricier loot draws more attention, and beware of the ${mallCop(g)}.`,
  children: (g) => STORES.filter((s) => g.year >= (s.since ?? 0) && (s.gate ?? '').split(',').every((t) => gateHolds(g, t.trim()))).map((s) => shopliftStore(g, s)),
}

// ---------------------------------------------------------------------------
// Delinquency (age 8+): minor mischief, alone or with an accomplice

interface DelinquentAct {
  id: string
  label: string
  emoji: string
  crime: string
  risk: number
  minAge: number
  money?: [number, number]
  /** Era tag lines (see events/era.ts); the act is offered with at least one fitting line. */
  success: string[]
  /** Era gates for the act itself ('videoGameConsole', '1950', '-2013', 'cars'). */
  era?: string
}

const DELINQUENT_ACTS: DelinquentAct[] = [
  { id: 'graffiti', label: 'Spray-paint graffiti', emoji: '\u{1F3A8}', crime: 'Criminal Mischief', risk: 0.25, minAge: 8, era: '1950', success: ['You spray-painted a very large, very anatomically questionable duck on the side of the post office.', 'You tagged the overpass with your initials. Art critics are divided.'] },
  { id: 'chalk', label: 'Chalk rude words on a wall', emoji: '\u{1F3A8}', crime: 'Criminal Mischief', risk: 0.2, minAge: 8, era: '-1950', success: ['You chalked a very large, very anatomically questionable duck on the side of the post office.', "You chalked the mayor's name next to a drawing of a donkey. The whole town is talking."] },
  { id: 'stopsign', label: 'Steal a stop sign', emoji: '\u{1F6D1}', crime: 'Larceny', risk: 0.3, minAge: 10, era: '1920', success: ['You unbolted a stop sign and hung it in your bedroom. Very edgy.', 'You stole a stop sign. Traffic at that intersection is now a lawless free-for-all.'] },
  { id: 'twerk', label: 'Crash a party and twerk on the host', emoji: '\u{1F351}', crime: 'Aggravated Twerking', risk: 0.3, minAge: 12, era: '2013', success: ['You crashed a stranger\'s birthday party and twerked so aggressively the DJ stopped the music.', 'You twerked your way through a wedding reception and left before anyone could stop you.'] },
  { id: 'tables', label: 'Crash a party and dance on the tables', emoji: '\u{1F483}', crime: 'Disorderly Conduct', risk: 0.3, minAge: 12, era: '-2013', success: ["You crashed a stranger's birthday party and danced on the dining table until the band stopped playing.", 'You high-kicked your way through a wedding reception and left before anyone could stop you.'] },
  { id: 'bootleg', label: 'Sell bootleg movies', emoji: '\u{1F4C0}', crime: 'Piracy', risk: 0.25, minAge: 10, money: [20, 300], era: '1980', success: ['@smartphone You sold bootleg DVDs out of a backpack. Half of them were filmed with a phone in a theater.', '@1998,!smartphone You sold bootleg DVDs out of a backpack. Half of them were filmed with a camcorder in a theater.', '@-1998 You sold bootleg videotapes out of a duffel bag. The tracking was terrible.', 'You set up a folding table and sold bootleg movies to tourists.'] },
  { id: 'fireworks', label: 'Set off fireworks indoors', emoji: '\u{1F386}', crime: 'Reckless Endangerment', risk: 0.35, minAge: 10, success: ['You set off a bottle rocket in the school cafeteria. Nobody got hurt, miraculously.', '@1962 You lit fireworks in a mall fountain. Spectacular. Also a crime.', '@-1962 You lit firecrackers in the church bell tower. Spectacular. Also a crime.'] },
  { id: 'fountain', label: 'Steal coins from a fountain', emoji: '\u{26F2}', crime: 'Larceny', risk: 0.2, minAge: 8, money: [3, 60], success: ['You waded into the town fountain and scooped up everyone\'s wishes.', '@1962 You fished coins out of the mall fountain with a magnet on a string.'] },
  { id: 'eggs', label: 'Egg a house', emoji: '\u{1F95A}', crime: 'Criminal Mischief', risk: 0.25, minAge: 8, success: ['You egged a house that had it coming. Probably.', 'You hurled a dozen eggs at a house and ran off cackling.'] },
  { id: 'console', label: "Break into a neighbor's house to play their console", emoji: '\u{1F3AE}', crime: 'Breaking and Entering', risk: 0.35, minAge: 10, era: 'videoGameConsole', success: ['You snuck into your neighbor\'s house and beat their high score. Then you left.', 'You broke into a neighbor\'s place, played video games for two hours, and even put the controller back.'] },
  { id: 'orchard', label: "Raid a neighbor's orchard", emoji: '\u{1F34E}', crime: 'Larceny', risk: 0.2, minAge: 8, era: '-1970', success: ["You climbed the fence and filled your shirt with the neighbor's best apples.", 'You raided the orchard at dusk. The farmer shook a fist at you from the porch.'] },
  { id: 'library', label: 'Start a mosh pit in the library', emoji: '\u{1F918}', crime: 'Disorderly Conduct', risk: 0.4, minAge: 8, era: '1982', success: ['You started a mosh pit in the quiet section of the library. The librarian is still shushing.', 'You blasted heavy metal in the library and got three retirees to mosh.'] },
  { id: 'singalong', label: 'Start a sing-along in the library', emoji: '\u{1F3B6}', crime: 'Disorderly Conduct', risk: 0.4, minAge: 8, era: '-1982', success: ['You led a rousing sing-along in the quiet section of the library. The librarian is still shushing.', 'You got three retirees in the reading room to belt out a sea shanty.'] },
  { id: 'joyride', label: "Take a neighbor's car for a joyride", emoji: '\u{1F699}', crime: 'Joyriding', risk: 0.35, minAge: 12, era: 'cars', success: ['You "borrowed" a neighbor\'s car, did donuts in a parking lot, and returned it with an empty tank.', 'You took the neighbor\'s car out for a spin and parked it back exactly one foot to the left.'] },
  { id: 'horse', label: "Take a neighbor's horse for a gallop", emoji: '\u{1F40E}', crime: 'Larceny', risk: 0.3, minAge: 10, era: '-1940', success: ["You \"borrowed\" a neighbor's horse, galloped through the town square, and returned it lathered and smug.", "You took the neighbor's horse out for a ride and tied it back up one post to the left."] },
]

/** Is this bit of mischief possible this year? */
function actFits(g: GameState, act: DelinquentAct): boolean {
  return !act.era || act.era.split(',').every((t) => gateHolds(g, t.trim()))
}

const DELINQUENCY_SCRIPT = defineScript('crime.delinquency', (g, choice, data) => {
  const c = g.character
  if (!canAct(g) || !isRecord(data) || choice === 'cancel') return
  const act = DELINQUENT_ACTS.find((a) => a.id === str(data.act))
  if (!act) return
  let partner: Person | null = null
  let partnerName = ''
  if (choice === 'stranger') {
    partnerName = strangerName(g, chance(g, 0.5) ? 'male' : 'female')
    if (!chance(g, 0.5)) {
      log(g, `A random stranger refused to help me with my mischief.`, 'neutral')
      notice(g, 'Rejected', `You asked a random stranger named ${partnerName} to ${act.label.toLowerCase()} with you. They backed away slowly.`, { emoji: '\u{1F645}' })
      return
    }
  } else if (choice !== 'alone') {
    partner = getPerson(g, choice) ?? null
    if (!partner || !partner.alive) return
    partnerName = partner.firstName
    const yes = chance(g, clamp(partner.relationship / 120 + 0.1 + (partner.traits.includes('rebellious') ? 0.2 : 0) - (partner.traits.includes('honest') ? 0.2 : 0), 0.05, 0.9))
    if (!yes) {
      addRelationship(partner, -randInt(g, 2, 6))
      log(g, `My ${relationLabel(partner).toLowerCase()} ${partner.firstName} refused to join my mischief.`, 'neutral')
      notice(g, 'Not Interested', pickSite(g, [`${partner.firstName} looked at you like you'd lost your mind and said no.`, `${partner.firstName} refused and gave you a ten-minute lecture about responsibility.`], 0x613692a7), { emoji: '\u{1F645}' })
      return
    }
  }
  const withText = partnerName ? ` with ${partner ? `your ${relationLabel(partner).toLowerCase()} ` : ''}${partnerName}` : ''
  const risk = clamp((act.risk * (partnerName ? 0.85 : 1) - (c.stats.smarts - 50) / 500) * caughtMult(g), 0.04, 0.7)
  const idx = commitCrime(g, act.crime, { karma: 2, notoriety: 2, heat: 0.05 })
  if (chance(g, risk)) {
    if (partner) {
      addRelationship(partner, -randInt(g, 5, 12))
      notePerson(partner, `Got caught with me doing something stupid (${act.label.toLowerCase()}).`)
    }
    arrestPlayer(g, act.crime, 1, { recordIndex: idx, evidence: 0.75, context: `Security caught you${withText} trying to ${act.label.toLowerCase()}.` })
    return
  }
  addStat(g, 'happiness', randInt(g, 3, 8))
  if (partner) {
    addRelationship(partner, randInt(g, 4, 10))
    notePerson(partner, `We did something wild together: ${act.label.toLowerCase()}.`)
  }
  let money = 0
  if (act.money) money = pocket(g, cash(g, randInt(g, act.money[0], act.money[1])))
  log(g, `I decided to ${act.label.toLowerCase()}${partnerName ? ` with ${partnerName}` : ''}.`, 'event')
  outcome(g, 'Delinquent', `${eraPick(g, act.success)}${partnerName ? ` ${partnerName} had a blast too.` : ''}${money ? ` You made ${formatMoney(money)}.` : ''}`, act.emoji, 'event')
})

function delinquentAction(act: DelinquentAct): MenuAction {
  return {
    type: 'action',
    id: `crime.delinquent.${act.id}`,
    label: act.label,
    emoji: act.emoji,
    disabledReason: ageGate(act.minAge),
    run: (g) => {
      if (!canAct(g) || !lieLow(g, 'crime.delinquency', 5)) return
      const choices: ChoiceOption[] = [{ id: 'alone', label: 'Do it alone', emoji: '\u{1F464}' }]
      const pool = g.people.filter((p) => p.alive && p.age >= 8 && ['friend', 'bestFriend', 'sibling', 'halfSibling', 'stepsibling', 'partner', 'spouse', 'fiance'].includes(p.relation))
      const best = [...pool].sort((a, b) => b.relationship - a.relationship).slice(0, 3)
      for (const p of best) choices.push({ id: p.id, label: `With ${p.firstName} (${relationLabel(p)})`, emoji: '\u{1F91D}' })
      choices.push({ id: 'stranger', label: 'With a random stranger', emoji: '\u{1F3B2}' })
      choices.push({ id: 'cancel', label: 'Never mind', emoji: '\u{1F645}' })
      scriptChoice(g, DELINQUENCY_SCRIPT, 'Delinquency', `You're about to ${act.label.toLowerCase()}. Want an accomplice?`, choices, { emoji: act.emoji, data: { act: act.id } })
    },
  }
}

const delinquencyMenu: MenuGroup = {
  type: 'menu',
  id: 'crime.delinquency',
  label: 'Delinquency',
  emoji: '\u{1F608}',
  subtitle: 'Minor mischief and public nuisance',
  disabledReason: ageGate(8),
  header: () => 'Small-time trouble. Getting caught usually means a year or so in juvie or jail.',
  children: (g) => DELINQUENT_ACTS.filter((a) => actFits(g, a)).map(delinquentAction),
}

// ---------------------------------------------------------------------------
// Burglary (age 10+): choose a house; the engine builds the floor plan and decides the loot

export interface BurglaryLoot {
  name: string
  emoji: string
  value: number
}

export interface BurglaryRoom {
  id: string
  name: string
  emoji: string
  /** Grid placement (column, row, width, height). */
  x: number
  y: number
  w: number
  h: number
  loot: BurglaryLoot[]
  /** Something dangerous in the room: the sleeping owner or the dog. */
  hazard: 'owner' | 'dog' | null
}

export interface BurglaryData {
  house: string
  tier: number
  owner: string
  ownerHome: boolean
  dog: string | null
  alarm: boolean
  cols: number
  rows: number
  rooms: BurglaryRoom[]
  /** Chance of getting caught on the first search; each search adds riskStep. */
  baseRisk: number
  riskStep: number
  /** Pre-rolled random numbers (one per search) so the outcome follows the game seed. */
  rolls: number[]
}

/** Chance that searching `room` gets you caught after `searches` earlier searches. */
export function burglaryRisk(data: BurglaryData, searches: number, room: BurglaryRoom): number {
  const hazard = room.hazard === 'owner' ? 0.3 : room.hazard === 'dog' ? 0.25 : 0
  return clamp(data.baseRisk + searches * data.riskStep + hazard, 0, 0.95)
}

/** What gets you caught when a search goes wrong. */
export function burglaryCatcher(data: BurglaryData, room: BurglaryRoom): 'owner' | 'dog' | 'alarm' {
  if (room.hazard) return room.hazard
  if (data.alarm) return 'alarm'
  if (data.dog) return 'dog'
  return 'owner'
}

type RoomTemplate = [string, string, number, number, number, number]

const HOUSE_TEMPLATES: { cols: number; rows: number; rooms: RoomTemplate[] }[] = [
  {
    cols: 3,
    rows: 2,
    rooms: [
      ['Living Room', '\u{1F6CB}\u{FE0F}', 0, 0, 2, 1],
      ['Kitchen', '\u{1F373}', 2, 0, 1, 1],
      ['Bedroom', '\u{1F6CF}\u{FE0F}', 0, 1, 1, 1],
      ['Bathroom', '\u{1F6C1}', 1, 1, 1, 1],
      ['Garage', '\u{1F527}', 2, 1, 1, 1],
    ],
  },
  {
    cols: 3,
    rows: 3,
    rooms: [
      ['Living Room', '\u{1F6CB}\u{FE0F}', 0, 0, 2, 1],
      ['Kitchen', '\u{1F373}', 2, 0, 1, 1],
      ['Dining Room', '\u{1F37D}\u{FE0F}', 0, 1, 1, 1],
      ['Office', '\u{1F5A5}\u{FE0F}', 1, 1, 1, 1],
      ['Bathroom', '\u{1F6C1}', 2, 1, 1, 1],
      ['Master Bedroom', '\u{1F6CF}\u{FE0F}', 0, 2, 2, 1],
      ["Kid's Room", '\u{1F9F8}', 2, 2, 1, 1],
    ],
  },
  {
    cols: 4,
    rows: 3,
    rooms: [
      ['Grand Foyer', '\u{1F3DB}\u{FE0F}', 0, 0, 1, 1],
      ['Living Room', '\u{1F6CB}\u{FE0F}', 1, 0, 2, 1],
      ['Kitchen', '\u{1F373}', 3, 0, 1, 1],
      ['Home Office', '\u{1F5A5}\u{FE0F}', 0, 1, 1, 1],
      ['Game Room', '\u{1F3B1}', 1, 1, 1, 1],
      ['Wine Cellar', '\u{1F377}', 2, 1, 1, 1],
      ['Library', '\u{1F4DA}', 3, 1, 1, 1],
      ['Master Suite', '\u{1F6CF}\u{FE0F}', 0, 2, 2, 1],
      ['Walk-in Closet', '\u{1F457}', 2, 2, 1, 1],
      ['Guest Room', '\u{1F6CC}', 3, 2, 1, 1],
    ],
  },
]

/** Loot by room: [name, emoji, low, high, era gates]. Gates as in events/era.ts ('tv,2005', '-1960'). */
const ROOM_LOOT: Record<string, [string, string, number, number, string?][]> = {
  'Living Room': [
    ['Flat-screen TV', '\u{1F4FA}', 200, 1500, 'tv,2005'],
    ['Television set', '\u{1F4FA}', 100, 800, 'tv,-2005'],
    ['Game console', '\u{1F3AE}', 150, 500, 'videoGameConsole'],
    ['Stack of cash', '\u{1F4B5}', 50, 2000],
    ['Soundbar', '\u{1F50A}', 80, 400, '2010'],
    ['Record player', '\u{1F3B5}', 60, 400, '1950,-1995'],
    ['Radio set', '\u{1F4FB}', 40, 300, 'radio,-1960'],
    ['Mantel clock', '\u{1F570}\u{FE0F}', 40, 500, '-1960'],
  ],
  Kitchen: [['Cash jar', '\u{1FAD9}', 10, 300], ['Stand mixer', '\u{1F963}', 100, 450, '1937'], ['Silverware set', '\u{1F374}', 80, 600]],
  Bedroom: [['Jewelry box', '\u{1F48D}', 200, 3000], ['Watch', '\u{231A}', 100, 2500], ['Laptop', '\u{1F4BB}', 300, 1500, '1995,homeComputer'], ['Fur stole', '\u{1F9E5}', 100, 1200, '-1970']],
  'Master Bedroom': [['Jewelry box', '\u{1F48D}', 200, 3000], ['Watch', '\u{231A}', 100, 2500], ['Diamond', '\u{1F48E}', 1000, 10000], ['Laptop', '\u{1F4BB}', 300, 1500, '1995,homeComputer']],
  'Master Suite': [['Diamond', '\u{1F48E}', 1000, 10000], ['Gold watch', '\u{231A}', 1000, 9000], ['Jewelry box', '\u{1F48D}', 500, 6000]],
  "Kid's Room": [['Teddy bear', '\u{1F9F8}', 5, 40], ['Tablet', '\u{1F4F1}', 100, 400, 'smartphone'], ['Piggy bank', '\u{1F437}', 5, 150], ['Tin toy train', '\u{1F682}', 10, 120, '-1965'], ['Comic book collection', '\u{1F4DA}', 10, 400, '1938']],
  Office: [['Computer', '\u{1F5A5}\u{FE0F}', 300, 1500, 'homeComputer'], ['Laptop', '\u{1F4BB}', 300, 1500, '1995,homeComputer'], ['Cash box', '\u{1F4B0}', 100, 2500], ['Typewriter', '\u{1F4DC}', 40, 300, '-1995']],
  'Home Office': [['Computer', '\u{1F5A5}\u{FE0F}', 500, 3000, 'homeComputer'], ['Safe full of cash', '\u{1F4B0}', 1000, 15000], ['Fountain pen set', '\u{1F58B}\u{FE0F}', 50, 600, '-1980']],
  Garage: [['Guitar', '\u{1F3B8}', 100, 1200], ['Power tools', '\u{1F527}', 80, 600, '1950'], ['Mountain bike', '\u{1F6B2}', 100, 900, '1980'], ['Bicycle', '\u{1F6B2}', 20, 200, '-1980']],
  Bathroom: [['Electric toothbrush', '\u{1FAA5}', 20, 120, '1960'], ['Designer perfume', '\u{1F9F4}', 40, 200]],
  'Dining Room': [['Silver candlesticks', '\u{1F56F}\u{FE0F}', 60, 500], ['Fine china', '\u{1F37D}\u{FE0F}', 80, 700]],
  'Game Room': [['Arcade machine', '\u{1F579}\u{FE0F}', 300, 2500, '1975'], ['Signed baseball', '\u{26BE}', 100, 3000], ['Billiard cues', '\u{1F3B1}', 50, 600]],
  'Wine Cellar': [['Vintage wine', '\u{1F377}', 100, 3000]],
  Library: [['First-edition book', '\u{1F4D5}', 100, 5000], ['Antique globe', '\u{1F30D}', 100, 1500]],
  'Walk-in Closet': [['Designer handbag', '\u{1F45C}', 300, 4000], ['Fur coat', '\u{1F9E5}', 200, 3000]],
  'Guest Room': [['Antique lamp', '\u{1FA94}', 40, 400], ['Guitar', '\u{1F3B8}', 100, 1200]],
  'Grand Foyer': [['Marble statue', '\u{1F5FF}', 200, 3000], ['Oil painting', '\u{1F5BC}\u{FE0F}', 500, 8000]],
}

const STREETS = ['Maple Street', 'Elm Avenue', 'Oak Lane', 'Cedar Drive', 'Birch Road', 'Willow Way', 'Pine Court', 'Sycamore Boulevard', 'Chestnut Street', 'Magnolia Terrace', 'Hawthorne Place', 'Juniper Circle']
const DOG_NAMES = ['Rex', 'Bella', 'Max', 'Tank', 'Princess', 'Brutus', 'Cupcake', 'Killer', 'Daisy', 'Bruno', 'Muffin', 'Diesel']

function generateHouse(g: GameState, tier: number): BurglaryData {
  const tpl = HOUSE_TEMPLATES[tier - 1]
  const us = g.character.countryId === 'us'
  const street = us ? pickLine(g, STREETS) : localStreetName(g)
  const house =
    tier === 1
      ? pick(g, us ? [`a run-down bungalow on ${street}`, `a tiny cottage on ${street}`, g.year >= 1955 ? `a mobile home on ${street}` : `a boarding house on ${street}`] : [`a run-down bungalow on ${street}`, `a tiny cottage on ${street}`, `a cramped ground-floor flat on ${street}`])
      : tier === 2
        ? pick(g, us ? [`a two-story house on ${street}`, g.year >= 1955 ? `a suburban split-level on ${street}` : `a clapboard farmhouse on ${street}`, `a brick colonial on ${street}`] : [`a two-story house on ${street}`, `a family house on ${street}`, `a big townhouse on ${street}`])
        : pick(g, [`a gated mansion on ${street}`, `a hilltop estate on ${street}`, g.year >= 1950 ? `a modern glass mansion on ${street}` : `a Victorian mansion on ${street}`])
  const ownerGender: Gender = chance(g, 0.5) ? 'male' : 'female'
  const owner = strangerName(g, ownerGender)
  const ownerHome = chance(g, tier === 3 ? 0.4 : 0.5)
  const dog = chance(g, [0.4, 0.5, 0.6][tier - 1]) ? pick(g, DOG_NAMES) : null
  const alarm = chance(g, [0.15, 0.4, 0.85][tier - 1])
  const mult = [0.5, 1, 2.5][tier - 1] * moneyScale(g)
  const rooms: BurglaryRoom[] = tpl.rooms.map(([name, emoji, x, y, w, h], i) => {
    const pool = (ROOM_LOOT[name] ?? []).filter(([, , , , era]) => !era || era.split(',').every((t) => gateHolds(g, t)))
    const n = pool.length === 0 || chance(g, 0.15) ? 0 : chance(g, tier === 1 ? 0.25 : 0.45) ? 2 : 1
    const loot = shuffle(g, pool)
      .slice(0, n)
      .map(([lname, lemoji, lo, hi]) => ({ name: lname, emoji: lemoji, value: Math.max(1, Math.round(randInt(g, lo, hi) * mult)) }))
    // No cars, no garage: the tools and the bike live in the shed.
    const shown = name === 'Garage' && !cars(g) ? 'Shed' : name === 'Office' || name === 'Home Office' ? (common(g, 'homeComputer') ? name : 'Study') : name
    return { id: `r${i}`, name: shown, emoji: shown === 'Study' ? '\u{1F4DA}' : emoji, x, y, w, h, loot, hazard: null }
  })
  const bedrooms = rooms.filter((r) => /Bedroom|Suite|Guest/.test(r.name))
  if (ownerHome && bedrooms.length) pick(g, bedrooms).hazard = 'owner'
  if (dog) {
    const free = rooms.filter((r) => !r.hazard)
    if (free.length) pick(g, free).hazard = 'dog'
  }
  return {
    house,
    tier,
    owner,
    ownerHome,
    dog,
    alarm,
    cols: tpl.cols,
    rows: tpl.rows,
    rooms,
    baseRisk: ([0.04, 0.06, 0.09][tier - 1] + (alarm ? 0.04 : 0)) * caughtMult(g),
    riskStep: 0.05 * caughtMult(g),
    rolls: rooms.map(() => Math.round(rand(g) * 10000) / 10000),
  }
}

const BURGLARY_RESULT = defineScript('crime.burglary.result', (g, result, data) => {
  if (!canAct(g) || !isRecord(data)) return
  const house = data as unknown as BurglaryData
  if (!Array.isArray(house.rooms)) return
  let parsed: { [key: string]: Json } = {}
  try {
    const raw = JSON.parse(result) as Json
    if (isRecord(raw)) parsed = raw
  } catch {
    parsed = {}
  }
  const caught = parsed.caught === true
  const roomIds = new Set(Array.isArray(parsed.rooms) ? parsed.rooms.filter((x): x is string => typeof x === 'string') : [])
  const searched = house.rooms.filter((r) => roomIds.has(r.id))
  const items = searched.flatMap((r) => r.loot)
  let loot = items.reduce((s, it) => s + it.value, 0)
  if (roomIds.size === 0 && typeof parsed.loot === 'number') {
    const max = house.rooms.reduce((s, r) => s + r.loot.reduce((a, it) => a + it.value, 0), 0)
    loot = clamp(Math.round(parsed.loot), 0, max)
  }
  if (!caught && searched.length === 0 && loot === 0) {
    log(g, 'I cased a house but chickened out of the burglary.', 'neutral')
    notice(g, 'Cold Feet', `You stood outside ${house.house} for twenty minutes, then went home.`, { emoji: '\u{1F976}' })
    return
  }
  const idx = commitCrime(g, 'Burglary', { karma: 6, notoriety: 3, heat: caught ? 0 : 0.25 })
  if (!caught) {
    if (loot <= 0) {
      log(g, `I burglarized ${house.house} and found nothing worth taking.`, 'neutral')
      outcome(g, 'Slim Pickings', `You crept through ${house.house} and found nothing worth stealing. At least you got out clean.`, '\u{1F3DA}\u{FE0F}')
      return
    }
    count(g, 'burglaries')
    const got = pocket(g, loot)
    const names = items.map((it) => it.name.toLowerCase())
    const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] ?? 'some loot'
    log(g, `I burglarized ${house.house} and fenced the loot for ${formatMoney(got)}.`, 'good')
    outcome(g, 'Burglary', pickSite(g, [
      `You slipped out of ${house.house} with ${list}. A fence gave you ${formatMoney(loot)} for the lot.`,
      `Clean job. You made off with ${list} and sold everything for ${formatMoney(loot)}.`,
      `${house.owner} is going to have a bad morning. You got away with ${list}, worth ${formatMoney(loot)} on the street.`,
    ], 0x5bcf25b5), '\u{1F977}', 'good')
    return
  }
  const by = parsed.by === 'dog' || parsed.by === 'alarm' || parsed.by === 'owner' ? parsed.by : house.ownerHome ? 'owner' : house.dog ? 'dog' : 'alarm'
  const policeChance = ((by === 'alarm' ? 0.6 : by === 'owner' ? 0.4 : 0.25) + (house.tier === 3 ? 0.15 : 0)) * caughtMult(g)
  const lost = loot > 0 ? ` You dropped everything you'd grabbed.` : ''
  if (chance(g, policeChance)) {
    const context =
      by === 'alarm'
        ? `The alarm at ${house.house} went off. The police were waiting at the door.`
        : by === 'dog'
          ? `${house.dog ?? 'The dog'} barked until the whole street woke up. The police arrived before you got out.`
          : `${house.owner} woke up, locked you in the bathroom, and called the police.`
    arrestPlayer(g, 'Burglary', house.tier === 3 ? 3 : 2, { recordIndex: idx, evidence: 0.85, context })
    return
  }
  if (by === 'dog') {
    const bitten = chance(g, 0.6)
    const dmg = bitten ? hurt(g, randInt(g, 5, 15)) : 0
    log(g, `A dog named ${house.dog ?? 'Rex'} chased me out of a house I was robbing.`, 'bad')
    outcome(g, 'Bad Dog', `${house.dog ?? 'The dog'} caught you mid-burglary${bitten ? ` and took a chunk out of your leg (-${dmg} health)` : ''}. You dove out a window.${lost}`, '\u{1F415}', 'bad')
    return
  }
  if (by === 'owner' && chance(g, 0.5)) {
    const dmg = hurt(g, randInt(g, 8, 22))
    log(g, `The homeowner beat me up when I tried to rob their house.`, 'bad')
    outcome(g, 'Homeowner', `${house.owner} caught you red-handed and beat you with a ${pickLine(g, ['frying pan', 'golf club', 'rolling pin', 'baseball bat', 'very heavy dictionary'])}. (-${dmg} health) You fled.${lost}`, '\u{1F915}', 'bad')
    return
  }
  log(g, 'I fled a burglary empty-handed.', 'bad')
  outcome(g, by === 'alarm' ? 'Alarm!' : 'Spotted', by === 'alarm' ? `The alarm blared and you sprinted out of ${house.house} before the cops arrived.${lost}` : `${house.owner} screamed and chased you out of the house.${lost}`, '\u{1F6A8}', 'bad')
})

const BURGLARY_PICK = defineScript('crime.burglary.pick', (g, choice, data) => {
  if (!canAct(g) || !isRecord(data) || choice === 'cancel') return
  const houses = Array.isArray(data.houses) ? data.houses : []
  const pickHouse = houses.find((h) => isRecord(h) && h.id === choice)
  if (!isRecord(pickHouse)) return
  const house = pickHouse.house
  if (!isRecord(house)) return
  minigame(g, 'burglary', 'Burglary', BURGLARY_RESULT, house)
})

const burglaryAction: MenuAction = {
  type: 'action',
  id: 'crime.burglary',
  label: 'Burglary',
  emoji: '\u{1F3E0}',
  subtitle: "Break into a stranger's house",
  disabledReason: ageGate(10),
  run: (g) => {
    if (!canAct(g) || !lieLow(g, 'crime.burglary', 3)) return
    const houses = [1, 2, 3].map((tier) => ({ id: `h${tier}`, house: generateHouse(g, tier) as unknown as Json, label: '' }))
    const choices: ChoiceOption[] = houses.map((h) => {
      const d = h.house as unknown as BurglaryData
      return { id: h.id, label: titleCase(d.house.replace(/^(a|an) /, '')), emoji: ['\u{1F3DA}\u{FE0F}', '\u{1F3E1}', '\u{1F3F0}'][d.tier - 1] }
    })
    choices.push({ id: 'cancel', label: 'Never mind', emoji: '\u{1F645}' })
    scriptChoice(g, BURGLARY_PICK, 'Burglary', 'You cased the neighborhood. Bigger houses hold better loot, and better security. Which house will you hit?', choices, {
      emoji: '\u{1F977}',
      data: { houses: houses.map((h) => ({ id: h.id, house: h.house })) },
    })
  },
}

// ---------------------------------------------------------------------------
// Grand Theft Auto (age 14+)

const CAR_MAKES = ['Brava', 'Corvex', 'Dorado', 'Falconi', 'Hondo', 'Kestrel', 'Lumen', 'Maverik', 'Novara', 'Pacer', 'Raptor', 'Sable', 'Titan', 'Valiant', 'Zephyr']
/** Body styles by era: no minivans before the 1980s, touring cars and roadsters early on. */
const CAR_TYPES: { type: string; emoji: string; lo: number; hi: number; risk: number; since?: number; until?: number }[] = [
  { type: 'Hatchback', emoji: '\u{1F697}', lo: 3000, hi: 15000, risk: 0, since: 1965 },
  { type: 'Sedan', emoji: '\u{1F697}', lo: 4000, hi: 25000, risk: 0, since: 1915 },
  { type: 'Pickup Truck', emoji: '\u{1F6FB}', lo: 6000, hi: 35000, risk: 0.02, since: 1925 },
  { type: 'Minivan', emoji: '\u{1F690}', lo: 3000, hi: 20000, risk: -0.03, since: 1984 },
  { type: 'SUV', emoji: '\u{1F699}', lo: 8000, hi: 45000, risk: 0.04, since: 1985 },
  { type: 'Convertible', emoji: '\u{1F697}', lo: 15000, hi: 60000, risk: 0.06, since: 1925 },
  { type: 'Sports Car', emoji: '\u{1F3CE}\u{FE0F}', lo: 30000, hi: 90000, risk: 0.1, since: 1950 },
  { type: 'Luxury Sedan', emoji: '\u{1F698}', lo: 40000, hi: 110000, risk: 0.12, since: 1920 },
  { type: 'Supercar', emoji: '\u{1F3CE}\u{FE0F}', lo: 150000, hi: 400000, risk: 0.2, since: 1970 },
  { type: 'Touring Car', emoji: '\u{1F697}', lo: 2000, hi: 12000, risk: 0, until: 1935 },
  { type: 'Roadster', emoji: '\u{1F3CE}\u{FE0F}', lo: 5000, hi: 30000, risk: 0.06, until: 1945 },
]
const CAR_SPOTS: { text: string; risk: number }[] = [
  { text: '@1915 idling outside a gas station with the keys in it', risk: -0.15 },
  { text: '@-1915 idling outside the general store with the engine still running', risk: -0.15 },
  { text: 'parked in a dark alley', risk: -0.05 },
  { text: '@1962 in a mall parking lot', risk: 0.05 },
  { text: 'on a busy street', risk: 0.1 },
  { text: 'in a gated driveway', risk: 0.15 },
  { text: 'outside the police station', risk: 0.35 },
  { text: '@1950 in a valet lot', risk: 0.08 },
  { text: 'outside a gym', risk: 0 },
]

interface StolenCar {
  id: string
  name: string
  make: string
  type: string
  year: number
  emoji: string
  value: number
  spot: string
  risk: number
}

const GTA_KEEP = defineScript('crime.gta.keep', (g, choice, data) => {
  const c = g.character
  if (!canAct(g) || !isRecord(data)) return
  const car = data as unknown as StolenCar
  if (typeof car.name !== 'string') return
  if (choice === 'keep') {
    g.assets.push({
      id: uid(g, 'a'),
      kind: 'car',
      name: car.name,
      emoji: car.emoji,
      purchasePrice: 0,
      value: car.value,
      condition: randInt(g, 55, 95),
      purchasedAge: c.age,
      upkeep: Math.round(car.value * 0.02),
      details: { stolen: true, make: car.make, model: car.type, year: car.year, type: car.type },
    })
    log(g, `I kept the stolen ${car.name}.`, 'event')
    outcome(g, 'New Wheels', `The ${car.name} is yours now, sort of. It's parked in your Assets. Maybe don't take it to a mechanic who reads license plates.`, car.emoji, 'event')
    return
  }
  const price = Math.max(100, Math.round(car.value * (0.25 + rand(g) * 0.15)))
  const got = pocket(g, price)
  log(g, `I sold a stolen ${car.name} to a chop shop for ${formatMoney(got)}.`, 'good')
  outcome(g, 'Chop Shop', pickSite(g, [
    `A guy named ${g.character.countryId === 'us' ? pickLine(g, ['Sal', 'Big Mike', 'Dmitri', 'Lou', 'Toad', 'Rosa']) : randomFirstName(g, g.character.countryId, 'male')} at the chop shop handed you ${formatMoney(price)} in an envelope. The ${car.name} was in eleven pieces before you reached the door.`,
    `The chop shop paid ${formatMoney(price)} for the ${car.name}. No paperwork, no questions.`,
  ], 0x844b11d2), '\u{1F527}', 'good')
})

const GTA_PICK = defineScript('crime.gta.pick', (g, choice, data) => {
  const c = g.character
  if (!canAct(g) || !isRecord(data) || choice === 'cancel') return
  const cars = Array.isArray(data.cars) ? data.cars : []
  const raw = cars.find((x) => isRecord(x) && x.id === choice)
  if (!isRecord(raw)) return
  const car = raw as unknown as StolenCar
  const p = clamp((car.risk - (c.stats.smarts - 50) / 500 - (hasLicense(g, 'driver') ? 0.03 : -0.05)) * caughtMult(g), 0.04, 0.9)
  const idx = commitCrime(g, 'Grand Theft Auto', { karma: 5, notoriety: 3, heat: 0.3 })
  if (!chance(g, p)) {
    count(g, 'carsStolen')
    log(g, `I stole a ${car.name}.`, 'event')
    scriptChoice(g, GTA_KEEP, 'Grand Theft Auto', pickSite(g, [
      `You hot-wired the ${car.name} ${car.spot} and peeled out. Nobody followed you. What now?`,
      `You jimmied the lock of the ${car.name} ${car.spot}, and thirty seconds later you were cruising down the highway. What now?`,
    ], 0xe25f4c2c), [
      { id: 'keep', label: 'Keep it', emoji: car.emoji },
      { id: 'chop', label: 'Sell it to a chop shop', emoji: '\u{1F527}' },
    ], { emoji: car.emoji, data: raw })
    return
  }
  const roll = rand(g)
  if (roll < 0.3) {
    if (g.year >= 1970) {
      log(g, 'I tried to steal a car, but the alarm scared me off.', 'bad')
      outcome(g, 'Car Alarm', `The ${car.name}'s alarm went off the second you touched the door. You ran.`, '\u{1F6A8}', 'bad')
    } else {
      log(g, 'I tried to steal a car, but a passerby scared me off.', 'bad')
      outcome(g, 'Spotted', `A passerby shouted "Hey, that's not yours!" the second you touched the ${car.name}'s door. You ran.`, '\u{1F6A8}', 'bad')
    }
    return
  }
  if (roll < 0.55) {
    const dmg = hurt(g, randInt(g, 6, 18))
    const owner = strangerName(g, chance(g, 0.5) ? 'male' : 'female')
    log(g, `The owner of a ${car.name} caught me trying to steal it and beat me up.`, 'bad')
    outcome(g, 'Owner!', `${owner} came back to the ${car.name} and caught you elbow-deep in the dashboard wires. ${pickLine(g, ['They dragged you out by your collar and pummeled you.', 'They hit you with a tire iron.'])} (-${dmg} health)`, '\u{1F915}', 'bad')
    return
  }
  arrestPlayer(g, 'Grand Theft Auto', 2, { recordIndex: idx, evidence: 0.8, context: `${g.year >= 1930 ? 'A police cruiser pulled up' : 'A constable on a bicycle pedaled up'} just as you got the ${car.name} started.` })
})

const gtaAction: MenuAction = {
  type: 'action',
  id: 'crime.gta',
  label: 'Grand Theft Auto',
  emoji: '\u{1F697}',
  subtitle: 'Steal a car',
  visible: (g) => g.year >= 1910,
  disabledReason: ageGate(14),
  run: (g) => {
    if (!canAct(g) || !lieLow(g, 'crime.gta', 3)) return
    const era = CAR_TYPES.filter((t) => g.year >= (t.since ?? 0) && g.year <= (t.until ?? 9999))
    const types = shuffle(g, era.length ? era : CAR_TYPES)
    const spots = CAR_SPOTS.filter((x) => eraOk(g, x.text)).map((x) => ({ ...x, text: eraStrip(x.text) }))
    const cars: StolenCar[] = []
    for (let i = 0; i < 5; i++) {
      const t = types[i % types.length]
      const make = pick(g, CAR_MAKES)
      // Cars are no older than the motor age (about 1900).
      const age = Math.min(randInt(g, 0, 15), Math.max(0, g.year - 1900))
      const value = cash(g, randInt(g, t.lo, t.hi) * Math.max(0.35, 1 - age * 0.05))
      const spot = pick(g, spots)
      cars.push({
        id: `c${i}`,
        name: `${g.year - age} ${make} ${t.type}`,
        make,
        type: t.type,
        year: g.year - age,
        emoji: t.emoji,
        value,
        spot: spot.text,
        risk: clamp(0.25 + t.risk + spot.risk, 0.05, 0.85),
      })
    }
    // Crime talent: you can tell which ride is worth the risk.
    const best = hasTalent(g, 'Crime') ? cars.reduce((a, b) => (b.value * (1 - b.risk) ** 2 > a.value * (1 - a.risk) ** 2 ? b : a)) : null
    scriptChoice(g, GTA_PICK, 'Grand Theft Auto', 'You go looking for a ride that is not yours. Which car will you steal?', [
      ...cars.map((car) => ({
        id: car.id,
        label: `${car.name} ${car.spot} (${shortMoney(car.value)})`,
        emoji: car.emoji,
        ...(best && car.id === best.id ? { hint: talentHint(g, 'Crime', 'Best payoff for the risk on this street. Your gut is rarely wrong.') } : {}),
      })),
      { id: 'cancel', label: 'Never mind', emoji: '\u{1F645}' },
    ], { emoji: '\u{1F511}', data: { cars: cars as unknown as Json } })
  },
}

// ---------------------------------------------------------------------------
// Bank Robbery (age 16+): bank → crew → weapon → disguise → getaway

interface Bank {
  tier: number
  name: string
  lo: number
  hi: number
  difficulty: number
}

const BANK_WEAPONS: { id: string; label: string; emoji: string; bonus: number; armed: boolean; since?: number }[] = [
  { id: 'pistol', label: 'A pistol', emoji: '\u{1F52B}', bonus: 0.12, armed: true },
  { id: 'shotgun', label: 'A sawed-off shotgun', emoji: '\u{1F4A5}', bonus: 0.15, armed: true },
  { id: 'toy', label: 'A water gun painted black', emoji: '\u{1F4A6}', bonus: 0.05, armed: false, since: 1950 },
  { id: 'note', label: 'A politely worded note', emoji: '\u{1F4DD}', bonus: -0.05, armed: false },
  { id: 'banana', label: 'A banana in my pocket', emoji: '\u{1F34C}', bonus: -0.1, armed: false },
]
const BANK_DISGUISES: { id: string; label: string; emoji: string; bonus: number; since?: number; until?: number }[] = [
  { id: 'ski', label: 'Ski mask', emoji: '\u{1F977}', bonus: 0.1, since: 1960 },
  { id: 'bandana', label: 'Bandana over my face', emoji: '\u{1F920}', bonus: 0.1, until: 1959 },
  { id: 'clown', label: 'Clown mask', emoji: '\u{1F921}', bonus: 0.08 },
  { id: 'pantyhose', label: 'Pantyhose over my face', emoji: '\u{1F9E6}', bonus: 0.06, since: 1960 },
  { id: 'president', label: 'Rubber president mask', emoji: '\u{1F468}\u{200D}\u{1F4BC}', bonus: 0.08, since: 1965 },
  { id: 'mustache', label: 'Fake mustache', emoji: '\u{1F978}', bonus: 0 },
  { id: 'none', label: 'No disguise', emoji: '\u{1F600}', bonus: -0.15 },
]
const BANK_GETAWAYS: { id: string; label: string; emoji: string; bonus: number; text: string; fits?: (g: GameState) => boolean }[] = [
  { id: 'car', label: 'Getaway car', emoji: '\u{1F697}', bonus: 0.1, text: 'in a getaway car', fits: (g) => g.year >= 1910 },
  { id: 'motorcycle', label: 'Motorcycle', emoji: '\u{1F3CD}\u{FE0F}', bonus: 0.12, text: 'on a motorcycle', fits: (g) => g.year >= 1910 },
  { id: 'bike', label: 'Bicycle', emoji: '\u{1F6B2}', bonus: -0.02, text: 'on a bicycle, pedaling furiously' },
  { id: 'foot', label: 'On foot', emoji: '\u{1F3C3}', bonus: -0.08, text: 'on foot' },
  { id: 'rideshare', label: 'Call a rideshare', emoji: '\u{1F4F1}', bonus: -0.12, text: 'in a rideshare (you gave the driver five stars)', fits: (g) => common(g, 'rideHailing') },
  { id: 'horse', label: 'On horseback', emoji: '\u{1F40E}', bonus: 0.08, text: 'on horseback in a cloud of dust', fits: (g) => g.year < 1940 },
]

const BANK_SCRIPT = defineScript('crime.bank.step', (g, choice, data) => {
  const c = g.character
  if (!canAct(g) || !isRecord(data) || choice === 'cancel') return
  const step = str(data.step)
  const next: { [key: string]: Json } = { ...data }
  if (step === 'bank') {
    const banks = Array.isArray(data.banks) ? data.banks : []
    const bank = banks.find((b) => isRecord(b) && b.id === choice)
    if (!isRecord(bank)) return
    next.bank = bank
    next.step = 'crew'
    const fam = crimeFamily(g)
    const choices: ChoiceOption[] = [
      { id: 'solo', label: 'Go solo (keep it all)', emoji: '\u{1F464}' },
      { id: 'crew', label: 'Hire a crew (they take half)', emoji: '\u{1F465}' },
    ]
    if (fam) choices.push({ id: 'family', label: `Use soldiers from the ${fam.name} (they take 40%)`, emoji: '\u{1F574}\u{FE0F}' })
    scriptChoice(g, BANK_SCRIPT, 'Bank Robbery', `Target: ${str(bank.name)}. Who's coming with you?`, choices, { emoji: '\u{1F3E6}', data: next })
    return
  }
  if (step === 'crew') {
    next.crew = choice
    next.step = 'weapon'
    scriptChoice(g, BANK_SCRIPT, 'Bank Robbery', 'Choose your weapon.', BANK_WEAPONS.filter((w) => g.year >= (w.since ?? 0)).map((w) => ({ id: w.id, label: w.label, emoji: w.emoji })), { emoji: '\u{1F3E6}', data: next })
    return
  }
  if (step === 'weapon') {
    next.weapon = choice
    next.step = 'disguise'
    scriptChoice(g, BANK_SCRIPT, 'Bank Robbery', 'Choose your disguise.', BANK_DISGUISES.filter((d) => g.year >= (d.since ?? 0) && g.year <= (d.until ?? 9999)).map((d) => ({ id: d.id, label: d.label, emoji: d.emoji })), { emoji: '\u{1F3E6}', data: next })
    return
  }
  if (step === 'disguise') {
    next.disguise = choice
    next.step = 'getaway'
    scriptChoice(g, BANK_SCRIPT, 'Bank Robbery', 'How will you get away?', BANK_GETAWAYS.filter((x) => !x.fits || x.fits(g)).map((x) => ({ id: x.id, label: x.label, emoji: x.emoji })), { emoji: '\u{1F3E6}', data: next })
    return
  }
  if (step !== 'getaway') return
  const bankRaw = data.bank
  if (!isRecord(bankRaw)) return
  const bank = bankRaw as unknown as Bank
  const weapon = BANK_WEAPONS.find((w) => w.id === str(data.weapon)) ?? BANK_WEAPONS[3]
  const disguise = BANK_DISGUISES.find((d) => d.id === str(data.disguise)) ?? BANK_DISGUISES.find((d) => d.id === 'none') ?? BANK_DISGUISES[0]
  const getaway = BANK_GETAWAYS.find((x) => x.id === choice) ?? BANK_GETAWAYS[3]
  const crew = str(data.crew, 'solo')
  const crewBonus = crew === 'family' ? 0.2 : crew === 'crew' ? 0.15 : 0
  const share = crew === 'family' ? 0.6 : crew === 'crew' ? 0.5 : 1
  const p = clamp(0.35 - bank.difficulty + weapon.bonus + disguise.bonus + getaway.bonus + crewBonus + (c.stats.smarts - 50) / 600 + crimeEdge(g), 0.05, 0.85)
  const crime = weapon.armed ? 'Armed Robbery' : 'Bank Robbery'
  const idx = commitCrime(g, crime, { karma: 10, notoriety: 8, heat: disguise.id === 'none' ? 2 : 0.6 })
  const lines = [`You stormed into ${bank.name} wearing ${disguise.id === 'none' ? 'your regular face' : disguise.label.toLowerCase()} and waving ${weapon.label.toLowerCase()}.`]
  if (chance(g, p)) {
    count(g, 'bankRobberies')
    const take = Math.round(cash(g, randInt(g, bank.lo, bank.hi)) * share)
    const got = pocket(g, take)
    const fam = crimeFamily(g)
    if (fam && crew === 'family') fam.standing = clamp(fam.standing + randInt(g, 5, 10))
    lines.push(pickSite(g, [
      `The tellers emptied the drawers. You escaped ${getaway.text} with ${formatMoney(take)}${share < 1 ? ' after splitting the take' : ''}.`,
      `It went like clockwork. You vanished ${getaway.text} with ${formatMoney(take)}${share < 1 ? ' as your share' : ''}.`,
    ], 0x47f3b57a))
    log(g, `I robbed ${bank.name} and got away with ${formatMoney(got)}.`, 'event')
    remember(g, `Robbed ${bank.name} and got away with ${formatMoney(take)}.`)
    outcome(g, 'Bank Robbery', lines.join(' '), '\u{1F4B0}', 'good')
    return
  }
  const shot = weapon.armed && chance(g, 0.12)
  if (shot) lines.push(`A security guard fired a warning shot that wasn't much of a warning. (-${hurt(g, randInt(g, 15, 35))} health)`)
  const how = pickSite(g, [
    'The silent alarm had already been tripped. The police surrounded the building before you could get to your getaway.',
    `A teller recognized you${disguise.id === 'none' ? ' instantly, because you had no disguise' : ''}. The police caught you in the lobby.`,
    'A dye pack exploded in the money bag and turned you bright blue. You were very easy to find.',
  ], 0x98cf7060)
  lines.push(how)
  arrestPlayer(g, crime, bank.tier === 3 ? 4 : 3, { recordIndex: idx, evidence: 0.9, context: lines.join(' '), extraCharges: crew !== 'solo' ? ['Conspiracy'] : [] })
})

const bankAction: MenuAction = {
  type: 'action',
  id: 'crime.bank',
  label: 'Bank Robbery',
  emoji: '\u{1F3E6}',
  subtitle: 'High risk, high reward',
  disabledReason: ageGate(16),
  run: (g) => {
    if (!canAct(g) || !lieLow(g, 'crime.bank', 1)) return
    const city = g.character.city
    const us = g.character.countryId === 'us'
    const banks: (Bank & { id: string })[] = [
      { id: 'b1', tier: 1, name: us ? `${city} Community Credit Union` : `${city} Savings Bank`, lo: 5000, hi: 40000, difficulty: 0 },
      { id: 'b2', tier: 2, name: `${pick(g, us ? ['Copper Lantern', 'Blue Meridian', 'Harbor Ledger', 'Cedar Crown'] : ['Civic Ledger', 'Meridian Trade', 'Harbor Merchants', 'Juniper Cooperative'])} Bank of ${city}`, lo: 20000, hi: 150000, difficulty: 0.12 },
      { id: 'b3', tier: 3, name: `${pickLine(g, ['Royal', 'Imperial', 'Sovereign', 'Golden Eagle'])} Reserve Vault`, lo: 150000, hi: 1000000, difficulty: 0.3 },
    ]
    scriptChoice(g, BANK_SCRIPT, 'Bank Robbery', 'Which bank will you hit? Bigger vaults, bigger guards.', [
      ...banks.map((b) => ({ id: b.id, label: b.name, emoji: ['\u{1F3E6}', '\u{1F3DB}\u{FE0F}', '\u{1F3F0}'][b.tier - 1] })),
      { id: 'cancel', label: 'Never mind', emoji: '\u{1F645}' },
    ], { emoji: '\u{1F3E6}', data: { step: 'bank', banks: banks as unknown as Json } })
  },
}

// ---------------------------------------------------------------------------
// Train Robbery (age 16+): pick a train and a time; it only shows up at the right time.
// Like the original, a successful train robbery can only happen once per life.

const TRAIN_TIMES = ['Sunrise', 'High Noon', '4:20 PM', 'Sunset', 'Midnight']
const TRAIN_NAMES = ['the Silver Comet', 'the Midnight Flyer', 'the Copper Canyon Limited', 'the Northern Star', 'the Iron Mule Freight', 'the Golden Arrow', 'the Desert Wind', 'the Thunder Express', 'the Coastal Rambler']
const TRAIN_CARGO = ['gold bars', 'payroll cash', 'luxury watches', 'rare coins', 'uncut diamonds', 'a shipment of fresh banknotes']
const TRAIN_FLAG = 'trainRobbed'

const TRAIN_TIME_SCRIPT = defineScript('crime.train.time', (g, choice, data) => {
  const c = g.character
  if (!canAct(g) || !isRecord(data)) return
  const train = str(data.train, 'the train')
  const cargo = str(data.cargo, 'cash')
  const slot = num(data.slot, 0)
  const chosen = TRAIN_TIMES.indexOf(choice)
  if (chosen < 0) return
  if (chosen !== slot) {
    log(g, `I waited by the tracks at ${TRAIN_TIMES[chosen].toLowerCase()} for a train that never came.`, 'neutral')
    notice(g, 'No Train', pickSite(g, [
      `You waited by the tracks at ${TRAIN_TIMES[chosen].toLowerCase()} with a bandana over your face. Nothing came. A tumbleweed rolled by.`,
      `You camped beside the tracks until long after ${TRAIN_TIMES[chosen].toLowerCase()}. ${titleCase(train)} never showed. Wrong time, partner.`,
    ], 0xf7712ccd), { emoji: '\u{1F335}' })
    return
  }
  const idx = commitCrime(g, 'Train Robbery', { karma: 10, notoriety: 10, heat: 0.6 })
  if (chance(g, clamp(0.5 + (c.stats.smarts - 50) / 500 + (c.hidden.athleticism - 50) / 500 + crimeEdge(g), 0.2, 0.85))) {
    g.flags[TRAIN_FLAG] = true
    count(g, 'trainRobberies')
    const take = cash(g, randInt(g, 40000, 400000))
    const got = pocket(g, take)
    log(g, `I robbed ${train} and made off with ${formatMoney(got)}.`, 'event')
    remember(g, `Robbed ${train} like an outlaw of old.`)
    outcome(g, 'Train Robbery', pickSite(g, [
      `${titleCase(train)} rolled in right on time. You leapt aboard, cracked the safe, and rode off with ${cargo} worth ${formatMoney(take)}. Yee-haw.`,
      `Right at ${TRAIN_TIMES[slot].toLowerCase()}, ${train} thundered past. You swung aboard like an old-west outlaw and made off with ${formatMoney(take)} in ${cargo}.`,
    ], 0xe6341673), '\u{1F682}', 'good')
    return
  }
  if (chance(g, 0.25)) {
    const dmg = hurt(g, randInt(g, 10, 25))
    log(g, `I fell off ${train} trying to rob it.`, 'bad')
    outcome(g, 'Derailed', `You jumped for the caboose of ${train} and missed. You tumbled down an embankment and limped home. (-${dmg} health)`, '\u{1F915}', 'bad')
    return
  }
  arrestPlayer(g, 'Train Robbery', 3, { recordIndex: idx, evidence: 0.85, context: `Railroad police were riding ${train}. They grabbed you before you reached the safe.` })
})

const TRAIN_PICK_SCRIPT = defineScript('crime.train.pick', (g, choice, data) => {
  if (!canAct(g) || !isRecord(data) || choice === 'cancel') return
  const trains = Array.isArray(data.trains) ? data.trains : []
  const t = trains.find((x) => isRecord(x) && x.id === choice)
  if (!isRecord(t)) return
  scriptChoice(g, TRAIN_TIME_SCRIPT, 'Train Robbery', `You picked ${str(t.train)}. When will you wait by the tracks?`, TRAIN_TIMES.map((time) => ({ id: time, label: time, emoji: time === 'Midnight' ? '\u{1F319}' : time === 'Sunrise' ? '\u{1F305}' : time === 'Sunset' ? '\u{1F307}' : '\u{2600}\u{FE0F}' })), {
    emoji: '\u{1F570}\u{FE0F}',
    data: t,
  })
})

const trainAction: MenuAction = {
  type: 'action',
  id: 'crime.train',
  label: 'Train Robbery',
  emoji: '\u{1F682}',
  subtitle: 'Rob a train like an outlaw of old',
  disabledReason: (g) => blocked(g, 16) ?? (g.flags[TRAIN_FLAG] === true ? 'After your last heist, every railroad in the country hired armed guards. No more train robberies.' : null),
  run: (g) => {
    if (!canAct(g) || g.flags[TRAIN_FLAG] === true || !lieLow(g, 'crime.train', 1)) return
    const names = shuffle(g, TRAIN_NAMES).slice(0, 3)
    const trains = names.map((train, i) => {
      const slot = randInt(g, 0, TRAIN_TIMES.length - 1)
      const accurate = chance(g, 0.75)
      const rumor = accurate ? slot : (slot + randInt(g, 1, TRAIN_TIMES.length - 1)) % TRAIN_TIMES.length
      return { id: `t${i}`, train, slot, rumor: TRAIN_TIMES[rumor], cargo: pickLine(g, TRAIN_CARGO) }
    })
    const rumors = trains.map((t) => `${titleCase(t.train)} hauls ${t.cargo} and passes through around ${t.rumor.toLowerCase()}.`).join('\n')
    scriptChoice(g, TRAIN_PICK_SCRIPT, 'Train Robbery', `${g.character.countryId === 'us' ? 'Word around the saloon' : 'Word on the street'}:\n${rumors}\n\nRumors aren't always right. Which train will you rob?`, [
      ...trains.map((t) => ({ id: t.id, label: titleCase(t.train), emoji: '\u{1F682}' })),
      { id: 'cancel', label: 'Never mind', emoji: '\u{1F645}' },
    ], { emoji: '\u{1F920}', data: { trains } })
  },
}

// ---------------------------------------------------------------------------
// Murder (age 14+): someone from your life or a random stranger; thirteen methods, six offered

interface Victim {
  personId: string | null
  name: string
  gender: Gender
  age: number
  family: boolean
  /** "your mother Linda", "a stranger named Bob Smith" */
  label: string
}

interface MurderMethod {
  id: string
  label: string
  emoji: string
  success: number
  cops: number
  backfire: number
  playerCause: string
  win: (v: string, p: ReturnType<typeof pronouns>) => string
  miss: (v: string, p: ReturnType<typeof pronouns>) => string
  backfireText: (v: string, p: ReturnType<typeof pronouns>) => string
  requires?: (g: GameState) => boolean
}

const MURDER_METHODS: MurderMethod[] = [
  {
    id: 'wedgie', label: 'Atomic Wedgie', emoji: '\u{1FA72}', success: 0.1, cops: 0.45, backfire: 0.08, playerCause: 'Choked on Underwear',
    win: (v, p) => `You gave ${v} an atomic wedgie so powerful the waistband went over ${p.his} head. ${p.He} suffocated in ${p.his} own underwear.`,
    miss: (v, p) => `You yanked ${v}'s underwear with all your might, but the waistband snapped. ${p.He} looked at you with pure disgust.`,
    backfireText: (v, p) => `${v}'s waistband snapped. ${p.He} stuffed the tattered scraps into your mouth and you choked on them.`,
  },
  {
    id: 'club', label: 'Club Them', emoji: '\u{1F3CF}', success: 0.45, cops: 0.3, backfire: 0.06, playerCause: 'Clubbed',
    win: (v, p) => `You snuck up behind ${v} and clubbed ${p.him} over the head with a stick. ${p.He} never got back up.`,
    miss: (v, p) => `You swung your stick at ${v}, but ${p.he} ducked just in time.`,
    backfireText: (v) => `${v} dodged your stick and pulled out a much bigger one. That was the last thing you ever saw.`,
  },
  {
    id: 'driveby', label: 'Perform a Drive-By', emoji: '\u{1F697}', success: 0.85, cops: 0.1, backfire: 0.03, playerCause: 'Shot',
    win: (v) => `You rolled past ${v} with the windows down and opened fire. ${v} didn't survive.`,
    miss: () => 'You sped past firing wildly and hit nothing but a garden gnome.',
    backfireText: (v, p) => `${v} was waiting with a gun of ${p.his} own and fired back first.`,
    requires: (g) => hasLicense(g, 'driver') && g.assets.some((a) => a.kind === 'car'),
  },
  {
    id: 'electrocute', label: 'Electrocute Them', emoji: '\u{1F50C}', success: 0.5, cops: 0.3, backfire: 0.06, playerCause: 'Electrocuted',
    win: (v) => `You tossed a plugged-in toaster into ${v}'s bubble bath. The lights flickered across the whole neighborhood.`,
    miss: (v) => `You threw a toaster into ${v}'s bath, but it wasn't plugged in. ${v} screamed and threw a loofah at you.`,
    backfireText: (v) => `${v} leapt out of the tub and threw you into it, toaster and all.`,
    requires: (g) => g.year >= 1925,
  },
  {
    id: 'stairs', label: 'Push Down the Stairs', emoji: '\u{1FA9C}', success: 0.3, cops: 0.45, backfire: 0.08, playerCause: 'Fell Down the Stairs',
    win: (v) => `You gave ${v} a shove at the top of a long staircase. It was a very long staircase.`,
    miss: (v, p) => `You shoved ${v}, but ${p.he} grabbed the railing and stared at you in horror.`,
    backfireText: (v) => `${v} stepped aside at the last second. You tumbled down the stairs instead.`,
  },
  {
    id: 'strangle', label: 'Strangle Them', emoji: '\u{1F9E3}', success: 0.45, cops: 0.35, backfire: 0.07, playerCause: 'Strangled',
    win: (v) => `You strangled ${v} with a scarf. It was a nice scarf, too.`,
    miss: (v, p) => `You wrapped your hands around ${v}'s neck, but ${p.he} wriggled free.`,
    backfireText: (v) => `${v} broke your grip and strangled you instead.`,
  },
  {
    id: 'fastball', label: 'Fastball to the Head', emoji: '\u{26BE}', success: 0.25, cops: 0.35, backfire: 0.06, playerCause: 'Hit by a Baseball',
    win: (v) => `You wound up and threw a 100 mph fastball straight at ${v}'s head. Strike three, ${v}'s out.`,
    miss: (v) => `Your fastball sailed a foot over ${v}'s head. Ball four.`,
    backfireText: (v, p) => `${v} caught your fastball and threw it right back at your head at 100 mph. ${p.He} has a great arm.`,
  },
  {
    id: 'scare', label: 'Scare Them to Death', emoji: '\u{1F631}', success: 0.2, cops: 0.15, backfire: 0.05, playerCause: 'Scared to Death',
    win: (v, p) => `You dressed up as a furious customer demanding to see the manager and pounded on ${v}'s door. ${p.His} heart couldn't take it.`,
    miss: (v, p) => `You screamed at ${v}'s front door for an hour. ${p.He} filed a noise complaint.`,
    backfireText: (v) => `${v} had sold the house. The new owner flung the door open and screamed at you so ferociously that your heart gave out.`,
  },
  {
    id: 'poison', label: 'Poison Them', emoji: '\u{1F9EA}', success: 0.55, cops: 0.3, backfire: 0.08, playerCause: 'Poisoned',
    win: (v) => `You slipped rat poison into ${v}'s iced tea. ${v} said it was the sweetest tea ${'they'} ever had. It was also the last.`,
    miss: (v, p) => `You spiked ${v}'s iced tea, but ${p.he} said it tasted funny and poured it into a plant. The plant died.`,
    backfireText: (v) => `${v} saw you tamper with the iced tea and quietly swapped glasses. You drank the wrong one.`,
  },
  {
    id: 'beartrap', label: 'Bear Trap', emoji: '\u{1FAA4}', success: 0.2, cops: 0.25, backfire: 0.07, playerCause: 'Fell in a Bear Trap',
    win: (v) => `You spent all night digging a bear trap on ${v}'s morning walking route. ${v} strolled right into it.`,
    miss: (v) => `You dug a bear trap for ${v}, but a confused raccoon fell in instead.`,
    backfireText: (v) => `${v} watched you build the trap, then snuck up behind you and said "boo." You fell in head-first.`,
  },
  {
    id: 'laxative', label: 'Elephant Laxative', emoji: '\u{1F418}', success: 0.3, cops: 0.25, backfire: 0.07, playerCause: 'Elephant Laxative Overdose',
    win: (v) => `You snuck an elephant-strength laxative into ${v}'s morning coffee. Let's just say ${v} won't be needing breakfast anymore.`,
    miss: (v) => `You spiked ${v}'s coffee with elephant laxative. ${v} survived, but ${'their'} bathroom did not.`,
    backfireText: (v) => `${v} switched cups with you while you weren't looking. Elephant laxative is not meant for humans.`,
  },
  {
    id: 'cliff', label: 'Push Off a Cliff', emoji: '\u{1F3D4}\u{FE0F}', success: 0.7, cops: 0.25, backfire: 0.05, playerCause: 'Fell Off a Cliff',
    win: (v) => `You invited ${v} to enjoy a scenic view, then gave ${'them'} a gentle push. The view was breathtaking.`,
    miss: (v, p) => `You pushed ${v} toward the edge, but ${p.he} grabbed a tree branch and climbed back up, glaring at you.`,
    backfireText: (v) => `${v} grabbed your arm as you pushed and flung you over the edge first.`,
  },
  {
    id: 'impale', label: 'Impale Them', emoji: '\u{1F5E1}\u{FE0F}', success: 0.5, cops: 0.35, backfire: 0.05, playerCause: 'Impaled',
    win: (v) => `You jumped out of the bushes with a sharpened stake. ${v} never saw it coming.`,
    miss: (v, p) => `You lunged at ${v} with a stake and missed. ${p.He} ran screaming.`,
    backfireText: (v) => `${v} wrestled the stake away from you and used it on you instead.`,
  },
]

function victimFromPerson(p: Person): Victim {
  return { personId: p.id, name: fullName(p), gender: p.gender, age: p.age, family: isFamily(p), label: `your ${relationLabel(p).toLowerCase()} ${p.firstName}` }
}

function randomVictim(g: GameState): Victim {
  const gender: Gender = chance(g, 0.5) ? 'male' : 'female'
  const name = strangerName(g, gender)
  return { personId: null, name, gender, age: randInt(g, 18, 80), family: false, label: `a stranger named ${name}` }
}

/** A person in the player's life is murdered (by the player, a hitman or the mob). */
function killPerson(g: GameState, p: Person, cause: string): void {
  p.alive = false
  p.causeOfDeath = cause
  p.livesWithPlayer = false
  p.data.murdered = true
  p.data.diedAtPlayerAge = g.character.age
  const pr = pronouns(p.gender)
  if (isFamily(p)) {
    for (const o of g.people) if (o.alive && o.id !== p.id && isFamily(o)) addPersonStat(o, 'happiness', -randInt(g, 10, 25))
  }
  log(g, `My ${relationLabel(p).toLowerCase()} ${p.firstName} died at the age of ${p.age}. ${pr.He} was murdered.`, 'bad')
}

const MURDER_SCRIPT = defineScript('crime.murder.method', (g, choice, data) => {
  if (!canAct(g) || !isRecord(data) || choice === 'cancel') return
  const method = MURDER_METHODS.find((m) => m.id === choice)
  const vRaw = data.victim
  if (!method || !isRecord(vRaw)) return
  const victim = vRaw as unknown as Victim
  const person = victim.personId ? getPerson(g, victim.personId) : undefined
  if (victim.personId && (!person || !person.alive)) return
  const purpose = str(data.purpose, 'murder')
  attemptMurder(g, victim, person ?? null, method, purpose)
})

function attemptMurder(g: GameState, victim: Victim, person: Person | null, method: MurderMethod, purpose: string): void {
  const c = g.character
  const pr = pronouns(victim.gender)
  const first = victim.name.split(' ')[0]
  const v = victim.personId ? first : victim.name
  remember(g, `Tried to murder ${victim.label} (${method.label.toLowerCase()}).`)

  // Backfire: the victim turns the tables.
  if (chance(g, method.backfire)) {
    commitCrime(g, 'Attempted Murder', { karma: 15, notoriety: 5, heat: 0 })
    if (person) {
      person.relationship = 0
      notePerson(person, 'I tried to murder them and it backfired.')
    }
    if (chance(g, 0.5)) {
      notice(g, 'Backfire', method.backfireText(v, pr), { emoji: '\u{1F480}', tone: 'bad' })
      killCharacter(g, method.playerCause)
      return
    }
    const dmg = hurt(g, randInt(g, 15, 35))
    outcome(g, 'Backfire', `${method.backfireText(v, pr).replace(/\.$/, '')}, but you somehow survived. (-${dmg} health)`, '\u{1F915}', 'bad')
    return
  }

  let p = method.success + (c.hidden.craziness - 50) / 400
  if (method.id === 'scare') p += victim.family ? -0.05 : 0.12 + Math.max(0, victim.age - 60) / 200
  if (person) p += (100 - person.stats.health) / 400
  const success = chance(g, clamp(p + crimeEdge(g), 0.03, 0.95))

  if (success) {
    const idx = commitCrime(g, 'Murder', { karma: 30, notoriety: 12, heat: 0.5 })
    count(g, 'murders')
    if (person) killPerson(g, person, 'Murdered')
    else log(g, `I murdered ${victim.name}.`, 'bad')
    const extra = person && victim.family ? ` Your ${relationLabel(person).toLowerCase()} ${person.firstName} died at the age of ${person.age}.` : ''
    const caught = chance(g, clamp((method.cops + (victim.family ? 0.1 : 0) - (c.stats.smarts - 50) / 500) * caughtMult(g), 0.03, 0.9))
    if (purpose === 'made') madeYourBones(g)
    if (caught) {
      arrestPlayer(g, 'Murder', 5, {
        recordIndex: idx,
        evidence: 0.85,
        violent: 'murder',
        victimId: person?.id,
        context: `${method.win(v, pr)}${extra} Unfortunately, a witness called the police. You're under arrest for murder.`,
      })
      return
    }
    outcome(g, 'Murder', `${method.win(v, pr)}${extra} Nobody saw a thing.`, method.emoji, 'bad')
    return
  }

  const idx = commitCrime(g, 'Attempted Murder', { karma: 20, notoriety: 6, heat: 0.3 })
  if (person) {
    person.relationship = Math.min(person.relationship, randInt(g, 0, 10))
    notePerson(person, `I tried to murder ${pr.him} (${method.label.toLowerCase()}).`)
  }
  const roll = rand(g)
  if (roll < 0.4) {
    arrestPlayer(g, 'Attempted Murder', 4, {
      recordIndex: idx,
      evidence: 0.8,
      violent: 'attempted',
      victimId: person?.id,
      context: `${method.miss(v, pr)} ${titleCase(pr.he)} called the police. You're under arrest for attempted murder.`,
    })
    return
  }
  if (roll < 0.7) {
    const dmg = hurt(g, randInt(g, 10, 30))
    log(g, `I tried to murder ${victim.label} and got beaten up.`, 'bad')
    outcome(g, 'Failed', `${method.miss(v, pr)} Then ${pr.he} beat you within an inch of your life. (-${dmg} health)`, '\u{1F915}', 'bad')
    return
  }
  log(g, `I tried to murder ${victim.label}, but failed.`, 'bad')
  outcome(g, 'Failed', `${method.miss(v, pr)} You fled before anyone could call the police.`, method.emoji, 'bad')
}

function offerMurderMethods(g: GameState, victim: Victim, purpose: string): void {
  const available = MURDER_METHODS.filter((m) => !m.requires || m.requires(g))
  const offered = shuffle(g, available).slice(0, 6)
  const title = purpose === 'made' ? 'Make Your Bones' : 'Murder'
  scriptChoice(g, MURDER_SCRIPT, title, `How will you kill ${victim.label}?`, [
    ...offered.map((m) => ({ id: m.id, label: m.label, emoji: m.emoji })),
    { id: 'cancel', label: 'Never mind', emoji: '\u{1F54A}\u{FE0F}' },
  ], { emoji: '\u{1F52A}', data: { victim: victim as unknown as Json, purpose } })
}

function murderTarget(p: Person): MenuAction {
  return {
    type: 'action',
    id: `crime.murder.${p.id}`,
    label: fullName(p),
    emoji: '\u{1F464}',
    subtitle: `${relationLabel(p)} · Age ${p.age}`,
    run: (g) => {
      const person = getPerson(g, p.id)
      if (!canAct(g) || !person || !person.alive || !lieLow(g, 'crime.murder', 3)) return
      offerMurderMethods(g, victimFromPerson(person), 'murder')
    },
  }
}

const murderMenu: MenuGroup = {
  type: 'menu',
  id: 'crime.murder',
  label: 'Murder',
  emoji: '\u{1F52A}',
  subtitle: 'Kill someone',
  disabledReason: ageGate(14),
  header: () => 'Choose your victim. If you get caught, expect to spend the rest of your life in prison, or worse.',
  children: (g) => [
    {
      type: 'action',
      id: 'crime.murder.stranger',
      label: 'A Random Stranger',
      emoji: '\u{1F3B2}',
      run: (gg) => {
        if (!canAct(gg) || !lieLow(gg, 'crime.murder', 3)) return
        offerMurderMethods(gg, randomVictim(gg), 'murder')
      },
    },
    ...targetablePeople(g).map(murderTarget),
  ],
}

// ---------------------------------------------------------------------------
// Hire a Hitman (age 18+): once a year

const HITMAN_NAMES = ['The Accountant', 'Mister Whiskers', 'Silent Sally', 'The Florist', 'Granny Nightshade', 'Big Lenny', 'Velvet', 'The Dentist', 'Knuckles McGee', 'The Librarian', 'Madame Noir', 'The Ghost', 'Uncle Ricochet', 'The Tooth Fairy']

interface Hitman {
  id: string
  name: string
  price: number
  skill: number
  scam: number
}

const HITMAN_DEMAND = defineScript('crime.hitman.demand', (g, choice, data) => {
  if (!canAct(g) || !isRecord(data)) return
  const name = str(data.name, 'The hitman')
  const extra = num(data.extra)
  if (choice === 'pay') {
    if (spend(g, extra, 'crime.cost')) {
      if (chance(g, 0.1)) {
        const dmg = hurt(g, randInt(g, 15, 35))
        outcome(g, 'Hitman', `${name} took the extra ${formatMoney(extra)}, then roughed you up anyway "for the principle of it." (-${dmg} health)`, '\u{1F915}', 'bad')
        return
      }
      log(g, `I paid ${name} an extra ${formatMoney(extra)} to go away.`, 'neutral')
      outcome(g, 'Hitman', `${name} counted the extra ${formatMoney(extra)}, tipped an imaginary hat, and vanished into the night.`, '\u{1F3A9}')
      return
    }
    notice(g, 'Hitman', `You don't have ${formatMoney(extra)}. ${name} does not take IOUs.`, { emoji: '\u{1F4B8}', tone: 'bad' })
  }
  if (choice === 'cops') {
    log(g, `I called the police on ${name}.`, 'bad')
    arrestPlayer(g, 'Conspiracy to Commit Murder', 4, { evidence: 0.85, noResist: true, context: `The police arrested both you and ${name}.` })
    return
  }
  const evade = (choice === 'run' ? 0.6 : choice === 'deal' ? 0.5 : 0.3) + crimeEdge(g)
  if (chance(g, evade)) {
    log(g, `I stood up to ${name} and lived.`, 'event')
    outcome(g, 'Hitman', choice === 'deal' ? `You told ${name} that a deal's a deal. ${name} thought about it, shrugged, and apologized.` : `You ran and never looked back. ${name} lost your trail.`, '\u{1F3C3}', 'good')
    return
  }
  if (chance(g, 0.2)) {
    notice(g, 'Hitman', `${name} doesn't negotiate. You became ${name}'s next job.`, { emoji: '\u{1F480}', tone: 'bad' })
    killCharacter(g, 'Murdered by a Hitman')
    return
  }
  const dmg = hurt(g, randInt(g, 20, 45))
  log(g, `${name} attacked me.`, 'bad')
  outcome(g, 'Hitman', `${name} attacked you and left you bleeding in an alley. (-${dmg} health)`, '\u{1F915}', 'bad')
})

const HITMAN_SCRIPT = defineScript('crime.hitman.pick', (g, choice, data) => {
  if (!canAct(g) || !isRecord(data) || choice === 'cancel') return
  const hitmen = Array.isArray(data.hitmen) ? data.hitmen : []
  const raw = hitmen.find((h) => isRecord(h) && h.id === choice)
  const vRaw = data.victim
  if (!isRecord(raw) || !isRecord(vRaw)) return
  const h = raw as unknown as Hitman
  const victim = vRaw as unknown as Victim
  const person = victim.personId ? getPerson(g, victim.personId) : undefined
  if (victim.personId && (!person || !person.alive)) return
  if (chance(g, 0.1)) {
    arrestPlayer(g, 'Conspiracy to Commit Murder', 4, { evidence: 0.9, noResist: true, context: `"${h.name}" was an undercover cop. The handcuffs came out before the money did.` })
    return
  }
  if (!spend(g, h.price, 'crime.cost')) {
    notice(g, "Can't Afford It", `${h.name} wants ${formatMoney(h.price)} up front. You don't have it.`, { emoji: '\u{1F4B8}' })
    return
  }
  if (chance(g, h.scam)) {
    log(g, `A hitman named ${h.name} took my money and disappeared.`, 'bad')
    outcome(g, 'Scammed', `${h.name} took your ${formatMoney(h.price)} and was never heard from again. You can't exactly report it to the police.`, '\u{1F4B8}', 'bad')
    return
  }
  if (!chance(g, h.skill)) {
    commitCrime(g, 'Conspiracy to Commit Murder', { karma: 15, notoriety: 4, heat: 0.2 })
    if (person) notePerson(person, 'Someone tried to have them killed.')
    log(g, `The hitman I hired botched the job.`, 'bad')
    outcome(g, 'Botched', `${h.name} botched the job. ${victim.label.charAt(0).toUpperCase() + victim.label.slice(1)} survived with a nasty scare. No refunds.`, '\u{1F937}', 'bad')
    return
  }
  commitCrime(g, 'Contract Killing', { karma: 30, notoriety: 8, heat: 0.25 })
  count(g, 'murders')
  count(g, 'hits')
  if (person) killPerson(g, person, 'Murdered')
  else log(g, `I had ${victim.name} killed.`, 'bad')
  const extra = Math.round(h.price * (0.5 + rand(g) * 0.5))
  const done = `${h.name} called with two words: "It's done." ${victim.label.charAt(0).toUpperCase() + victim.label.slice(1)} is dead.`
  if (chance(g, 0.2)) {
    scriptChoice(g, HITMAN_DEMAND, 'Hitman', `${done} Then ${h.name} demanded another ${formatMoney(extra)}, "or else."`, [
      { id: 'pay', label: `Pay ${formatMoney(extra)}`, emoji: '\u{1F4B5}' },
      { id: 'deal', label: '"A deal\'s a deal."', emoji: '\u{1F91D}' },
      { id: 'run', label: 'Run away', emoji: '\u{1F3C3}' },
      { id: 'cops', label: 'Call the police', emoji: '\u{1F46E}' },
    ], { emoji: '\u{1F3A9}', data: { name: h.name, extra } })
    return
  }
  outcome(g, 'Contract Killing', done, '\u{1F3A9}', 'bad')
})

function hitmanOffer(g: GameState, victim: Victim): void {
  log(g, 'I had diabolical thoughts.', 'bad')
  const names = shuffle(g, HITMAN_NAMES).slice(0, 3)
  const hitmen: Hitman[] = names.map((name, i) => ({
    id: `h${i}`,
    name,
    price: cash(g, [randInt(g, 15000, 30000), randInt(g, 40000, 80000), randInt(g, 100000, 200000)][i]),
    skill: [0.55, 0.72, 0.88][i],
    scam: [0.3, 0.15, 0.05][i],
  }))
  scriptChoice(g, HITMAN_SCRIPT, 'Hire a Hitman', `Through a friend of a friend of a cousin, you found three contract killers willing to take care of ${victim.label}. You get what you pay for.`, [
    ...hitmen.map((h, i) => ({ id: h.id, label: `${h.name} (${formatMoney(h.price)})`, emoji: ['\u{1F3AD}', '\u{1F3A9}', '\u{1F5A4}'][i] })),
    { id: 'cancel', label: 'Never mind', emoji: '\u{1F54A}\u{FE0F}' },
  ], { emoji: '\u{1F3AF}', data: { victim: victim as unknown as Json, hitmen: hitmen as unknown as Json } })
}

const hitmanMenu: MenuGroup = {
  type: 'menu',
  id: 'crime.hitman',
  label: 'Hire a Hitman',
  emoji: '\u{1F3AF}',
  subtitle: 'Let a professional handle it',
  disabledReason: (g) => blocked(g, 18) ?? (yearActionsUsed(g, 'crime.hitman') >= 1 ? 'You already hired a hitman this year. Patience.' : null),
  header: () => 'Hitmen are expensive, and not all of them are honest. Some are cops.',
  children: (g) => [
    {
      type: 'action',
      id: 'crime.hitman.stranger',
      label: 'A Random Stranger',
      emoji: '\u{1F3B2}',
      run: (gg) => {
        if (!canAct(gg) || !lieLow(gg, 'crime.hitman', 1)) return
        hitmanOffer(gg, randomVictim(gg))
      },
    },
    ...targetablePeople(g).map(
      (p): MenuAction => ({
        type: 'action',
        id: `crime.hitman.${p.id}`,
        label: fullName(p),
        emoji: '\u{1F464}',
        subtitle: `${relationLabel(p)} · Age ${p.age}`,
        run: (gg) => {
          const person = getPerson(gg, p.id)
          if (!canAct(gg) || !person || !person.alive || !lieLow(gg, 'crime.hitman', 1)) return
          hitmanOffer(gg, victimFromPerson(person))
        },
      }),
    ),
  ],
}

// ---------------------------------------------------------------------------
// Embezzlement (age 16+, needs a full-time job)

const EMBEZZLE_AMOUNTS: { id: string; label: string; share: number; risk: number }[] = [
  { id: 'teeny', label: 'A teeny bit', share: 0.01, risk: 0.04 },
  { id: 'little', label: 'A little', share: 0.04, risk: 0.1 },
  { id: 'decent', label: 'A decent amount', share: 0.12, risk: 0.22 },
  { id: 'lot', label: 'A lot', share: 0.35, risk: 0.4 },
  { id: 'awful', label: 'An awful lot', share: 1, risk: 0.65 },
]
const EMBEZZLE_FLAG = 'embezzled'

function embezzleAmount(g: GameState, share: number): number {
  const salary = g.character.job?.salary ?? 0
  return Math.max(50, Math.round(salary * share))
}

function embezzleCaught(g: GameState, amount: number, big: boolean, recordIndex?: number): void {
  const c = g.character
  const company = c.job?.company ?? 'your employer'
  endJob(g, 'job', 'fired')
  count(g, 'fired')
  delete g.flags[EMBEZZLE_FLAG]
  log(g, `I was fired from ${company} for embezzlement.`, 'bad')
  if (chance(g, 0.55)) {
    arrestPlayer(g, 'Embezzlement', big ? 3 : 2, { recordIndex, evidence: 0.9, context: `An audit at ${company} found ${formatMoney(amount)} missing, and it led straight to you. HR fired you and called the police.` })
    return
  }
  outcome(g, 'Fired', `An audit at ${company} found ${formatMoney(amount)} missing. HR fired you on the spot and had security escort you out with a cardboard box. The company decided not to press charges to avoid bad press.`, '\u{1F4E6}', 'bad')
}

const EMBEZZLE_SCRIPT = defineScript('crime.embezzle', (g, choice) => {
  const c = g.character
  if (!canAct(g) || !c.job || choice === 'cancel') return
  const opt = EMBEZZLE_AMOUNTS.find((a) => a.id === choice)
  if (!opt) return
  const amount = embezzleAmount(g, opt.share)
  const idx = commitCrime(g, 'Embezzlement', { karma: 5, notoriety: 2, heat: 0 })
  if (chance(g, clamp((opt.risk - (c.stats.smarts - 50) / 400) * caughtMult(g), 0.02, 0.85))) {
    embezzleCaught(g, amount, opt.share >= 0.35, idx)
    return
  }
  const got = pocket(g, amount)
  const prev = isRecord(g.flags[EMBEZZLE_FLAG]) ? num((g.flags[EMBEZZLE_FLAG] as { [key: string]: Json }).amount) : 0
  g.flags[EMBEZZLE_FLAG] = { amount: prev + amount, company: c.job.company, record: idx }
  log(g, `I embezzled ${formatMoney(got)} from ${c.job.company}.`, 'event')
  outcome(g, 'Embezzlement', pickSite(g, [
    `You quietly moved ${formatMoney(amount)} from ${c.job.company}'s accounts into yours. Nobody noticed. Yet.`,
    `A few creative spreadsheet entries later, ${formatMoney(amount)} of ${c.job.company}'s money is now yours.`,
  ], 0xf92afcb0), '\u{1F4CA}', 'good')
})

const embezzleAction: MenuAction = {
  type: 'action',
  id: 'crime.embezzle',
  label: 'Embezzle',
  emoji: '\u{1F4CA}',
  subtitle: 'Skim money from your employer',
  disabledReason: (g) => blocked(g, 16) ?? (!g.character.job ? 'You need a full-time job to embezzle.' : null),
  run: (g) => {
    if (!canAct(g) || !g.character.job || !lieLow(g, 'crime.embezzle', 2)) return
    scriptChoice(g, EMBEZZLE_SCRIPT, 'Embezzle', `How much do you want to skim from ${g.character.job.company}?`, [
      ...EMBEZZLE_AMOUNTS.map((a) => ({ id: a.id, label: `${a.label} (${formatMoney(embezzleAmount(g, a.share))})`, emoji: '\u{1F4B8}' })),
      { id: 'cancel', label: 'Never mind', emoji: '\u{1F645}' },
    ], { emoji: '\u{1F4CA}' })
  },
}

// ---------------------------------------------------------------------------
// Cybercrime (age 13+): hack people or companies

/** Hacks, each with the era gates it needs (events/era.ts): no social media to hijack before social media. */
const PERSON_HACKS: { id: string; label: string; emoji: string; difficulty: number; crime: string; era?: string }[] = [
  { id: 'social', label: 'Hack their social media', emoji: '\u{1F4F1}', difficulty: 0, crime: 'Computer Fraud', era: '+socialMedia' },
  { id: 'identity', label: 'Steal their identity', emoji: '\u{1FAAA}', difficulty: 0.08, crime: 'Identity Theft', era: 'creditCards' },
  { id: 'bank', label: 'Drain their bank account', emoji: '\u{1F3E6}', difficulty: 0.15, crime: 'Wire Fraud', era: '1998' },
  { id: 'ransom', label: 'Lock their computer with ransomware', emoji: '\u{1F512}', difficulty: 0.1, crime: 'Computer Fraud', era: '2005' },
  { id: 'leak', label: 'Leak their private messages', emoji: '\u{1F4E8}', difficulty: 0.05, crime: 'Computer Fraud' },
]
const CORP_HACKS: { id: string; label: string; emoji: string; difficulty: number; crime: string; era?: string }[] = [
  { id: 'ransomware', label: 'Launch a ransomware attack', emoji: '\u{1F512}', difficulty: 0.25, crime: 'Computer Fraud', era: '2010' },
  { id: 'breach', label: 'Steal and sell customer data', emoji: '\u{1F4BE}', difficulty: 0.2, crime: 'Identity Theft' },
  { id: 'crypto', label: 'Raid their crypto wallet', emoji: '\u{1FA99}', difficulty: 0.3, crime: 'Wire Fraud', era: '+crypto' },
]

function hackFits(g: GameState, era?: string): boolean {
  return !era || era.split(',').every((t) => gateHolds(g, t.trim()))
}
const CORPS = ['MegaMart', 'Globex Logistics', 'Nimbus Cloud', 'Pinnacle Insurance', 'Quantum Burger', 'Hyperion Bank', 'Zentrix Pharma', 'Starlight Airlines']

const CYBER_SCRIPT = defineScript('crime.cyber', (g, choice, data) => {
  const c = g.character
  if (!canAct(g) || !isRecord(data) || choice === 'cancel') return
  const corp = data.corp === true
  const hack = (corp ? CORP_HACKS : PERSON_HACKS).find((h) => h.id === choice)
  if (!hack) return
  const target = str(data.target, 'someone')
  const person = getPerson(g, str(data.personId) || undefined)
  const p = clamp(0.2 + c.stats.smarts / 140 - hack.difficulty + crimeEdge(g) + (hasTalent(g, 'Programming') ? 0.08 : 0), 0.05, 0.9)
  const success = chance(g, p)
  const idx = commitCrime(g, hack.crime, { karma: 4, notoriety: 2, heat: 0.1 })
  count(g, 'hacks')
  if (!success) {
    if (chance(g, 0.4)) {
      arrestPlayer(g, hack.crime, CRIME_SEVERITY[hack.crime] ?? 2, { recordIndex: idx, evidence: 0.75, context: `Your hack on ${target} failed spectacularly, and the cybercrime unit traced it back to your IP address.` })
      return
    }
    log(g, `I tried to hack ${target} and failed.`, 'bad')
    outcome(g, 'Access Denied', pickSite(g, [`You typed furiously for six hours. ${target}'s security held. You did learn a lot about firewalls.`, `Your hack on ${target} crashed your own computer instead.`], 0x45e560f2), '\u{1F6AB}', 'bad')
    return
  }
  let money = 0
  let text = ''
  if (corp) {
    const ranges: Record<string, [number, number]> = { ransomware: [20000, 500000], breach: [10000, 150000], crypto: [5000, 250000] }
    const [lo, hi] = ranges[hack.id] ?? [5000, 50000]
    money = cash(g, randInt(g, lo, hi))
    const paidIn = exists(g, 'crypto') ? 'in crypto' : 'by wire transfer'
    const buyer = g.year >= 2005 ? 'on the dark web' : 'to a shady data broker'
    text = hack.id === 'ransomware' ? `${target}'s servers locked up and their IT department paid ${formatMoney(money)} ${paidIn} to get them back.` : hack.id === 'breach' ? `You siphoned ${g.year >= 2005 ? 'millions of' : 'thousands of'} customer records from ${target} and sold them ${buyer} for ${formatMoney(money)}.` : `You cracked ${target}'s crypto wallet and transferred ${formatMoney(money)} to yourself.`
  } else if (hack.id === 'social') {
    addStat(g, 'happiness', randInt(g, 3, 8))
    if (person) {
      addRelationship(person, -randInt(g, 5, 15))
      addPersonStat(person, 'happiness', -randInt(g, 5, 15))
    }
    text = `You got into ${target}'s account and posted ${pickLine(g, ['a love letter to a lamppost', 'twelve photos of feet', 'that pineapple belongs on pizza', 'a public apology to a pigeon'])}. Chaos ensued.`
  } else if (hack.id === 'leak') {
    if (person) {
      addRelationship(person, -randInt(g, 5, 15))
      addPersonStat(person, 'happiness', -randInt(g, 10, 20))
    }
    addStat(g, 'happiness', randInt(g, 2, 6))
    text = `You leaked ${target}'s private messages. Turns out ${pick(g, ['they have a secret fan account for a soap opera', 'they talk to their cat in baby voice', 'they have been feuding with a neighbor over a hedge for years', texting(g) ? 'they still text their ex at 3 a.m.' : 'they still write their ex long letters at 3 a.m.'])}.`
  } else {
    const base = hack.id === 'bank' ? 0.4 : hack.id === 'identity' ? 0.2 : 0.05
    const wealth = person ? Math.max(0, person.money) : randInt(g, 2000, 60000)
    money = Math.round(Math.min(wealth * base, cash(g, hack.id === 'bank' ? 100000 : 20000)))
    if (hack.id === 'ransom') money = Math.max(money, cash(g, randInt(g, 300, 3000)))
    if (person) {
      personCash(g, person, -money, 'crime.take', 0)
      addPersonStat(person, 'happiness', -randInt(g, 5, 15))
    }
    text =
      hack.id === 'bank'
        ? `You phished ${target}'s banking password and wired ${formatMoney(money)} to an offshore account.`
        : hack.id === 'identity'
          ? `You opened credit cards in ${target}'s name and maxed them out for ${formatMoney(money)}.`
          : `You locked ${target}'s computer with ransomware. They paid ${formatMoney(money)} to get their photos back.`
  }
  const got = money > 0 ? pocket(g, money) : 0
  log(g, money > 0 ? `I hacked ${target} and got ${formatMoney(got)}.` : `I hacked ${target}.`, 'event')
  if (chance(g, 0.12)) {
    arrestPlayer(g, hack.crime, CRIME_SEVERITY[hack.crime] ?? 2, { recordIndex: idx, evidence: 0.65, context: `${text} A week later, the cybercrime unit kicked down your door.` })
    return
  }
  outcome(g, 'Hacked', text, hack.emoji, 'good')
})

function cyberTarget(g: GameState, label: string, personId: string | null, corp: boolean): void {
  const hacks = (corp ? CORP_HACKS : PERSON_HACKS).filter((h) => hackFits(g, h.era))
  scriptChoice(g, CYBER_SCRIPT, 'Cybercrime', `You crack your knuckles and open a terminal. Target: ${label}. What's the plan?`, [
    ...hacks.map((h) => ({ id: h.id, label: h.label, emoji: h.emoji })),
    { id: 'cancel', label: 'Never mind', emoji: '\u{1F645}' },
  ], { emoji: '\u{1F4BB}', data: { target: label, personId: personId ?? '', corp } })
}

const cyberMenu: MenuGroup = {
  type: 'menu',
  id: 'crime.cyber',
  label: 'Cybercrime',
  emoji: '\u{1F4BB}',
  subtitle: 'Hack friends, family and randos',
  // No hacking before the internet reaches your country (and home computers with it).
  visible: (g) => exists(g, 'internet') && exists(g, 'homeComputer'),
  disabledReason: ageGate(13),
  header: () => 'Smarter hackers succeed more often. Corporations pay more but fight back harder.',
  children: (g) => [
    {
      type: 'action',
      id: 'crime.cyber.corp',
      label: 'A Big Corporation',
      emoji: '\u{1F3E2}',
      run: (gg) => {
        if (!canAct(gg) || !lieLow(gg, 'crime.cyber', 3)) return
        cyberTarget(gg, pickLine(gg, CORPS), null, true)
      },
    },
    {
      type: 'action',
      id: 'crime.cyber.stranger',
      label: 'A Random Stranger',
      emoji: '\u{1F3B2}',
      run: (gg) => {
        if (!canAct(gg) || !lieLow(gg, 'crime.cyber', 3)) return
        cyberTarget(gg, strangerName(gg, chance(gg, 0.5) ? 'male' : 'female'), null, false)
      },
    },
    ...targetablePeople(g).map(
      (p): MenuAction => ({
        type: 'action',
        id: `crime.cyber.${p.id}`,
        label: fullName(p),
        emoji: '\u{1F464}',
        subtitle: relationLabel(p),
        run: (gg) => {
          const person = getPerson(gg, p.id)
          if (!canAct(gg) || !person || !person.alive || !lieLow(gg, 'crime.cyber', 3)) return
          cyberTarget(gg, `${person.firstName} (your ${relationLabel(person).toLowerCase()})`, person.id, false)
        },
      }),
    ),
  ],
}

// ---------------------------------------------------------------------------
// Organized crime: join a crime family, rise from Associate to the top

type FamilyKind = 'Mafia' | 'Irish Mob' | 'Latin Mafia' | 'Russian Mafia' | 'Triad' | 'Yakuza'

const FAMILY_KINDS: { kind: FamilyKind; region: NameRegion; leader: [string, string]; captain: string; name: (last: string) => string }[] = [
  { kind: 'Mafia', region: 'italian', leader: ['Godfather', 'Godmother'], captain: 'Caporegime', name: (l) => `${l} Family` },
  { kind: 'Irish Mob', region: 'irish', leader: ['Godfather', 'Godmother'], captain: 'Captain', name: (l) => `${l} Crew` },
  { kind: 'Latin Mafia', region: 'hispanic', leader: ['Padrino', 'Padrina'], captain: 'Captain', name: (l) => `${l} Cartel` },
  { kind: 'Russian Mafia', region: 'slavic', leader: ['Czar', 'Czarina'], captain: 'Captain', name: (l) => `${l} Bratva` },
  { kind: 'Triad', region: 'chinese', leader: ['Chairman', 'Chairwoman'], captain: 'Captain', name: () => '' },
  { kind: 'Yakuza', region: 'japanese', leader: ['Chairman', 'Chairwoman'], captain: 'Captain', name: (l) => `${l}-gumi` },
]
const TRIAD_NAMES = ['Golden Dragon Triad', 'Red Lotus Triad', 'Jade Tiger Triad', 'Black Lantern Triad', 'Silver Crane Triad']
const CALLING_CARDS = ['a broken pocket watch', 'a single black rose', 'a king chess piece snapped in half', 'a deck of cards with every ace torn out', 'a dead fish wrapped in newspaper', 'an empty birdcage', 'a red envelope with nothing inside']
const RANK_REQ = [0, 40, 55, 70, 90]
const RANK_PAY = [6000, 20000, 55000, 140000, 500000]

interface FamilyMember {
  id: string
  name: string
  gender: Gender
  rank: number
  rat: boolean
  alive: boolean
}

export interface CrimeFamily {
  name: string
  kind: FamilyKind
  /** 0 Associate, 1 Soldier, 2 Captain, 3 Underboss, 4 leader. */
  rank: number
  /** Standing within the family, 0-100. */
  standing: number
  years: number
  oath: boolean
  /** Money the family has paid you. */
  earnings: number
  card: string
  members: FamilyMember[]
  informant: { years: number; evidence: number } | null
  joinedAge: number
}

const FAMILY_FLAG = 'crimeFamily'
const CALLED_OUT_FLAG = 'mobGrudge'

/** The crime family the player belongs to, if any. */
export function crimeFamily(g: GameState): CrimeFamily | null {
  const raw = g.flags[FAMILY_FLAG]
  return isRecord(raw) ? (raw as unknown as CrimeFamily) : null
}

function familyKind(kind: FamilyKind) {
  return FAMILY_KINDS.find((k) => k.kind === kind) ?? FAMILY_KINDS[0]
}

export function familyRankTitle(fam: CrimeFamily, rank: number, gender: Gender): string {
  const k = familyKind(fam.kind)
  return ['Associate', 'Soldier', k.captain, 'Underboss', gender === 'male' ? k.leader[0] : k.leader[1]][clamp(rank, 0, 4)]
}

function familyMemberName(g: GameState, region: NameRegion, gender: Gender): string {
  const pool = NAME_POOLS[region] ?? NAME_POOLS.anglo
  const first = pick(g, gender === 'male' ? pool.male : pool.female)
  return `${first} ${pick(g, pool.last)}`
}

function makeFamily(g: GameState, kind: FamilyKind): CrimeFamily {
  const k = familyKind(kind)
  const pool = NAME_POOLS[k.region] ?? NAME_POOLS.anglo
  const name = kind === 'Triad' ? pick(g, TRIAD_NAMES) : k.name(pick(g, pool.last))
  const members: FamilyMember[] = []
  const ranks = [4, 3, 2, 2, 1, 1, 1]
  for (const rank of ranks) {
    const gender: Gender = chance(g, 0.8) ? 'male' : 'female'
    members.push({ id: uid(g, 'fm'), name: familyMemberName(g, k.region, gender), gender, rank, rat: false, alive: true })
  }
  if (chance(g, 0.4)) pick(g, members.filter((m) => m.rank < 4)).rat = true
  return { name: `The ${name}`, kind, rank: 0, standing: 20, years: 0, oath: false, earnings: 0, card: pick(g, CALLING_CARDS), members, informant: null, joinedAge: g.character.age }
}

function boss(fam: CrimeFamily): FamilyMember | undefined {
  return fam.members.find((m) => m.alive && m.rank === 4)
}

function superior(fam: CrimeFamily): FamilyMember | undefined {
  return fam.members.filter((m) => m.alive && m.rank > fam.rank).sort((a, b) => a.rank - b.rank)[0]
}

function leaveFamily(g: GameState): void {
  delete g.flags[FAMILY_FLAG]
}

function promote(g: GameState, fam: CrimeFamily, quiet = false): void {
  const c = g.character
  if (fam.rank >= 4) return
  fam.rank += 1
  if (fam.rank >= 1) fam.oath = true
  if (fam.rank === 4) {
    const b = boss(fam)
    if (b) b.alive = false
    count(g, 'godfather')
  } else {
    // Someone of the new rank steps aside so the hierarchy stays tidy.
    const peer = fam.members.find((m) => m.alive && m.rank === fam.rank && !m.rat)
    if (peer && fam.rank >= 3) peer.rank -= 1
  }
  const title = familyRankTitle(fam, fam.rank, c.gender)
  log(g, `I was promoted to ${title} of ${fam.name}.`, 'event')
  remember(g, `Became ${title} of ${fam.name}.`)
  if (!quiet) {
    outcome(g, 'Promoted', fam.rank === 4 ? `The old boss stepped aside. You are now the ${title} of ${fam.name}. Everyone kisses your ring.` : `You've been promoted to ${title} of ${fam.name}.`, '\u{1F574}\u{FE0F}', 'good')
  }
}

/** Called after a successful "make your bones" hit. */
function madeYourBones(g: GameState): void {
  const fam = crimeFamily(g)
  if (!fam || fam.rank >= 1) return
  fam.standing = clamp(fam.standing + 10)
  promote(g, fam, true)
  const made = g.character.gender === 'male' ? 'made man' : 'made woman'
  notice(g, 'Made', `You pricked your finger, burned a saint card in your palm, and swore the oath of silence. You're a ${made} and a Soldier of ${fam.name} now. There is no leaving.`, {
    emoji: '\u{1F525}',
    tone: 'event',
  })
}

const JOIN_SCRIPT = defineScript('crime.mafia.join', (g, choice, data) => {
  const c = g.character
  if (!canAct(g) || !isRecord(data) || choice === 'cancel' || crimeFamily(g)) return
  const opts = Array.isArray(data.kinds) ? data.kinds : []
  const opt = opts.find((o) => isRecord(o) && o.id === choice)
  if (!isRecord(opt)) return
  const kind = str(opt.kind) as FamilyKind
  if (!FAMILY_KINDS.some((k) => k.kind === kind)) return
  const p = clamp(0.25 + c.hidden.notoriety / 200 + Math.min(counter(g, 'crimes'), 20) / 50 + (counter(g, 'murders') > 0 ? 0.1 : 0) + crimeEdge(g), 0.1, 0.9)
  if (!chance(g, p)) {
    log(g, `The ${str(opt.name)} turned me away.`, 'bad')
    notice(g, 'Rejected', pickSite(g, [`The ${str(opt.name)} don't know you from Adam. Come back when your name means something on the street.`, `A man in a nice suit told you the ${str(opt.name)} "aren't hiring." Then he laughed for a long time.`], 0xafcdcd7c), {
      emoji: '\u{1F645}',
      tone: 'bad',
    })
    return
  }
  const fam = makeFamily(g, kind)
  fam.name = `The ${str(opt.name)}`
  g.flags[FAMILY_FLAG] = fam as unknown as Json
  count(g, 'mafiaJoined')
  log(g, `I joined ${fam.name} as an Associate.`, 'event')
  remember(g, `Joined ${fam.name}, a ${fam.kind} family.`)
  const b = boss(fam)
  outcome(g, 'Welcome to the Family', `${b ? `${b.name}, the ${familyRankTitle(fam, 4, b.gender)},` : 'The boss'} looked you over and nodded. You're an Associate of ${fam.name} now. Do what you're told, kick up your earnings, and never talk to the cops.`, '\u{1F574}\u{FE0F}', 'event')
})

const joinFamilyAction: MenuAction = {
  type: 'action',
  id: 'crime.mafia.join',
  label: 'Join a Crime Family',
  emoji: '\u{1F91D}',
  subtitle: (g) => (counter(g, 'crimes') < 5 ? `Needs 5+ crimes (you have ${counter(g, 'crimes')})` : 'Ask around for an introduction'),
  disabledReason: (g) => blocked(g, 18) ?? (counter(g, 'crimes') < 5 ? 'Nobody in the underworld knows your name yet. Commit at least 5 crimes first.' : null),
  run: (g) => {
    if (!canAct(g) || crimeFamily(g) || !lieLow(g, 'crime.mafiaJoin', 1)) return
    const kinds = shuffle(g, FAMILY_KINDS).slice(0, 3)
    const options = kinds.map((k, i) => {
      const pool = NAME_POOLS[k.region] ?? NAME_POOLS.anglo
      const name = k.kind === 'Triad' ? pick(g, TRIAD_NAMES) : k.name(pick(g, pool.last))
      return { id: `f${i}`, kind: k.kind, name }
    })
    scriptChoice(g, JOIN_SCRIPT, 'Organized Crime', 'You put the word out that you are looking for "work." Three families are willing to meet you. Which one will you ask to join?', [
      ...options.map((o) => ({ id: o.id, label: `The ${o.name} (${o.kind})`, emoji: '\u{1F574}\u{FE0F}' })),
      { id: 'cancel', label: 'Never mind', emoji: '\u{1F645}' },
    ], { emoji: '\u{1F574}\u{FE0F}', data: { kinds: options } })
  },
}

// --- Extortion -------------------------------------------------------------

/** Shops to shake down (era tags as in events/era.ts). */
const BUSINESSES = ['@1950 pizzeria', '@1934 laundromat', '@1980 nail salon', 'pawn shop', '@1925 nightclub', 'bakery', '@1940 car wash', 'corner deli', 'dry cleaner', 'tattoo parlor', '@1920 used car lot', 'bowling alley', '@-1960 barbershop', '@-1950 ice house', '@-1934 speakeasy']

const EXTORT_OFFER = 'crime.extort.offer'

function extortPaid(g: GameState, business: string, amount: number, how: string): void {
  const fam = crimeFamily(g)
  const got = pocket(g, amount)
  if (fam) fam.standing = clamp(fam.standing + randInt(g, 3, 7))
  addHidden(g, 'notoriety', 3)
  log(g, `I extorted ${formatMoney(got)} from a ${business}.`, 'event')
  outcome(g, 'Extortion', `${how} The owner of the ${business} handed over ${formatMoney(amount)}.`, '\u{1F4B0}', 'good')
}

function extortViolence(g: GameState, d: { [key: string]: Json }, choice: string): void {
  const business = str(d.business, 'shop')
  const owner = str(d.owner, 'The owner')
  const demand = num(d.demand)
  const idx = num(d.recordIndex, -1)
  const recordIndex = idx >= 0 ? idx : undefined
  const fam = crimeFamily(g)
  if (choice === 'whack') {
    const murderIdx = commitCrime(g, 'Murder', { karma: 25, notoriety: 10, heat: 0.3 })
    count(g, 'murders')
    if (fam) fam.standing = clamp(fam.standing + randInt(g, 4, 8))
    log(g, `I whacked the owner of a ${business}.`, 'bad')
    if (chance(g, 0.15)) {
      arrestPlayer(g, 'Murder', 5, { recordIndex: murderIdx, evidence: 0.8, violent: 'murder', context: `You whacked ${owner}, the owner of the ${business}, as a message to the neighborhood. Somebody talked.` })
      return
    }
    outcome(g, 'Whacked', `You whacked ${owner} right there behind the counter. No money, but every shop owner on the block got the message.`, '\u{26B0}\u{FE0F}', 'bad')
    return
  }
  // Shake down: beat them until they pay.
  addHidden(g, 'karma', -6)
  if (chance(g, 0.2)) {
    arrestPlayer(g, 'Extortion', 3, { recordIndex, evidence: 0.8, extraCharges: ['Assault'], context: `You roughed up ${owner}, but a customer walked in and called the police.` })
    return
  }
  if (chance(g, 0.7)) {
    extortPaid(g, business, demand, `You shook down ${owner} until ${pickLine(g, ['the cash register rattled', 'they saw the light', 'they found the money under the floorboards'])}.`)
    return
  }
  log(g, `I beat up the owner of a ${business}, but they still refused to pay.`, 'bad')
  outcome(g, 'Stubborn', `You put ${owner} in the hospital, but they still wouldn't pay. Respect, honestly.`, '\u{1F915}', 'bad')
}

defineScript(EXTORT_OFFER, (g, choice, data) => {
  if (!canAct(g) || !isRecord(data)) return
  if (choice === 'accept') {
    extortPaid(g, str(data.business, 'shop'), num(data.offer), 'You accepted the counteroffer.')
    return
  }
  extortViolence(g, data, choice)
})

const EXTORT_REFUSED = defineScript('crime.extort.refused', (g, choice, data) => {
  const c = g.character
  if (!canAct(g) || !isRecord(data)) return
  const business = str(data.business, 'shop')
  const owner = str(data.owner, 'The owner')
  const demand = num(data.demand)
  if (choice === 'leave') {
    const fam = crimeFamily(g)
    if (fam) fam.standing = clamp(fam.standing - 2)
    log(g, `I let the owner of a ${business} off the hook.`, 'neutral')
    notice(g, 'Walked Away', `You left ${owner} alone. The family won't love hearing about it.`, { emoji: '\u{1F6B6}' })
    return
  }
  if (choice === 'scare') {
    const fear = 0.45 + c.hidden.notoriety / 300
    if (chance(g, fear)) {
      const offer = Math.max(100, Math.round(demand * (0.4 + rand(g) * 0.3)))
      scriptChoice(g, EXTORT_OFFER, 'Extortion', `You ${pickLine(g, ['knocked over a display rack and smiled', 'mentioned how flammable the building looked', 'described their kids\' school route in great detail'])}. ${owner} went pale and offered ${formatMoney(offer)}, "all I have."`, [
        { id: 'accept', label: `Accept ${formatMoney(offer)}`, emoji: '\u{1F4B5}' },
        { id: 'shake', label: 'Shake them down', emoji: '\u{1F44A}' },
        { id: 'whack', label: 'Whack them', emoji: '\u{26B0}\u{FE0F}' },
      ], { emoji: '\u{1F4BC}', data: { ...data, offer } })
      return
    }
    if (chance(g, 0.3)) {
      arrestPlayer(g, 'Extortion', 3, { recordIndex: num(data.recordIndex, -1) >= 0 ? num(data.recordIndex) : undefined, evidence: 0.75, context: `${owner} wasn't scared at all. ${owner} hit the silent alarm under the counter.` })
      return
    }
    log(g, `I failed to scare the owner of a ${business}.`, 'bad')
    outcome(g, 'Not Scared', `${owner} laughed in your face and told you to get out. Your menacing glare needs work.`, '\u{1F612}', 'bad')
    return
  }
  extortViolence(g, data, choice)
})

const EXTORT_PICK = defineScript('crime.extort.pick', (g, choice, data) => {
  const c = g.character
  const fam = crimeFamily(g)
  if (!canAct(g) || !fam || !isRecord(data) || choice === 'cancel') return
  const list = Array.isArray(data.businesses) ? data.businesses : []
  const b = list.find((x) => isRecord(x) && x.id === choice)
  if (!isRecord(b)) return
  const business = str(b.business, 'shop')
  const owner = str(b.owner, 'The owner')
  const demand = num(b.demand)
  const idx = commitCrime(g, 'Extortion', { karma: 6, notoriety: 4, heat: 0.15 })
  const p = clamp(0.3 + c.hidden.notoriety / 250 + fam.rank * 0.06 + crimeEdge(g), 0.1, 0.85)
  if (chance(g, p)) {
    extortPaid(g, business, demand, `You walked into the ${business} and explained that ${fam.name} offers "protection."`)
    return
  }
  scriptChoice(g, EXTORT_REFUSED, 'Extortion', `You told ${owner}, the owner of the ${business}, that ${fam.name} expects ${formatMoney(demand)} for "protection." ${owner} refused to pay. What now?`, [
    { id: 'leave', label: 'Leave them alone', emoji: '\u{1F6B6}' },
    { id: 'scare', label: 'Scare them', emoji: '\u{1F47B}' },
    { id: 'shake', label: 'Shake them down', emoji: '\u{1F44A}' },
    { id: 'whack', label: 'Whack them', emoji: '\u{26B0}\u{FE0F}' },
  ], { emoji: '\u{1F4BC}', data: { business, owner, demand, recordIndex: idx } })
})

const extortAction: MenuAction = {
  type: 'action',
  id: 'crime.extort',
  label: 'Extortion',
  emoji: '\u{1F4BC}',
  subtitle: 'Shake down a local business for the family',
  visible: (g) => crimeFamily(g) !== null,
  disabledReason: (g) => blocked(g, 18) ?? (!crimeFamily(g) ? 'Only members of a crime family can run protection rackets.' : null),
  run: (g) => {
    if (!canAct(g) || !crimeFamily(g) || !lieLow(g, 'crime.extort', 3)) return
    const picks = shuffle(g, eraLines(g, BUSINESSES).filter((b) => b !== 'speakeasy' || prohibition(g))).slice(0, 3)
    const businesses = picks.map((business, i) => {
      const gender: Gender = chance(g, 0.5) ? 'male' : 'female'
      const big = business === 'nightclub' || business === 'used car lot' || business === 'speakeasy'
      return { id: `b${i}`, business, owner: strangerName(g, gender), demand: cash(g, big ? randInt(g, 10000, 50000) : randInt(g, 2000, 15000)) }
    })
    scriptChoice(g, EXTORT_PICK, 'Extortion', 'Which business needs some "protection"?', [
      ...businesses.map((b) => ({ id: b.id, label: `A ${b.business} (${formatMoney(b.demand)})`, emoji: '\u{1F3EA}' })),
      { id: 'cancel', label: 'Never mind', emoji: '\u{1F645}' },
    ], { emoji: '\u{1F4BC}', data: { businesses } })
  },
}

// --- Family actions ----------------------------------------------------------

const ORDER_SCRIPT = defineScript('crime.mafia.order', (g, choice, data) => {
  const fam = crimeFamily(g)
  if (!canAct(g) || !fam || !isRecord(data)) return
  const task = str(data.task, 'scare')
  const target = str(data.target, 'someone')
  const from = str(data.from, 'The boss')
  if (choice === 'excuse') {
    if (chance(g, 0.6)) {
      fam.standing = clamp(fam.standing - 2)
      log(g, `I made an excuse to get out of a job for ${fam.name}.`, 'neutral')
      notice(g, 'Excuse', `You told ${from} your ${pickLine(g, ['grandmother was sick', 'car broke down', 'dog ate the instructions', 'horoscope advised against it'])}. ${from} grunted and gave the job to someone else.`, { emoji: '\u{1F925}' })
    } else {
      fam.standing = clamp(fam.standing - 10)
      log(g, `${from} didn't buy my excuse.`, 'bad')
      notice(g, 'Nice Try', `${from} didn't buy your excuse for a second. Your standing in the family took a hit.`, { emoji: '\u{1F928}', tone: 'bad' })
    }
    return
  }
  if (choice === 'refuse') {
    fam.standing = clamp(fam.standing - 15)
    log(g, `I refused an order from ${fam.name}.`, 'bad')
    if (chance(g, fam.oath ? 0.3 : 0.15)) {
      if (fam.standing < 15 && chance(g, 0.25)) {
        notice(g, 'Whacked', `Nobody says no to ${fam.name}. ${from} sent two soldiers to make an example of you.`, { emoji: '\u{26B0}\u{FE0F}', tone: 'bad' })
        killCharacter(g, 'Whacked by the Mob')
        return
      }
      const dmg = hurt(g, randInt(g, 15, 35))
      outcome(g, 'Message Received', `A couple of guys from the family paid you a visit to "discuss" your refusal. (-${dmg} health)`, '\u{1F915}', 'bad')
      return
    }
    notice(g, 'Refused', `You told ${from} no. The room went very quiet.`, { emoji: '\u{1F610}', tone: 'bad' })
    return
  }
  if (choice === 'delegate') {
    if (chance(g, 0.7)) {
      fam.standing = clamp(fam.standing + randInt(g, 3, 6))
      log(g, `I had a soldier handle a job for ${fam.name}.`, 'neutral')
      notice(g, 'Delegated', `You passed the job to one of your guys. It got done. ${from} was satisfied.`, { emoji: '\u{1F44D}' })
    } else {
      fam.standing = clamp(fam.standing - 6)
      notice(g, 'Botched', `Your guy botched the job and told ${from} it was your idea.`, { emoji: '\u{1F926}', tone: 'bad' })
    }
    return
  }
  const odds: Record<string, number> = { spy: 0.85, scare: 0.75, shake: 0.65, whack: 0.55 }
  const copsOdds: Record<string, number> = { spy: 0.02, scare: 0.05, shake: 0.1, whack: 0.2 }
  const ok = chance(g, clamp((odds[task] ?? 0.6) + fam.standing / 400, 0.1, 0.95))
  if (task === 'whack') {
    const idx = commitCrime(g, ok ? 'Murder' : 'Attempted Murder', { karma: ok ? 25 : 15, notoriety: 8, heat: 0.2 })
    if (ok) count(g, 'murders')
    if (chance(g, copsOdds.whack)) {
      arrestPlayer(g, ok ? 'Murder' : 'Attempted Murder', ok ? 5 : 4, { recordIndex: idx, evidence: 0.8, violent: ok ? 'murder' : 'attempted', context: ok ? `You whacked ${target} on orders from ${from}, but a witness got your license plate.` : `You tried to whack ${target}, but ${target} got away and went straight to the police.` })
      return
    }
  } else if (task === 'shake' || task === 'scare') {
    const idx = commitCrime(g, task === 'shake' ? 'Assault' : 'Extortion', { karma: 5, notoriety: 3, heat: 0.1 })
    if (chance(g, copsOdds[task])) {
      arrestPlayer(g, task === 'shake' ? 'Assault' : 'Extortion', task === 'shake' ? 2 : 3, { recordIndex: idx, evidence: 0.7, context: `You were sent to ${task === 'shake' ? 'shake down' : 'scare'} ${target}, and the police happened to be driving by.` })
      return
    }
  }
  if (ok) {
    fam.standing = clamp(fam.standing + randInt(g, 8, 15))
    const done: Record<string, string> = {
      spy: `You tailed ${target} for a week and reported every move back to ${from}.`,
      scare: `You put the fear of God into ${target}. ${from} was pleased.`,
      shake: `You shook down ${target} until the money came out. ${from} was pleased.`,
      whack: `You whacked ${target}. ${from} kissed you on both cheeks.`,
    }
    log(g, `I completed a job for ${fam.name}.`, 'event')
    outcome(g, 'Job Done', done[task] ?? 'You did the job.', '\u{1F574}\u{FE0F}', 'good')
    if (fam.rank >= 1 && fam.rank < 3 && fam.standing >= RANK_REQ[fam.rank + 1] && chance(g, 0.3)) promote(g, fam)
    return
  }
  fam.standing = clamp(fam.standing - 5)
  log(g, `I botched a job for ${fam.name}.`, 'bad')
  outcome(g, 'Botched', `You botched the job on ${target}. ${from} is disappointed, and you do not want to disappoint ${from}.`, '\u{1F62C}', 'bad')
})

const PROMO_SCRIPT = defineScript('crime.mafia.bones', (g, choice) => {
  const fam = crimeFamily(g)
  if (!canAct(g) || !fam) return
  if (choice !== 'do') {
    log(g, 'I told the family I needed more time before making my bones.', 'neutral')
    return
  }
  offerMurderMethods(g, randomVictim(g), 'made')
})

const RIVAL_SCRIPT = defineScript('crime.mafia.rival', (g, choice, data) => {
  const fam = crimeFamily(g)
  if (!canAct(g) || !fam || !isRecord(data)) return
  const rival = str(data.rival, 'a rival')
  const other = str(data.family, 'a rival family')
  const odds: Record<string, number> = { attack: 0.55, reason: 0.45, beg: 0.35, run: 0.5 }
  if (chance(g, odds[choice] ?? 0.4)) {
    const text: Record<string, string> = {
      attack: `You struck first and put ${rival} in the hospital. Word spread fast.`,
      reason: `You talked ${rival} down. Turns out you both just want to get home for dinner.`,
      beg: `You begged for your life. ${rival} laughed, called you pathetic, and let you go.`,
      run: `You ran through three back alleys and a laundromat. ${rival} lost you.`,
    }
    if (choice === 'attack') {
      fam.standing = clamp(fam.standing + randInt(g, 6, 12))
      count(g, 'fights')
    }
    log(g, `I survived a run-in with ${rival} from ${other}.`, 'event')
    outcome(g, 'Rival', text[choice] ?? 'You survived.', '\u{1F4A2}', 'good')
    return
  }
  if (chance(g, 0.12)) {
    notice(g, 'Whacked', `${rival} from ${other} didn't give you a second chance.`, { emoji: '\u{26B0}\u{FE0F}', tone: 'bad' })
    killCharacter(g, 'Whacked by a Rival Family')
    return
  }
  const dmg = hurt(g, randInt(g, 15, 40))
  log(g, `${rival} from ${other} beat me up.`, 'bad')
  outcome(g, 'Rival', `${rival} from ${other} left you in a dumpster as a message to ${fam.name}. (-${dmg} health)`, '\u{1F915}', 'bad')
})

const EXPOSED_SCRIPT = defineScript('crime.mafia.exposed', (g, choice) => {
  const fam = crimeFamily(g)
  if (!canAct(g) || !fam) return
  const deathOdds = choice === 'deny' ? 0.25 : choice === 'admit' ? 0.35 : 0.3
  const survive = choice === 'deny' ? chance(g, 0.5) : choice === 'run' ? chance(g, 0.6) : false
  if (survive && choice === 'deny') {
    fam.standing = clamp(fam.standing - 10)
    log(g, 'I convinced the family I was not a rat.', 'event')
    notice(g, 'Denied', 'You swore on your mother\'s grave you were no rat. They believed you. For now.', { emoji: '\u{1F605}' })
    return
  }
  if (chance(g, deathOdds)) {
    notice(g, 'Rat', `${fam.name} found out you were wearing a wire. Rats don't get second chances.`, { emoji: '\u{1F400}', tone: 'bad' })
    killCharacter(g, 'Whacked by the Mob')
    return
  }
  const name = fam.name
  const card = fam.card
  leaveFamily(g)
  g.flags[CALLED_OUT_FLAG] = { family: name, card }
  if (choice === 'run' && survive) {
    log(g, `I fled from ${name} after they found out I was a rat.`, 'bad')
    outcome(g, 'On the Run', `You ran before they could grab you. You're out of ${name}, and they will never forget it.`, '\u{1F3C3}', 'bad')
    return
  }
  const dmg = hurt(g, randInt(g, 25, 50))
  log(g, `${name} beat me half to death for being a rat.`, 'bad')
  outcome(g, 'Rat', `${name} beat you half to death and threw you out of the family. (-${dmg} health)`, '\u{1F915}', 'bad')
})

const WITNESS_SCRIPT = defineScript('crime.mafia.witness', (g, choice, data) => {
  const c = g.character
  if (!c.alive || !isRecord(data)) return
  const name = str(data.family, 'the family')
  const card = str(data.card, CALLING_CARDS[0])
  if (choice === 'cancel' || !COUNTRIES.some((k) => k.id === choice)) {
    g.flags[CALLED_OUT_FLAG] = { family: name, card }
    log(g, 'I turned down witness protection.', 'neutral')
    notice(g, 'Taking Chances', `You turned down witness protection. Watch out for ${card}. That's how ${name} says hello.`, { emoji: '\u{1F440}' })
    return
  }
  const country = getCountry(choice)
  const old = c.lastName
  c.countryId = country.id
  c.city = randomCity(g, country)
  c.lastName = randomLastName(g, country.id)
  c.wantedLevel = 0
  delete g.flags[FUGITIVE_FLAG]
  count(g, 'emigrations')
  log(g, `I entered witness protection and moved to ${c.city}, ${country.name} as ${c.firstName} ${c.lastName}.`, 'event')
  remember(g, `Entered witness protection; new identity ${c.firstName} ${c.lastName} in ${country.name} (formerly ${old}).`)
  outcome(g, 'New Identity', `The feds handed you a new passport and a one-way ticket. Say hello to ${c.firstName} ${c.lastName} of ${c.city}, ${country.name}.`, country.flag || '\u{2708}\u{FE0F}', 'good')
})

const CARD_SCRIPT = defineScript('crime.mafia.card', (g, choice, data) => {
  if (!canAct(g) || !isRecord(data)) return
  const name = str(data.family, 'the family')
  const odds: Record<string, number> = { run: 0.55, assault: 0.5, beg: 0.35 }
  if (chance(g, odds[choice] ?? 0.4)) {
    if (chance(g, 0.5)) delete g.flags[CALLED_OUT_FLAG]
    log(g, `I survived a visit from ${name}.`, 'event')
    outcome(g, 'Survived', choice === 'assault' ? `You fought off the hitman from ${name}.` : choice === 'beg' ? `The hitman from ${name} took pity on you. "The boss says this is your last warning."` : `You slipped out the back and lost the hitman from ${name}.`, '\u{1F605}', 'good')
    return
  }
  if (chance(g, 0.4)) {
    notice(g, 'Whacked', `${name} never forgets. Neither did their hitman.`, { emoji: '\u{26B0}\u{FE0F}', tone: 'bad' })
    killCharacter(g, 'Whacked by the Mob')
    return
  }
  const dmg = hurt(g, randInt(g, 20, 45))
  log(g, `A hitman from ${name} attacked me.`, 'bad')
  outcome(g, 'Attacked', `The hitman from ${name} left you for dead, but you pulled through. (-${dmg} health)`, '\u{1F915}', 'bad')
})

const SUMMON_SCRIPT = defineScript('crime.mafia.summon', (g, choice) => {
  const fam = crimeFamily(g)
  if (!canAct(g) || !fam) return
  if (choice === 'report') {
    if (chance(g, 0.6)) {
      fam.standing = clamp(fam.standing + 8)
      notice(g, 'Pep Talk', `The boss told you to step it up, then poured you a glass of wine. You left with your kneecaps intact.`, { emoji: '\u{1F377}' })
    } else {
      const dmg = hurt(g, randInt(g, 10, 25))
      fam.standing = clamp(fam.standing + 5)
      notice(g, 'Motivation', `The boss "motivated" you to earn more. (-${dmg} health)`, { emoji: '\u{1F915}', tone: 'bad' })
    }
    return
  }
  if (chance(g, 0.15)) {
    notice(g, 'Whacked', `You ignored a summons from ${fam.name}. They came to you instead.`, { emoji: '\u{26B0}\u{FE0F}', tone: 'bad' })
    killCharacter(g, 'Whacked by the Mob')
    return
  }
  fam.standing = clamp(fam.standing - 10)
  const dmg = hurt(g, randInt(g, 15, 30))
  outcome(g, 'Ignored', `You stayed home. Two family soldiers found you anyway and beat you up. (-${dmg} health)`, '\u{1F915}', 'bad')
})

const ASSIGN_SCRIPT = defineScript('crime.mafia.assign', (g, choice) => {
  const fam = crimeFamily(g)
  if (!canAct(g) || !fam || choice === 'cancel') return
  const jobs: Record<string, { crime: string; lo: number; hi: number; odds: number }> = {
    burglary: { crime: 'Burglary', lo: 2000, hi: 20000, odds: 0.7 },
    gta: { crime: 'Grand Theft Auto', lo: 3000, hi: 30000, odds: 0.65 },
    bank: { crime: 'Bank Robbery', lo: 20000, hi: 200000, odds: 0.45 },
  }
  const job = jobs[choice]
  if (!job) return
  const soldier = fam.members.filter((m) => m.alive && m.rank < Math.max(1, fam.rank))
  const who = soldier.length ? pick(g, soldier) : null
  const whoName = who?.name ?? 'One of your guys'
  if (chance(g, job.odds)) {
    const cut = Math.round(cash(g, randInt(g, job.lo, job.hi)) * 0.5)
    const got = pocket(g, cut)
    fam.standing = clamp(fam.standing + randInt(g, 2, 5))
    log(g, `${whoName} pulled off ${aThing(job.crime)} for me. My cut was ${formatMoney(got)}.`, 'event')
    outcome(g, 'Job Done', `${whoName} pulled off the ${job.crime.toLowerCase()} without a hitch. Your cut: ${formatMoney(cut)}.`, '\u{1F574}\u{FE0F}', 'good')
    return
  }
  if (who) who.alive = chance(g, 0.9)
  if (chance(g, 0.2)) {
    arrestPlayer(g, 'Conspiracy', job.crime === 'Bank Robbery' ? 3 : 2, { evidence: 0.6, context: `${whoName} got caught during the ${job.crime.toLowerCase()} and gave the police your name.` })
    return
  }
  fam.standing = clamp(fam.standing - 3)
  log(g, `${whoName} got arrested during a job I assigned.`, 'bad')
  outcome(g, 'Busted', `${whoName} got arrested during the ${job.crime.toLowerCase()}. At least ${who && who.gender === 'female' ? 'she' : 'he'} kept ${who && who.gender === 'female' ? 'her' : 'his'} mouth shut.`, '\u{1F6A8}', 'bad')
})

function familyNodes(g: GameState, fam: CrimeFamily): MenuNode[] {
  const c = g.character
  const nodes: MenuNode[] = [
    { type: 'info', id: 'crime.mafia.info', emoji: '\u{1F574}\u{FE0F}', text: `${fam.name} (${fam.kind}) · ${familyRankTitle(fam, fam.rank, c.gender)}` },
    { type: 'info', id: 'crime.mafia.standing', emoji: '\u{1F4C8}', text: `Standing: ${fam.standing}% · ${years(fam.years)} in the family · Earned ${shortMoney(fam.earnings)}` },
  ]
  if (fam.informant) nodes.push({ type: 'info', id: 'crime.mafia.wire', emoji: '\u{1F400}', text: `Informant: ${Math.min(100, fam.informant.evidence)}% of the evidence gathered · ${Math.max(0, 5 - fam.informant.years)} years left` })
  nodes.push({ ...extortAction, id: 'crime.mafia.extort' })
  nodes.push({
    type: 'action',
    id: 'crime.mafia.assign',
    label: 'Assign a Crime',
    emoji: '\u{1F4CB}',
    subtitle: 'Have a family member do the dirty work',
    disabledReason: (gg) => {
      const f = crimeFamily(gg)
      return blocked(gg, 18) ?? (!f || f.rank < 1 ? 'Associates do the work. Become a Soldier to hand it out.' : null)
    },
    run: (gg) => {
      if (!canAct(gg) || !lieLow(gg, 'crime.mafiaAssign', 2)) return
      scriptChoice(gg, ASSIGN_SCRIPT, 'Assign a Crime', 'What job should one of your guys pull? You get half the take.', [
        { id: 'burglary', label: 'Burglary', emoji: '\u{1F3E0}' },
        { id: 'gta', label: 'Grand Theft Auto', emoji: '\u{1F697}' },
        { id: 'bank', label: 'Bank Robbery', emoji: '\u{1F3E6}' },
        { id: 'cancel', label: 'Never mind', emoji: '\u{1F645}' },
      ], { emoji: '\u{1F4CB}' })
    },
  })
  if (fam.rank < 4) {
    nodes.push({
      type: 'action',
      id: 'crime.mafia.promotion',
      label: 'Ask for a Promotion',
      emoji: '\u{2B06}\u{FE0F}',
      subtitle: (gg) => {
        const f = crimeFamily(gg)
        return f && f.rank < 4 ? `Next: ${familyRankTitle(f, f.rank + 1, gg.character.gender)} (needs ${RANK_REQ[f.rank + 1]}% standing)` : ''
      },
      disabledReason: (gg) => blocked(gg, 18) ?? (yearActionsUsed(gg, 'crime.mafiaPromo') >= 1 ? 'You already asked this year. Patience is a virtue, even in the mob.' : null),
      run: (gg) => {
        const f = crimeFamily(gg)
        if (!canAct(gg) || !f || f.rank >= 4 || !useYearAction(gg, 'crime.mafiaPromo', 1)) return
        const need = RANK_REQ[f.rank + 1]
        const up = superior(f)
        const upName = up?.name ?? 'The boss'
        if (f.standing < need) {
          notice(gg, 'Not Yet', `${upName} laughed. "Earn your stripes first." (You need ${need}% standing; you have ${f.standing}%.)`, { emoji: '\u{1F610}' })
          return
        }
        if (f.rank === 0) {
          scriptChoice(gg, PROMO_SCRIPT, 'Make Your Bones', `${upName} says you're ready to become a made ${gg.character.gender === 'male' ? 'man' : 'woman'}, but first you have to make your bones: whack someone the family picks.`, [
            { id: 'do', label: 'Do it', emoji: '\u{1F52A}' },
            { id: 'later', label: 'Not yet', emoji: '\u{270B}' },
          ], { emoji: '\u{1F574}\u{FE0F}' })
          return
        }
        if (chance(gg, f.rank === 3 ? 0.25 : 0.6)) {
          promote(gg, f)
          return
        }
        notice(gg, 'Not Yet', f.rank === 3 ? `${upName} isn't ready to step aside. Maybe he needs a push.` : `${upName} says the family isn't ready to promote you. Keep earning.`, { emoji: '\u{1F610}' })
      },
    })
  }
  if (fam.rank === 3) {
    nodes.push({
      type: 'action',
      id: 'crime.mafia.coup',
      label: 'Whack the Boss',
      emoji: '\u{1F451}',
      subtitle: 'Take over the family',
      confirm: () => 'If this fails, you are dead. Go through with it?',
      run: (gg) => {
        const f = crimeFamily(gg)
        if (!canAct(gg) || !f || f.rank !== 3 || !lieLow(gg, 'crime.mafiaCoup', 1)) return
        const b = boss(f)
        const name = b?.name ?? 'the boss'
        const idx = commitCrime(gg, 'Murder', { karma: 25, notoriety: 15, heat: 0.2 })
        if (chance(gg, clamp(0.45 + f.standing / 400, 0.2, 0.75))) {
          count(gg, 'murders')
          promote(gg, f, true)
          outcome(gg, 'Coup', `You whacked ${name} at a family dinner. Nobody objected; they just passed you the bread. You run ${f.name} now.`, '\u{1F451}', 'event')
          if (chance(gg, 0.1)) arrestPlayer(gg, 'Murder', 5, { recordIndex: idx, evidence: 0.7, violent: 'murder', context: `A rat in the family told the police who really killed ${name}.` })
          return
        }
        if (chance(gg, 0.5)) {
          notice(gg, 'Coup Failed', `${name} saw it coming. You did not.`, { emoji: '\u{26B0}\u{FE0F}', tone: 'bad' })
          killCharacter(gg, 'Whacked by the Mob')
          return
        }
        const dmg = hurt(gg, randInt(gg, 25, 45))
        f.rank = 1
        f.standing = 10
        outcome(gg, 'Coup Failed', `Your hit on ${name} failed. You were beaten to a pulp and demoted to Soldier. (-${dmg} health)`, '\u{1F915}', 'bad')
      },
    })
  }
  nodes.push({
    type: 'menu',
    id: 'crime.mafia.rat',
    label: 'Expose a Rat',
    emoji: '\u{1F400}',
    subtitle: (sg) => `Accuse someone of talking to ${feds(sg).them}`,
    header: () => 'Pick right and the family rewards you. Pick wrong and they punish you.',
    children: (gg) => {
      const f = crimeFamily(gg)
      if (!f) return []
      return f.members
        .filter((m) => m.alive)
        .map(
          (m): MenuAction => ({
            type: 'action',
            id: `crime.mafia.rat.${m.id}`,
            label: m.name,
            emoji: '\u{1F464}',
            subtitle: familyRankTitle(f, m.rank, m.gender),
            confirm: () => `Accuse ${m.name} of being a rat?`,
            run: (g3) => {
              const f3 = crimeFamily(g3)
              const member = f3?.members.find((x) => x.id === m.id)
              if (!canAct(g3) || !f3 || !member || !member.alive || !lieLow(g3, 'crime.mafiaRat', 2)) return
              if (member.rat) {
                member.alive = false
                f3.standing = clamp(f3.standing + 15)
                count(g3, 'ratsExposed')
                log(g3, `I exposed ${member.name} as a rat.`, 'event')
                outcome(g3, 'Rat Spotter', `You were right: ${member.name} had been wearing a wire. The family took ${member.name} on a one-way fishing trip.`, '\u{1F400}', 'good')
                return
              }
              f3.standing = clamp(f3.standing - 15)
              const dmg = hurt(g3, randInt(g3, 15, 35))
              log(g3, `I wrongly accused ${member.name} of being a rat.`, 'bad')
              outcome(g3, 'Wrong Rat', `${member.name} was loyal, and the family didn't appreciate the accusation. They made their feelings clear. (-${dmg} health)`, '\u{1F915}', 'bad')
            },
          }),
        )
    },
  })
  if (!fam.informant && fam.rank < 4) {
    nodes.push({
      type: 'action',
      id: 'crime.mafia.inform',
      label: 'Become an Informant',
      emoji: '\u{1F399}\u{FE0F}',
      subtitle: (sg) => `Secretly work with ${feds(sg).them}`,
      confirm: () => 'If the family finds out, they will kill you. Wear the wire?',
      run: (gg) => {
        const f = crimeFamily(gg)
        if (!canAct(gg) || !f || f.informant) return
        f.informant = { years: 0, evidence: 0 }
        log(gg, `I secretly became a ${feds(gg).informant}.`, 'event')
        remember(gg, `Became a ${feds(gg).informant} against ${f.name}.`)
        notice(gg, 'Wired', `You met ${gg.character.countryId === 'us' ? (gg.year >= 1935 ? 'an FBI agent' : 'a federal agent') : 'a detective'} in ${cars(gg) ? 'a parking garage' : 'a dark alley'} and agreed to wear a wire. Gather enough evidence on ${f.name} within 5 years and you walk away clean.`, { emoji: '\u{1F399}\u{FE0F}', tone: 'event' })
      },
    })
  }
  nodes.push({
    type: 'action',
    id: 'crime.mafia.leave',
    label: 'Leave the Family',
    emoji: '\u{1F6AA}',
    subtitle: (gg) => (crimeFamily(gg)?.oath ? 'You took the oath. This is dangerous.' : 'Walk away while you still can'),
    confirm: (gg) => (crimeFamily(gg)?.oath ? 'You swore an oath for life. Leaving could get you killed. Leave anyway?' : 'Leave the family?'),
    run: (gg) => {
      const f = crimeFamily(gg)
      if (!canAct(gg) || !f) return
      const name = f.name
      const oath = f.oath
      const card = f.card
      leaveFamily(gg)
      log(gg, `I left ${name}.`, 'neutral')
      if (oath) {
        if (chance(gg, 0.08)) {
          notice(gg, 'Whacked', `Nobody leaves ${name}. They made sure of it.`, { emoji: '\u{26B0}\u{FE0F}', tone: 'bad' })
          killCharacter(gg, 'Whacked by the Mob')
          return
        }
        if (chance(gg, 0.4)) {
          const dmg = hurt(gg, randInt(gg, 15, 35))
          gg.flags[CALLED_OUT_FLAG] = { family: name, card }
          outcome(gg, 'Out', `You told ${name} you were out. They broke a few things on your way out, mostly you. (-${dmg} health)`, '\u{1F915}', 'bad')
          return
        }
      }
      outcome(gg, 'Out', `You walked away from ${name}. ${oath ? 'They let you go... for now.' : 'Nobody tried to stop you.'}`, '\u{1F6AA}')
    },
  })
  return nodes
}

const organizedCrimeMenu: MenuGroup = {
  type: 'menu',
  id: 'crime.mafia',
  label: 'Organized Crime',
  emoji: '\u{1F574}\u{FE0F}',
  subtitle: (g) => {
    const fam = crimeFamily(g)
    return fam ? `${familyRankTitle(fam, fam.rank, g.character.gender)} · ${fam.name}` : 'Join a crime family'
  },
  disabledReason: ageGate(18),
  header: (g) => (crimeFamily(g) ? 'Earn for the family, follow orders, and never talk to the cops.' : 'Crime families only take people with a reputation.'),
  children: (g) => {
    const fam = crimeFamily(g)
    return fam ? familyNodes(g, fam) : [joinFamilyAction]
  },
}

// --- Yearly family business ------------------------------------------------

function yearlyFamily(g: GameState, fam: CrimeFamily): void {
  const c = g.character
  const pay = cash(g, RANK_PAY[clamp(fam.rank, 0, 4)] * (0.6 + rand(g) * 0.8))
  addMoney(g, pay, 'crime.take')
  fam.earnings += pay
  log(g, `${fam.name} paid me ${formatMoney(pay)} this year.`, 'neutral')
  if (fam.rank < 4) fam.standing = clamp(fam.standing - randInt(g, 2, 5))

  // Informant progress.
  if (fam.informant) {
    fam.informant.years += 1
    fam.informant.evidence += randInt(g, 15, 35) + fam.rank * 5
    if (chance(g, 0.08 + fam.informant.years * 0.02)) {
      scriptChoice(g, EXPOSED_SCRIPT, 'Rat!', `${fam.name} found a wire taped under your shirt. Every soldier in the room is staring at you.`, [
        { id: 'deny', label: 'Deny it', emoji: '\u{1F645}' },
        { id: 'admit', label: 'Admit it', emoji: '\u{1F614}' },
        { id: 'run', label: 'Run', emoji: '\u{1F3C3}' },
      ], { emoji: '\u{1F400}' })
      return
    }
    if (fam.informant.evidence >= 100) {
      const name = fam.name
      const card = fam.card
      leaveFamily(g)
      c.wantedLevel = 0
      count(g, 'informant')
      log(g, `My evidence brought down ${name}.`, 'event')
      remember(g, `Brought down ${name} as a ${feds(g).informant}.`)
      const options = shuffle(g, COUNTRIES.filter((k) => k.id !== c.countryId)).slice(0, 2)
      scriptChoice(g, WITNESS_SCRIPT, 'Witness Protection', `Your evidence brought down ${name}. Dozens of arrests, and ${feds(g).them} have wiped your slate clean. They offer you witness protection: a new name in a new country.`, [
        ...options.map((k) => ({ id: k.id, label: `Move to ${k.name}`, emoji: k.flag })),
        { id: 'cancel', label: 'Take my chances here', emoji: '\u{1F3E0}' },
      ], { emoji: '\u{1F575}\u{FE0F}', data: { family: name, card } })
      return
    }
    if (fam.informant.years > 5) {
      fam.informant = null
      log(g, 'The feds cut me loose as an informant.', 'neutral')
      notice(g, 'Cut Loose', "Five years and not enough evidence. The feds stopped returning your calls. At least the family never found out.", { emoji: '\u{1F4F5}' })
      return
    }
  }

  // Low standing: summoned by the boss.
  if (fam.rank < 4 && fam.standing < 12 && chance(g, 0.5)) {
    scriptChoice(g, SUMMON_SCRIPT, 'Summoned', `Your earnings have been light. ${superior(fam)?.name ?? 'The boss'} wants to see you. Now.`, [
      { id: 'report', label: 'Report as ordered', emoji: '\u{1F6B6}' },
      { id: 'stay', label: 'Stay home', emoji: '\u{1F3E0}' },
    ], { emoji: '\u{1F574}\u{FE0F}' })
    return
  }

  if (!chance(g, 0.55)) return
  const roll = rand(g)
  const rat = fam.members.find((m) => m.alive && m.rat)
  if (rat && !fam.informant && roll < 0.1) {
    rat.alive = false
    arrestPlayer(g, 'Racketeering', 3, { evidence: 0.75, context: `The feds raided ${fam.name}. ${rat.name} had been a rat all along.` })
    return
  }
  if (roll < 0.5 && fam.rank < 4) {
    const up = superior(fam)
    const task = pick(g, ['spy', 'scare', 'shake', 'whack'] as const)
    const verb = { spy: 'spy on', scare: 'scare', shake: 'shake down', whack: 'whack' }[task]
    const target = strangerName(g, chance(g, 0.6) ? 'male' : 'female')
    const choices: ChoiceOption[] = [{ id: 'do', label: 'Do it myself', emoji: '\u{1F44A}' }]
    if (fam.rank >= 1) choices.push({ id: 'delegate', label: 'Have someone else do it', emoji: '\u{1F465}' })
    choices.push({ id: 'excuse', label: 'Make an excuse', emoji: '\u{1F925}' }, { id: 'refuse', label: 'Refuse', emoji: '\u{1F645}' })
    scriptChoice(g, ORDER_SCRIPT, 'Orders', `${up?.name ?? 'The boss'} wants you to ${verb} ${target}${task === 'whack' ? ', who has been talking too much' : task === 'shake' ? ', who owes the family money' : ''}.`, choices, {
      emoji: '\u{1F574}\u{FE0F}',
      data: { task, target, from: up?.name ?? 'The boss' },
    })
    return
  }
  if (roll < 0.75) {
    const other = FAMILY_KINDS.filter((k) => k.kind !== fam.kind)
    const k = pick(g, other)
    const gender: Gender = chance(g, 0.8) ? 'male' : 'female'
    const rival = familyMemberName(g, k.region, gender)
    const family = k.kind === 'Triad' ? `the ${pick(g, TRIAD_NAMES)}` : `the ${k.name(pick(g, (NAME_POOLS[k.region] ?? NAME_POOLS.anglo).last))}`
    scriptChoice(g, RIVAL_SCRIPT, 'Rival Family', `You bumped into ${rival} from ${family}, a rival ${k.kind.toLowerCase()} family, outside a restaurant. ${pronouns(gender).He} reached into ${pronouns(gender).his} jacket...`, [
      { id: 'attack', label: 'Attack first', emoji: '\u{1F44A}' },
      { id: 'reason', label: 'Reason with them', emoji: '\u{1F5E3}\u{FE0F}' },
      { id: 'beg', label: 'Beg for your life', emoji: '\u{1F64F}' },
      { id: 'run', label: 'Run', emoji: '\u{1F3C3}' },
    ], { emoji: '\u{1F4A2}', data: { rival, family } })
    return
  }
  if (roll < 0.82) {
    const relatives = g.people.filter((p) => p.alive && ['parent', 'sibling', 'child'].includes(p.relation) && p.age >= 18)
    if (relatives.length > 0) {
      const victim = pick(g, relatives)
      killPerson(g, victim, 'Whacked by the Mob')
      addStat(g, 'happiness', -randInt(g, 15, 25))
      notice(g, 'Whacked', `A rival family sent ${fam.name} a message. Your ${relationLabel(victim).toLowerCase()} ${victim.firstName} was found dead with ${pick(g, CALLING_CARDS)} on ${pronouns(victim.gender).his} chest.`, {
        emoji: '\u{26B0}\u{FE0F}',
        tone: 'bad',
      })
      return
    }
  }
  log(g, pickSite(g, [
    `I helped ${fam.name} come up with a name for a new front business: "${pick(g, ['Totally Legit Laundry', 'Honest Abe\'s Pawn', 'Nothing To See Here Bakery', ...(g.year >= 1940 ? ['Clean Money Car Wash'] : ['Spotless Linen Laundry'])])}".`,
    `I went to a ${fam.kind === 'Mafia' ? 'Sunday dinner' : 'family banquet'} with ${fam.name}. Nobody talked business. Officially.`,
    `${superior(fam)?.name ?? 'The boss'} complimented my work this year.`,
  ], 0xe402ce13), 'neutral')
}

// ---------------------------------------------------------------------------
// Bootlegging (age 14+, US Prohibition 1920-1933): bathtub gin, speakeasy runs and rum-running

interface BootlegJob {
  id: string
  label: string
  emoji: string
  risk: number
  pay: [number, number]
  win: string[]
  caught: string
}

const BOOTLEG_JOBS: BootlegJob[] = [
  {
    id: 'gin',
    label: 'Brew bathtub gin',
    emoji: '\u{1F6C1}',
    risk: 0.12,
    pay: [150, 900],
    win: ['You cooked up a batch of bathtub gin and sold it by the jar. It tasted like turpentine. Nobody complained.', 'Your bathtub gin was the talk of three speakeasies. The bathtub may never recover.'],
    caught: 'A neighbor smelled juniper and turpentine through the wall and tipped off the Prohibition agents.',
  },
  {
    id: 'deliver',
    label: 'Supply the speakeasies',
    emoji: '\u{1F943}',
    risk: 0.2,
    pay: [400, 2500],
    win: ['You delivered crates of whiskey to four speakeasies before sunrise. Every doorman knew your knock.', 'You hid the bottles under a load of potatoes and made every delivery on time.'],
    caught: 'Prohibition agents stopped your delivery truck and found the bottles under the potatoes.',
  },
  {
    id: 'border',
    label: 'Smuggle whiskey across the border',
    emoji: '\u{1F69A}',
    risk: 0.25,
    pay: [1000, 7000],
    win: ['You hauled a load of whiskey down from the northern border, hidden under crates of lumber.', 'You smuggled whiskey across the border in milk cans. The cows would be proud.'],
    caught: 'Border agents tapped your milk cans and heard whiskey sloshing inside.',
  },
  {
    id: 'rumrun',
    label: 'Run rum by boat',
    emoji: '\u{1F6A4}',
    risk: 0.3,
    pay: [2000, 12000],
    win: ['You met a schooner offshore in the dark and ran a boatload of rum back to the docks.', 'You outran a Coast Guard cutter in fog so thick you could chew it. The rum made it ashore.'],
    caught: 'A Coast Guard cutter caught your boat riding low in the water with a hundred cases of rum aboard.',
  },
]

const BOOTLEG_SCRIPT = defineScript('crime.bootleg', (g, choice) => {
  const c = g.character
  if (!canAct(g) || choice === 'cancel' || !prohibition(g)) return
  const job = BOOTLEG_JOBS.find((j) => j.id === choice)
  if (!job) return
  const risk = clamp((job.risk - (c.stats.smarts - 50) / 500) * caughtMult(g), 0.04, 0.6)
  const idx = commitCrime(g, 'Bootlegging', { karma: 1, notoriety: 2, heat: 0.08 })
  if (chance(g, risk)) {
    arrestPlayer(g, 'Bootlegging', 1, { recordIndex: idx, evidence: 0.8, context: job.caught })
    return
  }
  count(g, 'bootlegRuns')
  const got = pocket(g, cash(g, randInt(g, job.pay[0], job.pay[1])))
  log(g, `I ran bootleg liquor during Prohibition and made ${formatMoney(got)}.`, 'event')
  outcome(g, 'Bootlegger', `${pick(g, job.win)} You cleared ${formatMoney(got)}.`, job.emoji, 'good')
})

const bootlegAction: MenuAction = {
  type: 'action',
  id: 'crime.bootleg',
  label: 'Bootlegging',
  emoji: '\u{1F943}',
  subtitle: 'Liquor is illegal. Thirst is not.',
  visible: (g) => prohibition(g),
  disabledReason: ageGate(14),
  run: (g) => {
    if (!canAct(g) || !lieLow(g, 'crime.bootleg', 3)) return
    scriptChoice(g, BOOTLEG_SCRIPT, 'Bootlegging', 'Prohibition made liquor illegal, and the speakeasies are thirsty. What is the job?', [
      ...BOOTLEG_JOBS.map((j) => ({ id: j.id, label: j.label, emoji: j.emoji })),
      { id: 'cancel', label: 'Never mind', emoji: '\u{1F645}' },
    ], { emoji: '\u{1F943}' })
  },
}

// ---------------------------------------------------------------------------
// The Crime menu

function wantedStars(n: number): string {
  const k = clamp(Math.round(n), 0, 5)
  return '\u{2605}'.repeat(k) + '\u{2606}'.repeat(5 - k)
}

/** Crime activities (Activities → Crime). */
export const crimeMenu: MenuGroup = {
  type: 'menu',
  id: 'crime',
  label: 'Crime',
  emoji: '\u{1F977}',
  subtitle: 'Commit a crime',
  visible: (g) => g.character.alive && !g.character.prison,
  disabledReason: (g) => (g.character.age < 8 ? "You're too young to commit crimes. Go play with your toys." : null),
  header: (g) => {
    const fu = fugitiveInfo(g)
    if (fu) return `You're an escaped fugitive from ${fu.prison}. Lie low.`
    return g.character.wantedLevel > 0 ? 'The police are looking for you. Every crime adds to the heat.' : 'Crime pays... until it doesn\'t.'
  },
  children: (g) => {
    const nodes: MenuNode[] = []
    if (g.character.wantedLevel > 0) nodes.push({ type: 'info', id: 'crime.wanted', emoji: '\u{1F6A8}', text: `Wanted level: ${wantedStars(g.character.wantedLevel)}` })
    nodes.push(
      bankAction,
      bootlegAction,
      burglaryAction,
      cyberMenu,
      delinquencyMenu,
      embezzleAction,
      extortAction,
      gtaAction,
      hitmanMenu,
      murderMenu,
      organizedCrimeMenu,
      underworldMenu,
      pickpocketAction,
      porchAction,
      shopliftMenu,
      trainAction,
    )
    return nodes
  },
}

// ---------------------------------------------------------------------------
// Yearly police work

function trialPending(g: GameState): boolean {
  return g.queue.some((m) => m.kind === 'choice' && !!m.scriptId && TRIAL_SCRIPTS.has(m.scriptId))
}

function recapture(g: GameState): boolean {
  const c = g.character
  const fu = fugitiveInfo(g)
  if (!fu) return false
  const abroad = !!fu.countryId && fu.countryId !== c.countryId
  const p = abroad ? 0.03 : 0.15 + c.wantedLevel * 0.02
  if (!chance(g, p)) return false
  const add = randInt(g, 2, 5)
  count(g, 'arrests')
  count(g, 'convictions')
  c.criminalRecord.push({ crime: escapeCharge(g), age: c.age, caught: true, convicted: true, sentenceYears: add })
  const life = fu.yearsLeft >= 99
  notice(g, 'Recaptured', pick(g, [
    `The police finally tracked you down. You're going back to prison with ${years(add)} added for ${escapeCharge(g).toLowerCase()}.`,
    c.countryId === 'us'
      ? `A U.S. Marshal-looking guy tapped you on the shoulder at the grocery store. Your time on the run is over. ${years(add)} were added for felony escape.`
      : `A plainclothes detective tapped you on the shoulder at the market. Your time on the run is over. ${years(add)} were added for escaping.`,
    `Someone recognized you from a wanted poster and called it in. Back to prison you go, with ${years(add)} more for escaping.`,
  ]), { emoji: '\u{1F6A8}', tone: 'bad' })
  log(g, 'The police recaptured me.', 'bad')
  sendToPrison(g, fu.crime, life ? 0 : fu.yearsLeft + add, { security: 'maximum', life: life && !fu.deathRow, deathRow: fu.deathRow, quiet: true, severity: 4 })
  return true
}

/** Wanted level, fugitives, stolen cars, audits, crime family business, and prison years. */
export function yearlyCrime(g: GameState): void {
  const c = g.character
  if (!c.alive) return
  const fam = crimeFamily(g)
  if (fam) fam.years += 1
  if (c.prison) {
    yearlyPrison(g)
    return
  }
  if (fam) {
    yearlyFamily(g, fam)
    if (!c.alive || c.prison || trialPending(g)) return
  }

  // A crime family you crossed never forgets.
  const grudge = g.flags[CALLED_OUT_FLAG]
  if (isRecord(grudge) && chance(g, 0.07)) {
    const card = str(grudge.card, 'a calling card')
    scriptChoice(g, CARD_SCRIPT, 'Calling Card', `You found ${card} on your pillow. That's the calling card of ${str(grudge.family, 'the family')}. A man in a long coat is waiting outside.`, [
      { id: 'run', label: 'Run', emoji: '\u{1F3C3}' },
      { id: 'assault', label: 'Attack him', emoji: '\u{1F44A}' },
      { id: 'beg', label: 'Beg for forgiveness', emoji: '\u{1F64F}' },
    ], { emoji: '\u{1F0CF}', data: grudge })
    return
  }

  if (recapture(g)) return

  // Stolen cars get traced.
  for (const a of g.assets) {
    if (a.kind !== 'car' || a.details.stolen !== true) continue
    if (!chance(g, 0.08)) continue
    g.assets = g.assets.filter((x) => x.id !== a.id)
    arrestPlayer(g, 'Grand Theft Auto', 2, { evidence: 0.9, context: `The police ran the plates on your ${a.name}. It was reported stolen, and they know exactly who took it.` })
    return
  }

  // Embezzlement audits.
  const emb = g.flags[EMBEZZLE_FLAG]
  if (isRecord(emb)) {
    if (!c.job || c.job.company !== str(emb.company)) {
      delete g.flags[EMBEZZLE_FLAG]
    } else if (chance(g, 0.06)) {
      const amount = num(emb.amount)
      const idx = num(emb.record, -1)
      embezzleCaught(g, amount, amount > c.job.salary * 0.3, idx >= 0 ? idx : undefined)
      return
    }
  }

  // The police catch up on old crimes, or the heat dies down.
  if (c.wantedLevel > 0) {
    if (chance(g, Math.min(0.4, c.wantedLevel * 0.07))) {
      const rec = c.criminalRecord
      let idx = -1
      for (let i = rec.length - 1; i >= 0; i--) {
        if (!rec[i].caught) {
          idx = i
          break
        }
      }
      if (idx >= 0) {
        const r = rec[idx]
        arrestPlayer(g, r.crime, crimeSeverity(r.crime), {
          recordIndex: idx,
          evidence: 0.55,
          violent: r.crime === 'Murder' ? 'murder' : r.crime === 'Attempted Murder' ? 'attempted' : undefined,
          context: `There was a knock at the door. The police finally connected you to ${aThing(r.crime)} from ${r.age === c.age ? 'earlier this year' : `when you were ${r.age}`}.`,
        })
        return
      }
      c.wantedLevel = 0
    } else if (chance(g, 0.6)) {
      c.wantedLevel = Math.max(0, c.wantedLevel - 1)
    }
  }

  // Wrongful arrests happen too.
  if (c.age >= 16 && chance(g, 0.003)) {
    const crime = pick(g, ['Burglary', 'Grand Theft Auto', 'Assault', 'Larceny', 'Fraud'])
    arrestPlayer(g, crime, crimeSeverity(crime), {
      evidence: 0.3,
      falseAccusation: true,
      context: `The police showed up and arrested you for ${aThing(crime)} you didn't commit! Apparently you match the description of "a person."`,
    })
  }
}

/** Re-exported for modules that release the player (e.g. a pardon event). */
export { releaseFromPrison }
