// Sports › Youth Sports: the road to the pros starts in childhood. Join a club academy in your
// country's big team sports, a junior circuit in an individual sport (tennis at 5, karting at 8,
// gymnastics at 4...), or a boxing / Muay Thai / junior sumo club. Parents pay the fees. Train,
// compete in junior events, climb the junior rankings, and at 16-18 get offered a first pro
// contract, a seat, or a place in a sumo stable. School teams in the same sport help.
import { addHidden, addStat, count, log, scriptChoice, useYearAction } from '../core'
import { enrollmentClubs } from '../cv'
import { bell, chance, pick, randInt } from '../rng'
import { defineScript } from '../scripts'
import type { GameState, Json, MenuAction, MenuGroup, MenuNode } from '../types'
import { addFame, money, ordinal, peek, prof, say, short, talentMatches, tell } from './common'
import { academyClub, localTeamSports, offerYouthContract, teamSportList } from './athlete'
import { recordYouthBout, youthFightTrain } from './sports-fight'
import { juniorLevel, offerTurnPro, placeReason, youthTrain } from './sports-individual'
import { IND_SPORTS, indSport } from './sports-data'
import { inviteToStable, sumoReason } from './sports-sumo'
import { countryName, honor, localFee, logistic, payFee, payerNote, playingJob, popularity } from './sports-core'

type Kind = 'team' | 'individual' | 'combat' | 'sumo'

interface Program {
  id: string
  kind: Kind
  sport: string
  name: string
  emoji: string
  minAge: number
  fee: number
  /** Competitive trial to get in (elite academies). */
  trial: boolean
}

interface YouthProfile {
  program: string | null
  kind: Kind | null
  sport: string
  club: string
  level: number
  years: number
  rank: number | null
  titles: string[]
  joinedAge: number
  offered: boolean
}

const initYouth = (): YouthProfile => ({ program: null, kind: null, sport: '', club: '', level: 0, years: 0, rank: null, titles: [], joinedAge: 0, offered: false })

function yp(g: GameState): YouthProfile {
  return prof(g, 'sports.youth', initYouth)
}

function viewYp(g: GameState): YouthProfile | null {
  return peek<YouthProfile>(g, 'sports.youth')
}

const TEAM_MIN_AGE: Record<string, number> = { football: 8, rugby: 7, hockey: 6, aussie: 7, kabaddi: 8 }
const COMBAT: { id: string; name: string; emoji: string; minAge: number; disc: 'boxing' | 'mma' | 'muaythai' }[] = [
  { id: 'boxing', name: 'Youth Boxing Club', emoji: '\u{1F94A}', minAge: 10, disc: 'boxing' },
  { id: 'mma', name: "Kids' MMA & Jiu-Jitsu", emoji: '\u{1F94B}', minAge: 7, disc: 'mma' },
  { id: 'muaythai', name: 'Muay Thai Camp', emoji: '\u{1F1F9}\u{1F1ED}', minAge: 8, disc: 'muaythai' },
]

const IND_PROGRAM: Record<string, string> = {
  tennis: 'Junior Tennis Academy',
  golf: 'Junior Golf Program',
  track: 'Track & Field Club',
  swimming: 'Swim Club',
  cycling: 'Junior Cycling Team',
  motor: 'Kart Racing',
  ski: 'Ski Club',
  snowboard: 'Snowboard Team',
  surf: 'Surf Club',
  skate: 'Skate Crew',
  gymnastics: 'Gymnastics Academy',
  skating: 'Figure Skating Club',
  badminton: 'Badminton Academy',
  tabletennis: 'Table Tennis Club',
  darts: 'Junior Darts League',
  judo: 'Judo Club',
  wrestling: 'Wrestling Club',
}

