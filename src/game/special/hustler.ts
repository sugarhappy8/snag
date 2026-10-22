// Special career: Street Hustler. Scam tourists (Three Card Monte, shell games, counterfeit
// merchandise), busk with an instrument you've learned, perform (fire eating, miming, sword
// swallowing...), or beg with a prop. Find the best street, tune your act, deal with rivals,
// gangs and cops. Cash only: no salary, no pension, no dignity.
import { addHidden, addMoney, addStat, count, log, remember, scriptChoice, spend, useYearAction } from '../core'
import { arrestPlayer } from '../crime'
import { chance, pick, rand, randInt, shuffle } from '../rng'
import { pickLine } from '../text/pick'
import { defineScript } from '../scripts'
import { localeOf } from '../data/locales'
import { hasMainCharacter, hasTalent } from '../talents'
import type { ChoiceOption, GameState, Job, Json, MenuAction, MenuGroup, MenuNode } from '../types'
import { ageCeiling, liftSkill } from '../mastery'
import { addFame, blocked, claimYearly, clamp100, hire, instrumentSkill, knownInstruments, leave, masterInstrument, money, myJob, peek, prof, quitNote, say, syncTenure, tell, view, yearlyList } from './common'
import { payScale } from './pay-scale'

// ---------------------------------------------------------------------------
// Acts

type Kind = 'scam' | 'busk' | 'perform' | 'beg'

interface Act {
  id: string
  kind: Kind
  label: string
  emoji: string
  min: number
  max: number
  /** Chance of hurting yourself per session at 0 skill. */
  injury: number
  minAge: number
}

const ACTS: Act[] = [
  { id: 'monte', kind: 'scam', label: 'Three Card Monte', emoji: '\u{1F0CF}', min: 80, max: 900, injury: 0, minAge: 18 },
  { id: 'shell', kind: 'scam', label: 'Shell Game', emoji: '\u{1F95C}', min: 60, max: 700, injury: 0, minAge: 18 },
  { id: 'counterfeit', kind: 'scam', label: 'Counterfeit Merchandise', emoji: '\u{1F45C}', min: 120, max: 1_200, injury: 0, minAge: 18 },
  { id: 'busk', kind: 'busk', label: 'Busking', emoji: '\u{1F3B6}', min: 20, max: 450, injury: 0, minAge: 16 },
  { id: 'fire', kind: 'perform', label: 'Fire Eater', emoji: '\u{1F525}', min: 60, max: 650, injury: 0.08, minAge: 18 },
  { id: 'mime', kind: 'perform', label: 'Mime', emoji: '\u{1F910}', min: 15, max: 280, injury: 0, minAge: 16 },
  { id: 'sword', kind: 'perform', label: 'Sword Swallower', emoji: '\u{1F5E1}\u{FE0F}', min: 80, max: 800, injury: 0.1, minAge: 18 },
  { id: 'statue', kind: 'perform', label: 'Living Statue', emoji: '\u{1F5FF}', min: 25, max: 320, injury: 0, minAge: 16 },
  { id: 'breakdance', kind: 'perform', label: 'Breakdancer', emoji: '\u{1F57A}', min: 30, max: 420, injury: 0.04, minAge: 16 },
  { id: 'beg', kind: 'beg', label: 'Panhandling', emoji: '\u{1F932}', min: 5, max: 140, injury: 0, minAge: 16 },
]

function actOf(id: string): Act {
  return ACTS.find((a) => a.id === id) ?? ACTS[ACTS.length - 1]
}

const TITLES: Record<Kind, string> = { scam: 'Scam Artist', busk: 'Busker', perform: 'Street Performer', beg: 'Panhandler' }

interface Prop {
  id: string
  label: string
  emoji: string
  mult: number
  karma: number
}

const PROPS: Prop[] = [
  { id: 'sign', label: 'Cardboard sign: "Anything helps"', emoji: '\u{1FAA7}', mult: 1, karma: 0 },
  { id: 'cup', label: 'Paper coffee cup', emoji: '\u{2615}', mult: 0.9, karma: 0 },
  { id: 'dog', label: 'Borrowed puppy', emoji: '\u{1F415}', mult: 1.6, karma: -1 },
  { id: 'funny', label: 'Sign: "Need money for a time machine"', emoji: '\u{1F570}\u{FE0F}', mult: 1.3, karma: 0 },
  { id: 'crutches', label: 'Fake crutches', emoji: '\u{1FA7C}', mult: 1.5, karma: -4 },
  { id: 'clown', label: 'Sad clown costume', emoji: '\u{1F921}', mult: 1.2, karma: 0 },
]

function propOf(id: string): Prop {
  return PROPS.find((p) => p.id === id) ?? PROPS[0]
}

// ---------------------------------------------------------------------------
// Streets

interface Street {
  name: string
  /** Foot traffic 1-5. */
  traffic: number
  /** Police presence 1-5. */
  police: number
  /** Competing hustlers 1-5. */
  rivals: number
}

const STREET_NAMES = [
  'Market Square',
  'the Harbor Boardwalk',
  'Broadway',
  'the Central Subway Station',
  'Tourist Plaza',
  'Old Town Alley',
  'the Financial District',
  'Union Train Station',
  'the Beachfront Promenade',
  'Chinatown Gate',
  'the Stadium Parking Lot',
  'the University Quad',
  'Riverside Park',
  'the Night Market',
]

function stars(n: number): string {
  return '\u{2B50}'.repeat(Math.max(1, Math.min(5, n)))
}

