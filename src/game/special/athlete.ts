// Special career: Professional Athlete. Pick a sport and league, try out for a team, sign
// contracts, practice your skills and fitness, play seasons, win championships and awards,
// avoid (or embrace) doping and bribes, get traded, retire, and maybe reach the Hall of Fame.
import { addHidden, addMoney, addStat, count, earnIncome, log, remember, scriptChoice, useYearAction } from '../core'
import { arrestPlayer } from '../crime'
import { chance, pick, rand, randInt, shuffle, uid } from '../rng'
import { defineScript } from '../scripts'
import type { GameState, Job, Json, MenuAction, MenuGroup, MenuNode } from '../types'
import { addFame, attendedUniversity, blocked, clamp100, fameToward, hire, leave, money, myJob, ordinal, peek, prof, quitNote, say, short, syncTenure, talentMatches, tell, view } from './common'

// ---------------------------------------------------------------------------
// Sports & leagues

interface Sport {
  id: string
  name: string
  emoji: string
  skills: string[]
  positions: string[]
  needsUniversity: boolean
}

const SPORTS: Sport[] = [
  { id: 'football', name: 'American Football', emoji: '\u{1F3C8}', skills: ['Passing', 'Rushing', 'Catching', 'Tackling', 'Celebrations'], positions: ['Quarterback', 'Running Back', 'Wide Receiver', 'Linebacker', 'Cornerback'], needsUniversity: true },
  { id: 'baseball', name: 'Baseball', emoji: '\u{26BE}', skills: ['Base Running', 'Catching', 'Celebrations', 'Fielding', 'Hitting', 'Throwing'], positions: ['Pitcher', 'Catcher', 'First Baseman', 'Shortstop', 'Center Fielder'], needsUniversity: false },
  { id: 'basketball', name: 'Basketball', emoji: '\u{1F3C0}', skills: ['Celebrations', 'Defending', 'Dribbling', 'Passing', 'Rebounding', 'Shooting', 'Tricks'], positions: ['Point Guard', 'Shooting Guard', 'Small Forward', 'Power Forward', 'Center'], needsUniversity: false },
  { id: 'hockey', name: 'Hockey', emoji: '\u{1F3D2}', skills: ['Celebrations', 'Defending', 'Passing', 'Shooting', 'Skating', 'Stick Handling', 'Tricks'], positions: ['Center', 'Winger', 'Defenseman', 'Goaltender'], needsUniversity: false },
  { id: 'soccer', name: 'Soccer', emoji: '\u{26BD}', skills: ['Celebrations', 'Defending', 'Dribbling', 'Headers', 'Passing', 'Shooting', 'Tricks'], positions: ['Striker', 'Winger', 'Midfielder', 'Defender', 'Goalkeeper'], needsUniversity: false },
  { id: 'rugby', name: 'Rugby', emoji: '\u{1F3C9}', skills: ['Celebrations', 'Kicking', 'Passing', 'Running', 'Scrummaging', 'Tackling'], positions: ['Hooker', 'Fly-half', 'Prop', 'Winger', 'Fullback'], needsUniversity: false },
  { id: 'volleyball', name: 'Volleyball', emoji: '\u{1F3D0}', skills: ['Blocking', 'Bumping', 'Celebrations', 'Digging', 'Serving', 'Setting', 'Spiking'], positions: ['Outside Hitter', 'Setter', 'Libero', 'Middle Blocker', 'Opposite'], needsUniversity: false },
]

interface League {
  id: string
  name: string
  sport: string
  gender: 'male' | 'female'
  country: string
  minPay: number
  maxPay: number
  teams: string[]
}

const UK_SOCCER = ['Riverside United', 'Kingsbridge City', 'Northgate Athletic', 'Ashford Wanderers', 'Westcliff Albion', 'Hartley Town', 'Blackmoor Rovers', 'Port Ellis FC', "St. Edmund's FC", 'Castleton Forest']

