// Prison life: sentences, cellmates, release, the prison activity menu, parole, appeals,
// riots, gangs, death row, and the escape maze (engine-generated, always solvable).
import {
  addHidden,
  addMoney,
  addPersonStat,
  addRelationship,
  addStat,
  canAfford,
  clamp,
  count,
  currentPartner,
  endJob,
  formatMoney,
  fullName,
  getPerson,
  inPrison,
  log,
  minigame,
  notice,
  parents,
  peopleBy,
  pronouns,
  relationLabel,
  remember,
  scriptChoice,
  spend,
  useYearAction,
  yearActionsUsed,
} from './core'
import { killCharacter } from './death'
import { createPerson, notePerson } from './people'
import { chance, pick, rand, randInt, shuffle } from './rng'
import { defineScript } from './scripts'
import { getCountry, randomFirstName, randomLastName } from './world'
import type {
  ChoiceOption,
  GameState,
  Gender,
  Json,
  MenuAction,
  MenuGroup,
  MenuInfo,
  MenuNode,
  Person,
  Prison,
  Residence,
} from './types'

// ---------------------------------------------------------------------------
// Shared helpers & per-sentence data

type Security = Prison['security']

/** Flag holding PrisonLife while the player is locked up. */
export const PRISON_LIFE_FLAG = 'prisonLife'
/** Flag holding FugitiveInfo while the player is on the run after an escape. */
export const FUGITIVE_FLAG = 'fugitive'

export interface PrisonLife {
  /** Good behavior 0-100; drives parole. */
  behavior: number
  juvenile: boolean
  /** Where the player lived before prison (restored on release when possible). */
  prevResidence: Residence | null
  /** Prison job title and yearly wage. */
  job: string | null
  jobWage: number
  /** Gangs operating in this prison. */
  gangs: string[]
  /** Death row bookkeeping. */
  deathRowYears: number
  autoAppeals: number
  paroleHearings: number
  /** Riots started during this sentence (each one makes the next harder). */
  riots: number
  /** A bribed guard looks the other way during the next escape attempt. */
  bribedGuard: boolean
  severity: number
  originalSentence: number
  /** Crime-family membership survives prison (BitLife rule). */
  admittedAge: number
}

export interface FugitiveInfo {
  crime: string
  /** Years still owed (99 for life / death row). */
  yearsLeft: number
  prison: string
  security: Security
  escapedAge: number
  deathRow: boolean
}

