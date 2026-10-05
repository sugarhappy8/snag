// Special career: Actor. Take acting classes, hire a talent agent, audition for film and TV
// roles (extra -> supporting -> lead), develop your character, deal with co-stars, stage
// publicity stunts, win awards and collect residuals for the rest of your life.
import { addHidden, addRelationship, addStat, count, earnIncome, fullName, getPerson, log, remember, scriptChoice, useYearAction } from '../core'
import { chance, pick, rand, randInt } from '../rng'
import { defineScript } from '../scripts'
import type { GameState, Job, Json, MenuAction, MenuGroup, MenuNode } from '../types'
import { randomFirstName, randomLastName } from '../world'
import { actingSkill, addColleague, addFame, blocked, clamp100, dropList, fameOf, fameToward, hire, leave, money, myJob, peek, prof, quitNote, say, setFlagSkill, setRole, short, syncTenure, talentMatches, tell, view, yearlyList } from './common'

type Role = 'Extra' | 'Supporting' | 'Lead'
type Kind = 'film' | 'tv'

interface Credit {
  title: string
  kind: Kind
  role: Role
  genre: string
  age: number
  pay: number
  quality: number
  popularity: number
  seasons: number
  verdict: string
  /** Yearly residual check (decays). */
  residual: number
}

interface Agent {
  name: string
  firm: string
  quality: number
  cut: number
}

interface ActorProfile {
  reputation: number
  credits: Credit[]
  awards: string[]
  nominations: number
  agent: Agent | null
  dryYears: number
}

interface Project {
  title: string
  kind: Kind
  genre: string
  role: Role
  studio: string
  pay: number
  budget: string
  developed: number
  buzz: number
  season: number
  costars: string[]
}

interface ActorJobData {
  project: Project | null
}

interface Listing {
  title: string
  kind: Kind
  genre: string
  role: Role
  studio: string
  pay: number
  budget: string
}

const initActor = (): ActorProfile => ({
  reputation: 50,
  credits: [],
  awards: [],
  nominations: 0,
  agent: null,
  dryYears: 0,
})

function actorProfile(g: GameState): ActorProfile {
  return prof(g, 'actor', initActor)
}

function viewActor(g: GameState): ActorProfile {
  return peek<ActorProfile>(g, 'actor') ?? initActor()
}

export function actorJob(g: GameState): Job | null {
  return myJob(g, 'actor')
}

function project(job: Job): Project | null {
  return view<ActorJobData>(job.data).project ?? null
}

function actorWord(g: GameState): string {
  return g.character.gender === 'female' ? 'Actress' : 'Actor'
}

function roleTitle(g: GameState, role: Role, kind: Kind): string {
  if (role === 'Extra') return 'Extra'
  if (role === 'Supporting') return `Supporting ${actorWord(g)}`
  if (fameOf(g) >= 70) return kind === 'film' ? 'Movie Star' : 'TV Star'
  return `Lead ${actorWord(g)}`
}

// ---------------------------------------------------------------------------
// Role listings

const ADJ = ['Midnight', 'Silent', 'Broken', 'Golden', 'Last', 'Crimson', 'Electric', 'Hidden', 'Savage', 'Lonely', 'Infinite', 'Velvet', 'Frozen', 'Burning', 'Wild', 'Lucky']
const NOUN = ['Horizon', 'Protocol', 'Kingdom', 'Summer', 'Heist', 'Echo', 'Paradise', 'Witness', 'Storm', 'Frontier', 'Promise', 'Shadows', 'Highway', 'Empire', 'Detour', 'Reunion']
const FILM_GENRES = ['Action', 'Comedy', 'Drama', 'Horror', 'Romance', 'Sci-Fi', 'Thriller', 'Animated', 'Superhero', 'Musical']
const TV_GENRES = ['Sitcom', 'Crime Drama', 'Medical Drama', 'Fantasy Series', 'Soap Opera', 'Sci-Fi Series', 'Teen Drama']
const STUDIOS = ['Paragon Pictures', 'Silverline Studios', 'Big Sky Films', 'Moonlit Entertainment', 'Redwood Studios', 'Golden Hour Films', 'Starling Bros.']
const NETWORKS = ['Channel Nine Network', 'StreamBox Originals', 'Nightcap TV', 'Prime Eight', 'Couchside Studios', 'Bingeworthy+']
const LATIN = ['mx', 'co', 'ar', 'cl', 'pe', 've', 'br']

function genTitle(g: GameState, genre: string): string {
  if (genre === 'Sitcom') return `${pick(g, ['Everybody Loves', 'Living With', 'Raising', 'Meet'])} ${randomFirstName(g, g.character.countryId, chance(g, 0.5) ? 'male' : 'female')}`
  if (genre === 'Telenovela') return pick(g, ['Corazón de Fuego', 'Amor Prohibido', 'La Herencia', 'Lágrimas de Oro', 'Destino Cruel', 'El Secreto de Isabela'])
  if (genre === 'Bollywood') return pick(g, ['Dil Ki Dhadkan', 'Pyaar Ka Safar', 'Monsoon Wedding Bells', 'Raja Rani', 'Sapno Ki Rani'])
  const base = `${chance(g, 0.4) ? 'The ' : ''}${pick(g, ADJ)} ${pick(g, NOUN)}`
  return chance(g, 0.12) ? `${base} ${randInt(g, 2, 4)}` : base
}

