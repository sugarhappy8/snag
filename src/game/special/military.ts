// The military: enlist or commission as an officer in one of five branches, climb the ranks,
// survive deployments (a choose-your-path minefield), earn medals, retire with a pension or
// leave with a discharge. Conscription countries draft 18 year olds.
//
// History (history/events-wars.ts): in past years national service follows the era (Britain's
// ended in 1960, America's draft ran 1940-1973, men only almost everywhere) and wars call up
// whole age groups: serve, object, ask for a medical exemption or flee into hiding. Units at war
// deploy more often, to that war's real fronts. From PRESENT_YEAR on everything works as before.
import { addHidden, addMoney, addRelationship, addStat, count, earnIncome, getPerson, log, remember, scriptChoice, useYearAction } from '../core'
import { arrestPlayer } from '../crime'
import { killCharacter } from '../death'
import { conscriptionAt, getWar, serviceOddsAt, studentsDeferredAt, warDraftAt, warFronts, warsAt, womenConscriptedAt, type WarDef } from '../history/events-wars'
import { isHistorical } from '../history/timeline'
import { chance, pick, rand, randInt, uid } from '../rng'
import { pickLine, pickSite } from '../text/pick'
import { defineScript } from '../scripts'
import { hasTalent, talentHint } from '../talents'
import type { ChoiceOption, GameState, Job, Json, MenuAction, MenuGroup, MenuNode } from '../types'
import { countryLabel, getCountry } from '../world'
import { addColleague, blocked, bump, claimYearly, convictions, hasAddiction, hasCollegeDegree, hasHighSchool, hire, leave, money, myJob, ownFlag, peek, prof, promote, quitNote, say, setOwnFlag, syncTenure, tell, view } from './common'
import { payScale } from './pay-scale'

// ---------------------------------------------------------------------------
// Branches & ranks

const ARMY_ENLISTED = ['Private', 'Private First Class', 'Specialist', 'Corporal', 'Sergeant', 'Staff Sergeant', 'Sergeant First Class', 'Master Sergeant', 'First Sergeant', 'Sergeant Major']
const ARMY_OFFICER = ['Second Lieutenant', 'First Lieutenant', 'Captain', 'Major', 'Lieutenant Colonel', 'Colonel', 'Brigadier General', 'Major General', 'Lieutenant General', 'General']
const NAVY_ENLISTED = ['Seaman Recruit', 'Seaman Apprentice', 'Seaman', 'Petty Officer Third Class', 'Petty Officer Second Class', 'Petty Officer First Class', 'Chief Petty Officer', 'Senior Chief Petty Officer', 'Master Chief Petty Officer']
const NAVY_OFFICER = ['Ensign', 'Lieutenant Junior Grade', 'Lieutenant', 'Lieutenant Commander', 'Commander', 'Captain', 'Rear Admiral Lower Half', 'Rear Admiral', 'Vice Admiral', 'Admiral']
const AIR_ENLISTED = ['Airman Basic', 'Airman', 'Airman First Class', 'Senior Airman', 'Staff Sergeant', 'Technical Sergeant', 'Master Sergeant', 'Senior Master Sergeant', 'Chief Master Sergeant']
const MARINE_ENLISTED = ['Private', 'Private First Class', 'Lance Corporal', 'Corporal', 'Sergeant', 'Staff Sergeant', 'Gunnery Sergeant', 'Master Sergeant', 'Master Gunnery Sergeant', 'Sergeant Major']

const ENLISTED_PAY = [21_000, 24_000, 27_000, 31_000, 36_000, 42_000, 50_000, 58_000, 66_000, 75_000]
const OFFICER_PAY = [44_000, 54_000, 66_000, 86_000, 101_000, 122_000, 139_000, 170_000, 204_000, 207_000]

export interface Branch {
  id: string
  name: string
  emoji: string
  enlisted: string[]
  officer: string[]
  deployChance: number
  sea: boolean
}

export const BRANCHES: Branch[] = [
  { id: 'army', name: 'Army', emoji: '\u{1FA96}', enlisted: ARMY_ENLISTED, officer: ARMY_OFFICER, deployChance: 0.22, sea: false },
  { id: 'navy', name: 'Navy', emoji: '\u{2693}', enlisted: NAVY_ENLISTED, officer: NAVY_OFFICER, deployChance: 0.18, sea: true },
  { id: 'airforce', name: 'Air Force', emoji: '\u{2708}\u{FE0F}', enlisted: AIR_ENLISTED, officer: ARMY_OFFICER, deployChance: 0.15, sea: false },
  { id: 'marines', name: 'Marine Corps', emoji: '\u{2694}\u{FE0F}', enlisted: MARINE_ENLISTED, officer: ARMY_OFFICER, deployChance: 0.28, sea: false },
  { id: 'coastguard', name: 'Coast Guard', emoji: '\u{1F6E5}\u{FE0F}', enlisted: NAVY_ENLISTED, officer: NAVY_OFFICER, deployChance: 0.1, sea: true },
]

function branchOf(id: string): Branch {
  return BRANCHES.find((b) => b.id === id) ?? BRANCHES[0]
}

type Track = 'enlisted' | 'officer'

interface MilData {
  branch: string
  track: Track
  conscript: boolean
  serviceLeft: number
  deployments: number
}

interface MilProfile {
  /** Every medal earned, kept even after leaving. */
  medals: string[]
  deployments: number
  minefields: number
  discharge: string | null
  topRank: boolean
  retiredAt62: boolean
  everServed: boolean
}

const initMil = (): MilProfile => ({ medals: [], deployments: 0, minefields: 0, discharge: null, topRank: false, retiredAt62: false, everServed: false })

function milProfile(g: GameState): MilProfile {
  return prof(g, 'military', initMil)
}

function ranks(b: Branch, track: Track): string[] {
  return track === 'officer' ? b.officer : b.enlisted
}

/** What this rank pays here and now: the US 2020s table times payScale, in round hundreds. */
export function payFor(g: GameState, track: Track, level: number): number {
  const table = track === 'officer' ? OFFICER_PAY : ENLISTED_PAY
  return Math.round((table[Math.min(level, table.length - 1)] * payScale(g)) / 100) * 100
}

/**
 * What a promotion pays: the rank's table pay here and now, but never less than the job already
 * earns. A career saved by v4.0.2 carries US 2020s pay into a poorer country or an earlier year,
 * and a step up must not cut it. Draws nothing.
 */
function promotedPay(g: GameState, job: Job, track: Track, level: number): number {
  const kept = Number.isFinite(job.salary) ? job.salary : 0
  return Math.max(kept, payFor(g, track, level))
}

export function militaryJob(g: GameState): Job | null {
  return myJob(g, 'military.')
}

function data(job: Job): MilData {
  return view<MilData>(job.data)
}

// ---------------------------------------------------------------------------
// Local forces: which branches a country has and what they're called.

