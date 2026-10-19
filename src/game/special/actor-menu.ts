// Actor 2.0 menus: the report card, the team, the projects (one menu each, with its own levers), the
// industry, the press agent, the scandal levers, range work, the likeness trust, and the exits (stunt,
// retire, quit). Every row is a kit `gatedAction`, so its gate is enforced inside run(), and every menu,
// hint and subtitle reads `view` and the pure world functions: no g.rng, no writes (the fuzzer renders
// all of it on a frozen state). Prices shown are the prices the operation charges.
//
// Built lazily and cached: actor.ts imports this file and this file imports actor.ts and actor-state.ts,
// so nothing here may read another module at load time.
import { addHidden, getPerson, useYearAction, yearActionsUsed } from '../core'
import { hasTech } from '../history/timeline'
import { chance, randInt } from '../rng'
import type { GameState, MenuAction, MenuGroup, MenuInfo, MenuNode } from '../types'
import { actorJob } from './actor'
import { INDUSTRIES, TYPE_IDS, type IndustryId, type TypeId } from './actor-data'
import { apologize, crisisPr, layLow, firePress, hirePress, rangeWork } from './actor-events'
import { actorStore, adoptLegacy, type ActorState, type Proj } from './actor-state'
import { actorLikenessNodes, createTrust, likenessOf, trustBlock, trustFee, trustsOf } from './actor-legacy'
import { awardsCampaign, developProject, hireCostars, pressTour, setWindow, walkAway } from './actor-pipeline'
import { teamRows } from './actor-team'
import { ACTOR_SPEC, clashOf, heat, hotTypes, industryOf, rankOf, scaleOf, starPower, studioYear } from './actor-world'
import { addFame, blocked, clamp100, leave, money } from './common'
import { gatedAction, standingMenu } from './kit/menu'
import { honest } from './kit/crisis'
import { KIT_LIMITS, cap } from './kit/state'
import { fit, careerLog, careerSay, type CareerCtx } from './kit/year'

const LINE = 90
const FILM = '\u{1F3AC}'
const TV = '\u{1F4FA}'
const PRESS = '\u{1F4E2}'
const REEL = '\u{1F39E}\u{FE0F}'

const INDUSTRY_NAME: Record<IndustryId, string> = {
  hollywood: 'Hollywood',
  bollywood: 'Bollywood',
  nollywood: 'Nollywood',
  kdrama: 'Korean drama',
  hongkong: 'Hong Kong film',
  domestic: 'The home film industry',
}

const fin = (n: unknown, d = 0): number => (typeof n === 'number' && Number.isFinite(n) ? n : d)
const info = (id: string, text: string): MenuInfo => ({ type: 'info', id, text: fit(text, LINE) })
const live = (p: Pick<Proj, 'stage'>): boolean => p.stage === 'shoot' || p.stage === 'offer'
const view = (g: GameState): ActorState => actorStore.view(g)
const migrated = (g: GameState): boolean => view(g).migrated
const projOf = (s: ActorState, id: string): Proj | undefined => s.pipeline.find((p) => p.id === id)
const actorWord = (g: GameState): string => (g.character.gender === 'female' ? 'Actress' : 'Actor')
const list = (xs: readonly string[]): string => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

/** The previous report's net (income less outlay): what "last year's net" means for a price. */
function lastNet(s: ActorState): number {
  const row = s.rows[s.rows.length - 1]
  return row ? Math.max(0, row.income - row.spent) : 0
}

/** `share` of last year's net, at least `floor` x the industry scale: the price the scandal, range and press levers charge. */
const priceOf = (g: GameState, s: ActorState, share: number, floor: number): number => Math.round(Math.max(floor * scaleOf(g), share * lastNet(s)))
/** 4% of the fee (at least 1): a press tour. */
const tourPrice = (p: Proj): number => Math.round(Math.max(1, fin(p.terms.fee) * 0.04))
/** 5% of last year's net, at least 1,000 x the industry scale: an awards campaign. */
const campaignPrice = (g: GameState, s: ActorState, p: Proj): number => Math.round(Math.max(1_000 * scaleOf(g, p.industry), lastNet(s) * 0.05))

const afford = (g: GameState, price: number): boolean => fin(g.character.money) >= price

type Spec = Omit<Parameters<typeof gatedAction<ActorState>>[0], 'career' | 'store'>