function genListings(g: GameState): Listing[] {
  const p = actorProfile(g)
  const f = fameOf(g)
  const hadSupporting = p.credits.some((x) => x.role !== 'Extra')
  const hadLead = p.credits.some((x) => x.role === 'Lead')
  const agentQ = p.agent?.quality ?? 0
  const n = p.agent ? 6 : 4
  const out: Listing[] = []
  for (let i = 0; i < n; i++) {
    let role: Role = 'Extra'
    const r = rand(g) + agentQ / 250
    if ((hadSupporting || f >= 40) && r > 0.7) role = 'Lead'
    else if ((p.credits.length > 0 || actingSkill(g) >= 45 || f >= 25) && r > 0.35) role = 'Supporting'
    if (role === 'Lead' && !hadSupporting && !hadLead && f < 40) role = 'Supporting'
    const kind: Kind = chance(g, 0.6) ? 'film' : 'tv'
    let genre = kind === 'film' ? pick(g, FILM_GENRES) : pick(g, TV_GENRES)
    if (g.character.countryId === 'in' && kind === 'film' && chance(g, 0.5)) genre = 'Bollywood'
    if (LATIN.includes(g.character.countryId) && kind === 'tv' && chance(g, 0.5)) genre = 'Telenovela'
    const budget = kind === 'film' ? pick(g, ['indie', 'studio', 'studio', 'blockbuster']) : pick(g, ['cable', 'network', 'streaming'])
    const budgetMult = budget === 'blockbuster' ? 2 : budget === 'indie' || budget === 'cable' ? 0.6 : 1
    let pay: number
    if (role === 'Extra') pay = randInt(g, 3, 30) * 100
    else if (role === 'Supporting') pay = Math.round((randInt(g, 15, 200) * 1_000 * (1 + f / 25) * budgetMult) / 1_000) * 1_000
    else pay = Math.round((randInt(g, 80, 1_000) * 1_000 * (1 + (f * f) / 400) * budgetMult) / 1_000) * 1_000
    out.push({ title: genTitle(g, genre), kind, genre, role, studio: kind === 'film' ? pick(g, STUDIOS) : pick(g, NETWORKS), pay, budget })
  }
  return out
}

const APPROACHES = [
  { id: 'intense', label: 'Play it intense', emoji: '\u{1F624}' },
  { id: 'comedic', label: 'Play it for laughs', emoji: '\u{1F602}' },
  { id: 'heartfelt', label: 'Play it heartfelt', emoji: '\u{1F97A}' },
  { id: 'understated', label: 'Keep it understated', emoji: '\u{1F610}' },
  { id: 'overTop', label: 'Go wildly over the top', emoji: '\u{1F92A}' },
]

const FIT: Record<string, string> = {
  Action: 'intense',
  Comedy: 'comedic',
  Sitcom: 'comedic',
  Drama: 'heartfelt',
  'Medical Drama': 'heartfelt',
  'Crime Drama': 'understated',
  'Teen Drama': 'heartfelt',
  Horror: 'intense',
  Romance: 'heartfelt',
  'Soap Opera': 'overTop',
  Telenovela: 'overTop',
  'Sci-Fi': 'understated',
  'Sci-Fi Series': 'understated',
  'Fantasy Series': 'intense',
  Thriller: 'understated',
  Animated: 'overTop',
  Superhero: 'intense',
  Musical: 'overTop',
  Bollywood: 'overTop',
}

const auditionScript = defineScript('special.actor.audition', (g, choice, data) => {
  const l = data as unknown as Listing
  const c = g.character
  const p = actorProfile(g)
  const difficulty = l.role === 'Lead' ? 45 : l.role === 'Supporting' ? 25 : 0
  let fit = 0
  if (choice === FIT[l.genre]) fit = 20
  else if (choice === 'overTop') fit = randInt(g, -15, 25)
  const score =
    actingSkill(g) * 0.5 + (talentMatches(g, /act/i) ? 15 : 0) + c.stats.looks * (l.role === 'Lead' ? 0.25 : 0.1) + p.reputation * 0.1 + (p.agent?.quality ?? 0) * 0.1 + fameOf(g) * 0.15 + fit + randInt(g, -15, 15) - difficulty
  if (score < 30) {
    p.reputation = clamp100(p.reputation - 1)
    log(g, `I auditioned for ${l.title} but didn't get the part.`, 'bad')
    return say(
      g,
      'Audition',
      pick(g, [
        `The casting director for "${l.title}" thanked you for your time and said they were "going in a different direction".`,
        `You auditioned for "${l.title}". Halfway through your monologue, the director started checking emails.`,
        `You didn't get the part in "${l.title}". They cast someone with a famous parent instead.`,
        `You forgot your lines at the "${l.title}" audition and tried to improvise. It did not work.`,
      ]),
      '\u{1F3AD}',
      'bad',
    )
  }
  landRole(g, l)
})

