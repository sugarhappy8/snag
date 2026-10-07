// Esports: competitive gaming as a sport. Grind the ranked ladder (Bronze → Top 500) on your own
// PC or console, win online cups, get signed by an academy team, make the pro league, and play
// for prize pools at Masters events and the World Championship. Reflexes peak young, so careers
// are short; retire into coaching or the casting booth.
// Every game, team and tournament here is original.
import { addHidden, addStat, count, earnIncome, log, scriptChoice, useYearAction, yearActionsUsed } from '../core'
import { bell, chance, pick, rand, randInt } from '../rng'
import { defineScript } from '../scripts'
import { hasTalent, talentHint, talentMult } from '../talents'
import type { GameState, Job, Json, MenuAction, MenuGroup, MenuNode } from '../types'
import { getCountry, randomCity } from '../world'
import { addFame, fameToward, hire, leave, money, myJob, ordinal, peek, prof, quitNote, say, short, syncTenure, tell, view, yearlyList } from './common'
import { addBuzz, honor, logistic, plural, recordCareer, sportsGate, theName, tidy, trainGain, wealth } from './sports-core'
import { eraOpen, ESPORTS_GATE, STREAMING_GATE } from '../computer/era'

/** Top salary a team pays a player (the very best earn more from prize money and streaming). */
const MAX_SALARY = 3_000_000

interface EsEvent {
  id: string
  name: string
  tier: 'tour' | 'major' | 'finals'
  pool: number
  teams: number
  minTier?: number
}

interface EsGame {
  id: string
  name: string
  genre: string
  emoji: string
  team: boolean
  events: EsEvent[]
}

export const ES_GAMES: EsGame[] = [
  {
    id: 'siege',
    name: 'Arcane Siege',
    genre: 'MOBA',
    emoji: '\u{1F9D9}',
    team: true,
    events: [
      { id: 'spr', name: '{region} Arcane League Spring Split', tier: 'tour', pool: 200_000, teams: 10 },
      { id: 'sum', name: '{region} Arcane League Summer Split', tier: 'tour', pool: 200_000, teams: 10 },
      { id: 'msm', name: 'Arcane Siege Mid-Season Masters', tier: 'major', pool: 1_000_000, teams: 12, minTier: 1 },
      { id: 'wc', name: 'Arcane Siege World Championship', tier: 'finals', pool: 5_000_000, teams: 24, minTier: 1 },
    ],
  },
  {
    id: 'strike',
    name: 'Strike Protocol',
    genre: 'tactical shooter',
    emoji: '\u{1F3AF}',
    team: true,
    events: [
      { id: 'pl1', name: '{region} Strike Pro League', tier: 'tour', pool: 250_000, teams: 16 },
      { id: 'maj', name: 'Strike Protocol Major: {city}', tier: 'major', pool: 1_250_000, teams: 24, minTier: 1 },
      { id: 'wm', name: 'Strike Protocol World Masters', tier: 'finals', pool: 2_000_000, teams: 16, minTier: 1 },
    ],
  },
  {
    id: 'drop',
    name: 'Dropzone Royale',
    genre: 'battle royale',
    emoji: '\u{1FA82}',
    team: true,
    events: [
      { id: 'cup', name: '{region} Dropzone Cup', tier: 'tour', pool: 300_000, teams: 20 },
      { id: 'inv', name: 'Dropzone Global Invitational', tier: 'major', pool: 1_000_000, teams: 24, minTier: 1 },
      { id: 'wc', name: 'Dropzone Royale World Cup', tier: 'finals', pool: 3_000_000, teams: 30, minTier: 1 },
    ],
  },
  {
    id: 'turbo',
    name: 'Turbo Goal',
    genre: 'rocket-car soccer',
    emoji: '\u{1F697}',
    team: true,
    events: [
      { id: 'reg', name: '{region} Turbo Goal Regional', tier: 'tour', pool: 100_000, teams: 16 },
      { id: 'maj', name: 'Turbo Goal Major: {city}', tier: 'major', pool: 400_000, teams: 16, minTier: 1 },
      { id: 'wc', name: 'Turbo Goal World Championship', tier: 'finals', pool: 1_000_000, teams: 16, minTier: 1 },
    ],
  },
  {
    id: 'knuckle',
    name: 'Knuckle Kings',
    genre: 'fighting game',
    emoji: '\u{1F44A}',
    team: false,
    events: [
      { id: 'tour', name: 'Knuckle Kings Pro Tour: {city}', tier: 'tour', pool: 30_000, teams: 256 },
      { id: 'open', name: 'Combo Kings Open', tier: 'major', pool: 80_000, teams: 512 },
      { id: 'gb', name: 'The Grand Brawl', tier: 'finals', pool: 250_000, teams: 1024 },
    ],
  },
]

