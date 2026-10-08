// Special career: Astronaut. Graduate university, get into the Space Academy (space camp as a
// kid helps), survive two years of training, join a space agency as an Astronaut Candidate and
// climb to Chief Astronaut. Missions launch to the space station, the Moon, deep space or Mars;
// steer through asteroid fields, take spacewalks, discover and name planets, publish research.
import { addHidden, addStat, count, counter, earnIncome, log, remember, scriptChoice, scriptInput, useYearAction } from '../core'
import { killCharacter } from '../death'
import { masterFirstTime } from '../mastery'
import { chance, pick, rand, randInt, shuffle } from '../rng'
import { defineScript } from '../scripts'
import { hasMainCharacter } from '../talents'
import type { ChoiceOption, GameState, Job, Json, MenuAction, MenuGroup, MenuNode } from '../types'
import {
  addFame,
  blocked,
  bump,
  clamp100,
  cleanName,
  convictions,
  fameToward,
  hasAddiction,
  hasCollegeDegree,
  hire,
  leave,
  money,
  myJob,
  num,
  ownFlag,
  peek,
  prof,
  promote,
  quitNote,
  say,
  str,
  syncTenure,
  tell,
  view,
} from './common'

// ---------------------------------------------------------------------------
// Data

interface Agency {
  id: string
  name: string
  emoji: string
  /** Smarts the recruiters like to see. */
  smarts: number
  pay: number
  /** Launch-risk multiplier (private rockets explode more often). */
  risk: number
  blurb: string
}

const AGENCIES: Agency[] = [
  { id: 'oea', name: 'Orbital Exploration Agency', emoji: '\u{1F6F0}\u{FE0F}', smarts: 65, pay: 1, risk: 1, blurb: 'Government space agency' },
  { id: 'sfa', name: 'Stellar Frontier Alliance', emoji: '\u{1F30C}', smarts: 58, pay: 0.92, risk: 0.9, blurb: 'International space consortium' },
  { id: 'rocketeer', name: 'Rocketeer Aerospace', emoji: '\u{1F680}', smarts: 50, pay: 1.35, risk: 2.2, blurb: 'Private rocket company that moves fast and breaks things' },
]

/** The player's own government space agency, where one exists (NASA, ISRO, JAXA, ESA...). */
const SPACE_AGENCIES: Record<string, string> = {
  us: 'NASA', ru: 'Roscosmos', cn: 'CNSA', jp: 'JAXA', in: 'ISRO', fr: 'CNES', de: 'DLR', it: 'Italian Space Agency',
  gb: 'UK Space Agency', ca: 'Canadian Space Agency', kr: 'Korea AeroSpace Administration', ae: 'UAE Space Agency',
  br: 'Brazilian Space Agency', il: 'Israel Space Agency', ir: 'Iranian Space Agency', ua: 'State Space Agency of Ukraine',
  au: 'Australian Space Agency', nz: 'New Zealand Space Agency', sa: 'Saudi Space Agency', mx: 'Mexican Space Agency',
  ar: 'CONAE', tr: 'Turkish Space Agency', pk: 'SUPARCO', id: 'BRIN', th: 'GISTDA', ph: 'Philippine Space Agency',
  ng: 'NASRDA', eg: 'Egyptian Space Agency', kz: 'Kazcosmos', es: 'Spanish Space Agency', pl: 'Polish Space Agency',
  be: 'European Space Agency', nl: 'European Space Agency', at: 'European Space Agency', ch: 'European Space Agency',
  dk: 'European Space Agency', se: 'European Space Agency', no: 'European Space Agency', fi: 'European Space Agency',
  pt: 'European Space Agency', gr: 'European Space Agency', ie: 'European Space Agency', cz: 'European Space Agency',
  hu: 'European Space Agency', ro: 'European Space Agency', ee: 'European Space Agency', sk: 'European Space Agency',
}

/** The agency as the player's country knows it: the government agency gets its local name. */
function localAgency(g: GameState, a: Agency): Agency {
  if (a.id !== 'oea') return a
  const name = SPACE_AGENCIES[g.character.countryId]
  return name ? { ...a, name, blurb: name === 'European Space Agency' ? 'Europe\'s space agency' : 'Your country\'s space agency' } : a
}

function agencyOf(id: string, g?: GameState): Agency {
  const a = AGENCIES.find((x) => x.id === id) ?? AGENCIES[0]
  return g ? localAgency(g, a) : a
}

function agenciesFor(g: GameState): Agency[] {
  return AGENCIES.map((a) => localAgency(g, a))
}

/** "NASA" and "Roscosmos" go without "the"; "the European Space Agency" takes it. */
function theAgency(a: Agency): string {
  return /^[A-Z]{3,}$/.test(a.name) || /cosmos$/.test(a.name) ? a.name : `the ${a.name}`
}

function TheAgency(a: Agency): string {
  const t = theAgency(a)
  return t[0].toUpperCase() + t.slice(1)
}

const ACADEMY = 'Orion Space Academy'
const RANKS = ['Astronaut Candidate', 'Astronaut', 'Mission Specialist', 'Flight Engineer', 'Mission Commander', 'Chief Astronaut']
const PAY = [66_000, 85_000, 98_000, 112_000, 135_000, 160_000]
const STIPEND = 14_000

interface Planet {
  name: string
  kind: string
  age: number
}

interface AstroProfile {
  academyApps: number
  graduated: boolean
  missions: number
  spacewalks: number
  moonLandings: number
  marsLandings: number
  articles: number
  research: number
  planets: Planet[]
  /** Words spoken on first stepping onto the Moon. */
  firstWords: string
}

const initAstro = (): AstroProfile => ({ academyApps: 0, graduated: false, missions: 0, spacewalks: 0, moonLandings: 0, marsLandings: 0, articles: 0, research: 0, planets: [], firstWords: '' })

function astroProfile(g: GameState): AstroProfile {
  return prof(g, 'astronaut', initAstro)
}

function viewAstro(g: GameState): AstroProfile {
  return peek<AstroProfile>(g, 'astronaut') ?? initAstro()
}

interface CadetData {
  training: number
  yearsLeft: number
}

interface AstroData {
  agency: string
  lastMissionAge: number
}

export function cadetJob(g: GameState): Job | null {
  return myJob(g, 'astronaut.cadet')
}

export function astronautJob(g: GameState): Job | null {
  return myJob(g, 'astronaut')
}

function cdata(job: Job): CadetData {
  return view<CadetData>(job.data)
}