const pickRoleScript = defineScript('special.actor.pick', (g, choice) => {
  if (choice === 'cancel') return
  const listings = yearlyList<Listing>(g, 'actor.roles', () => genListings(g))
  const idx = Number(choice)
  const l = listings[idx]
  if (!l) return
  const limit = actorProfile(g).agent ? 5 : 3
  if (!useYearAction(g, 'actor.audition', limit)) return tell(g, 'Auditions', "You've been to so many auditions this year that casting directors recognize your headshot as a warning sign. Try again next year.", '\u{1F971}')
  listings.splice(idx, 1)
  scriptChoice(
    g,
    auditionScript,
    `Audition: ${l.title}`,
    `The casting director hands you a scene from "${l.title}" (${l.genre}). How do you play it?`,
    APPROACHES,
    { emoji: '\u{1F3AC}', data: l as unknown as Json },
  )
})

function openAuditions(g: GameState): void {
  const job = actorJob(g)
  if (job && project(job)) return tell(g, 'Auditions', `You're already committed to "${project(job)?.title}". Finish it first.`, '\u{1F3AC}')
  const listings = yearlyList<Listing>(g, 'actor.roles', () => genListings(g))
  if (listings.length === 0) return tell(g, 'Auditions', 'There are no more roles you are right for this year. Your agent says to "stay hungry".', '\u{1F3AC}')
  scriptChoice(
    g,
    pickRoleScript,
    'Auditions',
    'These roles are casting right now. Which one do you want to audition for?',
    [
      ...listings.map((l, i) => ({
        id: String(i),
        label: `${l.role === 'Extra' ? 'Extra' : l.role === 'Supporting' ? 'Supporting role' : 'Lead role'} · "${l.title}" (${l.genre} ${l.kind === 'film' ? 'film' : 'series'}) · ${short(l.pay)}${l.kind === 'tv' ? '/season' : ''}`,
        emoji: l.kind === 'film' ? '\u{1F3AC}' : '\u{1F4FA}',
      })),
      { id: 'cancel', label: 'Not now', emoji: '\u{274C}' },
    ],
    { emoji: '\u{1F3AD}' },
  )
}

function landRole(g: GameState, l: Listing): void {
  const title = roleTitle(g, l.role, l.kind)
  const proj: Project = { title: l.title, kind: l.kind, genre: l.genre, role: l.role, studio: l.studio, pay: l.pay, budget: l.budget, developed: 0, buzz: 0, season: 1, costars: [] }
  let job = actorJob(g)
  let quit: string | null = null
  if (!job) {
    const hired = hire(g, { defId: 'actor', title, company: l.studio, salary: l.pay, data: { project: proj as unknown as Json } })
    job = hired.job
    quit = hired.quit
  } else {
    view<ActorJobData>(job.data).project = proj
    job.company = l.studio
    setRole(g, job, title, l.pay, l.role === 'Lead' ? 2 : l.role === 'Supporting' ? 1 : 0)
  }
  if (l.role !== 'Extra') {
    const costarCount = randInt(g, 1, 2)
    for (let i = 0; i < costarCount; i++) {
      const p = addColleague(g, l.studio, chance(g, 0.5) ? 'Actor' : 'Actress', { ageOffset: [-12, 15], relationship: randInt(g, 35, 65) })
      p.occupation = p.gender === 'female' ? 'Actress' : 'Actor'
      p.money = randInt(g, 50, 5_000) * 1_000
      if (chance(g, 0.35)) p.traits = ['arrogant', ...p.traits].slice(0, 3)
      p.data.costarOf = l.title
      proj.costars.push(p.id)
    }
  }
  const p = actorProfile(g)
  p.dryYears = 0
  dropList(g, 'actor.roles')
  addStat(g, 'happiness', l.role === 'Lead' ? 15 : 8)
  if (l.role !== 'Extra') addFame(g, l.role === 'Lead' ? 3 : 1)
  if (l.genre === 'Animated' && l.role === 'Extra') g.flags['special.actor.zombie'] = true
  log(g, `I was cast as ${l.role === 'Extra' ? 'an extra' : l.role === 'Lead' ? 'the lead' : 'a supporting character'} in "${l.title}".`, 'good')
  remember(g, `Cast in "${l.title}" (${l.genre}, ${l.role.toLowerCase()} role).`)
  const flavor =
    l.role === 'Extra'
      ? pick(g, ['You\'ll be "Person in Background #4". Try not to look at the camera.', 'You\'ll be playing "Zombie #17". Method acting starts now.', 'Your big moment: walking past the main character holding a coffee.'])
      : l.role === 'Lead'
        ? pick(g, ['Your name goes above the title!', 'The director says the role was made for you.', 'Your face is going on every bus in the city.'])
        : pick(g, ['It\'s a meaty part with real lines.', 'You get to steal at least two scenes.', 'Your character dies dramatically in act three. Perfect.'])
  say(g, 'You Got the Part!', `You were cast as ${l.role === 'Extra' ? 'an extra' : l.role === 'Lead' ? 'the lead' : 'a supporting character'} in "${l.title}", a ${l.genre.toLowerCase()} ${l.kind === 'film' ? 'film' : 'series'} from ${l.studio}. You'll be paid ${money(l.pay)}${l.kind === 'tv' ? ' per season' : ''}. ${flavor}${quitNote(quit)}`, '\u{1F3AC}', 'good')
}