/** Every program a kid here could join, local favorites first. */
function programs(g: GameState): Program[] {
  const local = localTeamSports(g.character.countryId)
  const out: Program[] = []
  for (const t of teamSportList()) {
    if (t.id === 'netball' && g.character.gender === 'male') continue
    out.push({ id: `team.${t.id}`, kind: 'team', sport: t.id, name: `${t.name} Academy`, emoji: t.emoji, minAge: TEAM_MIN_AGE[t.id] ?? 6, fee: localFee(g, t.id === 'football' || t.id === 'hockey' ? 900 : 500), trial: true })
  }
  for (const s of IND_SPORTS) {
    out.push({ id: `ind.${s.id}`, kind: 'individual', sport: s.id, name: `${IND_PROGRAM[s.id] ?? `Junior ${s.name}`}`, emoji: s.emoji, minAge: Math.max(4, s.juniorAge), fee: s.id === 'motor' ? localFee(g, 12_000) : localFee(g, Math.max(300, s.costs * 0.04)), trial: false })
  }
  for (const c of COMBAT) out.push({ id: `combat.${c.id}`, kind: 'combat', sport: c.disc, name: c.name, emoji: c.emoji, minAge: c.minAge, fee: localFee(g, 400), trial: false })
  if (g.character.countryId === 'jp') out.push({ id: 'sumo', kind: 'sumo', sport: 'sumo', name: 'Junior Sumo Club', emoji: '\u{1F3EF}', minAge: 6, fee: localFee(g, 200), trial: false })
  const score = (p: Program) => {
    if (p.kind === 'team') {
      const i = local.indexOf(p.sport)
      return i < 0 ? 50 : i
    }
    if (p.kind === 'individual') {
      const s = indSport(p.sport)
      const i = s ? popularity(g, s.locale) : -1
      return i < 0 ? 60 : i + 0.5
    }
    if (p.kind === 'sumo') return 0.2
    return p.sport === 'muaythai' && g.character.countryId === 'th' ? 0.1 : 70
  }
  return out.sort((a, b) => score(a) - score(b))
}

function programOf(g: GameState, id: string | null): Program | undefined {
  return id ? programs(g).find((p) => p.id === id) : undefined
}

function joinReason(g: GameState, p: Program): string | null {
  const c = g.character
  if (!c.alive) return 'You are no longer alive.'
  if (c.prison) return "You can't do that while you're locked up."
  if (c.age < p.minAge) return `${p.name} takes kids from age ${p.minAge}.`
  if (c.age >= 18) return 'Youth programs are for under-18s.'
  if (p.kind === 'individual') {
    const s = indSport(p.sport)
    if (s) {
      const where = placeReason(g, s)
      if (where) return where
    }
  }
  if (viewYp(g)?.program === p.id) return "You're already in this program."
  return null
}

// ---------------------------------------------------------------------------
// Joining

const joinScript = defineScript('sports.youth.join', (g, choice) => {
  if (choice === 'cancel') return
  const p = programOf(g, choice)
  if (!p) return
  const why = joinReason(g, p)
  if (why) return tell(g, p.name, why, p.emoji)
  const c = g.character
  if (p.trial) {
    if (!useYearAction(g, 'sports.youth.trial', 2)) return tell(g, 'Trials', "You've already been to two academy trials this year. Try again next year.", '\u{1F971}')
    const odds = logistic((c.hidden.athleticism + (talentMatches(g, /athlet|sport/i) ? 15 : 0) + bell(g, -10, 10) - 45) / 10)
    if (!chance(g, odds)) {
      log(g, `I didn't make the cut at the ${p.name.toLowerCase()} trials.`, 'bad')
      return say(g, 'Trials', `The coaches at the ${p.name.toLowerCase()} trial said you have "a lot of heart". That means no. Keep practicing and try again.`, p.emoji, 'bad')
    }
  }
  const paid = payFee(g, p.fee)
  if (!paid) return tell(g, p.name, `The ${p.name.toLowerCase()} costs ${money(p.fee)} a year, and nobody can pay it.`, '\u{1F4B8}')
  const y = yp(g)
  const switching = y.program && y.program !== p.id
  y.program = p.id
  y.kind = p.kind
  y.sport = p.sport
  y.club = p.kind === 'team' ? `${academyClub(g, p.sport)} Youth Academy` : p.kind === 'sumo' ? `${c.city} Junior Sumo Club` : `${c.city} ${p.name}`
  y.level = switching ? Math.round(y.level * 0.5) : Math.max(y.level, startLevel(g, p))
  y.years = 0
  y.rank = null
  y.joinedAge = c.age
  y.offered = false
  count(g, 'youthSports')
  log(g, `I joined the ${y.club}.`, 'good')
  say(g, 'Welcome!', `You joined the ${y.club}.${payerNote(paid)} ${p.kind === 'team' ? 'Your kit is two sizes too big. You love it.' : p.kind === 'combat' ? 'The coach made you skip rope until your calves cried.' : p.sport === 'motor' ? 'Your first kart is faster than your parents’ car. Your parents are nervous.' : 'Your coach says talent is nice, but practice is everything.'}`, p.emoji, 'good')
})