function adata(job: Job): AstroData {
  return view<AstroData>(job.data)
}

function payFor(agency: Agency, level: number): number {
  return Math.round((PAY[Math.min(level, PAY.length - 1)] * agency.pay) / 100) * 100
}

// ---------------------------------------------------------------------------
// Space Academy

function academyReason(g: GameState): string | null {
  const c = g.character
  const b = blocked(g, 18)
  if (b) return b
  if (!hasCollegeDegree(g)) return 'The Space Academy only accepts university graduates.'
  if (c.age > 45) return 'The Space Academy says you are past the age limit for new cadets.'
  if (c.stats.health < 50) return 'You need to be in better health to pass the astronaut physical.'
  if (hasAddiction(g)) return 'You would never pass the Space Academy drug test.'
  if (c.criminalRecord.some((r) => r.convicted && (r.sentenceYears ?? 0) >= 1)) return 'The Space Academy will not admit anyone with a serious criminal record.'
  return null
}

const academyAction: MenuAction = {
  type: 'action',
  id: 'astro.academy',
  label: 'Apply to Space Academy',
  emoji: '\u{1F393}',
  subtitle: 'Two years of astronaut training · Requires a university degree',
  visible: (g) => !viewAstro(g).graduated && !cadetJob(g),
  disabledReason: academyReason,
  confirm: (g) => (g.character.job ? `If you're accepted, you'll quit your job as ${g.character.job.title}. Apply?` : null),
  run: (g) => {
    const why = academyReason(g)
    if (why) return tell(g, ACADEMY, why, '\u{1F393}')
    if (!useYearAction(g, 'astro.academy', 1)) return tell(g, ACADEMY, 'You already applied this year. The admissions office said to try again next year.', '\u{1F4EC}')
    const c = g.character
    const p = astroProfile(g)
    p.academyApps += 1
    const camp = Math.min(3, counter(g, 'spaceCamp'))
    const odds = Math.max(0.05, Math.min(0.9, 0.2 + (c.stats.smarts - 50) / 70 + (c.hidden.athleticism - 40) / 200 + (c.stats.health - 60) / 200 + camp * 0.07 - convictions(g) * 0.05))
    if (!chance(g, odds)) {
      log(g, `${ACADEMY} rejected my application.`, 'bad')
      return say(
        g,
        ACADEMY,
        pick(g, [
          `${ACADEMY} rejected you. The letter said "Ad astra... but not with us."`,
          `You failed the centrifuge test and threw up on an admissions officer. ${ACADEMY} said no.`,
          `${ACADEMY} said your application was "promising but grounded". Try again next year.`,
        ]),
        '\u{1F4ED}',
        'bad',
      )
    }
    const training = clamp100(25 + (c.stats.smarts - 50) / 4 + (c.hidden.athleticism - 40) / 5 + camp * 4 + randInt(g, -5, 5))
    const start = { training }
    masterTraining(g, start)
    const { quit } = hire(g, { defId: 'astronaut.cadet', title: 'Space Academy Cadet', company: ACADEMY, salary: STIPEND, performance: start.training, data: { training: start.training, yearsLeft: 2 } })
    addStat(g, 'happiness', 12)
    log(g, `I was accepted into ${ACADEMY}!`, 'good')
    remember(g, `Accepted into ${ACADEMY}.`)
    say(g, ACADEMY, `You've been accepted into ${ACADEMY}! Two years of grueling training stand between you and the stars. You'll receive a ${money(STIPEND)} stipend.${quitNote(quit)}${camp > 0 ? ' Your space camp days finally paid off.' : ''}`, '\u{1F680}', 'good')
  },
}

const DRILLS: { id: string; label: string; emoji: string; stat: 'smarts' | 'athleticism' | 'health' | 'mixed' }[] = [
  { id: 'physical', label: 'Physical Training', emoji: '\u{1F3CB}\u{FE0F}', stat: 'athleticism' },
  { id: 'sim', label: 'Flight Simulator', emoji: '\u{1F579}\u{FE0F}', stat: 'mixed' },
  { id: 'study', label: 'Study Astrophysics', emoji: '\u{1F52D}', stat: 'smarts' },
  { id: 'zerog', label: 'Zero-G Training', emoji: '\u{1FA90}', stat: 'health' },
]

function drillAction(dr: (typeof DRILLS)[number]): MenuAction {
  return {
    type: 'action',
    id: `astro.drill.${dr.id}`,
    label: dr.label,
    emoji: dr.emoji,
    subtitle: 'Improve your training score',
    disabledReason: (g) => blocked(g, 0),
    run: (g) => {
      const job = cadetJob(g)
      if (!job) return
      if (!useYearAction(g, `astro.drill.${dr.id}`, 1)) return tell(g, dr.label, `You've already done ${dr.label.toLowerCase()} this year. Your instructors want you rested.`, '\u{1F971}')
      const c = g.character
      const base = dr.stat === 'smarts' ? c.stats.smarts : dr.stat === 'athleticism' ? c.hidden.athleticism : dr.stat === 'health' ? c.stats.health : (c.stats.smarts + c.hidden.athleticism) / 2
      const gain = Math.max(1, Math.round(3 + (base - 50) / 10 + randInt(g, 0, 6)))
      const d = cdata(job)
      masterTraining(g, d)
      d.training = clamp100(d.training + gain)
      job.performance = d.training
      if (dr.stat === 'athleticism') addHidden(g, 'athleticism', randInt(g, 1, 3))
      if (dr.stat === 'smarts') addStat(g, 'smarts', randInt(g, 1, 3))
      if (dr.stat === 'health') addStat(g, 'health', randInt(g, 0, 2))
      const lines: Record<string, string[]> = {
        physical: ['You ran ten miles in full gear and only cried a little.', 'You did so many pull-ups your arms filed a complaint.', 'You out-swam half your class in the survival pool.'],
        sim: ['You landed the simulator shuttle on your first try. Your instructor raised one eyebrow, which counts as applause.', 'You crashed the simulator twice, then nailed it on the third run.', 'You flew a perfect simulated docking.'],
        study: ['You studied orbital mechanics until you dreamed in equations.', 'You memorized every star in the southern sky. You are fun at parties now.', 'You aced a quiz on rocket propulsion.'],
        zerog: ['You rode the "vomit comet" and kept your lunch down. Barely.', 'You floated through zero-g drills like you were born up there.', 'You spun in the centrifuge until you saw through time.'],
      }
      log(g, `I did ${dr.label.toLowerCase()} at the Space Academy.`)
      say(g, dr.label, `${pick(g, lines[dr.id] ?? lines.physical)} Training score: ${d.training}% (+${gain}).`, dr.emoji, 'good')
    },
  }
}