/** No navy (landlocked) or no armed forces at all (Andorra and Monaco rely on their neighbors). */
const NO_NAVY = new Set(['at', 'ch', 'hu', 'cz', 'sk', 'rs', 'et', 'ug', 'zw', 'af', 'mn', 'np'])
const NO_MILITARY = new Set(['ad', 'mc'])
const HAS_MARINES = new Set(['us', 'gb', 'kr', 'id', 'ph', 'br', 'ar', 'th', 'tw', 'nl', 'es', 'co', 'mx', 've', 'pe', 'cl', 'ec', 'ru', 'ua', 'cn', 'pt', 'it', 'fr'])
const HAS_COAST_GUARD = new Set(['us', 'ca', 'jp', 'in', 'pk', 'bd', 'kr', 'ph', 'id', 'my', 'it', 'gr', 'tr', 'se', 'no', 'cn', 'tw', 'vn', 'sa', 'ae'])
/** Commonwealth realms and kingdoms whose navies and air forces are "Royal". */
const ROYAL_FORCES = new Set(['ca', 'au', 'nz', 'nl', 'no', 'dk', 'my', 'th', 'sa', 'jo', 'ma', 'be', 'bs'])

const FORCE_NAMES: Record<string, Partial<Record<string, string>>> = {
  gb: { army: 'British Army', navy: 'Royal Navy', airforce: 'Royal Air Force', marines: 'Royal Marines' },
  jp: { army: 'Japan Ground Self-Defense Force', navy: 'Japan Maritime Self-Defense Force', airforce: 'Japan Air Self-Defense Force', coastguard: 'Japan Coast Guard' },
  il: { army: 'IDF Ground Forces', navy: 'Israeli Navy', airforce: 'Israeli Air Force' },
  de: { army: 'German Army', navy: 'German Navy', airforce: 'Luftwaffe' },
  cn: { army: 'PLA Ground Force', navy: 'PLA Navy', airforce: 'PLA Air Force', marines: 'PLA Marine Corps', coastguard: 'China Coast Guard' },
  ru: { army: 'Russian Ground Forces', navy: 'Russian Navy', airforce: 'Russian Aerospace Forces', marines: 'Russian Naval Infantry' },
  fr: { army: 'French Army', navy: 'French Navy', airforce: 'French Air and Space Force', marines: 'French Marine Troops' },
  nl: { marines: 'Netherlands Marine Corps' },
  es: { marines: 'Spanish Marine Infantry' },
  id: { marines: 'Indonesian Marine Corps' },
  ie: { army: 'Irish Army', navy: 'Irish Naval Service', airforce: 'Irish Air Corps' },
  ch: { army: 'Swiss Army', airforce: 'Swiss Air Force' },
}

function branchesFor(g: GameState): Branch[] {
  const id = g.character.countryId
  if (NO_MILITARY.has(id)) return []
  return BRANCHES.filter((b) => {
    if (b.id === 'navy') return !NO_NAVY.has(id)
    if (b.id === 'marines') return HAS_MARINES.has(id)
    if (b.id === 'coastguard') return HAS_COAST_GUARD.has(id)
    return true
  })
}

/** "Indonesian Army", "Royal Navy", "Japan Ground Self-Defense Force", "U.S. Marine Corps". */
function unitName(g: GameState, b: Branch): string {
  const id = g.character.countryId
  const named = FORCE_NAMES[id]?.[b.id]
  if (named) return named
  const country = getCountry(id)
  if (id === 'us') return `U.S. ${b.name}`
  if (ROYAL_FORCES.has(id) && (b.id === 'navy' || b.id === 'airforce')) return `Royal ${country.demonym} ${b.name}`
  return `${country.demonym} ${b.name}`
}

/** US medals for Americans; generic decorations everywhere else. */
const LOCAL_MEDALS: Record<string, string> = {
  'Achievement Medal': 'Service Medal',
  'Commendation Medal': 'Commendation Medal',
  'Bronze Star': 'Medal for Bravery',
  'Silver Star': 'Gallantry Cross',
  'Distinguished Service Cross': 'Distinguished Service Order',
  'Medal of Honor': 'Cross of Valor',
}

function medalName(g: GameState, base: string): string {
  return g.character.countryId === 'us' ? base : (LOCAL_MEDALS[base] ?? base)
}

function woundMedal(g: GameState): string {
  return g.character.countryId === 'us' ? 'Purple Heart' : 'Wound Badge'
}

// ---------------------------------------------------------------------------
// Joining

function rejectReason(g: GameState, track: Track): string | null {
  const c = g.character
  const p = peek<MilProfile>(g, 'military')
  if (ownFlag(g, 'deserter') === true) return 'deserter'
  if (isHistorical(g.year) && g.year < 1940 && c.gender === 'female') return "The recruiter laughed you out of the office: women can't enlist yet. He suggested nursing instead."
  if (p?.discharge === 'Dishonorable') return 'The recruiter looked up your record and saw your dishonorable discharge. They told you never to come back.'
  if (track === 'enlisted' && !hasHighSchool(g)) return c.countryId === 'us' ? 'The recruiter told you to come back once you have a high school diploma or GED.' : 'The recruiter told you to come back once you have finished school.'
  if (track === 'officer' && !hasCollegeDegree(g)) return 'Officer candidates need a university degree.'
  if (c.age > (track === 'officer' ? 42 : 39)) return 'The recruiter politely explained that you are too old to join up.'
  if (c.stats.health < 30) return 'You failed the military physical. The doctor suggested you try walking up some stairs first.'
  if (hasAddiction(g)) return 'You failed the military drug screening.'
  if (g.character.criminalRecord.some((r) => r.convicted && (r.sentenceYears ?? 0) >= 2) || convictions(g) >= 3) {
    return 'The recruiter ran a background check and rejected you because of your criminal record.'
  }
  return null
}

function enlist(g: GameState, b: Branch, track: Track, conscript = false): void {
  const reason = conscript ? null : rejectReason(g, track)
  if (reason === 'deserter') {
    setOwnFlag(g, 'deserter', false)
    log(g, 'I was arrested when I tried to re-enlist as a wanted deserter.', 'bad')
    tell(g, 'Busted', 'The recruiter ran your name and discovered you are a wanted deserter. Military police arrived before you finished filling out the form.', '\u{1F6A8}')
    arrestPlayer(g, 'Desertion', 3)
    return
  }
  if (reason) return tell(g, unitName(g, b), reason, b.emoji)
  const rankList = ranks(b, track)
  const company = unitName(g, b)
  const { job, quit } = hire(g, {
    defId: `military.${b.id}`,
    title: conscript ? 'Conscript' : rankList[0],
    company,
    category: 'military',
    salary: conscript ? Math.round(payFor(g, 'enlisted', 0) * 0.6) : payFor(g, track, 0),
    performance: 55,
    data: { branch: b.id, track, conscript, serviceLeft: conscript ? randInt(g, 1, 2) : 0, deployments: 0 },
  })
  const co = addColleague(g, company, track === 'officer' ? 'Colonel' : 'Drill Sergeant', { ageOffset: [5, 20], relationship: 35 })
  co.relation = 'boss'
  job.bossId = co.id
  const p = milProfile(g)
  p.everServed = true
  p.discharge = null
  addHidden(g, 'discipline', randInt(g, 4, 10))
  addHidden(g, 'athleticism', randInt(g, 3, 8))
  addStat(g, 'health', randInt(g, -3, 6))
  const training = pickSite(g, [
    `Basic training was brutal. ${co.firstName} ${co.lastName}, your drill instructor, screamed at you until you could make a bed with your eyes closed.`,
    `You survived basic training, although you'll never look at push-ups the same way again.`,
    `During basic training you learned to march, shoot, and eat an entire meal in ninety seconds.`,
  ], 0x285f1a36)
  const what = conscript ? `You reported for mandatory service in the ${company}.` : track === 'officer' ? `You were commissioned as a ${rankList[0]} in the ${company}.` : `You enlisted in the ${company} as a ${rankList[0]}.`
  log(g, conscript ? `I was drafted into the ${company}.` : track === 'officer' ? `I became an officer in the ${company}.` : `I enlisted in the ${company}.`, 'event')
  remember(g, conscript ? `Drafted into the ${company}.` : `Joined the ${company} (${track}).`)
  say(g, unitName(g, b), `${what}${quitNote(quit)} ${training}`, b.emoji, 'good')
}