function isRecord(v: Json | undefined): v is { [key: string]: Json } {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Per-sentence prison data (created on demand while in prison). */
export function prisonLife(g: GameState): PrisonLife {
  const raw = g.flags[PRISON_LIFE_FLAG]
  if (isRecord(raw)) return raw as unknown as PrisonLife
  const fresh: PrisonLife = {
    behavior: 50,
    juvenile: g.character.age < 18,
    prevResidence: null,
    job: null,
    jobWage: 0,
    gangs: [],
    deathRowYears: 0,
    autoAppeals: 0,
    paroleHearings: 0,
    riots: 0,
    bribedGuard: false,
    severity: 2,
    originalSentence: g.character.prison?.sentenceYears ?? 0,
    admittedAge: g.character.age,
  }
  g.flags[PRISON_LIFE_FLAG] = fresh as unknown as Json
  return fresh
}

export function fugitiveInfo(g: GameState): FugitiveInfo | null {
  const raw = g.flags[FUGITIVE_FLAG]
  return isRecord(raw) ? (raw as unknown as FugitiveInfo) : null
}

/** Multiplier for prices and loot in the player's country (dollars everywhere, scaled by wealth). */
export function moneyScale(g: GameState): number {
  return clamp(getCountry(g.character.countryId).wealth, 0.25, 1.6)
}

/** Years left on the current sentence (Infinity for life / death row). */
export function yearsLeft(g: GameState): number {
  const p = g.character.prison
  if (!p) return 0
  if (p.life || p.deathRow) return Infinity
  return Math.max(0, p.sentenceYears - p.yearsServed)
}

function years(n: number): string {
  return `${n} year${n === 1 ? '' : 's'}`
}

function securityLabel(s: Security): string {
  return s === 'minimum' ? 'Minimum Security' : s === 'medium' ? 'Medium Security' : 'Maximum Security'
}

function sentenceLabel(p: Prison): string {
  if (p.deathRow) return 'Death row'
  if (p.life) return 'Life in prison'
  return years(p.sentenceYears)
}

/** Lower health without letting a prison activity kill the player outright. */
function hurt(g: GameState, amount: number): number {
  const h = g.character.stats.health
  const dmg = Math.min(Math.round(amount), Math.max(0, h - 1))
  addStat(g, 'health', -dmg)
  return dmg
}

function guardOk(g: GameState): boolean {
  return g.character.alive && g.character.prison !== null
}

function notInPrisonReason(g: GameState): string | null {
  if (!g.character.alive) return 'You are dead.'
  if (!g.character.prison) return 'You are not in prison.'
  return null
}

const PRISON_PREFIX = [
  'Blackwater',
  'Iron Ridge',
  'Granite Falls',
  'Cold Creek',
  'Red Rock',
  'Pine Hollow',
  'Stonegate',
  'Grey Harbor',
  'Dunmore',
  'Raven Hill',
  'Copper Valley',
  'Hollow Oak',
  'Saltmarsh',
  'Crow Point',
]

function prisonName(g: GameState, security: Security, juvenile: boolean): string {
  const prefix = pick(g, PRISON_PREFIX)
  if (juvenile) return chance(g, 0.5) ? `${g.character.city} Juvenile Detention Center` : `${prefix} Youth Correctional Center`
  if (security === 'minimum') return pick(g, [`${prefix} Correctional Camp`, `${prefix} County Jail`])
  if (security === 'medium') return pick(g, [`${prefix} Correctional Facility`, `${prefix} State Prison`])
  return pick(g, [`${prefix} State Penitentiary`, `${prefix} Maximum Security Prison`])
}

const GANG_NAMES = [
  'Iron Saints',
  'Cell Block Kings',
  'Concrete Cobras',
  'Lockdown Lords',
  'Yard Dogs',
  'Midnight Mob',
  'Rusty Shank Society',
  'Brotherhood of the Bunk',
  'Solitary Syndicate',
  'Orange Jumpsuit Army',
  'Commissary Cartel',
  'Tier Three Titans',
]

const INMATE_CRIMES = [
  'Armed Robbery',
  'Grand Theft Auto',
  'Tax Evasion',
  'Arson',
  'Burglary',
  'Fraud',
  'Assault',
  'Drug Trafficking',
  'Murder',
  'Identity Theft',
  'Aggravated Twerking',
  'Counterfeiting',
  'Racketeering',
  'Smuggling',
  'Embezzlement',
  'Bank Robbery',
]

const JUVIE_CRIMES = ['Vandalism', 'Shoplifting', 'Joyriding', 'Graffiti', 'Fighting', 'Breaking and Entering', 'Pickpocketing', 'Criminal Mischief']

const INMATE_TYPES = [
  'a scrawny check forger',
  'a tattooed biker',
  'a giant everyone calls "Tiny"',
  'a quiet tax evader',
  'a washed-up boxer',
  'a chatty car thief',
  'a toothless old-timer',
  'a jittery hacker',
  'a bodybuilder who never stops counting reps',
  'a former mob accountant',
  'a guy who claims he is innocent',
  'a poet doing time for arson',
]

const NICKNAMES = ['Knuckles', 'Slim', 'Moose', 'Shivs', 'Biscuit', 'Tank', 'Whisper', 'Lefty', 'Gravy', 'Sarge', 'Domino', 'Bones', 'Pockets', 'Smiles']

function inmateName(g: GameState, gender: Gender): string {
  const first = randomFirstName(g, g.character.countryId, gender)
  return `${first} "${pick(g, NICKNAMES)}" ${randomLastName(g, g.character.countryId)}`
}

function cellmates(g: GameState): Person[] {
  const p = g.character.prison
  if (!p) return []
  return g.people.filter((x) => x.alive && x.relation === 'cellmate' && x.contextId === p.name)
}

function createCellmate(g: GameState, prisonNameStr: string, juvenile: boolean): Person {
  const c = g.character
  const age = juvenile ? randInt(13, 17) : Math.max(18, c.age + randInt(-12, 15))
  const crime = pick(g, juvenile ? JUVIE_CRIMES : INMATE_CRIMES)
  const person = createPerson(g, {
    relation: 'cellmate',
    age,
    gender: c.gender,
    occupation: 'Prisoner',
    relationship: randInt(20, 55),
    contextId: prisonNameStr,
    money: randInt(0, 400),
    data: { crime, sentence: crime === 'Murder' ? randInt(25, 99) : randInt(2, 20) },
  })
  notePerson(person, `Met in ${prisonNameStr}; doing time for ${crime.toLowerCase()}.`)
  return person
}

function dropOutOfSchool(g: GameState): boolean {
  const edu = g.character.education
  const cur = edu.current
  if (!cur) return false
  if (!edu.droppedOut.includes(cur.level)) edu.droppedOut.push(cur.level)
  edu.current = null
  return true
}

// ---------------------------------------------------------------------------
// Going in

export interface PrisonOptions {
  life?: boolean
  deathRow?: boolean
  /** Defaults to age < 18. */
  juvenile?: boolean
  security?: Security
  /** 1-5; used for appeal prices and parole. */
  severity?: number
  /** Skip the "locked up" popup (the caller already showed the verdict). */
  quiet?: boolean
}

/**
 * Lock the player up. Ends jobs, drops out of school, moves them into a cell with 1-2
 * cellmates, and gives their partner a chance to leave. If already in prison, the
 * sentence is extended instead.
 */
export function sendToPrison(g: GameState, crime: string, yearsIn: number, opts: PrisonOptions = {}): void {
  const c = g.character
  if (!c.alive) return
  const sentence = Math.max(0, Math.round(Number.isFinite(yearsIn) ? yearsIn : 0))
  if (c.prison) {
    if (opts.deathRow && !c.prison.deathRow) {
      c.prison.deathRow = true
      c.prison.life = true
      c.prison.security = 'maximum'
      const pl = prisonLife(g)
      pl.autoAppeals = randInt(2, 5)
      log(g, `I was sentenced to death for ${crime.toLowerCase()}.`, 'bad')
      return
    }
    if (opts.life && !c.prison.life) {
      c.prison.life = true
      c.prison.security = 'maximum'
      log(g, `I was sentenced to life in prison for ${crime.toLowerCase()}.`, 'bad')
      return
    }
    addPrisonTime(g, Math.max(1, sentence), crime)
    return
  }

  const juvenile = opts.juvenile ?? c.age < 18
  const deathRow = !!opts.deathRow && !juvenile
  const life = !!opts.life || deathRow
  const security: Security =
    opts.security ?? (juvenile ? 'minimum' : life || sentence > 15 ? 'maximum' : sentence > 4 ? 'medium' : 'minimum')

  endJob(g, 'job', 'prison')
  endJob(g, 'partTimeJob', 'prison')
  const droppedOut = dropOutOfSchool(g)

  const name = prisonName(g, security, juvenile)
  const prevResidence: Residence = { ...c.residence }
  c.prison = {
    name,
    security,
    crime,
    sentenceYears: life ? Math.max(sentence, 0) : Math.max(1, sentence),
    yearsServed: 0,
    respect: randInt(15, 35),
    appealed: false,
    escapeAttempts: 0,
  }
  if (life) c.prison.life = true
  if (deathRow) c.prison.deathRow = true
  c.residence = { status: 'prison', description: name }
  c.wantedLevel = 0
  delete g.flags[FUGITIVE_FLAG]

  // Fresh per-sentence data.
  delete g.flags[PRISON_LIFE_FLAG]
  const pl = prisonLife(g)
  pl.juvenile = juvenile
  pl.prevResidence = prevResidence
  pl.severity = clamp(Math.round(opts.severity ?? (life ? 5 : sentence > 15 ? 4 : sentence > 5 ? 3 : 2)), 1, 5)
  pl.originalSentence = c.prison.sentenceYears
  pl.admittedAge = c.age
  pl.gangs = security === 'minimum' ? [] : shuffle(g, GANG_NAMES).slice(0, 3)
  pl.autoAppeals = deathRow ? randInt(2, 5) : 0
  pl.behavior = 50

  // Cellmates.
  const mates: Person[] = []
  const n = juvenile ? 1 : randInt(1, 2)
  for (let i = 0; i < n; i++) mates.push(createCellmate(g, name, juvenile))

  count(g, 'imprisonments')
  const sentenceText = deathRow ? 'on death row' : life ? 'a life sentence' : years(c.prison.sentenceYears)
  log(g, `I was sent to ${name} for ${crime.toLowerCase()} (${sentenceText}).`, 'bad')
  remember(g, `Imprisoned in ${name} for ${crime.toLowerCase()} (${sentenceText}).`)
  addStat(g, 'happiness', -randInt(10, 25))

  if (!opts.quiet) {
    const mateText = mates.length
      ? ` Your cellmate${mates.length > 1 ? 's are' : ' is'} ${mates.map((m) => `${fullName(m)}, in for ${String(m.data.crime ?? 'something').toLowerCase()}`).join(' and ')}.`
      : ''
    const where = juvenile ? 'juvenile detention' : securityLabel(security).toLowerCase() + ' prison'
    notice(
      g,
      deathRow ? 'Death Row' : 'Locked Up',
      `You've been sent to ${name}, a ${where}, ${deathRow ? 'to await execution' : `to serve ${sentenceText}`} for ${crime.toLowerCase()}.${mateText}`,
      { emoji: deathRow ? '\u{2696}\u{FE0F}' : '\u{1F512}', tone: 'bad' },
    )
  }
  if (droppedOut) log(g, 'I was forced to drop out of school.', 'bad')
  partnerReacts(g, life ? 99 : c.prison.sentenceYears)
}

/** A romantic partner may leave the player when they're locked up. */
function partnerReacts(g: GameState, sentence: number): void {
  const partner = currentPartner(g)
  if (!partner) return
  const p = pronouns(partner.gender)
  const base = partner.relation === 'spouse' ? 0.2 : partner.relation === 'fiance' ? 0.35 : 0.5
  const leaveChance = clamp(base + (sentence >= 10 ? 0.25 : sentence >= 4 ? 0.1 : 0) - (partner.relationship - 50) / 200, 0.05, 0.95)
  if (!chance(g, leaveChance)) {
    addRelationship(partner, -randInt(5, 15))
    notePerson(partner, 'Stood by me when I went to prison.')
    return
  }
  const label = relationLabel(partner).toLowerCase()
  if (partner.relation === 'spouse') {
    partner.relation = 'exSpouse'
    count(g, 'divorces')
    log(g, `My ${label} ${partner.firstName} divorced me while I was in prison.`, 'bad')
  } else {
    partner.relation = 'ex'
    log(g, `My ${label} ${partner.firstName} broke up with me after I went to prison.`, 'bad')
  }
  partner.livesWithPlayer = false
  partner.relationship = Math.min(partner.relationship, randInt(5, 30))
  notePerson(partner, 'Left me when I went to prison.')
  addStat(g, 'happiness', -randInt(8, 15))
  notice(
    g,
    'Heartbreak Behind Bars',
    pick(g, [
      `${partner.firstName} visited one last time to tell you ${p.he} can't wait around for you. ${p.He} ended your relationship through the visiting-room glass.`,
      `You received a letter from ${partner.firstName}. It was short: ${p.he}'s moving on without you.`,
      `${partner.firstName} decided ${p.he} didn't sign up for a relationship with an inmate. You've been dumped.`,
    ]),
    { emoji: '\u{1F494}', tone: 'bad' },
  )
}

/** Add years to the current sentence (attempted escape, assault inside, riots...). */
export function addPrisonTime(g: GameState, add: number, charge: string): void {
  const c = g.character
  const p = c.prison
  if (!p || !c.alive) return
  const n = Math.max(1, Math.round(add))
  c.criminalRecord.push({ crime: charge, age: c.age, caught: true, convicted: true, sentenceYears: n })
  count(g, 'convictions')
  if (p.life || p.deathRow) {
    log(g, `I was convicted of ${charge.toLowerCase()} inside prison.`, 'bad')
    return
  }
  p.sentenceYears += n
  log(g, `${years(n)} were added to my sentence for ${charge.toLowerCase()}.`, 'bad')
}

function raiseSecurity(g: GameState): string | null {
  const c = g.character
  const p = c.prison
  if (!p || p.security === 'maximum') return null
  const pl = prisonLife(g)
  if (pl.juvenile && c.age < 18) return null
  p.security = p.security === 'minimum' ? 'medium' : 'maximum'
  const old = p.name
  p.name = prisonName(g, p.security, false)
  // Cellmates stay behind; new ones arrive.
  g.people = g.people.filter((x) => !(x.relation === 'cellmate' && x.contextId === old))
  createCellmate(g, p.name, false)
  if (pl.gangs.length === 0) pl.gangs = shuffle(g, GANG_NAMES).slice(0, 3)
  c.prison.gang = undefined
  delete c.prison.gang
  c.residence = { status: 'prison', description: p.name }
  log(g, `I was transferred to ${p.name}.`, 'bad')
  return p.name
}

// ---------------------------------------------------------------------------
// Getting out

/** Where the player lands after release. */
function homeAfterPrison(g: GameState, prev: Residence | null): Residence {
  const c = g.character
  const hasParents = parents(g).length > 0
  if (c.age < 18 && hasParents) return { status: 'parents' }
  if (prev) {
    if (prev.status === 'owned' && prev.assetId && g.assets.some((a) => a.id === prev.assetId)) return { ...prev }
    if (prev.status === 'partner' && currentPartner(g)) return { status: 'partner' }
    if ((prev.status === 'parents' || prev.status === 'dorm') && hasParents && c.age < 30) return { status: 'parents' }
  }
  const home = g.assets.find((a) => a.kind === 'house' && !a.rentedOutFor)
  if (home) return { status: 'owned', assetId: home.id }
  if (currentPartner(g)?.livesWithPlayer) return { status: 'partner' }
  return { status: 'homeless' }
}

/**
 * Release the player. reason: 'served' | 'parole' | 'appeal' | 'escaped' | 'pardon' | 'informant' | any text.
 * Cellmates leave the contact list (close ones become friends); an escape makes the player a fugitive.
 */
export function releaseFromPrison(g: GameState, reason: string): void {
  const c = g.character
  const p = c.prison
  if (!p) return
  const pl = prisonLife(g)
  const escaped = reason === 'escaped'

  // Cellmates: friends if you got close, otherwise gone from your contacts.
  const keep: Person[] = []
  g.people = g.people.filter((x) => {
    if (x.relation !== 'cellmate') return true
    if (x.alive && x.relationship >= 75 && !escaped) {
      x.relation = 'friend'
      x.contextId = undefined
      delete x.contextId
      notePerson(x, `We were cellmates in ${p.name}.`)
      keep.push(x)
      return true
    }
    return false
  })

  const servedYears = p.yearsServed
  c.prison = null
  c.residence = homeAfterPrison(g, pl.prevResidence)
  delete g.flags[PRISON_LIFE_FLAG]

  if (escaped) {
    const left = p.life || p.deathRow ? 99 : Math.max(1, p.sentenceYears - p.yearsServed)
    const info: FugitiveInfo = {
      crime: p.crime,
      yearsLeft: left,
      prison: p.name,
      security: p.security,
      escapedAge: c.age,
      deathRow: !!p.deathRow,
    }
    g.flags[FUGITIVE_FLAG] = info as unknown as Json
    c.wantedLevel = 5
    log(g, `I escaped from ${p.name}!`, 'event')
    remember(g, `Escaped from ${p.name}; now a fugitive.`)
  } else {
    c.wantedLevel = 0
    delete g.flags[FUGITIVE_FLAG]
    const line: Record<string, string> = {
      served: `I was released from ${p.name} after serving my sentence.`,
      parole: `I was granted parole and walked out of ${p.name}.`,
      appeal: `My conviction was overturned on appeal and I walked out of ${p.name}.`,
      pardon: `I was pardoned and released from ${p.name}.`,
      informant: `I was released from ${p.name} in exchange for my cooperation.`,
      commuted: `My sentence was commuted and I was released from ${p.name}.`,
    }
    log(g, line[reason] ?? `I was released from ${p.name}.`, 'good')
    remember(g, `Released from ${p.name} after ${years(servedYears)} (${reason}).`)
    addStat(g, 'happiness', randInt(10, 25))
  }
  for (const k of keep) log(g, `My former cellmate ${k.firstName} and I stayed friends.`, 'neutral')
}

function releaseNotice(g: GameState, title: string, text: string): void {
  const where = g.character.residence.status
  const extra =
    where === 'homeless'
      ? ' With nowhere else to go, you are now homeless.'
      : where === 'parents'
        ? ' You moved back in with your parents.'
        : where === 'partner'
          ? ' You moved back in with your partner.'
          : where === 'owned'
            ? ' You headed home.'
            : ''
  notice(g, title, text + extra, { emoji: '\u{1F54A}\u{FE0F}', tone: 'good' })
}

// ---------------------------------------------------------------------------
// Yearly prison life (called from crime.yearlyCrime)

/** One year behind bars. Returns true if the player is no longer in prison (released or dead). */
export function yearlyPrison(g: GameState): boolean {
  const c = g.character
  const p = c.prison
  if (!p || !c.alive) return true
  const pl = prisonLife(g)
  count(g, 'prisonYears')
  p.yearsServed += 1

  // Prison wears you down.
  const comfort = (p.gang ? 3 : 0) + (p.respect >= 60 ? 2 : 0) + (pl.job ? 2 : 0)
  addStat(g, 'happiness', -Math.max(1, randInt(4, 12) - comfort))
  addStat(g, 'health', -randInt(0, 4))
  addStat(g, 'looks', -randInt(0, 2))
  pl.behavior = clamp(pl.behavior + 3)
  if (p.gang) p.respect = clamp(p.respect + 3)
  for (const m of cellmates(g)) {
    m.age += 0
    m.yearsKnown += 0
  }

  if (pl.job && pl.jobWage > 0) {
    addMoney(g, pl.jobWage)
    pl.behavior = clamp(pl.behavior + 3)
  }

  // Juveniles who turn 18 with time left are moved to an adult facility.
  if (pl.juvenile && c.age >= 18 && (p.life || p.sentenceYears - p.yearsServed > 0)) {
    pl.juvenile = false
    const old = p.name
    p.security = p.life ? 'maximum' : 'medium'
    p.name = prisonName(g, p.security, false)
    g.people = g.people.filter((x) => !(x.relation === 'cellmate' && x.contextId === old))
    createCellmate(g, p.name, false)
    pl.gangs = shuffle(g, GANG_NAMES).slice(0, 3)
    c.residence = { status: 'prison', description: p.name }
    log(g, `I turned 18 and was transferred to ${p.name}.`, 'bad')
    notice(g, 'Transferred', `You aged out of juvenile detention. The rest of your sentence will be served at ${p.name}, with the grown-ups.`, {
      emoji: '\u{1F68C}',
      tone: 'bad',
    })
  }

  if (p.deathRow) return yearlyDeathRow(g)

  // Sentence complete.
  if (!p.life && p.yearsServed >= p.sentenceYears) {
    const name = p.name
    releaseFromPrison(g, 'served')
    releaseNotice(
      g,
      'Free at Last',
      pick(g, [
        `You've served your time. The gates of ${name} clanged shut behind you as you stepped into the sunlight.`,
        `After ${years(p.yearsServed)} inside, the guards handed back your old clothes and a bus ticket. You're a free ${g.character.gender === 'male' ? 'man' : 'woman'}.`,
        `Your sentence is over. You walked out of ${name} and took a deep breath of air that didn't smell like a cafeteria.`,
      ]),
    )
    return true
  }

  // Parole board.
  if (paroleEligible(g) && chance(g, 0.5)) {
    paroleHearing(g)
    return false
  }

  prisonEvent(g)
  return false
}

function yearlyDeathRow(g: GameState): boolean {
  const c = g.character
  const p = c.prison
  if (!p) return true
  const pl = prisonLife(g)
  pl.deathRowYears += 1
  if (pl.autoAppeals > 0) {
    pl.autoAppeals -= 1
    if (chance(g, 0.08)) {
      p.deathRow = undefined
      delete p.deathRow
      p.life = true
      log(g, 'My death sentence was commuted to life in prison.', 'good')
      notice(g, 'Commuted', 'An appeals court reviewed your case and commuted your death sentence to life in prison. You get to keep breathing, just not anywhere nice.', {
        emoji: '\u{2696}\u{FE0F}',
        tone: 'good',
      })
      return false
    }
    log(g, pl.autoAppeals > 0 ? 'Another one of my death row appeals was denied.' : 'My final appeal was denied.', 'bad')
    if (pl.autoAppeals === 0) {
      notice(g, 'Final Appeal Denied', 'Your final appeal was denied. The warden has scheduled your execution for next year. Make your peace.', {
        emoji: '\u{1F4C5}',
        tone: 'bad',
      })
    }
    return false
  }
  notice(
    g,
    'Execution',
    pick(g, [
      `Your appeals ran out. After ${years(pl.deathRowYears)} on death row, the state carried out your execution at ${p.name}.`,
      `The governor never called. You ate your last meal, said your last words, and the state carried out your sentence.`,
    ]),
    { emoji: '\u{26B0}\u{FE0F}', tone: 'bad' },
  )
  killCharacter(g, 'Execution')
  return true
}

// ---------------------------------------------------------------------------
// Parole

function paroleEligible(g: GameState): boolean {
  const p = g.character.prison
  if (!p || p.deathRow) return false
  const pl = prisonLife(g)
  if (pl.behavior < 40) return false
  if (p.life) return p.yearsServed >= 25
  const left = p.sentenceYears - p.yearsServed
  return left >= 1 && p.yearsServed >= Math.max(1, Math.ceil(p.sentenceYears * 0.4))
}

interface ParoleQuestion {
  q: string
  good: string[]
  neutral: string[]
  bad: string[]
}

const PAROLE_QUESTIONS: ParoleQuestion[] = [
  {
    q: 'Do you feel that you have been rehabilitated?',
    good: ["I'm ready to rejoin society", 'Yes, I improve every single day', "I think I've earned another chance"],
    neutral: ["I'm like 90% rehabilitated", 'Define "rehabilitated"'],
    bad: ["Prisons don't rehabilitate anyone", 'Fo shizzle, now open the gate'],
  },
  {
    q: 'Do you plan on getting a job if paroled?',
    good: ['Getting a job is my top priority', "I'm excited to be gainfully employed", 'I already have leads lined up'],
    neutral: ["I'll get my hustle on", 'Something will turn up'],
    bad: ["I'm not trying to work", 'Crime has better hours'],
  },
  {
    q: 'Do you regret your mistakes?',
    good: ["I'm truly remorseful for my actions", 'Yes, I wish I could take them back', 'Every day'],
    neutral: ["No more boo-boos for me", "I've been innocent all along"],
    bad: ['#NoRegrets', "They weren't mistakes"],
  },
  {
    q: 'Do you think you will struggle to readjust to society?',
    good: ["No, I'm in the right frame of mind now", "I've built a support system on the outside"],
    neutral: ['Maybe, but I can handle it', 'What year is it out there?'],
    bad: ["No, I've mastered the criminal life", 'Society should readjust to me'],
  },
  {
    q: 'Why should you be released?',
    good: ['I deserve a second chance', "I've been corrected", "I'm ready to start my new life"],
    neutral: ['The food here is terrible', 'My cellmate snores'],
    bad: ['Because I said so', 'So I can settle some scores'],
  },
]

const PAROLE_SCRIPT = defineScript('prison.parole', (g, choice, data) => {
  const c = g.character
  const p = c.prison
  if (!p || !c.alive || !isRecord(data)) return
  const pl = prisonLife(g)
  pl.paroleHearings += 1
  const good = Array.isArray(data.good) ? data.good : []
  const neutral = Array.isArray(data.neutral) ? data.neutral : []
  const tier = good.includes(choice) ? 'good' : neutral.includes(choice) ? 'neutral' : 'bad'
  const p0 = tier === 'good' ? 0.35 + pl.behavior / 250 : tier === 'neutral' ? 0.12 + pl.behavior / 600 : 0.03
  const granted = chance(g, clamp(p0 - p.escapeAttempts * 0.08, 0.02, 0.8))
  if (granted) {
    const name = p.name
    releaseFromPrison(g, 'parole')
    releaseNotice(
      g,
      'Parole Granted',
      pick(g, [
        `The parole board was convinced. You've been released from ${name} early on good behavior. Don't make them regret it.`,
        `After a long pause, the chairman stamped your file: GRANTED. You're walking out of ${name} early.`,
      ]),
    )
    return
  }
  log(g, 'The parole board denied my parole.', 'bad')
  addStat(g, 'happiness', -randInt(3, 8))
  notice(
    g,
    'Parole Denied',
    tier === 'bad'
      ? pick(g, [
          'The board members exchanged a look, then denied your parole before you finished your sentence. The literal one.',
          'One board member laughed out loud. Parole denied.',
        ])
      : pick(g, [
          "The board thanked you for your time and denied your parole. Maybe next time.",
          'The board decided you need a little more time to reflect. Parole denied.',
        ]),
    { emoji: '\u{1F6AB}', tone: 'bad' },
  )
})

function paroleHearing(g: GameState): void {
  const q = pick(g, PAROLE_QUESTIONS)
  const good = shuffle(g, q.good).slice(0, 2)
  const neutral = shuffle(g, q.neutral).slice(0, 1)
  const bad = shuffle(g, q.bad).slice(0, 1)
  const all = shuffle(g, [...good, ...neutral, ...bad])
  const choices: ChoiceOption[] = all.map((label, i) => ({ id: `a${i}`, label }))
  const idOf = (label: string) => choices.find((ch) => ch.label === label)?.id ?? ''
  scriptChoice(g, PAROLE_SCRIPT, 'Parole Board', `You've been called before the parole board. The chairman peers over his glasses: "${q.q}"`, choices, {
    emoji: '\u{1F9D1}\u{200D}\u{2696}\u{FE0F}',
    data: { good: good.map(idOf), neutral: neutral.map(idOf) },
  })
}

// ---------------------------------------------------------------------------
// Random prison events

const DESSERTS = ['pudding cup', 'chocolate brownie', 'slice of cornbread', 'jello', 'cinnamon roll', 'honey bun']
const CARE_ITEMS = ['homemade cookies', 'a stack of comic books', 'warm socks', 'a crossword book', 'instant noodles', 'a photo album', 'a harmonica']

const EVENT_DESSERT = defineScript('prison.event.dessert', (g, choice, data) => {
  const c = g.character
  const p = c.prison
  if (!p || !c.alive || !isRecord(data)) return
  const bully = String(data.name ?? 'The inmate')
  const dessert = String(data.dessert ?? 'dessert')
  if (choice === 'give') {
    p.respect = clamp(p.respect - randInt(3, 6))
    log(g, `I gave ${bully} my ${dessert}.`, 'neutral')
    notice(g, 'Lunch Money', `You slid your ${dessert} across the table. ${bully} grunted. Word travels fast in here, and the word is "pushover."`, {
      emoji: '\u{1F36E}',
    })
  } else if (choice === 'fight') {
    const power = c.hidden.athleticism * 0.5 + c.stats.health * 0.3 + p.respect * 0.2 + randInt(0, 30)
    if (power > randInt(40, 100)) {
      p.respect = clamp(p.respect + randInt(8, 14))
      prisonLife(g).behavior = clamp(prisonLife(g).behavior - 8)
      log(g, `I stood up to ${bully} in the cafeteria and won.`, 'good')
      notice(g, 'Cafeteria Showdown', `You told ${bully} to back off. ${bully} took a swing and missed, and you made sure ${bully.split(' ')[0]} regretted it. The whole cafeteria saw.`, {
        emoji: '\u{1F44A}',
        tone: 'good',
      })
    } else {
      const dmg = hurt(g, randInt(8, 18))
      p.respect = clamp(p.respect - 3)
      log(g, `${bully} beat me up over a ${dessert}.`, 'bad')
      notice(g, 'Cafeteria Showdown', `You refused. ${bully} flipped the table and beat you senseless. You lost the fight and the ${dessert}. (-${dmg} health)`, {
        emoji: '\u{1F915}',
        tone: 'bad',
      })
    }
  } else {
    p.respect = clamp(p.respect - randInt(6, 10))
    const pl = prisonLife(g)
    pl.behavior = clamp(pl.behavior + 5)
    log(g, `I told a guard that ${bully} was bullying me.`, 'neutral')
    notice(g, 'Tattletale', `The guard dragged ${bully} off to solitary. The other inmates are now giving you the side-eye.`, { emoji: '\u{1F440}' })
  }
})

const EVENT_PACKAGE = defineScript('prison.event.package', (g, choice, data) => {
  const c = g.character
  const p = c.prison
  if (!p || !c.alive || !isRecord(data)) return
  const sender = getPerson(g, typeof data.personId === 'string' ? data.personId : undefined)
  const item = String(data.item ?? 'a care package')
  if (choice !== 'return' && chance(g, 0.15)) {
    const beaten = chance(g, 0.3)
    const dmg = beaten ? hurt(g, randInt(5, 12)) : 0
    log(g, 'The guards confiscated my care package.', 'bad')
    notice(g, 'Confiscated', `The guards confiscated your package before you could touch it${beaten ? `, then roughed you up for good measure. (-${dmg} health)` : '. They seemed to enjoy it.'}`, {
      emoji: '\u{1F46E}',
      tone: 'bad',
    })
    return
  }
  if (choice === 'keep') {
    addStat(g, 'happiness', randInt(5, 10))
    if (sender) addRelationship(sender, randInt(3, 8))
    log(g, `I got a care package with ${item} from ${sender ? sender.firstName : 'home'}.`, 'good')
  } else if (choice === 'share') {
    addStat(g, 'happiness', randInt(2, 5))
    p.respect = clamp(p.respect + randInt(4, 8))
    for (const m of cellmates(g)) addRelationship(m, randInt(5, 12))
    if (sender) addRelationship(sender, randInt(2, 5))
    log(g, `I shared my care package with my cellmates.`, 'good')
  } else {
    if (sender) {
      addRelationship(sender, -randInt(8, 15))
      notePerson(sender, 'I returned their care package while I was in prison.')
    }
    log(g, `I returned the care package ${sender ? `${sender.firstName} sent me` : 'from home'}.`, 'neutral')
  }
})

const EVENT_GANG_INVITE = defineScript('prison.event.gangInvite', (g, choice, data) => {
  const c = g.character
  const p = c.prison
  if (!p || !c.alive || !isRecord(data)) return
  const gang = String(data.gang ?? 'a gang')
  if (choice === 'join') {
    p.gang = gang
    p.respect = clamp(p.respect + randInt(5, 10))
    log(g, `I joined the ${gang}.`, 'event')
    notice(g, 'Jumped In', `The ${gang} welcomed you with a handshake you need three weeks to learn. You're one of them now.`, { emoji: '\u{1F91D}' })
  } else {
    p.respect = clamp(p.respect - 2)
    log(g, `I turned down an invitation to join the ${gang}.`, 'neutral')
  }
})

function prisonEvent(g: GameState): void {
  const c = g.character
  const p = c.prison
  if (!p) return
  const pl = prisonLife(g)
  const mates = cellmates(g)
  if (mates.length > 0 && chance(g, 0.5)) {
    const m = pick(g, mates)
    addRelationship(m, randInt(1, 5))
    m.yearsKnown += 1
    const story = pick(g, [
      `My cellmate ${m.firstName} told me the whole story of how ${pronouns(m.gender).he} got caught. Twice.`,
      `${m.firstName} snored all year. I counted ceiling cracks instead of sheep.`,
      `${m.firstName} taught me how to make a cake out of vending machine snacks.`,
      `${m.firstName} and I played about four hundred games of cards.`,
    ])
    log(g, story, 'neutral')
  }
  if (!chance(g, 0.45)) return
  const roll = rand(g)
  const parentsList = peopleBy(g, ['parent', 'stepparent', 'sibling', 'spouse', 'partner', 'child', 'grandparent'])
  if (p.respect < 30 && !p.gang && roll < 0.3) {
    const attacker = inmateName(g, c.gender)
    const dmg = hurt(g, randInt(6, 20))
    log(g, `An inmate named ${attacker} jumped me in the shower.`, 'bad')
    notice(g, 'Jumped', `${attacker} cornered you in the showers and beat you up just for looking soft. (-${dmg} health) Earning some respect in here might help.`, {
      emoji: '\u{1F915}',
      tone: 'bad',
    })
    return
  }
  if (roll < 0.55) {
    const name = inmateName(g, c.gender)
    const dessert = pick(g, DESSERTS)
    scriptChoice(g, EVENT_DESSERT, 'Cafeteria Trouble', `A hulking inmate named ${name} loomed over your tray and demanded your ${dessert}.`, [
      { id: 'give', label: 'Hand it over', emoji: '\u{1F36E}' },
      { id: 'fight', label: 'Tell them to get lost', emoji: '\u{1F44A}' },
      { id: 'snitch', label: 'Tell a guard', emoji: '\u{1F46E}' },
    ], { emoji: '\u{1F37D}\u{FE0F}', data: { name, dessert } })
    return
  }
  if (roll < 0.8 && parentsList.length > 0) {
    const sender = pick(g, parentsList)
    const item = pick(g, CARE_ITEMS)
    scriptChoice(g, EVENT_PACKAGE, 'Care Package', `Your ${relationLabel(sender).toLowerCase()} ${sender.firstName} sent you a care package with ${item}.`, [
      { id: 'keep', label: 'Enjoy it', emoji: '\u{1F381}' },
      { id: 'share', label: 'Share with my cellmates', emoji: '\u{1F91D}' },
      { id: 'return', label: 'Return to sender', emoji: '\u{1F4E8}' },
    ], { emoji: '\u{1F4E6}', data: { personId: sender.id, item } })
    return
  }
  if (!p.gang && pl.gangs.length > 0 && p.respect >= 55) {
    const gang = pick(g, pl.gangs)
    scriptChoice(g, EVENT_GANG_INVITE, 'Recruited', `Members of the ${gang} have noticed your reputation. They want you to join them.`, [
      { id: 'join', label: 'Join them', emoji: '\u{1F91D}' },
      { id: 'decline', label: 'Politely decline', emoji: '\u{1F645}' },
    ], { emoji: '\u{1F5E1}\u{FE0F}', data: { gang } })
  }
}

// ---------------------------------------------------------------------------
// The escape maze (Theseus-and-the-Minotaur rules, like the original game:
// guards take two steps per player step, horizontal first, and are blocked by walls)

export type EscapeDir = 'N' | 'E' | 'S' | 'W'
export interface MazePoint {
  x: number
  y: number
}

export interface EscapeMaze {
  w: number
  h: number
  /** Per cell (index y*w + x): bit 1 = wall on its east side, bit 2 = wall on its south side. Outer edges are always walls. */
  walls: number[]
  exit: MazePoint
  player: MazePoint
  guards: MazePoint[]
  /** Steps each guard takes per player move. */
  guardSpeed: number
  /** Fewest moves needed to escape (from the solver). */
  minMoves: number
  prison: string
  security: Security
}

export const ESCAPE_DIRS: EscapeDir[] = ['N', 'E', 'S', 'W']
export const DIR_DELTA: Record<EscapeDir, MazePoint> = { N: { x: 0, y: -1 }, E: { x: 1, y: 0 }, S: { x: 0, y: 1 }, W: { x: -1, y: 0 } }

interface WallGrid {
  w: number
  h: number
  walls: number[]
}

/** Can someone standing on (x, y) step in direction d? */
export function mazeCanMove(m: WallGrid, x: number, y: number, d: EscapeDir): boolean {
  const i = y * m.w + x
  switch (d) {
    case 'E':
      return x + 1 < m.w && (m.walls[i] & 1) === 0
    case 'W':
      return x - 1 >= 0 && (m.walls[i - 1] & 1) === 0
    case 'S':
      return y + 1 < m.h && (m.walls[i] & 2) === 0
    case 'N':
      return y - 1 >= 0 && (m.walls[i - m.w] & 2) === 0
  }
}

/** One guard step toward the player: horizontal first, then vertical; blocked by walls. */
export function guardStep(m: WallGrid, guard: MazePoint, player: MazePoint): MazePoint {
  if (guard.x !== player.x) {
    const d: EscapeDir = player.x > guard.x ? 'E' : 'W'
    if (mazeCanMove(m, guard.x, guard.y, d)) return { x: guard.x + DIR_DELTA[d].x, y: guard.y }
  }
  if (guard.y !== player.y) {
    const d: EscapeDir = player.y > guard.y ? 'S' : 'N'
    if (mazeCanMove(m, guard.x, guard.y, d)) return { x: guard.x, y: guard.y + DIR_DELTA[d].y }
  }
  return guard
}

/**
 * Move every guard `speed` steps toward the player. Returns each intermediate frame
 * (one array of guard positions per step) and whether the player got caught.
 */
export function advanceGuards(m: WallGrid, guards: MazePoint[], player: MazePoint, speed: number): { frames: MazePoint[][]; caught: boolean } {
  const frames: MazePoint[][] = []
  let cur = guards.map((q) => ({ ...q }))
  let caught = false
  for (let s = 0; s < speed && !caught; s++) {
    cur = cur.map((q) => (q.x === player.x && q.y === player.y ? q : guardStep(m, q, player)))
    frames.push(cur.map((q) => ({ ...q })))
    if (cur.some((q) => q.x === player.x && q.y === player.y)) caught = true
  }
  return { frames, caught }
}

/** Result of the player trying to move: 'blocked' (wall), 'caught', 'escaped' or 'moved'. */
export function playerMove(
  m: EscapeMaze,
  player: MazePoint,
  guards: MazePoint[],
  d: EscapeDir,
): { result: 'blocked' | 'caught' | 'escaped' | 'moved'; player: MazePoint; frames: MazePoint[][] } {
  if (!mazeCanMove(m, player.x, player.y, d)) return { result: 'blocked', player, frames: [] }
  const next = { x: player.x + DIR_DELTA[d].x, y: player.y + DIR_DELTA[d].y }
  if (guards.some((q) => q.x === next.x && q.y === next.y)) return { result: 'caught', player: next, frames: [] }
  if (next.x === m.exit.x && next.y === m.exit.y) return { result: 'escaped', player: next, frames: [] }
  const { frames, caught } = advanceGuards(m, guards, next, m.guardSpeed)
  return { result: caught ? 'caught' : 'moved', player: next, frames }
}

/** Breadth-first search over (player, guards) states. Returns the fewest moves to escape, or -1. */
export function solveEscapeMaze(m: EscapeMaze): number {
  const n = m.w * m.h
  const k = m.guards.length
  const idx = (q: MazePoint) => q.y * m.w + q.x
  const encode = (p: number, gs: number[]) => {
    let code = p
    let mul = n
    for (const gp of gs) {
      code += gp * mul
      mul *= n
    }
    return code
  }
  const startPlayer = idx(m.player)
  const startGuards = m.guards.map(idx)
  if (startGuards.includes(startPlayer)) return -1
  if (startPlayer === idx(m.exit)) return 0
  const seen = new Set<number>([encode(startPlayer, startGuards)])
  let frontier: [number, number[]][] = [[startPlayer, startGuards]]
  let depth = 0
  while (frontier.length > 0) {
    depth += 1
    const next: [number, number[]][] = []
    for (const [p, gs] of frontier) {
      const player = { x: p % m.w, y: Math.floor(p / m.w) }
      const guards = gs.map((gp) => ({ x: gp % m.w, y: Math.floor(gp / m.w) }))
      for (const d of ESCAPE_DIRS) {
        const res = playerMove(m, player, guards, d)
        if (res.result === 'escaped') return depth
        if (res.result !== 'moved') continue
        const finalGuards = res.frames.length > 0 ? res.frames[res.frames.length - 1] : guards
        const np = idx(res.player)
        const ngs = finalGuards.map(idx)
        const code = encode(np, ngs)
        if (seen.has(code)) continue
        seen.add(code)
        next.push([np, ngs])
      }
    }
    frontier = next
    if (k === 0 && depth > n) break
  }
  return -1
}

function gridConnected(grid: WallGrid): boolean {
  const total = grid.w * grid.h
  const seen = new Uint8Array(total)
  const stack = [0]
  seen[0] = 1
  let found = 1
  while (stack.length > 0) {
    const i = stack.pop() as number
    const x = i % grid.w
    const y = Math.floor(i / grid.w)
    for (const d of ESCAPE_DIRS) {
      if (!mazeCanMove(grid, x, y, d)) continue
      const j = (y + DIR_DELTA[d].y) * grid.w + x + DIR_DELTA[d].x
      if (!seen[j]) {
        seen[j] = 1
        found += 1
        stack.push(j)
      }
    }
  }
  return found === total
}

function randomWalls(g: GameState, w: number, h: number, density: number): number[] {
  const grid: WallGrid = { w, h, walls: new Array<number>(w * h).fill(0) }
  const segments: [number, number][] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x + 1 < w) segments.push([y * w + x, 1])
      if (y + 1 < h) segments.push([y * w + x, 2])
    }
  }
  for (const [i, bit] of shuffle(g, segments)) {
    if (!chance(g, density)) continue
    grid.walls[i] |= bit
    if (!gridConnected(grid)) grid.walls[i] &= ~bit
  }
  return grid.walls
}

