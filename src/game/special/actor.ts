// Special career: Actor. Take acting classes, hire a talent agent, audition for film and TV
// roles (extra -> supporting -> lead), develop your character, deal with co-stars, stage
// publicity stunts, win awards and collect residuals for the rest of your life.
import { hasTech } from '../history/timeline'
import { addHidden, addRelationship, addStat, count, earnIncome, fullName, getPerson, log, remember, scriptChoice, useYearAction } from '../core'
import { chance, pick, rand, randInt } from '../rng'
import { pickLine, pickSite } from '../text/pick'
import { defineScript } from '../scripts'
import type { GameState, Job, Json, MenuAction, MenuGroup, MenuNode } from '../types'
import { randomFirstName } from '../world'
import { hasTalent, talentHint, talentMult } from '../talents'
import { brandPool, pickBrand } from '../shops/everyday-brands'
import { ageCeiling } from '../mastery'
import { BUDGETS, TYPE_IDS, TYPE_OF, type IndustryId } from './actor-data'
import { auditionBlock, landProject, slotBlock } from './actor-pipeline'
import { actorStore, type Role } from './actor-state'
import { actorMenus, actorStanding } from './actor-menu'
import { ACTOR_SPEC, industryOf, pressure, scaleOf } from './actor-world'
import { applyEffects } from './kit/crisis'
import { activeField } from './kit/rivals'
import { ACTION_BUDGET, careerCtx, careerSay } from './kit/year'
import { actingSkill, addFame, blocked, claimYearly, clamp100, dropList, fameOf, fameToward, leave, masterFlagSkill, money, myJob, peek, prof, say, setFlagSkill, setRole, short, syncTenure, tell, view, yearlyList } from './common'

export type { Role }
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

export interface Listing {
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

function actorNumber(value: unknown, fallback = 0, lo = 0, hi = 1e12): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(lo, Math.min(hi, Math.round(value))) : fallback
}

function actorText(value: unknown, fallback: string, max = 100): string {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max) || fallback : fallback
}

function normalizedActor(value: unknown): ActorProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return initActor()
  const raw = value as Partial<ActorProfile>
  const credits: Credit[] = []
  if (Array.isArray(raw.credits)) for (const value of raw.credits.slice(-256)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const credit = value as Partial<Credit>
    credits.push({
      title: actorText(credit.title, 'Untitled'),
      kind: credit.kind === 'tv' ? 'tv' : 'film',
      role: credit.role === 'Lead' || credit.role === 'Supporting' ? credit.role : 'Extra',
      genre: actorText(credit.genre, 'Drama', 60),
      age: actorNumber(credit.age, 0, 0, 10_000),
      pay: actorNumber(credit.pay),
      quality: actorNumber(credit.quality, 0, 0, 100),
      popularity: actorNumber(credit.popularity, 0, 0, 100),
      seasons: actorNumber(credit.seasons, 1, 1, 100),
      verdict: actorText(credit.verdict, 'released'),
      residual: actorNumber(credit.residual),
    })
  }
  let agent: Agent | null = null
  if (raw.agent && typeof raw.agent === 'object' && !Array.isArray(raw.agent)) {
    const a = raw.agent as Partial<Agent>
    agent = {
      name: actorText(a.name, 'Unknown Agent', 80),
      firm: actorText(a.firm, 'Independent', 80),
      quality: actorNumber(a.quality, 0, 0, 100),
      cut: typeof a.cut === 'number' && Number.isFinite(a.cut) ? Math.max(0, Math.min(0.95, a.cut)) : 0,
    }
  }
  return {
    reputation: actorNumber(raw.reputation, 50, 0, 100),
    credits,
    awards: Array.isArray(raw.awards) ? raw.awards.filter((x): x is string => typeof x === 'string').map((x) => actorText(x, '', 120)).filter(Boolean).slice(-256) : [],
    nominations: actorNumber(raw.nominations, 0, 0, 1e9),
    agent,
    dryYears: actorNumber(raw.dryYears, 0, 0, 10_000),
  }
}

function actorProfile(g: GameState): ActorProfile {
  const p = prof(g, 'actor', initActor)
  Object.assign(p, normalizedActor(p))
  return p
}

export function viewActor(g: GameState): ActorProfile {
  return normalizedActor(peek<ActorProfile>(g, 'actor'))
}

export function actorJob(g: GameState): Job | null {
  return myJob(g, 'actor')
}