const ATTRS = ['Mechanics', 'Game Sense', 'Teamwork', 'Mental']
const TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master', 'Grandmaster', 'Top 500']
const TEAMS = ['Team Nebula', 'Void Raptors', 'Neon Owls', 'Kingslayer Gaming', 'Pixel Pirates', 'Crimson Lynx', 'Static Shock', 'Moonlight Wolves', 'Frostbyte', 'Gold Rush Gaming', 'Night Owl Esports', 'Quantum Foxes']

function game(id: string | null | undefined): EsGame {
  return ES_GAMES.find((x) => x.id === id) ?? ES_GAMES[0]
}

interface EsProfile {
  game: string | null
  mmr: Record<string, number>
  attrs: Record<string, number>
  titles: string[]
  earnings: number
  startAge: number
  retiredAge: number | null
  cups: number
}

interface EsJob {
  game: string
  team: string
  teamStrength: number
  tier: number
  contractYears: number
  played: string[]
  results: string[]
  earned: number
}

const initEs = (g: GameState): EsProfile => {
  const c = g.character
  // Gaming talent: you show up already better than most of the lobby.
  const gift = hasTalent(g, 'Gaming') ? 8 : 0
  const base = (v: number) => Math.max(5, Math.min(45 + gift, Math.round(v + gift)))
  return {
    game: null,
    mmr: {},
    attrs: { Mechanics: base(15 + randInt(g, 0, 15) + (c.age < 20 ? 5 : 0)), 'Game Sense': base(10 + c.stats.smarts * 0.2 + randInt(g, 0, 10)), Teamwork: base(15 + randInt(g, 0, 15)), Mental: base(10 + c.hidden.willpower * 0.2 + randInt(g, 0, 10)) },
    titles: [],
    earnings: 0,
    startAge: c.age,
    retiredAge: null,
    cups: 0,
  }
}

function es(g: GameState): EsProfile {
  return prof(g, 'sports.esports', initEs)
}

function viewEs(g: GameState): EsProfile | null {
  return peek<EsProfile>(g, 'sports.esports')
}

export function esportsJob(g: GameState): Job | null {
  return myJob(g, 'sports.esports')
}

function ej(job: Job): EsJob {
  return view<EsJob>(job.data)
}

function skill(g: GameState, p: EsProfile): number {
  const a = p.attrs
  let s = (a.Mechanics ?? 0) * 0.4 + (a['Game Sense'] ?? 0) * 0.3 + (a.Teamwork ?? 0) * 0.15 + (a.Mental ?? 0) * 0.15
  // Reaction time peaks in your early twenties.
  const age = g.character.age
  if (age > 25) s -= (age - 25) * 0.8
  if (hasTalent(g, 'Gaming')) s += 6
  return Math.max(1, Math.min(99, Math.round(s)))
}

/** How much each attribute counts toward your overall level (see skill()). */
function attrWeight(a: string): number {
  return a === 'Mechanics' ? 0.4 : a === 'Game Sense' ? 0.3 : 0.15
}

function tierOf(mmr: number): string {
  return TIERS[Math.max(0, Math.min(TIERS.length - 1, Math.floor(mmr / 400)))] ?? 'Bronze'
}

function region(g: GameState): string {
  const c = getCountry(g.character.countryId)
  const special: Record<string, string> = { kr: 'Korean', cn: 'Chinese', jp: 'Japanese', br: 'Brazilian', vn: 'Vietnamese' }
  if (special[c.id]) return special[c.id]
  switch (c.continent) {
    case 'North America':
      return 'North American'
    case 'South America':
      return 'Latin American'
    case 'Europe':
      return 'European'
    case 'Africa':
      return 'African'
    case 'Middle East':
      return 'Middle Eastern'
    case 'Oceania':
      return 'Oceanic'
    default:
      return 'Asia-Pacific'
  }
}

/** Gaming PC, laptop or console. */
function hasSetup(g: GameState): boolean {
  return g.assets.some((a) => a.condition > 0 && /\b(laptop|gaming pc|computer|desktop|pc|macbook|workstation|console)\b/i.test(a.name))
}

const ESPORTS_HOTSPOTS = new Set(['kr', 'cn', 'vn', 'ph', 'br', 'dk', 'se', 'fi', 'ua', 'ru'])

// ---------------------------------------------------------------------------
// The ladder (amateur)

const pickGameScript = defineScript('sports.es.pickGame', (g, choice) => {
  if (choice === 'cancel') return
  const gm = ES_GAMES.find((x) => x.id === choice)
  if (!gm) return
  const p = es(g)
  p.game = gm.id
  if (typeof p.mmr[gm.id] !== 'number') p.mmr[gm.id] = randInt(g, 300, 700)
  log(g, `I started playing ${gm.name} competitively.`)
  say(g, gm.name, `Your main game is now ${gm.name} (${gm.genre}). Current rank: ${tierOf(p.mmr[gm.id])}.`, gm.emoji)
})