function edgeCell(g: GameState, w: number, h: number, side: EscapeDir): MazePoint {
  if (side === 'N') return { x: randInt(g, 0, w - 1), y: 0 }
  if (side === 'S') return { x: randInt(g, 0, w - 1), y: h - 1 }
  if (side === 'E') return { x: w - 1, y: randInt(g, 0, h - 1) }
  return { x: 0, y: randInt(g, 0, h - 1) }
}

const OPPOSITE: Record<EscapeDir, EscapeDir> = { N: 'S', S: 'N', E: 'W', W: 'E' }

export interface MazeOptions {
  juvenile?: boolean
  /** A bribed guard: one fewer guard in the maze. */
  bribedGuard?: boolean
  prison?: string
}

/**
 * Build an escape puzzle for this security level. Always solvable: candidates are
 * verified with the solver, and the last resort is the same layout without guards
 * (the wall generator keeps every cell reachable).
 */
export function generateEscapeMaze(g: GameState, security: Security, opts: MazeOptions = {}): EscapeMaze {
  const cfg = opts.juvenile
    ? { w: 4, h: 4, guards: 1, density: 0.3, attempts: 150, wantDetour: 0, minMoves: 3 }
    : security === 'minimum'
      ? { w: 5, h: 4, guards: 1, density: 0.3, attempts: 180, wantDetour: 0, minMoves: 4 }
      : security === 'medium'
        ? { w: 6, h: 6, guards: 1, density: 0.35, attempts: 220, wantDetour: 1, minMoves: 6 }
        : { w: 7, h: 7, guards: 2, density: 0.35, attempts: 160, wantDetour: 2, minMoves: 8 }
  const guardCount = Math.max(0, cfg.guards - (opts.bribedGuard ? 1 : 0))
  const prison = opts.prison ?? g.character.prison?.name ?? 'Prison'

  let best: { maze: EscapeMaze; score: number } | null = null
  let lastLayout: EscapeMaze | null = null
  for (let attempt = 0; attempt < cfg.attempts; attempt++) {
    const walls = randomWalls(g, cfg.w, cfg.h, cfg.density)
    const side = pick(g, ESCAPE_DIRS)
    const exit = edgeCell(g, cfg.w, cfg.h, side)
    const player = edgeCell(g, cfg.w, cfg.h, OPPOSITE[side])
    if (player.x === exit.x && player.y === exit.y) continue
    const guards: MazePoint[] = []
    for (let k = 0; k < guardCount; k++) {
      for (let tries = 0; tries < 40; tries++) {
        const q = { x: randInt(g, 0, cfg.w - 1), y: randInt(g, 0, cfg.h - 1) }
        if (Math.abs(q.x - player.x) + Math.abs(q.y - player.y) < 3) continue
        if (q.x === exit.x && q.y === exit.y) continue
        if (guards.some((o) => o.x === q.x && o.y === q.y)) continue
        guards.push(q)
        break
      }
    }
    const maze: EscapeMaze = { w: cfg.w, h: cfg.h, walls, exit, player, guards, guardSpeed: 2, minMoves: 0, prison, security }
    lastLayout = maze
    const moves = solveEscapeMaze(maze)
    if (moves < 1) continue
    const naive = guards.length > 0 ? solveEscapeMaze({ ...maze, guards: [] }) : moves
    const detour = moves - naive
    maze.minMoves = moves
    const score = moves + detour * 3
    if (!best || score > best.score) best = { maze, score }
    if (detour >= cfg.wantDetour && moves >= cfg.minMoves) break
  }
  if (best) return best.maze
  // Last resort (practically unreachable): the last layout with no guards is always solvable.
  const fallback: EscapeMaze = lastLayout
    ? { ...lastLayout, guards: [] }
    : { w: cfg.w, h: cfg.h, walls: new Array<number>(cfg.w * cfg.h).fill(0), exit: { x: cfg.w - 1, y: 0 }, player: { x: 0, y: cfg.h - 1 }, guards: [], guardSpeed: 2, minMoves: 0, prison, security }
  fallback.minMoves = solveEscapeMaze(fallback)
  return fallback
}