// ---------------------------------------------------------------------------
// Leaving

export type DischargeType = 'Honorable' | 'General' | 'Medical' | 'Other Than Honorable' | 'Dishonorable'

function discharge(g: GameState, type: DischargeType, retired = false): void {
  const c = g.character
  const p = milProfile(g)
  p.discharge = type
  g.flags['special.military.discharge'] = type
  const reason = retired ? 'retired' : type === 'Dishonorable' || type === 'Other Than Honorable' ? 'fired' : 'quit'
  leave(g, reason)
  const rec = c.careerHistory[c.careerHistory.length - 1]
  if (rec && !retired) rec.title = `${rec.title} (${type} Discharge)`
}

function retireFromService(g: GameState, job: Job, mandatory: boolean): void {
  const c = g.character
  const years = job.yearsAtCompany
  const p = milProfile(g)
  if (years >= 20) {
    const pct = Math.min(0.75, 0.5 + (years - 20) * 0.025)
    c.pension = Math.round(job.salary * pct)
    c.retired = true
  }
  if (mandatory && c.age >= 62 && job.yearsAtCompany >= 20) p.retiredAt62 = true
  const rank = job.title
  const unit = job.company
  discharge(g, 'Honorable', years >= 20)
  log(g, `I retired from the ${unit} as a ${rank}.`, 'good')
  remember(g, `Retired from the ${unit} as a ${rank} after ${years} years.`)
  const pension = c.pension > 0 && years >= 20 ? ` You'll receive a pension of ${money(c.pension)} a year.` : ' You served fewer than 20 years, so there is no pension.'
  say(g, 'Retirement', `${mandatory ? 'You reached the mandatory retirement age. ' : ''}You retired from the ${unit} as a ${rank} after ${years} years of service.${pension} Thank you for your service.`, '\u{1F396}\u{FE0F}', 'good')
}

// ---------------------------------------------------------------------------
// Deployment minefield

interface MineData {
  step: number
  total: number
  place: string
  sea: boolean
  /** 0-2 = the mined path this step, -1 = none. */
  mine: number
}

const PATHS = ['left', 'middle', 'right']

const LAND_PLACES = ['a desert outpost', 'a remote mountain pass', 'a jungle border region', 'a war-torn city', 'a frozen arctic station', 'a dusty supply route', 'an abandoned airfield']
const SEA_PLACES = ['contested waters', 'a hostile coastline', 'a pirate-infested strait', 'a disputed island chain', 'a blockaded harbor']

function mineHint(g: GameState, mine: number, sea: boolean): string {
  const smarts = g.character.stats.smarts
  const thing = sea ? 'a suspicious ripple in the water' : 'freshly disturbed soil'
  if (mine >= 0 && chance(g, 0.4 + smarts / 200)) return ` You notice ${thing} to the ${PATHS[mine]}.`
  if (mine < 0 && chance(g, 0.3)) return ` You notice ${thing} to the ${pick(g, PATHS)}.`
  if (mine >= 0 && chance(g, 0.25)) {
    const decoy = (mine + randInt(g, 1, 2)) % 3
    return ` You notice ${thing} to the ${PATHS[decoy]}.`
  }
  return ''
}

function queueMineStep(g: GameState, d: Omit<MineData, 'mine'>): void {
  const mine = chance(g, 0.3) ? randInt(g, 0, 2) : -1
  const hint = mineHint(g, mine, d.sea)
  const intro =
    d.step === 1
      ? d.sea
        ? `Your ship must navigate a field of naval mines to reach ${d.place}.`
        : `Your unit must cross a minefield to reach ${d.place}.`
      : d.sea
        ? `So far so good. ${d.total - d.step + 1} stretches of mined water to go.`
        : `So far so good. ${d.total - d.step + 1} stretches of minefield to go.`
  scriptChoice(
    g,
    mineScript,
    `Deployment (${d.step}/${d.total})`,
    `${intro}${hint} Which way do you go?`,
    [
      { id: '0', label: d.sea ? 'Steer to port (left)' : 'Take the left path', emoji: '\u{2B05}\u{FE0F}' },
      { id: '1', label: d.sea ? 'Hold course (middle)' : 'Go straight through the middle', emoji: '\u{2B06}\u{FE0F}' },
      { id: '2', label: d.sea ? 'Steer to starboard (right)' : 'Take the right path', emoji: '\u{27A1}\u{FE0F}' },
    ],
    { emoji: '\u{1F4A3}', data: { ...d, mine } },
  )
}

const MEDALS: { name: string; weight: number; value: number }[] = [
  { name: 'Achievement Medal', weight: 30, value: 200 },
  { name: 'Commendation Medal', weight: 25, value: 600 },
  { name: 'Bronze Star', weight: 20, value: 1_500 },
  { name: 'Silver Star', weight: 12, value: 5_000 },
  { name: 'Distinguished Service Cross', weight: 6, value: 20_000 },
  { name: 'Medal of Honor', weight: 2, value: 75_000 },
]

const medalScript = defineScript('special.mil.medal', (g, choice, raw) => {
  const found = MEDALS.find((m) => m.name === (raw as { medal?: string } | undefined)?.medal) ?? MEDALS[0]
  const medal = { ...found, name: medalName(g, found.name) }
  const p = milProfile(g)
  if (choice === 'keep') {
    p.medals.push(medal.name)
    count(g, 'medals')
    log(g, `I was awarded the ${medal.name}.`, 'good')
    remember(g, `Awarded the ${medal.name}.`)
    say(g, medal.name, `You proudly pinned the ${medal.name} to your uniform.`, '\u{1F396}\u{FE0F}', 'good')
  } else if (choice === 'pawn') {
    addMoney(g, medal.value, 'asset.sell')
    addHidden(g, 'karma', -2)
    log(g, `I pawned my ${medal.name} for ${money(medal.value)}.`)
    say(g, medal.name, `You pawned your ${medal.name} for ${money(medal.value)}. The pawn shop owner saluted you sarcastically.`, '\u{1F4B0}')
  } else {
    addHidden(g, 'karma', 3)
    log(g, `I refused the ${medal.name}.`)
    say(g, medal.name, `You refused the ${medal.name}, saying the real heroes didn't come home. There wasn't a dry eye in the room.`, '\u{1F396}\u{FE0F}')
  }
})