/** Generic spots everywhere, plus local hangouts and landmarks instead of Broadway and Chinatown abroad. */
function streetSpots(g: GameState): string[] {
  if (g.character.countryId === 'us') return STREET_NAMES
  const loc = localeOf(g.character.countryId)
  const generic = STREET_NAMES.filter((s) => s !== 'Broadway' && s !== 'Chinatown Gate' && s !== 'the Stadium Parking Lot')
  return [...new Set([...generic, ...loc.hangouts.slice(0, 4), ...loc.landmarks.slice(0, 2)])]
}

function genStreets(g: GameState): Street[] {
  return shuffle(g, streetSpots(g))
    .slice(0, 4)
    .map((name) => ({ name, traffic: randInt(g, 1, 5), police: randInt(g, 1, 5), rivals: randInt(g, 1, 5) }))
}

// ---------------------------------------------------------------------------
// State

interface HustleData {
  act: string
  prop: string
  instrument: string
  street: string
  traffic: number
  police: number
  rivals: number
  earnedYear: number
  sessionsYear: number
}

interface HustleProfile {
  skills: Record<string, number>
  totalEarned: number
  sessions: number
  arrests: number
  bestDay: number
}

const initHustle = (): HustleProfile => ({ skills: {}, totalEarned: 0, sessions: 0, arrests: 0, bestDay: 0 })

function hustleProfile(g: GameState): HustleProfile {
  return prof(g, 'hustler', initHustle)
}

function viewHustle(g: GameState): HustleProfile {
  return peek<HustleProfile>(g, 'hustler') ?? initHustle()
}

export function hustlerJob(g: GameState): Job | null {
  return myJob(g, 'hustler')
}

function hdata(job: Job): HustleData {
  return view<HustleData>(job.data)
}

/** Skill at the current act (busking uses your instrument skill). */
function actSkill(g: GameState, d: Pick<HustleData, 'act' | 'instrument'>): number {
  if (d.act === 'busk') return d.instrument === 'Bucket Drums' ? clamp100(viewHustle(g).skills.bucket ?? 10) : instrumentSkill(g, d.instrument)
  return clamp100(viewHustle(g).skills[d.act] ?? 0)
}

/**
 * Main Character Syndrome: the first time you work an act it is already mastery (to the age ceiling);
 * busking masters the instrument you play. The crowd, the cops and the rivals are still real.
 */
function masterAct(g: GameState, d: Pick<HustleData, 'act' | 'instrument'>): void {
  if (!hasMainCharacter(g)) return
  const act = actOf(d.act)
  if (act.kind === 'busk' && d.instrument !== 'Bucket Drums') {
    masterInstrument(g, d.instrument)
    return
  }
  const key = d.act === 'busk' ? 'bucket' : d.act
  const p = hustleProfile(g)
  const top = ageCeiling(g.character.age, { from: 8, full: 17, floor: 40 })
  p.skills[key] = liftSkill(g, `hustle.${key}`, act.kind === 'scam' ? 'crime' : 'stage', act.kind === 'scam' ? act.label.toLowerCase() : key === 'bucket' ? 'bucket drumming' : act.label.toLowerCase(), p.skills[key] ?? (key === 'bucket' ? 10 : 0), top)
}

function raiseSkill(g: GameState, d: Pick<HustleData, 'act' | 'instrument'>, by: number): void {
  const p = hustleProfile(g)
  const key = d.act === 'busk' ? (d.instrument === 'Bucket Drums' ? 'bucket' : '') : d.act
  if (!key) return // instrument skill is trained through lessons
  p.skills[key] = clamp100((p.skills[key] ?? (key === 'bucket' ? 10 : 0)) + by)
}

/**
 * Special talents on the street: a musician busks better, a comedian or actor works a crowd,
 * an athlete breakdances and a natural con artist runs a smoother game (0-12 skill points).
 */
function streetTalent(g: GameState, act: Act): number {
  if (act.kind === 'busk') return hasTalent(g, 'Music') ? 12 : 0
  if (act.kind === 'scam') return hasTalent(g, 'Crime') ? 12 : 0
  if (act.id === 'breakdance') return hasTalent(g, 'Athletics') ? 12 : 0
  if (act.kind === 'perform') return hasTalent(g, 'Comedy') || hasTalent(g, 'Acting') ? 10 : 0
  return hasTalent(g, 'Acting') ? 6 : 0
}

function actLabel(d: Pick<HustleData, 'act' | 'instrument' | 'prop'>): string {
  const a = actOf(d.act)
  if (a.kind === 'busk') return `Busking (${d.instrument})`
  if (a.kind === 'beg') return `Panhandling (${propOf(d.prop).label.split(':')[0].toLowerCase()})`
  return a.label
}

// ---------------------------------------------------------------------------
// Starting out

const START_SCRIPT = 'special.hustle.start'
const INSTRUMENT_SCRIPT = 'special.hustle.instrument'
const PROP_SCRIPT = 'special.hustle.prop'

function instrumentChoices(g: GameState): ChoiceOption[] {
  const list = knownInstruments(g)
    .map((i) => ({ id: i, label: `${i} (${instrumentSkill(g, i)}%)`, emoji: i === 'Voice' ? '\u{1F3A4}' : '\u{1F3B5}' }))
    .slice(0, 7)
  list.push({ id: 'Bucket Drums', label: 'Bucket Drums (no lessons needed)', emoji: '\u{1FAA3}' })
  return list
}