const ESCAPE_SCRIPT = defineScript('prison.escape.result', (g, result) => {
  const c = g.character
  const p = c.prison
  if (!p || !c.alive) return
  const pl = prisonLife(g)
  if (result === 'escaped') {
    count(g, 'escapes')
    addStat(g, 'happiness', randInt(15, 25))
    addHidden(g, 'notoriety', randInt(5, 10))
    const name = p.name
    const juvenile = pl.juvenile
    releaseFromPrison(g, 'escaped')
    // Juvenile escapees may be marched right back by their parents.
    const folks = parents(g)
    const angry = folks.find((f) => f.relationship < 40)
    if (juvenile && angry && chance(g, 0.4)) {
      const fu = fugitiveInfo(g)
      log(g, `My ${relationLabel(angry).toLowerCase()} turned me back in.`, 'bad')
      notice(g, 'Turned In', `You made it home, but your ${relationLabel(angry).toLowerCase()} ${angry.firstName} took one look at you and drove you straight back to ${name}.`, {
        emoji: '\u{1F697}',
        tone: 'bad',
      })
      sendToPrison(g, fu?.crime ?? 'Escape', (fu?.yearsLeft ?? 1) + 1, { juvenile: true, quiet: true, severity: 2 })
      return
    }
    notice(
      g,
      'You Escaped!',
      pick(g, [
        `You slipped past the guards and squeezed through a gap in the fence. You're out of ${name}! Keep your head down: every cop in the country has your mugshot.`,
        `Against all odds, you made it out of ${name}. Freedom smells like rain and diesel. The police are already looking for you.`,
        `You vaulted the last wall and disappeared into the night. ${name} is down one inmate. You're a fugitive now.`,
      ]),
      { emoji: '\u{1F3C3}', tone: 'good' },
    )
    return
  }
  if (result === 'caught') {
    p.escapeAttempts += 1
    pl.behavior = clamp(pl.behavior - 25)
    p.respect = clamp(p.respect + randInt(2, 6))
    const dmg = chance(g, 0.4) ? hurt(g, randInt(4, 12)) : 0
    const add = p.security === 'maximum' ? randInt(2, 5) : randInt(1, 3)
    addPrisonTime(g, add, 'Attempted Escape')
    const moved = p.escapeAttempts >= 2 || chance(g, 0.35) ? raiseSecurity(g) : null
    const extra = p.life || p.deathRow ? '' : ` ${years(add)} were added to your sentence for attempted escape.`
    notice(
      g,
      'Caught!',
      pick(g, [
        `A guard tackled you before you reached the exit.${extra}`,
        `The searchlight found you. So did three guards and a very excited dog.${extra}`,
        `You were so close. The guards dragged you back to your cell.${extra}`,
      ]) + (dmg ? ` (-${dmg} health)` : '') + (moved ? ` You've been transferred to ${moved}.` : ''),
      { emoji: '\u{1F6A8}', tone: 'bad' },
    )
    return
  }
  log(g, 'I thought about escaping, but lost my nerve.', 'neutral')
  notice(g, 'Not Today', pick(g, ['You decided the timing was wrong. The guards never knew.', 'You chickened out before taking a single step. Probably for the best.']), {
    emoji: '\u{1F414}',
  })
})

