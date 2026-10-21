// Special Careers › Game Industry: work at game studios (QA Tester to Studio Head), make your
// own games (jams, hobby games, indie releases with crowdfunding, publishers and early access),
// and start or grow a game studio (a real company in the business system).
//
// The pieces:
//   gamedev-data    genres, platforms, scopes, engines, studios, the job ladder, awards (pure data)
//   gamedev-state   plain-JSON profile (skills, projects, credits, awards) + the studio job's data
//   gamedev-core    industry cycle, genre trends, reviews, sales, local pay (shared math)
//   gamedev-career  studio jobs: listings, interviews, the yearly job, crunch, layoffs, promotions
//   gamedev-make    making your own games, releasing them, DLC, sequels, jams
//   business/gamestudio  owned studios: pipeline, releases, publishers, acquisitions, IPO
// The home computer's old indie-game projects and indie-game ventures show up here too.
import { businessScreen } from '../business/manage'
import { hasTech } from '../history/timeline'
import { getCountry } from '../world'
import { foundingProblem, startFounding } from '../business/founding'
import { offerStudioGrowth, studioAssets, studioOf, ventureStudioBlock } from '../business/gamestudio'
import { devGames } from '../business/gamestudio-state'
import { bizOf } from '../business/state'
import { getProjectKind } from '../computer/dev-kinds'
import { devState } from '../computer/dev-state'
import { ventureSubtitle, ventureView } from '../computer/dev-venture'
import { addStat, count, log, remember } from '../core'
import { chance, pick } from '../rng'
import type { Asset, GameState, MenuGroup, MenuNode } from '../types'
import { addFame, blocked, money, say } from './common'
import { attendConvention, gameJobNodes, studioJobsMenu, trackSkill, yearlyGameJob } from './gamedev-career'
import { addGamerFame, coldGenre, copiesLabel, hotGenres, industryYear } from './gamedev-core'
import { AWARDS, CONVENTION, CRITIC_SITE, gameIndustryExists, genreDef, industryEraLine, JOYPAD_CATEGORIES, scopeDef, TIER_LABEL } from './gamedev-data'
import { makeGamesMenu, ownGameNode, yearlyMakeGames } from './gamedev-make'
import { gameJob, gamePortfolio, gameVentures, gdMut, gdPeek, gdView, playerLabel, readJobData, tidy, type GdCredit } from './gamedev-state'

// ---------------------------------------------------------------------------
// Your games, credits and trophies

function creditLine(x: GdCredit): string {
  const where = x.own ? (x.publisher ? `published by ${x.publisher}` : x.free ? 'game jam' : 'self-published') : x.studio
  const sales = x.free ? copiesLabel(x.copies, true) : copiesLabel(x.copies)
  return `"${x.title}" (${x.year}) · ${x.role}, ${where} · ${CRITIC_SITE} ${x.critic} · ${sales}${x.awards.length ? ` · \u{1F3C6} ${x.awards.length}` : ''}`
}

