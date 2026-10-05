// Crime: the Crime activity menu (petty theft to murder), arrests & trials, organized crime,
// and the yearly police work (wanted level, fugitives, stolen cars, audits, prison years).
import {
  addHidden,
  addMoney,
  addPersonStat,
  addRelationship,
  addStat,
  article,
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
  peopleBy,
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
import { addPrisonTime, fugitiveInfo, FUGITIVE_FLAG, moneyScale, releaseFromPrison, sendToPrison, yearlyPrison } from './prison'
import { chance, pick, rand, randInt, shuffle, uid } from './rng'
import { defineScript } from './scripts'
import { COUNTRIES, getCountry, NAME_POOLS, randomCity, randomFirstName, randomLastName, type NameRegion } from './world'
import type {
  ChoiceOption,
  CrimeRecord,
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

/** Per-year limit with a BitLife-style "lie low" popup. */
function lieLow(g: GameState, key: string, max: number): boolean {
  if (useYearAction(g, key, max)) return true
  notice(
    g,
    'Lie Low',
    pick(g, [
      "You've pushed your luck enough this year. Lie low until next year.",
      'Every cop in town has your description this year. Better wait until next year.',
      'Even criminals need a vacation. Try again next year.',
      "Your gut says the heat is on. Give it a year.",
    ]),
    { emoji: '\u{1FAE3}' },
  )
  return false
}

/** Outcome popup; at the Full AI level the director rewrites it in its own words. */
function outcome(g: GameState, title: string, text: string, emoji: string, tone: Tone = 'neutral'): void {
  notice(g, title, text, { emoji, tone, ai: { when: 'full', facts: text } })
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

/** Record a committed crime (uncaught for now). Returns its index in the criminal record. */
function commitCrime(g: GameState, crime: string, cost: CrimeCost): number {
  const c = g.character
  count(g, 'crimes')
  c.criminalRecord.push({ crime, age: c.age, caught: false, convicted: false })
  addHidden(g, 'karma', -Math.abs(cost.karma))
  addHidden(g, 'notoriety', cost.notoriety)
  if (cost.heat > 0 && chance(g, Math.min(1, cost.heat))) c.wantedLevel = clamp(c.wantedLevel + (cost.heat > 1 ? 2 : 1), 0, 5)
  const fam = crimeFamily(g)
  if (fam) fam.standing = clamp(fam.standing + randInt(g, 1, 3))
  return c.criminalRecord.length - 1
}

/** Stolen money lands in your account (untaxed). Crime-family members kick up a cut. */
function pocket(g: GameState, amount: number): number {
  const n = Math.max(0, Math.round(amount))
  if (n <= 0) return 0
  addMoney(g, n)
  count(g, 'moneyStolen', n)
  const fam = crimeFamily(g)
  if (fam && n >= 1000) {
    const cut = Math.round(n * (fam.rank >= 4 ? 0 : 0.15))
    if (cut > 0) {
      addMoney(g, -cut)
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
}

const ARREST_SCRIPT = 'crime.arrest'
const FEDS_SCRIPT = 'crime.trial.feds'
const LAWYER_SCRIPT = 'crime.trial.lawyer'
const PLEA_SCRIPT = 'crime.trial.plea'
const TRIAL_SCRIPTS = new Set([ARREST_SCRIPT, FEDS_SCRIPT, LAWYER_SCRIPT, PLEA_SCRIPT])

function asTrial(data: Json | undefined): TrialData | null {
  if (!isRecord(data) || typeof data.crime !== 'string') return null
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
 * Safe to call at any time (AI outcomes, yearly hooks, while already in prison).
 */
export function arrestPlayer(g: GameState, crime: string, severity: number, opts: ArrestOptions = {}): void {
  const c = g.character
  if (!c.alive) return
  const name = titleCase((crime || 'Disorderly Conduct').trim().slice(0, 60)) || 'Disorderly Conduct'
  const sev = clamp(Math.round(Number.isFinite(severity) ? severity : 2), 1, 5)
  const evidence = clamp(opts.evidence ?? 0.65, 0, 1)

  // Already behind bars: charged inside, time added, no trial.
  if (c.prison) {
    const idx = markCaught(g, name, opts.recordIndex)
    c.criminalRecord[idx].convicted = true
    count(g, 'arrests')
    const add = Math.max(1, Math.round(sev * (1 + rand(g))))
    c.criminalRecord.pop() // addPrisonTime records the conviction itself
    if (idx < c.criminalRecord.length) c.criminalRecord[idx].convicted = true
    addPrisonTime(g, add, name)
    const extra = c.prison.life || c.prison.deathRow ? 'Not that it changes much for you.' : `${years(add)} were added to your sentence.`
    notice(g, 'Charged', `You were convicted of ${name.toLowerCase()} while already in prison. ${extra}`, { emoji: '\u{2696}\u{FE0F}', tone: 'bad' })
    return
  }

  // Little kids get a lecture, not a trial.
  if (c.age < 10) {
    for (const p of parents(g)) addRelationship(p, -randInt(g, 3, 8))
    log(g, `The police caught me ${name === 'Disorderly Conduct' ? 'causing trouble' : `doing something I shouldn't (${name.toLowerCase()})`} and drove me home.`, 'bad')
    notice(g, 'Busted', `A police officer caught you and drove you home. After a long lecture about ${name.toLowerCase()}, your parents grounded you for what feels like forever.`, {
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
  }
  log(g, `I was arrested for ${name.toLowerCase()}.`, 'bad')
  if (opts.noResist) {
    toLawyer(g, trial)
    return
  }
  const bribe = bribeAmount(g, sev)
  const intro =
    opts.context ??
    pick(g, [
      `The police caught you red-handed. You're under arrest for ${name.toLowerCase()}.`,
      `Sirens! An officer slapped the cuffs on you for ${name.toLowerCase()}.`,
      `"Freeze!" The police have you dead to rights for ${name.toLowerCase()}.`,
    ])
  scriptChoice(g, ARREST_SCRIPT, 'Busted!', `${intro} What do you do?`, [
    { id: 'cooperate', label: 'Cooperate', emoji: '\u{1F64C}' },
    { id: 'run', label: 'Run', emoji: '\u{1F3C3}' },
    { id: 'bribe', label: `Bribe the officer (${formatMoney(bribe)})`, emoji: '\u{1F4B5}' },
    { id: 'insult', label: 'Insult the officer', emoji: '\u{1F595}' },
  ], { emoji: '\u{1F6A8}', data: trialJson(trial) })
}

defineScript(ARREST_SCRIPT, (g, choice, data) => {
  const t = asTrial(data)
  const c = g.character
  if (!t || !c.alive || c.prison) return
  if (choice === 'run') {
    const p = clamp(0.1 + (c.hidden.athleticism - 50) / 500 + (c.age < 30 ? 0.02 : -0.03), 0.04, 0.22)
    if (chance(g, p)) {
      unmarkCaught(g, t)
      c.wantedLevel = clamp(c.wantedLevel + 2, 0, 5)
      log(g, 'I ran from the police and got away!', 'event')
      outcome(g, 'Got Away!', pick(g, ['You juked the officer, hopped a fence and vanished down an alley. The police are still looking for you.', 'You ran like the wind. The officer, sadly for him, ran like a light breeze. You got away, for now.']), '\u{1F3C3}', 'good')
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
    const p = [0.6, 0.45, 0.25, 0.08, 0.02][t.severity - 1] ?? 0.1
    if (chance(g, p)) {
      spend(g, amount)
      unmarkCaught(g, t)
      log(g, `I bribed a police officer with ${formatMoney(amount)} to let me go.`, 'event')
      outcome(g, 'Bribed', `The officer looked around, pocketed the ${formatMoney(amount)}, and told you to get lost. Nobody saw anything.`, '\u{1F4B5}', 'good')
      return
    }
    if (chance(g, 0.5)) {
      spend(g, amount)
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
    const insult = pick(g, ['a donut-eating mall cop reject', 'a traffic cone with a badge', 'a discount action figure', "the reason your hometown's crime rate is so high"])
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

function makeLawyers(g: GameState, sev: number): LawyerOption[] {
  const c = g.character
  const mult = [0.5, 0.8, 1.2, 2, 3][sev - 1] ?? 1
  const lawyerName = () => {
    const gender: Gender = chance(g, 0.5) ? 'male' : 'female'
    return `${randomFirstName(g, c.countryId, gender)} ${randomLastName(g, c.countryId)}`
  }
  return [
    { id: 'pd', name: 'Public Defender', fee: 0, quality: 0.1, blurb: 'overworked and has 80 other cases' },
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
    scriptChoice(g, FEDS_SCRIPT, 'A Deal', `Federal agents pulled you into an interrogation room. They know you're with the ${fam.name}. Agent ${agent} slides a deal across the table: wear a wire and gather evidence on the family, and these charges disappear.`, [
      { id: 'rat', label: 'Become an informant', emoji: '\u{1F400}' },
      { id: 'refuse', label: '"I don\'t know any family."', emoji: '\u{1F910}' },
    ], { emoji: '\u{1F575}\u{FE0F}', data: trialJson(t) })
    return
  }
  t.lawyers = makeLawyers(g, t.severity)
  const lines = t.lawyers.map((l) => (l.fee > 0 ? `${l.name}: ${l.blurb}.` : `A public defender: ${l.blurb}.`))
  const choices: ChoiceOption[] = t.lawyers.map((l) => ({
    id: l.id,
    label: l.fee > 0 ? `${l.name} (${formatMoney(l.fee)})` : 'Public Defender (free)',
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
    fam.informant = { years: 0, evidence: 0 }
    for (const i of t.records) {
      const r = c.criminalRecord[i]
      if (r) r.convicted = false
    }
    log(g, 'I agreed to become a federal informant.', 'event')
    remember(g, `Secretly became a federal informant against the ${fam.name}.`)
    outcome(g, 'Wired', `The charges quietly vanished. You now work for the feds. Gather enough evidence on the ${fam.name} within 5 years, and don't get caught. Rats don't retire in this business.`, '\u{1F400}', 'event')
    return
  }
  toLawyer(g, t)
})

defineScript(LAWYER_SCRIPT, (g, choice, data) => {
  const t = asTrial(data)
  const c = g.character
  if (!t || !c.alive || c.prison) return
  const pd = t.lawyers.find((l) => l.id === 'pd') ?? { id: 'pd', name: 'Public Defender', fee: 0, quality: 0.1, blurb: '' }
  let lawyer = t.lawyers.find((l) => l.id === choice) ?? pd
  if (lawyer.fee > 0) {
    if (!spend(g, lawyer.fee)) {
      notice(g, "Can't Afford It", `You can't afford ${lawyer.name}'s ${formatMoney(lawyer.fee)} retainer. The court appointed a public defender instead.`, { emoji: '\u{1F4B8}', tone: 'bad' })
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
    const who = lawyer.id === 'pd' ? 'Your public defender' : lawyer.name
    const advice = t.evidence >= 0.7 ? `${who} whispers that you should take it.` : `${who} thinks you can win at trial.`
    scriptChoice(g, PLEA_SCRIPT, 'Plea Deal', `The prosecutor offered you a plea deal: plead guilty to ${t.crime.toLowerCase()} and serve ${years(t.plea)}${where}. ${advice}`, [
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

function acquit(g: GameState, t: TrialData): void {
  const c = g.character
  for (const i of t.records) {
    const r = c.criminalRecord[i]
    if (r) r.convicted = false
  }
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
  const sue = t.falseAccusation ? ' You were falsely accused, and you might have grounds to sue the police department.' : ''
  const fu = fugitiveInfo(g)
  if (fu) {
    const add = randInt(g, 2, 4)
    c.criminalRecord.push({ crime: 'Felony Escape', age: c.age, caught: true, convicted: true, sentenceYears: add })
    count(g, 'convictions')
    const at = g.queue.length
    sendToPrison(g, fu.crime, fu.yearsLeft >= 99 ? 0 : fu.yearsLeft + add, { security: 'maximum', life: fu.yearsLeft >= 99 && !fu.deathRow, deathRow: fu.deathRow, quiet: true, severity: 4 })
    const where = c.prison?.name ?? 'prison'
    insertNoticeAt(g, at, 'Not Guilty... But', `${who}The jury found you NOT GUILTY! Unfortunately, the bailiff recognized you as an escaped convict from ${fu.prison}. You were sent straight to ${where}.`, '\u{2696}\u{FE0F}', 'bad')
    return
  }
  outcome(g, 'Not Guilty!', `${who}The jury found you NOT GUILTY of ${chargeList(t)}! You walked out of the courthouse a free ${c.age < 18 ? 'kid' : 'person'}.${sue}`, '\u{1F389}', 'good')
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
    c.criminalRecord.push({ crime: 'Felony Escape', age: c.age, caught: true, convicted: true, sentenceYears: add })
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
    : pick(g, [
        `The jury found you GUILTY of ${chargeList(t)}. The judge sentenced you to ${term} at ${where}.`,
        `GUILTY. The judge banged the gavel and sentenced you to ${term} at ${where}.`,
        `After two hours of deliberation, the jury came back: guilty on all counts. You've been sentenced to ${term} at ${where}.`,
      ])
  const adult = s.triedAsAdult ? ' You were tried as an adult.' : ''
  log(g, plea ? `I took a plea deal: ${term.split('.')[0]}.` : `I was found guilty of ${chargeList(t)}.`, 'bad')
  insertNoticeAt(g, at, plea ? 'Plea Accepted' : 'Guilty', `${head}${adult}${notes.length ? ` ${notes.join(' ')}` : ''}`, deathRow ? '\u{26B0}\u{FE0F}' : '\u{2696}\u{FE0F}', 'bad')
}