// ---------------------------------------------------------------------------
// Prison menu actions

function tired(g: GameState, title: string, text: string): void {
  notice(g, title, text, { emoji: '\u{1F634}' })
}

const infoRows = (): MenuNode[] => [
  {
    type: 'info',
    id: 'prison.info',
    emoji: '\u{1F3DB}\u{FE0F}',
    text: (g) => {
      const p = g.character.prison
      if (!p) return ''
      const pl = prisonLife(g)
      return `${p.name} (${pl.juvenile ? 'Juvenile Detention' : securityLabel(p.security)})`
    },
  } satisfies MenuInfo,
  {
    type: 'info',
    id: 'prison.sentence',
    emoji: '\u{231B}',
    text: (g) => {
      const p = g.character.prison
      if (!p) return ''
      const left = yearsLeft(g)
      const leftText = p.deathRow ? 'awaiting execution' : p.life ? 'life' : `${years(left)} left`
      return `Crime: ${p.crime} · Sentence: ${sentenceLabel(p)} · Served: ${years(p.yearsServed)} · ${leftText}`
    },
  } satisfies MenuInfo,
  {
    type: 'info',
    id: 'prison.respect',
    emoji: '\u{1F4AA}',
    text: (g) => {
      const p = g.character.prison
      if (!p) return ''
      const pl = prisonLife(g)
      const gang = p.gang ? ` · Gang: ${p.gang}` : ''
      const job = pl.job ? ` · Job: ${pl.job}` : ''
      return `Respect: ${p.respect}% · Behavior: ${pl.behavior}%${gang}${job}`
    },
  } satisfies MenuInfo,
]

// --- Appeal --------------------------------------------------------------

interface AppealFirm {
  id: string
  name: string
  fee: number
  odds: number
}

function appealFirms(g: GameState): AppealFirm[] {
  const sev = prisonLife(g).severity
  const scale = moneyScale(g) * (0.6 + sev * 0.4)
  return [
    { id: 'budget', name: 'Budget Appeals R Us', fee: Math.round(2500 * scale), odds: 0.1 },
    { id: 'mid', name: 'Hartley & Finch LLP', fee: Math.round(15000 * scale), odds: 0.25 },
    { id: 'top', name: 'Sterling, Vance & Associates', fee: Math.round(75000 * scale), odds: 0.45 },
  ]
}

function appealAction(firm: AppealFirm): MenuAction {
  return {
    type: 'action',
    id: `prison.appeal.${firm.id}`,
    label: firm.name,
    emoji: firm.id === 'top' ? '\u{1F3DB}\u{FE0F}' : firm.id === 'mid' ? '\u{1F4BC}' : '\u{1F4C4}',
    subtitle: (g) => {
      const f = appealFirms(g).find((x) => x.id === firm.id) ?? firm
      return `${formatMoney(f.fee)} · ${f.id === 'top' ? 'Best odds' : f.id === 'mid' ? 'Decent odds' : 'Long shot'}`
    },
    disabledReason: (g) => {
      const p = g.character.prison
      if (!p) return 'You are not in prison.'
      if (p.deathRow) return yearActionsUsed(g, 'prisonAppeal') >= 1 ? 'You already filed a death row appeal this year.' : null
      if (p.appealed) return 'You already appealed this sentence. The courts are done listening.'
      return null
    },
    confirm: (g) => {
      const f = appealFirms(g).find((x) => x.id === firm.id) ?? firm
      return `Hire ${f.name} to appeal your conviction for ${formatMoney(f.fee)}?`
    },
    run: (g) => {
      const c = g.character
      const p = c.prison
      if (!p || !c.alive) return
      const f = appealFirms(g).find((x) => x.id === firm.id) ?? firm
      if (!canAfford(g, f.fee)) {
        notice(g, "Can't Afford It", `${f.name} wants ${formatMoney(f.fee)} up front. You have ${formatMoney(Math.max(0, c.money))} in your commissary account.`, {
          emoji: '\u{1F4B8}',
        })
        return
      }
      if (p.deathRow) {
        if (!useYearAction(g, 'prisonAppeal', 1)) return
      } else {
        p.appealed = true
      }
      spend(g, f.fee)
      const pl = prisonLife(g)
      const odds = clamp(f.odds - (pl.severity - 2) * 0.04 + (c.hidden.karma - 50) / 500, 0.03, 0.7)
      const roll = rand(g)
      if (p.deathRow) {
        if (roll < odds * 0.15) {
          const name = p.name
          markOverturned(g, p.crime)
          releaseFromPrison(g, 'appeal')
          releaseNotice(g, 'Exonerated!', `${f.name} found a hole in the prosecution's case big enough to drive a bus through. Your conviction was overturned and you walked off death row and out of ${name}.`)
          return
        }
        if (roll < odds * 0.6) {
          p.deathRow = undefined
          delete p.deathRow
          p.life = true
          log(g, 'My death sentence was commuted to life in prison on appeal.', 'good')
          notice(g, 'Sentence Commuted', `${f.name} convinced the court to commute your death sentence to life in prison.`, { emoji: '\u{2696}\u{FE0F}', tone: 'good' })
          return
        }
        log(g, 'My death row appeal was denied.', 'bad')
        notice(g, 'Appeal Denied', `The court denied your appeal. ${f.name} sent you a very sympathetic invoice.`, { emoji: '\u{1F6AB}', tone: 'bad' })
        return
      }
      if (roll < odds) {
        const name = p.name
        markOverturned(g, p.crime)
        releaseFromPrison(g, 'appeal')
        releaseNotice(
          g,
          'Appeal Won!',
          pick(g, [
            `${f.name} got your conviction overturned! You walked out of ${name} a free person.`,
            `The appeals court ruled in your favor. Your conviction was tossed out, and so were you, right out the front gate of ${name}.`,
          ]),
        )
        return
      }
      if (roll < odds + 0.2 && !p.life && p.sentenceYears - p.yearsServed > 1) {
        const cut = Math.max(1, Math.round((p.sentenceYears - p.yearsServed) * (0.25 + rand(g) * 0.25)))
        p.sentenceYears -= cut
        log(g, `My appeal knocked ${years(cut)} off my sentence.`, 'good')
        notice(g, 'Partial Victory', `The court upheld your conviction but reduced your sentence by ${years(cut)}.`, { emoji: '\u{2696}\u{FE0F}', tone: 'good' })
        return
      }
      log(g, 'My appeal was denied.', 'bad')
      addStat(g, 'happiness', -randInt(3, 8))
      notice(g, 'Appeal Denied', pick(g, [`The appeals court upheld your conviction. ${f.name} kept the money.`, `Denied. The judge didn't even look up from her coffee.`]), {
        emoji: '\u{1F6AB}',
        tone: 'bad',
      })
    },
  }
}

function markOverturned(g: GameState, crime: string): void {
  const rec = [...g.character.criminalRecord].reverse().find((r) => r.convicted && r.crime === crime)
  if (rec) rec.convicted = false
  count(g, 'appealsWon')
}

const appealMenu: MenuGroup = {
  type: 'menu',
  id: 'prison.appeal',
  label: 'Appeal',
  emoji: '\u{2696}\u{FE0F}',
  subtitle: (g) => (g.character.prison?.deathRow ? 'Fight your death sentence' : g.character.prison?.appealed ? 'Already appealed' : 'Hire a law firm to appeal your conviction'),
  header: (g) =>
    g.character.prison?.deathRow
      ? 'You can file one appeal a year from death row. A win could commute your sentence or even free you.'
      : 'You get one appeal per sentence. Pricier firms have better odds.',
  children: (g) => appealFirms(g).map((f) => appealAction(f)),
}

// --- Escape ----------------------------------------------------------------

const escapeAction: MenuAction = {
  type: 'action',
  id: 'prison.escape',
  label: 'Escape',
  emoji: '\u{1F3C3}',
  subtitle: 'Try to break out (one attempt a year)',
  disabledReason: (g) => notInPrisonReason(g) ?? (yearActionsUsed(g, 'prisonEscape') >= 1 ? 'You already tried to escape this year. The guards are watching you.' : null),
  run: (g) => {
    const c = g.character
    const p = c.prison
    if (!p || !c.alive) return
    if (!useYearAction(g, 'prisonEscape', 1)) return
    const pl = prisonLife(g)
    const maze = generateEscapeMaze(g, p.security, { juvenile: pl.juvenile, bribedGuard: pl.bribedGuard, prison: p.name })
    if (pl.bribedGuard) log(g, 'A guard I bribed looked the other way during my escape attempt.', 'neutral')
    pl.bribedGuard = false
    minigame(g, 'prisonEscape', 'Prison Escape', ESCAPE_SCRIPT, maze as unknown as Json)
  },
}

// --- Riot ------------------------------------------------------------------