/** A gated action on the actor record; `visible` hides the row without removing its id from the tree. */
function row(spec: Spec, visible?: (g: GameState) => boolean): MenuAction {
  return { ...gatedAction<ActorState>({ career: 'actor', store: actorStore, ...spec }), ...(visible ? { visible } : {}) }
}

// ---------------------------------------------------------------------------
// The report card

let card: MenuGroup | null = null
const cardOf = (): MenuGroup =>
  (card ??= standingMenu<ActorState>({
    id: 'actor.standing',
    label: 'Career',
    emoji: '\u{1F31F}',
    store: actorStore,
    standingLabel: 'Reputation',
    incomeLabel: 'Residuals',
    peers: { spec: ACTOR_SPEC, score: starPower },
  }))

/** The report card: the standing, the last five years, the top peers and who remembers you. Built on first use. */
export const actorStanding: MenuGroup = {
  type: 'menu',
  id: 'actor.standing',
  label: 'Career',
  emoji: '\u{1F31F}',
  subtitle: (g) => {
    const s = cardOf().subtitle
    return typeof s === 'function' ? s(g) : (s ?? '')
  },
  children: (g) => cardOf().children(g),
}

// ---------------------------------------------------------------------------
// One project: its levers

function projectRows(id: string): MenuNode[] {
  const stage = (...stages: Proj['stage'][]) => (g: GameState): boolean => {
    const p = projOf(view(g), id)
    return !!p && stages.includes(p.stage)
  }
  const used = (g: GameState, key: string): number => yearActionsUsed(g, `${key}.${id}`)
  const guard = (s: ActorState, stages: Proj['stage'][], words: string): Proj | string => {
    const p = projOf(s, id)
    if (!p) return "That project isn't in the works."
    return stages.includes(p.stage) ? p : words
  }
  const rows: MenuNode[] = [
    row(
      {
        id: `actor.project.${id}.develop`,
        label: 'Develop Character',
        emoji: '\u{1F9E0}',
        subtitle: 'Prepare for the part. Once a year.',
        gate: (g, s) => {
          const p = guard(s, ['shoot'], 'You can develop a character while the shoot is on.')
          if (typeof p === 'string') return p
          return used(g, 'actor.develop') >= 1 ? "You've already worked on this character this year." : null
        },
        run: (c) => developProject(c, id),
      },
      stage('shoot'),
    ),
    row(
      {
        id: `actor.project.${id}.costars`,
        label: 'Co-Stars',
        emoji: '\u{1F465}',
        subtitle: 'Dinner with a co-star. Once a year.',
        gate: (g, s) => {
          const p = guard(s, ['shoot'], 'Co-stars are on set during the shoot.')
          if (typeof p === 'string') return p
          if (!p.costars.some((x) => getPerson(g, x)?.alive)) return 'Your co-stars are busy running lines without you.'
          return used(g, 'actor.costars') >= 1 ? 'Your co-stars are busy running lines without you.' : null
        },
        run: (c) => hireCostars(c, id),
      },
      stage('shoot'),
    ),
    row(
      {
        id: `actor.project.${id}.press`,
        label: 'Press Tour',
        emoji: PRESS,
        subtitle: (g) => {
          const p = projOf(view(g), id)
          return p ? `Cost ${money(tourPrice(p))}, buzz +6. Twice a year.` : ''
        },
        gate: (g, s) => {
          const p = guard(s, ['shoot', 'post'], "There's nothing to tour yet.")
          if (typeof p === 'string') return p
          if (used(g, 'actor.press') >= 2) return 'The studio says the press has seen enough of you this year.'
          return afford(g, tourPrice(p)) ? null : "You can't afford the tour right now."
        },
        run: (c) => pressTour(c, id),
      },
      stage('shoot', 'post'),
    ),
    row(
      {
        id: `actor.project.${id}.window.awards`,
        label: 'Awards Window',
        emoji: '\u{1F3C6}',
        subtitle: 'Awards odds +8 points, gross 8% less',
        gate: (_g, s) => {
          const p = guard(s, ['post'], 'Only a film in post can set its date.')
          return typeof p === 'string' ? p : null
        },
        hint: (g, s) => {
          const p = projOf(s, id)
          if (!p || p.stage !== 'post' || p.role === 'Extra' || p.quality < 70 || clashOf(g, p.industry, p.type, g.year + 1)) return null
          return honest(g, 'Acting', 'It has awards quality. This window lifts the odds about 8 points.').hint ?? null
        },
        run: (c) => setWindow(c, id, 'awards'),
      },
      stage('post'),
    ),
    row(
      {
        id: `actor.project.${id}.window.dodge`,
        label: 'Dodge the Clash',
        emoji: '\u{1F4C5}',
        subtitle: 'Gross 5% less, no clash penalty',
        gate: (_g, s) => {
          const p = guard(s, ['post'], 'Only a film in post can set its date.')
          return typeof p === 'string' ? p : null
        },
        hint: (g, s) => {
          const p = projOf(s, id)
          if (!p || p.stage !== 'post' || !clashOf(g, p.industry, p.type, g.year + 1)) return null
          return honest(g, 'Acting', 'A rival opens big that week. This date dodges the clash.').hint ?? null
        },
        run: (c) => setWindow(c, id, 'dodge'),
      },
      stage('post'),
    ),
    row(
      {
        id: `actor.project.${id}.campaign`,
        label: 'Awards Campaign',
        emoji: '\u{1F3C5}',
        subtitle: (g) => {
          const s = view(g)
          const p = projOf(s, id)
          return p ? `Cost ${money(campaignPrice(g, s, p))}, campaign +10. Once.` : ''
        },
        gate: (g, s) => {
          const p = guard(s, ['shoot', 'post'], "There's nothing to campaign for yet.")
          if (typeof p === 'string') return p
          if (p.campaign >= 10) return "You've already campaigned for this one."
          return afford(g, campaignPrice(g, s, p)) ? null : "You can't afford a campaign right now."
        },
        run: (c) => awardsCampaign(c, id),
      },
      stage('shoot', 'post'),
    ),
    row({
      id: `actor.project.${id}.walk`,
      label: 'Walk Away',
      emoji: '\u{1F6AA}',
      subtitle: 'Reputation -15',
      gate: (_g, s) => {
        const p = guard(s, ['offer', 'shoot', 'post'], "That project isn't in the works.")
        return typeof p === 'string' ? p : null
      },
      confirm: (g) => {
        const p = projOf(view(g), id)
        return p ? `Walk away from "${p.title}"? Your reputation takes a hit.` : null
      },
      run: (c) => walkAway(c, id),
    }),
  ]
  return rows
}

