// The Olympic Games: every four years (Summer in leap years, Winter two years later), the best
// athletes in Olympic sports are picked for their national team: ranked individual athletes,
// stars of Olympic team sports, amateur boxers and teenage phenoms. One decisive moment in the
// final, then gold, silver, bronze or heartbreak, with fame, sponsors and the national medal
// bonus (some countries pay a fortune, some pay nothing).
import { addStat, count, earnIncome, log, scriptChoice } from '../core'
import { realWealthFactor } from '../history/events-people'
import { bell, chance } from '../rng'
import { pickLine } from '../text/pick'
import { defineScript } from '../scripts'
import type { GameState, Json, MenuGroup, MenuNode } from '../types'
import { getCountry } from '../world'
import { addFame, ordinal, peek, say, short } from './common'
import { OLYMPIC_TEAM_SPORTS, teamStatus } from './athlete'
import { amateurBoxer } from './sports-fight'
import { individualStatus, juniorLevel } from './sports-individual'
import { indSport } from './sports-data'
import { addBuzz, gamesHost, gamesName, gamesSeason, honor, nationalTeam, nextGamesYear, plural, popularity, sportsProfile, tidy, viewSports, wealth, type MedalKind } from './sports-core'

/** Medal bonuses paid by national Olympic committees (gold, in dollars). */
const GOLD_BONUS: Record<string, number> = {
  sg: 740_000, hk: 640_000, tw: 650_000, ph: 180_000, my: 230_000, id: 300_000, kz: 250_000, it: 200_000, qa: 500_000, ae: 270_000, sa: 270_000,
  fr: 85_000, de: 22_000, us: 38_000, jp: 33_000, kr: 50_000, ru: 45_000, ca: 15_000, au: 15_000, br: 50_000, in: 90_000, th: 300_000, tr: 120_000, ma: 90_000,
}

interface Entry {
  sport: string
  event: string
  rating: number
  team: boolean
  /** Strength of the national team around you (team sports). */
  squad: number
}

function nationStrength(g: GameState, sportWord: RegExp): number {
  const pop = popularity(g, sportWord)
  const w = wealth(g)
  return Math.max(40, Math.min(90, 55 + (pop >= 0 ? 18 - pop * 4 : 0) + w * 10))
}

/** Who gets picked for the national team this Games, if anyone. */
function selection(g: GameState, season: 'summer' | 'winter'): Entry | null {
  const c = g.character
  if (!c.alive || c.prison) return null
  const ind = individualStatus(g)
  if (ind && ind.sport.olympic === season) {
    const cutoff = wealth(g) < 0.6 ? 120 : 48
    if (ind.rank !== null && ind.rank <= cutoff) return { sport: ind.sport.name, event: ind.disc ? `${ind.sport.name} (${ind.disc})` : ind.sport.name, rating: ind.rating, team: false, squad: 0 }
  }
  const team = teamStatus(g)
  if (team && OLYMPIC_TEAM_SPORTS[team.sportId] === season && team.greatness >= 70) {
    return { sport: team.sportName, event: `${team.sportName} (team)`, rating: team.greatness, team: true, squad: nationStrength(g, new RegExp(team.sportName.split(' ')[0], 'i')) }
  }
  if (season === 'summer') {
    const boxer = amateurBoxer(g)
    if (boxer && c.age >= 18 && c.age <= 35 && boxer.rating >= 45) return { sport: 'Boxing', event: 'Boxing', rating: boxer.rating + 18, team: false, squad: 0 }
  }
  // Teenage phenoms straight out of the junior ranks.
  const youth = peek<{ sport?: string; kind?: string; level?: number; program?: string | null }>(g, 'sports.youth')
  if (c.age >= 14 && c.age < 18 && youth?.program && typeof youth.sport === 'string' && youth.kind === 'individual') {
    const s = indSport(youth.sport)
    const lvl = juniorLevel(g, youth.sport)
    if (s && s.olympic === season && lvl >= 68 && typeof youth.level === 'number' && youth.level >= 72) return { sport: s.name, event: s.name, rating: lvl + 6, team: false, squad: 0 }
  }
  return null
}

interface FinalData {
  year: number
  entry: Entry
}

function place(g: GameState, e: Entry, mod: number, spread: number): number {
  const perf = (e.team ? e.squad * 0.6 + e.rating * 0.4 : e.rating) + mod + bell(g, -spread, spread)
  const field = e.team ? 12 : 30
  const mu = 76
  const n = (field - 1) / (1 + Math.exp((perf - mu) / 3.2))
  return Math.max(1, Math.min(field, 1 + Math.round(n)))
}