function propChoices(): ChoiceOption[] {
  return PROPS.map((p) => ({ id: p.id, label: p.label, emoji: p.emoji }))
}

function startHustle(g: GameState, act: Act, instrument: string, prop: string): void {
  const c = g.character
  const current = hustlerJob(g)
  if (current) {
    const d = hdata(current)
    d.act = act.id
    d.instrument = instrument
    d.prop = prop
    current.title = TITLES[act.kind]
    current.performance = actSkill(g, d)
    log(g, `I switched my hustle to ${actLabel(d).toLowerCase()}.`)
    return say(g, 'New Act', `You switched your act to ${actLabel(d).toLowerCase()} on ${current.company}. ${pickLine(g, ['Same street, new hustle.', 'The regulars did a double take.', 'Reinvention is the hustler’s way.'])}`, act.emoji)
  }
  const street = pick(g, genStreets(g))
  const data: HustleData = { act: act.id, prop, instrument, street: street.name, traffic: street.traffic, police: street.police, rivals: street.rivals, earnedYear: 0, sessionsYear: 0 }
  const { job, quit } = hire(g, { defId: 'hustler', title: TITLES[act.kind], company: street.name, salary: 0, performance: 0, data: data as unknown as Record<string, Json> })
  job.performance = actSkill(g, data)
  hustleProfile(g)
  count(g, 'hustlers')
  log(g, `I became a street hustler: ${actLabel(data).toLowerCase()} on ${street.name}.`, 'event')
  remember(g, `Became a street hustler (${actLabel(data).toLowerCase()}).`)
  const intro: Record<Kind, string> = {
    scam: 'You set up a folding table and practiced your most trustworthy smile.',
    busk: 'You opened your case on the sidewalk and tossed in a few coins of your own to prime the pump.',
    perform: 'You found a patch of sidewalk with good lighting and a captive audience.',
    beg: 'You found a spot by the curb and settled in.',
  }
  say(g, 'Street Hustler', `${intro[act.kind]} You're now a ${TITLES[act.kind].toLowerCase()} working ${street.name}.${quitNote(quit)} ${c.age < 20 ? 'Your parents are thrilled. (They are not.)' : ''}`.trim(), act.emoji)
}

defineScript(START_SCRIPT, (g, choice) => {
  if (choice === 'cancel') return
  const act = ACTS.find((a) => a.id === choice)
  if (!act) return
  if (g.character.age < act.minAge) return tell(g, act.label, `You must be at least ${act.minAge} to do that.`, act.emoji)
  if (act.kind === 'busk') {
    return scriptChoice(g, INSTRUMENT_SCRIPT, 'Busking', 'What will you play on the street?', instrumentChoices(g), { emoji: '\u{1F3B6}' })
  }
  if (act.kind === 'beg') {
    return scriptChoice(g, PROP_SCRIPT, 'Panhandling', 'Every panhandler needs a gimmick. What prop will you use?', propChoices(), { emoji: '\u{1F932}' })
  }
  const j = hustlerJob(g)
  startHustle(g, act, j ? hdata(j).instrument : 'Bucket Drums', j ? hdata(j).prop : 'sign')
})

defineScript(INSTRUMENT_SCRIPT, (g, choice) => {
  const j = hustlerJob(g)
  startHustle(g, actOf('busk'), choice || 'Bucket Drums', j ? hdata(j).prop : 'sign')
})

defineScript(PROP_SCRIPT, (g, choice) => {
  const j = hustlerJob(g)
  startHustle(g, actOf('beg'), j ? hdata(j).instrument : 'Bucket Drums', propOf(choice).id)
})

