// Special Careers › Sports: every sport in one place.
//   Youth Sports       academies, junior circuits and kids' clubs (sports-youth.ts)
//   Team Sports        the pro leagues, home leagues first (athlete.ts)
//   Individual Sports  tennis, golf, track, swimming, cycling, motor racing, skiing,
//                      snowboarding, surfing, skateboarding, gymnastics, figure skating,
//                      badminton, table tennis, darts (sports-individual.ts + sports-data.ts)
//   Combat Sports      MMA (the Hexagon), boxing, kickboxing, Muay Thai (sports-fight.ts),
//                      judo and Olympic wrestling (tour engine), sumo (sports-sumo.ts),
//                      pro wrestling entertainment (sports-prowrestling.ts)
//   Esports            competitive gaming (sports-esports.ts)
//   The Olympics, Endorsements, Life After Sports, Trophy Cabinet
// Shared state (medals, sponsors, bans, head trauma, legacy) lives in sports-core.ts.
import type { GameState, MenuGroup, MenuNode } from '../types'
import { athleteJob, athleteJobNodes, teamSportsMenu, teamStatus, yearlyAthlete } from './athlete'
import { localSportNames, endorsementsMenu, playingJob, popularity, viewSports, yearlyBrain, yearlySponsors } from './sports-core'
import { IND_SPORTS, indSport } from './sports-data'
import { esportsJob, esportsJobNodes, esportsMenu, esportsSummary, yearlyEsports } from './sports-esports'
import { disciplineMenu, fighterJob, fighterJobNodes, fighterSummary, yearlyFighter } from './sports-fight'
import { indJob, individualJobNodes, individualSummary, sportMenu, yearlyIndividual } from './sports-individual'
import { legacyJobNodes, legacySummary, lifeAfterSportsMenu, trophyCabinetMenu, yearlyLegacy } from './sports-legacy'
import { olympicsMenu, yearlyOlympics } from './sports-olympics'
import { proWrestlingMenu, wrestlerJob, wrestlerJobNodes, wrestlerSummary, yearlyWrestler } from './sports-prowrestling'
import { sumoJob, sumoJobNodes, sumoMenu, sumoSummary, yearlySumo } from './sports-sumo'
import { yearlyYouth, youthSportsMenu, youthSummary } from './sports-youth'

const individualSportsMenu: MenuGroup = {
  type: 'menu',
  id: 'sports.individual',
  label: 'Individual Sports',
  emoji: '\u{1F3BE}',
  subtitle: (g) => {
    const j = indJob(g)
    if (j) return j.title
    return 'Tennis, golf, track, swimming, racing, skiing, surfing and more'
  },
  header: () => 'Climb the rankings from the lower circuits to the main tour, play the majors, win prize money and sponsors. Some sports need snow, a coastline or an ice rink nearby.',
  children: (g): MenuNode[] => {
    const list = IND_SPORTS.filter((s) => s.group === 'individual')
    const score = (id: string) => {
      const s = indSport(id)
      const i = s ? popularity(g, s.locale) : -1
      return i < 0 ? 50 : i
    }
    return [...list].sort((a, b) => score(a.id) - score(b.id)).map((s) => sportMenu(s))
  },
}

const combatSportsMenu: MenuGroup = {
  type: 'menu',
  id: 'sports.combat',
  label: 'Combat Sports',
  emoji: '\u{1F94A}',
  subtitle: (g) => {
    const j = fighterJob(g) ?? sumoJob(g) ?? wrestlerJob(g)
    if (j) return j.title
    const ind = indJob(g)
    if (ind && /judo|wrestl/i.test(ind.title)) return ind.title
    return 'MMA, boxing, kickboxing, Muay Thai, judo, wrestling, sumo, pro wrestling'
  },
  header: () => 'Fighting for a living: gyms, amateur records, weight cuts, rankings, belts and pay-per-view. Every punch you take is a punch your brain remembers.',
  children: (): MenuNode[] => {
    const judo = IND_SPORTS.find((s) => s.id === 'judo')
    const wrestling = IND_SPORTS.find((s) => s.id === 'wrestling')
    const nodes: MenuNode[] = [disciplineMenu('mma'), disciplineMenu('boxing'), disciplineMenu('kickboxing'), disciplineMenu('muaythai')]
    if (judo) nodes.push(sportMenu(judo))
    if (wrestling) nodes.push(sportMenu(wrestling))
    nodes.push(sumoMenu, proWrestlingMenu)
    return nodes
  },
}

