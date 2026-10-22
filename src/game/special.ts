// Special careers, fame, social media and the military (contract module).
// The features live in src/game/special/*.ts; this file wires them into the menus and the
// yearly loop:
//   Occupation › Special Careers: Actor, Astronaut, Author, Influencer, Model, Musician, Politician,
//                                 Sports, Game Industry, Street Hustler, Business (business.ts)
//   Occupation › Military:        enlist / commission, ranks, deployments, discharges, draft
//   Activities › Fame:            celebrity actions (books, commercials, talk shows...)
//   Activities › Social Media:    accounts on every platform, posting, going viral, verification
import { businessCareerMenu, businessJobNodes } from './business'
import { endJob, log, notice } from './core'
import { collectMenu, registerModules, yearlyEntries, type MenuEntry, type YearlyEntry } from './kernel/registry'
import { actorCareerMenu, actorJobNodes, yearlyActor } from './special/actor'
import { astronautCareerMenu, astronautJobNodes, yearlyAstronaut } from './special/astronaut'
import { yearlyCareerSims } from './special/kit/careers'
import { authorCareerMenu, authorJobNodes, yearlyAuthor } from './special/author'
import { gameDevJobNodes, gameIndustryMenu, yearlyGameDev } from './special/gamedev'
import { fameMenu, yearlyFame } from './special/fame'
import { hustlerCareerMenu, hustlerJobNodes, yearlyHustler } from './special/hustler'
import { militaryJobNodes, militaryMenu, yearlyMilitary } from './special/military'
import { modelCareerMenu, modelJobNodes, yearlyModel } from './special/model'
import { musicCareerMenu, musicJobNodes, yearlyMusic } from './special/music'
import { politicsCareerMenu, politicsJobNodes, yearlyPolitics } from './special/politics'
import { socialMediaMenu, totalFollowers, yearlySocial } from './special/social'
import { sportsCareerMenu, sportsJobNodes, yearlySports } from './special/sports'
import type { GameState, MenuGroup, MenuNode } from './types'

export { fameMenu, militaryMenu, socialMediaMenu }

/**
 * Special-career pay, residuals and royalties, promotions, the draft, follower growth, fame decay. The hooks are the `special`
 * seam of the module registry (registered below), run in (phase, order) order; each is a no-op when it doesn't apply. The
 * list is read afresh every call, so a registration or a test's withYearly shows up in the next year.
 */
export function yearlySpecial(g: GameState): void {
  for (const e of yearlyEntries('special')) {
    if (!g.character.alive) return
    e.run(g)
  }
}

/** Social media doubles as the Influencer career. */
const influencerMenu: MenuGroup = {
  ...socialMediaMenu,
  id: 'special.influencer',
  label: 'Influencer',
  subtitle: (g) => {
    const total = totalFollowers(g)
    return total > 0 ? `${total.toLocaleString('en-US')} followers` : 'Build a following on social media'
  },
  visible: undefined,
  disabledReason: (g) => {
    const c = g.character
    if (!c.alive) return 'You are no longer alive.'
    if (c.prison) return "You can't post from prison."
    if (socialMediaMenu.visible && !socialMediaMenu.visible(g)) return 'You are too young for social media.'
    return null
  },
}

// The careers as modules (R2, K.3 f). Each career is one ModuleDef `special.<name>` with the entries it has: a yearly hook in the
// `special` seam, a row on the `special.careers` menu slot, a row on the `special.jobs` slot. The registry sorts by (phase, order,
// module id), and the table below gives today's order exactly: the hooks run military, then the careers (actor, music, sports,
// gamedev, author, model, politics, astronaut, careers2, hustler), then the public life (social, fame); the menus list actor,
// astronaut, author, influencer, model, music, politics, sports, game industry, hustler, business; the jobs list military, actor,
// music, sports, gamedev, author, model, politics, astronaut, hustler, business. Orders are multiples of 10 so a track can
// insert one between two (an extension adds its own module, with order 45 for a row between Influencer and Model).
//
// Every run and build is an arrow, so no imported binding is read while this file loads. This file sits in an import cycle, and a
// read of a half-loaded import at load time is the classic load-order crash (test/layers.test.ts rule d); an arrow reads it when
// the year steps or the menu opens, and a test that spies on a hook sees the spy for the same reason.
const hook = (phase: string, order: number, run: (g: GameState) => void): YearlyEntry => ({ seam: 'special', phase, order, run })
const careerRow = (order: number, build: (g: GameState) => MenuNode[]): MenuEntry => ({ path: 'special.careers', order, build })
const jobRow = (order: number, build: (g: GameState) => MenuNode[]): MenuEntry => ({ path: 'special.jobs', order, build })