function actChoices(g: GameState): ChoiceOption[] {
  return [
    ...ACTS.filter((a) => g.character.age >= a.minAge).map((a) => ({ id: a.id, label: `${a.label}${a.kind !== 'busk' && a.kind !== 'beg' ? ` (skill ${clamp100(viewHustle(g).skills[a.id] ?? 0)}%)` : ''}`, emoji: a.emoji })),
    { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' },
  ]
}

function startAction(kind: Kind, label: string, emoji: string, subtitle: string, minAge: number): MenuAction {
  return {
    type: 'action',
    id: `hustle.start.${kind}`,
    label,
    emoji,
    subtitle,
    disabledReason: (g) => blocked(g, minAge),
    confirm: (g) => (g.character.job ? `You'll quit your job as ${g.character.job.title} to hit the streets. Continue?` : null),
    run: (g) => {
      const acts = ACTS.filter((a) => a.kind === kind && g.character.age >= a.minAge)
      if (kind === 'busk') return scriptChoice(g, INSTRUMENT_SCRIPT, 'Busking', 'What will you play on the street?', instrumentChoices(g), { emoji: '\u{1F3B6}' })
      if (kind === 'beg') return scriptChoice(g, PROP_SCRIPT, 'Panhandling', 'Every panhandler needs a gimmick. What prop will you use?', propChoices(), { emoji: '\u{1F932}' })
      scriptChoice(
        g,
        START_SCRIPT,
        label,
        kind === 'scam' ? 'Which scam will you run?' : 'What kind of act will you perform?',
        [...acts.map((a) => ({ id: a.id, label: a.label, emoji: a.emoji })), { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' }],
        { emoji },
      )
    },
  }
}

// ---------------------------------------------------------------------------
// Working the street

const SCAM_WIN = [
  'A tourist in a fanny pack was sure they could find the queen. They could not.',
  'A group of bachelor party guys lost round after round and thanked you for the "life lesson".',
  'You let one guy win early. He came back with all his friends.',
  'A businessman on his lunch break swore he saw the pea move. He was right, but he still lost.',
]
const FAKE_BRANDS = ['Guccy', 'Prado', 'Louie Vuitton', 'Channel', 'Rolecks', 'Addidas', 'Bulberry', 'Versayce']
const BUSK_WIN = [
  'A crowd gathered and someone filmed you for their story.',
  'A little kid danced to your music the whole time. Their parents tipped generously.',
  'A man in a suit dropped a big bill in your case without breaking stride.',
  'You played the same four songs on loop. Commuters did not notice.',
]
const PERFORM_WIN: Record<string, string[]> = {
  fire: ['You breathed a ten-foot fireball and the crowd gasped.', 'You extinguished a torch on your tongue and a tourist fainted. Then tipped.'],
  mime: ['You were trapped in an invisible box for an hour. People paid to watch you escape.', 'You mimed walking against the wind so well a pigeon got confused.'],
  sword: ['You swallowed a sword to the hilt. A man in the crowd swallowed his gum in shock.', 'You swallowed two swords at once. The applause was nervous but sincere.'],
  statue: ['You stood perfectly still for four hours. A kid poked you and you winked. They screamed and their dad tipped.', 'Pigeons mistook you for a real statue. Tourists loved it.'],
  breakdance: ['You landed a windmill into a headspin and the crowd went wild.', 'Your crew battled another crew. You won by a backflip.'],
}
const BEG_WIN_LOCAL = [
  'A kind old lady gave you a sandwich and a little cash.',
  'Most people avoided eye contact, but a few dropped coins.',
  'A street vendor gave you a plate of leftovers and some change.',
  'A student gave you the last coins in their pocket and a motivational speech.',
]
const BEG_WIN = [
  'A kind old lady gave you a sandwich and a little cash.',
  'Most people avoided eye contact, but a few dropped coins.',
  'A guy gave you his leftover pizza and five bucks.',
  'A college student gave you their last dollar and a motivational speech.',
]

function streetEncounter(g: GameState): void {
  const job = hustlerJob(g)
  if (!job) return
  const d = hdata(job)
  const kind = actOf(d.act).kind
  const roll = rand(g)
  if (roll < 0.3) {
    scriptChoice(
      g,
      ENCOUNTER_SCRIPT,
      'Turf War',
      `A rival ${TITLES[kind].toLowerCase()} set up right next to you on ${d.street} and is stealing your crowd.`,
      [
        { id: 'rival.fight', label: 'Fight them for the spot', emoji: '\u{1F44A}' },
        { id: 'rival.share', label: 'Share the street', emoji: '\u{1F91D}' },
        { id: 'rival.leave', label: 'Find another street', emoji: '\u{1F6B6}' },
      ],
      { emoji: '\u{1F620}' },
    )
  } else if (roll < 0.55) {
    scriptChoice(
      g,
      ENCOUNTER_SCRIPT,
      'Cop on the Beat',
      kind === 'scam' ? 'A police officer is eyeing your card table suspiciously and walking your way.' : 'A police officer asks to see your street performance permit. You don’t have one.',
      [
        { id: 'cop.pay', label: 'Pay the fine', emoji: '\u{1F4B5}' },
        { id: 'cop.talk', label: 'Talk your way out of it', emoji: '\u{1F5E3}\u{FE0F}' },
        { id: 'cop.run', label: 'Grab your stuff and run', emoji: '\u{1F3C3}' },
      ],
      { emoji: '\u{1F46E}' },
    )
  } else if (roll < 0.75) {
    scriptChoice(
      g,
      ENCOUNTER_SCRIPT,
      'Street Gang',
      `Some members of a local street gang say ${d.street} is their territory. They want a cut of everything you make.`,
      [
        { id: 'gang.pay', label: 'Pay them a cut', emoji: '\u{1F4B8}' },
        { id: 'gang.refuse', label: 'Refuse', emoji: '\u{1F645}' },
        { id: 'gang.leave', label: 'Move to another street', emoji: '\u{1F6B6}' },
      ],
      { emoji: '\u{1F574}\u{FE0F}' },
    )
  } else {
    scriptChoice(
      g,
      ENCOUNTER_SCRIPT,
      'Tourist',
      'A tourist with a giant camera wants a photo with you.',
      [
        { id: 'tourist.charge', label: 'Charge them for it', emoji: '\u{1F4B0}' },
        { id: 'tourist.free', label: 'Pose for free', emoji: '\u{1F4F8}' },
        { id: 'tourist.ignore', label: 'Ignore them', emoji: '\u{1F644}' },
      ],
      { emoji: '\u{1F4F7}' },
    )
  }
}

const ENCOUNTER_SCRIPT = 'special.hustle.encounter'

function moveStreet(g: GameState, job: Job): string {
  const s = pick(g, genStreets(g).filter((x) => x.name !== job.company))
  const d = hdata(job)
  job.company = s.name
  d.street = s.name
  d.traffic = s.traffic
  d.police = s.police
  d.rivals = s.rivals
  return s.name
}

defineScript(ENCOUNTER_SCRIPT, (g, choice) => {
  const job = hustlerJob(g)
  if (!job) return
  const d = hdata(job)
  const c = g.character
  const kind = actOf(d.act).kind
  switch (choice) {
    case 'rival.fight': {
      if (chance(g, 0.3 + c.hidden.athleticism / 200)) {
        d.rivals = Math.max(1, d.rivals - 1)
        count(g, 'fights')
        log(g, 'I fought off a rival hustler.', 'good')
        return say(g, 'Turf War', pickLine(g, ['You chased them off with a folding chair. The street is yours.', 'One shove and they packed up. Respect earned.']), '\u{1F44A}', 'good')
      }
      addStat(g, 'health', -randInt(g, 4, 12))
      addStat(g, 'happiness', -5)
      count(g, 'fights')
      log(g, 'A rival hustler beat me up.', 'bad')
      return say(g, 'Turf War', pickLine(g, ['They hit you with a tambourine. Repeatedly.', 'You lost the fight and your dignity. They kept the spot.']), '\u{1F915}', 'bad')
    }
    case 'rival.share':
      addHidden(g, 'karma', 3)
      return say(g, 'Turf War', 'You agreed to split the block. You even started covering each other on bathroom breaks.', '\u{1F91D}')
    case 'rival.leave':
    case 'gang.leave': {
      const name = moveStreet(g, job)
      log(g, `I moved my hustle to ${name}.`)
      return say(g, 'New Street', `You packed up and moved your hustle to ${name}.`, '\u{1F6B6}')
    }
    case 'cop.pay': {
      const fine = randInt(g, 1, 4) * 75
      if (!spend(g, fine, 'fine')) {
        addHidden(g, 'notoriety', 1)
        return say(g, 'Busted', `The fine was ${money(fine)} and you couldn't pay. The officer confiscated your gear instead and told you to get lost.`, '\u{1F46E}', 'bad')
      }
      log(g, `I paid a ${money(fine)} fine for hustling without a permit.`, 'bad')
      return say(g, 'Fined', `You paid a ${money(fine)} fine. The officer walked off with a smug look.`, '\u{1F4B5}')
    }
    case 'cop.talk': {
      if (chance(g, 0.25 + c.stats.smarts / 200 + c.stats.looks / 400)) return say(g, 'Smooth Talker', pickLine(g, ['You convinced the officer you were filming a documentary. They wished you luck.', 'You complimented the officer’s mustache. They let you off with a warning.']), '\u{1F60E}', 'good')
      if (kind === 'scam') {
        hustleProfile(g).arrests += 1
        log(g, 'I was arrested for running a street scam.', 'bad')
        say(g, 'Busted', 'Your story fell apart when the officer found a marked deck up your sleeve.', '\u{1F6A8}', 'bad')
        return arrestPlayer(g, 'Fraud', 1, { evidence: 0.7 })
      }
      const fine = randInt(g, 1, 3) * 50
      const paid = spend(g, fine, 'fine')
      return say(g, 'Fined', paid ? `The officer didn't buy it and wrote you a ${money(fine)} ticket.` : "The officer didn't buy it and confiscated your gear.", '\u{1F46E}', 'bad')
    }
    case 'cop.run': {
      if (chance(g, 0.35 + c.hidden.athleticism / 160)) {
        log(g, 'I outran a cop.', 'good')
        return say(g, 'Escaped', pickLine(g, ['You vaulted a hot dog cart and vanished into the crowd.', 'You ran six blocks and hid in a laundromat. Clean getaway.']), '\u{1F3C3}', 'good')
      }
      if (kind === 'scam') {
        hustleProfile(g).arrests += 1
        log(g, 'I was arrested after running from the police.', 'bad')
        say(g, 'Busted', 'You tripped over your own folding table. The officer cuffed you on the spot.', '\u{1F6A8}', 'bad')
        return arrestPlayer(g, 'Fraud', 2, { evidence: 0.8 })
      }
      addStat(g, 'health', -randInt(g, 2, 6))
      return say(g, 'Caught', 'You got tackled half a block later. The officer let you go with a lecture and a scraped knee.', '\u{1F915}', 'bad')
    }
    case 'gang.pay': {
      const cut = Math.max(20, Math.round(d.earnedYear * 0.3))
      const paid = Math.min(cut, Math.max(0, c.money))
      if (paid > 0) addMoney(g, -paid, 'crime.take')
      d.police = Math.max(1, d.police - 1)
      log(g, `I paid a street gang ${money(paid)} for protection.`, 'bad')
      return say(g, 'Protection', `You handed over ${money(paid)}. In return, the gang promised nobody would bother you. Including, apparently, the cops.`, '\u{1F4B8}')
    }
    case 'gang.refuse': {
      if (chance(g, 0.45)) {
        addStat(g, 'health', -randInt(g, 8, 18))
        addStat(g, 'happiness', -8)
        const lost = Math.min(Math.max(0, c.money), randInt(g, 20, 200))
        if (lost > 0) addMoney(g, -lost, 'crime.take')
        log(g, 'A street gang roughed me up.', 'bad')
        return say(g, 'Roughed Up', `The gang roughed you up and took ${money(lost)} from your pockets.`, '\u{1F915}', 'bad')
      }
      addHidden(g, 'willpower', 2)
      return say(g, 'Stood Your Ground', 'You refused. They sized you up, laughed, and left. Nobody knows why.', '\u{1F60E}', 'good')
    }
    case 'tourist.charge': {
      const fee = randInt(g, 5, 40)
      addMoney(g, fee, 'crime.take')
      d.earnedYear += fee
      return say(g, 'Photo Op', `You charged ${money(fee)} for the photo. They paid without blinking. Tourists!`, '\u{1F4B0}', 'good')
    }
    case 'tourist.free':
      addHidden(g, 'karma', 2)
      if (chance(g, 0.2)) addFame(g, 1)
      return say(g, 'Photo Op', 'You posed for the photo. It ended up on a travel blog with the caption "local legend".', '\u{1F4F8}', 'good')
    default:
      return say(g, 'Tourist', 'You ignored the tourist. They took the photo anyway.', '\u{1F644}')
  }
})

function workStreet(g: GameState): void {
  const job = hustlerJob(g)
  if (!job) return
  if (!useYearAction(g, 'hustle.work', 6)) return tell(g, 'Work the Street', "Your feet are killing you. You've hustled as much as you can this year.", '\u{1F971}')
  const d = hdata(job)
  masterAct(g, d)
  const act = actOf(d.act)
  const skill = clamp100(actSkill(g, d) + streetTalent(g, act))
  const p = hustleProfile(g)
  d.sessionsYear += 1
  p.sessions += 1
  count(g, 'hustles')

  // Scams: busted or a furious mark.
  if (act.kind === 'scam') {
    const busted = (0.02 + d.police * 0.025 - skill / 2500) * (hasTalent(g, 'Crime') ? 0.7 : 1)
    if (chance(g, Math.max(0.01, busted))) {
      p.arrests += 1
      log(g, `I was arrested for running ${act.label.toLowerCase()} on ${d.street}.`, 'bad')
      say(g, 'Busted', `${pickLine(g, ['An undercover cop played three rounds before flashing a badge.', 'A sore loser flagged down a patrol car.', 'The police were watching from across the street the whole time.'])}`, '\u{1F6A8}', 'bad')
      arrestPlayer(g, 'Fraud', act.id === 'counterfeit' ? 2 : 1, { evidence: 0.75 })
      return
    }
    if (chance(g, 0.07)) {
      addStat(g, 'health', -randInt(g, 3, 10))
      log(g, 'A mark realized I scammed him and punched me.', 'bad')
      return say(g, 'Sore Loser', pickLine(g, ['A mark figured out the trick and flipped your table. Then he flipped you.', 'A grandma caught you palming the pea and hit you with her purse. Hard.']), '\u{1F915}', 'bad')
    }
  }
  // Dangerous acts.
  if (act.injury > 0 && chance(g, act.injury * (1.2 - skill / 100))) {
    addStat(g, 'health', -randInt(g, 6, 16))
    addStat(g, 'happiness', -6)
    log(g, act.id === 'fire' ? 'I burned myself fire eating.' : act.id === 'sword' ? 'I hurt myself swallowing a sword.' : 'I hurt myself performing on the street.', 'bad')
    return say(
      g,
      'Ouch!',
      act.id === 'fire' ? 'You inhaled when you should have exhaled. Your eyebrows are gone and your mouth is a war zone.' : act.id === 'sword' ? 'The sword went down the wrong way. You spent the afternoon in the ER explaining your career.' : 'You landed a headspin directly on a bottle cap. The crowd winced.',
      '\u{1F915}',
      'bad',
    )
  }
  // Panhandlers get moved along.
  if (act.kind === 'beg' && chance(g, d.police * 0.04)) {
    log(g, 'The police made me move along.', 'bad')
    return say(g, 'Move Along', 'A police officer told you to move along before you made a cent.', '\u{1F46E}')
  }

  const prop = propOf(d.prop)
  const mult = act.kind === 'beg' ? prop.mult : 1
  if (act.kind === 'beg' && prop.karma) addHidden(g, 'karma', prop.karma)
  const base = act.min + rand(g) * (act.max - act.min)
  let take = Math.round(base * (0.4 + d.traffic * 0.2) * (0.35 + skill / 100) * (1 - (d.rivals - 1) * 0.07) * mult)
  let bonusText = ''
  if (act.kind === 'beg' && chance(g, 0.05)) {
    const gift = randInt(g, 100, 500)
    take += gift
    bonusText = ` A stranger in a fancy coat handed you ${money(Math.round(gift * payScale(g)))} and said "pay it forward".`
  }
  if ((act.kind === 'busk' || act.kind === 'perform') && skill >= 70 && chance(g, 0.04)) {
    addFame(g, 3)
    bonusText = ' A video of your act went viral online. People are calling you a street legend.'
  }
  // The acts are priced in US 2020s dollars. Scale the take to the era and the country.
  take = Math.max(0, Math.round(take * payScale(g)))
  addMoney(g, take, 'crime.take')
  d.earnedYear += take
  p.totalEarned += take
  if (take > p.bestDay) p.bestDay = take
  raiseSkill(g, d, randInt(g, 1, 3))
  job.performance = actSkill(g, d)
  if (act.kind === 'beg') addStat(g, 'happiness', -1)
  else addStat(g, 'happiness', randInt(g, 0, 2))

  let line: string
  if (act.kind === 'scam') line = act.id === 'counterfeit' ? `You sold a pile of "${pickLine(g, FAKE_BRANDS)}" handbags to tourists who swore they were real.` : pickLine(g, SCAM_WIN)
  else if (act.kind === 'busk') line = d.instrument === 'Bucket Drums' ? pickLine(g, ['You banged on upside-down buckets like a rock god.', 'Your bucket drum solo stopped traffic. Literally, a driver stopped to watch.']) : `You played ${d.instrument === 'Voice' ? 'your heart out' : `the ${d.instrument.toLowerCase()}`} on ${d.street}. ${pickLine(g, BUSK_WIN)}`
  else if (act.kind === 'perform') line = pick(g, PERFORM_WIN[act.id] ?? PERFORM_WIN.mime)
  else line = pick(g, g.character.countryId === 'us' ? BEG_WIN : BEG_WIN_LOCAL)
  const verdict = take < 20 ? 'You barely made enough for a bus ticket.' : take < 150 ? `You made ${money(take)}.` : `You raked in ${money(take)}!`
  log(g, `I hustled on ${d.street} and made ${money(take)}.`, take >= 100 ? 'good' : 'neutral')
  say(g, actLabel(d), `${line} ${take < 20 ? `You made ${money(take)}. ${verdict}` : verdict}${bonusText}`, act.emoji, take >= 100 ? 'good' : 'neutral')
  if (chance(g, 0.12)) streetEncounter(g)
}

const workAction: MenuAction = {
  type: 'action',
  id: 'hustle.work',
  label: 'Work the Street',
  emoji: '\u{1F4B5}',
  subtitle: (g) => {
    const job = hustlerJob(g)
    return job ? `${actLabel(hdata(job))} on ${job.company}` : ''
  },
  disabledReason: (g) => blocked(g, 0),
  run: workStreet,
}

const practiceAction: MenuAction = {
  type: 'action',
  id: 'hustle.practice',
  label: 'Practice',
  emoji: '\u{1F3AF}',
  subtitle: (g) => {
    const job = hustlerJob(g)
    return job ? `Skill: ${actSkill(g, hdata(job))}%` : ''
  },
  disabledReason: (g) => blocked(g, 0),
  run: (g) => {
    const job = hustlerJob(g)
    if (!job) return
    const d = hdata(job)
    const act = actOf(d.act)
    if (act.kind === 'busk' && d.instrument !== 'Bucket Drums') {
      return tell(g, 'Practice', `You get better at the ${d.instrument === 'Voice' ? 'singing' : d.instrument.toLowerCase()} by taking lessons under Activities → Mind & Body.`, '\u{1F3B5}')
    }
    if (!useYearAction(g, 'hustle.practice', 2)) return tell(g, 'Practice', "You've practiced enough this year. Time to perform for real.", '\u{1F971}')
    masterAct(g, d)
    const gain = randInt(g, 4, 9)
    raiseSkill(g, d, gain)
    job.performance = actSkill(g, d)
    const lines: Record<string, string[]> = {
      scam: ['You practiced your shuffle in the mirror until your hands blurred.', 'You perfected your patter: "Keep your eye on the queen, folks!"'],
      busk: ['You drummed on buckets in the park until the neighbors called the cops.'],
      perform: ['You rehearsed your act in the park and only scared one jogger.', 'You trained for hours. Your act is getting tighter.'],
      beg: ['You practiced your saddest face in the mirror. Even you felt bad for you.', 'You workshopped your sign’s wording. Comedy is hard.'],
    }
    log(g, `I practiced my ${actLabel(d).toLowerCase()}.`)
    say(g, 'Practice', `${pick(g, lines[act.kind] ?? lines.perform)} Skill: ${actSkill(g, d)}% (+${gain}).`, act.emoji, 'good')
  },
}

const STREET_SCRIPT = 'special.hustle.street'

defineScript(STREET_SCRIPT, (g, choice) => {
  const job = hustlerJob(g)
  if (!job || choice === 'cancel') return
  const streets = yearlyList<Street>(g, 'hustle.streets', () => genStreets(g))
  const s = streets[Number(choice)]
  if (!s) return
  if (!useYearAction(g, 'hustle.move', 2)) return tell(g, 'Find a Street', "You've moved enough this year. Your regulars can't keep up.", '\u{1F6B6}')
  const d = hdata(job)
  job.company = s.name
  d.street = s.name
  d.traffic = s.traffic
  d.police = s.police
  d.rivals = s.rivals
  log(g, `I moved my hustle to ${s.name}.`)
  say(g, 'New Street', `You set up shop on ${s.name}. ${s.traffic >= 4 ? 'The crowds are huge.' : s.traffic <= 2 ? 'It’s a little quiet.' : 'Decent foot traffic.'} ${s.police >= 4 ? 'Lots of cops around, though.' : ''}`.trim(), '\u{1F5FA}\u{FE0F}')
})

const streetAction: MenuAction = {
  type: 'action',
  id: 'hustle.street',
  label: 'Find a New Street',
  emoji: '\u{1F5FA}\u{FE0F}',
  subtitle: (g) => {
    const job = hustlerJob(g)
    if (!job) return ''
    const d = hdata(job)
    return `Now: ${job.company} · Crowds ${d.traffic}/5 · Cops ${d.police}/5 · Rivals ${d.rivals}/5`
  },
  disabledReason: (g) => blocked(g, 0),
  run: (g) => {
    const streets = yearlyList<Street>(g, 'hustle.streets', () => genStreets(g))
    scriptChoice(
      g,
      STREET_SCRIPT,
      'Find a Street',
      'You scouted the city for a better spot. Where do you want to work?',
      [...streets.map((s, i) => ({ id: String(i), label: `${s.name} · Crowds ${stars(s.traffic)} · Cops ${s.police}/5 · Rivals ${s.rivals}/5`, emoji: '\u{1F4CD}' })), { id: 'cancel', label: 'Stay put', emoji: '\u{274C}' }],
      { emoji: '\u{1F5FA}\u{FE0F}' },
    )
  },
}

const changeActAction: MenuAction = {
  type: 'action',
  id: 'hustle.change',
  label: 'Change Your Act',
  emoji: '\u{1F504}',
  subtitle: 'Try a different hustle',
  disabledReason: (g) => blocked(g, 0),
  run: (g) => scriptChoice(g, START_SCRIPT, 'Change Your Act', 'What hustle do you want to try now?', actChoices(g), { emoji: '\u{1F504}' }),
}

const streetLifeAction: MenuAction = {
  type: 'action',
  id: 'hustle.life',
  label: 'Street Life',
  emoji: '\u{1F3D9}\u{FE0F}',
  subtitle: 'See what happens on the block',
  disabledReason: (g) => blocked(g, 0),
  run: (g) => {
    if (!hustlerJob(g)) return
    if (!useYearAction(g, 'hustle.life', 2)) return tell(g, 'Street Life', 'The block is quiet. Nothing else is happening this year.', '\u{1F3D9}\u{FE0F}')
    streetEncounter(g)
  },
}

function recordMenu(): MenuGroup {
  return {
    type: 'menu',
    id: 'hustle.record',
    label: 'Hustle Stats',
    emoji: '\u{1F4CA}',
    subtitle: (g) => `${money(viewHustle(g).totalEarned)} earned on the streets`,
    children: (g): MenuNode[] => {
      const p = viewHustle(g)
      const nodes: MenuNode[] = [
        { type: 'info', id: 'hustle.rec.total', emoji: '\u{1F4B5}', text: `Total earned: ${money(p.totalEarned)} · Best day: ${money(p.bestDay)}` },
        { type: 'info', id: 'hustle.rec.sessions', emoji: '\u{1F4C5}', text: `Days hustled: ${p.sessions} · Arrests: ${p.arrests}` },
      ]
      const skills = ACTS.filter((a) => a.kind !== 'busk' && a.kind !== 'beg' && (p.skills[a.id] ?? 0) > 0)
      for (const a of skills) nodes.push({ type: 'info', id: `hustle.rec.${a.id}`, emoji: a.emoji, text: `${a.label}: ${clamp100(p.skills[a.id] ?? 0)}%` })
      return nodes
    },
  }
}

const quitAction: MenuAction = {
  type: 'action',
  id: 'hustle.quit',
  label: 'Quit Hustling',
  emoji: '\u{1F6AA}',
  subtitle: 'Get off the streets',
  confirm: () => 'Give up the street hustle?',
  run: (g) => {
    const job = hustlerJob(g)
    if (!job) return
    leave(g, 'quit')
    log(g, 'I quit hustling on the streets.')
    say(g, 'Retired Hustler', pickLine(g, ['You packed up your gear for the last time. The street will miss you. Probably.', 'You hung up your hustle. The pigeons on your corner look lost without you.']), '\u{1F6AA}')
  },
}

export function hustlerJobNodes(g: GameState): MenuNode[] {
  const job = hustlerJob(g)
  if (!job) return []
  const d = hdata(job)
  return [
    { type: 'info', id: 'hustle.status', emoji: actOf(d.act).emoji, text: `${job.title}: ${actLabel(d)} on ${job.company} · Skill ${actSkill(g, d)}% · ${money(d.earnedYear)} this year` },
    workAction,
    practiceAction,
    streetAction,
    changeActAction,
    streetLifeAction,
    recordMenu(),
    quitAction,
  ]
}

export const hustlerCareerMenu: MenuGroup = {
  type: 'menu',
  id: 'special.hustler',
  label: 'Street Hustler',
  emoji: '\u{1F0CF}',
  subtitle: 'Scam, busk, perform or beg',
  header: () => 'Hit the streets and hustle for cash. Scams pay best but can land you in jail. Learn instruments under Mind & Body to busk.',
  children: (g): MenuNode[] => {
    if (hustlerJob(g)) return [{ type: 'info', id: 'hustle.already', text: 'You are already hustling. Manage it from your job.', emoji: '\u{1F0CF}' }, recordMenu()]
    const nodes: MenuNode[] = [
      startAction('scam', 'Scam Artist', '\u{1F0CF}', 'Three Card Monte, shell games, fake handbags · 18+', 18),
      startAction('busk', 'Busker', '\u{1F3B6}', 'Play music for tips · 16+', 16),
      startAction('perform', 'Street Performer', '\u{1F525}', 'Fire eating, miming, sword swallowing... · 16+', 16),
      startAction('beg', 'Panhandler', '\u{1F932}', 'Pick a prop and ask for spare change · 16+', 16),
    ]
    if (viewHustle(g).sessions > 0) nodes.push(recordMenu())
    return nodes
  },
}

// ---------------------------------------------------------------------------
// Yearly

export function yearlyHustler(g: GameState): void {
  const c = g.character
  if (!c.alive || c.prison) return
  const job = hustlerJob(g)
  if (!job) return
  if (!claimYearly(g, 'hustler')) return
  syncTenure(g, job)
  const d = hdata(job)
  const earned = Math.max(0, Math.round(d.earnedYear || 0))
  job.salary = earned
  if (d.sessionsYear > 0) log(g, `I made ${money(earned)} hustling on the streets this year.`, earned >= 2_000 ? 'good' : 'neutral')
  d.earnedYear = 0
  d.sessionsYear = 0
  // Streets change over time.
  if (chance(g, 0.3)) d.police = Math.max(1, Math.min(5, d.police + (chance(g, 0.5) ? 1 : -1)))
  if (chance(g, 0.3)) d.rivals = Math.max(1, Math.min(5, d.rivals + (chance(g, 0.5) ? 1 : -1)))
  if (c.age >= 40 && chance(g, 0.05)) addStat(g, 'health', -2)
  if (chance(g, 0.2)) streetEncounter(g)
}