const RIOT_SCRIPT = defineScript('prison.riot', (g, choice) => {
  const c = g.character
  const p = c.prison
  if (!p || !c.alive) return
  const pl = prisonLife(g)
  const base: Record<string, number> = { bars: 0.45, speech: 0.3 + c.stats.smarts / 300, tray: 0.5, mattress: 0.55 }
  if (!(choice in base)) return
  const odds = clamp(base[choice] + p.respect / 250 + (p.gang ? 0.1 : 0) - pl.riots * 0.05, 0.1, 0.9)
  const recruits = randInt(g, 4, 30)
  const success = chance(g, odds)
  const opener: Record<string, string> = {
    bars: 'You banged a tin cup on the bars and started a chant.',
    speech: 'You stood on a cafeteria table and delivered a fiery speech about the injustice of meatloaf Mondays.',
    tray: 'You flipped a lunch tray at the nearest guard.',
    mattress: 'You set your mattress on fire and shoved it into the hallway.',
  }
  pl.riots += 1
  const lines: string[] = [opener[choice]]
  if (choice === 'mattress' && chance(g, 0.4)) lines.push(`You singed your eyebrows off. (-${hurt(g, randInt(3, 8))} health)`)
  if (success) {
    count(g, 'riots')
    p.respect = clamp(p.respect + randInt(12, 25))
    pl.behavior = clamp(pl.behavior - 30)
    addStat(g, 'happiness', randInt(5, 10))
    lines.push(
      pick(g, [
        `${recruits} inmates joined in. Cell block D descended into glorious chaos for six hours.`,
        `Within minutes, ${recruits} inmates were tearing the place apart. The warden had to call in reinforcements.`,
        `The riot spread like wildfire. ${recruits} inmates took over the yard until the riot squad arrived.`,
      ]),
    )
    log(g, `I started a prison riot with ${recruits} inmates.`, 'event')
    if (recruits >= 20 && p.respect >= 60 && chance(g, 0.12)) {
      count(g, 'escapes')
      const name = p.name
      releaseFromPrison(g, 'escaped')
      lines.push(`In the chaos, you slipped through a smashed gate and walked right out of ${name}. You're a fugitive now!`)
      notice(g, 'Riot!', lines.join(' '), { emoji: '\u{1F525}', tone: 'good' })
      return
    }
  } else {
    p.respect = clamp(p.respect - randInt(3, 8))
    pl.behavior = clamp(pl.behavior - 15)
    lines.push(pick(g, ['Nobody joined in. A guard calmly walked over and wrote you up.', 'Two inmates joined you, then immediately got bored and left.', 'The other inmates just stared at you. Awkward.']))
    log(g, 'I tried to start a prison riot, but nobody joined in.', 'bad')
  }
  if (chance(g, success ? 0.5 : 0.35)) lines.push(`The guards beat you with batons. (-${hurt(g, randInt(5, 20))} health)`)
  if (chance(g, success ? 0.4 : 0.3)) {
    if (p.life || p.deathRow) {
      lines.push('The warden screamed at you for ten minutes, but there is not much more he can do to you.')
    } else {
      const add = randInt(1, 2)
      addPrisonTime(g, add, 'Inciting a Riot')
      lines.push(`You were charged with inciting a riot: ${years(add)} added to your sentence.`)
    }
    const moved = raiseSecurity(g)
    if (moved) lines.push(`You've been transferred to ${moved}.`)
  }
  notice(g, success ? 'Riot!' : 'Riot Fizzled', lines.join(' '), { emoji: success ? '\u{1F525}' : '\u{1F612}', tone: success ? 'event' : 'bad' })
})

const riotAction: MenuAction = {
  type: 'action',
  id: 'prison.riot',
  label: 'Riot',
  emoji: '\u{1F525}',
  subtitle: 'Incite a riot (one a year)',
  disabledReason: (g) => notInPrisonReason(g) ?? (yearActionsUsed(g, 'prisonRiot') >= 1 ? 'You already started a riot this year. The guards are on high alert.' : null),
  run: (g) => {
    if (!guardOk(g) || !useYearAction(g, 'prisonRiot', 1)) return
    scriptChoice(g, RIOT_SCRIPT, 'Start a Riot', 'How do you want to rally the inmates?', [
      { id: 'bars', label: 'Bang on the bars and chant', emoji: '\u{1F941}' },
      { id: 'speech', label: 'Give a fiery speech', emoji: '\u{1F4E3}' },
      { id: 'tray', label: 'Throw a lunch tray at a guard', emoji: '\u{1F37D}\u{FE0F}' },
      { id: 'mattress', label: 'Set a mattress on fire', emoji: '\u{1F6CF}\u{FE0F}' },
    ], { emoji: '\u{1F525}' })
  },
}

// --- Yard & library ------------------------------------------------------

const workoutAction: MenuAction = {
  type: 'action',
  id: 'prison.workout',
  label: 'Work Out in the Yard',
  emoji: '\u{1F3CB}\u{FE0F}',
  subtitle: 'Pump iron with the other inmates',
  disabledReason: notInPrisonReason,
  run: (g) => {
    const c = g.character
    const p = c.prison
    if (!p || !c.alive) return
    if (!useYearAction(g, 'prisonWorkout', 3)) {
      tired(g, 'Sore Muscles', "You're too sore to lift another weight this year.")
      return
    }
    count(g, 'gym')
    const hp = randInt(2, 6)
    const lk = randInt(0, 3)
    addStat(g, 'health', hp)
    addStat(g, 'looks', lk)
    addHidden(g, 'athleticism', randInt(1, 4))
    p.respect = clamp(p.respect + randInt(1, 4))
    addStat(g, 'happiness', randInt(1, 3))
    log(g, pick(g, ['I worked out in the prison yard.', 'I lifted weights in the yard.', 'I did a thousand push-ups in my cell.']), 'good')
    notice(
      g,
      'The Yard',
      pick(g, [
        'You spent the afternoon bench-pressing in the yard. A few inmates nodded at you approvingly.',
        'You did pull-ups on the basketball hoop until the guards blew the whistle.',
        `You ran laps around the yard while the ${c.age < 18 ? 'other kids' : 'old-timers'} played dominoes.`,
        'You lifted a weight bar that was mostly duct tape. Still counts.',
      ]),
      { emoji: '\u{1F3CB}\u{FE0F}', tone: 'good' },
    )
  },
}

const libraryAction: MenuAction = {
  type: 'action',
  id: 'prison.library',
  label: 'Prison Library',
  emoji: '\u{1F4DA}',
  subtitle: 'Read a book (or a law book)',
  disabledReason: notInPrisonReason,
  run: (g) => {
    const c = g.character
    if (!c.prison || !c.alive) return
    if (!useYearAction(g, 'prisonLibrary', 3)) {
      tired(g, 'Library Closed', "The prison librarian says you've checked out enough books this year.")
      return
    }
    count(g, 'library')
    const sm = randInt(1, 4)
    addStat(g, 'smarts', sm)
    addStat(g, 'happiness', randInt(1, 3))
    prisonLife(g).behavior = clamp(prisonLife(g).behavior + 2)
    const book = pick(g, [
      'a dog-eared law textbook',
      'a mystery novel with the last page torn out',
      'a self-help book called "Finding Freedom Within"',
      'a history of famous prison escapes (the guards confiscated it halfway through)',
      'a dictionary, front to back',
      'a cookbook full of recipes you can make with a microwave and ramen',
    ])
    log(g, `I read ${book} in the prison library.`, 'good')
    notice(g, 'Prison Library', `You spent a quiet afternoon reading ${book}.`, { emoji: '\u{1F4D6}', tone: 'good' })
  },
}

// --- Gangs ---------------------------------------------------------------

const GANG_INIT_SCRIPT = defineScript('prison.gang.initiation', (g, choice, data) => {
  const c = g.character
  const p = c.prison
  if (!p || !c.alive || !isRecord(data)) return
  const gang = String(data.gang ?? 'gang')
  const target = String(data.target ?? 'an inmate')
  if (choice !== 'fight') {
    p.respect = clamp(p.respect - 5)
    log(g, `I backed out of joining the ${gang}.`, 'neutral')
    notice(g, 'Backed Out', `The ${gang} shrugged and walked off. Nobody gets a second invitation.`, { emoji: '\u{1F645}' })
    return
  }
  const pl = prisonLife(g)
  const power = c.hidden.athleticism * 0.5 + c.stats.health * 0.3 + p.respect * 0.2 + randInt(0, 30)
  const win = power > randInt(35, 95)
  pl.behavior = clamp(pl.behavior - 15)
  const caught = chance(g, 0.25)
  const lines: string[] = []
  if (win) {
    p.gang = gang
    p.respect = clamp(p.respect + randInt(10, 18))
    lines.push(`You jumped ${target} in the yard and left no doubt. The ${gang} welcomed you in.`)
    log(g, `I joined the ${gang} after beating up ${target}.`, 'event')
  } else {
    lines.push(`You jumped ${target}, but ${target.split(' ')[0]} turned out to be tougher than you. (-${hurt(g, randInt(8, 20))} health) The ${gang} want nothing to do with you.`)
    p.respect = clamp(p.respect - 4)
    log(g, `I failed my initiation into the ${gang}.`, 'bad')
  }
  if (caught && !p.life && !p.deathRow) {
    addPrisonTime(g, 1, 'Assault')
    lines.push('A guard saw everything: 1 year added to your sentence.')
  }
  notice(g, win ? 'Initiated' : 'Initiation Failed', lines.join(' '), { emoji: win ? '\u{1F91D}' : '\u{1F915}', tone: win ? 'event' : 'bad' })
})

function gangNodes(g: GameState): MenuNode[] {
  const p = g.character.prison
  if (!p) return []
  const pl = prisonLife(g)
  if (p.gang) {
    const gang = p.gang
    return [
      { type: 'info', id: 'prison.gang.info', emoji: '\u{1F5E1}\u{FE0F}', text: `You run with the ${gang}.` },
      {
        type: 'action',
        id: 'prison.gang.smuggle',
        label: 'Smuggle Contraband',
        emoji: '\u{1F4E6}',
        subtitle: 'Move goods for the gang',
        run: (gg) => {
          const c = gg.character
          const pp = c.prison
          if (!pp || !c.alive) return
          if (!useYearAction(gg, 'prisonSmuggle', 2)) {
            tired(gg, 'Lying Low', 'The guards are shaking down every cell. Better wait until next year.')
            return
          }
          if (chance(gg, 0.3)) {
            const plx = prisonLife(gg)
            plx.behavior = clamp(plx.behavior - 20)
            const lines = ['The guards found the contraband stuffed in your mattress.']
            if (!pp.life && !pp.deathRow && chance(gg, 0.6)) {
              const add = randInt(1, 2)
              addPrisonTime(gg, add, 'Smuggling Contraband')
              lines.push(`${years(add)} added to your sentence.`)
            } else {
              lines.push('You spent a month in solitary.')
              addStat(gg, 'happiness', -randInt(5, 10))
            }
            log(gg, 'I got caught smuggling contraband for my gang.', 'bad')
            notice(gg, 'Busted', lines.join(' '), { emoji: '\u{1F6A8}', tone: 'bad' })
            return
          }
          const cut = Math.round(randInt(100, 900) * moneyScale(gg))
          addMoney(gg, cut)
          pp.respect = clamp(pp.respect + randInt(3, 7))
          const goods = pick(gg, ['cigarettes', 'instant coffee', 'contraband phones', 'hot sauce', 'smuggled snacks', 'romance novels'])
          log(gg, `I smuggled ${goods} for the ${gang} and made ${formatMoney(cut)}.`, 'event')
          notice(gg, 'Smuggling Run', `You moved a shipment of ${goods} through the laundry for the ${gang}. Your cut: ${formatMoney(cut)}.`, { emoji: '\u{1F4E6}' })
        },
      },
      {
        type: 'action',
        id: 'prison.gang.rival',
        label: 'Jump a Rival Gang Member',
        emoji: '\u{1F44A}',
        subtitle: 'Earn respect the hard way',
        run: (gg) => {
          const c = gg.character
          const pp = c.prison
          if (!pp || !c.alive) return
          if (!useYearAction(gg, 'prisonAssault', 3)) {
            tired(gg, 'Too Hot', "Things are too tense in the yard. Wait until next year.")
            return
          }
          const rivals = prisonLife(gg).gangs.filter((x) => x !== gang)
          const rival = rivals.length ? pick(gg, rivals) : 'rival crew'
          const target = inmateName(gg, c.gender)
          fightInmate(gg, target, `a member of the ${rival}`, null)
        },
      },
      {
        type: 'action',
        id: 'prison.gang.leave',
        label: 'Leave the Gang',
        emoji: '\u{1F6AA}',
        confirm: () => 'Gangs don\'t take kindly to quitters. Leave anyway?',
        run: (gg) => {
          const c = gg.character
          const pp = c.prison
          if (!pp || !c.alive) return
          pp.gang = undefined
          delete pp.gang
          pp.respect = clamp(pp.respect - randInt(5, 15))
          const beaten = chance(gg, 0.5)
          const dmg = beaten ? hurt(gg, randInt(8, 25)) : 0
          log(gg, `I left the ${gang}.`, 'neutral')
          notice(gg, 'Out of the Gang', beaten ? `The ${gang} gave you a going-away party. It involved fists. (-${dmg} health)` : `You told the ${gang} you were out. They let you walk away... for now.`, {
            emoji: '\u{1F6AA}',
            tone: beaten ? 'bad' : 'neutral',
          })
        },
      },
    ]
  }
  return pl.gangs.map(
    (gang): MenuAction => ({
      type: 'action',
      id: `prison.gang.join.${gang}`,
      label: `Join the ${gang}`,
      emoji: '\u{1F5E1}\u{FE0F}',
      subtitle: 'Ask to be jumped in',
      run: (gg) => {
        const c = gg.character
        const pp = c.prison
        if (!pp || !c.alive) return
        if (!useYearAction(gg, 'prisonGangAsk', 2)) {
          tired(gg, 'Not Now', "You've already asked around enough this year. Desperation isn't a good look in here.")
          return
        }
        const accept = chance(gg, clamp(0.15 + pp.respect / 100, 0.1, 0.9))
        if (!accept) {
          pp.respect = clamp(pp.respect - 3)
          log(gg, `The ${gang} rejected me.`, 'bad')
          notice(gg, 'Rejected', pick(gg, [`The ${gang} laughed you out of the yard. Come back when people know your name.`, `The ${gang}'s leader looked you up and down and said "nah."`]), {
            emoji: '\u{1F645}',
            tone: 'bad',
          })
          return
        }
        const target = inmateName(gg, c.gender)
        scriptChoice(gg, GANG_INIT_SCRIPT, 'Initiation', `The ${gang} will take you, but first you have to prove yourself by beating up ${target}.`, [
          { id: 'fight', label: 'Do it', emoji: '\u{1F44A}' },
          { id: 'decline', label: 'Back out', emoji: '\u{1F645}' },
        ], { emoji: '\u{1F5E1}\u{FE0F}', data: { gang, target } })
      },
    }),
  )
}

