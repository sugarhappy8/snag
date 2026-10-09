// Special career: Model. Get headshots taken, audition for freelance gigs, join a modeling
// agency, climb from New Face to Supermodel, walk in Fashion Week, collect couture gifts and
// (if you must) sabotage rival models.
import { addHidden, addStat, count, earnIncome, log, remember, scriptChoice, spend, useYearAction } from '../core'
import { chance, pick, rand, randInt, shuffle } from '../rng'
import { defineScript } from '../scripts'
import { hasTalent, talentHint, talentMult } from '../talents'
import type { GameState, Job, Json, MenuAction, MenuGroup, MenuNode } from '../types'
import { ageCeiling } from '../mastery'
import { addFame, blocked, bump, claimYearly, clamp100, fameOf, fameToward, flagSkill, hire, leave, masterFlagSkill, money, myJob, peek, promote, prof, quitNote, say, setFlagSkill, syncTenure, tell, view, withHint, yearlyList } from './common'

interface Agency {
  name: string
  tier: number
  looks: number
  headshot: number
  retainer: number
}

const AGENCIES: Agency[] = [
  { name: 'Hometown Faces', tier: 0, looks: 45, headshot: 20, retainer: 15_000 },
  { name: 'Silhouette Models', tier: 1, looks: 60, headshot: 40, retainer: 32_000 },
  { name: 'Prestige Model Management', tier: 2, looks: 72, headshot: 60, retainer: 60_000 },
  { name: 'Icon Elite', tier: 3, looks: 85, headshot: 75, retainer: 110_000 },
]

const RANKS = ['New Face', 'Model', 'Professional Model', 'Elite Model', 'Supermodel']
const RANK_MULT = [1, 1.5, 2.5, 4, 8]

const COUTURE = [
  'Aquarelle Silk Sweatshirt',
  'Midnight Jaguar Leather Jacket',
  'Black Swan Cocktail Dress',
  'Driven Snow Overalls',
  'Eternal Bond Tuxedo Jacket',
  'Final Gambit Trench Coat',
  'Lady in Red Blouse',
  'Librarian Chic Midi Skirt',
  'Perfect Blue Blazer',
  'Red Carpet Extravaganza Gown',
  'Retrowave Button-Up',
  'Rough Rider Leather Jacket',
  'Starman Velvet Pants',
  'Total Boss Tailored Trousers',
  'Camisa del Sol Shirt',
  'Moonlit Sequin Jumpsuit',
  'Golden Hour Kimono',
  'Thunderstorm Cape',
]

const DESIGNERS = ['Maison Lumière', 'Casa Vellutto', 'Oskar Grünwald', 'Atelier Noir', 'Haus of Ziggy', 'Delacroix & Fils', 'Studio Kintsugi']
const FASHION_CITIES = ['Paris', 'Milan', 'New York', 'London', 'Tokyo']

interface ModelProfile {
  headshot: number
  headshotAge: number
  couture: string[]
  gigs: number
  fashionWeeks: number
  rejectedBy: string[]
}

interface ModelJob {
  tier: number
  gigsThisYear: number
  sabotaged: number
}

const initModel = (): ModelProfile => ({ headshot: 0, headshotAge: -1, couture: [], gigs: 0, fashionWeeks: 0, rejectedBy: [] })

function modelNumber(value: unknown, fallback = 0, lo = 0, hi = 1e9): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(lo, Math.min(hi, Math.round(value))) : fallback
}

function modelList(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((x): x is string => typeof x === 'string').map((x) => x.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120)).filter(Boolean))].slice(-256)
    : []
}

function normalizedModel(value: unknown): ModelProfile {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Partial<ModelProfile> : {}
  return {
    headshot: modelNumber(raw.headshot, 0, 0, 100),
    headshotAge: modelNumber(raw.headshotAge, -1, -1, 10_000),
    couture: modelList(raw.couture),
    gigs: modelNumber(raw.gigs),
    fashionWeeks: modelNumber(raw.fashionWeeks),
    rejectedBy: modelList(raw.rejectedBy),
  }
}

function modelProfile(g: GameState): ModelProfile {
  const p = prof(g, 'model', initModel)
  Object.assign(p, normalizedModel(p))
  return p
}

function viewModel(g: GameState): ModelProfile {
  return normalizedModel(peek<ModelProfile>(g, 'model'))
}

export function modelJob(g: GameState): Job | null {
  return myJob(g, 'model')
}