const yourGamesMenu: MenuGroup = {
  type: 'menu',
  id: 'gamedev.games',
  label: 'Your Games',
  emoji: '\u{1F4DA}',
  subtitle: (g) => {
    const port = gamePortfolio(g)
    const p = gdView(g)
    return port.shipped || port.jams ? `${port.shipped} shipped · ${port.jams} jam & hobby games · ${p.awards.length} award${p.awards.length === 1 ? '' : 's'}` : 'Nothing shipped yet'
  },
  header: (g) => {
    const p = gdView(g)
    const port = gamePortfolio(g, p)
    return `Gamer fame ${p.gamerFame}/100 · best ${CRITIC_SITE} score ${port.best || '-'} · ${p.industryYears} year${p.industryYears === 1 ? '' : 's'} at studios${p.layoffs ? ` · laid off ${p.layoffs}×` : ''}`
  },
  children: (g) => {
    const p = gdView(g)
    const nodes: MenuNode[] = []
    const own = p.games.filter((x) => x.own && !x.free).sort((a, b) => b.year - a.year)
    if (own.length) {
      nodes.push({ type: 'heading', id: 'gamedev.games.h.own', label: 'Your Releases' })
      for (const x of own) nodes.push(ownGameNode(x))
    }
    const credits = p.games.filter((x) => !x.own).sort((a, b) => b.year - a.year)
    if (credits.length) {
      nodes.push({ type: 'heading', id: 'gamedev.games.h.credits', label: 'Studio Credits' })
      credits.forEach((x, i) => nodes.push({ type: 'info', id: `gamedev.games.credit.${i}`, emoji: genreDef(x.genre).emoji, text: creditLine(x) }))
    }
    const jams = p.games.filter((x) => x.free).sort((a, b) => b.year - a.year)
    const hobby = devState(g).projects.filter((x) => x.kind === 'scratch' || x.kind === 'mod' || x.kind === 'game')
    if (jams.length || hobby.length) {
      nodes.push({ type: 'heading', id: 'gamedev.games.h.hobby', label: 'Jams & Hobby Games' })
      jams.slice(0, 8).forEach((x, i) => nodes.push({ type: 'info', id: `gamedev.games.jam.${i}`, emoji: '\u{1F355}', text: creditLine(x) }))
      hobby.forEach((x, i) => {
        const kind = getProjectKind(x.kind)
        nodes.push({ type: 'info', id: `gamedev.games.hobby.${i}`, emoji: kind?.emoji ?? '\u{1F47E}', text: `${kind ? kind.cvTitle(x.name) : x.name} (age ${x.age}) · quality ${Math.round(x.q)} · ${x.users.toLocaleString('en-US')} ${kind?.unit ?? 'player'}s${x.earned > 0 ? ` · ${money(x.earned)} earned` : ''}` })
      })
    }
    if (p.awards.length) {
      nodes.push({ type: 'heading', id: 'gamedev.games.h.awards', label: 'Trophy Shelf' })
      p.awards
        .slice()
        .reverse()
        .forEach((a, i) => nodes.push({ type: 'info', id: `gamedev.games.award.${i}`, emoji: '\u{1F3C6}', text: a }))
    }
    if (!nodes.length) nodes.push({ type: 'info', id: 'gamedev.games.none', emoji: '\u{1F579}\u{FE0F}', text: 'No games yet. Enter a game jam, make a Scratch game, or get a job at a studio.' })
    return nodes
  },
}

// ---------------------------------------------------------------------------
// Indie game ventures (from the home computer) and owned studios

function ventureNode(a: Asset): MenuGroup {
  return {
    type: 'menu',
    id: `gamedev.venture.${a.id}`,
    label: a.name,
    emoji: a.emoji,
    subtitle: (g) => {
      const cur = g.assets.find((x) => x.id === a.id)
      return cur ? ventureSubtitle(g, cur) : 'Gone'
    },
    header: (g) => {
      const cur = g.assets.find((x) => x.id === a.id)
      return cur ? `${cur.emoji} ${cur.name}: your indie game venture. ${g.character.age >= 18 ? 'It can grow' : 'At 18 it can grow'} into a registered game studio.` : 'This venture is gone.'
    },
    children: (g) => {
      const cur = g.assets.find((x) => x.id === a.id)
      if (!cur) return [{ type: 'info', id: 'gamedev.venture.gone', text: 'You no longer own this.' }]
      return [
        {
          type: 'action',
          id: `gamedev.venture.${a.id}.grow`,
          label: 'Grow Into a Game Studio',
          emoji: '\u{1F3E2}',
          subtitle: 'Register a company, hire developers, make the next game',
          disabledReason: (gg) => {
            const v = gg.assets.find((x) => x.id === a.id)
            return v ? ventureStudioBlock(gg, v) : 'Gone.'
          },
          run: (gg) => {
            const v = gg.assets.find((x) => x.id === a.id)
            if (v) offerStudioGrowth(gg, v)
          },
        },
        ...ventureView(g, cur),
      ]
    },
  }
}