function stageLine(p: Proj): string {
  const per = p.kind === 'tv' ? ' a season' : ''
  if (p.stage === 'offer') return `Contract waiting, ${money(p.terms.fee)}${per}`
  if (p.stage === 'post') return 'Wrapped. It opens next year.'
  return `Shooting, ${money(p.terms.fee)}${per}`
}

function projectGroup(p: Proj): MenuGroup {
  const id = p.id
  return {
    type: 'menu',
    id: `actor.project.${id}`,
    label: p.title,
    emoji: p.kind === 'tv' ? TV : FILM,
    subtitle: (gg) => {
      const now = projOf(view(gg), id)
      return now ? fit(stageLine(now), LINE) : ''
    },
    children: (gg) => {
      const now = projOf(view(gg), id)
      if (!now) return []
      const costars = now.costars.filter((x) => getPerson(gg, x)?.alive).length
      return [
        info(`actor.project.${id}.info`, `${now.role} in a ${now.genre.toLowerCase()} ${now.kind === 'tv' ? `series, season ${now.season}` : 'film'} for ${now.studio}. Buzz ${now.buzz}.`),
        info(`actor.project.${id}.terms`, `Fee ${money(now.terms.fee)}, back-end ${Math.round(now.terms.points * 1000) / 10}%${now.terms.exclusive ? ', exclusive' : ''}. ${costars} co-star${costars === 1 ? '' : 's'}.`),
        ...projectRows(id),
      ]
    },
  }
}

/** The projects in the works, one menu each. Shown once the sim owns the life: before that the legacy rows run the one project. */
function pipelineMenu(): MenuGroup {
  return {
    type: 'menu',
    id: 'actor.pipeline',
    label: 'Projects',
    emoji: REEL,
    visible: (g) => {
      const s = view(g)
      return s.migrated && s.pipeline.length > 0
    },
    subtitle: (g) => {
      const n = view(g).pipeline.length
      return `${n} in the works`
    },
    header: () => 'Films shoot for a year and open the next. Series shoot and air in one. Four projects at most.',
    children: (g) => view(g).pipeline.map(projectGroup),
  }
}