function mdata(job: Job): ModelJob {
  const raw = view<Partial<ModelJob>>(job.data)
  const normalized: ModelJob = {
    tier: modelNumber(raw.tier, 0, 0, AGENCIES.length - 1),
    gigsThisYear: modelNumber(raw.gigsThisYear, 0, 0, 1e6),
    sabotaged: modelNumber(raw.sabotaged, 0, 0, 1e6),
  }
  Object.assign(job.data, normalized)
  return view<ModelJob>(job.data)
}

/** Main Character Syndrome: modeling for the first time (a casting, a booking, practice) is already mastery for the age. */
function masterModeling(g: GameState): void {
  masterFlagSkill(g, 'modeling', 'stage', 'modeling', ageCeiling(g.character.age, { from: 12, full: 18, floor: 45 }))
}

function modelingSkill(g: GameState): number {
  return clamp100(flagSkill(g, 'modeling') + (hasTalent(g, 'Modeling') ? 10 : 0))
}

/** Modeling talent: agencies forgive a few points of looks (they see the "it" factor). */
function looksBar(g: GameState, a: Agency): number {
  return a.looks - (hasTalent(g, 'Modeling') ? 8 : 0)
}

/** How sellable your look is right now (looks, headshot, skill, age). */
function marketability(g: GameState): number {
  const c = g.character
  const p = viewModel(g)
  const agePenalty = c.age > 30 ? (c.age - 30) * 1.5 : 0
  return c.stats.looks * 0.55 + p.headshot * 0.2 + modelingSkill(g) * 0.25 - agePenalty
}

// ---------------------------------------------------------------------------
// Headshots

const PHOTOGRAPHERS = [
  { id: 'budget', label: 'Budget photographer', cost: 150, base: 0, mult: 0.5, spread: 20 },
  { id: 'pro', label: 'Professional photographer', cost: 1_200, base: 20, mult: 0.6, spread: 20 },
  { id: 'celebrity', label: 'Celebrity photographer', cost: 7_500, base: 30, mult: 0.7, spread: 15 },
]

const headshotScript = defineScript('special.model.headshot', (g, choice) => {
  if (choice === 'cancel') return
  const ph = PHOTOGRAPHERS.find((x) => x.id === choice)
  if (!ph) return
  if (!useYearAction(g, 'model.headshot', 1)) return tell(g, 'Headshots', 'You already had headshots taken this year.', '\u{1F4F7}')
  if (!spend(g, ph.cost)) {
    g.yearActions['model.headshot'] = 0
    return tell(g, 'Headshots', `You can't afford the ${money(ph.cost)} photo session.`, '\u{1F4B8}')
  }
  const p = modelProfile(g)
  const q = clamp100(ph.base + g.character.stats.looks * ph.mult + randInt(g, 0, ph.spread))
  p.headshot = q
  p.headshotAge = g.character.age
  log(g, 'I had professional headshots taken.')
  const verdict =
    q >= 75
      ? pick(g, ['The photos are stunning. You look like a magazine cover.', 'The photographer cried a little. Good tears.'])
      : q >= 45
        ? pick(g, ['The photos turned out nicely.', 'Solid headshots. One of them even captures your good side.'])
        : pick(g, ['You blinked in half of them.', 'The lighting made you look like a potato in witness protection.'])
  say(g, 'Headshots', `You paid ${money(ph.cost)} for a photo session. ${verdict} (Headshot quality: ${q}%)`, '\u{1F4F7}', q >= 45 ? 'good' : 'neutral')
})