const gangMenu: MenuGroup = {
  type: 'menu',
  id: 'prison.gangs',
  label: 'Gangs',
  emoji: '\u{1F5E1}\u{FE0F}',
  subtitle: (g) => (g.character.prison?.gang ? `Member of the ${g.character.prison.gang}` : 'Join a prison gang for protection'),
  visible: (g) => !!g.character.prison && g.character.prison.security !== 'minimum' && !prisonLife(g).juvenile,
  header: () => 'Gangs offer protection and respect, but they expect loyalty.',
  children: gangNodes,
}

// --- Assault an inmate -------------------------------------------------------

function fightInmate(g: GameState, name: string, desc: string, person: Person | null): void {
  const c = g.character
  const p = c.prison
  if (!p) return
  const pl = prisonLife(g)
  const power = c.hidden.athleticism * 0.45 + c.stats.health * 0.3 + p.respect * 0.25 + randInt(0, 35)
  const toughness = person ? person.stats.health * 0.6 + randInt(10, 50) : randInt(30, 100)
  const win = power > toughness
  pl.behavior = clamp(pl.behavior - 15)
  const lines: string[] = []
  const first = name.split(' ')[0]
  if (win) {
    p.respect = clamp(p.respect + randInt(8, 15))
    lines.push(
      pick(g, [
        `You attacked ${name}, ${desc}. You landed a jab, a hook and an uppercut before ${first} hit the floor.`,
        `You jumped ${name}, ${desc}, in the chow line. It was over in seconds.`,
        `You picked a fight with ${name}, ${desc}, and won decisively. The yard went quiet.`,
      ]),
    )
    if (person) {
      addPersonStat(person, 'health', -randInt(10, 30))
      person.relationship = Math.min(person.relationship, randInt(0, 10))
      notePerson(person, 'I beat them up in prison.')
    }
    log(g, `I beat up ${person ? `my cellmate ${person.firstName}` : `an inmate named ${first}`}.`, 'event')
  } else {
    const dmg = hurt(g, randInt(8, 22))
    p.respect = clamp(p.respect - randInt(2, 6))
    lines.push(
      pick(g, [
        `You swung at ${name}, ${desc}, and missed. ${first} did not miss. (-${dmg} health)`,
        `${name} dodged your punch and returned the favor several times. (-${dmg} health)`,
      ]),
    )
    if (person) {
      addRelationship(person, -randInt(20, 40))
      notePerson(person, 'I tried to fight them in prison and lost.')
    }
    log(g, `I lost a fight to ${person ? `my cellmate ${person.firstName}` : `an inmate named ${first}`}.`, 'bad')
  }
  if (chance(g, 0.3)) {
    if (!p.life && !p.deathRow && chance(g, 0.6)) {
      const add = randInt(1, 2)
      addPrisonTime(g, add, 'Assault')
      lines.push(`The guards broke it up and charged you with assault: ${years(add)} added to your sentence.`)
    } else {
      lines.push('The guards threw you in solitary for a month.')
      addStat(g, 'happiness', -randInt(5, 12))
    }
  }
  count(g, 'fights')
  notice(g, win ? 'Fight!' : 'Lost the Fight', lines.join(' '), { emoji: win ? '\u{1F44A}' : '\u{1F915}', tone: win ? 'event' : 'bad' })
}

function assaultNodes(g: GameState): MenuNode[] {
  const nodes: MenuNode[] = cellmates(g).map(
    (m): MenuAction => ({
      type: 'action',
      id: `prison.assault.${m.id}`,
      label: fullName(m),
      emoji: '\u{1F464}',
      subtitle: `Cellmate · in for ${String(m.data.crime ?? 'something')}`,
      confirm: () => `Are you sure you want to attack your cellmate ${m.firstName}?`,
      run: (gg) => {
        const c = gg.character
        const mate = getPerson(gg, m.id)
        if (!c.prison || !c.alive || !mate || !mate.alive) return
        if (!useYearAction(gg, 'prisonAssault', 3)) {
          tired(gg, 'Too Hot', "The guards are watching you too closely. Wait until next year.")
          return
        }
        fightInmate(gg, fullName(mate), 'your cellmate', mate)
      },
    }),
  )
  nodes.push({
    type: 'action',
    id: 'prison.assault.random',
    label: 'A Random Inmate',
    emoji: '\u{1F3B2}',
    subtitle: 'Pick a fight in the yard',
    run: (gg) => {
      const c = gg.character
      if (!c.prison || !c.alive) return
      if (!useYearAction(gg, 'prisonAssault', 3)) {
        tired(gg, 'Too Hot', "The guards are watching you too closely. Wait until next year.")
        return
      }
      fightInmate(gg, inmateName(gg, c.gender), pick(gg, INMATE_TYPES), null)
    },
  })
  return nodes
}

const assaultMenu: MenuGroup = {
  type: 'menu',
  id: 'prison.assault',
  label: 'Assault an Inmate',
  emoji: '\u{1F44A}',
  subtitle: 'Earn respect (or a black eye)',
  header: () => 'Winning fights earns respect. Losing them earns bruises. Getting caught earns more time.',
  children: assaultNodes,
}

// --- Snitch, behave, cry -----------------------------------------------------

const SNITCH_SCRIPT = defineScript('prison.snitch', (g, choice) => {
  const c = g.character
  const p = c.prison
  if (!p || !c.alive) return
  if (choice === 'cancel') return
  const pl = prisonLife(g)
  const what: Record<string, string> = {
    stash: "an inmate's contraband stash",
    escape: 'a planned escape',
    guard: 'a guard who takes bribes',
  }
  if (!(choice in what)) return
  pl.behavior = clamp(pl.behavior + randInt(15, 25))
  p.respect = clamp(p.respect - randInt(15, 25))
  const lines = [`You quietly told the warden about ${what[choice]}.`]
  if (!p.life && !p.deathRow && p.sentenceYears - p.yearsServed > 1 && chance(g, choice === 'escape' ? 0.4 : 0.25)) {
    p.sentenceYears -= 1
    lines.push('The warden was grateful: 1 year was knocked off your sentence.')
  } else {
    lines.push('The warden thanked you and made a note in your file.')
  }
  const retaliation = chance(g, clamp(0.25 + (p.gang ? 0.3 : 0) + (40 - p.respect) / 150, 0.1, 0.75))
  if (retaliation) {
    const dmg = hurt(g, randInt(10, 30))
    lines.push(`Word got out. Snitches get stitches, and you got a lot of them. (-${dmg} health)`)
    if (p.gang) {
      lines.push(`The ${p.gang} kicked you out.`)
      p.gang = undefined
      delete p.gang
    }
  }
  log(g, `I snitched on ${what[choice]}.`, 'neutral')
  notice(g, 'Snitch', lines.join(' '), { emoji: '\u{1F400}', tone: retaliation ? 'bad' : 'neutral' })
})

const snitchAction: MenuAction = {
  type: 'action',
  id: 'prison.snitch',
  label: 'Snitch',
  emoji: '\u{1F400}',
  subtitle: 'Rat someone out to the warden',
  disabledReason: (g) => notInPrisonReason(g) ?? (yearActionsUsed(g, 'prisonSnitch') >= 1 ? "You've already snitched this year. Any more and you'll need a bodyguard." : null),
  run: (g) => {
    if (!guardOk(g) || !useYearAction(g, 'prisonSnitch', 1)) return
    scriptChoice(g, SNITCH_SCRIPT, 'Snitch', 'What do you want to tell the warden?', [
      { id: 'stash', label: "An inmate's contraband stash", emoji: '\u{1F4E6}' },
      { id: 'escape', label: 'A planned escape', emoji: '\u{1F3C3}' },
      { id: 'guard', label: 'A guard taking bribes', emoji: '\u{1F46E}' },
      { id: 'cancel', label: 'Never mind', emoji: '\u{1F910}' },
    ], { emoji: '\u{1F400}' })
  },
}

const behaveAction: MenuAction = {
  type: 'action',
  id: 'prison.behave',
  label: 'Be a Model Inmate',
  emoji: '\u{1F607}',
  subtitle: 'Good behavior helps at parole',
  disabledReason: notInPrisonReason,
  run: (g) => {
    const c = g.character
    const p = c.prison
    if (!p || !c.alive) return
    if (!useYearAction(g, 'prisonBehave', 2)) {
      tired(g, 'Halo Slipping', "You've been on your best behavior all year. The guards already noticed.")
      return
    }
    const pl = prisonLife(g)
    pl.behavior = clamp(pl.behavior + randInt(8, 15))
    p.respect = clamp(p.respect - randInt(0, 3))
    addHidden(g, 'karma', randInt(1, 3))
    const what = pick(g, [
      'You made your bunk with hospital corners, mopped the cell block, and said "yes sir" to every guard.',
      'You volunteered in the prison kitchen and served the warden an extra-large slice of pie.',
      'You attended every anger-management class and only rolled your eyes twice.',
      'You helped an old-timer write a letter to his grandkids. The guards noticed.',
    ])
    log(g, 'I was on my best behavior in prison.', 'good')
    notice(g, 'Model Inmate', what, { emoji: '\u{1F607}', tone: 'good' })
  },
}

const cryAction: MenuAction = {
  type: 'action',
  id: 'prison.cry',
  label: 'Cry',
  emoji: '\u{1F62D}',
  subtitle: 'Let it all out',
  disabledReason: notInPrisonReason,
  run: (g) => {
    const c = g.character
    const p = c.prison
    if (!p || !c.alive) return
    if (!useYearAction(g, 'prisonCry', 3)) {
      tired(g, 'All Cried Out', "You've cried so much this year that you're out of tears.")
      return
    }
    addStat(g, 'happiness', randInt(2, 6))
    const seen = chance(g, 0.3)
    if (seen) p.respect = clamp(p.respect - randInt(2, 5))
    log(g, 'I cried myself to sleep in my cell.', 'neutral')
    notice(
      g,
      'Tears',
      seen
        ? pick(g, ['You sobbed into your pillow. Your cellmate heard everything and will tell everyone.', 'You cried in the shower. Unfortunately, it was a group shower.'])
        : pick(g, ['You cried quietly into your scratchy pillow. You feel a little better.', 'You let it all out after lights-out. Nobody heard. Probably.']),
      { emoji: '\u{1F62D}' },
    )
  },
}

// --- Prison jobs -------------------------------------------------------------