const finalScript = defineScript('sports.olympics.final', (g, choice, data) => {
  const f = data as unknown as FinalData
  if (!f || !f.entry) return
  const e = f.entry
  let pos: number
  if (choice === 'gold') pos = place(g, e, 4, 11)
  else if (choice === 'medal') pos = Math.min(place(g, e, 2, 5), place(g, e, 0, 8))
  else pos = place(g, e, 1, 8)
  const medal: MedalKind | null = pos === 1 ? 'gold' : pos === 2 ? 'silver' : pos === 3 ? 'bronze' : null
  const games = gamesName(f.year)
  const p = sportsProfile(g)
  if (!p.games.includes(f.year)) p.games.push(f.year)
  count(g, 'olympics')
  if (choice === 'moment') addStat(g, 'happiness', 6)
  if (!medal) {
    addFame(g, 2)
    addStat(g, 'happiness', -6)
    log(g, `I finished ${ordinal(pos)} in ${e.event} at the ${games}.`, 'neutral')
    say(g, 'So Close', `You finished ${ordinal(pos)}${pos === 4 ? ', the cruelest place in sport,' : ''} in ${e.event} at the ${games}. You're still an Olympian, forever.`, '\u{1F3C5}', 'neutral')
    honor(g, `Competed for ${nationalTeam(g)} at the ${games}.`, 'Olympian', nationalTeam(g), 7)
    return
  }
  p.medals.push({ year: f.year, games, sport: e.event, medal })
  count(g, 'olympicMedals')
  if (medal === 'gold') count(g, 'olympicGold')
  const fame = medal === 'gold' ? 14 : medal === 'silver' ? 8 : 6
  addFame(g, fame)
  addBuzz(g, medal === 'gold' ? 35 : 20)
  addStat(g, 'happiness', medal === 'gold' ? 25 : 15)
  const cid = g.character.countryId
  const goldBonus = GOLD_BONUS[cid] ?? tidy(20_000 * Math.max(0.3, wealth(g)))
  // The table is in today's dollars; a committee paid its medalists in the money of the year.
  const bonus = cid === 'gb' || cid === 'se' || cid === 'no' ? 0 : tidy(goldBonus * (medal === 'gold' ? 1 : medal === 'silver' ? 0.5 : 0.33) * realWealthFactor(g.year))
  if (bonus > 0) earnIncome(g, bonus)
  const word = medal === 'gold' ? 'GOLD' : medal === 'silver' ? 'silver' : 'bronze'
  honor(g, `Won Olympic ${medal} in ${e.event} at the ${games}.`, `Olympic ${medal} medalist (${e.sport})`, nationalTeam(g), medal === 'gold' ? 10 : 9)
  log(g, `I won Olympic ${medal} in ${e.event}!`, 'good')
  const anthem = medal === 'gold' ? ` They played the ${getCountry(cid).demonym} anthem and you cried on live TV.` : ''
  say(g, medal === 'gold' ? 'OLYMPIC CHAMPION!' : 'Olympic Medal!', `You won ${word} in ${e.event} at the ${games}!${anthem}${bonus ? ` Your Olympic committee paid you a ${short(bonus)} medal bonus.` : ''}`, medal === 'gold' ? '\u{1F947}' : medal === 'silver' ? '\u{1F948}' : '\u{1F949}', 'good')
})

/** Yearly (run after the season sims): selection and the Games themselves. */
export function yearlyOlympics(g: GameState): void {
  const season = gamesSeason(g.year)
  if (!season) return
  const e = selection(g, season)
  if (!e) return
  const games = gamesName(g.year)
  log(g, `I was selected for ${nationalTeam(g)} at the ${games}.`, 'good')
  addFame(g, 3)
  const flagBearer = g.character.hidden.fame >= 60 && chance(g, 0.3)
  scriptChoice(
    g,
    finalScript,
    'The Olympics',
    `You were selected for ${nationalTeam(g)} at the ${games}${flagBearer ? ' and chosen to carry the flag at the opening ceremony' : ''}! ${e.team ? `Your team fought through the group stage into the medal rounds.` : `You made it through the heats into the final.`} ${pickLine(g, ['The whole country is watching.', 'Your parents flew in wearing matching T-shirts with your face on them.', 'The stadium is so loud you can feel it in your teeth.'])} What's your mindset?`,
    [
      { id: 'gold', label: 'Go for gold, all or nothing', emoji: '\u{1F947}' },
      { id: 'medal', label: 'Play it safe and secure a medal', emoji: '\u{1F949}' },
      { id: 'moment', label: 'Soak in the moment', emoji: '\u{1F929}' },
    ],
    { emoji: '\u{1F3C5}', data: { year: g.year, entry: e } as unknown as Json },
  )
}

export const olympicsMenu: MenuGroup = {
  type: 'menu',
  id: 'sports.olympics',
  label: 'The Olympics',
  emoji: '\u{1F3C5}',
  subtitle: (g) => {
    const m = viewSports(g).medals
    if (m.length) return `${plural(m.filter((x) => x.medal === 'gold').length, 'gold')} · ${m.length} medal${m.length === 1 ? '' : 's'}`
    return `Next: ${gamesHost(nextGamesYear(g.year, 'summer'))} ${nextGamesYear(g.year, 'summer')} (Summer) · ${gamesHost(nextGamesYear(g.year, 'winter'))} ${nextGamesYear(g.year, 'winter')} (Winter)`
  },
  children: (g): MenuNode[] => {
    const s = nextGamesYear(g.year, 'summer')
    const w = nextGamesYear(g.year, 'winter')
    const p = viewSports(g)
    const nodes: MenuNode[] = [
      { type: 'info', id: 'sports.olympics.next', emoji: '\u{1F525}', text: `Next Summer Games: ${gamesName(s)}. Next Winter Games: ${gamesName(w)}.` },
      { type: 'info', id: 'sports.olympics.how', emoji: '\u{1F4CB}', text: `How to get picked for ${nationalTeam(g)}: be ranked in the world top 48 of an Olympic sport (tennis, track, swimming, gymnastics, judo, skiing...), be a star in an Olympic team sport, or be a top amateur boxer. Teen phenoms get picked straight from the junior ranks.` },
    ]
    p.medals.forEach((m, i) => nodes.push({ type: 'info', id: `sports.olympics.m${i}`, emoji: m.medal === 'gold' ? '\u{1F947}' : m.medal === 'silver' ? '\u{1F948}' : '\u{1F949}', text: `${m.medal[0].toUpperCase()}${m.medal.slice(1)} · ${m.sport} · ${m.games}` }))
    if (p.games.length && !p.medals.length) nodes.push({ type: 'info', id: 'sports.olympics.olympian', emoji: '\u{1F3C5}', text: `Olympian: ${p.games.join(', ')}` })
    return nodes
  },
}
