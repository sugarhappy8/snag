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

/** Yearly hooks, in order. Each is a no-op when it doesn't apply. */
export const SPECIAL_YEARLY: [string, (g: GameState) => void][] = [
  ['military', yearlyMilitary],
  ['actor', yearlyActor],
  ['music', yearlyMusic],
  ['sports', yearlySports],
  ['gamedev', yearlyGameDev],
  ['author', yearlyAuthor],
  ['model', yearlyModel],
  ['politics', yearlyPolitics],
  ['astronaut', yearlyAstronaut],
  ['careers2', yearlyCareerSims],
  ['hustler', yearlyHustler],
  ['social', yearlySocial],
  ['fame', yearlyFame],
]

/** Special-career pay, residuals and royalties, promotions, the draft, follower growth, fame decay. */
export function yearlySpecial(g: GameState): void {
  for (const [, hook] of SPECIAL_YEARLY) {
    if (!g.character.alive) return
    hook(g)
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
  children: (): MenuNode[] => [
    actorCareerMenu,
    astronautCareerMenu,
    authorCareerMenu,
    influencerMenu,
    modelCareerMenu,
    musicCareerMenu,
    politicsCareerMenu,
    sportsCareerMenu,
    gameIndustryMenu,
    hustlerCareerMenu,
    businessCareerMenu,
  ],
}

/** Actions for whichever special or military job the player currently holds. */
export function specialJobNodes(g: GameState): MenuNode[] {
  const c = g.character
  if (!c.alive || c.prison || !c.job) return []
  const nodes = [
    ...militaryJobNodes(g),
    ...actorJobNodes(g),
    ...musicJobNodes(g),
    ...sportsJobNodes(g),
    ...gameDevJobNodes(g),
    ...authorJobNodes(g),
    ...modelJobNodes(g),
    ...politicsJobNodes(g),
    ...astronautJobNodes(g),
    ...hustlerJobNodes(g),
    ...businessJobNodes(g),
  ]
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