const INJURIES = ['Shrapnel Wounds', 'Shattered Leg', 'Severe Burns', 'Traumatic Brain Injury']

const mineScript = defineScript('special.mil.mine', (g, choice, raw) => {
  const d = raw as unknown as MineData
  const c = g.character
  const job = militaryJob(g)
  const picked = Number(choice)
  const boom = d.mine >= 0 && picked === d.mine && chance(g, 0.8)
  if (!boom) {
    if (d.mine >= 0 && picked === d.mine) addStat(g, 'happiness', -2)
    if (d.step < d.total) {
      queueMineStep(g, { step: d.step + 1, total: d.total, place: d.place, sea: d.sea })
      return
    }
    // Made it through.
    const p = milProfile(g)
    p.minefields += 1
    count(g, 'minefieldsCleared')
    if (job) bump(job, randInt(g, 8, 15))
    addStat(g, 'happiness', 6)
    addHidden(g, 'discipline', 3)
    log(g, `I survived a deployment to ${d.place}.`, 'good')
    const medal = MEDALS[Math.min(MEDALS.length - 1, Math.floor(rand(g) ** 1.6 * MEDALS.length + p.minefields / 8))]
    scriptChoice(
      g,
      medalScript,
      'Mission Accomplished',
      `${d.sea ? 'Your ship made it through the mines' : 'You made it across the minefield'} and completed your mission at ${d.place}. You've been awarded the ${medalName(g, medal.name)} for bravery!`,
      [
        { id: 'keep', label: 'Accept it proudly', emoji: '\u{1F396}\u{FE0F}' },
        { id: 'pawn', label: `Pawn it (${money(medal.value)})`, emoji: '\u{1F4B0}' },
        { id: 'refuse', label: 'Refuse it', emoji: '\u{1F64F}' },
      ],
      { emoji: '\u{1F396}\u{FE0F}', data: { medal: medal.name } },
    )
    return
  }
  // Boom.
  if (chance(g, 0.4)) {
    g.flags['special.diedInAction'] = true
    remember(g, `Killed in action at ${d.place}.`)
    log(g, d.sea ? `My ship hit a naval mine near ${d.place}.` : `I stepped on a landmine at ${d.place}.`, 'bad')
    tell(g, 'Killed in Action', d.sea ? `Your ship struck a naval mine near ${d.place}. You went down with it. You died a hero.` : `You stepped on a landmine at ${d.place}. You died a hero.`, '\u{1F4A5}')
    killCharacter(g, 'Killed in Action')
    return
  }
  const injury = pick(g, INJURIES)
  if (!c.conditions.some((x) => x.name === injury)) {
    c.conditions.push({ id: uid(g, 'c'), name: injury, kind: 'injury', severity: randInt(g, 25, 50), yearsHad: 0, curable: true, diagnosed: true, age: c.age })
  }
  addStat(g, 'health', -randInt(g, 20, 35))
  addStat(g, 'happiness', -15)
  milProfile(g).medals.push(woundMedal(g))
  count(g, 'medals')
  log(g, `I was badly wounded by a ${d.sea ? 'naval mine' : 'landmine'} at ${d.place}.`, 'bad')
  remember(g, `Wounded in action at ${d.place} (${injury.toLowerCase()}).`)
  let text = `A ${d.sea ? 'naval mine exploded beside your ship' : 'landmine exploded beneath you'} at ${d.place}. You survived, but suffered ${injury.toLowerCase()}. You were awarded the ${woundMedal(g)}.`
  if (job && chance(g, 0.5)) {
    discharge(g, 'Medical')
    text += ' Your injuries were serious enough that you received a medical discharge.'
  }
  say(g, 'Wounded in Action', text, '\u{1F4A5}', 'bad')
  if (c.stats.health <= 0) killCharacter(g, 'Killed in Action')
})

const deployScript = defineScript('special.mil.deploy', (g, choice, raw) => {
  const d = raw as unknown as { place: string; sea: boolean }
  const job = militaryJob(g)
  if (!job) return
  if (choice === 'refuse') {
    if (chance(g, 0.5)) {
      log(g, 'I was court-martialed for refusing deployment.', 'bad')
      discharge(g, 'Dishonorable')
      tell(g, 'Court-Martial', 'You refused to deploy and were court-martialed. You received a dishonorable discharge.', '\u{2696}\u{FE0F}')
      if (chance(g, 0.3)) arrestPlayer(g, 'Refusing Deployment', 2)
    } else {
      bump(job, -20)
      log(g, 'I refused a deployment.', 'bad')
      say(g, 'Deployment', 'You refused the deployment. Your commanding officer wrote you up and assigned you latrine duty for the rest of the year.', '\u{1F6BD}', 'bad')
    }
    return
  }
  const md = data(job)
  md.deployments += 1
  milProfile(g).deployments += 1
  count(g, 'deployments')
  const total = Math.min(5, 3 + Math.floor((milProfile(g).deployments - 1) / 2))
  queueMineStep(g, { step: 1, total, place: d.place, sea: d.sea })
})

function offerDeployment(g: GameState, job: Job, war: WarDef | null = null): void {
  const b = branchOf(data(job).branch)
  const sea = b.sea && chance(g, 0.75)
  // Not the same spot as last time ("a remote mountain pass" two years running reads like a bug).
  const last = g.flags['special.mil.lastPlace']
  // In a real war, soldiers go to that war's fronts.
  const fronts = war && !sea ? warFronts(war, g.character.countryId).filter((x) => x !== last) : []
  const place = pick(g, fronts.length ? fronts : (sea ? SEA_PLACES : LAND_PLACES).filter((x) => x !== last))
  g.flags['special.mil.lastPlace'] = place
  scriptChoice(
    g,
    deployScript,
    'Deployment',
    `Your ${b.name.toLowerCase()} unit has been deployed to ${place}. ${sea ? 'Intelligence says the area is full of naval mines.' : 'Intelligence says the route is heavily mined.'}`,
    [
      { id: 'go', label: 'Report for duty', emoji: '\u{1FA96}' },
      { id: 'refuse', label: 'Refuse to deploy', emoji: '\u{1F645}' },
    ],
    { emoji: b.emoji, data: { place, sea } },
  )
}

// ---------------------------------------------------------------------------
// Conscription

const draftScript = defineScript('special.mil.draft', (g, choice) => {
  setOwnFlag(g, 'drafted', true)
  if (choice === 'serve') {
    enlist(g, branchOf('army'), 'enlisted', true)
    return
  }
  if (choice === 'objector') {
    if (chance(g, 0.5)) {
      addHidden(g, 'karma', 2)
      log(g, 'I was granted conscientious objector status.')
      say(g, 'Draft', 'Your conscientious objector status was approved. You performed a year of community service instead.', '\u{1F54A}\u{FE0F}', 'good')
    } else {
      say(g, 'Draft', 'Your conscientious objector application was denied. You were drafted anyway.', '\u{1F4DC}', 'bad')
      enlist(g, branchOf('army'), 'enlisted', true)
    }
    return
  }
  // Dodge the draft.
  if (chance(g, 0.45)) {
    log(g, 'I was caught dodging the draft.', 'bad')
    tell(g, 'Draft Dodger', 'You tried to dodge the draft, but the military police found you hiding in your parents\' attic.', '\u{1F6A8}')
    arrestPlayer(g, 'Draft Evasion', 2)
  } else {
    addHidden(g, 'karma', -3)
    log(g, 'I dodged the draft.')
    say(g, 'Draft Dodger', 'You dodged the draft. The authorities seem to have lost your paperwork... for now.', '\u{1F92B}')
  }
})