registerModules([
  { id: 'special.military', layer: 3, yearly: [hook('service', 10, (g) => yearlyMilitary(g))], menus: [jobRow(10, (g) => militaryJobNodes(g))] },
  {
    id: 'special.actor',
    layer: 3,
    yearly: [hook('careers', 10, (g) => yearlyActor(g))],
    menus: [careerRow(10, () => [actorCareerMenu]), jobRow(20, (g) => actorJobNodes(g))],
  },
  {
    id: 'special.astronaut',
    layer: 3,
    yearly: [hook('careers', 80, (g) => yearlyAstronaut(g))],
    menus: [careerRow(20, () => [astronautCareerMenu]), jobRow(90, (g) => astronautJobNodes(g))],
  },
  {
    id: 'special.author',
    layer: 3,
    yearly: [hook('careers', 50, (g) => yearlyAuthor(g))],
    menus: [careerRow(30, () => [authorCareerMenu]), jobRow(60, (g) => authorJobNodes(g))],
  },
  { id: 'special.social', layer: 3, yearly: [hook('public', 10, (g) => yearlySocial(g))], menus: [careerRow(40, () => [influencerMenu])] },
  {
    id: 'special.model',
    layer: 3,
    yearly: [hook('careers', 60, (g) => yearlyModel(g))],
    menus: [careerRow(50, () => [modelCareerMenu]), jobRow(70, (g) => modelJobNodes(g))],
  },
  {
    id: 'special.music',
    layer: 3,
    yearly: [hook('careers', 20, (g) => yearlyMusic(g))],
    menus: [careerRow(60, () => [musicCareerMenu]), jobRow(30, (g) => musicJobNodes(g))],
  },
  {
    id: 'special.politics',
    layer: 3,
    yearly: [hook('careers', 70, (g) => yearlyPolitics(g))],
    menus: [careerRow(70, () => [politicsCareerMenu]), jobRow(80, (g) => politicsJobNodes(g))],
  },
  {
    id: 'special.sports',
    layer: 3,
    yearly: [hook('careers', 30, (g) => yearlySports(g))],
    menus: [careerRow(80, () => [sportsCareerMenu]), jobRow(40, (g) => sportsJobNodes(g))],
  },
  {
    id: 'special.gamedev',
    layer: 3,
    yearly: [hook('careers', 40, (g) => yearlyGameDev(g))],
    menus: [careerRow(90, () => [gameIndustryMenu]), jobRow(50, (g) => gameDevJobNodes(g))],
  },
  {
    id: 'special.hustler',
    layer: 3,
    yearly: [hook('careers', 100, (g) => yearlyHustler(g))],
    menus: [careerRow(100, () => [hustlerCareerMenu]), jobRow(100, (g) => hustlerJobNodes(g))],
  },
  { id: 'special.business', layer: 3, menus: [careerRow(110, () => [businessCareerMenu]), jobRow(110, (g) => businessJobNodes(g))] },
  { id: 'special.careers2', layer: 3, yearly: [hook('careers', 90, (g) => yearlyCareerSims(g))] },
  { id: 'special.fame', layer: 3, yearly: [hook('public', 20, (g) => yearlyFame(g))] },
])

export const specialCareersMenu: MenuGroup = {
  type: 'menu',
  id: 'specialCareers',
  label: 'Special Careers',
  emoji: '\u{2B50}',
  subtitle: 'Actor, author, athlete, game developer, musician, politician and more',
  visible: (g) => g.character.alive && !g.character.prison,
  header: (g) =>
    g.character.age < 16
      ? "Special careers open up when you're older. Build your skills now: lessons, sports, school and space camp all help."
      : 'Careers with fame, fortune and a lot more risk than an office job. Taking one means quitting your current job.',
  children: (g): MenuNode[] => collectMenu('special.careers', g),
}

/** Actions for whichever special or military job the player currently holds. */
export function specialJobNodes(g: GameState): MenuNode[] {
  const c = g.character
  if (!c.alive || c.prison || !c.job) return []
  const nodes = collectMenu('special.jobs', g)
  if (nodes.length || (c.job.category !== 'special' && c.job.category !== 'military')) return nodes
  // A special job no module recognizes (e.g. from an old save): still let the player leave it.
  const job = c.job
  return [
    { type: 'info', id: 'special.unknown', emoji: '\u{2B50}', text: `${job.title} at ${job.company}` },
    {
      type: 'action',
      id: 'special.unknown.quit',
      label: 'Quit',
      emoji: '\u{1F6AA}',
      subtitle: `Leave your job as ${job.title}`,
      confirm: () => `Quit your job as ${job.title}?`,
      run: (gg) => {
        const j = gg.character.job
        if (!j) return
        endJob(gg, 'job', 'quit')
        log(gg, `I quit my job as ${j.title}.`)
        notice(gg, 'Quit', `You quit your job as ${j.title}.`, { emoji: '\u{1F6AA}' })
      },
    },
  ]
}