// ---------------------------------------------------------------------------
// The industry

function industryMenu(): MenuGroup {
  const eraLines = (g: GameState, industry: IndustryId): string[] => {
    const out: string[] = []
    const def = INDUSTRIES[industry]
    out.push(studioYear(industry, g.year) && def.studio ? `Studio system until ${def.studio[1]}. Studios set your terms, and you work exclusive.` : 'You negotiate your own terms.')
    const work = ['film', ...(hasTech(g, 'tv') ? ['TV'] : []), ...(hasTech(g, 'streaming') ? ['streaming'] : [])]
    out.push(`Work on offer: ${list(work)}.`)
    return out
  }
  return {
    type: 'menu',
    id: 'actor.industry',
    label: 'Industry',
    emoji: REEL,
    subtitle: (g) => {
      const industry = industryOf(g)
      const st = rankOf(g, view(g))
      return fit(st.top.length > 0 ? `${INDUSTRY_NAME[industry]}, rank ${st.rank} of ${st.of}` : INDUSTRY_NAME[industry], LINE)
    },
    // The hot type and the calendar are public; with the gift for it, the best move on them is marked.
    hint: (g) => {
      const hot = hotTypes(g)
      return hot.length > 0 ? (honest(g, 'Acting', `Roles in ${list(hot)} ride the trend this year.`).hint ?? null) : null
    },
    children: (g) => {
      const industry = industryOf(g)
      const h = heat(industry, g.year)
      const st = rankOf(g, view(g))
      const mood = h <= 0 ? 'There is no film industry here yet.' : h >= 1.1 ? 'Business is booming.' : h >= 0.8 ? 'Business is steady.' : 'Business is slow.'
      const hot = hotTypes(g)
      const next: TypeId[] = TYPE_IDS.filter((t) => clashOf(g, industry, t, g.year + 1))
      return [
        info('actor.industry.name', `${INDUSTRY_NAME[industry]}. ${mood}`),
        info('actor.industry.rank', st.top.length > 0 ? `You rank ${st.rank} of ${st.of} among working ${actorWord(g).toLowerCase()}s.` : 'There are no working rivals yet.'),
        ...(h > 0 ? [info('actor.industry.hot', hot.length > 0 ? `Hot this year: ${list(hot)}.` : 'No type is hot this year.'), info('actor.industry.clash', next.length > 0 ? `Next year's calendar: big openings in ${list(next)}.` : "Next year's calendar has no big opening.")] : []),
        ...eraLines(g, industry).map((text, i) => info(`actor.industry.era.${i}`, text)),
      ]
    },
  }
}

// ---------------------------------------------------------------------------
// Press, scandal, range

function pressMenu(): MenuGroup {
  return {
    type: 'menu',
    id: 'actor.press',
    label: 'Press Agent',
    emoji: PRESS,
    visible: (g) => !!actorJob(g) || !!view(g).team.press,
    subtitle: (g) => {
      const press = view(g).team.press
      return press ? `${press.firm}, quality ${press.quality}` : 'No press agent'
    },
    header: () => 'A press agent lifts buzz on every release and cools a scandal faster. They bill a retainer every year.',
    children: (g) => {
      const s = view(g)
      return [
        info('actor.press.info', s.team.press ? `${s.team.press.firm}, quality ${s.team.press.quality}. Retainer ${money(priceOf(g, s, 0.05, 1_000))} a year.` : 'You have no press agent.'),
        row(
          {
            id: 'actor.press.hire',
            label: 'Hire a Press Agent',
            emoji: PRESS,
            subtitle: (gg) => `Retainer ${money(priceOf(gg, view(gg), 0.05, 1_000))} a year`,
            gate: (gg, ss) => {
              if (ss.team.press) return 'You already have a press agent.'
              const young = blocked(gg, 16)
              if (young) return young
              return afford(gg, priceOf(gg, ss, 0.05, 1_000)) ? null : "You can't afford the retainer right now."
            },
            run: (c) => hirePress(c),
          },
          (gg) => !view(gg).team.press,
        ),
        row(
          {
            id: 'actor.press.fire',
            label: 'Let the Press Agent Go',
            emoji: '\u{1F525}',
            subtitle: 'Nothing is owed',
            gate: (_gg, ss) => (ss.team.press ? null : "You don't have a press agent."),
            confirm: () => 'Let your press agent go?',
            run: (c) => firePress(c),
          },
          (gg) => !!view(gg).team.press,
        ),
      ]
    },
  }
}