// ---------------------------------------------------------------------------
// Agents

interface AgentOffer {
  name: string
  firm: string
  quality: number
  cut: number
}

const FIRMS = ['Starlight Talent', 'Apex Artists Agency', 'Bluebird Management', 'Velvet Rope Talent', 'Marquee Partners', 'Spotlight & Co.', 'Hollow Hill Agency']

const agentScript = defineScript('special.actor.agent', (g, choice, data) => {
  if (choice === 'cancel') return
  const offers = data as unknown as AgentOffer[]
  const a = offers[Number(choice)]
  if (!a) return
  const p = actorProfile(g)
  const pull = actingSkill(g) * 0.4 + fameOf(g) * 0.6 + p.credits.length * 5 + randInt(g, 0, 30)
  if (pull < a.quality * 0.8) {
    return say(g, 'Talent Agent', `${a.name} from ${a.firm} looked at your résumé and said, "Call me when you've done something." Then hung up.`, '\u{1F574}\u{FE0F}', 'bad')
  }
  p.agent = { ...a }
  dropList(g, 'actor.roles')
  log(g, `I hired ${a.name} from ${a.firm} as my talent agent.`, 'good')
  say(g, 'Talent Agent', `${a.name} from ${a.firm} agreed to represent you for ${Math.round(a.cut * 100)}% of your earnings. Expect better auditions.`, '\u{1F574}\u{FE0F}', 'good')
})