const LEAGUES: League[] = [
  { id: 'gridiron', name: 'Pro Gridiron League', sport: 'football', gender: 'male', country: 'United States', minPay: 750_000, maxPay: 45_000_000, teams: ['Arizona Scorpions', 'Atlanta Firebirds', 'Boston Lobsters', 'Chicago Gusts', 'Dallas Stampede', 'Denver Peaks', 'Green Bay Curds', 'Houston Wildcatters', 'Miami Riptide', 'Seattle Drizzle'] },
  { id: 'hoops', name: 'Premier Basketball Association', sport: 'basketball', gender: 'male', country: 'United States', minPay: 1_100_000, maxPay: 50_000_000, teams: ['Atlanta Hotshots', 'Boston Clovers', 'Brooklyn Bridges', 'Chicago Windbreakers', 'Denver Altitude', 'Golden State Prospectors', 'Los Angeles Starlets', 'Miami Flamingos', 'Phoenix Scorchers', 'Toronto Moose'] },
  { id: 'hoopsW', name: "Women's Premier Basketball Association", sport: 'basketball', gender: 'female', country: 'United States', minPay: 65_000, maxPay: 250_000, teams: ['Atlanta Sweet Teas', 'Chicago Breeze', 'Connecticut Foxes', 'Dallas Lassos', 'Indiana Racers', 'Las Vegas Jackpots', 'Los Angeles Palms', 'Minnesota Loons', 'Phoenix Sunbirds', 'Seattle Orcas'] },
  { id: 'diamond', name: 'Major Diamond League', sport: 'baseball', gender: 'male', country: 'United States', minPay: 700_000, maxPay: 40_000_000, teams: ['Arizona Rattlers', 'Baltimore Harbormasters', 'Boston Beantowners', 'Chicago Alley Cats', 'Cincinnati Chili Dogs', 'Detroit Motors', 'Houston Orbiters', 'Los Angeles Surfers', 'New York Knights', 'Seattle Salmon'] },
  { id: 'ice', name: 'Continental Hockey League', sport: 'hockey', gender: 'male', country: 'United States', minPay: 750_000, maxPay: 13_000_000, teams: ['Calgary Chinooks', 'Chicago Blizzards', 'Colorado Snowcaps', 'Detroit Pucksters', 'Edmonton Roughnecks', 'Las Vegas Neon', 'Montreal Voyageurs', 'Ottawa Parliamentarians', 'Pittsburgh Steelworkers', 'Vancouver Orcas'] },
  { id: 'eplF', name: 'Albion Premier Football League', sport: 'soccer', gender: 'male', country: 'United Kingdom', minPay: 500_000, maxPay: 25_000_000, teams: UK_SOCCER },
  { id: 'liga', name: 'Liga Ibérica', sport: 'soccer', gender: 'male', country: 'Spain', minPay: 400_000, maxPay: 22_000_000, teams: ['Real Montaña', 'Atlético Sol', 'CD Costa Brava', 'Deportivo Andaluz', 'Valencia Azahar', 'Unión Bilbaína', 'CF Tormenta', 'Racing Meseta', 'UD Alhambra', 'SD Mallorquina'] },
  { id: 'serie', name: 'Serie Azzurra', sport: 'soccer', gender: 'male', country: 'Italy', minPay: 350_000, maxPay: 18_000_000, teams: ['Vesuvio FC', 'Colosseo Roma', 'Laguna Venezia', 'Alpi Torino', 'Gigli Firenze', 'Lanterna Genova', 'Duomo Milano', 'Etna Catania', 'Torre Pisa', 'Sole Palermo'] },
  { id: 'bund', name: 'Bundesklasse', sport: 'soccer', gender: 'male', country: 'Germany', minPay: 350_000, maxPay: 18_000_000, teams: ['SV Rheinwald', 'FC Alpenblick', 'Hanseatic SC', 'VfB Schwarzwald', 'TSV Elbtal', 'SG Ruhrstahl', '1. FC Brückenstadt', 'Eintracht Nordsee', 'Union Spree', 'FC Bergkranz'] },
  { id: 'brasil', name: 'Liga Brasil Ouro', sport: 'soccer', gender: 'male', country: 'Brazil', minPay: 100_000, maxPay: 6_000_000, teams: ['Clube Atlântico', 'Sertão FC', 'Amazonas EC', 'Carioca Praia', 'Paulista Garoa', 'Gaúcho Pampa', 'Mineiro Ouro', 'Recife Maré', 'Bahia Coqueiro', 'Fortaleza Vento'] },
  { id: 'nwsc', name: "National Women's Soccer Circuit", sport: 'soccer', gender: 'female', country: 'United States', minPay: 37_000, maxPay: 350_000, teams: ['Austin Armadillos', 'Boston Harbor FC', 'Carolina Cardinals', 'Chicago Lakeshore FC', 'Houston Heat', 'Jersey Shore FC', 'Portland Roses', 'San Diego Tides', 'Utah Peaks FC', 'Orlando Gators'] },
  { id: 'awsl', name: "Albion Women's Super League", sport: 'soccer', gender: 'female', country: 'United Kingdom', minPay: 30_000, maxPay: 300_000, teams: UK_SOCCER.map((t) => `${t} Women`) },
  { id: 'srl', name: 'Southern Rugby League', sport: 'rugby', gender: 'male', country: 'Australia', minPay: 100_000, maxPay: 1_300_000, teams: ['Brisbane Kookaburras', 'Canberra Magpies', 'Gold Coast Surfers', 'Melbourne Trams', 'Newcastle Coalminers', 'Parramatta Platypuses', 'Penrith Wombats', 'Sydney Harbourmasters', 'Perth Black Swans', 'Darwin Crocs'] },
  { id: 'nsrl', name: 'Northern Super Rugby League', sport: 'rugby', gender: 'male', country: 'United Kingdom', minPay: 60_000, maxPay: 700_000, teams: ['Ironbridge Rams', 'Moorside Miners', 'Harbourside Gulls', 'Pennine Peaks', 'Lancashire Longbows', 'Yorkshire Puddings', 'Teesside Titans', 'Mersey Marauders', 'Hull Trawlers', 'Wigan Pie Eaters'] },
  { id: 'pvl', name: 'Pro Volleyball League', sport: 'volleyball', gender: 'female', country: 'United States', minPay: 30_000, maxPay: 200_000, teams: ['Austin Sunsets', 'Boston Spikers', 'Chicago Diggers', 'Denver Altitudes', 'Honolulu Waves', 'Miami Heatwave', 'Nashville Harmony', 'Omaha Setters', 'Orlando Swirl', 'San Diego Sandcastles'] },
]

function sportOf(id: string | null | undefined): Sport {
  return SPORTS.find((s) => s.id === id) ?? SPORTS[4]
}

function leagueOf(id: string): League {
  return LEAGUES.find((l) => l.id === id) ?? LEAGUES[0]
}

// ---------------------------------------------------------------------------
// State

interface AthleteProfile {
  sport: string | null
  skills: Record<string, number>
  fitness: number
  greatness: number
  peakGreatness: number
  respect: number
  championships: number
  awards: string[]
  seasons: number
  retiredAge: number | null
  hallOfFame: boolean
  bannedUntil: number
}

interface Standing {
  team: string
  strength: number
  rank: number
}

interface AthleteJob {
  league: string
  team: string
  teamStrength: number
  position: string
  contractYears: number
  doping: boolean
  injured: number
  practiced: string[]
  standings: Standing[]
  champion: string | null
}

const initAthlete = (g: GameState): AthleteProfile => ({
  sport: null,
  skills: {},
  fitness: clamp100(g.character.hidden.athleticism * 0.7 + 10),
  greatness: 0,
  peakGreatness: 0,
  respect: 60,
  championships: 0,
  awards: [],
  seasons: 0,
  retiredAge: null,
  hallOfFame: false,
  bannedUntil: -1,
})

function athleteProfile(g: GameState): AthleteProfile {
  return prof(g, 'athlete', initAthlete)
}

function viewAthlete(g: GameState): AthleteProfile {
  return peek<AthleteProfile>(g, 'athlete') ?? initAthlete(g)
}

export function athleteJob(g: GameState): Job | null {
  return myJob(g, 'athlete')
}

function ad(job: Job): AthleteJob {
  return view<AthleteJob>(job.data)
}

function sportsTalent(g: GameState): boolean {
  return talentMatches(g, /athlet|sport/i)
}

/** Make sure the profile tracks this sport, seeding skills from natural athleticism. */
function ensureSport(g: GameState, sport: Sport): AthleteProfile {
  const p = athleteProfile(g)
  if (p.sport !== sport.id) {
    p.sport = sport.id
    p.skills = {}
    const base = g.character.hidden.athleticism * 0.45 + (sportsTalent(g) ? 10 : 0)
    for (const s of sport.skills) p.skills[s] = clamp100(base + randInt(g, 0, 12))
  }
  return p
}