export function project(job: Job): Project | null {
  const data = view<ActorJobData>(job.data)
  const raw = data.project
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const p = raw as Partial<Project>
  const normalized: Project = {
    title: actorText(p.title, 'Untitled'),
    kind: p.kind === 'tv' ? 'tv' : 'film',
    genre: actorText(p.genre, 'Drama', 60),
    role: p.role === 'Lead' || p.role === 'Supporting' ? p.role : 'Extra',
    studio: actorText(p.studio, 'Independent Studio', 80),
    pay: actorNumber(p.pay),
    budget: actorText(p.budget, 'indie', 40),
    developed: actorNumber(p.developed, 0, 0, 100),
    buzz: actorNumber(p.buzz, 0, 0, 100),
    season: actorNumber(p.season, 1, 1, 100),
    costars: Array.isArray(p.costars) ? p.costars.filter((x): x is string => typeof x === 'string').map((x) => actorText(x, '', 80)).filter(Boolean).slice(0, 64) : [],
  }
  data.project = normalized
  return normalized
}

function actorWord(g: GameState): string {
  return g.character.gender === 'female' ? 'Actress' : 'Actor'
}

// ---------------------------------------------------------------------------
// Role listings

const ADJ = ['Midnight', 'Silent', 'Broken', 'Golden', 'Last', 'Crimson', 'Electric', 'Hidden', 'Savage', 'Lonely', 'Infinite', 'Velvet', 'Frozen', 'Burning', 'Wild', 'Lucky']
const NOUN = ['Horizon', 'Protocol', 'Kingdom', 'Summer', 'Heist', 'Echo', 'Paradise', 'Witness', 'Storm', 'Frontier', 'Promise', 'Shadows', 'Highway', 'Empire', 'Detour', 'Reunion']
const FILM_GENRES = ['Action', 'Comedy', 'Drama', 'Horror', 'Romance', 'Sci-Fi', 'Thriller', 'Animated', 'Superhero', 'Musical']
const TV_GENRES = ['Sitcom', 'Crime Drama', 'Medical Drama', 'Fantasy Series', 'Soap Opera', 'Sci-Fi Series', 'Teen Drama']
// Small independent productions stay invented; the big studios, networks and streamers are real.
const INDIE_STUDIOS = ['Silverline Studios', 'Big Sky Films', 'Moonlit Entertainment', 'Redwood Studios', 'Golden Hour Films', 'Lantern Row Pictures']
const LOCAL_STUDIOS = ['Paragon Pictures', 'Starling Bros.']
const LOCAL_NETWORKS = ['Channel Nine Network', 'Prime Eight']

/** Who is making it: a real studio for big films, a real network or streamer for TV (invented ones where none trades). */
function producer(g: GameState, kind: Kind, budget: string): string {
  if (kind === 'film') {
    if (budget === 'indie') return pick(g, INDIE_STUDIOS)
    const major = pickBrand(g, 'film-studio', budget === 'blockbuster' ? { segment: 'major' } : {})
    return major?.name ?? pick(g, LOCAL_STUDIOS)
  }
  if (budget === 'streaming') return pickBrand(g, 'streaming', { segment: 'video' })?.name ?? pick(g, LOCAL_NETWORKS)
  const tv = brandPool(g, 'streaming', { segment: 'tv' }).filter((b) => b.data?.drama === true)
  return tv.length ? pick(g, tv).name : pick(g, LOCAL_NETWORKS)
}
const LATIN = ['mx', 'co', 'ar', 'cl', 'pe', 've', 'br']

function genTitle(g: GameState, genre: string): string {
  if (genre === 'Sitcom') return `${pick(g, ['Everybody Loves', 'Living With', 'Raising', 'Meet'])} ${randomFirstName(g, g.character.countryId, chance(g, 0.5) ? 'male' : 'female')}`
  if (genre === 'Telenovela') return pick(g, ['Corazón de Fuego', 'Amor Prohibido', 'La Herencia', 'Lágrimas de Oro', 'Destino Cruel', 'El Secreto de Isabela'])
  if (genre === 'Bollywood') return pick(g, ['Dil Ki Dhadkan', 'Pyaar Ka Safar', 'Monsoon Wedding Bells', 'Raja Rani', 'Sapno Ki Rani'])
  const base = `${chance(g, 0.4) ? 'The ' : ''}${pick(g, ADJ)} ${pick(g, NOUN)}`
  return chance(g, 0.12) ? `${base} ${randInt(g, 2, 4)}` : base
}