/** Special Careers › Sports. */
export const sportsCareerMenu: MenuGroup = {
  type: 'menu',
  id: 'sports',
  label: 'Sports',
  emoji: '\u{1F3C5}',
  subtitle: (g) => {
    const j = playingJob(g)
    if (j) return `${j.title} · ${j.company}`
    return 'Team, individual, combat and esports'
  },
  visible: (g) => g.character.alive && !g.character.prison,
  header: (g) => {
    const c = g.character
    const local = localSportNames(g).slice(0, 4)
    const kid = c.age < 18 ? ' Kids start in Youth Sports; most pro careers open at 16-18.' : ''
    return `Athleticism: ${c.hidden.athleticism}%.${local.length ? ` Popular here: ${local.join(', ')}.` : ''}${kid}`
  },
  children: (g): MenuNode[] => {
    const c = g.character
    if (c.age < 4) return [{ type: 'info', id: 'sports.tooYoung', emoji: '\u{1F476}', text: 'Your current sport is crawling. Check back when you can walk without falling over.' }]
    const nodes: MenuNode[] = []
    const job = playingJob(g)
    if (job) nodes.push({ type: 'info', id: 'sports.current', emoji: '\u{1F3C5}', text: `You're a ${job.title}. Manage your career from Occupation › My Work.` })
    nodes.push(youthSportsMenu, teamSportsMenu, individualSportsMenu, combatSportsMenu, esportsMenu, olympicsMenu, endorsementsMenu(), lifeAfterSportsMenu, trophyCabinetMenu)
    return nodes
  },
}

/** Occupation tab rows while the player has a sports job (playing, coaching or commentating). */
export function sportsJobNodes(g: GameState): MenuNode[] {
  if (athleteJob(g)) return athleteJobNodes(g)
  if (indJob(g)) return individualJobNodes(g)
  if (fighterJob(g)) return fighterJobNodes(g)
  if (sumoJob(g)) return sumoJobNodes(g)
  if (wrestlerJob(g)) return wrestlerJobNodes(g)
  if (esportsJob(g)) return esportsJobNodes(g)
  return legacyJobNodes(g)
}

/** Brand appeal of the current career (for endorsement offers). */
function appeal(g: GameState): { sport: string | null; appeal: number } {
  const team = teamStatus(g)
  if (team) return { sport: team.sportName, appeal: team.sportId === 'soccer' || team.sportId === 'basketball' ? 1 : 0.8 }
  const ind = indJob(g)
  if (ind) {
    const s = indSport(typeof ind.data.sport === 'string' ? ind.data.sport : '')
    return { sport: s?.name ?? 'sports', appeal: s?.appeal ?? 0.6 }
  }
  if (fighterJob(g)) return { sport: 'combat sports', appeal: 0.8 }
  if (wrestlerJob(g)) return { sport: 'pro wrestling', appeal: 0.7 }
  if (sumoJob(g)) return { sport: 'sumo', appeal: 0.5 }
  if (esportsJob(g)) return { sport: 'esports', appeal: 0.6 }
  return { sport: null, appeal: 0.5 }
}

/** Yearly hook for every sports career. */
export function yearlySports(g: GameState): void {
  const hooks: ((g: GameState) => void)[] = [yearlyAthlete, yearlyIndividual, yearlyFighter, yearlySumo, yearlyWrestler, yearlyEsports, yearlyYouth, yearlyOlympics, yearlyLegacy]
  for (const hook of hooks) {
    if (!g.character.alive) return
    hook(g)
  }
  if (!g.character.alive) return
  const a = appeal(g)
  yearlySponsors(g, a.sport, a.appeal)
  yearlyBrain(g)
}

/** One compact line for the AI context ('' when there's nothing sporty to say). */
export function sportsSummary(g: GameState): string {
  const parts: string[] = []
  const team = teamStatus(g)
  if (team) parts.push(`${team.sportName} player for the ${team.team} (${team.league})`)
  for (const s of [individualSummary(g), fighterSummary(g), sumoSummary(g), wrestlerSummary(g), esportsSummary(g), legacySummary(g), youthSummary(g)]) if (s) parts.push(s)
  const p = viewSports(g)
  const golds = p.medals.filter((m) => m.medal === 'gold').length
  if (p.medals.length) parts.push(`${p.medals.length} Olympic medal${p.medals.length === 1 ? '' : 's'}${golds ? ` (${golds} gold)` : ''}`)
  if (p.sponsors.length) parts.push(`sponsored by ${p.sponsors.map((x) => x.brand).join(', ')}`)
  if (p.careers.length && !playingJob(g)) parts.push(`retired from ${p.careers.map((x) => x.sport).join(', ')}`)
  if (p.cte) parts.push('suffers from CTE after years of head trauma')
  else if (p.headTrauma >= 45) parts.push('many concussions')
  const ban = p.bannedUntil > g.character.age ? `banned from competition until ${p.bannedUntil >= 999 ? 'forever' : `age ${p.bannedUntil}`}` : ''
  if (ban) parts.push(ban)
  return parts.join('; ')
}