function grind(g: GameState): void {
  const p = es(g)
  const gm = game(p.game)
  if (!useYearAction(g, 'sports.es.grind', 3)) return tell(g, 'Ranked', "You've played so much this year your mouse has a groove worn into it. Touch grass.", '\u{1F331}')
  const s = skill(g, p)
  const gamer = hasTalent(g, 'Gaming')
  for (const a of ['Mechanics', 'Game Sense'] as const) p.attrs[a] = Math.min(100, (p.attrs[a] ?? 0) + trainGain(g, p.attrs[a] ?? 0, 2, 4, (g.character.age < 22 ? 1.2 : 0.9) * (gamer ? 1.5 : 1)))
  const mmr = p.mmr[gm.id] ?? 500
  const target = s * 35
  // Gaming talent: you climb toward your true rank much faster.
  const next = Math.max(0, Math.round(mmr + (target - mmr) * (0.3 + rand(g) * 0.2 + (gamer ? 0.15 : 0)) + bell(g, -120, 120)))
  p.mmr[gm.id] = next
  addStat(g, 'health', -1)
  const up = next > mmr
  let extra = ''
  if (g.character.age < 18 && chance(g, 0.25)) {
    addStat(g, 'happiness', -2)
    extra = ' Then your parents unplugged the router mid-match. You lost 30 points and your dignity.'
  }
  log(g, `I grinded ranked ${gm.name}.`)
  say(g, 'Ranked Grind', `${pick(g, up ? ['You went on a 12-game win streak and carried every lobby.', 'Your aim was crisp. Your teammates called you a smurf.', 'You climbed while eating cold pizza at 3 a.m.'] : ['Your teammates threw every game. Definitely their fault.', 'You lost eight in a row and blamed your internet.', 'You tilted so hard you uninstalled, then reinstalled ten minutes later.'])}${extra} Rank: ${tierOf(next)} (${next} rating).`, gm.emoji, up ? 'good' : 'neutral')
}

function cup(g: GameState): void {
  const p = es(g)
  const gm = game(p.game)
  if (!useYearAction(g, 'sports.es.cup', 2)) return tell(g, 'Online Cup', 'You already entered enough online cups this year.', '\u{1F3C6}')
  const mmr = p.mmr[gm.id] ?? 0
  const perf = mmr / 35 + bell(g, -10, 10) + (hasTalent(g, 'Gaming') ? 4 : 0)
  const place = Math.max(1, Math.min(64, Math.round(64 / (1 + Math.exp((perf - 62) / 6)))))
  const prize = place === 1 ? tidy(1_000 + mmr) : place <= 4 ? tidy(200 + mmr / 5) : 0
  if (prize) {
    earnIncome(g, prize)
    p.earnings += prize
  }
  if (place === 1) {
    p.cups += 1
    count(g, 'sportsTitles')
    honor(g, `Won an online ${gm.name} cup.`, `Online ${gm.name} cup winner`, gm.name, 4)
  }
  log(g, `I ${place === 1 ? 'won' : `finished ${ordinal(place)} in`} an online ${gm.name} cup.`, place === 1 ? 'good' : 'neutral')
  say(g, 'Online Cup', place === 1 ? `You won the online cup and ${short(prize)}! Pro scouts lurk in these lobbies.` : `You finished ${ordinal(place)} out of 64${prize ? ` and won ${short(prize)}` : ''}.`, gm.emoji, place <= 4 ? 'good' : 'neutral')
}

interface TeamOffer {
  game: string
  team: string
  strength: number
  tier: number
  salary: number
}

const signScript = defineScript('sports.es.sign', (g, choice, data) => {
  if (choice === 'cancel') return
  const offers = data as unknown as TeamOffer[]
  const o = offers?.[Number(choice)]
  if (!o) return
  const gm = game(o.game)
  // One signing a year: retiring and re-signing can't reset the event calendar.
  if (!useYearAction(g, 'sports.es.sign', 1)) return tell(g, 'Team Offers', 'You already went pro once this year. Teams will look at you again next season.', gm.emoji)
  const p = es(g)
  p.retiredAge = null
  const { quit } = hire(g, {
    defId: 'sports.esports',
    title: `Esports Pro (${gm.name})`,
    company: o.team,
    salary: o.salary,
    data: { game: o.game, team: o.team, teamStrength: o.strength, tier: o.tier, contractYears: randInt(g, 1, 3), played: [], results: [], earned: 0 },
  })
  addFame(g, 3)
  addStat(g, 'happiness', 12)
  log(g, `I signed with ${o.team} as a pro ${gm.name} player.`, 'good')
  say(g, 'Signed!', `You signed with ${o.team}${o.tier === 0 ? "'s academy roster" : ''} for ${money(o.salary)} a year. You moved into a gaming house with four other people who also never open the curtains.${quitNote(quit)}`, gm.emoji, 'good')
})