const hireAgentAction: MenuAction = {
  type: 'action',
  id: 'actor.agent.hire',
  label: 'Hire an Agent',
  emoji: '\u{1F574}\u{FE0F}',
  subtitle: 'Find a talent agent to land better roles',
  visible: (g) => !viewActor(g).agent,
  disabledReason: (g) => blocked(g, 16),
  run: (g) => {
    if (!useYearAction(g, 'actor.agentSearch', 2)) return tell(g, 'Talent Agent', "No agents are returning your calls this year.", '\u{1F574}\u{FE0F}')
    const offers: AgentOffer[] = [0, 1, 2].map(() => {
      const quality = randInt(g, 25, 95)
      const gender = chance(g, 0.5) ? 'male' : 'female'
      return {
        name: `${randomFirstName(g, g.character.countryId, gender)} ${randomLastName(g, g.character.countryId)}`,
        firm: pick(g, FIRMS),
        quality,
        cut: Math.round((0.08 + quality / 900 + rand(g) * 0.03) * 100) / 100,
      }
    })
    scriptChoice(
      g,
      agentScript,
      'Talent Agents',
      'Which agent do you want to pitch yourself to?',
      [...offers.map((o, i) => ({ id: String(i), label: `${o.name}, ${o.firm} · ${'\u{2B50}'.repeat(Math.max(1, Math.round(o.quality / 20)))} · ${Math.round(o.cut * 100)}% cut`, emoji: '\u{1F574}\u{FE0F}' })), { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' }],
      { emoji: '\u{1F574}\u{FE0F}', data: offers as unknown as Json },
    )
  },
}

const fireAgentAction: MenuAction = {
  type: 'action',
  id: 'actor.agent.fire',
  label: 'Fire Your Agent',
  emoji: '\u{1F525}',
  subtitle: (g) => {
    const a = viewActor(g).agent
    return a ? `${a.name}, ${a.firm} (${Math.round(a.cut * 100)}% cut)` : ''
  },
  visible: (g) => !!viewActor(g).agent,
  confirm: () => 'Fire your talent agent?',
  run: (g) => {
    const p = actorProfile(g)
    if (!p.agent) return
    const name = p.agent.name
    p.agent = null
    dropList(g, 'actor.roles')
    log(g, `I fired my agent, ${name}.`)
    say(g, 'Talent Agent', `You fired ${name}. They said you'd never work in this town again, which is what they say to everyone.`, '\u{1F525}')
  },
}

// ---------------------------------------------------------------------------
// Practice, classes, set life

const practiceAction: MenuAction = {
  type: 'action',
  id: 'actor.practice',
  label: 'Practice',
  emoji: '\u{1F4D6}',
  subtitle: (g) => `Hone your craft · Acting skill ${actingSkill(g)}%`,
  disabledReason: (g) => blocked(g, 0),
  run: (g) => {
    if (!useYearAction(g, 'actor.practice', 2)) return tell(g, 'Practice', "You've rehearsed so much this year that you're starting to talk in monologues. Take a break.", '\u{1F971}')
    const gain = randInt(g, 2, 6) + (talentMatches(g, /act|drama|theat/i) ? 2 : 0)
    setFlagSkill(g, 'acting', actingSkill(g) + gain)
    log(g, 'I practiced my acting.')
    say(g, 'Practice', `${pick(g, ['You ran lines in front of the bathroom mirror for hours.', 'You studied old movies and copied every facial expression.', 'You practiced accents until your neighbors complained.'])} Your acting skill rose to ${actingSkill(g)}%.`, '\u{1F4D6}', 'good')
  },
}

const developAction: MenuAction = {
  type: 'action',
  id: 'actor.develop',
  label: 'Develop Character',
  emoji: '\u{1F9E0}',
  subtitle: 'Prepare for your current role',
  visible: (g) => !!(actorJob(g) && project(actorJob(g)!)),
  disabledReason: (g) => blocked(g, 0),
  run: (g) => {
    const job = actorJob(g)
    const proj = job && project(job)
    if (!job || !proj) return
    if (!useYearAction(g, 'actor.develop', 1)) return tell(g, 'Develop Character', "You're already living and breathing this character. Any more and you'll forget who you are.", '\u{1F9E0}')
    proj.developed += randInt(g, 8, 15)
    job.performance = clamp100(job.performance + 8)
    log(g, `I prepared intensely for my role in "${proj.title}".`)
    say(
      g,
      'Develop Character',
      pick(g, [
        `You stayed in character for an entire month to prepare for "${proj.title}". Your family wants their old you back.`,
        `You wrote a 40-page backstory for your character in "${proj.title}". The director was impressed.`,
        `You shadowed a real-life professional to research your role in "${proj.title}".`,
      ]),
      '\u{1F9E0}',
      'good',
    )
  },
}

const costarsAction: MenuAction = {
  type: 'action',
  id: 'actor.costars',
  label: 'Co-Stars',
  emoji: '\u{1F465}',
  subtitle: 'Hang out with your co-stars',
  visible: (g) => {
    const job = actorJob(g)
    const proj = job && project(job)
    return !!proj && proj.costars.some((id) => !!getPerson(g, id))
  },
  disabledReason: (g) => blocked(g, 0),
  run: (g) => {
    const job = actorJob(g)
    const proj = job && project(job)
    if (!job || !proj) return
    if (!useYearAction(g, 'actor.costars', 1)) return tell(g, 'Co-Stars', 'Your co-stars are busy running lines without you.', '\u{1F465}')
    const people = proj.costars.map((id) => getPerson(g, id)).filter((x) => !!x && x.alive)
    const co = people.length ? pick(g, people) : undefined
    if (!co) return
    const conceited = co.traits.includes('arrogant') || co.traits.includes('manipulative')
    const roll = rand(g)
    let text: string
    if (conceited && roll < 0.6) {
      addRelationship(co, -randInt(g, 5, 15))
      addStat(g, 'happiness', -4)
      text = pick(g, [
        `${fullName(co)} spent the whole evening talking about their skincare routine and calling you "the new kid".`,
        `${fullName(co)} demanded you not make eye contact with them between takes.`,
        `${fullName(co)} asked the director to cut your best scene.`,
      ])
    } else if (roll < 0.15) {
      addRelationship(co, -10)
      text = `You and ${fullName(co)} argued about who gets the better trailer. The crew picked sides.`
    } else {
      addRelationship(co, randInt(g, 8, 18))
      proj.buzz += 3
      addStat(g, 'happiness', 5)
      text = pick(g, [
        `You and ${fullName(co)} grabbed dinner after shooting. The on-screen chemistry is real now.`,
        `${fullName(co)} taught you a trick for crying on cue. You taught them a card trick.`,
        `You and ${fullName(co)} pranked the director together. Best day on set yet.`,
      ])
      if (chance(g, 0.15)) {
        text += ` ${co.firstName} was nervous about a big scene, so you comforted them.`
        g.flags['special.actor.comforted'] = true
      }
    }
    log(g, `I hung out with my co-star ${co.firstName}.`)
    say(g, 'Co-Stars', text, '\u{1F465}')
  },
}

const stuntAction: MenuAction = {
  type: 'action',
  id: 'actor.stunt',
  label: 'Publicity Stunt',
  emoji: '\u{1F4E2}',
  subtitle: 'Promote your current project',
  visible: (g) => !!(actorJob(g) && project(actorJob(g)!)),
  disabledReason: (g) => blocked(g, 0),
  run: (g) => {
    const job = actorJob(g)
    const proj = job && project(job)
    if (!job || !proj) return
    if (!useYearAction(g, 'actor.stunt', 1)) return tell(g, 'Publicity Stunt', 'The studio asked you to please stop doing publicity stunts.', '\u{1F4E2}')
    const ok = chance(g, 0.55 + g.character.hidden.craziness / 400)
    if (ok) {
      proj.buzz += randInt(g, 8, 15)
      addFame(g, randInt(g, 1, 3))
      log(g, `I pulled a publicity stunt for "${proj.title}".`, 'good')
      say(
        g,
        'Publicity Stunt',
        pick(g, [
          `You showed up to the "${proj.title}" press tour in full costume and refused to break character. The buzz is enormous.`,
          `You "leaked" a fake behind-the-scenes feud. Everyone is talking about "${proj.title}".`,
          `You skydived into the "${proj.title}" premiere. People will definitely watch it now.`,
        ]),
        '\u{1F4E2}',
        'good',
      )
    } else {
      proj.buzz -= 5
      addHidden(g, 'notoriety', 2)
      log(g, `My publicity stunt for "${proj.title}" backfired.`, 'bad')
      say(g, 'Publicity Stunt', pick(g, [`Your stunt for "${proj.title}" was called "desperate" by every critic in the country.`, `You tried to set a world record at the "${proj.title}" premiere and fell off the stage.`]), '\u{1F4E2}', 'bad')
    }
  },
}

const quitAction: MenuAction = {
  type: 'action',
  id: 'actor.quit',
  label: 'Quit Acting',
  emoji: '\u{1F6AA}',
  subtitle: 'Walk away from show business',
  confirm: (g) => {
    const job = actorJob(g)
    const proj = job && project(job)
    return proj ? `Walk off "${proj.title}" and quit acting? The studio won't be happy.` : 'Quit acting?'
  },
  run: (g) => {
    const job = actorJob(g)
    if (!job) return
    const proj = project(job)
    if (proj) {
      const p = actorProfile(g)
      p.reputation = clamp100(p.reputation - 15)
      addFame(g, -3)
    }
    if (proj) removeCostars(g, proj)
    if (job.title === 'Extra') job.title = actorWord(g)
    leave(g, 'quit')
    log(g, 'I quit acting.')
    say(g, 'Retired from Acting', proj ? `You walked off the set of "${proj.title}" and quit acting. The tabloids are calling it a meltdown.` : 'You hung up your headshots and quit acting.', '\u{1F6AA}')
  },
}

function removeCostars(g: GameState, proj: Project): void {
  g.people = g.people.filter((p) => !(proj.costars.includes(p.id) && p.relation === 'coworker'))
  proj.costars = []
}

function filmographyMenu(): MenuGroup {
  return {
    type: 'menu',
    id: 'actor.filmography',
    label: 'Filmography',
    emoji: '\u{1F39E}\u{FE0F}',
    subtitle: (g) => {
      const p = viewActor(g)
      return `${p.credits.length} credit${p.credits.length === 1 ? '' : 's'} · ${p.awards.length} award${p.awards.length === 1 ? '' : 's'}`
    },
    children: (g): MenuNode[] => {
      const p = viewActor(g)
      const nodes: MenuNode[] = [
        { type: 'info', id: 'actor.f.stats', emoji: '\u{1F3AD}', text: `Acting skill ${actingSkill(g)}% · Reputation ${p.reputation}%${p.agent ? ` · Agent: ${p.agent.name}` : ''}` },
      ]
      if (p.credits.length === 0) nodes.push({ type: 'info', id: 'actor.f.none', text: 'No credits yet.' })
      p.credits
        .slice()
        .reverse()
        .forEach((cr, i) =>
          nodes.push({
            type: 'info',
            id: `actor.f.${i}`,
            emoji: cr.kind === 'film' ? '\u{1F3AC}' : '\u{1F4FA}',
            text: `"${cr.title}" (age ${cr.age}) · ${cr.role} · ${cr.genre}${cr.kind === 'tv' ? ` · ${cr.seasons} season${cr.seasons === 1 ? '' : 's'}` : ''} · ${cr.verdict} · ${short(cr.pay)}`,
          }),
        )
      p.awards.forEach((a, i) => nodes.push({ type: 'info', id: `actor.a.${i}`, emoji: '\u{1F3C6}', text: a }))
      return nodes
    },
  }
}

const auditionAction: MenuAction = {
  type: 'action',
  id: 'actor.audition',
  label: 'Auditions',
  emoji: '\u{1F3AC}',
  subtitle: 'Audition for film and TV roles',
  visible: (g) => {
    const job = actorJob(g)
    return !job || !project(job)
  },
  disabledReason: (g) => blocked(g, 18),
  confirm: (g) => {
    const j = g.character.job
    return j && j.defId !== 'actor' ? `If you land a role you'll quit your job as ${j.title}. Continue?` : null
  },
  run: (g) => openAuditions(g),
}

/** Special Careers > Actor (for anyone, actor or not). */
export const actorCareerMenu: MenuGroup = {
  type: 'menu',
  id: 'special.actor',
  label: 'Actor',
  emoji: '\u{1F3AC}',
  subtitle: 'Become a movie or TV star',
  header: (g) => {
    const p = viewActor(g)
    return `Acting skill: ${actingSkill(g)}% · Reputation: ${p.reputation}%. Start as an extra and work your way up to leading roles. Auditions open at 18.`
  },
  children: (g): MenuNode[] => {
    if (actorJob(g)) return [{ type: 'info', id: 'actor.already', text: 'You are already an actor. Manage your career from your job.', emoji: '\u{1F3AC}' }]
    return [auditionAction, practiceAction, hireAgentAction, fireAgentAction, filmographyMenu()]
  },
}

export function actorJobNodes(g: GameState): MenuNode[] {
  const job = actorJob(g)
  if (!job) return []
  const proj = project(job)
  return [
    {
      type: 'info',
      id: 'actor.status',
      emoji: '\u{1F3AC}',
      text: proj
        ? `Filming "${proj.title}" (${proj.genre} ${proj.kind === 'film' ? 'film' : `series, season ${proj.season}`}) for ${proj.studio} · ${money(proj.pay)}`
        : `Between roles. Audition to land your next part.`,
    },
    auditionAction,
    developAction,
    practiceAction,
    costarsAction,
    stuntAction,
    hireAgentAction,
    fireAgentAction,
    filmographyMenu(),
    quitAction,
  ]
}

// ---------------------------------------------------------------------------
// Awards

const AWARDS = { film: 'Golden Reel Award', tv: 'Primetime Glow Award' }

const speechScript = defineScript('special.actor.speech', (g, choice) => {
  let text: string
  if (choice === 'family') {
    addStat(g, 'happiness', 5)
    for (const p of g.people) if (p.alive && ['parent', 'spouse', 'child', 'sibling'].includes(p.relation)) addRelationship(p, 5)
    text = 'You thanked your family through tears. Your mom has watched the clip four hundred times.'
  } else if (choice === 'agent') {
    const p = actorProfile(g)
    text = p.agent ? `You thanked your agent, ${p.agent.name}, who immediately raised their commission.` : 'You thanked your agent, then remembered you don\'t have one. Awkward.'
  } else if (choice === 'political') {
    const good = chance(g, 0.5)
    addFame(g, good ? 2 : -1)
    text = good ? 'Your passionate speech about the issues got a standing ovation.' : 'Your political speech got you booed by half the room.'
    if (!good) g.flags['special.actor.booed'] = true
  } else if (choice === 'forget') {
    addFame(g, 1)
    text = 'You froze and forgot everyone\'s names, including your own. The internet made it a meme.'
  } else {
    text = 'The orchestra played you off before you said a single word. Classic.'
  }
  say(g, 'Acceptance Speech', text, '\u{1F3C6}')
})

function awardsSeason(g: GameState, credit: Credit): void {
  const p = actorProfile(g)
  p.nominations += 1
  const category = credit.role === 'Lead' ? `Best ${actorWord(g)}` : `Best Supporting ${actorWord(g)}`
  const award = `${AWARDS[credit.kind]} for ${category}`
  const winChance = Math.min(0.75, 0.2 + (credit.quality - 60) / 60 + (credit.popularity - 55) / 150)
  if (chance(g, winChance)) {
    p.awards.push(`${award} — "${credit.title}" (age ${g.character.age})`)
    count(g, 'awards')
    addFame(g, randInt(g, 5, 9))
    addStat(g, 'happiness', 20)
    p.reputation = clamp100(p.reputation + 10)
    log(g, `I won the ${award} for "${credit.title}".`, 'good')
    remember(g, `Won the ${award} for "${credit.title}".`)
    scriptChoice(
      g,
      speechScript,
      'And the Winner Is...',
      `You won the ${award} for "${credit.title}"! You walk up to the stage clutching the trophy. What do you say?`,
      [
        { id: 'family', label: 'Thank your family', emoji: '\u{1F46A}' },
        { id: 'agent', label: 'Thank your agent', emoji: '\u{1F574}\u{FE0F}' },
        { id: 'political', label: 'Make a political statement', emoji: '\u{1F4E2}' },
        { id: 'forget', label: 'Freeze up', emoji: '\u{1F976}' },
        { id: 'played', label: 'Ramble until the music plays', emoji: '\u{1F3BB}' },
      ],
      { emoji: '\u{1F3C6}' },
    )
  } else {
    addFame(g, 2)
    log(g, `I was nominated for the ${award} for "${credit.title}".`, 'good')
    say(g, 'Nominated', `You were nominated for the ${award} for "${credit.title}", but lost to ${pick(g, ['a veteran who has been nominated eleven times', 'a child actor', 'a dog (it was a very good dog)', 'your co-star'])}. You clapped politely.`, '\u{1F3C6}')
  }
}

// ---------------------------------------------------------------------------
// Yearly

function verdictFor(g: GameState, popularity: number, kind: Kind): string {
  if (popularity >= 85) return kind === 'film' ? 'a smash hit' : 'a cultural phenomenon'
  if (popularity >= 65) return kind === 'film' ? 'a box office success' : 'a hit'
  if (popularity >= 45) return 'a modest success'
  if (popularity >= 25) return 'a flop'
  return pick(g, ['a critical disaster', 'called the worst thing ever filmed', 'so bad it became a cult classic'])
}

export function yearlyActor(g: GameState): void {
  const c = g.character
  if (!c.alive) return
  const p = peek<ActorProfile>(g, 'actor')
  if (p) {
    // Residuals keep paying even after you leave the business.
    let residuals = 0
    for (const cr of p.credits) {
      if (cr.residual >= 25) {
        residuals += cr.residual
        cr.residual = Math.round(cr.residual * 0.75)
      } else cr.residual = 0
    }
    if (residuals > 0) {
      earnIncome(g, residuals)
      log(g, `I received ${money(residuals)} in residuals.`)
    }
  }
  const job = actorJob(g)
  if (!job || c.prison) return
  syncTenure(g, job)
  const ap = actorProfile(g)
  const proj = project(job)
  if (!proj) {
    ap.dryYears += 1
    if (fameOf(g) > 10) addHidden(g, 'fame', -randInt(g, 1, 3))
    if (ap.agent && ap.dryYears >= 2 && chance(g, 0.5)) {
      const name = ap.agent.name
      ap.agent = null
      g.flags['special.actor.dropped'] = true
      log(g, `My agent ${name} dropped me.`, 'bad')
      say(g, "That's Showbiz", `Your agent, ${name}, dropped you after ${ap.dryYears} years without landing a role.`, '\u{1F4C9}', 'bad')
    }
    return
  }
  const budgetBase = proj.budget === 'blockbuster' ? 15 : proj.budget === 'indie' || proj.budget === 'cable' ? -5 : 5
  const quality = clamp100(actingSkill(g) * 0.5 + (talentMatches(g, /act/i) ? 15 : 0) + proj.developed + budgetBase + randInt(g, 0, 35) + (proj.role === 'Extra' ? 10 : 0))
  const popularity = clamp100(quality * 0.6 + fameOf(g) * 0.2 + proj.buzz + randInt(g, -15, 25))
  const cut = ap.agent?.cut ?? 0
  const pay = Math.round(proj.pay * (1 - cut))
  earnIncome(g, pay)
  const verdict = verdictFor(g, popularity, proj.kind)
  const fameGain = proj.role === 'Extra' ? (chance(g, 0.3) ? 1 : 0) : proj.role === 'Supporting' ? 1 + Math.round(popularity / 30) : 3 + Math.round(popularity / 14)
  addFame(g, fameGain)
  ap.reputation = clamp100(ap.reputation + (quality - 50) / 8)
  if (proj.role === 'Lead' && fameOf(g) >= 70) fameToward(g, 90, 2)
  count(g, 'movies')
  const residual = proj.role === 'Extra' ? 0 : Math.round(proj.pay * 0.03 * (popularity / 50))
  const existing = proj.season > 1 ? ap.credits.find((x) => x.title === proj.title && x.kind === 'tv') : undefined
  let credit: Credit
  if (existing) {
    existing.seasons = proj.season
    existing.pay += proj.pay
    existing.quality = Math.max(existing.quality, quality)
    existing.popularity = popularity
    existing.verdict = verdict
    existing.residual += residual
    credit = existing
  } else {
    credit = { title: proj.title, kind: proj.kind, role: proj.role, genre: proj.genre, age: c.age, pay: proj.pay, quality, popularity, seasons: 1, verdict, residual }
    ap.credits.push(credit)
  }
  if (proj.genre === 'Bollywood' && proj.role === 'Lead') g.flags['special.actor.bollywood'] = true
  if (proj.genre === 'Telenovela' && proj.season >= 3) g.flags['special.actor.telenovela'] = true
  if (popularity < 25 && proj.role !== 'Extra') g.flags['special.actor.critics'] = true
  const what = proj.kind === 'film' ? `"${proj.title}" was released and was ${verdict}.` : `Season ${proj.season} of "${proj.title}" aired and was ${verdict}.`
  log(g, `${what.replace(/\.$/, '')}. I earned ${money(pay)}.`, popularity >= 45 ? 'good' : 'bad')

  if (proj.kind === 'tv' && popularity >= 45 && proj.season < 9 && chance(g, 0.8)) {
    proj.season += 1
    proj.pay = Math.round(proj.pay * (1.1 + popularity / 500))
    proj.developed = Math.round(proj.developed / 2)
    proj.buzz = 0
    job.salary = proj.pay
    say(g, 'Renewed!', `${what} The network renewed it for season ${proj.season}, and your pay rises to ${money(proj.pay)} per season.`, '\u{1F4FA}', 'good')
  } else {
    removeCostars(g, proj)
    view<ActorJobData>(job.data).project = null
    setRole(g, job, actorWord(g), 0, job.level)
    const ending = proj.kind === 'film' ? 'Filming has wrapped, so you are between roles.' : `The show ended after ${proj.season} season${proj.season === 1 ? '' : 's'}. You are between roles.`
    say(g, proj.kind === 'film' ? 'Premiere' : 'Series Finale', `${what} You earned ${money(pay)}${cut > 0 ? ` after your agent's ${Math.round(cut * 100)}% cut` : ''}. ${ending}`, proj.kind === 'film' ? '\u{1F3AC}' : '\u{1F4FA}', popularity >= 45 ? 'good' : 'bad')
  }
  if (proj.role !== 'Extra' && quality >= 70 && popularity >= 55 && chance(g, 0.4)) awardsSeason(g, credit)
}