function avgSkill(p: AthleteProfile): number {
  const vals = Object.values(p.skills)
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
}

function salaryFor(league: League, greatness: number, teamStrength: number): number {
  const t = Math.max(0, Math.min(1, (greatness - 20) / 80))
  const raw = league.minPay + (league.maxPay - league.minPay) * t ** 2.2 * (0.8 + teamStrength / 250)
  return Math.round(raw / 10_000) * 10_000
}

// ---------------------------------------------------------------------------
// Tryouts

interface TeamOption {
  league: string
  team: string
  strength: number
}

interface ContractOffer {
  league: string
  team: string
  strength: number
  position: string
  years: number
  salary: number
  trade?: boolean
}

const contractScript = defineScript('special.athlete.contract', (g, choice, data) => {
  const o = data as unknown as ContractOffer
  if (choice !== 'accept') return say(g, o.team, `You turned down the ${o.team}. Their general manager threw a stress ball at the wall.`, '\u{1F4DD}')
  const league = leagueOf(o.league)
  const sport = sportOf(league.sport)
  const existing = athleteJob(g)
  if (existing && o.trade) {
    const d = ad(existing)
    d.team = o.team
    d.teamStrength = o.strength
    d.league = o.league
    existing.company = o.team
    existing.salary = o.salary
    d.contractYears = o.years
    log(g, `I signed with the ${o.team}.`, 'good')
    return say(g, 'Signed', `You signed a ${o.years}-year deal with the ${o.team} worth ${money(o.salary)} a year.`, sport.emoji, 'good')
  }
  const { quit } = hire(g, {
    defId: 'athlete',
    title: `${sport.name} Player`,
    company: o.team,
    salary: o.salary,
    data: { league: o.league, team: o.team, teamStrength: o.strength, position: o.position, contractYears: o.years, doping: false, injured: 0, practiced: [], standings: [], champion: null },
  })
  const p = athleteProfile(g)
  p.retiredAge = null
  addFame(g, 5)
  addStat(g, 'happiness', 15)
  log(g, `I signed with the ${o.team} of the ${league.name}.`, 'good')
  remember(g, `Signed a pro ${sport.name.toLowerCase()} contract with the ${o.team}.`)
  say(g, 'Welcome to the Pros!', `You signed a ${o.years}-year contract with the ${o.team} (${league.name}) worth ${money(o.salary)} a year. You'll play ${o.position}.${quitNote(quit)}`, sport.emoji, 'good')
})

function offerContract(g: GameState, o: ContractOffer, intro: string): void {
  scriptChoice(
    g,
    contractScript,
    o.team,
    `${intro} They're offering a ${o.years}-year contract worth ${money(o.salary)} per year to play ${o.position}.`,
    [
      { id: 'accept', label: 'Sign the contract', emoji: '\u{270D}\u{FE0F}' },
      { id: 'decline', label: 'Decline', emoji: '\u{274C}' },
    ],
    { emoji: sportOf(leagueOf(o.league).sport).emoji, data: o as unknown as Json },
  )
}

const tryoutScript = defineScript('special.athlete.tryout', (g, choice, data) => {
  if (choice === 'cancel') return
  const options = data as unknown as TeamOption[]
  const t = options[Number(choice)]
  if (!t) return
  if (!useYearAction(g, 'athlete.tryout', 2)) return tell(g, 'Tryouts', "You've already tried out for enough teams this year. Your legs are jelly.", '\u{1F971}')
  const c = g.character
  const league = leagueOf(t.league)
  const sport = sportOf(league.sport)
  const p = ensureSport(g, sport)
  const agePenalty = c.age > 30 ? (c.age - 30) * 4 : 0
  const score = c.hidden.athleticism * 0.45 + avgSkill(p) * 0.3 + p.fitness * 0.2 + (sportsTalent(g) ? 10 : 0) + randInt(g, -15, 15) - t.strength * 0.2 - agePenalty
  if (score < 38) {
    log(g, `I tried out for the ${t.team} but didn't make the team.`, 'bad')
    return say(
      g,
      'Tryout',
      pick(g, [
        `The ${t.team} coaches watched you for ten minutes and said "thanks, we'll call you". They won't.`,
        `You pulled a hamstring during the ${t.team} tryout warm-up.`,
        `The ${t.team} said you have "potential", which is coach-speak for "no".`,
      ]),
      sport.emoji,
      'bad',
    )
  }
  const greatness = clamp100(avgSkill(p) * 0.6 + p.fitness * 0.25 + 10)
  const years = randInt(g, 1, 4)
  offerContract(g, { league: t.league, team: t.team, strength: t.strength, position: pick(g, sport.positions), years, salary: salaryFor(league, greatness, t.strength) }, `You impressed the ${t.team} at tryouts!`)
})