/** The genre each named industry is known for, and the kind it comes in: 40% of that industry's listings. */
const SIGNATURE: Partial<Record<IndustryId, { genre: string; kind: Kind }>> = {
  bollywood: { genre: 'Bollywood', kind: 'film' },
  kdrama: { genre: 'K-Drama', kind: 'tv' },
  nollywood: { genre: 'Nollywood Drama', kind: 'film' },
  hongkong: { genre: 'Martial Arts', kind: 'film' },
}

export function genListings(g: GameState): Listing[] {
  // A life the sim has taken over reads its record; any other life reads (and creates) the legacy profile, as before.
  const sim = actorStore.peek(g)
  const legacy = sim ? null : actorProfile(g)
  const credits: { role: Role }[] = sim ? sim.credits : legacy!.credits
  const agent: { quality: number } | null = sim ? sim.team.agent : legacy!.agent
  const f = fameOf(g)
  const hadSupporting = credits.some((x) => x.role !== 'Extra')
  const agentQ = agent?.quality ?? 0
  const industry = industryOf(g)
  const scale = scaleOf(g, industry)
  const signature = industry === 'domestic' && LATIN.includes(g.character.countryId) ? { genre: 'Telenovela', kind: 'tv' as Kind } : SIGNATURE[industry]
  // Acting talent: casting directors call more often, offer bigger parts sooner (one tier up
  // the ladder), cast you in more blockbusters and pay a premium for you.
  const gifted = hasTalent(g, 'Acting')
  const n = (agent ? 6 : 4) + (gifted ? 1 : 0) + ((sim?.team.manager?.quality ?? 0) >= 60 ? 1 : 0)
  const leadReady = hadSupporting || f >= (gifted ? 25 : 40) || (gifted && credits.length > 0)
  const out: Listing[] = []
  for (let i = 0; i < n; i++) {
    let role: Role = 'Extra'
    const r = rand(g) + agentQ / 250 + (gifted ? 0.15 : 0)
    if (leadReady && r > 0.7) role = 'Lead'
    else if ((credits.length > 0 || actingSkill(g) >= (gifted ? 35 : 45) || f >= 25) && r > 0.35) role = 'Supporting'
    let kind: Kind = chance(g, 0.6) || !hasTech(g, 'tv') ? 'film' : 'tv'
    let genre = kind === 'film' ? pick(g, FILM_GENRES) : pick(g, TV_GENRES)
    if (signature && chance(g, 0.4) && (signature.kind === 'film' || hasTech(g, 'tv'))) {
      kind = signature.kind
      genre = signature.genre
    }
    let budget =
      kind === 'film'
        ? pick(g, gifted && role !== 'Extra' ? ['indie', 'studio', 'blockbuster', 'blockbuster'] : ['indie', 'studio', 'studio', 'blockbuster'])
        : pick(g, gifted && role !== 'Extra' ? ['network', 'streaming', 'streaming'] : ['cable', 'network', 'streaming'])
    // Nothing from the wrong era: blockbusters from 1975, cable from 1980, streaming once it exists.
    if (budget === 'blockbuster' && g.year < (BUDGETS.blockbuster.from ?? 0)) budget = 'studio'
    else if (budget === 'cable' && g.year < (BUDGETS.cable.from ?? 0)) budget = 'network'
    else if (budget === 'streaming' && !hasTech(g, 'streaming')) budget = 'network'
    const budgetMult = budget === 'blockbuster' ? 2 : budget === 'indie' || budget === 'cable' ? 0.6 : 1
    const premium = talentMult(g, 'Acting', 1.25)
    let pay: number
    if (role === 'Extra') pay = randInt(g, 3, 30) * 100
    else if (role === 'Supporting') pay = Math.round((randInt(g, 15, 200) * 1_000 * (1 + f / 25) * budgetMult * premium) / 1_000) * 1_000
    else pay = Math.round((randInt(g, 80, 1_000) * 1_000 * (1 + (f * f) / 400) * budgetMult * premium) / 1_000) * 1_000
    out.push({ title: genTitle(g, genre), kind, genre, role, studio: producer(g, kind, budget), pay: Math.max(1, Math.round(pay * scale)), budget })
  }
  return out
}

const ROLE_DIFFICULTY: Record<Role, number> = { Extra: 0, Supporting: 25, Lead: 45 }