const dropOutAction: MenuAction = {
  type: 'action',
  id: 'astro.dropout',
  label: 'Drop Out',
  emoji: '\u{1F6AA}',
  subtitle: 'Leave the Space Academy',
  confirm: () => 'Drop out of the Space Academy?',
  run: (g) => {
    if (!cadetJob(g)) return
    leave(g, 'quit')
    log(g, `I dropped out of ${ACADEMY}.`, 'bad')
    say(g, 'Dropped Out', `You dropped out of ${ACADEMY}. Your dream of space will have to wait. Gravity wins this round.`, '\u{1F6AA}', 'bad')
  },
}

function cadetNodes(g: GameState): MenuNode[] {
  const job = cadetJob(g)
  if (!job) return []
  const d = cdata(job)
  return [
    { type: 'info', id: 'astro.cadet.status', emoji: '\u{1F393}', text: `Space Academy Cadet · Training score ${d.training}% · ${d.yearsLeft} year${d.yearsLeft === 1 ? '' : 's'} until graduation (60% needed)` },
    ...DRILLS.map(drillAction),
    dropOutAction,
  ]
}

// ---------------------------------------------------------------------------
// Agencies

function agencyReason(g: GameState, a: Agency): string | null {
  const c = g.character
  const b = blocked(g, 18)
  if (b) return b
  if (!viewAstro(g).graduated) return 'You need to graduate from the Space Academy first.'
  if (astronautJob(g)) return 'You already work for a space agency.'
  if (c.age > 50) return `${TheAgency(a)} isn't hiring candidates over 50.`
  if (c.stats.health < 45) return 'You would fail the flight physical in your current health.'
  if (hasAddiction(g)) return 'You would never pass the drug screening.'
  return null
}

function hireAstronaut(g: GameState, a: Agency): string {
  const { quit } = hire(g, { defId: 'astronaut', title: RANKS[0], company: a.name, salary: payFor(a, 0), level: 0, performance: 60, data: { agency: a.id, lastMissionAge: -1 } })
  addStat(g, 'happiness', 12)
  addFame(g, 1)
  log(g, `I joined ${theAgency(a)} as an Astronaut Candidate.`, 'good')
  remember(g, `Joined ${theAgency(a)} as an astronaut.`)
  return quitNote(quit)
}

function applyAgency(a: Agency): MenuAction {
  return {
    type: 'action',
    id: `astro.apply.${a.id}`,
    label: a.name,
    emoji: a.emoji,
    subtitle: () => `${a.blurb} · Starts at ${money(payFor(a, 0))}`,
    disabledReason: (g) => agencyReason(g, a),
    confirm: (g) => (g.character.job ? `If hired, you'll quit your job as ${g.character.job.title}. Apply?` : null),
    run: (g) => {
      const why = agencyReason(g, a)
      if (why) return tell(g, a.name, why, a.emoji)
      if (!useYearAction(g, `astro.apply.${a.id}`, 1)) return tell(g, a.name, `You already applied to ${theAgency(a)} this year.`, '\u{1F4EC}')
      const c = g.character
      const odds = Math.max(0.1, Math.min(0.92, 0.55 + (c.stats.smarts - a.smarts) / 50 + (c.stats.health - 70) / 200))
      if (!chance(g, odds)) {
        log(g, `${TheAgency(a)} turned me down.`, 'bad')
        return say(g, a.name, pick(g, [`${TheAgency(a)} said they had "more qualified candidates". You suspect nepotism.`, `You flubbed the panel interview at ${theAgency(a)} by calling Pluto a planet. Twice.`, `${TheAgency(a)} has a hiring freeze. Try again next year.`]), '\u{1F4ED}', 'bad')
      }
      const note = hireAstronaut(g, a)
      say(g, a.name, `${TheAgency(a)} hired you as an Astronaut Candidate! Your salary is ${money(payFor(a, 0))}. Train hard and you'll be on a launch pad soon.${note}`, '\u{1F468}\u{200D}\u{1F680}', 'good')
    },
  }
}

const OFFER_SCRIPT = 'special.astro.offer'

defineScript(OFFER_SCRIPT, (g, choice) => {
  if (choice === 'decline') return say(g, 'Job Offers', 'You turned down every space agency. You can apply again later under Special Careers.', '\u{1F30D}')
  const a = agenciesFor(g).find((x) => x.id === choice)
  if (!a || agencyReason(g, a)) return
  const note = hireAstronaut(g, a)
  say(g, a.name, `You accepted ${theAgency(a)}'s offer and became an Astronaut Candidate earning ${money(payFor(a, 0))}.${note}`, a.emoji, 'good')
})

// ---------------------------------------------------------------------------
// Astronaut work: training, research, articles

const TRAIN_SCRIPT = 'special.astro.train'

defineScript(TRAIN_SCRIPT, (g, choice) => {
  const job = astronautJob(g)
  if (!job || choice === 'cancel') return
  if (!useYearAction(g, 'astro.train', 2)) return tell(g, 'Training', "You've trained enough this year. The flight surgeon ordered you to rest.", '\u{1F971}')
  const gain = randInt(g, 3, 8)
  bump(job, gain)
  let text: string
  if (choice === 'pool') {
    addHidden(g, 'athleticism', randInt(g, 1, 2))
    text = pick(g, ['You practiced spacewalks in a giant underwater pool. A diver gave you a thumbs up.', 'Six hours in a pressurized suit at the bottom of a pool. Your fingers are raisins.'])
  } else if (choice === 'centrifuge') {
    addStat(g, 'health', -1)
    text = pick(g, ['You pulled 8 Gs in the centrifuge and briefly forgot your own name.', 'The centrifuge spun you so fast your face is still catching up.'])
  } else if (choice === 'survival') {
    addHidden(g, 'athleticism', randInt(g, 0, 2))
    text = pick(g, ['You survived three days in the wilderness in case your capsule lands off course. You ate a beetle.', 'Water survival training: you bobbed in the ocean for hours waiting for a rescue helicopter.'])
  } else {
    addStat(g, 'smarts', randInt(g, 0, 2))
    text = pick(g, ['You flew emergency scenarios in the simulator until you could land with your eyes closed.', 'You practiced docking with the space station in the simulator. Gently. Very gently.'])
  }
  log(g, 'I trained for spaceflight.')
  say(g, 'Training', `${text} Performance: ${job.performance}%.`, '\u{1F9D1}\u{200D}\u{1F680}', 'good')
})