const leagueScript = defineScript('special.athlete.league', (g, choice) => {
  if (choice === 'cancel') return
  const league = LEAGUES.find((l) => l.id === choice)
  if (!league) return
  const teams = shuffle(g, league.teams).slice(0, 5)
  const options: TeamOption[] = teams.map((team) => ({ league: league.id, team, strength: randInt(g, 35, 95) }))
  scriptChoice(
    g,
    tryoutScript,
    league.name,
    `Which ${league.name} team do you want to try out for?`,
    [...options.map((o, i) => ({ id: String(i), label: `${o.team} · Strength ${o.strength}%`, emoji: sportOf(league.sport).emoji })), { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' }],
    { emoji: sportOf(league.sport).emoji, data: options as unknown as Json },
  )
})

const sportScript = defineScript('special.athlete.sport', (g, choice) => {
  if (choice === 'cancel') return
  const sport = SPORTS.find((s) => s.id === choice)
  if (!sport) return
  if (sport.needsUniversity && !attendedUniversity(g)) {
    return say(g, sport.name, `Pro ${sport.name.toLowerCase()} teams only scout players who played at university. Go to college first.`, sport.emoji, 'bad')
  }
  const leagues = LEAGUES.filter((l) => l.sport === sport.id && l.gender === g.character.gender)
  if (leagues.length === 0) return say(g, sport.name, `There are no professional ${sport.name.toLowerCase()} leagues for ${g.character.gender === 'male' ? 'men' : 'women'} right now.`, sport.emoji, 'bad')
  scriptChoice(
    g,
    leagueScript,
    sport.name,
    'Which league do you want to play in? (Leagues play home and away games all over the world, so you can sign from anywhere.)',
    [...leagues.map((l) => ({ id: l.id, label: `${l.name} (${l.country})`, emoji: sport.emoji })), { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' }],
    { emoji: sport.emoji },
  )
})

function tryoutReason(g: GameState): string | null {
  const b = blocked(g, 18)
  if (b) return b
  if (g.character.age > 36) return 'You are too old to try out for a professional team.'
  const p = peek<AthleteProfile>(g, 'athlete')
  if (p && p.bannedUntil > g.character.age) return p.bannedUntil >= 999 ? 'You have been banned from professional sports for life.' : `You are banned from professional sports until age ${p.bannedUntil}.`
  return null
}

const tryoutAction: MenuAction = {
  type: 'action',
  id: 'athlete.tryout',
  label: 'Try Out',
  emoji: '\u{1F3C6}',
  subtitle: 'Try out for a professional team',
  disabledReason: tryoutReason,
  confirm: (g) => (g.character.job ? `If a team signs you, you'll quit your job as ${g.character.job.title}. Continue?` : null),
  run: (g) => scriptChoice(g, sportScript, 'Professional Sports', 'Which sport do you want to play professionally?', [...SPORTS.map((s) => ({ id: s.id, label: s.name, emoji: s.emoji })), { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' }], { emoji: '\u{1F3C6}' }),
}

// ---------------------------------------------------------------------------
// Career actions

const practiceScript = defineScript('special.athlete.practice', (g, choice) => {
  if (choice === 'cancel') return
  const job = athleteJob(g)
  if (!job) return
  const d = ad(job)
  const sport = sportOf(leagueOf(d.league).sport)
  const p = ensureSport(g, sport)
  if (!sport.skills.includes(choice)) return
  if (!useYearAction(g, `athlete.practice.${choice}`, 1)) return tell(g, 'Practice', `You've already worked on your ${choice.toLowerCase()} this year.`, '\u{1F971}')
  const gain = randInt(g, 3, 8) + (sportsTalent(g) ? 2 : 0) - (g.character.age > 32 ? 2 : 0)
  p.skills[choice] = clamp100((p.skills[choice] ?? 0) + Math.max(1, gain))
  if (!d.practiced.includes(choice)) d.practiced.push(choice)
  job.performance = clamp100(job.performance + 2)
  const minutes = randInt(g, 25, 90)
  if (chance(g, 0.05)) {
    injure(g, job)
    return
  }
  log(g, choice === 'Celebrations' ? `My teammates and I spent ${minutes} minutes choreographing a touchdown-worthy celebration.` : `I spent ${minutes} minutes practicing my ${choice.toLowerCase()}.`)
  say(g, 'Practice', `${choice === 'Celebrations' ? `You and your teammates spent ${minutes} minutes perfecting a choreographed celebration.` : `You spent ${minutes} minutes drilling your ${choice.toLowerCase()}.`} ${choice}: ${p.skills[choice]}%.`, sport.emoji, 'good')
})

const TRAINING = [
  { id: 'Balance', emoji: '\u{1F9D8}' },
  { id: 'Cardio', emoji: '\u{1F3C3}' },
  { id: 'Flexibility', emoji: '\u{1F938}' },
  { id: 'Strength', emoji: '\u{1F3CB}\u{FE0F}' },
]

const trainScript = defineScript('special.athlete.train', (g, choice) => {
  if (choice === 'cancel') return
  const job = athleteJob(g)
  if (!job) return
  if (!useYearAction(g, `athlete.train.${choice}`, 1)) return tell(g, 'Train', `You've already done your ${choice.toLowerCase()} training this year.`, '\u{1F971}')
  const p = athleteProfile(g)
  p.fitness = clamp100(p.fitness + randInt(g, 2, 5))
  addStat(g, 'health', 2)
  addHidden(g, 'athleticism', 1)
  log(g, `I did ${choice.toLowerCase()} training.`)
  say(g, 'Training', `${pick(g, ['Your trainer pushed you to the limit.', 'You left the gym drenched in sweat.', 'You beat your personal best.'])} Fitness: ${p.fitness}%.`, '\u{1F4AA}', 'good')
})

const fanScript = defineScript('special.athlete.fans', (g, choice) => {
  const p = athleteProfile(g)
  let text: string
  if (choice === 'sign') {
    p.respect = clamp100(p.respect + 4)
    text = 'You signed jerseys until your hand cramped. The fans adore you.'
  } else if (choice === 'selfie') {
    p.respect = clamp100(p.respect + 3)
    addFame(g, 1)
    text = 'You posed for a hundred selfies. One of them has more likes than your team page.'
  } else if (choice === 'heckler') {
    p.respect = clamp100(p.respect - 8)
    addFame(g, 1)
    text = 'You roasted a heckler in the stands. The clip went viral, but the league fined you.'
  } else {
    p.respect = clamp100(p.respect - 4)
    text = 'You walked past your fans without stopping. A kid in your jersey started crying.'
  }
  say(g, 'Fans', `${text} Respect: ${p.respect}%.`, '\u{1F64C}')
})

const tradeScript = defineScript('special.athlete.trade', (g, choice, data) => {
  if (choice === 'cancel') return
  const job = athleteJob(g)
  if (!job) return
  const options = data as unknown as TeamOption[]
  const t = options[Number(choice)]
  if (!t) return
  const p = athleteProfile(g)
  if (p.greatness + randInt(g, -10, 15) < t.strength - 5) {
    return say(g, 'Trade Request', `The ${t.team} rejected the trade. Their GM said you "aren't a fit right now".`, '\u{1F504}', 'bad')
  }
  const league = leagueOf(t.league)
  const years = Math.max(1, ad(job).contractYears)
  offerContract(g, { league: t.league, team: t.team, strength: t.strength, position: ad(job).position, years, salary: salaryFor(league, p.greatness, t.strength), trade: true }, `The ${t.team} agreed to take over your contract!`)
})

const dopeAction: MenuAction = {
  type: 'action',
  id: 'athlete.dope',
  label: 'Performance Enhancer',
  emoji: '\u{1F489}',
  subtitle: 'Get a chemical boost',
  visible: (g) => {
    const j = athleteJob(g)
    return !!j && !ad(j).doping
  },
  disabledReason: (g) => blocked(g, 0),
  confirm: () => 'Doping can get you banned from the league. Do it anyway?',
  run: (g) => {
    const job = athleteJob(g)
    if (!job) return
    ad(job).doping = true
    addHidden(g, 'karma', -5)
    addStat(g, 'health', -3)
    count(g, 'doping')
    log(g, 'I started taking performance enhancers.', 'bad')
    say(g, 'Performance Enhancer', pick(g, ['A guy named "Doc" sold you a cooler of unlabeled syringes. You feel... powerful.', 'You started a "vitamin regimen" that definitely is not vitamins.']), '\u{1F489}', 'bad')
  },
}

function leagueInfo(g: GameState, job: Job): MenuGroup {
  const d = ad(job)
  const league = leagueOf(d.league)
  return {
    type: 'menu',
    id: 'athlete.league',
    label: 'League',
    emoji: '\u{1F4CA}',
    subtitle: league.name,
    children: (): MenuNode[] => {
      const nodes: MenuNode[] = [{ type: 'info', id: 'athlete.l.champ', emoji: '\u{1F3C6}', text: d.champion ? `Reigning champion: ${d.champion}` : 'No season played yet.' }]
      d.standings.forEach((s) => nodes.push({ type: 'info', id: `athlete.l.${s.rank}`, emoji: s.team === d.team ? '\u{2B50}' : '\u{1F3DF}\u{FE0F}', text: `${ordinal(s.rank)}: ${s.team} (strength ${s.strength}%)` }))
      void g
      return nodes
    },
  }
}

function statsInfo(): MenuGroup {
  return {
    type: 'menu',
    id: 'athlete.stats',
    label: 'Stats & Skills',
    emoji: '\u{1F4C8}',
    subtitle: (g) => `Greatness ${viewAthlete(g).greatness}% · Fitness ${viewAthlete(g).fitness}% · Respect ${viewAthlete(g).respect}%`,
    children: (g): MenuNode[] => {
      const p = viewAthlete(g)
      const nodes: MenuNode[] = Object.entries(p.skills).map(([k, v]) => ({ type: 'info' as const, id: `athlete.s.${k}`, emoji: '\u{1F3AF}', text: `${k}: ${v}%` }))
      nodes.push({ type: 'info', id: 'athlete.s.titles', emoji: '\u{1F3C6}', text: `Championships: ${p.championships} · Seasons: ${p.seasons}` })
      p.awards.forEach((a, i) => nodes.push({ type: 'info', id: `athlete.s.a${i}`, emoji: '\u{1F3C5}', text: a }))
      return nodes
    },
  }
}

export function athleteJobNodes(g: GameState): MenuNode[] {
  const job = athleteJob(g)
  if (!job) return []
  const d = ad(job)
  const sport = sportOf(leagueOf(d.league).sport)
  return [
    { type: 'info', id: 'athlete.status', emoji: sport.emoji, text: `${d.position}, ${d.team} · ${money(job.salary)}/yr · ${d.contractYears} year${d.contractYears === 1 ? '' : 's'} left on contract${d.injured > 0 ? ' · INJURED' : ''}` },
    {
      type: 'action',
      id: 'athlete.practice',
      label: 'Practice',
      emoji: sport.emoji,
      subtitle: 'Work on a skill (once each per year)',
      disabledReason: (gg) => blocked(gg, 0),
      run: (gg) => {
        const p = viewAthlete(gg)
        scriptChoice(gg, practiceScript, 'Practice', 'Which skill do you want to work on?', [...sport.skills.map((s) => ({ id: s, label: `${s} (${p.skills[s] ?? 0}%)`, emoji: '\u{1F3AF}' })), { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' }], { emoji: sport.emoji })
      },
    },
    {
      type: 'action',
      id: 'athlete.train',
      label: 'Train',
      emoji: '\u{1F4AA}',
      subtitle: 'Improve your fitness',
      disabledReason: (gg) => blocked(gg, 0),
      run: (gg) => scriptChoice(gg, trainScript, 'Train', 'What kind of training?', [...TRAINING.map((t) => ({ id: t.id, label: t.id, emoji: t.emoji })), { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' }], { emoji: '\u{1F4AA}' }),
    },
    {
      type: 'action',
      id: 'athlete.fans',
      label: 'Fans',
      emoji: '\u{1F64C}',
      subtitle: 'Interact with your fans',
      disabledReason: (gg) => blocked(gg, 0),
      run: (gg) => {
        if (!useYearAction(gg, 'athlete.fans', 2)) return tell(gg, 'Fans', 'Security says you need to stop wandering into the stands.', '\u{1F64C}')
        scriptChoice(
          gg,
          fanScript,
          'Fans',
          'A crowd of fans is waiting for you outside the stadium.',
          [
            { id: 'sign', label: 'Sign autographs', emoji: '\u{270D}\u{FE0F}' },
            { id: 'selfie', label: 'Take selfies', emoji: '\u{1F933}' },
            { id: 'heckler', label: 'Roast a heckler', emoji: '\u{1F525}' },
            { id: 'ignore', label: 'Ignore them', emoji: '\u{1F610}' },
          ],
          { emoji: '\u{1F64C}' },
        )
      },
    },
    leagueInfo(g, job),
    statsInfo(),
    dopeAction,
    {
      type: 'action',
      id: 'athlete.trade',
      label: 'Request Trade',
      emoji: '\u{1F504}',
      subtitle: 'Ask another team to take your contract',
      disabledReason: (gg) => blocked(gg, 0),
      run: (gg) => {
        const j = athleteJob(gg)
        if (!j) return
        if (!useYearAction(gg, 'athlete.trade', 1)) return tell(gg, 'Request Trade', 'Your agent already shopped you around this year.', '\u{1F504}')
        const jd = ad(j)
        const league = leagueOf(jd.league)
        const teams = shuffle(gg, league.teams.filter((t) => t !== jd.team)).slice(0, 4)
        const options: TeamOption[] = teams.map((team) => ({ league: league.id, team, strength: randInt(gg, 35, 95) }))
        scriptChoice(gg, tradeScript, 'Request Trade', 'Which team do you want to be traded to?', [...options.map((o, i) => ({ id: String(i), label: `${o.team} · Strength ${o.strength}%`, emoji: sport.emoji })), { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' }], {
          emoji: '\u{1F504}',
          data: options as unknown as Json,
        })
      },
    },
    {
      type: 'action',
      id: 'athlete.retire',
      label: 'Retire',
      emoji: '\u{1F3D6}\u{FE0F}',
      subtitle: 'Hang up your jersey',
      confirm: () => 'Retire from professional sports?',
      run: (gg) => retire(gg, false),
    },
  ]
}

function retire(g: GameState, forced: boolean): void {
  const job = athleteJob(g)
  if (!job) return
  const p = athleteProfile(g)
  const team = job.company
  p.retiredAge = g.character.age
  leave(g, 'retired')
  log(g, `I retired from professional sports.`, 'event')
  remember(g, `Retired from pro sports after ${p.seasons} seasons and ${p.championships} championships.`)
  say(g, 'Retired', `${forced ? 'No team offered you a contract, so you ' : 'You '}retired after ${p.seasons} season${p.seasons === 1 ? '' : 's'}${p.championships ? ` and ${p.championships} championship${p.championships === 1 ? '' : 's'}` : ''}. The ${team} held a ceremony in your honor.`, '\u{1F3C5}', 'good')
}

export const athleteCareerMenu: MenuGroup = {
  type: 'menu',
  id: 'special.athlete',
  label: 'Professional Athlete',
  emoji: '\u{1F3C6}',
  subtitle: 'Go pro in your favorite sport',
  header: (g) => `Athleticism: ${g.character.hidden.athleticism}%. Teams want natural athletes between 18 and 36. Train at the gym and in school sports to get noticed.`,
  children: (g): MenuNode[] => {
    if (athleteJob(g)) return [{ type: 'info', id: 'athlete.already', text: 'You are already a pro athlete. Manage your career from your job.', emoji: '\u{1F3C6}' }]
    const nodes: MenuNode[] = [tryoutAction]
    if (peek<AthleteProfile>(g, 'athlete')?.sport) nodes.push(statsInfo())
    return nodes
  },
}

// ---------------------------------------------------------------------------
// Injuries, doping tests, bribes

const INJURIES = ['Torn ACL', 'Broken Ankle', 'Concussion', 'Sprained Wrist', 'Pulled Hamstring', 'Dislocated Shoulder']

function injure(g: GameState, job: Job): void {
  const c = g.character
  const injury = pick(g, INJURIES)
  if (!c.conditions.some((x) => x.name === injury)) {
    c.conditions.push({ id: uid(g, 'c'), name: injury, kind: 'injury', severity: randInt(g, 15, 35), yearsHad: 0, curable: true, diagnosed: true, age: c.age })
  }
  addStat(g, 'health', -randInt(g, 5, 12))
  ad(job).injured = 1
  log(g, `I suffered a ${injury.toLowerCase()}.`, 'bad')
  scriptChoice(
    g,
    injuryScript,
    'Injury!',
    `You suffered a ${injury.toLowerCase()}. How do you want to deal with it?`,
    [
      { id: 'therapy', label: 'Physical therapy', emoji: '\u{1F9D1}\u{200D}\u{2695}\u{FE0F}' },
      { id: 'surgery', label: 'Surgery', emoji: '\u{1F3E5}' },
      { id: 'play', label: 'Play through it', emoji: '\u{1F62C}' },
    ],
    { emoji: '\u{1F915}', data: { injury } },
  )
}

const injuryScript = defineScript('special.athlete.injury', (g, choice, data) => {
  const injury = String((data as { injury?: string } | undefined)?.injury ?? '')
  const job = athleteJob(g)
  const c = g.character
  const heal = () => {
    c.conditions = c.conditions.filter((x) => x.name !== injury)
    if (job) ad(job).injured = 0
  }
  if (choice === 'therapy') {
    if (chance(g, 0.6)) {
      heal()
      return say(g, 'Physical Therapy', `Weeks of physical therapy healed your ${injury.toLowerCase()}. You're back on the field.`, '\u{1F9D1}\u{200D}\u{2695}\u{FE0F}', 'good')
    }
    return say(g, 'Physical Therapy', `Physical therapy didn't fix your ${injury.toLowerCase()}. You'll miss part of the season. Surgery might be next.`, '\u{1F9D1}\u{200D}\u{2695}\u{FE0F}', 'bad')
  }
  if (choice === 'surgery') {
    if (chance(g, 0.9)) {
      c.conditions = c.conditions.filter((x) => x.name !== injury)
      return say(g, 'Surgery', `Surgery repaired your ${injury.toLowerCase()}, but you'll miss a chunk of the season while you recover.`, '\u{1F3E5}', 'good')
    }
    addStat(g, 'health', -5)
    return say(g, 'Surgery', `The surgery on your ${injury.toLowerCase()} had complications. Your recovery will be long.`, '\u{1F3E5}', 'bad')
  }
  if (chance(g, 0.5)) {
    heal()
    addStat(g, 'happiness', 3)
    return say(g, 'Tough It Out', `You played through your ${injury.toLowerCase()}. It hurt like crazy, but you didn't miss a game.`, '\u{1F62C}', 'good')
  }
  addStat(g, 'health', -10)
  return say(g, 'Tough It Out', `You tried to play through your ${injury.toLowerCase()} and collapsed in the middle of a game. Now it's even worse.`, '\u{1F62C}', 'bad')
})

function ban(g: GameState, years: number, reason: string): void {
  const p = athleteProfile(g)
  p.bannedUntil = years >= 99 ? 999 : g.character.age + years
  p.respect = clamp100(p.respect - 30)
  addFame(g, -5)
  addHidden(g, 'notoriety', 5)
  const team = athleteJob(g)?.company ?? 'your team'
  leave(g, 'fired')
  log(g, `I was banned from professional sports for ${reason}.`, 'bad')
  remember(g, `Banned from pro sports (${reason}).`)
  say(g, 'Banned', `You were banned from the league ${years >= 99 ? 'for life' : `for ${years} years`} for ${reason}. The ${team.replace(/^your team$/, 'team')} terminated your contract.`, '\u{1F6AB}', 'bad')
}

const dopingTestScript = defineScript('special.athlete.dopingTest', (g, choice) => {
  const job = athleteJob(g)
  if (!job) return
  const doping = ad(job).doping
  if (choice === 'submit') {
    if (doping) return ban(g, 5, 'failing a drug test')
    athleteProfile(g).respect = clamp100(athleteProfile(g).respect + 5)
    return say(g, 'Drug Test', 'You passed the drug test with flying colors.', '\u{1F9EA}', 'good')
  }
  if (choice === 'swap') {
    if (chance(g, 0.5)) {
      return say(g, 'Drug Test', 'Your teammate agreed to pee in a cup for you. You passed. You owe them big time.', '\u{1F9EA}', 'good')
    }
    return ban(g, 5, 'trying to cheat a drug test')
  }
  return ban(g, 3, 'refusing a drug test')
})

const bribeScript = defineScript('special.athlete.bribe', (g, choice, data) => {
  const amount = Number((data as { amount?: number } | undefined)?.amount ?? 0)
  const p = athleteProfile(g)
  if (choice === 'accept') {
    addMoney(g, amount)
    addHidden(g, 'karma', -10)
    log(g, 'I took a bribe to throw a game.', 'bad')
    if (chance(g, 0.3)) {
      ban(g, 99, 'match fixing')
      arrestPlayer(g, 'Match Fixing', 2)
      return
    }
    return say(g, 'Bribe', `You missed every shot on purpose and pocketed ${money(amount)}. Nobody suspects a thing... for now.`, '\u{1F4B0}', 'bad')
  }
  if (choice === 'report') {
    p.respect = clamp100(p.respect + 10)
    addHidden(g, 'karma', 5)
    if (chance(g, 0.3)) {
      addStat(g, 'health', -20)
      log(g, 'Thugs beat me up for reporting a bribe.', 'bad')
      return say(g, 'Bribe', 'You reported the bribe to the authorities. A week later, some large men in tracksuits beat you up in the parking lot.', '\u{1F915}', 'bad')
    }
    return say(g, 'Bribe', 'You reported the bribe to the authorities. The league thanked you for your integrity.', '\u{1F46E}', 'good')
  }
  return say(g, 'Bribe', 'You declined the bribe and turned a blind eye. The man in the tracksuit shrugged and walked away.', '\u{1F937}')
})

// ---------------------------------------------------------------------------
// Yearly season

const contractRenewScript = defineScript('special.athlete.renew', (g, choice, data) => {
  const job = athleteJob(g)
  if (!job) return
  const o = data as unknown as { salary: number; years: number; freeAgent: ContractOffer | null }
  if (choice === 'resign') {
    ad(job).contractYears = o.years
    job.salary = o.salary
    log(g, `I re-signed with the ${job.company}.`, 'good')
    return say(g, 'Re-signed', `You re-signed with the ${job.company} for ${o.years} year${o.years === 1 ? '' : 's'} at ${money(o.salary)} per year.`, '\u{270D}\u{FE0F}', 'good')
  }
  if (choice === 'free' && o.freeAgent) {
    const fa = o.freeAgent
    const d = ad(job)
    d.team = fa.team
    d.teamStrength = fa.strength
    d.contractYears = fa.years
    job.company = fa.team
    job.salary = fa.salary
    log(g, `I signed with the ${fa.team} as a free agent.`, 'good')
    return say(g, 'Free Agency', `You signed a ${fa.years}-year deal with the ${fa.team} worth ${money(fa.salary)} per year.`, '\u{270D}\u{FE0F}', 'good')
  }
  retire(g, false)
})

export function yearlyAthlete(g: GameState): void {
  const c = g.character
  if (!c.alive) return
  const p0 = peek<AthleteProfile>(g, 'athlete')
  // Hall of Fame, five years after retiring.
  if (p0 && p0.retiredAge !== null && !p0.hallOfFame && c.age - p0.retiredAge >= 5 && (p0.peakGreatness >= 80 || p0.championships >= 3)) {
    p0.hallOfFame = true
    addFame(g, 10)
    const sport = sportOf(p0.sport)
    if (sport.id === 'football') g.flags['special.athlete.canton'] = true
    log(g, `I was inducted into the ${sport.name} Hall of Fame.`, 'good')
    remember(g, `Inducted into the ${sport.name} Hall of Fame.`)
    say(g, 'Hall of Fame', `You were inducted into the ${sport.name} Hall of Fame! Your bronze bust looks only slightly like you.`, '\u{1F3DB}\u{FE0F}', 'good')
  }
  // Scouts approach talented 18 year olds.
  if (!c.prison && !c.job && c.age >= 18 && c.age <= 19 && !g.flags['special.athlete.scouted'] && (c.hidden.athleticism >= 80 || (sportsTalent(g) && c.hidden.athleticism >= 65)) && chance(g, 0.5)) {
    g.flags['special.athlete.scouted'] = true
    const leagues = LEAGUES.filter((l) => l.gender === c.gender && l.sport !== 'football')
    if (leagues.length) {
      const league = pick(g, leagues)
      const sport = sportOf(league.sport)
      ensureSport(g, sport)
      const strength = randInt(g, 35, 80)
      const team = pick(g, league.teams)
      offerContract(g, { league: league.id, team, strength, position: pick(g, sport.positions), years: randInt(g, 2, 4), salary: salaryFor(league, 30, strength) }, `A scout from the ${team} (${league.name}) saw you play ${sport.name.toLowerCase()} and wants to sign you!`)
    }
  }
  const job = athleteJob(g)
  if (!job || c.prison) return
  syncTenure(g, job)
  const d = ad(job)
  const league = leagueOf(d.league)
  const sport = sportOf(league.sport)
  const p = ensureSport(g, sport)

  // Skills you didn't practice slip; age catches up after 30.
  for (const s of sport.skills) {
    const decay = (d.practiced.includes(s) ? 0 : randInt(g, 1, 3)) + (c.age > 30 ? Math.round((c.age - 30) / 3) : 0)
    p.skills[s] = clamp100((p.skills[s] ?? 0) - decay)
  }
  d.practiced = []
  if (c.age > 30) p.fitness = clamp100(p.fitness - randInt(g, 1, 3))

  const doping = d.doping
  const greatness = clamp100(avgSkill(p) * 0.6 + p.fitness * 0.25 + randInt(g, 0, 15) + (doping ? 8 : 0) - (d.injured > 0 ? 15 : 0))
  p.greatness = greatness
  p.peakGreatness = Math.max(p.peakGreatness, greatness)
  p.seasons += 1
  job.performance = clamp100(greatness)

  // Simulate the league.
  d.teamStrength = clamp100(d.teamStrength + randInt(g, -6, 6) + (greatness - 60) / 10)
  const table = league.teams.map((team) => {
    const strength = team === d.team ? d.teamStrength : randInt(g, 35, 92)
    const score = strength + rand(g) * 35 + (team === d.team ? greatness / 8 : 0)
    return { team, strength, score }
  })
  table.sort((a, b) => b.score - a.score)
  d.standings = table.slice(0, 5).map((t, i) => ({ team: t.team, strength: Math.round(t.strength), rank: i + 1 }))
  const rank = table.findIndex((t) => t.team === d.team) + 1
  d.champion = table[0].team
  earnIncome(g, job.salary)
  addStat(g, 'health', -randInt(g, 0, 3))

  const statLine = seasonStats(g, sport, greatness, d.position)
  log(g, `I played my ${ordinal(p.seasons)} pro season with the ${d.team}. ${statLine}`, greatness >= 60 ? 'good' : 'neutral')
  fameToward(g, greatness * 0.85 + p.championships * 2, 4)

  if (rank === 1) {
    p.championships += 1
    count(g, 'championships')
    addFame(g, 5)
    addStat(g, 'happiness', 20)
    if (doping) g.flags['special.athlete.lance'] = true
    log(g, `The ${d.team} won the ${league.name} championship!`, 'good')
    remember(g, `Won the ${league.name} championship with the ${d.team}.`)
    say(g, 'Champions!', `The ${d.team} won the ${league.name} championship! ${statLine} You were doused in a cooler of sports drink.`, '\u{1F3C6}', 'good')
  } else {
    say(g, 'Season Over', `The ${d.team} finished ${ordinal(rank)} in the ${league.name}. ${d.champion} won the title. ${statLine}`, sport.emoji, rank <= 3 ? 'good' : 'neutral')
  }
  if (greatness >= 88 && chance(g, 0.3)) {
    const award = sport.id === 'soccer' ? 'Golden Orb' : `${league.name} MVP`
    p.awards.push(`${award} (age ${c.age})`)
    count(g, 'awards')
    addFame(g, 5)
    if (sport.id === 'soccer') g.flags['special.athlete.goldenOrb'] = true
    log(g, `I won the ${award}.`, 'good')
    remember(g, `Won the ${award}.`)
    say(g, award, `You won the ${award}, given to the best player of the season!`, '\u{1F947}', 'good')
  }
  if (d.injured > 0) d.injured -= 1
  d.doping = false

  // Random scenarios.
  if (doping ? chance(g, 0.35) : chance(g, 0.08)) {
    scriptChoice(
      g,
      dopingTestScript,
      'Drug Test',
      'The league has selected you for a random drug test.',
      [
        { id: 'submit', label: 'Submit to the test', emoji: '\u{1F9EA}' },
        { id: 'swap', label: 'Ask a teammate to take it for you', emoji: '\u{1F91E}' },
        { id: 'refuse', label: 'Refuse the test', emoji: '\u{1F645}' },
      ],
      { emoji: '\u{1F9EA}' },
    )
    return
  }
  if (chance(g, 0.05)) {
    const amount = Math.round((job.salary * (0.2 + rand(g) * 0.8)) / 1_000) * 1_000 + 10_000
    scriptChoice(
      g,
      bribeScript,
      'Bribe',
      `A man in a tracksuit corners you after practice. He'll pay you ${money(amount)} to play badly in the next big game.`,
      [
        { id: 'accept', label: 'Take the money', emoji: '\u{1F4B0}' },
        { id: 'decline', label: 'Decline and look away', emoji: '\u{1F648}' },
        { id: 'report', label: 'Report him', emoji: '\u{1F46E}' },
      ],
      { emoji: '\u{1F4B0}', data: { amount } },
    )
    return
  }
  if (chance(g, 0.1)) {
    injure(g, job)
    return
  }

  // Contract.
  d.contractYears -= 1
  if (d.contractYears <= 0) {
    if (c.age >= 38 || greatness < 30) {
      retire(g, true)
      return
    }
    const years = randInt(g, 1, c.age > 32 ? 2 : 5)
    const salary = salaryFor(league, greatness, d.teamStrength)
    const other = pick(g, league.teams.filter((t) => t !== d.team))
    const strength = randInt(g, 35, 92)
    const freeAgent: ContractOffer | null = greatness >= 50 ? { league: league.id, team: other, strength, position: d.position, years: randInt(g, 1, 4), salary: Math.round((salary * (0.9 + rand(g) * 0.5)) / 10_000) * 10_000 } : null
    scriptChoice(
      g,
      contractRenewScript,
      'Contract Expiring',
      `Your contract with the ${d.team} is up. They're offering ${years} more year${years === 1 ? '' : 's'} at ${money(salary)} per year.${freeAgent ? ` The ${freeAgent.team} (strength ${freeAgent.strength}%) offered ${money(freeAgent.salary)} per year for ${freeAgent.years} year${freeAgent.years === 1 ? '' : 's'}.` : ''}`,
      [
        { id: 'resign', label: `Re-sign (${short(salary)}/yr)`, emoji: '\u{270D}\u{FE0F}' },
        ...(freeAgent ? [{ id: 'free', label: `Join the ${freeAgent.team} (${short(freeAgent.salary)}/yr)`, emoji: '\u{1F504}' }] : []),
        { id: 'retire', label: 'Retire', emoji: '\u{1F3D6}\u{FE0F}' },
      ],
      { emoji: sport.emoji, data: { salary, years, freeAgent } as unknown as Json },
    )
  }
}

function seasonStats(g: GameState, sport: Sport, greatness: number, position: string): string {
  const k = greatness / 100
  switch (sport.id) {
    case 'basketball':
      return `I averaged ${(5 + k * 25 + rand(g) * 4).toFixed(1)} points per game.`
    case 'football':
      return position === 'Quarterback' ? `I threw for ${Math.round(1_500 + k * 3_500 + rand(g) * 500).toLocaleString('en-US')} yards.` : `I scored ${Math.round(k * 14 + rand(g) * 3)} touchdowns.`
    case 'baseball':
      return position === 'Pitcher' ? `I finished with a ${(5.5 - k * 3.5 + rand(g) * 0.5).toFixed(2)} ERA.` : `I hit .${Math.round(200 + k * 130 + rand(g) * 20)} with ${Math.round(k * 40 + rand(g) * 5)} home runs.`
    case 'hockey':
      return `I scored ${Math.round(k * 45 + rand(g) * 5)} goals.`
    case 'soccer':
      return position === 'Goalkeeper' ? `I kept ${Math.round(k * 18 + rand(g) * 3)} clean sheets.` : `I scored ${Math.round(k * 30 + rand(g) * 4)} goals.`
    case 'rugby':
      return `I scored ${Math.round(k * 20 + rand(g) * 3)} tries.`
    default:
      return `I racked up ${Math.round(k * 400 + rand(g) * 40)} kills.`
  }
}