function scandalMenu(): MenuGroup {
  return {
    type: 'menu',
    id: 'actor.scandal',
    label: 'Scandal',
    emoji: '\u{1F4F0}',
    visible: (g) => view(g).scandal > 0,
    subtitle: (g) => `Scandal ${view(g).scandal} of 100`,
    header: () => 'A scandal costs fees and, past 50, fame. It fades 10 points a year on its own.',
    children: () => [
      row({
        id: 'actor.apologize',
        label: 'Apologize',
        emoji: '\u{1F64F}',
        subtitle: 'Free. Scandal -25, fame -1. Once a year.',
        gate: (g, s) => (s.scandal <= 0 ? "There's nothing to apologize for." : yearActionsUsed(g, 'actor.apologize') >= 1 ? "You've already apologized this year." : null),
        run: (c) => apologize(c),
      }),
      row({
        id: 'actor.crisisPr',
        label: 'Crisis PR',
        emoji: PRESS,
        subtitle: (g) => `Cost ${money(priceOf(g, view(g), 0.1, 1_000))}. Scandal -40. Once a year.`,
        gate: (g, s) => {
          if (s.scandal <= 0) return 'There is no scandal to repair.'
          if (yearActionsUsed(g, 'actor.crisisPr') >= 1) return 'The crisis team already worked on this one.'
          return afford(g, priceOf(g, s, 0.1, 1_000)) ? null : "You can't afford a crisis team right now."
        },
        run: (c) => crisisPr(c),
      }),
      row({
        id: 'actor.layLow',
        label: 'Lie Low',
        emoji: '\u{1F576}\u{FE0F}',
        subtitle: 'No auditions this year. Scandal -30.',
        gate: (g, s) => {
          if (s.scandal <= 0) return 'You have nothing to hide from.'
          return yearActionsUsed(g, 'actor.layLow') >= 1 || (s.layLow > 0 && s.layLow >= g.year) ? "You're already laying low this year." : null
        },
        run: (c) => layLow(c),
      }),
    ],
  }
}

const cap1 = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1)

function rangeMenu(): MenuGroup {
  return {
    type: 'menu',
    id: 'actor.range',
    label: 'Range Work',
    emoji: '\u{1F3AD}',
    visible: (g) => {
      const s = view(g)
      return !!s.team.manager || TYPE_IDS.some((t) => s.type[t] > 0)
    },
    subtitle: (g) => {
      const s = view(g)
      const typed = TYPE_IDS.filter((t) => s.type[t] >= 50)
      return typed.length > 0 ? `Typecast: ${list(typed)}` : 'Not typecast'
    },
    header: () => 'Typecast at 50 or more pays 20% more in that type and weighs on every other. Your manager can set up work against type.',
    children: (g) => {
      const s = view(g)
      const typed = TYPE_IDS.filter((t) => s.type[t] > 0)
      return [
        info('actor.range.info', typed.length > 0 ? `Typecast: ${typed.map((t) => `${t} ${s.type[t]}`).join(', ')}.` : "You aren't typecast in anything."),
        ...TYPE_IDS.map((t) =>
          row(
            {
              id: `actor.range.${t}`,
              label: `Break the ${cap1(t)} Label`,
              emoji: '\u{1F3AD}',
              subtitle: (gg) => `Cost ${money(priceOf(gg, view(gg), 0.08, 1_500))}. ${cap1(t)} -15. Once a year.`,
              gate: (gg, ss) => {
                const young = blocked(gg, 16)
                if (young) return young
                if (!ss.team.manager) return 'Range work needs a manager to set it up.'
                if (ss.type[t] <= 0) return "You aren't typecast in that type."
                if (yearActionsUsed(gg, 'actor.range') >= 1) return "You've already worked on your range this year."
                return afford(gg, priceOf(gg, ss, 0.08, 1_500)) ? null : "You can't afford the coaching right now."
              },
              run: (c) => rangeWork(c, t),
            },
            (gg) => view(gg).type[t] > 0,
          ),
        ),
      ]
    },
  }
}

// ---------------------------------------------------------------------------
// Likeness