function studioNode(a: Asset): MenuGroup {
  return {
    type: 'menu',
    id: `gamedev.studio.${a.id}`,
    label: a.name,
    emoji: a.emoji,
    subtitle: (g) => {
      const cur = g.assets.find((x) => x.id === a.id)
      if (!cur) return 'Gone'
      const st = studioOf(cur)
      return `Game studio · ${devGames(st).length} in development · ${money(cur.value)}`
    },
    header: (g) => {
      const cur = g.assets.find((x) => x.id === a.id)
      return cur ? `${cur.emoji} ${cur.name}` : 'You no longer own this studio.'
    },
    children: (g) => {
      const cur = g.assets.find((x) => x.id === a.id)
      return cur ? businessScreen(g, cur) : [{ type: 'info', id: 'gamedev.studio.gone', text: 'You no longer own this studio.' }]
    },
  }
}

function studioSection(g: GameState): MenuNode[] {
  const nodes: MenuNode[] = []
  const ventures = gameVentures(g)
  const studios = studioAssets(g)
  nodes.push({ type: 'heading', id: 'gamedev.h.studio', label: 'Your Studio' })
  for (const a of studios) nodes.push(studioNode(a))
  for (const a of ventures) nodes.push(ventureNode(a))
  nodes.push({
    type: 'action',
    id: 'gamedev.studio.start',
    label: 'Start a Game Studio',
    emoji: '\u{1F3E2}',
    subtitle: (gg) => (gg.character.age < 18 ? 'At 18 (or grow an indie game venture into one)' : 'Register a company, hire developers, greenlight games'),
    disabledReason: (gg) => foundingProblem(gg, 'gameStudio'),
    run: (gg) => startFounding(gg, 'gameStudio'),
  })
  return nodes
}

// ---------------------------------------------------------------------------
// The menu

/** Video games exist here: the arcade era has reached the player's country. */
function industryHere(g: GameState): boolean {
  return gameIndustryExists(g.year) && hasTech(g, 'videoGameConsole')
}

function newsLine(g: GameState): string {
  const iy = industryYear(g)
  const hot = hotGenres(g)
    .map((x) => x.label)
    .join(' and ')
  const mood = iy.mood === 'downturn' ? 'Layoff season: studios are cutting jobs and cancelling games.' : iy.mood === 'boom' ? 'Boom times: players are spending and studios are hiring.' : 'A steady year for games.'
  const era = industryEraLine(g.year)
  return `${era ? `${era} ` : ''}${mood} Hot right now: ${hot}. Out of fashion: ${coldGenre(g).label}.`
}