function proReason(g: GameState): string | null {
  const gate = sportsGate(g, 16)
  if (gate) return gate
  if (esportsJob(g)) return "You're already an esports pro."
  if (yearActionsUsed(g, 'sports.es.sign') > 0) return 'You already went pro once this year. Teams will look at you again next season.'
  const p = viewEs(g)
  if (!p?.game) return 'Pick your main game first.'
  if (g.character.age > 30) return 'Teams want reflexes. At your age they offer you a coaching job, not a roster spot.'
  const mmr = p.mmr[p.game] ?? 0
  if (mmr < 2000 && p.cups === 0) return `Teams only scout Master rank and above (you're ${tierOf(mmr)}), or online cup winners.`
  return null
}

function teamOffers(g: GameState, p: EsProfile): TeamOffer[] {
  const gm = game(p.game)
  const s = skill(g, p)
  const mmr = p.mmr[gm.id] ?? 0
  const out: TeamOffer[] = []
  const city = randomCity(g, getCountry(g.character.countryId))
  out.push({ game: gm.id, team: gm.team ? `${pick(g, TEAMS)} Academy` : `${city} Fight Club Gaming`, strength: randInt(g, 40, 65), tier: 0, salary: tidy(18_000 * Math.max(0.4, wealth(g)) + s * 300) })
  if (mmr >= 2800 || s >= 70) {
    const team = pick(g, TEAMS)
    out.push({ game: gm.id, team, strength: randInt(g, 55, 90), tier: 1, salary: tidy(Math.min(MAX_SALARY, 60_000 + Math.max(0, s - 60) ** 2 * 900)) })
  }
  return out
}