function startLevel(g: GameState, p: Program): number {
  const c = g.character
  if (p.kind === 'individual') {
    const lv = juniorLevel(g, p.sport)
    if (lv) return lv
  }
  return Math.max(5, Math.min(45, Math.round(c.hidden.athleticism * 0.35 + (talentMatches(g, /athlet|sport/i) ? 8 : 0) + randInt(g, 0, 8))))
}

// ---------------------------------------------------------------------------
// While in a program

/** Plays the same sport on a school team (e.g., the school Soccer Team or Swim Team)? */
function schoolTeamBoost(g: GameState, sport: string): string {
  const cur = g.character.education.current
  if (!cur) return ''
  const ids: Record<string, string[]> = {
    soccer: ['soccer'], basketball: ['basketball'], football: ['football'], baseball: ['baseball', 'softball'], hockey: ['ice_hockey'], rugby: ['rugby'], cricket: ['cricket'], volleyball: ['volleyball'],
    fieldhockey: ['field_hockey'], tennis: ['tennis'], golf: ['golf'], track: ['track', 'cross_country'], swimming: ['swim', 'diving'], gymnastics: ['gymnastics'], wrestling: ['wrestling'], boxing: ['boxing'],
    badminton: ['badminton'], tabletennis: ['table_tennis'], mma: ['wrestling'], judo: [],
  }
  const want = ids[sport] ?? []
  const word = (indSport(sport)?.name ?? sport).toLowerCase()
  const club = enrollmentClubs(cur).find((c) => c.kind === 'sport' && (want.includes(c.id) || c.name.toLowerCase().includes(word) || c.id === `local:${word}`))
  return club ? club.name : ''
}

function train(g: GameState): void {
  const y = yp(g)
  const p = programOf(g, y.program)
  if (!p) return
  if (!useYearAction(g, 'sports.youth.train', 2)) return tell(g, 'Training', "Your coach says you've trained enough this year. Go be a kid.", '\u{1F971}')
  const c = g.character
  const boost = (talentMatches(g, /athlet|sport/i) ? 1.3 : 1) * (c.age < 14 ? 1.15 : 1)
  const gain = Math.max(1, Math.round(randInt(g, 3, 6) * boost * Math.max(0.2, 1 - y.level / 110)))
  y.level = Math.min(100, y.level + gain)
  let extra = ''
  if (p.kind === 'individual') {
    const attr = youthTrain(g, p.sport, boost)
    if (attr) extra = ` Your ${attr.toLowerCase()} improved.`
  } else if (p.kind === 'combat') youthFightTrain(g, boost)
  addHidden(g, 'athleticism', randInt(g, 1, 2))
  addStat(g, 'health', 1)
  if (chance(g, 0.04)) {
    addStat(g, 'health', -4)
    extra += ' You also twisted an ankle. It’ll heal.'
  }
  log(g, `I trained hard at the ${y.club}.`)
  say(g, 'Training', `${pick(g, ['Drills, drills and more drills. Then orange slices.', 'Your coach made you run until you saw colors.', 'You stayed after practice to work on your weakest skill.', 'You practiced in the rain while your friends played video games.'])}${extra} Level: ${y.level}%.`, p.emoji, 'good')
}