/** Special Careers › Game Industry. */
export const gameIndustryMenu: MenuGroup = {
  type: 'menu',
  id: 'gameIndustry',
  label: 'Game Industry',
  emoji: '\u{1F3AE}',
  subtitle: (g) => {
    const job = gameJob(g)
    if (job) return `${job.title} at ${readJobData(job).studio}`
    const studios = studioAssets(g)
    if (studios.length) return `${studios.length === 1 ? studios[0].name : `${studios.length} studios`} · make games, run the studio`
    const p = gdPeek(g)
    if (p && (p.projects.length || p.games.length)) return `${p.projects.length} in development · ${p.games.filter((x) => !x.free).length} released`
    return industryHere(g) ? 'Make games, work at studios, start your own' : 'Not invented yet'
  },
  visible: (g) => g.character.alive && !g.character.prison,
  header: (g) => {
    const c = g.character
    if (!industryHere(g) && !gdPeek(g)) return ''
    if (c.age < 6) return 'You are a little young to make games. You are, however, the perfect age to play them.'
    const p = gdView(g)
    return `${newsLine(g)}\nCoding ${trackSkill(g, 'code', p)} · design ${trackSkill(g, 'design', p)} · art ${trackSkill(g, 'art', p)} · gamer fame ${p.gamerFame}`
  },
  children: (g): MenuNode[] => {
    const c = g.character
    if (!industryHere(g) && !gdPeek(g)) {
      const text = gameIndustryExists(g.year)
        ? `It's ${g.year}. Arcade machines and home consoles haven't reached ${getCountry(g.character.countryId).name} yet. Come back when they do.`
        : `It's ${g.year}. Nobody has built an arcade machine or a home console yet; the first ones arrive in the early 1970s. Come back then.`
      return [{ type: 'info', id: 'gamedev.noIndustry', emoji: '\u{1F579}\u{FE0F}', text }]
    }
    if (c.age < 6) return [{ type: 'info', id: 'gamedev.young', emoji: '\u{1F476}', text: 'Come back when you can hold a controller the right way up.' }]
    const nodes: MenuNode[] = []
    const job = gameJob(g)
    if (job) {
      const d = readJobData(job)
      nodes.push({ type: 'info', id: 'gamedev.job.here', emoji: '\u{1F3AE}', text: `You work as ${job.title} at ${d.studio} (${TIER_LABEL[d.tier]}). Your job's actions are in Occupation › My Work.` })
    }
    nodes.push({ type: 'heading', id: 'gamedev.h.make', label: 'Make Games' }, makeGamesMenu, yourGamesMenu)
    nodes.push({ type: 'heading', id: 'gamedev.h.work', label: 'Work in Games' }, studioJobsMenu)
    nodes.push({
      type: 'action',
      id: 'gamedev.convention',
      label: `Go to ${CONVENTION}`,
      emoji: '\u{1F3AA}',
      subtitle: 'The big games convention: networking, demos, recruiters',
      visible: (gg) => gg.character.age >= 14 && gg.year >= 1995,
      disabledReason: (gg) => blocked(gg, 14),
      run: attendConvention,
    })
    if (c.age >= 12 || gameVentures(g).length || studioAssets(g).length) nodes.push(...studioSection(g))
    return nodes
  },
}

/** Occupation tab rows while the player has a game-industry job. */
export function gameDevJobNodes(g: GameState): MenuNode[] {
  return gameJobNodes(g)
}

// ---------------------------------------------------------------------------
// Yearly

/** Award season for games released last year (at most one ceremony popup). */
function awardSeason(g: GameState, budget: number): number {
  const p0 = gdPeek(g)
  if (!p0 || p0.awardYear >= g.year) return 0
  const year = g.year - 1
  const candidates = p0.games.filter((x) => x.year === year && x.scope !== 'jam')
  if (!candidates.length) return 0
  const p = gdMut(g)
  p.awardYear = g.year
  const pool = p.games.filter((x) => x.year === year && x.scope !== 'jam').sort((a, b) => b.critic - a.critic)
  const best = pool[0]
  const worst = pool[pool.length - 1]
  const major = (x: GdCredit) => x.own || /Lead|Director|Head|Founder|CEO|Producer|Art Director/.test(x.role)
  let won = ''
  let target: GdCredit | undefined
  if (best && best.critic >= 92 && scopeDef(best.scope).index >= 2 && chance(g, 0.4)) {
    won = AWARDS.goty
    target = best
  } else if (best && best.critic >= 85 && chance(g, 0.45)) {
    won = `${AWARDS.joypad} for ${pick(g, JOYPAD_CATEGORIES)}`
    target = best
  } else if (best && best.critic >= 82 && scopeDef(best.scope).index <= 2 && chance(g, 0.4)) {
    won = AWARDS.indie
    target = best
  } else if (worst && worst.critic < 35 && (scopeDef(worst.scope).index >= 3 || worst.own) && major(worst) && chance(g, 0.5)) {
    won = AWARDS.worst
    target = worst
  }
  if (!won || !target) {
    tidy(p)
    return 0
  }
  const x = target
  x.awards.push(won)
  const own = major(x)
  const line = `${won}: "${x.title}" (${x.year})${own ? '' : ' (as part of the team)'}`
  p.awards.push(line)
  // An award for a studio you own lifts the studio's brand.
  const studio = g.assets.find((a) => a.kind === 'business' && a.name === x.studio && a.details?.industry === 'gameStudio')
  if (won === AWARDS.worst) {
    addGamerFame(p, -3)
    addStat(g, 'happiness', -6)
    if (studio) bizOf(g, studio).brand = Math.max(0, bizOf(g, studio).brand - 5)
  } else {
    const gain = won === AWARDS.goty ? 8 : won === AWARDS.indie ? 5 : 4
    addGamerFame(p, own ? gain : Math.ceil(gain / 3))
    addStat(g, 'happiness', own ? 12 : 5)
    if (own && won === AWARDS.goty) addFame(g, 5)
    if (studio) bizOf(g, studio).brand = Math.min(100, bizOf(g, studio).brand + (won === AWARDS.goty ? 10 : 5))
    count(g, 'gameAwards')
  }
  tidy(p)
  log(g, won === AWARDS.worst ? `"${x.title}" won the ${won}. Ouch.` : `"${x.title}" won the ${won}!`, won === AWARDS.worst ? 'bad' : 'good')
  remember(g, line)
  if (budget <= 0) return 0
  if (won === AWARDS.worst) {
    say(g, 'Rusty Cartridge', `"${x.title}" won the ${won}. The trophy is a cartridge that does not work. You are contractually obliged to blow into it on stage. ${pick(g, ['The audience gave you a pity clap.', 'You accepted it in person, which the internet respected.'])}`, '\u{1F5D1}\u{FE0F}', 'bad')
  } else {
    say(g, 'And the Winner Is...', `"${x.title}" won the ${won}!${own ? ` You walked on stage, thanked ${pick(g, ['your mom', 'the QA team, who are the real heroes', 'every developer who crunched (and said it should not happen again)', 'your cat'])}, and the orchestra played you off.` : ' The whole team went on stage. You were in the back row, waving.'} ${CRITIC_SITE} score: ${x.critic}, players: "${playerLabel(x.players)}".`, '\u{1F3C6}', 'good')
  }
  return 1
}