function maybeDraft(g: GameState): void {
  const c = g.character
  if (c.age < 18 || c.age > 20 || c.prison || ownFlag(g, 'drafted') === true) return
  if (isHistorical(g.year)) {
    if (!historicalServiceDue(g)) return
  } else if (!getCountry(c.countryId).conscription) return
  if (militaryJob(g)) {
    setOwnFlag(g, 'drafted', true)
    return
  }
  const country = getCountry(c.countryId)
  scriptChoice(
    g,
    draftScript,
    'Draft Notice',
    `You received a draft notice. Every able-bodied ${country.demonym} citizen must complete mandatory military service.`,
    [
      { id: 'serve', label: 'Report for duty', emoji: '\u{1FA96}' },
      { id: 'objector', label: 'Apply as a conscientious objector', emoji: '\u{1F54A}\u{FE0F}' },
      { id: 'dodge', label: 'Dodge the draft', emoji: '\u{1F3C3}' },
    ],
    { emoji: '\u{1F4DC}' },
  )
}

const serviceDoneScript = defineScript('special.mil.serviceDone', (g, choice) => {
  const job = militaryJob(g)
  if (!job) return
  const md = data(job)
  if (choice === 'reenlist') {
    const b = branchOf(md.branch)
    md.conscript = false
    md.serviceLeft = 0
    promote(g, job, b.enlisted[1], promotedPay(g, job, 'enlisted', 1), 1)
    log(g, `I re-enlisted in the ${job.company}.`, 'good')
    say(g, 'Re-enlisted', `You re-enlisted in the ${job.company} and were promoted to ${job.title}.`, b.emoji, 'good')
    return
  }
  const unit = job.company
  discharge(g, 'Honorable')
  log(g, `I completed my mandatory service in the ${unit}.`, 'good')
  say(g, 'Service Complete', `You completed your mandatory service and received an honorable discharge from the ${unit}.`, '\u{1F396}\u{FE0F}', 'good')
})

// ---------------------------------------------------------------------------
// Yearly

export function yearlyMilitary(g: GameState): void {
  const c = g.character
  if (!c.alive) return
  if (!claimYearly(g, 'military')) return
  if (ownFlag(g, 'deserter') === true && !c.prison && chance(g, 0.12)) {
    setOwnFlag(g, 'deserter', false)
    log(g, 'Military police finally caught up with me for deserting.', 'bad')
    tell(g, 'Busted', 'Military police tracked you down and arrested you for desertion.', '\u{1F6A8}')
    arrestPlayer(g, 'Desertion', 3)
    if (!c.alive || c.prison) return
  }
  if (isHistorical(g.year)) {
    warEvaderCheck(g)
    if (!c.alive || c.prison) return
    maybeWarDraft(g)
  }
  maybeDraft(g)
  const job = militaryJob(g)
  if (!job || c.prison) return
  const md = data(job)
  const b = branchOf(md.branch)
  syncTenure(g, job)
  earnIncome(g, job.salary, 'wage')
  // A war this country is fighting right now (never in the present or the future).
  const war = isHistorical(g.year) ? (warsAt(c.countryId, g.year).find((w) => (w.fronts && Object.keys(w.fronts).length > 0)) ?? null) : null

  if (md.conscript) {
    md.serviceLeft -= 1
    bump(job, randInt(g, -5, 8))
    // Wartime conscripts get sent to the front too.
    if (war && md.serviceLeft > 0 && deploymentDue(g) && chance(g, 0.45)) {
      g.flags['special.mil.lastOrder'] = c.age
      offerDeployment(g, job, war)
    }
    if (md.serviceLeft <= 0) {
      scriptChoice(
        g,
        serviceDoneScript,
        'Service Complete',
        `Your mandatory service in the ${job.company} is complete. Do you want to go home or make a career of it?`,
        [
          { id: 'leave', label: 'Go home', emoji: '\u{1F3E0}' },
          { id: 'reenlist', label: 'Re-enlist', emoji: '\u{1FA96}' },
        ],
        { emoji: b.emoji },
      )
    }
    return
  }

  // Performance drifts with discipline; natural leaders keep their unit in line.
  bump(job, (c.hidden.discipline - 50) / 12 + randInt(g, -6, 5) + (hasTalent(g, 'Leadership') ? 3 : 0) + (hasTalent(g, 'Athletics') ? 1 : 0))

  // Promotions.
  const ladder = ranks(b, md.track)
  const next = job.level + 1
  const wait = job.level < 3 ? 1 : job.level < 6 ? 2 : 3
  // Leadership talent: officers notice who the troops follow.
  const leader = hasTalent(g, 'Leadership')
  const bar = (next >= ladder.length - 3 ? 80 : 60) - (leader ? 5 : 0)
  if (next < ladder.length && job.yearsInRole >= wait && job.performance >= bar && chance(g, leader ? 0.7 : 0.55)) {
    promote(g, job, ladder[next], promotedPay(g, job, md.track, next), next)
    if (next === ladder.length - 1) milProfile(g).topRank = true
    log(g, `I was promoted to ${ladder[next]}.`, 'good')
    remember(g, `Promoted to ${ladder[next]} in the ${job.company}.`)
    say(g, 'Promotion', `You've been promoted to ${ladder[next]}! Your new salary is ${money(job.salary)}.`, '\u{1F396}\u{FE0F}', 'good')
  } else if (job.performance < 15 && chance(g, 0.4)) {
    const unit = job.company
    discharge(g, 'General')
    log(g, `I was discharged from the ${unit} for poor performance.`, 'bad')
    say(g, 'Discharged', `Your commanding officer had seen enough. You received a general discharge from the ${unit} for poor performance.`, '\u{1F4C9}', 'bad')
    return
  }

  if (c.age >= 62) {
    retireFromService(g, job, true)
    return
  }

  // A deployment order every year or two at most (not the same popup every single year).
  // Units at war are sent out far more often.
  if (deploymentDue(g) && chance(g, war ? Math.min(0.6, b.deployChance * 2.5) : b.deployChance)) {
    g.flags['special.mil.lastOrder'] = c.age
    offerDeployment(g, job, war)
  }
}

function deploymentDue(g: GameState): boolean {
  const lastOrder = g.flags['special.mil.lastOrder']
  const age = g.character.age
  return typeof lastOrder !== 'number' || lastOrder > age || age - lastOrder >= 2
}

// ---------------------------------------------------------------------------
// History: national service by era and wartime call-ups

function inUniversity(g: GameState): boolean {
  const cur = g.character.education.current
  return !!cur && (cur.level === 'university' || cur.level === 'graduate' || cur.level === 'community')
}

/**
 * Peacetime national service in a past year: was there any, did it take women, were students
 * deferred, and did this 18-year-old's number come up in the ballot? Consumes a roll only for
 * ballots, and only once per character.
 */