function likenessMenu(): MenuGroup {
  return {
    type: 'menu',
    id: 'actor.likeness',
    label: 'Likeness and Residuals',
    emoji: REEL,
    subtitle: (g) => {
      const n = trustsOf(g).length
      return n > 0 ? `${n} trust${n === 1 ? '' : 's'} held` : 'No trust yet'
    },
    header: () => 'A trust holds your credits and your name. It keeps paying residuals and licensing, and an heir can collect it.',
    children: (g) => [
      row({
        id: 'actor.trust.create',
        label: 'Create a Likeness Trust',
        emoji: REEL,
        subtitle: (gg) => {
          const fee = trustFee(gg, view(gg))
          return fee > 0 ? `Setup fee ${money(fee)}` : 'The setup fee is waived'
        },
        gate: (gg, s) => trustBlock(gg, s),
        confirm: () => 'Move your credits into a trust? Their residuals will pay through it from now on.',
        run: (c) => void createTrust(c),
      }),
      ...trustsOf(g).map(
        (a): MenuGroup => ({
          type: 'menu',
          id: `actor.likeness.${a.id}`,
          label: a.name,
          emoji: a.emoji,
          children: (gg) => {
            const now = gg.assets.find((x) => x.id === a.id)
            return now ? (actorLikenessNodes(gg, now) ?? []) : []
          },
        }),
      ),
    ],
  }
}

// ---------------------------------------------------------------------------
// Stunt, retire, quit

const refuse = (c: CareerCtx<ActorState>, title: string, text: string, emoji = FILM): void => void careerSay(c, title, text, emoji)

const firstShoot = (s: ActorState): Proj | undefined => s.pipeline.find((p) => p.stage === 'shoot')

/** Once a year, at the first film or series you are shooting: it works about half the time and a crazy streak helps. */
function stunt(c: CareerCtx<ActorState>): void {
  const { g, s } = c
  adoptLegacy(g, s)
  const p = firstShoot(s)
  if (!p) return refuse(c, 'Publicity Stunt', "You aren't shooting anything to promote.", PRESS)
  if (!useYearAction(g, 'actor.stunt', 1)) return refuse(c, 'Publicity Stunt', 'The studio asked you to please stop doing publicity stunts.', PRESS)
  if (chance(g, 0.55 + fin(g.character.hidden.craziness) / 400)) {
    p.buzz = Math.min(100, p.buzz + randInt(g, 8, 15))
    addFame(g, randInt(g, 1, 3))
    careerLog(c, `I pulled a publicity stunt for "${p.title}".`, 'good')
    careerSay(c, 'Publicity Stunt', `Your stunt for "${p.title}" was on every front page.`, PRESS, 'good')
  } else {
    p.buzz = Math.max(0, p.buzz - 5)
    addHidden(g, 'notoriety', 2)
    careerLog(c, `My publicity stunt for "${p.title}" backfired.`, 'bad')
    careerSay(c, 'Publicity Stunt', `Critics called your stunt for "${p.title}" desperate.`, PRESS, 'bad')
  }
}

/** Why you can't retire right now, or null: a job, 55 or ten credits, and no shoot under way. */
function retireBlock(g: GameState, s: ActorState): string | null {
  if (!actorJob(g)) return "You aren't working as an actor."
  const young = blocked(g, 0)
  if (young) return young
  if (g.character.age < 55 && s.credits.length < 10) return 'You can retire at 55, or after ten credits.'
  if (s.pipeline.some(live)) return "You can't retire in the middle of a shoot."
  return null
}

function retire(c: CareerCtx<ActorState>): void {
  const { g, s } = c
  const why = retireBlock(g, s)
  if (why) return refuse(c, 'Retire', why, '\u{1F305}')
  adoptLegacy(g, s)
  s.done = cap([...s.done.filter((x) => x !== 'retired'), 'retired'], KIT_LIMITS.done)
  leave(g, 'retired')
  careerLog(c, 'I retired from acting.')
  const trust = g.assets.some((a) => likenessOf(a)?.author === g.character.id)
  const note = trust ? 'Your likeness trust keeps paying.' : s.done.includes('trust') ? '' : 'A likeness trust is free to set up now.'
  careerSay(c, 'Retired from Acting', `You retired after ${s.credits.length} credit${s.credits.length === 1 ? '' : 's'}. ${note}`.trim(), '\u{1F305}')
}