/** At 18, a teenager's indie game venture can become a real studio (asked once per venture). */
function ventureOffers(g: GameState, budget: number): number {
  const c = g.character
  if (budget <= 0 || c.age < 18 || c.prison) return 0
  const p0 = gdPeek(g)
  for (const a of gameVentures(g)) {
    if (p0?.offered.includes(a.id)) continue
    if (ventureStudioBlock(g, a)) continue
    const p = gdMut(g)
    p.offered.push(a.id)
    tidy(p)
    offerStudioGrowth(g, a, `You're ${c.age}, and ${a.name} is a real game with real players.`)
    return 1
  }
  return 0
}

/** Gamers forget people who stop making games. */
function fameDrift(g: GameState): void {
  const p0 = gdPeek(g)
  if (!p0 || p0.gamerFame <= 0) return
  const active = !!gameJob(g) || p0.projects.length > 0 || p0.games.some((x) => g.year - x.year <= 2) || studioAssets(g).length > 0
  if (active) return
  const p = gdMut(g)
  addGamerFame(p, -1)
}

/** Yearly hook: the studio job, your own games' sales and projects, awards, studio offers. */
export function yearlyGameDev(g: GameState): void {
  const c = g.character
  if (!c.alive) return
  const job = gameJob(g)
  const p0 = gdPeek(g)
  if (!job && !p0 && !gameVentures(g).length) return
  const marker = gdMut(g)
  if (marker.settledYear === g.year && marker.settledAge === c.age) return
  // Write the marker before any random resolution or payment. Re-entering after a partially
  // handled popup/save cannot rerun salaries, royalties, sales or layoffs for this same tick.
  marker.settledYear = Math.max(-10_000, Math.min(100_000, Math.round(g.year)))
  marker.settledAge = Math.max(-1, Math.min(10_000, Math.round(c.age)))
  let budget = 2
  budget -= yearlyGameJob(g, budget)
  if (!c.alive) return
  if (gdPeek(g)) yearlyMakeGames(g)
  budget -= awardSeason(g, budget)
  budget -= ventureOffers(g, budget)
  fameDrift(g)
}