function juniorEvent(g: GameState): void {
  const y = yp(g)
  const p = programOf(g, y.program)
  if (!p) return
  if (!useYearAction(g, 'sports.youth.compete', 2)) return tell(g, 'Competition', "You've competed enough this year. Your trophies need dusting anyway.", '\u{1F3C6}')
  const c = g.character
  const ageGroup = c.age <= 10 ? 'Under-10' : c.age <= 12 ? 'Under-12' : c.age <= 14 ? 'Under-14' : c.age <= 16 ? 'Under-16' : 'Under-18'
  // Your level against kids your age: by 16 you need a real level to win.
  const field = 18 + (c.age - 8) * 3.5
  const perf = y.level + bell(g, -10, 10)
  const place = Math.max(1, Math.min(32, Math.round(1 + 31 / (1 + Math.exp((perf - field) / 6)))))
  const country = countryName(g)
  const national = c.age >= 12 && y.level >= 40
  const evName = national ? `${country} ${ageGroup} ${p.kind === 'team' ? 'Youth Cup' : 'Championships'}` : `${c.city} ${ageGroup} ${p.kind === 'team' ? 'Tournament' : 'Open'}`
  y.level = Math.min(100, y.level + 1)
  if (p.kind === 'combat') recordYouthBout(g, p.sport as 'boxing' | 'mma' | 'muaythai', place <= 8)
  if (place === 1) {
    y.titles.push(`${evName} (${g.year})`)
    addFame(g, national ? 1 : 0)
    addStat(g, 'happiness', 8)
    if (national) honor(g, `Won the ${evName}.`, `${country} youth ${(indSport(p.sport)?.name ?? p.sport).toLowerCase()} champion`, y.club, 5)
    log(g, `${p.kind === 'team' ? 'My team won' : 'I won'} the ${evName}!`, 'good')
    return say(g, 'Champion!', `${p.kind === 'team' ? 'Your team won' : 'You won'} the ${evName}! ${pick(g, ['Your parents screamed louder than anyone.', 'You held the trophy over your head and nearly dropped it.', 'A scout was in the stands taking notes.'])}`, '\u{1F3C6}', 'good')
  }
  const text = p.kind === 'team' ? `Your team finished ${ordinal(Math.ceil(place / 2))} at the ${evName}.` : `You finished ${ordinal(place)} at the ${evName}.`
  log(g, text.replace(/^Your team/, 'My team').replace(/^You/, 'I'))
  say(g, evName, `${text} ${place <= 3 ? 'Medal! Not bad at all.' : place <= 10 ? 'Respectable.' : 'Character-building, your coach says.'}`, p.emoji, place <= 3 ? 'good' : 'neutral')
}

function quit(g: GameState): void {
  const y = yp(g)
  const club = y.club
  y.program = null
  y.kind = null
  log(g, `I quit the ${club}.`)
  say(g, 'Quit', `You quit the ${club}. Your coach looked disappointed but not surprised.`, '\u{1F6AA}')
}