/** The audition score before the approach and the luck roll (no randomness: safe in menus). */
export function auditionBase(g: GameState, l: Listing): number {
  const c = g.character
  const p = viewActor(g)
  const sim = actorStore.peek(g)
  let base =
    actingSkill(g) * 0.5 +
    (hasTalent(g, 'Acting') ? 15 : 0) +
    c.stats.looks * (l.role === 'Lead' ? 0.25 : 0.1) +
    (sim ? sim.rep : p.reputation) * 0.1 +
    (sim ? (sim.team.agent?.quality ?? 0) : (p.agent?.quality ?? 0)) * 0.1 +
    fameOf(g) * 0.15 -
    ROLE_DIFFICULTY[l.role]
  if (sim) {
    // Rivals in your type, scandal and typecast all weigh on the read, in the roll and in the hint alike.
    const type = TYPE_OF[l.genre] ?? 'drama'
    base -= pressure(g, sim, type, l.role) + sim.scandal / 10
    if (sim.type[type] >= 50) base += 10
    else if (TYPE_IDS.some((t) => sim.type[t] >= 50)) base -= 10
  }
  return base
}

/**
 * Acting talent: the listing that suits you best — the biggest part you'd most likely land
 * if you play it the way the casting director pictures it (still a roll of the dice).
 */
export function bestListing(g: GameState, listings: Listing[]): number {
  let best = -1
  let bestScore = -Infinity
  listings.forEach((l, i) => {
    const odds = auditionBase(g, l) + 20 - 30 // margin over the pass mark with the right approach
    const tier = l.role === 'Lead' ? 2 : l.role === 'Supporting' ? 1 : 0
    // Prefer a part you'll probably get; among those, the bigger part and the bigger check.
    const score = (odds >= 10 ? 1_000 : odds * 10) + tier * 100 + Math.min(99, l.pay / 20_000)
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  })
  return best
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
  'K-Drama': 'heartfelt',
  'Nollywood Drama': 'heartfelt',
  'Martial Arts': 'intense',
}

/** Main Character Syndrome: acting for the first time (a lesson, an audition, a shoot) is already mastery for the age. */
export function masterActing(g: GameState): void {
  masterFlagSkill(g, 'acting', 'stage', 'acting', ageCeiling(g.character.age, { from: 6, full: 17, floor: 30 }))
}

const auditionScript = defineScript('special.actor.audition', (g, choice, data) => {
  const l = data as unknown as Listing
  masterActing(g)
  // Until the sim takes the life over (its first tick, or an action that adopts) the legacy profile is the truth.
  const sim = actorStore.peek(g)?.migrated === true
  const p = sim ? null : actorProfile(g)
  let fit = 0
  if (choice === FIT[l.genre]) fit = 20
  else if (choice === 'overTop') fit = randInt(g, -15, 25)
  const score = auditionBase(g, l) + fit + randInt(g, -15, 15)
  if (score < 30) {
    if (p) p.reputation = clamp100(p.reputation - 1)
    log(g, `I auditioned for ${l.title} but didn't get the part.`, 'bad')
    if (sim) {
      // A life the sim has taken over loses the part to a named rival and remembers it.
      const s = actorStore.mut(g)
      s.rep = clamp100(s.rep - 1)
      const type = TYPE_OF[l.genre] ?? 'drama'
      const top = activeField(g, ACTOR_SPEC, s.memory).find((x) => x.rival.edge === type)?.rival
      if (top) {
        const c = careerCtx(g, 'actor', s, { ...ACTION_BUDGET })
        applyEffects(c, { grudge: { id: top.id, name: top.name, by: 10 } }, 'Lost part')
        careerSay(c, 'Audition', `You auditioned for "${l.title}". ${top.name} got the part.`, '\u{1F3AD}', 'bad')
        return
      }
    }
    return say(
      g,
      'Audition',
      pickSite(g, [
        `The casting director for "${l.title}" thanked you for your time and said they were "going in a different direction".`,
        `You auditioned for "${l.title}". Halfway through your monologue, the director started ${hasTech(g, 'internet') ? 'checking emails' : 'reading the newspaper'}.`,
        `You didn't get the part in "${l.title}". They cast someone with a famous parent instead.`,
        `You forgot your lines at the "${l.title}" audition and tried to improvise. It did not work.`,
      ], 0x39c43ced),
      '\u{1F3AD}',
      'bad',
    )
  }
  landRole(g, l)
})