const headshotAction: MenuAction = {
  type: 'action',
  id: 'model.headshot',
  label: 'Headshots',
  emoji: '\u{1F4F7}',
  subtitle: (g) => {
    const p = viewModel(g)
    return p.headshot > 0 ? `Current headshot quality: ${p.headshot}%` : 'Have your headshots taken'
  },
  disabledReason: (g) => blocked(g, 16),
  run: (g) =>
    scriptChoice(
      g,
      headshotScript,
      'Headshots',
      'Every model needs headshots. Who do you want to shoot them?',
      [...PHOTOGRAPHERS.map((ph) => ({ id: ph.id, label: `${ph.label} (${money(ph.cost)})`, emoji: '\u{1F4F7}' })), { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' }],
      { emoji: '\u{1F4F7}' },
    ),
}

// ---------------------------------------------------------------------------
// Freelance gigs

interface Gig {
  name: string
  pay: number
  req: number
  emoji: string
}

const FREELANCE: { name: string; min: number; max: number; req: number; emoji: string }[] = [
  { name: 'Mall fashion show', min: 300, max: 1_000, req: 35, emoji: '\u{1F6CD}\u{FE0F}' },
  { name: 'Catalog shoot', min: 500, max: 2_000, req: 40, emoji: '\u{1F4D2}' },
  { name: 'Hand model for a ring ad', min: 400, max: 1_500, req: 20, emoji: '\u{1F48D}' },
  { name: 'Local print ad', min: 1_000, max: 3_000, req: 50, emoji: '\u{1F4F0}' },
  { name: 'Indie designer runway', min: 1_500, max: 4_000, req: 60, emoji: '\u{1F460}' },
  { name: 'Fitness brand shoot', min: 1_000, max: 3_000, req: 50, emoji: '\u{1F3CB}\u{FE0F}' },
  { name: 'Music video cameo', min: 800, max: 3_500, req: 55, emoji: '\u{1F3AC}' },
]

function genFreelance(g: GameState): Gig[] {
  const picked = shuffle(g, FREELANCE).slice(0, 4)
  return picked.map((x) => ({ name: x.name, pay: Math.round(randInt(g, x.min, x.max) / 50) * 50, req: x.req, emoji: x.emoji }))
}

const freelanceScript = defineScript('special.model.freelance', (g, choice) => {
  if (choice === 'cancel') return
  const gigs = yearlyList<Gig>(g, 'model.freelance', () => genFreelance(g))
  const idx = Number(choice)
  const gig = gigs[idx]
  if (!gig) return
  if (!useYearAction(g, 'model.freelance', 3)) return tell(g, 'Freelance Gigs', "You've done all the castings you can handle this year.", '\u{1F971}')
  gigs.splice(idx, 1)
  masterModeling(g)
  const score = marketability(g) + randInt(g, -15, 15) + (hasTalent(g, 'Modeling') ? 8 : 0)
  if (score < gig.req) {
    log(g, `I didn't book the ${gig.name.toLowerCase()} gig.`, 'bad')
    return say(g, 'Casting', pick(g, [`The casting director for the ${gig.name.toLowerCase()} said you weren't the look they wanted.`, `You showed up to the ${gig.name.toLowerCase()} casting and were told to "work on your angles".`, `You lost the ${gig.name.toLowerCase()} gig to someone's cousin.`]), gig.emoji, 'bad')
  }
  earnIncome(g, gig.pay)
  modelProfile(g).gigs += 1
  count(g, 'modelGigs')
  addStat(g, 'happiness', 4)
  if (chance(g, 0.3)) addFame(g, 1)
  log(g, `I booked a freelance modeling gig: ${gig.name.toLowerCase()}.`, 'good')
  say(g, 'Booked!', `You booked the ${gig.name.toLowerCase()} and earned ${money(gig.pay)}. ${pick(g, ['The photographer said you were a natural.', 'You held a pose for so long your leg fell asleep.', 'The client asked for your number for future work.'])}`, gig.emoji, 'good')
})

const freelanceAction: MenuAction = {
  type: 'action',
  id: 'model.freelance',
  label: 'Freelance Gigs',
  emoji: '\u{1F4F8}',
  subtitle: 'Audition for one-off modeling gigs',
  disabledReason: (g) => blocked(g, 16),
  run: (g) => {
    const gigs = yearlyList<Gig>(g, 'model.freelance', () => genFreelance(g))
    if (gigs.length === 0) return tell(g, 'Freelance Gigs', 'There are no more castings this year.', '\u{1F4F8}')
    scriptChoice(
      g,
      freelanceScript,
      'Freelance Gigs',
      'These clients are casting models. Which gig do you want to audition for?',
      [...gigs.map((x, i) => ({ id: String(i), label: `${x.name} · ${money(x.pay)}`, emoji: x.emoji })), { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' }],
      { emoji: '\u{1F4F8}' },
    )
  },
}

// ---------------------------------------------------------------------------
// Agencies

const agencyScript = defineScript('special.model.agency', (g, choice) => {
  if (choice === 'cancel') return
  const a = AGENCIES.find((x) => x.name === choice)
  if (!a) return
  if (!useYearAction(g, 'model.agencyApply', 2)) return tell(g, 'Agencies', "You've already sent your book to enough agencies this year.", '\u{1F971}')
  const c = g.character
  const p = modelProfile(g)
  masterModeling(g)
  if (p.headshot <= 0) return say(g, a.name, `${a.name} asked for your headshots. You don't have any. Get some taken first.`, '\u{1F4F7}', 'bad')
  if (p.rejectedBy.includes(a.name)) return say(g, a.name, `${a.name} already rejected you. Their receptionist recognized your face and locked the door.`, '\u{1F6AA}', 'bad')
  const looksOk = c.stats.looks + randInt(g, -5, 5) >= looksBar(g, a)
  const shotOk = p.headshot >= a.headshot
  const ageOk = c.age <= 38 - a.tier * 2 + (hasTalent(g, 'Modeling') ? 4 : 0)
  if (!looksOk || !shotOk || !ageOk) {
    if (!looksOk) p.rejectedBy.push(a.name)
    const why = !shotOk ? 'said your headshots were not up to their standards' : !ageOk ? 'said they are looking for "fresher faces"' : 'said you do not have the look they want'
    log(g, `${a.name} rejected me.`, 'bad')
    return say(g, a.name, `${a.name} ${why}.`, '\u{1F645}', 'bad')
  }
  const salary = a.retainer
  const { quit } = hire(g, { defId: 'model', title: RANKS[0], company: a.name, salary, data: { tier: a.tier, gigsThisYear: 0, sabotaged: 0 } })
  addFame(g, 1 + a.tier)
  addStat(g, 'happiness', 10)
  log(g, `I signed with the modeling agency ${a.name}.`, 'good')
  remember(g, `Signed with ${a.name} as a model.`)
  say(g, a.name, `${a.name} signed you as a New Face! Your retainer is ${money(salary)} a year, plus gigs.${quitNote(quit)}`, '\u{1F483}', 'good')
})

/** Modeling talent hint: the most prestigious agency you comfortably qualify for (no randomness). */
function bestAgency(g: GameState): string | null {
  const c = g.character
  const p = viewModel(g)
  const ok = AGENCIES.filter(
    (a) => !p.rejectedBy.includes(a.name) && c.stats.looks - 5 >= looksBar(g, a) && p.headshot >= a.headshot && c.age <= 38 - a.tier * 2 + (hasTalent(g, 'Modeling') ? 4 : 0),
  )
  return ok.length ? ok[ok.length - 1].name : null
}

const agencyAction: MenuAction = {
  type: 'action',
  id: 'model.agency',
  label: 'Join an Agency',
  emoji: '\u{1F3E2}',
  subtitle: 'Sign with a modeling agency',
  disabledReason: (g) => blocked(g, 18),
  confirm: (g) => (g.character.job ? `If an agency signs you, you'll quit your job as ${g.character.job.title}. Continue?` : null),
  run: (g) =>
    scriptChoice(
      g,
      agencyScript,
      'Modeling Agencies',
      'Which agency do you want to send your book to?',
      [
        ...AGENCIES.map((a) => ({
          id: a.name,
          label: `${a.name} ${'\u{2B50}'.repeat(a.tier + 1)} · wants Looks ${a.looks}%+`,
          emoji: '\u{1F3E2}',
          ...(a.name === bestAgency(g) ? withHint(talentHint(g, 'Modeling', 'The top agency that should sign you right now.')) : {}),
        })),
        { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' },
      ],
      { emoji: '\u{1F3E2}' },
    ),
}

// ---------------------------------------------------------------------------
// Agency work

const BOOKINGS: { id: string; label: string; emoji: string; minRank: number; mult: number; fame: number }[] = [
  { id: 'catalog', label: 'Catalog shoot', emoji: '\u{1F4D2}', minRank: 0, mult: 0.05, fame: 0 },
  { id: 'commercial', label: 'TV commercial', emoji: '\u{1F4FA}', minRank: 0, mult: 0.1, fame: 1 },
  { id: 'editorial', label: 'Magazine editorial', emoji: '\u{1F4F0}', minRank: 1, mult: 0.12, fame: 1 },
  { id: 'runway', label: 'Runway show', emoji: '\u{1F460}', minRank: 1, mult: 0.15, fame: 2 },
  { id: 'cover', label: 'Magazine cover', emoji: '\u{1F4F8}', minRank: 3, mult: 0.25, fame: 4 },
  { id: 'campaign', label: 'Luxury brand campaign', emoji: '\u{1F48E}', minRank: 3, mult: 0.4, fame: 5 },
]

const bookingScript = defineScript('special.model.booking', (g, choice) => {
  if (choice === 'cancel') return
  const job = modelJob(g)
  const b = BOOKINGS.find((x) => x.id === choice)
  if (!job || !b) return
  if (!useYearAction(g, 'model.booking', 3)) return tell(g, 'Bookings', 'Your agent says your calendar is full for the year.', '\u{1F4C5}')
  masterModeling(g)
  const score = marketability(g) + job.level * 4 + randInt(g, -20, 20) + (hasTalent(g, 'Modeling') ? 8 : 0)
  const pay = Math.round((job.salary * b.mult * (0.8 + rand(g) * 0.6)) / 50) * 50
  mdata(job).gigsThisYear += 1
  modelProfile(g).gigs += 1
  count(g, 'modelGigs')
  if (score >= 45) {
    earnIncome(g, pay)
    bump(job, randInt(g, 4, 9))
    addFame(g, b.fame)
    addStat(g, 'happiness', 5)
    log(g, `I modeled for a ${b.label.toLowerCase()}.`, 'good')
    say(g, b.label, `${pick(g, ['You nailed it.', 'The client was thrilled.', 'You owned every second of it.'])} ${pick(g, ['The photographer called you "the face of the season".', 'The designer hugged you afterwards.', 'You did not trip once. A personal best.'])} You earned ${money(pay)}.`, b.emoji, 'good')
  } else {
    earnIncome(g, Math.round(pay / 3))
    bump(job, -randInt(g, 3, 8))
    addStat(g, 'happiness', -4)
    log(g, `My ${b.label.toLowerCase()} didn't go well.`, 'bad')
    say(g, b.label, `${pick(g, ['You tripped on the runway in front of everyone.', 'The client said you looked "tired".', 'You and the stylist had a screaming match over a scarf.'])} You only got paid ${money(Math.round(pay / 3))}.`, b.emoji, 'bad')
  }
})

const PRACTICE = [
  { id: 'walk', label: 'Runway walk', emoji: '\u{1F460}' },
  { id: 'pose', label: 'Posing', emoji: '\u{1F933}' },
  { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' },
]

const practiceScript = defineScript('special.model.practice', (g, choice) => {
  if (choice === 'cancel') return
  if (!useYearAction(g, `model.practice.${choice}`, 1)) return tell(g, 'Practice', `You've already practiced your ${choice === 'walk' ? 'walk' : 'poses'} this year.`, '\u{1F971}')
  const gain = Math.round(randInt(g, 3, 7) * talentMult(g, 'Modeling', 1.6))
  masterModeling(g)
  setFlagSkill(g, 'modeling', flagSkill(g, 'modeling') + gain)
  const job = modelJob(g)
  if (job) bump(job, 3)
  log(g, choice === 'walk' ? 'I practiced my runway walk.' : 'I practiced posing.')
  say(
    g,
    'Practice',
    `${choice === 'walk' ? pick(g, ['You strutted up and down your hallway in heels for three hours.', 'You practiced turning on a dime without falling over.']) : pick(g, ['You practiced fourteen variations of looking mysteriously into the distance.', 'You mastered the art of smiling with your eyes.'])} Modeling skill: ${flagSkill(g, 'modeling')}%.`,
    '\u{1F483}',
    'good',
  )
})

const SABOTAGE = [
  { id: 'dye', label: "Swap a rival's shampoo with hair dye", emoji: '\u{1F9F4}' },
  { id: 'heels', label: "Hide a rival's heels before a show", emoji: '\u{1F460}' },
  { id: 'rumor', label: 'Spread a rumor about a rival', emoji: '\u{1F5E3}\u{FE0F}' },
  { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' },
]

const sabotageScript = defineScript('special.model.sabotage', (g, choice) => {
  if (choice === 'cancel') return
  const job = modelJob(g)
  if (!job) return
  if (!useYearAction(g, 'model.sabotage', 1)) return tell(g, 'Sabotage', 'Everyone is watching you too closely to try that again this year.', '\u{1F440}')
  const d = mdata(job)
  d.sabotaged += 1
  addHidden(g, 'karma', -8)
  count(g, 'sabotage')
  const caught = chance(g, 0.25 + d.sabotaged * 0.1)
  if (caught) {
    const agency = job.company
    if (chance(g, 0.5)) {
      leave(g, 'fired')
      log(g, `I was fired from ${agency} for sabotaging another model.`, 'bad')
      return say(g, 'Busted', `Security footage caught you sabotaging a rival. ${agency} fired you on the spot.`, '\u{1F6A8}', 'bad')
    }
    bump(job, -25)
    addFame(g, -2)
    log(g, 'I got caught sabotaging another model.', 'bad')
    return say(g, 'Busted', 'You were caught red-handed. The agency put you on probation and the tabloids had a field day.', '\u{1F6A8}', 'bad')
  }
  bump(job, randInt(g, 6, 12))
  const text =
    choice === 'dye'
      ? 'Your rival showed up to the shoot with bright green hair. The client gave you her spot.'
      : choice === 'heels'
        ? "Your rival walked the runway barefoot. You took over the closing look."
        : 'The rumor spread like wildfire. Your rival lost two bookings and you picked them up.'
  log(g, 'I sabotaged a rival model.', 'bad')
  say(g, 'Sabotage', `${text} Nobody suspects a thing... yet.`, '\u{1F608}')
})

const quitModel: MenuAction = {
  type: 'action',
  id: 'model.quit',
  label: 'Quit',
  emoji: '\u{1F6AA}',
  subtitle: 'Leave your agency',
  confirm: () => 'Quit modeling?',
  run: (g) => {
    const job = modelJob(g)
    if (!job) return
    const agency = job.company
    leave(g, 'quit')
    log(g, `I quit modeling at ${agency}.`)
    say(g, 'Quit Modeling', `You left ${agency} and retired from modeling. Your cheekbones will be remembered.`, '\u{1F6AA}')
  },
}

function wardrobeMenu(): MenuGroup {
  return {
    type: 'menu',
    id: 'model.wardrobe',
    label: 'Designer Clothes',
    emoji: '\u{1F457}',
    subtitle: (g) => `${viewModel(g).couture.length} couture outfit${viewModel(g).couture.length === 1 ? '' : 's'}`,
    children: (g): MenuNode[] => {
      const list = viewModel(g).couture
      if (list.length === 0) return [{ type: 'info', id: 'model.w.none', text: 'No couture yet. Designers gift outfits to elite models at Fashion Week.' }]
      return list.map((x, i) => ({ type: 'info' as const, id: `model.w.${i}`, text: x, emoji: '\u{1F457}' }))
    },
  }
}

export function modelJobNodes(g: GameState): MenuNode[] {
  const job = modelJob(g)
  if (!job) return []
  return [
    { type: 'info', id: 'model.status', emoji: '\u{1F483}', text: `${job.title} at ${job.company} · Performance ${job.performance}% · Modeling skill ${modelingSkill(g)}%` },
    {
      type: 'action',
      id: 'model.book',
      label: 'Book a Gig',
      emoji: '\u{1F4C5}',
      subtitle: 'Work a job your agency lined up',
      disabledReason: (gg) => blocked(gg, 0),
      run: (gg) => {
        const j = modelJob(gg)
        if (!j) return
        const options = BOOKINGS.filter((b) => b.minRank <= j.level)
        scriptChoice(gg, bookingScript, 'Bookings', 'Your agent has these jobs for you. Which one do you want?', [...options.map((b) => ({ id: b.id, label: b.label, emoji: b.emoji })), { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' }], {
          emoji: '\u{1F4C5}',
        })
      },
    },
    freelanceAction,
    {
      type: 'action',
      id: 'model.practice',
      label: 'Practice',
      emoji: '\u{1F460}',
      subtitle: 'Work on your walk and poses',
      disabledReason: (gg) => blocked(gg, 0),
      run: (gg) => scriptChoice(gg, practiceScript, 'Practice', 'What do you want to work on?', PRACTICE, { emoji: '\u{1F483}' }),
    },
    headshotAction,
    {
      type: 'action',
      id: 'model.sabotage',
      label: 'Sabotage',
      emoji: '\u{1F608}',
      subtitle: "Ruin a rival model's day",
      disabledReason: (gg) => blocked(gg, 0),
      run: (gg) => scriptChoice(gg, sabotageScript, 'Sabotage', 'How do you want to get ahead?', SABOTAGE, { emoji: '\u{1F608}' }),
    },
    wardrobeMenu(),
    quitModel,
  ]
}

export const modelCareerMenu: MenuGroup = {
  type: 'menu',
  id: 'special.model',
  label: 'Model',
  emoji: '\u{1F483}',
  subtitle: 'Strut your stuff on the runway',
  header: (g) => {
    const p = viewModel(g)
    return `Looks: ${g.character.stats.looks}% · Headshot: ${p.headshot > 0 ? `${p.headshot}%` : 'none'} · Modeling skill: ${modelingSkill(g)}%. Take modeling lessons under Activities → Mind & Body.`
  },
  children: (g): MenuNode[] => {
    if (modelJob(g)) return [{ type: 'info', id: 'model.already', text: 'You are already signed with an agency. Manage your career from your job.', emoji: '\u{1F483}' }]
    return [headshotAction, freelanceAction, agencyAction, wardrobeMenu()]
  },
}

// ---------------------------------------------------------------------------
// Yearly

const coutureScript = defineScript('special.model.couture', (g, choice, data) => {
  const item = String((data as { item?: string } | undefined)?.item ?? COUTURE[0])
  if (choice === 'accept') {
    modelProfile(g).couture.push(item)
    count(g, 'couture')
    log(g, `A designer gifted me a ${item}.`, 'good')
    say(g, 'Couture Gift', `You accepted the ${item}. It's now the most expensive thing in your closet.`, '\u{1F457}', 'good')
  } else {
    addHidden(g, 'karma', 1)
    say(g, 'Couture Gift', `You politely declined the ${item}. The designer was baffled.`, '\u{1F457}')
  }
})

const fashionWeekScript = defineScript('special.model.fashionWeek', (g, choice, data) => {
  const city = String((data as { city?: string } | undefined)?.city ?? 'Paris')
  const job = modelJob(g)
  if (!job) return
  if (choice === 'skip') return say(g, 'Fashion Week', `You skipped ${city} Fashion Week. The designers took it personally.`, '\u{1F460}')
  const p = modelProfile(g)
  p.fashionWeeks += 1
  count(g, 'fashionWeeks')
  const score = marketability(g) + randInt(g, -15, 20) + (hasTalent(g, 'Modeling') ? 8 : 0)
  const pay = Math.round((job.salary * 0.3 * (0.8 + rand(g) * 0.5)) / 100) * 100
  if (score >= 55) {
    earnIncome(g, pay)
    addFame(g, randInt(g, 3, 6))
    bump(job, 10)
    addStat(g, 'happiness', 10)
    log(g, `I walked for ${choice} at ${city} Fashion Week.`, 'good')
    say(g, 'Fashion Week', `You walked for ${choice} at ${city} Fashion Week and closed the show! You earned ${money(pay)}.`, '\u{1F460}', 'good')
    const owned = p.couture
    const options = COUTURE.filter((x) => !owned.includes(x))
    if (options.length > 0 && chance(g, 0.6)) {
      const item = pick(g, options)
      scriptChoice(
        g,
        coutureScript,
        'Couture Gift',
        `${choice} was so impressed that they want to gift you their ${item}.`,
        [
          { id: 'accept', label: 'Accept it', emoji: '\u{1F381}' },
          { id: 'decline', label: 'Decline', emoji: '\u{274C}' },
        ],
        { emoji: '\u{1F457}', data: { item } },
      )
    }
  } else {
    earnIncome(g, Math.round(pay / 2))
    addFame(g, 1)
    bump(job, -5)
    log(g, `I stumbled at ${city} Fashion Week.`, 'bad')
    say(g, 'Fashion Week', `You walked for ${choice} at ${city} Fashion Week, but ${pick(g, ['your heel snapped halfway down the runway', 'you went the wrong way at the end of the runway', 'you sneezed during the finale'])}. You earned ${money(Math.round(pay / 2))}.`, '\u{1F460}', 'bad')
  }
})

// Modeling talent: agencies come looking for you.
const scoutScript = defineScript('special.model.scout', (g, choice, data) => {
  const a = AGENCIES.find((x) => x.name === String((data as { agency?: string } | undefined)?.agency ?? ''))
  if (!a || modelJob(g)) return
  if (choice !== 'accept') {
    const no = scoutDeclines(g) + 1
    g.flags[SCOUT_DECLINES] = no
    log(g, `I turned down a scout from ${a.name}.`)
    return say(
      g,
      a.name,
      no >= MAX_SCOUT_DECLINES
        ? `You told the ${a.name} scout you weren't interested. Word gets around: the agencies have stopped asking. You can still send them your book from Special Careers.`
        : `You told the ${a.name} scout you weren't interested. They left their card anyway, "in case you change your mind".`,
      '\u{1F483}',
    )
  }
  const blockedWhy = blocked(g, 18)
  if (blockedWhy) return tell(g, a.name, blockedWhy, '\u{1F483}')
  const p = modelProfile(g)
  // The agency shoots your book for you.
  p.headshot = Math.max(p.headshot, a.headshot)
  p.headshotAge = g.character.age
  const { quit } = hire(g, { defId: 'model', title: RANKS[0], company: a.name, salary: a.retainer, data: { tier: a.tier, gigsThisYear: 0, sabotaged: 0 } })
  addFame(g, 1 + a.tier)
  addStat(g, 'happiness', 12)
  log(g, `A scout from ${a.name} discovered me and signed me as a model.`, 'good')
  remember(g, `Discovered by a scout from ${a.name}.`)
  say(g, a.name, `${a.name} signed you as a New Face and shot your portfolio on their dime. Your retainer is ${money(a.retainer)} a year, plus gigs.${quitNote(quit)}`, '\u{1F483}', 'good')
})

/** After this many "no thanks", scouts stop asking (the agency door stays open). */
const MAX_SCOUT_DECLINES = 2
const SCOUT_DECLINES = 'special.model.scoutDeclines'

function scoutDeclines(g: GameState): number {
  const v = g.flags[SCOUT_DECLINES]
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

const SCOUT_SPOTS = ['at the mall', 'at a coffee shop', 'on the train', 'at a music festival', 'at the airport', 'while you were crossing the street']

function maybeScouted(g: GameState): void {
  const c = g.character
  if (!hasTalent(g, 'Modeling') || c.prison || c.age < 18 || c.age > 32 || modelJob(g) || scoutDeclines(g) >= MAX_SCOUT_DECLINES) return
  // Scouts don't poach people out of other special careers or the military.
  if (c.job && (c.job.category === 'special' || c.job.category === 'military')) return
  if (g.queue.some((m) => m.kind === 'choice' && m.scriptId === scoutScript)) return
  const p = viewModel(g)
  const options = AGENCIES.filter((a) => !p.rejectedBy.includes(a.name) && c.stats.looks + 5 >= looksBar(g, a) && c.age <= 38 - a.tier * 2 + 4)
  if (options.length === 0 || !chance(g, 0.3)) return
  const a = options[options.length - 1]
  scriptChoice(
    g,
    scoutScript,
    'Scouted!',
    `A scout from ${a.name} ${'\u{2B50}'.repeat(a.tier + 1)} stopped you ${pick(g, SCOUT_SPOTS)} and handed you a business card. They want to sign you on the spot: ${money(a.retainer)} a year to start.${c.job ? ` You'd have to quit your job as ${c.job.title}.` : ''}`,
    [
      { id: 'accept', label: 'Sign with them', emoji: '\u{270D}\u{FE0F}' },
      { id: 'decline', label: 'Not interested', emoji: '\u{274C}' },
    ],
    { emoji: '\u{1F483}', data: { agency: a.name } },
  )
}

export function yearlyModel(g: GameState): void {
  const c = g.character
  if (!c.alive || !claimYearly(g, 'model')) return
  if (c.alive) maybeScouted(g)
  const job = modelJob(g)
  if (!job || c.prison) return
  syncTenure(g, job)
  const d = mdata(job)
  const agency = AGENCIES.find((a) => a.name === job.company) ?? AGENCIES[d.tier] ?? AGENCIES[0]
  earnIncome(g, job.salary)
  bump(job, (c.stats.looks - 60) / 10 + (d.gigsThisYear > 0 ? 3 : -4) + randInt(g, -5, 5))
  d.gigsThisYear = 0
  fameToward(g, [8, 15, 28, 45, 75][job.level] ?? 10, 3)

  // Dropped when your look no longer fits the agency.
  if (c.stats.looks < looksBar(g, agency) - 15 || job.performance < 15 || (c.age > 45 && chance(g, hasTalent(g, 'Modeling') ? 0.1 : 0.2))) {
    leave(g, 'fired')
    log(g, `${agency.name} dropped me.`, 'bad')
    say(g, 'Dropped', `${agency.name} let you go. ${c.age > 40 ? 'They said they want "younger faces", which is rude.' : 'They said your bookings dried up.'}`, '\u{1F4C9}', 'bad')
    return
  }

  const next = job.level + 1
  const gifted = hasTalent(g, 'Modeling')
  if (next < RANKS.length && job.yearsInRole >= 1 && job.performance >= (gifted ? 58 : 65) && c.stats.looks >= 55 + next * 7 - (gifted ? 6 : 0) && (next < 4 || fameOf(g) >= (gifted ? 32 : 40)) && chance(g, gifted ? 0.7 : 0.55)) {
    promote(g, job, RANKS[next], agency.retainer * RANK_MULT[next], next)
    log(g, `I was promoted to ${RANKS[next]} at ${agency.name}.`, 'good')
    remember(g, `Became a ${RANKS[next]}.`)
    say(g, 'Promotion', `${agency.name} promoted you to ${RANKS[next]}! Your retainer is now ${money(job.salary)}.`, '\u{1F483}', 'good')
  }

  if (job.level >= 3 && chance(g, 0.7)) {
    const city = pick(g, FASHION_CITIES)
    const designers = shuffle(g, DESIGNERS).slice(0, 3)
    scriptChoice(
      g,
      fashionWeekScript,
      `${city} Fashion Week`,
      `You've been invited to walk at ${city} Fashion Week! Which designer do you want to walk for?`,
      [...designers.map((x) => ({ id: x, label: x, emoji: '\u{1F457}' })), { id: 'skip', label: 'Skip it', emoji: '\u{274C}' }],
      { emoji: '\u{1F460}', data: { city } as unknown as Json },
    )
  }
}