const trainAction: MenuAction = {
  type: 'action',
  id: 'astro.train',
  label: 'Train',
  emoji: '\u{1F3CB}\u{FE0F}',
  subtitle: 'Keep yourself flight-ready',
  disabledReason: (g) => blocked(g, 0),
  run: (g) =>
    scriptChoice(
      g,
      TRAIN_SCRIPT,
      'Training',
      'How do you want to train?',
      [
        { id: 'pool', label: 'Neutral buoyancy pool', emoji: '\u{1F30A}' },
        { id: 'centrifuge', label: 'Centrifuge', emoji: '\u{1F300}' },
        { id: 'sim', label: 'Flight simulator', emoji: '\u{1F579}\u{FE0F}' },
        { id: 'survival', label: 'Survival training', emoji: '\u{1F3D5}\u{FE0F}' },
        { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' },
      ],
      { emoji: '\u{1F3CB}\u{FE0F}' },
    ),
}

const researchAction: MenuAction = {
  type: 'action',
  id: 'astro.research',
  label: 'Conduct Research',
  emoji: '\u{1F52C}',
  subtitle: (g) => `Research points: ${viewAstro(g).research}`,
  disabledReason: (g) => blocked(g, 0),
  run: (g) => {
    const job = astronautJob(g)
    if (!job) return
    if (!useYearAction(g, 'astro.research', 1)) return tell(g, 'Research', "You've already run your experiments this year. The lab mice need a break.", '\u{1F42D}')
    const c = g.character
    const p = astroProfile(g)
    const pts = Math.max(1, Math.round(2 + (c.stats.smarts - 40) / 10 + randInt(g, 0, 4)))
    p.research += pts
    bump(job, randInt(g, 2, 5))
    addStat(g, 'smarts', randInt(g, 0, 2))
    log(g, 'I conducted research for my space agency.')
    say(
      g,
      'Research',
      `${pick(g, [
        'You studied how tomatoes grow in microgravity. They are confused but thriving.',
        'You analyzed rock samples and found something that is definitely a rock.',
        'You measured cosmic radiation levels and recommended thicker underwear for the crew.',
        'You ran an experiment on how ants build tunnels in zero gravity. Badly, it turns out.',
      ])} (+${pts} research points)`,
      '\u{1F52C}',
      'good',
    )
  },
}

const articleAction: MenuAction = {
  type: 'action',
  id: 'astro.article',
  label: 'Publish an Article',
  emoji: '\u{1F4C4}',
  subtitle: (g) => `${viewAstro(g).articles} published`,
  disabledReason: (g) => blocked(g, 0),
  run: (g) => {
    const job = astronautJob(g)
    if (!job) return
    if (!useYearAction(g, 'astro.article', 1)) return tell(g, 'Publish an Article', "You've already submitted an article this year. Peer review moves slowly.", '\u{1F4C4}')
    const c = g.character
    const p = astroProfile(g)
    const score = c.stats.smarts * 0.6 + Math.min(40, p.research * 2) + randInt(g, -15, 15)
    if (score < 45) {
      log(g, 'A scientific journal rejected my article.', 'bad')
      return say(g, 'Rejected', pick(g, ['Reviewer #2 called your article "an embarrassment to the cosmos".', 'The journal rejected your article. Do more research first.', 'Your article was rejected for using the word "space-stuff" eleven times.']), '\u{1F4C4}', 'bad')
    }
    p.articles += 1
    count(g, 'articles')
    const big = score >= 80
    addFame(g, big ? 3 : 1)
    bump(job, big ? 8 : 4)
    log(g, big ? 'My research made the cover of a scientific journal.' : 'I published a scientific article.', 'good')
    say(
      g,
      'Published!',
      big
        ? `Your article on ${pick(g, ['microgravity muscle loss', 'lunar water ice', 'exoplanet atmospheres', 'the sleep habits of astronauts'])} made the cover of a major scientific journal!`
        : `Your article on ${pick(g, ['solar wind', 'space station air filters', 'the taste of space food', 'orbital debris'])} was published. Twelve people read it, and they loved it.`,
      '\u{1F4C4}',
      'good',
    )
  },
}

// ---------------------------------------------------------------------------
// Missions

interface Destination {
  id: string
  label: string
  emoji: string
  minLevel: number
  fame: number
  bonus: number
  asteroids: number
}

const DESTINATIONS: Destination[] = [
  { id: 'station', label: 'Space Station resupply', emoji: '\u{1F6F0}\u{FE0F}', minLevel: 1, fame: 1, bonus: 0.06, asteroids: 0.35 },
  { id: 'satellite', label: 'Satellite repair', emoji: '\u{1F4E1}', minLevel: 1, fame: 1, bonus: 0.07, asteroids: 0.5 },
  { id: 'moon', label: 'The Moon', emoji: '\u{1F311}', minLevel: 2, fame: 6, bonus: 0.12, asteroids: 1 },
  { id: 'deep', label: 'Deep space survey', emoji: '\u{1F52D}', minLevel: 3, fame: 3, bonus: 0.12, asteroids: 1 },
  { id: 'mars', label: 'Mars', emoji: '\u{1F534}', minLevel: 4, fame: 10, bonus: 0.2, asteroids: 1 },
]

function destOf(id: string): Destination {
  return DESTINATIONS.find((d) => d.id === id) ?? DESTINATIONS[0]
}

function minLevelFor(g: GameState, d: Destination): number {
  return d.id === 'mars' && ownFlag(g, 'marsFunding') === true ? 3 : d.minLevel
}

const DEST_SCRIPT = 'special.astro.dest'
const ASTEROID_SCRIPT = 'special.astro.asteroid'
const SPACEWALK_SCRIPT = 'special.astro.spacewalk'
const WORDS_SCRIPT = 'special.astro.words'
const PLANET_SCRIPT = 'special.astro.planet'

const DIRS: { id: string; label: string; emoji: string }[] = [
  { id: 'left', label: 'Steer left', emoji: '\u{2B05}\u{FE0F}' },
  { id: 'right', label: 'Steer right', emoji: '\u{27A1}\u{FE0F}' },
  { id: 'up', label: 'Pull up', emoji: '\u{2B06}\u{FE0F}' },
  { id: 'down', label: 'Dive under', emoji: '\u{2B07}\u{FE0F}' },
  { id: 'straight', label: 'Full throttle straight through', emoji: '\u{23E9}' },
]

interface Flight {
  dest: string
  round: number
  hull: number
  safe: string[]
}

function asteroidPrompt(g: GameState, f: Flight, prefix: string): void {
  const safe = shuffle(g, DIRS.map((d) => d.id)).slice(0, 2)
  const reliable = chance(g, 0.45 + g.character.stats.smarts / 200)
  const hint = reliable ? pick(g, safe) : pick(g, DIRS.map((d) => d.id).filter((x) => !safe.includes(x)))
  const hintLabel = DIRS.find((d) => d.id === hint)?.label.toLowerCase() ?? 'steer left'
  const next: Flight = { ...f, safe }
  scriptChoice(
    g,
    ASTEROID_SCRIPT,
    `Asteroid Field (${f.round}/3)`,
    `${prefix}${prefix ? '\n\n' : ''}Asteroids dead ahead! Hull integrity: ${f.hull}%. Your sensors suggest you ${hintLabel}... if you trust them. Which way?`,
    DIRS.map((d) => ({ id: d.id, label: d.label, emoji: d.emoji })),
    { emoji: '\u{2604}\u{FE0F}', data: next as unknown as Json },
  )
}

defineScript(DEST_SCRIPT, (g, choice) => {
  const job = astronautJob(g)
  if (!job || choice === 'cancel') return
  const dest = DESTINATIONS.find((d) => d.id === choice)
  if (!dest || job.level < minLevelFor(g, dest)) return
  if (!useYearAction(g, 'astro.mission', 1)) return tell(g, 'Mission', 'You already flew a mission this year. The next launch window is next year.', '\u{1F4C5}')
  const agency = agencyOf(adata(job).agency, g)
  adata(job).lastMissionAge = g.character.age
  // Launch.
  if (chance(g, 0.004 * agency.risk)) {
    say(g, 'Liftoff...', `3... 2... 1... The rocket lifted off, shuddered, and became a very bright, very brief new star.`, '\u{1F4A5}', 'bad')
    killCharacter(g, 'Rocket Explosion')
    return
  }
  log(g, `I launched on a mission: ${dest.label.toLowerCase()}.`, 'event')
  const launch = pick(g, [
    'Three... two... one... LIFTOFF! The rumble rattled your teeth as Earth fell away beneath you.',
    'The engines roared and you were pinned to your seat. Moments later, the sky turned black.',
    'You waved at the camera, the countdown hit zero, and you were on your way to space!',
  ])
  if (chance(g, dest.asteroids)) {
    asteroidPrompt(g, { dest: dest.id, round: 1, hull: 100, safe: [] }, launch)
    return
  }
  arrive(g, dest.id, 100, launch)
})

defineScript(ASTEROID_SCRIPT, (g, choice, data) => {
  const raw = (data ?? {}) as Partial<Flight>
  const f: Flight = { dest: str(raw.dest as Json, 'station'), round: num(raw.round as Json, 1), hull: num(raw.hull as Json, 100), safe: Array.isArray(raw.safe) ? raw.safe.map(String) : [] }
  if (!g.character.alive) return
  const job = astronautJob(g)
  const risk = job ? agencyOf(adata(job).agency, g).risk : 1
  let text: string
  if (f.safe.includes(choice)) {
    text = pick(g, ['You threaded the needle between two asteroids. Mission control exhaled.', 'A clean maneuver! The asteroids tumbled harmlessly past your window.', 'Perfect piloting. Somewhere, your flight instructor felt a disturbance in the force.'])
  } else {
    const dmg = randInt(g, 20, 40)
    f.hull = Math.max(0, f.hull - dmg)
    text = pick(g, [`CLANG! An asteroid clipped the hull (-${dmg}%).`, `A rock the size of a minivan scraped your wing (-${dmg}%). Alarms everywhere.`, `You zigged when you should have zagged. Impact! (-${dmg}%)`])
  }
  if (f.hull <= 0) {
    if (chance(g, Math.min(0.6, 0.3 * risk))) {
      say(g, 'Mission Lost', `${text} The hull gave way. Mission control lost contact with your craft.`, '\u{2604}\u{FE0F}', 'bad')
      killCharacter(g, 'Asteroid Collision')
      return
    }
    const j = astronautJob(g)
    if (j) bump(j, -15)
    addStat(g, 'health', -randInt(g, 10, 25))
    addStat(g, 'happiness', -10)
    count(g, 'spaceMissions')
    astroProfile(g).missions += 1
    log(g, 'My spacecraft was crippled by asteroids and I barely made it home.', 'bad')
    say(g, 'Aborted', `${text} With the hull shredded, you aborted the mission and limped back to Earth on emergency power. You survived, but just barely.`, '\u{1FA82}', 'bad')
    return
  }
  if (f.round < 3) {
    asteroidPrompt(g, { ...f, round: f.round + 1 }, text)
    return
  }
  arrive(g, f.dest, f.hull, `${text} You made it through the asteroid field!`)
})

const PLANET_KINDS = ['gas giant', 'ice world', 'rocky planet', 'ocean world', 'lava planet', 'dwarf planet', 'super-Earth']
const PLANET_PREFIX = ['Kepler', 'Nova', 'Zeta', 'Orion', 'Vega', 'Lyra', 'Draco', 'Cygnus']

function arrive(g: GameState, destId: string, hull: number, prefix: string): void {
  const job = astronautJob(g)
  if (!job || !g.character.alive) return
  const dest = destOf(destId)
  const p = astroProfile(g)
  p.missions += 1
  count(g, 'spaceMissions')
  const bonus = Math.round((job.salary * dest.bonus * (0.8 + rand(g) * 0.5)) / 100) * 100
  earnIncome(g, bonus)
  bump(job, randInt(g, 8, 15) - (hull < 50 ? 5 : 0))
  addFame(g, dest.fame)
  addStat(g, 'happiness', randInt(g, 10, 18))
  const pay = ` You earned a ${money(bonus)} mission bonus.`
  const lead = prefix ? `${prefix}\n\n` : ''
  switch (dest.id) {
    case 'station': {
      log(g, 'I flew a mission to the space station.', 'good')
      say(g, 'Space Station', `${lead}You docked with the space station and delivered supplies, experiments and ${pick(g, ['a birthday cake for the commander', 'three hundred pounds of freeze-dried lasagna', 'a very confused fruit fly colony'])}.${pay}`, '\u{1F6F0}\u{FE0F}', 'good')
      if (chance(g, 0.6)) spacewalkOffer(g, 'A solar panel on the station needs repairs. Your commander asks for a volunteer to go outside.')
      return
    }
    case 'satellite': {
      const ok = chance(g, 0.5 + g.character.stats.smarts / 200)
      log(g, ok ? 'I repaired a satellite in orbit.' : 'I failed to repair a satellite in orbit.', ok ? 'good' : 'bad')
      if (!ok) bump(job, -6)
      say(g, 'Satellite Repair', `${lead}${ok ? 'You fixed the satellite. Millions of people got their TV signal back and never knew your name.' : 'You tried to fix the satellite but dropped a wrench into orbit. It is now the fastest wrench in history.'}${pay}`, '\u{1F4E1}', ok ? 'good' : 'neutral')
      spacewalkOffer(g, 'The satellite can only be fixed from outside. Will you suit up for a spacewalk?')
      return
    }
    case 'moon': {
      p.moonLandings += 1
      count(g, 'moonLandings')
      log(g, 'I walked on the Moon!', 'good')
      remember(g, 'Walked on the Moon.')
      if (!p.firstWords) {
        scriptChoice(
          g,
          WORDS_SCRIPT,
          'Moon Landing',
          `${lead}The lunar module touched down. The whole world is watching as you climb down the ladder. What are your first words on the Moon?${pay}`,
          [
            { id: 'leap', label: '"One small step for me, one giant leap for everyone."', emoji: '\u{1F463}' },
            { id: 'house', label: '"I can see my house from here!"', emoji: '\u{1F3E0}' },
            { id: 'cheese', label: '"It\'s not cheese. I checked."', emoji: '\u{1F9C0}' },
            { id: 'mic', label: '"Is this thing on?"', emoji: '\u{1F3A4}' },
            { id: 'mom', label: '"Hi Mom!"', emoji: '\u{1F44B}' },
          ],
          { emoji: '\u{1F311}' },
        )
        return
      }
      say(g, 'The Moon', `${lead}You landed on the Moon again, collected ${randInt(g, 20, 80)} pounds of moon rocks and hit a golf ball into a crater.${pay}`, '\u{1F311}', 'good')
      return
    }
    case 'deep': {
      if (chance(g, 0.6)) {
        const suggestion = `${pick(g, PLANET_PREFIX)}-${randInt(g, 10, 999)}${pick(g, ['b', 'c', 'd', 'e'])}`
        const kind = pick(g, PLANET_KINDS)
        scriptInput(g, {
          title: 'New Planet Discovered!',
          emoji: '\u{1FA90}',
          text: `${lead}Your telescope array picked up something nobody has ever seen: a ${kind} orbiting a distant star! As its discoverer, you get to name it.${pay}`,
          input: 'text',
          placeholder: 'Planet name',
          defaultValue: suggestion,
          scriptId: PLANET_SCRIPT,
          data: { kind, suggestion },
        })
        return
      }
      log(g, 'I surveyed deep space.', 'good')
      say(g, 'Deep Space Survey', `${lead}You mapped ${randInt(g, 200, 4000)} stars and a comet that looked a bit like your uncle. No new planets this time.${pay}`, '\u{1F52D}', 'good')
      return
    }
    default: {
      p.marsLandings += 1
      count(g, 'marsLandings')
      addFame(g, p.marsLandings === 1 ? 8 : 0)
      log(g, 'I set foot on Mars!', 'good')
      remember(g, 'Walked on Mars.')
      const find = chance(g, 0.3)
      if (find) p.research += 10
      say(
        g,
        'Mars!',
        `${lead}After months of travel you stepped onto the red dust of Mars${p.marsLandings === 1 ? ', one of the first humans ever to do so' : ''}! ${find ? 'You found traces of ancient water in the rocks. Scientists back home lost their minds.' : 'You planted a flag, took a selfie and immediately got a sunburn through your visor somehow.'}${pay}`,
        '\u{1F534}',
        'good',
      )
    }
  }
}

function spacewalkOffer(g: GameState, text: string): void {
  scriptChoice(
    g,
    SPACEWALK_SCRIPT,
    'Spacewalk',
    text,
    [
      { id: 'go', label: 'Suit up and go outside', emoji: '\u{1F9D1}\u{200D}\u{1F680}' },
      { id: 'no', label: 'Let someone else do it', emoji: '\u{1F645}' },
    ],
    { emoji: '\u{1F30D}' },
  )
}

defineScript(SPACEWALK_SCRIPT, (g, choice) => {
  const job = astronautJob(g)
  if (!job) return
  if (choice !== 'go') {
    bump(job, -2)
    return say(g, 'Spacewalk', `You stayed inside. ${pick(g, ['A crewmate went instead and got all the glory.', 'You watched through the window, eating dehydrated ice cream.'])}`, '\u{1F6F0}\u{FE0F}')
  }
  if (chance(g, 0.008)) {
    say(g, 'Spacewalk', 'Your tether snapped. You drifted away from the station, waving goodbye as Earth turned slowly beneath you.', '\u{1F30C}', 'bad')
    killCharacter(g, 'Lost in Space')
    return
  }
  const p = astroProfile(g)
  if (chance(g, 0.12)) {
    addStat(g, 'health', -randInt(g, 3, 8))
    bump(job, 2)
    p.spacewalks += 1
    count(g, 'spacewalks')
    log(g, 'I had a scary moment on a spacewalk.', 'bad')
    return say(g, 'Spacewalk', pick(g, ['Your helmet started filling with water mid-repair. You finished the job anyway and got back inside just in time.', 'You lost your grip and floated off for a terrifying few seconds before your tether caught you.']), '\u{1F630}', 'bad')
  }
  p.spacewalks += 1
  count(g, 'spacewalks')
  bump(job, randInt(g, 4, 8))
  addFame(g, 1)
  addStat(g, 'happiness', 8)
  log(g, 'I went on a spacewalk.', 'good')
  say(g, 'Spacewalk', pick(g, ['You floated outside with the whole Earth beneath your boots. You finished the repair and just stared for a while.', 'Your spacewalk was flawless. Mission control said "textbook".', 'You fixed the problem, then took the greatest selfie in human history.']), '\u{1F9D1}\u{200D}\u{1F680}', 'good')
})

defineScript(WORDS_SCRIPT, (g, choice) => {
  const p = astroProfile(g)
  const words: Record<string, [string, number, string]> = {
    leap: ['One small step for me, one giant leap for everyone.', 4, 'Classic. Teachers will quote you for a century.'],
    house: ['I can see my house from here!', 2, 'Late-night hosts loved it. Your house is now a tourist attraction.'],
    cheese: ["It's not cheese. I checked.", 3, 'The internet made it the meme of the decade.'],
    mic: ['Is this thing on?', 1, 'Billions of people heard you tap your helmet microphone. Awkward.'],
    mom: ['Hi Mom!', 2, 'Your mom framed a screenshot. So did everyone else’s mom.'],
  }
  const [line, fame, reaction] = words[choice] ?? words.leap
  p.firstWords = line
  addFame(g, fame)
  remember(g, `First words on the Moon: "${line}"`)
  say(g, 'First Words', `You stepped onto the Moon and said, "${line}" ${reaction}`, '\u{1F463}', 'good')
})

defineScript(PLANET_SCRIPT, (g, value, data) => {
  const d = (data ?? {}) as { kind?: string; suggestion?: string }
  const name = cleanName(value, String(d.suggestion ?? 'New World'), 30)
  const kind = String(d.kind ?? 'planet')
  const p = astroProfile(g)
  p.planets.push({ name, kind, age: g.character.age })
  count(g, 'planetsDiscovered')
  addFame(g, 4)
  const job = astronautJob(g)
  if (job) bump(job, 6)
  log(g, `I discovered a new planet and named it ${name}.`, 'good')
  remember(g, `Discovered the planet ${name}.`)
  say(g, 'Planet Named', `The new ${kind} is officially named ${name}! ${pick(g, ['Textbooks are being updated as we speak.', 'Astronomers everywhere are mispronouncing it already.', 'Somewhere up there, it is waiting for visitors.'])}`, '\u{1FA90}', 'good')
})

const missionAction: MenuAction = {
  type: 'action',
  id: 'astro.mission',
  label: 'Go on a Mission',
  emoji: '\u{1F680}',
  subtitle: (g) => {
    const job = astronautJob(g)
    if (!job) return ''
    return job.level < 1 ? 'Candidates must finish training before flying' : 'One launch window per year'
  },
  disabledReason: (g) => {
    const b = blocked(g, 0)
    if (b) return b
    const job = astronautJob(g)
    if (job && job.level < 1) return 'Astronaut Candidates are not cleared for flight yet. Keep training to earn your wings.'
    if (g.character.stats.health < 30) return 'The flight surgeon grounded you until your health improves.'
    return null
  },
  run: (g) => {
    const job = astronautJob(g)
    if (!job) return
    const options: ChoiceOption[] = DESTINATIONS.filter((d) => job.level >= minLevelFor(g, d)).map((d) => ({ id: d.id, label: d.label, emoji: d.emoji }))
    options.push({ id: 'cancel', label: 'Not yet', emoji: '\u{274C}' })
    scriptChoice(g, DEST_SCRIPT, 'Mission Briefing', 'Mission control has these missions available for you. Where do you want to go?', options, { emoji: '\u{1F680}' })
  },
}

function spaceLogMenu(): MenuGroup {
  return {
    type: 'menu',
    id: 'astro.log',
    label: 'Space Log',
    emoji: '\u{1F4D3}',
    subtitle: (g) => {
      const p = viewAstro(g)
      return `${p.missions} mission${p.missions === 1 ? '' : 's'} · ${p.planets.length} planet${p.planets.length === 1 ? '' : 's'} discovered`
    },
    children: (g): MenuNode[] => {
      const p = viewAstro(g)
      const nodes: MenuNode[] = [
        { type: 'info', id: 'astro.log.stats', emoji: '\u{1F680}', text: `Missions: ${p.missions} · Spacewalks: ${p.spacewalks} · Moon landings: ${p.moonLandings} · Mars landings: ${p.marsLandings}` },
        { type: 'info', id: 'astro.log.science', emoji: '\u{1F52C}', text: `Research points: ${p.research} · Articles published: ${p.articles}` },
      ]
      if (p.firstWords) nodes.push({ type: 'info', id: 'astro.log.words', emoji: '\u{1F463}', text: `First words on the Moon: "${p.firstWords}"` })
      if (p.planets.length) {
        nodes.push({ type: 'heading', id: 'astro.log.h', label: 'Planets Discovered' })
        p.planets.forEach((pl, i) => nodes.push({ type: 'info', id: `astro.log.p${i}`, emoji: '\u{1FA90}', text: `${pl.name}, a ${pl.kind} (discovered at age ${pl.age})` }))
      }
      return nodes
    },
  }
}

const quitAstro: MenuAction = {
  type: 'action',
  id: 'astro.quit',
  label: 'Retire',
  emoji: '\u{1F3D6}\u{FE0F}',
  subtitle: 'Hang up your space suit',
  confirm: () => 'Leave the astronaut corps?',
  run: (g) => {
    const job = astronautJob(g)
    if (!job) return
    const agency = job.company
    const retire = g.character.age >= 50
    leave(g, retire ? 'retired' : 'quit')
    log(g, `I ${retire ? 'retired' : 'resigned'} from the ${agency}.`)
    say(g, retire ? 'Retired' : 'Resigned', `You ${retire ? 'retired' : 'resigned'} from the ${agency}. ${pick(g, ['You still look up at the night sky every evening.', 'Gravity feels heavier now. Emotionally.', 'You kept the space suit. Nobody asked for it back.'])}`, '\u{1F30D}')
  },
}

export function astronautJobNodes(g: GameState): MenuNode[] {
  if (cadetJob(g)) return cadetNodes(g)
  const job = astronautJob(g)
  if (!job) return []
  const p = viewAstro(g)
  return [
    { type: 'info', id: 'astro.status', emoji: '\u{1F468}\u{200D}\u{1F680}', text: `${job.title} at the ${job.company} · Performance ${job.performance}% · ${p.missions} mission${p.missions === 1 ? '' : 's'}` },
    missionAction,
    trainAction,
    researchAction,
    articleAction,
    spaceLogMenu(),
    quitAstro,
  ]
}

export const astronautCareerMenu: MenuGroup = {
  type: 'menu',
  id: 'special.astronaut',
  label: 'Astronaut',
  emoji: '\u{1F468}\u{200D}\u{1F680}',
  subtitle: 'Reach for the stars',
  header: (g) =>
    `Smarts: ${g.character.stats.smarts}% · Health: ${g.character.stats.health}%. University graduates can apply to the Space Academy; graduates are hired by space agencies. Space camp as a kid gives you an edge.`,
  children: (g): MenuNode[] => {
    if (cadetJob(g)) return [{ type: 'info', id: 'astro.cadet', text: 'You are training at the Space Academy. Manage your training from your job.', emoji: '\u{1F393}' }]
    if (astronautJob(g)) return [{ type: 'info', id: 'astro.already', text: 'You are already an astronaut. Manage your career from your job.', emoji: '\u{1F680}' }, spaceLogMenu()]
    const nodes: MenuNode[] = [academyAction]
    if (viewAstro(g).graduated) {
      nodes.push({ type: 'heading', id: 'astro.h.agencies', label: 'Space Agencies' })
      nodes.push(...agenciesFor(g).map(applyAgency))
    }
    if (viewAstro(g).missions > 0) nodes.push(spaceLogMenu())
    return nodes
  },
}

// ---------------------------------------------------------------------------
// Yearly

/**
 * Main Character Syndrome: the first drill is already a top score for the body doing it (poor
 * health caps it). The academy's 60% pass mark, the selection board and the launch are still real.
 */
function masterTraining(g: GameState, d: { training: number }): void {
  if (!hasMainCharacter(g)) return
  masterFirstTime(g, 'school.astronaut', 'school', 'astronaut training')
  d.training = Math.max(d.training, clamp100(55 + g.character.stats.health * 0.4))
}

function yearlyCadet(g: GameState, job: Job): void {
  syncTenure(g, job)
  earnIncome(g, job.salary)
  const d = cdata(job)
  masterTraining(g, d)
  d.training = clamp100(d.training + randInt(g, 1, 5))
  job.performance = d.training
  d.yearsLeft = Math.max(0, d.yearsLeft - 1)
  if (d.yearsLeft > 0) return
  if (d.training >= 60) {
    const p = astroProfile(g)
    p.graduated = true
    leave(g, 'graduated')
    addStat(g, 'happiness', 12)
    count(g, 'spaceAcademy')
    log(g, `I graduated from ${ACADEMY}!`, 'good')
    remember(g, `Graduated from ${ACADEMY}.`)
    const offers = agenciesFor(g).filter(() => chance(g, 0.75))
    if (!offers.length) offers.push(pick(g, agenciesFor(g)))
    scriptChoice(
      g,
      OFFER_SCRIPT,
      'Graduation Day',
      `You graduated from ${ACADEMY} with a training score of ${d.training}%! Space agencies are lining up to recruit you. Which offer will you take?`,
      [...offers.map((a) => ({ id: a.id, label: `${a.name} · ${money(payFor(a, 0))}`, emoji: a.emoji })), { id: 'decline', label: 'Decline them all', emoji: '\u{274C}' }],
      { emoji: '\u{1F393}' },
    )
    return
  }
  leave(g, 'fired')
  addStat(g, 'happiness', -12)
  log(g, `I washed out of ${ACADEMY}.`, 'bad')
  say(g, 'Washed Out', `Your final training score was only ${d.training}% (60% needed). ${ACADEMY} sent you home with a commemorative patch and a firm handshake. You can apply again next year.`, '\u{1F4C9}', 'bad')
}

export function yearlyAstronaut(g: GameState): void {
  const c = g.character
  if (!c.alive || c.prison) return
  const cadet = cadetJob(g)
  if (cadet) return yearlyCadet(g, cadet)
  const job = astronautJob(g)
  if (!job) return
  syncTenure(g, job)
  const d = adata(job)
  const agency = agencyOf(d.agency, g)
  const p = astroProfile(g)
  earnIncome(g, job.salary)
  const flew = d.lastMissionAge === c.age - 1
  bump(job, randInt(g, -4, 3) + (job.level >= 1 && !flew ? -3 : 0) + (c.stats.health < 40 ? -4 : 0))
  fameToward(g, Math.min(60, 4 + job.level * 3 + p.moonLandings * 6 + p.marsLandings * 12 + p.planets.length * 3), 2)

  // Mandatory retirement or medical grounding.
  if (c.age >= 60 || c.stats.health < 20) {
    const title = job.title
    leave(g, 'retired')
    log(g, `I retired from ${theAgency(agency)}.`, 'good')
    remember(g, `Retired as ${title} after ${p.missions} space missions.`)
    say(g, 'Retired', c.age >= 60 ? `You reached the astronaut corps' retirement age and retired as ${title} after ${p.missions} mission${p.missions === 1 ? '' : 's'}. They gave you a cake shaped like a rocket.` : `The flight surgeon permanently grounded you for health reasons. You retired as ${title}.`, '\u{1F3D6}\u{FE0F}', c.age >= 60 ? 'good' : 'bad')
    return
  }

  if (job.performance < 20 && chance(g, 0.5)) {
    leave(g, 'fired')
    log(g, `${TheAgency(agency)} let me go.`, 'bad')
    say(g, 'Fired', `${TheAgency(agency)} cut you from the astronaut corps. ${pick(g, ['Your locker was emptied before you got back from lunch.', 'They said you were "a risk to the mission". And the snacks.'])}`, '\u{1F4C9}', 'bad')
    return
  }

  const next = job.level + 1
  const needMissions = Math.max(0, job.level)
  if (next < RANKS.length && job.yearsInRole >= 1 && job.performance >= (job.level === 0 ? 50 : 62) && p.missions >= needMissions && chance(g, job.level === 0 ? 0.75 : 0.45)) {
    promote(g, job, RANKS[next], payFor(agency, next), next)
    addStat(g, 'happiness', 8)
    log(g, `I was promoted to ${RANKS[next]}.`, 'good')
    remember(g, `Promoted to ${RANKS[next]} at ${theAgency(agency)}.`)
    say(g, 'Promotion', next === 1 ? `You earned your astronaut wings! You are now a full Astronaut at ${theAgency(agency)}, cleared for spaceflight, earning ${money(job.salary)}.` : `${TheAgency(agency)} promoted you to ${RANKS[next]}! Your salary is now ${money(job.salary)}.`, '\u{1F396}\u{FE0F}', 'good')
    return
  }

  if (chance(g, 0.08)) {
    addFame(g, 1)
    log(g, 'I visited a school to talk about space.', 'good')
    say(g, 'School Visit', `You visited an elementary school to talk about life in space. ${pick(g, ['The first question was how astronauts go to the bathroom. So was the second.', 'A kid asked if you have met any aliens. You said "no comment".', 'Thirty kids now want to be astronauts. Their parents blame you.'])}`, '\u{1F3EB}', 'good')
  }
}