const pickRoleScript = defineScript('special.actor.pick', (g, choice) => {
  if (choice === 'cancel') return
  // The rules live in the pipeline and are checked here too, so a stale row or a bypassed menu changes nothing.
  const sim = actorStore.peek(g)
  const barred = sim ? auditionBlock(g, sim) : null
  if (barred) return tell(g, 'Auditions', barred, '\u{1F3AC}')
  const listings = yearlyList<Listing>(g, 'actor.roles', () => genListings(g))
  const idx = Number(choice)
  const l = listings[idx]
  if (!l) return
  const crowded = sim ? slotBlock(sim, { kind: l.kind, role: l.role }) : null
  if (crowded) return tell(g, 'Auditions', crowded, '\u{1F3AC}')
  const limit = ((sim ? sim.team.agent : actorProfile(g).agent) ? 5 : 3) + ((sim?.team.manager?.quality ?? 0) >= 60 ? 1 : 0)
  if (!useYearAction(g, 'actor.audition', limit)) return tell(g, 'Auditions', "You've been to so many auditions this year that casting directors recognize your headshot as a warning sign. Try again next year.", '\u{1F971}')
  listings.splice(idx, 1)
  scriptChoice(
    g,
    auditionScript,
    `Audition: ${l.title}`,
    `The casting director hands you a scene from "${l.title}" (${l.genre}). How do you play it?`,
    APPROACHES.map((a) => (a.id === FIT[l.genre] && hasTalent(g, 'Acting') ? { ...a, hint: talentHint(g, 'Acting', `That's exactly how the director pictures this ${l.genre.toLowerCase()} role.`) } : a)),
    { emoji: '\u{1F3AC}', data: l as unknown as Json },
  )
})

function openAuditions(g: GameState): void {
  const job = actorJob(g)
  if (job && project(job)) return tell(g, 'Auditions', `You're already committed to "${project(job)?.title}". Finish it first.`, '\u{1F3AC}')
  const sim = actorStore.peek(g)
  const barred = sim ? auditionBlock(g, sim) : null
  if (barred) return tell(g, 'Auditions', barred, '\u{1F3AC}')
  // Walking into the casting room is doing it: the hint below is computed after the lift.
  masterActing(g)
  const listings = yearlyList<Listing>(g, 'actor.roles', () => genListings(g))
  if (listings.length === 0) return tell(g, 'Auditions', 'There are no more roles you are right for this year. Your agent says to "stay hungry".', '\u{1F3AC}')
  const best = hasTalent(g, 'Acting') ? bestListing(g, listings) : -1
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
        ...(i === best ? { hint: talentHint(g, 'Acting', 'This part suits you best: your strongest shot at the biggest role.') } : {}),
      })),
      { id: 'cancel', label: 'Not now', emoji: '\u{274C}' },
    ],
    { emoji: '\u{1F3AD}' },
  )
}

/** A role is landed by the pipeline: it takes the legacy record over, hires at once and queues the contract choice. */
function landRole(g: GameState, l: Listing): void {
  const role: Role = l.role === 'Lead' || l.role === 'Supporting' ? l.role : 'Extra'
  landProject(careerCtx(g, 'actor', actorStore.mut(g), { ...ACTION_BUDGET }), l, role)
}

// ---------------------------------------------------------------------------
// Agents

// The agent rows live in actor-team.ts (`teamRows`); this script stays registered so a modal queued by an
// old save still resolves against the legacy profile, which the first sim tick then lifts.
interface AgentOffer {
  name: string
  firm: string
  quality: number
  cut: number
}