function esportsAmateurNodes(): MenuNode[] {
  const needSetup = (g: GameState) => {
    if (!hasSetup(g)) return 'You need a gaming PC, laptop or console (Shopping › Electronics).'
    // Same rule as computer.ts computerLocked: grounded from screens until a set age.
    const until = g.flags.computerLockedUntil
    if (typeof until === 'number' && g.character.age < until) return `${typeof g.flags.computerLockedBy === 'string' ? g.flags.computerLockedBy : 'Your parents'} took your computer away until you're ${until}.`
    return null
  }
  return [
    {
      type: 'action',
      id: 'sports.es.game',
      label: 'Choose Your Main Game',
      emoji: '\u{1F3AE}',
      subtitle: (g) => {
        const p = viewEs(g)
        return p?.game ? `${game(p.game).name} · ${tierOf(p.mmr[p.game] ?? 0)}` : 'MOBA, shooter, battle royale, car soccer or fighting games'
      },
      disabledReason: (g) => sportsGate(g, 10),
      run: (g) => scriptChoice(g, pickGameScript, 'Main Game', 'Which game do you want to get good at?', [...ES_GAMES.map((x) => ({ id: x.id, label: `${x.name} (${x.genre})`, emoji: x.emoji })), { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' }], { emoji: '\u{1F3AE}' }),
    },
    {
      type: 'action',
      id: 'sports.es.grind',
      label: 'Grind Ranked',
      emoji: '\u{1F4C8}',
      subtitle: 'Climb the ladder (3 sessions a year)',
      disabledReason: (g) => sportsGate(g, 10) ?? (viewEs(g)?.game ? null : 'Choose your main game first.') ?? needSetup(g),
      run: grind,
    },
    {
      type: 'action',
      id: 'sports.es.cup',
      label: 'Enter an Online Cup',
      emoji: '\u{1F3C6}',
      subtitle: 'Small prizes, big scouting (twice a year)',
      disabledReason: (g) => sportsGate(g, 13) ?? (viewEs(g)?.game ? null : 'Choose your main game first.') ?? needSetup(g),
      run: cup,
    },
    {
      type: 'action',
      id: 'sports.es.pro',
      label: 'Go Pro',
      emoji: '\u{1F31F}',
      subtitle: 'Get signed by a team (16+)',
      disabledReason: proReason,
      confirm: (g) => (g.character.job ? `Gaming full-time means quitting your job as ${g.character.job.title}. Continue?` : null),
      run: (g) => {
        const p = es(g)
        // The year's offers stay put (backing out can't reroll a stronger team); a new tier of
        // offers opens once you're good enough for the pro league.
        const pro = (p.mmr[game(p.game).id] ?? 0) >= 2800 || skill(g, p) >= 70
        const offers = yearlyList<TeamOffer>(g, `sports.es.offers.${p.game}.${pro ? 'pro' : 'academy'}`, () => teamOffers(g, p))
        scriptChoice(g, signScript, 'Team Offers', 'Teams slid into your DMs.', [...offers.map((o, i) => ({ id: String(i), label: `${o.team}${o.tier === 0 ? ' (academy)' : ''} · ${short(o.salary)}/yr`, emoji: game(o.game).emoji })), { id: 'cancel', label: 'Not yet', emoji: '\u{274C}' }], { emoji: '\u{1F3AE}', data: offers as unknown as Json })
      },
    },
  ]
}

// ---------------------------------------------------------------------------
// Pro career

interface FinalData {
  event: string
  name: string
  pool: number
  teams: number
  base: number
  opp: string
}

function shareOf(place: number, teams: number): number {
  if (place === 1) return 0.4
  if (place === 2) return 0.18
  if (place <= 4) return 0.09
  if (place <= 8) return 0.035
  if (place <= Math.min(16, teams)) return 0.012
  return 0.003
}

function playerCut(gm: EsGame, teamPrize: number): number {
  // Team games: five players split the team's winnings after the organization's cut.
  return tidy(gm.team ? (teamPrize * 0.8) / 5 : teamPrize)
}

function bookEs(g: GameState, job: Job, ev: EsEvent, name: string, place: number, auto: boolean): string {
  const d = ej(job)
  const gm = game(d.game)
  const p = es(g)
  const prize = playerCut(gm, ev.pool * shareOf(place, ev.teams))
  if (prize > 0) {
    earnIncome(g, prize)
    d.earned += prize
    p.earnings += prize
  }
  let line = `${ordinal(place)} at ${theName(name)}`
  if (place === 1) {
    line = `won ${theName(name)}`
    p.titles.push(`${name} (${g.year})`)
    count(g, 'sportsTitles')
    addFame(g, ev.tier === 'finals' ? 10 : ev.tier === 'major' ? 5 : 2)
    addBuzz(g, ev.tier === 'finals' ? 25 : 8)
    if (ev.tier !== 'tour') {
      count(g, 'championships')
      honor(g, `Won ${theName(name)}.`, ev.tier === 'finals' ? `${gm.name} world champion` : `${gm.name} major champion`, gm.name, ev.tier === 'finals' ? 9 : 7)
    }
  }
  if (!d.played.includes(ev.id)) d.played.push(ev.id)
  if (!auto || place <= 4) d.results.push(`${line}${prize ? ` (${short(prize)})` : ''}`)
  return line
}

function eventPerf(g: GameState, job: Job): number {
  const d = ej(job)
  const p = es(g)
  const s = skill(g, p)
  return game(d.game).team ? d.teamStrength * 0.55 + s * 0.45 : s
}

function eventPlace(g: GameState, perf: number, ev: EsEvent): number {
  const lvl = ev.tier === 'finals' ? 80 : ev.tier === 'major' ? 74 : 62
  const n = ev.teams
  const count0 = (n - 1) / (1 + Math.exp((perf + bell(g, -8, 8) - (lvl - 10)) / 3.5))
  return Math.max(1, Math.min(n, 1 + Math.round(count0)))
}

const finalScript = defineScript('sports.es.final', (g, choice, data) => {
  const f = data as unknown as FinalData
  const job = esportsJob(g)
  if (!job || !f) return
  const gm = game(ej(job).game)
  const ev = gm.events.find((e) => e.id === f.event)
  if (!ev) return
  const p = es(g)
  let prob = f.base
  if (choice === 'flank') prob += (p.attrs.Mechanics ?? 50) >= 70 ? 0.12 : -0.05
  else if (choice === 'safe') prob += 0.03
  else prob += ((p.attrs['Game Sense'] ?? 50) - 55) / 200 + 0.04
  const won = chance(g, Math.max(0.05, Math.min(0.95, prob)))
  bookEs(g, job, ev, f.name, won ? 1 : 2, false)
  const lead = won ? `${pick(g, ['You hit an impossible clutch and the arena exploded.', 'Your call won the final fight and the trophy.', 'You popped off. The caster lost his voice screaming your name.'])}` : `${pick(g, ['You whiffed the clutch play. The clip will haunt you forever.', `${f.opp} out-played you in the deciding map.`, 'Your team collapsed in the last fight.'])}`
  log(g, won ? `We won ${theName(f.name)}!` : `We lost the grand final of ${theName(f.name)}.`, won ? 'good' : 'neutral')
  say(g, won ? 'CHAMPIONS!' : 'Grand Final', `${lead} ${won ? `You won ${theName(f.name)}!` : `Runners-up at ${theName(f.name)}.`}`, won ? '\u{1F3C6}' : gm.emoji, won ? 'good' : 'neutral')
})

const enterScript = defineScript('sports.es.enter', (g, choice) => {
  if (choice === 'cancel') return
  const job = esportsJob(g)
  if (!job) return
  const d = ej(job)
  const gm = game(d.game)
  const ev = gm.events.find((e) => e.id === choice)
  if (!ev || d.played.includes(ev.id) || (ev.minTier ?? 0) > d.tier) return
  const name = fillEvent(g, ev.name)
  const place = eventPlace(g, eventPerf(g, job), ev)
  if (place <= 2) {
    const opp = pick(g, TEAMS.filter((t) => t !== d.team && !t.startsWith(d.team)))
    const base = logistic((eventPerf(g, job) - (ev.tier === 'finals' ? 80 : ev.tier === 'major' ? 74 : 64)) / 6)
    scriptChoice(
      g,
      finalScript,
      'Grand Final',
      `You made the grand final of ${theName(name)} against ${opp}. Deciding map, last round, everything on the line.`,
      [
        { id: 'flank', label: 'Go for the hero flank', emoji: '\u{1F525}' },
        { id: 'safe', label: 'Play it safe and trade', emoji: '\u{1F9CA}' },
        { id: 'call', label: 'Call a tactical timeout', emoji: '\u{1F9E0}' },
      ],
      { emoji: gm.emoji, data: { event: ev.id, name, pool: ev.pool, teams: ev.teams, base, opp } as unknown as Json },
    )
    return
  }
  const line = bookEs(g, job, ev, name, place, false)
  log(g, `We ${line}.`)
  say(g, name, `Your ${gm.team ? 'team' : 'run'} ${line.replace(/^won/, 'won')}.`, gm.emoji)
})

const HOST_CITIES = ['Seoul', 'Los Angeles', 'Berlin', 'Shanghai', 'São Paulo', 'Stockholm', 'Katowice', 'Singapore', 'Paris', 'Tokyo', 'Copenhagen', 'Riyadh']

function fillEvent(g: GameState, name: string, year = g.year): string {
  // The host city is fixed for the year so the calendar reads the same everywhere.
  const city = HOST_CITIES[(year * 7 + name.length) % HOST_CITIES.length]
  return name.replace('{region}', region(g)).replace('{city}', city)
}

const scrimScript = defineScript('sports.es.scrim', (g, choice) => {
  if (!ATTRS.includes(choice) || !esportsJob(g)) return
  if (!useYearAction(g, `sports.es.scrim.${choice}`, 1)) return tell(g, 'Scrims', `You already focused on ${choice.toLowerCase()} this year.`, '\u{1F971}')
  const p = es(g)
  p.attrs[choice] = Math.min(100, (p.attrs[choice] ?? 0) + trainGain(g, p.attrs[choice] ?? 0, 3, 6, (g.character.age < 23 ? 1.2 : 0.9) * talentMult(g, 'Gaming', 1.5)))
  addStat(g, 'health', -1)
  log(g, `I practiced ${choice.toLowerCase()} in scrims.`)
  say(g, 'Scrims', `${pick(g, ['Twelve hours of scrims and one cold energy drink.', 'Your coach made you rewatch your worst games in slow motion.', 'You ran the same drill 400 times. Your wrist hates you.'])} ${choice}: ${p.attrs[choice]}%.`, '\u{1F5A5}\u{FE0F}', 'good')
})

export function esportsJobNodes(g: GameState): MenuNode[] {
  const job = esportsJob(g)
  if (!job) return []
  const d = ej(job)
  const gm = game(d.game)
  const p = viewEs(g)
  const actions: MenuAction[] = [
    {
      type: 'action',
      id: 'sports.es.compete',
      label: 'Compete',
      emoji: '\u{1F3C6}',
      subtitle: 'Play an event on the circuit',
      disabledReason: (gg) => sportsGate(gg, 0),
      run: (gg) => {
        const evs = gm.events.filter((e) => !d.played.includes(e.id) && (e.minTier ?? 0) <= d.tier)
        if (!evs.length) return tell(gg, 'Circuit', "You've played every event you qualified for this year.", gm.emoji)
        scriptChoice(gg, enterScript, 'Circuit', `${d.team} (team rating ${d.teamStrength}%). Which event?`, [...evs.map((e) => ({ id: e.id, label: `${fillEvent(gg, e.name)} · ${short(e.pool)} prize pool`, emoji: e.tier === 'finals' ? '\u{1F30D}' : e.tier === 'major' ? '\u{1F31F}' : gm.emoji })), { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' }], { emoji: gm.emoji })
      },
    },
    {
      type: 'action',
      id: 'sports.es.scrims',
      label: 'Scrims & Practice',
      emoji: '\u{1F5A5}\u{FE0F}',
      subtitle: 'Each skill once a year',
      disabledReason: (gg) => sportsGate(gg, 0),
      run: (gg) => {
        const attrs = viewEs(gg)?.attrs ?? {}
        // Gaming talent: you know what's really holding your level back.
        const weak = hasTalent(gg, 'Gaming') ? ATTRS.filter((a) => !gg.yearActions[`sports.es.scrim.${a}`]).reduce<string | null>((best, a) => (best === null || attrWeight(a) * (1 - (attrs[a] ?? 0) / 115) > attrWeight(best) * (1 - (attrs[best] ?? 0) / 115) ? a : best), null) : null
        scriptChoice(
          gg,
          scrimScript,
          'Scrims',
          'What do you work on?',
          [
            ...ATTRS.map((a) => ({ id: a, label: `${a} (${attrs[a] ?? 0}%)`, emoji: '\u{1F3AF}', ...(a === weak ? { hint: talentHint(gg, 'Gaming', 'This is what is really holding your level back.') } : {}) })),
            { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' },
          ],
          { emoji: '\u{1F5A5}\u{FE0F}' },
        )
      },
    },
    {
      type: 'action',
      id: 'sports.es.stream',
      label: 'Stream',
      emoji: '\u{1F4F9}',
      subtitle: 'Grow your fanbase (once a year)',
      visible: (gg) => eraOpen(gg, STREAMING_GATE),
      disabledReason: (gg) => sportsGate(gg, 0),
      run: (gg) => {
        if (!useYearAction(gg, 'sports.es.stream', 1)) return tell(gg, 'Stream', 'You already streamed until your voice gave out this year.', '\u{1F4F9}')
        const fame = gg.character.hidden.fame
        if (chance(gg, 0.12)) {
          addHidden(gg, 'notoriety', 3)
          addFame(gg, 2)
          es(gg).attrs.Mental = Math.max(1, (es(gg).attrs.Mental ?? 50) - 3)
          return say(gg, 'Stream Meltdown', 'You raged at a teammate live on stream and threw your keyboard. The clip has nine million views. Your team issued a statement. Your mom called.', '\u{1F92C}', 'bad')
        }
        const income = tidy(500 + fame * fame * 40)
        earnIncome(gg, income)
        addFame(gg, 2)
        say(gg, 'Stream', `You streamed ranked games for 14 hours and made ${short(income)} from subs and donations. Chat spammed your emote.`, '\u{1F4F9}', 'good')
      },
    },
    {
      type: 'action',
      id: 'sports.es.retire',
      label: 'Retire',
      emoji: '\u{1F3D6}\u{FE0F}',
      subtitle: 'Hang up the headset',
      confirm: () => 'Retire from pro gaming?',
      run: (gg) => retireEs(gg),
    },
  ]
  return [
    { type: 'info', id: 'sports.es.status', emoji: gm.emoji, text: `${gm.name} · ${d.team}${d.tier === 0 ? ' Academy' : ''} · level ${p ? skill(g, p) : 0}/100 · ${short(d.earned)} in winnings this year` },
    ...actions,
    {
      type: 'menu',
      id: 'sports.es.record',
      label: 'Career',
      emoji: '\u{1F4CB}',
      subtitle: () => `${plural(p?.titles.length ?? 0, 'title')} · ${short(p?.earnings ?? 0)} earnings`,
      children: (): MenuNode[] => {
        const nodes: MenuNode[] = [{ type: 'info', id: 'sports.es.r.a', emoji: '\u{1F3AF}', text: ATTRS.map((a) => `${a} ${p?.attrs[a] ?? 0}`).join(' · ') }]
        ;(p?.titles ?? []).slice(-6).forEach((t, i) => nodes.push({ type: 'info', id: `sports.es.r.t${i}`, emoji: '\u{1F3C6}', text: t }))
        d.results.slice(-5).forEach((r, i) => nodes.push({ type: 'info', id: `sports.es.r.r${i}`, emoji: '\u{1F4CB}', text: `This year: ${r}` }))
        return nodes
      },
    },
  ]
}

function retireEs(g: GameState): void {
  const job = esportsJob(g)
  if (!job) return
  const p = es(g)
  const gm = game(ej(job).game)
  p.retiredAge = g.character.age
  const majors = p.titles.filter((t) => /Masters|Major|World|Grand Brawl|Invitational|Combo Kings/.test(t)).length
  recordCareer(g, { sport: `${gm.name} (esports)`, kind: 'esports', from: p.startAge, best: majors ? plural(majors, 'major title') : plural(p.titles.length, 'title'), legacy: Math.min(100, majors * 15 + p.titles.length * 4) })
  leave(g, 'retired')
  log(g, `I retired from pro ${gm.name}.`, 'event')
  say(g, 'Retired', `You retired from competitive ${gm.name} at ${g.character.age} (ancient, in esports years) with ${p.titles.length} title${p.titles.length === 1 ? '' : 's'} and ${short(p.earnings)} in prize money.`, '\u{1F3C5}', 'good')
}

export const esportsMenu: MenuGroup = {
  type: 'menu',
  id: 'sports.esports',
  label: 'Esports',
  emoji: '\u{1F3AE}',
  subtitle: (g) => {
    const job = esportsJob(g)
    if (job) return `Pro · ${game(ej(job).game).name}`
    const p = viewEs(g)
    if (p?.game) return `${game(p.game).name} · ${tierOf(p.mmr[p.game] ?? 0)}`
    return ESPORTS_HOTSPOTS.has(g.character.countryId) ? `Huge in ${getCountry(g.character.countryId).name}` : 'Competitive gaming: teams, tournaments, prize pools'
  },
  // Pro gaming with teams and prize pools only exists once esports does here (an old pro keeps the menu).
  visible: (g) => eraOpen(g, ESPORTS_GATE) || !!esportsJob(g) || !!viewEs(g)?.game,
  header: () => 'Climb the ranked ladder, win online cups, get signed by a team and play for million-dollar prize pools. Reflexes peak in your early twenties.',
  children: (g): MenuNode[] => {
    if (esportsJob(g)) return [{ type: 'info', id: 'sports.es.in', emoji: '\u{1F3AE}', text: "You're an esports pro. Manage your career from Occupation › My Work." }]
    return esportsAmateurNodes()
  },
}

// ---------------------------------------------------------------------------
// Yearly

const renewScript = defineScript('sports.es.renew', (g, choice, data) => {
  const job = esportsJob(g)
  const o = data as unknown as { salary: number; up: TeamOffer | null }
  if (!job || !o) return
  const d = ej(job)
  if (choice === 'up' && o.up) {
    d.team = o.up.team
    d.teamStrength = o.up.strength
    d.tier = o.up.tier
    d.contractYears = randInt(g, 1, 3)
    job.company = o.up.team
    job.salary = o.up.salary
    log(g, `I signed with ${o.up.team}.`, 'good')
    return say(g, 'New Team', `You signed with ${o.up.team} for ${money(o.up.salary)} a year.`, '\u{1F3AE}', 'good')
  }
  if (choice === 'retire') return retireEs(g)
  d.contractYears = randInt(g, 1, 2)
  job.salary = o.salary
  log(g, `I re-signed with ${d.team}.`)
})

export function yearlyEsports(g: GameState): void {
  const c = g.character
  if (!c.alive || c.prison) return
  const p0 = viewEs(g)
  if (p0 && c.age > 24) {
    const p = es(g)
    p.attrs.Mechanics = Math.max(1, (p.attrs.Mechanics ?? 0) - randInt(g, 0, 2))
  }
  const job = esportsJob(g)
  if (!job) return
  syncTenure(g, job)
  const d = ej(job)
  const gm = game(d.game)
  const p = es(g)
  // The rest of the season.
  for (const ev of gm.events) {
    if (d.played.includes(ev.id) || (ev.minTier ?? 0) > d.tier) continue
    bookEs(g, job, ev, fillEvent(g, ev.name, g.year - 1), eventPlace(g, eventPerf(g, job), ev), true)
  }
  earnIncome(g, job.salary)
  const wins = p.titles.filter((t) => t.endsWith(`(${g.year - 1})`) || t.endsWith(`(${g.year})`)).length
  fameToward(g, d.tier === 1 ? 20 + skill(g, p) * 0.4 + wins * 5 : 8, 4)
  d.teamStrength = Math.max(30, Math.min(95, d.teamStrength + randInt(g, -6, 6)))
  const results = d.results.slice(-4).join('; ')
  say(g, 'Esports Season', `${d.team}: ${results || 'a quiet year'}. Salary ${short(job.salary)}, winnings ${short(d.earned)}.`, gm.emoji, wins ? 'good' : 'neutral')
  d.earned = 0
  d.played = []
  d.results = []
  if (c.age >= 33 || (c.age >= 28 && skill(g, p) < 45)) return retireEs(g)
  d.contractYears -= 1
  if (d.contractYears <= 0) {
    const s = skill(g, p)
    // Raises follow form, but no team pays more than the market's top contract.
    const salary = tidy(Math.min(MAX_SALARY, Math.max(15_000, job.salary * (s >= 70 ? 1.3 : s >= 55 ? 1 : 0.7))))
    const up: TeamOffer | null =
      s >= 68 && d.tier === 0
        ? { game: gm.id, team: pick(g, TEAMS), strength: randInt(g, 60, 90), tier: 1, salary: tidy(Math.min(MAX_SALARY, 80_000 + (s - 60) ** 2 * 1_200)) }
        : s >= 80 && chance(g, 0.5)
          ? { game: gm.id, team: pick(g, TEAMS.filter((t) => t !== d.team)), strength: randInt(g, 75, 95), tier: 1, salary: tidy(Math.min(MAX_SALARY, Math.max(salary, salary * 1.5))) }
          : null
    scriptChoice(
      g,
      renewScript,
      'Contract Up',
      `Your contract with ${d.team} is up. They offer ${money(salary)} a year.${up ? ` ${up.team} wants you for ${money(up.salary)} a year.` : ''}`,
      [
        { id: 'stay', label: `Re-sign (${short(salary)}/yr)`, emoji: '\u{270D}\u{FE0F}' },
        ...(up ? [{ id: 'up', label: `Join ${up.team}`, emoji: '\u{1F504}' }] : []),
        { id: 'retire', label: 'Retire', emoji: '\u{1F3D6}\u{FE0F}' },
      ],
      { emoji: gm.emoji, data: { salary, up } as unknown as Json },
    )
  }
}