function historicalServiceDue(g: GameState): boolean {
  const c = g.character
  const country = getCountry(c.countryId)
  if (!conscriptionAt(c.countryId, g.year, country.conscription)) return false
  if (!liableForService(g)) return false
  if (c.gender === 'female' && !womenConscriptedAt(c.countryId, g.year)) return false
  // Wartime call-ups take over while a war is on.
  if (warDraftAt(c.countryId, g.year)) return false
  if (studentsDeferredAt(c.countryId, g.year) && inUniversity(g)) return false
  const odds = serviceOddsAt(c.countryId, g.year)
  if (odds < 1 && ownFlag(g, 'ballot') === undefined) {
    const picked = chance(g, odds)
    setOwnFlag(g, 'ballot', picked)
    if (!picked) {
      setOwnFlag(g, 'drafted', true)
      log(g, pickLine(g, ["My number didn't come up in the national service ballot.", 'I was not selected for national service. My mother cried with relief.']))
      return false
    }
  }
  return true
}

/**
 * Call-ups reach the country's citizens and permanent residents, not people there on a visa, as
 * refugees or without papers. Lives from before passports were tracked count their birth country.
 */
function liableForService(g: GameState): boolean {
  const c = g.character
  const imm = c.immigration
  if (imm && imm.countryId === c.countryId) return imm.status === 'citizen' || imm.status === 'permanent'
  if (Array.isArray(c.citizenships) && c.citizenships.length > 0) return c.citizenships.includes(c.countryId)
  return (c.birthCountryId ?? c.countryId) === c.countryId
}

function warKey(war: WarDef): string {
  return `warDraft.${war.id}`
}

/** A war is calling up this character's age group: a draft notice with four ways to respond. */
function maybeWarDraft(g: GameState): void {
  const c = g.character
  if (!c.alive || c.prison) return
  const found = warDraftAt(c.countryId, g.year)
  if (!found) return
  const { war, rule } = found
  if (c.age < rule.minAge || c.age > rule.maxAge) return
  if (c.gender === 'female' && !rule.women) return
  if (ownFlag(g, warKey(war)) !== undefined || !liableForService(g)) return
  if (militaryJob(g)) {
    setOwnFlag(g, warKey(war), 'serving')
    return
  }
  if (rule.studentsDeferredUntil !== undefined && g.year <= rule.studentsDeferredUntil && inUniversity(g)) {
    // The draft-era college: a student's deferment, noted once per war (no dice are rolled either way).
    const key = `${warKey(war)}.deferred`
    if (ownFlag(g, key) === undefined) {
      setOwnFlag(g, key, true)
      log(g, `My student deferment kept me out of the draft for ${war.name}, for now. Half my class was in college for the same reason.`, 'neutral')
    }
    return
  }
  if (!chance(g, rule.odds)) return
  setOwnFlag(g, warKey(war), 'called')
  const unfit = medicallyUnfit(g)
  const choices: ChoiceOption[] = [
    { id: 'serve', label: 'Report for duty', emoji: '\u{1FA96}' },
    { id: 'objector', label: 'Apply as a conscientious objector', emoji: '\u{1F54A}\u{FE0F}' },
    {
      id: 'medical',
      label: 'Ask for a medical exemption',
      emoji: '\u{1FA7A}',
      ...withHintText(unfit ? '' : talentHint(g, 'Acting', 'Your acting could sell the army doctors a very convincing limp. Better odds, not a sure thing.')),
    },
    { id: 'flee', label: 'Flee and go into hiding', emoji: '\u{1F3C3}', ...withHintText(talentHint(g, 'Crime', 'You know how to disappear: hiding out is likelier to work for you.')) },
  ]
  const text = rule.harsh
    ? `${capFirst(war.name)} needs soldiers, and your call-up papers have arrived. Refusing is not really an option here. What will you do?`
    : `${capFirst(war.name)} needs soldiers, and your call-up papers have arrived: report to the recruiting office within the week. What will you do?`
  scriptChoice(g, warDraftScript, 'Draft Notice', text, choices, { emoji: '\u{1F4DC}', data: { war: war.id } as Json })
}

function withHintText(text: string): { hint?: string } {
  return text ? { hint: text } : {}
}

function capFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

/** Genuinely unfit for service: poor health or a serious physical condition. */
function medicallyUnfit(g: GameState): boolean {
  const c = g.character
  return c.stats.health < 45 || c.conditions.some((x) => x.kind !== 'addiction' && x.kind !== 'mental' && x.severity >= 20)
}

/** Drafted for a war: a conscript for as long as the war lasts (one to six years). */
function wartimeEnlist(g: GameState, war: WarDef): void {
  enlist(g, branchOf('army'), 'enlisted', true)
  const job = militaryJob(g)
  if (!job) return
  const md = data(job)
  md.serviceLeft = Math.max(1, Math.min(6, war.to - g.year + 1))
  job.data.war = war.id
  setOwnFlag(g, warKey(war), 'served')
  remember(g, `Drafted to fight in ${war.name}.`)
}

const warDraftScript = defineScript('special.mil.wardraft', (g, choice, raw) => {
  const c = g.character
  if (!c.alive) return
  const war = getWar(String((raw as { war?: string } | undefined)?.war ?? ''))
  const rule = war?.draft?.[c.countryId]
  if (!war || !rule) return
  const harshRule = rule.harsh === true
  if (choice === 'serve') {
    wartimeEnlist(g, war)
    return
  }
  if (choice === 'objector') {
    const p = harshRule ? 0.05 : 0.45 + (c.hidden.religiousness >= 60 ? 0.2 : 0)
    if (chance(g, p)) {
      setOwnFlag(g, warKey(war), 'objector')
      addHidden(g, 'karma', 3)
      log(g, `I was granted conscientious objector status in ${war.name}.`)
      remember(g, `Conscientious objector in ${war.name}.`)
      say(g, 'Conscientious Objector', 'The tribunal accepted your objection. You spent the war driving ambulances and digging potatoes instead of carrying a rifle.', '\u{1F54A}\u{FE0F}', 'good')
      return
    }
    if (harshRule && chance(g, 0.5)) {
      log(g, 'I refused to fight and was arrested.', 'bad')
      tell(g, 'Objection Rejected', 'The tribunal rejected your objection and called you a coward and a traitor. The police were waiting outside.', '\u{1F6A8}')
      arrestPlayer(g, 'Refusing Military Service', 2)
      return
    }
    say(g, 'Objection Rejected', 'The tribunal rejected your objection. You were drafted anyway.', '\u{1F4DC}', 'bad')
    wartimeEnlist(g, war)
    return
  }
  if (choice === 'medical') {
    if (medicallyUnfit(g)) {
      setOwnFlag(g, warKey(war), 'exempt')
      log(g, 'The army doctors declared me unfit for service.')
      say(g, 'Medical Exemption', 'The army doctors took one look at you and stamped your papers "unfit for service".', '\u{1FA7A}')
      return
    }
    const p = 0.15 + (hasTalent(g, 'Acting') ? 0.35 : 0) + c.hidden.craziness / 400
    if (chance(g, p)) {
      setOwnFlag(g, warKey(war), 'exempt')
      addHidden(g, 'karma', -3)
      log(g, 'I faked my way to a medical exemption from the draft.')
      say(g, 'Medical Exemption', 'You limped, wheezed and squinted your way through the medical exam so convincingly that they sent you home. The neighbors are suspicious.', '\u{1FA7A}')
      return
    }
    addHidden(g, 'karma', -2)
    if (harshRule && chance(g, 0.4)) {
      log(g, 'I was arrested for faking an illness to dodge the draft.', 'bad')
      tell(g, 'Caught Faking', 'The army doctor saw straight through your act and called the military police.', '\u{1F6A8}')
      arrestPlayer(g, 'Draft Evasion', 2)
      return
    }
    say(g, 'Caught Faking', 'The army doctor watched you "limp" into the room and then jog down the stairs afterward. You were drafted on the spot.', '\u{1FA7A}', 'bad')
    wartimeEnlist(g, war)
    return
  }
  // Flee into hiding.
  const p = 0.5 + (hasTalent(g, 'Crime') ? 0.2 : 0) - (harshRule ? 0.1 : 0)
  if (chance(g, p)) {
    setOwnFlag(g, warKey(war), 'evader')
    setOwnFlag(g, 'warEvader', war.id)
    addStat(g, 'happiness', -4)
    addHidden(g, 'karma', -3)
    log(g, 'I fled and went into hiding to avoid the draft.', 'bad')
    remember(g, `Went into hiding to dodge the draft in ${war.name}.`)
    say(g, 'In Hiding', 'You slipped out of town before dawn and found a hiding place far from home. Now you just have to stay out of sight until the war is over.', '\u{1F3C3}')
    return
  }
  log(g, 'I was caught trying to dodge the draft.', 'bad')
  tell(g, 'Caught', "Military police caught you before you'd made it out of town.", '\u{1F6A8}')
  arrestPlayer(g, 'Draft Evasion', harshRule ? 3 : 2)
})