defineScript('special.actor.agent', (g, choice, data) => {
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
    const gain = Math.round(randInt(g, 2, 6) * talentMult(g, 'Acting', 1.7))
    masterActing(g)
    setFlagSkill(g, 'acting', actingSkill(g) + gain)
    log(g, 'I practiced my acting.')
    say(g, 'Practice', `${pickLine(g, ['You ran lines in front of the bathroom mirror for hours.', 'You studied old movies and copied every facial expression.', 'You practiced accents until your neighbors complained.'])} Your acting skill rose to ${actingSkill(g)}%.`, '\u{1F4D6}', 'good')
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
      pickSite(g, [
        `You stayed in character for an entire month to prepare for "${proj.title}". Your family wants their old you back.`,
        `You wrote a 40-page backstory for your character in "${proj.title}". The director was impressed.`,
        `You shadowed a real-life professional to research your role in "${proj.title}".`,
      ], 0xcc3a9345),
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
      addRelationship(g, co, -randInt(g, 5, 15))
      addStat(g, 'happiness', -4)
      text = pickSite(g, [
        `${fullName(co)} spent the whole evening talking about their skincare routine and calling you "the new kid".`,
        `${fullName(co)} demanded you not make eye contact with them between takes.`,
        `${fullName(co)} asked the director to cut your best scene.`,
      ], 0xb8355409)
    } else if (roll < 0.15) {
      addRelationship(g, co, -10)
      text = `You and ${fullName(co)} argued about who gets the better trailer. The crew picked sides.`
    } else {
      addRelationship(g, co, randInt(g, 8, 18))
      proj.buzz += 3
      addStat(g, 'happiness', 5)
      text = pickSite(g, [
        `You and ${fullName(co)} grabbed dinner after shooting. The on-screen chemistry is real now.`,
        `${fullName(co)} taught you a trick for crying on cue. You taught them a card trick.`,
        `You and ${fullName(co)} pranked the director together. Best day on set yet.`,
      ], 0xf6889576)
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
        pickSite(g, [
          `You showed up to the "${proj.title}" press tour in full costume and refused to break character. The buzz is enormous.`,
          `You "leaked" a fake behind-the-scenes feud. Everyone is talking about "${proj.title}".`,
          `You skydived into the "${proj.title}" premiere. People will definitely watch it now.`,
        ], 0x95253345),
        '\u{1F4E2}',
        'good',
      )
    } else {
      proj.buzz -= 5
      addHidden(g, 'notoriety', 2)
      log(g, `My publicity stunt for "${proj.title}" backfired.`, 'bad')
      say(g, 'Publicity Stunt', pickSite(g, [`Your stunt for "${proj.title}" was called "desperate" by every critic in the country.`, `You tried to set a world record at the "${proj.title}" premiere and fell off the stage.`], 0x4a95940c), '\u{1F4E2}', 'bad')
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

/** What the legacy menus show: the sim record once it owns the life (the legacy profile is frozen by then), the legacy profile before. Pure. */
function shown(g: GameState): { credits: Credit[]; awards: string[]; reputation: number; agent: Agent | null } {
  const s = actorStore.peek(g)
  if (s?.migrated) return { credits: s.credits, awards: s.awards, reputation: s.rep, agent: s.team.agent }
  const p = viewActor(g)
  return { credits: p.credits, awards: p.awards, reputation: p.reputation, agent: p.agent }
}

function filmographyMenu(): MenuGroup {
  return {
    type: 'menu',
    id: 'actor.filmography',
    label: 'Filmography',
    emoji: '\u{1F39E}\u{FE0F}',
    subtitle: (g) => {
      const p = shown(g)
      return `${p.credits.length} credit${p.credits.length === 1 ? '' : 's'} · ${p.awards.length} award${p.awards.length === 1 ? '' : 's'}`
    },
    children: (g): MenuNode[] => {
      const p = shown(g)
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
  subtitle: (g) => hasTech(g, 'tv') ? 'Audition for film and TV roles' : 'Audition for film roles',
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
    const p = shown(g)
    return `Acting skill: ${actingSkill(g)}% · Reputation: ${p.reputation}%. Start as an extra and work your way up to leading roles. Auditions open at 18.`
  },
  children: (g): MenuNode[] => {
    if (actorJob(g)) return [{ type: 'info', id: 'actor.already', text: 'You are already an actor. Manage your career from your job.', emoji: '\u{1F3AC}' }]
    return [auditionAction, practiceAction, actorStanding, ...actorMenus(g), filmographyMenu()]
  },
}

export function actorJobNodes(g: GameState): MenuNode[] {
  const job = actorJob(g)
  if (!job) return []
  const proj = project(job)
  // Once the sim owns the life, actor-menu.ts offers the stunt and quit rows (same ids) for the projects in its pipeline.
  const sim = actorStore.peek(g)?.migrated === true
  // The sim keeps its shoots in its own pipeline: the job's legacy project is empty once it owns the life.
  const shoot = sim ? actorStore.peek(g)?.pipeline.find((x) => x.stage === 'shoot') : undefined
  return [
    {
      type: 'info',
      id: 'actor.status',
      emoji: '\u{1F3AC}',
      text: shoot
        ? `Filming "${shoot.title}" (${shoot.genre} ${shoot.kind === 'film' ? 'film' : `series, season ${shoot.season}`}) for ${shoot.studio} · ${money(shoot.terms.fee)}`
        : proj
          ? `Filming "${proj.title}" (${proj.genre} ${proj.kind === 'film' ? 'film' : `series, season ${proj.season}`}) for ${proj.studio} · ${money(proj.pay)}`
          : `Between roles. Audition to land your next part.`,
    },
    auditionAction,
    developAction,
    practiceAction,
    costarsAction,
    ...(sim ? [] : [stuntAction]),
    actorStanding,
    ...actorMenus(g),
    filmographyMenu(),
    ...(sim ? [] : [quitAction]),
  ]
}

// ---------------------------------------------------------------------------
// Awards

const AWARDS = { film: 'Golden Reel Award', tv: 'Primetime Glow Award' }

const speechScript = defineScript('special.actor.speech', (g, choice) => {
  let text: string
  if (choice === 'family') {
    addStat(g, 'happiness', 5)
    for (const p of g.people) if (p.alive && ['parent', 'spouse', 'child', 'sibling'].includes(p.relation)) addRelationship(g, p, 5)
    text = 'You thanked your family through tears. Your mom has watched the clip four hundred times.'
  } else if (choice === 'agent') {
    const sim = actorStore.peek(g)
    const agent = sim ? sim.team.agent : actorProfile(g).agent
    text = agent ? `You thanked your agent, ${agent.name}, who immediately raised their commission.` : 'You thanked your agent, then remembered you don\'t have one. Awkward.'
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
    say(g, 'Nominated', `You were nominated for the ${award} for "${credit.title}", but lost to ${pickLine(g, ['a veteran who has been nominated eleven times', 'a child actor', 'a dog (it was a very good dog)', 'your co-star'])}. You clapped politely.`, '\u{1F3C6}')
  }
}

// ---------------------------------------------------------------------------
// Yearly

function verdictFor(g: GameState, popularity: number, kind: Kind): string {
  if (popularity >= 85) return kind === 'film' ? 'a smash hit' : 'a cultural phenomenon'
  if (popularity >= 65) return kind === 'film' ? 'a box office success' : 'a hit'
  if (popularity >= 45) return 'a modest success'
  if (popularity >= 25) return 'a flop'
  return pickLine(g, ['a critical disaster', 'called the worst thing ever filmed', 'so bad it became a cult classic'])
}

export function yearlyActor(g: GameState): void {
  // A life the sim has taken over is settled by the kit hook (actor-sim.ts); this one is for the rest.
  if (actorStore.peek(g)?.migrated) return
  const c = g.character
  if (!c.alive) return
  const stored = peek<ActorProfile>(g, 'actor')
  const job = actorJob(g)
  if (!stored && !job) return
  if (!claimYearly(g, 'actor')) return
  const p = stored ? actorProfile(g) : null
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
      earnIncome(g, residuals, 'royalty')
      log(g, `I received ${money(residuals)} in residuals.`)
    }
  }
  if (!job || c.prison) return
  masterActing(g)
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
  const quality = clamp100(actingSkill(g) * 0.5 + (hasTalent(g, 'Acting') ? 15 : 0) + proj.developed + budgetBase + randInt(g, 0, 35) + (proj.role === 'Extra' ? 10 : 0))
  // On-set experience: every shoot teaches you something; a natural soaks up far more.
  const onSet = hasTalent(g, 'Acting') ? (proj.role === 'Extra' ? randInt(g, 1, 2) : randInt(g, 2, 4)) : proj.role === 'Extra' ? 0 : 1
  if (onSet > 0) setFlagSkill(g, 'acting', actingSkill(g) + onSet)
  const popularity = clamp100(quality * 0.6 + fameOf(g) * 0.2 + proj.buzz + randInt(g, -15, 25))
  const cut = ap.agent?.cut ?? 0
  const pay = Math.round(proj.pay * (1 - cut))
  earnIncome(g, pay, 'wage')
  const verdict = verdictFor(g, popularity, proj.kind)
  const fameGain = (proj.role === 'Extra' ? (chance(g, 0.3) ? 1 : 0) : proj.role === 'Supporting' ? 1 + Math.round(popularity / 30) : 3 + Math.round(popularity / 14)) + (hasTalent(g, 'Acting') && proj.role !== 'Extra' ? 1 : 0)
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