function removeCostars(g: GameState, p: Proj): void {
  if (p.costars.length > 0) g.people = g.people.filter((x) => !(p.costars.includes(x.id) && x.relation === 'coworker'))
  p.costars = []
}

/** Quit: every shoot and offer is dropped (reputation -15 each, -30 at most, fame -3), the co-stars go home. A film in post still opens. */
function quit(c: CareerCtx<ActorState>): void {
  const { g, s } = c
  const job = actorJob(g)
  if (!job) return refuse(c, 'Quit Acting', "You aren't working as an actor.", '\u{1F6AA}')
  adoptLegacy(g, s)
  const dropped = s.pipeline.filter(live)
  const first = dropped[0]
  if (dropped.length > 0) {
    s.rep = clamp100(s.rep - Math.min(30, 15 * dropped.length))
    addFame(g, -3)
    for (const p of dropped) removeCostars(g, p)
    s.pipeline = s.pipeline.filter((p) => !live(p))
  }
  if (job.title === 'Extra') job.title = actorWord(g)
  leave(g, 'quit')
  careerLog(c, 'I quit acting.')
  careerSay(c, 'Retired from Acting', first ? `You walked off "${first.title}" and quit acting. The tabloids called it a meltdown.` : 'You hung up your headshots and quit acting.', '\u{1F6AA}')
}

// ---------------------------------------------------------------------------
// The whole set

interface Nodes {
  pipeline: MenuGroup
  industry: MenuGroup
  press: MenuGroup
  scandal: MenuGroup
  range: MenuGroup
  likeness: MenuGroup
  stunt: MenuAction
  retire: MenuAction
  quit: MenuAction
}
let nodes: Nodes | null = null

function build(): Nodes {
  return {
    pipeline: pipelineMenu(),
    industry: industryMenu(),
    press: pressMenu(),
    scandal: scandalMenu(),
    range: rangeMenu(),
    likeness: likenessMenu(),
    stunt: row(
      {
        id: 'actor.stunt',
        label: 'Publicity Stunt',
        emoji: PRESS,
        subtitle: 'Promote what you are shooting',
        gate: (g, s) => {
          if (!firstShoot(s)) return "You aren't shooting anything to promote."
          return yearActionsUsed(g, 'actor.stunt') >= 1 ? 'The studio asked you to please stop doing publicity stunts.' : null
        },
        run: (c) => stunt(c),
      },
      (g) => !!actorJob(g) && migrated(g) && !!firstShoot(view(g)),
    ),
    retire: row(
      {
        id: 'actor.retire',
        label: 'Retire',
        emoji: '\u{1F305}',
        subtitle: 'At 55, or after ten credits',
        gate: (g, s) => retireBlock(g, s),
        confirm: () => 'Retire from acting? Your credits and your likeness stay yours.',
        run: (c) => retire(c),
      },
      (g) => !!actorJob(g),
    ),
    quit: row(
      {
        id: 'actor.quit',
        label: 'Quit Acting',
        emoji: '\u{1F6AA}',
        subtitle: 'Walk away from show business',
        gate: (g) => (actorJob(g) ? null : "You aren't working as an actor."),
        confirm: (g) => {
          const shoot = view(g).pipeline.find(live)
          return shoot ? `Walk off "${shoot.title}" and quit acting? The studio won't be happy.` : 'Quit acting?'
        },
        run: (c) => quit(c),
      },
      (g) => !!actorJob(g) && migrated(g),
    ),
  }
}

/**
 * The actor's menus, in the order a player wants them: the team, the projects, the industry, the press
 * agent, the scandal levers, range work, the likeness trust, and the exits. Hidden groups carry a
 * `visible`, so a menu shows what the life has. The legacy ids `actor.agent.hire`, `actor.agent.fire`,
 * `actor.stunt` and `actor.quit` stay: the stunt and quit rows here replace the legacy ones (actor.ts leaves
 * them out) once the sim owns the life.
 */
export function actorMenus(g: GameState): MenuNode[] {
  const n = (nodes ??= build())
  // The stunt and quit rows take the legacy ids once the sim owns the life; before that actor.ts keeps its own, so an id never shows twice.
  return [...teamRows(g), n.pipeline, n.industry, n.press, n.scandal, n.range, n.likeness, ...(migrated(g) ? [n.stunt] : []), n.retire, ...(migrated(g) ? [n.quit] : [])]
}