/** Hiding from a war's draft: the police may come knocking until the war ends. */
function warEvaderCheck(g: GameState): void {
  const c = g.character
  const warId = ownFlag(g, 'warEvader')
  if (typeof warId !== 'string' || !warId) return
  const war = getWar(warId)
  if (!war || !warsAt(c.countryId, g.year).some((w) => w.id === warId)) {
    setOwnFlag(g, 'warEvader', '')
    log(g, 'The war was over, so I came out of hiding.')
    return
  }
  if (c.prison || !chance(g, 0.12)) return
  setOwnFlag(g, 'warEvader', '')
  log(g, 'The police finally found me hiding from the draft.', 'bad')
  tell(g, 'Found', 'The police tracked down your hiding place and arrested you for draft evasion.', '\u{1F6A8}')
  arrestPlayer(g, 'Draft Evasion', 2)
}

// ---------------------------------------------------------------------------
// Menus

function militaryReason(g: GameState): string | null {
  return blocked(g, 18)
}

function branchMenu(g: GameState, b: Branch): MenuGroup {
  return {
    type: 'menu',
    id: `military.${b.id}`,
    label: unitName(g, b),
    emoji: b.emoji,
    subtitle: 'Enlist or become an officer',
    children: (): MenuNode[] => [
      {
        type: 'action',
        id: `military.${b.id}.enlist`,
        label: 'Enlist',
        emoji: '\u{1FA96}',
        subtitle: `Start as a ${b.enlisted[0]} · ${money(payFor(g, 'enlisted', 0))}/yr · ${g.character.countryId === 'us' ? 'High school diploma' : 'School-leaving certificate'}`,
        disabledReason: militaryReason,
        confirm: (g) => (g.character.job ? `Joining the ${unitName(g, b)} means quitting your job as ${g.character.job.title}. Continue?` : null),
        run: (g) => enlist(g, b, 'enlisted'),
      },
      {
        type: 'action',
        id: `military.${b.id}.officer`,
        label: 'Become an Officer',
        emoji: '\u{2B50}',
        subtitle: `Start as a ${b.officer[0]} · ${money(payFor(g, 'officer', 0))}/yr · University degree`,
        disabledReason: militaryReason,
        confirm: (g) => (g.character.job ? `Joining the ${unitName(g, b)} means quitting your job as ${g.character.job.title}. Continue?` : null),
        run: (g) => enlist(g, b, 'officer'),
      },
    ],
  }
}

export const militaryMenu: MenuGroup = {
  type: 'menu',
  id: 'military',
  label: 'Military',
  emoji: '\u{1FA96}',
  subtitle: (g) => (militaryJob(g) ? 'You are serving' : 'Serve your country'),
  visible: (g) => g.character.alive && !g.character.prison && g.character.age >= 17,
  header: (g) => {
    const job = militaryJob(g)
    if (job) return `You are a ${job.title} in the ${job.company}. Your service options are in your job section.`
    return g.character.countryId === 'us' ? 'Enlist with a high school diploma, or join as an officer with a university degree. You must be 18 or older.' : 'Enlist once you have finished school, or join as an officer with a university degree. You must be 18 or older.'
  },
  children: (g): MenuNode[] => {
    if (militaryJob(g)) return [{ type: 'info', id: 'military.serving', text: 'You are already serving.', emoji: '\u{1FA96}' }]
    const list = branchesFor(g)
    if (!list.length) return [{ type: 'info', id: 'military.none', text: `${countryLabel(getCountry(g.character.countryId))} has no armed forces of its own. Its neighbors handle the defending.`, emoji: '\u{1F54A}\u{FE0F}' }]
    return list.map((b) => branchMenu(g, b))
  },
}

const workHarder: MenuAction = {
  type: 'action',
  id: 'mil.workHarder',
  label: 'Work Harder',
  emoji: '\u{1F4AA}',
  subtitle: 'Put in some extra effort',
  disabledReason: (g) => blocked(g, 0),
  run: (g) => {
    const job = militaryJob(g)
    if (!job) return
    if (!useYearAction(g, 'mil.workHarder', 2)) return tell(g, 'Work Harder', "You're already running on fumes. Your body needs rest before you push any harder this year.", '\u{1F971}')
    bump(job, randInt(g, 4, 10))
    addStat(g, 'health', -1)
    const md = data(job)
    const ladder = ranks(branchOf(md.branch), md.track)
    const nextRank = ladder[job.level + 1]
    log(g, pickLine(g, ['I volunteered for extra drills.', 'I worked harder on base.', 'I polished my boots until I could see my future in them.']))
    say(
      g,
      'Work Harder',
      `${pickLine(g, ['You volunteered for every extra drill on the schedule.', 'You spent your weekends studying field manuals.', 'You were the first one up and the last one to bed all year.'])}${nextRank && !md.conscript ? ` Keep it up and you might make ${nextRank}.` : ''}`,
      '\u{1F4AA}',
      'good',
    )
  },
}