function programNodes(g: GameState): MenuNode[] {
  const y = viewYp(g)
  const p = programOf(g, y?.program ?? null)
  if (!y || !p) return []
  const school = schoolTeamBoost(g, p.sport)
  const nodes: MenuNode[] = [
    { type: 'info', id: 'sports.youth.status', emoji: p.emoji, text: `${y.club} · level ${y.level}% · ${y.years} year${y.years === 1 ? '' : 's'}${y.rank ? ` · junior rank #${y.rank}` : ''}${school ? ` · also on the school ${school}` : ''}` },
    { type: 'action', id: 'sports.youth.train', label: 'Train Hard', emoji: '\u{1F4AA}', subtitle: 'Twice a year', disabledReason: (gg) => (gg.character.prison ? "You can't train in juvie." : null), run: train },
    { type: 'action', id: 'sports.youth.compete', label: p.kind === 'team' ? 'Play a Youth Tournament' : p.kind === 'combat' ? 'Junior Bout' : 'Junior Competition', emoji: '\u{1F3C6}', subtitle: 'Twice a year', disabledReason: (gg) => (gg.character.prison ? "You can't compete in juvie." : null), run: juniorEvent },
  ]
  y.titles.slice(-4).forEach((t, i) => nodes.push({ type: 'info', id: `sports.youth.t${i}`, emoji: '\u{1F3C5}', text: t }))
  nodes.push({ type: 'action', id: 'sports.youth.quit', label: 'Quit the Program', emoji: '\u{1F6AA}', confirm: () => 'Quit your youth program?', run: quit })
  return nodes
}

const KIND_LABEL: Record<'team' | 'individual' | 'combat', { label: string; emoji: string; sub: string }> = {
  team: { label: 'Team Sports Academy', emoji: '\u{26BD}', sub: 'Club academies (trials)' },
  individual: { label: 'Individual Sports', emoji: '\u{1F3BE}', sub: 'Junior circuits and clubs' },
  combat: { label: 'Combat Sports', emoji: '\u{1F94A}', sub: 'Boxing, MMA, Muay Thai, sumo' },
}

function joinKindAction(kind: 'team' | 'individual' | 'combat'): MenuAction {
  const meta = KIND_LABEL[kind]
  return {
    type: 'action',
    id: `sports.youth.join.${kind}`,
    label: meta.label,
    emoji: meta.emoji,
    subtitle: meta.sub,
    disabledReason: (g) => {
      const c = g.character
      if (!c.alive) return 'You are no longer alive.'
      if (c.prison) return "You can't join from juvie."
      if (c.age < 4) return 'Programs start at age 4.'
      if (c.age >= 18) return 'Youth programs are for under-18s.'
      return null
    },
    run: (g) => {
      const list = programs(g).filter((p) => (kind === 'combat' ? p.kind === 'combat' || p.kind === 'sumo' : p.kind === kind) && !joinReason(g, p))
      if (!list.length) return tell(g, 'Youth Sports', 'No program like that will take you right now. Most start between 4 and 10.', '\u{1F9D2}')
      const local = localTeamSports(g.character.countryId)
      scriptChoice(
        g,
        joinScript,
        meta.label,
        `What do you want to play? The big sports in ${countryName(g)} come first. Fees are yearly${g.character.age < 18 ? ' (your parents pay if they can)' : ''}.`,
        [...list.map((p) => ({ id: p.id, label: `${p.name} · ${short(p.fee)}/yr${p.kind === 'team' && local.includes(p.sport) ? ' · popular here' : p.trial ? ' · trials' : ''}`, emoji: p.emoji })), { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' }],
        { emoji: meta.emoji },
      )
    },
  }
}

const joinMenu: MenuGroup = {
  type: 'menu',
  id: 'sports.youth.join',
  label: 'Join a Program',
  emoji: '\u{1F4DD}',
  subtitle: (g) => (viewYp(g)?.program ? 'Switch sports' : 'Academies, clubs and junior circuits'),
  children: (): MenuNode[] => [joinKindAction('team'), joinKindAction('individual'), joinKindAction('combat')],
}

export const youthSportsMenu: MenuGroup = {
  type: 'menu',
  id: 'sports.youth',
  label: 'Youth Sports',
  emoji: '\u{1F9D2}',
  visible: (g) => g.character.age >= 4 && g.character.age < 18,
  subtitle: (g) => {
    const y = viewYp(g)
    const p = programOf(g, y?.program ?? null)
    return p && y ? `${y.club} · level ${y.level}%` : 'Academies, junior circuits and clubs'
  },
  header: (g) => `Athleticism: ${g.character.hidden.athleticism}%. Kids who start young and train hard get scouted: academy graduates get pro contracts, junior champions turn pro at 16.`,
  children: (g): MenuNode[] => [...programNodes(g), joinMenu],
}

// ---------------------------------------------------------------------------
// Yearly: fees, growth, and the jump to the pros

const proAskScript = defineScript('sports.youth.pro', (g, choice, data) => {
  const sport = String((data as { sport?: string } | undefined)?.sport ?? '')
  if (choice !== 'pro') {
    log(g, 'I decided not to turn pro yet.')
    return
  }
  offerTurnPro(g, sport)
})

export function yearlyYouth(g: GameState): void {
  const c = g.character
  const y0 = viewYp(g)
  if (!y0 || !y0.program || !c.alive || c.prison) return
  const y = yp(g)
  const p = programOf(g, y.program)
  if (!p) {
    y.program = null
    return
  }
  if (c.age >= 18) {
    y.program = null
    log(g, `I aged out of the ${y.club}.`)
    return
  }
  if (playingJob(g)) {
    // Turned pro: the academy days are over.
    y.program = null
    log(g, `I left the ${y.club} to play professionally.`)
    return
  }
  const paid = payFee(g, p.fee)
  if (!paid) {
    const club = y.club
    y.program = null
    log(g, `I had to leave the ${club} because nobody could pay the fees.`, 'bad')
    return say(g, 'Dropped Out', `Nobody could pay the ${club} fees this year, so you had to leave.`, '\u{1F4B8}', 'bad')
  }
  y.years += 1
  const school = schoolTeamBoost(g, p.sport)
  const grow = randInt(g, 1, 3) + (school ? 2 : 0) + (talentMatches(g, /athlet|sport/i) ? 1 : 0)
  y.level = Math.min(100, y.level + Math.max(1, Math.round(grow * Math.max(0.2, 1 - y.level / 110))))
  if (p.kind === 'individual') {
    youthTrain(g, p.sport, 1)
    y.rank = Math.max(1, Math.round(3000 / (1 + Math.exp((y.level - 30 - (c.age - 10) * 2.5) / 7))))
  }
  if (school) log(g, `Playing for my school ${school} sharpened my game.`)
  // Scouts and the jump to the pros.
  if (y.offered) return
  if (p.kind === 'team' && c.age >= 17 && y.level >= 50) {
    if (offerYouthContract(g, p.sport, y.level, y.club)) y.offered = true
    return
  }
  if (p.kind === 'team' && c.age === 17 && y.level < 40) {
    log(g, `The ${y.club} told me I won't be offered a pro contract.`, 'bad')
    return
  }
  if (p.kind === 'individual' && c.age >= 16 && y.level >= 55) {
    const s = indSport(p.sport)
    if (!s || c.age < s.proAge) return
    y.offered = true
    scriptChoice(
      g,
      proAskScript,
      'Turn Pro?',
      `You're one of the best juniors in ${countryName(g)} (junior rank #${y.rank ?? '?'}). An agent says you're ready to turn pro in ${s.name.toLowerCase()}.`,
      [
        { id: 'pro', label: 'Turn pro', emoji: '\u{1F31F}' },
        { id: 'wait', label: 'Stay amateur for now', emoji: '\u{1F393}' },
      ],
      { emoji: s.emoji, data: { sport: s.id } as unknown as Json },
    )
    return
  }
  if (p.kind === 'sumo' && c.age >= 15 && y.level >= 40 && !sumoReason(g)) {
    y.offered = true
    inviteToStable(g, 'A sumo stable scout watched you win at the junior tournament. ')
  }
}

export function youthSummary(g: GameState): string {
  const y = viewYp(g)
  if (!y?.program) return ''
  return `${y.club} (youth, level ${y.level}%)`
}