const PRISON_JOBS: { title: string; emoji: string; wage: number; blurb: string }[] = [
  { title: 'Kitchen Worker', emoji: '\u{1F373}', wage: 900, blurb: 'Stir mystery stew for 800 inmates' },
  { title: 'Laundry Worker', emoji: '\u{1F9FA}', wage: 750, blurb: 'Fold a lot of orange' },
  { title: 'License Plate Maker', emoji: '\u{1F697}', wage: 1100, blurb: 'A time-honored tradition' },
  { title: 'Library Clerk', emoji: '\u{1F4DA}', wage: 700, blurb: 'Shush people who could beat you up' },
  { title: 'Janitor', emoji: '\u{1F9F9}', wage: 650, blurb: 'Mop the cell blocks' },
  { title: 'Groundskeeper', emoji: '\u{1F33F}', wage: 800, blurb: 'Mow the lawn inside the fence' },
]

function jobNodes(g: GameState): MenuNode[] {
  const pl = g.character.prison ? prisonLife(g) : null
  if (!pl) return []
  if (pl.job) {
    const title = pl.job
    return [
      { type: 'info', id: 'prison.job.info', emoji: '\u{1F4BC}', text: `You work as a ${title} for ${formatMoney(pl.jobWage)} a year.` },
      {
        type: 'action',
        id: 'prison.job.quit',
        label: 'Quit Job',
        emoji: '\u{1F44B}',
        confirm: () => `Quit your job as a prison ${title}?`,
        run: (gg) => {
          if (!guardOk(gg)) return
          const plx = prisonLife(gg)
          plx.job = null
          plx.jobWage = 0
          log(gg, `I quit my prison job as a ${title}.`, 'neutral')
          notice(gg, 'Quit', `You quit your job as a ${title}. More time for staring at the wall.`, { emoji: '\u{1F44B}' })
        },
      },
    ]
  }
  return PRISON_JOBS.map(
    (job): MenuAction => ({
      type: 'action',
      id: `prison.job.${job.title}`,
      label: job.title,
      emoji: job.emoji,
      subtitle: (gg) => `${formatMoney(Math.round(job.wage * moneyScale(gg)))}/year · ${job.blurb}`,
      run: (gg) => {
        const c = gg.character
        if (!c.prison || !c.alive) return
        if (!useYearAction(gg, 'prisonJobApply', 3)) {
          tired(gg, 'No Openings', 'The work supervisor told you to stop asking until next year.')
          return
        }
        const plx = prisonLife(gg)
        if (!chance(gg, clamp(0.3 + plx.behavior / 100, 0.2, 0.95))) {
          log(gg, `I was turned down for a prison job as a ${job.title}.`, 'bad')
          notice(gg, 'Not Hired', `The work supervisor read your behavior report and laughed. No ${job.title.toLowerCase()} job for you.`, { emoji: '\u{1F645}', tone: 'bad' })
          return
        }
        plx.job = job.title
        plx.jobWage = Math.round(job.wage * moneyScale(gg))
        log(gg, `I got a prison job as a ${job.title}.`, 'good')
        notice(gg, 'Hired', `You're the newest ${job.title.toLowerCase()} at ${c.prison.name}. The pay is ${formatMoney(plx.jobWage)} a year. Try not to spend it all at once.`, {
          emoji: job.emoji,
          tone: 'good',
        })
      },
    }),
  )
}

const jobMenu: MenuGroup = {
  type: 'menu',
  id: 'prison.jobs',
  label: 'Prison Job',
  emoji: '\u{1F4BC}',
  subtitle: (g) => (g.character.prison && prisonLife(g).job ? `Working as a ${prisonLife(g).job}` : 'Earn a few dollars a year'),
  children: jobNodes,
}

// --- Bribe a guard -----------------------------------------------------------

function bribePrices(g: GameState): { snacks: number; cell: number; escape: number } {
  const s = moneyScale(g)
  return { snacks: Math.round(200 * s), cell: Math.round(1500 * s), escape: Math.round(6000 * s) }
}

const BRIBE_SCRIPT = defineScript('prison.bribe', (g, choice) => {
  const c = g.character
  const p = c.prison
  if (!p || !c.alive || choice === 'cancel') return
  const prices = bribePrices(g)
  const price = choice === 'snacks' ? prices.snacks : choice === 'cell' ? prices.cell : choice === 'escape' ? prices.escape : 0
  if (price <= 0) return
  if (!canAfford(g, price)) {
    notice(g, 'Broke', `The guard wants ${formatMoney(price)}. You have ${formatMoney(Math.max(0, c.money))}. He walked away laughing.`, { emoji: '\u{1F4B8}' })
    return
  }
  const pl = prisonLife(g)
  if (chance(g, choice === 'escape' ? 0.25 : 0.15)) {
    pl.behavior = clamp(pl.behavior - 20)
    const lines = ['The guard took your money, then reported you to the warden.']
    if (!p.life && !p.deathRow) {
      addPrisonTime(g, 1, 'Bribery')
      lines.push('1 year was added to your sentence for bribery.')
    }
    spend(g, price)
    log(g, 'I tried to bribe a guard and got reported.', 'bad')
    notice(g, 'Double-Crossed', lines.join(' '), { emoji: '\u{1F46E}', tone: 'bad' })
    return
  }
  spend(g, price)
  if (choice === 'snacks') {
    addStat(g, 'happiness', randInt(4, 8))
    log(g, 'I bribed a guard to smuggle in snacks.', 'neutral')
    notice(g, 'Contraband Snacks', 'The guard slipped you a bag of real chips and a comic book. Luxury!', { emoji: '\u{1F35F}' })
  } else if (choice === 'cell') {
    addStat(g, 'happiness', randInt(6, 12))
    addStat(g, 'health', randInt(1, 4))
    log(g, 'I bribed a guard for a better cell.', 'neutral')
    notice(g, 'Upgrade', 'You got moved to a cell with a window and a mattress thicker than a pancake.', { emoji: '\u{1F6CF}\u{FE0F}' })
  } else {
    pl.bribedGuard = true
    log(g, 'I paid a guard to look the other way during my next escape.', 'neutral')
    notice(g, 'Arrangements Made', 'The guard pocketed the cash and winked. During your next escape attempt, one fewer guard will be watching.', { emoji: '\u{1F609}' })
  }
})

const bribeAction: MenuAction = {
  type: 'action',
  id: 'prison.bribe',
  label: 'Bribe a Guard',
  emoji: '\u{1F4B5}',
  subtitle: 'Everything has a price',
  disabledReason: (g) => notInPrisonReason(g) ?? (yearActionsUsed(g, 'prisonBribe') >= 1 ? "You already bribed a guard this year. Don't push it." : null),
  run: (g) => {
    if (!guardOk(g) || !useYearAction(g, 'prisonBribe', 1)) return
    const pr = bribePrices(g)
    scriptChoice(g, BRIBE_SCRIPT, 'Bribe a Guard', 'A guard with a reputation for "flexibility" is working your block. What do you want?', [
      { id: 'snacks', label: `Smuggle in snacks (${formatMoney(pr.snacks)})`, emoji: '\u{1F35F}' },
      { id: 'cell', label: `A better cell (${formatMoney(pr.cell)})`, emoji: '\u{1F6CF}\u{FE0F}' },
      { id: 'escape', label: `Look the other way on my next escape (${formatMoney(pr.escape)})`, emoji: '\u{1F648}' },
      { id: 'cancel', label: 'Never mind', emoji: '\u{1F645}' },
    ], { emoji: '\u{1F4B5}' })
  },
}

// --- Letters home & infirmary -------------------------------------------------

function letterNodes(g: GameState): MenuNode[] {
  const people = g.people.filter((x) => x.alive && x.relation !== 'cellmate' && x.relation !== 'pet' && x.relation !== 'coworker' && x.relation !== 'classmate' && x.relation !== 'teacher' && x.relation !== 'boss')
  if (people.length === 0) return [{ type: 'info', id: 'prison.letter.none', text: 'There is nobody on the outside to write to.', emoji: '\u{1F4ED}' }]
  return people.map(
    (person): MenuAction => ({
      type: 'action',
      id: `prison.letter.${person.id}`,
      label: fullName(person),
      emoji: '\u{2709}\u{FE0F}',
      subtitle: relationLabel(person),
      disabledReason: (gg) => (yearActionsUsed(gg, `prisonLetter:${person.id}`) >= 1 ? `You already wrote to ${person.firstName} this year.` : null),
      run: (gg) => {
        const c = gg.character
        const target = getPerson(gg, person.id)
        if (!c.prison || !c.alive || !target || !target.alive) return
        if (!useYearAction(gg, `prisonLetter:${person.id}`, 1)) return
        if (chance(gg, 0.2)) {
          log(gg, `The guards confiscated my letter to ${target.firstName}.`, 'bad')
          notice(gg, 'Confiscated', `The guards read your letter to ${target.firstName} out loud in the mess hall, then tore it up.`, { emoji: '\u{1F46E}', tone: 'bad' })
          return
        }
        const p = pronouns(target.gender)
        const reply = target.relationship >= 30 || chance(gg, 0.5)
        if (reply) {
          addRelationship(target, randInt(4, 10))
          addStat(gg, 'happiness', randInt(2, 5))
          notePerson(target, 'Wrote to me from prison.')
          log(gg, `I wrote a letter to my ${relationLabel(target).toLowerCase()} ${target.firstName} from prison.`, 'good')
          notice(gg, 'Letter Home', pick(gg, [`${target.firstName} wrote back! ${p.He} said ${p.he} misses you.`, `${target.firstName} replied with a long letter and a drawing of your old neighborhood.`]), {
            emoji: '\u{1F48C}',
            tone: 'good',
          })
        } else {
          log(gg, `I wrote to ${target.firstName}, but ${p.he} never wrote back.`, 'neutral')
          notice(gg, 'No Reply', `You wrote to ${target.firstName}, but ${p.he} never wrote back.`, { emoji: '\u{1F4ED}' })
        }
      },
    }),
  )
}

const letterMenu: MenuGroup = {
  type: 'menu',
  id: 'prison.letters',
  label: 'Write a Letter',
  emoji: '\u{2709}\u{FE0F}',
  subtitle: 'Stay in touch with the outside',
  children: letterNodes,
}

const infirmaryAction: MenuAction = {
  type: 'action',
  id: 'prison.infirmary',
  label: 'Infirmary',
  emoji: '\u{1FA79}',
  subtitle: 'Free (and questionable) medical care',
  disabledReason: (g) => notInPrisonReason(g) ?? (yearActionsUsed(g, 'prisonInfirmary') >= 1 ? 'The nurse says you were already seen this year.' : null),
  run: (g) => {
    const c = g.character
    if (!c.prison || !c.alive) return
    if (!useYearAction(g, 'prisonInfirmary', 1)) return
    if (chance(g, 0.25)) {
      log(g, 'I went to the prison infirmary and got two aspirin.', 'neutral')
      notice(g, 'Infirmary', 'The prison nurse gave you two aspirin and told you to walk it off.', { emoji: '\u{1F48A}' })
      return
    }
    const heal = randInt(5, 15)
    addStat(g, 'health', heal)
    const injury = c.conditions.find((x) => x.kind === 'injury')
    let extra = ''
    if (injury && chance(g, 0.6)) {
      c.conditions = c.conditions.filter((x) => x.id !== injury.id)
      extra = ` They also patched up your ${injury.name.toLowerCase()}.`
    }
    log(g, 'I got patched up at the prison infirmary.', 'good')
    notice(g, 'Infirmary', `The prison doctor checked you over and sent you back with a clean bandage.${extra} (+${heal} health)`, { emoji: '\u{1FA79}', tone: 'good' })
  },
}

/** Prison activities (shown in place of the normal Activities menu while locked up). */
export const prisonMenu: MenuGroup = {
  type: 'menu',
  id: 'prison',
  label: 'Prison',
  emoji: '\u{26D3}\u{FE0F}',
  visible: (g) => inPrison(g) && g.character.alive,
  subtitle: (g) => g.character.prison?.name ?? '',
  header: (g) => {
    const p = g.character.prison
    return p ? `Inmate at ${p.name}. Sentence: ${sentenceLabel(p)}.` : ''
  },
  children: (g) => {
    if (!g.character.prison || !g.character.alive) return []
    return [
      ...infoRows(),
      appealMenu,
      escapeAction,
      riotAction,
      workoutAction,
      libraryAction,
      gangMenu,
      assaultMenu,
      snitchAction,
      behaveAction,
      jobMenu,
      bribeAction,
      letterMenu,
      infirmaryAction,
      cryAction,
    ]
  },
}