const requestDischarge: MenuAction = {
  type: 'action',
  id: 'mil.discharge',
  label: 'Discharge',
  emoji: '\u{1F4DD}',
  subtitle: 'Request an honorable discharge',
  disabledReason: (g) => blocked(g, 0),
  confirm: () => 'Request a discharge from the military?',
  run: (g) => {
    const job = militaryJob(g)
    if (!job) return
    if (!useYearAction(g, 'mil.discharge', 1)) return tell(g, 'Discharge', 'Your commanding officer already denied a request this year.', '\u{1F4DD}')
    const md = data(job)
    const odds = md.conscript ? 0.1 : Math.min(0.9, 0.3 + job.yearsAtCompany * 0.06)
    if (chance(g, odds)) {
      const unit = job.company
      const years = job.yearsAtCompany
      discharge(g, 'Honorable')
      log(g, `I was honorably discharged from the ${unit}.`, 'good')
      say(g, 'Discharge', `Your request was approved. You received an honorable discharge from the ${unit} after ${years} year${years === 1 ? '' : 's'} of service.`, '\u{1F396}\u{FE0F}', 'good')
    } else {
      const boss = getPerson(g, job.bossId)
      if (boss) addRelationship(boss, -5)
      say(g, 'Discharge', pickLine(g, ['Your request was denied. Get back to work, soldier.', 'Your commanding officer laughed, tore up your request, and handed you a mop.']), '\u{1F4DD}', 'bad')
    }
  },
}

const desert: MenuAction = {
  type: 'action',
  id: 'mil.desert',
  label: 'Desert',
  emoji: '\u{1F3C3}',
  subtitle: 'Desert your post (a crime)',
  disabledReason: (g) => blocked(g, 0),
  confirm: () => 'Desertion is a serious crime. Are you sure you want to desert your post?',
  run: (g) => {
    const job = militaryJob(g)
    if (!job) return
    count(g, 'crimes')
    if (chance(g, 0.45)) {
      discharge(g, 'Dishonorable')
      log(g, 'I was caught trying to desert.', 'bad')
      tell(g, 'Busted', 'You tried to slip out of the base at night, but the guards caught you climbing the fence.', '\u{1F6A8}')
      arrestPlayer(g, 'Desertion', 3)
      return
    }
    setOwnFlag(g, 'deserter', true)
    addHidden(g, 'notoriety', 5)
    discharge(g, 'Dishonorable')
    log(g, 'I deserted the military.', 'bad')
    remember(g, 'Deserted the military.')
    say(g, 'Deserted', 'You slipped away in the night and never looked back. The military police will be looking for you.', '\u{1F3C3}', 'bad')
  },
}

const reportMisconduct: MenuAction = {
  type: 'action',
  id: 'mil.report',
  label: 'Report Misconduct',
  emoji: '\u{1F6A9}',
  subtitle: 'File a grievance against your commanding officer',
  disabledReason: (g) => blocked(g, 0),
  run: (g) => {
    const job = militaryJob(g)
    if (!job) return
    if (!useYearAction(g, 'mil.report', 1)) return tell(g, 'Report Misconduct', 'You already filed a grievance this year. The inspector general is avoiding you.', '\u{1F6A9}')
    const boss = getPerson(g, job.bossId)
    const name = boss ? `${boss.firstName} ${boss.lastName}` : 'your commanding officer'
    const roll = rand(g)
    if (roll < 0.35) {
      say(g, 'Report Misconduct', `You filed a grievance against ${name}. It was ignored.`, '\u{1F6A9}')
    } else if (roll < 0.65) {
      if (boss) addRelationship(boss, -20)
      say(g, 'Report Misconduct', `You filed a grievance against ${name}, who was formally reprimanded. ${boss ? `${boss.firstName} now glares at you constantly.` : ''}`, '\u{1F6A9}', 'good')
    } else if (roll < 0.85) {
      bump(job, -10)
      if (boss) addRelationship(boss, -25)
      say(g, 'Report Misconduct', `Your grievance against ${name} backfired. You were assigned extra duties for "wasting command's time".`, '\u{1F6A9}', 'bad')
    } else {
      say(g, 'Report Misconduct', `Your grievance was upheld, and ${name} received a dishonorable discharge.`, '\u{1F6A9}', 'good')
      if (boss) g.people = g.people.filter((p) => p.id !== boss.id)
      job.bossId = undefined
      const company = job.company
      const md = data(job)
      const replacement = addColleague(g, company, md.track === 'officer' ? 'General' : 'Sergeant Major', { ageOffset: [5, 20], relationship: 45 })
      replacement.relation = 'boss'
      job.bossId = replacement.id
    }
  },
}

const retireAction: MenuAction = {
  type: 'action',
  id: 'mil.retire',
  label: 'Retire',
  emoji: '\u{1F3D6}\u{FE0F}',
  subtitle: (g) => {
    const job = militaryJob(g)
    return job && job.yearsAtCompany >= 20 ? 'Retire with a military pension' : 'Requires 20 years of service for a pension'
  },
  disabledReason: (g) => blocked(g, 0),
  confirm: (g) => {
    const job = militaryJob(g)
    return job && job.yearsAtCompany < 20 ? `You've only served ${job.yearsAtCompany} years, so you won't get a pension. Retire anyway?` : 'Retire from the military?'
  },
  run: (g) => {
    const job = militaryJob(g)
    if (!job) return
    retireFromService(g, job, false)
  },
}

const medalsInfo: MenuGroup = {
    type: 'menu',
    id: 'mil.medals',
    label: 'Service Record',
    emoji: '\u{1F396}\u{FE0F}',
    subtitle: (gg) => {
      const n = peek<MilProfile>(gg, 'military')?.medals.length ?? 0
      return `${n} medal${n === 1 ? '' : 's'}`
    },
    children: (gg): MenuNode[] => {
      const p = peek<MilProfile>(gg, 'military')
      const job = militaryJob(gg)
      const nodes: MenuNode[] = []
      if (job) {
        const md = data(job)
        nodes.push({ type: 'info', id: 'mil.rec.rank', emoji: '\u{1FA96}', text: `${job.title}, ${job.company} · ${job.yearsAtCompany} year${job.yearsAtCompany === 1 ? '' : 's'} of service · Performance ${job.performance}%` })
        nodes.push({ type: 'info', id: 'mil.rec.dep', emoji: '\u{1F30D}', text: `Deployments this enlistment: ${md.deployments} · Lifetime: ${p?.deployments ?? 0} (${p?.minefields ?? 0} completed)` })
      }
      const medals = p?.medals ?? []
      if (medals.length === 0) nodes.push({ type: 'info', id: 'mil.rec.none', text: 'No medals yet.', emoji: '\u{1F3C5}' })
      medals.forEach((m, i) => nodes.push({ type: 'info', id: `mil.rec.m${i}`, text: m, emoji: '\u{1F396}\u{FE0F}' }))
      return nodes
    },
}

/** Actions while serving (shown in the Occupation menu). */
export function militaryJobNodes(g: GameState): MenuNode[] {
  const job = militaryJob(g)
  if (!job) return []
  const md = data(job)
  const nodes: MenuNode[] = [
    { type: 'info', id: 'mil.status', emoji: branchOf(md.branch).emoji, text: `${job.title} · ${job.company} · ${money(job.salary)}/yr${md.conscript ? ` · ${md.serviceLeft} year${md.serviceLeft === 1 ? '' : 's'} of service left` : ''}` },
    workHarder,
    medalsInfo,
    reportMisconduct,
    requestDischarge,
    desert,
  ]
  if (!md.conscript) nodes.push(retireAction)
  return nodes
}
